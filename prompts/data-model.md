# Prompt log: Data model (Spine #2)

## Prompt

> "Merged! I've created issues for Spine#2-7, please use those for making pull
> requests for their respective features. Please continue with Spine#2"

Context Claude worked from: Issue #4 and PLAN.md feature 2 ("each claim holds a
chronological list of observations, each recording the time, location and
poster"), plus the claims and observations tables in PLAN.md section 3.

## What Claude built

- `claims` and `observations` tables, created automatically on start, with
  every column from the plan.
- `src/models.js`: the functions the app uses to create, read, update and
  delete claims and observations, and to mark a seed. Every function is
  filtered by the signed-in user.
- `schema.md`, documenting the tables and comparing them with the plan.
- Six checks in `tests/data-model.test.js`, all passing.

## Decisions along the way

- **Rules enforced in the database, not just the app.** Allowed statuses and
  sources, the 2,000-character limits, required fields and "one seed per
  claim" are all database constraints, so no code path can break them.
- **Blank details stored as NULL.** Following the plan, empty fields are saved
  as empty rather than as "-", so observations still sort by time; blank times
  sort last.
- **Seeds change in one transaction.** Marking a new seed clears the old one at
  the same moment, so a claim can never briefly have two.
- **The weeds table waits for Spine #5,** so each PR stays focused on one
  feature.
