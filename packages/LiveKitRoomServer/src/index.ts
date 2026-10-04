/**
 * @fileoverview Public entry point for `@memberjunction/livekit-room-server`.
 *
 * Server-side LiveKit room support for MemberJunction: scoped token minting + the agent-room session-start
 * coordinator that bridges a realtime model session into a LiveKit room.
 *
 * @module @memberjunction/livekit-room-server
 */

import { LoadLiveKitBridge } from '@memberjunction/ai-bridge-livekit';

// The coordinator's StartAgentRoomSession resolves the 'LiveKitBridge' driver via the engine's
// ClassFactory, so its @RegisterClass registration MUST have run. Importing the driver package here —
// the server-side LiveKit layer that DEPENDS on the driver — guarantees it: loading this package (which
// MJServer does) registers the bridge. The no-op call is a tree-shake guard. Without this the room start
// fails with "No bridge driver registered for DriverClass 'LiveKitBridge'".
LoadLiveKitBridge();

export { LiveKitTokenService, LiveKitUserIdentity, type LiveKitServerConfig, type LiveKitTokenRole, type MintTokenParams, type MintedToken } from './livekit-token-service';

export {
  LiveKitAgentRoomCoordinator,
  LIVEKIT_BRIDGE_DRIVER_CLASS,
  type BridgeOps,
  type RealtimeSessionFactory,
  type RealtimeSessionStartContext,
  type AgentRoomHostOptions,
  type StartAgentRoomSessionParams,
  type AgentRoomSession,
} from './livekit-agent-room-coordinator';

export { LiveKitEgressService, WsToHttpUrl, wsToHttpUrl, type EgressClientLike, type StartRecordingParams, type RecordingInfo } from './livekit-egress-service';

export {
  LiveKitSipService,
  LIVEKIT_PARTICIPANT_KIND_SIP,
  LIVEKIT_SIP_ATTRIBUTES,
  SIP_DIAL_REQUEST_TIMEOUT_SECONDS,
  SIP_DIAL_MAX_DURATION_SECONDS,
  type SipClientLike,
  type RoomServiceClientLike,
  type RoomParticipantSummary,
  type SipTrunkSummary,
  type DialSipParticipantParams,
  type EnsureInboundRoutingParams,
  type InboundRoutingResult,
} from './livekit-sip-service';

export { LiveKitWebhookParser, type LiveKitRoomWebhookEvent, type WebhookReceiverLike } from './livekit-webhook';

export * from './room-handoff/handoff-types';
export * from './room-handoff/handoff-offer-registry';
export * from './room-handoff/room-handoff-engine';
