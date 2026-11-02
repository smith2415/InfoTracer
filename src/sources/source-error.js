// A failure from one search source. The message never includes credentials.
//   kind: not_configured | rejected | rate_limited | unavailable
export class SourceError extends Error {
  constructor(kind) {
    super(`Source search failed: ${kind}`);
    this.kind = kind;
  }
}

// Turns an HTTP status into a SourceError kind, or null if the request worked.
export function kindForStatus(status) {
  if (status === 429) return "rate_limited";
  if (status === 400 || status === 401 || status === 403) return "rejected";
  if (status < 200 || status >= 300) return "unavailable";
  return null;
}
