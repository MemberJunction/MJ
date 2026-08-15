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
    if (!md?.EntityByName(FORM_CHROME_RULES_ENTITY)) return [];

    const rv = new RunView();
    const result = await rv.RunView<FormChromeRuleRow>({
        EntityName: FORM_CHROME_RULES_ENTITY,
        ExtraFilter: `EntityID='${id}'`,
        Fields: ['EntityID', 'TargetKind', 'RelatedEntityID', 'ContributionKey', 'Inclusion', 'JoinFields', 'Sequence'],
        OrderBy: 'Sequence ASC',
        ResultType: 'simple',
    });
    if (!result.Success) return [];
    return (result.Results ?? []).map(toRule);
}

function toRule(row: FormChromeRuleRow): FormChromeRule {
    return {
        EntityID: row.EntityID,
        TargetKind: row.TargetKind,
        RelatedEntityID: row.RelatedEntityID,
        ContributionKey: row.ContributionKey,
        Inclusion: row.Inclusion,
        JoinFields: parseJoinFields(row.JoinFields),
        Sequence: row.Sequence,
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
