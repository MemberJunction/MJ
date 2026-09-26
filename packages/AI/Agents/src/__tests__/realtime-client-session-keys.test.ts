import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * A voice session started inside an agent run mints on the RUN'S API key.
 *
 * Prompts have always resolved against `ExecuteAgentParams.apiKeys`; realtime resolved against the
 * environment alone, so a run on a customer's credential still opened its voice session — the most
 * expensive call in the product — on the platform's. `PrepareClientSessionInput.APIKeys` closes
 * that, and these cases pin the two things that must hold: the key that actually mints the session
 * is the run's, and a service that has no run keys behaves exactly as it did before.
 *
 * The vendor selector is mocked to capture the resolver handed to it — that resolver IS the
 * contract, and asserting on it is what proves the threading rather than the environment.
 */
const captured: { resolvers: Array<(driverClass: string) => string | undefined> } = { resolvers: [] };

vi.mock('../realtime/realtime-vendor-resolution', () => ({
    SelectRealtimeVendorForModel: (modelID: string, resolve?: (driverClass: string) => string | undefined) => {
        if (resolve) captured.resolvers.push(resolve);
        // Resolves only when the caller's resolver can key this driver — the real selector's rule.
        return resolve?.('VoiceDriver') ? { VendorID: 'v1', ModelVendorID: 'mv1', DriverClass: 'VoiceDriver', APIName: 'voice-api' } : null;
    },
}));

import { RealtimeClientSessionService } from '../realtime/realtime-client-session-service';
import type { MJAIModelEntityExtended, MJAIAgentEntityExtended } from '@memberjunction/core-entities';
import type { PrepareClientSessionInput } from '../realtime/realtime-client-session-service';
import type { BaseRealtimeModel } from '@memberjunction/ai';

/** Exposes the protected resolution tail and records the key the session would be minted with. */
class KeyProbeService extends RealtimeClientSessionService {
    public MintedWith: string | null = null;
    /** The platform seam — what the service resolved before runtime keys existed. */
    protected override getAPIKeyForDriver(driverClass: string): string | undefined {
        return driverClass === 'VoiceDriver' ? 'platform-key' : undefined;
    }
    protected override createModelInstance(_driverClass: string, apiKey: string): BaseRealtimeModel | null {
        this.MintedWith = apiKey;
        return { SupportsClientDirect: true } as unknown as BaseRealtimeModel;
    }
    public Resolve(resolve?: (driverClass: string) => string | undefined) {
        return this.resolveVendorAndInstantiate({ ID: 'm1' } as unknown as MJAIModelEntityExtended, resolve);
    }

    /** The resolver the model-selection funnel built from the session input, captured at the first branch. */
    public PassedResolver: ((driverClass: string) => string | undefined) | undefined;
    protected override resolvePreferredRealtimeModel(_modelID: string, resolve?: (driverClass: string) => string | undefined) {
        this.PassedResolver = resolve;
        return { ErrorMessage: 'stubbed — the resolver is what this probe is after' };
    }
    public async ResolveForSession(input: PrepareClientSessionInput) {
        return this.resolveModelForSession(input, {} as unknown as MJAIAgentEntityExtended);
    }
}

describe('realtime sessions mint on the run\'s API key', () => {
    beforeEach(() => { captured.resolvers = []; });

    it('mints with the RUN\'S key when the session carries one', () => {
        const svc = new KeyProbeService();
        const result = svc.Resolve((driverClass) => (driverClass === 'VoiceDriver' ? 'sk-customer' : undefined));
        expect(result).not.toBeNull();
        expect(svc.MintedWith).toBe('sk-customer');
    });

    it('falls back to the platform key per driver class — a run keyed for something else is unchanged', () => {
        const svc = new KeyProbeService();
        const result = svc.Resolve((driverClass) => (driverClass === 'SomeOtherDriver' ? 'sk-customer-llm' : undefined));
        expect(result).not.toBeNull();
        expect(svc.MintedWith).toBe('platform-key');   // not the other class's key, and not nothing
    });

    it('behaves exactly as before with no run keys at all', () => {
        const svc = new KeyProbeService();
        expect(svc.Resolve()).not.toBeNull();
        expect(svc.MintedWith).toBe('platform-key');
    });

    it('hands the SAME resolver to vendor selection that mints the session — selection cannot disagree with billing', () => {
        // Vendor selection picks the first vendor whose key resolves, so if selection saw different
        // credentials than the mint, a session could be routed to a vendor it cannot then pay for.
        const svc = new KeyProbeService();
        svc.Resolve((driverClass) => (driverClass === 'VoiceDriver' ? 'sk-customer' : undefined));
        expect(captured.resolvers).toHaveLength(1);
        expect(captured.resolvers[0]('VoiceDriver')).toBe('sk-customer');
    });

    it('resolves nothing when neither the run nor the platform can key the vendor', () => {
        class Keyless extends KeyProbeService {
            protected override getAPIKeyForDriver(): string | undefined { return undefined; }
        }
        const svc = new Keyless();
        expect(svc.Resolve(() => undefined)).toBeNull();
        expect(svc.MintedWith).toBeNull();
    });
});

describe('PrepareClientSessionInput.APIKeys reaches model selection', () => {
    /**
     * The hop between the session input and the resolution tail. Without this, the tail could honour
     * run keys perfectly while the funnel never hands it any — which is exactly what a mutation of
     * the funnel showed: every tail case still passed.
     */
    it('builds the funnel\'s resolver from the session\'s keys', async () => {
        const svc = new KeyProbeService();
        await svc.ResolveForSession({
            CoAgent: {} as unknown as MJAIAgentEntityExtended,
            TargetAgentID: 't1',
            AgentSessionID: 's1',
            PreferredModelID: 'm1',
            APIKeys: [{ driverClass: 'VoiceDriver', apiKey: 'sk-customer' }],
        });
        expect(svc.PassedResolver).toBeTypeOf('function');
        expect(svc.PassedResolver!('VoiceDriver')).toBe('sk-customer');
    });

    it('still builds one with no keys on the input — the platform lookup, so no branch special-cases it', async () => {
        const svc = new KeyProbeService();
        await svc.ResolveForSession({
            CoAgent: {} as unknown as MJAIAgentEntityExtended,
            TargetAgentID: 't1',
            AgentSessionID: 's1',
            PreferredModelID: 'm1',
        });
        expect(svc.PassedResolver).toBeTypeOf('function');
        expect(svc.PassedResolver!('VoiceDriver')).toBeUndefined();  // no run key, no env key in this process
    });
});
