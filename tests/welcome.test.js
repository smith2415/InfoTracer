import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createPool, migrate } from "../src/db.js";
import { greetingName } from "../src/welcome.js";

// Checks for the welcome page (the stranger test fix).

describe("Welcome page", () => {
  const pool = createPool(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);
  const app = createApp(pool, { sessionSecret: "test-secret", sources: [] });
  const stamp = Date.now();
  const email = `austin.tracer${stamp}@example.com`;
  const sneaky = `<b>x${stamp}</b>@example.com`;
  const agent = request.agent(app);

  beforeAll(async () => {
    await migrate(pool);
  });

  afterAll(async () => {
    await pool.query("DELETE FROM users WHERE email = ANY($1)", [[email, sneaky]]);
    await pool.end();
  });

  it("greets people by the part of their email before the @", () => {
    expect(greetingName("austin@berkeley.edu")).toBe("austin");
    expect(greetingName("first.last+news@example.com")).toBe("first.last+news");
    expect(greetingName("")).toBe("there");
  });

  it("is where people land after signing up, and from the logo", async () => {
    const signup = await agent.post("/signup").type("form").send({ email, password: "welcome-pass" });
    expect(signup.headers.location).toBe("/welcome");
    expect((await agent.get("/")).headers.location).toBe("/welcome");
  });

  it("welcomes the user by name and explains the purpose, the steps and storage", async () => {
    const page = await agent.get("/welcome");
    expect(page.status).toBe(200);
    expect(page.text).toContain(`Welcome, <span class="welcome-name">austin.tracer${stamp}</span>`);
    expect(page.text).toContain("Why trace a claim?");
    expect(page.text).toContain("Run Source search");
    expect(page.text).toContain("main tool");
    expect(page.text).toContain("If nothing comes up,");
    expect(page.text).toContain("How your claims are stored");
    expect(page.text).toContain("Private to your account.");
    expect(page.text).toContain('href="/claims/new"');
    expect(page.text).toContain('<a href="/welcome">Home</a>');
  });

  it("offers a link to your claims once you have some", async () => {
    expect((await agent.get("/welcome")).text).not.toContain("Go to your claims");
    await agent.post("/claims").type("form").send({ claim_text: "First claim" });
    expect((await agent.get("/welcome")).text).toContain("Go to your claims (1)");
  });

  it("shows an email with HTML in it as plain text", async () => {
    const other = request.agent(app);
    await other.post("/signup").type("form").send({ email: sneaky, password: "welcome-pass" });
    const page = await other.get("/welcome");
    expect(page.text).toContain(`&lt;b&gt;x${stamp}&lt;/b&gt;`);
    expect(page.text).not.toContain(`<b>x${stamp}</b>`);
  });

  it("needs a login", async () => {
    const res = await request(app).get("/welcome");
    expect(res.headers.location).toBe("/login");
  });
});
