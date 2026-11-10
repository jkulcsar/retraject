# Count mDNS packets (UDP 5353) seen on an interface for a few seconds.
import socket, struct, sys, time
iface, secs = sys.argv[1], float(sys.argv[2])
s = socket.socket(socket.AF_PACKET, socket.SOCK_RAW, socket.ntohs(0x0003)); s.bind((iface, 0)); s.settimeout(0.5)
seen, end = {}, time.time() + secs
while time.time() < end:
    try: pkt, addr = s.recvfrom(65535)
    except socket.timeout: continue
    if pkt[12:14] != b"\x08\x00" or pkt[23] != 17: continue  # IPv4 UDP only
    ihl = (pkt[14] & 15) * 4; sport, dport = struct.unpack("!HH", pkt[14 + ihl:18 + ihl])
    if 5353 in (sport, dport):
        src = socket.inet_ntoa(pkt[26:30]); out = addr[2] == socket.PACKET_OUTGOING
        k = ("sent" if out else "received from " + src); seen[k] = seen.get(k, 0) + 1
print(f"{iface}: " + (", ".join(f"{v} {k}" for k, v in sorted(seen.items())) or "no mDNS packets at all"))
