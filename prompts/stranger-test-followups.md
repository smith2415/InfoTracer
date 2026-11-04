# Stranger test follow-ups

## Prompt

> ... Let's also verify the important button in the code, make source search
> the first tool seen, implement your show tips recommendation, and addresses
> the losing her place issue. For the assignment however, let's focus on the
> splash page, so make one PR for the splash page and a separate PR for
> everything else.

The stranger test notes are in `prompts/welcome-page.md`.

## What changed

- **Source search first.** On a claim's page, Source search now comes before
  the fact-check lookup, since it's the main tool and fact-checks support it.
- **Tips where the search comes up empty.** When any source finds nothing, a
  "Not finding it? Try a different phrase" box appears under the results,
  using her claim as the example, instead of her having to find the guide.
  (The guide she found was the fact-check page's search tips.)
- **Where pins go.** After pinning or unpinning on the fact-check results, a
  note says "Pinned to this claim. Pinned fact-checks appear in the
  Fact-check box on the claim's page" with a link straight to them. Later
  visits say how many are pinned, with the same link, and the back link goes
  to the pinned list.
- **Keeping your place.** Canceling an edit or a delete returns to that
  observation's card instead of the top of the page; canceling a new
  observation, or deleting one, returns to the observations list.
- **"Mark important" verified.** The button was missing on the live site only
  because it hadn't been republished after PR #57. A new test reads the
  button's form from the claim page and submits it, end to end.

## Tests

`tests/stranger-followups.test.js`, plus an updated pin test for the new
return address. Checked in a browser: the tips box, the pin note, and that
Cancel scrolls back to the card.
