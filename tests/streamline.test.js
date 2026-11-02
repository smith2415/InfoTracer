import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createPool, migrate } from "../src/db.js";
import {
  createClaim,
  addObservation,
  addWeed,
  removeWeed,
  setSeed,
  deleteObservation,
  pinFactCheck,
  listPinnedFactChecks,
} from "../src/models.js";

// Checks for the streamlining pass: each button now checks ownership and
// makes its change in one database query, and must still refuse other
// users' rows.

describe("One-query changes", () => {
  const pool = createPool(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);
  const stamp = Date.now();
  const emails = [`lean-a-${stamp}@example.com`, `lean-b-${stamp}@example.com`];
  let userA;
  let userB;
  let claim;
  let obs;

  beforeAll(async () => {
    await migrate(pool);
    const { rows } = await pool.query(
      "INSERT INTO users (email, password_hash) VALUES ($1, 'x'), ($2, 'x') RETURNING id",
      emails
    );
    [userA, userB] = rows.map((r) => r.id);
    claim = await createClaim(pool, userA, { claimText: "Lean claim" });
    obs = await addObservation(pool, userA, claim.id, { location: "X", poster: "@lean" });
  });

  afterAll(async () => {
    await pool.query("DELETE FROM users WHERE email = ANY($1)", [emails]);
    await pool.end();
  });

  const weedCount = async () =>
    (await pool.query("SELECT COUNT(*)::int AS n FROM weeds WHERE observation_id = $1", [obs.id])).rows[0].n;

  it("weeds and unweeds only your own observations, and repeat clicks are harmless", async () => {
    expect(await addWeed(pool, userB, obs.id)).toBeNull();
    expect(await weedCount()).toBe(0);

    expect(await addWeed(pool, userA, obs.id)).toBe(claim.id);
    expect(await addWeed(pool, userA, obs.id)).toBe(claim.id); // already a weed
    expect(await weedCount()).toBe(1);

    expect(await removeWeed(pool, userB, obs.id)).toBeNull();
    expect(await weedCount()).toBe(1);
    expect(await removeWeed(pool, userA, obs.id)).toBe(claim.id);
    expect(await removeWeed(pool, userA, obs.id)).toBe(claim.id); // already removed
    expect(await weedCount()).toBe(0);
  });

  it("sets a seed only on your own observation", async () => {
    expect(await setSeed(pool, userB, obs.id)).toBeNull();
    expect(await setSeed(pool, userA, obs.id)).toBe(claim.id);
    const { rows } = await pool.query("SELECT is_seed FROM observations WHERE id = $1", [obs.id]);
    expect(rows[0].is_seed).toBe(true);
  });

  it("pins only to your own claim, once per article, with the date kept", async () => {
    const pin = { url: "https://factcheck.example/a", title: "Checked", reviewDate: "2026-03-05T00:00:00Z" };
    expect(await pinFactCheck(pool, userB, claim.id, pin)).toBe(false);
    expect(await pinFactCheck(pool, userA, claim.id, pin)).toBe(true);
    expect(await pinFactCheck(pool, userA, claim.id, pin)).toBe(true); // already pinned
    const pins = await listPinnedFactChecks(pool, userA, claim.id);
    expect(pins).toHaveLength(1);
    expect(pins[0].review_date.toISOString()).toBe("2026-03-05T00:00:00.000Z");
  });

  it("deletes only your own observation", async () => {
    expect(await deleteObservation(pool, userB, obs.id)).toBeNull();
    expect(await deleteObservation(pool, userA, obs.id)).toBe(claim.id);
    expect(await deleteObservation(pool, userA, obs.id)).toBeNull();
  });
});
