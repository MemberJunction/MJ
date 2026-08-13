/**
 * Unit tests for the pure usage-normalization core of MJAIPromptRunEntityServer: hasRecordedUsage
 * (whether a run did work worth pricing) and normalizeRecordedUsage (mapping what the run recorded
 * onto the quantities its cost row's driver prices, or refusing when the measures disagree).
 */

import { describe, it, expect } from 'vitest';
import { hasRecordedUsage, normalizeRecordedUsage, RecordedRunUsage } from '../custom/MJAIPromptRunEntityServer.server';

function usage(overrides: Partial<RecordedRunUsage> = {}): RecordedRunUsage {
    return {
        tokensPrompt: 0,
        tokensCacheRead: 0,
        tokensCacheWrite: 0,
        tokensCompletion: 0,
        unitsKind: null,
        inputUnits: 0,
        outputUnits: 0,
        ...overrides
    };
}

describe('hasRecordedUsage', () => {
    it('is false for a run that recorded nothing', () => {
        expect(hasRecordedUsage(usage())).toBe(false);
    });

    it('is true for ordinary token usage', () => {
        expect(hasRecordedUsage(usage({ tokensPrompt: 1200, tokensCompletion: 300 }))).toBe(true);
    });

    it('is true for a fully-cached call with no net-new prompt tokens', () => {
        // Cache reads are still billed input, so this run costs money despite TokensPrompt === 0.
        expect(hasRecordedUsage(usage({ tokensCacheRead: 5000 }))).toBe(true);
    });

    it('is true for a zero-token transcription run measured in seconds', () => {
        // The case that used to fail the gate and leave audio runs silently uncosted.
        expect(hasRecordedUsage(usage({ unitsKind: 'Seconds', inputUnits: 128.5 }))).toBe(true);
    });

    it('is true for an image run that produced output units only', () => {
        expect(hasRecordedUsage(usage({ unitsKind: 'Images', outputUnits: 3 }))).toBe(true);
    });

    it('is false when a units kind is declared but no quantity was recorded', () => {
        expect(hasRecordedUsage(usage({ unitsKind: 'Seconds' }))).toBe(false);
    });
});

describe('normalizeRecordedUsage', () => {
    it('refuses a non-token kind carrying no quantity, rather than persisting Cost = 0', () => {
        // The mirror of the units-without-a-kind refusal, and the one that matters most: THIS is
        // the path that writes `AIPromptRun.Cost`. A run naming Seconds with zero seconds passes
        // `hasRecordedUsage` on its token counts alone, would normalize to {input: 0, output: 0},
        // and would persist a cost of 0 — "free" recorded against work that was billed, which is
        // indistinguishable from a genuinely cheap run once it is in the database.
        const result = normalizeRecordedUsage(
            usage({ unitsKind: 'Seconds', inputUnits: 0, outputUnits: 0, tokensPrompt: 5000 }),
            'Seconds'
        );

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toMatch(/no unit quantity/i);
    });

    it('still prices a non-token kind that reports only OUTPUT units', () => {
        // Guards against the refusal being written as "input is zero" — TTS bills on what it
        // produces, so an output-only quantity is ordinary, not a missing amount.
        const result = normalizeRecordedUsage(
            usage({ unitsKind: 'Images', inputUnits: 0, outputUnits: 4 }),
            'Images'
        );

        expect(result).toEqual({ ok: true, usage: { input: 0, output: 4 } });
    });

    it('maps token usage onto the four token buckets for a token driver', () => {
        const result = normalizeRecordedUsage(
            usage({ tokensPrompt: 1000, tokensCompletion: 500, tokensCacheRead: 200, tokensCacheWrite: 100 }),
            'Tokens'
        );

        expect(result).toEqual({
            ok: true,
            usage: { input: 1000, output: 500, cacheRead: 200, cacheWrite: 100 }
        });
    });

    it('maps recorded seconds onto input/output for a time driver', () => {
        const result = normalizeRecordedUsage(
            usage({ unitsKind: 'Seconds', inputUnits: 5400, outputUnits: 0 }),
            'Seconds'
        );

        expect(result).toEqual({ ok: true, usage: { input: 5400, output: 0 } });
    });

    it('omits the cache buckets for continuous media, where they are meaningless', () => {
        const result = normalizeRecordedUsage(usage({ unitsKind: 'Images', outputUnits: 3 }), 'Images');

        expect(result.ok).toBe(true);
        if (result.ok === true) {
            expect(result.usage.cacheRead).toBeUndefined();
            expect(result.usage.cacheWrite).toBeUndefined();
        }
    });

    it('refuses to price seconds against a token-priced cost row', () => {
        // Pricing it anyway would divide seconds by a million and report ~$0 as if it were real.
        const result = normalizeRecordedUsage(usage({ unitsKind: 'Seconds', inputUnits: 5400 }), 'Tokens');

        expect(result.ok).toBe(false);
        if (result.ok === false) {
            expect(result.reason).toContain('Seconds');
            expect(result.reason).toContain('Tokens');
        }
    });

    it('refuses to price tokens against an audio-priced cost row', () => {
        const result = normalizeRecordedUsage(usage({ tokensPrompt: 1000 }), 'Seconds');

        expect(result.ok).toBe(false);
    });

    it('refuses to price images against a time-priced cost row', () => {
        const result = normalizeRecordedUsage(usage({ unitsKind: 'Images', outputUnits: 3 }), 'Seconds');

        expect(result.ok).toBe(false);
    });

    it('refuses units recorded without a UnitsKind rather than pricing them as tokens', () => {
        // The producer-bug case: units are present but nothing says what measure they are in.
        // Treating the run as token-billed would price its zero token counts and persist Cost = 0
        // for work that was actually billed — B60's failure mode through a different door.
        const result = normalizeRecordedUsage(usage({ unitsKind: null, inputUnits: 5400 }), 'Tokens');

        expect(result.ok).toBe(false);
        if (result.ok === false) {
            expect(result.reason).toContain('UnitsKind');
        }
    });

    it('refuses output-only units recorded without a UnitsKind', () => {
        expect(normalizeRecordedUsage(usage({ unitsKind: null, outputUnits: 3 }), 'Tokens').ok).toBe(false);
    });

    it('treats a null units kind as Tokens, which is what every pre-existing run has', () => {
        const result = normalizeRecordedUsage(usage({ tokensPrompt: 10, unitsKind: null }), 'Tokens');

        expect(result.ok).toBe(true);
    });
});
