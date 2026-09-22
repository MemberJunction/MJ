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
 * The section keys filed under one rail item, worked out from the panels alone.
 *
 * The rail's own membership is not usable here: it is computed from the set of panels a
 * contribution has hidden, so asking it which panels a contribution should hide would be
 * circular. This applies the same classification the rail applies — audit leftovers to
 * More, related grids and contributions to an item of their own merged by title,
 * everything else to Details — over the unfiltered panels.
 *
 * `groupKey` is any rail item's key, so nothing here privileges Details.
 */
export function RailGroupSectionKeys(
    panels: readonly FormChromePanelSnapshot[],
    contributionSectionKeys: readonly string[],
    groupKey: string,
): string[] {
    const key = (groupKey ?? '').trim();
    if (!key) return [];
    const contributions = new Set(contributionSectionKeys);

    const groupOf = (panel: FormChromePanelSnapshot): string => {
        if (IsAlwaysMoreSection(panel.SectionKey, panel.SectionName)) return MORE_SECTION_KEY;
        if (panel.Variant === 'related-entity' || contributions.has(panel.SectionKey)) return panel.SectionKey;
        return DETAILS_SECTION_KEY;
    };

    // Related items sharing a title are one rail item, so naming either one names both.
    const named = panels.find((panel) => groupOf(panel) === key);
    const namedTitle = named && key !== DETAILS_SECTION_KEY && key !== MORE_SECTION_KEY
        ? HumanizeEntityTitle(named.SectionName || named.SectionKey)
        : null;

    return panels
        .filter((panel) => {
            const group = groupOf(panel);
            if (group === key) return true;
            if (!namedTitle || group === DETAILS_SECTION_KEY || group === MORE_SECTION_KEY) return false;
            return HumanizeEntityTitle(panel.SectionName || panel.SectionKey) === namedTitle;
        })
        .map((panel) => panel.SectionKey);
}

/**
 * The panels a contribution can replace one of: what the Details rail item is made of,
 * in document order.
 *
 * Not "every panel that is not a related grid". That set also holds the contributions
 * already installed — replaced by naming the panel, not a section — and the leftover
 * audit sections, which the rail files under More. Offering either as a field group
 * inside Details tells the user the tab contains things it does not. With no Details
 * item the form has no such tab, and every non-grid panel stands on its own.
 */
export function FieldGroupsInDetails(
    panels: readonly FormChromePanelSnapshot[],
    groups: readonly FormChromeGroup[],
): Array<{ Key: string; Title: string }> {
    const details = groups.find((group) => group.Key === DETAILS_SECTION_KEY);
    const keep = details
        ? (panel: FormChromePanelSnapshot) => details.SectionKeys.includes(panel.SectionKey)
        : (panel: FormChromePanelSnapshot) => panel.Variant !== 'related-entity';
    return panels.filter(keep).map((panel) => ({ Key: panel.SectionKey, Title: panel.SectionName }));
}

/**
 * The section drawing any of these fields, which is where a field claim renders.
 *
 * Any, not all: a claim naming a field the form has stopped drawing still renders where
 * its remaining fields are. The first match wins, and the claim is meant to name fields of
 * one section, so there is normally only one.
 */
export function SectionDrawingAnyField(
    panels: readonly FormChromePanelSnapshot[],
    fieldNames: readonly string[],
): string | undefined {
    const wanted = new Set(fieldNames.map((name) => name.trim()).filter((name) => name.length > 0));
    if (wanted.size === 0) return undefined;
    return panels.find((panel) => (panel.Fields ?? []).some((field) => wanted.has(field.Name)))?.SectionKey;
}

/**
 * The rail item a contribution belongs to by virtue of the slot it mounts at.
 *
 * A slot says where a panel sits in the form body, and the rail groups that body — so the
 * slot decides the group unless something more specific does. `before-fields` and
 * `after-fields` are positions among the field sections, and the field sections are the
 * Details tab, so a panel at either belongs in Details. The rest are positions relative
 * to things that are tabs in their own right, so a panel there is its own tab too.
 *
 * Without this the slot has no visible effect on a rail form at all: every contribution
 * that claims nothing becomes its own tab, and a user who asked for "before the fields"
 * gets a tab at the bottom of the rail instead.
 */
export function SlotChromeGroup(slot: string | null | undefined): 'details' | null {
    const key = (slot ?? '').trim();
    return key === 'before-fields' || key === 'after-fields' ? 'details' : null;
}

/** Enough of a rendered section to decide which rail item it belongs to. */
export interface ChromeSectionShape {
    Variant?: string;
    SectionName?: string;
}

/**
 * The rail item a contribution joins when it replaces `sectionKey`.
 *
 * Replacing something means standing where it stood. A panel put in place of a field
 * section belongs in the Details tab that section was part of; one put in place of the
 * whole Details group belongs in that group; one put in place of a leftover audit section
 * belongs in More. Null means the contribution keeps a rail item of its own: it replaces
 * nothing, the section is not on the form, or it takes over a related grid — that last one
 * already inherits the grid's rail item through the relationship claim.
 *
 * Without this a replacing panel is lifted to a first-class rail item beside the tab it
 * emptied, so the form loses a section and gains a tab.
 */
export function ReplacedSectionChromeGroup(
    sectionKey: string | null | undefined,
    section: ChromeSectionShape | null | undefined,
): 'details' | 'more' | null {
    const key = (sectionKey ?? '').trim();
    if (!key) return null;
    // Details and More are assembled at render time, so neither has a panel of its own to
    // look up, and a panel standing in for one has nowhere else to be. Every other rail
    // item is named after the panels it holds, so replacing all of them empties the item
    // and the contribution becomes the item — null, a rail item of its own.
    if (key === DETAILS_SECTION_KEY) return 'details';
    if (key === MORE_SECTION_KEY) return 'more';
    if (!section || section.Variant === 'related-entity') return null;
    return IsAlwaysMoreSection(key, section.SectionName) ? 'more' : 'details';
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
    /**
     * The inputs this panel draws, when it draws any. Present so the composition snapshot
     * can name a field a contribution could stand in for; the chrome rules themselves do
     * not read it.
     */
    Fields?: ReadonlyArray<{ Name: string; Label: string }>;
}

export const DEFAULT_FORM_CHROME_SPEC: FormChromeSpec = {
    Layout: 'accordion',
    Groups: [],
    RelatedRoles: new Map(),
    MoreSectionKeys: [],
};
