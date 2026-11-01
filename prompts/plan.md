# Prompt log: PLAN.md

Key prompts I gave Claude while writing the plan, in order, with what came out
of each. I used Claude to research and draft; the decisions are mine.

## Research

> "I want to pivot from a pure webscraper to a tool that is able to trace the
> origin of a claim... if I saw a claim that $12 billion was stolen from the
> bank, this app would be able to search as many online sources as possible to
> determine when the story/idea of $12 billion stolen from the bank
> originated, on what platform, and from what author etc. Please do some
> research on methods to achieve this and how other comparable tools work."

Result: a research doc covering tracing methods, comparable tools (DisTrack,
Hoaxy, Information Tracer, Cyabra and others), and free versus paid data
sources. I later asked for a quick look at Xpoz as well.

## Writing the plan

> "Let's go through each of the 7 sections mentioned in the assignment for the
> plan, starting with 1. Pitch and going through them one by one."

> "For the data model can we make it automatically filled in (with something
> like "-" for information that can't be found through the tool
> automatically) with the option for manual inputs by the user?... Each row
> will be a chronological observation, with variables: Time; location
> (app/platform seen on such as X, instagram or other); and poster."

Result: the claims → observations design. Claude suggested storing blanks and
displaying "-" so dates still sort, and adding a found_by column.

> "Let's incorporate the stance as part of the stars (let's make them weeds
> instead, more thematic!) with the weed/star representing something being
> assessed as intentionally spreading disinformation, with another distinction
> for origination."

Result: weeds replaced stars; Claude suggested "seed" for the origin marker.

> "For the database add a "notes" section and a section for the exact wording
> of the post/information can be written, up to a character limit based on the
> apps storage limitations."

Result: notes and post_text columns, limited to 2,000 characters.

> "Can we add GDELT but put its, and all the other API/data sources for that
> matter, into the back end, with the user only seeing the results?"

> "Add Xpoz, so the three data sources/APIs will be Bluesky..., GDELT..., and
> Xpoz (looks at areas where disinformation is extremely likely to
> proliferate, but needs to be double checked the most by the researcher)."

Result: one Source search button over three sources. Claude suggested
recording the source on each observation rather than on the claim.

> "Did you reference any of the public source repositories we are basing the
> code on?... Please check the licenses before we continue."

Result: Claude checked the licenses (TU Delft repo: none published; Hoaxy:
GPL-3.0). Since we haven't learned from their code, I chose not to list them.

> "Please draft a version of the plan that sounds more like how I would write
> it."

Result: Claude read my article *Planting Weeds* for style and rewrote the
prose sections, tying the hook and seed to the article's verbatim-phrase
tracing method and disinformation life cycle.
