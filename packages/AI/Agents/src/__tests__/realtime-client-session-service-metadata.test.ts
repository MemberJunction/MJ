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
 *
 * `@memberjunction/aiengine` is module-mocked with a controllable in-memory metadata cache; no DB,
 * no network. AgentRunner is mocked so importing the service stays light.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
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
    throwOnAccess: false,
};

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
} from '../realtime/realtime-client-session-service';

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
    protected override createModelInstance(driverClass: string): BaseRealtimeModel | null {
        this.CreatedDrivers.push(driverClass);
        return {
            Driver: driverClass,
            SupportsClientDirect: !this.NonClientDirectDrivers.has(driverClass),
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
