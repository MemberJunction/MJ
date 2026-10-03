# Local hand-off notes: PR 3 (rooms + humans)

PR 3's deferred items. The ordered, program-wide guide is `LOCAL-HANDOFF.md` (on the schema branch); this file holds the detail for the items it references.

## PR 3 deferred to DB work

PR 3 ("Rooms accept phone calls, and humans can be brought in") was built under a hard rule: **no migrations, no new entities, no
CodeGen, no `metadata/` changes**. It works on the existing entities only (`MJ: AI Agent Sessions`, `MJ: AI Agent Session Bridges`,
`MJ: AI Agent Session Bridge Participants`, `MJ: AI Bridge Providers`, `MJ: AI Bridge Agent Identities`, `MJ: Conversations`,
`MJ: User Notifications`, `MJ: Users`). Everything below needs a table, a metadata row, or generated code, and is **not done**.

### 1. A database-backed offer registry (multi-instance)

**Today.** A handoff offer (a conversation an agent is offering a person) lives in `HandoffOfferRegistry`
(`packages/LiveKitRoomServer/src/room-handoff/handoff-offer-registry.ts`), a `BaseSingleton` holding a `Map` in the memory of one
process, with a 45 second offer timeout, a 5 minute retention for resolved offers and a cap of 10 pending offers per person. The
live push to the console is a PubSub topic (`HANDOFF_OFFER_CHANGES`), which is also per process.

**Why it matters.** With more than one MJAPI instance, the offer exists only on the instance that took the call. A person whose
Explorer is connected to a different instance sees nothing, and `AcceptHandoffOffer` against the wrong instance answers "no longer
available". A restart loses every pending offer (the call it belongs to also ends, so nothing is stranded, but the person never
sees it). Single-instance deployments are unaffected.

**What the DB version needs.** One table, roughly `HandoffOffer`: `ID`, `RoomName`, `TargetUserID` (FK to `MJ: Users`), `Mode`
(`warm`/`blind`), `Summary`, `CallerLabel`, `AgentName`, `AgentSessionID` (FK to `MJ: AI Agent Sessions`), `Status`
(`Pending`/`Accepted`/`Declined`/`Expired`/`Cancelled`), `ExpiresAt`, `ResolvedAt`. An accept/decline must be a compare-and-set on
`Status = 'Pending'` so two instances cannot both win. Cross-instance delivery of the live push needs the cluster's existing pub/sub
(the same mechanism the server cache uses for remote invalidation) rather than the in-process PubSub. The registry is used through a small surface
(`Create`, `Get`, `PendingForUser`, `ListForUser`, `ForRoom`, `ResolveForUser`, `Close`), so the swap is one class (async, with the
compare-and-set inside `ResolveForUser` and `Close`) plus the publisher seam.

**Until then:** run a single MJAPI instance for any deployment that uses human handoff (documented in `DEPLOYMENT.md` §6c and the
gotchas table).

### 2. A "Conversation Console" nav item in the Meet app

**Today.** The Conversation Console is an Explorer resource component registered as `HumanHandoffConsoleResource`
(`packages/Angular/Explorer/explorer-core/src/lib/resource-wrappers/human-handoff-console-resource.component.ts`). A `handoff-offer`
notification opens it, because `user-notifications.component.ts` builds the nav item **in code** (`ResourceType: 'Custom'`,
`DriverClass: 'HumanHandoffConsoleResource'`) and opens it in the Meet app, falling back to the current app. There is **no menu entry**
for it: a person who is not holding a notification cannot navigate to the console, and a person who is not looking at Explorer
learns of an offer only from the notification (and any email/SMS channel the notification type is configured with).

**What is needed.** An `MJ: Applications` / application nav item metadata row in `metadata/applications/.meet-application.json`
(label `Conversation Console`, icon `fa-solid fa-headset`, `ResourceType: 'Custom'`, `DriverClass: 'HumanHandoffConsoleResource'`),
then `mj sync push`. Once it exists, the notification handler can use `OpenNavItemByName('Conversation Console', ...)` like the Meet
room link does. Also worth deciding then: an unread-offers badge on the nav item (the widget already exposes the pending count).

### 3. A dedicated notification type

**Today.** Offers are announced through the existing **"Live Room Invite"** notification type
(`metadata/notifications/.live-room-invite-type.json`), with a `resourceConfiguration` of
`{ "type": "handoff-offer", "offerId": "...", "room": "..." }` that Explorer routes to the console. This reuses an invite type so no
metadata was needed, but it means an admin cannot give handoff offers their own delivery channels (for example SMS to the on-call
person) separately from meeting invites.

**What is needed.** A new `MJ: User Notification Types` row (for example "Conversation Handoff Offer"), with its own channel
defaults, and a one-line change in `NotificationHandoffNotifier` (`packages/MJServer/src/resolvers/HumanHandoffResolver.ts`) to name
it.

### 4. Direct (non-room) realtime widget escalation: designed, not built

PR 3 implements web escalation **for a visitor already in a LiveKit room**: start the agent with `EnableHandoff` and a `user`
transfer target gets an offer and joins the same room. The public web widget's *direct* realtime session (the browser talking to the
model without a LiveKit room) cannot be escalated this way, because there is no room to bring a person into.

**Design to build.** On an escalation request in a direct widget session, the server (a) creates a LiveKit room, (b) starts the
**same agent** in it on the **same conversation** (`RoomCallSessionStarter.StartRoomAgent` already takes a conversation and a
framing; this is the "web room starter" the SIP path uses), (c) returns a join token to the widget, which switches from its direct
transport to `mj-livekit-agent-room` in `join` mode, and (d) raises the human offer exactly as for a phone call. The widget then needs
a LiveKit-capable build (today it is a lightweight custom element) or must hand the visitor to a hosted join page. The guest
identity needs permission to mint a token for that one room only, which `MintLiveKitClientToken` does not restrict today (any signed-in
user can mint a token for any room name), so this needs a room-scoped guest grant first. That is a security and bundle-size decision
rather than a missing table, but it needs the widget schema work (`plans/realtime/bridges-and-widget/widget-schema-redesign.md`) to
land first.

### 5. Offers and per-user rate state are per process

Besides the registry (item 1): the outbound call limiter (`telephony.outbound.maxCallsPerUserPerHour`) and the concurrent-call
cap lease are also per process, as for the other carriers. A DB-backed or cluster-shared counter would fix all three together.

### 6. Not regenerated

The Angular class-registration manifests are produced at build time and are not committed, so adding the console and the offers
widget needed no manifest change. If a deployment commits a generated manifest, regenerate it (`mj codegen manifest`) so
`HumanHandoffConsoleResource` is included.
