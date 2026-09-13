import { describe, it, expect, vi, beforeEach } from 'vitest';

// Script the identity lookup's rows and capture what it asked for; everything else in core is real
// (CompositeKey in particular — the record-id shape under test is its ToCompactURLSegment).
const runViewMock = vi.fn();
vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: class MockRunView {
            RunView = runViewMock;
        },
    };
});

import { resolveIdentityByEmail } from '../realtimeWidget/visitorIdentity.js';
import type { EntityInfo, IMetadataProvider, UserInfo } from '@memberjunction/core';

type LookupParams = { EntityName: string; ExtraFilter: string; Fields: string[] };

function makeProvider(entityInfo: { ID: string; PrimaryKeys: Array<{ Name: string }> } | undefined): IMetadataProvider {
    return { EntityByName: () => entityInfo as unknown as EntityInfo } as unknown as IMetadataProvider;
}
const user = { ID: 'u1' } as unknown as UserInfo;
function lastParams(): LookupParams {
    return runViewMock.mock.calls[runViewMock.mock.calls.length - 1][0] as LookupParams;
}

describe('resolveIdentityByEmail — the configured identity entity can have ANY primary key', () => {
    beforeEach(() => runViewMock.mockReset());

    it('selects the real key column and returns its bare value for a single non-ID key', async () => {
        runViewMock.mockResolvedValue({ Success: true, Results: [{ individual_id: 4711 }] });
        const provider = makeProvider({ ID: 'ent-persons', PrimaryKeys: [{ Name: 'individual_id' }] });
        const out = await resolveIdentityByEmail('ada@example.com', user, provider, { entityName: 'Persons', emailField: 'EmailAddress' });
        expect(lastParams().Fields).toEqual(['individual_id']);
        expect(lastParams().ExtraFilter).toBe("EmailAddress = 'ada@example.com'");
        expect(out).toEqual({ entityId: 'ent-persons', recordId: '4711' });
    });

    it('selects EVERY key column and carries a composite key as a full segment, not its first column', async () => {
        runViewMock.mockResolvedValue({ Success: true, Results: [{ OrderID: '11055', LineNo: 3 }] });
        const provider = makeProvider({ ID: 'ent-lines', PrimaryKeys: [{ Name: 'OrderID' }, { Name: 'LineNo' }] });
        const out = await resolveIdentityByEmail('x@y.com', user, provider, { entityName: 'Order Lines' });
        expect(lastParams().Fields).toEqual(['OrderID', 'LineNo']);
        expect(out).toEqual({ entityId: 'ent-lines', recordId: 'OrderID|11055||LineNo|3' });
    });

    it('stays anonymous when no row matches or a key column is null', async () => {
        const provider = makeProvider({ ID: 'ent-users', PrimaryKeys: [{ Name: 'ID' }] });
        runViewMock.mockResolvedValue({ Success: true, Results: [] });
        expect(await resolveIdentityByEmail('none@y.com', user, provider)).toBeUndefined();
        runViewMock.mockResolvedValue({ Success: true, Results: [{ ID: null }] });
        expect(await resolveIdentityByEmail('null@y.com', user, provider)).toBeUndefined();
    });

    it('stays anonymous when the configured entity is not in metadata', async () => {
        expect(await resolveIdentityByEmail('a@b.com', user, makeProvider(undefined), { entityName: 'Nope' })).toBeUndefined();
        expect(runViewMock).not.toHaveBeenCalled();
    });
});
