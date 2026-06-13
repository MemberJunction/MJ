export * from './teams-sdk';
export * from './teams-meeting-controls';
export * from './teams-bridge';

import { LoadTeamsBridge } from './teams-bridge';

// Static reference so bundlers cannot tree-shake the @RegisterClass(BaseRealtimeBridge, 'TeamsBridge')
// registration. Calling the no-op here keeps the driver resolvable by the engine's ClassFactory.
LoadTeamsBridge();
