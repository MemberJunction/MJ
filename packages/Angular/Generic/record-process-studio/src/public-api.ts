// @memberjunction/ng-record-process-studio
// Generic Bulk Operations studio — author, run, and audit Record Processes.

export * from './lib/record-process-editor/record-process-editor.component';
export * from './lib/record-process-studio/record-process-studio.component';
export * from './lib/record-process-history/record-process-history.component';

import { RecordProcessEditorComponent } from './lib/record-process-editor/record-process-editor.component';
import { RecordProcessStudioComponent } from './lib/record-process-studio/record-process-studio.component';
import { RecordProcessHistoryComponent } from './lib/record-process-history/record-process-history.component';

/**
 * Tree-shaking guard — reference the studio components so a consumer's bundler keeps them.
 * Call once from the consuming app's bootstrap.
 */
export function LoadRecordProcessStudio(): void {
    const _keep = [RecordProcessEditorComponent, RecordProcessStudioComponent, RecordProcessHistoryComponent];
    if (_keep.length === 0) {
        throw new Error('unreachable');
    }
}
