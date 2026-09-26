# Personal Listening additions

The existing Listening player can load extra episodes from the ignored `.private-listening/` folder at build time. This keeps supplied recordings, transcripts, word timings, and source exports out of the public Git repository. The normal build still works without this folder.

Add `episodes.json` containing an array of `{slug, title, label, duration}` objects (duration in seconds). Each slug must be unique and contain only lowercase letters, numbers and hyphens. Supply `<slug>.html`, `<slug>.mp3`, and `<slug>.md` alongside it. HTML follows the existing Listening source format: episode audio, timestamped transcript segments, semantic ruby, and a `study-data` JSON block with tokens, sentences and attributed JMdict entries.

Run `npm run content:build` or `npm run build`. The compiler adds episode navigation to all Listening pages, includes the route/media/download, and creates ignored runtime catalogs for account progress and vocabulary lookup. It does not edit existing transcript sources or publish personal content into tracked catalogs. Stable slugs preserve progress. Generated `public/`, `src/generated/`, and `server/local-listening.json` must remain ignored; never force-add them.

Use a loopback-only local preview for personal review. The generated media and transcript download are static files, so they require the same deployment-level access protection as the existing study collection. A Git-only build will not include private episodes. To deploy later, provision the private folder through the established private build/deployment workflow, verify authentication protects both pages and media, and deploy only with authorization. Do not upload this folder or its generated output to a public repository or public object store.

Transcriptions and readings are automatic study aids. Preserve the original audio and raw recognition output; flag doubtful passages instead of silently completing them. Word highlights require conservative timing-confidence checks and fall back to sentence timing.
