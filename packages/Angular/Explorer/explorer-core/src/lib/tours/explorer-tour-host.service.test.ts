import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import type {
  ITourAnchorDomBridge,
  TourDefinition,
  TourResolvedAnchorInfo,
  TourRunRecord,
  TourStepDefinition,
} from '@memberjunction/tours-runtime';
import type { TourPendingOffer } from '@memberjunction/ng-tours';

interface MockAgentRecord {
  ID: string;
  Name: string;
  Status: string;
}

interface ResourceLoadedMockEvent {
  ResourceType: string;
  AppId?: string;
  DriverClass?: string;
  RecordId?: string;
}

const mocks = vi.hoisted(() => {
  const setMinimized = vi.fn<(minimized: boolean) => void>();
  const setActive = { fn: null as ((val: boolean) => void) | null };
  const emitSessionStarted = {
    fn: null as ((val: { sessionId: string; channelNames: string[] }) => void) | null,
  };

  const endRealtimeSession = vi.fn<(reason?: 'explicit' | 'error' | 'deadline') => Promise<void>>(
    async () => {
      setActive.fn?.(false);
    },
  );
  const startRealtimeSession = vi.fn<(...args: unknown[]) => Promise<void>>(async () => {
    // Simulates beginSessionStart resetting minimized -> false and flipping Active$ -> true
    setMinimized(false);
    setActive.fn?.(true);
    emitSessionStarted.fn?.({ sessionId: 'session-1', channelNames: ['ClientContext', 'Tours'] });
  });

  const realtimeSession = {
    Active$: null as unknown as Observable<boolean>,
    SessionStarted$: null as unknown as Observable<{ sessionId: string; channelNames: string[] }>,
    CurrentAgentName: 'Sage',
    Provider: null as unknown,
    SetMinimized: setMinimized,
    StartRealtimeSession: startRealtimeSession,
    EndRealtimeSession: endRealtimeSession,
  };

  const agents: MockAgentRecord[] = [
    { ID: 'agent-other', Name: 'Analyst', Status: 'Active' },
    { ID: 'agent-sage', Name: 'Sage', Status: 'Active' },
  ];

  const aiEngineConfig = vi.fn<() => Promise<void>>(async () => undefined);
  const loadTourChannel = vi.fn<() => void>();
  const openEntityRecord = vi.fn();
  const findNavItem = vi.fn(async () => ({ Label: 'Tours' }));
  const switchToApp = vi.fn<
    (appId: string, navLabel?: string, queryParams?: Record<string, string>) => Promise<void>
  >(async () => undefined);

  const mockTourEngine = {
    Config: vi.fn(async () => undefined),
    GetTours: vi.fn(async (): Promise<TourDefinition[]> => []),
    GetTourByKey: vi.fn(async (): Promise<TourDefinition | null> => null),
    GetRuns: vi.fn<() => Promise<TourRunRecord[]>>(async () => []),
    RecordEvents: vi.fn(async () => undefined),
  };

  const mockUserInfoEngine = {
    GetSetting: vi.fn(() => undefined),
    SetSettingDebounced: vi.fn(),
  };

  const tokenServices = new Map<unknown, unknown>();

  return {
    setActive,
    emitSessionStarted,
    setMinimized,
    endRealtimeSession,
    startRealtimeSession,
    realtimeSession,
    agents,
    aiEngineConfig,
    loadTourChannel,
    openEntityRecord,
    findNavItem,
    switchToApp,
    mockTourEngine,
    mockUserInfoEngine,
    tokenServices,
  };
});

vi.mock('@angular/core', () => ({
  Injectable: () => <T>(target: T): T => target,
  InjectionToken: class {
    constructor(public readonly desc: string) {}
  },
  inject: (token: unknown) => mocks.tokenServices.get(token) ?? null,
}));

vi.mock('@memberjunction/core', () => ({
  Metadata: {
    Provider: {
      CurrentUser: { ID: 'user-1', UserRoles: [] },
      Entities: [],
      EntityByName: () => undefined,
    },
  },
  RunView: {
    FromMetadataProvider: () => ({
      RunViews: async () => [],
    }),
  },
  CompositeKey: {
    FromURLSegment: () => ({ KeyValuePairs: [] }),
  },
  LogError: vi.fn(),
  LogStatus: vi.fn(),
}));

vi.mock('@memberjunction/core-entities', () => ({
  TourEngine: {
    GetProviderInstance: () => mocks.mockTourEngine,
  },
  UserInfoEngine: {
    GetProviderInstance: () => mocks.mockUserInfoEngine,
  },
}));

vi.mock('@memberjunction/ai-engine-base', () => ({
  AIEngineBase: {
    Instance: {
      Config: mocks.aiEngineConfig,
      get Agents(): MockAgentRecord[] {
        return mocks.agents;
      },
    },
  },
}));

vi.mock('@memberjunction/ng-base-application', () => ({
  ApplicationManager: class {},
  WorkspaceStateManager: class {},
}));

vi.mock('@memberjunction/ng-shared', () => ({
  NavigationService: class {},
}));

vi.mock('@memberjunction/ng-conversations', () => ({
  LoadTourChannel: mocks.loadTourChannel,
  RealtimeSessionService: class {},
}));

import { ApplicationManager, WorkspaceStateManager } from '@memberjunction/ng-base-application';
import { NavigationService } from '@memberjunction/ng-shared';
import { RealtimeSessionService } from '@memberjunction/ng-conversations';
import { ExplorerTourHost } from './explorer-tour-host.service';

const initialLoadTourChannelCalls = mocks.loadTourChannel.mock.calls.length;

const active$ = new BehaviorSubject<boolean>(false);
const sessionStarted$ = new Subject<{ sessionId: string; channelNames: string[] }>();
const resourceLoaded$ = new Subject<ResourceLoadedMockEvent>();
mocks.setActive.fn = (val: boolean) => active$.next(val);
mocks.emitSessionStarted.fn = (val: { sessionId: string; channelNames: string[] }) => sessionStarted$.next(val);
mocks.realtimeSession.Active$ = active$.asObservable();
mocks.realtimeSession.SessionStarted$ = sessionStarted$.asObservable();

describe('ExplorerTourHost — Wave 2 Sage & DemonstrateStep', () => {
  const activeApp$ = new BehaviorSubject<{ ID: string; Name: string } | null>({
    ID: 'app-home',
    Name: 'Home',
  });
  const config$ = new BehaviorSubject<{ tabs: []; activeTabId: string | null } | null>({
    tabs: [],
    activeTabId: null,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockTourEngine.GetTours.mockResolvedValue([]);
    mocks.mockTourEngine.GetTourByKey.mockResolvedValue(null);
    mocks.mockTourEngine.GetRuns.mockResolvedValue([]);
    active$.next(false);
    mocks.agents.splice(0, mocks.agents.length,
      { ID: 'agent-other', Name: 'Analyst', Status: 'Active' },
      { ID: 'agent-sage', Name: 'Sage', Status: 'Active' },
    );

    mocks.tokenServices.clear();
    mocks.tokenServices.set(ApplicationManager, {
      ActiveApp: activeApp$.asObservable(),
      GetAllApps: () => [{ ID: 'app-home', Name: 'Home' }],
      GetAppById: (id: string) => (id === 'app-home' ? { ID: 'app-home', Name: 'Home' } : undefined),
      GetAppByName: (name: string) => (name === 'Home' ? { ID: 'app-home', Name: 'Home' } : undefined),
      GetActiveApp: () => ({ ID: 'app-home', Name: 'Home' }),
    });
    mocks.tokenServices.set(WorkspaceStateManager, {
      Configuration: config$.asObservable(),
    });
    mocks.tokenServices.set(NavigationService, {
      OpenEntityRecord: mocks.openEntityRecord,
      FindNavItem: mocks.findNavItem,
      SwitchToApp: vi.fn(async (appId: string, navLabel?: string, queryParams?: Record<string, string>) => {
        await mocks.switchToApp(appId, navLabel, queryParams);
        resourceLoaded$.next({ ResourceType: 'Custom', AppId: appId, DriverClass: 'HomeDashboard' });
      }),
      ResourceLoaded$: resourceLoaded$.asObservable(),
    });
    mocks.tokenServices.set(RealtimeSessionService, mocks.realtimeSession);
  });

  it('registers TourChannel at module load via LoadTourChannel()', () => {
    const host = new ExplorerTourHost();
    expect(initialLoadTourChannelCalls).toBe(1);
    expect(host.IsVoiceGuideAvailable).toBe(true);
    expect(host.TourVoiceAgentName).toBe('Sage');
    host.ngOnDestroy();
  });

  it('DemonstrateStep navigates, resolves anchor, highlights it, and fails cleanly when missing', async () => {
    const host = new ExplorerTourHost();
    const resolveAnchor = vi.fn<() => Promise<TourResolvedAnchorInfo>>(async () => ({
      Found: true,
      Resolution: 'Registered',
      AnchorKey: 'core.shell.apps',
    }));
    const highlightAnchor = vi.fn(async () => ({ Success: true }));
    const bridge: ITourAnchorDomBridge = {
      ResolveAnchor: resolveAnchor,
      GetVisibleAnchors: () => [],
      HighlightAnchor: highlightAnchor,
    };
    host.AttachTourHostComponent(undefined, bridge);

    const step: TourStepDefinition = {
      StepKey: 'open-apps',
      Sequence: 1,
      StepType: 'Spotlight',
      Title: 'Open App Switcher',
      Body: 'Click here to switch apps.',
      Placement: 'bottom',
      Mode: 'Guide',
      OnMissing: 'Skip',
      IsOptional: false,
      Configuration: {},
      Completion: { Checks: [{ Type: 'NextButton' }] },
      Anchor: { Strategy: 'Registered', Key: 'core.shell.apps' },
      Prepare: {
        ApplicationID: 'app-home',
        DriverClass: 'HomeDashboard',
      },
    };

    const okResult = await host.DemonstrateStep(step);
    expect(okResult).toEqual({ Success: true });
    expect(mocks.switchToApp).toHaveBeenCalledWith('app-home', 'Tours', undefined);
    expect(resolveAnchor).toHaveBeenCalledWith(step.Anchor, 2500);
    expect(highlightAnchor).toHaveBeenCalledWith('core.shell.apps', 'Open App Switcher');

    resolveAnchor.mockResolvedValueOnce({
      Found: false,
      Resolution: 'Failed',
      FailureReason: 'Anchor not rendered',
    });
    const missingResult = await host.DemonstrateStep(step);
    expect(missingResult).toEqual({ Success: false, ErrorMessage: 'Anchor not rendered' });
    host.ngOnDestroy();
  });

  it('minimizes an already-active Sage realtime session when a tour starts (seamless handoff)', async () => {
    active$.next(true);
    const host = new ExplorerTourHost();

    const voiceStates: boolean[] = [];
    const sub = host.VoiceGuideActive$.subscribe((v) => voiceStates.push(v));

    const sampleTour: TourDefinition = {
      ID: 'tour-1',
      TourKey: 'intro.tour',
      Name: 'Explorer Intro',
      CurrentVersionID: 'ver-1',
      Status: 'Active',
      DefaultGuideMode: 'Visual',
      RunInAuthenticatedHosts: true,
      AllowAgentActions: false,
      Steps: [
        {
          StepKey: 'step-1',
          Sequence: 1,
          StepType: 'Modal',
          Title: 'Welcome',
          Body: 'Welcome to Explorer.',
          Placement: 'center',
          Mode: 'Show',
          OnMissing: 'Center',
          IsOptional: false,
          Configuration: {},
          Completion: { Checks: [{ Type: 'NextButton' }] },
        },
      ],
      Paths: [],
    };
    mocks.mockTourEngine.GetTourByKey.mockResolvedValueOnce(sampleTour);

    const session = await host.StartTour('intro.tour', { LaunchSource: 'Launcher' });
    expect(session).not.toBeNull();
    expect(mocks.setMinimized).toHaveBeenCalledWith(true);
    expect(voiceStates[voiceStates.length - 1]).toBe(true);

    await host.StopActiveTour('done');
    expect(voiceStates[voiceStates.length - 1]).toBe(false);

    sub.unsubscribe();
    host.ngOnDestroy();
  });

  it('RequestVoiceGuide(true) starts Sage with ClientContextChannel + TourChannel and minimizes overlay; ExpandVoiceOverlay restores it', async () => {
    const host = new ExplorerTourHost();
    const started = await host.RequestVoiceGuide(true);

    expect(started).toBe(true);
    expect(mocks.aiEngineConfig).toHaveBeenCalledTimes(1);
    expect(mocks.startRealtimeSession).toHaveBeenCalledTimes(1);
    const callArgs = mocks.startRealtimeSession.mock.calls[0];
    expect(callArgs[0]).toBe('agent-sage');
    expect(callArgs[3]).toBe('Sage');
    expect(callArgs[10]).toBe('app-home');
    expect(callArgs[12]).toEqual({
      HostChannels: [
        { ClientPluginClass: 'ClientContextChannel' },
        { ClientPluginClass: 'TourChannel' },
      ],
    });
    expect(mocks.setMinimized).toHaveBeenLastCalledWith(true);

    host.ExpandVoiceOverlay();
    expect(mocks.setMinimized).toHaveBeenLastCalledWith(false);

    const stopped = await host.RequestVoiceGuide(false);
    expect(stopped).toBe(true);
    expect(mocks.endRealtimeSession).toHaveBeenCalledWith('explicit');
    host.ngOnDestroy();
  });

  it('emits PendingOffer$ on FirstVisit to Home, launches with Trigger on AcceptPendingOffer, and suppresses repeats on DismissPendingOffer', async () => {
    const homeFirstVisitTour: TourDefinition = {
      ID: 'tour-home-1',
      TourKey: 'home.welcome',
      Name: 'Home Welcome Tour',
      Description: 'Explore your Home workspace.',
      EstimatedMinutes: 2,
      ApplicationName: 'Home',
      CurrentVersionID: 'ver-home-1',
      Status: 'Active',
      DefaultGuideMode: 'Visual',
      RunInAuthenticatedHosts: true,
      AllowAgentActions: false,
      Steps: [
        {
          StepKey: 'welcome',
          Sequence: 1,
          StepType: 'Modal',
          Title: 'Welcome Home',
          Body: 'Start here.',
          Placement: 'center',
          Mode: 'Show',
          OnMissing: 'Center',
          IsOptional: false,
          Configuration: {},
          Completion: { Checks: [{ Type: 'NextButton' }] },
        },
      ],
      Paths: [],
      Triggers: [
        {
          ID: 'trig-home-1',
          TriggerType: 'FirstVisit',
          Delivery: 'Offer',
          Status: 'Active',
          Configuration: { ApplicationName: 'Home' },
        },
      ],
    };

    mocks.mockTourEngine.GetTours.mockResolvedValue([homeFirstVisitTour]);
    mocks.mockTourEngine.GetTourByKey.mockResolvedValue(homeFirstVisitTour);
    mocks.mockTourEngine.GetRuns.mockResolvedValue([]);

    const host = new ExplorerTourHost();
    const seenOffers: Array<TourPendingOffer | null> = [];
    const sub = host.PendingOffer$.subscribe((offer) => seenOffers.push(offer));

    await host.EvaluateProactiveTriggers();

    const latestOffer = seenOffers[seenOffers.length - 1];
    expect(latestOffer).toEqual({
      TourKey: 'home.welcome',
      Title: 'Home Welcome Tour',
      Description: 'Explore your Home workspace.',
      EstimatedMinutes: 2,
      StepCount: 1,
      Delivery: 'Offer',
    });

    // Accepting clears PendingOffer$ and launches with LaunchSource = 'Trigger'
    const session = await host.AcceptPendingOffer('home.welcome');
    expect(session).not.toBeNull();
    expect(session?.GetRunRecord().LaunchSource).toBe('Trigger');
    expect(seenOffers[seenOffers.length - 1]).toBeNull();

    await host.StopActiveTour('done');

    // Dismissing an offer clears it and suppresses repeat offers in the same session
    host.DismissPendingOffer('home.welcome');
    await host.EvaluateProactiveTriggers();
    expect(seenOffers[seenOffers.length - 1]).toBeNull();

    sub.unsubscribe();
    host.ngOnDestroy();
  });

  it('GetAllToursByApplication groups eligible tours by app (active app, Core Workspace, alphabetical) with completion badges', async () => {
    mocks.tokenServices.set(ApplicationManager, {
      ActiveApp: activeApp$.asObservable(),
      GetAllApps: () => [
        { ID: 'app-home', Name: 'Home' },
        { ID: 'app-admin', Name: 'Admin' },
        { ID: 'app-sales', Name: 'Sales' },
      ],
      GetAppById: (id: string) =>
        [
          { ID: 'app-home', Name: 'Home' },
          { ID: 'app-admin', Name: 'Admin' },
          { ID: 'app-sales', Name: 'Sales' },
        ].find((a) => a.ID === id),
      GetAppByName: (name: string) =>
        [
          { ID: 'app-home', Name: 'Home' },
          { ID: 'app-admin', Name: 'Admin' },
          { ID: 'app-sales', Name: 'Sales' },
        ].find((a) => a.Name === name),
      GetActiveApp: () => ({ ID: 'app-home', Name: 'Home' }),
    });

    const makeTour = (tourKey: string, name: string, appName?: string): TourDefinition => ({
      ID: `id-${tourKey}`,
      TourKey: tourKey,
      Name: name,
      ApplicationName: appName ?? null,
      CurrentVersionID: `ver-${tourKey}`,
      Status: 'Active',
      DefaultGuideMode: 'Visual',
      RunInAuthenticatedHosts: true,
      AllowAgentActions: false,
      Steps: [
        {
          StepKey: 's1',
          Sequence: 1,
          StepType: 'Modal',
          Title: 'Step 1',
          Body: 'Body',
          Placement: 'center',
          Mode: 'Show',
          OnMissing: 'Center',
          IsOptional: false,
          Configuration: {},
          Completion: { Checks: [{ Type: 'NextButton' }] },
        },
      ],
      Paths: [],
    });

    const tours: TourDefinition[] = [
      makeTour('sales.deals', 'Sales Pipeline'),
      makeTour('home.start', 'Home Basics', 'Home'),
      makeTour('core.omnibar', 'Workspace Omnibar'),
      makeTour('admin.roles', 'Role Setup', 'Admin'),
    ];
    // Give sales.deals a StartLocation.ApplicationName instead of ApplicationName
    tours[0].StartLocation = { ApplicationName: 'Sales' };

    mocks.mockTourEngine.GetTours.mockResolvedValue(tours);
    mocks.mockTourEngine.GetRuns.mockResolvedValue([
      {
        RunID: 'run-1',
        TourID: 'id-home.start',
        TourKey: 'home.start',
        TourVersionID: 'ver-home.start',
        Status: 'Completed',
        LaunchSource: 'Launcher',
        GuideMode: 'Visual',
        DirectorType: 'Visual',
        CurrentStepKey: null,
        StartedAt: '2026-11-24T09:58:00.000Z',
        CompletedAt: '2026-11-24T10:00:00.000Z',
        GoalMetAt: '2026-11-24T10:00:00.000Z',
        PathTaken: ['s1'],
        Steps: [],
        IsHoldout: false,
      },
      {
        RunID: 'run-2',
        TourID: 'id-sales.deals',
        TourKey: 'sales.deals',
        TourVersionID: 'ver-sales.deals',
        Status: 'In Progress',
        LaunchSource: 'Launcher',
        GuideMode: 'Visual',
        DirectorType: 'Visual',
        CurrentStepKey: 's1',
        StartedAt: '2026-11-24T10:05:00.000Z',
        PathTaken: ['s1'],
        Steps: [],
        IsHoldout: false,
      },
    ]);

    const host = new ExplorerTourHost();
    const groups = await host.GetAllToursByApplication();

    expect(groups.map((g) => g.ApplicationName)).toEqual([
      'Home',
      'Core Workspace',
      'Admin',
      'Sales',
    ]);
    expect(groups[0].Tours[0]).toMatchObject({
      Completed: true,
      InProgress: false,
      CompletedAt: '2026-11-24T10:00:00.000Z',
    });
    expect(groups[1].Tours[0]).toMatchObject({ Completed: false, InProgress: false });
    expect(groups[3].Tours[0]).toMatchObject({ Completed: false, InProgress: true });

    host.ngOnDestroy();
  });
});
