/**
 * Tests for the Database Designer dashboard's pure agent-context shaper
 * (`DatabaseDesigner/database-designer-agent-context.ts`).
 *
 * The helper backs the SAFE, read-only (schema-browse) agent context published by the
 * Database Designer dashboard. It must faithfully forward the browse-state snapshot and
 * derive `HasSearch` from the search term — without depending on Angular or component
 * internals.
 */
import { describe, it, expect } from 'vitest';
import {
    buildDatabaseDesignerAgentContext,
    DatabaseDesignerAgentContextInput,
} from '../DatabaseDesigner/database-designer-agent-context';

const baseInput: DatabaseDesignerAgentContextInput = {
    EntityCount: 12,
    SearchText: '',
    SelectedEntityId: null,
    SelectedEntityName: null,
    ShowModifyPanel: false,
    IsLoading: false,
};

describe('buildDatabaseDesignerAgentContext', () => {
    it('forwards the browse-state snapshot fields verbatim', () => {
        const ctx = buildDatabaseDesignerAgentContext({
            ...baseInput,
            EntityCount: 5,
            SelectedEntityId: 'abc-123',
            SelectedEntityName: 'Invoices',
            ShowModifyPanel: true,
        });
        expect(ctx['EntityCount']).toBe(5);
        expect(ctx['SelectedEntityId']).toBe('abc-123');
        expect(ctx['SelectedEntityName']).toBe('Invoices');
        expect(ctx['ShowModifyPanel']).toBe(true);
    });

    it('derives HasSearch = false when the search term is empty', () => {
        const ctx = buildDatabaseDesignerAgentContext({ ...baseInput, SearchText: '' });
        expect(ctx['HasSearch']).toBe(false);
    });

    it('derives HasSearch = false when the search term is only whitespace', () => {
        const ctx = buildDatabaseDesignerAgentContext({ ...baseInput, SearchText: '   ' });
        expect(ctx['HasSearch']).toBe(false);
    });

    it('derives HasSearch = true when a non-empty search term is present', () => {
        const ctx = buildDatabaseDesignerAgentContext({ ...baseInput, SearchText: 'invoice' });
        expect(ctx['HasSearch']).toBe(true);
        expect(ctx['SearchText']).toBe('invoice');
    });

    it('forwards the IsLoading flag', () => {
        const ctx = buildDatabaseDesignerAgentContext({ ...baseInput, IsLoading: true });
        expect(ctx['IsLoading']).toBe(true);
    });

    it('produces only the documented keys (no leakage)', () => {
        const ctx = buildDatabaseDesignerAgentContext(baseInput);
        expect(Object.keys(ctx).sort()).toEqual(
            ['EntityCount', 'HasSearch', 'IsLoading', 'SearchText', 'SelectedEntityId', 'SelectedEntityName', 'ShowModifyPanel'].sort(),
        );
    });
});
