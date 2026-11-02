import * as crypto from 'node:crypto';
import { BaseSingleton } from '@memberjunction/global';
import { WithoutDiagnosticCapture } from '@memberjunction/core';
import {
  GenerateDiagnosticKeyPair,
  DiagnosticKeyPair,
  InspectEncryptedEnvelopeHeader,
  DecryptDiagnosticBundle,
  VerifyBundleArchive,
  ParseBundleDataFromArchive,
  AnalyzeDiagnosticBundleData,
  DiagnosticBundleData
} from '@memberjunction/diagnostics';
import {
  IDiagnosticMalwareScanner,
  StructuralOnlyMalwareScanner,
  MalwareScanResult
} from './malwareScanner.js';

export const MAX_INTAKE_BUNDLE_BYTES = 26_214_400; // 25 MiB hard ceiling

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

export interface StoredIntakeBundleRecord {
  referenceId: string;
  request: IntakeCreateBundleRequest;
  status: 'Receiving' | 'Quarantined' | 'Ready' | 'Failed';
  createdAtMs: number;
  uploadExpiresAtMs: number;
  encryptedPayload?: Uint8Array;
  decryptedZipBytes?: Uint8Array;
  parsedBundleData?: DiagnosticBundleData;
  malwareScanResult?: MalwareScanResult;
  quarantinePath?: string;
  verifiedStoragePath?: string;
  failureReason?: string;
}

export interface IDiagnosticStorageBridge {
  WriteQuarantineObject(referenceId: string, bytes: Uint8Array): Promise<string>;
  PromoteToVerifiedStorage(referenceId: string, quarantinePath: string, verifiedZipBytes: Uint8Array): Promise<string>;
  DeleteQuarantineObject(quarantinePath: string): Promise<void>;
}

export type OnBundleReceivedHook = (payload: {
  referenceId: string;
  bundleId: string;
  senderInstallId: string;
  senderMjVersion: string;
  summary?: string;
  contact?: string;
  findingsCount: number;
  verifiedStoragePath?: string;
}) => Promise<void>;

export class DiagnosticIntakeService extends BaseSingleton<DiagnosticIntakeService> {
  private _enabled = false;
  private _decryptOnIngest = true;
  private _retentionDays = 30;
  private _privateKeysByKeyId = new Map<string, string>();
  private _publicKeysByKeyId = new Map<string, { publicKeyBase64: string; signatureBase64?: string }>();
  private _activeKeyId: string | null = null;
  private _records = new Map<string, StoredIntakeBundleRecord>();
  private _malwareScanner: IDiagnosticMalwareScanner = new StructuralOnlyMalwareScanner();
  private _storageBridge: IDiagnosticStorageBridge | null = null;
  private _onBundleReceivedHook: OnBundleReceivedHook | null = null;
  private _allowedIngestTokens = new Set<string>();
  private _rateLimitWindowMs = 60_000;
  private _maxRequestsPerWindow = 30;
  private _rateCounters = new Map<string, { count: number; windowStartMs: number }>();

  public constructor() {
    super();
  }

  public static get Instance(): DiagnosticIntakeService {
    return DiagnosticIntakeService.getInstance<DiagnosticIntakeService>();
  }

  public get Enabled(): boolean {
    return this._enabled;
  }

  public ResetForTests(): void {
    this._enabled = false;
    this._decryptOnIngest = true;
    this._retentionDays = 30;
    this._privateKeysByKeyId.clear();
    this._publicKeysByKeyId.clear();
    this._activeKeyId = null;
    this._records.clear();
    this._malwareScanner = new StructuralOnlyMalwareScanner();
    this._storageBridge = null;
    this._onBundleReceivedHook = null;
    this._allowedIngestTokens.clear();
    this._rateCounters.clear();
  }

  public Configure(options: {
    enabled?: boolean;
    decryptOnIngest?: boolean;
    retentionDays?: number;
    malwareScanner?: IDiagnosticMalwareScanner;
    storageBridge?: IDiagnosticStorageBridge | null;
    onBundleReceivedHook?: OnBundleReceivedHook | null;
    allowedIngestTokens?: string[];
    maxRequestsPerMinute?: number;
  }): void {
    if (options.enabled !== undefined) this._enabled = options.enabled;
    if (options.decryptOnIngest !== undefined) this._decryptOnIngest = options.decryptOnIngest;
    if (options.retentionDays !== undefined) this._retentionDays = options.retentionDays;
    if (options.malwareScanner) this._malwareScanner = options.malwareScanner;
    if (options.storageBridge !== undefined) this._storageBridge = options.storageBridge;
    if (options.onBundleReceivedHook !== undefined) this._onBundleReceivedHook = options.onBundleReceivedHook;
    if (options.allowedIngestTokens) {
      this._allowedIngestTokens = new Set(options.allowedIngestTokens);
    }
    if (options.maxRequestsPerMinute !== undefined) {
      this._maxRequestsPerWindow = options.maxRequestsPerMinute;
    }
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

  public async GetPublicKeyDescriptor(): Promise<{
    keyId: string;
    publicKey: string;
    algorithm: 'X25519';
    signature?: string;
  }> {
    await this.EnsureDefaultKeyPair();
    const keyId = this._activeKeyId!;
    const entry = this._publicKeysByKeyId.get(keyId)!;
    return {
      keyId,
      publicKey: entry.publicKeyBase64,
      algorithm: 'X25519',
      signature: entry.signatureBase64
    };
  }

  public ValidateIngestAuth(apiKeyHeader?: string): boolean {
    if (this._allowedIngestTokens.size === 0) {
      // If no static token list is configured, require a non-empty mj_sk_* or bearer token
      return Boolean(apiKeyHeader && apiKeyHeader.trim().length > 0);
    }
    if (!apiKeyHeader) return false;
    return this._allowedIngestTokens.has(apiKeyHeader.trim());
  }

  public CheckRateLimit(callerKey: string): boolean {
    const now = Date.now();
    const existing = this._rateCounters.get(callerKey);
    if (!existing || now - existing.windowStartMs >= this._rateLimitWindowMs) {
      this._rateCounters.set(callerKey, { count: 1, windowStartMs: now });
      return true;
    }
    if (existing.count >= this._maxRequestsPerWindow) {
      return false;
    }
    existing.count += 1;
    return true;
  }

  public InitiateBundleIntake(req: IntakeCreateBundleRequest): IntakeCreateBundleResponse {
    if (!this._enabled) {
      throw new Error('Diagnostic bundle intake is disabled on this instance.');
    }
    if (!req.installId || !req.bundleId) {
      throw new Error('installId and bundleId are required.');
    }
    if (!Number.isFinite(req.sizeBytes) || req.sizeBytes <= 0 || req.sizeBytes > MAX_INTAKE_BUNDLE_BYTES) {
      throw new Error(`Invalid sizeBytes (${req.sizeBytes}); must be between 1 and ${MAX_INTAKE_BUNDLE_BYTES}.`);
    }
    if (!this._privateKeysByKeyId.has(req.keyId)) {
      throw new Error(`Unknown recipient keyId '${req.keyId}'.`);
    }

    const referenceId = `diagref_${crypto.randomUUID()}`;
    const now = Date.now();
    const uploadExpiresAtMs = now + 10 * 60_000;

    this._records.set(referenceId, {
      referenceId,
      request: req,
      status: 'Receiving',
      createdAtMs: now,
      uploadExpiresAtMs
    });

    return {
      referenceId,
      uploadUrl: `/diagnostics/intake/v1/bundles/${referenceId}/payload`,
      uploadExpiresAt: new Date(uploadExpiresAtMs).toISOString()
    };
  }

  /**
   * Layer 1 & Quarantine Staging:
   * Inspects the MJDB envelope header in <1ms before accepting the payload into Quarantine storage.
   */
  public async UploadEncryptedPayload(
    referenceId: string,
    payloadBytes: Uint8Array
  ): Promise<{ accepted: boolean; reasonCode?: string; reason?: string }> {
    const rec = this._records.get(referenceId);
    if (!rec) {
      return { accepted: false, reasonCode: 'UNKNOWN_REFERENCE', reason: 'Unknown referenceId' };
    }
    if (rec.status !== 'Receiving') {
      return { accepted: false, reasonCode: 'INVALID_STATE', reason: `Cannot upload in state ${rec.status}` };
    }
    if (Date.now() > rec.uploadExpiresAtMs) {
      rec.status = 'Failed';
      rec.failureReason = 'Upload window expired';
      return { accepted: false, reasonCode: 'UPLOAD_EXPIRED', reason: 'Upload window expired' };
    }
    if (payloadBytes.byteLength > MAX_INTAKE_BUNDLE_BYTES || payloadBytes.byteLength !== rec.request.sizeBytes) {
      rec.status = 'Failed';
      rec.failureReason = `Payload size mismatch (${payloadBytes.byteLength} vs declared ${rec.request.sizeBytes})`;
      return {
        accepted: false,
        reasonCode: 'SIZE_MISMATCH',
        reason: rec.failureReason
      };
    }

    // Fast <1ms MJDB cryptographic header pre-check before touching storage
    const headerCheck = InspectEncryptedEnvelopeHeader(payloadBytes, [...this._privateKeysByKeyId.keys()]);
    if (!headerCheck.valid) {
      rec.status = 'Failed';
      rec.failureReason = `Envelope header verification failed: ${headerCheck.reason}`;
      return {
        accepted: false,
        reasonCode: headerCheck.reasonCode,
        reason: headerCheck.reason
      };
    }

    const actualEncryptedSha256 = crypto.createHash('sha256').update(payloadBytes).digest('hex');
    if (actualEncryptedSha256.toLowerCase() !== rec.request.encryptedSha256.toLowerCase()) {
      rec.status = 'Failed';
      rec.failureReason = 'Encrypted payload SHA-256 mismatch';
      return {
        accepted: false,
        reasonCode: 'ENCRYPTED_SHA256_MISMATCH',
        reason: rec.failureReason
      };
    }

    rec.encryptedPayload = payloadBytes;
    if (this._storageBridge) {
      rec.quarantinePath = await this._storageBridge.WriteQuarantineObject(referenceId, payloadBytes);
    }
    rec.status = 'Quarantined';
    return { accepted: true };
  }

  /**
   * Layers 2, 3, & 4:
   * - Verifies hashes and AEAD-decrypts the .mjdiag.enc envelope
   * - Runs VerifyBundleArchive() (strict ZIP structure, compression ratio <= 25:1, manifest schema, SHA-256 digests)
   * - Runs IDiagnosticMalwareScanner.ScanBundle()
   * - Promotes from Quarantine MJStorage to Verified MJStorage (or deletes from Quarantine on failure)
   * - Indexes manifest & findings and invokes OnBundleReceivedHook
   */
  public async CompleteBundleIntake(
    referenceId: string,
    completeReq: IntakeCompleteRequest
  ): Promise<IntakeCompleteResponse> {
    return WithoutDiagnosticCapture(async () => {
      const rec = this._records.get(referenceId);
      if (!rec || !rec.encryptedPayload) {
        return {
          status: 'rejected',
          referenceId,
          bundleId: rec?.request.bundleId ?? 'unknown',
          reasonCode: 'MISSING_PAYLOAD',
          reason: 'No quarantined payload found for referenceId'
        };
      }

      const rejectAndCleanup = async (
        reasonCode: string,
        reason: string,
        malwareScan?: MalwareScanResult
      ): Promise<IntakeCompleteResponse> => {
        rec.status = 'Failed';
        rec.failureReason = reason;
        rec.malwareScanResult = malwareScan;
        if (rec.quarantinePath && this._storageBridge) {
          await this._storageBridge.DeleteQuarantineObject(rec.quarantinePath).catch(() => {});
        }
        rec.encryptedPayload = undefined;
        return {
          status: 'rejected',
          referenceId,
          bundleId: rec.request.bundleId,
          malwareScan,
          reasonCode,
          reason
        };
      };

      if (completeReq.encryptedSha256.toLowerCase() !== rec.request.encryptedSha256.toLowerCase()) {
        return rejectAndCleanup('ENCRYPTED_SHA256_MISMATCH', 'Complete encryptedSha256 does not match');
      }

      const keyMap: Record<string, string> = {};
      for (const [k, v] of this._privateKeysByKeyId.entries()) {
        keyMap[k] = v;
      }

      // Layer 2: AEAD Decrypt + VerifyBundleArchive
      const decrypted = await DecryptDiagnosticBundle(rec.encryptedPayload, {
        PrivateKeysByKeyId: keyMap
      });

      if (!decrypted.valid || !decrypted.decryptedZipBytes || !decrypted.archiveVerification?.valid) {
        return rejectAndCleanup(
          decrypted.archiveVerification?.reasonCode ?? 'DECRYPTION_FAILED',
          decrypted.reason ?? 'AEAD decryption or inner archive structural verification failed'
        );
      }

      const actualPlaintextSha256 = crypto
        .createHash('sha256')
        .update(decrypted.decryptedZipBytes)
        .digest('hex');

      if (actualPlaintextSha256.toLowerCase() !== completeReq.plaintextSha256.toLowerCase()) {
        return rejectAndCleanup(
          'PLAINTEXT_SHA256_MISMATCH',
          'Decrypted archive SHA-256 does not match declared plaintextSha256'
        );
      }

      // Layer 3: Malware Scanning on Quarantined / Decrypted archive
      const scanResult = await this._malwareScanner.ScanBundle({
        referenceId,
        bundleId: rec.request.bundleId,
        senderInstallId: rec.request.installId,
        quarantineObjectPath: rec.quarantinePath,
        decryptedZipBytes: decrypted.decryptedZipBytes,
        encryptedBytes: rec.encryptedPayload,
        objectTags: completeReq.objectTags
      });
      rec.malwareScanResult = scanResult;

      if (scanResult.verdict !== 'Clean') {
        return rejectAndCleanup(
          `MALWARE_${scanResult.verdict.toUpperCase()}`,
          `Malware scanner (${scanResult.engineName}) rejected bundle: ${scanResult.threatName ?? scanResult.details ?? scanResult.verdict}`,
          scanResult
        );
      }

      // Layer 4: Promote from Quarantine to Verified MJStorage & Index Findings
      if (this._storageBridge) {
        rec.verifiedStoragePath = await this._storageBridge.PromoteToVerifiedStorage(
          referenceId,
          rec.quarantinePath ?? referenceId,
          decrypted.decryptedZipBytes
        );
        if (rec.quarantinePath) {
          await this._storageBridge.DeleteQuarantineObject(rec.quarantinePath).catch(() => {});
        }
      }

      const parsedData = ParseBundleDataFromArchive(decrypted.archiveVerification);
      if (!parsedData.findings || parsedData.findings.length === 0) {
        parsedData.findings = AnalyzeDiagnosticBundleData(parsedData);
      }

      rec.decryptedZipBytes = decrypted.decryptedZipBytes;
      rec.parsedBundleData = parsedData;
      rec.status = 'Ready';

      const retentionUntil = new Date(
        Date.now() + this._retentionDays * 24 * 60 * 60 * 1000
      ).toISOString();

      if (this._onBundleReceivedHook) {
        void this._onBundleReceivedHook({
          referenceId,
          bundleId: rec.request.bundleId,
          senderInstallId: rec.request.installId,
          senderMjVersion: rec.request.mjVersion,
          summary: rec.request.summary,
          contact: rec.request.contact,
          findingsCount: parsedData.findings.length,
          verifiedStoragePath: rec.verifiedStoragePath
        }).catch(() => {});
      }

      return {
        status: 'received',
        referenceId,
        bundleId: rec.request.bundleId,
        retentionUntil,
        findingsCount: parsedData.findings.length,
        malwareScan: scanResult
      };
    });
  }

  public GetReceivedBundle(referenceId: string): StoredIntakeBundleRecord | undefined {
    return this._records.get(referenceId);
  }

  public ListReceivedBundles(): StoredIntakeBundleRecord[] {
    return [...this._records.values()];
  }
}
