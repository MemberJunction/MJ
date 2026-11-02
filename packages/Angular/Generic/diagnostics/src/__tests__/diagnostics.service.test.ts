import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    DiagnosticsUploadClientCaptureOperation,
    DiagnosticsBuildBundleOperation,
    DiagnosticsSendBundleOperation,
} from '@memberjunction/core-entities';
import { VerifyBundleArchive, ParseBundleDataFromArchive } from '@memberjunction/diagnostics';
import { MJDiagnosticsService } from '../lib/diagnostics.service';

describe('MJDiagnosticsService', () => {
    let service: MJDiagnosticsService;

    beforeEach(() => {
        service = new MJDiagnosticsService();
        service.ClearBuffers();
        vi.restoreAllMocks();
    });

    it('tracks recording state and notifies registered session header hook', () => {
        let hookedSessionId: string | null = null;
        service.RegisterSessionHeaderHook((id) => {
            hookedSessionId = id;
        });

        expect(service.CurrentRecordingState.isRecording).toBe(false);
        expect(hookedSessionId).toBeNull();

        service.StartRecording('sess-100', 'Standard');
        expect(service.CurrentRecordingState.isRecording).toBe(true);
        expect(service.CurrentRecordingState.sessionId).toBe('sess-100');
        expect(service.CurrentRecordingState.scrubberProfile).toBe('Standard');
        expect(hookedSessionId).toBe('sess-100');

        service.StopRecording();
        expect(service.CurrentRecordingState.isRecording).toBe(false);
        expect(service.CurrentRecordingState.sessionId).toBeNull();
        expect(hookedSessionId).toBeNull();
    });

    it('builds a valid, scrubbed .mjdiag archive from client buffers', async () => {
        service.RecordLogEntry({
            timestamp: '2026-11-02T12:00:00.000Z',
            severity: 'error',
            source: 'client',
            message: 'Auth header failed: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc123def456_signature',
        });

        service.RecordTelemetryEntry({
            id: 'tel-1',
            category: 'BaseEntity',
            operation: 'BaseEntity.Save',
            startTimeUnixMs: 1_700_000_000_000,
            durationMs: 1200,
            params: {
                Entity: 'MJ: Users',
                Success: false,
                apiKey: 'sk-proj-1234567890abcdefghijklmnop',
            },
        });

        const built = await service.BuildClientBundle({
            scrubberProfile: 'Standard',
            ticketNumber: 'SUP-42',
            note: 'Save failed',
        });

        expect(built.manifest.captureReason).toBe('Ticket:SUP-42');
        expect(built.findings.some((f) => f.category === 'failed_entity_save')).toBe(true);

        const verified = await VerifyBundleArchive(built.zipBytes);
        expect(verified.valid).toBe(true);
        expect(verified.manifest?.bundleId).toBe(built.bundleId);

        const parsed = ParseBundleDataFromArchive(verified);
        expect(parsed.clientLogs[0].message).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
        expect(parsed.clientTelemetry[0].params?.['apiKey']).toBe('[REDACTED_KEY]');
    });

    it('submits a full-stack bundle from UX via UploadClientCapture -> BuildBundle -> SendBundle', async () => {
        const uploadSpy = vi
            .spyOn(DiagnosticsUploadClientCaptureOperation.prototype, 'Execute')
            .mockResolvedValue({
                Success: true,
                Output: {
                    SessionID: 'sess-ux-1',
                    ChunksWritten: 2,
                    TotalBytesWritten: 4096,
                },
            });

        const buildSpy = vi
            .spyOn(DiagnosticsBuildBundleOperation.prototype, 'Execute')
            .mockResolvedValue({
                Success: true,
                Output: {
                    BundleID: 'bundle-ux-1',
                    Status: 'Ready',
                    SizeBytes: 8192,
                    SHA256: 'deadbeef',
                    FindingsCount: 3,
                    DownloadUrl: '/diagnostics/bundles/bundle-ux-1/download?token=abc',
                },
            });

        const sendSpy = vi
            .spyOn(DiagnosticsSendBundleOperation.prototype, 'Execute')
            .mockResolvedValue({
                Success: true,
                Output: {
                    BundleID: 'bundle-ux-1',
                    Status: 'Sent',
                    Destination: 'MJC',
                    ExternalReferenceID: 'diagref_ux_999',
                    SentAt: '2026-11-02T12:05:00.000Z',
                },
            });

        const result = await service.SubmitBundleToSupport({
            scrubberProfile: 'Standard',
            ticketNumber: 'SUP-777',
            note: 'Dashboard slow load',
            destination: 'MJC',
        });

        expect(uploadSpy).toHaveBeenCalledTimes(1);
        expect(buildSpy).toHaveBeenCalledTimes(1);
        expect(sendSpy).toHaveBeenCalledTimes(1);
        expect(result.status).toBe('Sent');
        expect(result.bundleId).toBe('bundle-ux-1');
        expect(result.externalReferenceId).toBe('diagref_ux_999');
        expect(result.findingsCount).toBe(3);
    });

    it('automatically flushes client flight-recorder buffers once per server X-MJ-Diagnostic-Trigger header', async () => {
        const uploadSpy = vi
            .spyOn(DiagnosticsUploadClientCaptureOperation.prototype, 'Execute')
            .mockResolvedValue({
                Success: true,
                Output: {
                    SessionID: 'watch-sess-42',
                    ChunksWritten: 1,
                    TotalBytesWritten: 1024,
                },
            });

        const firstTrigger = await service.HandleServerTriggerHeader('watch-sess-42');
        expect(firstTrigger).toBe(true);
        expect(service.CurrentRecordingState.sessionId).toBe('watch-sess-42');
        expect(uploadSpy).toHaveBeenCalledTimes(1);

        // Duplicate trigger header for the same session ID is deduplicated
        const secondTrigger = await service.HandleServerTriggerHeader('watch-sess-42');
        expect(secondTrigger).toBe(false);
        expect(uploadSpy).toHaveBeenCalledTimes(1);
    });
});
