import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ChangeDetectorRef } from '@angular/core';
import type { EntityFieldInfo, EntityInfo, IMetadataProvider } from '@memberjunction/core';
import { UserInfoEngine } from '@memberjunction/core-entities';
import { CompositeFilterDescriptor } from '@memberjunction/ng-filter-builder';
import { ViewWorkspaceComponent } from './view-workspace.component';
import { ColumnConfig, SortItem, ViewSaveEvent } from '../view-config-panel/view-config-panel.component';

/**
 * Issue #4220 — "Save" on the default (unsaved) view silently dropped Smart/Traditional filters.
 *
 * The config panel always emitted the filter fields; `OnSaveDefaultViewSettings` threw them away,
 * because the `default-view-setting/<Entity>` user setting it writes is a `IGridState` with no
 * filter slot. A default-view Save that carries a filter is really a *view creation missing a
 * name*, so it now forks into the existing quick-save → `persistNewView` flow instead.
 *
 * Also covered: `executeQuickSave` used to hard-code `SmartFilterEnabled: false` /
 * `SmartFilterPrompt: ''`, so a smart filter was lost on the quick-save path too.
 */

const ENTITY_ID = 'entity-1';
const USER_ID = 'user-1';

/** A saved view stub — `persistNewView` only assigns to it and reads ID/Name back. */
interface FakeViewEntity {
  ID: string;
  Name: string;
  Description: string;
  EntityID: string;
  UserID: string;
  IsShared: boolean;
  IsDefault: boolean;
  GridStateObject: unknown;
  SortStateObject: unknown;
  SmartFilterEnabled: boolean;
  SmartFilterPrompt: string;
  FilterState: string;
  GridState: string | null;
  Save: ReturnType<typeof vi.fn>;
  LatestResult: unknown;
}

function makeFakeView(): FakeViewEntity {
  return {
    ID: 'new-view-1',
    Name: '',
    Description: '',
    EntityID: '',
    UserID: '',
    IsShared: false,
    IsDefault: false,
    GridStateObject: null,
    SortStateObject: null,
    SmartFilterEnabled: false,
    SmartFilterPrompt: '',
    FilterState: '',
    GridState: null,
    Save: vi.fn().mockResolvedValue(true),
    LatestResult: null,
  };
}

/** Minimal EntityInfo — `buildGridState` falls back to DefaultInView fields when Columns is empty. */
function makeEntity(): EntityInfo {
  return {
    ID: ENTITY_ID,
    Name: 'Accounts',
    DisplayNameOrName: 'Accounts',
    Fields: [
      { ID: 'f1', Name: 'AccountName', DisplayNameOrName: 'Account Name', DefaultInView: true, DefaultColumnWidth: 200 },
      { ID: 'f2', Name: 'Status', DisplayNameOrName: 'Status', DefaultInView: true, DefaultColumnWidth: 120 },
    ],
  } as unknown as EntityInfo;
}

/** Build a ViewSaveEvent the way the config panel's OnSaveDefaults() does. */
function makeSaveEvent(overrides: Partial<ViewSaveEvent> = {}): ViewSaveEvent {
  return {
    Name: 'Default',
    Description: '',
    IsShared: false,
    SaveAsNew: false,
    Columns: [],
    SortField: null,
    SortDirection: 'asc',
    SortItems: [],
    SmartFilterEnabled: false,
    SmartFilterPrompt: '',
    FilterState: null,
    AggregatesConfig: null,
    ...overrides,
  };
}

const traditionalFilter: CompositeFilterDescriptor = {
  logic: 'and',
  filters: [{ field: 'Status', operator: 'eq', value: 'Active' }],
} as unknown as CompositeFilterDescriptor;

describe('ViewWorkspaceComponent — default-view Save with a filter (#4220)', () => {
  let component: ViewWorkspaceComponent;
  let setSetting: ReturnType<typeof vi.fn>;
  let createdView: FakeViewEntity;
  let getEntityObject: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const cdr = { detectChanges: vi.fn(), markForCheck: vi.fn() } as unknown as ChangeDetectorRef;
    component = new ViewWorkspaceComponent(cdr);

    setSetting = vi.fn().mockResolvedValue(true);
    vi.spyOn(UserInfoEngine, 'Instance', 'get').mockReturnValue({
      SetSetting: setSetting,
      GetSetting: vi.fn().mockReturnValue(undefined),
    } as unknown as UserInfoEngine);

    createdView = makeFakeView();
    getEntityObject = vi.fn().mockResolvedValue(createdView);
    component.Provider = {
      GetEntityObject: getEntityObject,
      CurrentUser: { ID: USER_ID },
    } as unknown as IMetadataProvider;

    component.AutoSaveView = true;
    (component as unknown as { _entity: EntityInfo })._entity = makeEntity();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('no filter configured — unchanged preferences save', () => {
    it('writes the default-view user setting and creates no view', async () => {
      await component.OnSaveDefaultViewSettings(makeSaveEvent());

      expect(setSetting).toHaveBeenCalledTimes(1);
      expect(setSetting.mock.calls[0][0]).toBe('default-view-setting/Accounts');
      expect(getEntityObject).not.toHaveBeenCalled();
      expect(component.ShowQuickSaveDialog).toBe(false);
    });

    it('treats a smart filter with a blank prompt as no filter', async () => {
      await component.OnSaveDefaultViewSettings(
        makeSaveEvent({ SmartFilterEnabled: true, SmartFilterPrompt: '   ' })
      );

      expect(setSetting).toHaveBeenCalledTimes(1);
      expect(component.ShowQuickSaveDialog).toBe(false);
    });

    it('treats an empty traditional filter list as no filter', async () => {
      await component.OnSaveDefaultViewSettings(
        makeSaveEvent({ FilterState: { logic: 'and', filters: [] } as unknown as CompositeFilterDescriptor })
      );

      expect(setSetting).toHaveBeenCalledTimes(1);
      expect(component.ShowQuickSaveDialog).toBe(false);
    });
  });

  describe('filter configured — promotes to a named view', () => {
    it('opens the name prompt instead of writing preferences (traditional filter)', async () => {
      await component.OnSaveDefaultViewSettings(makeSaveEvent({ FilterState: traditionalFilter }));

      expect(setSetting).not.toHaveBeenCalled();
      expect(getEntityObject).not.toHaveBeenCalled();
      expect(component.ShowQuickSaveDialog).toBe(true);
      expect(component.IsConfigPanelOpen).toBe(false);
    });

    it('opens the name prompt instead of writing preferences (smart filter)', async () => {
      await component.OnSaveDefaultViewSettings(
        makeSaveEvent({ SmartFilterEnabled: true, SmartFilterPrompt: 'active west coast accounts' })
      );

      expect(setSetting).not.toHaveBeenCalled();
      expect(component.ShowQuickSaveDialog).toBe(true);
    });

    it('suggests a name so the user can just click Save', async () => {
      await component.OnSaveDefaultViewSettings(makeSaveEvent({ FilterState: traditionalFilter }));

      expect(component.QuickSaveSuggestedName).toBe('Accounts — Filtered');
    });

    it('suggests a name built from the smart prompt when there is one', async () => {
      await component.OnSaveDefaultViewSettings(
        makeSaveEvent({ SmartFilterEnabled: true, SmartFilterPrompt: 'active west coast accounts' })
      );

      expect(component.QuickSaveSuggestedName).toBe('Accounts — active west coast accounts');
    });

    it('truncates an overlong smart prompt in the suggested name', async () => {
      const longPrompt = 'accounts in california oregon and washington with an open balance over ten thousand';
      await component.OnSaveDefaultViewSettings(
        makeSaveEvent({ SmartFilterEnabled: true, SmartFilterPrompt: longPrompt })
      );

      expect(component.QuickSaveSuggestedName.length).toBeLessThanOrEqual(60);
      expect(component.QuickSaveSuggestedName).toMatch(/…$/);
    });

    it('persists the traditional filter onto the new view once the name is confirmed', async () => {
      await component.OnSaveDefaultViewSettings(makeSaveEvent({ FilterState: traditionalFilter }));

      await component.OnQuickSave({
        Name: 'Active Accounts',
        Description: 'Just the active ones',
        IsShared: false,
        SaveAsNew: true,
      });

      expect(createdView.Save).toHaveBeenCalledTimes(1);
      expect(createdView.Name).toBe('Active Accounts');
      expect(createdView.EntityID).toBe(ENTITY_ID);
      expect(JSON.parse(createdView.FilterState)).toEqual(traditionalFilter);
      expect(setSetting).not.toHaveBeenCalled();
    });

    it('persists the smart filter onto the new view once the name is confirmed', async () => {
      await component.OnSaveDefaultViewSettings(
        makeSaveEvent({ SmartFilterEnabled: true, SmartFilterPrompt: 'active west coast accounts' })
      );

      await component.OnQuickSave({
        Name: 'West Coast',
        Description: '',
        IsShared: false,
        SaveAsNew: true,
      });

      expect(createdView.SmartFilterEnabled).toBe(true);
      expect(createdView.SmartFilterPrompt).toBe('active west coast accounts');
    });

    it('carries the panel columns and sort through the name prompt', async () => {
      const statusColumn: ColumnConfig = {
        fieldId: 'f2',
        fieldName: 'Status',
        displayName: 'Status',
        visible: true,
        width: 90,
        orderIndex: 0,
        field: { ID: 'f2', Name: 'Status' } as EntityFieldInfo,
      };
      const sortItems: SortItem[] = [{ field: 'AccountName', direction: 'desc' }];

      await component.OnSaveDefaultViewSettings(
        makeSaveEvent({ FilterState: traditionalFilter, Columns: [statusColumn], SortItems: sortItems })
      );

      await component.OnQuickSave({ Name: 'Named', Description: '', IsShared: false, SaveAsNew: true });

      const gridState = createdView.GridStateObject as { columnSettings: Array<{ Name: string }> };
      expect(gridState.columnSettings.map(c => c.Name)).toEqual(['Status']);
      expect(createdView.SortStateObject).toEqual([{ field: 'AccountName', direction: 'desc' }]);
    });

    it('routes through the host when AutoSaveView is false, rather than writing preferences', async () => {
      component.AutoSaveView = false;
      const requested: ViewSaveEvent[] = [];
      component.SaveViewRequested.subscribe(e => requested.push(e));
      const defaultsRequested: ViewSaveEvent[] = [];
      component.SaveDefaultsRequested.subscribe(e => defaultsRequested.push(e));

      await component.OnSaveDefaultViewSettings(makeSaveEvent({ FilterState: traditionalFilter }));
      await component.OnQuickSave({ Name: 'Hosted', Description: '', IsShared: false, SaveAsNew: true });

      expect(defaultsRequested).toHaveLength(0);
      expect(requested).toHaveLength(1);
      expect(requested[0].Name).toBe('Hosted');
      expect(requested[0].SaveAsNew).toBe(true);
      expect(requested[0].FilterState).toEqual(traditionalFilter);
    });

    it('discards the staged config when the name prompt is cancelled', async () => {
      await component.OnSaveDefaultViewSettings(makeSaveEvent({ FilterState: traditionalFilter }));
      component.OnQuickSaveClose();

      expect(component.ShowQuickSaveDialog).toBe(false);
      expect(setSetting).not.toHaveBeenCalled();
      expect(getEntityObject).not.toHaveBeenCalled();

      // A later quick-save must not inherit the abandoned filter.
      await component.OnQuickSave({ Name: 'Unrelated', Description: '', IsShared: false, SaveAsNew: true });
      expect(createdView.SmartFilterEnabled).toBe(false);
      expect(JSON.parse(createdView.FilterState)).toEqual({ logic: 'and', filters: [] });
    });
  });

  /**
   * The name prompt offers "Customize columns, filters & sorting…", which reopens the config
   * panel. The panel re-initializes from the entity and wipes its filter state when there is no
   * ViewEntity, so the staged filter has to be handed back to it — otherwise the escape hatch
   * out of this dialog drops the filter, which is the very bug being fixed.
   */
  describe('returning to the config panel from the name prompt', () => {
    it('hands the traditional filter back to the panel', async () => {
      // In the real flow the panel emitted this very object, which it got from FilterDialogState —
      // so re-assigning FilterDialogState is a no-op the panel never sees. It needs its own input.
      component.FilterDialogState = traditionalFilter;
      await component.OnSaveDefaultViewSettings(makeSaveEvent({ FilterState: traditionalFilter }));

      component.OnQuickSaveOpenAdvanced({ Name: 'Partial', Description: '', IsShared: false });

      expect(component.IsConfigPanelOpen).toBe(true);
      expect(component.ShowQuickSaveDialog).toBe(false);
      expect(component.PendingNewViewFilterState).toBe(traditionalFilter);
    });

    it('hands the smart filter back to the panel', async () => {
      await component.OnSaveDefaultViewSettings(
        makeSaveEvent({ SmartFilterEnabled: true, SmartFilterPrompt: 'active west coast accounts' })
      );

      component.OnQuickSaveOpenAdvanced({ Name: 'Partial', Description: '', IsShared: false });

      expect(component.PendingNewViewSmartFilterEnabled).toBe(true);
      expect(component.PendingNewViewSmartFilterPrompt).toBe('active west coast accounts');
    });

    it('keeps the staged save available so a later Create View still carries the filter', async () => {
      await component.OnSaveDefaultViewSettings(
        makeSaveEvent({ SmartFilterEnabled: true, SmartFilterPrompt: 'active west coast accounts' })
      );
      component.OnQuickSaveOpenAdvanced({ Name: 'Partial', Description: '', IsShared: false });

      // The panel's own "Create View" emits a complete event of its own — it must win outright.
      await component.OnSaveView(
        makeSaveEvent({
          Name: 'From Panel',
          SaveAsNew: true,
          SmartFilterEnabled: true,
          SmartFilterPrompt: 'edited in the panel',
        })
      );

      expect(createdView.Name).toBe('From Panel');
      expect(createdView.SmartFilterPrompt).toBe('edited in the panel');
    });

    it('clears the carried-over smart filter once the panel is closed', async () => {
      await component.OnSaveDefaultViewSettings(
        makeSaveEvent({ SmartFilterEnabled: true, SmartFilterPrompt: 'active west coast accounts' })
      );
      component.OnQuickSaveOpenAdvanced({ Name: 'Partial', Description: '', IsShared: false });
      component.OnCloseConfigPanel();

      expect(component.PendingNewViewSmartFilterEnabled).toBe(false);
      expect(component.PendingNewViewSmartFilterPrompt).toBe('');
      expect(component.PendingNewViewFilterState).toBeNull();
    });
  });

  describe('an entity change abandons the staged save', () => {
    it('does not carry the old entity\'s staged filter or suggested name into the new entity', async () => {
      component.ngOnInit();
      await component.OnSaveDefaultViewSettings(makeSaveEvent({ FilterState: traditionalFilter }));

      component.Entity = { ...makeEntity(), ID: 'entity-2', Name: 'Contacts', DisplayNameOrName: 'Contacts' } as unknown as EntityInfo;

      expect(component.ShowQuickSaveDialog).toBe(false);
      expect(component.QuickSaveSuggestedName).toBe('');
      expect(component.DefaultSaveAsNew).toBe(false);

      await component.OnQuickSave({ Name: 'Contacts View', Description: '', IsShared: false, SaveAsNew: true });
      expect(JSON.parse(createdView.FilterState)).toEqual({ logic: 'and', filters: [] });
    });
  });

  describe('a failed save keeps the staged filter', () => {
    it('reopens the name prompt with the staged filter intact when Save() fails', async () => {
      createdView.Save.mockResolvedValueOnce(false);
      await component.OnSaveDefaultViewSettings(makeSaveEvent({ FilterState: traditionalFilter }));

      await component.OnQuickSave({ Name: 'Active Accounts', Description: '', IsShared: false, SaveAsNew: true });

      expect(component.ShowQuickSaveDialog).toBe(true);
      expect(component.QuickSaveSuggestedName).toBe('Active Accounts');

      // Retrying from the reopened prompt still carries the filter.
      await component.OnQuickSave({ Name: 'Active Accounts', Description: '', IsShared: false, SaveAsNew: true });
      expect(createdView.Save).toHaveBeenCalledTimes(2);
      expect(JSON.parse(createdView.FilterState)).toEqual(traditionalFilter);
      expect(component.ShowQuickSaveDialog).toBe(false);
      expect(component.QuickSaveSuggestedName).toBe('');
    });

    it('reopens the name prompt when a host cancels BeforeViewSave', async () => {
      component.BeforeViewSave.subscribe(e => { e.Cancel = true; });
      await component.OnSaveDefaultViewSettings(makeSaveEvent({ FilterState: traditionalFilter }));

      await component.OnQuickSave({ Name: 'Blocked', Description: '', IsShared: false, SaveAsNew: true });

      expect(createdView.Save).not.toHaveBeenCalled();
      expect(component.ShowQuickSaveDialog).toBe(true);

      // Cancelling from there abandons it cleanly.
      component.OnQuickSaveClose();
      expect(component.QuickSaveSuggestedName).toBe('');
      expect(component.DefaultSaveAsNew).toBe(false);
    });
  });

  describe('quick-save no longer hard-codes the smart-filter fields', () => {
    it('carries a staged smart filter through the plain quick-save path', async () => {
      // Panel stages a smart filter, then the user picks the plain quick-save route.
      await component.OnSaveDefaultViewSettings(
        makeSaveEvent({ SmartFilterEnabled: true, SmartFilterPrompt: 'open opportunities' })
      );

      await component.OnQuickSave({ Name: 'Open Opps', Description: '', IsShared: false, SaveAsNew: true });

      expect(createdView.SmartFilterEnabled).toBe(true);
      expect(createdView.SmartFilterPrompt).toBe('open opportunities');
    });

    it('still honours the filter dialog state when nothing is staged', async () => {
      component.FilterDialogState = traditionalFilter;

      await component.OnQuickSave({ Name: 'From Dialog', Description: '', IsShared: false, SaveAsNew: true });

      expect(JSON.parse(createdView.FilterState)).toEqual(traditionalFilter);
      expect(createdView.SmartFilterEnabled).toBe(false);
    });
  });
});
