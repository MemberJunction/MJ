/**
 * Unit tests for the REAL metadata-reading helpers of {@link RealtimeClientSessionService} —
 * the paths every other suite stubs out via overridable seams:
 *
 *  - co-agent / target-agent resolution from AIEngine's cached agents
 *  - narration-instruction template resolution (Active filter, case/whitespace-insensitive name,
 *    empty-text and engine-failure tolerance)
 *  - co-agent system prompt resolution (ExecutionOrder ordering, Active filter, dangling prompt)
 *  - default realtime model selection (PowerRank ordering, Active + Realtime-type filters)
 *  - vendor selection (Priority ordering, API-key gating, Active/DriverClass filters)
 *  - the default walk for a co-agent with video on (a model that shows an avatar first: its Video/Output
 *    row and its endpoint), and the explicit choices that win over it
 *
 * `@memberjunction/aiengine` is module-mocked with a controllable in-memory metadata cache; no DB,
 * no network. AgentRunner is mocked so importing the service stays light.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { BaseRealtimeModel } from '@memberjunction/ai';
import type { MJAIAgentEntityExtended, MJAIModelEntityExtended } from '@memberjunction/ai-core-plus';

// Controllable AIEngine metadata cache. `throwOnAccess` simulates an unconfigured engine whose
// getters throw (the narration resolver must tolerate that).
const engineState = {
    Agents: [] as unknown[],
    Prompts: [] as unknown[],
    AgentPrompts: [] as unknown[],
    Models: [] as unknown[],
    ModelVendors: [] as unknown[],
    ModelModalities: [] as unknown[],
    throwOnAccess: false,
};

/** The `MJ: AI Modalities` rows the mocked engine knows. */
const MODALITIES = [{ ID: 'modality-video', Name: 'Video' }, { ID: 'modality-audio', Name: 'Audio' }];

function guard<T>(value: T): T {
    if (engineState.throwOnAccess) {
        throw new Error('AIEngine metadata not loaded');
    }
    return value;
}

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        get Instance() {
            return {
                Config: vi.fn(async () => undefined),
                get Agents() { return guard(engineState.Agents); },
                get Prompts() { return guard(engineState.Prompts); },
                get AgentPrompts() { return guard(engineState.AgentPrompts); },
                get Models() { return guard(engineState.Models); },
                get ModelVendors() { return guard(engineState.ModelVendors); },
                get ModelModalities() { return guard(engineState.ModelModalities); },
                GetModalityByName: (name: string) => MODALITIES.find((m) => m.Name.toLowerCase() === name.toLowerCase()),
            };
        },
    },
}));

// Keep the import graph light — delegation is not under test here.
vi.mock('../AgentRunner', () => ({
    AgentRunner: class {
        RunAgent = vi.fn();
        ProcessAgentArtifacts = vi.fn();
    },
}));

import {
    RealtimeClientSessionService,
    PrepareClientSessionInput,
    CoAgentSystemPromptResolution,
    RealtimeModelResolution,
    RealtimeModelResolutionOutcome,
} from '../realtime/realtime-client-session-service';
import type { RealtimeCoAgentConfig } from '../realtime/realtime-coagent-config';

/** Exposes the protected metadata-reading helpers; stubs only key lookup + driver instantiation. */
class MetadataExposedService extends RealtimeClientSessionService {
    /** DriverClass → API key. Vendors whose DriverClass is absent here have "no key configured". */
    public Keys: Record<string, string> = {};
    public CreatedDrivers: string[] = [];

    protected override getAPIKeyForDriver(driverClass: string): string | undefined {
        return this.Keys[driverClass];
    }
    /** DriverClasses whose instantiated model should report SupportsClientDirect=false. */
    public NonClientDirectDrivers = new Set<string>();
    /** DriverClasses whose endpoint renders avatars (`SupportsAvatarOutput` true for every API name). */
    public AvatarDrivers = new Set<string>();
    /** Each avatar question a driver was asked, as `<DriverClass>:<APIName>`. */
    public AvatarAsked: string[] = [];
    protected override createModelInstance(driverClass: string): BaseRealtimeModel | null {
        this.CreatedDrivers.push(driverClass);
        return {
            Driver: driverClass,
            SupportsClientDirect: !this.NonClientDirectDrivers.has(driverClass),
            SupportsAvatarOutput: (apiName: string) => {
                this.AvatarAsked.push(`${driverClass}:${apiName}`);
                return this.AvatarDrivers.has(driverClass);
            },
        } as unknown as BaseRealtimeModel;
    }

    public CallResolveCoAgent(input: PrepareClientSessionInput): MJAIAgentEntityExtended | null {
        return this.resolveCoAgent(input);
    }
    public CallResolveTarget(id: string): MJAIAgentEntityExtended | null {
        return this.resolveTargetAgent(id);
    }
    public CallNarration(): string | null {
        return this.resolveNarrationInstructionsTemplate();
    }
    public CallCoAgentPrompt(coAgent: MJAIAgentEntityExtended): CoAgentSystemPromptResolution {
        return this.resolveCoAgentSystemPrompt(coAgent);
    }
    public CallSelectVendor(modelID: string): { VendorID: string; DriverClass: string; APIName: string } | null {
        return this.selectRealtimeVendor(modelID);
    }
    public CallResolveModel(coAgent: MJAIAgentEntityExtended): Promise<RealtimeModelResolution | null> {
        return this.resolveRealtimeModel(coAgent);
    }
    public CallFindModelByID(id: string): MJAIModelEntityExtended | null {
        return this.findModelByID(id);
    }
    public CallResolveModelForSession(input: Partial<PrepareClientSessionInput>, config?: RealtimeCoAgentConfig): Promise<RealtimeModelResolutionOutcome> {
        return this.resolveModelForSession({ AgentSessionID: 's-1', ...input } as PrepareClientSessionInput, agent('co-1', 'Realtime Co-Agent'), config);
    }
}

function agent(id: string, name: string): MJAIAgentEntityExtended {
    return { ID: id, Name: name } as unknown as MJAIAgentEntityExtended;
}

beforeEach(() => {
    engineState.Agents = [];
    engineState.Prompts = [];
    engineState.AgentPrompts = [];
    engineState.Models = [];
    engineState.ModelVendors = [];
    engineState.ModelModalities = [];
    engineState.throwOnAccess = false;
});

// ════════════════════════════════════════════════════════════════════
// Co-agent / target-agent resolution
// ════════════════════════════════════════════════════════════════════

describe('resolveCoAgent / resolveTargetAgent (real metadata lookup)', () => {
    it('returns the supplied CoAgent entity directly without consulting the cache', () => {
        engineState.throwOnAccess = true; // would explode if the cache were touched
        const svc = new MetadataExposedService();
        const co = agent('co-1', 'Realtime Co-Agent');
        expect(svc.CallResolveCoAgent({ CoAgent: co, TargetAgentID: 't', AgentSessionID: 's' })).toBe(co);
    });

    it('resolves CoAgentID from the cached agents, case-insensitively (UUID casing)', () => {
        const co = agent('ABCDEF00-0000-0000-0000-000000000001', 'Realtime Co-Agent');
        engineState.Agents = [agent('other-1', 'Other'), co];
        const svc = new MetadataExposedService();

        const resolved = svc.CallResolveCoAgent({
            CoAgentID: 'abcdef00-0000-0000-0000-000000000001',
            TargetAgentID: 't',
            AgentSessionID: 's',
        });
        expect(resolved).toBe(co);
    });

    it('returns null when the CoAgentID is not in the cache', () => {
        engineState.Agents = [agent('co-1', 'Realtime Co-Agent')];
        const svc = new MetadataExposedService();
        expect(svc.CallResolveCoAgent({ CoAgentID: 'missing', TargetAgentID: 't', AgentSessionID: 's' })).toBeNull();
    });

    it('resolveTargetAgent finds the target by id and returns null for empty/unknown ids', () => {
        const target = agent('target-1', 'Sales Agent');
        engineState.Agents = [target];
        const svc = new MetadataExposedService();

        expect(svc.CallResolveTarget('target-1')).toBe(target);
        expect(svc.CallResolveTarget('')).toBeNull();
        expect(svc.CallResolveTarget('nope')).toBeNull();
    });
});

// ════════════════════════════════════════════════════════════════════
// Narration template resolution
// ════════════════════════════════════════════════════════════════════

describe('resolveNarrationInstructionsTemplate (real metadata lookup)', () => {
    const TEMPLATE = 'Progress: "{{ progressMessage }}" — one first-person sentence.';

    it('returns the Active narration prompt template text', () => {
        engineState.Prompts = [
            { ID: 'p1', Name: 'Realtime Co-Agent - Progress Narration', Status: 'Active', TemplateText: TEMPLATE },
        ];
        const svc = new MetadataExposedService();
        expect(svc.CallNarration()).toBe(TEMPLATE);
    });

    it('matches the prompt name case/whitespace-insensitively', () => {
        engineState.Prompts = [
            { ID: 'p1', Name: '  REALTIME co-agent - progress NARRATION  ', Status: 'Active', TemplateText: TEMPLATE },
        ];
        const svc = new MetadataExposedService();
        expect(svc.CallNarration()).toBe(TEMPLATE);
    });

    it('ignores an inactive narration prompt', () => {
        engineState.Prompts = [
            { ID: 'p1', Name: 'Realtime Co-Agent - Progress Narration', Status: 'Disabled', TemplateText: TEMPLATE },
        ];
        const svc = new MetadataExposedService();
        expect(svc.CallNarration()).toBeNull();
    });

    it('returns null when the prompt exists but its template text is empty/whitespace', () => {
        engineState.Prompts = [
            { ID: 'p1', Name: 'Realtime Co-Agent - Progress Narration', Status: 'Active', TemplateText: '   ' },
        ];
        const svc = new MetadataExposedService();
        expect(svc.CallNarration()).toBeNull();
    });

    it('returns null when the prompt is absent', () => {
        engineState.Prompts = [{ ID: 'p2', Name: 'Some Other Prompt', Status: 'Active', TemplateText: 'x' }];
        const svc = new MetadataExposedService();
        expect(svc.CallNarration()).toBeNull();
    });

    it('falls back to the DEPRECATED legacy prompt name when the current name is absent (un-resynced deployment)', () => {
        engineState.Prompts = [
            { ID: 'p-legacy', Name: 'Voice Co-Agent - Progress Narration', Status: 'Active', TemplateText: TEMPLATE },
        ];
        const svc = new MetadataExposedService();
        expect(svc.CallNarration()).toBe(TEMPLATE);
    });

    it('prefers the CURRENT prompt name over the legacy one when BOTH exist', () => {
        engineState.Prompts = [
            { ID: 'p-legacy', Name: 'Voice Co-Agent - Progress Narration', Status: 'Active', TemplateText: 'LEGACY TEXT' },
            { ID: 'p-current', Name: 'Realtime Co-Agent - Progress Narration', Status: 'Active', TemplateText: TEMPLATE },
        ];
        const svc = new MetadataExposedService();
        expect(svc.CallNarration()).toBe(TEMPLATE);
    });

    it('ignores an INACTIVE legacy prompt during the fallback', () => {
        engineState.Prompts = [
            { ID: 'p-legacy', Name: 'Voice Co-Agent - Progress Narration', Status: 'Disabled', TemplateText: TEMPLATE },
        ];
        const svc = new MetadataExposedService();
        expect(svc.CallNarration()).toBeNull();
    });

    it('tolerates an unconfigured engine (getter throws) by returning null', () => {
        engineState.throwOnAccess = true;
        const svc = new MetadataExposedService();
        expect(svc.CallNarration()).toBeNull();
    });
});

// ════════════════════════════════════════════════════════════════════
// Co-agent system prompt resolution
// ════════════════════════════════════════════════════════════════════

describe('resolveCoAgentSystemPrompt (real metadata lookup)', () => {
    const coAgent = agent('co-1', 'Realtime Co-Agent');

    it('picks the lowest-ExecutionOrder ACTIVE agent prompt and returns its template + id', () => {
        engineState.AgentPrompts = [
            { ID: 'ap-2', AgentID: 'co-1', PromptID: 'p-2', Status: 'Active', ExecutionOrder: 2 },
            { ID: 'ap-1', AgentID: 'co-1', PromptID: 'p-1', Status: 'Active', ExecutionOrder: 1 },
            { ID: 'ap-0', AgentID: 'co-1', PromptID: 'p-0', Status: 'Inactive', ExecutionOrder: 0 }, // inactive — skipped
            { ID: 'ap-x', AgentID: 'other', PromptID: 'p-x', Status: 'Active', ExecutionOrder: 0 },  // other agent — skipped
        ];
        engineState.Prompts = [
            { ID: 'p-1', Name: 'Primary', Status: 'Active', TemplateText: 'PRIMARY PROMPT BODY' },
            { ID: 'p-2', Name: 'Secondary', Status: 'Active', TemplateText: 'SECONDARY' },
        ];
        const svc = new MetadataExposedService();

        expect(svc.CallCoAgentPrompt(coAgent)).toEqual({ Text: 'PRIMARY PROMPT BODY', PromptID: 'p-1' });
    });

    it('returns empty text + null id when the co-agent has no active agent prompt', () => {
        engineState.AgentPrompts = [
            { ID: 'ap-0', AgentID: 'co-1', PromptID: 'p-0', Status: 'Inactive', ExecutionOrder: 0 },
        ];
        const svc = new MetadataExposedService();
        expect(svc.CallCoAgentPrompt(coAgent)).toEqual({ Text: '', PromptID: null });
    });

    it('tolerates a dangling PromptID (agent prompt points at a missing prompt row)', () => {
        engineState.AgentPrompts = [
            { ID: 'ap-1', AgentID: 'co-1', PromptID: 'p-deleted', Status: 'Active', ExecutionOrder: 1 },
        ];
        engineState.Prompts = [];
        const svc = new MetadataExposedService();
        expect(svc.CallCoAgentPrompt(coAgent)).toEqual({ Text: '', PromptID: null });
    });
});

// ════════════════════════════════════════════════════════════════════
// Default realtime model selection + vendor selection
// ════════════════════════════════════════════════════════════════════

function model(id: string, name: string, powerRank: number | null, active = true, type = 'Realtime'): unknown {
    return { ID: id, Name: name, PowerRank: powerRank, IsActive: active, AIModelType: type };
}

function vendor(modelID: string, driverClass: string | null, priority: number | null, status = 'Active', vendorID = `v-${driverClass}`, apiName = `api-${driverClass}`): unknown {
    return { ModelID: modelID, DriverClass: driverClass, Priority: priority, Status: status, VendorID: vendorID, APIName: apiName };
}

describe('selectRealtimeVendor (real metadata lookup)', () => {
    it('prefers the highest-Priority active vendor whose driver has an API key', () => {
        engineState.ModelVendors = [
            vendor('m1', 'LowPriorityDriver', 1),
            vendor('m1', 'HighPriorityDriver', 9),
        ];
        const svc = new MetadataExposedService();
        svc.Keys = { LowPriorityDriver: 'key-low', HighPriorityDriver: 'key-high' };

        const v = svc.CallSelectVendor('m1');
        expect(v).toEqual({ VendorID: 'v-HighPriorityDriver', DriverClass: 'HighPriorityDriver', APIName: 'api-HighPriorityDriver' });
    });

    it('falls past a keyless higher-priority vendor to the next one with a key', () => {
        engineState.ModelVendors = [
            vendor('m1', 'NoKeyDriver', 9),
            vendor('m1', 'KeyedDriver', 1),
        ];
        const svc = new MetadataExposedService();
        svc.Keys = { KeyedDriver: 'key-1' };

        expect(svc.CallSelectVendor('m1')?.DriverClass).toBe('KeyedDriver');
    });

    it('skips inactive vendors, null DriverClass rows, and other models’ vendors', () => {
        engineState.ModelVendors = [
            vendor('m1', 'InactiveDriver', 9, 'Inactive'),
            vendor('m1', null, 8),
            vendor('m2', 'OtherModelDriver', 7),
            vendor('m1', 'UsableDriver', 1),
        ];
        const svc = new MetadataExposedService();
        svc.Keys = { InactiveDriver: 'k', OtherModelDriver: 'k', UsableDriver: 'k' };

        expect(svc.CallSelectVendor('m1')?.DriverClass).toBe('UsableDriver');
    });

    it('returns null when no vendor has a usable key', () => {
        engineState.ModelVendors = [vendor('m1', 'NoKeyDriver', 1)];
        const svc = new MetadataExposedService();
        svc.Keys = {};
        expect(svc.CallSelectVendor('m1')).toBeNull();
    });
});

describe('resolveRealtimeModel — default (highest-PowerRank) selection', () => {
    const coAgent = agent('co-1', 'Realtime Co-Agent');

    it('selects the highest-PowerRank ACTIVE Realtime model and resolves its vendor', async () => {
        engineState.Models = [
            model('m-low', 'Realtime Low', 10),
            model('m-high', 'Realtime High', 90),
            model('m-llm', 'Big LLM', 999, true, 'LLM'),          // wrong type — excluded
            model('m-off', 'Realtime Off', 999, false),           // inactive — excluded
        ];
        engineState.ModelVendors = [vendor('m-high', 'TopDriver', 1)];
        const svc = new MetadataExposedService();
        svc.Keys = { TopDriver: 'key-top' };

        const resolution = await svc.CallResolveModel(coAgent);

        expect(resolution).not.toBeNull();
        expect(resolution!.ModelID).toBe('m-high');
        expect(resolution!.ModelName).toBe('Realtime High');
        expect(resolution!.VendorID).toBe('v-TopDriver');
        expect(resolution!.APIName).toBe('api-TopDriver');
        expect(svc.CreatedDrivers).toEqual(['TopDriver']);
    });

    it('matches the Realtime type case/whitespace-insensitively', async () => {
        engineState.Models = [model('m1', 'RT', 1, true, '  realtime ')];
        engineState.ModelVendors = [vendor('m1', 'D', 1)];
        const svc = new MetadataExposedService();
        svc.Keys = { D: 'k' };

        expect((await svc.CallResolveModel(coAgent))?.ModelID).toBe('m1');
    });

    it('treats a null PowerRank as 0 when ordering', async () => {
        engineState.Models = [
            model('m-null', 'Realtime Null', null),
            model('m-one', 'Realtime One', 1),
        ];
        engineState.ModelVendors = [vendor('m-one', 'D1', 1)];
        const svc = new MetadataExposedService();
        svc.Keys = { D1: 'k' };

        expect((await svc.CallResolveModel(coAgent))?.ModelID).toBe('m-one');
    });

    it('returns null when no active Realtime model exists', async () => {
        engineState.Models = [model('m-llm', 'Big LLM', 999, true, 'LLM')];
        const svc = new MetadataExposedService();
        expect(await svc.CallResolveModel(coAgent)).toBeNull();
    });

    it('returns null when the chosen model has no vendor with a usable key', async () => {
        engineState.Models = [model('m1', 'RT', 1)];
        engineState.ModelVendors = [vendor('m1', 'NoKey', 1)];
        const svc = new MetadataExposedService();
        svc.Keys = {};
        expect(await svc.CallResolveModel(coAgent)).toBeNull();
    });

    it('falls through to a usable lower-power model when the top model has no key', async () => {
        // The bug this guards: a newly-seeded high-power provider (e.g. Grok/Inworld) with no env
        // key must NOT dead-end resolution — it falls through to the keyed lower-power model.
        engineState.Models = [
            model('m-top', 'Realtime Top', 90),
            model('m-keyed', 'Realtime Keyed', 10),
        ];
        engineState.ModelVendors = [vendor('m-top', 'NoKeyDriver', 1), vendor('m-keyed', 'KeyedDriver', 1)];
        const svc = new MetadataExposedService();
        svc.Keys = { KeyedDriver: 'k' };   // only the lower-power model has a key

        expect((await svc.CallResolveModel(coAgent))?.ModelID).toBe('m-keyed');
    });

    it('falls through past a model whose driver does not support client-direct', async () => {
        // A keyed top model whose driver cannot do client-direct sessions must not be chosen for a
        // client-direct co-agent — resolution skips it to the next client-direct-capable model.
        engineState.Models = [
            model('m-top', 'Realtime Top', 90),
            model('m-cd', 'Realtime ClientDirect', 10),
        ];
        engineState.ModelVendors = [vendor('m-top', 'NoCDDriver', 1), vendor('m-cd', 'CDDriver', 1)];
        const svc = new MetadataExposedService();
        svc.Keys = { NoCDDriver: 'k', CDDriver: 'k' };
        svc.NonClientDirectDrivers.add('NoCDDriver');   // top model resolves but isn't client-direct

        expect((await svc.CallResolveModel(coAgent))?.ModelID).toBe('m-cd');
    });

    it('findModelByID resolves from the cache and returns null when absent', () => {
        const m = model('m1', 'RT', 1) as MJAIModelEntityExtended;
        engineState.Models = [m];
        const svc = new MetadataExposedService();
        expect(svc.CallFindModelByID('m1')).toBe(m);
        expect(svc.CallFindModelByID('missing')).toBeNull();
    });
});

// ════════════════════════════════════════════════════════════════════
// The default walk for a co-agent with video on (audit M-10)
// ════════════════════════════════════════════════════════════════════

describe('resolveModelForSession — a co-agent with video on prefers a model that shows an avatar', () => {
    const VIDEO_ON: RealtimeCoAgentConfig = { realtime: { video: { enabled: true } } };
    const VIDEO_OFF: RealtimeCoAgentConfig = { realtime: { video: { enabled: false } } };

    /** Gemini 3.8 Live Extended Thinking (no Video/Output row, Developer only) outranks Gemini 3.8 Live (Developer and Vertex AI). */
    function geminiCatalog(liveVideoOutput: boolean | null = true): void {
        engineState.Models = [model('m-ext', 'Gemini 3.8 Live Extended Thinking', 18), model('m-live', 'Gemini 3.8 Live', 15)];
        engineState.ModelVendors = [
            vendor('m-ext', 'GeminiRealtime', 0, 'Active', 'v-google', 'gemini-3.8-live-extended-thinking'),
            vendor('m-live', 'GeminiRealtime', 0, 'Active', 'v-google', 'gemini-3.8-live'),
            vendor('m-live', 'GeminiEnterpriseRealtime', 1, 'Active', 'v-vertex', 'gemini-3.8-live'),
        ];
        engineState.ModelModalities = liveVideoOutput === null ? [] : [videoOutput('m-live', liveVideoOutput)];
    }

    function videoOutput(modelID: string, isSupported: boolean): unknown {
        return { ModelID: modelID, ModalityID: 'modality-video', Direction: 'Output', IsSupported: isSupported };
    }

    /** A service with both Gemini keys, whose Vertex AI endpoint renders avatars. */
    function bothKeys(): MetadataExposedService {
        const svc = new MetadataExposedService();
        svc.Keys = { GeminiRealtime: 'k-dev', GeminiEnterpriseRealtime: 'k-vertex' };
        svc.AvatarDrivers.add('GeminiEnterpriseRealtime');
        return svc;
    }

    let log: ReturnType<typeof vi.spyOn>;
    beforeEach(() => { log = vi.spyOn(console, 'log').mockImplementation(() => undefined); });
    afterEach(() => log.mockRestore());
    const fallbackLines = (): string[] => log.mock.calls.map((c) => String(c[0])).filter((l) => l.includes('Video is on, but no realtime model'));

    it('takes the model that shows an avatar over a higher-PowerRank one that shows none; with video off, the higher one', async () => {
        geminiCatalog();
        const on = await bothKeys().CallResolveModelForSession({}, VIDEO_ON);
        expect(on.Resolution?.ModelID).toBe('m-live');
        expect(on.Resolution?.DriverClass).toBe('GeminiEnterpriseRealtime');
        expect(on.Resolution?.VendorID).toBe('v-vertex');
        expect(fallbackLines()).toEqual([]);

        const off = await bothKeys().CallResolveModelForSession({}, VIDEO_OFF);
        expect(off.Resolution?.ModelID).toBe('m-ext');
        const none = await bothKeys().CallResolveModelForSession({});
        expect(none.Resolution?.ModelID).toBe('m-ext');
    });

    it("with only the Developer key nothing shows an avatar: the co-agent keeps today's model, audio only, with one log line", async () => {
        geminiCatalog();
        const svc = new MetadataExposedService();
        svc.Keys = { GeminiRealtime: 'k-dev' };
        svc.AvatarDrivers.add('GeminiEnterpriseRealtime');
        const result = await svc.CallResolveModelForSession({}, VIDEO_ON);
        expect(result.Resolution?.ModelID).toBe('m-ext');
        expect(result.Resolution?.DriverClass).toBe('GeminiRealtime');
        expect(fallbackLines()).toEqual([
            "[RealtimeCoAgent] Video is on, but no realtime model with a usable key shows an avatar (its Video/Output row and its endpoint): using 'Gemini 3.8 Live Extended Thinking' on GeminiRealtime, audio only.",
        ]);
    });

    it("tries every keyed vendor of a model: a higher-Priority vendor whose endpoint renders none is passed over", async () => {
        geminiCatalog();
        engineState.ModelVendors = [
            vendor('m-live', 'GeminiRealtime', 5, 'Active', 'v-google', 'gemini-3.8-live'),
            vendor('m-live', 'GeminiEnterpriseRealtime', 1, 'Active', 'v-vertex', 'gemini-3.8-live'),
        ];
        engineState.Models = [model('m-live', 'Gemini 3.8 Live', 15)];
        const svc = bothKeys();
        const on = await svc.CallResolveModelForSession({}, VIDEO_ON);
        expect(on.Resolution?.DriverClass).toBe('GeminiEnterpriseRealtime');
        expect(svc.AvatarAsked).toEqual(['GeminiRealtime:gemini-3.8-live', 'GeminiEnterpriseRealtime:gemini-3.8-live']);
        expect((await bothKeys().CallResolveModelForSession({}, VIDEO_OFF)).Resolution?.DriverClass).toBe('GeminiRealtime');
    });

    it('passes over a model whose Video/Output row turns video off, though its driver renders avatars, without creating its drivers', async () => {
        geminiCatalog(false);
        const svc = bothKeys();
        const result = await svc.CallResolveModelForSession({}, VIDEO_ON);
        expect(result.Resolution?.ModelID).toBe('m-ext');
        expect(svc.AvatarAsked.filter((q) => q.endsWith(':gemini-3.8-live'))).toEqual([]);
        expect(svc.CreatedDrivers).not.toContain('GeminiEnterpriseRealtime');
        expect(fallbackLines()).toHaveLength(1);
    });

    it("leaves a model without a Video/Output row to its endpoint: one that renders avatars counts", async () => {
        geminiCatalog(null);
        const result = await bothKeys().CallResolveModelForSession({}, VIDEO_ON);
        expect(result.Resolution?.ModelID).toBe('m-live');
        expect(result.Resolution?.DriverClass).toBe('GeminiEnterpriseRealtime');
    });

    it('keeps the walk order among models that show an avatar: the higher PowerRank first', async () => {
        engineState.Models = [model('m-low', 'Avatar Low', 12), model('m-high', 'Avatar High', 15)];
        engineState.ModelVendors = [vendor('m-low', 'AvatarDriverLow', 1), vendor('m-high', 'AvatarDriverHigh', 1)];
        engineState.ModelModalities = [videoOutput('m-low', true), videoOutput('m-high', true)];
        const svc = new MetadataExposedService();
        svc.Keys = { AvatarDriverLow: 'k', AvatarDriverHigh: 'k' };
        svc.AvatarDrivers.add('AvatarDriverLow');
        svc.AvatarDrivers.add('AvatarDriverHigh');
        expect((await svc.CallResolveModelForSession({}, VIDEO_ON)).Resolution?.ModelID).toBe('m-high');
    });

    it('passes over a candidate that shows an avatar but cannot do client-direct sessions', async () => {
        geminiCatalog();
        const svc = bothKeys();
        svc.NonClientDirectDrivers.add('GeminiEnterpriseRealtime');
        const result = await svc.CallResolveModelForSession({}, VIDEO_ON);
        expect(result.Resolution?.ModelID).toBe('m-ext');
        expect(fallbackLines()).toHaveLength(1);
    });

    it("uses the session's key chain: under RuntimeOnly, a vendor keyed only by the platform is not taken", async () => {
        geminiCatalog();
        const svc = bothKeys();
        const result = await svc.CallResolveModelForSession(
            { APIKeys: [{ driverClass: 'GeminiRealtime', apiKey: 'run-key' }], CredentialScope: 'RuntimeOnly' }, VIDEO_ON);
        expect(result.Resolution?.ModelID).toBe('m-ext');
        expect(result.Resolution?.DriverClass).toBe('GeminiRealtime');
    });

    it('lets explicit choices win: the runtime pick and the configured modelPreference are not swapped for a model with an avatar', async () => {
        geminiCatalog();
        const picked = await bothKeys().CallResolveModelForSession({ PreferredModelID: 'm-ext' }, VIDEO_ON);
        expect(picked.Resolution?.ModelID).toBe('m-ext');
        const configured = await bothKeys().CallResolveModelForSession({}, { realtime: { video: { enabled: true }, modelPreference: 'Gemini 3.8 Live Extended Thinking' } });
        expect(configured.Resolution?.ModelID).toBe('m-ext');
        expect(fallbackLines()).toEqual([]);
    });

    it("skips the preference, with no log line, for a server-side session that can't show an avatar (a phone call, a meeting without room delivery)", async () => {
        geminiCatalog();
        const svc = bothKeys();
        const phone = await svc.CallResolveModelForSession({ ServerSide: true }, VIDEO_ON);
        expect(phone.Resolution?.ModelID).toBe('m-ext');
        expect(svc.AvatarAsked).toEqual([]);
        expect(fallbackLines()).toEqual([]);
    });

    it('keeps the preference for a server-side session whose host publishes the avatar into a room, and for a browser session', async () => {
        geminiCatalog();
        const meeting = await bothKeys().CallResolveModelForSession({ ServerSide: true, AvatarDelivery: 'room' }, VIDEO_ON);
        expect(meeting.Resolution?.ModelID).toBe('m-live');
        expect(meeting.Resolution?.DriverClass).toBe('GeminiEnterpriseRealtime');
        const browser = await bothKeys().CallResolveModelForSession({ ServerSide: false }, VIDEO_ON);
        expect(browser.Resolution?.DriverClass).toBe('GeminiEnterpriseRealtime');
    });

    it('skips the preference for a phone call even in a room that publishes avatars (a SIP call)', async () => {
        geminiCatalog();
        const svc = bothKeys();
        const sip = await svc.CallResolveModelForSession({ ServerSide: true, PhoneCall: true, AvatarDelivery: 'room' }, VIDEO_ON);
        expect(sip.Resolution?.ModelID).toBe('m-ext');
        expect(svc.AvatarAsked).toEqual([]);
        expect(fallbackLines()).toEqual([]);
    });

    it("skips the preference for a browser app that shows no agent video (the widget, the mobile app), and keeps it when it may", async () => {
        geminiCatalog();
        const svc = bothKeys();
        const widget = await svc.CallResolveModelForSession({ ShowsAgentVideo: false }, VIDEO_ON);
        expect(widget.Resolution?.ModelID).toBe('m-ext');
        expect(svc.AvatarAsked).toEqual([]);
        expect(fallbackLines()).toEqual([]);
        const explorer = await bothKeys().CallResolveModelForSession({ ShowsAgentVideo: true }, VIDEO_ON);
        expect(explorer.Resolution?.DriverClass).toBe('GeminiEnterpriseRealtime');
    });
});
