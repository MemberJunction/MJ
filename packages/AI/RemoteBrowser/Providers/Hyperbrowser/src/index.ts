/**
 * `@memberjunction/remote-browser-hyperbrowser` — the Hyperbrowser backend driver for the Remote
 * Browser channel.
 *
 * Exports the injectable {@link IHyperbrowserClient} seam and the {@link HyperbrowserRemoteBrowser}
 * driver (`@RegisterClass(BaseRemoteBrowserProvider, 'HyperbrowserRemoteBrowser')`). The driver fills
 * only `AcquireSession` and maps the native agentic harness onto `InvokeNativeAIControl`; all CDP
 * control is inherited from `@memberjunction/remote-browser-cdp`.
 */

export * from './hyperbrowser-client';
export * from './hyperbrowser-remote-browser';

import { LoadHyperbrowserRemoteBrowser } from './hyperbrowser-remote-browser';

// Static reference so bundlers cannot tree-shake the
// @RegisterClass(BaseRemoteBrowserProvider, 'HyperbrowserRemoteBrowser') registration. Calling the
// no-op here keeps the driver resolvable by the engine's ClassFactory.
LoadHyperbrowserRemoteBrowser();
