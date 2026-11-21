import { BaseEntity, ValidationErrorInfo, ValidationErrorType, type ValidationResult } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { StoredLoginDesignProblems } from '@memberjunction/theme-engine';
import { MJThemeEntity } from '../generated/entity_subclasses';

/**
 * `MJ: Themes`: refuses a sign-in page design (`LoginScreen`, `LoginScreenDraft`) the login screen cannot
 * draw safely. Runs on both tiers, so Login Studio hears the reason before the request leaves the browser.
 * Only a column this save changes is checked, so a theme whose stored design predates a stricter contract
 * can still be renamed or recolored.
 */
@RegisterClass(BaseEntity, 'MJ: Themes')
export class MJThemeEntityExtended extends MJThemeEntity {
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.checkLoginDesign(result, 'LoginScreen', this.LoginScreen);
        this.checkLoginDesign(result, 'LoginScreenDraft', this.LoginScreenDraft);
        result.Success = result.Errors.every((e) => e.Type !== ValidationErrorType.Failure);
        return result;
    }

    private checkLoginDesign(result: ValidationResult, field: 'LoginScreen' | 'LoginScreenDraft', value: string | null): void {
        if (!this.GetFieldByName(field)?.Dirty) return;
        for (const problem of StoredLoginDesignProblems(value)) {
            result.Errors.push(new ValidationErrorInfo(field, problem, null, ValidationErrorType.Failure));
        }
    }
}
