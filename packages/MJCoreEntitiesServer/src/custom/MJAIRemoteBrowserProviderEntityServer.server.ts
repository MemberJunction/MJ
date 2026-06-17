import { BaseEntity, ValidationErrorInfo, ValidationErrorType, ValidationResult } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJAIRemoteBrowserProviderEntity } from '@memberjunction/core-entities';

/**
 * The complete set of known `IRemoteBrowserProviderFeatures` keys (see the generated
 * `MJAIRemoteBrowserProviderEntity_IRemoteBrowserProviderFeatures` interface and
 * `metadata/entities/JSONType-interfaces/IRemoteBrowserProviderFeatures.ts`). `SupportedFeatures`
 * is a flat object of optional booleans, so the validation is: every present key must be in this
 * set and every value must be a boolean. Keeping the list here (rather than reflecting off a
 * runtime value) makes the validator a PURE, dependency-free, easily-unit-tested function and
 * gives a friendly "unknown feature flag" message that a free-form `additionalProperties:false`
 * schema would not. Mirrors `KNOWN_BRIDGE_PROVIDER_FEATURE_KEYS`.
 */
export const KNOWN_REMOTE_BROWSER_PROVIDER_FEATURE_KEYS: ReadonlySet<string> = new Set<string>([
    // Control substrate & strategies
    'RawCdpControl',
    'NativeAIControl',
    // Viewing & collaboration
    'LiveView',
    'HumanTakeover',
    'ScreenStreaming',
    // Operational
    'Stealth',
    'ProxyEgress',
    'SessionRecording',
    'PersistentContext',
    'MultiTab',
    'FileDownloads',
    'CaptchaSolving',
]);

/** The valid `DefaultControlMode` values (mirrors the `RemoteBrowserControlMode` union + the DB CHECK). */
export const REMOTE_BROWSER_CONTROL_MODES: ReadonlySet<string> = new Set<string>(['AgentOnly', 'ViewOnly', 'Collaborative']);

/**
 * Server-side `MJ: AI Remote Browser Providers` entity enforcing the invariants the Remote Browser
 * channel relies on (see `/plans/realtime/realtime-bridges-architecture.md` §4d-i). The engine GATES
 * every optional session method on the `SupportedFeatures` JSON and resolves the driver from
 * `DriverClass`, so a malformed flags blob, a blank driver, or a control mode the backend cannot
 * satisfy are all latent runtime bugs. We catch them at write time.
 *
 * Invariants (all purely intra-row — the cheapest possible `ValidateAsync`, no DB round trips):
 *   1. **`SupportedFeatures` (when dirty/non-null) is well-formed `IRemoteBrowserProviderFeatures`** —
 *      it parses as a JSON object whose every key is a known feature flag and every value is a
 *      boolean. Unknown keys and non-boolean values are rejected. PURE `ValidateRemoteBrowserSupportedFeaturesJson`.
 *   2. **`DriverClass` is non-empty** — the `ClassFactory` key the engine resolves the backend from.
 *      PURE `ValidateRemoteBrowserDriverClass`.
 *   3. **`DefaultControlMode` is satisfiable by the declared features** — `Collaborative` requires
 *      `HumanTakeover`; `ViewOnly` and `Collaborative` require `LiveView`. A backend advertising a
 *      mode it cannot honor is a configuration error. PURE `ValidateControlModeAgainstFeatures`.
 */
@RegisterClass(BaseEntity, 'MJ: AI Remote Browser Providers')
export class MJAIRemoteBrowserProviderEntityServer extends MJAIRemoteBrowserProviderEntity {
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
            const driverError = ValidateRemoteBrowserDriverClass(this.DriverClass);
            if (driverError) {
                result.Errors.push(driverError);
                result.Success = false;
            }
        }

        // (1) SupportedFeatures JSON shape — only when new or the column changed.
        const featuresDirty = this.GetFieldByName('SupportedFeatures')?.Dirty ?? false;
        if (!this.IsSaved || featuresDirty) {
            const featureErrors = ValidateRemoteBrowserSupportedFeaturesJson(this.SupportedFeatures);
            if (featureErrors.length > 0) {
                result.Errors.push(...featureErrors);
                result.Success = false;
            }
        }

        // (3) DefaultControlMode must be satisfiable by the declared features — re-validate whenever
        // either the mode or the features changed (a feature change can invalidate an existing mode).
        const modeDirty = this.GetFieldByName('DefaultControlMode')?.Dirty ?? false;
        if (!this.IsSaved || modeDirty || featuresDirty) {
            const modeError = ValidateControlModeAgainstFeatures(this.DefaultControlMode, this.SupportedFeatures);
            if (modeError) {
                result.Errors.push(modeError);
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
export function ValidateRemoteBrowserDriverClass(driverClass: string | null | undefined): ValidationErrorInfo | null {
    if (driverClass == null) {
        return null; // required-field violation is sync Validate()'s job
    }
    if (driverClass.trim().length === 0) {
        return new ValidationErrorInfo(
            'DriverClass',
            'DriverClass cannot be blank — it is the ClassFactory key the Remote Browser engine uses to resolve the backend driver.',
            driverClass,
            ValidationErrorType.Failure
        );
    }
    return null;
}

/**
 * PURE invariant core for `SupportedFeatures` (exported for unit tests): the raw column value must
 * either be null/empty (no features — valid) or a JSON OBJECT whose keys are all known
 * `IRemoteBrowserProviderFeatures` flags and whose values are all booleans.
 *
 * @param raw The raw `SupportedFeatures` column value.
 * @returns The violations (empty array = valid).
 */
export function ValidateRemoteBrowserSupportedFeaturesJson(raw: string | null | undefined): ValidationErrorInfo[] {
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
        if (!KNOWN_REMOTE_BROWSER_PROVIDER_FEATURE_KEYS.has(key)) {
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

/**
 * PURE invariant: the `DefaultControlMode` must be satisfiable by the backend's declared
 * `SupportedFeatures`. `Collaborative` needs `HumanTakeover`; `ViewOnly` and `Collaborative` need
 * `LiveView`. `AgentOnly` (and an unrecognized mode, which the sync CHECK/value-list validator owns)
 * impose no feature prerequisite here. Returns the error, or `null` when valid.
 *
 * @param mode The `DefaultControlMode` value.
 * @param rawFeatures The raw `SupportedFeatures` column value.
 * @returns The violation, or `null` when valid.
 */
export function ValidateControlModeAgainstFeatures(
    mode: string | null | undefined,
    rawFeatures: string | null | undefined
): ValidationErrorInfo | null {
    if (mode == null || !REMOTE_BROWSER_CONTROL_MODES.has(mode)) {
        return null; // null / unrecognized mode is the sync value-list validator's job
    }
    if (mode === 'AgentOnly') {
        return null; // no feature prerequisite
    }

    const features = parseFeatureFlags(rawFeatures);
    const missing: string[] = [];
    // ViewOnly + Collaborative both need a way for humans to watch.
    if (features['LiveView'] !== true) {
        missing.push('LiveView');
    }
    // Collaborative additionally needs humans to be able to take the wheel.
    if (mode === 'Collaborative' && features['HumanTakeover'] !== true) {
        missing.push('HumanTakeover');
    }
    if (missing.length === 0) {
        return null;
    }
    return new ValidationErrorInfo(
        'DefaultControlMode',
        `DefaultControlMode '${mode}' requires SupportedFeatures ${missing.map(m => `'${m}'`).join(' and ')} to be enabled.`,
        mode,
        ValidationErrorType.Failure
    );
}

/**
 * Parses the raw `SupportedFeatures` JSON into a flag map for the control-mode check, tolerating
 * malformed input (returns `{}` — invariant #1 reports the JSON shape error separately, so this
 * check does not double-report).
 */
function parseFeatureFlags(raw: string | null | undefined): Record<string, unknown> {
    if (raw == null || raw.trim().length === 0) {
        return {};
    }
    try {
        const parsed: unknown = JSON.parse(raw);
        if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return parsed as Record<string, unknown>;
        }
    } catch {
        // shape error is reported by ValidateRemoteBrowserSupportedFeaturesJson; treat as no flags here
    }
    return {};
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
