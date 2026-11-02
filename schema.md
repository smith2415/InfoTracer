# InfoTracer database schema

InfoTracer stores its data in PostgreSQL. The tables are created automatically
when the app starts (see `src/db.js`). Missing details are stored as empty
(NULL) and shown in the app as "-".

## Tables

### users
One row per account.

| Column | Type | Notes |
| --- | --- | --- |
| id | number | Primary key |
| email | text | Required, unique, stored lowercase |
| password_hash | text | Required; a bcrypt hash, never the password itself |
| created_at | date and time | Set automatically |

### claims
The main item: one row per claim under investigation.

| Column | Type | Notes |
| --- | --- | --- |
| id | number | Primary key |
| user_id | number | The owner; links to users.id |
| claim_text | text | Required |
| hook | text | The distinctive phrase to search for, e.g. "$12 billion" |
| status | text | tracing, traced or dead end; starts as tracing |
| notes | text | Up to 2,000 characters |
| created_at | date and time | Set automatically |

### observations
One row per sighting of a claim.

| Column | Type | Notes |
| --- | --- | --- |
| id | number | Primary key |
| claim_id | number | The claim it belongs to; links to claims.id |
| observed_at | date and time | When it was posted; may be blank |
| location | text | Required; the platform, e.g. X, Instagram, a news site |
| poster | text | Account, organization or author; may be blank |
| post_text | text | Exact wording, up to 2,000 characters |
| url | text | Link to the post |
| notes | text | Up to 2,000 characters |
| is_seed | true/false | True for the claim's origin; at most one per claim |
| is_important | true/false | Highlights an observation that matters without being the seed or a weed (a big amplifier, a turning point). Added after the plan |
| found_by | text | bluesky, gdelt, xpoz or manual; starts as manual |
| created_at | date and time | Set automatically |

### weeds
The junction table between users and observations; my version of stars. Each
row means "this user marked this observation as a weed," an observation they
assess as intentionally spreading disinformation. One table for everyone.

| Column | Type | Notes |
| --- | --- | --- |
| user_id | number | Links to users.id |
| observation_id | number | Links to observations.id |
| created_at | date and time | When it was marked; set automatically |

**Primary key:** user_id + observation_id together, so a user can weed an
observation only once.

### pinned_fact_checks
Fact-check articles a user has pinned to a claim from the fact-check lookup.
The details are copied from Google Fact Check Explorer when pinned, so they
stay on the claim even if the search results change later.

| Column | Type | Notes |
| --- | --- | --- |
| id | number | Primary key |
| claim_id | number | The claim it's pinned to; links to claims.id |
| url | text | Required; link to the fact-check article |
| publisher | text | The fact-checking organization |
| title | text | The article's headline |
| rating | text | The fact-checker's rating, e.g. "False" |
| review_date | date and time | When the fact-check was published |
| reviewed_claim | text | The claim as the fact-checker worded it |
| claimant | text | Who the fact-checker says made the claim |
| created_at | date and time | When it was pinned; set automatically |

Each article can be pinned once per claim (claim_id + url is unique).

### session
Created by the login system (connect-pg-simple) to keep users signed in. It
isn't part of the app's own data model.

## How the tables relate

- **users → claims: one-to-many.** Each user owns many claims; each claim has
  exactly one owner.
- **claims → observations: one-to-many.** Each claim has many observations,
  listed oldest first, with blank times at the end.
- **users ↔ observations (through weeds): many-to-many.** A user can weed many
  observations, and the weeds table records each one.
- **claims → pinned_fact_checks: one-to-many.** Each claim can have many
  pinned fact-checks.
- Deleting a user deletes their claims and weeds; deleting a claim deletes its
  observations and pinned fact-checks; deleting an observation deletes its
  weeds.
- Every query in `src/models.js` is filtered by the signed-in user, so no user
  can read or change another user's claims or observations.

```mermaid
erDiagram
    users ||--o{ claims : owns
    claims ||--o{ observations : has
    users ||--o{ weeds : marks
    observations ||--o{ weeds : "marked as"
    claims ||--o{ pinned_fact_checks : "has pinned"
```

## Compared with PLAN.md section 3

**Added after the plan:** `pinned_fact_checks` wasn't in PLAN.md. It came from
using the fact-check lookup: once real results came back, it was clear the
useful ones needed to stay with the claim.


All four tables match the plan's columns, types and keys. A few rules were
added in the database itself to enforce the plan:

- `status` and `found_by` only accept the values listed in the plan.
- `notes` and `post_text` are capped at 2,000 characters.
- `claim_text` and `location` can't be blank.
- A unique index allows only one seed per claim.
- `observed_at` stores a date *and* time, since posts are timestamped to the
  minute.
