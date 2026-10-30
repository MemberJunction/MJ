/**
 * How a query field, parameter or entity link was detected, as the query form shows it.
 * `DetectionMethod` values: `Database` (facts from the database server's describe), `Parser`
 * (facts from MJ's reading of the SQL and template), `Manual` (authored by a person or metadata
 * file), `AI` (an LLM wrote the description).
 */
export type QueryChildDetectionMethod = 'AI' | 'Database' | 'Manual' | 'Parser';

const LABELS: Record<QueryChildDetectionMethod, string> = {
    Database: 'Database',
    Parser: 'Parser',
    Manual: 'Manual',
    AI: 'AI',
};

const TITLES: Record<QueryChildDetectionMethod, string> = {
    Database: 'Facts come from the database server describing the query.',
    Parser: 'Facts come from reading the SQL and its template.',
    Manual: 'Authored by hand or in a metadata file.',
    AI: 'The description was written by AI.',
};

function isDetectionMethod(method: string): method is QueryChildDetectionMethod {
    return Object.prototype.hasOwnProperty.call(LABELS, method);
}

/** The short label for a detection method; an unknown value is shown as it is. */
export function DetectionMethodLabel(method: string | null | undefined): string {
    if (!method) return '—';
    return isDetectionMethod(method) ? LABELS[method] : method;
}

/** A sentence explaining a detection method, for a tooltip. */
export function DetectionMethodTitle(method: string | null | undefined): string {
    if (!method) return '';
    return isDetectionMethod(method) ? TITLES[method] : '';
}
