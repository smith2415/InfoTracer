# InfoTracer

A basic information tracing tool to help determine when and where a piece of
online information was first introduced into the information environment.

**Live app:** coming soon (hosted on Replit)

## Run it on Replit

1. Import this GitHub repo into Replit.
2. Add a PostgreSQL database from the Replit tools panel. Replit sets
   `DATABASE_URL` for you.
3. Add a secret named `SESSION_SECRET` with any long random string.
4. Press **Run**. The app creates its tables on first start.

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

## Built with

Node.js, Express, EJS, PostgreSQL, bcryptjs and express-session, built with
Claude Code. See [PLAN.md](PLAN.md) for the full plan.
