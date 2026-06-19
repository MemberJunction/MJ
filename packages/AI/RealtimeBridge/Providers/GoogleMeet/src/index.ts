export * from './googlemeet-sdk';
export * from './googlemeet-native-sdk';
export * from './googlemeet-meeting-controls';
export * from './googlemeet-bridge';
export * from './register-native';

import { LoadGoogleMeetBridge } from './googlemeet-bridge';
import { RegisterGoogleMeetNativeSdk } from './register-native';

// Static reference so bundlers cannot tree-shake the @RegisterClass(BaseRealtimeBridge, 'GoogleMeetBridge')
// registration. Calling the no-op here keeps the driver resolvable by the engine's ClassFactory.
LoadGoogleMeetBridge();
// Register Google Meet's native two-way SDK binding so the engine auto-binds it at StartBridgeSession.
RegisterGoogleMeetNativeSdk();
