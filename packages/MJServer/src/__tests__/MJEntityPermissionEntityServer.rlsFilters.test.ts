/**
 * An entity-permission row must not keep a row-level security filter for a verb it does not
 * grant. Saving the row clears the filter of every verb whose `Can<Op>` flag is false and keeps
 * the filter of every verb it grants.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config.js', () => ({
    ___codeGenAPIPort: 0,
    ___codeGenAPISubmissionDelay: 0,
    ___codeGenAPIURL: 'http://localhost',
}));
vi.mock('@memberjunction/core-entities-server', () => ({ ReconcileFieldPermissionsQuietly: vi.fn() }));
vi.mock('@memberjunction/network-utils', () => ({ HttpPost: vi.fn() }));

import { BaseEntity } from '@memberjunction/core';
import { MJEntityPermissionEntityServer } from '../entitySubclasses/MJEntityPermissionEntityServer.server.js';

type Verb = 'Read' | 'Create' | 'Update' | 'Delete';
const VERBS: Verb[] = ['Read', 'Create', 'Update', 'Delete'];

type PermissionState = {
    CanRead: boolean; CanCreate: boolean; CanUpdate: boolean; CanDelete: boolean;
    ReadRLSFilterID: string | null; CreateRLSFilterID: string | null;
    UpdateRLSFilterID: string | null; DeleteRLSFilterID: string | null;
};

/** A saved, clean permission row whose fields are plain values, with the base save stubbed. */
function permissionRow(state: PermissionState): MJEntityPermissionEntityServer {
    const row = Object.create(MJEntityPermissionEntityServer.prototype) as MJEntityPermissionEntityServer;
    for (const [key, value] of Object.entries(state)) {
        Object.defineProperty(row, key, { value, writable: true, configurable: true });
    }
    Object.defineProperty(row, 'EntityID', { value: 'E1', configurable: true });
    Object.defineProperty(row, 'Dirty', { value: false, configurable: true });
    Object.defineProperty(row, 'IsSaved', { value: true, configurable: true });
    row.GetFieldByName = vi.fn().mockReturnValue({ Dirty: false }) as unknown as MJEntityPermissionEntityServer['GetFieldByName'];
    return row;
}

function stateWith(granted: Verb[]): PermissionState {
    const can = (v: Verb) => granted.includes(v);
    return {
        CanRead: can('Read'), CanCreate: can('Create'), CanUpdate: can('Update'), CanDelete: can('Delete'),
        ReadRLSFilterID: 'F-READ', CreateRLSFilterID: 'F-CREATE', UpdateRLSFilterID: 'F-UPDATE', DeleteRLSFilterID: 'F-DELETE',
    };
}

const filterOf = (row: MJEntityPermissionEntityServer, verb: Verb): string | null =>
    ({ Read: row.ReadRLSFilterID, Create: row.CreateRLSFilterID, Update: row.UpdateRLSFilterID, Delete: row.DeleteRLSFilterID })[verb];

beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(BaseEntity.prototype, 'Save').mockResolvedValue(true);
});

describe('MJEntityPermissionEntityServer.Save — RLS filters follow their verb flags', () => {
    for (const verb of VERBS) {
        it(`clears the ${verb} filter when Can${verb} is false and keeps the others`, async () => {
            const row = permissionRow(stateWith(VERBS.filter(v => v !== verb)));
            expect(await row.Save()).toBe(true);
            expect(filterOf(row, verb)).toBeNull();
            for (const other of VERBS.filter(v => v !== verb)) {
                expect(filterOf(row, other)).toBe(`F-${other.toUpperCase()}`);
            }
        });

        it(`keeps the ${verb} filter when Can${verb} is true`, async () => {
            const row = permissionRow(stateWith([verb]));
            await row.Save();
            expect(filterOf(row, verb)).toBe(`F-${verb.toUpperCase()}`);
        });
    }

    it('clears the filters before the base save writes the row', async () => {
        const seen: Array<string | null> = [];
        vi.spyOn(BaseEntity.prototype, 'Save').mockImplementation(async function (this: MJEntityPermissionEntityServer) {
            seen.push(this.CreateRLSFilterID);
            return true;
        });
        const row = permissionRow(stateWith(['Read']));
        await row.Save();
        expect(seen).toEqual([null]);
    });
});
