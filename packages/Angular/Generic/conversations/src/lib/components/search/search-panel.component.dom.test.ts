import { describe, it, expect, vi, afterEach } from 'vitest';
import { FormsModule } from '@angular/forms';
import { ComponentFixture } from '@angular/core/testing';
import { renderComponentFixture, queryAll, useFakeGlobalProvider } from '@memberjunction/ng-test-utils';
import { RunViewParams, UserInfo } from '@memberjunction/core';
import { ConversationEngine } from '@memberjunction/core-entities';
import { SearchPanelComponent } from './search-panel.component';

/**
 * DOM spec for <mj-search-panel>. SearchService reads the GLOBAL Metadata.Provider (it has
 * no Provider input), so the fake is installed globally rather than bound as an input.
 */
const CONVERSATIONS = [
  { ID: 'c1', Name: 'Poem About MemberJunction', Description: 'a poem', EnvironmentID: 'env1' },
  { ID: 'c2', Name: 'Query Builder Model Ranking', Description: null, EnvironmentID: 'env1' },
];

describe('SearchPanelComponent (DOM, data-bound)', () => {
  const installProvider = useFakeGlobalProvider();

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function render(extraInputs: Record<string, unknown> = {}): ComponentFixture<SearchPanelComponent> {
    // Only the conversations query returns rows; everything else comes back empty, which
    // is the shape of a realistic partial-hit search.
    installProvider({
      runViewResults: (params: RunViewParams) =>
        params.EntityName === 'MJ: Conversations' ? CONVERSATIONS : [],
    });
    // The visibility rule has its own specs; here it only has to produce a filter.
    vi.spyOn(ConversationEngine.Instance, 'GetVisibleConversationsFilter').mockResolvedValue("EnvironmentID='env1'");

    return renderComponentFixture(SearchPanelComponent, {
      imports: [FormsModule],
      inputs: {
        ...extraInputs,
        isOpen: true,
        environmentId: 'env1',
        currentUser: { ID: 'me', Name: 'Me' } as unknown as UserInfo,
      },
    });
  }

  // What the template's (input)="onSearchInput()" does: set the bound field, then fire the
  // same handler. Deliberately NOT calling the private async method — this is the path a
  // real keystroke takes.
  const type = (f: ComponentFixture<SearchPanelComponent>, q: string): void => {
    f.componentInstance.searchQuery = q;
    f.componentInstance.onSearchInput();
  };

  // Nothing calls f.detectChanges() after the search settles: the panel must render the
  // results by itself, with no DOM event to start a change-detection pass.
  it('renders results after typing a query', async () => {
    const f = render();
    type(f, 'poem');

    // onSearchInput fire-and-forgets an async search; let it settle.
    await new Promise((r) => setTimeout(r, 0));

    expect(queryAll(f, '.result-item').length).toBe(CONVERSATIONS.length);
  });

  it('exposes the searched results on the component', async () => {
    const f = render();
    type(f, 'poem');
    await new Promise((r) => setTimeout(r, 0));

    expect(f.componentInstance.results.total).toBe(CONVERSATIONS.length);
    expect(f.componentInstance.results.conversations.length).toBe(CONVERSATIONS.length);
  });

  // The real keystroke path: the browser sets .value and dispatches 'input', which drives
  // BOTH ngModel's value accessor and the template's (input)="onSearchInput()". The tests
  // above call the handler directly and so cannot catch a break between the two.
  it('runs a search from a real DOM input event', async () => {
    const f = render();
    f.detectChanges();

    const input = f.nativeElement.querySelector('.search-input') as HTMLInputElement;
    expect(input).toBeTruthy();

    input.value = 'poem';
    input.dispatchEvent(new Event('input'));
    f.detectChanges();

    // If ngModel did not write through before the handler ran, the component still holds ''.
    expect(f.componentInstance.searchQuery).toBe('poem');

    await new Promise((r) => setTimeout(r, 0));

    expect(queryAll(f, '.result-item').length).toBe(CONVERSATIONS.length);
  });

  it('searches for InitialQuery when the panel opens', async () => {
    const f = render({ InitialQuery: '  poem  ' });

    // One task for the deferred seed, one for the search it starts.
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(f.componentInstance.SearchQuery).toBe('poem');
    expect(queryAll(f, '.result-item').length).toBe(CONVERSATIONS.length);
  });
});

describe('SearchPanelComponent (DOM) message hits in a fork', () => {
  const installProvider = useFakeGlobalProvider();
  const CREATED = new Date('2026-10-01T00:00:00Z');
  const MESSAGES = [
    { ID: 'm-fork', ConversationID: 'c1', Conversation: 'Poems', Message: 'poem in a fork', BranchID: 'B1', Sequence: 4, __mj_CreatedAt: CREATED },
    { ID: 'm-main', ConversationID: 'c1', Conversation: 'Poems', Message: 'poem in Main', BranchID: null, Sequence: 2, __mj_CreatedAt: CREATED },
    { ID: 'm-unloaded', ConversationID: 'c-uncached', Conversation: 'Old', Message: 'poem in a fork of a conversation the engine has not loaded', BranchID: 'B9', Sequence: 1, __mj_CreatedAt: CREATED },
  ];

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function searchMessages(): Promise<ComponentFixture<SearchPanelComponent>> {
    installProvider({
      runViewResults: (params: RunViewParams) =>
        params.EntityName === 'MJ: Conversations' ? CONVERSATIONS
          : params.EntityName === 'MJ: Conversation Details' ? MESSAGES
          : [],
    });
    vi.spyOn(ConversationEngine.Instance, 'GetVisibleConversationsFilter').mockResolvedValue("EnvironmentID='env1'");

    const f = renderComponentFixture(SearchPanelComponent, {
      imports: [FormsModule],
      inputs: { isOpen: true, environmentId: 'env1', currentUser: { ID: 'me', Name: 'Me' } as unknown as UserInfo },
    });
    f.componentInstance.setFilter('messages');
    f.componentInstance.searchQuery = 'poem';
    f.componentInstance.onSearchInput();
    await new Promise((r) => setTimeout(r, 0));
    f.detectChanges();
    return f;
  }

  /** The fork tag of each message hit, keyed by its preview text. */
  function tagsByPreview(f: ComponentFixture<SearchPanelComponent>): Record<string, { Text: string; Title: string | null } | null> {
    const tags: Record<string, { Text: string; Title: string | null } | null> = {};
    for (const item of queryAll(f, '.result-item')) {
      const preview = item.querySelector('.result-preview')?.textContent?.trim() ?? '';
      const tag = item.querySelector('.branch-tag');
      tags[preview] = tag ? { Text: tag.textContent?.trim() ?? '', Title: tag.getAttribute('title') } : null;
    }
    return tags;
  }

  it('tags a hit in a fork', async () => {
    const f = await searchMessages();

    expect(tagsByPreview(f)['poem in a fork']).toEqual({ Text: 'in a fork', Title: 'Opening this message opens its fork' });
  });

  it('shows no tag for a hit in Main', async () => {
    const f = await searchMessages();

    expect(tagsByPreview(f)['poem in Main']).toBeNull();
  });

  it('tags a fork hit of a conversation the engine has not loaded', async () => {
    const f = await searchMessages();

    expect(tagsByPreview(f)['poem in a fork of a conversation the engine has not loaded']?.Text).toBe('in a fork');
  });
});
