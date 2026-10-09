import { describe, it, expect } from 'vitest';
import { ChartIssueLog } from '../issue-log';
import { ResolveAspectRatioInput, ResolveHeightInput } from '../inputs';

/** A log whose sink records messages, so each case can assert how many times it logged. */
function CreateLog(): { Log: ChartIssueLog; Messages: string[] } {
    const Messages: string[] = [];
    return { Log: new ChartIssueLog((m) => Messages.push(m)), Messages };
}
/** Simulates a template string attribute (`Height="250"`), which TypeScript would otherwise reject. */
const asString = (v: string): number => v as unknown as number;

describe('ResolveHeightInput', () => {
    it.each<[string, number | 'fill' | null | undefined, number | 'fill', number]>([
        ['a number in range', 250, 250, 0],
        ['exactly the minimum', 120, 120, 0],
        ['below the minimum', 50, 120, 1],
        ['NaN', Number.NaN, 120, 1],
        ['null (unset binding)', null, 300, 0],
        ['undefined (unset binding)', undefined, 300, 0],
        ["'fill'", 'fill', 'fill', 0],
        ['a string attribute "250"', asString('250'), 120, 1],
    ])('%s', (_name, input, expected, logs) => {
        const { Log, Messages } = CreateLog();
        expect(ResolveHeightInput(input, Log, 'ctx')).toBe(expected);
        expect(Messages).toHaveLength(logs);
        if (logs > 0) {
            expect(Messages[0]).toContain('Height');
        }
    });

    it('logs a repeated bad value once', () => {
        const { Log, Messages } = CreateLog();
        ResolveHeightInput(50, Log, 'ctx');
        ResolveHeightInput(60, Log, 'ctx');
        expect(Messages).toHaveLength(1);
    });
});

describe('ResolveAspectRatioInput', () => {
    it.each<[string, number | null | undefined, number | null, number]>([
        ['a ratio in range', 16 / 9, 16 / 9, 0],
        ['exactly the minimum', 0.25, 0.25, 0],
        ['exactly the maximum', 8, 8, 0],
        ['above the maximum', 100, 8, 1],
        ['below the minimum', 0.01, 0.25, 1],
        ['zero', 0, null, 1],
        ['negative', -1, null, 1],
        ['NaN', Number.NaN, null, 1],
        ['Infinity', Infinity, null, 1],
        ['null (unset binding)', null, null, 0],
        ['undefined (unset binding)', undefined, null, 0],
        ['a string attribute "1.5"', asString('1.5'), null, 1],
    ])('%s', (_name, input, expected, logs) => {
        const { Log, Messages } = CreateLog();
        expect(ResolveAspectRatioInput(input, Log, 'ctx')).toBe(expected);
        expect(Messages).toHaveLength(logs);
        if (logs > 0) {
            expect(Messages[0]).toContain('AspectRatio');
        }
    });

    it('the invalid-value message points at the binding form', () => {
        const { Log, Messages } = CreateLog();
        ResolveAspectRatioInput(-1, Log, 'ctx');
        expect(Messages[0]).toContain('[AspectRatio]="16 / 9"');
    });

    it('logs repeated invalid values once', () => {
        const { Log, Messages } = CreateLog();
        ResolveAspectRatioInput(-1, Log, 'ctx');
        ResolveAspectRatioInput(Number.NaN, Log, 'ctx');
        expect(Messages).toHaveLength(1);
    });
});
