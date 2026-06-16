# Static Site + Sanity CMS + Netlify + iCal Sync — Implementation Guide

This guide covers the full stack used by Seven Hills of Vermont. It is written so Claude (or any developer) can reproduce the exact same architecture for a new project with zero errors.

---

## Table of Contents

1. [Stack Overview](#stack-overview)
2. [File Structure](#file-structure)
3. [Sanity CMS Setup](#sanity-cms-setup)
4. [Netlify Setup](#netlify-setup)
5. [Environment Variables — Critical Rules](#environment-variables--critical-rules)
6. [Local Development Workflow](#local-development-workflow)
7. [GitHub Actions iCal Sync](#github-actions-ical-sync)
8. [Seeding Initial Content](#seeding-initial-content)
9. [Deployment Checklist](#deployment-checklist)
10. [Error Log — What Went Wrong and Why](#error-log--what-went-wrong-and-why)

---

## Stack Overview

| Layer | Tool | Purpose |
|---|---|---|
| Frontend | Vanilla HTML/CSS/JS (index.html) | Static site, no framework |
| CMS | Sanity (hosted) | Content management for gallery, property info, reviews, blocked dates |
| Hosting | Netlify | Static hosting + serverless functions |
| CI/CD | GitHub → Netlify (auto-deploy on push to main) | |
| Calendar sync | GitHub Actions cron + Netlify function | Pulls Airbnb iCal every 30 min → writes to Sanity |
| Studio | Sanity Studio (studio/ subdir) | Admin UI for content editors |
| Custom admin | admin.html | Lightweight alternative to Studio for non-technical users |

**Key design choice:** index.html fetches all CMS data at runtime via the Sanity CDN (no build step needed). It falls back gracefully to hardcoded content if Sanity is unreachable or empty.

---

## File Structure

```
project-root/
├── index.html                    ← main site; fetches CMS data on load
├── admin.html                    ← custom admin panel (no framework)
├── netlify.toml                  ← Netlify config: publish dir, functions dir, redirects
├── .env                          ← local secrets (gitignored)
├── .env.example                  ← template with all required variable names
├── .gitignore
├── seed.mjs                      ← one-time script to seed initial Sanity content
├── sync-now.mjs                  ← manual iCal sync script (bypasses netlify dev)
├── .github/
│   └── workflows/
│       └── sync-calendar.yml     ← GitHub Actions cron, runs every 30 min
├── netlify/
│   └── functions/
│       ├── sync-calendar.js      ← POST /api/sync-calendar — iCal → Sanity write
│       └── update-calendar.js    ← manual calendar write endpoint
└── studio/
    ├── sanity.config.js          ← Studio config, singleton structure
    ├── sanity.cli.js
    └── schemas/
        ├── index.js              ← exports all schema types
        ├── gallery.js            ← galleryPhoto: image, caption, order, size
        ├── property.js           ← property singleton: pullQuote, description, amenities
        ├── review.js             ← review: guestName, location, date, rating, text, visible
        └── blockedDates.js       ← blockedDates singleton: ranges[] of {start, end, note}
```

---

## Sanity CMS Setup

### 1. Create the project

```bash
npm create sanity@latest
# Choose: "No" to existing project, give it a name, dataset: production
```

Or create at [sanity.io/get-started](https://www.sanity.io/get-started).

Note the **Project ID** (8-character string, e.g. `0ftm1itk`). You will use this everywhere.

### 2. Define schemas

Four schema types for a short-term rental site:

**`gallery.js`** — `galleryPhoto` documents with `image`, `caption`, `order` (number), `size` (large/medium/small).

**`property.js`** — Singleton. Fields: `pullQuote` (text), `description` (portable text / array of blocks), `checkIn` (string), `checkOut` (string), `amenities` (array of objects: `icon`, `name`, `highlight`), `nearbyDistances` (array of objects: `icon`, `text`).

Add `__experimental_actions: ['update', 'publish']` to prevent creating duplicate singleton documents.

**`review.js`** — Fields: `guestName`, `location`, `date` (display string like "April 2026"), `rating` (1–5), `text`, `visible` (boolean, default true), `order` (number).

**`blockedDates.js`** — Singleton. One field: `ranges` array of objects `{start, end, note}` in `YYYYMMDD` string format.

### 3. Configure singleton structure in sanity.config.js

```js
structureTool({
  structure: S =>
    S.list().title('Content').items([
      S.listItem().title('Property Info').id('property')
        .child(S.document().schemaType('property').documentId('property-singleton')),
      S.listItem().title('Blocked / Booked Dates').id('blockedDates')
        .child(S.document().schemaType('blockedDates').documentId('blocked-dates-singleton')),
      S.divider(),
      S.documentTypeListItem('galleryPhoto').title('Gallery Photos'),
      S.documentTypeListItem('review').title('Guest Reviews'),
    ]),
}),
```

Singleton document IDs must be exactly: `property-singleton` and `blocked-dates-singleton`. The frontend queries for these exact IDs.

### 4. Make the dataset public

At [sanity.io/manage](https://www.sanity.io/manage) → your project → **Datasets** → click the dataset → set visibility to **Public**.

This allows `index.html` to read data via the CDN without any token. If you leave it private, every read needs a token.

### 5. Configure CORS origins

At **sanity.io/manage → API → CORS origins**, add:

| Origin | Allow credentials |
|---|---|
| `http://localhost:8888` | No (read-only local dev) |
| `http://localhost:3333` | Yes (Studio needs write access) |
| `https://yourdomain.com` | No (public site reads) |
| `https://*.netlify.app` | No (preview deploys) |

"Allow credentials" = whether write tokens can be sent from that origin. The CDN endpoint (`apicdn.sanity.io`) ignores CORS settings entirely for public datasets — CORS only matters for the write API (`api.sanity.io`).

### 6. Create a write token

At **sanity.io/manage → API → Tokens → Add API token**:
- Name: anything descriptive (e.g. "Seven Hills Write")
- Role: **Editor**

**CRITICAL:** Copy the token immediately — it is only shown once. The token will look like:

```
skzac6d2R0PdXLffFLIZr...
```

It does NOT start with `sk-sanity-`. That string is only a placeholder hint in UI examples. If you add `sk-sanity-` as a prefix, the token will be invalid and return `401 Session not found`.

Put this token in `.env` as `SANITY_WRITE_TOKEN=skzac6d2R0Pd...`.

---

## Netlify Setup

### 1. netlify.toml (project root)

```toml
[build]
  publish   = "."
  functions = "netlify/functions"

[build.environment]
  NODE_VERSION = "18"

[dev]
  publish   = "."
  functions = "netlify/functions"

[[redirects]]
  from   = "/api/:function"
  to     = "/.netlify/functions/:function"
  status = 200
```

The `/api/*` redirect means you call `/api/sync-calendar` in code instead of `/.netlify/functions/sync-calendar`. This keeps URLs clean and works identically in local dev and production.

### 2. Netlify Functions

Functions live in `netlify/functions/`. They export a `handler` async function:

```js
exports.handler = async (event) => {
  // event.httpMethod, event.headers, event.body
  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};
```

No separate install needed — Netlify bundles them automatically.

### 3. Environment variables on Netlify dashboard

After deploying, go to **Netlify Dashboard → Site → Environment variables** and add:

- `SANITY_PROJECT_ID`
- `SANITY_WRITE_TOKEN`
- `AIRBNB_ICAL_URL`
- `BOOKING_ICAL_URL`
- `CALENDAR_SECRET`

These are NOT read from `.env` in production — only in local dev via `netlify dev`. You must set them separately in the dashboard.

### 4. Link and deploy

```bash
# From project root
netlify login
netlify link        # links to existing site or creates a new one
git add -A
git commit -m "initial setup"
git push origin main
```

Netlify auto-deploys on every push to main once linked to GitHub.

---

## Environment Variables — Critical Rules

### The `.env` file (local dev only)

```
SANITY_PROJECT_ID=0ftm1itk
SANITY_WRITE_TOKEN=skzac6d2R0Pd...    ← NO sk-sanity- prefix
AIRBNB_ICAL_URL=https://www.airbnb.com/calendar/ical/LISTING_ID.ics?t=TOKEN
BOOKING_ICAL_URL=https://ical.booking.com/v1/export?t=TOKEN
CALENDAR_SECRET=some-long-random-string
```

### Rules

1. **`SANITY_WRITE_TOKEN` has no prefix.** It starts directly with `sk...`. Never prepend `sk-sanity-`.

2. **Restart `netlify dev` after every `.env` change.** `netlify dev` reads `.env` only at startup. If you change a value, the running process does not see it. Kill the process (Ctrl+C) and start it again.

3. **Admin panel uses sessionStorage, not `.env`.** The token in the admin panel login form is stored in the browser's sessionStorage. If you logged in before fixing the token, you must **Sign Out** and log back in with the corrected token.

4. **Never commit `.env`.** Keep it in `.gitignore`. Use `.env.example` with placeholder values as a template.

5. **Netlify dashboard env vars are separate.** What's in `.env` is only for `netlify dev`. Production functions read from the Netlify dashboard settings.

---

## Local Development Workflow

### Prerequisites

```bash
node --version   # 18+
netlify --version
```

Install Netlify CLI globally if needed: `npm install -g netlify-cli`

### Start local server

```bash
# From project root (NOT from studio/)
netlify dev
```

This serves:
- `http://localhost:8888` — index.html
- `http://localhost:8888/admin.html` — admin panel
- `http://localhost:8888/api/sync-calendar` — Netlify function

### Start Sanity Studio

```bash
# In a separate terminal
cd studio
npm run dev     # opens at http://localhost:3333
```

### Verify CMS reads are working

Open [http://localhost:8888](http://localhost:8888) in a browser. Open DevTools → Console. There should be no `CMS fetch failed` warnings. The page should show CMS content (not fallback).

To test manually in DevTools console:
```js
fetch('https://YOUR_PROJECT_ID.apicdn.sanity.io/v2024-01-01/data/query/production?query=*[_type=="review"]')
  .then(r => r.json()).then(d => console.log(d.result))
```

### Test iCal sync function locally

```bash
curl -X POST http://localhost:8888/api/sync-calendar \
  -H "Authorization: Bearer YOUR_CALENDAR_SECRET"
```

Expected response: `{"ok":true,"synced":8,"from":"20260529","to":"20270526"}`

If you get `Sanity write failed: 401`, the token in `.env` is wrong or `netlify dev` needs a restart.

### Manual iCal sync (bypass netlify dev)

If `netlify dev` is misbehaving, use the standalone script:

```bash
node sync-now.mjs
```

This reads `.env` directly and runs the same parse + write logic as the Netlify function.

---

## GitHub Actions iCal Sync

### `.github/workflows/sync-calendar.yml`

```yaml
name: Sync Airbnb Calendar
on:
  schedule:
    - cron: '*/30 * * * *'   # every 30 minutes
  workflow_dispatch:          # allow manual trigger from GitHub UI

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger sync
        run: |
          curl -s -X POST ${{ secrets.SITE_URL }}/api/sync-calendar \
            -H "Authorization: Bearer ${{ secrets.CALENDAR_SECRET }}" \
            -H "Content-Type: application/json" \
            --fail
```

### Required GitHub secrets

Go to **GitHub repo → Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value |
|---|---|
| `SITE_URL` | `https://yourdomain.com` (no trailing slash) |
| `CALENDAR_SECRET` | Same value as in `.env` and Netlify dashboard |

The `CALENDAR_SECRET` is a shared secret that gates the sync endpoint. Generate with:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Seeding Initial Content

Sanity starts empty. Before testing the frontend, create the singleton documents.

### Using the seed script

The project includes `seed.mjs` which creates:
- `property-singleton` with pullQuote, checkIn/out, amenities, nearbyDistances, description
- `blocked-dates-singleton` with initial date ranges
- 2–3 sample reviews

Run it:
```bash
SANITY_WRITE_TOKEN=skzac6d2R0Pd... node seed.mjs
```

Or if `.env` is already configured:
```powershell
# Windows PowerShell
$env:SANITY_WRITE_TOKEN = (Get-Content .env | Select-String "SANITY_WRITE_TOKEN").ToString().Split('=')[1]
node seed.mjs
```

### What to seed vs what to upload

| Content type | Seed via script | Upload via admin panel |
|---|---|---|
| Property info | ✅ Text fields | — |
| Blocked dates | ✅ Initial ranges | — |
| Reviews | ✅ Text content | — |
| Gallery photos | ❌ Requires image files | ✅ Use admin panel Gallery tab |

### Sanity CLI as fallback for writes

If a project API token is not working, the Sanity CLI auth token can be used:

```bash
cd studio
npx sanity debug --secrets
# Copy the "Auth token" value
```

Use that token in place of `SANITY_WRITE_TOKEN` for the seed script. Note: this is a personal session token tied to your login, not a project token. Use a project API token for production.

---

## How index.html Fetches CMS Data

`index.html` contains all CMS fetch logic in a `<script>` tag at the bottom. Key pattern:

```js
const SANITY_PROJECT_ID = 'YOUR_PROJECT_ID';  // hardcoded
const SANITY_DATASET    = 'production';

async function sanityFetch(query) {
  const url = `https://${SANITY_PROJECT_ID}.apicdn.sanity.io/v2024-01-01/data/query/${SANITY_DATASET}`
           + `?query=${encodeURIComponent(query)}`;
  const res = await fetch(url);  // no auth token — public dataset reads
  if (!res.ok) throw new Error(`Sanity ${res.status}`);
  return (await res.json()).result;
}
```

**No token is needed for reads** because the dataset is public. The CDN endpoint (`apicdn.sanity.io`) is CORS-open for public datasets regardless of the CORS settings in the dashboard.

Each fetch function (`fetchGallery`, `fetchProperty`, `fetchReviews`, `fetchBlockedDates`) falls back silently to hardcoded HTML if the fetch fails or returns empty. This means the page always renders even if Sanity is down or empty.

Boot sequence (bottom of `<script>`):
```js
// Render calendar immediately from fallback
renderCal();

// Fire all CMS fetches in parallel
Promise.all([
  fetchGallery(),
  fetchProperty(),
  fetchReviews(),
  fetchBlockedDates().then(ok => { if (ok) renderCal(); }),
]).catch(() => {});
```

---

## Deployment Checklist

Before going live, verify each of the following:

### Sanity
- [ ] Dataset visibility set to **Public**
- [ ] CORS origin added for the production domain
- [ ] Project API token created (Editor role) and saved somewhere secure
- [ ] `property-singleton` document exists and is **published** (not just saved as draft)
- [ ] `blocked-dates-singleton` document exists and is **published**
- [ ] At least 1 visible review exists
- [ ] Gallery photos uploaded (or hardcoded fallback images acceptable for launch)

### Netlify
- [ ] Site linked to GitHub repo
- [ ] Auto-deploy on push to main is enabled
- [ ] All 4 environment variables set in Netlify dashboard:
  - `SANITY_PROJECT_ID`
  - `SANITY_WRITE_TOKEN` (no `sk-sanity-` prefix)
  - `AIRBNB_ICAL_URL`
  - `CALENDAR_SECRET`
- [ ] CORS origin for `https://yoursite.netlify.app` added in Sanity (if using Netlify subdomain before custom domain)

### GitHub Actions
- [ ] `SITE_URL` secret set to the live Netlify URL
- [ ] `CALENDAR_SECRET` secret set (same value as in Netlify dashboard and `.env`)
- [ ] Workflow file committed and pushed to main
- [ ] First manual trigger successful (GitHub → Actions tab → "Sync Airbnb Calendar" → Run workflow)

### DNS / Custom domain
- [ ] Domain pointed to Netlify (CNAME or A record)
- [ ] HTTPS auto-provisioned (Netlify handles Let's Encrypt automatically)
- [ ] CORS origin for custom domain added in Sanity

---

## Error Log — What Went Wrong and Why

These are real errors that occurred during the initial setup of this project. Read this section carefully before implementing.

---

### Error 1: `401 Session not found` on every write

**Symptom:** All Sanity write operations returned `{"error":"Unauthorized","errorCode":"SIO-401-ANF","message":"Session not found"}`.

**Root cause:** The `SANITY_WRITE_TOKEN` in `.env` had `sk-sanity-` prepended to the actual token:
```
# Wrong — sk-sanity- is NOT part of the token
SANITY_WRITE_TOKEN=sk-sanity-skzac6d2R0Pd...

# Correct — token starts directly with sk...
SANITY_WRITE_TOKEN=skzac6d2R0Pd...
```

The admin.html login form uses the placeholder text `sk-sanity-…` as a hint about token format, which led to the prefix being treated as part of the token value.

**How to check:** Run a direct API test before anything else:
```powershell
$token = "YOUR_TOKEN"
Invoke-RestMethod -Uri "https://YOUR_PROJECT_ID.api.sanity.io/v2024-01-01/projects/YOUR_PROJECT_ID" `
  -Headers @{ Authorization = "Bearer $token" }
# Should return project info. If 401, the token is wrong.
```

---

### Error 2: Admin panel login appeared to succeed with an invalid token

**Symptom:** Logging into admin.html with the broken token worked (no error shown), but all write operations (add review, upload photo, save dates) would silently fail.

**Root cause:** The login validation runs a Sanity **read** query against the CDN endpoint (`apicdn.sanity.io`). CDN reads on a public dataset succeed without any valid token. The login therefore validates that the project ID is reachable, not that the write token is valid.

**Fix:** After fixing the write token, you must **Sign Out** and log back in. The old broken token is stored in `sessionStorage` and will persist across page reloads until you explicitly sign out.

---

### Error 3: `netlify dev` function still using old token after `.env` change

**Symptom:** Updated `.env`, but `/api/sync-calendar` continued returning 401.

**Root cause:** `netlify dev` reads `.env` once at startup. Changes to `.env` are not hot-reloaded. The process must be restarted.

**Rule:** Any time you change `.env`, kill `netlify dev` (Ctrl+C) and start it again.

**Workaround (if netlify dev is misbehaving):** Use `sync-now.mjs` which reads `.env` fresh on each run.

---

### Error 4: Sanity CDN returned empty results — assumed the API was broken

**Symptom:** `result: []` from all Sanity queries. Initially thought this was a CORS or token issue.

**Root cause:** The Sanity dataset was simply empty — no documents had been created yet. The API was working correctly.

**Rule:** Always seed content before testing CMS integration. Test the API directly with curl/fetch first to confirm connectivity, then verify content exists:
```bash
curl "https://YOUR_PROJECT_ID.apicdn.sanity.io/v2024-01-01/data/query/production?query=*[_type==\"review\"]"
# If result is [], the API is fine but the dataset is empty
```

---

### Error 5: Seed script used placeholder names instead of real content

**Symptom:** Reviews in Sanity had names "Sarah M." and "James K." instead of the real guest names from the hardcoded fallback in index.html.

**Root cause:** The seed script used placeholder content rather than the actual production content already in index.html.

**Rule:** Before writing a seed script, read the existing hardcoded fallback content in index.html and use those exact values. The fallback content represents the real initial state.

---

### Error 6: Sanity Studio CLI token mistaken for the project API token

**Symptom:** Needed a write token; the Sanity CLI `sanity debug --secrets` showed an `Auth token`. This was used for the seed script and worked.

**Root cause:** The CLI auth token is a personal user session token, not a project API token. It works for writes because the user is an administrator, but it should not go into production `.env` or be shared.

**Rule:** Use a dedicated project API token (created at sanity.io/manage → API → Tokens) for all production use. The CLI session token is for local CLI commands only.

---

### Error 7: iCal sync wrote old placeholder dates from seed script, then overwritten by sync

**Symptom:** The `blocked-dates-singleton` was seeded with placeholder date ranges, then the iCal sync (`createOrReplace`) overwrote them completely with the real Airbnb bookings.

**Root cause:** `createOrReplace` on the singleton replaces the entire document, including all ranges. The seed ranges and the iCal ranges cannot coexist — iCal sync always wins.

**Rule:** The `blocked-dates-singleton` is owned by the iCal sync. Do not seed or manually add ranges that need to persist — they will be overwritten on the next sync. Manual overrides should be tracked outside Sanity or added after disabling the sync.

---

## Quick Reference

### Token cheat sheet

| Token | Where it comes from | What it's for |
|---|---|---|
| Project API token | sanity.io/manage → Tokens | `.env`, Netlify dashboard, seed scripts |
| CLI session token | `cd studio && npx sanity debug --secrets` | Local CLI commands only |
| `CALENDAR_SECRET` | You generate it (`openssl rand -hex 32`) | Guards the sync endpoint |

### Sanity API endpoints

| Endpoint | Auth required | Used for |
|---|---|---|
| `https://PROJECT.apicdn.sanity.io/...` | No (public dataset) | Read queries from frontend |
| `https://PROJECT.api.sanity.io/...` | Yes (Bearer token) | Writes, admin panel, functions |

### GROQ queries used in this project

```groq
# Gallery photos ordered by display order
*[_type == "galleryPhoto"] | order(order asc) { caption, size, image }

# Property singleton
*[_type == "property" && _id == "property-singleton"][0]
  { pullQuote, description, checkIn, checkOut, amenities, nearbyDistances }

# Visible reviews ordered
*[_type == "review" && visible == true] | order(order asc)
  { guestName, location, date, rating, text }

# Blocked dates singleton
*[_type == "blockedDates" && _id == "blocked-dates-singleton"][0]{ ranges }
```

### Date format for blocked dates

The `start` and `end` fields on each range are 8-digit strings: `YYYYMMDD`.

- `start` = first blocked night (guest check-in date)
- `end` = day AFTER check-out (exclusive upper bound)

Example: Guest stays May 29–30 (checks out May 31) → `start: "20260529"`, `end: "20260531"`

The calendar renders: `date >= start && date < end` means blocked.
