import { ComponentRef, ModuleWithProviders, Provider, Type } from '@angular/core';
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

  /**
   * Modules to import (e.g. `CommonModule`, `FormsModule`). Provide when the component
   * (or a `declarations` entry) needs them.
   */
  imports?: Array<Type<unknown> | ModuleWithProviders<object>>;

  /**
   * Components/directives to declare. Pass these for a **module-declared**
   * (`standalone: false`) component that you configure via `inputs` (not projected
   * children) — include the component itself plus any child components it renders.
   * Standalone components need neither `imports` nor `declarations`.
   */
  declarations?: Type<unknown>[];

  /**
   * Providers to register in the testing module — supply stub/fake versions of any
   * services the component injects via its constructor. A component with
   * constructor-injected services cannot even be *constructed* without these, so this
   * is the seam for presentational components that take services but only touch them in
   * event handlers (not during render). Prefer minimal `{ provide: X, useValue: ... }`
   * stubs over the real service. See `guides/ANGULAR_TESTING_GUIDE.md`.
   */
  providers?: Provider[];

  /**
   * Use `autoDetectChanges()` instead of a single `detectChanges()`. Set this for
   * components that mutate their own state during init/CD (recompute a bound value in
   * `ngOnInit`/`ngOnChanges`), which would otherwise trip the dev-mode `NG0100` check.
   */
  autoDetect?: boolean;
}

/**
 * Create and render a component into the jsdom DOM in the zoneless-correct order:
 * (optionally configure a testing module), apply `@Input`s via `setInput`, run any
 * imperative `setup`, then a single `detectChanges()`. Returns the `ComponentFixture`.
 *
 * @example
 * ```ts
 * // standalone leaf — inputs only
 * const fixture = renderComponentFixture(MyComponent, { inputs: { Disabled: true } });
 *
 * // module-declared component configured via inputs
 * const fixture = renderComponentFixture(FilterBuilderComponent, {
 *   imports: [CommonModule, FormsModule],
 *   declarations: [FilterBuilderComponent, FilterGroupComponent, FilterRuleComponent],
 *   inputs: { fields: FIELDS },
 * });
 * ```
 *
 * (For a component that needs projected *children*, use `renderTemplate` instead.)
 */
export function renderComponentFixture<T>(component: Type<T>, options: RenderComponentFixtureOptions<T> = {}): ComponentFixture<T> {
  if (options.imports || options.declarations || options.providers) {
    TestBed.configureTestingModule({
      imports: options.imports ?? [],
      declarations: options.declarations ?? [],
      providers: options.providers ?? [],
    });
  }
  const fixture = TestBed.createComponent(component);
  for (const [name, value] of Object.entries(options.inputs ?? {})) {
    fixture.componentRef.setInput(name, value);
  }
  options.setup?.(fixture.componentInstance, fixture.componentRef);
  if (options.autoDetect) {
    fixture.autoDetectChanges();
  } else {
    fixture.detectChanges();
  }
  return fixture;
}
