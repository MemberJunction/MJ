import { BaseEntity, IMetadataProvider, ValidationErrorInfo, ValidationErrorType, ValidationResult } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJAIAgentTypeEntity } from '@memberjunction/core-entities';
import { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { ValidateJsonAgainstSchemaLite } from './json-schema-lite';

/**
 * Server-side AI Agent entity that validates `TypeConfiguration` on save:
 *
 *   1. When non-empty, `TypeConfiguration` must parse as a JSON OBJECT (it is the per-agent
 *      layer of the effective-configuration merge — arrays/scalars are never valid layers).
 *   2. When the agent's TYPE publishes a `ConfigSchema` (JSON Schema subset), the parsed
 *      configuration must conform to it — checked with the dependency-free
 *      {@link ValidateJsonAgainstSchemaLite} validator (type / required / properties / enum /
 *      items / additionalProperties). A type WITHOUT a published schema leaves the
 *      configuration freeform (rule 1 still applies).
 *
 * A malformed/unparseable `ConfigSchema` is a METADATA bug on the type row, not the agent
 * being saved — it surfaces as a WARNING (the save proceeds) rather than blocking every agent
 * of that type. Extends `MJAIAgentEntityExtended` so all client-side extended behavior is
 * preserved; registered last, so the ClassFactory prefers it server-side.
 */
@RegisterClass(BaseEntity, 'MJ: AI Agents')
export class MJAIAgentEntityServer extends MJAIAgentEntityExtended {
    /** Enable async validation so the TypeConfiguration ⊨ ConfigSchema check runs. */
    public override get DefaultSkipAsyncValidation(): boolean {
        return false;
    }

    /**
     * Async invariant: `TypeConfiguration` must be a JSON object conforming to the agent
     * type's published `ConfigSchema`. Cheap fast-path — only runs when the configuration is
     * present AND (the record is new, or `TypeConfiguration`/`TypeID` is dirty).
     */
    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        if (!result.Success) return result;

        const configJson = this.TypeConfiguration;
        if (!configJson || configJson.trim().length === 0) {
            return result; // null/empty = type defaults apply; nothing to validate
        }

        const configDirty = this.GetFieldByName('TypeConfiguration')?.Dirty ?? false;
        const typeDirty = this.GetFieldByName('TypeID')?.Dirty ?? false;
        if (this.IsSaved && !configDirty && !typeDirty) {
            return result; // unchanged configuration against an unchanged type — already validated
        }

        const schemaJson = await this.loadTypeConfigSchema();
        const errors = BuildTypeConfigurationValidationErrors(configJson, schemaJson);
        if (errors.length > 0) {
            result.Errors.push(...errors);
            result.Success = errors.every((e) => e.Type !== ValidationErrorType.Failure);
        }
        return result;
    }

    /**
     * Loads the agent type's `ConfigSchema` through the same request-scoped provider that owns
     * this entity. Returns `null` (freeform) when the agent has no type, the type row cannot be
     * loaded, or no schema is published.
     */
    private async loadTypeConfigSchema(): Promise<string | null> {
        if (!this.TypeID) {
            return null;
        }
        const md = this.ProviderToUse as unknown as IMetadataProvider;
        const type = await md.GetEntityObject<MJAIAgentTypeEntity>('MJ: AI Agent Types', this.ContextCurrentUser);
        if (!(await type.Load(this.TypeID))) {
            return null; // dangling TypeID is the FK constraint's problem, not this check's
        }
        return type.ConfigSchema ?? null;
    }
}

/**
 * PURE validation core for the `TypeConfiguration` ⊨ `ConfigSchema` invariant (exported for
 * unit tests and reuse):
 *
 * - unparseable / non-object `typeConfigurationJson` → one **Failure** on `TypeConfiguration`;
 * - absent/blank `configSchemaJson` → no further checks (freeform configuration);
 * - unparseable / non-object `configSchemaJson` → one **Warning** (metadata bug on the TYPE row
 *   — agent saves must not be bricked by it);
 * - schema violations → one **Failure** per violation, with the JSON-path-ish location.
 *
 * @param typeConfigurationJson The agent's `TypeConfiguration` JSON (non-empty).
 * @param configSchemaJson The type's `ConfigSchema` JSON Schema, or `null` when unpublished.
 * @returns Validation errors/warnings (empty array = valid).
 */
export function BuildTypeConfigurationValidationErrors(
    typeConfigurationJson: string,
    configSchemaJson: string | null
): ValidationErrorInfo[] {
    let config: unknown;
    try {
        config = JSON.parse(typeConfigurationJson);
    } catch (error) {
        return [
            new ValidationErrorInfo(
                'TypeConfiguration',
                `TypeConfiguration is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
                typeConfigurationJson,
                ValidationErrorType.Failure
            ),
        ];
    }
    if (config === null || typeof config !== 'object' || Array.isArray(config)) {
        return [
            new ValidationErrorInfo(
                'TypeConfiguration',
                'TypeConfiguration must be a JSON object (arrays and scalars are not valid configuration payloads).',
                typeConfigurationJson,
                ValidationErrorType.Failure
            ),
        ];
    }

    if (!configSchemaJson || configSchemaJson.trim().length === 0) {
        return []; // no published schema — freeform configuration
    }

    let schema: unknown;
    try {
        schema = JSON.parse(configSchemaJson);
    } catch {
        schema = null;
    }
    if (schema === null || typeof schema !== 'object' || Array.isArray(schema)) {
        return [
            new ValidationErrorInfo(
                'TypeConfiguration',
                "The agent type's ConfigSchema is not a parseable JSON Schema object — schema conformance was NOT " +
                    'checked (fix the ConfigSchema on the agent type row).',
                configSchemaJson,
                ValidationErrorType.Warning
            ),
        ];
    }

    return ValidateJsonAgainstSchemaLite(config, schema as Record<string, unknown>).map(
        (violation) =>
            new ValidationErrorInfo(
                'TypeConfiguration',
                `TypeConfiguration does not conform to the agent type's ConfigSchema: ${violation}`,
                typeConfigurationJson,
                ValidationErrorType.Failure
            )
    );
}
