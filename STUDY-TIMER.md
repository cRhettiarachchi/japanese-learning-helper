# Study timer

The persistent Next.js root layout sits above study navigation and holds the React timer and compact profile menu. Next links preserve the mounted header during internal navigation, archive selections, and browser Back/Forward. Existing shareable study URLs and fragments remain supported. There are no iframe documents; the page scrolls and prints as one normal document.

## Local draft and explicit save

Start, ticks, Stop, review adjustments, and draft Discard use only localStorage under `learner.timer.draft.v1.<account>`. They do not POST server timer checkpoints. Active drafts are browser-local and account-scoped; other devices only see saved sessions. Another tab in this browser cannot control the active owner tab; storage events keep its view current. The existing tab client ID is kept in sessionStorage.

The timer counts visible foreground time with a monotonic clock and stores its draft every second. Hiding/leaving the app pauses it for review. A large scheduling gap (over five seconds, e.g. sleep) pauses without counting the gap; actual reload/reopen recovers the last persisted draft for review. Internal shell navigation does not reload the timer. Closing/crashing may lose the last second; clearing browser storage loses an uncommitted draft. Review and adjustment are available before saving; maximum duration is 24 hours.

**Save time** sends the final duration using an authenticated `commit` action. Account totals and latest 50 saved sessions load initially, on History, and after a save/retry—not periodically. The server inserts the saved row and mutation receipt transactionally, with per-account locking, CSRF, ownership checks and idempotency. A failed/lost response retains the exact pending operation for retry; another account never receives it. Only an explicitly requested save is retried. Editing/discarding previously saved history remains an explicit authenticated operation. Account changes pause and retain the original local draft.

## Compatibility and rollout

No schema migration is required: `commit` reuses the existing study sessions and mutation receipt tables. Existing saved history/totals are untouched. Older server-tracked open sessions remain accessible in History for review once their old lease expires; the legacy API is retained for compatibility. All non-timer study progress continues to auto-save normally.

Build with `npm run build`; Next produces the application and server routes. `npm run dev` regenerates content and provides hot reload. This branch is local only; the user handles push, PR and deployment.

## Verification

Tests use PGlite for real SQL constraints, account isolation, idempotent commits, history preservation and stale edits. UI tests verify zero timer requests during local running/stopping, explicit save/retry, adjustments, discard, background recovery and account switching. Migration checks verify source/ruby preservation and public asset exclusions; `npm run test:browser` verifies the actual React UI. Browser checks cover header placement, internal navigation, Back and 360px layout.
