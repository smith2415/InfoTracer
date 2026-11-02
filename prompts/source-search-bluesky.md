# Prompt log: Source search, part 1: Bluesky (Custom #3)

## Prompt

> "Gotcha thank you for the security best practice, merging now!" (after the
> fact-check lookup), continuing to Custom #3.

Context Claude worked from: Issue #13 and PLAN.md feature 10 ("one search
button that checks Bluesky, GDELT news and Xpoz behind the scenes and saves
matching results as observations... with any missing detail shown as '-'"),
and the plan's build order: Bluesky first, then GDELT, then Xpoz, each in its
own PR. This PR closes the Bluesky sub-Issue (#34).

## What Claude built

- **A "Source search" box** on each claim's page, prefilled with the hook,
  with a **Search sources** button.
- **The Bluesky source:** logs in with an app password, searches public
  posts, and pages back through up to 500 matches (Bluesky lists newest
  first).
- **Saves the 10 earliest new matches** as observations: posting time,
  location "Bluesky," poster handle, exact wording and a bsky.app link, with
  `found_by = bluesky`. Anything missing shows as "-" for me to fill in.
- **Skips posts already saved** on the claim, so searching again picks up the
  next earliest.
- **A result message** after each search: how many posts were found and
  saved, and a warning when there were more matches than it could check, so
  older posts may exist.
- **Clear messages** when Bluesky isn't set up, rejects the login, is
  rate-limiting, or can't be reached.
- A framework for the other two sources: each source plugs in behind the same
  button, and one failing doesn't stop the others.
- Ten checks in `tests/source-search.test.js` (62 total, all passing).

## Decisions along the way

- **Save the 10 earliest, not everything.** A viral claim can have hundreds
  of reposts; saving all of them would bury the timeline. The earliest
  matches are what matter for tracing an origin.
- **Backdating warning.** A Bluesky post's creation date is set by the app
  that posted it, so it can be faked. When it's more than a day earlier than
  when Bluesky indexed the post, the observation's notes say so. This follows
  my article's point that the earliest *apparent* post isn't always the real
  first one.
- **Credentials stay on the server** in Replit's Secrets, and the app uses an
  app password, never the account's main password.
- **The tests never call Bluesky;** a stand-in answers in the API's
  documented format.

## Bug caught

A test expected "found 15 posts; saved the 10 earliest," but the page had a
line break after the semicolon, so the message read oddly and the test
failed. Fixed the template.
