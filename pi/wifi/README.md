# WiFi for the Pi 1 B+ twins

The Pi 1 B+ has no WiFi, so each twin uses a USB adapter: an Edimax EW-7811Un
(RTL8188CUS, driver `rtl8192cu`). These files came out of the 2026-11-09
bench tests. They are installed on both Pis, but the machines repo twin setup
(`baseline/setup-pi1-bench.sh`) doesn't include them yet.

| File | What it does |
|---|---|
| `wifi-watchdog` | Runs every 30 s from a systemd timer. If no `wlan` interface has reached the router for 3 checks in a row, it re-initialises the USB WiFi adapters, like a replug. Logs: `journalctl -t wifi-watchdog`. |
| `deploy.sh` | Run on a Pi with sudo, next to `wifi-watchdog`. Installs the watchdog and its timer, sets `arp_ignore`/`arp_announce` so that two interfaces can share one subnet, and gives Ethernet route metric 900 so WiFi wins. |
| `nettest.py` | Small TCP tests with no installs. `serve` runs on the Pi. From the Mac, `run` measures bulk speed both ways and `stream` simulates the bridge's flow control (it counts underruns). |
| `stress3.py` | Long side-by-side test of both Pis, run from the Mac: `python3 stress3.py MINUTES [quick] [outdir]`. Each round runs pings, the bridge simulation at drawing speed and double speed, and bulk speed; every third round also does a cold start. Addresses are hard-coded. |
| `summarize3.py` | Summarises a `stress3.py` run: `python3 summarize3.py [outdir]`. |
| `mdns_sniff.py` | Counts mDNS packets (UDP 5353) arriving on an interface. Run on the Pi with sudo: `mdns_sniff.py wlan0 10`. |
| `results-2026-11-09.txt` | Summary of the 2-hour test with one Edimax per Pi, both at short range. Use it as the baseline for the range test. |

## Not in these files

The WiFi country is set with `raspi-config nonint do_wifi_country CH`. The
"HOMENET" NetworkManager profile has no interface binding, uses
`ipv4.dhcp-client-id mac` (so the address survives replugs) and
`802-11-wireless.powersave 2`. The WiFi password must never be committed.

## Gotchas

- Two Edimaxes in one Pi knock each other out. About 12–19 s after one
  joins, both log "AP off" and stay deaf until a USB re-init. Use one adapter
  per Pi.
- An Edimax can come up deaf at boot. A USB re-init (`echo 0`, then `echo 1`
  to `/sys/bus/usb/devices/<port>/authorized`) fixes it in about 8 s, and
  the watchdog does this on its own.
- `.local` names don't resolve over the Edimax WiFi: no mDNS packets reach
  `wlan0`. Use the fixed addresses .106 and .107.
- The element14 WiPi (RT5370) only reaches 0.2 Mbit/s, which is too slow for
  the bridge.
