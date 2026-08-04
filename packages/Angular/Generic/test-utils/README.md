# @memberjunction/ng-test-utils

Shared helpers for **DOM-level Angular component unit tests** in MemberJunction.

These are test-time utilities (consumed from `*.dom.test.ts` specs running under the
Vitest + jsdom + `@analogjs/vite-plugin-angular` harness). They are **not** runtime
code and should only be referenced as a `devDependency`.

## `renderComponentFixture(component, options?)`

Creates and renders a component into the jsdom DOM in the **zoneless-correct order** —
apply `@Input`s via `setInput`, run any imperative `setup`, then a single
`detectChanges()` — and returns the `ComponentFixture`. Baking the order into the helper
keeps every spec safe from the `NG0100` (`ExpressionChangedAfterItHasBeenCheckedError`)
trap described in `guides/ANGULAR_TESTING_GUIDE.md` §5.

```ts
import { renderComponentFixture } from '@memberjunction/ng-test-utils';

// inputs only
const fixture = renderComponentFixture(MyComponent, { inputs: { Disabled: true } });
expect(fixture.nativeElement.querySelector('button')?.disabled).toBe(true);

// wire an @Output spy before render
const spy = vi.fn();
const fixture = renderComponentFixture(MyComponent, { setup: (c) => c.Clicked.subscribe(spy) });
(fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
expect(spy).toHaveBeenCalledTimes(1);
```

### Options

| Option | Purpose |
|---|---|
| `inputs` | `@Input`s to set via `componentRef.setInput` (zoneless-correct). |
| `setup`  | Imperative setup `(instance, ref) => void` run **before** the first `detectChanges()` — call methods, set state, wire `@Output` spies. |

Standalone components need no `configureTestingModule`. Components requiring providers or
module imports should configure `TestBed` before calling `renderComponentFixture` (a future
`providers` / `imports` option can fold that in).
