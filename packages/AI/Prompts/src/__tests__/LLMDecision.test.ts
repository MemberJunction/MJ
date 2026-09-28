import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import type { UserInfo } from '@memberjunction/core';
import {
    BaseDecision,
    DecisionParams,
    DecisionQuestion,
    LikelihoodAnswer,
    ChoiceAnswer,
    ScoreAnswer,
} from '@memberjunction/ai';
import type { AIPromptParams, AIPromptRunResult, MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import { AIPromptRunner } from '../AIPromptRunner';
import { LLMDecision, CreateLLMDecision } from '../decision/LLMDecision';

// Mock package boundaries before imports
const mockPromptsArray: Array<{ ID: string; Name: string }> = [];
vi.mock('@memberjunction/aiengine', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return {
        ...actual,
        AIEngine: {
            Instance: {
                get Prompts() {
                    return mockPromptsArray;
                },
            },
        },
    };
});

const mockLogStatus = vi.fn();
const mockLogError = vi.fn();
vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return {
        ...actual,
        LogStatus: (...args: unknown[]) => mockLogStatus(...args),
        LogError: (...args: unknown[]) => mockLogError(...args),
    };
});

describe('LLMDecision', () => {
    const PROMPT_ID = 'test-prompt-uuid-0001';
    const mockUser = { ID: 'user-001', Name: 'Test User' } as unknown as UserInfo;

    let executePromptSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        mockPromptsArray.length = 0;
        mockPromptsArray.push({
            ID: PROMPT_ID,
            Name: 'Decision Test Prompt',
        });

        mockLogStatus.mockClear();
        mockLogError.mockClear();

        executePromptSpy = vi.spyOn(AIPromptRunner.prototype, 'ExecutePrompt');
    });

    function makeSuccessRunResult(
        result: unknown,
        overrides?: Partial<AIPromptRunResult>
    ): AIPromptRunResult {
        return {
            success: true,
            result,
            rawResult: typeof result === 'string' ? result : JSON.stringify(result),
            promptTokens: 150,
            completionTokens: 50,
            tokensUsed: 200,
            cost: 0.003,
            costCurrency: 'USD',
            modelInfo: {
                modelId: 'gpt-4o-id',
                modelName: 'gpt-4o',
            },
            ...overrides,
        } as unknown as AIPromptRunResult;
    }

    const defaultQuestions: Record<string, DecisionQuestion> = {
        q_likelihood: {
            Kind: 'Likelihood',
            Instructions: 'Is this high priority?',
        },
        q_choice: {
            Kind: 'Choice',
            Instructions: 'Select the component.',
            Options: [
                { Value: 'frontend', Description: 'Web UI components' },
                { Value: 'backend', Description: 'Server APIs' },
                { Value: 'database', Description: 'Database tables' },
            ],
        },
        q_score: {
            Kind: 'Score',
            Instructions: 'Severity rating.',
            Levels: ['low', 'medium', 'high', 'critical'],
        },
    };

    describe('1. Template data formatting (§4a)', () => {
        it('formats state, questions, and outputFormat exactly as specified', async () => {
            const decision = new LLMDecision('', PROMPT_ID, mockUser);

            const modelOutput = {
                q_likelihood: 0.75,
                q_choice: { frontend: 0.8, backend: 0.2, database: 0 },
                q_score: { low: 0.1, medium: 0.6, high: 0.2, critical: 0.1 },
            };

            executePromptSpy.mockResolvedValueOnce(makeSuccessRunResult(modelOutput));

            const params: DecisionParams = {
                Model: 'LLM',
                State: { ticketId: 123, summary: 'Bug in checkout' },
                Questions: defaultQuestions,
            };

            const result = await decision.Decide(params);
            expect(result.success).toBe(true);
            expect(result.Answers.q_likelihood).toEqual({
                Kind: 'Likelihood',
                Probability: 0.75,
            });
            expect(result.Answers.q_choice).toEqual({
                Kind: 'Choice',
                Value: 'frontend',
                Confidence: 0.8,
                Probabilities: { frontend: 0.8, backend: 0.2, database: 0 },
            });
            const scoreAnswer = result.Answers.q_score as ScoreAnswer;
            expect(scoreAnswer.Kind).toBe('Score');
            expect(scoreAnswer.Value).toBeCloseTo(1.3);
            expect(scoreAnswer.Confidence).toBeCloseTo(0.6);
            expect(scoreAnswer.Probabilities.medium).toBeCloseTo(0.6);

            expect(executePromptSpy).toHaveBeenCalledTimes(1);
            const callParams = executePromptSpy.mock.calls[0][0] as AIPromptParams;

            expect(callParams.prompt).toBe(mockPromptsArray[0]);
            expect(callParams.contextUser).toBe(mockUser);
            expect(callParams.attemptJSONRepair).toBe(true);

            // Verify state
            expect(callParams.data.state).toBe(JSON.stringify(params.State, null, 1));

            // Verify questions spec
            const parsedQuestions = JSON.parse(callParams.data.questions);
            expect(parsedQuestions).toEqual({
                q_likelihood: {
                    kind: 'Likelihood',
                    instructions: 'Is this high priority?',
                },
                q_choice: {
                    kind: 'Choice',
                    instructions: 'Select the component.',
                    options: [
                        { value: 'frontend', description: 'Web UI components' },
                        { value: 'backend', description: 'Server APIs' },
                        { value: 'database', description: 'Database tables' },
                    ],
                },
                q_score: {
                    kind: 'Score',
                    instructions: 'Severity rating.',
                    levels: ['low', 'medium', 'high', 'critical'],
                },
            });

            // Verify outputFormat template
            const parsedOutputFormat = JSON.parse(callParams.data.outputFormat);
            expect(parsedOutputFormat).toEqual({
                q_likelihood: '<probability 0-1>',
                q_choice: {
                    frontend: '<probability>',
                    backend: '<probability>',
                    database: '<probability>',
                },
                q_score: {
                    low: '<probability>',
                    medium: '<probability>',
                    high: '<probability>',
                    critical: '<probability>',
                },
            });
        });

        it('passes string state as-is without re-encoding', async () => {
            const decision = new LLMDecision('', PROMPT_ID, mockUser);
            executePromptSpy.mockResolvedValueOnce(
                makeSuccessRunResult({
                    q_likelihood: 0.5,
                })
            );

            const rawTextState = 'Plain text context description';
            await decision.Decide({
                Model: 'LLM',
                State: rawTextState,
                Questions: {
                    q_likelihood: {
                        Kind: 'Likelihood',
                        Instructions: 'Is this valid?',
                    },
                },
            });

            const callParams = executePromptSpy.mock.calls[0][0] as AIPromptParams;
            expect(callParams.data.state).toBe(rawTextState);
        });
    });

    describe('1b. Runner options', () => {
        it('skips the runner output validation, so keys containing ":" reach the mapper intact', async () => {
            const decision = new LLMDecision('', PROMPT_ID, mockUser);
            const levels = ['cosmetic: work continues', 'blocked: no workaround'];
            executePromptSpy.mockResolvedValueOnce(
                makeSuccessRunResult({ urgency: { 'cosmetic: work continues': 0.25, 'blocked: no workaround': 0.75 } })
            );

            const result = await decision.Decide({
                Model: 'LLM',
                State: 'Exports fail with error 500.',
                Questions: { urgency: { Kind: 'Score', Instructions: 'How blocked?', Levels: levels } },
            });

            const callArgs = executePromptSpy.mock.calls[0][0] as AIPromptParams;
            expect(callArgs.skipValidation).toBe(true);
            expect(callArgs.attemptJSONRepair).toBe(true);
            expect(result.success).toBe(true);
            const answer = result.Answers.urgency as ScoreAnswer;
            expect(answer.Value).toBeCloseTo(0.75);
            expect(Object.keys(answer.Probabilities)).toEqual(levels);
        });
    });

    describe('2. Likelihood mapping', () => {
        const likelihoodQuestions: Record<string, DecisionQuestion> = {
            q1: { Kind: 'Likelihood', Instructions: 'Check probability' },
        };

        it('maps 0.83 to Probability 0.83', async () => {
            const decision = new LLMDecision('', PROMPT_ID, mockUser);
            executePromptSpy.mockResolvedValueOnce(makeSuccessRunResult({ q1: 0.83 }));

            const result = await decision.Decide({
                Model: 'LLM',
                State: 'test',
                Questions: likelihoodQuestions,
            });

            expect(result.success).toBe(true);
            const answer = result.Answers.q1 as LikelihoodAnswer;
            expect(answer.Kind).toBe('Likelihood');
            expect(answer.Probability).toBe(0.83);
        });

        it('clamps 1.4 to 1', async () => {
            const decision = new LLMDecision('', PROMPT_ID, mockUser);
            executePromptSpy.mockResolvedValueOnce(makeSuccessRunResult({ q1: 1.4 }));

            const result = await decision.Decide({
                Model: 'LLM',
                State: 'test',
                Questions: likelihoodQuestions,
            });

            expect(result.success).toBe(true);
            const answer = result.Answers.q1 as LikelihoodAnswer;
            expect(answer.Kind).toBe('Likelihood');
            expect(answer.Probability).toBe(1);
        });

        it('clamps negative numbers to 0', async () => {
            const decision = new LLMDecision('', PROMPT_ID, mockUser);
            executePromptSpy.mockResolvedValueOnce(makeSuccessRunResult({ q1: -0.2 }));

            const result = await decision.Decide({
                Model: 'LLM',
                State: 'test',
                Questions: likelihoodQuestions,
            });

            expect(result.success).toBe(true);
            const answer = result.Answers.q1 as LikelihoodAnswer;
            expect(answer.Kind).toBe('Likelihood');
            expect(answer.Probability).toBe(0);
        });

        it('accepts a probability the model wrote as a numeric string ("0.1")', async () => {
            const decision = new LLMDecision('', PROMPT_ID, mockUser);
            executePromptSpy.mockResolvedValueOnce(
                makeSuccessRunResult({
                    q1: '0.1',
                    q2: { a: '0.25', b: '0.75' },
                })
            );

            const result = await decision.Decide({
                Model: 'LLM',
                State: 'test',
                Questions: {
                    q1: { Kind: 'Likelihood', Instructions: 'Check' },
                    q2: { Kind: 'Choice', Instructions: 'Pick', Options: [{ Value: 'a', Description: 'A' }, { Value: 'b', Description: 'B' }] },
                },
            });

            expect(result.success).toBe(true);
            expect((result.Answers.q1 as LikelihoodAnswer).Probability).toBeCloseTo(0.1);
            expect((result.Answers.q2 as ChoiceAnswer).Value).toBe('b');
        });

        it('fails when value is a string ("high")', async () => {
            const decision = new LLMDecision('', PROMPT_ID, mockUser);
            executePromptSpy.mockResolvedValueOnce(makeSuccessRunResult({ q1: 'high' }));

            const result = await decision.Decide({
                Model: 'LLM',
                State: 'test',
                Questions: likelihoodQuestions,
            });

            expect(result.success).toBe(false);
            expect(result.errorMessage).toContain("Question 'q1'");
            expect(result.errorMessage).toContain('finite number');
        });

        it('fails when value is NaN', async () => {
            const decision = new LLMDecision('', PROMPT_ID, mockUser);
            executePromptSpy.mockResolvedValueOnce(makeSuccessRunResult({ q1: NaN }));

            const result = await decision.Decide({
                Model: 'LLM',
                State: 'test',
                Questions: likelihoodQuestions,
            });

            expect(result.success).toBe(false);
            expect(result.errorMessage).toContain("Question 'q1'");
        });
    });

    describe('3. Choice mapping', () => {
        const choiceQuestions: Record<string, DecisionQuestion> = {
            q_choice: {
                Kind: 'Choice',
                Instructions: 'Pick a fruit',
                Options: [
                    { Value: 'apple', Description: 'Red apple' },
                    { Value: 'banana', Description: 'Yellow banana' },
                    { Value: 'cherry', Description: 'Dark cherry' },
                ],
            },
        };

        it('normalizes distribution and selects argmax Value with Confidence', async () => {
            const decision = new LLMDecision('', PROMPT_ID, mockUser);
            // Sum = 2 + 6 + 2 = 10
            executePromptSpy.mockResolvedValueOnce(
                makeSuccessRunResult({
                    q_choice: { apple: 2, banana: 6, cherry: 2 },
                })
            );

            const result = await decision.Decide({
                Model: 'LLM',
                State: 'test',
                Questions: choiceQuestions,
            });

            expect(result.success).toBe(true);
            const answer = result.Answers.q_choice as ChoiceAnswer;
            expect(answer.Kind).toBe('Choice');
            expect(answer.Value).toBe('banana');
            expect(answer.Confidence).toBeCloseTo(0.6);
            expect(answer.Probabilities.apple).toBeCloseTo(0.2);
            expect(answer.Probabilities.banana).toBeCloseTo(0.6);
            expect(answer.Probabilities.cherry).toBeCloseTo(0.2);
        });

        it('treats a missing option as 0', async () => {
            const decision = new LLMDecision('', PROMPT_ID, mockUser);
            // 'cherry' is missing
            executePromptSpy.mockResolvedValueOnce(
                makeSuccessRunResult({
                    q_choice: { apple: 0.3, banana: 0.7 },
                })
            );

            const result = await decision.Decide({
                Model: 'LLM',
                State: 'test',
                Questions: choiceQuestions,
            });

            expect(result.success).toBe(true);
            const answer = result.Answers.q_choice as ChoiceAnswer;
            expect(answer.Probabilities.cherry).toBe(0);
            expect(answer.Probabilities.apple).toBeCloseTo(0.3);
            expect(answer.Probabilities.banana).toBeCloseTo(0.7);
            expect(answer.Value).toBe('banana');
            expect(answer.Confidence).toBeCloseTo(0.7);
        });

        it('ignores unexpected keys and logs them with LogStatus', async () => {
            const decision = new LLMDecision('', PROMPT_ID, mockUser);
            executePromptSpy.mockResolvedValueOnce(
                makeSuccessRunResult({
                    q_choice: {
                        apple: 0.4,
                        banana: 0.6,
                        cherry: 0,
                        durian: 0.99, // unexpected key
                    },
                })
            );

            const result = await decision.Decide({
                Model: 'LLM',
                State: 'test',
                Questions: choiceQuestions,
            });

            expect(result.success).toBe(true);
            const answer = result.Answers.q_choice as ChoiceAnswer;
            expect(answer.Probabilities.durian).toBeUndefined();
            expect(answer.Probabilities.apple).toBeCloseTo(0.4);
            expect(answer.Probabilities.banana).toBeCloseTo(0.6);

            expect(mockLogStatus).toHaveBeenCalledWith(
                expect.stringContaining("ignoring unexpected key 'durian'")
            );
        });

        it('resolves ties by choosing the first option in declaration order', async () => {
            const decision = new LLMDecision('', PROMPT_ID, mockUser);
            // apple and banana tied at 0.5
            executePromptSpy.mockResolvedValueOnce(
                makeSuccessRunResult({
                    q_choice: { apple: 0.5, banana: 0.5, cherry: 0 },
                })
            );

            const result = await decision.Decide({
                Model: 'LLM',
                State: 'test',
                Questions: choiceQuestions,
            });

            expect(result.success).toBe(true);
            const answer = result.Answers.q_choice as ChoiceAnswer;
            // apple declared before banana
            expect(answer.Value).toBe('apple');
            expect(answer.Confidence).toBeCloseTo(0.5);
        });
    });

    describe('4. Score mapping', () => {
        const scoreQuestions: Record<string, DecisionQuestion> = {
            q_score: {
                Kind: 'Score',
                Instructions: 'Rate severity',
                Levels: ['low', 'mid', 'high'],
            },
        };

        it('computes Value as expected level position, Confidence as max prob, and Probabilities keyed by level name', async () => {
            const decision = new LLMDecision('', PROMPT_ID, mockUser);
            // 0*0.2 + 1*0.5 + 2*0.3 = 1.1
            executePromptSpy.mockResolvedValueOnce(
                makeSuccessRunResult({
                    q_score: { low: 0.2, mid: 0.5, high: 0.3 },
                })
            );

            const result = await decision.Decide({
                Model: 'LLM',
                State: 'test',
                Questions: scoreQuestions,
            });

            expect(result.success).toBe(true);
            const answer = result.Answers.q_score as ScoreAnswer;
            expect(answer.Kind).toBe('Score');
            expect(answer.Value).toBeCloseTo(1.1);
            expect(answer.Confidence).toBeCloseTo(0.5);
            expect(answer.Probabilities).toEqual({
                low: 0.2,
                mid: 0.5,
                high: 0.3,
            });
        });

        it('normalizes unnormalized score distributions and calculates position correctly', async () => {
            const decision = new LLMDecision('', PROMPT_ID, mockUser);
            // low: 2, mid: 2, high: 6 -> sum 10 -> low: 0.2, mid: 0.2, high: 0.6
            // expected position: 0*0.2 + 1*0.2 + 2*0.6 = 1.4
            executePromptSpy.mockResolvedValueOnce(
                makeSuccessRunResult({
                    q_score: { low: 2, mid: 2, high: 6 },
                })
            );

            const result = await decision.Decide({
                Model: 'LLM',
                State: 'test',
                Questions: scoreQuestions,
            });

            expect(result.success).toBe(true);
            const answer = result.Answers.q_score as ScoreAnswer;
            expect(answer.Value).toBeCloseTo(1.4);
            expect(answer.Confidence).toBeCloseTo(0.6);
        });
    });

    describe('5. Failures', () => {
        it('fails when a question key is missing from model reply', async () => {
            const decision = new LLMDecision('', PROMPT_ID, mockUser);
            executePromptSpy.mockResolvedValueOnce(
                makeSuccessRunResult({
                    q_likelihood: 0.9,
                    // q_choice missing
                })
            );

            const result = await decision.Decide({
                Model: 'LLM',
                State: 'test',
                Questions: {
                    q_likelihood: { Kind: 'Likelihood', Instructions: 'Check' },
                    q_choice: {
                        Kind: 'Choice',
                        Instructions: 'Pick',
                        Options: [{ Value: 'a', Description: 'A' }, { Value: 'b', Description: 'B' }],
                    },
                },
            });

            expect(result.success).toBe(false);
            expect(result.errorMessage).toContain("Question 'q_choice'");
            expect(result.errorMessage).toContain('Missing answer');
        });

        it('does not treat a key inherited from Object.prototype as answered', async () => {
            const decision = new LLMDecision('', PROMPT_ID, mockUser);
            executePromptSpy.mockResolvedValueOnce(makeSuccessRunResult({ other: 0.5 }));

            const result = await decision.Decide({
                Model: 'LLM',
                State: 'test',
                Questions: { toString: { Kind: 'Likelihood', Instructions: 'Check' } },
            });

            expect(result.success).toBe(false);
            expect(result.errorMessage).toContain("Question 'toString'");
            expect(result.errorMessage).toContain('Missing answer');
        });

        it('fails when a Choice value is not an object', async () => {
            const decision = new LLMDecision('', PROMPT_ID, mockUser);
            executePromptSpy.mockResolvedValueOnce(
                makeSuccessRunResult({
                    q_choice: 'frontend', // string instead of object
                })
            );

            const result = await decision.Decide({
                Model: 'LLM',
                State: 'test',
                Questions: {
                    q_choice: {
                        Kind: 'Choice',
                        Instructions: 'Pick',
                        Options: [{ Value: 'frontend', Description: 'FE' }, { Value: 'backend', Description: 'BE' }],
                    },
                },
            });

            expect(result.success).toBe(false);
            expect(result.errorMessage).toContain("Question 'q_choice'");
            expect(result.errorMessage).toContain('must be an object');
        });

        it('fails when a distribution sums to 0', async () => {
            const decision = new LLMDecision('', PROMPT_ID, mockUser);
            executePromptSpy.mockResolvedValueOnce(
                makeSuccessRunResult({
                    q_choice: { optA: 0, optB: 0 },
                })
            );

            const result = await decision.Decide({
                Model: 'LLM',
                State: 'test',
                Questions: {
                    q_choice: {
                        Kind: 'Choice',
                        Instructions: 'Pick',
                        Options: [{ Value: 'optA', Description: 'A' }, { Value: 'optB', Description: 'B' }],
                    },
                },
            });

            expect(result.success).toBe(false);
            expect(result.errorMessage).toContain("Question 'q_choice'");
            expect(result.errorMessage).toContain('sum to 0');
        });

        it('fails when model reply is an unparseable string', async () => {
            const decision = new LLMDecision('', PROMPT_ID, mockUser);
            executePromptSpy.mockResolvedValueOnce({
                success: true,
                result: 'not valid json at all {',
                rawResult: 'not valid json at all {',
                promptTokens: 10,
                completionTokens: 5,
            } as unknown as AIPromptRunResult);

            const result = await decision.Decide({
                Model: 'LLM',
                State: 'test',
                Questions: {
                    q1: { Kind: 'Likelihood', Instructions: 'Check' },
                },
            });

            expect(result.success).toBe(false);
            expect(result.errorMessage).toContain('Failed to parse model reply as JSON');
        });

        it('fails when the prompt run itself fails', async () => {
            const decision = new LLMDecision('', PROMPT_ID, mockUser);
            executePromptSpy.mockResolvedValueOnce({
                success: false,
                errorMessage: 'Model rate limit exceeded',
                promptTokens: 5,
                completionTokens: 0,
            } as unknown as AIPromptRunResult);

            const result = await decision.Decide({
                Model: 'LLM',
                State: 'test',
                Questions: {
                    q1: { Kind: 'Likelihood', Instructions: 'Check' },
                },
            });

            expect(result.success).toBe(false);
            expect(result.errorMessage).toBe('Model rate limit exceeded');
        });

        it('fails when prompt ID is unknown', async () => {
            const decision = new LLMDecision('', 'non-existent-prompt-id', mockUser);

            const result = await decision.Decide({
                Model: 'LLM',
                State: 'test',
                Questions: {
                    q1: { Kind: 'Likelihood', Instructions: 'Check' },
                },
            });

            expect(result.success).toBe(false);
            expect(result.errorMessage).toContain('Prompt not found with ID: non-existent-prompt-id');
            expect(mockLogError).toHaveBeenCalledWith(
                expect.stringContaining('non-existent-prompt-id')
            );
        });
    });

    describe('6. Telemetry', () => {
        it('populates Usage and ResolvedModel on success', async () => {
            const decision = new LLMDecision('', PROMPT_ID, mockUser);
            executePromptSpy.mockResolvedValueOnce(
                makeSuccessRunResult(
                    { q1: 0.5 },
                    {
                        promptTokens: 250,
                        completionTokens: 75,
                        cost: 0.005,
                        costCurrency: 'USD',
                        modelInfo: {
                            modelId: 'claude-3-5-sonnet',
                            modelName: 'claude-3-5-sonnet-20241022',
                        },
                    }
                )
            );

            const result = await decision.Decide({
                Model: 'LLM',
                State: 'test',
                Questions: {
                    q1: { Kind: 'Likelihood', Instructions: 'Check' },
                },
            });

            expect(result.success).toBe(true);
            expect(result.Usage).toBeDefined();
            expect(result.Usage?.promptTokens).toBe(250);
            expect(result.Usage?.completionTokens).toBe(75);
            expect(result.Usage?.cost).toBe(0.005);
            expect(result.Usage?.costCurrency).toBe('USD');
            expect(result.ResolvedModel).toBe('claude-3-5-sonnet-20241022');
        });

        it('populates Usage and ResolvedModel on mapping failure', async () => {
            const decision = new LLMDecision('', PROMPT_ID, mockUser);
            // Invalid likelihood string causes mapping failure
            executePromptSpy.mockResolvedValueOnce(
                makeSuccessRunResult(
                    { q1: 'invalid-string' },
                    {
                        promptTokens: 180,
                        completionTokens: 30,
                        cost: 0.0035,
                        costCurrency: 'EUR',
                        modelInfo: {
                            modelId: 'gemini-2-flash',
                            modelName: 'gemini-2.0-flash',
                        },
                    }
                )
            );

            const result = await decision.Decide({
                Model: 'LLM',
                State: 'test',
                Questions: {
                    q1: { Kind: 'Likelihood', Instructions: 'Check' },
                },
            });

            expect(result.success).toBe(false);
            expect(result.Usage).toBeDefined();
            expect(result.Usage?.promptTokens).toBe(180);
            expect(result.Usage?.completionTokens).toBe(30);
            expect(result.Usage?.cost).toBe(0.0035);
            expect(result.Usage?.costCurrency).toBe('EUR');
            expect(result.ResolvedModel).toBe('gemini-2.0-flash');
        });

        it('populates Usage and ResolvedModel on prompt execution failure', async () => {
            const decision = new LLMDecision('', PROMPT_ID, mockUser);
            executePromptSpy.mockResolvedValueOnce({
                success: false,
                errorMessage: 'Timeout error',
                promptTokens: 40,
                completionTokens: 0,
                cost: 0.0004,
                costCurrency: 'USD',
                modelInfo: {
                    modelId: 'gpt-4o-mini',
                    modelName: 'gpt-4o-mini',
                },
            } as unknown as AIPromptRunResult);

            const result = await decision.Decide({
                Model: 'LLM',
                State: 'test',
                Questions: {
                    q1: { Kind: 'Likelihood', Instructions: 'Check' },
                },
            });

            expect(result.success).toBe(false);
            expect(result.Usage).toBeDefined();
            expect(result.Usage?.promptTokens).toBe(40);
            expect(result.Usage?.completionTokens).toBe(0);
            expect(result.Usage?.cost).toBe(0.0004);
            expect(result.ResolvedModel).toBe('gpt-4o-mini');
        });
    });

    describe('7. CancellationToken', () => {
        it('forwards CancellationToken from DecisionParams to AIPromptParams', async () => {
            const decision = new LLMDecision('', PROMPT_ID, mockUser);
            executePromptSpy.mockResolvedValueOnce(makeSuccessRunResult({ q1: 0.5 }));

            const controller = new AbortController();

            await decision.Decide({
                Model: 'LLM',
                State: 'test',
                Questions: {
                    q1: { Kind: 'Likelihood', Instructions: 'Check' },
                },
                CancellationToken: controller.signal,
            });

            expect(executePromptSpy).toHaveBeenCalledTimes(1);
            const callParams = executePromptSpy.mock.calls[0][0] as AIPromptParams;
            expect(callParams.cancellationToken).toBe(controller.signal);
        });
    });

    describe('8. String JSON reply parsing & prompt caching & class factory', () => {
        it('parses valid JSON string model replies', async () => {
            const decision = new LLMDecision('', PROMPT_ID, mockUser);
            const jsonString = JSON.stringify({ q1: 0.65 });
            executePromptSpy.mockResolvedValueOnce(makeSuccessRunResult(jsonString));

            const result = await decision.Decide({
                Model: 'LLM',
                State: 'test',
                Questions: {
                    q1: { Kind: 'Likelihood', Instructions: 'Check' },
                },
            });

            expect(result.success).toBe(true);
            const answer = result.Answers.q1 as LikelihoodAnswer;
            expect(answer.Probability).toBe(0.65);
        });

        it('caches prompt lookup across multiple Decide calls', async () => {
            const promptsGetterSpy = vi.spyOn(mockPromptsArray, 'find');
            const decision = new LLMDecision('', PROMPT_ID, mockUser);

            executePromptSpy.mockResolvedValue(makeSuccessRunResult({ q1: 0.5 }));

            const params: DecisionParams = {
                Model: 'LLM',
                State: 'test',
                Questions: { q1: { Kind: 'Likelihood', Instructions: 'Check' } },
            };

            await decision.Decide(params);
            await decision.Decide(params);

            // loadPrompt should only look up the prompt once and cache it
            expect(promptsGetterSpy).toHaveBeenCalledTimes(1);
        });

        it('is registered in ClassFactory under BaseDecision with key "LLMDecision"', () => {
            const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseDecision>(
                BaseDecision,
                'LLMDecision',
                '',
                PROMPT_ID,
                mockUser
            );

            expect(instance).toBeDefined();
            expect(instance).toBeInstanceOf(LLMDecision);
            expect((instance as LLMDecision).PromptID).toBe(PROMPT_ID);
        });

        it('CreateLLMDecision factory function creates configured LLMDecision', () => {
            const instance = CreateLLMDecision(PROMPT_ID, mockUser);
            expect(instance).toBeInstanceOf(LLMDecision);
            expect(instance.PromptID).toBe(PROMPT_ID);
        });
    });
});
