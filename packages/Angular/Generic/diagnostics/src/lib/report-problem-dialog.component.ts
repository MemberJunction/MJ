import {
    Component,
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Input,
    Output,
    EventEmitter,
    OnInit,
    OnDestroy,
    inject,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { DiagnosticScrubberProfile } from '@memberjunction/diagnostics';
import {
    MJDiagnosticsService,
    DEFAULT_DIAGNOSTIC_SCRUBBER_PROFILE,
    ClientBundleBuildResult,
    SubmitBundleToSupportResult,
    ActiveRecordingState,
} from './diagnostics.service';

function errorText(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

@Component({
    selector: 'mj-diagnostic-report-problem-dialog',
    standalone: false,
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <mj-dialog
            [Visible]="IsVisible"
            Title="Report a Problem / Export Diagnostic Bundle"
            Size="md"
            (Close)="OnClose()">
            <div class="mj-diag-dialog-body">
                <div class="mj-diag-field">
                    <label for="mj-diag-ticket">Support Ticket Number (optional)</label>
                    <input
                        id="mj-diag-ticket"
                        class="mj-input"
                        type="text"
                        [value]="TicketNumber"
                        (input)="OnTicketInput($event)"
                        placeholder="e.g. SUP-1042" />
                </div>

                <div class="mj-diag-field">
                    <label for="mj-diag-note">What happened?</label>
                    <textarea
                        id="mj-diag-note"
                        class="mj-textarea"
                        rows="3"
                        [value]="Note"
                        (input)="OnNoteInput($event)"
                        placeholder="Describe the steps or unexpected behavior..."></textarea>
                </div>

                <div class="mj-diag-field">
                    <label for="mj-diag-scrub-tier">Scrubbing Level</label>
                    <select
                        id="mj-diag-scrub-tier"
                        class="mj-input"
                        [value]="LiteralScrubbingRequired ? 'Standard' : ScrubberProfile"
                        (change)="OnScrubberProfileChange($event)">
                        <option value="Standard">Standard (default): credentials removed, SQL and filter literals replaced with ?</option>
                        <option value="FullRaw" [disabled]="LiteralScrubbingRequired">FullRaw: credentials removed, SQL and filter literals kept</option>
                    </select>
                    @if (LiteralScrubbingRequired) {
                        <span class="mj-diag-hint">This server requires literal scrubbing, so bundles use Standard.</span>
                    }
                </div>

                <div class="mj-diag-field">
                    <span class="mj-diag-field-label">Live Recording</span>
                    <div class="mj-diag-recording-row">
                        @if (IsRecording) {
                            <button type="button" mjButton Variant="danger" Size="sm" [disabled]="IsBuilding" (click)="OnStopRecording()">
                                Stop &amp; Package Recording
                            </button>
                            <span class="mj-diag-hint">Recording. Reproduce the problem, then stop to package it.</span>
                        } @else {
                            <button type="button" mjButton Variant="secondary" Size="sm" (click)="OnStartRecording()">
                                Start Live Recording
                            </button>
                            <span class="mj-diag-hint">Records requests and logs while you reproduce the problem.</span>
                        }
                    </div>
                </div>

                @if (ErrorMessage) {
                    <mj-alert Variant="error" Role="alert" [Message]="ErrorMessage"></mj-alert>
                }

                @if (IsClientOnlyRecording) {
                    <mj-alert
                        Variant="info"
                        Message="This recording is client-only: the server did not start a session for you (that needs the Diagnostics: Run Sessions authorization or self-service recording). Server traces, SQL and logs will not be in the bundle."></mj-alert>
                }

                @if (LastResult) {
                    <div class="mj-diag-summary-box">
                        <strong>Client snapshot downloaded:</strong> <code>{{ LastResult.bundleId }}.mjdiag</code>
                        ({{ LastResult.zipBytes.byteLength }} bytes, {{ LastResult.findings.length }} findings,
                        scrubbing: {{ LastResult.manifest.scrubberProfile }}). It holds browser data only;
                        server traces, SQL and logs come with Submit to Support.
                        <button type="button" mjButton Variant="flat" Size="sm" (click)="OnDownloadSnapshot()">
                            Download Again
                        </button>
                    </div>
                }

                @if (LastSubmission) {
                    <div class="mj-diag-summary-box">
                        <strong>Submitted ({{ LastSubmission.status }}):</strong>
                        @if (LastSubmission.externalReferenceId) {
                            Reference ID: <code>{{ LastSubmission.externalReferenceId }}</code>
                        } @else if (LastSubmission.errorMessage) {
                            <span>{{ LastSubmission.errorMessage }}</span>
                        }
                        <span>{{ LastSubmission.findingsCount }} findings.</span>
                        <button type="button" mjButton Variant="flat" Size="sm" [disabled]="IsDownloading" (click)="OnDownloadServerBundle()">
                            {{ IsDownloading ? 'Preparing...' : 'Download Bundle (.mjdiag)' }}
                        </button>
                    </div>
                }
            </div>

            <mj-dialog-actions>
                <button
                    type="button"
                    mjButton
                    Variant="primary"
                    Size="md"
                    [disabled]="IsSubmitting"
                    (click)="OnSubmitToSupport()">
                    {{ IsSubmitting ? 'Submitting...' : 'Submit to Support' }}
                </button>
                <button
                    type="button"
                    mjButton
                    Variant="secondary"
                    Size="md"
                    [disabled]="IsBuilding"
                    (click)="OnBuildSnapshot()">
                    {{ IsBuilding ? 'Building...' : 'Download Client Snapshot' }}
                </button>
                <button type="button" mjButton Variant="outline" Size="md" (click)="OnClose()">
                    Cancel
                </button>
            </mj-dialog-actions>
        </mj-dialog>
    `,
    styles: [`
        .mj-diag-dialog-body {
            display: flex;
            flex-direction: column;
            gap: var(--mj-space-3);
        }
        .mj-diag-field {
            display: flex;
            flex-direction: column;
            gap: var(--mj-space-1);
            font-size: 13px;
        }
        .mj-diag-recording-row {
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            gap: var(--mj-space-2);
        }
        .mj-diag-hint {
            font-size: 12px;
            color: var(--mj-text-secondary);
        }
        .mj-diag-summary-box {
            padding: var(--mj-space-2-5) var(--mj-space-3);
            border-radius: var(--mj-radius-sm);
            background: var(--mj-bg-surface-sunken);
            color: var(--mj-text-primary);
            font-size: 12px;
            display: flex;
            align-items: center;
            gap: var(--mj-space-2);
            flex-wrap: wrap;
        }
    `],
})
export class MJDiagnosticReportProblemDialogComponent implements OnInit, OnDestroy {
    @Input() public IsVisible = false;
    @Output() public Closed = new EventEmitter<void>();
    @Output() public BundleBuilt = new EventEmitter<ClientBundleBuildResult>();
    @Output() public BundleSubmitted = new EventEmitter<SubmitBundleToSupportResult>();
    @Output() public RecordingStarted = new EventEmitter<string>();

    private readonly diagnosticsService = inject(MJDiagnosticsService);
    private readonly cdr = inject(ChangeDetectorRef);
    private packageSub: Subscription | null = null;
    private recordingSub: Subscription | null = null;
    private queuedPackage: ActiveRecordingState | null = null;

    public TicketNumber = '';
    public Note = '';
    public ScrubberProfile: DiagnosticScrubberProfile = DEFAULT_DIAGNOSTIC_SCRUBBER_PROFILE;
    public LastResult: ClientBundleBuildResult | null = null;
    public LastSubmission: SubmitBundleToSupportResult | null = null;
    public ErrorMessage: string | null = null;
    public IsBuilding = false;
    public IsSubmitting = false;
    /** True while a fresh download link for the submitted server bundle is being minted. */
    public IsDownloading = false;
    /** True while a live recording runs; the dialog then offers Stop & Package instead of Start. */
    public IsRecording = false;
    /** True while the running recording has no server session, so the bundle holds browser data only. */
    public IsClientOnlyRecording = false;

    public ngOnInit(): void {
        this.packageSub = this.diagnosticsService.PackageRequests$.subscribe((state) => {
            void this.packageRecording(state);
        });
        this.recordingSub = this.diagnosticsService.RecordingState$.subscribe((state) => {
            this.IsRecording = state.isRecording;
            this.IsClientOnlyRecording = state.isRecording && !state.serverSessionId;
            this.cdr.markForCheck();
        });
    }

    public ngOnDestroy(): void {
        this.packageSub?.unsubscribe();
        this.packageSub = null;
        this.recordingSub?.unsubscribe();
        this.recordingSub = null;
        this.queuedPackage = null;
    }

    public OnTicketInput(event: Event): void {
        const target = event.target as HTMLInputElement | null;
        this.TicketNumber = target?.value ?? '';
    }

    public OnNoteInput(event: Event): void {
        const target = event.target as HTMLTextAreaElement | null;
        this.Note = target?.value ?? '';
    }

    /** True when the server requires literal scrubbing, so only the Standard profile is offered. */
    public get LiteralScrubbingRequired(): boolean {
        return this.diagnosticsService.LiteralScrubbingRequired;
    }

    public OnScrubberProfileChange(event: Event): void {
        const target = event.target as HTMLSelectElement | null;
        const val = target?.value;
        if (val === 'Standard' || (val === 'FullRaw' && !this.LiteralScrubbingRequired)) {
            this.ScrubberProfile = val;
        }
    }

    public async OnBuildSnapshot(): Promise<void> {
        await this.buildSnapshot(undefined);
    }

    public OnDownloadSnapshot(): void {
        if (this.LastResult) {
            this.diagnosticsService.DownloadClientBundle(this.LastResult);
        }
    }

    public async OnSubmitToSupport(): Promise<void> {
        this.IsSubmitting = true;
        this.ErrorMessage = null;
        this.cdr.markForCheck();
        try {
            const submitted = await this.diagnosticsService.SubmitBundleToSupport({
                scrubberProfile: this.ScrubberProfile,
                ticketNumber: this.TicketNumber.trim() || undefined,
                note: this.Note.trim() || undefined,
                destination: 'MJC',
            });
            this.LastSubmission = submitted;
            this.BundleSubmitted.emit(submitted);
        } catch (err) {
            this.ErrorMessage = `Submit failed: ${errorText(err)}`;
        } finally {
            this.IsSubmitting = false;
            this.cdr.markForCheck();
        }
    }

    /** Downloads the submitted server bundle through a fresh single-use link. */
    public async OnDownloadServerBundle(): Promise<void> {
        const bundleId = this.LastSubmission?.bundleId;
        if (!bundleId) {
            return;
        }
        this.IsDownloading = true;
        this.ErrorMessage = null;
        this.cdr.markForCheck();
        try {
            await this.diagnosticsService.DownloadServerBundle(bundleId);
        } catch (err) {
            this.ErrorMessage = `Download failed: ${errorText(err)}`;
        } finally {
            this.IsDownloading = false;
            this.cdr.markForCheck();
        }
    }

    public async OnStartRecording(): Promise<void> {
        this.ErrorMessage = null;
        try {
            const sessionId = await this.diagnosticsService.StartLiveRecording(this.ScrubberProfile);
            this.RecordingStarted.emit(sessionId);
            this.OnClose();
        } catch (err) {
            this.ErrorMessage = `Start recording failed: ${errorText(err)}`;
            this.cdr.markForCheck();
        }
    }

    /** Stops the running recording; the package request it raises builds and downloads the snapshot. */
    public OnStopRecording(): void {
        this.ErrorMessage = null;
        this.diagnosticsService.StopAndPackageRecording();
    }

    /**
     * Shows the dialog and builds a snapshot for a recording that was just stopped.
     * While a build runs, the latest request waits and runs when that build ends.
     */
    private async packageRecording(state: ActiveRecordingState): Promise<void> {
        if (this.IsBuilding) {
            this.queuedPackage = state;
            return;
        }
        this.IsVisible = true;
        this.ScrubberProfile = state.scrubberProfile;
        this.cdr.markForCheck();
        await this.buildSnapshot(state.sessionId ?? undefined);
    }

    /** Builds and downloads a client snapshot; a failure is shown in the error area. */
    private async buildSnapshot(sessionId: string | undefined): Promise<void> {
        this.IsBuilding = true;
        this.ErrorMessage = null;
        this.cdr.markForCheck();
        try {
            const result = await this.diagnosticsService.BuildClientBundle({
                scrubberProfile: this.ScrubberProfile,
                ticketNumber: this.TicketNumber.trim() || undefined,
                note: this.Note.trim() || undefined,
                includeHar: true,
                sessionId,
            });
            this.LastResult = result;
            this.diagnosticsService.DownloadClientBundle(result);
            this.BundleBuilt.emit(result);
        } catch (err) {
            this.ErrorMessage = `Snapshot failed: ${errorText(err)}`;
        } finally {
            this.IsBuilding = false;
            this.cdr.markForCheck();
        }
        await this.packageQueuedRecording();
    }

    /** Packages the recording that waited for the previous build, if there is one. */
    private async packageQueuedRecording(): Promise<void> {
        const queued = this.queuedPackage;
        this.queuedPackage = null;
        if (queued) {
            await this.packageRecording(queued);
        }
    }

    public OnClose(): void {
        this.IsVisible = false;
        this.diagnosticsService.CloseReportProblemDialog();
        this.Closed.emit();
        this.cdr.markForCheck();
    }
}
