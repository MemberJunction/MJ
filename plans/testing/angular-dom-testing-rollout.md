# Angular DOM Unit-Testing Rollout

**Status:** Foundation **shipped**. **Phase 2 (`Angular/Generic/**`) substantially complete.**
**What's done:** the DOM-rendering harness, the `@memberjunction/ng-test-utils`toolkit (now 4 recipes +
DOM helpers), coverage reporting, the scaffold`--dom`flag,`guides/ANGULAR_TESTING_GUIDE.md`, the
`gen-dom-stub.mjs`generator (now also bootstraps a package's DOM config), and **DOM specs across 49
Generic packages (~1,100 tests)** — every component-bearing Generic package except three documented
deferrals (see [§6](#6-roadmap)).
**What's next:** the`conversations`deep-dive (partially covered) + the LiveKit/media e2e follow-up,
then`Angular/Explorer/\*\*` (Phase 3) and CI coverage gates (Phase 4). See [§6](#6-roadmap) and
[§10](#10-handoff--how-to-continue).

---

## 1. Goal

Enable **DOM-level unit tests** for MemberJunction Angular components — render a component into a real DOM
tree with Angular `TestBed` + `ComponentFixture`, drive it (set `@Input`s, dispatch DOM events), and assert
on **rendered output** and **`@Output` emissions** — and roll this out across `packages/Angular/**`.

Before this, we could only test component _classes_ (instantiate with `new`, assert on state/emissions).
That misses the half of a component's contract that lives in the **template**: gating (`@if` shows/hides the
right controls), bindings, event wiring (`(click)` → handler → `@Output`), conditional classes, accessibility.

## 2. Background

- Root `vitest.shared.ts` runs every package with **`environment: 'node'`** — no `jsdom` / `happy-dom`.
- The pre-existing "Angular tests" (e.g. `ng-conversations`, `ng-base-forms`, `ng-dashboards`) are
  **class-level**: they `new` the component and assert on `@Output`/state, often loading `@angular/compiler`
  for JIT but **never rendering to DOM**. Several explicitly comment "without Angular TestBed."
- Angular version: **21.1.3** — supports zoneless change detection (`provideZonelessChangeDetection()`).

**Implication:** DOM testing was a one-time, repo-wide **infra** addition (now shipped), followed by a
per-package rollout (now in progress). It is not a per-package flip of an existing capability.

## 3. Non-goals / explicit exclusions

- **WebRTC / live-media paths are NOT in scope for DOM unit tests.** jsdom does not implement WebRTC,
  `navigator.mediaDevices.getUserMedia`, `AudioContext`, `MediaStreamTrack`, real `<video>`/`<audio>`
  playback, or `requestAnimationFrame`-driven media. Components that _touch_ these (the LiveKit
  `livekit-client` paths, camera/mic capture, `track.attach()`, audio metering) must be **live-tested**
  via the existing Playwright CLI workflow / a future e2e suite — **not** mocked into a fake "pass."
  - For such components, DOM-unit-test only the **presentational, media-free** surface (gating, labels,
    button states, `@Output` emission on click) with the media client mocked, and cover the actual media
    behavior with a live test. Document this split per component.
- Not changing the existing class-level tests — they stay; DOM tests are additive.
- Not introducing Karma/Jasmine. Vitest remains the single runner.

## 4. Technical approach (as built)

**Renderer:** `@analogjs/vite-plugin-angular` (compiles Angular templates/decorators for Vite/vitest, AOT,
`jit: false`) + `environment: 'jsdom'` + a setup file that initializes the Angular testing platform once
and runs **zoneless** (`provideZonelessChangeDetection()` — avoids `zone.js` and its async-stability quirks;
matches our OnPush components). Drive CD with `fixture.detectChanges()` / `await fixture.whenStable()`.

> Alternative considered: Angular's first-party `@angular/build:unit-test` (experimental, vitest-based).
> Rejected for now because our libraries build with `ngc`, not the application builder; Analog is the proven
> path for **library** packages and decouples test runner from build pipeline. Re-evaluate when the
> first-party builder is stable for libraries.

**Shared preset** — [`vitest.dom.shared.ts`](../../vitest.dom.shared.ts) at repo root (peer to
`vitest.shared.ts`):

- `plugins: [angular({ jit: false }), tsconfigPaths()]`
- `test.environment: 'jsdom'`, `setupFiles: ['<root>/vitest.dom.setup.ts']`, `globals: true`
- auto-detects a per-package `tsconfig.spec.json` and passes it to the Angular compiler (the build
  `tsconfig.json` usually excludes `*.test.ts`, which would otherwise leave specs out of the type-check
  program).

**Setup** — [`vitest.dom.setup.ts`](../../vitest.dom.setup.ts): initializes
`platformBrowserTesting()` once, applies `provideZonelessChangeDetection()` to every spec via a global
`beforeEach`, imports `@angular/compiler` (JIT fallback for partial-compiled libraries), and installs the
standard jsdom stubs (`matchMedia` / `ResizeObserver` / `IntersectionObserver`). **No `zone.js`.**

**Per-package opt-in (two shapes, both shipped & documented):**

- **Single preset** — package `vitest.config.ts` extends `vitest.dom.shared`. Use when the package has no
  class-level spec that `vi.mock('@angular/core')`; its existing class-level specs run fine under jsdom too.
- **Dual preset (vitest `projects`)** — node project (existing class-level specs, including any that mock
  `@angular/core`) + dom project (the `*.dom.test.ts` specs), with **disjoint** include/exclude. Use when a
  class-level spec mocks `@angular/core` (that mock breaks under the Angular compile path).

**Dependencies (dev, root `package.json`):** `@analogjs/vite-plugin-angular`, `@angular/build`, `jsdom`.
The Analog plugin requires `@angular/build/private` at runtime, so `@angular/build` is a real devDep (not
just an optional peer); it and the related Angular build packages are pinned to `21.1.3` via `overrides` so
Analog's optional peers can't resolve to a newer Angular than the repo uses.

**Scaffold:** `scripts/scaffold-tests.mjs --dom` emits a DOM-preset `vitest.config.ts`, a `tsconfig.spec.json`,
and a passing starter `ComponentFixture` spec.

## 5. What a DOM test looks like (shipped example)

From [`ng-ui-components`](../../packages/Angular/Generic/ui-components/src/lib/switch/switch.component.dom.test.ts):

```typescript
import { describe, it, expect, vi } from "vitest";
import { TestBed } from "@angular/core/testing";
import { MJSwitchComponent } from "./switch.component";

describe("MJSwitchComponent (DOM)", () => {
  it("renders aria-checked=false by default and toggles on click", () => {
    const fixture = TestBed.createComponent(MJSwitchComponent);
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector("button.mj-switch") as HTMLButtonElement;

    expect(button.getAttribute("aria-checked")).toBe("false");
    button.click();
    fixture.detectChanges();
    expect(button.getAttribute("aria-checked")).toBe("true");
  });

  it("emits the new value through the CVA onChange when clicked", () => {
    const fixture = TestBed.createComponent(MJSwitchComponent);
    const onChange = vi.fn();
    fixture.componentInstance.registerOnChange(onChange);
    fixture.detectChanges();
    (fixture.nativeElement.querySelector("button.mj-switch") as HTMLButtonElement).click();
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
```

**Mocking strategy for DOM tests:**

- Data: provide a fake `IMetadataProvider` / mock `RunView` (reuse `@memberjunction/test-utils`), passed via
  the component's `[Provider]` input.
- Container components that internally `new` an engine/controller: refactor to make the dependency
  **injectable** (`inject()` of a factory token), so tests inject a fake that drives the DOM. Leaf components
  that are already pure `@Input`/`@Output` need none of this.
- Media APIs: stub at the seam, and defer real behavior to live tests (see §3).

Full patterns, the zoneless `NG0100` gotcha, and the config recipes live in
[`guides/ANGULAR_TESTING_GUIDE.md`](../../guides/ANGULAR_TESTING_GUIDE.md).

## 6. Roadmap

### Foundation — harness + pilot + guide ✅ SHIPPED

Phase 0 (infra) and Phase 1 (pilot) were delivered **together in one PR**, because the pilot specs can't run
without the harness. Delivered:

- `vitest.dom.shared.ts` + `vitest.dom.setup.ts` + root devDeps/overrides, with **coverage reporting**
  wired into the DOM preset (`coverage.include: ['src/**/*.ts']` so untested components surface as 0%).
- **`@memberjunction/ng-test-utils`** — shared test helpers: `renderComponentFixture` (standalone/leaf
  components) and `renderTemplate` (compound / module-declared components — host + declarations + async settle).
- **~11 components across 3 packages**, all green:
  - `@memberjunction/ng-ui-components` (single preset): `switch`, `progress-bar`, `stat-badge`, `view-toggle`,
    `refresh-button`, `filter-chip`, `filter-field`, `numeric-input`, `page-header`, `page-search`. Existing
    class-level specs keep passing under jsdom.
  - `@memberjunction/ng-pagination` (dual node+dom `projects`): `pagination` alongside its **unchanged**
    `@angular/core`-mocking class-level spec.
  - `@memberjunction/ng-tabstrip` (single preset): `tab-strip` — the first **compound** component (projected
    `<mj-tab>`/`<mj-tab-body>` children), which proved the `renderTemplate` recipe.
- `guides/ANGULAR_TESTING_GUIDE.md`, `scripts/scaffold-tests.mjs --dom` (incl. a spaces-in-path fix), and
  `plans/testing/dom-testing-tooling-gameplan.md` (the tooling-first strategy).
- **Both config shapes** (single preset, node+dom `projects`) proven and documented — this resolved the
  "support both in one package?" question the original plan left open.

> **LiveKit pilot — now included (was deferred):** the original plan named the **LiveKit leaf components**
> (PR #2860) as the headline pilot, plus a `LiveKitRoomComponent` injectable-controller refactor. #2860 is
> now merged into `next`, so the components are present and the leaf pilot is **shipped** — DOM specs for
> `control-bar`, `agent-state`, `connection-overlay`, `chat-panel`, `device-menu`, plus `participant-tile`
> as the §7 **media-split** worked example. The equivalent in-repo leaf components added earlier remain.
> **Now complete:** the injectable-controller refactor on the room container shipped in Phase 2 (see below).

### Phase 2 — `packages/Angular/Generic/**` rollout ✅ SUBSTANTIALLY COMPLETE

Rolled out via a fan-out of per-package agents plus hands-on cleanup. **DOM specs now exist in 49 Generic
packages (~110 new spec files, ~1,100 tests, all green).** Every component-bearing Generic package is
covered **except three documented deferrals**:

| Deferred package               | Why                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------ |
| `livekit-room` (11 components) | WebRTC/media — e2e per §3, not DOM-unit                                        |
| `mj-livekit-room` (1)          | media (§3)                                                                     |
| `filter-builder` (3)           | genuine component-side `NG0100`/CD instability — masking is disallowed (§3/§7) |

`conversations` is **partially** covered (5 of 69 — the leaf slot/shared components); the rest is a focused
follow-up pass (too large for the sweep; many are realtime/streaming components that need careful deferral).

**Toolkit grew to meet the rollout** (all in `@memberjunction/ng-test-utils`): `renderComponentFixture`
(+ `imports`/`declarations`/`autoDetect` for module-declared components), `renderTemplate` (compound /
projected-children), **`createFakeProvider`** (data-bound components via the `[Provider]` input), and
**DOM helpers** (`query`/`queryAll`/`text`/`attr`/`hasClass`/`click`/`typeInto`/`capture`). The
`gen-dom-stub.mjs` generator now also bootstraps a package's config on `--write` (auto single-vs-dual
preset detection + `tsconfig.spec.json` + the `ng-test-utils` devDep).

**Within-package depth:** specs target the high-value **template contract** (gating, bindings, `@Output`s).
~73+ components were deliberately deferred — mostly **data-bound** (auto-load from a provider/engine in
`ngOnInit`; integration-shaped), plus media/canvas and a few component-side `NG0100` cases. **Each deferral
is documented in-spec** with its reason — no silent gaps, no faked green.

- **Exit criteria:** every Generic package has a DOM `vitest.config` + meaningful DOM specs for its primary
  components — **met**, except the three deferrals above. A formal coverage _threshold_ lands in Phase 4.

### Phase 3 — `packages/Angular/Explorer/**` rollout

- Same approach for Explorer packages (`explorer-core`, `dashboards`, `core-entity-forms`, `shared`, …).
  Heavier components (resource wrappers, dashboards) lean on mocked providers + `NavigationService` fakes.
- **Exit criteria:** Explorer packages covered to the agreed threshold.

### Phase 4 — Gates & coverage (incl. tooling-roadmap #4 + #5)

The "keep tests honest" half of the tooling gameplan lands here, alongside the coverage gate:

- Add a coverage threshold for Angular packages in CI (start lenient, ratchet up).
- **Guardrails** (tooling-roadmap #4): lint/CI rules for spec naming + anti-patterns.
- **Mutation testing** (tooling-roadmap #5): verify the tests actually catch bugs, once there's a real body of them.
- Document the live-media e2e suite location/runner for the excluded WebRTC paths.

### LiveKit pilot — shipped + remaining

**Shipped** (`ng-livekit-room`, dual node+dom preset; 6 DOM spec files / 45 tests, existing 26 node specs preserved):

- DOM specs for the leaf components: `control-bar`, `agent-state`, `connection-overlay`, `chat-panel`, `device-menu`.
- `participant-tile` — the §3/§7 **media-split** worked example. The media-free surface (avatar/initials,
  name + role badge, muted icon, screen-share chip, connection-quality, active-speaker ring, pin →
  `TogglePin`) is DOM-tested with a participant whose `Raw` exposes no tracks, so `track.attach()` never
  fires. `track.attach()`/`detach()` and the audio-meter `requestAnimationFrame` loop are left to live tests.

**Shipped (Phase 2):** the **injectable-controller refactor** on `LiveKitRoomComponent` —
`new LiveKitRoomController()` is now `inject(LIVEKIT_ROOM_CONTROLLER_FACTORY)()`, a token whose default
factory returns `new LiveKitRoomController()` (production behavior unchanged) — plus a container-level DOM
spec (`livekit-room.component.dom.test.ts`, 5 tests) that injects a **fake controller** and asserts the
container renders from its `State` (connection overlay vs. stage), routes a control-bar mic toggle back to
the controller, and re-renders on the controller's `stateChanged` event. The heavy child tree stays
un-rendered via input gating; media/track behavior remains live-tested per §3. This was the one
production-code change the review flagged.

## 7. Risks & mitigations

| Risk                                                                       | Mitigation                                                                                                                                             |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| jsdom missing APIs (ResizeObserver, matchMedia, IntersectionObserver, rAF) | Standard stubs installed in `vitest.dom.setup.ts`; extend there if a component needs more.                                                             |
| Partial-compiled (Ivy) libraries need JIT at test time                     | `import '@angular/compiler'` in the setup file (already the repo convention).                                                                          |
| Zoneless CD surprises (`NG0100`)                                           | Set `@Input`s via `componentRef.setInput`, set internal state before the first `detectChanges()`, or drive via DOM events. Documented in the guide §5. |
| CI time growth                                                             | Keep pure-logic specs on the node preset; only DOM specs pay the jsdom cost. Use the node+dom `projects` split.                                        |
| Over-mocking hides real bugs (esp. media)                                  | Hard rule: media behavior is **live-tested**, never asserted via mocks (§3).                                                                           |
| Analog version drift vs Angular 21                                         | Pinned: `@analogjs/vite-plugin-angular@^2.6.1`, Angular build packages forced to `21.1.3` via `overrides`.                                             |

## 8. Deliverables

| #   | Deliverable                                                                                                                             | Status                                                                                                  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 1   | `vitest.dom.shared.ts` + `vitest.dom.setup.ts` (root) + devDeps/overrides                                                               | ✅ shipped                                                                                              |
| 2   | `@memberjunction/ng-test-utils` helpers — `renderComponentFixture`, `renderTemplate`, `createFakeProvider`, DOM helpers                 | ✅ shipped                                                                                              |
| 3   | Coverage **reporting** wired into the DOM preset (gates remain Phase 4)                                                                 | ✅ shipped                                                                                              |
| 4   | Pilot packages converted with passing DOM specs                                                                                         | ✅ shipped (4 packages incl. `ng-livekit-room`, ~17 components)                                         |
| 5   | `guides/ANGULAR_TESTING_GUIDE.md`                                                                                                       | ✅ shipped                                                                                              |
| 6   | `scripts/scaffold-tests.mjs --dom` + `gen-dom-stub.mjs` (now also bootstraps package config: auto single/dual + tsconfig.spec + devDep) | ✅ shipped                                                                                              |
| 7   | Both config shapes (single + node/dom `projects`) proven                                                                                | ✅ shipped                                                                                              |
| 8   | LiveKit leaf specs + `participant-tile` media-split DOM specs (dual preset)                                                             | ✅ shipped (45 tests)                                                                                   |
| 8a  | `LiveKitRoomComponent` injectable-controller refactor + container spec                                                                  | ✅ shipped (Phase 2 — `LIVEKIT_ROOM_CONTROLLER_FACTORY` token, behavior-preserving; 5-test container spec)       |
| 9   | `Angular/Generic/**` rollout                                                                                                            | ✅ substantially complete (49 packages, ~1,100 tests; 3 documented deferrals + `conversations` partial) |
| 10  | `Angular/Explorer/**` rollout                                                                                                           | ⏳ Phase 3                                                                                              |
| 11  | CI coverage gates + live-media e2e location                                                                                             | ⏳ Phase 4                                                                                              |

## 9. Reference implementations (in-repo)

- **Single preset, leaf components** —
  [`ng-ui-components`](../../packages/Angular/Generic/ui-components): `vitest.config.ts`,
  `tsconfig.spec.json`, and `src/lib/{switch,progress-bar,stat-badge,view-toggle}/*.component.dom.test.ts`.
- **Dual preset (node + dom), external template, `@Output`** —
  [`ng-pagination`](../../packages/Angular/Generic/pagination): `vitest.config.ts` (the `projects` split),
  `tsconfig.spec.json`, and `src/lib/pagination.component.dom.test.ts`.
- **Harness** — [`vitest.dom.shared.ts`](../../vitest.dom.shared.ts) /
  [`vitest.dom.setup.ts`](../../vitest.dom.setup.ts).
- **Guide** — [`guides/ANGULAR_TESTING_GUIDE.md`](../../guides/ANGULAR_TESTING_GUIDE.md).

## 10. Handoff — how to continue

### Test it locally

```bash
# from repo root — install the new devDeps (analog, @angular/build, jsdom) if you haven't
npm install

# run a pilot package's full suite (DOM specs + existing class-level specs)
cd packages/Angular/Generic/ui-components && npm run test   # 16 files, 228 tests
cd packages/Angular/Generic/pagination    && npm run test   # node(39) + dom(6) = 45 tests

# watch mode
npm run test:watch

# changed packages only, from repo root
npx turbo run test --filter=...[HEAD~1]
```

Expect first-run cost per file: ~0.3–0.8s of Angular compile/setup, then specs in low tens of ms.

### Add DOM tests to the next package

1. Scaffold: `node scripts/scaffold-tests.mjs packages/Angular/Generic/<pkg> --dom`
   (emits DOM `vitest.config.ts` + `tsconfig.spec.json` + a passing starter spec).
2. **Pick the config shape:** if the package has a class-level spec that `vi.mock('@angular/core')`, switch to
   the **node+dom `projects`** layout (copy `ng-pagination/vitest.config.ts`); otherwise keep the single
   preset (copy `ng-ui-components/vitest.config.ts`).
3. Write specs next to each component as `*.component.dom.test.ts`. Set `@Input`s via
   `fixture.componentRef.setInput(...)`, drive DOM events, assert on `fixture.nativeElement` + `@Output`
   emissions. Mind the zoneless `NG0100` rule (guide §5).
4. `cd` into the package and `npm run test` until green; the existing class-level specs must stay green too.

### Rollout checklist

- **Generic (Phase 2):** ✅ substantially complete — 49 packages have DOM specs (~1,100 tests). Remaining
  Generic work: (a) **`conversations`** deep-dive (5/69 covered — its own focused pass), (b) **`filter-builder`**
  (deferred — component-side `NG0100`; needs a component fix or a documented decision to leave), (c) the
  **LiveKit/media** packages (`livekit-room`, `mj-livekit-room`) → e2e per the LiveKit follow-up, and
  (d) optionally going **deeper** on the ~73 data-bound/media components deferred within covered packages
  (each needs real provider/engine fakes — diminishing returns; do demand-driven).
- **Explorer (Phase 3):** `explorer-core`, `dashboards`, `core-entity-forms`, `shared`, … (mock providers +
  `NavigationService` fakes for heavier components).
- **Phase 4:** coverage gates in CI (start lenient, ratchet up); document the live-media e2e suite location.
- **LiveKit:** leaf specs + `participant-tile` media-split ✅ shipped; the `LiveKitRoomComponent` injectable-controller refactor + container spec is now **✅ shipped (Phase 2)** — `LIVEKIT_ROOM_CONTROLLER_FACTORY` token (behavior-preserving) + a 5-test container spec driven by a fake controller.

### Environment note

The new devDeps are in the root `package.json` and `package-lock.json`; CI `npm ci` will pick them up. If a
fresh `npm install` ever re-surfaces an Angular-build peer conflict, it's the Analog optional peers resolving
to a newer Angular — the `overrides` pinning `@angular/build` / `@angular-devkit/build-angular` /
`@angular/platform-server` / `@angular/ssr` to `21.1.3` is what keeps that consistent with the repo.
