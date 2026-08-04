export * from './discord-sdk';
export * from './discord-meeting-controls';
export * from './discord-bridge';
export * from './discord-native-sdk';
export * from './register-native';

import { LoadDiscordBridge } from './discord-bridge';
import { RegisterDiscordNativeSdk } from './register-native';

// Static reference so bundlers cannot tree-shake the @RegisterClass(BaseRealtimeBridge, 'DiscordBridge')
// registration. Calling the no-op here keeps the driver resolvable by the engine's ClassFactory.
LoadDiscordBridge();
// Register Discord's native two-way SDK binding so the engine auto-binds it at StartBridgeSession.
RegisterDiscordNativeSdk();
