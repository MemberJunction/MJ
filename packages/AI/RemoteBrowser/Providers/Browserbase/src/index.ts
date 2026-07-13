/**
 * `@memberjunction/remote-browser-browserbase` — the Browserbase backend driver for the Remote Browser
 * channel.
 *
 * Exports the injectable client seam ({@link IBrowserbaseClient} + factory types) and the driver
 * ({@link BrowserbaseRemoteBrowser}), and statically anchors the driver's `@RegisterClass` registration
 * so bundlers cannot tree-shake it away.
 *
 * @module @memberjunction/remote-browser-browserbase
 */

export * from './browserbase-client';
export * from './browserbase-remote-browser';

import { LoadBrowserbaseRemoteBrowser } from './browserbase-remote-browser';

// Static reference so bundlers cannot tree-shake the
// @RegisterClass(BaseRemoteBrowserProvider, 'BrowserbaseRemoteBrowser') registration. Calling the no-op
// here keeps the driver resolvable by the engine's ClassFactory.
LoadBrowserbaseRemoteBrowser();
