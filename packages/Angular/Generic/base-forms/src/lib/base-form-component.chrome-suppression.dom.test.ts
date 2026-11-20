import { describe, it, expect, beforeEach } from 'vitest';
import { ChangeDetectorRef, Component, ElementRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { BaseEntity } from '@memberjunction/core';
import { BaseFormComponent } from './base-form-component';

/**
 * A section an admin hid with a Form Chrome Rule `None` must not load (#5000). Every lazy loader —
 * a stock related grid's [AllowLoad], a contribution panel — asks `IsSectionExpanded`, so that is
 * where suppression is honoured: false for a suppressed key whatever the saved state says, and
 * false for a lazily loaded section while the rules have not loaded yet.
 */

@Component({ standalone: true, template: '' })
class TestForm extends BaseFormComponent {
  public record!: BaseEntity;

  public Seed(): void {
    this.initSections([
      { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
      { sectionKey: 'orders', sectionName: 'Orders', isExpanded: false },
      { sectionKey: 'payments', sectionName: 'Payments', isExpanded: false },
    ]);
  }
}

function makeForm(): TestForm {
  const form = TestBed.runInInjectionContext(() => new TestForm());
  form.Seed();
  // The user expanded both related sections in an earlier session.
  form.SetSectionExpanded('orders', true);
  form.SetSectionExpanded('payments', true);
  return form;
}

const PENDING = { RulesResolved: false, SuppressedSectionKeys: new Set<string>() };
const resolved = (...keys: string[]) => ({ RulesResolved: true, SuppressedSectionKeys: new Set(keys) });

describe('BaseFormComponent.IsSectionExpanded — chrome rule suppression', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: ChangeDetectorRef, useValue: { markForCheck: () => undefined, detectChanges: () => undefined } },
        { provide: ElementRef, useValue: new ElementRef(document.createElement('div')) },
      ],
    });
  });

  it('is unchanged for a form outside a container (no suppression state)', () => {
    const form = makeForm();
    expect(form.IsSectionExpanded('orders')).toBe(true);
    expect(form.IsSectionExpanded('details', true)).toBe(true);
  });

  it('holds lazily loaded sections closed while the rules are pending, but not field sections', () => {
    const form = makeForm();
    form.SetChromeSuppression(PENDING);
    expect(form.IsSectionExpanded('orders')).toBe(false);
    expect(form.IsSectionExpanded('orders', false)).toBe(false);
    expect(form.IsSectionExpanded('panel:Forms')).toBe(false);
    expect(form.IsSectionExpanded('details')).toBe(true);
    expect(form.IsSectionExpanded('details', true)).toBe(true);
  });

  it('reports a suppressed section collapsed even when the saved state is expanded', () => {
    const form = makeForm();
    form.SetChromeSuppression(resolved('orders'));
    expect(form.IsSectionExpanded('orders')).toBe(false);
  });

  it('lets a section that is not suppressed load once the rules resolve', () => {
    const form = makeForm();
    form.SetChromeSuppression(PENDING);
    expect(form.IsSectionExpanded('payments')).toBe(false);
    form.SetChromeSuppression(resolved('orders'));
    expect(form.IsSectionExpanded('payments')).toBe(true);
  });

  it('keeps the seeded default for a section the user toggled during the pending window', () => {
    const form = makeForm();
    form.SetChromeSuppression(PENDING);
    form.SetSectionExpanded('details', false);
    // The form's own default for 'details' is expanded, so it is not a lazy section.
    form.SetSectionExpanded('details', true);
    expect(form.IsSectionExpanded('details')).toBe(true);
  });
});
