import { describe, it, expect } from 'vitest';
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { renderComponentFixture, query, queryAll, text, attr, capture, createFakeProvider, StubDropdownComponent, StubEmptyStateComponent, StubLoadingComponent } from '@memberjunction/ng-test-utils';
import type { RunViewParams } from '@memberjunction/core';
import { ActionsListViewComponent } from './actions-list-view.component';

/**
 * DOM coverage for <mj-actions-list-view> — a data-bound (standalone:false) card list of actions
 * with a search/status/type/category filter bar. It loads Actions + Action Categories via RunView
 * through ProviderToUse in ngOnInit; a createFakeProvider supplies rows keyed by EntityName. The
 * BehaviorSubject filter pipeline debounces search (300ms) so search itself isn't driven here — we
 * assert the initial rendered set, per-card structure, empty state, and the openEntityRecord output.
 * Heavy children (mj-dropdown / mj-empty-state / mj-loading / mjButton) are light standalone stubs.
 * Async ngOnInit flips isLoading, so tests await microtasks then a non-strict detectChanges.
 */

@Component({ standalone: true, selector: 'button[mjButton]', template: '<ng-content></ng-content>' })
class StubButton { @Input() variant = ''; @Input() size = ''; }

const action = (over: Partial<Record<string, unknown>>) =>
  ({ ID: '', Name: '', Description: null, Status: 'Active', Type: 'Custom', CategoryID: null, IconClass: null, CodeApprovalStatus: null, __mj_UpdatedAt: null, ...over });

const category = (over: Partial<Record<string, unknown>>) =>
  ({ ID: '', Name: '', ParentID: null, ...over });

async function render(actions: unknown[], categories: unknown[] = []) {
  const provider = createFakeProvider({
    runViewResults: (p: RunViewParams) => (p.EntityName === 'MJ: Action Categories' ? categories : actions),
  });
  const fixture = renderComponentFixture(ActionsListViewComponent, {
    imports: [CommonModule, FormsModule, StubLoadingComponent, StubEmptyStateComponent, StubDropdownComponent, StubButton],
    declarations: [ActionsListViewComponent],
    inputs: { Provider: provider },
  });
  for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0));
  fixture.detectChanges(false);
  return fixture;
}

describe('ActionsListViewComponent (DOM)', () => {
  it('renders a card per loaded action with its name', async () => {
    const fixture = await render([
      action({ ID: 'a1', Name: 'Send Email' }),
      action({ ID: 'a2', Name: 'Create Invoice' }),
    ]);
    expect(queryAll(fixture, '.action-card').length).toBe(2);
    const names = queryAll(fixture, '.action-name').map(el => el.textContent?.trim());
    expect(names).toEqual(['Send Email', 'Create Invoice']);
  });

  it('shows the results count in the header', async () => {
    const fixture = await render([action({ ID: 'a1', Name: 'Send Email' })]);
    expect(text(fixture, '.results-count')).toContain('1 of 1 actions');
  });

  it('reflects action status color into the status chip data-color attribute', async () => {
    const fixture = await render([action({ ID: 'a1', Name: 'Send Email', Status: 'Disabled' })]);
    expect(attr(fixture, '.action-card .status-chip', 'data-color')).toBe('error');
  });

  it('shows the AI Generated chip only for Generated actions', async () => {
    const fixture = await render([action({ ID: 'a1', Name: 'Gen', Type: 'Generated' })]);
    expect(queryAll(fixture, '.action-card .status-chip').length).toBe(2);
    expect(text(fixture, '.status-chip[data-color="info"]')).toContain('AI Generated');
  });

  it('resolves the category name onto the card detail', async () => {
    const fixture = await render(
      [action({ ID: 'a1', Name: 'Send Email', CategoryID: 'c1' })],
      [category({ ID: 'c1', Name: 'Communication' })],
    );
    expect(text(fixture, '.action-details .detail-item span')).toContain('Communication');
  });

  it('renders the empty state when there are no actions', async () => {
    const fixture = await render([]);
    expect(query(fixture, '.action-card')).toBeNull();
    expect(text(fixture, '.stub-empty')).toBe('No actions found');
  });

  it('emits openEntityRecord when an action card is clicked', async () => {
    const fixture = await render([action({ ID: 'a1', Name: 'Send Email' })]);
    const opened = capture(fixture.componentInstance.openEntityRecord);
    (query(fixture, '.action-card') as HTMLElement).click();
    expect(opened).toEqual([{ entityName: 'MJ: Actions', recordId: 'a1' }]);
  });
});
