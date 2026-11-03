import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChangeDetectorRef, Injector, runInInjectionContext } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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
    it('keeps the action row to Submit, Download and Cancel so it fits a medium dialog', () => {
        const source = readFileSync(fileURLToPath(new URL('../lib/report-problem-dialog.component.ts', import.meta.url)), 'utf8');
        const actions = source.slice(source.indexOf('<mj-dialog-actions>'), source.indexOf('</mj-dialog-actions>'));

        expect((actions.match(/<button/g) ?? []).length).toBe(3);
        expect(actions).not.toContain('OnStartRecording');
        expect(actions).not.toContain('OnStopRecording');
        expect(source).toContain('OnStartRecording()');
        expect(source).toContain('OnStopRecording()');
    });
    it('offers a download of the submitted server bundle and shows its findings count', () => {
        const source = readFileSync(fileURLToPath(new URL('../lib/report-problem-dialog.component.ts', import.meta.url)), 'utf8');
        const start = source.indexOf('@if (LastSubmission)');
        const submission = source.slice(start, source.indexOf('<mj-dialog-actions>', start));

        expect(submission).toContain('OnDownloadServerBundle()');
        expect(submission).toContain('LastSubmission.findingsCount');
    });
    it('downloads the submitted bundle through the service and shows a failure in the error area', async () => {
        const dialog = runInInjectionContext(injector, () => new MJDiagnosticReportProblemDialogComponent());
        dialog.LastSubmission = {
            sessionId: 's1',
            bundleId: 'bundle-1',
            status: 'Sent',
            destination: 'MJC',
            externalReferenceId: 'diagref_1',
            findingsCount: 2,
        };
        const downloadSpy = vi.spyOn(service, 'DownloadServerBundle').mockRejectedValue(new Error('bytes are gone'));

        await dialog.OnDownloadServerBundle();

        expect(downloadSpy).toHaveBeenCalledWith('bundle-1');
        expect(dialog.ErrorMessage).toContain('bytes are gone');
        expect(dialog.IsDownloading).toBe(false);
    });
});
