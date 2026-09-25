/**
 * @file CloneFieldMapper.ts
 * Pure 12-stage field mapping pipeline for record cloning.
 * Maps: Excluded -> NotWritable -> DeniedRead/DeniedCreate -> Copy -> Reset -> Ownership
 * -> ServerAllocated -> Rename -> Remap -> RemapJSON -> Rule -> Override -> Prompt.
 * @see plans/record-cloning/README.md §7.1, §7.2, §13.1
 */

import { CloneFieldChange } from './types';
import { FindNextAvailableName, NameTemplateOptions } from './NameTemplate';
import { ApplyJsonRemap, JsonRemapRule } from './JsonRemapEngine';

export interface FieldMappingFieldMeta {
    Name: string;
    IsPrimaryKey: boolean;
    IsIdentity?: boolean;
    IsNameField?: boolean;
    IsUnique?: boolean;
    RelatedEntityID?: string | null;
    RelatedEntity?: string | null;
    RelatedEntityJoinField?: string | null;
    EntityIDFieldName?: string | null;
    Type?: string;
    IsSPParameter?: (forUpdate: boolean) => boolean;
    DefaultValue?: string | null;
    AllowsNull?: boolean;
    IsCreatedAtField?: boolean;
    IsUpdatedAtField?: boolean;
    IsSoftDeleteField?: boolean;
    /** Stored encrypted. Its values are masked wherever a plan leaves the server. */
    Encrypted?: boolean;
}

export interface CloneFieldMappingContext {
    EntityName: string;
    Fields: FieldMappingFieldMeta[];
    SourceRecord: Record<string, unknown>;
    CurrentUserId?: string;
    KeyMap?: Record<string, string>;
    NamingOptions?: NameTemplateOptions & {
        ExistingNames?: Set<string>;
        UserName?: string;
    };
    FieldRules?: {
        Exclude?: string[];
        Reset?: Record<string, unknown>;
        Ownership?: string[];
        ServerAllocated?: string[];
        PromptFor?: string[];
        JsonRemap?: Array<{
            Field: string;
            Rules?: JsonRemapRule[];
            Preset?: 'dashboard-ui-config' | 'scheduled-job-configuration';
        }>;
        Rules?: {
            Rules?: Array<{
                TargetField?: string;
                Field?: string;
                Source?: {
                    Kind: string;
                    Field?: string;
                    Value?: unknown;
                };
            }>;
        };
    };
    FLS?: {
        DeniedReadFields?: string[];
        DeniedCreateFields?: string[];
    };
    RequestOverrides?: Record<string, unknown>;
    PromptedValues?: Record<string, unknown>;
    IsRoot?: boolean;
    NewParentKey?: unknown;
    HierarchyParentField?: string;
}

export interface CloneFieldMappingResult {
    FieldChanges: CloneFieldChange[];
    MappedValues: Record<string, unknown>;
    RequiresIdentitySecondPass: boolean;
}

/**
 * Runs the deterministic 12-stage field transformation pipeline on a record.
 */
export function MapFieldsForClone(ctx: CloneFieldMappingContext): CloneFieldMappingResult {
    const changes: CloneFieldChange[] = [];
    const values: Record<string, unknown> = {};
    const excludedOrDenied = new Set<string>();
    let requiresIdentitySecondPass = false;

    const keyMap = ctx.KeyMap || {};
    const fieldRules = ctx.FieldRules || {};
    const fls = ctx.FLS || {};
    const reqOverrides = ctx.RequestOverrides || {};
    const promptedValues = ctx.PromptedValues || {};

    // 1. Stage 1: Excluded (PKs, CreatedAt, UpdatedAt, SoftDelete, Configured Exclude)
    for (const field of ctx.Fields) {
        const srcVal = ctx.SourceRecord[field.Name];

        if (field.IsPrimaryKey) {
            excludedOrDenied.add(field.Name);
            changes.push({
                Field: field.Name,
                Kind: 'Excluded',
                OldValue: srcVal,
                NewValue: undefined,
                Reason: 'Primary key is not copied from source record.',
            });
            continue;
        }

        if (field.IsCreatedAtField || field.IsUpdatedAtField || field.IsSoftDeleteField) {
            excludedOrDenied.add(field.Name);
            changes.push({
                Field: field.Name,
                Kind: 'Excluded',
                OldValue: srcVal,
                NewValue: undefined,
                Reason: 'Audit or soft-delete metadata field excluded.',
            });
            continue;
        }

        if (fieldRules.Exclude && fieldRules.Exclude.includes(field.Name)) {
            excludedOrDenied.add(field.Name);
            changes.push({
                Field: field.Name,
                Kind: 'Excluded',
                OldValue: srcVal,
                NewValue: undefined,
                Reason: 'Configured field exclusion.',
            });
            continue;
        }
    }

    // 2. Stage 2: NotWritable (Computed, virtual, persisted computed columns)
    for (const field of ctx.Fields) {
        if (excludedOrDenied.has(field.Name)) continue;

        if (field.IsSPParameter && field.IsSPParameter(false) === false) {
            excludedOrDenied.add(field.Name);
            changes.push({
                Field: field.Name,
                Kind: 'NotWritable',
                OldValue: ctx.SourceRecord[field.Name],
                NewValue: undefined,
                Reason: 'Field is not writable on insert (computed or virtual).',
            });
        }
    }

    // 3. Stage 3: DeniedRead / DeniedCreate (FLS evaluations)
    for (const field of ctx.Fields) {
        if (excludedOrDenied.has(field.Name)) continue;

        if (fls.DeniedReadFields && fls.DeniedReadFields.includes(field.Name)) {
            excludedOrDenied.add(field.Name);
            changes.push({
                Field: field.Name,
                Kind: 'DeniedRead',
                OldValue: undefined,
                NewValue: undefined,
                Reason: 'Field read permission denied by FLS.',
            });
            continue;
        }

        if (fls.DeniedCreateFields && fls.DeniedCreateFields.includes(field.Name)) {
            excludedOrDenied.add(field.Name);
            changes.push({
                Field: field.Name,
                Kind: 'DeniedCreate',
                OldValue: ctx.SourceRecord[field.Name],
                NewValue: undefined,
                Reason: 'Field create permission denied by FLS.',
            });
            continue;
        }
    }

    // 4. Stage 4: Copy (All eligible fields copied verbatim from source)
    for (const field of ctx.Fields) {
        if (excludedOrDenied.has(field.Name)) continue;

        const srcVal = ctx.SourceRecord[field.Name];
        values[field.Name] = srcVal;
        changes.push({
            Field: field.Name,
            Kind: 'Copy',
            OldValue: srcVal,
            NewValue: srcVal,
            Reason: 'Copied verbatim from source record.',
        });
    }

    // 5. Stage 5: Reset (Configured literal resets)
    if (fieldRules.Reset) {
        for (const [fieldName, resetVal] of Object.entries(fieldRules.Reset)) {
            if (excludedOrDenied.has(fieldName)) continue;
            const oldVal = values[fieldName];
            values[fieldName] = resetVal;
            changes.push({
                Field: fieldName,
                Kind: 'Reset',
                OldValue: oldVal,
                NewValue: resetVal,
                Reason: 'Configured field reset stamped.',
            });
        }
    }

    // 6. Stage 6: Ownership (Assign owner to current cloning user)
    if (fieldRules.Ownership && ctx.CurrentUserId) {
        for (const fieldName of fieldRules.Ownership) {
            if (excludedOrDenied.has(fieldName)) continue;
            const oldVal = values[fieldName];
            values[fieldName] = ctx.CurrentUserId;
            changes.push({
                Field: fieldName,
                Kind: 'Ownership',
                OldValue: oldVal,
                NewValue: ctx.CurrentUserId,
                Reason: 'Ownership assigned to current user.',
            });
        }
    }

    // 7. Stage 7: ServerAllocated (Blanked so Save() hook mints)
    if (fieldRules.ServerAllocated) {
        for (const fieldName of fieldRules.ServerAllocated) {
            if (excludedOrDenied.has(fieldName)) continue;
            const oldVal = values[fieldName];
            values[fieldName] = null;
            changes.push({
                Field: fieldName,
                Kind: 'Reset',
                OldValue: oldVal,
                NewValue: null,
                Reason: 'Server-allocated field blanked for Save() hook minting.',
            });
        }
    }

    // 8. Stage 8: Rename (Name fields or unique string fields)
    for (const field of ctx.Fields) {
        if (excludedOrDenied.has(field.Name)) continue;

        const isNameField = field.IsNameField || field.Name.toLowerCase() === 'name' || (field.IsUnique && field.Type === 'nvarchar');
        if (isNameField && values[field.Name] !== undefined && values[field.Name] !== null) {
            const oldName = String(values[field.Name]);
            const newName = FindNextAvailableName(
                oldName,
                ctx.NamingOptions?.ExistingNames || new Set(),
                {
                    Template: ctx.NamingOptions?.Template,
                    Strategy: ctx.NamingOptions?.Strategy,
                    Context: {
                        UserName: ctx.NamingOptions?.UserName,
                    },
                }
            );

            if (newName !== oldName) {
                values[field.Name] = newName;
                changes.push({
                    Field: field.Name,
                    Kind: 'Rename',
                    OldValue: oldName,
                    NewValue: newName,
                    Reason: 'Name or unique string renamed to prevent collision.',
                });
            }
        }
    }

    // 9. Stage 9: Remap (Foreign keys pointing to records in the clone set)
    for (const field of ctx.Fields) {
        if (excludedOrDenied.has(field.Name)) continue;

        // Hierarchy parent field
        if (ctx.HierarchyParentField && field.Name === ctx.HierarchyParentField) {
            const oldParent = values[field.Name];
            if (ctx.IsRoot) {
                values[field.Name] = ctx.NewParentKey ?? null;
                changes.push({
                    Field: field.Name,
                    Kind: 'Reset',
                    OldValue: oldParent,
                    NewValue: ctx.NewParentKey ?? null,
                    Reason: 'Hierarchy root parent reset.',
                });
            } else if (oldParent && String(oldParent) in keyMap) {
                const newParent = keyMap[String(oldParent)];
                values[field.Name] = newParent;
                changes.push({
                    Field: field.Name,
                    Kind: 'Remap',
                    OldValue: oldParent,
                    NewValue: newParent,
                    Reason: 'Hierarchy parent remapped to cloned ancestor.',
                });
            }
            continue;
        }

        // Standard Foreign Key
        if (field.RelatedEntityID || field.RelatedEntity) {
            const oldFk = values[field.Name];
            if (oldFk !== null && oldFk !== undefined) {
                const targetEntity = field.RelatedEntity;
                const qualifiedKey = targetEntity ? `${targetEntity}::${String(oldFk)}` : null;
                const newFk = (qualifiedKey && qualifiedKey in keyMap)
                    ? keyMap[qualifiedKey]
                    : (String(oldFk) in keyMap ? keyMap[String(oldFk)] : undefined);

                if (newFk !== undefined && newFk !== oldFk) {
                    values[field.Name] = newFk;
                    changes.push({
                        Field: field.Name,
                        Kind: 'Remap',
                        OldValue: oldFk,
                        NewValue: newFk,
                        Reason: `Foreign key to '${targetEntity || 'entity'}' remapped to cloned target.`,
                    });
                }
            }
        }
    }

    // 10. Stage 10: RemapJSON (JSON columns with remap configurations)
    if (fieldRules.JsonRemap) {
        for (const remapSpec of fieldRules.JsonRemap) {
            if (excludedOrDenied.has(remapSpec.Field)) continue;
            const currentVal = values[remapSpec.Field];
            if (typeof currentVal === 'string' || (currentVal && typeof currentVal === 'object')) {
                const remapRes = ApplyJsonRemap(currentVal as string | Record<string, unknown>, {
                    Rules: remapSpec.Rules,
                    Preset: remapSpec.Preset,
                    KeyMap: keyMap,
                });
                if (remapRes.Success) {
                    values[remapSpec.Field] = remapRes.JsonString;
                    changes.push({
                        Field: remapSpec.Field,
                        Kind: 'RemapJSON',
                        OldValue: currentVal,
                        NewValue: remapRes.JsonString,
                        Reason: `JSON remapped: ${remapRes.PathsModified.length} paths touched (${remapRes.DropCount} dropped).`,
                    });
                }
            }
        }
    }

    // 11. Stage 11: Override (Request-level field overrides)
    for (const [fieldName, overrideVal] of Object.entries(reqOverrides)) {
        if (excludedOrDenied.has(fieldName)) continue;
        const oldVal = values[fieldName];
        values[fieldName] = overrideVal;
        changes.push({
            Field: fieldName,
            Kind: 'Override',
            OldValue: oldVal,
            NewValue: overrideVal,
            Reason: 'Explicit request-level field override.',
        });
    }

    // 12. Stage 12: Prompt (Prompted values)
    for (const [fieldName, promptVal] of Object.entries(promptedValues)) {
        if (excludedOrDenied.has(fieldName)) continue;
        const oldVal = values[fieldName];
        values[fieldName] = promptVal;
        changes.push({
            Field: fieldName,
            Kind: 'Prompt',
            OldValue: oldVal,
            NewValue: promptVal,
            Reason: 'User prompted value applied.',
        });
    }

    // 13. Stage 13: Rules (Derived field rules, e.g. Name = Email)
    if (fieldRules.Rules?.Rules) {
        for (const rule of fieldRules.Rules.Rules) {
            const targetField = rule.TargetField || rule.Field;
            if (!targetField || excludedOrDenied.has(targetField)) continue;
            let newVal: unknown;
            if (rule.Source?.Kind === 'field' && rule.Source.Field) {
                newVal = values[rule.Source.Field] ?? ctx.SourceRecord[rule.Source.Field];
            } else if (rule.Source?.Kind === 'static') {
                newVal = rule.Source.Value;
            }
            if (newVal !== undefined) {
                const oldVal = values[targetField];
                values[targetField] = newVal;
                changes.push({
                    Field: targetField,
                    Kind: 'Rule',
                    OldValue: oldVal,
                    NewValue: newVal,
                    Reason: 'Derived via field rule.',
                });
            }
        }
    }

    // Values of encrypted fields stay in the server-side plan, but are masked on the wire, in logs and in the hash.
    const encrypted = new Set(ctx.Fields.filter((f) => f.Encrypted).map((f) => f.Name));
    for (const change of changes) {
        if (encrypted.has(change.Field)) change.Sensitive = true;
    }

    return {
        FieldChanges: changes,
        MappedValues: values,
        RequiresIdentitySecondPass: requiresIdentitySecondPass,
    };
}
