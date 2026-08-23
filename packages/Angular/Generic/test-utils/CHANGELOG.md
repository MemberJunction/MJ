# @memberjunction/ng-test-utils

## 6.1.0-edge.3

### Patch Changes

- Updated dependencies [834f8d7]
- Updated dependencies [07cb22e]
- Updated dependencies [c581b4f]
- Updated dependencies [d79fe39]
- Updated dependencies [08829f5]
- Updated dependencies [815b9bc]
- Updated dependencies [f5ec13b]
- Updated dependencies [50987c4]
- Updated dependencies [7b4abe7]
- Updated dependencies [051e0ff]
- Updated dependencies [95fc3e6]
- Updated dependencies [cefc302]
- Updated dependencies [bbb7fcc]
- Updated dependencies [b8130f3]
- Updated dependencies [68b9cf0]
- Updated dependencies [048c5ce]
- Updated dependencies [7300953]
- Updated dependencies [7300953]
- Updated dependencies [b46330e]
- Updated dependencies [84f276e]
- Updated dependencies [6ecfaa0]
- Updated dependencies [d0a2a55]
  - @memberjunction/core@6.1.0-edge.3

## 6.1.0-edge.2

### Patch Changes

- Updated dependencies [8288711]
- Updated dependencies [fccd0b2]
- Updated dependencies [0967ba7]
- Updated dependencies [15319b4]
  - @memberjunction/core@6.1.0-edge.2

## 6.1.0-edge.1

### Patch Changes

- 394d276: Declare @angular/\* peer dependencies as ranges (^21.1.3) instead of exact pins across all Angular library packages. Peer declarations are compatibility claims, not install instructions: the exact pins falsely claimed incompatibility with every other Angular 21.x build, produced 502 peer-resolution errors under strict pnpm workspaces, and structurally blocked Angular security patches behind a full republish. Installed versions remain pinned by consuming apps and the era platform manifest; dependencies/devDependencies keep their exact pins.
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
  - @memberjunction/core@6.1.0-edge.1

## 6.1.0-edge.0

### Patch Changes

- Updated dependencies [9699d0e]
- Updated dependencies [052b4c7]
- Updated dependencies [841e6ea]
- Updated dependencies [1d88e00]
- Updated dependencies [27e4d09]
  - @memberjunction/core@6.1.0-edge.0

## 6.0.0

## 5.51.0

## 5.50.0

### Patch Changes

- 6237f22: Remove the internal `@memberjunction/core` peerDependency — the repo's only internal peer. Semver ranges exclude prereleases, so during an Edge (changesets pre-mode) window any internal peer range is out of range for every `-edge.N` version and, with `onlyUpdatePeerDependentsWhenOutOfRange` plus the repo-wide fixed group, escalates all packages to a silent major bump. Core stays available via devDependencies (the package is private and never published). A new CI guard (`npm run check:peer-deps`, "No internal peerDependencies" workflow) blocks internal peerDependencies repo-wide.

## 5.49.0

### Minor Changes

- d3f9d77: Angular DOM unit-testing — Phase 3 (`Angular/Explorer/**` rollout) toolkit growth.

  `createFakeProvider` gains an additive **`roles`** option that populates `provider.Roles`, for DOM
  specs of permission/role UIs that read `ProviderToUse.Roles` (e.g. the Explorer entity-permissions
  grid). Mirrors the existing `entities` option; defaults to `[]` when omitted, so it's non-breaking.

## 5.48.0

## 5.47.0

## 5.46.0

## 5.45.1

## 5.45.0

## 5.44.0

### Minor Changes

- 5de2d37: Angular DOM unit-testing — Phase 2 (`Angular/Generic/**` rollout). Extends the shared test toolkit and rolls DOM specs across the Generic packages.

  `@memberjunction/ng-test-utils` gains (additive):
  - **`providers` / `imports` / `declarations`** options on `renderComponentFixture` — inject stub services so service-backed presentational components can be constructed and rendered.
  - **`createFakeProvider`** (+ an `entities` option) — a fake `IMetadataProvider` / `RunView` supplied through a component's `[Provider]` input.
  - **`useFakeGlobalProvider`** — scoped save/restore of the global `RunView.Provider` / `Metadata.Provider` for components that use a bare `new RunView()`.
  - **dom-helpers** — `query` / `queryAll` / `text` / `attr` / `hasClass` / `typeInto` / `capture`.

  Tooling (repo scripts, no package version impact):
  - `scripts/gen-dom-stub.mjs` — scaffolds specs against the shared dom-helpers and bootstraps a package's DOM config (auto single-vs-dual vitest preset + `tsconfig.spec.json` + the `ng-test-utils` devDependency).
  - `scripts/dom-test-report.mjs` — a DOM-test **visibility report**: scores each component `solid`/`partial`/`stub`/`none` by how much of its named surface (`@Output`s, `[class.X]`, `[attr.X]`) its spec exercises, weighted by how heavily the component is used, so the backlog ranks by leverage. Skipped/deferred components still count as gaps (annotated).
  - `scripts/lib/component-surface.mjs` — a shared Angular-component parser used by **both** the generator and the report, so they always agree on what a component's testable surface is.

  DOM specs were added across ~49 Generic packages plus a `ng-conversations` deep-dive (~19 components). Those additions are test-only (specs + devDependencies) with no runtime change to the packages under test, so they are not individually version-bumped here. Media / realtime / WebRTC surfaces remain live-tested, never faked.

## 5.43.0

### Patch Changes

- 54183aa: Add the Angular DOM unit-testing foundation: a new `@memberjunction/ng-test-utils` package providing `renderComponentFixture` (standalone/leaf components) and `renderTemplate` (compound / module-declared components) helpers, the Vitest + jsdom DOM-testing harness, coverage reporting in the DOM preset, a `scaffold-tests.mjs --dom` flag (with a spaces-in-path fix), and DOM specs across `ng-ui-components`, `ng-pagination`, `ng-tabstrip`, and `ng-livekit-room`.

  `ng-livekit-room` is the headline pilot (now that PR #2860 is on `next`): DOM specs for the media-free leaf components (`control-bar`, `agent-state`, `connection-overlay`, `chat-panel`, `device-menu`) plus `participant-tile` as the §7 media-split worked example — the media-free surface is tested while `track.attach()` and the audio-meter `requestAnimationFrame` loop are left to live tests — on a dual node+dom preset that preserves the package's existing logic specs. The `LiveKitRoomComponent` injectable-controller refactor (the one production-code change) is deferred to the Phase 2 component rollout; the injected-fake-container pattern it would prove is already demonstrated via the `providers` seam.

  Also hardens the harness wiring flagged in review: correct `@memberjunction/ng-test-utils` devDependency declarations (`ng-tabstrip`, `ng-livekit-room`) and Turbo cache inputs covering `tsconfig.spec.json` + the root shared-harness files. Code-only, no schema changes.
