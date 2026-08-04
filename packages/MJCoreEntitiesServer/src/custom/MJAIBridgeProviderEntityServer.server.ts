import { BaseEntity, ValidationErrorInfo, ValidationErrorType, ValidationResult } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJAIBridgeProviderEntity } from '@memberjunction/core-entities';

/**
 * The complete set of known `IBridgeProviderFeatures` keys (see the generated
 * `MJAIBridgeProviderEntity_IBridgeProviderFeatures` interface and
 * `metadata/entities/JSONType-interfaces/IBridgeProviderFeatures.ts`). `SupportedFeatures` is a
 * flat object of optional booleans, so the validation is: every present key must be in this set
 * and every value must be a boolean. Keeping the list here (rather than reflecting off a runtime
 * value) makes the validator a PURE, dependency-free, easily-unit-tested function and gives a
 * friendly "unknown feature flag" message that a free-form `additionalProperties:false` schema
 * would not.
 */
export const KNOWN_BRIDGE_PROVIDER_FEATURE_KEYS: ReadonlySet<string> = new Set<string>([
    // Join methods
    'OnDemandJoin',
    'ScheduledJoin',
    'InviteJoin',
    'NativeInvite',
    'InboundRouting',
    'OutboundDial',
    // Media tracks (directional)
    'AudioIn',
    'AudioOut',
    'VideoIn',
    'VideoOut',
    'ScreenIn',
    'ScreenOut',
    // Signals & telephony
    'SpeakerDiarization',
    'DTMF',
    'CallTransfer',
    'Recording',
]);

/**
 * Server-side `MJ: AI Bridge Providers` entity enforcing the invariants the architecture documents
 * (see `/plans/realtime/realtime-bridges-architecture.md` §3): the engine GATES every optional
 * driver call on the `SupportedFeatures` JSON, so a malformed / mistyped flags blob is a latent
 * runtime bug. We catch it at write time.
 *
 * Invariants:
 *   1. **`SupportedFeatures` (when dirty/non-null) is well-formed `IBridgeProviderFeatures`** — it
 *      parses as a JSON object whose every key is a known feature flag and every value is a boolean.
 *      Unknown keys (typos like `OutbondDial`) and non-boolean values (`"true"`, `1`) are rejected
 *      with a precise message. PURE helper `ValidateSupportedFeaturesJson`.
 *   2. **`DriverClass` is non-empty** — it is the `ClassFactory` key the engine resolves the bridge
 *      driver from; a blank value silently fails resolution. (The DB column is NOT NULL but allows
 *      empty/whitespace strings, so this adds the meaningful check.) PURE helper
 *      `ValidateDriverClass`.
 *
 * No cross-record `RunView` is needed here — both invariants are purely intra-row, so this is the
 * cheapest possible `ValidateAsync` (no DB round trips).
 */
@RegisterClass(BaseEntity, 'MJ: AI Bridge Providers')
export class MJAIBridgeProviderEntityServer extends MJAIBridgeProviderEntity {
    /** Enable async validation so these checks run on the server save path. */
    public override get DefaultSkipAsyncValidation(): boolean {
        return false;
    }

    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        if (!result.Success) return result;

        // (2) DriverClass non-empty — cheap, only when new or DriverClass changed.
        const driverDirty = this.GetFieldByName('DriverClass')?.Dirty ?? false;
        if (!this.IsSaved || driverDirty) {
            const driverError = ValidateDriverClass(this.DriverClass);
            if (driverError) {
                result.Errors.push(driverError);
                result.Success = false;
            }
        }

        // (1) SupportedFeatures JSON shape — only when new or the column changed.
        const featuresDirty = this.GetFieldByName('SupportedFeatures')?.Dirty ?? false;
        if (!this.IsSaved || featuresDirty) {
            const featureErrors = ValidateSupportedFeaturesJson(this.SupportedFeatures);
            if (featureErrors.length > 0) {
                result.Errors.push(...featureErrors);
                result.Success = false;
            }
        }

        return result;
    }
}

/**
 * PURE invariant: `DriverClass` must be a non-empty, non-whitespace string. Returns the error, or
 * `null` when valid. (A `null`/`undefined` value is left to the sync required-field validator.)
 */
export function ValidateDriverClass(driverClass: string | null | undefined): ValidationErrorInfo | null {
    if (driverClass == null) {
        return null; // required-field violation is sync Validate()'s job
    }
    if (driverClass.trim().length === 0) {
        return new ValidationErrorInfo(
            'DriverClass',
            'DriverClass cannot be blank — it is the ClassFactory key the bridge engine uses to resolve the driver.',
            driverClass,
            ValidationErrorType.Failure
        );
    }
    return null;
}

/**
 * PURE invariant core for `SupportedFeatures` (exported for unit tests): the raw column value must
 * either be null/empty (unsupported — valid) or a JSON OBJECT whose keys are all known
 * `IBridgeProviderFeatures` flags and whose values are all booleans.
 *
 * @param raw The raw `SupportedFeatures` column value.
 * @returns The violations (empty array = valid).
 */
export function ValidateSupportedFeaturesJson(raw: string | null | undefined): ValidationErrorInfo[] {
    if (raw == null || raw.trim().length === 0) {
        return []; // omitted = "no features supported" — a valid state
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return [buildFeaturesError('SupportedFeatures is not valid JSON.', raw)];
    }

    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return [buildFeaturesError('SupportedFeatures must be a JSON object of feature flags (got ' + describeJsonType(parsed) + ').', raw)];
    }

    const errors: ValidationErrorInfo[] = [];
    const obj = parsed as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
        if (!KNOWN_BRIDGE_PROVIDER_FEATURE_KEYS.has(key)) {
            errors.push(buildFeaturesError(`SupportedFeatures contains unknown feature flag '${key}'.`, raw));
            continue;
        }
        if (typeof obj[key] !== 'boolean') {
            errors.push(
                buildFeaturesError(`SupportedFeatures flag '${key}' must be a boolean (got ${describeJsonType(obj[key])}).`, raw)
            );
        }
    }
    return errors;
}

/** Builds a `SupportedFeatures` failure with the standard source/type. */
function buildFeaturesError(message: string, value: string): ValidationErrorInfo {
    return new ValidationErrorInfo('SupportedFeatures', message, value, ValidationErrorType.Failure);
}

/** Human-readable JSON type label used in error messages. */
function describeJsonType(value: unknown): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
}
