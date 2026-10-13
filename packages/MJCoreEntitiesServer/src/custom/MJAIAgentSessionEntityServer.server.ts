import { BaseEntity, ValidationErrorInfo, ValidationErrorType, ValidationResult } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJAIAgentSessionEntity } from '@memberjunction/core-entities';
import { FindProtectedSessionConfigChanges, IsTrustedSessionConfigWriteActive } from './sessionConfigGuard';

/**
 * Server-side `MJ: AI Agent Sessions` entity.
 *
 * Its single job is to keep the **server-authoritative keys** inside `Config` (the janitor's
 * `maxSessionDeadlineIso`, the `identityVerification` state) out of the session owner's reach. The
 * owner can legitimately write the row — the `UI` and `Widget Guest` roles hold `CanUpdate` on their
 * own sessions — so the protection has to live at the entity, where the generated CRUD mutations,
 * `StartAgentSession(configJson)` and every other path converge on `Save()`.
 *
 * See {@link FindProtectedSessionConfigChanges} for what is protected and why, and
 * `RunWithTrustedSessionConfigWrites` for how server code opts in.
 *
 * Uses the **synchronous** `Validate()` rather than `ValidateAsync()` on purpose: `Validate()` runs on
 * every save, whereas async validation can be skipped by an option, and a guard that a caller can opt
 * out of is not a guard.
 */
@RegisterClass(BaseEntity, 'MJ: AI Agent Sessions')
export class MJAIAgentSessionEntityServer extends MJAIAgentSessionEntity {
    public override Validate(): ValidationResult {
        const result = super.Validate();
        const violation = this.checkProtectedConfigKeys();
        if (violation) {
            result.Errors.push(violation);
            result.Success = false;
        }
        return result;
    }

    /** Returns a refusal when an untrusted save changes a protected `Config` key, else null. */
    private checkProtectedConfigKeys(): ValidationErrorInfo | null {
        if (IsTrustedSessionConfigWriteActive()) {
            return null;
        }
        const configField = this.GetFieldByName('Config');
        if (!configField) {
            return null;
        }
        // A saved record is compared against what was loaded; a new record against nothing. For a
        // saved record whose Config was not touched there is nothing to compare.
        if (this.IsSaved && !configField.Dirty) {
            return null;
        }
        const previous = this.IsSaved && typeof configField.OldValue === 'string' ? configField.OldValue : null;
        const changed = FindProtectedSessionConfigChanges(previous, this.Config_);
        if (changed.length === 0) {
            return null;
        }
        return new ValidationErrorInfo(
            'Config',
            `Config keys [${changed.join(', ')}] are server-managed and cannot be set by the session owner.`,
            null,
            ValidationErrorType.Failure,
        );
    }
}
