import { isDevMode } from '@angular/core';

/** Warn once per application, not once per strip — the fix is app-level either way. */
let warned = false;

/**
 * Dev-mode guard for the tab chrome's one genuine failure mode: the `.mj-tabs*` styles live in a
 * GLOBAL stylesheet (`@memberjunction/ng-ui-components/dist/lib/tabs/tabs.scss`), and a standalone
 * host that forgets the import gets structurally-working but completely unstyled strips — bare divs,
 * silently, with no error anywhere. This turns that silence into an actionable console warning.
 *
 * Detection: `tabs.scss` sets `--mj-tabs-chrome-loaded: 1` on `.mj-tabs`. If the computed value is
 * absent on a rendered strip, the sheet isn't in the page. Dev-mode only, once per app, and never
 * throws — a missing stylesheet must not take the component down with it.
 *
 * Called by BOTH strips (`mj-tabstrip` and `mj-workspace-tab-strip`) after view init.
 */
export function warnIfTabChromeMissing(element: HTMLElement | null | undefined): void {
  if (warned || !isDevMode() || !element || typeof getComputedStyle !== 'function') {
    return;
  }
  try {
    const target = element.classList.contains('mj-tabs') ? element : element.querySelector<HTMLElement>('.mj-tabs');
    if (!target) return;
    if (!getComputedStyle(target).getPropertyValue('--mj-tabs-chrome-loaded').trim()) {
      warned = true;
      console.warn(
        "[MJ tabs] The shared tab chrome stylesheet is not loaded, so tab strips will render unstyled. " +
        "Add to your app's global stylesheet:\n" +
        "  @import '@memberjunction/ng-ui-components/dist/lib/tabs/tabs';\n" +
        "(Apps on the MJ Explorer shell get this via ng-explorer-app's styles automatically.)"
      );
    }
  } catch {
    // Never let diagnostics break the strip.
  }
}
