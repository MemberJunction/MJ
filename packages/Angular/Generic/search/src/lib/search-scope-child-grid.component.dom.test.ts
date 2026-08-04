import { describe, it, expect } from 'vitest';
import type { BaseEntity } from '@memberjunction/core';
import { renderComponentFixture, query, queryAll, text, capture } from '@memberjunction/ng-test-utils';
import { SearchScopeChildGridComponent, SearchScopeChildGridColumn } from './search-scope-child-grid.component';

/**
 * DOM coverage for <mj-search-scope-child-grid> — the reusable editable child-row grid used to attach
 * providers/scopes to a parent record (~6×). Its load path (LoadRows) needs a provider, so these leave
 * ParentID unset (no load) and drive the public Rows/IsLoading/LoadError state directly (default change
 * detection, so no OnPush gotcha). Covers the loading / error / empty / populated render branches, the
 * column headers + text cell values, the Disabled read-only mode, and the client-side RemoveRow path
 * for an unsaved row (no server delete → row dropped + RowRemoved/RowsChanged emitted).
 */

const COLUMNS: SearchScopeChildGridColumn[] = [
  { Field: 'ProviderName', Label: 'Provider', Type: 'text' },
  { Field: 'Weight', Label: 'Weight', Type: 'number' },
];

/** A minimal BaseEntity-shaped stub: GetCellValue reads Get(field); RemoveRow branches on IsSaved. */
const fakeEntity = (values: Record<string, unknown>, isSaved = false) =>
  ({ Get: (f: string) => values[f], IsSaved: isSaved } as unknown as BaseEntity);

type Comp = SearchScopeChildGridComponent;
type Row = Comp['Rows'][number];
const row = (values: Record<string, unknown>, isSaved = false): Row =>
  ({ Entity: fakeEntity(values, isSaved), LookupLabels: {}, Saving: false } as unknown as Row);

interface State { Rows?: Row[]; IsLoading?: boolean; LoadError?: string | null; Disabled?: boolean }
function render(state: State = {}, inputs: Record<string, unknown> = {}) {
  return renderComponentFixture(SearchScopeChildGridComponent, {
    declarations: [SearchScopeChildGridComponent],
    inputs: { Columns: COLUMNS, ChildEntityName: 'MJ: Search Scope Providers', ...inputs },
    // set state before the first CD (no ngOnInit / ParentID load resets it) so it renders reliably
    setup: (c) => {
      if (state.Rows) c.Rows = state.Rows;
      if (state.IsLoading != null) c.IsLoading = state.IsLoading;
      if (state.LoadError != null) c.LoadError = state.LoadError;
      if (state.Disabled != null) c.Disabled = state.Disabled;
    },
  });
}
type Fx = ReturnType<typeof render>;

describe('SearchScopeChildGridComponent (DOM)', () => {
  it('shows the empty message when there are no rows', () => {
    const f = render({ Rows: [] }, { EmptyMessage: 'Nothing attached yet.' });
    expect(text(f, '.scope-grid-empty')).toBe('Nothing attached yet.');
  });

  it('renders a column header per configured column', () => {
    const f = render({ Rows: [] });
    const headers = queryAll(f, '.scope-grid-table thead th').map((th) => th.textContent?.trim()).filter(Boolean);
    expect(headers).toEqual(['Provider', 'Weight']);
  });

  it('renders one row per Rows entry with the cell values from the entity', () => {
    const f = render({ Rows: [row({ ProviderName: 'Vector', Weight: 5 }), row({ ProviderName: 'FTS', Weight: 2 })] });
    expect(queryAll(f, 'tbody tr').length).toBe(2);
    const firstText = (query(f, 'tbody tr .scope-grid-input') as HTMLInputElement)?.value;
    expect(firstText).toBe('Vector');
  });

  it('shows the loading indicator when IsLoading is set', () => {
    expect(query(render({ IsLoading: true }), '.scope-grid-loading')).not.toBeNull();
  });

  it('shows the error state when LoadError is set', () => {
    expect(query(render({ LoadError: 'boom' }), '.scope-grid-error')).not.toBeNull();
  });

  it('renders the add button with its label when not disabled', () => {
    const f = render({ Rows: [] }, { AddButtonLabel: '+ Add provider' });
    expect(text(f, '.scope-grid-add-btn')).toBe('+ Add provider');
  });

  it('applies the disabled class and hides the add button when Disabled', () => {
    const f = render({ Rows: [row({ ProviderName: 'Vector' })], Disabled: true });
    expect(query(f, '.scope-grid')?.classList.contains('disabled')).toBe(true);
    expect(query(f, '.scope-grid-add-btn')).toBeNull();
  });

  it('removes an unsaved row and emits RowRemoved + RowsChanged when its trash button is clicked', async () => {
    const r = row({ ProviderName: 'Vector' }, false);
    const f = render({ Rows: [r] });
    const removed = capture(f.componentInstance.RowRemoved);
    const changed = capture(f.componentInstance.RowsChanged);
    (query(f, '.scope-grid-icon-btn') as HTMLElement).click();
    await f.whenStable();
    f.detectChanges(false);
    expect(f.componentInstance.Rows.length).toBe(0);
    expect(removed.length).toBe(1);
    expect(changed.length).toBe(1);
  });
});
