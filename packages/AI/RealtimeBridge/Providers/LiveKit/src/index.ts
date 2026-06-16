export * from './livekit-sdk';
export * from './livekit-meeting-controls';
export * from './livekit-bridge';

import { LoadLiveKitBridge } from './livekit-bridge';

// Static reference so bundlers cannot tree-shake the @RegisterClass(BaseRealtimeBridge, 'LiveKitBridge')
// registration. Calling the no-op here keeps the driver resolvable by the engine's ClassFactory.
LoadLiveKitBridge();
