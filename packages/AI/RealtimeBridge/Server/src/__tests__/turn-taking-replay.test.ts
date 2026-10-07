import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
    ReplayRoom,
    HasAgentOverlap,
    LoopRunExceeds,
    OverlapsHumanSpeech,
    type ReplayFixture,
    type HumanSpeechEvent,
} from './helpers/turn-taking-replay-harness';

const FIXTURE_DIR = join(__dirname, 'fixtures', 'turn-taking');

function loadFixtures(): Array<{ File: string; Fixture: ReplayFixture }> {
    return readdirSync(FIXTURE_DIR)
        .filter(f => f.endsWith('.json'))
        .sort()
        .map(File => ({ File, Fixture: JSON.parse(readFileSync(join(FIXTURE_DIR, File), 'utf8')) as ReplayFixture }));
}

const FIXTURES = loadFixtures();

describe('turn-taking replay — fixture corpus', () => {
    it('ships at least eight recorded rooms, each described and with expectations', () => {
        expect(FIXTURES.length).toBeGreaterThanOrEqual(8);
        for (const { File, Fixture } of FIXTURES) {
            expect(Fixture.Name, File).toBeTruthy();
            expect(Fixture.Description.length, File).toBeGreaterThan(40);
            expect(Fixture.Agents.length, File).toBeGreaterThanOrEqual(2);
            expect(Fixture.Events.length, File).toBeGreaterThan(0);
            expect(Fixture.Expect, File).toBeDefined();
        }
    });

    it('covers each behaviour the room must guarantee', () => {
        const names = FIXTURES.map(f => f.Fixture.Name).join(' ');
        for (const topic of ['backchannel', 'preempts', 'handoff', 'loop-cap', 'race', 'model-side', 'facilitator']) {
            expect(names, topic).toContain(topic);
        }
    });
});

describe.each(FIXTURES)('turn-taking replay — $Fixture.Name', ({ File, Fixture }) => {
    const result = ReplayRoom(Fixture);

    describe('invariants of a healthy room', () => {
        it('no two agents ever speak at once', () => {
            expect(result.Invariants.NoAgentOverlap, File).toBe(true);
        });

        it('agents never run past the loop cap without a human in between', () => {
            expect(result.Invariants.LoopCapRespected, File).toBe(true);
        });

        it('a human always preempts: no agent turn overlaps a person speaking', () => {
            expect(result.Invariants.HumansAlwaysPreempt, File).toBe(true);
        });

        it('a backchannel never takes the floor', () => {
            expect(result.Invariants.BackchannelsNeverTookFloor, File).toBe(true);
        });
    });

    describe('recorded outcome', () => {
        it('grants and denies each speech attempt as the rules require', () => {
            const expected = Fixture.Expect.Speeches;
            if (!expected) {
                return;
            }
            expect(result.Speeches.map(({ Agent, Kind, Granted, Reason }) => ({ Agent, Kind, Granted, Reason }))).toEqual(expected);
        });

        it('reaches the expected per-agent turn decisions when a person finishes speaking', () => {
            const humans = Fixture.Events.filter((e): e is HumanSpeechEvent => e.Type === 'HumanSpeech');
            humans.forEach((human, i) => {
                if (human.ExpectDecisions) {
                    expect(result.Decisions[i].ByAgent, `${File} human #${i}`).toEqual(human.ExpectDecisions);
                }
            });
        });

        it('settles yields, preemptions, backchannels and the final floor as expected', () => {
            const e = Fixture.Expect;
            if (e.Yields) {
                expect(result.Yields).toEqual(e.Yields);
            }
            if (e.Preempted) {
                expect(result.Preempted).toEqual(e.Preempted);
            }
            if (e.BackchannelCount !== undefined) {
                expect(result.FinalState.BackchannelCount).toBe(e.BackchannelCount);
            }
            if (e.LoopCapReached !== undefined) {
                expect(result.FinalState.LoopCapReached).toBe(e.LoopCapReached);
            }
            if (e.FinalFloorHolder !== undefined) {
                expect(result.FinalState.FloorHolderAgentSessionId).toBe(e.FinalFloorHolder);
            }
        });
    });
});

describe('turn-taking replay — the invariant checks can fail, not just pass', () => {
    it('detects two agents speaking at once', () => {
        expect(HasAgentOverlap([{ Agent: 'a', StartMs: 0, EndMs: 5000 }, { Agent: 'b', StartMs: 4000, EndMs: 9000 }])).toBe(true);
        expect(HasAgentOverlap([{ Agent: 'a', StartMs: 0, EndMs: 5000 }, { Agent: 'b', StartMs: 5000, EndMs: 9000 }])).toBe(false);
    });

    it('detects agents running past the loop cap without a human', () => {
        const agents = Array.from({ length: 5 }, (_, i) => ({ AtMs: i, Kind: 'Agent' as const, Agent: 'a' }));
        expect(LoopRunExceeds(agents, 4)).toBe(true);
        expect(LoopRunExceeds(agents, 5)).toBe(false);
        const withHuman = [...agents.slice(0, 3), { AtMs: 9, Kind: 'Human' as const }, ...agents.slice(3)];
        expect(LoopRunExceeds(withHuman, 4)).toBe(false);
    });

    it('detects an agent turn that overlaps a person speaking', () => {
        const human = [{ StartMs: 1000, EndMs: 3000 }];
        expect(OverlapsHumanSpeech([{ Agent: 'a', StartMs: 0, EndMs: 2000 }], human)).toBe(true);
        expect(OverlapsHumanSpeech([{ Agent: 'a', StartMs: 0, EndMs: 1000 }], human)).toBe(false);
        expect(OverlapsHumanSpeech([{ Agent: 'a', StartMs: 3000, EndMs: 4000 }], human)).toBe(false);
    });

    it('the loop cap bites in a replayed room: the same timeline is fully granted loose and cut off tight', () => {
        const turns = Array.from({ length: 6 }, (_, i) => ({
            Type: 'AgentSpeech' as const,
            AtMs: i * 3000,
            Agent: i % 2 === 0 ? 'a' : 'b',
            DurationMs: 2000,
            Text: `Agent turn number ${i} with enough words`,
        }));
        const base: Omit<ReplayFixture, 'MaxConsecutiveAgentTurns'> = {
            Name: 'cap-check',
            Description: 'A synthetic room used to prove the loop cap bites.',
            Agents: [{ Id: 'a', Names: ['A'] }, { Id: 'b', Names: ['B'] }],
            Events: turns,
            Expect: {},
        };
        const loose = ReplayRoom({ ...base, MaxConsecutiveAgentTurns: 10 });
        const tight = ReplayRoom({ ...base, MaxConsecutiveAgentTurns: 3 });
        expect(loose.Speeches.every(s => s.Granted)).toBe(true);
        expect(tight.Speeches.filter(s => s.Granted)).toHaveLength(3);
        expect(tight.Speeches.slice(3).every(s => s.Reason === 'LoopCapReached')).toBe(true);
        expect(tight.Invariants.LoopCapRespected).toBe(true);
    });
});
