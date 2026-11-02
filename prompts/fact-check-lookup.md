# Prompt log: Fact-check lookup (Custom #2)

## Prompts

> "Alright let's rock custom #2"

Then I created a Google Cloud API key with the Fact Check Tools API enabled
and added it to Replit's Secrets as `GOOGLE_FACTCHECK_API_KEY`.

Context Claude worked from: Issue #12 and PLAN.md feature 9 ("a button that
searches Google's Fact Check database for my claim, so that I can see whether
fact-checkers have already traced it").

## What Claude built

- **A "Fact-check lookup" box** on each claim's page, prefilled with the
  claim's hook (or its text if there's no hook), with a **Search fact-checks**
  button.
- **A results page** listing fact-checked claims that match: the claim as the
  fact-checker worded it, who made it and when, and each review's **rating**
  (red for false or misleading, green for true, amber for anything else),
  publisher, date and a link to the full fact-check. Non-English reviews show
  their language.
- **Clear messages** when nothing matches ("that doesn't mean the claim is
  true"), when the key is missing, rejected or rate-limited, or when Google
  can't be reached.
- Nine checks in `tests/factcheck.test.js` (52 total, all passing).

## Decisions along the way

- **The API key stays on the server.** It's read from Replit's Secrets, sent
  only to Google, and never appears in pages, logs or error messages. A test
  makes a lookup fail on purpose and checks that the key isn't on the page.
- **Fact-checks aren't saved as observations.** A fact-check is about the
  claim, not a sighting of it spreading, so mixing them into the timeline
  would muddy it (PLAN.md section 2).
- **The automated tests never call Google.** They use a stand-in that returns
  a response in the API's documented format, so the tests run on GitHub
  without a key and don't use up any quota.
- **Ratings in other languages** ("Falso," "Faux," "Falsch") are colored too,
  since many fact-checkers publish outside English.

## Bugs caught

- A test checked for the message "didn't accept the request," but the page
  escapes the apostrophe, so it failed even though the message was there (the
  reverse of the trap caught in Spine #6). Changed it to match a phrase
  without an apostrophe.
- The screenshot showed the Spanish rating "Falso" in amber instead of red.
  Added common non-English ratings.
