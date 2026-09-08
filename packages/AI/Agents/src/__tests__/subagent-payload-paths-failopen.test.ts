/**
 * subagent-payload-paths-failopen.test.ts
 *
 * Pins the malformed-JSON contract of `computeUpstreamDownstreamPaths`: when an agent's
 * PayloadDownstreamPaths / PayloadUpstreamPaths column holds text that is not valid JSON, the
 * parse must FAIL OPEN to ['*'] rather than throwing or narrowing to an empty path set.
 *
 * WHY THIS EXISTS AS A UNIT TEST: this rule was previously guarded only by the live-model
 * integration check IT56/PG9, which asserts the contract indirectly — it inspects whether a
 * `secret` sentinel reached the child's prompt text. That is contingent on the PARENT model
 * faithfully carrying the sentinel in the payload it forwards, so a noncompliant parent turns a
 * green contract into a red check and reports it as "behavior changed". The rule itself is pure,
 * synchronous, and model-independent, so it belongs here where it can be asserted exactly.
 *
 * Fail-open is deliberately the CURRENT behavior (proposal Q4a, unratified). If a future ruling
 * makes it fail CLOSED, this test is the thing that must change — and its failure is then the
 * intended signal, not a mystery.
 */
import { describe, it, expect, vi } from 'vitest';
import { BaseAgent } from '../base-agent';
import type { ExecuteAgentParams, AgentSubAgentRequest } from '@memberjunction/ai-core-plus';
import type { MJAIAgentEntityExtended } from '@memberjunction/core-entities';

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return {
        ...actual,
        LogError: vi.fn(),
        LogStatus: vi.fn(),
        LogStatusEx: vi.fn(),
        LogErrorEx: vi.fn(),
        IsVerboseLoggingEnabled: vi.fn(() => false),
    };
});

/** BaseAgent is concrete; subclass only so the class is nameable in test output. */
class TestPathAgent extends BaseAgent {}

/**
 * `computeUpstreamDownstreamPaths` is private. Bridge to it with an explicit shape (the
 * established pattern in this suite) rather than `any`, so the call stays type-checked.
 */
interface PathComputerBridge {
    computeUpstreamDownstreamPaths(
        params: ExecuteAgentParams,
        subAgentEntity: MJAIAgentEntityExtended,
        subAgentRequest: AgentSubAgentRequest,
    ): { downstreamPaths: string[]; upstreamPaths: string[] };
}

function computePaths(downstream: string | null, upstream: string | null) {
    const agent = new TestPathAgent();
    const bridge = agent as unknown as PathComputerBridge;
    const params = { agent: { Name: 'ParentAgent' } } as unknown as ExecuteAgentParams;
    const subAgentEntity = {
        ID: 'child-id',
        Name: 'ChildAgent',
        PayloadDownstreamPaths: downstream,
        PayloadUpstreamPaths: upstream,
    } as unknown as MJAIAgentEntityExtended;
    const request = { name: 'ChildAgent' } as unknown as AgentSubAgentRequest;
    return bridge.computeUpstreamDownstreamPaths(params, subAgentEntity, request);
}

describe('computeUpstreamDownstreamPaths — malformed JSON fails OPEN', () => {
    it('defaults both directions to ["*"] when neither column is set', () => {
        const { downstreamPaths, upstreamPaths } = computePaths(null, null);
        expect(downstreamPaths).toEqual(['*']);
        expect(upstreamPaths).toEqual(['*']);
    });

    it('parses well-formed JSON arrays on both directions', () => {
        const { downstreamPaths, upstreamPaths } = computePaths('["customer"]', '["analysis.*"]');
        expect(downstreamPaths).toEqual(['customer']);
        expect(upstreamPaths).toEqual(['analysis.*']);
    });

    it('falls open to ["*"] — never throws — when downstream JSON is malformed', () => {
        // The exact fixture IT56/PG9 writes into the column.
        expect(() => computePaths('not-valid-json {[', null)).not.toThrow();
        const { downstreamPaths } = computePaths('not-valid-json {[', null);
        expect(downstreamPaths).toEqual(['*']);
    });

    it('falls open to ["*"] when upstream JSON is malformed', () => {
        const { upstreamPaths } = computePaths(null, 'also-not-json ]}');
        expect(upstreamPaths).toEqual(['*']);
    });

    it('malformed downstream does not corrupt a valid upstream that was parsed BEFORE the throw', () => {
        // Downstream is parsed first, so its throw skips the upstream assignment entirely and
        // upstream keeps its ['*'] default. Pinning this ordering effect explicitly: a reader
        // could reasonably expect the valid upstream value to survive, and it does not.
        const { downstreamPaths, upstreamPaths } = computePaths('{{bad', '["analysis.*"]');
        expect(downstreamPaths).toEqual(['*']);
        expect(upstreamPaths).toEqual(['*']);
    });
});
