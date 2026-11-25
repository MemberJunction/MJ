/**
 * Browser entry for the `<mj-comms-preference-center>` Angular Element.
 * Bundled with the Angular linker (see scripts/build-element.mjs) so the
 * preference center host page does not need `unsafe-eval` / JIT.
 */
import 'zone.js';
import { CSP_NONCE, provideZoneChangeDetection } from '@angular/core';
import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { CommsPreferenceCenterComponent } from '../dist/lib/comms-preference-center.component.js';

function readCspNonce(): string {
  const host = document.querySelector('mj-comms-preference-center');
  const fromHost = host?.getAttribute('csp-nonce') || host?.getAttribute('ngcspnonce');
  if (fromHost) {
    return fromHost;
  }
  const tagged = document.querySelector<HTMLElement>('script[nonce], style[nonce]');
  return tagged?.nonce || tagged?.getAttribute('nonce') || '';
}

void createApplication({
  providers: [
    provideZoneChangeDetection(),
    { provide: CSP_NONCE, useFactory: readCspNonce },
  ],
})
  .then((app) => {
    if (!customElements.get('mj-comms-preference-center')) {
      const el = createCustomElement(CommsPreferenceCenterComponent, { injector: app.injector });
      customElements.define('mj-comms-preference-center', el);
    }
  })
  .catch((err: unknown) => {
    console.error('[mj-comms-preference-center] bootstrap failed', err);
  });
