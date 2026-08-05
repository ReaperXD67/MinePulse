#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${DOMAIN:?Set DOMAIN to the purchased domain name}"
EMAIL="${LETSENCRYPT_EMAIL:?Set LETSENCRYPT_EMAIL to the certificate contact address}"
APP_DIR="${APP_DIR:-/opt/karixmc}"
BOOTSTRAP="/etc/nginx/sites-available/karixmc"

sed "s/__DOMAIN__/${DOMAIN}/g" "${APP_DIR}/deploy/nginx/karixmc-bootstrap.conf.template" > "${BOOTSTRAP}"
ln -sfn "${BOOTSTRAP}" /etc/nginx/sites-enabled/karixmc
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

certbot certonly --webroot -w /var/www/html \
  --non-interactive --agree-tos --email "${EMAIL}" \
  -d "${DOMAIN}" -d "www.${DOMAIN}"

sed "s/__DOMAIN__/${DOMAIN}/g" "${APP_DIR}/deploy/nginx/karixmc.conf.template" > "${BOOTSTRAP}"
nginx -t
systemctl reload nginx
certbot renew --dry-run

echo "HTTPS is active for https://${DOMAIN}"
