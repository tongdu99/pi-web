import { encodeFilePathForApi } from "./file-paths";
import { getLocalFileUrl } from "./file-viewer-links";
import { getFileExt, isAudioPath, isDocumentPreviewPath, isImagePath } from "./file-types";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

export function getViewerFileApiUrl(filePath: string, type: string, sessionId?: string | null): string {
  const params = new URLSearchParams({ type });
  if (sessionId) params.set("sessionId", sessionId);
  return `/api/files/${encodeFilePathForApi(filePath)}?${params}`;
}

/** Small standalone document: existing file API handles authorization, limits and media. */
export function renderFileViewerHtml({ filePath, sessionId, content, error, nonce }: {
  filePath: string;
  sessionId?: string | null;
  content?: string;
  error?: string;
  nonce: string;
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
  else body = `<div class="source">${(content ?? "").split("\n").map((line, index) => {
    const number = index + 1;
    return `<div class="line" id="L${number}"><a class="number" href="#L${number}" aria-label="Line ${number}">${number}</a><span>${escapeHtml(line) || "\n"}</span></div>`;
  }).join("")}</div>`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>
:root{color-scheme:light dark;--bg:#fff;--text:#222;--muted:#777;--border:#ddd;--selected:#fff0a6;--link:#1769aa}
@media(prefers-color-scheme:dark){:root{--bg:#181818;--text:#ddd;--muted:#999;--border:#444;--selected:#4a421e;--link:#8ab4f8}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:13px system-ui,sans-serif;height:100vh;display:flex;flex-direction:column}
a{color:var(--link)}header{display:flex;align-items:center;gap:16px;padding:8px 16px;border-bottom:1px solid var(--border);flex-shrink:0}header span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}header a{flex-shrink:0}
main{flex:1;min-height:0;overflow:auto}.source{padding:12px 0;min-width:100%;width:max-content;font:13px/1.6 ui-monospace,SFMono-Regular,Consolas,monospace}.line{display:flex;min-height:1.6em}.line span{white-space:pre;padding-right:16px}.number{position:sticky;left:0;flex-shrink:0;min-width:6ch;padding-right:1ch;text-align:right;user-select:none;color:var(--muted);background:var(--bg);text-decoration:none}.selected,.selected .number,.line:target,.line:target .number{background:var(--selected)}
img{display:block;max-width:100%;max-height:100%;margin:auto}audio{display:block;margin:24px auto}iframe{border:0;width:100%;height:100%}p[role=alert]{margin:16px;color:#c44}
</style></head><body>
<header><span title="${title}">${title}</span>${["md", "mdx", "html", "htm"].includes(getFileExt(filePath)) ? `<a href="/viewer/preview?${escapeHtml(previewParams.toString())}">Preview</a>` : ""}<a href="${apiUrl("download")}" download>Download</a><a href="${escapeHtml(getLocalFileUrl(filePath))}" draggable="true">Open</a></header>
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
