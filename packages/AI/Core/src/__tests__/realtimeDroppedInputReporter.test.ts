import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RealtimeDroppedInputReporter } from '../generic/realtimeDroppedInputReporter';
import type { RealtimeInputFrame } from '../generic/baseRealtime';

const frame = (kind: RealtimeInputFrame['Kind'], mimeType?: string): RealtimeInputFrame => ({
    Data: new Uint8Array([1, 2]).buffer,
    Kind: kind,
    MimeType: mimeType,
});

describe('RealtimeDroppedInputReporter', () => {
    let warn: ReturnType<typeof vi.spyOn>;
    let reporter: RealtimeDroppedInputReporter;

    beforeEach(() => {
        warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        reporter = new RealtimeDroppedInputReporter('TestRealtime', 'this session sends audio only');
    });

    afterEach(() => {
        warn.mockRestore();
    });

    it('logs one line naming the driver, the kind, the type and what the session sends', () => {
        reporter.Report(frame('video', 'image/jpeg'));

        expect(warn.mock.calls).toEqual([['[TestRealtime] Dropped video input of type image/jpeg: this session sends audio only.']]);
    });

    it('logs a kind and type once, however many frames of it are dropped', () => {
        reporter.Report(frame('video', 'image/jpeg'));
        reporter.Report(frame('video', 'image/jpeg'));
        reporter.Report(frame('video', 'IMAGE/JPEG'));

        expect(warn).toHaveBeenCalledOnce();
    });

    it('logs each new type and each new kind', () => {
        reporter.Report(frame('video', 'image/jpeg'));
        reporter.Report(frame('video', 'image/png'));
        reporter.Report(frame('audio', 'image/jpeg'));

        expect(warn).toHaveBeenCalledTimes(3);
    });

    it('reports a frame with no type, or a blank one, as (no type), once', () => {
        reporter.Report(frame('video'));
        reporter.Report(frame('video', '  '));

        expect(warn.mock.calls).toEqual([['[TestRealtime] Dropped video input of type (no type): this session sends audio only.']]);
    });

    it('keeps a separate record for each session', () => {
        const otherSession = new RealtimeDroppedInputReporter('TestRealtime', 'this session sends audio only');

        reporter.Report(frame('video', 'image/jpeg'));
        otherSession.Report(frame('video', 'image/jpeg'));

        expect(warn).toHaveBeenCalledTimes(2);
    });
});
