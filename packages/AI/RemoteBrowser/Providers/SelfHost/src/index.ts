/**
 * `@memberjunction/remote-browser-selfhost` — the Self-Hosted Chrome backend driver for the Remote
 * Browser channel.
 *
 * Exports the driver, its injectable Chrome-container-runner seam, and the session backend, plus a
 * static tree-shaking-prevention loader so the `ClassFactory` can resolve the
 * `'SelfHostRemoteBrowser'` registration.
 */

export * from './chrome-container-runner';
export * from './selfhost-session-backend';
export * from './selfhost-remote-browser';

import { LoadSelfHostRemoteBrowser } from './selfhost-remote-browser';

// Static reference so bundlers cannot tree-shake the
// @RegisterClass(BaseRemoteBrowserProvider, 'SelfHostRemoteBrowser') registration. Calling the no-op
// here keeps the driver resolvable by the engine's ClassFactory.
LoadSelfHostRemoteBrowser();
