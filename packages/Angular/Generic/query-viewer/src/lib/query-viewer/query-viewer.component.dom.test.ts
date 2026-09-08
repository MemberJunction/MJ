import { describe, it, expect } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { By } from '@angular/platform-browser';
import type { MJQueryEntityExtended } from '@memberjunction/core-entities';
import { renderComponentFixture, query, text, capture } from '@memberjunction/ng-test-utils';
import { QueryViewerComponent } from './query-viewer.component';
import type { QueryEntityLinkClickEvent } from '../query-data-grid/models/query-grid-types';

/**
 * DOM coverage for <mj-query-viewer> — the wrapper that runs a stored query and shows its results grid
 * with an info panel + parameter form (~4x). It reads QueryEngine on QueryId set, so specs drive the
 * public QueryInfo / QueryId / error state directly (OnPush, via setup) and stub the three children.
 * Covers the no-query state, the header, the grid render + input pass-through + output re-emission, the
 * two error states, and the parameters-button gate.
 */

@Component({ standalone: true, selector: 'mj-query-data-grid', template: '' })
class GridStub {
  @Input() QueryInfo: MJQueryEntityExtended | null = null;
  @Input() Data: unknown; @Input() TotalRowCount = 0; @Input() PageNumber = 1; @Input() PageSize = 100;
  @Input() SelectionMode = ''; @Input() ShowToolbar = true; @Input() VisualConfig: unknown; @Input() IsLoading = false;
  // The real grid declares this (query-data-grid.component.ts) and the viewer template binds it.
  // A stub that omits an input the template binds is NG0303 at render time, which fails every
  // test that gets far enough to render the grid — not just the ones that assert on export.
  @Input() ExportDataProvider: (() => Promise<Record<string, unknown>[]>) | null = null;
  @Output() PageChange = new EventEmitter<unknown>();
  @Output() EntityLinkClick = new EventEmitter<QueryEntityLinkClickEvent>();
  @Output() RowDoubleClick = new EventEmitter<unknown>();
  @Output() SelectionChange = new EventEmitter<unknown>();
  @Output() GridStateChange = new EventEmitter<unknown>();
  @Output() RefreshRequest = new EventEmitter<void>();
}
@Component({ standalone: true, selector: 'mj-query-parameter-form', template: '' })
class ParamFormStub { @Input() QueryInfo: MJQueryEntityExtended | null = null; @Input() InitialValues: unknown; @Input() IsOpen = false;
  @Output() ParametersSubmit = new EventEmitter<unknown>(); @Output() Close = new EventEmitter<void>(); }
@Component({ standalone: true, selector: 'mj-query-info-panel', template: '' })
class InfoPanelStub { @Input() QueryInfo: MJQueryEntityExtended | null = null; @Input() Visible = false;
  @Output() Close = new EventEmitter<void>(); @Output() OpenRecord = new EventEmitter<unknown>(); @Output() CompositionTokenClick = new EventEmitter<unknown>(); }

const CHILDREN = [GridStub, ParamFormStub, InfoPanelStub];
const query_ = (params: unknown[] = []) => ({ ID: 'q1', Name: 'Active Members', Category: 'Reports', QueryParameters: params } as unknown as MJQueryEntityExtended);
const QUERY = query_();

interface State { QueryInfo?: MJQueryEntityExtended | null; queryId?: string; LastError?: string | null; HasRun?: boolean }
const render = (state: State = {}) =>
  renderComponentFixture(QueryViewerComponent, {
    imports: CHILDREN,
    declarations: [QueryViewerComponent],
    setup: (c) => {
      const priv = c as unknown as { _queryId: string | null };
      if (state.queryId !== undefined) priv._queryId = state.queryId; // bypass the QueryEngine-hitting setter
      if (state.QueryInfo !== undefined) c.QueryInfo = state.QueryInfo;
      if (state.LastError !== undefined) c.LastError = state.LastError;
      if (state.HasRun !== undefined) c.HasRun = state.HasRun;
    },
  });
type Fx = ReturnType<typeof render>;
const grid = (f: Fx) => f.debugElement.query(By.directive(GridStub))?.componentInstance as GridStub | undefined;
const actionBtns = (f: Fx) => Array.from(f.nativeElement.querySelectorAll('.query-actions .btn')) as HTMLElement[];

describe('QueryViewerComponent (DOM)', () => {
  it('shows the no-query state when no query is selected', () => {
    const f = render({});
    expect(query(f, '.no-query-state')).not.toBeNull();
    expect(text(f, '.no-query-state .state-message')).toContain('Select a query');
  });

  it('renders the header with the query name when a query is loaded', () => {
    expect(text(render({ QueryInfo: QUERY, queryId: 'q1' }), '.query-name')).toBe('Active Members');
  });

  it('renders the results grid and passes QueryInfo + page size to it', () => {
    const g = grid(render({ QueryInfo: QUERY, queryId: 'q1' }));
    expect(g).toBeTruthy();
    expect(g!.QueryInfo).toBe(QUERY);
    expect(g!.PageSize).toBe(100);
  });

  it('re-emits the grid EntityLinkClick through the viewer', () => {
    const f = render({ QueryInfo: QUERY, queryId: 'q1' });
    const out = capture(f.componentInstance.EntityLinkClick);
    const evt = { entityName: 'Members' } as unknown as QueryEntityLinkClickEvent;
    grid(f)!.EntityLinkClick.emit(evt);
    expect(out).toEqual([evt]);
  });

  it('shows the load-error state when a query id has no resolvable query', () => {
    const f = render({ queryId: 'q1', QueryInfo: null, LastError: 'Query not found' });
    expect(query(f, '.error-state')).not.toBeNull();
    expect(text(f, '.error-state .state-message')).toBe('Query not found');
  });

  it('shows the execution-error banner when a run fails', () => {
    expect(query(render({ QueryInfo: QUERY, queryId: 'q1', LastError: 'boom', HasRun: true }), '.execution-error')).not.toBeNull();
  });

  it('shows only the info button when the query has no parameters', () => {
    expect(actionBtns(render({ QueryInfo: query_([]), queryId: 'q1' })).length).toBe(1);
  });

  it('shows the parameters button when the query has parameters', () => {
    expect(actionBtns(render({ QueryInfo: query_([{ Name: 'p1' }]), queryId: 'q1' })).length).toBeGreaterThanOrEqual(2);
  });
});
