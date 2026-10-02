import { describe, it, expect, vi } from 'vitest';
import type { Mock } from 'vitest';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { IMetadataProvider, RunViewParams } from '@memberjunction/core';
import { DashboardEngine } from '@memberjunction/core-entities';
import type { MJDashboardEntityExtended, MJDashboardUserPreferenceEntity } from '@memberjunction/core-entities';
import { HomeDashboardTabsService } from '@memberjunction/ng-shared';
import {
  RenderComponentFixture,
  Query,
  QueryAll,
  Text,
  Click,
  Capture,
  UseFakeGlobalProvider,
  StubEmptyStateComponent,
  StubLoadingComponent,
} from '@memberjunction/ng-test-utils';
import { DashboardPreferencesDialogComponent, DashboardPreferencesResult } from './dashboard-preferences-dialog.component';

/**
 * DOM coverage for <mj-dashboard-preferences-dialog> — the two-panel (Available / Configured)
 * dashboard-ordering dialog that Home uses as "Manage home dashboards".
 * Doubles: DashboardEngine (the dashboards the user can read), HomeDashboardTabsService (the Home
 * tabs and the customized marker), and a fake `[Provider]` whose RunView returns stored preference
 * rows and whose GetEntityObject returns new rows. The MJ UI kit (mj-dialog / mj-dialog-actions /
 * mj-empty-state / mj-loading) is replaced with light standalone stubs; CDK drag-drop and
 * FormsModule (the mode radios use ngModel) are real.
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

/** An OnPush parent like Home: it never marks itself dirty for the dialog. */
@Component({
  standalone: false,
  selector: 'test-on-push-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<mj-dashboard-preferences-dialog Scope="Global" [Provider]="Provider"></mj-dashboard-preferences-dialog>',
})
class OnPushHostComponent {
  @Input() Provider: IMetadataProvider | null = null;
}

const USER_ID = 'U0000000-0000-4000-8000-000000000001';

type DashRow = Pick<MJDashboardEntityExtended, 'ID' | 'Name' | 'Description' | 'Type' | 'Scope' | 'ApplicationID'>;

const dashboard = (
  n: string,
  Name: string,
  Type: DashRow['Type'] = 'Config',
  Scope: DashRow['Scope'] = 'Global',
  ApplicationID: string | null = null
): DashRow => ({
  ID: `D1000000-0000-4000-8000-00000000000${n}`,
  Name,
  Description: n === 'a' ? 'first' : null,
  Type,
  Scope,
  ApplicationID,
});

const ALPHA = dashboard('a', 'Alpha Dashboard');
const BETA = dashboard('b', 'Beta Dashboard');
const GAMMA = dashboard('c', 'Gamma Dashboard');
const CODE = dashboard('d', 'Code Dashboard', 'Code');
const DYNAMIC = dashboard('e', 'Skip Dashboard', 'Dynamic Code');
const APP_SCOPED = dashboard('f', 'App Dashboard', 'Config', 'App', 'A0000000-0000-4000-8000-000000000001');
const PRIVATE = dashboard('9', 'Private Dashboard');

const asDashboards = (rows: DashRow[]) => rows as unknown as MJDashboardEntityExtended[];

type PreferenceFields = Pick<MJDashboardUserPreferenceEntity, 'ID' | 'UserID' | 'DashboardID' | 'DisplayOrder' | 'Scope' | 'ApplicationID'>;

/** A stored MJ: Dashboard User Preferences row, as the dialog reads and writes it. */
interface FakePreferenceRow extends PreferenceFields {
  LatestResult: { CompleteMessage: string } | null;
  Save: Mock<() => Promise<boolean>>;
  Delete: Mock<() => Promise<boolean>>;
}

function preferenceRow(ID: string, DashboardID: string, DisplayOrder: number, UserID: string | null = USER_ID, saves = true): FakePreferenceRow {
  const row: FakePreferenceRow = {
    ID,
    UserID,
    DashboardID,
    DisplayOrder,
    Scope: 'Global',
    ApplicationID: null,
    LatestResult: null,
    Save: vi.fn(async () => {
      row.LatestResult = saves ? null : { CompleteMessage: 'Duplicate dashboard preference' };
      return saves;
    }),
    Delete: vi.fn(async () => true),
  };
  return row;
}

interface FakeProviderOptions {
  /** 'Owner' makes the user a sysadmin who can edit the system defaults. */
  userType?: string;
  ownRows?: FakePreferenceRow[];
  systemRows?: FakePreferenceRow[];
  /** True when every RunView of stored rows fails. */
  readFails?: boolean;
  /** False when new rows fail to save. */
  newRowsSave?: boolean;
  /** Delay before RunView answers, so the answer lands after any change detection the click scheduled. */
  readDelayMs?: number;
}

interface FakeProviderHandle {
  provider: IMetadataProvider;
  /** Rows the dialog created through GetEntityObject, in order. */
  created: FakePreferenceRow[];
}

/** The filter text of a RunView call. */
const filterText = (params: RunViewParams): string =>
  typeof params.ExtraFilter === 'string' ? params.ExtraFilter : (params.ExtraFilter?.default ?? '');

/** A provider whose RunView returns the system rows for a `UserID IS NULL` filter and the user's own rows otherwise. */
function fakeProvider(options: FakeProviderOptions = {}): FakeProviderHandle {
  const created: FakePreferenceRow[] = [];
  const rowsFor = (params: RunViewParams) =>
    (filterText(params).includes('UserID IS NULL') ? options.systemRows : options.ownRows) ?? [];
  const fake = {
    CurrentUser: { ID: USER_ID, Name: 'Test User', Type: options.userType ?? 'User' },
    Entities: [],
    Roles: [],
    EntityByName: () => undefined,
    RunView: async (params: RunViewParams) => {
      if (options.readDelayMs) await new Promise((resolve) => setTimeout(resolve, options.readDelayMs));
      if (options.readFails) {
        return { Success: false, ErrorMessage: 'The server is unavailable', Results: [], RowCount: 0, TotalRowCount: 0 };
      }
      const rows = rowsFor(params);
      return { Success: true, Results: rows, RowCount: rows.length, TotalRowCount: rows.length };
    },
    GetEntityObject: async () => {
      const row = preferenceRow(`N0000000-0000-4000-8000-00000000000${created.length + 1}`, '', 0, null, options.newRowsSave ?? true);
      created.push(row);
      return row;
    },
  };
  return { provider: fake as unknown as IMetadataProvider, created };
}

/**
 * Replaces the DashboardEngine (global and per-provider) with one whose readable dashboards are
 * `accessible`. `all` is every cached dashboard, including ones the user cannot read.
 */
function stubDashboardEngine(accessible: DashRow[], loadError: Error | null = null, all: DashRow[] = accessible) {
  const engine = {
    Config: vi.fn(async (_forceRefresh?: boolean) => {
      if (loadError) throw loadError;
    }),
    GetAccessibleDashboards: vi.fn((_userId: string) => asDashboards(accessible)),
    get Dashboards() {
      return asDashboards(all);
    },
  };
  vi.spyOn(DashboardEngine, 'Instance', 'get').mockReturnValue(engine as unknown as DashboardEngine);
  vi.spyOn(DashboardEngine, 'GetProviderInstance').mockReturnValue(engine as unknown as DashboardEngine);
  return engine;
}

/** A HomeDashboardTabsService whose Home tabs are the given dashboards. */
function fakeHomeTabs(tabs: DashRow[] = []) {
  return {
    Tabs: vi.fn(() => asDashboards(tabs)),
    MarkCustomized: vi.fn(async () => undefined),
  };
}
type HomeTabsStub = ReturnType<typeof fakeHomeTabs>;

/** Captures console.error, where LogError writes, and returns a reader for the logged messages. */
function captureLoggedErrors(): () => string[] {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  return () => spy.mock.calls.map((call) => String(call[0]));
}

const nextMacrotask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Waits until the condition holds, or about 30 macrotasks pass. */
async function waitUntil(condition: () => boolean): Promise<void> {
  for (let i = 0; i < 30 && !condition(); i++) await nextMacrotask();
  await nextMacrotask();
}

/** Waits for the async load, then runs change detection. The dialog marks itself for check after the load. */
async function settle(fixture: ComponentFixture<DashboardPreferencesDialogComponent>) {
  await waitUntil(() => !fixture.componentInstance.Loading);
  fixture.detectChanges();
}

const IMPORTS = [CommonModule, FormsModule, DragDropModule, StubDialog, StubDialogActions, StubEmptyStateComponent, StubLoadingComponent];

interface RenderOptions {
  provider?: FakeProviderHandle;
  accessible?: DashRow[];
  /** Every cached dashboard; defaults to `accessible`. */
  all?: DashRow[];
  homeTabs?: HomeTabsStub;
  loadError?: Error | null;
}

async function renderLoaded(options: RenderOptions = {}) {
  const handle = options.provider ?? fakeProvider();
  const homeTabs = options.homeTabs ?? fakeHomeTabs();
  const accessible = options.accessible ?? [ALPHA, BETA];
  const engine = stubDashboardEngine(accessible, options.loadError ?? null, options.all ?? accessible);
  const fixture = RenderComponentFixture(DashboardPreferencesDialogComponent, {
    imports: IMPORTS,
    declarations: [DashboardPreferencesDialogComponent],
    providers: [{ provide: HomeDashboardTabsService, useValue: homeTabs }],
    inputs: { Provider: handle.provider, scope: 'Global' },
  });
  await settle(fixture);
  return { fixture, homeTabs, engine, created: handle.created };
}

const names = (fixture: ComponentFixture<unknown>, panel: string) =>
  QueryAll(fixture, `.${panel}-panel .dashboard-name`).map((el) => el.textContent?.trim());

const saveButton = (fixture: ComponentFixture<unknown>) => QueryAll(fixture, '.btn.btn-primary')[0] as HTMLButtonElement;

/** Clicks Save and waits until the save finishes. */
async function save(fixture: ComponentFixture<DashboardPreferencesDialogComponent>) {
  saveButton(fixture).click();
  await waitUntil(() => !fixture.componentInstance.saving);
  fixture.detectChanges();
}

/** Clicks the mode radio and waits until the rows of that mode load. */
async function switchMode(fixture: ComponentFixture<unknown>, dialog: DashboardPreferencesDialogComponent, mode: 'personal' | 'system') {
  Click(fixture, `.preference-mode-selector input[value="${mode}"]`);
  await waitUntil(() => !dialog.Loading);
  fixture.detectChanges();
}

/** The Title the dialog passes to <mj-dialog>. */
const dialogTitle = (fixture: ComponentFixture<unknown>) =>
  (fixture.debugElement.query(By.directive(StubDialog)).componentInstance as StubDialog).Title;

describe('DashboardPreferencesDialogComponent (DOM)', () => {
  it('is titled "Manage home dashboards" once and says what the list is', async () => {
    const { fixture } = await renderLoaded();
    expect(dialogTitle(fixture)).toBe('Manage home dashboards');
    expect(Query(fixture, '.dialog-header h3')).toBeNull();
    expect(Text(fixture, '.scope-indicator')).toBe('Choose the dashboards that show as tabs on your Home page.');
  });

  it('puts Save and Cancel in the dialog footer, Save first', async () => {
    const { fixture } = await renderLoaded();
    expect(Query(fixture, 'mj-dialog > mj-dialog-actions')).not.toBeNull();
    expect(Query(fixture, '.dashboard-preferences-dialog mj-dialog-actions')).toBeNull();
    expect(QueryAll(fixture, 'mj-dialog-actions button').map((b) => b.textContent?.trim())).toEqual(['Save Changes', 'Cancel']);
  });

  it('lists both dashboards in the Available panel after load (no Home tabs → none configured)', async () => {
    const { fixture } = await renderLoaded();
    expect(names(fixture, 'available')).toEqual(['Alpha Dashboard', 'Beta Dashboard']);
    // Configured panel is empty → shows its empty-state stub
    expect(Query(fixture, '.configured-panel .dashboard-item')).toBeNull();
    expect(Query(fixture, '.configured-panel mj-empty-state')).not.toBeNull();
  });

  it('lists only Config dashboards the user can read, including App-scoped ones', async () => {
    const accessible = [BETA, CODE, DYNAMIC, APP_SCOPED, ALPHA];
    const { fixture, engine } = await renderLoaded({ accessible, all: [...accessible, PRIVATE] });
    expect(engine.Config).toHaveBeenCalledWith(false, expect.objectContaining({ ID: USER_ID }), expect.anything());
    expect(engine.GetAccessibleDashboards).toHaveBeenCalledWith(USER_ID);
    expect(names(fixture, 'available')).toEqual(['Alpha Dashboard', 'App Dashboard', 'Beta Dashboard']);
  });

  it('starts from the dashboards Home shows as tabs, in tab order', async () => {
    const homeTabs = fakeHomeTabs([BETA, ALPHA]);
    const { fixture } = await renderLoaded({ accessible: [ALPHA, BETA, GAMMA], homeTabs });
    expect(names(fixture, 'configured')).toEqual(['Beta Dashboard', 'Alpha Dashboard']);
    expect(names(fixture, 'available')).toEqual(['Gamma Dashboard']);
    expect(saveButton(fixture).disabled).toBe(true);
  });

  it('moves a dashboard from Available to Configured when its Add button is clicked', async () => {
    const { fixture } = await renderLoaded();
    const addBtn = Query(fixture, '.available-panel .add-button') as HTMLElement;
    addBtn.click();
    fixture.detectChanges();
    expect(QueryAll(fixture, '.available-panel .dashboard-item').length).toBe(1);
    expect(QueryAll(fixture, '.configured-panel .dashboard-item').length).toBe(1);
    expect(fixture.componentInstance.HasChanges).toBe(true);
  });

  it('enables the Save button only once changes exist', async () => {
    const { fixture } = await renderLoaded();
    expect(saveButton(fixture).disabled).toBe(true);
    (Query(fixture, '.available-panel .add-button') as HTMLElement).click();
    fixture.detectChanges();
    expect(saveButton(fixture).disabled).toBe(false);
  });

  it('emits result {saved:false} when Cancel is clicked', async () => {
    const { fixture } = await renderLoaded();
    const results = Capture<DashboardPreferencesResult>(fixture.componentInstance.Result);
    const cancelBtn = QueryAll(fixture, '.btn.btn-secondary')[0] as HTMLElement;
    cancelBtn.click();
    expect(results).toEqual([{ saved: false }]);
  });

  it('renders the error empty-state and logs the error when the dashboards fail to load', async () => {
    const loggedErrors = captureLoggedErrors();
    const { fixture } = await renderLoaded({ loadError: new Error('network down') });
    // panels are gated behind !loading && !error → not rendered
    expect(Query(fixture, '.preferences-panels')).toBeNull();
    const emptyTitle = Query(fixture, '.dialog-content mj-empty-state .stub-empty-title');
    expect(emptyTitle?.textContent).toContain('Failed to load dashboard preferences');
    expect(loggedErrors()).toContain('Error initializing dashboard preferences dialog');
  });

  describe('saving the Home tabs (personal mode)', () => {
    it('saves the configured list, then marks the user customized, then emits the saved rows', async () => {
      const { fixture, homeTabs, created } = await renderLoaded();
      const results = Capture<DashboardPreferencesResult>(fixture.componentInstance.Result);
      Click(fixture, '.available-panel .add-button');
      fixture.detectChanges();

      await save(fixture);

      expect(created.map((r) => [r.UserID, r.DashboardID, r.DisplayOrder, r.Scope, r.ApplicationID])).toEqual([
        [USER_ID, ALPHA.ID, 1, 'Global', null],
      ]);
      expect(homeTabs.MarkCustomized).toHaveBeenCalledTimes(1);
      expect(created[0].Save.mock.invocationCallOrder[0]).toBeLessThan(homeTabs.MarkCustomized.mock.invocationCallOrder[0]);
      expect(results).toEqual([{ saved: true, preferences: created }]);
    });

    it('copies the Home tabs a user on the system defaults sees into their own rows', async () => {
      const homeTabs = fakeHomeTabs([BETA, ALPHA]);
      const { fixture, created } = await renderLoaded({ accessible: [ALPHA, BETA, GAMMA], homeTabs });
      Click(fixture, '.available-panel .add-button');
      fixture.detectChanges();

      await save(fixture);

      expect(created.map((r) => [r.UserID, r.DashboardID, r.DisplayOrder])).toEqual([
        [USER_ID, BETA.ID, 1],
        [USER_ID, ALPHA.ID, 2],
        [USER_ID, GAMMA.ID, 3],
      ]);
      expect(homeTabs.MarkCustomized).toHaveBeenCalledTimes(1);
    });

    it('deletes the rows of removed dashboards and keeps rows for dashboards the dialog does not list', async () => {
      const alphaRow = preferenceRow('P0000000-0000-4000-8000-000000000001', ALPHA.ID.toLowerCase(), 1);
      const codeRow = preferenceRow('P0000000-0000-4000-8000-000000000002', CODE.ID, 2);
      const provider = fakeProvider({ ownRows: [alphaRow, codeRow] });
      const { fixture, homeTabs } = await renderLoaded({ provider, homeTabs: fakeHomeTabs([ALPHA]) });
      const results = Capture<DashboardPreferencesResult>(fixture.componentInstance.Result);
      Click(fixture, '.configured-panel .remove-button');
      fixture.detectChanges();

      await save(fixture);

      expect(alphaRow.Delete).toHaveBeenCalledTimes(1);
      expect(codeRow.Delete).not.toHaveBeenCalled();
      expect(homeTabs.MarkCustomized).toHaveBeenCalledTimes(1);
      expect(results).toEqual([{ saved: true, preferences: [] }]);
    });

    it('shows the save error, does not mark the user customized, and stays open when a row fails to save', async () => {
      const loggedErrors = captureLoggedErrors();
      const { fixture, homeTabs } = await renderLoaded({ provider: fakeProvider({ newRowsSave: false }) });
      const results = Capture<DashboardPreferencesResult>(fixture.componentInstance.Result);
      Click(fixture, '.available-panel .add-button');
      fixture.detectChanges();

      await save(fixture);

      expect(Text(fixture, '.dialog-content mj-empty-state .stub-empty-title')).toContain('Duplicate dashboard preference');
      expect(homeTabs.MarkCustomized).not.toHaveBeenCalled();
      expect(results).toEqual([]);
      expect(loggedErrors()).toContain('Error saving dashboard preferences');
    });

    it('writes nothing when the stored rows cannot be read', async () => {
      const loggedErrors = captureLoggedErrors();
      const handle = fakeProvider({ readFails: true });
      const { fixture, homeTabs, created } = await renderLoaded({ provider: handle });
      const results = Capture<DashboardPreferencesResult>(fixture.componentInstance.Result);
      Click(fixture, '.available-panel .add-button');
      fixture.detectChanges();

      await save(fixture);

      expect(created).toEqual([]);
      expect(homeTabs.MarkCustomized).not.toHaveBeenCalled();
      expect(results).toEqual([]);
      expect(Text(fixture, '.dialog-content mj-empty-state .stub-empty-title')).toContain('The server is unavailable');
      expect(loggedErrors()).toContain('Error saving dashboard preferences');
    });
  });

  describe('editing the system defaults (Owner)', () => {
    it('saves rows with no user and does not mark the Owner customized', async () => {
      const betaDefault = preferenceRow('P0000000-0000-4000-8000-000000000003', BETA.ID, 1, null);
      const provider = fakeProvider({ userType: 'Owner', systemRows: [betaDefault] });
      const { fixture, homeTabs, created } = await renderLoaded({ provider });
      await switchMode(fixture, fixture.componentInstance, 'system');
      expect(names(fixture, 'configured')).toEqual(['Beta Dashboard']);
      expect(Text(fixture, '.scope-indicator')).toBe('Choose the default Home tabs for users who have not chosen their own.');
      expect(dialogTitle(fixture)).toBe('Manage home dashboards');
      Click(fixture, '.available-panel .add-button');
      fixture.detectChanges();

      await save(fixture);

      expect(created.map((r) => [r.UserID, r.DashboardID, r.DisplayOrder])).toEqual([[null, ALPHA.ID, 2]]);
      expect(betaDefault.Save).toHaveBeenCalled();
      expect(homeTabs.MarkCustomized).not.toHaveBeenCalled();
    });
  });
});

describe('DashboardPreferencesDialogComponent inside an OnPush host (DOM)', () => {
  const installProvider = UseFakeGlobalProvider();

  const dialogOf = (fixture: ComponentFixture<OnPushHostComponent>) =>
    fixture.debugElement.query(By.directive(DashboardPreferencesDialogComponent)).componentInstance as DashboardPreferencesDialogComponent;

  function renderInHost(homeTabs: HomeTabsStub, provider: IMetadataProvider | null = null) {
    stubDashboardEngine([ALPHA, BETA, GAMMA]);
    return RenderComponentFixture(OnPushHostComponent, {
      imports: IMPORTS,
      declarations: [OnPushHostComponent, DashboardPreferencesDialogComponent],
      providers: [{ provide: HomeDashboardTabsService, useValue: homeTabs }],
      inputs: { Provider: provider },
    });
  }

  it('renders the loaded lists without the host marking itself for check (global provider, as Home uses it)', async () => {
    installProvider({ currentUser: { ID: USER_ID, Type: 'User' } });
    const fixture = renderInHost(fakeHomeTabs([ALPHA]));
    await waitUntil(() => !dialogOf(fixture).Loading);
    fixture.detectChanges();

    expect(Query(fixture, 'mj-loading')).toBeNull();
    expect(names(fixture, 'configured')).toEqual(['Alpha Dashboard']);
    expect(names(fixture, 'available')).toEqual(['Beta Dashboard', 'Gamma Dashboard']);
  });

  it('renders the system defaults after an Owner switches mode', async () => {
    const gammaDefault = preferenceRow('P0000000-0000-4000-8000-000000000004', GAMMA.ID, 1, null);
    const handle = fakeProvider({ userType: 'Owner', systemRows: [gammaDefault], readDelayMs: 5 });
    const fixture = renderInHost(fakeHomeTabs([ALPHA]), handle.provider);
    const dialog = dialogOf(fixture);
    await waitUntil(() => !dialog.Loading);
    fixture.detectChanges();
    expect(names(fixture, 'configured')).toEqual(['Alpha Dashboard']);

    await switchMode(fixture, dialog, 'system');

    expect(names(fixture, 'configured')).toEqual(['Gamma Dashboard']);
    expect(names(fixture, 'available')).toEqual(['Alpha Dashboard', 'Beta Dashboard']);
  });
});
