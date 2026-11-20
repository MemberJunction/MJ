import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import {
  ApplicationRef,
  CSP_NONCE,
  provideZonelessChangeDetection,
  reflectComponentType,
  Type,
} from '@angular/core';
import { MJSurfaceComponent } from './lib/surface/surface.component';
import { MJLayerComponent } from './lib/layer/layer.component';
import { MJRowComponent } from './lib/row/row.component';
import { PROTOTYPE_CSS } from './lib/styles/prototype-css.generated';

const STYLE_LINK_SELECTOR = 'link[href*="mj-wave0-prototype.css"]';
const STYLE_ELEMENT_ID = 'mj-wave0-prototype-styles';

function readCspNonce(): string | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const nonceMeta = document.querySelector<HTMLMetaElement>('meta[name="csp-nonce"]');
  const scriptEl = document.currentScript as HTMLScriptElement | null;
  const scriptNonce = scriptEl?.nonce || scriptEl?.getAttribute('nonce');
  return nonceMeta?.content || scriptNonce || null;
}

function ensureStylesLoaded(nonce: string | null): void {
  if (typeof document === 'undefined') {
    return;
  }
  if (document.querySelector(STYLE_LINK_SELECTOR) || document.getElementById(STYLE_ELEMENT_ID)) {
    return;
  }
  const style = document.createElement('style');
  style.id = STYLE_ELEMENT_ID;
  if (nonce) {
    style.nonce = nonce;
    style.setAttribute('nonce', nonce);
  }
  style.textContent = PROTOTYPE_CSS;
  document.head.prepend(style);
}

function toKebabCase(propName: string): string {
  return propName
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

/**
 * Registers an Angular component as a Custom Element while preserving MJ's PascalCase
 * Angular input contract (`[Density]`, `[AllowPhoneSheet]`) AND supporting standard
 * lowercase/kebab-case HTML attributes (`density`, `allow-phone-sheet`) via native
 * `observedAttributes` + `attributeChangedCallback` derived from `reflectComponentType()`.
 */
function defineElement<T>(appRef: ApplicationRef, tag: string, component: Type<T>): void {
  if (customElements.get(tag)) {
    return;
  }
  const ctor = createCustomElement(component, {
    injector: appRef.injector,
  });

  const mirror = reflectComponentType(component);
  const kebabToProp: Record<string, string> = {};
  for (const inputMeta of mirror?.inputs ?? []) {
    const kebab = toKebabCase(inputMeta.propName);
    if (kebab !== inputMeta.templateName) {
      kebabToProp[kebab] = inputMeta.propName;
    }
  }

  const extraAttrs = Object.keys(kebabToProp);
  if (extraAttrs.length > 0) {
    const baseObserved: string[] = Array.isArray(ctor.observedAttributes)
      ? ctor.observedAttributes
      : [];
    const mergedObserved = Array.from(new Set([...baseObserved, ...extraAttrs]));
    Object.defineProperty(ctor, 'observedAttributes', {
      configurable: true,
      get: () => mergedObserved,
    });

    const proto = ctor.prototype as HTMLElement & {
      connectedCallback?: () => void;
      attributeChangedCallback?: (
        name: string,
        oldValue: string | null,
        newValue: string | null,
        namespace?: string | null
      ) => void;
    };

    const origConnected = proto.connectedCallback;
    proto.connectedCallback = function connectedWithKebabAttrs(this: HTMLElement): void {
      origConnected?.call(this);
      for (const attr of extraAttrs) {
        if (this.hasAttribute(attr)) {
          Reflect.set(this, kebabToProp[attr], this.getAttribute(attr));
        }
      }
    };

    const origAttrChanged = proto.attributeChangedCallback;
    proto.attributeChangedCallback = function attrChangedWithKebabAttrs(
      this: HTMLElement,
      name: string,
      oldValue: string | null,
      newValue: string | null,
      namespace?: string | null
    ): void {
      if (name in kebabToProp) {
        Reflect.set(this, kebabToProp[name], newValue === null ? undefined : newValue);
        return;
      }
      origAttrChanged?.call(this, name, oldValue, newValue, namespace);
    };
  }

  customElements.define(tag, ctor);
}

async function definePrototypeElements(): Promise<void> {
  const nonce = readCspNonce();
  ensureStylesLoaded(nonce);

  const app = await createApplication({
    providers: [
      provideZonelessChangeDetection(),
      ...(nonce ? [{ provide: CSP_NONCE, useValue: nonce }] : []),
    ],
  });

  defineElement(app, 'mj-surface', MJSurfaceComponent);
  defineElement(app, 'mj-row', MJRowComponent);
  defineElement(app, 'mj-layer', MJLayerComponent);
}

void definePrototypeElements();
