# Running InfoTracer on Replit

- The `Start application` workflow runs `PORT=5000 npm start` for the
  Replit web preview. Port 5000 is mapped to the public web port (80).
- Publishing uses the same port, and its build runs `npm ci --omit=dev`, which
  installs only the packages the app needs to run.
- The app requires Node.js 20+ and PostgreSQL. Replit provides `DATABASE_URL`;
  the app creates its tables when it starts.
- Configure `SESSION_SECRET`, `GOOGLE_FACTCHECK_API_KEY`, `BLUESKY_HANDLE`,
  `BLUESKY_APP_PASSWORD` and `XPOZ_API_KEY` in Replit Secrets before
  publishing. `XPOZ_PLATFORMS` is optional (default `twitter,reddit`).
- Replit's package security filter blocks `tinypool`, a dependency of the test
  runner (Vitest), so the automated tests aren't run on Replit. They run in a
  local or CI environment with `npm test` (see README.md).
