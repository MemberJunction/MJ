export * from './webex-sdk';
export * from './webex-meeting-controls';
export * from './webex-bridge';

import { LoadWebexBridge } from './webex-bridge';

// Static reference so bundlers cannot tree-shake the @RegisterClass(BaseRealtimeBridge, 'WebexBridge')
// registration. Calling the no-op here keeps the driver resolvable by the engine's ClassFactory.
LoadWebexBridge();
