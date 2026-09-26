# Revisions

`revisions/revision-1-test.md` and `revisions/revision-1-answers.md` are the complete prepared diagnostic artifacts, copied without edits. The build uses `scripts/render-revisions.cjs` and the pinned Markdown renderer in the lockfile to emit a landing page and separate test/answer pages. It adds section anchors and links the 37-row review table back to stable grammar lesson IDs. Answers are not embedded in the test page. Download links provide the original Markdown; Print uses the current document only.

The shared study navigation lives in the persistent React layout, so regenerated reading archives retain the Revisions link without rewriting article content. `npm run dev` regenerates content automatically. The test covers displayed app rows001–037, including four separately scored gaps, not37 checkable video entries. Browser quizzes, automatic grading and progress marking are intentionally not part of this handwritten revision.
