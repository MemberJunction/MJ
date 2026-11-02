import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChangeDetectorRef, Injector, runInInjectionContext } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { MJDiagnosticsService } from '../lib/diagnostics.service';
import { MJDiagnosticReportProblemDialogComponent } from '../lib/report-problem-dialog.component';
import { MJDiagnosticRecordingBannerComponent } from '../lib/recording-banner.component';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { DiagnosticsGetMySessionStatusOperation } from '@memberjunction/core-entities';

function createInjector(service: MJDiagnosticsService): Injector {
    return Injector.create({
        providers: [
            { provide: MJDiagnosticsService, useValue: service },
            { provide: ChangeDetectorRef, useValue: { markForCheck: () => undefined } },
        ],
    });
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
        const built = firstValueFrom(dialog.BundleBuilt);

        banner.OnStopClicked();
        await built;

        expect(dialog.ErrorMessage).toBeNull();
        expect(service.CurrentRecordingState.isRecording).toBe(false);
        expect(buildSpy).toHaveBeenCalledTimes(1);
        expect(dialog.IsVisible).toBe(true);
        expect(dialog.LastResult?.manifest.sessionId).toBe('rec-42');
        expect(dialog.LastResult?.manifest.scrubberProfile).toBe('Standard');
        dialog.ngOnDestroy();
        banner.ngOnDestroy();
    });
    it('offers Stop & Package while a recording runs and stops it from the dialog', async () => {
        const buildSpy = vi.spyOn(service, 'BuildClientBundle');
        const dialog = runInInjectionContext(injector, () => new MJDiagnosticReportProblemDialogComponent());
        dialog.ngOnInit();
        expect(dialog.IsRecording).toBe(false);

        service.StartRecording('rec-7', 'Standard');
        expect(dialog.IsRecording).toBe(true);
        const built = firstValueFrom(dialog.BundleBuilt);

        dialog.OnStopRecording();
        await built;

        expect(service.CurrentRecordingState.isRecording).toBe(false);
        expect(dialog.IsRecording).toBe(false);
        expect(buildSpy).toHaveBeenCalledTimes(1);
        expect(dialog.LastResult?.manifest.sessionId).toBe('rec-7');
        dialog.ngOnDestroy();
    });
    it('tells a client-only recording apart from a server-backed one', async () => {
        const dialog = runInInjectionContext(injector, () => new MJDiagnosticReportProblemDialogComponent());
        dialog.ngOnInit();

        service.StartRecording('srv-9', 'Standard');
        expect(dialog.IsRecording).toBe(true);
        expect(dialog.IsClientOnlyRecording).toBe(false);
        service.StopRecording();

        const provider = Object.create(GraphQLDataProvider.prototype);
        Object.defineProperties(provider, {
            CurrentUser: { value: { ID: 'USER-1', Type: 'User', UserRoles: [] } },
            Authorizations: { value: [] },
            sessionId: { value: 'tab-1' },
            SetDynamicHeader: { value: vi.fn() },
            RemoveDynamicHeader: { value: vi.fn() },
        });
        vi.spyOn(DiagnosticsGetMySessionStatusOperation.prototype, 'Execute').mockResolvedValue({
            Success: true,
            Output: { Active: false, SelfServiceRecordingAllowed: false },
        });
        service.Provider = provider;
        await service.StartLiveRecording('FullRaw');

        expect(dialog.IsRecording).toBe(true);
        expect(dialog.IsClientOnlyRecording).toBe(true);
        service.StopRecording();
        dialog.ngOnDestroy();
    });
});
