# Prompt log: Pin the Replit deployment target

## What happened

Publishing on Replit wasn't working properly. Replit's agent compared the
workspace with GitHub and found `.replit` matched `main`, but had no explicit
deployment target, so the Publish dialog kept auto-detecting or reselecting
one. It pinned the target to **Autoscale**, which suits a web app that keeps
its data and login sessions in PostgreSQL, and left the run and build commands
unchanged. It didn't publish anything.

## Prompt to Claude

> "Replit wasn't publishing properly and it came up with this solution, do we
> need to make a new pull request for any changes or is this purely on
> Replit's end?"

## What Claude did

- Explained that the change lives only in Replit's copy of `.replit`, so it
  would be lost or cause a conflict on the next pull unless it reaches `main`
  through a PR.
- Added the same one-line change, `deploymentTarget = "autoscale"`, to the
  `[deployment]` section, and opened this PR.

## Why Autoscale fits

Autoscale runs the app only while people are using it and can scale down when
idle. That works here because nothing important lives in the app's memory:
claims, observations and login sessions are all stored in PostgreSQL, so they
survive the app restarting.
