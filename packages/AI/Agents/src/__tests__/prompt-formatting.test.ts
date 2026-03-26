/**
 * Unit tests for prompt formatting methods that emit compact markdown
 * for action details and sub-agent details in agent system prompts.
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
