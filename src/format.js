// Display helpers available in every page.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Missing details are stored blank and shown as "-".
export function dash(value) {
  if (value === null || value === undefined) return "-";
  const text = String(value).trim();
  return text === "" ? "-" : text;
}

// Times are stored and shown in UTC, matching how platforms timestamp posts.
export function formatDateTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  const pad = (n) => String(n).padStart(2, "0");
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

export function formatDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

// Value for an <input type="datetime-local">, in UTC.
export function toDateTimeInput(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 16);
}

// Only http(s) links are made clickable, so a pasted "javascript:" link
// can never run in the page.
export function safeUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(String(value).trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

// A datetime-local value has no time zone; treat it as UTC.
export function fromDateTimeInput(value) {
  if (!value || !String(value).trim()) return null;
  const text = String(value).trim();
  if (/([zZ]|[+-]\d{2}:?\d{2})$/.test(text)) return text;
  return /T\d{2}:\d{2}$/.test(text) ? `${text}:00Z` : `${text}Z`;
}
