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
  bridge_version="$("${COMPOSE[@]}" exec -T "${service}" rcon-cli version KarixMCBridge 2>/dev/null || true)"
  grep -Fq "0.6.5" <<<"${bridge_version}" || FAILURES+=("${service} is not running KarixMCBridge 0.6.5")
  auth_policy="$("${COMPOSE[@]}" exec -T "${service}" sh -lc \
    'grep -E "^(        minPasswordLength: 10|        passwordMaxLength: 64|        passwordHash: BCRYPT)$" /data/plugins/AuthMe/config.yml' \
    2>/dev/null || true)"
  [[ "$(wc -l <<<"${auth_policy}")" -eq 3 ]] || FAILURES+=("${service} AuthMe password policy drifted")
  auth_message="$("${COMPOSE[@]}" exec -T "${service}" sh -lc \
    'grep -F "wrong_length: \"&cUse 10-64 characters for your Minecraft password.\"" /data/plugins/AuthMe/messages/messages_en.yml' \
    2>/dev/null || true)"
  [[ -n "${auth_message}" ]] || FAILURES+=("${service} AuthMe password guidance drifted")

  operator_names="$("${COMPOSE[@]}" exec -T "${service}" cat /data/ops.json 2>/dev/null | jq -r '.[].name' 2>/dev/null || true)"
  while IFS= read -r operator_name; do
    [[ -z "${operator_name}" ]] && continue
    if [[ ! "${operator_name}" =~ ^[A-Za-z0-9_]{3,16}$ ]]; then
      FAILURES+=("${service} has an invalid offline-mode operator name")
      continue
    fi
    operator_registered="$("${COMPOSE[@]}" exec -T auth-db psql -U authme -d authme -Atc \
      "SELECT count(*) FROM authme WHERE lower(username) = lower('${operator_name}')" 2>/dev/null || true)"
    [[ "${operator_registered}" == "1" ]] || FAILURES+=("${service} operator ${operator_name} is not registered in AuthMe")
  done <<<"${operator_names}"
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
