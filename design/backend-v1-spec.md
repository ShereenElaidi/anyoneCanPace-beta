# Backend V1: accounts, public and personal route libraries

Status: **draft for review** (2026-11-12). Nothing here is implemented yet.
Each decision is tagged **[approved]** (Shereen's answers in the design discussion),
**[assumed]** (filled in to make the design complete; change freely) or **[open]**
(needs a decision before that part is built).

Scope: pacers and runners upload routes from a GPX, check turns the same way as
the dev route editor, and keep a private route library across devices. Building
routes by drawing on a map ("laptop build route") is **coming later** and not
designed here. **[approved]**

Budget: **$0**. Every service below is used on its free plan. **[approved]**

---

## 1. Roles

Roles, not paid tiers. If paid plans ever arrive, they become separate *limits*,
never new permissions. **[approved: "roles"; assumed: kept apart from plans]**

| | Public library | Own personal library | Anyone else's personal library |
|---|---|---|---|
| **Visitor** (no account) | View, follow | – | – |
| **Runner** | View, follow, report a problem **[approved]** | Full | Never |
| **Pacer** | View, follow, upload, check turns (reports only, see §2) | Full | Never |
| **Admin** (Shereen only) | Full: upload, edit, withdraw, restore, delete | Full | **Never** |

- Everyone signs up as a runner. **Only the admin promotes someone to pacer** (and can demote). **[approved]**
- There is exactly one admin. The admin is the Auth0 user ID in the server setting
  `ADMIN_AUTH0_ID`, never a role stored in the database, so no database bug can
  create a second admin. **[assumed]**
- Extra locks on admin requests **[open: both need checking during step 1]**:
  - *A passkey sign-in.* Only works if Auth0's sign-in token says how the person
    signed in. If it doesn't, require a sign-in in the last 10 minutes instead.
  - *Cloudflare Access in front of `/api/admin/*`.* Access normally protects a
    custom domain; on `*.pages.dev` it may only cover preview deployments. If it
    can't protect one path there, skip it.
- **Moderation:** the admin can reset someone's display name or username (if
  offensive or impersonating) and disable an account. Neither shows the admin
  any personal routes. **[assumed]**
- **Demoted pacer** (pacer → runner): their public uploads stay, still credited
  to them, but only the admin can edit them from then on. Reports on those
  routes go to the admin's complaint box. Their personal library is unchanged. **[approved]**
- **Disabled account:** can't sign in. Its personal routes are kept but shown to
  no one, the admin included. The admin can re-enable the account, or delete
  it, which deletes those routes (as in §5 "Account deletion"). **[approved]**

## 2. Public library

### Who changes what

| Public route uploaded by | Who can edit it | Who files reports on it | Reports go to |
|---|---|---|---|
| **Admin** | **Admin only. No one else, ever.** | Pacers, runners | Admin's complaint box |
| **A pacer** | That pacer and the admin | Other pacers, runners | The pacer's inbox **and** the admin's |
| **A former pacer** (account deleted or demoted) | Admin | Pacers, runners | Admin's complaint box |

[approved: admin routes locked, pacers on other routes report only, pacers fix their own uploads, runners can report]

- **Pacer uploads go live immediately**, marked **unverified**. **[approved]**
- **A pacer can fix or withdraw their own upload.** Withdraw hides it from the
  library; it is not deleted. Only the admin restores or deletes for good. **[approved]**
- **Verification:** a route only becomes desk-reviewed or field-verified when its
  owner (or the admin) checks it. A report never counts as a review. The existing
  rule still applies: changing a reviewed route's turns or start street resets it
  to unverified. **[assumed, follows the existing route rules]**
  - *Desk-reviewed:* every turn checked against the map in the upload/check screens.
  - *Field-verified:* the owner (or admin) ticks "I ran this route and the turns
    were right" with the date it was run. There is no GPS evidence, by design.
    Shown as "field-verified by Sam (@sam_runs), 2026-11-15". **[approved]**
- **Change log:** every edit to a public route records who, when, and before/after,
  visible to the admin and to the route's owner. Admin edits to a pacer's route
  show in that pacer's log. **[assumed]**
- **The database is the only source of truth for public routes.** **[approved]**
  - The built-in routes move into the public library, owned by the admin, keeping
    their IDs (e.g. `pi-day`) so existing `?route=` links work.
  - The repo's route files (`src/data/routes/`, `routes/`) are **frozen** after the
    move: no more edits there, no more `npm run routes` for them. They ship only
    as the first-launch offline fallback, before the app has fetched the list.
  - Once the app has fetched the public list, it uses that (and its saved copy
    offline) instead of the built-in files, even where they differ.
  - The Sunday dashboard picks its route by ID from the public library
    (`event.json` keeps the ID) instead of reading `manifest.json`.
  - The dev route editor (`?edit`) and `npm run routes` stay for development and
    tests, not for publishing.
- **Attribution:** public routes show the uploader's display name and username
  ("by Sam (@sam_runs)", "reviewed by Sam (@sam_runs)"), never the email.
  Display names can repeat, so the username tells two Sams apart (§5). When an account is deleted its public
  routes stay and show "former pacer". **[approved: keep route, name removed]**
- Uploading to the public library asks the pacer to confirm they may share the
  route and that it will be published. **[assumed]**

### Complaint box (reports)

- A report is: route, optional turn number, kind (wrong direction / wrong street /
  missing turn / unsafe / other), a message, status (open / fixed / dismissed).
  It never carries a position. **[assumed]**
- A pacer "checking turns" on someone else's route files reports: "turn 4 should
  be right, not left". **[approved]**
- Reports close when the owner fixes the turn or dismisses them. The admin sees
  every report and can act on any of them. **[assumed]**
- **Notifications are in-app only.** Auth0's built-in email sends only its own
  messages (verification, reset), so the app can't email anyone. Pacers see new
  reports, and the admin sees new reports and new public uploads, as a count
  badge when they open the app. **[approved]**
- Suggesting a personal route for the public library (runners) is **later**. **[approved]**

## 3. Personal library

- Only the account that uploaded a personal route can see it.
  **No one through the app can see it, including the admin.** No admin screen,
  API or export lists or opens personal routes. **[approved]**
- Wording for the privacy policy: "Personal routes are visible only to your
  account. The admin cannot see them in the app." Technically the database is
  readable from the Cloudflare dashboard by the account owner, so the policy does
  not promise more than that. Encrypting routes on the device would close that
  gap and is out of scope. **[assumed]**
- **No SHARE ROUTE** on personal routes; the `?route=<id>` link only works for
  public routes. **[assumed]**
- Personal routes open and follow exactly like public ones and are saved on the
  device for offline use when opened. **Signing out clears them from that device.** **[assumed]**

## 4. Upload and check flow

Same steps and rules as the dev route editor, running in the app. **[approved: "just .gpx then verify like our dev workflow"]**

1. Choose a `.gpx` (phone or laptop).
2. **On the device**, the app cleans it with `scripts/lib/sanitize-gpx.ts`
   (lat/lon/ele only). **The original GPX never leaves the device.**
3. **On the device**, the app builds the route with `process-route.ts` and
   `turns.ts`; elevation (GeoGratis) and street names (Overpass) come through
   our lookup Functions (below). The unsaved route is a **draft kept on the
   device** (IndexedDB) until saved or discarded.
4. The person checks turns on the map (the route editor's screens and rules:
   `edits.ts`, `turnEdit.ts`, `review.ts`) and fills in name, place, tags, notes.
5. Save → personal library, or (pacers, admin) publish → public library as
   unverified. Only now does anything reach the server: the cleaned GPX and the
   built route.

**Where routes can be** **[approved]**:
- **Public routes must lie inside the Québec map area** (§4a). Publishing is
  refused otherwise.
- **Personal routes can be anywhere**, with a warning when they leave the map
  area ("no offline map here") or Canada ("no elevation here": CDEM covers
  Canada only).

### 4a. Offline maps per route **[approved: own Québec map on R2]**

Replaces the single precached `public/maps/montreal.pmtiles`, which only covers
the current library routes plus 1.1 km (the whole island would be ~55 MB).

- **One Québec map on R2.** `scripts/cut-map.ts` cuts a larger area from the
  Protomaps planet build (same data, same `mapStyle.ts`) and it's uploaded to R2.
  Area: the whole province if the file stays under ~5 GB, otherwise southern
  Québec. **[assumed: size checked when cutting]** R2's free plan holds 10 GB.
- **Each route downloads its own area**, never the person's location: the route
  plus 1.1 km (the same margin `cut-map.ts` uses), zooms 10–15, saved in Cache
  Storage when the route is saved or opened online. The route shows "Map saved
  for offline ✓". Nothing about the download depends on GPS. **[approved]**
- **Served by a Function**, `GET /api/map/tiles/:z/:x/:y`, reading the R2 file
  with range requests (the PMTiles library runs on Workers) and caching tiles at
  Cloudflare's edge. Open to visitors (public routes need maps too),
  rate-limited. It never logs tile coordinates, because for a personal route they
  outline where that route is. **[assumed]**
- **Clean-up:** a personal route's tiles are removed with the route and on sign-out. **[assumed]**
- **Updates:** re-cut and re-upload about once a season; bump `MAP_VERSION` so
  saved routes refresh their tiles next time they're opened online. **[assumed]**
- **App install gets lighter:** `montreal.pmtiles` (13 MB) is no longer
  precached by the service worker. Before the first fetch, the frozen built-in
  routes show without a map until the app has been online once. **[assumed]**
- **Size per route:** to be measured on a real route during step 2; expected a few MB.

- Before saving, the page reminds people that a GPX usually starts at home and
  offers to trim the first and last few hundred metres. For public uploads the
  reminder is a required checkbox. **[assumed]**
- **Where the build runs [approved]:** in the **browser** (a Web
  Worker), not in one Function request. Cloudflare's free plan gives each request
  10 ms of CPU and 50 outside requests. Elevation is sampled every 10 m and
  looked up 100 points per request, so a 50 km route needs about 50 GeoGratis
  calls plus Overpass, and the route and turn maths on thousands of points would
  likely go over 10 ms.
  - The build code is already pure TypeScript (`process-route.ts`, `turns.ts`,
    `sanitize-gpx.ts`), so it can run on the device.
  - Elevation and street names go through two small Functions,
    `POST /api/lookup/elevation` (one batch of 100 points) and
    `POST /api/lookup/streets`, so GeoGratis and Overpass see our server, not the
    person's phone. Each call is one outside request and very little CPU.
    Signed-in only, rate-limited, no storage.
  - The server stores the result after cheap checks: schema, field rules, sizes,
    distance and point count within limits, track and route agreeing, cleaned
    GPX containing only lat/lon/ele, and (public) inside the map area. That's
    safe because a person can only harm their own personal library this way, and
    public uploads come from pacers you promoted.
- `turn-review.ts` uses `node:crypto`; switch it to Web Crypto so it runs in the
  browser. **[assumed]**
- A route's GPX can't be replaced after saving; upload it as a new route. This
  replaces the "geometry change needs `--reset-turns`" step. **[assumed]**
- The route editor becomes a real, lazy-loaded part of the app. `check-bundle.ts`
  keeps blocking the dev-only *file* API (`src/dev/routeEditor/server/`) from
  `dist/`, but no longer the editor screens. **[assumed]**

## 5. Accounts (Auth0, free plan)

### Sign-up and sign-in

- **Provider:** Auth0, free plan (25,000 monthly users), on Auth0's hosted sign-in
  page at `<tenant>.auth0.com`. No custom domain (that would need a paid domain). **[approved]**
- **Region:** the tenant created 2026-11-12 is in the **United States**
  (`<tenant>.us.auth0.com`), although the sign-up form said Québec, Canada. A
  tenant's region can't be changed. **Kept for live**, covered by the privacy
  assessment and privacy policy (§11), which Cloudflare needs anyway. **[approved]**
  Beta gets its own second tenant (any region).
- **Sign-up:** email + password (Auth0 stores and hashes passwords), then a
  username and a display name in the app. **[approved]**
- **Accounts are 14+ only.** Under Law 25 a child under 14 needs a parent's
  consent. Sign-up asks the person to confirm they are 14 or older (no birth date
  stored). The app without an account stays open to everyone. **[approved]**
- **Onboarding:** the first time an Auth0 account reaches the app, it must pick a
  username and display name and see its recovery code before anything else. An
  Auth0 account that never finishes this has no row in D1 and can't do anything. **[assumed]**
- **Open sign-up:** anyone can create an account. Auth0's free attack protection
  plus the per-account limits (§10) keep abuse small. If junk accounts appear,
  an option is to cut unverified-email accounts to 5 personal routes. **[assumed]**
- **Display name:** any name, **doesn't have to be unique** ("Sam"). **[approved]**
- **Username:** **unique**, shown with the display name wherever attribution
  appears, and used by the admin to find someone to promote. **[approved: unique]**
  - Stored in D1 (`users.username`), not used to sign in; sign-in stays email or passkey. **[assumed]**
  - 3–20 characters: lowercase letters, digits, `_` and `-`; starts with a letter;
    unique ignoring case. **[assumed]**
  - Reserved: `admin`, `anyonecanpace`, `anyonecanrun`, `stooopid`, `support`,
    `former-pacer` and similar, so no one can pose as the app or the admin. **[assumed]**
  - Can be changed in settings; a freed username can be taken by someone else
    after 30 days. Public routes always show the current one. **[assumed]**
- **Sign-in:** password or passkey (Face ID / fingerprint). Passkeys are free on
  every Auth0 plan; Auth0 requires passwords to stay on where passkeys are on.
  Passkeys belong to `<tenant>.auth0.com`; moving sign-in to a custom domain later
  would break them. **[assumed]**
- **Sign in with Google:** not in V1; see "Sign in with Google" below. **[approved]**

### Email

- Use Auth0's **built-in email** for the verification email and password-reset
  email. It's meant for low-volume use with no delivery guarantee (10 emails a
  minute; more are silently dropped), which fits about 20 users. **[approved]**
- Email is a convenience, never the only way back in. The sign-up screen says to
  check spam for a message from Auth0. **[assumed]**
- Emails are never shown to other users and never used to link accounts automatically. **[assumed]**

### Recovery code

- Shown **once** after sign-up: long and random (e.g. `K7QM-2XPA-9RTD-H4WC`),
  "save or print this". Only a hash is stored in D1. **[approved]**
- Using it: the server checks the code and asks Auth0's management API for a
  password-reset link ("password change ticket"), returned directly (no email). The person sets a new
  password; the old code is replaced by a new one, shown once; every other signed-in
  device is signed out. **[assumed]**
- **Attempts:** 3 per account per day **[approved]**, plus a limit per network
  address **[assumed]**. The screen shows attempts left today.
- Recovery order shown in the app: passkey → password → reset email → recovery code.
- Sign-up states plainly: "If you forget your password, the reset email doesn't
  arrive and you've lost your recovery code, the account and its personal routes
  can't be recovered. The admin can't help." **[assumed]**

### Sign in with Google **[approved: left out of V1]**

Kept here for if it's added later. Free, but each point below adds work or
confusion for about 20 people who already have password, passkey, reset email
and recovery code:

- **Setup:** needs our own Google Cloud OAuth client (Auth0's built-in Google keys
  are for testing only). The consent screen must be published out of "Testing"
  mode (in testing mode only up to 100 hand-added test users can sign in).
  Basic scopes need no Google review; adding a logo triggers brand verification.
- **Confusing screen:** with no custom domain, Google says the person is signing
  in to `<tenant>.auth0.com`, not AnyoneCanPace.
- **Two accounts for one person:** a Google sign-in is a separate Auth0 user. If
  someone signs up with a password and later taps Google, they land in a new, empty
  account. Fix: Google can only be connected from inside a signed-in account
  (settings → Connect Google), and a Google sign-in that isn't connected is refused
  with "sign in another way, then connect Google". Never link by matching email.
- **Installed iPhone app:** one more hop in the redirect chain (app → Auth0 →
  Google → Auth0 → app), on top of the open question in §9.
- **Privacy:** Google learns who uses the app; the privacy policy has to say so.
  Store nothing from Google in D1 beyond the link (no profile picture).

### Sessions

- Sign-in uses Auth0's redirect flow handled **by our Functions**, not Auth0's
  JavaScript library in the page: `/api/auth/login` redirects to Auth0,
  `/api/auth/callback` exchanges the code (client secret stays on the server),
  creates our own session and sets a `Secure; HttpOnly; SameSite=Lax` cookie.
  No Auth0 code ships in the app. **[assumed]**
- Sessions last 60 days and renew when used. D1 stores only a hash of the session
  token. Settings lists signed-in devices with "sign out" for each. **[assumed]**
- The installed iPhone app and Safari keep separate sign-ins; people sign in once in each.
- **Signing out** ends our session *and* Auth0's (through Auth0's logout
  redirect). Otherwise, on a shared laptop, the next "Sign in" would silently
  sign the same person back in. **[assumed]**
- **Writes check `Origin`** (same as the route editor's guard) on top of
  `SameSite=Lax`, against cross-site requests. **[assumed]**
- **Never mid-run.** Sign-in and sign-out leave the page for Auth0, which would
  lose a running timer or a route being followed. Both are unavailable while a
  timer session or route is live, like the update banner. **[assumed]**
- **Service worker:** the app's offline fallback must skip `/api/` (Workbox
  `navigateFallbackDenylist`). Otherwise the return from Auth0
  (`/api/auth/callback`) is answered with the cached app page and sign-in never
  finishes. API responses are never cached by the service worker; opened routes
  are cached by the app itself (§3). **[assumed]**
- **Management API:** our server gets an Auth0 machine-to-machine token
  (permissions: read users, delete users, create password change tickets) and
  reuses it until it expires (24 h), because the free plan limits how many such
  tokens can be issued a month. **[assumed]**

### Account deletion

- Settings → Delete account (two-tap confirm). Deletes the user row, sessions,
  recovery code, personal routes and their files, and the Auth0 user. Public
  routes stay as "former pacer"; reports they filed keep their text without the
  name. **[approved for public routes; assumed for the rest]**

## 6. Architecture

```
phone / laptop (PWA)
  │  same origin, session cookie
  ▼
Cloudflare Pages ── static app (as today)
  └─ functions/api/*  (Pages Functions)
        ├─ D1  : users, sessions, routes, reports, change log
        ├─ R2  : cleaned GPX + track GeoJSON, Québec map (PMTiles)
        ├─ Auth0 (sign-in, passkeys, emails, management API)
        └─ GeoGratis + Overpass (lookups for a route being built on the device)
```

- **Pages Functions** in this repo (`functions/api/`), same domain as the app: no
  CORS, one deploy, one place for code review. **[assumed]**
- **Beta and live have separate D1 databases, R2 buckets and separate Auth0
  tenants** (not just separate Auth0 applications: applications in one tenant
  share the same users, so a beta sign-up would be a live account). Testing on
  beta never touches real accounts or routes. **[assumed]**
- **Auth0 callback addresses:** live, beta and the local HTTPS dev address, each
  only in its own tenant. **[assumed]**
- **Local development:** Functions, D1 and R2 run locally with `wrangler pages dev`
  in front of Vite (local D1/R2, no real data). The dev route editor (`?edit`)
  stays for development and tests (§2). **[assumed]**
- **Offline:** the library shows the last-known public list (with "from <time>");
  before the first fetch it falls back to the frozen built-in routes (§2).
  Opened routes are cached in Cache Storage like the offline map. **[assumed]**
- Free-plan headroom at this scale: D1 5 GB, R2 10 GB, 100,000 Function requests a day. Measured route sizes: cleaned GPX 8–22 KB, built route + track 5–8 KB.
- **Advisories:** `src/data/advisories.json` stays hand-edited by pull request.
  Advisories stored on a route are edited by whoever can edit that route.

## 7. Data model (D1)

Personal and public routes live in **separate tables**, so a forgotten filter
can't leak a personal route into the public list. IDs are random, never 1, 2, 3,
except the migrated built-in routes, which keep theirs (§2). **[assumed]**
Unsaved drafts live on the device (§4), so there is no drafts table.

| Table | Columns (main ones) |
|---|---|
| `users` | `id`, `auth0_id` (unique), `username` (unique, case-insensitive), `display_name`, `role` (`runner`/`pacer`), `disabled_at`, `created_at` |
| `released_usernames` | `username`, `released_at` (blocks reuse for 30 days) |
| `sessions` | `token_hash`, `user_id`, `created_at`, `expires_at`, `last_used_at`, `device_label` |
| `recovery` | `user_id`, `code_hash`, `created_at`; attempts in `recovery_attempts` (`user_id`, `at`), pruned after a day |
| `public_routes` | `id`, `owner_id` (nullable = former pacer), `owner_is_admin`, `owner_can_edit` (false once demoted), `status` (`live`/`withdrawn`), `withdrawn_at`, route fields (name, place, description, tags, notes, start street, turns, advisories, verification, geometry, stats), `track_key`, `gpx_key`, timestamps |
| `personal_routes` | `id`, `owner_id` **NOT NULL**, the same route fields, `track_key`, `gpx_key`, timestamps |
| `reports` | `id`, `route_id`, `reporter_id` (nullable after deletion), `turn_index`, `kind`, `message`, `status`, `resolved_by`, timestamps |
| `route_changes` | `id`, `route_id`, `actor_id`, `at`, `summary`, `before`, `after` |

R2 keys: `public/<routeId>/…` and `personal/<ownerId>/<routeId>/…`, only ever read
through a Function, never public URLs. **[assumed]**

## 8. API

All under `/api`. Writes need a session; the role checks are in §1–§2. **[assumed]**

| Endpoint | Who |
|---|---|
| `GET /auth/login`, `GET /auth/callback`, `POST /auth/logout`, `POST /auth/recover` | anyone |
| `GET /public/routes`, `GET /public/routes/:id` | anyone (live routes; withdrawn only for owner/admin) |
| `PATCH /public/routes/:id` | owner pacer (own non-admin route), admin |
| `POST /public/routes/:id/withdraw` | owner pacer, admin |
| `POST /public/routes/:id/restore`, `DELETE /public/routes/:id` | admin |
| `POST /public/routes/:id/review` | owner, admin |
| `POST /public/routes/:id/reports` | signed in |
| `GET /reports`, `PATCH /reports/:id` | route owner (their routes), admin (all) |
| `GET/POST /me/routes`, `GET/PATCH/DELETE /me/routes/:id` | signed in, own routes only (POST = save a route built on the device) |
| `POST /public/routes` | pacer, admin (publish a route built on the device) |
| `GET /me/notifications` (badge counts) | signed in |
| `GET/PATCH/DELETE /me`, `GET /me/sessions`, `DELETE /me/sessions/:id` | signed in |
| `GET /usernames/:name` (available?) | anyone, rate-limited |
| `GET /map/tiles/:z/:x/:y` | anyone, rate-limited, never logged (§4a) |
| `POST /lookup/elevation`, `POST /lookup/streets` | signed in, rate-limited (§4) |
| `GET /admin/users?username=…`, `PATCH /admin/users/:id` (role, reset names, disable) | admin |

## 9. Security rules

D1 is SQLite: no database users or row-level security, so every rule is in Function code. **[approved concern]**

- **One data-access module.** Route handlers never write SQL. Every personal-route
  query takes the signed-in user's ID and adds `WHERE owner_id = ?`.
- **Prepared statements only** (`prepare(…).bind(…)`).
- **Someone else's route is "not found"**, never "forbidden", so a response
  never reveals that it exists.
- **Server-side validation** with the same rules the tests use
  (`validateDescription`, `validateTagList`, advisories validation, `edits.ts`).
- **Limits** (§10) and Cloudflare rate limiting on uploads, reports, sign-in and recovery.
- **Cross-user tests:** for every endpoint, user B tries to read, edit, withdraw
  and delete user A's routes and reports; every attempt must fail. Same for a
  pacer against an admin route.
- **Secrets** (Auth0 client secret, management API credentials) only in
  Cloudflare's encrypted settings, never in the repo or the app.
- **Backups:** D1 Time Travel (restore to any point in the last 30 days); try a restore on beta once.

## 10. Limits

Kept in one settings file. **[assumed]**

| | Personal routes | Public uploads | Per upload |
|---|---|---|---|
| Runner | 25 | – | GPX ≤ 5 MB on the device before cleaning; cleaned GPX ≤ 1 MB at the server; route ≤ 50 km |
| Pacer | 50 | 5 per day | same |
| Admin | No limit | No limit | – |

Reports: 20 per account per day. Lookups: enough for a few builds a day
(e.g. 200 elevation batches per account per day).

## 11. Privacy and Law 25

- **GPS positions are never sent**, including while following personal routes. **[approved, unchanged rule]**
- Stored about a person: email (in Auth0), display name, role, their routes,
  reports, sessions. Nothing else, no analytics. **[assumed]**
- Law 25 basics (not legal advice; worth a quick check): a privacy policy, Shereen
  named as the person responsible for personal information, account deletion (§5),
  a breach plan and register, and a short privacy assessment for data stored
  outside Québec. **[assumed]**
- **Privacy contact:** a separate free email address used only for the app,
  published in the privacy policy, not Shereen's personal address. **[approved]**
- **Documents before launch:** a short privacy policy and terms of use (upload
  rights, public routes staying as "former pacer", 14+, no recovery without the
  code). Claude drafts both; Shereen reviews. **[approved]**
- **How long data is kept** **[approved]**:
  - resolved or dismissed reports: deleted after 1 year
  - change log entries: deleted after 2 years
  - expired or signed-out sessions: deleted at once
  - withdrawn public routes: deleted after 1 year unless the admin restores them
  - recovery attempts: deleted after a day
  - accounts and personal routes: until the person deletes them
  - A daily scheduled Function (Cron Trigger, free) does the deleting.
- That assessment is needed **even if Auth0 is in Canada**: Cloudflare's D1 and
  R2 can't be pinned to Canada (D1 takes a region hint such as "eastern North
  America"; R2 only offers EU and FedRAMP jurisdictions). One short document
  covering Cloudflare and Auth0 (US region) is enough. Pick the eastern North
  America hint when creating D1 and R2. **[assumed]**
- What the assessment and policy cover **[assumed]**:
  - *What leaves Québec:* email, hashed password, passkey public keys and Auth0's
    sign-in logs (IP address, browser) at Auth0; username, display name, routes,
    reports and session records at Cloudflare.
  - *Why it's adequate:* both are bound by their published data processing terms;
    data is encrypted in transit and at rest; only what's listed above is
    collected; no GPS positions or analytics; accounts can be deleted.
  - *The privacy policy says* that this data is stored by Auth0 and Cloudflare
    outside Québec, mainly in the United States, and why.
  - Accept Auth0's and Cloudflare's data processing terms in their dashboards if
    they're offered as a separate step, and keep a copy with the assessment.
- The README and CLAUDE.md promises change: "no backend, accounts" becomes
  "optional accounts", and the outside-requests rule adds our own `/api`, Auth0,
  and (through our server, while building a route) GeoGratis and Overpass.

## 12. Build order

**[assumed]**

0. **Prerequisites.**
   - Live Auth0 tenant created (2026-11-12, US region, kept). Create a second
     tenant for beta. Create beta D1/R2.
   - **First test, before anything else:** sign in through Auth0 from the
     *installed* iPhone app and confirm the app comes back signed in. If it fails,
     the fallback (sign-in from our own screen via Auth0's API) changes §5.
1. Accounts: sign-up, sign-in, sessions, recovery code, display name, delete account.
2. Personal library: upload → check turns → save → follow, offline cache.
   Cut the Québec map, check its size, upload to R2, and switch routes to
   per-route map downloads (§4a).
3. Public library from the database: migrate built-in routes, switch the library
   and Sunday dashboard to it, freeze the repo route files, pacer uploads, edit
   and withdraw, change log, admin withdraw/restore/delete.
4. Reports, complaint box and in-app notification badges.
5. Admin: promote/demote pacers, moderation, disable accounts.
6. Before launch: privacy email address, privacy policy, terms of use, privacy
   assessment, retention clean-up job.
7. Later: suggest a personal route for the public library; build routes on a map.

## 13. Open questions

1. Can Auth0's sign-in token tell us a passkey was used, and can Cloudflare
   Access protect one path on `*.pages.dev`? (§1) Checked during step 1.

Settled 2026-11-12: Google left out of V1; 3 recovery attempts a day; runners can
report; display names repeat, usernames are unique; live Auth0 tenant stays in
the US; routes are built in the browser; the database is the only source of
public routes; public routes stay inside the Québec map area; each route
downloads its own offline map from our Québec map on R2; accounts are 14+;
a separate privacy email and drafted policy/terms; in-app notifications only;
demoted pacers lose editing; disabled accounts keep hidden routes; field-verified
is a dated tick by the owner; retention periods in §11.
