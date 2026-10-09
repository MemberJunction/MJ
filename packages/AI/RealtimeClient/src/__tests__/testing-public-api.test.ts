/**
 * The `/testing` entry's public surface, and that only it carries the kit: the main entry and `/media` export none of
 * it, so an app bundles no test code.
 */
import { describe, expect, it } from 'vitest';
import * as main from '../index';
import * as media from '../media/index';
import * as testing from '../testing/index';
import { BaseRealtimeClient } from '../generic/baseRealtimeClient';

/** The kit's values, as `/testing` exports them (its types have no runtime form). */
const KIT_VALUES = [
    'CONFORMANCE_FMP4_FRAME_SECONDS',
    'ConformanceChunkFrames',
    'ConformanceFmp4AudioFragment',
    'ConformanceFmp4InitSegment',
    'ConformanceFmp4VideoFragment',
    'ConformanceImageFrame',
    'ConformancePcm',
    'CreateConformanceMicrophone',
    'ListRealtimeVideoConformanceChecks',
    'REALTIME_VIDEO_CONFORMANCE_CHECKS',
    'RealtimeVideoConformanceError',
    'RealtimeVideoConformanceTimeline',
    'RecordingPcmPlayback',
    'RecordingVideoPlayout',
    'RunRealtimeVideoConformance',
];

describe('the /testing public API', () => {
    it('exports the kit and nothing else', () => {
        expect(Object.keys(testing).sort()).toEqual([...KIT_VALUES].sort());
    });

    it('is not exported from the main entry or /media', () => {
        const leaked = KIT_VALUES.filter((name) => name in main || name in media);
        expect(leaked).toEqual([]);
    });

    it("checks a provider's client against the same BaseRealtimeClient the main entry exports", () => {
        expect(main.BaseRealtimeClient).toBe(BaseRealtimeClient);
    });

    it('lists VC01-VC15 then VF01-VF02, each with a title, a gate and a run', () => {
        const sessionAndTurn = Array.from({ length: 15 }, (_, i) => `VC${String(i + 1).padStart(2, '0')}`);
        expect(testing.REALTIME_VIDEO_CONFORMANCE_CHECKS.map((c) => c.Id)).toEqual([...sessionAndTurn, 'VF01', 'VF02']);
        for (const check of testing.REALTIME_VIDEO_CONFORMANCE_CHECKS) {
            expect(check.Title.length, check.Id).toBeGreaterThan(0);
            expect(typeof check.Gate, check.Id).toBe('function');
            expect(typeof check.Run, check.Id).toBe('function');
        }
    });
});
