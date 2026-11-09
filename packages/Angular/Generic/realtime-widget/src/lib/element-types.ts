import type { JSONObject } from '@memberjunction/ai';
import type { IRealtimeSessionLauncher } from '@memberjunction/realtime-runtime';
import type { WidgetChannelClass, WidgetChannelResult } from './session/widget-controller';
import type { WidgetChrome, WidgetEventDetailMap, WidgetPerception, WidgetPreload, WidgetThemeMode } from './types';

/** The tag the custom element is registered under. */
export const REALTIME_WIDGET_TAG = 'mj-realtime-widget';

/**
 * The `<mj-realtime-widget>` custom element as a page's script sees it.
 *
 * Attributes (kebab-case) mirror the properties below (camelCase): set either. Strings from attributes are
 * coerced; properties accept the real types. `launcher`, `channelInputs` and `themeTokens` are most useful as
 * properties (they carry code or objects).
 */
export interface RealtimeWidgetElement extends HTMLElement {
  /** `api-url` — the MJAPI root. */
  apiUrl: string | null;
  /** `widget-key` — a public widget key (anonymous guest session). */
  widgetKey: string | null;
  /** `invite-token` — a magic-link invite. */
  inviteToken: string | null;
  /** `token` — a session JWT the page holds. */
  token: string | null;
  /** `agent-id` — the agent to talk to (ignored with a widget key). */
  agentId: string | null;
  /** `application-id` */
  applicationId: string | null;
  /** `conversation-id` — a conversation to continue. */
  conversationId: string | null;
  /** `channels` — channel names, comma-separated or JSON; as a property an array. */
  channels: string[] | string | null;
  /** `channel-inputs` — per-channel seed inputs (a JSON object as an attribute). */
  channelInputs: Record<string, JSONObject> | string | null;
  /** `chrome` — `orb`, `console` or `auto`. */
  chrome: WidgetChrome | string | null;
  /** `auto-start` */
  autoStart: boolean | string | null;
  /** `require-consent` — default true. */
  requireConsent: boolean | string | null;
  /** `theme` — `light`, `dark` or `auto`. */
  theme: WidgetThemeMode | string | null;
  /** Token overrides (an object): `{ 'brand-primary': '#0a7a55' }`. Attribute form: `theme-tokens` (JSON). */
  themeTokens: Record<string, string> | string | null;
  /** `locale` — BCP-47 tag for the widget's own copy. */
  locale: string | null;
  /** `agent-name` — the agent's display name. */
  agentName: string | null;
  /** `csp-nonce` — your page's CSP nonce, used for the styles the widget injects. */
  cspNonce: string | null;
  /** A JS-only way to mint the session yourself. */
  launcher: IRealtimeSessionLauncher | null;
  /** `perception` — `on`, `off` or `ask` (default): whether the agent may see what the person shares. */
  perception: WidgetPerception | string | null;
  /** `frame-capture` — whether a rendered component may be captured as an image for the agent. */
  frameCapture: boolean | string | null;
  /** `preload` — `none`, `hover` (default), `idle` or `eager`: when to fetch the call code. */
  preload: WidgetPreload | string | null;
  /** `session-url` — where the call code is, when it is not beside this script. */
  sessionUrl: string | null;

  /** Starts the call (the consent gate first, when required). */
  start(): Promise<void>;
  /** Ends the call. Safe when none is live. */
  end(): Promise<void>;
  /** Opens (and seeds) a channel in the live call. */
  openChannel(channel: string, inputs?: JSONObject): Promise<WidgetChannelResult>;
  /** Tells the agent something in the background; it does not speak a reply. */
  sendContextNote(text: string): void;
  /** Asks the agent to speak now. Resolves to whether the request was delivered. */
  requestSpokenResponse(text: string): boolean;
  /** Registers a channel class the page brings (a subclass of `BaseRealtimeChannelClient`). */
  registerChannel(channelClass: WidgetChannelClass): void;

  addEventListener<K extends keyof WidgetEventDetailMap>(
    type: K,
    listener: (this: RealtimeWidgetElement, ev: CustomEvent<WidgetEventDetailMap[K]>) => void,
    options?: boolean | AddEventListenerOptions
  ): void;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
}

declare global {
  interface HTMLElementTagNameMap {
    'mj-realtime-widget': RealtimeWidgetElement;
  }
}
