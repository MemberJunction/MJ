import type { FormContext } from './types/form-types';

/**
 * Field-wise comparison for {@link FormContext}. Scalars by identity; the key arrays by
 * shallow content, so a freshly built array with the same keys does not read as a change.
 */
export function FormContextsEqual(a: FormContext, b: FormContext): boolean {
  return a.sectionFilter === b.sectionFilter
    && a.showEmptyFields === b.showEmptyFields
    && a.showValidation === b.showValidation
    && a.validationErrors === b.validationErrors
    && a.collapsibleSections === b.collapsibleSections
    && a.enableRecordLinks === b.enableRecordLinks
    && a.showRelatedEntities === b.showRelatedEntities
    && a.allowSectionReorder === b.allowSectionReorder
    && SameKeys(a.hiddenSectionKeys, b.hiddenSectionKeys)
    && SameKeys(a.visibleSectionKeys, b.visibleSectionKeys);
}

export function SameKeys(a: readonly string[] | undefined, b: readonly string[] | undefined): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** Test seams — the helpers above are internal, but their behavior is load-bearing. */
export const FormContextsEqualForTest = FormContextsEqual;
export const SameKeysForTest = SameKeys;
