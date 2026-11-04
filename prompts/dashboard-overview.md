# Dashboard: every claim at a glance

## Prompts

> Can you make a new PR that updates dashboard to show all claims with pinned
> fact checks and observations marked important, weed, and/or seed
> underneath the current dashboard layout? Basically a single page to see
> the most important information about all of your claims in one easy to
> look at location?

> And please change the "Home" tab to "Welcome" and move the "Dashboard" tab
> to the immediate right of the "Welcome" tab

## What changed

- **"Your claims at a glance"** under the existing stats and chart, which
  are unchanged (so graded test 2 still applies):
  - A summary line: claims, seeds, weeds, important and pinned fact-checks,
    in their colors.
  - A card for **every claim**, newest first: its text (linking to the
    claim), status, hook and observation count.
  - **Marked observations:** every observation marked seed, weed or
    important, oldest first, each listed once with all its marks, with date,
    place, poster and the start of its wording. Each links to that
    observation on the claim page. Unmarked observations stay off the
    dashboard.
  - **Pinned fact-checks** beside them: rating, publisher, date and a link.
  - Claims with nothing marked yet say so, with a link to open them.
- **One query per kind of data** (claims, marked observations, pins), so the
  page doesn't slow down as claims are added.
- **Menu:** "Home" is now "Welcome", and Dashboard sits right after it:
  Welcome, Dashboard, Claims, Weeds.

## Found along the way

The first version listed observations under separate Seed / Weeds /
Important headings, so an observation that was both a weed and important
appeared twice. It's now one list with the marks shown as flags.

## Tests

`tests/dashboard-overview.test.js`: what the overview gathers per claim, the
page under the existing dashboard (including one listing per observation and
shortened long text), that other users' claims never appear, and the menu
order. The welcome page test now expects "Welcome" in the menu.
