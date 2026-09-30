import { SafeJSONParse } from '@memberjunction/global';
import {
    DEFAULT_FORM_CONTRIBUTION_SLOT,
    ResolveContributionWriteKey,
    type FormContributionSpec,
} from '@memberjunction/interactive-component-types/forms';
import type { MJEntityFormContributionEntity } from '../../generated/entities/__mj';

/**
 * The spec-to-row mapping for `MJ: Entity Form Contributions`.
 *
 * The Create and Modify Form Contribution actions write rows through
 * {@link ApplyContributionSpecToRow}, so the same spec produces the same row on either path.
 * Lives here because both the server and the browser depend on this package.
 */

/** What {@link ApplyContributionSpecToRow} needs beyond the spec. */
export interface ContributionRowOptions {
    /** The ID of the entity `spec.relatedEntity` names, or null. */
    relatedEntityID: string | null;
    /** The registered name of that entity, which the derived key embeds. */
    relatedEntityName: string | null;
    /** The component name that seeds the key of a panel with no other key. */
    componentName: string | null;
}

/** The contribution columns a spec's `formContribution` block decides. */
export type FormContributionSpecColumns = Pick<MJEntityFormContributionEntity,
    | 'Slot' | 'SortKey' | 'Presentation' | 'Title' | 'Icon' | 'Configuration' | 'Inclusion' | 'ChromeGroup'
    | 'RelatedEntityID' | 'RelatedJoinField' | 'ReplacesSectionKey' | 'ReplacesSectionKeys' | 'ReplacesFieldNames'
    | 'InSectionKey' | 'SectionPosition' | 'ContributionKey'>;

/**
 * Writes every column a contribution spec decides onto a row, and clears each claim column the
 * spec does not set, so a row that changes its claim keeps nothing of the old one.
 *
 * The row it writes satisfies these CHECK constraints: `ReplacesFieldNamesShape` and
 * `ReplacesSectionKeysShape` (an empty name list is stored as null), `JoinNeedsRelated` (a join
 * field only with a related entity), `SectionPositionNeedsSection` (a position only for a panel
 * drawn inside a section) and `BareNoChrome` (no Inclusion or ChromeGroup on a bare panel). It
 * does not check `OneClaim`: a spec that makes two claims produces a row the database refuses.
 *
 * The caller resolves the related entity, because that needs metadata, and writes the columns
 * that are not in the spec (scope, owner, status, precedence, names).
 */
export function ApplyContributionSpecToRow(
    row: FormContributionSpecColumns,
    spec: FormContributionSpec,
    opts: ContributionRowOptions,
): void {
    applyPlacement(row, spec);
    applyChrome(row, spec);
    applyClaims(row, spec, opts.relatedEntityID);
    row.ContributionKey = ResolveContributionWriteKey(spec, opts.relatedEntityName, opts.componentName);
}

/** The names in a `ReplacesFieldNames` or `ReplacesSectionKeys` cell. Empty for a cell that is not a JSON array. */
export function ParseClaimedFieldNames(raw: string | null | undefined): string[] {
    if (!raw || raw.trim().length === 0) return [];
    const parsed = SafeJSONParse<string[]>(raw, false);
    return Array.isArray(parsed) ? cleanNames(parsed) : [];
}

function applyPlacement(row: FormContributionSpecColumns, spec: FormContributionSpec): void {
    row.Slot = spec.slot ?? DEFAULT_FORM_CONTRIBUTION_SLOT;
    row.SortKey = spec.sortKey ?? 0;
    row.Presentation = spec.presentation;
    row.Title = spec.title;
    row.Icon = spec.icon ?? null;
    row.Configuration = spec.configuration && Object.keys(spec.configuration).length > 0
        ? JSON.stringify(spec.configuration) : null;
}

/** A bare panel is never a rail item, so it carries no rail metadata. */
function applyChrome(row: FormContributionSpecColumns, spec: FormContributionSpec): void {
    const bare = spec.presentation === 'bare';
    row.Inclusion = bare ? null : spec.inclusion ?? null;
    row.ChromeGroup = bare ? null : spec.chromeGroup ?? null;
}

function applyClaims(row: FormContributionSpecColumns, spec: FormContributionSpec, relatedEntityID: string | null): void {
    row.RelatedEntityID = relatedEntityID;
    row.RelatedJoinField = relatedEntityID ? spec.relatedJoinField?.trim() || null : null;
    const fieldNames = cleanNames(spec.replacesFieldNames);
    row.ReplacesFieldNames = jsonArrayOrNull(fieldNames);

    // One section is stored in the single-key column whichever spec field named it.
    const sections = cleanNames([
        ...(spec.replacesSectionKey ? [spec.replacesSectionKey] : []),
        ...(spec.replacesSectionKeys ?? []),
    ]);
    row.ReplacesSectionKey = sections.length === 1 ? sections[0] : null;
    row.ReplacesSectionKeys = sections.length > 1 ? JSON.stringify(sections) : null;

    const inSection = spec.inSectionKey?.trim() || null;
    row.InSectionKey = inSection;
    row.SectionPosition = inSection || fieldNames.length > 0 ? spec.sectionPosition ?? null : null;
}

/** Trimmed, non-empty names without repeats, in their first-seen order. */
function cleanNames(names: readonly string[] | null | undefined): string[] {
    const out: string[] = [];
    for (const raw of names ?? []) {
        const name = typeof raw === 'string' ? raw.trim() : '';
        if (name.length > 0 && !out.includes(name)) out.push(name);
    }
    return out;
}

function jsonArrayOrNull(names: string[]): string | null {
    return names.length > 0 ? JSON.stringify(names) : null;
}
