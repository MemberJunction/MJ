import {
    BaseEntity,
    BaseEntityResult,
    EntitySaveOptions,
    ValidationErrorInfo,
    ValidationErrorType,
    ValidationResult,
} from '@memberjunction/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { MJFileEntity } from '@memberjunction/core-entities';

/** The `MJ: Files` fields that say where a row's bytes live. */
type StorageLocationField = 'ProviderID' | 'ProviderKey';

/**
 * Server-side `MJ: Files` entity: once a row exists, WHERE its bytes live is server-owned.
 *
 * `ProviderID` and `ProviderKey` decide which storage provider (and so which account) and which object every
 * file-ID route — `DownloadUrl`, `GetFileContents`, `CreateMediaAccessToken`, `DeleteFile`, the artifact download URL,
 * the agent file handler — reads, signs or deletes. A client that could re-point an existing row could make a row other
 * users trust (an attachment, an artifact's file) serve, or delete, a different object. So a save that changes either
 * field on an existing row is refused, unless trusted server code that chose the new location itself sets
 * {@link AllowStorageLocationChange} first — the same opt-in pattern `MJRubricEvaluationScoreEntityServer` uses for
 * server-computed rows. A GraphQL save never sets it.
 *
 * **What this does not cover — a new row.** A client may still create a row with a `ProviderKey` of its choosing, and
 * `Name` (the object key when `ProviderKey` is empty) is client-writable on every row. Refusing a client-supplied
 * `ProviderKey` on create would break Explorer's direct-upload path, which registers the object it just uploaded through
 * a client save, and would not stop aliasing anyway (`Name` is the fallback key). MJStorage's `UploadFile` sets the field
 * from a package that cannot reach this class. The guarantee for a new row comes from the routes instead: each one
 * resolves the row through the storage gate (`FileStorageEngine.ResolveFileObject`), which requires the caller's access
 * to the account and refuses an object any other `MJ: Files` row tracks when the caller cannot read that row. Closing the
 * create path needs a server-side registration mutation for the direct-upload flow — a follow-up.
 */
@RegisterClass(BaseEntity, 'MJ: Files')
export class MJFileEntityServer extends MJFileEntity {
    /**
     * Set by trusted server code, before `Save()`, when it re-points an existing row to a storage location it chose
     * itself. A client save leaves this false, so a change to `ProviderID` or `ProviderKey` on an existing row is refused.
     */
    public AllowStorageLocationChange = false;

    /** Adds the storage-location rule to the generated validation. */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        for (const field of this.refusedLocationChanges()) {
            result.Errors.push(new ValidationErrorInfo(
                field,
                MJFileEntityServer.locationChangeMessage(field),
                this.GetFieldByName(field)?.Value,
                ValidationErrorType.Failure
            ));
        }
        result.Success = result.Success && result.Errors.length === 0;
        return result;
    }

    /**
     * Applies the rule to a `ReplayOnly` save too: `ReplayOnly` skips `Validate()` but still writes, so without this the
     * rule would be one save option away from off.
     */
    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        const refused = options?.ReplayOnly ? this.refusedLocationChanges() : [];
        if (refused.length > 0) {
            return this.refuse(MJFileEntityServer.locationChangeMessage(refused[0]));
        }
        return super.Save(options);
    }

    /** The location fields this save would change on an existing row without the trusted opt-in. */
    private refusedLocationChanges(): StorageLocationField[] {
        if (!this.IsSaved || this.AllowStorageLocationChange) {
            return [];
        }
        const fields: StorageLocationField[] = ['ProviderID', 'ProviderKey'];
        return fields.filter(field => this.locationFieldChanged(field));
    }

    /** Whether `field` holds a different value from the one loaded (`ProviderID` compared as a UUID). */
    private locationFieldChanged(field: StorageLocationField): boolean {
        const info = this.GetFieldByName(field);
        if (!info?.Dirty) {
            return false;
        }
        const before = info.OldValue as string | null | undefined;
        const after = info.Value as string | null | undefined;
        if (field === 'ProviderID') {
            return !(before && after ? UUIDsEqual(before, after) : before === after);
        }
        return (before ?? null) !== (after ?? null);
    }

    /** Records a refused save on the result history (so `LatestResult.CompleteMessage` carries why) and returns false. */
    private refuse(message: string): boolean {
        const result = new BaseEntityResult();
        result.Success = false;
        result.Type = 'update';
        result.Message = message;
        result.StartedAt = new Date();
        result.EndedAt = new Date();
        this.RegisterResultHistoryEntry(result);
        return false;
    }

    /** The refusal for a client change to a storage-location field. */
    private static locationChangeMessage(field: StorageLocationField): string {
        return `${field} cannot be changed on an existing file: where a file's bytes live is set by the server when the file is stored.`;
    }
}
