import * as crypto from 'node:crypto';
import { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { CredentialEngine } from '@memberjunction/credentials';
import { DiagnosticKeyPair, GenerateDiagnosticKeyPair, SignEnrolProof } from '@memberjunction/diagnostics';
import { CollectorIntakeAudience, CollectorSender, FetchWithoutRedirect } from './collectorClient.js';
import { DIAGNOSTICS_SETTING_KEYS, DiagnosticsSettings } from './settings.js';

/** `MJ: Credential Types` name of the credential that holds the sender key. */
export const DIAGNOSTICS_SENDER_CREDENTIAL_TYPE = 'Diagnostics Sender Key';

/** Values the `Diagnostics.External.SenderCredentialID` credential holds. */
interface SenderKeyCredentialValues extends Record<string, string> {
  keyId: string;
  publicKey: string;
  privateKey: string;
}

/** The collector's answer to `POST /enroll`. */
interface CollectorEnrolResponse {
  installId: string;
  keyId: string;
  collectorPublicKeyBase64: string;
  collectorSigningPublicKeyBase64: string;
}

export interface EnrolSenderOptions {
  RegistrationCode: string;
  ContextUser: UserInfo;
  Provider?: IMetadataProvider;
  /** Clock for the key ID; defaults to now. */
  Now?: Date;
}

export interface EnrolSenderResult {
  InstallID: string;
  KeyID: string;
  EnrolledAt: string;
}

/**
 * Enrols this installation with the collector at `Diagnostics.External.CollectorUrl`: generates an
 * Ed25519 sender key, proves possession to `POST /enroll` with the registration code, then stores
 * the private key in `MJ: Credentials` and records the key ID and the collector's keys.
 */
export async function EnrolSender(options: EnrolSenderOptions): Promise<EnrolSenderResult> {
  const registrationCode = options.RegistrationCode?.trim();
  if (!registrationCode) {
    throw new Error('A registration code is required to enrol with the collector.');
  }
  const settings = await DiagnosticsSettings.Load(options.ContextUser, options.Provider);
  const audience = CollectorIntakeAudience(settings.ExternalCollectorUrl);
  const installId = await settings.EnsureInstallID(options.ContextUser);
  const keyPair = await GenerateDiagnosticKeyPair('Ed25519', BuildSenderKeyID(installId, options.Now ?? new Date()));
  const response = await postEnrolment(audience, installId, registrationCode, keyPair);
  const credentialId = await storeSenderKey(keyPair, options.ContextUser);
  await saveEnrolment(settings, credentialId, keyPair.keyId, response, options.ContextUser);
  return { InstallID: installId, KeyID: keyPair.keyId, EnrolledAt: new Date().toISOString() };
}

/** Returns a key ID of the form `<first 8 chars of the install ID>-<yyyymm>-<4 hex>`. */
export function BuildSenderKeyID(installId: string, now: Date): string {
  const prefix = installId.replace(/-/g, '').slice(0, 8).toLowerCase();
  const month = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  return `${prefix}-${month}-${crypto.randomBytes(2).toString('hex')}`;
}

/**
 * Loads the enrolled sender identity. Throws a clear message when this installation is not
 * enrolled or the stored key does not match `Diagnostics.External.SenderKeyID`.
 */
export async function LoadEnrolledSender(settings: DiagnosticsSettings, contextUser: UserInfo): Promise<CollectorSender> {
  assertEnrolled(settings);
  await CredentialEngine.Instance.Config(false, contextUser);
  const resolved = await CredentialEngine.Instance.GetCredential<SenderKeyCredentialValues>(DIAGNOSTICS_SENDER_CREDENTIAL_TYPE, {
    credentialId: settings.ExternalSenderCredentialID,
    contextUser,
    subsystem: 'Diagnostics Sender'
  });
  const values = resolved.values;
  if (!values.privateKey || values.keyId !== settings.ExternalSenderKeyID) {
    throw new Error(
      `The sender key credential does not match ${DIAGNOSTICS_SETTING_KEYS.ExternalSenderKeyID}. Enrol this installation again.`
    );
  }
  return { InstallID: settings.InstallID, KeyID: values.keyId, PrivateKeyBase64: values.privateKey };
}

function assertEnrolled(settings: DiagnosticsSettings): void {
  const missing = [
    [DIAGNOSTICS_SETTING_KEYS.InstallID, settings.InstallID],
    [DIAGNOSTICS_SETTING_KEYS.ExternalSenderCredentialID, settings.ExternalSenderCredentialID],
    [DIAGNOSTICS_SETTING_KEYS.ExternalSenderKeyID, settings.ExternalSenderKeyID],
    [DIAGNOSTICS_SETTING_KEYS.ExternalCollectorSigningPublicKeyBase64, settings.ExternalCollectorSigningPublicKeyBase64]
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length > 0) {
    throw new Error(
      `This installation is not enrolled with the collector (${missing.join(', ')} not set). ` +
        'Run Diagnostics.EnrolSender with a registration code from the collector first.'
    );
  }
}

async function postEnrolment(
  audience: string,
  installId: string,
  registrationCode: string,
  keyPair: DiagnosticKeyPair
): Promise<CollectorEnrolResponse> {
  const proof = await SignEnrolProof({
    InstallID: installId,
    KeyID: keyPair.keyId,
    RegistrationCode: registrationCode,
    Audience: audience,
    PrivateKeyBase64: keyPair.privateKeyBase64
  });
  const body = JSON.stringify({ installId, registrationCode, keyId: keyPair.keyId, publicKeyBase64: keyPair.publicKeyBase64, proof });
  const resp = await FetchWithoutRedirect(
    `${audience}/enroll`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body },
    'POST /enroll'
  );
  if (!resp.ok) {
    throw new Error(`The collector refused the enrolment: HTTP ${resp.status}`);
  }
  return checkEnrolResponse(await parseEnrolResponse(resp), installId, keyPair.keyId);
}

async function parseEnrolResponse(resp: Response): Promise<CollectorEnrolResponse> {
  const text = await resp.text();
  try {
    return JSON.parse(text) as CollectorEnrolResponse;
  } catch {
    throw new Error('The collector enrolment response is not JSON.');
  }
}

function checkEnrolResponse(json: CollectorEnrolResponse, installId: string, keyId: string): CollectorEnrolResponse {
  if (!UUIDsEqual(json.installId, installId) || json.keyId !== keyId) {
    throw new Error('The collector enrolment response names a different installation or key.');
  }
  if (!json.collectorPublicKeyBase64 || !json.collectorSigningPublicKeyBase64) {
    throw new Error('The collector enrolment response has no collector public keys.');
  }
  return json;
}

async function storeSenderKey(keyPair: DiagnosticKeyPair, contextUser: UserInfo): Promise<string> {
  await CredentialEngine.Instance.Config(false, contextUser);
  const values: SenderKeyCredentialValues = {
    keyId: keyPair.keyId,
    publicKey: keyPair.publicKeyBase64,
    privateKey: keyPair.privateKeyBase64
  };
  const credential = await CredentialEngine.Instance.StoreCredential(
    DIAGNOSTICS_SENDER_CREDENTIAL_TYPE,
    `Diagnostics Sender Key ${keyPair.keyId}`,
    values,
    { description: 'Ed25519 key this installation signs diagnostic collector requests with.' },
    contextUser
  );
  return credential.ID;
}

async function saveEnrolment(
  settings: DiagnosticsSettings,
  credentialId: string,
  keyId: string,
  response: CollectorEnrolResponse,
  contextUser: UserInfo
): Promise<void> {
  await settings.Save(DIAGNOSTICS_SETTING_KEYS.ExternalSenderCredentialID, credentialId, contextUser);
  await settings.Save(DIAGNOSTICS_SETTING_KEYS.ExternalSenderKeyID, keyId, contextUser);
  await settings.Save(DIAGNOSTICS_SETTING_KEYS.ExternalCollectorPublicKeyBase64, response.collectorPublicKeyBase64, contextUser);
  await settings.Save(
    DIAGNOSTICS_SETTING_KEYS.ExternalCollectorSigningPublicKeyBase64,
    response.collectorSigningPublicKeyBase64,
    contextUser
  );
}
