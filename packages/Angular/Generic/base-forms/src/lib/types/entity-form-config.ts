import { FormToolbarConfig } from './toolbar-config';
import { FormWidthMode } from './form-types';

/**
 * Per-instance configuration for an MemberJunction entity form, independent of
 * how it is presented (full-page tab, modal dialog, or slide-in panel).
 *
 * Set on {@link BaseFormComponent.Config}. The record-form container and the
 * collapsible panels read it back through the `FormComponent` reference, so it
 * takes effect **without regenerating** the CodeGen-produced form template.
 *
 * Every field is optional; an omitted field falls back to the value the host
 * surface seeds (see {@link TAB_FORM_CONFIG}, {@link DIALOG_FORM_CONFIG},
 * {@link SLIDEIN_FORM_CONFIG}).
 *
 * This interface is intentionally additive — new optional knobs can be added
 * over time without breaking existing consumers or presets.
 *
 * @example Hide related grids + lock sections open in a dialog
 * ```typescript
 * host.Config = {
 *   ...DIALOG_FORM_CONFIG,
 *   ShowRelatedEntities: false,
 *   CollapsibleSections: false,
 *   Toolbar: { ShowDeleteButton: false },
 * };
 * ```
 */
export interface EntityFormConfig {
  /**
   * Toolbar configuration.
   * - `undefined` → use the surface default (full toolbar on tabs).
   * - `null` → render **no toolbar at all** (default for dialog & slide-in,
   *   where the chrome owns the title and Save/Cancel buttons).
   * - `Partial<FormToolbarConfig>` → merged over the surface default config.
   */
  Toolbar?: Partial<FormToolbarConfig> | null;

  /**
   * Whether related-entity grid sections (panels with `Variant="related-entity"`)
   * are shown. Default: `true` on tabs, `false` in dialog/slide-in.
   */
  ShowRelatedEntities?: boolean;

  /**
   * Whether section headers can collapse/expand. When `false`, every section
   * renders always-expanded with no toggle chevron. Default: `true`.
   */
  CollapsibleSections?: boolean;

  /**
   * Hide specific sections by their `sectionKey` (field OR related-entity).
   * Mutually exclusive with {@link VisibleSectionKeys}; if both are set,
   * `VisibleSectionKeys` wins.
   */
  HiddenSectionKeys?: string[];

  /**
   * Allow-list of `sectionKey`s to render — every other section is hidden.
   * Mutually exclusive with {@link HiddenSectionKeys}.
   */
  VisibleSectionKeys?: string[];

  /**
   * Initial width mode for the form body. Default: `'centered'` on tabs,
   * `'full-width'` in a slide-in.
   */
  WidthMode?: FormWidthMode;

  /**
   * Whether in-form record links emit `Navigate` events. The form host NEVER
   * routes; it only emits, and the consumer decides what to do. Default:
   * `true` on tabs, `false` in dialog/slide-in (links render inert so a modal
   * context doesn't teleport the user away).
   */
  EnableRecordLinks?: boolean;

  /**
   * Force the form to start in edit mode. When omitted, the host starts new
   * records in edit mode and existing records in read mode.
   */
  StartInEditMode?: boolean;
}

/**
 * Default config for a full-page (tab) form: full toolbar, related grids
 * visible, collapsible sections, in-form links live. Equivalent to passing no
 * config at all — provided for explicitness and as a merge base.
 */
export const TAB_FORM_CONFIG: EntityFormConfig = {
  Toolbar: undefined,
  ShowRelatedEntities: true,
  CollapsibleSections: true,
  WidthMode: 'centered',
  EnableRecordLinks: true,
};

/**
 * Default config for an entity form presented in a modal dialog: no in-form
 * toolbar (the dialog footer owns Save/Cancel), related grids hidden to keep
 * the dialog focused, sections collapsible, in-form links inert.
 */
export const DIALOG_FORM_CONFIG: EntityFormConfig = {
  Toolbar: null,
  ShowRelatedEntities: false,
  CollapsibleSections: true,
  WidthMode: 'centered',
  EnableRecordLinks: false,
};

/**
 * Default config for an entity form presented in a slide-in panel: same as the
 * dialog default but full-width to use the panel's vertical real estate.
 */
export const SLIDEIN_FORM_CONFIG: EntityFormConfig = {
  Toolbar: null,
  ShowRelatedEntities: false,
  CollapsibleSections: true,
  WidthMode: 'full-width',
  EnableRecordLinks: false,
};

// ── Pure resolution helpers (used by the record-form container; unit-tested) ──

/**
 * Whether the in-form toolbar should render for the given config. An explicit
 * `Toolbar: null` (dialog/slide-in default) hides it entirely; anything else
 * (undefined or a partial config) keeps it.
 */
export function ResolveFormShowToolbar(config: EntityFormConfig | null | undefined): boolean {
  return config?.Toolbar !== null;
}

/**
 * Merge a config's `Toolbar` partial over a base toolbar config. Returns `base`
 * unchanged when there's no override (or it's `null`).
 */
export function ResolveFormToolbarConfig(
  base: FormToolbarConfig,
  config: EntityFormConfig | null | undefined,
): FormToolbarConfig {
  const override = config?.Toolbar;
  return override ? { ...base, ...override } : base;
}

/**
 * Minimal structural shape of the section-visibility rules. Both
 * {@link EntityFormConfig} and `FormContext` satisfy this, so the same helper
 * works whether driven by config directly or via the form context that reaches
 * every panel (including slot-injected `BaseFormPanel`s).
 *
 * Note: these property names stay camelCase to match the structural
 * {@link FormContext} interface that panels actually receive at runtime.
 */
export interface SectionVisibilityRules {
  showRelatedEntities?: boolean;
  hiddenSectionKeys?: string[];
  visibleSectionKeys?: string[];
}

/**
 * Whether a section should be hidden given the visibility rules:
 * - `visibleSectionKeys` (allow-list) hides anything not listed;
 * - else `hiddenSectionKeys` hides the listed keys;
 * - `showRelatedEntities === false` additionally hides related-entity panels.
 */
export function IsFormSectionHidden(
  config: SectionVisibilityRules | null | undefined,
  sectionKey: string,
  variant: string | undefined,
): boolean {
  if (!config) return false;
  const allow = config.visibleSectionKeys;
  const hide = config.hiddenSectionKeys;
  if (allow && allow.length > 0) {
    if (!allow.includes(sectionKey)) return true;
  } else if (hide && hide.includes(sectionKey)) {
    return true;
  }
  if (config.showRelatedEntities === false && variant === 'related-entity') return true;
  return false;
}
