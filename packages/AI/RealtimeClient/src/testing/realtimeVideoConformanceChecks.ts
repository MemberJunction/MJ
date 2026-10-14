/**
 * @fileoverview Checks VC01-VC07: what a session hands the host and where the model's parts go. An audio-only session
 * shows no video and still plays the voice; a granted avatar is handed over once, or not at all when the host doesn't
 * show it or the browser can't play it; video goes to its player in order and never to the voice; a part of an unknown
 * type goes nowhere and is reported once.
 *
 * @module @memberjunction/ai-realtime-client/testing
 */
import { AssertCount, AssertSameBytes, AssertTrue, AssertValue } from './conformanceAssertions';
import { ConformanceFmp4InitSegment, ConformanceFmp4VideoFragment, ConformancePcm } from './conformanceFixtures';
import { AllOf, NeedsAgentVideo, NeedsGrant, NeedsHarnessMethod, NeedsPlayout, NoGate } from './conformanceGates';
import { WithConformanceSession, type ConformanceSession } from './realtimeVideoConformanceSession';
import type { RealtimeVideoConformanceCheck } from './realtimeVideoConformanceTypes';

/** The MIME type of a part no realtime driver plays. */
const UNKNOWN_PART_TYPE = 'application/x-unknown';

const VC01: RealtimeVideoConformanceCheck = {
    Id: 'VC01',
    Title: 'An audio-only session hands over no agent video and still works',
    Gate: NoGate,
    Run: (harness) =>
        WithConformanceSession(harness, { Grant: { Avatar: false } }, async (s) => {
            AssertValue(s.LastState(), 'listening', 'an audio-only session listens after Connect');
            AssertCount(s.Count('error'), 0, 'errors reported by an audio-only session');
            assertAgentVideoTrackNotLive(s, 'unsupported');
            await assertVoicePlays(s, ConformancePcm(1));
            await harness.TurnComplete();
            AssertCount(s.RemoteVideos().length, 0, 'agent video handed over in an audio-only session');
            AssertCount(s.Players.length, 0, 'video players created in an audio-only session');
        }),
};

const VC02: RealtimeVideoConformanceCheck = {
    Id: 'VC02',
    Title: 'In an audio-only session, a video part never plays as audio',
    Gate: NeedsHarnessMethod('SendPart'),
    Run: (harness) =>
        WithConformanceSession(harness, { Grant: { Avatar: false } }, async (s) => {
            const mark = s.Timeline.Mark();
            await harness.SendPart?.('video/mp4', ConformanceFmp4InitSegment());
            await harness.SendPart?.('video/mp4', ConformanceFmp4VideoFragment());
            AssertCount(s.Count('voice-enqueue', mark), 0, 'video/mp4 parts played as audio');
            AssertCount(s.Players.length, 0, 'video players created in an audio-only session');
            AssertCount(s.RemoteVideos().length, 0, 'agent video handed over in an audio-only session');
            AssertCount(s.Warnings('video/mp4', mark), 1, 'warnings naming the dropped video/mp4 parts (once per type)');
        }),
};

const VC03: RealtimeVideoConformanceCheck = {
    Id: 'VC03',
    Title: 'A granted avatar is handed over once, and its track is live',
    Gate: AllOf(NeedsAgentVideo, NeedsGrant),
    Run: (harness) =>
        WithConformanceSession(harness, { Grant: { Avatar: true } }, async (s) => {
            AssertValue(s.OutboundVideoTrack()?.State ?? 'absent', 'live', 'the outbound video track of a granted avatar the host shows');
            if (harness.AskedProviderForVideo) {
                AssertValue(harness.AskedProviderForVideo(), true, 'the provider was asked for the avatar the host shows');
            }
            AssertTrue(s.RemoteVideos().length <= 1, 'the agent video is handed over once', `handed over ${s.RemoteVideos().length} times by Connect`);
            await s.StartVideo();
            await s.SendFrames(2);
            await s.SendVoice(ConformancePcm(1));
            await s.EndTurn();
            AssertCount(s.RemoteVideos().length, 1, 'agent video hand-overs through a full turn');
            assertHandedOverItsVideo(s);
        }),
};

const VC04: RealtimeVideoConformanceCheck = {
    Id: 'VC04',
    Title: "A granted avatar the host doesn't show stays audio only",
    Gate: AllOf(NeedsAgentVideo, NeedsGrant),
    Run: (harness) =>
        WithConformanceSession(harness, { Grant: { Avatar: true }, ShowAgentVideo: false }, async (s) => {
            assertAgentVideoTrackNotLive(s, null);
            await assertVoicePlays(s, ConformancePcm(1));
            AssertCount(s.RemoteVideos().length, 0, 'agent video handed over to a host that shows none');
            assertNoPlayerKept(s);
            assertAskedForAudioOnly(s);
        }),
};

const VC05: RealtimeVideoConformanceCheck = {
    Id: 'VC05',
    Title: "A granted avatar this browser can't play stays audio only",
    Gate: AllOf(NeedsPlayout, NeedsGrant, NeedsHarnessMethod('RefusePlayback')),
    Run: async (harness) => {
        const undo = harness.RefusePlayback?.() ?? (() => undefined);
        try {
            await WithConformanceSession(harness, { Grant: { Avatar: true } }, async (s) => {
                assertAgentVideoTrackNotLive(s, 'unsupported');
                AssertCount(s.RemoteVideos().length, 0, "agent video handed over when the browser can't play it");
                assertNoPlayerKept(s);
                await assertVoicePlays(s, ConformancePcm(1));
                assertAskedForAudioOnly(s);
            });
        } finally {
            undo();
        }
    },
};

const VC06: RealtimeVideoConformanceCheck = {
    Id: 'VC06',
    Title: 'The avatar\'s video goes to its player in order, never to the voice',
    Gate: AllOf(NeedsPlayout, NeedsGrant),
    Run: (harness) =>
        WithConformanceSession(harness, { Grant: { Avatar: true } }, async (s) => {
            const mark = s.Timeline.Mark();
            const sent = [await s.StartVideo(), ...(await s.SendFrames(3))];
            AssertCount(s.Players.length, 1, 'video players created for one avatar');
            const appended = s.AppendedFrames(0, mark).map((frame) => frame.Data);
            AssertSameBytes(appended, sent.map((frame) => frame.Data), 'every frame of video reaches the player once, in order, unchanged');
            AssertCount(s.Count('voice-enqueue', mark), 0, 'frames of video played as the voice');
        }),
};

const VC07: RealtimeVideoConformanceCheck = {
    Id: 'VC07',
    Title: 'A part of an unknown type is dropped and reported once',
    Gate: AllOf(NeedsPlayout, NeedsGrant, NeedsHarnessMethod('SendPart')),
    Run: (harness) =>
        WithConformanceSession(harness, { Grant: { Avatar: true } }, async (s) => {
            const mark = s.Timeline.Mark();
            // Bytes with no format of their own, as PCM has none: the type the part names is all a driver has to go by.
            await harness.SendPart?.(UNKNOWN_PART_TYPE, ConformancePcm(7));
            await harness.SendPart?.(UNKNOWN_PART_TYPE, ConformancePcm(8));
            AssertCount(s.Count('player-append', mark), 0, `${UNKNOWN_PART_TYPE} parts played as video`);
            AssertCount(s.Count('voice-enqueue', mark), 0, `${UNKNOWN_PART_TYPE} parts played as the voice`);
            AssertCount(s.Warnings(UNKNOWN_PART_TYPE, mark), 1, `warnings naming the dropped ${UNKNOWN_PART_TYPE} parts (once per type)`);
        }),
};

/** VC01-VC07, in order. */
export const REALTIME_VIDEO_SESSION_CHECKS: readonly RealtimeVideoConformanceCheck[] = [VC01, VC02, VC03, VC04, VC05, VC06, VC07];

/**
 * The agent's video track is not live. A driver that negotiates tracks and was asked for it reports it `expected`
 * (`'unsupported'`), so the host can say why; `null` accepts any state but live, or no track.
 */
function assertAgentVideoTrackNotLive(s: ConformanceSession, expected: 'unsupported' | null): void {
    const state = s.OutboundVideoTrack()?.State ?? 'absent';
    AssertTrue(state !== 'live', 'the outbound video track of a session that shows no avatar is not live', 'it is live');
    if (expected !== null && s.Client.AllTracks.length > 0) {
        AssertValue(state, expected, 'the requested outbound video track a driver negotiated and could not grant');
    }
}

/** The model's voice plays: a PCM driver queues these bytes, and the client says the agent is audible. */
async function assertVoicePlays(s: ConformanceSession, pcm: ArrayBuffer): Promise<void> {
    const mark = s.Timeline.Mark();
    await s.SendVoice(pcm);
    if (s.Harness.Traits.Voice === 'pcm') {
        AssertSameBytes(s.VoiceEnqueued(mark), [pcm], "the model's voice reaches the voice playback");
    }
    AssertValue(s.Client.IsAudioPlaying, true, "IsAudioPlaying while the model's voice plays");
}

/** The handed-over video is the driver's own: its player's source (playout), or a live stream. */
function assertHandedOverItsVideo(s: ConformanceSession): void {
    const video = s.RemoteVideos()[0];
    if (s.Harness.Traits.AgentVideo === 'playout') {
        AssertCount(s.Players.length, 1, 'video players created for one avatar');
        AssertTrue(video === s.Players[0].Source, "the handed-over video is the player's video", `it is another '${video.Kind}' source`);
        return;
    }
    AssertValue(video.Kind, 'stream', 'the kind of video a stream driver hands over');
    AssertTrue(video.Kind === 'stream' && !!video.Stream, 'a stream driver hands over its stream', 'the stream is missing');
}

/** No video player outlives the connect: none was created, or each was released. */
function assertNoPlayerKept(s: ConformanceSession): void {
    const kept = s.Players.filter((player) => s.PlayerEvents('player-dispose', player.Index).length === 0);
    AssertCount(kept.length, 0, 'video players kept by a session that shows no avatar');
}

/** When the harness can tell, the provider was asked for audio only: an avatar nobody sees is still generated and billed. */
function assertAskedForAudioOnly(s: ConformanceSession): void {
    if (s.Harness.AskedProviderForVideo) {
        AssertValue(s.Harness.AskedProviderForVideo(), false, 'the provider was asked for video that nobody sees');
    }
}
