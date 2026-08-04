import { describe, it, expect } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { ComponentFixture } from '@angular/core/testing';
import { IMetadataProvider } from '@memberjunction/core';
import { renderComponentFixture, query, queryAll, text, capture, StubEmptyStateComponent, StubLoadingComponent } from '@memberjunction/ng-test-utils';
import { DashboardPreferencesDialogComponent, DashboardPreferencesResult } from './dashboard-preferences-dialog.component';

/**
 * DOM coverage for <mj-dashboard-preferences-dialog> — the two-panel (Available / Configured)
 * dashboard-ordering dialog. It's a BaseAngularComponent (standalone:false) whose async ngOnInit
 * loads dashboards from `ProviderToUse.GetAndCacheDatasetByName("MJ_Metadata")` and preferences via
 * RunView. We drive it entirely through a hand-built fake `[Provider]`:
 *  - a happy provider (dataset returns two Global dashboards, RunView returns zero preferences) so
 *    both dashboards land in the "Available" panel and the panels render after load; and
 *  - a broken provider (no GetAndCacheDatasetByName) so loadData throws and the error empty-state renders.
 * The MJ UI kit (mj-dialog / mj-dialog-actions / mj-empty-state / mj-loading) is replaced with light
 * standalone stubs that project content, so we assert THIS dialog's structure, add/remove behavior,
 * and the result output — not the real kit. CDK drag-drop + FormsModule (radios use ngModel) are imported.
 *
 * Async recipe: detectChanges(false) → drain microtasks/macrotasks → detectChanges(false), because
 * ngOnInit flips `loading` after the first render (strict detectChanges would NG0100 on the flip).
 */

@Component({ selector: 'mj-dialog', standalone: true, template: '<ng-content></ng-content>' })
class StubDialog {
  @Input() Visible = false;
  @Input() Title = '';
  @Input() Width = 0;
  @Input() Height = 0;
  @Input() MinWidth = 0;
  @Output() Close = new EventEmitter<void>();
}
@Component({ selector: 'mj-dialog-actions', standalone: true, template: '<ng-content></ng-content>' })
class StubDialogActions {}

interface DashRow {
  ID: string;
  Name: string;
  Description: string | null;
  Scope: string;
  ApplicationID: string | null;
}

const DASHBOARDS: DashRow[] = [
  { ID: 'dash-a', Name: 'Alpha Dashboard', Description: 'first', Scope: 'Global', ApplicationID: null },
  { ID: 'dash-b', Name: 'Beta Dashboard', Description: null, Scope: 'Global', ApplicationID: null },
];

/** Provider whose dataset returns DASHBOARDS and whose RunView returns no preferences → all available. */
function happyProvider(): IMetadataProvider {
  const fake = {
    CurrentUser: { ID: 'user-1', Name: 'Test User', Type: 'User' },
    Entities: [],
    Roles: [],
    GetAndCacheDatasetByName: async () => ({
      Success: true,
      Results: [{ Code: 'Dashboards', Results: DASHBOARDS }],
    }),
    RunView: async () => ({ Success: true, Results: [], RowCount: 0, TotalRowCount: 0 }),
    RunViews: async (list: unknown[]) => list.map(() => ({ Success: true, Results: [], RowCount: 0, TotalRowCount: 0 })),
    EntityByName: () => undefined,
  };
  return fake as unknown as IMetadataProvider;
}

/** Provider missing GetAndCacheDatasetByName → loadData throws → error empty-state path. */
function brokenProvider(): IMetadataProvider {
  const fake = {
    CurrentUser: { ID: 'user-1', Name: 'Test User', Type: 'User' },
    Entities: [],
    Roles: [],
    RunView: async () => ({ Success: true, Results: [], RowCount: 0, TotalRowCount: 0 }),
    EntityByName: () => undefined,
  };
  return fake as unknown as IMetadataProvider;
}

async function settle(fixture: ComponentFixture<DashboardPreferencesDialogComponent>) {
  // ngOnInit awaits two async provider calls (dataset + preferences RunView). Poll the
  // micro/macrotask queues until the `loading` gate flips, THEN a single non-strict CD so
  // the rendered DOM reflects the loaded (or error) state deterministically.
  const ci = fixture.componentInstance;
  for (let i = 0; i < 30 && ci.loading; i++) await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  // The component has no ChangeDetectorRef and never marks itself dirty after the async load
  // (it relies on zone.js in production); in zoneless tests we mark the view dirty ourselves,
  // then a non-strict CD (CDK drag-drop trips checkNoChanges under strict CD) renders it.
  fixture.componentRef.changeDetectorRef.markForCheck();
  fixture.detectChanges(false);
}

const IMPORTS = [CommonModule, FormsModule, DragDropModule, StubDialog, StubDialogActions, StubEmptyStateComponent, StubLoadingComponent];

const renderLoaded = async (provider: IMetadataProvider) => {
  const fixture = renderComponentFixture(DashboardPreferencesDialogComponent, {
    imports: IMPORTS,
    declarations: [DashboardPreferencesDialogComponent],
    inputs: { Provider: provider, scope: 'Global' },
  });
  await settle(fixture);
  return fixture;
};

describe('DashboardPreferencesDialogComponent (DOM)', () => {
  it('renders the dialog header and scope indicator', async () => {
    const fixture = await renderLoaded(happyProvider());
    expect(query(fixture, '.dialog-header')).not.toBeNull();
    expect(text(fixture, '.dialog-header h3')).toContain('Dashboard Preferences');
    expect(text(fixture, '.scope-indicator')).toContain('Global Scope');
  });

  it('lists both dashboards in the Available panel after load (no preferences → none configured)', async () => {
    const fixture = await renderLoaded(happyProvider());
    const names = queryAll(fixture, '.available-panel .dashboard-name').map((el) => el.textContent?.trim());
    expect(names).toEqual(['Alpha Dashboard', 'Beta Dashboard']);
    // Configured panel is empty → shows its empty-state stub
    expect(query(fixture, '.configured-panel .dashboard-item')).toBeNull();
    expect(query(fixture, '.configured-panel mj-empty-state')).not.toBeNull();
  });

  it('moves a dashboard from Available to Configured when its Add button is clicked', async () => {
    const fixture = await renderLoaded(happyProvider());
    const addBtn = query(fixture, '.available-panel .add-button') as HTMLElement;
    addBtn.click();
    fixture.detectChanges(false);
    expect(queryAll(fixture, '.available-panel .dashboard-item').length).toBe(1);
    expect(queryAll(fixture, '.configured-panel .dashboard-item').length).toBe(1);
    expect(fixture.componentInstance.hasChanges).toBe(true);
  });

  it('enables the Save button only once changes exist', async () => {
    const fixture = await renderLoaded(happyProvider());
    const saveBtn = () => queryAll(fixture, '.btn.btn-primary')[0] as HTMLButtonElement;
    expect(saveBtn().disabled).toBe(true);
    (query(fixture, '.available-panel .add-button') as HTMLElement).click();
    fixture.detectChanges(false);
    expect(saveBtn().disabled).toBe(false);
  });

  it('emits result {saved:false} when Cancel is clicked', async () => {
    const fixture = await renderLoaded(happyProvider());
    const results = capture<DashboardPreferencesResult>(fixture.componentInstance.result);
    const cancelBtn = queryAll(fixture, '.btn.btn-secondary')[0] as HTMLElement;
    cancelBtn.click();
    expect(results).toEqual([{ saved: false }]);
  });

  it('renders the error empty-state when the dataset load fails', async () => {
    const fixture = await renderLoaded(brokenProvider());
    // panels are gated behind !loading && !error → not rendered
    expect(query(fixture, '.preferences-panels')).toBeNull();
    const emptyTitle = query(fixture, '.dialog-content mj-empty-state .stub-empty-title');
    expect(emptyTitle?.textContent).toContain('Failed to load dashboard preferences');
  });
});
