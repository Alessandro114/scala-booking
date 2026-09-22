# SCALA Booking — SnagTime Fork Integration

Fork: https://github.com/Alessandro114/scala-booking
Upstream: https://github.com/nateherkai/snagtime

## Environment Variables

Copy `.env.example` to `.env.local` and set:

```env
# --- Database (PostgreSQL in production) ---
DATABASE_PROVIDER=postgresql-production
DATABASE_URL=postgresql://app:PASSWORD@localhost:5434/scala_booking
WORKER_DATABASE_URL=postgresql://worker:PASSWORD@localhost:5434/scala_booking
DATABASE_ROLE=app

# --- Auth ---
AUTH_SECRET=<generate: openssl rand -base64 48>
BOOKING_CAPABILITY_KEY_ID=booking-capability-v1
BOOKING_CAPABILITY_SECRET=<generate: openssl rand -base64 32>
TOKEN_ENCRYPTION_KEY=<generate: openssl rand -hex 32>

# --- Public URL ---
NEXT_PUBLIC_APP_URL=https://booking.get-scala.com

# --- Email (SES via SMTP) ---
EMAIL_PROVIDER=smtp
EMAIL_TOKEN_SECRET=<generate: openssl rand -base64 32>
SMTP_HOST=email-smtp.eu-north-1.amazonaws.com
SMTP_PORT=587
SMTP_TLS_MODE=starttls
SMTP_USER=AKIAVNZTUREEQPEZIFOE
SMTP_PASSWORD=<SES SMTP password>
EMAIL_FROM=SCALA Booking <booking@get-scala.com>
EMAIL_REPLY_TO=business@get-scala.com
EMAIL_SENDER_DOMAIN=get-scala.com

# --- Calendar (Google) ---
CALENDAR_PROVIDER=google
GOOGLE_CLIENT_ID=<from Google Cloud Console>
GOOGLE_CLIENT_SECRET=<secret>
GOOGLE_REFRESH_TOKEN=<token>
GOOGLE_CALENDAR_ID=primary

# --- Stripe (see unlock instructions below) ---
PAYMENTS_PROVIDER=stripe
STRIPE_SECRET_KEY=sk_live_XXXX
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_XXXX
STRIPE_WEBHOOK_SECRET=whsec_XXXX

# --- Worker ---
OUTBOX_WORKER_ENABLED=true
OUTBOX_POLL_INTERVAL_MS=5000
OUTBOX_WORKER_MODE=local

# --- Security ---
TRUST_PROXY=true
PROXY_SHARED_SECRET=<generate: openssl rand -base64 32>
OPERATOR_HEALTH_SECRET=<generate: openssl rand -base64 32>
RATE_LIMIT_PROVIDER=local
RATE_LIMIT_HASH_SECRET=<generate: openssl rand -base64 32>

# --- Misc ---
DEMO_MODE=false
BUILD_ID=production
TENANT_CONTEXT_SECRET=<generate: openssl rand -base64 32>
```

## Stripe Unlock — Accept Live Keys

SnagTime ships with test-mode-only Stripe by design. Three files enforce this:

### 1. `apps/web/src/server/stripe-credentials.ts` (line 14-16)

The function `stripeSecretKeyAllowed()` rejects `sk_live_` keys:
```ts
// CURRENT (line 16):
return kind === "standard_test" || (kind === "claimable_sandbox" && claimableStripeSandboxEnabled(environment));

// CHANGE TO:
return kind === "standard_test" || kind === "live" || (kind === "claimable_sandbox" && claimableStripeSandboxEnabled(environment));
```

### 2. `apps/web/src/server/services/payments.ts` (line 37)

Constructor rejects non-test credentials:
```ts
// CURRENT (line 37):
if (!stripeCredentialSetReady(secretKey, false)) throw new Error("SnagTime only accepts a complete authorized Stripe test-mode credential set.");

// CHANGE TO:
if (!stripeCredentialSetReady(secretKey, false)) throw new Error("Stripe credentials are not configured.");
```

### 3. `apps/web/src/server/services/payments.ts` (lines 55, 61, 68, 120)

Four `livemode` guards throw on live Stripe sessions. Remove or invert these checks:
- **Line 55**: `if (session.livemode) throw new Error(...)` — REMOVE
- **Line 61**: `if (session.livemode) throw new Error(...)` — REMOVE
- **Line 68**: `if (intent.livemode || ...)` — remove the `intent.livemode ||` part
- **Line 120**: `if (event.livemode) throw new AppError(...)` — REMOVE

### 4. `apps/web/src/server/services/payments.ts` (line 29)

`assertPaidBookingsConfigured()` calls `stripeTestConfigurationReady()` which checks `PAYMENTS_PROVIDER === "stripe"` AND the test credential set. After step 1, this will pass with live keys too — no change needed here if step 1 is done.

**DO NOT unlock until ready for production Stripe.** Test thoroughly with `sk_test_` first.

## CORS Configuration (DONE)

### Files modified:
- `apps/web/next.config.ts` — Static CORS method/header headers for `/api/public/*`
- `apps/web/src/middleware.ts` — **NEW** — Dynamic origin matching for:
  - `https://get-scala.com`
  - `https://app.get-scala.com`

Preflight (OPTIONS) requests return 204 with proper CORS headers.

## Deployment Plan — Docker on Hetzner (port 3007)

### Dockerfile
SnagTime uses `output: "standalone"` in Next.js — the build produces a self-contained server.

```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run db:generate:postgres && npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
```

### docker-compose addition (on Prod 65.108.208.117)
```yaml
  scala-booking:
    build: /home/ale/snagtime
    container_name: scala-booking
    restart: unless-stopped
    ports:
      - "3007:3000"
    env_file:
      - /home/ale/snagtime/.env.local
    depends_on:
      - postgres
```

### nginx reverse proxy
```nginx
server {
    listen 443 ssl http2;
    server_name booking.get-scala.com;

    ssl_certificate     /etc/letsencrypt/live/booking.get-scala.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/booking.get-scala.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3007;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Cloudflare DNS
Add A record: `booking.get-scala.com` → `65.108.208.117` (proxied)

## iframe Embed Code for SCALA Dashboard

### Public booking page embed
```html
<iframe
  src="https://booking.get-scala.com/book/{EVENT_SLUG}"
  width="100%"
  height="700"
  frameborder="0"
  style="border: none; border-radius: 12px;"
  allow="payment"
  title="Prenota un appuntamento"
></iframe>
```

### API-driven slot picker (custom UI)
```ts
// Fetch available slots
const res = await fetch(
  "https://booking.get-scala.com/api/public/{EVENT_SLUG}/slots?date=2026-09-01&timezone=Europe/Rome"
);
const slots = await res.json();

// Create booking
const booking = await fetch(
  "https://booking.get-scala.com/api/public/{EVENT_SLUG}/bookings",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      startTime: "2026-09-01T10:00:00+02:00",
      inviteeName: "Mario Rossi",
      inviteeEmail: "mario@example.com",
      inviteeTimeZone: "Europe/Rome",
    }),
  }
);
```

## Files Referencing "SnagTime" (Rebrand Inventory)

21 files in `apps/web/src/` contain "SnagTime" or "snagtime". Full list:

| File | What to rebrand |
|------|----------------|
| `app/layout.tsx:6,8,11` | Page title, app name, OG title |
| `app/manifest.ts:5-6` | PWA name, short_name |
| `app/book/[slug]/page.tsx:2` | Booking page title |
| `components/ui.tsx:8,18` | Brand lockup aria-label and text |
| `components/app-shell.tsx:37-38,55` | Custom event names, sign-in copy |
| `components/account-signup.tsx:52,54` | Signup copy |
| `components/booking-outcome.tsx:249,276,277` | Brand header, footer |
| `components/public-booking-flow.tsx:223,247` | Public header, footer |
| `components/settings-view.tsx:88,109,163,168` | Custom events, settings copy |
| `components/booking-attempt.ts:6` | localStorage key |
| `components/account-access.tsx:5,30,103,123` | API error class import, copy |
| `lib/api-client.ts:29,48` | `SnagTimeApiError` class name |
| `server/services/payments.ts:37` | Error message |
| `server/services/notifications.ts:95,144` | Email subject, message-id domain |
| `server/services/accounts.ts:58` | Email subject |
| `server/services/account-recovery.ts:25` | Email subject |
| `server/services/calendar.ts:501` | Error message |

Test files (lower priority):
| `server/infrastructure.test.ts:23` | Stripe sandbox project name |
| `server/email-config.test.ts:8-21` | Test email fixtures |
| `server/services/notifications.test.ts:161-172` | Test email fixtures |
| `server/services/accounts.test.ts:253` | Test env stubs |

Root-level:
| `package.json` | **DONE** — renamed to `scala-booking` |
| `apps/web/package.json:2` | `@snagtime/web` workspace name |
| `scripts/demo-check.mjs` | References |
| `scripts/dev-persistent.mjs` | References |
| `infrastructure/dependency-audit-allowlist.json` | References |

**Mass rename NOT applied yet** — only `package.json` name and repo URL updated.
