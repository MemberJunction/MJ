import { describe, it, expect } from 'vitest';
import {
    BuildUserRoutinesAgentContext,
    ResolveRoutineByIDOrName,
    RoutineSummaryRow,
    USER_ROUTINE_NAME_LIST_CAP,
} from '../UserRoutines/user-routines-agent-context';

function makeRoutines(count: number): RoutineSummaryRow[] {
    return Array.from({ length: count }, (_, i) => ({
        ID: `00000000-0000-0000-0000-${(i + 1).toString().padStart(12, '0')}`,
        Name: `Routine ${i + 1}`,
        Status: 'Active',
    }));
}

describe('buildUserRoutinesAgentContext', () => {
    it('publishes counts, filters, view state, and bounded names', () => {
        const routines = makeRoutines(3);
        const ctx = BuildUserRoutinesAgentContext({
            ActiveView: 'list',
            SearchText: 'digest',
            StatusFilter: 'Active',
            TotalCount: 3,
            FilteredCount: 1,
            SelectedRoutineID: null,
            Routines: routines,
        });
        expect(ctx['ActiveView']).toBe('list');
        expect(ctx['SearchText']).toBe('digest');
        expect(ctx['TotalRoutineCount']).toBe(3);
        expect(ctx['FilteredRoutineCount']).toBe(1);
        expect(ctx['VisibleRoutineNames']).toEqual(['Routine 1', 'Routine 2', 'Routine 3']);
        expect(ctx['VisibleRoutineNamesTruncated']).toBeUndefined();
    });

    it('caps the name list and flags truncation', () => {
        const routines = makeRoutines(USER_ROUTINE_NAME_LIST_CAP + 5);
        const ctx = BuildUserRoutinesAgentContext({
            ActiveView: 'list',
            SearchText: '',
            StatusFilter: 'all',
            TotalCount: routines.length,
            FilteredCount: routines.length,
            SelectedRoutineID: null,
            Routines: routines,
        });
        expect((ctx['VisibleRoutineNames'] as string[]).length).toBe(USER_ROUTINE_NAME_LIST_CAP);
        expect(ctx['VisibleRoutineNamesTruncated']).toBe(true);
        expect(ctx['VisibleRoutineNamesTotal']).toBe(routines.length);
    });

    it('resolves the selected routine name (case-insensitive id match)', () => {
        const routines = makeRoutines(2);
        const ctx = BuildUserRoutinesAgentContext({
            ActiveView: 'history',
            SearchText: '',
            StatusFilter: 'all',
            TotalCount: 2,
            FilteredCount: 2,
            SelectedRoutineID: routines[1].ID.toUpperCase(),
            Routines: routines,
        });
        expect(ctx['SelectedRoutineName']).toBe('Routine 2');
    });

    it('never publishes payload/message/recipient fields (safety shape)', () => {
        const ctx = BuildUserRoutinesAgentContext({
            ActiveView: 'list',
            SearchText: '',
            StatusFilter: 'all',
            TotalCount: 0,
            FilteredCount: 0,
            SelectedRoutineID: null,
            Routines: [],
        });
        const keys = Object.keys(ctx).map((k) => k.toLowerCase());
        for (const banned of ['payload', 'message', 'email', 'recipient', 'skill']) {
            expect(keys.some((k) => k.includes(banned))).toBe(false);
        }
    });
});

describe('resolveRoutineByIDOrName', () => {
    const routines: RoutineSummaryRow[] = [
        { ID: 'aaaaaaaa-0000-0000-0000-000000000001', Name: 'Morning Digest', Status: 'Active' },
        { ID: 'aaaaaaaa-0000-0000-0000-000000000002', Name: 'Weekly Renewals Watch', Status: 'Paused' },
    ];

    it('resolves by exact ID (case-insensitive)', () => {
        const result = ResolveRoutineByIDOrName(routines, 'AAAAAAAA-0000-0000-0000-000000000001');
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.value.Name).toBe('Morning Digest');
    });

    it('resolves by exact name then partial contains', () => {
        expect(ResolveRoutineByIDOrName(routines, 'morning digest').ok).toBe(true);
        const partial = ResolveRoutineByIDOrName(routines, 'renewals');
        expect(partial.ok).toBe(true);
        if (partial.ok) expect(partial.value.Name).toBe('Weekly Renewals Watch');
    });

    it('fails tolerantly with available names on a miss', () => {
        const result = ResolveRoutineByIDOrName(routines, 'nonexistent');
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toContain('Morning Digest');
    });

    it('fails on ambiguous partial matches listing candidates', () => {
        // 'e' appears in both routine names → ambiguous
        const ambiguous = ResolveRoutineByIDOrName(routines, 'e');
        expect(ambiguous.ok).toBe(false);
        if (!ambiguous.ok) expect(ambiguous.error).toContain('multiple');
    });

    it('rejects non-string input', () => {
        expect(ResolveRoutineByIDOrName(routines, 42).ok).toBe(false);
        expect(ResolveRoutineByIDOrName(routines, '').ok).toBe(false);
    });
});
