import express from "express";
import { requireLogin } from "./auth.js";
import { fromDateTimeInput } from "./format.js";
import {
  CLAIM_STATUSES,
  createClaim,
  listClaims,
  getClaim,
  updateClaim,
  deleteClaim,
  listObservations,
  getObservation,
  addObservation,
  updateObservation,
  deleteObservation,
  setSeed,
} from "./models.js";

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

export function claimsRouter(pool) {
  const router = express.Router();
  router.use(["/claims", "/observations"], requireLogin);

  // ---------- Claims ----------

  router.get("/claims", async (req, res, next) => {
    try {
      const claims = await listClaims(pool, req.session.userId);
      res.render("claims", { title: "Claims", claims });
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
      res.render("claim", { title: "Claim", claim, observations });
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
      const claim = id && (await updateClaim(pool, req.session.userId, id, claimFields(req.body)));
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
      const observation =
        id && (await addObservation(pool, req.session.userId, id, observationFields(req.body)));
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
      const observation =
        id && (await updateObservation(pool, req.session.userId, id, observationFields(req.body)));
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

  return router;
}
