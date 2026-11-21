import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConversationUtility } from '@memberjunction/ai-core-plus';
import { type IMetadataProvider, type RunViewParams, type UserInfo } from '@memberjunction/core';
import { ArtifactPermissionEngine } from '@memberjunction/core-entities';
import {
  CheckDocRecordLinkAccess,
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
  recordCount?: number;
} = {}) {
  const runViewCalls: Array<{ params: RunViewParams; user?: UserInfo }> = [];
  const entities: Record<
    string,
    {
      ID: string;
      Name: string;
      PrimaryKeys: Array<{ Name: string }>;
      GetUserPermisions: (u: UserInfo) => { CanRead: boolean };
    }
  > = {
    'MJ: Artifacts': {
      ID: 'ent-art',
      Name: 'MJ: Artifacts',
      PrimaryKeys: [{ Name: 'ID' }],
      GetUserPermisions: () => ({ CanRead: true }),
    },
    'Order Lines': {
      ID: 'ent-order-lines',
      Name: 'Order Lines',
      PrimaryKeys: [{ Name: 'OrderID' }, { Name: 'LineNumber' }],
      GetUserPermisions: () => ({ CanRead: options.entityReadable ?? true }),
    },
  };
  const provider = {
    EntityByName: (name: string) => entities[name],
    RunView: async (params: RunViewParams, contextUser?: UserInfo) => {
      runViewCalls.push({ params, user: contextUser });
      return {
        Success: true,
        Results: [],
        RowCount: 0,
        TotalRowCount: options.recordCount ?? 1,
        ExecutionTime: 0,
        ErrorMessage: '',
        UserViewRunID: '',
      };
    },
  } as unknown as IMetadataProvider;
  return { provider, runViewCalls };
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

  it('checks non-artifact access using entity CanRead plus count_only RunView (never fetching record fields)', async () => {
    const token = ConversationUtility.CreateRecordLink('Order Lines', 'Order 7 Line 2', { OrderID: '7', LineNumber: 2 });
    const [link] = ExtractDocRecordLinks(token);

    const readable = makeProvider({ entityReadable: true, recordCount: 1 });
    expect(await CheckDocRecordLinkAccess(link, readable.provider, viewer)).toBe('readable');
    expect(readable.runViewCalls).toHaveLength(1);
    expect(readable.runViewCalls[0].params.ResultType).toBe('count_only');
    expect(readable.runViewCalls[0].user).toBe(viewer);

    const deniedEntity = makeProvider({ entityReadable: false, recordCount: 1 });
    expect(await CheckDocRecordLinkAccess(link, deniedEntity.provider, viewer)).toBe('unreadable');
    expect(deniedEntity.runViewCalls).toHaveLength(0);

    const missingOrRlsFiltered = makeProvider({ entityReadable: true, recordCount: 0 });
    expect(await CheckDocRecordLinkAccess(link, missingOrRlsFiltered.provider, viewer)).toBe('unreadable');
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
