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
  `);
}
