import { Component, ModuleWithProviders, Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

/**
 * Options for {@link renderTemplate}.
 */
export interface RenderTemplateOptions {
  /** Components to declare in the testing module (e.g. the module-declared components under test). */
  declarations?: Type<unknown>[];
  /** Modules to import (e.g. `CommonModule`, or `SomeModule.forRoot()`). */
  imports?: Array<Type<unknown> | ModuleWithProviders<object>>;
}

/**
 * Render an arbitrary template (a composition of components) for **compound /
 * module-declared** components — the case `renderComponentFixture` can't handle.
 *
 * It wraps your markup in a throwaway host component, declares it alongside the
 * components you pass, configures the testing module, then drives change detection
 * automatically and waits for it to settle (so components that refresh on a delay
 * — their own async change detection — are stable before you assert).
 *
 * Use this when a component takes **projected children** and/or is `standalone: false`.
 * For a single standalone component, prefer {@link renderComponentFixture}.
 *
 * @example
 * ```ts
 * const fixture = await renderTemplate(
 *   `<mj-tabstrip>
 *      <mj-tab Name="A">Tab A</mj-tab>
 *      <mj-tab-body>Body A</mj-tab-body>
 *    </mj-tabstrip>`,
 *   { imports: [CommonModule], declarations: [MJTabStripComponent, MJTabComponent, MJTabBodyComponent] },
 * );
 * const tabs = fixture.nativeElement.querySelectorAll('.single-tab');
 * ```
 */
export async function renderTemplate(
  template: string,
  options: RenderTemplateOptions = {},
): Promise<ComponentFixture<unknown>> {
  @Component({ standalone: false, template })
  class TemplateHostComponent {}

  TestBed.configureTestingModule({
    imports: options.imports ?? [],
    declarations: [TemplateHostComponent, ...(options.declarations ?? [])],
  });

  const fixture = TestBed.createComponent(TemplateHostComponent);
  // Compound components often refresh on a delay (their own async change detection),
  // so let Angular drive CD automatically and wait for it to settle, rather than
  // fighting it with manual detectChanges() (which trips the dev-mode NG0100 check).
  fixture.autoDetectChanges();
  await fixture.whenStable();
  return fixture;
}
