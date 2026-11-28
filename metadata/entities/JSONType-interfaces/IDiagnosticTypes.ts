export interface IDiagnosticSessionScope {
    userIds?: string[];
    apiKeyIds?: string[];
    operationNames?: string[];
    remoteOperationKeys?: string[];
    browserSessionId?: string;
}

export interface IDiagnosticBundleFileDigest {
    sha256: string;
    sizeBytes: number;
    uncompressedBytes: number;
}

export interface IDiagnosticBundleManifest {
    schemaVersion: '1.0';
    bundleId: string;
    sessionId?: string;
    createdAt: string;
    captureReason: string;
    scrubberProfile: 'Standard' | 'FullRaw';
    files: Record<string, IDiagnosticBundleFileDigest>;
}

export interface IDiagnosticScrubReport {
    credentialsScrubbedCount: number;
    sqlLiteralsNormalizedCount: number;
    customPatternsAppliedCount: number;
}

export interface IDiagnosticFinding {
    id: string;
    severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
    category: string;
    title: string;
    summary: string;
    recommendation: string;
    relatedTraceIds: string[];
    evidence: Record<string, unknown>;
}
