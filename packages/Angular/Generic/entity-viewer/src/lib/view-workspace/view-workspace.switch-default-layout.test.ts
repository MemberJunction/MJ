import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { SimpleChange, type ChangeDetectorRef } from '@angular/core';
import type {
  BaseEntity,
  BaseEntityResult,
  CompositeKey,
  EntityFieldInfo,
  EntityInfo,
  IMetadataProvider,
  UserInfo,
} from '@memberjunction/core';
import { UserInfoEngine, type MJUserViewEntityExtended } from '@memberjunction/core-entities';
import { CompositeFilterDescriptor } from '@memberjunction/ng-filter-builder';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { ViewWorkspaceComponent } from './view-workspace.component';
import { ViewConfigPanelComponent, type ViewSaveEvent } from '../view-config-panel/view-config-panel.component';

/**
 * Issue #6037 — ViewWorkspaceComponent coverage for:
 *  1. Switching from "New Saved View" to "Personal Default Layout" while a saved view X is selected:
 *     - Cancelling/closing the Studio preserves X, grid selection, and host URL deep link (no premature ViewSelected(null)).
 *     - Saving Default Layout writes `default-view-setting/<Entity>`, deselects X (and any ad-hoc AlternateBaseView),
 *       emits `ViewSelected(null)` / `SelectedViewChange(null)`, and never calls `X.Save()`.
 *  2. Surfacing user-visible `MJNotificationService` error notifications across all view save/delete/duplicate/default-setting
 *     failure paths (including empty `CompleteMessage` fallback), and warning notifications when a non-Owner saves a copy
 *     or duplicates a `CustomWhereClause` view.
 */

const ENTITY_ID = 'entity-1';
const USER_ID = 'user-1';

const traditionalFilter: CompositeFilterDescriptor = {
  logic: 'and',
  filters: [{ field: 'Status', operator: 'eq', value: 'Active' }],
};

interface FakeViewRecord {
  ID: string;
  Name: string;
  Description: string;
  EntityID: string;
  UserID: string;
  IsShared: boolean;
  IsDefault: boolean;
  GridStateObject: MJUserViewEntityExtended['GridStateObject'];
  SortStateObject: MJUserViewEntityExtended['SortStateObject'];
  DisplayStateObject?: MJUserViewEntityExtended['DisplayStateObject'];
  PropertiesObject?: MJUserViewEntityExtended['PropertiesObject'];
  SmartFilterEnabled: boolean;
  SmartFilterPrompt: string;
  FilterState: string;
  GridState: string | null;
  SortState: string | null;
  CardState: string | null;
  DisplayState: string;
  ViewTypeID: string | null;
  AlternateBaseView: string | null;
  Properties: string | null;
  CustomWhereClause?: boolean;
  WhereClause?: string;
  Save: ReturnType<typeof vi.fn>;
  Delete: ReturnType<typeof vi.fn>;
  Load: ReturnType<typeof vi.fn>;
  LatestResult: Partial<BaseEntityResult> | null;
}

function makeFakeView(overrides: Partial<FakeViewRecord> = {}): FakeViewRecord {
  return {
    ID: 'new-view-1',
    Name: '',
    Description: '',
    EntityID: ENTITY_ID,
    UserID: USER_ID,
    IsShared: false,
    IsDefault: false,
    GridStateObject: null,
    SortStateObject: null,
    SmartFilterEnabled: false,
    SmartFilterPrompt: '',
    FilterState: '',
    GridState: null,
    SortState: null,
    CardState: null,
    DisplayState: '',
    ViewTypeID: null,
    AlternateBaseView: null,
    Properties: null,
    Save: vi.fn().mockResolvedValue(true),
    Delete: vi.fn().mockResolvedValue(true),
    Load: vi.fn().mockResolvedValue(true),
    LatestResult: null,
    ...overrides,
  };
}

function asViewEntity(view: FakeViewRecord): MJUserViewEntityExtended {
  return view as Partial<MJUserViewEntityExtended> as MJUserViewEntityExtended;
}

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

function makeEntity(): EntityInfo {
  const entity: Partial<EntityInfo> = {
    ID: ENTITY_ID,
    Name: 'Accounts',
    DisplayNameOrName: 'Accounts',
    GetDeniedReadFields: () => new Set<string>(),
    Fields: [
      makeField({ ID: 'f1', Name: 'AccountName', DisplayNameOrName: 'Account Name', DefaultColumnWidth: 200 }),
      makeField({ ID: 'f2', Name: 'Status', DisplayNameOrName: 'Status', DefaultColumnWidth: 120 }),
    ],
  };
  return entity as EntityInfo;
}

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

describe('ViewWorkspaceComponent — Default Layout switch & view operation notifications (#6037)', () => {
  let component: ViewWorkspaceComponent;
  let setSetting: Mock<UserInfoEngine['SetSetting']>;
  let createdView: FakeViewRecord;
  let getEntityObject: Mock<
    (entityName: string, secondArg?: UserInfo | CompositeKey, thirdArg?: UserInfo) => Promise<FakeViewRecord>
  >;
  let notifySpy: Mock<MJNotificationService['CreateSimpleNotification']>;

  function setProviderUser(user: Partial<UserInfo>): void {
    const providerGetEntityObject: IMetadataProvider['GetEntityObject'] = async <T extends BaseEntity>(
      entityName: string,
      secondArg?: UserInfo | CompositeKey,
      thirdArg?: UserInfo
    ): Promise<T> => {
      const entity: BaseEntity = asViewEntity(await getEntityObject(entityName, secondArg, thirdArg));
      return entity as T;
    };

    const provider: Partial<IMetadataProvider> = {
      GetEntityObject: providerGetEntityObject,
      CurrentUser: user as UserInfo,
    };
    component.Provider = provider as IMetadataProvider;
  }

  beforeEach(() => {
    const cdr: Partial<ChangeDetectorRef> = { detectChanges: vi.fn(), markForCheck: vi.fn() };
    component = new ViewWorkspaceComponent(cdr as ChangeDetectorRef);

    setSetting = vi.fn<UserInfoEngine['SetSetting']>().mockResolvedValue(true);
    const fakeUserEngine: Partial<UserInfoEngine> = {
      SetSetting: setSetting,
      GetSetting: vi.fn<UserInfoEngine['GetSetting']>().mockReturnValue(undefined),
    };
    vi.spyOn(UserInfoEngine, 'Instance', 'get').mockReturnValue(fakeUserEngine as UserInfoEngine);

    notifySpy = vi.fn<MJNotificationService['CreateSimpleNotification']>();
    const fakeNotify: Partial<MJNotificationService> = {
      CreateSimpleNotification: notifySpy,
    };
    vi.spyOn(MJNotificationService, 'Instance', 'get').mockReturnValue(fakeNotify as MJNotificationService);

    createdView = makeFakeView();
    getEntityObject = vi
      .fn<(entityName: string, secondArg?: UserInfo | CompositeKey, thirdArg?: UserInfo) => Promise<FakeViewRecord>>()
      .mockResolvedValue(createdView);
    setProviderUser({ ID: USER_ID, Type: 'User' });

    component.AutoSaveView = true;
    component.Entity = makeEntity();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('commits deselection of the saved view (and ad-hoc AlternateBaseView) when saving Personal Default Layout, never overwriting X', async () => {
    const existingView = makeFakeView({
      ID: 'view-saved-x',
      Name: 'Saved View X',
      SmartFilterEnabled: true,
      SmartFilterPrompt: 'Starts with A',
      FilterState: JSON.stringify(traditionalFilter),
    });

    component.AlternateBaseView = 'ActiveOnly';
    component.CurrentViewEntity = asViewEntity(existingView);
    component.SelectedViewId = existingView.ID;

    const viewSelectedEvents: Array<MJUserViewEntityExtended | null> = [];
    const abvEvents: Array<string | null> = [];
    component.ViewSelected.subscribe(v => viewSelectedEvents.push(v));
    component.AlternateBaseViewChange.subscribe(abv => abvEvents.push(abv));

    // 1. User chooses "New Saved View"
    component.OnSaveViewRequested({ SaveAsNew: true });
    expect(component.DefaultSaveAsNew).toBe(true);
    expect(component.IsConfigPanelOpen).toBe(true);

    // Connect real ViewConfigPanelComponent to the workspace
    const cdr: Partial<ChangeDetectorRef> = { detectChanges: vi.fn(), markForCheck: vi.fn() };
    const panel = new ViewConfigPanelComponent(cdr as ChangeDetectorRef);
    panel.Provider = component.Provider;
    panel.Entity = makeEntity();
    panel.ViewEntity = component.CurrentViewEntity;
    panel.DefaultSaveAsNew = component.DefaultSaveAsNew;
    panel.PendingNewViewAlternateBaseView = component.PendingNewViewAlternateBaseView;
    panel.IsOpen = true;
    panel.ngOnChanges({ IsOpen: new SimpleChange(false, true, false) });

    panel.SwitchToDefaultLayout.subscribe(() => component.OnSwitchToDefaultLayout());
    panel.SaveDefaults.subscribe(e => { void component.OnSaveDefaultViewSettings(e); });

    // 2. User switches to "Personal Default Layout" inside the open Studio
    panel.SwitchToDefaultLayoutMode();

    expect(panel.ViewEntity).toBeNull();
    expect(panel.IsCreatingNamedView).toBe(false);
    expect(component.DefaultSaveAsNew).toBe(false);
    // Before saving, X stays selected and ViewSelected(null) has NOT fired yet
    expect(component.CurrentViewEntity).toBe(asViewEntity(existingView));
    expect(viewSelectedEvents).toHaveLength(0);

    // 3. User commits "Save Default Layout"
    panel.OnSaveDefaults();
    await Promise.resolve();

    expect(setSetting).toHaveBeenCalledTimes(1);
    expect(existingView.Save).not.toHaveBeenCalled();
    expect(existingView.Name).toBe('Saved View X');
    expect(existingView.SmartFilterPrompt).toBe('Starts with A');
    expect(JSON.parse(existingView.FilterState)).toEqual(traditionalFilter);

    expect(component.CurrentViewEntity).toBeNull();
    expect(component.SelectedViewId).toBeNull();
    expect(component.EffectiveAlternateBaseView).toBeNull();
    expect(component.IsConfigPanelOpen).toBe(false);
    expect(viewSelectedEvents).toEqual([null]);
    expect(abvEvents).toEqual([null]);
  });

  it('deselects the saved view (and ad-hoc AlternateBaseView) and emits SaveDefaultsRequested when AutoSaveView is false', async () => {
    const existingView = makeFakeView({
      ID: 'view-saved-x',
      Name: 'Saved View X',
    });

    component.AutoSaveView = false;
    component.AlternateBaseView = 'ActiveOnly';
    component.CurrentViewEntity = asViewEntity(existingView);
    component.SelectedViewId = existingView.ID;
    component.PendingNewViewName = 'Draft View Name';
    component.IsConfigPanelOpen = true;

    const viewSelectedEvents: Array<MJUserViewEntityExtended | null> = [];
    const selectedViewChangeEvents: Array<MJUserViewEntityExtended | null> = [];
    const abvEvents: Array<string | null> = [];
    const saveDefaultsRequestedEvents: ViewSaveEvent[] = [];
    component.ViewSelected.subscribe(v => viewSelectedEvents.push(v));
    component.SelectedViewChange.subscribe(v => selectedViewChangeEvents.push(v));
    component.AlternateBaseViewChange.subscribe(abv => abvEvents.push(abv));
    component.SaveDefaultsRequested.subscribe(e => saveDefaultsRequestedEvents.push(e));

    const saveEvent = makeSaveEvent();
    await component.OnSaveDefaultViewSettings(saveEvent);

    expect(setSetting).not.toHaveBeenCalled();
    expect(existingView.Save).not.toHaveBeenCalled();
    expect(saveDefaultsRequestedEvents).toEqual([saveEvent]);
    expect(component.CurrentViewEntity).toBeNull();
    expect(component.SelectedViewId).toBeNull();
    expect(component.EffectiveAlternateBaseView).toBeNull();
    expect(component.IsConfigPanelOpen).toBe(false);
    expect(component.PendingNewViewName).toBe('');
    expect(viewSelectedEvents).toEqual([null]);
    expect(selectedViewChangeEvents).toEqual([null]);
    expect(abvEvents).toEqual([null]);
  });

  it('preserves the selected view and emits no ViewSelected(null) when the user switches to Personal Default Layout and then cancels', () => {
    const existingView = makeFakeView({
      ID: 'view-saved-x',
      Name: 'Saved View X',
      SmartFilterEnabled: true,
      SmartFilterPrompt: 'Starts with A',
    });

    component.CurrentViewEntity = asViewEntity(existingView);
    component.SelectedViewId = existingView.ID;

    const viewSelectedEvents: Array<MJUserViewEntityExtended | null> = [];
    component.ViewSelected.subscribe(v => viewSelectedEvents.push(v));

    component.OnSaveViewRequested({ SaveAsNew: true });
    component.OnSwitchToDefaultLayout();
    component.OnCloseConfigPanel();

    expect(component.IsConfigPanelOpen).toBe(false);
    expect(component.CurrentViewEntity).toBe(asViewEntity(existingView));
    expect(component.SelectedViewId).toBe('view-saved-x');
    expect(viewSelectedEvents).toHaveLength(0);
  });

  it('surfaces an error notification when updating a saved view fails (and falls back cleanly on blank CompleteMessage)', async () => {
    const serverMessage =
      'Only an administrator (Owner-type user) may create or modify a view with CustomWhereClause enabled — the custom WhereClause is executed as raw SQL.';
    const existingView = makeFakeView({
      ID: 'view-custom-sql',
      Name: 'My View',
      Save: vi.fn().mockResolvedValue(false),
      LatestResult: { CompleteMessage: serverMessage },
    });

    component.CurrentViewEntity = asViewEntity(existingView);
    component.IsConfigPanelOpen = true;

    const saved = await component.OnSaveView(
      makeSaveEvent({
        Name: 'My View',
        SaveAsNew: false,
        CustomWhereClause: true,
        WhereClause: "[Status] = 'Active'",
      })
    );

    expect(saved).toBe(false);
    expect(component.IsConfigPanelOpen).toBe(true);
    expect(notifySpy).toHaveBeenCalledTimes(1);
    expect(notifySpy).toHaveBeenCalledWith(`Failed to update view: ${serverMessage}`, 'error', 5000);

    // Blank CompleteMessage falls back to 'unknown error' without a bare trailing colon
    existingView.LatestResult = { CompleteMessage: '   ' };
    await component.OnSaveView(makeSaveEvent({ Name: 'My View', SaveAsNew: false }));
    expect(notifySpy).toHaveBeenLastCalledWith('Failed to update view: unknown error', 'error', 5000);
  });

  it('surfaces an error notification when creating a new view fails', async () => {
    const serverMessage =
      'Only an administrator (Owner-type user) may create or modify a view with CustomWhereClause enabled — the custom WhereClause is executed as raw SQL.';
    createdView.Save = vi.fn().mockResolvedValue(false);
    createdView.LatestResult = { CompleteMessage: serverMessage };
    component.IsConfigPanelOpen = true;

    const saved = await component.OnSaveView(
      makeSaveEvent({
        Name: 'New Custom SQL View',
        SaveAsNew: true,
        CustomWhereClause: true,
        WhereClause: "[Status] = 'Active'",
      })
    );

    expect(saved).toBe(false);
    expect(component.IsConfigPanelOpen).toBe(true);
    expect(notifySpy).toHaveBeenCalledTimes(1);
    expect(notifySpy).toHaveBeenCalledWith(`Failed to create view: ${serverMessage}`, 'error', 5000);
  });

  it('notifies a non-Owner user (including empty user Type) with a warning when copying a CustomWhereClause view strips the custom SQL', async () => {
    const sharedCustomSqlView = makeFakeView({
      ID: 'view-owner-shared',
      Name: 'Owner SQL View',
      UserID: 'owner-user-99',
      CustomWhereClause: true,
      WhereClause: "[Status] = 'Active'",
    });

    component.CurrentViewEntity = asViewEntity(sharedCustomSqlView);
    setProviderUser({ ID: USER_ID, Type: '' as UserInfo['Type'] });

    const saved = await component.OnSaveView(
      makeSaveEvent({
        Name: 'Owner SQL View (Copy)',
        SaveAsNew: true,
        CustomWhereClause: true,
        WhereClause: "[Status] = 'Active'",
      })
    );

    expect(saved).toBe(true);
    expect(createdView.CustomWhereClause).toBeUndefined();
    expect(notifySpy).toHaveBeenCalledTimes(1);
    expect(notifySpy).toHaveBeenCalledWith(
      'Saved copy without the custom SQL WHERE clause — only administrators (Owner-type users) can create views with custom SQL.',
      'warning',
      5000
    );
  });

  it('surfaces an error notification and keeps the panel open when OnSaveDefaultViewSettings fails', async () => {
    const existingView = makeFakeView({ ID: 'view-x', Name: 'View X' });
    component.CurrentViewEntity = asViewEntity(existingView);
    component.SelectedViewId = existingView.ID;
    component.IsConfigPanelOpen = true;
    setSetting.mockResolvedValueOnce(false);

    await component.OnSaveDefaultViewSettings(makeSaveEvent());

    expect(notifySpy).toHaveBeenCalledTimes(1);
    expect(notifySpy).toHaveBeenCalledWith('Failed to save default view settings.', 'error', 5000);
    expect(component.IsConfigPanelOpen).toBe(true);
    expect(component.CurrentViewEntity).toBe(asViewEntity(existingView));
  });

  it('surfaces an error notification when OnDeleteView fails', async () => {
    const existingView = makeFakeView({
      ID: 'view-del',
      Name: 'Locked View',
      Delete: vi.fn().mockResolvedValue(false),
      LatestResult: { CompleteMessage: 'Referenced by dashboard' },
    });
    component.CurrentViewEntity = asViewEntity(existingView);
    component.SelectedViewId = existingView.ID;
    component.IsConfigPanelOpen = true;

    await component.OnDeleteView();

    expect(notifySpy).toHaveBeenCalledTimes(1);
    expect(notifySpy).toHaveBeenCalledWith('Failed to delete view: Referenced by dashboard', 'error', 5000);
    expect(component.CurrentViewEntity).toBe(asViewEntity(existingView));
    expect(component.IsConfigPanelOpen).toBe(true);
  });

  it('surfaces error notifications on duplicate Load/Save failures, and handles CustomWhereClause on duplicate for Owner vs non-Owner', async () => {
    // 1. Load failure (empty CompleteMessage -> 'not found')
    const failedSource = makeFakeView({
      Load: vi.fn().mockResolvedValue(false),
      LatestResult: { CompleteMessage: '' },
    });
    getEntityObject.mockResolvedValueOnce(failedSource);

    component.OnDuplicateViewRequested('missing-view-id');
    await component.OnDuplicateConfirmed({ Name: 'Copy 1' });

    expect(notifySpy).toHaveBeenCalledTimes(1);
    expect(notifySpy).toHaveBeenCalledWith('Could not load view to duplicate: not found', 'error', 5000);

    // 2. Save failure during duplicate
    notifySpy.mockClear();
    const validSource = makeFakeView({
      ID: 'source-1',
      CustomWhereClause: false,
    });
    const failedDest = makeFakeView({
      Save: vi.fn().mockResolvedValue(false),
      LatestResult: { CompleteMessage: 'Quota exceeded' },
    });
    getEntityObject.mockResolvedValueOnce(validSource).mockResolvedValueOnce(failedDest);

    component.OnDuplicateViewRequested('source-1');
    await component.OnDuplicateConfirmed({ Name: 'Copy 2' });

    expect(notifySpy).toHaveBeenCalledTimes(1);
    expect(notifySpy).toHaveBeenCalledWith('Failed to duplicate view: Quota exceeded', 'error', 5000);

    // 3. Non-Owner duplicating a CustomWhereClause view strips CustomWhereClause and warns
    notifySpy.mockClear();
    const customSqlSource = makeFakeView({
      ID: 'source-sql',
      CustomWhereClause: true,
      WhereClause: "[Status] = 'Active'",
    });
    const nonOwnerCopy = makeFakeView();
    setProviderUser({ ID: USER_ID, Type: 'User' });
    getEntityObject.mockResolvedValueOnce(customSqlSource).mockResolvedValueOnce(nonOwnerCopy);

    component.OnDuplicateViewRequested('source-sql');
    await component.OnDuplicateConfirmed({ Name: 'Non-Owner Copy' });

    expect(nonOwnerCopy.CustomWhereClause).toBeUndefined();
    expect(nonOwnerCopy.WhereClause).toBeUndefined();
    expect(notifySpy).toHaveBeenCalledTimes(1);
    expect(notifySpy).toHaveBeenCalledWith(
      'Saved copy without the custom SQL WHERE clause — only administrators (Owner-type users) can create views with custom SQL.',
      'warning',
      5000
    );

    // 4. Owner duplicating a CustomWhereClause view preserves CustomWhereClause and WhereClause with no warning
    notifySpy.mockClear();
    const ownerCopy = makeFakeView();
    setProviderUser({ ID: 'owner-1', Type: 'Owner' });
    getEntityObject.mockResolvedValueOnce(customSqlSource).mockResolvedValueOnce(ownerCopy);

    component.OnDuplicateViewRequested('source-sql');
    await component.OnDuplicateConfirmed({ Name: 'Owner Copy' });

    expect(ownerCopy.CustomWhereClause).toBe(true);
    expect(ownerCopy.WhereClause).toBe("[Status] = 'Active'");
    expect(notifySpy).not.toHaveBeenCalled();
  });
});
