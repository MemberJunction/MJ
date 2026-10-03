import type { JSONObject } from '@memberjunction/ai';
import type { IRealtimeSessionLauncher } from '@memberjunction/realtime-runtime';
import type { WidgetAuthMode, WidgetChrome, WidgetConfig, WidgetPerception, WidgetPreload, WidgetThemeMode } from './types';

/** The configuration before anything is set. */
export function DefaultWidgetConfig(): WidgetConfig {
  return {
    apiUrl: null,
    widgetKey: null,
    inviteToken: null,
    token: null,
    agentId: null,
    applicationId: null,
    conversationId: null,
    channels: null,
    channelInputs: {},
    chrome: 'auto',
    autoStart: false,
    requireConsent: true,
    theme: 'auto',
    themeTokens: {},
    locale: null,
    agentName: 'Assistant',
    cspNonce: null,
    launcher: null,
    perception: 'ask',
    frameCapture: false,
    preload: 'hover',
    sessionUrl: null
  };
}

/** A non-empty trimmed string, or `null`. Attribute values arrive as strings, absent ones as null/undefined. */
export function ReadString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Reads a boolean attribute the way HTML does for ones that take a value: present-and-empty (`auto-start`)
 * and `"true"` are true; `"false"`, `"0"`, `"no"` and `"off"` are false; anything else keeps `fallback`.
 */
export function ReadBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (value === null || value === undefined) {
    return fallback;
  }
  const text = String(value).trim().toLowerCase();
  if (text === '' || text === 'true' || text === '1' || text === 'yes' || text === 'on') {
    return true;
  }
  if (text === 'false' || text === '0' || text === 'no' || text === 'off') {
    return false;
  }
  return fallback;
}

/** A channel list from an attribute (`"A, B"` or a JSON array) or a property (an array). `null` when none given. */
export function ReadChannelList(value: unknown): string[] | null {
  let items: unknown[];
  if (Array.isArray(value)) {
    items = value;
  } else if (typeof value === 'string') {
    const text = value.trim();
    if (text.length === 0) {
      return null;
    }
    items = text.startsWith('[') ? parseJsonArray(text) : text.split(',');
  } else {
    return null;
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const name = typeof item === 'string' ? item.trim() : '';
    if (name.length > 0 && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      out.push(name);
    }
  }
  return out;
}

function parseJsonArray(text: string): unknown[] {
  try {
    const parsed: unknown = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.warn('[mj-realtime-widget] "channels" looked like JSON but could not be parsed; ignoring it.');
    return [];
  }
}

/** Per-channel seed inputs from a property (an object) or an attribute (a JSON object). Anything else is `{}`. */
export function ReadChannelInputs(value: unknown): Record<string, JSONObject> {
  let raw: unknown = value;
  if (typeof value === 'string') {
    try {
      raw = JSON.parse(value);
    } catch {
      console.warn('[mj-realtime-widget] "channel-inputs" could not be parsed as JSON; ignoring it.');
      return {};
    }
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }
  const out: Record<string, JSONObject> = {};
  for (const [channel, inputs] of Object.entries(raw as Record<string, unknown>)) {
    if (inputs !== null && typeof inputs === 'object' && !Array.isArray(inputs)) {
      out[channel] = inputs as JSONObject;
    }
  }
  return out;
}

export function ReadChrome(value: unknown): WidgetChrome {
  const text = ReadString(value)?.toLowerCase();
  return text === 'orb' || text === 'console' ? text : 'auto';
}

/** `on`/`off`/`ask`; anything else is the default, `ask`. */
export function ReadPerception(value: unknown): WidgetPerception {
  const text = ReadString(value)?.toLowerCase();
  return text === 'on' || text === 'off' ? text : 'ask';
}

/** `none`/`hover`/`idle`/`eager`; anything else is the default, `hover`. */
export function ReadPreload(value: unknown): WidgetPreload {
  const text = ReadString(value)?.toLowerCase();
  return text === 'none' || text === 'idle' || text === 'eager' ? text : 'hover';
}

/** `light`/`dark`/`auto`, or `null` when the value is not a mode (it may be a JSON token map instead). */
export function ReadThemeMode(value: unknown): WidgetThemeMode | null {
  const text = ReadString(value)?.toLowerCase();
  return text === 'light' || text === 'dark' || text === 'auto' ? text : null;
}

/** Token overrides from an object, or a JSON object string; non-string values are dropped. */
export function ReadThemeTokens(value: unknown): Record<string, string> {
  let raw: unknown = value;
  if (typeof value === 'string') {
    try {
      raw = JSON.parse(value);
    } catch {
      return {};
    }
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof entry === 'string' && entry.trim().length > 0) {
      out[key] = entry.trim();
    }
  }
  return out;
}

/**
 * Which authentication mode a configuration selects. A host-supplied launcher wins (the host owns the
 * mint), then a widget key, an invite token, a session token; with none of those the page is assumed to be
 * an MJ application whose provider is already authenticated.
 */
export function ResolveAuthMode(config: Pick<WidgetConfig, 'launcher' | 'widgetKey' | 'inviteToken' | 'token'>): WidgetAuthMode {
  if (config.launcher) {
    return 'launcher';
  }
  if (config.widgetKey) {
    return 'widget-key';
  }
  if (config.inviteToken) {
    return 'invite-token';
  }
  if (config.token) {
    return 'token';
  }
  return 'host';
}

/**
 * Every page-facing input of the element, by property name. The attribute is the dash-cased form
 * (`apiUrl` → `api-url`). This list IS the element's configuration contract; the Angular component's
 * `@Input()`s are checked against it by a test so the two cannot drift.
 */
export const WIDGET_INPUT_PROPERTIES = [
  'apiUrl',
  'widgetKey',
  'inviteToken',
  'token',
  'agentId',
  'applicationId',
  'conversationId',
  'channels',
  'channelInputs',
  'chrome',
  'autoStart',
  'requireConsent',
  'theme',
  'themeTokens',
  'locale',
  'agentName',
  'cspNonce',
  'launcher',
  'perception',
  'frameCapture',
  'preload',
  'sessionUrl'
] as const;

export type WidgetInputProperty = (typeof WIDGET_INPUT_PROPERTIES)[number];

/** The attribute name for an input property: `apiUrl` → `api-url`. */
export function AttributeNameFor(property: string): string {
  return property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/** The attributes the element observes (everything except `launcher`, which only exists as a JS property). */
export const WIDGET_OBSERVED_ATTRIBUTES: readonly string[] = [...WIDGET_INPUT_PROPERTIES.filter((p) => p !== 'launcher').map(AttributeNameFor)];

/** The input property an attribute name maps to (`api-url` → `apiUrl`), or `null`. */
export function PropertyForAttribute(attribute: string): WidgetInputProperty | null {
  return WIDGET_INPUT_PROPERTIES.find((p) => AttributeNameFor(p) === attribute) ?? null;
}

/**
 * Applies one page-supplied value (an attribute string, or a property of the real type) to a configuration
 * and returns the new configuration. Values are normalized by the same readers the Angular component uses.
 * `theme` accepts either a mode or, as an attribute, a JSON object of token overrides.
 */
export function ApplyWidgetInput(config: WidgetConfig, property: WidgetInputProperty, value: unknown): WidgetConfig {
  switch (property) {
    case 'apiUrl':
    case 'widgetKey':
    case 'inviteToken':
    case 'token':
    case 'agentId':
    case 'applicationId':
    case 'conversationId':
    case 'locale':
    case 'cspNonce':
    case 'sessionUrl':
      return { ...config, [property]: ReadString(value) };
    case 'agentName':
      return { ...config, agentName: ReadString(value) ?? 'Assistant' };
    case 'channels':
      return { ...config, channels: ReadChannelList(value) };
    case 'channelInputs':
      return { ...config, channelInputs: ReadChannelInputs(value) };
    case 'chrome':
      return { ...config, chrome: ReadChrome(value) };
    case 'autoStart':
      return { ...config, autoStart: ReadBoolean(value, false) };
    case 'requireConsent':
      return { ...config, requireConsent: ReadBoolean(value, true) };
    case 'frameCapture':
      return { ...config, frameCapture: ReadBoolean(value, false) };
    case 'theme': {
      const mode = ReadThemeMode(value);
      if (mode !== null) {
        return { ...config, theme: mode };
      }
      return typeof value === 'string' && value.trim().startsWith('{') ? { ...config, themeTokens: ReadThemeTokens(value) } : config;
    }
    case 'themeTokens':
      return { ...config, themeTokens: ReadThemeTokens(value) };
    case 'perception':
      return { ...config, perception: ReadPerception(value) };
    case 'preload':
      return { ...config, preload: ReadPreload(value) };
    case 'launcher':
      return { ...config, launcher: isLauncher(value) ? value : null };
  }
}

function isLauncher(value: unknown): value is IRealtimeSessionLauncher {
  return typeof value === 'object' && value !== null && typeof (value as { Launch?: unknown }).Launch === 'function';
}
