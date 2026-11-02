import express from "express";
import { requireLogin } from "./auth.js";
import { fromDateTimeInput, safeUrl } from "./format.js";
import { validateClaim, validateObservation, hasErrors } from "./validation.js";
import { buildTimeline } from "./timeline.js";
import { FactCheckError, FACT_CHECK_MESSAGES, REASON_HINTS, ratingTone } from "./factcheck.js";
import { searchAllSources, SAVE_PER_SOURCE, urlKey } from "./sources/index.js";
import {
  CLAIM_STATUSES,
  CLAIM_SORTS,
  createClaim,
  listClaims,
  countClaims,
  listLocations,
  getClaim,
  updateClaim,
  deleteClaim,
  listObservations,
  getObservation,
  addObservation,
  updateObservation,
  deleteObservation,
  setSeed,
  addWeed,
  removeWeed,
  listWeeds,
  getDashboardStats,
  listPinnedFactChecks,
  pinFactCheck,
  unpinFactCheck,
} from "./models.js";

// Where to go after marking or unmarking a weed: back to the Weeds view if
// that's where the click came from, otherwise to the observation's claim.
function afterWeed(body, observation) {
  return body.return_to === "weeds"
    ? "/weeds"
    : `/claims/${observation.claim_id}#observation-${observation.id}`;
}

// Turns ":id" into a number, or null for anything that isn't a positive integer.
function idParam(value) {
  return /^\d+$/.test(value) ? Number(value) : null;
}

function notFound(res) {
  return res.status(404).render("message", {
    title: "Not found",
    message: "That claim doesn't exist, or it isn't yours.",
  });
}

function claimFields(body) {
  return {
    claimText: body.claim_text,
    hook: body.hook,
    status: CLAIM_STATUSES.includes(body.status) ? body.status : null,
    notes: body.notes,
  };
}

// What the user typed, so a form with errors comes back filled in.
function claimFromBody(body, id) {
  return {
    id,
    claim_text: body.claim_text || "",
    hook: body.hook || "",
    status: CLAIM_STATUSES.includes(body.status) ? body.status : "tracing",
    notes: body.notes || "",
  };
}

function observationFromBody(body, id) {
  return {
    id,
    observed_at_input: body.observed_at || "",
    location: body.location || "",
    poster: body.poster || "",
    post_text: body.post_text || "",
    url: body.url || "",
    notes: body.notes || "",
  };
}

const ERROR_SUMMARY = "Some details need fixing before this can be saved.";

function observationFields(body) {
  return {
    observedAt: fromDateTimeInput(body.observed_at),
    location: body.location,
    poster: body.poster,
    postText: body.post_text,
    url: body.url,
    notes: body.notes,
  };
}

export function claimsRouter(pool, { factCheckSearch, sources = [] } = {}) {
  const router = express.Router();
  router.use(["/claims", "/observations"], requireLogin);

  // ---------- Claims ----------

  router.get("/claims", async (req, res, next) => {
    try {
      const userId = req.session.userId;
      const filters = {
        q: typeof req.query.q === "string" ? req.query.q.trim().slice(0, 200) : "",
        status: CLAIM_STATUSES.includes(req.query.status) ? req.query.status : "",
        location: typeof req.query.location === "string" ? req.query.location.trim() : "",
        sort: CLAIM_SORTS[req.query.sort] ? req.query.sort : "newest",
      };
      const [claims, total, locations] = await Promise.all([
        listClaims(pool, userId, filters),
        countClaims(pool, userId),
        listLocations(pool, userId),
      ]);
      const filtering = Boolean(filters.q || filters.status || filters.location);
      res.render("claims", {
        title: "Claims",
        claims,
        total,
        filters,
        filtering,
        locations,
        statuses: CLAIM_STATUSES,
        sorts: CLAIM_SORTS,
      });
    } catch (err) {
      next(err);
    }
  });

  router.get("/claims/new", (req, res) => {
    res.render("claim-form", {
      title: "New claim",
      claim: { claim_text: "", hook: "", status: "tracing", notes: "" },
      action: "/claims",
      statuses: CLAIM_STATUSES,
    });
  });

  router.post("/claims", async (req, res, next) => {
    try {
      const errors = validateClaim(req.body);
      if (hasErrors(errors)) {
        return res.status(400).render("claim-form", {
          title: "New claim",
          claim: claimFromBody(req.body),
          action: "/claims",
          statuses: CLAIM_STATUSES,
          errors,
          errorSummary: ERROR_SUMMARY,
        });
      }
      const claim = await createClaim(pool, req.session.userId, claimFields(req.body));
      res.redirect(`/claims/${claim.id}`);
    } catch (err) {
      next(err);
    }
  });

  router.get("/claims/:id", async (req, res, next) => {
    try {
      const id = idParam(req.params.id);
      const claim = id && (await getClaim(pool, req.session.userId, id));
      if (!claim) return notFound(res);
      const observations = await listObservations(pool, req.session.userId, id);
      const timeline = buildTimeline(observations);
      const earliest = timeline.points.find((p) => p.isEarliest);
      for (const o of observations) o.is_earliest = Boolean(earliest && earliest.id === o.id);

      // The result of a source search, shown once after it runs.
      let sourceSearch = null;
      if (req.session.sourceSearch?.claimId === id) {
        sourceSearch = req.session.sourceSearch;
        delete req.session.sourceSearch;
      }
      const pins = await listPinnedFactChecks(pool, req.session.userId, id);
      res.render("claim", {
        title: "Claim",
        claim,
        observations,
        timeline,
        sourceSearch,
        savePerSource: SAVE_PER_SOURCE,
        pins,
        ratingTone,
      });
    } catch (err) {
      next(err);
    }
  });

  // ---------- Source search (Custom #3) ----------

  router.post("/claims/:id/source-search", async (req, res, next) => {
    try {
      const id = idParam(req.params.id);
      const userId = req.session.userId;
      const claim = id && (await getClaim(pool, userId, id));
      if (!claim) return notFound(res);

      const asked = typeof req.body.q === "string" ? req.body.q : claim.hook || claim.claim_text;
      const query = asked.trim().slice(0, 200);
      const summary = { claimId: id, query, sources: [] };

      if (!query) {
        summary.error = "Enter a phrase to search for, such as the claim's hook.";
      } else {
        const outcomes = await searchAllSources(sources, query);
        const saved = new Set(
          (await listObservations(pool, userId, id)).map((o) => urlKey(o.url)).filter(Boolean)
        );

        for (const outcome of outcomes) {
          if (outcome.error) {
            summary.sources.push({ label: outcome.label, error: outcome.error });
            continue;
          }
          const { observations, totalFound, reachedEnd } = outcome.result;
          const fresh = observations.filter((o) => !saved.has(urlKey(o.url)));
          const toSave = fresh.slice(0, SAVE_PER_SOURCE); // the earliest ones
          for (const fields of toSave) {
            await addObservation(pool, userId, id, fields);
            saved.add(urlKey(fields.url));
          }
          summary.sources.push({
            label: outcome.label,
            found: totalFound,
            saved: toSave.length,
            alreadySaved: observations.length - fresh.length,
            reachedEnd,
          });
        }
      }

      req.session.sourceSearch = summary;
      res.redirect(`/claims/${id}#source-search`);
    } catch (err) {
      next(err);
    }
  });

  // ---------- Fact-check lookup (Custom #2) ----------

  router.get("/claims/:id/fact-checks", async (req, res, next) => {
    try {
      const id = idParam(req.params.id);
      const claim = id && (await getClaim(pool, req.session.userId, id));
      if (!claim) return notFound(res);

      const asked = typeof req.query.q === "string" ? req.query.q : claim.hook || claim.claim_text;
      const query = asked.trim().slice(0, 200);
      let results = null;
      let error = null;

      if (!query) {
        error = "Enter a phrase to search for, such as the claim's hook.";
      } else {
        try {
          results = await factCheckSearch(query);
        } catch (err) {
          if (!(err instanceof FactCheckError)) throw err;
          console.warn(err.message); // never includes the API key
          error = FACT_CHECK_MESSAGES[err.kind];
          if (err.reason) {
            error += ` Google's reason: ${err.reason}.`;
            if (REASON_HINTS[err.reason]) error += ` ${REASON_HINTS[err.reason]}`;
          }
        }
      }

      // Which results are already pinned, by link, so each shows Pin or Unpin.
      const pinned = new Map(
        (await listPinnedFactChecks(pool, req.session.userId, id)).map((p) => [urlKey(p.url), p.id])
      );
      res.render("fact-checks", { title: "Fact-checks", claim, query, results, error, ratingTone, pinned, urlKey });
    } catch (err) {
      next(err);
    }
  });

  // Back to the results page the pin came from, or to the claim page.
  function afterPin(body, claimId) {
    if (body.return_to === "results") {
      const q = typeof body.q === "string" ? body.q.slice(0, 200) : "";
      return `/claims/${claimId}/fact-checks?q=${encodeURIComponent(q)}`;
    }
    return `/claims/${claimId}#pinned-fact-checks`;
  }

  router.post("/claims/:id/fact-checks/pin", async (req, res, next) => {
    try {
      const id = idParam(req.params.id);
      const url = safeUrl(req.body.url);
      if (!id) return notFound(res);
      if (!url) {
        return res.status(400).render("message", {
          title: "Can't pin this fact-check",
          message: "This fact-check doesn't have a valid link, so it can't be pinned.",
        });
      }
      const pinned = await pinFactCheck(pool, req.session.userId, id, {
        url,
        publisher: req.body.publisher,
        title: req.body.title,
        rating: req.body.rating,
        reviewDate: req.body.review_date,
        reviewedClaim: req.body.reviewed_claim,
        claimant: req.body.claimant,
      });
      if (!pinned) return notFound(res);
      res.redirect(afterPin(req.body, id));
    } catch (err) {
      next(err);
    }
  });

  router.post("/fact-check-pins/:pinId/unpin", requireLogin, async (req, res, next) => {
    try {
      const pinId = idParam(req.params.pinId);
      const claimId = pinId && (await unpinFactCheck(pool, req.session.userId, pinId));
      if (!claimId) return notFound(res);
      res.redirect(afterPin(req.body, claimId));
    } catch (err) {
      next(err);
    }
  });

  router.get("/claims/:id/edit", async (req, res, next) => {
    try {
      const id = idParam(req.params.id);
      const claim = id && (await getClaim(pool, req.session.userId, id));
      if (!claim) return notFound(res);
      res.render("claim-form", {
        title: "Edit claim",
        claim,
        action: `/claims/${id}`,
        statuses: CLAIM_STATUSES,
      });
    } catch (err) {
      next(err);
    }
  });

  router.post("/claims/:id", async (req, res, next) => {
    try {
      const id = idParam(req.params.id);
      const existing = id && (await getClaim(pool, req.session.userId, id));
      if (!existing) return notFound(res);
      const errors = validateClaim(req.body);
      if (hasErrors(errors)) {
        return res.status(400).render("claim-form", {
          title: "Edit claim",
          claim: claimFromBody(req.body, id),
          action: `/claims/${id}`,
          statuses: CLAIM_STATUSES,
          errors,
          errorSummary: ERROR_SUMMARY,
        });
      }
      const claim = await updateClaim(pool, req.session.userId, id, claimFields(req.body));
      if (!claim) return notFound(res);
      res.redirect(`/claims/${id}`);
    } catch (err) {
      next(err);
    }
  });

  router.get("/claims/:id/delete", async (req, res, next) => {
    try {
      const id = idParam(req.params.id);
      const claim = id && (await getClaim(pool, req.session.userId, id));
      if (!claim) return notFound(res);
      res.render("confirm-delete", {
        title: "Delete claim",
        heading: "Delete this claim?",
        quote: claim.claim_text,
        warning: "This also deletes all of its observations. This can't be undone.",
        action: `/claims/${id}/delete`,
        cancel: `/claims/${id}`,
      });
    } catch (err) {
      next(err);
    }
  });

  router.post("/claims/:id/delete", async (req, res, next) => {
    try {
      const id = idParam(req.params.id);
      const deleted = id && (await deleteClaim(pool, req.session.userId, id));
      if (!deleted) return notFound(res);
      res.redirect("/claims");
    } catch (err) {
      next(err);
    }
  });

  // ---------- Observations ----------

  router.get("/claims/:id/observations/new", async (req, res, next) => {
    try {
      const id = idParam(req.params.id);
      const claim = id && (await getClaim(pool, req.session.userId, id));
      if (!claim) return notFound(res);
      res.render("observation-form", {
        title: "Add observation",
        claim,
        observation: {},
        action: `/claims/${id}/observations`,
      });
    } catch (err) {
      next(err);
    }
  });

  router.post("/claims/:id/observations", async (req, res, next) => {
    try {
      const id = idParam(req.params.id);
      const claim = id && (await getClaim(pool, req.session.userId, id));
      if (!claim) return notFound(res);
      const errors = validateObservation(req.body);
      if (hasErrors(errors)) {
        return res.status(400).render("observation-form", {
          title: "Add observation",
          claim,
          observation: observationFromBody(req.body),
          action: `/claims/${id}/observations`,
          errors,
          errorSummary: ERROR_SUMMARY,
        });
      }
      const observation = await addObservation(pool, req.session.userId, id, observationFields(req.body));
      if (!observation) return notFound(res);
      res.redirect(`/claims/${id}#observation-${observation.id}`);
    } catch (err) {
      next(err);
    }
  });

  router.get("/observations/:id/edit", async (req, res, next) => {
    try {
      const id = idParam(req.params.id);
      const observation = id && (await getObservation(pool, req.session.userId, id));
      if (!observation) return notFound(res);
      const claim = await getClaim(pool, req.session.userId, observation.claim_id);
      res.render("observation-form", {
        title: "Edit observation",
        claim,
        observation,
        action: `/observations/${id}`,
      });
    } catch (err) {
      next(err);
    }
  });

  router.post("/observations/:id", async (req, res, next) => {
    try {
      const id = idParam(req.params.id);
      const existing = id && (await getObservation(pool, req.session.userId, id));
      if (!existing) return notFound(res);
      const errors = validateObservation(req.body);
      if (hasErrors(errors)) {
        const claim = await getClaim(pool, req.session.userId, existing.claim_id);
        return res.status(400).render("observation-form", {
          title: "Edit observation",
          claim,
          observation: observationFromBody(req.body, id),
          action: `/observations/${id}`,
          errors,
          errorSummary: ERROR_SUMMARY,
        });
      }
      const observation = await updateObservation(pool, req.session.userId, id, observationFields(req.body));
      if (!observation) return notFound(res);
      res.redirect(`/claims/${observation.claim_id}#observation-${id}`);
    } catch (err) {
      next(err);
    }
  });

  router.get("/observations/:id/delete", async (req, res, next) => {
    try {
      const id = idParam(req.params.id);
      const observation = id && (await getObservation(pool, req.session.userId, id));
      if (!observation) return notFound(res);
      res.render("confirm-delete", {
        title: "Delete observation",
        heading: "Delete this observation?",
        quote: `${observation.location}${observation.poster ? " · " + observation.poster : ""}`,
        warning: "This can't be undone.",
        action: `/observations/${id}/delete`,
        cancel: `/claims/${observation.claim_id}`,
      });
    } catch (err) {
      next(err);
    }
  });

  router.post("/observations/:id/delete", async (req, res, next) => {
    try {
      const id = idParam(req.params.id);
      const observation = id && (await getObservation(pool, req.session.userId, id));
      if (!observation) return notFound(res);
      await deleteObservation(pool, req.session.userId, id);
      res.redirect(`/claims/${observation.claim_id}`);
    } catch (err) {
      next(err);
    }
  });

  router.post("/observations/:id/seed", async (req, res, next) => {
    try {
      const id = idParam(req.params.id);
      const observation = id && (await getObservation(pool, req.session.userId, id));
      if (!observation) return notFound(res);
      await setSeed(pool, req.session.userId, id);
      res.redirect(`/claims/${observation.claim_id}#observation-${id}`);
    } catch (err) {
      next(err);
    }
  });

  // ---------- Dashboard ----------

  router.get("/dashboard", requireLogin, async (req, res, next) => {
    try {
      const stats = await getDashboardStats(pool, req.session.userId);
      res.render("dashboard", { title: "Dashboard", stats });
    } catch (err) {
      next(err);
    }
  });

  // ---------- Weeds ----------

  router.get("/weeds", requireLogin, async (req, res, next) => {
    try {
      const weeds = await listWeeds(pool, req.session.userId);
      res.render("weeds", { title: "Weeds", weeds });
    } catch (err) {
      next(err);
    }
  });

  router.post("/observations/:id/weed", async (req, res, next) => {
    try {
      const id = idParam(req.params.id);
      const observation = id && (await getObservation(pool, req.session.userId, id));
      if (!observation) return notFound(res);
      await addWeed(pool, req.session.userId, id);
      res.redirect(afterWeed(req.body, observation));
    } catch (err) {
      next(err);
    }
  });

  router.post("/observations/:id/unweed", async (req, res, next) => {
    try {
      const id = idParam(req.params.id);
      const observation = id && (await getObservation(pool, req.session.userId, id));
      if (!observation) return notFound(res);
      await removeWeed(pool, req.session.userId, id);
      res.redirect(afterWeed(req.body, observation));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
