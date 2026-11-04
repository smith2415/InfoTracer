# Stranger test fix: welcome page

## The stranger test

A friend who isn't in the class signed up and used the live app while I
watched. My notes and her quotes:

- "Quite cool." "Interesting to use."
- She made a claim, "billionaire tax will cause billionaires to flee state",
  with the hook "Billionaire tax flight". **Nothing came up.** She read the
  search guide, did three searches, and finally used the Zelenskyy example.
- "I pinned something, confused where pins went."
- She suggested a splash page with a use guide and a welcome, specifically
  explaining how claims are stored.
- Source search should be more obvious as the main feature, with fact-checks
  supporting it.
- "The origin timeline is really cool."
- "Why can't I mark something as important?" (The live site hadn't been
  republished after the "important" PR, so the button wasn't there yet.)
- "I really like the color set up… you've kept it simple but it works."
- Editing a search result, then canceling, sent her back to the top of the
  page, and she had to scroll back to where she was.
- Ideas: filter observations by mark, a dashboard overview of active claims,
  and marking whether a source is a video.

## Prompt

> Let's make a splash/landing page that explains the purpose of the site, how
> to use it, and welcomes them by their email (everything before the @ sign).
> ... For the assignment however, let's focus on the splash page, so make one
> PR for the splash page and a separate PR for everything else.

## What changed

- **New welcome page** (`/welcome`, `views/welcome.ejs`, `src/welcome.js`):
  - Greets the user by the part of their email before the @.
  - Why trace a claim, in one paragraph.
  - How to use it in five steps, with **Source search marked as the main
    tool** and a tip for when a search finds nothing, using her own claim as
    the example.
  - The three marks (seed, weed, important) in their colors.
  - **How your claims are stored**: private to your account, searches save
    copies labeled by source, everything can be edited or deleted, and the
    earliest found isn't proof.
  - Buttons to start a new claim and, once you have some, go to your claims.
- **Where people land:** signing up, logging in and the logo now go to the
  welcome page instead of the claims list. A **Home** link in the menu brings
  it back.

## Tests

`tests/welcome.test.js`: the greeting (including an email with HTML in it,
shown as plain text), where signup and the logo lead, the page's sections,
the claims button appearing once you have claims, and that it needs a login.
