# Prompt log: Find things (Spine #6)

## Prompt

> "It's looking good, go ahead with spine #6."

Context Claude worked from: Issue #9 and PLAN.md feature 6 ("search claims by
text, filter by status or location, and sort by newest or by earliest
observation, so that I can find an investigation quickly").

## What Claude built

- **A filter bar** above the claims list:
  - **Search** across a claim's text, hook and notes, ignoring upper and lower
    case.
  - **Status** filter: tracing, traced or dead end.
  - **"Seen on"** filter: claims with at least one observation at a location,
    built from the locations you've actually logged.
  - **Sort:** newest first (default), oldest first, earliest observation, or
    most observations.
- **A result count** ("Showing 1 of 3 claims"), a **Clear** link, and a "No
  claims match" message with a way back.
- **Filters stay in the address bar** (e.g. `/claims?q=yacht&sort=earliest`),
  so a filtered view can be bookmarked or refreshed.
- **README:** the live URL and the routine for updating the live app.
- Six checks in `tests/find.test.js` (33 total, all passing).

## Decisions along the way

- **"Location" filters by observation.** A claim doesn't have a location of its
  own; this finds claims seen on a given platform, which matches how the plan
  uses location.
- **Earliest-observation sort puts claims with no observations last,** so
  they don't crowd the top.
- **Safe inputs:** sort options come from a fixed list rather than anything
  typed, and "%" or "_" in a search are matched literally.

## Bugs caught

- **A test that couldn't fail.** The privacy check looked for a claim called
  "Someone else's bank claim," but the page escapes the apostrophe, so the
  check would have passed even if the claim leaked. Claude renamed the test
  claim to avoid the apostrophe.
- **Layout:** in the screenshot check, the Search label sat higher than the
  others and "Earliest observation" was cut off in the Sort menu. Fixed with
  equal field heights and a wider Sort column.
