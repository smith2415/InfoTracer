# InfoTracer

A basic information tracing tool to help determine when and where a piece of
online information was first introduced into the information environment.

**Live app:** https://info-tracer.replit.app

## Run it on Replit

1. Import this GitHub repo into Replit.
2. Add a PostgreSQL database from the Replit tools panel. Replit sets
   `DATABASE_URL` for you.
3. Add a secret named `SESSION_SECRET` with any long random string.
4. For the fact-check lookup, add a secret named `GOOGLE_FACTCHECK_API_KEY`
   with a Google Cloud API key that has the **Fact Check Tools API** enabled.
   Without it, the rest of the app works and the lookup explains it isn't set
   up.
5. Press **Run**. The app creates its tables on first start.

### Updating the live app after a merge

1. In Replit's Shell: `git fetch origin`, then `git reset --hard origin/main`.
2. **Stop**, then **Run**. A running app keeps its old code until it restarts.
3. **Republish.**

See [ReplitLog.md](ReplitLog.md) for the full story of getting the app live.

## Run it locally

Requires Node.js 20+ and a PostgreSQL database.

```bash
npm install
DATABASE_URL=postgresql://user:password@localhost:5432/infotracer npm start
```

Then open http://localhost:3000.

## Tests

```bash
TEST_DATABASE_URL=postgresql://user:password@localhost:5432/infotracer_test npm test
```

## Guides

- [How to use the fact-check lookup](docs/fact-check-guide.md), with search tips
  and a worked example.

## Built with

Node.js, Express, EJS, PostgreSQL, bcryptjs and express-session, built with
Claude Code. See [PLAN.md](PLAN.md) for the full plan.
