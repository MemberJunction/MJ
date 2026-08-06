import { BaseEntity, IMetadataProvider, ValidationResult } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJAPIKeyScopeEntity } from '@memberjunction/core-entities';
import { ToValidationErrors, ValidateScopeRuleRowFilter } from './rowFilterValidation';

/**
 * Server-side `MJ: API Key Scopes` entity enforcing the API-key row-filter
 * authoring rules (plan §5.3 checks 1-6 + §5.6.1) whenever a rule carries a
 * `RowFilterID` — or IS a `full_access` grant on a key that has filtered rules:
 *
 * 1. `ResourcePattern` must name a single EXACT entity (no `*`/`?`/`,`).
 * 2. That name must resolve via `EntityByName`.
 * 3. Every `{{Token}}` in the filter's text must be in the registered vocabulary.
 * 4. Every column identifier in the filter's text must resolve to a real
 *    non-virtual field on that entity (STRICT — unknown identifiers reject).
 * 5. The rule must not be `IsDeny` or `PatternType='Exclude'`.
 * 6. Every OTHER referrer of the same filter record must resolve to the same
 *    entity (same-entity invariant — a filter carries no entity binding of its
 *    own).
 * §5.6.1: `full_access` + row filter on the same key is invalid configuration,
 * rejected in BOTH directions (filter added to a key holding full_access;
 * full_access granted to a key holding a filtered rule).
 *
 * Unfiltered rules keep full pattern support — zero behavior change.
 */
@RegisterClass(BaseEntity, 'MJ: API Key Scopes')
export class MJAPIKeyScopeEntityServer extends MJAPIKeyScopeEntity {
    /** Enable async validation so the row-filter checks (which query referrers) run on Save. */
    public override get DefaultSkipAsyncValidation(): boolean {
        return false;
    }

    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();

        const errors = await ValidateScopeRuleRowFilter(
            {
                RowId: this.IsSaved ? this.ID : '',
                RuleEntityName: 'MJ: API Key Scopes',
                OwnerFilterClause: `APIKeyID='${this.APIKeyID}'`,
                OwnerLabel: 'API key',
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
