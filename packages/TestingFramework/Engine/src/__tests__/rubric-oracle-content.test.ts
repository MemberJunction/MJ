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

    it('sends the driver subject content when the driver supplies it', async () => {
        const seen: { content?: unknown }[] = [];
        const oracle = new RubricOracle({
            async EvaluateRecord(request) {
                seen.push(request);
                return { evaluationId: 'eval', score: 1, outcome: 'Passed', criteria: [] };
            },
        });
        await oracle.evaluate({
            test: { ID: 'test' } as never,
            actualOutput: { finalScreenshot: 'AAAA' },
            subjectContent: { text: 'Step 1: opened the page', data: { goal: 'open the page' } },
            testRunId: 'run',
            contextUser: { ID: 'user' } as never,
        }, { rubricId: 'rubric' });
        expect(seen[0].content).toEqual({ text: 'Step 1: opened the page', data: { goal: 'open the page' } });
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

    it('extracts text from string actualOutput or object keys message, response, text', () => {
        expect(RubricOracleContent({ actualOutput: 'plain text' }).text).toBe('plain text');
        expect(RubricOracleContent({ actualOutput: { message: 'from message' } }).text).toBe('from message');
        expect(RubricOracleContent({ actualOutput: { response: 'from response' } }).text).toBe('from response');
        expect(RubricOracleContent({ actualOutput: { text: 'from text' } }).text).toBe('from text');
        expect(RubricOracleContent({ actualOutput: { message: 'first', response: 'second' } }).text).toBe('first');
        expect(RubricOracleContent({ actualOutput: { response: 'first', text: 'second' } }).text).toBe('first');
        expect(RubricOracleContent({ actualOutput: { unhandledKey: 'value' } }).text).toBeUndefined();
        expect(RubricOracleContent({ actualOutput: {} }).text).toBeUndefined();
        expect(RubricOracleContent({ actualOutput: null }).text).toBeUndefined();
        expect(RubricOracleContent({ actualOutput: undefined }).text).toBeUndefined();
    });
});
