# Prompt log: Sign up and login (Spine #1)

## Prompt

> "All merged! Please start on Spine #1"

Context Claude worked from: PLAN.md feature 1 ("As a researcher, I want to
create an account and log in and out, so that my claim investigations are
private to me"), the users table in PLAN.md section 3, and the technologies in
section 5 (Node.js with Express, PostgreSQL on Replit, bcrypt, express-session).

## What Claude built

- An Express app with EJS pages, styled in the dark investigation-board design
  from PLAN.md section 6, with the green plant logo.
- A `users` table (id, email, password_hash, created_at), created
  automatically on start.
- Sign up, login and logout pages. Passwords are hashed with bcryptjs; sessions
  are stored in PostgreSQL so logins survive restarts.
- Friendly messages for a blank form, an invalid email, a short password, a
  duplicate email and a wrong password.
- A placeholder "Your claims" page that redirects signed-out visitors to login.
- Five automated checks in `tests/auth.test.js`, all passing against a local
  PostgreSQL database.

## Decisions along the way

- **bcryptjs instead of bcrypt.** Same hashing, but written in plain
  JavaScript, so it installs on Replit without compiling native code.
- **Sessions stored in the database** (connect-pg-simple) instead of in memory,
  because memory sessions are lost whenever Replit restarts the app.
- **Same error for a wrong email or wrong password,** so the login form doesn't
  reveal which emails have accounts.
