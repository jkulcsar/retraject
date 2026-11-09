"""Turn step records into pigpio wave pulses. Pure logic, no hardware.

A record is (dt_us, step_mask, dir_mask): dt_us after the previous record,
the axes in step_mask take one step, in the direction given by the same bit
of dir_mask (1 = forward). For every stepping record the builder emits:

    t - dir_lead   set the direction pins (only if one has to change)
    t              raise the step pins
    t + step_high  lower the step pins

pigpio plays a wave as a list of pulses (pins on, pins off, then delay µs).
Waves are cut at record boundaries. Every wave starts dir_lead before its
first record and ends exactly where the next wave starts, so waves queued
back to back with PI_WAVE_MODE_ONE_SHOT_SYNC give one continuous timeline.
To know where a wave ends, the builder holds back one record until the host
has said that no more records will come.
"""
from __future__ import annotations

from array import array
from collections import deque
from dataclasses import dataclass

TAIL_US = 2000  # quiet time after the very last step of a run


@dataclass(frozen=True)
class Timing:
    dir_lead_us: int = 10
    step_high_us: int = 10
    step_low_min_us: int = 10

    @property
    def min_dt_us(self) -> int:
        return self.dir_lead_us + self.step_high_us + self.step_low_min_us


@dataclass(frozen=True)
class Pins:
    step: tuple[int, ...]
    dir: tuple[int, ...]
    invert_dir: tuple[bool, ...] = ()

    @property
    def axes(self) -> int:
        return len(self.step)

    def inverted(self, axis: int) -> bool:
        return bool(self.invert_dir[axis]) if axis < len(self.invert_dir) else False


@dataclass
class Wave:
    flat: array  # pigpio pulses as on, off, delay_us, on, off, delay_us, ...
    duration_us: int
    records: int
    pulse_count: list[int]  # step pulses per axis
    net: list[int]  # signed steps per axis (+ forward)
    chunks_consumed: list[int]
    until_us: int = 0  # run time of this wave's last record
    wid: int = -1

    @property
    def pulses(self) -> list[tuple[int, int, int]]:
        f = self.flat
        return [(f[i], f[i + 1], f[i + 2]) for i in range(0, len(f), 3)]


class WaveBuilder:
    def __init__(self, pins: Pins, timing: Timing):
        if timing.dir_lead_us < 1 or timing.step_high_us < 1 or timing.step_low_min_us < 1:
            raise ValueError("all timing values must be at least 1 µs")
        self.pins = pins
        self.timing = timing
        self.queue: deque[tuple[int, int, int]] = deque()  # (dt, step_mask, dir_mask)
        self.t = 0  # absolute time (µs since run start) of the last record taken
        self.dir_state = 0  # GPIO bitmask of direction pins currently high
        self.final = False
        self._added = 0  # records added so far
        self._taken = 0  # records turned into waves so far
        self._chunk_ends: deque[tuple[int, int]] = deque()  # (chunk id, record count after it)
        self._masks: dict[int, tuple[int, int, int]] = {}

    # ----- input -----
    def add_chunk(self, chunk_id: int, records: list[tuple[int, int, int]]) -> None:
        self.queue.extend(records)
        self._added += len(records)
        self._chunk_ends.append((chunk_id, self._added))

    def finish(self) -> None:
        """The host has sent the last record of this run."""
        self.final = True

    @property
    def pending(self) -> int:
        return len(self.queue)

    def can_build(self) -> bool:
        return len(self.queue) >= 2 or (self.final and len(self.queue) >= 1)

    # ----- output -----
    def _mask(self, steps: int, dirs: int) -> tuple[int, int, int]:
        """(step GPIO bits, dir GPIO bits to be high, dir GPIO bits to be low) for one record."""
        key = steps << 8 | dirs
        m = self._masks.get(key)
        if m is None:
            step_bits = hi = lo = 0
            for axis in range(self.pins.axes):
                if steps >> axis & 1:
                    step_bits |= 1 << self.pins.step[axis]
                    if bool(dirs >> axis & 1) != self.pins.inverted(axis):
                        hi |= 1 << self.pins.dir[axis]
                    else:
                        lo |= 1 << self.pins.dir[axis]
            m = self._masks[key] = (step_bits, hi, lo)
        return m

    def build(self, max_pulses: int, max_us: int = 500_000) -> Wave | None:
        """Take as many whole records as fit into max_pulses pulses and about max_us of time.

        The time cap bounds how long motion continues if the bridge dies:
        at most the two queued waves.
        """
        if not self.can_build():
            return None
        queue, final = self.queue, self.final
        lead, high = self.timing.dir_lead_us, self.timing.step_high_us
        start = self.t + queue[0][0] - lead
        # Events never coincide: records are at least lead + high + low_min apart.
        times: list[int] = []
        ons: list[int] = []
        offs: list[int] = []
        tally: dict[int, int] = {}
        t, taken, dir_state = self.t, 0, self.dir_state
        budget = max_pulses - 1  # one pulse may be needed for the leading delay
        masks, mask = self._masks, self._mask
        while queue:
            if not final and len(queue) < 2:
                break  # keep one record to know where this wave ends
            dt, steps, dirs = queue[0]
            if taken and t + dt - start > max_us:
                break
            if steps:
                m = masks.get(steps << 8 | dirs) or mask(steps, dirs)
                step_bits, hi, lo = m
                on_dir = hi & ~dir_state
                off_dir = lo & dir_state
                need = 3 if on_dir or off_dir else 2
                if taken and len(times) + need > budget:
                    break
                t += dt
                if need == 3:
                    times.append(t - lead)
                    ons.append(on_dir)
                    offs.append(off_dir)
                    dir_state = (dir_state | on_dir) & ~off_dir
                times.append(t)
                ons.append(step_bits)
                offs.append(0)
                times.append(t + high)
                ons.append(0)
                offs.append(step_bits)
                key = steps << 8 | dirs
                tally[key] = tally.get(key, 0) + 1
            else:
                t += dt
            queue.popleft()
            taken += 1
        if taken == 0:
            return None
        if queue:
            end = t + queue[0][0] - lead
        else:
            end = (times[-1] if times else t) + TAIL_US
        self.t, self.dir_state = t, dir_state
        self._taken += taken
        consumed = []
        while self._chunk_ends and self._chunk_ends[0][1] <= self._taken:
            consumed.append(self._chunk_ends.popleft()[0])
        counts, net = [0] * self.pins.axes, [0] * self.pins.axes
        for key, n in tally.items():
            steps, dirs = key >> 8, key & 0xFF
            for axis in range(self.pins.axes):
                if steps >> axis & 1:
                    counts[axis] += n
                    net[axis] += n if dirs >> axis & 1 else -n
        flat = array("I")
        if not times or times[0] > start:
            flat.extend((0, 0, (times[0] if times else end) - start))
        times.append(end)
        delays = [b - a for a, b in zip(times, times[1:])]
        if delays and min(delays) <= 0:
            raise ValueError("records closer than the minimum spacing")
        packed = [0] * (3 * len(delays))
        packed[0::3], packed[1::3], packed[2::3] = ons, offs, delays
        flat.extend(packed)
        return Wave(flat, end - start, taken, counts, net, consumed, until_us=t)
