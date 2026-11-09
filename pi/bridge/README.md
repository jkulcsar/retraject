# Pi bridge

The service on the bench Pi 1 that turns step schedules into motor
pulses. The host (the browser, or `send_move.py`) computes the time of
every step; the bridge receives them over a WebSocket and replays them
with pigpio's DMA waves, accurate to a few microseconds. No kinematics
here: the host owns the math, the Pi owns the time. See `PROTOCOL.md`
for the frames and `HARDWARE.md` §3–4 for the design.

| File | What it is |
|---|---|
| `bridge.py` | the service: WebSocket server, run state, pigpio executor |
| `waves.py` | step records → pigpio pulses (pure logic) |
| `protocol.py` | frame encoder and decoder |
| `send_move.py` | test host: streams quintic moves, checks the step counts |
| `bench_waves.py` | can this machine build waves fast enough? |
| `fakepigpio.py` | simulated pigpio for tests and dry runs off the Pi |
| `config.example.toml` | pins, timing, buffers (installed as `/etc/retraject-bridge.toml`) |
| `pigpiod.service`, `retraject-bridge.service`, `install.sh` | installation |
| `tests/` | unit and end-to-end tests |

## Install on a Pi

Needs pigpio v79 built from source (done on both Pis by the machines
repo's `baseline/setup-pi1-bench.sh`). Then, from a copy of this folder
on the Pi:

```sh
sh install.sh
```

It installs `python3-websockets` from apt (no virtual environment: the
bridge uses only the system Python, its standard library, pigpio's module
and websockets), copies the files to `/opt/retraject-bridge`, and enables
two services: `pigpiod` (listening on localhost only) and
`retraject-bridge` on port 8765. Logs: `journalctl -u retraject-bridge -f`.

## First checks on the Pi

1. **Speed.** `python3 /opt/retraject-bridge/bench_waves.py --pigpio`.
   Building a wave must take well under its play time; the script says
   *comfortable*, *tight* or *too slow*. Try `--speed 200` too.
2. **No motor.** `python3 /opt/retraject-bridge/send_move.py --steps 3200
   --seconds 2 --back`. Every axis line should say `MATCH`. The bridge
   log ends with the busiest wave's build share.
3. **LED or multimeter** on GPIO 17 (pin 11): the same move blinks it.
4. **One motor**, drivers wired per `HARDWARE.md` §4.1, Vref set:
   repeat step 2 and watch the shaft go out and back to its paper pointer.

`send_move.py --axes 0,1,2` moves all three together. Ctrl-C sends
`ESTOP`.

## Safety behaviour

- **Driver enable** (GPIO 5, active low) is off at start, on at `START`,
  off after every run unless `disable_when_idle = false`. On a vertical
  frame, park the gantry before the drivers let go.
- **`ESTOP` or a dropped connection:** the wave stops at once, the step
  lines go low, the drivers are disabled.
- **The bridge dies:** at most the two queued waves play out; each is
  capped at 500 ms, so motion stops within about a second.
- **One host at a time;** a second one is refused.
- The 12 V switch remains the hard stop.

## Develop and test off the Pi

On the Mac, with a throwaway virtual environment for websockets:

```sh
python3 -m venv /tmp/bridge-venv && /tmp/bridge-venv/bin/pip install websockets
/tmp/bridge-venv/bin/python -m unittest discover -s tests -v
/tmp/bridge-venv/bin/python bridge.py --fake --port 8765 &
/tmp/bridge-venv/bin/python send_move.py --steps 3200 --seconds 2 --back
```

`--fake` replaces pigpio with `fakepigpio.py`, which plays waves on a
simulated clock and records every pin edge. The tests use it to check
pulse widths, direction setup, continuity across wave boundaries, step
counts, `ESTOP`, disconnects and underruns.
