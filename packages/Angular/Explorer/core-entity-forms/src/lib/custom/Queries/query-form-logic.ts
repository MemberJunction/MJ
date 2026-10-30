import { ParseQuerySaveMessage } from '@memberjunction/core-entities';
import type { QueryDiagnosticLine } from '@memberjunction/core-entities';
import type { DiagnosticMarker, DiagnosticMarkerSeverity } from '@memberjunction/ng-code-editor';
import { UUIDSet } from '@memberjunction/global';

/**
 * Plain functions behind the query form: reading a refused save, the editor markers, and which
 * field rows the user may see. No Angular, so they are tested on their own.
 */

/** A refused save's findings, as the form lists them. */
export interface QuerySaveRefusal {
    readonly Headline: string | null;
    readonly Diagnostics: readonly QueryDiagnosticLine[];
}

/** A query's `ExtractionStatus`. */
export type QueryExtractionStatus = 'OK' | 'Warning' | 'Error' | 'Skipped' | null | undefined;

/**
 * The findings of a refused save, or `null` when the failure is not a refusal by the query's
 * rules (a network or permission error, which the form's own failure message already reports).
 */
export function SaveRefusalOf(message: string | null | undefined): QuerySaveRefusal | null {
    const parsed = ParseQuerySaveMessage(message);
    const isRuleRefusal = parsed.Diagnostics.some(d => d.Code !== null) || !!parsed.Headline;
    return isRuleRefusal ? { Headline: parsed.Headline, Diagnostics: parsed.Diagnostics } : null;
}

/** How serious an extraction's findings are. */
export function ExtractionSeverityOf(status: QueryExtractionStatus): DiagnosticMarkerSeverity {
    if (status === 'Error') return 'error';
    if (status === 'Warning') return 'warning';
    return 'info';
}

/**
 * The SQL editor's markers: a refused save's findings as errors while there are any, otherwise
 * the last extraction's findings at its severity. Findings without a location are not marked.
 */
export function EditorMarkersFor(
    saveFindings: readonly QueryDiagnosticLine[],
    extractionFindings: readonly QueryDiagnosticLine[],
    extractionStatus: QueryExtractionStatus,
): DiagnosticMarker[] {
    const fromSave = saveFindings.length > 0;
    const source = fromSave ? saveFindings : extractionFindings;
    const severity: DiagnosticMarkerSeverity = fromSave ? 'error' : ExtractionSeverityOf(extractionStatus);
    const markers: DiagnosticMarker[] = [];
    for (const d of source) {
        if (d.Line === null || d.Column === null) continue;
        markers.push({ Line: d.Line, Column: d.Column, Severity: severity, Message: d.FixHint ? `${d.Message} ${d.FixHint}` : d.Message });
    }
    return markers;
}

/** The part of a field row the visibility filter reads. */
export interface FieldRowIdentity {
    readonly ID: string;
    readonly IsSaved: boolean;
}

/**
 * Leaves out the stored field rows the user may not see. `allStored` is every stored field of the
 * query and `visibleStored` the ones the user may see (`QueryFieldsVisibleTo`); a row not saved yet
 * is the user's own and always kept.
 */
export function HideUnreadableFieldRows<T extends FieldRowIdentity>(
    rows: readonly T[],
    allStored: readonly FieldRowIdentity[],
    visibleStored: readonly FieldRowIdentity[],
): T[] {
    const visible = new UUIDSet(visibleStored.map(v => v.ID));
    const hidden = new UUIDSet(allStored.filter(f => !visible.Has(f.ID)).map(f => f.ID));
    if (hidden.Size === 0) return [...rows];
    return rows.filter(r => !r.IsSaved || !hidden.Has(r.ID));
}
