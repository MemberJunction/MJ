# Buzz (block/buzz) — study notes vs. the Composed Shell · 2026-07-23

> Prompted by Amith's pointer ("might be worth studying this for UX or other ideas").
> Buzz launched publicly 2026-07-21: Block's open-source team workspace (Slack + GitHub + CI +
> workflows collapsed into one product) where agents are first-class MEMBERS — profiles,
> presence, channel membership, signed authorship — talking ACP to Claude Code / Codex / Goose.
> Rust/Nostr relay, Tauri desktop, v0.4.x, unambiguously pre-1.0 (mobile, push, approval
> execution all unfinished). ~5.7k stars week one; 329-comment HN thread, mostly theoretical.
> Full digest in the workstream session log; sources: repo, Block launch + engineering posts,
> HN, press.

## Context difference that frames everything

Buzz is a TEAM workspace for developers (channels, branches-as-rooms, CI, PRs). MJ
Conversations is single-user-first for non-technical association staff, with group chat
deferred to Phase 2 (P1.8 = metadata only). Wholesale adoption is off-target; the value is in
convergences and two genuinely new ideas.

## Where Buzz VALIDATES locked decisions (use this, don't relitigate)

1. **Control-plane ≠ chat (validates D-S1).** Buzz routes agent progress telemetry and
   cancellation as ephemeral events that never appear as messages; durable records stay out of
   the chat stream. Independently identical instinct to our quiet meta line + earned Companion
   Rail + "progress is not a message." Two teams, same conclusion.
2. **Headless client parity (validates ADR-1).** Buzz's agent-first CLI is a full peer of the
   desktop app — same API, headless. That is exactly our runtime/widget split
   (ConversationsRuntime consumed headlessly by RealtimeWidget; shell as a mountable widget).
   Their design principle is our architecture doctrine.
3. **Approvals as first-class steps in the work record.** Their human-approval workflow gates
   (unfinished) = our shipped plan-mode approval cards + agent requests + Needs-you. We are
   AHEAD here.
4. **A persistent artifact layer ("canvases") so output doesn't scroll away** = our artifacts +
   versions + Studio Split + collections, which are more developed (append-only versions,
   lenses, curation). Parity-plus.
5. **Rooms materialize around work** (their branch-is-a-channel) rhymes with our Projects +
   the T1 escalation card (chat shaping into ongoing work → project) + Analyze (artifact →
   new conversation). Same instinct, our shapes.

## Parking lot (new ideas worth holding — none reopen a locked decision)

- **P-1 · Agent-to-agent @-mention injection MID-RUN.** Buzz's one genuinely novel primitive:
  a mention lands inside another agent's ACTIVE session near-instantly — the same gesture
  humans use steers a running agent. For MJ this is an agent-framework capability (BaseAgent /
  turn moderation), not shell UX — belongs with the P1.0.3 concurrency ADR / P2 lane. Flag to
  Amith.
- **P-2 · Agents as workspace MEMBERS with presence.** Profiles/rosters/persistent presence.
  MJ half-has this (avatars, pickers, mentions, co-agents); the full version belongs in
  P1.8's participant model — when Conversation Participants land, agents should be first-class
  participants, not a separate concept.
- **P-3 · Dual-authority provenance surfaced in UI** ("agent X did this under human Y's
  authority"). We have the substrate (run/note attribution, skills provenance); the UI framing
  of always-answerable "who + under whose authority" is worth carrying into run-inspector and
  memory-ledger polish. No crypto needed.

## Buzz's unsolved problems that are OUR P1.8/P2 homework (write into those specs)

- **Multiplayer-agent permissions**: what may an agent SAY in a room when it holds context
  from rooms some present humans can't see? Buzz scopes agents like humans (channel
  membership) and the HN critique (from a Slack engineer) is that this doesn't survive
  machine-scale context recombination. MJ enters P2 with a better substrate (RLS, permission
  engine, note scoping) — but the question must be answered explicitly in the group-chat spec.
- **The group-chat-with-agent noise dilemma** (silent per-user threads vs reply-to-everyone).
  Unsolved there; ours to solve in P1.8/P2.1 design.
- **Pull-model critique** ("agents waiting to be mentioned don't fit autonomous work") — MJ
  already answers this with Routines + OnChange monitoring. We're ahead; keep it that way.
- **Cross-boundary invitation (surfaced by this study, 2026-07-23)**: our share/invite flows
  assume the invitee already has an MJ account; "invite a colleague who isn't in MJ yet" from
  a project share dialog is undesigned. Layers: workspace identity = platform's job (Admin +
  auth auto-provision + Magic Links, NOT the shell's); resource sharing to existing users =
  shipped; project membership = Projects v1 (§E). The not-yet-a-user moment needs an explicit
  decision — Phase-1 punt (share-to-existing-only w/ honest empty state) vs a provisioning
  flow riding Magic Link machinery. Amith agenda (platform boundary).

## Verdict

No locked decision reopens. Two lines go on the Amith agenda (P-1 to the concurrency ADR
lane; P1.8 homework noted). The strongest use of this study is as CONVERGENT EVIDENCE for
D-S1 and ADR-1 in the umbrella conversation.
