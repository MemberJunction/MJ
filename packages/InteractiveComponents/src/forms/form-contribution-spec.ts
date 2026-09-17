import type { ComponentSpec } from '../component-spec';

/** Slot names — byte-identical to `FormPanelSlot` in @memberjunction/ng-base-forms. */
export type FormContributionSlot = 'top-area' | 'before-fields' | 'after-fields' | 'after-related' | 'after-everything';
export type FormContributionPresentation = 'panel' | 'bare';
export type FormContributionInclusion = 'Primary' | 'More' | 'None';
export type FormContributionChromeGroup = 'details' | 'more';

export const DEFAULT_FORM_CONTRIBUTION_SLOT: FormContributionSlot = 'after-fields';
export const FORM_CONTRIBUTION_SLOTS: readonly FormContributionSlot[] =
    ['top-area', 'before-fields', 'after-fields', 'after-related', 'after-everything'];

/**
 * Registration intent carried on `ComponentSpec.formContribution`. Mirrors
 * `MJ: Entity Form Contributions` columns one-to-one, minus scope and precedence
 * (host decisions) and minus identity (`Name` / `ComponentID`).
 */
export interface FormContributionSpec {
    slot: FormContributionSlot;
    sortKey?: number;
    contributionKey?: string;
    relatedEntity?: string;
    relatedJoinField?: string;
    replacesSectionKey?: string;
    inclusion?: FormContributionInclusion;
    chromeGroup?: FormContributionChromeGroup;
    presentation: FormContributionPresentation;
    title: string;
    icon?: string;
    configuration?: Record<string, unknown>;
}

/** True iff the spec commits to the form-panel contract. */
export function isFormPanelRole(spec: Pick<ComponentSpec, 'componentRole'>): boolean {
    return spec.componentRole === 'form-panel';
}

function isSlot(value: unknown): value is FormContributionSlot {
    return typeof value === 'string' && (FORM_CONTRIBUTION_SLOTS as readonly string[]).includes(value);
}

function cleanString(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Normalized registration intent for a form-panel spec, or `null` when the spec
 * is not a form panel. Fills defaults (`slot`, `presentation`, `configuration`),
 * trims strings, drops unknown slot / inclusion / chromeGroup values, and falls
 * back to `spec.title` when the block has no title.
 */
export function getDeclaredFormContribution(
    spec: Pick<ComponentSpec, 'componentRole' | 'title' | 'formContribution'> | null | undefined,
): FormContributionSpec | null {
    if (!spec || !isFormPanelRole(spec)) return null;
    const raw: Partial<FormContributionSpec> = spec.formContribution ?? {};
    const title = cleanString(raw.title) ?? cleanString(spec.title) ?? 'Panel';
    const out: FormContributionSpec = {
        slot: isSlot(raw.slot) ? raw.slot : DEFAULT_FORM_CONTRIBUTION_SLOT,
        presentation: raw.presentation === 'bare' ? 'bare' : 'panel',
        title,
        configuration: raw.configuration && typeof raw.configuration === 'object' ? { ...raw.configuration } : {},
    };
    if (typeof raw.sortKey === 'number' && Number.isFinite(raw.sortKey)) out.sortKey = raw.sortKey;
    const key = cleanString(raw.contributionKey);
    if (key) out.contributionKey = key;
    const related = cleanString(raw.relatedEntity);
    if (related) out.relatedEntity = related;
    const join = cleanString(raw.relatedJoinField);
    if (join) out.relatedJoinField = join;
    const replaces = cleanString(raw.replacesSectionKey);
    if (replaces) out.replacesSectionKey = replaces;
    if (raw.inclusion === 'Primary' || raw.inclusion === 'More' || raw.inclusion === 'None') out.inclusion = raw.inclusion;
    if (raw.chromeGroup === 'details' || raw.chromeGroup === 'more') out.chromeGroup = raw.chromeGroup;
    const icon = cleanString(raw.icon);
    if (icon) out.icon = icon;
    return out;
}
