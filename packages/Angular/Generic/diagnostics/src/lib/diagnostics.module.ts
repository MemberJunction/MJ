import { NgModule } from '@angular/core';
import { MJDiagnosticRecordingBannerComponent } from './recording-banner.component';
import { MJDiagnosticReportProblemDialogComponent } from './report-problem-dialog.component';
import { MJDiagnosticBundleViewerComponent } from './bundle-viewer.component';

@NgModule({
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
