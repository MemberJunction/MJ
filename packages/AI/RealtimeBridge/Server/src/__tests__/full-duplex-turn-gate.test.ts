import { describe, it, expect, beforeEach } from 'vitest';
import { BACKCHANNEL_MAX_DURATION_MS } from '@memberjunction/ai-bridge-base';
import { MultiAgentRoomCoordinator } from '../multi-agent-room-coordinator';
import {
    FullDuplexTurnGate,
    HumanSpeechDetector,
    ComputePcm16Rms,
    OUTPUT_BURST_GAP_MS,
    HUMAN_SPEECH_REPORT_INTERVAL_MS,
    HUMAN_SPEECH_RMS_THRESHOLD,
} from '../full-duplex-turn-gate';

const ROOM = 'room-1';
const SAGE = 'sess-sage';
const DEMO = 'sess-demo';
const RATE = 24000;

/** Bytes of PCM16 mono audio lasting `ms` at the test sample rate. */
function pcm(ms: number): number {
    return Math.round((ms / 1000) * RATE) * 2;
}

let now = 0;
let coord: MultiAgentRoomCoordinator;
let sage: FullDuplexTurnGate;
let demo: FullDuplexTurnGate;

function makeGate(agent: string): FullDuplexTurnGate {
    return new FullDuplexTurnGate({ Coordinator: coord, RoomId: ROOM, AgentSessionId: agent, SampleRateHz: RATE, Now: () => now });
}

beforeEach(() => {
    now = 1000;
    coord = new MultiAgentRoomCoordinator(() => now);
    coord.RegisterRoomParticipant(ROOM, SAGE);
    coord.RegisterRoomParticipant(ROOM, DEMO);
    sage = makeGate(SAGE);
    demo = makeGate(DEMO);
});

describe('FullDuplexTurnGate — taking the floor', () => {
    it('takes a free floor on the first chunk and forwards the audio', () => {
        expect(sage.OnOutputAudio(pcm(100))).toEqual({ Verdict: 'Forward', TookFloor: true });
        expect(sage.Phase).toBe('Floor');
        expect(coord.IsFloorHolder(ROOM, SAGE)).toBe(true);
    });

    it('keeps forwarding the rest of its own turn without re-taking the floor', () => {
        sage.OnOutputAudio(pcm(100));
        for (let i = 0; i < 5; i++) {
            now += 100;
            expect(sage.OnOutputAudio(pcm(100))).toEqual({ Verdict: 'Forward', TookFloor: false });
        }
    });

    it('releases the floor at the end of a long turn and counts it as a turn', () => {
        for (let i = 0; i < 40; i++) {
            sage.OnOutputAudio(pcm(100));
            now += 100;
        }
        sage.EndTurn({ Text: 'A long and considered answer that goes on for a while' });
        expect(coord.IsFloorHolder(ROOM, SAGE)).toBe(false);
        expect(sage.Phase).toBe('Idle');
        expect(coord.GetRoomState(ROOM)!.ConsecutiveAgentTurns).toBe(1);
    });

    it('reclassifies a very short utterance on a free floor as a backchannel when the turn ends', () => {
        sage.OnOutputAudio(pcm(500));
        sage.EndTurn({ Text: 'mm-hm' });
        const state = coord.GetRoomState(ROOM)!;
        expect(state.ConsecutiveAgentTurns).toBe(0);
        expect(state.BackchannelCount).toBe(1);
    });

    it('uses the measured burst duration when the transcript alone would not decide it', () => {
        for (let i = 0; i < 30; i++) {
            sage.OnOutputAudio(pcm(100)); // 3 s of audio
        }
        sage.EndTurn({ Text: 'ok' });
        expect(coord.GetRoomState(ROOM)!.BackchannelCount).toBe(0);
        expect(coord.GetRoomState(ROOM)!.ConsecutiveAgentTurns).toBe(1);
    });
});

describe('FullDuplexTurnGate — another agent holds the floor', () => {
    beforeEach(() => {
        sage.OnOutputAudio(pcm(100)); // SAGE holds the floor
    });

    it('lets a short overlay through as a backchannel without taking the floor', () => {
        expect(demo.OnOutputAudio(pcm(300))).toEqual({ Verdict: 'Forward', TookFloor: false });
        expect(demo.Phase).toBe('Overlay');
        expect(demo.OnOutputAudio(pcm(300)).Verdict).toBe('Forward');
        expect(coord.IsFloorHolder(ROOM, SAGE)).toBe(true);
    });

    it('records the overlay as a backchannel when it ends, and never as a turn', () => {
        demo.OnOutputAudio(pcm(300));
        demo.EndTurn({ Text: 'right' });
        const state = coord.GetRoomState(ROOM)!;
        expect(state.BackchannelCount).toBe(1);
        expect(state.ConsecutiveAgentTurns).toBe(1); // SAGE's turn only
        expect(coord.IsFloorHolder(ROOM, SAGE)).toBe(true);
    });

    it('cuts an overlay the moment it runs past the backchannel bound, and drops the rest of the burst', () => {
        let verdict = demo.OnOutputAudio(pcm(500)).Verdict;
        expect(verdict).toBe('Forward');
        verdict = demo.OnOutputAudio(pcm(BACKCHANNEL_MAX_DURATION_MS)).Verdict;
        expect(verdict).toBe('Cut');
        expect(demo.Phase).toBe('Muted');
        expect(demo.OnOutputAudio(pcm(100))).toEqual({ Verdict: 'Drop', TookFloor: false });
        expect(coord.IsFloorHolder(ROOM, SAGE)).toBe(true);
    });

    it('counts a chunk given by its duration (an avatar piece) the same way: overlay, then cut past the bound', () => {
        expect(demo.OnOutputDuration(500)).toEqual({ Verdict: 'Forward', TookFloor: false });
        expect(demo.OnOutputDuration(0).Verdict).toBe('Forward'); // a video-only piece follows its burst
        expect(demo.OnOutputDuration(BACKCHANNEL_MAX_DURATION_MS).Verdict).toBe('Cut');
        expect(demo.OnOutputDuration(0)).toEqual({ Verdict: 'Drop', TookFloor: false });
    });

    it('cuts a burst whose very first chunk already exceeds the backchannel bound', () => {
        expect(demo.OnOutputAudio(pcm(BACKCHANNEL_MAX_DURATION_MS + 500))).toEqual({ Verdict: 'Cut', TookFloor: false });
        expect(demo.Phase).toBe('Muted');
    });

    it('takes the floor when an overlay outlasts the backchannel bound but the floor has since been freed', () => {
        demo.OnOutputAudio(pcm(500));
        coord.ReleaseFloor(ROOM, SAGE);
        const result = demo.OnOutputAudio(pcm(BACKCHANNEL_MAX_DURATION_MS));
        expect(result).toEqual({ Verdict: 'Forward', TookFloor: true });
        expect(coord.IsFloorHolder(ROOM, DEMO)).toBe(true);
    });

    it('starts fresh after a pause, so a muted agent can speak on its next turn', () => {
        demo.OnOutputAudio(pcm(500));
        demo.OnOutputAudio(pcm(BACKCHANNEL_MAX_DURATION_MS)); // cut
        coord.ReleaseFloor(ROOM, SAGE);
        now += OUTPUT_BURST_GAP_MS + 1;
        expect(demo.OnOutputAudio(pcm(100))).toEqual({ Verdict: 'Forward', TookFloor: true });
    });

    it('denies a third agent reserved out by a hand-off from taking the floor (only the target proceeds)', () => {
        coord.YieldFloor(ROOM, SAGE, DEMO);
        const scoutGate = (() => {
            coord.RegisterRoomParticipant(ROOM, 'sess-scout');
            return makeGate('sess-scout');
        })();
        expect(scoutGate.OnOutputAudio(pcm(100)).TookFloor).toBe(false);
        expect(scoutGate.Phase).toBe('Overlay');
        expect(demo.OnOutputAudio(pcm(100))).toEqual({ Verdict: 'Forward', TookFloor: true });
    });
});

describe('FullDuplexTurnGate — humans and the loop cap', () => {
    it('cuts an agent that starts while a human is speaking', () => {
        coord.NoteHumanSpeech(ROOM);
        expect(sage.OnOutputAudio(pcm(100))).toEqual({ Verdict: 'Cut', TookFloor: false });
        expect(sage.Phase).toBe('Muted');
        const denial = coord.GetRoomState(ROOM)!.RecentEvents.find(e => e.Type === 'FloorDenied');
        expect(denial).toMatchObject({ AgentSessionId: SAGE, Reason: 'HumanSpeaking' });
    });

    it('cuts the floor holder on its next chunk once a human has preempted it', () => {
        sage.OnOutputAudio(pcm(100));
        coord.NoteHumanSpeech(ROOM);
        expect(sage.OnOutputAudio(pcm(100)).Verdict).toBe('Cut');
        expect(sage.OnOutputAudio(pcm(100)).Verdict).toBe('Drop');
    });

    it('Cut() mutes the rest of the burst immediately', () => {
        sage.OnOutputAudio(pcm(100));
        sage.Cut();
        expect(sage.OnOutputAudio(pcm(100)).Verdict).toBe('Drop');
    });

    it('cuts an agent once the agent-to-agent loop cap is reached', () => {
        coord.ConfigureLimits({ MaxConsecutiveAgentTurns: 2 });
        for (const gate of [sage, demo]) {
            for (let i = 0; i < 30; i++) {
                gate.OnOutputAudio(pcm(100));
            }
            gate.EndTurn({ Text: 'a full sentence of real content here' });
            now += OUTPUT_BURST_GAP_MS + 1;
        }
        expect(sage.OnOutputAudio(pcm(100)).Verdict).toBe('Cut');
    });

    it('speaks again after a human turn resets the loop', () => {
        coord.ConfigureLimits({ MaxConsecutiveAgentTurns: 1 });
        for (let i = 0; i < 30; i++) {
            sage.OnOutputAudio(pcm(100));
        }
        sage.EndTurn({ Text: 'a full sentence of real content here' });
        expect(demo.OnOutputAudio(pcm(100)).Verdict).toBe('Cut');
        coord.NoteHumanTurn(ROOM);
        now += OUTPUT_BURST_GAP_MS + 1;
        expect(demo.OnOutputAudio(pcm(100)).Verdict).toBe('Forward');
    });
});

describe('FullDuplexTurnGate — housekeeping', () => {
    it('EndTurn always returns the gate to Idle, whatever phase it was in', () => {
        sage.OnOutputAudio(pcm(100));
        sage.EndTurn();
        expect(sage.Phase).toBe('Idle');
        sage.Cut();
        sage.EndTurn();
        expect(sage.Phase).toBe('Idle');
    });

    it('Reset() clears state without touching the coordinator', () => {
        sage.OnOutputAudio(pcm(100));
        sage.Reset();
        expect(sage.Phase).toBe('Idle');
        expect(coord.IsFloorHolder(ROOM, SAGE)).toBe(true); // the coordinator's floor is not the gate's to free
    });

    it('defaults the sample rate when none is given', () => {
        const gate = new FullDuplexTurnGate({ Coordinator: coord, RoomId: ROOM, AgentSessionId: SAGE, Now: () => now });
        // 2400 bytes at the 24 kHz default = 50 ms; a 1.5 s bound is far away.
        expect(gate.OnOutputAudio(2400).TookFloor).toBe(true);
    });
});

describe('ComputePcm16Rms / HumanSpeechDetector', () => {
    function pcmBuffer(amplitude: number, samples = 480): ArrayBuffer {
        const arr = new Int16Array(samples);
        for (let i = 0; i < samples; i++) {
            arr[i] = i % 2 === 0 ? amplitude : -amplitude;
        }
        return arr.buffer;
    }

    it('measures the RMS of a PCM16 buffer', () => {
        expect(ComputePcm16Rms(pcmBuffer(1000))).toBeCloseTo(1000, 5);
        expect(ComputePcm16Rms(pcmBuffer(0))).toBe(0);
        expect(ComputePcm16Rms(new ArrayBuffer(0))).toBe(0);
    });

    it('ignores a trailing odd byte', () => {
        expect(ComputePcm16Rms(new ArrayBuffer(3))).toBe(0);
    });

    it('reports speech above the threshold and stays quiet below it', () => {
        const det = new HumanSpeechDetector(() => now);
        expect(det.ShouldReportSpeech(pcmBuffer(HUMAN_SPEECH_RMS_THRESHOLD - 50))).toBe(false);
        expect(det.ShouldReportSpeech(pcmBuffer(HUMAN_SPEECH_RMS_THRESHOLD + 500))).toBe(true);
    });

    it('throttles reports to the interval so the coordinator is not called per 20 ms frame', () => {
        const det = new HumanSpeechDetector(() => now);
        const loud = pcmBuffer(5000);
        expect(det.ShouldReportSpeech(loud)).toBe(true);
        now += 20;
        expect(det.ShouldReportSpeech(loud)).toBe(false);
        now += HUMAN_SPEECH_REPORT_INTERVAL_MS;
        expect(det.ShouldReportSpeech(loud)).toBe(true);
    });
});
