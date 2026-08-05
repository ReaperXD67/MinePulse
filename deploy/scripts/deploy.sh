#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/karixmc}"
cd "${APP_DIR}"

ENV_FILE="${APP_ENV_FILE:-.env.production}"
test -f "${ENV_FILE}" || { echo "${ENV_FILE} is missing" >&2; exit 1; }

set -a
source "${ENV_FILE}"
set +a

COMPOSE=(docker compose --env-file "${ENV_FILE}" -f docker-compose.production.yml)
"${COMPOSE[@]}" build app migrate
"${COMPOSE[@]}" run --rm migrate npm run production:validate
"${COMPOSE[@]}" up -d postgres redis
"${COMPOSE[@]}" run --rm migrate
"${COMPOSE[@]}" up -d app app_replica

for attempt in {1..30}; do
  if curl --fail --silent http://127.0.0.1:3000/api/health/ready >/dev/null \
    && curl --fail --silent http://127.0.0.1:3001/api/health/ready >/dev/null; then
    "${COMPOSE[@]}" ps
    echo "Deployment is healthy."
    exit 0
  fi
  sleep 2
done

"${COMPOSE[@]}" logs --tail=200 app app_replica
echo "Deployment did not become healthy; inspect the logs above." >&2
exit 1
