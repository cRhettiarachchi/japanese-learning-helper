# Account study timer

The top bar on every built study page includes Start/Stop, cumulative confirmed hours, and History. Stop opens a duration review with Save time, Adjust time, Discard, and Review later. Nothing counts until saved. History shows the latest 50 saved sessions and allows duration corrections or discarding an accidental entry. Totals include all saved sessions, not just the latest 50. Durations range from 0 to 24 hours per session.

## Local development

Use the existing Development `.env.local`, including `DATABASE_URL` and the local `APP_ORIGIN`.

```
npm ci
node --env-file-if-exists=.env.local scripts/migrate-study-time.cjs
npm run build
npm run dev
```

The migration helper refuses a non-local origin. It is additive/idempotent and changes only the three new timer tables and their policies/indexes. Existing progress and authentication data are untouched. Local preview: http://127.0.0.1:8765/ . The Revisions entry is /revisions.html . Build output is served by the dev server; rebuild after frontend changes and restart after API changes.

## Timing behavior and limitations

The starting tab sends a checkpoint every 15 seconds while visible. The server uses its own clock. Every account has at most one active OR unconfirmed session; another tab/device can see and stop it, but cannot keep the starting tab's timer alive. Internal site link navigation in the same tab retains the client identifier and continues timing. Switching away requests Stop using a keepalive request. Returning to an unconfirmed session presents Review time.

Browsers cannot reliably announce that they closed, especially on mobile. A session whose last checkpoint is over 45 seconds old is moved to review on the next API access, with elapsed time frozen at the last accepted checkpoint. The unobserved interval is not added, even after days away. The displayed clock is also capped while disconnected. No scheduled backend job is necessary, and expired rows never contribute to totals. Abrupt closure can omit the final partial checkpoint interval. A brief interruption below 45 seconds can be included if a new checkpoint arrives; adjust the result before saving when needed.

Background audio may keep playing while the timer stops; this is deliberate foreground-only behavior. Browser back/forward or reload may stop the session because they do not expose the same in-page link intent; review is retained. Very slow internal navigation beyond the 45-second lease pauses safely. Start again after saving/discarding the review. This is not a background tracker or Pomodoro timer.

Account identity and CSRF reuse the existing authenticated session. SQL transactions lock one account row before reading/mutating timer state. A partial unique index enforces one open session. All three tables have forced RLS plus explicit user predicates. There is no client-provided owner ID. Saving/editing/discarding checks the session revision; stale device edits get HTTP409. Mutations have per-account UUID receipts and payload hashes, so retries cannot create/count a second session. Heartbeats do not generate receipts or change confirmed totals.

The browser journals an unacknowledged mutation under its account+tab identity. Retry replays that exact mutation; a response lost after a successful save cannot double-count. Closing the tab may lose its tab identity, but any committed active/review/saved state remains on the server. A completely unsent save/adjust cannot be guaranteed across tab destruction; inspect the server review/history. A pending journal never replays under a different account. Session storage is required to start; blocked local storage prevents mutation journaling and produces an error. No credentials are stored in browser storage.

Reference: [MDN pagehide](https://developer.mozilla.org/en-US/docs/Web/API/Window/pagehide_event) and [visibilitychange](https://developer.mozilla.org/en-US/docs/Web/API/Document/visibilitychange_event) explain why unload delivery is best effort. Checkpoints, not event delivery, bound abandoned time.

## Validation

```
npm test
node --env-file-if-exists=.env.local scripts/integration-study-time.cjs
```

Tests cover SQL transitions, owner isolation/RLS, invalid inputs, stale recovery, pending reviews, duplicate requests, concurrent starts/saves/edits against Development Postgres, UI adjust/save/discard/history, and dropped-response replay. Integration uses uniquely named temporary accounts and removes its fixtures. It never changes real users' study history.

## Production rollout — not performed by this feature work

Before deploying this branch, apply `db/study-time.sql` to the **existing production database**, using the established secure migration mechanism and an appropriately authorized operator. Do not point local `.env.local` at production, do not run the Development integration against production, and do not run migrations automatically during every Vercel build. If production uses a separate runtime DB role, grant that existing role SELECT/INSERT/UPDATE/DELETE on `learner_timer_accounts`, `learner_study_sessions`, and `learner_timer_mutations`; retain their RLS policies. Schema must precede code rollout or the new API will report an error. Existing functionality is independent of the timer API.

Then deploy through the normal user-owned PR/merge workflow, retaining Vercel Authentication and existing environment configuration. No new service or paid plan is needed. Application rollback is safe: stop serving the widget/API and retain these additive tables. Mutation receipts are intentionally retained for retry safety; don't prune them without designing an idempotency retention window.
