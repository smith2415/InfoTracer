# Prompt log: Show Google's reason when a fact-check lookup is refused

## Prompt

> "I just got this error, can you diagnose? 'Google's Fact Check service
> didn't accept the request. Check that the API key is valid and the Fact
> Check Tools API is enabled for it.'"

## What happened

On the live site, the lookup failed with the generic "didn't accept"
message. That message covers several different problems (the API not
enabled, key restrictions, an invalid key), and the app threw away Google's
explanation, so there was no way to tell which.

Claude gave me a one-line Shell command to see Google's raw answer using the
secret (so I didn't have to type the key), and changed the app so it never
hides the reason again.

## What Claude changed

- The app now reads Google's short **reason code** (like `SERVICE_DISABLED`
  or `API_KEY_INVALID`) from the error response.
- The page adds it to the message, with a plain-English hint for the common
  ones, e.g. "Google's reason: SERVICE_DISABLED. The Fact Check Tools API
  isn't enabled for this key's Google Cloud project."
- The Console log includes the reason too.
- Only letters, digits and underscores from the code are shown, and the key
  is never included.
- Four new checks in `tests/factcheck.test.js`.

## Lesson

A friendly error message still needs the real cause somewhere. "It didn't
work" isn't enough to fix it.

## Follow-up: a tutorial

> "Can you edit PR #37 to include a tutorial on how to use the fact check
> tool, including tips on how to search with an example?"

Claude added `docs/fact-check-guide.md`: step-by-step use, search tips, a
worked example based on the yacht case study from my article (searching the
full sentence vs. the hook vs. a name plus one key word), how to use what you
find in InfoTracer, and a table of Google's error reasons. The fact-check page
also gained a short "Search tips" section that opens automatically when a
search finds nothing, with a link to the full guide. One new test checks the
tips appear.

The example describes the search approach rather than quoting specific
results, since the live database can't be checked from Claude's workspace.
