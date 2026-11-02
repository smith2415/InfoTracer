# Prompt log: Pin fact-checks to a claim

## Prompt

> "Ok everything works so far! Let's update the fact checker to allow users
> to pin fact check articles to the claim page"

This came from using the fact-check lookup on the live site: once real
fact-checks came back, I wanted the useful ones to stay with the
investigation instead of disappearing when I left the results page.

## What Claude built

- **A Pin button** next to every review in the fact-check results. Once
  pinned, it reads **Pinned ✓**; clicking it again unpins.
- **A "Pinned fact-checks" list** inside the Fact-check lookup box on the
  claim's page: each pin's rating, publisher, date, a link to the article,
  and the claim as the fact-checker worded it, with an **Unpin** button.
- **A new `pinned_fact_checks` table.** It stores a copy of the fact-check's
  details, so pins stay even if Google's results change later. Each article
  can be pinned once per claim, and deleting a claim deletes its pins.
- **schema.md** documents the new table and notes it was added after the
  plan.
- Eight checks in `tests/pin-fact-checks.test.js` (73 total, all passing).

## Decisions along the way

- **A copy, not just a link.** The pin saves the rating, publisher, date and
  wording at the moment you pin it, so the evidence on the claim page doesn't
  depend on searching Google again.
- **Only real web links can be pinned,** so a pinned link can never run code
  in the page.
- **Pins are private,** like everything else on a claim: other users can't
  pin to or unpin from your claims (tested).

## Plan vs. Reality

This feature and its table weren't in PLAN.md. It's a change that came from
using the app, worth noting in the Plan vs. Reality table.
