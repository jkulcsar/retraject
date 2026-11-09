"""A stand-in for the pigpio Python module, for tests and dry runs off the Pi.

It implements only the calls the bridge uses. Waves are "played" on a clock
that can run faster than real time, and every pin change is recorded, so
tests can check pulse counts, pulse widths, direction setup and continuity.
"""
from __future__ import annotations

import time
from array import array
from collections import defaultdict

OUTPUT, INPUT = 1, 0
PUD_OFF, PUD_DOWN, PUD_UP = 0, 1, 2
WAVE_MODE_ONE_SHOT, WAVE_MODE_REPEAT, WAVE_MODE_ONE_SHOT_SYNC, WAVE_MODE_REPEAT_SYNC = 0, 1, 2, 3
WAVE_NOT_FOUND, NO_TX_WAVE = 9998, 9999
_PI_CMD_WVAG = 28


def _u2i(value: int) -> int:
    return value


def _pigpio_command_ext(sl, cmd, p1, p2, p3, extents):
    """The socket call pigpio's wave_add_generic ends in; here `sl` is the fake pi itself."""
    if cmd != _PI_CMD_WVAG:
        raise NotImplementedError(cmd)
    data = array("I")
    data.frombytes(b"".join(bytes(x) for x in extents))
    if len(data) * 4 != p3:
        raise AssertionError("extent length does not match p3")
    return sl.wave_add_generic([pulse(data[i], data[i + 1], data[i + 2]) for i in range(0, len(data), 3)])


class pulse:  # noqa: N801  (same name as pigpio.pulse)
    def __init__(self, gpio_on: int, gpio_off: int, delay: int):
        self.gpio_on, self.gpio_off, self.delay = gpio_on, gpio_off, delay


class pi:  # noqa: N801  (same name as pigpio.pi)
    def __init__(self, host: str = "localhost", port: int = 8888, speed: float = 1.0, slots: int = 2):
        self.connected = True
        self.sl = self  # pigpio keeps its socket and lock here
        self.speed = speed
        self.slots = slots
        self._t0 = time.monotonic()
        self.levels: dict[int, int] = defaultdict(int)
        self.edges: dict[int, list[tuple[float, int]]] = defaultdict(list)  # gpio -> [(time_us, level)]
        self.modes: dict[int, int] = {}
        self._pending: list[pulse] = []
        self._waves: dict[int, tuple[list[pulse], int]] = {}
        self._next = 0
        self._queue: list[tuple[int, float]] = []  # (wid, start_us)
        self.waves_created = 0

    # ----- clock -----
    def now_us(self) -> float:
        return (time.monotonic() - self._t0) * 1e6 * self.speed

    def _set(self, gpio: int, level: int, at_us: float) -> None:
        if self.levels[gpio] != level:
            self.levels[gpio] = level
            self.edges[gpio].append((at_us, level))

    def _play(self, wid: int, start: float, until: float | None = None) -> None:
        pulses, _ = self._waves[wid]
        t = start
        for p in pulses:
            if until is not None and t > until:
                return
            for g in range(32):
                if p.gpio_on >> g & 1:
                    self._set(g, 1, t)
                if p.gpio_off >> g & 1:
                    self._set(g, 0, t)
            t += p.delay

    def _advance(self) -> None:
        now = self.now_us()
        while self._queue:
            wid, start = self._queue[0]
            if start + self._waves[wid][1] > now:
                break
            self._play(wid, start)
            self._queue.pop(0)

    # ----- pigpio API subset -----
    def set_mode(self, gpio: int, mode: int) -> int:
        self.modes[gpio] = mode
        return 0

    def set_pull_up_down(self, gpio: int, pud: int) -> int:
        return 0

    def write(self, gpio: int, level: int) -> int:
        self._set(gpio, 1 if level else 0, self.now_us())
        return 0

    def read(self, gpio: int) -> int:
        self._advance()
        return self.levels[gpio]

    def wave_clear(self) -> int:
        self._pending, self._waves, self._queue = [], {}, []
        return 0

    def wave_add_generic(self, pulses: list[pulse]) -> int:
        self._pending.extend(pulses)
        return len(self._pending)

    def wave_create_and_pad(self, percent: int) -> int:
        if len(self._waves) >= self.slots:
            return -67  # no room for another padded wave
        wid = self._next
        self._next += 1
        self._waves[wid] = (self._pending, sum(p.delay for p in self._pending))
        self._pending = []
        self.waves_created += 1
        return wid

    def wave_send_using_mode(self, wid: int, mode: int) -> int:
        self._advance()
        if wid not in self._waves:
            return -66
        if self._queue:
            last_wid, last_start = self._queue[-1]
            start = last_start + self._waves[last_wid][1]
        else:
            start = self.now_us()
        self._queue.append((wid, start))
        return len(self._waves[wid][0])

    def wave_tx_at(self) -> int:
        self._advance()
        return self._queue[0][0] if self._queue else NO_TX_WAVE

    def wave_tx_busy(self) -> int:
        self._advance()
        return 1 if self._queue else 0

    def wave_tx_stop(self) -> int:
        now = self.now_us()
        if self._queue:
            wid, start = self._queue[0]
            self._play(wid, start, until=now)
        self._queue = []
        return 0

    def wave_delete(self, wid: int) -> int:
        self._advance()
        if any(q == wid for q, _ in self._queue):
            raise AssertionError(f"wave {wid} deleted while still queued or playing")
        self._waves.pop(wid, None)
        return 0

    def stop(self) -> None:
        self.connected = False

    # ----- helpers for tests -----
    def rising_edges(self, gpio: int) -> list[float]:
        self._advance()
        return [t for t, level in self.edges[gpio] if level == 1]
