# Mark observations as important

## Prompt

> Can you add a separate category for observations like "important" next to
> weed and seed? I realized that there are reasons to highlight a post/
> observation without it needing to be a weed or seed.

## What changed

- **Data:** a new `is_important` true/false column on observations, added on
  start-up with `ADD COLUMN IF NOT EXISTS` so existing data keeps working.
  It's a column rather than a junction table like weeds, because an
  observation belongs to one user's claim (the same reasoning as `is_seed`).
- **Buttons:** "Mark important" / "Remove important" on every observation,
  on the claim page and on the Weeds page (which sends you back there).
  Each is one database query that also checks the observation is yours.
- **Look:** a blue "important" flag, a blue card border (or a blue top edge
  when the card is also a seed or weed), and a blue ring around its marker
  on the timeline, with "important" added to the timeline key. Blue keeps it
  apart from seed green, weed red and verify amber.
- **Layout fix found along the way:** with four flags, a card squeezed its
  date into a narrow column and the flags ran past the edge. Flags now wrap
  onto their own line when they don't fit.
- `schema.md` lists the new column as added after the plan.

## Tests

`tests/important.test.js`: starts unmarked; marks and unmarks without
touching seed or weed; another user can't change it; works from the Weeds
page; survives editing the observation; reaches the timeline.
