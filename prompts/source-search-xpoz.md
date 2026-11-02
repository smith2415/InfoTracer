# Prompt log: Source search, part 3: Xpoz (Custom #3)

## Prompt

> "Awesome, do I need to add any keys or secrets to replit for GDELT? Let's
> get started on Xpoz issue"

Context Claude worked from: PLAN.md feature 10 ("Results from Xpoz are flagged
'verify' because they need the closest checking"), section 5 ("Xpoz API.
Searches X, Instagram, TikTok and Reddit, where disinformation is especially
likely to spread. It doesn't disclose how it collects its data, so its results
are flagged for me to double-check") and section 7 (its limited free
credits). This PR closes sub-Issue #42 and finishes #13.

## Checking the SDK first

Xpoz's documentation contradicted itself in places, so Claude downloaded the
official SDK (`@xpoz/xpoz` 0.9.1, MIT license) into an isolated folder and read
its code without running it:

- It only contacts Xpoz's own servers, plus npm to check for updates (turned
  off in InfoTracer).
- It reads no settings or secrets of its own and has no risky code.
- It adds no new security findings to `npm audit`.

## What Claude built

- **Xpoz as the third source** behind the Search sources button, using the
  official SDK.
- **X and Reddit by default** (about 4 credits per search). Instagram (12
  credits) and TikTok (5) can be turned on with an `XPOZ_PLATFORMS` secret.
  All four would cost 21 credits per search, using up the 500 free credits in
  about 23 searches.
- **Retweets are left out** of X results, since a retweet is never an origin.
- **Each post becomes an observation** with the platform as the location, the
  handle as the poster (`@` for X, `u/` for Reddit), the post's wording and a
  link back to it.
- **Every Xpoz observation is flagged "verify,"** with a note explaining why.
  Posts Xpoz marks as deleted say so, since deleted posts matter when tracing
  an origin.
- **Clear messages** for a missing or rejected key, used-up credits, rate
  limits and outages; if one platform fails, the other's results still come
  through with a warning.
- Eight checks in `tests/xpoz.test.js` (88 total, all passing), plus a smoke
  test with the real SDK confirming the key never appears in errors or logs.

## Limits to remember

- Xpoz returns at most 300 posts per platform per search, and doesn't say how
  far back its data goes, so older posts may exist.
- The real Xpoz service can't be reached from Claude's workspace, so the live
  search is checked on Replit after merging.
