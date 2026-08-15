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
}

export interface FormChromeSpec {
    Layout: 'accordion' | 'left-nav';
    Groups: FormChromeGroup[];
    /** SectionKey → role for related-entity panels. Field panels are omitted. */
    RelatedRoles: ReadonlyMap<string, FormRole>;
    MoreSectionKeys: string[];
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
