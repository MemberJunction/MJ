import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChangeDetectorRef, Component, ElementRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { BaseEntity } from '@memberjunction/core';
import { BaseFormComponent } from './base-form-component';

/**
 * `formContext` is bound in dozens of places per form and re-read on every change-detection pass.
 * Both contribution-derived values in it (hidden section keys, claimed field names) come from one
 * read of the registration collector per access.
 */

const collector = vi.hoisted(() => ({ calls: 0 }));
vi.mock('./panel-slot/collect-form-contribution-registrations', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CollectFormContributionRegistrations: () => { collector.calls++; return []; },
}));

@Component({ standalone: true, template: '' })
class TestForm extends BaseFormComponent {
  public record!: BaseEntity;
}

describe('BaseFormComponent.formContext — registration reads', () => {
  beforeEach(() => {
    collector.calls = 0;
    TestBed.configureTestingModule({
      providers: [
        { provide: ChangeDetectorRef, useValue: { markForCheck: () => undefined, detectChanges: () => undefined } },
        { provide: ElementRef, useValue: new ElementRef(document.createElement('div')) },
      ],
    });
  });

  it('reads the registrations once per access', () => {
    const form = TestBed.runInInjectionContext(() => new TestForm());
    form.record = { EntityInfo: { Name: 'Accounts', RelatedEntities: [], ChildEntities: [] } } as unknown as BaseEntity;
    void form.formContext;
    expect(collector.calls).toBe(1);
  });

  it('reads none without a record', () => {
    const form = TestBed.runInInjectionContext(() => new TestForm());
    void form.formContext;
    expect(collector.calls).toBe(0);
  });
});
