import { describe, it, expect } from 'vitest';
import {
    FINISH_IF_MODE_WARNING_SHOWN_MAX,
    FINISH_IF_MODE_WARNINGS_REMEMBERED,
    FinishIfModeWarnings,
    ShowFinishIfModeValue,
} from '../finish-if-mode-warnings';

const AGENT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const OTHER_AGENT_ID = 'aaaaaaaa-0000-4000-8000-000000000002';

describe('FinishIfModeWarnings', () => {
    describe('WarningFor', () => {
        it('warns once per agent and value, and again for another value or another agent', () => {
            const warnings = new FinishIfModeWarnings();

            const first = warnings.WarningFor(AGENT_ID, 'Agent A', 'On');
            expect(first).toBe("Agent 'Agent A' has finishIfMode \"On\", which is not one of 'off', 'shadow', 'on', so its finishIf gates are off. Mode names are case-sensitive.");
            expect(warnings.WarningFor(AGENT_ID, 'Agent A', 'On')).toBeUndefined();
            expect(warnings.WarningFor(AGENT_ID, 'Agent A', 'true')).toContain('finishIfMode "true"');
            expect(warnings.WarningFor(OTHER_AGENT_ID, 'Agent B', 'On')).toContain("Agent 'Agent B'");
            expect(warnings.Remembered).toBe(3);
        });

        it.each([
            ['absent', undefined],
            ['null', null],
            ['off', 'off'],
            ['shadow', 'shadow'],
            ['on', 'on'],
        ])('does not warn, or remember anything, for a value that is %s', (_label, value) => {
            const warnings = new FinishIfModeWarnings();

            expect(warnings.WarningFor(AGENT_ID, 'Agent A', value)).toBeUndefined();
            expect(warnings.Remembered).toBe(0);
        });
    });

    describe('what it logs', () => {
        it('shows a string in quotes and anything else as JSON, so "true" and true read differently', () => {
            expect(ShowFinishIfModeValue('true')).toBe('"true"');
            expect(ShowFinishIfModeValue(true)).toBe('true');
            expect(ShowFinishIfModeValue({ mode: 'on' })).toBe('{"mode":"on"}');
        });

        it(`shows at most ${FINISH_IF_MODE_WARNING_SHOWN_MAX} characters of a huge string, and notes its length`, () => {
            const huge = 'x'.repeat(1_000_000);

            const warning = new FinishIfModeWarnings().WarningFor(AGENT_ID, 'Agent A', huge);

            expect(warning).toContain(`finishIfMode "${'x'.repeat(FINISH_IF_MODE_WARNING_SHOWN_MAX)}"… (1000000 characters)`);
            expect(warning).not.toContain('x'.repeat(FINISH_IF_MODE_WARNING_SHOWN_MAX + 1));
            expect(warning?.length).toBeLessThan(400);
        });

        it('cuts a huge non-string value the same way', () => {
            const huge = Array.from({ length: 100_000 }, (_, i) => i);

            const shown = ShowFinishIfModeValue(huge);

            expect(shown.startsWith(JSON.stringify(huge).slice(0, FINISH_IF_MODE_WARNING_SHOWN_MAX))).toBe(true);
            expect(shown).toContain(`… (${JSON.stringify(huge).length} characters as JSON)`);
            expect(shown.length).toBeLessThan(FINISH_IF_MODE_WARNING_SHOWN_MAX + 50);
        });

        it('leaves a value no longer than the limit whole', () => {
            const atLimit = 'y'.repeat(FINISH_IF_MODE_WARNING_SHOWN_MAX);

            expect(ShowFinishIfModeValue(atLimit)).toBe(JSON.stringify(atLimit));
        });
    });

    describe('what it remembers', () => {
        it('remembers a huge value as one pair, and two huge values that read the same as the same pair', () => {
            const warnings = new FinishIfModeWarnings();
            const prefix = 'z'.repeat(FINISH_IF_MODE_WARNING_SHOWN_MAX);

            expect(warnings.WarningFor(AGENT_ID, 'Agent A', `${prefix}${'a'.repeat(500_000)}`)).toBeDefined();
            // Same first characters and same length: the warning would read the same, so it is not repeated.
            expect(warnings.WarningFor(AGENT_ID, 'Agent A', `${prefix}${'b'.repeat(500_000)}`)).toBeUndefined();
            expect(warnings.Remembered).toBe(1);
        });

        it('never remembers more than its cap, however many values arrive', () => {
            const warnings = new FinishIfModeWarnings(5);
            let warned = 0;

            for (let i = 0; i < 50; i++) {
                if (warnings.WarningFor(AGENT_ID, 'Agent A', `mode-${i}`)) {
                    warned++;
                }
                expect(warnings.Remembered).toBeLessThanOrEqual(5);
            }

            expect(warned).toBe(50);
            expect(warnings.Remembered).toBe(5);
            expect(warnings.MaxRemembered).toBe(5);
        });

        it('drops the pair seen least recently first, so a value an agent keeps sending stays reported', () => {
            const warnings = new FinishIfModeWarnings(3);
            for (const value of ['a', 'b', 'c']) {
                warnings.WarningFor(AGENT_ID, 'Agent A', value);
            }

            // 'a' is seen again, so 'b' is now the one seen least recently, and 'd' pushes it out.
            expect(warnings.WarningFor(AGENT_ID, 'Agent A', 'a')).toBeUndefined();
            expect(warnings.WarningFor(AGENT_ID, 'Agent A', 'd')).toBeDefined();

            expect(warnings.WarningFor(AGENT_ID, 'Agent A', 'a')).toBeUndefined();
            expect(warnings.WarningFor(AGENT_ID, 'Agent A', 'b')).toBeDefined();
            expect(warnings.Remembered).toBe(3);
        });

        it(`caps at FINISH_IF_MODE_WARNINGS_REMEMBERED (${FINISH_IF_MODE_WARNINGS_REMEMBERED}) by default`, () => {
            const warnings = new FinishIfModeWarnings();

            for (let i = 0; i < FINISH_IF_MODE_WARNINGS_REMEMBERED + 500; i++) {
                warnings.WarningFor(AGENT_ID, 'Agent A', `mode-${i}`);
            }

            expect(FINISH_IF_MODE_WARNINGS_REMEMBERED).toBe(1000);
            expect(warnings.MaxRemembered).toBe(FINISH_IF_MODE_WARNINGS_REMEMBERED);
            expect(warnings.Remembered).toBe(FINISH_IF_MODE_WARNINGS_REMEMBERED);
        });
    });
});
