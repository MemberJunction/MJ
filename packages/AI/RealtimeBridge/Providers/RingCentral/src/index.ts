// The default (unbound) telephony SDK + the thin bridge driver. The server binds the real SIP-softphone
// SDK at runtime via StartBridgeSession's BindSdk (it owns the process-wide registration handle), mirroring
// how the Twilio/Vonage services bind their SDKs — so there is no auto-register here.
export * from './ringcentral-call-sdk';
export * from './ringcentral-bridge';

// The duplex SIP-softphone path: structural SDK surfaces, the realtime RTP sender, the per-call SDK, and the
// shared registration handle (constructed + registered by the server's softphone manager at boot).
export * from './softphone-types';
export * from './realtime-rtp-sender';
export * from './ringcentral-softphone-call-sdk';
export * from './ringcentral-softphone-handle';

import { LoadRingCentralBridge } from './ringcentral-bridge';

// Static reference so bundlers cannot tree-shake the @RegisterClass(BaseRealtimeBridge, 'RingCentralBridge')
// registration. Calling the no-op here keeps the driver resolvable by the engine's ClassFactory.
LoadRingCentralBridge();
