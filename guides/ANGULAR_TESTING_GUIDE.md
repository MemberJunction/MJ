# Angular Testing Guide

How to test MemberJunction Angular components. MJ runs **Vitest** everywhere (Jest is
deprecated). For Angular there are now **two** complementary test styles:

- **Class-level tests** — instantiate the component class with `new`, exercise pure logic
  (getters, navigation methods, `@Output` emission), assert on state. Fast, no DOM. These
  already exist across the Angular packages and **stay**.
- **DOM-level tests** — render the component into a real (headless, jsdom) DOM with Angular
  `TestBed` + `ComponentFixture`, set `@Input`s, dispatch DOM events, and assert on the
  **rendered output** and `@Output` emissions. This is the half of a component's contract
  that lives in the **template** (`@if` gating, bindings, `(click)` → handler wiring,
  conditional classes, a11y attributes) — class-level tests can't see it.

There is also a third style this guide does **not** cover but tells you when to reach for:
**live tests** (Playwright / e2e) for WebRTC and real-media paths.

> Background / rollout plan: [`plans/testing/angular-dom-testing-rollout.md`](../plans/testing/angular-dom-testing-rollout.md).

---

## 1. Decision tree: which test do I write?

| You want to verify… | Use |
|---|---|
| A pure getter / method / computed value, `@Output` payload shape | **Class-level** (`new`, assert) |
| `@if` shows/hides the right element; binding renders the right attribute/text; `(click)` calls the handler and emits; conditional CSS class; `aria-*` | **DOM-level** (`TestBed` + `ComponentFixture`) |
| Real camera/mic/`getUserMedia`, `AudioContext`, WebRTC, `track.attach()`, `<video>`/`<audio>` playback, audio metering, rAF-driven media | **Live test** (Playwright / e2e). **Never** mock these into a fake "pass." |

A media-touching component gets **both** a DOM test (for its presentational, media-free
surface, with the media client mocked at the seam) **and** a live test (for the actual media
behavior). Document the split in the spec.

---

## 2. The harness (how it works)

DOM testing is a repo-level infrastructure addition; a package then **opts in**.

- **Renderer**: [`@analogjs/vite-plugin-angular`](https://analogjs.org) compiles Angular
  templates/decorators for Vite/Vitest (AOT, `jit: false`).
- **Environment**: `jsdom`.
- **Change detection**: **zoneless** — there is no `zone.js` anywhere in this path. The shared
  setup applies `provideZonelessChangeDetection()` to every spec via a global `beforeEach`, and
  you drive CD explicitly with `fixture.detectChanges()` / `await fixture.whenStable()`.

Two root files implement it (peers of the node preset `vitest.shared.ts`):

- [`vitest.dom.shared.ts`](../vitest.dom.shared.ts) — the preset: `angular()` + `tsconfigPaths()`
  plugins, `environment: 'jsdom'`, the setup file, and auto-detection of a per-package
  `tsconfig.spec.json`.
- [`vitest.dom.setup.ts`](../vitest.dom.setup.ts) — initializes the Angular testing platform once
  (`platformBrowserTesting`), wires zoneless CD, imports `@angular/compiler` (JIT fallback for
  partial-compiled libraries), and installs the standard jsdom stubs (`matchMedia`,
  `ResizeObserver`, `IntersectionObserver`).

Required repo-level devDependencies (already in the root `package.json`):
`@analogjs/vite-plugin-angular`, `@angular/build`, `jsdom`. Run `npm install` at the repo root if
they aren't installed.

---

## 3. Adding DOM tests to a package

### 3a. Scaffold

```bash
node scripts/scaffold-tests.mjs packages/Angular/Generic/my-widget --dom
```

This emits a DOM-preset `vitest.config.ts`, a `tsconfig.spec.json`, and a passing starter
`ComponentFixture` spec. Then replace the starter with specs for your real components.

### 3b. The two config shapes

**Single preset** — use when the package has **no** class-level spec that
`vi.mock('@angular/core')`. The package's existing class-level specs run fine under jsdom too.
Reference: [`ng-ui-components/vitest.config.ts`](../packages/Angular/Generic/ui-components/vitest.config.ts).

```ts
import { defineProject, mergeConfig } from 'vitest/config';
import domSharedConfig from '../../../../vitest.dom.shared';

export default mergeConfig(
  domSharedConfig,
  defineProject({ test: { name: '@memberjunction/ng-my-widget' } }),
);
```

**Dual preset (vitest `projects`)** — use when the package has a class-level spec that
`vi.mock('@angular/core')`. That mock breaks under the Angular compile path (the compiled
component calls `ɵɵdefineComponent`, which the mock doesn't provide). Rather than rewrite a good
test, run the node specs on the node preset and the DOM specs on jsdom, with **disjoint** file
sets. Reference: [`ng-pagination/vitest.config.ts`](../packages/Angular/Generic/pagination/vitest.config.ts).

```ts
import { defineConfig, mergeConfig } from 'vitest/config';
import nodeSharedConfig from '../../../../vitest.shared';
import domSharedConfig from '../../../../vitest.dom.shared';

export default defineConfig({
  test: {
    projects: [
      mergeConfig(nodeSharedConfig, defineConfig({
        test: { name: 'my-widget (node)', environment: 'node', exclude: ['**/*.dom.test.ts'] },
      })),
      mergeConfig(domSharedConfig, defineConfig({
        test: { name: 'my-widget (dom)', include: ['src/**/*.dom.test.ts'], exclude: ['**/__tests__/**'] },
      })),
    ],
  },
});
```

> `mergeConfig` **concatenates** the shared `include`/`exclude` arrays — so separate the two
> projects by **excluding**, not by trying to override `include`.

### 3c. `tsconfig.spec.json`

The Angular compiler must see spec files in its TypeScript program to type-check templates, but
the build `tsconfig.json` usually **excludes** `*.test.ts`. So each DOM package adds a
`tsconfig.spec.json` that re-includes them; the preset auto-detects it:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "types": ["vitest/globals", "node"] },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

### 3d. Naming & location

Name DOM specs `*.component.dom.test.ts` and put them next to the component
(`src/lib/<feature>/x.component.dom.test.ts`). The `.dom.test.ts` suffix is what the dual-preset
split keys off; it also reads as "this renders."

---

## 4. The fixture pattern

```ts
import { describe, it, expect, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MyWidgetComponent } from './my-widget.component';

describe('MyWidgetComponent (DOM)', () => {
  it('hides the action when disabled', () => {
    const fixture = TestBed.createComponent(MyWidgetComponent);
    fixture.componentRef.setInput('Disabled', true);   // see §5
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.action')).toBeNull();
  });

  it('emits Save when the button is clicked', () => {
    const fixture = TestBed.createComponent(MyWidgetComponent);
    const spy = vi.fn();
    fixture.componentInstance.Save.subscribe(spy);
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('button.save') as HTMLButtonElement).click();
    expect(spy).toHaveBeenCalled();
  });
});
```

- Query rendered DOM via `fixture.nativeElement.querySelector(...)`.
- Standalone components need no `configureTestingModule` — `TestBed.createComponent(Cmp)` just
  works. For module-declared components, add `TestBed.configureTestingModule({ imports: [...] })`
  before the first `createComponent` (the global zoneless provider merges in automatically).

---

## 5. 🚨 Zoneless change-detection gotcha (read this)

In zoneless mode a programmatic state change does **not** mark the view dirty. If you mutate
state and then call `fixture.detectChanges()`, Angular's dev-mode check-no-changes pass can throw
`NG0100 ExpressionChangedAfterItHasBeenCheckedError`, because the main CD pass rendered the old
value and the verification pass sees the new one.

Three reliable ways to avoid it:

1. **Set `@Input`s via `fixture.componentRef.setInput('Name', value)`** — this marks the component
   dirty the zoneless-correct way. Prefer this over assigning `fixture.componentInstance.Name = …`.
2. **Set programmatic (non-input) state BEFORE the first `detectChanges()`**, then render once.
3. **Drive changes through real DOM events** (`button.click()`) — event handling marks the view
   dirty, so the subsequent `detectChanges()` is clean.

```ts
// ✅ input via setInput
fixture.componentRef.setInput('OffLabel', 'Off');
fixture.detectChanges();

// ✅ internal state set before first CD
const fixture = TestBed.createComponent(MySwitch);
fixture.componentInstance.setDisabledState(true);
fixture.detectChanges();

// ❌ mutate-after-render — risks NG0100
fixture.detectChanges();
fixture.componentInstance.someState = true;   // view not marked dirty
fixture.detectChanges();                        // check-no-changes may throw
```

---

## 6. Mocking recipes

### Data-bound components (provider / RunView)

Use `createFakeProvider` from `@memberjunction/ng-test-utils` — it builds a fake `IMetadataProvider`
whose `RunView`/`RunViews` return your canned rows (no backend, no `vi.mock` of `@memberjunction/core`).
How you get it into the component depends on **how the component reads data**:

**A — Injectable `[Provider]` (preferred).** If the component reads through `this.ProviderToUse`
(i.e. it extends `BaseAngularComponent` and calls `RunView.FromMetadataProvider(this.ProviderToUse)`),
pass the fake straight into the `[Provider]` input. Clean, no globals, no cleanup:

```ts
const f = renderComponentFixture(MyDataComponent, {
  inputs: { Provider: createFakeProvider({ runViewResults: ROWS }) },
});
```

**B — Global provider (`useFakeGlobalProvider`).** If the component loads through a bare
`new RunView()` (which reads the process-global `RunView.Provider`) and/or `Metadata.Provider`
(`EntityByName` / `GetEntityObject`) — and you do **not** want to refactor it — install a fake global.
`useFakeGlobalProvider()` registers `beforeEach`/`afterEach` to save and restore **both** globals
(no leaks) and returns an installer. Call it once at the top of the `describe`:

```ts
import { renderComponentFixture, useFakeGlobalProvider } from '@memberjunction/ng-test-utils';

describe('MyDataComponent (DOM)', () => {
  const installProvider = useFakeGlobalProvider();   // owns the save/restore + cast

  it('renders the loaded rows', async () => {
    installProvider({ runViewResults: ROWS });
    const f = renderComponentFixture(MyDataComponent);
    await new Promise((r) => setTimeout(r, 0));       // let the async ngOnInit load settle
    f.detectChanges();
    expect(queryAll(f, '.row').length).toBe(ROWS.length);
  });
});
```

`runViewResults` may be a **function of the params** (`(p) => p.EntityName === 'X' ? ROWS_X : ROWS_Y`)
to serve a multi-entity `RunViews` call. Prefer **A** when the component supports it — B is a global
swap (a standard, save/restore-scoped pattern, but a global swap nonetheless) and doesn't address the
multi-provider-correctness reason a component shouldn't reach the global in the first place.

> **Async loads need a flush.** Components that load in `ngOnInit`/`ngOnChanges` resolve their
> `RunView` promise on a microtask *after* the first `detectChanges()`. Flush it (`await new
> Promise(r => setTimeout(r, 0))`) and then `detectChanges()` again before asserting, or you'll see
> the loading/empty state.

> **Boundary — plain rows, not live entities.** `createFakeProvider` returns **plain objects**, not
> `BaseEntity` instances. It fits components that read result rows as data (`row.Name`, `row.ID`,
> spreads). It does **not** fit a component that calls `BaseEntity` methods on the loaded results —
> `.Get()` / `.Set()` / `.Fields` / `.EntityInfo` (common with `ResultType: 'entity_object'` plus a
> `makeRow`/field-validation step). Faking those would mean mocking the whole entity surface; defer
> that component's data path instead (test its chrome), or cover it with a real provider in an
> integration/live test.

### Other recipes

- **Container components that internally `new` an engine/controller**: refactor the dependency to
  be **injectable** (e.g. `inject()` a factory token), so the test injects a fake that drives the
  DOM. Leaf components that are already pure `@Input`/`@Output` need none of this.
- **Media APIs**: stub the media client at the seam for the presentational assertions, and defer
  the real behavior to a live test (see §7). Do not assert media behavior via mocks.

---

## 7. The hard rule: media is live-tested, never faked

jsdom does not implement WebRTC, `navigator.mediaDevices.getUserMedia`, `AudioContext`,
`MediaStreamTrack`, real `<video>`/`<audio>` playback, or `requestAnimationFrame`-driven media. The
setup file deliberately does **not** stub these.

For a component that touches them:

- **DOM-unit-test only its media-free surface** — gating, labels, button enabled/disabled states,
  `@Output` emission on click — with the media client mocked at the seam.
- **Live-test the actual media behavior** (capture, `track.attach()`, metering) via the Playwright
  CLI workflow / e2e suite.

Never mock a `MediaStream` into a green DOM test and call the media path "covered."

---

## 8. JIT / partial-compiled note

MJ libraries publish partial-compiled (Ivy) output. The Analog plugin AOT-compiles sources for the
test bundle, and the setup file also `import '@angular/compiler'` so JIT is available as a fallback
(the long-standing repo convention in the class-level specs). You normally don't have to think
about it.

---

## 9. Worked references (in this repo)

- **Leaf components, single preset** —
  [`ng-ui-components`](../packages/Angular/Generic/ui-components): `switch` (CVA + click toggle),
  `progress-bar` (`@if/@else` branch), `stat-badge` (gating + host-class variants), `view-toggle`
  (`@for` + `@Output`).
- **Dual preset (node + dom), external template, `@Output`** —
  [`ng-pagination`](../packages/Angular/Generic/pagination): `pagination` (self-hiding gating,
  disabled-button no-op, `PageChange` payload) alongside an unchanged `@angular/core`-mocking
  class-level spec.

---

## 10. Running

```bash
# one package
cd packages/Angular/Generic/ui-components && npm run test

# watch
npm run test:watch

# changed packages only (from repo root)
npx turbo run test --filter=...[HEAD~1]
```
