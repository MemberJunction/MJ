import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let backing: Record<string, unknown[]> = {};
let loadedConfigs: Array<Record<string, unknown>> = [];
const propertySubscribers = new Map<string, Array<() => void>>();
const mockSettings = new Map<string, string>();
const mockInstanceConfigs = new Map<string, string>();
let mockRouteOperation: ReturnType<typeof vi.fn>;
let mockCurrentUser: { ID: string; UserRoles: Array<{ Role: string }> } | null = null;
let mockProviderType = 'Network';

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return {
        ...actual,
        MJGlobal: {
            Instance: {
                GetGlobalObjectStore: () => ({}),
                ClassFactory: actual.MJGlobal.Instance.ClassFactory,
            },
        },
    };
});

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    class MockBaseEngine {
        static getInstance<T>(): T {
            const ctor = this as unknown as { _testInstance?: T; new (): T };
            if (!ctor._testInstance) {
                ctor._testInstance = new ctor();
            }
            return ctor._testInstance;
        }
        static GetProviderInstance<T>(_provider: unknown, ctor: new () => T): T {
            const typedCtor = ctor as unknown as { _testInstance?: T; new (): T };
            if (!typedCtor._testInstance) {
                typedCtor._testInstance = new typedCtor();
            }
            return typedCtor._testInstance;
        }
        async Load(configs: Array<Record<string, unknown>>): Promise<void> {
            loadedConfigs = configs;
        }
        GetConfigData<T>(prop: string): T[] {
            return (backing[prop] ?? []) as T[];
        }
        ObserveProperty(prop: string) {
            return {
                prop,
                subscribe: (fn: () => void) => {
                    const list = propertySubscribers.get(prop) ?? [];
                    list.push(fn);
                    propertySubscribers.set(prop, list);
                    return { unsubscribe() {} };
                },
            };
        }
        get ProviderToUse() {
            return {
                ProviderType: mockProviderType,
                CurrentUser: mockCurrentUser,
                RouteOperation: mockRouteOperation,
            };
        }
    }
    return {
        ...actual,
        BaseEngine: MockBaseEngine,
        LogError: () => undefined,
    };
});

vi.mock('../engines/UserInfoEngine', () => {
    const instance = {
        GetSetting: (key: string) => mockSettings.get(key),
        SetSettingDebounced: vi.fn((key: string, value: string) => {
            mockSettings.set(key, value);
        }),
    };
    return {
        UserInfoEngine: {
            Instance: instance,
            GetProviderInstance: () => instance,
        },
    };
});

vi.mock('../engines/InstanceConfigEngine', () => {
    const instance = {
        Get: (key: string) => mockInstanceConfigs.get(key),
        GetBoolean: (key: string, defaultValue: boolean = true) => {
            const raw = mockInstanceConfigs.get(key);
            if (raw === undefined) return defaultValue;
            return raw.trim().toLowerCase() === 'true';
        },
        GetJSON: <T>(key: string, defaultValue?: T): T | undefined => {
            const raw = mockInstanceConfigs.get(key);
            if (raw === undefined) return defaultValue;
            try {
                return JSON.parse(raw) as T;
            } catch {
                return defaultValue;
            }
        },
    };
    return {
        InstanceConfigEngine: {
            Instance: instance,
            GetProviderInstance: () => instance,
        },
    };
});

import { TourEngine } from '../engines/tours';
import { UserInfoEngine } from '../engines/UserInfoEngine';
import type {
    ITourHost,
    TourLocation,
    TourRunEvent,
} from '@memberjunction/tours-runtime';
import { TourSession } from '@memberjunction/tours-runtime';
import { Subject } from 'rxjs';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const TOUR_ID = '22222222-2222-2222-2222-222222222222';
const DRAFT_TOUR_ID = '33333333-3333-3333-3333-333333333333';
const VERSION_ID = '44444444-4444-4444-4444-444444444444';
const STEP_TYPE_ID = '55555555-5555-5555-5555-555555555555';
const APP_SALES_ID = '66666666-6666-6666-6666-666666666666';

function createStepTypeRow() {
    return {
        ID: STEP_TYPE_ID,
        Name: 'Spotlight',
        DriverClass: 'Spotlight',
        RendererClass: null,
        ComponentID: null,
        Status: 'Active',
    };
}

function createActiveTourRow(over: Record<string, unknown> = {}) {
    return {
        ID: TOUR_ID,
        Name: 'Closing your first deal',
        TourKey: 'sales.close-won',
        Description: 'Learn how to close a deal',
        ApplicationID: APP_SALES_ID,
        Application: 'Sales',
        RunInAuthenticatedHosts: true,
        Status: 'Active',
        CurrentVersionID: VERSION_ID,
        EstimatedMinutes: 3,
        AudienceFilter: null,
        LaunchPolicyObject: {
            AutoLaunch: false,
            AllowReplay: true,
            BypassBudget: false,
            HoldoutPercentage: 10,
        },
        Priority: 200,
        ThrottleTags: 'sales, onboarding',
        DefaultGuideMode: 'Visual',
        AllowAgentActions: false,
        GuideAgentID: null,
        DriverClass: null,
        PresenterClass: null,
        GoalObject: {
            Type: 'EntityEvent',
            Description: 'Deal closed',
            Entity: 'Deals',
            Action: 'Save',
        },
        StartLocationObject: {
            Application: 'Sales',
            NavItem: 'Deals',
        },
        VersionTag: '6.22',
        ConfigurationObject: {
            localizations: {
                es: { name: 'Cerrar tu primer trato', description: 'Aprende a cerrar' },
            },
        },
        ...over,
    };
}

function createVersionRow() {
    return {
        ID: VERSION_ID,
        TourID: TOUR_ID,
        VersionNumber: 2,
        DefinitionObject: {
            TourKey: 'sales.close-won',
            Name: 'Closing your first deal (v2)',
            Description: 'Snapshot description',
            EstimatedMinutes: 3,
            DefaultGuideMode: 'Visual',
            AllowAgentActions: false,
            Steps: [
                {
                    ID: 's1',
                    StepKey: 'stage-step',
                    Sequence: 1,
                    StepTypeID: STEP_TYPE_ID,
                    StepTypeName: 'Spotlight',
                    StepTypeDriverClass: 'Spotlight',
                    Title: 'Select Stage',
                    Body: 'Choose Closed Won',
                    Placement: 'Top',
                    Mode: 'Guide',
                    OnMissing: 'Agent Recover',
                    IsOptional: false,
                    Anchor: { Strategy: 'FormField', Entity: 'Deals', Field: 'Stage' },
                    Completion: {
                        Checks: [{ Type: 'EntityEvent', Entity: 'Deals', Action: 'Save' }],
                        Mode: 'All',
                    },
                    Configuration: {
                        localizations: {
                            es: { title: 'Seleccionar etapa', body: 'Elige Ganado' },
                        },
                    },
                },
            ],
            Paths: [
                {
                    ID: 'p1',
                    FromStepID: 's1',
                    FromStepKey: 'stage-step',
                    ToStepID: 's2',
                    ToStepKey: 'done-step',
                    Condition: 'Choice:yes',
                    Label: 'Yes',
                    Priority: 10,
                    Sequence: 1,
                    IsDefault: false,
                },
            ],
        },
    };
}

describe('TourEngine', () => {
    beforeEach(() => {
        backing = {};
        loadedConfigs = [];
        mockSettings.clear();
        mockInstanceConfigs.clear();
        mockCurrentUser = { ID: USER_ID, UserRoles: [{ Role: 'Sales Rep' }] };
        mockProviderType = 'Network';
        mockRouteOperation = vi.fn(async () => ({
            Success: true,
            ResultCode: 'SUCCESS',
            Output: { Success: true, ProcessedCount: 0 },
        }));
        TourEngine.ToursEnabled = true;
        TourEngine.Instance.EventFlushDebounceMs = 50;
        TourEngine.Instance.SetActiveSession(null);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('loads all 13 Guided Tours entities and filters runs + user overrides on Network provider', async () => {
        const provider = {
            ProviderType: 'Network',
            CurrentUser: mockCurrentUser,
        };
        await TourEngine.Instance.Config(true, mockCurrentUser as never, provider as never);

        const entityNames = loadedConfigs.map((c) => c.EntityName);
        expect(entityNames).toEqual([
            'MJ: Tour Step Types',
            'MJ: Tours',
            'MJ: Tour Versions',
            'MJ: Tour Steps',
            'MJ: Tour Step Paths',
            'MJ: Tour Prerequisites',
            'MJ: Tour Triggers',
            'MJ: Tour Learning Paths',
            'MJ: Tour Learning Path Tour Links',
            'MJ: Tour Overrides',
            'MJ: Tour Surfaces',
            'MJ: Tour Surface Tours',
            'MJ: Tour Runs',
        ]);

        const runsCfg = loadedConfigs.find((c) => c.EntityName === 'MJ: Tour Runs');
        expect(runsCfg?.Filter).toBe(`UserID='${USER_ID}'`);

        const overridesCfg = loadedConfigs.find((c) => c.EntityName === 'MJ: Tour Overrides');
        expect(overridesCfg?.Filter).toBe(`Scope <> 'User' OR UserID = '${USER_ID}'`);
    });

    it('honors the Tours.Enabled kill switch via static flag, ApplyInstanceConfiguration, and InstanceConfigEngine', async () => {
        backing._tours = [createActiveTourRow()];
        backing._tourVersions = [createVersionRow()];
        backing._stepTypes = [createStepTypeRow()];
        backing._learningPaths = [{ ID: 'lp1', Name: 'Onboarding', PathKey: 'onboard', Status: 'Active' }];

        expect(TourEngine.Instance.IsEnabled).toBe(true);
        expect(TourEngine.Instance.Tours).toHaveLength(1);

        // Via InstanceConfigEngine key
        mockInstanceConfigs.set('Tours.Enabled', 'false');
        expect(TourEngine.Instance.IsEnabled).toBe(false);
        expect(TourEngine.Instance.Tours).toEqual([]);
        expect(TourEngine.Instance.LearningPaths).toEqual([]);
        expect(await TourEngine.Instance.GetTours({})).toEqual([]);
        expect(await TourEngine.Instance.GetTourByKey('sales.close-won')).toBeNull();
        expect(TourEngine.Instance.GetWhatsNewTours({ Sales: '6.22.0' })).toEqual([]);

        mockInstanceConfigs.delete('Tours.Enabled');
        expect(TourEngine.Instance.IsEnabled).toBe(true);

        // Via ApplyInstanceConfiguration latch
        TourEngine.ApplyInstanceConfiguration({
            GetBoolean: (key, def = true) => (key === 'Tours.Enabled' ? false : def),
        });
        expect(TourEngine.ToursEnabled).toBe(false);
        expect(TourEngine.Instance.Tours).toEqual([]);
        TourEngine.ApplyInstanceConfiguration({ GetBoolean: () => true });
        expect(TourEngine.ToursEnabled).toBe(false);
    });

    it('reads InstanceConfigEngine values for InterruptionBudget, DefaultGuideAgentID, and RunStepRetentionDays', () => {
        expect(TourEngine.Instance.GetInterruptionBudget()).toEqual({
            MaxOffersPerSession: 1,
            MaxOffersPerDay: 1,
            InitialLoadQuietPeriodMs: 3000,
        });
        expect(TourEngine.Instance.GetDefaultGuideAgentID()).toBeNull();
        expect(TourEngine.Instance.GetRunStepRetentionDays()).toBeNull();

        mockInstanceConfigs.set(
            'Tours.InterruptionBudget',
            JSON.stringify({ MaxOffersPerSession: 2, MaxOffersPerDay: 3, TagGroupCaps: { sales: 1 } }),
        );
        mockInstanceConfigs.set('Tours.DefaultGuideAgentID', 'agent-sage-id');
        mockInstanceConfigs.set('Tours.RunStepRetentionDays', '90');

        expect(TourEngine.Instance.GetInterruptionBudget()).toEqual({
            MaxOffersPerSession: 2,
            MaxOffersPerDay: 3,
            InitialLoadQuietPeriodMs: 3000,
            TagGroupCaps: { sales: 1 },
        });
        expect(TourEngine.Instance.GetDefaultGuideAgentID()).toBe('agent-sage-id');
        expect(TourEngine.Instance.GetRunStepRetentionDays()).toBe(90);
    });

    it('disables Sage Voice Guide by default and enables it when Tours.SageVoiceGuide.Enabled is true', () => {
        expect(TourEngine.Instance.IsSageVoiceGuideEnabled).toBe(false);

        mockInstanceConfigs.set('Tours.SageVoiceGuide.Enabled', 'true');
        expect(TourEngine.Instance.IsSageVoiceGuideEnabled).toBe(true);

        mockInstanceConfigs.set('Tours.Enabled', 'false');
        expect(TourEngine.Instance.IsSageVoiceGuideEnabled).toBe(false);
    });

    it('compiles Active tours from immutable TourVersion.DefinitionObject and Draft tours from live step/path rows', async () => {
        backing._stepTypes = [createStepTypeRow()];
        backing._tours = [
            createActiveTourRow(),
            createActiveTourRow({
                ID: DRAFT_TOUR_ID,
                TourKey: 'sales.draft-tour',
                Name: 'Draft Tour',
                Status: 'Draft',
                CurrentVersionID: null,
            }),
        ];
        backing._tourVersions = [createVersionRow()];
        backing._tourSteps = [
            {
                ID: 'ds1',
                TourID: DRAFT_TOUR_ID,
                StepKey: 'draft-1',
                Sequence: 1,
                StepTypeID: STEP_TYPE_ID,
                Title: 'Draft Step 1',
                Body: 'Step body',
                Placement: 'Bottom',
                Mode: 'Show',
                OnMissing: 'Skip',
                IsOptional: true,
                AnchorObject: { Strategy: 'Registered', Key: 'sales.deals.board' },
            },
            {
                ID: 'ds2',
                TourID: DRAFT_TOUR_ID,
                StepKey: 'draft-2',
                Sequence: 2,
                StepTypeID: STEP_TYPE_ID,
                Title: 'Draft Step 2',
                Placement: 'Center',
                Mode: 'Show',
                OnMissing: 'Center',
                IsOptional: false,
            },
        ];
        backing._tourStepPaths = [
            {
                ID: 'dp1',
                TourID: DRAFT_TOUR_ID,
                FromStepID: 'ds1',
                ToStepID: 'ds2',
                Condition: null,
                Label: 'Continue',
                Priority: 1,
                Sequence: 1,
                IsDefault: true,
            },
        ];

        const activeTours = await TourEngine.Instance.GetTours({});
        expect(activeTours).toHaveLength(1);
        const compiledActive = activeTours[0];
        expect(compiledActive.Name).toBe('Closing your first deal (v2)');
        expect(compiledActive.VersionNumber).toBe(2);
        expect(compiledActive.ThrottleTags).toEqual(['sales', 'onboarding']);
        expect(compiledActive.Steps[0].Placement).toBe('top');
        expect(compiledActive.Steps[0].OnMissing).toBe('AgentRecover');
        expect(compiledActive.Steps[0].Configuration?.localizations?.es?.Title).toBe('Seleccionar etapa');
        expect(compiledActive.Paths).toHaveLength(1);
        expect(compiledActive.Paths?.[0].FromStepKey).toBe('stage-step');

        const compiledDraft = await TourEngine.Instance.GetTourByKey('sales.draft-tour');
        expect(compiledDraft).not.toBeNull();
        expect(compiledDraft?.Steps).toHaveLength(2);
        expect(compiledDraft?.Steps[0].Placement).toBe('bottom');
        expect(compiledDraft?.Steps[0].OnMissing).toBe('Skip');
        expect(compiledDraft?.Paths?.[0].FromStepKey).toBe('draft-1');
        expect(compiledDraft?.Paths?.[0].ToStepKey).toBe('draft-2');
    });

    it('merges MJ: Tour Overrides in Global -> Role -> User precedence and suppresses disabled tours', async () => {
        backing._stepTypes = [createStepTypeRow()];
        backing._tours = [createActiveTourRow()];
        backing._tourVersions = [createVersionRow()];
        backing._tourOverrides = [
            {
                ID: 'ov-global',
                TourID: TOUR_ID,
                Scope: 'Global',
                RoleID: null,
                UserID: null,
                Precedence: 1,
                Status: 'Active',
                IsDisabled: false,
                LaunchPolicy: JSON.stringify({ SmartDelayMs: 1000, BypassBudget: false }),
                Configuration: JSON.stringify({ Priority: 150 }),
            },
            {
                ID: 'ov-role',
                TourID: TOUR_ID,
                Scope: 'Role',
                RoleID: 'r1',
                Role: 'Sales Rep',
                UserID: null,
                Precedence: 1,
                Status: 'Active',
                IsDisabled: false,
                LaunchPolicy: JSON.stringify({ SmartDelayMs: 2500 }),
            },
            {
                ID: 'ov-user',
                TourID: TOUR_ID,
                Scope: 'User',
                RoleID: null,
                UserID: USER_ID,
                Precedence: 1,
                Status: 'Active',
                IsDisabled: false,
                LaunchPolicy: JSON.stringify({ BypassBudget: true }),
            },
        ];

        const tours = await TourEngine.Instance.GetTours({});
        expect(tours).toHaveLength(1);
        expect(tours[0].Priority).toBe(150);
        expect(tours[0].LaunchPolicy?.SmartDelayMs).toBe(2500);
        expect(tours[0].LaunchPolicy?.CriticalBypass).toBe(true);

        // User-scope IsDisabled suppresses the tour
        backing._tourOverrides.push({
            ID: 'ov-disable',
            TourID: TOUR_ID,
            Scope: 'User',
            RoleID: null,
            UserID: USER_ID,
            Precedence: 2,
            Status: 'Active',
            IsDisabled: true,
        });
        expect(await TourEngine.Instance.GetTours({})).toEqual([]);
    });

    it('batches RecordEvents via ToursRecordEventsOperation and updates optimistic GetRuns()', async () => {
        vi.useFakeTimers();
        backing._tours = [createActiveTourRow()];
        mockRouteOperation.mockResolvedValueOnce({
            Success: true,
            ResultCode: 'SUCCESS',
            Output: {
                Success: true,
                ProcessedCount: 2,
                RunIdsByClientId: { 'run-client-1': 'server-run-999' },
            },
        });

        const e1: TourRunEvent = {
            EventID: 'e1',
            RunID: 'run-client-1',
            TourKey: 'sales.close-won',
            TourVersionID: VERSION_ID,
            EventType: 'RunStarted',
            Timestamp: '2026-11-24T12:00:00.000Z',
            GuideMode: 'Visual',
            DirectorType: 'Visual',
            StepKey: 'stage-step',
        };
        const e2: TourRunEvent = {
            EventID: 'e2',
            RunID: 'run-client-1',
            TourKey: 'sales.close-won',
            TourVersionID: VERSION_ID,
            EventType: 'StepSkipped',
            Timestamp: '2026-11-24T12:00:05.000Z',
            StepKey: 'stage-step',
            Outcome: 'Already Known',
        };

        const p1 = TourEngine.Instance.RecordEvents([e1]);
        const p2 = TourEngine.Instance.RecordEvents([e2]);

        // Optimistic run is immediately visible before the batch flushes
        const runsBeforeFlush = await TourEngine.Instance.GetRuns();
        expect(runsBeforeFlush).toHaveLength(1);
        expect(runsBeforeFlush[0].TourKey).toBe('sales.close-won');
        expect(mockRouteOperation).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(60);
        await Promise.all([p1, p2]);

        expect(mockRouteOperation).toHaveBeenCalledTimes(1);
        const [opKey, payload] = mockRouteOperation.mock.calls[0] as [
            string,
            { Events: Array<{ EventType: string; StepOutcome?: string; RunClientId?: string }> },
        ];
        expect(opKey).toBe('Tours.RecordEvents');
        expect(payload.Events).toHaveLength(2);
        expect(payload.Events[0].EventType).toBe('RunStarted');
        expect(payload.Events[1].EventType).toBe('StepCompleted');
        expect(payload.Events[1].StepOutcome).toBe('Already Known');

        // Subsequent events reuse the server RunId returned in RunIdsByClientId
        const p3 = TourEngine.Instance.RecordEvents([
            {
                EventID: 'e3',
                RunID: 'run-client-1',
                TourKey: 'sales.close-won',
                TourVersionID: VERSION_ID,
                EventType: 'RunCompleted',
                Timestamp: '2026-11-24T12:01:00.000Z',
            },
        ]);
        await vi.advanceTimersByTimeAsync(60);
        await p3;
        const [, secondPayload] = mockRouteOperation.mock.calls[1] as [
            string,
            { Events: Array<{ RunId?: string }> },
        ];
        expect(secondPayload.Events[0].RunId).toBe('server-run-999');
    });

    it('implements EvaluatePredicates, PublishTour, and ClaimGuestRuns via Remote Operations', async () => {
        mockRouteOperation
            .mockResolvedValueOnce({
                Success: true,
                ResultCode: 'SUCCESS',
                Output: {
                    Success: true,
                    Results: {
                        '0:HasRecords': { Satisfied: true, RowCount: 4 },
                    },
                },
            })
            .mockResolvedValueOnce({
                Success: true,
                ResultCode: 'SUCCESS',
                Output: {
                    Success: true,
                    TourId: TOUR_ID,
                    TourVersionId: VERSION_ID,
                    VersionNumber: 3,
                },
            })
            .mockResolvedValueOnce({
                Success: true,
                ResultCode: 'SUCCESS',
                Output: {
                    Success: true,
                    ClaimedRunCount: 2,
                },
            });

        const predRes = await TourEngine.Instance.EvaluatePredicates([
            { PredicateKey: 'HasRecords', Params: { EntityName: 'Deals' } },
        ]);
        expect(predRes).toEqual([
            { PredicateKey: 'HasRecords', Satisfied: true, ErrorMessage: undefined },
        ]);

        const pubRes = await TourEngine.Instance.PublishTour(TOUR_ID, 'Updated copy', true);
        expect(pubRes).toMatchObject({ Success: true, VersionNumber: 3 });

        const claimRes = await TourEngine.Instance.ClaimGuestRuns('visitor-abc', 'public-web');
        expect(claimRes).toEqual({ Success: true, ClaimedRunCount: 2 });
    });

    it('persists user preferences via UserInfoEngine (no localStorage)', () => {
        expect(TourEngine.Instance.GetUserPreferences()).toEqual({
            OffersEnabled: true,
            PreferredGuideMode: 'Visual',
            ShowBeacons: true,
        });

        TourEngine.Instance.UpdateUserPreferences({
            PreferredGuideMode: 'Chat',
            Pace: 'slow',
            OffersEnabled: false,
        });

        expect(UserInfoEngine.Instance.SetSettingDebounced).toHaveBeenCalledWith(
            'mj.tours.preferences.v1',
            expect.any(String),
            mockCurrentUser,
        );
        expect(TourEngine.Instance.GetUserPreferences()).toEqual({
            OffersEnabled: false,
            PreferredGuideMode: 'Chat',
            Pace: 'slow',
            ShowBeacons: true,
        });
    });

    it('returns What\'s New tours matching newly upgraded Open App versions', () => {
        backing._stepTypes = [createStepTypeRow()];
        backing._tours = [
            createActiveTourRow({ VersionTag: '6.22' }),
            createActiveTourRow({
                ID: DRAFT_TOUR_ID,
                TourKey: 'sales.old-feature',
                VersionTag: '6.20',
            }),
        ];
        backing._tourVersions = [createVersionRow()];

        const matches = TourEngine.Instance.GetWhatsNewTours({ Sales: '6.22.1' });
        expect(matches.map((t) => t.TourKey)).toEqual(['sales.close-won']);
    });

    it('forwards active TourSession Events$ through TourEngine.Events$ and ActiveSession$', async () => {
        const location$ = new Subject<TourLocation>();
        const host: ITourHost = {
            Capabilities: {
                Navigation: 'MJ App',
                EntityEvents: true,
                MJForms: true,
                Angular: true,
                Agent: 'Chat and Voice',
                Persistence: 'MJ User',
            },
            Location$: location$.asObservable(),
            Navigate: async () => true,
            Principal: { Kind: 'MJUser', UserId: USER_ID, Roles: [] },
        };

        backing._stepTypes = [createStepTypeRow()];
        backing._tours = [createActiveTourRow()];
        backing._tourVersions = [createVersionRow()];
        const [tourDef] = await TourEngine.Instance.GetTours({});

        const session = new TourSession({
            Tour: tourDef,
            Host: host,
            ProgressStore: TourEngine.Instance,
        });

        const seenEvents: string[] = [];
        TourEngine.Instance.Events$.subscribe((evt) => seenEvents.push(evt.EventName));
        TourEngine.Instance.SetActiveSession(session);

        expect(TourEngine.Instance.ActiveSession).toBe(session);
        await session.Start();

        expect(seenEvents).toContain('BeforeTourStart');
        expect(seenEvents).toContain('AfterTourStart');
        expect(seenEvents).toContain('BeforeTourStepEnter');
        expect(seenEvents).toContain('AfterTourStepEnter');
    });
});
