// Reading and writing claims and observations.
//
// Every function takes the signed-in user's id and only touches that user's
// rows, so one user can never read or change another user's investigations.

export const CLAIM_STATUSES = ["tracing", "traced", "dead end"];
export const SOURCES = ["bluesky", "gdelt", "xpoz", "manual"];
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

export async function deleteObservation(pool, userId, observationId) {
  const { rowCount } = await pool.query(
    `DELETE FROM observations o
      USING claims c
      WHERE o.id = $1 AND o.claim_id = c.id AND c.user_id = $2`,
    [observationId, userId]
  );
  return rowCount > 0;
}

// Makes one observation the claim's seed and clears any previous seed,
// in a single transaction so a claim never ends up with two.
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
      return false;
    }
    await client.query(
      "UPDATE observations SET is_seed = false WHERE claim_id = $1 AND is_seed",
      [rows[0].claim_id]
    );
    await client.query("UPDATE observations SET is_seed = true WHERE id = $1", [observationId]);
    await client.query("COMMIT");
    return true;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ---------- Weeds ----------
// A weed is a user's assessment that an observation is intentionally
// spreading disinformation. Each row in the weeds table means
// "this user marked this observation as a weed."

// Returns false if the observation isn't the user's.
export async function addWeed(pool, userId, observationId) {
  const owned = await getObservation(pool, userId, observationId);
  if (!owned) return false;
  await pool.query(
    `INSERT INTO weeds (user_id, observation_id) VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [userId, observationId]
  );
  return true;
}

export async function removeWeed(pool, userId, observationId) {
  const { rowCount } = await pool.query(
    "DELETE FROM weeds WHERE user_id = $1 AND observation_id = $2",
    [userId, observationId]
  );
  return rowCount > 0;
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
