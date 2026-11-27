import {
    BaseEntity,
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
 * Pure validation helper for `AIAgentCategory.DefaultConfiguration` (and `AIAgentType.DefaultAgentConfiguration`).
 * Checks JSON syntax/scalar types, blocks forbidden code-only seams for all users, and restricts
 * `helperPlugins` writes to administrators.
 */
export function ValidateAgentScopedConfigurationJson(
    configJson: string | null | undefined,
    fieldName: 'DefaultConfiguration' | 'DefaultAgentConfiguration',
    entityLabel: string,
    contextUser: UserInfo | null | undefined
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
    const isAdmin = IsAgentAdminOrOwnerUser(contextUser);
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
    if (!isAdmin && contextUser && (declaredPlugins.length > 0 || hasHelperPluginsKey)) {
        errors.push(
            new ValidationErrorInfo(
                fieldName,
                `Only administrators may configure helperPlugins (including clearing/modifying the key) on an ${entityLabel}.`,
                declaredPlugins.map((p) => `${p.seam}:${p.driverClass}`).join(', '),
                ValidationErrorType.Failure
            )
        );
    }

    return errors;
}

/**
 * Server-side AI Agent Category entity enforcing valid `DefaultConfiguration` JSON syntax/types,
 * blocking forbidden code-only seams (`limits`, `actionPolicy`, `policy`, `permissions`) for all
 * users, and restricting `helperPlugins` configuration in categories to administrators.
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

        const errors = ValidateAgentScopedConfigurationJson(
            this.DefaultConfiguration,
            'DefaultConfiguration',
            'AI Agent Category',
            this.ContextCurrentUser
        );
        result.Errors.push(...errors);
        result.Success = result.Errors.every((e) => e.Type !== ValidationErrorType.Failure);
        return result;
    }
}
