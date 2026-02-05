/**
 * @fileoverview Test driver for AI Agent evaluation
 * @module @memberjunction/testing-engine
 */

import { UserInfo, Metadata, EntityInfo } from '@memberjunction/core';
import { RegisterClass, SafeJSONParse } from '@memberjunction/global';
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
     * Entity name for AI Agent Runs - used for proper FK linkage in TestRun
     */
    private static readonly AI_AGENT_RUNS_ENTITY_NAME = 'MJ: AI Agent Runs';

    /**
     * Cached Entity ID for AI Agent Runs
     */
    private _aiAgentRunsEntityId: string | null = null;

    /**
     * Returns true as this driver supports cancellation via AbortSignal.
     * When timeout occurs, the AbortController signals the agent to stop execution.
     */
    public override supportsCancellation(): boolean {
        return true;
    }

    /**
     * Get the Entity ID for "MJ: AI Agent Runs" for proper FK linkage.
     * Caches the result after first lookup.
     * @private
     */
    private getAIAgentRunsEntityId(): string | null {
        if (this._aiAgentRunsEntityId === null) {
            const entityInfo = this._metadata.Entities.find(
                e => e.Name === AgentEvalDriver.AI_AGENT_RUNS_ENTITY_NAME
            );
            this._aiAgentRunsEntityId = entityInfo?.ID || null;
            if (!this._aiAgentRunsEntityId) {
                this.logError(`Could not find Entity ID for ${AgentEvalDriver.AI_AGENT_RUNS_ENTITY_NAME}`);
            }
        }
        return this._aiAgentRunsEntityId;
    }

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
        this.logToTestRun(context, 'info', 'Starting agent evaluation');

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

            this.logToTestRun(context, 'info', `Executing agent: ${agent.Name} (${turns.length} turn${turns.length > 1 ? 's' : ''})`);

            // Execute agent (single or multi-turn) with timeout/cancellation support
            const { agentRuns, turnResults, timedOut, timeoutMessage } = await this.executeAgent(
                agent,
                input,
                context.contextUser,
                context.test,
                config.maxExecutionTime,
                context.testRun,
                context
            );

            // Handle timeout case
            if (timedOut) {
                this.logToTestRun(context, 'error', timeoutMessage || 'Test execution timed out');

                // Build timeout result with partial data if available
                const result: DriverExecutionResult = {
                    targetType: 'AI Agent',
                    targetLogEntityId: this.getAIAgentRunsEntityId() || undefined,
                    targetLogId: agentRuns.length > 0 ? agentRuns[agentRuns.length - 1].ID : '',
                    status: 'Timeout',
                    score: 0,
                    oracleResults: [],
                    passedChecks: 0,
                    failedChecks: 0,
                    totalChecks: 0,
                    inputData: input,
                    expectedOutput: expected,
                    actualOutput: agentRuns.length > 0 ? this.extractAgentOutput(agentRuns[agentRuns.length - 1]) : undefined,
                    errorMessage: timeoutMessage,
                    totalCost: turnResults.reduce((sum, tr) => sum + (tr.cost || 0), 0),
                    durationMs: turnResults.reduce((sum, tr) => sum + (tr.durationMs || 0), 0),
                    totalTurns: isMultiTurn ? turns.length : undefined,
                    turnResults: isMultiTurn ? turnResults : undefined,
                    allAgentRunIds: agentRuns.length > 0 ? agentRuns.map(ar => ar.ID) : undefined
                };

                // Note: Linking already happened via onAgentRunCreated callback for completed turns
                return result;
            }

            // Note: Bidirectional linking already happened via onAgentRunCreated callback

            // Get final agent run and output
            const finalAgentRun = agentRuns[agentRuns.length - 1];
            const actualOutput = this.extractAgentOutput(finalAgentRun);

            // Run oracles
            this.logToTestRun(context, 'info', 'Running oracles for evaluation');
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
                targetLogEntityId: this.getAIAgentRunsEntityId() || undefined,
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

            this.logToTestRun(context, 'info', `Agent evaluation completed: ${status} (Score: ${score})`);
            return result;

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logToTestRun(context, 'error', `Agent evaluation failed: ${errorMessage}`);
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
     * Uses AbortController for proper cancellation support when timeout occurs.
     * @private
     */
    private async executeAgent(
        agent: AIAgentEntity,
        input: AgentEvalInput,
        contextUser: UserInfo,
        test: TestEntity,
        maxExecutionTime: number | undefined,
        testRun: TestRunEntity,
        context: DriverExecutionContext
    ): Promise<{ agentRuns: AIAgentRunEntity[], turnResults: TurnResult[], timedOut: boolean, timeoutMessage?: string }> {
        // Normalize to multi-turn format
        const turns = this.normalizeTurns(input);

        const agentRuns: AIAgentRunEntity[] = [];
        const turnResults: TurnResult[] = [];

        // Get effective timeout using priority: config JSON > entity field > default
        const config = this.parseConfig<AgentEvalConfig>(test);
        const effectiveTimeout = this.getEffectiveTimeout(test, config);

        // Create AbortController for cancellation
        const abortController = new AbortController();
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        let timedOut = false;
        let timeoutMessage: string | undefined;

        // Set up timeout to abort execution
        if (effectiveTimeout > 0) {
            timeoutId = setTimeout(() => {
                timedOut = true;
                timeoutMessage = `Test execution timed out after ${effectiveTimeout}ms`;
                this.logToTestRun(context, 'warn', timeoutMessage);
                abortController.abort();
            }, effectiveTimeout);
        }

        let conversationId: string | undefined = input.conversationContext?.conversationId;
        let previousOutputPayload: Record<string, unknown> | undefined;

        try {
            // Execute each turn sequentially
            for (let i = 0; i < turns.length; i++) {
                // Check if aborted before starting turn
                if (abortController.signal.aborted) {
                    this.logToTestRun(context, 'info', `Skipping turn ${i + 1} due to timeout/cancellation`);
                    break;
                }

                const turn = turns[i];
                const turnNumber = i + 1;

                // Determine input payload for this turn
                const inputPayload = i === 0
                    ? turn.inputPayload  // First turn: use provided payload
                    : previousOutputPayload;  // Subsequent turns: use previous output

                this.logToTestRun(context, 'info', `Executing turn ${turnNumber} of ${turns.length}`);

                // Execute single turn with cancellation token and resolved variables
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
                    cancellationToken: abortController.signal,
                    resolvedVariables: context.resolvedVariables
                });

                agentRuns.push(turnResult.agentRun);
                turnResults.push(turnResult);

                this.logToTestRun(context, 'info', `Turn ${turnNumber} completed: ${turnResult.agentRun.Status}`);

                // Update context for next turn
                conversationId = turnResult.agentRun.ConversationID ?? undefined;
                previousOutputPayload = this.extractOutputPayload(turnResult.agentRun);
            }
        } finally {
            // Clean up timeout
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
        }

        return { agentRuns, turnResults, timedOut, timeoutMessage };
    }

    /**
     * Execute a single turn in a multi-turn test.
     * Passes cancellation token to agent for proper timeout handling.
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
        cancellationToken?: AbortSignal;
        resolvedVariables?: { values: Record<string, unknown>; sources: Record<string, string> };
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

        // Build conversation name with format:
        // - Individual test (no suite): "[Test] TestName" or "[Test][tag1, tag2] TestName"
        // - Suite test: "[1] TestName" or "[1][tag1, tag2] TestName"
        const conversationName = this.buildConversationName(
            params.test.Name,
            params.testRun.Sequence,
            params.testRun.Tags,
            params.turnNumber,
            params.totalTurns
        );

        // Get Entity ID for AI Agent Runs for proper FK linkage
        const aiAgentRunsEntityId = this.getAIAgentRunsEntityId();

        // Build override from turn execution params and resolved variables
        const override = this.buildExecutionOverride(params.turn.executionParams, params.resolvedVariables);

        // Build execution parameters with cancellation token and onAgentRunCreated callback
        const runParams = {
            agent: params.agent as any,
            conversationMessages,
            contextUser: params.contextUser,
            payload: params.inputPayload,  // Pass payload from previous turn
            override,
            cancellationToken: params.cancellationToken,  // Pass cancellation token to agent
            // Callback to immediately link TestRun <-> AgentRun when AgentRun is created
            onAgentRunCreated: async (agentRunId: string) => {
                // For the first turn (or single-turn tests), link TestRun.TargetLogID to this AgentRun
                // Subsequent turns still get TestRunID set on their AgentRun (via testRunId param below)
                // but the TestRun only points to the first/primary AgentRun
                if (params.turnNumber === 1) {
                    params.testRun.TargetLogID = agentRunId;
                    if (aiAgentRunsEntityId) {
                        params.testRun.TargetLogEntityID = aiAgentRunsEntityId;
                    }
                    const saved = await params.testRun.Save();
                    if (saved) {
                        this.log(`✓ Linked TestRun ${params.testRun.ID} -> AgentRun ${agentRunId}`, true);
                    } else {
                        this.logError(`Failed to link TestRun to AgentRun: ${params.testRun.LatestResult?.Message}`);
                    }
                }
                // Note: AgentRun.TestRunID is set by BaseAgent via the testRunId param passed to RunAgentInConversation
            }
        };

        const startTime = Date.now();

        // Execute agent - cancellation is handled via AbortSignal, not Promise.race
        // Note: BaseAgent already sets AgentRun.TestRunID from the testRunId param and invokes onAgentRunCreated callback
        const runResult = await runner.RunAgentInConversation(runParams, {
            conversationId: params.conversationId,  // Continue same conversation for multi-turn
            userMessage: params.turn.userMessage,
            createArtifacts: true,
            conversationName: conversationName,
            testRunId: params.testRun.ID
        });

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
     * Parses the FinalPayload string property to get the agent's output for chaining to next turn.
     * @private
     */
    private extractOutputPayload(agentRun: AIAgentRunEntity): Record<string, unknown> {
        // Parse the FinalPayload string property (which exists on base AIAgentRunEntity)
        // SafeJSONParse returns the parsed object or an empty object if parsing fails
        const finalPayloadObject = SafeJSONParse(agentRun.FinalPayload ?? '');
        return finalPayloadObject || {};
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
     * Build execution override object from turn params and resolved variables.
     *
     * Priority (highest to lowest):
     * 1. Turn-level execution params (modelOverride, temperatureOverride, etc.)
     * 2. Resolved variables (AIConfiguration, Temperature, etc.)
     *
     * @private
     */
    private buildExecutionOverride(
        turnExecutionParams?: {
            modelOverride?: string;
            temperatureOverride?: number;
            maxTokensOverride?: number;
        },
        resolvedVariables?: { values: Record<string, unknown>; sources: Record<string, string> }
    ): Record<string, unknown> | undefined {
        const override: Record<string, unknown> = {};

        // Apply resolved variables (lower priority)
        if (resolvedVariables?.values) {
            // AIConfiguration variable maps to aiConfigurationId
            if (resolvedVariables.values['AIConfiguration']) {
                override.aiConfigurationId = resolvedVariables.values['AIConfiguration'];
            }

            // Temperature variable maps to temperature override
            if (resolvedVariables.values['Temperature'] !== undefined) {
                override.temperature = resolvedVariables.values['Temperature'];
            }

            // MaxTokens variable maps to maxTokens override
            if (resolvedVariables.values['MaxTokens'] !== undefined) {
                override.maxTokens = resolvedVariables.values['MaxTokens'];
            }
        }

        // Apply turn execution params (higher priority - overwrites variables)
        if (turnExecutionParams) {
            if (turnExecutionParams.modelOverride) {
                override.modelId = turnExecutionParams.modelOverride;
            }
            if (turnExecutionParams.temperatureOverride !== undefined) {
                override.temperature = turnExecutionParams.temperatureOverride;
            }
            if (turnExecutionParams.maxTokensOverride !== undefined) {
                override.maxTokens = turnExecutionParams.maxTokensOverride;
            }
        }

        // Return undefined if no overrides
        return Object.keys(override).length > 0 ? override : undefined;
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

    /**
     * Build conversation name with standardized format.
     *
     * Format:
     * - Individual test (no suite): "[Test] TestName" or "[Test][tag1, tag2] TestName"
     * - Suite test: "[1] TestName" or "[1][tag1, tag2] TestName"
     * - Multi-turn adds " - Turn N" suffix
     *
     * @param testName - Name of the test
     * @param sequence - Sequence number within suite (null for standalone tests)
     * @param tagsJson - JSON string array of tags (null if no tags)
     * @param turnNumber - Current turn number (1-indexed)
     * @param totalTurns - Total number of turns
     * @returns Formatted conversation name
     * @private
     */
    private buildConversationName(
        testName: string,
        sequence: number | null,
        tagsJson: string | null,
        turnNumber: number,
        totalTurns: number
    ): string {
        // Build prefix: [Test] for standalone, [sequence] for suite
        const sequencePrefix = sequence != null ? `[${sequence}]` : '[Test]';

        // Build tags suffix if tags exist
        let tagsPrefix = '';
        if (tagsJson) {
            try {
                const tags = JSON.parse(tagsJson) as string[];
                if (tags && tags.length > 0) {
                    tagsPrefix = `[${tags.join(', ')}]`;
                }
            } catch {
                // Invalid JSON, skip tags
            }
        }

        // Build base name
        const baseName = `${sequencePrefix}${tagsPrefix} ${testName}`;

        // Add turn suffix for multi-turn tests
        if (totalTurns > 1) {
            return `${baseName} - Turn ${turnNumber}`;
        }

        return baseName;
    }
}
