import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createPool, migrate } from "../src/db.js";
import { buildTimeline, TIMELINE } from "../src/timeline.js";

// Checks for Custom #1: a claim's observations on a timeline, oldest to
// newest, with the seed and weeds marked.

describe("timeline layout", () => {
  const obs = (id, observed_at, extra = {}) => ({ id, observed_at, location: "X", poster: null, ...extra });

  it("places observations to scale from oldest (left) to newest (right)", () => {
    const t = buildTimeline([
      obs(3, "2026-03-11T00:00:00Z"),
      obs(1, "2026-03-01T00:00:00Z"),
      obs(2, "2026-03-03T12:00:00Z"),
    ]);
    expect(t.points.map((p) => p.id)).toEqual([1, 2, 3]);
    expect(t.points[0].x).toBe(TIMELINE.left);
    expect(t.points[2].x).toBe(TIMELINE.right);
    // Mar 3 12:00 is a quarter of the way from Mar 1 to Mar 11.
    expect(t.points[1].x).toBeCloseTo(TIMELINE.left + (TIMELINE.right - TIMELINE.left) * 0.25);
    expect(t.summary.spread).toBe("over 10 days");
  });

  it("marks the seed, weeds and the earliest found", () => {
    const t = buildTimeline([
      obs(1, "2026-03-01T00:00:00Z", { location: "Bluesky", poster: "@anon" }),
      obs(2, "2026-03-02T00:00:00Z", { is_seed: true }),
      obs(3, "2026-03-05T00:00:00Z", { is_weed: true }),
    ]);
    expect(t.points.map((p) => p.kind)).toEqual(["observation", "seed", "weed"]);
    expect(t.points[0].isEarliest).toBe(true);
    expect(t.summary).toMatchObject({ earliestLocation: "Bluesky", earliestPoster: "@anon", earliestIsSeed: false });
  });

  it("stacks markers that would overlap instead of drawing them on top of each other", () => {
    const t = buildTimeline([
      obs(1, "2026-03-01T00:00:00Z"),
      obs(2, "2026-03-01T00:05:00Z"),
      obs(3, "2026-03-01T00:10:00Z"),
      obs(4, "2026-03-20T00:00:00Z"),
    ]);
    expect(t.points.map((p) => p.row)).toEqual([0, 1, 2, 0]);
    expect(t.rows).toBe(3);
  });

  it("lists observations without a time separately", () => {
    const t = buildTimeline([obs(1, null), obs(2, "2026-03-01T00:00:00Z")]);
    expect(t.points.map((p) => p.id)).toEqual([2]);
    expect(t.undated.map((o) => o.id)).toEqual([1]);

    const none = buildTimeline([obs(1, null)]);
    expect(none.summary).toBeNull();
  });
});

describe("timeline on the claim page", () => {
  const pool = createPool(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);
  const app = createApp(pool, { sessionSecret: "test-secret" });
  const email = `timeline-${Date.now()}@example.com`;
  const agent = request.agent(app);
  let claimId;

  beforeAll(async () => {
    await migrate(pool);
    await agent.post("/signup").type("form").send({ email, password: "timeline-pass" });
    const claim = await agent.post("/claims").type("form").send({ claim_text: "Timeline claim" });
    claimId = Number(claim.headers.location.split("/").pop());
    await agent.post(`/claims/${claimId}/observations`).type("form").send({ location: "X", observed_at: "2026-03-06T12:00", poster: "@NewsPatriotHub" });
    const seed = await agent.post(`/claims/${claimId}/observations`).type("form").send({ location: "Bluesky", observed_at: "2026-03-02T09:00", poster: "@anon48213" });
    await agent.post(`/observations/${Number(seed.headers.location.split("#observation-")[1])}/seed`);
    await agent.post(`/claims/${claimId}/observations`).type("form").send({ location: "Telegram" });
  });

  afterAll(async () => {
    await pool.query("DELETE FROM users WHERE email = $1", [email]);
    await pool.end();
  });

  it("draws the timeline with the earliest found, the seed and undated observations", async () => {
    const res = await agent.get(`/claims/${claimId}`);
    expect(res.text).toContain("Origin timeline");
    expect(res.text).toContain("Earliest found: <strong>Mar 2, 2026</strong> on <strong>Bluesky</strong>");
    expect(res.text).toContain("marker marker-seed");
    expect(res.text).toContain("1 observation without a posting time");
    expect(res.text).toContain("earliest found</span>");
  });
});
