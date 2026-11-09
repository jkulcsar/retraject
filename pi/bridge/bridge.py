#!/usr/bin/env python3
"""retraject stepper bridge: step records over WebSocket in, pigpio DMA waves out.

The host (the browser, or send_move.py) computes every step's time; this
service only replays them with hardware timing. See README.md and PROTOCOL.md.

    python3 bridge.py --config /etc/retraject-bridge.toml
    python3 bridge.py --fake          # no Pi: simulated pigpio, for testing
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import signal
import sys
import time
import tomllib
from array import array

try:
    from websockets.asyncio.server import serve  # websockets >= 13
except ImportError:  # pragma: no cover - older websockets
    from websockets import serve  # type: ignore
from websockets.exceptions import ConnectionClosed

import protocol as P
from waves import Pins, Timing, Wave, WaveBuilder

log = logging.getLogger("bridge")

DEFAULTS = {
    "server": {"host": "0.0.0.0", "port": 8765},
    "pins": {"step": [17, 22, 24], "dir": [27, 23, 25], "enable": 5, "invert_dir": [False, False, False]},
    "timing": {"dir_lead_us": 10, "step_high_us": 10, "step_low_min_us": 10},
    "buffer": {"max_records_per_chunk": 1024, "capacity_chunks": 6, "max_pulses_per_wave": 3600,
               "max_wave_ms": 500, "wave_slot_percent": 50},
    "behaviour": {"disable_when_idle": True, "poll_ms": 10},
}


def load_config(path: str | None) -> dict:
    cfg = {section: dict(values) for section, values in DEFAULTS.items()}
    if path:
        with open(path, "rb") as f:
            user = tomllib.load(f)
        for section, values in user.items():
            cfg.setdefault(section, {}).update(values)
    return cfg


class Executor:
    """Everything that touches pigpio."""

    def __init__(self, pi, pg, pins: Pins, enable_gpio: int, slot_percent: int):
        self.pi, self.pg, self.pins = pi, pg, pins
        self.enable_gpio = enable_gpio
        self.slot_percent = slot_percent
        for g in (*pins.step, *pins.dir):
            pi.set_mode(g, pg.OUTPUT)
            pi.write(g, 0)
        if enable_gpio >= 0:
            pi.set_mode(enable_gpio, pg.OUTPUT)
            pi.write(enable_gpio, 1)  # active low: drivers off
        pi.wave_clear()
        self.fast_add = self._probe_fast_add()
        log.info("pulse upload: %s", "packed buffer" if self.fast_add else "pigpio wave_add_generic")

    def _add_packed(self, flat: array) -> int:
        pg = self.pg
        return pg._u2i(pg._pigpio_command_ext(self.pi.sl, pg._PI_CMD_WVAG, 0, 0, len(flat) * 4, [flat.tobytes()]))

    def _probe_fast_add(self) -> bool:
        """pigpio's wave_add_generic packs pulses one by one, which is slow on a Pi 1. Its own
        socket call takes the packed buffer directly; use it if a one-pulse probe works."""
        if array("I").itemsize != 4 or not all(
                hasattr(self.pg, name) for name in ("_pigpio_command_ext", "_PI_CMD_WVAG", "_u2i")):
            return False
        try:
            ok = self._add_packed(array("I", (0, 0, 100))) == 1
        except Exception as err:  # noqa: BLE001
            log.warning("packed pulse upload failed (%s); using wave_add_generic", err)
            ok = False
        self.pi.wave_clear()
        return ok

    def enable(self, on: bool) -> None:
        if self.enable_gpio >= 0:
            self.pi.write(self.enable_gpio, 0 if on else 1)

    def submit(self, wave: Wave) -> None:
        if self.fast_add:
            self._add_packed(wave.flat)
        else:
            self.pi.wave_add_generic([self.pg.pulse(on, off, delay) for on, off, delay in wave.pulses])
        wid = self.pi.wave_create_and_pad(self.slot_percent)
        if wid < 0:
            raise RuntimeError(f"pigpio could not create a wave (error {wid})")
        sent = self.pi.wave_send_using_mode(wid, self.pg.WAVE_MODE_ONE_SHOT_SYNC)
        if sent < 0:
            raise RuntimeError(f"pigpio could not send wave {wid} (error {sent})")
        wave.wid = wid

    def tx_at(self) -> int:
        return self.pi.wave_tx_at()

    def busy(self) -> bool:
        return bool(self.pi.wave_tx_busy())

    def delete(self, wid: int) -> None:
        self.pi.wave_delete(wid)

    def halt(self) -> None:
        """Stop at once: no wave, every step line low."""
        self.pi.wave_tx_stop()
        for g in self.pins.step:
            self.pi.write(g, 0)
        self.pi.wave_clear()


class Run:
    """State of one run: from the first CHUNK or START to DONE."""

    def __init__(self, pins: Pins, timing: Timing):
        self.builder = WaveBuilder(pins, timing)
        self.expected_seq = 0
        self.received = 0
        self.consumed = 0
        self.started = False
        self.finished = False
        self.any_submitted = False
        self.active: list[Wave] = []
        self.pulses = [0] * pins.axes
        self.net = [0] * pins.axes
        self.records = 0
        self.elapsed_us = 0
        self.worst_load = 0.0  # build time / play time of the slowest wave
        self.player: asyncio.Task | None = None
        self.wake = asyncio.Event()


class Bridge:
    def __init__(self, cfg: dict, pi, pg):
        p, t, b, h = cfg["pins"], cfg["timing"], cfg["buffer"], cfg["behaviour"]
        self.pins = Pins(tuple(p["step"]), tuple(p["dir"]), tuple(p.get("invert_dir", ())))
        if len(self.pins.step) != len(self.pins.dir) or not 1 <= self.pins.axes <= 8:
            raise ValueError("pins.step and pins.dir must list the same number of axes (1-8)")
        self.timing = Timing(t["dir_lead_us"], t["step_high_us"], t["step_low_min_us"])
        self.max_records = int(b["max_records_per_chunk"])
        self.capacity = int(b["capacity_chunks"])
        self.max_pulses = int(b["max_pulses_per_wave"])
        self.max_wave_us = int(b["max_wave_ms"]) * 1000
        if not 10 <= self.max_pulses <= 5000:
            raise ValueError("max_pulses_per_wave must be 10-5000 (pigpiod takes at most 64 KiB per upload)")
        self.disable_when_idle = bool(h["disable_when_idle"])
        self.poll_s = float(h["poll_ms"]) / 1000
        self.exec = Executor(pi, pg, self.pins, int(p.get("enable", -1)), int(b["wave_slot_percent"]))
        self.client = None
        self.hello = P.hello(self.pins.axes, self.max_records, self.capacity, self.timing.min_dt_us)

    def new_run(self) -> Run:
        return Run(self.pins, self.timing)

    # ----- connection -----
    async def handler(self, ws, *_):
        peer = getattr(ws, "remote_address", None)
        if self.client is not None:
            log.warning("refused %s: another host is connected", peer)
            await ws.send(P.error(P.E_BUSY, "another host is connected"))
            await ws.close(1013, "busy")
            return
        self.client = ws
        log.info("host connected: %s", peer)
        run = self.new_run()
        try:
            await ws.send(self.hello)
            async for frame in ws:
                if isinstance(frame, str):
                    await ws.send(P.error(P.E_BAD_FRAME, "text frames are not part of the protocol"))
                    continue
                run = await self.on_frame(ws, run, frame)
        except ConnectionClosed:
            pass
        finally:
            if run.started and not run.finished:
                log.warning("host disconnected during a run: stopping")
                await self.finish(ws, run, P.DISCONNECTED, exact=False, notify=False)
            else:
                self.exec.halt()
                self.exec.enable(False)
            self.client = None
            log.info("host disconnected: %s", peer)

    async def on_frame(self, ws, run: Run, frame: bytes) -> Run:
        kind = frame[0] if frame else 0
        if run.finished:
            run = self.new_run()
        if kind == P.CHUNK:
            try:
                seq, records = P.parse_chunk(frame, self.pins.axes, self.timing.min_dt_us, self.max_records)
                if seq != run.expected_seq & 0xFFFF:
                    raise P.ProtocolError(P.E_SEQUENCE, f"expected chunk {run.expected_seq & 0xFFFF}, got {seq}")
                if run.builder.final:
                    raise P.ProtocolError(P.E_STATE, "chunk after STOP")
                if run.received - run.consumed >= self.capacity:
                    raise P.ProtocolError(P.E_OVERFLOW, f"more than {self.capacity} chunks waiting")
            except P.ProtocolError as err:
                return await self.reject(ws, run, err)
            run.builder.add_chunk(run.received, records)
            run.received += 1
            run.expected_seq += 1
            run.wake.set()
        elif kind == P.START:
            if not run.started:
                run.started = True
                self.exec.enable(True)
                await asyncio.sleep(0.002)  # let the drivers wake before the first step
                run.player = asyncio.create_task(self.player(ws, run))
                log.info("run started (%d chunks buffered)", run.received)
        elif kind == P.STOP:
            run.builder.finish()
            run.wake.set()
        elif kind == P.ESTOP:
            log.warning("ESTOP from host")
            await self.finish(ws, run, P.ESTOPPED, exact=not run.started)
        else:
            await ws.send(P.error(P.E_BAD_FRAME, f"unknown frame type {kind}"))
        return run

    async def reject(self, ws, run: Run, err: P.ProtocolError) -> Run:
        log.warning("protocol error: %s", err)
        await ws.send(P.error(err.code, str(err)))
        if run.started and not run.finished:
            await self.finish(ws, run, P.FAULT, exact=False)
            return run
        return self.new_run()  # discard what was buffered; the host starts again

    # ----- playing -----
    def _account(self, run: Run, wave: Wave) -> None:
        self.exec.delete(wave.wid)
        for axis in range(self.pins.axes):
            run.pulses[axis] += wave.pulse_count[axis]
            run.net[axis] += wave.net[axis]
        run.records += wave.records
        run.elapsed_us = max(run.elapsed_us, wave.until_us)

    def _retire(self, run: Run) -> None:
        """Count and delete waves that have finished playing."""
        while run.active:
            at = self.exec.tx_at()
            if len(run.active) >= 2 and at == run.active[1].wid:
                self._account(run, run.active.pop(0))
            elif all(w.wid != at for w in run.active) and not self.exec.busy():
                for wave in run.active:
                    self._account(run, wave)
                run.active.clear()
            else:
                return

    async def player(self, ws, run: Run) -> None:
        try:
            while True:
                self._retire(run)
                while len(run.active) < 2 and run.builder.can_build():
                    t0 = time.perf_counter()
                    wave = run.builder.build(self.max_pulses, self.max_wave_us)
                    if wave is None:
                        break
                    self.exec.submit(wave)
                    load = (time.perf_counter() - t0) * 1e6 / max(wave.duration_us, 1)
                    run.worst_load = max(run.worst_load, load)
                    run.active.append(wave)
                    run.any_submitted = True
                    if wave.chunks_consumed:
                        run.consumed += len(wave.chunks_consumed)
                        await ws.send(P.ack(run.consumed))
                if not run.active:
                    if run.builder.final and run.builder.pending == 0:
                        await self.finish(ws, run, P.COMPLETED, exact=True)
                        return
                    if run.any_submitted and not run.builder.final:
                        log.warning("underrun: the host did not send records in time")
                        await self.finish(ws, run, P.UNDERRUN, exact=True)
                        return
                    run.wake.clear()
                    try:
                        await asyncio.wait_for(run.wake.wait(), timeout=self.poll_s)
                    except asyncio.TimeoutError:
                        pass
                    continue
                await asyncio.sleep(self.poll_s)
        except asyncio.CancelledError:
            raise
        except ConnectionClosed:
            await self.finish(ws, run, P.DISCONNECTED, exact=False, notify=False)
        except Exception as err:  # noqa: BLE001 - any failure must leave the motors safe
            log.exception("player failed")
            try:
                await ws.send(P.error(P.E_PIGPIO, f"{type(err).__name__}: {err}"))
            except ConnectionClosed:
                pass
            await self.finish(ws, run, P.FAULT, exact=False)

    async def finish(self, ws, run: Run, status: int, exact: bool, notify: bool = True) -> None:
        if run.finished:
            return
        run.finished = True
        if run.player is not None and run.player is not asyncio.current_task():
            run.player.cancel()
        try:
            self._retire(run)  # count what completed before stopping
        except Exception:  # noqa: BLE001
            log.exception("could not count finished waves")
        exact = exact and not run.active
        self.exec.halt()
        if self.disable_when_idle or status != P.COMPLETED:
            self.exec.enable(False)
        log.info("run %s: %d records, %.3f s, pulses %s, net %s%s", P.STATUS_NAMES[status], run.records,
                 run.elapsed_us / 1e6, run.pulses, run.net, "" if exact else " (position not exact)")
        # Building a wave must take less time than playing one; above ~50 % the Pi is close to underrunning.
        log.info("busiest wave: built in %.0f %% of its play time", run.worst_load * 100)
        if notify:
            try:
                await ws.send(P.done(status, exact, run.records, run.elapsed_us, run.pulses, run.net))
            except ConnectionClosed:
                pass

    def shutdown(self) -> None:
        self.exec.halt()
        self.exec.enable(False)


async def serve_forever(cfg: dict, pi, pg, stop: asyncio.Event | None = None, ready: asyncio.Event | None = None):
    bridge = Bridge(cfg, pi, pg)
    stop = stop or asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, stop.set)
        except (NotImplementedError, RuntimeError):  # pragma: no cover - not on the main thread
            pass
    host, port = cfg["server"]["host"], int(cfg["server"]["port"])
    async with serve(bridge.handler, host, port, max_size=1 << 20, ping_interval=5, ping_timeout=10) as server:
        bound = [s.getsockname()[1] for s in getattr(server, "sockets", [])] or [port]
        log.info("listening on ws://%s:%d (%d axes, min dt %d µs)", host, bound[0], bridge.pins.axes,
                 bridge.timing.min_dt_us)
        bridge.port = bound[0]
        if ready is not None:
            ready.bridge = bridge  # type: ignore[attr-defined]
            ready.set()
        await stop.wait()
    bridge.shutdown()
    log.info("stopped; step lines low, drivers disabled")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--config", help="TOML config file (see config.example.toml)")
    ap.add_argument("--fake", action="store_true", help="use a simulated pigpio (no hardware)")
    ap.add_argument("--fake-speed", type=float, default=1.0, help="simulated clock speed-up")
    ap.add_argument("--port", type=int, help="override server.port")
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    cfg = load_config(args.config)
    if args.port is not None:
        cfg["server"]["port"] = args.port
    if args.fake:
        import fakepigpio as pg
        pi = pg.pi(speed=args.fake_speed)
    else:
        import pigpio as pg  # installed by pigpio's own build
        pi = pg.pi()
        if not pi.connected:
            log.error("cannot reach pigpiod on localhost: is the pigpiod service running?")
            sys.exit(1)
    try:
        asyncio.run(serve_forever(cfg, pi, pg))
    finally:
        pi.stop()


if __name__ == "__main__":
    main()
