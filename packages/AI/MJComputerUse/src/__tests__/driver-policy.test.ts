import { describe, expect, it } from 'vitest';
import {
    DEFAULT_CONSOLE_LOG_LEVEL,
    FailureSignals,
    classifyFailure,
    computeDivergence,
    formatConsoleLine,
    isOracleAdvisory,
    isSevereBrowserFault,
    mergeComputerUseConfig,
    partitionGatingOracles,
    readSuiteComputerUseConfig,
    resolveConsoleLogLevel,
    shouldCaptureArtifact,
    shouldLogToConsole,
    shouldRetainArtifact,
    testTag,
} from '../test-driver/driver-policy.js';
import type { ComputerUseTestConfig } from '../test-driver/types.js';
import type { BrowserDiagnosticEvent } from '@memberjunction/computer-use';
import type { OracleResult } from '@memberjunction/testing-engine';

function res(oracleType: string, passed: boolean, advisory?: boolean): OracleResult {
    return { oracleType, passed, score: passed ? 1 : 0, message: '', advisory };
}

describe('oracle-scoring', () => {
    describe('isOracleAdvisory', () => {
        it('defaults step-count to advisory', () => {
            expect(isOracleAdvisory('step-count')).toBe(true);
        });

        it('defaults other oracle types to gating', () => {
            expect(isOracleAdvisory('goal-completion')).toBe(false);
            expect(isOracleAdvisory('url-match')).toBe(false);
        });

        it('lets an explicit config value override the type default', () => {
            // Force step-count to gate…
            expect(isOracleAdvisory('step-count', false)).toBe(false);
            // …and force a normally-gating oracle to advisory.
            expect(isOracleAdvisory('goal-completion', true)).toBe(true);
        });
    });

    describe('partitionGatingOracles', () => {
        it('excludes advisory results from the gating set', () => {
            const results = [
                res('goal-completion', true),
                res('step-count', false, true),
                res('url-match', true, false),
            ];
            const gating = partitionGatingOracles(results);
            expect(gating.map(r => r.oracleType)).toEqual(['goal-completion', 'url-match']);
        });

        it('treats a missing advisory flag as gating', () => {
            const results = [res('goal-completion', true)];
            expect(partitionGatingOracles(results)).toHaveLength(1);
        });

        it('returns empty when every oracle is advisory (caller falls back)', () => {
            const results = [res('step-count', false, true)];
            expect(partitionGatingOracles(results)).toHaveLength(0);
        });

        it('a failing advisory oracle does not appear among gating results', () => {
            // The scenario this fixes: step-count "fails" but must not gate.
            const results = [res('goal-completion', true), res('step-count', false, true)];
            const gating = partitionGatingOracles(results);
            expect(gating.every(r => r.passed)).toBe(true);
        });
    });
});

describe('shouldCaptureArtifact', () => {
    it('captures for retain-on-failure and on', () => {
        expect(shouldCaptureArtifact('retain-on-failure')).toBe(true);
        expect(shouldCaptureArtifact('on')).toBe(true);
    });

    it('does not capture for off (zero overhead)', () => {
        expect(shouldCaptureArtifact('off')).toBe(false);
    });
});

describe('shouldRetainArtifact', () => {
    it('on: keeps regardless of outcome', () => {
        expect(shouldRetainArtifact('on', true)).toBe(true);
        expect(shouldRetainArtifact('on', false)).toBe(true);
    });

    it('retain-on-failure: keeps only when the test failed', () => {
        expect(shouldRetainArtifact('retain-on-failure', false)).toBe(true);
        expect(shouldRetainArtifact('retain-on-failure', true)).toBe(false);
    });

    it('off: never keeps', () => {
        expect(shouldRetainArtifact('off', true)).toBe(false);
        expect(shouldRetainArtifact('off', false)).toBe(false);
    });
});

describe('computeDivergence', () => {
    it('all three agreeing (done) is unanimous', () => {
        const r = computeDivergence({ selfReportDone: true, judgeDone: true, oraclesPassed: true });
        expect(r.selfVsJudgeAgree).toBe(true);
        expect(r.judgeVsOracleAgree).toBe(true);
        expect(r.selfVsOracleAgree).toBe(true);
        expect(r.unanimous).toBe(true);
    });

    it('all three agreeing (not done) is unanimous', () => {
        const r = computeDivergence({ selfReportDone: false, judgeDone: false, oraclesPassed: false });
        expect(r.unanimous).toBe(true);
    });

    it('detects self-report inflation vs judge/oracle (the field failure mode)', () => {
        const r = computeDivergence({ selfReportDone: true, judgeDone: false, oraclesPassed: false });
        expect(r.selfVsJudgeAgree).toBe(false);
        expect(r.selfVsOracleAgree).toBe(false);
        expect(r.judgeVsOracleAgree).toBe(true); // judge and oracle still agree with each other
        expect(r.unanimous).toBe(false);
    });

    it('detects judge-vs-oracle disagreement (the judge-error signal)', () => {
        const r = computeDivergence({ selfReportDone: true, judgeDone: true, oraclesPassed: false });
        expect(r.selfVsJudgeAgree).toBe(true);
        expect(r.judgeVsOracleAgree).toBe(false);
        expect(r.unanimous).toBe(false);
    });
});

describe('resolveConsoleLogLevel', () => {
    it('accepts the three levels, case/space tolerant', () => {
        expect(resolveConsoleLogLevel('quiet')).toBe('quiet');
        expect(resolveConsoleLogLevel(' VERBOSE ')).toBe('verbose');
        expect(resolveConsoleLogLevel('Normal')).toBe('normal');
    });

    it('falls back to the default on unset/invalid — a bad env value must not change behavior', () => {
        expect(resolveConsoleLogLevel(undefined)).toBe(DEFAULT_CONSOLE_LOG_LEVEL);
        expect(resolveConsoleLogLevel('')).toBe(DEFAULT_CONSOLE_LOG_LEVEL);
        expect(resolveConsoleLogLevel('loud')).toBe(DEFAULT_CONSOLE_LOG_LEVEL);
    });
});

describe('shouldLogToConsole', () => {
    // The actual volume drivers measured in run-20260724T215345Z's 4.5MB log.
    const chatter = [
        'Step 7/40',
        'Step 7 — screenshot captured (142KB base64)',
        'Step 7 — page settled in 812ms (stable)',
        'Step 7 — element grounding: 63 interactive elements',
        'Step 7 — controller response: 2 actions, 0 tool calls',
        'Step 7 — reasoning: I can see the Agents list is now displayed...',
        'Step 7 — actions (1000x1000 space): [Click(420,270 normalized)]',
        'Step 7 — completed in 9241ms (settle 812ms · llm 6100ms · action 210ms · judge 0ms)',
        'Executing controller prompt via AIPromptRunner (prompt: "Computer Use - Controller")',
        'AIPromptRunner response: 1043 chars',
        'AIPromptRunner raw response (first 1000 chars): {"reasoning":"...',
        'Step 9 — skipping judge: visible state unchanged since last judged step',
        'Browser closed',
    ];
    const milestones = [
        'Tier: replay-with-heal — app build hash differs',
        'Step 6 — controller reached checkpoint "ai-agents"; forcing scoped judge',
        'Step 12 — all 7 checkpoints reached; completing',
        'Step 9 — judge verdict: Done=false, Impossible=false, Confidence=0.5, Reason: 3/5 criteria met',
        'Replay — all 4 goal postconditions met',
        'Time budget exceeded — wall-clock ceiling (450000ms, settle included) — before step 22',
        'Step 18 — loop trip 2/3 (url-repeat): visited /app/home 4 times',
        'Step 20 — goal confirmed impossible (2 concurring verdicts): access denied',
        'Run exhausted all 40 steps without completion',
        'Failure class: nav-loop',
        'Starting Computer Use test',
        'Computer Use test completed: Failed (Score: 0.30)',
        'Step 5 — browser diagnostics: ChunkLoadError',
    ];

    it('hides known chatter at normal', () => {
        for (const m of chatter) {
            expect(shouldLogToConsole('info', m, 'normal'), m).toBe(false);
        }
    });

    it('shows every milestone at normal AND quiet', () => {
        for (const m of milestones) {
            expect(shouldLogToConsole('info', m, 'normal'), m).toBe(true);
            expect(shouldLogToConsole('info', m, 'quiet'), m).toBe(true);
        }
    });

    it('shows everything at verbose — including chatter', () => {
        for (const m of [...chatter, ...milestones]) {
            expect(shouldLogToConsole('info', m, 'verbose'), m).toBe(true);
        }
    });

    it('ALWAYS shows warn/error, at every level', () => {
        for (const lvl of ['quiet', 'normal', 'verbose'] as const) {
            expect(shouldLogToConsole('error', 'ERROR: step failed — timeout', lvl)).toBe(true);
            expect(shouldLogToConsole('warn', 'WARNING: checkpoint "x" declares no assertions', lvl)).toBe(true);
            // even a chatter-shaped message is shown when it is a warn/error
            expect(shouldLogToConsole('error', 'AIPromptRunner raw response (first 1000 chars): boom', lvl)).toBe(true);
        }
    });

    it('keeps `debug` verbose-only, preserving the base driver contract', () => {
        expect(shouldLogToConsole('debug', 'internal detail', 'quiet')).toBe(false);
        expect(shouldLogToConsole('debug', 'internal detail', 'normal')).toBe(false);
        expect(shouldLogToConsole('debug', 'internal detail', 'verbose')).toBe(true);
        // a milestone-shaped debug message stays verbose-only — level wins
        expect(shouldLogToConsole('debug', 'Tier: llm', 'normal')).toBe(false);
    });

    it('shows UNRECOGNIZED info at normal — novel messages are never silently dropped', () => {
        expect(shouldLogToConsole('info', 'Some brand-new engine message nobody classified', 'normal')).toBe(true);
        // ...but quiet is milestone-only by definition
        expect(shouldLogToConsole('info', 'Some brand-new engine message nobody classified', 'quiet')).toBe(false);
    });
});

describe('testTag / formatConsoleLine', () => {
    it('extracts the T-number so interleaved worker output is attributable', () => {
        expect(testTag('T045 - Query Left-Panel Navigation')).toBe('T045');
        expect(testTag('T001 - Login Smoke')).toBe('T001');
    });

    it('degrades gracefully for non-T names', () => {
        expect(testTag(undefined)).toBe('?');
        expect(testTag('')).toBe('?');
        expect(testTag('Some Custom Test Name')).toBe('Some Custom');
    });

    it('prefixes the line with the tag', () => {
        expect(formatConsoleLine('T045 - Query Left-Panel Navigation', 'Tier: llm'))
            .toBe('[T045] Tier: llm');
    });
});

function sig(overrides: Partial<FailureSignals> = {}): FailureSignals {
    return {
        status: 'Failed',
        failureReason: undefined,
        hasCrash: false,
        hasAppError: false,
        settleBudgetExhausted: false,
        tailHashStable: false,
        beaconConfigured: false,
        beaconEverReady: false,
        oraclesFailed: false,
        ...overrides,
    };
}

describe('classifyFailure', () => {
    it('returns null for a completed run', () => {
        expect(classifyFailure(sig({ status: 'Completed' }))).toBeNull();
    });

    it('classifies a crash / engine error as infra (highest precedence)', () => {
        expect(classifyFailure(sig({ hasCrash: true }))).toBe('infra');
        expect(classifyFailure(sig({ status: 'Error' }))).toBe('infra');
    });

    it('explicit engine terminal verdicts outrank incidental app-error noise (Jul-22 fix)', () => {
        // A flaky agent loop/timeout/cancel/impossible that ALSO logged a severe app
        // fault must classify by the ENGINE's verdict — not be masked as the zero-retry
        // `app-error`, which turned these into hard failures and cratered the pass rate.
        expect(classifyFailure(sig({ hasAppError: true, failureReason: 'LoopDetected' }))).toBe('loop-detected');
        expect(classifyFailure(sig({ hasAppError: true, status: 'TimeBudgetExceeded', tailHashStable: false }))).toBe('timeout-progressing');
        expect(classifyFailure(sig({ hasAppError: true, status: 'Cancelled' }))).toBe('cancelled');
        expect(classifyFailure(sig({ hasAppError: true, status: 'Impossible' }))).toBe('impossible');
    });

    it('app-error still outranks the softer symptom heuristics (stuck-page / judge / assertion)', () => {
        // With no more-specific engine verdict, a severe app fault is the better
        // explanation than "the page looked stuck" or "the judge disagreed".
        expect(classifyFailure(sig({ status: 'Failed', hasAppError: true, settleBudgetExhausted: true, tailHashStable: true }))).toBe('app-error');
        expect(classifyFailure(sig({ status: 'Failed', hasAppError: true, oraclesFailed: true }))).toBe('app-error');
    });

    it('infra still outranks app-error and auth-detour', () => {
        expect(classifyFailure(sig({ hasCrash: true, hasAppError: true }))).toBe('infra');
    });

    it('auth-detour outranks app-error', () => {
        // The detour is the root cause; its own failed auth requests are the symptom.
        expect(classifyFailure(sig({ failureReason: 'AuthDetour', hasAppError: true }))).toBe('auth-detour');
    });

    it('classifies an engine loop terminate as loop-detected', () => {
        expect(classifyFailure(sig({ status: 'Failed', failureReason: 'LoopDetected' }))).toBe('loop-detected');
    });

    it('classifies an auth-detour terminate as auth-detour, outranking its own 401 app-errors', () => {
        // The 401s that caused the detour also set hasAppError — auth-detour is the root cause and wins.
        expect(classifyFailure(sig({ status: 'Failed', failureReason: 'AuthDetour' }))).toBe('auth-detour');
        expect(classifyFailure(sig({ status: 'Failed', failureReason: 'AuthDetour', hasAppError: true }))).toBe('auth-detour');
    });

    it('infra still outranks auth-detour', () => {
        expect(classifyFailure(sig({ hasCrash: true, failureReason: 'AuthDetour' }))).toBe('infra');
    });

    it('classifies cancellation and impossibility', () => {
        expect(classifyFailure(sig({ status: 'Cancelled' }))).toBe('cancelled');
        expect(classifyFailure(sig({ status: 'Impossible' }))).toBe('impossible');
    });

    it('splits time-budget by hash trajectory', () => {
        expect(classifyFailure(sig({ status: 'TimeBudgetExceeded', tailHashStable: true }))).toBe('timeout-stuck');
        expect(classifyFailure(sig({ status: 'TimeBudgetExceeded', tailHashStable: false }))).toBe('timeout-progressing');
    });

    it('classifies a frozen unsettled page as stuck-page', () => {
        expect(classifyFailure(sig({ status: 'MaxStepsReached', settleBudgetExhausted: true, tailHashStable: true }))).toBe('stuck-page');
    });

    it('classifies a never-ready beacon as env-stall', () => {
        expect(classifyFailure(sig({ status: 'MaxStepsReached', beaconConfigured: true, beaconEverReady: false }))).toBe('env-stall');
    });

    it('does not call env-stall when the beacon did fire', () => {
        // Beacon fired → not env-stall; falls through to assertion when oracles failed.
        expect(classifyFailure(sig({ status: 'MaxStepsReached', beaconConfigured: true, beaconEverReady: true, oraclesFailed: true }))).toBe('assertion');
    });

    it('classifies an engine Failed terminate as judge-disagreement', () => {
        expect(classifyFailure(sig({ status: 'Failed' }))).toBe('judge-disagreement');
    });

    it('classifies a clean run with failed oracles as assertion', () => {
        expect(classifyFailure(sig({ status: 'MaxStepsReached', oraclesFailed: true }))).toBe('assertion');
    });

    it('falls back to unknown when no signal matches', () => {
        expect(classifyFailure(sig({ status: 'MaxStepsReached' }))).toBe('unknown');
    });
});

describe('isSevereBrowserFault (hasAppError tightening — Jul-22 fix)', () => {
    const diag = (o: Partial<BrowserDiagnosticEvent>): BrowserDiagnosticEvent =>
        ({ timestamp: '', type: 'console', message: '', ...o });

    it('counts an uncaught page exception', () => {
        expect(isSevereBrowserFault(diag({ type: 'pageerror', message: 'TypeError: x is undefined' }))).toBe(true);
    });

    it('counts a genuine (non-aborted) request failure', () => {
        expect(isSevereBrowserFault(diag({ type: 'requestfailed', message: 'GET https://api/x — net::ERR_CONNECTION_REFUSED' }))).toBe(true);
    });

    it('ignores navigation-aborted / cancelled requests (routine SPA churn)', () => {
        expect(isSevereBrowserFault(diag({ type: 'requestfailed', message: 'GET https://api/x — net::ERR_ABORTED' }))).toBe(false);
        expect(isSevereBrowserFault(diag({ type: 'requestfailed', message: 'GET https://api/x — NS_BINDING_ABORTED' }))).toBe(false);
        expect(isSevereBrowserFault(diag({ type: 'requestfailed', message: 'GET https://api/x — net::ERR_CANCELED' }))).toBe(false);
    });

    it('ignores console errors (too noisy to imply a deterministic fault)', () => {
        expect(isSevereBrowserFault(diag({ type: 'console', level: 'error', message: 'a component logged an error' }))).toBe(false);
    });

    it('ignores non-fault diagnostics (warnings, crash — crash is handled as infra upstream)', () => {
        expect(isSevereBrowserFault(diag({ type: 'console', level: 'warning', message: 'heads up' }))).toBe(false);
        expect(isSevereBrowserFault(diag({ type: 'crash', message: 'Page crashed' }))).toBe(false);
    });
});

describe('readSuiteComputerUseConfig', () => {
    it('returns the block when suiteContext.computerUse is a plain object', () => {
        const block = { elementGrounding: true, generation: { temperature: 0 } };
        expect(readSuiteComputerUseConfig({ computerUse: block })).toEqual(block);
    });

    it('returns undefined when there is no suite context', () => {
        expect(readSuiteComputerUseConfig(undefined)).toBeUndefined();
    });

    it('returns undefined when the suite has no computerUse block', () => {
        expect(readSuiteComputerUseConfig({ applicationContext: 'ctx' })).toBeUndefined();
    });

    it('ignores a malformed block (null / array / primitive) rather than throwing', () => {
        expect(readSuiteComputerUseConfig({ computerUse: null })).toBeUndefined();
        expect(readSuiteComputerUseConfig({ computerUse: [1, 2] })).toBeUndefined();
        expect(readSuiteComputerUseConfig({ computerUse: 'grounding' })).toBeUndefined();
        expect(readSuiteComputerUseConfig({ computerUse: 42 })).toBeUndefined();
    });
});

describe('mergeComputerUseConfig (/ D7 precedence)', () => {
    it('per-test top-level keys win over the suite block', () => {
        const suite = { elementGrounding: true, headless: true };
        const perTest: ComputerUseTestConfig = { elementGrounding: false };
        const merged = mergeComputerUseConfig(suite, perTest);
        expect(merged.elementGrounding).toBe(false); // per-test wins
        expect(merged.headless).toBe(true);          // suite fills the gap
    });

    it('applies suite defaults for keys the test does not set', () => {
        const suite = { trace: 'retain-on-failure' as const, elementGrounding: true };
        const perTest: ComputerUseTestConfig = { maxSteps: 40 };
        const merged = mergeComputerUseConfig(suite, perTest);
        expect(merged).toMatchObject({ trace: 'retain-on-failure', elementGrounding: true, maxSteps: 40 });
    });

    it('deep-merges generation so distinct leaves from both survive', () => {
        const suite = { generation: { temperature: 0 } };
        const perTest: ComputerUseTestConfig = { generation: { effortLevel: 50 } };
        const merged = mergeComputerUseConfig(suite, perTest);
        expect(merged.generation).toEqual({ temperature: 0, effortLevel: 50 });
    });

    it('per-test generation leaf overrides the same suite leaf', () => {
        const suite = { generation: { temperature: 0, effortLevel: 10 } };
        const perTest: ComputerUseTestConfig = { generation: { temperature: 0.7 } };
        const merged = mergeComputerUseConfig(suite, perTest);
        expect(merged.generation).toEqual({ temperature: 0.7, effortLevel: 10 });
    });

    it('deep-merges appProfile one level', () => {
        const suite = { appProfile: { readinessBeacon: '[data-mj-ready="true"]' } };
        const perTest: ComputerUseTestConfig = { appProfile: { busyMarkers: ['.spinner'] } };
        const merged = mergeComputerUseConfig(suite, perTest);
        expect(merged.appProfile).toEqual({
            readinessBeacon: '[data-mj-ready="true"]',
            busyMarkers: ['.spinner'],
        });
    });

    it('an empty suite block leaves the per-test config unchanged', () => {
        const perTest: ComputerUseTestConfig = { elementGrounding: true, maxSteps: 30 };
        expect(mergeComputerUseConfig({}, perTest)).toEqual(perTest);
    });

    it('does not fabricate generation/appProfile when neither side sets them', () => {
        const merged = mergeComputerUseConfig({ headless: true }, { maxSteps: 30 });
        expect('generation' in merged).toBe(false);
        expect('appProfile' in merged).toBe(false);
    });
});
