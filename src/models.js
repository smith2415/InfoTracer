// Reading and writing claims and observations.
//
// Every function takes the signed-in user's id and only touches that user's
// rows, so one user can never read or change another user's investigations.

export const CLAIM_STATUSES = ["tracing", "traced", "dead end"];
export const MAX_TEXT_LENGTH = 2000;

// Empty strings are stored as NULL so missing details stay blank (and are
// shown as "-") instead of breaking sorting.
function blank(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

// ---------- Claims ----------

export async function createClaim(pool, userId, { claimText, hook, status, notes }) {
  const { rows } = await pool.query(
    `INSERT INTO claims (user_id, claim_text, hook, status, notes)
     VALUES ($1, $2, $3, COALESCE($4, 'tracing'), $5)
     RETURNING *`,
    [userId, blank(claimText), blank(hook), blank(status), blank(notes)]
  );
  return rows[0];
}

// Each claim comes with its observation count and earliest observation time.
// Sort options for the claims list. Only these keys are accepted, so the
// ORDER BY clause never contains anything a user typed.
export const CLAIM_SORTS = {
  newest: { label: "Newest first", orderBy: "c.created_at DESC, c.id DESC" },
  oldest: { label: "Oldest first", orderBy: "c.created_at ASC, c.id ASC" },
  earliest: {
    label: "Earliest observation",
    orderBy: "earliest_observed_at ASC NULLS LAST, c.created_at DESC",
  },
  most: {
    label: "Most observations",
    orderBy: "observation_count DESC, c.created_at DESC",
  },
};

// Escapes % and _ so a search for "100%" matches the text "100%" literally.
function likePattern(text) {
  return `%${text.replace(/[\\%_]/g, (ch) => "\\" + ch)}%`;
}

// Optional filters:
//   q        - text to find in the claim, its hook or its notes
//   status   - tracing / traced / dead end
//   location - claims with at least one observation at this location
//   sort     - a key of CLAIM_SORTS (defaults to newest)
export async function listClaims(pool, userId, { q, status, location, sort } = {}) {
  const where = ["c.user_id = $1"];
  const params = [userId];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replaceAll("?", `$${params.length}`));
  };

  const search = (q || "").trim();
  if (search) {
    add(
      "(c.claim_text ILIKE ? OR c.hook ILIKE ? OR c.notes ILIKE ?)",
      likePattern(search)
    );
  }
  if (CLAIM_STATUSES.includes(status)) add("c.status = ?", status);
  const place = (location || "").trim();
  if (place) {
    add(
      "EXISTS (SELECT 1 FROM observations lo WHERE lo.claim_id = c.id AND lower(lo.location) = lower(?))",
      place
    );
  }

  const order = (CLAIM_SORTS[sort] || CLAIM_SORTS.newest).orderBy;
  const { rows } = await pool.query(
    `SELECT c.*,
            COUNT(o.id)::int     AS observation_count,
            MIN(o.observed_at)   AS earliest_observed_at
       FROM claims c
       LEFT JOIN observations o ON o.claim_id = c.id
      WHERE ${where.join(" AND ")}
      GROUP BY c.id
      ORDER BY ${order}`,
    params
  );
  return rows;
}

export async function countClaims(pool, userId) {
  const { rows } = await pool.query(
    "SELECT COUNT(*)::int AS count FROM claims WHERE user_id = $1",
    [userId]
  );
  return rows[0].count;
}

// The distinct locations in a user's observations, for the location filter.
export async function listLocations(pool, userId) {
  const { rows } = await pool.query(
    `SELECT MIN(o.location) AS location
       FROM observations o
       JOIN claims c ON c.id = o.claim_id
      WHERE c.user_id = $1
      GROUP BY lower(o.location)
      ORDER BY lower(MIN(o.location))`,
    [userId]
  );
  return rows.map((r) => r.location);
}

// Returns null if the claim doesn't exist or belongs to someone else.
export async function getClaim(pool, userId, claimId) {
  const { rows } = await pool.query(
    "SELECT * FROM claims WHERE id = $1 AND user_id = $2",
    [claimId, userId]
  );
  return rows[0] || null;
}

export async function updateClaim(pool, userId, claimId, { claimText, hook, status, notes }) {
  const { rows } = await pool.query(
    `UPDATE claims
        SET claim_text = $3, hook = $4, status = COALESCE($5, status), notes = $6
      WHERE id = $1 AND user_id = $2
      RETURNING *`,
    [claimId, userId, blank(claimText), blank(hook), blank(status), blank(notes)]
  );
  return rows[0] || null;
}

// Deleting a claim also deletes its observations (ON DELETE CASCADE).
export async function deleteClaim(pool, userId, claimId) {
  const { rowCount } = await pool.query(
    "DELETE FROM claims WHERE id = $1 AND user_id = $2",
    [claimId, userId]
  );
  return rowCount > 0;
}

// ---------- Observations ----------

// Oldest first; observations without a time go to the end until filled in.
export async function listObservations(pool, userId, claimId) {
  const { rows } = await pool.query(
    `SELECT o.*,
            EXISTS (
              SELECT 1 FROM weeds w WHERE w.observation_id = o.id AND w.user_id = $2
            ) AS is_weed
       FROM observations o
       JOIN claims c ON c.id = o.claim_id
      WHERE o.claim_id = $1 AND c.user_id = $2
      ORDER BY o.observed_at ASC NULLS LAST, o.id ASC`,
    [claimId, userId]
  );
  return rows;
}

export async function getObservation(pool, userId, observationId) {
  const { rows } = await pool.query(
    `SELECT o.*
       FROM observations o
       JOIN claims c ON c.id = o.claim_id
      WHERE o.id = $1 AND c.user_id = $2`,
    [observationId, userId]
  );
  return rows[0] || null;
}

// Returns null if the claim isn't the user's.
export async function addObservation(pool, userId, claimId, fields) {
  const { rows } = await pool.query(
    `INSERT INTO observations
       (claim_id, observed_at, location, poster, post_text, url, notes, found_by)
     SELECT c.id, $3, $4, $5, $6, $7, $8, COALESCE($9, 'manual')
       FROM claims c
      WHERE c.id = $1 AND c.user_id = $2
     RETURNING *`,
    [
      claimId,
      userId,
      blank(fields.observedAt),
      blank(fields.location),
      blank(fields.poster),
      blank(fields.postText),
      blank(fields.url),
      blank(fields.notes),
      blank(fields.foundBy),
    ]
  );
  return rows[0] || null;
}

// Saves many observations at once (from a source search) in one database
// write. Returns how many were saved: 0 if the claim isn't the user's.
export async function addObservations(pool, userId, claimId, list) {
  if (list.length === 0) return 0;
  const column = (key) => list.map((fields) => blank(fields[key]));
  const { rowCount } = await pool.query(
    `INSERT INTO observations
       (claim_id, observed_at, location, poster, post_text, url, notes, found_by)
     SELECT c.id, x.observed_at, x.location, x.poster, x.post_text, x.url, x.notes,
            COALESCE(x.found_by, 'manual')
       FROM claims c,
            unnest($3::timestamptz[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[], $9::text[])
              AS x(observed_at, location, poster, post_text, url, notes, found_by)
      WHERE c.id = $1 AND c.user_id = $2`,
    [
      claimId,
      userId,
      column("observedAt"),
      column("location"),
      column("poster"),
      column("postText"),
      column("url"),
      column("notes"),
      column("foundBy"),
    ]
  );
  return rowCount;
}

// Just the links already saved on a claim, for spotting duplicates.
export async function listObservationUrls(pool, userId, claimId) {
  const { rows } = await pool.query(
    `SELECT o.url
       FROM observations o
       JOIN claims c ON c.id = o.claim_id
      WHERE o.claim_id = $1 AND c.user_id = $2 AND o.url IS NOT NULL`,
    [claimId, userId]
  );
  return rows.map((r) => r.url);
}

export async function updateObservation(pool, userId, observationId, fields) {
  const { rows } = await pool.query(
    `UPDATE observations o
        SET observed_at = $3, location = $4, poster = $5,
            post_text = $6, url = $7, notes = $8
       FROM claims c
      WHERE o.id = $1 AND o.claim_id = c.id AND c.user_id = $2
      RETURNING o.*`,
    [
      observationId,
      userId,
      blank(fields.observedAt),
      blank(fields.location),
      blank(fields.poster),
      blank(fields.postText),
      blank(fields.url),
      blank(fields.notes),
    ]
  );
  return rows[0] || null;
}

// Returns the deleted observation's claim id, or null if it isn't the user's.
export async function deleteObservation(pool, userId, observationId) {
  const { rows } = await pool.query(
    `DELETE FROM observations o
      USING claims c
      WHERE o.id = $1 AND o.claim_id = c.id AND c.user_id = $2
      RETURNING o.claim_id`,
    [observationId, userId]
  );
  return rows[0]?.claim_id ?? null;
}

// Makes one observation the claim's seed and clears any previous seed,
// in a single transaction so a claim never ends up with two.
// Returns the claim id, or null if the observation isn't the user's.
export async function setSeed(pool, userId, observationId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT o.claim_id
         FROM observations o
         JOIN claims c ON c.id = o.claim_id
        WHERE o.id = $1 AND c.user_id = $2`,
      [observationId, userId]
    );
    if (rows.length === 0) {
      await client.query("ROLLBACK");
      return null;
    }
    await client.query(
      "UPDATE observations SET is_seed = false WHERE claim_id = $1 AND is_seed",
      [rows[0].claim_id]
    );
    await client.query("UPDATE observations SET is_seed = true WHERE id = $1", [observationId]);
    await client.query("COMMIT");
    return rows[0].claim_id;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// Marks or unmarks an observation as important: worth highlighting without
// being the seed or a weed. Returns the claim id, or null if the observation
// isn't the user's.
export async function setImportant(pool, userId, observationId, important) {
  const { rows } = await pool.query(
    `UPDATE observations o
        SET is_important = $3
       FROM claims c
      WHERE o.id = $1 AND o.claim_id = c.id AND c.user_id = $2
      RETURNING o.claim_id`,
    [observationId, userId, Boolean(important)]
  );
  return rows[0]?.claim_id ?? null;
}

// ---------- Weeds ----------
// A weed is a user's assessment that an observation is intentionally
// spreading disinformation. Each row in the weeds table means
// "this user marked this observation as a weed."

// Both check the observation is the user's and change the weed in a single
// query. They return the observation's claim id, or null if it isn't the
// user's (in which case nothing changes).
export async function addWeed(pool, userId, observationId) {
  const { rows } = await pool.query(
    `WITH owned AS (
       SELECT o.id, o.claim_id
         FROM observations o
         JOIN claims c ON c.id = o.claim_id
        WHERE o.id = $1 AND c.user_id = $2
     ), added AS (
       INSERT INTO weeds (user_id, observation_id)
       SELECT $2, id FROM owned
       ON CONFLICT DO NOTHING
     )
     SELECT claim_id FROM owned`,
    [observationId, userId]
  );
  return rows[0]?.claim_id ?? null;
}

export async function removeWeed(pool, userId, observationId) {
  const { rows } = await pool.query(
    `WITH owned AS (
       SELECT o.id, o.claim_id
         FROM observations o
         JOIN claims c ON c.id = o.claim_id
        WHERE o.id = $1 AND c.user_id = $2
     ), removed AS (
       DELETE FROM weeds w
        USING owned
        WHERE w.observation_id = owned.id AND w.user_id = $2
     )
     SELECT claim_id FROM owned`,
    [observationId, userId]
  );
  return rows[0]?.claim_id ?? null;
}

// Every observation the user has weeded, with its claim, newest weed first.
export async function listWeeds(pool, userId) {
  const { rows } = await pool.query(
    `SELECT o.*, true AS is_weed, w.created_at AS weeded_at,
            c.id AS claim_id, c.claim_text
       FROM weeds w
       JOIN observations o ON o.id = w.observation_id
       JOIN claims c ON c.id = o.claim_id
      WHERE w.user_id = $1 AND c.user_id = $1
      ORDER BY w.created_at DESC, o.id DESC`,
    [userId]
  );
  return rows;
}

// Groups weeds (from listWeeds) under their claims. Claims come in order of
// their most recent weed, and each claim's weeds stay newest first.
export function groupWeedsByClaim(weeds) {
  const groups = new Map();
  for (const weed of weeds) {
    if (!groups.has(weed.claim_id)) {
      groups.set(weed.claim_id, { claimId: weed.claim_id, claimText: weed.claim_text, weeds: [] });
    }
    groups.get(weed.claim_id).weeds.push(weed);
  }
  return [...groups.values()];
}

// ---------- Dashboard ----------

// Share of observations marked as weeds, as a whole-number percentage.
// Returns null when there are no observations yet (nothing to divide by).
export function weedShare(weedCount, observationCount) {
  if (!observationCount) return null;
  return Math.round((weedCount / observationCount) * 100);
}

export async function getDashboardStats(pool, userId) {
  const [counts, topSeed, weedsByLocation] = await Promise.all([
    pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM claims WHERE user_id = $1) AS total_claims,
         (SELECT COUNT(*)::int FROM claims WHERE user_id = $1 AND status = 'traced') AS traced_claims,
         (SELECT COUNT(*)::int FROM observations o JOIN claims c ON c.id = o.claim_id
           WHERE c.user_id = $1) AS observation_count,
         (SELECT COUNT(*)::int FROM weeds w
            JOIN observations o ON o.id = w.observation_id
            JOIN claims c ON c.id = o.claim_id
           WHERE w.user_id = $1 AND c.user_id = $1) AS weed_count`,
      [userId]
    ),
    // Where seeds (origins) most often appear. Locations are grouped
    // ignoring case, so "x" and "X" count together.
    pool.query(
      `SELECT MIN(o.location) AS location, COUNT(*)::int AS count
         FROM observations o JOIN claims c ON c.id = o.claim_id
        WHERE c.user_id = $1 AND o.is_seed
        GROUP BY lower(o.location)
        ORDER BY count DESC, lower(MIN(o.location))
        LIMIT 1`,
      [userId]
    ),
    pool.query(
      `SELECT MIN(o.location) AS location, COUNT(*)::int AS count
         FROM weeds w
         JOIN observations o ON o.id = w.observation_id
         JOIN claims c ON c.id = o.claim_id
        WHERE w.user_id = $1 AND c.user_id = $1
        GROUP BY lower(o.location)
        ORDER BY count DESC, lower(MIN(o.location))`,
      [userId]
    ),
  ]);

  const c = counts.rows[0];
  return {
    totalClaims: c.total_claims,
    tracedClaims: c.traced_claims,
    observationCount: c.observation_count,
    weedCount: c.weed_count,
    weedShare: weedShare(c.weed_count, c.observation_count),
    topSeedLocation: topSeed.rows[0] || null,
    weedsByLocation: weedsByLocation.rows,
  };
}

// ---------- Pinned fact-checks ----------
// Fact-check articles from the lookup that a user keeps on a claim's page.

function clip(value, max) {
  const text = blank(value);
  return text === null ? null : text.slice(0, max);
}

function validDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export async function listPinnedFactChecks(pool, userId, claimId) {
  const { rows } = await pool.query(
    `SELECT p.*
       FROM pinned_fact_checks p
       JOIN claims c ON c.id = p.claim_id
      WHERE p.claim_id = $1 AND c.user_id = $2
      ORDER BY p.review_date DESC NULLS LAST, p.created_at DESC`,
    [claimId, userId]
  );
  return rows;
}

// Pins a fact-check to the user's claim. Pinning the same article twice
// keeps one pin. Returns false if the claim isn't the user's.
export async function pinFactCheck(pool, userId, claimId, fields) {
  // Checks ownership and pins in one query.
  const { rows } = await pool.query(
    `WITH owned AS (
       SELECT id FROM claims WHERE id = $1 AND user_id = $9
     ), pinned AS (
       INSERT INTO pinned_fact_checks
         (claim_id, url, publisher, title, rating, review_date, reviewed_claim, claimant)
       SELECT id, $2::text, $3::text, $4::text, $5::text, $6::timestamptz, $7::text, $8::text FROM owned
       ON CONFLICT (claim_id, url) DO NOTHING
     )
     SELECT EXISTS (SELECT 1 FROM owned) AS ok`,
    [
      claimId,
      fields.url,
      clip(fields.publisher, 200),
      clip(fields.title, 500),
      clip(fields.rating, 100),
      validDate(fields.reviewDate),
      clip(fields.reviewedClaim, 1000),
      clip(fields.claimant, 200),
      userId,
    ]
  );
  return rows[0].ok;
}

// Returns the pin's claim id, or null if the pin isn't the user's.
export async function unpinFactCheck(pool, userId, pinId) {
  const { rows } = await pool.query(
    `DELETE FROM pinned_fact_checks p
      USING claims c
      WHERE p.id = $1 AND p.claim_id = c.id AND c.user_id = $2
      RETURNING p.claim_id`,
    [pinId, userId]
  );
  return rows[0]?.claim_id ?? null;
}
