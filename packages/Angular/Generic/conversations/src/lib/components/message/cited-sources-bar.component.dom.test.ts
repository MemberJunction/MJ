import { describe, it, expect, vi } from 'vitest';
import type { CompositeKey, EntityInfo, IMetadataProvider } from '@memberjunction/core';
import type { MJConversationDetailEntity } from '@memberjunction/core-entities';
import type { MessageCitation } from '@memberjunction/ai-core-plus';
import { renderComponentFixture } from '@memberjunction/ng-test-utils';
import { CitedSourcesBarComponent } from './cited-sources-bar.component';
import { MessageItemComponent } from './message-item.component';

function buildProvider(entities: Record<string, { icon?: string; primaryKeys: string[] }>): IMetadataProvider {
  return {
    EntityByName: (name: string) => {
      const def = entities[name];
      if (!def) return undefined;
      return {
        Name: name,
        Icon: def.icon ?? null,
        PrimaryKeys: def.primaryKeys.map((pk) => ({ Name: pk })),
      } as unknown as EntityInfo;
    },
  } as unknown as IMetadataProvider;
}

describe('CitedSourcesBarComponent (DOM)', () => {
  const provider = buildProvider({
    'MJ: Tasks': { icon: 'fa-list-check', primaryKeys: ['ID'] },
    'MJ: Users': { icon: 'fa-solid fa-user', primaryKeys: ['ID'] },
    Contacts: { icon: '', primaryKeys: ['ID'] },
  });

  const makeCitations = (count: number): MessageCitation[] =>
    Array.from({ length: count }, (_, idx) => ({
      Index: idx + 1,
      Kind: 'record',
      EntityName: idx % 2 === 0 ? 'MJ: Tasks' : 'MJ: Users',
      RecordID: `rec-${idx + 1}`,
      Keys: { ID: `rec-${idx + 1}` },
      DisplayName: `Source Item ${idx + 1}`,
      RawToken: `[[${idx % 2 === 0 ? 'MJ: Tasks' : 'MJ: Users'}|rec-${idx + 1}|Source Item ${idx + 1}]]`,
    }));

  it('renders header count, up to 4 inline pills, "+K more" / "Show less" toggle, and emits CitationClicked', () => {
    const clicked: MessageCitation[] = [];
    const fixture = renderComponentFixture(CitedSourcesBarComponent, {
      inputs: {
        Provider: provider,
        Citations: makeCitations(6),
      },
    });
    fixture.componentInstance.CitationClicked.subscribe((c) => clicked.push(c));
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.cited-sources-title')?.textContent?.trim()).toBe('Cited Sources (6)');

    // 4 visible inline + "+2 more" toggle
    expect(el.querySelectorAll('.cited-source-pill')).toHaveLength(4);
    const toggle = el.querySelector('.cited-sources-toggle') as HTMLButtonElement | null;
    expect(toggle).not.toBeNull();
    expect(toggle!.textContent?.trim()).toBe('+2 more');

    // Normalized Font Awesome icon class applied from EntityInfo.Icon
    const firstIcon = el.querySelector('.cited-source-pill .cited-source-icon');
    expect(firstIcon?.classList.contains('fa-solid')).toBe(true);
    expect(firstIcon?.classList.contains('fa-list-check')).toBe(true);

    // Expand to show all 6
    toggle!.click();
    fixture.detectChanges();
    expect(el.querySelectorAll('.cited-source-pill')).toHaveLength(6);
    expect(toggle!.textContent?.trim()).toBe('Show less');

    // Click the 5th pill and verify emission
    const pills = Array.from(el.querySelectorAll('.cited-source-pill')) as HTMLButtonElement[];
    pills[4].click();
    expect(clicked).toHaveLength(1);
    expect(clicked[0].Index).toBe(5);
    expect(clicked[0].RecordID).toBe('rec-5');

    // Collapse back to 4
    toggle!.click();
    fixture.detectChanges();
    expect(el.querySelectorAll('.cited-source-pill')).toHaveLength(4);
  });

  it('hides the toggle when 4 or fewer citations are present', () => {
    const fixture = renderComponentFixture(CitedSourcesBarComponent, {
      inputs: {
        Provider: provider,
        Citations: makeCitations(3),
      },
    });
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.cited-source-pill')).toHaveLength(3);
    expect(el.querySelector('.cited-sources-toggle')).toBeNull();
  });
});

describe('MessageItemComponent — inline [[Entity|ID|Label]] citation chips & keyboard activation', () => {
  const provider = buildProvider({
    'MJ: Tasks': { icon: 'fa-solid fa-list-check', primaryKeys: ['ID'] },
    'Space Members': { icon: 'fa-solid fa-users', primaryKeys: ['SpaceID', 'UserID'] },
    LegacyItems: { icon: '', primaryKeys: ['LegacyCode'] },
  });

  function makeMessageItem(messageText: string): {
    item: MessageItemComponent;
    opened: Array<{ entityName: string; compositeKey: CompositeKey }>;
  } {
    const item = Object.create(MessageItemComponent.prototype) as MessageItemComponent;
    const opened: Array<{ entityName: string; compositeKey: CompositeKey }> = [];
    Object.assign(item as unknown as Record<string, unknown>, {
      Provider: provider,
      ShowCitedSources: true,
      message: {
        ID: 'msg-1',
        Role: 'AI',
        Status: 'Complete',
        Message: messageText,
      } as unknown as MJConversationDetailEntity,
      agentService: { ConversationManagerAgentName: 'Sage' },
      mentionAutocomplete: {
        getAvailableAgents: () => [],
        getAvailableUsers: () => [],
        getAvailableEntities: () => [],
        getAvailableQueries: () => [],
        getQueriesEntityIcon: () => 'fa-solid fa-database',
      },
      OpenEntityRecord: {
        emit: (payload: { entityName: string; compositeKey: CompositeKey }) => opened.push(payload),
      },
      DiagnosticRequested: { emit: vi.fn() },
    });
    return { item, opened };
  }

  it('transforms [[EntityName|RecordID|DisplayName]] into clickable focusable .mention-badge.record.citation-chip HTML and caches CitedSources', () => {
    const { item } = makeMessageItem(
      'Reviewed [[MJ: Tasks|task-101|Fix Auth Race]] and [[Space Members|SpaceID=sp-1;UserID=u-2|Alice]], ignoring `[[MJ: Tasks|task-999|Code Example]]`.'
    );

    const html = (item as unknown as { computeDisplayMessage: () => string }).computeDisplayMessage();

    expect(html).toContain('class="mention-badge record citation-chip"');
    expect(html).toContain('role="link"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('data-record-entity="MJ: Tasks"');
    expect(html).toContain('<span class="citation-index">[1]</span>');
    expect(html).toContain('<i class="fa-solid fa-list-check" aria-hidden="true"></i>Fix Auth Race');
    expect(html).toContain('data-record-entity="Space Members"');
    expect(html).toContain('<span class="citation-index">[2]</span>');
    // Code span left untouched
    expect(html).toContain('`[[MJ: Tasks|task-999|Code Example]]`');

    expect(item.CitedSources).toHaveLength(2);
    expect(item.CitedSources[0].DisplayName).toBe('Fix Auth Race');
    expect(item.CitedSources[1].Keys).toEqual({ SpaceID: 'sp-1', UserID: 'u-2' });
  });

  it('activates inline citation chips via both click and Enter/Space keyboard events and emits OpenEntityRecord', () => {
    const { item, opened } = makeMessageItem('See [[MJ: Tasks|task-101|Fix Auth Race]].');
    const html = (item as unknown as { computeDisplayMessage: () => string }).computeDisplayMessage();

    const container = document.createElement('div');
    container.innerHTML = html;
    const chip = container.querySelector('.mention-badge.record.citation-chip') as HTMLElement;
    expect(chip).not.toBeNull();

    // Mouse click
    const clickEvt = {
      target: chip,
      shiftKey: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as MouseEvent;
    item.OnMessageBubbleClick(clickEvt);

    // Keyboard Enter
    const enterEvt = {
      key: 'Enter',
      target: chip,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as KeyboardEvent;
    item.OnMessageBubbleKeydown(enterEvt);

    // Keyboard Space
    const spaceEvt = {
      key: ' ',
      target: chip,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as KeyboardEvent;
    item.OnMessageBubbleKeydown(spaceEvt);

    expect(opened).toHaveLength(3);
    for (const call of opened) {
      expect(call.entityName).toBe('MJ: Tasks');
      expect(call.compositeKey.KeyValuePairs).toEqual([{ FieldName: 'ID', Value: 'task-101' }]);
    }
  });

  it('emits OpenEntityRecord from OnCitedSourceClicked including non-ID single-PK entities', () => {
    const { item, opened } = makeMessageItem('Item [[LegacyItems|CODE-42|Widget 42]].');
    const [citation] = item.CitedSources;

    item.OnCitedSourceClicked(citation);

    expect(opened).toHaveLength(1);
    expect(opened[0].entityName).toBe('LegacyItems');
    expect(opened[0].compositeKey.KeyValuePairs).toEqual([
      { FieldName: 'LegacyCode', Value: 'CODE-42' },
    ]);
  });
});
