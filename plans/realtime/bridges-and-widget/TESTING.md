# Bridges & Widget — Quick Test Runbook

Fast, copy-paste verification for everything in this program. Ordered by **what you can test
right now with the keys already in `.env`** first, then vendor-credential-gated, then entitlement-gated.

> **Servers you run yourself** (this runbook never starts them): MJAPI on **:4008**, and `ngrok`
> for the Twilio webhook/media (public URL cycles — re-point `TWILIO_STREAM_PUBLIC_URL` +
> `MJAPI_PUBLIC_URL` + the Twilio number's webhook when it changes).

## Constants (this instance)

| Thing | Value |
|---|---|
| MJAPI base URL | `http://localhost:4008` |
| Sage agent-identity ID | `1ABDE953-DBD3-401F-998C-FA6C4D5801A4` |
| Sage telephony number | `+18669016546` |
| Widget public key | `pk_test_example_support_widget` (modality **Both**, pinned agent **Sage**) |
| Widget host-page origin | `http://localhost:8080` (whitelisted in the instance's `AllowedOrigins`) |
| Widget routes | `POST /widget/session`, `/widget/session/refresh`, `/widget/upgrade` |

---

## Tier 1 — testable now (Twilio + OpenAIRealtime keys + live DB)

### 1. Twilio inbound — ✅ proven
Call the Sage number. Webhook → signature verify → agent resolve → realtime model → WS media → audio. Done.

### 2. Twilio outbound — ✅ proven
From MJExplorer's GraphQL playground (must be authenticated — outbound reads the current user):
```graphql
mutation {
  PlaceTwilioCall(
    agentIdentityId: "1ABDE953-DBD3-401F-998C-FA6C4D5801A4"
    toNumber: "+1YOUR_CELL"
  ) { Success CallSid ErrorMessage }
}
```
Your phone rings; you talk to Sage.
- **Caller-ID caveat:** the from-number is the agent identity's `FromNumber` (`+18669016546`). For
  outbound it must be a number **provisioned on your Twilio account**, or Twilio rejects it (error 21210).
  If it isn't, point the Sage agent-identity row at a number you own for the outbound test.

### 3. Widget — two-guest page (text + shadow-DOM isolation)
Bundle is already built (`packages/Web/Widget/dist/mj-widget.js`). Serve the host page on the
whitelisted origin and open the harness:
```bash
# from repo root — static server rooted at the Widget package so the page can reach ../dist
npx http-server packages/Web/Widget -p 8080 -c-1
# then open:
open http://localhost:8080/examples/two-widgets.html
```
Verify, per the on-page checklist:
- The loud yellow/purple/hotpink host CSS does **not** bleed into either widget (shadow DOM), and the widgets don't restyle the page.
- A guest can hold a **text** conversation with Sage with **no MJ login**.
- Guest A and Guest B are **separate** conversations (two distinct minted `ExternalID`s).

### 4. Widget — voice
Same page; click the mic in either widget and talk (modality is **Both**). Uses the *client-direct*
realtime topology (no dependency on the server-bridged media plane / P5). Voice ceiling
(`VoiceMaxSessionMinutes = 10`) is enforced server-side at the realtime mint.

### 5. Widget — cross-guest RLS isolation (authoritative, server-side)
The UI test in #3 shows separation; this proves the **server** enforces it. Each guest session carries
an `ExternalID` and an `mj_scopes` claim. With Guest B's token, attempt to read Guest A's data:
```bash
# Grab each guest's token from devtools → Network → the /widget/session response (field: token),
# and the ExternalID from the same payload. Then, as GUEST B, query GUEST A's conversation:
curl -s http://localhost:4008/ \
  -H "Authorization: Bearer <GUEST_B_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"query":"query($f:String!){ conversations(ExtraFilter:$f){ ID ExternalID } }","variables":{"f":"ExternalID='\''<GUEST_A_EXTERNALID>'\''"}}'
# EXPECT: empty result set — the RLS filter (Widget Guest: Own Conversations) blocks it.
```
Repeat for Conversation Details (`Widget Guest: Own Conversation Details`). Both must return empty for
the other guest's ID and non-empty for the caller's own ID.

### 6. Widget — magic-link upgrade
From a guest session, trigger the upgrade (`POST /widget/upgrade`), complete the magic link, and confirm
the session escalates to a resolved account while preserving the in-progress conversation.

---

## Tier 2 — needs one vendor account each (near-repeats of Twilio)

Vonage and RingCentral are code-complete + unit-tested; mutations `PlaceVonageCall` / `PlaceRingCentralCall`
exist. To test live:
1. Add the vendor's block to `mj.config.cjs` (mirror the Twilio block; `enabled` gated on its account SID/key).
2. Point a vendor number's webhook at your ngrok URL: `/telephony/vonage/...` or `/telephony/ringcentral/webhook`;
   media WSS at `/telephony/vonage/media` or `/telephony/ringcentral/media`.
3. Repeat Tier-1 steps 1–2 with the vendor mutation.

Deltas from Twilio (documented in `spikes/T2-T3-vonage-ringcentral-notes.md`):
- **Vonage:** NCCO + WebSocket-media instead of TwiML; signs the connection.
- **RingCentral:** `Validation-Token` registration handshake + `verification-token` per delivery instead of HMAC signature.

---

## Tier 3 — entitlement-gated (not pure-code)

- **Teams meetings:** needs an Azure app registration with ACS application-hosted media + Graph
  cloud-communications entitlements (procurement/admin). Binding is wired (`spikes/M1-teams-binding-notes.md`);
  it's the one capability that depends on the **server-bridged media plane (P5)**, tracked separately.
- **Slack huddles:** formally parked pending huddle-media-API verification (`spikes/M0-slack-media-findings.md`).

---

## If something breaks — quick triage

| Symptom | Likely cause |
|---|---|
| Widget mount fails, CORS error in console | host page not on a whitelisted origin → serve on **:8080** (or add your origin to the instance's `AllowedOrigins`) |
| Widget mount fails, 4xx from `/widget/session` | MJAPI not on :4008, or `widget.enabled` not set, or wrong `pk_` key |
| Inbound call says "no agent available" | realtime key missing under `AI_VENDOR_API_KEY__OpenAIRealtime` (driverClass-specific) |
| Inbound call: "No 'From' number specified" | `Direction` not in bridge Configuration — fixed in `buildSessionConfiguration`; rebuild MJServer |
| Twilio 31920 / WS upgrade 400 | media WSS path not routed — the single upgrade dispatcher must own the `upgrade` event |
| Audio "deep/slowed down" | sample-rate mismatch — base bridge resamples 8kHz μ-law ↔ model PCM; rebuild `ai-bridge-base` |
| Outbound rejected, Twilio 21210 | caller-ID number not owned on the Twilio account (see step 2 caveat) |
