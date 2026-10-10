/**
 * The fault matrix: the synthetic driver with one rule broken at a time. Each run must fail exactly the checks that
 * rule belongs to, and each failure must name the check, the driver and the rule. A check that passes a broken driver,
 * or fails a sound one, shows up here. Faults of the frame checks run where their rule applies: on encoded chunks, whose
 * times the player needs and whose voice shares their timeline.
 */
import type { RealtimeVideoFrameKind } from '@memberjunction/ai';
import { describe, expect, it } from 'vitest';
import { RunRealtimeVideoConformance } from '../../testing';
import { ALL_CHECK_IDS } from './run-outcomes';
import { SyntheticHarness } from './synthetic-harness';
import type { SyntheticFaults } from './synthetic-wire';

interface FaultCase {
    /** The broken rule. */
    Fault: keyof SyntheticFaults & string;
    /** The form of video the run sends. Default fMP4. */
    Kind?: RealtimeVideoFrameKind;
    /** The checks it must fail, in check order. */
    Fails: string[];
    /** What the first failure's detail says about the rule. */
    Says: string;
}

const FAULTS: FaultCase[] = [
    { Fault: 'TrackLiveWithoutGrant', Fails: ['VC01'], Says: 'the outbound video track of a session that shows no avatar is not live: it is live' },
    { Fault: 'PlaysVideoPartsAsVoice', Fails: ['VC02'], Says: 'video/mp4 parts played as audio: expected 0, got 2' },
    { Fault: 'HandsOverTwice', Fails: ['VC03'], Says: 'agent video hand-overs through a full turn: expected 1, got 2' },
    { Fault: 'AsksForAudioOnly', Fails: ['VC03'], Says: 'the provider was asked for the avatar the host shows: expected true, got false' },
    { Fault: 'IgnoresHost', Fails: ['VC04'], Says: 'agent video handed over to a host that shows none: expected 0, got 1' },
    { Fault: 'IgnoresPlayability', Fails: ['VC05'], Says: 'the outbound video track of a session that shows no avatar is not live: it is live' },
    // VC13 too: the idle video after a turn, played as the voice, is audible.
    { Fault: 'VideoToVoice', Fails: ['VC06', 'VC09', 'VC11', 'VC13'], Says: 'frames of video played as the voice: expected 0, got 4' },
    { Fault: 'DropsInitSegment', Fails: ['VC06', 'VC10', 'VF01'], Says: 'every frame of video reaches the player once, in order, unchanged: expected 4 pieces, got 3' },
    { Fault: 'PlaysUnknownParts', Fails: ['VC07'], Says: 'application/x-unknown parts played as video: expected 0, got 2' },
    { Fault: 'KeepsVideoOnBargeIn', Fails: ['VC08'], Says: 'flushes of the video player at a barge-in: expected 1, got 0' },
    { Fault: 'PlaysLateMedia', Fails: ['VC09'], Says: "frames of an interrupted turn's late video played: expected 0, got 1" },
    { Fault: 'NoEndOfTurn', Fails: ['VC10'], Says: "ends of the turn's video at generation complete: expected 1, got 0" },
    { Fault: 'PlaysVoiceTwice', Fails: ['VC11'], Says: 'PCM chunks played later in a turn whose video carries the voice: expected 0, got 1' },
    { Fault: 'NoSecondsAtDisconnect', Fails: ['VC12'], Says: 'video seconds reported at Disconnect for the turn it cut off' },
    { Fault: 'SecondsTwice', Fails: ['VC12', 'VC13', 'VC14'], Says: 'video seconds reported for a turn, once' },
    { Fault: 'CountsLateFrames', Fails: ['VC13'], Says: 'video seconds reported for an interrupted turn: what arrived before it' },
    { Fault: 'IdleVideoIsSpeech', Fails: ['VC13'], Says: "'speaking' reported for idle video after a turn: expected 0, got 2" },
    { Fault: 'FlushOnResume', Fails: ['VC14'], Says: 'flushes of the video by a resume: expected 0, got 1' },
    { Fault: 'KeepsPlayerOnDisconnect', Fails: ['VC15'], Says: 'disposes of the video player by Disconnect, called twice: expected 1, got 0' },
    { Fault: 'MislabelsPieces', Fails: ['VF01'], Says: "fMP4 frame 1's piece (init or fragment, by its first box): expected init, got fragment" },
    { Fault: 'RetimesFrames', Kind: 'chunk', Fails: ['VF01', 'VF02'], Says: "frame 2's presentation time (ms): expected 41.666666666666664, got 0" },
    { Fault: 'RelabelsChunks', Kind: 'chunk', Fails: ['VF01'], Says: "frame 1's kind: expected chunk, got image" },
    { Fault: 'NoClock', Kind: 'chunk', Fails: ['VF02'], Says: "the video player's clock is the voice's playback: the player was created with another clock, or none" },
    { Fault: 'UntimedVoice', Kind: 'chunk', Fails: ['VF02'], Says: "the media times the voice was queued at (the model's): expected [0,41.666666666666664], got [null,null]" },
];

describe('the kit against a driver that breaks one rule', () => {
    it.each(FAULTS)('$Fault fails $Fails', async ({ Fault, Kind, Fails, Says }) => {
        const results = await RunRealtimeVideoConformance(() => new SyntheticHarness({ [Fault]: true }, Kind));
        const failed = results.filter((r) => r.Status === 'Failed');
        const name = `${Kind && Kind !== 'fmp4' ? `synthetic-${Kind}` : 'synthetic'} (${Fault})`;

        expect(failed.map((r) => r.Id)).toEqual(Fails);
        // What the run skips by its kind: fMP4's voice has no media time (VF02); a chunk carries no voice (VC11).
        expect(results.filter((r) => r.Status === 'Skipped').map((r) => r.Id)).toEqual(Kind === 'chunk' ? ['VC11'] : ['VF02']);
        for (const failure of failed) {
            expect(failure.Detail?.startsWith(`${failure.Id} (${name}): `), failure.Detail ?? '').toBe(true);
        }
        expect(failed[0].Detail).toContain(Says);
    });

    it('covers every check: each one fails some broken driver', () => {
        const covered = new Set(FAULTS.flatMap((fault) => fault.Fails));
        expect([...covered].sort()).toEqual([...ALL_CHECK_IDS].sort());
    });
});
