export * from './vonage-call-sdk';
export * from './vonage-native-call-sdk';
export * from './vonage-bridge';
export * from './register-native';

import { LoadVonageBridge } from './vonage-bridge';
import { RegisterVonageNativeSdk } from './register-native';

// Static reference so bundlers cannot tree-shake the @RegisterClass(BaseRealtimeBridge, 'VonageBridge')
// registration. Calling the no-op here keeps the driver resolvable by the engine's ClassFactory.
LoadVonageBridge();
// Register Vonage's native two-way call SDK binding so the engine auto-binds it at StartBridgeSession.
RegisterVonageNativeSdk();
