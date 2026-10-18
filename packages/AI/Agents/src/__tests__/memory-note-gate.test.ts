import { describe, it, expect } from 'vitest';
import { ApplyPlattCalibration, type LikelihoodAnswer, type PlattCalibration } from '@memberjunction/ai';
import { FindDecisionCalibration, type DecisionAnsweringModel, type DecisionModelCalibration } from '@memberjunction/ai-core-plus';
import {
    BuildMemoryNoteQuestions,
    BuildMemoryNoteState,
    JudgeMemoryNotes,
    MemoryNotePromptQuestionCap,
    ChunkMemoryNotes,
    FormatMemoryNoteExcerpt,
    GroupMemoryNotesByConversation,
    MEMORY_NOTE_QUESTION_INSTRUCTIONS,
    MEMORY_NOTE_MAX_CONTENT_CHARS,
    MEMORY_NOTE_MAX_EXCERPT_CHARS,
    MEMORY_NOTE_MIN_PROBABILITY,
    MEMORY_NOTE_DECISION_CALIBRATION,
    type MemoryNoteCandidate,
    type MemoryNoteConversation,
    type MemoryNoteEngineSource
} from '../memory-note-gate';

/** Jev at the version the memory-note calibration was fitted on. */
const JEV: DecisionAnsweringModel = { ModelName: 'Jev', ResolvedModel: 'typesafe/jev-1.13-20260917' };

/** Jev's shipped memory-note calibration. */
function jevCalibration(): PlattCalibration {
    const calibration = FindDecisionCalibration(MEMORY_NOTE_DECISION_CALIBRATION, JEV);
    if (!calibration) {
        throw new Error('Jev has no memory-note calibration');
    }
    return calibration;
}

describe('memory-note-gate', () => {
    describe('BuildMemoryNoteQuestions', () => {
        it('returns empty record for empty notes array', () => {
            const questions = BuildMemoryNoteQuestions([]);
            expect(questions).toEqual({});
        });

        it('builds likelihood questions keyed n1, n2, ..., each quoting its own note', () => {
            const notes: MemoryNoteCandidate[] = [
                { type: 'Preference', content: 'Prefers TypeScript' },
                { type: 'Constraint', content: 'Must use Vitest', scopeLevel: 'company' }
            ];
            const questions = BuildMemoryNoteQuestions(notes);

            expect(Object.keys(questions)).toEqual(['n1', 'n2']);
            expect(questions.n1).toEqual({
                Kind: 'Likelihood',
                Instructions: `${MEMORY_NOTE_QUESTION_INSTRUCTIONS}\n\nThe note (Preference, user scope): "Prefers TypeScript"`
            });
            expect(questions.n2.Instructions).toContain('The note (Constraint, company scope): "Must use Vitest"');
        });

        it('makes every question distinct, so a driver answering each alone can tell the notes apart', () => {
            const questions = BuildMemoryNoteQuestions([
                { type: 'Preference', content: 'Prefers TypeScript' },
                { type: 'Preference', content: 'Prefers dark mode' }
            ]);

            expect(questions.n1.Instructions).not.toEqual(questions.n2.Instructions);
        });

        it('caps the quoted note at the content limit', () => {
            const questions = BuildMemoryNoteQuestions([{ type: 'Context', content: 'x'.repeat(MEMORY_NOTE_MAX_CONTENT_CHARS + 500) }]);

            expect(questions.n1.Instructions).toContain('x'.repeat(MEMORY_NOTE_MAX_CONTENT_CHARS) + '"');
            expect(questions.n1.Instructions).not.toContain('x'.repeat(MEMORY_NOTE_MAX_CONTENT_CHARS + 1));
        });
    });

    describe('BuildMemoryNoteState', () => {
        it('projects notes and caps content at 1000 characters', () => {
            const longContent = 'A'.repeat(1500);
            const notes: MemoryNoteCandidate[] = [
                { type: 'Preference', content: longContent, scopeLevel: 'user' },
                { type: 'Issue', content: 'Short issue', scopeLevel: 'company' }
            ];

            const state = BuildMemoryNoteState(notes);
            expect(Object.keys(state.notes)).toEqual(['n1', 'n2']);
            expect(state.notes.n1.content.length).toBe(MEMORY_NOTE_MAX_CONTENT_CHARS);
            expect(state.notes.n1.scope).toBe('user');
            expect(state.notes.n2.content).toBe('Short issue');
            expect(state.notes.n2.scope).toBe('company');
            expect(state.conversationExcerpt).toBeUndefined();
        });

        it('defaults scope to "user" when not provided', () => {
            const notes: MemoryNoteCandidate[] = [{ type: 'Context', content: 'Some context' }];
            const state = BuildMemoryNoteState(notes);
            expect(state.notes.n1.scope).toBe('user');
        });

        it('caps conversation excerpt at 4000 characters', () => {
            const longExcerpt = 'X'.repeat(5000);
            const state = BuildMemoryNoteState([], longExcerpt);
            expect(state.conversationExcerpt?.length).toBe(MEMORY_NOTE_MAX_EXCERPT_CHARS);
        });

        it('formats array and object excerpts correctly', () => {
            const arrayExcerpt = ['Turn 1: Hello', 'Turn 2: Hi there'];
            const stateArr = BuildMemoryNoteState([], arrayExcerpt);
            expect(stateArr.conversationExcerpt).toBe('Turn 1: Hello\n---\nTurn 2: Hi there');

            const objExcerpt = { conv1: 'User: help', conv2: 'User: thanks' };
            const stateObj = BuildMemoryNoteState([], objExcerpt);
            expect(stateObj.conversationExcerpt).toBe('[conv1]: User: help\n---\n[conv2]: User: thanks');
        });
    });

    describe('MEMORY_NOTE_DECISION_CALIBRATION', () => {
        it('holds only the models measured to beat the self-reported confidence, each at the exact model it was fitted on, frozen', () => {
            expect(MEMORY_NOTE_DECISION_CALIBRATION.map(c => [c.ModelName, c.ResolvedModel])).toEqual([['Jev', 'typesafe/jev-1.13-20260917']]);
            expect(Object.isFrozen(MEMORY_NOTE_DECISION_CALIBRATION)).toBe(true);
            for (const entry of MEMORY_NOTE_DECISION_CALIBRATION) {
                expect(Object.isFrozen(entry)).toBe(true);
                expect(Object.isFrozen(entry.Calibration)).toBe(true);
            }
        });
    });

    describe('the shipped operating point, as measured (plan Task 3.4, 2026-09-29)', () => {
        // Changing any of these changes what the gate keeps: refit and re-measure first, then update
        // them together with the results doc.
        it('keeps a note at a calibrated 0.6', () => {
            expect(MEMORY_NOTE_MIN_PROBABILITY).toBe(0.6);
        });

        it("holds Jev's measured Platt parameters, at the version they were fitted on", () => {
            expect(FindDecisionCalibration(MEMORY_NOTE_DECISION_CALIBRATION, JEV)).toEqual({ A: 3.6391, B: -5.7059 });
        });

        it('puts the cut at a raw 0.8428 for Jev: raw 0.843 calibrates to 0.601, raw 0.842 to 0.595', () => {
            const jev = jevCalibration();
            expect(ApplyPlattCalibration(0.843, jev)).toBeCloseTo(0.6012, 4);
            expect(ApplyPlattCalibration(0.842, jev)).toBeCloseTo(0.5946, 4);
            expect(ApplyPlattCalibration(0.9, jev)).toBeCloseTo(0.908, 3);
            expect(ApplyPlattCalibration(0.6, jev)).toBeCloseTo(0.0143, 4);
        });

        it("keeps and drops Jev's answers either side of the cut, by default", () => {
            const notes: MemoryNoteCandidate[] = [
                { type: 'Preference', content: 'Prefers weekly summaries' },
                { type: 'Preference', content: 'Prefers metric units' }
            ];
            const answers: Record<string, LikelihoodAnswer> = {
                n1: { Kind: 'Likelihood', Probability: 0.843 },
                n2: { Kind: 'Likelihood', Probability: 0.842 }
            };
            const verdict = JudgeMemoryNotes(answers, notes, JEV);
            expect(verdict.KeptNotes).toEqual([notes[0]]);
        });
    });

    describe('FormatMemoryNoteExcerpt', () => {
        it("quotes one conversation as the measurement's corpus did: one `[role]: text` line per turn", () => {
            expect(FormatMemoryNoteExcerpt([
                { role: 'user', text: 'I prefer dark mode' },
                { role: 'assistant', text: 'Understood' }
            ])).toBe('[user]: I prefer dark mode\n[assistant]: Understood');
            expect(FormatMemoryNoteExcerpt([])).toBe('');
        });
    });

    describe('GroupMemoryNotesByConversation', () => {
        const A = 'aaaaaaaa-1111-4000-8000-000000000001';
        const B = 'aaaaaaaa-1111-4000-8000-000000000002';
        const conversations: MemoryNoteConversation[] = [
            { ConversationId: A, Turns: [{ role: 'user', text: 'About the revenue report' }] },
            { ConversationId: B, Turns: [{ role: 'user', text: 'Always answer me in Spanish' }] }
        ];

        it("puts each note with its own conversation, comparing IDs as UUIDs, in the conversations' order", () => {
            const fromB: MemoryNoteCandidate = { type: 'Preference', content: 'Wants answers in Spanish', sourceConversationId: B.toUpperCase() };
            const fromA: MemoryNoteCandidate = { type: 'Context', content: 'Owns the revenue report', sourceConversationId: A };
            const grouping = GroupMemoryNotesByConversation([fromB, fromA], conversations);

            expect(grouping.Unattributed).toEqual([]);
            expect(grouping.Batches).toEqual([
                { ConversationId: A, Excerpt: '[user]: About the revenue report', Notes: [fromA] },
                { ConversationId: B, Excerpt: '[user]: Always answer me in Spanish', Notes: [fromB] }
            ]);
        });

        it('leaves a note naming none of several conversations unattributed', () => {
            const unnamed: MemoryNoteCandidate = { type: 'Preference', content: 'Prefers concise replies' };
            const elsewhere: MemoryNoteCandidate = { type: 'Preference', content: 'Prefers tables', sourceConversationId: 'aaaaaaaa-1111-4000-8000-000000000009' };
            const grouping = GroupMemoryNotesByConversation([unnamed, elsewhere], conversations);

            expect(grouping.Batches).toEqual([]);
            expect(grouping.Unattributed).toEqual([unnamed, elsewhere]);
        });

        it('puts every note with the only conversation when there is one', () => {
            const unnamed: MemoryNoteCandidate = { type: 'Preference', content: 'Prefers concise replies' };
            const grouping = GroupMemoryNotesByConversation([unnamed], [conversations[1]]);

            expect(grouping.Batches.map(b => [b.ConversationId, b.Notes])).toEqual([[B, [unnamed]]]);
            expect(grouping.Unattributed).toEqual([]);
        });
    });

    describe('JudgeMemoryNotes', () => {
        // Identity calibration (A = 1, B = 0) maps logit(p) back to p: sigmoid(1 * logit(p) + 0) = p.
        const GPT_4O: DecisionAnsweringModel = { ModelName: 'gpt-4o', ResolvedModel: 'openai/gpt-4o-2024-08-06' };
        const IDENTITY_CALIBRATIONS: DecisionModelCalibration<PlattCalibration>[] = [
            { ModelName: 'gpt-4o', ResolvedModel: 'openai/gpt-4o-2024-08-06', Calibration: { A: 1, B: 0 } }
        ];
        const candidateNotes: MemoryNoteCandidate[] = [
            { type: 'Preference', content: 'Prefers dark mode' },
            { type: 'Issue', content: 'Printer offline' }
        ];

        const confidentAnswers: Record<string, LikelihoodAnswer> = {
            n1: { Kind: 'Likelihood', Probability: 0.95 },
            n2: { Kind: 'Likelihood', Probability: 0.88 }
        };

        it('drops all notes and marks Calibrated=false when model is uncalibrated', () => {
            const verdict = JudgeMemoryNotes(confidentAnswers, candidateNotes, { ModelName: 'Claude 3.5 Sonnet', ResolvedModel: 'anthropic/claude-3.5-sonnet' });
            expect(verdict.Calibrated).toBe(false);
            expect(verdict.KeptNotes).toHaveLength(0);
            expect(verdict.JudgedNotes).toHaveLength(2);
            expect(verdict.JudgedNotes[0].Kept).toBe(false);
            expect(verdict.JudgedNotes[0].Reason).toContain('has no memory-note calibration');
        });

        it('calibrates Jev at the version its calibration was fitted on, by default', () => {
            const verdict = JudgeMemoryNotes(confidentAnswers, candidateNotes, JEV);
            const jev = jevCalibration();

            expect(verdict.Calibrated).toBe(true);
            expect(verdict.AnsweredBy).toEqual(JEV);
            expect(verdict.JudgedNotes.map(j => j.CalibratedProbability)).toEqual([
                ApplyPlattCalibration(0.95, jev),
                ApplyPlattCalibration(0.88, jev)
            ]);
            expect(verdict.KeptNotes).toEqual(candidateNotes);
        });

        it.each<[string, DecisionAnsweringModel]>([
            ['Jev at another version', { ModelName: 'Jev', ResolvedModel: 'typesafe/jev-1.14-20261101' }],
            ['Jev with no resolved model reported', { ModelName: 'Jev' }],
            ['a model named constructor', { ModelName: 'constructor', ResolvedModel: 'constructor' }],
            ['a model named constructor at the pinned Jev version', { ModelName: 'constructor', ResolvedModel: 'typesafe/jev-1.13-20260917' }]
        ])('leaves %s uncalibrated, keeping nothing', (_label, answeredBy) => {
            const verdict = JudgeMemoryNotes(confidentAnswers, candidateNotes, answeredBy);

            expect(verdict.Calibrated).toBe(false);
            expect(verdict.KeptNotes).toEqual([]);
            expect(verdict.JudgedNotes.every(j => !j.Kept && j.CalibratedProbability === undefined)).toBe(true);
            expect(verdict.JudgedNotes[0].Reason).toContain('has no memory-note calibration');
        });

        it('drops all notes when no model name is specified and calibration is empty', () => {
            const answers: Record<string, LikelihoodAnswer> = {
                n1: { Kind: 'Likelihood', Probability: 0.95 }
            };
            const verdict = JudgeMemoryNotes(answers, candidateNotes);
            expect(verdict.Calibrated).toBe(false);
            expect(verdict.KeptNotes).toHaveLength(0);
            expect(verdict.JudgedNotes[0].Reason).toBe('No answering model was reported, so the gate keeps nothing');
        });

        it('applies Platt calibration and keeps notes meeting threshold for calibrated model', () => {
            const answers: Record<string, LikelihoodAnswer> = {
                n1: { Kind: 'Likelihood', Probability: 0.8 },
                n2: { Kind: 'Likelihood', Probability: 0.3 }
            };

            const verdict = JudgeMemoryNotes(
                answers,
                candidateNotes,
                GPT_4O,
                0.5,
                IDENTITY_CALIBRATIONS
            );

            expect(verdict.Calibrated).toBe(true);
            expect(verdict.KeptNotes).toEqual([candidateNotes[0]]);
            expect(verdict.JudgedNotes[0].Kept).toBe(true);
            expect(verdict.JudgedNotes[0].CalibratedProbability).toBeCloseTo(0.8, 3);
            expect(verdict.JudgedNotes[1].Kept).toBe(false);
            expect(verdict.JudgedNotes[1].CalibratedProbability).toBeCloseTo(0.3, 3);
        });

        it('matches the answering model as the shared lookup does: exactly, after trimming', () => {
            const answers: Record<string, LikelihoodAnswer> = {
                n1: { Kind: 'Likelihood', Probability: 0.9 }
            };
            const trimmed = JudgeMemoryNotes(answers, [candidateNotes[0]], { ModelName: ' gpt-4o ', ResolvedModel: 'openai/gpt-4o-2024-08-06\n' }, 0.5, IDENTITY_CALIBRATIONS);
            const recased = JudgeMemoryNotes(answers, [candidateNotes[0]], { ModelName: 'GPT-4o', ResolvedModel: GPT_4O.ResolvedModel }, 0.5, IDENTITY_CALIBRATIONS);

            expect(trimmed.Calibrated).toBe(true);
            expect(trimmed.KeptNotes).toHaveLength(1);
            expect(recased.Calibrated).toBe(false);
        });

        it('handles missing or malformed answers safely by dropping note', () => {
            const answers: Record<string, LikelihoodAnswer> = {
                // n1 missing
                n2: { Kind: 'Likelihood', Probability: NaN }
            };
            const verdict = JudgeMemoryNotes(
                answers,
                candidateNotes,
                GPT_4O,
                0.5,
                IDENTITY_CALIBRATIONS
            );
            expect(verdict.KeptNotes).toHaveLength(0);
            expect(verdict.JudgedNotes[0].Kept).toBe(false);
            expect(verdict.JudgedNotes[0].Reason).toContain('Missing or invalid Likelihood answer');
            expect(verdict.JudgedNotes[1].Kept).toBe(false);
            expect(verdict.JudgedNotes[1].Reason).toContain('Missing or invalid Likelihood answer');
        });
    });

    describe('ChunkMemoryNotes', () => {
        it('returns entire array if count <= chunkSize or chunkSize is invalid', () => {
            const notes = [1, 2, 3];
            expect(ChunkMemoryNotes(notes, 5)).toEqual([[1, 2, 3]]);
            expect(ChunkMemoryNotes(notes, 3)).toEqual([[1, 2, 3]]);
            expect(ChunkMemoryNotes(notes, 0)).toEqual([[1, 2, 3]]);
            expect(ChunkMemoryNotes(notes, undefined)).toEqual([[1, 2, 3]]);
        });

        it('splits notes into chunks conforming to chunkSize', () => {
            const notes = [1, 2, 3, 4, 5];
            const chunks = ChunkMemoryNotes(notes, 2);
            expect(chunks).toEqual([[1, 2], [3, 4], [5]]);
        });
    });

    describe('MemoryNotePromptQuestionCap', () => {
        it('returns undefined if prompt is not found', () => {
            const engine: MemoryNoteEngineSource = {
                Prompts: [],
                PromptModels: [],
                ModelVendors: [],
                GetEffectiveModelConfiguration: () => ({})
            };
            expect(MemoryNotePromptQuestionCap(engine, 'Default Decision')).toBeUndefined();
        });

        it('returns minimum declared cap across active prompt models', () => {
            const promptId = 'prompt-1';
            const model1Id = 'model-1';
            const model2Id = 'model-2';
            const engine: MemoryNoteEngineSource = {
                Prompts: [{ ID: promptId, Name: 'Default Decision' }],
                PromptModels: [
                    { PromptID: promptId, ModelID: model1Id, VendorID: null, Status: 'Active' },
                    { PromptID: promptId, ModelID: model2Id, VendorID: null, Status: 'Preview' }
                ],
                ModelVendors: [],
                GetEffectiveModelConfiguration: (modelId: string) => {
                    if (modelId === model1Id) return { Decision: { MaxQuestionsPerCall: 10 } };
                    if (modelId === model2Id) return { Decision: { MaxQuestionsPerCall: 5 } };
                    return {};
                }
            };
            expect(MemoryNotePromptQuestionCap(engine, 'Default Decision')).toBe(5);
        });
    });
});
