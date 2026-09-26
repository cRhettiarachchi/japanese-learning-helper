# Account progress

Automatic account progress changes are on `feature/automatic-account-progress`, based on merged main. The user handles pushing, PR creation, and deployment.

## Local development

Requires Node.js 22 or later. Credentials are in ignored `.env.local` (mode 0600); never commit it or serve the repository root with a generic file server.

```sh
npm ci
npm run build
npm run db:migrate
npm run dev
```

Open http://127.0.0.1:3000/ and use **Sign in with Vercel**. The Next development server serves React pages, an allowlist of public media/data, and explicit authenticated API routes. Server code, database schema, tests and environment files are not public assets.

The app uses `APP_ORIGIN`, Vercel OAuth client credentials, and `DATABASE_URL`. Keep Development and Production credentials separate. The existing Vercel project and authenticated production database are retained; this change does not alter deployment protection, credentials, database schema, or services.

## Behavior

Signed-in article/grammar completion, audio completion and playback positions load and save automatically. The shared account UI is only an accessible profile menu with **Sign out**; signed-out visitors see **Sign in** and cannot change saved progress. There is no browser/account choice, import button, or routine sync banner. Errors appear only when connection or saving needs attention. Vocabulary keeps its account-backed behavior. The timer is the explicit exception: its active draft stays local until Save time (see STUDY-TIMER.md).

Initial account loading disables edits until the server response verifies the account. Changes save immediately. Opening, focusing, reconnecting, returning to the page, and a 15-second foreground retry/refresh loop load account changes. Requests time out after 15 seconds. Paused audio follows refreshed playback position; playing audio is not interrupted by another device's position. Audio still saves at most every five seconds while playing and on pause/seek/end/navigation, without autoplay or automatically marking completion.

Browser cache and per-account pending journals are implementation details. Offline edits after a verified load remain queued for that account and retry automatically. Fresh offline page loads cannot verify identity and therefore leave editing disabled. Account changes and sign-out clear displayed data; pending journals are never uploaded to another account. A stale revision automatically keeps the current server value for that field and continues unrelated saves. Superseded intentions are retained under the account cache's `:superseded:` keys for recovery, not retried. No union of completed flags is performed, so an older check cannot resurrect a newer uncheck. Clearing browser storage can still lose unsaved work; unavailable storage is reported.

Legacy keys remain `hirogaru-reading-progress-v1`, `hirogaru-misa-grammar-v1`, and `japanese-learner-audio-progress-v1`, untouched. Only legacy progress whose existing `japanese-learner-legacy-owner-v1` claim matches the current account is automatically migrated, once per account. Catalog-validated values fill absent server fields only; explicit false and newer server positions survive. Pending edits take priority, and server revision checks also protect migration races. Legacy progress without an ownership claim (or assigned to another account) has no reliable timestamps/identity and is preserved locally without adoption. This prevents silently assigning shared-browser history to the wrong person. There is no destructive cleanup or production schema change.

## Security model

Vercel Deployment Protection remains an outer access gate; it is not used as the app's account identity. The app uses the supported Vercel OAuth authorization-code flow with PKCE S256, one-time state, browser binding and nonce. It verifies RS256 ID-token signature, issuer, audience, expiry and nonce against Vercel's JWKS. It stores no access or refresh tokens. Server-side opaque sessions are hashed in Postgres, expire after 24 hours, and use HttpOnly SameSite=Lax cookies (`__Host-` and Secure on HTTPS). Write APIs require exact Origin and session CSRF validation. Logout revokes the current session.

All progress queries derive the owner from the server session, never from a submitted user ID. SQL uses explicit owner predicates and transaction-local `app.user_id`, with forced PostgreSQL row-level security as a second boundary. The Neon owner role may bypass RLS; explicit owner predicates remain required. Database access is server-only. Responses are `no-store`. Content IDs are canonical source URLs, existing grammar IDs, and audio slugs. Build regenerates the server and client catalogs from the archive/course and `audio-catalog.json`.

## Validation

Automated checks cover automatic initial loading/saving, stale revisions, legacy migration, offline recovery, account switches, profile controls, and audio restore.

`npm test` covers signed-token rejection cases, CSRF/origin, secure cookies, actual PostgreSQL SQL/RLS through PGlite, account A/B isolation, stale revisions, explicit unchecks, independent audio fields, offline retry, concurrent-tab journals, account switching, import safety, malformed storage, and playback events.

`npm run test:integration` is opt-in and requires the local server and Development credentials. It creates uniquely named temporary test accounts in the real Neon database, exercises the actual HTTP session/progress/logout APIs, verifies private-file exclusion and audio byte ranges, and cleans up only those test records. It does not impersonate a real user or bypass the production login flow. Real Vercel browser sign-in was separately completed and confirmed by the user.

## Deployment

No new environment variables or schema migration are required. The user handles the PR and deployment of the existing project. Keep Vercel Authentication enabled and use the normal build so study pages receive the persistent shell. Preview environments still require their own configured OAuth callback/origin.

The daily content automation is unchanged. New reading sets must keep canonical article IDs, source ruby and lookup token data; new audio needs a stable slug, duration in `audio-catalog.json`, and embedded transcript/timing data. `scripts/prepare-content.cjs` extracts these into React page inputs. Shared account behavior comes from the root provider, with no per-page script tags. Deploy the Next build rather than uploading public as a static site.
