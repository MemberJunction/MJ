import { describe, it, expect } from 'vitest';
import { ComponentFixture } from '@angular/core/testing';
import { renderComponentFixture, query, queryAll, text, click, capture, createFakeProvider } from '@memberjunction/ng-test-utils';
import { UserPickerComponent } from './user-picker.component';

/**
 * DOM-level spec for <user-picker> — the first DATA-BOUND component test. It loads users
 * via RunView.FromMetadataProvider(ProviderToUse), so we inject a fake provider
 * (createFakeProvider) whose RunView returns canned rows — no backend.
 *
 * Note: onSearch() is sync and fire-and-forgets the async performSearch(), so we await
 * performSearch directly for deterministic results (onSearch's guard is tested separately).
 */
const USERS = [
  { ID: 'u1', Name: 'Ada Lovelace', Email: 'ada@example.com', FirstName: 'Ada', LastName: 'Lovelace' },
  { ID: 'u2', Name: 'Alan Turing', Email: 'alan@example.com', FirstName: 'Alan', LastName: 'Turing' },
];

describe('UserPickerComponent (DOM, data-bound)', () => {
  function render(): ComponentFixture<UserPickerComponent> {
    return renderComponentFixture(UserPickerComponent, {
      inputs: {
        Provider: createFakeProvider({ runViewResults: USERS }),
        currentUser: { ID: 'me', Name: 'Me' },
      },
    });
  }

  // performSearch is the async data method onSearch fires-and-forgets; await it directly.
  const search = (f: ComponentFixture<UserPickerComponent>, q: string): Promise<void> =>
    (f.componentInstance as unknown as { performSearch(query: string): Promise<void> }).performSearch(q);

  it('renders the users returned by the faked provider after a search', async () => {
    const f = render();
    await search(f, 'la');
    f.detectChanges();

    expect(queryAll(f, '.user-search-item').length).toBe(2);
    expect(text(f, '.user-name')).toBe('Ada Lovelace');
  });

  it('emits userSelected when a result is clicked', async () => {
    const f = render();
    await search(f, 'la');
    f.detectChanges();

    const picked = capture(f.componentInstance.userSelected);
    click(f, '.user-search-item'); // first result

    expect(picked).toHaveLength(1);
    expect(picked[0].name).toBe('Ada Lovelace');
  });

  it('does not search for queries shorter than 2 characters', () => {
    // set the bound searchQuery BEFORE the first render (zoneless §5: no mutate-then-detectChanges)
    const f = renderComponentFixture(UserPickerComponent, {
      inputs: { Provider: createFakeProvider({ runViewResults: USERS }), currentUser: { ID: 'me', Name: 'Me' } },
      setup: (c) => {
        c.searchQuery = 'a';
      },
    });
    f.componentInstance.onSearch(); // guard: short query → no search, no dropdown

    expect(query(f, '.search-results-dropdown')).toBeNull();
  });
});
