import { describe, it, expect, beforeEach } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { EntityDocumentTemplateParserBase } from '../generic/EntityDocumentTemplateParserBase';

const ENTITY_ID = '11111111-1111-1111-1111-111111111111';

/**
 * Resolves every placeholder to a value that depends on the user, standing in for a
 * Relationship() lookup that loads related rows under the caller's permissions.
 */
class PerUserParser extends EntityDocumentTemplateParserBase {
  public Evaluations = 0;

  protected override get ProviderToUse(): IMetadataProvider {
    return { Entities: [{ ID: ENTITY_ID, PrimaryKeys: [{ Name: 'ID' }] }] } as never;
  }

  protected override async evalSingleArgument(
    _content: string,
    _entityID: string,
    _record: Record<string, unknown>,
    contextUser: UserInfo
  ): Promise<string> {
    this.Evaluations++;
    return `rows visible to ${contextUser.ID}`;
  }
}

describe('EntityDocumentTemplateParserBase placeholder cache', () => {
  beforeEach(() => {
    EntityDocumentTemplateParserBase.ClearCache();
  });

  it("never serves a placeholder resolved for user A to user B", async () => {
    const parser = new PerUserParser();
    const record = { ID: '1' };
    const forA = await parser.Parse('${Relationship(Notes)}', ENTITY_ID, record, { ID: 'user-a' } as UserInfo);
    const forB = await parser.Parse('${Relationship(Notes)}', ENTITY_ID, record, { ID: 'user-b' } as UserInfo);

    expect(forA).toBe('rows visible to user-a');
    expect(forB).toBe('rows visible to user-b');
  });

  it('still reuses a placeholder resolved for the same user', async () => {
    const parser = new PerUserParser();
    const record = { ID: '1' };
    await parser.Parse('${Relationship(Notes)}', ENTITY_ID, record, { ID: 'user-a' } as UserInfo);
    await parser.Parse('${Relationship(Notes)}', ENTITY_ID, record, { ID: 'USER-A' } as UserInfo);

    expect(parser.Evaluations).toBe(1);
  });
});
