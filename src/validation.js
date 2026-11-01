import { MAX_TEXT_LENGTH } from "./models.js";
import { fromDateTimeInput } from "./format.js";

// Each function returns an object of { fieldName: "friendly message" }.
// An empty object means the form is valid.

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === "";
}

function checkLength(errors, field, value, label) {
  const length = String(value || "").length;
  if (length > MAX_TEXT_LENGTH) {
    errors[field] = `Keep ${label} to ${MAX_TEXT_LENGTH.toLocaleString("en-US")} characters or fewer. It's ${length.toLocaleString("en-US")} now.`;
  }
}

export function validateClaim(body) {
  const errors = {};
  if (isBlank(body.claim_text)) {
    errors.claim_text = "Enter the claim you want to trace.";
  }
  checkLength(errors, "notes", body.notes, "notes");
  return errors;
}

export function validateObservation(body) {
  const errors = {};
  if (isBlank(body.location)) {
    errors.location = "Enter where you saw it, such as X, Instagram or a news site.";
  }

  if (!isBlank(body.observed_at)) {
    const time = new Date(fromDateTimeInput(body.observed_at));
    if (Number.isNaN(time.getTime())) {
      errors.observed_at = "Enter a valid date and time, or leave it blank.";
    }
  }

  if (!isBlank(body.url)) {
    let ok = false;
    try {
      const url = new URL(String(body.url).trim());
      ok = url.protocol === "http:" || url.protocol === "https:";
    } catch {
      ok = false;
    }
    if (!ok) errors.url = "Enter a full link starting with https://, or leave it blank.";
  }

  checkLength(errors, "post_text", body.post_text, "the exact wording");
  checkLength(errors, "notes", body.notes, "notes");
  return errors;
}

export function hasErrors(errors) {
  return Object.keys(errors).length > 0;
}
