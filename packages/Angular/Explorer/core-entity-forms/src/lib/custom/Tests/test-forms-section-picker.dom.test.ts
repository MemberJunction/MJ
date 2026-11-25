/**
 * The four Testing forms' phone nav: each hand-written tab strip becomes an `mj-section-picker`.
 * These specs pin each form's adapter (tab order, a count only once that tab's data has loaded,
 * Test Runs' Log tab only when the record has a log) and the shared pick handler (a known key goes
 * through ChangeTab so lazy loads still fire; an unknown key is ignored).
 */
import { describe, it, expect, vi } from 'vitest';
import { MJTestFormComponentExtended } from './test-form.component';
import { MJTestSuiteFormComponentExtended } from './test-suite-form.component';
import { MJTestSuiteRunFormComponentExtended } from './test-suite-run-form.component';
import { MJTestRunFormComponentExtended } from './test-run-form.component';

const cdr = { markForCheck: () => undefined, detectChanges: () => undefined };
const keys = (items: { Key: string }[]) => items.map((i) => i.Key);
const counts = (items: { Key: string; Count?: number | null }[]) => Object.fromEntries(items.map((i) => [i.Key, i.Count ?? null]));

describe('Tests form picker', () => {
    const form = (over: object = {}) => Object.assign(Object.create(MJTestFormComponentExtended.prototype) as MJTestFormComponentExtended,
        { cdr, ActiveTab: 'overview', TestRunsLoaded: false, TestRuns: [], SuiteTestsLoaded: false, SuiteTests: [] }, over);

    it('lists the five tabs in strip order with counts only once loaded', () => {
        const f = form({ TestRunsLoaded: true, TestRuns: [1, 2, 3], SuiteTests: [1] });
        expect(keys(f.SectionPickerItems)).toEqual(['overview', 'config', 'runs', 'suites', 'analytics']);
        expect(counts(f.SectionPickerItems)).toEqual({ overview: null, config: null, runs: 3, suites: null, analytics: null });
    });

    it('routes a known pick through ChangeTab and ignores an unknown key', () => {
        const f = form();
        const spy = vi.spyOn(f, 'ChangeTab').mockImplementation(() => undefined);
        f.OnSectionPicked('config');
        f.OnSectionPicked('nope');
        expect(spy.mock.calls).toEqual([['config']]);
    });
});

describe('Test Suites form picker', () => {
    const form = (over: object = {}) => Object.assign(Object.create(MJTestSuiteFormComponentExtended.prototype) as MJTestSuiteFormComponentExtended,
        { cdr, ActiveTab: 'overview', TestsLoaded: false, SuiteTests: [], RunsLoaded: false, SuiteRuns: [] }, over);

    it('lists the five tabs in strip order with counts only once loaded', () => {
        const f = form({ TestsLoaded: true, SuiteTests: [1, 2], RunsLoaded: true, SuiteRuns: [] });
        expect(keys(f.SectionPickerItems)).toEqual(['overview', 'tests', 'runs', 'analytics', 'compare']);
        expect(counts(f.SectionPickerItems)).toEqual({ overview: null, tests: 2, runs: 0, analytics: null, compare: null });
    });

    it('routes a known pick through ChangeTab and ignores an unknown key', () => {
        const f = form();
        const spy = vi.spyOn(f, 'ChangeTab').mockImplementation(() => undefined);
        f.OnSectionPicked('compare');
        f.OnSectionPicked('nope');
        expect(spy.mock.calls).toEqual([['compare']]);
    });
});

describe('Test Suite Runs form picker', () => {
    const form = (over: object = {}) => Object.assign(Object.create(MJTestSuiteRunFormComponentExtended.prototype) as MJTestSuiteRunFormComponentExtended,
        { cdr, ActiveTab: 'overview', TestRunsLoaded: false, TestRuns: [] }, over);

    it('lists the five tabs in strip order with the run count only once loaded', () => {
        const f = form({ TestRunsLoaded: true, TestRuns: [1, 2, 3, 4] });
        expect(keys(f.SectionPickerItems)).toEqual(['overview', 'runs', 'details', 'analytics', 'execution']);
        expect(counts(f.SectionPickerItems)).toEqual({ overview: null, runs: 4, details: null, analytics: null, execution: null });
    });

    it('routes a known pick through ChangeTab and ignores an unknown key', () => {
        const f = form();
        const spy = vi.spyOn(f, 'ChangeTab').mockImplementation(() => undefined);
        f.OnSectionPicked('execution');
        f.OnSectionPicked('nope');
        expect(spy.mock.calls).toEqual([['execution']]);
    });
});

describe('Test Runs form picker', () => {
    const form = (over: object = {}) => Object.assign(Object.create(MJTestRunFormComponentExtended.prototype) as MJTestRunFormComponentExtended,
        { cdr, ActiveTab: 'overview', AiRunsLoaded: false, AiAgentRuns: [], AiPromptRuns: [], FeedbackLoaded: false, Feedbacks: [], record: { Log: null } }, over);

    it('lists the tabs in strip order, AI Runs counting agent plus prompt runs, Log only when the record has one', () => {
        const f = form({ AiRunsLoaded: true, AiAgentRuns: [1], AiPromptRuns: [1, 2], FeedbackLoaded: true, Feedbacks: [1], record: { Log: 'x' } });
        expect(keys(f.SectionPickerItems)).toEqual(['overview', 'details', 'ai-runs', 'feedback', 'execution', 'log']);
        expect(counts(f.SectionPickerItems)).toEqual({ overview: null, details: null, 'ai-runs': 3, feedback: 1, execution: null, log: null });
        expect(keys(form().SectionPickerItems)).toEqual(['overview', 'details', 'ai-runs', 'feedback', 'execution']);
    });

    it('routes a known pick through ChangeTab and ignores an unknown key, including Log without a log', () => {
        const f = form();
        const spy = vi.spyOn(f, 'ChangeTab').mockImplementation(() => undefined);
        f.OnSectionPicked('feedback');
        f.OnSectionPicked('log');
        expect(spy.mock.calls).toEqual([['feedback']]);
    });
});
