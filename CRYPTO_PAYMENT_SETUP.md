# KarixMC Crypto Payment Setup

KarixMC supports hosted NOWPayments invoices for both campaign-credit packages and Gold/Diamond premium placement. The website never trusts a browser redirect or payment screenshot. Credits and premium time are applied only after a correctly signed `finished` webhook.

## Current Modes

- `CRYPTO_PAYMENTS_MODE="test"`: package and premium buttons complete instantly without charging money. Use this for the current VPS and Minecraft acceptance test.
- `CRYPTO_PAYMENTS_MODE="nowpayments"`: buttons create a hosted crypto invoice. The order remains pending until the provider confirms it.

Do not enable live mode on the temporary HTTP IP deployment. Complete the HTTPS, database, backup, merchant, and legal/tax checks first.

## Merchant Prerequisites

1. Create and verify a NOWPayments merchant account.
2. Add the merchant payout wallet.
3. Create an API key.
4. Create an IPN secret.
5. Point a domain to the KarixMC VPS and enable HTTPS.
6. Move production data from SQLite to a managed PostgreSQL database before accepting real money.

Official references:

- [NOWPayments integration guide](https://nowpayments.zendesk.com/hc/en-us/articles/21341613323421-NOWPayments-Integration-Guide)
- [Invoice API and payment statuses](https://nowpayments.zendesk.com/hc/en-us/articles/21345824322717-API-and-endpoint-description)
- [Signed IPN webhook setup](https://nowpayments.zendesk.com/hc/en-us/articles/21395546303389-IPN-and-how-to-setup)

## Environment Variables

Edit `/root/MinePulse/.env` on the website VPS. Do not put these secrets in Git, Discord, screenshots, or plugin configuration.

```dotenv
APP_BASE_URL="https://karixmc.example"
AUTH_COOKIE_SECURE="true"
CRYPTO_PAYMENTS_MODE="nowpayments"
NOWPAYMENTS_API_URL="https://api.nowpayments.io/v1"
NOWPAYMENTS_API_KEY="your-api-key"
NOWPAYMENTS_IPN_SECRET="your-ipn-secret"
```

The website sends this callback URL with every invoice:

```text
https://karixmc.example/api/payments/nowpayments/webhook
```

After changing the environment, rebuild and restart the website process. Never place wallet keys or seed phrases on the website server. NOWPayments needs only the merchant API key and IPN secret; payouts are configured in the merchant account.

## Settlement Rules

1. The owner selects a campaign package or premium tier.
2. KarixMC stores an immutable order snapshot and creates a hosted invoice.
3. The browser opens the provider checkout.
4. Pending and confirming callbacks update only the displayed status.
5. A signed `finished` callback atomically claims the order.
6. A point order adds its base credits and any still-valid promo bonus to that server's campaign pool.
7. A premium order activates or extends Gold/Diamond from the current expiry date.
8. Duplicate or late callbacks cannot credit or extend the order twice.

The success-page redirect is only navigation. It never settles an order. A user closing the page does not lose the invoice; pending checkout can be resumed from `Account -> Payment status`.

## Staging Test

1. Keep `CRYPTO_PAYMENTS_MODE="test"` and click a package in `Account -> Your servers -> Campaign`.
2. Confirm the pool increases immediately and `/pool` shows the same amount.
3. Run `npm run test:crypto-payments` to verify signed callbacks, promo settlement, duplicate protection, and premium activation.
4. After HTTPS and merchant credentials exist, enable provider sandbox/staging or use the smallest package.
5. Confirm a pending order does not change the pool.
6. Complete payment and wait for `PAID` in Payment status.
7. Confirm the campaign pool or premium expiry changes exactly once.

## Operational Requirements

- Record provider invoice ID, payment ID, state, money amount, and settlement time.
- Back up the database before every deployment and test restore procedures.
- Alert on failed webhook signatures and invoices stuck in processing.
- Restrict admin access and rotate exposed credentials immediately.
- Define refund, pricing, tax, sanctions, and regional-availability policies with qualified advisers before launch.
