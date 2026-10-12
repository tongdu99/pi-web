import { getFileName } from "./file-paths";

/** Show the current folder name without losing context during initialization. */
export function getWindowTitle(cwd?: string | null): string {
  const folderName = cwd ? getFileName(cwd) || cwd : null;
  return folderName ? `${folderName} - Pi Web` : "Pi Web";
}
