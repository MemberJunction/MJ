/**
 * Field-level security at the MCP entity tools.
 *
 * Input: a caller who is denied a field cannot send that field, nor a key that names no field at
 * all, and both are refused with the same wording so the refusal does not reveal which columns
 * exist. Output: no tool returns a value its caller is denied, even when the record or the view
 * hands the tool a full-width row.
 *
 * The record and the view are fakes that always return the full row — the shape a system-identity
 * load, a provider bug or a post-save rehydration would produce — so these tests exercise the
 * tools' own projection rather than the entity object's.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    EntityInfo,
    FieldPermissionAccess,
    FieldSecurityClientInputMessage,
    UserInfo,
    UserRoleInfo,
} from '@memberjunction/core';
import type { MCPSessionContext, ToolConfig } from '../Server.js';

const { state } = vi.hoisted(() => ({
    state: {
        entity: null as EntityInfo | null,
        record: null as FakeRecordShape | null,
        runViewParams: [] as Record<string, unknown>[],
    },
}));

/** What the tools touch on a record; the fake below implements exactly this. */
interface FakeRecordShape {
    EntityInfo: EntityInfo;
    SetMany: ReturnType<typeof vi.fn>;
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
            async GetEntityObject() {
                return state.record;
            }
        },
        RunView: class {
            async RunView(params: Record<string, unknown>) {
                state.runViewParams.push(params);
                return { Success: true, Results: [fullRow()], RowCount: 1, TotalRowCount: 1, ErrorMessage: '' };
            }
        },
    };
});

import {
    AddEntityCreateTool,
    AddEntityDeleteTool,
    AddEntityGetTool,
    AddEntityRunViewTool,
    AddEntityUpdateTool,
} from '../tools/entityTools.js';

// ─── Fixture ──────────────────────────────────────────────────────────────

const HR_ROLE_ID = 'A0000000-0000-0000-0000-000000000001';
const INTERN_ROLE_ID = 'A0000000-0000-0000-0000-000000000003';
const ENTITY_ID = 'B0000000-0000-0000-0000-000000000001';
const ROW_ID = '11111111-0000-0000-0000-000000000001';
const ALLOW = FieldPermissionAccess.Allow;

function openTo(fieldId: string, roles: string[]): Record<string, string>[] {
    return roles.map((roleId, i) => ({
        ID: `${fieldId}-open-${i}`, EntityFieldID: fieldId, RoleID: roleId,
        ReadAccess: ALLOW, UpdateAccess: ALLOW, CreateAccess: ALLOW,
    }));
}

/** `Employees`: `Salary` is HR-only; `Name` is open to both roles. */
function employeeEntity(): EntityInfo {
    const field = (id: string, seq: number, name: string, type: string, perms?: Record<string, string>[]) => ({
        ID: id, EntityID: ENTITY_ID, Sequence: seq, Name: name, Entity: 'Employees', Type: type,
        AllowUpdateAPI: true, AllowsNull: true, EntityFieldPermissions: perms,
    });
    return new EntityInfo({
        ID: ENTITY_ID, Name: 'Employees', ClassName: 'Employees', SchemaName: 'dbo', BaseTable: 'Employee',
        BaseView: 'vwEmployees', IncludeInAPI: true, AllowCreateAPI: true, AllowUpdateAPI: true, AllowDeleteAPI: true,
        EnableFieldLevelSecurity: true,
        Fields: [
            { ...field('f-id', 1, 'ID', 'uniqueidentifier'), IsPrimaryKey: true, AllowsNull: false },
            field('f-name', 2, 'Name', 'nvarchar', openTo('f-name', [HR_ROLE_ID, INTERN_ROLE_ID])),
            field('f-salary', 3, 'Salary', 'money', openTo('f-salary', [HR_ROLE_ID])),
        ],
    });
}

function buildUser(roleId: string, id: string): UserInfo {
    return new UserInfo(null, {
        ID: id, Name: `User ${id}`, Email: `${id}@test.com`, IsActive: true,
        UserRoles: [new UserRoleInfo({ UserID: id, RoleID: roleId, Role: `Role-${roleId}` })],
    });
}

function fullRow(): Record<string, string | number> {
    return { ID: ROW_ID, Name: 'Ada', Salary: 250000 };
}

/** A record that, whoever asks, holds and returns the full row. */
class FakeRecord implements FakeRecordShape {
    public SetMany = vi.fn();
    public LatestResult = { CompleteMessage: '' };
    constructor(public EntityInfo: EntityInfo) {}
    async InnerLoad() { return true; }
    async Save() { return true; }
    async Delete() { return true; }
    async GetDataObject() { return fullRow(); }
    async GetDataObjectJSON() { return JSON.stringify(fullRow()); }
}

function captureTool(register: (add: (c: ToolConfig) => void, e: EntityInfo) => void): ToolConfig {
    let captured: ToolConfig | null = null;
    register((c) => { captured = c; }, state.entity!);
    if (!captured) throw new Error('tool was not registered');
    return captured;
}

function session(user: UserInfo): MCPSessionContext {
    return { user, authMethod: 'apiKey' };
}

type ToolResponse = { success: boolean; record?: string; errorMessage?: string };

async function run(register: Parameters<typeof captureTool>[0], props: Record<string, unknown>, user: UserInfo): Promise<string> {
    return captureTool(register).execute(props, session(user));
}

let intern: UserInfo;
let hr: UserInfo;

beforeEach(() => {
    state.entity = employeeEntity();
    state.record = new FakeRecord(state.entity);
    state.runViewParams = [];
    intern = buildUser(INTERN_ROLE_ID, 'intern');
    hr = buildUser(HR_ROLE_ID, 'hr');
});

// ─── Input gate ───────────────────────────────────────────────────────────

describe('MCP entity tools: client input from a restricted caller', () => {
    const writeTools = [
        ['Create', AddEntityCreateTool, {}],
        ['Update', AddEntityUpdateTool, { ID: ROW_ID }],
    ] as const;

    for (const [name, register, keys] of writeTools) {
        it(`${name} refuses a denied key and an unknown key with the same wording, and never applies either`, async () => {
            const denied = JSON.parse(await run(register, { ...keys, Name: 'x', Salary: 1 }, intern)) as ToolResponse;
            const unknown = JSON.parse(await run(register, { ...keys, Name: 'x', Bogus: 1 }, intern)) as ToolResponse;

            expect(denied.success).toBe(false);
            expect(unknown.success).toBe(false);
            expect(denied.errorMessage).toBe(FieldSecurityClientInputMessage('Salary', 'Employees'));
            expect(unknown.errorMessage).toBe(FieldSecurityClientInputMessage('Bogus', 'Employees'));
            expect(denied.errorMessage!.replace('Salary', 'K')).toBe(unknown.errorMessage!.replace('Bogus', 'K'));
            expect(state.record!.SetMany).not.toHaveBeenCalled();
        });
    }

    it('Update accepts the primary key it needs to find the record', async () => {
        const out = JSON.parse(await run(AddEntityUpdateTool, { ID: ROW_ID, Name: 'x' }, intern)) as ToolResponse;
        expect(out.success).toBe(true);
        expect(state.record!.SetMany).toHaveBeenCalledWith({ Name: 'x' }, true);
    });

    it('a caller who is denied nothing may still send every field', async () => {
        const out = JSON.parse(await run(AddEntityCreateTool, { Name: 'x', Salary: 1 }, hr)) as ToolResponse;
        expect(out.success).toBe(true);
        expect(state.record!.SetMany).toHaveBeenCalledWith({ Name: 'x', Salary: 1 }, true);
    });
});

// ─── Output projection ────────────────────────────────────────────────────

describe('MCP entity tools: values returned to a restricted caller', () => {
    it('Get returns no denied value even when the record holds it', async () => {
        const record = JSON.parse(await run(AddEntityGetTool, { ID: ROW_ID }, intern)) as Record<string, unknown>;
        expect(record).toEqual({ ID: ROW_ID, Name: 'Ada' });
    });

    it('Create, Update and Delete return no denied value even when the record holds it', async () => {
        const responses = [
            await run(AddEntityCreateTool, { Name: 'Ada' }, intern),
            await run(AddEntityUpdateTool, { ID: ROW_ID, Name: 'Ada' }, intern),
            await run(AddEntityDeleteTool, { ID: ROW_ID }, intern),
        ];
        for (const text of responses) {
            const out = JSON.parse(text) as ToolResponse;
            expect(out.success).toBe(true);
            expect(JSON.parse(out.record!)).toEqual({ ID: ROW_ID, Name: 'Ada' });
        }
    });

    it('Run View asks for plain rows and returns no denied value even when the view does', async () => {
        const out = JSON.parse(await run(AddEntityRunViewTool, {}, intern)) as { Results: Record<string, unknown>[] };
        expect(state.runViewParams[0].ResultType).toBe('simple');
        expect(out.Results).toEqual([{ ID: ROW_ID, Name: 'Ada' }]);
    });

    it('an unrestricted caller still receives every value', async () => {
        const record = JSON.parse(await run(AddEntityGetTool, { ID: ROW_ID }, hr)) as Record<string, unknown>;
        expect(record).toEqual(fullRow());
    });
});

// ─── Clause screen ────────────────────────────────────────────────────────

describe('MCP Run View: caller-supplied filter and sort are screened like GraphQL and REST', () => {
    const rowComparisons = [
        "EXISTS (SELECT * FROM vwEmployees x WHERE x.ID = vwEmployees.ID INTERSECT SELECT x2.ID, x2.Name, n.v FROM vwEmployees x2 CROSS JOIN (VALUES (100000),(200000)) n(v))",
        "EXISTS (SELECT * FROM vwEmployees WHERE ID='k' EXCEPT SELECT ID, Name, 1 FROM vwEmployees)",
        "EXISTS (SELECT * FROM vwEmployees WHERE ID='k' UNION ALL SELECT 1,2,3)",
        "NOT EXISTS (SELECT * FROM vwEmployees WHERE ID='k' EXCEPT SELECT 'k','Bob',1)",
    ];

    for (const extraFilter of rowComparisons) {
        it(`refuses a whole-row set-operation comparison before running the view: ${extraFilter.slice(0, 60)}…`, async () => {
            const out = JSON.parse(await run(AddEntityRunViewTool, { extraFilter }, intern)) as { Success: boolean; Results: unknown[]; ErrorMessage: string };
            expect(out.Success).toBe(false);
            expect(out.Results).toEqual([]);
            expect(out.ErrorMessage).toMatch(/ExtraFilter/);
            expect(state.runViewParams).toHaveLength(0);
        });
    }

    it('refuses a sort that reads the base view through a subquery', async () => {
        const orderBy = '(SELECT TOP 1 x.Salary FROM vwEmployees x WHERE x.ID = vwEmployees.ID)';
        const out = JSON.parse(await run(AddEntityRunViewTool, { orderBy }, intern)) as { Success: boolean; ErrorMessage: string };
        expect(out.Success).toBe(false);
        expect(out.ErrorMessage).toMatch(/OrderBy/);
        expect(state.runViewParams).toHaveLength(0);
    });

    it('passes a plain filter and sort through to the view', async () => {
        const out = JSON.parse(await run(AddEntityRunViewTool, { extraFilter: "Name = 'Ada'", orderBy: 'Name DESC' }, intern)) as { Results: Record<string, unknown>[] };
        expect(state.runViewParams[0].ExtraFilter).toBe("Name = 'Ada'");
        expect(state.runViewParams[0].OrderBy).toBe('Name DESC');
        expect(out.Results).toEqual([{ ID: ROW_ID, Name: 'Ada' }]);
    });
});
