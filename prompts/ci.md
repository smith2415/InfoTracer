# Prompt log: Run the tests automatically on GitHub

## Prompt

> "Merged! I'll republish on replit while you work on Spine #7"

While building Spine #7, Claude needed a way for me to capture the red, then
green screenshots the assignment asks for, for the two graded tests.

## The problem

The test runner (Vitest 5) needs Node 22, but Replit runs Node 20, so the tests
can't run in Replit's Shell. They only ran in Claude's workspace, where I
couldn't take screenshots.

## What Claude did

Added a GitHub Actions workflow (`.github/workflows/test.yml`) that, on every
pull request and every push to `main`:

1. Starts a fresh PostgreSQL 16 database.
2. Installs the exact packages from `package-lock.json` with Node 22.
3. Runs `npm test`.

Each PR now shows a **Tests** check: a red ✗ when a test fails and a green ✓
when everything passes, with the full test output one click away. That's where
the red/green screenshots come from.
