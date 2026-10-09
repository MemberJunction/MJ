import { describe, it, expect, vi } from 'vitest';
import { ChartIssueLog } from '../issue-log';
import { ClampInput } from '../inputs';

describe('ChartIssueLog.Once', () => {
    it('logs a key only the first time', () => {
        const sink = vi.fn();
        const log = new ChartIssueLog(sink);
        expect(log.Once('aria', 'missing label')).toBe(true);
        expect(log.Once('aria', 'missing label')).toBe(false);
        expect(sink).toHaveBeenCalledTimes(1);
        expect(sink).toHaveBeenCalledWith('missing label');
    });
});

describe('ChartIssueLog.ReportStatus', () => {
    const invalid = { Kind: 'invalid', Code: 'length-mismatch', Detail: 'series "A" has 1 values for 2 categories' } as const;

    it('logs an invalid status once, then stays quiet while it is unchanged', () => {
        const sink = vi.fn();
        const log = new ChartIssueLog(sink);
        expect(log.ReportStatus(invalid, 'bar chart "Sales"')).toBe(true);
        expect(log.ReportStatus(invalid, 'bar chart "Sales"')).toBe(false);
        expect(sink).toHaveBeenCalledTimes(1);
        expect(sink.mock.calls[0][0]).toContain('bar chart "Sales"');
        expect(sink.mock.calls[0][0]).toContain('length-mismatch');
    });

    it('logs again after the data became valid and then broke again', () => {
        const sink = vi.fn();
        const log = new ChartIssueLog(sink);
        log.ReportStatus(invalid, 'c');
        log.ReportStatus({ Kind: 'ok' }, 'c');
        log.ReportStatus(invalid, 'c');
        expect(sink).toHaveBeenCalledTimes(2);
    });

    it('never logs ok or empty', () => {
        const sink = vi.fn();
        const log = new ChartIssueLog(sink);
        log.ReportStatus({ Kind: 'ok' }, 'c');
        log.ReportStatus({ Kind: 'empty' }, 'c');
        expect(sink).not.toHaveBeenCalled();
    });
});

describe('ClampInput', () => {
    it('passes in-range values through without logging', () => {
        const sink = vi.fn();
        expect(ClampInput('Height', 300, 120, Infinity, new ChartIssueLog(sink), 'c')).toBe(300);
        expect(sink).not.toHaveBeenCalled();
    });

    it('clamps out-of-range values and logs once per input name', () => {
        const sink = vi.fn();
        const log = new ChartIssueLog(sink);
        expect(ClampInput('InnerRadiusRatio', 5, 0, 0.85, log, 'donut chart "Mix"')).toBe(0.85);
        expect(ClampInput('InnerRadiusRatio', 7, 0, 0.85, log, 'donut chart "Mix"')).toBe(0.85);
        expect(sink).toHaveBeenCalledTimes(1);
        expect(sink.mock.calls[0][0]).toContain('InnerRadiusRatio');
    });

    it('replaces a non-finite value with the minimum and logs', () => {
        const sink = vi.fn();
        expect(ClampInput('Height', Number.NaN, 120, Infinity, new ChartIssueLog(sink), 'c')).toBe(120);
        expect(sink).toHaveBeenCalledTimes(1);
    });

    it('sends +Infinity to the maximum when it is finite (FillOpacity Infinity is opaque, not transparent)', () => {
        const sink = vi.fn();
        expect(ClampInput('FillOpacity', Infinity, 0, 1, new ChartIssueLog(sink), 'c')).toBe(1);
        expect(sink).toHaveBeenCalledTimes(1);
    });

    it('sends +Infinity to the minimum when there is no finite maximum', () => {
        expect(ClampInput('Height', Infinity, 120, Infinity, new ChartIssueLog(vi.fn()), 'c')).toBe(120);
    });

    it('sends -Infinity and NaN to the minimum', () => {
        const log = new ChartIssueLog(vi.fn());
        expect(ClampInput('FillOpacity', -Infinity, 0, 1, log, 'c')).toBe(0);
        expect(ClampInput('FillOpacity', Number.NaN, 0, 1, log, 'c')).toBe(0);
    });

    it('logs a non-finite value once per input name', () => {
        const sink = vi.fn();
        const log = new ChartIssueLog(sink);
        ClampInput('FillOpacity', Infinity, 0, 1, log, 'c');
        ClampInput('FillOpacity', Infinity, 0, 1, log, 'c');
        expect(sink).toHaveBeenCalledTimes(1);
    });
});
