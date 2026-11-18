/**
 * Entity Record Document text and autotag content are built once and read by many users, so a
 * value a reader may not see must never reach the rendered text: not through a related row that
 * `Relationship()` loads, and not through a placeholder resolved earlier from a wider record.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJEntityDocumentEntity } from '@memberjunction/core-entities';
import { TemplateEngineServer } from '@memberjunction/templates';
import { EntityDocumentTemplateParserBase } from '../generic/EntityDocumentTemplateParserBase';
import { EntityDocumentTemplateParser } from '../generic/EntityDocumentTemplateParser';
import { EntityDocumentCache } from '../models/EntityDocumentCache';

const ENTITY_ID = '11111111-1111-1111-1111-111111111111';
const CHILD_ENTITY_ID = '22222222-2222-2222-2222-222222222222';
const HR_ROLE = 'hr-role';
const STAFF_ROLE = 'staff-role';

type RelationshipCall = (
  entityID: string,
  entityRecord: Record<string, unknown>,
  user: UserInfo,
  rel: string,
  max: number,
  docName: string
) => Promise<string>;

/** A related-entity field: readable by both roles unless `hrOnly`, in which case only HR holds an Allow row. */
function reviewField(name: string, hrOnly: boolean): Record<string, unknown> {
  const roles = hrOnly ? [HR_ROLE] : [HR_ROLE, STAFF_ROLE];
  return {
    Name: name,
    CodeName: name,
    IsUnrestrictableField: false,
    IsOnUnrestrictableEntity: false,
    FieldPermissions: roles.map((RoleID) => ({ RoleID, ReadAccess: 'Allow' })),
  };
}

/**
 * The related entity "Reviews": the `hrOnly` fields are readable by HR only. `deniedForUser` is what
 * the render user is denied, standing in for `GetDeniedReadFields`.
 */
function reviewsEntity(deniedForUser: string[], hrOnly: string[]): Record<string, unknown> {
  return {
    ID: CHILD_ENTITY_ID,
    Name: 'Reviews',
    PrimaryKeys: [{ Name: 'ID' }],
    RelatedEntities: [],
    FieldLevelSecurityApplies: true,
    EnableFieldLevelSecurity: true,
    ParentID: null,
    Permissions: [
      { RoleID: HR_ROLE, CanRead: true, IsDeny: false },
      { RoleID: STAFF_ROLE, CanRead: true, IsDeny: false },
    ],
    Fields: ['ID', 'EmployeeID', 'Title', 'ManagerNotes'].map((name) => reviewField(name, hrOnly.includes(name))),
    GetDeniedReadFields: () => new Set(deniedForUser.map((n) => n.toLowerCase())),
  };
}

class RestrictedRelationshipParser extends EntityDocumentTemplateParser {
  public RelatedRows: Array<Record<string, unknown>> = [];
  public DeniedForUser: string[] = [];
  public HrOnlyFields: string[] = ['ManagerNotes'];
  public ChildDocumentText = '';

  protected override get ProviderToUse(): IMetadataProvider {
    const self = this;
    return {
      Entities: [
        {
          ID: ENTITY_ID,
          Name: 'Employees',
          PrimaryKeys: [{ Name: 'ID' }],
          RelatedEntities: [{ RelatedEntity: 'Reviews', RelatedEntityID: CHILD_ENTITY_ID, RelatedEntityJoinField: 'EmployeeID' }],
        },
        reviewsEntity(self.DeniedForUser, self.HrOnlyFields),
      ],
      GetEntityObject: async () => ({
        InnerLoad: async () => true,
        GetRelatedEntityDataExt: async () => ({ Data: self.RelatedRows }),
      }),
    } as unknown as IMetadataProvider;
  }

  protected override async resolveDocumentTemplateText(): Promise<string> {
    return this.ChildDocumentText;
  }

  public Rel(user: UserInfo, docName: string): Promise<string> {
    const call = (this as unknown as { Relationship: RelationshipCall }).Relationship;
    return call.apply(this, [ENTITY_ID, { ID: 'emp-1', Name: 'Ada' }, user, 'Reviews', 10, docName]);
  }
}

const REVIEW_ROW = { ID: 'rev-1', EmployeeID: 'emp-1', Title: 'Q3', ManagerNotes: 'PIP-CONFIDENTIAL' };

describe('Relationship() keeps restricted related fields out of the document', () => {
  beforeEach(() => {
    EntityDocumentTemplateParserBase.ClearCache();
    const cache = EntityDocumentCache.Instance;
    vi.spyOn(cache, 'IsLoaded', 'get').mockReturnValue(true);
    vi.spyOn(cache, 'GetDocumentByName').mockReturnValue({ ID: 'doc-1', Name: 'Review Doc' } as unknown as MJEntityDocumentEntity);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('drops a related field the render user is denied, in the raw JSON form', async () => {
    const parser = new RestrictedRelationshipParser();
    parser.RelatedRows = [{ ...REVIEW_ROW }];
    parser.DeniedForUser = ['ManagerNotes'];

    const rendered = await parser.Rel({ ID: 'intern' } as UserInfo, '');

    expect(rendered).toContain('Q3');
    expect(rendered).not.toContain('PIP-CONFIDENTIAL');
  });

  it('drops a related field some reader role may not see, even when the render user may read it', async () => {
    const parser = new RestrictedRelationshipParser();
    parser.RelatedRows = [{ ...REVIEW_ROW }];
    parser.DeniedForUser = [];
    parser.ChildDocumentText = 'Review ${Title} Notes ${ManagerNotes} For ${EmployeeID}';

    const rendered = await parser.Rel({ ID: 'hr-admin' } as UserInfo, 'Review Doc');

    expect(rendered).toContain('Review Q3 Notes  For emp-1');
    expect(rendered).not.toContain('PIP-CONFIDENTIAL');
  });

  it('drops a field only the render user is denied, which every reader role may otherwise see', async () => {
    const parser = new RestrictedRelationshipParser();
    parser.RelatedRows = [{ ...REVIEW_ROW }];
    parser.DeniedForUser = ['Title'];

    const rendered = await parser.Rel({ ID: 'contractor' } as UserInfo, '');

    expect(rendered).toContain('emp-1');
    expect(rendered).not.toContain('Q3');
  });

  it('keeps the join field even when a reader role may not see it, since it holds the parent key', async () => {
    const parser = new RestrictedRelationshipParser();
    parser.RelatedRows = [{ ...REVIEW_ROW }];
    parser.HrOnlyFields = ['ManagerNotes', 'EmployeeID'];
    parser.ChildDocumentText = 'Review ${Title} For ${EmployeeID} Notes ${ManagerNotes}';

    const rendered = await parser.Rel({ ID: 'hr-admin' } as UserInfo, 'Review Doc');

    expect(rendered).toContain('Review Q3 For emp-1 Notes ');
    expect(rendered).not.toContain('PIP-CONFIDENTIAL');
  });

  it('never modifies the rows the provider returned', async () => {
    const parser = new RestrictedRelationshipParser();
    const row = { ...REVIEW_ROW };
    parser.RelatedRows = [row];
    parser.DeniedForUser = ['ManagerNotes'];

    await parser.Rel({ ID: 'intern' } as UserInfo, '');

    expect(row.ManagerNotes).toBe('PIP-CONFIDENTIAL');
  });
});

class FieldParser extends EntityDocumentTemplateParserBase {
  public Evaluations = 0;

  protected override get ProviderToUse(): IMetadataProvider {
    return { Entities: [{ ID: ENTITY_ID, PrimaryKeys: [{ Name: 'ID' }] }] } as unknown as IMetadataProvider;
  }

  protected override async evalSingleArgument(
    argument: string,
    entityID: string,
    entityRecord: Record<string, unknown>,
    contextUser: UserInfo
  ): Promise<string> {
    this.Evaluations++;
    return super.evalSingleArgument(argument, entityID, entityRecord, contextUser);
  }
}

describe('EntityDocumentTemplateParserBase placeholder cache follows the record values', () => {
  beforeEach(() => {
    EntityDocumentTemplateParserBase.ClearCache();
  });

  it('does not serve a value resolved from a wider record to a later render of the stripped record', async () => {
    const parser = new FieldParser();
    const user = { ID: 'user-a' } as UserInfo;
    const template = 'Title ${Title} Pay ${Salary}';

    const wide = await parser.Parse(template, ENTITY_ID, { ID: '1', Title: 'Engineer', Salary: 250000 }, user);
    const stripped = await parser.Parse(template, ENTITY_ID, { ID: '1', Title: 'Engineer' }, user);

    expect(wide).toBe('Title Engineer Pay 250000');
    expect(stripped).toBe('Title Engineer Pay ');
  });

  it('re-resolves a placeholder when the record it reads has changed', async () => {
    const parser = new FieldParser();
    const user = { ID: 'user-a' } as UserInfo;

    await parser.Parse('Name ${Name}', ENTITY_ID, { ID: '1', Name: 'Old' }, user);
    const after = await parser.Parse('Name ${Name}', ENTITY_ID, { ID: '1', Name: 'New' }, user);

    expect(after).toBe('Name New');
  });

  it("does not serve a child's parent value resolved from a wider parent record", async () => {
    const parser = new FieldParser();
    const user = { ID: 'user-a' } as UserInfo;
    const template = 'Review ${Title} By ${__Parent.Salary}';

    const wide = await parser.Parse(template, ENTITY_ID, { ID: 'r1', Title: 'Q3', __Parent: { ID: 'e1', Salary: 250000 } }, user);
    const stripped = await parser.Parse(template, ENTITY_ID, { ID: 'r1', Title: 'Q3', __Parent: { ID: 'e1' } }, user);

    expect(wide).toBe('Review Q3 By 250000');
    expect(stripped).toBe('Review Q3 By ');
  });

  it('does not let a string value that spells out another field collide with a record holding that field', async () => {
    const parser = new FieldParser();
    const user = { ID: 'user-a' } as UserInfo;
    const real = { ID: '1', A: 'x', B: 'SECRET' };
    const crafted = { ID: '1', A: 'x,"B"=string:SECRET' };

    expect(EntityDocumentTemplateParserBase.HashRecordValues(crafted)).not.toBe(EntityDocumentTemplateParserBase.HashRecordValues(real));
    await parser.Parse('Value ${B}', ENTITY_ID, real, user);
    expect(await parser.Parse('Value ${B}', ENTITY_ID, crafted, user)).toBe('Value ');
  });

  it('still reuses a placeholder for the same user and the same record values', async () => {
    const parser = new FieldParser();
    const user = { ID: 'user-a' } as UserInfo;

    await parser.Parse('Name ${Name}', ENTITY_ID, { ID: '1', Name: 'Same' }, user);
    await parser.Parse('Name ${Name}', ENTITY_ID, { Name: 'Same', ID: '1' }, user);

    expect(parser.Evaluations).toBe(1);
  });
});

/** Exposes the cache's protected read and write so the bound can be filled without rendering. */
class CacheProbe extends EntityDocumentTemplateParserBase {
  public static Put(key: string, value: string): void {
    EntityDocumentTemplateParserBase.setCachedPlaceholder(key, value);
  }
  public static Take(key: string): string | undefined {
    return EntityDocumentTemplateParserBase.getCachedPlaceholder(key);
  }
}

describe('EntityDocumentTemplateParserBase placeholder cache is bounded', () => {
  const max = EntityDocumentTemplateParserBase.MaxCachedPlaceholders;

  beforeEach(() => {
    EntityDocumentTemplateParserBase.ClearCache();
  });

  it('never holds more than the cap, however many record versions are parsed', async () => {
    const parser = new FieldParser();
    const user = { ID: 'user-a' } as UserInfo;
    for (let version = 0; version <= max; version++) {
      await parser.Parse('Name ${Name}', ENTITY_ID, { ID: '1', Name: `v${version}` }, user);
    }

    expect(EntityDocumentTemplateParserBase.CachedPlaceholderCount).toBe(max);
  });

  it('evicts the least recently used entry, keeping one that was read since it was added', () => {
    CacheProbe.Put('first', '1');
    CacheProbe.Put('second', '2');
    CacheProbe.Take('first');
    for (let i = 0; i < max - 1; i++) {
      CacheProbe.Put(`filler-${i}`, 'f');
    }

    expect(CacheProbe.Take('first')).toBe('1');
    expect(CacheProbe.Take('second')).toBeUndefined();
  });
});

describe('EntityDocumentTemplateParserBase Nunjucks pre-render', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders as the parse user, never as whoever configured the shared engine', async () => {
    const engine = TemplateEngineServer.Instance;
    vi.spyOn(engine, 'Config').mockResolvedValue(undefined);
    const render = vi.spyOn(engine, 'RenderTemplateSimple').mockResolvedValue({ Success: true, Output: 'ok', Message: undefined });
    const user = { ID: 'user-a' } as UserInfo;

    await new FieldParser().Parse('{{ Name }}', ENTITY_ID, { ID: '1', Name: 'Ada' }, user);

    expect(render).toHaveBeenCalledTimes(1);
    expect(render.mock.calls[0][2]?.ContextUser).toBe(user);
  });
});
