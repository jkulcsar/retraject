"""Summarise a stress3 run: per Pi (and its adapter), plus the continuous pings."""
import glob, json, os, re, statistics as st, sys

S = os.path.dirname(os.path.abspath(__file__))
D = os.path.join(S, sys.argv[1] if len(sys.argv) > 1 else "stress3")
recs = [json.loads(l) for l in open(os.path.join(D, "log.jsonl"))]


def rng(xs): return f"{min(xs):.1f}–{max(xs):.1f}, median {st.median(xs):.1f}" if xs else "-"


print(f"{len(recs)} rounds, {recs[0].get('t')} → {recs[-1].get('t')}\n")
for pi in sorted({r["pi"] for r in recs}):
    rs = [r for r in recs if r["pi"] == pi]
    ok = [r for r in rs if "error" not in r]
    ad = sorted({r.get("adapter") for r in ok}) or ["?"]
    print(f"== {pi} ({', '.join(ad)}): {len(rs)} rounds, {len(rs) - len(ok)} failed")
    for r in rs:
        if "error" in r: print(f"   round #{r['n']} failed: {r['error']}")
    pr = [r["ping_pi_router"] for r in ok if r.get("ping_pi_router", {}).get("replies")]
    pm = [r["ping_mac_pi"] for r in ok if r.get("ping_mac_pi", {}).get("replies")]
    if pr:
        sent = sum(p.get("sent", 300) for p in pr); got = sum(p["replies"] for p in pr)
        print(f"   Pi→router ping: median {st.median([p['median'] for p in pr]):.1f} ms, worst {max(p['max'] for p in pr):.0f} ms, "
              f"over 500 ms {sum(p['over500'] for p in pr)}, over 100 ms {sum(p['over100'] for p in pr)}, of {got} ({sent - got} lost)")
    if pm:
        print(f"   Mac→Pi ping:    median {st.median([p['median'] for p in pm]):.1f} ms, worst {max(p['max'] for p in pm):.0f} ms, "
              f"over 500 ms {sum(p['over500'] for p in pm)}")
    for key, name in (("stream100", "drawing speed"), ("stream50", "double speed")):
        ss = [r[key] for r in ok if "underruns" in r.get(key, {})]
        if ss:
            print(f"   bridge sim, {name}: {sum(s['underruns'] for s in ss)} underruns in {sum(1 for s in ss if s['underruns'])}"
                  f"/{len(ss)} runs, longest gap {max(s['starved_max_ms'] for s in ss):.0f} ms")
        errs = [r[key]["error"] for r in ok if "error" in r.get(key, {})]
        if errs: print(f"   bridge sim, {name}: {len(errs)} runs broke off: {errs[:2]}")
    bk = [r["bulk"] for r in ok if "up_mbit" in r.get("bulk", {})]
    if bk: print(f"   bulk Mac→Pi {rng([b['up_mbit'] for b in bk])} Mbit/s; Pi→Mac {rng([b['down_mbit'] for b in bk])}")
    cs = [r for r in ok if "cold_start_s" in r]
    if cs:
        good = [r["cold_start_s"] for r in cs if r["cold_start_s"] is not None]
        print(f"   cold starts: {len(good)}/{len(cs)} back within 4 min ({rng(good)} s)")
    wd = [l for r in rs for l in r.get("watchdog", []) if "re-init" in l]
    print(f"   watchdog restarts: {len(wd)}" + (f" — {wd[:3]}" if wd else ""))
    tw = [r["test_wait_s"] for r in ok if r.get("test_wait_s", 0) > 5]
    if tw: print(f"   rounds that had to wait for WiFi first: {len(tw)} ({rng(tw)} s)")
    sig = [r["after"]["signal_dbm"] for r in ok if "signal_dbm" in r.get("after", {})]
    temps = [float(r["after"]["temp"].split("'")[0]) for r in ok if "temp" in r.get("after", {})]
    th = sorted({r["after"]["throttled"] for r in ok if "throttled" in r.get("after", {})})
    aps = [r["after"]["ap_lost_total"] for r in ok if "ap_lost_total" in r.get("after", {})]
    if sig: print(f"   signal {min(sig):.0f} to {max(sig):.0f} dBm; Pi {min(temps):.1f}–{max(temps):.1f} °C; power flags {th}; "
                  f"'AP lost' events {aps[-1] - aps[0] if aps else '?'}")
    print()

print("Continuous pings from the Mac, once a second:")
for f in sorted(glob.glob(os.path.join(D, "mac-ping-*.txt"))):
    lines = open(f).read().splitlines()
    ok_t, outage, longest, slow = 0, 0, 0, 0
    for l in lines:
        m = re.search(r"time=([0-9.]+)", l)
        if m:
            ok_t += 1; outage = 0
            if float(m.group(1)) > 500: slow += 1
        elif "timeout" in l:
            outage += 1; longest = max(longest, outage)
    lost = sum(1 for l in lines if "timeout" in l)
    name = os.path.basename(f)[9:-4]
    print(f"   {name}: {ok_t} replies, {lost} lost, longest gap {longest} s, {slow} over 500 ms")
