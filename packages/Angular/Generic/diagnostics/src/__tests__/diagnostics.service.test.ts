import { describe, it, expect, beforeEach } from 'vitest';
import { VerifyBundleArchive, ParseBundleDataFromArchive } from '@memberjunction/diagnostics';
import { MJDiagnosticsService } from '../lib/diagnostics.service';

describe('MJDiagnosticsService', () => {
    let service: MJDiagnosticsService;

    beforeEach(() => {
        service = new MJDiagnosticsService();
        service.ClearBuffers();
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
});
