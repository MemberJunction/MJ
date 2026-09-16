import { PSPanelKey } from './predictive-studio.types';

/**
 * Predictive Studio's nav was consolidated from 8 flat top-level Explorer nav items into **3 doors** —
 * `Predictions` (the business front door), `Studio` (the analyst workbench), and `Models` (registry +
 * production) — so a business user sees one item and analysts opt into the depth one click in. The two
 * workbench doors (`Studio`, `Models`) are single resources that host an internal left-nav swapping the
 * existing section panels (`ps-pipelines`, `ps-registry`, …). This module holds the **pure** section
 * descriptors + routing helpers for those hosts so the wiring is unit-testable independent of Angular.
 */

/** A section in a workbench door's internal left-nav. `group` is the optional left-nav group heading (''=ungrouped, rendered first). */
export interface PSSection {
  readonly key: PSPanelKey;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  readonly label: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  readonly icon: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  readonly group: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

/** Studio door — the build/run workbench: Overview, then Build (pipelines, algorithms) and Run (experiments, compare). */
export const STUDIO_SECTIONS: readonly PSSection[] = [
  { key: 'home', label: 'Overview', icon: 'fa-solid fa-gauge-high', group: '' },
  { key: 'pipelines', label: 'Training Pipelines', icon: 'fa-solid fa-diagram-project', group: 'Build' },
  { key: 'catalog', label: 'Algorithm Catalog', icon: 'fa-solid fa-shapes', group: 'Build' },
  { key: 'experiments', label: 'Experiments', icon: 'fa-solid fa-flask', group: 'Run' },
  { key: 'compare', label: 'Compare Runs', icon: 'fa-solid fa-chart-column', group: 'Run' },
];

/** Models door — the trained-model lifecycle: the registry and what's live in production. */
export const MODELS_SECTIONS: readonly PSSection[] = [
  { key: 'registry', label: 'Model Registry', icon: 'fa-solid fa-cubes', group: '' },
  { key: 'production', label: 'Models in Production', icon: 'fa-solid fa-satellite-dish', group: '' },
];

/** The nav-item Label of the Models door (must match `DefaultNavItems` in the application metadata). */
export const MODELS_NAV_LABEL = 'Models';

/** Distinct left-nav group headings for a section set, in first-seen order ('' = the ungrouped lead items). */
export function SectionGroups(sections: readonly PSSection[]): string[] {
  return [...new Set(sections.map((s) => s.group))];
}

/** @deprecated Use {@link SectionGroups}. */
export function sectionGroups(sections: readonly PSSection[]): string[] {
  return SectionGroups(sections);
}

/** The sections belonging to one left-nav group, preserving declaration order. */
export function SectionsInGroup(sections: readonly PSSection[], group: string): PSSection[] {
  return sections.filter((s) => s.group === group);
}

/** @deprecated Use {@link SectionsInGroup}. */
export function sectionsInGroup(sections: readonly PSSection[], group: string): PSSection[] {
  return SectionsInGroup(sections, group);
}

/** Resolve a section's display label (falls back to the key when unknown — never throws). */
export function SectionLabel(sections: readonly PSSection[], key: PSPanelKey): string {
  return sections.find((s) => s.key === key)?.label ?? key;
}

/** @deprecated Use {@link SectionLabel}. */
export function sectionLabel(sections: readonly PSSection[], key: PSPanelKey): string {
  return SectionLabel(sections, key);
}

/** Resolve a section's icon (falls back to a neutral default when unknown). */
export function SectionIcon(sections: readonly PSSection[], key: PSPanelKey): string {
  return sections.find((s) => s.key === key)?.icon ?? 'fa-solid fa-wand-magic-sparkles';
}

/** @deprecated Use {@link SectionIcon}. */
export function sectionIcon(sections: readonly PSSection[], key: PSPanelKey): string {
  return SectionIcon(sections, key);
}

/** Whether `key` is a section hosted inside the given door. */
export function HasSection(sections: readonly PSSection[], key: PSPanelKey): boolean {
  return sections.some((s) => s.key === key);
}

/** @deprecated Use {@link HasSection}. */
export function hasSection(sections: readonly PSSection[], key: PSPanelKey): boolean {
  return HasSection(sections, key);
}

/**
 * Where a Home("Overview")-panel `navigate(PSPanelKey)` intent should land now that the sections are
 * split across two doors:
 * - a Studio section (pipelines / catalog / experiments / compare) → switch the active section in-place;
 * - a Models section (registry / production) → cross-door switch to the Models app nav item, deep-linked
 *   to that section;
 * - `home` (or anything unmapped) → no-op (we're already on Studio's Overview).
 */
export type HomeNavTarget =
  | { readonly kind: 'section'; readonly key: PSPanelKey }
  | { readonly kind: 'app'; readonly navLabel: string; readonly section: PSPanelKey }
  | { readonly kind: 'none' };

export function RouteHomeNavigate(key: PSPanelKey): HomeNavTarget {
  if (key === 'home') return { kind: 'none' };
  if (HasSection(MODELS_SECTIONS, key)) return { kind: 'app', navLabel: MODELS_NAV_LABEL, section: key };
  if (HasSection(STUDIO_SECTIONS, key)) return { kind: 'section', key };
  return { kind: 'none' };
}

/** @deprecated Use {@link RouteHomeNavigate}. */
export function routeHomeNavigate(key: PSPanelKey): HomeNavTarget {
  return RouteHomeNavigate(key);
}
