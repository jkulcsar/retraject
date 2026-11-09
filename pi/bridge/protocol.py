"""Binary frames between the host (browser or send_move.py) and the Pi bridge.

One frame per binary WebSocket message. All integers are little-endian.
The full specification is in PROTOCOL.md.
"""
from __future__ import annotations

import struct
from dataclasses import dataclass

VERSION = 1

HELLO, CHUNK, ACK, START, STOP, ESTOP, DONE, ERROR = range(1, 9)

# DONE status codes
COMPLETED, ESTOPPED, DISCONNECTED, UNDERRUN, FAULT = range(5)
STATUS_NAMES = {COMPLETED: "completed", ESTOPPED: "estop", DISCONNECTED: "disconnected",
                UNDERRUN: "underrun", FAULT: "fault"}

# ERROR codes
E_BAD_FRAME, E_SEQUENCE, E_OVERFLOW, E_DT_TOO_SHORT, E_BAD_MASK, E_BUSY, E_PIGPIO, E_STATE = range(1, 9)

RECORD = struct.Struct("<HBB")  # dt_us, step_mask, dir_mask
_HELLO = struct.Struct("<BBBHHH")  # type, version, axes, max_records, capacity_chunks, min_dt_us
_CHUNK_HEAD = struct.Struct("<BHH")  # type, seq, n
_ACK = struct.Struct("<BI")  # type, chunks consumed in this run
_DONE_HEAD = struct.Struct("<BBBII")  # type, status, exact, records, elapsed_us
_ERROR_HEAD = struct.Struct("<BB")  # type, code


class ProtocolError(Exception):
    def __init__(self, code: int, message: str):
        super().__init__(message)
        self.code = code


@dataclass
class Hello:
    version: int
    axes: int
    max_records: int
    capacity_chunks: int
    min_dt_us: int


@dataclass
class Done:
    status: int
    exact: bool
    records: int
    elapsed_us: int
    pulses: list[int]
    net: list[int]


# ---------- encoders ----------
def hello(axes: int, max_records: int, capacity_chunks: int, min_dt_us: int) -> bytes:
    return _HELLO.pack(HELLO, VERSION, axes, max_records, capacity_chunks, min_dt_us)


def chunk(seq: int, records: list[tuple[int, int, int]]) -> bytes:
    body = b"".join(RECORD.pack(dt, s, d) for dt, s, d in records)
    return _CHUNK_HEAD.pack(CHUNK, seq & 0xFFFF, len(records)) + body


def simple(frame_type: int) -> bytes:
    return bytes([frame_type])


def ack(consumed: int) -> bytes:
    return _ACK.pack(ACK, consumed)


def done(status: int, exact: bool, records: int, elapsed_us: int, pulses: list[int], net: list[int]) -> bytes:
    head = _DONE_HEAD.pack(DONE, status, 1 if exact else 0, records, min(elapsed_us, 0xFFFFFFFF))
    per_axis = b"".join(struct.pack("<Ii", p, n) for p, n in zip(pulses, net))
    return head + per_axis


def error(code: int, message: str) -> bytes:
    return _ERROR_HEAD.pack(ERROR, code) + message.encode("utf-8")[:200]


# ---------- decoders ----------
def frame_type(frame: bytes) -> int:
    if not frame:
        raise ProtocolError(E_BAD_FRAME, "empty frame")
    return frame[0]


def parse_chunk(frame: bytes, axes: int, min_dt_us: int, max_records: int) -> tuple[int, list[tuple[int, int, int]]]:
    if len(frame) < _CHUNK_HEAD.size:
        raise ProtocolError(E_BAD_FRAME, "chunk header too short")
    _, seq, n = _CHUNK_HEAD.unpack_from(frame)
    if n > max_records:
        raise ProtocolError(E_BAD_FRAME, f"chunk has {n} records, more than {max_records}")
    if len(frame) != _CHUNK_HEAD.size + n * RECORD.size:
        raise ProtocolError(E_BAD_FRAME, f"chunk length {len(frame)} does not match {n} records")
    allowed = (1 << axes) - 1
    records = []
    for i in range(n):
        dt, s, d = RECORD.unpack_from(frame, _CHUNK_HEAD.size + i * RECORD.size)
        if dt < min_dt_us:
            raise ProtocolError(E_DT_TOO_SHORT, f"record {i}: dt {dt} µs is below the minimum {min_dt_us} µs")
        if s & ~allowed or d & ~allowed:
            raise ProtocolError(E_BAD_MASK, f"record {i}: mask uses an axis beyond {axes}")
        records.append((dt, s, d))
    return seq, records


def parse_hello(frame: bytes) -> Hello:
    _, version, axes, max_records, capacity, min_dt = _HELLO.unpack(frame)
    return Hello(version, axes, max_records, capacity, min_dt)


def parse_ack(frame: bytes) -> int:
    return _ACK.unpack(frame)[1]


def parse_done(frame: bytes) -> Done:
    _, status, exact, records, elapsed = _DONE_HEAD.unpack_from(frame)
    rest = frame[_DONE_HEAD.size:]
    pulses, net = [], []
    for i in range(0, len(rest), 8):
        p, n = struct.unpack_from("<Ii", rest, i)
        pulses.append(p)
        net.append(n)
    return Done(status, bool(exact), records, elapsed, pulses, net)


def parse_error(frame: bytes) -> tuple[int, str]:
    _, code = _ERROR_HEAD.unpack_from(frame)
    return code, frame[_ERROR_HEAD.size:].decode("utf-8", "replace")
