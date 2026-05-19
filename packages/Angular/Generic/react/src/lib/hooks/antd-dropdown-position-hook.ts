/**
 * @fileoverview Runtime hook that fixes antd dropdown positioning
 * when running inside Angular's CSS transform context.
 *
 * antd's popup positioning (via rc-trigger / dom-align) calculates wrong
 * coordinates inside Angular because Angular applies CSS transforms that
 * break getBoundingClientRect-based positioning. This hook:
 *
 * 1. Injects a CSS rule using !important with CSS custom properties to
 *    override antd's inline left/top values. The fallback (-9999px) hides
 *    dropdowns until positioned, preventing flash-of-wrong-position.
 *
 * 2. Creates a MutationObserver that catches dropdown elements when
 *    added to the DOM and sets the CSS variables to correct viewport-
 *    relative coordinates based on the trigger element's position.
 *
 * This hook is Angular-specific and should only be registered when
 * running inside an Angular host application.
 *
 * @module @memberjunction/ng-react
 */
import { RuntimeHook, RootHookContext } from '@memberjunction/react-runtime';

const DROPDOWN_SELECTOR = '.ant-select-dropdown, .ant-picker-dropdown, .ant-cascader-dropdown';
const TRIGGER_SELECTOR = '.ant-select-open, .ant-picker-focused, .ant-dropdown-open';

/**
 * Creates a RuntimeHook that fixes antd dropdown positioning inside Angular.
 * Uses position:absolute (antd's default) rather than position:fixed to
 * preserve antd's virtual scroll behavior inside dropdown panels.
 */
export function createAntdDropdownPositionHook(): RuntimeHook {
  let observer: MutationObserver | null = null;
  let styleElement: HTMLStyleElement | null = null;

  const fixDropdown = (dd: HTMLElement): void => {
    if (dd.hasAttribute('data-pos-fixed')) return;
    const trigger = document.querySelector(TRIGGER_SELECTOR);
    if (!trigger) return;

    const tRect = trigger.getBoundingClientRect();
    const op = dd.offsetParent as HTMLElement | null;

    if (op) {
      // Position relative to offset parent (keeps position:absolute working)
      const opRect = op.getBoundingClientRect();
      dd.style.setProperty('--dd-left', `${tRect.left - opRect.left}px`);
      dd.style.setProperty('--dd-top', `${tRect.bottom - opRect.top + 2}px`);
    } else {
      // No offset parent — fall back to viewport coordinates
      dd.style.setProperty('--dd-left', `${tRect.left}px`);
      dd.style.setProperty('--dd-top', `${tRect.bottom + 2}px`);
    }
    dd.setAttribute('data-pos-fixed', '1');
  };

  return {
    name: 'antd-dropdown-position-fix',

    OnFirstRootCreated(_context: RootHookContext): void {
      if (typeof document === 'undefined') return;

      // CSS !important overrides antd's inline left/top permanently.
      // CSS custom properties (--dd-left, --dd-top) are set per-element from JS.
      // Fallback of -9999px hides dropdowns until the observer positions them.
      styleElement = document.createElement('style');
      styleElement.textContent =
        DROPDOWN_SELECTOR +
        ' { left: var(--dd-left, -9999px) !important; top: var(--dd-top, -9999px) !important; z-index: 99999 !important; }';
      document.head.appendChild(styleElement);

      // Watch for dropdown elements being added to the DOM.
      // Only watches childList (not attributes) to avoid firing during scroll/hover.
      observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
          const addedNodes = Array.from(m.addedNodes);
          for (const node of addedNodes) {
            if (node.nodeType !== 1) continue;
            const el = node as HTMLElement;

            // Check if the added node itself is a dropdown
            if (el.className && typeof el.className === 'string' &&
                /\bant-(select|picker|cascader)-dropdown\b/.test(el.className)) {
              fixDropdown(el);
            }

            // Check descendants (dropdown may be nested inside a wrapper)
            if (el.querySelectorAll) {
              const nested = el.querySelectorAll(DROPDOWN_SELECTOR);
              nested.forEach((n) => fixDropdown(n as HTMLElement));
            }
          }
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });
    },

    OnCleanup(): void {
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      if (styleElement && styleElement.parentNode) {
        styleElement.parentNode.removeChild(styleElement);
        styleElement = null;
      }
    }
  };
}
