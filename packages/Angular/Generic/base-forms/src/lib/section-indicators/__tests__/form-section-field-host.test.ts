import { describe, it, expect } from 'vitest';
import { SectionRelevantFormContextChanged } from '../form-section-field-host';
import type { FormContext } from '../../types/form-types';

/**
 * `BaseFormComponent.formContext` is rebuilt on every access, so a field's `[FormContext]` input
 * changes identity every pass. Only the members a section's counts depend on may wake the section.
 */
describe('SectionRelevantFormContextChanged', () => {
  const base: FormContext = { showValidation: false, validationRevision: 0, showEmptyFields: false, sectionFilter: '' };

  it('is false for the same object and for a fresh object with the same relevant members', () => {
    expect(SectionRelevantFormContextChanged(base, base)).toBe(false);
    expect(SectionRelevantFormContextChanged(base, { ...base })).toBe(false);
  });

  it('ignores members that do not feed a section count', () => {
    expect(SectionRelevantFormContextChanged(base, { ...base, sectionFilter: 'rev', allowSectionReorder: false, collapsibleSections: false })).toBe(false);
  });

  it.each([
    ['showValidation', { showValidation: true }],
    ['validationRevision', { validationRevision: 1 }],
    ['validationErrors (new array)', { validationErrors: [] }],
    ['showEmptyFields', { showEmptyFields: true }],
  ])('is true when %s changes', (_name, patch) => {
    expect(SectionRelevantFormContextChanged(base, { ...base, ...patch })).toBe(true);
  });

  it('treats appearing or disappearing context as a change', () => {
    expect(SectionRelevantFormContextChanged(undefined, base)).toBe(true);
    expect(SectionRelevantFormContextChanged(base, undefined)).toBe(true);
    expect(SectionRelevantFormContextChanged(undefined, undefined)).toBe(false);
  });
});
