/**
 * Shared form anchor navigation helper used by both anchored record comments and
 * Guided Tours (`@memberjunction/ng-tours`) to switch left-nav rail groups, expand
 * collapsible sections, wait for layout/expand settle, scroll the target into view,
 * optionally apply a highlight pulse, and resolve with the settled target element.
 */

export type FormAnchorType = 'Field' | 'Section' | 'RailGroup' | 'ToolbarAction';

export interface FormAnchorTargetRequest {
  AnchorType: FormAnchorType;
  AnchorKey: string;
  SectionKey?: string | null;
  GroupKey?: string | null;
  Pulse?: boolean;
  ScrollBehavior?: ScrollBehavior;
}

export interface FormAnchorPanelInfo {
  SectionKey: string;
  ClaimableFieldNames: readonly string[];
}

export interface FormAnchorChromeGroupInfo {
  Key: string;
  SectionKeys: readonly string[];
}

export interface FormAnchorHostAdapter {
  readonly HostElement: HTMLElement | null;
  readonly IsDestroyed?: boolean;
  readonly ChromeLayout: 'accordion' | 'left-nav';
  readonly MoreExpanded: boolean;
  readonly FirstClassGroups: readonly FormAnchorChromeGroupInfo[];
  readonly MoreItems: readonly FormAnchorChromeGroupInfo[];
  GetAllChromePanels(): readonly FormAnchorPanelInfo[];
  ActivateChromeGroup(groupKey: string): void;
  ToggleMoreFolder(): void;
  ExpandSection(sectionKey: string): void;
  DetectChanges(): void;
  /** Optional settle hook for deterministic testing or custom animations. */
  WaitForSettle?: () => Promise<void>;
}

/**
 * Contract exposed by a mounted `<mj-record-form-container>` so external semantic
 * resolvers (such as Guided Tours `FormField` / `FormSection` / `FormRailGroup` /
 * `FormToolbarAction`) can navigate and reveal targets cleanly.
 */
export interface FormAnchorNavigationTarget {
  readonly EntityName: string | null;
  NavigateToTourAnchor(req: FormAnchorTargetRequest): Promise<HTMLElement | null>;
}

const formAnchorContainersByElement = new WeakMap<HTMLElement, FormAnchorNavigationTarget>();
const activeFormAnchorContainers = new Set<{ Element: HTMLElement; Target: FormAnchorNavigationTarget }>();

/**
 * Registers an active `<mj-record-form-container>` host element with its navigation target.
 */
export function RegisterFormAnchorContainer(hostElement: HTMLElement, target: FormAnchorNavigationTarget): void {
  formAnchorContainersByElement.set(hostElement, target);
  for (const entry of activeFormAnchorContainers) {
    if (entry.Element === hostElement) {
      activeFormAnchorContainers.delete(entry);
    }
  }
  activeFormAnchorContainers.add({ Element: hostElement, Target: target });
}

/**
 * Removes a `<mj-record-form-container>` host element from the active container registry.
 */
export function UnregisterFormAnchorContainer(hostElement: HTMLElement): void {
  formAnchorContainersByElement.delete(hostElement);
  for (const entry of activeFormAnchorContainers) {
    if (entry.Element === hostElement) {
      activeFormAnchorContainers.delete(entry);
    }
  }
}

/**
 * Returns the navigation target registered for the given form container host element, if any.
 */
export function GetFormAnchorContainerForElement(element: HTMLElement | null): FormAnchorNavigationTarget | null {
  if (!element) {
    return null;
  }
  return formAnchorContainersByElement.get(element) ?? null;
}

/**
 * Finds the most recently registered active form container for a given entity name (case-insensitive).
 */
export function FindFormAnchorContainerByEntity(entityName: string): FormAnchorNavigationTarget | null {
  const normalized = entityName.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  let match: FormAnchorNavigationTarget | null = null;
  for (const entry of activeFormAnchorContainers) {
    if ((entry.Target.EntityName ?? '').trim().toLowerCase() === normalized) {
      match = entry.Target;
    }
  }
  return match;
}

/** One ~60ms post-change-detection settle frame so collapsible section height transitions start before measuring scroll geometry. */
const DEFAULT_SETTLE_DELAY_MS = 60;
/** Highlight pulse duration matching the record-comment anchor pulse animation (`1.8s`). */
const PULSE_DURATION_MS = 1800;
const PULSE_CLASS = 'mj-forms-comment-anchor-pulse';

/**
 * Navigates a record form container to a field, section, left-nav rail group, or toolbar action:
 * switches the active left-nav rail group if needed, expands the target collapsible section,
 * runs change detection, waits for layout/expand settle, scrolls the target into view, optionally
 * pulses it, and resolves with the settled `HTMLElement` (or `null` if not found / destroyed).
 */
export async function NavigateToFormAnchor(
  host: FormAnchorHostAdapter,
  req: FormAnchorTargetRequest
): Promise<HTMLElement | null> {
  const hostEl = host.HostElement;
  if (!hostEl || host.IsDestroyed) {
    return null;
  }

  const targetSectionKey = resolveTargetSectionKey(host, hostEl, req);

  if (host.ChromeLayout === 'left-nav') {
    activateRailGroupIfNeeded(host, req, targetSectionKey);
  }

  if (targetSectionKey) {
    host.ExpandSection(targetSectionKey);
  }

  host.DetectChanges();

  if (host.WaitForSettle) {
    await host.WaitForSettle();
  } else {
    await waitForLayoutSettle();
  }

  if (host.IsDestroyed) {
    return null;
  }

  const targetEl = locateTargetElement(hostEl, req, targetSectionKey);
  if (!targetEl) {
    return null;
  }

  if (typeof targetEl.scrollIntoView === 'function') {
    targetEl.scrollIntoView({
      behavior: req.ScrollBehavior ?? 'smooth',
      block: 'center',
    });
  }

  if (req.Pulse) {
    targetEl.classList.add(PULSE_CLASS);
    setTimeout(() => {
      targetEl.classList.remove(PULSE_CLASS);
    }, PULSE_DURATION_MS);
  }

  return targetEl;
}

/**
 * Convenience static wrapper around {@link NavigateToFormAnchor}.
 */
export class FormAnchorNavigator {
  public static Navigate(
    host: FormAnchorHostAdapter,
    req: FormAnchorTargetRequest
  ): Promise<HTMLElement | null> {
    return NavigateToFormAnchor(host, req);
  }
}

function resolveTargetSectionKey(
  host: FormAnchorHostAdapter,
  hostEl: HTMLElement,
  req: FormAnchorTargetRequest
): string {
  let targetSectionKey = (req.SectionKey ?? '').trim();
  if (!targetSectionKey && req.AnchorType === 'Section' && req.AnchorKey) {
    targetSectionKey = req.AnchorKey.trim();
  }
  if (!targetSectionKey && req.AnchorType === 'Field' && req.AnchorKey) {
    const fKeyLower = req.AnchorKey.trim().toLowerCase();
    for (const panel of host.GetAllChromePanels()) {
      if (panel.ClaimableFieldNames.some((n) => n.toLowerCase() === fKeyLower)) {
        targetSectionKey = panel.SectionKey;
        break;
      }
    }
    if (!targetSectionKey) {
      const escapedField = escapeCssAttrValue(req.AnchorKey.trim());
      const fieldEl = hostEl.querySelector(`[data-field-name="${escapedField}"]`);
      const closestPanel = fieldEl?.closest?.('mj-collapsible-panel[data-section-key]');
      if (closestPanel) {
        targetSectionKey = closestPanel.getAttribute('data-section-key')?.trim() ?? '';
      }
    }
  }
  return targetSectionKey;
}

function activateRailGroupIfNeeded(
  host: FormAnchorHostAdapter,
  req: FormAnchorTargetRequest,
  targetSectionKey: string
): void {
  const explicitGroupKey = (req.GroupKey ?? '').trim();
  const railAnchorKey = req.AnchorType === 'RailGroup' ? req.AnchorKey.trim() : '';
  const groupKey = explicitGroupKey || railAnchorKey;
  const groupKeyLower = groupKey.toLowerCase();
  const sectionKeyLower = targetSectionKey.toLowerCase();

  const matchesGroup = (g: FormAnchorChromeGroupInfo): boolean =>
    (groupKeyLower !== '' && g.Key.toLowerCase() === groupKeyLower) ||
    (sectionKeyLower !== '' && g.SectionKeys.some((k) => k.toLowerCase() === sectionKeyLower));

  const firstClassMatch = host.FirstClassGroups.find(matchesGroup);
  if (firstClassMatch) {
    host.ActivateChromeGroup(firstClassMatch.Key);
    return;
  }

  const moreMatch = host.MoreItems.find(matchesGroup);
  if (moreMatch) {
    if (!host.MoreExpanded) {
      host.ToggleMoreFolder();
    }
    host.ActivateChromeGroup(moreMatch.Key);
  }
}

function locateTargetElement(
  hostEl: HTMLElement,
  req: FormAnchorTargetRequest,
  targetSectionKey: string
): HTMLElement | null {
  const anchorKey = req.AnchorKey.trim();

  if (req.AnchorType === 'Field' && anchorKey) {
    const escaped = escapeCssAttrValue(anchorKey);
    const exact =
      hostEl.querySelector<HTMLElement>(`mj-form-field[data-field-name="${escaped}"] .mj-forms-field`) ??
      hostEl.querySelector<HTMLElement>(`[data-field-name="${escaped}"]`);
    if (exact) return exact;
    return queryByAttributeCaseInsensitive(hostEl, 'data-field-name', anchorKey);
  }

  if (req.AnchorType === 'Section') {
    const secKey = targetSectionKey || anchorKey;
    if (!secKey) return null;
    const escaped = escapeCssAttrValue(secKey);
    const exact =
      hostEl.querySelector<HTMLElement>(`mj-collapsible-panel[data-section-key="${escaped}"] .mj-forms-panel`) ??
      hostEl.querySelector<HTMLElement>(`[data-section-key="${escaped}"]`);
    if (exact) return exact;
    return queryByAttributeCaseInsensitive(hostEl, 'data-section-key', secKey);
  }

  if (req.AnchorType === 'RailGroup') {
    const railKey = (req.GroupKey ?? '').trim() || anchorKey;
    if (!railKey) return null;
    const escaped = escapeCssAttrValue(railKey);
    const exact = hostEl.querySelector<HTMLElement>(`[data-rail-key="${escaped}"]`);
    if (exact) return exact;
    return queryByAttributeCaseInsensitive(hostEl, 'data-rail-key', railKey);
  }

  if (req.AnchorType === 'ToolbarAction' && anchorKey) {
    const escaped = escapeCssAttrValue(anchorKey);
    const explicitAttr = hostEl.querySelector<HTMLElement>(`[data-form-toolbar-action="${escaped}"]`);
    if (explicitAttr) return explicitAttr;

    const btnClassMatch = hostEl.querySelector<HTMLElement>(`mj-form-toolbar .mj-forms-btn--${escaped}`);
    if (btnClassMatch) return btnClassMatch;

    if (anchorKey.toLowerCase() === 'edit') {
      const collapsedEdit = hostEl.querySelector<HTMLElement>('mj-form-toolbar .mj-forms-collapsed-btn--edit');
      if (collapsedEdit) return collapsedEdit;
    }
  }

  return null;
}

function queryByAttributeCaseInsensitive(
  hostEl: HTMLElement,
  attrName: string,
  expectedValue: string
): HTMLElement | null {
  const lower = expectedValue.toLowerCase();
  const candidates = hostEl.querySelectorAll<HTMLElement>(`[${attrName}]`);
  for (let i = 0; i < candidates.length; i++) {
    const el = candidates[i];
    if ((el.getAttribute(attrName) ?? '').trim().toLowerCase() === lower) {
      return el;
    }
  }
  return null;
}

function escapeCssAttrValue(value: string): string {
  return value.replace(/["\\]/g, '\\$&');
}

function waitForLayoutSettle(): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(() => {
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => resolve());
      } else {
        resolve();
      }
    }, DEFAULT_SETTLE_DELAY_MS);
  });
}
