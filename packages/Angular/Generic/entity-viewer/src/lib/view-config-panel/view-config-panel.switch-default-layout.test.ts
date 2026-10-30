import { describe, it, expect, vi } from 'vitest';
import { SimpleChange, type ChangeDetectorRef } from '@angular/core';
import type { EntityFieldInfo, EntityInfo, IMetadataProvider, UserInfo, UserViewProperty } from '@memberjunction/core';
import type { MJUserViewEntityExtended } from '@memberjunction/core-entities';
import { CompositeFilterDescriptor } from '@memberjunction/ng-filter-builder';
import { ViewConfigPanelComponent, type ViewSaveEvent } from './view-config-panel.component';

/**
 * Issue #6037 — ViewConfigPanelComponent coverage for:
 *  1. Switching from "New Saved View" to "Personal Default Layout" while a saved ViewEntity is bound
 *     (detaching ViewEntity for the Studio session, preserving in-progress edits across single- and
 *     multi-pass host input echoes, and staying resilient when a host does not bind SwitchToDefaultLayout).
 *  2. Preserving declared `ViewEntity.PropertiesObject` on Save-as-New while clearing `Properties`
 *     when switching to Personal Default Layout.
 *  3. Custom SQL WHERE authorization: failing closed for non-Owner / blank-Type users when enabling
 *     or editing Custom SQL, while still allowing non-Owner editors to turn an existing Custom SQL
 *     override OFF (`OnToggleCustomWhereOverride(false)`).
 */

const traditionalFilter: CompositeFilterDescriptor = {
  logic: 'and',
  filters: [{ field: 'Status', operator: 'eq', value: 'Active' }],
};

const chapterProperty: UserViewProperty = {
  Name: 'Chapter',
  Type: 'string',
  AllowOverride: false,
  Target: { Field: 'Status', Operator: '=' },
};

function makeField(overrides: Partial<EntityFieldInfo>): EntityFieldInfo {
  const field: Partial<EntityFieldInfo> = {
    DefaultInView: true,
    DefaultColumnWidth: 160,
    Type: 'nvarchar',
    NeedsQuotes: true,
    IsBinaryFieldType: false,
    EntityFieldValues: [],
    ...overrides,
  };
  return field as EntityFieldInfo;
}

function makeEntity(deniedFields: string[] = []): EntityInfo {
  const denied = new Set(deniedFields.map(f => f.toLowerCase()));
  const entity: Partial<EntityInfo> = {
    ID: 'entity-1',
    Name: 'Accounts',
    DisplayNameOrName: 'Accounts',
    GetDeniedReadFields: () => denied,
    Fields: [
      makeField({
        ID: 'f1',
        Name: 'AccountName',
        DisplayNameOrName: 'Account Name',
        Description: 'Primary legal name of the account',
        DefaultColumnWidth: 200,
      }),
      makeField({
        ID: 'f2',
        Name: 'Status',
        DisplayNameOrName: 'Status',
        Description: 'Lifecycle status of the account',
        DefaultColumnWidth: 120,
      }),
    ],
  };
  return entity as EntityInfo;
}

function makeProvider(currentUser: Partial<UserInfo> | null): IMetadataProvider {
  const provider: Partial<IMetadataProvider> = {
    CurrentUser: currentUser ? (currentUser as UserInfo) : (null as never),
  };
  return provider as IMetadataProvider;
}

type ViewColumnElement = NonNullable<MJUserViewEntityExtended['Columns']>[number];

function makeViewColumn(overrides: Partial<ViewColumnElement>): ViewColumnElement {
  return overrides as ViewColumnElement;
}

function makeView(overrides: Partial<MJUserViewEntityExtended> = {}): MJUserViewEntityExtended {
  const view: Partial<MJUserViewEntityExtended> = {
    ID: 'view-existing-x',
    Name: 'Active Enterprise Accounts',
    Description: 'Filtered enterprise view',
    IsShared: true,
    IsDefault: false,
    UserCanEdit: true,
    UserCanDelete: true,
    SmartFilterEnabled: true,
    SmartFilterPrompt: 'Enterprise accounts',
    FilterState: JSON.stringify(traditionalFilter),
    Columns: [makeViewColumn({ Name: 'AccountName', hidden: false, orderIndex: 0 })],
    ViewSortInfo: [],
    PropertiesObject: null,
    ...overrides,
  };
  return view as MJUserViewEntityExtended;
}

function makePanel(user: Partial<UserInfo> | null = null): ViewConfigPanelComponent {
  const cdr: Partial<ChangeDetectorRef> = { detectChanges: vi.fn(), markForCheck: vi.fn() };
  const panel = new ViewConfigPanelComponent(cdr as ChangeDetectorRef);
  panel.Provider = makeProvider(user);
  panel.Entity = makeEntity();
  panel.ViewEntity = null;
  return panel;
}

function open(panel: ViewConfigPanelComponent): void {
  panel.IsOpen = true;
  panel.ngOnChanges({ IsOpen: new SimpleChange(false, true, false) });
}

describe('ViewConfigPanelComponent — Default Layout switch & Custom SQL authorization (#6037)', () => {
  it('detaches ViewEntity and emits SwitchToDefaultLayout when switching from New Saved View to Personal Default Layout', () => {
    const panel = makePanel({ ID: 'user-1', Type: 'User' });
    const existingView = makeView();

    panel.ViewEntity = existingView;
    panel.DefaultSaveAsNew = true;
    panel.PendingNewViewFilterState = traditionalFilter;
    open(panel);

    expect(panel.IsSaveAsNewFlow).toBe(true);
    expect(panel.IsCreatingNamedView).toBe(true);

    // Customize sort in the open panel before switching to Personal Default Layout
    panel.AddSortLevel();
    expect(panel.SortItems).toHaveLength(1);

    let switchEmitted = 0;
    panel.SwitchToDefaultLayout.subscribe(() => {
      switchEmitted++;
      // Simulate host reacting in a single change-detection pass
      panel.DefaultSaveAsNew = false;
      panel.ngOnChanges({
        DefaultSaveAsNew: new SimpleChange(true, false, false),
      });
    });

    // RequestSwitchToDefaultLayoutMode prompts for confirmation because a filter is active
    panel.RequestSwitchToDefaultLayoutMode();
    expect(panel.ShowDefaultLayoutSwitchConfirm).toBe(true);
    panel.OnDefaultLayoutSwitchConfirmed();

    expect(switchEmitted).toBe(1);
    expect(panel.ViewEntity).toBeNull();
    expect(panel.IsSaveAsNewFlow).toBe(false);
    expect(panel.IsCreatingNewView).toBe(false);
    expect(panel.IsCreatingNamedView).toBe(false);
    expect(panel.ViewName).toBe('');
    expect(panel.SmartFilterPrompt).toBe('');
    expect(panel.GetFilterCount()).toBe(0);
    // In-progress sort customization is preserved across the host input update
    expect(panel.SortItems).toHaveLength(1);

    const defaultsSaved: ViewSaveEvent[] = [];
    const viewSaved: ViewSaveEvent[] = [];
    panel.SaveDefaults.subscribe(e => defaultsSaved.push(e));
    panel.Save.subscribe(e => viewSaved.push(e));

    panel.OnSaveDefaults();
    expect(defaultsSaved).toHaveLength(1);
    expect(viewSaved).toHaveLength(0);
    expect(existingView.Name).toBe('Active Enterprise Accounts');
    expect(existingView.SmartFilterPrompt).toBe('Enterprise accounts');
  });

  it('preserves in-progress sort edits when a host echoes DefaultSaveAsNew and ViewEntity across separate change-detection passes', () => {
    const panel = makePanel({ ID: 'user-1', Type: 'User' });
    const existingView = makeView();

    panel.ViewEntity = existingView;
    panel.DefaultSaveAsNew = true;
    open(panel);

    panel.AddSortLevel();
    expect(panel.SortItems).toHaveLength(1);

    panel.SwitchToDefaultLayoutMode();

    // Pass 1: host clears DefaultSaveAsNew
    panel.DefaultSaveAsNew = false;
    panel.ngOnChanges({
      DefaultSaveAsNew: new SimpleChange(true, false, false),
    });
    expect(panel.SortItems).toHaveLength(1);

    // Pass 2: async host clears ViewEntity in a subsequent change-detection pass
    panel.ViewEntity = null;
    panel.ngOnChanges({
      ViewEntity: new SimpleChange(existingView, null, false),
    });
    expect(panel.SortItems).toHaveLength(1);
    expect(panel.ViewEntity).toBeNull();
  });

  it('still re-initializes cleanly when a host does not bind SwitchToDefaultLayout and later binds a different view or reopens', () => {
    const panel = makePanel({ ID: 'user-1', Type: 'User' });
    const viewA = makeView({ ID: 'view-a', Name: 'View A', SmartFilterPrompt: 'Prompt A' });
    const viewB = makeView({ ID: 'view-b', Name: 'View B', SmartFilterPrompt: 'Prompt B' });

    panel.ViewEntity = viewA;
    panel.DefaultSaveAsNew = true;
    open(panel);

    // Switch to Personal Default Layout with NO subscriber on SwitchToDefaultLayout
    panel.SwitchToDefaultLayoutMode();
    expect(panel.ViewEntity).toBeNull();

    // Closing and reopening with DefaultSaveAsNew=false restores the bound viewA even though
    // the host's [ViewEntity] binding never changed
    panel.IsOpen = false;
    panel.DefaultSaveAsNew = false;
    panel.ngOnChanges({
      IsOpen: new SimpleChange(true, false, false),
      DefaultSaveAsNew: new SimpleChange(true, false, false),
    });
    open(panel);
    expect(panel.ViewEntity).toBe(viewA);
    expect(panel.ViewName).toBe('View A');

    // Switch again while open (no listener), then host selects genuine viewB while open
    panel.DefaultSaveAsNew = true;
    panel.ngOnChanges({ DefaultSaveAsNew: new SimpleChange(false, true, false) });
    panel.SwitchToDefaultLayoutMode();
    expect(panel.ViewEntity).toBeNull();

    panel.DefaultSaveAsNew = false;
    panel.ViewEntity = viewB;
    panel.ngOnChanges({
      DefaultSaveAsNew: new SimpleChange(true, false, false),
      ViewEntity: new SimpleChange(viewA, viewB, false),
    });
    expect(panel.ViewEntity).toBe(viewB);
    expect(panel.ViewName).toBe('View B');
    expect(panel.SmartFilterPrompt).toBe('Prompt B');
  });

  it('preserves declared ViewEntity.PropertiesObject on Save-as-New while clearing Properties on SwitchToDefaultLayoutMode', () => {
    const panel = makePanel({ ID: 'user-1', Type: 'User' });
    const scopedView = makeView({
      PropertiesObject: [chapterProperty],
    });

    panel.ViewEntity = scopedView;
    panel.DefaultSaveAsNew = true;
    panel.PendingNewViewName = 'Scoped Copy';
    open(panel);

    expect(panel.Properties).toEqual([chapterProperty]);

    const savedEvents: ViewSaveEvent[] = [];
    panel.Save.subscribe(e => savedEvents.push(e));
    panel.OnSaveAsNew();

    expect(savedEvents).toHaveLength(1);
    expect(savedEvents[0].Properties).toEqual([chapterProperty]);

    // Switching to Personal Default Layout clears Properties
    panel.ngOnChanges({ IsSaving: new SimpleChange(true, false, false) });
    panel.SwitchToDefaultLayoutMode();
    expect(panel.Properties).toEqual([]);
  });

  it('fails closed on CanEditCustomSql for non-Owner or missing user Type, while still allowing non-Owners to turn Custom SQL OFF', () => {
    const panel = makePanel(null);
    open(panel);

    // Null CurrentUser fails closed
    expect(panel.CanEdit).toBe(true);
    expect(panel.CanEditCustomSql).toBe(false);

    // Blank / whitespace Type fails closed
    panel.Provider = makeProvider({ ID: 'user-blank', Type: '   ' as UserInfo['Type'] });
    expect(panel.CanEditCustomSql).toBe(false);

    // Standard 'User' Type cannot enable or edit Custom SQL
    panel.Provider = makeProvider({ ID: 'user-regular', Type: 'User' });
    expect(panel.CanEditCustomSql).toBe(false);

    panel.ToggleAdvancedMode();
    panel.SetFilterMode('sql');
    panel.OnToggleCustomWhereOverride(true);
    expect(panel.CustomWhereClause).toBe(false);
    panel.OnCustomSqlWhereChange("[Status] = 'Active'");
    expect(panel.WhereClause).toBe('');

    // Non-Owner opening an editable view that ALREADY has CustomWhereClause=true sees a Read-Only
    // label, cannot edit the SQL text, CAN turn the override OFF, and cannot turn it back ON
    const inheritedCustomView = makeView({
      CustomWhereClause: true,
      WhereClause: "[Status] = 'Active'",
      UserCanEdit: true,
    });
    panel.ViewEntity = inheritedCustomView;
    panel.DefaultSaveAsNew = false;
    open(panel);

    expect(panel.CustomWhereClause).toBe(true);
    expect(panel.FilterMode).toBe('sql');
    expect(panel.CanEdit).toBe(true);
    expect(panel.CanEditCustomSql).toBe(false);
    expect(panel.SqlWhereSourceLabel).toBe('Custom SQL Override (Read-Only)');

    panel.OnCustomSqlWhereChange('1 = 1');
    expect(panel.WhereClause).toBe("[Status] = 'Active'");

    panel.OnToggleCustomWhereOverride(false);
    expect(panel.CustomWhereClause).toBe(false);

    panel.OnToggleCustomWhereOverride(true);
    expect(panel.CustomWhereClause).toBe(false);

    // Owner-type user can enable and edit Custom SQL WHERE clauses
    panel.Provider = makeProvider({ ID: 'user-owner', Type: 'Owner' });
    expect(panel.CanEditCustomSql).toBe(true);
    panel.OnToggleCustomWhereOverride(true);
    expect(panel.CustomWhereClause).toBe(true);
    expect(panel.SqlWhereSourceLabel).toBe('Custom SQL Override (Editable)');
    panel.OnCustomSqlWhereChange("[Status] = 'Pending'");
    expect(panel.WhereClause).toBe("[Status] = 'Pending'");
  });
});
