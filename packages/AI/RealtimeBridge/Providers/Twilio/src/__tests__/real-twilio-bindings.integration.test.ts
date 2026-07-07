/**
 * @fileoverview CREDENTIAL-GATED Twilio integration test. Skipped entirely unless the
 * `TWILIO_TEST_*` env vars are present, so it NEVER runs in CI (no secrets, no spend, no PSTN).
 *
 * It exercises the real REST half of the binding (`RealTwilioRestClient` over the actual `twilio`
 * SDK) end-to-end: places a real outbound call to a test number and then ends it. Run locally with:
 *
 *   TWILIO_TEST_ACCOUNT_SID=AC... \
 *   TWILIO_TEST_AUTH_TOKEN=...    \
 *   TWILIO_TEST_FROM=+1...        \  # a Twilio number you own
 *   TWILIO_TEST_TO=+1...          \  # a capped-spend test number that auto-answers
 *   npm run test -- real-twilio-bindings.integration
 *
 * The full media-plane round-trip (Media Streams audio in/out through the agent) requires the MJAPI
 * ingress + a publicly reachable stream URL — see plans/realtime/bridges-and-widget/spikes/T1-twilio-ingress-notes.md
 * and the manual runbook; it is not automatable here.
 */
import { describe, it, expect } from 'vitest';
import { RealTwilioRestClient } from '../twilio-rest-client.js';
import { buildConnectStreamTwiML } from '../real-twilio-bindings.js';

const env = process.env;
const HAVE_CREDS = !!(env.TWILIO_TEST_ACCOUNT_SID && env.TWILIO_TEST_AUTH_TOKEN && env.TWILIO_TEST_FROM && env.TWILIO_TEST_TO);

describe.skipIf(!HAVE_CREDS)('RealTwilioRestClient (integration — live Twilio)', () => {
    it('places a real outbound call and ends it', async () => {
        const rest = new RealTwilioRestClient({
            AccountSid: env.TWILIO_TEST_ACCOUNT_SID!,
            AuthToken: env.TWILIO_TEST_AUTH_TOKEN!,
        });
        const streamUrl = env.TWILIO_TEST_STREAM_URL ?? 'wss://example.invalid/telephony/twilio/media';

        const callSid = await rest.CreateCall({
            To: env.TWILIO_TEST_TO!,
            From: env.TWILIO_TEST_FROM!,
            Twiml: buildConnectStreamTwiML(streamUrl),
        });
        expect(callSid).toMatch(/^CA[0-9a-f]{32}$/i);

        // Hang it up so a LIVE call does not keep ringing / running up spend. Twilio TEST
        // credentials return a Call SID for the magic From/To but no persistent call exists,
        // so the follow-up update 404s — tolerate ONLY that (it confirms test-cred mode);
        // any other failure on a live call is a real problem and rethrows.
        try {
            await rest.UpdateCall(callSid, { Status: 'completed' });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            if (!/was not found|not found|404/i.test(message)) {
                throw err;
            }
        }
    });
});
