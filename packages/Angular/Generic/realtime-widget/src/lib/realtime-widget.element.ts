/**
 * Registers `<mj-realtime-widget>` as a browser custom element, via `@angular/elements`.
 *
 * The registration is GUARDED: `customElements.define` throws when the tag already exists, so a second
 * registration (two bundles on one page, a hot reload) is a safe no-op.
 *
 * Angular Elements gives the element its inputs as properties/attributes but no methods, and re-emits
 * component OUTPUTS as non-bubbling events. The widget needs both bubbling+composed events and methods, so
 * the component dispatches its own DOM events (see `RealtimeWidgetComponent.dispatch`) and this wrapper adds
 * the methods, forwarding to the component registered for the element.
 */
import { CSP_NONCE, provideZoneChangeDetection, type ApplicationRef, type Injector } from '@angular/core';
import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import type { JSONObject } from '@memberjunction/ai';
import { GetRealtimeWidgetComponent, QueueRealtimeWidgetChannel, RealtimeWidgetComponent } from './components/realtime-widget.component';
import { REALTIME_WIDGET_TAG, type RealtimeWidgetElement } from './element-types';
import type { WidgetChannelClass, WidgetChannelResult } from './session/widget-controller';

export { REALTIME_WIDGET_TAG } from './element-types';
import { ReadCspNonce } from './csp-nonce';

/** The element's methods need an attached component; this is the failure when there is none. */
function notAttached(method: string): Error {
  return new Error(`mj-realtime-widget: ${method}() needs the element to be attached to the document first.`);
}

/**
 * Builds the element class around `injector`. Exposed separately from {@link RegisterRealtimeWidgetElement}
 * so a test can construct it without registering a tag.
 */
export function CreateRealtimeWidgetElementClass(injector: Injector): CustomElementConstructor {
  const AngularElement = createCustomElement(RealtimeWidgetComponent, { injector });
  const methods: Record<string, (this: HTMLElement, ...args: never[]) => unknown> = {
    start(this: HTMLElement): Promise<void> {
      const component = GetRealtimeWidgetComponent(this);
      return component ? component.Start() : Promise.reject(notAttached('start'));
    },
    end(this: HTMLElement): Promise<void> {
      const component = GetRealtimeWidgetComponent(this);
      return component ? component.End() : Promise.resolve();
    },
    openChannel(this: HTMLElement, channel: string, inputs: JSONObject = {}): Promise<WidgetChannelResult> {
      const component = GetRealtimeWidgetComponent(this);
      return component ? component.OpenChannel(channel, inputs) : Promise.reject(notAttached('openChannel'));
    },
    sendContextNote(this: HTMLElement, text: string): void {
      const component = GetRealtimeWidgetComponent(this);
      if (!component) {
        throw notAttached('sendContextNote');
      }
      component.SendContextNote(text);
    },
    requestSpokenResponse(this: HTMLElement, text: string): boolean {
      const component = GetRealtimeWidgetComponent(this);
      if (!component) {
        throw notAttached('requestSpokenResponse');
      }
      return component.RequestSpokenResponse(text);
    },
    registerChannel(this: HTMLElement, channelClass: WidgetChannelClass): void {
      const component = GetRealtimeWidgetComponent(this);
      if (component) {
        component.RegisterChannel(channelClass);
      } else {
        QueueRealtimeWidgetChannel(this, channelClass);
      }
    }
  };
  for (const [name, value] of Object.entries(methods)) {
    Object.defineProperty(AngularElement.prototype, name, { value, writable: true, configurable: true, enumerable: false });
  }
  return AngularElement;
}

/** Defines `<mj-realtime-widget>` using `injector` for the element's DI. Idempotent. */
export function RegisterRealtimeWidgetElement(injector: Injector): void {
  if (typeof customElements === 'undefined' || customElements.get(REALTIME_WIDGET_TAG) !== undefined) {
    return;
  }
  customElements.define(REALTIME_WIDGET_TAG, CreateRealtimeWidgetElementClass(injector));
}

/**
 * Standalone bootstrap for the one-script embed: spins up a minimal Angular application (no router, no
 * host app) and registers `<mj-realtime-widget>` with its injector. The returned {@link ApplicationRef} is
 * the environment the element instances live in.
 */
export async function BootstrapRealtimeWidgetElement(): Promise<ApplicationRef> {
  const app = await createApplication({
    providers: [provideZoneChangeDetection(), { provide: CSP_NONCE, useFactory: () => ReadCspNonce() }]
  });
  RegisterRealtimeWidgetElement(app.injector);
  return app;
}

/** The typed element, for a script that created one. */
export function AsRealtimeWidgetElement(element: Element): RealtimeWidgetElement {
  if (element.localName !== REALTIME_WIDGET_TAG) {
    throw new Error(`Expected a <${REALTIME_WIDGET_TAG}> element, got <${element.localName}>.`);
  }
  return element as RealtimeWidgetElement;
}
