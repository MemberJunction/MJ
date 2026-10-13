/**
 * Contract tests for the objectID → fields index behind
 * {@link IntegrationEngineBase.GetIntegrationObjectFields}.
 *
 * The method used to be an unindexed `filter` over EVERY IntegrationObjectField in the process,
 * invoking the generated `IntegrationObjectID` getter once per element. It is called on per-record
 * paths (a connector's RawToExternalRecord/TransformRecord resolve an object's fields for every
 * record transformed), so on a 364-object catalog it measured ~46% of process CPU in a live
 * profile.
 *
 * The index is invalidated by the ARRAY IDENTITY of the field cache, which the load machinery and
 * SeedForTesting both replace wholesale. These tests pin the observable contract that keeps that
 * safe: same results, fresh array per call, and a rebuild whenever the source array is swapped.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { IntegrationEngineBase } from '../IntegrationEngineBase';

const OBJ_A = 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890';
const OBJ_B = '11111111-2222-3333-4444-555555555555';

function field(objectID: string | null, name: string, extra: Record<string, unknown> = {}) {
    return { IntegrationObjectID: objectID, Name: name, Status: 'Active', Sequence: 0, ...extra };
}

describe('GetIntegrationObjectFields index', () => {
    let engine: IntegrationEngineBase;

    beforeEach(() => {
        engine = IntegrationEngineBase.Instance;
        engine.SeedForTesting({
            IntegrationObjectFields: [
                field(OBJ_A, 'Id'),
                field(OBJ_A, 'Name'),
                field(OBJ_B, 'OtherId'),
            ] as never,
        });
    });

    it('returns only the requested object’s fields', () => {
        expect(engine.GetIntegrationObjectFields(OBJ_A).map(f => f.Name)).toEqual(['Id', 'Name']);
        expect(engine.GetIntegrationObjectFields(OBJ_B).map(f => f.Name)).toEqual(['OtherId']);
    });

    it('matches case-insensitively, as UUIDsEqual did', () => {
        // SQL Server hands back uppercase UUIDs, PostgreSQL lowercase — both must hit the same
        // bucket, which is why the index key is normalised rather than used verbatim.
        expect(engine.GetIntegrationObjectFields(OBJ_A.toLowerCase()).map(f => f.Name)).toEqual([
            'Id',
            'Name',
        ]);
        expect(engine.GetIntegrationObjectFields(` ${OBJ_A} `).map(f => f.Name)).toEqual(['Id', 'Name']);
    });

    it('returns an empty array for an unknown object', () => {
        expect(engine.GetIntegrationObjectFields('99999999-9999-9999-9999-999999999999')).toEqual([]);
    });

    it('returns a FRESH array each call — callers may sort or splice the result', () => {
        const first = engine.GetIntegrationObjectFields(OBJ_A);
        const second = engine.GetIntegrationObjectFields(OBJ_A);
        expect(first).not.toBe(second);
        first.sort((a, b) => a.Name.localeCompare(b.Name));
        first.length = 0;
        // Mutating a returned array must not corrupt the index for the next caller.
        expect(engine.GetIntegrationObjectFields(OBJ_A).map(f => f.Name)).toEqual(['Id', 'Name']);
    });

    it('rebuilds when the source array is replaced (reload / reseed)', () => {
        expect(engine.GetIntegrationObjectFields(OBJ_A)).toHaveLength(2);
        engine.SeedForTesting({
            IntegrationObjectFields: [field(OBJ_A, 'OnlyFieldNow')] as never,
        });
        // A stale index here would still report the two original fields.
        expect(engine.GetIntegrationObjectFields(OBJ_A).map(f => f.Name)).toEqual(['OnlyFieldNow']);
    });

    it('ignores rows with no IntegrationObjectID without dropping the rest', () => {
        engine.SeedForTesting({
            IntegrationObjectFields: [field(null, 'Orphan'), field(OBJ_A, 'Id')] as never,
        });
        expect(engine.GetIntegrationObjectFields(OBJ_A).map(f => f.Name)).toEqual(['Id']);
    });
});
