import * as crypto from 'node:crypto';
import { BaseSingleton, SanitizeForLog, UUIDsEqual } from '@memberjunction/global';
import { IMetadataProvider, LogError, Metadata, RunDetachedFromDiagnosticContext, UserInfo, WithoutDiagnosticCapture } from '@memberjunction/core';
import { MJDiagnosticBundleEntity } from '@memberjunction/core-entities';
import {
  GenerateDiagnosticKeyPair,
  DiagnosticKeyPair,
  InspectEncryptedEnvelopeHeader,
  DecryptDiagnosticBundle,
  DecryptDiagnosticBundleResult,
  EncryptedEnvelopeHeader,
  ParseBundleDataFromArchive,
  AnalyzeDiagnosticBundleData,
  DiagnosticBundleData,
  SignRecipientPublicKey
} from '@memberjunction/diagnostics';
import {
  IDiagnosticMalwareScanner,
  StructuralOnlyMalwareScanner,
  MalwareScanResult
} from './malwareScanner.js';
import {
  AuthenticateSender,
  IntakeAudience,
  ReplayCache,
  RateCounter,
  ResolvedSender,
  ResolveSender,
  SenderAuthFailure,
  SenderIdentity,
  SenderWithinDailyQuota,
  SignedIntakeRequest,
  SignedRequestParts,
  VerifyResolvedSender
} from './intakeAuth.js';
import { IntakeDataContext, SenderRegistry, TouchSenderLastSeen } from './senderRegistry.js';
import { EnrolOutcome, EnrolRequestBody, EnrolSenderAtCollector } from './intakeEnrolment.js';
import { VerifyEnvelopeSenderSignature } from './intakeKeys.js';
import { GetDiagnosticsApiRoute } from './apiRoute.js';
import {
  CreateReceivedBundleRow,
  CreateStoredBundleFileRow,
  MarkReceivedBundleFailed,
  MarkReceivedBundleReady
} from './receivedBundleRows.js';

export const MAX_INTAKE_BUNDLE_BYTES = 26_214_400; // 25 MiB hard ceiling

const UPLOAD_WINDOW_MS = 10 * 60_000;
const SWEEP_INTERVAL_MS = 60_000;

/** Thrown by `InitiateBundleIntake` when the intake holds as many records as it may. Routes answer 429. */
export class IntakeCapacityError extends Error {}

/** Throws when `value` is set and is not a positive integer. */
function assertPositiveInteger(name: string, value: number | undefined): void {
  if (value !== undefined && !(Number.isInteger(value) && value > 0)) {
    throw new Error(`Diagnostics intake option ${name} must be a positive integer.`);
  }
}

/** Reason code of a complete call made after the record's complete deadline. */
export const COMPLETE_EXPIRED_REASON = 'COMPLETE_EXPIRED';

/** Reason code of a payload or complete call whose sender is not the one that created the record. */
export const SENDER_MISMATCH_REASON = 'SENDER_MISMATCH';

export interface IntakeCreateBundleRequest {
  installId: string;
  bundleId: string;
  formatVersion: number;
  mjVersion: string;
  scrubLiterals: boolean;
  sizeBytes: number;
  plaintextSha256: string;
  encryptedSha256: string;
  keyId: string;
  summary?: string;
  contact?: string;
}

export interface IntakeCreateBundleResponse {
  referenceId: string;
  uploadUrl: string;
  uploadExpiresAt: string;
}

export interface IntakeCompleteRequest {
  encryptedSha256: string;
  plaintextSha256: string;
  objectTags?: Record<string, string>;
}

export interface IntakeCompleteResponse {
  status: 'received' | 'rejected';
  referenceId: string;
  bundleId: string;
  retentionUntil?: string;
  findingsCount?: number;
  malwareScan?: MalwareScanResult;
  reasonCode?: string;
  reason?: string;
}

/** The authenticated `(installId, keyId)` an intake record is bound to. */
export interface IntakeSenderBinding {
  InstallID: string;
  KeyID: string;
}

export interface StoredIntakeBundleRecord {
  referenceId: string;
  request: IntakeCreateBundleRequest;
  status: 'Receiving' | 'Quarantined' | 'Ready' | 'Failed';
  createdAtMs: number;
  uploadExpiresAtMs: number;
  /** After this time an uploaded record that was not completed is rejected and removed. */
  completeDeadlineMs: number;
  /** True while `CompleteBundleIntake` runs for the record; the sweep skips it. */
  completing?: boolean;
  /** The authenticated sender, or undefined for an in-process (local loopback) record. */
  sender?: SenderIdentity;
  encryptedPayload?: Uint8Array;
  decryptedZipBytes?: Uint8Array;
  parsedBundleData?: DiagnosticBundleData;
  malwareScanResult?: MalwareScanResult;
  quarantinePath?: string;
  verifiedStoragePath?: string;
  failureReason?: string;
  /** The `MJ: Diagnostic Bundles` row, when the intake has a data context. */
  row?: MJDiagnosticBundleEntity;
}

export interface IDiagnosticStorageBridge {
  /** The `MJ: File Storage Providers` ID verified objects are written to, when known. */
  readonly VerifiedStorageProviderID?: string;
  WriteQuarantineObject(referenceId: string, bytes: Uint8Array): Promise<string>;
  /** Writes the verified bytes. `encrypted` is true when the bytes are the still-encrypted envelope. */
  PromoteToVerifiedStorage(referenceId: string, quarantinePath: string, verifiedBytes: Uint8Array, encrypted?: boolean): Promise<string>;
  DeleteQuarantineObject(quarantinePath: string): Promise<void>;
}

export interface OnBundleReceivedPayload {
  referenceId: string;
  bundleId: string;
  senderInstallId: string;
  senderMjVersion: string;
  summary?: string;
  contact?: string;
  findingsCount: number;
  verifiedStoragePath?: string;
}

export type OnBundleReceivedHook = (payload: OnBundleReceivedPayload) => Promise<void> | void;

/** The verified result of the decrypt step, or of the header-only check when decryption is off. */
interface VerifiedPayload {
  storedBytes: Uint8Array;
  encrypted: boolean;
  decryptedZipBytes?: Uint8Array;
  parsedData?: DiagnosticBundleData;
  manifest?: Record<string, unknown>;
}

type StepResult<T> = { ok: true; value: T } | { ok: false; reasonCode: string; reason: string; malwareScan?: MalwareScanResult };

function sameSender(a: SenderIdentity | undefined, b: SenderIdentity | undefined): boolean {
  if (!a || !b) return !a && !b;
  return UUIDsEqual(a.InstallID, b.InstallID) && a.KeyID === b.KeyID;
}

/** The install ID saved on the received row: a UUID (the column type), or null for a non-UUID in-process ID. */
function senderInstallIdForRow(rec: StoredIntakeBundleRecord): string | null {
  const installId = rec.sender?.InstallID ?? rec.request.installId;
  return UUID_PATTERN.test(installId) ? installId : null;
}

function sha256Hex(bytes: Uint8Array): string {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

/**
 * The public upload URL of a record (`MJAPI_PUBLIC_URL`, base path included). Without a route
 * builder (in-process use) it is the bare subpath.
 */
function uploadPath(referenceId: string): string {
  const subpath = `/diagnostics/intake/v1/bundles/${referenceId}/payload`;
  try {
    return GetDiagnosticsApiRoute()(subpath, { absolute: true });
  } catch {
    return subpath;
  }
}

const UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** Throws when a request field is not a string, is longer than `maxLength`, or is missing when required. */
function assertStringField(value: unknown, name: string, maxLength: number, required: boolean): void {
  if (value === undefined || value === null) {
    if (required) throw new Error(`${name} is required.`);
    return;
  }
  if (typeof value !== 'string' || value.length > maxLength || (required && !value)) {
    throw new Error(`${name} must be a string of at most ${maxLength} characters.`);
  }
}

function rejected(code: string, reason: string): StepResult<never> {
  return { ok: false, reasonCode: code, reason };
}

export class DiagnosticIntakeService extends BaseSingleton<DiagnosticIntakeService> {
  private _enabled = false;
  private _decryptOnIngest = true;
  private _retentionDays = 30;
  private _privateKeysByKeyId = new Map<string, string>();
  private _publicKeysByKeyId = new Map<string, { publicKeyBase64: string; signatureBase64?: string }>();
  private _activeKeyId: string | null = null;
  private _signingKey: DiagnosticKeyPair | null = null;
  private _records = new Map<string, StoredIntakeBundleRecord>();
  private _malwareScanner: IDiagnosticMalwareScanner = new StructuralOnlyMalwareScanner();
  private _storageBridge: IDiagnosticStorageBridge | null = null;
  private _onBundleReceivedHook: OnBundleReceivedHook | null = null;
  private _dataContext: IntakeDataContext | null = null;
  private _senderRegistry = new SenderRegistry();
  private _replayCache = new ReplayCache();
  private _senderRequests = new RateCounter(60_000, 30);
  private _ipFailures = new RateCounter(60_000, 60);
  private _maxRecordsInMemory = 200;
  private _maxOpenIntakesPerSender = 5;
  private _sweepTimer: ReturnType<typeof setInterval> | null = null;

  public constructor() {
    super();
  }

  public static get Instance(): DiagnosticIntakeService {
    return DiagnosticIntakeService.getInstance<DiagnosticIntakeService>();
  }

  public get Enabled(): boolean {
    return this._enabled;
  }

  public get DecryptOnIngest(): boolean {
    return this._decryptOnIngest;
  }

  public ResetForTests(): void {
    this._enabled = false;
    this._decryptOnIngest = true;
    this._retentionDays = 30;
    this._privateKeysByKeyId.clear();
    this._publicKeysByKeyId.clear();
    this._activeKeyId = null;
    this._signingKey = null;
    this._records.clear();
    this._malwareScanner = new StructuralOnlyMalwareScanner();
    this._storageBridge = null;
    this._onBundleReceivedHook = null;
    this._dataContext = null;
    this._senderRegistry.Clear();
    this._replayCache.Clear();
    this._senderRequests.Clear();
    this._ipFailures.Clear();
    this._maxRecordsInMemory = 200;
    this._maxOpenIntakesPerSender = 5;
    if (this._sweepTimer) clearInterval(this._sweepTimer);
    this._sweepTimer = null;
  }

  /**
   * Sets intake options. `contextUser` with `provider` (or the default provider) lets the intake
   * read sender registrations and save received bundle rows. `maxRecordsInMemory` (default 200)
   * caps the records kept in memory; `maxOpenIntakesPerSender` (default 5) caps the `Receiving`
   * records of one install. The four limit options must be positive integers, otherwise it throws.
   */
  public Configure(options: {
    enabled?: boolean;
    decryptOnIngest?: boolean;
    retentionDays?: number;
    malwareScanner?: IDiagnosticMalwareScanner;
    storageBridge?: IDiagnosticStorageBridge | null;
    onBundleReceivedHook?: OnBundleReceivedHook | null;
    maxRequestsPerMinute?: number;
    maxFailedAttemptsPerMinute?: number;
    maxRecordsInMemory?: number;
    maxOpenIntakesPerSender?: number;
    contextUser?: UserInfo;
    provider?: IMetadataProvider;
  }): void {
    this.applyLimits(options);
    if (options.enabled !== undefined) this._enabled = options.enabled;
    if (options.decryptOnIngest !== undefined) this._decryptOnIngest = options.decryptOnIngest;
    if (options.retentionDays !== undefined) this._retentionDays = options.retentionDays;
    if (options.malwareScanner) this._malwareScanner = options.malwareScanner;
    if (options.storageBridge !== undefined) this._storageBridge = options.storageBridge;
    if (options.onBundleReceivedHook !== undefined) this._onBundleReceivedHook = options.onBundleReceivedHook;
    if (options.contextUser) {
      const provider = options.provider ?? Metadata.Provider;
      this._dataContext = provider ? { ContextUser: options.contextUser, Provider: provider } : null;
    }
  }

  /** Validates all four limit options first, then applies the ones that are set. */
  private applyLimits(options: {
    maxRequestsPerMinute?: number;
    maxFailedAttemptsPerMinute?: number;
    maxRecordsInMemory?: number;
    maxOpenIntakesPerSender?: number;
  }): void {
    assertPositiveInteger('maxRequestsPerMinute', options.maxRequestsPerMinute);
    assertPositiveInteger('maxFailedAttemptsPerMinute', options.maxFailedAttemptsPerMinute);
    assertPositiveInteger('maxRecordsInMemory', options.maxRecordsInMemory);
    assertPositiveInteger('maxOpenIntakesPerSender', options.maxOpenIntakesPerSender);
    if (options.maxRequestsPerMinute !== undefined) this._senderRequests.Max = options.maxRequestsPerMinute;
    if (options.maxFailedAttemptsPerMinute !== undefined) this._ipFailures.Max = options.maxFailedAttemptsPerMinute;
    if (options.maxRecordsInMemory !== undefined) this._maxRecordsInMemory = options.maxRecordsInMemory;
    if (options.maxOpenIntakesPerSender !== undefined) this._maxOpenIntakesPerSender = options.maxOpenIntakesPerSender;
  }

  public RegisterKeyPair(keyPair: DiagnosticKeyPair, signatureBase64?: string, makeActive: boolean = true): void {
    this._privateKeysByKeyId.set(keyPair.keyId, keyPair.privateKeyBase64);
    this._publicKeysByKeyId.set(keyPair.keyId, {
      publicKeyBase64: keyPair.publicKeyBase64,
      signatureBase64
    });
    if (makeActive || !this._activeKeyId) {
      this._activeKeyId = keyPair.keyId;
    }
  }

  /**
   * Registers the collector's Ed25519 signing key. It signs the recipient public key in
   * `GetPublicKeyDescriptor`, and enrolment returns its public key so senders can pin it.
   */
  public RegisterSigningKeyPair(keyPair: DiagnosticKeyPair): void {
    this._signingKey = keyPair;
    for (const entry of this._publicKeysByKeyId.values()) {
      entry.signatureBase64 = undefined;
    }
  }

  /** True when a collector signing key is registered, so the public key can be served signed. */
  public get HasSigningKey(): boolean {
    return this._signingKey !== null;
  }

  /**
   * Registers a sender's Ed25519 public key in memory (no database row), for a self-hosted hub,
   * the local loopback or tests. `maxBundlesPerDay` 0 means no daily limit.
   */
  public RegisterSenderPublicKey(installId: string, keyId: string, publicKeyBase64: string, maxBundlesPerDay = 0): void {
    this._senderRegistry.RegisterInMemory(installId, keyId, publicKeyBase64, maxBundlesPerDay);
  }

  public async EnsureDefaultKeyPair(keyId: string = 'mj-intake-default-v1'): Promise<DiagnosticKeyPair> {
    if (this._activeKeyId && this._publicKeysByKeyId.has(this._activeKeyId)) {
      const activeId = this._activeKeyId;
      return {
        algorithm: 'X25519',
        keyId: activeId,
        publicKeyBase64: this._publicKeysByKeyId.get(activeId)!.publicKeyBase64,
        privateKeyBase64: this._privateKeysByKeyId.get(activeId)!
      };
    }
    const kp = await GenerateDiagnosticKeyPair('X25519', keyId);
    this.RegisterKeyPair(kp, undefined, true);
    return kp;
  }

  /** Returns the active recipient key, signed by the signing key when one is registered. */
  public async GetPublicKeyDescriptor(): Promise<{
    keyId: string;
    publicKey: string;
    algorithm: 'X25519';
    signature?: string;
  }> {
    await this.EnsureDefaultKeyPair();
    const keyId = this._activeKeyId!;
    const entry = this._publicKeysByKeyId.get(keyId)!;
    if (!entry.signatureBase64 && this._signingKey) {
      entry.signatureBase64 = await SignRecipientPublicKey(keyId, entry.publicKeyBase64, this._signingKey.privateKeyBase64);
    }
    return { keyId, publicKey: entry.publicKeyBase64, algorithm: 'X25519', signature: entry.signatureBase64 };
  }

  /** Authenticates an `MJDiag-Ed25519` signed request whose body is already read. */
  public async AuthenticateSender(req: SignedIntakeRequest): Promise<SenderIdentity | SenderAuthFailure> {
    return AuthenticateSender(req, this._senderRegistry, this._replayCache, this._dataContext);
  }

  /** Parses the Authorization header and finds the sender's registration, before any body is read. */
  public async ResolveSender(authorizationHeader: string | undefined): Promise<ResolvedSender | SenderAuthFailure> {
    return ResolveSender(authorizationHeader, this._senderRegistry, this._dataContext);
  }

  /** Verifies a resolved sender's signature over the request once the body is read. */
  public async VerifySender(resolved: ResolvedSender, req: SignedRequestParts): Promise<SenderIdentity | SenderAuthFailure> {
    return VerifyResolvedSender(resolved, req, this._replayCache);
  }

  /** The declared encrypted size of a record, or undefined for an unknown reference ID. */
  public DeclaredPayloadSize(referenceId: string): number | undefined {
    return this._records.get(referenceId)?.request.sizeBytes;
  }

  /** True when the sender has not used up its `MaxBundlesPerDay`. */
  public async SenderWithinDailyQuota(identity: SenderIdentity): Promise<boolean> {
    return SenderWithinDailyQuota(identity, this._dataContext);
  }

  /** Enrols a sender with a registration code. Refused when there is no data context or signing key. */
  public async EnrolSender(body: EnrolRequestBody): Promise<EnrolOutcome> {
    if (!this._dataContext || !this._signingKey) {
      LogError('Diagnostics enrolment refused: the intake has no data context or no signing key configured.');
      return { Ok: false, Status: 401, Reason: 'enrolment is not configured' };
    }
    const descriptor = await this.GetPublicKeyDescriptor();
    return EnrolSenderAtCollector(
      body,
      IntakeAudience(),
      { PublicKeyBase64: descriptor.publicKey, SigningPublicKeyBase64: this._signingKey.publicKeyBase64 },
      this._dataContext
    );
  }

  /** Counts one authenticated request for `callerKey`. Returns false when over the per-sender limit. */
  public CheckRateLimit(callerKey: string): boolean {
    return this._senderRequests.Hit(callerKey);
  }

  /** True when `ip` has used its budget of failed attempts in this window. */
  public IpFailureLimitReached(ip: string): boolean {
    return this._ipFailures.IsOver(ip);
  }

  /** Counts one failed attempt (bad header, unknown install, failed signature check, failed enrolment) for `ip`. */
  public RecordIpFailure(ip: string): void {
    this._ipFailures.Hit(ip);
  }

  /**
   * Creates an intake record. With `sender` (an authenticated HTTP request) the record is bound to
   * that `(installId, keyId)` and a body naming another install is refused. Without `sender` the
   * call is an in-process submission (local loopback). Throws on invalid input, and throws
   * `IntakeCapacityError` when the install has too many open intakes or the map is full of open ones.
   */
  public InitiateBundleIntake(req: IntakeCreateBundleRequest, sender?: SenderIdentity): IntakeCreateBundleResponse {
    this.assertValidCreateRequest(req);
    if (sender && (!UUID_PATTERN.test(req.installId) || !UUIDsEqual(req.installId, sender.InstallID))) {
      throw new Error('installId does not match the authenticated sender.');
    }
    const now = Date.now();
    this.ensureSweepTimer();
    this.sweepInBackground(now);
    this.assertSenderCanOpen(sender?.InstallID ?? req.installId);
    this.makeRoomForRecord();
    const referenceId = `diagref_${crypto.randomUUID()}`;
    const uploadExpiresAtMs = now + UPLOAD_WINDOW_MS;
    const completeDeadlineMs = uploadExpiresAtMs + UPLOAD_WINDOW_MS;
    this._records.set(referenceId, { referenceId, request: req, status: 'Receiving', createdAtMs: now, uploadExpiresAtMs, completeDeadlineMs, sender });
    return {
      referenceId,
      uploadUrl: uploadPath(referenceId),
      uploadExpiresAt: new Date(uploadExpiresAtMs).toISOString()
    };
  }

  /**
   * Removes `Receiving` records whose upload window has passed, and rejects and removes
   * `Quarantined` records past their complete deadline (quarantine object deleted, row marked
   * `Failed`). A record whose complete is running is skipped. The records leave the map at once.
   */
  public async SweepExpiredIntakes(nowMs = Date.now()): Promise<void> {
    const abandoned: StoredIntakeBundleRecord[] = [];
    for (const [referenceId, rec] of this._records) {
      if (rec.status === 'Receiving' && rec.uploadExpiresAtMs < nowMs) {
        this._records.delete(referenceId);
      } else if (this.isAbandonedUpload(rec, nowMs)) {
        this._records.delete(referenceId);
        abandoned.push(rec);
      }
    }
    await Promise.all(abandoned.map((rec) => this.rejectAndCleanup(rec, COMPLETE_EXPIRED_REASON, 'The bundle was not completed in time')));
  }

  private isAbandonedUpload(rec: StoredIntakeBundleRecord, nowMs: number): boolean {
    return rec.status === 'Quarantined' && !rec.completing && rec.completeDeadlineMs < nowMs;
  }

  private sweepInBackground(nowMs = Date.now()): void {
    this.SweepExpiredIntakes(nowMs).catch((err: unknown) => {
      LogError(`Diagnostics intake: the expired-intake sweep failed: ${err instanceof Error ? err.message : String(err)}`);
    });
  }

  /** Sweeps on a timer that never keeps the process alive and holds no request's diagnostic context. */
  private ensureSweepTimer(): void {
    if (this._sweepTimer) return;
    this._sweepTimer = RunDetachedFromDiagnosticContext(() => setInterval(() => this.sweepInBackground(), SWEEP_INTERVAL_MS));
    this._sweepTimer.unref();
  }

  private assertSenderCanOpen(installId: string): void {
    let open = 0;
    for (const rec of this._records.values()) {
      const isOpen = rec.status === 'Receiving' || rec.status === 'Quarantined';
      if (isOpen && UUIDsEqual(rec.sender?.InstallID ?? rec.request.installId, installId)) open++;
    }
    if (open >= this._maxOpenIntakesPerSender) {
      throw new IntakeCapacityError(`This install already has ${open} open bundle intakes; complete or wait for them before starting another.`);
    }
  }

  /** Evicts the oldest completed (`Ready` or `Failed`) records while the map is full. Throws when none can go. */
  private makeRoomForRecord(): void {
    while (this._records.size >= this._maxRecordsInMemory) {
      const oldest = this.oldestCompletedReferenceId();
      if (!oldest) {
        throw new IntakeCapacityError('The diagnostic intake is at capacity; try again later.');
      }
      this._records.delete(oldest);
    }
  }

  private oldestCompletedReferenceId(): string | undefined {
    let oldest: StoredIntakeBundleRecord | undefined;
    for (const rec of this._records.values()) {
      if ((rec.status === 'Ready' || rec.status === 'Failed') && (!oldest || rec.createdAtMs < oldest.createdAtMs)) oldest = rec;
    }
    return oldest?.referenceId;
  }

  private assertValidCreateRequest(req: IntakeCreateBundleRequest): void {
    if (!this._enabled) {
      throw new Error('Diagnostic bundle intake is disabled on this instance.');
    }
    if (!req || typeof req !== 'object') {
      throw new Error('A JSON request body is required.');
    }
    assertStringField(req.installId, 'installId', 100, true);
    assertStringField(req.bundleId, 'bundleId', 255, true);
    assertStringField(req.mjVersion, 'mjVersion', 50, true);
    assertStringField(req.keyId, 'keyId', 100, true);
    assertStringField(req.encryptedSha256, 'encryptedSha256', 64, true);
    assertStringField(req.plaintextSha256, 'plaintextSha256', 64, true);
    assertStringField(req.contact, 'contact', 500, false);
    assertStringField(req.summary, 'summary', 10_000, false);
    if (!Number.isFinite(req.sizeBytes) || req.sizeBytes <= 0 || req.sizeBytes > MAX_INTAKE_BUNDLE_BYTES) {
      throw new Error(`Invalid sizeBytes (${req.sizeBytes}); must be between 1 and ${MAX_INTAKE_BUNDLE_BYTES}.`);
    }
    if (!this._privateKeysByKeyId.has(req.keyId)) {
      throw new Error(`Unknown recipient keyId '${SanitizeForLog(String(req.keyId), 200)}'.`);
    }
  }

  /**
   * Layer 1 & Quarantine Staging:
   * Inspects the MJDB envelope header in <1ms before accepting the payload into Quarantine storage.
   * `sender` must be the sender the record is bound to.
   */
  public async UploadEncryptedPayload(
    referenceId: string,
    payloadBytes: Uint8Array,
    sender?: SenderIdentity
  ): Promise<{ accepted: boolean; reasonCode?: string; reason?: string }> {
    const rec = this._records.get(referenceId);
    if (!rec) {
      return { accepted: false, reasonCode: 'UNKNOWN_REFERENCE', reason: 'Unknown referenceId' };
    }
    if (!sameSender(rec.sender, sender)) {
      return { accepted: false, reasonCode: SENDER_MISMATCH_REASON, reason: 'The sender does not own this referenceId' };
    }
    const check = this.checkUpload(rec, payloadBytes);
    if (check.ok === false) {
      rec.status = 'Failed';
      rec.failureReason = check.reason;
      return { accepted: false, reasonCode: check.reasonCode, reason: check.reason };
    }
    rec.encryptedPayload = payloadBytes;
    if (this._storageBridge) {
      rec.quarantinePath = await this._storageBridge.WriteQuarantineObject(referenceId, payloadBytes);
    }
    rec.status = 'Quarantined';
    await this.createReceivedRow(rec);
    return { accepted: true };
  }

  private checkUpload(rec: StoredIntakeBundleRecord, payloadBytes: Uint8Array): StepResult<true> {
    if (rec.status !== 'Receiving') {
      return rejected('INVALID_STATE', `Cannot upload in state ${rec.status}`);
    }
    if (Date.now() > rec.uploadExpiresAtMs) {
      return rejected('UPLOAD_EXPIRED', 'Upload window expired');
    }
    if (payloadBytes.byteLength > MAX_INTAKE_BUNDLE_BYTES || payloadBytes.byteLength !== rec.request.sizeBytes) {
      return rejected('SIZE_MISMATCH', `Payload size mismatch (${payloadBytes.byteLength} vs declared ${rec.request.sizeBytes})`);
    }
    // Fast <1ms MJDB cryptographic header pre-check before touching storage
    const headerCheck = InspectEncryptedEnvelopeHeader(payloadBytes, [...this._privateKeysByKeyId.keys()]);
    if (!headerCheck.valid) {
      return rejected(headerCheck.reasonCode ?? 'INVALID_ENVELOPE_HEADER', `Envelope header verification failed: ${headerCheck.reason}`);
    }
    if (sha256Hex(payloadBytes).toLowerCase() !== rec.request.encryptedSha256.toLowerCase()) {
      return rejected('ENCRYPTED_SHA256_MISMATCH', 'Encrypted payload SHA-256 mismatch');
    }
    return { ok: true, value: true };
  }

  private async createReceivedRow(rec: StoredIntakeBundleRecord): Promise<void> {
    if (!this._dataContext) {
      return;
    }
    const row = await CreateReceivedBundleRow(
      {
        ReferenceID: rec.referenceId,
        BundleID: rec.request.bundleId,
        SenderInstallID: senderInstallIdForRow(rec),
        SenderMJVersion: rec.request.mjVersion,
        ContactInfo: rec.request.contact,
        Summary: rec.request.summary,
        ScrubLiterals: Boolean(rec.request.scrubLiterals),
        SizeBytes: rec.request.sizeBytes,
        RetentionDays: this._retentionDays
      },
      this._dataContext
    );
    rec.row = row ?? undefined;
  }

  /**
   * Layers 2, 3, & 4:
   * - Verifies hashes and the envelope sender signature (required for an authenticated sender,
   *   with the envelope's `senderKeyId` equal to the authenticated key)
   * - With DecryptOnIngest: AEAD-decrypts, runs VerifyBundleArchive() and the malware scanner,
   *   indexes manifest & findings. Without it: checks the header only and keeps the envelope encrypted
   * - Promotes from Quarantine to Verified MJStorage (or deletes from Quarantine on failure)
   * - Saves the received bundle row and invokes OnBundleReceivedHook
   */
  public async CompleteBundleIntake(
    referenceId: string,
    completeReq: IntakeCompleteRequest,
    sender?: SenderIdentity
  ): Promise<IntakeCompleteResponse> {
    return WithoutDiagnosticCapture(async () => {
      const rec = this._records.get(referenceId);
      if (rec && !sameSender(rec.sender, sender)) {
        return this.rejectedResponse(referenceId, rec.request.bundleId, SENDER_MISMATCH_REASON, 'The sender does not own this referenceId');
      }
      if (!rec || !rec.encryptedPayload || rec.status !== 'Quarantined') {
        return this.rejectedResponse(referenceId, rec?.request.bundleId ?? 'unknown', 'MISSING_PAYLOAD', 'No quarantined payload found for referenceId');
      }
      if (this.isAbandonedUpload(rec, Date.now())) {
        this._records.delete(referenceId);
        return this.rejectAndCleanup(rec, COMPLETE_EXPIRED_REASON, 'The complete deadline has passed');
      }
      return this.verifyAndFinish(rec, completeReq);
    });
  }

  private async verifyAndFinish(rec: StoredIntakeBundleRecord, completeReq: IntakeCompleteRequest): Promise<IntakeCompleteResponse> {
    rec.completing = true;
    try {
      const verified = await this.verifyPayload(rec, completeReq);
      if (verified.ok === false) {
        return await this.rejectAndCleanup(rec, verified.reasonCode, verified.reason, verified.malwareScan);
      }
      return await this.acceptBundle(rec, verified.value);
    } finally {
      rec.completing = false;
    }
  }

  private rejectedResponse(referenceId: string, bundleId: string, reasonCode: string, reason: string): IntakeCompleteResponse {
    return { status: 'rejected', referenceId, bundleId, reasonCode, reason };
  }

  private async rejectAndCleanup(
    rec: StoredIntakeBundleRecord,
    reasonCode: string,
    reason: string,
    malwareScan?: MalwareScanResult
  ): Promise<IntakeCompleteResponse> {
    rec.status = 'Failed';
    rec.failureReason = reason;
    rec.malwareScanResult = malwareScan;
    if (rec.quarantinePath && this._storageBridge) {
      await this._storageBridge.DeleteQuarantineObject(rec.quarantinePath).catch(() => {});
    }
    rec.encryptedPayload = undefined;
    rec.decryptedZipBytes = undefined;
    if (rec.row) {
      await MarkReceivedBundleFailed(rec.row, `${reasonCode}: ${reason}`);
    }
    return { ...this.rejectedResponse(rec.referenceId, rec.request.bundleId, reasonCode, reason), malwareScan };
  }

  private async verifyPayload(rec: StoredIntakeBundleRecord, completeReq: IntakeCompleteRequest): Promise<StepResult<VerifiedPayload>> {
    if (typeof completeReq?.encryptedSha256 !== 'string' || completeReq.encryptedSha256.toLowerCase() !== rec.request.encryptedSha256.toLowerCase()) {
      return rejected('ENCRYPTED_SHA256_MISMATCH', 'Complete encryptedSha256 does not match');
    }
    if (typeof completeReq.plaintextSha256 !== 'string') {
      return rejected('PLAINTEXT_SHA256_MISMATCH', 'plaintextSha256 is required');
    }
    return this._decryptOnIngest ? this.decryptAndScan(rec, completeReq) : this.verifyHeaderOnly(rec, completeReq);
  }

  /** Checks the envelope's sender key against the authenticated sender. Null when it matches or there is no sender. */
  private senderKeyFailure(rec: StoredIntakeBundleRecord, header: EncryptedEnvelopeHeader | undefined): StepResult<never> | null {
    if (!rec.sender) {
      return null;
    }
    if (!header || header.senderKeyId !== rec.sender.KeyID) {
      return rejected('SENDER_KEY_MISMATCH', 'The envelope senderKeyId is not the authenticated sender key');
    }
    return null;
  }

  private async decryptAndScan(rec: StoredIntakeBundleRecord, completeReq: IntakeCompleteRequest): Promise<StepResult<VerifiedPayload>> {
    const decrypted = await this.decrypt(rec);
    const keyFailure = this.senderKeyFailure(rec, decrypted.header);
    if (keyFailure) return keyFailure;
    if (!decrypted.valid || !decrypted.decryptedZipBytes || !decrypted.archiveVerification?.valid) {
      return rejected(
        decrypted.archiveVerification?.reasonCode ?? decrypted.reasonCode ?? 'DECRYPTION_FAILED',
        decrypted.reason ?? 'AEAD decryption or inner archive structural verification failed'
      );
    }
    if (sha256Hex(decrypted.decryptedZipBytes).toLowerCase() !== completeReq.plaintextSha256.toLowerCase()) {
      return rejected('PLAINTEXT_SHA256_MISMATCH', 'Decrypted archive SHA-256 does not match declared plaintextSha256');
    }
    const scan = await this.scan(rec, decrypted.decryptedZipBytes, completeReq);
    if (scan.ok === false) return scan;
    const parsedData = ParseBundleDataFromArchive(decrypted.archiveVerification);
    if (!parsedData.findings || parsedData.findings.length === 0) {
      parsedData.findings = AnalyzeDiagnosticBundleData(parsedData);
    }
    return {
      ok: true,
      value: {
        storedBytes: decrypted.decryptedZipBytes,
        encrypted: false,
        decryptedZipBytes: decrypted.decryptedZipBytes,
        parsedData,
        manifest: decrypted.archiveVerification.manifest as unknown as Record<string, unknown> | undefined
      }
    };
  }

  private async decrypt(rec: StoredIntakeBundleRecord): Promise<DecryptDiagnosticBundleResult> {
    const keyMap: Record<string, string> = Object.fromEntries(this._privateKeysByKeyId.entries());
    const sender = rec.sender;
    return DecryptDiagnosticBundle(rec.encryptedPayload!, {
      PrivateKeysByKeyId: keyMap,
      ...(sender
        ? { RequireSenderSignature: true, SenderPublicKeysByKeyId: { [sender.KeyID]: sender.Registration.PublicKeyBase64 } }
        : {})
    });
  }

  private async scan(rec: StoredIntakeBundleRecord, zip: Uint8Array, completeReq: IntakeCompleteRequest): Promise<StepResult<true>> {
    const scanResult = await this._malwareScanner.ScanBundle({
      referenceId: rec.referenceId,
      bundleId: rec.request.bundleId,
      senderInstallId: rec.request.installId,
      quarantineObjectPath: rec.quarantinePath,
      decryptedZipBytes: zip,
      encryptedBytes: rec.encryptedPayload!,
      objectTags: completeReq.objectTags
    });
    rec.malwareScanResult = scanResult;
    if (scanResult.verdict === 'Clean') {
      return { ok: true, value: true };
    }
    return {
      ok: false,
      reasonCode: `MALWARE_${scanResult.verdict.toUpperCase()}`,
      reason: `Malware scanner (${scanResult.engineName}) rejected bundle: ${scanResult.threatName ?? scanResult.details ?? scanResult.verdict}`,
      malwareScan: scanResult
    };
  }

  /**
   * DecryptOnIngest off: re-checks the envelope header, verifies the sender signature over the
   * header (required for an authenticated sender) and the header's manifest hash against the
   * declared plaintext hash. The payload stays encrypted; no malware scan runs on it.
   */
  private verifyHeaderOnly(rec: StoredIntakeBundleRecord, completeReq: IntakeCompleteRequest): StepResult<VerifiedPayload> {
    const inspection = InspectEncryptedEnvelopeHeader(rec.encryptedPayload!, [...this._privateKeysByKeyId.keys()]);
    if (!inspection.valid || !inspection.header) {
      return rejected(inspection.reasonCode ?? 'INVALID_ENVELOPE_HEADER', inspection.reason ?? 'Envelope header failed verification');
    }
    const header = inspection.header;
    const keyFailure = this.senderKeyFailure(rec, header);
    if (keyFailure) return keyFailure;
    if (rec.sender && !VerifyEnvelopeSenderSignature(header, rec.sender.Registration.PublicKeyBase64)) {
      return rejected('INVALID_SENDER_SIGNATURE', 'Required Ed25519 sender signature is missing or invalid');
    }
    if (header.manifestSha256 && header.manifestSha256.toLowerCase() !== completeReq.plaintextSha256.toLowerCase()) {
      return rejected('PLAINTEXT_SHA256_MISMATCH', 'Envelope manifestSha256 does not match declared plaintextSha256');
    }
    return { ok: true, value: { storedBytes: rec.encryptedPayload!, encrypted: true } };
  }

  private async acceptBundle(rec: StoredIntakeBundleRecord, verified: VerifiedPayload): Promise<IntakeCompleteResponse> {
    const fileId = await this.promote(rec, verified);
    // Memory-only mode (no storage bridge) keeps the decrypted bytes so they can be downloaded.
    rec.decryptedZipBytes = this._storageBridge ? undefined : verified.decryptedZipBytes;
    rec.encryptedPayload = undefined;
    rec.parsedBundleData = verified.parsedData;
    rec.status = 'Ready';
    const findings = verified.parsedData?.findings;
    if (rec.row) {
      await MarkReceivedBundleReady(rec.row, {
        SizeBytes: verified.storedBytes.byteLength,
        SHA256: sha256Hex(verified.storedBytes),
        Manifest: verified.manifest,
        Findings: findings as unknown as Array<Record<string, unknown>> | undefined,
        FileID: fileId
      });
    }
    if (rec.sender) {
      await TouchSenderLastSeen(rec.sender.Registration, this._dataContext);
    }
    this.runOnBundleReceivedHook(rec, findings?.length ?? 0);
    return {
      status: 'received',
      referenceId: rec.referenceId,
      bundleId: rec.request.bundleId,
      retentionUntil: new Date(Date.now() + this._retentionDays * 24 * 60 * 60 * 1000).toISOString(),
      findingsCount: findings?.length ?? 0,
      malwareScan: rec.malwareScanResult
    };
  }

  /** Writes the verified bytes to verified storage and returns the `MJ: Files` ID when one was saved. */
  private async promote(rec: StoredIntakeBundleRecord, verified: VerifiedPayload): Promise<string | undefined> {
    const bridge = this._storageBridge;
    if (!bridge) {
      return undefined;
    }
    rec.verifiedStoragePath = await bridge.PromoteToVerifiedStorage(rec.referenceId, rec.quarantinePath ?? rec.referenceId, verified.storedBytes, verified.encrypted);
    if (rec.quarantinePath) {
      await bridge.DeleteQuarantineObject(rec.quarantinePath).catch(() => {});
    }
    if (!bridge.VerifiedStorageProviderID || !this._dataContext) {
      return undefined;
    }
    return CreateStoredBundleFileRow(
      `${rec.request.bundleId}${verified.encrypted ? '.mjdiag.enc' : '.mjdiag'}`,
      {
        StorageProviderID: bridge.VerifiedStorageProviderID,
        ObjectKey: rec.verifiedStoragePath,
        ContentType: verified.encrypted ? 'application/octet-stream' : 'application/zip'
      },
      this._dataContext
    );
  }

  /** Runs the hook without waiting. A thrown or rejected hook is logged and never reaches the sender. */
  private runOnBundleReceivedHook(rec: StoredIntakeBundleRecord, findingsCount: number): void {
    const hook = this._onBundleReceivedHook;
    if (!hook) {
      return;
    }
    const logFailure = (err: unknown): void => {
      LogError(`Diagnostics intake: the OnBundleReceived hook failed for '${rec.referenceId}': ${err instanceof Error ? err.message : String(err)}`);
    };
    try {
      void Promise.resolve(
        hook({
          referenceId: rec.referenceId,
          bundleId: rec.request.bundleId,
          senderInstallId: rec.request.installId,
          senderMjVersion: rec.request.mjVersion,
          summary: rec.request.summary,
          contact: rec.request.contact,
          findingsCount,
          verifiedStoragePath: rec.verifiedStoragePath
        })
      ).catch(logFailure);
    } catch (err) {
      logFailure(err);
    }
  }

  public GetReceivedBundle(referenceId: string): StoredIntakeBundleRecord | undefined {
    return this._records.get(referenceId);
  }

  public ListReceivedBundles(): StoredIntakeBundleRecord[] {
    return [...this._records.values()];
  }
}
