# Prompt log: Validation (Spine #4)

## Prompt

> "Good catch on needing to deploy after each merge, I'll get Replit setup
> while you work on Spine #4"

Context Claude worked from: Issue #7 and PLAN.md feature 4 ("I want to be told
if I leave a claim's text or an observation's location blank, so that every
record is usable for tracing").

## What Claude built

- **Required fields:** a claim's text and an observation's location. Leaving
  either blank, on a new form or when editing, shows a friendly message next
  to the field instead of saving.
- **Other checks that would otherwise fail silently or unsafely:** notes and
  exact wording over 2,000 characters, a link that isn't a full http(s) address,
  and an invalid date.
- **Forms keep what you typed** when something needs fixing, and mark the
  problem fields in red with a summary at the top. Required fields are
  labeled "required."
- Five checks in `tests/validation.test.js` (22 total, all passing).

## Decisions along the way

- **Messages say what to do,** e.g. "Enter where you saw it, such as X,
  Instagram or a news site," rather than "Location is required."
- **Checked on the server,** so the rules hold no matter how the form is
  submitted. The database constraints from Spine #2 stay as a second line of
  defense.
- **The 2,000-character limit is explained, not enforced by cutting text off.**
  The earlier forms used the browser's maxlength, which silently trims pasted
  text; now an over-long paste is kept and the message says how long it is.
