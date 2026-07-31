import { describe, it, expect } from 'vitest';
import {
    resolveConsoleLogLevel,
    shouldLogToConsole,
    testTag,
    formatConsoleLine,
    DEFAULT_CONSOLE_LOG_LEVEL,
} from '../test-driver/log-importance.js';

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
        'Step 9 — skipping judge: visible state unchanged since last judged step (CU-G5)',
        'Browser closed',
    ];
    const milestones = [
        'Tier: replay-with-heal — app build hash differs',
        'Step 6 — controller reached checkpoint "ai-agents"; forcing scoped judge (CU-D8)',
        'Step 12 — all 7 checkpoints reached; completing (CU-D8)',
        'Step 9 — judge verdict: Done=false, Impossible=false, Confidence=0.5, Reason: 3/5 criteria met',
        'Replay — all 4 goal postconditions met (CU-C5)',
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
