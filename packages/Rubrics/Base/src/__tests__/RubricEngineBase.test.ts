import { describe, expect, it } from 'vitest';
import { RubricEngineBase, type RubricCacheSnapshot, type RubricVersionRecord } from '../RubricEngineBase.js';

function version(partial: Partial<RubricVersionRecord> & Pick<RubricVersionRecord, 'id' | 'status'>): RubricVersionRecord {
    return {
        rubricId: 'rubric',
        majorVersion: 1,
        minorVersion: 0,
        patchVersion: 0,
        notApplicablePolicy: 'ExcludeAndRedistribute',
        passThreshold: null,
        minimumCompleteness: null,
        instructions: null,
        scoreDisplayMin: 0,
        scoreDisplayMax: 100,
        nodes: [],
        bands: [],
        ...partial,
    };
}

const snapshot: RubricCacheSnapshot = {
    categories: [{ id: 'cat', name: 'Quality', parentId: null, sequence: 0 }],
    scales: [{
        id: 'scale',
        name: 'Four levels',
        scaleType: 'Levels',
        higherIsBetter: true,
        levels: [{ id: 'high', label: 'High', value: 4, normalizedValue: 1, sequence: 0 }],
    }],
    rubrics: [{ id: 'rubric', name: 'Writing', categoryId: 'cat', status: 'Active' }],
    versions: [
        version({
            id: 'published',
            status: 'Published',
            majorVersion: 1,
            minorVersion: 2,
            patchVersion: 0,
            notApplicablePolicy: 'CountAsZero',
            passThreshold: 0.6,
            minimumCompleteness: 0.8,
            instructions: 'Score the writing.',
            scoreDisplayMin: 0,
            scoreDisplayMax: 100,
            nodes: [{
                id: 'criterion',
                key: 'clarity',
                name: 'Clarity',
                nodeType: 'Criterion',
                scaleId: 'scale',
                weight: 1,
                isAdvisory: false,
                isGate: false,
                evidenceRequired: false,
                rationaleRequired: false,
                sequence: 0,
                anchors: [{ scaleLevelId: 'high', descriptor: 'Easy to follow' }],
            }],
            bands: [{ id: 'band', label: 'Pass', minScore: 0.6, maxScore: 1, displayTone: 'Success', sequence: 0 }],
        }),
        version({
            id: 'draft',
            status: 'Draft',
            majorVersion: null,
            nodes: [{
                id: 'draft-criterion',
                key: 'clarity',
                name: 'Clarity draft',
                nodeType: 'Criterion',
                scaleId: 'scale',
                weight: 1,
                isAdvisory: false,
                isGate: false,
                evidenceRequired: false,
                rationaleRequired: false,
                sequence: 0,
            }],
        }),
        version({ id: 'older', status: 'Published', majorVersion: 1, minorVersion: 0, patchVersion: 0 }),
    ],
    agentRubrics: [{ id: 'link', agentId: 'agent', rubricId: 'rubric', isDefault: true, status: 'Active', priority: 10 }],
};

describe('RubricEngineBase', () => {
    it('caches a published version with its tree and does not cache a draft', () => {
        const engine = new RubricEngineBase();
        engine.replaceCache(snapshot);

        const published = engine.getPublishedVersion('published');
        expect(published).not.toBeNull();
        expect(published?.nodes).toHaveLength(1);
        expect(published?.nodes[0].key).toBe('clarity');
        expect(published?.nodes[0].anchors?.[0].descriptor).toBe('Easy to follow');
        expect(published?.bands[0].label).toBe('Pass');
        expect(published?.scales).toHaveLength(1);
        expect(published?.scales[0].levels[0].normalizedValue).toBe(1);
        expect(published?.notApplicablePolicy).toBe('CountAsZero');
        expect(published?.passThreshold).toBe(0.6);
        expect(published?.minimumCompleteness).toBe(0.8);
        expect(published?.instructions).toBe('Score the writing.');
        expect(published?.scoreDisplayMin).toBe(0);
        expect(published?.scoreDisplayMax).toBe(100);

        expect(engine.getPublishedVersion('draft')).toBeNull();
        expect(engine.getPublishedVersions('rubric').map(item => item.id)).toEqual(['published', 'older']);
        expect(engine.getLatestPublishedVersion('rubric')?.id).toBe('published');
        expect(engine.getCategory('cat')?.name).toBe('Quality');
        expect(engine.getScale('scale')?.levels).toHaveLength(1);
        expect(engine.getRubric('rubric')?.name).toBe('Writing');
        expect(engine.getAgentRubrics('agent')).toHaveLength(1);
    });
});
