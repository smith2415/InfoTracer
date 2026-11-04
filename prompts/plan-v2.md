# PLAN_V2.md

## Prompts

> For the "Rewrite it" part of the plan, please rewrite the Replit publishing
> section so that a different agent with no prior knowledge of our project
> would build it right the first time.

> Awesome work here, can we make a PR that has a PLAN_V2.MD with this
> included?

## What Claude did

- Copied PLAN.md (without the Plan vs. Reality section) to PLAN_V2.md, with
  a short note at the top saying what changed and why.
- Added **section 5a, Hosting and deployment**, built from the configuration
  that actually works today. Each rule traces back to a problem from
  ReplitLog.md or PRs #18, #21, #23 and #47: the port mapping, the install
  step on Run, the pinned Autoscale target, tests on GitHub Actions instead of
  Replit, secrets, keeping Replit's agent out of commits, the deploy routine,
  and practice data copied on the first publish.
- Pointed the Technologies hosting bullet to 5a and updated the hosting risk.
- Left PLAN.md untouched, since the assignment grades the original plan.
