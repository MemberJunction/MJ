/**
 * @fileoverview Unit tests for Smart @Mention ranking, frecency decay, multi-field/acronym
 * search, population/field filters, empty-query grouping, and BaseEntityEvent auto-sync.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GetGlobalObjectStore, MJEvent, MJEventType } from '@memberjunction/global';
import type { UserInfo } from '@memberjunction/core';

interface MockAgentStub {
    ID: string;
    Name: string;
    Description: string | null;
    IconClass: string | null;
    LogoURL: string | null;
    ParentID: string | null;
    Status: string;
    InvocationMode: string;
    IsRestricted: boolean;
    InstantiationMode: 'None' | 'Optional' | 'Required';
    BaseAgentID: string | null;
    BaseAgent: string | null;
    OwnerUserID: string | null;
}

interface MockSkillStub {
    ID: string;
    Name: string;
    Description: string | null;
    Status: string;
    IconClass: string | null;
    Color: string | null;
}

const hoisted = vi.hoisted(() => {
    const subscribers = new Set<(event: MJEvent) => void>();
    let readableAgents: MockAgentStub[] = [];
    let accessibleSkills: MockSkillStub[] = [];
    const userSettingsStore = new Map<string, string>();
    const setSettingDebounced = vi.fn((key: string, value: string) => {
        userSettingsStore.set(key, value);
    });
    const getSetting = vi.fn((key: string) => userSettingsStore.get(key));
    const userInfoEngineMock = {
        Loaded: true,
        GetSetting: getSetting,
        SetSettingDebounced: setSettingDebounced,
    };

    return {
        emitEvent: (event: MJEvent) => {
            for (const sub of subscribers) {
                sub(event);
            }
        },
        eventListenerObservable: {
            subscribe: (fn: (event: MJEvent) => void) => {
                subscribers.add(fn);
                return {
                    unsubscribe: () => {
                        subscribers.delete(fn);
                    },
                };
            },
        },
        clearSubscribers: () => {
            subscribers.clear();
        },
        getReadableAgents: () => readableAgents,
        setReadableAgents: (agents: MockAgentStub[]) => {
            readableAgents = agents;
        },
        getAccessibleSkills: () => accessibleSkills,
        setAccessibleSkills: (skills: MockSkillStub[]) => {
            accessibleSkills = skills;
        },
        userSettingsStore,
        setSettingDebounced,
        getSetting,
        userInfoEngineMock,
        hasAgentPermission: vi.fn().mockResolvedValue(true),
    };
});

vi.mock('@memberjunction/ai-engine-base', () => ({
    AIEngineBase: {
        Instance: {
            Config: vi.fn().mockResolvedValue(undefined),
            get ReadableAgents(): MockAgentStub[] {
                return hoisted.getReadableAgents();
            },
            GetAgentByID: (id: string) =>
                hoisted.getReadableAgents().find((a) => a.ID.toLowerCase() === id.toLowerCase()),
            GetAgentConfigurationPresets: vi.fn().mockReturnValue([]),
            GetSkillsForAgent: vi.fn().mockReturnValue([]),
        },
    },
    AIAgentPermissionHelper: {
        HasPermission: hoisted.hasAgentPermission,
    },
    AISkillPermissionHelper: {
        GetAccessibleSkills: vi.fn(async () => hoisted.getAccessibleSkills()),
    },
}));

vi.mock('@memberjunction/core', () => ({
    BaseEntity: {
        BaseEventCode: 'BaseEntityEvent',
    },
    Metadata: class {
        public static Provider = {
            Entities: [],
            Queries: [],
            EntityByName: () => undefined,
            CurrentUser: undefined as UserInfo | undefined,
        };
    },
}));

vi.mock('@memberjunction/core-entities', () => ({
    QueryEngine: {
        Instance: {
            Config: vi.fn().mockResolvedValue(undefined),
            Queries: [],
        },
    },
    UserInfoEngine: {
        get Instance() {
            return hoisted.userInfoEngineMock;
        },
    },
}));

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return {
        ...actual,
        MJGlobal: {
            Instance: {
                GetEventListener: vi.fn(() => hoisted.eventListenerObservable),
            },
        },
    };
});

import { MentionAutocomplete } from '../mentions/MentionAutocomplete';
import type { MentionSuggestionScope } from '../mentions/MentionSuggestion';

class TestableMentionAutocomplete extends MentionAutocomplete {
    public constructor() {
        super();
    }
}

const CURRENT_USER: UserInfo = {
    ID: '11111111-1111-1111-1111-111111111111',
    Name: 'Amith Nagarajan',
    Email: 'amith@bluecypress.io',
} as UserInfo;

const OTHER_USER_ID = '22222222-2222-2222-2222-222222222222';
const COS_TEMPLATE_ID = 'C0500000-0000-0000-0000-000000000001';
const PEPPER_ID = 'A0000000-0000-0000-0000-000000000001';
const JARVIS_ID = 'A0000000-0000-0000-0000-000000000002';
const SAGE_ID = 'A0000000-0000-0000-0000-000000000003';
const FDA_SCOUT_ID = 'A0000000-0000-0000-0000-000000000004';
const QUERY_BUILDER_ID = 'A0000000-0000-0000-0000-000000000005';
const SHARED_DERIVED_ID = 'A0000000-0000-0000-0000-000000000006';

function makeAgent(overrides: Partial<MockAgentStub> & { ID: string; Name: string }): MockAgentStub {
    return {
        Description: null,
        IconClass: null,
        LogoURL: null,
        ParentID: null,
        Status: 'Active',
        InvocationMode: 'Top-Level',
        IsRestricted: false,
        InstantiationMode: 'None',
        BaseAgentID: null,
        BaseAgent: null,
        OwnerUserID: null,
        ...overrides,
    };
}

const DEFAULT_AGENTS: MockAgentStub[] = [
    makeAgent({
        ID: COS_TEMPLATE_ID,
        Name: 'Chief of Staff',
        Description: 'Executive coordination template',
        InstantiationMode: 'Required',
    }),
    makeAgent({
        ID: PEPPER_ID,
        Name: 'Pepper',
        Description: 'Personal executive assistant for calendar and email triage',
        BaseAgentID: COS_TEMPLATE_ID,
        BaseAgent: 'Chief of Staff',
        OwnerUserID: CURRENT_USER.ID,
    }),
    makeAgent({
        ID: JARVIS_ID,
        Name: 'Jarvis',
        Description: 'Board prep specialist derived from Chief of Staff',
        BaseAgentID: COS_TEMPLATE_ID,
        BaseAgent: null, // tests fallback lookup via AIEngineBase.GetAgentByID
        OwnerUserID: CURRENT_USER.ID,
    }),
    makeAgent({
        ID: SAGE_ID,
        Name: 'Sage',
        Description: 'General purpose platform assistant',
    }),
    makeAgent({
        ID: FDA_SCOUT_ID,
        Name: 'FDA Clinical Scout',
        Description: 'Monitors regulatory trials and FDA clearances',
    }),
    makeAgent({
        ID: QUERY_BUILDER_ID,
        Name: 'Query Builder',
        Description: 'Writes, validates, and optimizes SQL analytics queries against warehouse tables',
    }),
    makeAgent({
        ID: SHARED_DERIVED_ID,
        Name: 'Team Chief',
        Description: 'Shared operations assistant',
        BaseAgentID: COS_TEMPLATE_ID,
        BaseAgent: 'Chief of Staff',
        OwnerUserID: OTHER_USER_ID,
    }),
];

describe('MentionAutocomplete — Smart @Mention ranking, frecency, filters & auto-sync', () => {
    let engine: TestableMentionAutocomplete;

    beforeEach(async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-11-23T12:00:00.000Z'));

        const globalStore = GetGlobalObjectStore();
        if (globalStore) {
            delete globalStore['___SINGLETON__TestableMentionAutocomplete'];
        }

        hoisted.clearSubscribers();
        hoisted.userSettingsStore.clear();
        hoisted.setSettingDebounced.mockClear();
        hoisted.getSetting.mockClear();
        hoisted.hasAgentPermission.mockResolvedValue(true);
        hoisted.userInfoEngineMock.Loaded = true;
        hoisted.setReadableAgents([...DEFAULT_AGENTS]);
        hoisted.setAccessibleSkills([
            {
                ID: 'S0000000-0000-0000-0000-000000000001',
                Name: 'SQL Tuning',
                Description: 'Tune slow SQL',
                Status: 'Active',
                IconClass: null,
                Color: null,
            },
        ]);

        engine = new TestableMentionAutocomplete();
        await engine.initialize(CURRENT_USER);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('Frecency scoring, decay, and persistence', () => {
        it('records mention uses, persists to UserInfoEngine, and applies exponential decay over 72h half-life constant', () => {
            engine.RecordMentionUse(SAGE_ID, 'agent', CURRENT_USER);
            engine.RecordMentionUse(SAGE_ID, 'agent', CURRENT_USER);

            expect(hoisted.setSettingDebounced).toHaveBeenCalledTimes(2);
            const [settingKey, rawJson, userArg] = hoisted.setSettingDebounced.mock.calls[1];
            expect(settingKey).toBe('chat.mentionFrecency');
            expect(userArg).toBe(CURRENT_USER);

            const savedMap = JSON.parse(rawJson) as Record<string, { uses: number; lastUsedAt: string }>;
            expect(savedMap[SAGE_ID.toLowerCase()].uses).toBe(2);

            // At t=0h: 2 * 6 * exp(0) = 12
            const immediate = engine.GetSuggestions('', true, '@');
            const sageNow = immediate.find((s) => s.id === SAGE_ID);
            expect(sageNow?.frecencyScore).toBeCloseTo(12, 4);

            // Advance 72 hours -> 2 * 6 * exp(-1) ≈ 4.41455
            vi.advanceTimersByTime(72 * 3_600_000);
            const decayed = engine.GetSuggestions('', true, '@');
            const sageDecayed = decayed.find((s) => s.id === SAGE_ID);
            expect(sageDecayed?.frecencyScore).toBeCloseTo(12 * Math.exp(-1), 4);
        });

        it('updates in-memory frecency without throwing or persisting when UserInfoEngine has no user context', async () => {
            const globalStore = GetGlobalObjectStore();
            if (globalStore) {
                delete globalStore['___SINGLETON__TestableMentionAutocomplete'];
            }
            hoisted.userInfoEngineMock.Loaded = false;
            const uncontextualized = new TestableMentionAutocomplete();
            await uncontextualized.initialize({ ID: '', Name: 'Anon', Email: '' } as UserInfo);

            uncontextualized.RecordMentionUse(SAGE_ID, 'agent');
            expect(hoisted.setSettingDebounced).not.toHaveBeenCalled();

            // Even without persistence, in-memory frecency boosts the item
            const suggestions = uncontextualized.GetSuggestions('', false, '@');
            const sage = suggestions.find((s) => s.id === SAGE_ID);
            expect(sage?.frecencyScore).toBeCloseTo(6, 4);
        });

        it('caps persisted frecency map at 100 entries keeping top-scoring items', () => {
            for (let i = 0; i < 110; i++) {
                vi.advanceTimersByTime(60_000);
                const id = `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`;
                engine.RecordMentionUse(id, 'agent', CURRENT_USER);
            }

            const lastCall = hoisted.setSettingDebounced.mock.calls.at(-1);
            expect(lastCall).toBeDefined();
            const savedMap = JSON.parse(lastCall![1]) as Record<string, { uses: number; lastUsedAt: string }>;
            expect(Object.keys(savedMap)).toHaveLength(100);
            // Most recent entry is preserved; oldest entry was pruned
            expect(savedMap['00000000-0000-0000-0000-000000000109']).toBeDefined();
            expect(savedMap['00000000-0000-0000-0000-000000000000']).toBeUndefined();
        });
    });

    describe('Multi-field + acronym search scoring', () => {
        it('matches multi-word acronyms of length >= 2 (e.g. @fcs -> FDA Clinical Scout)', () => {
            const matches = engine.GetSuggestions('fcs', true, '@');
            expect(matches.map((m) => m.name)).toEqual(['FDA Clinical Scout']);
            expect(matches[0].group).toBe('results');
            expect(matches[0].groupLabel).toBe('Results');
        });

        it('matches capability/description keywords via token-AND (e.g. @sql -> Query Builder)', () => {
            const matches = engine.GetSuggestions('sql', true, '@');
            expect(matches.map((m) => m.name)).toEqual(['Query Builder']);

            const multiToken = engine.GetSuggestions('warehouse analytics', true, '@');
            expect(multiToken.map((m) => m.name)).toEqual(['Query Builder']);
        });

        it('ranks exact > prefix > acronym > substring > lineage > token-AND', async () => {
            const globalStore = GetGlobalObjectStore();
            if (globalStore) {
                delete globalStore['___SINGLETON__TestableMentionAutocomplete'];
            }
            hoisted.setReadableAgents([
                makeAgent({ ID: '1', Name: 'Alpha', Description: 'general' }),
                makeAgent({ ID: '2', Name: 'Alpha Beta', Description: 'general' }),
                makeAgent({ ID: '3', Name: 'Alpha Delta', Description: 'general' }),
                makeAgent({ ID: '4', Name: 'Super Alpha One', Description: 'general' }),
                makeAgent({
                    ID: '5',
                    Name: 'Chief Helper',
                    Description: 'general',
                    BaseAgentID: '1',
                    BaseAgent: 'Alpha',
                }),
                makeAgent({ ID: '6', Name: 'Helper', Description: 'uses alpha token in capabilities' }),
            ]);
            const custom = new TestableMentionAutocomplete();
            await custom.initialize(CURRENT_USER);
            const results = custom.GetSuggestions('alpha', false, '@');
            expect(results.map((r) => r.name)).toEqual([
                'Alpha', // exact (140)
                'Alpha Beta', // prefix (105)
                'Alpha Delta', // prefix (105)
                'Super Alpha One', // substring (70)
                'Chief Helper', // base-agent lineage (58)
                'Helper', // token-AND description (48)
            ]);
        });

        it('respects SearchField filters (name, capabilities, lineage)', () => {
            // 'sql' is in Query Builder's description, not its name
            expect(engine.GetSuggestions('sql', true, '@', null, { SearchField: 'name' })).toEqual([]);
            expect(
                engine.GetSuggestions('sql', true, '@', null, { SearchField: 'capabilities' }).map((m) => m.name)
            ).toEqual(['Query Builder']);

            // 'chief of staff' matches lineage on Pepper, Jarvis, and Team Chief
            const lineageMatches = engine.GetSuggestions('chief of staff', true, '@', null, {
                SearchField: 'lineage',
            });
            expect(lineageMatches.map((m) => m.name).sort()).toEqual(['Jarvis', 'Pepper', 'Team Chief']);

            // Name-only query should NOT match when SearchField is 'lineage'
            expect(engine.GetSuggestions('pepper', true, '@', null, { SearchField: 'lineage' })).toEqual([]);
        });
    });

    describe('PopulationFilter, lineage formatting, context boosts, and empty-query grouping', () => {
        it('populates lineage, isMyAgent, isDefaultChatAgent, and isInCurrentThread flags accurately', () => {
            const scope: MentionSuggestionScope = {
                DefaultChatAgentID: PEPPER_ID,
                InThreadAgentIDs: [QUERY_BUILDER_ID],
            };
            const list = engine.GetSuggestions('', true, '@', null, scope);

            const pepper = list.find((s) => s.id === PEPPER_ID);
            const jarvis = list.find((s) => s.id === JARVIS_ID);
            const teamChief = list.find((s) => s.id === SHARED_DERIVED_ID);
            const sage = list.find((s) => s.id === SAGE_ID);
            const qb = list.find((s) => s.id === QUERY_BUILDER_ID);

            expect(pepper?.isMyAgent).toBe(true);
            expect(pepper?.lineage).toBe('Chief of Staff · My Agent');
            expect(pepper?.isDefaultChatAgent).toBe(true);
            expect(pepper?.isInCurrentThread).toBe(false);

            expect(jarvis?.isMyAgent).toBe(true);
            expect(jarvis?.lineage).toBe('Chief of Staff · My Agent');

            expect(teamChief?.isMyAgent).toBe(false);
            expect(teamChief?.lineage).toBe('Shared · Chief of Staff');

            expect(sage?.isMyAgent).toBe(false);
            expect(sage?.lineage).toBe('Shared');

            expect(qb?.isInCurrentThread).toBe(true);
        });

        it('groups empty-query all suggestions into frequent (top 3), my-agents, shared, people in order', () => {
            // Boost 4 candidates so we verify top-3 cap on 'frequent'
            engine.RecordMentionUse(SAGE_ID, 'agent', CURRENT_USER); // +6
            engine.RecordMentionUse(FDA_SCOUT_ID, 'agent', CURRENT_USER); // +6
            engine.RecordMentionUse(FDA_SCOUT_ID, 'agent', CURRENT_USER); // +12 total

            const scope: MentionSuggestionScope = {
                InThreadAgentIDs: [QUERY_BUILDER_ID], // +25
                DefaultChatAgentID: PEPPER_ID, // +18 + 12 (myAgent) = +30
                People: [{ ID: 'p-1', Name: 'Sarah Chen', Email: 'sarah@bluecypress.io' }],
            };

            const list = engine.GetSuggestions('', true, '@', null, scope);

            const frequent = list.filter((s) => s.group === 'frequent');
            expect(frequent).toHaveLength(3);
            expect(frequent.every((s) => s.groupLabel === 'Frequent & Recent')).toBe(true);
            // Pepper (30) > Query Builder (25) > FDA Clinical Scout (12); Sage (6) overflows into 'shared'
            expect(frequent.map((s) => s.name)).toEqual(['Pepper', 'Query Builder', 'FDA Clinical Scout']);

            // Verify section sequence: frequent -> my-agents -> shared -> people
            const groupOrder = list.map((s) => s.group);
            const uniqueOrder = groupOrder.filter((g, idx) => idx === 0 || g !== groupOrder[idx - 1]);
            expect(uniqueOrder).toEqual(['frequent', 'my-agents', 'shared', 'people']);

            const myAgents = list.filter((s) => s.group === 'my-agents');
            expect(myAgents.map((s) => s.name)).toEqual(['Jarvis']);
            expect(myAgents[0].groupLabel).toBe('My Agents');

            const shared = list.filter((s) => s.group === 'shared');
            // Sage (6 frecency) should sort above Team Chief (0)
            expect(shared.map((s) => s.name)).toEqual(['Sage', 'Team Chief']);

            const people = list.filter((s) => s.group === 'people');
            expect(people.map((s) => s.name)).toEqual(['Sarah Chen']);
        });

        it('filters populations cleanly for my-agents, shared, and people', () => {
            const scopeBase: MentionSuggestionScope = {
                People: [{ ID: 'p-1', Name: 'Sarah Chen', Email: 'sarah@bluecypress.io' }],
            };

            const myOnly = engine.GetSuggestions('', true, '@', null, {
                ...scopeBase,
                PopulationFilter: 'my-agents',
            });
            expect(myOnly.map((s) => s.name).sort()).toEqual(['Jarvis', 'Pepper']);
            expect(myOnly.every((s) => s.group === 'my-agents')).toBe(true);

            const sharedOnly = engine.GetSuggestions('', true, '@', null, {
                ...scopeBase,
                PopulationFilter: 'shared',
            });
            expect(sharedOnly.map((s) => s.name).sort()).toEqual([
                'FDA Clinical Scout',
                'Query Builder',
                'Sage',
                'Team Chief',
            ]);
            expect(sharedOnly.every((s) => s.group === 'shared')).toBe(true);

            const peopleOnly = engine.GetSuggestions('', true, '@', null, {
                ...scopeBase,
                PopulationFilter: 'people',
            });
            expect(peopleOnly.map((s) => s.name)).toEqual(['Sarah Chen']);
            expect(peopleOnly.every((s) => s.group === 'people')).toBe(true);
        });
    });

    describe('BaseEntityEvent debounced auto-sync', () => {
        it('re-syncs agentsCache automatically after MJ: AI Agents save and remote-invalidate events without manual Refresh', async () => {
            const CATO_ID = 'A0000000-0000-0000-0000-000000000099';
            expect(engine.GetAvailableAgents().some((a) => a.ID === CATO_ID)).toBe(false);

            // Simulate BaseEngine immediate mutation adding Cato to ReadableAgents
            hoisted.setReadableAgents([
                ...DEFAULT_AGENTS,
                makeAgent({
                    ID: CATO_ID,
                    Name: 'Cato',
                    Description: 'Strategic red-team advisor',
                    BaseAgentID: COS_TEMPLATE_ID,
                    BaseAgent: 'Chief of Staff',
                    OwnerUserID: CURRENT_USER.ID,
                }),
            ]);

            // Emit save BaseEntityEvent via MJGlobal
            hoisted.emitEvent({
                component: {},
                event: MJEventType.ComponentEvent,
                eventCode: 'BaseEntityEvent',
                args: {
                    type: 'save',
                    baseEntity: { EntityInfo: { Name: 'MJ: AI Agents' } },
                },
            });

            // Debounce hasn't fired yet at 20ms
            await vi.advanceTimersByTimeAsync(20);
            expect(engine.GetAvailableAgents().some((a) => a.ID === CATO_ID)).toBe(false);

            // After 50ms debounce fires, Cato is in agentsCache automatically!
            await vi.advanceTimersByTimeAsync(40);
            expect(engine.GetAvailableAgents().some((a) => a.ID === CATO_ID)).toBe(true);

            // Now simulate remote-invalidate removing Cato
            hoisted.setReadableAgents([...DEFAULT_AGENTS]);
            hoisted.emitEvent({
                component: {},
                event: MJEventType.ComponentEvent,
                eventCode: 'BaseEntityEvent',
                args: {
                    type: 'remote-invalidate',
                    entityName: 'MJ: AI Agents',
                    baseEntity: null,
                },
            });

            await vi.advanceTimersByTimeAsync(60);
            expect(engine.GetAvailableAgents().some((a) => a.ID === CATO_ID)).toBe(false);
        });

        it('re-syncs agentsCache on MJ: AI Agent Permissions delete and skillsCache on MJ: AI Skills save', async () => {
            // Permission revoked for Sage
            hoisted.hasAgentPermission.mockImplementation(
                async (agentId: string) => agentId !== SAGE_ID
            );
            hoisted.emitEvent({
                component: {},
                event: MJEventType.ComponentEvent,
                eventCode: 'BaseEntityEvent',
                args: {
                    type: 'delete',
                    baseEntity: { EntityInfo: { Name: 'MJ: AI Agent Permissions' } },
                },
            });

            // New skill added
            hoisted.setAccessibleSkills([
                {
                    ID: 'S0000000-0000-0000-0000-000000000001',
                    Name: 'SQL Tuning',
                    Description: 'Tune slow SQL',
                    Status: 'Active',
                    IconClass: null,
                    Color: null,
                },
                {
                    ID: 'S0000000-0000-0000-0000-000000000002',
                    Name: 'Board Memo',
                    Description: 'Draft executive board memo',
                    Status: 'Active',
                    IconClass: 'fa-solid fa-file-lines',
                    Color: '#4f46e5',
                },
            ]);
            hoisted.emitEvent({
                component: {},
                event: MJEventType.ComponentEvent,
                eventCode: 'BaseEntityEvent',
                args: {
                    type: 'save',
                    baseEntity: { EntityInfo: { Name: 'MJ: AI Skills' } },
                },
            });

            await vi.advanceTimersByTimeAsync(60);

            expect(engine.GetAvailableAgents().some((a) => a.ID === SAGE_ID)).toBe(false);
            const skills = engine.GetSuggestions('board', false, '/');
            expect(skills.map((s) => s.name)).toEqual(['Board Memo']);
        });
    });
});
