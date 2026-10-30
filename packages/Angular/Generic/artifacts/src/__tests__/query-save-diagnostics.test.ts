// The node preset has no Angular linker; the JIT compiler lets partially compiled Angular libraries load.
import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { ChangeDetectorRef } from '@angular/core';
import { DataArtifactViewerComponent } from '../lib/components/plugins/data-artifact-viewer.component';
import { SaveQueryPanelComponent } from '../lib/components/plugins/save-query-dialog.component';

/**
 * The artifact paths that create or update a saved query show the server's findings when the
 * query's rules refuse the save (rule code, line, column, fix), and the server's own message for
 * any other failure, instead of a generic one.
 */

class InertChangeDetector extends ChangeDetectorRef {
    markForCheck(): void { /* no view */ }
    detach(): void { /* no view */ }
    detectChanges(): void { /* no view */ }
    checkNoChanges(): void { /* no view */ }
    reattach(): void { /* no view */ }
}

const REFUSAL = 'Query "Revenue" was not saved:\nMJQ_TAG_IN_STRING_LITERAL at line 4, column 22: A template tag is inside a string literal. Fix: Write {{ Region | sqlString }} without the quotes.';

describe('SaveQueryPanelComponent save failure', () => {
    it('lists the findings under the headline', () => {
        const dialog = new SaveQueryPanelComponent(new InertChangeDetector());
        dialog['showSaveFailure'](REFUSAL);
        expect(dialog.ErrorMessage).toBe('Query "Revenue" was not saved:');
        expect(dialog.ErrorDiagnostics).toEqual([{
            Code: 'MJQ_TAG_IN_STRING_LITERAL', Line: 4, Column: 22,
            Message: 'A template tag is inside a string literal.', FixHint: 'Write {{ Region | sqlString }} without the quotes.',
        }]);
    });

    it('keeps any other failure as the server\'s message', () => {
        const dialog = new SaveQueryPanelComponent(new InertChangeDetector());
        dialog['showSaveFailure']('You do not have permission to create queries');
        expect(dialog.ErrorDiagnostics).toEqual([]);
        expect(dialog.ErrorMessage).toBe('You do not have permission to create queries');
    });
});

describe('DataArtifactViewerComponent update failure', () => {
    it('shows the findings when the update is refused, and the server\'s message otherwise', () => {
        const viewer = new DataArtifactViewerComponent(new InertChangeDetector());
        viewer['showUpdateFailure'](REFUSAL);
        expect(viewer.UpdateQueryError).toBe('Query "Revenue" was not saved:');
        expect(viewer.UpdateQueryDiagnostics.map(d => [d.Code, d.Line, d.Column])).toEqual([['MJQ_TAG_IN_STRING_LITERAL', 4, 22]]);

        viewer['showUpdateFailure']('Record not found or access denied');
        expect(viewer.UpdateQueryDiagnostics).toEqual([]);
        expect(viewer.UpdateQueryError).toBe('Record not found or access denied');
    });
});
