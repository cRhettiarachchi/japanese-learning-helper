# Vocabulary review

One account-owned collection, accessible from every study page’s Vocabulary navigation. The shared dictionary popup supports Add to review for both articles and transcripts. A token matching multiple JMdict entries shows separate headwords, meanings, and save buttons; nothing silently chooses or merges unrelated entries. Existing saved entries show Added and cannot be added twice. The identity is the JMdict entry ID, not the inflected surface string. Saved canonical word, reading, and English meanings are server-validated dictionary snapshots.

## Cards and schedule

The front shows the canonical Japanese word with verified whole-word hiragana ruby for words containing kanji. Kana-only words have no duplicate ruby. English stays hidden until Reveal meaning. Pronunciation pairs are extracted from JMdict `re_restr`/`re_nokanji` relationships, not guessed from token readings or split character by character. `vocabulary-readings.json` records the source hash and matched pairs. The current subset has 1,544 verified pairs and no kanji entries lacking one. Future unmatched words omit ruby rather than inventing it. Older saved words can receive a verified reading only when their canonical word still exactly matches the catalog.

- Swipe **left = Good / remembered**.
- Swipe **right = Again / not good**.
- Swipe **up = Undo** on the revealed meaning area. On phones, the whole revealed meaning area captures gestures; the rest of the page scrolls normally. Up needs at least 88px and clear vertical dominance. Ratings require revealed meanings. Short, diagonal, cancelled, multitouch, and long drags do not rate. The separate swipe pad has been removed.
- Desktop Good/Again buttons appear only after reveal. On narrow coarse-pointer phones they are not visually shown; the meaning area accepts gestures. Fine-pointer devices (including touch laptops with a mouse/trackpad) retain desktop controls. The rating buttons remain available to assistive technology and become visible only when keyboard focus reaches them. The meaning region also accepts Left/Right/Up keyboard shortcuts. A visible Undo button remains usable before reveal and after the final card; no-history undo does nothing. Long phone definitions use three-meaning pages, with Previous/More controls exposing every meaning without trapping vertical page scroll.

New words are due immediately. Good progresses through 1, 3, 7, 14, 30 days, then repeats every 30 days. Again returns to stage 0 and schedules 10 minutes from the rating. Server timestamps determine intervals (24-hour days), not client clocks. This is a transparent fixed study aid, not a personalized or validated optimal memory model. Ratings are accepted only when due. The due queue and searchable full list refresh every 30 seconds while visible and on return/online; Refresh is available explicitly.

Undo restores the previous stage/due time while incrementing revision. A newer rating on the same word prevents stale undo. The visible Undo refers to the latest acknowledged rating in the current page; it is not a permanent review-history editor. A pending lost-response rating can recover its Undo when retried. Reload after a fully acknowledged action clears the in-memory Undo control; the schedule remains saved.

## Persistence and security

`api/vocabulary.js` uses the existing authenticated HttpOnly session and Origin+CSRF checks. Four new tables have forced RLS and explicit account predicates. A per-account transaction lock serializes additions/ratings/undo; the primary key `(user_id,entry_id)` guarantees one saved entry. There is no list identifier and no client-supplied user, definition, stage, or due date.

Every mutation has a per-account UUID receipt and payload hash. Ratings/undo also require the expected revision. Concurrent devices cannot double-advance or overwrite one another. Unknown dictionary entries and untrusted fields are rejected. No existing progress/timer tables are modified.

The browser journals unacknowledged operations with account-scoped unique keys. A lost response can be retried without double-adding/rating. Switching accounts never replays the previous account’s journal. Ratings require an online acknowledgement before advancing the UI. Malformed or unavailable local storage produces an error rather than silently losing a pending mutation. Meanings are rendered as text, not executable HTML.

## Build and Development

```
npm ci
node --env-file-if-exists=.env.local scripts/migrate-vocabulary.cjs
npm run build
npm run dev
npm test
node --env-file-if-exists=.env.local scripts/integration-vocabulary.cjs
```

The migration helper only accepts the local Development origin. The integration test creates and removes uniquely named synthetic accounts; it never changes real users’ words. The local app is at http://127.0.0.1:3000/vocabulary.html . The Next development server reloads frontend and backend source changes; run `npm run content:build` after changing source documents or dictionary catalogs.

The regular build creates `server/vocabulary-catalog.json` from the shared dictionary plus transcript-only entries and pairs it with the committed verified reading subset. The Next API adapter bundles explicit server catalog imports. No Python/full dictionary/network lookup is needed during a normal Vercel build.

When changing the dictionary subset, first build the updated canonical catalog, then regenerate verified readings from the matching official dictionary snapshot and build again:

```
JMDICT_PATH=/absolute/path/JMdict_e.gz python3 scripts/build-vocabulary-readings.py
npm run build
```

Missing new reading pairs are safe (no fabricated ruby), but should be regenerated and audited before release. Existing word IDs/progress remain stable.

## Initial production rollout (historical instructions) rollout — vocabulary migration NOT applied

**Before merging/deploying this branch, apply `db/vocabulary.sql` to the existing separate Production database through the authorized migration process.** This branch also includes the earlier account/timer functionality, so `db/schema.sql` and `db/study-time.sql` must already be installed. The timer migration was separately applied to the current production database during the 2026-09-24 incident repair; it should still be checked in any other environment. Vercel build does not run database migrations.

If using a separate runtime role, grant that existing role SELECT/INSERT/UPDATE/DELETE on the four vocabulary tables and retain RLS. Do not point the local `.env.local` at Production or run Development integration against Production. Retain existing Vercel Authentication and environment variables. No new service/paid plan is required. Vocabulary has not been pushed or deployed by this feature work.

Test coverage includes deduplication, all schedule transitions/reset, row isolation/RLS, concurrent real-Postgres additions/ratings, stale ratings/undo, lost responses and account switches, reveal and gesture gating, all three directions, button equivalents, responsive reveal gating, long-meaning pagination, gesture cancellation/multitouch, keyboard access, and front-side ruby/kana fallback. Existing article text/ruby, transcript audio, grammar Revisions and timer tests remain in the suite. Mobile browser checks use disposable in-memory fixture data rather than real user records.

The React/Next migration adds no schema changes. Its UI uses `src/components/vocabulary-page.tsx` and a fresh account-scoped store on identity changes. The historical rollout instructions above describe first-time schema setup, not an additional migration required for this frontend change.
