/**
 * @file CloneConfigValidator.ts
 * Pure validation engine for IEntityCloneConfiguration bags.
 * Enforces metadata referential integrity, field existence, writability,
 * relationship resolution, and strict-mode drift guard.
 * @see plans/record-cloning/README.md §4.5, §13.3
 */

import { FieldMappingFieldMeta } from './CloneFieldMapper';

export interface CloneConfigValidationError {
    EntityName: string;
    PropertyPath: string;
    Message: string;
    Severity: 'Error' | 'Warning';
}

export interface CloneConfigRelationshipMeta {
    ID?: string;
    Name?: string;
    RelatedEntity: string;
    RelatedEntityJoinField: string;
}

export interface CloneConfigEntityMeta {
    Name: string;
    Fields: FieldMappingFieldMeta[];
    Relationships?: CloneConfigRelationshipMeta[];
    CloneConfiguration?: {
        Enabled?: boolean;
        MaxDepth?: number;
        MaxRecords?: number;
        Fields?: {
            Strict?: boolean;
            Copy?: string[];
            Exclude?: string[];
            Reset?: Record<string, unknown>;
            Ownership?: string[];
            ServerAllocated?: string[];
            PromptFor?: string[];
            ClearTogether?: string[][];
            JsonRemap?: Array<{
                Field: string;
                Rules?: Array<{ Path: string; Mode: string }>;
                Preset?: string;
            }>;
            UniqueKeys?: Array<{
                Fields: string[];
                Scope: 'Global' | 'Parent' | 'LiveState';
                ScopeField?: string;
            }>;
            Rules?: {
                Rules?: Array<{ TargetField?: string; Field?: string }>;
            };
        };
        Relationships?: Record<string, {
            Policy?: string;
            Locked?: boolean;
            ExcludeRows?: Array<{ Field?: string }>;
        }>;
        Descendants?: Record<string, {
            Policy?: string;
        }>;
        Hooks?: {
            ServerGeneratedChildren?: string[];
        };
        Presets?: Array<{
            Key: string;
            Label: string;
            Options?: Record<string, unknown>;
            Relationships?: Record<string, { Policy?: string }>;
        }>;
        Derivation?: {
            Field?: string;
        };
    } | null;
}

const VALID_POLICIES = new Set(['Deep', 'Reference', 'Skip']);

export class CloneConfigValidator {
    /**
     * Validates an entity's clone configuration bag against its metadata.
     */
    public static Validate(
        entity: CloneConfigEntityMeta,
        allEntities?: CloneConfigEntityMeta[]
    ): CloneConfigValidationError[] {
        const errors: CloneConfigValidationError[] = [];
        const config = entity.CloneConfiguration;
        if (!config || config.Enabled === false) {
            return errors;
        }

        const entityFields = new Map<string, FieldMappingFieldMeta>(
            entity.Fields.map((f) => [f.Name.toLowerCase(), f])
        );

        // 1. Validate Caps
        for (const cap of ['MaxDepth', 'MaxRecords'] as const) {
            const value = config[cap];
            if (value !== undefined && (!Number.isInteger(value) || value <= 0)) {
                errors.push({
                    EntityName: entity.Name,
                    PropertyPath: cap,
                    Message: `${cap} must be a positive integer, received: ${String(value)}`,
                    Severity: 'Error',
                });
            }
        }

        // 1b. Policies: Relationships, Descendants and preset overrides use Deep, Reference or Skip.
        const checkPolicy = (policy: unknown, path: string) => {
            if (policy !== undefined && !VALID_POLICIES.has(String(policy))) {
                errors.push({
                    EntityName: entity.Name,
                    PropertyPath: path,
                    Message: `Policy must be Deep, Reference or Skip, received: ${String(policy)}`,
                    Severity: 'Error',
                });
            }
        };
        for (const [key, rel] of Object.entries(config.Relationships ?? {})) checkPolicy(rel?.Policy, `Relationships[${key}].Policy`);
        for (const [key, desc] of Object.entries(config.Descendants ?? {})) checkPolicy(desc?.Policy, `Descendants[${key}].Policy`);
        for (const preset of config.Presets ?? []) {
            for (const [key, rel] of Object.entries(preset?.Relationships ?? {})) checkPolicy(rel?.Policy, `Presets[${preset.Key}].Relationships[${key}].Policy`);
        }

        // 2. Validate Fields section
        const fieldsConfig = config.Fields;
        if (fieldsConfig) {
            const checkFieldExists = (fieldName: string, path: string) => {
                if (!entityFields.has(fieldName.toLowerCase())) {
                    errors.push({
                        EntityName: entity.Name,
                        PropertyPath: path,
                        Message: `Field '${fieldName}' does not exist on entity '${entity.Name}'.`,
                        Severity: 'Error',
                    });
                }
            };

            const checkWritable = (fieldName: string, path: string) => {
                const f = entityFields.get(fieldName.toLowerCase());
                if (f && f.IsSPParameter && f.IsSPParameter(false) === false) {
                    errors.push({
                        EntityName: entity.Name,
                        PropertyPath: path,
                        Message: `Field '${fieldName}' is computed or not writable on insert, cannot be used in ${path}.`,
                        Severity: 'Error',
                    });
                }
            };

            // Check Exclude
            for (const f of fieldsConfig.Exclude || []) {
                checkFieldExists(f, `Fields.Exclude[${f}]`);
            }

            // Check Reset
            for (const f of Object.keys(fieldsConfig.Reset || {})) {
                checkFieldExists(f, `Fields.Reset[${f}]`);
            }

            // Check Ownership
            for (const f of fieldsConfig.Ownership || []) {
                checkFieldExists(f, `Fields.Ownership[${f}]`);
            }

            // Check ServerAllocated (must exist and be writable on insert)
            for (const f of fieldsConfig.ServerAllocated || []) {
                checkFieldExists(f, `Fields.ServerAllocated[${f}]`);
                checkWritable(f, `Fields.ServerAllocated[${f}]`);
            }

            // Check PromptFor (must exist and be writable on insert)
            for (const f of fieldsConfig.PromptFor || []) {
                checkFieldExists(f, `Fields.PromptFor[${f}]`);
                checkWritable(f, `Fields.PromptFor[${f}]`);
            }

            // Check ClearTogether groups
            for (const group of fieldsConfig.ClearTogether || []) {
                for (const f of group) {
                    checkFieldExists(f, `Fields.ClearTogether[${f}]`);
                }
            }

            // Check JsonRemap columns (must exist and be string type)
            for (const remap of fieldsConfig.JsonRemap || []) {
                if (!remap?.Field) {
                    errors.push({
                        EntityName: entity.Name,
                        PropertyPath: 'Fields.JsonRemap',
                        Message: 'Each JsonRemap entry needs a Field naming the JSON column.',
                        Severity: 'Error',
                    });
                    continue;
                }
                checkFieldExists(remap.Field, `Fields.JsonRemap[${remap.Field}]`);
                const f = entityFields.get(remap.Field.toLowerCase());
                if (f && f.Type && !f.Type.toLowerCase().includes('varchar') && !f.Type.toLowerCase().includes('text') && !f.Type.toLowerCase().includes('json')) {
                    errors.push({
                        EntityName: entity.Name,
                        PropertyPath: `Fields.JsonRemap[${remap.Field}]`,
                        Message: `Field '${remap.Field}' is of type '${f.Type}', but JsonRemap requires a string or JSON column.`,
                        Severity: 'Error',
                    });
                }
            }

            // Strict-Mode Drift Guard (§13.3)
            if (fieldsConfig.Strict) {
                const classifiedFields = new Set<string>();
                for (const f of fieldsConfig.Copy || []) classifiedFields.add(f.toLowerCase());
                for (const f of fieldsConfig.Exclude || []) classifiedFields.add(f.toLowerCase());
                for (const f of Object.keys(fieldsConfig.Reset || {})) classifiedFields.add(f.toLowerCase());
                for (const f of fieldsConfig.Ownership || []) classifiedFields.add(f.toLowerCase());
                for (const f of fieldsConfig.ServerAllocated || []) classifiedFields.add(f.toLowerCase());
                for (const f of fieldsConfig.PromptFor || []) classifiedFields.add(f.toLowerCase());
                for (const remap of fieldsConfig.JsonRemap || []) if (remap?.Field) classifiedFields.add(remap.Field.toLowerCase());
                for (const rule of fieldsConfig.Rules?.Rules || []) {
                    const target = (rule as { TargetField?: string; Field?: string }).TargetField || (rule as { TargetField?: string; Field?: string }).Field;
                    if (target) classifiedFields.add(target.toLowerCase());
                }

                const unclassified: string[] = [];
                for (const field of entity.Fields) {
                    if (
                        field.IsPrimaryKey ||
                        field.IsCreatedAtField ||
                        field.IsUpdatedAtField ||
                        field.IsSoftDeleteField ||
                        (field.IsSPParameter && field.IsSPParameter(false) === false)
                    ) {
                        continue; // Automatically classified
                    }

                    if (!classifiedFields.has(field.Name.toLowerCase())) {
                        unclassified.push(field.Name);
                    }
                }

                if (unclassified.length > 0) {
                    errors.push({
                        EntityName: entity.Name,
                        PropertyPath: 'Fields.Strict',
                        Message: `Strict mode enabled: unclassified fields detected on entity '${entity.Name}': [${unclassified.join(', ')}]. Every field must be classified in Copy, Exclude, Reset, Ownership, ServerAllocated, PromptFor, or JsonRemap.`,
                        Severity: 'Error',
                    });
                }
            }
        }

        // 3. Validate Relationships section
        if (config.Relationships) {
            // Keys may name a relationship (ID or Name), its related entity, "<Entity>.<JoinField>",
            // or an entity this one references through a foreign key.
            const relMap = new Set<string>();
            for (const r of entity.Relationships || []) {
                if (r.ID) relMap.add(r.ID.toLowerCase());
                if (r.Name) relMap.add(r.Name.toLowerCase());
                if (r.RelatedEntity) relMap.add(r.RelatedEntity.toLowerCase());
                if (r.RelatedEntity && r.RelatedEntityJoinField) relMap.add(`${r.RelatedEntity}.${r.RelatedEntityJoinField}`.toLowerCase());
            }
            for (const f of entity.Fields) {
                if (f.RelatedEntity) relMap.add(f.RelatedEntity.toLowerCase());
            }
            const knownEntities = allEntities ? new Set(allEntities.map((e) => e.Name.toLowerCase())) : null;

            for (const relKey of Object.keys(config.Relationships)) {
                if (relMap.has(relKey.toLowerCase())) continue;
                const entityPart = relKey.includes('.') && knownEntities && !knownEntities.has(relKey.toLowerCase()) ? relKey.slice(0, relKey.lastIndexOf('.')) : relKey;
                const exists = knownEntities?.has(entityPart.toLowerCase());
                errors.push({
                    EntityName: entity.Name,
                    PropertyPath: `Relationships[${relKey}]`,
                    // A root's keys also apply to rows further down the graph, so an entity that
                    // exists may still be reached through a descendant.
                    Message: exists
                        ? `'${relKey}' is not a direct relationship of '${entity.Name}'; it applies only where the clone reaches it through a descendant.`
                        : `Relationship key '${relKey}' does not match any known relationship or related entity on '${entity.Name}'.`,
                    Severity: exists ? 'Warning' : 'Error',
                });
            }
        }

        // 4. Validate ServerGeneratedChildren
        if (config.Hooks?.ServerGeneratedChildren && allEntities) {
            const allEntityNames = new Set(allEntities.map((e) => e.Name.toLowerCase()));
            for (const childEntity of config.Hooks.ServerGeneratedChildren) {
                if (!allEntityNames.has(childEntity.toLowerCase())) {
                    errors.push({
                        EntityName: entity.Name,
                        PropertyPath: `Hooks.ServerGeneratedChildren[${childEntity}]`,
                        Message: `ServerGeneratedChild entity '${childEntity}' is not recognized in entity metadata.`,
                        Severity: 'Error',
                    });
                }
            }
        }

        // 5. Validate Derivation.Field (must be self-FK)
        if (config.Derivation?.Field) {
            const derField = entityFields.get(config.Derivation.Field.toLowerCase());
            if (!derField) {
                errors.push({
                    EntityName: entity.Name,
                    PropertyPath: 'Derivation.Field',
                    Message: `Derivation field '${config.Derivation.Field}' does not exist on entity '${entity.Name}'.`,
                    Severity: 'Error',
                });
            } else if (derField.RelatedEntity?.toLowerCase() !== entity.Name.toLowerCase()) {
                errors.push({
                    EntityName: entity.Name,
                    PropertyPath: 'Derivation.Field',
                    Message: `Derivation field '${config.Derivation.Field}' must be a self-FK pointing to '${entity.Name}', points to '${derField.RelatedEntity}'.`,
                    Severity: 'Error',
                });
            }
        }

        return errors;
    }
}
