/**
 * A record process runs as a system identity, so its default prompt mapping sees every field, and
 * what the model writes back lands in fields other users read. The default mapping must therefore
 * leave out any field that field-level security restricts for any role, as the index-time rule does
 * for embeddings. An explicit field list or input mapping is the administrator's choice and is kept.
 */
import { describe, it, expect } from 'vitest';
import { EntityInfo, FieldPermissionAccess, type IMetadataProvider } from '@memberjunction/core';
import type { DataFeatureSpec } from '@memberjunction/feature-pipelines';
import type { RecordProcessorContext, RecordRef } from '@memberjunction/record-set-processor-base';
import { InferProcessor } from '../processors/InferProcessor';

const HR_ROLE = 'A0000000-0000-0000-0000-000000000001';
const STAFF_ROLE = 'A0000000-0000-0000-0000-000000000002';
const ENTITY_ID = 'E-Employees';

const EMPLOYEES = new EntityInfo({
    ID: ENTITY_ID, Name: 'Employees', SchemaName: 'dbo', BaseTable: 'Employee', BaseView: 'vwEmployees', EnableFieldLevelSecurity: true,
    Permissions: [HR_ROLE, STAFF_ROLE].map((RoleID) => ({ EntityID: ENTITY_ID, RoleID, CanRead: true })),
    Fields: [['ID', [HR_ROLE, STAFF_ROLE]], ['Title', [HR_ROLE, STAFF_ROLE]], ['Salary', [HR_ROLE]]].map(([name, roles], i) => ({
        ID: `F-${name}`, EntityID: ENTITY_ID, Sequence: i + 1, Name: name, Entity: 'Employees', Type: 'nvarchar', IsPrimaryKey: name === 'ID',
        EntityFieldPermissions: (roles as string[]).map((RoleID) => ({
            ID: `P-${name}-${RoleID}`, EntityFieldID: `F-${name}`, RoleID, ReadAccess: FieldPermissionAccess.Allow, UpdateAccess: 'No Access', CreateAccess: 'No Access',
        })),
    })),
});

class PromptDataProbe extends InferProcessor {
    public PromptData(record: RecordRef, ctx: RecordProcessorContext): Promise<Record<string, unknown>> {
        return this.buildPromptData(record, ctx);
    }
}

const provider = { EntityByID: (id: string) => (id === ENTITY_ID ? EMPLOYEES : null) } as Pick<IMetadataProvider, 'EntityByID'>;
const context = { Provider: provider, EntityID: ENTITY_ID } as unknown as RecordProcessorContext;
const record: RecordRef = { EntityID: ENTITY_ID, RecordID: 'e1', Record: { ID: 'e1', Title: 'Engineer', Salary: 250000 } };

describe('InferProcessor default mapping: field-level security', () => {
    it('leaves a field restricted for any role out of the default prompt data', async () => {
        const data = await new PromptDataProbe('prompt-1', undefined, undefined, null).PromptData(record, context);

        expect(data).toEqual({ record: { ID: 'e1', Title: 'Engineer' } });
    });

    it('keeps a restricted field an explicit Context.Fields list names', async () => {
        const spec = { Context: { Fields: ['Title', 'Salary'] } } as DataFeatureSpec;
        const data = await new PromptDataProbe('prompt-1', undefined, spec, null).PromptData(record, context);

        expect(data).toEqual({ record: { ID: 'e1', Title: 'Engineer', Salary: 250000 } });
    });
});
