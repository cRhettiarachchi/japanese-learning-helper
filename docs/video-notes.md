# Personal grammar-video notes

Each linked video in the grammar table (main and optional extras) has its own Notes actions. Add note opens a WYSIWYG editor. Saving produces Open note and Edit note. Open uses a read-only paper-style modal. Cancel leaves the saved note untouched. Clearing meaningful content and saving removes the visible note; its revision tombstone prevents stale devices from recreating it. Notes are keyed by video ID and signed-in account, and appear on other devices after navigation, focus/online refresh, or reload. There is no network polling, video fetching, transcription, or AI generation.

## Rollout

The feature branch includes all previously merged AI-card and timer work. No live migration or deployment is performed by this implementation.

Apply `db/video-notes.sql` to the intended database before deploying the app. With the correct `DATABASE_URL` explicitly set, run `node scripts/migrate-video-notes.cjs`. It creates three new tables with forced row-level security, account ownership policies, optimistic revisions, and idempotency receipts; no existing tables are altered. The migration is transactional and repeatable. It does not choose an environment or read an env file automatically. SSR still works before migration; notes report that saving needs setup.

## Safety and conflicts

The editor stores allowlisted JSON, not HTML. Headings, paragraphs, bold/italic/underline/strikethrough/code text, blockquotes, lists and line breaks are supported; scripts, arbitrary attributes, images, embeds, styles, and links are rejected. Reading mode renders validated nodes as React text/elements without HTML injection. Limits: 20,000 characters, 60 KB document JSON, 2,000 nodes, nesting depth 12.

Both API read and write paths authenticate the account. Writes verify origin and CSRF. Saves compare the original revision, refusing to overwrite newer changes. On conflict, the draft stays visible; Reload saved note explicitly replaces it. If a save response is lost, Retry save uses the identical mutation ID/payload. Unconfirmed saves cannot be edited until reconciled. Closing an unconfirmed save cannot undo a write already accepted by the server. Unsaved editor drafts are kept only while the modal is open, never assigned to another account or persisted as server notes. Account changes unmount the editor.

## Checks

`npm test`, `npm run typecheck`, `npm run build`, and `node tests/browser/video-notes.cjs` against the local app. Integration/browser fixtures use isolated PGlite accounts, not live study data. Test coverage includes safe formatting, duplicate/lost-response saves, canceled edits, deletion and stale recreation, ownership/RLS, SSR read-only snapshots, desktop/phone layout, keyboard focus, and zero idle API requests. No AI credentials or paid API calls are needed.

## Working local demo

After `npm run build`, use `npm run preview:notes`. It serves `http://127.0.0.1:3000/grammar.html` with a clearly named local demo account. Notes save through the real API into a separate PGlite database under the OS temporary directory (`hirogaru-video-notes-local-preview`), and survive browser reloads and restarts of the preview while that folder remains. The preview binds only loopback ports 3000, 3001, and 55432. It never reads or migrates the production database; the child app’s database URL is forcibly local. External sign-in and AI endpoints are disabled by the preview proxy. Stop with Ctrl+C before using normal `npm run dev` or `npm run start` on port 3000. Preview notes are sample data, not your real account notes. No production migration is required to try Save/Open/Edit locally.
