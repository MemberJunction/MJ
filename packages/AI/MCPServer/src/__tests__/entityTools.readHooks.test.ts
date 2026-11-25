/**
 * The MCP entity tools that read one record by key (Get, Update, Delete) run the read hooks of the
 * record's entity: a record the hooks remove for the caller is answered as a record that does not
 * exist, and no value of it is returned or changed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    ClearAllDataHooks,
    EntityInfo,
    PostRunViewHook,
    RegisterDataHook,
    RegisterPostRunViewProtectedEntity,
    RunViewParams,
    RunViewResult,
    UserInfo,
} from '@memberjunction/core';
import type { MCPSessionContext, ToolConfig } from '../Server.js';

const ENTITY_ID = 'B0000000-0000-4000-8000-000000000002';
const ENTITY_NAME = 'Hooked Notes';

const { state } = vi.hoisted(() => ({
    state: { entity: null as EntityInfo | null, records: [] as FakeRecord[] },
}));

/** A record whose load finds the rows in `rows` by ID and nothing else. */
class FakeRecord {
    public SetMany = vi.fn();
    public Save = vi.fn(async () => true);
    public Delete = vi.fn(async () => true);
    public LatestResult = { CompleteMessage: '' };
    private data: Record<string, string | null> | null = null;
    constructor(public EntityInfo: EntityInfo) {}
    async InnerLoad(key: { KeyValuePairs: { Value: unknown }[] }): Promise<boolean> {
        const id = String(key.KeyValuePairs[0]?.Value ?? '');
        const rows: Record<string, Record<string, string>> = { visible: { ID: 'visible', Body: 'open' }, hidden: { ID: 'hidden', Body: 'marker' } };
        this.data = rows[id] ?? null;
        return this.data !== null;
    }
    async GetDataObject(): Promise<Record<string, string | null>> {
        return this.data ?? { ID: null, Body: null };
    }
}

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        Metadata: class {
            get Entities() {
                return state.entity ? [state.entity] : [];
            }
            EntityByID(id: string) {
                return state.entity && state.entity.ID === id ? state.entity : undefined;
            }
            EntityByName(name: string) {
                return state.entity && state.entity.Name === name ? state.entity : undefined;
            }
            async GetEntityObject() {
                const record = new FakeRecord(state.entity as EntityInfo);
                state.records.push(record);
                return record;
            }
        },
    };
});

vi.mock('@memberjunction/server', () => ({}));

import { AddEntityDeleteTool, AddEntityGetTool, AddEntityUpdateTool } from '../tools/entityTools.js';

function notesEntity(): EntityInfo {
    return new EntityInfo({
        ID: ENTITY_ID, Name: ENTITY_NAME, ClassName: 'HookedNotes', SchemaName: 'dbo', BaseTable: 'Note', BaseView: 'vwNotes',
        IncludeInAPI: true, AllowCreateAPI: true, AllowUpdateAPI: true, AllowDeleteAPI: true,
        Fields: [
            { ID: 'n-id', EntityID: ENTITY_ID, Sequence: 1, Name: 'ID', Entity: ENTITY_NAME, Type: 'nvarchar', IsPrimaryKey: true, AllowUpdateAPI: true },
            { ID: 'n-body', EntityID: ENTITY_ID, Sequence: 2, Name: 'Body', Entity: ENTITY_NAME, Type: 'nvarchar', AllowUpdateAPI: true, AllowsNull: true },
        ],
    });
}

/** Removes the row with ID 'hidden' from reads of the hooked entity. */
const hideRow: PostRunViewHook = async (params: RunViewParams, results: RunViewResult): Promise<RunViewResult> => {
    if (params.EntityName !== ENTITY_NAME) {
        return results;
    }
    const kept = (results.Results as Array<{ ID: string }>).filter((r) => r.ID !== 'hidden');
    return { ...results, Results: kept, RowCount: kept.length, TotalRowCount: kept.length };
};

function capture(register: (add: (c: ToolConfig) => void, e: EntityInfo) => void): ToolConfig {
    let captured: ToolConfig | null = null;
    register((c) => { captured = c; }, state.entity as EntityInfo);
    if (!captured) throw new Error('tool was not registered');
    return captured;
}

const caller = new UserInfo(null, { ID: '11111111-1111-4111-8111-111111111111', Name: 'Caller', Email: 'c@example.com', IsActive: true });
const session: MCPSessionContext = { user: caller, authMethod: 'apiKey' };

describe('MCP entity tools on an entity guarded by read hooks', () => {
    beforeEach(() => {
        state.entity = notesEntity();
        state.records = [];
        RegisterDataHook('PostRunView', hideRow);
        RegisterPostRunViewProtectedEntity(ENTITY_NAME);
    });

    afterEach(() => {
        ClearAllDataHooks();
    });

    it('Get answers for a record the read hooks remove exactly as for a record that does not exist', async () => {
        const hidden = await capture(AddEntityGetTool).execute({ ID: 'hidden' }, session);
        const missing = await capture(AddEntityGetTool).execute({ ID: 'missing' }, session);

        expect(hidden).toBe(missing);
        expect(hidden).not.toContain('marker');
    });

    it('Update answers not found and changes nothing for a record the read hooks remove', async () => {
        const out = JSON.parse(await capture(AddEntityUpdateTool).execute({ ID: 'hidden', Body: 'changed' }, session)) as { success: boolean; errorMessage?: string };

        expect(out.success).toBe(false);
        expect(out.errorMessage).toBe('Record not found');
        expect(state.records[0].SetMany).not.toHaveBeenCalled();
        expect(state.records[0].Save).not.toHaveBeenCalled();
    });

    it('Delete answers not found, returns no value and deletes nothing for a record the read hooks remove', async () => {
        const text = await capture(AddEntityDeleteTool).execute({ ID: 'hidden' }, session);
        const out = JSON.parse(text) as { success: boolean; errorMessage?: string };

        expect(out.success).toBe(false);
        expect(out.errorMessage).toBe('Record not found');
        expect(text).not.toContain('marker');
        expect(state.records[0].Delete).not.toHaveBeenCalled();
    });
});
