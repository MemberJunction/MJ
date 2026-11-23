import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConversationUtility } from '@memberjunction/ai-core-plus';
import { type IMetadataProvider, type RunViewParams, type UserInfo } from '@memberjunction/core';
import { ArtifactPermissionEngine } from '@memberjunction/core-entities';
import {
  CheckDocRecordLinkAccess,
  CheckDocRecordLinksAccessBatch,
  ExtractDocRecordLinks,
  FindActiveDocLinkTrigger,
  RenderDocRecordLinkChipHtml,
  ReplaceDocLinkTriggerWithToken,
  ReplaceDocRecordLinksWithChipHtml,
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

  it('checks artifact access through ArtifactPermissionEngine without ever querying the target artifact name', async () => {
    const token = ConversationUtility.CreateRecordLink('MJ: Artifacts', 'Old Title', { ID: 'art-99' });
    const [link] = ExtractDocRecordLinks(token);
    const { provider, runViewCalls } = makeProvider();

    const permSpy = vi
      .spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions')
      .mockResolvedValueOnce({ ArtifactID: 'art-99', CanRead: true, CanEdit: false, CanDelete: false, CanShare: false, Source: 'ArtifactPermission', Reason: 'Shared' })
      .mockResolvedValueOnce({ ArtifactID: 'art-99', CanRead: false, CanEdit: false, CanDelete: false, CanShare: false, Source: 'Denied', Reason: 'No access' });

    expect(await CheckDocRecordLinkAccess(link, provider, viewer)).toBe('readable');
    expect(await CheckDocRecordLinkAccess(link, provider, viewer)).toBe('unreadable');
    expect(permSpy).toHaveBeenCalledTimes(2);
    // Never issues a RunView to fetch the target artifact's current title.
    expect(runViewCalls).toHaveLength(0);
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

  it('escapes raw HTML tags outside inline code when rendering preview chips', () => {
    const token = ConversationUtility.CreateRecordLink('MJ: Artifacts', 'Pricing Policy', { ID: 'art-1' });
    const raw = `<b>bold</b> <style>x</style> \`<span>code</span>\` ${token}`;
    const html = ReplaceDocRecordLinksWithChipHtml(raw, () => 'readable', { EscapeRawHtml: true });

    expect(html).toContain('&lt;b>bold&lt;/b>');
    expect(html).toContain('&lt;style>x&lt;/style>');
    expect(html).toContain('`<span>code</span>`');
    expect(html).toContain('<span class="mj-doc-link-chip mj-doc-link-chip--readable"');
  });
});
