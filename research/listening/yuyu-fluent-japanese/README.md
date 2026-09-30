# Source provenance

Source: https://www.youtube.com/watch?v=KJblreFQ2R8 — YUYUの日本語Podcast.

The source Japanese captions are **auto-generated**, not human-reviewed. `captions.ja.json3` is the original downloaded caption payload. `transcript.json` preserves every nonblank caption event, its text and original start/end milliseconds. No wording corrections were made. Ruby uses the established pykakasi listening renderer; readings remain automatic. Original YouTube display intervals overlap and the final caption display end exceeds the media duration; these source values are retained, not presented as precise speech boundaries. Seeking uses caption starts. No word-level alignment is claimed.

Audio is a personal study copy of the source, converted from Opus/WebM to 96-kbps MP3; measured duration 2207.274667 seconds. Metadata and caption SHA-256 are in `metadata.json`.

Generated through the existing local listening workflow import at `listening-workflow/imports/KJblreFQ2R8/build.py` in the Check PC access workspace. It uses the existing template, Sudachi/JMdict lookup and ruby syntax, adds only the new page, merges dictionary entries and adds sidebar links. Existing episode transcripts are retained unchanged.

Validation: `npm test` includes source text/timestamp equality, hiragana ruby coverage, navigation and old transcript integrity. Build with `npm run build`. The source caption warning is displayed on the page and in its downloadable transcript.
