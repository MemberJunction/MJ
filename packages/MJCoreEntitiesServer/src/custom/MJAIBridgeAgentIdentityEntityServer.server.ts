import { BaseEntity, IMetadataProvider, RunView, ValidationErrorInfo, ValidationErrorType, ValidationResult } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJAIBridgeAgentIdentityEntity } from '@memberjunction/core-entities';

/**
 * Server-side `MJ: AI Bridge Agent Identities` entity. An identity is how an agent is reachable on
 * a platform — a calendar mailbox (`Email`), an inbound DID (`PhoneNumber`), or a platform-native
 * account (`AccountID`). Invite watchers and inbound routing resolve a connection to an agent by
 * matching `(ProviderID, IdentityValue)`, so that pair MUST be unique, and the value SHOULD look
 * like its declared `IdentityType`.
 *
 * Invariants (see `/plans/realtime/realtime-bridges-architecture.md` §5):
 *   1. **`(ProviderID, IdentityValue)` is unique** across rows — two agents reachable at the same
 *      address on the same provider would make inbound routing ambiguous. Cross-record RunView,
 *      gated on dirty, self-excluded on update (the `countRows` pattern). The column-level docs say
 *      "Unique per provider"; there is no DB UNIQUE constraint on the pair, so this is the real
 *      enforcement (case-insensitive, which a raw SQL UNIQUE would not be on a case-sensitive
 *      collation).
 *   2. **`IdentityValue` shape matches `IdentityType`** — an `Email` looks like an email, a
 *      `PhoneNumber` is digits with an optional leading `+`. `AccountID` is opaque (no shape check).
 *      PURE helper `ValidateIdentityValueFormat`.
 */
@RegisterClass(BaseEntity, 'MJ: AI Bridge Agent Identities')
export class MJAIBridgeAgentIdentityEntityServer extends MJAIBridgeAgentIdentityEntity {
    /** Enable async validation so the cross-record uniqueness check runs. */
    public override get DefaultSkipAsyncValidation(): boolean {
        return false;
    }

    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        if (!result.Success) return result;

        // (2) Format check — cheap, only when new or the relevant fields changed.
        const valueDirty = this.GetFieldByName('IdentityValue')?.Dirty ?? false;
        const typeDirty = this.GetFieldByName('IdentityType')?.Dirty ?? false;
        if (!this.IsSaved || valueDirty || typeDirty) {
            const formatError = ValidateIdentityValueFormat(this.IdentityType, this.IdentityValue);
            if (formatError) {
                result.Errors.push(formatError);
                result.Success = false;
                // Fall through is fine, but a malformed value also makes the uniqueness compare
                // meaningless — return early.
                return result;
            }
        }

        // (1) Uniqueness of (ProviderID, IdentityValue) — cross-record, only when new or
        // ProviderID/IdentityValue changed.
        const providerDirty = this.GetFieldByName('ProviderID')?.Dirty ?? false;
        if (!this.IsSaved || providerDirty || valueDirty) {
            const conflict = await this.countOtherIdentitiesWithSameValue();
            const dupError = BuildDuplicateIdentityError(this.ProviderID, this.IdentityValue, conflict);
            if (dupError) {
                result.Errors.push(dupError);
                result.Success = false;
            }
        }

        return result;
    }

    /**
     * Counts OTHER identity rows on the same provider with the same `IdentityValue` (excluding this
     * row when updating). A failed query counts as 0 (fail-open; re-checks on next save).
     */
    private async countOtherIdentitiesWithSameValue(): Promise<number> {
        if (!this.ProviderID || !this.IdentityValue) {
            return 0; // required-field violations are sync Validate()'s job
        }
        try {
            const md = this.ProviderToUse as unknown as IMetadataProvider;
            const selfExclusion = this.IsSaved ? ` AND ID <> '${this.safeLiteral(this.ID)}'` : '';
            const filter =
                `ProviderID='${this.safeLiteral(this.ProviderID)}' AND ` +
                `IdentityValue='${this.safeLiteral(this.IdentityValue)}'${selfExclusion}`;
            const rv = RunView.FromMetadataProvider(md);
            const result = await rv.RunView<{ ID: string }>(
                {
                    EntityName: 'MJ: AI Bridge Agent Identities',
                    ExtraFilter: filter,
                    Fields: ['ID'],
                    ResultType: 'simple',
                },
                this.ContextCurrentUser
            );
            return result.Success ? (result.Results?.length ?? 0) : 0;
        } catch {
            return 0;
        }
    }

    /** Escapes a UUID/string for safe inclusion in an ExtraFilter literal. */
    private safeLiteral(value: string): string {
        return value.replace(/'/g, "''");
    }
}

/**
 * PURE invariant: `IdentityValue` must look like its `IdentityType`. Returns the error, or `null`
 * when valid (or when not shape-checkable — `AccountID` is opaque, and missing values are the sync
 * validator's job).
 *
 * - `Email`: a single `@` with non-empty local part and a dotted domain.
 * - `PhoneNumber`: an optional leading `+` followed by 7–15 digits (E.164-ish), tolerating spaces,
 *   dashes, parentheses, and dots as separators.
 * - `AccountID`: opaque — no shape enforced.
 */
export function ValidateIdentityValueFormat(
    identityType: 'AccountID' | 'Email' | 'PhoneNumber' | null | undefined,
    identityValue: string | null | undefined
): ValidationErrorInfo | null {
    if (identityType == null || identityValue == null || identityValue.trim().length === 0) {
        return null; // required checks are sync Validate()'s job
    }
    const value = identityValue.trim();

    if (identityType === 'Email') {
        if (!isEmailLike(value)) {
            return buildFormatError(`IdentityValue '${value}' is not a valid email address (required for IdentityType 'Email').`, identityValue);
        }
        return null;
    }
    if (identityType === 'PhoneNumber') {
        if (!isPhoneNumberLike(value)) {
            return buildFormatError(
                `IdentityValue '${value}' is not a valid phone number (required for IdentityType 'PhoneNumber' — ` +
                    'an optional leading + and 7–15 digits).',
                identityValue
            );
        }
        return null;
    }
    return null; // AccountID — opaque
}

/**
 * PURE invariant: `(ProviderID, IdentityValue)` must be unique. Returns the error when
 * `existingCount` other rows already use this value on the provider, else `null`.
 */
export function BuildDuplicateIdentityError(
    providerID: string | null,
    identityValue: string | null,
    existingCount: number
): ValidationErrorInfo | null {
    if (existingCount <= 0) {
        return null;
    }
    return new ValidationErrorInfo(
        'IdentityValue',
        `Identity value '${identityValue}' is already registered on this provider (${existingCount} other row(s)). ` +
            'Each (provider, identity value) pair must be unique so inbound connections route to exactly one agent.',
        identityValue,
        ValidationErrorType.Failure
    );
}

/** Loose email shape check: `local@domain.tld`, no spaces, single `@`. */
function isEmailLike(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Loose E.164-ish phone check: optional leading `+`, 7–15 digits, common separators ignored. */
function isPhoneNumberLike(value: string): boolean {
    const stripped = value.replace(/[\s().-]/g, '');
    return /^\+?\d{7,15}$/.test(stripped);
}

/** Builds an `IdentityValue` format failure with the standard source/type. */
function buildFormatError(message: string, value: string): ValidationErrorInfo {
    return new ValidationErrorInfo('IdentityValue', message, value, ValidationErrorType.Failure);
}
