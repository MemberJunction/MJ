import { Component } from '@angular/core';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CompositeKey, EntityInfo, IMetadataProvider } from '@memberjunction/core';
import { ConversationEngine, type MJConversationDetailEntity } from '@memberjunction/core-entities';
import type { MessageCitation } from '@memberjunction/ai-core-plus';
import { renderComponentFixture } from '@memberjunction/ng-test-utils';
import { CitedSourcesBarComponent } from './cited-sources-bar.component';
import { MessageItemComponent } from './message-item.component';
import type { MJChatCitationTransform } from '../slots/slot-interfaces';

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

  it('supports custom PillTemplate (mjChatSlot="citedSourcePill") while preserving overflow toggle', () => {
    @Component({
      standalone: true,
      imports: [CitedSourcesBarComponent],
      template: `
        <ng-template #customPill let-citation let-icon="icon" let-open="open">
          <button type="button" class="custom-source-pill" (click)="open($event)">
            <i [class]="icon"></i>
            <span>{{ citation.DisplayName }}</span>
          </button>
        </ng-template>
        <mj-cited-sources-bar
          [Provider]="Provider"
          [Citations]="Citations"
          [PillTemplate]="customPill"
          (CitationClicked)="OnClicked($event)">
        </mj-cited-sources-bar>
      `,
    })
    class PillTemplateHostComponent {
      public Provider = provider;
      public Citations = makeCitations(5);
      public Clicked: MessageCitation[] = [];
      public OnClicked(c: MessageCitation): void {
        this.Clicked.push(c);
      }
    }

    const fixture = renderComponentFixture(PillTemplateHostComponent);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.cited-source-pill')).toHaveLength(0);
    expect(el.querySelectorAll('.custom-source-pill')).toHaveLength(4);
    expect(el.querySelector('.cited-sources-toggle')?.textContent?.trim()).toBe('+1 more');

    const firstCustomPill = el.querySelector('.custom-source-pill') as HTMLButtonElement;
    firstCustomPill.click();
    expect(fixture.componentInstance.Clicked).toHaveLength(1);
    expect(fixture.componentInstance.Clicked[0].DisplayName).toBe('Source Item 1');
  });
});

describe('MessageItemComponent — inline [[Entity|ID|Label]] citation chips, customization hooks & WeakMap cache', () => {
  const provider = buildProvider({
    'MJ: Tasks': { icon: 'fa-solid fa-list-check', primaryKeys: ['ID'] },
    'Space Members': { icon: 'fa-solid fa-users', primaryKeys: ['SpaceID', 'UserID'] },
    LegacyItems: { icon: '', primaryKeys: ['LegacyCode'] },
  });

  beforeEach(() => {
    ConversationEngine.Instance.ClearCache();
  });

  function makeMessageItem(
    messageText: string,
    overrides?: Partial<{
      ShowCitedSources: boolean;
      EnableInlineCitations: boolean;
      CitationTransform: MJChatCitationTransform;
      OpenLinksInNewTab: boolean;
    }>
  ): {
    item: MessageItemComponent;
    opened: Array<{ entityName: string; compositeKey: CompositeKey }>;
    artifactsOpened: Array<{ artifactId: string; versionId?: string }>;
  } {
    const item = Object.create(MessageItemComponent.prototype) as MessageItemComponent;
    const opened: Array<{ entityName: string; compositeKey: CompositeKey }> = [];
    const artifactsOpened: Array<{ artifactId: string; versionId?: string }> = [];
    Object.assign(item as unknown as Record<string, unknown>, {
      Provider: provider,
      ShowCitedSources: overrides?.ShowCitedSources ?? true,
      EnableInlineCitations: overrides?.EnableInlineCitations ?? true,
      CitationTransform: overrides?.CitationTransform,
      OpenLinksInNewTab: overrides?.OpenLinksInNewTab ?? true,
      message: {
        ID: 'msg-1',
        ConversationID: 'conv-1',
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
      ArtifactClicked: {
        emit: (payload: { artifactId: string; versionId?: string }) => artifactsOpened.push(payload),
      },
      DiagnosticRequested: { emit: vi.fn() },
      OpenCitationBound: (citation: MessageCitation) => item.OnCitedSourceClicked(citation),
    });
    return { item, opened, artifactsOpened };
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

  it('respects EnableInlineCitations=false without stripping CitedSources and recomputes when toggled back on', () => {
    const { item } = makeMessageItem('Review [[MJ: Tasks|task-101|Fix Auth Race]] today.', {
      EnableInlineCitations: false,
    });

    const disabledHtml = (item as unknown as { computeDisplayMessage: () => string }).computeDisplayMessage();
    expect(disabledHtml).not.toContain('citation-chip');
    expect(disabledHtml).toContain('[[MJ: Tasks|task-101|Fix Auth Race]]');
    // Footer citations are still available independently of inline chip rendering
    expect(item.CitedSources).toHaveLength(1);
    expect(item.CitedSources[0].DisplayName).toBe('Fix Auth Race');

    // Re-enabling invalidates cached display HTML immediately
    item.EnableInlineCitations = true;
    const enabledHtml = (item as unknown as { computeDisplayMessage: () => string }).computeDisplayMessage();
    expect(enabledHtml).toContain('class="mention-badge record citation-chip"');
  });

  it('applies CitationTransform to filter, relabel, and append custom URL/artifact citations and routes clicks', () => {
    const transform: MJChatCitationTransform = (citations, msg) => [
      ...citations.map((c) => ({ ...c, DisplayName: `${c.DisplayName} (${msg.ID})` })),
      {
        Index: citations.length + 1,
        Kind: 'artifact',
        ArtifactID: 'art-77',
        DisplayName: 'Q4 Summary Deck',
        RawToken: 'artifact:art-77',
      },
      {
        Index: citations.length + 2,
        Kind: 'url',
        Url: 'https://docs.memberjunction.org/citations',
        DisplayName: 'MJ Docs',
        RawToken: 'https://docs.memberjunction.org/citations',
      },
    ];

    const { item, artifactsOpened } = makeMessageItem('Check [[MJ: Tasks|task-101|Fix Auth Race]].', {
      CitationTransform: transform,
    });

    const sources = item.CitedSources;
    expect(sources).toHaveLength(3);
    expect(sources[0].DisplayName).toBe('Fix Auth Race (msg-1)');
    expect(sources[1].Kind).toBe('artifact');
    expect(sources[2].Kind).toBe('url');

    // Artifact citation click emits ArtifactClicked
    item.OnCitedSourceClicked(sources[1]);
    expect(artifactsOpened).toEqual([{ artifactId: 'art-77' }]);

    // External HTTPS URL opens safely in a new tab; javascript: scheme is blocked
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    try {
      item.OnCitedSourceClicked(sources[2]);
      expect(openSpy).toHaveBeenCalledWith(
        'https://docs.memberjunction.org/citations',
        '_blank',
        'noopener,noreferrer'
      );

      item.OnCitedSourceClicked({
        Index: 4,
        Kind: 'url',
        Url: 'javascript:alert(1)',
        DisplayName: 'Bad Link',
        RawToken: 'javascript:alert(1)',
      });
      expect(openSpy).toHaveBeenCalledTimes(1);
    } finally {
      openSpy.mockRestore();
    }
  });

  it('exposes strongly-typed GetCitedSourcesTemplateContext (mjChatSlot="citedSources") with working openCitation callback and respects ShowCitedSources=false', () => {
    const { item, opened } = makeMessageItem('See [[MJ: Tasks|task-101|Fix Auth Race]].', {
      ShowCitedSources: false,
    });

    expect(item.ShowCitedSources).toBe(false);
    const ctx = item.GetCitedSourcesTemplateContext();
    expect(ctx.$implicit).toBe(ctx.citations);
    expect(ctx.citations).toHaveLength(1);
    expect(ctx.message.ID).toBe('msg-1');

    ctx.openCitation(ctx.citations[0]);
    expect(opened).toHaveLength(1);
    expect(opened[0].entityName).toBe('MJ: Tasks');
  });

  it('hits ConversationEngine WeakMap citation cache across repeated parses and component instances without re-parsing', () => {
    const sharedDetail = {
      ID: 'detail-cache-1',
      ConversationID: 'conv-cache-1',
      Role: 'AI',
      Status: 'Complete',
      Message: 'See [[MJ: Tasks|task-101|Cached Task]].',
    } as unknown as MJConversationDetailEntity;

    const { item: overlayItem } = makeMessageItem(sharedDetail.Message);
    overlayItem.message = sharedDetail;
    const { item: workspaceItem } = makeMessageItem(sharedDetail.Message);
    workspaceItem.message = sharedDetail;

    const spy = vi.spyOn(ConversationEngine.Instance, 'GetOrComputeMessageCitations');
    try {
      const overlayCitations = overlayItem.CitedSources;
      const workspaceCitations = workspaceItem.CitedSources;
      // Same underlying WeakMap-memoized Citations array reference across both components
      expect(workspaceCitations).toBe(overlayCitations);
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
