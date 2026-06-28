/**
 * Tests for the Entity Admin dashboard's pure agent-context helper:
 * - buildEntityAdminAgentContext: ERD-browser state snapshot → agent context object
 */
import { describe, it, expect } from 'vitest';
import {
    buildEntityAdminAgentContext,
    EntityAdminAgentContextInput,
} from '../EntityAdmin/entity-admin-agent-context';

function makeInput(overrides: Partial<EntityAdminAgentContextInput> = {}): EntityAdminAgentContextInput {
    return {
        TotalEntityCount: 200,
        FilteredEntityCount: 200,
        SelectedEntityId: null,
        SelectedEntityName: null,
        FilterPanelVisible: true,
        ...overrides,
    };
}

describe('buildEntityAdminAgentContext', () => {
    it('passes through the salient ERD-browser fields', () => {
        const ctx = buildEntityAdminAgentContext(makeInput({
            TotalEntityCount: 200,
            FilteredEntityCount: 12,
            SelectedEntityId: 'AAA-111',
            SelectedEntityName: 'Users',
            FilterPanelVisible: false,
        }));
        expect(ctx['TotalEntityCount']).toBe(200);
        expect(ctx['FilteredEntityCount']).toBe(12);
        expect(ctx['SelectedEntityId']).toBe('AAA-111');
        expect(ctx['SelectedEntityName']).toBe('Users');
        expect(ctx['FilterPanelVisible']).toBe(false);
    });

    it('reports HasActiveFilters=true when the filtered count is below the total', () => {
        const ctx = buildEntityAdminAgentContext(makeInput({ TotalEntityCount: 200, FilteredEntityCount: 50 }));
        expect(ctx['HasActiveFilters']).toBe(true);
    });

    it('reports HasActiveFilters=false when nothing is filtered out', () => {
        const ctx = buildEntityAdminAgentContext(makeInput({ TotalEntityCount: 200, FilteredEntityCount: 200 }));
        expect(ctx['HasActiveFilters']).toBe(false);
    });

    it('reports HasActiveFilters=false when both counts are zero (no data loaded yet)', () => {
        const ctx = buildEntityAdminAgentContext(makeInput({ TotalEntityCount: 0, FilteredEntityCount: 0 }));
        expect(ctx['HasActiveFilters']).toBe(false);
    });

    it('represents the no-selection (home) state with null selection fields', () => {
        const ctx = buildEntityAdminAgentContext(makeInput({ SelectedEntityId: null, SelectedEntityName: null }));
        expect(ctx['SelectedEntityId']).toBeNull();
        expect(ctx['SelectedEntityName']).toBeNull();
    });
});
