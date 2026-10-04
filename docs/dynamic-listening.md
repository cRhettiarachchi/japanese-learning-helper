# Personal listening library

Branch: `codex/dynamic-listening-feasibility`. No production deployment or database change is included in the local preview.

Open `/listening/library`. Signed-in users can save a YouTube link and title, optionally upload UTF-8 SRT/VTT (500 KB maximum), and replace subtitles later. Records are stored per account in PostgreSQL with forced row-level security, CSRF-protected writes and optimistic revisions. Existing file-based lessons and their progress remain unchanged. New videos do not require content generation or deployment.

The server loads the library before rendering. Playback uses the official YouTube iframe player; a local animation loop reads its clock only while playing. There is no backend polling. Click a transcript line to seek; overlapping cues select the latest active cue, and gaps highlight none. Uploaded markup is stripped and text is rendered safely. Timestamps are preserved, not speech-aligned. New imported subtitles do not generate furigana or dictionary annotations yet. Existing lessons retain them. Personal videos do not yet persist playback position or completion.

Public caption extraction is not implemented: the official caption download API requires video edit permission, and this app has no Google owner-authorized caption integration. No scraper, AI provider, downloaded YouTube audio or paid service was added. Missing captions show a subtitles-needed state. Deleted, private or embedding-disabled videos show an error and source link. Mobile playback may require tapping Play.

## Database rollout

Before production use, apply `db/listening.sql` using the existing approved database migration process. This is intentionally not run against production by the preview. Run `npm run db:migrate -- listening` against the intended development database to apply only this additive schema in a transaction. The default `npm run db:migrate` still applies only the base schema. With no listening table, the page reports storage unavailable and leaves existing features functional.

## Local preview and checks

Run `npm test`, `npm run build`, then `node scripts/preview-listening.cjs`. Visit `http://127.0.0.1:3010/listening/library`. This loopback-only demo uses a separate persistent PGlite database under the system temporary directory and a demo session; it does not modify production authentication. External sign-in and AI routes are disabled in the demo. Ports 3010, 3011 and 55440 must be free. Stop with Ctrl-C. Removing the temporary demo database clears only preview content.

## Verified local runtime repair (4 October 2026)

The user's port-3000 app uses its configured hosted Neon database. Its listening table was absent, so reloads could not enable the form. After explicit approval, `npm run db:migrate -- listening` applied only this additive schema; forced row-level security was verified. No application deployment or merge occurred. `node --env-file=.env.local scripts/integration-listening.cjs` verified the actual runtime's rendered form, save, VTT import, persistence, initial server HTML, account isolation and anonymous rejection using temporary accounts, then removed only those fixtures.

Validation: 95 unit/database/regression tests; production build and TypeScript; isolated browser test for create/upload/reload, seek/highlighting/gaps, no recurring backend calls, and 390px layout. The deterministic playback test uses a player test double; the real YouTube iframe also loaded and played in the in-app browser.
