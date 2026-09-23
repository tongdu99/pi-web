// Browser-local, session-scoped command errors. These are UI activity, not
// conversation messages: they should survive navigation/reload without entering
// the agent's context or changing the session JSONL file.
export type SessionError = { id: string; message: string; timestamp: number; request?: string };

const PREFIX = "pi-web-session-errors:";
const MAX_ERRORS = 20;

export function readSessionErrors(sessionId: string | null): SessionError[] {
  if (!sessionId || typeof localStorage === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(PREFIX + sessionId) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is SessionError =>
      entry !== null && typeof entry === "object"
      && typeof entry.id === "string" && typeof entry.message === "string"
      && typeof entry.timestamp === "number"
      && (entry.request === undefined || typeof entry.request === "string")
    ).slice(-MAX_ERRORS);
  } catch {
    return [];
  }
}

export function saveSessionErrors(sessionId: string | null, errors: SessionError[]): void {
  if (!sessionId || typeof localStorage === "undefined") return;
  try {
    if (errors.length) localStorage.setItem(PREFIX + sessionId, JSON.stringify(errors.slice(-MAX_ERRORS)));
    else localStorage.removeItem(PREFIX + sessionId);
  } catch {
    // Private browsing or a full storage quota must not prevent error display.
  }
}

export function appendSessionError(errors: SessionError[], error: SessionError): SessionError[] {
  return errors.some((item) => item.id === error.id)
    ? errors
    : [...errors, error].slice(-MAX_ERRORS);
}
