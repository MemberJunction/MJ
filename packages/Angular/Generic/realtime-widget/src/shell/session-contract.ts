/**
 * What the shell needs from the lazily loaded call chunk, and nothing more.
 *
 * Type-only on purpose: this file (and the `import type`s in it) compile to NOTHING, so the shell can describe
 * the call chunk without a single byte of it. The shell must never import a value from the session side; the
 * only bridge is the dynamic `import()` in `session-loader.ts`.
 */
import type { JSONObject } from '@memberjunction/ai';
import type { WidgetChannelClass, WidgetChannelResult } from '../lib/session/widget-controller';
import type { WidgetConfig, WidgetOutboundEvent, WidgetPhase } from '../lib/types';

/** A stream the shell can listen to without depending on rxjs. */
export interface Subscribable<T> {
  // case-violation-ok-legacy-back-compat: mirrors rxjs's Subscribable so any rxjs Observable satisfies it unchanged
  subscribe(next: (value: T) => void): { unsubscribe(): void };
}

/** One element's call: created when the call chunk has loaded, driven by the shell. */
export interface WidgetSessionHandle {
  /** The words for why the call is in the `error` phase. */
  readonly ErrorMessage: string;
  /** Every phase the call enters. */
  readonly Phase$: Subscribable<WidgetPhase>;
  /** Everything the page should hear about (the shell drops the phase and ready events it owns itself). */
  readonly Events$: Subscribable<WidgetOutboundEvent>;
  /** Replaces the call's configuration. */
  Configure(config: WidgetConfig): void;
  /** Starts the call (no consent step: the shell has already asked). */
  Start(): Promise<void>;
  /** Ends the call, if this widget started one. */
  End(): Promise<void>;
  OpenChannel(channel: string, inputs: JSONObject): Promise<WidgetChannelResult>;
  SendContextNote(text: string): void;
  RequestSpokenResponse(text: string): boolean;
  RegisterChannel(channelClass: WidgetChannelClass): void;
  /** The tab is closing or being hidden. */
  OnPageHide(persisted: boolean): void;
  /** Renders the live call (the realtime overlay) into `container`. Idempotent for the same container. */
  MountOverlay(container: HTMLElement): void;
  /** Removes the live call's UI. */
  UnmountOverlay(): void;
  /** Ends a call this widget started and releases everything. */
  Dispose(): void;
}

/** What the shell hands the call chunk when it asks for a session. */
export interface WidgetSessionOptions {
  /** The configuration to start from. */
  Config: WidgetConfig;
  /** The page's CSP nonce, for any `<style>` the call chunk adds. */
  Nonce: string | null;
}

/** The shape of the call chunk's module. */
export interface WidgetSessionModule {
  /** Bumped when this contract changes incompatibly, so a mismatched shell and chunk fail loudly instead of oddly. */
  readonly SESSION_CONTRACT_VERSION: number;
  CreateWidgetSession(options: WidgetSessionOptions): Promise<WidgetSessionHandle>;
}

/** The contract version this shell speaks. */
export const SHELL_SESSION_CONTRACT_VERSION = 1;
