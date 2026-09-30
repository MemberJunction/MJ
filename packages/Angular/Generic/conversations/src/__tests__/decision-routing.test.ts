/**
 * @fileoverview Decision routing for an unmentioned message, with the decision call mocked.
 *
 * Pins when a message gets a decision at all, how the questions and options are built (and
 * rebuilt) from the conversation, and how the answers are read: a confident answer replaces
 * continuity, and an error, a slow answer or an unsure one keeps it. The component wiring is
 * pinned in message-input-decision-routing.test.ts.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ChoiceAnswer, ChoiceQuestion, DecisionAnswer, LikelihoodAnswer, LikelihoodQuestion } from '@memberjunction/ai';
import { ConversationUtility } from '@memberjunction/ai-core-plus';
import type { RunDecisionParams, RunDecisionResult } from '@memberjunction/graphql-dataprovider';

import {
    ApplyRoutingDecision,
    ArtifactVersionForTurn,
    BuildRecentTurns,
    BuildRoutingArtifactVersions,
    BuildRoutingQuestions,
    BuildRoutingState,
    CanAskRoutingDecision,
    CollectRoutingParticipants,
    DECISION_ROUTING_MIN_CONFIDENCE,
    DECISION_ROUTING_TIMEOUT_MS,
    InterpretRoutingAnswers,
    IsRoutableAgent,
    RunRoutingDecision,
    ShouldRunRoutingDecision,
    type RoutingAgent,
    type RoutingCatalogAgent,
    type RoutingDecisionGate,
    type RoutingDecisionInput,
    type RoutingDecisionOutcome,
    type RoutingDecisionRunner,
    type RoutingHistoryRow,
    type RoutingParticipant,
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

function userRow(id: string, message: string): RoutingHistoryRow {
    return { ID: id, Role: 'User', AgentID: null, Message: message };
}

function agentRow(id: string, agent: RoutingAgent, message: string): RoutingHistoryRow {
    return { ID: id, Role: 'AI', AgentID: agent.ID, Message: message };
}

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

function routeQuestion(params: RunDecisionParams): ChoiceQuestion {
    const question = params.Questions['route'];
    if (question?.Kind !== 'Choice') {
        throw new Error('no route Choice');
    }
    return question;
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

    describe('the thresholds', () => {
        it('are the brief\'s figures until calibration sets them', () => {
            expect(DECISION_ROUTING_TIMEOUT_MS).toBe(250);
            expect(DECISION_ROUTING_MIN_CONFIDENCE).toBe(0.7);
        });
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

    describe('CollectRoutingParticipants', () => {
        const history = [
            userRow('u1', 'Find sources'),
            agentRow('a1', RESEARCH, 'First pass'),
            agentRow('m1', MANAGER, 'Handing to Writer'),
            agentRow('a2', WRITER, 'Draft one'),
            userRow('u2', 'More sources please'),
            agentRow('a3', RESEARCH, 'Second   pass,\n with more'),
        ];

        it('lists each agent that answered once, newest first, with its newest reply on one line', () => {
            const participants = CollectRoutingParticipants(history, MANAGER.ID, null, findAgent);
            expect(participants).toEqual([participant(RESEARCH, 'Second pass, with more'), participant(WRITER, 'Draft one')]);
        });

        it('leaves out agents the host does not allow and agents the catalog does not know', () => {
            const unknown: RoutingHistoryRow = { ID: 'x1', Role: 'AI', AgentID: 'CCCCCCCC-0000-0000-0000-000000000009', Message: '?' };
            const participants = CollectRoutingParticipants([...history, unknown], MANAGER.ID, [WRITER.ID, MANAGER.ID], findAgent);
            expect(participants.map(p => p.Agent.ID)).toEqual([WRITER.ID]);
        });

        it('leaves out agents that are no longer active or are restricted, as the \'@\' list does', () => {
            const catalog: RoutingCatalogAgent[] = [MANAGER, { ...RESEARCH, Status: 'Disabled' }, { ...WRITER, IsRestricted: true }, ANALYST];
            const lookup = (id: string): RoutingCatalogAgent | undefined => catalog.find(a => a.ID === id);
            const rows = [...history, agentRow('a4', ANALYST, 'Figures attached')];

            expect(CollectRoutingParticipants(rows, MANAGER.ID, null, lookup).map(p => p.Agent.ID)).toEqual([ANALYST.ID]);
        });

        it('IsRoutableAgent needs an active, unrestricted agent', () => {
            expect(IsRoutableAgent({ Status: 'Active', IsRestricted: false })).toBe(true);
            expect(IsRoutableAgent({ Status: 'Pending', IsRestricted: false })).toBe(false);
            expect(IsRoutableAgent({ Status: 'Disabled', IsRestricted: false })).toBe(false);
            expect(IsRoutableAgent({ Status: 'Active', IsRestricted: true })).toBe(false);
        });

        it('truncates a long reply', () => {
            const long = 'x'.repeat(400);
            const [only] = CollectRoutingParticipants([agentRow('a1', RESEARCH, long)], MANAGER.ID, null, findAgent);
            expect(only.LastReply).toBe(`${'x'.repeat(150)}...`);
        });
    });

    describe('BuildRecentTurns', () => {
        it('keeps the last six turns, oldest first, as "Speaker: text"', () => {
            const history = Array.from({ length: 8 }, (_, i) =>
                i % 2 === 0 ? userRow(`u${i}`, `question ${i}`) : agentRow(`a${i}`, RESEARCH, `answer ${i}`));
            expect(BuildRecentTurns(history, findAgent)).toEqual([
                'User: question 2', 'Research: answer 3', 'User: question 4',
                'Research: answer 5', 'User: question 6', 'Research: answer 7',
            ]);
        });

        it('shows a mention as its name, not its stored JSON', () => {
            const tagged = ConversationUtility.CreateMention('user', 'user-2', 'Dana');
            expect(BuildRecentTurns([userRow('u1', `${tagged} can you check this?`)], findAgent))
                .toEqual(['User: @Dana can you check this?']);
        });
    });

    describe('the questions', () => {
        it('offer every participant by description and last reply, then the conversation manager as someone else', () => {
            const question = routeQuestion({ State: '', Questions: BuildRoutingQuestions(input()) });

            expect(question.Options.map(o => o.Value)).toEqual([RESEARCH.ID, WRITER.ID, MANAGER.ID]);
            expect(question.Options[0].Description).toContain('Finds and summarises sources.');
            expect(question.Options[0].Description).toContain('Here are five sources.');
            expect(question.Options[2].Description).toMatch(/^Someone else\./);
            expect(question.Options[2].Description).toContain('Sage');
        });

        it('ask whether the message continues the thread with the last agent', () => {
            const expected: LikelihoodQuestion = {
                Kind: 'Likelihood',
                Instructions: 'The user\'s new message continues the current thread with Research.',
            };
            expect(BuildRoutingQuestions(input())['continues']).toEqual(expected);
        });

        it('leave the manager out when the chat does not allow it', () => {
            const question = routeQuestion({ State: '', Questions: BuildRoutingQuestions(input({ AllowedAgentIDs: [RESEARCH.ID, WRITER.ID] })) });
            expect(question.Options.map(o => o.Value)).toEqual([RESEARCH.ID, WRITER.ID]);
        });

        it('ask nothing about artifacts when the participants have none', () => {
            expect(Object.keys(BuildRoutingQuestions(input()))).toEqual(['route', 'continues']);
        });

        it('with artifacts, ask which version the message modifies, with "none" as an option', () => {
            const versions = BuildRoutingArtifactVersions([
                { Agent: WRITER, Artifacts: [artifactSummary('Press kit', [[VERSION_2, 2, 'Final'], [VERSION_1, 1, null]])] },
                { Agent: RESEARCH, Artifacts: [] },
            ]);
            const artifact = BuildRoutingQuestions(input({ ArtifactVersions: versions }))['artifact'];

            expect(artifact?.Kind).toBe('Choice');
            const options = artifact?.Kind === 'Choice' ? artifact.Options : [];
            expect(options.map(o => o.Value)).toEqual([VERSION_2, VERSION_1, 'none']);
            expect(options[0].Description).toBe('"Press kit" (Report), version 2 "Final", the latest, made by Writer');
            expect(options[1].Description).toBe('"Press kit" (Report), version 1, made by Writer');
        });

        it('are rebuilt from the conversation\'s agents as they are now', () => {
            const before = [userRow('u1', 'Find sources'), agentRow('a1', RESEARCH, 'Here you go')];
            const after = [...before, userRow('u2', 'Draft it'), agentRow('a2', WRITER, 'Drafted')];
            const optionsFor = (history: RoutingHistoryRow[], continuity: string) => routeQuestion({
                State: '',
                Questions: BuildRoutingQuestions(input({
                    ContinuityAgentId: continuity,
                    Participants: CollectRoutingParticipants(history, MANAGER.ID, null, findAgent),
                })),
            }).Options.map(o => o.Value);

            expect(optionsFor(before, RESEARCH.ID)).toEqual([RESEARCH.ID, MANAGER.ID]);
            expect(optionsFor(after, WRITER.ID)).toEqual([WRITER.ID, RESEARCH.ID, MANAGER.ID]);
        });
    });

    describe('BuildRoutingState', () => {
        it('holds the recent turns and the new message', () => {
            expect(BuildRoutingState(input())).toBe([
                'Recent conversation, oldest first:',
                'User: Find sources on renewals',
                'Research: Here are five sources.',
                '',
                'The user\'s new message:',
                'Now turn that into a press release',
            ].join('\n'));
        });
    });

    describe('CanAskRoutingDecision', () => {
        it('needs the last agent among the participants and two options to choose between', () => {
            expect(CanAskRoutingDecision(input())).toBe(true);
            expect(CanAskRoutingDecision(input({ Participants: [participant(WRITER, 'x')] }))).toBe(false);
            expect(CanAskRoutingDecision(input({ Participants: [participant(RESEARCH, 'x')], ConversationManager: null }))).toBe(false);
            expect(CanAskRoutingDecision(input({ Participants: [participant(RESEARCH, 'x')] }))).toBe(true);
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
            const run = runner(() => new Promise(resolve => setTimeout(() => resolve(leaves(WRITER.ID)), DECISION_ROUTING_TIMEOUT_MS + 50)));

            const pending = RunRoutingDecision(input(), run);
            await vi.advanceTimersByTimeAsync(DECISION_ROUTING_TIMEOUT_MS + 1);
            const outcome = await pending;
            await vi.advanceTimersByTimeAsync(100);

            expect(outcome.Verdict).toBe('KeptContinuity');
            expect(outcome.Reason).toContain('250 ms');
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

        it('names the version when the answer is confident', () => {
            const outcome = InterpretRoutingAnswers(withArtifacts(), leaves(WRITER.ID, { artifact: choice(VERSION_1, 0.9) }));
            expect(outcome.TargetArtifact).toEqual({ AgentId: WRITER.ID, ArtifactVersionId: VERSION_1 });
        });

        it('names nothing for "none"', () => {
            const outcome = InterpretRoutingAnswers(withArtifacts(), leaves(WRITER.ID, { artifact: choice('none', 0.95) }));
            expect(outcome.TargetArtifact).toBeNull();
        });

        it('names nothing when the answer is unsure', () => {
            const outcome = InterpretRoutingAnswers(withArtifacts(), leaves(WRITER.ID, { artifact: choice(VERSION_1, 0.6) }));
            expect(outcome.TargetArtifact).toBeNull();
        });

        it('names nothing for a version it was not offered', () => {
            const outcome = InterpretRoutingAnswers(withArtifacts(), leaves(WRITER.ID, { artifact: choice('CCCCCCCC-0000-0000-0000-000000000001', 0.9) }));
            expect(outcome.TargetArtifact).toBeNull();
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
            Verdict: 'KeptContinuity', RoutedAgentId: null, TargetArtifact: null, Reason: '', ...overrides,
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
