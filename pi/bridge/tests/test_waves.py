"""Wave building, checked by playing the waves on the simulated pigpio."""
import os
import struct
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import fakepigpio as pg  # noqa: E402
import protocol as P  # noqa: E402
from waves import Pins, Timing, WaveBuilder  # noqa: E402

PINS = Pins(step=(17, 22, 24), dir=(27, 23, 25))
TIMING = Timing(dir_lead_us=10, step_high_us=10, step_low_min_us=10)


def play(waves):
    """Queue all waves back to back on a fake pi and play them out completely."""
    pi = pg.pi(speed=1.0, slots=len(waves) + 1)
    for w in waves:
        pi.wave_add_generic([pg.pulse(*p) for p in w.pulses])
        wid = pi.wave_create_and_pad(10)
        pi.wave_send_using_mode(wid, pg.WAVE_MODE_ONE_SHOT_SYNC)
    pi._t0 -= 1e6  # run the clock far ahead so every wave has played
    pi._advance()
    return pi


def build_all(records, max_pulses=10_000, chunk=0, final=True, pins=PINS):
    b = WaveBuilder(pins, TIMING)
    b.add_chunk(chunk, records)
    if final:
        b.finish()
    waves = []
    while (w := b.build(max_pulses)) is not None:
        waves.append(w)
    return b, waves


class WaveTests(unittest.TestCase):
    def test_step_times_match_records(self):
        records = [(500, 1, 1)] * 10
        _, waves = build_all(records)
        pi = play(waves)
        rises = pi.rising_edges(17)
        self.assertEqual(len(rises), 10)
        gaps = [b - a for a, b in zip(rises, rises[1:])]
        self.assertTrue(all(abs(g - 500) < 1e-6 for g in gaps), gaps)

    def test_pulse_width_and_direction_setup(self):
        records = [(300, 1, 1), (300, 1, 0), (300, 1, 0), (300, 1, 1)]
        _, waves = build_all(records)
        pi = play(waves)
        steps = pi.edges[17]
        dirs = pi.edges[27]
        rises = [t for t, lv in steps if lv == 1]
        falls = [t for t, lv in steps if lv == 0]
        self.assertTrue(all(abs((f - r) - 10) < 1e-6 for r, f in zip(rises, falls)))
        expected_dir = [1, 0, 0, 1]
        for r, want in zip(rises, expected_dir):
            before = [(t, lv) for t, lv in dirs if t <= r]
            level = before[-1][1] if before else 0
            self.assertEqual(level, want)
            if before:
                self.assertGreaterEqual(r - before[-1][0], 10 - 1e-6)
        self.assertEqual(len(dirs), 3)  # high, low, high: no redundant changes

    def test_split_waves_are_continuous(self):
        records = [(50 + (i % 7) * 13, 0b101, 0b001) for i in range(2000)]
        _, waves = build_all(records, max_pulses=120)
        self.assertGreater(len(waves), 10)
        pi = play(waves)
        rises = pi.rising_edges(17)
        self.assertEqual(len(rises), 2000)
        planned = [r[0] for r in records[1:]]
        gaps = [b - a for a, b in zip(rises, rises[1:])]
        self.assertTrue(all(abs(g - p) < 1e-6 for g, p in zip(gaps, planned)))
        self.assertEqual(len(pi.rising_edges(24)), 2000)
        self.assertEqual(len(pi.rising_edges(22)), 0)

    def test_counts_and_net(self):
        records = [(100, 0b011, 0b001)] * 5 + [(100, 0b010, 0b000)] * 3
        _, waves = build_all(records)
        total = [sum(w.pulse_count[a] for w in waves) for a in range(3)]
        net = [sum(w.net[a] for w in waves) for a in range(3)]
        self.assertEqual(total, [5, 8, 0])
        self.assertEqual(net, [5, -8, 0])

    def test_net_signs(self):
        records = [(100, 0b011, 0b001)] * 5 + [(100, 0b010, 0b010)] * 3
        _, waves = build_all(records)
        net = [sum(w.net[a] for w in waves) for a in range(3)]
        self.assertEqual(net, [5, -5 + 3, 0])

    def test_keepalive_gap(self):
        records = [(100, 1, 1), (65535, 0, 0), (65535, 0, 0), (1000, 1, 1)]
        _, waves = build_all(records)
        pi = play(waves)
        rises = pi.rising_edges(17)
        self.assertEqual(len(rises), 2)
        self.assertAlmostEqual(rises[1] - rises[0], 65535 * 2 + 1000)

    def test_inverted_direction(self):
        pins = Pins(step=(17,), dir=(27,), invert_dir=(True,))
        _, waves = build_all([(100, 1, 1), (100, 1, 1)], pins=pins)
        pi = play(waves)
        self.assertEqual(pi.levels[27], 0)  # forward on an inverted axis drives the pin low
        self.assertEqual(len(pi.rising_edges(17)), 2)

    def test_lookahead_holds_last_record(self):
        b, waves = build_all([(100, 1, 1)] * 5, final=False)
        self.assertEqual(sum(w.records for w in waves), 4)
        self.assertEqual(b.pending, 1)
        b.finish()
        w = b.build(1000)
        self.assertEqual(w.records, 1)

    def test_chunks_consumed(self):
        b = WaveBuilder(PINS, TIMING)
        b.add_chunk(0, [(100, 1, 1)] * 3)
        b.add_chunk(1, [(100, 1, 1)] * 3)
        w = b.build(10_000)
        self.assertEqual(w.chunks_consumed, [0])  # chunk 1's last record is held back
        b.finish()
        w = b.build(10_000)
        self.assertEqual(w.chunks_consumed, [1])

    def test_packed_matches_pigpio_format(self):
        _, waves = build_all([(100, 0b101, 0b100)] * 50 + [(100, 0b011, 0b011)] * 50, max_pulses=90)
        for w in waves:
            theirs = b"".join(struct.pack("III", on, off, delay) for on, off, delay in w.pulses)
            self.assertEqual(w.flat.tobytes(), theirs)  # what pigpio's wave_add_generic would send

    def test_wave_respects_pulse_limit(self):
        _, waves = build_all([(60, 0b111, i % 2 * 0b111) for i in range(3000)], max_pulses=500)
        self.assertTrue(all(len(w.flat) // 3 <= 500 for w in waves))

    def test_wave_time_cap(self):
        records = [(65535, 0, 0)] * 40 + [(1000, 1, 1)] * 2000
        _, waves = build_all(records)
        self.assertTrue(all(w.duration_us <= 500_000 + 65535 for w in waves))
        pi = play(waves)
        self.assertEqual(len(pi.rising_edges(17)), 2000)


class ProtocolTests(unittest.TestCase):
    def test_chunk_roundtrip(self):
        recs = [(30, 1, 0), (65535, 0, 0), (400, 7, 5)]
        seq, out = P.parse_chunk(P.chunk(3, recs), axes=3, min_dt_us=30, max_records=1024)
        self.assertEqual((seq, out), (3, recs))

    def test_chunk_rejects_short_dt(self):
        with self.assertRaises(P.ProtocolError) as cm:
            P.parse_chunk(P.chunk(0, [(29, 1, 0)]), axes=3, min_dt_us=30, max_records=1024)
        self.assertEqual(cm.exception.code, P.E_DT_TOO_SHORT)

    def test_chunk_rejects_unknown_axis(self):
        with self.assertRaises(P.ProtocolError) as cm:
            P.parse_chunk(P.chunk(0, [(100, 0b1000, 0)]), axes=3, min_dt_us=30, max_records=1024)
        self.assertEqual(cm.exception.code, P.E_BAD_MASK)

    def test_done_roundtrip(self):
        d = P.parse_done(P.done(P.COMPLETED, True, 12, 3456, [1, 2, 3], [1, -2, 0]))
        self.assertEqual((d.status, d.exact, d.records, d.elapsed_us, d.pulses, d.net),
                         (P.COMPLETED, True, 12, 3456, [1, 2, 3], [1, -2, 0]))


if __name__ == "__main__":
    unittest.main()
