# SLOW Security Issues

This document lists only concrete, currently open security issues for the SLOW Railway deployment.

Score:

```text
Current security score: 88/100
```

## P1: Dashboard Secret Is Still A 6-Digit PIN

Risk:

- The server-side dashboard secret is still a 6-digit PIN, so the total secret space is small.
- The login route has basic in-memory rate limiting, but a stronger password or random token would be safer.

Fix:

- Replace `DASHBOARD_PIN` with a longer dashboard password or random access token.
- Keep `DASHBOARD_PIN_SALT` set to a long random value until the PIN flow is replaced.

## P1: PIN Rate Limit Is In-Memory

Risk:

- PIN attempt limits are stored in process memory.
- The limit resets after deploy/restart.
- The limit is not shared if Railway runs more than one app instance.

Fix:

- Use a shared rate-limit store if the app is scaled beyond one instance.
- Keep the app to one instance until shared rate limiting exists.

## P1: Withdrawal API Key Permission Is High Risk

Risk:

- Real automatic withdrawal requires an exchange API key with withdrawal permission.
- If that key is compromised, the exchange-side withdrawal permission becomes the main blast radius.

Fix:

- Use a dedicated withdrawal key, separate from trading keys.
- Keep the server-side manual withdrawal cap at `2 USDT`.
- Use exchange-side address whitelist and IP restrictions where available.
- Keep automatic withdrawal disabled unless it is actively needed.

## P1: Railway Environment Variable Leak

Risk:

- Railway environment variables contain dashboard secrets, exchange API keys, and notification credentials.
- If Railway project access, deploy logs, or environment exports leak, an attacker may gain direct access to trading and notification integrations.
- Runtime filesystem cleanup does not protect environment variables.

Fix:

- Limit Railway project access to trusted accounts only.
- Rotate exchange keys, dashboard secrets, and notification tokens immediately if Railway env access is suspected.
- Use exchange-side IP restrictions, withdrawal address whitelist, and minimum key permissions.
- Keep separate sandbox, trading, and withdrawal keys so one leak has a smaller blast radius.
- Avoid printing environment variables or full config objects in logs.

## P2: Runtime Storage Contains Sensitive Trading Metadata

Risk:

- Runtime storage contains balances, history, config, wallet book, and withdrawal schedules.
- If the Railway volume is exposed or copied, strategy and wallet metadata can leak.

Fix:

- Keep the Railway volume private.
- Do not store API secrets in SLOW storage.
- Back up storage only to private locations.
- Redact wallet addresses before sharing screenshots or logs.

## P2: Notification Secrets And Payloads Can Leak Sensitive Data

Risk:

- Telegram, SMTP, or other notification credentials are sensitive.
- Error notifications and logs can accidentally include exchange responses, wallet addresses, signed URLs, or config details.

Fix:

- Keep notification credentials only in Railway environment variables.
- Redact API keys, secrets, tokens, wallet addresses, signatures, and signed URLs from logs and notifications.
