import { BaseEntity, ValidationErrorInfo, ValidationErrorType, ValidationResult } from '@memberjunction/core';
import { EscapeSQLString, RegisterClass } from '@memberjunction/global';
import { MJBrandKitEntity } from '@memberjunction/core-entities';

/**
 * Server-side `MJ: Brand Kits` entity enforcing the one-default-kit-per-scope rule (§4.1):
 * at most one brand kit with `IsDefault = 1` may exist per `CompanyID` scope (where
 * `CompanyID IS NULL` is the org-wide scope). No SQL index backs `IsDefault`; this
 * `ValidateAsync` check is the only guard, failing a second default kit in the same scope
 * with a `ValidationErrorInfo` naming the existing default kit rather than silently swapping flags.
 */
@RegisterClass(BaseEntity, 'MJ: Brand Kits')
export class MJBrandKitEntityServer extends MJBrandKitEntity {
    public override get DefaultSkipAsyncValidation(): boolean {
        return false;
    }

    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        if (!result.Success) {
            return result;
        }

        if (!this.IsDefault) {
            return result;
        }

        const isDefaultDirty = this.GetFieldByName('IsDefault')?.Dirty ?? false;
        const companyIdDirty = this.GetFieldByName('CompanyID')?.Dirty ?? false;
        if (this.IsSaved && !isDefaultDirty && !companyIdDirty) {
            return result;
        }

        const companyFilter = this.CompanyID
            ? `CompanyID = '${EscapeSQLString(this.CompanyID)}'`
            : 'CompanyID IS NULL';
        const selfFilter = this.ID
            ? ` AND ID <> '${EscapeSQLString(this.ID)}'`
            : '';
        const extraFilter = `IsDefault = 1 AND ${companyFilter}${selfFilter}`;

        try {
            const rv = this.RunViewProviderToUse;
            const runResult = await rv.RunView<{ ID: string; Name: string }>(
                {
                    EntityName: 'MJ: Brand Kits',
                    ExtraFilter: extraFilter,
                    Fields: ['ID', 'Name'],
                    ResultType: 'simple',
                    MaxRows: 1,
                },
                this.ContextCurrentUser
            );

            if (!runResult.Success) {
                result.Errors.push(
                    new ValidationErrorInfo(
                        'IsDefault',
                        `Could not check for another default kit: ${runResult.ErrorMessage ?? 'RunView failed'}.`,
                        this.IsDefault,
                        ValidationErrorType.Failure
                    )
                );
                result.Success = false;
                return result;
            }

            const existing = runResult.Results?.[0];
            if (existing) {
                const scopeMessage = this.CompanyID
                    ? `Brand kit '${existing.Name}' is already the default for this company. Clear its IsDefault first.`
                    : `Brand kit '${existing.Name}' is already the default for all companies. Clear its IsDefault first.`;
                result.Errors.push(
                    new ValidationErrorInfo(
                        'IsDefault',
                        scopeMessage,
                        this.IsDefault,
                        ValidationErrorType.Failure
                    )
                );
                result.Success = false;
            }
        } catch (err) {
            result.Errors.push(
                new ValidationErrorInfo(
                    'IsDefault',
                    `Could not check for another default kit: ${err instanceof Error ? err.message : String(err)}.`,
                    this.IsDefault,
                    ValidationErrorType.Failure
                )
            );
            result.Success = false;
        }

        return result;
    }
}
