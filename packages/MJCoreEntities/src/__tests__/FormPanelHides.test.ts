import { describe, it, expect } from 'vitest';
import { FormPanelHideSettingKey, ParseHiddenFormPanelKeys } from '../custom/FormScope/FormPanelHides';

/**
 * The browser stores a user's hidden panels under this key and the server reads the same key to
 * report the form the user sees, so the key and the parser are shared.
 */
describe('FormPanelHideSettingKey', () => {
    it('is one setting per entity, lowercased so case variants share it', () => {
        expect(FormPanelHideSettingKey('MoreCheese: Courses')).toBe('mj.formPanels.hidden.morecheese: courses');
    });

    it('trims the entity name', () => {
        expect(FormPanelHideSettingKey('  MJ: Users ')).toBe('mj.formPanels.hidden.mj: users');
    });
});

describe('ParseHiddenFormPanelKeys', () => {
    it('reads a stored list', () => {
        expect(ParseHiddenFormPanelKeys('["panel:A","class:b"]')).toEqual(['panel:A', 'class:b']);
    });

    it('reads nothing from a missing, malformed or non-list value, rather than throwing', () => {
        expect(ParseHiddenFormPanelKeys(undefined)).toEqual([]);
        expect(ParseHiddenFormPanelKeys('not json')).toEqual([]);
        expect(ParseHiddenFormPanelKeys('{"a":1}')).toEqual([]);
    });

    it('drops blank and repeated keys', () => {
        expect(ParseHiddenFormPanelKeys('["a","", "a", 3, " b "]')).toEqual(['a', 'b']);
    });
});
