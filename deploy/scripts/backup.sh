#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/karixmc}"
cd "${APP_DIR}"
ENV_FILE="${APP_ENV_FILE:-.env.production}"
set -a
source "${ENV_FILE}"
set +a

BACKUP_DIRECTORY="${BACKUP_DIRECTORY:-/var/backups/karixmc}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
WORK_DIR="${BACKUP_DIRECTORY}/${STAMP}"
COMPOSE=(docker compose --env-file "${ENV_FILE}" -f docker-compose.production.yml)

install -d -m 0700 "${WORK_DIR}"
"${COMPOSE[@]}" exec -T postgres pg_dump \
  -U "${POSTGRES_USER:-karixmc}" -d "${POSTGRES_DB:-karixmc}" -Fc > "${WORK_DIR}/database.dump"
tar -C "${MEDIA_HOST_PATH:-/var/lib/karixmc/media}" -czf "${WORK_DIR}/media.tar.gz" .
(cd "${WORK_DIR}" && sha256sum database.dump media.tar.gz > SHA256SUMS)

ARCHIVE="${BACKUP_DIRECTORY}/karixmc-${STAMP}.tar.gz"
tar -C "${BACKUP_DIRECTORY}" -czf "${ARCHIVE}" "${STAMP}"
rm -rf "${WORK_DIR}"

if [[ -n "${BACKUP_AGE_RECIPIENT:-}" ]]; then
  age -r "${BACKUP_AGE_RECIPIENT}" -o "${ARCHIVE}.age" "${ARCHIVE}"
  rm -f "${ARCHIVE}"
  ARCHIVE="${ARCHIVE}.age"
fi

if [[ -n "${BACKUP_REMOTE:-}" ]]; then
  command -v rclone >/dev/null || { echo "BACKUP_REMOTE requires rclone" >&2; exit 1; }
  rclone copy "${ARCHIVE}" "${BACKUP_REMOTE}"
fi

find "${BACKUP_DIRECTORY}" -maxdepth 1 -type f -name 'karixmc-*' -mtime "+${BACKUP_RETENTION_DAYS}" -delete
echo "Backup created: ${ARCHIVE}"
