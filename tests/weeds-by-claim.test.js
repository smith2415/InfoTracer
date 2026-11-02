import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createPool, migrate } from "../src/db.js";
import { groupWeedsByClaim } from "../src/models.js";

// Checks that the Weeds page groups weeds under their claims.

describe("groupWeedsByClaim", () => {
  it("groups by claim, keeping the newest-first order", () => {
    const weeds = [
      { id: 3, claim_id: 2, claim_text: "Claim B" },
      { id: 2, claim_id: 1, claim_text: "Claim A" },
      { id: 1, claim_id: 2, claim_text: "Claim B" },
    ];
    expect(groupWeedsByClaim(weeds)).toEqual([
      { claimId: 2, claimText: "Claim B", weeds: [weeds[0], weeds[2]] },
      { claimId: 1, claimText: "Claim A", weeds: [weeds[1]] },
    ]);
    expect(groupWeedsByClaim([])).toEqual([]);
  });
});

describe("Weeds page", () => {
  const pool = createPool(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);
  const app = createApp(pool, { sessionSecret: "test-secret", sources: [] });
  const email = `weedgroups-${Date.now()}@example.com`;
  const agent = request.agent(app);

  async function claimWithWeeds(text, posters) {
    const res = await agent.post("/claims").type("form").send({ claim_text: text });
    const claimId = Number(res.headers.location.split("/").pop());
    for (const poster of posters) {
      const obs = await agent.post(`/claims/${claimId}/observations`).type("form").send({ location: "X", poster });
      const obsId = Number(obs.headers.location.split("-").pop());
      await agent.post(`/observations/${obsId}/weed`).type("form").send({});
    }
    return claimId;
  }

  beforeAll(async () => {
    await migrate(pool);
    await agent.post("/signup").type("form").send({ email, password: "weed-groups-pass" });
  });

  afterAll(async () => {
    await pool.query("DELETE FROM users WHERE email = $1", [email]);
    await pool.end();
  });

  it("shows each claim as a heading with its weeds underneath", async () => {
    const first = await claimWithWeeds("Bank lost 12 billion", ["@one", "@two"]);
    const second = await claimWithWeeds("Dam is about to fail", ["@three"]);

    const page = (await agent.get("/weeds")).text;
    expect(page).toContain("(2 claims)");
    // The most recently weeded claim comes first.
    expect(page.indexOf(`href="/claims/${second}">"Dam is about to fail"`)).toBeGreaterThan(-1);
    expect(page.indexOf("Dam is about to fail")).toBeLessThan(page.indexOf("Bank lost 12 billion"));
    // Each claim's weeds sit under its heading, and cards don't repeat the claim.
    const bankSection = page.slice(page.indexOf(`id="weed-group-${first}"`));
    expect(bankSection).toContain("@one");
    expect(bankSection).toContain("@two");
    expect(page).not.toContain('class="evidence-claim"');
  });
});
