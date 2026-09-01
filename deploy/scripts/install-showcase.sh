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

EXPECTED_PLUGIN_SHA256="68F30E479E47D978C6BD037C5F040156694EFEC2153A9A295BD1E9A896E6AA00"
ACTUAL_PLUGIN_SHA256="$(sha256sum public/downloads/KarixMCBridge-0.6.4.jar | awk '{print toupper($1)}')"
[[ "${ACTUAL_PLUGIN_SHA256}" == "${EXPECTED_PLUGIN_SHA256}" ]] || { echo "Bridge JAR checksum mismatch" >&2; exit 1; }

AUTHME_VERSION="6.0.0"
VIAVERSION_VERSION="5.11.0"
VIABACKWARDS_VERSION="5.11.0"
AUTHME_SHA256="58948FCBC697497506257D09D8A7909BF48DE6AEFE7BEC6BA5AB4C41BE41B7B8"
VIAVERSION_SHA256="18D19E90FC9467D68128C076630AE8700449C901402A3EF421837CE006BC8CAE"
VIABACKWARDS_SHA256="B21983D561E3F92DF257683F0133AB6C68EC68175E8ACFD82C6231723BF83587"

if [[ ! -f "${SHOWCASE_ENV_FILE}" ]]; then
  umask 077
  SKYFORGE_SECRET="$(openssl rand -hex 48)"
  EMBER_SECRET="$(openssl rand -hex 48)"
  VOIDCRAFT_SECRET="$(openssl rand -hex 48)"
  RCON_PASSWORD="$(openssl rand -hex 32)"
  AUTH_DB_PASSWORD="$(openssl rand -hex 32)"
  TEMP_ENV="$(mktemp "${APP_DIR}/.env.showcase.XXXXXX")"
  printf '%s\n' \
    'SHOWCASE_OWNER_EMAIL=karixai@proton.me' \
    'SHOWCASE_PUBLIC_HOST=karixmc.pl' \
    'SHOWCASE_API_BASE_URL=https://karixmc.pl' \
    'SHOWCASE_DATA_ROOT=/var/lib/karixmc/showcase' \
    'SHOWCASE_PLUGIN_ROOT=/var/lib/karixmc/showcase-plugins' \
    'SHOWCASE_TIMEZONE=UTC' \
    'SHOWCASE_ONLINE_MODE=FALSE' \
    'SHOWCASE_ENFORCE_SECURE_PROFILE=FALSE' \
    "SHOWCASE_SKYFORGE_SECRET=${SKYFORGE_SECRET}" \
    "SHOWCASE_EMBER_SECRET=${EMBER_SECRET}" \
    "SHOWCASE_VOIDCRAFT_SECRET=${VOIDCRAFT_SECRET}" \
    "SHOWCASE_RCON_PASSWORD=${RCON_PASSWORD}" \
    "SHOWCASE_AUTH_DB_PASSWORD=${AUTH_DB_PASSWORD}" > "${TEMP_ENV}"
  install -m 0600 -o root -g root "${TEMP_ENV}" "${SHOWCASE_ENV_FILE}"
  rm -f "${TEMP_ENV}"
  unset SKYFORGE_SECRET EMBER_SECRET VOIDCRAFT_SECRET RCON_PASSWORD AUTH_DB_PASSWORD
fi

append_showcase_setting() {
  local key="$1"
  local value="$2"
  if ! grep -q "^${key}=" "${SHOWCASE_ENV_FILE}"; then
    printf '%s=%s\n' "${key}" "${value}" >> "${SHOWCASE_ENV_FILE}"
  fi
}

# Existing premium-only installations are upgraded explicitly into the beta policy.
append_showcase_setting SHOWCASE_PLUGIN_ROOT /var/lib/karixmc/showcase-plugins
append_showcase_setting SHOWCASE_ONLINE_MODE FALSE
append_showcase_setting SHOWCASE_ENFORCE_SECURE_PROFILE FALSE
if ! grep -q '^SHOWCASE_AUTH_DB_PASSWORD=' "${SHOWCASE_ENV_FILE}"; then
  append_showcase_setting SHOWCASE_AUTH_DB_PASSWORD "$(openssl rand -hex 32)"
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
: "${SHOWCASE_AUTH_DB_PASSWORD:?SHOWCASE_AUTH_DB_PASSWORD is required}"
: "${SHOWCASE_DATA_ROOT:?SHOWCASE_DATA_ROOT is required}"
: "${SHOWCASE_PLUGIN_ROOT:?SHOWCASE_PLUGIN_ROOT is required}"
[[ "${SHOWCASE_API_BASE_URL:-}" == https://* ]] || { echo "SHOWCASE_API_BASE_URL must use HTTPS" >&2; exit 1; }
[[ "${SHOWCASE_DATA_ROOT}" == /* && "${SHOWCASE_DATA_ROOT}" != "/" ]] || { echo "SHOWCASE_DATA_ROOT must be a safe absolute path" >&2; exit 1; }
[[ "${SHOWCASE_PLUGIN_ROOT}" == /* && "${SHOWCASE_PLUGIN_ROOT}" != "/" ]] || { echo "SHOWCASE_PLUGIN_ROOT must be a safe absolute path" >&2; exit 1; }
[[ "${#SHOWCASE_AUTH_DB_PASSWORD}" -ge 32 ]] || { echo "SHOWCASE_AUTH_DB_PASSWORD must contain at least 32 characters" >&2; exit 1; }

install -d -m 0755 -o root -g root "${SHOWCASE_PLUGIN_ROOT}"

download_plugin() {
  local filename="$1"
  local url="$2"
  local expected_sha="$3"
  local target="${SHOWCASE_PLUGIN_ROOT}/${filename}"
  local actual_sha=""

  if [[ -f "${target}" ]]; then
    actual_sha="$(sha256sum "${target}" | awk '{print toupper($1)}')"
  fi
  if [[ "${actual_sha}" == "${expected_sha}" ]]; then
    return
  fi

  local temporary
  temporary="$(mktemp "${SHOWCASE_PLUGIN_ROOT}/.${filename}.XXXXXX")"
  if ! curl --fail --location --silent --show-error --retry 3 --output "${temporary}" "${url}"; then
    rm -f "${temporary}"
    return 1
  fi
  actual_sha="$(sha256sum "${temporary}" | awk '{print toupper($1)}')"
  if [[ "${actual_sha}" != "${expected_sha}" ]]; then
    rm -f "${temporary}"
    echo "${filename} checksum mismatch" >&2
    return 1
  fi
  install -m 0644 -o root -g root "${temporary}" "${target}"
  rm -f "${temporary}"
}

download_plugin \
  "AuthMe-${AUTHME_VERSION}-Paper.jar" \
  "https://github.com/AuthMe/AuthMeReloaded/releases/download/${AUTHME_VERSION}/AuthMe-${AUTHME_VERSION}-Paper.jar" \
  "${AUTHME_SHA256}"
download_plugin \
  "ViaVersion-${VIAVERSION_VERSION}.jar" \
  "https://github.com/ViaVersion/ViaVersion/releases/download/${VIAVERSION_VERSION}/ViaVersion-${VIAVERSION_VERSION}.jar" \
  "${VIAVERSION_SHA256}"
download_plugin \
  "ViaBackwards-${VIABACKWARDS_VERSION}.jar" \
  "https://github.com/ViaVersion/ViaBackwards/releases/download/${VIABACKWARDS_VERSION}/ViaBackwards-${VIABACKWARDS_VERSION}.jar" \
  "${VIABACKWARDS_SHA256}"

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

# Let AuthMe create a version-matched default config, then harden it and point all
# worlds at one private PostgreSQL database. This makes registration shared while
# still requiring a fresh login on every connection.
systemctl stop karixmc-showcase.service >/dev/null 2>&1 || true
"${SHOWCASE_COMPOSE[@]}" up -d auth-db skyforge ember voidcraft

for attempt in {1..72}; do
  if [[ -f "${SHOWCASE_DATA_ROOT}/skyforge/plugins/AuthMe/config.yml" ]] \
    && [[ -f "${SHOWCASE_DATA_ROOT}/ember/plugins/AuthMe/config.yml" ]] \
    && [[ -f "${SHOWCASE_DATA_ROOT}/voidcraft/plugins/AuthMe/config.yml" ]]; then
    break
  fi
  if [[ "${attempt}" -eq 72 ]]; then
    "${SHOWCASE_COMPOSE[@]}" logs --tail=200
    echo "AuthMe did not create its configuration within six minutes." >&2
    exit 1
  fi
  sleep 5
done

"${SHOWCASE_COMPOSE[@]}" stop skyforge ember voidcraft

configure_authme() {
  local config="$1"
  local server_name="$2"
  sed -i \
    -e 's/^    backend: SQLITE$/    backend: POSTGRESQL/' \
    -e 's/^    caching: true$/    caching: false/' \
    -e 's/^    mySQLHost: 127\.0\.0\.1$/    mySQLHost: auth-db/' \
    -e "s/^    mySQLPort: '3306'$/    mySQLPort: '5432'/" \
    -e 's/^    mySQLUseSSL: true$/    mySQLUseSSL: false/' \
    -e 's/^    mySQLCheckServerCertificate: true$/    mySQLCheckServerCertificate: false/' \
    -e "s/^    mySQLPassword:.*$/    mySQLPassword: '${SHOWCASE_AUTH_DB_PASSWORD}'/" \
    -e 's/^    poolSize: 10$/    poolSize: 5/' \
    -e 's/^    logLevel: FINE$/    logLevel: INFO/' \
    -e "s/^    serverName:.*$/    serverName: '${server_name}'/" \
    -e 's/^        maxRegPerIp: 1$/        maxRegPerIp: 3/' \
    -e 's/^        minPasswordLength: 5$/        minPasswordLength: 10/' \
    -e 's/^        passwordMaxLength: 30$/        passwordMaxLength: 64/' \
    -e 's/^        passwordHash: SHA256$/        passwordHash: BCRYPT/' \
    "${config}"
  grep -q '^    backend: POSTGRESQL$' "${config}" || { echo "AuthMe database backend was not configured" >&2; exit 1; }
  grep -q '^    mySQLHost: auth-db$' "${config}" || { echo "AuthMe database host was not configured" >&2; exit 1; }
  grep -q '^        minPasswordLength: 10$' "${config}" || { echo "AuthMe password policy was not configured" >&2; exit 1; }
  grep -q '^        passwordHash: BCRYPT$' "${config}" || { echo "AuthMe password hashing was not configured" >&2; exit 1; }
  chown 1000:1000 "${config}"
  chmod 0600 "${config}"
}

configure_authme "${SHOWCASE_DATA_ROOT}/skyforge/plugins/AuthMe/config.yml" "Skyforge Economy"
configure_authme "${SHOWCASE_DATA_ROOT}/ember/plugins/AuthMe/config.yml" "Ember SMP"
configure_authme "${SHOWCASE_DATA_ROOT}/voidcraft/plugins/AuthMe/config.yml" "Voidcraft Hardcore"

systemctl enable --now karixmc-showcase.service

for attempt in {1..72}; do
  if "${SHOWCASE_COMPOSE[@]}" ps --format json skyforge ember voidcraft | jq -s -e '
      length == 3 and all(.[]; .State == "running" and .Health == "healthy")
    ' >/dev/null 2>&1 \
    && "${SHOWCASE_COMPOSE[@]}" ps --format json auth-db | jq -s -e '
      length == 1 and all(.[]; .State == "running" and .Health == "healthy")
    ' >/dev/null 2>&1; then
    systemctl enable --now karixmc-showcase-health.timer
    "${PRODUCTION_COMPOSE[@]}" run --rm migrate npm run showcase:audit
    ./deploy/scripts/monitor-showcase.sh
    "${SHOWCASE_COMPOSE[@]}" ps
    echo "KarixMC official showcase is healthy on ports 25565-25567."
    exit 0
  fi
  sleep 5
done

"${SHOWCASE_COMPOSE[@]}" logs --tail=200
echo "Showcase servers did not become healthy within six minutes." >&2
exit 1
