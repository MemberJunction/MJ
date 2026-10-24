import { describe, it, expect, vi } from 'vitest';
import { SimpleChange, type ChangeDetectorRef } from '@angular/core';
import type { EntityInfo, IMetadataProvider } from '@memberjunction/core';
import { CompositeFilterDescriptor } from '@memberjunction/ng-filter-builder';
import { ViewConfigPanelComponent, type ViewSaveEvent } from './view-config-panel.component';

/**
 * Issue #4220 follow-up — reopening the config panel from the quick-save name prompt
 * ("Customize columns, filters & sorting…") must hand back the filter the user already built.
 *
 * On open the panel re-initializes from the entity and, for the default (unsaved) view, resets its
 * filter. `ExternalFilterState` can't carry the filter back: the staged filter is the same object
 * the panel was already bound to, so the input never registers a change. These tests drive the
 * panel through the same `ngOnChanges` sequence Angular does.
 */

const traditionalFilter: CompositeFilterDescriptor = {
  logic: 'and',
  filters: [{ field: 'Status', operator: 'eq', value: 'Active' }],
} as unknown as CompositeFilterDescriptor;

function makeEntity(): EntityInfo {
  return {
    ID: 'entity-1',
    Name: 'Accounts',
    DisplayNameOrName: 'Accounts',
    Fields: [
      { ID: 'f1', Name: 'AccountName', DisplayNameOrName: 'Account Name', Description: 'Primary legal name of the account', DefaultInView: true, DefaultColumnWidth: 200, Type: 'nvarchar', EntityFieldValues: [] },
      { ID: 'f2', Name: 'Status', DisplayNameOrName: 'Status', Description: 'Lifecycle status of the account', DefaultInView: true, DefaultColumnWidth: 120, Type: 'nvarchar', EntityFieldValues: [] },
    ],
  } as unknown as EntityInfo;
}

function makePanel(): ViewConfigPanelComponent {
  const cdr = { detectChanges: vi.fn(), markForCheck: vi.fn() } as unknown as ChangeDetectorRef;
  const panel = new ViewConfigPanelComponent(cdr);
  panel.Provider = { CurrentUser: null } as unknown as IMetadataProvider;
  panel.Entity = makeEntity();
  panel.ViewEntity = null;
  return panel;
}

/** Open the panel the way the workspace does: only IsOpen flips; ExternalFilterState keeps its reference. */
function open(panel: ViewConfigPanelComponent): void {
  panel.IsOpen = true;
  panel.ngOnChanges({ IsOpen: new SimpleChange(false, true, false) });
}

describe('ViewConfigPanelComponent — carrying a staged filter back from the name prompt', () => {
  it('restores a carried traditional filter in traditional mode', () => {
    const panel = makePanel();
    panel.ExternalFilterState = traditionalFilter;
    panel.DefaultSaveAsNew = true;
    panel.PendingNewViewFilterState = traditionalFilter;

    open(panel);

    expect(panel.FilterState).toEqual(traditionalFilter);
    expect(panel.FilterMode).toBe('traditional');
    expect(panel.SmartFilterEnabled).toBe(false);
  });

  it('saves a new view carrying that traditional filter', () => {
    const panel = makePanel();
    panel.DefaultSaveAsNew = true;
    panel.PendingNewViewName = 'Active Accounts';
    panel.PendingNewViewFilterState = traditionalFilter;
    open(panel);

    const emitted: Array<{ FilterState: CompositeFilterDescriptor | null; SmartFilterEnabled: boolean }> = [];
    panel.Save.subscribe(e => emitted.push(e));
    panel.OnSaveAsNew();

    expect(emitted).toHaveLength(1);
    expect(emitted[0].FilterState).toEqual(traditionalFilter);
    expect(emitted[0].SmartFilterEnabled).toBe(false);
  });

  it('restores a carried smart filter in smart mode', () => {
    const panel = makePanel();
    panel.DefaultSaveAsNew = true;
    panel.PendingNewViewSmartFilterEnabled = true;
    panel.PendingNewViewSmartFilterPrompt = 'active west coast accounts';

    open(panel);

    expect(panel.FilterMode).toBe('smart');
    expect(panel.SmartFilterEnabled).toBe(true);
    expect(panel.SmartFilterPrompt).toBe('active west coast accounts');
  });

  it('still opens clean in smart mode when nothing is carried', () => {
    const panel = makePanel();
    panel.ExternalFilterState = traditionalFilter;
    open(panel);

    expect(panel.FilterState.filters).toHaveLength(0);
    expect(panel.FilterMode).toBe('smart');
  });

  it('ignores a carried filter when not continuing a new-view flow', () => {
    const panel = makePanel();
    panel.DefaultSaveAsNew = false;
    panel.PendingNewViewFilterState = traditionalFilter;
    open(panel);

    expect(panel.FilterState.filters).toHaveLength(0);
    expect(panel.FilterMode).toBe('smart');
  });

  it('exposes Active and currently-selected Deprecated alternate base views, and emits AlternateBaseView on save', () => {
    const panel = makePanel();
    panel.Entity = {
      ...makeEntity(),
      AlternateBaseViews: [
        { ID: 'abv-1', Name: 'Active', EffectiveDisplayName: 'Active Only', ViewName: 'vwAccountsActive', Status: 'Active', IsUsable: true, IsDeprecated: false },
        { ID: 'abv-2', Name: 'Legacy', EffectiveDisplayName: 'Legacy Accounts', ViewName: 'vwAccountsLegacy', Status: 'Deprecated', IsUsable: true, IsDeprecated: true },
        { ID: 'abv-3', Name: 'Disabled', EffectiveDisplayName: 'Disabled View', ViewName: 'vwAccountsDisabled', Status: 'Disabled', IsUsable: false, IsDeprecated: false },
      ],
    } as unknown as EntityInfo;

    panel.DefaultSaveAsNew = true;
    panel.PendingNewViewName = 'Legacy View';
    panel.PendingNewViewAlternateBaseView = 'Legacy';
    open(panel);

    expect(panel.AlternateBaseView).toBe('Legacy');
    expect(panel.AvailableAlternateBaseViews.map(v => v.Name)).toEqual(['Active', 'Legacy']);

    const emitted: Array<{ AlternateBaseView?: string | null }> = [];
    panel.Save.subscribe(e => emitted.push(e));
    panel.OnSaveAsNew();

    expect(emitted).toHaveLength(1);
    expect(emitted[0].AlternateBaseView).toBe('Legacy');
  });

  it('drives the custom Base View dropdown state, labels, SQL badges, and descriptions', () => {
    const panel = makePanel();
    const abvList = [
      {
        ID: 'abv-1',
        Name: 'DueNow',
        EffectiveDisplayName: 'Scheduled Jobs Due Now',
        ViewName: 'vwScheduledJobsDueNow',
        Description: 'Active scheduled jobs whose NextRunAt timestamp is at or before the current UTC time.',
        Status: 'Active',
        IsUsable: true,
        IsDeprecated: false,
      },
    ];
    panel.Entity = {
      ...makeEntity(),
      BaseView: 'vwScheduledJobs',
      AlternateBaseViews: abvList,
      GetAlternateBaseView: (name: string) =>
        abvList.find(v => v.Name.toLowerCase() === name.trim().toLowerCase()),
    } as unknown as EntityInfo;

    open(panel);

    // Default state
    expect(panel.IsBaseViewDropdownOpen).toBe(false);
    expect(panel.SelectedBaseViewLabel).toBe('Default Base View');
    expect(panel.SelectedBaseViewSqlName).toBe('vwScheduledJobs');
    expect(panel.SelectedBaseViewDescription).toContain('canonical base view');
    expect(panel.IsAlternateBaseViewSelected(null)).toBe(true);
    expect(panel.IsAlternateBaseViewSelected('DueNow')).toBe(false);

    // Open dropdown and select DueNow
    panel.ToggleBaseViewDropdown();
    expect(panel.IsBaseViewDropdownOpen).toBe(true);

    panel.SelectBaseView('DueNow');
    expect(panel.IsBaseViewDropdownOpen).toBe(false);
    expect(panel.AlternateBaseView).toBe('DueNow');
    expect(panel.SelectedBaseViewLabel).toBe('Scheduled Jobs Due Now');
    expect(panel.SelectedBaseViewSqlName).toBe('vwScheduledJobsDueNow');
    expect(panel.SelectedBaseViewDescription).toBe(
      'Active scheduled jobs whose NextRunAt timestamp is at or before the current UTC time.'
    );
    expect(panel.IsAlternateBaseViewSelected('DueNow')).toBe(true);
    expect(panel.IsAlternateBaseViewSelected(null)).toBe(false);
  });

  it('promotes the default view into a named view with a smart suggested name and emits progressive-disclosure fields', () => {
    const panel = makePanel();
    open(panel);

    expect(panel.ViewEntity).toBeNull();
    expect(panel.IsCreatingNamedView).toBe(false);

    // Configure smart filter and promote to a new named view in place
    panel.SmartFilterEnabled = true;
    panel.SmartFilterPrompt = 'High priority active accounts';
    panel.PromoteToNewView();

    expect(panel.IsCreatingNamedView).toBe(true);
    expect(panel.ViewName).toBe('Accounts — High priority active accounts');

    // Toggle metadata pills & progressive disclosure features
    panel.ToggleShared();
    panel.ToggleDefaultView();
    panel.CustomWhereClause = true;
    panel.WhereClause = '[Revenue] > 100000';
    panel.GridRowHeight = 'compact';
    panel.GridWrapText = true;
    panel.CardSize = 'large';

    // Pin the first column and add a conditional rule
    const firstCol = panel.VisibleColumns[0];
    panel.ToggleColumnPin(firstCol);
    expect(firstCol.pinned).toBe('left');
    expect(panel.PinnedColumnsCount).toBe(1);

    panel.OpenFormatEditor(firstCol);
    panel.AddConditionalRule();
    expect(firstCol.format?.conditionalRules).toHaveLength(1);
    panel.ApplyConditionalPreset(firstCol.format!.conditionalRules![0], 'warning');
    expect(firstCol.format!.conditionalRules![0].style.backgroundColor).toBe('#fef3c7');

    // Studio always opens in full-screen wide mode
    expect(panel.IsFullScreen).toBe(true);
    expect(panel.IsWideMode).toBe(true);

    const emitted: ViewSaveEvent[] = [];
    panel.Save.subscribe(e => emitted.push(e));
    panel.OnSaveAsNew();

    expect(emitted).toHaveLength(1);
    expect(emitted[0].Name).toBe('Accounts — High priority active accounts');
    expect(emitted[0].SaveAsNew).toBe(true);
    expect(emitted[0].IsShared).toBe(true);
    expect(emitted[0].IsDefault).toBe(true);
    expect(emitted[0].CustomWhereClause).toBe(true);
    expect(emitted[0].WhereClause).toBe('[Revenue] > 100000');
    expect(emitted[0].GridDisplayState).toEqual({ rowHeight: 'compact', wrapText: true });
    expect(emitted[0].CardDisplayState).toEqual({ cardSize: 'large' });
    expect(emitted[0].Columns[0].pinned).toBe('left');
  });

  it('auto-promotes from Personal Default Layout to Named View when a filter prompt is typed, and can switch back to Default Layout', () => {
    const panel = makePanel();
    open(panel);

    expect(panel.IsCreatingNamedView).toBe(false);
    expect(panel.WasAutoPromotedToNamedView).toBe(false);

    panel.OnSmartFilterPromptChange('People in California');
    expect(panel.IsCreatingNamedView).toBe(true);
    expect(panel.WasAutoPromotedToNamedView).toBe(true);
    expect(panel.ViewName).toBe('Accounts — People in California');

    panel.SetActiveTab('display');
    expect(panel.ActiveTab).toBe('display');

    panel.SwitchToDefaultLayoutMode();
    expect(panel.IsCreatingNamedView).toBe(false);
    expect(panel.WasAutoPromotedToNamedView).toBe(false);
    expect(panel.SmartFilterPrompt).toBe('');
  });

  it('decorates FilterFields with description and sqlType, compiles Rule Builder to SQL WHERE, and supports one-way Custom SQL Override in Advanced Mode', () => {
    const panel = makePanel();
    panel.DefaultSaveAsNew = true;
    panel.PendingNewViewFilterState = {
      logic: 'and',
      filters: [
        { field: 'Status', operator: 'eq', value: 'Active' },
        { field: 'AccountName', operator: 'contains', value: 'Acme' },
      ],
    };
    open(panel);

    // In Standard Mode (!IsAdvancedMode), FilterFields include friendly description without raw sqlType jargon
    expect(panel.FilterFields).toHaveLength(2);
    expect(panel.FilterFields[0].description).toBe('Primary legal name of the account');
    expect(panel.FilterFields[0].sqlType).toBeUndefined();

    // Toggle Advanced Mode ON: reveals raw sqlType badge and SQL WHERE Clause mode
    expect(panel.IsAdvancedMode).toBe(false);
    panel.ToggleAdvancedMode();
    expect(panel.IsAdvancedMode).toBe(true);
    expect(panel.FilterFields[0].sqlType).toBe('nvarchar');

    panel.SetFilterMode('sql');
    expect(panel.FilterMode).toBe('sql');
    expect(panel.CustomWhereClause).toBe(false);

    // Read-only preview shows live compiled SQL from Rule Builder
    expect(panel.DisplayedSqlWhereClause).toBe("[Status] = 'Active' AND [AccountName] LIKE '%Acme%'");
    expect(panel.SqlWhereSourceLabel).toContain('Generated from Rule Builder');

    // Checking the one-way override seeds WhereClause from the compiled SQL and unlocks editing
    panel.OnToggleCustomWhereOverride(true);
    expect(panel.CustomWhereClause).toBe(true);
    expect(panel.WhereClause).toBe("[Status] = 'Active' AND [AccountName] LIKE '%Acme%'");

    panel.OnCustomSqlWhereChange("[Status] = 'Active' AND [AccountName] LIKE '%Acme%' AND [IsActive] = 1");
    expect(panel.DisplayedSqlWhereClause).toBe("[Status] = 'Active' AND [AccountName] LIKE '%Acme%' AND [IsActive] = 1");
  });

  it('supports custom searchable Sorting field dropdown with description filtering', () => {
    const panel = makePanel();
    open(panel);

    panel.AddSortLevel();
    expect(panel.SortItems).toHaveLength(1);
    expect(panel.SortItems[0].field).toBe('AccountName');
    expect(panel.GetSortFieldInfo('AccountName')?.Type).toBe('nvarchar');

    // Open dropdown and filter by description
    panel.ToggleSortFieldDropdown(0);
    expect(panel.OpenSortFieldDropdownIndex).toBe(0);

    panel.SortFieldSearchText = 'lifecycle';
    const filtered = panel.GetFilteredSortableFields(panel.SortItems[0]);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].Name).toBe('Status');

    // Select Status
    panel.SelectSortField(panel.SortItems[0], 'Status');
    expect(panel.SortItems[0].field).toBe('Status');
    expect(panel.OpenSortFieldDropdownIndex).toBeNull();
    expect(panel.SortFieldSearchText).toBe('');
  });

  it('supports Display & Modes visual card preferences (Grid Row Density, Wrap Text, Card Size, Timeline Defaults)', () => {
    const panel = makePanel();
    open(panel);

    expect(panel.GridRowHeight).toBe('normal');
    panel.SetGridRowHeight('compact');
    expect(panel.GridRowHeight).toBe('compact');

    expect(panel.GridWrapText).toBe(false);
    panel.ToggleGridWrapText();
    expect(panel.GridWrapText).toBe(true);

    expect(panel.CardSize).toBe('medium');
    panel.SetCardSize('large');
    expect(panel.CardSize).toBe('large');

    panel.SetTimelineGrouping('week');
    expect(panel.TimelineGrouping).toBe('week');

    panel.SetTimelineOrientation('horizontal');
    expect(panel.TimelineOrientation).toBe('horizontal');
  });

  it('supports clean default Columns tab with mutually exclusive on-demand Add Columns and Column Inspector drawers', () => {
    const panel = makePanel();
    open(panel);

    // By default, neither drawer is open
    expect(panel.ShowAddColumnsDrawer).toBe(false);
    expect(panel.FormatEditingColumn).toBeNull();

    // Opening Add Columns drawer sets ShowAddColumnsDrawer = true
    panel.OpenAddColumnsDrawer();
    expect(panel.ShowAddColumnsDrawer).toBe(true);
    expect(panel.FormatEditingColumn).toBeNull();

    // Selecting a visible column for inspection closes Add Columns drawer and opens Column Inspector
    const firstCol = panel.VisibleColumns[0];
    panel.OpenFormatEditor(firstCol);
    expect(panel.ShowAddColumnsDrawer).toBe(false);
    expect(panel.FormatEditingColumn).toBe(firstCol);

    // Opening Add Columns drawer again closes Column Inspector
    panel.ToggleAddColumnsDrawer();
    expect(panel.ShowAddColumnsDrawer).toBe(true);
    expect(panel.FormatEditingColumn).toBeNull();

    // Closing Add Columns drawer resets search text
    panel.ColumnSearchText = 'Status';
    panel.CloseAddColumnsDrawer();
    expect(panel.ShowAddColumnsDrawer).toBe(false);
    expect(panel.ColumnSearchText).toBe('');
  });
});
