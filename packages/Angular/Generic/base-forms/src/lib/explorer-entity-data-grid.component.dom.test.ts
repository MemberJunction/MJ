import { describe, it, expect, vi, afterEach } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { By } from '@angular/platform-browser';
import { RunViewParams } from '@memberjunction/core';
import type { EntityInfo } from '@memberjunction/core';
import type { BaseEntity } from '@memberjunction/core';
import type { AfterRowClickEventArgs, AfterRowDoubleClickEventArgs, AfterDataLoadEventArgs } from '@memberjunction/ng-entity-viewer';
import { renderComponentFixture, capture } from '@memberjunction/ng-test-utils';
import { ExplorerEntityDataGridComponent } from './explorer-entity-data-grid.component';
import { RelatedGridHeightPx } from './related-grid-height';
import { FormRecordRefreshCoordinator } from './form-record-refresh.coordinator';

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
  @Input() ShowSearch = true;
  @Input() ShowNewButton = true;
  @Input() ShowRefreshButton = true;
  @Input() ShowExportButton = true;
  @Input() ShowDeleteButton = false;
  @Input() ShowCompareButton = false;
  @Input() ShowMergeButton = false;
  @Input() ShowAddToListButton = false;
  @Input() ShowDuplicateSearchButton = false;
  @Input() ShowCommunicationButton = false;
  @Input() ShowRecycleBin = true;
  @Input() Height: unknown;
  @Input() ToolbarConfig: unknown;
  @Input() SelectionMode = '';
  @Input() AllowColumnToggle = true;
  @Output() AfterRowDoubleClick = new EventEmitter<AfterRowDoubleClickEventArgs>();
  @Output() AfterRowClick = new EventEmitter<AfterRowClickEventArgs>();
  @Output() AfterDataLoad = new EventEmitter<AfterDataLoadEventArgs>();
  @Output() NewRecordTabRequested = new EventEmitter<{ entityInfo: EntityInfo; defaultValues: Record<string, unknown> }>();
  Refresh = vi.fn(async () => {});
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
    expect(g.ShowSearch).toBe(true);
    expect(g.ShowNewButton).toBe(true);
    expect(g.ShowRefreshButton).toBe(true);
    expect(g.ShowExportButton).toBe(true);
    expect(g.SelectionMode).toBe('multiple');
    expect(g.AllowColumnToggle).toBe(false);
  });

  it('forwards toolbar chrome so a related list can hide search, buttons, or the whole bar', () => {
    const g = inner(render({
      ShowToolbar: false,
      ShowSearch: false,
      ShowNewButton: false,
      ShowRefreshButton: false,
      ShowExportButton: false,
      ShowDeleteButton: true,
      ShowCompareButton: true,
      ShowMergeButton: true,
      ShowAddToListButton: true,
      ShowDuplicateSearchButton: true,
      ShowCommunicationButton: true,
      ShowRecycleBin: false,
    }));
    expect(g.ShowToolbar).toBe(false);
    expect(g.ShowSearch).toBe(false);
    expect(g.ShowNewButton).toBe(false);
    expect(g.ShowRefreshButton).toBe(false);
    expect(g.ShowExportButton).toBe(false);
    expect(g.ShowDeleteButton).toBe(true);
    expect(g.ShowCompareButton).toBe(true);
    expect(g.ShowMergeButton).toBe(true);
    expect(g.ShowAddToListButton).toBe(true);
    expect(g.ShowDuplicateSearchButton).toBe(true);
    expect(g.ShowCommunicationButton).toBe(true);
    expect(g.ShowRecycleBin).toBe(false);
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

  it('sizes a related-entity accordion grid to toolbar + header + rows', () => {
    const f = render();
    const host = f.debugElement.nativeElement as HTMLElement;
    const wrap = document.createElement('mj-collapsible-panel');
    wrap.setAttribute('data-variant', 'related-entity');
    host.parentElement?.insertBefore(wrap, host);
    wrap.appendChild(host);

    inner(f).AfterDataLoad.emit({ loadedRowCount: 2 } as unknown as AfterDataLoadEventArgs);
    f.detectChanges();

    expect(f.componentInstance.ResolvedHeight).toBe(RelatedGridHeightPx(2));
    expect(inner(f).Height).toBe(RelatedGridHeightPx(2));
    expect(host.style.height).toBe(`${RelatedGridHeightPx(2)}px`);
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

  describe('parent-form refresh fan-out', () => {
    const OriginalIO = globalThis.IntersectionObserver;

    afterEach(() => {
      globalThis.IntersectionObserver = OriginalIO;
    });

    it('forwards Refresh() to the inner grid', async () => {
      const f = render();
      await f.componentInstance.Refresh();
      expect(inner(f).Refresh).toHaveBeenCalledTimes(1);
    });

    it('reloads an already-visible grid when the parent record refreshes', async () => {
      const coordinator = new FormRecordRefreshCoordinator();
      const f = renderComponentFixture(ExplorerEntityDataGridComponent, {
        imports: [StubInnerGrid],
        declarations: [ExplorerEntityDataGridComponent],
        providers: [{ provide: FormRecordRefreshCoordinator, useValue: coordinator }],
        inputs: { Params: PARAMS, DeferLoadUntilVisible: false },
      });
      coordinator.Notify({} as BaseEntity);
      await Promise.resolve();
      expect(inner(f).Refresh).toHaveBeenCalledTimes(1);
    });

    it('does not load a never-seen deferred grid on parent refresh', async () => {
      globalThis.IntersectionObserver = class {
        observe(): void { /* never intersect */ }
        unobserve(): void { /* noop */ }
        disconnect(): void { /* noop */ }
        takeRecords(): IntersectionObserverEntry[] { return []; }
        root = null;
        rootMargin = '';
        thresholds = [];
      } as unknown as typeof IntersectionObserver;

      const coordinator = new FormRecordRefreshCoordinator();
      const f = renderComponentFixture(ExplorerEntityDataGridComponent, {
        imports: [StubInnerGrid],
        declarations: [ExplorerEntityDataGridComponent],
        providers: [{ provide: FormRecordRefreshCoordinator, useValue: coordinator }],
        inputs: { Params: PARAMS, DeferLoadUntilVisible: true },
      });
      coordinator.Notify({} as BaseEntity);
      await Promise.resolve();
      expect(inner(f).Refresh).not.toHaveBeenCalled();
    });
  });
});
