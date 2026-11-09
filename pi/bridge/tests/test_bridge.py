"""The bridge end to end: a real WebSocket server on the simulated pigpio."""
import asyncio
import os
import sys
import types
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    import websockets  # noqa: F401
    from websockets.asyncio.client import connect
except ImportError:  # pragma: no cover
    websockets = None

import fakepigpio as pg  # noqa: E402
import protocol as P  # noqa: E402

if websockets is not None:
    import bridge as B  # noqa: E402
    import send_move as S  # noqa: E402

SPEED = 8.0  # simulated clock runs 8x real time


@unittest.skipIf(websockets is None, "websockets is not installed")
class BridgeTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        cfg = B.load_config(None)
        cfg["server"].update(host="127.0.0.1", port=0)
        cfg["buffer"].update(max_records_per_chunk=256, capacity_chunks=4)
        self.pi = pg.pi(speed=SPEED)
        self.stop = asyncio.Event()
        self.ready = asyncio.Event()
        self.server = asyncio.create_task(B.serve_forever(cfg, self.pi, pg, self.stop, self.ready))
        await asyncio.wait_for(self.ready.wait(), 5)
        self.uri = f"ws://127.0.0.1:{self.ready.bridge.port}"

    async def asyncTearDown(self):
        self.stop.set()
        await asyncio.wait_for(self.server, 5)

    def assert_safe(self):
        for g in (17, 22, 24):
            self.assertEqual(self.pi.levels[g], 0, f"step pin {g} left high")
        self.assertEqual(self.pi.levels[5], 1, "drivers left enabled")

    async def test_full_move_matches_plan(self):
        plan = S.plan_moves([0, 2], steps=1200, seconds=1.0, back=True, pause=0.2, n_axes=3, min_dt_us=30)
        code = await asyncio.wait_for(S.stream(self.uri, plan), 30)
        self.assertEqual(code, 0)
        self.assertEqual(len(self.pi.rising_edges(17)), 2400)
        self.assertEqual(len(self.pi.rising_edges(24)), 2400)
        self.assertEqual(len(self.pi.rising_edges(22)), 0)
        self.assert_safe()

    async def test_estop_stops_at_once(self):
        plan = S.plan_moves([0], steps=4000, seconds=4.0, back=False, pause=0, n_axes=3, min_dt_us=30)
        async with connect(self.uri) as ws:
            hello = P.parse_hello(await ws.recv())
            chunks = [plan.records[i:i + hello.max_records] for i in range(0, len(plan.records), hello.max_records)]
            for i, c in enumerate(chunks[:3]):
                await ws.send(P.chunk(i, c))
            await ws.send(P.simple(P.START))
            await asyncio.sleep(0.1)
            await ws.send(P.simple(P.ESTOP))
            while True:
                frame = await ws.recv()
                if frame[0] == P.DONE:
                    done = P.parse_done(frame)
                    break
        self.assertEqual(done.status, P.ESTOPPED)
        self.assertFalse(done.exact)
        self.assertLess(len(self.pi.rising_edges(17)), 4000)
        self.assert_safe()

    async def test_disconnect_stops(self):
        plan = S.plan_moves([0], steps=4000, seconds=4.0, back=False, pause=0, n_axes=3, min_dt_us=30)
        ws = await connect(self.uri)
        hello = P.parse_hello(await ws.recv())
        await ws.send(P.chunk(0, plan.records[:hello.max_records]))
        await ws.send(P.chunk(1, plan.records[hello.max_records:2 * hello.max_records]))
        await ws.send(P.simple(P.START))
        await asyncio.sleep(0.05)
        await ws.close()
        await asyncio.sleep(0.2)
        before = len(self.pi.rising_edges(17))
        await asyncio.sleep(0.2)
        self.assertEqual(len(self.pi.rising_edges(17)), before, "steps continued after disconnect")
        self.assert_safe()

    async def test_second_host_refused(self):
        async with connect(self.uri) as first:
            await first.recv()
            async with connect(self.uri) as second:
                code, _ = P.parse_error(await second.recv())
                self.assertEqual(code, P.E_BUSY)

    async def test_underrun_reported(self):
        plan = S.plan_moves([0], steps=2000, seconds=1.0, back=False, pause=0, n_axes=3, min_dt_us=30)
        async with connect(self.uri) as ws:
            hello = P.parse_hello(await ws.recv())
            await ws.send(P.chunk(0, plan.records[:hello.max_records]))
            await ws.send(P.simple(P.START))
            while True:  # never send more and never STOP
                frame = await asyncio.wait_for(ws.recv(), 10)
                if frame[0] == P.DONE:
                    done = P.parse_done(frame)
                    break
        self.assertEqual(done.status, P.UNDERRUN)
        self.assert_safe()

    async def test_bad_record_rejected_before_start(self):
        async with connect(self.uri) as ws:
            await ws.recv()
            await ws.send(P.chunk(0, [(10, 1, 1)]))
            code, msg = P.parse_error(await ws.recv())
            self.assertEqual(code, P.E_DT_TOO_SHORT)
        self.assertEqual(len(self.pi.rising_edges(17)), 0)


@unittest.skipIf(websockets is None, "websockets is not installed")
class ExecutorTests(unittest.TestCase):
    def test_fallback_without_packed_upload(self):
        from waves import Pins, Timing, WaveBuilder
        pi = pg.pi(speed=1.0, slots=4)
        plain = types.SimpleNamespace(OUTPUT=pg.OUTPUT, pulse=pg.pulse,
                                      WAVE_MODE_ONE_SHOT_SYNC=pg.WAVE_MODE_ONE_SHOT_SYNC)
        pins = Pins((17, 22, 24), (27, 23, 25))
        ex = B.Executor(pi, plain, pins, 5, 50)
        self.assertFalse(ex.fast_add)
        b = WaveBuilder(pins, Timing())
        b.add_chunk(0, [(200, 1, 1)] * 20)
        b.finish()
        ex.submit(b.build(1000))
        pi._t0 -= 1.0
        self.assertEqual(len(pi.rising_edges(17)), 20)

    def test_packed_upload_used_with_fake(self):
        from waves import Pins
        ex = B.Executor(pg.pi(), pg, Pins((17,), (27,)), -1, 50)
        self.assertTrue(ex.fast_add)


if __name__ == "__main__":
    unittest.main()
