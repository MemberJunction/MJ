# M0 — Slack huddle media-access verification spike: findings

**Status:** DONE (investigation only — no code). **Verdict: NO-GO.**
**Date:** 2026-06-24
**Acceptance criterion:** _"a written go/no-go in this doc with the evidence."_ ✅ met (summary below; gate recorded in [`../meeting-vendor-bindings-teams-slack.md`](../meeting-vendor-bindings-teams-slack.md) §M0).

## Verdict: NO-GO — park Slack as a realtime media bridge

There is **no supported, documented way for a bot/app to join a Slack huddle and access
real-time audio media** (send or receive frames). Slack publicly documents huddle
*signaling* only. Every commercial "huddle media" product achieves it via system-audio /
screen capture on a **logged-in human user's desktop session** — not via any Slack media
API. The `SlackBridge` driver's "bot-join-with-media" assumption is **invalid**.

## Evidence chain (key points; full URLs at bottom)

1. **`calls.*` API ≠ huddle media.** Slack: *"The Calls API provides a way for your call app
   to tell Slack about the calls you're making… Slack doesn't make the call."* `calls.add`
   registers a Call object for UI display (scope `calls:write`). No audio stream, no huddle.
2. **Only huddle API primitive is signaling.** `user_huddle_changed` (Events API) carries
   `huddle_state` / `huddle_state_call_id` / participants — *"identical to user_change"*. No media.
3. **Amazon Chime backend is closed.** Slack huddles run on the Amazon Chime SDK, chosen so
   *"Slack [can] control the security posture of the media session."* Joining a Chime meeting
   needs an attendee token minted by the owner (Slack); Slack does not expose it to third parties.
4. **No Enterprise Grid / partner / DLP media path.** Discovery API covers messages & files for
   eDiscovery/DLP — not huddle media. No partner program grants huddle media participation.
5. **Precedent confirms it.** Recall.ai (sells a "Slack Huddles API") states plainly: *"Slack's
   official APIs provide no access to huddle recordings… Slack does not provide an API."* They
   use a **Desktop Recording SDK** (system capture, *"no meeting bots"*, requires a present human).
   This cannot run headless / as a bot identity.
6. **Contrast (why Teams/Twilio differ):** Teams app-hosted media bots get a frame-by-frame
   send/receive media socket via `Calls.AccessMedia.All` (Graph). Twilio Media Streams give
   bidirectional call audio over WebSocket (`<Connect><Stream>`). Slack offers neither for huddles.

## What would unblock a future re-evaluation

Re-check Slack ONLY if one of these appears:
1. A **huddle media / RTM bot API** (a Teams-`AccessMedia` or Twilio-`<Stream>` equivalent) with a real OAuth scope.
2. A **supported Chime SDK passthrough** that mints an attendee join token for an app.
3. A formal **partner program** granting vetted apps huddle media participation.
4. A **server-side huddle-recording export API** (post-hoc media, not realtime, but a start).

## Action taken

- Slack provider row should be set `Status='Disabled'` (M3 stays closed). The `SlackBridge`
  driver scaffold remains valid + unit-tested against its fake; it is NOT deleted — it is parked
  with this blocker documented so no one builds against the phantom media capability.

### Sources
- https://docs.slack.dev/apis/web-api/using-the-calls-api/
- https://docs.slack.dev/reference/methods/calls.add
- https://docs.slack.dev/reference/events/user_huddle_changed/
- https://slack.com/help/articles/360002079527-A-guide-to-Slacks-Discovery-APIs
- https://aws.amazon.com/blogs/business-productivity/customers-like-slack-choose-the-amazon-chime-sdk-for-real-time-communications/
- https://www.recall.ai/blog/get-recordings-and-transcripts-from-slack-huddles-api
- https://www.recall.ai/product/desktop-recording-sdk
- https://learn.microsoft.com/en-us/microsoftteams/platform/bots/calls-and-meetings/real-time-media-concepts
- https://www.twilio.com/docs/voice/media-streams

> _Process note: the `deep-research` skill could not be invoked in this sandbox — its PreToolUse
> security hook errored under `/bin/sh` with `set: Illegal option -o pipefail`. Investigation was
> run directly via web search/fetch instead. Worth fixing that hook's shell if deep-research is
> meant to be usable here._
