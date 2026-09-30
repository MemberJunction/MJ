import { describe, it, expect, vi } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import type { BaseLLM } from '@memberjunction/ai';
import { FormatMemoryNoteExcerpt } from '@memberjunction/ai-agents';
import { OutputInsideRepoError } from '@memberjunction/testing-engine';
import {
    BuildScenarioGenerationPrompt,
    FormatConversationExcerpt,
    GenerateScenarioWithRetry,
    KeyedRoute,
    PickGenerationModel,
    ValidateRawScenario,
    WriteCorpusFiles,
    type ModelSource
} from '../../memory-gate-measurement/corpus-generator';
import type { CorpusLabelRecord, CorpusScenario } from '../../memory-gate-measurement/corpus-types';

describe('corpus-generator', () => {
    const validRawScenario = {
        turns: [
            { role: 'user', text: 'Hi, I need help with Postgres.' },
            { role: 'assistant', text: 'Sure, what do you need?' },
            { role: 'user', text: 'I always use snake_case for tables.' },
            { role: 'assistant', text: 'Good convention, noted.' },
            { role: 'user', text: 'Can you write a migration for users?' },
            { role: 'assistant', text: 'Here is the schema.' }
        ],
        notes: [
            {
                type: 'Preference',
                scopeLevel: 'user',
                content: 'Prefers snake_case for Postgres table names',
                label: 'durable'
            },
            {
                type: 'Context',
                scopeLevel: 'user',
                content: 'Currently creating a users migration',
                label: 'ephemeral'
            },
            {
                type: 'Constraint',
                scopeLevel: 'company',
                content: 'Requires PascalCase for Postgres tables',
                label: 'wrong'
            }
        ]
    };

    it('builds generation prompt with bounds and label requirements', () => {
        const prompt = BuildScenarioGenerationPrompt(0, 10);
        expect(prompt).toContain('scenario 1 of 10');
        expect(prompt).toContain('"durable"');
        expect(prompt).toContain('"ephemeral"');
        expect(prompt).toContain('"wrong"');
        expect(prompt).toContain('"speculative"');
        expect(prompt).toContain('Between 6 and 12 alternating turns');
        expect(prompt).toContain('Between 3 and 6 candidate notes');
    });

    it('validates compliant raw scenario structure', () => {
        const validated = ValidateRawScenario(validRawScenario);
        expect(validated.Turns.length).toBe(6);
        expect(validated.Notes.length).toBe(3);
        expect(validated.Notes[0].Label).toBe('durable');
        expect(validated.Notes[0].Type).toBe('Preference');
    });

    it('rejects raw scenario with fewer than 6 turns', () => {
        const tooShort = {
            turns: [
                { role: 'user', text: 'Hi' },
                { role: 'assistant', text: 'Hello' }
            ],
            notes: validRawScenario.notes
        };
        expect(() => ValidateRawScenario(tooShort)).toThrow(/turns must be an array of length 6-12/);
    });

    it('rejects raw scenario with fewer than 3 notes or invalid label', () => {
        const tooFewNotes = {
            turns: validRawScenario.turns,
            notes: [validRawScenario.notes[0]]
        };
        expect(() => ValidateRawScenario(tooFewNotes)).toThrow(/notes must be an array of length 3-6/);

        const invalidLabel = {
            turns: validRawScenario.turns,
            notes: [
                validRawScenario.notes[0],
                validRawScenario.notes[1],
                { ...validRawScenario.notes[2], label: 'unknown-label' }
            ]
        };
        expect(() => ValidateRawScenario(invalidLabel)).toThrow(/invalid label/);
    });

    it('formats conversation excerpt into readable multi-turn string', () => {
        const excerpt = FormatConversationExcerpt(validRawScenario.turns);
        expect(excerpt).toContain('[user]: Hi, I need help with Postgres.');
        expect(excerpt).toContain('[assistant]: Sure, what do you need?');
    });

    it("formats the excerpt exactly as production's gate quotes a conversation", () => {
        const turns = [{ role: 'user', text: 'Always answer me in Spanish.' }, { role: 'assistant', text: 'Entendido.' }];
        expect(FormatConversationExcerpt(turns)).toBe(FormatMemoryNoteExcerpt(turns));
    });

    it('generates scenario with retry when model output is valid on second try', async () => {
        let calls = 0;
        const mockDriver = {
            ChatCompletion: vi.fn().mockImplementation(async () => {
                calls++;
                if (calls === 1) {
                    return { data: { choices: [{ message: { content: 'invalid json' } }] } };
                }
                return {
                    data: {
                        choices: [{ message: { content: JSON.stringify(validRawScenario) } }]
                    }
                };
            })
        } as unknown as BaseLLM;

        const scenario = await GenerateScenarioWithRetry(mockDriver, 'test-model', 0, 10, 2);
        expect(calls).toBe(2);
        expect(scenario.Notes.length).toBe(3);
    });

    describe('PickGenerationModel and KeyedRoute', () => {
        const models: ModelSource[] = [
            {
                Name: 'Claude 3.7 Sonnet',
                IsActive: true,
                AIModelType: 'llm',
                DriverClass: 'AnthropicLLM',
                APIName: 'claude-3-7-sonnet',
                PowerRank: 95,
                ModelVendors: [
                    { Status: 'Active', DriverClass: 'BedrockAnthropicLLM', APIName: 'anthropic.claude-3-7', Priority: 10 },
                    { Status: 'Active', DriverClass: 'AnthropicLLM', APIName: 'claude-3-7-sonnet', Priority: 20 }
                ]
            },
            {
                Name: 'GPT-4o',
                IsActive: true,
                AIModelType: 'llm',
                DriverClass: 'OpenAILLM',
                APIName: 'gpt-4o',
                PowerRank: 90
            }
        ];

        it('picks prioritized active vendor that has an API key', () => {
            const hasKey = (d: string) => d === 'AnthropicLLM';
            const route = KeyedRoute(models[0], hasKey);
            expect(route?.DriverClass).toBe('AnthropicLLM');
            expect(route?.APIName).toBe('claude-3-7-sonnet');
        });

        it('picks best ranked active model with an available key when name is omitted', () => {
            const hasKey = (d: string) => d === 'OpenAILLM'; // Only OpenAI has key
            const model = PickGenerationModel(models, undefined, hasKey);
            expect(model.Name).toBe('GPT-4o');
            expect(model.DriverClass).toBe('OpenAILLM');
        });

        it('picks named model and throws if no vendor has a key', () => {
            const hasKey = (d: string) => d === 'OpenAILLM';
            expect(() => PickGenerationModel(models, 'Claude 3.7 Sonnet', hasKey))
                .toThrow(/has no active vendor with an available API key/);
        });
    });

    describe('WriteCorpusFiles and Path Refusal', () => {
        it('refuses writing inside repository root', () => {
            const fakeRepoRoot = '/Users/colinbrockman/Projects/MJ-memory-gate';
            expect(() =>
                WriteCorpusFiles(join(fakeRepoRoot, 'packages/test-out'), [], [], [fakeRepoRoot])
            ).toThrow(OutputInsideRepoError);
        });

        it('writes corpus.jsonl and labels.jsonl when output is outside repo', () => {
            const outsideDir = join(tmpdir(), `mj-test-corpus-${Date.now()}`);
            const sampleScenarios: CorpusScenario[] = [
                {
                    Id: 's1',
                    Excerpt: 'excerpt',
                    Notes: [
                        {
                            NoteId: 's1-n1',
                            type: 'Preference',
                            scopeLevel: 'user',
                            content: 'Note 1',
                            confidence: 90,
                            SelfConfidence: 90
                        }
                    ]
                }
            ];
            const sampleLabels: CorpusLabelRecord[] = [
                { NoteId: 's1-n1', Label: 'durable' }
            ];

            try {
                const { corpusPath, labelsPath } = WriteCorpusFiles(outsideDir, sampleScenarios, sampleLabels, ['/some/repo']);
                expect(existsSync(corpusPath)).toBe(true);
                expect(existsSync(labelsPath)).toBe(true);

                const corpusContent = readFileSync(corpusPath, 'utf-8');
                expect(corpusContent).toContain('s1-n1');
                expect(corpusContent).toContain('Note 1');

                const labelsContent = readFileSync(labelsPath, 'utf-8');
                expect(labelsContent).toContain('s1-n1');
                expect(labelsContent).toContain('durable');
            } finally {
                rmSync(outsideDir, { recursive: true, force: true });
            }
        });
    });
});
