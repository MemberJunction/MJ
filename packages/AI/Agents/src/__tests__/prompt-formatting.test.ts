/**
 * Unit tests for prompt formatting methods that emit compact markdown
 * for action details, sub-agent details, and execution results in agent
 * system prompts and conversation messages.
 *
 * These tests use standalone implementations mirroring the private methods
 * in BaseAgent so we can test the formatting logic without class dependencies.
 *
 * @since 2.47.0
 */

import { describe, it, expect } from 'vitest';

// ============================================================================
// Lightweight types mirroring the entity shapes used by the formatters
// ============================================================================

interface MockActionParam {
    Name: string;
    Type: string;
    IsRequired: boolean;
    IsArray: boolean;
    DefaultValue: string | null;
    Description: string | null;
    ValueType: string;
}

interface MockResultCode {
    ResultCode: string;
    IsSuccess: boolean;
    Description: string | null;
}

interface MockAction {
    Name: string;
    Description: string;
    Params: MockActionParam[];
    ResultCodes: MockResultCode[];
}

interface MockSubAgent {
    Name: string;
    Description: string;
    ExecutionMode: string;
    ExecutionOrder: number;
}

// ============================================================================
// Standalone implementations mirroring BaseAgent private methods
// ============================================================================

function formatActionParameter(param: MockActionParam): string {
    const requiredMarker = param.IsRequired ? '\\*' : '';
    const parts: string[] = [];

    if (param.IsArray) {
        parts.push('array');
    }

    const vt = param.ValueType?.trim();
    if (vt && vt !== 'Scalar' && vt !== 'Other') {
        parts.push(vt);
    }

    const suffix = parts.length > 0 ? ` (${parts.join(', ')})` : '';

    let defaultStr = '';
    if (param.DefaultValue != null && param.DefaultValue !== '') {
        defaultStr = ` (default: ${JSON.stringify(param.DefaultValue)})`;
    }

    const desc = param.Description ? ` — ${param.Description}` : '';
    return `\`${param.Name}\`${requiredMarker}${suffix}${desc}${defaultStr}`;
}

function formatActionDetails(actions: MockAction[]): string {
    return actions.map(action => {
        const lines: string[] = [];
        lines.push(`### ${action.Name}`);
        lines.push(action.Description);

        const inputParams = action.Params
            .filter(p => {
                const t = p.Type.trim().toLowerCase();
                return t === 'input' || t === 'both';
            });
        const outputParams = action.Params
            .filter(p => {
                const t = p.Type.trim().toLowerCase();
                return t === 'output' || t === 'both';
            });

        if (inputParams.length > 0) {
            lines.push(`**Input:** ${inputParams.map(p => formatActionParameter(p)).join(', ')}`);
        }
        if (outputParams.length > 0) {
            lines.push(`**Output:** ${outputParams.map(p => formatActionParameter(p)).join(', ')}`);
        }

        if (action.ResultCodes.length > 0) {
            const rcParts = action.ResultCodes.map(rc => {
                const marker = rc.IsSuccess ? '✓' : '✗';
                const desc = rc.Description && rc.Description.toLowerCase() !== rc.ResultCode.toLowerCase()
                    ? ` ${rc.Description}`
                    : '';
                return `${rc.ResultCode} ${marker}${desc}`;
            });
            lines.push(`**Results:** ${rcParts.join(' · ')}`);
        }

        return lines.join('\n');
    }).join('\n\n');
}

function formatSubAgentDetails(subAgents: MockSubAgent[]): string {
    return subAgents.map(sa => {
        let line = `- **${sa.Name}** — ${sa.Description}`;
        if (sa.ExecutionMode !== 'Sequential') {
            line += ` _(${sa.ExecutionMode}, order: ${sa.ExecutionOrder})_`;
        }
        return line;
    }).join('\n');
}

// ============================================================================
// Test Fixtures
// ============================================================================

function makeParam(overrides: Partial<MockActionParam> = {}): MockActionParam {
    return {
        Name: 'TestParam',
        Type: 'Input',
        IsRequired: true,
        IsArray: false,
        DefaultValue: null,
        Description: 'A test parameter',
        ValueType: 'Scalar',
        ...overrides,
    };
}

function makeResultCode(overrides: Partial<MockResultCode> = {}): MockResultCode {
    return {
        ResultCode: 'SUCCESS',
        IsSuccess: true,
        Description: 'Operation completed successfully',
        ...overrides,
    };
}

function makeAction(overrides: Partial<MockAction> = {}): MockAction {
    return {
        Name: 'Test Action',
        Description: 'Does something useful',
        Params: [],
        ResultCodes: [],
        ...overrides,
    };
}

function makeSubAgent(overrides: Partial<MockSubAgent> = {}): MockSubAgent {
    return {
        Name: 'Helper Agent',
        Description: 'Helps with stuff',
        ExecutionMode: 'Sequential',
        ExecutionOrder: 1,
        ...overrides,
    };
}

// ============================================================================
// formatActionParameter Tests
// ============================================================================

describe('formatActionParameter', () => {
    it('should format a required scalar param with description', () => {
        const result = formatActionParameter(makeParam({
            Name: 'To',
            IsRequired: true,
            Description: 'Email address',
        }));
        expect(result).toBe('`To`\\* — Email address');
    });

    it('should format an optional param without the required marker', () => {
        const result = formatActionParameter(makeParam({
            Name: 'CC',
            IsRequired: false,
            Description: 'CC recipients',
        }));
        expect(result).toBe('`CC` — CC recipients');
        expect(result).not.toContain('\\*');
    });

    it('should append (array) when IsArray is true', () => {
        const result = formatActionParameter(makeParam({
            Name: 'Items',
            IsArray: true,
            Description: 'List of items',
        }));
        expect(result).toContain('(array)');
        expect(result).toBe('`Items`\\* (array) — List of items');
    });

    it('should show ValueType when not Scalar or Other', () => {
        const result = formatActionParameter(makeParam({
            Name: 'Record',
            ValueType: 'BaseEntity Sub-Class',
            Description: 'The entity record',
        }));
        expect(result).toContain('(BaseEntity Sub-Class)');
    });

    it('should combine array and non-scalar ValueType', () => {
        const result = formatActionParameter(makeParam({
            Name: 'Records',
            IsArray: true,
            ValueType: 'Simple Object',
            Description: 'Multiple objects',
        }));
        expect(result).toContain('(array, Simple Object)');
    });

    it('should omit ValueType suffix for Scalar', () => {
        const result = formatActionParameter(makeParam({
            Name: 'Name',
            ValueType: 'Scalar',
            Description: 'A name',
        }));
        expect(result).toBe('`Name`\\* — A name');
        expect(result).not.toContain('Scalar');
    });

    it('should omit ValueType suffix for Other', () => {
        const result = formatActionParameter(makeParam({
            Name: 'Data',
            ValueType: 'Other',
            Description: 'Some data',
        }));
        expect(result).not.toContain('Other');
    });

    it('should show default value when present', () => {
        const result = formatActionParameter(makeParam({
            Name: 'Format',
            IsRequired: false,
            DefaultValue: 'html',
            Description: 'Output format',
        }));
        expect(result).toContain('(default: "html")');
    });

    it('should omit default value when null', () => {
        const result = formatActionParameter(makeParam({
            Name: 'Title',
            DefaultValue: null,
        }));
        expect(result).not.toContain('default');
    });

    it('should omit default value when empty string', () => {
        const result = formatActionParameter(makeParam({
            Name: 'Title',
            DefaultValue: '',
        }));
        expect(result).not.toContain('default');
    });

    it('should handle param with no description', () => {
        const result = formatActionParameter(makeParam({
            Name: 'ID',
            Description: null,
        }));
        expect(result).toBe('`ID`\\*');
        expect(result).not.toContain('—');
    });

    it('should handle param with whitespace-padded Type in ValueType', () => {
        const result = formatActionParameter(makeParam({
            Name: 'Data',
            ValueType: '  Scalar  ',
            Description: 'Some data',
        }));
        // Trimmed Scalar should be omitted
        expect(result).not.toContain('Scalar');
    });
});

// ============================================================================
// formatActionDetails Tests
// ============================================================================

describe('formatActionDetails', () => {
    it('should format a basic action with name and description', () => {
        const result = formatActionDetails([makeAction({
            Name: 'Send Email',
            Description: 'Sends an email to recipients',
        })]);
        expect(result).toContain('### Send Email');
        expect(result).toContain('Sends an email to recipients');
    });

    it('should include input params line when inputs exist', () => {
        const result = formatActionDetails([makeAction({
            Name: 'Search',
            Description: 'Searches the web',
            Params: [
                makeParam({ Name: 'Query', Type: 'Input', Description: 'Search query' }),
                makeParam({ Name: 'MaxResults', Type: 'Input', IsRequired: false, Description: 'Max results' }),
            ],
        })]);
        expect(result).toContain('**Input:**');
        expect(result).toContain('`Query`\\*');
        expect(result).toContain('`MaxResults`');
    });

    it('should include output params line when outputs exist', () => {
        const result = formatActionDetails([makeAction({
            Name: 'Search',
            Description: 'Searches the web',
            Params: [
                makeParam({ Name: 'Query', Type: 'Input', Description: 'Search query' }),
                makeParam({ Name: 'Results', Type: 'Output', IsRequired: false, Description: 'Search results' }),
            ],
        })]);
        expect(result).toContain('**Output:**');
        expect(result).toContain('`Results`');
    });

    it('should omit output line when no output params', () => {
        const result = formatActionDetails([makeAction({
            Params: [makeParam({ Name: 'Input1', Type: 'Input' })],
        })]);
        expect(result).not.toContain('**Output:**');
    });

    it('should omit input line when no input params', () => {
        const result = formatActionDetails([makeAction({
            Params: [makeParam({ Name: 'Out1', Type: 'Output', IsRequired: false })],
        })]);
        expect(result).not.toContain('**Input:**');
    });

    it('should include "Both" type params in both input and output', () => {
        const result = formatActionDetails([makeAction({
            Params: [makeParam({ Name: 'Data', Type: 'Both', Description: 'In/out data' })],
        })]);
        expect(result).toContain('**Input:**');
        expect(result).toContain('**Output:**');
        // Both lines should reference the param
        const inputLine = result.split('\n').find(l => l.startsWith('**Input:**'));
        const outputLine = result.split('\n').find(l => l.startsWith('**Output:**'));
        expect(inputLine).toContain('`Data`');
        expect(outputLine).toContain('`Data`');
    });

    it('should format result codes with success/failure markers', () => {
        const result = formatActionDetails([makeAction({
            ResultCodes: [
                makeResultCode({ ResultCode: 'SUCCESS', IsSuccess: true, Description: 'Email sent' }),
                makeResultCode({ ResultCode: 'INVALID_ADDRESS', IsSuccess: false, Description: 'Bad email' }),
            ],
        })]);
        expect(result).toContain('**Results:**');
        expect(result).toContain('SUCCESS ✓ Email sent');
        expect(result).toContain('INVALID_ADDRESS ✗ Bad email');
        expect(result).toContain('·');
    });

    it('should omit result code description when it matches the code name', () => {
        const result = formatActionDetails([makeAction({
            ResultCodes: [
                makeResultCode({ ResultCode: 'Success', IsSuccess: true, Description: 'success' }),
            ],
        })]);
        // Description "success" matches ResultCode "Success" (case-insensitive) → omitted
        expect(result).toContain('Success ✓');
        expect(result).not.toContain('Success ✓ success');
    });

    it('should omit results line when no result codes', () => {
        const result = formatActionDetails([makeAction({ ResultCodes: [] })]);
        expect(result).not.toContain('**Results:**');
    });

    it('should handle null description in result codes', () => {
        const result = formatActionDetails([makeAction({
            ResultCodes: [
                makeResultCode({ ResultCode: 'OK', IsSuccess: true, Description: null }),
            ],
        })]);
        expect(result).toContain('OK ✓');
    });

    it('should separate multiple actions with blank lines', () => {
        const result = formatActionDetails([
            makeAction({ Name: 'Action A', Description: 'First' }),
            makeAction({ Name: 'Action B', Description: 'Second' }),
        ]);
        expect(result).toContain('### Action A');
        expect(result).toContain('### Action B');
        // Two actions separated by \n\n
        expect(result).toContain('\n\n');
    });

    it('should return empty string for empty action list', () => {
        const result = formatActionDetails([]);
        expect(result).toBe('');
    });

    it('should handle Type field with extra whitespace', () => {
        const result = formatActionDetails([makeAction({
            Params: [makeParam({ Name: 'X', Type: '  Input  ', Description: 'padded' })],
        })]);
        expect(result).toContain('**Input:**');
        expect(result).toContain('`X`');
    });

    it('should produce significantly fewer characters than equivalent JSON', () => {
        const actions = [makeAction({
            Name: 'Web Search',
            Description: 'Searches the web for information',
            Params: [
                makeParam({ Name: 'Query', Type: 'Input', IsRequired: true, Description: 'Search query string' }),
                makeParam({ Name: 'MaxResults', Type: 'Input', IsRequired: false, DefaultValue: '10', Description: 'Maximum results to return' }),
                makeParam({ Name: 'Results', Type: 'Output', IsRequired: false, Description: 'Search result objects', ValueType: 'Simple Object', IsArray: true }),
            ],
            ResultCodes: [
                makeResultCode({ ResultCode: 'SUCCESS', IsSuccess: true, Description: 'Results found' }),
                makeResultCode({ ResultCode: 'NO_RESULTS', IsSuccess: false, Description: 'No matching results' }),
                makeResultCode({ ResultCode: 'RATE_LIMITED', IsSuccess: false, Description: 'API rate limit exceeded' }),
            ],
        })];

        const md = formatActionDetails(actions);

        // Build equivalent old-style JSON for comparison
        const json = JSON.stringify(actions.map(a => ({
            Name: a.Name,
            Description: a.Description,
            Parameters: {
                Input: a.Params.filter(p => p.Type === 'Input').map(p => ({
                    Name: p.Name, Type: p.Type, IsRequired: p.IsRequired,
                    IsArray: p.IsArray, DefaultValue: p.DefaultValue,
                    Description: p.Description, ValueType: p.ValueType,
                })),
                Output: a.Params.filter(p => p.Type === 'Output').map(p => ({
                    Name: p.Name, Type: p.Type, IsRequired: p.IsRequired,
                    IsArray: p.IsArray, DefaultValue: p.DefaultValue,
                    Description: p.Description, ValueType: p.ValueType,
                })),
            },
            ResultCodes: a.ResultCodes.map(rc => ({
                Code: rc.ResultCode, IsSuccess: rc.IsSuccess, Description: rc.Description,
            })),
            Category: null,
            Status: 'Active',
        })), null, 2);

        // Markdown should be at least 50% smaller than JSON
        expect(md.length).toBeLessThan(json.length * 0.5);
    });
});

// ============================================================================
// formatSubAgentDetails Tests
// ============================================================================

describe('formatSubAgentDetails', () => {
    it('should format a sequential sub-agent as a bullet point', () => {
        const result = formatSubAgentDetails([makeSubAgent({
            Name: 'Research Agent',
            Description: 'Performs web research',
        })]);
        expect(result).toBe('- **Research Agent** — Performs web research');
    });

    it('should omit execution mode for sequential agents', () => {
        const result = formatSubAgentDetails([makeSubAgent({
            ExecutionMode: 'Sequential',
            ExecutionOrder: 5,
        })]);
        expect(result).not.toContain('Sequential');
        expect(result).not.toContain('order:');
    });

    it('should include execution mode and order for non-sequential agents', () => {
        const result = formatSubAgentDetails([makeSubAgent({
            Name: 'Parallel Worker',
            Description: 'Works in parallel',
            ExecutionMode: 'Parallel',
            ExecutionOrder: 3,
        })]);
        expect(result).toContain('_(Parallel, order: 3)_');
    });

    it('should format multiple sub-agents as separate bullet points', () => {
        const result = formatSubAgentDetails([
            makeSubAgent({ Name: 'Agent A', Description: 'Does A' }),
            makeSubAgent({ Name: 'Agent B', Description: 'Does B' }),
            makeSubAgent({ Name: 'Agent C', Description: 'Does C' }),
        ]);
        const lines = result.split('\n');
        expect(lines).toHaveLength(3);
        expect(lines[0]).toContain('**Agent A**');
        expect(lines[1]).toContain('**Agent B**');
        expect(lines[2]).toContain('**Agent C**');
    });

    it('should return empty string for empty sub-agent list', () => {
        const result = formatSubAgentDetails([]);
        expect(result).toBe('');
    });

    it('should handle mix of sequential and non-sequential agents', () => {
        const result = formatSubAgentDetails([
            makeSubAgent({ Name: 'Seq', ExecutionMode: 'Sequential', ExecutionOrder: 1 }),
            makeSubAgent({ Name: 'Par', ExecutionMode: 'Parallel', ExecutionOrder: 2 }),
        ]);
        const lines = result.split('\n');
        expect(lines[0]).not.toContain('Sequential');
        expect(lines[1]).toContain('_(Parallel, order: 2)_');
    });
});

// ============================================================================
// Types and standalone implementations for action/sub-agent RESULT formatting
// ============================================================================

interface MockOutputParam {
    Name: string;
    Value: unknown;
    Type: 'Input' | 'Output' | 'Both';
}

interface MockActionResultSummary {
    actionName: string;
    success: boolean;
    params: MockOutputParam[];
    resultCode: string;
    message: string;
}

interface MockExecuteAgentResult {
    success: boolean;
    payload?: unknown;
    agentRun?: {
        Status?: string;
        ErrorMessage?: string;
    };
}

function formatParamValueForResult(value: unknown, maxLength: number = 500): string {
    if (value === null || value === undefined) {
        return '`null`';
    }

    if (typeof value === 'boolean' || typeof value === 'number') {
        return `\`${String(value)}\``;
    }

    let stringValue: string;
    if (typeof value === 'string') {
        stringValue = value;
    } else {
        stringValue = JSON.stringify(value);
    }

    if (stringValue.length > maxLength) {
        return `${stringValue.substring(0, maxLength)}…`;
    }

    return stringValue;
}

function formatActionResultsAsMarkdown(actionSummaries: MockActionResultSummary[]): string {
    return actionSummaries.map(a => {
        const marker = a.success ? '✓' : '✗';
        const lines: string[] = [];

        lines.push(`## ${a.actionName} ${marker}`);
        lines.push(`**Result:** ${a.resultCode} — ${a.message || '(no message)'}`);

        if (a.params && a.params.length > 0) {
            lines.push('**Output:**');
            for (const p of a.params) {
                lines.push(`• \`${p.Name}\`: ${formatParamValueForResult(p.Value)}`);
            }
        }

        return lines.join('\n');
    }).join('\n\n');
}

function formatSubAgentResultAsMarkdown(subAgentName: string, result: MockExecuteAgentResult): string {
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
        if (payloadStr.length > 4000) {
            lines.push(`**Payload** (truncated):\n${payloadStr.substring(0, 4000)}…`);
        } else {
            lines.push(`**Payload:**\n${payloadStr}`);
        }
    }

    return lines.join('\n');
}

// ============================================================================
// Fixtures for result formatting
// ============================================================================

function makeOutputParam(overrides: Partial<MockOutputParam> = {}): MockOutputParam {
    return {
        Name: 'OutputParam',
        Value: 'some value',
        Type: 'Output',
        ...overrides,
    };
}

function makeActionResult(overrides: Partial<MockActionResultSummary> = {}): MockActionResultSummary {
    return {
        actionName: 'Test Action',
        success: true,
        params: [],
        resultCode: 'SUCCESS',
        message: 'Action completed',
        ...overrides,
    };
}

// ============================================================================
// formatParamValueForResult Tests
// ============================================================================

describe('formatParamValueForResult', () => {
    it('should format null as backtick-wrapped null', () => {
        expect(formatParamValueForResult(null)).toBe('`null`');
    });

    it('should format undefined as backtick-wrapped null', () => {
        expect(formatParamValueForResult(undefined)).toBe('`null`');
    });

    it('should format booleans with backticks', () => {
        expect(formatParamValueForResult(true)).toBe('`true`');
        expect(formatParamValueForResult(false)).toBe('`false`');
    });

    it('should format numbers with backticks', () => {
        expect(formatParamValueForResult(42)).toBe('`42`');
        expect(formatParamValueForResult(3.14)).toBe('`3.14`');
    });

    it('should format strings as-is (no extra wrapping)', () => {
        expect(formatParamValueForResult('hello world')).toBe('hello world');
    });

    it('should use compact JSON for objects', () => {
        const result = formatParamValueForResult({ key: 'value', count: 5 });
        expect(result).toBe('{"key":"value","count":5}');
        // No pretty-printing (no newlines)
        expect(result).not.toContain('\n');
    });

    it('should use compact JSON for arrays', () => {
        const result = formatParamValueForResult([1, 2, 3]);
        expect(result).toBe('[1,2,3]');
    });

    it('should truncate very long strings', () => {
        const longString = 'x'.repeat(600);
        const result = formatParamValueForResult(longString, 500);
        expect(result.length).toBeLessThanOrEqual(502); // 500 + '…'
        expect(result).toContain('…');
    });

    it('should not truncate strings within the limit', () => {
        const shortString = 'hello';
        const result = formatParamValueForResult(shortString, 500);
        expect(result).toBe('hello');
        expect(result).not.toContain('…');
    });
});

// ============================================================================
// formatActionResultsAsMarkdown Tests
// ============================================================================

describe('formatActionResultsAsMarkdown', () => {
    it('should format a successful action with ✓ marker', () => {
        const result = formatActionResultsAsMarkdown([makeActionResult({
            actionName: 'Send Email',
            success: true,
            resultCode: 'SUCCESS',
            message: 'Email sent',
        })]);
        expect(result).toContain('## Send Email ✓');
        expect(result).toContain('**Result:** SUCCESS — Email sent');
    });

    it('should format a failed action with ✗ marker', () => {
        const result = formatActionResultsAsMarkdown([makeActionResult({
            actionName: 'Send Email',
            success: false,
            resultCode: 'ERROR',
            message: 'Connection timeout',
        })]);
        expect(result).toContain('## Send Email ✗');
        expect(result).toContain('**Result:** ERROR — Connection timeout');
    });

    it('should include output params as bullet list', () => {
        const result = formatActionResultsAsMarkdown([makeActionResult({
            actionName: 'Fetch Data',
            params: [
                makeOutputParam({ Name: 'MessageId', Value: 'abc-123' }),
                makeOutputParam({ Name: 'Status', Value: 'queued' }),
            ],
        })]);
        expect(result).toContain('**Output:**');
        expect(result).toContain('• `MessageId`: abc-123');
        expect(result).toContain('• `Status`: queued');
    });

    it('should omit output section when no params', () => {
        const result = formatActionResultsAsMarkdown([makeActionResult({
            params: [],
        })]);
        expect(result).not.toContain('**Output:**');
    });

    it('should format object param values as compact JSON', () => {
        const result = formatActionResultsAsMarkdown([makeActionResult({
            params: [
                makeOutputParam({ Name: 'Data', Value: { rows: 10, status: 'ok' } }),
            ],
        })]);
        expect(result).toContain('• `Data`: {"rows":10,"status":"ok"}');
    });

    it('should format boolean and numeric param values with backticks', () => {
        const result = formatActionResultsAsMarkdown([makeActionResult({
            params: [
                makeOutputParam({ Name: 'Count', Value: 42 }),
                makeOutputParam({ Name: 'IsValid', Value: true }),
            ],
        })]);
        expect(result).toContain('• `Count`: `42`');
        expect(result).toContain('• `IsValid`: `true`');
    });

    it('should separate multiple actions with blank lines', () => {
        const result = formatActionResultsAsMarkdown([
            makeActionResult({ actionName: 'Action A', resultCode: 'SUCCESS' }),
            makeActionResult({ actionName: 'Action B', resultCode: 'SUCCESS' }),
        ]);
        expect(result).toContain('## Action A ✓');
        expect(result).toContain('## Action B ✓');
        expect(result).toContain('\n\n');
    });

    it('should return empty string for empty array', () => {
        expect(formatActionResultsAsMarkdown([])).toBe('');
    });

    it('should handle missing message gracefully', () => {
        const result = formatActionResultsAsMarkdown([makeActionResult({
            message: '',
        })]);
        expect(result).toContain('(no message)');
    });

    it('should produce significantly fewer characters than equivalent pretty-printed JSON', () => {
        const summaries = [
            makeActionResult({
                actionName: 'Web Search',
                resultCode: 'SUCCESS',
                message: 'Found 15 results',
                params: [
                    makeOutputParam({ Name: 'ResultCount', Value: 15 }),
                    makeOutputParam({ Name: 'TopResult', Value: 'https://example.com/article' }),
                    makeOutputParam({ Name: 'Metadata', Value: { source: 'google', latency: 230 } }),
                ],
            }),
            makeActionResult({
                actionName: 'Summarize Content',
                resultCode: 'SUCCESS',
                message: 'Summary generated',
                params: [
                    makeOutputParam({ Name: 'Summary', Value: 'This is a summary of the content found during web search.' }),
                    makeOutputParam({ Name: 'WordCount', Value: 120 }),
                ],
            }),
        ];

        const md = formatActionResultsAsMarkdown(summaries);
        const json = JSON.stringify(summaries, null, 2);

        // Markdown should be meaningfully smaller than pretty-printed JSON
        expect(md.length).toBeLessThan(json.length * 0.75);
    });
});

// ============================================================================
// formatSubAgentResultAsMarkdown Tests
// ============================================================================

describe('formatSubAgentResultAsMarkdown', () => {
    it('should format a successful sub-agent result with ✓', () => {
        const result = formatSubAgentResultAsMarkdown('DataGather', {
            success: true,
            agentRun: { Status: 'Completed' },
            payload: 'Here is the gathered data.',
        });
        expect(result).toContain('## Sub-agent: DataGather ✓');
        expect(result).toContain('**Status:** Completed');
        expect(result).toContain('**Payload:**');
        expect(result).toContain('Here is the gathered data.');
    });

    it('should format a failed sub-agent result with ✗ and error', () => {
        const result = formatSubAgentResultAsMarkdown('Analysis', {
            success: false,
            agentRun: { Status: 'Failed', ErrorMessage: 'Out of memory' },
        });
        expect(result).toContain('## Sub-agent: Analysis ✗');
        expect(result).toContain('**Status:** Failed');
        expect(result).toContain('**Error:** Out of memory');
    });

    it('should default status to Completed/Failed when agentRun.Status is absent', () => {
        const successResult = formatSubAgentResultAsMarkdown('Agent', { success: true });
        expect(successResult).toContain('**Status:** Completed');

        const failResult = formatSubAgentResultAsMarkdown('Agent', { success: false });
        expect(failResult).toContain('**Status:** Failed');
    });

    it('should omit error line for successful results', () => {
        const result = formatSubAgentResultAsMarkdown('Agent', {
            success: true,
            agentRun: { Status: 'Completed' },
        });
        expect(result).not.toContain('**Error:**');
    });

    it('should omit payload section when payload is null/undefined', () => {
        const result = formatSubAgentResultAsMarkdown('Agent', {
            success: true,
            payload: undefined,
        });
        expect(result).not.toContain('**Payload');
    });

    it('should serialize object payloads as JSON', () => {
        const result = formatSubAgentResultAsMarkdown('Agent', {
            success: true,
            payload: { report: 'quarterly', items: [1, 2, 3] },
        });
        expect(result).toContain('**Payload:**');
        expect(result).toContain('"report":"quarterly"');
    });

    it('should truncate very large payloads', () => {
        const largePayload = 'x'.repeat(5000);
        const result = formatSubAgentResultAsMarkdown('Agent', {
            success: true,
            payload: largePayload,
        });
        expect(result).toContain('**Payload** (truncated):');
        expect(result).toContain('…');
        // Should be capped around 4000 chars of payload content
        const payloadLine = result.split('**Payload** (truncated):\n')[1];
        expect(payloadLine.length).toBeLessThanOrEqual(4002); // 4000 + '…'
    });

    it('should not truncate payloads within the 4000-char limit', () => {
        const normalPayload = 'Some analysis results that fit easily.';
        const result = formatSubAgentResultAsMarkdown('Agent', {
            success: true,
            payload: normalPayload,
        });
        expect(result).toContain('**Payload:**');
        expect(result).not.toContain('(truncated)');
        expect(result).not.toContain('…');
    });
});
