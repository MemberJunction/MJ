import { BaseEntity, IMetadataProvider, ValidationResult } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJRowLevelSecurityFilterEntity } from '@memberjunction/core-entities';
import { CollectRowFilterReferrers, ToValidationErrors, ValidateRowFilterTextAgainstEntity } from './rowFilterValidation';

/**
 * Server-side `MJ: Row Level Security Filters` entity — the SECOND enforcement
 * point of the row-filter validation (plan §5.3). The scope-rule subclasses
 * validate `FilterText` against the rule's entity when the RULE is saved;
 * without an equivalent check when the FILTER is saved, all of that is
 * trivially bypassable: attach a valid filter, then edit its text to reference
 * anything. On a `FilterText` change this subclass re-runs the token/column
 * validation against EVERY current referrer (EntityPermission rows via their
 * four `*RLSFilterID` columns, plus both API scope tables via `RowFilterID`)
 * and rejects if any fails — including referrers whose entity cannot be
 * resolved (fail closed).
 *
 * Note this makes the filter edit path stricter than it historically was for
 * pure-EntityPermission filters, which had no such validation. That is a
 * deliberate tightening: an invalid RLS filter fails closed at query time with
 * an unexplainable SQL error; rejecting at save is the diagnosable version.
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
        // no referrers yet, so the loop below is a no-op there anyway).
        const filterTextDirty = this.GetFieldByName('FilterText')?.Dirty ?? false;
        if (this.IsSaved && !filterTextDirty) {
            return result;
        }

        const errors: string[] = [];
        const md = this.ProviderToUse as unknown as IMetadataProvider;
        const filterText = this.FilterText ?? '';

        try {
            const referrers = await CollectRowFilterReferrers(this.ID, md, this.ContextCurrentUser);
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
        } catch (e) {
            errors.push(e instanceof Error ? e.message : String(e));
        }

        if (errors.length > 0) {
            result.Errors.push(...ToValidationErrors('FilterText', errors));
            result.Success = false;
        }
        return result;
    }
}
