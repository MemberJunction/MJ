import { describe, it, expect, vi } from 'vitest';
import { ChartIssueLog } from '../issue-log';
import { ChartContext, LogMissingAriaLabel, LogSoftCap, ResolveFills } from '../prepare-helpers';

const newLog = () => {
    const sink = vi.fn();
    return { sink, log: new ChartIssueLog(sink) };
};

describe('ChartContext', () => {
    it('quotes the aria label', () => {
        expect(ChartContext('bar', 'Score bands')).toBe('bar chart "Score bands"');
    });
    it('falls back to "Chart" for an empty label', () => {
        expect(ChartContext('area', '')).toBe('area chart "Chart"');
    });
});

describe('ResolveFills', () => {
    it('keeps token colors and defaults the rest by index without logging', () => {
        const { sink, log } = newLog();
        const fills = ResolveFills([{ Color: 'var(--mj-status-error)' }, {}], (i) => `S${i}`, 'series', log, 'ctx');
        expect(fills).toEqual(['var(--mj-status-error)', 'var(--mj-viz-2)']);
        expect(sink).not.toHaveBeenCalled();
    });

    it('logs a rejected color once with the kind and name, and falls back to the viz token', () => {
        const { sink, log } = newLog();
        const items = [{ Color: '#16a34a' }];
        expect(ResolveFills(items, () => 'Healthy', 'series', log, 'bar chart "X"')).toEqual(['var(--mj-viz-1)']);
        ResolveFills(items, () => 'Healthy', 'series', log, 'bar chart "X"');
        expect(sink).toHaveBeenCalledTimes(1);
        expect(sink).toHaveBeenCalledWith('bar chart "X": series "Healthy" Color "#16a34a" is not a var(--token); using var(--mj-viz-1).');
    });

    it('uses the slice wording for slices', () => {
        const { sink, log } = newLog();
        ResolveFills([{ Color: 'red' }], () => 'Open', 'slice', log, 'ctx');
        expect(sink.mock.calls[0][0]).toContain('slice "Open"');
    });
});

describe('LogMissingAriaLabel', () => {
    it('logs once for an empty label and never for a set one', () => {
        const { sink, log } = newLog();
        LogMissingAriaLabel('Sales', log, 'ctx');
        expect(sink).not.toHaveBeenCalled();
        LogMissingAriaLabel('', log, 'ctx');
        LogMissingAriaLabel('', log, 'ctx');
        expect(sink).toHaveBeenCalledTimes(1);
        expect(sink).toHaveBeenCalledWith('ctx: AriaLabel is missing; screen readers will announce "Chart".');
    });
});

describe('LogSoftCap', () => {
    it('logs the caller detail once when exceeded and nothing otherwise', () => {
        const { sink, log } = newLog();
        LogSoftCap(false, 'too big', log, 'ctx');
        expect(sink).not.toHaveBeenCalled();
        LogSoftCap(true, 'too big', log, 'ctx');
        LogSoftCap(true, 'too big', log, 'ctx');
        expect(sink).toHaveBeenCalledTimes(1);
        expect(sink).toHaveBeenCalledWith('ctx: too big');
    });
});
