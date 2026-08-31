#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root." >&2
  exit 1
fi

APP_DIR="${APP_DIR:-/opt/karixmc}"
PRODUCTION_ENV_FILE="${APP_ENV_FILE:-${APP_DIR}/.env.production}"
SHOWCASE_ENV_FILE="${SHOWCASE_ENV_FILE:-${APP_DIR}/.env.showcase}"
cd "${APP_DIR}"
test -f "${PRODUCTION_ENV_FILE}" || { echo "${PRODUCTION_ENV_FILE} is missing" >&2; exit 1; }
test -f public/downloads/KarixMCBridge-0.6.4.jar || { echo "KarixMCBridge-0.6.4.jar is missing" >&2; exit 1; }

EXPECTED_PLUGIN_SHA256="68F30C5BB70B6B1A34E57D51356F691A186CD844394A4FE0463DD7AF50A8AA00"
ACTUAL_PLUGIN_SHA256="$(sha256sum public/downloads/KarixMCBridge-0.6.4.jar | awk '{print toupper($1)}')"
[[ "${ACTUAL_PLUGIN_SHA256}" == "${EXPECTED_PLUGIN_SHA256}" ]] || { echo "Bridge JAR checksum mismatch" >&2; exit 1; }

if [[ ! -f "${SHOWCASE_ENV_FILE}" ]]; then
  umask 077
  SKYFORGE_SECRET="$(openssl rand -hex 48)"
  EMBER_SECRET="$(openssl rand -hex 48)"
  VOIDCRAFT_SECRET="$(openssl rand -hex 48)"
  RCON_PASSWORD="$(openssl rand -hex 32)"
  TEMP_ENV="$(mktemp "${APP_DIR}/.env.showcase.XXXXXX")"
  printf '%s\n' \
    'SHOWCASE_OWNER_EMAIL=karixai@proton.me' \
    'SHOWCASE_PUBLIC_HOST=karixmc.pl' \
    'SHOWCASE_API_BASE_URL=https://karixmc.pl' \
    'SHOWCASE_DATA_ROOT=/var/lib/karixmc/showcase' \
    'SHOWCASE_TIMEZONE=UTC' \
    "SHOWCASE_SKYFORGE_SECRET=${SKYFORGE_SECRET}" \
    "SHOWCASE_EMBER_SECRET=${EMBER_SECRET}" \
    "SHOWCASE_VOIDCRAFT_SECRET=${VOIDCRAFT_SECRET}" \
    "SHOWCASE_RCON_PASSWORD=${RCON_PASSWORD}" > "${TEMP_ENV}"
  install -m 0600 -o root -g root "${TEMP_ENV}" "${SHOWCASE_ENV_FILE}"
  rm -f "${TEMP_ENV}"
  unset SKYFORGE_SECRET EMBER_SECRET VOIDCRAFT_SECRET RCON_PASSWORD
fi
chmod 0600 "${SHOWCASE_ENV_FILE}"
chown root:root "${SHOWCASE_ENV_FILE}"

set -a
source "${PRODUCTION_ENV_FILE}"
source "${SHOWCASE_ENV_FILE}"
set +a

: "${SHOWCASE_SKYFORGE_SECRET:?SHOWCASE_SKYFORGE_SECRET is required}"
: "${SHOWCASE_EMBER_SECRET:?SHOWCASE_EMBER_SECRET is required}"
: "${SHOWCASE_VOIDCRAFT_SECRET:?SHOWCASE_VOIDCRAFT_SECRET is required}"
: "${SHOWCASE_RCON_PASSWORD:?SHOWCASE_RCON_PASSWORD is required}"
: "${SHOWCASE_DATA_ROOT:?SHOWCASE_DATA_ROOT is required}"
[[ "${SHOWCASE_API_BASE_URL:-}" == https://* ]] || { echo "SHOWCASE_API_BASE_URL must use HTTPS" >&2; exit 1; }
[[ "${SHOWCASE_DATA_ROOT}" == /* && "${SHOWCASE_DATA_ROOT}" != "/" ]] || { echo "SHOWCASE_DATA_ROOT must be a safe absolute path" >&2; exit 1; }

install -d -m 0750 -o 1000 -g 1000 \
  "${SHOWCASE_DATA_ROOT}" \
  "${SHOWCASE_DATA_ROOT}/skyforge" \
  "${SHOWCASE_DATA_ROOT}/ember" \
  "${SHOWCASE_DATA_ROOT}/voidcraft"

PRODUCTION_COMPOSE=(docker compose --env-file "${PRODUCTION_ENV_FILE}" -f docker-compose.production.yml)
SHOWCASE_COMPOSE=(docker compose --env-file "${SHOWCASE_ENV_FILE}" -p karixmc-showcase -f docker-compose.showcase.yml)

"${SHOWCASE_COMPOSE[@]}" config --quiet
"${PRODUCTION_COMPOSE[@]}" build migrate
"${PRODUCTION_COMPOSE[@]}" run --rm migrate
"${PRODUCTION_COMPOSE[@]}" run --rm \
  -e SHOWCASE_OWNER_EMAIL="${SHOWCASE_OWNER_EMAIL:-karixai@proton.me}" \
  -e SHOWCASE_PUBLIC_HOST="${SHOWCASE_PUBLIC_HOST:-karixmc.pl}" \
  -e SHOWCASE_SKYFORGE_SECRET="${SHOWCASE_SKYFORGE_SECRET}" \
  -e SHOWCASE_EMBER_SECRET="${SHOWCASE_EMBER_SECRET}" \
  -e SHOWCASE_VOIDCRAFT_SECRET="${SHOWCASE_VOIDCRAFT_SECRET}" \
  migrate npm run showcase:bootstrap

if command -v ufw >/dev/null && ufw status | grep -q '^Status: active'; then
  ufw allow 25565:25567/tcp comment 'KarixMC official showcase servers'
fi

install -m 0644 deploy/systemd/karixmc-showcase.service /etc/systemd/system/karixmc-showcase.service
install -m 0644 deploy/systemd/karixmc-showcase-health.service /etc/systemd/system/karixmc-showcase-health.service
install -m 0644 deploy/systemd/karixmc-showcase-health.timer /etc/systemd/system/karixmc-showcase-health.timer
chmod 0755 deploy/scripts/monitor-showcase.sh
systemctl daemon-reload
systemctl enable --now karixmc-showcase.service

for attempt in {1..72}; do
  if "${SHOWCASE_COMPOSE[@]}" ps --format json | jq -e '
      length == 3 and all(.[]; .State == "running" and .Health == "healthy")
    ' >/dev/null 2>&1; then
    systemctl enable --now karixmc-showcase-health.timer
    SHOWCASE_REQUIRE_PUBLIC_LIVE=true "${PRODUCTION_COMPOSE[@]}" run --rm \
      -e SHOWCASE_REQUIRE_PUBLIC_LIVE=true \
      migrate npm run showcase:audit
    "${SHOWCASE_COMPOSE[@]}" ps
    echo "KarixMC official showcase is healthy on ports 25565-25567."
    exit 0
  fi
  sleep 5
done

"${SHOWCASE_COMPOSE[@]}" logs --tail=200
echo "Showcase servers did not become healthy within six minutes." >&2
exit 1
