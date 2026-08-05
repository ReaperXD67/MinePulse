#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root." >&2
  exit 1
fi

DEPLOY_USER="${DEPLOY_USER:-karixmc}"
APP_DIR="${APP_DIR:-/opt/karixmc}"
ENV_FILE="${APP_ENV_FILE:-${APP_DIR}/.env.production}"

test -f "${ENV_FILE}" || { echo "${ENV_FILE} is missing" >&2; exit 1; }

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y \
  ca-certificates curl git nginx certbot python3-certbot-nginx \
  postgresql redis-server ufw age jq

if ! command -v node >/dev/null 2>&1 || [[ "$(node --version | cut -d. -f1 | tr -d v)" -lt 22 ]]; then
  curl --fail --silent --show-error --location https://deb.nodesource.com/setup_22.x -o /tmp/nodesource-setup.sh
  bash /tmp/nodesource-setup.sh
  DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
  rm -f /tmp/nodesource-setup.sh
fi

if ! id "${DEPLOY_USER}" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "${DEPLOY_USER}"
fi

install -d -o "${DEPLOY_USER}" -g "${DEPLOY_USER}" "${APP_DIR}"
install -d -m 0750 -o "${DEPLOY_USER}" -g "${DEPLOY_USER}" /var/lib/karixmc/media
install -d -m 0750 -o "${DEPLOY_USER}" -g "${DEPLOY_USER}" /var/backups/karixmc

set -a
source "${ENV_FILE}"
set +a

: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
: "${REDIS_PASSWORD:?REDIS_PASSWORD is required}"

runuser -u postgres -- psql --set=ON_ERROR_STOP=1 \
  --set=db_name="${POSTGRES_DB}" \
  --set=db_user="${POSTGRES_USER}" \
  --set=db_password="${POSTGRES_PASSWORD}" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'db_user', :'db_password')
WHERE NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = :'db_user')\gexec
SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L', :'db_user', :'db_password')\gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'db_name', :'db_user')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'db_name')\gexec
SQL

sed -i -E "s|^[#[:space:]]*requirepass .*|requirepass ${REDIS_PASSWORD}|" /etc/redis/redis.conf
if ! grep -q '^requirepass ' /etc/redis/redis.conf; then
  printf '\nrequirepass %s\n' "${REDIS_PASSWORD}" >> /etc/redis/redis.conf
fi
sed -i -E 's|^[#[:space:]]*bind .*|bind 127.0.0.1 -::1|' /etc/redis/redis.conf
sed -i -E 's|^[#[:space:]]*protected-mode .*|protected-mode yes|' /etc/redis/redis.conf

install -m 0644 "${APP_DIR}/deploy/systemd/karixmc-app@.service" /etc/systemd/system/karixmc-app@.service
systemctl daemon-reload
systemctl enable postgresql redis-server nginx
systemctl restart postgresql redis-server

ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "Native production services are provisioned. Run deploy-native.sh as ${DEPLOY_USER}."
