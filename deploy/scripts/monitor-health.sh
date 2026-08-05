#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/karixmc}"
cd "${APP_DIR}"
ENV_FILE="${APP_ENV_FILE:-.env.production}"
set -a
source "${ENV_FILE}"
set +a

: "${APP_BASE_URL:?APP_BASE_URL is required}"
: "${HEALTHCHECK_TOKEN:?HEALTHCHECK_TOKEN is required}"
HEALTH_BASE_URL="${HEALTHCHECK_BASE_URL:-${APP_BASE_URL}}"
HEALTH_URL="${HEALTH_BASE_URL%/}/api/health/ready"
TEMP_RESPONSE="$(mktemp)"
trap 'rm -f "${TEMP_RESPONSE}"' EXIT

for attempt in 1 2 3; do
  if curl --fail --silent --show-error \
    --connect-timeout 5 --max-time 12 \
    -H "Authorization: Bearer ${HEALTHCHECK_TOKEN}" \
    -o "${TEMP_RESPONSE}" "${HEALTH_URL}"; then
    exit 0
  fi
  sleep "$((attempt * 2))"
done

MESSAGE="KarixMC production readiness check failed at ${HEALTH_URL} on $(hostname)"
if [[ -n "${ALERT_WEBHOOK_URL:-}" ]]; then
  PAYLOAD="$(jq -n --arg message "${MESSAGE}" '{content: $message, text: $message}')"
  curl --silent --show-error --max-time 10 \
    -H "Content-Type: application/json" \
    -d "${PAYLOAD}" "${ALERT_WEBHOOK_URL}" >/dev/null || true
fi

echo "${MESSAGE}" >&2
cat "${TEMP_RESPONSE}" >&2 || true
exit 1
