# MCP Dashboard Bug — Dialog Components Not Rendering

## Symptoms
- MCP Dashboard loads and displays data correctly (tabs, servers list, etc.)
- `mjButton` directive doesn't apply CSS classes to buttons (buttons appear unstyled)
- Clicking "Add Server" fires `createServer()` and sets `ShowServerDialog = true`
- `<mj-mcp-server-dialog>` element appears in DOM but with empty innerHTML
- `<mj-dialog>` (from `@memberjunction/ng-ui-components`) never renders inside it
- Same issue affects all MCP dialogs (server, connection, test tool)

## Root Cause Analysis

### What we confirmed via Playwright DOM inspection:
- `mj-mcp-server-dialog` exists in DOM: `display: inline, visibility: visible, opacity: 1`
- `mj-dialog` does NOT exist in DOM
- `mj-dialog-backdrop` does NOT exist in DOM
- Button elements have `className: ''` — `mjButton` directive's `@HostBinding('class.mj-btn')` isn't applying

### What we ruled out:
- **Import names match** — `MJButtonDirective`, `MJDialogComponent` etc. are correctly imported in `MCPModule` and match the exports from `@memberjunction/ng-ui-components`
- **Compiled dist is correct** — `dist/MCP/mcp.module.js` has proper imports, `setNgModuleScope` lists all standalone components
- **Same pattern works elsewhere** — `AIDashboardsModule` uses `MJDropdownComponent` the same way and it works
- **Not caused by AI analytics dashboard work** — issue predates our changes, traced to commit `93215e61a1` ("refactor: rename Mj→MJ prefix on all ui-component classes")

### Leading theory: Standalone component scope resolution failure in lazy-loaded module
The `MCPModule` is lazy-loaded via `featureLoader(() => import('@memberjunction/ng-dashboards/mcp.module'))`. The module's `ɵɵsetNgModuleScope` (guarded by `ngJitMode`) should set compilation scope for all declared components. However, standalone components imported by the module (`MJButtonDirective`, `MJDialogComponent`) are not being resolved in child component templates (`MCPServerDialogComponent`).

The compiled output shows `ɵɵsetComponentScope` is only emitted for `MCPDashboardComponent` (the main dashboard), not for child components like `MCPServerDialogComponent`. This may mean Angular's AOT compiler isn't propagating module imports to child component templates within this specific lazy chunk.

### Why other modules aren't affected:
Other lazy-loaded modules (AI, Actions) either:
1. Don't use `mj-dialog` in child components (only use `mj-dropdown` in the main component)
2. Have their standalone imports resolved through a different code path

## Potential Fixes to Try

1. **Make dialog components standalone** — Add `standalone: true` and list all dependencies in each dialog component's `imports` array. This removes dependency on module scope entirely.

2. **Add `CUSTOM_ELEMENTS_SCHEMA`** — As a diagnostic, add `schemas: [CUSTOM_ELEMENTS_SCHEMA]` to `MCPModule` to see if Angular is silently ignoring unknown elements.

3. **Move dialog templates inline** — If the issue is related to external templateUrl resolution in lazy chunks, inline templates might work.

4. **Check Vite prebundling** — The `@memberjunction/ng-ui-components` package may need to be excluded from Vite's optimization to ensure proper module resolution.

5. **Force module compilation** — Add a dummy reference to `MJDialogComponent` in `MCPDashboardComponent`'s template to force Angular to include it in the compilation scope.

## Files Involved
- `packages/Angular/Explorer/dashboards/src/MCP/mcp.module.ts` — Module with standalone imports
- `packages/Angular/Explorer/dashboards/src/MCP/components/mcp-server-dialog.component.ts` — Dialog that uses `<mj-dialog>`
- `packages/Angular/Explorer/dashboards/src/MCP/mcp-dashboard.component.html:677` — `@if (ShowServerDialog)` block
- `packages/Angular/Generic/ui-components/src/lib/dialog/dialog.component.ts` — `MJDialogComponent` standalone component
- `packages/Angular/Generic/ui-components/src/lib/button/button.directive.ts` — `MJButtonDirective` standalone directive

## Pre-existing Since
Commit `93215e61a1` — "refactor: rename Mj→MJ prefix on all ui-component classes per MJ convention" (Apr 2, 2026)
