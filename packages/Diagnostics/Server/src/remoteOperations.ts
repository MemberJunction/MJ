import * as crypto from 'node:crypto';
import {
  BaseRemotableOperation,
  IMetadataProvider,
  LogError,
  Metadata,
  RemoteOpServerContext,
  UserInfo
} from '@memberjunction/core';
import { IsValidUUID, RegisterClass, UUIDsEqual } from '@memberjunction/global';
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
  DiagnosticsSendBundleOutput,
  DiagnosticsEnrolSenderOperation,
  DiagnosticsEnrolSenderInput,
  DiagnosticsEnrolSenderOutput,
  DiagnosticsIssueSenderRegistrationCodeOperation,
  DiagnosticsIssueSenderRegistrationCodeInput,
  DiagnosticsIssueSenderRegistrationCodeOutput,
  MJDiagnosticBundleEntity
} from '@memberjunction/core-entities';
import { IssueSenderRegistrationCode } from './intakeEnrolment.js';
import {
  DiagnosticSessionManager,
  ActiveDiagnosticSession
} from './sessionManager.js';
import { DiagnosticIntakeService } from './intakeService.js';
import { EncryptDiagnosticBundle } from '@memberjunction/diagnostics';
import { DIAGNOSTICS_SETTING_KEYS, DiagnosticsSettings } from './settings.js';
import { MJ_VERSION } from './version.js';
import { EndSessionRow, FindSession, NewDiagnosticSession, SaveNewSession } from './sessionStore.js';
import {
  CreateLocalBundleRow,
  LoadBundleRow,
  MarkBundleFailed,
  MarkBundleReady,
  MarkBundleSending,
  MarkBundleSent
} from './bundleStore.js';
import { BundleDownloadUrl, GetDiagnosticsApiRoute } from './apiRoute.js';
import { EnrolSender, LoadEnrolledSender } from './senderEnrolment.js';
import { CurrentBrowserSessionId, SessionTargetsCaller } from './clientCapture.js';

function isScopeLimitedPrincipal(user: UserInfo | undefined | null): boolean {
  if (!user) return true;
  if (user.IsMagicLinkAnonymous) return true;
  const scope = user.MagicLinkScope;
  return Boolean(scope?.ResourceID || scope?.ResourceType);
}

export async function AuthorizeDiagnosticsUser(
  user: UserInfo | undefined,
  authorizationName: 'Diagnostics: Run Sessions' | 'Diagnostics: Send Externally' | 'Diagnostics: Manage Intake',
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
  sessionId: string;
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

type SessionScopeInput = DiagnosticsStartSessionInput['Scope'];

/** True when a `Users` scope names no one but the given user. A browser session in the scope only narrows it. */
function isSelfOnlyScope(scopeType: DiagnosticsStartSessionInput['ScopeType'], scope: SessionScopeInput, user: UserInfo): boolean {
  if (scopeType !== 'Users') return false;
  if (!scope) return true;
  const otherScopes = [scope.apiKeyIds, scope.operationNames, scope.remoteOperationKeys].some((list) => (list?.length ?? 0) > 0);
  if (otherScopes) return false;
  const userIds = scope.userIds ?? [];
  return userIds.length === 0 || userIds.every((id) => UUIDsEqual(id, user.ID));
}

/** The scope to save for a new session. A `Users` scope that names no user names the caller. */
function resolveSessionScope(input: DiagnosticsStartSessionInput, user: UserInfo): ActiveDiagnosticSession['scope'] {
  const scope = input.Scope ?? {};
  if (input.ScopeType !== 'Users' || (scope.userIds?.length ?? 0) > 0) return scope;
  return { ...scope, userIds: [user.ID] };
}

/** True when the user started the session and its scope is the user alone. */
function isOwnSelfServiceSession(session: ActiveDiagnosticSession, user: UserInfo): boolean {
  return UUIDsEqual(session.createdByUserId, user.ID) && isSelfOnlyScope(session.scopeType, session.scope, user);
}

/** True when self-service recording is on and the user is an active, unrestricted principal. */
async function isSelfServiceAllowed(user: UserInfo | undefined, provider?: IMetadataProvider): Promise<boolean> {
  if (!user || !user.IsActive || isScopeLimitedPrincipal(user)) return false;
  const settings = await DiagnosticsSettings.Load(user, provider);
  return settings.SelfServiceRecording;
}

/**
 * Authorizes work on one session: the user holds `Diagnostics: Run Sessions`, or self-service
 * recording is on and the user started this self-only session.
 */
async function authorizeSessionAccess(user: UserInfo, sessionId: string | undefined, provider?: IMetadataProvider): Promise<boolean> {
  if (await AuthorizeDiagnosticsUser(user, 'Diagnostics: Run Sessions', provider)) return true;
  const session = sessionId ? await FindSession(sessionId, user, provider) : undefined;
  return authorizeOwnSession(user, session, provider);
}

/** True when self-service recording is on and the user started this self-only session. */
async function authorizeOwnSession(user: UserInfo, session: ActiveDiagnosticSession | undefined, provider?: IMetadataProvider): Promise<boolean> {
  if (!session || !isOwnSelfServiceSession(session, user)) return false;
  return isSelfServiceAllowed(user, provider);
}

/** Throws when an external send is not allowed by the `Diagnostics.External.*` settings. */
function assertExternalSendAllowed(settings: DiagnosticsSettings, destination: DiagnosticsSendBundleInput['Destination']): void {
  if (!settings.ExternalEnabled) {
    throw new Error(`Sending bundles to an external collector is disabled (${DIAGNOSTICS_SETTING_KEYS.ExternalEnabled} is false).`);
  }
  const allowed = settings.ExternalDestinations;
  if (allowed.length > 0 && !allowed.includes(destination)) {
    throw new Error(`Destination '${destination}' is not in ${DIAGNOSTICS_SETTING_KEYS.ExternalDestinations}.`);
  }
}

@RegisterClass(BaseRemotableOperation, 'Diagnostics.StartSession')
export class DiagnosticsStartSessionServerOperation extends DiagnosticsStartSessionOperation {
  protected override async Authorize(
    input: DiagnosticsStartSessionInput,
    user: UserInfo,
    context?: RemoteOpServerContext
  ): Promise<boolean> {
    if (await AuthorizeDiagnosticsUser(user, 'Diagnostics: Run Sessions', context?.provider)) {
      return true;
    }
    return isSelfOnlyScope(input.ScopeType, input.Scope, user) && isSelfServiceAllowed(user, context?.provider);
  }

  protected override async InternalExecute(
    input: DiagnosticsStartSessionInput,
    provider: IMetadataProvider,
    user: UserInfo
  ): Promise<DiagnosticsStartSessionOutput> {
    const settings = await DiagnosticsSettings.Load(user, provider);
    if (!settings.CaptureEnabled) {
      throw new Error(`Diagnostic capture is disabled on this instance (${DIAGNOSTICS_SETTING_KEYS.CaptureEnabled} is false).`);
    }
    const session = await SaveNewSession(this.newSession(input, user, settings), user, provider);
    DiagnosticSessionManager.Instance.RegisterActiveSession(session);

    return {
      SessionID: session.id,
      Status: 'Active',
      StartedAt: new Date(session.startedAtMs).toISOString(),
      EndsAt: new Date(session.endsAtMs).toISOString(),
      ScrubLiterals: session.scrubLiterals
    };
  }

  private newSession(input: DiagnosticsStartSessionInput, user: UserInfo, settings: DiagnosticsSettings): NewDiagnosticSession {
    const nowMs = Date.now();
    const durationMinutes = Math.min(Math.max(input.DurationMinutes ?? 15, 1), settings.MaxSessionMinutes);
    return {
      name: input.Name || `Session-${new Date(nowMs).toISOString()}`,
      reason: input.Reason,
      status: 'Active',
      scopeType: input.ScopeType,
      scope: resolveSessionScope(input, user),
      level: input.Level ?? 'Standard',
      categories: input.Categories ?? ['Logs', 'SQL', 'Spans', 'Network', 'Telemetry'],
      scrubLiterals: settings.RequireLiteralScrubbing || (input.ScrubLiterals ?? false),
      startedAtMs: nowMs,
      endsAtMs: nowMs + durationMinutes * 60_000,
      maxBytes: input.MaxBytes ?? 52_428_800,
      createdByUserId: user.ID,
      bytesWritten: 0
    };
  }
}

@RegisterClass(BaseRemotableOperation, 'Diagnostics.StopSession')
export class DiagnosticsStopSessionServerOperation extends DiagnosticsStopSessionOperation {
  protected override async Authorize(
    input: DiagnosticsStopSessionInput,
    user: UserInfo,
    context?: RemoteOpServerContext
  ): Promise<boolean> {
    return authorizeSessionAccess(user, input.SessionID, context?.provider);
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
    await EndSessionRow(input.SessionID, user, provider);
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
    provider: IMetadataProvider,
    user: UserInfo
  ): Promise<DiagnosticsGetMySessionStatusOutput> {
    const settings = await DiagnosticsSettings.Load(user, provider);
    const selfServiceAllowed = settings.CaptureEnabled && settings.SelfServiceRecording;
    const activeSessions = DiagnosticSessionManager.Instance.GetAllActiveSessions();
    const matched = activeSessions.find(
      (s) => s.scopeType === 'Instance' || SessionTargetsCaller(s, user.ID, input.BrowserSessionID)
    );

    if (!matched) {
      return {
        Active: false,
        SelfServiceRecordingAllowed: selfServiceAllowed
      };
    }

    return {
      Active: true,
      SessionID: matched.id,
      SessionName: matched.name,
      EndsAt: new Date(matched.endsAtMs).toISOString(),
      Level: matched.level,
      ScrubLiterals: matched.scrubLiterals,
      SelfServiceRecordingAllowed: selfServiceAllowed
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
    if (!input.SessionID) {
      return isSelfServiceAllowed(user, context?.provider);
    }
    const s = DiagnosticSessionManager.Instance.GetActiveSession(input.SessionID);
    if (s && SessionTargetsCaller(s, user.ID, CurrentBrowserSessionId())) {
      return true;
    }
    return authorizeSessionAccess(user, input.SessionID, context?.provider);
  }

  /** Starts a session for the caller alone (this user and browser session) and returns its ID. */
  private async startCallerSession(input: DiagnosticsUploadClientCaptureInput, context: RemoteOpServerContext): Promise<string> {
    const browserSessionId = CurrentBrowserSessionId();
    const started = await new DiagnosticsStartSessionServerOperation().ExecuteServer(
      {
        Name: `Client capture ${new Date().toISOString()}`,
        Reason: input.Reason,
        ScopeType: 'Users',
        Scope: browserSessionId ? { userIds: [context.user.ID], browserSessionId } : { userIds: [context.user.ID] },
        ScrubLiterals: input.ScrubLiterals
      },
      context
    );
    if (!started.Success || !started.Output) {
      throw new Error(started.ErrorMessage ?? 'Could not start a diagnostic session for the client capture.');
    }
    return started.Output.SessionID;
  }

  /**
   * Stops a session started for one upload, so it never matches later requests. Build and preview still read it.
   * A failed row update is logged; the upload result is kept.
   */
  private async endCallerSession(sessionId: string, user: UserInfo, provider: IMetadataProvider): Promise<void> {
    DiagnosticSessionManager.Instance.StopActiveSessionInMemory(sessionId);
    try {
      await EndSessionRow(sessionId, user, provider);
    } catch (err) {
      LogError(`Could not stop diagnostic session '${sessionId}' after the client upload: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  protected override async InternalExecute(
    input: DiagnosticsUploadClientCaptureInput,
    provider: IMetadataProvider,
    user: UserInfo,
    context: RemoteOpServerContext
  ): Promise<DiagnosticsUploadClientCaptureOutput> {
    const settings = await DiagnosticsSettings.Load(user, provider);
    if (!settings.CaptureEnabled) {
      throw new Error(`Diagnostic capture is disabled on this instance (${DIAGNOSTICS_SETTING_KEYS.CaptureEnabled} is false).`);
    }
    const sessionId = input.SessionID ?? (await this.startCallerSession(input, context));
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

    await mgr.FlushSessionChunksToDatabase(sessionId, user, provider);
    if (!input.SessionID) {
      await this.endCallerSession(sessionId, user, provider);
    }

    return {
      SessionID: sessionId,
      ChunksWritten: drained.length,
      TotalBytesWritten: totalBytes
    };
  }
}

@RegisterClass(BaseRemotableOperation, 'Diagnostics.BuildBundle')
export class DiagnosticsBuildBundleServerOperation extends DiagnosticsBuildBundleOperation {
  /**
   * The session `Authorize` loaded; `InternalExecute` of the same call reuses it.
   * This works because `ExecuteServer` runs both steps on one instance.
   */
  private session: ActiveDiagnosticSession | undefined;

  protected override async Authorize(
    input: DiagnosticsBuildBundleInput,
    user: UserInfo,
    context?: RemoteOpServerContext
  ): Promise<boolean> {
    this.session = input.SessionID ? await FindSession(input.SessionID, user, context?.provider) : undefined;
    if (await AuthorizeDiagnosticsUser(user, 'Diagnostics: Run Sessions', context?.provider)) return true;
    return authorizeOwnSession(user, this.session, context?.provider);
  }

  protected override async InternalExecute(
    input: DiagnosticsBuildBundleInput,
    provider: IMetadataProvider,
    user: UserInfo
  ): Promise<DiagnosticsBuildBundleOutput> {
    const route = GetDiagnosticsApiRoute();
    const settings = await DiagnosticsSettings.Load(user, provider);
    const scrubLiterals = settings.RequireLiteralScrubbing || (input.ScrubLiterals ?? false);
    const session = this.session;
    const row = await CreateLocalBundleRow(
      {
        Name: input.Name ?? `Bundle-${new Date().toISOString()}`,
        Description: input.Description,
        SessionID: session?.id ?? null,
        ScrubLiterals: scrubLiterals,
        RetentionDays: settings.RetentionDays
      },
      user,
      provider
    );
    const item = await this.assembleIntoRow(row, input, scrubLiterals, user, provider);
    inMemoryBundles.set(item.bundleId, item);

    const downloadToken = DiagnosticSessionManager.Instance.MintDownloadToken(item.bundleId, user.ID);
    return {
      BundleID: item.bundleId,
      Status: 'Ready',
      SizeBytes: item.sizeBytes,
      SHA256: item.sha256,
      FindingsCount: item.findings.length,
      DownloadToken: downloadToken,
      DownloadUrl: BundleDownloadUrl(route, item.bundleId, downloadToken)
    };
  }

  /** Assembles the bundle and marks its row `Ready`, or `Failed` with the reason when assembly fails. */
  private async assembleIntoRow(
    row: MJDiagnosticBundleEntity,
    input: DiagnosticsBuildBundleInput,
    scrubLiterals: boolean,
    user: UserInfo,
    provider: IMetadataProvider
  ): Promise<InMemoryBundleStoreItem> {
    try {
      const assembled = await DiagnosticSessionManager.Instance.AssembleBundleDataFromChunks(
        input.SessionID,
        scrubLiterals,
        undefined,
        user,
        provider
      );
      const item: InMemoryBundleStoreItem = {
        bundleId: row.ID,
        sessionId: input.SessionID,
        name: row.Name,
        direction: 'Local',
        status: 'Ready',
        scrubLiterals,
        sizeBytes: assembled.archiveBytes.byteLength,
        sha256: assembled.sha256,
        archiveBytes: assembled.archiveBytes,
        manifest: assembled.manifest,
        scrubReport: assembled.scrubReport,
        findings: assembled.bundleData.findings as unknown as Array<Record<string, unknown>>
      };
      await MarkBundleReady(row, {
        SizeBytes: item.sizeBytes,
        SHA256: item.sha256,
        Manifest: item.manifest,
        ScrubReport: item.scrubReport,
        Findings: item.findings
      });
      return item;
    } catch (err) {
      await MarkBundleFailed(row, err instanceof Error ? err.message : String(err));
      throw err;
    }
  }
}

/** True when the preview would show a bundle received from another installation (customer data). */
function isReceivedBundle(bundleId: string, local: InMemoryBundleStoreItem | undefined): boolean {
  if (local) return local.direction === 'Received';
  return DiagnosticIntakeService.Instance.GetReceivedBundle(bundleId) !== undefined;
}

@RegisterClass(BaseRemotableOperation, 'Diagnostics.GetBundlePreview')
export class DiagnosticsGetBundlePreviewServerOperation extends DiagnosticsGetBundlePreviewOperation {
  protected override async Authorize(
    input: DiagnosticsGetBundlePreviewInput,
    user: UserInfo,
    context?: RemoteOpServerContext
  ): Promise<boolean> {
    const local = inMemoryBundles.get(input.BundleID);
    if (isReceivedBundle(input.BundleID, local)) {
      return AuthorizeDiagnosticsUser(user, 'Diagnostics: Manage Intake', context?.provider);
    }
    if (await AuthorizeDiagnosticsUser(user, 'Diagnostics: Run Sessions', context?.provider)) return true;
    return local ? authorizeSessionAccess(user, local.sessionId, context?.provider) : false;
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
        DownloadUrl: token ? BundleDownloadUrl(GetDiagnosticsApiRoute(), local.bundleId, token) : undefined
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
    provider: IMetadataProvider,
    user: UserInfo
  ): Promise<DiagnosticsSendBundleOutput> {
    const local = inMemoryBundles.get(input.BundleID);
    if (!local) {
      throw new Error(`Bundle '${input.BundleID}' not found.`);
    }

    const settings = await DiagnosticsSettings.Load(user, provider);
    const collectorUrl = settings.ExternalCollectorUrl;
    if (collectorUrl) {
      assertExternalSendAllowed(settings, input.Destination);
    }

    const row = await LoadBundleRow(local.bundleId, user, provider);
    await MarkBundleSending(row, input.Destination);
    let referenceId: string;
    try {
      referenceId = collectorUrl
        ? await this.sendToCollector(local, input, settings, user)
        : await this.sendToLocalIntake(local, input, settings);
    } catch (err) {
      await MarkBundleFailed(row, err instanceof Error ? err.message : String(err));
      throw err;
    }

    const sentAt = new Date();
    await this.recordSent(row, referenceId, sentAt);
    local.status = 'Sent';
    local.externalReferenceId = referenceId;
    local.sentAt = sentAt.toISOString();

    return {
      BundleID: local.bundleId,
      Status: 'Sent',
      Destination: input.Destination,
      ExternalReferenceID: referenceId,
      SentAt: local.sentAt
    };
  }

  /** Marks the row `Sent`. The bundle was already delivered, so a failed save is logged with the reference ID and not thrown. */
  private async recordSent(row: MJDiagnosticBundleEntity, referenceId: string, sentAt: Date): Promise<void> {
    try {
      await MarkBundleSent(row, referenceId, sentAt);
    } catch (err) {
      LogError(
        `Diagnostic bundle '${row.ID}' was sent (reference ID '${referenceId}') but its row could not be marked Sent: ` +
          (err instanceof Error ? err.message : String(err))
      );
    }
  }

  /** Sends the bundle to the enrolled collector at `Diagnostics.External.CollectorUrl` and returns its reference ID. */
  private async sendToCollector(
    local: InMemoryBundleStoreItem,
    input: DiagnosticsSendBundleInput,
    settings: DiagnosticsSettings,
    user: UserInfo
  ): Promise<string> {
    const sender = await LoadEnrolledSender(settings, user);
    const result = await DiagnosticSessionManager.Instance.SendBundleToCollector({
      ArchiveBytes: local.archiveBytes,
      BundleID: local.bundleId,
      ScrubLiterals: local.scrubLiterals,
      CollectorUrl: settings.ExternalCollectorUrl,
      Sender: sender,
      PinnedSigningPublicKeyBase64: settings.ExternalCollectorSigningPublicKeyBase64,
      EnrolledRecipientPublicKeyBase64: settings.ExternalCollectorPublicKeyBase64,
      ContactInfo: input.ContactInfo,
      Summary: input.Summary
    });
    return result.ReferenceID;
  }

  /**
   * Sends the bundle through this instance's `DiagnosticIntakeService` (full encryption,
   * verification and malware scan) when no external collector URL is set. Returns the reference ID.
   * Throws when local intake is disabled or not usable.
   */
  private async sendToLocalIntake(
    local: InMemoryBundleStoreItem,
    input: DiagnosticsSendBundleInput,
    settings: DiagnosticsSettings
  ): Promise<string> {
    const intake = DiagnosticIntakeService.Instance;
    if (!intake.Enabled && settings.IntakeEnabled) {
      throw new Error(
        `Local intake is enabled (${DIAGNOSTICS_SETTING_KEYS.IntakeEnabled}) but not usable: its key ` +
          `(${DIAGNOSTICS_SETTING_KEYS.IntakeKeyPairCredentialID}) did not load at startup. Check the server log.`
      );
    }
    if (!intake.Enabled) {
      throw new Error(
        `No collector is configured (${DIAGNOSTICS_SETTING_KEYS.ExternalCollectorUrl} is empty) and local intake is disabled ` +
          `(${DIAGNOSTICS_SETTING_KEYS.IntakeEnabled}). Set a collector and enrol, or enable local intake.`
      );
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
      mjVersion: MJ_VERSION,
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
    const completed = await intake.CompleteBundleIntake(initiated.referenceId, { encryptedSha256, plaintextSha256 });
    if (completed.status !== 'received') {
      throw new Error(completed.reason ?? 'Local intake rejected bundle during verification');
    }
    return completed.referenceId;
  }
}

/** Enrols this installation with the collector at `Diagnostics.External.CollectorUrl`. See `EnrolSender`. */
@RegisterClass(BaseRemotableOperation, 'Diagnostics.EnrolSender')
export class DiagnosticsEnrolSenderServerOperation extends DiagnosticsEnrolSenderOperation {
  protected override async Authorize(
    _input: DiagnosticsEnrolSenderInput,
    user: UserInfo,
    context?: RemoteOpServerContext
  ): Promise<boolean> {
    return AuthorizeDiagnosticsUser(user, 'Diagnostics: Manage Intake', context?.provider);
  }

  protected override async InternalExecute(
    input: DiagnosticsEnrolSenderInput,
    provider: IMetadataProvider,
    user: UserInfo
  ): Promise<DiagnosticsEnrolSenderOutput> {
    const result = await EnrolSender({ RegistrationCode: input.RegistrationCode, ContextUser: user, Provider: provider });
    return { InstallID: result.InstallID, EnrolledAt: result.EnrolledAt };
  }
}

@RegisterClass(BaseRemotableOperation, 'Diagnostics.IssueSenderRegistrationCode')
export class DiagnosticsIssueSenderRegistrationCodeServerOperation extends DiagnosticsIssueSenderRegistrationCodeOperation {
  protected override async Authorize(
    _input: DiagnosticsIssueSenderRegistrationCodeInput,
    user: UserInfo,
    context?: RemoteOpServerContext
  ): Promise<boolean> {
    return AuthorizeDiagnosticsUser(user, 'Diagnostics: Manage Intake', context?.provider);
  }

  /** Issues a one-time code for the registration. The plain code is returned once and never stored. */
  protected override async InternalExecute(
    input: DiagnosticsIssueSenderRegistrationCodeInput,
    provider: IMetadataProvider,
    user: UserInfo
  ): Promise<DiagnosticsIssueSenderRegistrationCodeOutput> {
    if (!input.RegistrationID || !IsValidUUID(input.RegistrationID)) {
      throw new Error('RegistrationID must be a UUID.');
    }
    const issued = await IssueSenderRegistrationCode(input.RegistrationID, { ContextUser: user, Provider: provider });
    return { Code: issued.Code, ExpiresAt: issued.ExpiresAt.toISOString() };
  }
}
