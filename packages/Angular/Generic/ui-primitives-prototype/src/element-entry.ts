import 'zone.js';
import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { ApplicationRef, provideZoneChangeDetection, Type } from '@angular/core';
import { MJSurfaceComponent } from './lib/surface/surface.component';
import { MJLayerComponent } from './lib/layer/layer.component';
import { MJRowComponent } from './lib/row/row.component';
import { PROTOTYPE_CSS } from './lib/styles/prototype-css.generated';

const STYLE_ELEMENT_ID = 'mj-wave0-prototype-styles';

function injectLayeredStyles(): void {
  if (typeof document === 'undefined') {
    return;
  }
  if (document.getElementById(STYLE_ELEMENT_ID)) {
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

const ELEMENT_ATTR_MAPS: Record<string, Record<string, string>> = {
  'mj-surface': {
    level: 'Level',
    elevation: 'Elevation',
    interactive: 'Interactive',
    selected: 'Selected',
    padding: 'Padding',
    tone: 'Tone',
    'mj-role': 'VisualRole',
  },
  'mj-row': {
    density: 'Density',
    interactive: 'Interactive',
    selected: 'Selected',
    disabled: 'Disabled',
    tone: 'Tone',
    'mj-role': 'VisualRole',
  },
  'mj-layer': {
    kind: 'Kind',
    placement: 'Placement',
    modal: 'Modal',
    closeable: 'Closeable',
    size: 'Size',
    open: 'Open',
    'allow-phone-sheet': 'AllowPhoneSheet',
    label: 'Label',
    'announce-on-open': 'AnnounceOnOpen',
  },
};

function syncElementAttributes(el: Element): void {
  const attrMap = ELEMENT_ATTR_MAPS[el.tagName.toLowerCase()];
  if (!attrMap) {
    return;
  }
  for (const [attr, prop] of Object.entries(attrMap)) {
    if (el.hasAttribute(attr)) {
      const value = el.getAttribute(attr);
      if (value !== null) {
        Reflect.set(el, prop, value);
      }
    }
  }
}

function observeLowercaseAttributes(): void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
    return;
  }

  for (const tag of Object.keys(ELEMENT_ATTR_MAPS)) {
    document.querySelectorAll(tag).forEach((el) => syncElementAttributes(el));
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && mutation.target instanceof Element) {
        const tag = mutation.target.tagName.toLowerCase();
        const attrMap = ELEMENT_ATTR_MAPS[tag];
        const attr = mutation.attributeName;
        if (attrMap && attr && attr in attrMap) {
          const val = mutation.target.getAttribute(attr);
          if (val !== null) {
            Reflect.set(mutation.target, attrMap[attr], val);
          }
        }
      } else if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof Element) {
            syncElementAttributes(node);
          }
        });
      }
    }
  });

  observer.observe(document.documentElement, {
    attributes: true,
    childList: true,
    subtree: true,
  });
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
  injectLayeredStyles();

  const app = await createApplication({
    providers: [provideZoneChangeDetection({ eventCoalescing: true })],
  });

  defineElement(app, 'mj-surface', MJSurfaceComponent);
  defineElement(app, 'mj-row', MJRowComponent);
  defineElement(app, 'mj-layer', MJLayerComponent);

  observeLowercaseAttributes();
}

void definePrototypeElements();
