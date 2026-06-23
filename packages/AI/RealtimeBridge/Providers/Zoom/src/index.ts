export * from './zoom-sdk';
export * from './zoom-meeting-controls';
export * from './zoom-bridge';
export * from './zoom-rtms-sdk';
export * from './zoom-native-sdk';
export * from './register-native';

import { LoadZoomBridge } from './zoom-bridge';
import { RegisterZoomNativeSdk } from './register-native';

// Static reference so bundlers cannot tree-shake the @RegisterClass(BaseRealtimeBridge, 'ZoomBridge')
// registration. Calling the no-op here keeps the driver resolvable by the engine's ClassFactory.
LoadZoomBridge();
// Register Zoom's native two-way SDK binding so the engine auto-binds it at StartBridgeSession.
RegisterZoomNativeSdk();
