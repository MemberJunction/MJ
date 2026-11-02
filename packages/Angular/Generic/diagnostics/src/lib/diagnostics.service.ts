import { Injectable, NgZone, inject } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import {
    RegisterLogSink,
    TelemetryManager,
    TelemetryEvent,
} from '@memberjunction/core';
import {
    BoundedRingBuffer,
    DiagnosticLogEntry,
    DiagnosticTelemetryEntry,
    DiagnosticNetworkEntry,
    DiagnosticFinding,
    DiagnosticScrubberProfile,
    DiagnosticMode,
    DiagnosticBundleManifest,
    DiagnosticBundleData,
    ScrubBundleData,
    ScrubString,
    BuildMjdiagArchive,
    VerifyBundleArchive,
    AnalyzeDiagnosticBundleData,
} from '@memberjunction/diagnostics';

export const MJ_DIAGNOSTICS_IDB_NAME = 'MJ_Diagnostics';
const IDB_STORE_NAME = 'session_buffer';

export interface ActiveRecordingState {
    isRecording: boolean;
    sessionId: string | null;
    mode: DiagnosticMode;
    startedAtIso: string | null;
    scrubberProfile: DiagnosticScrubberProfile;
}

export interface ClientBundleBuildOptions {
    scrubberProfile?: DiagnosticScrubberProfile;
    includeHar?: boolean;
    note?: string;
    ticketNumber?: string;
    createdByUserId?: string;
    mjVersion?: string;
}

export interface ClientBundleBuildResult {
    bundleId: string;
    manifest: DiagnosticBundleManifest;
    findings: DiagnosticFinding[];
    zipBytes: Uint8Array;
}

function tryInjectNgZone(): NgZone | null {
    try {
        return inject(NgZone, { optional: true });
    } catch {
        return null;
    }
}

@Injectable({
    providedIn: 'root',
})
export class MJDiagnosticsService {
    private readonly ngZone = tryInjectNgZone();

    private readonly logBuffer = new BoundedRingBuffer<DiagnosticLogEntry>({
        maxItems: 2_000,
        maxBytes: 4 * 1024 * 1024,
    });
    private readonly telemetryBuffer = new BoundedRingBuffer<DiagnosticTelemetryEntry>({
        maxItems: 2_000,
        maxBytes: 4 * 1024 * 1024,
    });
    private readonly networkBuffer = new BoundedRingBuffer<DiagnosticNetworkEntry>({
        maxItems: 500,
        maxBytes: 4 * 1024 * 1024,
    });

    private readonly recordingStateSubject = new BehaviorSubject<ActiveRecordingState>({
        isRecording: false,
        sessionId: null,
        mode: 'flight-recorder',
        startedAtIso: null,
        scrubberProfile: 'Standard',
    });

    private readonly reportDialogOpenSubject = new BehaviorSubject<boolean>(false);

    private initialized = false;
    private unregisterLoggerSink: (() => void) | null = null;
    private unsubscribeTelemetry: (() => void) | null = null;
    private idbFlushTimer: ReturnType<typeof setTimeout> | null = null;
    private sessionIdHook: ((sessionId: string | null) => void) | null = null;

    public get RecordingState$(): Observable<ActiveRecordingState> {
        return this.recordingStateSubject.asObservable();
    }

    public get CurrentRecordingState(): ActiveRecordingState {
        return this.recordingStateSubject.value;
    }

    public get ReportDialogOpen$(): Observable<boolean> {
        return this.reportDialogOpenSubject.asObservable();
    }

    /**
     * Registers a hook (such as GraphQLDataProvider.Instance.SetActiveDiagnosticSessionId)
     * that is updated whenever a recording session starts or stops.
     */
    public RegisterSessionHeaderHook(hook: (sessionId: string | null) => void): void {
        this.sessionIdHook = hook;
        hook(this.recordingStateSubject.value.sessionId);
    }

    /**
     * Initializes background client-side capture inside NgZone.runOutsideAngular()
     * so high-frequency log, telemetry, and performance events never trigger Angular CD.
     */
    public Initialize(): void {
        if (this.initialized) {
            return;
        }
        this.initialized = true;

        this.runOutsideZone(() => {
            this.unregisterLoggerSink = RegisterLogSink((entry) => {
                const severityMap: Record<string, DiagnosticLogEntry['severity']> = {
                    debug: 'debug',
                    info: 'info',
                    warning: 'warn',
                    error: 'error',
                    critical: 'error',
                };
                this.RecordLogEntry({
                    timestamp: new Date(entry.ts).toISOString(),
                    severity: severityMap[entry.severity] ?? 'info',
                    source: 'client',
                    message: entry.message,
                    category: entry.category,
                    traceId: entry.traceId,
                });
            });

            this.unsubscribeTelemetry = TelemetryManager.Instance.OnEvent((event) => {
                this.RecordTelemetryEvent(event);
            });
        });
    }

    /**
     * Disposes listeners and timers.
     */
    public Dispose(): void {
        if (this.unregisterLoggerSink) {
            this.unregisterLoggerSink();
            this.unregisterLoggerSink = null;
        }
        if (this.unsubscribeTelemetry) {
            this.unsubscribeTelemetry();
            this.unsubscribeTelemetry = null;
        }
        if (this.idbFlushTimer) {
            clearTimeout(this.idbFlushTimer);
            this.idbFlushTimer = null;
        }
        this.initialized = false;
    }

    public OpenReportProblemDialog(): void {
        this.reportDialogOpenSubject.next(true);
    }

    public CloseReportProblemDialog(): void {
        this.reportDialogOpenSubject.next(false);
    }

    /**
     * Starts a client/server recording session and binds the session ID header hook.
     */
    public StartRecording(sessionId: string, scrubberProfile: DiagnosticScrubberProfile = 'Standard'): void {
        const nextState: ActiveRecordingState = {
            isRecording: true,
            sessionId,
            mode: 'active-recording',
            startedAtIso: new Date().toISOString(),
            scrubberProfile,
        };
        this.recordingStateSubject.next(nextState);
        if (this.sessionIdHook) {
            this.sessionIdHook(sessionId);
        }
        this.scheduleIdbFlush();
    }

    /**
     * Stops the active recording session and unbinds the session ID header hook.
     */
    public StopRecording(): void {
        const nextState: ActiveRecordingState = {
            isRecording: false,
            sessionId: null,
            mode: 'flight-recorder',
            startedAtIso: null,
            scrubberProfile: 'Standard',
        };
        this.recordingStateSubject.next(nextState);
        if (this.sessionIdHook) {
            this.sessionIdHook(null);
        }
    }

    public RecordLogEntry(entry: DiagnosticLogEntry): void {
        this.logBuffer.Push(entry);
        if (this.recordingStateSubject.value.isRecording) {
            this.scheduleIdbFlush();
        }
    }

    public RecordTelemetryEntry(entry: DiagnosticTelemetryEntry): void {
        this.telemetryBuffer.Push(entry);
        if (this.recordingStateSubject.value.isRecording) {
            this.scheduleIdbFlush();
        }
    }

    public RecordNetworkEntry(entry: DiagnosticNetworkEntry): void {
        this.networkBuffer.Push(entry);
        if (this.recordingStateSubject.value.isRecording) {
            this.scheduleIdbFlush();
        }
    }

    /**
     * Builds a scrubbed `.mjdiag` archive from the current client-side buffers.
     */
    public async BuildClientBundle(options: ClientBundleBuildOptions = {}): Promise<ClientBundleBuildResult> {
        const scrubberProfile: DiagnosticScrubberProfile = options.scrubberProfile ?? 'Standard';
        const bundleId = `diag-client-${Date.now()}`;

        const rawBundleData: DiagnosticBundleData = {
            environment: {
                mjVersion: options.mjVersion ?? '6.2.0',
                browserUserAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'headless',
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            },
            repro: {
                userComment: options.note ? ScrubString(options.note, { scrubberProfile }) : undefined,
                breadcrumbs: [],
            },
            clientLogs: this.logBuffer.ToArray(),
            clientWaterfall: options.includeHar !== false ? this.networkBuffer.ToArray() : [],
            clientTelemetry: this.telemetryBuffer.ToArray(),
            serverTraces: [],
            serverSql: [],
            serverLogs: [],
            findings: [],
        };

        const scrubbed = ScrubBundleData(rawBundleData, { scrubberProfile });
        scrubbed.findings = AnalyzeDiagnosticBundleData(scrubbed);

        const zipBytes = await BuildMjdiagArchive(scrubbed, {
            bundleId,
            sessionId: this.recordingStateSubject.value.sessionId ?? undefined,
            captureReason: options.ticketNumber ? `Ticket:${options.ticketNumber}` : 'Manual',
            scrubberProfile,
            redactionSummary: {
                credentialsScrubbedCount: scrubbed.clientLogs.length,
                sqlLiteralsNormalizedCount: 0,
                customPatternsAppliedCount: 0,
            },
        });

        const verified = await VerifyBundleArchive(zipBytes);
        if (!verified.valid || !verified.manifest) {
            throw new Error(`Client diagnostic bundle failed verification: ${verified.reason}`);
        }

        return {
            bundleId,
            manifest: verified.manifest,
            findings: scrubbed.findings,
            zipBytes,
        };
    }

    /**
     * Clears in-memory buffers (used in tests or when resetting session state).
     */
    public ClearBuffers(): void {
        this.logBuffer.Clear();
        this.telemetryBuffer.Clear();
        this.networkBuffer.Clear();
    }

    private RecordTelemetryEvent(event: TelemetryEvent): void {
        const origin = TelemetryManager.Instance.TimeOrigin;
        this.RecordTelemetryEntry({
            id: event.id,
            category: event.category,
            operation: event.operation,
            startTimeUnixMs: origin + event.startTime,
            durationMs: event.elapsedMs ?? 0,
            traceId: event.traceId,
            params: event.params as Record<string, unknown>,
        });
    }

    private scheduleIdbFlush(): void {
        if (this.idbFlushTimer !== null) {
            return;
        }
        this.runOutsideZone(() => {
            this.idbFlushTimer = setTimeout(() => {
                this.idbFlushTimer = null;
                void this.flushToIndexedDb();
            }, 1_000);
        });
    }

    private async flushToIndexedDb(): Promise<void> {
        if (typeof indexedDB === 'undefined') {
            return;
        }
        try {
            const db = await new Promise<IDBDatabase>((resolve, reject) => {
                const req = indexedDB.open(MJ_DIAGNOSTICS_IDB_NAME, 1);
                req.onupgradeneeded = () => {
                    const database = req.result;
                    if (!database.objectStoreNames.contains(IDB_STORE_NAME)) {
                        database.createObjectStore(IDB_STORE_NAME);
                    }
                };
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });

            await new Promise<void>((resolve, reject) => {
                const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
                const store = tx.objectStore(IDB_STORE_NAME);
                store.put(
                    {
                        updatedAt: new Date().toISOString(),
                        sessionId: this.recordingStateSubject.value.sessionId,
                        logs: this.logBuffer.ToArray(),
                        telemetry: this.telemetryBuffer.ToArray(),
                    },
                    'active_recording',
                );
                tx.oncomplete = () => {
                    db.close();
                    resolve();
                };
                tx.onerror = () => {
                    db.close();
                    reject(tx.error);
                };
            });
        } catch {
            // Ignore IndexedDB quota/availability errors in private browsing
        }
    }

    private runOutsideZone(fn: () => void): void {
        if (this.ngZone) {
            this.ngZone.runOutsideAngular(fn);
        } else {
            fn();
        }
    }
}
