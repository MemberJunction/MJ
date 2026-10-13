import { describe, it, expect, beforeEach } from 'vitest';
import { SaveTimeAISettings } from '@memberjunction/ai';
import type { SaveTimeAIConfig } from '@memberjunction/ai';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { DETERMINISTIC_SAVE_TIME_AI_TIERS } from '../deterministic-host';

// Captured at module load, before any hook runs: the settings right after this module (and
// everything it imports) has been evaluated.
const CONFIG_AT_LOAD: Readonly<SaveTimeAIConfig> = SaveTimeAISettings.Instance.Config;

/**
 * The deterministic host switch must be bound to the tier, not to module load: `mj test` loads this
 * module for every run, including the live-model suite and non-integration test types. The driver
 * enters the tier scopes of each test's tier through `IntegrationCheckRegistry.EnterTierScopes`
 * (proven against the driver in testing-integration's IntegrationTestDriver.test.ts); these tests
 * prove what the real scope registered by this module does for each tier.
 */
function promptsOff(): boolean {
    return SaveTimeAISettings.PromptKinds.every((kind) => SaveTimeAISettings.Instance.IsDisabled(kind));
}

function anyOff(): boolean {
    return SaveTimeAISettings.PromptKinds.some((kind) => SaveTimeAISettings.Instance.IsDisabled(kind))
        || SaveTimeAISettings.Instance.IsDisabled('Embeddings');
}

describe('deterministic-host save-time AI tier scope', () => {
    beforeEach(() => {
        SaveTimeAISettings.Instance.Config = {};
    });

    it('loading the module leaves every save-time AI kind on', () => {
        expect(CONFIG_AT_LOAD).toEqual({});
    });

    it('a live-model (non-deterministic) run leaves every kind on', () => {
        const exit = IntegrationCheckRegistry.Instance.EnterTierScopes('live-model');
        try {
            expect(anyOff()).toBe(false);
        } finally {
            exit();
        }
        expect(SaveTimeAISettings.Instance.Config).toEqual({});
    });

    it('is bound to the deterministic and mutation tiers only', () => {
        expect([...DETERMINISTIC_SAVE_TIME_AI_TIERS].sort()).toEqual(['deterministic', 'mutation']);
    });

    it.each(['deterministic', 'mutation'] as const)('a %s run switches every prompt kind off, keeps embeddings, and the exit restores', (tier) => {
        const exit = IntegrationCheckRegistry.Instance.EnterTierScopes(tier);
        expect(promptsOff()).toBe(true);
        expect(SaveTimeAISettings.Instance.IsDisabled('Embeddings')).toBe(false);
        exit();
        expect(anyOff()).toBe(false);
        expect(SaveTimeAISettings.Instance.Config).toEqual({});
    });

    it('restores the host config that was installed before, and keeps its embeddings setting during the run', () => {
        const hostConfig: SaveTimeAIConfig = { QueryParameters: true, TemplateParameters: false, Embeddings: false };
        SaveTimeAISettings.Instance.Config = hostConfig;
        const exit = IntegrationCheckRegistry.Instance.EnterTierScopes('deterministic');
        expect(SaveTimeAISettings.Instance.IsDisabled('QueryParameters')).toBe(true);
        expect(SaveTimeAISettings.Instance.IsDisabled('Embeddings')).toBe(true);
        exit();
        expect(SaveTimeAISettings.Instance.Config).toEqual(hostConfig);
        expect(SaveTimeAISettings.Instance.IsDisabled('QueryParameters')).toBe(false);
    });

    it('overlapping runs keep the prompts off until the last one exits; a second exit call is a no-op', () => {
        const exitA = IntegrationCheckRegistry.Instance.EnterTierScopes('deterministic');
        const exitB = IntegrationCheckRegistry.Instance.EnterTierScopes('mutation');
        exitA();
        exitA();
        expect(promptsOff()).toBe(true);
        exitB();
        expect(anyOff()).toBe(false);
    });
});
