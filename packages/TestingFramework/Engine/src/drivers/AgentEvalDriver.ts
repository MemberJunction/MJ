/**
 * @fileoverview Test driver for AI Agent evaluation
 * @module @memberjunction/testing-engine
 */

import { UserInfo, Metadata } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { AIAgentEntity, AIAgentRunEntity, TestEntity, TestRunEntity } from '@memberjunction/core-entities';
import { AgentRunner } from '@memberjunction/ai-agents';
import { ChatMessage } from '@memberjunction/ai';
import { BaseTestDriver } from './BaseTestDriver';
import {
    DriverExecutionContext,
    DriverExecutionResult,
    OracleInput,
    OracleResult,
    ValidationResult,
    ValidationError,
    ValidationWarning
} from '../types';

/**
 * Configuration for Agent Evaluation tests.
 */
export interface AgentEvalConfig {
    /**
     * Agent to test
     */
    agentId: string;

    /**
     * Oracles to run for evaluation
     */
    oracles: {
        type: string;
        config?: Record<string, unknown>;
        weight?: number;
    }[];

    /**
     * Scoring weights by oracle type
     */
    scoringWeights?: Record<string, number>;

    /**
     * Maximum execution time in milliseconds
     */
    maxExecutionTime?: number;
}

/**
 * Input definition for Agent Evaluation tests.
 */
export interface AgentEvalInput {
    /**
     * User message to send to agent
     */
    userMessage: string;

    /**
     * Optional conversation context
     */
    conversationContext?: {
        conversationId?: string;
        priorMessages?: Array<{
            role: 'user' | 'assistant';
            content: string;
        }>;
    };

    /**
     * Optional agent execution parameters
     */
    executionParams?: {
        modelOverride?: string;
        temperatureOverride?: number;
        maxTokensOverride?: number;
    };
}

/**
 * Expected outcomes for Agent Evaluation tests.
 */
export interface AgentEvalExpectedOutcomes {
    /**
     * Expected response patterns (for regex matching)
     */
    responsePatterns?: string[];

    /**
     * Expected entities mentioned in response
     */
    expectedEntities?: string[];

    /**
     * Expected actions taken
     */
    expectedActions?: string[];

    /**
     * Schema for response validation
     */
    responseSchema?: Record<string, unknown>;

    /**
     * SQL queries to validate database state
     */
    sqlValidations?: Array<{
        query: string;
        expectedResult: unknown;
    }>;

    /**
     * Custom validation criteria for LLM judge
     */
    judgeValidationCriteria?: string[];
}

/**
 * Test driver for AI Agent evaluation.
 *
 * Executes an AI agent with test input, runs configured oracles,
 * and creates bidirectional link between TestRun and AgentRun.
 *
 * @example
 * ```typescript
 * // Configuration JSON in Test entity
 * {
 *   "agentId": "agent-123",
 *   "oracles": [
 *     { "type": "trace-no-errors", "weight": 0.2 },
 *     { "type": "llm-judge", "weight": 0.5, "config": { "criteria": [...] } },
 *     { "type": "schema-validate", "weight": 0.3, "config": { "schema": {...} } }
 *   ],
 *   "scoringWeights": { "trace-no-errors": 0.2, "llm-judge": 0.5, "schema-validate": 0.3 }
 * }
 *
 * // InputDefinition JSON in Test entity
 * {
 *   "userMessage": "Create a report showing sales by region",
 *   "conversationContext": null,
 *   "executionParams": { "temperatureOverride": 0.3 }
 * }
 *
 * // ExpectedOutcomes JSON in Test entity
 * {
 *   "responsePatterns": ["sales.*region", "chart|graph"],
 *   "expectedEntities": ["Report", "Dashboard"],
 *   "responseSchema": { "type": "object", "properties": {...} },
 *   "judgeValidationCriteria": [
 *     "Response accurately answers the user's question",
 *     "Report includes proper data visualization",
 *     "Response is professional and clear"
 *   ]
 * }
 * ```
 */
@RegisterClass(BaseTestDriver, 'AgentEvalDriver')
export class AgentEvalDriver extends BaseTestDriver {
    /**
     * Execute agent evaluation test.
     *
     * Steps:
     * 1. Parse configuration and input
     * 2. Load and execute agent via AgentRunner
     * 3. Create bidirectional link (TestRun ↔ AgentRun)
     * 4. Run oracles to evaluate results
     * 5. Calculate score and determine status
     * 6. Return structured results
     *
     * @param context - Execution context
     * @returns Execution result
     */
    public async Execute(context: DriverExecutionContext): Promise<DriverExecutionResult> {
        this.log('Starting agent evaluation', context.options.verbose);

        try {
            // Parse configuration
            const config = this.parseConfig<AgentEvalConfig>(context.test);
            const input = this.parseInputDefinition<AgentEvalInput>(context.test);
            const expected = this.parseExpectedOutcomes<AgentEvalExpectedOutcomes>(context.test);

            // Load agent
            const agent = await this.loadAgent(config.agentId, context.contextUser);

            // Execute agent
            this.log(`Executing agent: ${agent.Name}`, context.options.verbose);
            const agentResult = await this.executeAgent(
                agent,
                input,
                context.contextUser,
                context.test,
                config.maxExecutionTime
            );

            const agentRun = agentResult.agentRun;

            // Create bidirectional link
            await this.linkTestRunToAgentRun(context.testRun, agentRun);

            // Extract actual output
            const actualOutput = this.extractAgentOutput(agentRun);

            // Run oracles
            this.log('Running oracles for evaluation', context.options.verbose);
            const oracleResults = await this.runOracles(
                config,
                input,
                expected,
                actualOutput,
                agentRun,
                context
            );

            // Calculate score and status
            // When oracles are disabled, consider test passed if agent succeeded
            const score = this.calculateScore(oracleResults, config.scoringWeights);
            const status = oracleResults.length === 0 && agentRun.Status === 'Completed'
                ? 'Passed'
                : this.determineStatus(oracleResults);

            // Count checks
            const passedChecks = oracleResults.filter(r => r.passed).length;
            const totalChecks = oracleResults.length;

            // Calculate cost
            const totalCost = this.calculateTotalCost(agentRun);

            // Calculate duration in MS
            const durationMs = this.calculateDurationMs(agentRun);

            // Build result
            const result: DriverExecutionResult = {
                targetType: 'AI Agent',
                targetLogId: agentRun.ID,
                status,
                score,
                oracleResults,
                passedChecks,
                failedChecks: totalChecks - passedChecks,
                totalChecks,
                inputData: input,
                expectedOutput: expected,
                actualOutput,
                totalCost,
                durationMs
            };

            this.log(
                `Agent evaluation completed: ${status} (Score: ${score})`,
                context.options.verbose
            );
            return result;

        } catch (error) {
            this.logError('Agent evaluation failed', error as Error);
            throw error;
        }
    }

    /**
     * Validate agent evaluation test configuration.
     *
     * Checks:
     * - Base validation (InputDefinition, ExpectedOutcomes, Configuration)
     * - Agent ID is valid
     * - At least one oracle is configured
     * - Oracle types are registered
     * - Scoring weights are valid
     *
     * @param test - Test entity to validate
     * @returns Validation result
     */
    public override async Validate(test: TestEntity): Promise<ValidationResult> {
        // Run base validation
        const baseResult = await super.Validate(test);
        if (!baseResult.valid) {
            return baseResult;
        }

        const errors = [...baseResult.errors];
        const warnings = [...baseResult.warnings];

        try {
            // Parse and validate configuration
            const config = this.parseConfig<AgentEvalConfig>(test);

            // Validate agent ID
            if (!config.agentId) {
                errors.push({
                    category: 'configuration',
                    message: 'agentId is required in Configuration',
                    field: 'Configuration.agentId',
                    suggestion: 'Specify the ID of the agent to test'
                });
            }
            // Note: We cannot validate agent existence without contextUser
            // That validation will happen at execution time

            // Validate oracles configuration exists
            if (!config.oracles || config.oracles.length === 0) {
                errors.push({
                    category: 'configuration',
                    message: 'At least one oracle is required',
                    field: 'Configuration.oracles',
                    suggestion: 'Add oracle configurations (e.g., trace-no-errors, llm-judge)'
                });
            }
            // Note: Oracle type validation requires registry from execution context
            // That validation will happen at execution time

            // Validate scoring weights
            if (config.scoringWeights) {
                const totalWeight = Object.values(config.scoringWeights).reduce(
                    (sum, w) => sum + w,
                    0
                );
                if (Math.abs(totalWeight - 1.0) > 0.01) {
                    warnings.push({
                        category: 'best-practice',
                        message: 'Scoring weights should sum to 1.0',
                        recommendation: `Current sum: ${totalWeight.toFixed(2)}`
                    });
                }
            }

            // Validate input definition
            const input = this.parseInputDefinition<AgentEvalInput>(test);
            if (!input.userMessage || input.userMessage.trim() === '') {
                errors.push({
                    category: 'input',
                    message: 'userMessage is required in InputDefinition',
                    field: 'InputDefinition.userMessage',
                    suggestion: 'Provide the user message to send to the agent'
                });
            }

        } catch (error) {
            errors.push({
                category: 'configuration',
                message: `Configuration validation failed: ${(error as Error).message}`,
                field: 'Configuration',
                suggestion: 'Fix configuration JSON structure'
            });
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Load agent entity.
     * @private
     */
    private async loadAgent(agentId: string, contextUser: UserInfo): Promise<AIAgentEntity> {
        const agent = await this._metadata.GetEntityObject<AIAgentEntity>('AI Agents', contextUser);
        await agent.Load(agentId);
        return agent;
    }

    /**
     * Execute agent and return result.
     * @private
     */
    private async executeAgent(
        agent: AIAgentEntity,
        input: AgentEvalInput,
        contextUser: UserInfo,
        test: TestEntity,
        maxExecutionTime?: number
    ): Promise<{ agentRun: AIAgentRunEntity }> {
        const runner = new AgentRunner();

        // Build conversation messages
        const conversationMessages: ChatMessage[] = [];

        // Add prior messages if provided
        if (input.conversationContext?.priorMessages) {
            for (const msg of input.conversationContext.priorMessages) {
                conversationMessages.push({
                    role: msg.role,
                    content: msg.content
                } as ChatMessage);
            }
        }

        // Add current user message
        conversationMessages.push({
            role: 'user',
            content: input.userMessage
        } as ChatMessage);

        // Build execution parameters
        const params = {
            agent: agent as any, // Will be AIAgentEntityExtended at runtime
            conversationMessages,
            contextUser,
            override: input.executionParams?.modelOverride ? {
                modelId: input.executionParams.modelOverride
            } : undefined
        };

        // Generate conversation name with [Test] prefix
        const conversationName = `[Test] ${test.Name}`;

        // Execute agent with timeout if specified
        if (maxExecutionTime) {
            const timeoutPromise = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Agent execution timeout')), maxExecutionTime)
            );

            const runResult = await Promise.race([
                runner.RunAgentInConversation(params, {
                    userMessage: input.userMessage,
                    createArtifacts: true,
                    conversationName: conversationName
                }),
                timeoutPromise
            ]);

            return { agentRun: runResult.agentResult.agentRun };
        } else {
            const runResult = await runner.RunAgentInConversation(params, {
                userMessage: input.userMessage,
                createArtifacts: true,
                conversationName: conversationName
            });

            return { agentRun: runResult.agentResult.agentRun };
        }
    }

    /**
     * Create bidirectional link between TestRun and AgentRun.
     * @private
     */
    private async linkTestRunToAgentRun(
        testRun: TestRunEntity,
        agentRun: AIAgentRunEntity
    ): Promise<void> {
        // Update AgentRun with hard FK to TestRun
        agentRun.TestRunID = testRun.ID;
        const saved = await agentRun.Save();

        if (!saved) {
            this.logError('Failed to link AgentRun to TestRun', new Error(agentRun.LatestResult?.Message));
        }
    }

    /**
     * Extract agent output from agent run.
     * @private
     */
    private extractAgentOutput(agentRun: AIAgentRunEntity): Record<string, unknown> {
        return {
            status: agentRun.Status,
            success: agentRun.Success,
            errorMessage: agentRun.ErrorMessage,
            conversationId: agentRun.ConversationID
        };
    }

    /**
     * Run configured oracles.
     * @private
     */
    private async runOracles(
        config: AgentEvalConfig,
        input: AgentEvalInput,
        expected: AgentEvalExpectedOutcomes,
        actualOutput: Record<string, unknown>,
        agentRun: AIAgentRunEntity,
        context: DriverExecutionContext
    ): Promise<OracleResult[]> {
        const oracleResults: OracleResult[] = [];

        // TODO: Temporarily skip oracle execution while oracles are being finalized
        // Remove this flag once oracles are ready (SQL schema fixes, LLM Judge prompt creation, etc.)
        const skipOracles = true;

        if (skipOracles) {
            this.log('⚠️  Oracle execution temporarily disabled', context.options.verbose);
            return oracleResults;
        }

        for (const oracleConfig of config.oracles) {
            const oracle = context.oracleRegistry.get(oracleConfig.type);
            if (!oracle) {
                this.logError(`Oracle not found: ${oracleConfig.type}`);
                continue;
            }

            try {
                const oracleInput: OracleInput = {
                    test: context.test,
                    expectedOutput: expected,
                    actualOutput,
                    targetEntity: agentRun,
                    contextUser: context.contextUser
                };

                const result = await oracle.evaluate(oracleInput, oracleConfig.config || {});
                oracleResults.push(result);

                this.log(
                    `Oracle ${oracleConfig.type}: ${result.passed ? 'PASSED' : 'FAILED'} (Score: ${result.score})`,
                    context.options.verbose
                );

            } catch (error) {
                this.logError(`Oracle ${oracleConfig.type} failed`, error as Error);
                oracleResults.push({
                    oracleType: oracleConfig.type,
                    passed: false,
                    score: 0,
                    message: `Oracle execution failed: ${(error as Error).message}`
                });
            }
        }

        return oracleResults;
    }

    /**
     * Calculate total cost from agent run.
     * @private
     */
    private calculateTotalCost(agentRun: AIAgentRunEntity): number {
        return agentRun.TotalCost || 0;
    }

    /**
     * Calculate duration in milliseconds from agent run.
     * @private
     */
    private calculateDurationMs(agentRun: AIAgentRunEntity): number {
        if (!agentRun.StartedAt || !agentRun.CompletedAt) {
            return 0;
        }
        const start = new Date(agentRun.StartedAt).getTime();
        const end = new Date(agentRun.CompletedAt).getTime();
        return end - start;
    }
}
