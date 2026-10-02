import type { ComponentUtilities } from '@memberjunction/interactive-component-types';
import { type DataTable, NormalizeToTables } from '@memberjunction/core';

/**
 * @fileoverview Remembering what a component fetched, so a crash is not a dead end.
 *
 * ## Why capture at all
 *
 * A component that throws mid-render produces an error card. But by the time most components
 * throw, they have already fetched their data successfully — the failure is in the drawing, not the
 * reading. Discarding those rows to show "this component ran into an error" throws away the thing
 * the user actually came for.
 *
 * `MJReactComponent` wraps `utilities` for the same reason and calls the result a fallback
 * snapshot. This is the mobile half, with the same intent and one difference: here it is *shown*
 * rather than only offered to a host, because on a phone there is no second pane to put it in.
 *
 * ## Why a wrapper rather than a change inside RuntimeUtilities
 *
 * Capturing belongs to the host that wants a fallback, not to the data layer. A component's
 * `RunView` should behave identically whether or not anyone is recording it, and `RuntimeUtilities`
 * is shared by every surface — including the server-side test harness, which has no use for this.
 */

/** One recorded result, kept in the order the component asked for it. */
export type CapturedResult = {
    /** What produced it — an entity name for a view, a query name for a query. */
    Source: string;
    /** The rows as returned. */
    Rows: Record<string, unknown>[];
};

/**
 * How many results to keep.
 *
 * A component that polls could otherwise grow this without bound for as long as it stays on
 * screen. The last few are what a fallback can usefully show; older ones are superseded anyway.
 */
const MAX_CAPTURED = 8;

/** Collects results a component fetched, newest last. */
export class CapturedData {
    private readonly results: CapturedResult[] = [];

    /**
     * Records one result.
     *
     * @param source Where it came from.
     * @param rows The returned rows; anything non-array is ignored rather than stored as junk.
     */
    public Record(source: string, rows: unknown): void {
        if (!Array.isArray(rows) || rows.length === 0) return;
        this.results.push({ Source: source, Rows: rows as Record<string, unknown>[] });
        if (this.results.length > MAX_CAPTURED) this.results.shift();
    }

    /** True when there is something worth showing. */
    public get HasData(): boolean {
        return this.results.length > 0;
    }

    /**
     * The captured results as `DataTable`s.
     *
     * Built through `NormalizeToTables` in core — the same function the Data artifact renderer uses
     * — so captured rows and query-builder output are described identically rather than by two
     * column-inference rules that disagree about what a column is.
     */
    public ToTables(): DataTable[] {
        return this.results.flatMap((r) =>
            NormalizeToTables({ tables: [{ name: r.Source, rows: r.Rows }] }),
        );
    }
}

/**
 * Wraps a utilities object so every view and query result is recorded.
 *
 * Referentially distinct from the original and side-effect free otherwise: the component sees the
 * same promises resolving to the same values, and a capture failure can never change what it got.
 *
 * @param utilities The real utilities to delegate to.
 * @param captured Where to record results.
 */
export function WrapUtilitiesWithCapture(
    utilities: ComponentUtilities,
    captured: CapturedData,
): ComponentUtilities {
    /** Records a result without ever letting a capture error reach the component. */
    const record = (source: string, result: unknown): void => {
        try {
            const rows = (result as { Results?: unknown })?.Results;
            captured.Record(source, rows);
        } catch {
            /* capturing is best effort — see the doc comment */
        }
    };

    return {
        ...utilities,
        rv: {
            ...utilities.rv,
            RunView: async (params, contextUser) => {
                const result = await utilities.rv.RunView(params, contextUser);
                record(String(params?.EntityName ?? 'View'), result);
                return result;
            },
            RunViews: async (params, contextUser) => {
                const results = await utilities.rv.RunViews(params, contextUser);
                (results ?? []).forEach((r, i) =>
                    record(String(params?.[i]?.EntityName ?? `View ${i + 1}`), r),
                );
                return results;
            },
        },
        rq: {
            ...utilities.rq,
            RunQuery: async (params, contextUser) => {
                const result = await utilities.rq.RunQuery(params, contextUser);
                record(String(params?.QueryName ?? params?.QueryID ?? 'Query'), result);
                return result;
            },
        },
    };
}
