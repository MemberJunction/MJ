import type { FormContributionSpec } from './form-contribution-spec';

/**
 * Keys a form contribution is identified by, and the section keys it is matched against.
 *
 * The server actions, the apply flow and the renderer all derive keys here, so a key written
 * on one side is the key the other side computes.
 */

/**
 * Characters a contribution key may contain.
 *
 * Keys are compared in SQL filters and matched by `MJ: Form Chrome Rules`, and they can arrive
 * from an LLM. A key that cannot contain a quote cannot break a filter. The space is permitted
 * because a related-grid key embeds an entity name, and MJ entity names contain spaces.
 */
export const CONTRIBUTION_KEY_PATTERN = /^[A-Za-z0-9:._ -]{1,256}$/;

/** Trims a join field and removes one wrapping `[...]` pair. */
export function StripJoinFieldBrackets(join: string | null | undefined): string {
    return (join ?? '').trim().replace(/^\[/, '').replace(/\]$/, '');
}

/** `related:<entity>:<join>` — the key of a contribution that stands in for a related-entity grid. */
export function RelatedContributionKey(relatedEntityName: string, joinField: string | null | undefined): string {
    return `related:${relatedEntityName.trim()}:${StripJoinFieldBrackets(joinField)}`;
}

/**
 * `panel:<component name>`, with characters {@link CONTRIBUTION_KEY_PATTERN} rejects folded
 * to `-`. Null when the name carries nothing usable.
 */
export function PanelContributionKey(componentName: string | null | undefined): string | null {
    const slug = (componentName ?? '')
        .trim()
        .replace(/[^A-Za-z0-9._ -]+/g, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 240)
        .trim();
    return slug ? `panel:${slug}` : null;
}

/**
 * The key a contribution row carries. The key is the contribution's identity: the duplicate
 * check, the rail and "replace an installed panel" all find a contribution by it.
 *
 * The author's key wins. A related-grid claim derives {@link RelatedContributionKey}. Anything
 * else derives {@link PanelContributionKey} from the component name, which is stable across
 * re-applies of the same panel and distinct between different ones. Null when none applies.
 *
 * @param relatedEntityName The registered name of the related entity the spec claims, or null.
 * @param componentName The component name that seeds a panel key. Omit it to get no panel key.
 */
export function ResolveContributionWriteKey(
    spec: Pick<FormContributionSpec, 'contributionKey' | 'relatedJoinField'>,
    relatedEntityName: string | null,
    componentName?: string | null,
): string | null {
    const authored = spec.contributionKey?.trim();
    if (authored) return authored;
    if (relatedEntityName?.trim()) return RelatedContributionKey(relatedEntityName, spec.relatedJoinField);
    return PanelContributionKey(componentName);
}

/**
 * camelCase with every character that is not a letter or digit removed. Matches `camelCase` in
 * CodeGenLib `angular-codegen.ts`, which names the sections a generated form emits; any other
 * result stops matching the section keys of forms already generated.
 */
export function FormSectionCamelCase(str: string): string {
    const sanitized = str.replace(/[^a-zA-Z0-9\s]/g, ' ');
    let result = sanitized
        .replace(/\s(.)/g, (_match, char: string) => char.toUpperCase())
        .replace(/\s/g, '')
        .replace(/^(.)/, (_match, char: string) => char.toLowerCase());
    if (/^\d/.test(result)) {
        result = '_' + result;
    }
    return result.length === 0 ? 'section' : result;
}

/**
 * The section key a generated form gives a related-entity grid. When another grid on the form
 * shows the same entity, the join field is appended so the two keys differ.
 */
export function RelatedGridSectionKey(
    relatedEntity: string,
    joinField: string | null | undefined,
    sharesRelatedEntity: boolean,
): string {
    return sharesRelatedEntity
        ? FormSectionCamelCase(`${relatedEntity} ${StripJoinFieldBrackets(joinField)}`)
        : FormSectionCamelCase(relatedEntity);
}
