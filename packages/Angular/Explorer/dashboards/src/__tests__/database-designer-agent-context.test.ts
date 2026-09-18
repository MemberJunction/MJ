/**
 * Tests for the Database Designer dashboard's pure agent-integration helpers
 * (`DatabaseDesigner/database-designer-agent-context.ts`).
 *
 * These back the SAFE, read-only (schema-browse) agent context + tools published by the
 * Database Designer dashboard:
 *   - buildDatabaseDesignerAgentContext: browse-state snapshot → agent context object
 *     (entity counts, filters, selected-entity detail, bounded available-entity DISPLAY
 *     names, schema groupings).
 *   - resolveEntityByIdOrName / buildEntityNotFoundError: tolerant id→name→display-name→
 *     contains resolver (so the agent can say "AI Models", not "MJ: AI Models").
 *   - entityDisplayName / stripMJPrefix: DISPLAY-name derivation.
 * None of these depend on Angular or component internals.
 */
import { describe, it, expect } from 'vitest';
import {
    BuildDatabaseDesignerAgentContext,
    BuildEntityNotFoundError,
    DATABASE_DESIGNER_NAME_LIST_CAP,
    DatabaseDesignerAgentContextInput,
    EntityDisplayName,
    EntityNameCandidate,
    ResolveEntityByIdOrName,
    StripMJPrefix,
} from '../DatabaseDesigner/database-designer-agent-context';

const baseInput: DatabaseDesignerAgentContextInput = {
    EntityCount: 12,
    FilteredEntityCount: 12,
    SearchText: '',
    SchemaFilter: '',
    SelectedEntityId: null,
    SelectedEntityName: null,
    SelectedEntityDisplayName: null,
    SelectedEntitySchema: null,
    SelectedEntityTable: null,
    SelectedEntityFieldCount: null,
    SelectedEntityFields: [],
    RelatedEntities: [],
    ShowModifyPanel: false,
    IsLoading: false,
    AvailableEntityNames: [],
    SchemaGroups: [],
};

describe('stripMJPrefix / entityDisplayName', () => {
    it('strips the "MJ: " prefix when present', () => {
        expect(StripMJPrefix('MJ: AI Models')).toBe('AI Models');
        expect(StripMJPrefix('Invoices')).toBe('Invoices');
    });

    it('prefers an explicit DisplayName, else the prefix-stripped Name', () => {
        expect(EntityDisplayName('MJ: AI Models')).toBe('AI Models');
        expect(EntityDisplayName('MJ: AI Models', 'Models')).toBe('Models');
        expect(EntityDisplayName('Invoices', null)).toBe('Invoices');
    });
});

describe('buildDatabaseDesignerAgentContext', () => {
    it('forwards the browse-state snapshot fields verbatim', () => {
        const ctx = BuildDatabaseDesignerAgentContext({
            ...baseInput,
            EntityCount: 5,
            FilteredEntityCount: 5,
            SelectedEntityId: 'abc-123',
            SelectedEntityName: 'Invoices',
            SelectedEntityDisplayName: 'Invoices',
            ShowModifyPanel: true,
        });
        expect(ctx['EntityCount']).toBe(5);
        expect(ctx['SelectedEntityId']).toBe('abc-123');
        expect(ctx['SelectedEntityName']).toBe('Invoices');
        expect(ctx['SelectedEntityDisplayName']).toBe('Invoices');
        expect(ctx['ShowModifyPanel']).toBe(true);
    });

    it('derives HasSearch false for empty / whitespace and true for a real term', () => {
        expect(BuildDatabaseDesignerAgentContext({ ...baseInput, SearchText: '' })['HasSearch']).toBe(false);
        expect(BuildDatabaseDesignerAgentContext({ ...baseInput, SearchText: '   ' })['HasSearch']).toBe(false);
        const ctx = BuildDatabaseDesignerAgentContext({ ...baseInput, SearchText: 'invoice' });
        expect(ctx['HasSearch']).toBe(true);
        expect(ctx['SearchText']).toBe('invoice');
    });

    it('derives HasActiveFilters from search, schema filter, or a narrowed count', () => {
        expect(BuildDatabaseDesignerAgentContext(baseInput)['HasActiveFilters']).toBe(false);
        expect(BuildDatabaseDesignerAgentContext({ ...baseInput, SchemaFilter: '__mj_UDT' })['HasActiveFilters']).toBe(true);
        expect(BuildDatabaseDesignerAgentContext({ ...baseInput, FilteredEntityCount: 3 })['HasActiveFilters']).toBe(true);
    });

    it('surfaces the schema filter only when set', () => {
        expect(BuildDatabaseDesignerAgentContext(baseInput)['SchemaFilter']).toBeUndefined();
        expect(BuildDatabaseDesignerAgentContext({ ...baseInput, SchemaFilter: '__mj_UDT' })['SchemaFilter']).toBe('__mj_UDT');
    });

    it('includes selected-entity detail (schema, table, field count, fields, related) only when selected', () => {
        const ctx = BuildDatabaseDesignerAgentContext({
            ...baseInput,
            SelectedEntityId: 'e1',
            SelectedEntityName: 'MJ: AI Models',
            SelectedEntityDisplayName: 'AI Models',
            SelectedEntitySchema: '__mj',
            SelectedEntityTable: 'AIModel',
            SelectedEntityFieldCount: 2,
            SelectedEntityFields: [
                { Name: 'Name', Type: 'NVARCHAR(255)', IsNullable: false },
                { Name: 'Description', Type: 'NVARCHAR(MAX)', IsNullable: true },
            ],
            RelatedEntities: [{ Name: 'AI Model Vendors', RelationshipType: 'One To Many' }],
        });
        expect(ctx['SelectedEntitySchema']).toBe('__mj');
        expect(ctx['SelectedEntityTable']).toBe('AIModel');
        expect(ctx['SelectedEntityFieldCount']).toBe(2);
        expect(ctx['SelectedEntityFields']).toHaveLength(2);
        expect(ctx['RelatedEntities']).toEqual([{ Name: 'AI Model Vendors', RelationshipType: 'One To Many' }]);
        expect(ctx['RelatedEntityCount']).toBe(1);
    });

    it('omits selected-entity detail when nothing is selected', () => {
        const ctx = BuildDatabaseDesignerAgentContext({
            ...baseInput,
            SelectedEntitySchema: 'ignored',
            SelectedEntityFields: [{ Name: 'X', Type: 'INT', IsNullable: false }],
            RelatedEntities: [{ Name: 'Y', RelationshipType: 'One To Many' }],
        });
        expect(ctx['SelectedEntitySchema']).toBeUndefined();
        expect(ctx['SelectedEntityFields']).toBeUndefined();
        expect(ctx['RelatedEntities']).toBeUndefined();
    });

    it('bounds the available-entity list and reports the true total when truncated', () => {
        const names = Array.from({ length: DATABASE_DESIGNER_NAME_LIST_CAP + 7 }, (_, i) => `Entity ${i}`);
        const ctx = BuildDatabaseDesignerAgentContext({ ...baseInput, AvailableEntityNames: names });
        expect((ctx['AvailableEntities'] as string[]).length).toBe(DATABASE_DESIGNER_NAME_LIST_CAP);
        expect(ctx['AvailableEntityCount']).toBe(names.length);
    });

    it('does not report AvailableEntityCount when the list fits under the cap', () => {
        const ctx = BuildDatabaseDesignerAgentContext({ ...baseInput, AvailableEntityNames: ['A', 'B'] });
        expect(ctx['AvailableEntities']).toEqual(['A', 'B']);
        expect(ctx['AvailableEntityCount']).toBeUndefined();
    });

    it('bounds schema groups and reports the count only when over the cap', () => {
        const groups = Array.from({ length: DATABASE_DESIGNER_NAME_LIST_CAP + 3 }, (_, i) => ({ SchemaName: `s${i}`, EntityCount: i }));
        const ctx = BuildDatabaseDesignerAgentContext({ ...baseInput, SchemaGroups: groups });
        expect((ctx['SchemaGroups'] as unknown[]).length).toBe(DATABASE_DESIGNER_NAME_LIST_CAP);
        expect(ctx['SchemaGroupCount']).toBe(groups.length);

        const few = BuildDatabaseDesignerAgentContext({ ...baseInput, SchemaGroups: [{ SchemaName: 's', EntityCount: 1 }] });
        expect(few['SchemaGroupCount']).toBeUndefined();
    });
});

describe('resolveEntityByIdOrName', () => {
    const candidates: EntityNameCandidate[] = [
        { ID: 'id-ai', Name: 'MJ: AI Models', DisplayName: null },
        { ID: 'id-inv', Name: 'Invoices', DisplayName: null },
        { ID: 'id-cust', Name: 'Customers', DisplayName: 'Clients' },
    ];

    it('resolves by exact ID (case-insensitive)', () => {
        expect(ResolveEntityByIdOrName('ID-AI', candidates)?.ID).toBe('id-ai');
    });

    it('resolves by registered name (case-insensitive)', () => {
        expect(ResolveEntityByIdOrName('invoices', candidates)?.ID).toBe('id-inv');
    });

    it('resolves the DISPLAY name the user reads ("AI Models", not "MJ: AI Models")', () => {
        expect(ResolveEntityByIdOrName('AI Models', candidates)?.ID).toBe('id-ai');
        expect(ResolveEntityByIdOrName('ai models', candidates)?.ID).toBe('id-ai');
    });

    it('resolves an input that itself carries the "MJ: " prefix', () => {
        expect(ResolveEntityByIdOrName('MJ: AI Models', candidates)?.ID).toBe('id-ai');
    });

    it('prefers an explicit DisplayName over the registered name', () => {
        expect(ResolveEntityByIdOrName('Clients', candidates)?.ID).toBe('id-cust');
    });

    it('falls back to a partial (contains) match on the display name', () => {
        expect(ResolveEntityByIdOrName('model', candidates)?.ID).toBe('id-ai');
    });

    it('returns null on a miss / blank input', () => {
        expect(ResolveEntityByIdOrName('nonexistent', candidates)).toBeNull();
        expect(ResolveEntityByIdOrName('   ', candidates)).toBeNull();
    });
});

describe('buildEntityNotFoundError', () => {
    it('lists a bounded sample of available DISPLAY names', () => {
        const candidates: EntityNameCandidate[] = [
            { ID: '1', Name: 'MJ: AI Models', DisplayName: null },
            { ID: '2', Name: 'Invoices', DisplayName: null },
        ];
        const msg = BuildEntityNotFoundError('bogus', candidates);
        expect(msg).toContain('bogus');
        expect(msg).toContain('AI Models');
        expect(msg).toContain('Invoices');
        expect(msg).not.toContain('MJ: AI Models');
    });

    it('handles an empty candidate list gracefully', () => {
        expect(BuildEntityNotFoundError('x', [])).toContain('(none)');
    });
});
