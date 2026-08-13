export * from './teams-sdk';
export * from './teams-meeting-controls';
export * from './teams-bridge';
export * from './teams-native-sdk';
export * from './real-teams-bindings';
export * from './teams-graph-acs-client';
export * from './teams-ingress';
export * from './register-native';

import { LoadTeamsBridge } from './teams-bridge';
import { RegisterTeamsNativeSdk } from './register-native';

// Static reference so bundlers cannot tree-shake the @RegisterClass(BaseRealtimeBridge, 'TeamsBridge')
// registration. Calling the no-op here keeps the driver resolvable by the engine's ClassFactory.
LoadTeamsBridge();
// Register Teams's native two-way SDK binding so the engine auto-binds it at StartBridgeSession.
RegisterTeamsNativeSdk();
