/**
 * @fileoverview Browser DOM implementation of `ITourAnchorDomBridge` covering all 13
 * anchor resolution strategies (§7) and `FormAnchorNavigator` settle integration.
 * @module @memberjunction/ng-tours
 */

import {
  FindFormAnchorContainerByEntity,
  GetFormAnchorContainerForElement,
  type FormAnchorType,
} from '@memberjunction/ng-base-forms';
import type {
  ITourAnchor,
  ITourAnchorDomBridge,
  TourAnchorResolution,
  TourResolvedAnchorInfo,
  TourVisibleAnchorInfo,
} from '@memberjunction/tours-runtime';
import { AnchorRegistry, ComputeAccessibleName, IsElementVisible } from './anchor-registry';

export interface ResolvedDomAnchor {
  Element: HTMLElement | null;
  Info: TourResolvedAnchorInfo;
}

/** Default timeout waiting for lazy-mounted view/form anchors before falling back to OnMissing behavior. */
const DEFAULT_WAIT_MS = 5000;

/**
 * Resolves tour anchor descriptors in the live browser DOM across all 13 strategies:
 * `Registered`, `FormField`, `FormSection`, `FormRailGroup`, `FormToolbarAction`,
 * `NavItem`, `RailPage`, `AppSwitcher`, `GridColumn`, `Omnibar`, `ChatComposer`, `Role`, `Selector`.
 */
export class DomTourAnchorBridge implements ITourAnchorDomBridge {
  private readonly _registry: AnchorRegistry;
  private readonly _onHighlight?: (element: HTMLElement, anchorKey: string, caption?: string) => void;

  constructor(options?: {
    Registry?: AnchorRegistry;
    OnHighlight?: (element: HTMLElement, anchorKey: string, caption?: string) => void;
  }) {
    this._registry = options?.Registry ?? AnchorRegistry.Instance;
    this._onHighlight = options?.OnHighlight;
  }

  public async ResolveAnchor(anchor: ITourAnchor, timeoutMs?: number): Promise<TourResolvedAnchorInfo> {
    const resolved = await this.ResolveElement(anchor, timeoutMs);
    return resolved.Info;
  }

  /**
   * Resolves both the {@link TourResolvedAnchorInfo} and the concrete settled `HTMLElement`.
   * Form-scoped strategies await `FormAnchorNavigator` settle before resolving.
   */
  public async ResolveElement(anchor: ITourAnchor, timeoutMs?: number): Promise<ResolvedDomAnchor> {
    const waitMs = typeof timeoutMs === 'number' ? timeoutMs : anchor.WaitTimeoutMs ?? DEFAULT_WAIT_MS;
    const strategy = anchor.Strategy;

    if (strategy === 'Registered') {
      const key = anchor.Key?.trim() ?? '';
      if (!key) {
        return failedResult('Registered', 'Registered anchor is missing Key.');
      }
      const el = await this._registry.WaitFor(key, waitMs);
      if (el) {
        return foundResult('Registered', el, key);
      }
      return failedResult('Registered', `Registered anchor '${key}' was not found within ${waitMs}ms.`);
    }

    if (
      strategy === 'FormField' ||
      strategy === 'FormSection' ||
      strategy === 'FormRailGroup' ||
      strategy === 'FormToolbarAction'
    ) {
      const el = await this.resolveFormAnchor(anchor);
      if (el) {
        return foundResult('Semantic', el, describeSemanticKey(anchor));
      }
      return failedResult('Semantic', `Form anchor '${describeSemanticKey(anchor)}' did not resolve.`);
    }

    if (strategy === 'NavItem') {
      const el = await this.waitForSelectorList(navItemSelectors(anchor), Math.min(waitMs, 1500));
      return el
        ? foundResult('Semantic', el, anchor.NavItemKey ?? anchor.DriverClass ?? 'nav-item')
        : failedResult('Semantic', 'NavItem anchor did not match any element.');
    }

    if (strategy === 'RailPage') {
      const pageId = anchor.PageId?.trim();
      if (!pageId) {
        return failedResult('Semantic', 'RailPage anchor is missing PageId.');
      }
      const esc = escapeAttr(pageId);
      const el = await this.waitForSelectorList(
        [`[data-rail-page-id="${esc}"]`, `[data-page-id="${esc}"]`],
        Math.min(waitMs, 1500),
      );
      return el
        ? foundResult('Semantic', el, pageId)
        : failedResult('Semantic', `RailPage '${pageId}' did not resolve.`);
    }

    if (strategy === 'AppSwitcher') {
      const appEsc = anchor.AppName ? escapeAttr(anchor.AppName.trim()) : null;
      const selectors = appEsc
        ? [
            `[data-mj-tour-anchor="core.shell.app-switcher"][data-app-name="${appEsc}"]`,
            `[data-app-name="${appEsc}"]`,
            '[data-mj-tour-anchor="core.shell.app-switcher"]',
          ]
        : ['[data-mj-tour-anchor="core.shell.app-switcher"]'];
      const el = await this.waitForSelectorList(selectors, Math.min(waitMs, 1500));
      return el
        ? foundResult('Semantic', el, anchor.AppName ?? 'core.shell.app-switcher')
        : failedResult('Semantic', 'AppSwitcher anchor did not resolve.');
    }

    if (strategy === 'GridColumn') {
      const col = anchor.ColumnKey?.trim();
      if (!col) {
        return failedResult('Semantic', 'GridColumn anchor is missing ColumnKey.');
      }
      const esc = escapeAttr(col);
      const el = await this.waitForSelectorList(
        [
          `[data-column-key="${esc}"]`,
          `th[data-field-name="${esc}"]`,
          `[col-id="${esc}"]`,
          `[data-field="${esc}"]`,
        ],
        Math.min(waitMs, 1500),
      );
      return el
        ? foundResult('Semantic', el, col)
        : failedResult('Semantic', `GridColumn '${col}' did not resolve.`);
    }

    if (strategy === 'Omnibar') {
      const el = await this.waitForSelectorList(
        ['[data-mj-tour-anchor="core.shell.omnibar"]'],
        Math.min(waitMs, 1500),
      );
      return el
        ? foundResult('Semantic', el, 'core.shell.omnibar')
        : failedResult('Semantic', 'Omnibar anchor did not resolve.');
    }

    if (strategy === 'ChatComposer') {
      const el = await this.waitForSelectorList(
        ['[data-mj-tour-anchor="core.chat.composer"]', 'mj-chat-composer', '[data-mj-chat-composer]'],
        Math.min(waitMs, 1500),
      );
      return el
        ? foundResult('Semantic', el, 'core.chat.composer')
        : failedResult('Semantic', 'ChatComposer anchor did not resolve.');
    }

    if (strategy === 'Role') {
      const role = anchor.Role?.trim();
      if (!role) {
        return failedResult('Role', 'Role anchor is missing Role.');
      }
      const el = findByRoleAndName(role, anchor.Name);
      return el
        ? foundResult('Role', el, `${role}${anchor.Name ? `:${anchor.Name}` : ''}`)
        : failedResult('Role', `Role anchor '${role}' (${anchor.Name ?? '*'}) did not match.`);
    }

    if (strategy === 'Selector') {
      const selector = anchor.Selector?.trim();
      if (!selector) {
        return failedResult('Selector', 'Selector anchor is missing Selector.');
      }
      const el = typeof document !== 'undefined' ? document.querySelector<HTMLElement>(selector) : null;
      return el && IsElementVisible(el)
        ? foundResult('Selector', el, selector)
        : failedResult('Selector', `Selector '${selector}' did not match a visible element.`);
    }

    return failedResult('Failed', `Unsupported anchor strategy '${strategy}'.`);
  }

  public GetVisibleAnchors(): TourVisibleAnchorInfo[] {
    return this._registry.GetVisibleAnchors();
  }

  public async HighlightAnchor(
    anchorKey: string,
    caption?: string,
  ): Promise<{ Success: boolean; ErrorMessage?: string }> {
    const resolved = await this.ResolveElement({ Strategy: 'Registered', Key: anchorKey }, 250);
    if (!resolved.Info.Found || !resolved.Element) {
      return {
        Success: false,
        ErrorMessage: resolved.Info.FailureReason ?? `Anchor '${anchorKey}' is not visible on screen.`,
      };
    }
    this._onHighlight?.(resolved.Element, anchorKey, caption);
    return { Success: true };
  }

  public async WaitForAnchorInteraction(
    anchor: ITourAnchor,
    interaction: 'click' | 'focus' | 'change' | 'input' | 'any',
    signal?: AbortSignal,
  ): Promise<boolean> {
    if (signal?.aborted) {
      return false;
    }

    const resolved = await this.ResolveElement(anchor);
    const target = resolved.Element;
    if (!target) {
      return false;
    }

    const eventNames: string[] =
      interaction === 'any'
        ? ['click', 'focusin', 'change', 'input']
        : interaction === 'focus'
          ? ['focus', 'focusin']
          : [interaction];

    return new Promise<boolean>((resolve) => {
      let done = false;
      const cleanup = (): void => {
        for (const evt of eventNames) {
          target.removeEventListener(evt, onEvent, true);
        }
        signal?.removeEventListener('abort', onAbort);
      };

      const finish = (matched: boolean): void => {
        if (done) {
          return;
        }
        done = true;
        cleanup();
        resolve(matched);
      };

      const onEvent = (): void => finish(true);
      const onAbort = (): void => finish(false);

      for (const evt of eventNames) {
        target.addEventListener(evt, onEvent, true);
      }
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  public GetFieldValue(entityName: string | undefined, fieldName: string): unknown {
    if (typeof document === 'undefined' || !fieldName.trim()) {
      return undefined;
    }
    const esc = escapeAttr(fieldName.trim());
    let scope: ParentNode = document;
    if (entityName?.trim()) {
      const entityEsc = escapeAttr(entityName.trim());
      const entityForm = document.querySelector(`[data-entity-name="${entityEsc}"]`);
      if (entityForm) {
        scope = entityForm;
      }
    }

    const fieldHost =
      scope.querySelector<HTMLElement>(`mj-form-field[data-field-name="${esc}"]`) ??
      scope.querySelector<HTMLElement>(`[data-field-name="${esc}"]`);
    if (!fieldHost) {
      return undefined;
    }

    const input = fieldHost.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      'input, textarea, select',
    );
    if (!input) {
      return fieldHost.getAttribute('data-field-value') ?? fieldHost.textContent?.trim();
    }
    if (input instanceof HTMLInputElement && (input.type === 'checkbox' || input.type === 'radio')) {
      return input.checked;
    }
    return input.value;
  }

  private async resolveFormAnchor(anchor: ITourAnchor): Promise<HTMLElement | null> {
    const anchorType = toFormAnchorType(anchor.Strategy);
    const anchorKey = resolveFormAnchorKey(anchor);
    if (!anchorType || !anchorKey) {
      return null;
    }

    let container = anchor.Entity?.trim() ? FindFormAnchorContainerByEntity(anchor.Entity.trim()) : null;
    if (!container && typeof document !== 'undefined') {
      const fallbackHost = document.querySelector<HTMLElement>('mj-record-form-container');
      container = GetFormAnchorContainerForElement(fallbackHost);
    }

    if (container) {
      const navigated = await container.NavigateToTourAnchor({
        AnchorType: anchorType,
        AnchorKey: anchorKey,
        SectionKey: anchor.SectionKey,
        GroupKey: anchor.RailKey,
        Pulse: false,
      });
      if (navigated && IsElementVisible(navigated)) {
        return navigated;
      }
    }

    if (typeof document === 'undefined') {
      return null;
    }

    const esc = escapeAttr(anchorKey);
    if (anchorType === 'Field') {
      const direct =
        document.querySelector<HTMLElement>(`mj-form-field[data-field-name="${esc}"] .mj-forms-field`) ??
        document.querySelector<HTMLElement>(`[data-field-name="${esc}"]`);
      return direct && IsElementVisible(direct) ? direct : null;
    }
    if (anchorType === 'Section') {
      const direct =
        document.querySelector<HTMLElement>(`mj-collapsible-panel[data-section-key="${esc}"] .mj-forms-panel`) ??
        document.querySelector<HTMLElement>(`[data-section-key="${esc}"]`);
      return direct && IsElementVisible(direct) ? direct : null;
    }
    if (anchorType === 'RailGroup') {
      const direct = document.querySelector<HTMLElement>(`[data-rail-key="${esc}"]`);
      return direct && IsElementVisible(direct) ? direct : null;
    }
    if (anchorType === 'ToolbarAction') {
      const direct =
        document.querySelector<HTMLElement>(`[data-form-toolbar-action="${esc}"]`) ??
        document.querySelector<HTMLElement>(`mj-form-toolbar .mj-forms-btn--${esc}`);
      return direct && IsElementVisible(direct) ? direct : null;
    }

    return null;
  }

  private async waitForSelectorList(selectors: string[], timeoutMs: number): Promise<HTMLElement | null> {
    if (typeof document === 'undefined' || selectors.length === 0) {
      return null;
    }

    const findNow = (): HTMLElement | null => {
      for (const selector of selectors) {
        const el = document.querySelector<HTMLElement>(selector);
        if (el && IsElementVisible(el)) {
          return el;
        }
      }
      return null;
    };

    const immediate = findNow();
    if (immediate || timeoutMs <= 0 || typeof MutationObserver === 'undefined' || !document.body) {
      return immediate;
    }

    return new Promise<HTMLElement | null>((resolve) => {
      let settled = false;
      const observer = new MutationObserver(() => {
        const hit = findNow();
        if (hit) {
          finish(hit);
        }
      });

      const finish = (el: HTMLElement | null): void => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        observer.disconnect();
        resolve(el);
      };

      observer.observe(document.body, { childList: true, subtree: true, attributes: true });
      const timer = setTimeout(() => finish(findNow()), timeoutMs);
    });
  }
}

function foundResult(
  resolution: TourAnchorResolution,
  el: HTMLElement,
  anchorKey: string,
): ResolvedDomAnchor {
  return {
    Element: el,
    Info: {
      Found: true,
      Resolution: resolution,
      AnchorKey: anchorKey,
      AccessibleName: ComputeAccessibleName(el) || anchorKey,
    },
  };
}

function failedResult(resolution: TourAnchorResolution, reason: string): ResolvedDomAnchor {
  return {
    Element: null,
    Info: {
      Found: false,
      Resolution: resolution,
      FailureReason: reason,
    },
  };
}

function toFormAnchorType(strategy: string): FormAnchorType | null {
  if (strategy === 'FormField') return 'Field';
  if (strategy === 'FormSection') return 'Section';
  if (strategy === 'FormRailGroup') return 'RailGroup';
  if (strategy === 'FormToolbarAction') return 'ToolbarAction';
  return null;
}

function resolveFormAnchorKey(anchor: ITourAnchor): string {
  if (anchor.Strategy === 'FormField') return anchor.Field?.trim() ?? '';
  if (anchor.Strategy === 'FormSection') return anchor.SectionKey?.trim() ?? '';
  if (anchor.Strategy === 'FormRailGroup') return anchor.RailKey?.trim() ?? '';
  if (anchor.Strategy === 'FormToolbarAction') return anchor.ActionKey?.trim() ?? '';
  return '';
}

function describeSemanticKey(anchor: ITourAnchor): string {
  const key = resolveFormAnchorKey(anchor);
  return anchor.Entity ? `${anchor.Entity}.${key}` : key;
}

function navItemSelectors(anchor: ITourAnchor): string[] {
  const out: string[] = [];
  if (anchor.NavItemKey?.trim()) {
    const esc = escapeAttr(anchor.NavItemKey.trim());
    out.push(`[data-mj-nav-key="${esc}"]`, `[data-nav-item-key="${esc}"]`);
  }
  if (anchor.DriverClass?.trim()) {
    const esc = escapeAttr(anchor.DriverClass.trim());
    out.push(`[data-driver-class="${esc}"]`, `[data-mj-driver-class="${esc}"]`);
  }
  return out;
}

function findByRoleAndName(role: string, expectedName?: string): HTMLElement | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const normalizedRole = role.toLowerCase();
  const implicitSelectors: Record<string, string> = {
    button: 'button, input[type="button"], input[type="submit"], input[type="reset"]',
    link: 'a[href]',
    textbox: 'input:not([type]), input[type="text"], input[type="email"], input[type="search"], textarea',
    spinbutton: 'input[type="number"]',
    combobox: 'select',
    checkbox: 'input[type="checkbox"]',
    radio: 'input[type="radio"]',
    navigation: 'nav',
    main: 'main',
    dialog: 'dialog',
  };

  const selector = implicitSelectors[normalizedRole]
    ? `[role="${escapeAttr(normalizedRole)}"], ${implicitSelectors[normalizedRole]}`
    : `[role="${escapeAttr(normalizedRole)}"]`;

  const candidates = document.querySelectorAll<HTMLElement>(selector);
  const wantedName = expectedName?.trim().toLowerCase();
  for (let i = 0; i < candidates.length; i++) {
    const el = candidates[i];
    if (!IsElementVisible(el)) {
      continue;
    }
    if (!wantedName) {
      return el;
    }
    const name = ComputeAccessibleName(el).toLowerCase();
    if (name === wantedName || name.includes(wantedName)) {
      return el;
    }
  }
  return null;
}

function escapeAttr(value: string): string {
  return value.replace(/["\\]/g, '\\$&');
}
