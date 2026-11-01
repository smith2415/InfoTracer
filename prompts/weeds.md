# Prompt log: Weeds (Spine #5: Stars)

## Prompt

> "It's working!" (after getting the app running on Replit), followed by
> continuing to Spine #5.

Context Claude worked from: Issue #8 and PLAN.md feature 5 ("mark an
observation as a weed and see all my weeds in one 'Weeds' view, so that I can
track who is deliberately pushing false claims rather than unknowingly
repeating them"), plus the weeds table in PLAN.md section 3. The assignment's
rule: all stars live in one junction table where each row references a user
and an item.

## What Claude built

- **`weeds` table:** user_id, observation_id and created_at, with user_id +
  observation_id as the primary key, so each user can weed an observation only
  once. One table for everyone.
- **"Mark as weed" / "Remove weed"** on every observation. Weeded cards get a
  red "weed" flag and border; a card that's both the seed and a weed keeps its
  green border with a red edge.
- **Weeds view** (`/weeds`, in the top navigation): every observation you've
  weeded across all your claims, newest first, each linking back to its claim.
- **schema.md** updated: the weeds table is documented and added to the
  diagram, completing all four tables.
- Five checks in `tests/weeds.test.js` (27 total, all passing).

## Decisions along the way

- **Weeds go on observations, not claims,** as decided in PLAN.md: a weed is a
  judgment about who is spreading a claim, not about the claim itself.
- **The evidence card became a shared template,** so the claim page and the
  Weeds view always show observations the same way.
- **Weeds are private.** Other users can't see your weeds or weed your
  observations; both are covered by tests.

## Bug caught

In the screenshot check, the action links on a card with four actions wrapped
mid-label ("Mark as / seed"). Fixed so each label stays on one line and the
row wraps between labels instead.
