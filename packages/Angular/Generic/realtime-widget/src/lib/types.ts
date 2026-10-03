import type { JSONObject } from '@memberjunction/ai';
import type { IRealtimeSessionLauncher } from '@memberjunction/realtime-runtime';

/**
 * How the widget gets its credential.
 *  - `widget-key` — anonymous guest session minted from a public widget key (`ConversationWidgetInstance`).
 *  - `invite-token` — a single-use magic-link invite, redeemed for an anonymous session JWT.
 *  - `token` — a session JWT the host page already holds.
 *  - `launcher` — the host mints the session itself ({@link IRealtimeSessionLauncher}); the widget runs it.
 *  - `host` — nothing to do: the page is an MJ application whose GraphQL provider is already authenticated.
 */
export type WidgetAuthMode = 'widget-key' | 'invite-token' | 'token' | 'launcher' | 'host';

/** The chrome the live call renders: the ambient orb, the structured console, or orb-first (`auto`). */
export type WidgetChrome = 'orb' | 'console' | 'auto';

/** `auto` follows the page's own light/dark choice, falling back to the visitor's OS preference. */
export type WidgetThemeMode = 'light' | 'dark' | 'auto';

/**
 * Where the widget is in its life.
 *  - `idle` — configured, waiting for `start()` (or the visitor pressing the start button).
 *  - `consent` — the pre-call consent gate is showing; the microphone is provably not started.
 *  - `booting` — authenticating and starting MemberJunction.
 *  - `connecting` — the session is being minted and connected.
 *  - `live` — the call is up and the overlay is showing.
 *  - `ended` — the call is over.
 *  - `error` — something failed; the message says what to do (never a dead end).
 */
export type WidgetPhase = 'idle' | 'consent' | 'booting' | 'connecting' | 'live' | 'ended' | 'error';

/** Why a session ended, as reported on `mj-session-ended`. */
export type WidgetEndReason = 'user' | 'error' | 'deadline' | 'page-close' | 'remote';

/** A stable machine-readable code on `mj-error`. */
export type WidgetErrorCode =
  | 'no-credential'
  | 'no-agent'
  | 'auth-failed'
  | 'session-expired'
  | 'voice-not-enabled'
  | 'launcher-failed'
  | 'start-failed'
  | 'start-dropped'
  | 'connection-lost'
  | 'channel-failed';

/**
 * The widget's configuration, as the element's attributes and properties resolve to it.
 *
 * Members are camelCase on purpose: they mirror the element's DOM surface (`api-url` → `apiUrl`), which is
 * what a page author writes, not MemberJunction's PascalCase class-member convention. The same goes for the
 * event `detail` shapes below — they are a web-platform contract.
 */
export interface WidgetConfig {
  /** MJAPI root. Required for every mode except `host` and `launcher`-with-a-configured-provider. */
  apiUrl: string | null;
  /** Public widget key (`widget-key` mode). */
  widgetKey: string | null;
  /** Magic-link invite token (`invite-token` mode). */
  inviteToken: string | null;
  /** A session JWT (`token` mode). */
  token: string | null;
  /** The agent to talk to. In `widget-key` mode the server pins the agent and this is ignored. */
  agentId: string | null;
  /** The application the session runs in. In `widget-key` mode the server supplies it. */
  applicationId: string | null;
  /** A conversation to continue. */
  conversationId: string | null;
  /** Channels the page brings to the session, by name (or ClassFactory key). `null` = none beyond the registry's. */
  channels: string[] | null;
  /** Seed inputs per channel name, applied when that channel opens. */
  channelInputs: Record<string, JSONObject>;
  chrome: WidgetChrome;
  /** Start as soon as the element is configured, instead of waiting for `start()` / the start button. */
  autoStart: boolean;
  /** Show the consent gate before the microphone starts. */
  requireConsent: boolean;
  theme: WidgetThemeMode;
  /** `--mj-*` token overrides (without the `--mj-` prefix, or with it). */
  themeTokens: Record<string, string>;
  /** BCP-47 locale for the widget's own copy. */
  locale: string | null;
  /** The agent's display name (cosmetic). */
  agentName: string;
  /** The page's CSP nonce, for the styles the widget injects. */
  cspNonce: string | null;
  /** A host-supplied way to mint the session (see {@link IRealtimeSessionLauncher}). */
  launcher: IRealtimeSessionLauncher | null;
}

/** The names of the DOM events the element dispatches (bubbling and composed). */
export const WIDGET_EVENTS = {
  Ready: 'mj-ready',
  SessionStarted: 'mj-session-started',
  SessionEnded: 'mj-session-ended',
  PhaseChanged: 'mj-phase-changed',
  Verified: 'mj-verified',
  SessionEvent: 'mj-session-event',
  ChannelOpened: 'mj-channel-opened',
  ChannelEvent: 'mj-channel-event',
  ChannelOutput: 'mj-channel-output',
  Error: 'mj-error'
} as const;

export type WidgetEventName = (typeof WIDGET_EVENTS)[keyof typeof WIDGET_EVENTS];

export interface WidgetReadyDetail {
  /** How the widget will authenticate. */
  mode: WidgetAuthMode;
  /** Whether it is about to start by itself. */
  autoStart: boolean;
}

export interface WidgetSessionStartedDetail {
  sessionId: string;
  agentId: string | null;
  conversationId: string | null;
  /** The channels mounted with the session. */
  channels: string[];
}

export interface WidgetSessionEndedDetail {
  sessionId: string | null;
  reason: WidgetEndReason;
}

export interface WidgetPhaseChangedDetail {
  phase: WidgetPhase;
  previous: WidgetPhase;
}

/** The server-confirmed identity, on `mj-verified`. */
export interface WidgetVerifiedDetail {
  sessionId: string;
  /** The email address the person proved they control. */
  email: string;
  /** The name they gave (empty when the verification was learned of after a reconnect). */
  name: string;
  verifiedAt: string;
  method: 'link' | 'code';
  /** The session's new absolute deadline (ISO-8601) when verification extended it. */
  maxSessionDeadline?: string;
  /** True when the widget learned of the verification by reading its status after a reconnect. */
  recovered: boolean;
}

export interface WidgetSessionEventDetail {
  type: string;
  sessionId: string;
  occurredAt: string;
  payload: JSONObject;
}

export interface WidgetChannelOpenedDetail {
  channel: string;
  instance: string;
  inputs: JSONObject;
}

export interface WidgetChannelEventDetail {
  channel: string;
  instance: string;
  name: string;
  payload: JSONObject;
  changeId?: number;
  occurredAt: number;
}

export interface WidgetChannelOutputDetail {
  channel: string;
  instance: string;
  output: JSONObject;
  occurredAt: number;
}

export interface WidgetErrorDetail {
  code: WidgetErrorCode;
  message: string;
  phase: WidgetPhase;
}

/** Event name → its `detail`, so a typed listener is one lookup away. */
export interface WidgetEventDetailMap {
  'mj-ready': WidgetReadyDetail;
  'mj-session-started': WidgetSessionStartedDetail;
  'mj-session-ended': WidgetSessionEndedDetail;
  'mj-phase-changed': WidgetPhaseChangedDetail;
  'mj-verified': WidgetVerifiedDetail;
  'mj-session-event': WidgetSessionEventDetail;
  'mj-channel-opened': WidgetChannelOpenedDetail;
  'mj-channel-event': WidgetChannelEventDetail;
  'mj-channel-output': WidgetChannelOutputDetail;
  'mj-error': WidgetErrorDetail;
}

/** One event the controller wants dispatched: its name and typed detail. */
export type WidgetOutboundEvent = {
  [K in WidgetEventName]: { name: K; detail: WidgetEventDetailMap[K] };
}[WidgetEventName];
