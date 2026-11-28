import {
    BaseEntity,
    BaseEntityResult,
    EntityDeleteOptions,
    IEntityDataProvider,
    IMetadataProvider,
    UserInfo,
    ValidationErrorInfo,
    ValidationErrorType,
    ValidationResult,
} from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJAIAgentCategoryEntity } from '@memberjunction/core-entities';
import {
    IsForbiddenMetadataHelperSeam,
    ParseAgentHelperPlugins,
    ValidateAgentConfigurationJson,
} from '@memberjunction/ai-core-plus';
import { IsAgentAdminOrOwnerUser } from './MJAIAgentEntityServer.server';

/**
 * Pure admin-only guard for creating or updating `MJ: AI Agent Categories` (`AIAgentCategory`).
 * System contexts (`contextUser == null`) remain permitted.
 */
export function ValidateAgentCategoryMutation(
    categoryName: string | null | undefined,
    contextUser: UserInfo | null | undefined,
    provider?: IEntityDataProvider | Pick<IMetadataProvider, 'Authorizations'> | null
): ValidationErrorInfo[] {
    if (!IsAgentAdminOrOwnerUser(contextUser, provider)) {
        return [
            new ValidationErrorInfo(
                'Name',
                'Only administrators may create or modify MJ: AI Agent Categories.',
                categoryName,
                ValidationErrorType.Failure
            ),
        ];
    }
    return [];
}

/**
 * Pure admin-only guard for deleting `MJ: AI Agent Categories` (`AIAgentCategory`).
 * System contexts (`contextUser == null`) remain permitted.
 */
export function ValidateAgentCategoryDelete(
    categoryId: string | null | undefined,
    contextUser: UserInfo | null | undefined,
    provider?: IEntityDataProvider | null
): ValidationErrorInfo[] {
    if (!IsAgentAdminOrOwnerUser(contextUser, provider)) {
        return [
            new ValidationErrorInfo(
                'ID',
                'Only administrators may delete MJ: AI Agent Categories.',
                categoryId,
                ValidationErrorType.Failure
            ),
        ];
    }
    return [];
}

/**
 * Pure validation helper for `AIAgentCategory.DefaultConfiguration` (and `AIAgentType.DefaultAgentConfiguration`).
 * Enforces admin-only mutations (blocking non-admin policy/helperPlugin wiping such as `{}`),
 * checks JSON syntax/scalar types, and blocks forbidden code-only seams for all users.
 */
export function ValidateAgentScopedConfigurationJson(
    configJson: string | null | undefined,
    fieldName: 'DefaultConfiguration' | 'DefaultAgentConfiguration',
    entityLabel: string,
    contextUser: UserInfo | null | undefined,
    provider?: IEntityDataProvider | null
): ValidationErrorInfo[] {
    const errors: ValidationErrorInfo[] = [];

    const configErrors = ValidateAgentConfigurationJson(configJson, fieldName);
    for (const msg of configErrors) {
        errors.push(new ValidationErrorInfo(fieldName, msg, configJson, ValidationErrorType.Failure));
    }

    const declaredPlugins = ParseAgentHelperPlugins(configJson);
    const hasHelperPluginsKey = (() => {
        if (!configJson || configJson.trim().length === 0) return false;
        try {
            const parsed = JSON.parse(configJson) as Record<string, unknown>;
            return Boolean(parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Object.prototype.hasOwnProperty.call(parsed, 'helperPlugins'));
        } catch {
            return false;
        }
    })();
    const isAdmin = IsAgentAdminOrOwnerUser(contextUser, provider);
    for (const plugin of declaredPlugins) {
        if (IsForbiddenMetadataHelperSeam(plugin.seam)) {
            errors.push(
                new ValidationErrorInfo(
                    fieldName,
                    `Helper seam '${plugin.seam}' is code-only and cannot be overridden via ${entityLabel} metadata helperPlugins (driverClass '${plugin.driverClass}'). Use @RegisterClass in server code instead.`,
                    plugin.seam,
                    ValidationErrorType.Failure
                )
            );
        }
    }
    if (!isAdmin && contextUser) {
        if (declaredPlugins.length > 0 || hasHelperPluginsKey) {
            errors.push(
                new ValidationErrorInfo(
                    fieldName,
                    `Only administrators may configure helperPlugins (including clearing/modifying the key) on an ${entityLabel}.`,
                    declaredPlugins.map((p) => `${p.seam}:${p.driverClass}`).join(', '),
                    ValidationErrorType.Failure
                )
            );
        } else {
            errors.push(
                new ValidationErrorInfo(
                    fieldName,
                    `Only administrators may modify ${fieldName} on an ${entityLabel}.`,
                    configJson,
                    ValidationErrorType.Failure
                )
            );
        }
    }

    return errors;
}

/**
 * Server-side AI Agent Category entity restricting create/update/delete mutations to
 * administrators, enforcing valid `DefaultConfiguration` JSON syntax/types, and blocking
 * forbidden code-only seams for all users.
 */
@RegisterClass(BaseEntity, 'MJ: AI Agent Categories')
export class MJAIAgentCategoryEntityServer extends MJAIAgentCategoryEntity {
    public override get DefaultSkipAsyncValidation(): boolean {
        return false;
    }

    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        if (!result.Success) {
            return result;
        }

        const authErrors = ValidateAgentCategoryMutation(this.Name, this.ContextCurrentUser, this.ProviderToUse);
        if (authErrors.length > 0) {
            result.Errors.push(...authErrors);
            result.Success = false;
            return result;
        }

        // Only run strict JSON validation on creates or when DefaultConfiguration was modified (R2-2)
        const configDirty = !this.IsSaved || (this.GetFieldByName('DefaultConfiguration')?.Dirty ?? false);
        if (!configDirty) {
            return result;
        }

        const errors = ValidateAgentScopedConfigurationJson(
            this.DefaultConfiguration,
            'DefaultConfiguration',
            'AI Agent Category',
            this.ContextCurrentUser,
            this.ProviderToUse
        );
        result.Errors.push(...errors);
        result.Success = result.Errors.every((e) => e.Type !== ValidationErrorType.Failure);
        return result;
    }

    public override async Delete(options?: EntityDeleteOptions): Promise<boolean> {
        const errors = ValidateAgentCategoryDelete(this.ID, this.ContextCurrentUser, this.ProviderToUse);
        if (errors.length > 0) {
            const deleteResult = new BaseEntityResult(false, '', 'delete');
            deleteResult.Errors = errors;
            this.RegisterResultHistoryEntry(deleteResult);
            return false;
        }
        return super.Delete(options);
    }
}
