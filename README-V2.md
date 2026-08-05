# Orunmila Pro v2 — built for your actual architecture

Static HTML pages + standalone /api functions, zero npm dependencies,
Redis over REST. Matches how orunmila-nu.vercel.app really works.

## What's in here
```
pro/index.html          The Pro app  ->  yoursite.com/pro
pro-admin/index.html    Code admin   ->  yoursite.com/pro-admin
api/_pro.js             Shared: Redis REST client, codes, rate limits
api/_prompts.js         Shared: base policy + the three mode prompts
api/pro-validate.js     Gate code check
api/pro-chat.js         Mode router -> Anthropic
api/pro-library.js      My Library (save/list/delete)
api/pro-codes.js        Admin API (x-admin-secret header)
```
The pro/ and pro-admin/ folders each hold one index.html — that's what
makes them load at the clean /pro and /pro-admin URLs on a static site.
Underscore-prefixed api files are shared helpers, not endpoints.

## How to install (GitHub drag-and-drop, same as before)
1. Repo -> switch to the Ironprincess-orunmilla-pro branch
2. "Add file" -> "Upload files"
3. From inside this unzipped folder, drag: pro, pro-admin, api (and this README)
4. The api folder MERGES with your existing one — chat.js is untouched
5. Commit directly to the branch -> Vercel rebuilds the preview

Optional cleanup (later, not required): the old pages/ and lib/ folders
from v1 sit inert on the branch — Vercel ignores them. Delete whenever.

## Env vars (already set — nothing to do)
ORUNMILA_ADMIN_SECRET, ANTHROPIC_API_KEY, KV_REST_API_URL, KV_REST_API_TOKEN.
Optional: ORUNMILA_MODEL (defaults to claude-sonnet-4-6).

## Before launch
Edit pro/index.html — the two SQUARESPACE_*_URL lines at the top of the
script (marked TODO) — swap in your real product URLs.

## Test checklist (on the preview URL)
1. /pro-admin -> paste secret -> Unlock
2. Create: Monthly, 35 days, "Testing"
3. /pro -> enter code -> practice floor appears
4. Prompt Assessment: lazy prompt -> six dimension scores + one fix
5. CO-STAR Builder: build to the end -> Save To Library -> check My Library
6. Token & Context Check: paste something long -> live token count + trims

## Redis keys (unchanged from v1 design)
pro:code:{CODE} · pro:codes:index · pro:rl:* · pro:flag:{CODE} ·
pro:lib:{memberId} · pro:log (anonymous, mode-tagged, capped 10k)
