import {
    BaseEntity,
    BaseEntityResult,
    EntityDeleteOptions,
    EntitySaveOptions,
    IMetadataProvider,
    LogError,
    ValidationErrorInfo,
    ValidationErrorType,
    ValidationResult,
} from '@memberjunction/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { MJListEntityExtended } from '@memberjunction/core-entities';
import { ListOperations } from '@memberjunction/lists';

import { ListRefreshRoutine } from './list-refresh/ListRefreshRoutine';

/** The fields that say which source a list refreshes from. Changing any of them re-links the list. */
const SOURCE_IDENTITY_FIELDS = ['SourceViewID', 'SourceQueryID', 'SourceQueryKeyField'] as const;

/** The fields the list's refresh routine follows. */
const ROUTINE_FIELDS = ['AutoRefresh', 'Name', 'UserID', 'SourceViewID', 'SourceQueryID'] as const;

/**
 * Server-side Lists entity.
 *
 * **Delete.** A user may delete a List only if they own it, unless they hold the Developer or
 * Integration role. The rule lives once in {@link MJListEntityExtended.UserCanDelete} and is shared
 * with the UI. The `EntityPermission` migration grants the UI role entity-wide Delete on Lists, and
 * this override narrows it to owner-or-privileged, since entity permissions can't express row-level
 * ownership. The list's refresh routine is deleted after the list.
 *
 * **Source and refresh.** Only the list's owner may link it to a source query or view, or turn on
 * Refresh automatically. Linking an existing list to a new source fills it from that source right
 * away, adding records only. Turning Refresh automatically on creates (or re-enables) a User Routine
 * that runs "Refresh List From Source" on the Lists app's default schedule; turning it off disables
 * the routine. Both happen after the save and never fail it: the list is valid and already saved,
 * so an error is logged instead.
 */
@RegisterClass(BaseEntity, 'MJ: Lists')
export class MJListEntityServer extends MJListEntityExtended {
    public override Validate(): ValidationResult {
        const result = super.Validate();
        if (this.SourceQueryID && !this.SourceQueryKeyField?.trim()) {
            result.Errors.push(new ValidationErrorInfo(
                'SourceQueryKeyField',
                'A list refreshed from a query needs SourceQueryKeyField: the query column that holds the record key.',
                this.SourceQueryKeyField,
                ValidationErrorType.Failure,
            ));
        }
        result.Success = result.Success && result.Errors.length === 0;
        return result;
    }

    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        if (options?.ReplayOnly) return super.Save(options);
        // Read before the save, which resets every dirty flag.
        const isNew = !this.IsSaved;
        const sourceRelinked = this.anyFieldDirty(SOURCE_IDENTITY_FIELDS) && this.hasSource;
        const reconcileRoutine = (isNew && this.AutoRefresh) || (!isNew && this.anyFieldDirty(ROUTINE_FIELDS));

        const refusal = this.ownerOnlyRefusal(sourceRelinked || (this.AutoRefresh && this.anyFieldDirty(['AutoRefresh'])));
        if (refusal) {
            this.RegisterResultHistoryEntry(refusal);
            return false;
        }
        // A new source has not been approved by anyone yet: its first refresh takes its fingerprint.
        if (sourceRelinked) this.SourceFingerprint = null;

        if (!(await super.Save(options))) return false;

        if (reconcileRoutine) await this.reconcileRoutineSafely(options);
        // A list created with a source was filled by whatever created it (MaterializeFromView does).
        if (sourceRelinked && !isNew) await this.fillFromSourceSafely();
        return true;
    }

    public override async Delete(options?: EntityDeleteOptions): Promise<boolean> {
        if (!MJListEntityExtended.UserCanDelete(this.UserID, this.ContextCurrentUser)) {
            this.RegisterResultHistoryEntry(this.refusalResult('delete',
                'You do not have permission to delete this List. Only the List owner, ' +
                'or a user in the Developer or Integration role, may delete it.'));
            return false;
        }
        const routineID = this.RefreshRoutineID;
        if (!(await super.Delete(options))) return false;
        // The list's foreign key points at the routine, so the routine goes after the list.
        if (routineID) {
            await this.runSafely('routine delete', () => this.routine().DeleteAsync(routineID));
        }
        return true;
    }

    private get hasSource(): boolean {
        return !!this.SourceViewID || !!this.SourceQueryID;
    }

    /** Refuses a save that links a source or turns on Refresh automatically, unless the saving user owns the list. */
    private ownerOnlyRefusal(ownerOnlyChange: boolean): BaseEntityResult | null {
        if (!ownerOnlyChange) return null;
        const user = this.ContextCurrentUser;
        if (user && UUIDsEqual(user.ID, this.UserID)) return null;
        return this.refusalResult('update',
            'Only the owner of this List can link it to a source or turn on Refresh automatically.');
    }

    private async reconcileRoutineSafely(options?: EntitySaveOptions): Promise<void> {
        await this.runSafely('refresh routine', async () => {
            const routineID = await this.routine().ReconcileAsync(this);
            if (routineID && !UUIDsEqual(routineID, this.RefreshRoutineID)) {
                this.RefreshRoutineID = routineID;
                if (!(await super.Save(options))) {
                    throw new Error(`could not store the routine ID: ${this.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                }
            }
        });
    }

    /** Fills the list from its newly linked source, adding records only. */
    private async fillFromSourceSafely(): Promise<void> {
        await this.runSafely('fill from new source', async () => {
            const result = await new ListOperations(this.ContextCurrentUser, this.ProviderToUse as unknown as IMetadataProvider)
                .RefreshFromSource(this.ID, 'Additive', { ConfirmDrops: false });
            if (!result.Success) throw new Error(`${result.ResultCode}: ${result.Message}`);
        });
    }

    private async runSafely(label: string, work: () => Promise<void>): Promise<void> {
        try {
            await work();
        } catch (e) {
            LogError(`MJListEntityServer: ${label} failed for list '${this.Name}' (${this.ID}): ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    private routine(): ListRefreshRoutine {
        return new ListRefreshRoutine(this.ProviderToUse as unknown as IMetadataProvider, this.ContextCurrentUser);
    }

    private anyFieldDirty(fields: readonly string[]): boolean {
        return fields.some((f) => this.GetFieldByName(f)?.Dirty ?? false);
    }

    private refusalResult(type: 'update' | 'delete', message: string): BaseEntityResult {
        const result = new BaseEntityResult();
        result.StartedAt = new Date();
        result.Success = false;
        result.Type = type;
        result.Message = message;
        result.EndedAt = new Date();
        return result;
    }
}
