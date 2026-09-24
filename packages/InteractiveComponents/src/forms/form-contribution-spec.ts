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
 * The slots a generated form actually emits.
 *
 * CodeGen writes `before-fields`, `after-fields` and `after-related` into every form it
 * produces, and the record container always terminates the fallback chain with
 * `after-everything`. `top-area` is absent: no form emits it, so a panel aimed there
 * falls through to the bottom.
 *
 * Used wherever a form's real slot set is not yet known, so a position nothing renders is
 * never offered as a choice. A hand-written template can differ, which is why a form that
 * can be read is read instead of assumed.
 */
export const GENERATED_FORM_CONTRIBUTION_SLOTS: readonly FormContributionSlot[] =
    ['before-fields', 'after-fields', 'after-related', 'after-everything'];

/**
 * Registration intent carried on `ComponentSpec.formContribution`. Mirrors
 * `MJ: Entity Form Contributions` columns one-to-one, minus scope and precedence
 * (host decisions) and minus identity (`Name` / `ComponentID`).
 */
export interface FormContributionSpec {
    /**
     * Where on the form the panel sits.
     *
     * Optional because placement is the user's choice, made in the apply dialog, not the
     * component author's — a generated spec that omits it behaves exactly like one that
     * names a slot. {@link getDeclaredFormContribution} fills the default, so everything
     * downstream of normalization still sees a concrete slot.
     */
    slot?: FormContributionSlot;
    sortKey?: number;
    contributionKey?: string;
    relatedEntity?: string;
    relatedJoinField?: string;
    replacesSectionKey?: string;
    /**
     * Fields the panel stands in for, all within one section. The panel renders at the top
     * of that section and the named fields are not drawn. Set instead of
     * `replacesSectionKey` or `relatedEntity`, never alongside either.
     *
     * One section, because the panel has one place to draw: a claim spread over two
     * sections has no single top to sit at.
     */
    replacesFieldNames?: string[];
    /**
     * Sections the panel stands in for, all within one tab. It draws in the place of the first
     * of them and the others are not drawn. A single section uses `replacesSectionKey` instead.
     */
    replacesSectionKeys?: string[];
    /** A section the panel draws inside, replacing nothing. `sectionPosition` says where. */
    inSectionKey?: string;
    /**
     * Where inside its section the panel draws, for `inSectionKey` and for a field claim.
     * Absent means the start.
     */
    sectionPosition?: FormContributionSectionPosition;
    inclusion?: FormContributionInclusion;
    chromeGroup?: FormContributionChromeGroup;
    presentation: FormContributionPresentation;
    title: string;
    icon?: string;
    configuration?: Record<string, unknown>;
}

/** Where inside a section a panel draws. */
export type FormContributionSectionPosition = 'start' | 'end';

/** A contribution block after normalization, where the slot has been resolved. */
export type NormalizedFormContributionSpec = FormContributionSpec & { slot: FormContributionSlot };

/** True iff the spec commits to the form-panel contract. */
export function isFormPanelRole(spec: Pick<ComponentSpec, 'componentRole'>): boolean {
    return spec.componentRole === 'form-panel';
}

function isSlot(value: unknown): value is FormContributionSlot {
    return typeof value === 'string' && (FORM_CONTRIBUTION_SLOTS as readonly string[]).includes(value);
}

/** A list of non-empty trimmed strings, de-duplicated, or undefined when there are none. */
function cleanStringList(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) return undefined;
    const out: string[] = [];
    for (const item of value) {
        const name = cleanString(item);
        if (name && !out.includes(name)) out.push(name);
    }
    return out.length > 0 ? out : undefined;
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
): NormalizedFormContributionSpec | null {
    if (!spec || !isFormPanelRole(spec)) return null;
    const raw: Partial<FormContributionSpec> = spec.formContribution ?? {};
    const title = cleanString(raw.title) ?? cleanString(spec.title) ?? 'Panel';
    const out: NormalizedFormContributionSpec = {
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
    const replacedFields = cleanStringList(raw.replacesFieldNames);
    if (replacedFields) out.replacesFieldNames = replacedFields;
    const replacedSections = cleanStringList(raw.replacesSectionKeys);
    if (replacedSections) out.replacesSectionKeys = replacedSections;
    const inSection = cleanString(raw.inSectionKey);
    if (inSection) out.inSectionKey = inSection;
    if (raw.sectionPosition === 'start' || raw.sectionPosition === 'end') out.sectionPosition = raw.sectionPosition;
    if (raw.inclusion === 'Primary' || raw.inclusion === 'More' || raw.inclusion === 'None') out.inclusion = raw.inclusion;
    if (raw.chromeGroup === 'details' || raw.chromeGroup === 'more') out.chromeGroup = raw.chromeGroup;
    const icon = cleanString(raw.icon);
    if (icon) out.icon = icon;
    return out;
}
