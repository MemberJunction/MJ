import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RubricOracle, RubricOracleContent } from '../oracles/RubricOracle.js';

describe('RubricOracle content', () => {
    it('sends the driver output before the test run row is saved', async () => {
        const seen: { content?: { data?: Record<string, unknown> } }[] = [];
        const oracle = new RubricOracle({
            async EvaluateRecord(request) {
                seen.push(request);
                return { evaluationId: 'eval', score: 1, outcome: 'Passed', criteria: [] };
            },
        });
        await oracle.evaluate({
            test: { ID: 'test', InputDefinition: { question: 'q' } } as never,
            expectedOutput: 'yes',
            actualOutput: 'shipped',
            testRunId: 'run',
            contextUser: { ID: 'user' } as never,
        }, { rubricId: 'rubric' });
        expect(seen[0].content?.data).toEqual({ input: { question: 'q' }, expectedOutput: 'yes', actualOutput: 'shipped' });
        expect(RubricOracleContent({ actualOutput: 'shipped' }).text).toBe('shipped');
    });

    it('maps each built-in subject onto a column the generated entity actually has', () => {
        const source = readFileSync(new URL('../../../../MJCoreEntities/src/generated/entities/__mj.ts', import.meta.url), 'utf8');
        const shape = (name: string) => {
            const start = source.indexOf(`export const ${name}`);
            const end = source.indexOf('export const ', start + 20);
            return source.slice(start, end);
        };
        expect(shape('MJTestRunSchema')).toContain('InputData:');
        expect(shape('MJTestRunSchema')).toContain('ActualOutputData:');
        expect(shape('MJAIAgentRunSchema')).toContain('FinalPayload:');
        expect(shape('MJAIAgentRunStepSchema')).toContain('AgentRunID:');
        expect(shape('MJConversationSchema')).toContain('Description:');
        expect(shape('MJConversationDetailSchema')).toContain('ConversationID:');
        expect(shape('MJAIPromptRunSchema')).toContain('Messages:');
    });
});
