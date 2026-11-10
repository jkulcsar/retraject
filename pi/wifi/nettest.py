"""Tiny TCP network tests, no installs needed.
Pi:  python3 nettest.py serve 5201
Mac: python3 nettest.py run HOST 5201 SECONDS            bulk both ways
     python3 nettest.py stream HOST 5201 SECONDS PERIOD_MS  bridge-like stream
Modes (first header byte): U = Mac sends to Pi, D = Pi sends to Mac,
S = bridge simulation, Q = stop the server.

The bridge simulation mimics the bridge's flow control: the Mac keeps at
most WINDOW chunks of 4 KB unacknowledged; the Pi uses up one chunk every
PERIOD ms (100 ms is about drawing speed, 1,024 records per chunk) and
acknowledges it. If a chunk is due and none has arrived, the real bridge
would have run dry (an underrun). The real bridge has a little more slack
(its two queued waves), so this is the stricter test."""
import json, select, socket, sys, time

CHUNK = 64 * 1024


def recv_exact(c, n):
    b = b""
    while len(b) < n:
        k = c.recv(n - len(b))
        if not k: raise ConnectionError("closed during header")
        b += k
    return b


def stream_server(c, period_ms, window, chunk):
    period = period_ms / 1000
    have = partial = consumed = 0
    underruns = empties = 0
    starved_total = starved_max = 0.0
    late_max = 0.0
    eof, next_tick, starving_since, last_rx = False, None, None, time.perf_counter()
    while True:
        now = time.perf_counter()
        if eof and have == 0 and starving_since is None: break
        if starving_since and now - starving_since > 30: break  # sender gone
        if not eof and now - last_rx > 60: break
        timeout = 0.5 if next_tick is None or starving_since else max(0.0, next_tick - now)
        r, _, _ = select.select([] if eof else [c], [], [], timeout)
        now = time.perf_counter()
        if r:
            data = c.recv(65536)
            if not data: eof = True
            else:
                last_rx = now
                partial += len(data); have += partial // chunk; partial %= chunk
        if next_tick is None:
            if have >= window or eof: next_tick = now
            continue
        if starving_since is not None:
            if have:
                gap = now - starving_since
                starved_total += gap; starved_max = max(starved_max, gap)
                starving_since = None
                have -= 1; consumed += 1; c.sendall(b"A")
                next_tick = now + period
            continue
        if now >= next_tick:
            late_max = max(late_max, now - next_tick)
            if have:
                have -= 1; consumed += 1; c.sendall(b"A")
                if have == 0 and not eof: empties += 1
                next_tick += period
            elif not eof:
                underruns += 1; starving_since = next_tick
    c.sendall(b"\n" + json.dumps({
        "chunks": consumed, "underruns": underruns,
        "starved_max_ms": round(starved_max * 1000, 1),
        "starved_total_ms": round(starved_total * 1000, 1),
        "empty_after_use": empties, "tick_late_max_ms": round(late_max * 1000, 1),
    }).encode())


def serve(port):
    srv = socket.socket(); srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(("0.0.0.0", port)); srv.listen(1)
    buf, zeros = bytearray(CHUNK), bytes(CHUNK)
    while True:
        c, _ = srv.accept()
        try:
            with c:
                c.settimeout(90)
                hdr = recv_exact(c, 16).decode()
                mode, arg = hdr[0], hdr[1:].strip()
                if mode == "U":
                    n, t0 = 0, None
                    while True:
                        k = c.recv_into(buf)
                        if not k: break
                        if t0 is None: t0 = time.perf_counter()
                        n += k
                    c.sendall(f"{n} {time.perf_counter() - (t0 or time.perf_counter()):.4f}".encode())
                elif mode == "D":
                    end = time.perf_counter() + float(arg)
                    while time.perf_counter() < end:
                        c.sendall(zeros)
                elif mode == "S":
                    p, w, ch = arg.split(",")
                    stream_server(c, float(p), int(w), int(ch))
                elif mode == "Q":
                    return
        except Exception as e:  # a broken test must not kill the server
            print("connection error:", e, flush=True)


def bulk(host, port, secs):
    out = {}
    s = socket.create_connection((host, port), timeout=20); s.settimeout(30)
    s.sendall(f"U{secs:<15}".encode())
    zeros, end = bytes(CHUNK), time.perf_counter() + secs
    while time.perf_counter() < end: s.sendall(zeros)
    s.shutdown(socket.SHUT_WR)
    n, dt = s.recv(64).decode().split(); s.close()
    out["up_mbit"] = round(int(n) * 8 / float(dt) / 1e6, 2)
    s = socket.create_connection((host, port), timeout=20); s.settimeout(30)
    s.sendall(f"D{secs:<15}".encode())
    buf, n, t0 = bytearray(CHUNK), 0, time.perf_counter()
    while True:
        k = s.recv_into(buf)
        if not k: break
        n += k
    out["down_mbit"] = round(n * 8 / (time.perf_counter() - t0) / 1e6, 2); s.close()
    return out


def stream(host, port, secs, period_ms, window=5, chunk=4096):
    s = socket.create_connection((host, port), timeout=20); s.settimeout(30)
    s.sendall(f"S{period_ms},{window},{chunk}".ljust(16).encode())
    payload, inflight, sent, rx = bytes(chunk), 0, 0, b""
    end = time.perf_counter() + secs
    wait_max = 0.0  # longest wait for a credit while sending
    while time.perf_counter() < end:
        if inflight < window:
            s.sendall(payload); inflight += 1; sent += 1; continue
        t0 = time.perf_counter()
        r, _, _ = select.select([s], [], [], 1.0)
        if r:
            data = s.recv(4096)
            if not data: raise ConnectionError("server closed")
            inflight -= data.count(b"A"); rx += data
        wait_max = max(wait_max, time.perf_counter() - t0)
    s.shutdown(socket.SHUT_WR)
    while True:
        data = s.recv(4096)
        if not data: break
        rx += data
    s.close()
    res = json.loads(rx.split(b"\n", 1)[1])
    res.update(sent=sent, period_ms=period_ms, seconds=secs)
    return res


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "serve": serve(int(sys.argv[2]))
    elif cmd == "quit":
        socket.create_connection((sys.argv[2], int(sys.argv[3]))).sendall(b"Q".ljust(16))
    elif cmd == "stream":
        print(stream(sys.argv[2], int(sys.argv[3]), float(sys.argv[4]), float(sys.argv[5])))
    else:
        r = bulk(sys.argv[2], int(sys.argv[3]), float(sys.argv[4]))
        print(f"Mac->Pi {r['up_mbit']:5.1f} Mbit/s   Pi->Mac {r['down_mbit']:5.1f} Mbit/s")
