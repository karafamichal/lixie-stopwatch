#!/usr/bin/env bash
# install.sh — one-shot installer for the Lixie StopWatch server (Flask
# backend + built React dashboard) on a Debian/Ubuntu host.
#
# What it does (idempotent — safe to re-run after an upgrade):
#   1. Installs apt packages (python3-venv, nodejs/npm, build-essential)
#   2. Creates a system user + group "lixie"
#   3. Copies the repository into /opt/lixie-stopwatch
#   4. Sets up a Python virtualenv and installs requirements.txt
#   5. Builds the dashboard (npm ci && npm run build) and copies the
#      compiled SPA into backend/static so Flask serves it on port 5000
#   6. Installs and enables the systemd unit lixie-stopwatch.service
#
# Run from the unpacked release directory as root:
#     sudo bash install.sh
#
# Re-run after a `git pull` or after dropping a new release zip in place to
# rebuild the dashboard and restart the service without touching the
# database in /opt/lixie-stopwatch/backend/instance.

set -euo pipefail

# ── 0. sanity ───────────────────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
    echo "Please run as root:  sudo bash install.sh"
    exit 1
fi

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="/opt/lixie-stopwatch"
LOG_DIR="/var/log/lixie-stopwatch"
SERVICE_USER="lixie"
SERVICE_GROUP="lixie"
SERVICE_NAME="lixie-stopwatch.service"

echo "==> Lixie StopWatch installer"
echo "    source:      $SRC_DIR"
echo "    destination: $INSTALL_DIR"
echo

# ── 1. apt deps ─────────────────────────────────────────────────────────────
echo "==> [1/6] Installing apt packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y \
    python3 python3-venv python3-pip \
    build-essential \
    nodejs npm \
    rsync

# ── 2. user / group ─────────────────────────────────────────────────────────
echo "==> [2/6] Ensuring service user '$SERVICE_USER' exists"
if ! getent group  "$SERVICE_GROUP" >/dev/null; then groupadd --system "$SERVICE_GROUP"; fi
if ! getent passwd "$SERVICE_USER"  >/dev/null; then
    useradd --system --gid "$SERVICE_GROUP" --home-dir "$INSTALL_DIR" \
            --shell /usr/sbin/nologin --comment "Lixie StopWatch service" "$SERVICE_USER"
fi

# ── 3. copy source ──────────────────────────────────────────────────────────
echo "==> [3/6] Copying source to $INSTALL_DIR"
install -d -o "$SERVICE_USER" -g "$SERVICE_GROUP" -m 0755 "$INSTALL_DIR" "$LOG_DIR"
rsync -a --delete \
      --exclude '__pycache__' \
      --exclude 'instance/'           `# keep DB if it already exists` \
      --exclude 'node_modules' \
      --exclude 'venv' \
      --exclude '.git' \
      "$SRC_DIR/web-dashboard/backend/"   "$INSTALL_DIR/backend/"
rsync -a --delete \
      --exclude 'node_modules' \
      --exclude 'dist' \
      "$SRC_DIR/web-dashboard/dashboard/" "$INSTALL_DIR/dashboard/"

# ── 4. python venv + requirements ──────────────────────────────────────────
echo "==> [4/6] Setting up Python virtualenv"
if [[ ! -d "$INSTALL_DIR/venv" ]]; then
    python3 -m venv "$INSTALL_DIR/venv"
fi
"$INSTALL_DIR/venv/bin/pip" install --upgrade pip wheel
"$INSTALL_DIR/venv/bin/pip" install -r "$INSTALL_DIR/backend/requirements.txt"

install -d -o "$SERVICE_USER" -g "$SERVICE_GROUP" -m 0755 \
    "$INSTALL_DIR/backend/instance"

# ── 5. build dashboard ─────────────────────────────────────────────────────
echo "==> [5/6] Building the React dashboard"
pushd "$INSTALL_DIR/dashboard" >/dev/null
npm ci
npm run build
popd >/dev/null

install -d -o "$SERVICE_USER" -g "$SERVICE_GROUP" -m 0755 \
    "$INSTALL_DIR/backend/static"
rsync -a --delete "$INSTALL_DIR/dashboard/dist/" "$INSTALL_DIR/backend/static/"

# Make sure everything is owned by the service user.
chown -R "$SERVICE_USER":"$SERVICE_GROUP" "$INSTALL_DIR" "$LOG_DIR"

# ── 6. systemd unit ────────────────────────────────────────────────────────
echo "==> [6/6] Installing systemd service"
install -m 0644 "$SRC_DIR/lixie-stopwatch.service" \
    "/etc/systemd/system/$SERVICE_NAME"
systemctl daemon-reload
systemctl enable  "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"

echo
echo "==> Done. Service is running."
echo "    systemctl status $SERVICE_NAME"
echo "    journalctl -u $SERVICE_NAME -f"
echo
echo "    Dashboard:  http://$(hostname -I | awk '{print $1}'):5000/"
echo "    API base:   http://$(hostname -I | awk '{print $1}'):5000/api/v1"
