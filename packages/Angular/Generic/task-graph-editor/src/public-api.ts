/*
 * Public API Surface of @memberjunction/ng-task-graph-editor
 *
 * A `widgets`-layer component for viewing and editing a `TaskGraphSpec` — the one graph contract
 * shared by design-time flows and runtime task graphs. Import `TaskGraphSpec` itself from
 * `@memberjunction/ai-core-plus`; this package deliberately does not re-export it (see the
 * no-cross-package-re-exports rule in `.claude/rules/typescript-style.md`).
 */
export * from './lib/task-graph-editor.module';
export * from './lib/task-graph-editor.component';
export * from './lib/task-graph-editor-events';
export * from './lib/task-graph-canvas-adapter';
export * from './lib/task-graph-properties-panel.component';
export * from './lib/task-graph-run-view.component';
export * from './lib/task-graph-runtime-source';
export * from './lib/task-graph-debug-toolbar.component';
export * from './lib/task-graph-variables.component';
export * from './lib/workflow-debug-host';
export * from './lib/debug-variables';
export * from './lib/pane-split';
