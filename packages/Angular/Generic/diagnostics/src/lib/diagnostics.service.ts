import { Injectable, NgZone, inject } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import {
    IMetadataProvider,
    LogError,
    Metadata,
    RegisterLogSink,
    TelemetryManager,
    TelemetryEvent,
} from '@memberjunction/core';
import {
    DiagnosticsStartSessionOperation,
    DiagnosticsStopSessionOperation,
    DiagnosticsGetMySessionStatusOperation,
    DiagnosticsUploadClientCaptureOperation,
    DiagnosticsBuildBundleOperation,
    DiagnosticsGetBundlePreviewOperation,
    DiagnosticsSendBundleOperation,
    DiagnosticsSendBundleInput,
    DiagnosticsSendBundleOutput,
    DiagnosticsUploadClientCaptureInput,
} from '@memberjunction/core-entities';
import {
    BoundedRingBuffer,
    DiagnosticBreadcrumb,
    DiagnosticLogEntry,
    DiagnosticTelemetryEntry,
    DiagnosticNetworkEntry,
    DiagnosticFinding,
    DiagnosticScrubberProfile,
    DiagnosticMode,
    DiagnosticBundleManifest,
    DiagnosticBundleData,
    ScrubBundleDataWithCount,
    ScrubString,
    BuildMjdiagArchive,
    VerifyBundleArchive,
    AnalyzeDiagnosticBundleData,
} from '@memberjunction/diagnostics';
import {
    GraphQLDataProvider,
    GraphQLResponseHeaders,
    RegisterNetworkDiagnosticObserver,
    RegisterResponseHeaderObserver,
} from '@memberjunction/graphql-dataprovider';
import {
    BrowserSessionIdOf,
    DIAGNOSTIC_TRIGGER_HEADER,
    SelfSessionScope,
    SetDiagnosticSessionHeader,
    ToNetworkEntry,
    UploadFailureMessage,
    UserCanRunDiagnosticSessions,
} from './live-recording';
import { RegisterBreadcrumbListeners, RouteBreadcrumb } from './breadcrumbs';

export const MJ_DIAGNOSTICS_IDB_NAME = 'MJ_Diagnostics';

/**
 * Scrubber profile used when a caller gives none. It matches the server default (`ScrubLiterals = false`).
 * `FullRaw` = Stage 1 credential scrubbing only; SQL and filter literals are kept.
 * `Standard` = Stage 1 plus Stage 2, which replaces SQL and filter literals with `?`.
 * The bundle manifest records the same name in `scrubberProfile`.
 */
export const DEFAULT_DIAGNOSTIC_SCRUBBER_PROFILE: DiagnosticScrubberProfile = 'FullRaw';
const IDB_STORE_NAME = 'session_buffer';

export interface ActiveRecordingState {
    isRecording: boolean;
    sessionId: string | null;
    /** The server session that captures this recording; `null` for a client-only recording. */
    serverSessionId: string | null;
    mode: DiagnosticMode;
    startedAtIso: string | null;
    scrubberProfile: DiagnosticScrubberProfile;
}

export interface ClientBundleBuildOptions {
    scrubberProfile?: DiagnosticScrubberProfile;
    includeHar?: boolean;
    note?: string;
    reason?: string;
    ticketNumber?: string;
    /** Session recorded in the manifest. Defaults to the active recording session. */
    sessionId?: string;
    createdByUserId?: string;
    mjVersion?: string;
}

export interface ClientBundleBuildResult {
    bundleId: string;
    manifest: DiagnosticBundleManifest;
    findings: DiagnosticFinding[];
    zipBytes: Uint8Array;
}

export interface SubmitBundleToSupportOptions {
    scrubberProfile?: DiagnosticScrubberProfile;
    destination?: DiagnosticsSendBundleInput['Destination'];
    contactInfo?: string;
    note?: string;
    ticketNumber?: string;
}

export interface SubmitBundleToSupportResult {
    sessionId: string;
    bundleId: string;
    status: DiagnosticsSendBundleOutput['Status'];
    destination: DiagnosticsSendBundleOutput['Destination'];
    externalReferenceId?: string;
    sentAt?: string;
    findingsCount: number;
    downloadUrl?: string;
    errorMessage?: string;
}

/** The client entries one upload sends. */
interface ClientCapture {
    logs: DiagnosticLogEntry[];
    network: DiagnosticNetworkEntry[];
    telemetry: DiagnosticTelemetryEntry[];
    breadcrumbs: DiagnosticBreadcrumb[];
}

/** The upload fields that carry a client capture. */
function captureUploadFields(
    capture: ClientCapture,
): Pick<DiagnosticsUploadClientCaptureInput, 'Repro' | 'ClientLogs' | 'ClientWaterfall' | 'ClientTelemetry'> {
    return {
        Repro: { breadcrumbs: capture.breadcrumbs },
        ClientLogs: capture.logs as unknown as Array<Record<string, unknown>>,
        ClientWaterfall: capture.network as unknown as Array<Record<string, unknown>>,
        ClientTelemetry: capture.telemetry as unknown as Array<Record<string, unknown>>,
    };
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
    private readonly breadcrumbBuffer = new BoundedRingBuffer<DiagnosticBreadcrumb>({
        maxItems: 100,
        maxBytes: 64 * 1024,
    });

    private readonly recordingStateSubject = new BehaviorSubject<ActiveRecordingState>({
        isRecording: false,
        sessionId: null,
        serverSessionId: null,
        mode: 'flight-recorder',
        startedAtIso: null,
        scrubberProfile: DEFAULT_DIAGNOSTIC_SCRUBBER_PROFILE,
    });

    private readonly reportDialogOpenSubject = new BehaviorSubject<boolean>(false);
    private readonly packageRequestSubject = new Subject<ActiveRecordingState>();

    private initialized = false;
    private unregisterLoggerSink: (() => void) | null = null;
    private unsubscribeTelemetry: (() => void) | null = null;
    private unregisterBreadcrumbListeners: (() => void) | null = null;
    /** True while a recording keeps telemetry on that was off before it started. */
    private telemetryEnabledByRecording = false;
    private idbFlushTimer: ReturnType<typeof setTimeout> | null = null;
    private sessionIdHook: ((sessionId: string | null) => void) | null = null;
    private readonly flushedTriggerSessions = new Set<string>();
    private unregisterNetworkObserver: (() => void) | null = null;
    private unregisterResponseHeaders: (() => void) | null = null;
    /** Server session this service started for the current live recording; stopped with the recording. */
    private ownedServerSessionId: string | null = null;
    /** Server session the next Submit uploads to; `null` for a client-only recording. */
    private submitSessionId: string | null = null;
    private recordingProvider: IMetadataProvider | null = null;
    private pendingStop: Promise<void> | null = null;
    /** True from the start of `StartLiveRecording` until it ends, so a second call is refused. */
    private isStartingRecording = false;
    /** The client entries each server session already holds, so a later upload to it sends only new ones. */
    private readonly uploadedToSession = new Map<string, WeakSet<object>>();

    /** Provider for remote operations. Defaults to the global provider when not set. */
    public Provider: IMetadataProvider | null = null;

    public get ProviderToUse(): IMetadataProvider {
        return this.Provider ?? Metadata.Provider;
    }

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
     * Emits the stopped recording's state each time a recording is stopped for packaging.
     * The report-problem dialog listens to this to build and show the snapshot.
     */
    public get PackageRequests$(): Observable<ActiveRecordingState> {
        return this.packageRequestSubject.asObservable();
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
                this.recordTelemetryEvent(event);
            });

            this.unregisterResponseHeaders = RegisterResponseHeaderObserver((headers) => {
                this.onResponseHeaders(headers);
            });

            this.unregisterBreadcrumbListeners = RegisterBreadcrumbListeners((crumb) => this.RecordBreadcrumb(crumb));
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
        this.unregisterResponseHeaders?.();
        this.unregisterResponseHeaders = null;
        this.unregisterBreadcrumbListeners?.();
        this.unregisterBreadcrumbListeners = null;
        this.unregisterNetworkObserver?.();
        this.unregisterNetworkObserver = null;
        if (this.ownedServerSessionId) {
            this.StopRecording();
        }
        this.initialized = false;
    }

    public OpenReportProblemDialog(): void {
        this.reportDialogOpenSubject.next(true);
    }

    public CloseReportProblemDialog(): void {
        this.reportDialogOpenSubject.next(false);
        if (!this.recordingStateSubject.value.isRecording) {
            this.submitSessionId = null;
        }
    }

    /**
     * Starts a live recording. When the user holds `Diagnostics: Run Sessions` or self-service
     * recording is on, a server session for this user and browser session is started, every request
     * carries its ID and the network waterfall is recorded. Otherwise the recording is client-only
     * under a local `rec-…` ID that is never sent to the server. Returns the recording's session ID.
     */
    public async StartLiveRecording(scrubberProfile: DiagnosticScrubberProfile = DEFAULT_DIAGNOSTIC_SCRUBBER_PROFILE): Promise<string> {
        if (this.recordingStateSubject.value.isRecording || this.isStartingRecording) {
            throw new Error('A recording is already running. Stop it before you start a new one.');
        }
        this.isStartingRecording = true;
        try {
            return await this.startLiveRecording(scrubberProfile);
        } finally {
            this.isStartingRecording = false;
        }
    }

    /** Starts the server session (when allowed) and the recording; see {@link StartLiveRecording}. */
    private async startLiveRecording(scrubberProfile: DiagnosticScrubberProfile): Promise<string> {
        const provider = this.ProviderToUse;
        await this.pendingStop;
        this.ensureNetworkObserver();
        const serverSessionId = await this.startServerSession(provider);
        if (serverSessionId) {
            this.ensureSessionHeaderHook(provider);
            this.flushedTriggerSessions.add(serverSessionId);
        }
        const sessionId = serverSessionId ?? `rec-${Date.now()}`;
        this.beginRecording(sessionId, scrubberProfile, serverSessionId);
        this.ownedServerSessionId = serverSessionId;
        this.recordingProvider = provider;
        return sessionId;
    }

    /**
     * Starts recording under an existing server session ID and binds the session ID header hook.
     */
    public StartRecording(sessionId: string, scrubberProfile: DiagnosticScrubberProfile = DEFAULT_DIAGNOSTIC_SCRUBBER_PROFILE): void {
        this.beginRecording(sessionId, scrubberProfile, sessionId);
    }

    /** Sets the recording state; `serverSessionId` goes in the session header and is the Submit target. */
    private beginRecording(sessionId: string, scrubberProfile: DiagnosticScrubberProfile, serverSessionId: string | null): void {
        this.submitSessionId = serverSessionId;
        this.enableTelemetryForRecording();
        const nextState: ActiveRecordingState = {
            isRecording: true,
            sessionId,
            serverSessionId,
            mode: 'active-recording',
            startedAtIso: new Date().toISOString(),
            scrubberProfile,
        };
        this.recordingStateSubject.next(nextState);
        if (this.sessionIdHook) {
            this.sessionIdHook(serverSessionId);
        }
        this.scheduleIdbFlush();
    }

    /** Turns telemetry on for the recording when it is off, so `client/telemetry.ndjson` has data. */
    private enableTelemetryForRecording(): void {
        const tm = TelemetryManager.Instance;
        if (!tm.IsEnabled) {
            tm.SetEnabled(true);
            this.telemetryEnabledByRecording = true;
        }
    }

    /** Turns telemetry back off when only the recording had turned it on. */
    private restoreTelemetryAfterRecording(): void {
        if (this.telemetryEnabledByRecording) {
            TelemetryManager.Instance.SetEnabled(false);
            this.telemetryEnabledByRecording = false;
        }
    }

    /** Starts a server session for this user and browser session when allowed; otherwise returns `null`. */
    private async startServerSession(provider: IMetadataProvider): Promise<string | null> {
        if (!UserCanRunDiagnosticSessions(provider) && !(await this.selfServiceAllowed(provider))) {
            return null;
        }
        const result = await new DiagnosticsStartSessionOperation().Execute(
            {
                Name: `Live recording ${new Date().toISOString()}`,
                Reason: 'UserLiveRecording',
                ScopeType: 'Users',
                Scope: SelfSessionScope(provider),
            },
            { provider },
        );
        if (!result.Success || !result.Output) {
            throw new Error(result.ErrorMessage ?? 'Failed to start a diagnostic session on the server');
        }
        return result.Output.SessionID;
    }

    private async selfServiceAllowed(provider: IMetadataProvider): Promise<boolean> {
        const status = await new DiagnosticsGetMySessionStatusOperation().Execute(
            { BrowserSessionID: BrowserSessionIdOf(provider) },
            { provider },
        );
        return Boolean(status.Success && status.Output?.SelfServiceRecordingAllowed);
    }

    private async stopServerSession(sessionId: string, provider: IMetadataProvider): Promise<void> {
        const result = await new DiagnosticsStopSessionOperation().Execute({ SessionID: sessionId }, { provider });
        if (!result.Success) {
            LogError(`Could not stop diagnostic session '${sessionId}': ${result.ErrorMessage ?? 'unknown error'}`);
        }
    }

    /**
     * Registers a header hook that sets `x-mj-diagnostic-session` on the provider, when no hook is registered.
     * The service has one hook slot, so the hook stays bound to the first provider it was registered for.
     */
    private ensureSessionHeaderHook(provider: IMetadataProvider): void {
        if (!this.sessionIdHook) {
            this.RegisterSessionHeaderHook((id) => SetDiagnosticSessionHeader(provider, id));
        }
    }

    /** Records every GraphQL network operation in the waterfall buffer. */
    private ensureNetworkObserver(): void {
        if (!this.unregisterNetworkObserver) {
            this.unregisterNetworkObserver = RegisterNetworkDiagnosticObserver((observation) => {
                this.RecordNetworkEntry(ToNetworkEntry(observation));
            });
        }
    }

    /** Uploads the client capture when a response carries `X-MJ-Diagnostic-Trigger`. */
    private onResponseHeaders(headers: GraphQLResponseHeaders): void {
        const sessionId = headers.get(DIAGNOSTIC_TRIGGER_HEADER);
        if (sessionId) {
            this.HandleServerTriggerHeader(sessionId).catch((err) => {
                LogError(`Diagnostic trigger upload failed: ${err instanceof Error ? err.message : String(err)}`);
            });
        }
    }

    /**
     * Stops the active recording, unbinds the session ID header hook and stops the server
     * session this service started for it.
     */
    public StopRecording(): void {
        const nextState: ActiveRecordingState = {
            isRecording: false,
            sessionId: null,
            serverSessionId: null,
            mode: 'flight-recorder',
            startedAtIso: null,
            scrubberProfile: DEFAULT_DIAGNOSTIC_SCRUBBER_PROFILE,
        };
        this.recordingStateSubject.next(nextState);
        this.restoreTelemetryAfterRecording();
        if (this.sessionIdHook) {
            this.sessionIdHook(null);
        }
        const owned = this.ownedServerSessionId;
        if (owned) {
            this.ownedServerSessionId = null;
            this.pendingStop = this.stopServerSession(owned, this.recordingProvider ?? this.ProviderToUse);
        }
        this.submitSessionId = null;
    }

    /**
     * Stops the active recording, opens the report-problem dialog and asks it to build
     * a snapshot for the stopped session.
     */
    public StopAndPackageRecording(): void {
        const stopped = this.recordingStateSubject.value;
        const packagedSessionId = this.submitSessionId;
        this.StopRecording();
        this.submitSessionId = packagedSessionId;
        this.OpenReportProblemDialog();
        this.packageRequestSubject.next(stopped);
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
     * Adds a step to the breadcrumb trail that bundles carry in `repro.json`. `Initialize` records
     * clicks, uncaught errors and unhandled promise rejections; an app adds other steps here.
     */
    public RecordBreadcrumb(crumb: DiagnosticBreadcrumb): void {
        this.breadcrumbBuffer.Push(crumb);
    }

    /** Adds a page the user went to as a breadcrumb. The query string and fragment are left out. */
    public RecordRouteBreadcrumb(url: string): void {
        this.RecordBreadcrumb(RouteBreadcrumb(url));
    }

    /** The buffered entries that `sessionId` does not hold yet; every buffered entry when no session is given. */
    private captureToUpload(sessionId: string | undefined): ClientCapture {
        const held = sessionId ? this.uploadedToSession.get(sessionId) : undefined;
        const unsent = <T extends object>(buffer: BoundedRingBuffer<T>): T[] =>
            buffer.ToArray().filter((entry) => !held?.has(entry));
        return {
            logs: unsent(this.logBuffer),
            network: unsent(this.networkBuffer),
            telemetry: unsent(this.telemetryBuffer),
            breadcrumbs: unsent(this.breadcrumbBuffer),
        };
    }

    /** Records that `sessionId` now holds the entries of an upload. */
    private markUploaded(sessionId: string, capture: ClientCapture): void {
        let held = this.uploadedToSession.get(sessionId);
        if (!held) {
            held = new WeakSet<object>();
            this.uploadedToSession.set(sessionId, held);
        }
        for (const entry of [...capture.logs, ...capture.network, ...capture.telemetry, ...capture.breadcrumbs]) {
            held.add(entry);
        }
    }

    /**
     * Handles the server-sent `X-MJ-Diagnostic-Trigger: <sessionId>` header when an admin/server
     * Watch Session matches the current user or GraphQL operation. Automatically flushes the
     * browser flight-recorder buffers to the server session once per triggered session ID.
     */
    public async HandleServerTriggerHeader(sessionId: string): Promise<boolean> {
        const trimmed = sessionId?.trim();
        if (!trimmed || this.flushedTriggerSessions.has(trimmed)) {
            return false;
        }
        this.flushedTriggerSessions.add(trimmed);
        this.StartRecording(trimmed, 'Standard');

        const capture = this.captureToUpload(trimmed);
        const uploadOp = new DiagnosticsUploadClientCaptureOperation();
        const result = await uploadOp.Execute({
            SessionID: trimmed,
            CreateSelfServiceSession: false,
            Reason: 'ServerWatchTrigger',
            ScrubLiterals: true,
            Environment: {
                mjVersion: '6.2.0',
                browserUserAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'headless',
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            },
            ...captureUploadFields(capture),
        }, { provider: this.ProviderToUse });
        if (result.Success) {
            this.markUploaded(trimmed, capture);
        }
        return result.Success;
    }

    /**
     * Submits a full-stack (client + server) diagnostic bundle from the UX:
     * 1. Uploads current client flight-recorder/recording buffers via `DiagnosticsUploadClientCaptureOperation`
     * 2. Assembles the merged `.mjdiag` bundle on the server via `DiagnosticsBuildBundleOperation`
     * 3. Encrypts and transmits the bundle to Support/Collector via `DiagnosticsSendBundleOperation`
     */
    public async SubmitBundleToSupport(
        options: SubmitBundleToSupportOptions = {},
    ): Promise<SubmitBundleToSupportResult> {
        const scrubberProfile: DiagnosticScrubberProfile = options.scrubberProfile ?? DEFAULT_DIAGNOSTIC_SCRUBBER_PROFILE;
        const scrubLiterals = scrubberProfile === 'Standard';
        const provider = this.ProviderToUse;
        await this.pendingStop;
        const activeSessionId = this.submitSessionId ?? undefined;
        const capture = this.captureToUpload(activeSessionId);
        const userComment = options.note ? ScrubString(options.note, { scrubberProfile }) : undefined;

        const uploadOp = new DiagnosticsUploadClientCaptureOperation();
        const uploadRes = await uploadOp.Execute({
            SessionID: activeSessionId,
            CreateSelfServiceSession: !activeSessionId,
            Reason: options.ticketNumber ? `Ticket:${options.ticketNumber}` : 'UserReportedProblem',
            ScrubLiterals: scrubLiterals,
            Environment: {
                mjVersion: '6.2.0',
                browserUserAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'headless',
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            },
            ...captureUploadFields(capture),
        }, { provider });

        if (!uploadRes.Success || !uploadRes.Output) {
            throw new Error(UploadFailureMessage(uploadRes, activeSessionId));
        }

        const resolvedSessionId = uploadRes.Output.SessionID;
        this.markUploaded(resolvedSessionId, capture);
        this.flushedTriggerSessions.add(resolvedSessionId);
        const buildOp = new DiagnosticsBuildBundleOperation();
        const buildRes = await buildOp.Execute({
            SessionID: resolvedSessionId,
            Name: options.ticketNumber ? `Support Bundle (${options.ticketNumber})` : 'Support Diagnostic Bundle',
            Description: options.note,
            ScrubLiterals: scrubLiterals,
            ClientBundleData: userComment ? { repro: { userComment } } : undefined,
        }, { provider });

        if (!buildRes.Success || !buildRes.Output || buildRes.Output.Status !== 'Ready') {
            throw new Error(buildRes.ErrorMessage ?? 'Failed to assemble diagnostic bundle on server');
        }

        const destination: DiagnosticsSendBundleInput['Destination'] = options.destination ?? 'MJC';
        const sendOp = new DiagnosticsSendBundleOperation();
        const sendRes = await sendOp.Execute({
            BundleID: buildRes.Output.BundleID,
            Destination: destination,
            ContactInfo: options.contactInfo,
            Summary: options.note ?? options.ticketNumber,
        }, { provider });

        if (!sendRes.Success || !sendRes.Output) {
            return {
                sessionId: resolvedSessionId,
                bundleId: buildRes.Output.BundleID,
                status: 'Failed',
                destination,
                findingsCount: buildRes.Output.FindingsCount,
                downloadUrl: buildRes.Output.DownloadUrl,
                errorMessage: sendRes.ErrorMessage ?? 'Failed to transmit bundle to collector',
            };
        }

        return {
            sessionId: resolvedSessionId,
            bundleId: buildRes.Output.BundleID,
            status: sendRes.Output.Status,
            destination: sendRes.Output.Destination,
            externalReferenceId: sendRes.Output.ExternalReferenceID,
            sentAt: sendRes.Output.SentAt,
            findingsCount: buildRes.Output.FindingsCount,
            downloadUrl: buildRes.Output.DownloadUrl,
            errorMessage: sendRes.Output.ErrorMessage,
        };
    }

    /**
     * Downloads a server-built bundle. The link minted at build time is single-use and expires after a
     * minute, so this mints a fresh one through `DiagnosticsGetBundlePreviewOperation` and starts the
     * browser download from it. Returns the link it used.
     */
    public async DownloadServerBundle(bundleId: string): Promise<string> {
        const previewOp = new DiagnosticsGetBundlePreviewOperation();
        const res = await previewOp.Execute({ BundleID: bundleId, MintDownloadToken: true }, { provider: this.ProviderToUse });
        if (!res.Success || !res.Output?.DownloadUrl) {
            throw new Error(res.ErrorMessage ?? `The server gave no download link for bundle ${bundleId}`);
        }
        const url = this.resolveOnApiServer(res.Output.DownloadUrl);
        this.startBrowserDownload(url);
        return url;
    }

    /**
     * Resolves a link against the API server the provider talks to. A link without an origin
     * would otherwise open on the app's own page instead of the API.
     */
    private resolveOnApiServer(url: string): string {
        const provider = this.ProviderToUse;
        const apiUrl = provider instanceof GraphQLDataProvider ? provider.ConfigData?.URL : undefined;
        return apiUrl ? new URL(url, apiUrl).toString() : url;
    }

    /**
     * Points a hidden frame at a cross-origin download URL. The attachment response downloads
     * without leaving the page; the frame is removed once the single-use link has expired.
     */
    private startBrowserDownload(url: string): void {
        if (typeof document === 'undefined') {
            return;
        }
        const frame = document.createElement('iframe');
        frame.style.display = 'none';
        frame.setAttribute('aria-hidden', 'true');
        frame.src = url;
        (document.body ?? document.documentElement).appendChild(frame);
        const timer = setTimeout(() => {
            frame.parentNode?.removeChild(frame);
        }, 60_000);
        if (typeof (timer as unknown as { unref?: () => void }).unref === 'function') {
            (timer as unknown as { unref: () => void }).unref();
        }
    }

    /**
     * Triggers a browser file download of a built `.mjdiag` archive.
     */
    public DownloadClientBundle(result: ClientBundleBuildResult): void {
        if (typeof document === 'undefined' || typeof URL === 'undefined') {
            return;
        }
        const copy = new Uint8Array(result.zipBytes.byteLength);
        copy.set(result.zipBytes);
        const blob = new Blob([copy.buffer], { type: 'application/zip' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.style.display = 'none';
        anchor.href = url;
        anchor.download = `${result.bundleId}.mjdiag`;
        if (document.body) {
            document.body.appendChild(anchor);
        }
        anchor.click();
        if (anchor.parentNode) {
            anchor.parentNode.removeChild(anchor);
        }
        const timer = setTimeout(() => {
            URL.revokeObjectURL(url);
        }, 1_000);
        if (typeof (timer as unknown as { unref?: () => void }).unref === 'function') {
            (timer as unknown as { unref: () => void }).unref();
        }
    }

    /**
     * Builds a scrubbed `.mjdiag` archive from the current client-side buffers.
     */
    public async BuildClientBundle(options: ClientBundleBuildOptions = {}): Promise<ClientBundleBuildResult> {
        const scrubberProfile: DiagnosticScrubberProfile = options.scrubberProfile ?? DEFAULT_DIAGNOSTIC_SCRUBBER_PROFILE;
        const bundleId = `diag-client-${Date.now()}`;

        const rawBundleData: DiagnosticBundleData = {
            environment: {
                mjVersion: options.mjVersion ?? '6.2.0',
                browserUserAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'headless',
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            },
            repro: {
                userComment: options.note ? ScrubString(options.note, { scrubberProfile }) : undefined,
                breadcrumbs: this.breadcrumbBuffer.ToArray(),
            },
            clientLogs: this.logBuffer.ToArray(),
            clientWaterfall: options.includeHar !== false ? this.networkBuffer.ToArray() : [],
            clientTelemetry: this.telemetryBuffer.ToArray(),
            serverTraces: [],
            serverSql: [],
            serverLogs: [],
            findings: [],
        };

        const scrubResult = ScrubBundleDataWithCount(rawBundleData, { scrubberProfile });
        const scrubbed = scrubResult.Data;
        scrubbed.findings = AnalyzeDiagnosticBundleData(scrubbed);

        const zipBytes = await BuildMjdiagArchive(scrubbed, {
            bundleId,
            sessionId: options.sessionId ?? this.recordingStateSubject.value.sessionId ?? undefined,
            captureReason: options.ticketNumber ? `Ticket:${options.ticketNumber}` : 'Manual',
            scrubberProfile,
            redactionSummary: {
                credentialsScrubbedCount: scrubResult.CredentialsScrubbedCount,
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
        this.breadcrumbBuffer.Clear();
        this.uploadedToSession.clear();
        this.flushedTriggerSessions.clear();
    }

    private recordTelemetryEvent(event: TelemetryEvent): void {
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
