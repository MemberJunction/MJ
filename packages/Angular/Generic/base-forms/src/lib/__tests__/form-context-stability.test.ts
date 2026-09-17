import { describe, it, expect } from 'vitest';
import { FormContextsEqualForTest, SameKeysForTest } from '../base-form-component-internals';

/**
 * `formContext` is bound in dozens of places per form and Angular re-evaluates every binding
 * on each change-detection pass. Returning a new object per access handed each child a new
 * reference every pass, which defeats input-identity checks and cascades re-renders through
 * the form — the lag this comparison exists to prevent.
 */
describe('FormContext identity comparison', () => {
    const base = {
        sectionFilter: '', showEmptyFields: false, showValidation: false,
        validationErrors: undefined, collapsibleSections: true, enableRecordLinks: true,
        showRelatedEntities: true, hiddenSectionKeys: ['details'], visibleSectionKeys: undefined,
        allowSectionReorder: true,
    };

    it('treats two structurally identical contexts as equal', () => {
        expect(FormContextsEqualForTest(base, { ...base, hiddenSectionKeys: ['details'] })).toBe(true);
    });

    it('detects a changed scalar', () => {
        expect(FormContextsEqualForTest(base, { ...base, showEmptyFields: true })).toBe(false);
    });

    it('detects changed hidden keys, including order and length', () => {
        expect(FormContextsEqualForTest(base, { ...base, hiddenSectionKeys: ['other'] })).toBe(false);
        expect(FormContextsEqualForTest(base, { ...base, hiddenSectionKeys: ['details', 'more'] })).toBe(false);
        expect(FormContextsEqualForTest(base, { ...base, hiddenSectionKeys: [] })).toBe(false);
    });

    it('compares key arrays by content, not reference', () => {
        expect(SameKeysForTest(['a', 'b'], ['a', 'b'])).toBe(true);
        expect(SameKeysForTest(['a', 'b'], ['b', 'a'])).toBe(false);
        expect(SameKeysForTest(undefined, undefined)).toBe(true);
        expect(SameKeysForTest(undefined, [])).toBe(false);
    });
});
