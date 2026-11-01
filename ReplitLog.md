# Replit log: getting InfoTracer live

How InfoTracer went from a GitHub repo to a live site at
**https://info-tracer.replit.app** on Sunday, November 1, 2026: every problem
along the way, how it was found, and what fixed it. Code changes reached `main`
through pull requests; nothing was committed from Replit directly.

## At a glance

| # | Problem | How it showed up | Fix | PR |
| --- | --- | --- | --- | --- |
| 1 | Couldn't log in to Replit with GitHub | "Log in with another method and link GitHub" | Logged in another way, linked GitHub in account settings | none |
| 2 | Run button said the app wasn't running | Replit's agent diagnosed it | Added a run workflow and port mapping | [#18](https://github.com/smith2415/InfoTracer/pull/18) |
| 3 | Pull from GitHub got stuck | "Unsupported state: you are in the middle of a rebase" | Reset Replit's copy to match GitHub | none |
| 4 | Blank observation crashed the live preview | "Something went wrong" page | Restarted the app (stale server code) | none |
| 5 | Publish dialog kept changing its target | Replit's agent diagnosed it | Pinned the deployment target to Autoscale | [#21](https://github.com/smith2415/InfoTracer/pull/21) |
| 6 | Publishing failed during package install | 403: `tinypool` blocked by Replit's security policy | Upgraded the test runner so the package isn't needed | [#23](https://github.com/smith2415/InfoTracer/pull/23) |

## The full story

### 1. Logging in and importing the repo

"Continue with GitHub" on Replit failed with a message to log in another way
and link GitHub from the account page. My Replit account already existed under
my Berkeley email from a different sign-in method, and GitHub had never been
linked to it, so Replit refused to let GitHub log me in. I logged in with my
original method, then imported `smith2415/InfoTracer` with **Import from
GitHub**, which also linked the two accounts.

Claude also tried opening Replit in the Claude desktop app's built-in browser,
but that browser keeps its own sign-ins and Google blocks sign-in from embedded
browsers. We switched to Claude talking me through each step while I clicked.

### 2. Database and secrets

Replit created a **Development Database** (PostgreSQL) automatically because
the project's `.replit` file asks for PostgreSQL, and it set `DATABASE_URL` on
its own. I added one secret, `SESSION_SECRET`, in the Secrets tool.

### 3. The app wouldn't run

Replit offered to "get it running" with its AI agent. Claude advised skipping
it, since it would use credits and might edit the code outside the PR process.
Pressing **Run** said the app wasn't running, so I asked the agent why. It
found the database was fine, but:

- the packages hadn't been installed, and
- the `.replit` file Claude wrote in Spine #1 had no Run button workflow or
  port mapping for Replit's preview.

The agent installed the packages and added a workflow that runs
`PORT=5000 npm start`, mapped port 5000 to the public web port, and wrote its
own notes file, `replit.md`. These changes existed only in Replit.

I copied the changes from Replit's **Git pane** to Claude, who brought them into
the repo in **PR #18** and fixed two things the agent missed: the publish
command didn't set port 5000 (so the live site would have failed even though
the preview worked), and the publish build installed test-only packages.

**Lesson:** Claude's original `.replit` was never tested on Replit, because
Claude's workspace can't run Replit. Testing the deploy early exposed it.

### 4. A stuck pull

Pulling from GitHub in Replit stopped with *"Unsupported state: you are in the
middle of a rebase."* Git had tried to stack GitHub's latest code on top of the
agent's uncommitted edits to `.replit`, hit a conflict, and paused. Since the
agent's changes were already safe in PR #18, I reset Replit's copy to match
GitHub in the Shell:

```
git rebase --abort
git fetch origin
git reset --hard origin/main
git clean -fd
```

Before merging Spine #4 alongside the Replit fix, Claude checked that the two
PRs touched different files and ran a test merge to confirm nothing in `.replit`
would be overwritten.

### 5. "Something went wrong" on a blank observation

Submitting a blank observation in the preview showed the generic error page,
even though the form displayed the new "required" label. Claude couldn't
reproduce it with the latest code, so I copied the error from Replit's
**Console**. It pointed to line 174 of `claims.js`, where the saving code sat
*before* the validation update.

The page templates had updated (Express reads them fresh on every visit), but
the running server still had the old JavaScript in memory, so the blank
location reached the database, which refused it. **Stop** and **Run** fixed it.

**Lesson:** after every pull, restart the app.

### 6. Publishing: an unstable deployment target

The Publish dialog wasn't working reliably. Replit's agent found that `.replit`
didn't name a deployment target, so the dialog kept auto-detecting one. It
pinned **Autoscale**, which fits this app because all data and login sessions
live in PostgreSQL, so the app can safely scale down when idle. Claude brought
the same one-line change into **PR #21**, matching the agent's version exactly.

### 7. Publishing: a blocked package

The next publish failed while installing packages:

> 403 Forbidden ... tinypool-1.1.1.tgz - Blocked by Security Policy

Replit's package firewall blocked `tinypool` 1.1.1 for a critical security
vulnerability. The app doesn't use it; it came from the test runner, Vitest 3.
Replit installs every package, including test tools, before running our build
command, so the earlier "skip test packages" build change couldn't prevent it.

I asked whether to let Replit's agent fix it. Claude handled it instead,
because the fix changes `package.json` and belongs in a PR. Rather than work
around the firewall, **PR #23** upgraded Vitest to version 5, which doesn't use
`tinypool` at all. All tests passed unchanged, and no critical or high security
issues remained.

Replit also copied the development database into the new production database
on that first publish, so practice data from the preview appeared on the live
site.

### 8. Live

After merging, resetting and republishing, the app went live at
**https://info-tracer.replit.app**. Claude checked it in a browser: HTTPS, the
design, protected pages redirecting to login, the Weeds page, and the 404 page
all worked. I tested the logged-in features myself, since Claude doesn't create
accounts on live sites.

## Routine for future deploys

After merging a PR on GitHub, in Replit:

1. Shell: `git fetch origin`, then `git reset --hard origin/main` (or pull in
   the Git pane if there are no local changes).
2. **Stop**, then **Run**, and check the preview.
3. **Republish.**

If Replit's agent changes any files, don't commit them from Replit. Copy the
changes from the Git pane and bring them in through a PR.

## What I'd do differently

- **Deploy after the first feature, not later.** Four of these problems only
  existed on Replit and couldn't have shown up in local testing.
- **Decline the agent's setup offer only when the config is known to work.**
  Here it was the agent that found the missing workflow; the right move was to
  let it diagnose, then route its changes through a PR.
- **Restart after every pull.** It's easy to test new pages on old server code.
