import { describe, it, expect } from 'vitest';
import { summarizeOlderSteps, DEFAULT_MAX_VERBATIM_STEPS } from '../engine/step-digest.js';
import { StepRecord } from '../types/judge.js';
import { ComputerUseError } from '../types/errors.js';

function step(n: number, urlAfter: string, error = false): StepRecord {
    const s = new StepRecord();
    s.StepNumber = n;
    s.UrlAfter = urlAfter;
    if (error) s.Error = new ComputerUseError('LLMError', 'boom');
    return s;
}

describe('summarizeOlderSteps (CU-E4)', () => {
    it('returns empty for no steps', () => {
        expect(summarizeOlderSteps([])).toBe('');
    });

    it('reports the step range and per-path visit counts', () => {
        const out = summarizeOlderSteps([
            step(1, 'http://x/app/a'),
            step(2, 'http://x/app/b'),
            step(3, 'http://x/app/a'),
            step(4, 'http://x/app/a'),
        ]);
        expect(out).toContain('Steps 1–4 (summarized)');
        expect(out).toContain('/app/a (×3)'); // repeat count preserved (loop signal)
        expect(out).toContain('/app/b');
    });

    it('counts errors', () => {
        const out = summarizeOlderSteps([step(1, 'http://x/a', true), step(2, 'http://x/a', true)]);
        expect(out).toContain('2 error(s)');
    });

    it('handles steps with no navigation', () => {
        expect(summarizeOlderSteps([step(1, '')])).toContain('no navigation');
    });

    it('exposes a sane verbatim window default', () => {
        expect(DEFAULT_MAX_VERBATIM_STEPS).toBe(8);
    });
});
