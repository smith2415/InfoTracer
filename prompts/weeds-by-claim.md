# Weeds page: group weeds by claim

## Prompt

> Also please categorize weeds by their claim on the weeds tab.

## What changed

- `groupWeedsByClaim` (models.js) groups the weeds list under each claim. The
  claim with the most recent weed comes first, and each claim's weeds stay
  newest first. It works on the list already loaded, so there's no extra
  database query.
- The Weeds page shows each claim as a heading (linking to the claim) with
  its weed count, and its weed cards underneath. The cards no longer repeat
  the claim's text, since the heading shows it.

## Tests

`tests/weeds-by-claim.test.js`: the grouping keeps the order; the page shows
both claims as headings, most recently weeded first, with each claim's weeds
under it.
