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
                <button
                    type="button"
                    class="mj-diag-stop-btn"
                    (click)="OnStopClicked()">
                    Stop &amp; Package
                </button>
            </div>
        }
    `,
    styles: [`
        .mj-diag-recording-banner {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 6px 14px;
            background: var(--mj-status-error-surface, #fef2f2);
            color: var(--mj-status-error-text, #991b1b);
            border-bottom: 1px solid var(--mj-status-error-border, #fecaca);
            font-size: 13px;
            font-weight: 500;
        }
        .mj-diag-pulse-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: var(--mj-status-error, #dc2626);
        }
        .mj-diag-stop-btn {
            margin-left: auto;
            padding: 4px 10px;
            border-radius: 4px;
            border: 1px solid var(--mj-status-error-border, #fca5a5);
            background: var(--mj-bg-surface, #ffffff);
            color: var(--mj-status-error-text, #991b1b);
            cursor: pointer;
            font-size: 12px;
            font-weight: 600;
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

    public OnStopClicked(): void {
        const snapshot = this.RecordingState;
        this.diagnosticsService.StopRecording();
        this.StopRecordingRequested.emit(snapshot);
    }
}
