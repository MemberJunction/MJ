# Remove legacy `.mj-btn-*` block and dead Kendo rules from explorer-app `_common.scss` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `packages/Angular/Explorer/explorer-app/src/lib/styles/_common.scss` pass every UI gate it is graded by, by deleting the legacy button system and the dead Kendo-era card/icon rules, after first fixing the one consumer that still depends on the legacy block.

**Architecture:** Three independent edits. (1) `files-grid.ts` stops emitting the legacy `mj-btn-flat mj-btn-sm` classes and uses the canonical BEM modifiers from `@memberjunction/ng-ui-components`. (2) `_common.scss` loses the "STANDARDIZED BUTTON SYSTEM" block plus two stray nested `.mj-btn` overrides, and loses the dead Kendo-era card/icon systems that contain every `.k-*` rule. (3) The nine hardcoded colors left in live rules are tokenized so the whole-file hex gate passes. No new code paths. Zero intended visual change except where noted in Task 4.

**Tech Stack:** SCSS (compiled by MJExplorer's Angular CLI Sass pipeline via `@use "@memberjunction/ng-explorer-app/dist/styles.scss"`), Angular 21 component with AG Grid cell renderer, Vitest + jsdom (`vitest.dom.shared.ts`), the repo's bash CI gates under `.github/scripts/`.

**Spec:** https://github.com/MemberJunction/MJ/issues/4845 (Matt, 2026-09-29). This plan argues from that issue plus the gate scripts; where the issue's claims did not survive verification, the "Decisions" section below says so.

## Global Constraints

- No `git commit` without Matt's explicit, per-commit request. Every task ends at a checkpoint where the diff is shown and work STOPS until he says "commit it". (CLAUDE.md rule 1; memory `feedback_one_commit_per_approval`.)
- Work on a feature branch cut from `origin/next` that tracks a same-named remote branch. Verify with `git branch -vv` before any push. (CLAUDE.md rule 3.)
- pnpm only. Matt runs `pnpm install` and root builds himself; single-package builds are fine for the implementer. (memory `feedback_user_runs_builds`.)
- Strong typing, no `any`, no `unknown`-as-shortcut. Bracket access to a private member in a test (`instance['createActionButton']`) is type-checked by TS and already used in this repo (`artifact-load-dialog.component.dom.test.ts:44`).
- No hardcoded colors in CSS/SCSS: use `--mj-*` tokens, `color-mix()` for translucent variants. (`.claude/rules/design-tokens.md`.)
- Never touch `packages/MJExplorer` or `packages/MJAPI`. (memory `feedback_never_modify_apps`.)
- Changeset bump is `patch` for both packages: no migration, no metadata. (`.claude/rules/changesets.md`.)
- Never start, restart, or kill MJAPI / MJExplorer; surface the need and wait. (memory `feedback_no_server_lifecycle`.)

## Decisions (read before Task 1)

**D1. The issue's "then the file passes both UI gates" is wrong for the hex gate.** Both `check-mj-btn-override.sh` and `check-css-hex-tokens.sh` grade an entire file once it appears in the PR diff. Run today with `--file`, the hex gate flags 20 lines in `_common.scss`; only one (L199) is inside the button block. The other 19 are `rgba(0,118,182,…)` brand-blue shadows, `rgba(9,35,64,…)` navy shadows, and two one-offs. Touching the file for #4845 therefore forces the hex question. Two ways out:

- **Option A (minimal):** delete only the 12 `.k-*` lines, tokenize all 19 remaining colors, 10 of which sit in rules nothing renders.
- **Option B (recommended, what this plan does):** every one of the 12 `.k-*` lines lives inside a parent system that is itself dead. `.k-card-body` / `.k-chip` are inside the "ICON CARD SYSTEM" (`.mj-icon-card`) and the legacy `.mj-card.mj-card-icon` redirect; `.k-drawer-item` is inside the "SKIP ICON" block. `mj-icon-card`, `mj-card-icon`, `mj-card-actions`, `mj-card-icon-large`, `skip-icon`, `skip-icon-large` have **zero** template consumers in MJ (`*.html`/`*.ts`, excluding this stylesheet) and zero in all ten sibling clones under `~/repos` (AIDP, CDP, Izzy, LW Discovery, Sidecar-Learning-Hub, bizapps-common, bizapps-sonar, campaigns, demo, platform; Izzy's `.skip-icon` is its own component-scoped class). Deleting those parents removes 10 of the 19 hex lines along with the Kendo residue they were written for. Nine colors remain in rules that are still defined and get tokenized in Task 4. Four sit in rules MJ renders (`.form-control:focus`, `.mj-card:hover`, `.mj-search` focus); the other five are in the `.mj-modal-overlay` / `.mj-modal` / `.mj-modal-close` family, which no MJ template renders today (file-grid's dialogs use `.mj-modal-backdrop` / `.mj-modal-window`), so those edits are observable only in downstream apps that write the class themselves.

Option B widens the diff by roughly 330 deleted lines but leaves no dead code behind the Kendo cleanup. If Matt prefers Option A, Task 3 shrinks to deleting the 12 lines listed in its Step 1 and Task 4 grows to all 19 lines; nothing else changes.

**D2. The button gate flags seven lines, not the five the block accounts for.** L164 (`.mj-btn {`) and the four `@extend .mj-btn;` lines go with the block. Two more are nested overrides the issue did not mention, and both are already dead:

- L1174 `.mj-modal-footer .mj-btn { width: 100% }` (inside `@media (max-width: 768px)`). The only `.mj-modal-footer` consumer in the repo is `file-storage/.../file-grid.component.html`, whose footers use `.mj-action-btn` buttons, not `mjButton`. No element ever matches. Delete.
- L1193 `.mj-btn { padding: 8px 16px; font-size: 14px }` (inside `@media (max-width: 480px)`). `main.scss` imports `./common` at line 24 and the canonical `button.scss` at line 29. Same specificity (0,1,0), later source wins, so the canonical `padding: 10px 20px` already overrides this at every viewport, and `14px` equals `--mj-text-sm` anyway. Visually a no-op today. Delete.

**D3. `check-ngc-scss.sh --file _common.scss` fails, and that is a false alarm.** CI runs that gate with `--all`, which follows component `styleUrls` only. `_common.scss` is a global partial compiled by MJExplorer's Sass pipeline, not an ngc-embedded component stylesheet. `--all` passes today (0 violations, verified 2026-10-05). Do not "fix" the `@import` / `@extend` / `//` comments in this file for that gate.

**D4. Local gate runs must use `--file`.** The default diff mode compares `origin/next...HEAD`, so uncommitted edits are invisible to it. Every verification step below passes `--file <path>` explicitly.

**D5. Downstream apps.** CDP, Izzy, and Sidecar-Learning-Hub's Admin app each carry their *own* `_common.scss` copy of the legacy block, so they are unaffected. CDP, AIDP, platform, and Sidecar Admin also `@use` MJ's `ng-explorer-app/dist/styles.scss`, so they will receive the deletion; none of them reference any removed class in a template. The changeset text (Task 5) names the removed classes so any app outside this list can grep.

## Review Focus

1. **A downstream app outside the ten checked clones still writes `class="mj-btn-primary"`.** Expected: its buttons render unstyled after upgrade. Mitigation is the changeset release note listing every removed class and its canonical replacement; no test can cover a repo we cannot see.
2. **Touch devices.** `.mj-btn--sm` becomes `min-height: 44px` under `@media (pointer: coarse)`. Inside an AG Grid row (~42px) the action buttons could overflow. Today the base `.mj-btn` already imposes 44px at all pointer types, so the fix is strictly no worse; Task 6 checks a touch-emulated viewport anyway.
3. **Dark mode after tokenization.** `--mj-brand-primary` resolves to `brand-400` in dark mode, so brand-tinted focus rings and shadows lighten; `--mj-brand-secondary` has no dark override, so the navy card shadow is unchanged. The `--mj-bg-overlay` backdrop change has no MJ surface (see D1) and `_shared-patterns.scss:686` already set that token on `.mj-modal-overlay`; `_common.scss` was overriding it by source order, so the edit removes a contradiction rather than introducing a look. Task 6 screenshots the two live focus rings in both themes.
4. **A future `mjButton` dropped into `.mj-modal-footer` on a phone** no longer stretches full-width. Accepted: the canonical dialog provides `mj-dialog-actions`; this stylesheet should not fork button layout.
5. **Any other `@extend .mj-btn`** anywhere in the explorer-app styles would break the Sass compile once the base rule is gone. Verified none exist outside the deleted block; Task 2 Step 4's compile is the pin.

---

### Task 0: Branch and workspace (Matt does both halves)

**Files:** none

- [ ] **Step 1: Cut the feature branch.** Run `/new-branch` with the name `fix/4845-legacy-mj-btn-block` (defaults to `origin/next`). Then verify tracking:

```bash
git branch -vv | grep '^\*'
```

Expected: `* fix/4845-legacy-mj-btn-block [origin/fix/4845-legacy-mj-btn-block]`. If the bracket says `origin/next`, STOP and fix with `git branch --set-upstream-to=origin/fix/4845-legacy-mj-btn-block`.

- [ ] **Step 2: Install and build once so tests can resolve workspace `dist/` folders.** A fresh worktree has no `node_modules` and the linked `@memberjunction/*` packages have no `dist/`, so Vitest cannot import `@memberjunction/ng-notifications` until they are built. Matt runs, from the worktree root:

```bash
pnpm install && pnpm run build
```

(The implementer does not run this. If Matt prefers to do the work in his main checkout where `dist/` already exists, skip this step.)

---

### Task 1: Fix the only live consumer of the legacy block (`files-grid.ts`)

**Files:**
- Modify: `packages/Angular/Generic/file-storage/src/lib/files-grid/files-grid.ts:351`
- Create: `packages/Angular/Generic/file-storage/src/lib/files-grid/files-grid.dom.test.ts`

**Interfaces:**
- Consumes: `FilesGridComponent` (constructor takes `MJNotificationService`, which has a no-arg constructor backed by the global object store, so it can be `new`ed outside DI). Private method `createActionButton(iconClass: string, disabled: boolean): HTMLButtonElement`.
- Produces: the row action buttons carry `mj-btn mj-btn--flat mj-btn--sm grid-action-btn`. `mj-btn--flat` (button.scss L121) and `mj-btn--sm` (button.scss L201) are the canonical modifiers; `mj-btn-flat` exists nowhere and `mj-btn-sm` exists only in the block Task 2 deletes.

Why this test shape: rendering `<ag-grid-angular>` in jsdom is heavy and irrelevant; the method under test is pure DOM construction. The package's DOM tests sit next to their component with a `.dom.test.ts` suffix (`file-upload.dom.test.ts` is the precedent for a component file without `.component` in its name).

- [ ] **Step 1: Write the failing test**

```ts
// packages/Angular/Generic/file-storage/src/lib/files-grid/files-grid.dom.test.ts
import { describe, it, expect } from 'vitest';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { FilesGridComponent } from './files-grid';

/**
 * The AG Grid action cell renderer hand-builds <button> elements, so the mjButton
 * directive cannot style them. The class string must therefore use only classes
 * the canonical button stylesheet defines (BEM `mj-btn--*`). Issue #4845: it used
 * to emit `mj-btn-flat mj-btn-sm`, where `mj-btn-flat` existed nowhere and
 * `mj-btn-sm` only in a legacy block that is being removed.
 */
function createGrid(): FilesGridComponent {
  return new FilesGridComponent(new MJNotificationService());
}

describe('FilesGridComponent action buttons', () => {
  it('emits only canonical mj-btn classes plus the grid hook class', () => {
    const btn = createGrid()['createActionButton']('fa-download', false);
    const mjClasses = Array.from(btn.classList).filter((c) => c.startsWith('mj-btn'));
    expect(mjClasses).toEqual(['mj-btn', 'mj-btn--flat', 'mj-btn--sm']);
    expect(btn.classList.contains('grid-action-btn')).toBe(true);
  });

  it('never emits the legacy single-dash modifiers', () => {
    const btn = createGrid()['createActionButton']('fa-trash', true);
    expect(btn.classList.contains('mj-btn-flat')).toBe(false);
    expect(btn.classList.contains('mj-btn-sm')).toBe(false);
    expect(btn.disabled).toBe(true);
    expect(btn.querySelector('span')?.className).toBe('fa-solid fa-trash');
  });
});
```

- [ ] **Step 2: Run it and confirm it fails for the right reason**

```bash
cd packages/Angular/Generic/file-storage && pnpm test -- files-grid.dom
```

Expected: 2 failed. First test: `expected [ 'mj-btn', 'mj-btn-flat', 'mj-btn-sm' ] to deeply equal [ 'mj-btn', 'mj-btn--flat', 'mj-btn--sm' ]`. Second test: `expected true to be false` on the `mj-btn-flat` assertion. If instead it fails on an import resolution error, Task 0 Step 2 has not been done.

- [ ] **Step 3: Make the one-line fix**

In `files-grid.ts`, inside `createActionButton`, change

```ts
    btn.className = 'mj-btn mj-btn-flat mj-btn-sm grid-action-btn';
```

to

```ts
    btn.className = 'mj-btn mj-btn--flat mj-btn--sm grid-action-btn';
```

- [ ] **Step 4: Run the package's whole suite**

```bash
cd packages/Angular/Generic/file-storage && pnpm test
```

Expected: all files pass, including the 8 pre-existing specs. Report the pass/fail/skip counts.

- [ ] **Step 5: Compile the package**

```bash
cd packages/Angular/Generic/file-storage && pnpm run build
```

Expected: `ngc` exits 0 with no diagnostics.

- [ ] **Step 6: Checkpoint.** Show Matt `git diff -- packages/Angular/Generic/file-storage` and the test output. STOP. Commit only if he explicitly asks; suggested message if he does:

```
fix(file-storage): files-grid action buttons use canonical mj-btn--flat/--sm (#4845)
```

---

### Task 2: Delete the legacy button system and the two stray `.mj-btn` overrides

**Files:**
- Modify: `packages/Angular/Explorer/explorer-app/src/lib/styles/_common.scss` (line numbers below are as of `next` @ `72e082b1a0`; always re-anchor with the grep in Step 1 before cutting, and cut bottom-up so earlier numbers stay valid)

**Interfaces:**
- Consumes: nothing.
- Produces: `check-mj-btn-override.sh --file` reports 0 violations for this file. No selector in the explorer-app styles references `.mj-btn` any more; the canonical `button.scss` (imported by `main.scss` line 29) is the only `.mj-btn` source in the global bundle.

- [ ] **Step 1: Re-anchor.** Confirm the three regions still sit where expected:

```bash
grep -nE 'STANDARDIZED BUTTON SYSTEM|STANDARDIZED FORM SYSTEM|^\.mj-btn-lg|^\s*\.mj-btn \{|@extend \.mj-btn' packages/Angular/Explorer/explorer-app/src/lib/styles/_common.scss
```

Expected (current): `161` header, `164:.mj-btn {`, `192/204/217/229: @extend .mj-btn;`, `249:.mj-btn-lg {`, `256` FORM header, `1174: .mj-btn {`, `1193: .mj-btn {`.

- [ ] **Step 2: Delete bottom-up.**

  a. In the `@media (max-width: 480px)` block, remove the rule (current L1193-1197, including the blank line after it):
  ```scss
      .mj-btn {
          padding: 8px 16px;
          font-size: 14px;
      }

  ```
  b. In the `@media (max-width: 768px)` block, inside `.mj-modal-footer { … }`, remove the nested rule and the blank line before it (current L1173-1176):
  ```scss

          .mj-btn {
              width: 100%;
          }
  ```
  Leave `.mj-modal-footer { padding: 15px 20px; flex-direction: column-reverse; }` in place.

  c. Remove current L160-254 inclusive: from the line `/* ===================================` that opens the `STANDARDIZED BUTTON SYSTEM` banner through the blank line after `.mj-btn-lg { … }`. The next surviving line must be the `/* ===…` banner of `STANDARDIZED FORM SYSTEM`, preceded by exactly one blank line.

  Everything inside L160-254 goes: `.mj-btn` (with its nested `&:disabled` and `.mj-btn-icon`), `.mj-btn-primary`, `.mj-btn-secondary`, `.mj-btn-ghost`, `.mj-btn-icon-only` (each with `@extend .mj-btn`), `.mj-btn-sm`, `.mj-btn-lg`.

- [ ] **Step 3: Run the button gate on the file**

```bash
./.github/scripts/check-mj-btn-override.sh --file packages/Angular/Explorer/explorer-app/src/lib/styles/_common.scss
```

Expected: `.mj-btn override prevention: 1 checked, 0 canonical, 0 violations`, exit 0.

- [ ] **Step 4: Confirm the partial still compiles standalone** (it only `@import`s `./variables`, so no node resolution is needed; the main checkout's Sass binary works from any directory)

```bash
cd packages/Angular/Explorer/explorer-app/src/lib/styles && /Users/matt/repos/MJ/node_modules/.bin/sass --no-source-map --quiet _common.scss > /dev/null && echo COMPILED
```

Expected: `COMPILED`. A failure here means an `@extend .mj-btn` survived somewhere; re-run the Step 1 grep.

- [ ] **Step 5: Confirm nothing else in the repo depended on the deleted classes**

```bash
grep -rnE 'mj-btn-(primary|secondary|ghost|icon-only|sm|lg|flat|icon)\b' --include='*.html' --include='*.ts' --exclude-dir=node_modules --exclude-dir=dist packages
```

Expected: no output. (explorer-settings has its own `_md3-shared.css` definitions and `_shared-patterns.scss` keeps its own single-dash rules; those are CSS definitions, not consumers, and are out of scope. See "Found, not fixed".)

- [ ] **Step 6: Checkpoint.** Show the diff. STOP for Matt. Suggested commit message if asked:

```
refactor(explorer-app): remove legacy .mj-btn-* block from _common.scss (#4845)
```

---

### Task 3: Delete the dead Kendo-era card/icon systems (all 12 `.k-*` rules live here)

**Files:**
- Modify: `packages/Angular/Explorer/explorer-app/src/lib/styles/_common.scss`

**Interfaces:**
- Consumes: Task 2's edits (line numbers below are pre-Task-2; after Task 2 subtract 95 from anything above L254 and a further 4 and 5 for the two media-query cuts. Re-anchor by banner text; do not trust arithmetic.)
- Produces: `grep -c '\.k-' _common.scss` is 0. Selectors `.mj-icon-card*`, `.mj-card-icon*`, `.mj-card-actions`, `.skip-icon*` no longer exist. `.mj-card`, `.mj-card:hover`, `.mj-card-header`, `.mj-card-body`, `.mj-card-footer`, `.view-card-content` (which `@extend`s `.mj-card-body`) all survive untouched.

If Matt chose **Option A** in D1, replace Step 2 with: delete only the twelve `.k-` selector lines/rules at current L478-481, L520-526, L549-551, L569-571, L608-610, L647 (remove the selector from the list, keep the rule), L1243-1245, L1284-1286, L1377-1379, L1382-1385 (the whole two-selector rule). Everything else in this task still applies.

- [ ] **Step 1: Re-anchor and record the consumer check**

```bash
F=packages/Angular/Explorer/explorer-app/src/lib/styles/_common.scss
grep -nE 'ICON CARD SYSTEM|STANDARDIZED GRID SYSTEM|^\.mj-card-actions \{|^/\* Icon Card Variant|^// Legacy icon card compatibility|^// Update existing view-card-content|SKIP ICON CSS-ONLY|^\.waiting' $F
grep -rnoE 'mj-icon-card|mj-card-icon\b|mj-card-actions|mj-card-icon-large|skip-icon(-large)?' --include='*.html' --include='*.ts' --exclude-dir=node_modules --exclude-dir=dist packages | grep -v '/styles/_common.scss'
```

Expected first grep (pre-Task-2 numbers): `400 .mj-card-actions`, `415 /* Icon Card Variant */`, `453 ICON CARD SYSTEM`, `662 STANDARDIZED GRID SYSTEM`, `1222 // Legacy icon card compatibility`, `1301 // Update existing view-card-content`, `1356 .waiting`, `1361 SKIP ICON`. Expected second grep: **no output**. If the second grep prints anything, STOP: a consumer appeared since 2026-10-05 and the corresponding block must stay.

- [ ] **Step 2: Delete bottom-up, by anchor.**

  a. **SKIP ICON block → end of file.** Delete from the blank line before the `/* ===… SKIP ICON CSS-ONLY IMPLEMENTATION` banner through the final `}` of `.mj-icon-card:hover .skip-icon-large { … }` (current L1359-1399). The file must now end with the closing `}` of `.waiting { cursor: wait !important; }` followed by a single newline. This removes `.skip-icon`, `.k-drawer-item:hover .skip-icon`, `.k-drawer-item.k-selected .skip-icon, .k-drawer-item.k-state-selected .skip-icon`, `.skip-icon-large`, and the two embedded SVG data URIs.

  b. **Legacy `.mj-card.mj-card-icon` redirect.** Delete from the comment line `// Legacy icon card compatibility - redirect to use icon card styles` through the closing `}` of `.mj-card.mj-card-icon { … }` and the blank line after it (current L1222-1300). The next surviving line is `// Update existing view-card-content to use new standards`. This removes the second `.k-chip` hover and the `.k-chip` transition inside it.

  c. **ICON CARD SYSTEM.** Delete from the `/* ===… ICON CARD SYSTEM` banner through the closing `}` of the `@media (prefers-reduced-motion: reduce) { … }` block and the blank line after it (current L452-660). The next surviving line is the `/* ===… STANDARDIZED GRID SYSTEM` banner, preceded by one blank line. This removes `.mj-icon-card` (with `.k-card-body`, `.k-chip`, `&:hover .k-chip`, `.mj-card-icon-large`, `.mj-card-actions`), the `-sm`/`-lg`/`-clickable` variants (three more `.k-card-body`), the 768px media block (`.k-card-body`), `.mj-icon-card:focus-visible`, the `prefers-contrast` block, and the `prefers-reduced-motion` block (`.mj-icon-card .k-chip` in its selector list).

  d. **Card icon variant rules inside the `.mj-card` section.** Delete current L400-451: `.mj-card-actions { … }`, `.mj-card:hover .mj-card-actions { … }`, the `/* Icon Card Variant */` comment, `.mj-card-icon { … }`, `.mj-card-icon .mj-card-icon-large { … }`, `.mj-card:hover .mj-card-icon-large { … }`, `.mj-card-icon h3 { … }`, `.mj-card-icon p { … }`, and the trailing blank line. The preceding `.mj-card-footer { … }` closing `}` is followed by one blank line and then the ICON CARD banner's replacement, i.e. the GRID SYSTEM banner.

- [ ] **Step 3: Verify every `.k-*` rule is gone and nothing live was cut**

```bash
F=packages/Angular/Explorer/explorer-app/src/lib/styles/_common.scss
grep -c '\.k-' $F; grep -nE '^\.mj-card(:hover|-header|-body|-footer)? \{|^\.view-card-content|@extend \.mj-card-body' $F
```

Expected: `0`, then one line each for `.mj-card {`, `.mj-card:hover {`, `.mj-card-header {`, `.mj-card-body {`, `.mj-card-footer {`, `.view-card-content {`, and the `@extend .mj-card-body;` inside it.

- [ ] **Step 4: Compile**

```bash
cd packages/Angular/Explorer/explorer-app/src/lib/styles && /Users/matt/repos/MJ/node_modules/.bin/sass --no-source-map --quiet _common.scss > /dev/null && echo COMPILED
```

Expected: `COMPILED`.

- [ ] **Step 5: Checkpoint.** Show the diff (it is large; lead with `git diff --stat`). STOP for Matt. Suggested commit message if asked:

```
refactor(explorer-app): drop dead Kendo-era icon-card and skip-icon rules (#4845)
```

---

### Task 4: Tokenize the nine hardcoded colors left in live rules

**Files:**
- Modify: `packages/Angular/Explorer/explorer-app/src/lib/styles/_common.scss`

**Interfaces:**
- Consumes: Tasks 2 and 3 (after them, only these nine lines trip the hex gate; re-run Step 1 to confirm).
- Produces: `check-css-hex-tokens.sh --file` reports 0 violations. Tokens used: `--mj-brand-primary`, `--mj-brand-secondary`, `--mj-bg-overlay`, `--mj-text-disabled`, `--mj-status-error` (all defined in `packages/Angular/Generic/shared/src/lib/_tokens.scss`, with dark-mode values).

Mapping rationale (per `.claude/rules/design-tokens.md` §"Translucent Colors with `color-mix()`" and the hex→token table): `rgba(0,118,182,a)` is `#0076b6`, MJ blue → `--mj-brand-primary` at `a`%. `rgba(9,35,64,a)` is `#092340`, MJ navy → `--mj-brand-secondary` (`brand-900`). `rgba(170,170,170,a)` is `#aaa` → `--mj-text-disabled`. `rgba(220,53,69,a)` is Bootstrap danger → `--mj-status-error`. The modal backdrop takes its dedicated semantic token, `--mj-bg-overlay`. `_shared-patterns.scss:686` already sets exactly that on `.mj-modal-overlay` and `_common.scss`'s navy rgba was overriding it by source order, so this aligns the two definitions. No MJ template renders `.mj-modal-overlay` (verified: zero consumers in `*.html`/`*.ts`), so there is nothing to screenshot in Explorer; a downstream app that writes the class gets slate-50% light / black-70% dark instead of navy-60%. The two input focus rings keep their 2px/20% look via `color-mix` rather than switching to `var(--mj-focus-ring)` (a two-layer ring); that switch is a design decision for Matt, not a cleanup PR.

- [ ] **Step 1: List what the hex gate still flags**

```bash
./.github/scripts/check-css-hex-tokens.sh --file packages/Angular/Explorer/explorer-app/src/lib/styles/_common.scss
```

Expected: exactly nine flagged lines, in rules `.form-control &:focus`, `.mj-card:hover` (two lines), `.mj-search … &:focus`, `.mj-modal-overlay`, `.mj-modal` (two lines), `.mj-modal-close`, `.mj-modal-close::before`. If a tenth appears, Task 3 left a dead block behind; go back.

- [ ] **Step 2: Apply the nine replacements** (each `old → new` is the full declaration; search by the old text)

```scss
/* .form-control &:focus */
box-shadow: 0 0 0 2px rgba(0, 118, 182, 0.2);
→ box-shadow: 0 0 0 2px color-mix(in srgb, var(--mj-brand-primary) 20%, transparent);

/* .mj-card:hover */
box-shadow:
    0 8px 32px rgba(9, 35, 64, 0.12),
    0 4px 16px rgba(0, 118, 182, 0.1);
→ box-shadow:
    0 8px 32px color-mix(in srgb, var(--mj-brand-secondary) 12%, transparent),
    0 4px 16px color-mix(in srgb, var(--mj-brand-primary) 10%, transparent);

/* .mj-search input &:focus */
box-shadow: 0 0 0 2px rgba(0, 118, 182, 0.2);
→ box-shadow: 0 0 0 2px color-mix(in srgb, var(--mj-brand-primary) 20%, transparent);

/* .mj-modal-overlay */
background: rgba(9, 35, 64, 0.6);
→ background: var(--mj-bg-overlay);

/* .mj-modal box-shadow, middle layer only; the rgba(0,0,0,…) and rgba(255,255,255,…) layers are allowed neutrals */
0 10px 30px rgba(0, 118, 182, 0.2),
→ 0 10px 30px color-mix(in srgb, var(--mj-brand-primary) 20%, transparent),

/* .mj-modal */
border: 2px solid rgba(0, 118, 182, 0.1);
→ border: 2px solid color-mix(in srgb, var(--mj-brand-primary) 10%, transparent);

/* .mj-modal-close */
background: rgba(170, 170, 170, 0.1);
→ background: color-mix(in srgb, var(--mj-text-disabled) 10%, transparent);

/* .mj-modal-close::before */
background: linear-gradient(90deg, transparent, rgba(220, 53, 69, 0.2), transparent);
→ background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--mj-status-error) 20%, transparent), transparent);
```

- [ ] **Step 3: Run both whole-file gates plus the focus-ring gate**

```bash
F=packages/Angular/Explorer/explorer-app/src/lib/styles/_common.scss
./.github/scripts/check-css-hex-tokens.sh --file $F && ./.github/scripts/check-mj-btn-override.sh --file $F && ./.github/scripts/check-focus-ring.sh --file $F && echo ALL_GATES_GREEN
```

Expected: `… 0 violations` from the first two, `no --mj-focus-ring outline misuse found` from the third, then `ALL_GATES_GREEN`.

- [ ] **Step 4: Compile**

```bash
cd packages/Angular/Explorer/explorer-app/src/lib/styles && /Users/matt/repos/MJ/node_modules/.bin/sass --no-source-map --quiet _common.scss > /dev/null && echo COMPILED
```

Expected: `COMPILED`.

- [ ] **Step 5: Checkpoint.** Show the diff. STOP for Matt; this is the step where he rules on `--mj-bg-overlay` vs. the navy tint. Suggested commit message if asked:

```
style(explorer-app): tokenize remaining hardcoded colors in _common.scss (#4845)
```

---

### Task 5: Changeset, package builds, and test tiers

**Files:**
- Create: `.changeset/remove-legacy-mj-btn-block.md`

**Interfaces:**
- Consumes: Tasks 1-4 complete.
- Produces: a `patch` changeset naming both packages, and recorded pass/fail/skip counts for every tier the Definition of Done requires.

- [ ] **Step 1: Write the changeset** (patch: no migration, no metadata)

```md
---
"@memberjunction/ng-explorer-app": patch
"@memberjunction/ng-file-storage": patch
---

Removes the legacy pre-`mjButton` button system from the Explorer global stylesheet (`_common.scss`): `.mj-btn-primary`, `.mj-btn-secondary`, `.mj-btn-ghost`, `.mj-btn-icon-only`, `.mj-btn-sm`, `.mj-btn-lg`, and the `.mj-btn-icon` child rule, plus two viewport overrides of `.mj-btn`. Buttons use `mjButton` with `variant`/`size` inputs, or the BEM classes `mj-btn mj-btn--<variant> mj-btn--<size>` where a directive cannot be applied. Also removes the dead Kendo-era icon-card and skip-icon rule sets (`.mj-icon-card*`, `.mj-card-icon*`, `.mj-card-actions`, `.skip-icon*`, every `.k-*` selector) and tokenizes the stylesheet's remaining hardcoded colors; the modal backdrop now uses `--mj-bg-overlay`. The Files grid's row action buttons now use `mj-btn--flat mj-btn--sm` instead of the undefined `mj-btn-flat mj-btn-sm`. Apps that consume `@memberjunction/ng-explorer-app/dist/styles.scss` and still write any removed class in a template should migrate to `mjButton`.
```

- [ ] **Step 2: Run the changeset self-check**

```bash
npm run check:changeset
```

Expected: passes with no bump-level complaint (both entries are `patch`, no `migrations/` or `metadata/` changes on the branch).

- [ ] **Step 3: Build explorer-app** (`ngc` + copy-assets; this is what publishes `dist/styles/_common.scss` for MJExplorer to `@use`)

```bash
cd packages/Angular/Explorer/explorer-app && pnpm run build
```

Expected: exit 0; `dist/styles/_common.scss` exists and `grep -c '\.k-' dist/styles/_common.scss` prints `0`.

- [ ] **Step 4: Unit tests for both touched packages**

```bash
cd packages/Angular/Explorer/explorer-app && pnpm test
cd ../../Generic/file-storage && pnpm test
```

Expected: every file passes. Record the counts (explorer-app has 2 spec files; file-storage has 8 plus the new one).

- [ ] **Step 5: Local CI mirror for the UI gates** (diff mode only sees commits, so run `--file` on the touched stylesheet as in Task 4 Step 3, and additionally the `ngc-scss` gate in CI mode to prove D3)

```bash
./.github/scripts/check-ngc-scss.sh --all | tail -3
```

Expected: `… 0 violations`.

- [ ] **Step 6: Integration tier.** The Definition of Done requires `pnpm run test:integration`. It needs a running MJAPI against Matt's dev database; the implementer does not start servers. Ask Matt to have `pnpm run start` up, then run:

```bash
pnpm run test:integration
```

Expected: the deterministic suite passes. This change touches no server code, so a failure here is pre-existing; report it with output rather than "fixing" unrelated tests.

- [ ] **Step 7: Checkpoint.** Show the changeset and all counts. STOP for Matt. Suggested commit message if asked:

```
chore: changeset for #4845 legacy button block removal
```

---

### Task 6: Visual verification (Matt's screenshot rule)

**Files:** none (evidence only)

**Interfaces:**
- Consumes: MJExplorer running against the rebuilt `ng-explorer-app` dist (Matt restarts Explorer after Task 5 Step 3; see memory `project_vite_stale_uicomponents_rebuild`).
- Produces: full-page screenshots, light and dark, of every changed surface (memory `feedback_screenshots_fullpage_every_instance`). Skip the ceremony if Matt is driving live (memory `feedback_no_screenshot_ceremony_when_user_drives`).

- [ ] **Step 1: Files grid action buttons** (Task 1). `<mj-files-grid>` has no consumer in this repo (only its module declaration), so Explorer cannot show it; the unit test and the served CSS are the evidence. Note the real before/after for downstream consumers: `FilesGridComponent` uses default emulated encapsulation and the renderer creates the `<button>` imperatively, so the `.grid-action-btn` rules in `files-grid.css` never matched these elements (no `_ngcontent` attribute). Before: canonical base `.mj-btn` only (44px, `10px 20px`, UA button background, hover lift). After: `--flat` + `--sm` (transparent, `--mj-text-secondary`, `6px 12px`, 32px, no lift; 44px / `10px 12px` under `pointer: coarse`, narrower than before, so no new overflow risk).
- [ ] **Step 2: `.mj-card:hover`** (Task 4). Any dashboard that renders `.mj-card` tiles (99 template usages; the Home dashboard cards are the easiest). Hover one; the shadow should read as brand-tinted exactly as before in light mode and slightly lighter in dark.
- [ ] **Step 3: `.mj-search` and `.form-control` focus rings** (Task 4). Focus a `.mj-search` input and a `.form-control` input; the 2px 20% brand ring must match pre-change.
- [ ] **Step 4: `.mj-modal` family** (Task 4). No MJ template renders `.mj-modal-overlay`, `.mj-modal`, or `.mj-modal-close` (file-grid's dialogs use `.mj-modal-backdrop` / `.mj-modal-window`), so there is no surface to capture. Verify instead that the served `styles.css` carries `background: var(--mj-bg-overlay)` for `.mj-modal-overlay` and none of the old rgba values.
- [ ] **Step 5: Phone viewport sanity for D2.** At ≤480px, buttons across any page should look identical to `next` (the deleted override was already cascaded away). At ≤768px, the file-browser dialog footers should look identical (they use `.mj-action-btn`, not `.mj-btn`).
- [ ] **Step 6: Checkpoint.** Deliver the screenshot set and STOP (memory `feedback_commit_after_screenshot_review`).

---

### Task 7: Pull request (Matt approves creation; Matt signs off on the text)

**Files:** none

- [ ] **Step 1: Verify tracking one more time before any push**

```bash
git branch -vv | grep '^\*'
```

Expected: `[origin/fix/4845-legacy-mj-btn-block]`.

- [ ] **Step 2: Draft the PR for Matt's review** (nothing is posted until he OKs the text; memory `feedback_outward_posts_need_signoff`). Reviewer: `@rkihm-BC` (UX-only PR routing; memory `feedback_pr_reviewer_routing`). Base: `next`. Body outline:

  - `Closes #4845`.
  - What: the four commits above, one paragraph each.
  - Why the scope is wider than the issue title: D1 (whole-file hex gate) and D2 (two undocumented `.mj-btn` overrides), each in two sentences.
  - Downstream: D5 in two sentences.
  - Evidence: gate outputs, test counts, the screenshot set.
  - Found, not fixed (filed as follow-up issues, see below).
  - Footer: `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

- [x] **Step 3: Follow-ups — all four landed on this branch at Matt's request (2026-10-05) instead of being filed:**
  1. `_shared-patterns.scss` L227-290 still defines single-dash `.mj-btn-primary/-secondary/-ghost/-danger/-sm` alongside the live `.action-btn`/`.control-btn` selectors; with zero template consumers those selector-list members are dead. explorer-settings `_md3-shared.css` L35-100 duplicates the whole legacy set too. Same cleanup, different files.
  2. `explorer-app.component.ts:469` and `Bootstrap/.../initialization.service.ts:137` still `querySelector('li.k-drawer-item.k-level-0')`, a Kendo drawer that no longer exists; the branch is dead code.
  3. `files-grid.css:44-62` `.grid-action-btn` is dead under emulated encapsulation (see "Found, not fixed"); delete or `::ng-deep` it.
  4. The consumer-less `.mj-modal-overlay` / `.mj-modal` / `.mj-modal-close` / `.mj-modal-sm..xl` rules in `_common.scss` (and the duplicate `.mj-modal-overlay` in `_shared-patterns.scss:686`) are candidates for the same Option B deletion; Matt's scope call.

  Done: (1) `_shared-patterns.scss` lost `.mj-btn`, `.mj-btn-primary/-secondary/-ghost/-danger/-sm` from its selector lists (the `.action-btn`/`.control-btn` rules stay); explorer-settings' never-loaded `_md3-shared.css` deleted and three dead `.mobile-action-buttons .mj-btn-sm` / `.bulk-action-buttons .mj-btn-sm` rules removed. (2) Both Kendo `querySelector` branches removed; `MJInitializationService.NavigateToInitialRoute` now navigates only for non-root paths, pinned by three characterization tests added to `initialization.service.test.ts` before the refactor. (3) `.grid-action-btn` / `.action-buttons` CSS and their class names removed; test tightened to the exact canonical class string. (4) `.mj-modal-overlay`, `.mj-modal`, both modal keyframes, `.mj-modal-sm..xl`, `.mj-modal-title`, `.mj-modal-close`, `.mj-modal-confirm*`, `.mj-modal-loading*` removed from `_common.scss` and the `.mj-modal-overlay` selector dropped from `_shared-patterns.scss`; `.mj-modal-header/-body/-footer` and the global `@keyframes spin` (nine component stylesheets depend on it) stay.

## Found, not fixed (recorded for the PR body)

- The `.mj-btn` gate's regex does not flag `.mj-btn-primary`-style single-dash selectors (negative lookahead on `-`), which is why `_shared-patterns.scss` and `_md3-shared.css` pass today despite defining a parallel legacy set. Worth a note on the gate, not a change in this PR.
- `files-grid.css:44-62` `.grid-action-btn` rules are dead for the row buttons: the component uses emulated encapsulation and the AG Grid renderer builds the buttons with `document.createElement`, so they never carry the `_ngcontent` attribute the scoped selector requires. Pre-existing. Follow-up: delete those rules or move them under `::ng-deep`.
