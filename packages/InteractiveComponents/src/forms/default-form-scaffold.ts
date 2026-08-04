/**
 * Default form scaffold builder.
 *
 * Given an entity's curated schema + section/category metadata from CodeGen,
 * produces a working `ComponentSpec` whose JSX mirrors the layout the Angular
 * CodeGen form would render for the same entity. This is the *floor* that
 * agents (Form Builder, Skip) and Form Studio's "New form" flow start from —
 * not the ceiling. Most rich forms transform or replace this aggressively;
 * the scaffold's job is to guarantee day-one parity with the default Angular
 * form so the runtime form path is never worse than the default.
 *
 * The output is intentionally a small, hand-readable JSX function that uses
 * the host-provided `record`, `entityMetadata`, `mode`, and `callbacks`. It
 * does NOT touch BaseEntity, Metadata, or RunView for the record being
 * edited — that's the form-role layering invariant.
 */
import type { EntityInfo, EntityFieldInfo, IMetadataProvider } from '@memberjunction/core';
import type { ComponentSpec } from '../component-spec';
import { curateFromEntityInfo, type CuratedFormField, type CuratedFormSchema } from './curated-form-schema';

/** A field-type → input-type mapping mirroring CodeGen's behaviour. */
type ScaffoldInputType = 'textbox' | 'textarea' | 'number' | 'checkbox' | 'datepicker' | 'select' | 'fk';

/** A section in the scaffold layout. */
interface ScaffoldSection {
    /** Section display name. */
    title: string;
    /** Font-awesome icon class. */
    icon: string;
    /** Fields placed in this section, in sequence order. */
    fields: ScaffoldField[];
    /** Initial collapsed state ("system" sections are collapsed). */
    collapsed: boolean;
}

interface ScaffoldField {
    name: string;
    label: string;
    inputType: ScaffoldInputType;
    /** For 'fk', the related entity display name (used for picker context). */
    relatedEntity?: string;
    /** For 'select', the allowed values. */
    allowedValues?: string[];
    /** True when the field should span the full row in a 2-col grid. */
    fullSpan: boolean;
    /** Surface as read-only. */
    readOnly: boolean;
}

const DEFAULT_ICON = 'fa-solid fa-circle-info';

/**
 * Build a working scaffold ComponentSpec for `entityName`. Returns `null` if
 * the entity isn't registered.
 *
 * Scaffold rules (mirror CodeGen):
 *   - Sections come from `EntityField.Category` + `GeneratedFormSectionType`.
 *   - Top-section fields render above the section list.
 *   - Field input type derives from `TSType` + `ValueListType` (textarea for
 *     long strings, checkbox for booleans, datepicker for dates, select for
 *     value lists, fk-picker for FKs, number for numeric).
 *   - System Metadata section is always last and starts collapsed.
 *   - 2-column grid by default; long-string and textarea fields go full-span.
 */
export function buildDefaultFormScaffold(
    entityName: string,
    provider: IMetadataProvider,
): ComponentSpec | null {
    const entity = provider.EntityByName(entityName);
    if (!entity) return null;
    return buildScaffoldFromEntityInfo(entity, provider);
}

/** Same as {@link buildDefaultFormScaffold} but takes an already-resolved EntityInfo. */
export function buildScaffoldFromEntityInfo(
    entity: EntityInfo,
    provider: IMetadataProvider,
): ComponentSpec {
    const schema = curateFromEntityInfo(entity, provider);
    const layout = computeSectionLayout(entity, schema);
    const code = renderJsx(entity, schema, layout);
    const name = sanitizeComponentName(`${entity.ClassName || entity.Name}Form`);
    return {
        name,
        title: `${schema.displayName} Form`,
        description: `Default form scaffold for ${schema.displayName}. Mirrors the CodeGen Angular layout. Customize freely.`,
        type: 'Form',
        componentRole: 'form',
        location: 'embedded',
        code,
        functionalRequirements: defaultFunctionalRequirements(schema),
        technicalDesign: defaultTechnicalDesign(schema, layout),
    } as ComponentSpec;
}

// ── section / field planning ─────────────────────────────────────────────

function computeSectionLayout(entity: EntityInfo, schema: CuratedFormSchema): ScaffoldSection[] {
    const sections = new Map<string, ScaffoldSection>();
    // Index for stable ordering: insertion order matches CodeGen behaviour
    // because we walk entity.Fields, which is already sequence-ordered.
    const topFields: ScaffoldField[] = [];

    for (const field of entity.Fields) {
        if (!field.IncludeInGeneratedForm) continue;
        if (field.Name?.startsWith('__mj_')) continue;       // audit
        if (field.IsPrimaryKey) continue;                     // PKs not editable in forms
        if (field.IsVirtual) continue;                        // virtual / computed

        const sf = toScaffoldField(field, schema);

        switch (field.GeneratedFormSectionType) {
            case 'Top':
                topFields.push(sf);
                break;
            case 'Category': {
                const cat = (field.Category && field.Category.trim()) || 'Details';
                ensureSection(sections, cat, iconForCategory(cat, entity), false).fields.push(sf);
                break;
            }
            case 'Details':
            default:
                ensureSection(sections, 'Details', 'fa-solid fa-circle-info', false).fields.push(sf);
                break;
        }
    }

    // System metadata always last, collapsed by default
    const systemFields = entity.Fields
        .filter(f => f.Name === '__mj_CreatedAt' || f.Name === '__mj_UpdatedAt')
        .map(f => ({
            name: f.Name,
            label: f.DisplayName || f.Name,
            inputType: 'datepicker' as ScaffoldInputType,
            fullSpan: false,
            readOnly: true,
        }));

    const ordered: ScaffoldSection[] = [];
    if (topFields.length > 0) {
        ordered.push({ title: '', icon: '', fields: topFields, collapsed: false });
    }
    for (const sect of sections.values()) {
        if (sect.fields.length > 0) ordered.push(sect);
    }
    if (systemFields.length > 0) {
        ordered.push({
            title: 'System Metadata',
            icon: 'fa-solid fa-cog',
            fields: systemFields,
            collapsed: true,
        });
    }
    return ordered;
}

function ensureSection(
    map: Map<string, ScaffoldSection>,
    title: string,
    icon: string,
    collapsed: boolean,
): ScaffoldSection {
    let s = map.get(title);
    if (!s) {
        s = { title, icon, fields: [], collapsed };
        map.set(title, s);
    }
    return s;
}

function toScaffoldField(field: EntityFieldInfo, schema: CuratedFormSchema): ScaffoldField {
    const curated = schema.fields.find(c => c.name === field.Name);
    const label = field.DisplayName && field.DisplayName !== field.Name ? field.DisplayName : field.Name;
    const inputType = pickInputType(field, curated);
    const fullSpan = inputType === 'textarea' || (field.MaxLength && field.MaxLength > 100) || false;
    return {
        name: field.Name,
        label,
        inputType,
        relatedEntity: field.RelatedEntity || undefined,
        allowedValues: curated?.allowedValues,
        fullSpan: !!fullSpan,
        readOnly: !!field.ReadOnly,
    };
}

function pickInputType(field: EntityFieldInfo, curated: CuratedFormField | undefined): ScaffoldInputType {
    // FK takes precedence — FKs may be numeric/uuid but we want a picker.
    if (field.RelatedEntity) return 'fk';
    if (curated?.type === 'enum') return 'select';
    if (field.ValueListType && field.ValueListType !== 'None') return 'select';
    if (field.TSType === 'boolean') return 'checkbox';
    if (field.TSType === 'Date') return 'datepicker';
    if (field.TSType === 'number') return 'number';
    // long strings → textarea
    if ((field.MaxLength ?? 0) < 0 || (field.MaxLength ?? 0) > 1000) return 'textarea';
    return 'textbox';
}

function iconForCategory(category: string, _entity: EntityInfo): string {
    const lower = category.toLowerCase();
    if (/address|location|geo/.test(lower))           return 'fa-solid fa-map-marker-alt';
    if (/contact|email|phone/.test(lower))            return 'fa-solid fa-address-card';
    if (/price|cost|payment|financial|billing|invoice/.test(lower)) return 'fa-solid fa-dollar-sign';
    if (/date|time|schedule|calendar/.test(lower))    return 'fa-solid fa-calendar';
    if (/status|state|stage|workflow/.test(lower))    return 'fa-solid fa-flag';
    if (/metadata|technical|system|config/.test(lower)) return 'fa-solid fa-cog';
    if (/identity|profile|user|account/.test(lower))  return 'fa-solid fa-fingerprint';
    if (/description|notes|comment|narrative/.test(lower)) return 'fa-solid fa-align-left';
    return DEFAULT_ICON;
}

// ── JSX rendering ────────────────────────────────────────────────────────

function renderJsx(entity: EntityInfo, schema: CuratedFormSchema, layout: ScaffoldSection[]): string {
    const componentName = sanitizeComponentName(`${entity.ClassName || entity.Name}Form`);
    const renderField = (f: ScaffoldField, indent: string): string => {
        const span = f.fullSpan ? ' span={2}' : '';
        const readOnly = f.readOnly ? ' readOnly' : '';
        // The scaffold uses host-provided primitives we register in the
        // harness. The agent or user can swap these for arbitrary JSX.
        return `${indent}<Field name="${f.name}" label="${escapeJsx(f.label)}"${span}${readOnly} />`;
    };

    const renderSection = (s: ScaffoldSection, indent: string): string => {
        if (!s.title) {
            // top-area fields render bare
            return s.fields.map(f => renderField(f, indent)).join('\n');
        }
        const grid = s.fields.map(f => renderField(f, `${indent}    `)).join('\n');
        return [
            `${indent}<Section title="${escapeJsx(s.title)}" icon="${s.icon}"${s.collapsed ? ' defaultCollapsed' : ''}>`,
            `${indent}    <Grid columns={2}>`,
            grid,
            `${indent}    </Grid>`,
            `${indent}</Section>`,
        ].join('\n');
    };

    const body = layout.map(s => renderSection(s, '            ')).join('\n\n');

    return `function ${componentName}(props) {
    // FormHostProps — see @memberjunction/interactive-component-types/forms
    const { record, entityMetadata, mode, canEdit, canDelete, canCreate, callbacks, utilities } = props;

    // Local edit state. Saves flow through callbacks.NotifyEvent('BeforeSave', { dirtyFields });
    // the wrapper applies dirtyFields to its BaseEntity and persists.
    const [draft, setDraft] = React.useState(record || {});
    const [dirtyFields, setDirty] = React.useState({});

    // Re-flow when host pushes a new record (after save, after mode change, etc.)
    React.useEffect(() => {
        if (record) {
            setDraft(record);
            setDirty({});
        }
    }, [record]);

    // Toolbar contract: the host's record-form-container has Save / Cancel buttons.
    // Register methods so those buttons drive our save flow.
    React.useEffect(() => {
        if (!callbacks?.RegisterMethod) return;
        callbacks.RegisterMethod('RequestSave', () => {
            callbacks.NotifyEvent('BeforeSave', { dirtyFields, cancel: false });
        });
        callbacks.RegisterMethod('RequestCancel', () => {
            setDraft(record || {});
            setDirty({});
        });
    }, [callbacks, dirtyFields, record]);

    const onField = (name, value) => {
        setDraft(d => ({ ...d, [name]: value }));
        setDirty(d => ({ ...d, [name]: value }));
        callbacks?.NotifyEvent?.('FieldChanged', { fieldName: name, value });
    };

    // Convenience: pass everything needed by the registered <Field> primitive.
    const Field = ({ name, label, span, readOnly }) => {
        const fieldMeta = entityMetadata?.fields?.find(x => x.name === name);
        return utilities.components.FormField({
            name, label, span, readOnly: readOnly || !canEdit || mode === 'view',
            value: draft?.[name],
            onChange: onField,
            field: fieldMeta,
        });
    };
    const Section = utilities.components.FormSection;
    const Grid = utilities.components.FormGrid;

    return (
        <div className="mj-form" data-entity="${escapeJsx(schema.entityName)}">
${body || '            {/* no fields visible — entity has no IncludeInGeneratedForm fields */}'}
        </div>
    );
}`;
}

function defaultFunctionalRequirements(schema: CuratedFormSchema): string {
    return [
        `Default form for ${schema.displayName}.`,
        '',
        `Renders all editable fields for the entity in the layout defined by EntityField metadata`,
        `(Category, GeneratedFormSectionType, Sequence). Mirrors the Angular CodeGen form so the`,
        `runtime form path achieves day-one parity with the default Angular form.`,
        '',
        'Supports view, edit, and create modes. Emits BeforeSave with dirty-field deltas.',
    ].join('\n');
}

function defaultTechnicalDesign(schema: CuratedFormSchema, layout: ScaffoldSection[]): string {
    return [
        `Bound to entity '${schema.entityName}'.`,
        '',
        'Layout:',
        ...layout.map(s =>
            s.title
                ? `  - ${s.title} (${s.fields.length} field${s.fields.length === 1 ? '' : 's'}${s.collapsed ? ', collapsed by default' : ''})`
                : `  - [Top area] (${s.fields.length} field${s.fields.length === 1 ? '' : 's'})`
        ),
        '',
        'Host contract:',
        '  - FormHostProps.record is the live snapshot from BaseEntity.',
        '  - callbacks.NotifyEvent(\'BeforeSave\', { dirtyFields }) commits.',
        '  - RegisterMethod(\'RequestSave\') / (\'RequestCancel\') hook into the host toolbar.',
    ].join('\n');
}

/** Strip non-identifier characters so the function name is valid JS. */
export function sanitizeComponentName(raw: string): string {
    const cleaned = raw.replace(/[^A-Za-z0-9_]/g, '');
    if (!cleaned || /^\d/.test(cleaned)) return `Form_${cleaned || 'Component'}`;
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function escapeJsx(s: string): string {
    return s.replace(/"/g, '&quot;');
}
