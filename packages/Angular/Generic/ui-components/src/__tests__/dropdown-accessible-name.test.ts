import { describe, it, expect } from 'vitest';
import { ChangeDetectorRef, Injector, runInInjectionContext } from '@angular/core';
import { MJDropdownComponent } from '../lib/dropdown/dropdown.component';

/**
 * The accessible-name inputs on `mj-dropdown` (#4337 backport of #3860). The template binds these
 * getters straight to aria attributes, so the naming rules are checked on the class.
 */
function createDropdown(): MJDropdownComponent {
  const cdr: Pick<ChangeDetectorRef, 'markForCheck' | 'detectChanges'> = {
    markForCheck: () => undefined,
    detectChanges: () => undefined,
  };
  const injector = Injector.create({ providers: [{ provide: ChangeDetectorRef, useValue: cdr }] });
  return runInInjectionContext(injector, () => new MJDropdownComponent());
}

describe('MJDropdownComponent accessible name', () => {
  it('defaults every naming input to empty, so no attribute renders', () => {
    const dd = createDropdown();
    expect(dd.AriaLabel).toBe('');
    expect(dd.AriaLabelledBy).toBe('');
    expect(dd.AriaDescribedBy).toBe('');
    expect(dd.InputId).toBe('');
  });

  it('gives each instance its own listbox id for aria-controls', () => {
    const a = createDropdown();
    const b = createDropdown();
    expect(a.ListboxId).toMatch(/^mj-dropdown-listbox-\d+$/);
    expect(a.ListboxId).not.toBe(b.ListboxId);
  });

  it('names the filter box "Filter <name>" from AriaLabel, without doubling "Filter"', () => {
    const dd = createDropdown();
    expect(dd.FilterLabel).toBe('Filter options');
    dd.AriaLabel = 'Search in';
    expect(dd.FilterLabel).toBe('Filter Search in');
    dd.AriaLabel = 'Filter roles';
    expect(dd.FilterLabel).toBe('Filter roles');
  });

  it('composes the filter box name from the visible label when AriaLabelledBy is set', () => {
    const dd = createDropdown();
    expect(dd.FilterLabelledBy).toBe('');
    dd.AriaLabelledBy = 'persona-label';
    expect(dd.FilterLabelledBy).toBe(`${dd.FilterWordId} persona-label`);
  });
});
