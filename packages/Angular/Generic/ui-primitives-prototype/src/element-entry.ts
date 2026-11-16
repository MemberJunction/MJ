import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { ApplicationRef, provideZonelessChangeDetection, Type } from '@angular/core';
import { MJSurfaceComponent } from './lib/surface/surface.component';
import { MJLayerComponent } from './lib/layer/layer.component';
import { MJRowComponent } from './lib/row/row.component';
import { PROTOTYPE_CSS } from './lib/styles/prototype-css.generated';

const STYLE_LINK_SELECTOR = 'link[href*="mj-wave0-prototype.css"]';
const STYLE_ELEMENT_ID = 'mj-wave0-prototype-styles';

function ensureStylesLoaded(): void {
  if (typeof document === 'undefined') {
    return;
  }
  // Prefer an external <link rel="stylesheet"> when present (strict CSP: no unsafe-inline).
  if (document.querySelector(STYLE_LINK_SELECTOR) || document.getElementById(STYLE_ELEMENT_ID)) {
    return;
  }
  const style = document.createElement('style');
  style.id = STYLE_ELEMENT_ID;

  const nonceMeta = document.querySelector<HTMLMetaElement>('meta[name="csp-nonce"]');
  const scriptNonce = document.currentScript?.getAttribute('nonce');
  const nonce = nonceMeta?.content || scriptNonce || '';
  if (nonce) {
    style.setAttribute('nonce', nonce);
  }

  style.textContent = PROTOTYPE_CSS;
  document.head.prepend(style);
}

function defineElement<T>(appRef: ApplicationRef, tag: string, component: Type<T>): void {
  if (customElements.get(tag)) {
    return;
  }
  const ctor = createCustomElement(component, {
    injector: appRef.injector,
  });
  customElements.define(tag, ctor);
}

async function definePrototypeElements(): Promise<void> {
  ensureStylesLoaded();

  const app = await createApplication({
    providers: [provideZonelessChangeDetection()],
  });

  defineElement(app, 'mj-surface', MJSurfaceComponent);
  defineElement(app, 'mj-row', MJRowComponent);
  defineElement(app, 'mj-layer', MJLayerComponent);
}

void definePrototypeElements();
