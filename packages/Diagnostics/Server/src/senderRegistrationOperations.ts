import { BaseRemotableOperation, IMetadataProvider, LogStatus, RemoteOpServerContext, UserInfo } from '@memberjunction/core';
import {
  DiagnosticsReactivateSenderInput,
  DiagnosticsReactivateSenderOperation,
  DiagnosticsReactivateSenderOutput,
  DiagnosticsRevokeSenderInput,
  DiagnosticsRevokeSenderOperation,
  DiagnosticsRevokeSenderOutput,
  MJDiagnosticSenderRegistrationEntity,
} from '@memberjunction/core-entities';
import { IsValidUUID, RegisterClass, SanitizeForLog } from '@memberjunction/global';
import { AuthorizeDiagnosticsUser } from './remoteOperations.js';
import { SENDER_REGISTRATION_ENTITY, WithSenderRegistrationLock } from './senderRegistry.js';
import { MarkTrustedRegistrationWrite } from './senderRegistrationEntityServer.js';

/** Throws unless `registrationId` is a UUID. */
function assertRegistrationId(registrationId: string): void {
  if (!registrationId || !IsValidUUID(registrationId)) {
    throw new Error('RegistrationID must be a UUID.');
  }
}

/**
 * Loads the registration by ID under the registration lock, lets `change` edit it, and saves it
 * as a trusted write. `change` throws to refuse the change. Returns the saved row.
 */
async function updateRegistration(
  registrationId: string,
  provider: IMetadataProvider,
  user: UserInfo,
  change: (row: MJDiagnosticSenderRegistrationEntity) => void
): Promise<MJDiagnosticSenderRegistrationEntity> {
  return WithSenderRegistrationLock(registrationId, async () => {
    const row = await provider.GetEntityObject<MJDiagnosticSenderRegistrationEntity>(SENDER_REGISTRATION_ENTITY, user);
    if (!(await row.Load(registrationId))) {
      throw new Error(`Diagnostic sender registration '${registrationId}' not found.`);
    }
    change(row);
    MarkTrustedRegistrationWrite(row);
    if (!(await row.Save())) {
      throw new Error(`Could not save the diagnostic sender registration: ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }
    return row;
  });
}

/** Revokes a sender registration: sets it Revoked, records the time and clears any outstanding code. */
@RegisterClass(BaseRemotableOperation, 'Diagnostics.RevokeSender')
export class DiagnosticsRevokeSenderServerOperation extends DiagnosticsRevokeSenderOperation {
  protected override async Authorize(
    _input: DiagnosticsRevokeSenderInput,
    user: UserInfo,
    context?: RemoteOpServerContext
  ): Promise<boolean> {
    return AuthorizeDiagnosticsUser(user, 'Diagnostics: Manage Intake', context?.provider);
  }

  protected override async InternalExecute(
    input: DiagnosticsRevokeSenderInput,
    provider: IMetadataProvider,
    user: UserInfo
  ): Promise<DiagnosticsRevokeSenderOutput> {
    assertRegistrationId(input.RegistrationID);
    const revokedAt = new Date();
    const row = await updateRegistration(input.RegistrationID, provider, user, (r) => {
      r.Status = 'Revoked';
      r.RevokedAt = revokedAt;
      r.RegistrationCodeHash = null;
      r.RegistrationCodeExpiresAt = null;
    });
    LogStatus(`Diagnostics intake: sender registration for '${SanitizeForLog(row.InstallID, 200)}' revoked.`);
    return { RegistrationID: row.ID, InstallID: row.InstallID, Status: 'Revoked', RevokedAt: revokedAt.toISOString() };
  }
}

/**
 * Sets a Revoked sender registration that has an enrolled key back to Active. A row that is not
 * Revoked, or has no key, is refused; such a sender needs a new registration code.
 */
@RegisterClass(BaseRemotableOperation, 'Diagnostics.ReactivateSender')
export class DiagnosticsReactivateSenderServerOperation extends DiagnosticsReactivateSenderOperation {
  protected override async Authorize(
    _input: DiagnosticsReactivateSenderInput,
    user: UserInfo,
    context?: RemoteOpServerContext
  ): Promise<boolean> {
    return AuthorizeDiagnosticsUser(user, 'Diagnostics: Manage Intake', context?.provider);
  }

  protected override async InternalExecute(
    input: DiagnosticsReactivateSenderInput,
    provider: IMetadataProvider,
    user: UserInfo
  ): Promise<DiagnosticsReactivateSenderOutput> {
    assertRegistrationId(input.RegistrationID);
    const row = await updateRegistration(input.RegistrationID, provider, user, (r) => {
      if (r.Status !== 'Revoked') {
        throw new Error(`Only a Revoked registration can be reactivated; this one is ${r.Status}.`);
      }
      if (!r.KeyID || !r.PublicKeyBase64) {
        throw new Error('This registration has no enrolled key. Issue a registration code so the sender can enrol.');
      }
      r.Status = 'Active';
      r.RevokedAt = null;
    });
    LogStatus(`Diagnostics intake: sender registration for '${SanitizeForLog(row.InstallID, 200)}' reactivated.`);
    return { RegistrationID: row.ID, InstallID: row.InstallID, Status: 'Active' };
  }
}
