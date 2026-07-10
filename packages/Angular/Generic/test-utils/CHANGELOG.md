# @memberjunction/ng-test-utils

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
