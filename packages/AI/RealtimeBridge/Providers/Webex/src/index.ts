export * from './webex-sdk';
export * from './webex-meeting-controls';
export * from './webex-bridge';
export * from './webex-native-sdk';
export * from './register-native';

import { LoadWebexBridge } from './webex-bridge';
import { RegisterWebexNativeSdk } from './register-native';

// Static reference so bundlers cannot tree-shake the @RegisterClass(BaseRealtimeBridge, 'WebexBridge')
// registration. Calling the no-op here keeps the driver resolvable by the engine's ClassFactory.
LoadWebexBridge();
// Register Webex's native two-way SDK binding so the engine auto-binds it at StartBridgeSession.
RegisterWebexNativeSdk();
