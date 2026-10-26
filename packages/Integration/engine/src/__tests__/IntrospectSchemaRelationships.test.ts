/**
 * {@link BaseRESTIntegrationConnector.IntrospectSchema} resolves each FK field's
 * RelatedIntegrationObjectID to the target object's name. The ID can arrive in a different case
 * than the object's own ID (SQL Server upper-case, PostgreSQL lower-case), and a field pointing at
 * an object that is not active is skipped.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IntegrationEngineBase } from '@memberjunction/integration-engine-base';
import type { MJCompanyIntegrationEntity, MJIntegrationObjectFieldEntity } from '@memberjunction/core-entities';
import type { UserInfo } from '@memberjunction/core';
import { BaseRESTIntegrationConnector } from '../BaseRESTIntegrationConnector';

const CONTACT = 'aaaaaaaa-0000-0000-0000-000000000001';
const ACCOUNT = 'bbbbbbbb-0000-0000-0000-000000000002';
const RETIRED = 'cccccccc-0000-0000-0000-000000000003';

type FieldRow = Pick<MJIntegrationObjectFieldEntity, 'Name' | 'RelatedIntegrationObjectID' | 'RelatedIntegrationObjectFieldName'>;

function field(Name: string, RelatedIntegrationObjectID: string | null = null, RelatedIntegrationObjectFieldName: string | null = null): FieldRow {
    return { Name, RelatedIntegrationObjectID, RelatedIntegrationObjectFieldName };
}

const FIELDS: Record<string, FieldRow[]> = {
    [CONTACT]: [
        field('ID'),
        field('AccountID', ACCOUNT.toUpperCase(), 'AccountKey'),
        field('OldThingID', RETIRED),
        field('ManagerID', CONTACT.toUpperCase()),
    ],
    [ACCOUNT]: [field('ID'), field('PrimaryContactID', CONTACT)],
};

/** Serves canned fields per object instead of reading them from the engine. */
class TestConnector extends BaseRESTIntegrationConnector {
    protected override GetCachedFields(objectID: string): MJIntegrationObjectFieldEntity[] {
        return (FIELDS[objectID] ?? []) as unknown as MJIntegrationObjectFieldEntity[];
    }
}

describe('BaseRESTIntegrationConnector.IntrospectSchema relationships', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(IntegrationEngineBase, 'Instance', 'get').mockReturnValue({
            GetActiveIntegrationObjects: () => [
                { ID: CONTACT, Name: 'Contact' },
                { ID: ACCOUNT, Name: 'Account' },
            ],
        } as unknown as IntegrationEngineBase);
    });

    it('resolves FK targets in any case, skipping targets that are not active objects', async () => {
        const schema = await new TestConnector().IntrospectSchema(
            { IntegrationID: 'integration-1' } as unknown as MJCompanyIntegrationEntity,
            {} as UserInfo,
        );

        const relationshipsOf = (name: string) => schema.Objects.find(o => o.ExternalName === name)?.Relationships;
        expect(relationshipsOf('Contact')).toEqual([
            { FieldName: 'AccountID', TargetObject: 'Account', TargetField: 'AccountKey' },
            { FieldName: 'ManagerID', TargetObject: 'Contact', TargetField: 'ID' },
        ]);
        expect(relationshipsOf('Account')).toEqual([
            { FieldName: 'PrimaryContactID', TargetObject: 'Contact', TargetField: 'ID' },
        ]);
    });
});
