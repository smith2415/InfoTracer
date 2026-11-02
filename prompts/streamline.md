# Streamline: fewer database round trips per click

## Prompt

> Once you are done please go back through one more time and look for any
> additional ways to streamline the code to make it less demanding and easier
> to run

## What changed

- **One query per button.** Weed, unweed, set seed, delete observation and
  pin used to look up the observation (or claim) in the route and then again
  in the model before changing anything: 2–3 database round trips per
  click. Each model function now checks ownership and makes the change in a
  single query (`WITH owned AS (...)`), and returns the claim id the page
  needs for its redirect.
- **Forms are checked before the database is asked.** Saving a claim or an
  observation now validates the form first and goes straight to the update,
  which already refuses other users' rows. The extra lookup only happens
  when the form has errors and needs to be shown again.
- **Claims list:** without a filter, the list is every claim, so its length
  is the count. The separate count query only runs while filtering.
- **Session cleanup** runs once a day instead of every ~15 minutes, so an
  idle app isn't waking the database. Expired logins are still refused.
- Removed an unused constant.

## Looked at and left alone

- Password hashing (bcrypt, strength 10) costs about 0.1s per login. That's
  the standard strength; lowering it would weaken stored passwords.
- No unused packages; every dependency is used.
- Start-up table checks are quick and keep a fresh database working.

## Tests

`tests/streamline.test.js`: each one-query function refuses another user's
rows, repeat clicks (weed twice, pin twice) are harmless, and the redirects
get the right claim. All earlier tests, including data isolation, pass.
