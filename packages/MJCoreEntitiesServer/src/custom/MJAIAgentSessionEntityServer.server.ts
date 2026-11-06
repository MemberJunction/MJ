import { BaseEntity, ValidationErrorInfo, ValidationErrorType, ValidationResult } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJAIAgentSessionEntity } from '@memberjunction/core-entities';
import { FindProtectedSessionConfigChanges, IsTrustedSessionConfigWriteActive } from './sessionConfigGuard';
import { CheckAnonymousOwnershipKeyChange, IsSetByTransactionVariable } from './anonymousOwnershipKeyGuard';

/**
 * Server-side `MJ: AI Agent Sessions` entity.
 *
 * It keeps the **server-authoritative keys** inside `Config` (the janitor's
 * `maxSessionDeadlineIso`, the `identityVerification` state) and the server-only `CloseReason` values (`TimeLimit`,
 * `Idle`, `Janitor`, `Shutdown`) out of the session owner's reach, and keeps an
 * anonymous visitor from re-pointing an existing session's `ConversationID` (the anonymous ownership key —
 * see `CheckAnonymousOwnershipKeyChange`). The
 * owner can legitimately write the row — the `UI` and `Widget Guest` roles hold `CanUpdate` on their
 * own sessions — so the protection has to live at the entity, where the generated CRUD mutations,
 * `StartAgentSession(configJson)` and every other path converge on `Save`.
 *
 * The recording ledger's columns need no subclass: they are protected in metadata
 * (`AllowUpdateAPI=false`, #6010), so an entity save cannot write them and only the ledger's stored
 * procedures do.
 *
 * See {@link FindProtectedSessionConfigChanges} for what is protected and why, and
 * `RunWithTrustedSessionConfigWrites` for how server code opts in.
 *
 * Uses the **synchronous** `Validate()` rather than `ValidateAsync()` on purpose: `Validate()` runs on
 * every save, whereas async validation can be skipped by an option, and a guard that a caller can opt
 * out of is not a guard.
 */
/** The close reasons a session owner may record; every other value is stamped by the server. */
const OWNER_CLOSE_REASONS: ReadonlySet<string> = new Set(['Explicit', 'Error']);

@RegisterClass(BaseEntity, 'MJ: AI Agent Sessions')
export class MJAIAgentSessionEntityServer extends MJAIAgentSessionEntity {
    public override Validate(): ValidationResult {
        const result = super.Validate();
        const violations = [
            this.checkProtectedConfigKeys(),
            this.checkServerManagedCloseReason(),
            CheckAnonymousOwnershipKeyChange(this, 'ConversationID'),
        ].filter((v): v is ValidationErrorInfo => v !== null);
        if (violations.length > 0) {
            result.Errors.push(...violations);
            result.Success = false;
        }
        return result;
    }

    /**
     * Returns a refusal when an untrusted save writes or overwrites a server-only `CloseReason`, else null. The owner may
     * close their own row as `Explicit` or `Error`; `TimeLimit` is stamped only after `SessionManager.CloseSession`
     * verifies it against the stored deadline, and `Idle`, `Janitor` and `Shutdown` belong to the janitor and the
     * host. A stamped server-only reason is the record of how the session ended, so the owner cannot replace it either.
     * Server code that stamps them saves inside `RunWithTrustedSessionConfigWrites`.
     */
    private checkServerManagedCloseReason(): ValidationErrorInfo | null {
        const field = this.GetFieldByName('CloseReason');
        if (IsTrustedSessionConfigWriteActive() || !field?.Dirty) {
            return null;
        }
        const previous = typeof field.OldValue === 'string' ? field.OldValue : null;
        const serverOnly = [this.CloseReason, previous].find((reason) => reason !== null && !OWNER_CLOSE_REASONS.has(reason));
        if (serverOnly === undefined) {
            return null;
        }
        return new ValidationErrorInfo(
            'CloseReason',
            `CloseReason '${serverOnly}' is server-managed; a session owner can close a session only as Explicit or Error, and cannot change a reason the server recorded.`,
            this.CloseReason,
            ValidationErrorType.Failure,
        );
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
        // A 'Use' transaction variable writes its field at submit, after this comparison: on Config its value is unknown
        // here, and on ID the update (and this Config) lands on another session than the one compared against.
        if (IsSetByTransactionVariable(this, ['Config', 'ID'])) {
            return new ValidationErrorInfo(
                'Config',
                'Config is server-managed in part, so neither it nor the row it is written to can come from a transaction variable.',
                null,
                ValidationErrorType.Failure,
            );
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
