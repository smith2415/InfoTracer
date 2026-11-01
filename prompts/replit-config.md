# Prompt log: Replit run configuration

## What happened

After importing the repo into Replit, pressing **Run** said the app wasn't
running. I asked Replit's agent why. It found that the database was reachable
but the packages weren't installed, and that the `.replit` file Claude wrote
had no Run button workflow or port mapping for Replit's preview. The agent
installed the packages and added a working configuration in the Replit
workspace, without committing it.

## Prompt to Claude

I shared screenshots of the agent's changes from Replit's Git pane:

> "These are the changes!"

## What Claude did

- Brought the agent's changes into the repo through this PR instead of letting
  Replit commit them straight to `main`: the `web` module, the `[nix]`
  channel, the Run button workflow (`PORT=5000 npm start`), the 5000 → 80 port
  mapping, and the agent's `replit.md` notes.
- **Fixed two things the agent missed:**
  - The publish (deployment) command was still plain `npm start`, which would
    start on port 3000 while Replit expects 5000. The live site would have
    failed even though the preview worked. It now uses port 5000 too.
  - The publish build ran `npm install`, which also installs test packages.
    The agent reported that Replit's security filter blocks one of them
    (`tinypool`), which could break publishing. The build now runs
    `npm ci --omit=dev`, installing only what the app needs.

## Bug caught

Claude's original `.replit` (Spine #1) was never tested on Replit itself,
because Claude's workspace can't run Replit. The missing workflow and port
mapping only showed up when I ran the app there. Lesson: test the deploy
early, not after all the features.
