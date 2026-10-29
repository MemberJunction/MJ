import { describe, it, expect } from 'vitest';
import { NormalizeTurnDetectionSettings } from '../generic/modelConfiguration';

describe('NormalizeTurnDetectionSettings', () => {
    it('copies all five fields', () => expect(NormalizeTurnDetectionSettings({ Mode: 'serverVad', Eagerness: 'low', Threshold: 0.3, SilenceDurationMs: 900, Coverage: 'audioActivityOnly' }))
        .toEqual({ Mode: 'serverVad', Eagerness: 'low', Threshold: 0.3, SilenceDurationMs: 900, Coverage: 'audioActivityOnly' }));
    it('accepts every declared Mode, Eagerness and Coverage literal', () => {
        for (const Mode of ['default', 'serverVad', 'semanticVad', 'native'] as const) expect(NormalizeTurnDetectionSettings({ Mode })).toEqual({ Mode });
        for (const Eagerness of ['low', 'auto', 'high'] as const) expect(NormalizeTurnDetectionSettings({ Eagerness })).toEqual({ Eagerness });
        for (const Coverage of ['audioActivityOnly', 'audioActivityAndAllVideo'] as const) expect(NormalizeTurnDetectionSettings({ Coverage })).toEqual({ Coverage });
    });
    it('keeps valid fields and drops invalid ones', () => expect(NormalizeTurnDetectionSettings({ Mode: 'bogus', Coverage: 'nope', Threshold: Infinity, SilenceDurationMs: 500 }))
        .toEqual({ SilenceDurationMs: 500 }));
    it('returns undefined when nothing valid survives', () => expect(NormalizeTurnDetectionSettings({ Eagerness: 'LOW', Threshold: '0.5' })).toBeUndefined());
    it.each(['x', null, undefined, 5, [], [{ Mode: 'serverVad' }]])('returns undefined for non-object %j', (v) => expect(NormalizeTurnDetectionSettings(v)).toBeUndefined());
});
