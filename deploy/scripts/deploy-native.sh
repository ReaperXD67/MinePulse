#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/karixmc}"
ENV_FILE="${APP_ENV_FILE:-${APP_DIR}/.env.production}"
DEPLOY_USER="${DEPLOY_USER:-karixmc}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root." >&2
  exit 1
fi

cd "${APP_DIR}"

test -f "${ENV_FILE}" || { echo "${ENV_FILE} is missing" >&2; exit 1; }

set -a
source "${ENV_FILE}"
set +a

npm ci
npm run production:validate
npx prisma migrate deploy
npm run db:seed:production
npm run build
chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "${APP_DIR}/.next" /var/lib/karixmc/media

systemctl restart karixmc-app@3000 karixmc-app@3001
systemctl enable karixmc-app@3000 karixmc-app@3001

for attempt in {1..30}; do
  if curl --fail --silent http://127.0.0.1:3000/api/health/ready >/dev/null \
    && curl --fail --silent http://127.0.0.1:3001/api/health/ready >/dev/null; then
    echo "Native deployment is healthy on ports 3000 and 3001."
    exit 0
  fi
  sleep 2
done

journalctl -u karixmc-app@3000 -u karixmc-app@3001 --no-pager -n 200
echo "Native deployment did not become healthy; inspect the logs above." >&2
exit 1
