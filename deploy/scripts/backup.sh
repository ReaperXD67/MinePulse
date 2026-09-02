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
SHOWCASE_ENV_FILE="${SHOWCASE_ENV_FILE:-.env.showcase}"
SHOWCASE_SAVES_PAUSED=()
SHOWCASE_SERVERS_STOPPED=false

resume_showcase_saves() {
  if [[ "${#SHOWCASE_SAVES_PAUSED[@]}" -eq 0 ]]; then return; fi
  if [[ "${SHOWCASE_SERVERS_STOPPED}" == "true" ]]; then
    "${SHOWCASE_COMPOSE[@]}" up -d "${SHOWCASE_SAVES_PAUSED[@]}" >/dev/null 2>&1 || true
  else
    for service in "${SHOWCASE_SAVES_PAUSED[@]}"; do
      "${SHOWCASE_COMPOSE[@]}" exec -T "${service}" rcon-cli save-on >/dev/null 2>&1 || true
    done
  fi
  SHOWCASE_SAVES_PAUSED=()
  SHOWCASE_SERVERS_STOPPED=false
}
trap resume_showcase_saves EXIT

install -d -m 0700 "${WORK_DIR}"
if [[ "${DEPLOYMENT_MODE:-docker}" == "native" ]]; then
  PGPASSWORD="${POSTGRES_PASSWORD}" pg_dump \
    -h 127.0.0.1 -U "${POSTGRES_USER:-karixmc}" -d "${POSTGRES_DB:-karixmc}" \
    -Fc > "${WORK_DIR}/database.dump"
else
  "${COMPOSE[@]}" exec -T postgres pg_dump \
    -U "${POSTGRES_USER:-karixmc}" -d "${POSTGRES_DB:-karixmc}" -Fc > "${WORK_DIR}/database.dump"
fi
tar -C "${MEDIA_HOST_PATH:-/var/lib/karixmc/media}" -czf "${WORK_DIR}/media.tar.gz" .
BACKUP_FILES=(database.dump media.tar.gz)

if [[ -f "${SHOWCASE_ENV_FILE}" ]]; then
  set -a
  source "${SHOWCASE_ENV_FILE}"
  set +a
  SHOWCASE_ROOT="${SHOWCASE_DATA_ROOT:-/var/lib/karixmc/showcase}"
  if [[ "${SHOWCASE_ROOT}" == /* && "${SHOWCASE_ROOT}" != "/" && -d "${SHOWCASE_ROOT}" ]]; then
    SHOWCASE_COMPOSE=(docker compose --env-file "${SHOWCASE_ENV_FILE}" -p karixmc-showcase -f docker-compose.showcase.yml)
    auth_container_id="$("${SHOWCASE_COMPOSE[@]}" ps -q auth-db)"
    if [[ -n "${auth_container_id}" ]] && [[ "$(docker inspect --format '{{.State.Status}}' "${auth_container_id}")" == "running" ]]; then
      "${SHOWCASE_COMPOSE[@]}" exec -T auth-db pg_dump -U authme -d authme -Fc > "${WORK_DIR}/showcase-auth.dump"
      BACKUP_FILES+=(showcase-auth.dump)
    fi
    for service in skyforge ember voidcraft; do
      container_id="$("${SHOWCASE_COMPOSE[@]}" ps -q "${service}")"
      if [[ -n "${container_id}" ]] && [[ "$(docker inspect --format '{{.State.Status}}' "${container_id}")" == "running" ]]; then
        "${SHOWCASE_COMPOSE[@]}" exec -T "${service}" rcon-cli save-off >/dev/null
        SHOWCASE_SAVES_PAUSED+=("${service}")
        "${SHOWCASE_COMPOSE[@]}" exec -T "${service}" rcon-cli save-all flush >/dev/null
      fi
    done
    if [[ "${#SHOWCASE_SAVES_PAUSED[@]}" -gt 0 ]]; then
      "${SHOWCASE_COMPOSE[@]}" stop "${SHOWCASE_SAVES_PAUSED[@]}" >/dev/null
      SHOWCASE_SERVERS_STOPPED=true
    fi
    tar -C "${SHOWCASE_ROOT}" -czf "${WORK_DIR}/showcase-worlds.tar.gz" .
    BACKUP_FILES+=(showcase-worlds.tar.gz)
    resume_showcase_saves
  fi
fi

(cd "${WORK_DIR}" && sha256sum "${BACKUP_FILES[@]}" > SHA256SUMS)

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
