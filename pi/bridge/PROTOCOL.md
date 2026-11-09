# Bridge protocol, version 1

The host (the browser or `send_move.py`) and the Pi bridge exchange binary
WebSocket messages, one frame per message. All integers are little-endian.
The first byte is the frame type. `protocol.py` is the reference encoder
and decoder.

The host computes the time of every step. The bridge only replays them
with pigpio's DMA timing. It never sees millimetres, speeds or kinematics.

## Frames

| Type | Name | Direction | Layout after the type byte |
|---|---|---|---|
| 1 | `HELLO` | bridge → host | `u8 version, u8 axes, u16 max_records, u16 capacity_chunks, u16 min_dt_us` |
| 2 | `CHUNK` | host → bridge | `u16 seq, u16 n`, then n records |
| 3 | `ACK` | bridge → host | `u32 consumed` |
| 4 | `START` | host → bridge | none |
| 5 | `STOP` | host → bridge | none |
| 6 | `ESTOP` | host → bridge | none |
| 7 | `DONE` | bridge → host | `u8 status, u8 exact, u32 records, u32 elapsed_us`, then per axis `u32 pulses, i32 net` |
| 8 | `ERROR` | bridge → host | `u8 code`, then a UTF-8 message |

A **record** is 4 bytes: `u16 dt_us, u8 step_mask, u8 dir_mask`.

- `dt_us` is the time since the previous record. It must be at least
  `min_dt_us` (30 µs by default). Longer gaps than 65,535 µs are bridged
  with records whose `step_mask` is 0 (keepalives).
- Bit *i* of `step_mask` makes axis *i* take one step at that moment.
- Bit *i* of `dir_mask` gives that step's direction: 1 is forward (DIR pin
  high, unless the axis has `invert_dir` set), 0 is backward. It is
  ignored for axes that do not step.

The first record's `dt_us` only has to meet the minimum: motion starts
when the bridge starts the first wave.

## A run

```
host                                bridge
                 <- HELLO           (on connect)
CHUNK seq 0 ->
CHUNK seq 1 ->                      (buffer a few chunks first)
START ->                            drivers enabled, playing starts
                 <- ACK 1           chunk 0 turned into waves
CHUNK seq 2 ->                      (one new chunk per ACK)
...
STOP ->                             no more records: drain
                 <- DONE            status, counts
```

- **Sequence.** `seq` counts from 0 in every run and wraps at 65,536.
  A gap or repeat is an error.
- **Flow control.** `ACK consumed` is the number of this run's chunks
  fully turned into waves so far. The host may have at most
  `capacity_chunks` chunks sent but not consumed; `send_move.py` keeps one
  fewer in flight. More is an overflow error.
- **STOP** means "that was the last record": the bridge plays everything
  buffered, then sends `DONE` with status *completed*. It is a drain, not
  a halt. `ESTOP` is the halt.
- **After `DONE`** the next `CHUNK` (seq 0) begins a new run.
- **One host at a time.** A second connection gets `ERROR busy` and is
  closed.

## Stopping

| Event | What the bridge does | `DONE` status |
|---|---|---|
| `STOP` and everything played | drivers off if `disable_when_idle` | 0 *completed* |
| `ESTOP` | stop the wave at once, step lines low, drivers off | 1 *estop* |
| WebSocket closes during a run | same as `ESTOP` (no `DONE`: nobody to tell) | 2 *disconnected*, logged only |
| waves ran out before `STOP` | stop, drivers off | 3 *underrun* |
| pigpio or bridge failure | `ERROR pigpio`, then stop, drivers off | 4 *fault* |

`DONE` reports what was played: `records`, `elapsed_us` on the plan's
timeline, and per axis the step `pulses` and the signed `net` steps.

`exact` is 1 when those counts are exactly the steps sent to the
drivers: the run completed, underran, or was stopped before `START`
(nothing moved). It is 0 when the stop cut a wave short: the counts then cover only
the waves that finished, and the true position is unknown, so re-home.
An underrun reports exact counts, but if it struck at speed the motors
may still have slipped.

## Errors

| Code | Name | Meaning |
|---|---|---|
| 1 | bad frame | malformed or unknown frame |
| 2 | sequence | `CHUNK` seq out of order |
| 3 | overflow | more than `capacity_chunks` in flight |
| 4 | dt too short | a record below `min_dt_us` |
| 5 | bad mask | a mask bit beyond the bridge's axes |
| 6 | busy | another host is connected |
| 7 | pigpio | the wave engine failed (followed by `DONE` *fault*) |
| 8 | state | e.g. `CHUNK` after `STOP` |

A rejected `CHUNK` before `START` discards that run's buffered records;
the host starts again from seq 0. During a run, it ends the run with
`DONE` *fault*.

## Timing on the wire

For each stepping record at time *t* the bridge emits: direction pins at
*t* − 10 µs (only if one changes), step pins high at *t*, low at
*t* + 10 µs. Hence the 30 µs minimum spacing (10 + 10 + 10 low). The
DRV8825 needs only 0.65 µs direction setup and 1.9 µs high and low;
the margin covers pigpio's few-µs jitter.
