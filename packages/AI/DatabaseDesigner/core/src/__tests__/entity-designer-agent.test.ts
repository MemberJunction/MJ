import { describe, it, expect, vi } from 'vitest';
import type { ExecuteAgentParams, BaseAgentNextStep, AIPromptRunResult } from '@memberjunction/ai-core-plus';
import type { MJAIAgentTypeEntity } from '@memberjunction/core-entities';

// ─── Mock all external dependencies ─────────────────────────────────────────

vi.mock('@memberjunction/ai-agents', () => ({
    BaseAgent: class BaseAgent {
        // Default implementation — intercepted by DatabaseDesignerAgent overrides
        protected async determineNextStep<P>(
            _params: unknown,
            _agentType: unknown,
            _promptResult: unknown,
            currentPayload: P,
        ): Promise<unknown> {
            return { step: 'Chat', terminate: false, newPayload: currentPayload };
        }

        // ContentToString normalises both plain strings and content block arrays
        protected contentToString(content: unknown): string {
            if (typeof content === 'string') return content;
            if (Array.isArray(content)) {
                return (content as Array<{ text?: string } | string>)
                    .map(c => (typeof c === 'string' ? c : (c as { text?: string })?.text ?? ''))
                    .join('');
            }
            return '';
        }

        // logStatus is called by DatabaseDesignerAgent; no-op in tests
        protected logStatus(_msg: string, _verbose: boolean, _params: unknown): void {}
    },
}));

vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => (_target: unknown) => _target,
}));

vi.mock('@memberjunction/core-entities', () => ({
    MJAIAgentTypeEntity: class MJAIAgentTypeEntity {},
}));

// ─── Import after mocks ──────────────────────────────────────────────────────

import { DatabaseDesignerAgent } from '../agents/database-designer-agent.js';
import type { DatabaseDesignerPayload } from '../interfaces.js';

// ─── Test helpers ────────────────────────────────────────────────────────────

/** Expose the protected determineNextStep method for direct testing. */
type TestableAgent = {
    determineNextStep<P>(
        params: ExecuteAgentParams,
        agentType: MJAIAgentTypeEntity,
        promptResult: AIPromptRunResult,
        currentPayload: P,
    ): Promise<BaseAgentNextStep<P>>;
};

function makeAgent(): TestableAgent {
    return new DatabaseDesignerAgent() as unknown as TestableAgent;
}

function makeParams(messages: Array<{ role: 'user' | 'assistant'; content: string }> = []): ExecuteAgentParams {
    return { conversationMessages: messages } as unknown as ExecuteAgentParams;
}

/** Typed view of a Sub-Agent step result — used to assert sub-agent name. */
type SubAgentStep = BaseAgentNextStep<unknown> & {
    subAgent: { name: string; message: string };
};

const BLANK_AGENT_TYPE = {} as MJAIAgentTypeEntity;
const BLANK_PROMPT_RESULT = {} as AIPromptRunResult;

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('DatabaseDesignerAgent.determineNextStep', () => {

    describe('Intercept 1 — subagent fast path (bypass Requirements Analyst)', () => {
        it('routes to Schema Designer when mode=subagent, tableSpec present, no SchemaDesign', async () => {
            const agent = makeAgent();
            const payload: DatabaseDesignerPayload = {
                mode: 'subagent',
                callerContext: {
                    agentName: 'Planning Designer Agent',
                    tableSpecs: [{ name: 'Customer Orders', description: 'Tracks orders placed by customers' }],
                },
            };

            const result = await agent.determineNextStep(makeParams(), BLANK_AGENT_TYPE, BLANK_PROMPT_RESULT, payload) as SubAgentStep;

            expect(result.step).toBe('Sub-Agent');
            expect(result.subAgent.name).toBe('Database Schema Designer');
        });

        it('message to Schema Designer embeds the tableSpec as JSON', async () => {
            const agent = makeAgent();
            const tableSpec = { name: 'Orders', description: 'Order records', schemaName: 'sales' };
            const payload: DatabaseDesignerPayload = {
                mode: 'subagent',
                callerContext: { agentName: 'Planning Designer Agent', tableSpecs: [tableSpec] },
            };

            const result = await agent.determineNextStep(makeParams(), BLANK_AGENT_TYPE, BLANK_PROMPT_RESULT, payload) as SubAgentStep;

            expect(result.subAgent.message).toContain('"name": "Orders"');
        });

        it('includes "User approval was already obtained" when subagentConfirmedByParent=true', async () => {
            const agent = makeAgent();
            const payload: DatabaseDesignerPayload = {
                mode: 'subagent',
                callerContext: {
                    agentName: 'Planning Designer Agent',
                    tableSpecs: [{ name: 'Orders', description: 'Order records' }],
                    subagentConfirmedByParent: true,
                },
            };

            const result = await agent.determineNextStep(makeParams(), BLANK_AGENT_TYPE, BLANK_PROMPT_RESULT, payload) as SubAgentStep;

            expect(result.subAgent.message).toContain('User approval was already obtained');
        });

        it('does NOT fire when SchemaDesign is already in the payload (design already done)', async () => {
            const agent = makeAgent();
            const payload: DatabaseDesignerPayload = {
                mode: 'subagent',
                callerContext: {
                    agentName: 'Planning Designer Agent',
                    tableSpecs: [{ name: 'Orders', description: 'Order records' }],
                },
                SchemaDesign: { Tables: [{ TableDefinition: { SchemaName: '__mj_UDT', TableName: 'Orders', EntityName: 'Orders', Columns: [] }, ModificationType: 'create' }] }, // already designed
            };

            const result = await agent.determineNextStep(makeParams(), BLANK_AGENT_TYPE, BLANK_PROMPT_RESULT, payload);

            expect(result.step).toBe('Chat'); // falls through to super
        });

        it('does NOT fire when callerContext.tableSpec is absent (lenient fallback)', async () => {
            const agent = makeAgent();
            const payload: DatabaseDesignerPayload = { mode: 'subagent' }; // no callerContext

            const result = await agent.determineNextStep(makeParams(), BLANK_AGENT_TYPE, BLANK_PROMPT_RESULT, payload);
            expect(result.step).toBe('Chat');
        });

        it('does NOT fire in standalone mode', async () => {
            const agent = makeAgent();
            const payload: DatabaseDesignerPayload = { mode: 'standalone' };

            const result = await agent.determineNextStep(makeParams(), BLANK_AGENT_TYPE, BLANK_PROMPT_RESULT, payload);
            expect(result.step).toBe('Chat');
        });
    });

    describe('Intercept 2 — create_now approval forces Schema Validator', () => {
        it('routes to Schema Validator when last user message contains create_now', async () => {
            const agent = makeAgent();
            const messages = [
                { role: 'assistant' as const, content: 'Here is the design' },
                { role: 'user' as const, content: 'Does this design look right?: create_now' },
            ];

            const result = await agent.determineNextStep(makeParams(messages), BLANK_AGENT_TYPE, BLANK_PROMPT_RESULT, {}) as SubAgentStep;

            expect(result.step).toBe('Sub-Agent');
            expect(result.subAgent.name).toBe('Database Schema Validator');
        });

        it('does NOT fire when the last user message does not contain create_now', async () => {
            const agent = makeAgent();
            const messages = [{ role: 'user' as const, content: 'Change the description column type' }];

            const result = await agent.determineNextStep(makeParams(messages), BLANK_AGENT_TYPE, BLANK_PROMPT_RESULT, {});
            expect(result.step).toBe('Chat');
        });

        it('does NOT fire when conversation is empty', async () => {
            const agent = makeAgent();
            const result = await agent.determineNextStep(makeParams([]), BLANK_AGENT_TYPE, BLANK_PROMPT_RESULT, {});
            expect(result.step).toBe('Chat');
        });

        it('uses the LAST user message — ignores create_now in earlier messages', async () => {
            const agent = makeAgent();
            const messages = [
                { role: 'user' as const, content: 'create_now' }, // earlier message
                { role: 'assistant' as const, content: 'OK, let me revise' },
                { role: 'user' as const, content: 'Change something first' }, // LAST user message
            ];

            const result = await agent.determineNextStep(makeParams(messages), BLANK_AGENT_TYPE, BLANK_PROMPT_RESULT, {});
            expect(result.step).toBe('Chat'); // last user msg has no create_now
        });

        it('does NOT fire when create_now appears only in an assistant message', async () => {
            const agent = makeAgent();
            const messages = [
                { role: 'assistant' as const, content: 'Click create_now to proceed' },
                { role: 'user' as const, content: 'OK looks good but change the name' },
            ];

            const result = await agent.determineNextStep(makeParams(messages), BLANK_AGENT_TYPE, BLANK_PROMPT_RESULT, {});
            expect(result.step).toBe('Chat');
        });
    });

    describe('Intercept 3 — validation passed forces Schema Builder', () => {
        it('routes to Schema Builder when ValidationResult.Valid=true and no DatabaseDesignerResult', async () => {
            const agent = makeAgent();
            const payload: DatabaseDesignerPayload = {
                ValidationResult: { Valid: true, Errors: [], Warnings: [] },
                // DatabaseDesignerResult absent — build not yet started
            };

            const result = await agent.determineNextStep(makeParams(), BLANK_AGENT_TYPE, BLANK_PROMPT_RESULT, payload) as SubAgentStep;

            expect(result.step).toBe('Sub-Agent');
            expect(result.subAgent.name).toBe('Database Schema Builder');
        });

        it('does NOT fire when ValidationResult.Valid=false', async () => {
            const agent = makeAgent();
            const payload: DatabaseDesignerPayload = {
                ValidationResult: { Valid: false, Errors: ['naming conflict'], Warnings: [] },
            };

            const result = await agent.determineNextStep(makeParams(), BLANK_AGENT_TYPE, BLANK_PROMPT_RESULT, payload);
            expect(result.step).toBe('Chat');
        });

        it('does NOT fire when DatabaseDesignerResult is already present (build already ran)', async () => {
            const agent = makeAgent();
            const payload: DatabaseDesignerPayload = {
                ValidationResult: { Valid: true, Errors: [], Warnings: [] },
                DatabaseDesignerResult: { Success: true, Results: [{ Success: true, EntityName: 'Customer Orders' }] },
            };

            const result = await agent.determineNextStep(makeParams(), BLANK_AGENT_TYPE, BLANK_PROMPT_RESULT, payload);
            expect(result.step).toBe('Chat');
        });

        it('does NOT fire on the first agent turn when payload is null', async () => {
            const agent = makeAgent();
            // null payload = very first turn; no ValidationResult yet
            const result = await agent.determineNextStep(makeParams(), BLANK_AGENT_TYPE, BLANK_PROMPT_RESULT, null as unknown as DatabaseDesignerPayload);
            expect(result.step).toBe('Chat');
        });
    });

    describe('Intercept priority ordering', () => {
        it('Intercept 1 (subagent) fires before Intercept 2 (create_now)', async () => {
            // Both conditions met: subagent mode + create_now in last message
            // Intercept 1 fires first → Schema Designer (not Validator)
            const agent = makeAgent();
            const payload: DatabaseDesignerPayload = {
                mode: 'subagent',
                callerContext: {
                    agentName: 'Planning Designer Agent',
                    tableSpecs: [{ name: 'Orders', description: 'Order records' }],
                },
                // No SchemaDesign yet — intercept 1 will fire
            };
            const messages = [{ role: 'user' as const, content: 'create_now' }];

            const result = await agent.determineNextStep(makeParams(messages), BLANK_AGENT_TYPE, BLANK_PROMPT_RESULT, payload) as SubAgentStep;

            expect(result.subAgent.name).toBe('Database Schema Designer');
        });
    });
});
