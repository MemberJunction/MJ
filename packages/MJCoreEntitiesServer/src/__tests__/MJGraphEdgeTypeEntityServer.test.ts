import { describe, it, expect } from 'vitest';
import { ValidateGraphEdgeTypeUniqueness } from '../custom/MJGraphEdgeTypeEntityServer.server';

const GRAPH_ID = 'E0000001-0000-0000-0000-000000000001';
const OTHER_GRAPH_ID = 'E0000001-0000-0000-0000-000000000099';

describe('MJGraphEdgeTypeEntityServer (uniqueness invariants)', () => {
    const existingTypes = [
        { ID: 'D0000001-0000-0000-0000-000000000001', GraphID: null, Name: 'Broader Than' },
        { ID: 'D0000001-0000-0000-0000-000000000002', GraphID: GRAPH_ID, Name: 'CustomScopedEdge' },
    ];

    it('refuses a duplicate global (GraphID = null) edge type name case-insensitively', () => {
        const err = ValidateGraphEdgeTypeUniqueness(
            { ID: 'D0000001-0000-0000-0000-000000000099', GraphID: null, Name: 'broader than' },
            existingTypes,
        );
        expect(err).not.toBeNull();
        expect(err?.Source).toBe('Name');
        expect(err?.Message).toContain('global edge types');
    });

    it('refuses a duplicate graph-scoped edge type name in the same graph', () => {
        const err = ValidateGraphEdgeTypeUniqueness(
            { ID: 'D0000001-0000-0000-0000-000000000099', GraphID: GRAPH_ID.toLowerCase(), Name: 'CUSTOMSCOPEDEDGE' },
            existingTypes,
        );
        expect(err).not.toBeNull();
        expect(err?.Source).toBe('Name');
    });

    it('allows the same name in a different graph or when updating the same row', () => {
        expect(
            ValidateGraphEdgeTypeUniqueness(
                { ID: 'D0000001-0000-0000-0000-000000000099', GraphID: OTHER_GRAPH_ID, Name: 'CustomScopedEdge' },
                existingTypes,
            ),
        ).toBeNull();

        expect(
            ValidateGraphEdgeTypeUniqueness(
                { ID: 'D0000001-0000-0000-0000-000000000001', GraphID: null, Name: 'Broader Than' },
                existingTypes,
            ),
        ).toBeNull();
    });
});
