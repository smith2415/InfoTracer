# Performance pass

## Prompt

> Can you do a final review of all the code and see if there are any changes
> you would make to make it run faster with less processing power, now that
> you have the whole app in front of you?

## What Claude found and changed

1. **Page templates were recompiled on every request.** Express only caches
   compiled templates when `NODE_ENV=production`, and Replit doesn't set it.
   Now the cache is always on. This was the biggest CPU cost per page.
2. **Every page view wrote to the database.** The session store "touched"
   the user's session row on every request to push its expiry back. That's
   turned off; a login lasts 7 days from signing in, which already matched
   when the cookie expires.
3. **Browsers re-checked the stylesheet and icon on every page.** They now
   keep them for an hour.
4. **The claim page ran three queries one after another.** They now run at
   the same time (each still checks the claim is the user's).
5. **Source search saved results one row at a time,** up to 30 separate
   writes. Now it's one write, and the duplicate check reads only the saved
   links, while the sources are still searching.

## Looked at and left alone

- The external searches (Bluesky, GDELT, Xpoz) are most of a source search's
  time. They already run at the same time, and GDELT's 5.5-second pause is
  GDELT's own rule. Bluesky already reuses its login for an hour.
- The dashboard and claims list queries already run in parallel and are
  small at this scale. Indexes cover every lookup by user, claim and
  observation.
- Compressing responses would add a package for pages that are already small.

## Tests

`tests/performance.test.js`: templates are cached; a page view leaves the
session row untouched (fails if the touch is turned back on); the batch save
stores every row and refuses another user's claim.
