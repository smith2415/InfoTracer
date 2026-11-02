import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createPool, migrate } from "../src/db.js";
import { createClaim, addObservations, listObservations } from "../src/models.js";

// Checks for the performance pass: less work per page, same behavior.

describe("Performance pass", () => {
  const pool = createPool(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);
  const app = createApp(pool, { sessionSecret: "test-secret", sources: [] });
  const stamp = Date.now();
  const emails = [`perf-a-${stamp}@example.com`, `perf-b-${stamp}@example.com`];
  const agent = request.agent(app);
  let userA;
  let userB;

  beforeAll(async () => {
    await migrate(pool);
    await agent.post("/signup").type("form").send({ email: emails[0], password: "perf-pass-a" });
    await request(app).post("/signup").type("form").send({ email: emails[1], password: "perf-pass-b" });
    const { rows } = await pool.query("SELECT id, email FROM users WHERE email = ANY($1)", [emails]);
    userA = rows.find((r) => r.email === emails[0]).id;
    userB = rows.find((r) => r.email === emails[1]).id;
  });

  afterAll(async () => {
    await pool.query("DELETE FROM users WHERE email = ANY($1)", [emails]);
    await pool.end();
  });

  it("compiles page templates once instead of on every request", () => {
    expect(app.enabled("view cache")).toBe(true);
  });

  it("doesn't write to the sessions table on an ordinary page view", async () => {
    const before = await pool.query(
      "SELECT sid, expire FROM session WHERE sess::jsonb ->> 'userId' = $1",
      [String(userA)]
    );
    expect(before.rows).toHaveLength(1);
    await new Promise((r) => setTimeout(r, 1100)); // so a touch would change the time
    await agent.get("/claims").expect(200);
    const after = await pool.query("SELECT expire FROM session WHERE sid = $1", [before.rows[0].sid]);
    expect(after.rows[0].expire.getTime()).toBe(before.rows[0].expire.getTime());
  });

  it("saves a batch of observations in one go, only on the user's own claim", async () => {
    const claim = await createClaim(pool, userA, { claimText: "Batch claim" });
    const batch = [
      { observedAt: "2026-03-02T09:00:00Z", location: "X", poster: "@first", url: "https://x.com/a/status/1", foundBy: "xpoz" },
      { observedAt: "2026-03-01T09:00:00Z", location: "Bluesky", poster: "@earlier", url: "https://bsky.app/profile/b/post/2", foundBy: "bluesky" },
      { observedAt: null, location: "News site", poster: "example.com", url: "https://example.com/story", notes: "Headline: hi", foundBy: "gdelt" },
    ];

    expect(await addObservations(pool, userB, claim.id, batch)).toBe(0); // someone else's claim
    expect(await addObservations(pool, userA, claim.id, [])).toBe(0);
    expect(await addObservations(pool, userA, claim.id, batch)).toBe(3);

    const saved = await listObservations(pool, userA, claim.id);
    expect(saved.map((o) => [o.poster, o.found_by])).toEqual([
      ["@earlier", "bluesky"],
      ["@first", "xpoz"],
      ["example.com", "gdelt"],
    ]);
    expect(saved[2].notes).toBe("Headline: hi");
    expect(saved[2].post_text).toBeNull();
  });
});
