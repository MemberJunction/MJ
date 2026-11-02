import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChangeDetectorRef, Injector, runInInjectionContext } from '@angular/core';
import { MJDiagnosticsService } from '../lib/diagnostics.service';
import { MJDiagnosticReportProblemDialogComponent } from '../lib/report-problem-dialog.component';
import { MJDiagnosticRecordingBannerComponent } from '../lib/recording-banner.component';

function createInjector(service: MJDiagnosticsService): Injector {
    return Injector.create({
        providers: [
            { provide: MJDiagnosticsService, useValue: service },
            { provide: ChangeDetectorRef, useValue: { markForCheck: () => undefined } },
        ],
    });
}

async function flushAsync(): Promise<void> {
    for (let i = 0; i < 10; i++) {
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
}

describe('MJDiagnosticReportProblemDialogComponent', () => {
    let service: MJDiagnosticsService;
    let injector: Injector;

    beforeEach(() => {
        service = new MJDiagnosticsService();
        service.ClearBuffers();
        injector = createInjector(service);
    });

    it('shows a Submit upload failure in the error area instead of rejecting', async () => {
        vi.spyOn(service, 'SubmitBundleToSupport').mockRejectedValue(new Error('Upload refused by server'));
        const dialog = runInInjectionContext(injector, () => new MJDiagnosticReportProblemDialogComponent());

        await expect(dialog.OnSubmitToSupport()).resolves.toBeUndefined();

        expect(dialog.ErrorMessage).toContain('Upload refused by server');
        expect(dialog.IsSubmitting).toBe(false);
    });

    it('Stop & Package stops recording, builds the snapshot for that session and reopens the dialog', async () => {
        const buildSpy = vi.spyOn(service, 'BuildClientBundle');
        const dialog = runInInjectionContext(injector, () => new MJDiagnosticReportProblemDialogComponent());
        const banner = runInInjectionContext(injector, () => new MJDiagnosticRecordingBannerComponent());
        dialog.ngOnInit();
        banner.ngOnInit();
        service.StartRecording('rec-42', 'Standard');

        banner.OnStopClicked();
        await flushAsync();

        expect(service.CurrentRecordingState.isRecording).toBe(false);
        expect(buildSpy).toHaveBeenCalledTimes(1);
        expect(dialog.IsVisible).toBe(true);
        expect(dialog.LastResult?.manifest.sessionId).toBe('rec-42');
        expect(dialog.LastResult?.manifest.scrubberProfile).toBe('Standard');
        dialog.ngOnDestroy();
        banner.ngOnDestroy();
    });
});
