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
                        [value]="ScrubberProfile"
                        (change)="OnScrubberProfileChange($event)">
                        <option value="FullRaw">FullRaw (default): credentials removed, SQL and filter literals kept</option>
                        <option value="Standard">Standard: credentials removed, SQL and filter literals replaced with ?</option>
                    </select>
                </div>

                @if (ErrorMessage) {
                    <mj-alert Variant="error" Role="alert" [Message]="ErrorMessage"></mj-alert>
                }

                @if (LastResult) {
                    <div class="mj-diag-summary-box">
                        <strong>Bundle Downloaded:</strong> <code>{{ LastResult.bundleId }}.mjdiag</code>
                        ({{ LastResult.zipBytes.byteLength }} bytes, {{ LastResult.findings.length }} findings,
                        scrubbing: {{ LastResult.manifest.scrubberProfile }})
                        <button type="button" mjButton variant="flat" size="sm" (click)="OnDownloadSnapshot()">
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
                    </div>
                }
            </div>

            <mj-dialog-actions>
                <button
                    type="button"
                    mjButton
                    variant="primary"
                    size="md"
                    [disabled]="IsSubmitting"
                    (click)="OnSubmitToSupport()">
                    {{ IsSubmitting ? 'Submitting...' : 'Submit to Support' }}
                </button>
                <button
                    type="button"
                    mjButton
                    variant="secondary"
                    size="md"
                    [disabled]="IsBuilding"
                    (click)="OnBuildSnapshot()">
                    {{ IsBuilding ? 'Building...' : 'Download .mjdiag Snapshot' }}
                </button>
                <button type="button" mjButton variant="secondary" size="md" (click)="OnStartRecording()">
                    Start Live Recording
                </button>
                <button type="button" mjButton variant="outline" size="md" (click)="OnClose()">
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

    public TicketNumber = '';
    public Note = '';
    public ScrubberProfile: DiagnosticScrubberProfile = DEFAULT_DIAGNOSTIC_SCRUBBER_PROFILE;
    public LastResult: ClientBundleBuildResult | null = null;
    public LastSubmission: SubmitBundleToSupportResult | null = null;
    public ErrorMessage: string | null = null;
    public IsBuilding = false;
    public IsSubmitting = false;

    public ngOnInit(): void {
        this.packageSub = this.diagnosticsService.PackageRequests$.subscribe((state) => {
            void this.packageRecording(state);
        });
    }

    public ngOnDestroy(): void {
        this.packageSub?.unsubscribe();
        this.packageSub = null;
    }

    public OnTicketInput(event: Event): void {
        const target = event.target as HTMLInputElement | null;
        this.TicketNumber = target?.value ?? '';
    }

    public OnNoteInput(event: Event): void {
        const target = event.target as HTMLTextAreaElement | null;
        this.Note = target?.value ?? '';
    }

    public OnScrubberProfileChange(event: Event): void {
        const target = event.target as HTMLSelectElement | null;
        const val = target?.value;
        if (val === 'Standard' || val === 'FullRaw') {
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

    public OnStartRecording(): void {
        const sessionId = `rec-${Date.now()}`;
        this.diagnosticsService.StartRecording(sessionId, this.ScrubberProfile);
        this.RecordingStarted.emit(sessionId);
        this.OnClose();
    }

    /** Shows the dialog and builds a snapshot for a recording that was just stopped. */
    private async packageRecording(state: ActiveRecordingState): Promise<void> {
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
    }

    public OnClose(): void {
        this.IsVisible = false;
        this.diagnosticsService.CloseReportProblemDialog();
        this.Closed.emit();
        this.cdr.markForCheck();
    }
}
