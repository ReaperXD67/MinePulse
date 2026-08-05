#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root." >&2
  exit 1
fi

APP_DIR="${APP_DIR:-/opt/karixmc}"
chmod 0755 "${APP_DIR}/deploy/scripts/backup.sh" "${APP_DIR}/deploy/scripts/monitor-health.sh"
install -m 0644 "${APP_DIR}/deploy/systemd/karixmc-backup.service" /etc/systemd/system/karixmc-backup.service
install -m 0644 "${APP_DIR}/deploy/systemd/karixmc-backup.timer" /etc/systemd/system/karixmc-backup.timer
install -m 0644 "${APP_DIR}/deploy/systemd/karixmc-health.service" /etc/systemd/system/karixmc-health.service
install -m 0644 "${APP_DIR}/deploy/systemd/karixmc-health.timer" /etc/systemd/system/karixmc-health.timer

systemctl daemon-reload
systemctl enable --now karixmc-backup.timer karixmc-health.timer
systemctl list-timers --all 'karixmc-*'
