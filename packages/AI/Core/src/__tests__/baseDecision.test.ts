import { describe, it, expect, beforeEach } from 'vitest';
import { BaseDecision } from '../generic/baseDecision';
import {
    DecisionParams,
    DecisionResult,
    LikelihoodAnswer,
    ChoiceAnswer,
    ScoreAnswer,
} from '../generic/decision.types';

class FakeDecision extends BaseDecision {
    public decideHandler?: (params: DecisionParams) => Promise<DecisionResult>;
    public callCount = 0;
    public lastParams?: DecisionParams;

    constructor(apiKey: string = 'test-api-key') {
        super(apiKey);
    }

    protected async DoDecide(params: DecisionParams): Promise<DecisionResult> {
        this.callCount++;
        this.lastParams = params;
        if (this.decideHandler) {
            return this.decideHandler(params);
        }
        return new DecisionResult(true, new Date(), new Date());
    }
}

describe('BaseDecision', () => {
    let fake: FakeDecision;

    const createValidParams = (): DecisionParams => ({
        Model: 'test-decision-model',
        State: 'Customer account status is active with $500 balance',
        Questions: {
            isEligible: {
                Kind: 'Likelihood',
                Instructions: 'Is the customer eligible for promotion?',
            },
            priorityTier: {
                Kind: 'Choice',
                Instructions: 'Select customer priority tier',
                Options: [
                    { Value: 'standard', Description: 'Standard tier customer' },
                    { Value: 'premium', Description: 'Premium tier customer' },
                ],
            },
            riskScore: {
                Kind: 'Score',
                Instructions: 'Score customer credit risk from low to high',
                Levels: ['low', 'medium', 'high'],
            },
        },
    });

    const createValidAnswers = (): {
        isEligible: LikelihoodAnswer;
        priorityTier: ChoiceAnswer;
        riskScore: ScoreAnswer;
    } => ({
        isEligible: {
            Kind: 'Likelihood',
            Probability: 0.85,
        },
        priorityTier: {
            Kind: 'Choice',
            Value: 'premium',
            Probabilities: { standard: 0.2, premium: 0.8 },
            Confidence: 0.8,
        },
        riskScore: {
            Kind: 'Score',
            Value: 1.2,
            Probabilities: { low: 0.1, medium: 0.8, high: 0.1 },
            Confidence: 0.8,
        },
    });

    const createValidResult = (): DecisionResult => {
        const res = new DecisionResult(true, new Date(), new Date());
        res.Answers = createValidAnswers();
        return res;
    };

    beforeEach(() => {
        fake = new FakeDecision();
    });

    describe('1. Happy path', () => {
        it('evaluates Likelihood, Choice, and Score in one call with success and timing set', async () => {
            fake.decideHandler = async () => createValidResult();

            const params = createValidParams();
            const result = await fake.Decide(params);

            expect(result.success).toBe(true);
            expect(fake.callCount).toBe(1);
            expect(result.startTime).toBeInstanceOf(Date);
            expect(result.endTime).toBeInstanceOf(Date);
            expect(result.endTime.getTime()).toBeGreaterThanOrEqual(result.startTime.getTime());

            expect(result.Answers.isEligible).toEqual({
                Kind: 'Likelihood',
                Probability: 0.85,
            });
            expect(result.Answers.priorityTier).toEqual({
                Kind: 'Choice',
                Value: 'premium',
                Probabilities: { standard: 0.2, premium: 0.8 },
                Confidence: 0.8,
            });
            expect(result.Answers.riskScore).toEqual({
                Kind: 'Score',
                Value: 1.2,
                Probabilities: { low: 0.1, medium: 0.8, high: 0.1 },
                Confidence: 0.8,
            });
        });
    });

    describe('2. Input validation rules (§5c)', () => {
        describe('State validation', () => {
            const invalidStates: Array<{ name: string; state: unknown }> = [
                { name: 'empty string', state: '' },
                { name: 'whitespace-only string', state: '   ' },
                { name: 'empty object', state: {} },
                { name: 'null', state: null },
                { name: 'number', state: 42 },
                { name: 'boolean', state: true },
                { name: 'array', state: [] },
            ];

            for (const { name, state } of invalidStates) {
                it(`rejects ${name} state without calling DoDecide`, async () => {
                    const params = createValidParams();
                    params.State = state as DecisionParams['State'];

                    const result = await fake.Decide(params);

                    expect(result.success).toBe(false);
                    expect(fake.callCount).toBe(0);
                    expect(result.errorMessage).toContain('State must be a non-empty string once trimmed, or an object with at least one key');
                    expect(result.Answers).toEqual({});
                });
            }

            it('accepts non-empty string state', async () => {
                fake.decideHandler = async () => createValidResult();
                const params = createValidParams();
                params.State = 'Valid state description';

                const result = await fake.Decide(params);

                expect(result.success).toBe(true);
                expect(fake.callCount).toBe(1);
            });

            it('accepts object state with at least one key', async () => {
                fake.decideHandler = async () => createValidResult();
                const params = createValidParams();
                params.State = { entityId: '123', status: 'pending' };

                const result = await fake.Decide(params);

                expect(result.success).toBe(true);
                expect(fake.callCount).toBe(1);
            });
        });

        describe('Questions map validation', () => {
            it('rejects empty questions object without calling DoDecide', async () => {
                const params = createValidParams();
                params.Questions = {};

                const result = await fake.Decide(params);

                expect(result.success).toBe(false);
                expect(fake.callCount).toBe(0);
                expect(result.errorMessage).toContain('Questions must have at least one entry');
            });

            it('rejects null questions without calling DoDecide', async () => {
                const params = createValidParams();
                params.Questions = null as unknown as DecisionParams['Questions'];

                const result = await fake.Decide(params);

                expect(result.success).toBe(false);
                expect(fake.callCount).toBe(0);
                expect(result.errorMessage).toContain('Questions must have at least one entry');
            });
        });

        describe('Question key and Instructions validation', () => {
            it('rejects empty question key without calling DoDecide', async () => {
                const params = createValidParams();
                params.Questions[''] = {
                    Kind: 'Likelihood',
                    Instructions: 'Valid instructions',
                };

                const result = await fake.Decide(params);

                expect(result.success).toBe(false);
                expect(fake.callCount).toBe(0);
                expect(result.errorMessage).toContain('Question key must be a non-empty string once trimmed');
            });

            it('rejects whitespace-only question key without calling DoDecide', async () => {
                const params = createValidParams();
                delete params.Questions.isEligible;
                params.Questions['   '] = {
                    Kind: 'Likelihood',
                    Instructions: 'Valid instructions',
                };

                const result = await fake.Decide(params);

                expect(result.success).toBe(false);
                expect(fake.callCount).toBe(0);
                expect(result.errorMessage).toContain('Question key must be a non-empty string once trimmed');
            });

            it('rejects empty instructions without calling DoDecide', async () => {
                const params = createValidParams();
                params.Questions.isEligible.Instructions = '';

                const result = await fake.Decide(params);

                expect(result.success).toBe(false);
                expect(fake.callCount).toBe(0);
                expect(result.errorMessage).toContain("Question 'isEligible': Instructions must be a non-empty string once trimmed");
            });

            it('rejects whitespace-only instructions without calling DoDecide', async () => {
                const params = createValidParams();
                params.Questions.isEligible.Instructions = '   \t  ';

                const result = await fake.Decide(params);

                expect(result.success).toBe(false);
                expect(fake.callCount).toBe(0);
                expect(result.errorMessage).toContain("Question 'isEligible': Instructions must be a non-empty string once trimmed");
            });

            it('rejects unknown question Kind without calling DoDecide', async () => {
                const params = createValidParams();
                const badQuestions = params.Questions as Record<string, unknown>;
                badQuestions.unknownQ = {
                    Kind: 'UnknownKind',
                    Instructions: 'Some instructions',
                };

                const result = await fake.Decide(params);

                expect(result.success).toBe(false);
                expect(fake.callCount).toBe(0);
                expect(result.errorMessage).toContain("Question 'unknownQ': Unknown question Kind 'UnknownKind'");
            });
        });

        describe('Choice question validation', () => {
            it('rejects Choice question with 0 options without calling DoDecide', async () => {
                const params = createValidParams();
                (params.Questions.priorityTier as { Options: unknown[] }).Options = [];

                const result = await fake.Decide(params);

                expect(result.success).toBe(false);
                expect(fake.callCount).toBe(0);
                expect(result.errorMessage).toContain("Question 'priorityTier': Choice question must have at least 2 options");
            });

            it('rejects Choice question with 1 option without calling DoDecide', async () => {
                const params = createValidParams();
                (params.Questions.priorityTier as { Options: unknown[] }).Options = [
                    { Value: 'opt1', Description: 'Only option' },
                ];

                const result = await fake.Decide(params);

                expect(result.success).toBe(false);
                expect(fake.callCount).toBe(0);
                expect(result.errorMessage).toContain("Question 'priorityTier': Choice question must have at least 2 options");
            });

            it('rejects Choice option with empty Value without calling DoDecide', async () => {
                const params = createValidParams();
                (params.Questions.priorityTier as { Options: unknown[] }).Options = [
                    { Value: '', Description: 'First' },
                    { Value: 'second', Description: 'Second' },
                ];

                const result = await fake.Decide(params);

                expect(result.success).toBe(false);
                expect(fake.callCount).toBe(0);
                expect(result.errorMessage).toContain("Question 'priorityTier': Choice option Value must be a non-empty string");
            });

            it('rejects Choice option with whitespace Value without calling DoDecide', async () => {
                const params = createValidParams();
                (params.Questions.priorityTier as { Options: unknown[] }).Options = [
                    { Value: '   ', Description: 'First' },
                    { Value: 'second', Description: 'Second' },
                ];

                const result = await fake.Decide(params);

                expect(result.success).toBe(false);
                expect(fake.callCount).toBe(0);
                expect(result.errorMessage).toContain("Question 'priorityTier': Choice option Value must be a non-empty string");
            });

            it('rejects Choice options with duplicate Value without calling DoDecide', async () => {
                const params = createValidParams();
                (params.Questions.priorityTier as { Options: unknown[] }).Options = [
                    { Value: 'tier1', Description: 'First description' },
                    { Value: 'tier1', Description: 'Duplicate value' },
                ];

                const result = await fake.Decide(params);

                expect(result.success).toBe(false);
                expect(fake.callCount).toBe(0);
                expect(result.errorMessage).toContain("Question 'priorityTier': Duplicate Choice option Value 'tier1'");
            });

            it('rejects Choice option with empty Description without calling DoDecide', async () => {
                const params = createValidParams();
                (params.Questions.priorityTier as { Options: unknown[] }).Options = [
                    { Value: 'first', Description: '' },
                    { Value: 'second', Description: 'Second desc' },
                ];

                const result = await fake.Decide(params);

                expect(result.success).toBe(false);
                expect(fake.callCount).toBe(0);
                expect(result.errorMessage).toContain("Question 'priorityTier': Choice option Description must be a non-empty string");
            });

            it('rejects Choice option with whitespace Description without calling DoDecide', async () => {
                const params = createValidParams();
                (params.Questions.priorityTier as { Options: unknown[] }).Options = [
                    { Value: 'first', Description: '  \t ' },
                    { Value: 'second', Description: 'Second desc' },
                ];

                const result = await fake.Decide(params);

                expect(result.success).toBe(false);
                expect(fake.callCount).toBe(0);
                expect(result.errorMessage).toContain("Question 'priorityTier': Choice option Description must be a non-empty string");
            });
        });

        describe('Score question validation', () => {
            it('rejects Score question with 0 levels without calling DoDecide', async () => {
                const params = createValidParams();
                (params.Questions.riskScore as { Levels: string[] }).Levels = [];

                const result = await fake.Decide(params);

                expect(result.success).toBe(false);
                expect(fake.callCount).toBe(0);
                expect(result.errorMessage).toContain("Question 'riskScore': Score question must have at least 2 levels");
            });

            it('rejects Score question with 1 level without calling DoDecide', async () => {
                const params = createValidParams();
                (params.Questions.riskScore as { Levels: string[] }).Levels = ['single'];

                const result = await fake.Decide(params);

                expect(result.success).toBe(false);
                expect(fake.callCount).toBe(0);
                expect(result.errorMessage).toContain("Question 'riskScore': Score question must have at least 2 levels");
            });

            it('rejects Score level with empty string without calling DoDecide', async () => {
                const params = createValidParams();
                (params.Questions.riskScore as { Levels: string[] }).Levels = ['', 'high'];

                const result = await fake.Decide(params);

                expect(result.success).toBe(false);
                expect(fake.callCount).toBe(0);
                expect(result.errorMessage).toContain("Question 'riskScore': Score level must be a non-empty string");
            });

            it('rejects Score level with whitespace without calling DoDecide', async () => {
                const params = createValidParams();
                (params.Questions.riskScore as { Levels: string[] }).Levels = ['low', '   '];

                const result = await fake.Decide(params);

                expect(result.success).toBe(false);
                expect(fake.callCount).toBe(0);
                expect(result.errorMessage).toContain("Question 'riskScore': Score level must be a non-empty string");
            });

            it('rejects Score with duplicate levels without calling DoDecide', async () => {
                const params = createValidParams();
                (params.Questions.riskScore as { Levels: string[] }).Levels = ['low', 'medium', 'low'];

                const result = await fake.Decide(params);

                expect(result.success).toBe(false);
                expect(fake.callCount).toBe(0);
                expect(result.errorMessage).toContain("Question 'riskScore': Duplicate Score level 'low'");
            });
        });
    });

    describe('3. Output validation rules (§5c)', () => {
        describe('Question key coverage', () => {
            it('fails and clears Answers when an asked question is missing from Answers', async () => {
                fake.decideHandler = async () => {
                    const res = createValidResult();
                    delete res.Answers.riskScore;
                    return res;
                };

                const result = await fake.Decide(createValidParams());

                expect(result.success).toBe(false);
                expect(result.errorMessage).toContain("Question 'riskScore': Missing answer");
                expect(result.Answers).toEqual({});
            });

            it('fails and clears Answers when driver returns answer for unasked question', async () => {
                fake.decideHandler = async () => {
                    const res = createValidResult();
                    res.Answers.unexpectedQuestion = {
                        Kind: 'Likelihood',
                        Probability: 0.5,
                    };
                    return res;
                };

                const result = await fake.Decide(createValidParams());

                expect(result.success).toBe(false);
                expect(result.errorMessage).toContain("Answer provided for unexpected question 'unexpectedQuestion'");
                expect(result.Answers).toEqual({});
            });
        });

        describe('Answer Kind matching', () => {
            it('fails and clears Answers when Likelihood question answered with Choice', async () => {
                fake.decideHandler = async () => {
                    const res = createValidResult();
                    res.Answers.isEligible = {
                        Kind: 'Choice',
                        Value: 'yes',
                        Probabilities: { yes: 1.0 },
                        Confidence: 1.0,
                    };
                    return res;
                };

                const result = await fake.Decide(createValidParams());

                expect(result.success).toBe(false);
                expect(result.errorMessage).toContain("Question 'isEligible': Answer Kind 'Choice' does not match question Kind 'Likelihood'");
                expect(result.Answers).toEqual({});
            });

            it('fails and clears Answers when Choice question answered with Score', async () => {
                fake.decideHandler = async () => {
                    const res = createValidResult();
                    res.Answers.priorityTier = {
                        Kind: 'Score',
                        Value: 1,
                        Probabilities: { standard: 0.5, premium: 0.5 },
                        Confidence: 0.8,
                    };
                    return res;
                };

                const result = await fake.Decide(createValidParams());

                expect(result.success).toBe(false);
                expect(result.errorMessage).toContain("Question 'priorityTier': Answer Kind 'Score' does not match question Kind 'Choice'");
                expect(result.Answers).toEqual({});
            });

            it('fails and clears Answers when Score question answered with Likelihood', async () => {
                fake.decideHandler = async () => {
                    const res = createValidResult();
                    res.Answers.riskScore = {
                        Kind: 'Likelihood',
                        Probability: 0.3,
                    };
                    return res;
                };

                const result = await fake.Decide(createValidParams());

                expect(result.success).toBe(false);
                expect(result.errorMessage).toContain("Question 'riskScore': Answer Kind 'Likelihood' does not match question Kind 'Score'");
                expect(result.Answers).toEqual({});
            });
        });

        describe('Probability and Confidence range [0, 1] and finite', () => {
            it('fails when Likelihood Probability is negative', async () => {
                fake.decideHandler = async () => {
                    const res = createValidResult();
                    (res.Answers.isEligible as LikelihoodAnswer).Probability = -0.1;
                    return res;
                };

                const result = await fake.Decide(createValidParams());

                expect(result.success).toBe(false);
                expect(result.errorMessage).toContain("Question 'isEligible': Likelihood Probability must be a finite number in [0, 1]");
                expect(result.Answers).toEqual({});
            });

            it('fails when Likelihood Probability exceeds 1', async () => {
                fake.decideHandler = async () => {
                    const res = createValidResult();
                    (res.Answers.isEligible as LikelihoodAnswer).Probability = 1.05;
                    return res;
                };

                const result = await fake.Decide(createValidParams());

                expect(result.success).toBe(false);
                expect(result.errorMessage).toContain("Question 'isEligible': Likelihood Probability must be a finite number in [0, 1]");
                expect(result.Answers).toEqual({});
            });

            it('fails when Likelihood Probability is NaN', async () => {
                fake.decideHandler = async () => {
                    const res = createValidResult();
                    (res.Answers.isEligible as LikelihoodAnswer).Probability = NaN;
                    return res;
                };

                const result = await fake.Decide(createValidParams());

                expect(result.success).toBe(false);
                expect(result.errorMessage).toContain("Question 'isEligible': Likelihood Probability must be a finite number in [0, 1]");
                expect(result.Answers).toEqual({});
            });

            it('fails when Choice Confidence is out of range', async () => {
                fake.decideHandler = async () => {
                    const res = createValidResult();
                    (res.Answers.priorityTier as ChoiceAnswer).Confidence = 1.2;
                    return res;
                };

                const result = await fake.Decide(createValidParams());

                expect(result.success).toBe(false);
                expect(result.errorMessage).toContain("Question 'priorityTier': Choice Confidence must be a finite number in [0, 1]");
                expect(result.Answers).toEqual({});
            });

            it('fails when Score Confidence is negative', async () => {
                fake.decideHandler = async () => {
                    const res = createValidResult();
                    (res.Answers.riskScore as ScoreAnswer).Confidence = -0.2;
                    return res;
                };

                const result = await fake.Decide(createValidParams());

                expect(result.success).toBe(false);
                expect(result.errorMessage).toContain("Question 'riskScore': Score Confidence must be a finite number in [0, 1]");
                expect(result.Answers).toEqual({});
            });
        });

        describe('Choice answer rules', () => {
            it('fails when Choice Value is not one of the option values', async () => {
                fake.decideHandler = async () => {
                    const res = createValidResult();
                    (res.Answers.priorityTier as ChoiceAnswer).Value = 'ultra_vip';
                    return res;
                };

                const result = await fake.Decide(createValidParams());

                expect(result.success).toBe(false);
                expect(result.errorMessage).toContain("Question 'priorityTier': Choice value 'ultra_vip' is not one of the options");
                expect(result.Answers).toEqual({});
            });

            it('fails when Choice Probabilities misses an option key', async () => {
                fake.decideHandler = async () => {
                    const res = createValidResult();
                    (res.Answers.priorityTier as ChoiceAnswer).Probabilities = {
                        standard: 1.0,
                    };
                    return res;
                };

                const result = await fake.Decide(createValidParams());

                expect(result.success).toBe(false);
                expect(result.errorMessage).toContain("Question 'priorityTier': Probabilities missing key for option 'premium'");
                expect(result.Answers).toEqual({});
            });

            it('fails when Choice Probabilities contains unexpected keys', async () => {
                fake.decideHandler = async () => {
                    const res = createValidResult();
                    (res.Answers.priorityTier as ChoiceAnswer).Probabilities = {
                        standard: 0.1,
                        premium: 0.8,
                        extraOption: 0.1,
                    };
                    return res;
                };

                const result = await fake.Decide(createValidParams());

                expect(result.success).toBe(false);
                expect(result.errorMessage).toContain("Question 'priorityTier': Probabilities contains unexpected key 'extraOption'");
                expect(result.Answers).toEqual({});
            });

            it('fails when a Choice probability value is invalid', async () => {
                fake.decideHandler = async () => {
                    const res = createValidResult();
                    (res.Answers.priorityTier as ChoiceAnswer).Probabilities = {
                        standard: -0.2,
                        premium: 1.2,
                    };
                    return res;
                };

                const result = await fake.Decide(createValidParams());

                expect(result.success).toBe(false);
                expect(result.errorMessage).toContain("Question 'priorityTier': Probability for option 'standard' must be a finite number in [0, 1]");
                expect(result.Answers).toEqual({});
            });
        });

        describe('Score answer rules', () => {
            it('fails when Score Value is below 0', async () => {
                fake.decideHandler = async () => {
                    const res = createValidResult();
                    (res.Answers.riskScore as ScoreAnswer).Value = -0.5;
                    return res;
                };

                const result = await fake.Decide(createValidParams());

                expect(result.success).toBe(false);
                expect(result.errorMessage).toContain("Question 'riskScore': Score value -0.5 must be a finite number in [0, 2]");
                expect(result.Answers).toEqual({});
            });

            it('fails when Score Value exceeds Levels.length - 1', async () => {
                fake.decideHandler = async () => {
                    const res = createValidResult();
                    (res.Answers.riskScore as ScoreAnswer).Value = 2.5; // Levels has 3 items: max is 2
                    return res;
                };

                const result = await fake.Decide(createValidParams());

                expect(result.success).toBe(false);
                expect(result.errorMessage).toContain("Question 'riskScore': Score value 2.5 must be a finite number in [0, 2]");
                expect(result.Answers).toEqual({});
            });

            it('fails when Score Probabilities misses a level name', async () => {
                fake.decideHandler = async () => {
                    const res = createValidResult();
                    (res.Answers.riskScore as ScoreAnswer).Probabilities = {
                        low: 0.5,
                        medium: 0.5,
                    };
                    return res;
                };

                const result = await fake.Decide(createValidParams());

                expect(result.success).toBe(false);
                expect(result.errorMessage).toContain("Question 'riskScore': Probabilities missing key for level 'high'");
                expect(result.Answers).toEqual({});
            });

            it('fails when Score Probabilities contains an extra level', async () => {
                fake.decideHandler = async () => {
                    const res = createValidResult();
                    (res.Answers.riskScore as ScoreAnswer).Probabilities = {
                        low: 0.1,
                        medium: 0.7,
                        high: 0.1,
                        critical: 0.1,
                    };
                    return res;
                };

                const result = await fake.Decide(createValidParams());

                expect(result.success).toBe(false);
                expect(result.errorMessage).toContain("Question 'riskScore': Probabilities contains unexpected key 'critical'");
                expect(result.Answers).toEqual({});
            });

            it('fails when a Score probability value is invalid', async () => {
                fake.decideHandler = async () => {
                    const res = createValidResult();
                    (res.Answers.riskScore as ScoreAnswer).Probabilities = {
                        low: NaN,
                        medium: 0.5,
                        high: 0.5,
                    };
                    return res;
                };

                const result = await fake.Decide(createValidParams());

                expect(result.success).toBe(false);
                expect(result.errorMessage).toContain("Question 'riskScore': Probability for level 'low' must be a finite number in [0, 1]");
                expect(result.Answers).toEqual({});
            });
        });
    });

    describe('4. Driver failure pass-through', () => {
        it('passes through driver result with success === false and sets timing', async () => {
            fake.decideHandler = async () => {
                const res = new DecisionResult(false, new Date(0), new Date(0));
                res.errorMessage = 'Rate limit exceeded on provider';
                return res;
            };

            const result = await fake.Decide(createValidParams());

            expect(result.success).toBe(false);
            expect(result.errorMessage).toBe('Rate limit exceeded on provider');
            expect(result.startTime).toBeInstanceOf(Date);
            expect(result.endTime).toBeInstanceOf(Date);
            expect(result.startTime.getTime()).toBeGreaterThan(0);
        });

        it('handles null result from driver safely', async () => {
            fake.decideHandler = async () => null as unknown as DecisionResult;

            const result = await fake.Decide(createValidParams());

            expect(result.success).toBe(false);
            expect(result.errorMessage).toBe('Driver returned null or undefined result');
            expect(result.Answers).toEqual({});
            expect(result.startTime).toBeInstanceOf(Date);
            expect(result.endTime).toBeInstanceOf(Date);
        });
    });

    describe('5. Thrown exception handling', () => {
        it('resolves without rejecting when DoDecide throws an Error', async () => {
            fake.decideHandler = async () => {
                throw new Error('Connection refused by remote host');
            };

            const result = await fake.Decide(createValidParams());

            expect(result.success).toBe(false);
            expect(result.errorMessage).toBe('Connection refused by remote host');
            expect(result.exception).toBeInstanceOf(Error);
            expect(result.errorInfo).toBeDefined();
            expect(result.Answers).toEqual({});
            expect(result.startTime).toBeInstanceOf(Date);
            expect(result.endTime).toBeInstanceOf(Date);
        });

        it('resolves without rejecting when DoDecide throws a non-Error string', async () => {
            fake.decideHandler = async () => {
                throw 'Raw string exception';
            };

            const result = await fake.Decide(createValidParams());

            expect(result.success).toBe(false);
            expect(result.errorMessage).toBe('Raw string exception');
            expect(result.exception).toBe('Raw string exception');
            expect(result.errorInfo).toBeDefined();
            expect(result.Answers).toEqual({});
        });
    });

    describe('6. Probability sum tolerance (0.995 and 1.005 pass, 0.985 and 1.015 fail)', () => {
        it('Choice: accepts probability sum of 0.995', async () => {
            fake.decideHandler = async () => {
                const res = createValidResult();
                (res.Answers.priorityTier as ChoiceAnswer).Probabilities = {
                    standard: 0.195,
                    premium: 0.8,
                };
                return res;
            };

            const result = await fake.Decide(createValidParams());

            expect(result.success).toBe(true);
        });

        it('Choice: accepts probability sum of 1.005', async () => {
            fake.decideHandler = async () => {
                const res = createValidResult();
                (res.Answers.priorityTier as ChoiceAnswer).Probabilities = {
                    standard: 0.205,
                    premium: 0.8,
                };
                return res;
            };

            const result = await fake.Decide(createValidParams());

            expect(result.success).toBe(true);
        });

        it('Choice: rejects probability sum of 0.985 and clears Answers', async () => {
            fake.decideHandler = async () => {
                const res = createValidResult();
                (res.Answers.priorityTier as ChoiceAnswer).Probabilities = {
                    standard: 0.185,
                    premium: 0.8,
                };
                return res;
            };

            const result = await fake.Decide(createValidParams());

            expect(result.success).toBe(false);
            expect(result.errorMessage).toContain("Question 'priorityTier': Probabilities sum to 0.985, which is outside tolerance [0.99, 1.01]");
            expect(result.Answers).toEqual({});
        });

        it('Choice: rejects probability sum of 1.015 and clears Answers', async () => {
            fake.decideHandler = async () => {
                const res = createValidResult();
                (res.Answers.priorityTier as ChoiceAnswer).Probabilities = {
                    standard: 0.215,
                    premium: 0.8,
                };
                return res;
            };

            const result = await fake.Decide(createValidParams());

            expect(result.success).toBe(false);
            expect(result.errorMessage).toContain("Question 'priorityTier': Probabilities sum to 1.015, which is outside tolerance [0.99, 1.01]");
            expect(result.Answers).toEqual({});
        });

        it('Score: accepts probability sum of 0.995', async () => {
            fake.decideHandler = async () => {
                const res = createValidResult();
                (res.Answers.riskScore as ScoreAnswer).Probabilities = {
                    low: 0.095,
                    medium: 0.8,
                    high: 0.1,
                };
                return res;
            };

            const result = await fake.Decide(createValidParams());

            expect(result.success).toBe(true);
        });

        it('Score: accepts probability sum of 1.005', async () => {
            fake.decideHandler = async () => {
                const res = createValidResult();
                (res.Answers.riskScore as ScoreAnswer).Probabilities = {
                    low: 0.105,
                    medium: 0.8,
                    high: 0.1,
                };
                return res;
            };

            const result = await fake.Decide(createValidParams());

            expect(result.success).toBe(true);
        });

        it('Score: rejects probability sum of 0.985 and clears Answers', async () => {
            fake.decideHandler = async () => {
                const res = createValidResult();
                (res.Answers.riskScore as ScoreAnswer).Probabilities = {
                    low: 0.085,
                    medium: 0.8,
                    high: 0.1,
                };
                return res;
            };

            const result = await fake.Decide(createValidParams());

            expect(result.success).toBe(false);
            expect(result.errorMessage).toContain("Question 'riskScore': Probabilities sum to 0.985, which is outside tolerance [0.99, 1.01]");
            expect(result.Answers).toEqual({});
        });

        it('Score: rejects probability sum of 1.015 and clears Answers', async () => {
            fake.decideHandler = async () => {
                const res = createValidResult();
                (res.Answers.riskScore as ScoreAnswer).Probabilities = {
                    low: 0.115,
                    medium: 0.8,
                    high: 0.1,
                };
                return res;
            };

            const result = await fake.Decide(createValidParams());

            expect(result.success).toBe(false);
            expect(result.errorMessage).toContain("Question 'riskScore': Probabilities sum to 1.015, which is outside tolerance [0.99, 1.01]");
            expect(result.Answers).toEqual({});
        });
    });
});
