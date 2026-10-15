/**
 * @fileoverview Checks VF01-VF02: the agent's video as typed frames (Core's `RealtimeVideoFrame`). Frames reach the player
 * as the model sent them: an fMP4 piece says init or fragment, an encoded chunk keeps its time and key-frame flag. A
 * driver whose voice and video share a timeline hands its voice playback to the player as the clock, and queues each PCM
 * chunk at its media time, so the face moves with the voice.
 *
 * @module @memberjunction/ai-realtime-client/testing
 */
import type { RealtimeVideoFrame } from '@memberjunction/ai';
import { AssertCount, AssertSameBytes, AssertTrue, AssertValue, Fail } from './conformanceAssertions';
import { ConformancePcm } from './conformanceFixtures';
import { AllOf, NeedsGrant, NeedsPlayout, NeedsTimedVoice } from './conformanceGates';
import { WithConformanceSession, type ConformanceSession } from './realtimeVideoConformanceSession';
import type { RealtimeVideoConformanceCheck } from './realtimeVideoConformanceTypes';

/** A granted avatar whose voice comes separately, as PCM: the case a clock is for. */
const SEPARATE_VOICE = { Grant: { Avatar: true, VideoCarriesVoice: false } };

const VF01: RealtimeVideoConformanceCheck = {
    Id: 'VF01',
    Title: 'Frames reach the player typed, as the model sent them',
    Gate: AllOf(NeedsPlayout, NeedsGrant),
    Run: (harness) =>
        WithConformanceSession(harness, { Grant: { Avatar: true } }, async (s) => {
            const mark = s.Timeline.Mark();
            const sent = [await s.StartVideo(), ...(await s.SendFrames(3))];
            const appended = s.AppendedFrames(0, mark);
            AssertSameBytes(appended.map((frame) => frame.Data), sent.map((frame) => frame.Data), "the frames' bytes, in the order the model sent them");
            sent.forEach((frame, index) => assertSameFrame(appended[index], frame, index + 1));
        }),
};

const VF02: RealtimeVideoConformanceCheck = {
    Id: 'VF02',
    Title: "A timed voice drives the video's clock",
    Gate: AllOf(NeedsPlayout, NeedsGrant, NeedsTimedVoice),
    Run: (harness) =>
        WithConformanceSession(harness, SEPARATE_VOICE, async (s) => {
            const mark = s.Timeline.Mark();
            const times = [await s.SendVoice(ConformancePcm(1))];
            const frames = [await s.StartVideo()];
            times.push(await s.SendVoice(ConformancePcm(2)));
            frames.push(...(await s.SendFrames(2)));
            AssertCount(s.Players.length, 1, 'video players created for one avatar');
            AssertTrue(s.Players[0].Options.Clock === s.Voice, "the video player's clock is the voice's playback", 'the player was created with another clock, or none');
            const queued = s.Timeline.Of('voice-enqueue', mark).map((event) => event.MediaTimeMs);
            AssertValue(JSON.stringify(queued), JSON.stringify(times), "the media times the voice was queued at (the model's)");
            assertFramesOnTheVoicesTimeline(s, mark, frames);
        }),
};

/** VF01-VF02, in order. */
export const REALTIME_VIDEO_FRAME_CHECKS: readonly RealtimeVideoConformanceCheck[] = [VF01, VF02];

/** A frame the player got is the frame the model sent: its kind and type, and the fields its kind has. */
function assertSameFrame(actual: RealtimeVideoFrame | undefined, expected: RealtimeVideoFrame, position: number): void {
    if (!actual) {
        Fail(`frame ${position}`, 'the player never got it');
    }
    AssertValue(actual.Kind, expected.Kind, `frame ${position}'s kind`);
    AssertValue(actual.MimeType, expected.MimeType, `frame ${position}'s MIME type`);
    if (actual.Kind === 'fmp4' && expected.Kind === 'fmp4') {
        AssertValue(actual.Piece, expected.Piece, `fMP4 frame ${position}'s piece (init or fragment, by its first box)`);
    }
    if (expected.Kind !== 'fmp4') {
        AssertValue(String(actual.PresentationTimeMs), String(expected.PresentationTimeMs), `frame ${position}'s presentation time (ms)`);
        AssertValue(actual.KeyFrame ?? null, expected.KeyFrame ?? null, `frame ${position}'s key-frame flag`);
    }
}

/** The frames the player got keep the model's presentation times: the timeline the voice was queued on. */
function assertFramesOnTheVoicesTimeline(s: ConformanceSession, mark: number, sent: readonly RealtimeVideoFrame[]): void {
    const appended = s.AppendedFrames(0, mark);
    AssertCount(appended.length, sent.length, 'frames given to the player');
    sent.forEach((frame, index) => {
        if (frame.Kind !== 'fmp4') {
            AssertValue(String(appended[index].PresentationTimeMs), String(frame.PresentationTimeMs), `frame ${index + 1}'s presentation time on the voice's timeline (ms)`);
        }
    });
}
