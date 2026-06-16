export * from './twilio-call-sdk';
export * from './twilio-bridge';

import { LoadTwilioBridge } from './twilio-bridge';

// Static reference so bundlers cannot tree-shake the @RegisterClass(BaseRealtimeBridge, 'TwilioBridge')
// registration. Calling the no-op here keeps the driver resolvable by the engine's ClassFactory.
LoadTwilioBridge();
