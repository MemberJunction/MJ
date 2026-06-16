# Angular DOM Unit-Testing Rollout — Phased Plan

**Status:** Plan / RFC. To be implemented by a follow-up agent.
**Owner:** TBD
**Related:** discovered while adding the LiveKit room UX stack (PR #2860); the new Angular packages
currently ship class-level component tests because the repo has no DOM-rendering harness.

---

## 1. Goal

Enable **DOM-level unit tests** for MemberJunction Angular components — render a component into a real DOM
tree with Angular `TestBed` + `ComponentFixture`, drive it (set `@Input`s, dispatch DOM events), and assert
on **rendered output** and **`@Output` emissions** — and roll this out across `packages/Angular/**`.

Today we can only test component *classes* (instantiate with `new`, assert on state/emissions). That misses
the half of a component's contract that lives in the **template**: gating (`@if` shows/hides the right
controls), bindings, event wiring (`(click)` → handler → `@Output`), conditional classes, accessibility.

## 2. Current state (verified)

- Root `vitest.shared.ts` sets **`environment: 'node'`** for every package. No `jsdom` / `happy-dom`.
- No `zone.js` test bootstrap, no `@analogjs/vite-plugin-angular`, no Angular vitest unit-test builder.
- Existing "Angular tests" (e.g. `ng-conversations`, `ng-base-forms`, `ng-dashboards`) are **class-level**:
  they `new` the component and assert on `@Output`/state, often loading `@angular/compiler` for JIT but
  **never rendering to DOM**. Several explicitly comment "without Angular TestBed."
- Angular version: **21.1.3** (supports zoneless change detection — `provideZonelessChangeDetection()`).

**Implication:** DOM testing is a one-time, repo-wide **infra** addition, then a per-package rollout. It is
not a per-package flip of an existing capability.

## 3. Non-goals / explicit exclusions

- **WebRTC / live-media paths are NOT in scope for DOM unit tests.** jsdom does not implement WebRTC,
  `navigator.mediaDevices.getUserMedia`, `AudioContext`, `MediaStreamTrack`, real `<video>`/`<audio>`
  playback, or `requestAnimationFrame`-driven media. Components that *touch* these (the LiveKit
  `livekit-client` paths, camera/mic capture, `track.attach()`, audio metering) must be **live-tested**
  via the existing Playwright CLI workflow / a future e2e suite — **not** mocked into a fake "pass."
  - For such components, DOM-unit-test only the **presentational, media-free** surface (gating, labels,
    button states, `@Output` emission on click) with the media client mocked, and cover the actual media
    behavior with a live test. Document this split per component.
- Not changing the existing class-level tests — they stay; DOM tests are additive.
- Not introducing Karma/Jasmine. Vitest remains the single runner.

## 4. Technical approach

**Renderer:** `@analogjs/vite-plugin-angular` (compiles Angular templates/decorators for Vite/vitest) +
`environment: 'jsdom'` + a setup file that initializes `TestBed` once with
`provideZonelessChangeDetection()` (zoneless — avoids `zone.js` and its async-stability quirks; matches our
OnPush components). Use `await fixture.whenStable()` / `fixture.detectChanges()` for CD.

> Alternative considered: Angular's first-party `@angular/build:unit-test` (experimental, vitest-based).
> Rejected for now because our libraries build with `ngc`, not the application builder; Analog is the proven
> path for **library** packages and decouples test runner from build pipeline. Re-evaluate when the
> first-party builder is stable for libraries.

**Shared preset:** add `vitest.dom.shared.ts` at repo root (peer to `vitest.shared.ts`):
- `plugins: [angular(), tsconfigPaths()]`
- `test.environment: 'jsdom'`, `test.setupFiles: ['<root>/vitest.dom.setup.ts']`, `globals: true`
- `vitest.dom.setup.ts` initializes the Angular testing environment (`getTestBed().initTestEnvironment(...)`
  or the zoneless equivalent) once.

**Per-package opt-in:** a package that wants DOM tests has its `vitest.config.ts` extend
`vitest.dom.shared` instead of `vitest.shared`. Node-only packages stay on the node preset. (Optionally
support both in one package via a `projects` config so pure-logic specs stay fast on node and DOM specs run
on jsdom — decide in Phase 0.)

**Dependencies (dev):** `@analogjs/vite-plugin-angular`, `jsdom`, and whatever Analog peer-deps it requires
(`@angular/compiler-cli` already present in Angular packages). Pin to versions compatible with Angular 21.

**Scaffold:** extend `scripts/scaffold-tests.mjs` with a `--dom` flag that emits a DOM-preset
`vitest.config.ts` + a starter `ComponentFixture` spec.

## 5. What a DOM test looks like (target pattern)

```typescript
import { TestBed } from '@angular/core/testing';
import { LiveKitControlBarComponent } from '../components/livekit-control-bar.component';

describe('LiveKitControlBarComponent (DOM)', () => {
  it('hides the screen-share button when EnableScreenShareControl is false', async () => {
    const fixture = TestBed.createComponent(LiveKitControlBarComponent);
    fixture.componentInstance.EnableScreenShareControl = false;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[title="Share screen"]')).toBeNull();
  });

  it('emits ToggleMicrophone when the mic button is clicked', async () => {
    const fixture = TestBed.createComponent(LiveKitControlBarComponent);
    const spy = vi.fn();
    fixture.componentInstance.ToggleMicrophone.subscribe(spy);
    fixture.detectChanges();
    fixture.nativeElement.querySelector('.lk-bar__btn').click();
    expect(spy).toHaveBeenCalled();
  });
});
```

**Mocking strategy for DOM tests:**
- Data: provide a fake `IMetadataProvider` / mock `RunView` (reuse `@memberjunction/test-utils`).
- Container components that internally `new` an engine/controller: refactor to make the dependency
  **injectable** (constructor `inject()` of a factory token), so tests inject a fake. (LiveKit's
  `LiveKitRoomComponent` is the worked example — its leaf components are already pure `@Input`/`@Output`.)
- Media APIs: stub at the seam, and defer real behavior to live tests (see §3).

## 6. Phasing

### Phase 0 — Infra spike (1 package, prove it renders)
- Add `@analogjs/vite-plugin-angular` + `jsdom` devDeps; create `vitest.dom.shared.ts` + `vitest.dom.setup.ts`.
- Pick **one simple generic package** (candidate: `@memberjunction/ng-user-avatar` or a leaf in
  `@memberjunction/ng-ui-components`) and convert its `vitest.config.ts` to the DOM preset.
- Write **2–3 real `ComponentFixture` specs** that render and assert on DOM.
- **Exit criteria:** `npm test` for that package renders a component to DOM and asserts pass; runs in CI;
  no zone.js; documented run time.

### Phase 1 — Pilot on a few components + write the guide
- Add DOM specs for **~5 leaf components across 2–3 packages**, including the **LiveKit leaf components**
  (`control-bar`, `participant-tile` [media mocked], `chat-panel`, `device-menu`, `agent-state`,
  `connection-overlay`) as the headline proof — they're small, gating-heavy, and `@Output`-driven.
- Do the **injectable-controller refactor** on `LiveKitRoomComponent` and add a container-level DOM spec
  driven by a fake controller.
- Author `guides/ANGULAR_TESTING_GUIDE.md`: when to class-test vs DOM-test vs live-test; the mocking
  recipes; the WebRTC/live-media exclusion; the fixture patterns; `@angular/compiler` JIT note for
  partial-compiled libs.
- Update `scripts/scaffold-tests.mjs` (`--dom`).
- **Exit criteria:** ~5 components with green DOM specs in CI; guide merged; patterns validated on a
  media-touching package (LiveKit) proving the presentational/live split works.

### Phase 2 — `packages/Angular/Generic/**` rollout
- Package-by-package: convert/added DOM specs for leaf + presentational components. Prioritize high-traffic
  shared UI (`ng-ui-components`, `ng-base-forms`, `ng-conversations`, `ng-data-context`, …).
- Track coverage in a checklist; one PR per package (or small batches) to keep reviews tractable.
- **Exit criteria:** every Generic package has a DOM `vitest.config` and meaningful DOM specs for its
  primary components; agreed coverage threshold met.

### Phase 3 — `packages/Angular/Explorer/**` rollout
- Same approach for Explorer packages (`explorer-core`, `dashboards`, `core-entity-forms`, `shared`, …).
  Heavier components (resource wrappers, dashboards) lean on mocked providers + `NavigationService` fakes.
- **Exit criteria:** Explorer packages covered to the agreed threshold.

### Phase 4 — Gates & coverage
- Add a coverage threshold for Angular packages in CI (start lenient, ratchet up).
- Document the live-media e2e suite location/runner for the excluded WebRTC paths.

## 7. Risks & mitigations

| Risk | Mitigation |
|---|---|
| jsdom missing APIs (ResizeObserver, matchMedia, IntersectionObserver, rAF) | Add polyfills/stubs in `vitest.dom.setup.ts`; document the standard stub set. |
| Partial-compiled (Ivy) libraries need JIT at test time | `import '@angular/compiler'` in the setup file (already the repo convention). |
| Zoneless CD surprises | Standardize on `fixture.detectChanges()` / `await fixture.whenStable()`; document in the guide. |
| CI time growth | Keep pure-logic specs on the node preset; only DOM specs pay the jsdom cost. Use vitest `projects`. |
| Over-mocking hides real bugs (esp. media) | Hard rule: media behavior is **live-tested**, never asserted via mocks (§3). |
| Analog version drift vs Angular 21 | Pin versions; gate the upgrade behind Phase 0 validation. |

## 8. Deliverables for the implementing agent

1. `vitest.dom.shared.ts` + `vitest.dom.setup.ts` (root) and devDep additions.
2. Phase 0 package converted with 2–3 passing DOM specs.
3. Phase 1 pilot specs (incl. LiveKit leaf components) + `LiveKitRoomComponent` injectable refactor.
4. `guides/ANGULAR_TESTING_GUIDE.md`.
5. `scripts/scaffold-tests.mjs --dom`.
6. A rollout checklist (this doc's §6.2/§6.3) tracked in the PR description.

Each phase is its own PR. Phases 0–1 land first and must be proven green before Phase 2 begins.

## 9. Estimated effort (rough)

- Phase 0: ~0.5–1 day (infra + spike).
- Phase 1: ~1–2 days (pilot specs + refactor + guide).
- Phase 2: ongoing, ~per-package; parallelizable across agents once the pattern is fixed.
- Phase 3: ongoing.

---

## 10. Implementation status

### Phase 0 — Infra spike ✅ (done)

- Added root devDeps: `@analogjs/vite-plugin-angular`, `@angular/build`, `jsdom` (the Analog
  plugin requires `@angular/build/private` at runtime, so `@angular/build` is a real devDep, not
  just an optional peer; it is pinned to the repo's Angular `21.1.3` via `overrides`).
- Added [`vitest.dom.shared.ts`](../../vitest.dom.shared.ts) (preset: `angular({ jit: false })` +
  `tsconfigPaths`, `environment: 'jsdom'`, auto-detect of per-package `tsconfig.spec.json`) and
  [`vitest.dom.setup.ts`](../../vitest.dom.setup.ts) (zoneless `provideZonelessChangeDetection`,
  `platformBrowserTesting`, `@angular/compiler` JIT fallback, jsdom stubs for `matchMedia` /
  `ResizeObserver` / `IntersectionObserver`).
- Pilot package `@memberjunction/ng-ui-components` converted to the DOM preset; its **existing
  class-level specs keep passing** under jsdom (228 tests green).
- **Decision (deferred from Phase 0):** packages with no `@angular/core`-mocking node specs use a
  **single DOM preset**; packages that have one use **two vitest `projects`** (node + dom) so the
  mocking spec stays on node. Both shapes are demonstrated and documented.

### Phase 1 — Pilot + guide ✅ (done, with one substitution)

- **5 leaf components across 2 packages**, all with green DOM specs:
  - `@memberjunction/ng-ui-components` (single preset): `switch`, `progress-bar`, `stat-badge`,
    `view-toggle` — covering CVA + click-toggle, `@if/@else` branch, gating + host-class variants,
    and `@for` + `@Output`.
  - `@memberjunction/ng-pagination` (dual preset): `pagination` — self-hiding gating, disabled
    no-op, `PageChange` payload — alongside its unchanged `@angular/core`-mocking class-level spec.
- [`guides/ANGULAR_TESTING_GUIDE.md`](../../guides/ANGULAR_TESTING_GUIDE.md) authored (class- vs
  DOM- vs live-test decision tree, harness, configs, the zoneless `NG0100` gotcha, mocking recipes,
  the WebRTC/live-media exclusion).
- [`scripts/scaffold-tests.mjs`](../../scripts/scaffold-tests.mjs) extended with `--dom` (emits the
  DOM preset `vitest.config.ts` + `tsconfig.spec.json` + a passing starter `ComponentFixture` spec).
- **Substitution:** the plan named the LiveKit leaf components (from PR #2860) as the headline
  pilot and a `LiveKitRoomComponent` injectable-controller refactor. PR #2860 is not merged into
  `next`, so those components are not in this branch; the pilot uses the equivalent gating-heavy,
  `@Output`-driven leaf components above instead. **Follow-up:** once #2860 lands, add DOM specs for
  its leaf components and do the injectable-controller refactor (the harness + patterns proven here
  apply directly; media paths stay live-tested per §3).

### Phase 2/3 rollout checklist (tracked here)

Per package: add a DOM `vitest.config` (single or dual preset), a `tsconfig.spec.json`, and DOM
specs for the package's primary/leaf components. One PR per package (or small batches).

- [ ] **Generic** (Phase 2): `ng-ui-components` ✅, `ng-pagination` ✅, then `base-forms`,
      `conversations`, `data-context`, `entity-card`, `tab-strip`, `filter-builder`, … (remaining
      Generic packages).
- [ ] **Explorer** (Phase 3): `explorer-core`, `dashboards`, `core-entity-forms`, `shared`, …
      (mock providers + `NavigationService` fakes for heavier components).
- [ ] **Phase 4**: coverage gates in CI (start lenient, ratchet up); document the live-media e2e
      suite location for the excluded WebRTC paths.
