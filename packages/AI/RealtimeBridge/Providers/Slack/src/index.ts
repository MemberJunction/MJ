export * from './slack-sdk';
export * from './slack-meeting-controls';
export * from './slack-bridge';

import { LoadSlackBridge } from './slack-bridge';

// Static reference so bundlers cannot tree-shake the @RegisterClass(BaseRealtimeBridge, 'SlackBridge')
// registration. Calling the no-op here keeps the driver resolvable by the engine's ClassFactory.
LoadSlackBridge();
