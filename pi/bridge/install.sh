#!/bin/sh
# Install the retraject bridge on a bench Pi. Run on the Pi, from this folder:
#   sh install.sh
# Needs pigpio built from source first (machines repo: baseline/setup-pi1-bench.sh).
set -eu
HERE=$(cd "$(dirname "$0")" && pwd)
USER_NAME=${SUDO_USER:-$(id -un)}

command -v pigpiod >/dev/null || { echo "pigpiod not found: build pigpio v79 first"; exit 1; }
python3 -c "import pigpio" 2>/dev/null || {
  echo "pigpio's Python module is missing: install python3-setuptools, then rerun"
  echo "'sudo make install' in ~/pigpio-79"; exit 1; }

sudo apt-get install -y python3-websockets
sudo install -d /opt/retraject-bridge
sudo install -m 0644 "$HERE/bridge.py" "$HERE/protocol.py" "$HERE/waves.py" "$HERE/send_move.py" "$HERE/bench_waves.py" /opt/retraject-bridge/
if [ ! -f /etc/retraject-bridge.toml ]; then
  sudo install -m 0644 "$HERE/config.example.toml" /etc/retraject-bridge.toml
fi
sudo install -m 0644 "$HERE/pigpiod.service" /etc/systemd/system/pigpiod.service
sed "s/^User=.*/User=$USER_NAME/" "$HERE/retraject-bridge.service" \
  | sudo tee /etc/systemd/system/retraject-bridge.service >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable --now pigpiod.service
sudo systemctl enable --now retraject-bridge.service
sleep 3
systemctl --no-pager --lines=8 status retraject-bridge.service || true
echo
echo "Test from this Pi, with or without a motor connected:"
echo "  python3 /opt/retraject-bridge/send_move.py --steps 3200 --seconds 2 --back"
