/**
 * Unit tests for OutputFormatter
 */

import { describe, it, expect, vi } from 'vitest';

// Mock chalk to return plain text
vi.mock('chalk', () => {
    const identity = (s: string) => s;
    const handler: ProxyHandler<Record<string, unknown>> = {
        get: (_target, prop) => {
            if (prop === 'default' || prop === '__esModule') return _target;
            // Support chained calls like chalk.bold('text')
            return identity;
        }
    };
    return { default: new Proxy({}, handler) };
});

// Mock the table function
vi.mock('table', () => ({
    table: (data: string[][]) => data.map(row => row.join(' | ')).join('\n'),
}));

// Mock TextFormatter
vi.mock('../lib/text-formatter', () => ({
    TextFormatter: {
        formatText: (text: string) => text,
        formatJSON: (obj: unknown) => JSON.stringify(obj, null, 2),
    }
}));

import { OutputFormatter, OutputFormat, AgentInfo, ActionInfo, ExecutionResult } from '../lib/output-formatter';

describe('OutputFormatter', () => {
    describe('formatAgentList()', () => {
        it('should return message when no agents found', () => {
            const formatter = new OutputFormatter('compact');
            const result = formatter.formatAgentList([]);
            expect(result).toContain('No agents found');
        });

        it('should format agents in compact mode', () => {
            const formatter = new OutputFormatter('compact');
            const agents: AgentInfo[] = [
                { name: 'TestAgent', description: 'A test agent', status: 'available' },
                { name: 'DisabledAgent', status: 'disabled' },
            ];
            const result = formatter.formatAgentList(agents);
            expect(result).toContain('TestAgent');
            expect(result).toContain('A test agent');
            expect(result).toContain('DisabledAgent');
        });

        it('should format agents as JSON', () => {
            const formatter = new OutputFormatter('json');
            const agents: AgentInfo[] = [
                { name: 'TestAgent', status: 'available' },
            ];
            const result = formatter.formatAgentList(agents);
            const parsed = JSON.parse(result);
            expect(parsed).toHaveLength(1);
            expect(parsed[0].name).toBe('TestAgent');
        });

        it('should format agents as table', () => {
            const formatter = new OutputFormatter('table');
            const agents: AgentInfo[] = [
                { name: 'TestAgent', status: 'available' },
            ];
            const result = formatter.formatAgentList(agents);
            expect(result).toContain('TestAgent');
        });
    });

    describe('formatActionList()', () => {
        it('should return message when no actions found', () => {
            const formatter = new OutputFormatter('compact');
            expect(formatter.formatActionList([])).toContain('No actions found');
        });

        it('should format actions with parameters', () => {
            const formatter = new OutputFormatter('compact');
            const actions: ActionInfo[] = [
                {
                    name: 'SendEmail',
                    description: 'Send an email',
                    status: 'available',
                    parameters: [
                        { name: 'to', type: 'string', required: true },
                        { name: 'subject', type: 'string', required: true },
                        { name: 'body', type: 'string', required: false },
                    ]
                },
            ];
            const result = formatter.formatActionList(actions);
            expect(result).toContain('SendEmail');
            expect(result).toContain('Send an email');
        });

        it('should format actions as JSON', () => {
            const formatter = new OutputFormatter('json');
            const actions: ActionInfo[] = [
                { name: 'TestAction', status: 'available' },
            ];
            const result = formatter.formatActionList(actions);
            expect(JSON.parse(result)[0].name).toBe('TestAction');
        });
    });

    describe('formatAgentResult()', () => {
        it('should format successful result in compact mode', () => {
            const formatter = new OutputFormatter('compact');
            const result: ExecutionResult = {
                success: true,
                entityName: 'TestAgent',
                duration: 1500,
                steps: 3,
                result: 'Agent completed successfully',
            };
            const output = formatter.formatAgentResult(result);
            expect(output).toContain('TestAgent');
            expect(output).toContain('1500ms');
        });

        it('should format failed result in compact mode', () => {
            const formatter = new OutputFormatter('compact');
            const result: ExecutionResult = {
                success: false,
                entityName: 'TestAgent',
                duration: 500,
                error: 'Connection timeout',
            };
            const output = formatter.formatAgentResult(result);
            expect(output).toContain('failed');
            expect(output).toContain('Connection timeout');
        });

        it('should format result as JSON', () => {
            const formatter = new OutputFormatter('json');
            const result: ExecutionResult = {
                success: true,
                entityName: 'TestAgent',
                duration: 100,
            };
            const output = formatter.formatAgentResult(result);
            expect(JSON.parse(output).success).toBe(true);
        });
    });

    describe('formatActionResult()', () => {
        it('should format action result', () => {
            const formatter = new OutputFormatter('compact');
            const result: ExecutionResult = {
                success: true,
                entityName: 'SendEmail',
                duration: 200,
            };
            const output = formatter.formatActionResult(result);
            expect(output).toContain('SendEmail');
        });
    });

    describe('formatPromptResult()', () => {
        it('should format prompt result with response text', () => {
            const formatter = new OutputFormatter('compact');
            const result: ExecutionResult = {
                success: true,
                entityName: 'SummarizePrompt',
                duration: 800,
                result: 'This is the summarized text response.',
            };
            const output = formatter.formatPromptResult(result);
            expect(output).toContain('successfully');
        });

        it('should format prompt result with model info', () => {
            const formatter = new OutputFormatter('compact');
            const result: ExecutionResult = {
                success: true,
                entityName: 'TestPrompt',
                duration: 1000,
                result: {
                    response: 'The answer is 42',
                    modelSelection: {
                        modelUsed: 'GPT-4',
                        vendorUsed: 'OpenAI',
                    },
                    usage: {
                        promptTokens: 100,
                        completionTokens: 50,
                        totalTokens: 150,
                    }
                },
            };
            const output = formatter.formatPromptResult(result);
            expect(output).toContain('The answer is 42');
        });

        it('should format failed prompt', () => {
            const formatter = new OutputFormatter('compact');
            const result: ExecutionResult = {
                success: false,
                entityName: 'TestPrompt',
                duration: 100,
                error: 'Model unavailable',
            };
            const output = formatter.formatPromptResult(result);
            expect(output).toContain('failed');
            expect(output).toContain('Model unavailable');
        });
    });
});
