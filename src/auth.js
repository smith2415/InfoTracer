import express from "express";
import bcrypt from "bcryptjs";

const MIN_PASSWORD_LENGTH = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Blocks pages that need a signed-in user.
export function requireLogin(req, res, next) {
  if (!req.session.userId) return res.redirect("/login");
  next();
}

// Saves the session before redirecting, so the next page always sees it.
function startSession(req, res, user, next) {
  req.session.regenerate((err) => {
    if (err) return next(err);
    req.session.userId = user.id;
    req.session.email = user.email;
    req.session.save((saveErr) => {
      if (saveErr) return next(saveErr);
      res.redirect("/claims");
    });
  });
}

export function authRouter(pool) {
  const router = express.Router();

  router.get("/signup", (req, res) => {
    if (req.session.userId) return res.redirect("/claims");
    res.render("signup", { title: "Create account", error: null, email: "" });
  });

  router.post("/signup", async (req, res, next) => {
    const email = (req.body.email || "").trim().toLowerCase();
    const password = req.body.password || "";
    const fail = (error) =>
      res.status(400).render("signup", { title: "Create account", error, email });

    if (!email || !password) return fail("Enter an email and a password.");
    if (!EMAIL_PATTERN.test(email)) return fail("Enter a valid email address.");
    if (password.length < MIN_PASSWORD_LENGTH) {
      return fail(`Use a password of at least ${MIN_PASSWORD_LENGTH} characters.`);
    }

    try {
      const passwordHash = await bcrypt.hash(password, 10);
      const { rows } = await pool.query(
        `INSERT INTO users (email, password_hash) VALUES ($1, $2)
         ON CONFLICT (email) DO NOTHING
         RETURNING id, email`,
        [email, passwordHash]
      );
      if (rows.length === 0) {
        return fail("An account with that email already exists. Log in instead.");
      }
      startSession(req, res, rows[0], next);
    } catch (err) {
      next(err);
    }
  });

  router.get("/login", (req, res) => {
    if (req.session.userId) return res.redirect("/claims");
    res.render("login", { title: "Log in", error: null, email: "" });
  });

  router.post("/login", async (req, res, next) => {
    const email = (req.body.email || "").trim().toLowerCase();
    const password = req.body.password || "";
    const fail = (error) =>
      res.status(401).render("login", { title: "Log in", error, email });

    if (!email || !password) return fail("Enter your email and password.");

    try {
      const { rows } = await pool.query(
        "SELECT id, email, password_hash FROM users WHERE email = $1",
        [email]
      );
      const user = rows[0];
      const valid = user && (await bcrypt.compare(password, user.password_hash));
      // Same message either way, so the form doesn't reveal which emails exist.
      if (!valid) return fail("That email and password don't match an account.");
      startSession(req, res, user, next);
    } catch (err) {
      next(err);
    }
  });

  router.post("/logout", (req, res, next) => {
    req.session.destroy((err) => {
      if (err) return next(err);
      res.clearCookie("infotracer.sid");
      res.redirect("/login");
    });
  });

  return router;
}
