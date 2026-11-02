import pg from "pg";

const { Pool } = pg;

// One shared connection pool. DATABASE_URL is set by Replit's PostgreSQL
// database (or by hand when running locally or in tests).
export function createPool(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Add a PostgreSQL database in Replit, or set DATABASE_URL locally."
    );
  }
  return new Pool({ connectionString });
}

// Creates the tables this version of the app needs. Safe to run on every
// start: each statement only creates what's missing.
export async function migrate(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      email         TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS claims (
      id         SERIAL PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      claim_text TEXT NOT NULL CHECK (length(trim(claim_text)) > 0),
      hook       TEXT,
      status     TEXT NOT NULL DEFAULT 'tracing'
                 CHECK (status IN ('tracing', 'traced', 'dead end')),
      notes      TEXT CHECK (char_length(notes) <= 2000),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS claims_user_id_idx ON claims (user_id);

    CREATE TABLE IF NOT EXISTS observations (
      id          SERIAL PRIMARY KEY,
      claim_id    INTEGER NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
      observed_at TIMESTAMPTZ,
      location    TEXT NOT NULL CHECK (length(trim(location)) > 0),
      poster      TEXT,
      post_text   TEXT CHECK (char_length(post_text) <= 2000),
      url         TEXT,
      notes       TEXT CHECK (char_length(notes) <= 2000),
      is_seed     BOOLEAN NOT NULL DEFAULT false,
      found_by    TEXT NOT NULL DEFAULT 'manual'
                  CHECK (found_by IN ('bluesky', 'gdelt', 'xpoz', 'manual')),
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS observations_claim_id_idx ON observations (claim_id);
    -- At most one seed (origin) per claim.
    CREATE UNIQUE INDEX IF NOT EXISTS observations_one_seed_per_claim
      ON observations (claim_id) WHERE is_seed;

    -- Junction table: "this user marked this observation as a weed"
    -- (an observation assessed as intentionally spreading disinformation).
    CREATE TABLE IF NOT EXISTS weeds (
      user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      observation_id INTEGER NOT NULL REFERENCES observations(id) ON DELETE CASCADE,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, observation_id)
    );
    CREATE INDEX IF NOT EXISTS weeds_observation_id_idx ON weeds (observation_id);

    -- Fact-check articles a user has pinned to a claim (from the lookup).
    CREATE TABLE IF NOT EXISTS pinned_fact_checks (
      id             SERIAL PRIMARY KEY,
      claim_id       INTEGER NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
      url            TEXT NOT NULL,
      publisher      TEXT,
      title          TEXT,
      rating         TEXT,
      review_date    TIMESTAMPTZ,
      reviewed_claim TEXT,
      claimant       TEXT,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (claim_id, url)
    );
  `);
}
