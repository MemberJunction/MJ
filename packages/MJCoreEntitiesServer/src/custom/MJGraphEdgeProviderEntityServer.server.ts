import { BaseEntity, ValidationErrorInfo, ValidationErrorType, ValidationResult } from '@memberjunction/core';
import { MJGlobal, RegisterClass } from '@memberjunction/global';
import { BaseGraphEdgeProvider, MJGraphEdgeProviderEntity } from '@memberjunction/core-entities';

/**
 * Pure invariant check for `MJGraphEdgeProviderEntity.DriverClass`:
 * must be non-blank and registered on `MJGlobal.Instance.ClassFactory` under `BaseGraphEdgeProvider`.
 */
export function ValidateGraphEdgeProviderDriverClass(
    driverClass: string | null | undefined,
    isDriverRegistered: (driverKey: string) => boolean = (driverKey) =>
        MJGlobal.Instance.ClassFactory.GetRegistration(BaseGraphEdgeProvider, driverKey) != null,
): ValidationErrorInfo | null {
    if (driverClass == null) {
        return null;
    }
    const trimmed = driverClass.trim();
    if (trimmed.length === 0) {
        return new ValidationErrorInfo(
            'DriverClass',
            'DriverClass cannot be blank — it must name a registered BaseGraphEdgeProvider subclass.',
            driverClass,
            ValidationErrorType.Failure,
        );
    }
    if (!isDriverRegistered(trimmed)) {
        return new ValidationErrorInfo(
            'DriverClass',
            `DriverClass "${trimmed}" is not registered under BaseGraphEdgeProvider in ClassFactory.`,
            driverClass,
            ValidationErrorType.Failure,
        );
    }
    return null;
}

/**
 * Pure invariant check for `MJGraphEdgeProviderEntity.Configuration`:
 * when present and non-empty, must be a valid JSON object.
 */
export function ValidateGraphEdgeProviderConfigurationJson(
    rawConfiguration: string | null | undefined,
): ValidationErrorInfo | null {
    if (rawConfiguration == null || rawConfiguration.trim().length === 0) {
        return null;
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(rawConfiguration);
    } catch {
        return new ValidationErrorInfo(
            'Configuration',
            'Configuration is not valid JSON.',
            rawConfiguration,
            ValidationErrorType.Failure,
        );
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        const kind = parsed === null ? 'null' : Array.isArray(parsed) ? 'array' : typeof parsed;
        return new ValidationErrorInfo(
            'Configuration',
            `Configuration must be a JSON object (got ${kind}).`,
            rawConfiguration,
            ValidationErrorType.Failure,
        );
    }
    return null;
}

/**
 * Server-side `MJ: Graph Edge Providers` entity enforcing that:
 * 1. `DriverClass` is registered in `ClassFactory` under `BaseGraphEdgeProvider`
 * 2. `Configuration` (when non-empty) parses as a valid JSON object
 */
@RegisterClass(BaseEntity, 'MJ: Graph Edge Providers')
export class MJGraphEdgeProviderEntityServer extends MJGraphEdgeProviderEntity {
    public override get DefaultSkipAsyncValidation(): boolean {
        return false;
    }

    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        if (!result.Success) {
            return result;
        }

        const driverDirty = this.GetFieldByName('DriverClass')?.Dirty ?? false;
        if (!this.IsSaved || driverDirty) {
            const driverError = ValidateGraphEdgeProviderDriverClass(this.DriverClass);
            if (driverError) {
                result.Errors.push(driverError);
                result.Success = false;
            }
        }

        const configDirty = this.GetFieldByName('Configuration')?.Dirty ?? false;
        if (!this.IsSaved || configDirty) {
            const configError = ValidateGraphEdgeProviderConfigurationJson(this.Configuration);
            if (configError) {
                result.Errors.push(configError);
                result.Success = false;
            }
        }

        return result;
    }
}
