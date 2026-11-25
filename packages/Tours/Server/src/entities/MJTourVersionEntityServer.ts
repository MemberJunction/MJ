/**
 * @fileoverview Server subclass for `MJ: Tour Versions` enforcing immutability of
 * published snapshots and preventing deletion while referenced by active tours or runs.
 * @module @memberjunction/tours-server
 */

import {
    BaseEntity,
    BaseEntityResult,
    RunView,
    ValidationErrorInfo,
    ValidationErrorType,
    type EntityDeleteOptions,
    type EntitySaveOptions,
    type UserInfo,
    type ValidationResult,
} from '@memberjunction/core';
import { MJTourVersionEntity } from '@memberjunction/core-entities';
import { EscapeSQLString, RegisterClass } from '@memberjunction/global';
import { IsTourMetadataProvider } from '../services/tour-publisher.service.js';

function buildRefusalResult(type: 'create' | 'update' | 'delete', message: string): BaseEntityResult {
    const result = new BaseEntityResult();
    result.Success = false;
    result.Type = type;
    result.Message = message;
    result.StartedAt = new Date();
    result.EndedAt = new Date();
    return result;
}

/**
 * Server entity subclass for `MJ: Tour Versions`.
 * - Enforces immutability: rejects updates to `Definition` or `VersionNumber` on existing saved rows.
 * - Guards delete: rejects `Delete()` when referenced by `Tour.CurrentVersionID` or any `TourRun.TourVersionID`.
 */
@RegisterClass(BaseEntity, 'MJ: Tour Versions')
export class MJTourVersionEntityServer extends MJTourVersionEntity {
    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        if (this.IsSaved) {
            const defField = this.GetFieldByName('Definition');
            if (defField?.Dirty) {
                result.Errors.push(
                    new ValidationErrorInfo(
                        'Definition',
                        'Tour versions are immutable once published. Create a new MJ: Tour Versions snapshot instead of modifying Definition.',
                        this.Definition,
                        ValidationErrorType.Failure,
                    ),
                );
            }

            const versionNumField = this.GetFieldByName('VersionNumber');
            if (versionNumField?.Dirty) {
                result.Errors.push(
                    new ValidationErrorInfo(
                        'VersionNumber',
                        'Tour versions are immutable once published. VersionNumber cannot be modified on an existing version.',
                        this.VersionNumber,
                        ValidationErrorType.Failure,
                    ),
                );
            }

            const hashField = this.GetFieldByName('ContentHash');
            if (hashField?.Dirty) {
                result.Errors.push(
                    new ValidationErrorInfo(
                        'ContentHash',
                        'Tour versions are immutable once published. ContentHash cannot be modified on an existing version.',
                        this.ContentHash,
                        ValidationErrorType.Failure,
                    ),
                );
            }
        }
        result.Success = result.Success && result.Errors.length === 0;
        return result;
    }

    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        if (this.IsSaved) {
            const defField = this.GetFieldByName('Definition');
            const versionNumField = this.GetFieldByName('VersionNumber');
            if (defField?.Dirty || versionNumField?.Dirty) {
                const msg =
                    'MJ: Tour Versions rows are immutable: Definition and VersionNumber cannot be modified after creation.';
                this.RegisterResultHistoryEntry(buildRefusalResult('update', msg));
                return false;
            }
        }
        return super.Save(options);
    }

    public override async Delete(options?: EntityDeleteOptions): Promise<boolean> {
        const provider = IsTourMetadataProvider(this.ProviderToUse) ? this.ProviderToUse : undefined;
        const contextUser = this.ContextCurrentUser as UserInfo | undefined;
        if (provider && this.ID) {
            const rv = RunView.FromMetadataProvider(provider);
            const escapedId = EscapeSQLString(this.ID);
            const [toursRes, runsRes] = await rv.RunViews(
                [
                    {
                        EntityName: 'MJ: Tours',
                        ExtraFilter: `CurrentVersionID='${escapedId}'`,
                        Fields: ['ID'],
                        MaxRows: 1,
                        ResultType: 'simple',
                    },
                    {
                        EntityName: 'MJ: Tour Runs',
                        ExtraFilter: `TourVersionID='${escapedId}'`,
                        Fields: ['ID'],
                        MaxRows: 1,
                        ResultType: 'simple',
                    },
                ],
                contextUser,
            );

            if (!toursRes.Success || !runsRes.Success) {
                const msg =
                    toursRes.ErrorMessage ||
                    runsRes.ErrorMessage ||
                    'Failed verifying Tour Version references before delete.';
                this.RegisterResultHistoryEntry(buildRefusalResult('delete', msg));
                return false;
            }

            if (toursRes.Results.length > 0) {
                this.RegisterResultHistoryEntry(
                    buildRefusalResult(
                        'delete',
                        'Cannot delete this Tour Version because it is referenced as CurrentVersionID on an MJ: Tours record.',
                    ),
                );
                return false;
            }

            if (runsRes.Results.length > 0) {
                this.RegisterResultHistoryEntry(
                    buildRefusalResult(
                        'delete',
                        'Cannot delete this Tour Version because existing MJ: Tour Runs records are pinned to it.',
                    ),
                );
                return false;
            }
        }

        return super.Delete(options);
    }
}
