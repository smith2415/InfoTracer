import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createPool, migrate } from "../src/db.js";
import { searchAllSources, SourceError, SEARCH_TIME_LIMIT_MS } from "../src/sources/index.js";

// Checks for the source search time limit, progress updates and timing logs.
// No outside service is called; stand-in sources answer after a delay.

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function source(name, label, { delay = 0, fail = null, hang = false, posts = 1 } = {}) {
  return {
    name,
    label,
    async search() {
      if (hang) return new Promise(() => {}); // never answers
      await wait(delay);
      if (fail) throw new SourceError(fail);
      const observations = Array.from({ length: posts }, (_, i) => ({
        observedAt: `2026-03-0${i + 1}T09:00:00Z`,
        location: label,
        poster: `@${name}${i}`,
        url: `https://example.com/${name}/${i}`,
        foundBy: "bluesky",
      }));
      return { observations, totalFound: observations.length, reachedEnd: true };
    },
  };
}

describe("Source search time limit", () => {
  it("is 60 seconds", () => {
    expect(SEARCH_TIME_LIMIT_MS).toBe(60_000);
  });

  it("keeps sources that finish in time and reports the slow one", async () => {
    const settled = [];
    const results = await searchAllSources(
      [source("bluesky", "Bluesky", { delay: 30 }), source("xpoz", "Xpoz", { hang: true }), source("gdelt", "GDELT", { delay: 5 })],
      "q",
      { timeLimitMs: 120, onSettle: (e) => settled.push(e.name) }
    );

    expect(results.map((r) => r.name)).toEqual(["bluesky", "xpoz", "gdelt"]); // original order
    expect(settled).toEqual(["gdelt", "bluesky", "xpoz"]); // as each finished
    expect(results[0].result.totalFound).toBe(1);
    expect(results[1]).toMatchObject({ timedOut: true });
    expect(results[1].error).toContain("took longer than 0 seconds");
    expect(typeof results[2].seconds).toBe("number");
  });

  it("writes how long each source took to the log", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await searchAllSources(
      [source("bluesky", "Bluesky"), source("xpoz", "Xpoz", { fail: "unavailable" })],
      "q"
    );
    expect(log.mock.calls.flat().join("\n")).toMatch(/Source search: Bluesky finished in \d+(\.\d)?s \(1 found\)/);
    expect(warn.mock.calls.flat().join("\n")).toMatch(/Source search: Xpoz failed after \d+(\.\d)?s/);
    log.mockRestore();
    warn.mockRestore();
  });
});

describe("Source search progress on a claim", () => {
  const pool = createPool(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);
  const sources = [source("bluesky", "Bluesky", { delay: 20, posts: 2 }), source("xpoz", "Xpoz", { fail: "rejected" })];
  const app = createApp(pool, { sessionSecret: "test-secret", sources });
  const email = `progress-${Date.now()}@example.com`;
  const agent = request.agent(app);
  let claimId;

  beforeAll(async () => {
    await migrate(pool);
    await agent.post("/signup").type("form").send({ email, password: "progress-pass" });
    const claim = await agent.post("/claims").type("form").send({ claim_text: "Progress claim", hook: "progress" });
    claimId = Number(claim.headers.location.split("/").pop());
  });

  afterAll(async () => {
    await pool.query("DELETE FROM users WHERE email = $1", [email]);
    await pool.end();
  });

  it("sends progress as each source finishes, then where to see the results", async () => {
    const res = await agent
      .post(`/claims/${claimId}/source-search`)
      .set("Accept", "application/x-ndjson")
      .type("form")
      .send({ q: "progress" });

    expect(res.headers["content-type"]).toContain("application/x-ndjson");
    const events = res.text.trim().split("\n").map((line) => JSON.parse(line));
    expect(events.map((e) => e.type)).toEqual(["start", "source", "source", "saving", "done"]);
    expect(events[0]).toMatchObject({ timeLimitSeconds: 60, sources: [{ name: "bluesky", label: "Bluesky" }, { name: "xpoz", label: "Xpoz" }] });
    expect(events[1]).toMatchObject({ name: "xpoz", status: "failed" }); // finished first
    expect(events[2]).toMatchObject({ name: "bluesky", status: "done", found: 2 });
    expect(events[4].redirect).toBe(`/claims/${claimId}#source-search`);

    // The results show once on the claim page, with each source's time.
    const page = await agent.get(`/claims/${claimId}`);
    expect(page.text).toContain("found 2 posts; saved the 2 earliest");
    expect(page.text).toMatch(/class="source-time">\(\d+(\.\d)?s\)/);
    expect(page.text).toContain('id="source-progress"');
    const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM observations WHERE claim_id = $1", [claimId]);
    expect(rows[0].n).toBe(2);
  });

  it("still works without JavaScript: the form posts and redirects", async () => {
    const res = await agent.post(`/claims/${claimId}/source-search`).type("form").send({ q: "progress" });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/claims/${claimId}#source-search`);
  });

  it("doesn't search for someone who isn't signed in", async () => {
    const res = await request(app)
      .post(`/claims/${claimId}/source-search`)
      .set("Accept", "application/x-ndjson")
      .type("form")
      .send({ q: "progress" });
    expect(res.status).toBe(302); // not signed in: sent to the login page
    expect(res.headers.location).toBe("/login");
  });
});
