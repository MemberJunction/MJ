/**
 * @fileoverview The pure builders of decision routing for an unmentioned message.
 *
 * Pins how the questions, options and state are built (and rebuilt) from the conversation, and how
 * the answers are read. These moved here from `@memberjunction/ng-conversations` with the functions
 * they test, so the chat and the Decision Eval harness build the decision with the same code. The
 * call, the deadline and the component wiring are pinned in ng-conversations.
 */
import { describe, it, expect } from 'vitest';
import type { ChoiceAnswer, ChoiceQuestion, DecisionAnswer, DecisionQuestion, LikelihoodAnswer, LikelihoodQuestion } from '@memberjunction/ai';
import { ConversationUtility } from '../conversation-utility';

import {
    BuildRecentTurnParts,
    BuildRecentTurns,
    BuildRoutingArtifactVersions,
    BuildRoutingQuestions,
    BuildRoutingState,
    BuildRoutingStateStructured,
    CalibratedContinuesProbability,
    CanAskRoutingDecision,
    CollectRoutingParticipants,
    DECISION_ROUTING_MIN_CONFIDENCE,
    DECISION_ROUTING_TIMEOUT_MS,
    InterpretRoutingAnswers,
    IsAgentAllowed,
    IsRoutableAgent,
    KeptContinuityOutcome,
    MAX_ROUTING_ARTIFACT_VERSIONS,
    ROUTING_ARTIFACT_QUESTION,
    ROUTING_CONTINUES_CALIBRATION,
    ROUTING_CONTINUES_QUESTION,
    ROUTING_NO_ARTIFACT,
    ROUTING_ROUTE_QUESTION,
    type RoutingAgent,
    type RoutingArtifactSummary,
    type RoutingCatalogAgent,
    type RoutingDecisionAnswers,
    type RoutingDecisionInput,
    type RoutingHistoryRow,
    type RoutingParticipant,
} from '../conversation-routing-decision';
import type { DecisionAnsweringModel } from '../decision-calibration';

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

/** The request the questions travel in, as the chat sends it. */
interface DecisionRequest {
    State: string | Record<string, unknown>;
    Questions: Record<string, DecisionQuestion>;
}

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

/** Jev at the version its routing calibration was fitted on. */
const JEV: DecisionAnsweringModel = { ModelName: 'Jev', ResolvedModel: 'typesafe/jev-1.13-20260917' };

/** LLM Decision answered by the chat model its routing calibration was fitted on. */
const LLM_DECISION: DecisionAnsweringModel = { ModelName: 'LLM Decision', ResolvedModel: 'GPT-OSS-120B' };

/** A successful decision, answered by a calibrated model unless the test says otherwise. */
function answered(answers: Record<string, DecisionAnswer>, answeredBy: DecisionAnsweringModel = JEV): RoutingDecisionAnswers {
    return { Success: true, Answers: answers, ...answeredBy };
}

/** A confident move away from Research, to the given agent. */
function leaves(to: string, extra: Record<string, DecisionAnswer> = {}): RoutingDecisionAnswers {
    return answered({ route: choice(to, 0.9), continues: likelihood(0.1), ...extra });
}

function routeQuestion(params: DecisionRequest): ChoiceQuestion {
    const question = params.Questions['route'];
    if (question?.Kind !== 'Choice') {
        throw new Error('no route Choice');
    }
    return question;
}

function artifactSummary(name: string, versions: Array<[string, number, string | null]>): RoutingArtifactSummary {
    return {
        artifactName: name,
        ArtifactType: 'Report',
        Versions: versions.map(([versionId, versionNumber, versionName]) => ({ versionId, versionNumber, versionName })),
    };
}

describe('conversation routing decision', () => {
    describe('the thresholds', () => {
        it('are the figures the Phase 2 Decision Eval set', () => {
            expect(DECISION_ROUTING_TIMEOUT_MS).toBe(350);
            expect(DECISION_ROUTING_MIN_CONFIDENCE).toBe(0.7);
            expect(ROUTING_CONTINUES_CALIBRATION).toEqual([
                { ModelName: 'Jev', ResolvedModel: 'typesafe/jev-1.13-20260917', Calibration: { A: 1.7757, B: -3.3506 } },
                { ModelName: 'LLM Decision', ResolvedModel: 'GPT-OSS-120B', Calibration: { A: 1.6508, B: -2.9110 } }
            ]);
        });
    });

    describe('the thread likelihood is calibrated per exact model', () => {
        it('maps a raw probability through the answering model\'s Platt calibration', () => {
            // Jev's raw 0.5 means about a 3% chance the thread continues
            expect(CalibratedContinuesProbability(0.5, JEV)).toBeCloseTo(0.0339, 4);
            expect(CalibratedContinuesProbability(0.5, LLM_DECISION)).toBeCloseTo(0.0516, 4);
            expect(CalibratedContinuesProbability(0.5, { ModelName: '  Jev ', ResolvedModel: ' typesafe/jev-1.13-20260917 ' })).toBeCloseTo(0.0339, 4);
        });

        it('has no calibrated probability for a model it was not fitted on', () => {
            const uncalibrated: DecisionAnsweringModel[] = [
                { ModelName: 'Some Other Model', ResolvedModel: 'some-vendor/some-model' },
                // Jev at another version: the vendor row's APIName was edited
                { ModelName: 'Jev', ResolvedModel: 'typesafe/jev-1.14-20261101' },
                // LLM Decision answered by another chat model (an installation with only an OpenAI key)
                { ModelName: 'LLM Decision', ResolvedModel: 'GPT 5.5 Instant' },
                // The right model name, but nothing says which model was behind it
                { ModelName: 'Jev' },
                { ModelName: 'LLM Decision', ResolvedModel: null },
                {},
                // Names that are Object.prototype members must not reach an inherited value
                { ModelName: 'constructor', ResolvedModel: 'constructor' },
                { ModelName: '__proto__', ResolvedModel: 'toString' }
            ];
            for (const answeredBy of uncalibrated) {
                expect(CalibratedContinuesProbability(0.99, answeredBy)).toBeNull();
            }
        });

        it('keeps continuity for LLM Decision answered by a chat model it was not fitted on', () => {
            // The review's probe: GPT-OSS-120B's fit turns a raw 0.75 into a calibrated 0.25, a
            // "leaves". Applied to another chat model's answer, that would route it away.
            const answers = { route: choice(WRITER.ID, 0.9), continues: likelihood(0.75) };
            expect(CalibratedContinuesProbability(0.75, LLM_DECISION)).toBeCloseTo(0.25, 2);
            expect(InterpretRoutingAnswers(input(), answered(answers, LLM_DECISION)).Verdict).toBe('Routed');
            const other = InterpretRoutingAnswers(input(), answered(answers, { ModelName: 'LLM Decision', ResolvedModel: 'GPT 5.5 Instant' }));
            expect(other.Verdict).toBe('KeptContinuity');
            expect(other.Reason).toBe('the thread likelihood is uncalibrated for LLM Decision (GPT 5.5 Instant)');
        });

        it('keeps continuity for Jev at a version it was not fitted on', () => {
            // The review's probe: Jev's fit turns a raw 0.8 into a calibrated 0.29, a "leaves".
            const answers = { route: choice(WRITER.ID, 0.9), continues: likelihood(0.8) };
            expect(InterpretRoutingAnswers(input(), answered(answers)).Verdict).toBe('Routed');
            const edited = InterpretRoutingAnswers(input(), answered(answers, { ModelName: 'Jev', ResolvedModel: 'typesafe/jev-1.14-20261101' }));
            expect(edited.Verdict).toBe('KeptContinuity');
            expect(edited.Reason).toContain('uncalibrated for Jev (typesafe/jev-1.14-20261101)');
        });

        it('keeps continuity when the probability is not a number', () => {
            const outcome = InterpretRoutingAnswers(input(), answered({ route: choice(WRITER.ID, 0.9), continues: likelihood(Number.NaN) }));
            expect(outcome.Verdict).toBe('KeptContinuity');
        });

        it('routes on a raw answer the uncalibrated check called unsure', () => {
            // Raw 0.45 sits in the old 0.3–0.7 middle; calibrated for Jev it is about 0.02
            const outcome = InterpretRoutingAnswers(input(), answered({ route: choice(WRITER.ID, 0.9), continues: likelihood(0.45) }));
            expect(outcome.Verdict).toBe('Routed');
            expect(outcome.RoutedAgentId).toBe(WRITER.ID);
        });

        it('keeps continuity when the calibrated probability is still in the middle', () => {
            // Raw 0.87 from Jev is a calibrated 0.51
            const outcome = InterpretRoutingAnswers(input(), answered({ route: choice(WRITER.ID, 0.9), continues: likelihood(0.87) }));
            expect(outcome.Verdict).toBe('KeptContinuity');
            expect(outcome.Reason).toContain('calibrated probability 0.506');
        });

        it('keeps continuity when the answering model is unnamed or uncalibrated, however sure it sounds', () => {
            for (const answeredBy of [{}, { ModelName: 'Jev' }, { ModelName: 'Some Other Model', ResolvedModel: 'x' }]) {
                const outcome = InterpretRoutingAnswers(input(), answered({ route: choice(WRITER.ID, 0.99), continues: likelihood(0.01) }, answeredBy));
                expect(outcome.Verdict).toBe('KeptContinuity');
                expect(outcome.Reason).toContain('uncalibrated');
            }
        });
    });

    describe('the question keys', () => {
        it('are the keys the questions and answers use', () => {
            const questions = BuildRoutingQuestions(input({
                ArtifactVersions: BuildRoutingArtifactVersions([{ Agent: WRITER, Artifacts: [artifactSummary('Press kit', [[VERSION_1, 1, null]])] }]),
            }));
            expect(Object.keys(questions)).toEqual([ROUTING_ROUTE_QUESTION, ROUTING_CONTINUES_QUESTION, ROUTING_ARTIFACT_QUESTION]);
            const artifact = questions[ROUTING_ARTIFACT_QUESTION];
            expect(artifact?.Kind === 'Choice' ? artifact.Options.at(-1)?.Value : undefined).toBe(ROUTING_NO_ARTIFACT);
        });
    });

    describe('IsAgentAllowed', () => {
        const TAGGED = 'AAAAAAAA-0000-0000-0000-000000000002';
        const OTHER = 'AAAAAAAA-0000-0000-0000-000000000006';

        it('allows every agent when there is no list', () => {
            expect(IsAgentAllowed(OTHER, null)).toBe(true);
            expect(IsAgentAllowed(OTHER, undefined)).toBe(true);
        });

        it('allows only listed agents, and none for an empty list', () => {
            expect(IsAgentAllowed(TAGGED, [TAGGED])).toBe(true);
            expect(IsAgentAllowed(OTHER, [TAGGED])).toBe(false);
            expect(IsAgentAllowed(TAGGED, [])).toBe(false);
        });

        it('never allows a missing agent', () => {
            expect(IsAgentAllowed(null, null)).toBe(false);
            expect(IsAgentAllowed(undefined, [TAGGED])).toBe(false);
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

    describe('BuildRecentTurnParts', () => {
        it('is the same turns as BuildRecentTurns, with speaker and text apart', () => {
            const history = [
                userRow('u1', 'Find sources'),
                agentRow('a1', RESEARCH, `Here  they\nare ${'y'.repeat(200)}`),
                { ID: 'z1', Role: 'AI', AgentID: 'CCCCCCCC-0000-0000-0000-000000000009', Message: 'from nobody known' } satisfies RoutingHistoryRow,
                userRow('u2', '   '),
            ];
            const parts = BuildRecentTurnParts(history, findAgent);
            expect(parts).toEqual([
                { Speaker: 'User', Message: 'Find sources' },
                { Speaker: 'Research', Message: `Here they are ${'y'.repeat(136)}...` },
                { Speaker: 'Agent', Message: 'from nobody known' },
            ]);
            expect(BuildRecentTurns(history, findAgent)).toEqual(parts.map(p => `${p.Speaker}: ${p.Message}`));
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

    describe('BuildRoutingArtifactVersions', () => {
        /** A version ID for artifact `artifact`, `age` versions older than its latest. */
        const versionId = (artifact: number, age: number): string =>
            `CCCCCCCC-0000-0000-${String(artifact).padStart(4, '0')}-${String(age).padStart(12, '0')}`;

        /** An artifact with `count` versions, newest first. */
        function deepArtifact(name: string, artifact: number, count: number): RoutingArtifactSummary {
            return artifactSummary(name, Array.from({ length: count }, (_, age): [string, number, string | null] =>
                [versionId(artifact, age), count - age, null]));
        }

        const ids = (versions: ReturnType<typeof BuildRoutingArtifactVersions>): string[] => versions.map(v => v.ArtifactVersionId);
        const range = (artifact: number, count: number): string[] => Array.from({ length: count }, (_, age) => versionId(artifact, age));

        it(`offers at most ${MAX_ROUTING_ARTIFACT_VERSIONS}: every artifact's latest first, then older ones, in their order`, () => {
            const versions = BuildRoutingArtifactVersions([
                { Agent: WRITER, Artifacts: [deepArtifact('Press kit', 1, 30)] },
                { Agent: RESEARCH, Artifacts: [deepArtifact('Sources', 2, 5), deepArtifact('Notes', 3, 1)] },
            ]);

            expect(versions).toHaveLength(MAX_ROUTING_ARTIFACT_VERSIONS);
            expect(ids(versions)).toEqual([...range(1, 14), ...range(2, 5), ...range(3, 1)]);
        });

        it('keeps a crowded conversation under the server\'s option limit, so the agent choice is still asked', () => {
            const agents = Array.from({ length: 7 }, (_, i): RoutingAgent => ({ ID: `DDDDDDDD-0000-0000-0000-00000000000${i}`, Name: `Agent ${i}`, Description: null }));
            const versions = BuildRoutingArtifactVersions(agents.map((agent, i) => ({ Agent: agent, Artifacts: [deepArtifact(`Doc ${i}`, i, 40)] })));
            const questions = BuildRoutingQuestions(input({ ArtifactVersions: versions }));
            const artifact = questions['artifact'];

            expect(ids(versions)).toEqual(expect.arrayContaining(agents.map((_, i) => versionId(i, 0))));
            expect(artifact?.Kind === 'Choice' ? artifact.Options.length : 0).toBe(MAX_ROUTING_ARTIFACT_VERSIONS + 1);
            // RunDecisionResolver.MAX_OPTIONS_PER_QUESTION: over it, the server refuses the whole request.
            expect(MAX_ROUTING_ARTIFACT_VERSIONS + 1).toBeLessThanOrEqual(255);
            expect(questions['route']?.Kind).toBe('Choice');
        });

        it('offers a version once, even when two agents\' replies carry it', () => {
            const shared = artifactSummary('Press kit', [[VERSION_1, 1, null]]);
            const versions = BuildRoutingArtifactVersions([{ Agent: WRITER, Artifacts: [shared] }, { Agent: RESEARCH, Artifacts: [shared] }]);

            expect(versions).toEqual([{ AgentId: WRITER.ID, ArtifactVersionId: VERSION_1, Description: expect.stringContaining('made by Writer') }]);
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

    describe('BuildRoutingStateStructured', () => {
        it('holds the last agent, the recent turns, its artifacts and the new message, as an object', () => {
            const artifacts = [artifactSummary('Press kit', [[VERSION_2, 2, 'Final'], [VERSION_1, 1, null]])];
            const state = BuildRoutingStateStructured(input({
                RecentTurnParts: [{ Speaker: 'User', Message: 'Find sources on renewals' }, { Speaker: 'Research', Message: 'Here are five sources.' }],
                ContinuityArtifacts: artifacts,
            }));
            expect(state).toEqual({
                previous_agent: { name: 'Research', description: 'Finds and summarises sources.' },
                recent_conversation: [
                    { speaker: 'User', message: 'Find sources on renewals' },
                    { speaker: 'Research', message: 'Here are five sources.' },
                ],
                previous_agent_artifacts: [
                    { name: 'Press kit', type: 'Report', versions: [{ number: 2, name: 'Final' }, { number: 1, name: null }] },
                ],
                latest_user_message: 'Now turn that into a press release',
            });
        });

        it('splits RecentTurns at the first ": " when the parts are absent, and lists no artifacts', () => {
            const state = BuildRoutingStateStructured(input({ RecentTurns: ['User: a: b', 'no speaker here'] }));
            expect(state.recent_conversation).toEqual([{ speaker: 'User', message: 'a: b' }, { speaker: '', message: 'no speaker here' }]);
            expect(state.previous_agent_artifacts).toEqual([]);
        });

        it('truncates the new message as BuildRoutingState does', () => {
            const long = `${'m'.repeat(1200)}`;
            const structured = BuildRoutingStateStructured(input({ Message: long }));
            const text = BuildRoutingState(input({ Message: long, RecentTurns: [] }));
            expect(structured.latest_user_message).toBe(`${'m'.repeat(1000)}...`);
            expect(text.endsWith(structured.latest_user_message)).toBe(true);
        });

        it('takes the last agent from its participant entry, with a stand-in when it has none', () => {
            const noDescription = BuildRoutingStateStructured(input({ ContinuityAgentId: ANALYST.ID, Participants: [participant(ANALYST, 'x')] }));
            expect(noDescription.previous_agent).toEqual({ name: 'Analyst', description: null });
            const missing = BuildRoutingStateStructured(input({ Participants: [participant(WRITER, 'x')] }));
            expect(missing.previous_agent).toEqual({ name: 'the last agent that answered', description: null });
        });

        it('builds the same recent turns from a conversation as BuildRecentTurns', () => {
            const history = [userRow('u1', 'Find sources'), agentRow('a1', RESEARCH, 'Here you go')];
            const state = BuildRoutingStateStructured(input({
                RecentTurns: BuildRecentTurns(history, findAgent),
                RecentTurnParts: BuildRecentTurnParts(history, findAgent),
            }));
            expect(state.recent_conversation).toEqual([{ speaker: 'User', message: 'Find sources' }, { speaker: 'Research', message: 'Here you go' }]);
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

    describe('KeptContinuityOutcome', () => {
        it('keeps today\'s routing, for the given reason', () => {
            expect(KeptContinuityOutcome('no answer')).toEqual({ Verdict: 'KeptContinuity', RoutedAgentId: null, TargetArtifact: null, Reason: 'no answer', PromptRunID: null });
        });
    });

    describe('the prompt run', () => {
        it('is carried, answered or failed, so a turn can be traced to it', () => {
            const answeredRun = InterpretRoutingAnswers(input(), { ...leaves(WRITER.ID), PromptRunID: PROMPT_RUN });
            const failedRun = InterpretRoutingAnswers(input(), { Success: false, ErrorMessage: 'unreadable answer', Answers: {}, PromptRunID: PROMPT_RUN });
            const noRun = InterpretRoutingAnswers(input(), { Success: false, ErrorMessage: 'no model', Answers: {} });

            expect(answeredRun).toMatchObject({ Verdict: 'Routed', PromptRunID: PROMPT_RUN });
            expect(failedRun).toMatchObject({ Verdict: 'KeptContinuity', PromptRunID: PROMPT_RUN });
            expect(noRun.PromptRunID).toBeNull();
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
    });
});
