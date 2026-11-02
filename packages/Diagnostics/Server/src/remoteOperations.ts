import * as crypto from 'node:crypto';
import {
  BaseRemotableOperation,
  IMetadataProvider,
  Metadata,
  UserInfo
} from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
  DiagnosticsStartSessionOperation,
  DiagnosticsStartSessionInput,
  DiagnosticsStartSessionOutput,
  DiagnosticsStopSessionOperation,
  DiagnosticsStopSessionInput,
  DiagnosticsStopSessionOutput,
  DiagnosticsGetMySessionStatusOperation,
  DiagnosticsGetMySessionStatusInput,
  DiagnosticsGetMySessionStatusOutput,
  DiagnosticsUploadClientCaptureOperation,
  DiagnosticsUploadClientCaptureInput,
  DiagnosticsUploadClientCaptureOutput,
  DiagnosticsBuildBundleOperation,
  DiagnosticsBuildBundleInput,
  DiagnosticsBuildBundleOutput,
  DiagnosticsGetBundlePreviewOperation,
  DiagnosticsGetBundlePreviewInput,
  DiagnosticsGetBundlePreviewOutput,
  DiagnosticsSendBundleOperation,
  DiagnosticsSendBundleInput,
  DiagnosticsSendBundleOutput
} from '@memberjunction/core-entities';
import {
  DiagnosticSessionManager,
  ActiveDiagnosticSession
} from './sessionManager.js';
import { DiagnosticIntakeService } from './intakeService.js';

function isScopeLimitedPrincipal(user: UserInfo | undefined | null): boolean {
  if (!user) return true;
  if (user.IsMagicLinkAnonymous) return true;
  const scope = user.MagicLinkScope;
  return Boolean(scope?.ResourceID || scope?.ResourceType);
}

export async function AuthorizeDiagnosticsUser(
  user: UserInfo | undefined,
  authorizationName: 'Diagnostics: Run Sessions' | 'Diagnostics: Send Externally'
): Promise<boolean> {
  if (!user || !user.IsActive) {
    return false;
  }
  if (isScopeLimitedPrincipal(user)) {
    return false;
  }
  if (user.Type?.trim().toLowerCase() === 'owner') {
    return true;
  }
  try {
    const md = new Metadata();
    const authInfo = md.Authorizations?.find((a) => a.Name === authorizationName);
    if (authInfo && authInfo.UserCanExecute(user)) {
      return true;
    }
  } catch {
    // Fallback to role check if Metadata is not initialized
  }
  return user.UserRoles?.some(
    (r) =>
      r.Role?.trim().toLowerCase() === 'developer' ||
      r.Role?.trim().toLowerCase() === 'administrator'
  ) ?? false;
}

interface InMemoryBundleStoreItem {
  bundleId: string;
  name: string;
  direction: 'Local' | 'Received';
  status: 'Building' | 'Ready' | 'Sending' | 'Sent' | 'Failed';
  scrubLiterals: boolean;
  sizeBytes: number;
  sha256: string;
  archiveBytes: Uint8Array;
  manifest: Record<string, unknown>;
  scrubReport: Record<string, unknown>;
  findings: Array<Record<string, unknown>>;
  externalReferenceId?: string;
  sentAt?: string;
}

const inMemoryBundles = new Map<string, InMemoryBundleStoreItem>();

export function GetInMemoryDiagnosticBundle(bundleId: string): InMemoryBundleStoreItem | undefined {
  return inMemoryBundles.get(bundleId);
}

@RegisterClass(BaseRemotableOperation, 'Diagnostics.StartSession')
export class DiagnosticsStartSessionServerOperation extends DiagnosticsStartSessionOperation {
  protected override async Authorize(
    _input: DiagnosticsStartSessionInput,
    user: UserInfo
  ): Promise<boolean> {
    return AuthorizeDiagnosticsUser(user, 'Diagnostics: Run Sessions');
  }

  protected override async InternalExecute(
    input: DiagnosticsStartSessionInput,
    _provider: IMetadataProvider,
    user: UserInfo
  ): Promise<DiagnosticsStartSessionOutput> {
    const sessionId = crypto.randomUUID();
    const nowMs = Date.now();
    const durationMinutes = Math.min(Math.max(input.DurationMinutes ?? 15, 1), 60);
    const endsAtMs = nowMs + durationMinutes * 60_000;
    const scrubLiterals = input.ScrubLiterals ?? false;

    const session: ActiveDiagnosticSession = {
      id: sessionId,
      name: input.Name || `Session-${sessionId.slice(0, 8)}`,
      reason: input.Reason,
      status: 'Active',
      scopeType: input.ScopeType,
      scope: input.Scope ?? (input.ScopeType === 'Users' ? { userIds: [user.ID] } : {}),
      level: input.Level ?? 'Standard',
      categories: input.Categories ?? ['Logs', 'SQL', 'Spans', 'Network', 'Telemetry'],
      scrubLiterals,
      startedAtMs: nowMs,
      endsAtMs,
      maxBytes: input.MaxBytes ?? 52_428_800,
      createdByUserId: user.ID,
      bytesWritten: 0
    };

    DiagnosticSessionManager.Instance.RegisterActiveSession(session);

    return {
      SessionID: sessionId,
      Status: 'Active',
      StartedAt: new Date(nowMs).toISOString(),
      EndsAt: new Date(endsAtMs).toISOString(),
      ScrubLiterals: scrubLiterals
    };
  }
}

@RegisterClass(BaseRemotableOperation, 'Diagnostics.StopSession')
export class DiagnosticsStopSessionServerOperation extends DiagnosticsStopSessionOperation {
  protected override async Authorize(
    _input: DiagnosticsStopSessionInput,
    user: UserInfo
  ): Promise<boolean> {
    return AuthorizeDiagnosticsUser(user, 'Diagnostics: Run Sessions');
  }

  protected override async InternalExecute(
    input: DiagnosticsStopSessionInput,
    _provider: IMetadataProvider,
    user: UserInfo
  ): Promise<DiagnosticsStopSessionOutput> {
    DiagnosticSessionManager.Instance.StopActiveSessionInMemory(input.SessionID);
    const flushed = await DiagnosticSessionManager.Instance.FlushSessionChunksToDatabase(
      input.SessionID,
      user
    );
    return {
      SessionID: input.SessionID,
      Status: 'Stopped',
      StoppedAt: new Date().toISOString(),
      FlushedChunkCount: flushed
    };
  }
}

@RegisterClass(BaseRemotableOperation, 'Diagnostics.GetMySessionStatus')
export class DiagnosticsGetMySessionStatusServerOperation extends DiagnosticsGetMySessionStatusOperation {
  protected override async Authorize(
    _input: DiagnosticsGetMySessionStatusInput,
    user: UserInfo
  ): Promise<boolean> {
    return Boolean(user && user.IsActive && !isScopeLimitedPrincipal(user));
  }

  protected override async InternalExecute(
    input: DiagnosticsGetMySessionStatusInput,
    _provider: IMetadataProvider,
    user: UserInfo
  ): Promise<DiagnosticsGetMySessionStatusOutput> {
    const activeSessions = DiagnosticSessionManager.Instance.GetAllActiveSessions();
    const matched = activeSessions.find((s) => {
      if (s.scopeType === 'Instance') return true;
      if (s.scopeType === 'Users' && s.scope.userIds?.includes(user.ID)) return true;
      if (
        s.scopeType === 'BrowserSession' &&
        input.BrowserSessionID &&
        s.scope.browserSessionId === input.BrowserSessionID
      ) {
        return true;
      }
      return false;
    });

    if (!matched) {
      return {
        Active: false,
        SelfServiceRecordingAllowed: false
      };
    }

    return {
      Active: true,
      SessionID: matched.id,
      SessionName: matched.name,
      EndsAt: new Date(matched.endsAtMs).toISOString(),
      Level: matched.level,
      ScrubLiterals: matched.scrubLiterals,
      SelfServiceRecordingAllowed: false
    };
  }
}

@RegisterClass(BaseRemotableOperation, 'Diagnostics.UploadClientCapture')
export class DiagnosticsUploadClientCaptureServerOperation extends DiagnosticsUploadClientCaptureOperation {
  protected override async Authorize(
    input: DiagnosticsUploadClientCaptureInput,
    user: UserInfo
  ): Promise<boolean> {
    if (!user || !user.IsActive || isScopeLimitedPrincipal(user)) {
      return false;
    }
    if (await AuthorizeDiagnosticsUser(user, 'Diagnostics: Run Sessions')) {
      return true;
    }
    if (input.SessionID) {
      const s = DiagnosticSessionManager.Instance.GetActiveSession(input.SessionID);
      if (s && s.scopeType === 'Users' && s.scope.userIds?.includes(user.ID)) {
        return true;
      }
    }
    return false;
  }

  protected override async InternalExecute(
    input: DiagnosticsUploadClientCaptureInput,
    _provider: IMetadataProvider,
    user: UserInfo
  ): Promise<DiagnosticsUploadClientCaptureOutput> {
    const sessionId = input.SessionID ?? crypto.randomUUID();
    const mgr = DiagnosticSessionManager.Instance;

    for (const log of input.ClientLogs ?? []) {
      mgr.AppendToChunkBuffer(sessionId, 'Client', 'Logs', log);
    }
    for (const wf of input.ClientWaterfall ?? []) {
      mgr.AppendToChunkBuffer(sessionId, 'Client', 'Network', wf);
    }
    for (const tel of input.ClientTelemetry ?? []) {
      mgr.AppendToChunkBuffer(sessionId, 'Client', 'Telemetry', tel);
    }

    const drained = mgr.DrainPendingBuffersForSession(sessionId);
    const totalBytes = drained.reduce((acc, d) => acc + d.compressedData.byteLength, 0);

    // Re-stage drained entries in memory so AssembleBundleDataFromChunks can consume them even without DB
    for (const log of input.ClientLogs ?? []) {
      mgr.AppendToChunkBuffer(sessionId, 'Client', 'Logs', log);
    }
    for (const wf of input.ClientWaterfall ?? []) {
      mgr.AppendToChunkBuffer(sessionId, 'Client', 'Network', wf);
    }
    for (const tel of input.ClientTelemetry ?? []) {
      mgr.AppendToChunkBuffer(sessionId, 'Client', 'Telemetry', tel);
    }

    void mgr.FlushSessionChunksToDatabase(sessionId, user).catch(() => {});

    return {
      SessionID: sessionId,
      ChunksWritten: drained.length,
      TotalBytesWritten: totalBytes
    };
  }
}

@RegisterClass(BaseRemotableOperation, 'Diagnostics.BuildBundle')
export class DiagnosticsBuildBundleServerOperation extends DiagnosticsBuildBundleOperation {
  protected override async Authorize(
    _input: DiagnosticsBuildBundleInput,
    user: UserInfo
  ): Promise<boolean> {
    return AuthorizeDiagnosticsUser(user, 'Diagnostics: Run Sessions');
  }

  protected override async InternalExecute(
    input: DiagnosticsBuildBundleInput,
    _provider: IMetadataProvider,
    user: UserInfo
  ): Promise<DiagnosticsBuildBundleOutput> {
    const bundleId = crypto.randomUUID();
    const scrubLiterals = input.ScrubLiterals ?? false;

    const assembled = await DiagnosticSessionManager.Instance.AssembleBundleDataFromChunks(
      input.SessionID,
      scrubLiterals,
      undefined,
      user
    );

    inMemoryBundles.set(bundleId, {
      bundleId,
      name: input.Name ?? `Bundle-${bundleId.slice(0, 8)}`,
      direction: 'Local',
      status: 'Ready',
      scrubLiterals,
      sizeBytes: assembled.archiveBytes.byteLength,
      sha256: assembled.sha256,
      archiveBytes: assembled.archiveBytes,
      manifest: assembled.manifest,
      scrubReport: assembled.scrubReport,
      findings: assembled.bundleData.findings as unknown as Array<Record<string, unknown>>
    });

    const downloadToken = DiagnosticSessionManager.Instance.MintDownloadToken(bundleId, user.ID);

    return {
      BundleID: bundleId,
      Status: 'Ready',
      SizeBytes: assembled.archiveBytes.byteLength,
      SHA256: assembled.sha256,
      FindingsCount: assembled.bundleData.findings.length,
      DownloadToken: downloadToken,
      DownloadUrl: `/diagnostics/bundles/${bundleId}/download?token=${encodeURIComponent(downloadToken)}`
    };
  }
}

@RegisterClass(BaseRemotableOperation, 'Diagnostics.GetBundlePreview')
export class DiagnosticsGetBundlePreviewServerOperation extends DiagnosticsGetBundlePreviewOperation {
  protected override async Authorize(
    _input: DiagnosticsGetBundlePreviewInput,
    user: UserInfo
  ): Promise<boolean> {
    return AuthorizeDiagnosticsUser(user, 'Diagnostics: Run Sessions');
  }

  protected override async InternalExecute(
    input: DiagnosticsGetBundlePreviewInput,
    _provider: IMetadataProvider,
    user: UserInfo
  ): Promise<DiagnosticsGetBundlePreviewOutput> {
    const local = inMemoryBundles.get(input.BundleID);
    if (local) {
      const token = input.MintDownloadToken
        ? DiagnosticSessionManager.Instance.MintDownloadToken(local.bundleId, user.ID)
        : undefined;
      return {
        BundleID: local.bundleId,
        Name: local.name,
        Direction: local.direction,
        Status: local.status,
        SizeBytes: local.sizeBytes,
        SHA256: local.sha256,
        ScrubLiterals: local.scrubLiterals,
        Manifest: local.manifest,
        ScrubReport: local.scrubReport,
        Findings: local.findings,
        ReadmeText: `MemberJunction Diagnostic Bundle (${local.bundleId})\nSize: ${local.sizeBytes} bytes\nSHA-256: ${local.sha256}\nFindings: ${local.findings.length}`,
        DownloadToken: token,
        DownloadUrl: token
          ? `/diagnostics/bundles/${local.bundleId}/download?token=${encodeURIComponent(token)}`
          : undefined
      };
    }

    const received = DiagnosticIntakeService.Instance.GetReceivedBundle(input.BundleID);
    if (received) {
      const findings = (received.parsedBundleData?.findings ?? []) as unknown as Array<Record<string, unknown>>;
      return {
        BundleID: received.referenceId,
        Name: received.request.bundleId,
        Direction: 'Received',
        Status: received.status,
        SizeBytes: received.decryptedZipBytes?.byteLength ?? received.request.sizeBytes,
        SHA256: received.request.plaintextSha256,
        ScrubLiterals: received.request.scrubLiterals,
        Manifest: null,
        ScrubReport: null,
        Findings: findings,
        ReadmeText: `Received Diagnostic Bundle (${received.referenceId}) from ${received.request.installId}`
      };
    }

    throw new Error(`Diagnostic bundle '${input.BundleID}' not found.`);
  }
}

@RegisterClass(BaseRemotableOperation, 'Diagnostics.SendBundle')
export class DiagnosticsSendBundleServerOperation extends DiagnosticsSendBundleOperation {
  protected override async Authorize(
    _input: DiagnosticsSendBundleInput,
    user: UserInfo
  ): Promise<boolean> {
    return AuthorizeDiagnosticsUser(user, 'Diagnostics: Send Externally');
  }

  protected override async InternalExecute(
    input: DiagnosticsSendBundleInput,
    _provider: IMetadataProvider,
    _user: UserInfo
  ): Promise<DiagnosticsSendBundleOutput> {
    const local = inMemoryBundles.get(input.BundleID);
    if (!local) {
      throw new Error(`Bundle '${input.BundleID}' not found.`);
    }
    if (!input.CollectorUrlOverride) {
      throw new Error('CollectorUrlOverride is required when no default collector URL is configured.');
    }

    const result = await DiagnosticSessionManager.Instance.SendBundleToCollector({
      archiveBytes: local.archiveBytes,
      bundleId: local.bundleId,
      scrubLiterals: local.scrubLiterals,
      collectorBaseUrl: input.CollectorUrlOverride,
      contactInfo: input.ContactInfo,
      summary: input.Summary
    });

    local.status = 'Sent';
    local.externalReferenceId = result.referenceId;
    local.sentAt = new Date().toISOString();

    return {
      BundleID: local.bundleId,
      Status: 'Sent',
      Destination: input.Destination,
      ExternalReferenceID: result.referenceId,
      SentAt: local.sentAt
    };
  }
}
