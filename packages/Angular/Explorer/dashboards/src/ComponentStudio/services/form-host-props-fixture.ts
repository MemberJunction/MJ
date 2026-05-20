import type {
    CuratedFormField,
    CuratedFormSchema,
    FormHostProps,
    FormMode,
} from '@memberjunction/interactive-component-types/forms';
import type { SimpleEntityFieldInfo } from '@memberjunction/interactive-component-types';

/**
 * Build a fixture `FormHostProps` for live-preview rendering of a form-role
 * component inside Component Studio. The host has no real BaseEntity, so we
 * synthesise type-appropriate values for each curated field. The fixture is
 * for layout / styling / event-handler iteration only — Save and Delete
 * events emitted by the previewed component never persist; the Studio
 * preview wrapper logs them and discards.
 *
 * Field-value rules (kept small and deterministic so the preview is stable
 * across reloads):
 *   string                                  → "Sample <FieldName>"
 *   string with maxLength <= 24             → "Sample"
 *   number                                  → 42
 *   boolean                                 → true
 *   datetime                                → today, ISO format
 *   enum                                    → allowedValues[0]
 *   foreign-key                             → { ID: <stable fake UUID>, <displayField>: "Sample <TargetEntity>" }
 *   primary key                             → fixture UUID, ignored on form rendering
 */
export function buildFixtureFormHostProps(
    schema: CuratedFormSchema,
    mode: FormMode = 'view',
): FormHostProps {
    const record: Record<string, unknown> = {};
    for (const f of schema.fields) {
        record[f.name] = fixtureValue(f);
    }

    const primaryKeyFields = schema.fields.filter(f => f.isPrimaryKey);
    const primaryKey = mode === 'create' || primaryKeyFields.length === 0
        ? null
        : Object.fromEntries(primaryKeyFields.map(f => [f.name, record[f.name]]));

    return {
        entityName: schema.entityName,
        primaryKey,
        record,
        entityMetadata: {
            fields: schemaFieldsToSimple(schema),
            displayName: schema.displayName,
            nameField: schema.nameField,
        },
        mode,
        canEdit: true,
        canDelete: true,
        canCreate: true,
    };
}

/** Convert curated fields to the minimal SimpleEntityFieldInfo shape FormHostProps needs. */
function schemaFieldsToSimple(schema: CuratedFormSchema): SimpleEntityFieldInfo[] {
    return schema.fields.map(f => ({
        name: f.name,
        sequence: f.sequence,
        defaultInView: !f.isPrimaryKey,
        type: f.type,
        allowsNull: !f.required,
        isPrimaryKey: f.isPrimaryKey,
        possibleValues: f.allowedValues,
        description: f.description,
        // SimpleEntityFieldInfo is a class; we cast to the structural shape
        // — the React component doesn't call methods on it, only reads.
    } as unknown as SimpleEntityFieldInfo));
}

function fixtureValue(f: CuratedFormField): unknown {
    if (f.isPrimaryKey) {
        return STABLE_FIXTURE_ID;
    }
    switch (f.type) {
        case 'number':
            return 42;
        case 'boolean':
            return true;
        case 'datetime':
            return new Date().toISOString();
        case 'enum':
            return f.allowedValues?.[0] ?? null;
        case 'foreign-key': {
            const targetEntity = f.references?.entity ?? 'Related';
            const displayField = f.references?.displayField ?? 'Name';
            return {
                ID: STABLE_FIXTURE_FK_ID,
                [displayField]: `Sample ${targetEntity.replace(/^MJ:\s*/, '')}`,
            };
        }
        case 'string':
        default: {
            const max = f.maxLength ?? 0;
            if (max > 0 && max <= 24) {
                return 'Sample';
            }
            return `Sample ${f.displayName ?? f.name}`;
        }
    }
}

/** Stable fake UUIDs so re-renders don't churn React component identity. */
const STABLE_FIXTURE_ID = '00000000-0000-0000-0000-000000000001';
const STABLE_FIXTURE_FK_ID = '00000000-0000-0000-0000-000000000002';
