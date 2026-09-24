# Account progress

This feature is on `feature/account-study-progress`. It is not merged, pushed, or deployed. The user will push and create the PR. Production still runs the existing static site.

## Local development

Requires Node.js 22 or later. Credentials are in ignored `.env.local` (mode 0600); never commit it or serve the repository root with a generic file server.

```sh
npm ci
npm run build
npm run db:migrate
npm run dev
```

Open http://127.0.0.1:8765/ and use **Sign in with Vercel**. The development server serves only `public/` and explicit API routes. `npm run build` copies an allowlist of study assets; server code, database schema, tests and environment files stay outside the static output.

The existing `hirogaru-study` Vercel project has Development-only environment variables: `APP_ORIGIN`, `VERCEL_APP_CLIENT_ID`, `VERCEL_APP_CLIENT_SECRET`, and the Neon integration's database variables. The app uses `DATABASE_URL`. The database `japanese-learner-progress` is on Neon `free_v3`; no paid upgrade was selected. The OAuth app is **Japanese learner**, restricted to members of `crhettiarachchis-projects`, with only `openid profile` and `client_secret_basic`. Its callbacks are `http://127.0.0.1:8765/api/auth/callback` and `https://hirogaru-study.vercel.app/api/auth/callback`. Production and Preview credentials have not been configured.

## Behavior

Article and grammar checkboxes and each recording's playback position and independent **Mark audio as done** checkbox use authenticated account storage. Signed-out users retain browser-only progress. The same account on another device loads saved changes when opening, refocusing, or reconnecting the page. Audio restores position without autoplay, writes at most every five seconds while playing, and saves on pause, seek, end, and leaving the page. Finishing audio resets its resume position but does not mark it done automatically.

Legacy keys remain `hirogaru-reading-progress-v1`, `hirogaru-misa-grammar-v1`, and `japanese-learner-audio-progress-v1`. After signing in, use **Import this browser’s old progress** and confirm the named account. Import only fills absent server fields, preserves explicit server unchecks, filters unknown content IDs, and leaves original local data intact. A browser import is claimed by one account to prevent accidental import into another account on a shared browser.

Pending updates are journaled separately by account and operation in browser storage and retried on reconnect/focus. Account switches cannot upload one account's pending edits to another. If two devices edit the same field from an old revision, the server returns a conflict; **Refresh from account** explicitly discards pending changes and loads the server state. Completion and playback position have independent revisions. A browser crash can lose up to the playback save interval; clearing browser storage removes unsynced edits. If browser storage is unavailable, keep the tab open until it reports synced.

## Security model

Vercel Deployment Protection remains an outer access gate; it is not used as the app's account identity. The app uses the supported Vercel OAuth authorization-code flow with PKCE S256, one-time state, browser binding and nonce. It verifies RS256 ID-token signature, issuer, audience, expiry and nonce against Vercel's JWKS. It stores no access or refresh tokens. Server-side opaque sessions are hashed in Postgres, expire after 24 hours, and use HttpOnly SameSite=Lax cookies (`__Host-` and Secure on HTTPS). Write APIs require exact Origin and session CSRF validation. Logout revokes the current session.

All progress queries derive the owner from the server session, never from a submitted user ID. SQL uses explicit owner predicates and transaction-local `app.user_id`, with forced PostgreSQL row-level security as a second boundary. The Neon owner role may bypass RLS; explicit owner predicates remain required. Database access is server-only. Responses are `no-store`. Content IDs are canonical source URLs, existing grammar IDs, and audio slugs. Build regenerates the server and client catalogs from the archive/course and `audio-catalog.json`.

## Validation

All 20 automated tests pass. Real-account audio completion and unchecking survived a browser reload; playback did not autoplay.

`npm test` covers signed-token rejection cases, CSRF/origin, secure cookies, actual PostgreSQL SQL/RLS through PGlite, account A/B isolation, stale revisions, explicit unchecks, independent audio fields, offline retry, concurrent-tab journals, account switching, import safety, malformed storage, and playback events.

`npm run test:integration` is opt-in and requires the local server and Development credentials. It creates uniquely named temporary test accounts in the real Neon database, exercises the actual HTTP session/progress/logout APIs, verifies private-file exclusion and audio byte ranges, and cleans up only those test records. It does not impersonate a real user or bypass the production login flow. Real Vercel browser sign-in was separately completed and confirmed by the user.

## Before any production rollout

A later authorized rollout must configure Production environment variables (`APP_ORIGIN=https://hirogaru-study.vercel.app`), choose/migrate the production database, preserve Vercel Authentication for All Deployments, and test the deployed callback. Preview deployments need an explicitly approved callback/origin and appropriate credentials; they currently cannot sign in. Pushing this branch can trigger a Git-connected preview, so no push was performed.

The daily content automation still points at the older workflow checkout. Migrate that workflow to this repository and preserve the account scripts/build process before it deploys over this feature. New reading sets must keep canonical article IDs and load `/progress-store.js` before `reading.js`; new audio needs a stable slug, duration in `audio-catalog.json`, and `/audio-progress.js`. `research/render_course.py` includes the shared progress loader.
