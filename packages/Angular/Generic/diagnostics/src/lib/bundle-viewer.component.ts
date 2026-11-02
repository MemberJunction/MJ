import {
    Component,
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Input,
    inject,
} from '@angular/core';
import {
    DiagnosticBundleManifest,
    DiagnosticFinding,
    ParseBundleDataFromArchive,
    VerifyBundleArchive,
} from '@memberjunction/diagnostics';

@Component({
    selector: 'mj-diagnostic-bundle-viewer',
    standalone: false,
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="mj-diag-viewer">
            @if (VerificationError) {
                <mj-alert
                    Variant="error"
                    Role="alert"
                    Title="Archive Verification Failed"
                    [Message]="VerificationError"></mj-alert>
            }

            @if (Manifest) {
                <section class="mj-diag-section">
                    <h4>Bundle Summary</h4>
                    <div class="mj-diag-grid">
                        <div><strong>Bundle ID:</strong> <code>{{ Manifest.bundleId }}</code></div>
                        <div><strong>Created At:</strong> {{ Manifest.createdAt }}</div>
                        <div><strong>Capture Reason:</strong> {{ Manifest.captureReason }}</div>
                        <div><strong>Scrubber Profile:</strong> {{ Manifest.scrubberProfile }}</div>
                        <div><strong>Files:</strong> {{ FileCount }}</div>
                        <div><strong>Findings:</strong> {{ Findings.length }}</div>
                    </div>
                </section>

                <section class="mj-diag-section">
                    <h4>Automated Findings ({{ Findings.length }})</h4>
                    @if (Findings.length === 0) {
                        <p class="mj-diag-muted">No automated findings detected in this bundle.</p>
                    } @else {
                        <ul class="mj-diag-findings-list">
                            @for (finding of Findings; track finding.id) {
                                <li class="mj-diag-finding-item">
                                    <span class="mj-diag-severity">[{{ finding.severity }}]</span>
                                    <strong>{{ finding.title }}</strong> — {{ finding.summary }}
                                </li>
                            }
                        </ul>
                    }
                </section>
            } @else if (!VerificationError) {
                <p class="mj-diag-muted">Load a <code>.mjdiag</code> bundle archive to inspect its contents.</p>
            }
        </div>
    `,
    styles: [`
        .mj-diag-viewer {
            display: flex;
            flex-direction: column;
            gap: 16px;
            padding: 12px;
            font-size: 13px;
        }
        .mj-diag-section {
            padding: 12px;
            border: 1px solid var(--mj-border-default);
            border-radius: 6px;
            background: var(--mj-bg-surface);
        }
        .mj-diag-section h4 {
            margin: 0 0 10px 0;
            font-size: 14px;
        }
        .mj-diag-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 8px;
        }
        .mj-diag-findings-list {
            margin: 0;
            padding-left: 18px;
            display: flex;
            flex-direction: column;
            gap: 6px;
        }
        .mj-diag-severity {
            font-weight: 700;
            margin-right: 6px;
        }
        .mj-diag-muted {
            color: var(--mj-text-secondary);
            margin: 0;
        }
    `],
})
export class MJDiagnosticBundleViewerComponent {
    private readonly cdr = inject(ChangeDetectorRef);

    public Manifest: DiagnosticBundleManifest | null = null;
    public Findings: DiagnosticFinding[] = [];
    public VerificationError: string | null = null;
    public FileCount = 0;

    @Input()
    public set ArchiveBytes(bytes: Uint8Array | null) {
        void this.loadArchiveBytes(bytes);
    }

    private async loadArchiveBytes(bytes: Uint8Array | null): Promise<void> {
        if (!bytes) {
            this.Manifest = null;
            this.Findings = [];
            this.VerificationError = null;
            this.FileCount = 0;
            this.cdr.markForCheck();
            return;
        }
        const verification = await VerifyBundleArchive(bytes);
        if (!verification.valid || !verification.manifest) {
            this.Manifest = null;
            this.Findings = [];
            this.VerificationError = verification.reason ?? 'Invalid .mjdiag archive';
            this.FileCount = 0;
            this.cdr.markForCheck();
            return;
        }

        const parsed = ParseBundleDataFromArchive(verification);
        this.VerificationError = null;
        this.Manifest = verification.manifest;
        this.FileCount = Object.keys(verification.manifest.files).length;
        this.Findings = parsed.findings;
        this.cdr.markForCheck();
    }
}
