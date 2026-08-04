/**
 * Tests for base-application package:
 * - WorkspaceConfiguration defaults
 * - WorkspaceStateManager (tab management)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Angular
vi.mock('@angular/core', () => ({
  Injectable: () => (target: Function) => target,
  Component: () => (target: Function) => target,
  Directive: () => (target: Function) => target,
  Input: () => () => {},
  Output: () => () => {},
  EventEmitter: class { emit() {} },
}));

vi.mock('@memberjunction/core', () => ({
  Metadata: class {
    CurrentUser = { ID: 'user-123', Name: 'Test User' };
    Applications = [];
  },
  LogError: vi.fn(),
  LogStatus: vi.fn(),
  ApplicationInfo: class {},
  StartupManager: { Instance: { Startup: vi.fn() } },
}));

vi.mock('@memberjunction/core-entities', () => ({
  UserInfoEngine: {
    Instance: {
      Workspaces: [],
      UserApplications: [],
      CreateDefaultApplications: vi.fn().mockResolvedValue([]),
      DataChange$: { subscribe: vi.fn() },
      GetSetting: vi.fn(),
      SetSetting: vi.fn(),
      FindApplicationByPathOrName: vi.fn(),
      IsApplicationInactive: vi.fn(),
      CheckUserApplicationAccess: vi.fn(),
      InstallApplication: vi.fn(),
      EnableApplication: vi.fn(),
      DisableApplication: vi.fn(),
      UninstallApplication: vi.fn(),
    }
  },
  MJWorkspaceEntity: class {},
  MJUserApplicationEntity: class {},
}));

vi.mock('@memberjunction/global', () => ({
  MJGlobal: {
    Instance: {
      GetEventListener: vi.fn(() => ({ subscribe: vi.fn() })),
      ClassFactory: {
        CreateInstance: vi.fn(),
      },
    }
  },
  MJEventType: { LoggedIn: 'LoggedIn' },
}));

vi.mock('rxjs', async () => {
  const actual = await vi.importActual<typeof import('rxjs')>('rxjs');
  return actual;
});

// ======================= createDefaultWorkspaceConfiguration =======================
describe('createDefaultWorkspaceConfiguration', () => {
  it('should return a valid default configuration', async () => {
    const { createDefaultWorkspaceConfiguration } = await import('../interfaces/workspace-configuration.interface');
    const config = createDefaultWorkspaceConfiguration();

    expect(config.version).toBe(1);
    expect(config.activeTabId).toBeNull();
    expect(config.theme).toBe('light');
    expect(config.tabs).toEqual([]);
    expect(config.preferences.tabPosition).toBe('top');
    expect(config.preferences.showTabIcons).toBe(true);
    expect(config.preferences.autoSaveInterval).toBe(5000);
    expect(config.layout).toBeDefined();
    expect(config.layout!.root.type).toBe('row');
    expect(config.layout!.root.content).toEqual([]);
  });
});

// ======================= WorkspaceStateManager =======================
describe('WorkspaceStateManager', () => {
  let manager: InstanceType<typeof import('../workspace-state-manager').WorkspaceStateManager>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../workspace-state-manager');
    manager = new mod.WorkspaceStateManager();
  });

  describe('initial state', () => {
    it('should have null initial configuration', () => {
      expect(manager.GetConfiguration()).toBeNull();
    });

    it('should return null for active tab ID when not initialized', () => {
      expect(manager.GetActiveTabId()).toBeNull();
    });
  });

  describe('UpdateConfiguration', () => {
    it('should update configuration', async () => {
      const { createDefaultWorkspaceConfiguration } = await import('../interfaces/workspace-configuration.interface');
      const config = createDefaultWorkspaceConfiguration();
      manager.UpdateConfiguration(config);
      expect(manager.GetConfiguration()).toEqual(config);
    });
  });

  describe('OpenTab', () => {
    it('should create a new tab when config is initialized', async () => {
      const { createDefaultWorkspaceConfiguration } = await import('../interfaces/workspace-configuration.interface');
      manager.UpdateConfiguration(createDefaultWorkspaceConfiguration());

      const tabId = manager.OpenTab(
        { ApplicationId: 'app-1', Title: 'Test Tab', Configuration: { resourceType: 'Records', Entity: 'MJ: Users' } },
        '#ff0000'
      );

      expect(tabId).toBeDefined();
      const config = manager.GetConfiguration();
      expect(config!.tabs.length).toBe(1);
      expect(config!.tabs[0].title).toBe('Test Tab');
      expect(config!.activeTabId).toBe(tabId);
    });

    it('should return existing tab ID if matching tab exists', async () => {
      const { createDefaultWorkspaceConfiguration } = await import('../interfaces/workspace-configuration.interface');
      manager.UpdateConfiguration(createDefaultWorkspaceConfiguration());

      const tabId1 = manager.OpenTab(
        { ApplicationId: 'app-1', Title: 'Test', ResourceRecordId: 'rec-1', Configuration: { resourceType: 'Records', Entity: 'MJ: Users' } },
        '#ff0000'
      );
      const tabId2 = manager.OpenTab(
        { ApplicationId: 'app-1', Title: 'Test', ResourceRecordId: 'rec-1', Configuration: { resourceType: 'Records', Entity: 'MJ: Users' } },
        '#ff0000'
      );

      expect(tabId1).toBe(tabId2);
      expect(manager.GetConfiguration()!.tabs.length).toBe(1);
    });

    it('should replace temporary (unpinned) tab', async () => {
      const { createDefaultWorkspaceConfiguration } = await import('../interfaces/workspace-configuration.interface');
      manager.UpdateConfiguration(createDefaultWorkspaceConfiguration());

      manager.OpenTab(
        { ApplicationId: 'app-1', Title: 'Tab 1', Configuration: { resourceType: 'Records', Entity: 'MJ: Users' }, ResourceRecordId: '1' },
        '#ff0000'
      );

      // Open a different resource - should replace the unpinned tab
      manager.OpenTab(
        { ApplicationId: 'app-1', Title: 'Tab 2', Configuration: { resourceType: 'Records', Entity: 'Contacts' }, ResourceRecordId: '2' },
        '#ff0000'
      );

      expect(manager.GetConfiguration()!.tabs.length).toBe(1);
      expect(manager.GetConfiguration()!.tabs[0].title).toBe('Tab 2');
    });

    it('should throw if configuration is not initialized', () => {
      expect(() => manager.OpenTab(
        { ApplicationId: 'app-1', Title: 'Test', Configuration: {} },
        '#ff0000'
      )).toThrow('Configuration not initialized');
    });
  });

  describe('CloseTab', () => {
    it('should remove a tab when multiple tabs exist', async () => {
      const { createDefaultWorkspaceConfiguration } = await import('../interfaces/workspace-configuration.interface');
      manager.UpdateConfiguration(createDefaultWorkspaceConfiguration());

      const tab1Id = manager.OpenTab(
        { ApplicationId: 'app-1', Title: 'Tab 1', IsPinned: true, Configuration: { resourceType: 'Records', Entity: 'MJ: Users' }, ResourceRecordId: '1' },
        '#ff0000'
      );
      const tab2Id = manager.OpenTab(
        { ApplicationId: 'app-1', Title: 'Tab 2', IsPinned: true, Configuration: { resourceType: 'Records', Entity: 'Contacts' }, ResourceRecordId: '2' },
        '#ff0000'
      );

      manager.CloseTab(tab1Id);

      expect(manager.GetConfiguration()!.tabs.length).toBe(1);
      expect(manager.GetConfiguration()!.tabs[0].id).toBe(tab2Id);
    });

    it('should keep last tab but mark as unpinned', async () => {
      const { createDefaultWorkspaceConfiguration } = await import('../interfaces/workspace-configuration.interface');
      manager.UpdateConfiguration(createDefaultWorkspaceConfiguration());

      const tabId = manager.OpenTab(
        { ApplicationId: 'app-1', Title: 'Only Tab', IsPinned: true, Configuration: { resourceType: 'Records' }, ResourceRecordId: '1' },
        '#ff0000'
      );

      manager.CloseTab(tabId);

      // Tab should still exist but be unpinned
      expect(manager.GetConfiguration()!.tabs.length).toBe(1);
      expect(manager.GetConfiguration()!.tabs[0].isPinned).toBe(false);
    });
  });

  describe('TogglePin', () => {
    it('should toggle pin state of a tab', async () => {
      const { createDefaultWorkspaceConfiguration } = await import('../interfaces/workspace-configuration.interface');
      manager.UpdateConfiguration(createDefaultWorkspaceConfiguration());

      // OpenTab creates unpinned (temporary) tabs by default
      const tabId = manager.OpenTab(
        { ApplicationId: 'app-1', Title: 'Tab 1', Configuration: { resourceType: 'Records' }, ResourceRecordId: '1' },
        '#ff0000'
      );

      expect(manager.GetTab(tabId)!.isPinned).toBe(false);

      manager.TogglePin(tabId);
      expect(manager.GetTab(tabId)!.isPinned).toBe(true);

      manager.TogglePin(tabId);
      expect(manager.GetTab(tabId)!.isPinned).toBe(false);
    });
  });

  describe('SetActiveTab', () => {
    it('should set the active tab', async () => {
      const { createDefaultWorkspaceConfiguration } = await import('../interfaces/workspace-configuration.interface');
      manager.UpdateConfiguration(createDefaultWorkspaceConfiguration());

      const tab1Id = manager.OpenTab(
        { ApplicationId: 'app-1', Title: 'Tab 1', IsPinned: true, Configuration: { resourceType: 'Records', Entity: 'A' }, ResourceRecordId: '1' },
        '#ff0000'
      );
      const tab2Id = manager.OpenTab(
        { ApplicationId: 'app-1', Title: 'Tab 2', IsPinned: true, Configuration: { resourceType: 'Records', Entity: 'B' }, ResourceRecordId: '2' },
        '#ff0000'
      );

      manager.SetActiveTab(tab1Id);
      expect(manager.GetActiveTabId()).toBe(tab1Id);
    });
  });

  describe('GetAppTabs', () => {
    it('should return tabs for a specific application', async () => {
      const { createDefaultWorkspaceConfiguration } = await import('../interfaces/workspace-configuration.interface');
      manager.UpdateConfiguration(createDefaultWorkspaceConfiguration());

      // Use OpenTabForced to create separate pinned tabs (OpenTab replaces temp tabs)
      manager.OpenTabForced(
        { ApplicationId: 'app-1', Title: 'App1 Tab', IsPinned: true, Configuration: { resourceType: 'Records', Entity: 'A' }, ResourceRecordId: '1' },
        '#ff0000'
      );
      manager.OpenTabForced(
        { ApplicationId: 'app-2', Title: 'App2 Tab', IsPinned: true, Configuration: { resourceType: 'Records', Entity: 'B' }, ResourceRecordId: '2' },
        '#0000ff'
      );

      expect(manager.GetAppTabs('app-1').length).toBe(1);
      expect(manager.GetAppTabs('app-2').length).toBe(1);
      expect(manager.GetAppTabs('app-3').length).toBe(0);
    });
  });

  describe('UpdateTabTitle', () => {
    it('should update the title of a tab', async () => {
      const { createDefaultWorkspaceConfiguration } = await import('../interfaces/workspace-configuration.interface');
      manager.UpdateConfiguration(createDefaultWorkspaceConfiguration());

      const tabId = manager.OpenTab(
        { ApplicationId: 'app-1', Title: 'Original', IsPinned: true, Configuration: { resourceType: 'Records' }, ResourceRecordId: '1' },
        '#ff0000'
      );

      manager.UpdateTabTitle(tabId, 'Updated Title');
      expect(manager.GetTab(tabId)!.title).toBe('Updated Title');
    });
  });

  describe('UpdateTabResourceRecordId', () => {
    it('should re-key a new-record tab to its saved record id', async () => {
      const { createDefaultWorkspaceConfiguration } = await import('../interfaces/workspace-configuration.interface');
      manager.UpdateConfiguration(createDefaultWorkspaceConfiguration());

      // Simulate "Create New Record" — empty resourceRecordId, isNew flag in configuration
      const tabId = manager.OpenTab(
        {
          ApplicationId: 'app-1',
          Title: 'New Entities',
          IsPinned: true,
          Configuration: { resourceType: 'Records', Entity: 'Entities', recordId: '', isNew: true },
          ResourceRecordId: ''
        },
        '#ff0000'
      );

      const newId = 'abc-123-uuid';
      manager.UpdateTabResourceRecordId(tabId, newId);

      const tab = manager.GetTab(tabId)!;
      expect(tab.resourceRecordId).toBe(newId);
      expect(tab.configuration.recordId).toBe(newId);
      expect(tab.configuration.isNew).toBeUndefined();
    });

    it('should be a no-op when configuration is not initialized', () => {
      // No throw, no crash — just silently does nothing.
      expect(() => manager.UpdateTabResourceRecordId('nonexistent', 'xyz')).not.toThrow();
    });

    it('should leave OTHER tabs untouched when re-keying one tab', async () => {
      const { createDefaultWorkspaceConfiguration } = await import('../interfaces/workspace-configuration.interface');
      manager.UpdateConfiguration(createDefaultWorkspaceConfiguration());

      // Use OpenTabForced to create separate pinned tabs (OpenTab replaces temp tabs)
      const newRecordTabId = manager.OpenTabForced(
        { ApplicationId: 'app-1', Title: 'New', IsPinned: true, Configuration: { resourceType: 'Records', Entity: 'Foo' }, ResourceRecordId: '' },
        '#ff0000'
      );
      const otherTabId = manager.OpenTabForced(
        { ApplicationId: 'app-1', Title: 'Other', IsPinned: true, Configuration: { resourceType: 'Records', Entity: 'Bar' }, ResourceRecordId: 'bar-id' },
        '#ff0000'
      );

      manager.UpdateTabResourceRecordId(newRecordTabId, 'foo-saved');

      expect(manager.GetTab(newRecordTabId)!.resourceRecordId).toBe('foo-saved');
      expect(manager.GetTab(otherTabId)!.resourceRecordId).toBe('bar-id');
    });
  });

  describe('CloseOtherTabs', () => {
    it('should close all tabs except specified one', async () => {
      const { createDefaultWorkspaceConfiguration } = await import('../interfaces/workspace-configuration.interface');
      manager.UpdateConfiguration(createDefaultWorkspaceConfiguration());

      manager.OpenTab(
        { ApplicationId: 'app-1', Title: 'Tab 1', IsPinned: true, Configuration: { resourceType: 'Records', Entity: 'A' }, ResourceRecordId: '1' },
        '#ff0000'
      );
      const tab2Id = manager.OpenTab(
        { ApplicationId: 'app-1', Title: 'Tab 2', IsPinned: true, Configuration: { resourceType: 'Records', Entity: 'B' }, ResourceRecordId: '2' },
        '#ff0000'
      );
      manager.OpenTab(
        { ApplicationId: 'app-1', Title: 'Tab 3', IsPinned: true, Configuration: { resourceType: 'Records', Entity: 'C' }, ResourceRecordId: '3' },
        '#ff0000'
      );

      manager.CloseOtherTabs(tab2Id);

      expect(manager.GetConfiguration()!.tabs.length).toBe(1);
      expect(manager.GetConfiguration()!.tabs[0].id).toBe(tab2Id);
    });
  });

  describe('ClearLayout', () => {
    it('should clear the layout', async () => {
      const { createDefaultWorkspaceConfiguration } = await import('../interfaces/workspace-configuration.interface');
      const config = createDefaultWorkspaceConfiguration();
      manager.UpdateConfiguration(config);

      manager.ClearLayout();
      expect(manager.GetConfiguration()!.layout).toBeUndefined();
    });
  });
});

// ======================= Records-style layout filters =======================
// The shell (explorer-core) sets these predicates under the records style;
// inline lambdas here mirror its exact expressions without importing
// ng-shared (base-application sits BELOW it — that layering is why the
// filters are settable predicates in the first place).
describe('WorkspaceStateManager records-style filters (docked records)', () => {
  let manager: InstanceType<typeof import('../workspace-state-manager').WorkspaceStateManager>;

  const isRecord = (tab: { configuration?: Record<string, unknown> }) =>
    tab.configuration?.['resourceType'] === 'Records';
  const isRegionRecord = (tab: { configuration?: Record<string, unknown> }) =>
    isRecord(tab) && tab.configuration?.['recordDockedToWorkspace'] !== true;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../workspace-state-manager');
    manager = new mod.WorkspaceStateManager();
    // The shell's records-style assignments:
    manager.MainLayoutTabFilter = (tab) => !isRegionRecord(tab);
    manager.TempTabConsumptionFilter = (tab) => !isRecord(tab);
    const { createDefaultWorkspaceConfiguration } = await import('../interfaces/workspace-configuration.interface');
    manager.UpdateConfiguration(createDefaultWorkspaceConfiguration());
  });

  function openNav(title: string) {
    return manager.OpenTab(
      { ApplicationId: 'app-1', Title: title, Configuration: { resourceType: 'Dashboards', navItemName: title } },
      '#ff0000');
  }
  // PreservePinState mirrors NavigationService.OpenEntityRecord's records-style
  // request — without it OpenTabForced's pin cascade pins the nav tab and
  // pollutes the bar-visibility assertions.
  function openDockedRecord(title: string, recordId: string) {
    return manager.OpenTabForced(
      { ApplicationId: 'app-1', Title: title, ResourceRecordId: recordId, PreservePinState: true,
        Configuration: { resourceType: 'Records', Entity: 'Widgets', recordId, recordDockedToWorkspace: true } },
      '#ff0000');
  }
  function openRegionRecord(title: string, recordId: string) {
    return manager.OpenTabForced(
      { ApplicationId: 'app-1', Title: title, ResourceRecordId: recordId, PreservePinState: true,
        Configuration: { resourceType: 'Records', Entity: 'Widgets', recordId } },
      '#ff0000');
  }

  describe('temp-tab protection', () => {
    it('never consumes an unpinned DOCKED record as the replaceable temp tab', () => {
      const dockedId = openDockedRecord('Docked Widget', 'r1');
      openNav('Queries');
      const config = manager.GetConfiguration()!;
      expect(config.tabs.some(t => t.id === dockedId)).toBe(true); // docked record survived
      expect(config.tabs.length).toBe(2); // nav opened as a NEW tab
    });

    it('still replaces an ordinary unpinned nav temp tab', () => {
      openNav('Data');
      openNav('Queries');
      const config = manager.GetConfiguration()!;
      expect(config.tabs.length).toBe(1);
      expect(config.tabs[0].title).toBe('Queries');
    });
  });

  describe('main tab bar visibility (shouldShowTabs via MainLayoutTabFilter)', () => {
    it('a docked record counts toward the bar: nav + docked = visible', () => {
      let visible = false;
      const sub = manager.TabBarVisible.subscribe(v => visible = v);
      openNav('Data');
      openDockedRecord('Docked Widget', 'r1');
      expect(visible).toBe(true);
      sub.unsubscribe();
    });

    it('a REGION record does not: nav + region record = hidden', () => {
      let visible = true;
      const sub = manager.TabBarVisible.subscribe(v => visible = v);
      openNav('Data');
      openRegionRecord('Region Widget', 'r2');
      expect(visible).toBe(false);
      sub.unsubscribe();
    });
  });

  describe('CloseTab keep-alive', () => {
    it('retains (unpins) a sole remaining DOCKED record instead of closing it', () => {
      const dockedId = openDockedRecord('Docked Widget', 'r1');
      manager.CloseTab(dockedId);
      const config = manager.GetConfiguration()!;
      expect(config.tabs.length).toBe(1);
      expect(config.tabs[0].id).toBe(dockedId);
      expect(config.tabs[0].isPinned).toBe(false);
    });

    it('closes a sole remaining REGION record outright', () => {
      const regionId = openRegionRecord('Region Widget', 'r2');
      manager.CloseTab(regionId);
      expect(manager.GetConfiguration()!.tabs.length).toBe(0);
    });
  });
});
