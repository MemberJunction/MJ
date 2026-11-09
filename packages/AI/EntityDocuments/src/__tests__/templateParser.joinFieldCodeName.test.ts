/**
 * The join field of a `Relationship()` holds the parent record's own key, so it stays in the
 * related rows even when some reader role may not see it. A related row can carry the field under
 * its `CodeName` rather than its `Name` (an explicit field list selects `[Name] AS [CodeName]`),
 * and the index-restricted set lists both, so the exemption must cover both.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { EntityInfo, IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJEntityDocumentEntity } from '@memberjunction/core-entities';

vi.mock('@memberjunction/core', async (importOriginal) => {
  const original = await importOriginal<typeof import('@memberjunction/core')>();
  return {
    ...original,
    /** The restricted set listing each field under its CodeName as well as its Name. */
    GetIndexRestrictedFieldNames: (entity: EntityInfo) => {
      const restricted = original.GetIndexRestrictedFieldNames(entity);
      for (const field of entity?.Fields ?? []) {
        if (restricted.has(field.Name.trim().toLowerCase())) {
          restricted.add(field.CodeName.trim().toLowerCase());
        }
      }
      return restricted;
    },
  };
});

import { EntityDocumentTemplateParserBase } from '../generic/EntityDocumentTemplateParserBase';
import { EntityDocumentTemplateParser } from '../generic/EntityDocumentTemplateParser';
import { EntityDocumentCache } from '../models/EntityDocumentCache';

const ENTITY_ID = '11111111-1111-1111-1111-111111111111';
const CHILD_ENTITY_ID = '22222222-2222-2222-2222-222222222222';
const HR_ROLE = 'hr-role';
const STAFF_ROLE = 'staff-role';

type RelationshipCall = (id: string, rec: Record<string, unknown>, user: UserInfo, rel: string, max: number, doc: string) => Promise<string>;

function field(name: string, codeName: string, hrOnly: boolean): Record<string, unknown> {
  const roles = hrOnly ? [HR_ROLE] : [HR_ROLE, STAFF_ROLE];
  return { Name: name, CodeName: codeName, IsUnrestrictableField: false, IsOnUnrestrictableEntity: false, FieldPermissions: roles.map((RoleID) => ({ RoleID, ReadAccess: 'Allow' })) };
}

/** "Reviews", joined to its employee through the HR-only `Employee Ref` field (CodeName `EmployeeRef`). */
class CodeNameJoinParser extends EntityDocumentTemplateParser {
  protected override get ProviderToUse(): IMetadataProvider {
    return {
      Entities: [
        {
          ID: ENTITY_ID,
          Name: 'Employees',
          PrimaryKeys: [{ Name: 'ID' }],
          RelatedEntities: [{ RelatedEntity: 'Reviews', RelatedEntityID: CHILD_ENTITY_ID, RelatedEntityJoinField: 'Employee Ref' }],
        },
        {
          ID: CHILD_ENTITY_ID,
          Name: 'Reviews',
          FieldLevelSecurityApplies: true,
          EnableFieldLevelSecurity: true,
          ParentID: null,
          Permissions: [HR_ROLE, STAFF_ROLE].map((RoleID) => ({ RoleID, CanRead: true, IsDeny: false })),
          Fields: [field('ID', 'ID', false), field('Employee Ref', 'EmployeeRef', true), field('Manager Notes', 'ManagerNotes', true)],
          GetDeniedReadFields: () => new Set<string>(),
        },
      ],
      GetEntityObject: async () => ({
        InnerLoad: async () => true,
        GetRelatedEntityDataExt: async () => ({ Data: [{ ID: 'rev-1', EmployeeRef: 'emp-1', ManagerNotes: 'PIP-CONFIDENTIAL' }] }),
      }),
    } as unknown as IMetadataProvider;
  }

  public Rel(user: UserInfo): Promise<string> {
    const call = (this as unknown as { Relationship: RelationshipCall }).Relationship;
    return call.apply(this, [ENTITY_ID, { ID: 'emp-1' }, user, 'Reviews', 10, '']);
  }
}

describe('Relationship() join-field exemption covers a row keyed by CodeName', () => {
  beforeEach(() => {
    EntityDocumentTemplateParserBase.ClearCache();
    vi.spyOn(EntityDocumentCache.Instance, 'IsLoaded', 'get').mockReturnValue(true);
    vi.spyOn(EntityDocumentCache.Instance, 'GetDocumentByName').mockReturnValue(null as unknown as MJEntityDocumentEntity);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps the join value under its CodeName and still drops the other restricted field', async () => {
    const rendered = await new CodeNameJoinParser().Rel({ ID: 'hr-admin' } as UserInfo);

    expect(rendered).toContain('"EmployeeRef":"emp-1"');
    expect(rendered).not.toContain('PIP-CONFIDENTIAL');
  });
});
