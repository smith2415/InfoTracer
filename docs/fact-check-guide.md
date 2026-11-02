# How to use the fact-check lookup

The fact-check lookup tells you whether professional fact-checkers have already
looked into a claim you're tracing. It searches Google Fact Check Explorer, a
database of fact-checks published by organizations around the world.

It doesn't decide whether a claim is true. It finds what fact-checkers have
already published, so you can build on their work instead of starting from
scratch.

## Step by step

1. **Open a claim.** From **Claims**, open the claim you're investigating.
2. **Find the Fact-check lookup box** below the claim's details. It's
   prefilled with the claim's hook, or with the claim's text if there's no
   hook.
3. **Adjust the search phrase if needed** (see the tips below), then click
   **Search fact-checks**.
4. **Read the results.** Each result shows:
   - **The claim as the fact-checker worded it.** Read it carefully: it may
     be a different version of your claim.
   - **Who made the claim and when**, if the fact-checker recorded it.
   - **One or more reviews**, each with a **rating** (red for false or
     misleading, green for true, amber for anything in between, like
     "Mixture" or "Unproven"), the publisher, the date, and a link to the
     full fact-check.
5. **Refine and search again** from the box at the top of the results page.

## Search tips

Fact-checkers rarely word a claim exactly the way you saw it, so the search
works best with a few well-chosen words.

- **Search the distinctive part, not the whole sentence.** Names, places,
  numbers and unusual words do the work. Filler words like "the," "was" or
  "they say" only narrow the results.
- **Start with the hook,** then try a person or organization plus one key
  word: "Zelensky yachts," not "Zelensky bought two yachts with American
  money."
- **Try other ways of writing numbers:** "$12 billion," "12 billion,"
  "12bn." Fact-checkers may round or convert currencies.
- **Try synonyms** if nothing comes back: "stolen," "embezzled,"
  "misappropriated," "missing."
- **Shorter is usually better.** If two or three words return nothing, a
  longer phrase almost never will.
- **No results doesn't mean the claim is true.** It may be too new, too local,
  or worded very differently from anything fact-checked.
- **A match isn't automatically your claim.** Claims get recycled with new
  details; check the claim's wording and date before relying on a rating.

## Worked example

Say you're tracing the claim, from the case study in my article *Planting
Weeds*, that **President Zelensky bought two mega yachts with US military
aid**.

| Try | Search phrase | Why |
| --- | --- | --- |
| 1 | `Zelensky bought two mega yachts with US military aid` | The full sentence. Too specific: fact-checkers likely worded it differently, so this may return little or nothing. |
| 2 | `two mega yachts` | The hook, the phrase that repeated verbatim as the story spread. A good default. |
| 3 | `Zelensky yachts` | A name plus one key word. Usually the widest useful net. |
| 4 | `Zelensky yacht aid` | Adds a third word to narrow things down if try 3 returns unrelated claims. |

**Reading the results:** if fact-checkers covered the story, look for
reviews rated "False" or similar, and compare the dates: a fact-check
published soon after the claim first appeared shows how quickly it was
challenged.

*(This example shows the search approach. Run it on the live site to see
what the database currently returns.)*

## Using what you find in InfoTracer

- **Follow the fact-check's trail.** Fact-check articles often say where a
  claim first appeared: a website, a video, an account. Add those sightings
  as observations, and consider marking the earliest as the seed.
- **Note it on the claim.** Put the fact-check's link and rating in the
  claim's notes, so the evidence stays with your investigation.
- **Update the status.** If the fact-check pins down the origin, you may be
  able to set the claim's status to "traced."

## If something goes wrong

The page explains most problems in plain words. If it says Google didn't
accept the request, it also shows Google's reason code; the most common ones
are:

| Reason | What to do |
| --- | --- |
| `SERVICE_DISABLED` | Enable the Fact Check Tools API in the key's Google Cloud project. |
| `API_KEY_HTTP_REFERRER_BLOCKED` | Set the key's application restriction to **None**. "Websites" blocks server requests. |
| `API_KEY_SERVICE_BLOCKED` | Add the Fact Check Tools API to the key's API restrictions. |
| `API_KEY_INVALID` | Check the `GOOGLE_FACTCHECK_API_KEY` secret's value. |

Changes to a key can take about 5 minutes to take effect.
