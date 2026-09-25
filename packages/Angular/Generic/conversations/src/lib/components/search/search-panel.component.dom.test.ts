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
