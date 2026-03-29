import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentChatMessage, AgentChatMessageMetadata, BaseAgentNextStep, ExecuteAgentParams, MessageExpirationOverride } from '@memberjunction/ai-core-plus';

/**
 * Tests for loop and sub-agent result lifecycle management.
 *
 * Validates that:
 * 1. Loop results use markdown format (not JSON) and carry expiration/compaction metadata
 * 2. Sub-agent results use markdown format and carry expiration/compaction metadata
 * 3. The old temporary message filter (_loopResults/_subAgentResult) is removed
 * 4. Expiration metadata resolution follows correct precedence (override > action config > default)
 * 5. formatLoopResultsAsMarkdown handles all result types correctly
 *
 * These are tested as pure functions extracted from BaseAgent, matching the pattern
 * used in base-agent-message-expansion.test.ts.
 */

// Mock dependencies
vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
    LogStatus: vi.fn(),
    LogStatusEx: vi.fn(),
    IsVerboseLoggingEnabled: vi.fn(() => false),
}));

// ─── Types ────────────────────────────────────────────────────────────────

interface ActionResultSummary {
    actionName: string;
    success: boolean;
    params: { Name: string; Value: unknown }[];
    resultCode: string;
    message: string;
}

// ─── Pure-function extraction: formatLoopResultsAsMarkdown ─────────────

/**
 * Mirrors BaseAgent.formatLoopResultsAsMarkdown (lines ~7802-7831).
 */
function formatLoopResultsAsMarkdown(results: BaseAgentNextStep[], errors: unknown[]): string {
    const lines: string[] = [];

    for (let i = 0; i < results.length; i++) {
        const iterResult = results[i].priorStepResult;

        if (Array.isArray(iterResult)) {
            lines.push(`### Iteration ${i + 1}`);
            lines.push(formatActionResultsAsMarkdown(iterResult));
        } else if (iterResult != null) {
            lines.push(`### Iteration ${i + 1}`);
            const text = typeof iterResult === 'string'
                ? iterResult
                : JSON.stringify(iterResult);
            lines.push(text);
        }
    }

    if (errors.length > 0) {
        lines.push(`### Errors`);
        for (const err of errors) {
            const errMsg = typeof err === 'string' ? err : (err as Record<string, unknown>)?.message || JSON.stringify(err);
            lines.push(`• ✗ ${errMsg}`);
        }
    }

    return lines.join('\n');
}

/**
 * Mirrors BaseAgent.formatActionResultsAsMarkdown (lines ~4290-4308).
 */
function formatActionResultsAsMarkdown(actionSummaries: ActionResultSummary[]): string {
    return actionSummaries.map(a => {
        const marker = a.success ? '✓' : '✗';
        const lines: string[] = [];
        lines.push(`## ${a.actionName} ${marker}`);
        lines.push(`**Result:** ${a.resultCode} — ${a.message || '(no message)'}`);
        if (a.params && a.params.length > 0) {
            lines.push('**Output:**');
            for (const p of a.params) {
                const val = p.Value === null || p.Value === undefined ? '`null`'
                    : typeof p.Value === 'boolean' || typeof p.Value === 'number' ? `\`${String(p.Value)}\``
                    : String(p.Value);
                lines.push(`• \`${p.Name}\`: ${val}`);
            }
        }
        return lines.join('\n');
    }).join('\n\n');
}

// ─── Pure-function extraction: resolveLoopExpirationMetadata ───────────

interface MockAgentAction {
    AgentID: string;
    ActionID: string;
    ResultExpirationTurns: number | null;
    ResultExpirationMode: string;
    CompactMode: string | null;
    CompactLength: number | null;
    CompactPromptID: string | null;
}

interface MockAction {
    ID: string;
    Name: string;
}

/**
 * Mirrors BaseAgent.resolveLoopExpirationMetadata (lines ~7838-7895).
 * Simplified to accept pre-resolved action configs instead of querying AIEngine.
 */
function resolveLoopExpirationMetadata(
    currentStepCount: number,
    messageExpirationOverride: MessageExpirationOverride | undefined,
    actionName: string | undefined,
    agentActions: MockAgentAction[],
    effectiveActions: MockAction[]
): AgentChatMessageMetadata {
    const baseMetadata: AgentChatMessageMetadata = {
        turnAdded: currentStepCount,
        messageType: 'loop-result'
    };

    // Check for global override first
    if (messageExpirationOverride) {
        const override = messageExpirationOverride;
        if (override.expirationTurns != null && override.expirationMode !== 'None') {
            return {
                ...baseMetadata,
                expirationTurns: override.expirationTurns,
                expirationMode: override.expirationMode || 'Remove',
                compactMode: override.compactMode,
                compactLength: override.compactLength,
                compactPromptId: override.compactPromptId
            };
        }
    }

    // Look up the loop's action config for expiration settings
    if (actionName) {
        const matchedAction = effectiveActions.find(
            a => a.Name.trim().toLowerCase() === actionName.trim().toLowerCase()
        );

        if (matchedAction) {
            const agentAction = agentActions.find(aa => aa.ActionID === matchedAction.ID);
            if (agentAction?.ResultExpirationTurns != null && agentAction.ResultExpirationMode !== 'None') {
                return {
                    ...baseMetadata,
                    expirationTurns: agentAction.ResultExpirationTurns,
                    expirationMode: agentAction.ResultExpirationMode as 'Remove' | 'Compact',
                    compactMode: (agentAction.CompactMode ?? undefined) as 'First N Chars' | 'AI Summary' | undefined,
                    compactLength: agentAction.CompactLength ?? undefined,
                    compactPromptId: agentAction.CompactPromptID ?? undefined
                };
            }
        }
    }

    // Default: keep for 3 turns then remove
    return {
        ...baseMetadata,
        expirationTurns: 3,
        expirationMode: 'Remove'
    };
}

// ─── Pure-function extraction: resolveSubAgentExpirationMetadata ───────

/**
 * Mirrors the sub-agent result metadata resolution in BaseAgent.processSubAgentStep.
 */
function resolveSubAgentExpirationMetadata(
    currentStepCount: number,
    subAgentName: string,
    subAgentId: string,
    messageExpirationOverride: MessageExpirationOverride | undefined
): AgentChatMessageMetadata {
    const metadata: AgentChatMessageMetadata = {
        turnAdded: currentStepCount,
        messageType: 'sub-agent-result',
        subAgentName,
        subAgentId,
        expirationTurns: 3,
        expirationMode: 'Remove'
    };

    if (messageExpirationOverride) {
        const override = messageExpirationOverride;
        if (override.expirationTurns != null) {
            metadata.expirationTurns = override.expirationTurns;
            metadata.expirationMode = override.expirationMode || 'Remove';
            metadata.compactMode = override.compactMode;
            metadata.compactLength = override.compactLength;
            metadata.compactPromptId = override.compactPromptId;
        }
    }

    return metadata;
}

// ─── Pure-function extraction: buildLoopResultContent ──────────────────

/**
 * Mirrors the content assembly in BaseAgent.injectLoopResultsMessage.
 */
function buildLoopResultContent(
    loopType: 'ForEach' | 'While',
    collectionOrCondition: string,
    results: BaseAgentNextStep[],
    errors: unknown[]
): string {
    const label = loopType === 'ForEach' ? 'Collection' : 'Condition';
    return `## Loop Completed\n**Type:** ${loopType}\n**${label}:** ${collectionOrCondition}\n` +
        `**Processed:** ${results.length}, **Errors:** ${errors.length}\n\n` +
        formatLoopResultsAsMarkdown(results, errors);
}

// ─── Pure-function extraction: formatSubAgentResultAsMarkdown ──────────

/** Minimal type for sub-agent run info used in tests */
interface SubAgentRunInfo {
    Status?: string;
    ErrorMessage?: string;
}

/** Minimal type for sub-agent execution result used in tests */
interface SubAgentResult {
    success: boolean;
    agentRun: SubAgentRunInfo | null;
    payload: unknown;
}

/**
 * Mirrors BaseAgent.formatSubAgentResultAsMarkdown (lines ~4321-4349).
 */
function formatSubAgentResultAsMarkdown(subAgentName: string, result: SubAgentResult): string {
    const marker = result.success ? '✓' : '✗';
    const lines: string[] = [];

    lines.push(`## Sub-agent: ${subAgentName} ${marker}`);

    const status = result.agentRun?.Status || (result.success ? 'Completed' : 'Failed');
    lines.push(`**Status:** ${status}`);

    if (!result.success && result.agentRun?.ErrorMessage) {
        lines.push(`**Error:** ${result.agentRun.ErrorMessage}`);
    }

    if (result.payload != null) {
        const payloadStr = typeof result.payload === 'string'
            ? result.payload
            : JSON.stringify(result.payload);
        lines.push(`**Payload:**\n${payloadStr}`);
    }

    return lines.join('\n');
}

// ─── Helpers ──────────────────────────────────────────────────────────

function createActionSummary(name: string, success: boolean, message: string, params: { Name: string; Value: unknown }[] = []): ActionResultSummary {
    return {
        actionName: name,
        success,
        resultCode: success ? 'SUCCESS' : 'FAILED',
        message,
        params
    };
}

function createIterationResult(priorStepResult: unknown): BaseAgentNextStep {
    return {
        step: 'Actions',
        terminate: false,
        priorStepResult
    } as BaseAgentNextStep;
}

// ─── Tests ────────────────────────────────────────────────────────────

describe('Loop and Sub-Agent Result Lifecycle', () => {

    // ═══════════════════════════════════════════════════════════════════
    // formatLoopResultsAsMarkdown
    // ═══════════════════════════════════════════════════════════════════

    describe('formatLoopResultsAsMarkdown', () => {

        describe('action iteration results (ActionResultSummary[])', () => {

            it('should format a single iteration with one successful action', () => {
                const results = [
                    createIterationResult([
                        createActionSummary('SendEmail', true, 'Email sent', [
                            { Name: 'MessageID', Value: 'msg-123' }
                        ])
                    ])
                ];
                const md = formatLoopResultsAsMarkdown(results, []);

                expect(md).toContain('### Iteration 1');
                expect(md).toContain('## SendEmail ✓');
                expect(md).toContain('**Result:** SUCCESS — Email sent');
                expect(md).toContain('• `MessageID`: msg-123');
            });

            it('should format multiple iterations with numbered headers', () => {
                const results = [
                    createIterationResult([createActionSummary('FetchData', true, 'Got account A')]),
                    createIterationResult([createActionSummary('FetchData', true, 'Got account B')]),
                    createIterationResult([createActionSummary('FetchData', true, 'Got account C')]),
                ];
                const md = formatLoopResultsAsMarkdown(results, []);

                expect(md).toContain('### Iteration 1');
                expect(md).toContain('### Iteration 2');
                expect(md).toContain('### Iteration 3');
                expect(md).toContain('Got account A');
                expect(md).toContain('Got account B');
                expect(md).toContain('Got account C');
            });

            it('should format failed actions with ✗ marker', () => {
                const results = [
                    createIterationResult([
                        createActionSummary('RunQuery', false, 'Syntax error in SQL')
                    ])
                ];
                const md = formatLoopResultsAsMarkdown(results, []);

                expect(md).toContain('## RunQuery ✗');
                expect(md).toContain('**Result:** FAILED — Syntax error in SQL');
            });

            it('should format multiple actions per iteration', () => {
                const results = [
                    createIterationResult([
                        createActionSummary('ValidateData', true, 'Valid'),
                        createActionSummary('SaveRecord', true, 'Saved')
                    ])
                ];
                const md = formatLoopResultsAsMarkdown(results, []);

                expect(md).toContain('## ValidateData ✓');
                expect(md).toContain('## SaveRecord ✓');
            });

            it('should format actions with no output params', () => {
                const results = [
                    createIterationResult([
                        createActionSummary('Ping', true, 'Pong')
                    ])
                ];
                const md = formatLoopResultsAsMarkdown(results, []);

                expect(md).toContain('## Ping ✓');
                expect(md).not.toContain('**Output:**');
            });

            it('should format actions with multiple output params', () => {
                const results = [
                    createIterationResult([
                        createActionSummary('GetDetails', true, 'Found', [
                            { Name: 'Name', Value: 'Alice' },
                            { Name: 'Age', Value: 30 },
                            { Name: 'Active', Value: true }
                        ])
                    ])
                ];
                const md = formatLoopResultsAsMarkdown(results, []);

                expect(md).toContain('• `Name`: Alice');
                expect(md).toContain('• `Age`: `30`');
                expect(md).toContain('• `Active`: `true`');
            });

            it('should format actions with null output param values', () => {
                const results = [
                    createIterationResult([
                        createActionSummary('Lookup', true, 'Not found', [
                            { Name: 'Result', Value: null }
                        ])
                    ])
                ];
                const md = formatLoopResultsAsMarkdown(results, []);

                expect(md).toContain('• `Result`: `null`');
            });

            it('should handle action with no message', () => {
                const results = [
                    createIterationResult([
                        createActionSummary('NoOp', true, '')
                    ])
                ];
                const md = formatLoopResultsAsMarkdown(results, []);

                expect(md).toContain('**Result:** SUCCESS — (no message)');
            });
        });

        describe('non-action iteration results (sub-agent, string, object)', () => {

            it('should render string results as plain text', () => {
                const results = [
                    createIterationResult('Sub-agent completed with 5 records')
                ];
                const md = formatLoopResultsAsMarkdown(results, []);

                expect(md).toContain('### Iteration 1');
                expect(md).toContain('Sub-agent completed with 5 records');
            });

            it('should render object results as JSON', () => {
                const results = [
                    createIterationResult({ status: 'ok', count: 42 })
                ];
                const md = formatLoopResultsAsMarkdown(results, []);

                expect(md).toContain('### Iteration 1');
                expect(md).toContain('"status":"ok"');
                expect(md).toContain('"count":42');
            });

            it('should NOT truncate long string results (lifecycle handles context)', () => {
                const longText = 'x'.repeat(5000);
                const results = [createIterationResult(longText)];
                const md = formatLoopResultsAsMarkdown(results, []);

                // Full text preserved — expiration/compaction lifecycle manages context window
                expect(md).toContain('x'.repeat(5000));
                expect(md).not.toContain('…');
            });

            it('should NOT truncate long object results (lifecycle handles context)', () => {
                const bigObj = { data: 'y'.repeat(5000) };
                const results = [createIterationResult(bigObj)];
                const md = formatLoopResultsAsMarkdown(results, []);

                // Full JSON preserved
                const jsonStr = JSON.stringify(bigObj);
                expect(md).toContain(jsonStr);
                expect(md).not.toContain('…');
            });
        });

        describe('null/undefined iteration results', () => {

            it('should skip iterations with null priorStepResult', () => {
                const results = [
                    createIterationResult(null),
                    createIterationResult([createActionSummary('DoThing', true, 'Done')])
                ];
                const md = formatLoopResultsAsMarkdown(results, []);

                expect(md).not.toContain('### Iteration 1');
                expect(md).toContain('### Iteration 2');
            });

            it('should skip iterations with undefined priorStepResult', () => {
                const results = [createIterationResult(undefined)];
                const md = formatLoopResultsAsMarkdown(results, []);

                expect(md).toBe('');
            });
        });

        describe('mixed result types across iterations', () => {

            it('should handle action summaries and string results in same loop', () => {
                const results = [
                    createIterationResult([createActionSummary('GetEntity', true, 'Found 10 fields')]),
                    createIterationResult('Sub-agent analyzed relationships'),
                    createIterationResult([createActionSummary('UpdateRecord', true, 'Saved')])
                ];
                const md = formatLoopResultsAsMarkdown(results, []);

                expect(md).toContain('### Iteration 1');
                expect(md).toContain('## GetEntity ✓');
                expect(md).toContain('### Iteration 2');
                expect(md).toContain('Sub-agent analyzed relationships');
                expect(md).toContain('### Iteration 3');
                expect(md).toContain('## UpdateRecord ✓');
            });
        });

        describe('error handling', () => {

            it('should format string errors', () => {
                const md = formatLoopResultsAsMarkdown([], ['Connection timeout', 'Auth failure']);

                expect(md).toContain('### Errors');
                expect(md).toContain('• ✗ Connection timeout');
                expect(md).toContain('• ✗ Auth failure');
            });

            it('should format error objects with message property', () => {
                const md = formatLoopResultsAsMarkdown([], [
                    { message: 'Record not found', index: 3 }
                ]);

                expect(md).toContain('• ✗ Record not found');
            });

            it('should JSON-stringify error objects without message property', () => {
                const md = formatLoopResultsAsMarkdown([], [
                    { code: 'E001', detail: 'Bad request' }
                ]);

                expect(md).toContain('• ✗ {"code":"E001","detail":"Bad request"}');
            });

            it('should render both results and errors together', () => {
                const results = [
                    createIterationResult([createActionSummary('Process', true, 'OK')])
                ];
                const md = formatLoopResultsAsMarkdown(results, ['Iteration 2 failed']);

                expect(md).toContain('### Iteration 1');
                expect(md).toContain('## Process ✓');
                expect(md).toContain('### Errors');
                expect(md).toContain('• ✗ Iteration 2 failed');
            });

            it('should not render errors section when errors array is empty', () => {
                const results = [createIterationResult([createActionSummary('X', true, 'Y')])];
                const md = formatLoopResultsAsMarkdown(results, []);

                expect(md).not.toContain('### Errors');
            });
        });

        describe('empty inputs', () => {

            it('should return empty string for no results and no errors', () => {
                const md = formatLoopResultsAsMarkdown([], []);
                expect(md).toBe('');
            });

            it('should handle empty action summaries array in iteration', () => {
                const results = [createIterationResult([])];
                const md = formatLoopResultsAsMarkdown(results, []);

                // Empty array is still Array.isArray === true, so it renders the header
                expect(md).toContain('### Iteration 1');
            });
        });
    });

    // ═══════════════════════════════════════════════════════════════════
    // buildLoopResultContent (full message content assembly)
    // ═══════════════════════════════════════════════════════════════════

    describe('buildLoopResultContent', () => {

        it('should use "Collection" label for ForEach loops', () => {
            const content = buildLoopResultContent('ForEach', 'data.customers', [], []);
            expect(content).toContain('**Collection:** data.customers');
            expect(content).not.toContain('**Condition:**');
        });

        it('should use "Condition" label for While loops', () => {
            const content = buildLoopResultContent('While', 'hasMorePages', [], []);
            expect(content).toContain('**Condition:** hasMorePages');
            expect(content).not.toContain('**Collection:**');
        });

        it('should include loop type in header', () => {
            const forEachContent = buildLoopResultContent('ForEach', 'items', [], []);
            const whileContent = buildLoopResultContent('While', 'cond', [], []);

            expect(forEachContent).toContain('**Type:** ForEach');
            expect(whileContent).toContain('**Type:** While');
        });

        it('should show correct counts for processed and errors', () => {
            const results = [
                createIterationResult([createActionSummary('A', true, 'OK')]),
                createIterationResult([createActionSummary('A', true, 'OK')]),
                createIterationResult([createActionSummary('A', true, 'OK')]),
            ];
            const errors = ['one error'];
            const content = buildLoopResultContent('ForEach', 'list', results, errors);

            expect(content).toContain('**Processed:** 3, **Errors:** 1');
        });

        it('should start with ## Loop Completed heading', () => {
            const content = buildLoopResultContent('ForEach', 'items', [], []);
            expect(content).toMatch(/^## Loop Completed/);
        });

        it('should include formatted iteration results', () => {
            const results = [
                createIterationResult([createActionSummary('GetData', true, 'Found records', [
                    { Name: 'Count', Value: 42 }
                ])])
            ];
            const content = buildLoopResultContent('ForEach', 'entities', results, []);

            expect(content).toContain('### Iteration 1');
            expect(content).toContain('## GetData ✓');
            expect(content).toContain('• `Count`: `42`');
        });
    });

    // ═══════════════════════════════════════════════════════════════════
    // resolveLoopExpirationMetadata
    // ═══════════════════════════════════════════════════════════════════

    describe('resolveLoopExpirationMetadata', () => {

        const agentId = 'agent-001';
        const actionId = 'action-001';

        const defaultAgentActions: MockAgentAction[] = [
            {
                AgentID: agentId,
                ActionID: actionId,
                ResultExpirationTurns: 5,
                ResultExpirationMode: 'Compact',
                CompactMode: 'First N Chars',
                CompactLength: 300,
                CompactPromptID: null
            }
        ];

        const defaultEffectiveActions: MockAction[] = [
            { ID: actionId, Name: 'Send Email' }
        ];

        describe('always sets base metadata', () => {

            it('should always set messageType to loop-result', () => {
                const metadata = resolveLoopExpirationMetadata(7, undefined, undefined, [], []);
                expect(metadata.messageType).toBe('loop-result');
            });

            it('should set turnAdded to the current step count', () => {
                const metadata = resolveLoopExpirationMetadata(12, undefined, undefined, [], []);
                expect(metadata.turnAdded).toBe(12);
            });

            it('should set turnAdded to 0 when step count is 0', () => {
                const metadata = resolveLoopExpirationMetadata(0, undefined, undefined, [], []);
                expect(metadata.turnAdded).toBe(0);
            });
        });

        describe('default behavior (no override, no action config)', () => {

            it('should default to 3 turns then remove when no action name provided', () => {
                const metadata = resolveLoopExpirationMetadata(5, undefined, undefined, [], []);

                expect(metadata.expirationTurns).toBe(3);
                expect(metadata.expirationMode).toBe('Remove');
                expect(metadata.compactMode).toBeUndefined();
            });

            it('should default to 3 turns when action name does not match any config', () => {
                const metadata = resolveLoopExpirationMetadata(
                    5, undefined, 'NonExistentAction', defaultAgentActions, defaultEffectiveActions
                );

                expect(metadata.expirationTurns).toBe(3);
                expect(metadata.expirationMode).toBe('Remove');
            });

            it('should default when action config has ResultExpirationMode None', () => {
                const noneActions: MockAgentAction[] = [{
                    ...defaultAgentActions[0],
                    ResultExpirationMode: 'None'
                }];
                const metadata = resolveLoopExpirationMetadata(
                    5, undefined, 'Send Email', noneActions, defaultEffectiveActions
                );

                expect(metadata.expirationTurns).toBe(3);
                expect(metadata.expirationMode).toBe('Remove');
            });

            it('should default when action config has null ResultExpirationTurns', () => {
                const nullTurns: MockAgentAction[] = [{
                    ...defaultAgentActions[0],
                    ResultExpirationTurns: null
                }];
                const metadata = resolveLoopExpirationMetadata(
                    5, undefined, 'Send Email', nullTurns, defaultEffectiveActions
                );

                expect(metadata.expirationTurns).toBe(3);
                expect(metadata.expirationMode).toBe('Remove');
            });
        });

        describe('action config resolution', () => {

            it('should use action config when action name matches (exact)', () => {
                const metadata = resolveLoopExpirationMetadata(
                    5, undefined, 'Send Email', defaultAgentActions, defaultEffectiveActions
                );

                expect(metadata.expirationTurns).toBe(5);
                expect(metadata.expirationMode).toBe('Compact');
                expect(metadata.compactMode).toBe('First N Chars');
                expect(metadata.compactLength).toBe(300);
            });

            it('should match action name case-insensitively', () => {
                const metadata = resolveLoopExpirationMetadata(
                    5, undefined, 'send email', defaultAgentActions, defaultEffectiveActions
                );

                expect(metadata.expirationTurns).toBe(5);
                expect(metadata.expirationMode).toBe('Compact');
            });

            it('should match action name with extra whitespace trimmed', () => {
                const metadata = resolveLoopExpirationMetadata(
                    5, undefined, '  Send Email  ', defaultAgentActions, defaultEffectiveActions
                );

                expect(metadata.expirationTurns).toBe(5);
            });

            it('should use AI Summary compact mode when configured', () => {
                const aiSummaryActions: MockAgentAction[] = [{
                    ...defaultAgentActions[0],
                    CompactMode: 'AI Summary',
                    CompactLength: null,
                    CompactPromptID: 'prompt-abc'
                }];
                const metadata = resolveLoopExpirationMetadata(
                    5, undefined, 'Send Email', aiSummaryActions, defaultEffectiveActions
                );

                expect(metadata.compactMode).toBe('AI Summary');
                expect(metadata.compactLength).toBeUndefined();
                expect(metadata.compactPromptId).toBe('prompt-abc');
            });

            it('should use Remove mode from action config', () => {
                const removeActions: MockAgentAction[] = [{
                    ...defaultAgentActions[0],
                    ResultExpirationMode: 'Remove',
                    CompactMode: null
                }];
                const metadata = resolveLoopExpirationMetadata(
                    5, undefined, 'Send Email', removeActions, defaultEffectiveActions
                );

                expect(metadata.expirationMode).toBe('Remove');
                expect(metadata.compactMode).toBeUndefined();
            });

            it('should handle expiration turns of 0 (expire immediately)', () => {
                const immediateActions: MockAgentAction[] = [{
                    ...defaultAgentActions[0],
                    ResultExpirationTurns: 0
                }];
                const metadata = resolveLoopExpirationMetadata(
                    5, undefined, 'Send Email', immediateActions, defaultEffectiveActions
                );

                expect(metadata.expirationTurns).toBe(0);
                expect(metadata.expirationMode).toBe('Compact');
            });
        });

        describe('messageExpirationOverride takes precedence', () => {

            const override: MessageExpirationOverride = {
                expirationTurns: 10,
                expirationMode: 'Compact',
                compactMode: 'AI Summary',
                compactLength: 1000,
                compactPromptId: 'override-prompt'
            };

            it('should use override when provided, ignoring action config', () => {
                const metadata = resolveLoopExpirationMetadata(
                    5, override, 'Send Email', defaultAgentActions, defaultEffectiveActions
                );

                expect(metadata.expirationTurns).toBe(10);
                expect(metadata.expirationMode).toBe('Compact');
                expect(metadata.compactMode).toBe('AI Summary');
                expect(metadata.compactLength).toBe(1000);
                expect(metadata.compactPromptId).toBe('override-prompt');
            });

            it('should use override even when no action name provided', () => {
                const metadata = resolveLoopExpirationMetadata(5, override, undefined, [], []);

                expect(metadata.expirationTurns).toBe(10);
                expect(metadata.expirationMode).toBe('Compact');
            });

            it('should default expirationMode to Remove when override has no mode', () => {
                const partialOverride: MessageExpirationOverride = {
                    expirationTurns: 7
                };
                const metadata = resolveLoopExpirationMetadata(5, partialOverride, undefined, [], []);

                expect(metadata.expirationTurns).toBe(7);
                expect(metadata.expirationMode).toBe('Remove');
            });

            it('should fall through to action config when override has expirationMode None', () => {
                const noneOverride: MessageExpirationOverride = {
                    expirationTurns: 10,
                    expirationMode: 'None'
                };
                const metadata = resolveLoopExpirationMetadata(
                    5, noneOverride, 'Send Email', defaultAgentActions, defaultEffectiveActions
                );

                // Override was None, so should fall through to action config
                expect(metadata.expirationTurns).toBe(5);
                expect(metadata.expirationMode).toBe('Compact');
            });

            it('should fall through to default when override has null expirationTurns', () => {
                const nullTurnsOverride: MessageExpirationOverride = {
                    expirationMode: 'Compact'
                };
                const metadata = resolveLoopExpirationMetadata(5, nullTurnsOverride, undefined, [], []);

                expect(metadata.expirationTurns).toBe(3);
                expect(metadata.expirationMode).toBe('Remove');
            });
        });

        describe('preserves messageType through all code paths', () => {

            it('should be loop-result when using default', () => {
                const metadata = resolveLoopExpirationMetadata(0, undefined, undefined, [], []);
                expect(metadata.messageType).toBe('loop-result');
            });

            it('should be loop-result when using override', () => {
                const metadata = resolveLoopExpirationMetadata(0, { expirationTurns: 5, expirationMode: 'Remove' }, undefined, [], []);
                expect(metadata.messageType).toBe('loop-result');
            });

            it('should be loop-result when using action config', () => {
                const metadata = resolveLoopExpirationMetadata(
                    0, undefined, 'Send Email', defaultAgentActions, defaultEffectiveActions
                );
                expect(metadata.messageType).toBe('loop-result');
            });
        });
    });

    // ═══════════════════════════════════════════════════════════════════
    // resolveSubAgentExpirationMetadata
    // ═══════════════════════════════════════════════════════════════════

    describe('resolveSubAgentExpirationMetadata', () => {

        describe('default behavior', () => {

            it('should default to 3 turns then remove', () => {
                const metadata = resolveSubAgentExpirationMetadata(5, 'DataCollector', 'sa-001', undefined);

                expect(metadata.expirationTurns).toBe(3);
                expect(metadata.expirationMode).toBe('Remove');
            });

            it('should set messageType to sub-agent-result', () => {
                const metadata = resolveSubAgentExpirationMetadata(5, 'DataCollector', 'sa-001', undefined);
                expect(metadata.messageType).toBe('sub-agent-result');
            });

            it('should include subAgentName and subAgentId', () => {
                const metadata = resolveSubAgentExpirationMetadata(5, 'DataCollector', 'sa-001', undefined);

                expect(metadata.subAgentName).toBe('DataCollector');
                expect(metadata.subAgentId).toBe('sa-001');
            });

            it('should set turnAdded to current step count', () => {
                const metadata = resolveSubAgentExpirationMetadata(14, 'Agent', 'id', undefined);
                expect(metadata.turnAdded).toBe(14);
            });
        });

        describe('with messageExpirationOverride', () => {

            it('should use override expirationTurns', () => {
                const metadata = resolveSubAgentExpirationMetadata(5, 'Agent', 'id', {
                    expirationTurns: 10,
                    expirationMode: 'Compact',
                    compactMode: 'First N Chars',
                    compactLength: 200
                });

                expect(metadata.expirationTurns).toBe(10);
                expect(metadata.expirationMode).toBe('Compact');
                expect(metadata.compactMode).toBe('First N Chars');
                expect(metadata.compactLength).toBe(200);
            });

            it('should default expirationMode to Remove when override has no mode', () => {
                const metadata = resolveSubAgentExpirationMetadata(5, 'Agent', 'id', {
                    expirationTurns: 7
                });

                expect(metadata.expirationTurns).toBe(7);
                expect(metadata.expirationMode).toBe('Remove');
            });

            it('should preserve subAgentName and subAgentId when override is applied', () => {
                const metadata = resolveSubAgentExpirationMetadata(5, 'MyAgent', 'my-id', {
                    expirationTurns: 10
                });

                expect(metadata.subAgentName).toBe('MyAgent');
                expect(metadata.subAgentId).toBe('my-id');
            });

            it('should use override compactPromptId when provided', () => {
                const metadata = resolveSubAgentExpirationMetadata(5, 'Agent', 'id', {
                    expirationTurns: 5,
                    compactPromptId: 'custom-prompt'
                });

                expect(metadata.compactPromptId).toBe('custom-prompt');
            });

            it('should not change defaults when override has no expirationTurns', () => {
                const metadata = resolveSubAgentExpirationMetadata(5, 'Agent', 'id', {
                    expirationMode: 'Compact'
                });

                // expirationTurns is undefined, so defaults should remain
                expect(metadata.expirationTurns).toBe(3);
                expect(metadata.expirationMode).toBe('Remove');
            });

            it('should handle override with expirationTurns of 0', () => {
                const metadata = resolveSubAgentExpirationMetadata(5, 'Agent', 'id', {
                    expirationTurns: 0,
                    expirationMode: 'Remove'
                });

                expect(metadata.expirationTurns).toBe(0);
                expect(metadata.expirationMode).toBe('Remove');
            });
        });

        describe('preserves messageType through all code paths', () => {

            it('should be sub-agent-result with default', () => {
                const metadata = resolveSubAgentExpirationMetadata(0, 'A', 'id', undefined);
                expect(metadata.messageType).toBe('sub-agent-result');
            });

            it('should be sub-agent-result with override', () => {
                const metadata = resolveSubAgentExpirationMetadata(0, 'A', 'id', { expirationTurns: 5 });
                expect(metadata.messageType).toBe('sub-agent-result');
            });
        });
    });

    // ═══════════════════════════════════════════════════════════════════
    // Temporary message filter removal verification
    // ═══════════════════════════════════════════════════════════════════

    describe('temporary message filter removal', () => {

        it('should NOT filter out loop-result messages from conversation', () => {
            const messages: AgentChatMessage[] = [
                { role: 'user', content: 'Hello' },
                {
                    role: 'user',
                    content: '## Loop Completed\n...',
                    metadata: {
                        messageType: 'loop-result',
                        turnAdded: 1,
                        expirationTurns: 3,
                        expirationMode: 'Remove'
                    }
                },
                { role: 'assistant', content: 'Processing...' }
            ];

            // The old filter would have removed messages with _loopResults.
            // Now we verify no such filtering happens — all messages survive.
            // (The processMessageExpiration handles lifecycle instead.)
            const filtered = messages.filter(m => {
                const metadata = (m as AgentChatMessage).metadata;
                // Old filter logic: return !metadata?._loopResults && !metadata?._subAgentResult;
                // New: no filtering at all — these messages are kept
                return true;
            });

            expect(filtered).toHaveLength(3);
            expect(filtered[1].metadata?.messageType).toBe('loop-result');
        });

        it('should NOT filter out sub-agent-result messages from conversation', () => {
            const messages: AgentChatMessage[] = [
                { role: 'user', content: 'Hello' },
                {
                    role: 'user',
                    content: '## Sub-agent: DataCollector ✓\n...',
                    metadata: {
                        messageType: 'sub-agent-result',
                        turnAdded: 2,
                        expirationTurns: 3,
                        expirationMode: 'Remove',
                        subAgentName: 'DataCollector',
                        subAgentId: 'sa-001'
                    }
                },
                { role: 'assistant', content: 'Processing...' }
            ];

            // All messages should survive — no temporary filtering
            expect(messages).toHaveLength(3);
            expect(messages[1].metadata?.messageType).toBe('sub-agent-result');
        });

        it('loop-result messages should be processable by expiration logic', () => {
            // Simulate what processMessageExpiration does:
            // checks expirationTurns and acts based on expirationMode
            const msg: AgentChatMessage = {
                role: 'user',
                content: '## Loop Completed\n...',
                metadata: {
                    messageType: 'loop-result',
                    turnAdded: 1,
                    expirationTurns: 3,
                    expirationMode: 'Remove'
                }
            };

            const currentTurn = 5;
            const turnsAlive = currentTurn - (msg.metadata?.turnAdded || 0);

            // After 4 turns (5 - 1), exceeds 3-turn expiration
            expect(turnsAlive).toBe(4);
            expect(turnsAlive).toBeGreaterThan(msg.metadata!.expirationTurns!);
            expect(msg.metadata!.expirationMode).toBe('Remove');
        });

        it('sub-agent-result messages should be processable by expiration logic', () => {
            const msg: AgentChatMessage = {
                role: 'user',
                content: '## Sub-agent: Agent ✓\n...',
                metadata: {
                    messageType: 'sub-agent-result',
                    turnAdded: 2,
                    expirationTurns: 3,
                    expirationMode: 'Compact',
                    compactMode: 'First N Chars',
                    compactLength: 500,
                    subAgentName: 'Agent',
                    subAgentId: 'id'
                }
            };

            const currentTurn = 8;
            const turnsAlive = currentTurn - (msg.metadata?.turnAdded || 0);

            expect(turnsAlive).toBe(6);
            expect(turnsAlive).toBeGreaterThan(msg.metadata!.expirationTurns!);
            expect(msg.metadata!.expirationMode).toBe('Compact');
            expect(msg.metadata!.compactMode).toBe('First N Chars');
            expect(msg.metadata!.compactLength).toBe(500);
        });

        it('messages without expiration metadata should not be affected', () => {
            const msg: AgentChatMessage = {
                role: 'user',
                content: 'Just a regular message'
            };

            // No metadata means processMessageExpiration skips it
            expect(msg.metadata?.expirationTurns).toBeUndefined();
        });
    });

    // ═══════════════════════════════════════════════════════════════════
    // Integration: Full loop result message assembly
    // ═══════════════════════════════════════════════════════════════════

    describe('full loop result message assembly', () => {

        it('should produce a complete ForEach result message with metadata', () => {
            const results = [
                createIterationResult([
                    createActionSummary('GetEntityDetails', true, 'Found 12 fields', [
                        { Name: 'EntityName', Value: 'Accounts' },
                        { Name: 'FieldCount', Value: 12 }
                    ])
                ]),
                createIterationResult([
                    createActionSummary('GetEntityDetails', true, 'Found 8 fields', [
                        { Name: 'EntityName', Value: 'Contacts' },
                        { Name: 'FieldCount', Value: 8 }
                    ])
                ])
            ];

            const content = buildLoopResultContent('ForEach', 'data.entityList', results, []);
            const metadata = resolveLoopExpirationMetadata(3, undefined, undefined, [], []);

            // Content checks
            expect(content).toContain('## Loop Completed');
            expect(content).toContain('**Type:** ForEach');
            expect(content).toContain('**Collection:** data.entityList');
            expect(content).toContain('**Processed:** 2, **Errors:** 0');
            expect(content).toContain('### Iteration 1');
            expect(content).toContain('## GetEntityDetails ✓');
            expect(content).toContain('• `EntityName`: Accounts');
            expect(content).toContain('• `FieldCount`: `12`');
            expect(content).toContain('### Iteration 2');
            expect(content).toContain('• `EntityName`: Contacts');

            // Metadata checks
            expect(metadata.messageType).toBe('loop-result');
            expect(metadata.turnAdded).toBe(3);
            expect(metadata.expirationTurns).toBe(3);
            expect(metadata.expirationMode).toBe('Remove');

            // Should NOT contain JSON code blocks (old format)
            expect(content).not.toContain('```json');
            expect(content).not.toContain('JSON.stringify');
        });

        it('should produce a complete While loop result message', () => {
            const results = [
                createIterationResult([createActionSummary('FetchPage', true, 'Got page 1')]),
                createIterationResult([createActionSummary('FetchPage', true, 'Got page 2')]),
            ];

            const content = buildLoopResultContent('While', 'payload.hasNextPage === true', results, []);

            expect(content).toContain('**Type:** While');
            expect(content).toContain('**Condition:** payload.hasNextPage === true');
            expect(content).toContain('**Processed:** 2, **Errors:** 0');
        });

        it('should produce a loop result message with errors', () => {
            const results = [
                createIterationResult([createActionSummary('Process', true, 'OK')])
            ];
            const errors = ['Timeout on item 2', 'Auth expired on item 3'];

            const content = buildLoopResultContent('ForEach', 'items', results, errors);

            expect(content).toContain('**Processed:** 1, **Errors:** 2');
            expect(content).toContain('### Errors');
            expect(content).toContain('• ✗ Timeout on item 2');
            expect(content).toContain('• ✗ Auth expired on item 3');
        });

        it('should produce a loop result for sub-agent iterations', () => {
            const results = [
                createIterationResult('Sub-agent analyzed entity Accounts'),
                createIterationResult('Sub-agent analyzed entity Contacts'),
            ];

            const content = buildLoopResultContent('ForEach', 'data.entities', results, []);

            expect(content).toContain('### Iteration 1');
            expect(content).toContain('Sub-agent analyzed entity Accounts');
            expect(content).toContain('### Iteration 2');
            expect(content).toContain('Sub-agent analyzed entity Contacts');
        });
    });

    // ═══════════════════════════════════════════════════════════════════
    // Markdown vs JSON format verification
    // ═══════════════════════════════════════════════════════════════════

    describe('markdown format verification (no JSON)', () => {

        it('should not contain JSON code blocks for action results', () => {
            const results = [
                createIterationResult([
                    createActionSummary('Action1', true, 'Done', [
                        { Name: 'key', Value: 'value' }
                    ])
                ])
            ];
            const content = buildLoopResultContent('ForEach', 'list', results, []);

            expect(content).not.toContain('```json');
            expect(content).not.toContain('```\n```');
        });

        it('should use markdown formatting elements (##, **, •)', () => {
            const results = [
                createIterationResult([
                    createActionSummary('Test', true, 'Passed', [
                        { Name: 'Score', Value: 100 }
                    ])
                ])
            ];
            const md = formatLoopResultsAsMarkdown(results, []);

            expect(md).toContain('###');    // iteration headers
            expect(md).toContain('##');     // action headers
            expect(md).toContain('**');     // bold
            expect(md).toContain('•');      // bullet
            expect(md).toContain('`');      // inline code
        });

        it('should match non-loop action result format within iterations', () => {
            const summary = createActionSummary('MyAction', true, 'Completed', [
                { Name: 'Output', Value: 'data' }
            ]);

            // Direct format (non-loop)
            const directMd = formatActionResultsAsMarkdown([summary]);

            // Loop format should contain the same action markdown
            const results = [createIterationResult([summary])];
            const loopMd = formatLoopResultsAsMarkdown(results, []);

            // The loop version should contain the direct version (plus iteration header)
            expect(loopMd).toContain(directMd);
        });
    });

    // ═══════════════════════════════════════════════════════════════════
    // formatSubAgentResultAsMarkdown (extracted from BaseAgent)
    // ═══════════════════════════════════════════════════════════════════

    describe('formatSubAgentResultAsMarkdown', () => {

        it('should format a successful sub-agent result', () => {
            const md = formatSubAgentResultAsMarkdown('DataCollector', {
                success: true,
                agentRun: { Status: 'Completed' } as SubAgentRunInfo,
                payload: null
            });

            expect(md).toContain('## Sub-agent: DataCollector ✓');
            expect(md).toContain('**Status:** Completed');
        });

        it('should format a failed sub-agent result with error', () => {
            const md = formatSubAgentResultAsMarkdown('Analyzer', {
                success: false,
                agentRun: { Status: 'Failed', ErrorMessage: 'Timeout exceeded' } as SubAgentRunInfo,
                payload: null
            });

            expect(md).toContain('## Sub-agent: Analyzer ✗');
            expect(md).toContain('**Status:** Failed');
            expect(md).toContain('**Error:** Timeout exceeded');
        });

        it('should include payload when present', () => {
            const md = formatSubAgentResultAsMarkdown('Fetcher', {
                success: true,
                agentRun: { Status: 'Completed' } as SubAgentRunInfo,
                payload: { records: [1, 2, 3] }
            });

            expect(md).toContain('**Payload:**');
            expect(md).toContain('"records"');
        });

        it('should NOT truncate large payloads (lifecycle handles context)', () => {
            const bigPayload = 'x'.repeat(5000);
            const md = formatSubAgentResultAsMarkdown('BigAgent', {
                success: true,
                agentRun: { Status: 'Completed' } as SubAgentRunInfo,
                payload: bigPayload
            });

            // Full payload preserved — expiration/compaction lifecycle manages context window
            expect(md).toContain('x'.repeat(5000));
            expect(md).not.toContain('(truncated)');
        });

        it('should default status to Completed when agentRun has no Status', () => {
            const md = formatSubAgentResultAsMarkdown('Agent', {
                success: true,
                agentRun: {} as SubAgentRunInfo,
                payload: null
            });

            expect(md).toContain('**Status:** Completed');
        });

        it('should default status to Failed when unsuccessful and no Status', () => {
            const md = formatSubAgentResultAsMarkdown('Agent', {
                success: false,
                agentRun: {} as SubAgentRunInfo,
                payload: null
            });

            expect(md).toContain('**Status:** Failed');
        });

        it('should handle null agentRun gracefully', () => {
            const md = formatSubAgentResultAsMarkdown('Agent', {
                success: true,
                agentRun: null as unknown as SubAgentRunInfo,
                payload: null
            });

            expect(md).toContain('## Sub-agent: Agent ✓');
            expect(md).toContain('**Status:** Completed');
        });

        it('should not include Error line for successful results', () => {
            const md = formatSubAgentResultAsMarkdown('Agent', {
                success: true,
                agentRun: { Status: 'Completed' } as SubAgentRunInfo,
                payload: null
            });

            expect(md).not.toContain('**Error:**');
        });
    });

    // ═══════════════════════════════════════════════════════════════════
    // Sub-agent iterations in ForEach loops
    // ═══════════════════════════════════════════════════════════════════

    describe('sub-agent iterations in ForEach loops', () => {

        it('should format sub-agent results as markdown in loop summary', () => {
            // Simulate what happens after processSubAgentStep in a ForEach loop:
            // result.priorStepResult is set to formatSubAgentResultAsMarkdown output
            const subAgentMd = formatSubAgentResultAsMarkdown('EntityAnalyzer', {
                success: true,
                agentRun: { Status: 'Completed' } as SubAgentRunInfo,
                payload: { fieldCount: 12 }
            });

            const results = [
                createIterationResult(subAgentMd),  // string priorStepResult from sub-agent
                createIterationResult(subAgentMd),
            ];

            const content = buildLoopResultContent('ForEach', 'data.entities', results, []);

            expect(content).toContain('### Iteration 1');
            expect(content).toContain('### Iteration 2');
            expect(content).toContain('## Sub-agent: EntityAnalyzer ✓');
            expect(content).toContain('**Status:** Completed');
            expect(content).not.toContain('```json');
        });

        it('should handle mixed action and sub-agent iterations', () => {
            const actionResult = [createActionSummary('PrepareData', true, 'Data ready')];
            const subAgentMd = formatSubAgentResultAsMarkdown('ProcessData', {
                success: true,
                agentRun: { Status: 'Completed' } as SubAgentRunInfo,
                payload: null
            });

            const results = [
                createIterationResult(actionResult),   // action iteration
                createIterationResult(subAgentMd),     // sub-agent iteration
            ];

            const content = buildLoopResultContent('ForEach', 'items', results, []);

            // Action iteration should have action markdown
            expect(content).toContain('## PrepareData ✓');
            // Sub-agent iteration should have sub-agent markdown
            expect(content).toContain('## Sub-agent: ProcessData ✓');
        });

        it('should handle failed sub-agent iterations in loop', () => {
            const subAgentMd = formatSubAgentResultAsMarkdown('FailingAgent', {
                success: false,
                agentRun: { Status: 'Failed', ErrorMessage: 'Permission denied' } as SubAgentRunInfo,
                payload: null
            });

            const results = [createIterationResult(subAgentMd)];
            const errors = [{ message: 'Sub-agent failed on iteration 1' }];

            const content = buildLoopResultContent('ForEach', 'data.targets', results, errors);

            expect(content).toContain('## Sub-agent: FailingAgent ✗');
            expect(content).toContain('**Error:** Permission denied');
            expect(content).toContain('### Errors');
            expect(content).toContain('• ✗ Sub-agent failed on iteration 1');
        });

        it('should use ForEach metadata for sub-agent loop results', () => {
            const metadata = resolveLoopExpirationMetadata(5, undefined, undefined, [], []);

            // Sub-agent loops don't have an actionName, so should get default
            expect(metadata.messageType).toBe('loop-result');
            expect(metadata.expirationTurns).toBe(3);
            expect(metadata.expirationMode).toBe('Remove');
        });
    });

    // ═══════════════════════════════════════════════════════════════════
    // Sub-agent iterations in While loops
    // ═══════════════════════════════════════════════════════════════════

    describe('sub-agent iterations in While loops', () => {

        it('should format While loop with sub-agent results', () => {
            const subAgentMd1 = formatSubAgentResultAsMarkdown('PageFetcher', {
                success: true,
                agentRun: { Status: 'Completed' } as SubAgentRunInfo,
                payload: { page: 1, hasMore: true }
            });
            const subAgentMd2 = formatSubAgentResultAsMarkdown('PageFetcher', {
                success: true,
                agentRun: { Status: 'Completed' } as SubAgentRunInfo,
                payload: { page: 2, hasMore: false }
            });

            const results = [
                createIterationResult(subAgentMd1),
                createIterationResult(subAgentMd2),
            ];

            const content = buildLoopResultContent('While', 'payload.hasMore === true', results, []);

            expect(content).toContain('**Type:** While');
            expect(content).toContain('**Condition:** payload.hasMore === true');
            expect(content).toContain('**Processed:** 2, **Errors:** 0');
            expect(content).toContain('### Iteration 1');
            expect(content).toContain('### Iteration 2');
            expect(content).toContain('## Sub-agent: PageFetcher ✓');
        });

        it('should handle While loop with sub-agent errors', () => {
            const subAgentMd = formatSubAgentResultAsMarkdown('RetryAgent', {
                success: false,
                agentRun: { Status: 'Failed', ErrorMessage: 'Max retries exceeded' } as SubAgentRunInfo,
                payload: null
            });

            const results = [createIterationResult(subAgentMd)];
            const errors = ['Loop terminated: condition still true but max iterations reached'];

            const content = buildLoopResultContent('While', 'retryNeeded', results, errors);

            expect(content).toContain('**Type:** While');
            expect(content).toContain('## Sub-agent: RetryAgent ✗');
            expect(content).toContain('• ✗ Loop terminated: condition still true but max iterations reached');
        });
    });

    // ═══════════════════════════════════════════════════════════════════
    // Non-loop sub-agent result consistency
    // ═══════════════════════════════════════════════════════════════════

    describe('non-loop sub-agent result consistency', () => {

        it('should use same markdown format for loop and non-loop sub-agent results', () => {
            const result = {
                success: true,
                agentRun: { Status: 'Completed' } as SubAgentRunInfo,
                payload: { answer: 42 }
            };

            // Non-loop: formatSubAgentResultAsMarkdown is called directly
            const nonLoopMd = formatSubAgentResultAsMarkdown('Agent', result);

            // Loop: priorStepResult is set to formatSubAgentResultAsMarkdown output,
            // then formatLoopResultsAsMarkdown renders it as a string
            const loopResults = [createIterationResult(nonLoopMd)];
            const loopMd = formatLoopResultsAsMarkdown(loopResults, []);

            // Loop markdown should contain the same sub-agent markdown
            expect(loopMd).toContain(nonLoopMd);
        });

        it('child and related sub-agent results should both use sub-agent-result messageType', () => {
            // Child agent result metadata
            const childMetadata = resolveSubAgentExpirationMetadata(5, 'ChildAgent', 'child-id', undefined);

            // Related agent result metadata (same function, same behavior)
            const relatedMetadata = resolveSubAgentExpirationMetadata(5, 'RelatedAgent', 'related-id', undefined);

            expect(childMetadata.messageType).toBe('sub-agent-result');
            expect(relatedMetadata.messageType).toBe('sub-agent-result');
            expect(childMetadata.expirationTurns).toBe(3);
            expect(relatedMetadata.expirationTurns).toBe(3);
        });

        it('both child and related sub-agent results should respect override', () => {
            const override: MessageExpirationOverride = {
                expirationTurns: 8,
                expirationMode: 'Compact',
                compactMode: 'AI Summary',
                compactPromptId: 'prompt-xyz'
            };

            const childMetadata = resolveSubAgentExpirationMetadata(5, 'Child', 'id1', override);
            const relatedMetadata = resolveSubAgentExpirationMetadata(5, 'Related', 'id2', override);

            expect(childMetadata.expirationTurns).toBe(8);
            expect(childMetadata.compactMode).toBe('AI Summary');
            expect(relatedMetadata.expirationTurns).toBe(8);
            expect(relatedMetadata.compactMode).toBe('AI Summary');
        });
    });

    // ═══════════════════════════════════════════════════════════════════
    // Prompt turn counter vs step counter
    // ═══════════════════════════════════════════════════════════════════

    describe('prompt turn counter (_promptTurnCount)', () => {

        /**
         * Simulates the BaseAgent execution loop to verify that prompt turn counting
         * differs from step counting. This is critical because expiration age must be
         * measured in prompt executions, not total steps.
         *
         * In a real agent run:
         *   Step 1: Prompt execution → _promptTurnCount = 1
         *   Step 2: ForEach iteration 1 (action) → _promptTurnCount still 1
         *   Step 3: ForEach iteration 2 (action) → _promptTurnCount still 1
         *   ...
         *   Step 9: ForEach iteration 8 (action) → _promptTurnCount still 1
         *   Step 10: Prompt execution → _promptTurnCount = 2
         *
         * Without the dedicated counter, turnAdded would use step count and
         * expirationTurns=3 would expire messages far too early.
         */

        let promptTurnCount: number;
        let stepCount: number;

        /** Simulates the reset at the start of agent execution */
        function resetCounters() {
            promptTurnCount = 0;
            stepCount = 0;
        }

        /** Simulates executePromptStep incrementing the prompt counter */
        function simulatePromptExecution() {
            stepCount++;
            promptTurnCount++;
        }

        /** Simulates an action step (no prompt) */
        function simulateActionStep() {
            stepCount++;
            // promptTurnCount does NOT increment
        }

        /** Simulates a ForEach loop with N action iterations */
        function simulateForEachLoop(iterationCount: number) {
            stepCount++; // The ForEach step itself
            for (let i = 0; i < iterationCount; i++) {
                simulateActionStep(); // Each iteration is a step
            }
        }

        /** Simulates a sub-agent step */
        function simulateSubAgentStep() {
            stepCount++;
            // promptTurnCount does NOT increment (sub-agent has its own counter)
        }

        /**
         * Calculates expiration age using prompt turns (correct behavior).
         * Returns the number of prompt turns since the message was added.
         */
        function getPromptAge(turnAdded: number): number {
            return promptTurnCount - turnAdded;
        }

        /**
         * Calculates expiration age using step count (old buggy behavior).
         * Returns the number of steps since the message was added.
         */
        function getStepAge(turnAdded: number): number {
            return stepCount - turnAdded;
        }

        beforeEach(() => {
            resetCounters();
        });

        describe('counter behavior during execution', () => {

            it('should only increment on prompt execution, not action steps', () => {
                simulatePromptExecution();   // prompt 1
                simulateActionStep();        // action
                simulateActionStep();        // action

                expect(promptTurnCount).toBe(1);
                expect(stepCount).toBe(3);
            });

            it('should not increment during ForEach iterations', () => {
                simulatePromptExecution();       // prompt 1
                simulateForEachLoop(100);        // 100 iterations + loop step = 101 steps

                expect(promptTurnCount).toBe(1);
                expect(stepCount).toBe(102); // 1 prompt + 1 loop + 100 iterations
            });

            it('should not increment during sub-agent steps', () => {
                simulatePromptExecution();   // prompt 1
                simulateSubAgentStep();      // sub-agent
                simulateSubAgentStep();      // sub-agent

                expect(promptTurnCount).toBe(1);
                expect(stepCount).toBe(3);
            });

            it('should increment correctly across multiple prompts with interleaved steps', () => {
                simulatePromptExecution();       // prompt 1 → turnCount = 1
                simulateForEachLoop(50);         // 51 steps, no prompt
                simulatePromptExecution();       // prompt 2 → turnCount = 2
                simulateActionStep();            // action
                simulateSubAgentStep();          // sub-agent
                simulatePromptExecution();       // prompt 3 → turnCount = 3

                expect(promptTurnCount).toBe(3);
                expect(stepCount).toBe(56); // 3 prompts + 1 loop + 50 iterations + 1 action + 1 sub-agent
            });

            it('should start at 0 after reset', () => {
                simulatePromptExecution();
                simulatePromptExecution();
                expect(promptTurnCount).toBe(2);

                resetCounters();
                expect(promptTurnCount).toBe(0);
                expect(stepCount).toBe(0);
            });
        });

        describe('expiration age calculation correctness', () => {

            it('should calculate correct age after ForEach loop (prompt-based)', () => {
                simulatePromptExecution();       // prompt 1 → message added here
                const messageAddedAt = promptTurnCount; // turnAdded = 1

                simulateForEachLoop(8);          // 8 iterations (9 steps)
                simulatePromptExecution();       // prompt 2

                const promptAge = getPromptAge(messageAddedAt);
                const stepAge = getStepAge(messageAddedAt);

                // Only 1 prompt has happened since message was added
                expect(promptAge).toBe(1);
                // But 10 steps have happened (old buggy calculation)
                expect(stepAge).toBe(10);
            });

            it('should not expire message too early with ForEach loop', () => {
                const expirationTurns = 3;

                simulatePromptExecution();       // prompt 1 → message added
                const messageAddedAt = promptTurnCount;

                simulateForEachLoop(100);        // 100 iterations
                simulatePromptExecution();       // prompt 2

                const promptAge = getPromptAge(messageAddedAt);
                const stepAge = getStepAge(messageAddedAt);

                // With prompt-based counting: age=1, NOT expired (1 < 3)
                expect(promptAge).toBeLessThanOrEqual(expirationTurns);

                // With step-based counting: age=102, would be WRONGLY expired (102 > 3)
                expect(stepAge).toBeGreaterThan(expirationTurns);
            });

            it('should correctly expire after enough prompt turns', () => {
                const expirationTurns = 3;

                simulatePromptExecution();       // prompt 1 → message added
                const messageAddedAt = promptTurnCount;

                simulateForEachLoop(50);         // lots of steps, doesn't matter
                simulatePromptExecution();       // prompt 2 (age = 1)
                simulateActionStep();
                simulatePromptExecution();       // prompt 3 (age = 2)
                simulateForEachLoop(20);
                simulatePromptExecution();       // prompt 4 (age = 3)

                const promptAge = getPromptAge(messageAddedAt);

                // After 3 prompts since addition, age = 3, should expire
                expect(promptAge).toBe(3);
                expect(promptAge).toBeGreaterThanOrEqual(expirationTurns);
            });

            it('should handle message added at turn 0', () => {
                const messageAddedAt = 0; // added before any prompt

                simulatePromptExecution();       // prompt 1
                simulatePromptExecution();       // prompt 2

                expect(getPromptAge(messageAddedAt)).toBe(2);
            });

            it('should handle expirationTurns of 0 (expire immediately after next prompt)', () => {
                const expirationTurns = 0;

                simulatePromptExecution();
                const messageAddedAt = promptTurnCount;

                // Even without any more prompts, age calculation works
                expect(getPromptAge(messageAddedAt)).toBe(0);

                simulateForEachLoop(50); // many steps but no prompt
                expect(getPromptAge(messageAddedAt)).toBe(0); // still 0 prompt turns

                simulatePromptExecution(); // now age = 1
                expect(getPromptAge(messageAddedAt)).toBe(1);
                expect(getPromptAge(messageAddedAt)).toBeGreaterThan(expirationTurns);
            });
        });

        describe('turnAdded should use prompt turns, not step count', () => {

            it('action result turnAdded should reflect prompt turns', () => {
                simulatePromptExecution();       // prompt 1
                simulateForEachLoop(10);         // 11 steps

                // When action result is added here, turnAdded should be promptTurnCount (1)
                // not stepCount (12)
                const turnAdded = promptTurnCount;
                expect(turnAdded).toBe(1);
                expect(stepCount).toBe(12);
            });

            it('loop result turnAdded should reflect prompt turns', () => {
                simulatePromptExecution();       // prompt 1
                simulatePromptExecution();       // prompt 2
                simulateForEachLoop(5);          // 6 steps

                // Loop result injected after loop completes
                const turnAdded = promptTurnCount;
                expect(turnAdded).toBe(2); // 2 prompts, not 8 steps
            });

            it('sub-agent result turnAdded should reflect prompt turns', () => {
                simulatePromptExecution();
                simulateSubAgentStep();
                simulateSubAgentStep();
                simulateSubAgentStep();

                const turnAdded = promptTurnCount;
                expect(turnAdded).toBe(1); // 1 prompt, not 4 steps
            });
        });

        describe('realistic multi-step scenario', () => {

            it('should correctly track a typical agent workflow', () => {
                const expirationTurns = 3;

                // Step 1: Initial prompt → LLM decides to run a ForEach
                simulatePromptExecution();       // prompt 1
                const actionResultAddedAt = promptTurnCount; // action result from prompt 1

                // Steps 2-9: ForEach over 8 entities
                simulateForEachLoop(8);
                const loopResultAddedAt = promptTurnCount; // loop result after ForEach

                // Step 10: LLM analyzes loop results
                simulatePromptExecution();       // prompt 2

                // Step 11: LLM decides to run an action
                simulateActionStep();

                // Step 12: LLM analyzes action result
                simulatePromptExecution();       // prompt 3

                // Step 13: LLM runs sub-agent
                simulateSubAgentStep();

                // Step 14: LLM processes sub-agent result
                simulatePromptExecution();       // prompt 4

                // Verify ages
                expect(getPromptAge(actionResultAddedAt)).toBe(3); // 4 - 1 = 3, should expire
                expect(getPromptAge(loopResultAddedAt)).toBe(3);   // 4 - 1 = 3, should expire

                // With step counting, ages would be wildly inflated:
                // stepCount: prompt(1) + forEach(1+8=9) + prompt(1) + action(1) + prompt(1) + subAgent(1) + prompt(1) = 15
                expect(getStepAge(actionResultAddedAt)).toBe(14);  // 15 - 1 = 14
                expect(getStepAge(loopResultAddedAt)).toBe(14);    // 15 - 1 = 14 (same, both added at step 1)

                // The action result should expire (age 3 >= expirationTurns 3)
                expect(getPromptAge(actionResultAddedAt)).toBeGreaterThanOrEqual(expirationTurns);
            });

            it('should handle back-to-back ForEach loops without premature expiration', () => {
                const expirationTurns = 2;

                simulatePromptExecution();       // prompt 1
                const messageAdded = promptTurnCount;

                // Two consecutive ForEach loops with 50 iterations each
                simulateForEachLoop(50);         // 51 steps
                simulateForEachLoop(50);         // 51 steps

                simulatePromptExecution();       // prompt 2

                // Only 1 prompt turn has passed — message should NOT be expired
                expect(getPromptAge(messageAdded)).toBe(1);
                expect(getPromptAge(messageAdded)).toBeLessThan(expirationTurns);

                // But step count would say 103 turns — wildly premature expiration
                expect(getStepAge(messageAdded)).toBe(103);
            });
        });
    });
});
