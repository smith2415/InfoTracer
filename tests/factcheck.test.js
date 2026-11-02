import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createPool, migrate } from "../src/db.js";
import { createFactCheckSearch, parseFactChecks, ratingTone, googleReason, FactCheckError } from "../src/factcheck.js";

// Checks for Custom #2: fact-check lookup. These tests never call Google;
// they use a stand-in that returns a response in the API's documented shape.

const SAMPLE_RESPONSE = {
  claims: [
    {
      text: "Zelensky bought two mega yachts with US aid",
      claimant: "Social media posts",
      claimDate: "2022-12-01T00:00:00Z",
      claimReview: [
        {
          publisher: { name: "Example Fact Check", site: "factcheck.example" },
          url: "https://factcheck.example/yachts",
          title: "No, Zelensky did not buy two yachts",
          reviewDate: "2022-12-05T00:00:00Z",
          textualRating: "False",
          languageCode: "en",
        },
      ],
    },
    { text: "A claim with no reviews is skipped", claimReview: [] },
  ],
};

function fakeFetch(status, body, seen = []) {
  return async (url) => {
    seen.push(String(url));
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
}

describe("fact-check search", () => {
  it("parses claims and their reviews, skipping claims with no reviews", () => {
    const results = parseFactChecks(SAMPLE_RESPONSE);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ claimant: "Social media posts" });
    expect(results[0].reviews[0]).toMatchObject({ publisher: "Example Fact Check", rating: "False" });
    expect(parseFactChecks({})).toEqual([]);
  });

  it("colors ratings: false, true or neutral", () => {
    expect(ratingTone("False")).toBe("false");
    expect(ratingTone("Mostly false")).toBe("false");
    expect(ratingTone("Misleading")).toBe("false");
    expect(ratingTone("Falso")).toBe("false");
    expect(ratingTone("Faux")).toBe("false");
    expect(ratingTone("True")).toBe("true");
    expect(ratingTone("Mixture")).toBe("neutral");
    expect(ratingTone(null)).toBe("neutral");
  });

  it("sends the query and key to Google's endpoint", async () => {
    const seen = [];
    const search = createFactCheckSearch({ apiKey: "test-key", fetchImpl: fakeFetch(200, SAMPLE_RESPONSE, seen) });
    const results = await search("two mega yachts");
    expect(results).toHaveLength(1);
    const url = new URL(seen[0]);
    expect(url.origin + url.pathname).toBe("https://factchecktools.googleapis.com/v1alpha1/claims:search");
    expect(url.searchParams.get("query")).toBe("two mega yachts");
    expect(url.searchParams.get("key")).toBe("test-key");
  });

  it("reports a missing key, a rejected key, rate limits and outages as friendly errors", async () => {
    const kind = async (search) => search("q").catch((err) => (err instanceof FactCheckError ? err.kind : "other"));
    expect(await kind(createFactCheckSearch({ apiKey: "" }))).toBe("not_configured");
    expect(await kind(createFactCheckSearch({ apiKey: "k", fetchImpl: fakeFetch(403, {}) }))).toBe("rejected");
    expect(await kind(createFactCheckSearch({ apiKey: "k", fetchImpl: fakeFetch(429, {}) }))).toBe("rate_limited");
    expect(await kind(createFactCheckSearch({ apiKey: "k", fetchImpl: fakeFetch(500, {}) }))).toBe("unavailable");
    const offline = async () => { throw new TypeError("fetch failed"); };
    expect(await kind(createFactCheckSearch({ apiKey: "k", fetchImpl: offline }))).toBe("unavailable");
  });
});

describe("Google's refusal reasons", () => {
  const disabled = {
    error: {
      code: 403,
      message: "Fact Check Tools API has not been used in project 123 before or it is disabled.",
      status: "PERMISSION_DENIED",
      details: [{ "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason: "SERVICE_DISABLED" }],
    },
  };

  it("reads the reason code from Google's error, preferring the specific one", () => {
    expect(googleReason(disabled)).toBe("SERVICE_DISABLED");
    expect(googleReason({ error: { status: "INVALID_ARGUMENT" } })).toBe("INVALID_ARGUMENT");
    expect(googleReason({ error: { details: [{ reason: "<script>alert(1)</script>" }] } })).toBe("scriptalert1script");
    expect(googleReason(null)).toBeNull();
  });

  it("attaches the reason to the error", async () => {
    const search = createFactCheckSearch({ apiKey: "k", fetchImpl: fakeFetch(403, disabled) });
    const err = await search("q").catch((e) => e);
    expect(err.kind).toBe("rejected");
    expect(err.reason).toBe("SERVICE_DISABLED");
  });
});

describe("fact-check lookup page", () => {
  const pool = createPool(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);
  const SECRET_KEY = "AIza-test-key-that-must-never-appear";
  const queries = [];
  const goodSearch = async (q) => { queries.push(q); return parseFactChecks(SAMPLE_RESPONSE); };
  const app = createApp(pool, { sessionSecret: "test-secret", factCheckSearch: goodSearch });
  const brokenApp = createApp(pool, {
    sessionSecret: "test-secret",
    factCheckSearch: createFactCheckSearch({
      apiKey: SECRET_KEY,
      fetchImpl: fakeFetch(403, { error: { status: "PERMISSION_DENIED", details: [{ reason: "API_KEY_SERVICE_BLOCKED" }] } }),
    }),
  });
  const emails = [`fc-a-${Date.now()}@example.com`, `fc-b-${Date.now()}@example.com`];
  const agentA = request.agent(app);
  const agentB = request.agent(app);
  let claimId;

  beforeAll(async () => {
    await migrate(pool);
    await agentA.post("/signup").type("form").send({ email: emails[0], password: "fc-pass-a" });
    await agentB.post("/signup").type("form").send({ email: emails[1], password: "fc-pass-b" });
    const claim = await agentA.post("/claims").type("form").send({ claim_text: "Yacht claim", hook: "two mega yachts" });
    claimId = Number(claim.headers.location.split("/").pop());
  });

  afterAll(async () => {
    await pool.query("DELETE FROM users WHERE email = ANY($1)", [emails]);
    await pool.end();
  });

  it("offers a fact-check search on the claim page, prefilled with the hook", async () => {
    const page = await agentA.get(`/claims/${claimId}`);
    expect(page.text).toContain("Fact-check lookup");
    expect(page.text).toContain('value="two mega yachts"');
  });

  it("shows fact-checks with their rating, publisher and link", async () => {
    const res = await agentA.get(`/claims/${claimId}/fact-checks`);
    expect(queries.at(-1)).toBe("two mega yachts");
    expect(res.text).toContain("1 fact-checked claim matching");
    expect(res.text).toContain('rating rating-false">False');
    expect(res.text).toContain("Example Fact Check");
    expect(res.text).toContain('href="https://factcheck.example/yachts"');
  });

  it("shows search tips, opened when nothing matches", async () => {
    const found = await agentA.get(`/claims/${claimId}/fact-checks`);
    expect(found.text).toContain("<summary>Search tips</summary>");
    expect(found.text).not.toMatch(/<details class="search-tips" open>/);

    const emptyApp = createApp(pool, { sessionSecret: "test-secret", factCheckSearch: async () => [] });
    const agent = request.agent(emptyApp);
    await agent.post("/login").type("form").send({ email: emails[0], password: "fc-pass-a" });
    const none = await agent.get(`/claims/${claimId}/fact-checks`);
    expect(none.text).toMatch(/<details class="search-tips" open>/);
  });

  it("searches a custom phrase", async () => {
    await agentA.get(`/claims/${claimId}/fact-checks`).query({ q: "  Zelensky yachts  " });
    expect(queries.at(-1)).toBe("Zelensky yachts");
  });

  it("explains a failed lookup without ever showing the API key", async () => {
    const agent = request.agent(brokenApp);
    await agent.post("/login").type("form").send({ email: emails[0], password: "fc-pass-a" });
    const res = await agent.get(`/claims/${claimId}/fact-checks`);
    expect(res.status).toBe(200);
    expect(res.text).toContain("accept the request. Check that the API key is valid");
    expect(res.text).toContain("reason: API_KEY_SERVICE_BLOCKED.");
    expect(res.text).toContain("restrictions don");
    expect(res.text).not.toContain(SECRET_KEY);
  });

  it("doesn't let another user look up your claim", async () => {
    expect((await agentB.get(`/claims/${claimId}/fact-checks`)).status).toBe(404);
  });
});
