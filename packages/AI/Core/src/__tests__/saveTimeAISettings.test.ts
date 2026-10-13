/**
 * SaveTimeAISettings holds the host's SaveTimeAIConfig. Only an explicit `false` disables a kind; an
 * empty config, an absent key and `true` all leave it enabled. It is a process-wide BaseSingleton.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { SaveTimeAISettings } from '../generic/saveTimeAISettings';
import type { SaveTimeAIKind } from '../generic/saveTimeAISettings';

const ALL_KINDS: readonly SaveTimeAIKind[] = ['QueryParameters', 'TemplateParameters', 'ViewSmartFilters', 'CodeGeneration', 'Embeddings'];

describe('SaveTimeAISettings', () => {
    afterEach(() => {
        SaveTimeAISettings.Instance.Config = {};
    });

    it('is one instance per process', () => {
        expect(SaveTimeAISettings.Instance).toBe(SaveTimeAISettings.Instance);
    });

    it('leaves every kind enabled when nothing is configured', () => {
        SaveTimeAISettings.Instance.Config = {};
        for (const kind of ALL_KINDS) {
            expect(SaveTimeAISettings.Instance.IsDisabled(kind)).toBe(false);
        }
    });

    it('leaves a kind enabled when its key is absent or true', () => {
        SaveTimeAISettings.Instance.Config = { TemplateParameters: false, QueryParameters: true };
        expect(SaveTimeAISettings.Instance.IsDisabled('QueryParameters')).toBe(false);
        expect(SaveTimeAISettings.Instance.IsDisabled('Embeddings')).toBe(false);
    });

    it('disables exactly the kinds set to false', () => {
        SaveTimeAISettings.Instance.Config = { QueryParameters: false, ViewSmartFilters: false };
        expect(SaveTimeAISettings.Instance.IsDisabled('QueryParameters')).toBe(true);
        expect(SaveTimeAISettings.Instance.IsDisabled('ViewSmartFilters')).toBe(true);
        expect(SaveTimeAISettings.Instance.IsDisabled('TemplateParameters')).toBe(false);
        expect(SaveTimeAISettings.Instance.IsDisabled('CodeGeneration')).toBe(false);
    });

    it('keeps a copy, so a caller mutating its object later does not change the installed config', () => {
        const config = { CodeGeneration: true };
        SaveTimeAISettings.Instance.Config = config;
        config.CodeGeneration = false;
        expect(SaveTimeAISettings.Instance.IsDisabled('CodeGeneration')).toBe(false);
    });

    it('WithPromptsDisabled turns off every prompt kind and keeps embeddings as given', () => {
        const config = SaveTimeAISettings.WithPromptsDisabled({ Embeddings: true, QueryParameters: true });
        expect(config).toEqual({ QueryParameters: false, TemplateParameters: false, ViewSmartFilters: false, CodeGeneration: false, Embeddings: true });
        expect(SaveTimeAISettings.PromptKinds).not.toContain('embeddings');
    });
});
