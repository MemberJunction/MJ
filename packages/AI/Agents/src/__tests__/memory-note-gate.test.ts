import { describe, it, expect } from 'vitest';
import type { LikelihoodAnswer, PlattCalibration } from '@memberjunction/ai';
import {
    BuildMemoryNoteQuestions,
    BuildMemoryNoteState,
    JudgeMemoryNotes,
    MemoryNotePromptQuestionCap,
    ChunkMemoryNotes,
    MEMORY_NOTE_QUESTION_INSTRUCTIONS,
    MEMORY_NOTE_MAX_CONTENT_CHARS,
    MEMORY_NOTE_MAX_EXCERPT_CHARS,
    MEMORY_NOTE_MIN_PROBABILITY,
    MEMORY_NOTE_DECISION_CALIBRATION,
    type MemoryNoteCandidate,
    type MemoryNoteEngineSource
} from '../memory-note-gate';

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
        it('holds only the models measured to beat the self-reported confidence, frozen', () => {
            expect(Object.keys(MEMORY_NOTE_DECISION_CALIBRATION)).toEqual(['Jev']);
            expect(Object.isFrozen(MEMORY_NOTE_DECISION_CALIBRATION)).toBe(true);
            expect(Object.isFrozen(MEMORY_NOTE_DECISION_CALIBRATION['Jev'])).toBe(true);
        });
    });

    describe('JudgeMemoryNotes', () => {
        const candidateNotes: MemoryNoteCandidate[] = [
            { type: 'Preference', content: 'Prefers dark mode' },
            { type: 'Issue', content: 'Printer offline' }
        ];

        it('drops all notes and marks Calibrated=false when model is uncalibrated', () => {
            const answers: Record<string, LikelihoodAnswer> = {
                n1: { Kind: 'Likelihood', Probability: 0.95 },
                n2: { Kind: 'Likelihood', Probability: 0.88 }
            };

            const verdict = JudgeMemoryNotes(answers, candidateNotes, 'Claude 3.5 Sonnet');
            expect(verdict.Calibrated).toBe(false);
            expect(verdict.KeptNotes).toHaveLength(0);
            expect(verdict.JudgedNotes).toHaveLength(2);
            expect(verdict.JudgedNotes[0].Kept).toBe(false);
            expect(verdict.JudgedNotes[0].Reason).toContain('has no memory-note calibration');
        });

        it('drops all notes when no model name is specified and calibration is empty', () => {
            const answers: Record<string, LikelihoodAnswer> = {
                n1: { Kind: 'Likelihood', Probability: 0.95 }
            };
            const verdict = JudgeMemoryNotes(answers, candidateNotes);
            expect(verdict.Calibrated).toBe(false);
            expect(verdict.KeptNotes).toHaveLength(0);
        });

        it('applies Platt calibration and keeps notes meeting threshold for calibrated model', () => {
            // Identity calibration (A = -1, B = 0) maps logit(p) back to p:
            // sigmoid(-( -1 * logit(p) + 0 )) = sigmoid(logit(p)) = p
            const customCalibrations: Record<string, PlattCalibration> = {
                'gpt-4o': { A: 1, B: 0 }
            };

            const answers: Record<string, LikelihoodAnswer> = {
                n1: { Kind: 'Likelihood', Probability: 0.8 },
                n2: { Kind: 'Likelihood', Probability: 0.3 }
            };

            const verdict = JudgeMemoryNotes(
                answers,
                candidateNotes,
                'gpt-4o',
                0.5,
                customCalibrations
            );

            expect(verdict.Calibrated).toBe(true);
            expect(verdict.KeptNotes).toEqual([candidateNotes[0]]);
            expect(verdict.JudgedNotes[0].Kept).toBe(true);
            expect(verdict.JudgedNotes[0].CalibratedProbability).toBeCloseTo(0.8, 3);
            expect(verdict.JudgedNotes[1].Kept).toBe(false);
            expect(verdict.JudgedNotes[1].CalibratedProbability).toBeCloseTo(0.3, 3);
        });

        it('matches model name case-insensitively', () => {
            const customCalibrations: Record<string, PlattCalibration> = {
                'Claude 3.5 Sonnet': { A: 1, B: 0 }
            };
            const answers: Record<string, LikelihoodAnswer> = {
                n1: { Kind: 'Likelihood', Probability: 0.9 }
            };
            const verdict = JudgeMemoryNotes(
                answers,
                [candidateNotes[0]],
                'claude 3.5 sonnet',
                0.5,
                customCalibrations
            );
            expect(verdict.Calibrated).toBe(true);
            expect(verdict.KeptNotes).toHaveLength(1);
        });

        it('handles missing or malformed answers safely by dropping note', () => {
            const customCalibrations: Record<string, PlattCalibration> = {
                'gpt-4o': { A: 1, B: 0 }
            };
            const answers: Record<string, LikelihoodAnswer> = {
                // n1 missing
                n2: { Kind: 'Likelihood', Probability: NaN }
            };
            const verdict = JudgeMemoryNotes(
                answers,
                candidateNotes,
                'gpt-4o',
                0.5,
                customCalibrations
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
                Prompts: [{ ID: promptId, Name: 'Default Decision' }] as unknown as MemoryNoteEngineSource['Prompts'],
                PromptModels: [
                    { PromptID: promptId, ModelID: model1Id, Status: 'Active' },
                    { PromptID: promptId, ModelID: model2Id, Status: 'Preview' }
                ] as unknown as MemoryNoteEngineSource['PromptModels'],
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
