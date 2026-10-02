/**
 * EntityInfo.SubtypeSelectorConfig — parsing the `SubtypeSelector` JSON.
 *
 * `Path` names the rule; the optional `UseForLoadedRecords` opts the rule in to being asked when a
 * record is LOADED, not only when one is created. Loads of an entity whose selector doesn't opt in
 * run as they did before the flag existed, which is what keeps the load-time behavior of existing
 * selectors (bizapps-orders declares them on Products and Order Lines) unchanged.
 */
import { describe, expect, it, vi } from 'vitest';
import { EntityInfo } from '../generic/entityInfo';

function withSelector(selector: string | null): EntityInfo {
    return new EntityInfo({
        Name: 'Products',
        BaseTable: 'Product',
        BaseView: 'vwProducts',
        SchemaName: 'dbo',
        SubtypeSelector: selector,
    });
}

function spyOnErrors(): ReturnType<typeof vi.spyOn> {
    return vi.spyOn(console, 'error').mockImplementation(() => undefined);
}

describe('EntityInfo.SubtypeSelectorConfig', () => {
    it('leaves load hints off when UseForLoadedRecords is absent', () => {
        const config = withSelector(JSON.stringify({ Path: ' ProductTypeID.ProductExtensionEntity ' })).SubtypeSelectorConfig;

        expect(config).toEqual({ Path: 'ProductTypeID.ProductExtensionEntity', UseForLoadedRecords: false });
    });

    it('turns load hints on for UseForLoadedRecords: true', () => {
        const config = withSelector(JSON.stringify({ Path: 'ProductTypeID.ProductExtensionEntity', UseForLoadedRecords: true })).SubtypeSelectorConfig;

        expect(config?.UseForLoadedRecords).toBe(true);
    });

    it('leaves load hints off for UseForLoadedRecords: false, without logging', () => {
        const errors = spyOnErrors();

        const config = withSelector(JSON.stringify({ Path: 'ProductTypeID.ProductExtensionEntity', UseForLoadedRecords: false })).SubtypeSelectorConfig;

        expect(config?.UseForLoadedRecords).toBe(false);
        expect(errors).not.toHaveBeenCalled();
    });

    it('logs a value that is not a boolean, and leaves load hints off rather than guessing', () => {
        const errors = spyOnErrors();

        const config = withSelector(JSON.stringify({ Path: 'ProductTypeID.ProductExtensionEntity', UseForLoadedRecords: 'true' })).SubtypeSelectorConfig;

        expect(config?.Path).toBe('ProductTypeID.ProductExtensionEntity');
        expect(config?.UseForLoadedRecords).toBe(false);
        expect(String(errors.mock.calls[0]?.[0])).toMatch(/SubtypeSelector 'UseForLoadedRecords' must be true or false, but is "true"/);
    });

    it('ignores keys it does not know, without logging', () => {
        const errors = spyOnErrors();

        const config = withSelector(JSON.stringify({ Path: 'ProductTypeID.ProductExtensionEntity', SomeLaterOption: 3 })).SubtypeSelectorConfig;

        expect(config).toEqual({ Path: 'ProductTypeID.ProductExtensionEntity', UseForLoadedRecords: false });
        expect(errors).not.toHaveBeenCalled();
    });

    it('still rejects a selector without a Path', () => {
        const errors = spyOnErrors();

        expect(withSelector(JSON.stringify({ UseForLoadedRecords: true })).SubtypeSelectorConfig).toBeNull();
        expect(String(errors.mock.calls[0]?.[0])).toMatch(/must contain a non-empty 'Path'/);
    });

    it('is null when no selector is declared', () => {
        expect(withSelector(null).SubtypeSelectorConfig).toBeNull();
    });
});
