import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createPool, migrate } from "../src/db.js";
import { createClaim, addObservation, setSeed, addWeed, setImportant, pinFactCheck, getClaimOverview } from "../src/models.js";

// Checks for the dashboard's "Your claims at a glance" section.

describe("Dashboard overview", () => {
  const pool = createPool(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);
  const app = createApp(pool, { sessionSecret: "test-secret", sources: [] });
  const stamp = Date.now();
  const emails = [`overview-a-${stamp}@example.com`, `overview-b-${stamp}@example.com`];
  const agentA = request.agent(app);
  const agentB = request.agent(app);
  let userA;
  let traced;
  let quiet;
  const obs = {};

  beforeAll(async () => {
    await migrate(pool);
    await agentA.post("/signup").type("form").send({ email: emails[0], password: "overview-pass-a" });
    await agentB.post("/signup").type("form").send({ email: emails[1], password: "overview-pass-b" });
    userA = (await pool.query("SELECT id FROM users WHERE email = $1", [emails[0]])).rows[0].id;

    traced = await createClaim(pool, userA, { claimText: "Storm relief went to palms", hook: "$4.2 million" });
    quiet = await createClaim(pool, userA, { claimText: "A claim with nothing marked yet" });
    const add = (poster, when, text) => addObservation(pool, userA, traced.id, { location: "X", poster, observedAt: when, postText: text });
    obs.seed = await add("@origin", "2026-03-01T09:00:00Z", "$4.2 million in storm relief went to palm trees");
    obs.weed = await add("@pusher", "2026-03-03T09:00:00Z", "Your money. Their priorities.");
    obs.both = await add("@amplifier", "2026-03-05T09:00:00Z", "x".repeat(300));
    obs.plain = await add("@bystander", "2026-03-06T09:00:00Z", "just asking");
    await setSeed(pool, userA, obs.seed.id);
    await addWeed(pool, userA, obs.weed.id);
    await addWeed(pool, userA, obs.both.id);
    await setImportant(pool, userA, obs.both.id, true);
    await pinFactCheck(pool, userA, traced.id, { url: "https://factdesk.example/palms", publisher: "Fact Desk", title: "No, relief money didn't buy palms", rating: "False" });
  });

  afterAll(async () => {
    await pool.query("DELETE FROM users WHERE email = ANY($1)", [emails]);
    await pool.end();
  });

  it("gathers each claim's seed, weeds, important observations and pins", async () => {
    const overview = await getClaimOverview(pool, userA);
    expect(overview.map((c) => c.claim_text)).toEqual(["A claim with nothing marked yet", "Storm relief went to palms"]);
    const c = overview[1];
    expect(c.observation_count).toBe(4);
    expect(c.seed.poster).toBe("@origin");
    expect(c.weeds.map((o) => o.poster)).toEqual(["@pusher", "@amplifier"]);
    expect(c.important.map((o) => o.poster)).toEqual(["@amplifier"]);
    expect(c.pins.map((p) => p.publisher)).toEqual(["Fact Desk"]);
    // Each marked observation appears once, oldest first, even with two marks.
    expect(c.marked.map((o) => o.poster)).toEqual(["@origin", "@pusher", "@amplifier"]);
    expect(overview[0]).toMatchObject({ marked: [], seed: null, weeds: [], important: [], pins: [] });
  });

  it("shows every claim under the existing dashboard", async () => {
    const page = (await agentA.get("/dashboard")).text;
    expect(page.indexOf("Weeds by location")).toBeLessThan(page.indexOf("Your claims at a glance"));
    expect(page).toContain("2 claims");
    expect(page).toContain("1 seed");
    expect(page).toContain("2 weeds");
    expect(page).toContain("1 important");
    expect(page).toContain("1 pinned fact-check");
    expect(page).toContain(`href="/claims/${traced.id}#observation-${obs.seed.id}"`);
    expect(page).toContain(`href="/claims/${traced.id}#observation-${obs.both.id}"`);
    expect(page).not.toContain("@bystander"); // unmarked observations stay off the dashboard
    expect(page.split(`#observation-${obs.both.id}"`).length - 1).toBe(1); // weed and important, listed once
    expect(page).toContain("Marked observations");
    expect(page).toContain("No, relief money didn&#39;t buy palms");
    expect(page).toContain('rating rating-false">False');
    expect(page).toContain("x".repeat(139) + "…"); // long post text is shortened
    expect(page).toContain("Nothing marked or pinned yet.");
    expect(page).toContain(`href="/claims/${quiet.id}"`);
  });

  it("shows only your own claims", async () => {
    const page = (await agentB.get("/dashboard")).text;
    expect(page).toContain("No claims yet");
    expect(page).not.toContain("Storm relief went to palms");
  });
});

describe("Menu", () => {
  const pool = createPool(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);
  const app = createApp(pool, { sessionSecret: "test-secret", sources: [] });
  const email = `menu-${Date.now()}@example.com`;
  afterAll(async () => {
    await pool.query("DELETE FROM users WHERE email = $1", [email]);
    await pool.end();
  });

  it("reads Welcome, Dashboard, Claims, Weeds", async () => {
    const agent = request.agent(app);
    await agent.post("/signup").type("form").send({ email, password: "menu-password" });
    const page = (await agent.get("/welcome")).text;
    const order = ["/welcome\">Welcome", "/dashboard\">Dashboard", "/claims\">Claims", "/weeds\">Weeds"].map((s) => page.indexOf(s));
    expect(order.every((i) => i > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(page).not.toContain(">Home</a>");
  });
});
