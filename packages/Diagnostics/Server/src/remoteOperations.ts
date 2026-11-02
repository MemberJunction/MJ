import * as crypto from 'node:crypto';
import {
  BaseRemotableOperation,
  IMetadataProvider,
  Metadata,
  RemoteOpServerContext,
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
import { EncryptDiagnosticBundle } from '@memberjunction/diagnostics';

function isScopeLimitedPrincipal(user: UserInfo | undefined | null): boolean {
  if (!user) return true;
  if (user.IsMagicLinkAnonymous) return true;
  const scope = user.MagicLinkScope;
  return Boolean(scope?.ResourceID || scope?.ResourceType);
}

export async function AuthorizeDiagnosticsUser(
  user: UserInfo | undefined,
  authorizationName: 'Diagnostics: Run Sessions' | 'Diagnostics: Send Externally',
  provider?: IMetadataProvider
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
    const md = provider ?? Metadata.Provider;
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
    user: UserInfo,
    context?: RemoteOpServerContext
  ): Promise<boolean> {
    return AuthorizeDiagnosticsUser(user, 'Diagnostics: Run Sessions', context?.provider);
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
    user: UserInfo,
    context?: RemoteOpServerContext
  ): Promise<boolean> {
    return AuthorizeDiagnosticsUser(user, 'Diagnostics: Run Sessions', context?.provider);
  }

  protected override async InternalExecute(
    input: DiagnosticsStopSessionInput,
    provider: IMetadataProvider,
    user: UserInfo
  ): Promise<DiagnosticsStopSessionOutput> {
    DiagnosticSessionManager.Instance.StopActiveSessionInMemory(input.SessionID);
    const flushed = await DiagnosticSessionManager.Instance.FlushSessionChunksToDatabase(
      input.SessionID,
      user,
      provider
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
    user: UserInfo,
    context?: RemoteOpServerContext
  ): Promise<boolean> {
    if (!user || !user.IsActive || isScopeLimitedPrincipal(user)) {
      return false;
    }
    if (await AuthorizeDiagnosticsUser(user, 'Diagnostics: Run Sessions', context?.provider)) {
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
    provider: IMetadataProvider,
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

    void mgr.FlushSessionChunksToDatabase(sessionId, user, provider).catch(() => {});

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
    user: UserInfo,
    context?: RemoteOpServerContext
  ): Promise<boolean> {
    return AuthorizeDiagnosticsUser(user, 'Diagnostics: Run Sessions', context?.provider);
  }

  protected override async InternalExecute(
    input: DiagnosticsBuildBundleInput,
    provider: IMetadataProvider,
    user: UserInfo
  ): Promise<DiagnosticsBuildBundleOutput> {
    const bundleId = crypto.randomUUID();
    const scrubLiterals = input.ScrubLiterals ?? false;

    const assembled = await DiagnosticSessionManager.Instance.AssembleBundleDataFromChunks(
      input.SessionID,
      scrubLiterals,
      undefined,
      user,
      provider
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
    user: UserInfo,
    context?: RemoteOpServerContext
  ): Promise<boolean> {
    return AuthorizeDiagnosticsUser(user, 'Diagnostics: Run Sessions', context?.provider);
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
    user: UserInfo,
    context?: RemoteOpServerContext
  ): Promise<boolean> {
    return AuthorizeDiagnosticsUser(user, 'Diagnostics: Send Externally', context?.provider);
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

    const collectorUrl = input.CollectorUrlOverride || process.env.MJ_DIAGNOSTICS_COLLECTOR_URL;
    let referenceId: string;

    if (collectorUrl) {
      const result = await DiagnosticSessionManager.Instance.SendBundleToCollector({
        archiveBytes: local.archiveBytes,
        bundleId: local.bundleId,
        scrubLiterals: local.scrubLiterals,
        collectorBaseUrl: collectorUrl,
        ingestApiKey: process.env.MJ_DIAGNOSTICS_INGEST_API_KEY,
        contactInfo: input.ContactInfo,
        summary: input.Summary
      });
      referenceId = result.referenceId;
    } else {
      // No external collector URL configured: route through local DiagnosticIntakeService
      // using the full X25519-HKDF-SHA256-AES256GCM encryption + 4-layer verification & malware scan pipeline
      const intake = DiagnosticIntakeService.Instance;
      if (!intake.Enabled) {
        intake.Configure({ enabled: true });
      }
      const pk = await intake.GetPublicKeyDescriptor();
      const plaintextSha256 = crypto.createHash('sha256').update(local.archiveBytes).digest('hex');
      const encryptedBytes = await EncryptDiagnosticBundle(local.archiveBytes, {
        recipientKeyId: pk.keyId,
        recipientPublicKeyBase64: pk.publicKey,
        recipientKeySignatureBase64: pk.signature,
        senderEnvironmentId: DiagnosticSessionManager.Instance.InstallID,
        manifestSha256: plaintextSha256
      });
      const encryptedSha256 = crypto.createHash('sha256').update(encryptedBytes).digest('hex');

      const initiated = intake.InitiateBundleIntake({
        installId: DiagnosticSessionManager.Instance.InstallID,
        bundleId: local.bundleId,
        formatVersion: 1,
        mjVersion: '6.2.0',
        scrubLiterals: local.scrubLiterals,
        sizeBytes: encryptedBytes.byteLength,
        plaintextSha256,
        encryptedSha256,
        keyId: pk.keyId,
        summary: input.Summary,
        contact: input.ContactInfo
      });

      const uploaded = await intake.UploadEncryptedPayload(initiated.referenceId, encryptedBytes);
      if (!uploaded.accepted) {
        throw new Error(uploaded.reason ?? 'Local intake rejected encrypted payload');
      }

      const completed = await intake.CompleteBundleIntake(initiated.referenceId, {
        encryptedSha256,
        plaintextSha256
      });
      if (completed.status !== 'received') {
        throw new Error(completed.reason ?? 'Local intake rejected bundle during verification');
      }
      referenceId = completed.referenceId;
    }

    local.status = 'Sent';
    local.externalReferenceId = referenceId;
    local.sentAt = new Date().toISOString();

    return {
      BundleID: local.bundleId,
      Status: 'Sent',
      Destination: input.Destination,
      ExternalReferenceID: referenceId,
      SentAt: local.sentAt
    };
  }
}
