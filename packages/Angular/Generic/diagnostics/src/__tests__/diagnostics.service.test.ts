import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    DiagnosticsUploadClientCaptureOperation,
    DiagnosticsBuildBundleOperation,
    DiagnosticsSendBundleOperation,
    DiagnosticsStartSessionOperation,
    DiagnosticsStopSessionOperation,
    DiagnosticsGetMySessionStatusOperation,
} from '@memberjunction/core-entities';
import { VerifyBundleArchive, ParseBundleDataFromArchive } from '@memberjunction/diagnostics';
import {
    GraphQLDataProvider,
    NetworkDiagnosticObserver,
    RegisterNetworkDiagnosticObserver,
    RegisterResponseHeaderObserver,
    ResponseHeaderObserver,
} from '@memberjunction/graphql-dataprovider';
import { MJDiagnosticsService } from '../lib/diagnostics.service';

vi.mock('@memberjunction/graphql-dataprovider', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/graphql-dataprovider')>()),
    RegisterNetworkDiagnosticObserver: vi.fn(() => () => undefined),
    RegisterResponseHeaderObserver: vi.fn(() => () => undefined),
}));

const recordingUser = { ID: 'USER-1', Type: 'User', UserRoles: [] };

/** A GraphQL provider stand-in whose user does or does not hold `Diagnostics: Run Sessions`. */
function fakeProvider(canRunSessions: boolean): GraphQLDataProvider & { SetDynamicHeader: ReturnType<typeof vi.fn>; RemoveDynamicHeader: ReturnType<typeof vi.fn> } {
    const provider = Object.create(GraphQLDataProvider.prototype);
    Object.defineProperties(provider, {
        CurrentUser: { value: recordingUser },
        Authorizations: { value: [{ Name: 'Diagnostics: Run Sessions', UserCanExecute: () => canRunSessions }] },
        sessionId: { value: 'tab-1' },
        SetDynamicHeader: { value: vi.fn() },
        RemoveDynamicHeader: { value: vi.fn() },
    });
    return provider;
}

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

    it('reports the number of credential redactions in the manifest, not the number of log lines', async () => {
        service.RecordLogEntry({
            timestamp: '2026-11-02T12:00:00.000Z',
            severity: 'error',
            source: 'client',
            message: 'key sk-proj-1234567890abcdefghijklmnop then AKIAIOSFODNN7EXAMPLE then Password=hunter2',
        });
        service.RecordLogEntry({
            timestamp: '2026-11-02T12:00:01.000Z',
            severity: 'info',
            source: 'client',
            message: 'no secrets here',
        });

        const built = await service.BuildClientBundle({ scrubberProfile: 'FullRaw' });

        expect(built.manifest.redactionSummary.credentialsScrubbedCount).toBe(3);
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

    describe('live recording', () => {
        it('starts a server session for a user with Diagnostics: Run Sessions, sends its header and fills the waterfall', async () => {
            const provider = fakeProvider(true);
            const startSpy = vi.spyOn(DiagnosticsStartSessionOperation.prototype, 'Execute').mockResolvedValue({
                Success: true,
                Output: { SessionID: 'srv-1', Status: 'Active', StartedAt: '', EndsAt: '', ScrubLiterals: false },
            });
            const stopSpy = vi.spyOn(DiagnosticsStopSessionOperation.prototype, 'Execute').mockResolvedValue({
                Success: true,
                Output: { SessionID: 'srv-1', Status: 'Stopped', StoppedAt: '', FlushedChunkCount: 0 },
            });
            service.Provider = provider;

            const sessionId = await service.StartLiveRecording('FullRaw');

            expect(sessionId).toBe('srv-1');
            expect(startSpy).toHaveBeenCalledWith(
                expect.objectContaining({ ScopeType: 'Users', Scope: { userIds: ['USER-1'], browserSessionId: 'tab-1' } }),
                expect.objectContaining({ provider }),
            );
            expect(provider.SetDynamicHeader).toHaveBeenCalledWith('x-mj-diagnostic-session', 'srv-1');
            const observer = vi.mocked(RegisterNetworkDiagnosticObserver).mock.calls.at(-1)?.[0] as NetworkDiagnosticObserver;
            observer({
                operationName: 'GetUsers', operationKind: 'query', traceId: 't', spanId: 's', traceparent: 'tp',
                durationMs: 12, requestBytes: 10, responseBytes: 20, succeeded: true, retryCount: 0, variableKeys: [], timestamp: 1,
            });
            const built = await service.BuildClientBundle();
            expect(ParseBundleDataFromArchive(await VerifyBundleArchive(built.zipBytes)).clientWaterfall).toHaveLength(1);

            service.StopRecording();
            await vi.waitFor(() => expect(stopSpy).toHaveBeenCalledWith({ SessionID: 'srv-1' }, expect.objectContaining({ provider })));
            expect(provider.RemoveDynamicHeader).toHaveBeenCalledWith('x-mj-diagnostic-session');
        });

        it('records client-only without the authorization and never sends the local ID to the server', async () => {
            const provider = fakeProvider(false);
            vi.spyOn(DiagnosticsGetMySessionStatusOperation.prototype, 'Execute').mockResolvedValue({
                Success: true,
                Output: { Active: false, SelfServiceRecordingAllowed: false },
            });
            const startSpy = vi.spyOn(DiagnosticsStartSessionOperation.prototype, 'Execute');
            const uploadSpy = vi.spyOn(DiagnosticsUploadClientCaptureOperation.prototype, 'Execute').mockResolvedValue({
                Success: true,
                Output: { SessionID: 'srv-created', ChunksWritten: 0, TotalBytesWritten: 0 },
            });
            vi.spyOn(DiagnosticsBuildBundleOperation.prototype, 'Execute').mockResolvedValue({ Success: false, ErrorMessage: 'stop here' });
            service.Provider = provider;

            const sessionId = await service.StartLiveRecording('FullRaw');
            expect(sessionId).toMatch(/^rec-/);
            expect(startSpy).not.toHaveBeenCalled();
            expect(provider.SetDynamicHeader).not.toHaveBeenCalled();

            await expect(service.SubmitBundleToSupport()).rejects.toThrow('stop here');
            expect(uploadSpy.mock.calls[0][0].SessionID).toBeUndefined();
        });

        it('uploads the client capture once when GraphQL responses carry X-MJ-Diagnostic-Trigger', async () => {
            const uploadSpy = vi.spyOn(DiagnosticsUploadClientCaptureOperation.prototype, 'Execute').mockResolvedValue({
                Success: true,
                Output: { SessionID: 'watch-7', ChunksWritten: 1, TotalBytesWritten: 10 },
            });
            service.Initialize();
            const observer = vi.mocked(RegisterResponseHeaderObserver).mock.calls.at(-1)?.[0] as ResponseHeaderObserver;
            const headers = new Headers({ 'X-MJ-Diagnostic-Trigger': 'watch-7' });
            observer(headers);
            observer(headers);
            service.Dispose();

            await vi.waitFor(() => expect(uploadSpy).toHaveBeenCalledTimes(1));
            expect(uploadSpy.mock.calls[0][0].SessionID).toBe('watch-7');
        });

        it('does not start a recording when a response names the session a session-less Submit just created', async () => {
            const uploadSpy = vi.spyOn(DiagnosticsUploadClientCaptureOperation.prototype, 'Execute').mockResolvedValue({
                Success: true,
                Output: { SessionID: 'srv-oneshot', ChunksWritten: 1, TotalBytesWritten: 10 },
            });
            vi.spyOn(DiagnosticsBuildBundleOperation.prototype, 'Execute').mockResolvedValue({ Success: false, ErrorMessage: 'stop here' });
            service.Initialize();
            const observer = vi.mocked(RegisterResponseHeaderObserver).mock.calls.at(-1)?.[0] as ResponseHeaderObserver;

            await expect(service.SubmitBundleToSupport()).rejects.toThrow('stop here');
            observer(new Headers({ 'X-MJ-Diagnostic-Trigger': 'srv-oneshot' }));
            service.Dispose();

            expect(service.CurrentRecordingState.isRecording).toBe(false);
            expect(uploadSpy).toHaveBeenCalledTimes(1);
        });

        it('explains a refused session-less upload as self-service recording being off', async () => {
            vi.spyOn(DiagnosticsUploadClientCaptureOperation.prototype, 'Execute').mockResolvedValue({
                Success: false,
                ResultCode: 'FORBIDDEN',
                ErrorMessage: "Not authorized to run operation 'Diagnostics.UploadClientCapture'",
            });
            await expect(service.SubmitBundleToSupport()).rejects.toThrow(
                'Self-service recording is turned off on this server. Ask an administrator to start a diagnostic session, or download the snapshot instead.',
            );
        });

        it('refuses to start a live recording while one is running', async () => {
            const provider = fakeProvider(true);
            const startSpy = vi.spyOn(DiagnosticsStartSessionOperation.prototype, 'Execute').mockResolvedValue({
                Success: true,
                Output: { SessionID: 'srv-2', Status: 'Active', StartedAt: '', EndsAt: '', ScrubLiterals: false },
            });
            service.Provider = provider;
            await service.StartLiveRecording('FullRaw');

            await expect(service.StartLiveRecording('FullRaw')).rejects.toThrow(/already running/);
            expect(startSpy).toHaveBeenCalledTimes(1);
        });

        it('Dispose stops the server session it started and clears the session header', async () => {
            const provider = fakeProvider(true);
            vi.spyOn(DiagnosticsStartSessionOperation.prototype, 'Execute').mockResolvedValue({
                Success: true,
                Output: { SessionID: 'srv-3', Status: 'Active', StartedAt: '', EndsAt: '', ScrubLiterals: false },
            });
            const stopSpy = vi.spyOn(DiagnosticsStopSessionOperation.prototype, 'Execute').mockResolvedValue({
                Success: true,
                Output: { SessionID: 'srv-3', Status: 'Stopped', StoppedAt: '', FlushedChunkCount: 0 },
            });
            service.Provider = provider;
            await service.StartLiveRecording('FullRaw');

            service.Dispose();

            await vi.waitFor(() => expect(stopSpy).toHaveBeenCalledWith({ SessionID: 'srv-3' }, expect.objectContaining({ provider })));
            expect(provider.RemoveDynamicHeader).toHaveBeenCalledWith('x-mj-diagnostic-session');
        });

        it('a Submit long after a stopped recording does not upload into the stopped session', async () => {
            const uploadSpy = vi.spyOn(DiagnosticsUploadClientCaptureOperation.prototype, 'Execute').mockResolvedValue({
                Success: true,
                Output: { SessionID: 'srv-new', ChunksWritten: 0, TotalBytesWritten: 0 },
            });
            vi.spyOn(DiagnosticsBuildBundleOperation.prototype, 'Execute').mockResolvedValue({ Success: false, ErrorMessage: 'stop here' });
            service.StartRecording('srv-old', 'FullRaw');
            service.StopRecording();

            await expect(service.SubmitBundleToSupport()).rejects.toThrow('stop here');
            expect(uploadSpy.mock.calls[0][0].SessionID).toBeUndefined();
        });
    });
});
