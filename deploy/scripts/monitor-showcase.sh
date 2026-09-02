#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/karixmc}"
PRODUCTION_ENV_FILE="${APP_ENV_FILE:-${APP_DIR}/.env.production}"
SHOWCASE_ENV_FILE="${SHOWCASE_ENV_FILE:-${APP_DIR}/.env.showcase}"
cd "${APP_DIR}"
set -a
source "${PRODUCTION_ENV_FILE}"
source "${SHOWCASE_ENV_FILE}"
set +a

COMPOSE=(docker compose --env-file "${SHOWCASE_ENV_FILE}" -p karixmc-showcase -f docker-compose.showcase.yml)
EXPECTED_SERVICES=(skyforge ember voidcraft)
EXPECTED_IDS=(demo-server-skyforge demo-server-ember demo-server-voidcraft)
EXPECTED_PORTS=(25565 25566 25567)
FAILURES=()

auth_container_id="$("${COMPOSE[@]}" ps -q auth-db)"
if [[ -z "${auth_container_id}" ]]; then
  FAILURES+=("auth-db container is missing")
else
  auth_state="$(docker inspect --format '{{.State.Status}}/{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' "${auth_container_id}")"
  [[ "${auth_state}" == "running/healthy" ]] || FAILURES+=("auth-db is ${auth_state}")
fi

for index in "${!EXPECTED_SERVICES[@]}"; do
  service="${EXPECTED_SERVICES[$index]}"
  port="${EXPECTED_PORTS[$index]}"
  container_id="$("${COMPOSE[@]}" ps -q "${service}")"
  if [[ -z "${container_id}" ]]; then
    FAILURES+=("${service} container is missing")
    continue
  fi
  state="$(docker inspect --format '{{.State.Status}}/{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' "${container_id}")"
  [[ "${state}" == "running/healthy" ]] || FAILURES+=("${service} is ${state}")
  timeout 3 bash -c "</dev/tcp/127.0.0.1/${port}" 2>/dev/null || FAILURES+=("${service} port ${port} is not accepting TCP connections")
  plugin_list="$("${COMPOSE[@]}" exec -T "${service}" rcon-cli plugins 2>/dev/null || true)"
  for expected_plugin in ProtocolLib AuthMe ViaVersion ViaBackwards KarixMCBridge; do
    grep -Fq "${expected_plugin}" <<<"${plugin_list}" || FAILURES+=("${service} is missing ${expected_plugin}")
  done
done

LIVE_RESPONSE="$(mktemp)"
trap 'rm -f "${LIVE_RESPONSE}"' EXIT
LIVE_URL="${APP_BASE_URL%/}/api/marketplace/live"
if curl --fail --silent --show-error --connect-timeout 5 --max-time 12 -o "${LIVE_RESPONSE}" "${LIVE_URL}"; then
  for server_id in "${EXPECTED_IDS[@]}"; do
    jq -e --arg server_id "${server_id}" '.serverIds | index($server_id) != null' "${LIVE_RESPONSE}" >/dev/null \
      || FAILURES+=("${server_id} is absent from the public live directory")
  done
else
  FAILURES+=("public live-directory request failed")
fi

if [[ "${#FAILURES[@]}" -eq 0 ]]; then
  exit 0
fi

MESSAGE="KarixMC showcase health check failed on $(hostname): $(IFS='; '; echo "${FAILURES[*]}")"
if [[ -n "${ALERT_WEBHOOK_URL:-}" ]]; then
  PAYLOAD="$(jq -n --arg message "${MESSAGE}" '{content: $message, text: $message}')"
  curl --silent --show-error --max-time 10 -H "Content-Type: application/json" -d "${PAYLOAD}" "${ALERT_WEBHOOK_URL}" >/dev/null || true
fi
echo "${MESSAGE}" >&2
exit 1
