import { describe, it, expect } from 'vitest';
import { MJScopedPromptConfigEntity } from '@memberjunction/core-entities';
import {
    ScopedPromptConfigResolver,
    ApplyScopedPromptConfig,
    type ScopedPromptConfigTarget,
} from '../scoped-prompt-config-resolver';
import { PromptComponentScope } from '../prompt-component-resolver';

/** Builds a ScopedPromptConfig-shaped fixture (only the fields the resolver/apply read). */
function cfg(over: Partial<Record<string, unknown>>): MJScopedPromptConfigEntity {
    return {
        PromptID: 'P1',
        Status: 'Active',
        Priority: 0,
        PrimaryScopeEntityID: null,
        PrimaryScopeRecordID: null,
        SecondaryScopes: null,
        ModelID: null,
        VendorID: null,
        ConfigurationID: null,
        Temperature: null,
        TopP: null,
        TopK: null,
        MinP: null,
        FrequencyPenalty: null,
        PresencePenalty: null,
        Seed: null,
        StopSequences: null,
        ResponseFormat: null,
        EffortLevel: null,
        ...over,
    } as unknown as MJScopedPromptConfigEntity;
}

/** Resolver whose candidate set is the supplied fixtures (mirrors base PromptID + Status filtering). */
class TestResolver extends ScopedPromptConfigResolver {
    constructor(private fixtures: MJScopedPromptConfigEntity[]) {
        super();
    }
    protected override getCandidates(promptID: string): MJScopedPromptConfigEntity[] {
        return this.fixtures.filter(
            (c) => c.PromptID === promptID && (c.Status === 'Active' || c.Status === 'Provisional'),
        );
    }
}

const ORG: PromptComponentScope = { primaryScopeEntityId: 'E1', primaryScopeRecordId: 'ORG1' };

describe('ScopedPromptConfigResolver — cascade (single winner)', () => {
    const fixtures = [
        cfg({ ModelID: 'model-global' }),
        cfg({ ModelID: 'model-org', PrimaryScopeEntityID: 'E1', PrimaryScopeRecordID: 'ORG1' }),
        cfg({ ModelID: 'model-channel', SecondaryScopes: JSON.stringify({ ChannelID: 'C1' }) }),
    ];

    it('channel (secondary) beats org (primary record) beats global', () => {
        const r = new TestResolver(fixtures).Resolve('P1', { ...ORG, secondaryScopes: { ChannelID: 'C1' } });
        expect(r?.ModelID).toBe('model-channel');
    });

    it('org wins when only org scope matches (no channel)', () => {
        const r = new TestResolver(fixtures).Resolve('P1', ORG);
        expect(r?.ModelID).toBe('model-org');
    });

    it('global wins when the run is unscoped', () => {
        const r = new TestResolver(fixtures).Resolve('P1', {});
        expect(r?.ModelID).toBe('model-global');
    });

    it('returns null when no config is in scope for the prompt', () => {
        const r = new TestResolver([cfg({ PromptID: 'OTHER', ModelID: 'x' })]).Resolve('P1', {});
        expect(r).toBeNull();
    });

    it('higher Priority wins at equal specificity', () => {
        const f = [
            cfg({ ModelID: 'lo', Priority: 1 }),
            cfg({ ModelID: 'hi', Priority: 5 }),
        ];
        expect(new TestResolver(f).Resolve('P1', {})?.ModelID).toBe('hi');
    });

    it('excludes Archived, includes Provisional', () => {
        const f = [
            cfg({ ModelID: 'archived', Status: 'Archived', Priority: 9 }),
            cfg({ ModelID: 'provisional', Status: 'Provisional', Priority: 1 }),
        ];
        expect(new TestResolver(f).Resolve('P1', {})?.ModelID).toBe('provisional');
    });
});

describe('ApplyScopedPromptConfig — overlay onto prompt params', () => {
    it('maps model/vendor/config/effort to their typed fields and sampling knobs to additionalParameters', () => {
        const resolver = new TestResolver([
            cfg({
                ModelID: 'm1', VendorID: 'v1', ConfigurationID: 'conf1', EffortLevel: 42,
                Temperature: 0.2, TopP: 0.9, ResponseFormat: 'JSON', StopSequences: 'END',
            }),
        ]);
        const params: ScopedPromptConfigTarget = {};
        const applied = ApplyScopedPromptConfig(resolver, 'P1', {}, params);
        expect(applied).not.toBeNull();
        expect(params.override).toEqual({ modelId: 'm1', vendorId: 'v1' });
        expect(params.configurationId).toBe('conf1');
        expect(params.effortLevel).toBe(42);
        expect(params.additionalParameters).toEqual({
            temperature: 0.2, topP: 0.9, responseFormat: 'JSON', stopSequences: 'END',
        });
    });

    it('does NOT override runtime-explicit values (runtime wins)', () => {
        const resolver = new TestResolver([
            cfg({ ModelID: 'cfg-model', ConfigurationID: 'cfg-conf', EffortLevel: 10 }),
        ]);
        const params: ScopedPromptConfigTarget = {
            override: { modelId: 'runtime-model' },
            configurationId: 'runtime-conf',
            effortLevel: 99,
        };
        ApplyScopedPromptConfig(resolver, 'P1', {}, params);
        expect(params.override).toEqual({ modelId: 'runtime-model' }); // not clobbered, vendor not added
        expect(params.configurationId).toBe('runtime-conf');
        expect(params.effortLevel).toBe(99);
    });

    it('runtime additionalParameters keys win over config knobs', () => {
        const resolver = new TestResolver([cfg({ Temperature: 0.2, TopP: 0.9 })]);
        const params: ScopedPromptConfigTarget = { additionalParameters: { temperature: 0.8 } };
        ApplyScopedPromptConfig(resolver, 'P1', {}, params);
        expect(params.additionalParameters).toEqual({ temperature: 0.8, topP: 0.9 });
    });

    it('is a no-op when nothing resolves', () => {
        const params: ScopedPromptConfigTarget = {};
        const applied = ApplyScopedPromptConfig(new TestResolver([]), 'P1', {}, params);
        expect(applied).toBeNull();
        expect(params).toEqual({});
    });

    it('skips null columns (inherit prompt default) — only sets what is present', () => {
        const resolver = new TestResolver([cfg({ Temperature: 0.5 })]); // model/config/effort all null
        const params: ScopedPromptConfigTarget = {};
        ApplyScopedPromptConfig(resolver, 'P1', {}, params);
        expect(params.override).toBeUndefined();
        expect(params.configurationId).toBeUndefined();
        expect(params.effortLevel).toBeUndefined();
        expect(params.additionalParameters).toEqual({ temperature: 0.5 });
    });
});
