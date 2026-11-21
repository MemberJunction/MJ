import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import { ConversationUtility } from '@memberjunction/ai-core-plus';
import { type IMetadataProvider, type RunViewParams, type UserInfo } from '@memberjunction/core';
import { ArtifactLinkTriggerProvider } from '../lib/services/artifact-link-trigger.provider';

const alice = { ID: 'user-alice', Name: 'Alice', UserRoles: [] } as unknown as UserInfo;
const bob = { ID: 'user-bob', Name: 'Bob', UserRoles: [] } as unknown as UserInfo;

interface MockArtifact {
  ID: string;
  Name: string;
  Description: string | null;
  Type: string;
  ReadableBy: string[];
}

function makeScopedProvider(rows: MockArtifact[]) {
  const queries: Array<{ params: RunViewParams; reader?: UserInfo }> = [];
  const provider = {
    RunView: async (params: RunViewParams, contextUser?: UserInfo) => {
      queries.push({ params, reader: contextUser });
      const readerId = contextUser?.ID ?? '';
      const filter = String(params.ExtraFilter ?? '');
      const likeMatch = /LIKE '%([^%]*)%'/i.exec(filter)?.[1]?.toLowerCase() ?? '';
      const visible = rows
        .filter((r) => r.ReadableBy.includes(readerId))
        .filter((r) => !likeMatch || r.Name.toLowerCase().includes(likeMatch));
      return {
        Success: true,
        Results: visible,
        RowCount: visible.length,
        TotalRowCount: visible.length,
        ExecutionTime: 0,
        ErrorMessage: '',
        UserViewRunID: '',
      };
    },
  } as unknown as IMetadataProvider;
  return { provider, queries };
}

describe('ArtifactLinkTriggerProvider', () => {
  it('runs artifact search as ContextUser so autocomplete never offers a doc the user cannot read', async () => {
    const { provider, queries } = makeScopedProvider([
      { ID: 'art-public', Name: 'Pricing Policy', Description: null, Type: 'Markdown Document', ReadableBy: [alice.ID, bob.ID] },
      { ID: 'art-private', Name: 'Pricing Secret', Description: null, Type: 'Markdown Document', ReadableBy: [alice.ID] },
    ]);

    const trigger = new ArtifactLinkTriggerProvider();
    const bobResults = await trigger.GetSuggestions({
      Query: 'Pricing',
      MaxResults: 10,
      ContextUser: bob,
      Provider: provider,
    });

    expect(queries).toHaveLength(1);
    expect(queries[0].reader).toBe(bob);
    expect(bobResults.map((s) => s.id)).toEqual(['art-public']);
    expect(bobResults.some((s) => s.id === 'art-private')).toBe(false);

    const aliceResults = await trigger.GetSuggestions({
      Query: 'Pricing',
      MaxResults: 10,
      ContextUser: alice,
      Provider: provider,
    });
    expect(aliceResults.map((s) => s.id)).toEqual(['art-public', 'art-private']);
  });

  it('fails closed and returns no suggestions when ContextUser is missing', async () => {
    const { provider, queries } = makeScopedProvider([
      { ID: 'art-1', Name: 'Pricing Policy', Description: null, Type: 'Markdown Document', ReadableBy: [alice.ID] },
    ]);
    const trigger = new ArtifactLinkTriggerProvider();
    const results = await trigger.GetSuggestions({
      Query: 'Pricing',
      MaxResults: 10,
      ContextUser: null,
      Provider: provider,
    });

    expect(results).toEqual([]);
    expect(queries).toHaveLength(0);
  });

  it('formats a chosen suggestion into a durable record-mention token with its name as label', () => {
    const token = ArtifactLinkTriggerProvider.FormatSelectionToken({
      type: 'record',
      id: 'art-1',
      name: 'Pricing Policy',
      displayName: 'Pricing Policy',
      data: { entityName: 'MJ: Artifacts', primaryKey: { ID: 'art-1' } },
    });

    expect(token).toBe(ConversationUtility.CreateRecordLink('MJ: Artifacts', 'Pricing Policy', { ID: 'art-1' }));
  });
});
