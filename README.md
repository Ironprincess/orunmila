# Orunmila Pro — Integration Guide

Drop-in build for the existing Orunmila Next.js app (pages router, Vercel,
Upstash Redis). Nothing here touches or replaces your current student app —
`/pro` runs alongside it until you're ready to make it the front door.

## Files

```
lib/redis.js                  Upstash client (shared)
lib/access.js                 Codes, expiry, rate limits, admin helpers
lib/prompts/base.js           Identity + security + content/upsell policy
lib/prompts/modes.js          Mode prompt modules (assess, costar, tokens)
pages/api/pro/validate.js     Gate code check
pages/api/pro/chat.js         Mode router → Anthropic
pages/api/pro/library.js      My Library (save/list/delete)
pages/api/admin/codes.js      Code admin API
pages/pro.js                  The Pro app (gate → practice floor → expired)
pages/pro-admin.js            Admin page for you + the VA
```

Copy them into the repo at the same paths. If `@upstash/redis` isn't already
a dependency: `npm install @upstash/redis`.

## Environment variables (Vercel → Settings → Environment Variables)

Already set (reused): `ANTHROPIC_API_KEY`, `UPSTASH_REDIS_REST_URL`,
`UPSTASH_REDIS_REST_TOKEN`.

New:
- `ORUNMILA_ADMIN_SECRET` — a long random string. This is the password for
  /pro-admin; put it in your password manager and share with the VA securely.
- `ORUNMILA_MODEL` — optional; defaults to `claude-sonnet-4-6`.

## Before launch — three TODOs

1. In `pages/pro.js`, replace `SQUARESPACE_MONTHLY_URL` and
   `SQUARESPACE_ANNUAL_URL` with the real product URLs.
2. Deploy to a branch first — Vercel gives you a preview URL; test the full
   flow there while the student app keeps running untouched.
3. Create your first codes at `/pro-admin`:
   - a monthly code (type Monthly, 35 days, label "Launch Month")
   - a test cohort code if the September class needs one
   - annual codes are minted one per buyer as orders come in (VA checklist).

## How the pieces behave

**Access** — every code lives at `pro:code:{CODE}` with a type and expiry.
Expired codes route the user to the renewal screen (your one direct pitch)
for 60 days after expiry before Redis forgets them entirely.

**Rate limits** — 60 messages/day per person (IP-hashed) per code, plus a
per-code daily circuit breaker (2,500 for shared monthly/cohort codes, 300
for personal annual codes). Tripping the breaker sets `pro:flag:{CODE}` so
a leak shows up in the weekly review instead of silently draining the API
budget.

**Upsell policy** — enforced in two layers: the base prompt carries the
rules (one quiet sentence, felt-gap only, value first), and the client
spends the session's single upsell allowance after the first assess/tokens
exchange. CO-STAR Builder never upsells by design.

**Library** — keyed to a browser-held member id, not the access code, so
subscribers sharing a monthly code never see each other's saved work, and
libraries survive monthly code rotation. 90-day rolling retention.

**Logging** — `pro:log` list, anonymous, mode-tagged, capped at 10,000
entries. Mode tags tell you which features people actually pay for; wire
this into the existing CSV download endpoint (add a `?list=pro:log` param
or duplicate the handler) for the VA's monthly report.

## Redis key reference

| Key | What |
|---|---|
| `pro:code:{CODE}` | Access record `{type, expiresAt, label}` |
| `pro:codes:index` | Set of all codes for the admin list |
| `pro:rl:{CODE}:{ipHash}:{yyyymmdd}` | Per-person daily counter |
| `pro:rl:{CODE}:all:{yyyymmdd}` | Per-code daily counter |
| `pro:flag:{CODE}` | Suspected-leak flag (30-day TTL) |
| `pro:lib:{memberId}` | Saved library items (90-day rolling TTL) |
| `pro:log` | Anonymous mode-tagged question log |

## Shipping modes 4–6

Each future mode is one entry added to `lib/prompts/modes.js` plus flipping
`live: true` on its card in `pages/pro.js` — that's the whole release,
which is what makes the weekly announcement cadence cheap to sustain.

## curl cheatsheet (admin API, for reference)

```bash
# Create a monthly code
curl -X POST https://YOUR-DOMAIN/api/admin/codes \
  -H "Content-Type: application/json" -H "x-admin-secret: $SECRET" \
  -d '{"type":"monthly","days":35,"label":"Sept 2026 Monthly"}'

# List codes
curl https://YOUR-DOMAIN/api/admin/codes -H "x-admin-secret: $SECRET"

# Revoke
curl -X DELETE https://YOUR-DOMAIN/api/admin/codes \
  -H "Content-Type: application/json" -H "x-admin-secret: $SECRET" \
  -d '{"code":"ORN-XXXX-XXXX"}'
```
