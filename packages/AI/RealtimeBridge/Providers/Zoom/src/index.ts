export * from './zoom-sdk';
export * from './zoom-meeting-controls';
export * from './zoom-bridge';

import { LoadZoomBridge } from './zoom-bridge';

// Static reference so bundlers cannot tree-shake the @RegisterClass(BaseRealtimeBridge, 'ZoomBridge')
// registration. Calling the no-op here keeps the driver resolvable by the engine's ClassFactory.
LoadZoomBridge();
