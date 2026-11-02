import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createPool, migrate } from "../src/db.js";
import { createBlueskySource, toObservation, postUrl } from "../src/sources/bluesky.js";
import { SourceError } from "../src/sources/index.js";

// Checks for Custom #3, part 1: Bluesky source search. Bluesky is never
// called; a stand-in answers in the API's documented format.

function post(n, createdAt, extra = {}) {
  return {
    uri: `at://did:plc:user${n}/app.bsky.feed.post/post${n}`,
    author: { did: `did:plc:user${n}`, handle: `user${n}.bsky.social`, displayName: `User ${n}` },
    record: { text: `Post ${n} says $12 billion was stolen`, createdAt },
    indexedAt: createdAt,
    ...extra,
  };
}

// A stand-in Bluesky: logs in, then serves `pages` of search results.
function fakeBluesky(pages, { loginStatus = 200, searchStatus = 200 } = {}) {
  const calls = { login: 0, search: [] };
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    if (u.pathname.endsWith("com.atproto.server.createSession")) {
      calls.login++;
      return { status: loginStatus, json: async () => ({ accessJwt: `token-${calls.login}` }) };
    }
    calls.search.push({ params: u.searchParams, auth: init.headers?.Authorization });
    const i = u.searchParams.get("cursor") ? Number(u.searchParams.get("cursor")) : 0;
    const status = typeof searchStatus === "function" ? searchStatus(calls.search.length) : searchStatus;
    return {
      status,
      json: async () => ({ posts: pages[i] || [], cursor: i + 1 < pages.length ? String(i + 1) : undefined }),
    };
  };
  return { fetchImpl, calls };
}

describe("Bluesky source", () => {
  const creds = { handle: "me.bsky.social", appPassword: "app-pass" };

  it("turns a post into an observation with a bsky.app link", () => {
    const o = toObservation(post(1, "2026-03-02T09:00:00.000Z"));
    expect(o).toMatchObject({
      location: "Bluesky",
      poster: "@user1.bsky.social",
      foundBy: "bluesky",
      url: "https://bsky.app/profile/user1.bsky.social/post/post1",
    });
    expect(o.notes).toContain("Display name: User 1");
    expect(postUrl({ uri: "", author: {} })).toBeNull();
  });

  it("flags posts whose stated date is much earlier than when Bluesky indexed them", () => {
    const o = toObservation(post(1, "2025-01-01T00:00:00Z", { indexedAt: "2026-03-02T00:00:00Z" }));
    expect(o.notes).toContain("Posts can be backdated");
    expect(toObservation(post(2, "2026-03-02T00:00:00Z")).notes).not.toContain("backdated");
  });

  it("logs in once, pages back through results and returns them oldest first", async () => {
    const { fetchImpl, calls } = fakeBluesky([
      [post(3, "2026-03-09T00:00:00Z"), post(2, "2026-03-05T00:00:00Z")],
      [post(1, "2026-03-01T00:00:00Z")],
    ]);
    const source = createBlueskySource({ ...creds, fetchImpl });
    const { observations, reachedEnd } = await source.search("$12 billion");

    expect(observations.map((o) => o.poster)).toEqual(["@user1.bsky.social", "@user2.bsky.social", "@user3.bsky.social"]);
    expect(reachedEnd).toBe(true);
    expect(calls.login).toBe(1);
    expect(calls.search).toHaveLength(2);
    expect(calls.search[0].params.get("q")).toBe("$12 billion");
    expect(calls.search[0].auth).toBe("Bearer token-1");

    await source.search("again");
    expect(calls.login).toBe(1); // the login is reused
  });

  it("stops after 5 pages and reports that older posts may exist", async () => {
    const pages = Array.from({ length: 8 }, (_, i) => [post(i, `2026-03-0${9 - Math.min(i, 8)}T00:00:00Z`)]);
    const { fetchImpl, calls } = fakeBluesky(pages);
    const { reachedEnd } = await createBlueskySource({ ...creds, fetchImpl }).search("q");
    expect(calls.search).toHaveLength(5);
    expect(reachedEnd).toBe(false);
  });

  it("logs in again once if the login expires mid-search", async () => {
    const { fetchImpl, calls } = fakeBluesky([[post(1, "2026-03-01T00:00:00Z")]], {
      searchStatus: (n) => (n === 1 ? 401 : 200),
    });
    const { observations } = await createBlueskySource({ ...creds, fetchImpl }).search("q");
    expect(observations).toHaveLength(1);
    expect(calls.login).toBe(2);
  });

  it("reports missing secrets, a rejected login and rate limits", async () => {
    const kind = (source) => source.search("q").catch((err) => (err instanceof SourceError ? err.kind : "other"));
    expect(await kind(createBlueskySource({ handle: "", appPassword: "" }))).toBe("not_configured");
    expect(await kind(createBlueskySource({ ...creds, fetchImpl: fakeBluesky([], { loginStatus: 401 }).fetchImpl }))).toBe("rejected");
    expect(await kind(createBlueskySource({ ...creds, fetchImpl: fakeBluesky([], { searchStatus: 429 }).fetchImpl }))).toBe("rate_limited");
  });
});

describe("source search on a claim", () => {
  const pool = createPool(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);

  // 15 matching posts, one per day from Mar 1 to Mar 15, newest first.
  const fifteen = Array.from({ length: 15 }, (_, i) =>
    toObservation(post(i + 1, `2026-03-${String(i + 1).padStart(2, "0")}T12:00:00Z`))
  ).reverse();
  const fakeSource = {
    name: "bluesky",
    label: "Bluesky",
    search: async () => ({
      observations: [...fifteen].sort((a, b) => new Date(a.observedAt) - new Date(b.observedAt)),
      totalFound: 15,
      reachedEnd: true,
    }),
  };
  const brokenSource = {
    name: "bluesky",
    label: "Bluesky",
    search: async () => {
      throw new SourceError("not_configured");
    },
  };

  const app = createApp(pool, { sessionSecret: "test-secret", sources: [fakeSource] });
  const brokenApp = createApp(pool, { sessionSecret: "test-secret", sources: [brokenSource] });
  const emails = [`ss-a-${Date.now()}@example.com`, `ss-b-${Date.now()}@example.com`];
  const agentA = request.agent(app);
  const agentB = request.agent(app);
  let claimId;

  beforeAll(async () => {
    await migrate(pool);
    await agentA.post("/signup").type("form").send({ email: emails[0], password: "ss-pass-a" });
    await agentB.post("/signup").type("form").send({ email: emails[1], password: "ss-pass-b" });
    const claim = await agentA.post("/claims").type("form").send({ claim_text: "Bank claim", hook: "$12 billion" });
    claimId = Number(claim.headers.location.split("/").pop());
  });

  afterAll(async () => {
    await pool.query("DELETE FROM users WHERE email = ANY($1)", [emails]);
    await pool.end();
  });

  const saved = async () =>
    (await pool.query(
      "SELECT poster, found_by, observed_at FROM observations WHERE claim_id = $1 ORDER BY observed_at",
      [claimId]
    )).rows;

  it("saves the 10 earliest posts as Bluesky observations and says so once", async () => {
    const res = await agentA.post(`/claims/${claimId}/source-search`).type("form").send({ q: "$12 billion" });
    expect(res.headers.location).toBe(`/claims/${claimId}#source-search`);

    const rows = await saved();
    expect(rows).toHaveLength(10);
    expect(rows[0].poster).toBe("@user1.bsky.social");
    expect(rows[9].poster).toBe("@user10.bsky.social");
    expect(rows.every((r) => r.found_by === "bluesky")).toBe(true);

    const page = await agentA.get(`/claims/${claimId}`);
    expect(page.text).toContain("found 15 posts; saved the 10 earliest as observations");
    const again = await agentA.get(`/claims/${claimId}`);
    expect(again.text).not.toContain("found 15 posts"); // shown only once
  });

  it("skips posts already saved, then saves the next earliest", async () => {
    await agentA.post(`/claims/${claimId}/source-search`).type("form").send({ q: "$12 billion" });
    expect(await saved()).toHaveLength(15);
    const page = await agentA.get(`/claims/${claimId}`);
    expect(page.text).toContain("saved the 5 earliest as observations (10 already saved)");
  });

  it("explains a source that isn't set up, without saving anything", async () => {
    const agent = request.agent(brokenApp);
    await agent.post("/login").type("form").send({ email: emails[0], password: "ss-pass-a" });
    await agent.post(`/claims/${claimId}/source-search`).type("form").send({ q: "$12 billion" });
    const page = await agent.get(`/claims/${claimId}`);
    expect(page.text).toContain("Bluesky search isn");
    expect(page.text).toContain("BLUESKY_APP_PASSWORD secrets to turn it on");
    expect(await saved()).toHaveLength(15);
  });

  it("doesn't let another user search into your claim", async () => {
    const res = await agentB.post(`/claims/${claimId}/source-search`).type("form").send({ q: "x" });
    expect(res.status).toBe(404);
  });
});
