import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createPool, migrate } from "../src/db.js";
import { createXpozSource, toObservation, parseXpozDate, parsePlatforms } from "../src/sources/xpoz.js";
import { SourceError } from "../src/sources/index.js";

// Checks for Custom #3, part 3: Xpoz. Xpoz is never called; a stand-in
// client answers in the SDK's format.

const TWEETS = [
  { id: "222", text: "BREAKING: $12 billion stolen from the bank", authorUsername: "NewsPatriotHub", createdAt: "2026-03-06T12:00:00Z" },
  { id: "111", text: "they took 12B and nobody's talking", authorUsername: "anon48213", createdAt: 1772442000, deleted: true },
];
const REDDIT = [
  { id: "r1", title: "Did the bank really lose $12 billion?", selftext: "Saw this on X", authorUsername: "curious_user", subredditName: "conspiracy", permalink: "/r/conspiracy/comments/r1/", createdAt: "2026-03-04T08:00:00Z" },
];

function errorNamed(name, message = "") {
  const err = new Error(message);
  err.name = name;
  return err;
}

// A stand-in XpozClient. `answers` maps a platform to its posts, or to an Error.
function fakeClient(answers, log = { calls: [], closed: 0, options: null }) {
  const platform = (name) => ({
    searchPosts: async (query, options) => {
      log.calls.push({ name, query, options });
      const a = answers[name];
      if (a instanceof Error) throw a;
      return { data: a || [] };
    },
  });
  return {
    log,
    createClient: async (options) => {
      log.options = options;
      return {
        connect: async () => {},
        close: async () => { log.closed++; },
        twitter: platform("twitter"),
        reddit: platform("reddit"),
        tiktok: platform("tiktok"),
        instagram: platform("instagram"),
      };
    },
  };
}

describe("Xpoz source", () => {
  it("reads dates in any of Xpoz's formats", () => {
    expect(parseXpozDate("2026-03-06T12:00:00Z")).toBe("2026-03-06T12:00:00.000Z");
    expect(parseXpozDate(1772442000)).toBe("2026-03-02T09:00:00.000Z");
    expect(parseXpozDate("1772442000000")).toBe("2026-03-02T09:00:00.000Z");
    expect(parseXpozDate(null)).toBeNull();
  });

  it("chooses platforms from the setting, defaulting to X and Reddit", () => {
    expect(parsePlatforms(undefined)).toEqual(["twitter", "reddit"]);
    expect(parsePlatforms("x, tiktok,instagram, bogus")).toEqual(["twitter", "tiktok", "instagram"]);
  });

  it("turns posts from each platform into observations with links", () => {
    const tweet = toObservation("twitter", TWEETS[1]);
    expect(tweet).toMatchObject({ location: "X", poster: "@anon48213", url: "https://x.com/anon48213/status/111", foundBy: "xpoz" });
    expect(tweet.notes).toContain("Verify before relying on it");
    expect(tweet.notes).toContain("marks this post as deleted");

    const post = toObservation("reddit", REDDIT[0]);
    expect(post).toMatchObject({ location: "Reddit", poster: "u/curious_user", url: "https://www.reddit.com/r/conspiracy/comments/r1/" });
    expect(post.postText).toBe("Did the bank really lose $12 billion?\n\nSaw this on X");
    expect(post.notes).toContain("r/conspiracy");

    expect(toObservation("tiktok", { id: "9", username: "clipper", description: "watch", createdAt: 1772442000 }).url)
      .toBe("https://www.tiktok.com/@clipper/video/9");
    expect(toObservation("instagram", { codeUrl: "javascript:alert(1)", username: "a", createdAt: 1 }).url).toBeNull();
  });

  it("searches X (without retweets) and Reddit, and returns posts oldest first", async () => {
    const { createClient, log } = fakeClient({ twitter: TWEETS, reddit: REDDIT });
    const source = createXpozSource({ apiKey: "test-key", platforms: ["twitter", "reddit"], createClient });
    const { observations, totalFound, reachedEnd } = await source.search("$12 billion");

    expect(observations.map((o) => o.poster)).toEqual(["@anon48213", "u/curious_user", "@NewsPatriotHub"]);
    expect(totalFound).toBe(3);
    expect(reachedEnd).toBe(true);
    expect(log.calls.map((c) => c.name)).toEqual(["twitter", "reddit"]);
    expect(log.calls[0].options).toMatchObject({ responseType: "fast", limit: 300, filterOutRetweets: true });
    expect(log.options).toMatchObject({ apiKey: "test-key", versionCheck: false });
    expect(log.closed).toBe(1);
  });

  it("keeps one platform's results when the other fails, and says so", async () => {
    const { createClient } = fakeClient({ twitter: TWEETS, reddit: errorNamed("XpozConnectionError") });
    const result = await createXpozSource({ apiKey: "k", platforms: ["twitter", "reddit"], createClient }).search("q");
    expect(result.observations).toHaveLength(2);
    expect(result.warning).toBe("Reddit didn't respond, so those results are missing.");
  });

  it("reports a missing key, a rejected key and used-up credits", async () => {
    const kind = (source) => source.search("q").catch((err) => (err instanceof SourceError ? err.kind : "other"));
    expect(await kind(createXpozSource({ apiKey: "" }))).toBe("not_configured");
    const all = (err) => fakeClient({ twitter: err, reddit: err }).createClient;
    expect(await kind(createXpozSource({ apiKey: "k", createClient: all(errorNamed("AuthenticationError")) }))).toBe("rejected");
    expect(await kind(createXpozSource({ apiKey: "k", createClient: all(errorNamed("OperationFailedError", "Insufficient credits")) }))).toBe("out_of_credits");
    expect(await kind(createXpozSource({ apiKey: "k", createClient: all(errorNamed("OperationTimeoutError")) }))).toBe("unavailable");
  });
});

describe("Xpoz on a claim", () => {
  const pool = createPool(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);
  const xpoz = createXpozSource({ apiKey: "k", platforms: ["twitter", "reddit"], createClient: fakeClient({ twitter: TWEETS, reddit: REDDIT }).createClient });
  const app = createApp(pool, { sessionSecret: "test-secret", sources: [xpoz] });
  const email = `xpoz-${Date.now()}@example.com`;
  const agent = request.agent(app);
  let claimId;

  beforeAll(async () => {
    await migrate(pool);
    await agent.post("/signup").type("form").send({ email, password: "xpoz-pass" });
    const claim = await agent.post("/claims").type("form").send({ claim_text: "Bank claim", hook: "$12 billion" });
    claimId = Number(claim.headers.location.split("/").pop());
  });

  afterAll(async () => {
    await pool.query("DELETE FROM users WHERE email = $1", [email]);
    await pool.end();
  });

  it("saves Xpoz posts and flags every one of them 'verify'", async () => {
    await agent.post(`/claims/${claimId}/source-search`).type("form").send({ q: "$12 billion" });
    const { rows } = await pool.query("SELECT location, found_by FROM observations WHERE claim_id = $1 ORDER BY observed_at", [claimId]);
    expect(rows).toEqual([
      { location: "X", found_by: "xpoz" },
      { location: "Reddit", found_by: "xpoz" },
      { location: "X", found_by: "xpoz" },
    ]);
    const page = await agent.get(`/claims/${claimId}`);
    expect(page.text).toContain("Xpoz (X, Reddit):</strong> found 3 posts; saved the 3 earliest");
    expect(page.text.match(/flag flag-verify/g)).toHaveLength(3);
  });
});
