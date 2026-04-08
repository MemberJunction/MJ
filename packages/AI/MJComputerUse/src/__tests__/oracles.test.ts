import { describe, it, expect } from 'vitest';
import { GoalCompletionOracle } from '../test-driver/oracles/GoalCompletionOracle.js';
import { UrlMatchOracle } from '../test-driver/oracles/UrlMatchOracle.js';
import { StepCountOracle } from '../test-driver/oracles/StepCountOracle.js';
import type { ComputerUseActualOutput } from '../test-driver/types.js';
import type { OracleInput, OracleResult } from '@memberjunction/testing-engine';
import type { UserInfo } from '@memberjunction/core';

/**
 * Helper to build a minimal OracleInput. The oracles cast actualOutput
 * and expectedOutput internally, so we only need the shape they expect.
 */
function buildInput(overrides: {
    actualOutput?: Partial<ComputerUseActualOutput>;
    expectedOutput?: Record<string, unknown>;
} = {}): OracleInput {
    return {
        test: {} as OracleInput['test'], // oracles don't inspect the test entity
        actualOutput: overrides.actualOutput,
        expectedOutput: overrides.expectedOutput,
        contextUser: {} as UserInfo, // oracles don't inspect contextUser in these tests
    };
}

/** Type-safe accessor for oracle-specific details */
function details(result: OracleResult): Record<string, unknown> {
    return (result.details ?? {}) as Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════════
// GoalCompletionOracle
// ═══════════════════════════════════════════════════════════════════
describe('GoalCompletionOracle', () => {
    const oracle = new GoalCompletionOracle();

    it('should have the correct type identifier', () => {
        expect(oracle.type).toBe('goal-completion');
    });

    describe('when there is no actual output', () => {
        it('should fail with score 0', async () => {
            const result = await oracle.evaluate(buildInput(), {});
            expect(result.passed).toBe(false);
            expect(result.score).toBe(0);
            expect(result.message).toContain('No actual output');
        });
    });

    describe('when the engine reported failure', () => {
        it('should fail with status information', async () => {
            const result = await oracle.evaluate(
                buildInput({
                    actualOutput: {
                        success: false,
                        status: 'Error',
                        totalSteps: 3,
                        totalDurationMs: 1000,
                        finalUrl: '',
                        stepCount: 3,
                        error: 'Browser crashed',
                    },
                }),
                {}
            );
            expect(result.passed).toBe(false);
            expect(result.score).toBe(0);
            expect(result.message).toContain('failure');
            expect(details(result).error).toBe('Browser crashed');
        });
    });

    describe('when the engine succeeded but there is no judge verdict', () => {
        it('should fail with score 0.5', async () => {
            const result = await oracle.evaluate(
                buildInput({
                    actualOutput: {
                        success: true,
                        status: 'Completed',
                        totalSteps: 5,
                        totalDurationMs: 2000,
                        finalUrl: 'https://example.com',
                        stepCount: 5,
                    },
                }),
                {}
            );
            expect(result.passed).toBe(false);
            expect(result.score).toBe(0.5);
            expect(result.message).toContain('no judge verdict');
        });
    });

    describe('when the judge says Done=false', () => {
        it('should fail with partial credit based on confidence', async () => {
            const result = await oracle.evaluate(
                buildInput({
                    actualOutput: {
                        success: true,
                        status: 'Completed',
                        totalSteps: 10,
                        totalDurationMs: 5000,
                        finalUrl: 'https://example.com',
                        stepCount: 10,
                        finalJudgeVerdict: {
                            Done: false,
                            Confidence: 0.6,
                            Reason: 'Goal not fully met',
                        },
                    },
                }),
                {}
            );
            expect(result.passed).toBe(false);
            // Partial credit: Confidence * 0.5 = 0.6 * 0.5 = 0.3
            expect(result.score).toBe(0.3);
        });
    });

    describe('when the judge says Done=true but confidence is below threshold', () => {
        it('should fail when confidence is below default threshold (0.5)', async () => {
            const result = await oracle.evaluate(
                buildInput({
                    actualOutput: {
                        success: true,
                        status: 'Completed',
                        totalSteps: 5,
                        totalDurationMs: 2000,
                        finalUrl: 'https://example.com',
                        stepCount: 5,
                        finalJudgeVerdict: {
                            Done: true,
                            Confidence: 0.3,
                            Reason: 'Somewhat done',
                        },
                    },
                }),
                {}
            );
            expect(result.passed).toBe(false);
            expect(result.score).toBe(0.3);
            expect(result.message).toContain('below threshold');
        });

        it('should fail when confidence is below custom threshold', async () => {
            const result = await oracle.evaluate(
                buildInput({
                    actualOutput: {
                        success: true,
                        status: 'Completed',
                        totalSteps: 5,
                        totalDurationMs: 2000,
                        finalUrl: 'https://example.com',
                        stepCount: 5,
                        finalJudgeVerdict: {
                            Done: true,
                            Confidence: 0.6,
                            Reason: 'Almost there',
                        },
                    },
                }),
                { minConfidence: 0.8 }
            );
            expect(result.passed).toBe(false);
            expect(result.score).toBe(0.6);
        });
    });

    describe('when the judge confirms goal completion with sufficient confidence', () => {
        it('should pass with default threshold', async () => {
            const result = await oracle.evaluate(
                buildInput({
                    actualOutput: {
                        success: true,
                        status: 'Completed',
                        totalSteps: 5,
                        totalDurationMs: 2000,
                        finalUrl: 'https://example.com/success',
                        stepCount: 5,
                        finalJudgeVerdict: {
                            Done: true,
                            Confidence: 0.9,
                            Reason: 'Goal fully achieved',
                        },
                    },
                }),
                {}
            );
            expect(result.passed).toBe(true);
            expect(result.score).toBe(0.9);
            expect(result.message).toContain('Goal completed');
            expect(details(result).finalUrl).toBe('https://example.com/success');
        });

        it('should pass when confidence equals the threshold exactly', async () => {
            const result = await oracle.evaluate(
                buildInput({
                    actualOutput: {
                        success: true,
                        status: 'Completed',
                        totalSteps: 5,
                        totalDurationMs: 2000,
                        finalUrl: 'https://example.com',
                        stepCount: 5,
                        finalJudgeVerdict: {
                            Done: true,
                            Confidence: 0.7,
                            Reason: 'Done',
                        },
                    },
                }),
                { minConfidence: 0.7 }
            );
            expect(result.passed).toBe(true);
            expect(result.score).toBe(0.7);
        });

        it('should pass with a custom lower threshold', async () => {
            const result = await oracle.evaluate(
                buildInput({
                    actualOutput: {
                        success: true,
                        status: 'Completed',
                        totalSteps: 2,
                        totalDurationMs: 500,
                        finalUrl: 'https://example.com',
                        stepCount: 2,
                        finalJudgeVerdict: {
                            Done: true,
                            Confidence: 0.3,
                            Reason: 'Done with low confidence',
                        },
                    },
                }),
                { minConfidence: 0.1 }
            );
            expect(result.passed).toBe(true);
            expect(result.score).toBe(0.3);
        });
    });
});

// ═══════════════════════════════════════════════════════════════════
// UrlMatchOracle
// ═══════════════════════════════════════════════════════════════════
describe('UrlMatchOracle', () => {
    const oracle = new UrlMatchOracle();

    it('should have the correct type identifier', () => {
        expect(oracle.type).toBe('url-match');
    });

    describe('when no pattern is provided', () => {
        it('should fail when neither config nor expectedOutput has a pattern', async () => {
            const result = await oracle.evaluate(buildInput(), {});
            expect(result.passed).toBe(false);
            expect(result.message).toContain('No URL pattern');
        });
    });

    describe('when no final URL is available', () => {
        it('should fail when actualOutput is undefined', async () => {
            const result = await oracle.evaluate(buildInput(), { pattern: '^https://' });
            expect(result.passed).toBe(false);
            expect(result.message).toContain('No final URL');
        });

        it('should fail when finalUrl is empty', async () => {
            const result = await oracle.evaluate(
                buildInput({
                    actualOutput: {
                        success: true,
                        status: 'Completed',
                        totalSteps: 1,
                        totalDurationMs: 100,
                        finalUrl: '',
                        stepCount: 1,
                    },
                }),
                { pattern: '^https://' }
            );
            expect(result.passed).toBe(false);
            expect(result.message).toContain('No final URL');
        });
    });

    describe('URL matching', () => {
        it('should pass when the URL matches the pattern from config', async () => {
            const result = await oracle.evaluate(
                buildInput({
                    actualOutput: {
                        success: true,
                        status: 'Completed',
                        totalSteps: 3,
                        totalDurationMs: 1000,
                        finalUrl: 'https://example.com/dashboard',
                        stepCount: 3,
                    },
                }),
                { pattern: '^https://example\\.com/dashboard' }
            );
            expect(result.passed).toBe(true);
            expect(result.score).toBe(1.0);
        });

        it('should pass when the URL matches a pattern from expectedOutput', async () => {
            const result = await oracle.evaluate(
                buildInput({
                    actualOutput: {
                        success: true,
                        status: 'Completed',
                        totalSteps: 3,
                        totalDurationMs: 1000,
                        finalUrl: 'https://example.com/dashboard',
                        stepCount: 3,
                    },
                    expectedOutput: {
                        finalUrlPattern: 'dashboard$',
                    },
                }),
                {}
            );
            expect(result.passed).toBe(true);
            expect(result.score).toBe(1.0);
        });

        it('should prefer config pattern over expectedOutput pattern', async () => {
            const result = await oracle.evaluate(
                buildInput({
                    actualOutput: {
                        success: true,
                        status: 'Completed',
                        totalSteps: 1,
                        totalDurationMs: 100,
                        finalUrl: 'https://example.com/dashboard',
                        stepCount: 1,
                    },
                    expectedOutput: {
                        finalUrlPattern: 'will-not-match',
                    },
                }),
                { pattern: 'dashboard$' }
            );
            // Config pattern should take precedence and match
            expect(result.passed).toBe(true);
        });

        it('should fail when the URL does not match', async () => {
            const result = await oracle.evaluate(
                buildInput({
                    actualOutput: {
                        success: true,
                        status: 'Completed',
                        totalSteps: 5,
                        totalDurationMs: 2000,
                        finalUrl: 'https://example.com/login',
                        stepCount: 5,
                    },
                }),
                { pattern: '^https://example\\.com/dashboard' }
            );
            expect(result.passed).toBe(false);
            expect(result.score).toBe(0);
            expect(result.message).toContain('does not match');
        });
    });

    describe('invalid regex pattern', () => {
        it('should fail with a descriptive error for an invalid regex', async () => {
            const result = await oracle.evaluate(
                buildInput({
                    actualOutput: {
                        success: true,
                        status: 'Completed',
                        totalSteps: 1,
                        totalDurationMs: 100,
                        finalUrl: 'https://example.com',
                        stepCount: 1,
                    },
                }),
                { pattern: '[invalid' }
            );
            expect(result.passed).toBe(false);
            expect(result.score).toBe(0);
            expect(result.message).toContain('Invalid');
        });
    });
});

// ═══════════════════════════════════════════════════════════════════
// StepCountOracle
// ═══════════════════════════════════════════════════════════════════
describe('StepCountOracle', () => {
    const oracle = new StepCountOracle();

    it('should have the correct type identifier', () => {
        expect(oracle.type).toBe('step-count');
    });

    describe('when no step limit is defined', () => {
        it('should pass by default with score 1.0', async () => {
            const result = await oracle.evaluate(
                buildInput({
                    actualOutput: {
                        success: true,
                        status: 'Completed',
                        totalSteps: 50,
                        totalDurationMs: 10000,
                        finalUrl: 'https://example.com',
                        stepCount: 50,
                    },
                }),
                {}
            );
            expect(result.passed).toBe(true);
            expect(result.score).toBe(1.0);
            expect(result.message).toContain('no limit defined');
        });

        it('should default totalSteps to 0 when no actualOutput is provided', async () => {
            const result = await oracle.evaluate(buildInput(), {});
            expect(result.passed).toBe(true);
            expect(result.score).toBe(1.0);
            expect(result.message).toContain('0 steps');
        });
    });

    describe('when steps are within the limit', () => {
        it('should pass with config-provided maxSteps', async () => {
            const result = await oracle.evaluate(
                buildInput({
                    actualOutput: {
                        success: true,
                        status: 'Completed',
                        totalSteps: 8,
                        totalDurationMs: 3000,
                        finalUrl: 'https://example.com',
                        stepCount: 8,
                    },
                }),
                { maxSteps: 15 }
            );
            expect(result.passed).toBe(true);
            expect(result.message).toContain('8 steps');
            expect(result.message).toContain('limit: 15');
        });

        it('should pass with expectedOutput-provided maxSteps', async () => {
            const result = await oracle.evaluate(
                buildInput({
                    actualOutput: {
                        success: true,
                        status: 'Completed',
                        totalSteps: 5,
                        totalDurationMs: 1000,
                        finalUrl: '',
                        stepCount: 5,
                    },
                    expectedOutput: { maxSteps: 10 },
                }),
                {}
            );
            expect(result.passed).toBe(true);
        });

        it('should pass when totalSteps exactly equals maxSteps', async () => {
            const result = await oracle.evaluate(
                buildInput({
                    actualOutput: {
                        success: true,
                        status: 'Completed',
                        totalSteps: 10,
                        totalDurationMs: 4000,
                        finalUrl: '',
                        stepCount: 10,
                    },
                }),
                { maxSteps: 10 }
            );
            expect(result.passed).toBe(true);
            expect(result.message).toContain('10 steps');
        });

        it('should give higher score for fewer steps (efficiency)', async () => {
            const fewSteps = await oracle.evaluate(
                buildInput({
                    actualOutput: {
                        success: true,
                        status: 'Completed',
                        totalSteps: 2,
                        totalDurationMs: 500,
                        finalUrl: '',
                        stepCount: 2,
                    },
                }),
                { maxSteps: 20 }
            );
            const manySteps = await oracle.evaluate(
                buildInput({
                    actualOutput: {
                        success: true,
                        status: 'Completed',
                        totalSteps: 18,
                        totalDurationMs: 9000,
                        finalUrl: '',
                        stepCount: 18,
                    },
                }),
                { maxSteps: 20 }
            );
            expect(fewSteps.score).toBeGreaterThan(manySteps.score);
        });

        it('should have a minimum score of 0.5 when passing', async () => {
            const result = await oracle.evaluate(
                buildInput({
                    actualOutput: {
                        success: true,
                        status: 'Completed',
                        totalSteps: 10,
                        totalDurationMs: 4000,
                        finalUrl: '',
                        stepCount: 10,
                    },
                }),
                { maxSteps: 10 }
            );
            expect(result.score).toBeGreaterThanOrEqual(0.5);
        });

        it('should handle zero totalSteps with a maxSteps limit', async () => {
            const result = await oracle.evaluate(
                buildInput({
                    actualOutput: {
                        success: true,
                        status: 'Completed',
                        totalSteps: 0,
                        totalDurationMs: 0,
                        finalUrl: '',
                        stepCount: 0,
                    },
                }),
                { maxSteps: 10 }
            );
            expect(result.passed).toBe(true);
            expect(result.score).toBe(1.0);
        });
    });

    describe('when steps exceed the limit', () => {
        it('should fail with score 0', async () => {
            const result = await oracle.evaluate(
                buildInput({
                    actualOutput: {
                        success: true,
                        status: 'Completed',
                        totalSteps: 25,
                        totalDurationMs: 10000,
                        finalUrl: '',
                        stepCount: 25,
                    },
                }),
                { maxSteps: 15 }
            );
            expect(result.passed).toBe(false);
            expect(result.score).toBe(0);
            expect(result.message).toContain('Exceeded');
            expect(result.message).toContain('25 steps');
            expect(result.message).toContain('limit: 15');
        });

        it('should fail when totalSteps is one more than maxSteps', async () => {
            const result = await oracle.evaluate(
                buildInput({
                    actualOutput: {
                        success: true,
                        status: 'Completed',
                        totalSteps: 11,
                        totalDurationMs: 4500,
                        finalUrl: '',
                        stepCount: 11,
                    },
                }),
                { maxSteps: 10 }
            );
            expect(result.passed).toBe(false);
            expect(result.score).toBe(0);
        });
    });

    describe('config precedence', () => {
        it('should prefer config maxSteps over expectedOutput maxSteps', async () => {
            // config maxSteps = 5, expectedOutput maxSteps = 20, totalSteps = 10
            // If config takes precedence, 10 > 5 => fail
            const result = await oracle.evaluate(
                buildInput({
                    actualOutput: {
                        success: true,
                        status: 'Completed',
                        totalSteps: 10,
                        totalDurationMs: 4000,
                        finalUrl: '',
                        stepCount: 10,
                    },
                    expectedOutput: { maxSteps: 20 },
                }),
                { maxSteps: 5 }
            );
            expect(result.passed).toBe(false);
        });
    });
});
