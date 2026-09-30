/**
 * @fileoverview Decision routing for an unmentioned message, with the decision call mocked.
 *
 * Pins when a message gets a decision at all, and how the chat runs it and applies it: a confident
 * answer replaces continuity, and an error, a slow answer or an unsure one keeps it. How the
 * questions, options and state are built, and the thresholds, are pinned where those builders live
 * (`@memberjunction/ai-core-plus`, conversation-routing-decision.test.ts). The component wiring is
 * pinned in message-input-decision-routing.test.ts.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ChoiceAnswer, DecisionAnswer, LikelihoodAnswer } from '@memberjunction/ai';
import {
    BuildRoutingArtifactVersions,
    BuildRoutingQuestions,
    BuildRoutingState,
    ConversationUtility,
    DECISION_ROUTING_MIN_CONFIDENCE,
    DECISION_ROUTING_TIMEOUT_MS,
    InterpretRoutingAnswers,
    type RoutingAgent,
    type RoutingCatalogAgent,
    type RoutingDecisionInput,
    type RoutingDecisionOutcome,
    type RoutingParticipant,
} from '@memberjunction/ai-core-plus';
import type { RunDecisionResult } from '@memberjunction/graphql-dataprovider';

import {
    ApplyRoutingDecision,
    ArtifactVersionForTurn,
    RunRoutingDecision,
    ShouldRunRoutingDecision,
    type RoutingDecisionGate,
    type RoutingDecisionRunner,
} from '../lib/utils/decision-routing';
import { ResolveAgentTurn, type AgentTurnCandidates } from '../lib/utils/agent-turn-routing';
import type { AgentArtifactSummary } from '../lib/utils/agent-artifact-summary';

const ACTIVE = { Status: 'Active', IsRestricted: false } as const;
const MANAGER = { ID: 'AAAAAAAA-0000-0000-0000-000000000001', Name: 'Sage', Description: 'Routes each request.', ...ACTIVE } satisfies RoutingCatalogAgent;
const RESEARCH = { ID: 'AAAAAAAA-0000-0000-0000-000000000002', Name: 'Research', Description: 'Finds and summarises sources.', ...ACTIVE } satisfies RoutingCatalogAgent;
const WRITER = { ID: 'AAAAAAAA-0000-0000-0000-000000000003', Name: 'Writer', Description: 'Drafts and edits documents.', ...ACTIVE } satisfies RoutingCatalogAgent;
const ANALYST = { ID: 'AAAAAAAA-0000-0000-0000-000000000004', Name: 'Analyst', Description: null, ...ACTIVE } satisfies RoutingCatalogAgent;
const CATALOG: RoutingCatalogAgent[] = [MANAGER, RESEARCH, WRITER, ANALYST];
const findAgent = (id: string): RoutingCatalogAgent | undefined => CATALOG.find(a => a.ID.toUpperCase() === id.toUpperCase());

const VERSION_1 = 'BBBBBBBB-0000-0000-0000-000000000001';
const VERSION_2 = 'BBBBBBBB-0000-0000-0000-000000000002';
const PROMPT_RUN = 'EEEEEEEE-0000-0000-0000-000000000001';

function participant(agent: RoutingAgent, lastReply: string): RoutingParticipant {
    return { Agent: agent, LastReply: lastReply };
}

/** Research answered last; Writer answered before it. */
function input(overrides: Partial<RoutingDecisionInput> = {}): RoutingDecisionInput {
    return {
        Message: 'Now turn that into a press release',
        ContinuityAgentId: RESEARCH.ID,
        Participants: [participant(RESEARCH, 'Here are five sources.'), participant(WRITER, 'The draft is attached.')],
        ConversationManager: MANAGER,
        RecentTurns: ['User: Find sources on renewals', 'Research: Here are five sources.'],
        ArtifactVersions: [],
        AllowedAgentIDs: null,
        ...overrides,
    };
}

function choice(value: string, confidence: number): ChoiceAnswer {
    return { Kind: 'Choice', Value: value, Confidence: confidence, Probabilities: { [value]: confidence } };
}

function likelihood(probability: number): LikelihoodAnswer {
    return { Kind: 'Likelihood', Probability: probability };
}

function answered(answers: Record<string, DecisionAnswer>): RunDecisionResult {
    return { Success: true, Answers: answers };
}

/** A confident move away from Research, to the given agent. */
function leaves(to: string, extra: Record<string, DecisionAnswer> = {}): RunDecisionResult {
    return answered({ route: choice(to, 0.9), continues: likelihood(0.1), ...extra });
}

function runner(result: RunDecisionResult | (() => Promise<RunDecisionResult>)) {
    return vi.fn<RoutingDecisionRunner>(typeof result === 'function' ? result : async () => result);
}

function artifactSummary(name: string, versions: Array<[string, number, string | null]>): AgentArtifactSummary {
    return {
        artifactId: `artifact-${name}`,
        artifactName: name,
        ArtifactType: 'Report',
        Versions: versions.map(([versionId, versionNumber, versionName]) => ({ versionId, versionNumber, versionName })),
    };
}

function candidates(overrides: Partial<AgentTurnCandidates> = {}): AgentTurnCandidates {
    return {
        MentionedAgentIds: [],
        ContinuityAgentId: RESEARCH.ID,
        ConversationDefaultAgentId: null,
        HostDefaultAgentId: null,
        ConversationManagerAgentId: MANAGER.ID,
        ...overrides,
    };
}

const isKnown = (id: string) => !!findAgent(id);
const ALWAYS = { ReplyMode: 'Always', AllowedAgentIDs: null } as const;

describe('decision routing', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    describe('ShouldRunRoutingDecision', () => {
        const gate = (overrides: Partial<RoutingDecisionGate> = {}): RoutingDecisionGate => ({
            Enabled: true,
            ReplyMode: 'Always',
            MentionedAgentIds: [],
            Message: 'hello',
            ContinuityAgentId: RESEARCH.ID,
            ...overrides,
        });

        it('asks for an unmentioned message once an agent has answered', () => {
            expect(ShouldRunRoutingDecision(gate())).toBe(true);
        });

        it('does not ask when routing is off', () => {
            expect(ShouldRunRoutingDecision(gate({ Enabled: false }))).toBe(false);
        });

        it('does not ask for a message that tags an agent', () => {
            expect(ShouldRunRoutingDecision(gate({ MentionedAgentIds: [WRITER.ID] }))).toBe(false);
        });

        it('does not ask for a form response: it goes back to the agent that asked', () => {
            const form = ConversationUtility.CreateFormResponse('submit', [{ name: 'size', value: 'large' }]);
            expect(ShouldRunRoutingDecision(gate({ Message: form }))).toBe(false);
        });

        it('does not ask under MentionOnly, or before any agent has answered', () => {
            expect(ShouldRunRoutingDecision(gate({ ReplyMode: 'MentionOnly' }))).toBe(false);
            expect(ShouldRunRoutingDecision(gate({ ContinuityAgentId: null }))).toBe(false);
        });
    });

    describe('RunRoutingDecision', () => {
        it('asks one call with the questions, the state and the time limit', async () => {
            const run = runner(leaves(WRITER.ID));
            await RunRoutingDecision(input(), run);

            expect(run).toHaveBeenCalledOnce();
            const params = run.mock.calls[0][0];
            expect(params.TimeoutMS).toBe(DECISION_ROUTING_TIMEOUT_MS);
            expect(params.State).toBe(BuildRoutingState(input()));
            expect(params.Questions).toEqual(BuildRoutingQuestions(input()));
        });

        it('a confident Choice of another agent replaces continuity', async () => {
            const outcome = await RunRoutingDecision(input(), runner(leaves(WRITER.ID)));
            expect(outcome).toMatchObject({ Verdict: 'Routed', RoutedAgentId: WRITER.ID, TargetArtifact: null });
        });

        it('choosing the conversation manager means someone else', async () => {
            const outcome = await RunRoutingDecision(input(), runner(leaves(MANAGER.ID)));
            expect(outcome).toMatchObject({ Verdict: 'SomeoneElse', RoutedAgentId: null });
        });

        it('ignores a routed agent the chat does not allow', async () => {
            const narrowed = input({ AllowedAgentIDs: [RESEARCH.ID, MANAGER.ID] });
            const outcome = await RunRoutingDecision(narrowed, runner(leaves(WRITER.ID)));
            expect(outcome.Verdict).toBe('KeptContinuity');
        });

        it('ignores an answer that names no participant', async () => {
            const outcome = await RunRoutingDecision(input(), runner(leaves(ANALYST.ID)));
            expect(outcome.Verdict).toBe('KeptContinuity');
        });

        it('keeps continuity when the Choice is below the confidence bar', async () => {
            const unsure = answered({ route: choice(WRITER.ID, DECISION_ROUTING_MIN_CONFIDENCE - 0.01), continues: likelihood(0.1) });
            expect((await RunRoutingDecision(input(), runner(unsure))).Verdict).toBe('KeptContinuity');
        });

        it('acts on a Choice exactly at the bar', async () => {
            const atBar = answered({ route: choice(WRITER.ID, DECISION_ROUTING_MIN_CONFIDENCE), continues: likelihood(0.1) });
            expect((await RunRoutingDecision(input(), runner(atBar))).Verdict).toBe('Routed');
        });

        it('keeps continuity when the Likelihood is ambiguous', async () => {
            const ambiguous = answered({ route: choice(WRITER.ID, 0.9), continues: likelihood(0.5) });
            expect((await RunRoutingDecision(input(), runner(ambiguous))).Verdict).toBe('KeptContinuity');
        });

        it('keeps continuity when the Likelihood says the thread continues', async () => {
            const contradicts = answered({ route: choice(WRITER.ID, 0.9), continues: likelihood(0.9) });
            expect((await RunRoutingDecision(input(), runner(contradicts))).Verdict).toBe('KeptContinuity');
        });

        it('keeps continuity when the Choice picks the last agent', async () => {
            const stays = answered({ route: choice(RESEARCH.ID, 0.95), continues: likelihood(0.95) });
            expect((await RunRoutingDecision(input(), runner(stays))).Verdict).toBe('KeptContinuity');
        });

        it('keeps continuity when the decision fails', async () => {
            const failed: RunDecisionResult = { Success: false, ErrorMessage: 'model unavailable', Answers: {} };
            const outcome = await RunRoutingDecision(input(), runner(failed));
            expect(outcome).toMatchObject({ Verdict: 'KeptContinuity', TargetArtifact: null });
            expect(outcome.Reason).toContain('model unavailable');
        });

        it('keeps continuity when the call throws', async () => {
            const outcome = await RunRoutingDecision(input(), runner(async () => { throw new Error('network down'); }));
            expect(outcome.Verdict).toBe('KeptContinuity');
            expect(outcome.Reason).toContain('network down');
        });

        it('keeps continuity when an answer is missing', async () => {
            const partial = answered({ route: choice(WRITER.ID, 0.9) });
            expect((await RunRoutingDecision(input(), runner(partial))).Verdict).toBe('KeptContinuity');
        });

        it('keeps continuity when the answer takes more than 250 ms, and ignores it when it arrives', async () => {
            vi.useFakeTimers();
            const late = { ...leaves(WRITER.ID), PromptRunID: PROMPT_RUN };
            const run = runner(() => new Promise(resolve => setTimeout(() => resolve(late), DECISION_ROUTING_TIMEOUT_MS + 50)));

            const pending = RunRoutingDecision(input(), run);
            await vi.advanceTimersByTimeAsync(DECISION_ROUTING_TIMEOUT_MS + 1);
            const outcome = await pending;
            await vi.advanceTimersByTimeAsync(100);

            expect(outcome.Verdict).toBe('KeptContinuity');
            expect(outcome.Reason).toContain('250 ms');
            expect(outcome.PromptRunID).toBeNull();
        });

        it('carries the decision\'s prompt run, answered or failed, so a turn can be traced to it', async () => {
            const answeredRun = await RunRoutingDecision(input(), runner({ ...leaves(WRITER.ID), PromptRunID: PROMPT_RUN }));
            const failedRun = await RunRoutingDecision(input(), runner({ Success: false, ErrorMessage: 'unreadable answer', Answers: {}, PromptRunID: PROMPT_RUN }));
            const noRun = await RunRoutingDecision(input(), runner({ Success: false, ErrorMessage: 'no model', Answers: {} }));

            expect(answeredRun).toMatchObject({ Verdict: 'Routed', PromptRunID: PROMPT_RUN });
            expect(failedRun).toMatchObject({ Verdict: 'KeptContinuity', PromptRunID: PROMPT_RUN });
            expect(noRun.PromptRunID).toBeNull();
        });

        it('uses an answer that arrives in time', async () => {
            vi.useFakeTimers();
            const run = runner(() => new Promise(resolve => setTimeout(() => resolve(leaves(WRITER.ID)), DECISION_ROUTING_TIMEOUT_MS - 50)));

            const pending = RunRoutingDecision(input(), run);
            await vi.advanceTimersByTimeAsync(DECISION_ROUTING_TIMEOUT_MS - 49);

            expect((await pending).Verdict).toBe('Routed');
        });
    });

    describe('artifact targeting', () => {
        const withArtifacts = () => input({
            ArtifactVersions: BuildRoutingArtifactVersions([
                { Agent: WRITER, Artifacts: [artifactSummary('Press kit', [[VERSION_2, 2, null], [VERSION_1, 1, null]])] },
            ]),
        });

        it('applies only to the turn of the agent that made the version', () => {
            const outcome = InterpretRoutingAnswers(withArtifacts(), leaves(WRITER.ID, { artifact: choice(VERSION_2, 0.9) }));
            expect(ArtifactVersionForTurn(outcome, WRITER.ID)).toBe(VERSION_2);
            expect(ArtifactVersionForTurn(outcome, RESEARCH.ID)).toBeNull();
            expect(ArtifactVersionForTurn(null, WRITER.ID)).toBeNull();
        });
    });

    describe('ApplyRoutingDecision, then ResolveAgentTurn', () => {
        const outcome = (overrides: Partial<RoutingDecisionOutcome>): RoutingDecisionOutcome => ({
            Verdict: 'KeptContinuity', RoutedAgentId: null, TargetArtifact: null, Reason: '', PromptRunID: null, ...overrides,
        });

        it('a routed agent takes continuity\'s place, labelled DecisionRouted', () => {
            const applied = ApplyRoutingDecision(candidates(), outcome({ Verdict: 'Routed', RoutedAgentId: WRITER.ID }));
            expect(ResolveAgentTurn(applied, ALWAYS, isKnown)).toEqual({ AgentId: WRITER.ID, Route: 'DecisionRouted' });
        });

        it('someone else clears continuity, so the conversation manager answers', () => {
            const applied = ApplyRoutingDecision(candidates(), outcome({ Verdict: 'SomeoneElse' }));
            expect(ResolveAgentTurn(applied, ALWAYS, isKnown)).toEqual({ AgentId: MANAGER.ID, Route: 'ConversationManager' });
        });

        it('someone else falls through to a pinned agent first, as a conversation with no earlier agent would', () => {
            const pinned = candidates({ ConversationDefaultAgentId: ANALYST.ID });
            const applied = ApplyRoutingDecision(pinned, outcome({ Verdict: 'SomeoneElse' }));
            expect(ResolveAgentTurn(applied, ALWAYS, isKnown)).toEqual({ AgentId: ANALYST.ID, Route: 'ConversationDefault' });
        });

        it('kept continuity, or no decision, leaves routing exactly as it was', () => {
            const original = candidates();
            expect(ApplyRoutingDecision(original, outcome({}))).toBe(original);
            expect(ApplyRoutingDecision(original, null)).toBe(original);
            expect(ResolveAgentTurn(ApplyRoutingDecision(original, null), ALWAYS, isKnown))
                .toEqual({ AgentId: RESEARCH.ID, Route: 'Continuity' });
        });
    });
});
