export * from './livekit-sdk';
export * from './livekit-native-sdk';
export * from './livekit-meeting-controls';
export * from './livekit-bridge';
export * from './register-native';

import { LoadLiveKitBridge } from './livekit-bridge';
import { RegisterLiveKitNativeSdk } from './register-native';

// Static reference so bundlers cannot tree-shake the @RegisterClass(BaseRealtimeBridge, 'LiveKitBridge')
// registration. Calling the no-op here keeps the driver resolvable by the engine's ClassFactory.
LoadLiveKitBridge();
// Register LiveKit's native two-way SDK binding so the engine auto-binds it at StartBridgeSession.
RegisterLiveKitNativeSdk();
