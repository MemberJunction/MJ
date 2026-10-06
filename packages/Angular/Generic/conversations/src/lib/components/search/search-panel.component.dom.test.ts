import { describe, it, expect, vi, afterEach } from 'vitest';
import { FormsModule } from '@angular/forms';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { renderComponentFixture, queryAll, useFakeGlobalProvider } from '@memberjunction/ng-test-utils';
import { RunViewParams, UserInfo } from '@memberjunction/core';
import { ConversationEngine, type ConversationBranchRow, type MJConversationEntity } from '@memberjunction/core-entities';
import { SearchPanelComponent } from './search-panel.component';
import { ConversationScopeService } from '../../services/conversation-scope.service';

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

describe('SearchPanelComponent (DOM) message hits on another branch', () => {
  const installProvider = useFakeGlobalProvider();
  const CREATED = new Date('2026-10-01T00:00:00Z');
  /** c1 shows branch B1, forked from the trunk after Sequence 2; B2 is a sibling of B1. */
  const BRANCH_ROWS: ConversationBranchRow[] = [
    { ID: 'B1', ConversationID: 'c1', ParentBranchID: null, ForkFromSequence: 2, Name: null },
    { ID: 'B2', ConversationID: 'c1', ParentBranchID: null, ForkFromSequence: 2, Name: null },
  ];
  const MESSAGES = [
    { ID: 'm-current', ConversationID: 'c1', Conversation: 'Poems', Message: 'poem on the current branch', BranchID: 'B1', Sequence: 4, __mj_CreatedAt: CREATED },
    { ID: 'm-case', ConversationID: 'c1', Conversation: 'Poems', Message: 'poem with upper-case branch id', BranchID: 'b1', Sequence: 5, __mj_CreatedAt: CREATED },
    { ID: 'm-ancestor', ConversationID: 'c1', Conversation: 'Poems', Message: 'poem on the trunk before the fork', BranchID: null, Sequence: 2, __mj_CreatedAt: CREATED },
    { ID: 'm-trunk', ConversationID: 'c1', Conversation: 'Poems', Message: 'poem on the trunk after the fork', BranchID: null, Sequence: 6, __mj_CreatedAt: CREATED },
    { ID: 'm-sibling', ConversationID: 'c1', Conversation: 'Poems', Message: 'poem on a sibling branch', BranchID: 'B2', Sequence: 3, __mj_CreatedAt: CREATED },
    { ID: 'm-unknown', ConversationID: 'c-uncached', Conversation: 'Old', Message: 'poem in a conversation the engine has not loaded', BranchID: 'B9', Sequence: 1, __mj_CreatedAt: CREATED },
  ];

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function searchMessages(registerRows = true): Promise<ComponentFixture<SearchPanelComponent>> {
    installProvider({
      runViewResults: (params: RunViewParams) =>
        params.EntityName === 'MJ: Conversations' ? CONVERSATIONS
          : params.EntityName === 'MJ: Conversation Details' ? MESSAGES
          : [],
    });
    vi.spyOn(ConversationEngine.Instance, 'GetVisibleConversationsFilter').mockResolvedValue("EnvironmentID='env1'");
    vi.spyOn(ConversationEngine.Instance, 'GetConversation').mockImplementation((id: string) =>
      id === 'c1' ? ({ ID: 'c1', CurrentBranchID: 'B1' } as MJConversationEntity) : undefined
    );

    const f = renderComponentFixture(SearchPanelComponent, {
      imports: [FormsModule],
      inputs: { isOpen: true, environmentId: 'env1', currentUser: { ID: 'me', Name: 'Me' } as unknown as UserInfo },
    });
    if (registerRows) {
      // The chat area registers the rows in the app; any object stands in for it here.
      TestBed.inject(ConversationScopeService).SetBranches('c1', BRANCH_ROWS, {});
    }
    f.componentInstance.setFilter('messages');
    f.componentInstance.searchQuery = 'poem';
    f.componentInstance.onSearchInput();
    await new Promise((r) => setTimeout(r, 0));
    f.detectChanges();
    return f;
  }

  /** The "on another branch" tag text of each message hit, keyed by its preview text. */
  function tagsByPreview(f: ComponentFixture<SearchPanelComponent>): Record<string, string | null> {
    const tags: Record<string, string | null> = {};
    for (const item of queryAll(f, '.result-item')) {
      const preview = item.querySelector('.result-preview')?.textContent?.trim() ?? '';
      tags[preview] = item.querySelector('.branch-tag')?.textContent?.trim() ?? null;
    }
    return tags;
  }

  it('tags a hit that is not on the current branch path: a trunk row after the fork, a sibling branch row', async () => {
    const f = await searchMessages();

    const tags = tagsByPreview(f);
    expect(tags['poem on the trunk after the fork']).toBe('on another branch');
    expect(tags['poem on a sibling branch']).toBe('on another branch');
  });

  it('shows no tag for a trunk row before the fork point, which is on the branch path', async () => {
    const f = await searchMessages();

    expect(tagsByPreview(f)['poem on the trunk before the fork']).toBeNull();
  });

  it('shows no tag for a hit on the current branch, comparing ids without case', async () => {
    const f = await searchMessages();

    const tags = tagsByPreview(f);
    expect(tags['poem on the current branch']).toBeNull();
    expect(tags['poem with upper-case branch id']).toBeNull();
  });

  it('compares branch ids when the branch rows are not registered', async () => {
    const f = await searchMessages(false);

    const tags = tagsByPreview(f);
    expect(tags['poem on the trunk before the fork']).toBe('on another branch');
    expect(tags['poem on the current branch']).toBeNull();
  });

  it('shows no tag when the conversation is not loaded in the engine', async () => {
    const f = await searchMessages();

    expect(tagsByPreview(f)['poem in a conversation the engine has not loaded']).toBeNull();
  });
});
