import { describe, it, expect, vi } from 'vitest';
import { ENTITY_COMPANY_INTEGRATION_OBJECT_FIELDS } from '@memberjunction/integration-engine-base';
import { CompanyIntegrationCatalogReadFailed, PerConnectionCatalogWriter, SharedCatalogWriter } from '../CatalogWriter.js';

/**
 * The reads the classifier depends on. Two properties:
 *
 *  - a FAILED read is an error that names the entity, the filter and the provider's message —
 *    never an empty list, which every consumer reads as "no fields" and which turned a permission
 *    or SQL problem into "every object is keyless, run green";
 *  - KeyedObjectIDs() answers "which of these objects already carry a key" from a two-column
 *    simple scan, chunked, so the classify stage no longer loads every field as an entity object
 *    to ask it (97k of them on a large catalog, right after the run's largest write).
 */
type Answer = { Success: boolean; Results?: unknown[]; ErrorMessage?: string };
const answers: Record<string, Answer> = {};
const calls: Array<{ EntityName: string; ExtraFilter?: string; ResultType?: string; Fields?: string[] }> = [];

vi.mock('@memberjunction/core', async (orig) => {
    const actual = await orig<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: () => {},
        RunView: class {
            async RunView(p: { EntityName: string; ExtraFilter?: string; ResultType?: string; Fields?: string[] }) {
                calls.push(p);
                return answers[p.EntityName] ?? { Success: true, Results: [] };
            }
        },
    };
});

const FIELDS = ENTITY_COMPANY_INTEGRATION_OBJECT_FIELDS;
const perConnection = () => new PerConnectionCatalogWriter({} as never, 'ci-1', 'int-1', {} as never, new Date(0));
const shared = () => new SharedCatalogWriter({} as never, 'int-1', {} as never);
const reset = () => { for (const k of Object.keys(answers)) delete answers[k]; calls.length = 0; };

describe('a failed catalog read is an error, never an empty catalog', () => {
    it('FieldsForObject throws with the entity, the filter and the provider message', async () => {
        reset();
        answers[FIELDS] = { Success: false, ErrorMessage: 'permission denied for relation' };
        await expect(perConnection().FieldsForObject('obj-1')).rejects.toBeInstanceOf(CompanyIntegrationCatalogReadFailed);
        await expect(perConnection().FieldsForObject('obj-1')).rejects.toThrow(/permission denied for relation/);
        await expect(perConnection().FieldsForObject('obj-1')).rejects.toThrow(/CompanyIntegrationObjectID = 'obj-1'/);
    });

    it('a read with no result at all is the same error', async () => {
        reset();
        answers[FIELDS] = undefined as unknown as Answer;
        answers[FIELDS] = { Success: false };
        await expect(perConnection().FieldsForObject('obj-1')).rejects.toThrow(/RunView returned no result/);
    });

    it('an EMPTY successful read is still an empty list — absence of rows is not failure', async () => {
        reset();
        answers[FIELDS] = { Success: true, Results: [] };
        expect(await perConnection().FieldsForObject('obj-1')).toEqual([]);
    });
});

describe('KeyedObjectIDs — which objects already carry a key, from one scan', () => {
    it('answers from a two-column SIMPLE scan, owner ids lowercased, any truthy spelling of the flag', async () => {
        reset();
        answers[FIELDS] = { Success: true, Results: [
            { CompanyIntegrationObjectID: 'A1', IsPrimaryKey: true },
            { CompanyIntegrationObjectID: 'B2', IsPrimaryKey: 1 },
            { CompanyIntegrationObjectID: 'C3', IsPrimaryKey: '1' },
            { CompanyIntegrationObjectID: 'D4', IsPrimaryKey: 'true' },
            { CompanyIntegrationObjectID: 'E5', IsPrimaryKey: false },
            { CompanyIntegrationObjectID: 'F6', IsPrimaryKey: 0 },
            { CompanyIntegrationObjectID: 'G7', IsPrimaryKey: null },
        ] };
        const keyed = await perConnection().KeyedObjectIDs(['A1', 'B2', 'C3', 'D4', 'E5', 'F6', 'G7']);
        expect([...keyed].sort()).toEqual(['a1', 'b2', 'c3', 'd4']);
        expect(calls).toHaveLength(1);
        expect(calls[0].EntityName).toBe(FIELDS);
        expect(calls[0].ResultType).toBe('simple');
        expect(calls[0].Fields).toEqual(['CompanyIntegrationObjectID', 'IsPrimaryKey']);
        expect(calls[0].ExtraFilter).toBe("CompanyIntegrationObjectID IN ('A1','B2','C3','D4','E5','F6','G7')");
    });

    it('the shared writer scans the declared catalog by its own owner column', async () => {
        reset();
        answers['MJ: Integration Object Fields'] = { Success: true, Results: [{ IntegrationObjectID: 'X', IsPrimaryKey: true }] };
        const keyed = await shared().KeyedObjectIDs(['X', 'Y']);
        expect([...keyed]).toEqual(['x']);
        expect(calls[0].Fields).toEqual(['IntegrationObjectID', 'IsPrimaryKey']);
        expect(calls[0].ExtraFilter).toBe("IntegrationObjectID IN ('X','Y')");
    });

    it('chunks the IN list so a large catalog is a few statements, not one enormous one', async () => {
        reset();
        answers[FIELDS] = { Success: true, Results: [] };
        const ids = Array.from({ length: 401 }, (_, i) => `id-${i}`);
        await perConnection().KeyedObjectIDs(ids);
        expect(calls).toHaveLength(3);
        for (const c of calls) expect((c.ExtraFilter ?? '').split(',').length).toBeLessThanOrEqual(200);
    });

    it('asks nothing for an empty list', async () => {
        reset();
        expect((await perConnection().KeyedObjectIDs([])).size).toBe(0);
        expect(calls).toHaveLength(0);
    });

    it('a failed scan throws rather than returning "nothing is keyed"', async () => {
        reset();
        answers[FIELDS] = { Success: false, ErrorMessage: 'timeout' };
        await expect(perConnection().KeyedObjectIDs(['A1'])).rejects.toBeInstanceOf(CompanyIntegrationCatalogReadFailed);
    });

    it("escapes a quote in an id rather than breaking the statement", async () => {
        reset();
        answers[FIELDS] = { Success: true, Results: [] };
        await perConnection().KeyedObjectIDs(["o'brien"]);
        expect(calls[0].ExtraFilter).toBe("CompanyIntegrationObjectID IN ('o''brien')");
    });
});
