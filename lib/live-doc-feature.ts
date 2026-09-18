export function liveDocsEnabled(value = process.env.NEXT_PUBLIC_PI_WEB_LIVE_DOCS): boolean {
  return value !== "0" && value !== "false";
}
