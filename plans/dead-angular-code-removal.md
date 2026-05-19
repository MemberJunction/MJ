# Dead Angular Code Removal Plan

**Date**: 2026-04-04
**Branch**: To be created from `next`
**Scope**: Remove unused Angular packages, dead files, and deprecated code artifacts

---

## Executive Summary

A thorough audit of all 71 Angular packages (excluding generated code) identified **8 entirely dead packages** (zero external consumers), **1 dead file**, and **1 stale prototype directory**. Combined, this is ~345K of source code that ships in the build, gets compiled, and increases `npm install` time — all for zero value.

Three packages initially flagged as dead (`ng-testing`, `ng-tasks`, `ng-forms`) turned out to be actively used by `conversations`, `dashboards`, `core-entity-forms`, and `agent-requests`. They are **not** candidates for removal.

---

## Tier 1: Dead Packages (Zero External Consumers)

These packages have **no imports, no selector usage, and no package.json references** anywhere outside their own directory. They are published to npm, compiled in every build, but never consumed.

| # | Package | npm Name | Components | Source Size | Evidence |
|---|---------|----------|------------|-------------|---------|
| 1 | `Generic/data-context` | `@memberjunction/ng-data-context` | 2 | 60K | 0 imports, 0 selector matches, 0 package.json refs |
| 2 | `Generic/entity-communication` | `@memberjunction/ng-entity-communications` | 2 | 40K | 0 imports, 0 selector matches, 0 package.json refs |
| 3 | `Generic/find-record` | `@memberjunction/ng-find-record` | 2 | 40K | 0 imports, 0 selector matches, 0 package.json refs |
| 4 | `Generic/record-merge` | `@memberjunction/ng-record-merge` | 1 | 44K | 0 imports, 0 selector matches, 0 package.json refs |
| 5 | `Generic/chat` | `@memberjunction/ng-chat` | 1 | 44K | Only referenced in its own README; superseded by `ng-conversations` |
| 6 | `Generic/gantt` | `@memberjunction/ng-gantt` | 1 | 24K | 0 imports, 0 selector matches, 0 package.json refs, no tests |
| 7 | `Generic/kanban` | `@memberjunction/ng-kanban` | 1 | 24K | 0 imports, 0 selector matches, 0 package.json refs, no tests |
| 8 | `Generic/tab-strip` | `@memberjunction/ng-tab-strip` | 3 | 68K | Only referenced in completed Kendo-removal plan docs; never actually imported by any source file |

**Total**: 13 components, ~344K source code

### Notes on Specific Packages

- **`ng-chat`**: This was the original chat component, now fully replaced by `@memberjunction/ng-conversations`. The conversations package is the active implementation.
- **`ng-tab-strip`**: Was created during the Kendo removal project as a replacement for `kendo-tabstrip`, but was never adopted. Code uses native tabs or other patterns instead.
- **`ng-gantt` / `ng-kanban`**: Appear to be speculative implementations — they have no tests, no external usage, and were only recently touched for CSS token migration (April 3). They seem to have been built proactively but never integrated.
- **`ng-data-context` / `ng-find-record` / `ng-record-merge` / `ng-entity-communication`**: Older utility components that were likely used at some point but have been orphaned as the UI evolved.

---

## Tier 2: Dead Files Within Active Packages

| # | File | Package | Issue | Size |
|---|------|---------|-------|------|
| 1 | `custom/AIAgents/agent-advanced-settings-dialog.component.ts` | `core-entity-forms` | Entire file is commented out (every line) | ~200 lines |
| 2 | `conversations/initial-prototype-now-old/` | `ng-conversations` | Old prototype directory with HTML mockup, SQL migration, proposal docs | 688K |

---

## Tier 3: Deprecated Code (Migration Candidates, Not Immediate Removal)

These are actively imported but marked `@deprecated` with documented replacement paths. Not blocking, but worth tracking.

| Location | Deprecated API | Replacement |
|----------|---------------|-------------|
| `Explorer/shared/src/lib/shared.service.ts` | 6 notification methods (`UserNotifications`, `UnreadUserNotifications`, etc.) | `MJNotificationService` |
| `Explorer/shared/src/lib/navigation.service.ts` | `getDefaultApplicationId()`, `getDefaultAppColor()` | Newer overloads in same service |
| `Explorer/explorer-settings/.../entity-permissions.component.ts` | `savePermissions()` method | `PermissionDialogComponent` |
| `Explorer/explorer-core/.../chat-conversations-resource.component.ts` | Old conversation creation method | `onConversationCreated` with `pendingMessage` |
| `Explorer/core-entity-forms/.../ai-agent-form.component.ts` | `subAgents` property | `allSubAgents` |

---

## Removal Plan

### Phase 1: Delete Dead Packages (Low Risk)

**Steps for each package:**
1. Remove the package directory (`packages/Angular/Generic/<name>/`)
2. Remove from `workspaces` array in root `package.json` (if explicitly listed)
3. Remove from `turbo.json` pipeline (if explicitly listed)
4. Verify no workspace `package.json` references remain (already confirmed: none exist)
5. Run `npm install` at root to update lockfile
6. Run `npm run build` to confirm no breakage

**Order**: Any order — these are fully independent.

**Packages to delete:**
```
packages/Angular/Generic/data-context/
packages/Angular/Generic/entity-communication/
packages/Angular/Generic/find-record/
packages/Angular/Generic/record-merge/
packages/Angular/Generic/chat/
packages/Angular/Generic/gantt/
packages/Angular/Generic/kanban/
packages/Angular/Generic/tab-strip/
```

### Phase 2: Delete Dead Files (Low Risk)

1. Delete `packages/Angular/Explorer/core-entity-forms/src/lib/custom/AIAgents/agent-advanced-settings-dialog.component.ts`
2. Delete `packages/Angular/Generic/conversations/initial-prototype-now-old/` directory

### Phase 3: Deprecation Cleanup (Medium Risk, Separate PR)

Migrate callers of deprecated `SharedService` notification methods to `MJNotificationService`. This touches multiple components and should be its own focused PR with testing.

---

## Packages Investigated but Confirmed Active

These were initially flagged but verified to have real consumers:

| Package | Consumer(s) |
|---------|------------|
| `ng-testing` | `dashboards` (Testing dashboard), `core-entity-forms` (Test forms), `conversations` (feedback dialog) |
| `ng-tasks` | `conversations` (task full view) |
| `ng-forms` | `conversations` (message forms), `agent-requests` (request panel) |
| `ng-scheduling` | `dashboards` |
| `ng-deep-diff` | `core-entity-forms` |
| `ng-clustering` | `dashboards` |
| `ng-timeline` | `entity-viewer`, `core-entity-forms`, `MJExplorer` |
| `ng-notifications` | 18 consumer packages |
| `ng-action-gallery` | `core-entity-forms`, `dashboards` |
| `ng-flow-editor` | `core-entity-forms` |
| `ng-word-cloud` | `record-tags`, `dashboards` |

---

## Risk Assessment

- **Phase 1 & 2**: Very low risk. Zero external references confirmed via:
  - `package.json` dependency search across all 220 packages
  - TypeScript import search across entire repo
  - HTML template selector search
  - Bootstrap manifest check (neither `ng-bootstrap` nor `ng-bootstrap-lite` reference them)
- **Phase 3**: Medium risk — requires verifying callers at runtime, not just compile time.

## Estimated Impact

- **~1MB** of source + dist removed from repo
- **8 fewer packages** in npm workspace (faster `npm install`)
- **8 fewer packages** in Turbo build graph (faster builds)
- **Cleaner dependency tree** for consumers

---

## npm Deprecation (Post-Merge)

After the removal PR merges, publish final deprecation versions of each package:
```bash
npm deprecate @memberjunction/ng-data-context "Removed in v5.24 — this package was unused"
npm deprecate @memberjunction/ng-entity-communications "Removed in v5.24 — this package was unused"
# ... etc for all 8 packages
```
