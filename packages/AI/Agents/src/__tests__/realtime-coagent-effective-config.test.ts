/**
 * Unit tests for the EFFECTIVE-CONFIGURATION wiring in {@link RealtimeClientSessionService}:
 * how the resolved `type DefaultConfiguration ← agent TypeConfiguration ← runtime overrides`
 * merge drives the mint — model preference participation, the "Voice & manner" system-prompt
 * section, provider-matched voice settings in the session `Config` bag, and the surfaced
 * narration pace. Mirrors the seam-override pattern of `realtime-client-session-service.test.ts`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    BaseRealtimeModel,
    ClientRealtimeSessionConfig,
    IRealtimeSession,
    RealtimeSessionParams
} from '@memberjunction/ai';
import { UserInfo, IMetadataProvider } from '@memberjunction/core';
import { MJAIAgentEntityExtended, MJAIModelEntityExtended } from '@memberjunction/ai-core-plus';

import {
    RealtimeClientSessionService,
    PrepareClientSessionInput,
    RealtimeModelResolution,
    CoAgentSystemPromptResolution
} from '../realtime/realtime-client-session-service';
import { RealtimeCoAgentConfig } from '../realtime/realtime-coagent-config';

// Keep the import graph light — delegation is not under test here.
vi.mock('../AgentRunner', () => ({
    AgentRunner: class {
        RunAgent = vi.fn();
        ProcessAgentArtifacts = vi.fn();
    },
}));

class MockRealtimeSession implements IRealtimeSession {
    SendInput(): void { /* no-op */ }
    async RegisterTools(): Promise<void> { /* no-op */ }
    OnOutput(): void { /* no-op */ }
    OnTranscript(): void { /* no-op */ }
    OnToolCall(): void { /* no-op */ }
    async SendToolResult(): Promise<void> { /* no-op */ }
    OnInterruption(): void { /* no-op */ }
    OnUsage(): void { /* no-op */ }
    OnError(): void { /* no-op */ }
    async Close(): Promise<void> { /* no-op */ }
}

class MockRealtimeModel extends BaseRealtimeModel {
    public LastParams: RealtimeSessionParams | null = null;
    constructor() { super('mock-api-key'); }
    public override get SupportsClientDirect(): boolean { return true; }
    async StartSession(params: RealtimeSessionParams): Promise<IRealtimeSession> {
        this.LastParams = params;
        return new MockRealtimeSession();
    }
    public override async CreateClientSession(params: RealtimeSessionParams): Promise<ClientRealtimeSessionConfig> {
        this.LastParams = params;
        return {
            Provider: 'mock',
            Model: params.Model,
            EphemeralToken: 'ephemeral-123',
            ExpiresAt: '2099-01-01T00:00:00.000Z',
            SessionConfig: { instructions: params.SystemPrompt }
        };
    }
}

/** Test service: DB-backed seams stubbed; model catalog + type defaults are injectable. */
class TestableService extends RealtimeClientSessionService {
    public Model = new MockRealtimeModel();
    /** Default-resolution result (the no-preference fallback). */
    public DefaultResolution: RealtimeModelResolution | null = {
        Model: this.Model, ModelID: 'default-model', VendorID: 'v1', APIName: 'default-realtime', DriverClass: 'OpenAIRealtime'
    };
    /** The in-memory model catalog `findModelByIDOrName` consults. */
    public Models: MJAIModelEntityExtended[] = [];
    /** DriverClass → API key map for vendor resolution. */
    public Keys: Record<string, string> = { OpenAIRealtime: 'k1', ElevenLabsRealtime: 'k2' };
    /** ModelID → vendor row used by resolveVendorAndInstantiate via selectRealtimeVendor. */
    public Vendors: Record<string, { VendorID: string; DriverClass: string; APIName: string }> = {};
    /** The agent TYPE's DefaultConfiguration JSON returned by the seam. */
    public TypeDefaultConfiguration: string | null = null;

    protected override async configureEngine(): Promise<void> { /* no DB */ }
    protected override getCoAgentSystemPromptText(): string { return 'CO-AGENT PROMPT BODY'; }
    protected override resolveCoAgentSystemPrompt(): CoAgentSystemPromptResolution {
        return { Text: 'CO-AGENT PROMPT BODY', PromptID: null };
    }
    protected override async createCoAgentObservabilityRun(): Promise<null> { return null; }
    protected override resolveTargetAgent(targetAgentID: string): MJAIAgentEntityExtended | null {
        return { ID: targetAgentID, Name: 'Sales Agent', Description: 'Closes deals.' } as unknown as MJAIAgentEntityExtended;
    }
    protected override async resolveRealtimeModel(): Promise<RealtimeModelResolution | null> {
        return this.DefaultResolution;
    }
    protected override getAgentTypeDefaultConfiguration(): string | null {
        return this.TypeDefaultConfiguration;
    }
    protected override findModelByID(modelID: string): MJAIModelEntityExtended | null {
        return this.Models.find(m => m.ID?.trim().toLowerCase() === modelID.trim().toLowerCase()) ?? null;
    }
    protected override findModelByIDOrName(preference: string): MJAIModelEntityExtended | null {
        const wanted = preference.trim().toLowerCase();
        return this.Models.find(m => m.ID?.trim().toLowerCase() === wanted)
            ?? this.Models.find(m => m.Name?.trim().toLowerCase() === wanted)
            ?? null;
    }
    protected override selectRealtimeVendor(modelID: string): { VendorID: string; DriverClass: string; APIName: string } | null {
        return this.Vendors[modelID] ?? null;
    }
    protected override getAPIKeyForDriver(driverClass: string): string | undefined {
        return this.Keys[driverClass];
    }
    protected override createModelInstance(): BaseRealtimeModel | null {
        return this.Model;
    }
    protected override async assembleMemoryContext(): Promise<string> { return ''; }
}

function model(id: string, name: string, opts: Partial<{ IsActive: boolean; AIModelType: string }> = {}): MJAIModelEntityExtended {
    return { ID: id, Name: name, IsActive: opts.IsActive ?? true, AIModelType: opts.AIModelType ?? 'Realtime' } as unknown as MJAIModelEntityExtended;
}

function coAgent(typeConfiguration?: string | null): MJAIAgentEntityExtended {
    return {
        ID: 'co-1', Name: 'Realtime Co-Agent', TypeID: 'type-realtime',
        TypeConfiguration: typeConfiguration ?? null
    } as unknown as MJAIAgentEntityExtended;
}

function makeInput(agent: MJAIAgentEntityExtended, extra: Partial<PrepareClientSessionInput> = {}): PrepareClientSessionInput {
    return { CoAgent: agent, TargetAgentID: 'target-1', AgentSessionID: 'session-1', ...extra };
}

const USER = { ID: 'user-1' } as unknown as UserInfo;
const PROVIDER = {} as unknown as IMetadataProvider;

let service: TestableService;

beforeEach(() => {
    service = new TestableService();
});

describe('PrepareClientSession — effective config resolution + surfacing', () => {
    it('surfaces the effective config and narration pace on the prep result', async () => {
        const agent = coAgent(JSON.stringify({ realtime: { narration: { paceMs: 5500 }, voice: { default: { tone: 'warm' } } } }));
        const result = await service.PrepareClientSession(makeInput(agent), USER, PROVIDER);

        expect(result.Success).toBe(true);
        expect(result.NarrationPaceMs).toBe(5500);
        expect(result.EffectiveConfig?.realtime?.voice?.default?.tone).toBe('warm');
    });

    it('deep-merges the TYPE DefaultConfiguration under the agent TypeConfiguration', async () => {
        service.TypeDefaultConfiguration = JSON.stringify({
            realtime: { narration: { paceMs: 9000 }, voice: { default: { tone: 'neutral', speakingStyle: 'measured' } } }
        });
        const agent = coAgent(JSON.stringify({ realtime: { voice: { default: { tone: 'playful' } } } }));

        const result = await service.PrepareClientSession(makeInput(agent), USER, PROVIDER);

        expect(result.NarrationPaceMs).toBe(9000); // type default survives
        expect(result.EffectiveConfig?.realtime?.voice?.default).toEqual({ tone: 'playful', speakingStyle: 'measured' });
    });

    it('applies the (pre-authorized) runtime override layer LAST', async () => {
        const agent = coAgent(JSON.stringify({ realtime: { narration: { paceMs: 5000 } } }));
        const result = await service.PrepareClientSession(
            makeInput(agent, { ConfigOverridesJson: JSON.stringify({ realtime: { narration: { paceMs: 2500 } } }) }),
            USER, PROVIDER,
        );
        expect(result.NarrationPaceMs).toBe(2500);
    });

    it('omits NarrationPaceMs and returns an empty effective config when nothing is configured', async () => {
        const result = await service.PrepareClientSession(makeInput(coAgent()), USER, PROVIDER);
        expect(result.Success).toBe(true);
        expect(result.NarrationPaceMs).toBeUndefined();
        expect(result.EffectiveConfig).toEqual({});
    });
});

describe('PrepareClientSession — Voice & manner in the companion system prompt', () => {
    it('appends the persona section after the co-agent prompt body', async () => {
        const agent = coAgent(JSON.stringify({
            realtime: { voice: { default: { tone: 'warm and upbeat', speakingStyle: 'short sentences' } } }
        }));
        const result = await service.PrepareClientSession(makeInput(agent), USER, PROVIDER);

        const prompt = result.SessionParams!.SystemPrompt;
        expect(prompt).toContain('Voice & manner:\nTone: warm and upbeat\nSpeaking style: short sentences');
        expect(prompt.indexOf('CO-AGENT PROMPT BODY')).toBeLessThan(prompt.indexOf('Voice & manner:'));
    });

    it('omits the section entirely when no persona is configured', async () => {
        const result = await service.PrepareClientSession(makeInput(coAgent()), USER, PROVIDER);
        expect(result.SessionParams!.SystemPrompt).not.toContain('Voice & manner');
    });
});

describe('PrepareClientSession — provider voice settings in the session Config bag', () => {
    const VOICE_CONFIG = JSON.stringify({
        realtime: { voice: { providers: { openai: { voice: 'alloy' }, elevenlabs: { voiceId: 'el-1' } } } }
    });

    it('merges the DriverClass-matched provider settings into the Config bag', async () => {
        const result = await service.PrepareClientSession(makeInput(coAgent(VOICE_CONFIG)), USER, PROVIDER);
        expect(result.SessionParams!.Config).toEqual({ voice: 'alloy' }); // default driver is OpenAIRealtime
    });

    it('lets a caller-supplied runtime Config win per key over provider settings', async () => {
        const result = await service.PrepareClientSession(
            makeInput(coAgent(VOICE_CONFIG), { Config: { voice: 'verse', language: 'de' } }),
            USER, PROVIDER,
        );
        expect(result.SessionParams!.Config).toEqual({ voice: 'verse', language: 'de' });
    });

    it('leaves the Config bag untouched (undefined) when no provider settings match', async () => {
        service.DefaultResolution = {
            Model: service.Model, ModelID: 'm1', VendorID: 'v1', APIName: 'x', DriverClass: 'AcmeRealtime'
        };
        const result = await service.PrepareClientSession(makeInput(coAgent(VOICE_CONFIG)), USER, PROVIDER);
        expect(result.SessionParams!.Config).toBeUndefined();
    });

    it('passes the runtime Config through verbatim when the resolution has no DriverClass (test seams)', async () => {
        service.DefaultResolution = { Model: service.Model, ModelID: 'm1', VendorID: 'v1', APIName: 'x' };
        const result = await service.PrepareClientSession(
            makeInput(coAgent(VOICE_CONFIG), { Config: { language: 'fr' } }),
            USER, PROVIDER,
        );
        expect(result.SessionParams!.Config).toEqual({ language: 'fr' });
    });
});

describe('PrepareClientSession — modelPreference participation in model selection', () => {
    it('resolves a model preference BY NAME ahead of the default resolution', async () => {
        service.Models = [model('m-pref', 'GPT Realtime Mini')];
        service.Vendors['m-pref'] = { VendorID: 'v9', DriverClass: 'OpenAIRealtime', APIName: 'gpt-realtime-mini' };
        const agent = coAgent(JSON.stringify({ realtime: { modelPreference: 'gpt realtime mini' } }));

        const result = await service.PrepareClientSession(makeInput(agent), USER, PROVIDER);

        expect(result.Success).toBe(true);
        expect(result.ModelID).toBe('m-pref');
        expect(result.SessionParams!.Model).toBe('gpt-realtime-mini');
    });

    it('resolves a model preference BY ID', async () => {
        service.Models = [model('m-id-1', 'Some Model')];
        service.Vendors['m-id-1'] = { VendorID: 'v9', DriverClass: 'OpenAIRealtime', APIName: 'some-model' };
        const agent = coAgent(JSON.stringify({ realtime: { modelPreference: 'M-ID-1' } }));

        const result = await service.PrepareClientSession(makeInput(agent), USER, PROVIDER);
        expect(result.ModelID).toBe('m-id-1');
    });

    it('falls through to the default when the preference matches no model (metadata degrades gracefully)', async () => {
        const agent = coAgent(JSON.stringify({ realtime: { modelPreference: 'Nonexistent Model' } }));
        const result = await service.PrepareClientSession(makeInput(agent), USER, PROVIDER);
        expect(result.Success).toBe(true);
        expect(result.ModelID).toBe('default-model');
    });

    it('falls through when the preferred model is inactive or not Realtime-typed', async () => {
        service.Models = [
            model('m-off', 'Dormant', { IsActive: false }),
            model('m-llm', 'Chat Model', { AIModelType: 'LLM' })
        ];
        for (const pref of ['Dormant', 'Chat Model']) {
            const agent = coAgent(JSON.stringify({ realtime: { modelPreference: pref } }));
            const result = await service.PrepareClientSession(makeInput(agent), USER, PROVIDER);
            expect(result.ModelID).toBe('default-model');
        }
    });

    it('falls through when the preferred model has no usable vendor/key', async () => {
        service.Models = [model('m-nokey', 'Keyless Model')];
        // No vendor row registered for m-nokey.
        const agent = coAgent(JSON.stringify({ realtime: { modelPreference: 'Keyless Model' } }));
        const result = await service.PrepareClientSession(makeInput(agent), USER, PROVIDER);
        expect(result.ModelID).toBe('default-model');
    });

    it('lets an EXPLICIT runtime PreferredModelID beat the configured preference (strict, no fallback)', async () => {
        service.Models = [model('m-pref', 'Configured Model')];
        service.Vendors['m-pref'] = { VendorID: 'v9', DriverClass: 'OpenAIRealtime', APIName: 'configured' };
        const agent = coAgent(JSON.stringify({ realtime: { modelPreference: 'Configured Model' } }));

        // The explicit choice points at a model that does not exist → strict failure, NOT a
        // fallback to the configured preference or the default.
        const result = await service.PrepareClientSession(
            makeInput(agent, { PreferredModelID: 'missing-model' }),
            USER, PROVIDER,
        );
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('missing-model');
    });
});
