# Article and transcript word lookup

Every current/archived article supports tap, click, Enter or Space on natural Japanese word units, including inflected words and compounds spanning multiple ruby nodes. The original article text and ruby annotations are preserved byte-for-byte by the generator. Links, reading checkboxes, archive navigation and grammar pages keep their existing behavior.

`dictionary.js` and `dictionary.css` provide one non-modal popup for articles and transcripts. It lists all English glosses from the matched local JMdict entries, deduplicating repeated gloss text without limiting or hiding senses. Pronunciation, dictionary-form headings, part-of-speech labels and the explanatory sentence were removed. The selected word remains highlighted on the page. Close/Escape returns focus to the selected word. Loading, Retry and no-entry states remain available. Dictionary attribution/licensing is retained in a compact footer.

`article-lookup.js` loads `/listening/dictionary.json` only on the first lookup and reuses it. Article token maps are embedded in each reading page. Transcript pages retain their existing embedded dictionary data and use the same popup; `transcript-player.js` retains full/focused views, word/timestamp highlighting, speed/readings controls, and pause-on-lookup/resume-only-if-previously-playing behavior. There are no external per-word lookup requests.

Definitions come from the existing JMdict English snapshot, not generated translations. They are dictionary alternatives rather than a context-specific sentence translation. Proper names, dates and some spoken forms may have no entry; those display “No English meaning found.”

## Build and maintain

The normal `npm run build` copies the committed generated HTML and dictionary assets; Vercel does not need Python or the full dictionary. To regenerate word buttons after editing/adding articles, install `scripts/requirements-dictionary.txt` in a Python environment, obtain JMdict English from EDRDG, and run:

```sh
JMDICT_PATH=/absolute/path/to/JMdict_e.gz python scripts/build-article-lookup.py
npm run build
npm test
```

The build-time tokenizer reuses the existing Sudachi/JMdict compound and inflection matching logic. The generator can be run repeatedly without changing its output. It never splits existing ruby elements and avoids links or interactive controls. Full tokenizer and dictionary source files are not shipped; the adapted entries are in `listening/dictionary.json` under CC BY-SA 4.0 with attribution.

Tests cover all English senses, safe text rendering, focus/close behavior, loading failures/retry, async lookup races, article control isolation, transcript playback/seek/focused-view integration, and preserved source text/ruby/links/completion/timing data across every existing page. Browser checks cover desktop transcript lookup and phone-size archive/article lookup without horizontal overflow.

Production has not been deployed from this feature branch. The user will push and create the PR.
