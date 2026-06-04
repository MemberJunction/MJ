import { describe, it, expect } from 'vitest';
import { summarizePipelineStages } from '../coerce';
import { PipelineStepRecord } from '../pipeline.types';

function step(toolName: string): PipelineStepRecord {
    return {
        index: 0,
        toolName,
        providerKind: 'Transform',
        inputSize: 0,
        outputSize: 0,
        durationMs: 0,
        success: true,
        logRef: { providerKind: 'Transform' },
    };
}

describe('summarizePipelineStages', () => {
    it('joins the stage chain with arrows', () => {
        const label = summarizePipelineStages(['get_rows', 'where', 'select'].map(step));
        expect(label).toBe('get_rows → where → select');
    });

    it('elides the middle when there are many stages', () => {
        const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
        const label = summarizePipelineStages(names.map(step));
        expect(label).toBe('a → b → c → d → e → …(3 more)');
    });

    it('handles an empty step list', () => {
        expect(summarizePipelineStages([])).toBe('empty pipeline');
    });
});
