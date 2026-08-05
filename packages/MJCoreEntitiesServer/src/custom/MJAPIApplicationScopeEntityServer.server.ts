import { BaseEntity, IMetadataProvider, ValidationResult } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJAPIApplicationScopeEntity } from '@memberjunction/core-entities';
import { ToValidationErrors, ValidateScopeRuleRowFilter } from './rowFilterValidation';

/**
 * Server-side `MJ: API Application Scopes` entity enforcing the same row-filter
 * authoring rules as `MJAPIKeyScopeEntityServer` (plan §5.3 checks 1-6 +
 * §5.6.1), scoped to the owning APPLICATION instead of an API key. Application
 * ceiling-filter ENFORCEMENT is deferred to v2 (plan §9.3) — the column ships
 * unused — but authoring validation applies from day one so no invalid
 * configuration can accumulate before enforcement lands.
 */
@RegisterClass(BaseEntity, 'MJ: API Application Scopes')
export class MJAPIApplicationScopeEntityServer extends MJAPIApplicationScopeEntity {
    /** Enable async validation so the row-filter checks (which query referrers) run on Save. */
    public override get DefaultSkipAsyncValidation(): boolean {
        return false;
    }

    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();

        const errors = await ValidateScopeRuleRowFilter(
            {
                RowId: this.IsSaved ? this.ID : '',
                RuleEntityName: 'MJ: API Application Scopes',
                OwnerFilterClause: `ApplicationID='${this.ApplicationID}'`,
                OwnerLabel: 'application',
                ScopeID: this.ScopeID,
                ResourcePattern: this.ResourcePattern,
                PatternType: this.PatternType,
                IsDeny: this.IsDeny,
                RowFilterID: this.RowFilterID
            },
            this.ProviderToUse as unknown as IMetadataProvider,
            this.ContextCurrentUser
        );

        if (errors.length > 0) {
            result.Errors.push(...ToValidationErrors('RowFilterID', errors));
            result.Success = false;
        }
        return result;
    }
}
