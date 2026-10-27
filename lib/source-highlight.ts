import { refractor } from "refractor/all";

// Server-side syntax highlighting for the standalone /viewer page. Produces one
// HTML fragment per source line, so the page keeps its per-line anchors.
//
// Cost model: Prism (refractor) grammars cost ~0.5s per MB of code and build a
// full syntax tree in memory, so callers cap them with `maxGrammarBytes`
// (SOURCE_HIGHLIGHT_MAX_BYTES). Log files use a single-pass line tokenizer that
// is roughly linear in input size, so large logs are still colored.

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

// Large logs produce millions of tokens, so keep the markup per token small:
// Prism's redundant "token" class is dropped and single classes go unquoted.
function tokenSpan(classes: string, text: string): string {
  const attribute = classes.includes(" ") ? `"${classes}"` : classes;
  return `<span class=${attribute}>${escapeHtml(text)}</span>`;
}

// Group order is match priority at a given position. Class names reuse Prism's
// log-grammar token names so one stylesheet covers both highlighters.
const LOG_TOKEN_PATTERN = new RegExp([
  /(\b\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:[.,]\d+)?)?(?:Z|[+-]\d{2}(?::?\d{2})?)?)?)/.source, // 1 date/time
  /(\b\d{1,2}:\d{2}:\d{2}(?:[.,]\d+)?\b)/.source, // 2 time
  /(\b(?:FATAL|CRITICAL|CRIT|ERROR|ERR|SEVERE|EMERG|ALERT|FAIL|FAILED|FAILURE)\b)/.source, // 3 error level
  /(\b(?:WARNING|WARN)\b)/.source, // 4 warning level
  /(\b(?:INFO|NOTICE)\b)/.source, // 5 info level
  /(\b(?:DEBUG|TRACE|VERBOSE|FINE|FINER|FINEST)\b)/.source, // 6 debug level
  /(\b(?:[A-Za-z_$][\w$]*\.)*[A-Z][\w$]*(?:Exception|Error)\b)/.source, // 7 exception
  /(\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>]+)/.source, // 8 url
  /(\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b)/.source, // 9 uuid
  /("(?:[^"\\]|\\.)*")/.source, // 10 string
  /(\b(?:true|false|True|False|TRUE|FALSE|null|NULL|None|nil|undefined)\b)/.source, // 11 boolean/null
  /(\b0x[0-9a-fA-F]+\b|\b\d+(?:\.\d+)*\b)/.source, // 12 number / ip / version
  /([A-Za-z_][\w.-]*)(?==)/.source, // 13 key=value property
].join("|"), "g");

const LOG_GROUP_CLASSES = [
  "date",
  "time",
  "level error",
  "level warning",
  "level info",
  "level debug",
  "exception",
  "url",
  "uuid",
  "string",
  "boolean",
  "number",
  "property",
];

export function highlightLogLine(line: string): string {
  let html = "";
  let last = 0;
  LOG_TOKEN_PATTERN.lastIndex = 0;
  for (let match = LOG_TOKEN_PATTERN.exec(line); match; match = LOG_TOKEN_PATTERN.exec(line)) {
    if (match[0].length === 0) {
      LOG_TOKEN_PATTERN.lastIndex += 1;
      continue;
    }
    let group = 1;
    while (match[group] === undefined) group += 1;
    if (match.index > last) html += escapeHtml(line.slice(last, match.index));
    html += tokenSpan(LOG_GROUP_CLASSES[group - 1], match[0]);
    last = match.index + match[0].length;
  }
  return last === 0 ? escapeHtml(line) : html + escapeHtml(line.slice(last));
}

interface HastNode {
  type: string;
  value?: string;
  properties?: { className?: unknown };
  children?: HastNode[];
}

/** Flatten a refractor tree into per-line HTML, splitting tokens that span lines. */
function hastToLines(root: HastNode): string[] {
  const lines: string[] = [""];
  const visit = (node: HastNode, classes: string) => {
    if (node.type === "text") {
      const parts = (node.value ?? "").split("\n");
      parts.forEach((part, index) => {
        if (index > 0) lines.push("");
        if (part) lines[lines.length - 1] += classes ? tokenSpan(classes, part) : escapeHtml(part);
      });
      return;
    }
    const own = node.properties?.className;
    const nextClasses = Array.isArray(own) && own.length > 0
      ? own.filter((name) => name !== "token").join(" ")
      : classes;
    for (const child of node.children ?? []) visit(child, nextClasses);
  };
  visit(root, "");
  return lines;
}

/**
 * Highlight `content` for the standalone viewer. Returns one HTML fragment per
 * line, or null when the file should be rendered as plain escaped text.
 */
export function highlightSourceLines(
  content: string,
  language: string,
  byteSize: number,
  maxGrammarBytes: number,
): string[] | null {
  if (language === "log") return content.split("\n").map(highlightLogLine);
  if (!language || language === "text" || byteSize > maxGrammarBytes) return null;
  if (!refractor.registered(language)) return null;
  try {
    return hastToLines(refractor.highlight(content, language) as HastNode);
  } catch {
    return null;
  }
}
