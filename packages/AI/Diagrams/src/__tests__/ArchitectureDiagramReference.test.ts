import { describe, it, expect } from 'vitest';
import { GetArchitectureDiagramReference, ARCHITECTURE_DIAGRAM_REFERENCE_TOPICS } from '../ArchitectureDiagramReference';
import { ARCHITECTURE_DIAGRAM_TYPES } from '../ArchitectureDiagramRenderer';

describe('GetArchitectureDiagramReference', () => {
    it.each(ARCHITECTURE_DIAGRAM_TYPES)('serves the %s schema together with the common schema', (type) => {
        const result = GetArchitectureDiagramReference('schema', type);
        expect(result.Success).toBe(true);
        if (result.Success) {
            expect(result.Content).toContain(`// schemas/${type}.schema.json`);
            expect(result.Content).toContain('// schemas/common.schema.json');
        }
    });

    it.each(ARCHITECTURE_DIAGRAM_TYPES)('serves a parseable %s example of that type', (type) => {
        const result = GetArchitectureDiagramReference('example', type);
        expect(result.Success).toBe(true);
        if (result.Success) {
            expect((JSON.parse(result.Content) as { diagram_type: string }).diagram_type).toBe(type);
        }
    });

    it.each(ARCHITECTURE_DIAGRAM_REFERENCE_TOPICS.filter((t) => t !== 'schema' && t !== 'example'))('serves the %s reference', (topic) => {
        const result = GetArchitectureDiagramReference(topic);
        expect(result.Success && result.Content.length > 500).toBe(true);
    });

    it.each([
        ['nope', undefined],
        ['schema', undefined],
        ['example', 'mindmap'],
    ])('rejects topic %s with type %s', (topic, type) => {
        expect(GetArchitectureDiagramReference(topic, type)).toMatchObject({ Success: false, ErrorCode: 'INVALID_INPUT' });
    });
});
