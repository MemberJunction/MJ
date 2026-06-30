---
"@memberjunction/ng-ui-components": minor
---

Add `<mj-alert>` — the canonical inline alert/banner component — and migrate the bespoke inline alerts across MJ Explorer onto it.

**New component** (`@memberjunction/ng-ui-components`): `MJAlertComponent` is the standardized, persistent in-flow message box (info / success / warning / error) — distinct from the transient corner toast (`NotificationService`). Standalone, design-token-driven, dark-mode-safe.

- Inputs: `Variant` (info/success/warning/error), `Size` (sm/md), `Title`, `Message`, `Icon` (per-variant default, overridable), `Dismissible` (+ `Dismissed` output), `Role` (auto ARIA `alert`/`status`).
- An `[actions]` content slot for buttons, default `<ng-content>` for rich bodies, dynamic `[Variant]` for state-driven banners.
- Backgrounds use an **opaque** status tint (`color-mix` into the surface) so an alert renders identically regardless of the backdrop behind it, plus a default bottom margin so it drops into flow content cleanly.

**Migration**: replaced the hand-rolled alert `<div>`s (`.alert`, `*-banner`, `error-message`/`info-box`/etc.) across the entire dashboards package and explorer-settings, explorer-core, core-entity-forms, and the Generic packages (artifacts, list-management, entity-viewer, agents, conversations, testing, actions, base-forms, resource-permissions). Dead per-component box CSS removed; original top/horizontal margins preserved via positioning-only classes. A `check:alerts` CI gate measures adoption and prevents new hand-rolled alerts from regressing.
