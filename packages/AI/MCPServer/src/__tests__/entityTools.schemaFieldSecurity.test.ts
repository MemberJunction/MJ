/**
 * Field-level security in the MCP entity tools' input schemas.
 *
 * A tool's input schema is shown to the session before any call, so a schema listing a field the
 * session user is denied reveals that the column exists — which the identical-message rule for
 * refused input exists to hide. Create and Update schemas therefore leave out every field the
 * session user may not write there (or read), and are shared between users with the same denials.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { EntityInfo, FieldPermissionAccess, UserInfo, UserRoleInfo } from '@memberjunction/core';
import type { ToolConfig } from '../Server.js';
import { AddEntityCreateTool, AddEntityUpdateTool } from '../tools/entityTools.js';

const HR_ROLE_ID = 'A0000000-0000-0000-0000-000000000001';
const MANAGER_ROLE_ID = 'A0000000-0000-0000-0000-000000000002';
const INTERN_ROLE_ID = 'A0000000-0000-0000-0000-000000000003';
const AUDITOR_ROLE_ID = 'A0000000-0000-0000-0000-000000000004';
const ENTITY_ID = 'B0000000-0000-0000-0000-000000000001';
const { Allow, Deny } = FieldPermissionAccess;

type Access = { read: string; update: string; create: string };

function rule(fieldId: string, roleId: string, access: Access): Record<string, string> {
    return { ID: `${fieldId}-${roleId}`, EntityFieldID: fieldId, RoleID: roleId, ReadAccess: access.read, UpdateAccess: access.update, CreateAccess: access.create };
}

const OPEN: Access = { read: Allow, update: Allow, create: Allow };

/**
 * `Employees`: `Salary` is HR-only; `Title` is open to managers, and readable and creatable by
 * interns but not updatable; `Name` is open to every role. Auditors may use `Name` and `Salary`
 * but not `Title`, so an auditor and a manager are each denied exactly one field, a different one.
 */
function employeeEntity(): EntityInfo {
    const field = (id: string, seq: number, name: string, type: string, perms: Record<string, string>[] = []) => ({
        ID: id, EntityID: ENTITY_ID, Sequence: seq, Name: name, Entity: 'Employees', Type: type,
        AllowUpdateAPI: true, AllowsNull: true, EntityFieldPermissions: perms,
    });
    return new EntityInfo({
        ID: ENTITY_ID, Name: 'Employees', ClassName: 'Employees', SchemaName: 'dbo', BaseTable: 'Employee',
        BaseView: 'vwEmployees', IncludeInAPI: true, AllowCreateAPI: true, AllowUpdateAPI: true, AllowDeleteAPI: true,
        EnableFieldLevelSecurity: true,
        Fields: [
            { ...field('f-id', 1, 'ID', 'uniqueidentifier'), IsPrimaryKey: true, AllowsNull: false },
            field('f-name', 2, 'Name', 'nvarchar', [rule('f-name', HR_ROLE_ID, OPEN), rule('f-name', MANAGER_ROLE_ID, OPEN), rule('f-name', INTERN_ROLE_ID, OPEN), rule('f-name', AUDITOR_ROLE_ID, OPEN)]),
            field('f-salary', 3, 'Salary', 'money', [rule('f-salary', HR_ROLE_ID, OPEN), rule('f-salary', AUDITOR_ROLE_ID, OPEN)]),
            field('f-title', 4, 'Title', 'nvarchar', [
                rule('f-title', HR_ROLE_ID, OPEN),
                rule('f-title', MANAGER_ROLE_ID, OPEN),
                rule('f-title', INTERN_ROLE_ID, { read: Allow, update: Deny, create: Allow }),
            ]),
        ],
    });
}

function buildUser(roleId: string, id: string): UserInfo {
    return new UserInfo(null, {
        ID: id, Name: `User ${id}`, Email: `${id}@test.com`, IsActive: true,
        UserRoles: [new UserRoleInfo({ UserID: id, RoleID: roleId, Role: `Role-${roleId}` })],
    });
}

function captureTool(register: (add: (c: ToolConfig) => void, e: EntityInfo) => void, entity: EntityInfo): ToolConfig {
    let captured: ToolConfig | null = null;
    register((c) => { captured = c; }, entity);
    if (!captured) throw new Error('tool was not registered');
    return captured;
}

/** The input-schema keys a session of `user` is shown for `tool`. */
function schemaKeys(tool: ToolConfig, user: UserInfo): string[] {
    const schema = tool.parametersForUser ? tool.parametersForUser(user) : tool.parameters;
    return Object.keys(schema.shape).sort();
}

let entity: EntityInfo;
let hr: UserInfo;
let intern: UserInfo;

beforeEach(() => {
    entity = employeeEntity();
    hr = buildUser(HR_ROLE_ID, 'hr');
    intern = buildUser(INTERN_ROLE_ID, 'intern');
});

describe('MCP entity tool input schemas follow the session user', () => {
    it('Create leaves out a field the user may not read', () => {
        const tool = captureTool(AddEntityCreateTool, entity);
        expect(schemaKeys(tool, intern)).toEqual(['Name', 'Title']);
        expect(schemaKeys(tool, hr)).toEqual(['Name', 'Salary', 'Title']);
    });

    it('Update leaves out a field the user may read but not update, and keeps the primary key', () => {
        const tool = captureTool(AddEntityUpdateTool, entity);
        expect(schemaKeys(tool, intern)).toEqual(['ID', 'Name']);
        expect(schemaKeys(tool, hr)).toEqual(['ID', 'Name', 'Salary', 'Title']);
    });

    it('gives a user denied nothing the shared schema', () => {
        const tool = captureTool(AddEntityCreateTool, entity);
        expect(tool.parametersForUser?.(hr)).toBe(tool.parameters);
    });

    it('builds one schema per set of denials, shared by every user who has it', () => {
        const tool = captureTool(AddEntityUpdateTool, entity);
        const otherIntern = buildUser(INTERN_ROLE_ID, 'intern-2');
        expect(tool.parametersForUser?.(intern)).toBeDefined();
        expect(tool.parametersForUser?.(intern)).toBe(tool.parametersForUser?.(otherIntern));
        expect(tool.parametersForUser?.(intern)).not.toBe(tool.parameters);
    });

    it('REGRESSION: never gives one user the schema built for a user with different denials', () => {
        const tool = captureTool(AddEntityUpdateTool, entity);
        const manager = buildUser(MANAGER_ROLE_ID, 'manager');
        // The manager is denied Salary only; the intern is denied Salary and Title.
        expect(schemaKeys(tool, manager)).toEqual(['ID', 'Name', 'Title']);
        expect(schemaKeys(tool, intern)).toEqual(['ID', 'Name']);
        expect(schemaKeys(tool, manager)).toEqual(['ID', 'Name', 'Title']);
    });

    it('REGRESSION: keeps apart two users denied the same number of fields but different ones', () => {
        const tool = captureTool(AddEntityUpdateTool, entity);
        const manager = buildUser(MANAGER_ROLE_ID, 'manager');
        const auditor = buildUser(AUDITOR_ROLE_ID, 'auditor');
        // Each is denied exactly one field: the manager Salary, the auditor Title.
        expect(schemaKeys(tool, manager)).toEqual(['ID', 'Name', 'Title']);
        expect(schemaKeys(tool, auditor)).toEqual(['ID', 'Name', 'Salary']);
        expect(schemaKeys(tool, manager)).toEqual(['ID', 'Name', 'Title']);
    });
});
