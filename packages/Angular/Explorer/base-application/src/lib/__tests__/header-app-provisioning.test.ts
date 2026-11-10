import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@angular/core', () => ({
  Injectable: () => (target: Function) => target,
}));

interface MockUserAppRecord {
  ID: string;
  UserID: string;
  ApplicationID: string;
  Sequence: number;
  IsActive: boolean;
  LatestResult: { Message: string } | null;
  NewRecord: () => void;
  Save: () => Promise<boolean>;
}

const mockEngine = {
  IsPermissionConstrained: false,
  AllPropertiesLoadedSuccessfully: true,
  UserApplications: [] as MockUserAppRecord[],
  Config: vi.fn().mockResolvedValue(undefined),
  CreateDefaultApplications: vi.fn().mockResolvedValue([]),
  DataChange$: { subscribe: vi.fn() },
  UserHasApplicationAccess: vi.fn().mockReturnValue(true),
  IsPropertyPermissionConstrained: vi.fn().mockReturnValue(false),
};

vi.mock('@memberjunction/core', () => ({
  Metadata: class {},
  LogError: vi.fn(),
  LogStatus: vi.fn(),
  ApplicationInfo: class {},
  StartupManager: { Instance: { Startup: vi.fn() } },
}));

vi.mock('@memberjunction/core-entities', () => ({
  UserInfoEngine: {
    get Instance() {
      return mockEngine;
    },
  },
  MJUserApplicationEntity: class {},
}));

import { ApplicationManager } from '../application-manager';

type LoadableManager = { loadApplications(): Promise<void> };

interface TestAppSpec {
  id: string;
  name: string;
  defaultForNewUser: boolean;
  defaultSequence: number;
  navigationStyle: 'App Switcher' | 'Nav Bar' | 'Both';
  topNavLocation: 'Left of App Switcher' | 'Left of User Menu' | null;
}

function makeAppInfo(spec: TestAppSpec) {
  return {
    ID: spec.id,
    Name: spec.name,
    Description: '',
    Icon: 'fa-solid fa-book-open',
    Color: '#0284c7',
    DefaultNavItems: '[]',
    ClassName: '',
    DefaultSequence: spec.defaultSequence,
    DefaultForNewUser: spec.defaultForNewUser,
    Status: 'Active',
    NavigationStyle: spec.navigationStyle,
    TopNavLocation: spec.topNavLocation,
    HideNavBarIconWhenActive: true,
    Path: spec.name.toLowerCase(),
    AutoUpdatePath: false,
  };
}

function makeUserApp(
  id: string,
  userId: string,
  applicationId: string,
  sequence: number,
  isActive: boolean,
): MockUserAppRecord {
  return {
    ID: id,
    UserID: userId,
    ApplicationID: applicationId,
    Sequence: sequence,
    IsActive: isActive,
    LatestResult: null,
    NewRecord: vi.fn(),
    Save: vi.fn(async () => true),
  };
}

describe('ApplicationManager — newly-shipped header-pinned default apps for existing users', () => {
  const CHAT_ID = '7A873E1A-692E-43FA-97F8-57D8161A985C';
  const LIBRARY_ID = 'DB6B9D62-CB8E-417D-8A04-4CBC5F65CD9A';
  const HOME_ID = '11111111-1111-4111-8111-000000000001';
  const FILE_BROWSER_ID = 'EB07016C-AE35-4EF9-804B-91563529A08A';
  const RESTRICTED_HEADER_ID = '22222222-2222-4222-8222-000000000002';

  beforeEach(() => {
    mockEngine.IsPermissionConstrained = false;
    mockEngine.UserApplications = [];
    mockEngine.UserHasApplicationAccess.mockImplementation(
      (appId: string) => appId !== RESTRICTED_HEADER_ID,
    );
    (ApplicationManager as unknown as { _recoveryAttempted: boolean })._recoveryAttempted = false;
  });

  it('provisions a missing header-pinned default app (Library) for an existing user while respecting disabled and non-header apps', async () => {
    // Existing user already has Home (active) and Chat (explicitly disabled by user),
    // and has NO UserApplication record yet for the newly-shipped Library header app.
    mockEngine.UserApplications = [
      makeUserApp('ua-home', 'user-1', HOME_ID, 0, true),
      makeUserApp('ua-chat-disabled', 'user-1', CHAT_ID, 1, false),
    ];

    const savedRecords: MockUserAppRecord[] = [];
    let nextSeq = 1;

    const provider = {
      CurrentUser: { ID: 'user-1', Name: 'Existing User' },
      Applications: [
        makeAppInfo({
          id: HOME_ID,
          name: 'Home',
          defaultForNewUser: true,
          defaultSequence: 0,
          navigationStyle: 'App Switcher',
          topNavLocation: null,
        }),
        makeAppInfo({
          id: CHAT_ID,
          name: 'Chat',
          defaultForNewUser: true,
          defaultSequence: 1,
          navigationStyle: 'Both',
          topNavLocation: 'Left of User Menu',
        }),
        makeAppInfo({
          id: LIBRARY_ID,
          name: 'Library',
          defaultForNewUser: true,
          defaultSequence: 2,
          navigationStyle: 'Both',
          topNavLocation: 'Left of User Menu',
        }),
        makeAppInfo({
          id: FILE_BROWSER_ID,
          name: 'File Browser',
          defaultForNewUser: false,
          defaultSequence: 1010,
          navigationStyle: 'App Switcher',
          topNavLocation: null,
        }),
        makeAppInfo({
          id: RESTRICTED_HEADER_ID,
          name: 'Restricted Header App',
          defaultForNewUser: true,
          defaultSequence: 3,
          navigationStyle: 'Nav Bar',
          topNavLocation: 'Left of User Menu',
        }),
      ],
      GetEntityObject: vi.fn(async () => {
        const record: MockUserAppRecord = {
          ID: `ua-created-${nextSeq++}`,
          UserID: '',
          ApplicationID: '',
          Sequence: 0,
          IsActive: false,
          LatestResult: null,
          NewRecord: vi.fn(),
          Save: vi.fn(async () => {
            savedRecords.push(record);
            return true;
          }),
        };
        return record;
      }),
    };

    const manager = new ApplicationManager();
    manager.Provider = provider as unknown as ApplicationManager['Provider'];
    await (manager as unknown as LoadableManager).loadApplications();

    // Only Library should be provisioned (Chat has an inactive row, File Browser is DefaultForNewUser=false, Restricted lacks role access)
    expect(savedRecords).toHaveLength(1);
    expect(savedRecords[0].UserID).toBe('user-1');
    expect(savedRecords[0].ApplicationID).toBe(LIBRARY_ID);
    expect(savedRecords[0].Sequence).toBe(2);
    expect(savedRecords[0].IsActive).toBe(true);

    expect(manager.GetAllApps().map((a) => a.Name)).toEqual(['Home', 'Library']);
    expect(manager.GetNavBarApps('Left of User Menu').map((a) => a.Name)).toEqual(['Library']);
  });

  it('does not include a missing header app when Save() returns false', async () => {
    mockEngine.UserApplications = [makeUserApp('ua-home', 'user-1', HOME_ID, 0, true)];

    const provider = {
      CurrentUser: { ID: 'user-1', Name: 'Existing User' },
      Applications: [
        makeAppInfo({
          id: HOME_ID,
          name: 'Home',
          defaultForNewUser: true,
          defaultSequence: 0,
          navigationStyle: 'App Switcher',
          topNavLocation: null,
        }),
        makeAppInfo({
          id: LIBRARY_ID,
          name: 'Library',
          defaultForNewUser: true,
          defaultSequence: 2,
          navigationStyle: 'Both',
          topNavLocation: 'Left of User Menu',
        }),
      ],
      GetEntityObject: vi.fn(async () => ({
        ID: 'ua-unsaved',
        UserID: '',
        ApplicationID: '',
        Sequence: 0,
        IsActive: false,
        LatestResult: { Message: 'DB write denied' },
        NewRecord: vi.fn(),
        Save: vi.fn(async () => false),
      })),
    };

    const manager = new ApplicationManager();
    manager.Provider = provider as unknown as ApplicationManager['Provider'];
    await (manager as unknown as LoadableManager).loadApplications();

    expect(manager.GetAllApps().map((a) => a.Name)).toEqual(['Home']);
  });
});
