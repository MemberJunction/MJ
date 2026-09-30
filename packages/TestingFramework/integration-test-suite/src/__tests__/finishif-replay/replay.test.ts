import { describe, it, expect, vi, type Mock } from 'vitest';
import type { DecisionAnswer, DecisionQuestion } from '@memberjunction/ai';
import type { AgentFinishIf } from '@memberjunction/ai-core-plus';
import type { AuthorOutcome } from '../../finishif-replay/author';
import { FINISH_IF_SWEEP_THRESHOLDS } from '../../finishif-replay/metrics';
import {
    MapWithConcurrency,
    ObservationFromReply,
    RunFinishIfReplay,
    type CorpusReader,
    type DecisionReply,
    type FinishIfDecider,
    type FinishIfReplayDeps,
    type FinishIfReplayOptions,
    type FinishIfRoundAuthor,
    type GateCostReader,
    type ReplaySink
} from '../../finishif-replay/replay';
import { GENERIC_FINISH_IF_QUESTION, type FinishIfReplaySettings } from '../../finishif-replay/report';
import { ExtractRounds } from '../../finishif-replay/rounds';
import type { AuthoredFinishIf, FinishIfReplayArm, GateObservation, ReplayPromptRunRow, ReplayRound, ReplayStepRow } from '../../finishif-replay/types';
import { BuildCorpus, Guid, SENTINEL, type FixtureCorpus } from './fixtures';

function settings(arms: FinishIfReplayArm[] = ['authored', 'generic'], reps = 2): FinishIfReplaySettings {
    return {
        CorpusDatabase: 'corpus_db',
        DecisionPrompt: 'Default Decision',
        AuthorModel: 'Author Model',
        Arms: arms,
        Reps: reps,
        Seed: 7,
        Limit: null,
        ProductionThreshold: 0.9,
        Thresholds: [...FINISH_IF_SWEEP_THRESHOLDS],
        GenericQuestion: GENERIC_FINISH_IF_QUESTION,
        BootstrapResamples: 100,
        CalibrationFolds: 5
    };
}

function authoredFinishIf(): AgentFinishIf {
    return { questions: [`${SENTINEL} authored question one`, `${SENTINEL} authored question two`], message: `${SENTINEL} authored message` };
}

/** Everything the replay touches, as spies. */
interface Harness {
    Deps: FinishIfReplayDeps;
    Corpus: { ReadSteps: Mock<() => Promise<ReplayStepRow[]>>; ReadPromptRuns: Mock<(ids: readonly string[]) => Promise<ReplayPromptRunRow[]>> };
    Author: Mock<(round: ReplayRound) => Promise<AuthorOutcome>>;
    Decide: Mock<(state: string, questions: Record<string, DecisionQuestion>) => Promise<DecisionReply>>;
    ReadCosts: Mock<(ids: readonly string[]) => Promise<Map<string, number | null>>>;
    Authored: AuthoredFinishIf[];
    Decisions: GateObservation[];
    Reports: string[];
    Logs: string[];
}

/** Answers every question 0.95 for the finish rounds' states and 0.3 otherwise, as model "Model A". */
function scriptedDecision(): (state: string, questions: Record<string, DecisionQuestion>) => Promise<DecisionReply> {
    let calls = 0;
    return async (state, questions) => {
        calls++;
        const high = state.includes('Create Record') || state.includes('Send Email');
        const Answers: Record<string, DecisionAnswer> = {};
        for (const key of Object.keys(questions)) {
            Answers[key] = { Kind: 'Likelihood', Probability: high ? 0.95 : 0.3 };
        }
        return { Success: true, Answers, ModelName: 'Model A', PromptRunID: Guid(7, calls), LatencyMs: 50, Error: null };
    };
}

function harness(corpus: FixtureCorpus, failAuthoringFor: string | null = null): Harness {
    const authored: AuthoredFinishIf[] = [];
    const decisions: GateObservation[] = [];
    const reports: string[] = [];
    const logs: string[] = [];
    const corpusReader: Harness['Corpus'] = {
        ReadSteps: vi.fn(async () => corpus.Steps),
        ReadPromptRuns: vi.fn(async (_ids: readonly string[]) => corpus.PromptRuns)
    };
    const author: Harness['Author'] = vi.fn(async (round: ReplayRound): Promise<AuthorOutcome> => round.RoundId === failAuthoringFor
        ? { FinishIf: null, Attempts: 3, Error: 'invalid' }
        : { FinishIf: authoredFinishIf(), Attempts: 1, Error: null });
    const decide: Harness['Decide'] = vi.fn(scriptedDecision());
    const readCosts: Harness['ReadCosts'] = vi.fn(async (ids: readonly string[]) => new Map<string, number | null>(ids.map(id => [id, 0.0001] as const)));
    const sink: ReplaySink = {
        AppendAuthored: entry => authored.push(entry),
        AppendDecision: observation => decisions.push(observation),
        WriteReport: (report, markdown) => reports.push(JSON.stringify(report), markdown),
        Log: line => logs.push(line)
    };
    const deps: FinishIfReplayDeps = {
        Corpus: corpusReader satisfies CorpusReader,
        Author: { Author: author } satisfies FinishIfRoundAuthor,
        Decider: { Decide: decide } satisfies FinishIfDecider,
        Costs: { ReadCosts: readCosts } satisfies GateCostReader,
        Sink: sink,
        Now: () => new Date('2026-09-29T12:00:00Z')
    };
    return { Deps: deps, Corpus: corpusReader, Author: author, Decide: decide, ReadCosts: readCosts, Authored: authored, Decisions: decisions, Reports: reports, Logs: logs };
}

function options(overrides: Partial<FinishIfReplayOptions> = {}): FinishIfReplayOptions {
    return { Settings: settings(), DryRun: false, Concurrency: 2, AuthoredCache: new Map(), ...overrides };
}

describe('RunFinishIfReplay', () => {
    it('a dry run reads the corpus, prints the plan and makes no call', async () => {
        const corpus = BuildCorpus();
        const h = harness(corpus);
        const result = await RunFinishIfReplay(options({ DryRun: true }), h.Deps);

        expect(result.Report).toBeNull();
        expect(result.Plan).toEqual({
            Rounds: 5,
            Labels: { Finish: 3, Continue: 2 },
            NeverGated: 2,
            NeverGatedLabels: { Finish: 1, Continue: 1 },
            Excluded: 1,
            Gated: 3,
            Sampled: 3,
            RoundsToAuthor: 3,
            DecisionCalls: 12
        });
        expect(h.Corpus.ReadSteps).toHaveBeenCalledTimes(1);
        expect(h.Author).not.toHaveBeenCalled();
        expect(h.Decide).not.toHaveBeenCalled();
        expect(h.ReadCosts).not.toHaveBeenCalled();
        expect(h.Authored).toEqual([]);
        expect(h.Decisions).toEqual([]);
        expect(h.Reports).toEqual([]);
        expect(h.Logs.join('\n')).toContain('12 decision calls');
    });

    it('authors, decides every arm and rep, reads the costs back, and reports', async () => {
        const corpus = BuildCorpus();
        const h = harness(corpus);
        const result = await RunFinishIfReplay(options(), h.Deps);

        expect(h.Author).toHaveBeenCalledTimes(3);
        expect(h.Authored.map(a => a.RoundId).sort()).toEqual([corpus.Rounds.GatedFinish, corpus.Rounds.GatedContinue, corpus.Rounds.GatedChat].sort());
        expect(h.Decide).toHaveBeenCalledTimes(12);
        const genericQuestions = h.Decide.mock.calls.map(([, questions]) => questions).filter(q => Object.keys(q).length === 1);
        expect(genericQuestions[0]).toEqual({ q1: { Kind: 'Likelihood', Instructions: GENERIC_FINISH_IF_QUESTION } });
        expect(h.ReadCosts).toHaveBeenCalledTimes(1);

        const report = result.Report;
        expect(report?.Corpus).toMatchObject({ Rounds: 5, Gated: { Finish: 2, Continue: 1 }, Sampled: { Finish: 2, Continue: 1 }, ExcludedNoNextPrompt: 1 });
        expect(report?.Arms.map(a => [a.Arm, a.Rounds, a.Calls])).toEqual([['authored', 3, 6], ['generic', 3, 6]]);
        expect(report?.Arms[0].Authoring).toEqual({ FromCache: 0, AuthoredNow: 3, Failed: 0 });
        expect(report?.Arms[1].Production.PerRep).toMatchObject({ FinishReps: 4, FinishPasses: 4, ContinueReps: 2, ContinuePasses: 0 });
        expect(report?.Arms[1].Gate.CostUSDPer1k).toBeCloseTo(0.1, 10);
        expect(h.Reports).toHaveLength(2);
    });

    it('never passes a round whose actions never reached the gate', async () => {
        const corpus = BuildCorpus();
        const h = harness(corpus);
        await RunFinishIfReplay(options(), h.Deps);
        const states = h.Decide.mock.calls.map(([state]) => state);
        expect(states.every(state => !state.includes('Search Query Catalog'))).toBe(true);
        const decided = new Set(h.Decisions.map(d => d.RoundId));
        expect(decided.has(corpus.Rounds.Failed)).toBe(false);
        expect(decided.has(corpus.Rounds.Directives)).toBe(false);
    });

    it('reuses cached finishIfs, and leaves a round whose authoring failed out of the authored arm', async () => {
        const corpus = BuildCorpus();
        const h = harness(corpus, corpus.Rounds.GatedContinue);
        const cache = new Map([[corpus.Rounds.GatedFinish, { RoundId: corpus.Rounds.GatedFinish, FinishIf: authoredFinishIf() }]]);
        const result = await RunFinishIfReplay(options({ AuthoredCache: cache }), h.Deps);

        expect(h.Author).toHaveBeenCalledTimes(2);
        expect(h.Authored.map(a => a.RoundId)).toEqual([corpus.Rounds.GatedChat]);
        expect(result.Report?.Arms[0].Authoring).toEqual({ FromCache: 1, AuthoredNow: 1, Failed: 1 });
        expect(result.Report?.Arms[0].Rounds).toBe(2);
        expect(result.Report?.Arms[1].Rounds).toBe(3);
    });

    it('refuses to run the authored arm without an author when a round is not cached', async () => {
        const h = harness(BuildCorpus());
        await expect(RunFinishIfReplay(options(), { ...h.Deps, Author: null })).rejects.toThrow(/no author/);
        expect(h.Decide).not.toHaveBeenCalled();
    });

    it('runs the generic arm alone without an author', async () => {
        const h = harness(BuildCorpus());
        const result = await RunFinishIfReplay(options({ Settings: settings(['generic'], 1) }), { ...h.Deps, Author: null });
        expect(h.Decide).toHaveBeenCalledTimes(3);
        expect(result.Report?.Arms.map(a => a.Arm)).toEqual(['generic']);
    });
});

describe('ObservationFromReply', () => {
    const round = ExtractRounds(BuildCorpus().Steps).Rounds[0];
    const questions: Record<string, DecisionQuestion> = {
        q1: { Kind: 'Likelihood', Instructions: 'one' },
        q2: { Kind: 'Likelihood', Instructions: 'two' }
    };
    const reply = (answers: Record<string, DecisionAnswer>, success = true): DecisionReply =>
        ({ Success: success, Answers: answers, ModelName: 'Model A', PromptRunID: 'p', LatencyMs: 10, Error: success ? null : 'down' });

    it('passes when every probability reaches the threshold, and scores the minimum', () => {
        const observation = ObservationFromReply({ Round: round, Arm: 'authored', Rep: 1, Questions: questions },
            reply({ q1: { Kind: 'Likelihood', Probability: 0.97 }, q2: { Kind: 'Likelihood', Probability: 0.91 } }), 0.9);
        expect(observation).toMatchObject({ Passed: true, Score: 0.91, CallSucceeded: true, CostUSD: null });
    });

    it('fails, with no score, on a non-numeric probability, a missing answer or a failed call', () => {
        const task = { Round: round, Arm: 'authored' as const, Rep: 1, Questions: questions };
        expect(ObservationFromReply(task, reply({ q1: { Kind: 'Likelihood', Probability: 0.97 }, q2: { Kind: 'Likelihood', Probability: Number.NaN } }), 0.9))
            .toMatchObject({ Passed: false, Score: null });
        expect(ObservationFromReply(task, reply({ q1: { Kind: 'Likelihood', Probability: 0.97 } }), 0.9)).toMatchObject({ Passed: false, Score: null });
        expect(ObservationFromReply(task, reply({}, false), 0.9)).toMatchObject({ Passed: false, Score: null, CallSucceeded: false, Probabilities: {} });
    });
});

describe('MapWithConcurrency', () => {
    it('keeps the order and never runs more than the limit at once', async () => {
        let running = 0;
        let peak = 0;
        const results = await MapWithConcurrency([5, 1, 4, 2, 3], 2, async (n, i) => {
            running++;
            peak = Math.max(peak, running);
            await new Promise(resolve => setTimeout(resolve, n));
            running--;
            return n * 10 + i;
        });
        expect(results).toEqual([50, 11, 42, 23, 34]);
        expect(peak).toBe(2);
    });
});
