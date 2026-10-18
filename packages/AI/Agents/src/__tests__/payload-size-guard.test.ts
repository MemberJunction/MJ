import { describe, expect, it } from 'vitest';
import { BaseAgent } from '../base-agent';
import { DEFAULT_ABSOLUTE_MAX_PAYLOAD_BYTES, PayloadSizeGuard } from '../payload-size-guard';
import type {
    AgentTreeBudget,
    ExecuteAgentParams,
    MJAIAgentEntityExtended,
    MJAIAgentRunEntityExtended,
} from '@memberjunction/ai-core-plus';

class GuardrailProbeAgent extends BaseAgent {
    public EvaluateRunGuardrails<P>(
        params: ExecuteAgentParams,
        agentRun: MJAIAgentRunEntityExtended,
        currentPayload?: P
    ) {
        return this.hasExceededAgentRunGuardrails(params, agentRun, currentPayload);
    }

    public EvaluateTreeBudget(params?: ExecuteAgentParams) {
        return this.checkTreeBudgetLimit(params);
    }

    public EnsureBudget(params?: ExecuteAgentParams): AgentTreeBudget {
        return this.ensureTreeBudget(params);
    }
}

function buildAgentStub(): MJAIAgentEntityExtended {
    const stub: Partial<MJAIAgentEntityExtended> = {
        MaxCostPerRun: null,
        MaxTokensPerRun: null,
        MaxIterationsPerRun: null,
        MaxTimePerRun: null,
    };
    return stub as MJAIAgentEntityExtended;
}

function buildRunStub(): MJAIAgentRunEntityExtended {
    const stub: Partial<MJAIAgentRunEntityExtended> = {
        Steps: [],
        TotalCost: 0,
        TotalTokensUsed: 0,
        TotalPromptIterations: 1,
        StartedAt: new Date(),
    };
    return stub as MJAIAgentRunEntityExtended;
}

describe('PayloadSizeGuard & BaseAgent byte-ceiling containment', () => {
    describe('PayloadSizeGuard.MeasureBytes & Evaluate', () => {
        it('returns 0 bytes for null or undefined payloads', () => {
            expect(PayloadSizeGuard.MeasureBytes(null)).toBe(0);
            expect(PayloadSizeGuard.MeasureBytes(undefined)).toBe(0);
        });

        it('measures UTF-8 byte length accurately for strings and structured JSON objects', () => {
            expect(PayloadSizeGuard.MeasureBytes('hello')).toBe(5);
            expect(PayloadSizeGuard.MeasureBytes('🚀')).toBe(4);
            const obj = { rows: ['a', 'b', 'c'], count: 3 };
            expect(PayloadSizeGuard.MeasureBytes(obj)).toBe(Buffer.byteLength(JSON.stringify(obj), 'utf8'));
        });

        it('defaults to 16 MiB (DEFAULT_ABSOLUTE_MAX_PAYLOAD_BYTES)', () => {
            expect(DEFAULT_ABSOLUTE_MAX_PAYLOAD_BYTES).toBe(16 * 1024 * 1024);
            const smallEval = PayloadSizeGuard.Evaluate({ status: 'ok' });
            expect(smallEval.exceeded).toBe(false);
            expect(smallEval.limitBytes).toBe(16 * 1024 * 1024);
        });

        it('measures a payload too large for V8 to serialize as Infinity, so the ceiling fails closed', () => {
            // JSON.stringify throws RangeError ('Invalid string length') past V8's maximum string
            // length — exactly the runaway payload the guard exists to stop.
            const unserializable = { toJSON(): never { throw new RangeError('Invalid string length'); } };
            expect(PayloadSizeGuard.MeasureBytes(unserializable)).toBe(Number.POSITIVE_INFINITY);

            const verdict = PayloadSizeGuard.Evaluate(unserializable, DEFAULT_ABSOLUTE_MAX_PAYLOAD_BYTES);
            expect(verdict.exceeded).toBe(true);
            expect(verdict.reason).toContain('more than V8 can serialize');
            expect(verdict.reason).not.toContain('Infinity');
        });

        it('measures a circular payload as 0 instead of throwing', () => {
            const circular: Record<string, unknown> = { name: 'loop' };
            circular.self = circular;
            expect(PayloadSizeGuard.MeasureBytes(circular)).toBe(0);
        });

        it('trips on every payload when the limit is 0, matching the cost and token guardrails', () => {
            expect(PayloadSizeGuard.Evaluate(null, 0).exceeded).toBe(true);
            expect(PayloadSizeGuard.Evaluate({ a: 1 }, 0).exceeded).toBe(true);
        });

        it('trips when serialized payload reaches or exceeds limitBytes', () => {
            const largePayload = { data: 'x'.repeat(2048) };
            const verdict = PayloadSizeGuard.Evaluate(largePayload, 1024);
            expect(verdict.exceeded).toBe(true);
            expect(verdict.type).toBe('payload');
            expect(verdict.limitBytes).toBe(1024);
            expect(verdict.currentBytes).toBeGreaterThan(2048);
            expect(verdict.reason).toContain('Maximum payload size limit of 1.0 KiB (1024 bytes) exceeded');
        });
    });

    describe('BaseAgent.hasExceededAgentRunGuardrails payload containment', () => {
        it('allows payloads below maxPayloadBytes and records peakPayloadBytes on treeBudget', async () => {
            const probe = new GuardrailProbeAgent();
            const run = buildRunStub();
            const params: ExecuteAgentParams = {
                agent: buildAgentStub(),
                conversationMessages: [],
                payload: { message: 'compact state' },
                maxPayloadBytes: 4096,
            };

            const verdict = await probe.EvaluateRunGuardrails(params, run);
            expect(verdict.exceeded).toBe(false);
            expect(params.treeBudget?.peakPayloadBytes).toBeGreaterThan(0);
            expect(params.treeBudget?.peakPayloadBytes).toBeLessThan(4096);
        });

        it('halts execution with type="payload" when currentPayload exceeds maxPayloadBytes', async () => {
            const probe = new GuardrailProbeAgent();
            const run = buildRunStub();
            const params: ExecuteAgentParams = {
                agent: buildAgentStub(),
                conversationMessages: [],
                payload: { initial: true },
                maxPayloadBytes: 512,
            };

            const oversizedStepPayload = { records: Array.from({ length: 50 }, (_, idx) => `row-${idx}-${'a'.repeat(20)}`) };
            const verdict = await probe.EvaluateRunGuardrails(params, run, oversizedStepPayload);

            expect(verdict.exceeded).toBe(true);
            expect(verdict.type).toBe('payload');
            expect(verdict.limit).toBe(512);
            expect(verdict.current).toBeGreaterThan(512);
            expect(verdict.reason).toContain('Maximum payload size limit');
        });

        it('enforces maxTreePayloadBytes across a shared parent/sub-agent AgentTreeBudget', async () => {
            const probe = new GuardrailProbeAgent();
            const run = buildRunStub();
            const params: ExecuteAgentParams = {
                agent: buildAgentStub(),
                conversationMessages: [],
                payload: { chunk: 'z'.repeat(1200) },
                maxPayloadBytes: 10 * 1024, // per-run ceiling allows 10 KiB
                maxTreePayloadBytes: 1024, // tree-wide ceiling is 1 KiB
            };

            const verdict = await probe.EvaluateRunGuardrails(params, run);
            expect(verdict.exceeded).toBe(true);
            expect(verdict.type).toBe('payload');
            expect(verdict.limit).toBe(1024);
            expect(params.treeBudget?.breachedReason).toContain('Agent tree payload byte budget exceeded');
        });
    });
});
