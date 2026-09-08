import {
    Metadata,
    RunView,
    type FormChromeRule,
    type FormInclusion,
    type IMetadataProvider,
} from '@memberjunction/core';
import { SafeJSONParse } from '@memberjunction/global';

export const FORM_CHROME_RULES_ENTITY = 'MJ: Form Chrome Rules';

interface FormChromeRuleRow {
    EntityID: string;
    TargetKind: FormChromeRule['TargetKind'];
    RelatedEntityID: string | null;
    ContributionKey: string | null;
    Inclusion: FormInclusion;
    JoinFields: string | null;
    Sequence: number | null;
    Title?: string | null;
}

/**
 * Load L3 install overlay rows for one parent form entity.
 * Returns [] when the entity is not in metadata (migration / CodeGen not applied).
 */
export async function LoadFormChromeRules(
    parentEntityId: string,
    provider?: IMetadataProvider,
): Promise<FormChromeRule[]> {
    const id = parentEntityId.trim();
    if (!isEntityId(id)) return [];
    const md = provider ?? Metadata.Provider;
    const rulesEntity = md?.EntityByName(FORM_CHROME_RULES_ENTITY);
    if (!rulesEntity) return [];

    // Read through the SAME provider the check above resolved. `new RunView()` binds the GLOBAL
    // provider, so in a multi-provider app this validated the entity against the caller's provider
    // and then read the rows from a different one — yielding another environment's chrome rules, or
    // none at all, depending on which provider happened to be global at the time.
    const rv = RunView.FromMetadataProvider(md);
    const fields = [
        'EntityID',
        'TargetKind',
        'RelatedEntityID',
        'ContributionKey',
        'Inclusion',
        'JoinFields',
        'Sequence',
    ];
    // Title is additive — skip it until migrate + CodeGen have published the column.
    if (rulesEntity.Fields.some((field) => field.Name === 'Title')) {
        fields.push('Title');
    }
    const result = await rv.RunView<FormChromeRuleRow>({
        EntityName: FORM_CHROME_RULES_ENTITY,
        ExtraFilter: `EntityID='${id}'`,
        Fields: fields,
        OrderBy: 'Sequence ASC',
        ResultType: 'simple',
    });
    if (!result.Success) return [];
    return (result.Results ?? []).map(toRule);
}

function toRule(row: FormChromeRuleRow): FormChromeRule {
    const title = row.Title?.trim();
    return {
        EntityID: row.EntityID,
        TargetKind: row.TargetKind,
        RelatedEntityID: row.RelatedEntityID,
        ContributionKey: row.ContributionKey,
        Inclusion: row.Inclusion,
        JoinFields: parseJoinFields(row.JoinFields),
        Sequence: row.Sequence,
        Title: title && title.length > 0 ? title : null,
    };
}

function parseJoinFields(raw: string | null): string[] | null {
    if (raw == null || raw.trim().length === 0) return null;
    const parsed = SafeJSONParse<string[]>(raw, false);
    if (!Array.isArray(parsed)) return null;
    const fields = parsed.map((f) => (typeof f === 'string' ? f.trim() : '')).filter((f) => f.length > 0);
    return fields.length > 0 ? fields : null;
}

function isEntityId(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
