# Grammar practice

Each curriculum row (including explicitly marked no-video gaps) offers **Generate questions**. A dialog generates ten short written-response exercises for that exact grammar point. All ten must be answered before a single grading request. Each answer gets accepted/correct, accepted-but-less-natural, or incorrect feedback, an explanation and an example. **Retry mistakes** unlocks only incorrect answers; grading still sends the complete set. **Done** deletes the temporary set and closes the dialog. New generation starts fresh. No multiple-choice controls or automatic changes to lesson completion.

Revisions is removed from app navigation; its old HTML routes redirect to Grammar. Historical revision sources, answer guides and stored progress are preserved.

## Server configuration and rollout

- Server environment `OPENAI_API_KEY` only. Never use a `NEXT_PUBLIC_` key. The Vercel dashboard was verified to contain this key as **Secret / Production**; its value was not accessed.
- Optional `OPENAI_GRAMMAR_MODEL`, default `gpt-5-mini`. Chosen for bounded, cost-sensitive text generation/grading; configurable without changing clients. Uses Responses API strict JSON Schema output and independent runtime validation, `store:false`, low reasoning, 6,000 output-token ceiling and 45-second upstream timeout. No tools or model access to database/session credentials.
- Before deploying, apply the additive `db/grammar-practice.sql` to the intended database using `node --env-file=.env.local scripts/migrate-grammar-practice.cjs` (or a securely supplied DATABASE_URL). Existing authentication schema is required for requests. This feature's Production migration has **not** been applied. Do not merge into auto-deploying main until that migration is complete.
- The API route's duration budget is 60 seconds. Existing secrets and origin/session settings are reused. New environment variables take effect only on a new deployment.
- Production-only key does not enable local/Preview live calls. No live model calls were made during implementation. Model access, language quality and latency require a real smoke test in a properly configured environment before rollout. Tests simulate OpenAI and do not claim to validate pedagogical accuracy.

## Privacy, integrity and cost limits

`POST /api/grammar-practice` validates the existing authenticated session, same origin and CSRF token. Grammar context comes from committed `grammar-data.json`; clients cannot supply prompts, rubrics, example answers, identity, or model names. Generation examples stay server-side until feedback. Questions have server-assigned IDs q1–q10. Grading retrieves the original set by authenticated owner, not browser-supplied questions. All generated text renders as React text, not HTML. Prompts treat answers and generated content as untrusted data; model feedback is advisory and never executes actions.

The additive tables all ENABLE and FORCE account RLS. A committed account lease serializes paid calls across instances. Every reserved attempt (including upstream failure) counts against 40 calls and 10 generated sets per UTC/database day, with a three-second cooldown. Each set allows four successful grading rounds. Repeated generation request IDs and identical answer hashes return the existing result; stale revisions are rejected. Crashed leases expire after 90 seconds. Limits are per authenticated account, not a global billing cap; provider-side spending limits remain separate.

At most one temporary set per account is stored: questions, examples, latest feedback, a one-way answer fingerprint and a two-hour expiry. **Raw submitted answers are never persisted by this app or logged.** Answers remain only in component memory and are cleared on account change, dismissal or navigation/reload. Done deletes the set; new generation replaces it; expiry makes it unusable and the next successful generation or Done removes it. Expiry is enforced on access, not a scheduled physical deletion guarantee for dormant accounts. Temporary feedback may quote an answer correction. No full practice history is maintained.

Only the first grading round updates the persistent summary: lesson ID, bounded attempt/mistake counts, enumerated error categories and timestamp. No user text or free-form profile; at most 40 recently practiced points. Retry success does not double-count initial attempts. The selected point's summary informs future questions. `store:false` disables Responses storage, but does not claim zero provider retention; ordinary OpenAI API data controls apply.

## Validation

- `npm test` — existing regression suite plus SQL/RLS, cost reservation, concurrency, idempotency, validation and mocked OpenAI contract tests.
- `npm run typecheck` and `npm run build`.
- `TEST_APP_ORIGIN=http://127.0.0.1:3001 node tests/browser/grammar-practice.cjs` — synthetic account/API, desktop and narrow phone flow, batched grading, recoverable errors, retries, dismissal and account switch.
- Local feature review uses port 3001 to leave the existing app at 3000 and AnkiConnect at 8765 alone. To run this isolated worktree: `APP_ORIGIN=http://127.0.0.1:3001 npx next dev --webpack -H 127.0.0.1 -p 3001`. Real local sign-in needs corresponding local auth configuration; no credentials are copied into the worktree.

Official references checked September 26, 2026:
- https://developers.openai.com/api/docs/guides/structured-outputs
- https://developers.openai.com/api/docs/models/gpt-5-mini
