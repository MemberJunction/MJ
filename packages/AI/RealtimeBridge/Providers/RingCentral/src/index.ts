export * from './ringcentral-call-sdk';
export * from './ringcentral-bridge';

import { LoadRingCentralBridge } from './ringcentral-bridge';

// Static reference so bundlers cannot tree-shake the @RegisterClass(BaseRealtimeBridge, 'RingCentralBridge')
// registration. Calling the no-op here keeps the driver resolvable by the engine's ClassFactory.
LoadRingCentralBridge();
