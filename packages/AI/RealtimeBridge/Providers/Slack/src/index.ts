export * from './slack-sdk';
export * from './slack-native-sdk';
export * from './slack-meeting-controls';
export * from './slack-bridge';
export * from './register-native';

import { LoadSlackBridge } from './slack-bridge';
import { RegisterSlackNativeSdk } from './register-native';

// Static reference so bundlers cannot tree-shake the @RegisterClass(BaseRealtimeBridge, 'SlackBridge')
// registration. Calling the no-op here keeps the driver resolvable by the engine's ClassFactory.
LoadSlackBridge();
// Register Slack's native two-way SDK binding so the engine auto-binds it at StartBridgeSession.
RegisterSlackNativeSdk();
