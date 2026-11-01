import { describe, it, expect, beforeAll, afterAll } from "vitest";
import bcrypt from "bcryptjs";
import { createPool, migrate } from "../src/db.js";
import {
  createClaim,
  getClaim,
  listClaims,
  addObservation,
  listObservations,
  setSeed,
  deleteClaim,
} from "../src/models.js";

// Checks for Spine #2: claims hold a chronological list of observations.
const pool = createPool(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);
let userA;
let userB;

async function makeUser(label) {
  const { rows } = await pool.query(
    "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id",
    [`${label}-${Date.now()}-${Math.random()}@example.com`, await bcrypt.hash("x", 4)]
  );
  return rows[0].id;
}

beforeAll(async () => {
  await migrate(pool);
  userA = await makeUser("a");
  userB = await makeUser("b");
});

afterAll(async () => {
  await pool.query("DELETE FROM users WHERE id = ANY($1)", [[userA, userB]]);
  await pool.end();
});

describe("claims and observations", () => {
  it("lists a claim's observations oldest first, with unknown times last", async () => {
    const claim = await createClaim(pool, userA, {
      claimText: "$12 billion was stolen from the bank",
      hook: "$12 billion",
    });
    expect(claim.status).toBe("tracing");

    await addObservation(pool, userA, claim.id, { location: "X", observedAt: "2026-03-06T12:00:00Z", poster: "@NewsHub" });
    await addObservation(pool, userA, claim.id, { location: "news site", observedAt: "" });
    await addObservation(pool, userA, claim.id, { location: "Bluesky", observedAt: "2026-03-02T09:00:00Z", foundBy: "bluesky" });

    const observations = await listObservations(pool, userA, claim.id);
    expect(observations.map((o) => o.location)).toEqual(["Bluesky", "X", "news site"]);
    expect(observations[2].observed_at).toBeNull();
    expect(observations[0].found_by).toBe("bluesky");
    expect(observations[1].found_by).toBe("manual");

    const [summary] = await listClaims(pool, userA);
    expect(summary.observation_count).toBe(3);
  });

  it("stores blank details as empty, not as text", async () => {
    const claim = await createClaim(pool, userA, { claimText: "Blank test" });
    const obs = await addObservation(pool, userA, claim.id, { location: "Instagram", poster: "  " });
    expect(obs.poster).toBeNull();
    expect(obs.post_text).toBeNull();
  });

  it("keeps at most one seed per claim", async () => {
    const claim = await createClaim(pool, userA, { claimText: "Seed test" });
    const first = await addObservation(pool, userA, claim.id, { location: "X" });
    const second = await addObservation(pool, userA, claim.id, { location: "Reddit" });

    await setSeed(pool, userA, first.id);
    await setSeed(pool, userA, second.id);

    const seeds = (await listObservations(pool, userA, claim.id)).filter((o) => o.is_seed);
    expect(seeds.map((o) => o.id)).toEqual([second.id]);
  });

  it("requires a location and rejects text over 2,000 characters", async () => {
    const claim = await createClaim(pool, userA, { claimText: "Limits test" });
    await expect(addObservation(pool, userA, claim.id, { location: "" })).rejects.toThrow();
    await expect(
      addObservation(pool, userA, claim.id, { location: "X", postText: "a".repeat(2001) })
    ).rejects.toThrow();
  });

  it("never returns or changes another user's claim", async () => {
    const claim = await createClaim(pool, userA, { claimText: "Private to A" });
    expect(await getClaim(pool, userB, claim.id)).toBeNull();
    expect(await addObservation(pool, userB, claim.id, { location: "X" })).toBeNull();
    expect(await deleteClaim(pool, userB, claim.id)).toBe(false);
    expect(await getClaim(pool, userA, claim.id)).not.toBeNull();
  });

  it("deletes a claim's observations along with it", async () => {
    const claim = await createClaim(pool, userA, { claimText: "Delete test" });
    await addObservation(pool, userA, claim.id, { location: "X" });
    expect(await deleteClaim(pool, userA, claim.id)).toBe(true);
    const { rows } = await pool.query("SELECT 1 FROM observations WHERE claim_id = $1", [claim.id]);
    expect(rows).toHaveLength(0);
  });
});
