# Japanese learner

Use `npm ci`, `npm run build`, and `npm run dev`, then open http://127.0.0.1:3000/. See [account progress setup](ACCOUNT-PROGRESS.md) for Development credentials, sign-in, tests and rollout status. Do not serve the repository root: it contains ignored server credentials.

Twenty unique articles across four dated sets, with original Japanese text and hiragana ruby readings. Original source photographs are retained where present. Audio, videos and quizzes remain available on the original pages.

Source and copyright: The Japan Foundation, Japanese-Language Institute, Kansai. Personal use only, under https://www.hirogaru-nihongo.jpf.go.jp/site_policy/index.html . Do not publicly republish this collection.

The source text is preserved, including historical statistics; it is not a current fact sheet. Downloaded 2026-09-09.


## Grammar course (13 September 2026)

Open grammar.html, or http://127.0.0.1:3000/grammar.html using:

    npm run dev

13 stages, 129 lesson entries, 136 distinct verified Misa video links, and 36 coverage-gap entries (165 total). Signed-in checkboxes save automatically to your account. Editing waits for verified account data. Legacy browser data is automatically migrated only when its saved owner matches the account, and only for absent server fields; unowned data is preserved untouched. Article text and ruby markup are preserved.

Research covers 299 public uploads, seven Shorts, nine relevant playlists, official grammar pages, and targeted searches. YouTube oEmbed confirmed metadata and attribution for 306 public videos; this does not guarantee playback in every region. Mapping is based on public metadata, not watching every video. Two historical links returned 403 and are not offered as verified videos. Missing matches are not proof of absence. Bunpro N5–N3 entries were used as a prerequisite cross-check, not a complete JLPT syllabus. See the page’s coverage notes and research/catalog-audit.json.

Validation passed: completion saving and reload, next unfinished lesson, search, empty state, 36-gap filter, stage navigation, desktop and 390px mobile layouts without page overflow. All internal fragment targets resolve, all 136 video IDs match the verified catalog, and local assets return HTTP 200. Test completion was restored to unchecked.

## App name and saved progress

The app is named **Japanese learner**. Hirogaru remains the credited source of reading articles. Existing browser-storage keys and article URLs are intentionally unchanged, so the rename preserves completion history. Keep using the same local address and port for access to that history.


## React application

The application uses Next.js App Router, React, strict TypeScript, Tailwind CSS and real shadcn/ui components. A persistent root layout owns the profile, theme, shared account store and study timer; internal Next links change only the study content. There are no iframe routes. Existing `.html` addresses and fragment links remain supported.

- `npm ci` installs locked dependencies (Node 22 or newer).
- `npm run dev` regenerates content and runs the local app on port 3000. Existing Development credentials remain in ignored `.env.local`.
- `npm run content:build` compiles source documents and dictionary data into typed React page inputs, updates catalogs, and regenerates the public media/data allowlist.
- `npm run build` regenerates content and creates an optimized Next build. `npm start` serves that build locally.
- `npm run typecheck` checks TypeScript. `npm test` runs persistence, API, content integrity and historical behavior regressions. `npm run test:browser` runs the actual React app in isolated synthetic-account browser contexts; start the local app first. Install Chromium using `npx playwright install chromium`, or set `PLAYWRIGHT_EXECUTABLE_PATH` to an existing executable. `TEST_APP_ORIGIN` optionally changes the default local URL.

The root HTML documents remain **content sources**, not served pages. Their original article wording, ruby nodes, grammar links and transcript timing data are preserved by `scripts/prepare-content.cjs`. React replaces all interactive controls. Daily reading generation must update those source documents and archive data, then run the Next build; uploading `public` as a standalone static site is no longer valid. The compatibility `scripts/build.cjs` now only regenerates content. No daily automation or deployment was changed in this migration.

`src/components` contains the React screens and shared shadcn components; `src/core` contains the tested headless progress, audio and vocabulary persistence engines. `src/app/api` adapts the existing authenticated server handlers without changing schemas, account ownership, CSRF checks, revision conflicts or idempotent mutation receipts. Server modules and credentials never enter the public output. No database migration is required.

The timer draft stays local and account-scoped. Start, stop, background pause and adjustments do not write to the server. Explicit Save time commits an idempotent operation; lost responses retain the draft and receipt for retry. Saved history remains account-wide. Internal navigation preserves the mounted timer; browser refresh/background/closure pauses it for review rather than accruing unseen days.

Reading appearance provides saved text size, line spacing and furigana controls. Light/dark/system appearance uses `next-themes` with a pre-hydration theme script. Account/profile, theme menus, timer dialogs, dictionary sheet and shared buttons use shadcn/ui. Japanese text and readings remain selectable and semantic HTML ruby; the dictionary remains attributed to JMdict.

Historical DOM UI code is retained only under `tests/legacy-ui` for baseline behavior tests. It is not part of the runtime or public files.

Account data is loaded on the server for each authenticated page request and hydrates the shared stores before the first render. The private, dynamic response contains only the verified public profile, CSRF value and that account’s progress, vocabulary and saved time. Client refreshes use one `/api/account` snapshot on focus, visibility, reconnect or account-storage events; there is no network polling. Local pending changes are recovered after hydration, and mutations and explicit Refresh/History actions still make requests. The timer’s local clock does not fetch data.

`npm run test:ssr` is an opt-in Development-database test with temporary fixtures and cleanup. It checks authenticated SSR, account isolation, pending-change recovery and absence of startup/idle API traffic. Set `STRICT_SSR_CACHE=1` against `npm start` to require private/no-store document headers; Next development mode uses its own no-cache headers.

The local address now uses port 3000, leaving port 8765 free for AnkiConnect. Browser-local preferences and unsaved drafts on the old origin remain there; server-saved progress is available after signing in. Configure the Development OAuth redirect URI for `http://127.0.0.1:3000/api/auth/callback`.
