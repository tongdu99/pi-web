# Merge notes — fork `main` ← `agegr/main` (v0.8.11)

## Decisions taken

- **Strategy: cherry-pick, not merge.** Branch `backport/upstream-fixes` holds 8
  clean picks (2 critical, 6 low-risk). Full merge abandoned — 18 conflicted
  files for features we mostly do not want.
- **Settings UI: take theirs**, re-apply size via `ConfigPanelShell height="35vh"`.
- **Pagination (`68cd261`): SKIP.** Sessions open and scroll fast here; 940
  entries max, one 12 MB file out of 120. Upstream fixed it for much larger
  sessions (#509, #555). Optional standalone salvage: the string-assistant-content
  guard in `lib/session-reader.ts` (~5 lines, prevents a 500 on odd entries).
  Not the BranchNavigator recursion rewrite.
- **Subagents / web push / zh-TW / PowerShell toggle: skip.**
- **System prompt:** base design (inline panel) preferred; our file-tab variant
  to be reverted on `cleanup/system-prompt-original`.
- **Worktree cwd ownership is ours, keep it** — it guards two sessions sharing a
  directory, which happens without git worktrees.

Branch: `merge/upstream-0.8.11` (merge in progress, 18 conflicted files)
Base:   `2a6e537` · ours: 41 commits · theirs: 77 commits / 164 files

Restart at any time:

```bash
git merge --abort
git merge --no-commit --no-ff origin/main
```

Guiding rule: **keep our UX/feature layer, take their engine-level fixes.**

Ours to protect: discussion threads, review/attach model, file tabs + viewer cache,
changed-file/URL panel opening, Electron desktop, worktree cwd ownership,
settings dropdown menu, session-switch handling.

Theirs to land: SVG CSP fix, skills frontmatter fix, session_shutdown paths,
history tail pagination, cumulative stats, session-path perf, jiti test harness fix,
pi SDK 0.84.3.

---

## Conflicted files

| # | File | Hunks | Cause | Resolution | Effort |
|---|------|-------|-------|-----------|--------|
| 1 | `package.json` | 1 | they removed electron, added web-push/ansi_up, bumped pi 0.84.3 | union: keep `electron` + `desktop*` scripts, add `web-push`, `@types/web-push`, `ansi_up`; take 0.84.3; version → 0.8.11 | S |
| 2 | `package-lock.json` | 89 | both regenerated | `git checkout --theirs`, then `npm install` to re-add electron | S |
| 3 | `app/api/sessions/[id]/route.ts` | 1 | import block: ours `SessionTreeNode` (inactive-leaf), theirs stats/subagents/tool-selection | union imports; keep our `resolveInactiveSessionLeafId`, add their `stats` block | S |
| 4 | `components/FileViewer.tsx` | 1 | ours viewer LRU cache, theirs `SOURCE_HIGHLIGHT_MAX_LINES` | keep both (cache + highlight cap) | S |
| 5 | `components/TurnWrittenFiles.test.mjs` | 1 | dual-React harness fix (#588) | take theirs | S |
| 6 | `components/MessageView.test.mjs` | 1 | adjacent new tests | keep both tests | S |
| 7 | `hooks/useAgentSession.test.mjs` | 1 | adjacent new tests | keep both tests | S |
| 8 | `lib/rpc-manager.test.mjs` | 1 | our thread test vs their 187-line block | keep both | S |
| 9 | `components/ChatInput.test.mjs` | 1 | harness rewrite + new exports | take their harness, re-add our exports (`formatQuotedText`, `serializeQuotedReply`, …) | S |
| 10 | `components/ChatInput.tsx` | 3 | they extracted `ModelSelector`; our quote support in deps arrays | take `ModelSelector` extraction; keep `quotes` in both dep arrays and their `runBuiltinCommand` | M |
| 11 | `components/ModelsConfig.tsx` | 1 | modal shell vs `ConfigPanelShell(embedded)` | depends on settings decision (below) | M |
| 12 | `components/PluginsConfig.tsx` | 1 | same | same | M |
| 13 | `components/SkillsConfig.tsx` | 1 | same | same | M |
| 14 | `components/MessageView.tsx` | 11 | ours `onOpenChangedFile`/`onOpenUrl`/`processingState`; theirs `onOpenSession` + subagent tool details | union props end-to-end (type, memo compare, BlockView, ToolCallBlock) | M |
| 15 | `components/ChatWindow.tsx` | 8 | ours thread host/visibleCount; theirs history pagination + system/tools panel props | keep threads, adopt `loadContext`/`historyCursor`/`hasEarlierMessages`; reconcile `visibleCount` with prepending | L |
| 16 | `hooks/useAgentSession.ts` | 4 | ours navigation-generation guard + `onSessionSwitched`; theirs pagination + `onSystemToolsChange` | keep guard, wrap their state sets inside it; add `loadContext`; union options and return | L |
| 17 | `lib/rpc-manager.ts` | 5 | ours threads/ephemeral/worktree ownership/session-switch; theirs subagents/chat-only/tool selection/powershell | union imports & consts; **keep `__piWorktreeOwners`**; hand-weave `startRpcSession` (ours: ephemeral + cwd claim + `sessionStartEvent`; theirs: `validateSessionToolSelection` + `registerRpcWrapper`) | L |
| 18 | `components/AppShell.tsx` | 9 | ours settings menu / system-prompt tab / session menu / file toggle; theirs settings sections, `AgentSessionPanel`, mobile toolbar rework | keep our shell, port their `isNarrowMobile` toolbar and (optionally) settings sections | L |

S ≈ ≤30 min · M ≈ 1–2 h · L ≈ 3–6 h

Revised after measurement: #11–13 drop to S (take theirs, see below),
`useAgentSession.ts` drops to M (hunk 3 is a pure addition, hunk 2 is our
`if` wrapper around the same setters plus three new ones).

## Should we pre-extract our features?

Mostly no. Conflict anatomy across the 18 files: roughly two thirds of the hunks
are **shared plumbing** — import blocks, prop type lists, component signatures,
`useAgentSession` destructuring, `useCallback` dependency arrays, the
`startRpcSession` body. Extraction cannot move those, so the merge still stops
in the same files.

Per file, what extraction would actually buy:

- `MessageView.tsx` — 0 of 11 hunks. All prop plumbing.
- `useAgentSession.ts` — 0 of 4.
- `ChatWindow.tsx` — 1 of 8 (the thread `visibleCount` effect).
- `lib/rpc-manager.ts` — 1 of 5: the worktree-ownership block (~95 lines of
  module-level functions + `__piWorktreeOwners`) moves cleanly to
  `lib/worktree-ownership.ts` and removes the `declare global` conflict. Worth
  doing (~30 min) because it also isolates the feature permanently.
  The session-switch methods (~154 lines) are private class methods and already
  auto-merged; leave them.
- `AppShell.tsx` — 2–3 of 9 if our settings menu became its own component, which
  is moot once we take their settings UI.

Plan: do the worktree-ownership extraction now; do threads (ChatWindow +
rpc-manager `start_thread`), the toolbar, and the file-tab layer **after** the
merge is green, so the next upstream pull is cheap. Also `git config rerere.enabled true`.

---

## Settings UI — decided: take theirs

Measured: our entire change to the three config components is **one line each**
(`height: 78vh|76vh` → `35vh`, commit 92069ed). Nothing else.

```bash
git checkout --theirs components/ModelsConfig.tsx components/PluginsConfig.tsx components/SkillsConfig.tsx
git add components/ModelsConfig.tsx components/PluginsConfig.tsx components/SkillsConfig.tsx
```

Re-apply the size afterwards in their shell: `ConfigPanelShell` takes a `height`
prop (`components/SettingsUi.tsx:27`, default `"78vh"`) that feeds the CSS var
`--config-panel-height` used at `app/settings.css:42`. Change the default to
`35vh` or pass `height="35vh"` at the three call sites.

Consequence: AppShell hunks 1–4 should also take theirs (settings sections +
`SettingsPanel`), except the system-prompt decision below.

## Second decision: system prompt surface

Ours opens the system prompt as a **file tab** (`handleOpenSystemPrompt`,
`onSystemPromptLoaderChange`). Theirs adds **System / Tools top panels**
(`SystemPromptPanel`, `ToolDefinitionsPanel`, `onSystemToolsChange`,
`onSystemInfoLoaderChange`, `handleSystemInfoToggle`).

This single choice drives ~6 conflict hunks: AppShell 2–3, ChatWindow 3 & 5,
useAgentSession 1 & 4. Pick one *before* touching those files; taking theirs also
gains the Tools panel we do not have.

---

## Silent (non-conflict) changes worth reviewing

- `next.config.ts` auto-merged correctly: our `distDir`/`agentRules:false` kept,
  their LAN `allowedDevOrigins` + `web-push` external added.
- Deleted by them, verified unused here: `app/api/agent/running/events/route.ts`,
  `app/api/auth/all-providers/route.ts`, `bun.lock`.
- `@lobehub/icons` dropped upstream (replaced by `public/provider-icons.svg`);
  no source file imports it here.
- Our `notifyRunningChange` plumbing in `rpc-manager.ts` survives even though the
  SSE route is gone — harmless, sidebar already polls `/api/agent/running`.
- New upstream surface: subagents, web push + service worker, tool-result images,
  file search, zh-TW locale. All additive; review separately.

---

## Verification after resolving

```bash
npm install
node_modules/.bin/tsc --noEmit
npm test
npm run dev   # port 30141 — never run `next build`
```

Pre-merge baseline for comparison: `tsc` clean, `npm test` = 648 pass / 3 fail
(all three are pre-existing `components/AppShell.file-viewer-state.test.mjs`
source-string assertions).

Smoke list: send a prompt, fork, in-session branch, start a discussion thread,
open a file tab + diff, switch worktree, open settings, Electron `npm run desktop`.

> This file is untracked scratch. Delete it before committing the merge.
