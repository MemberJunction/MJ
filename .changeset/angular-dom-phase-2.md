---
"@memberjunction/ng-test-utils": minor
---

Angular DOM unit-testing — Phase 2 (`Angular/Generic/**` rollout). Extends the shared test toolkit and rolls DOM specs across the Generic packages.

`@memberjunction/ng-test-utils` gains (additive):

- **`providers` / `imports` / `declarations`** options on `renderComponentFixture` — inject stub services so service-backed presentational components can be constructed and rendered.
- **`createFakeProvider`** (+ an `entities` option) — a fake `IMetadataProvider` / `RunView` supplied through a component's `[Provider]` input.
- **`useFakeGlobalProvider`** — scoped save/restore of the global `RunView.Provider` / `Metadata.Provider` for components that use a bare `new RunView()`.
- **dom-helpers** — `query` / `queryAll` / `text` / `typeInto` / `captureEmissions`.

Tooling (repo scripts, no package version impact):

- `scripts/gen-dom-stub.mjs` — scaffolds specs against the shared dom-helpers and bootstraps a package's DOM config (auto single-vs-dual vitest preset + `tsconfig.spec.json` + the `ng-test-utils` devDependency).
- `scripts/dom-test-report.mjs` — a DOM-test **visibility report**: scores each component `solid`/`partial`/`stub`/`none` by how much of its named surface (`@Output`s, `[class.X]`, `[attr.X]`) its spec exercises, weighted by how heavily the component is used, so the backlog ranks by leverage. Skipped/deferred components still count as gaps (annotated).
- `scripts/lib/component-surface.mjs` — a shared Angular-component parser used by **both** the generator and the report, so they always agree on what a component's testable surface is.

DOM specs were added across ~49 Generic packages plus a `ng-conversations` deep-dive (~14 components). Those additions are test-only (specs + devDependencies) with no runtime change to the packages under test, so they are not individually version-bumped here. Media / realtime / WebRTC surfaces remain live-tested, never faked.
