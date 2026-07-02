import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RunActionParams } from '@memberjunction/actions-base';

vi.mock('@memberjunction/global', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/global');
    return {
        ...actual,
        RegisterClass: () => (target: unknown) => target,
    };
});

// Mock the curated-schema builder so we can assert call shape without
// also exercising EntityInfo machinery (covered by its own test file).
// Both this spy and the global-provider stub are hoisted via vi.hoisted
// because vi.mock factories run before module top-level code.
const { buildCuratedFormSchemaSpy, stubProvider } = vi.hoisted(() => ({
    buildCuratedFormSchemaSpy: vi.fn(),
    stubProvider: { EntityByName: vi.fn() },
}));

vi.mock('@memberjunction/interactive-component-types/forms', () => ({
    buildCuratedFormSchema: (...args: unknown[]) => buildCuratedFormSchemaSpy(...args),
}));

vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/core');
    return {
        ...actual,
        Metadata: { Provider: stubProvider },
        LogError: vi.fn(),
    };
});

import { GetEntitySchemaForFormAction } from '../custom/interactive-forms/get-entity-schema-for-form.action';

function mkParams(entityName: string | null, provider?: unknown): RunActionParams {
    return {
        Params: entityName === null ? [] : [{ Name: 'EntityName', Type: 'Input', Value: entityName }],
        Provider: provider,
    } as unknown as RunActionParams;
}

describe('GetEntitySchemaForFormAction', () => {
    beforeEach(() => {
        buildCuratedFormSchemaSpy.mockReset();
        stubProvider.EntityByName.mockReset();
    });

    it('fails fast when EntityName is missing', async () => {
        const action = new GetEntitySchemaForFormAction();
        const result = await (action as unknown as { InternalRunAction: (p: RunActionParams) => Promise<unknown> })
            .InternalRunAction(mkParams(null));
        expect(result).toMatchObject({ Success: false, ResultCode: 'MISSING_PARAMETER' });
        expect(buildCuratedFormSchemaSpy).not.toHaveBeenCalled();
    });

    it('treats blank EntityName as missing', async () => {
        const action = new GetEntitySchemaForFormAction();
        const result = await (action as unknown as { InternalRunAction: (p: RunActionParams) => Promise<unknown> })
            .InternalRunAction(mkParams('   '));
        expect(result).toMatchObject({ Success: false, ResultCode: 'MISSING_PARAMETER' });
    });

    it('returns ENTITY_NOT_FOUND when curator yields null', async () => {
        buildCuratedFormSchemaSpy.mockReturnValue(null);
        const action = new GetEntitySchemaForFormAction();
        const result = await (action as unknown as { InternalRunAction: (p: RunActionParams) => Promise<unknown> })
            .InternalRunAction(mkParams('NoSuchEntity', stubProvider));
        expect(result).toMatchObject({ Success: false, ResultCode: 'ENTITY_NOT_FOUND' });
    });

    it('returns the schema and stamps a Schema output param on success', async () => {
        const fakeSchema = {
            entityName: 'Customers',
            displayName: 'Customer',
            nameField: 'Name',
            fields: [{ name: 'ID', type: 'string', required: false, isPrimaryKey: true, sequence: 0 }],
        };
        buildCuratedFormSchemaSpy.mockReturnValue(fakeSchema);

        const params = mkParams('Customers', stubProvider);
        const action = new GetEntitySchemaForFormAction();
        const result = await (action as unknown as { InternalRunAction: (p: RunActionParams) => Promise<unknown> })
            .InternalRunAction(params);

        expect(result).toMatchObject({ Success: true, ResultCode: 'SUCCESS' });
        const schemaParam = params.Params.find(p => p.Name === 'Schema');
        expect(schemaParam).toBeDefined();
        expect(schemaParam!.Value).toBe(fakeSchema);
        // Message is the JSON-stringified schema for action callers that read it.
        expect(JSON.parse((result as { Message: string }).Message)).toEqual(fakeSchema);
    });

    it('uses params.Provider over the global default when both present', async () => {
        const customProvider = { EntityByName: vi.fn() };
        buildCuratedFormSchemaSpy.mockReturnValue({ entityName: 'X', displayName: 'X', fields: [] });
        const action = new GetEntitySchemaForFormAction();
        await (action as unknown as { InternalRunAction: (p: RunActionParams) => Promise<unknown> })
            .InternalRunAction(mkParams('X', customProvider));
        expect(buildCuratedFormSchemaSpy).toHaveBeenCalledWith('X', customProvider);
    });

    it('falls back to Metadata.Provider when params.Provider is absent', async () => {
        buildCuratedFormSchemaSpy.mockReturnValue({ entityName: 'X', displayName: 'X', fields: [] });
        const action = new GetEntitySchemaForFormAction();
        const params = mkParams('X', undefined);
        await (action as unknown as { InternalRunAction: (p: RunActionParams) => Promise<unknown> })
            .InternalRunAction(params);
        expect(buildCuratedFormSchemaSpy).toHaveBeenCalledWith('X', stubProvider);
    });

    it('returns UNEXPECTED_ERROR when the curator throws', async () => {
        buildCuratedFormSchemaSpy.mockImplementation(() => { throw new Error('boom'); });
        const action = new GetEntitySchemaForFormAction();
        const result = await (action as unknown as { InternalRunAction: (p: RunActionParams) => Promise<unknown> })
            .InternalRunAction(mkParams('X', stubProvider));
        expect(result).toMatchObject({ Success: false, ResultCode: 'UNEXPECTED_ERROR', Message: 'boom' });
    });
});
