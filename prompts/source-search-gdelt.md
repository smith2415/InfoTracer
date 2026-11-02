# Prompt log: Source search, part 2: GDELT news (Custom #3)

## Prompt

> "Awesome, let's start on the GDELT issue"

Context Claude worked from: PLAN.md feature 10 and section 5 ("GDELT DOC 2.0
API. Free and needs no key; it searches news articles rather than social
posts, so it shows when a claim reached the press") and the risk noted in
section 7 ("GDELT only lists articles from the last 3 months of a search
window, so older news coverage may be missed"). This PR closes sub-Issue #40.

## What Claude built

- **GDELT as a second source** behind the same Search sources button. Both
  sources run at the same time, and one failing doesn't stop the other.
- **Earliest coverage, not just recent coverage.** Working around the risk in
  my plan: the app first asks GDELT for the daily article count since 2017
  (when its archive starts) to find the first day the phrase appeared, then
  lists articles from that day forward, oldest first.
- **Saves the 10 earliest articles** as observations with `found_by =
  gdelt`: the date GDELT first saw the article, location "News site," the
  outlet as the poster, and the link. The headline, language and country go in
  the notes; the exact wording stays "-" for me to fill in from the article,
  as planned.
- **The result message** says "articles" for GDELT and "posts" for Bluesky,
  and passes along GDELT's own explanation when it refuses a search.
- Nine checks in `tests/gdelt.test.js` (81 total, all passing).

## Decisions along the way

- **Search phrases are cleaned for GDELT.** It only accepts letters, numbers
  and spaces, and searches several words as an exact phrase in quotes, so
  "$12 billion" is sent as "12 billion".
- **A 5.5-second pause between GDELT's two requests,** because GDELT asks
  for at most one request every 5 seconds. A search now takes about 10
  seconds, and the page says so.
- **The tests never call GDELT;** a stand-in answers in the API's format,
  including its plain-text error messages.

## Limits to remember

- GDELT's searchable archive starts in January 2017.
- Its dates are when GDELT first saw an article, which can be a little after
  it was published; the notes say so.
- The real GDELT API can't be reached from Claude's workspace, so the live
  search is checked on Replit after merging.
