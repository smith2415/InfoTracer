# Source search: time limit, progress and timing

## Prompt

> Live site is pretty slow/ not pulling up searches, can you diagnose?

Claude explained that the page waits for all three sources with no feedback
(Bluesky up to ~50s, GDELT ~45s, Xpoz ~30s), which looks broken and invites a
second click that spends Xpoz credits twice. Then:

> I like your recommendations, except lets put the time limit at 60 seconds.
> Please include the searching message and timing in logs. Can you also add a
> little progress area that shows which sources are done searching and which
> are still working?

## What changed

- **60-second limit** for the whole search (`SEARCH_TIME_LIMIT_MS`). Sources
  that finish in time are saved; one still running is reported as "took
  longer than 60 seconds" and skipped.
- **Progress area.** With JavaScript on, the button switches to
  "Searching…" and is disabled (no double searches), and a list shows each
  source with a spinner until it's done, failed or timed out, plus a running
  timer. The server streams one JSON line per event in the same request, so
  it works even if Replit runs more than one copy of the app. When it's done
  the page reloads with the full results.
- **Without JavaScript** the form posts and redirects as before.
- **Timing in the logs:** `Source search: Bluesky finished in 4.2s (37 found)`
  or `... failed after 3s: ...`. Each result line on the page also shows the
  source's time.

## Tests

`tests/source-search-progress.test.js`: the limit is 60s; a source that never
answers is reported while the others are kept; times are logged; the progress
stream sends start, each source as it finishes, saving and done; the no-JS
form still redirects; signed-out requests go to login.
