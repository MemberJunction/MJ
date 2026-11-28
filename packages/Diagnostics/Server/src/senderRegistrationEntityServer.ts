import {
  BaseEntity,
  BaseEntityResult,
  EntityDeleteOptions,
  EntitySaveOptions,
  IMetadataProvider,
  UserInfo,
} from '@memberjunction/core';
import { MJDiagnosticSenderRegistrationEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { AuthorizeDiagnosticsUser } from './remoteOperations.js';

type RegistrationField = keyof MJDiagnosticSenderRegistrationEntity & string;

/** Fields only enrolment, code issue, last-seen updates, revoke and reactivate may write. */
const GUARDED_FIELDS: readonly RegistrationField[] = [
  'InstallID',
  'Status',
  'KeyAlgorithm',
  'KeyID',
  'PublicKeyBase64',
  'RegistrationCodeHash',
  'RegistrationCodeExpiresAt',
  'EnrolledAt',
  'RevokedAt',
  'LastSeenAt',
];

/** Fields that must be empty on a row created outside the diagnostics server. */
const EMPTY_ON_CREATE: readonly RegistrationField[] = [
  'KeyID',
  'PublicKeyBase64',
  'RegistrationCodeHash',
  'RegistrationCodeExpiresAt',
  'EnrolledAt',
  'RevokedAt',
  'LastSeenAt',
];

const trustedWrites = new WeakSet<MJDiagnosticSenderRegistrationEntity>();

/**
 * Marks the next `Save()` of `row` as a diagnostics-server write, which skips the guard.
 * The mark is cleared when that save starts.
 */
export function MarkTrustedRegistrationWrite(row: MJDiagnosticSenderRegistrationEntity): void {
  trustedWrites.add(row);
}

/**
 * Server-side `MJ: Diagnostic Sender Registrations` entity.
 *
 * A write that the diagnostics server marked with `MarkTrustedRegistrationWrite` always passes.
 * Any other write needs the `Diagnostics: Manage Intake` authorization, and:
 * - a create must be `Pending` with no key, code, or enrolment, revocation or last-seen time;
 * - an update must not change a key, code, status or timestamp field (see `GUARDED_FIELDS`);
 * - a `ReplayOnly` save is refused.
 *
 * The checks are in `Save()` and not in `Validate()`, so a `ReplayOnly` save, which skips
 * `Validate()`, cannot bypass them. `Delete()` has its own check.
 */
@RegisterClass(BaseEntity, 'MJ: Diagnostic Sender Registrations')
export class MJDiagnosticSenderRegistrationEntityServer extends MJDiagnosticSenderRegistrationEntity {
  public override async Save(options?: EntitySaveOptions): Promise<boolean> {
    if (trustedWrites.delete(this)) {
      return super.Save(options);
    }
    const type = this.IsSaved ? 'update' : 'create';
    if (options?.ReplayOnly) {
      return this.refuse(type, 'A ReplayOnly save of a diagnostic sender registration is not allowed.');
    }
    if (!(await this.callerManagesIntake())) {
      return this.refuse(type, 'Saving a diagnostic sender registration needs the Diagnostics: Manage Intake authorization.');
    }
    const fieldProblem = this.IsSaved ? this.changedGuardedField() : this.createProblem();
    if (fieldProblem) {
      return this.refuse(type, fieldProblem);
    }
    return super.Save(options);
  }

  public override async Delete(options?: EntityDeleteOptions): Promise<boolean> {
    if (!(await this.callerManagesIntake())) {
      return this.refuse('delete', 'Deleting a diagnostic sender registration needs the Diagnostics: Manage Intake authorization.');
    }
    return super.Delete(options);
  }

  private async callerManagesIntake(): Promise<boolean> {
    const caller: UserInfo | undefined = this.ActiveUser ?? undefined;
    // BaseEntity types its provider as IEntityDataProvider; the server providers also implement IMetadataProvider.
    return AuthorizeDiagnosticsUser(caller, 'Diagnostics: Manage Intake', this.ProviderToUse as unknown as IMetadataProvider);
  }

  /** Why a new row cannot be created outside the diagnostics server, or null when it can. */
  private createProblem(): string | null {
    if (this.Status !== 'Pending') {
      return 'A new diagnostic sender registration must have Status Pending. A sender becomes Active by enrolling with a registration code.';
    }
    const filled = EMPTY_ON_CREATE.find((field) => this[field] != null);
    return filled ? `A new diagnostic sender registration cannot set ${filled}. Only enrolment and the diagnostics operations set it.` : null;
  }

  /** The message for the first guarded field this update changes, or null when none changes. */
  private changedGuardedField(): string | null {
    const changed = GUARDED_FIELDS.find((field) => this.GetFieldByName(field)?.Dirty);
    return changed
      ? `${changed} of a diagnostic sender registration can only be changed by enrolment or the Revoke and Reactivate Diagnostic Sender operations.`
      : null;
  }

  private refuse(type: 'create' | 'update' | 'delete', message: string): boolean {
    const result = new BaseEntityResult();
    result.Success = false;
    result.Type = type;
    result.Message = message;
    result.StartedAt = new Date();
    result.EndedAt = new Date();
    this.RegisterResultHistoryEntry(result);
    return false;
  }
}
