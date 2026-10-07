import { EntityInfo, type BaseEntity, type CompositeKey, type PlatformSQL } from '@memberjunction/core';
import { SimpleEntityFieldInfo } from '@memberjunction/interactive-component-types';
import type { FormPanelHostProps } from '@memberjunction/interactive-component-types/forms';
import type { BaseFormComponent } from '../base-form-component';
import type { FormContributionRegistration } from '../panel-slot/form-contribution';
import { StripJoinFieldBrackets } from '../panel-slot/form-contribution';

export interface BuildFormPanelHostPropsInput {
    Record: BaseEntity;
    /**
     * Null when previewing outside a form (artifact viewer). Permissions then read false; a
     * related claim still gets its view params, which come from the record.
     */
    FormComponent: BaseFormComponent | null;
    Contribution: FormContributionRegistration;
    SectionKey: string;
    Layout: 'accordion' | 'left-nav';
    IsExpanded: boolean;
}

function primaryKeyToPlain(pk: CompositeKey | null | undefined): Record<string, unknown> | null {
    if (!pk || !pk.HasValue) return null;
    const out: Record<string, unknown> = {};
    for (const kvp of pk.KeyValuePairs ?? []) out[kvp.FieldName] = kvp.Value;
    return out;
}

/**
 * Build `FormPanelHostProps` for a metadata contribution. Same record snapshot the
 * whole-form host builds, plus the contribution context and — for related claims —
 * prebuilt view params so the panel never hand-writes an FK filter. The view params come
 * from the record and its relationships, so a preview with no form gets them too.
 */
export function BuildFormPanelHostProps(input: BuildFormPanelHostPropsInput): FormPanelHostProps {
    const { Record: record, FormComponent: form, Contribution: contribution } = input;
    const meta = contribution.Metadata;
    const pk = record.PrimaryKey;
    const primaryKey = primaryKeyToPlain(pk);
    const mode: FormPanelHostProps['mode'] = form?.EditMode ? 'edit' : (primaryKey ? 'view' : 'create');

    const props: FormPanelHostProps = {
        entityName: record.EntityInfo.Name,
        primaryKey,
        record: record.GetAll(),
        entityMetadata: {
            fields: record.Fields.map((f) => SimpleEntityFieldInfo.FromEntityFieldInfo(f.EntityFieldInfo)),
            displayName: record.EntityInfo.DisplayName ?? record.EntityInfo.Name,
            nameField: record.EntityInfo.NameField?.Name,
        },
        mode,
        canEdit: form?.UserCanEdit ?? false,
        canDelete: form?.UserCanDelete ?? false,
        canCreate: form?.UserCanCreate ?? false,
        contribution: {
            key: input.SectionKey,
            slot: meta.slot,
            title: contribution.Title ?? meta.contributionKey ?? input.SectionKey,
            presentation: contribution.Presentation ?? meta.presentation ?? 'panel',
            configuration: contribution.Configuration ?? {},
        },
        isExpanded: input.IsExpanded,
        layout: input.Layout,
    };

    const related = meta.relatedEntity?.trim();
    if (related) props.related = relatedPanelProps(record, related, StripJoinFieldBrackets(meta.relatedJoinField) || undefined);
    return props;
}

/**
 * The related-grid props of a claim on `relatedEntity`, from the record alone.
 *
 * The rows are those whose join field holds this record's key: the named join field, or with
 * none named, every relationship to that entity (Bill-To OR Ship-To). New rows get the same
 * fields set to the record's key. A record not saved yet has no key, so its filter matches
 * nothing.
 */
function relatedPanelProps(record: BaseEntity, relatedEntity: string, joinField: string | undefined): FormPanelHostProps['related'] {
    const target = relatedEntity.toLowerCase();
    const relationships = (record.EntityInfo.RelatedEntities ?? []).filter((r) => r.RelatedEntity.trim().toLowerCase() === target);
    const joinFields = joinField ? [joinField] : relationships.map((r) => r.RelatedEntityJoinField);
    const relationship = joinFields.length === 1
        ? relationships.find((r) => r.RelatedEntityJoinField.trim().toLowerCase() === joinFields[0].trim().toLowerCase())
        : undefined;
    const viewParams = EntityInfo.BuildRelationshipViewParamsForJoinFields(record, relatedEntity, joinFields);
    return {
        entityName: relatedEntity,
        joinField,
        viewParams: {
            EntityName: viewParams.EntityName ?? relatedEntity,
            // RunView accepts `string | PlatformSQL`; the panel contract carries plain
            // strings because these cross into React as JSON, so the fragment is flattened.
            ExtraFilter: plainSQL(viewParams.ExtraFilter) ?? '',
            OrderBy: plainSQL(viewParams.OrderBy),
        },
        newRecordValues: relationship
            ? EntityInfo.BuildRelationshipNewRecordValues(record, relationship)
            : EntityInfo.BuildRelationshipNewRecordValuesForJoinFields(record, joinFields),
    };
}

/**
 * Flatten a `string | PlatformSQL` fragment to the string the panel receives.
 *
 * A plain string passes through. For a `PlatformSQL` value the `sqlserver` variant is taken when
 * present, else `default`: the same choice a browser-side provider makes, since it does not know
 * the server's platform and `ProviderBase.PlatformKey` defaults to SQL Server. On a PostgreSQL
 * server a fragment with a different `postgresql` variant would therefore be the wrong one. The
 * relationship filters built here are plain strings.
 */
function plainSQL(value: string | PlatformSQL | undefined): string | undefined {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'string') return value;
    return value.sqlserver ?? value.default;
}
