/**
 * Field-level security on the agent-run step export: the exported data carries no value of a
 * field the caller may not read, including the resolved payloads, even when the step object
 * holds the full row.
 */
import { describe, it, expect, vi } from 'vitest';
import { EntityInfo, FieldPermissionAccess, UserInfo, UserRoleInfo } from '@memberjunction/core';
import type { MJAIAgentRunStepEntityExtended } from '@memberjunction/ai-core-plus';

vi.mock('@memberjunction/ai-core-plus', () => ({
    ResolvePayloadAtStart: (step: { PayloadAtStart: string }) => step.PayloadAtStart,
    ResolvePayloadAtEnd: (step: { PayloadAtEnd: string }) => step.PayloadAtEnd,
}));

import { BuildAgentRunStepExportData } from '../tools/agentRunStepExport.js';

const AUDITOR_ROLE_ID = 'A0000000-0000-0000-0000-000000000001';
const VIEWER_ROLE_ID = 'A0000000-0000-0000-0000-000000000002';
const ENTITY_ID = 'C0000000-0000-0000-0000-000000000001';
const STEP_ID = '22222222-0000-0000-0000-000000000001';

function openTo(fieldId: string, roles: string[]): Record<string, string>[] {
    return roles.map((roleId, i) => ({
        ID: `${fieldId}-open-${i}`, EntityFieldID: fieldId, RoleID: roleId,
        ReadAccess: FieldPermissionAccess.Allow, UpdateAccess: FieldPermissionAccess.Allow, CreateAccess: FieldPermissionAccess.Allow,
    }));
}

/** Steps whose `InputData` and `PayloadAtStart` only auditors may read. */
function stepEntity(): EntityInfo {
    const both = [AUDITOR_ROLE_ID, VIEWER_ROLE_ID];
    const field = (id: string, seq: number, name: string, roles: string[]) => ({
        ID: id, EntityID: ENTITY_ID, Sequence: seq, Name: name, Entity: 'MJ: AI Agent Run Steps', Type: 'nvarchar',
        AllowsNull: true, EntityFieldPermissions: openTo(id, roles),
    });
    return new EntityInfo({
        ID: ENTITY_ID, Name: 'MJ: AI Agent Run Steps', SchemaName: '__mj', BaseTable: 'AIAgentRunStep',
        BaseView: 'vwAIAgentRunSteps', EnableFieldLevelSecurity: true,
        Fields: [
            { ...field('s-id', 1, 'ID', both), IsPrimaryKey: true, Type: 'uniqueidentifier' },
            field('s-name', 2, 'StepName', both),
            field('s-input', 3, 'InputData', [AUDITOR_ROLE_ID]),
            field('s-start', 4, 'PayloadAtStart', [AUDITOR_ROLE_ID]),
            field('s-end', 5, 'PayloadAtEnd', both),
        ],
    });
}

function buildUser(roleId: string, id: string): UserInfo {
    return new UserInfo(null, {
        ID: id, Name: `User ${id}`, Email: `${id}@test.com`, IsActive: true,
        UserRoles: [new UserRoleInfo({ UserID: id, RoleID: roleId, Role: `Role-${roleId}` })],
    });
}

const fullRow = { ID: STEP_ID, StepName: 'Plan', InputData: 'secret input', PayloadAtStart: 'secret start', PayloadAtEnd: 'end' };

/** A step that holds the full row whoever loaded it. */
function fakeStep(entity: EntityInfo): MJAIAgentRunStepEntityExtended {
    const step = { ...fullRow, EntityInfo: entity, GetAll: () => ({ ...fullRow }) };
    return step as Partial<MJAIAgentRunStepEntityExtended> as MJAIAgentRunStepEntityExtended;
}

describe('Get_Agent_Run_Step_Full_Data export', () => {
    const entity = stepEntity();
    const metadata = { Entities: [entity], EntityByID: (id: string) => (id === ENTITY_ID ? entity : undefined) };

    it('omits every field the caller may not read, including a resolved payload', () => {
        const step = fakeStep(entity);
        const data = BuildAgentRunStepExportData(step, [step], buildUser(VIEWER_ROLE_ID, 'viewer'), metadata);
        expect(data).toEqual({ ID: STEP_ID, StepName: 'Plan', PayloadAtEnd: 'end' });
    });

    it('exports every field to a caller who may read them all', () => {
        const step = fakeStep(entity);
        const data = BuildAgentRunStepExportData(step, [step], buildUser(AUDITOR_ROLE_ID, 'auditor'), metadata);
        expect(data).toEqual(fullRow);
    });
});
