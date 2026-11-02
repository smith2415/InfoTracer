import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createPool, migrate } from "../src/db.js";
import { createGdeltSource, gdeltQuery, parseGdeltDate, toObservation } from "../src/sources/gdelt.js";
import { SourceError } from "../src/sources/index.js";

// Checks for Custom #3, part 2: GDELT news search. GDELT is never called;
// a stand-in answers in the DOC 2.0 API's format.

const ARTICLES = [
  { url: "https://news-b.example/story", title: "Later story", seendate: "20260306T120000Z", domain: "news-b.example", language: "English", sourcecountry: "United States" },
  { url: "https://news-a.example/first", title: "Bank lost $12 billion, posts claim", seendate: "20260302T091500Z", domain: "news-a.example", language: "Russian", sourcecountry: "Russia" },
];

// A stand-in GDELT. `timeline` is a list of [date, count] pairs.
function fakeGdelt({ timeline = [["20260301T000000Z", 0], ["20260302T000000Z", 3], ["20260306T000000Z", 5]], articles = ARTICLES, body } = {}) {
  const calls = [];
  const fetchImpl = async (url) => {
    const params = new URL(url).searchParams;
    calls.push(params);
    if (body !== undefined) return { ok: true, status: 200, text: async () => body };
    const payload =
      params.get("mode") === "TimelineVolRaw"
        ? { timeline: [{ series: "Article Count", data: timeline.map(([date, value]) => ({ date, value })) }] }
        : { articles };
    return { ok: true, status: 200, text: async () => JSON.stringify(payload) };
  };
  return { fetchImpl, calls };
}

const instant = async () => {};
const fixedNow = () => new Date("2026-11-02T00:00:00Z");

describe("GDELT source", () => {
  it("turns the search text into GDELT's search language", () => {
    expect(gdeltQuery("$12 billion")).toBe('"12 billion"');
    expect(gdeltQuery("yachts")).toBe("yachts");
    expect(gdeltQuery("  Zelensky's   yachts!! ")).toBe(`"Zelensky's yachts"`);
    expect(gdeltQuery("$$$")).toBe("");
  });

  it("reads GDELT's dates", () => {
    expect(parseGdeltDate("20260302T091500Z")).toBe("2026-03-02T09:15:00Z");
    expect(parseGdeltDate("20260302")).toBe("2026-03-02T00:00:00Z");
    expect(parseGdeltDate("nonsense")).toBeNull();
  });

  it("turns an article into an observation: outlet as poster, headline in the notes", () => {
    const o = toObservation(ARTICLES[1]);
    expect(o).toMatchObject({
      observedAt: "2026-03-02T09:15:00Z",
      location: "News site",
      poster: "news-a.example",
      postText: null,
      url: "https://news-a.example/first",
      foundBy: "gdelt",
    });
    expect(o.notes).toContain("Headline: Bank lost $12 billion, posts claim");
    expect(o.notes).toContain("Russian, Russia");
  });

  it("finds the first day the phrase appeared, then lists articles from that day, oldest first", async () => {
    const { fetchImpl, calls } = fakeGdelt();
    const source = createGdeltSource({ fetchImpl, pause: instant, now: fixedNow });
    const { observations, totalFound } = await source.search("$12 billion");

    expect(calls[0].get("mode")).toBe("TimelineVolRaw");
    expect(calls[0].get("query")).toBe('"12 billion"');
    expect(calls[0].get("startdatetime")).toBe("20170101000000");

    expect(calls[1].get("mode")).toBe("ArtList");
    expect(calls[1].get("sort")).toBe("DateAsc");
    expect(calls[1].get("startdatetime")).toBe("20260302000000");
    expect(calls[1].get("enddatetime")).toBe("20260531000000"); // 90 days later

    expect(totalFound).toBe(8);
    expect(observations.map((o) => o.poster)).toEqual(["news-a.example", "news-b.example"]);
  });

  it("waits between its two requests, as GDELT asks", async () => {
    const waits = [];
    const { fetchImpl } = fakeGdelt();
    await createGdeltSource({ fetchImpl, pause: async (ms) => waits.push(ms), now: fixedNow }).search("yachts");
    expect(waits).toEqual([5500]);
  });

  it("skips the article list when the phrase never appears", async () => {
    const { fetchImpl, calls } = fakeGdelt({ timeline: [["20260301T000000Z", 0]] });
    const result = await createGdeltSource({ fetchImpl, pause: instant, now: fixedNow }).search("nothing");
    expect(result).toEqual({ observations: [], totalFound: 0, reachedEnd: true });
    expect(calls).toHaveLength(1);
  });

  it("reports GDELT's plain-text errors and rate limits", async () => {
    const run = (body) =>
      createGdeltSource({ fetchImpl: fakeGdelt({ body }).fetchImpl, pause: instant, now: fixedNow })
        .search("yachts")
        .catch((err) => err);

    const tooShort = await run("The specified phrase is too short.");
    expect(tooShort).toBeInstanceOf(SourceError);
    expect(tooShort.kind).toBe("rejected");
    expect(tooShort.detail).toBe("The specified phrase is too short.");

    const slowDown = await run("Please limit requests to one every 5 seconds.");
    expect(slowDown.kind).toBe("rate_limited");

    const offline = await createGdeltSource({ fetchImpl: async () => { throw new TypeError("fetch failed"); }, pause: instant })
      .search("yachts")
      .catch((err) => err);
    expect(offline.kind).toBe("unavailable");
  });
});

describe("GDELT and Bluesky together on a claim", () => {
  const pool = createPool(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);
  const gdelt = createGdeltSource({ fetchImpl: fakeGdelt().fetchImpl, pause: instant, now: fixedNow });
  const brokenBluesky = { name: "bluesky", label: "Bluesky", search: async () => { throw new SourceError("unavailable"); } };
  const app = createApp(pool, { sessionSecret: "test-secret", sources: [brokenBluesky, gdelt] });
  const email = `gdelt-${Date.now()}@example.com`;
  const agent = request.agent(app);
  let claimId;

  beforeAll(async () => {
    await migrate(pool);
    await agent.post("/signup").type("form").send({ email, password: "gdelt-pass" });
    const claim = await agent.post("/claims").type("form").send({ claim_text: "Bank claim", hook: "$12 billion" });
    claimId = Number(claim.headers.location.split("/").pop());
  });

  afterAll(async () => {
    await pool.query("DELETE FROM users WHERE email = $1", [email]);
    await pool.end();
  });

  it("saves GDELT's articles even when Bluesky fails, and reports both", async () => {
    await agent.post(`/claims/${claimId}/source-search`).type("form").send({ q: "$12 billion" });
    const { rows } = await pool.query(
      "SELECT poster, found_by, post_text FROM observations WHERE claim_id = $1 ORDER BY observed_at",
      [claimId]
    );
    expect(rows).toEqual([
      { poster: "news-a.example", found_by: "gdelt", post_text: null },
      { poster: "news-b.example", found_by: "gdelt", post_text: null },
    ]);

    const page = await agent.get(`/claims/${claimId}`);
    expect(page.text).toContain("GDELT news:</strong> found 8 articles; saved the 2 earliest as observations.");
    expect(page.text).toContain("Bluesky:</strong> Couldn");
  });
});
