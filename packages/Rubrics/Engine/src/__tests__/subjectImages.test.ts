import { describe, expect, it } from 'vitest';
import type { RubricVersionSnapshot } from '@memberjunction/rubrics-base';
import { LLMRubricEvaluator, type RubricRunnerRequest } from '../LLMRubricEvaluator.js';
import { BuildSubjectContent, SubjectBody } from '../promptData.js';
import { SelectEvenly } from '../content.js';

function version(): RubricVersionSnapshot {
    return {
        id: 'version', rubricId: 'rubric', notApplicablePolicy: 'ExcludeAndRedistribute', passThreshold: 0.5, scoreDisplayMin: 0, scoreDisplayMax: 100,
        nodes: [{ id: 'a', key: 'grid', name: 'Grid visible', nodeType: 'Criterion', scaleId: 'scale', weight: 1, isAdvisory: false, isGate: false, evidenceRequired: false, rationaleRequired: false, sequence: 0 }],
        scales: [{ id: 'scale', scaleType: 'Levels', higherIsBetter: true, levels: [
            { id: 'miss', label: 'Miss', value: 0, normalizedValue: 0, sequence: 0 },
            { id: 'meets', label: 'Meets', value: 1, normalizedValue: 1, sequence: 1 },
        ] }],
        bands: [],
    };
}

describe('BuildSubjectContent', () => {
    it('is the plain subject message when there are no images', () => {
        const content = BuildSubjectContent({ text: 'hello' });
        expect(typeof content).toBe('string');
        expect(content).toContain('<rubric-subject ');
    });

    it('sends the text first, then each frame behind a block that names it', () => {
        const blocks = BuildSubjectContent({ text: 'hello', images: [
            { label: 'step 3', mimeType: 'image/png', data: 'QUJD' },
            { label: 'final', mimeType: 'image/jpeg', data: 'REVG' },
        ] });
        expect(Array.isArray(blocks)).toBe(true);
        const list = blocks as { type: string; content: string; mimeType?: string }[];
        expect(list.map(block => block.type)).toEqual(['text', 'text', 'image_url', 'text', 'image_url']);
        expect(list[0].content).toContain('hello');
        expect(list[0].content).toContain('Cite a frame by its label.');
        expect(list[1].content).toBe('Frame "step 3":');
        expect(list[2]).toEqual({ type: 'image_url', content: 'data:image/png;base64,QUJD', mimeType: 'image/png' });
        expect(list[4].content).toBe('data:image/jpeg;base64,REVG');
    });

    it('caps the frames at the maximum', () => {
        const images = Array.from({ length: 12 }, (_, i) => ({ label: `step ${i}`, mimeType: 'image/png', data: 'QQ==' }));
        const blocks = BuildSubjectContent({ text: 'x', images }) as { type: string }[];
        expect(blocks.filter(block => block.type === 'image_url')).toHaveLength(8);
    });
});

describe('frame evidence', () => {
    it('keeps a frame that was attached and drops one that was not', async () => {
        const requests: RubricRunnerRequest[] = [];
        const runner = { async run(request: RubricRunnerRequest) {
            requests.push(request);
            return JSON.stringify({ decisions: [{ key: 'grid', level: 'Meets', rationale: 'The grid shows 12 rows.', evidence: [{ frame: 'final' }, { frame: 'step 99' }, { quote: 'not in the text' }] }] });
        } };
        const output = await new LLMRubricEvaluator(runner).EvaluateContent(version(), { text: 'Step 1: opened Users', images: [{ label: 'final', mimeType: 'image/png', data: 'QQ==' }] });
        expect(Array.isArray(requests[0].Subject)).toBe(true);
        expect(output.evidence).toEqual([{ ref: 'frame:final' }]);
        expect(output.droppedQuotes).toBe(2);
        expect(output.normalizedScore).toBe(1);
    });
});

describe('SelectEvenly', () => {
    it('keeps the first and the last and spreads the rest', () => {
        expect(SelectEvenly([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 4)).toEqual([1, 4, 7, 10]);
        expect(SelectEvenly([1, 2, 3], 5)).toEqual([1, 2, 3]);
        expect(SelectEvenly([1, 2, 3], 1)).toEqual([3]);
        expect(SelectEvenly([], 3)).toEqual([]);
    });
});

describe('SubjectBody', () => {
    it('does not put image data into the text', () => {
        expect(SubjectBody({ text: 't', images: [{ label: 'final', mimeType: 'image/png', data: 'ZZZZ' }] })).toBe('t');
    });
});
