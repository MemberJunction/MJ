import {
    Component,
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    OnInit,
    OnDestroy,
    Output,
    EventEmitter,
    inject,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { MJDiagnosticsService, ActiveRecordingState } from './diagnostics.service';

@Component({
    selector: 'mj-diagnostic-recording-banner',
    standalone: false,
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        @if (RecordingState.isRecording) {
            <div class="mj-diag-recording-banner" role="status" aria-live="polite">
                <span class="mj-diag-pulse-dot" aria-hidden="true"></span>
                <span class="mj-diag-label">
                    Recording diagnostic session
                    @if (RecordingState.sessionId) {
                        <code>({{ RecordingState.sessionId }})</code>
                    }
                </span>
                <span class="mj-diag-stop-action">
                    <button type="button" mjButton variant="danger" size="sm" (click)="OnStopClicked()">
                        Stop &amp; Package
                    </button>
                </span>
            </div>
        }
    `,
    styles: [`
        .mj-diag-recording-banner {
            display: flex;
            align-items: center;
            gap: var(--mj-space-2-5);
            padding: var(--mj-space-1-5) var(--mj-space-3-5);
            background: var(--mj-status-error-bg);
            color: var(--mj-status-error-text);
            border-bottom: 1px solid var(--mj-status-error-border);
            font-size: 13px;
            font-weight: 500;
        }
        .mj-diag-pulse-dot {
            width: 8px;
            height: 8px;
            border-radius: var(--mj-radius-full);
            background: var(--mj-status-error);
        }
        .mj-diag-stop-action {
            margin-left: auto;
        }
    `],
})
export class MJDiagnosticRecordingBannerComponent implements OnInit, OnDestroy {
    @Output() public StopRecordingRequested = new EventEmitter<ActiveRecordingState>();

    private readonly diagnosticsService = inject(MJDiagnosticsService);
    private readonly cdr = inject(ChangeDetectorRef);
    private sub: Subscription | null = null;

    public RecordingState: ActiveRecordingState = this.diagnosticsService.CurrentRecordingState;

    public ngOnInit(): void {
        this.sub = this.diagnosticsService.RecordingState$.subscribe((state) => {
            this.RecordingState = state;
            this.cdr.markForCheck();
        });
    }

    public ngOnDestroy(): void {
        if (this.sub) {
            this.sub.unsubscribe();
            this.sub = null;
        }
    }

    /** Stops recording and hands the session to the report-problem dialog to package. */
    public OnStopClicked(): void {
        const snapshot = this.RecordingState;
        this.diagnosticsService.StopAndPackageRecording();
        this.StopRecordingRequested.emit(snapshot);
    }
}
