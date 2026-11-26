/**
 * Stage-1 one-script classic IIFE entry (`dist/element/mj-tours.js`).
 *
 *   <script src="https://cdn.example.org/mj-tours.js"
 *           data-surface-key="ts_live_xxx" data-api-url="https://api.example.org"></script>
 *
 * Contains ZERO `@angular/*`, `rxjs`, `zone.js`, or `@memberjunction/*` runtime imports.
 */
import { SetTourShellScriptUrl } from './shell/session-loader';
import { MountTours, RegisterAnchor, RegisterTourElements } from './shell/shell-element';

const currentScript = typeof document !== 'undefined' ? document.currentScript : null;
SetTourShellScriptUrl(currentScript instanceof HTMLScriptElement ? currentScript.src : null);

RegisterTourElements();

if (currentScript instanceof HTMLScriptElement) {
  const surfaceKey = currentScript.getAttribute('data-surface-key');
  const apiUrl = currentScript.getAttribute('data-api-url');
  const locale = currentScript.getAttribute('data-locale');
  const autoStartTourKey = currentScript.getAttribute('data-auto-start-tour-key');
  if (surfaceKey || apiUrl || autoStartTourKey) {
    void MountTours({
      SurfaceKey: surfaceKey ?? undefined,
      ApiUrl: apiUrl ?? undefined,
      Locale: locale ?? undefined,
      AutoStartTourKey: autoStartTourKey ?? undefined,
    });
  }
}

if (typeof globalThis !== 'undefined') {
  (globalThis as Record<string, unknown>)['MJTours'] = {
    RegisterTourElements,
    MountTours,
    RegisterAnchor,
  };
}

export { RegisterTourElements, MountTours, RegisterAnchor };
