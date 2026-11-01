# Prompt log: Create / read / update / delete (Spine #3)

## Prompt

> "Merged, good to go for Spine#3!"

Context Claude worked from: Issue #6 and PLAN.md feature 3 ("add a claim with
its text, its hook and a status, then log observations with time, location,
poster and a link... mark one observation per claim as the seed... open a
claim's detail page, edit it, and delete it after an 'are you sure?'
confirmation"), plus the design in PLAN.md section 6.

## What Claude built

- **Claims list:** each claim with its status, hook, observation count and
  earliest observation date, plus an empty state for new accounts.
- **Claim pages:** new, detail (the "case file"), edit, and delete with a
  confirmation page.
- **Observations as evidence cards** on the claim page, oldest first, with "-"
  for missing details. Add, edit, delete (with confirmation) and "Mark as
  seed." The seed card is outlined in green.
- Six checks in `tests/crud.test.js` covering the full flow and ownership
  (17 checks total, all passing).

## Decisions along the way

- **Confirmation pages instead of pop-ups.** "Are you sure?" is its own page,
  so it works without JavaScript and can be tested automatically.
- **Times are entered and shown in UTC,** since platforms timestamp posts in
  UTC and an investigation shouldn't depend on the viewer's time zone.
- **Only http(s) links are clickable,** so a pasted link can never run code in
  the page.
- **Friendly messages for blank fields wait for Spine #4 (Validation).** For
  now the database still refuses a blank claim or location; Spine #4 turns
  that into a clear message on the form.

## Bug caught

When checking the pages in a headless browser, the observation card's "Link"
value appeared on its own line, pushed down by line breaks in the template.
Claude spotted it in the screenshot and fixed the template and styling. (The
browser script also briefly clicked "Log out" instead of "Save," because the
header's button came first on the page; the script, not the app, was fixed.)
