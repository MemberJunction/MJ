/**
 * `@memberjunction/remote-browser-cdp` — the shared CDP kit for the Remote Browser channel.
 *
 * Exports the DRY layer the 5 backend drivers build on:
 * - {@link mapRemoteBrowserAction} / {@link mapHumanInput} — lossless Base ↔ computer-use mapping.
 * - {@link CdpRemoteBrowserSession} — the shared `IRemoteBrowserSession` implementation.
 * - {@link BaseCdpRemoteBrowserProvider} (+ {@link AcquiredCdpSession}) — the base provider; drivers fill
 *   only `AcquireSession`.
 * - {@link ICdpSessionBackend} — the per-backend hook surface drivers supply.
 */

export * from './map-action';
export * from './cdp-session-backend';
export * from './cdp-remote-browser-session';
export * from './base-cdp-remote-browser-provider';
export * from './computer-use-goal-engine';
