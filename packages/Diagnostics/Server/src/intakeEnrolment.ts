import * as crypto from 'node:crypto';
import { LogError, LogStatus } from '@memberjunction/core';
import { MJDiagnosticSenderRegistrationEntity } from '@memberjunction/core-entities';
import { SanitizeForLog, UUIDsEqual } from '@memberjunction/global';
import { VerifyEnrolProof } from '@memberjunction/diagnostics';
import {
  IntakeDataContext,
  LoadSenderRegistrationRow,
  SENDER_REGISTRATION_ENTITY,
  WithSenderRegistrationLock,
} from './senderRegistry.js';
import { MarkTrustedRegistrationWrite } from './senderRegistrationEntityServer.js';

const REGISTRATION_CODE_TTL_MS = 24 * 60 * 60_000;
const MAX_FIELD_LENGTH = { installId: 100, keyId: 100, publicKeyBase64: 255, registrationCode: 200, proof: 200 } as const;

/** Body of `POST /diagnostics/intake/v1/enroll`. */
export interface EnrolRequestBody {
  installId: string;
  registrationCode: string;
  keyId: string;
  publicKeyBase64: string;
  proof: string;
}

/** Response of a successful enrolment. The sender pins both collector keys. */
export interface EnrolResponseBody {
  installId: string;
  keyId: string;
  collectorPublicKeyBase64: string;
  collectorSigningPublicKeyBase64: string;
}

/** The collector keys an enrolment response carries. */
export interface CollectorKeys {
  PublicKeyBase64: string;
  SigningPublicKeyBase64: string;
}

export type EnrolOutcome =
  | { Ok: true; Body: EnrolResponseBody }
  | { Ok: false; Status: 400 | 401; Reason: string };

/** Returns the lower-case hex SHA-256 of a registration code. */
export function HashRegistrationCode(code: string): string {
  return crypto.createHash('sha256').update(code, 'utf8').digest('hex');
}

/** Compares a code against a stored SHA-256 hex hash in constant time. */
export function RegistrationCodeMatches(code: string, storedHashHex: string): boolean {
  const actual = Buffer.from(HashRegistrationCode(code), 'hex');
  const expected = Buffer.from(storedHashHex.trim().toLowerCase(), 'hex');
  return actual.byteLength === expected.byteLength && crypto.timingSafeEqual(actual, expected);
}

/** Reads and checks the enrolment body. Returns null when a field is missing, not a string or too long. */
export function ParseEnrolRequestBody(value: unknown): EnrolRequestBody | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const source = value as Record<string, unknown>;
  const out: Partial<EnrolRequestBody> = {};
  for (const [field, maxLength] of Object.entries(MAX_FIELD_LENGTH) as Array<[keyof EnrolRequestBody, number]>) {
    const fieldValue = source[field];
    if (typeof fieldValue !== 'string' || !fieldValue || fieldValue.length > maxLength) {
      return null;
    }
    out[field] = fieldValue;
  }
  return out as EnrolRequestBody;
}

/** Why a registration row cannot take this enrolment, or null when it can. */
function codeFailure(row: MJDiagnosticSenderRegistrationEntity, code: string, now: Date): string | null {
  if (!row.RegistrationCodeHash || !row.RegistrationCodeExpiresAt) {
    return 'no registration code is outstanding';
  }
  if (new Date(row.RegistrationCodeExpiresAt).getTime() <= now.getTime()) {
    return 'the registration code expired';
  }
  return RegistrationCodeMatches(code, row.RegistrationCodeHash) ? null : 'the registration code does not match';
}

/**
 * Records the enrolled key on the row, sets it Active (also from Revoked: a new code re-enables a
 * sender) and clears the code. Returns false when the save fails.
 */
async function activateRegistration(row: MJDiagnosticSenderRegistrationEntity, body: EnrolRequestBody, now: Date): Promise<boolean> {
  row.KeyID = body.keyId;
  row.PublicKeyBase64 = body.publicKeyBase64;
  row.Status = 'Active';
  row.EnrolledAt = now;
  row.RevokedAt = null;
  row.RegistrationCodeHash = null;
  row.RegistrationCodeExpiresAt = null;
  MarkTrustedRegistrationWrite(row);
  if (await row.Save()) {
    return true;
  }
  LogError(`Diagnostics enrolment: could not save the registration for '${SanitizeForLog(row.InstallID, 200)}': ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`);
  return false;
}

function reject(installId: string, reason: string, status: 400 | 401 = 401): EnrolOutcome {
  LogError(`Diagnostics enrolment refused for '${SanitizeForLog(installId, 200)}': ${reason}`);
  return { Ok: false, Status: status, Reason: reason };
}

/**
 * Enrols a sender: checks the one-time registration code (hash, expiry, constant-time compare),
 * checks the proof of possession of the new key, then activates the registration with that key.
 * The code is single-use within this process: activation runs under the registration lock, and
 * inside it the row is reloaded from the database and the code is checked again. Two collector
 * processes that receive the same code at the same moment can still both accept it.
 */
export async function EnrolSenderAtCollector(
  body: EnrolRequestBody,
  audience: string,
  collectorKeys: CollectorKeys,
  data: IntakeDataContext,
  now = new Date()
): Promise<EnrolOutcome> {
  const row = await LoadSenderRegistrationRow(body.installId, data);
  if (row === undefined) {
    return reject(body.installId, 'the registration could not be loaded', 400);
  }
  if (!row) {
    return reject(body.installId, 'no registration exists for this install');
  }
  const failure = codeFailure(row, body.registrationCode, now);
  if (failure) {
    return reject(body.installId, failure);
  }
  const proofOk = await VerifyEnrolProof({
    InstallID: body.installId,
    KeyID: body.keyId,
    RegistrationCode: body.registrationCode,
    Audience: audience,
    PublicKeyBase64: body.publicKeyBase64,
    ProofBase64: body.proof
  });
  if (!proofOk) {
    return reject(body.installId, 'the proof of possession does not verify');
  }
  const activationFailure = await WithSenderRegistrationLock(row.ID, () => consumeCodeAndActivate(row.ID, body, data, now));
  if (activationFailure) {
    return activationFailure;
  }
  LogStatus(`Diagnostics enrolment: install '${SanitizeForLog(body.installId, 200)}' enrolled key '${SanitizeForLog(body.keyId, 200)}'.`);
  return {
    Ok: true,
    Body: {
      installId: row.InstallID,
      keyId: body.keyId,
      collectorPublicKeyBase64: collectorKeys.PublicKeyBase64,
      collectorSigningPublicKeyBase64: collectorKeys.SigningPublicKeyBase64
    }
  };
}

/**
 * Reloads the registration by ID, checks the code again and activates the row.
 * Returns the refusal, or null when the registration is now Active with the new key.
 * Call it under the registration lock.
 */
async function consumeCodeAndActivate(
  registrationId: string,
  body: EnrolRequestBody,
  data: IntakeDataContext,
  now: Date
): Promise<EnrolOutcome | null> {
  const fresh = await data.Provider.GetEntityObject<MJDiagnosticSenderRegistrationEntity>(SENDER_REGISTRATION_ENTITY, data.ContextUser);
  if (!(await fresh.Load(registrationId)) || !UUIDsEqual(fresh.ID, registrationId)) {
    return reject(body.installId, 'the registration could not be reloaded', 400);
  }
  const failure = codeFailure(fresh, body.registrationCode, now);
  if (failure) {
    return reject(body.installId, failure);
  }
  if (!(await activateRegistration(fresh, body, now))) {
    return reject(body.installId, 'the registration could not be saved', 400);
  }
  return null;
}

/** A new one-time registration code. */
export interface IssuedRegistrationCode {
  Code: string;
  ExpiresAt: Date;
}

/**
 * Issues a registration code for a registration: 32 random bytes as base64url, its SHA-256 hex
 * saved on the row with a 24-hour expiry. The plain code is returned once and never stored.
 * Runs under the registration lock. Throws when the registration does not exist or the save fails.
 */
export async function IssueSenderRegistrationCode(
  registrationId: string,
  data: IntakeDataContext,
  now = new Date()
): Promise<IssuedRegistrationCode> {
  return WithSenderRegistrationLock(registrationId, () => issueCode(registrationId, data, now));
}

async function issueCode(registrationId: string, data: IntakeDataContext, now: Date): Promise<IssuedRegistrationCode> {
  const row = await data.Provider.GetEntityObject<MJDiagnosticSenderRegistrationEntity>(SENDER_REGISTRATION_ENTITY, data.ContextUser);
  if (!(await row.Load(registrationId))) {
    throw new Error(`Diagnostic sender registration '${registrationId}' not found.`);
  }
  const code = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + REGISTRATION_CODE_TTL_MS);
  row.RegistrationCodeHash = HashRegistrationCode(code);
  row.RegistrationCodeExpiresAt = expiresAt;
  MarkTrustedRegistrationWrite(row);
  if (!(await row.Save())) {
    throw new Error(`Could not save the registration code: ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`);
  }
  return { Code: code, ExpiresAt: expiresAt };
}
