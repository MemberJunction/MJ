import { describe, it, expect } from 'vitest';
import { IsTypedJsonCompanion } from '../lib/EntityPropertyExtractor.js';

/**
 * CodeGen emits a typed accessor beside every JSON-typed column: a `Configuration`
 * nvarchar column gets a `ConfigurationObject` getter returning the parsed shape.
 * The accessor is derived — there is no such column and no such EntityField.
 *
 * Pull discovers virtual properties by walking the prototype chain, so it was
 * writing both into the metadata file. That is not merely redundant:
 *
 *  - it duplicates the entire column, doubling the file;
 *  - it DEFEATS field externalization — `Configuration.ReplayScript` correctly
 *    became `@file:regression/scripts/x.json` while `ConfigurationObject`
 *    carried the same script inline, so the content stayed in the metadata;
 *  - the inline copy is what leaked recorded credentials into the repo.
 *
 * The companion is identified structurally — `<Field>Object` where `<Field>` is a
 * real field on the entity — rather than by a hardcoded name, so it holds for
 * every entity CodeGen touches.
 */
describe('isTypedJsonCompanion', () => {
    const fields = ['ID', 'Name', 'Configuration', 'ExpectedOutcomes'];

    it('identifies the typed companion of a real JSON field', () => {
        expect(IsTypedJsonCompanion('ConfigurationObject', fields)).toBe(true);
    });

    it('leaves a real field alone', () => {
        expect(IsTypedJsonCompanion('Configuration', fields)).toBe(false);
    });

    it('leaves an unrelated virtual property alone', () => {
        // A genuine computed property pull SHOULD keep.
        expect(IsTypedJsonCompanion('DisplayName', fields)).toBe(false);
    });

    it('does not strip a property merely because it ends in Object', () => {
        // No `Business` field exists, so `BusinessObject` is not a companion.
        expect(IsTypedJsonCompanion('BusinessObject', fields)).toBe(false);
    });

    it('matches case-insensitively, as entity field names are compared elsewhere', () => {
        expect(IsTypedJsonCompanion('configurationObject', fields)).toBe(true);
    });
});
