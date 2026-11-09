import { NgModule } from '@angular/core';
import {
    MJAlertComponent,
    MJButtonDirective,
    MJDialogActionsComponent,
    MJDialogComponent,
} from '@memberjunction/ng-ui-components';
import { MJDiagnosticRecordingBannerComponent } from './recording-banner.component';
import { MJDiagnosticReportProblemDialogComponent } from './report-problem-dialog.component';
import { MJDiagnosticBundleViewerComponent } from './bundle-viewer.component';

@NgModule({
    imports: [
        MJAlertComponent,
        MJButtonDirective,
        MJDialogActionsComponent,
        MJDialogComponent,
    ],
    declarations: [
        MJDiagnosticRecordingBannerComponent,
        MJDiagnosticReportProblemDialogComponent,
        MJDiagnosticBundleViewerComponent,
    ],
    exports: [
        MJDiagnosticRecordingBannerComponent,
        MJDiagnosticReportProblemDialogComponent,
        MJDiagnosticBundleViewerComponent,
    ],
})
export class MJDiagnosticsModule {}
