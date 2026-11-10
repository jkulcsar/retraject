#!/bin/sh
# Install the WiFi watchdog and make Ethernet a lifeline that WiFi outranks.
# Run on the Pi with sudo, from the folder holding wifi-watchdog.
set -e
install -m 755 wifi-watchdog /usr/local/sbin/wifi-watchdog

cat > /etc/systemd/system/wifi-watchdog.service <<'EOF'
[Unit]
Description=Re-initialise a stuck USB WiFi adapter

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/wifi-watchdog
EOF

cat > /etc/systemd/system/wifi-watchdog.timer <<'EOF'
[Unit]
Description=Check WiFi every 30 s

[Timer]
OnBootSec=2min
OnUnitActiveSec=30s
AccuracySec=1s

[Install]
WantedBy=timers.target
EOF

# Two interfaces on one subnet: each answers ARP only for its own address,
# so traffic to a WiFi address really travels over that adapter.
cat > /etc/sysctl.d/90-multihome.conf <<'EOF'
net.ipv4.conf.all.arp_ignore = 1
net.ipv4.conf.all.arp_announce = 2
EOF
sysctl -q -p /etc/sysctl.d/90-multihome.conf

# Ethernet stays connected but loses to WiFi (metric 600) for all traffic.
nmcli con modify "Wired connection 1" ipv4.route-metric 900 ipv6.route-metric 900
nmcli dev reapply eth0 2>/dev/null || true   # takes effect now if the cable is in

systemctl daemon-reload
systemctl enable --now wifi-watchdog.timer
echo "watchdog: $(systemctl is-active wifi-watchdog.timer); arp_ignore=$(sysctl -n net.ipv4.conf.all.arp_ignore)"
