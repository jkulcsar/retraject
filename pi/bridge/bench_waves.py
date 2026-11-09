#!/usr/bin/env python3
"""How fast can this machine turn step records into pigpio waves?

The bridge must build each wave faster than the previous one plays. This
streams a demanding CoreXY-like load (both motors stepping on every record,
direction flips every few mm) and reports build time as a share of play time.

    python3 bench_waves.py                  # builder only, no pigpio needed
    python3 bench_waves.py --pigpio         # also upload to pigpiod (no output: waves are never sent)
    python3 bench_waves.py --speed 150      # mm/s at 80 steps/mm

Below about 50 % there is comfortable headroom; near 100 % the bridge underruns.
"""
from __future__ import annotations

import argparse
import time
from array import array

from waves import Pins, Timing, WaveBuilder


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--speed", type=float, default=100.0, help="pen speed in mm/s (80 steps/mm)")
    ap.add_argument("--waves", type=int, default=30)
    ap.add_argument("--max-pulses", type=int, default=3600)
    ap.add_argument("--pigpio", action="store_true", help="include upload to pigpiod and wave create/delete")
    args = ap.parse_args()

    rate = args.speed * 80  # steps/s per motor; a pure X move steps both CoreXY motors
    dt = max(30, round(1e6 / rate))
    flip_every = 400  # direction change every 5 mm
    n = args.waves * args.max_pulses
    records = [(dt, 0b011, 0b011 if (i // flip_every) % 2 else 0b001) for i in range(n)]

    pins = Pins((17, 22, 24), (27, 23, 25))
    b = WaveBuilder(pins, Timing())
    b.add_chunk(0, records)
    b.finish()

    pi = pg = None
    if args.pigpio:
        import pigpio as pg
        pi = pg.pi()
        if not pi.connected:
            raise SystemExit("pigpiod is not running")
        pi.wave_clear()

    build = upload = play = 0.0
    for _ in range(args.waves):
        t0 = time.perf_counter()
        w = b.build(args.max_pulses)
        t1 = time.perf_counter()
        if pi is not None:
            flat: array = w.flat
            pg._u2i(pg._pigpio_command_ext(pi.sl, pg._PI_CMD_WVAG, 0, 0, len(flat) * 4, [flat.tobytes()]))
            wid = pi.wave_create_and_pad(50)
            pi.wave_delete(wid)
        t2 = time.perf_counter()
        build += t1 - t0
        upload += t2 - t1
        play += w.duration_us / 1e6
    if pi is not None:
        pi.wave_clear()
        pi.stop()

    print(f"{args.speed:.0f} mm/s = {rate:.0f} steps/s per motor, one record every {dt} µs")
    print(f"{args.waves} waves of ~{args.max_pulses} pulses, {play / args.waves * 1000:.0f} ms of motion each")
    print(f"build  {build / args.waves * 1000:7.1f} ms per wave  = {build / play * 100:5.1f} % of play time")
    if pi is not None:
        print(f"upload {upload / args.waves * 1000:7.1f} ms per wave  = {upload / play * 100:5.1f} % of play time")
    total = (build + upload) / play * 100
    print(f"total  {total:5.1f} %  -> " + ("comfortable" if total < 50 else "tight" if total < 80 else "too slow"))


if __name__ == "__main__":
    main()
