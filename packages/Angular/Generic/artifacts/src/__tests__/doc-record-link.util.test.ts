import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConversationUtility } from '@memberjunction/ai-core-plus';
import { type IMetadataProvider, type RunViewParams, type UserInfo } from '@memberjunction/core';
import { ArtifactPermissionEngine } from '@memberjunction/core-entities';
import {
  CheckDocRecordLinkAccess,
  CheckDocRecordLinksAccessBatch,
  DOC_LINK_PREVIEW_HREF_READABLE,
  DOC_LINK_PREVIEW_HREF_UNREADABLE,
  ExtractDocRecordLinks,
  FindActiveDocLinkTrigger,
  RenderDocRecordLinkChipHtml,
  ReplaceDocLinkTriggerWithToken,
  ReplaceDocRecordLinksWithPreviewMarkdown,
  StripDocRecordLinksToPlainText,
} from '../lib/utils/doc-record-link.util';

const viewer = { ID: 'user-1', Name: 'Alice', UserRoles: [] } as unknown as UserInfo;

function makeProvider(options: {
  entityReadable?: boolean;
  accountsReadable?: boolean;
  readableAccountIds?: string[];
  readableOrderLines?: Array<{ OrderID: string; LineNumber: number }>;
} = {}) {
  const runViewCalls: Array<{ params: RunViewParams; user?: UserInfo }> = [];
  const runViewsCalls: Array<{ params: RunViewParams[]; user?: UserInfo }> = [];
  const accountsPk = { Name: 'ID', NeedsQuotes: true };
  const orderLinesPks = [
    { Name: 'OrderID', NeedsQuotes: true },
    { Name: 'LineNumber', NeedsQuotes: false },
  ];
  const entities: Record<
    string,
    {
      ID: string;
      Name: string;
      PrimaryKeys: Array<{ Name: string; NeedsQuotes?: boolean }>;
      FirstPrimaryKey: { Name: string; NeedsQuotes?: boolean };
      GetUserPermisions: (u: UserInfo) => { CanRead: boolean };
    }
  > = {
    'MJ: Artifacts': {
      ID: 'ent-art',
      Name: 'MJ: Artifacts',
      PrimaryKeys: [{ Name: 'ID', NeedsQuotes: true }],
      FirstPrimaryKey: { Name: 'ID', NeedsQuotes: true },
      GetUserPermisions: () => ({ CanRead: true }),
    },
    Accounts: {
      ID: 'ent-accounts',
      Name: 'Accounts',
      PrimaryKeys: [accountsPk],
      FirstPrimaryKey: accountsPk,
      GetUserPermisions: () => ({ CanRead: options.accountsReadable ?? true }),
    },
    'Order Lines': {
      ID: 'ent-order-lines',
      Name: 'Order Lines',
      PrimaryKeys: orderLinesPks,
      FirstPrimaryKey: orderLinesPks[0],
      GetUserPermisions: () => ({ CanRead: options.entityReadable ?? true }),
    },
    'Restricted Records': {
      ID: 'ent-restricted',
      Name: 'Restricted Records',
      PrimaryKeys: [{ Name: 'ID', NeedsQuotes: true }],
      FirstPrimaryKey: { Name: 'ID', NeedsQuotes: true },
      GetUserPermisions: () => ({ CanRead: false }),
    },
  };
  const executeSingle = (params: RunViewParams) => {
    let rows: Record<string, unknown>[] = [];
    if (params.EntityName === 'Accounts') {
      const allowed = options.readableAccountIds ?? [];
      rows = allowed.map((id) => ({ ID: id }));
    } else if (params.EntityName === 'Order Lines') {
      rows = options.readableOrderLines ?? [{ OrderID: '7', LineNumber: 2 }];
    }
    return {
      Success: true,
      Results: rows,
      RowCount: rows.length,
      TotalRowCount: rows.length,
      ExecutionTime: 0,
      ErrorMessage: '',
      UserViewRunID: '',
    };
  };
  const provider = {
    EntityByName: (name: string) => entities[name],
    RunView: async (params: RunViewParams, contextUser?: UserInfo) => {
      runViewCalls.push({ params, user: contextUser });
      return executeSingle(params);
    },
    RunViews: async (paramsList: RunViewParams[], contextUser?: UserInfo) => {
      runViewsCalls.push({ params: paramsList, user: contextUser });
      return paramsList.map((p) => executeSingle(p));
    },
  } as unknown as IMetadataProvider;
  return { provider, runViewCalls, runViewsCalls };
}

describe('doc-record-link.util', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('renders a clickable chip with the stored label when readable', () => {
    const token = ConversationUtility.CreateRecordLink('MJ: Artifacts', 'Pricing Policy', { ID: 'art-42' });
    const [link] = ExtractDocRecordLinks(`See ${token} for details.`);

    const html = RenderDocRecordLinkChipHtml(link, 'readable');

    expect(html).toContain('mj-doc-link-chip--readable');
    expect(html).toContain('role="link"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('title="Open Pricing Policy"');
    expect(html).toContain('>Pricing Policy<');
    expect(html).toContain('data-doc-link-access="readable"');
    expect(html).not.toContain('aria-disabled="true"');
  });

  it('renders a greyed non-clickable chip with "You don\'t have access" tooltip and stored label when unreadable', () => {
    const token = ConversationUtility.CreateRecordLink('MJ: Artifacts', 'Secret Strategy', { ID: 'art-99' });
    const [link] = ExtractDocRecordLinks(`See ${token}.`);

    const html = RenderDocRecordLinkChipHtml(link, 'unreadable');

    expect(html).toContain('mj-doc-link-chip--unreadable');
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('title="You don&#39;t have access"');
    expect(html).toContain('>Secret Strategy<');
    expect(html).toContain('data-doc-link-access="unreadable"');
    expect(html).not.toContain('role="link"');
    expect(html).not.toContain('tabindex="0"');
  });

  it('checks artifact access through ArtifactPermissionEngine.ResolvePermissionsBatch in one call without ever querying artifact names', async () => {
    const id1 = '11111111-1111-4111-8111-111111111111';
    const id2 = '22222222-2222-4222-8222-222222222222';
    const links = ExtractDocRecordLinks(
      `${ConversationUtility.CreateRecordLink('MJ: Artifacts', 'Old Title 1', { ID: id1 })} ${ConversationUtility.CreateRecordLink('MJ: Artifacts', 'Old Title 2', { ID: id2 })}`,
    );
    const { provider, runViewCalls, runViewsCalls } = makeProvider();

    const batchSpy = vi
      .spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissionsBatch')
      .mockResolvedValueOnce(
        new Map([
          [id1, { ArtifactID: id1, CanRead: true, CanEdit: false, CanDelete: false, CanShare: false, Source: 'ArtifactPermission', Reason: 'Shared' }],
          [id2, { ArtifactID: id2, CanRead: false, CanEdit: false, CanDelete: false, CanShare: false, Source: 'Denied', Reason: 'No access' }],
        ]),
      );

    const res = await CheckDocRecordLinksAccessBatch(links, provider, viewer);
    expect(res.get(links[0].KeySignature)).toBe('readable');
    expect(res.get(links[1].KeySignature)).toBe('unreadable');
    expect(batchSpy).toHaveBeenCalledTimes(1);
    expect(batchSpy).toHaveBeenCalledWith(provider, [id1, id2], viewer);
    // Never issues a separate RunView to fetch the target artifact's current title.
    expect(runViewCalls).toHaveLength(0);
    expect(runViewsCalls).toHaveLength(0);
  });

  it('triggers O(1) RunViews calls for N linked docs regardless of N through the real ArtifactPermissionEngine.ResolvePermissionsBatch', async () => {
    const viewerUser = { ID: '22222222-2222-4222-8222-222222222222', Name: 'Alice', UserRoles: [] } as unknown as UserInfo;
    const ownerId = '11111111-1111-4111-8111-111111111111';

    const runBatchDocLinks = async (count: number, allOwned: boolean) => {
      const ids = Array.from({ length: count }, (_, i) => `a0000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`);
      const markdown = ids
        .map((id, i) => ConversationUtility.CreateRecordLink('MJ: Artifacts', `Doc ${i + 1}`, { ID: id }))
        .join(' ');
      const links = ExtractDocRecordLinks(markdown);

      const singleCalls: RunViewParams[] = [];
      const batchCalls: RunViewParams[][] = [];
      const artifactsEntity = {
        ID: 'ent-art',
        Name: 'MJ: Artifacts',
        PrimaryKeys: [{ Name: 'ID', NeedsQuotes: true }],
        FirstPrimaryKey: { Name: 'ID', NeedsQuotes: true },
        GetUserPermisions: () => ({ CanRead: true }),
      };
      const provider = {
        ProviderType: 'Network',
        Entities: [artifactsEntity],
        EntityByName: (name: string) => (name === 'MJ: Artifacts' ? artifactsEntity : undefined),
        EntityByID: (id: string) => (id === 'ent-art' ? artifactsEntity : undefined),
        RunView: async (params: RunViewParams) => {
          singleCalls.push(params);
          return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: '', UserViewRunID: '' };
        },
        RunViews: async (paramsList: RunViewParams[]) => {
          batchCalls.push(paramsList);
          return paramsList.map((p) => {
            if (p.EntityName === 'MJ: Artifacts') {
              return {
                Success: true,
                Results: ids.map((id, idx) => ({
                  ID: id,
                  UserID: allOwned || idx % 2 === 0 ? viewerUser.ID : ownerId,
                  DelegateEntityID: null,
                  DelegateRecordID: null,
                })),
                RowCount: ids.length,
                TotalRowCount: ids.length,
                ExecutionTime: 0,
                ErrorMessage: '',
                UserViewRunID: '',
              };
            }
            return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: '', UserViewRunID: '' };
          });
        },
      } as unknown as IMetadataProvider;

      const access = await CheckDocRecordLinksAccessBatch(links, provider, viewerUser);
      return { links, access, singleCalls, batchCalls };
    };

    // All-owner docs: strictly ONE RunViews call with only MJ: Artifacts regardless of N.
    const owned15 = await runBatchDocLinks(15, true);
    expect(owned15.singleCalls).toHaveLength(0);
    expect(owned15.batchCalls).toHaveLength(1);
    expect(owned15.batchCalls[0].map((p) => p.EntityName)).toEqual(['MJ: Artifacts']);

    // Mixed owned + unowned docs: flat 2 RunViews calls whether N=5 or N=15, zero per-artifact RunView calls.
    const run5 = await runBatchDocLinks(5, false);
    const run15 = await runBatchDocLinks(15, false);

    expect(run5.singleCalls).toHaveLength(0);
    expect(run5.batchCalls).toHaveLength(2);
    expect(run15.singleCalls).toHaveLength(0);
    expect(run15.batchCalls).toHaveLength(2);
    expect(run15.batchCalls[0].map((p) => p.EntityName)).toEqual(['MJ: Artifacts']);
    expect(run15.batchCalls[1].map((p) => p.EntityName)).toEqual(['MJ: Artifact Permissions', 'MJ: Artifact Versions']);
    // Never requests Name on MJ: Artifacts.
    expect(run15.batchCalls[0][0].Fields).not.toContain('Name');
    expect(run15.access.get(run15.links[0].KeySignature)).toBe('readable');
    expect(run15.access.get(run15.links[1].KeySignature)).toBe('unreadable');
  });

  it('checks non-artifact access using entity CanRead plus PK-only RunView (never fetching record names)', async () => {
    const token = ConversationUtility.CreateRecordLink('Order Lines', 'Order 7 Line 2', { OrderID: '7', LineNumber: 2 });
    const [link] = ExtractDocRecordLinks(token);

    const readable = makeProvider({ entityReadable: true, readableOrderLines: [{ OrderID: '7', LineNumber: 2 }] });
    expect(await CheckDocRecordLinkAccess(link, readable.provider, viewer)).toBe('readable');
    expect(readable.runViewCalls).toHaveLength(1);
    expect(readable.runViewCalls[0].params.ResultType).toBe('simple');
    expect(readable.runViewCalls[0].params.Fields).toEqual(['OrderID', 'LineNumber']);
    expect(readable.runViewCalls[0].params.SkipTotalRowCount).toBe(true);
    expect(readable.runViewCalls[0].user).toBe(viewer);

    const deniedEntity = makeProvider({ entityReadable: false, readableOrderLines: [{ OrderID: '7', LineNumber: 2 }] });
    expect(await CheckDocRecordLinkAccess(link, deniedEntity.provider, viewer)).toBe('unreadable');
    expect(deniedEntity.runViewCalls).toHaveLength(0);
    expect(deniedEntity.runViewsCalls).toHaveLength(0);

    const missingOrRlsFiltered = makeProvider({ entityReadable: true, readableOrderLines: [] });
    expect(await CheckDocRecordLinkAccess(link, missingOrRlsFiltered.provider, viewer)).toBe('unreadable');
  });

  it('batches multiple links to the same single-PK entity into one IN RunView projecting only the PK column', async () => {
    const id1 = '11111111-1111-4111-8111-111111111111';
    const id2 = '22222222-2222-4222-8222-222222222222';
    const id3 = '33333333-3333-4333-8333-333333333333';
    const id4 = '44444444-4444-4444-8444-444444444444';
    const links = ExtractDocRecordLinks(
      [
        ConversationUtility.CreateRecordLink('Accounts', 'Acme', { ID: id1 }),
        ConversationUtility.CreateRecordLink('Accounts', 'Beta', { ID: id2 }),
        ConversationUtility.CreateRecordLink('Accounts', 'Gamma', { ID: id3 }),
        ConversationUtility.CreateRecordLink('Accounts', 'Delta', { ID: id4 }),
      ].join(' '),
    );

    // SQL Server uppercase vs token lowercase must match case-insensitively.
    const { provider, runViewCalls, runViewsCalls } = makeProvider({
      readableAccountIds: [id1.toUpperCase(), id3],
    });
    const batch = await CheckDocRecordLinksAccessBatch(links, provider, viewer);

    expect(runViewCalls).toHaveLength(1);
    expect(runViewsCalls).toHaveLength(0);
    expect(runViewCalls[0].params.EntityName).toBe('Accounts');
    expect(runViewCalls[0].params.Fields).toEqual(['ID']);
    expect(runViewCalls[0].params.ExtraFilter).toContain('[ID] IN (');
    expect(runViewCalls[0].params.ExtraFilter).toContain(id1);
    expect(runViewCalls[0].params.ExtraFilter).toContain(id4);

    expect(batch.get(links[0].KeySignature)).toBe('readable');
    expect(batch.get(links[1].KeySignature)).toBe('unreadable');
    expect(batch.get(links[2].KeySignature)).toBe('readable');
    expect(batch.get(links[3].KeySignature)).toBe('unreadable');
  });

  it('batches links across multiple non-artifact entities into one RunViews call with one query per readable entity', async () => {
    const acctOk = 'aaaa1111-1111-4111-8111-111111111111';
    const acctDenied = 'bbbb2222-2222-4222-8222-222222222222';
    const links = ExtractDocRecordLinks(
      [
        ConversationUtility.CreateRecordLink('Accounts', 'Acme', { ID: acctOk }),
        ConversationUtility.CreateRecordLink('Accounts', 'Hidden Account', { ID: acctDenied }),
        ConversationUtility.CreateRecordLink('Order Lines', 'Order 7 Line 2', { OrderID: '7', LineNumber: 2 }),
        ConversationUtility.CreateRecordLink('Order Lines', 'Order 9 Line 1', { OrderID: '9', LineNumber: 1 }),
        ConversationUtility.CreateRecordLink('Restricted Records', 'No Entity Perms', { ID: 'r-1' }),
      ].join(' '),
    );

    const { provider, runViewCalls, runViewsCalls } = makeProvider({
      readableAccountIds: [acctOk],
      readableOrderLines: [{ OrderID: '7', LineNumber: 2 }],
    });
    const batch = await CheckDocRecordLinksAccessBatch(links, provider, viewer);

    expect(runViewCalls).toHaveLength(0);
    expect(runViewsCalls).toHaveLength(1);
    expect(runViewsCalls[0].params).toHaveLength(2);
    expect(runViewsCalls[0].params.map((p) => p.EntityName)).toEqual(['Accounts', 'Order Lines']);
    expect(runViewsCalls[0].params[0].Fields).toEqual(['ID']);
    expect(runViewsCalls[0].params[0].ExtraFilter).toContain('[ID] IN (');
    expect(runViewsCalls[0].params[1].Fields).toEqual(['OrderID', 'LineNumber']);
    expect(runViewsCalls[0].params[1].ExtraFilter).toContain(' OR ');

    expect(batch.get(links[0].KeySignature)).toBe('readable');
    expect(batch.get(links[1].KeySignature)).toBe('unreadable');
    expect(batch.get(links[2].KeySignature)).toBe('readable');
    expect(batch.get(links[3].KeySignature)).toBe('unreadable');
    expect(batch.get(links[4].KeySignature)).toBe('unreadable');
  });

  it('strips record-mention tokens to their stored display labels for export while leaving plain text intact', () => {
    const token = ConversationUtility.CreateRecordLink('MJ: Artifacts', 'Pricing Policy', { ID: 'art-1' });
    const markdown = `# Overview\n\nSee ${token} and plain [[Not A Link]].`;
    expect(StripDocRecordLinksToPlainText(markdown)).toBe('# Overview\n\nSee Pricing Policy and plain [[Not A Link]].');
  });

  it('detects active [[ trigger and replaces it with the chosen token', () => {
    expect(FindActiveDocLinkTrigger('See [[Pric')).toEqual({ TriggerStart: 4, Query: 'Pric' });
    expect(FindActiveDocLinkTrigger('See [[')).toEqual({ TriggerStart: 4, Query: '' });
    expect(FindActiveDocLinkTrigger('See [[Closed]] text')).toBeNull();
    expect(FindActiveDocLinkTrigger('See [[Line1\nLine2')).toBeNull();

    const token = ConversationUtility.CreateRecordLink('MJ: Artifacts', 'Pricing Policy', { ID: 'art-1' });
    expect(ReplaceDocLinkTriggerWithToken('See [[Pric', 'Pric', token)).toBe(`See ${token}`);
  });

  it('renders preview links as safe markdown fragment links, skips code blocks, preserves autolinks, and escapes markdown label chars', () => {
    const readableToken = ConversationUtility.CreateRecordLink('MJ: Artifacts', 'Pricing *Policy* [v2]', { ID: 'art-1' });
    const deniedToken = ConversationUtility.CreateRecordLink('MJ: Artifacts', 'Secret Doc', { ID: 'art-2' });
    const codeToken = ConversationUtility.CreateRecordLink('MJ: Artifacts', 'In Code', { ID: 'art-3' });
    const raw = [
      `See ${readableToken}, ${deniedToken}, and <https://example.com>.`,
      `Inline code: \`${codeToken}\`.`,
      '~~~',
      `<b>raw</b> ${codeToken}`,
      '~~~',
    ].join('\n');

    const md = ReplaceDocRecordLinksWithPreviewMarkdown(raw, (link) =>
      link.Keys['ID'] === 'art-1' ? 'readable' : 'unreadable',
    );

    expect(md).toContain(`[Pricing \\*Policy\\* \\[v2\\]](${DOC_LINK_PREVIEW_HREF_READABLE}`);
    expect(md).toContain(`"Open Pricing *Policy* [v2]")`);
    expect(md).toContain(`[Secret Doc](${DOC_LINK_PREVIEW_HREF_UNREADABLE}`);
    expect(md).toContain(`"You don't have access")`);
    expect(md).toContain('<https://example.com>');
    // Tokens inside inline code and ~~~ code fences must stay untouched
    expect(md).toContain(`Inline code: \`${codeToken}\`.`);
    expect(md).toContain(`<b>raw</b> ${codeToken}`);
    expect(md).not.toContain('<span');
  });
});
