/**
 * @packageDocumentation
 *
 * # @memberjunction/ng-whiteboard
 *
 * A generic, reusable collaborative whiteboard for ANY Angular application, designed for
 * dual authorship: a human user drawing with direct-manipulation tools, and a co-author
 * (typically an AI agent) mutating the same board through a programmatic, JSON-described
 * tool API. The package follows the MemberJunction Generic-component conventions: no
 * Router dependency, PascalCase public surface, standalone components, design-token
 * theming, and a cancelable before / after event pattern on every major mutation.
 *
 * ## Layers
 *
 *  - **State engine** ({@link WhiteboardState}, `whiteboard-state.ts`) — Angular-free
 *    typed board model: items, selection, snapshot undo/redo, a change journal with
 *    coalesced scene deltas (the "agent perception" feed), JSON persistence, and the
 *    before/after mutation events (`ItemAdding$` / `ItemAdded$`, …).
 *  - **Programmatic tool API** (`whiteboard-tools.ts`) — the `Whiteboard_*` JSON tool
 *    definitions plus {@link ApplyWhiteboardAgentTool}, the pure execute-one-tool-call
 *    round-trip any agent/automation layer can drive.
 *  - **Components** — {@link RealtimeWhiteboardHostComponent} (the full board surface:
 *    header, toolbar, zoom cluster, perception popover, export menu, agent toast),
 *    {@link RealtimeWhiteboardBoardComponent} (the canvas itself), and the supporting
 *    toolbar / zoom / popover / read-only snapshot components.
 *  - **Export builders** (`whiteboard-export.ts`) — pure functions producing one
 *    self-contained HTML document or a standalone SVG of a board snapshot.
 *  - **Widget input bridge** (`whiteboard-widget-bridge.ts`) — the `MJWhiteboard.submit`
 *    postMessage contract that lets STRICTLY SANDBOXED HTML widgets send user input back
 *    to the host.
 *
 * See the package README for a quickstart, the agent-integration recipe, the event
 * surface, security notes, and theming/extension points.
 */

// State engine — board model, mutations, undo/redo, perception deltas, persistence,
// and the before/after mutation event surface.
export * from './lib/whiteboard-state';

// Programmatic mutation tool API (agent-facing JSON tools + the pure executor).
export * from './lib/whiteboard-tools';

// Pure export builders (self-contained HTML document / standalone SVG).
export * from './lib/whiteboard-export';

// Sandboxed HTML-widget input bridge (MJWhiteboard.submit contract + host validation).
export * from './lib/whiteboard-widget-bridge';

// Right-click context-menu model (pure — decides WHAT is offered, not how it renders).
export * from './lib/whiteboard-context-menu';

// Components (all standalone).
export * from './lib/whiteboard-board.component';
export * from './lib/whiteboard-toolbar.component';
export * from './lib/whiteboard-zoom.component';
export * from './lib/whiteboard-pages.component';
export * from './lib/whiteboard-agent-sees-popover.component';
export * from './lib/whiteboard-host.component';
export * from './lib/whiteboard-snapshot.component';

// Convenience NgModule + tree-shaking prevention hook.
export * from './lib/whiteboard.module';
