# Prompt log: Dashboard (Spine #7) and graded test 2

## Prompt

> "Merged! I'll republish on replit while you work on Spine #7"

Context Claude worked from: Issue #10 and PLAN.md feature 7 ("see how many
claims I've traced, the location where seeds most often appear, and the share
of observations I've marked as weeds, plus a chart of weeds by location"), and
Test 2 in PLAN.md section 4.

## What Claude built

- **Dashboard** at `/dashboard`, in the top navigation, with three stats:
  - **Claims traced:** claims with status "traced," out of all claims.
  - **Seeds most often appear on:** the location with the most seeds.
  - **Observations marked as weeds:** a percentage, with "3 of 10
    observations" underneath.
- **Weeds by location:** a horizontal bar chart (Chart.js). A plain table with
  the same numbers is there for screen readers, and shows instead if the chart
  can't load. Empty states explain how to fill each stat.
- **Graded test 2** in `tests/dashboard.test.js`, written to match PLAN.md's
  Given / When / Then, plus a small check of the percentage math (rounding,
  and no division by zero).

## Decisions along the way

- **Chart.js is served by the app itself** (installed as a package) rather
  than from a CDN, so the chart doesn't depend on another website being up.
- **Locations are grouped ignoring case,** so "X" and "x" count together.
- **The phone header now wraps.** Adding a third navigation link pushed "Log
  out" off the screen at phone width; found in the screenshot check.

## Red, then green

Following the assignment, Claude temporarily broke the stat in the way PLAN.md
predicted: dividing weeds by the number of *claims* (2) instead of
*observations* (10). The test failed with "expected '150%' to be '30%'," on
GitHub as a red ✗. Reverting the break turned it green again. Both runs are
linked in the PR.
