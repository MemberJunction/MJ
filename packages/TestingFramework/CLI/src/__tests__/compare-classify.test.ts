import { describe, it, expect } from 'vitest';
import { classifyChange } from '../commands/compare';

type Summary = { Status: string; Score: number | null; Flaky?: boolean };
const t = (Status: string, Score: number | null = 1, Flaky?: boolean): Summary => ({ Status, Score, Flaky });

describe('classifyChange (retry-aware compare)', () => {
    it('new / removed when a test appears or disappears', () => {
        expect(classifyChange(undefined, t('Passed'))).toBe('new');
        expect(classifyChange(t('Passed'), undefined)).toBe('removed');
    });

    it('regression when a passing test starts failing', () => {
        expect(classifyChange(t('Passed'), t('Failed', 0))).toBe('regression');
    });

    it('improvement when a failing test starts passing', () => {
        expect(classifyChange(t('Failed', 0), t('Passed'))).toBe('improvement');
    });

    it('score drop / rise beyond 0.1 is a regression / improvement', () => {
        expect(classifyChange(t('Passed', 0.9), t('Passed', 0.7))).toBe('regression');
        expect(classifyChange(t('Failed', 0.5), t('Failed', 0.7))).toBe('improvement');
    });

    // The headline: a clean pass that becomes a pass-on-retry is surfaced,
    // not buried in "unchanged".
    it('flaky when a stable pass becomes a flaky pass', () => {
        expect(classifyChange(t('Passed', 1, false), t('Passed', 1, true))).toBe('flaky');
    });

    it('flaky→stable is NOT flagged (it recovered)', () => {
        expect(classifyChange(t('Passed', 1, true), t('Passed', 1, false))).toBe('unchanged');
    });

    it('a persistently-flaky pass is unchanged (no NEW flakiness)', () => {
        expect(classifyChange(t('Passed', 1, true), t('Passed', 1, true))).toBe('unchanged');
    });

    it('a real regression always wins over the flaky signal', () => {
        // Current run is flaky AND its score cratered → regression, not flaky.
        expect(classifyChange(t('Passed', 1, false), t('Passed', 0.5, true))).toBe('regression');
    });

    it('two clean passes are unchanged', () => {
        expect(classifyChange(t('Passed'), t('Passed'))).toBe('unchanged');
    });
});
