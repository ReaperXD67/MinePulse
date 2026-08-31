#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/karixmc}"
ARCHIVE="${1:-}"
if [[ -z "${ARCHIVE}" || ! -f "${ARCHIVE}" ]]; then
  echo "Usage: RESTORE_CONFIRM=RESTORE $0 /absolute/path/to/backup.tar.gz[.age]" >&2
  exit 1
fi
if [[ "${RESTORE_CONFIRM:-}" != "RESTORE" ]]; then
  echo "Set RESTORE_CONFIRM=RESTORE after confirming the archive and destination." >&2
  exit 1
fi

cd "${APP_DIR}"
ENV_FILE="${APP_ENV_FILE:-.env.production}"
set -a
source "${ENV_FILE}"
set +a
COMPOSE=(docker compose --env-file "${ENV_FILE}" -f docker-compose.production.yml)
SHOWCASE_ENV_FILE="${SHOWCASE_ENV_FILE:-.env.showcase}"
TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TEMP_DIR}"' EXIT

./deploy/scripts/backup.sh

SOURCE_ARCHIVE="${ARCHIVE}"
if [[ "${ARCHIVE}" == *.age ]]; then
  : "${BACKUP_AGE_IDENTITY_FILE:?Set BACKUP_AGE_IDENTITY_FILE to decrypt this archive}"
  SOURCE_ARCHIVE="${TEMP_DIR}/backup.tar.gz"
  age -d -i "${BACKUP_AGE_IDENTITY_FILE}" -o "${SOURCE_ARCHIVE}" "${ARCHIVE}"
fi

tar -C "${TEMP_DIR}" -xzf "${SOURCE_ARCHIVE}"
RESTORE_DIR="$(find "${TEMP_DIR}" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
test -n "${RESTORE_DIR}" || { echo "Archive does not contain a restore directory" >&2; exit 1; }
(cd "${RESTORE_DIR}" && sha256sum -c SHA256SUMS)

SHOWCASE_RESTART=false
if [[ -f "${RESTORE_DIR}/showcase-worlds.tar.gz" ]]; then
  test -f "${SHOWCASE_ENV_FILE}" || { echo "Backup contains showcase worlds but ${SHOWCASE_ENV_FILE} is missing" >&2; exit 1; }
  set -a
  source "${SHOWCASE_ENV_FILE}"
  set +a
  SHOWCASE_ROOT="${SHOWCASE_DATA_ROOT:-/var/lib/karixmc/showcase}"
  [[ "${SHOWCASE_ROOT}" == /* && "${SHOWCASE_ROOT}" != "/" ]] || { echo "Refusing unsafe SHOWCASE_DATA_ROOT=${SHOWCASE_ROOT}" >&2; exit 1; }
  SHOWCASE_COMPOSE=(docker compose --env-file "${SHOWCASE_ENV_FILE}" -p karixmc-showcase -f docker-compose.showcase.yml)
  if [[ -n "$("${SHOWCASE_COMPOSE[@]}" ps -q 2>/dev/null)" ]]; then
    SHOWCASE_RESTART=true
  fi
  "${SHOWCASE_COMPOSE[@]}" stop
fi

if [[ "${DEPLOYMENT_MODE:-docker}" == "native" ]]; then
  if [[ "${EUID}" -ne 0 ]]; then
    echo "Native restore must run as root so application workers can be stopped safely." >&2
    exit 1
  fi
  systemctl stop karixmc-app@3000 karixmc-app@3001
  PGPASSWORD="${POSTGRES_PASSWORD}" pg_restore \
    -h 127.0.0.1 -U "${POSTGRES_USER:-karixmc}" -d "${POSTGRES_DB:-karixmc}" \
    --clean --if-exists --no-owner "${RESTORE_DIR}/database.dump"
else
  "${COMPOSE[@]}" stop app app_replica
  cat "${RESTORE_DIR}/database.dump" | "${COMPOSE[@]}" exec -T postgres pg_restore \
    -U "${POSTGRES_USER:-karixmc}" -d "${POSTGRES_DB:-karixmc}" \
    --clean --if-exists --no-owner
fi

MEDIA_PATH="${MEDIA_HOST_PATH:-/var/lib/karixmc/media}"
find "${MEDIA_PATH}" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
tar -C "${MEDIA_PATH}" -xzf "${RESTORE_DIR}/media.tar.gz"

if [[ -f "${RESTORE_DIR}/showcase-worlds.tar.gz" ]]; then
  install -d -m 0750 -o 1000 -g 1000 "${SHOWCASE_ROOT}"
  find "${SHOWCASE_ROOT}" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
  tar -C "${SHOWCASE_ROOT}" -xzf "${RESTORE_DIR}/showcase-worlds.tar.gz"
  chown -R 1000:1000 "${SHOWCASE_ROOT}"
fi

if [[ "${DEPLOYMENT_MODE:-docker}" == "native" ]]; then
  chown -R karixmc:karixmc "${MEDIA_PATH}"
  systemctl start karixmc-app@3000 karixmc-app@3001
else
  "${COMPOSE[@]}" up -d app app_replica
fi
if [[ "${SHOWCASE_RESTART}" == "true" ]]; then
  "${SHOWCASE_COMPOSE[@]}" up -d
fi
echo "Restore completed. Verify /api/health/ready and the latest account/ledger totals."
