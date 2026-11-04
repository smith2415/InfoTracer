import express from "express";
import { requireLogin } from "./auth.js";
import { countClaims } from "./models.js";

// The part of an email address before the @, used to greet the user.
export function greetingName(email) {
  const name = String(email || "").split("@")[0].trim();
  return name || "there";
}

// The welcome page: what InfoTracer is for, how to use it and how claims are
// stored. It's where people land after signing up or logging in.
export function welcomeRouter(pool) {
  const router = express.Router();

  router.get("/welcome", requireLogin, async (req, res, next) => {
    try {
      const claimCount = await countClaims(pool, req.session.userId);
      res.render("welcome", {
        title: "Welcome",
        name: greetingName(req.session.email),
        claimCount,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
