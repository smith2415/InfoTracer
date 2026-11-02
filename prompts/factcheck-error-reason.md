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
