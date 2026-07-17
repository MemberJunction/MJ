import { describe, it, expect } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { By } from '@angular/platform-browser';
import { RunViewParams } from '@memberjunction/core';
import type { EntityInfo } from '@memberjunction/core';
import type { AfterRowClickEventArgs, AfterRowDoubleClickEventArgs, AfterDataLoadEventArgs } from '@memberjunction/ng-entity-viewer';
import { renderComponentFixture, capture } from '@memberjunction/ng-test-utils';
import { ExplorerEntityDataGridComponent } from './explorer-entity-data-grid.component';

/**
 * DOM coverage for <mj-explorer-entity-data-grid> — the CodeGen-emitted related-entity grid wrapper
 * (used ~813×). It's a thin wrapper over the heavy <mj-entity-data-grid>: it forwards inputs (pinning
 * AllowColumnToggle=false and gating load via EffectiveAllowLoad) and re-emits the inner grid's
 * events, translating row-double-click / new-record into Navigate events. The heavy inner grid is
 * stubbed to exactly the bound surface; these verify the wrapper's pass-through + translation logic.
 */

@Component({ standalone: true, selector: 'mj-entity-data-grid', template: '' })
class StubInnerGrid {
  @Input() Params: RunViewParams | null = null;
  @Input() NewRecordValues: Record<string, unknown> = {};
  @Input() AllowLoad = false;
  @Input() ShowToolbar = false;
  @Input() Height: unknown;
  @Input() ToolbarConfig: unknown;
  @Input() SelectionMode = '';
  @Input() AllowColumnToggle = true;
  @Output() AfterRowDoubleClick = new EventEmitter<AfterRowDoubleClickEventArgs>();
  @Output() AfterRowClick = new EventEmitter<AfterRowClickEventArgs>();
  @Output() AfterDataLoad = new EventEmitter<AfterDataLoadEventArgs>();
  @Output() NewRecordTabRequested = new EventEmitter<{ entityInfo: EntityInfo; defaultValues: Record<string, unknown> }>();
}

const PARAMS: RunViewParams = { EntityName: 'Accounts' };

const render = (inputs: Record<string, unknown> = {}) =>
  renderComponentFixture(ExplorerEntityDataGridComponent, {
    imports: [StubInnerGrid],
    declarations: [ExplorerEntityDataGridComponent],
    inputs: { Params: PARAMS, DeferLoadUntilVisible: false, ...inputs },
  });
const inner = (f: ReturnType<typeof render>) => f.debugElement.query(By.directive(StubInnerGrid)).componentInstance as StubInnerGrid;

describe('ExplorerEntityDataGridComponent (DOM)', () => {
  it('forwards inputs to the inner grid and pins AllowColumnToggle off', () => {
    const f = render({ ShowToolbar: true, SelectionMode: 'multiple' });
    const g = inner(f);
    expect(g.Params).toBe(PARAMS);
    expect(g.ShowToolbar).toBe(true);
    expect(g.SelectionMode).toBe('multiple');
    expect(g.AllowColumnToggle).toBe(false);
  });

  it('passes EffectiveAllowLoad=true to the inner grid when AllowLoad and not deferring', () => {
    expect(inner(render({ AllowLoad: true })).AllowLoad).toBe(true);
  });

  it('passes EffectiveAllowLoad=false to the inner grid when AllowLoad is false', () => {
    expect(inner(render({ AllowLoad: false })).AllowLoad).toBe(false);
  });

  it('re-emits the inner grid AfterRowClick', () => {
    const f = render();
    const out = capture(f.componentInstance.AfterRowClick);
    const evt = { row: { ID: '1' } } as unknown as AfterRowClickEventArgs;
    inner(f).AfterRowClick.emit(evt);
    expect(out).toEqual([evt]);
  });

  it('re-emits the inner grid AfterDataLoad', () => {
    const f = render();
    const out = capture(f.componentInstance.AfterDataLoad);
    const evt = { totalRowCount: 5 } as unknown as AfterDataLoadEventArgs;
    inner(f).AfterDataLoad.emit(evt);
    expect(out).toEqual([evt]);
  });

  it('re-emits AfterRowDoubleClick (no Navigate when NavigateOnDoubleClick is off)', () => {
    const f = render({ NavigateOnDoubleClick: false });
    const dbl = capture(f.componentInstance.AfterRowDoubleClick);
    const nav = capture(f.componentInstance.Navigate);
    inner(f).AfterRowDoubleClick.emit({ row: { ID: '1' } } as unknown as AfterRowDoubleClickEventArgs);
    expect(dbl.length).toBe(1);
    expect(nav.length).toBe(0);
  });

  it('translates a new-record request into a Navigate event', () => {
    const f = render();
    const nav = capture(f.componentInstance.Navigate);
    inner(f).NewRecordTabRequested.emit({
      entityInfo: { Name: 'Accounts' } as unknown as EntityInfo,
      defaultValues: { Status: 'Active' },
    });
    expect(nav).toEqual([{ Kind: 'new-record', EntityName: 'Accounts', DefaultValues: { Status: 'Active' } }]);
  });
});
