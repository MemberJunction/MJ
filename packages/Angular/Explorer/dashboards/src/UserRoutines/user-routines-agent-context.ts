/**
 * Pure, unit-testable helpers for the Routines dashboard's agent context + tools.
 *
 * 🚨 SAFETY BOUNDARY 🚨
 * The Routines surface exposes ONLY navigation / filter / search / select / refresh
 * tools to the agent. DELIBERATELY NOT exposed (mutations stay human-driven in the
 * UI): create-SAVE / edit-SAVE (the agent may only OPEN the editor), delete,
 * pause/resume (Status writes), and run-now (queues a real dispatcher execution).
 * Context exposes only counts, active filters, view state, and bounded display
 * names — never payloads, messages, or recipient emails.
 */

/** Cap applied to every published name list. */
export const USER_ROUTINE_NAME_LIST_CAP = 25;

/** Minimal routine shape the pure helpers operate on. */
export interface RoutineSummaryRow {
    ID: string;
    Name: string;
    Status: string;
}

/** State snapshot the dashboard passes to the context builder. */
export interface UserRoutinesAgentState {
    ActiveView: 'list' | 'editor' | 'history';
    SearchText: string;
    StatusFilter: string;
    TotalCount: number;
    FilteredCount: number;
    SelectedRoutineID: string | null;
    Routines: RoutineSummaryRow[];
}

/** Bounded, secret-free context published via SetAgentContext. */
export function buildUserRoutinesAgentContext(state: UserRoutinesAgentState): Record<string, unknown> {
    const names = state.Routines.map((r) => r.Name).filter((n) => !!n);
    const bounded = names.slice(0, USER_ROUTINE_NAME_LIST_CAP);
    const selected = state.SelectedRoutineID
        ? state.Routines.find((r) => equalsIgnoreCase(r.ID, state.SelectedRoutineID as string)) ?? null
        : null;

    const context: Record<string, unknown> = {
        ActiveView: state.ActiveView,
        SearchText: state.SearchText,
        StatusFilter: state.StatusFilter,
        TotalRoutineCount: state.TotalCount,
        FilteredRoutineCount: state.FilteredCount,
        SelectedRoutineID: state.SelectedRoutineID,
        SelectedRoutineName: selected?.Name ?? null,
        VisibleRoutineNames: bounded,
    };
    if (names.length > bounded.length) {
        context['VisibleRoutineNamesTruncated'] = true;
        context['VisibleRoutineNamesTotal'] = names.length;
    }
    return context;
}

/**
 * Tolerant routine resolver: exact ID → exact name → partial name contains
 * (all case-insensitive). Returns a structured failure listing available names
 * (bounded) on a miss.
 */
export function resolveRoutineByIDOrName(
    routines: RoutineSummaryRow[],
    rawRef: unknown
): { ok: true; value: RoutineSummaryRow } | { ok: false; error: string } {
    if (typeof rawRef !== 'string' || rawRef.trim().length === 0) {
        return { ok: false, error: `Provide the routine's ID or name. ${availableNames(routines)}` };
    }
    const ref = rawRef.trim();
    const byId = routines.find((r) => equalsIgnoreCase(r.ID, ref));
    if (byId) {
        return { ok: true, value: byId };
    }
    const byName = routines.find((r) => equalsIgnoreCase(r.Name, ref));
    if (byName) {
        return { ok: true, value: byName };
    }
    const contains = routines.filter((r) => r.Name.toLowerCase().includes(ref.toLowerCase()));
    if (contains.length === 1) {
        return { ok: true, value: contains[0] };
    }
    if (contains.length > 1) {
        return {
            ok: false,
            error: `'${ref}' matches multiple routines: ${contains
                .slice(0, USER_ROUTINE_NAME_LIST_CAP)
                .map((r) => r.Name)
                .join(', ')}. Be more specific.`,
        };
    }
    return { ok: false, error: `No routine matches '${ref}'. ${availableNames(routines)}` };
}

function availableNames(routines: RoutineSummaryRow[]): string {
    if (routines.length === 0) {
        return 'There are no routines yet.';
    }
    const names = routines.slice(0, USER_ROUTINE_NAME_LIST_CAP).map((r) => r.Name);
    const suffix = routines.length > USER_ROUTINE_NAME_LIST_CAP ? ', …' : '';
    return `Available routines: ${names.join(', ')}${suffix}`;
}

function equalsIgnoreCase(a: string, b: string): boolean {
    return a.trim().toLowerCase() === b.trim().toLowerCase();
}
