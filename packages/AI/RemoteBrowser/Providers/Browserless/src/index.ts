/**
 * `@memberjunction/remote-browser-browserless` — the Browserless backend driver for the Remote Browser
 * channel.
 *
 * Exports the injectable {@link IBrowserlessClient} seam and the {@link BrowserlessRemoteBrowser} driver
 * (`@RegisterClass(BaseRemoteBrowserProvider, 'BrowserlessRemoteBrowser')`). The driver fills only
 * `AcquireSession`; all CDP control is inherited from `@memberjunction/remote-browser-cdp`.
 */

export * from './browserless-client';
export * from './browserless-remote-browser';

import { LoadBrowserlessRemoteBrowser } from './browserless-remote-browser';

// Static reference so bundlers cannot tree-shake the
// @RegisterClass(BaseRemoteBrowserProvider, 'BrowserlessRemoteBrowser') registration. Calling the no-op
// here keeps the driver resolvable by the engine's ClassFactory.
LoadBrowserlessRemoteBrowser();
