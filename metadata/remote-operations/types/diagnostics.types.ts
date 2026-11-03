export interface DiagnosticsStartSessionInput {
    Name: string;
    Reason?: string;
    ScopeType: 'Users' | 'APIKeys' | 'Operations' | 'BrowserSession' | 'Instance';
    Scope?: {
        userIds?: string[];
        apiKeyIds?: string[];
        operationNames?: string[];
        remoteOperationKeys?: string[];
        browserSessionId?: string;
    };
    Level?: 'Standard' | 'Verbose' | 'Debug';
    Categories?: string[];
    ScrubLiterals?: boolean;
    DurationMinutes?: number;
    MaxBytes?: number;
}

export interface DiagnosticsStartSessionOutput {
    SessionID: string;
    Status: 'Active' | 'Stopped' | 'Expired';
    StartedAt: string;
    EndsAt: string;
    ScrubLiterals: boolean;
}

export interface DiagnosticsStopSessionInput {
    SessionID: string;
}

export interface DiagnosticsStopSessionOutput {
    SessionID: string;
    Status: 'Stopped' | 'Expired';
    StoppedAt: string;
    FlushedChunkCount: number;
}

export interface DiagnosticsGetMySessionStatusInput {
    BrowserSessionID?: string;
}

export interface DiagnosticsGetMySessionStatusOutput {
    Active: boolean;
    SessionID?: string;
    SessionName?: string;
    EndsAt?: string;
    Level?: 'Standard' | 'Verbose' | 'Debug';
    ScrubLiterals?: boolean;
    SelfServiceRecordingAllowed: boolean;
    /** True when Diagnostics.Capture.Enabled is on for this installation. */
    CaptureEnabled?: boolean;
    /** True when Diagnostics.RequireLiteralScrubbing forces literal scrubbing on every session and bundle. */
    RequireLiteralScrubbing?: boolean;
}

export interface DiagnosticsUploadClientCaptureInput {
    SessionID?: string;
    CreateSelfServiceSession?: boolean;
    Reason?: string;
    ScrubLiterals?: boolean;
    Environment?: Record<string, unknown>;
    Repro?: Record<string, unknown>;
    ClientLogs?: Array<Record<string, unknown>>;
    ClientWaterfall?: Array<Record<string, unknown>>;
    ClientTelemetry?: Array<Record<string, unknown>>;
}

export interface DiagnosticsUploadClientCaptureOutput {
    SessionID: string;
    ChunksWritten: number;
    TotalBytesWritten: number;
}

export interface DiagnosticsBuildBundleInput {
    SessionID?: string;
    Name?: string;
    Description?: string;
    ScrubLiterals?: boolean;
    ClientBundleData?: Record<string, unknown>;
}

export interface DiagnosticsBuildBundleOutput {
    BundleID: string;
    Status: 'Ready' | 'Failed';
    SizeBytes: number;
    SHA256: string;
    FindingsCount: number;
    DownloadToken?: string;
    DownloadUrl?: string;
}

export interface DiagnosticsGetBundlePreviewInput {
    BundleID: string;
    MintDownloadToken?: boolean;
}

export interface DiagnosticsGetBundlePreviewOutput {
    BundleID: string;
    Name: string;
    Direction: 'Local' | 'Received';
    Status: string;
    SizeBytes: number;
    SHA256: string | null;
    ScrubLiterals: boolean;
    Manifest: Record<string, unknown> | null;
    ScrubReport: Record<string, unknown> | null;
    Findings: Array<Record<string, unknown>>;
    ReadmeText: string;
    DownloadToken?: string;
    DownloadUrl?: string;
}

export interface DiagnosticsSendBundleInput {
    BundleID: string;
    Destination: 'MJC' | 'CustomerCollector' | 'StorageAccount';
    ContactInfo?: string;
    Summary?: string;
}

export interface DiagnosticsSendBundleOutput {
    BundleID: string;
    Status: 'Sent' | 'Failed';
    Destination: 'MJC' | 'CustomerCollector' | 'StorageAccount';
    ExternalReferenceID?: string;
    SentAt?: string;
    ErrorMessage?: string;
}

export interface DiagnosticsIssueSenderRegistrationCodeInput {
    /** ID of the MJ: Diagnostic Sender Registrations row. */
    RegistrationID: string;
}

export interface DiagnosticsIssueSenderRegistrationCodeOutput {
    /** The one-time code. It is shown once; only its SHA-256 hash is stored. */
    Code: string;
    /** ISO 8601 time after which the code is refused. */
    ExpiresAt: string;
}

export interface DiagnosticsEnrolSenderInput {
    /** The one-time code the collector issued for this installation. */
    RegistrationCode: string;
}

export interface DiagnosticsEnrolSenderOutput {
    InstallID: string;
    /** ISO 8601 time of the enrolment. */
    EnrolledAt: string;
}

export interface DiagnosticsRevokeSenderInput {
    /** ID of the MJ: Diagnostic Sender Registrations row. */
    RegistrationID: string;
}

export interface DiagnosticsRevokeSenderOutput {
    RegistrationID: string;
    InstallID: string;
    Status: 'Revoked';
    /** ISO 8601 time of the revocation. */
    RevokedAt: string;
}

export interface DiagnosticsReactivateSenderInput {
    /** ID of the MJ: Diagnostic Sender Registrations row. */
    RegistrationID: string;
}

export interface DiagnosticsReactivateSenderOutput {
    RegistrationID: string;
    InstallID: string;
    Status: 'Active';
}
