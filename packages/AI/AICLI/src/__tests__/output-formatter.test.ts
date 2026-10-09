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
        FormatText: (text: string) => text,
        FormatJSON: (obj: unknown) => JSON.stringify(obj, null, 2),
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

        // Regression: the empty case used to be answered ABOVE the format switch, so
        // `--format=json` returned the prose "No agents found." An empty result is still
        // a result — a caller parsing stdout must get [], not a sentence it will choke on
        // and cannot distinguish from the command having failed.
        it('should emit [] — not prose — for an empty list in json mode', () => {
            const formatter = new OutputFormatter('json');
            const result = formatter.formatAgentList([]);
            expect(() => JSON.parse(result)).not.toThrow();
            expect(JSON.parse(result)).toEqual([]);
        });

        it('should keep the human sentence for an empty list in table mode', () => {
            const formatter = new OutputFormatter('table');
            expect(formatter.formatAgentList([])).toContain('No agents found');
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

        it('should emit [] — not prose — for an empty list in json mode', () => {
            const formatter = new OutputFormatter('json');
            const result = formatter.formatActionList([]);
            expect(() => JSON.parse(result)).not.toThrow();
            expect(JSON.parse(result)).toEqual([]);
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

    // `mj ai actions run --dry-run` used to print chalk-coloured prose straight from the
    // command, ignoring the resolved format entirely — so the one output most likely to
    // be read by a program (it exists to be inspected before committing) was the one
    // output that never honoured --format=json.
    describe('formatActionDryRun()', () => {
        it('should describe the planned execution as parseable data in json mode', () => {
            const formatter = new OutputFormatter('json');
            const result = formatter.formatActionDryRun('Get Weather', { Location: 'Boston' });

            expect(() => JSON.parse(result)).not.toThrow();
            expect(JSON.parse(result)).toEqual({
                dryRun: true,
                action: 'Get Weather',
                parameters: { Location: 'Boston' },
            });
        });

        it('should still stay parseable with no parameters', () => {
            const formatter = new OutputFormatter('json');
            const parsed = JSON.parse(formatter.formatActionDryRun('Get Weather', {}));
            expect(parsed).toEqual({ dryRun: true, action: 'Get Weather', parameters: {} });
        });

        it('should keep the readable rendering in compact mode', () => {
            const formatter = new OutputFormatter('compact');
            const result = formatter.formatActionDryRun('Get Weather', { Location: 'Boston' });

            expect(result).toContain('Dry-run mode');
            expect(result).toContain('Get Weather');
            expect(result).toContain('Location: Boston');
        });

        it('should say so explicitly when no parameters were provided', () => {
            const formatter = new OutputFormatter('compact');
            expect(formatter.formatActionDryRun('Get Weather', {})).toContain('No parameters provided');
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

        // `mj ai audit agent-run <id>` needs the run ID, and the reader needs to know how the run ended.
        it('should carry the run ID, run status and final payload in JSON', () => {
            const formatter = new OutputFormatter('json');
            const result: ExecutionResult = {
                success: true,
                entityName: 'Lead Intake Flow',
                AgentRunID: 'run-123',
                AgentRunStatus: 'Completed',
                result: 'Flow completed - no more paths to follow',
                FinalPayload: { leads: [{ name: 'Ada', score: 92 }] },
                duration: 100,
            };
            const parsed = JSON.parse(formatter.FormatAgentResult(result));
            expect(parsed.AgentRunID).toBe('run-123');
            expect(parsed.AgentRunStatus).toBe('Completed');
            expect(parsed.FinalPayload).toEqual({ leads: [{ name: 'Ada', score: 92 }] });
        });

        it('should show the run ID, status, and audit command in compact mode', () => {
            const formatter = new OutputFormatter('compact');
            const output = formatter.FormatAgentResult({
                success: true,
                entityName: 'Lead Intake Flow',
                AgentRunID: 'run-123',
                AgentRunStatus: 'Completed',
                result: 'Flow completed - no more paths to follow',
                FinalPayload: { leads: 3 },
                duration: 100,
            });
            expect(output).toContain('Run ID: run-123');
            expect(output).toContain('Run status: Completed');
            expect(output).toContain('Final payload:');
            expect(output).toContain('"leads": 3');
            expect(output).toContain('mj ai audit agent-run run-123');
            expect(output).not.toContain('--errors');
        });

        it('should point a failed run at the audit command with --errors', () => {
            const formatter = new OutputFormatter('compact');
            const output = formatter.FormatAgentResult({
                success: false,
                entityName: 'TestAgent',
                AgentRunID: 'run-9',
                AgentRunStatus: 'Failed',
                error: 'Action failed',
                duration: 50,
            });
            expect(output).toContain('Run ID: run-9');
            expect(output).toContain('Run status: Failed');
            expect(output).toContain('mj ai audit agent-run run-9 --errors');
        });

        it('should say a timeout timed out', () => {
            const formatter = new OutputFormatter('compact');
            const output = formatter.FormatAgentResult({
                success: false,
                entityName: 'TestAgent',
                AgentRunID: 'run-9',
                AgentRunStatus: 'Cancelled',
                error: 'Timed out after 1000ms (--timeout).',
                TimedOut: true,
                duration: 1000,
            });
            expect(output).toContain('Agent execution timed out');
            expect(output).toContain('Timed out after 1000ms');
        });

        // --background: the run started the workflow, it did not finish it.
        it('should not claim a dispatched (Paused) run completed', () => {
            const formatter = new OutputFormatter('compact');
            const output = formatter.FormatAgentResult({
                success: true,
                entityName: 'Lead Intake Flow',
                AgentRunID: 'run-1',
                AgentRunStatus: 'Paused',
                result: "Started **Lead Intake** — 3 task(s) running. I'll follow up when it finishes.",
                duration: 100,
            });
            expect(output).toContain('its workflow continues on the task-graph dispatcher');
            expect(output).not.toContain('completed successfully');
        });

        it('should skip an empty payload and cut a huge one short in compact mode', () => {
            const formatter = new OutputFormatter('compact');
            const empty = formatter.FormatAgentResult({ success: true, entityName: 'A', result: 'done', FinalPayload: {}, duration: 1 });
            expect(empty).not.toContain('Final payload:');

            const huge = formatter.FormatAgentResult({
                success: true, entityName: 'A', result: 'done', FinalPayload: { text: 'x'.repeat(10000) }, duration: 1,
            });
            expect(huge).toContain('Final payload:');
            expect(huge).toContain('more characters. Use --format json for the whole payload.');
            expect(huge.length).toBeLessThan(6000);
        });

        it('should add run rows to the table rendering', () => {
            const formatter = new OutputFormatter('table');
            const output = formatter.FormatAgentResult({
                success: true, entityName: 'A', AgentRunID: 'run-5', AgentRunStatus: 'Completed', duration: 1,
            });
            expect(output).toContain('Run ID | run-5');
            expect(output).toContain('Run Status | Completed');
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
