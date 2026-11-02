# Prompt log: Origin timeline (Custom #1)

## Prompt

> "Done, I made the tag prior to the test as the live site was working.
> Let's move on to the custom features starting with Custom #1"

Context Claude worked from: Issue #11 and PLAN.md feature 8 ("a claim's
observations shown on a timeline from oldest to newest, with the seed and any
weeds marked, so that I can see how the claim spread and who amplified it"),
plus the design in PLAN.md section 6 (the timeline "grows like a vine from the
seed").

## What Claude built

- **An origin timeline** on each claim's page, above the observations:
  - A green "vine" drawn **to scale in time**, so gaps between posts look as
    long as they really were, with dates along the bottom.
  - A marker for every dated observation: **green** for the seed, **red** for
    weeds, **gray** for the rest. A seed that's also a weed gets a red ring.
  - Markers for posts that land close together **stack** instead of hiding
    each other.
  - Each marker links to its evidence card, and hovering shows the date,
    location and poster.
- **A one-line summary:** "Earliest found: Mar 2, 2026 on Bluesky by
  @anon48213. Spread across 6 sightings over 10 days." If the earliest found
  isn't the seed, it says so.
- **An "earliest found" flag** on that observation's evidence card.
- **Undated observations** are listed under the timeline, linking to their
  cards, so nothing is silently left out.
- Five checks in `tests/timeline.test.js` (43 total, all passing).

## Decisions along the way

- **"Earliest found" vs. "seed."** The timeline labels the earliest dated
  observation automatically, but the seed stays the researcher's call. As my
  article argues, the earliest post you can find isn't always where a claim
  was planted, so the app points out when the two differ instead of assuming.
- **Drawn on the server as an SVG,** so it needs no JavaScript and no extra
  library.

## Bug caught

In the phone screenshot, the whole timeline shrank until the dates were too
small to read. Fixed by giving it a minimum width and letting it scroll
sideways inside its card on small screens.
