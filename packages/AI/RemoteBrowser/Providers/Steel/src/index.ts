/**
 * `@memberjunction/remote-browser-steel` — the Steel ([steel.dev](https://steel.dev)) backend driver for
 * the Remote Browser channel.
 *
 * Exports the injectable client seam ({@link ISteelClient} + factory types) and the driver
 * ({@link SteelRemoteBrowser}), and statically anchors the driver's `@RegisterClass` registration so
 * bundlers cannot tree-shake it away.
 *
 * @module @memberjunction/remote-browser-steel
 */

export * from './steel-client';
export * from './steel-remote-browser';

import { LoadSteelRemoteBrowser } from './steel-remote-browser';

// Static reference so bundlers cannot tree-shake the
// @RegisterClass(BaseRemoteBrowserProvider, 'SteelRemoteBrowser') registration. Calling the no-op here
// keeps the driver resolvable by the engine's ClassFactory.
LoadSteelRemoteBrowser();
