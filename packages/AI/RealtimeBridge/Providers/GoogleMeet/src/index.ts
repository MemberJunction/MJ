export * from './googlemeet-sdk';
export * from './googlemeet-meeting-controls';
export * from './googlemeet-bridge';

import { LoadGoogleMeetBridge } from './googlemeet-bridge';

// Static reference so bundlers cannot tree-shake the @RegisterClass(BaseRealtimeBridge, 'GoogleMeetBridge')
// registration. Calling the no-op here keeps the driver resolvable by the engine's ClassFactory.
LoadGoogleMeetBridge();
