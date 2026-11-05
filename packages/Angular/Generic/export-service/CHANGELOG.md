# @memberjunction/ng-export-service

## 6.2.1

### Patch Changes

- Updated dependencies [41142bd]
  - @memberjunction/core@6.2.1
  - @memberjunction/ng-base-types@6.2.1
  - @memberjunction/ng-shared-generic@6.2.1
  - @memberjunction/excel-addin@6.2.1
  - @memberjunction/ng-ui-components@6.2.1
  - @memberjunction/export-engine@6.2.1

## 6.2.0

### Patch Changes

- 555a3f3: Add the Excel add-in's first release: a unified **Export ▾** toolbar menu across entity grids (both `(Default)` entity views and saved views) and query results grids offers **Open in Excel** alongside snapshot export, downloading a connected workbook that holds no rows and fills, in Excel, with what the person who opens it can see. Inside Excel, the MemberJunction task pane supports connecting to any MemberJunction server (via Office Dialog sign-in or external-browser encrypted connection-code handoff), browsing Applications, Entities, Saved Views, and Query Categories/Saved Queries with parameters directly from any workbook, and managing/refreshing all connected worksheets. New packages `@memberjunction/excel-addin` (workbook contract, typed `ExcelAddin.*` Remote Operations, encrypted sign-in handoff, the add-in pane) and `@memberjunction/excel-addin-server` (a Server Extension that serves the add-in and a per-host manifest, plus the operations' server bodies). Excel signs in through Explorer's new `office/connect` page, which Explorer renders on its own like the OAuth callback, and holds a per-user API key scoped to `view:run` and `query:run`. Off until a host configures the `ExcelAddinServerExtension`; see `guides/EXCEL_ADDIN_GUIDE.md`.
- 80905a1: Rename public class members and exported functions to PascalCase, per MJ's naming convention,
  **without breaking a single consumer**.

  Every renamed symbol keeps its old name beside the new one as a `@deprecated` stub that forwards to
  it — a delegating method or function, a getter/setter pair for a property, and for Angular a
  readable accessor pair for an `@Input` and a second `@Output` sharing the same `EventEmitter`, so a
  template still binding the old name keeps receiving events. Old names still compile, still resolve,
  and still behave identically; the deprecation tag rides through to the published `.d.ts`, so editors
  point callers at the replacement. Where a package re-exports through an explicit `export { … }`
  list, the new name is added alongside the old, so the correct name is actually on the public surface
  rather than merely declared.

  The rename is deliberately refused wherever a mechanical stub would not be equivalent, because
  several of those shapes change a type contract while still compiling in the package that declares
  them:
  - an **optional** property or parameter property — TypeScript has no optional accessor, so a stub
    would promote `foo?` to a required member and break every object literal that omits it;
  - a class that is a **data shape** (no methods, or `@ObjectType`/`@InputType`) — object literals are
    assigned to it, and an accessor stub changes what they must supply;
  - a property whose **subclass redeclares it**, since TypeScript forbids a property overriding an
    accessor (TS2610);
  - a name whose PascalCase form is **already bound** in that file or class;
  - decorated members, `get`/`set` pairs behind a decorator, generators, destructured parameters,
    overload sets and abstract members.

  **One wire-visible consequence, for version skew only.** `BaseInfo.toJSON` walks `_`-prefixed
  backing fields and emits them through their public getter, preferring the PascalCase one. Renaming
  the 23 field aliases in `MJCore/src/generic` therefore changes what `AllMetadata` carries:
  `EntityInfo.spCreate` and friends now serialize as `SpCreate`. A same-version client is unaffected —
  `copyInitData` accepts a value through a settable accessor, so either spelling lands on the right
  field. An OLDER client against a newer server has no such path in its `copyInitData` and drops those
  fields silently. Same-version deployments, which is the supported configuration, see no change.

  Each package was verified against its own pre-change baseline rather than against zero, because
  several packages in this repo do not typecheck cleanly to begin with. Angular packages were verified
  with `ngc`, not `tsc`: a plain typecheck does not compile templates, and an earlier write-only
  `@Input` alias passed `tsc` while breaking six template reads.

- Updated dependencies [39b35f1]
- Updated dependencies [e97d95c]
- Updated dependencies [6c36fb6]
- Updated dependencies [cc36de5]
- Updated dependencies [9cb815b]
- Updated dependencies [709de1a]
- Updated dependencies [c159e2f]
- Updated dependencies [d2db108]
- Updated dependencies [dfe40a4]
- Updated dependencies [b5955fb]
- Updated dependencies [d538c14]
- Updated dependencies [a3539d2]
- Updated dependencies [db39145]
- Updated dependencies [41274aa]
- Updated dependencies [0581392]
- Updated dependencies [c671f85]
- Updated dependencies [49f26d9]
- Updated dependencies [5e4205c]
- Updated dependencies [7be1684]
- Updated dependencies [21f9e15]
- Updated dependencies [c8c48e1]
- Updated dependencies [f2248d5]
- Updated dependencies [5465489]
- Updated dependencies [3bace5a]
- Updated dependencies [88e6902]
- Updated dependencies [83486cf]
- Updated dependencies [6dc3aa9]
- Updated dependencies [c87f87a]
- Updated dependencies [f4cd5fb]
- Updated dependencies [e1fd4c1]
- Updated dependencies [a3d6182]
- Updated dependencies [4248fb3]
- Updated dependencies [d29b5c2]
- Updated dependencies [59e32e0]
- Updated dependencies [8b62f8c]
- Updated dependencies [490cd8d]
- Updated dependencies [0a7c255]
- Updated dependencies [0adaf76]
- Updated dependencies [0ff7523]
- Updated dependencies [d86bcbc]
- Updated dependencies [555a3f3]
- Updated dependencies [42df19d]
- Updated dependencies [d6b39c4]
- Updated dependencies [5f0baf7]
- Updated dependencies [f65fec7]
- Updated dependencies [9b5b489]
- Updated dependencies [cb205de]
- Updated dependencies [a6f8c1c]
- Updated dependencies [56d7614]
- Updated dependencies [683f652]
- Updated dependencies [914e6ff]
- Updated dependencies [0fb3649]
- Updated dependencies [902d086]
- Updated dependencies [62c91ea]
- Updated dependencies [705ab4e]
- Updated dependencies [a7da50b]
- Updated dependencies [0f04590]
- Updated dependencies [4c0eaec]
- Updated dependencies [e225ece]
- Updated dependencies [f26084f]
- Updated dependencies [db39145]
- Updated dependencies [f48dffc]
- Updated dependencies [41c2c08]
- Updated dependencies [630bb88]
- Updated dependencies [e69634e]
- Updated dependencies [b73e3bc]
- Updated dependencies [08be974]
- Updated dependencies [17cc774]
- Updated dependencies [dae1d31]
- Updated dependencies [bfd67c6]
- Updated dependencies [80905a1]
- Updated dependencies [397ae9a]
- Updated dependencies [7e72c86]
- Updated dependencies [a17a228]
- Updated dependencies [ee1f0d9]
- Updated dependencies [5e1e343]
- Updated dependencies [104125c]
- Updated dependencies [7e57b48]
- Updated dependencies [7e57b48]
- Updated dependencies [db4e210]
- Updated dependencies [d296edd]
- Updated dependencies [66fd011]
- Updated dependencies [6a5fb64]
- Updated dependencies [0e93e1f]
- Updated dependencies [509d2aa]
- Updated dependencies [196160a]
- Updated dependencies [5513c2a]
- Updated dependencies [90829e3]
- Updated dependencies [5986939]
- Updated dependencies [8c120db]
- Updated dependencies [9a2d7cc]
- Updated dependencies [3ab85f9]
- Updated dependencies [17a4137]
- Updated dependencies [b4afc13]
- Updated dependencies [c65f754]
- Updated dependencies [49d0d3c]
- Updated dependencies [920bef8]
- Updated dependencies [60bd774]
- Updated dependencies [0a348e2]
- Updated dependencies [ac18db8]
- Updated dependencies [35da130]
- Updated dependencies [5b41d48]
- Updated dependencies [4b9542c]
- Updated dependencies [28c92e0]
- Updated dependencies [5f707d1]
- Updated dependencies [369e229]
- Updated dependencies [ba00ac7]
- Updated dependencies [8a5d2c0]
- Updated dependencies [aca4317]
- Updated dependencies [d52f9ba]
- Updated dependencies [0e5a4cd]
- Updated dependencies [291485d]
- Updated dependencies [b968642]
- Updated dependencies [68a7e3b]
- Updated dependencies [718b01c]
- Updated dependencies [e7b2ebc]
- Updated dependencies [e0cf9ed]
- Updated dependencies [da449bb]
- Updated dependencies [57fea6a]
- Updated dependencies [374b1a4]
- Updated dependencies [2c590b0]
- Updated dependencies [b8a9e5e]
- Updated dependencies [b0b2cc9]
- Updated dependencies [dc38250]
  - @memberjunction/core@6.2.0
  - @memberjunction/ng-shared-generic@6.2.0
  - @memberjunction/ng-ui-components@6.2.0
  - @memberjunction/export-engine@6.2.0
  - @memberjunction/excel-addin@6.2.0
  - @memberjunction/ng-base-types@6.2.0

## 6.2.0-edge.8

### Patch Changes

- Updated dependencies [6c36fb6]
- Updated dependencies [9cb815b]
- Updated dependencies [d2db108]
- Updated dependencies [c671f85]
- Updated dependencies [59e32e0]
- Updated dependencies [5f0baf7]
- Updated dependencies [a6f8c1c]
- Updated dependencies [56d7614]
- Updated dependencies [902d086]
- Updated dependencies [62c91ea]
- Updated dependencies [e69634e]
- Updated dependencies [ac18db8]
  - @memberjunction/core@6.2.0-edge.8
  - @memberjunction/ng-base-types@6.2.0-edge.8
  - @memberjunction/ng-shared-generic@6.2.0-edge.8
  - @memberjunction/excel-addin@6.2.0-edge.8
  - @memberjunction/ng-ui-components@6.2.0-edge.8
  - @memberjunction/export-engine@6.2.0-edge.8

## 6.2.0-edge.7

### Patch Changes

- 555a3f3: Add the Excel add-in's first release: a unified **Export ▾** toolbar menu across entity grids (both `(Default)` entity views and saved views) and query results grids offers **Open in Excel** alongside snapshot export, downloading a connected workbook that holds no rows and fills, in Excel, with what the person who opens it can see. Inside Excel, the MemberJunction task pane supports connecting to any MemberJunction server (via Office Dialog sign-in or external-browser encrypted connection-code handoff), browsing Applications, Entities, Saved Views, and Query Categories/Saved Queries with parameters directly from any workbook, and managing/refreshing all connected worksheets. New packages `@memberjunction/excel-addin` (workbook contract, typed `ExcelAddin.*` Remote Operations, encrypted sign-in handoff, the add-in pane) and `@memberjunction/excel-addin-server` (a Server Extension that serves the add-in and a per-host manifest, plus the operations' server bodies). Excel signs in through Explorer's new `office/connect` page, which Explorer renders on its own like the OAuth callback, and holds a per-user API key scoped to `view:run` and `query:run`. Off until a host configures the `ExcelAddinServerExtension`; see `guides/EXCEL_ADDIN_GUIDE.md`.
- Updated dependencies [c8c48e1]
- Updated dependencies [3bace5a]
- Updated dependencies [f4cd5fb]
- Updated dependencies [555a3f3]
- Updated dependencies [42df19d]
- Updated dependencies [d6b39c4]
- Updated dependencies [f65fec7]
- Updated dependencies [0fb3649]
- Updated dependencies [4c0eaec]
- Updated dependencies [397ae9a]
- Updated dependencies [509d2aa]
- Updated dependencies [9a2d7cc]
- Updated dependencies [4b9542c]
- Updated dependencies [ba00ac7]
- Updated dependencies [aca4317]
- Updated dependencies [da449bb]
- Updated dependencies [b0b2cc9]
  - @memberjunction/core@6.2.0-edge.7
  - @memberjunction/excel-addin@6.2.0-edge.7
  - @memberjunction/ng-shared-generic@6.2.0-edge.7
  - @memberjunction/ng-base-types@6.2.0-edge.7
  - @memberjunction/ng-ui-components@6.2.0-edge.7
  - @memberjunction/export-engine@6.2.0-edge.7

## 6.2.0-edge.6

### Patch Changes

- @memberjunction/export-engine@6.2.0-edge.6

## 6.2.0-edge.5

### Patch Changes

- @memberjunction/export-engine@6.2.0-edge.5

## 6.2.0-edge.4

### Patch Changes

- @memberjunction/export-engine@6.2.0-edge.4

## 6.2.0-edge.3

### Patch Changes

- @memberjunction/export-engine@6.2.0-edge.3

## 6.2.0-edge.2

### Patch Changes

- Updated dependencies [a3d6182]
  - @memberjunction/export-engine@6.2.0-edge.2

## 6.2.0-edge.1

### Patch Changes

- 80905a1: Rename public class members and exported functions to PascalCase, per MJ's naming convention,
  **without breaking a single consumer**.

  Every renamed symbol keeps its old name beside the new one as a `@deprecated` stub that forwards to
  it — a delegating method or function, a getter/setter pair for a property, and for Angular a
  readable accessor pair for an `@Input` and a second `@Output` sharing the same `EventEmitter`, so a
  template still binding the old name keeps receiving events. Old names still compile, still resolve,
  and still behave identically; the deprecation tag rides through to the published `.d.ts`, so editors
  point callers at the replacement. Where a package re-exports through an explicit `export { … }`
  list, the new name is added alongside the old, so the correct name is actually on the public surface
  rather than merely declared.

  The rename is deliberately refused wherever a mechanical stub would not be equivalent, because
  several of those shapes change a type contract while still compiling in the package that declares
  them:
  - an **optional** property or parameter property — TypeScript has no optional accessor, so a stub
    would promote `foo?` to a required member and break every object literal that omits it;
  - a class that is a **data shape** (no methods, or `@ObjectType`/`@InputType`) — object literals are
    assigned to it, and an accessor stub changes what they must supply;
  - a property whose **subclass redeclares it**, since TypeScript forbids a property overriding an
    accessor (TS2610);
  - a name whose PascalCase form is **already bound** in that file or class;
  - decorated members, `get`/`set` pairs behind a decorator, generators, destructured parameters,
    overload sets and abstract members.

  **One wire-visible consequence, for version skew only.** `BaseInfo.toJSON` walks `_`-prefixed
  backing fields and emits them through their public getter, preferring the PascalCase one. Renaming
  the 23 field aliases in `MJCore/src/generic` therefore changes what `AllMetadata` carries:
  `EntityInfo.spCreate` and friends now serialize as `SpCreate`. A same-version client is unaffected —
  `copyInitData` accepts a value through a settable accessor, so either spelling lands on the right
  field. An OLDER client against a newer server has no such path in its `copyInitData` and drops those
  fields silently. Same-version deployments, which is the supported configuration, see no change.

  Each package was verified against its own pre-change baseline rather than against zero, because
  several packages in this repo do not typecheck cleanly to begin with. Angular packages were verified
  with `ngc`, not `tsc`: a plain typecheck does not compile templates, and an earlier write-only
  `@Input` alias passed `tsc` while breaking six template reads.

- Updated dependencies [80905a1]
  - @memberjunction/export-engine@6.2.0-edge.1

## 6.2.0-edge.0

### Patch Changes

- @memberjunction/export-engine@6.2.0-edge.0

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
  - @memberjunction/export-engine@6.1.0

## 6.1.0-edge.7

### Patch Changes

- @memberjunction/export-engine@6.1.0-edge.7

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
  - @memberjunction/export-engine@6.1.0-edge.6

## 6.1.0-edge.5

### Patch Changes

- @memberjunction/export-engine@6.1.0-edge.5

## 6.1.0-edge.4

### Patch Changes

- @memberjunction/export-engine@6.1.0-edge.4

## 6.1.0-edge.3

### Patch Changes

- @memberjunction/export-engine@6.1.0-edge.3

## 6.1.0-edge.2

### Patch Changes

- @memberjunction/export-engine@6.1.0-edge.2

## 6.1.0-edge.1

### Patch Changes

- 394d276: Declare @angular/\* peer dependencies as ranges (^21.1.3) instead of exact pins across all Angular library packages. Peer declarations are compatibility claims, not install instructions: the exact pins falsely claimed incompatibility with every other Angular 21.x build, produced 502 peer-resolution errors under strict pnpm workspaces, and structurally blocked Angular security patches behind a full republish. Installed versions remain pinned by consuming apps and the era platform manifest; dependencies/devDependencies keep their exact pins.
  - @memberjunction/export-engine@6.1.0-edge.1

## 6.1.0-edge.0

### Patch Changes

- @memberjunction/export-engine@6.1.0-edge.0

## 6.0.0

### Patch Changes

- @memberjunction/export-engine@6.0.0

## 5.51.0

### Patch Changes

- @memberjunction/export-engine@5.51.0

## 5.50.0

### Patch Changes

- @memberjunction/export-engine@5.50.0

## 5.49.0

### Patch Changes

- @memberjunction/export-engine@5.49.0

## 5.48.0

### Patch Changes

- @memberjunction/export-engine@5.48.0

## 5.47.0

### Patch Changes

- @memberjunction/export-engine@5.47.0

## 5.46.0

### Patch Changes

- @memberjunction/export-engine@5.46.0

## 5.45.1

### Patch Changes

- @memberjunction/export-engine@5.45.1

## 5.45.0

### Patch Changes

- @memberjunction/export-engine@5.45.0

## 5.44.0

### Patch Changes

- @memberjunction/export-engine@5.44.0

## 5.43.0

### Patch Changes

- @memberjunction/export-engine@5.43.0

## 5.42.0

### Patch Changes

- @memberjunction/export-engine@5.42.0

## 5.41.0

### Patch Changes

- @memberjunction/export-engine@5.41.0

## 5.40.2

### Patch Changes

- @memberjunction/export-engine@5.40.2

## 5.40.1

### Patch Changes

- @memberjunction/export-engine@5.40.1

## 5.40.0

### Patch Changes

- @memberjunction/export-engine@5.40.0

## 5.39.0

### Patch Changes

- @memberjunction/export-engine@5.39.0

## 5.38.0

### Patch Changes

- @memberjunction/export-engine@5.38.0

## 5.37.0

### Patch Changes

- @memberjunction/export-engine@5.37.0

## 5.36.0

### Patch Changes

- @memberjunction/export-engine@5.36.0

## 5.35.0

### Patch Changes

- @memberjunction/export-engine@5.35.0

## 5.34.1

### Patch Changes

- @memberjunction/export-engine@5.34.1

## 5.34.0

### Patch Changes

- 7d8a0f9: Bound memory leaks: ResultHistory cap, QueueBase Stop/ IShutdownable, A2AServer, TaskStore, sweep, MJLruCache for provider / issuer caches, BaseLLM streaming reset, ShutdownRegister + SIGTERM contract.
- Updated dependencies [7d8a0f9]
  - @memberjunction/export-engine@5.34.0

## 5.33.0

### Patch Changes

- @memberjunction/export-engine@5.33.0

## 5.32.0

### Patch Changes

- @memberjunction/export-engine@5.32.0

## 5.31.0

### Patch Changes

- 7ed7a4b: no metadata/migration changes
- Updated dependencies [7ed7a4b]
  - @memberjunction/export-engine@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/export-engine@5.30.1

## 5.30.0

### Patch Changes

- @memberjunction/export-engine@5.30.0

## 5.29.0

### Patch Changes

- @memberjunction/export-engine@5.29.0

## 5.28.0

### Patch Changes

- @memberjunction/export-engine@5.28.0

## 5.27.1

### Patch Changes

- @memberjunction/export-engine@5.27.1

## 5.27.0

### Patch Changes

- @memberjunction/export-engine@5.27.0

## 5.26.0

### Patch Changes

- @memberjunction/export-engine@5.26.0

## 5.25.0

### Patch Changes

- @memberjunction/export-engine@5.25.0

## 5.24.0

### Patch Changes

- @memberjunction/export-engine@5.24.0

## 5.23.0

### Patch Changes

- @memberjunction/export-engine@5.23.0

## 5.22.0

### Patch Changes

- @memberjunction/export-engine@5.22.0

## 5.21.0

### Patch Changes

- @memberjunction/export-engine@5.21.0

## 5.20.0

### Patch Changes

- @memberjunction/export-engine@5.20.0

## 5.19.0

### Patch Changes

- @memberjunction/export-engine@5.19.0

## 5.18.0

### Patch Changes

- @memberjunction/export-engine@5.18.0

## 5.17.0

### Patch Changes

- @memberjunction/export-engine@5.17.0

## 5.16.0

### Patch Changes

- @memberjunction/export-engine@5.16.0

## 5.15.0

### Patch Changes

- @memberjunction/export-engine@5.15.0

## 5.14.0

### Patch Changes

- @memberjunction/export-engine@5.14.0

## 5.13.0

### Patch Changes

- @memberjunction/export-engine@5.13.0

## 5.12.0

### Patch Changes

- a57b8d5: Migrate all hardcoded CSS colors to design tokens for dark mode and white-label support. Introduces `--mj-*` semantic CSS custom properties in `_tokens.scss` with full `[data-theme="dark"]` overrides. Migrates 1,544 of 1,659 hardcoded hex values (93%) across 72+ CSS files to semantic tokens. Adds logo token system (`--mj-logo-mark`, `--mj-logo-color`) for themeable branding. Fixes dark mode theming for CodeMirror, AG Grid v35, and Kendo popups. No API or behavioral changes — CSS only.
- e87d153: design tokens phase 1
  - @memberjunction/export-engine@5.12.0

## 5.11.0

### Patch Changes

- @memberjunction/export-engine@5.11.0

## 5.10.1

### Patch Changes

- @memberjunction/export-engine@5.10.1

## 5.10.0

### Patch Changes

- @memberjunction/export-engine@5.10.0

## 5.9.0

### Patch Changes

- @memberjunction/export-engine@5.9.0

## 5.8.0

### Patch Changes

- @memberjunction/export-engine@5.8.0

## 5.7.0

### Patch Changes

- @memberjunction/export-engine@5.7.0

## 5.6.0

### Patch Changes

- @memberjunction/export-engine@5.6.0

## 5.5.0

### Patch Changes

- df2457c: no migration, just small code changes
- Updated dependencies [df2457c]
  - @memberjunction/export-engine@5.5.0

## 5.4.1

### Patch Changes

- @memberjunction/export-engine@5.4.1

## 5.4.0

### Patch Changes

- @memberjunction/export-engine@5.4.0

## 5.3.1

### Patch Changes

- @memberjunction/export-engine@5.3.1

## 5.3.0

### Patch Changes

- @memberjunction/export-engine@5.3.0

## 5.2.0

### Patch Changes

- @memberjunction/export-engine@5.2.0

## 5.1.0

### Patch Changes

- @memberjunction/export-engine@5.1.0

## 5.0.0

### Major Changes

- 4aa1b54: breaking changes due to class name updates/approach

### Patch Changes

- Updated dependencies [4aa1b54]
  - @memberjunction/export-engine@5.0.0

## 4.4.0

### Patch Changes

- @memberjunction/export-engine@4.4.0

## 4.3.1

### Patch Changes

- @memberjunction/export-engine@4.3.1

## 4.3.0

### Patch Changes

- @memberjunction/export-engine@4.3.0

## 4.2.0

### Patch Changes

- @memberjunction/export-engine@4.2.0

## 4.1.0

### Patch Changes

- Updated dependencies [9fab8ca]
  - @memberjunction/export-engine@4.1.0

## 4.0.0

### Major Changes

- 8366d44: we goin' to 4.0!
- fe73344: Angular 21/Node 24/ESM everywhere, and more
- 5f6306c: 4.0

### Minor Changes

- e06f81c: changed SO much!

### Patch Changes

- Updated dependencies [8366d44]
- Updated dependencies [fe73344]
- Updated dependencies [5f6306c]
- Updated dependencies [e06f81c]
  - @memberjunction/export-engine@4.0.0

## 3.4.0

### Patch Changes

- @memberjunction/export-engine@3.4.0

## 3.3.0

### Patch Changes

- @memberjunction/export-engine@3.3.0

## 3.2.0

### Patch Changes

- @memberjunction/export-engine@3.2.0

## 3.1.1

### Patch Changes

- @memberjunction/export-engine@3.1.1

## 3.0.0

### Patch Changes

- @memberjunction/export-engine@3.0.0

## 2.133.0

### Patch Changes

- @memberjunction/export-engine@2.133.0
