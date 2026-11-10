"""Side-by-side WiFi test: one Edimax in each Pi, rounds alternating between
the two Pis, both with the WiFi watchdog installed.
  python3 stress3.py MINUTES [quick] [outdir]

Each round on a Pi: pings (Mac -> Pi over WiFi, Pi -> router bound to the
WiFi interface), bridge simulations at drawing speed (100 ms per chunk) and
double speed (50 ms), bulk throughput both ways. Every third round on a Pi
also does a cold start: the adapter is switched off and on at the USB level
(like replugging it) and the time until it answers again is measured.
Throughout, the Mac pings the router and both Pis' WiFi addresses once a
second, which catches dropouts while a Pi sits idle between its rounds."""
import datetime, json, os, re, subprocess, sys, time

S = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, S)
import nettest

minutes = float(sys.argv[1]) if len(sys.argv) > 1 else 125
QUICK = len(sys.argv) > 2 and sys.argv[2] == "quick"
OUT = os.path.join(S, sys.argv[3] if len(sys.argv) > 3 else "stress3"); os.makedirs(OUT, exist_ok=True)
LOG = os.path.join(OUT, "log.jsonl")
PINGS = 20 if QUICK else 300
STREAMS = [(100, 15), (50, 10)] if QUICK else [(100, 120), (50, 60)]
BULK_S = 5 if QUICK else 20
COLD_EVERY = 1 if QUICK else 3
ROUTER, PORT = "192.168.10.1", 5201
NAMES = {"74:da:38:00:5c:70": "Edimax-1", "74:da:38:00:5f:b4": "Edimax-2"}
PIS = [
    {"name": "arm32v6-01", "addrs": ["192.168.10.106", "arm32v6-01.local", "192.168.10.111"], "wifi": "192.168.10.106",
     "macs": ["74:da:38:00:5f:b4", "b8:27:eb:6c:0b:85"]},
    {"name": "arm32v6-02", "addrs": ["192.168.10.110", "192.168.10.107", "arm32v6-02.local"], "wifi": "192.168.10.107",
     "macs": ["74:da:38:00:5c:70", "b8:27:eb:d6:8d:7d"]},
]
RUN = time.strftime("%H%M")


def say(*a):
    line = datetime.datetime.now().strftime("%H:%M:%S ") + " ".join(str(x) for x in a)
    print(line, flush=True)
    with open(os.path.join(OUT, "progress.txt"), "a") as f: f.write(line + "\n")


def sh(cmd, timeout):
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return p.returncode, p.stdout + p.stderr
    except subprocess.TimeoutExpired:
        return 124, "timeout"


def alive(ip): return bool(ip) and sh(["ping", "-c1", "-t2", ip], 6)[0] == 0


def sweep():
    """Ping the whole subnet, then read the Mac's ARP table: {mac: [ips]}."""
    procs = [subprocess.Popen(["ping", "-c1", "-t1", f"192.168.10.{i}"], stdout=subprocess.DEVNULL,
                              stderr=subprocess.DEVNULL) for i in range(2, 255)]
    for x in procs: x.wait()
    table = {}
    for m in re.finditer(r"\((\d+\.\d+\.\d+\.\d+)\) at ([0-9a-f:]+)", sh(["arp", "-an"], 10)[1]):
        mac = ":".join(f"{int(x, 16):02x}" for x in m.group(2).split(":"))
        table.setdefault(mac, []).append(m.group(1))
    return table


def ssh(p, cmd, timeout=60, _swept=False):
    """Run on Pi p over its first answering address (Ethernet first)."""
    opts = ["-o", "BatchMode=yes", "-o", "ConnectTimeout=8", "-o", "ServerAliveInterval=5",
            "-o", "ServerAliveCountMax=3", "-o", f"HostKeyAlias={p['name']}.local"]
    for a in ([p["ctl"]] if p.get("ctl") else []) + [x for x in p["addrs"] if x != p.get("ctl")]:
        rc, out = sh(["ssh"] + opts + [f"user@{a}", cmd], timeout)
        if rc != 255:  # 255 = ssh could not connect
            p["ctl"] = a
            return rc, out
    p["ctl"] = None
    if not _swept:  # the Pi may have moved: look for its adapters by hardware address
        table = sweep()
        found = [ip for mac in p["macs"] for ip in table.get(mac, []) if ip not in p["addrs"]]
        if found:
            say(f"  {p['name']}: looking at {found}")
            p["addrs"] = found + p["addrs"]
            return ssh(p, cmd, timeout, _swept=True)
    return 255, "unreachable"


def adapter(p):
    rc, out = ssh(p, "for d in $(ls /sys/class/net | grep ^wlan); do echo $d $(cat /sys/class/net/$d/address) "
                     "$(basename $(dirname $(readlink -f /sys/class/net/$d/device))) "
                     "$(ip -4 -br addr show $d | awk '{print $3}' | cut -d/ -f1); done; true", 25)
    if rc != 0: return None
    for line in out.splitlines():
        f = line.split()
        if len(f) >= 3:
            return {"iface": f[0], "mac": f[1], "usb": f[2], "ip": f[3] if len(f) > 3 else None}
    return {}


def wait_up(p, seconds):
    t0 = time.time()
    while time.time() - t0 < seconds:
        a = adapter(p)
        if a and a.get("ip") and alive(a["ip"]):
            p["wifi"] = a["ip"]
            return a, round(time.time() - t0, 1)
        time.sleep(2)
    return None, round(time.time() - t0, 1)


def ping_stats(text, sent):
    t = sorted(float(x) for x in re.findall(r"time=([0-9.]+)", text))
    if not t: return {"replies": 0, "sent": sent}
    q = lambda f: t[min(len(t) - 1, int(len(t) * f))]
    return {"replies": len(t), "sent": sent, "median": q(0.5), "p95": q(0.95), "p99": q(0.99), "max": t[-1],
            "over100": sum(x > 100 for x in t), "over500": sum(x > 500 for x in t)}


def wifi_stats(p, iface):
    rc, out = ssh(p, f"awk '/{iface}:/ {{print $4, $9, $10, $11}}' /proc/net/wireless; "
                     "vcgencmd get_throttled; vcgencmd measure_temp; cut -d' ' -f1-3 /proc/loadavg; "
                     "sudo dmesg | grep -c 'Connection to AP' || true", 30)
    l = out.splitlines()
    try:
        sig, retry, misc, beacon = l[0].split()
        return {"signal_dbm": float(sig.rstrip(".")), "retry": int(retry), "misc": int(misc),
                "missed_beacon": int(beacon), "throttled": l[1].split("=")[1],
                "temp": l[2].split("=")[1], "load": l[3], "ap_lost_total": int(l[4])}
    except Exception as e:
        return {"error": f"{e}: {out[:200]}"}


def ensure_server(p, fresh=False):
    if fresh:
        ssh(p, "pkill -f 'nettest.py serve'; true", 20)
    if fresh or ssh(p, "test -f /tmp/nettest.py", 15)[0] != 0:
        opts = ["-q", "-o", "BatchMode=yes", "-o", "ConnectTimeout=8", "-o", f"HostKeyAlias={p['name']}.local"]
        sh(["scp"] + opts + [os.path.join(S, "nettest.py"), f"user@{p['ctl']}:/tmp/nettest.py"], 60)
    ssh(p, "ss -ltn | grep -q ':5201 ' || (setsid nohup python3 /tmp/nettest.py serve 5201 </dev/null >>/tmp/nettest.log 2>&1 &)", 20)
    for _ in range(15):
        if ssh(p, "ss -ltn | grep -q ':5201 '", 15)[0] == 0: return True
        time.sleep(1)
    return False


def round_(n, p, k):
    start = datetime.datetime.now()
    rec = {"n": n, "t": start.isoformat(timespec="seconds"), "pi": p["name"], "mode": f"in {p['name']}"}
    a, rec["test_wait_s"] = wait_up(p, 240)
    if not a:
        rec["adapter"] = "?"; rec["error"] = "WiFi not up after 4 min"
        rec["reachable"] = p.get("ctl") is not None
        return rec
    rec.update(adapter=NAMES.get(a["mac"], a["mac"]), iface=a["iface"], ip=a["ip"], ctl=p["ctl"])
    if not ensure_server(p): rec["error"] = "server not listening"; return rec
    rec["before"] = wifi_stats(p, a["iface"])
    ssh(p, f"nohup ping -I {a['iface']} -c {PINGS} -i 0.2 {ROUTER} > /tmp/pr.txt 2>&1 &", 20)
    rc, out = sh(["ping", "-c", str(PINGS), "-i", "0.2", a["ip"]], PINGS * 0.2 + 60)
    rec["ping_mac_pi"] = ping_stats(out, PINGS)
    rec["ping_pi_router"] = ping_stats(ssh(p, "cat /tmp/pr.txt", 30)[1], PINGS)
    for period, secs in STREAMS:
        try: rec[f"stream{period}"] = nettest.stream(a["ip"], PORT, secs, period)
        except Exception as e: rec[f"stream{period}"] = {"error": repr(e)}
    try: rec["bulk"] = nettest.bulk(a["ip"], PORT, BULK_S)
    except Exception as e: rec["bulk"] = {"error": repr(e)}
    rec["after"] = wifi_stats(p, a["iface"])

    if k % COLD_EVERY == 0:
        path = f"/sys/bus/usb/devices/{a['usb']}/authorized"
        rc, out = ssh(p, f"sudo systemd-run --quiet --unit=cold-{RUN}-{n} sh -c 'echo 0 > {path}; sleep 2; echo 1 > {path}'", 30)
        time.sleep(3)
        back, waited = wait_up(p, 240)
        rec["cold_start_s"] = waited if back else None
    since = start.strftime("%Y-%m-%d %H:%M:%S")
    _, out = ssh(p, f"sudo journalctl -t wifi-watchdog --since '{since}' --no-pager -o cat | grep -E 're-init|again' || true", 30)
    rec["watchdog"] = [l for l in out.strip().splitlines() if l]
    return rec


def main():
    deadline = time.time() + minutes * 60
    for p in PIS:
        if adapter(p) is None: say(f"{p['name']} unreachable at start"); return 1
        ensure_server(p, fresh=True)
    pings = [subprocess.Popen(["ping", "--apple-time", "-i", "1", ip],
                              stdout=open(os.path.join(OUT, f"mac-ping-{name}.txt"), "w"), stderr=subprocess.STDOUT)
             for name, ip in [("router", ROUTER)] + [(p["name"], p["wifi"]) for p in PIS]]
    say(f"start: {minutes} min, quick={QUICK}, run {RUN}")
    n, count, down_since = 0, {p["name"]: 0 for p in PIS}, None
    try:
        while time.time() < deadline:
            p = PIS[n % 2]; n += 1; count[p["name"]] += 1
            try:
                rec = round_(n, p, count[p["name"]])
            except Exception as e:
                rec = {"n": n, "pi": p["name"], "mode": f"in {p['name']}", "adapter": "?", "error": repr(e)}
            with open(LOG, "a") as f: f.write(json.dumps(rec) + "\n")
            s1, s5, b = rec.get("stream100", {}), rec.get("stream50", {}), rec.get("bulk", {})
            say(f"#{n} {p['name']} {rec.get('adapter')}: ping max {rec.get('ping_pi_router', {}).get('max')} ms, "
                f"underruns {s1.get('underruns')}/{s5.get('underruns')}, bulk {b.get('up_mbit')}/{b.get('down_mbit')}, "
                f"cold start {rec.get('cold_start_s', '-')} s, watchdog {len(rec.get('watchdog', []))}"
                + (f", ERROR {rec['error']}" if "error" in rec else ""))
            if all(adapter(q) is None for q in PIS):
                down_since = down_since or time.time()
                if time.time() - down_since > 25 * 60: say("both Pis unreachable for 25 min, stopping"); break
                time.sleep(30)
            else:
                down_since = None
    finally:
        for x in pings: x.terminate()
        for p in PIS:
            ssh(p, "pkill -f 'nettest.py serve'; rm -f /tmp/pr.txt; true", 20)
        say("done")
    return 0


if __name__ == "__main__":
    sys.exit(main())
