#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root." >&2
  exit 1
fi

APP_DIR="${APP_DIR:-/opt/karixmc}"
chmod 0755 "${APP_DIR}/deploy/scripts/backup.sh" "${APP_DIR}/deploy/scripts/monitor-health.sh" "${APP_DIR}/deploy/scripts/monitor-showcase.sh"
install -m 0644 "${APP_DIR}/deploy/systemd/karixmc-backup.service" /etc/systemd/system/karixmc-backup.service
install -m 0644 "${APP_DIR}/deploy/systemd/karixmc-backup.timer" /etc/systemd/system/karixmc-backup.timer
install -m 0644 "${APP_DIR}/deploy/systemd/karixmc-health.service" /etc/systemd/system/karixmc-health.service
install -m 0644 "${APP_DIR}/deploy/systemd/karixmc-health.timer" /etc/systemd/system/karixmc-health.timer
install -m 0644 "${APP_DIR}/deploy/systemd/karixmc-showcase-health.service" /etc/systemd/system/karixmc-showcase-health.service
install -m 0644 "${APP_DIR}/deploy/systemd/karixmc-showcase-health.timer" /etc/systemd/system/karixmc-showcase-health.timer

systemctl daemon-reload
systemctl enable --now karixmc-backup.timer karixmc-health.timer
if [[ -f "${APP_DIR}/.env.showcase" ]]; then
  systemctl enable --now karixmc-showcase-health.timer
else
  systemctl disable --now karixmc-showcase-health.timer >/dev/null 2>&1 || true
fi
systemctl list-timers --all 'karixmc-*'
