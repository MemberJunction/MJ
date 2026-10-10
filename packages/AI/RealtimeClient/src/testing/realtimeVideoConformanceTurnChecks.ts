/**
 * @fileoverview Checks VC08-VC15: what each turn boundary does to the avatar's video and voice. Barge-in stops both at
 * once and drops the cut turn's late media; a turn's end lets its video play out; a video that carries the voice never
 * plays it twice; generated video seconds are reported once, an interrupted turn's included and idle video excluded;
 * the idle video after a turn plays without the agent speaking; a resume keeps the avatar; Disconnect releases it.
 *
 * @module @memberjunction/ai-realtime-client/testing
 */
import { AssertCount, AssertSameBytes, AssertSeconds, AssertTrue, AssertValue } from './conformanceAssertions';
import { ConformancePcm } from './conformanceFixtures';
import {
    AllOf,
    NeedsGrant,
    NeedsHarnessMethod,
    NeedsPcmVoice,
    NeedsPlayout,
    NeedsVideoThatCanCarryVoice,
    NeedsVideoUsage,
} from './conformanceGates';
import { SecondsOfVideo } from './conformanceVideoStream';
import { WithConformanceSession, type ConformanceSession } from './realtimeVideoConformanceSession';
import type { RealtimeVideoConformanceCheck } from './realtimeVideoConformanceTypes';

/** A granted avatar whose voice comes separately, as PCM, so a turn queues voice beside its video. */
const SEPARATE_VOICE = { Grant: { Avatar: true, VideoCarriesVoice: false } };

/** A granted avatar whose video carries the voice. */
const MUXED_VOICE = { Grant: { Avatar: true, VideoCarriesVoice: true } };

const VC08: RealtimeVideoConformanceCheck = {
    Id: 'VC08',
    Title: 'Barge-in stops the video and the voice at once',
    Gate: AllOf(NeedsPlayout, NeedsGrant),
    Run: (harness) =>
        WithConformanceSession(harness, SEPARATE_VOICE, async (s) => {
            await s.StartVideo();
            await s.SendFrames(1);
            await s.SendVoice(ConformancePcm(1));
            const players = s.Players.length;
            const mark = s.Timeline.Mark();
            await harness.Interrupted();
            AssertCount(s.Count('interruption', mark), 1, 'barge-ins reported (OnInterruption) for one barge-in');
            AssertCount(s.PlayerEvents('player-flush', 0, mark).length, 1, 'flushes of the video player at a barge-in');
            AssertCount(s.PlayerEvents('player-dispose', 0, mark).length, 0, 'disposes of the video player at a barge-in (its last frame stays)');
            if (harness.Traits.Voice === 'pcm') {
                AssertTrue(s.Count('voice-flush', mark) > 0, 'a barge-in flushes the voice', 'the voice playback was not flushed');
            }
            AssertValue(s.Client.IsAudioPlaying, false, 'IsAudioPlaying after a barge-in');
            AssertCount(s.RemoteVideos(mark).length, 0, 'agent video handed over again at a barge-in');
            AssertCount(s.Players.length, players, 'video players after a barge-in');
        }),
};

const VC09: RealtimeVideoConformanceCheck = {
    Id: 'VC09',
    Title: 'Media for an interrupted turn never plays',
    Gate: AllOf(NeedsPlayout, NeedsGrant),
    Run: (harness) =>
        WithConformanceSession(harness, SEPARATE_VOICE, async (s) => {
            await s.StartVideo();
            await s.SendFrames(1);
            await s.SendVoice(ConformancePcm(1));
            await harness.Interrupted();
            const late = s.Timeline.Mark();
            await s.SendFrames(1);
            await s.SendVoice(ConformancePcm(2));
            AssertCount(s.Count('player-append', late), 0, "frames of an interrupted turn's late video played");
            AssertCount(s.Count('voice-enqueue', late), 0, "chunks of an interrupted turn's late voice played");
            await harness.TurnComplete();
            const next = s.Timeline.Mark();
            const frames = await s.SendFrames(1);
            const pcm = ConformancePcm(3);
            await s.SendVoice(pcm);
            AssertSameBytes(s.AppendedFrames(0, next).map((frame) => frame.Data), frames.map((frame) => frame.Data), "the next turn's video plays");
            if (harness.Traits.Voice === 'pcm') {
                AssertSameBytes(s.VoiceEnqueued(next), [pcm], "the next turn's voice plays");
            }
        }),
};

const VC10: RealtimeVideoConformanceCheck = {
    Id: 'VC10',
    Title: "A turn's end lets its video play out",
    Gate: AllOf(NeedsPlayout, NeedsGrant),
    Run: (harness) =>
        WithConformanceSession(harness, { Grant: { Avatar: true } }, async (s) => {
            const ends = (): number => s.PlayerEvents('player-end-of-turn', 0).length;
            await s.StartVideo();
            await s.SendFrames(2);
            if (harness.GenerationComplete) {
                await harness.GenerationComplete();
                AssertCount(ends(), 1, "ends of the turn's video at generation complete");
            }
            await harness.TurnComplete();
            AssertCount(ends(), 1, "ends of the turn's video once the turn is complete (one per turn)");
            await s.SendFrames(1);
            AssertCount(s.Players.length, 1, 'video players after a second turn (the next turn uses the same player)');
            AssertCount(s.PlayerEvents('player-append', 0).length, 4, "frames on the player after the next turn's video");
            await s.EndTurn();
            AssertCount(ends(), 2, "ends of the video after the next turn's end");
            AssertCount(s.Count('player-flush'), 0, "flushes of the video at a turn's end (it must play out)");
            AssertCount(s.Count('player-dispose'), 0, "disposes of the video player at a turn's end");
        }),
};

const VC11: RealtimeVideoConformanceCheck = {
    Id: 'VC11',
    Title: 'A video that carries the voice never plays it twice',
    Gate: AllOf(NeedsPlayout, NeedsGrant, NeedsVideoThatCanCarryVoice, NeedsPcmVoice),
    Run: async (harness) => {
        await WithConformanceSession(harness, MUXED_VOICE, assertMuxedVoicePlaysOnce);
        await WithConformanceSession(harness, SEPARATE_VOICE, assertSeparateVoicePlays);
    },
};

const VC12: RealtimeVideoConformanceCheck = {
    Id: 'VC12',
    Title: 'Generated video seconds are reported, each once',
    Gate: AllOf(NeedsPlayout, NeedsGrant, NeedsVideoUsage),
    Run: (harness) =>
        WithConformanceSession(harness, { Grant: { Avatar: true } }, async (s) => {
            const first = s.Timeline.Mark();
            const turn = [await s.StartVideo(), ...(await s.SendFrames(3))];
            await s.EndTurn();
            AssertSeconds(s.VideoSeconds(first), SecondsOfVideo(turn), 'video seconds reported for a turn, once');
            // These frames come with no answer start: they count as a turn's here, though VC13 takes such video as idle
            // for whether the agent is speaking. Whether video outside an answer counts in usage is open (#5312).
            const second = s.Timeline.Mark();
            const next = await s.SendFrames(2);
            await s.EndTurn();
            AssertSeconds(s.VideoSeconds(second), SecondsOfVideo(next), 'video seconds reported for the next turn, of 2 frames');
            const last = s.Timeline.Mark();
            const cut = await s.SendFrames(1);
            await s.Disconnect();
            AssertSeconds(s.VideoSeconds(last), SecondsOfVideo(cut), 'video seconds reported at Disconnect for the turn it cut off');
        }),
};

const VC13: RealtimeVideoConformanceCheck = {
    Id: 'VC13',
    Title: "An interrupted turn counts what arrived; idle video doesn't count, and is not the agent speaking",
    Gate: AllOf(NeedsPlayout, NeedsGrant, NeedsVideoUsage),
    Run: (harness) =>
        WithConformanceSession(harness, { Grant: { Avatar: true } }, async (s) => {
            const interrupted = s.Timeline.Mark();
            const arrived = [await s.StartVideo(), ...(await s.SendFrames(2))];
            await harness.Interrupted();
            await s.SendFrames(1);
            await harness.TurnComplete();
            AssertSeconds(s.VideoSeconds(interrupted), SecondsOfVideo(arrived), 'video seconds reported for an interrupted turn: what arrived before it (1 more frame came late)');
            // Without generation complete, idle video can't be told from the turn's own.
            if (harness.GenerationComplete) {
                const idle = s.Timeline.Mark();
                const generated = await s.SendFrames(1);
                await harness.GenerationComplete();
                await s.SendFrames(2);
                await harness.TurnComplete();
                AssertSeconds(s.VideoSeconds(idle), SecondsOfVideo(generated), 'video seconds reported for a turn of 1 frame followed by 2 idle frames');
            }
            // Without the answer's start, idle video can't be told from an answer's.
            if (harness.AnswerStarted) {
                await assertIdleVideoIsNotSpeech(s);
            }
        }),
};

const VC14: RealtimeVideoConformanceCheck = {
    Id: 'VC14',
    Title: 'A resumed session keeps its avatar',
    Gate: AllOf(NeedsPlayout, NeedsGrant, NeedsHarnessMethod('Resume')),
    Run: (harness) =>
        WithConformanceSession(harness, { Grant: { Avatar: true } }, async (s) => {
            const turn = s.Timeline.Mark();
            const cut = [await s.StartVideo(), ...(await s.SendFrames(1))];
            const mark = s.Timeline.Mark();
            await harness.Resume?.();
            assertAvatarKeptAcrossResume(s, mark);
            const after = s.Timeline.Mark();
            const frames = await s.SendFrames(1);
            AssertSameBytes(s.AppendedFrames(0, after).map((frame) => frame.Data), frames.map((frame) => frame.Data), 'video after a resume reaches the same player');
            if (harness.Traits.VideoUsage) {
                AssertSeconds(s.VideoSeconds(turn), SecondsOfVideo(cut), 'video seconds reported by the resume for the turn it cut off');
                await s.EndTurn();
                AssertSeconds(s.VideoSeconds(turn), SecondsOfVideo([...cut, ...frames]), 'video seconds reported for the cut turn and the next, each once');
            }
        }),
};

const VC15: RealtimeVideoConformanceCheck = {
    Id: 'VC15',
    Title: 'Disconnect releases the video',
    Gate: AllOf(NeedsPlayout, NeedsGrant),
    Run: (harness) =>
        WithConformanceSession(harness, { Grant: { Avatar: true } }, async (s) => {
            await s.StartVideo();
            await s.SendFrames(1);
            const mark = s.Timeline.Mark();
            await s.Disconnect();
            await s.Client.Disconnect();
            AssertCount(s.PlayerEvents('player-dispose', 0, mark).length, 1, 'disposes of the video player by Disconnect, called twice');
            AssertValue(s.LastState(), 'closed', 'the state after Disconnect');
            await s.SendFrames(1);
            AssertCount(s.Count('player-append', mark), 0, 'frames of video played after Disconnect');
            AssertCount(s.RemoteVideos(mark).length, 0, 'agent video handed over after Disconnect');
        }),
};

/** VC08-VC15, in order. */
export const REALTIME_VIDEO_TURN_CHECKS: readonly RealtimeVideoConformanceCheck[] = [VC08, VC09, VC10, VC11, VC12, VC13, VC14, VC15];

/**
 * Muxed voice: PCM plays while the turn has no video; the turn's first video flushes it, and later PCM in that turn is
 * dropped. The next turn without video plays its PCM again.
 */
async function assertMuxedVoicePlaysOnce(s: ConformanceSession): Promise<void> {
    const before = s.Timeline.Mark();
    const early = ConformancePcm(1);
    await s.SendVoice(early);
    AssertSameBytes(s.VoiceEnqueued(before), [early], 'PCM that arrives before the turn has video plays');
    const videoStarts = s.Timeline.Mark();
    await s.StartVideo();
    AssertTrue(s.Count('voice-flush', videoStarts) > 0, "the turn's first video flushes the PCM queued before it", 'the PCM was not flushed');
    AssertValue(s.Players[0]?.CarriesVoice, true, "whether the player plays the video's audio (it is the voice)");
    const later = s.Timeline.Mark();
    await s.SendVoice(ConformancePcm(2));
    await s.SendFrames(1);
    AssertCount(s.Count('voice-enqueue', later), 0, 'PCM chunks played later in a turn whose video carries the voice');
    await s.EndTurn();
    const next = s.Timeline.Mark();
    const pcm = ConformancePcm(3);
    await s.SendVoice(pcm);
    AssertSameBytes(s.VoiceEnqueued(next), [pcm], 'PCM of the next turn, which has no video yet, plays');
}

/** Separate voice: every PCM chunk plays beside the video, nothing is flushed, and the player is muted. */
async function assertSeparateVoicePlays(s: ConformanceSession): Promise<void> {
    const mark = s.Timeline.Mark();
    const pcm = [ConformancePcm(1), ConformancePcm(2), ConformancePcm(3)];
    await s.SendVoice(pcm[0]);
    await s.StartVideo();
    await s.SendVoice(pcm[1]);
    await s.SendFrames(1);
    await s.SendVoice(pcm[2]);
    AssertSameBytes(s.VoiceEnqueued(mark), pcm, 'a separate voice plays every PCM chunk beside the video');
    AssertCount(s.Count('voice-flush', mark), 0, 'flushes of a separate voice by the video');
    AssertValue(s.Players[0]?.CarriesVoice, false, "whether the player plays the video's audio (the voice plays as PCM)");
}

/**
 * The idle video after a turn, which a provider may stream between answers (Vertex AI does): the answer's video is the
 * agent speaking; the video after its turn plays, but reports no `'speaking'`, leaves the client idle, and, once the
 * answer has played out, is not audible.
 */
async function assertIdleVideoIsNotSpeech(s: ConformanceSession): Promise<void> {
    const answer = s.Timeline.Mark();
    await s.Harness.AnswerStarted?.();
    await s.SendFrames(2);
    AssertTrue(s.States(answer).includes('speaking'), "the client reports 'speaking' for an answer's video", `it reported ${s.States(answer).join(', ') || 'no state'}`);
    await s.EndTurn();
    s.FinishPlaying();
    const idle = s.Timeline.Mark();
    const frames = await s.SendFrames(2);
    AssertSameBytes(s.AppendedFrames(0, idle).map((frame) => frame.Data), frames.map((frame) => frame.Data), 'idle video after a turn plays');
    AssertCount(s.States(idle).filter((state) => state === 'speaking').length, 0, "'speaking' reported for idle video after a turn");
    AssertValue(s.Client.IsBusy, false, 'IsBusy while idle video plays after a turn');
    AssertValue(s.Client.IsAudioPlaying, false, 'IsAudioPlaying once the answer has played out and only idle video plays');
}

/** A resume left the avatar as it was: no new hand-over or player, no flush or dispose, the cut turn ended, the track live. */
function assertAvatarKeptAcrossResume(s: ConformanceSession, mark: number): void {
    AssertCount(s.RemoteVideos(mark).length, 0, 'agent video handed over again by a resume');
    AssertCount(s.Players.length, 1, 'video players after a resume');
    AssertCount(s.PlayerEvents('player-flush', 0, mark).length, 0, 'flushes of the video by a resume');
    AssertCount(s.PlayerEvents('player-dispose', 0, mark).length, 0, 'disposes of the video player by a resume');
    AssertCount(s.PlayerEvents('player-end-of-turn', 0, mark).length, 1, "ends of the cut turn's video at a resume (it plays out and holds its last frame)");
    AssertValue(s.OutboundVideoTrack()?.State ?? 'absent', 'live', 'the outbound video track after a resume');
    AssertValue(s.LastState(), 'listening', 'the state after a resume');
}
