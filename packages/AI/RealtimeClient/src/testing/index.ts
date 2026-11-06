/**
 * @fileoverview The `@memberjunction/ai-realtime-client/testing` entry point: the video provider conformance kit. A
 * provider's test runs it against the provider's client driver to prove the driver meets the realtime video contract:
 * what it hands the host, where the model's video and voice go, what barge-in, turn ends, resumes and Disconnect do to
 * them, and the generated video seconds it reports.
 *
 * The checks (VC01-VC15, VF01-VF02) take the agent's video as Core's `RealtimeVideoFrame`s, in whichever form the
 * provider's model sends it: fragmented MP4, encoded chunks or images.
 *
 * The kit needs no test framework: {@link RunRealtimeVideoConformance} resolves to results, and
 * {@link ListRealtimeVideoConformanceChecks} gives a runner one test per check. A provider writes a harness
 * ({@link IRealtimeVideoConformanceHarness}): what its server mints, its client driver with a fake transport and its
 * creation seams wired to the kit's recorders, and the model's side of the wire.
 *
 * Everything reachable from here may import only other `/testing` modules, `/media`, `src/audio/`,
 * `generic/baseRealtimeClient`, `@memberjunction/ai`, `@memberjunction/global` and `rxjs`: no driver, no
 * `@google/genai`, no test framework. `testing-entry-boundary.test.ts` fails the build otherwise. The main entry does
 * not export the kit, so apps never bundle it.
 *
 * @module @memberjunction/ai-realtime-client/testing
 */

export { RealtimeVideoConformanceError } from './conformanceAssertions';
export {
    CONFORMANCE_FMP4_FRAME_SECONDS,
    ConformanceChunkFrames,
    ConformanceFmp4AudioFragment,
    ConformanceFmp4InitSegment,
    ConformanceFmp4VideoFragment,
    ConformanceImageFrame,
    ConformancePcm,
    type ConformanceChunkOptions,
} from './conformanceFixtures';
export { CreateConformanceMicrophone } from './conformanceMicrophone';
export {
    RealtimeVideoConformanceTimeline,
    type RealtimeVideoConformanceEvent,
    type RealtimeVideoConformanceEventKind,
    type RealtimeVideoConformanceEventOf,
} from './conformanceTimeline';
export { RecordingPcmPlayback, RecordingVideoPlayout } from './recordingPlayout';
export { ListRealtimeVideoConformanceChecks, REALTIME_VIDEO_CONFORMANCE_CHECKS, RunRealtimeVideoConformance } from './realtimeVideoConformance';
export type {
    IRealtimeVideoConformanceHarness,
    RealtimeVideoConformanceCheck,
    RealtimeVideoConformanceCheckRun,
    RealtimeVideoConformanceDriverFactory,
    RealtimeVideoConformanceGrant,
    RealtimeVideoConformanceMedia,
    RealtimeVideoConformanceResult,
    RealtimeVideoConformanceTraits,
} from './realtimeVideoConformanceTypes';
