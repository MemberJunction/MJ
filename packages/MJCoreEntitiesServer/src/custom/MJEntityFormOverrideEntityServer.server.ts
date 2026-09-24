import {
    BaseEntity,
    type EntityDeleteOptions,
    type EntitySaveOptions,
    type IMetadataProvider,
    type ValidationResult,
} from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJEntityFormOverrideEntity } from '@memberjunction/core-entities';
import {
    ApplyFormScopeValidation,
    FormScopeDeleteRefusal,
    FormScopeRefusalResult,
    FormScopeReplayRefusal,
    type GuardedFormScopeRow,
} from './FormScopeGuard';

/**
 * Server-side `MJ: Entity Form Overrides` entity, enforcing who may write a full custom form at which scope.
 *
 * Anyone may manage their own personal forms. Creating, changing or removing one for a role
 * or for everyone — and moving one between scopes in either direction — needs the
 * `Manage Form Defaults` authorization. The rule lives in `@memberjunction/core-entities`
 * (`FormScopeWriteRefusal`), shared with the browser, so this class only feeds it.
 *
 * All three write entry points are overridden, following `MJUserRoleEntityServer`:
 * `Validate()` runs inside every normal `Save()`; `Save()` is overridden because a `ReplayOnly`
 * save skips `Validate()` while still writing; and `Delete()` never calls `Validate()` at all.
 * Anything less leaves a path around the rule.
 */
@RegisterClass(BaseEntity, 'MJ: Entity Form Overrides')
export class MJEntityFormOverrideEntityServer extends MJEntityFormOverrideEntity {
    public override Validate(): ValidationResult {
        const result = super.Validate();
        ApplyFormScopeValidation(this.scopeRow, this.scopeProvider, result);
        return result;
    }

    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        const refusal = FormScopeReplayRefusal(this.scopeRow, this.scopeProvider, options);
        if (refusal) {
            this.RegisterResultHistoryEntry(FormScopeRefusalResult(this.IsSaved ? 'update' : 'create', refusal));
            return false;
        }
        return super.Save(options);
    }

    public override async Delete(options?: EntityDeleteOptions): Promise<boolean> {
        const refusal = FormScopeDeleteRefusal(this.scopeRow, this.scopeProvider);
        if (refusal) {
            this.RegisterResultHistoryEntry(FormScopeRefusalResult('delete', refusal));
            return false;
        }
        return super.Delete(options);
    }

    /**
     * This row as the scope guard reads it. Built here because `ActiveUser` is protected on
     * `BaseEntity`, so only the subclass itself can hand it over.
     */
    private get scopeRow(): GuardedFormScopeRow {
        return {
            IsSaved: this.IsSaved,
            ActiveUser: this.ActiveUser,
            Scope: this.Scope,
            UserID: this.UserID,
            GetFieldByName: (name: string) => this.GetFieldByName(name),
        };
    }

    /** The provider the caller's authorizations are read from. */
    private get scopeProvider(): IMetadataProvider {
        return this.ProviderToUse as unknown as IMetadataProvider;
    }
}
