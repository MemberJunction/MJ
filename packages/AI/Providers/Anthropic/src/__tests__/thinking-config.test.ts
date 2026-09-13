import { describe, it, expect } from 'vitest';
import { BuildAnthropicThinking, MapEffortLevelToAnthropicEffort, UsesAdaptiveThinking } from '../models/thinking-config';

describe('UsesAdaptiveThinking — which Claude models take the adaptive form', () => {
    it.each([
        ['claude-sonnet-5', true],
        ['claude-opus-5', true],
        ['claude-fable-5-1', true],
        ['claude-mythos-5-1', true],
        ['claude-sonnet-4-6', true],
        ['claude-opus-4-6-20260210', true],
        ['Claude-Sonnet-5', true]
    ])('%s → adaptive (%s)', (model, expected) => {
        expect(UsesAdaptiveThinking(model)).toBe(expected);
    });

    it.each([
        ['claude-haiku-4-5-20251001', false],
        ['claude-opus-4-5', false],
        ['claude-sonnet-4-20250514', false],
        ['claude-opus-4-1-20250805', false],
        ['claude-3-7-sonnet-20250219', false],
        ['claude-3-5-haiku-20241022', false]
    ])('%s → budget form (%s)', (model, expected) => {
        expect(UsesAdaptiveThinking(model)).toBe(expected);
    });

    it('a name with no version keeps the budget form (the pre-existing behaviour)', () => {
        expect(UsesAdaptiveThinking('claude-unknown')).toBe(false);
        expect(UsesAdaptiveThinking('')).toBe(false);
    });

    it('a trailing 8-digit date is never read as a version', () => {
        // Without the date filter "claude-sonnet-4-20250514" would parse as 4.20250514 → adaptive.
        expect(UsesAdaptiveThinking('claude-sonnet-4-20250514')).toBe(false);
    });
});

describe('MapEffortLevelToAnthropicEffort — MJ 1-100 scale and named levels', () => {
    it('uses the shared three bands', () => {
        expect(MapEffortLevelToAnthropicEffort('1')).toBe('low');
        expect(MapEffortLevelToAnthropicEffort('33')).toBe('low');
        expect(MapEffortLevelToAnthropicEffort('34')).toBe('medium');
        expect(MapEffortLevelToAnthropicEffort('50')).toBe('medium');
        expect(MapEffortLevelToAnthropicEffort('66')).toBe('medium');
        expect(MapEffortLevelToAnthropicEffort('67')).toBe('high');
        expect(MapEffortLevelToAnthropicEffort('100')).toBe('high');
    });

    it('passes named levels through, case-insensitively, including max', () => {
        expect(MapEffortLevelToAnthropicEffort('max')).toBe('max');
        expect(MapEffortLevelToAnthropicEffort(' HIGH ')).toBe('high');
    });

    it("'none' means no thinking and is reported as undefined", () => {
        expect(MapEffortLevelToAnthropicEffort('none')).toBeUndefined();
    });

    it('rejects an unknown name', () => {
        expect(() => MapEffortLevelToAnthropicEffort('bogus')).toThrow(/Invalid effortLevel/);
    });
});

describe('BuildAnthropicThinking — the request fields per model family', () => {
    it('no effort level → thinking off', () => {
        expect(BuildAnthropicThinking({ model: 'claude-sonnet-5', budgetTokens: 31000 })).toEqual({});
        expect(BuildAnthropicThinking({ model: 'claude-haiku-4-5-20251001', effortLevel: null, budgetTokens: 31000 })).toEqual({});
    });

    it("effort 'none' → thinking off on both families", () => {
        expect(BuildAnthropicThinking({ model: 'claude-sonnet-5', effortLevel: 'none' })).toEqual({});
        expect(BuildAnthropicThinking({ model: 'claude-haiku-4-5-20251001', effortLevel: 'none', budgetTokens: 31000 })).toEqual({});
    });

    it('Claude 5 → adaptive thinking + output_config.effort, and NO budget_tokens', () => {
        const req = BuildAnthropicThinking({ model: 'claude-sonnet-5', effortLevel: '50', budgetTokens: 31000 });
        expect(req).toEqual({ thinking: { type: 'adaptive' }, output_config: { effort: 'medium' } });
        expect(JSON.stringify(req)).not.toContain('budget_tokens');
        expect(JSON.stringify(req)).not.toContain('enabled');
    });

    it('Claude 5 with effort 1 (Codesmith, Query Builder) → adaptive low', () => {
        expect(BuildAnthropicThinking({ model: 'claude-sonnet-5', effortLevel: '1' })).toEqual({
            thinking: { type: 'adaptive' }, output_config: { effort: 'low' }
        });
    });

    it('Claude 4.5 → budget form with the caller-resolved budget, and NO output_config', () => {
        const req = BuildAnthropicThinking({ model: 'claude-haiku-4-5-20251001', effortLevel: '50', budgetTokens: 31000 });
        expect(req).toEqual({ thinking: { type: 'enabled', budget_tokens: 31000 } });
        expect(req.output_config).toBeUndefined();
    });

    it('Claude 4.5 with no usable budget → thinking off (streaming path semantics preserved)', () => {
        expect(BuildAnthropicThinking({ model: 'claude-haiku-4-5-20251001', effortLevel: '50' })).toEqual({});
    });

    it('Claude 4.5 stays lenient about effort names it cannot use (pre-existing behaviour)', () => {
        expect(BuildAnthropicThinking({ model: 'claude-haiku-4-5-20251001', effortLevel: 'xhigh', budgetTokens: 2048 })).toEqual({
            thinking: { type: 'enabled', budget_tokens: 2048 }
        });
    });

    it('Claude 5 rejects an effort name Anthropic does not define', () => {
        expect(() => BuildAnthropicThinking({ model: 'claude-sonnet-5', effortLevel: 'bogus' })).toThrow(/Invalid effortLevel/);
    });
});
