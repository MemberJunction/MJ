# Change Log - @memberjunction/ng-generic-dialog

## 6.3.0-edge.0

### Patch Changes

- 4884a47: Finish the Kendo removal: no Kendo references remain in shipped code, templates, package metadata, or live docs. One stylesheet is deliberately left alone: `explorer-app/src/lib/styles/_common.scss` keeps 12 dead `.k-*` rules because it also defines the legacy `.mj-btn` block, which `check:ui-buttons` grades the moment the file is touched; that block's removal is a separate migration.

  Kendo was already gone from the dependency graph — zero `@progress/kendo*` entries in any `package.json`, zero TypeScript imports. What was left was residue, and some of it was not inert:

  **Dead code and styles removed**
  - 82 `.k-*` CSS rules across 21 files. Nothing has defined those classes since the removal, so every one of them was a no-op.
  - `li.k-drawer-item.k-level-0` was still being queried in `MJExplorerAppComponent` and `InitializationService` to auto-select the first nav item when landing on `/`. The Kendo Drawer is long gone, so `querySelector` returned null and the branch did nothing — removing it is a runtime no-op. **If landing on `/` should select the first nav item, that behaviour needs reimplementing against the current shell nav; it has been silently absent since the removal.**
  - `dialog.service.ts.bak` (dead backup importing `@progress/kendo-angular-dialog`) deleted.
  - `kendo-ui-license.txt` dropped from `DistributionAssembler`'s Angular ignore list, and its now-meaningless assertion retargeted in the test.

  **Broken templates fixed** — three components still applied Kendo utility classes that no longer resolve:
  - `add-item.component` — `k-actions k-actions-end` was supplying the footer's flex row, so `.customBtn button { flex: 1 }` had no flex container. `.popup-actions` now provides it.
  - `delete-item.component` — `k-m-7.5 k-text-center` were Kendo spacing/alignment utilities (30px margin, centered) whose theme CSS left with the removal, so the confirmation copy had been rendering unstyled. Replaced with a real `.confirm-message` class.
  - `add-item` and `ng-data-context-dialog` each carried a `<div class="k-overlay">` backdrop. `mj-window` deliberately has no backdrop, so these are now unstyled empty divs — **deleted, which means both dialogs currently render with no backdrop.** Restoring one is a UX call, not a cleanup.

  **Filter payload is MJ's own type**
  `FilterOperator` / `FilterLogic` / `FilterDescriptor` / `CompositeFilterDescriptor` and their guards were already defined in `@memberjunction/core` (`generic/filters/filter.types.ts`) — `ng-filter-builder` carried a byte-equivalent duplicate set and re-exported it. The duplicate is gone; the builder and `ng-entity-viewer` import the shapes from core, and the builder exports only its own UI types.

  **API surface change (`@memberjunction/ng-filter-builder`)**: `FilterOperator`, `FilterLogic`, `FilterDescriptor`, `CompositeFilterDescriptor`, `IsCompositeFilter` and `IsSimpleFilter` are no longer re-exported. Import them from `@memberjunction/core` instead. This aligns with the repo's no-cross-package-re-exports rule.

  **Docs and comments** — 33 package READMEs listed `@progress/kendo-angular-*` packages as live dependencies (they aren't) and drew Kendo components in their mermaid diagrams; `packages/Angular/CLAUDE.md`, four guides, and ~55 source comments referenced Kendo as though it were still present. All rewritten to describe what the code actually uses.

  Historical records are deliberately untouched: `plans/`, CHANGELOGs, and dated retrospectives (`FINAL_REPORT.md`, `PIXEL_PERFECT_COMPLETE.md`, `USER_MENU_PROPOSAL.md`, timeline `PRD.md` version history) still mention Kendo, because they are records of when it was there.

- Updated dependencies [1b282a0]
- Updated dependencies [4884a47]
- Updated dependencies [6fd9fb7]
  - @memberjunction/ng-ui-components@6.3.0-edge.0

## 6.2.0

### Patch Changes

- Updated dependencies [0581392]
- Updated dependencies [6dc3aa9]
- Updated dependencies [8b62f8c]
- Updated dependencies [490cd8d]
- Updated dependencies [80905a1]
- Updated dependencies [5e1e343]
- Updated dependencies [db4e210]
- Updated dependencies [920bef8]
- Updated dependencies [60bd774]
- Updated dependencies [369e229]
- Updated dependencies [e7b2ebc]
- Updated dependencies [e0cf9ed]
  - @memberjunction/ng-ui-components@6.2.0

## 6.2.0-edge.8

### Patch Changes

- @memberjunction/ng-ui-components@6.2.0-edge.8

## 6.2.0-edge.7

### Patch Changes

- @memberjunction/ng-ui-components@6.2.0-edge.7

## 6.2.0-edge.6

### Patch Changes

- Updated dependencies [0581392]
- Updated dependencies [db4e210]
  - @memberjunction/ng-ui-components@6.2.0-edge.6

## 6.2.0-edge.5

### Patch Changes

- Updated dependencies [8b62f8c]
  - @memberjunction/ng-ui-components@6.2.0-edge.5

## 6.2.0-edge.4

### Patch Changes

- Updated dependencies [6dc3aa9]
- Updated dependencies [490cd8d]
- Updated dependencies [5e1e343]
- Updated dependencies [e7b2ebc]
- Updated dependencies [e0cf9ed]
  - @memberjunction/ng-ui-components@6.2.0-edge.4

## 6.2.0-edge.3

### Patch Changes

- Updated dependencies [60bd774]
  - @memberjunction/ng-ui-components@6.2.0-edge.3

## 6.2.0-edge.2

### Patch Changes

- Updated dependencies [369e229]
  - @memberjunction/ng-ui-components@6.2.0-edge.2

## 6.2.0-edge.1

### Patch Changes

- Updated dependencies [80905a1]
- Updated dependencies [920bef8]
  - @memberjunction/ng-ui-components@6.2.0-edge.1

## 6.2.0-edge.0

### Patch Changes

- @memberjunction/ng-ui-components@6.2.0-edge.0

## 6.1.0

### Patch Changes

- b915983: Align the Angular toolchain on the current 21.x patch line: framework packages 21.1.3 → 21.2.22,
  CLI/builders 21.1.3 → 21.2.23, CDK 21.1.3 → 21.2.14, ng-packagr → 21.2.7, PrimeNG 21.1.1 → 21.1.9.

  This is a patch-level move inside the supported Angular 21 LTS line, not a framework migration.
  It closes every open Angular security advisory on the repository — fifteen distinct GHSAs
  (i18n and template-sanitizer XSS bypasses, service-worker header leakage and credential
  stripping, HttpTransferCache cross-request leakage, and formatDate/number-format DoS), all fixed
  in 21.2.19 or earlier — which together accounted for 438 of the 749 open Dependabot alerts.

  Every published `@memberjunction/ng-*` package's `@angular/*` peer range moves from `^21.1.3`
  (or `^21.0.0`) to `^21.2.22`, so consumers must be on at least that patch. The era-6 platform
  manifest in `release-lines.json` records the new pin; era 5 (the certified 5.51 line) is
  unchanged.

  Also moves the exact `@angular/*` runtime pins that 23 libraries carried in `dependencies`
  into caret `peerDependencies` (adding the missing peers on `ng-react`), so a consumer on any
  in-range Angular 21.2.x build gets a single Angular copy instead of a nested second runtime, and
  drops the unused `primeng` peer from `ng-base-forms` (nothing in the repo imports PrimeNG).

- 394d276: Declare @angular/\* peer dependencies as ranges (^21.1.3) instead of exact pins across all Angular library packages. Peer declarations are compatibility claims, not install instructions: the exact pins falsely claimed incompatibility with every other Angular 21.x build, produced 502 peer-resolution errors under strict pnpm workspaces, and structurally blocked Angular security patches behind a full republish. Installed versions remain pinned by consuming apps and the era platform manifest; dependencies/devDependencies keep their exact pins.
- Updated dependencies [394d276]
- Updated dependencies [b915983]
- Updated dependencies [b895f92]
- Updated dependencies [4c1de04]
- Updated dependencies [c09c818]
- Updated dependencies [d26e202]
- Updated dependencies [394d276]
- Updated dependencies [6ecfaa0]
- Updated dependencies [cf2484c]
- Updated dependencies [394d276]
  - @memberjunction/ng-ui-components@6.1.0

## 6.1.0-edge.7

### Patch Changes

- Updated dependencies [cf2484c]
  - @memberjunction/ng-ui-components@6.1.0-edge.7

## 6.1.0-edge.6

### Patch Changes

- b915983: Align the Angular toolchain on the current 21.x patch line: framework packages 21.1.3 → 21.2.22,
  CLI/builders 21.1.3 → 21.2.23, CDK 21.1.3 → 21.2.14, ng-packagr → 21.2.7, PrimeNG 21.1.1 → 21.1.9.

  This is a patch-level move inside the supported Angular 21 LTS line, not a framework migration.
  It closes every open Angular security advisory on the repository — fifteen distinct GHSAs
  (i18n and template-sanitizer XSS bypasses, service-worker header leakage and credential
  stripping, HttpTransferCache cross-request leakage, and formatDate/number-format DoS), all fixed
  in 21.2.19 or earlier — which together accounted for 438 of the 749 open Dependabot alerts.

  Every published `@memberjunction/ng-*` package's `@angular/*` peer range moves from `^21.1.3`
  (or `^21.0.0`) to `^21.2.22`, so consumers must be on at least that patch. The era-6 platform
  manifest in `release-lines.json` records the new pin; era 5 (the certified 5.51 line) is
  unchanged.

  Also moves the exact `@angular/*` runtime pins that 23 libraries carried in `dependencies`
  into caret `peerDependencies` (adding the missing peers on `ng-react`), so a consumer on any
  in-range Angular 21.2.x build gets a single Angular copy instead of a nested second runtime, and
  drops the unused `primeng` peer from `ng-base-forms` (nothing in the repo imports PrimeNG).

- Updated dependencies [b915983]
- Updated dependencies [4c1de04]
  - @memberjunction/ng-ui-components@6.1.0-edge.6

## 6.1.0-edge.5

### Patch Changes

- Updated dependencies [c09c818]
  - @memberjunction/ng-ui-components@6.1.0-edge.5

## 6.1.0-edge.4

### Patch Changes

- @memberjunction/ng-ui-components@6.1.0-edge.4

## 6.1.0-edge.3

### Patch Changes

- Updated dependencies [6ecfaa0]
  - @memberjunction/ng-ui-components@6.1.0-edge.3

## 6.1.0-edge.2

### Patch Changes

- @memberjunction/ng-ui-components@6.1.0-edge.2

## 6.1.0-edge.1

### Patch Changes

- 394d276: Declare @angular/\* peer dependencies as ranges (^21.1.3) instead of exact pins across all Angular library packages. Peer declarations are compatibility claims, not install instructions: the exact pins falsely claimed incompatibility with every other Angular 21.x build, produced 502 peer-resolution errors under strict pnpm workspaces, and structurally blocked Angular security patches behind a full republish. Installed versions remain pinned by consuming apps and the era platform manifest; dependencies/devDependencies keep their exact pins.
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
  - @memberjunction/ng-ui-components@6.1.0-edge.1

## 6.1.0-edge.0

### Patch Changes

- Updated dependencies [b895f92]
- Updated dependencies [d26e202]
  - @memberjunction/ng-ui-components@6.1.0-edge.0

## 6.0.0

### Patch Changes

- @memberjunction/ng-ui-components@6.0.0

## 5.51.0

### Patch Changes

- @memberjunction/ng-ui-components@5.51.0

## 5.50.0

### Patch Changes

- @memberjunction/ng-ui-components@5.50.0

## 5.49.0

### Patch Changes

- @memberjunction/ng-ui-components@5.49.0

## 5.48.0

### Patch Changes

- @memberjunction/ng-ui-components@5.48.0

## 5.47.0

### Patch Changes

- @memberjunction/ng-ui-components@5.47.0

## 5.46.0

### Patch Changes

- @memberjunction/ng-ui-components@5.46.0

## 5.45.1

### Patch Changes

- @memberjunction/ng-ui-components@5.45.1

## 5.45.0

### Patch Changes

- Updated dependencies [13716e4]
- Updated dependencies [c1f2d3d]
  - @memberjunction/ng-ui-components@5.45.0

## 5.44.0

### Patch Changes

- Updated dependencies [f8be8a0]
- Updated dependencies [1e5e449]
- Updated dependencies [0476455]
  - @memberjunction/ng-ui-components@5.44.0

## 5.43.0

### Patch Changes

- Updated dependencies [54183aa]
  - @memberjunction/ng-ui-components@5.43.0

## 5.42.0

### Patch Changes

- Updated dependencies [313c1c5]
  - @memberjunction/ng-ui-components@5.42.0

## 5.41.0

### Patch Changes

- @memberjunction/ng-ui-components@5.41.0

## 5.40.2

### Patch Changes

- @memberjunction/ng-ui-components@5.40.2

## 5.40.1

### Patch Changes

- @memberjunction/ng-ui-components@5.40.1

## 5.40.0

### Patch Changes

- @memberjunction/ng-ui-components@5.40.0

## 5.39.0

### Patch Changes

- Updated dependencies [bd95e83]
- Updated dependencies [3b29882]
  - @memberjunction/ng-ui-components@5.39.0

## 5.38.0

### Patch Changes

- @memberjunction/ng-ui-components@5.38.0

## 5.37.0

### Patch Changes

- @memberjunction/ng-ui-components@5.37.0

## 5.36.0

### Patch Changes

- Updated dependencies [1c0fce9]
  - @memberjunction/ng-ui-components@5.36.0

## 5.35.0

### Patch Changes

- Updated dependencies [ee380f7]
- Updated dependencies [ac4b9a5]
  - @memberjunction/ng-ui-components@5.35.0

## 5.34.1

### Patch Changes

- @memberjunction/ng-ui-components@5.34.1

## 5.34.0

### Patch Changes

- 7d8a0f9: Bound memory leaks: ResultHistory cap, QueueBase Stop/ IShutdownable, A2AServer, TaskStore, sweep, MJLruCache for provider / issuer caches, BaseLLM streaming reset, ShutdownRegister + SIGTERM contract.
- Updated dependencies [7d8a0f9]
  - @memberjunction/ng-ui-components@5.34.0

## 5.33.0

### Patch Changes

- @memberjunction/ng-ui-components@5.33.0

## 5.32.0

### Patch Changes

- @memberjunction/ng-ui-components@5.32.0

## 5.31.0

### Patch Changes

- 7ed7a4b: no metadata/migration changes
- Updated dependencies [7ed7a4b]
  - @memberjunction/ng-ui-components@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/ng-ui-components@5.30.1

## 5.30.0

### Patch Changes

- @memberjunction/ng-ui-components@5.30.0

## 5.29.0

### Patch Changes

- @memberjunction/ng-ui-components@5.29.0

## 5.28.0

### Patch Changes

- @memberjunction/ng-ui-components@5.28.0

## 5.27.1

### Patch Changes

- @memberjunction/ng-ui-components@5.27.1

## 5.27.0

### Patch Changes

- @memberjunction/ng-ui-components@5.27.0

## 5.26.0

### Patch Changes

- Updated dependencies [55de456]
  - @memberjunction/ng-ui-components@5.26.0

## 5.25.0

### Patch Changes

- @memberjunction/ng-ui-components@5.25.0

## 5.24.0

### Patch Changes

- @memberjunction/ng-ui-components@5.24.0

## 5.23.0

### Patch Changes

- Updated dependencies [58af481]
- Updated dependencies [fb0c69f]
  - @memberjunction/ng-ui-components@5.23.0

## 5.22.0

## 5.21.0

## 5.20.0

## 5.19.0

## 5.18.0

## 5.17.0

## 5.16.0

## 5.15.0

## 5.14.0

## 5.13.0

## 5.12.0

## 5.11.0

## 5.10.1

## 5.10.0

## 5.9.0

## 5.8.0

## 5.7.0

## 5.6.0

## 5.5.0

### Patch Changes

- df2457c: no migration, just small code changes

## 5.4.1

## 5.4.0

## 5.3.1

## 5.3.0

## 5.2.0

## 5.1.0

## 5.0.0

### Major Changes

- 4aa1b54: breaking changes due to class name updates/approach

## 4.4.0

## 4.3.1

## 4.3.0

## 4.2.0

## 4.1.0

## 4.0.0

### Major Changes

- 8366d44: we goin' to 4.0!
- b503400: filter dialog fixes
- fe73344: Angular 21/Node 24/ESM everywhere, and more
- 5f6306c: 4.0

### Minor Changes

- e06f81c: changed SO much!

## 3.4.0

## 3.3.0

## 3.2.0

## 3.1.1

## 3.0.0

## 2.133.0

## 2.132.0

## 2.131.0

## 2.130.1

## 2.130.0

## 2.129.0

## 2.128.0

## 2.127.0

## 2.126.1

## 2.126.0

## 2.125.0

## 2.124.0

## 2.123.1

## 2.123.0

## 2.122.2

## 2.122.1

## 2.122.0

## 2.121.0

## 2.120.0

## 2.119.0

## 2.118.0

## 2.117.0

## 2.116.0

## 2.115.0

## 2.114.0

## 2.113.2

## 2.112.0

## 2.110.1

## 2.110.0

## 2.109.0

## 2.108.0

### Minor Changes

- 56dc09f: Artifact Collection UI + Collection Permission Migration

## 2.107.0

## 2.106.0

## 2.105.0

## 2.104.0

## 2.103.0

### Patch Changes

- addf572: Bump all packages to 2.101.0

## 2.100.3

## 2.100.2

## 2.100.1

## 2.100.0

## 2.99.0

## 2.98.0

## 2.97.0

## 2.96.0

## 2.95.0

## 2.94.0

## 2.93.0

## 2.92.0

## 2.91.0

## 2.90.0

## 2.89.0

## 2.88.0

## 2.87.0

## 2.86.0

## 2.85.0

## 2.84.0

## 2.83.0

## 2.82.0

## 2.81.0

## 2.80.1

## 2.80.0

## 2.79.0

## 2.78.0

## 2.77.0

## 2.76.0

## 2.75.0

## 2.74.0

## 2.73.0

## 2.72.0

## 2.71.0

### Patch Changes

- 5a127bb: Remove status badge dots

## 2.70.0

## 2.69.1

## 2.69.0

## 2.68.0

## 2.67.0

## 2.66.0

## 2.65.0

## 2.64.0

## 2.63.1

## 2.63.0

## 2.62.0

## 2.61.0

## 2.60.0

## 2.59.0

## 2.58.0

## 2.57.0

## 2.56.0

## 2.55.0

## 2.54.0

## 2.53.0

## 2.52.0

## 2.51.0

## 2.50.0

## 2.49.0

### Minor Changes

- 62cf1b6: Removed TypeORM which resulted in changes to nearly every package

## 2.48.0

## 2.47.0

## 2.46.0

## 2.45.0

## 2.44.0

## 2.43.0

## 2.42.1

## 2.42.0

## 2.41.0

## 2.40.0

## 2.39.0

## 2.38.0

## 2.37.1

## 2.37.0

## 2.36.1

## 2.36.0

### Minor Changes

- 920867c: This PR mainly introduces the components to wire up the new Skip Learning Cycle. It also includes the addition of several reasoning models. Changes include:Additions to the AskSkipResolver.ts file: Includes methods to build the necessary entities for a call to the learning cycle API, the actual call to the API, and post-processing of resulting note changes.Addition of a LearningCycleScheduler: This class handles the asynchronous calls to the learning cycle API on an interval that defaults to 60 minutes.Reasoning models from OpenAI and Gemini added to AI Models tableNew field "SupportsEffortLevel" added to AI Models table
- 2e6fd3c: This PR mainly introduces the components to wire up the new Skip Learning Cycle. It also includes the addition of several reasoning models. Changes include:Additions to the AskSkipResolver.ts file: Includes methods to build the necessary entities for a call to the learning cycle API, the actual call to the API, and post-processing of resulting note changes.Addition of a LearningCycleScheduler: This class handles the asynchronous calls to the learning cycle API on an interval that defaults to 60 minutes.Reasoning models from OpenAI and Gemini added to AI Models tableNew field "SupportsEffortLevel" added to AI Models table

## 2.35.1

## 2.35.0

## 2.34.2

## 2.34.1

## 2.34.0

## 2.33.0

## 2.32.2

## 2.32.1

## 2.32.0

## 2.31.0

## 2.30.0

## 2.29.2

## 2.28.0

## 2.27.1

## 2.27.0

## 2.26.1

## 2.26.0

## 2.25.0

## 2.24.1

## 2.24.0

## 2.23.2

## 2.23.1

## 2.23.0

## 2.22.2

## 2.22.1

## 2.22.0

This log was last generated on Thu, 06 Feb 2025 05:11:44 GMT and should not be manually modified.

<!-- Start content -->

## 2.21.0

Thu, 06 Feb 2025 05:11:44 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)

## 2.20.3

Thu, 06 Feb 2025 04:34:26 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)

## 2.20.0

Sun, 26 Jan 2025 20:07:04 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)

## 2.19.0

Tue, 21 Jan 2025 00:15:47 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)

## 2.16.1

Tue, 14 Jan 2025 14:12:27 GMT

### Patches

- Fix for SQL scripts (craig@memberjunction.com)

## 2.15.2

Mon, 13 Jan 2025 18:14:28 GMT

### Patches

- Bump patch version (craig@memberjunction.com)
- Bump patch version (craig@memberjunction.com)

## 2.9.0

Tue, 22 Oct 2024 14:57:08 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
