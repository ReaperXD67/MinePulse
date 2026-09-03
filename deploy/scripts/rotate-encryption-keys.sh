#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root." >&2
  exit 1
fi

REPO_ROOT="${REPO_ROOT:-/opt/karixmc}"
ENV_FILE="${APP_ENV_FILE:-${REPO_ROOT}/.env.production}"
cd "${REPO_ROOT}"
[[ -f "${ENV_FILE}" ]] || { echo "Production environment file not found." >&2; exit 1; }
command -v jq >/dev/null || { echo "jq is required." >&2; exit 1; }
command -v openssl >/dev/null || { echo "openssl is required." >&2; exit 1; }

umask 077
exec 9>"/run/lock/karixmc-key-rotation.lock"
flock -n 9 || { echo "Another KarixMC key rotation is running." >&2; exit 1; }

read_env_value() {
  local key="$1"
  awk -v key="${key}" '
    index($0, key "=") == 1 {
      value = substr($0, length(key) + 2)
      if (value ~ /^".*"$/) value = substr(value, 2, length(value) - 2)
      print value
      exit
    }
  ' "${ENV_FILE}"
}

old_plugin_key="$(read_env_value PLUGIN_SECRET_ENCRYPTION_KEY)"
old_mfa_key="$(read_env_value ACCOUNT_MFA_ENCRYPTION_KEY)"
[[ ${#old_plugin_key} -ge 32 && ${#old_mfa_key} -ge 32 ]] || { echo "Existing encryption keys are missing or too short." >&2; exit 1; }

new_plugin_key="$(openssl rand -base64 48 | tr -d '\n')"
new_mfa_key="$(openssl rand -base64 48 | tr -d '\n')"
rotation_file="$(mktemp /run/karixmc-key-rotation.XXXXXX.json)"
next_env="$(mktemp "${ENV_FILE}.next.XXXXXX")"
rotated=0
installed=0

compose=(docker compose --env-file "${ENV_FILE}" -p karixmc -f docker-compose.production.yml)

cleanup_and_recover() {
  local status=$?
  trap - EXIT
  if [[ "${status}" -ne 0 && "${rotated}" -eq 1 && "${installed}" -eq 0 ]]; then
    "${compose[@]}" run --rm --no-deps \
      -v "${rotation_file}:/run/secrets/rotation.json:ro" \
      migrate npm run security:rotate-encryption-keys -- /run/secrets/rotation.json --reverse >/dev/null 2>&1 || true
  fi
  "${compose[@]}" up -d app app_replica >/dev/null 2>&1 || true
  rm -f "${rotation_file}" "${next_env}"
  unset old_plugin_key old_mfa_key new_plugin_key new_mfa_key KARIXMC_OLD_PLUGIN_KEY KARIXMC_OLD_MFA_KEY KARIXMC_NEW_PLUGIN_KEY KARIXMC_NEW_MFA_KEY
  exit "${status}"
}
trap cleanup_and_recover EXIT

export KARIXMC_OLD_PLUGIN_KEY="${old_plugin_key}"
export KARIXMC_OLD_MFA_KEY="${old_mfa_key}"
export KARIXMC_NEW_PLUGIN_KEY="${new_plugin_key}"
export KARIXMC_NEW_MFA_KEY="${new_mfa_key}"
jq -n \
  '{oldPluginKey:env.KARIXMC_OLD_PLUGIN_KEY,newPluginKey:env.KARIXMC_NEW_PLUGIN_KEY,oldMfaKey:env.KARIXMC_OLD_MFA_KEY,newMfaKey:env.KARIXMC_NEW_MFA_KEY}' \
  > "${rotation_file}"
awk '
  /^PLUGIN_SECRET_ENCRYPTION_KEY=/ {
    print "PLUGIN_SECRET_ENCRYPTION_KEY=\"" ENVIRON["KARIXMC_NEW_PLUGIN_KEY"] "\""
    plugin += 1
    next
  }
  /^ACCOUNT_MFA_ENCRYPTION_KEY=/ {
    print "ACCOUNT_MFA_ENCRYPTION_KEY=\"" ENVIRON["KARIXMC_NEW_MFA_KEY"] "\""
    mfa += 1
    next
  }
  { print }
  END { if (plugin != 1 || mfa != 1) exit 42 }
' "${ENV_FILE}" > "${next_env}"
chmod --reference="${ENV_FILE}" "${next_env}"
chown --reference="${ENV_FILE}" "${next_env}"

"${compose[@]}" stop app app_replica
"${compose[@]}" run --rm --no-deps \
  -v "${rotation_file}:/run/secrets/rotation.json:ro" \
  migrate npm run security:rotate-encryption-keys -- /run/secrets/rotation.json
rotated=1
mv -f -- "${next_env}" "${ENV_FILE}"
installed=1

compose=(docker compose --env-file "${ENV_FILE}" -p karixmc -f docker-compose.production.yml)
"${compose[@]}" up -d --force-recreate app app_replica
for attempt in {1..24}; do
  if curl --fail --silent http://127.0.0.1:3000/api/health/ready >/dev/null \
    && curl --fail --silent http://127.0.0.1:3001/api/health/ready >/dev/null; then
    echo "Production encryption keys rotated; application replicas are healthy."
    trap - EXIT
    rm -f "${rotation_file}"
    unset old_plugin_key old_mfa_key new_plugin_key new_mfa_key KARIXMC_OLD_PLUGIN_KEY KARIXMC_OLD_MFA_KEY KARIXMC_NEW_PLUGIN_KEY KARIXMC_NEW_MFA_KEY
    exit 0
  fi
  sleep 5
done

echo "Application replicas did not become healthy after key rotation." >&2
exit 1
