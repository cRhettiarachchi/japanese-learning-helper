# AI revision cards

Vocabulary → Create revision card asks for exact Japanese and one learning goal. Generation and retry produce an unsaved preview. Edit the question, answer, and hiragana readings, then use Add to my reviews to approve. Custom cards share vocabulary scheduling, Good/Again, Undo, account sync, and offline save receipts. Cancel before approval never creates a card. After approval, an uncertain save remains queued for the same account and is replayed using its original mutation ID; use Retry approved save or Refresh to reconcile it.

## Rollout

No live database migration or deployment was performed during implementation. Apply `db/revision-cards.sql` to the chosen environment **after** its existing vocabulary schema, before enabling card creation. With the intended DATABASE_URL explicitly set, run `node scripts/migrate-revision-cards.cjs`. The script intentionally does not load an environment file or pick a production database. It is additive and repeatable; existing schedules and account policies remain unchanged. Old application versions ignore the new column/table. The updated read path also works before migration; creation reports a setup error until migration completes.

The existing server-only OPENAI_API_KEY and OPENAI_GRAMMAR_MODEL (default gpt-5-mini) are reused. Responses use strict JSON schema, store:false, and a 45-second timeout. Authenticated origin/CSRF checks protect both generation and approval. Generation allows one active request and 30 attempts per hour per account, using a database lease across instances. Draft content is not stored by the app until approval; only quota/lease metadata is persisted. Original Japanese must exactly match ruby segments and each kanji segment requires hiragana. Text is rendered as React text, never injected HTML.

## Verification

`npm test`, `npm run typecheck`, `npm run build`, and `node tests/browser/revision-cards.cjs` (against local app on port 3000). Unit/integration tests use an isolated PGlite database. Browser tests intercept account/AI/save requests with synthetic data; no real accounts or paid OpenAI calls are required. Existing grammar AI tests cover the shared transport too.
