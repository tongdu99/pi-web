import { encodeFilePathForApi } from "./file-paths";
import { getLocalFileUrl } from "./file-viewer-links";
import { SOURCE_HIGHLIGHT_MAX_BYTES, getFileExt, isAudioPath, isDocumentPreviewPath, isImagePath } from "./file-types";
import { highlightSourceLines } from "./source-highlight";

// Lines are grouped so the browser can skip layout/paint of off-screen groups
// (content-visibility). Every line is exactly one row tall (no wrapping), so
// the reserved height is exact and scroll positions/anchors stay stable.
const LINES_PER_CHUNK = 200;
const LINE_HEIGHT_PX = 20.8; // 13px * 1.6

function renderSourceLines(lineHtml: string[]): string {
  let html = "";
  for (let start = 0; start < lineHtml.length; start += LINES_PER_CHUNK) {
    const end = Math.min(start + LINES_PER_CHUNK, lineHtml.length);
    html += `<div class="chunk" style="contain-intrinsic-block-size:auto ${((end - start) * LINE_HEIGHT_PX).toFixed(1)}px">`;
    for (let index = start; index < end; index++) {
      const number = index + 1;
      html += `<div class="line" id="L${number}"><a class="gutter" href="#L${number}" aria-label="Line ${number}">${number}</a><span class="code">${lineHtml[index] || "\n"}</span></div>`;
    }
    html += "</div>";
  }
  return html;
}

/** Markdown opens rendered unless the URL targets source lines or asks for source. */
function isMarkdownPath(filePath: string): boolean {
  return ["md", "mdx"].includes(getFileExt(filePath));
}

const LIGHT_THEME_VARS = "--bg:#fff;--text:#222;--muted:#777;--border:#ddd;--selected:#fff0a6;--link:#1769aa;--t-comment:#008000;--t-keyword:#0000ff;--t-string:#a31515;--t-number:#098658;--t-function:#795e26;--t-type:#267f99;--t-property:#001080;--t-error:#cd3131;--t-warning:#b07800;--t-info:#0451a5";
const DARK_THEME_VARS = "--bg:#181818;--text:#ddd;--muted:#999;--border:#444;--selected:#4a421e;--link:#8ab4f8;--t-comment:#6a9955;--t-keyword:#569cd6;--t-string:#ce9178;--t-number:#b5cea8;--t-function:#dcdcaa;--t-type:#4ec9b0;--t-property:#9cdcfe;--t-error:#f48771;--t-warning:#cca700;--t-info:#3794ff";

export type FileViewerTheme = "light" | "dark";

/** Follow the OS by default; the in-app embed passes pi-web's own theme. */
function themeCss(theme?: FileViewerTheme): string {
  if (theme === "light") return `:root{color-scheme:light;${LIGHT_THEME_VARS}}`;
  if (theme === "dark") return `:root{color-scheme:dark;${DARK_THEME_VARS}}`;
  return `:root{color-scheme:light dark;${LIGHT_THEME_VARS}}\n@media(prefers-color-scheme:dark){:root{${DARK_THEME_VARS}}}`;
}

function inlineScriptString(value: string): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

export function getViewerFileApiUrl(filePath: string, type: string, sessionId?: string | null): string {
  const params = new URLSearchParams({ type });
  if (sessionId) params.set("sessionId", sessionId);
  return `/api/files/${encodeFilePathForApi(filePath)}?${params}`;
}

/** Small standalone document: existing file API handles authorization, limits and media. */
export function renderFileViewerHtml({
  filePath, sessionId, content, language = "text", size, error, nonce, forceSource = false, theme, embedded = false,
}: {
  filePath: string;
  sessionId?: string | null;
  content?: string;
  /** Language reported by the file API; drives syntax highlighting. */
  language?: string;
  /** File size in bytes; large non-log files are rendered without highlighting. */
  size?: number;
  error?: string;
  nonce: string;
  /** Show markdown source instead of redirecting to the rendered preview. */
  forceSource?: boolean;
  /** Force a color theme instead of following the OS preference. */
  theme?: FileViewerTheme;
  /** Embedded in pi-web's file panel, which already has its own toolbar. */
  embedded?: boolean;
}): string {
  const apiUrl = (type: string) => escapeHtml(getViewerFileApiUrl(filePath, type, sessionId));
  const title = escapeHtml(filePath);
  const previewParams = new URLSearchParams({ path: filePath });
  if (sessionId) previewParams.set("sessionId", sessionId);
  let body: string;
  if (error) body = `<p role="alert">${escapeHtml(error)}</p>`;
  else if (isImagePath(filePath)) body = `<img src="${apiUrl("read")}" alt="${title}">`;
  else if (isAudioPath(filePath)) body = `<audio controls src="${apiUrl("read")}"></audio>`;
  else if (isDocumentPreviewPath(filePath)) body = `<iframe title="${title}" src="${apiUrl(getFileExt(filePath) === "docx" ? "preview" : "read")}"></iframe>`;
  else {
    const text = content ?? "";
    const lineHtml = highlightSourceLines(text, language, size ?? text.length, SOURCE_HIGHLIGHT_MAX_BYTES)
      ?? text.split("\n").map(escapeHtml);
    body = `<div class="source">${renderSourceLines(lineHtml)}</div>`;
  }
  const previewUrl = `/viewer/preview?${previewParams.toString()}`;
  // Runs before the body is parsed, so the source view never flashes. A line
  // fragment (#L12) means the link targets source lines, so it stays here.
  const previewRedirect = !error && !forceSource && isMarkdownPath(filePath)
    ? `<script nonce="${escapeHtml(nonce)}">if(!/^#L\\d/i.test(location.hash))location.replace(${inlineScriptString(previewUrl)})</script>`
    : "";

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>${previewRedirect}
<style>
${themeCss(theme)}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:13px system-ui,sans-serif;height:100vh;display:flex;flex-direction:column}
a{color:var(--link)}header{display:flex;align-items:center;gap:16px;padding:8px 16px;border-bottom:1px solid var(--border);flex-shrink:0}header span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}header a{flex-shrink:0}
main{flex:1;min-height:0;overflow:auto}.source{padding:12px 0;min-width:100%;width:max-content;font:13px/1.6 ui-monospace,SFMono-Regular,Consolas,monospace}.chunk{content-visibility:auto}.line{display:flex;height:1.6em}.code{white-space:pre;padding-right:16px}.gutter{position:sticky;left:0;flex-shrink:0;min-width:6ch;padding-right:1ch;text-align:right;user-select:none;color:var(--muted);background:var(--bg);text-decoration:none}.selected,.selected .gutter,.line:target,.line:target .gutter{background:var(--selected)}
.code .comment,.code .prolog,.code .doctype,.code .cdata{color:var(--t-comment);font-style:italic}.code .keyword,.code .boolean,.code .atrule,.code .important,.code .tag{color:var(--t-keyword)}.code .string,.code .char,.code .attr-value,.code .regex,.code .inserted{color:var(--t-string)}.code .number,.code .constant,.code .symbol{color:var(--t-number)}.code .function{color:var(--t-function)}.code .class-name,.code .builtin,.code .selector{color:var(--t-type)}.code .property,.code .attr-name,.code .variable,.code .parameter{color:var(--t-property)}.code .deleted{color:var(--t-error)}
.code .date,.code .time{color:var(--t-type)}.code .level{font-weight:600}.code .error,.code .exception{color:var(--t-error)}.code .warning{color:var(--t-warning)}.code .info{color:var(--t-info)}.code .debug,.code .trace{color:var(--muted)}.code .url,.code .uuid,.code .hash{color:var(--t-function)}.code .url{text-decoration:underline}
img{display:block;max-width:100%;max-height:100%;margin:auto}audio{display:block;margin:24px auto}iframe{border:0;width:100%;height:100%}p[role=alert]{margin:16px;color:#c44}
</style></head><body>
${embedded ? "" : `<header><span title="${title}">${title}</span>${["md", "mdx", "html", "htm"].includes(getFileExt(filePath)) ? `<a href="/viewer/preview?${escapeHtml(previewParams.toString())}">Preview</a>` : ""}<a href="${apiUrl("download")}" download>Download</a><a href="${escapeHtml(getLocalFileUrl(filePath))}" draggable="true">Open</a></header>`}
<main>${body}</main>
<script nonce="${escapeHtml(nonce)}">
function reveal(){
  document.querySelectorAll('.selected').forEach(function(line){line.classList.remove('selected')});
  var match=/^#L(\\d+)(?:-L?(\\d+))?$/i.exec(location.hash);if(!match)return;
  var lines=document.querySelectorAll('.line'),start=Number(match[1]),end=Number(match[2]||match[1]);
  if(!Number.isSafeInteger(start)||start<1)return;
  end=Number.isSafeInteger(end)&&end>=start?Math.min(end,lines.length):start;
  for(var n=start;n<=end;n++){if(lines[n-1])lines[n-1].classList.add('selected')}
  var target=lines[Math.min(start,lines.length)-1];if(target)target.scrollIntoView({block:'center'});
}
addEventListener('hashchange',reveal);reveal();
</script></body></html>`;
}
