export * from './discord-sdk';
export * from './discord-meeting-controls';
export * from './discord-bridge';

import { LoadDiscordBridge } from './discord-bridge';

// Static reference so bundlers cannot tree-shake the @RegisterClass(BaseRealtimeBridge, 'DiscordBridge')
// registration. Calling the no-op here keeps the driver resolvable by the engine's ClassFactory.
LoadDiscordBridge();
