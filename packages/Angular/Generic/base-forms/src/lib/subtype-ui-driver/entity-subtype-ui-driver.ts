import { Directive, EventEmitter, Input, Output } from '@angular/core';
import {
    BaseEntity,
    EntityFieldInfo,
    EntityFieldTSType,
    EntityFieldValueListType,
    EntityInfo,
    UserInfo,
    ValidationResult,
} from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import type { BaseFormComponent } from '../base-form-component';
import type { FormContext } from '../types/form-types';
import type { FormNavigationEvent } from '../types/navigation-events';

/**
 * Identifies the host surface rendering an {@link EntitySubtypeUIDriverBase} component.
 *
 * - `'form-section'`: Mounted inside `<mj-folded-subtype-section>` on a parent entity's form
 *   when `SubtypeSelector.FoldIntoForm` is `true` and the active type row names a `UIDriver`.
 * - `'comment-card'`: Mounted inside `<mj-record-comments>` when rendering a comment whose
 *   `CommentType.UIDriverClass` names this driver (for example `FieldSuggestionCardComponent`).
 * - `'custom'`: Mounted by another type-driven host surface.
 */
export type SubtypeUIDriverSurface = 'form-section' | 'comment-card' | 'custom';

/**
 * Control type rendered by `<mj-form-field>` for a generated subtype field.
 */
export type SubtypeFieldControlType =
    | 'textbox'
    | 'textarea'
    | 'number'
    | 'datepicker'
    | 'checkbox'
    | 'select'
    | 'autocomplete'
    | 'code';

/**
 * Read-mode link behavior rendered by `<mj-form-field>` for a generated subtype field.
 */
export type SubtypeFieldLinkType = 'Email' | 'URL' | 'Record' | 'None';

/**
 * Computed field rendering descriptor for an IS-A child entity's own fields when
 * `SubtypeSelector.FoldIntoForm` renders generated fields.
 */
export interface SubtypeGeneratedFieldSpec {
    /** Exact field name on the child entity. */
    FieldName: string;
    /** Display label from entity field metadata. */
    DisplayName: string;
    /** Edit control type matching CodeGen's Angular form emitter. */
    ControlType: SubtypeFieldControlType;
    /** Read-only link rendering mode matching CodeGen's Angular form emitter. */
    LinkType: SubtypeFieldLinkType;
    /** Sequence order from metadata. */
    Sequence: number;
}

/**
 * Abstract base class for UI components resolved dynamically from a type table row via
 * `IEntitySubtypeSelectorConfig.UIDriver` (`{ Path: string }`).
 *
 * Subclasses register with `@RegisterClass(EntitySubtypeUIDriverBase, 'YourUIDriverKey')`
 * (where the key matches the string stored in the type row's `UIDriverClass` column).
 *
 * Host surfaces:
 * 1. **Generated forms (`FoldIntoForm: true`)**: Replaces the child entity's default generated
 *    fields inside `<mj-folded-subtype-section>`.
 * 2. **Comments & type-driven cards**: Renders custom cards (such as `FieldSuggestionCardComponent`)
 *    for records of that subtype.
 */
@Directive()
export abstract class EntitySubtypeUIDriverBase<
    TRecord extends BaseEntity = BaseEntity,
    TChild extends BaseEntity = BaseEntity,
> extends BaseAngularComponent {
    /** The parent entity record whose type resolved this UI driver (e.g., Task or Comment). */
    @Input() Record: TRecord | null = null;

    /** The resolved IS-A child entity record (e.g., GitHubIssueTask or FieldSuggestion), when present. */
    @Input() ChildRecord: TChild | null = null;

    /**
     * Optional target entity record when the subtype record is anchored to another entity
     * (for example, the entity record that a `FieldSuggestion` proposes a value for).
     */
    @Input() TargetRecord: BaseEntity | null = null;

    /** Whether the host surface is currently in edit mode. */
    @Input() EditMode = false;

    /** Which surface mounted this driver (`'form-section'`, `'comment-card'`, or `'custom'`). */
    @Input() Surface: SubtypeUIDriverSurface = 'form-section';

    /** Host form component when mounted inside an entity record form. */
    @Input() FormComponent: BaseFormComponent | null = null;

    /** Host form context (search filter, empty-field visibility, validation state) when in a form. */
    @Input() FormContext?: FormContext;

    /** Optional structured metadata/context supplied by non-form host surfaces. */
    @Input() DriverContext: Record<string, unknown> | null = null;

    /** Emitted when the driver requests record or external navigation. */
    @Output() Navigate = new EventEmitter<FormNavigationEvent>();

    /**
     * Emitted when an interactive driver action mutates the subtype record or target record
     * (e.g., accepting or rejecting a field suggestion, or posting a reply).
     */
    @Output() RecordMutated = new EventEmitter<void>();

    /**
     * Optional validation hook invoked when `Surface === 'form-section'` before `SaveRecord()`.
     * Default implementation reports valid.
     */
    public Validate(): ValidationResult | Promise<ValidationResult> {
        const result = new ValidationResult();
        result.Success = true;
        return result;
    }

    /**
     * Synchronous validation snapshot used by synchronous `BaseFormComponent.Validate()` callers.
     */
    public LastKnownValidation(): ValidationResult {
        const result = new ValidationResult();
        result.Success = true;
        return result;
    }
}

/**
 * Derives the ordered list of `<mj-form-field>` descriptors for an IS-A child entity's own
 * fields, mirroring CodeGen's `generateSectionHTMLForAngular` / `isFieldRenderedInForm` rules
 * and enforcing per-user field-level read security.
 */
export function ResolveGeneratedSubtypeFieldSpecs(
    childEntity: EntityInfo,
    user?: UserInfo | null,
): SubtypeGeneratedFieldSpec[] {
    const parentFieldNames = childEntity.ParentEntityFieldNames;
    const virtualNameTargets = collectVirtualFKNameFieldTargets(childEntity);

    const renderedFields = childEntity.Fields.filter((field) =>
        isSubtypeFieldRenderedInForm(childEntity, field, parentFieldNames, virtualNameTargets, user),
    ).sort((a, b) => a.Sequence - b.Sequence);

    return renderedFields.map((field) => ({
        FieldName: field.Name,
        DisplayName: field.DisplayNameOrName,
        ControlType: resolveSubtypeFieldControlType(field),
        LinkType: resolveSubtypeFieldLinkType(field),
        Sequence: field.Sequence,
    }));
}

function collectVirtualFKNameFieldTargets(entity: EntityInfo): Set<string> {
    const targets = new Set<string>();
    for (const field of entity.Fields) {
        const mapped = field.RelatedEntityNameFieldMap?.trim();
        if (mapped) {
            targets.add(mapped.toLowerCase());
        }
    }
    return targets;
}

function isSubtypeFieldRenderedInForm(
    entity: EntityInfo,
    field: EntityFieldInfo,
    parentFieldNames: Set<string>,
    virtualNameTargets: Set<string>,
    user?: UserInfo | null,
): boolean {
    if (field.IsPrimaryKey) return false;
    if (field.Name.toLowerCase() === 'id') return false;
    if (parentFieldNames.has(field.Name)) return false;
    if (field.Name === '__mj_CreatedAt' || field.Name === '__mj_UpdatedAt') return false;
    if (!field.IncludeInGeneratedForm) return false;
    if (field.Status === 'Deprecated' || field.Status === 'Disabled') return false;
    if (field.IsVirtual && virtualNameTargets.has(field.Name.toLowerCase())) return false;
    if (field.IsBinaryFieldType) return false;
    if (user && !entity.IsFieldReadableByUser(field.Name, user)) return false;
    return true;
}

function resolveSubtypeFieldControlType(field: EntityFieldInfo): SubtypeFieldControlType {
    let control: SubtypeFieldControlType = 'textbox';

    if (!field.ReadOnly) {
        if (field.ValueListTypeEnum !== EntityFieldValueListType.None) {
            if (field.ValueListTypeEnum === EntityFieldValueListType.ListOrUserEntry) {
                control = 'autocomplete';
            } else if (field.ValueListTypeEnum === EntityFieldValueListType.List) {
                control = 'select';
            }
        } else if (field.TSType === EntityFieldTSType.Boolean) {
            control = 'checkbox';
        } else if (field.TSType === EntityFieldTSType.Date) {
            control = 'datepicker';
        } else if (field.TSType === EntityFieldTSType.Number) {
            control = 'number';
        } else if (field.TSType === EntityFieldTSType.String) {
            if (field.Length < 0 || field.MaxLength > 1000) {
                control = 'textarea';
            } else {
                control = 'textbox';
            }
        }
    }

    if (field.ExtendedType === 'Code') {
        control = 'code';
    }

    return control;
}

function resolveSubtypeFieldLinkType(field: EntityFieldInfo): SubtypeFieldLinkType {
    if (field.RelatedEntity && field.RelatedEntity.trim().length > 0) {
        return 'Record';
    }
    const ext = field.ExtendedType?.trim().toLowerCase();
    if (ext === 'url') return 'URL';
    if (ext === 'email') return 'Email';
    return 'None';
}
