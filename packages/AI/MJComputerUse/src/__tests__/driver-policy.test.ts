import { describe, expect, it } from 'vitest';
import {
    DEFAULT_CONSOLE_LOG_LEVEL,
    FailureSignals,
    ClassifyFailure,
    ComputeDivergence,
    FormatConsoleLine,
    IsOracleAdvisory,
    IsSevereBrowserFault,
    MergeComputerUseConfig,
    PartitionGatingOracles,
    RecordsReplayScript,
    ResolveReplayHeal,
    ReadSuiteComputerUseConfig,
    ResolveConsoleLogLevel,
    ShouldCaptureArtifact,
    ShouldLogToConsole,
    ShouldRetainArtifact,
    TestTag,
    UsesElementGrounding,
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
            expect(IsOracleAdvisory('step-count')).toBe(true);
        });

        it('defaults other oracle types to gating', () => {
            expect(IsOracleAdvisory('goal-completion')).toBe(false);
            expect(IsOracleAdvisory('url-match')).toBe(false);
        });

        it('lets an explicit config value override the type default', () => {
            // Force step-count to gate…
            expect(IsOracleAdvisory('step-count', false)).toBe(false);
            // …and force a normally-gating oracle to advisory.
            expect(IsOracleAdvisory('goal-completion', true)).toBe(true);
        });
    });

    describe('partitionGatingOracles', () => {
        it('excludes advisory results from the gating set', () => {
            const results = [
                res('goal-completion', true),
                res('step-count', false, true),
                res('url-match', true, false),
            ];
            const gating = PartitionGatingOracles(results);
            expect(gating.map(r => r.oracleType)).toEqual(['goal-completion', 'url-match']);
        });

        it('treats a missing advisory flag as gating', () => {
            const results = [res('goal-completion', true)];
            expect(PartitionGatingOracles(results)).toHaveLength(1);
        });

        it('returns empty when every oracle is advisory (caller falls back)', () => {
            const results = [res('step-count', false, true)];
            expect(PartitionGatingOracles(results)).toHaveLength(0);
        });

        it('a failing advisory oracle does not appear among gating results', () => {
            // The scenario this fixes: step-count "fails" but must not gate.
            const results = [res('goal-completion', true), res('step-count', false, true)];
            const gating = PartitionGatingOracles(results);
            expect(gating.every(r => r.passed)).toBe(true);
        });
    });
});

describe('shouldCaptureArtifact', () => {
    it('captures for retain-on-failure and on', () => {
        expect(ShouldCaptureArtifact('retain-on-failure')).toBe(true);
        expect(ShouldCaptureArtifact('on')).toBe(true);
    });

    it('does not capture for off (zero overhead)', () => {
        expect(ShouldCaptureArtifact('off')).toBe(false);
    });
});

describe('shouldRetainArtifact', () => {
    it('on: keeps regardless of outcome', () => {
        expect(ShouldRetainArtifact('on', true)).toBe(true);
        expect(ShouldRetainArtifact('on', false)).toBe(true);
    });

    it('retain-on-failure: keeps only when the test failed', () => {
        expect(ShouldRetainArtifact('retain-on-failure', false)).toBe(true);
        expect(ShouldRetainArtifact('retain-on-failure', true)).toBe(false);
    });

    it('off: never keeps', () => {
        expect(ShouldRetainArtifact('off', true)).toBe(false);
        expect(ShouldRetainArtifact('off', false)).toBe(false);
    });
});

describe('computeDivergence', () => {
    it('all three agreeing (done) is unanimous', () => {
        const r = ComputeDivergence({ SelfReportDone: true, JudgeDone: true, OraclesPassed: true });
        expect(r.SelfVsJudgeAgree).toBe(true);
        expect(r.JudgeVsOracleAgree).toBe(true);
        expect(r.SelfVsOracleAgree).toBe(true);
        expect(r.Unanimous).toBe(true);
    });

    it('all three agreeing (not done) is unanimous', () => {
        const r = ComputeDivergence({ SelfReportDone: false, JudgeDone: false, OraclesPassed: false });
        expect(r.Unanimous).toBe(true);
    });

    it('detects self-report inflation vs judge/oracle (the field failure mode)', () => {
        const r = ComputeDivergence({ SelfReportDone: true, JudgeDone: false, OraclesPassed: false });
        expect(r.SelfVsJudgeAgree).toBe(false);
        expect(r.SelfVsOracleAgree).toBe(false);
        expect(r.JudgeVsOracleAgree).toBe(true); // judge and oracle still agree with each other
        expect(r.Unanimous).toBe(false);
    });

    it('detects judge-vs-oracle disagreement (the judge-error signal)', () => {
        const r = ComputeDivergence({ SelfReportDone: true, JudgeDone: true, OraclesPassed: false });
        expect(r.SelfVsJudgeAgree).toBe(true);
        expect(r.JudgeVsOracleAgree).toBe(false);
        expect(r.Unanimous).toBe(false);
    });
});

describe('resolveConsoleLogLevel', () => {
    it('accepts the three levels, case/space tolerant', () => {
        expect(ResolveConsoleLogLevel('quiet')).toBe('quiet');
        expect(ResolveConsoleLogLevel(' VERBOSE ')).toBe('verbose');
        expect(ResolveConsoleLogLevel('Normal')).toBe('normal');
    });

    it('falls back to the default on unset/invalid — a bad env value must not change behavior', () => {
        expect(ResolveConsoleLogLevel(undefined)).toBe(DEFAULT_CONSOLE_LOG_LEVEL);
        expect(ResolveConsoleLogLevel('')).toBe(DEFAULT_CONSOLE_LOG_LEVEL);
        expect(ResolveConsoleLogLevel('loud')).toBe(DEFAULT_CONSOLE_LOG_LEVEL);
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
            expect(ShouldLogToConsole('info', m, 'normal'), m).toBe(false);
        }
    });

    it('shows every milestone at normal AND quiet', () => {
        for (const m of milestones) {
            expect(ShouldLogToConsole('info', m, 'normal'), m).toBe(true);
            expect(ShouldLogToConsole('info', m, 'quiet'), m).toBe(true);
        }
    });

    it('shows everything at verbose — including chatter', () => {
        for (const m of [...chatter, ...milestones]) {
            expect(ShouldLogToConsole('info', m, 'verbose'), m).toBe(true);
        }
    });

    it('ALWAYS shows warn/error, at every level', () => {
        for (const lvl of ['quiet', 'normal', 'verbose'] as const) {
            expect(ShouldLogToConsole('error', 'ERROR: step failed — timeout', lvl)).toBe(true);
            expect(ShouldLogToConsole('warn', 'WARNING: checkpoint "x" declares no assertions', lvl)).toBe(true);
            // even a chatter-shaped message is shown when it is a warn/error
            expect(ShouldLogToConsole('error', 'AIPromptRunner raw response (first 1000 chars): boom', lvl)).toBe(true);
        }
    });

    it('keeps `debug` verbose-only, preserving the base driver contract', () => {
        expect(ShouldLogToConsole('debug', 'internal detail', 'quiet')).toBe(false);
        expect(ShouldLogToConsole('debug', 'internal detail', 'normal')).toBe(false);
        expect(ShouldLogToConsole('debug', 'internal detail', 'verbose')).toBe(true);
        // a milestone-shaped debug message stays verbose-only — level wins
        expect(ShouldLogToConsole('debug', 'Tier: llm', 'normal')).toBe(false);
    });

    it('shows UNRECOGNIZED info at normal — novel messages are never silently dropped', () => {
        expect(ShouldLogToConsole('info', 'Some brand-new engine message nobody classified', 'normal')).toBe(true);
        // ...but quiet is milestone-only by definition
        expect(ShouldLogToConsole('info', 'Some brand-new engine message nobody classified', 'quiet')).toBe(false);
    });
});

describe('testTag / formatConsoleLine', () => {
    it('extracts the T-number so interleaved worker output is attributable', () => {
        expect(TestTag('T045 - Query Left-Panel Navigation')).toBe('T045');
        expect(TestTag('T001 - Login Smoke')).toBe('T001');
    });

    it('degrades gracefully for non-T names', () => {
        expect(TestTag(undefined)).toBe('?');
        expect(TestTag('')).toBe('?');
        expect(TestTag('Some Custom Test Name')).toBe('Some Custom');
    });

    it('prefixes the line with the tag', () => {
        expect(FormatConsoleLine('T045 - Query Left-Panel Navigation', 'Tier: llm'))
            .toBe('[T045] Tier: llm');
    });
});

function sig(overrides: Partial<FailureSignals> = {}): FailureSignals {
    return {
        status: 'Failed',
        FailureReason: undefined,
        HasCrash: false,
        HasAppError: false,
        SettleBudgetExhausted: false,
        TailHashStable: false,
        BeaconConfigured: false,
        BeaconEverReady: false,
        OraclesFailed: false,
        ...overrides,
    };
}

describe('classifyFailure', () => {
    it('returns null for a completed run', () => {
        expect(ClassifyFailure(sig({ status: 'Completed' }))).toBeNull();
    });

    it('classifies a crash / engine error as infra (highest precedence)', () => {
        expect(ClassifyFailure(sig({ HasCrash: true }))).toBe('infra');
        expect(ClassifyFailure(sig({ status: 'Error' }))).toBe('infra');
    });

    it('explicit engine terminal verdicts outrank incidental app-error noise (Jul-22 fix)', () => {
        // A flaky agent loop/timeout/cancel/impossible that ALSO logged a severe app
        // fault must classify by the ENGINE's verdict — not be masked as the zero-retry
        // `app-error`, which turned these into hard failures and cratered the pass rate.
        expect(ClassifyFailure(sig({ HasAppError: true, FailureReason: 'LoopDetected' }))).toBe('loop-detected');
        expect(ClassifyFailure(sig({ HasAppError: true, status: 'TimeBudgetExceeded', TailHashStable: false }))).toBe('timeout-progressing');
        expect(ClassifyFailure(sig({ HasAppError: true, status: 'Cancelled' }))).toBe('cancelled');
        expect(ClassifyFailure(sig({ HasAppError: true, status: 'Impossible' }))).toBe('impossible');
    });

    it('app-error still outranks the softer symptom heuristics (stuck-page / judge / assertion)', () => {
        // With no more-specific engine verdict, a severe app fault is the better
        // explanation than "the page looked stuck" or "the judge disagreed".
        expect(ClassifyFailure(sig({ status: 'Failed', HasAppError: true, SettleBudgetExhausted: true, TailHashStable: true }))).toBe('app-error');
        expect(ClassifyFailure(sig({ status: 'Failed', HasAppError: true, OraclesFailed: true }))).toBe('app-error');
    });

    it('infra still outranks app-error and auth-detour', () => {
        expect(ClassifyFailure(sig({ HasCrash: true, HasAppError: true }))).toBe('infra');
    });

    it('auth-detour outranks app-error', () => {
        // The detour is the root cause; its own failed auth requests are the symptom.
        expect(ClassifyFailure(sig({ FailureReason: 'AuthDetour', HasAppError: true }))).toBe('auth-detour');
    });

    it('classifies an engine loop terminate as loop-detected', () => {
        expect(ClassifyFailure(sig({ status: 'Failed', FailureReason: 'LoopDetected' }))).toBe('loop-detected');
    });

    it('classifies an auth-detour terminate as auth-detour, outranking its own 401 app-errors', () => {
        // The 401s that caused the detour also set hasAppError — auth-detour is the root cause and wins.
        expect(ClassifyFailure(sig({ status: 'Failed', FailureReason: 'AuthDetour' }))).toBe('auth-detour');
        expect(ClassifyFailure(sig({ status: 'Failed', FailureReason: 'AuthDetour', HasAppError: true }))).toBe('auth-detour');
    });

    it('infra still outranks auth-detour', () => {
        expect(ClassifyFailure(sig({ HasCrash: true, FailureReason: 'AuthDetour' }))).toBe('infra');
    });

    it('classifies cancellation and impossibility', () => {
        expect(ClassifyFailure(sig({ status: 'Cancelled' }))).toBe('cancelled');
        expect(ClassifyFailure(sig({ status: 'Impossible' }))).toBe('impossible');
    });

    it('splits time-budget by hash trajectory', () => {
        expect(ClassifyFailure(sig({ status: 'TimeBudgetExceeded', TailHashStable: true }))).toBe('timeout-stuck');
        expect(ClassifyFailure(sig({ status: 'TimeBudgetExceeded', TailHashStable: false }))).toBe('timeout-progressing');
    });

    it('classifies a frozen unsettled page as stuck-page', () => {
        expect(ClassifyFailure(sig({ status: 'MaxStepsReached', SettleBudgetExhausted: true, TailHashStable: true }))).toBe('stuck-page');
    });

    it('classifies a never-ready beacon as env-stall', () => {
        expect(ClassifyFailure(sig({ status: 'MaxStepsReached', BeaconConfigured: true, BeaconEverReady: false }))).toBe('env-stall');
    });

    it('does not call env-stall when the beacon did fire', () => {
        // Beacon fired → not env-stall; falls through to assertion when oracles failed.
        expect(ClassifyFailure(sig({ status: 'MaxStepsReached', BeaconConfigured: true, BeaconEverReady: true, OraclesFailed: true }))).toBe('assertion');
    });

    it('classifies an engine Failed terminate as judge-disagreement', () => {
        expect(ClassifyFailure(sig({ status: 'Failed' }))).toBe('judge-disagreement');
    });

    it('classifies a clean run with failed oracles as assertion', () => {
        expect(ClassifyFailure(sig({ status: 'MaxStepsReached', OraclesFailed: true }))).toBe('assertion');
    });

    it('falls back to unknown when no signal matches', () => {
        expect(ClassifyFailure(sig({ status: 'MaxStepsReached' }))).toBe('unknown');
    });
});

describe('isSevereBrowserFault (hasAppError tightening — Jul-22 fix)', () => {
    const diag = (o: Partial<BrowserDiagnosticEvent>): BrowserDiagnosticEvent =>
        ({ timestamp: '', type: 'console', message: '', ...o });

    it('counts an uncaught page exception', () => {
        expect(IsSevereBrowserFault(diag({ type: 'pageerror', message: 'TypeError: x is undefined' }))).toBe(true);
    });

    it('counts a genuine (non-aborted) request failure', () => {
        expect(IsSevereBrowserFault(diag({ type: 'requestfailed', message: 'GET https://api/x — net::ERR_CONNECTION_REFUSED' }))).toBe(true);
    });

    it('ignores navigation-aborted / cancelled requests (routine SPA churn)', () => {
        expect(IsSevereBrowserFault(diag({ type: 'requestfailed', message: 'GET https://api/x — net::ERR_ABORTED' }))).toBe(false);
        expect(IsSevereBrowserFault(diag({ type: 'requestfailed', message: 'GET https://api/x — NS_BINDING_ABORTED' }))).toBe(false);
        expect(IsSevereBrowserFault(diag({ type: 'requestfailed', message: 'GET https://api/x — net::ERR_CANCELED' }))).toBe(false);
    });

    it('ignores console errors (too noisy to imply a deterministic fault)', () => {
        expect(IsSevereBrowserFault(diag({ type: 'console', level: 'error', message: 'a component logged an error' }))).toBe(false);
    });

    it('ignores non-fault diagnostics (warnings, crash — crash is handled as infra upstream)', () => {
        expect(IsSevereBrowserFault(diag({ type: 'console', level: 'warning', message: 'heads up' }))).toBe(false);
        expect(IsSevereBrowserFault(diag({ type: 'crash', message: 'Page crashed' }))).toBe(false);
    });
});

describe('readSuiteComputerUseConfig', () => {
    it('returns the block when suiteContext.computerUse is a plain object', () => {
        const block = { elementGrounding: true, generation: { temperature: 0 } };
        expect(ReadSuiteComputerUseConfig({ computerUse: block })).toEqual(block);
    });

    it('returns undefined when there is no suite context', () => {
        expect(ReadSuiteComputerUseConfig(undefined)).toBeUndefined();
    });

    it('returns undefined when the suite has no computerUse block', () => {
        expect(ReadSuiteComputerUseConfig({ applicationContext: 'ctx' })).toBeUndefined();
    });

    it('ignores a malformed block (null / array / primitive) rather than throwing', () => {
        expect(ReadSuiteComputerUseConfig({ computerUse: null })).toBeUndefined();
        expect(ReadSuiteComputerUseConfig({ computerUse: [1, 2] })).toBeUndefined();
        expect(ReadSuiteComputerUseConfig({ computerUse: 'grounding' })).toBeUndefined();
        expect(ReadSuiteComputerUseConfig({ computerUse: 42 })).toBeUndefined();
    });
});

describe('mergeComputerUseConfig (/ D7 precedence)', () => {
    it('per-test top-level keys win over the suite block', () => {
        const suite = { elementGrounding: true, headless: true };
        const perTest: ComputerUseTestConfig = { elementGrounding: false };
        const merged = MergeComputerUseConfig(suite, perTest);
        expect(merged.elementGrounding).toBe(false); // per-test wins
        expect(merged.headless).toBe(true);          // suite fills the gap
    });

    it('applies suite defaults for keys the test does not set', () => {
        const suite = { trace: 'retain-on-failure' as const, elementGrounding: true };
        const perTest: ComputerUseTestConfig = { maxSteps: 40 };
        const merged = MergeComputerUseConfig(suite, perTest);
        expect(merged).toMatchObject({ trace: 'retain-on-failure', elementGrounding: true, maxSteps: 40 });
    });

    it('deep-merges generation so distinct leaves from both survive', () => {
        const suite = { generation: { temperature: 0 } };
        const perTest: ComputerUseTestConfig = { generation: { effortLevel: 50 } };
        const merged = MergeComputerUseConfig(suite, perTest);
        expect(merged.generation).toEqual({ temperature: 0, effortLevel: 50 });
    });

    it('per-test generation leaf overrides the same suite leaf', () => {
        const suite = { generation: { temperature: 0, effortLevel: 10 } };
        const perTest: ComputerUseTestConfig = { generation: { temperature: 0.7 } };
        const merged = MergeComputerUseConfig(suite, perTest);
        expect(merged.generation).toEqual({ temperature: 0.7, effortLevel: 10 });
    });

    it('deep-merges appProfile one level', () => {
        const suite = { appProfile: { readinessBeacon: '[data-mj-ready="true"]' } };
        const perTest: ComputerUseTestConfig = { appProfile: { busyMarkers: ['.spinner'] } };
        const merged = MergeComputerUseConfig(suite, perTest);
        expect(merged.appProfile).toEqual({
            readinessBeacon: '[data-mj-ready="true"]',
            busyMarkers: ['.spinner'],
        });
    });

    it('an empty suite block leaves the per-test config unchanged', () => {
        const perTest: ComputerUseTestConfig = { elementGrounding: true, maxSteps: 30 };
        expect(MergeComputerUseConfig({}, perTest)).toEqual(perTest);
    });

    it('does not fabricate generation/appProfile when neither side sets them', () => {
        const merged = MergeComputerUseConfig({ headless: true }, { maxSteps: 30 });
        expect('generation' in merged).toBe(false);
        expect('appProfile' in merged).toBe(false);
    });
});

describe('usesElementGrounding', () => {
    it('is ON when the test says nothing — a coordinate click can neither be recorded nor replayed', () => {
        expect(UsesElementGrounding({})).toBe(true);
    });

    it('honours an explicit opt-out', () => {
        expect(UsesElementGrounding({ elementGrounding: false })).toBe(false);
    });

    it('honours an explicit opt-in', () => {
        expect(UsesElementGrounding({ elementGrounding: true })).toBe(true);
    });
});

describe('recordsReplayScript', () => {
    it('is ON when the test says nothing, so a green run seeds its own script', () => {
        expect(RecordsReplayScript({})).toBe(true);
    });

    it('honours an explicit opt-out', () => {
        expect(RecordsReplayScript({ recordReplayScript: false })).toBe(false);
    });

    it('honours an explicit opt-in', () => {
        expect(RecordsReplayScript({ recordReplayScript: true })).toBe(true);
    });

    it('is independent of elementGrounding — a grounded run can still refuse to store', () => {
        expect(RecordsReplayScript({ elementGrounding: true, recordReplayScript: false })).toBe(false);
        expect(UsesElementGrounding({ elementGrounding: true, recordReplayScript: false })).toBe(true);
    });
});

describe('resolveReplayHeal', () => {
    it("defaults to 'llm' — the full ladder while a script is still earning trust", () => {
        expect(ResolveReplayHeal({})).toBe('llm');
    });

    it('honours each explicit policy', () => {
        expect(ResolveReplayHeal({ replayHeal: 'off' })).toBe('off');
        expect(ResolveReplayHeal({ replayHeal: 'deterministic' })).toBe('deterministic');
        expect(ResolveReplayHeal({ replayHeal: 'llm' })).toBe('llm');
    });

    it('is independent of the LLM fallback flag, which the framework owns', () => {
        expect(ResolveReplayHeal({ replayHeal: 'off', elementGrounding: true })).toBe('off');
    });
});
