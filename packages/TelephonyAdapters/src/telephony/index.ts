/**
 * @fileoverview Telephony and meetings exports for @memberjunction/telephony-adapters.
 *
 * @module @memberjunction/telephony-adapters
 */

// ── Shared carrier plumbing: run-as identity, outbound gate, media-socket auth, call lifecycle ──
export * from './runAsIdentity.js';
export * from './outboundCallPolicy.js';
export * from './mediaSocketAuth.js';
export * from './callLifecycleTracker.js';
export * from './callEndObserver.js';
export * from './telephonySettings.js';
export * from './callerIdentity.js';
export * from './telephonyCapacity.js';
export * from './telephonyCallTools.js';
export * from './telephonyCallSession.js';
export * from './webhookParams.js';

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

// ── RingCentral SIP softphone ──────────────────────────────────────────────────────────
export { RingCentralTelephonyService, type RingCentralTelephonyServiceDeps } from './RingCentralTelephonyService.js';
export * from './ringcentral-runtime.js';

// ── Teams meetings (Microsoft Graph cloud-communications + ACS application-hosted media) ──
export * from './teamsAcsMediaRegistry.js';
export * from './TeamsMeetingsService.js';
export * from './TeamsMeetingsRouter.js';
export * from './teams-meetings-runtime.js';

// ── Scheduled / invite-driven meeting join loop ────────────────────────────────────────
export * from './calendar-scheduler.js';
