/**
 * Notes and examples come from the AI engine's cache, which is loaded as the system user, so they
 * hold every field whoever the run is for. The text injected into the prompt must carry only the
 * fields the run's user may read.
 */
import { describe, it, expect } from 'vitest';
import { EntityInfo, FieldPermissionAccess, UserInfo, UserRoleInfo } from '@memberjunction/core';
import type { MJAIAgentExampleEntity, MJAIAgentNoteEntity } from '@memberjunction/core-entities';
import { AgentContextInjector } from '../agent-context-injector';

const HR_ROLE = 'A0000000-0000-0000-0000-000000000001';
const INTERN_ROLE = 'A0000000-0000-0000-0000-000000000003';
const ALLOW = FieldPermissionAccess.Allow;
const NONE = FieldPermissionAccess.NoAccess;

function rules(fieldId: string, roles: string[]): Record<string, unknown>[] {
    return roles.map((roleId, i) => ({
        ID: `${fieldId}-${i}`, EntityFieldID: fieldId, RoleID: roleId, ReadAccess: ALLOW, UpdateAccess: NONE, CreateAccess: NONE,
    }));
}

/** An entity whose `restricted` fields only HR may read; every other field is open to both roles. */
function entity(name: string, open: string[], restricted: string[]): EntityInfo {
    const id = `E-${name}`;
    const field = (fieldName: string, seq: number, roles: string[]) => ({
        ID: `F-${fieldName}`, EntityID: id, Sequence: seq, Name: fieldName, Entity: name, Type: 'nvarchar',
        EntityFieldPermissions: rules(`F-${fieldName}`, roles),
    });
    return new EntityInfo({
        ID: id, Name: name, SchemaName: '__mj', BaseTable: name, BaseView: `vw${name}`, EnableFieldLevelSecurity: true,
        Permissions: [HR_ROLE, INTERN_ROLE].map((RoleID) => ({ EntityID: id, RoleID, CanRead: true })),
        Fields: [
            { ...field('ID', 1, [HR_ROLE, INTERN_ROLE]), IsPrimaryKey: true, Type: 'uniqueidentifier' },
            ...open.map((f, i) => field(f, i + 2, [HR_ROLE, INTERN_ROLE])),
            ...restricted.map((f, i) => field(f, open.length + i + 2, [HR_ROLE])),
        ],
    });
}

function user(id: string, roleId: string): UserInfo {
    const u = new UserInfo();
    u.ID = id;
    (u as unknown as Record<string, unknown>)['_UserRoles'] = [new UserRoleInfo({ UserID: id, RoleID: roleId, Role: id })];
    return u;
}

const NOTES = entity('MJ: AI Agent Notes', ['Type', 'Status', 'Note'], ['SecondaryScopes', 'PrimaryScopeRecordID']);
const NOTES_BODY_RESTRICTED = entity('MJ: AI Agent Notes', ['Type', 'Status'], ['Note']);
const EXAMPLES = entity('MJ: AI Agent Examples', ['ExampleInput', 'SuccessScore'], ['ExampleOutput']);
const hr = user('hr', HR_ROLE);
const intern = user('intern', INTERN_ROLE);

function note(entityInfo: EntityInfo, values: Partial<MJAIAgentNoteEntity>): MJAIAgentNoteEntity {
    return {
        Status: 'Active', Type: 'Preference', Note: 'A note', AgentID: null, UserID: null, CompanyID: null,
        PrimaryScopeRecordID: null, SecondaryScopes: null, ...values,
        EntityInfo: entityInfo,
    } as unknown as MJAIAgentNoteEntity;
}

function example(values: Partial<MJAIAgentExampleEntity>): MJAIAgentExampleEntity {
    return { ExampleInput: 'Q', ExampleOutput: 'A', SuccessScore: null, ...values, EntityInfo: EXAMPLES } as unknown as MJAIAgentExampleEntity;
}

describe('AgentContextInjector: field-level security on injected memory', () => {
    const injector = new AgentContextInjector();

    it('leaves a note body the run\'s user may not read out of the prompt, and drops the note', () => {
        const notes = [note(NOTES_BODY_RESTRICTED, { Note: 'CEO salary is 4.2M' }), note(NOTES_BODY_RESTRICTED, { Note: 'x' })];
        const forIntern = injector.FormatNotesForInjection(notes, false, intern);
        const forHr = injector.FormatNotesForInjection(notes, false, hr);

        expect(forIntern).not.toContain('4.2M');
        expect(forIntern).toBe('');
        expect(forHr).toContain('CEO salary is 4.2M');
    });

    it('does not let a restricted scope field shape the note text', () => {
        const scoped = [note(NOTES, { Note: 'visible', PrimaryScopeRecordID: 'org-1', SecondaryScopes: '{"Team":"red"}' })];

        expect(injector.FormatNotesForInjection(scoped, false, hr)).toContain('Scope: User-specific (most specific)');
        const forIntern = injector.FormatNotesForInjection(scoped, false, intern);
        expect(forIntern).toContain('visible');
        expect(forIntern).not.toContain('User-specific (most specific)');
    });

    it('leaves an example output the run\'s user may not read out of the prompt', () => {
        const examples = [example({ ExampleInput: 'What is Ada paid?', ExampleOutput: 'Ada earns 250000' })];
        const forIntern = injector.FormatExamplesForInjection(examples, intern);

        expect(forIntern).toContain('What is Ada paid?');
        expect(forIntern).not.toContain('250000');
        expect(injector.FormatExamplesForInjection(examples, hr)).toContain('Ada earns 250000');
    });
});
