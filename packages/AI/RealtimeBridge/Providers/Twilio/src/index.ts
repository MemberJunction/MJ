export * from './twilio-call-sdk';
export * from './twilio-native-call-sdk';
export * from './real-twilio-bindings';
export * from './twilio-rest-client';
export * from './twilio-ingress';
export * from './twilio-bridge';
export * from './register-native';

import { LoadTwilioBridge } from './twilio-bridge';
import { RegisterTwilioNativeSdk } from './register-native';

// Static reference so bundlers cannot tree-shake the @RegisterClass(BaseRealtimeBridge, 'TwilioBridge')
// registration. Calling the no-op here keeps the driver resolvable by the engine's ClassFactory.
LoadTwilioBridge();
// Register Twilio's native two-way call-SDK binding so the engine auto-binds it at StartBridgeSession.
RegisterTwilioNativeSdk();
