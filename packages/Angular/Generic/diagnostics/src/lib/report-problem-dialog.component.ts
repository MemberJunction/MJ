import {
    Component,
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Input,
    Output,
    EventEmitter,
    inject,
} from '@angular/core';
import { DiagnosticScrubberProfile } from '@memberjunction/diagnostics';
import {
    MJDiagnosticsService,
    ClientBundleBuildResult,
    SubmitBundleToSupportResult,
} from './diagnostics.service';

@Component({
    selector: 'mj-diagnostic-report-problem-dialog',
    standalone: false,
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        @if (IsVisible) {
            <div class="mj-diag-dialog-backdrop" role="dialog" aria-modal="true" aria-label="Report a Problem">
                <div class="mj-diag-dialog-panel">
                    <header class="mj-diag-dialog-header">
                        <h3>Report a Problem / Export Diagnostic Bundle</h3>
                        <button type="button" class="mj-diag-close-btn" (click)="OnClose()">✕</button>
                    </header>

                    <div class="mj-diag-dialog-body">
                        <div class="mj-diag-field">
                            <label for="mj-diag-ticket">Support Ticket Number (optional)</label>
                            <input
                                id="mj-diag-ticket"
                                type="text"
                                [value]="TicketNumber"
                                (input)="OnTicketInput($event)"
                                placeholder="e.g. SUP-1042" />
                        </div>

                        <div class="mj-diag-field">
                            <label for="mj-diag-note">What happened?</label>
                            <textarea
                                id="mj-diag-note"
                                rows="3"
                                [value]="Note"
                                (input)="OnNoteInput($event)"
                                placeholder="Describe the steps or unexpected behavior..."></textarea>
                        </div>

                        <div class="mj-diag-field">
                            <label for="mj-diag-scrub-tier">Scrubber Profile</label>
                            <select
                                id="mj-diag-scrub-tier"
                                [value]="ScrubberProfile"
                                (change)="OnScrubberProfileChange($event)">
                                <option value="Standard">Standard (Credentials + SQL Literal Normalization)</option>
                                <option value="FullRaw">FullRaw (Credentials Always Redacted; SQL Literals Preserved)</option>
                            </select>
                        </div>

                        @if (LastResult) {
                            <div class="mj-diag-summary-box">
                                <strong>Bundle Ready:</strong> <code>{{ LastResult.bundleId }}.mjdiag</code>
                                ({{ LastResult.zipBytes.byteLength }} bytes, {{ LastResult.findings.length }} findings)
                                <button type="button" class="mj-diag-link-btn" (click)="OnDownloadSnapshot()">
                                    Download .mjdiag
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

                    <footer class="mj-diag-dialog-footer">
                        <button type="button" class="mj-diag-secondary-btn" (click)="OnStartRecording()">
                            Start Live Recording
                        </button>
                        <button type="button" class="mj-diag-secondary-btn" (click)="OnBuildSnapshot()">
                            Build .mjdiag Snapshot
                        </button>
                        <button
                            type="button"
                            class="mj-diag-primary-btn"
                            [disabled]="IsSubmitting"
                            (click)="OnSubmitToSupport()">
                            {{ IsSubmitting ? 'Submitting...' : 'Submit to Support' }}
                        </button>
                    </footer>
                </div>
            </div>
        }
    `,
    styles: [`
        .mj-diag-dialog-backdrop {
            position: fixed;
            inset: 0;
            background: rgba(15, 23, 42, 0.45);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        }
        .mj-diag-dialog-panel {
            width: 100%;
            max-width: 540px;
            background: var(--mj-bg-surface, #ffffff);
            color: var(--mj-text-primary, #0f172a);
            border-radius: 8px;
            border: 1px solid var(--mj-border-default, #e2e8f0);
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.15);
            overflow: hidden;
        }
        .mj-diag-dialog-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 14px 18px;
            border-bottom: 1px solid var(--mj-border-default, #e2e8f0);
        }
        .mj-diag-dialog-header h3 {
            margin: 0;
            font-size: 16px;
        }
        .mj-diag-dialog-body {
            padding: 16px 18px;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        .mj-diag-field {
            display: flex;
            flex-direction: column;
            gap: 4px;
            font-size: 13px;
        }
        .mj-diag-field input,
        .mj-diag-field textarea,
        .mj-diag-field select {
            padding: 7px 10px;
            border-radius: 6px;
            border: 1px solid var(--mj-border-default, #cbd5e1);
            font-size: 13px;
        }
        .mj-diag-summary-box {
            padding: 10px 12px;
            border-radius: 6px;
            background: var(--mj-bg-surface-sunken, #f8fafc);
            font-size: 12px;
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
        }
        .mj-diag-link-btn {
            background: transparent;
            border: 1px solid var(--mj-brand-primary, #2563eb);
            color: var(--mj-brand-primary, #2563eb);
            border-radius: 4px;
            padding: 2px 8px;
            font-size: 11px;
            cursor: pointer;
        }
        .mj-diag-dialog-footer {
            display: flex;
            justify-content: flex-end;
            gap: 8px;
            padding: 12px 18px;
            border-top: 1px solid var(--mj-border-default, #e2e8f0);
        }
        .mj-diag-primary-btn {
            padding: 7px 14px;
            border-radius: 6px;
            border: none;
            background: var(--mj-brand-primary, #2563eb);
            color: #ffffff;
            cursor: pointer;
            font-weight: 600;
        }
        .mj-diag-secondary-btn {
            padding: 7px 14px;
            border-radius: 6px;
            border: 1px solid var(--mj-border-default, #cbd5e1);
            background: var(--mj-bg-surface, #ffffff);
            cursor: pointer;
        }
        .mj-diag-close-btn {
            background: transparent;
            border: none;
            cursor: pointer;
            font-size: 16px;
        }
    `],
})
export class MJDiagnosticReportProblemDialogComponent {
    @Input() public IsVisible = false;
    @Output() public Closed = new EventEmitter<void>();
    @Output() public BundleBuilt = new EventEmitter<ClientBundleBuildResult>();
    @Output() public BundleSubmitted = new EventEmitter<SubmitBundleToSupportResult>();
    @Output() public RecordingStarted = new EventEmitter<string>();

    private readonly diagnosticsService = inject(MJDiagnosticsService);
    private readonly cdr = inject(ChangeDetectorRef);

    public TicketNumber = '';
    public Note = '';
    public ScrubberProfile: DiagnosticScrubberProfile = 'Standard';
    public LastResult: ClientBundleBuildResult | null = null;
    public LastSubmission: SubmitBundleToSupportResult | null = null;
    public IsSubmitting = false;

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
        const result = await this.diagnosticsService.BuildClientBundle({
            scrubberProfile: this.ScrubberProfile,
            ticketNumber: this.TicketNumber.trim() || undefined,
            note: this.Note.trim() || undefined,
            includeHar: true,
        });
        this.LastResult = result;
        this.cdr.markForCheck();
        this.BundleBuilt.emit(result);
    }

    public OnDownloadSnapshot(): void {
        if (this.LastResult) {
            this.diagnosticsService.DownloadClientBundle(this.LastResult);
        }
    }

    public async OnSubmitToSupport(): Promise<void> {
        this.IsSubmitting = true;
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

    public OnClose(): void {
        this.IsVisible = false;
        this.diagnosticsService.CloseReportProblemDialog();
        this.Closed.emit();
        this.cdr.markForCheck();
    }
}
