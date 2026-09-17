import type { BaseEntity, CompositeKey, PlatformSQL } from '@memberjunction/core';
import { SimpleEntityFieldInfo } from '@memberjunction/interactive-component-types';
import type { FormPanelHostProps } from '@memberjunction/interactive-component-types/forms';
import type { BaseFormComponent } from '../base-form-component';
import type { FormContributionRegistration } from '../panel-slot/form-contribution';
import { StripJoinFieldBrackets } from '../panel-slot/form-contribution';

export interface BuildFormPanelHostPropsInput {
    Record: BaseEntity;
    /** Null when previewing outside a form (artifact viewer). Permissions then read false. */
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
 * prebuilt view params so the panel never hand-writes an FK filter.
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
    if (related && form) {
        const join = StripJoinFieldBrackets(meta.relatedJoinField) || undefined;
        const viewParams = form.BuildRelationshipViewParamsByEntityName(related, join);
        props.related = {
            entityName: related,
            joinField: join,
            viewParams: {
                EntityName: viewParams.EntityName ?? related,
                // RunView accepts `string | PlatformSQL`; the panel contract carries plain
                // strings because these cross into React as JSON. Take the platform's own
                // variant where one exists, else the default fragment.
                ExtraFilter: plainSQL(viewParams.ExtraFilter) ?? '',
                OrderBy: plainSQL(viewParams.OrderBy),
            },
            newRecordValues: form.NewRecordValues(related, join),
        };
    }
    return props;
}

/**
 * Flatten a `string | PlatformSQL` fragment to the string the panel receives.
 * The browser talks to one server at a time, so the SQL Server variant (when present)
 * is the right pick; `default` is the documented fallback.
 */
function plainSQL(value: string | PlatformSQL | undefined): string | undefined {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'string') return value;
    return value.sqlserver ?? value.default;
}
