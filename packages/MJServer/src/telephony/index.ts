/**
 * @fileoverview Public exports for the MJAPI telephony + meetings ingress.
 *
 * Each vendor ingress is a quartet: a per-call media registry, a bridge-orchestration service, an
 * Express/WSS router (the `create*Handler` factory + mount-path consts), and a process-wide runtime
 * holder (`Set*`/`Get*`). The routers + runtimes are star-exported; the service + registry modules are
 * re-exported by name to avoid star-export ambiguity on their internal, per-vendor-identical helper
 * types (`InboundCallInput`, `InboundCallResult`, `ITelephonyMediaSocket`). Those internal types are
 * not part of the package's public surface — code that needs them imports from the source module.
 *
 * @module @memberjunction/server/telephony
 */

// ── Shared WebSocket-upgrade dispatcher (routes GraphQL + all media sockets by path) ──────
export * from './media-upgrade-router.js';

// ── Twilio Programmable Voice + Media Streams ──────────────────────────────────────────
export { TwilioCallMediaRegistry } from './twilioMediaRegistry.js';
export { TwilioTelephonyService, type TwilioTelephonyServiceDeps } from './TwilioTelephonyService.js';
export * from './TwilioTelephonyRouter.js';
export * from './telephony-runtime.js';

// ── Vonage Voice + WebSocket-media ─────────────────────────────────────────────────────
export { VonageCallMediaRegistry } from './vonageMediaRegistry.js';
export { VonageTelephonyService, type VonageTelephonyServiceDeps } from './VonageTelephonyService.js';
export * from './VonageTelephonyRouter.js';
export * from './vonage-runtime.js';

// ── RingCentral SIP softphone (the only RingCentral transport with bidirectional call audio) ──
// No media registry / webhook router: the softphone is an outbound SIP registration that receives inbound
// INVITEs directly. The service owns the registration; the runtime holder shares it with the outbound
// PlaceRingCentralCall resolver.
export { RingCentralTelephonyService, type RingCentralTelephonyServiceDeps } from './RingCentralTelephonyService.js';
export * from './ringcentral-runtime.js';

// ── Teams meetings (Microsoft Graph cloud-communications + ACS application-hosted media) ──
export * from './teamsAcsMediaRegistry.js';
export * from './TeamsMeetingsService.js';
export * from './TeamsMeetingsRouter.js';
export * from './teams-meetings-runtime.js';

// ── Scheduled / invite-driven meeting join loop (M2: calendar watcher + due-bridge runner) ──
export * from './calendar-scheduler.js';
