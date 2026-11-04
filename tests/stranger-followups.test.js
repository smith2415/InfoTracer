import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createPool, migrate } from "../src/db.js";

// Checks for the stranger test follow-ups: Source search first, tips when a
// search finds nothing, saying where pins go, keeping your place, and the
// "Mark important" button working from the page itself.

const emptySource = {
  name: "bluesky",
  label: "Bluesky",
  search: async () => ({ observations: [], totalFound: 0, reachedEnd: true }),
};
const factCheckSearch = async () => [
  {
    text: "Billionaires will flee the state",
    claimant: "Someone",
    claimDate: "2026-01-02T00:00:00Z",
    reviews: [{ publisher: "Fact Desk", url: "https://factdesk.example/flee", title: "Do billionaires flee?", rating: "Misleading", reviewDate: "2026-01-05T00:00:00Z", language: "en" }],
  },
];

describe("Stranger test follow-ups", () => {
  const pool = createPool(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);
  const app = createApp(pool, { sessionSecret: "test-secret", sources: [emptySource], factCheckSearch });
  const email = `followups-${Date.now()}@example.com`;
  const agent = request.agent(app);
  let claimId;
  let obsId;

  beforeAll(async () => {
    await migrate(pool);
    await agent.post("/signup").type("form").send({ email, password: "followups-pass" });
    const claim = await agent.post("/claims").type("form").send({ claim_text: "Billionaire tax will cause billionaires to flee", hook: "Billionaire tax flight" });
    claimId = Number(claim.headers.location.split("/").pop());
    const obs = await agent.post(`/claims/${claimId}/observations`).type("form").send({ location: "X", poster: "@someone" });
    obsId = Number(obs.headers.location.split("-").pop());
  });

  afterAll(async () => {
    await pool.query("DELETE FROM users WHERE email = $1", [email]);
    await pool.end();
  });

  it("puts Source search before the fact-check lookup", async () => {
    const page = (await agent.get(`/claims/${claimId}`)).text;
    expect(page.indexOf('id="source-search"')).toBeGreaterThan(-1);
    expect(page.indexOf('id="source-search"')).toBeLessThan(page.indexOf('id="pinned-fact-checks"'));
  });

  it("shows search tips when a source finds nothing", async () => {
    let page = (await agent.get(`/claims/${claimId}`)).text;
    expect(page).not.toContain("Not finding it?");
    await agent.post(`/claims/${claimId}/source-search`).type("form").send({ q: "Billionaire tax flight" });
    page = (await agent.get(`/claims/${claimId}`)).text;
    expect(page).toContain("no posts found");
    expect(page).toContain("Not finding it? Try a different phrase");
    expect(page).toContain("Use two to four distinctive words");
  });

  it("says where a pin went, with a link to it", async () => {
    const pin = await agent.post(`/claims/${claimId}/fact-checks/pin`).type("form").send({
      return_to: "results", q: "billionaire tax", url: "https://factdesk.example/flee", publisher: "Fact Desk", title: "Do billionaires flee?",
    });
    expect(pin.headers.location).toBe(`/claims/${claimId}/fact-checks?q=billionaire%20tax&pinned=1`);
    const results = (await agent.get(pin.headers.location)).text;
    expect(results).toContain("Pinned to this claim.");
    expect(results).toContain(`href="/claims/${claimId}#pinned-fact-checks">See your pinned fact-checks`);

    // Without the one-time note, the page still says how many are pinned.
    const later = (await agent.get(`/claims/${claimId}/fact-checks?q=billionaire%20tax`)).text;
    expect(later).toContain("1 fact-check is pinned to this claim.");

    const pinId = Number(later.match(/fact-check-pins\/(\d+)\/unpin/)[1]);
    const unpin = await agent.post(`/fact-check-pins/${pinId}/unpin`).type("form").send({ return_to: "results", unpinning: "1", q: "billionaire tax" });
    expect(unpin.headers.location).toContain("&unpinned=1");
    expect((await agent.get(unpin.headers.location)).text).toContain("Unpinned from this claim.");
  });

  it("returns to the observation after canceling an edit or a delete", async () => {
    const edit = (await agent.get(`/observations/${obsId}/edit`)).text;
    expect(edit).toContain(`href="/claims/${claimId}#observation-${obsId}">Cancel`);
    const add = (await agent.get(`/claims/${claimId}/observations/new`)).text;
    expect(add).toContain(`href="/claims/${claimId}#observations">Cancel`);
    const del = (await agent.get(`/observations/${obsId}/delete`)).text;
    expect(del).toContain(`href="/claims/${claimId}#observation-${obsId}"`);
  });

  it("marks an observation important by using the button on the page", async () => {
    const page = (await agent.get(`/claims/${claimId}`)).text;
    const action = page.match(new RegExp(`action="(/observations/${obsId}/important)"`))[1];
    expect(page).toContain("Mark important");
    const res = await agent.post(action).type("form").send({});
    expect(res.headers.location).toBe(`/claims/${claimId}#observation-${obsId}`);
    const after = (await agent.get(`/claims/${claimId}`)).text;
    expect(after).toContain("Remove important");
    expect(after).toContain('class="flag flag-important">important');
  });

  it("goes back to the list of observations after deleting one", async () => {
    const res = await agent.post(`/observations/${obsId}/delete`).type("form").send({});
    expect(res.headers.location).toBe(`/claims/${claimId}#observations`);
  });
});
