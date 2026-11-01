# Prompt log: Graded test 1, data isolation

## Prompt

> "Just checked the live site, can you run the test now?"

Context Claude worked from: Test 1 in PLAN.md section 4 and Issue #30.

## What Claude built

`tests/data-isolation.test.js`, written to match the plan's Given / When /
Then:

1. User A signs up, creates the claim "$12 billion stolen from the bank," and
   logs two observations.
2. User B signs up separately, with no claims.
3. User B logs in and opens their claims list: it must be empty and must not
   mention User A's claim.
4. User B opens User A's claim page directly by its link: it must be refused
   (404 "not found") and show none of User A's details.
5. A control check: User A can still open their own claim, which proves the
   test isn't passing just because the page is broken for everyone.

## Red, then green

Claude removed the ownership check from the claim page lookup (`getClaim` in
`src/models.js`). That's a realistic mistake: the list stays filtered, but
anyone with a claim's link could open it. The test failed with "expected 200
to be 404" on GitHub. Reverting the change turned it green. Both runs are
linked in the PR.
