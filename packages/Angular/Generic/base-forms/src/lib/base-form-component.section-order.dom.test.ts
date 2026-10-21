import { describe, it, expect, beforeEach } from 'vitest';
import { ChangeDetectorRef, Component, ElementRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { BaseEntity } from '@memberjunction/core';
import { BaseFormComponent } from './base-form-component';

/**
 * A contribution panel reports its row count so the rail can show a badge, and the form stores
 * that count against the panel's key. Storing it must not make the panel a declared section:
 * `getSectionOrderIndex` answers "the user or the form placed this here", and a panel it answers
 * for is drawn at that index instead of at its slot. Without a record the form has no saved
 * order, so the declared sections are the whole answer.
 */

@Component({ standalone: true, template: '' })
class TestForm extends BaseFormComponent {
  public record!: BaseEntity;

  public Seed(keys: string[]): void {
    this.initSections(keys.map((key) => ({ sectionKey: key, sectionName: key, isExpanded: true })));
  }
}

function makeForm(): TestForm {
  const form = TestBed.runInInjectionContext(() => new TestForm());
  form.Seed(['details', 'dates']);
  return form;
}

describe('BaseFormComponent — section order and row counts', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: ChangeDetectorRef, useValue: { markForCheck: () => undefined, detectChanges: () => undefined } },
        { provide: ElementRef, useValue: new ElementRef(document.createElement('div')) },
      ],
    });
  });

  it('places the declared sections in order', () => {
    const form = makeForm();
    expect(form.getSectionOrderIndex('details')).toBe(0);
    expect(form.getSectionOrderIndex('dates')).toBe(1);
  });

  it('keeps a contribution panel that reports a row count out of the section order', () => {
    const form = makeForm();
    form.SetSectionRowCount('panel:Cohort', 12);
    expect(form.getSectionOrderIndex('panel:Cohort')).toBeNull();
    expect(form.getSectionOrder()).toEqual(['details', 'dates']);
  });

  it('still keeps the count, so the rail badge can read it', () => {
    const form = makeForm();
    form.SetSectionRowCount('panel:Cohort', 12);
    expect(form.GetSectionRowCount('panel:Cohort')).toBe(12);
  });

  it('updates a declared section\'s count without changing its place', () => {
    const form = makeForm();
    form.SetSectionRowCount('dates', 3);
    expect(form.GetSectionRowCount('dates')).toBe(3);
    expect(form.getSectionOrderIndex('dates')).toBe(1);
  });
});
