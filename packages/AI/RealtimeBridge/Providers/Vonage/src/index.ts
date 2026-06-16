export * from './vonage-call-sdk';
export * from './vonage-bridge';

import { LoadVonageBridge } from './vonage-bridge';

// Static reference so bundlers cannot tree-shake the @RegisterClass(BaseRealtimeBridge, 'VonageBridge')
// registration. Calling the no-op here keeps the driver resolvable by the engine's ClassFactory.
LoadVonageBridge();
