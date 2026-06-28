/**
 * Tests for the Entity Admin dashboard's pure agent-context helpers:
 * - buildEntityAdminAgentContext: ERD-browser state snapshot → agent context object
 * - resolveEntityByIdOrName / entityDisplayName / stripMJPrefix: tolerant id→display-name resolution
 * - buildEntityNotFoundError: tolerant miss error with a bounded sample
 */
import { describe, it, expect } from 'vitest';
import {
    buildEntityAdminAgentContext,
    buildEntityNotFoundError,
    entityDisplayName,
    resolveEntityByIdOrName,
    stripMJPrefix,
    EntityAdminAgentContextInput,
    EntityNameCandidate,
    ENTITY_ADMIN_NAME_LIST_CAP,
} from '../EntityAdmin/entity-admin-agent-context';

function makeInput(overrides: Partial<EntityAdminAgentContextInput> = {}): EntityAdminAgentContextInput {
    return {
        TotalEntityCount: 200,
        FilteredEntityCount: 200,
        SelectedEntityId: null,
        SelectedEntityName: null,
        SelectedEntityDisplayName: null,
        SelectedEntitySchema: null,
        SelectedEntityDescription: null,
        SelectedEntityFieldCount: null,
        RelatedEntities: [],
        FilterPanelVisible: true,
        SchemaFilter: null,
        SearchText: '',
        StatusFilter: null,
        AvailableEntityNames: [],
        SchemaGroups: [],
        ...overrides,
    };
}

describe('buildEntityAdminAgentContext', () => {
    it('passes through the salient ERD-browser fields', () => {
        const ctx = buildEntityAdminAgentContext(makeInput({
            TotalEntityCount: 200,
            FilteredEntityCount: 12,
            SelectedEntityId: 'AAA-111',
            SelectedEntityName: 'MJ: AI Models',
            SelectedEntityDisplayName: 'AI Models',
            FilterPanelVisible: false,
        }));
        expect(ctx['TotalEntityCount']).toBe(200);
        expect(ctx['FilteredEntityCount']).toBe(12);
        expect(ctx['SelectedEntityId']).toBe('AAA-111');
        expect(ctx['SelectedEntityName']).toBe('MJ: AI Models');
        expect(ctx['SelectedEntityDisplayName']).toBe('AI Models');
        expect(ctx['FilterPanelVisible']).toBe(false);
    });

    it('reports HasActiveFilters=true when the filtered count is below the total', () => {
        const ctx = buildEntityAdminAgentContext(makeInput({ TotalEntityCount: 200, FilteredEntityCount: 50 }));
        expect(ctx['HasActiveFilters']).toBe(true);
    });

    it('reports HasActiveFilters=true when a filter value is set even with equal counts', () => {
        const ctx = buildEntityAdminAgentContext(makeInput({ TotalEntityCount: 5, FilteredEntityCount: 5, SearchText: 'user' }));
        expect(ctx['HasActiveFilters']).toBe(true);
        expect(ctx['SearchText']).toBe('user');
    });

    it('reports HasActiveFilters=false when nothing is filtered out', () => {
        const ctx = buildEntityAdminAgentContext(makeInput({ TotalEntityCount: 200, FilteredEntityCount: 200 }));
        expect(ctx['HasActiveFilters']).toBe(false);
    });

    it('reports HasActiveFilters=false when both counts are zero (no data loaded yet)', () => {
        const ctx = buildEntityAdminAgentContext(makeInput({ TotalEntityCount: 0, FilteredEntityCount: 0 }));
        expect(ctx['HasActiveFilters']).toBe(false);
    });

    it('represents the no-selection (home) state with null selection fields and no detail', () => {
        const ctx = buildEntityAdminAgentContext(makeInput({ SelectedEntityId: null, SelectedEntityName: null }));
        expect(ctx['SelectedEntityId']).toBeNull();
        expect(ctx['SelectedEntityName']).toBeNull();
        expect('SelectedEntitySchema' in ctx).toBe(false);
        expect('RelatedEntities' in ctx).toBe(false);
    });

    it('surfaces selected-entity detail and bounded relationship summaries when selected', () => {
        const ctx = buildEntityAdminAgentContext(makeInput({
            SelectedEntityId: 'E1',
            SelectedEntityName: 'Users',
            SelectedEntityDisplayName: 'Users',
            SelectedEntitySchema: '__mj',
            SelectedEntityDescription: 'Application users',
            SelectedEntityFieldCount: 14,
            RelatedEntities: [
                { Name: 'User Roles', RelationshipType: 'One To Many' },
                { Name: 'User Views', RelationshipType: 'One To Many' },
            ],
        }));
        expect(ctx['SelectedEntitySchema']).toBe('__mj');
        expect(ctx['SelectedEntityDescription']).toBe('Application users');
        expect(ctx['SelectedEntityFieldCount']).toBe(14);
        expect(ctx['RelatedEntities']).toEqual([
            { Name: 'User Roles', RelationshipType: 'One To Many' },
            { Name: 'User Views', RelationshipType: 'One To Many' },
        ]);
        expect(ctx['RelatedEntityCount']).toBe(2);
    });

    it('caps the available-entity name list and surfaces the true total when truncated', () => {
        const names = Array.from({ length: ENTITY_ADMIN_NAME_LIST_CAP + 3 }, (_, i) => `Entity ${i}`);
        const ctx = buildEntityAdminAgentContext(makeInput({ AvailableEntityNames: names }));
        expect((ctx['AvailableEntities'] as string[]).length).toBe(ENTITY_ADMIN_NAME_LIST_CAP);
        expect(ctx['AvailableEntityCount']).toBe(names.length);
    });

    it('publishes the schema-grouping landscape', () => {
        const ctx = buildEntityAdminAgentContext(makeInput({
            SchemaGroups: [
                { SchemaName: '__mj', EntityCount: 120 },
                { SchemaName: 'crm', EntityCount: 30 },
            ],
        }));
        expect(ctx['SchemaGroups']).toEqual([
            { SchemaName: '__mj', EntityCount: 120 },
            { SchemaName: 'crm', EntityCount: 30 },
        ]);
    });

    it('surfaces active filter values only when set', () => {
        const ctx = buildEntityAdminAgentContext(makeInput({ SchemaFilter: 'crm', StatusFilter: 'Active' }));
        expect(ctx['SchemaFilter']).toBe('crm');
        expect(ctx['StatusFilter']).toBe('Active');
        expect('SearchText' in ctx).toBe(false);
    });
});

describe('stripMJPrefix / entityDisplayName', () => {
    it('strips the "MJ: " prefix', () => {
        expect(stripMJPrefix('MJ: AI Models')).toBe('AI Models');
        expect(stripMJPrefix('Users')).toBe('Users');
    });

    it('prefers DisplayName, else the prefix-stripped Name', () => {
        expect(entityDisplayName('MJ: AI Models', null)).toBe('AI Models');
        expect(entityDisplayName('MJ: AI Models', 'My Models')).toBe('My Models');
        expect(entityDisplayName('Users')).toBe('Users');
    });
});

describe('resolveEntityByIdOrName', () => {
    const candidates: EntityNameCandidate[] = [
        { ID: 'AAA-111', Name: 'MJ: AI Models', DisplayName: null },
        { ID: 'BBB-222', Name: 'Users', DisplayName: null },
        { ID: 'CCC-333', Name: 'MJ: ML Models', DisplayName: 'Machine Learning Models' },
    ];

    it('resolves by exact ID (case-insensitive)', () => {
        expect(resolveEntityByIdOrName('aaa-111', candidates)?.Name).toBe('MJ: AI Models');
    });

    it('resolves by exact registered name (case-insensitive)', () => {
        expect(resolveEntityByIdOrName('users', candidates)?.ID).toBe('BBB-222');
    });

    it('resolves by display name the user sees (prefix stripped)', () => {
        expect(resolveEntityByIdOrName('AI Models', candidates)?.ID).toBe('AAA-111');
    });

    it('resolves by an explicit DisplayName', () => {
        expect(resolveEntityByIdOrName('Machine Learning Models', candidates)?.ID).toBe('CCC-333');
    });

    it('resolves an input that itself carries the "MJ: " prefix', () => {
        expect(resolveEntityByIdOrName('MJ: AI Models', candidates)?.ID).toBe('AAA-111');
    });

    it('falls back to a partial (contains) match on the display name', () => {
        expect(resolveEntityByIdOrName('Model', candidates)?.ID).toBe('AAA-111');
    });

    it('returns null on a miss and on empty input', () => {
        expect(resolveEntityByIdOrName('Nope', candidates)).toBeNull();
        expect(resolveEntityByIdOrName('   ', candidates)).toBeNull();
    });
});

describe('buildEntityNotFoundError', () => {
    it('lists a bounded sample of display names', () => {
        const candidates: EntityNameCandidate[] = [
            { ID: '1', Name: 'MJ: AI Models', DisplayName: null },
            { ID: '2', Name: 'Users', DisplayName: null },
        ];
        const msg = buildEntityNotFoundError('Foo', candidates);
        expect(msg).toContain('No entity matches "Foo"');
        expect(msg).toContain('AI Models');
        expect(msg).toContain('Users');
    });

    it('handles an empty candidate list', () => {
        expect(buildEntityNotFoundError('Foo', [])).toContain('(none)');
    });
});
