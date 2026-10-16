/**
 * runquery-rendering-matrix.ts — the cap-and-paging matrix every `runquery-rendering` case runs
 * through, and the row comparison it uses.
 *
 * A case names the rows its query must return, computed in TypeScript from the fixture model.
 * {@link RunCapAndPagingMatrix} then calls the query with every combination of `MaxRows` and
 * `StartRow` the bundle covers and checks each response's rows and `TotalRowCount` against that
 * expected list. Mismatches are collected rather than thrown one at a time, so a failing check
 * reports every broken combination at once.
 */
import { RunQuery } from '@memberjunction/core';
import type { RunQueryParams, RunQueryResult, UserInfo } from '@memberjunction/core';

/** A normalized row: column name to a comparable scalar. */
export type ComparableRow = Record<string, string | number | boolean | null>;

/** What a call is expected to return. */
export interface ExpectedResult {
    /** Expected rows, projected onto the compared columns. */
    Rows: ComparableRow[];
    /** Whether row order is part of the expectation. */
    Ordered: boolean;
}

/** How to call the query under test; the matrix adds `MaxRows` and `StartRow`. */
export type QueryCall = Omit<RunQueryParams, 'MaxRows' | 'StartRow'>;

/** Normalizes one database value so SQL Server and PostgreSQL results compare equal. */
export function NormalizeValue(value: unknown): string | number | boolean | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (typeof value === 'bigint') return Number(value);
    if (value instanceof Date) return normalizeDate(value);
    const text = String(value);
    return /^-?\d+$/.test(text) && text.length < 16 ? Number(text) : text;
}

/** A DATE comes back as midnight UTC from one driver and local midnight from the other. */
function normalizeDate(value: Date): string {
    if (value.getUTCHours() === 0 && value.getUTCMinutes() === 0) {
        return value.toISOString().slice(0, 10);
    }
    const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 10);
}

/** Projects result rows onto the compared columns, normalizing each value. */
export function ProjectRows(rows: ReadonlyArray<Record<string, unknown>>, columns: readonly string[]): ComparableRow[] {
    return rows.map(row => {
        const projected: ComparableRow = {};
        for (const column of columns) {
            projected[column] = NormalizeValue(readColumn(row, column));
        }
        return projected;
    });
}

/** Reads a column case-insensitively; PostgreSQL may fold an unquoted alias to lower case. */
function readColumn(row: Record<string, unknown>, column: string): unknown {
    if (column in row) return row[column];
    const key = Object.keys(row).find(k => k.toLowerCase() === column.toLowerCase());
    return key === undefined ? undefined : row[key];
}

function rowText(row: ComparableRow): string {
    return JSON.stringify(row);
}

/** Describes how `actual` differs from `expected`, or returns null when they match. */
export function DescribeRowMismatch(actual: ComparableRow[], expected: ComparableRow[], ordered: boolean): string | null {
    const a = actual.map(rowText);
    const e = expected.map(rowText);
    if (!ordered) {
        a.sort();
        e.sort();
    }
    if (a.length === e.length && a.every((v, i) => v === e[i])) return null;
    const firstDiff = a.findIndex((v, i) => v !== e[i]);
    const at = firstDiff === -1 ? Math.min(a.length, e.length) : firstDiff;
    return `got ${a.length} row(s), expected ${e.length}; first difference at ${at}: got ${a[at] ?? '(none)'}, expected ${e[at] ?? '(none)'}`;
}

/** One combination the matrix runs, with what it should return. */
interface MatrixStep {
    Label: string;
    MaxRows?: number;
    StartRow?: number;
    Expected: ComparableRow[];
    /** `whole`: the step returns the entire result; `page`: one page of a walk; `slice`: any other subset. */
    Kind: 'whole' | 'page' | 'slice';
}

/** The calls the matrix makes for a result of `expected.length` rows. */
function buildSteps(expected: ComparableRow[]): MatrixStep[] {
    const n = expected.length;
    const page = Math.max(1, Math.ceil(n / 3));
    const steps: MatrixStep[] = [
        { Label: 'no MaxRows', Expected: expected, Kind: 'whole' },
        { Label: 'MaxRows 0', MaxRows: 0, Expected: expected, Kind: 'whole' },
        { Label: 'MaxRows 1', MaxRows: 1, Expected: expected.slice(0, 1), Kind: n <= 1 ? 'whole' : 'slice' },
        { Label: `MaxRows ${Math.max(n, 1)} (result size)`, MaxRows: Math.max(n, 1), Expected: expected, Kind: 'whole' },
        { Label: `MaxRows ${n + 25} (larger than result)`, MaxRows: n + 25, Expected: expected, Kind: 'whole' }
    ];
    for (let start = 0; start < n; start += page) {
        steps.push({ Label: `page StartRow ${start} MaxRows ${page}`, StartRow: start, MaxRows: page, Expected: expected.slice(start, start + page), Kind: 'page' });
    }
    steps.push({ Label: `page past the end (StartRow ${n + page})`, StartRow: n + page, MaxRows: page, Expected: [], Kind: 'slice' });
    const half = Math.floor(n / 2);
    steps.push({ Label: `StartRow ${half} without MaxRows`, StartRow: half, Expected: expected.slice(half), Kind: half === 0 ? 'whole' : 'slice' });
    return steps;
}

/**
 * Runs one query through every cap and paging combination and returns a description of each
 * combination whose rows or total differ from the expectation. Empty means every call matched.
 *
 * When the expectation is unordered, each response is compared as a multiset, and the pages
 * must additionally be disjoint and add up to the whole result.
 */
export async function RunCapAndPagingMatrix(
    label: string,
    call: QueryCall,
    expected: ExpectedResult,
    columns: readonly string[],
    user: UserInfo
): Promise<string[]> {
    const failures: string[] = [];
    const pageRows: ComparableRow[] = [];
    for (const step of buildSteps(expected.Rows)) {
        const result = await runStep(call, step, user);
        if (!result.Success) {
            failures.push(`${label} [${step.Label}]: failed — ${result.ErrorMessage}`);
            continue;
        }
        const rows = ProjectRows(result.Results, columns);
        if (step.Kind === 'page') pageRows.push(...rows);
        failures.push(...checkStep(label, step, rows, result, expected));
    }
    if (!expected.Ordered) {
        const mismatch = DescribeRowMismatch(pageRows, expected.Rows, false);
        if (mismatch) failures.push(`${label} [pages combined]: pages overlap or miss rows — ${mismatch}`);
    }
    return failures;
}

async function runStep(call: QueryCall, step: MatrixStep, user: UserInfo): Promise<RunQueryResult> {
    const params: RunQueryParams = { ...call };
    if (step.MaxRows !== undefined) params.MaxRows = step.MaxRows;
    if (step.StartRow !== undefined) params.StartRow = step.StartRow;
    return new RunQuery().RunQuery(params, user);
}

function checkStep(label: string, step: MatrixStep, rows: ComparableRow[], result: RunQueryResult, expected: ExpectedResult): string[] {
    const failures: string[] = [];
    // Without an ORDER BY a page or slice can be any subset of the right size, so only its size is
    // checked here; the combined-pages check covers the content.
    if (!expected.Ordered && step.Kind !== 'whole') {
        if (rows.length !== step.Expected.length) {
            failures.push(`${label} [${step.Label}]: got ${rows.length} row(s), expected ${step.Expected.length}`);
        }
    } else {
        const mismatch = DescribeRowMismatch(rows, step.Expected, expected.Ordered);
        if (mismatch) failures.push(`${label} [${step.Label}]: ${mismatch}`);
    }
    if (Number(result.TotalRowCount) !== expected.Rows.length) {
        failures.push(`${label} [${step.Label}]: TotalRowCount ${result.TotalRowCount}, expected ${expected.Rows.length}`);
    }
    return failures;
}

/** Throws one error listing every failure, or returns when there are none. */
export function FailOnMismatches(checkLabel: string, failures: string[], exercised: number): void {
    if (failures.length > 0) {
        const sample = failures.slice(0, 25).join('\n    ');
        const more = failures.length > 25 ? `\n    …and ${failures.length - 25} more` : '';
        throw new Error(`${checkLabel}: ${failures.length} mismatch(es) across ${exercised} case(s):\n    ${sample}${more}`);
    }
    console.log(`      → ${checkLabel}: ${exercised} case(s) exercised, all matched`);
}
