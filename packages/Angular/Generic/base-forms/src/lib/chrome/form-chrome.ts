/**
 * Form chrome — how the container arranges sections (accordion vs left-nav,
 * first-class vs More). Complements form contributions (what is on the form).
 *
 * @see plans/form-chrome-policy.md
 */
import type { FormRole } from '@memberjunction/core';

export const MORE_SECTION_KEY = '__mj_form_more';

/** Field panels (default / inherited) collapse into this one left-nav item. */
export const DETAILS_SECTION_KEY = '__mj_form_details';

export const SYSTEM_METADATA_SECTION_KEY = 'systemMetadata';

/**
 * Expand-all / collapse-all only apply to stacked accordion panels.
 * Left-nav and right-nav show one section at a time, so those buttons
 * would be noise.
 */
export function IsAccordionFormChrome(layout: string | null | undefined): boolean {
    return (layout ?? 'accordion') === 'accordion';
}

/** Audit / timestamp leftover sections always fold into More. */
export function IsAlwaysMoreSection(sectionKey: string, sectionName?: string): boolean {
    const key = (sectionKey ?? '').trim().toLowerCase();
    if (key === SYSTEM_METADATA_SECTION_KEY.toLowerCase()) return true;
    const name = (sectionName ?? '').trim().toLowerCase();
    return name === 'system metadata';
}

/**
 * Drop a schema entity-name prefix (`MJ_BizApps_Common: Contact Methods` →
 * `Contact Methods`). DisplayName is the long-term source of truth; this keeps
 * already-baked SectionName strings readable until CodeGen reruns.
 */
export function HumanizeEntityTitle(name: string): string {
    const trimmed = (name ?? '').trim();
    const match = trimmed.match(/^[A-Za-z][A-Za-z0-9_]*:\s+(.+)$/);
    return match?.[1]?.trim() || trimmed;
}

export interface FormChromeGroup {
    Key: string;
    Title: string;
    Icon: string;
    SectionKeys: string[];
    /** True when this group is the More bucket (Detail related grids). */
    IsMore: boolean;
    /**
     * Primary contribution that owns its own rail item and sorts in the
     * lead band (before Details). Overview is the usual case.
     */
    IsLead?: boolean;
}

export interface FormChromeSpec {
    Layout: 'accordion' | 'left-nav';
    Groups: FormChromeGroup[];
    /** SectionKey → role for related-entity panels. Field panels are omitted. */
    RelatedRoles: ReadonlyMap<string, FormRole>;
    MoreSectionKeys: string[];
    /**
     * L3 admin Title overlays, keyed by section key or contribution key.
     * First-class group titles are already rewritten; More items and
     * accordion headers read this map so the same override reaches both.
     */
    TitleBySectionKey?: ReadonlyMap<string, string>;
}

/**
 * True when `sectionKey` sits in the left-nav Details group — the one rail
 * item that shows SEVERAL panels at once (every field panel, plus any
 * contribution registered with `ChromeGroup: 'details'`). The container
 * renders those panels as ONE card (`.mj-chrome-details`, with
 * `-first` / `-last` on the visual edges): no per-section headers, one
 * surface — otherwise the field rows float on the page background.
 */
export function IsDetailsSectionKey(spec: Pick<FormChromeSpec, 'Groups'>, sectionKey: string): boolean {
    const details = spec.Groups.find((g) => g.Key === DETAILS_SECTION_KEY);
    return !!details && details.SectionKeys.includes(sectionKey);
}

/**
 * The visual first and last of the Details panels currently shown. Panels are
 * flex items sequenced by CSS `order` (the form's section display order), so
 * DOM order is not enough — a user who reordered sections would get the card's
 * rounded corners on the wrong panels. Ties keep DOM order (stable sort).
 */
export function DetailsCardEdges(
    keysInDomOrder: readonly string[],
    orderOf: (sectionKey: string) => number,
): { First: string | null; Last: string | null } {
    if (keysInDomOrder.length === 0) return { First: null, Last: null };
    const sorted = keysInDomOrder
        .map((key, index) => ({ key, index, order: orderOf(key) }))
        .sort((a, b) => (a.order - b.order) || (a.index - b.index));
    return { First: sorted[0].key, Last: sorted[sorted.length - 1].key };
}

export interface FormChromePanelSnapshot {
    SectionKey: string;
    SectionName: string;
    Variant: string;
    Icon?: string;
}

export const DEFAULT_FORM_CHROME_SPEC: FormChromeSpec = {
    Layout: 'accordion',
    Groups: [],
    RelatedRoles: new Map(),
    MoreSectionKeys: [],
};
