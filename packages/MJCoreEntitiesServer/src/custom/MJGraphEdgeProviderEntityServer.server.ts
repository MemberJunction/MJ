import { BaseEntity, ValidationErrorInfo, ValidationErrorType, ValidationResult } from '@memberjunction/core';
import {
    BaseGraphEdgeProvider,
    LoadGraphEdgeProviders,
    MJGraphEdgeProviderEntity,
} from '@memberjunction/core-entities';
import { MJGlobal, RegisterClass } from '@memberjunction/global';

/**
 * Server-side subclass for `MJ: Graph Edge Providers` enforcing:
 * 1. `DriverClass` resolves to a registered {@link BaseGraphEdgeProvider} implementation in `ClassFactory`.
 * 2. `Configuration` (when non-empty) is valid JSON and satisfies required keys for built-in parametric providers.
 */
@RegisterClass(BaseEntity, 'MJ: Graph Edge Providers')
export class MJGraphEdgeProviderEntityServer extends MJGraphEdgeProviderEntity {
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.validateDriverClassRegistration(result);
        this.validateConfigurationJson(result);
        result.Success = result.Success && result.Errors.length === 0;
        return result;
    }

    private validateDriverClassRegistration(result: ValidationResult): void {
        const driverKey = this.DriverClass?.trim();
        if (!driverKey) {
            return;
        }
        LoadGraphEdgeProviders();
        const registration = MJGlobal.Instance.ClassFactory.GetRegistration(
            BaseGraphEdgeProvider,
            driverKey,
        );
        if (!registration) {
            result.Errors.push(
                new ValidationErrorInfo(
                    'DriverClass',
                    `DriverClass '${driverKey}' is not registered for BaseGraphEdgeProvider in MJGlobal.ClassFactory.`,
                    this.DriverClass,
                    ValidationErrorType.Failure,
                ),
            );
        }
    }

    private validateConfigurationJson(result: ValidationResult): void {
        const raw = this.Configuration?.trim();
        if (!raw) {
            this.validateRequiredParametricConfig({}, result);
            return;
        }

        let parsed: unknown;
        try {
            parsed = JSON.parse(raw);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            result.Errors.push(
                new ValidationErrorInfo(
                    'Configuration',
                    `Configuration must be valid JSON: ${msg}`,
                    this.Configuration,
                    ValidationErrorType.Failure,
                ),
            );
            return;
        }

        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            result.Errors.push(
                new ValidationErrorInfo(
                    'Configuration',
                    'Configuration must be a JSON object.',
                    this.Configuration,
                    ValidationErrorType.Failure,
                ),
            );
            return;
        }

        this.validateRequiredParametricConfig(parsed as Record<string, unknown>, result);
    }

    private validateRequiredParametricConfig(
        config: Record<string, unknown>,
        result: ValidationResult,
    ): void {
        const driverKey = this.DriverClass?.trim();
        if (driverKey === 'ForeignKeyEdgeProvider') {
            if (typeof config['FieldName'] !== 'string' || !config['FieldName'].trim()) {
                result.Errors.push(
                    new ValidationErrorInfo(
                        'Configuration',
                        "ForeignKeyEdgeProvider Configuration requires a non-empty 'FieldName' string.",
                        this.Configuration,
                        ValidationErrorType.Failure,
                    ),
                );
            }
        } else if (driverKey === 'JoinEntityEdgeProvider') {
            const hasJoin = typeof config['JoinEntity'] === 'string' && config['JoinEntity'].trim().length > 0;
            const hasLeft = typeof config['LeftField'] === 'string' && config['LeftField'].trim().length > 0;
            const hasRight = typeof config['RightField'] === 'string' && config['RightField'].trim().length > 0;
            if (!hasJoin || !hasLeft || !hasRight) {
                result.Errors.push(
                    new ValidationErrorInfo(
                        'Configuration',
                        "JoinEntityEdgeProvider Configuration requires non-empty 'JoinEntity', 'LeftField', and 'RightField' strings.",
                        this.Configuration,
                        ValidationErrorType.Failure,
                    ),
                );
            }
        } else if (driverKey === 'QueryEdgeProvider') {
            const hasQueryID = typeof config['QueryID'] === 'string' && config['QueryID'].trim().length > 0;
            const hasQueryName = typeof config['QueryName'] === 'string' && config['QueryName'].trim().length > 0;
            if (!hasQueryID && !hasQueryName) {
                result.Errors.push(
                    new ValidationErrorInfo(
                        'Configuration',
                        "QueryEdgeProvider Configuration requires either 'QueryID' or 'QueryName'.",
                        this.Configuration,
                        ValidationErrorType.Failure,
                    ),
                );
            }
        }
    }
}
