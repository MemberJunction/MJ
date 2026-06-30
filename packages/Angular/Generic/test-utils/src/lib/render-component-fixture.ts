import { ComponentRef, Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

/**
 * Options for {@link renderComponentFixture}.
 *
 * @typeParam T - the component type being rendered.
 */
export interface RenderComponentFixtureOptions<T> {
  /**
   * `@Input`s to apply, by name. Set via `componentRef.setInput`, which is the
   * zoneless-correct way to mark the view dirty (avoids the `NG0100`
   * ExpressionChangedAfterItHasBeenCheckedError that bites when state is mutated
   * after the first change-detection pass). See `guides/ANGULAR_TESTING_GUIDE.md` §5.
   */
  inputs?: Record<string, unknown>;

  /**
   * Imperative setup run AFTER inputs are applied but BEFORE the first
   * `detectChanges()` — call component methods, set internal state, or wire spies
   * to `@Output`s. Receives the live component instance and its `ComponentRef`.
   * Running before the single render is what keeps the test `NG0100`-safe.
   */
  setup?: (instance: T, ref: ComponentRef<T>) => void;
}

/**
 * Create and render a component into the jsdom DOM in the zoneless-correct order:
 * apply `@Input`s via `setInput`, run any imperative `setup`, then a single
 * `detectChanges()`. Returns the `ComponentFixture` for querying / asserting.
 *
 * @example
 * ```ts
 * // inputs only
 * const fixture = renderComponentFixture(MyComponent, { inputs: { Disabled: true } });
 * expect(fixture.nativeElement.querySelector('button')?.disabled).toBe(true);
 *
 * // wire an @Output spy before render
 * const spy = vi.fn();
 * const fixture = renderComponentFixture(MyComponent, { setup: (c) => c.Clicked.subscribe(spy) });
 * (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
 * expect(spy).toHaveBeenCalledTimes(1);
 * ```
 *
 * Standalone components need no `configureTestingModule`. For components that
 * require providers or module imports, configure `TestBed` before calling this
 * (a future `providers` / `imports` option can fold that in).
 */
export function renderComponentFixture<T>(
  component: Type<T>,
  options: RenderComponentFixtureOptions<T> = {},
): ComponentFixture<T> {
  const fixture = TestBed.createComponent(component);
  for (const [name, value] of Object.entries(options.inputs ?? {})) {
    fixture.componentRef.setInput(name, value);
  }
  options.setup?.(fixture.componentInstance, fixture.componentRef);
  fixture.detectChanges();
  return fixture;
}
