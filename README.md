# Japanese learner

Use `npm ci`, `npm run build`, and `npm run dev`, then open http://127.0.0.1:8765/. See [account progress setup](ACCOUNT-PROGRESS.md) for Development credentials, sign-in, tests and rollout status. Do not serve the repository root: it contains ignored server credentials.

Five full article texts with original hiragana ruby readings. Source article photographs: one per article. Audio, videos and quizzes remain available on the original pages.

Source and copyright: The Japan Foundation, Japanese-Language Institute, Kansai. Personal use only, under https://www.hirogaru-nihongo.jpf.go.jp/site_policy/index.html . Do not publicly republish this collection.

The source text is preserved, including historical statistics; it is not a current fact sheet. Downloaded 2026-09-09.


## Grammar course (13 September 2026)

Open grammar.html, or http://127.0.0.1:8765/grammar.html using:

    npm run dev

13 stages, 129 lesson entries, 136 distinct verified Misa video links, and 36 coverage-gap entries (165 total). Signed-in checkboxes sync to your account; signed-out progress stays in this browser. Old browser progress can be explicitly imported after signing in. Article text and ruby markup are preserved.

Research covers 299 public uploads, seven Shorts, nine relevant playlists, official grammar pages, and targeted searches. YouTube oEmbed confirmed metadata and attribution for 306 public videos; this does not guarantee playback in every region. Mapping is based on public metadata, not watching every video. Two historical links returned 403 and are not offered as verified videos. Missing matches are not proof of absence. Bunpro N5–N3 entries were used as a prerequisite cross-check, not a complete JLPT syllabus. See the page’s coverage notes and research/catalog-audit.json.

Validation passed: completion saving and reload, next unfinished lesson, search, empty state, 36-gap filter, stage navigation, desktop and 390px mobile layouts without page overflow. All internal fragment targets resolve, all 136 video IDs match the verified catalog, and local assets return HTTP 200. Test completion was restored to unchecked.

## App name and saved progress

The app is named **Japanese learner**. Hirogaru remains the credited source of reading articles. Existing browser-storage keys and article URLs are intentionally unchanged, so the rename preserves completion history. Keep using the same local address and port for access to that history.
