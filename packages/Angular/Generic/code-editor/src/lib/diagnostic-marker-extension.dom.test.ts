import { describe, it, expect, afterEach } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { BuildDiagnosticDecorations, DiagnosticMarkerExtension, SetDiagnosticMarkersEffect } from './diagnostic-marker-extension';
import type { DiagnosticMarker } from './diagnostic-marker-extension';

/**
 * The diagnostic marker extension: where a marker lands in the document, and that a real
 * EditorView renders the line and underline classes with the message on hover, moves them with
 * edits and clears them.
 */

const SQL = "SELECT u.ID\nFROM vwUsers u\nWHERE u.Name = '{{ Who }}'";
const marker = (line: number, column: number, severity: DiagnosticMarker['Severity'] = 'error'): DiagnosticMarker =>
    ({ Line: line, Column: column, Severity: severity, Message: `finding at ${line}:${column}` });

function rangesOf(state: EditorState, markers: DiagnosticMarker[]): Array<{ from: number; to: number; cls: string }> {
    const out: Array<{ from: number; to: number; cls: string }> = [];
    BuildDiagnosticDecorations(state, markers).between(0, state.doc.length, (from, to, d) => {
        out.push({ from, to, cls: String(d.spec.class) });
    });
    return out;
}

describe('BuildDiagnosticDecorations', () => {
    const state = EditorState.create({ doc: SQL });

    it('marks the line and the word that starts at the column', () => {
        const line3 = state.doc.line(3);
        const ranges = rangesOf(state, [marker(3, 16)]);
        expect(ranges).toContainEqual({ from: line3.from, to: line3.from, cls: 'cm-mj-diagnostic-line cm-mj-diagnostic-line--error' });
        const mark = ranges.find(r => r.cls.startsWith('cm-mj-diagnostic '));
        expect(state.doc.sliceString(mark?.from ?? 0, mark?.to ?? 0)).toBe("'{{");
    });

    it('ignores a marker past the last line and clamps a column past the line end', () => {
        expect(rangesOf(state, [marker(9, 1)])).toEqual([]);
        const line1 = state.doc.line(1);
        const ranges = rangesOf(state, [marker(1, 99, 'warning')]);
        expect(ranges.map(r => r.cls)).toEqual(['cm-mj-diagnostic-line cm-mj-diagnostic-line--warning']);
        expect(ranges[0].from).toBe(line1.from);
    });
});

describe('DiagnosticMarkerExtension in an EditorView', () => {
    let view: EditorView | null = null;
    afterEach(() => { view?.destroy(); view = null; });

    const mount = (): EditorView => {
        const parent = document.createElement('div');
        document.body.appendChild(parent);
        return new EditorView({ parent, state: EditorState.create({ doc: SQL, extensions: [DiagnosticMarkerExtension()] }) });
    };

    it('renders the marker with its message on hover, and clears it', () => {
        view = mount();
        view.dispatch({ effects: SetDiagnosticMarkersEffect.of([marker(3, 16)]) });
        const line = view.dom.querySelector('.cm-mj-diagnostic-line--error');
        expect(line).not.toBeNull();
        expect(line?.getAttribute('title')).toBe('finding at 3:16');
        expect(view.dom.querySelector('.cm-mj-diagnostic--error')).not.toBeNull();

        view.dispatch({ effects: SetDiagnosticMarkersEffect.of([]) });
        expect(view.dom.querySelector('.cm-mj-diagnostic-line')).toBeNull();
    });

    it('moves a marker with an edit above it', () => {
        view = mount();
        view.dispatch({ effects: SetDiagnosticMarkersEffect.of([marker(3, 16)]) });
        view.dispatch({ changes: { from: 0, insert: '-- note\n' } });
        const lines = Array.from(view.dom.querySelectorAll('.cm-line'));
        const marked = lines.findIndex(l => l.classList.contains('cm-mj-diagnostic-line'));
        expect(marked).toBe(3);
    });
});
