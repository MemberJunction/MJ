import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MJAlertComponent } from '@memberjunction/ng-ui-components';
import { Query, RenderComponentFixture, Text } from '@memberjunction/ng-test-utils';
import {
    BundleArchiveVerificationResult,
    DiagnosticBundleManifest,
    ParseBundleDataFromArchive,
    VerifyBundleArchive,
} from '@memberjunction/diagnostics';
import { MJDiagnosticBundleViewerComponent } from './bundle-viewer.component';

vi.mock('@memberjunction/diagnostics', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/diagnostics')>()),
    VerifyBundleArchive: vi.fn(),
    ParseBundleDataFromArchive: vi.fn(),
}));

/**
 * DOM coverage for <mj-diagnostic-bundle-viewer> — a standalone:false, OnPush viewer that verifies
 * and reads a `.mjdiag` archive. The archive readers are mocked so a test controls their result.
 */

const MANIFEST: DiagnosticBundleManifest = {
    schemaVersion: '1.0',
    bundleId: 'b-1',
    createdAt: '2026-11-02T12:00:00.000Z',
    captureReason: 'Manual',
    scrubberProfile: 'Standard',
    redactionSummary: { credentialsScrubbedCount: 0, sqlLiteralsNormalizedCount: 0, customPatternsAppliedCount: 0 },
    files: {},
};

function render() {
    return RenderComponentFixture(MJDiagnosticBundleViewerComponent, {
        imports: [MJAlertComponent],
        declarations: [MJDiagnosticBundleViewerComponent],
    });
}

async function load(fixture: ReturnType<typeof render>, bytes: Uint8Array): Promise<void> {
    fixture.componentInstance.ArchiveBytes = bytes;
    await vi.waitFor(() => {
        fixture.detectChanges();
        expect(Query(fixture, 'mj-alert')).not.toBeNull();
    });
}

describe('MJDiagnosticBundleViewerComponent (DOM)', () => {
    beforeEach(() => {
        vi.mocked(VerifyBundleArchive).mockReset();
        vi.mocked(ParseBundleDataFromArchive).mockReset();
    });

    it('shows an error when a verified archive cannot be read', async () => {
        const verified: BundleArchiveVerificationResult = {
            valid: true,
            manifest: MANIFEST,
            entries: new Map(),
            totalCompressedBytes: 3,
            totalUncompressedBytes: 3,
        };
        vi.mocked(VerifyBundleArchive).mockResolvedValue(verified);
        vi.mocked(ParseBundleDataFromArchive).mockImplementation(() => {
            throw new TypeError('findings.json is not an array');
        });
        const fixture = render();

        await load(fixture, new Uint8Array([1, 2, 3]));

        expect(Text(fixture, 'mj-alert')).toContain('findings.json is not an array');
        expect(Query(fixture, '.mj-diag-section')).toBeNull();
    });
});
