import { BaseEntity, DatabaseProviderBase, IMetadataProvider, ValidationResult } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJRowLevelSecurityFilterEntity } from '@memberjunction/core-entities';
import {
    BuildSameEntityErrors,
    CollectRowFilterReferrers,
    IsRoleOnlyReferrerSet,
    RowFilterReferrer,
    ToValidationErrors,
    ValidateRoleRowFilterText,
    ValidateRowFilterTextAgainstEntity
} from './rowFilterValidation';

/**
 * Server-side `MJ: Row Level Security Filters` entity — the SECOND enforcement
 * point of the row-filter validation (plan §5.3). The scope-rule subclasses
 * validate `FilterText` (check 4) and the same-entity invariant (check 6)
 * against the rule's entity when the RULE is saved; without an equivalent
 * check when the FILTER is saved, both are trivially bypassable: attach a
 * valid filter, then edit its text (or acquire a new, different-entity
 * referrer) to reference anything. On a `FilterText` change this subclass
 * re-validates the new text against EVERY current referrer (EntityPermission
 * rows via their four `*RLSFilterID` columns, plus both API scope tables via
 * `RowFilterID`) and rejects if any check fails — including referrers whose
 * entity cannot be resolved (fail closed).
 *
 * Which checks apply depends on who references the filter:
 * - **Any API-key or API-application scope rule** → the strict API-key rules
 *   (checks 4 and 6): plain columns of the referrer's entity only, and every
 *   referrer must agree on ONE entity. Check 6 has no single rule to anchor on
 *   here (a filter record carries no entity binding — see plan §5.1), so it
 *   anchors on the first referrer that resolves to an entity.
 * - **Only role permission rows** → a role filter. Role filters legitimately use
 *   subqueries (a user's tenant memberships) and are shared across every
 *   tenant-scoped entity, so the new text is instead screened for dangerous SQL
 *   and compiled against each referencing entity's base view.
 *
 * Either way an invalid filter is rejected at save, where it is diagnosable,
 * rather than failing every read of the entities it scopes with an unexplained
 * SQL error.
 */
@RegisterClass(BaseEntity, 'MJ: Row Level Security Filters')
export class MJRowLevelSecurityFilterEntityServer extends MJRowLevelSecurityFilterEntity {
    /** Enable async validation so the referrer re-validation (which queries three tables) runs on Save. */
    public override get DefaultSkipAsyncValidation(): boolean {
        return false;
    }

    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();

        // Only re-validate when the text changes (or on create — a new filter has
        // no referrers yet, so there is nothing to validate against).
        const filterTextDirty = this.GetFieldByName('FilterText')?.Dirty ?? false;
        if (this.IsSaved && !filterTextDirty) {
            return result;
        }

        const errors: string[] = [];
        const md = this.ProviderToUse as unknown as IMetadataProvider;
        const filterText = this.FilterText ?? '';

        try {
            const referrers = await CollectRowFilterReferrers(this.ID, md, this.ContextCurrentUser);
            if (IsRoleOnlyReferrerSet(referrers)) {
                errors.push(...await this.validateAsRoleFilter(filterText, referrers));
            } else {
                errors.push(...this.validateAsApiKeyFilter(filterText, referrers));
            }
        } catch (e) {
            errors.push(e instanceof Error ? e.message : String(e));
        }

        if (errors.length > 0) {
            result.Errors.push(...ToValidationErrors('FilterText', errors));
            result.Success = false;
        }
        return result;
    }

    /**
     * The strict API-key rules: check 4 (FilterText's columns must resolve against every
     * referrer's entity) and check 6 (every referrer must agree on the same entity).
     */
    private validateAsApiKeyFilter(filterText: string, referrers: RowFilterReferrer[]): string[] {
        const errors: string[] = [];
        for (const referrer of referrers) {
            if (!referrer.Entity) {
                errors.push(
                    `${referrer.Description} references this filter but does not resolve to an entity — the new ` +
                    `FilterText cannot be validated against it; rejecting (fail closed).`
                );
                continue;
            }
            const validation = ValidateRowFilterTextAgainstEntity(filterText, referrer.Entity);
            errors.push(...validation.errors.map(e => `${referrer.Description}: ${e}`));
        }

        // No single referrer is "the rule" here (unlike the scope-rule save path), so anchor on
        // the first referrer that resolves to an entity and require every other referrer to match it.
        const anchor = referrers.find(r => r.Entity)?.Entity;
        if (anchor) {
            errors.push(...BuildSameEntityErrors(referrers, anchor));
        }
        return errors;
    }

    /** A role filter: screened, then compiled against every referencing entity's base view. */
    private async validateAsRoleFilter(filterText: string, referrers: RowFilterReferrer[]): Promise<string[]> {
        const provider = this.ProviderToUse;
        if (!(provider instanceof DatabaseProviderBase)) {
            return ['A role row-level-security filter can only be validated against a database provider; rejecting (fail closed).'];
        }
        return ValidateRoleRowFilterText(filterText, referrers, provider, this.ContextCurrentUser);
    }
}
