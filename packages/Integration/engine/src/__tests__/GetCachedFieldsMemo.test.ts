/**
 * Contract tests for the {@link BaseRESTIntegrationConnector.GetCachedFields} memo.
 *
 * GetCachedFields filters to Active and sorts by Sequence on top of the engine's field lookup, and
 * it sits on per-record paths (RawToExternalRecord / TransformRecord resolve an object's fields for
 * every record transformed; several callers then `.find()` the primary key over the sorted result).
 * Unmemoised, that filter+sort ran per record over a list that only changes when the engine
 * reloads its metadata.
 *
 * The memo is keyed on the ARRAY IDENTITY of `IntegrationEngineBase.Instance.IntegrationObjectFields`,
 * which the engine replaces wholesale on load/refresh.
 *
 * The empty-result rule is a CORRECTNESS precondition, not an optimisation — see the test below.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IntegrationEngineBase } from '@memberjunction/integration-engine-base';
import { BaseRESTIntegrationConnector } from '../BaseRESTIntegrationConnector';

const OBJ = 'obj-1';

function field(name: string, sequence: number, status: 'Active' | 'Disabled' = 'Active') {
    return { IntegrationObjectID: OBJ, Name: name, Sequence: sequence, Status: status };
}

/** Exposes the protected member under test. */
class TestConnector extends BaseRESTIntegrationConnector {
    public fields(objectID: string) {
        return this.GetCachedFields(objectID);
    }
}

/** Installs a fake engine whose field array is a distinct object per call — the invalidation key. */
function installEngine(fields: unknown[]) {
    const arr = [...fields];
    const getFields = vi.fn((id: string) => (id === OBJ ? [...arr] : []));
    vi.spyOn(IntegrationEngineBase, 'Instance', 'get').mockReturnValue({
        IntegrationObjectFields: arr,
        GetIntegrationObjectFields: getFields,
    } as unknown as IntegrationEngineBase);
    return getFields;
}

describe('GetCachedFields memo', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('returns active fields sorted by Sequence', () => {
        installEngine([field('b', 2), field('a', 1), field('gone', 0, 'Disabled')]);
        const c = new TestConnector();
        expect(c.fields(OBJ).map(f => f.Name)).toEqual(['a', 'b']);
    });

    it('does not recompute for repeat calls on the same metadata', () => {
        const getFields = installEngine([field('a', 1), field('b', 2)]);
        const c = new TestConnector();
        for (let i = 0; i < 25; i++) c.fields(OBJ);
        expect(getFields).toHaveBeenCalledTimes(1);
    });

    it('returns a fresh array per call, so a caller may sort or splice it', () => {
        installEngine([field('a', 1), field('b', 2)]);
        const c = new TestConnector();
        const first = c.fields(OBJ);
        expect(c.fields(OBJ)).not.toBe(first);
        first.length = 0;
        expect(c.fields(OBJ).map(f => f.Name)).toEqual(['a', 'b']);
    });

    it('recomputes after the engine replaces its field cache (schema refresh)', () => {
        installEngine([field('a', 1)]);
        const c = new TestConnector();
        expect(c.fields(OBJ).map(f => f.Name)).toEqual(['a']);
        // A refresh swaps the array wholesale — a stale memo would still answer ['a'].
        installEngine([field('a', 1), field('c', 3)]);
        expect(c.fields(OBJ).map(f => f.Name)).toEqual(['a', 'c']);
    });

    it('NEVER memoises an empty result — an empty list means "metadata not loaded yet"', () => {
        // This is the correctness precondition. Because invalidation keys on array identity, a
        // single call landing before the engine seeds its cache would otherwise pin `[]` for the
        // life of that array. Callers derive primary-key field names from this list, so an empty
        // answer builds every record with NO key: rows land fully populated with NULL key columns,
        // can never be matched again, and are re-inserted on every subsequent sync.
        const arr: unknown[] = [];
        const getFields = vi.fn((id: string) => (id === OBJ ? [...(arr as never[])] : []));
        vi.spyOn(IntegrationEngineBase, 'Instance', 'get').mockReturnValue({
            // Same array reference throughout — metadata arrives by MUTATION here, which is the
            // hostile case for identity-based invalidation.
            IntegrationObjectFields: arr,
            GetIntegrationObjectFields: getFields,
        } as unknown as IntegrationEngineBase);

        const c = new TestConnector();
        expect(c.fields(OBJ)).toEqual([]);

        arr.push(field('Id', 1));
        expect(c.fields(OBJ).map(f => f.Name)).toEqual(['Id']);
    });
});
