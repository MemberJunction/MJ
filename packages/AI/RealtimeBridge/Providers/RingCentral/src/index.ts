export * from './ringcentral-call-sdk';
export * from './ringcentral-native-call-sdk';
export * from './real-ringcentral-bindings';
export * from './ringcentral-rest-client';
export * from './ringcentral-ingress';
export * from './ringcentral-bridge';
export * from './register-native';

import { LoadRingCentralBridge } from './ringcentral-bridge';
import { RegisterRingCentralNativeSdk } from './register-native';

// Static reference so bundlers cannot tree-shake the @RegisterClass(BaseRealtimeBridge, 'RingCentralBridge')
// registration. Calling the no-op here keeps the driver resolvable by the engine's ClassFactory.
LoadRingCentralBridge();
// Register RingCentral's native two-way call SDK binding so the engine auto-binds it at StartBridgeSession.
RegisterRingCentralNativeSdk();
