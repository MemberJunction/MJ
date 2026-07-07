---
"@memberjunction/ng-ui-components": minor
"@memberjunction/ng-dashboards": patch
"@memberjunction/ng-core-entity-forms": patch
"@memberjunction/ng-artifacts": patch
"@memberjunction/ng-ai-test-harness": patch
"@memberjunction/ng-conversations": patch
"@memberjunction/ng-credentials": patch
---

Add the canonical confirm-prompt primitives to `@memberjunction/ng-ui-components` and migrate every native `window.confirm()` in MJ Explorer onto them.

**`@memberjunction/ng-ui-components` (new capability):**

- New **`<mj-confirm-dialog>`** — the canonical confirmation dialog (danger/warning/info/default variants, title + message + detail lines, MJ left-confirm button order, `Processing` state, Esc/backdrop dismissal inherited from `mj-dialog`).
- New **`MJConfirmService`** — the imperative, Promise-based replacement for `window.confirm()`: `await confirm.Confirm('Discard changes?')` / `ConfirmDelete({ message, detail, confirmText })`. Mounts the dialog on `document.body`, resolves `true`/`false`, tears down on settle.
- **Layering fix:** service-spawned dialogs are lifted into their own stacking context (z-index 20000) so a confirm launched over a drawer, slide-panel, or `mj-window` renders above that overlay instead of dimmed and unclickable beneath its backdrop (previously each swallowed click could re-trigger the caller and stack another dialog). Declarative template usage is unchanged.

**Consumers — 47 native `confirm()` prompts migrated** across 23 files in 6 packages: dashboards (Credentials, MCP, Tags/Autotagging/Prompts, QueryBrowser, FormBuilder, ComponentStudio, DatabaseDesigner), core-entity-forms (Queries, Templates, Tests, Lists, template editor), artifacts (version restore), ai-test-harness (save/clear/delete/import), conversations (collection + artifact share modals, collection tree/view — whose ten native `alert()`s were also replaced with `MJNotificationService` toasts), and credentials (the credential/type/category edit-panel deletes, adding the package's missing `ng-ui-components` dependency). Deletes route through `ConfirmDelete` (red confirm, "Delete"/"Remove" labels); discards and overwrite warnings through `Confirm`. Handlers that gate on the answer were made async only after verifying every caller is fire-and-forget.

The single intentional exception is DatabaseDesigner's `ModifyPanelCanClose` — a synchronous `[CanClose]` guard that must return a boolean immediately, documented as such in `MJConfirmService`'s docs.

No public API changes in the consumer packages. Verified with per-package unit test runs (~2,200 tests across touched packages), full-page light+dark state screenshots of 8 distinct surfaces, and live end-to-end executions of the true paths.
