#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root." >&2
  exit 1
fi

DEPLOY_USER="${DEPLOY_USER:-karixmc}"
APP_DIR="${APP_DIR:-/opt/karixmc}"

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y \
  ca-certificates curl git nginx certbot python3-certbot-nginx \
  docker.io docker-compose-v2 ufw age jq

if ! id "${DEPLOY_USER}" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "${DEPLOY_USER}"
fi
usermod -aG docker "${DEPLOY_USER}"

install -d -o "${DEPLOY_USER}" -g "${DEPLOY_USER}" "${APP_DIR}"
install -d -m 0755 -o 1001 -g 1001 /var/lib/karixmc/media
install -d -o "${DEPLOY_USER}" -g "${DEPLOY_USER}" /var/backups/karixmc

systemctl enable --now docker nginx

ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "Provisioning complete. Add an SSH key for ${DEPLOY_USER}, verify it, then disable root and password SSH login."
