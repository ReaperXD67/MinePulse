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

"${COMPOSE[@]}" stop app app_replica
cat "${RESTORE_DIR}/database.dump" | "${COMPOSE[@]}" exec -T postgres pg_restore \
  -U "${POSTGRES_USER:-karixmc}" -d "${POSTGRES_DB:-karixmc}" \
  --clean --if-exists --no-owner

MEDIA_PATH="${MEDIA_HOST_PATH:-/var/lib/karixmc/media}"
find "${MEDIA_PATH}" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
tar -C "${MEDIA_PATH}" -xzf "${RESTORE_DIR}/media.tar.gz"

"${COMPOSE[@]}" up -d app app_replica
echo "Restore completed. Verify /api/health/ready and the latest account/ledger totals."
