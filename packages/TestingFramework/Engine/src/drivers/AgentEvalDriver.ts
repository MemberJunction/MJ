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
    TurnResult,
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

    /**
     * When to evaluate with oracles in multi-turn tests
     * - "final-turn-only": Run oracles only on final turn (default)
     * - "each-turn": Run oracles after each turn
     * - "all-turns-aggregate": Evaluate all turns together at the end
     */
    evaluationStrategy?: 'final-turn-only' | 'each-turn' | 'all-turns-aggregate';
}

/**
 * Single turn in a multi-turn test
 */
export interface AgentEvalTurn {
    /**
     * User message for this turn
     */
    userMessage: string;

    /**
     * Input payload for this turn.
     * - Turn 1: Use this payload (if provided)
     * - Turn N (N>1): Automatically populated from previous turn's output
     */
    inputPayload?: Record<string, unknown>;

    /**
     * Optional: Override execution params for this specific turn
     */
    executionParams?: {
        modelOverride?: string;
        temperatureOverride?: number;
        maxTokensOverride?: number;
    };

    /**
     * Optional: Expected outcomes specific to this turn
     * (for per-turn oracle evaluation)
     */
    expectedOutcomes?: AgentEvalExpectedOutcomes;
}

/**
 * Input definition for Agent Evaluation tests.
 */
export interface AgentEvalInput {
    /**
     * Single-turn: User message to send to agent (backward compatible)
     */
    userMessage?: string;

    /**
     * Single-turn: Input payload (backward compatible)
     */
    inputPayload?: Record<string, unknown>;

    /**
     * Multi-turn: Array of turns to execute
     */
    turns?: AgentEvalTurn[];

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
     * Optional agent execution parameters (applies to all turns unless overridden)
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
     * 2. Load and execute agent via AgentRunner (single or multi-turn)
     * 3. Create bidirectional link (TestRun ↔ AgentRun(s))
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

            // Normalize input to multi-turn format
            const turns = this.normalizeTurns(input);
            const isMultiTurn = turns.length > 1;

            this.log(`Executing agent: ${agent.Name} (${turns.length} turn${turns.length > 1 ? 's' : ''})`, context.options.verbose);

            // Execute agent (single or multi-turn)
            const { agentRuns, turnResults } = await this.executeAgent(
                agent,
                input,
                context.contextUser,
                context.test,
                config.maxExecutionTime,
                context.testRun
            );

            // Create bidirectional links for all agent runs
            await this.linkTestRunToAgentRuns(context.testRun, agentRuns);

            // Get final agent run and output
            const finalAgentRun = agentRuns[agentRuns.length - 1];
            const actualOutput = this.extractAgentOutput(finalAgentRun);

            // Run oracles
            this.log('Running oracles for evaluation', context.options.verbose);
            const oracleResults = await this.runOraclesForMultiTurn(
                config,
                turns,
                turnResults,
                expected,
                context
            );

            // Calculate score and status
            // When oracles are disabled, consider test passed if final agent run succeeded
            const score = this.calculateScore(oracleResults, config.scoringWeights);
            const status = oracleResults.length === 0 && finalAgentRun.Status === 'Completed'
                ? 'Passed'
                : this.determineStatus(oracleResults);

            // Count checks
            const passedChecks = oracleResults.filter(r => r.passed).length;
            const totalChecks = oracleResults.length;

            // Calculate total cost and duration across all turns
            const totalCost = turnResults.reduce((sum, tr) => sum + (tr.cost || 0), 0);
            const durationMs = turnResults.reduce((sum, tr) => sum + (tr.durationMs || 0), 0);

            // Build result
            const result: DriverExecutionResult = {
                targetType: 'AI Agent',
                targetLogId: finalAgentRun.ID,
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
                durationMs,
                // Multi-turn specific fields
                totalTurns: isMultiTurn ? turns.length : undefined,
                turnResults: isMultiTurn ? turnResults : undefined,
                allAgentRunIds: isMultiTurn ? agentRuns.map(ar => ar.ID) : undefined
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

            // Validate either userMessage OR turns is provided
            if (!input.userMessage && (!input.turns || input.turns.length === 0)) {
                errors.push({
                    category: 'input',
                    message: 'Either userMessage or turns array is required in InputDefinition',
                    field: 'InputDefinition',
                    suggestion: 'Provide userMessage for single-turn or turns array for multi-turn tests'
                });
            }

            // Validate turns array if provided
            if (input.turns) {
                if (input.turns.length === 0) {
                    errors.push({
                        category: 'input',
                        message: 'turns array cannot be empty',
                        field: 'InputDefinition.turns',
                        suggestion: 'Provide at least one turn in the turns array'
                    });
                }

                // Validate each turn
                input.turns.forEach((turn, index) => {
                    if (!turn.userMessage || turn.userMessage.trim() === '') {
                        errors.push({
                            category: 'input',
                            message: `Turn ${index + 1}: userMessage is required`,
                            field: `InputDefinition.turns[${index}].userMessage`,
                            suggestion: 'Each turn must have a non-empty userMessage'
                        });
                    }
                });

                // Warning if inputPayload provided on non-first turns
                input.turns.forEach((turn, index) => {
                    if (index > 0 && turn.inputPayload) {
                        warnings.push({
                            category: 'best-practice',
                            message: `Turn ${index + 1}: inputPayload will be overridden by previous turn output`,
                            recommendation: 'Only the first turn should have inputPayload defined; subsequent turns automatically receive output from previous turn'
                        });
                    }
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
     * Execute agent (single or multi-turn) and return results.
     * @private
     */
    private async executeAgent(
        agent: AIAgentEntity,
        input: AgentEvalInput,
        contextUser: UserInfo,
        test: TestEntity,
        maxExecutionTime: number | undefined,
        testRun: TestRunEntity
    ): Promise<{ agentRuns: AIAgentRunEntity[], turnResults: TurnResult[] }> {
        // Normalize to multi-turn format
        const turns = this.normalizeTurns(input);

        const agentRuns: AIAgentRunEntity[] = [];
        const turnResults: TurnResult[] = [];

        let conversationId: string | undefined = input.conversationContext?.conversationId;
        let previousOutputPayload: Record<string, unknown> | undefined;

        // Execute each turn sequentially
        for (let i = 0; i < turns.length; i++) {
            const turn = turns[i];
            const turnNumber = i + 1;

            // Determine input payload for this turn
            const inputPayload = i === 0
                ? turn.inputPayload  // First turn: use provided payload
                : previousOutputPayload;  // Subsequent turns: use previous output

            // Execute single turn
            const turnResult = await this.executeSingleTurn({
                agent,
                turn,
                turnNumber,
                totalTurns: turns.length,
                conversationId,
                inputPayload,
                priorMessages: input.conversationContext?.priorMessages,
                contextUser,
                test,
                testRun,
                maxExecutionTime
            });

            agentRuns.push(turnResult.agentRun);
            turnResults.push(turnResult);

            // Update context for next turn
            conversationId = turnResult.agentRun.ConversationID;
            previousOutputPayload = this.extractOutputPayload(turnResult.agentRun);
        }

        return { agentRuns, turnResults };
    }

    /**
     * Execute a single turn in a multi-turn test.
     * @private
     */
    private async executeSingleTurn(params: {
        agent: AIAgentEntity;
        turn: AgentEvalTurn;
        turnNumber: number;
        totalTurns: number;
        conversationId?: string;
        inputPayload?: Record<string, unknown>;
        priorMessages?: Array<{ role: 'user' | 'assistant'; content: string }>;
        contextUser: UserInfo;
        test: TestEntity;
        testRun: TestRunEntity;
        maxExecutionTime?: number;
    }): Promise<TurnResult> {
        const runner = new AgentRunner();

        // Build conversation messages (only for first turn with priorMessages)
        const conversationMessages: ChatMessage[] = [];

        // Add prior messages only if this is the first turn and they're provided
        if (params.turnNumber === 1 && params.priorMessages) {
            for (const msg of params.priorMessages) {
                conversationMessages.push({
                    role: msg.role,
                    content: msg.content
                } as ChatMessage);
            }
        }

        // Add current user message
        conversationMessages.push({
            role: 'user',
            content: params.turn.userMessage
        } as ChatMessage);

        // Build conversation name
        const conversationName = params.totalTurns > 1
            ? (params.testRun.Sequence != null
                ? `[${params.testRun.Sequence}] ${params.test.Name} - Turn ${params.turnNumber}`
                : `[Test] ${params.test.Name} - Turn ${params.turnNumber}`)
            : (params.testRun.Sequence != null
                ? `[${params.testRun.Sequence}] ${params.test.Name}`
                : `[Test] ${params.test.Name}`);

        // Build execution parameters
        const runParams = {
            agent: params.agent as any,
            conversationId: params.conversationId,  // Continue same conversation for multi-turn
            conversationMessages,
            contextUser: params.contextUser,
            override: params.turn.executionParams?.modelOverride ? {
                modelId: params.turn.executionParams.modelOverride
            } : undefined
        };

        // Execute with timeout if specified
        const executePromise = runner.RunAgentInConversation(runParams, {
            userMessage: params.turn.userMessage,
            createArtifacts: true,
            conversationName: conversationName,
            testRunId: params.testRun.ID
        });

        const startTime = Date.now();
        const runResult = params.maxExecutionTime
            ? await Promise.race([
                executePromise,
                this.createTimeoutPromise(params.maxExecutionTime)
            ])
            : await executePromise;
        const endTime = Date.now();

        const agentRun = runResult.agentResult.agentRun;

        return {
            turnNumber: params.turnNumber,
            agentRun,
            inputPayload: params.inputPayload,
            outputPayload: this.extractOutputPayload(agentRun),
            durationMs: endTime - startTime,
            cost: agentRun.TotalCost || 0
        };
    }

    /**
     * Create a timeout promise that rejects after specified milliseconds.
     * @private
     */
    private createTimeoutPromise(timeoutMs: number): Promise<never> {
        return new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Agent execution timeout after ${timeoutMs}ms`)), timeoutMs)
        );
    }

    /**
     * Normalize input to multi-turn format for consistent processing.
     * @private
     */
    private normalizeTurns(input: AgentEvalInput): AgentEvalTurn[] {
        // If turns array provided, use it
        if (input.turns && input.turns.length > 0) {
            return input.turns;
        }

        // Backward compatibility: convert single message to single turn
        if (input.userMessage) {
            return [{
                userMessage: input.userMessage,
                inputPayload: input.inputPayload
            }];
        }

        throw new Error('Either userMessage or turns must be provided in InputDefinition');
    }

    /**
     * Extract output payload from agent run.
     * @private
     */
    private extractOutputPayload(agentRun: AIAgentRunEntity): Record<string, unknown> {
        // TODO: This implementation depends on where AgentRun stores output payload
        // For now, return a basic structure with agent run metadata
        return {
            agentRunId: agentRun.ID,
            status: agentRun.Status,
            success: agentRun.Success,
            conversationId: agentRun.ConversationID,
            errorMessage: agentRun.ErrorMessage
            // Add actual payload extraction logic based on AgentRun structure
            // e.g., agentRun.OutputPayload if that field exists
        };
    }

    /**
     * Create bidirectional links between TestRun and multiple AgentRuns.
     * @private
     */
    private async linkTestRunToAgentRuns(
        testRun: TestRunEntity,
        agentRuns: AIAgentRunEntity[]
    ): Promise<void> {
        // Link each AgentRun to TestRun with TurnNumber
        for (let i = 0; i < agentRuns.length; i++) {
            const agentRun = agentRuns[i];
            const turnNumber = i + 1;

            // Update AgentRun with hard FK to TestRun
            agentRun.TestRunID = testRun.ID;

            // Set turn number if field exists (check dynamically)
            if ('TurnNumber' in agentRun) {
                (agentRun as any).TurnNumber = turnNumber;
            }

            const saved = await agentRun.Save();

            if (!saved) {
                this.logError(
                    `Failed to link AgentRun (Turn ${turnNumber}) to TestRun`,
                    new Error(agentRun.LatestResult?.Message)
                );
            }
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
     * Run oracles for multi-turn evaluation.
     * @private
     */
    private async runOraclesForMultiTurn(
        config: AgentEvalConfig,
        turns: AgentEvalTurn[],
        turnResults: TurnResult[],
        expected: AgentEvalExpectedOutcomes,
        context: DriverExecutionContext
    ): Promise<OracleResult[]> {
        // TODO: Temporarily skip oracle execution while oracles are being finalized
        // Remove this flag once oracles are ready (SQL schema fixes, LLM Judge prompt creation, etc.)
        const skipOracles = true;

        if (skipOracles) {
            this.log('⚠️  Oracle execution temporarily disabled', context.options.verbose);
            return [];
        }

        const strategy = config.evaluationStrategy || 'final-turn-only';

        switch (strategy) {
            case 'final-turn-only':
                return this.runOraclesForFinalTurn(config, turns, turnResults, expected, context);

            case 'each-turn':
                return this.runOraclesForEachTurn(config, turns, turnResults, expected, context);

            case 'all-turns-aggregate':
                return this.runOraclesForAllTurns(config, turns, turnResults, expected, context);

            default:
                throw new Error(`Unknown evaluation strategy: ${strategy}`);
        }
    }

    /**
     * Run oracles only on the final turn.
     * @private
     */
    private async runOraclesForFinalTurn(
        config: AgentEvalConfig,
        turns: AgentEvalTurn[],
        turnResults: TurnResult[],
        expected: AgentEvalExpectedOutcomes,
        context: DriverExecutionContext
    ): Promise<OracleResult[]> {
        const finalTurnResult = turnResults[turnResults.length - 1];
        const finalTurn = turns[turns.length - 1];

        return this.runOraclesForSingleTurn(
            config,
            finalTurn,
            finalTurnResult,
            finalTurn.expectedOutcomes || expected,
            context
        );
    }

    /**
     * Run oracles after each turn and aggregate results.
     * @private
     */
    private async runOraclesForEachTurn(
        config: AgentEvalConfig,
        turns: AgentEvalTurn[],
        turnResults: TurnResult[],
        expected: AgentEvalExpectedOutcomes,
        context: DriverExecutionContext
    ): Promise<OracleResult[]> {
        const allResults: OracleResult[] = [];

        for (let i = 0; i < turnResults.length; i++) {
            const turn = turns[i];
            const turnResult = turnResults[i];

            const turnOracles = await this.runOraclesForSingleTurn(
                config,
                turn,
                turnResult,
                turn.expectedOutcomes || expected,
                context,
                `Turn ${i + 1}: `
            );

            allResults.push(...turnOracles);
        }

        return allResults;
    }

    /**
     * Run oracles with all turns data for holistic evaluation.
     * @private
     */
    private async runOraclesForAllTurns(
        config: AgentEvalConfig,
        turns: AgentEvalTurn[],
        turnResults: TurnResult[],
        expected: AgentEvalExpectedOutcomes,
        context: DriverExecutionContext
    ): Promise<OracleResult[]> {
        const oracleResults: OracleResult[] = [];

        for (const oracleConfig of config.oracles) {
            const oracle = context.oracleRegistry.get(oracleConfig.type);
            if (!oracle) {
                this.logError(`Oracle not found: ${oracleConfig.type}`);
                continue;
            }

            try {
                // Pass all turns data to oracle
                const oracleInput: OracleInput = {
                    test: context.test,
                    expectedOutput: expected,
                    actualOutput: {
                        turns: turnResults.map(tr => ({
                            turnNumber: tr.turnNumber,
                            inputPayload: tr.inputPayload,
                            outputPayload: tr.outputPayload,
                            agentRunId: tr.agentRun.ID
                        })),
                        finalOutput: turnResults[turnResults.length - 1].outputPayload
                    },
                    targetEntity: turnResults[turnResults.length - 1].agentRun,
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
     * Run oracles for a single turn.
     * @private
     */
    private async runOraclesForSingleTurn(
        config: AgentEvalConfig,
        turn: AgentEvalTurn,
        turnResult: TurnResult,
        expected: AgentEvalExpectedOutcomes,
        context: DriverExecutionContext,
        messagePrefix: string = ''
    ): Promise<OracleResult[]> {
        const oracleResults: OracleResult[] = [];

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
                    actualOutput: turnResult.outputPayload,
                    targetEntity: turnResult.agentRun,
                    contextUser: context.contextUser
                };

                const result = await oracle.evaluate(oracleInput, oracleConfig.config || {});

                // Add message prefix if provided (for per-turn evaluation)
                if (messagePrefix) {
                    result.message = messagePrefix + result.message;
                }

                oracleResults.push(result);

                this.log(
                    `${messagePrefix}Oracle ${oracleConfig.type}: ${result.passed ? 'PASSED' : 'FAILED'} (Score: ${result.score})`,
                    context.options.verbose
                );

            } catch (error) {
                this.logError(`${messagePrefix}Oracle ${oracleConfig.type} failed`, error as Error);
                oracleResults.push({
                    oracleType: oracleConfig.type,
                    passed: false,
                    score: 0,
                    message: `${messagePrefix}Oracle execution failed: ${(error as Error).message}`
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
