/**
 * CodeMirror 6 extension that marks findings in the document: the line of each finding gets a
 * tinted background and a coloured left edge, and the text from the finding's column to the end
 * of its word gets a wavy underline. Hovering either shows the finding's message (a `title`).
 *
 * Markers are set from outside with {@link SetDiagnosticMarkersEffect}; they move with edits and
 * are cleared by setting an empty list. Always installed by `<mj-code-editor>`; set markers through
 * its `SetDiagnosticMarkers` method.
 */
import { EditorView, Decoration, DecorationSet } from '@codemirror/view';
import { EditorState, Extension, Range, StateEffect, StateField } from '@codemirror/state';

/** How serious a marked finding is. */
export type DiagnosticMarkerSeverity = 'error' | 'warning' | 'info';

/** One finding to mark: a 1-based line and column, and the message shown on hover. */
export interface DiagnosticMarker {
    Line: number;
    Column: number;
    Severity: DiagnosticMarkerSeverity;
    Message: string;
}

/** Replaces the markers shown in the editor. */
export const SetDiagnosticMarkersEffect = StateEffect.define<readonly DiagnosticMarker[]>();

const WORD_END = /[\s,;()]/;

/** The document offset of a marker's line and column, clamped to the document; `null` past the last line. */
function markerRange(state: EditorState, marker: DiagnosticMarker): { from: number; to: number; lineFrom: number } | null {
    if (marker.Line < 1 || marker.Line > state.doc.lines) return null;
    const line = state.doc.line(marker.Line);
    const from = Math.min(line.from + Math.max(0, marker.Column - 1), line.to);
    let to = from;
    while (to < line.to && !WORD_END.test(line.text.charAt(to - line.from))) to++;
    return { from, to: Math.max(to, Math.min(from + 1, line.to)), lineFrom: line.from };
}

/** The decorations for a list of markers, sorted as CodeMirror requires. */
export function BuildDiagnosticDecorations(state: EditorState, markers: readonly DiagnosticMarker[]): DecorationSet {
    const ranges: Range<Decoration>[] = [];
    for (const marker of markers) {
        const range = markerRange(state, marker);
        if (!range) continue;
        const attributes = { title: marker.Message };
        ranges.push(Decoration.line({ class: `cm-mj-diagnostic-line cm-mj-diagnostic-line--${marker.Severity}`, attributes }).range(range.lineFrom));
        if (range.to > range.from) {
            ranges.push(Decoration.mark({ class: `cm-mj-diagnostic cm-mj-diagnostic--${marker.Severity}`, attributes }).range(range.from, range.to));
        }
    }
    return Decoration.set(ranges, true);
}

const diagnosticMarkerField = StateField.define<DecorationSet>({
    create: () => Decoration.none,
    update(decorations, transaction) {
        let next = decorations.map(transaction.changes);
        for (const effect of transaction.effects) {
            if (effect.is(SetDiagnosticMarkersEffect)) next = BuildDiagnosticDecorations(transaction.state, effect.value);
        }
        return next;
    },
    provide: field => EditorView.decorations.from(field),
});

const diagnosticMarkerTheme = EditorView.baseTheme({
    '.cm-mj-diagnostic-line--error': { backgroundColor: 'color-mix(in srgb, var(--mj-status-error) 8%, transparent)', boxShadow: 'inset 3px 0 0 var(--mj-status-error)' },
    '.cm-mj-diagnostic-line--warning': { backgroundColor: 'color-mix(in srgb, var(--mj-status-warning) 8%, transparent)', boxShadow: 'inset 3px 0 0 var(--mj-status-warning)' },
    '.cm-mj-diagnostic-line--info': { backgroundColor: 'color-mix(in srgb, var(--mj-status-info) 6%, transparent)', boxShadow: 'inset 3px 0 0 var(--mj-status-info)' },
    '.cm-mj-diagnostic': { textDecorationLine: 'underline', textDecorationStyle: 'wavy', textUnderlineOffset: '3px' },
    '.cm-mj-diagnostic--error': { textDecorationColor: 'var(--mj-status-error)' },
    '.cm-mj-diagnostic--warning': { textDecorationColor: 'var(--mj-status-warning)' },
    '.cm-mj-diagnostic--info': { textDecorationColor: 'var(--mj-status-info)' },
});

/** The extension: the marker state and its theme. */
export function DiagnosticMarkerExtension(): Extension {
    return [diagnosticMarkerField, diagnosticMarkerTheme];
}
