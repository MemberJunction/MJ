# Alerts & Confirmation Dialogs — Standardization Scope

Starting point for the new branch. Goal: standardize confirm dialogs and inline
alerts onto **reusable shared components**, the same way the accordion effort
standardized collapsibles.

> ⚠️ **Do NOT scope off `scripts/measure-ui-adoption.sh`.** Its confirm marker is
> narrow (`window.confirm` / `.confirm(` / the string `confirm-dialog`, counted by
> *file*) and it has **no alert marker at all**. It would point you at a small,
> wrong fraction. Numbers below come from a broad behavior-based sweep
> (`packages/Angular`, excl. node_modules/dist/generated), files-with-match.

## Verdict: two worthwhile targets, one explicit non-target

### ✅ IN — `<mj-confirm-dialog>` (or a confirm service) — HIGH value
- **No shared component today.** Two *duplicate* local ones
  (`dashboard-viewer/.../config-dialogs/confirm-dialog`,
  `entity-viewer/.../confirm-dialog`) + bespoke `<mj-dialog>`-based confirms.
- **~36 files use native `window.confirm`** — poor UX **and** against the
  codebase's own no-browser-dialogs rule. These are the priority kills.
- Broader confirm surface: ~19 files `ConfirmDialog*` components, ~31 files
  confirm service/method patterns (`confirmDelete()`, `showConfirm()`,
  `ConfirmService`). Heavy overlap — classify to de-dupe.
- **Win:** one `ui-components` confirm primitive consolidates the duplicates,
  removes the native-dialog anti-pattern, covers ~50+ sites.

### ✅ IN — `<mj-alert>` inline banner — GOOD value
- **No shared component today.** ~50 hand-rolled callouts:
  ~30 `.error-message`/`-banner`, ~15 generic `.alert`/`.banner`, ~7 info, ~3 warning.
- **Win:** one inline banner component with `info / warning / error / success`
  variants (token-driven) standardizes all of them.
- NOTE: distinct from toasts — this is the *persistent inline message box*, not
  the transient corner notification.

### ➖ OUT — transient toasts / notifications (already standardized)
- `@memberjunction/ng-notifications` → **`NotificationService`** (a shared service,
  no visual component) is already used in **~95 files**. That IS the standard and
  it's adopted. Re-touching it is churn, not standardization. **Exclude
  `NotificationService` / `notify()` / toast / snackbar callers from scope.**

## Suggested approach (mirror the accordion effort)
1. **Build the components first** in `@memberjunction/ng-ui-components`:
   - `mj-confirm-dialog` — title/message/confirm+cancel, danger variant, returns a
     promise/observable; consider a thin `ConfirmService.confirm({...})` wrapper so
     `window.confirm` callers convert to a one-liner. Dialog buttons LEFT-aligned
     (MJ convention: affirmative leftmost).
   - `mj-alert` — inline banner, `Variant` (info/warning/error/success), optional
     icon + dismiss, design-token colors (reuse the `--mj-status-*` tokens).
   - WAI-ARIA from day one (`role="alertdialog"` / `role="alert"`), like the
     accordion a11y pass.
2. **Broad classification sweep** (parallel agents, by area) to separate genuine
   user-facing confirm/alert UI from false-positives (e.g. `NotificationService`
   background logging, `.confirm(` noise, `.alert` utility classes).
3. **Migrate by area**, deleting bespoke modal/banner CSS as you go.

## Quick exposure numbers (files-with-match, overlapping — classify to de-dupe)
| Surface | ~Files | Note |
|---|---|---|
| native `window.confirm` | 36 | priority kill (anti-pattern) |
| `confirm-dialog` string | 19 | incl. 2 duplicate local components |
| `ConfirmDialog*` component | 19 | |
| confirm service/method | 31 | |
| bespoke inline alert/banner CSS | ~50 | → `mj-alert` |
| `NotificationService`/`notify` | ~95 | **OUT — already standardized** |
| toast / snackbar | ~48 | **OUT** |

## Reusable patterns to lift from the accordion work
- Token-driven status colors (`--mj-status-*`), dark-mode-safe.
- Component owns ALL chrome; consumers pass inputs, write zero styling.
- Add DOM tests for the a11y contract + variants up front.
- Don't trust narrow markers — widen / classify before trusting a baseline.
