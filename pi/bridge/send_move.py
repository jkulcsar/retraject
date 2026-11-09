#!/usr/bin/env python3
"""Stream a test move to the bridge, then compare executed with planned steps.

Each move follows the quintic profile (10τ³ − 15τ⁴ + 6τ⁵): it eases in and
out, like retraject's own trajectories. Examples:

    python3 send_move.py --uri ws://localhost:8765 --steps 3200 --seconds 2
    python3 send_move.py --axes 0,1,2 --steps 1600 --seconds 3 --back
    python3 send_move.py --dry --steps 3200 --seconds 2        # plan only

Ctrl-C sends ESTOP.
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from dataclasses import dataclass

import protocol as P

MAX_DT = 0xFFFF


@dataclass
class Plan:
    records: list[tuple[int, int, int]]
    pulses: list[int]
    net: list[int]
    duration_us: int
    shifted: int  # records moved later to respect the minimum spacing


def quintic_times(steps: int, seconds: float) -> list[float]:
    """Times (s) at which step k = 1..steps falls, for a quintic move of `steps` steps."""
    def s(tau: float) -> float:
        return tau * tau * tau * (10 - 15 * tau + 6 * tau * tau)
    times, lo = [], 0.0
    for k in range(1, steps + 1):
        target = (k - 0.5) / steps
        a, b = lo, 1.0
        for _ in range(48):
            m = (a + b) / 2
            if s(m) < target:
                a = m
            else:
                b = m
        lo = b
        times.append(b * seconds)
    return times


def plan_moves(axes: list[int], steps: int, seconds: float, back: bool, pause: float,
               n_axes: int, min_dt_us: int) -> Plan:
    """Merge per-axis step times into one record stream."""
    events: dict[int, list[int]] = {}  # time_us -> [step_mask, dir_mask]
    one_way = quintic_times(steps, seconds)
    legs = [(0.0, True)]
    if back:
        legs.append((seconds + pause, False))
    pulses, net = [0] * n_axes, [0] * n_axes
    for offset, forward in legs:
        for t in one_way:
            tu = round((offset + t) * 1e6) + min_dt_us  # first record must be ≥ min_dt after start
            ev = events.setdefault(tu, [0, 0])
            for a in axes:
                ev[0] |= 1 << a
                if forward:
                    ev[1] |= 1 << a
        for a in axes:
            pulses[a] += steps
            net[a] += steps if forward else -steps
    records: list[tuple[int, int, int]] = []
    prev, shifted = 0, 0
    for tu in sorted(events):
        mask, dirs = events[tu]
        if tu - prev < min_dt_us:
            tu, shifted = prev + min_dt_us, shifted + 1
        gap = tu - prev
        while gap > MAX_DT:  # keep-alive records with no steps
            piece = MAX_DT if gap - MAX_DT >= min_dt_us else gap - min_dt_us
            records.append((piece, 0, 0))
            gap -= piece
        records.append((gap, mask, dirs))
        prev = tu
    return Plan(records, pulses, net, prev, shifted)


async def stream(uri: str, plan: Plan) -> int:
    try:
        from websockets.asyncio.client import connect
    except ImportError:  # pragma: no cover - older websockets
        from websockets import connect  # type: ignore
    async with connect(uri, max_size=1 << 20) as ws:
        first = await ws.recv()
        if first[0] == P.ERROR:
            code, msg = P.parse_error(first)
            print(f"bridge refused: {msg} (code {code})")
            return 2
        hello = P.parse_hello(first)
        print(f"bridge: protocol {hello.version}, {hello.axes} axes, chunks of {hello.max_records} records, "
              f"buffer {hello.capacity_chunks} chunks, min dt {hello.min_dt_us} µs")
        n = hello.max_records
        chunks = [plan.records[i:i + n] for i in range(0, len(plan.records), n)]
        sent = consumed = 0
        window = max(1, hello.capacity_chunks - 1)

        async def top_up() -> None:
            nonlocal sent
            while sent < len(chunks) and sent - consumed < window:
                await ws.send(P.chunk(sent, chunks[sent]))
                sent += 1
            if sent == len(chunks):
                await ws.send(P.simple(P.STOP))

        try:
            await top_up()
            await ws.send(P.simple(P.START))
            stop_sent = sent == len(chunks)
            while True:
                frame = await ws.recv()
                kind = frame[0]
                if kind == P.ACK:
                    consumed = P.parse_ack(frame)
                    if not stop_sent:
                        await top_up()
                        stop_sent = sent == len(chunks)
                elif kind == P.ERROR:
                    code, msg = P.parse_error(frame)
                    print(f"bridge error {code}: {msg}")
                elif kind == P.DONE:
                    return report(P.parse_done(frame), plan)
        except asyncio.CancelledError:
            await ws.send(P.simple(P.ESTOP))
            print("ESTOP sent")
            raise


def report(done: P.Done, plan: Plan) -> int:
    print(f"DONE: {P.STATUS_NAMES.get(done.status, done.status)}, {done.records} records, "
          f"{done.elapsed_us / 1e6:.3f} s (planned {plan.duration_us / 1e6:.3f} s)"
          + ("" if done.exact else ", position not exact"))
    ok = done.status == P.COMPLETED
    for a, (p, nt) in enumerate(zip(done.pulses, done.net)):
        match = p == plan.pulses[a] and nt == plan.net[a]
        ok = ok and match
        print(f"  axis {a}: {p} pulses (planned {plan.pulses[a]}), net {nt:+d} (planned {plan.net[a]:+d})"
              f"  {'MATCH' if match else 'MISMATCH'}")
    return 0 if ok else 1


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--uri", default="ws://localhost:8765")
    ap.add_argument("--axes", default="0", help="comma-separated axes moving together, e.g. 0,1,2")
    ap.add_argument("--n-axes", type=int, default=3, help="number of axes the bridge drives")
    ap.add_argument("--steps", type=int, default=3200, help="steps per leg (3200 = one turn at 1/16)")
    ap.add_argument("--seconds", type=float, default=2.0, help="duration of one leg")
    ap.add_argument("--back", action="store_true", help="return to the start after a pause")
    ap.add_argument("--pause", type=float, default=0.5, help="pause before the way back (s)")
    ap.add_argument("--min-dt", type=int, default=30, help="bridge's minimum record spacing (µs)")
    ap.add_argument("--dry", action="store_true", help="plan only, do not connect")
    args = ap.parse_args()
    axes = [int(a) for a in args.axes.split(",")]
    plan = plan_moves(axes, args.steps, args.seconds, args.back, args.pause, args.n_axes, args.min_dt)
    peak = 1.875 * args.steps / args.seconds
    print(f"plan: {len(plan.records)} records, {plan.duration_us / 1e6:.3f} s, peak {peak:.0f} steps/s per axis"
          + (f", {plan.shifted} records shifted to keep {args.min_dt} µs spacing" if plan.shifted else ""))
    if args.dry:
        return
    try:
        sys.exit(asyncio.run(stream(args.uri, plan)))
    except KeyboardInterrupt:
        sys.exit(130)


if __name__ == "__main__":
    main()
