# Local hand-off: finishing the telephony, rooms and contact-center program

The telephony / rooms / contact-center work was built in a sandbox with **no database**. Everything that needs a
database (migrations applied, CodeGen, metadata pushes, code against new entity types, live calls) is collected
here, in the order to do it. Start at Part 0 and work down. A local agent can follow this file end to end.

Per-PR detail lives beside this file and is linked from the relevant step:

| File | Written by | Covers |
|---|---|---|
| `LOCAL-HANDOFF.md` (this file) | schema branch | Order of operations, core schema steps, every post-CodeGen task |
| [`LOCAL-HANDOFF-PR3.md`](./LOCAL-HANDOFF-PR3.md) | PR 3 branch | Rooms + humans: what was left out and why |
| [`LOCAL-HANDOFF-PR4.md`](./LOCAL-HANDOFF-PR4.md) | PR 4 branch | Turn-taking + test bed: what was left out and why |
| `bizapps-contact-center/LOCAL-HANDOFF.md` | contact-center app repo | App migration, CodeGen, tasks T1-T10 |
| [`LIVE-CALL-CHECKLIST.md`](./LIVE-CALL-CHECKLIST.md) | all PRs | Live verification rows |

---

## Part 0 - Order of operations

1. **Merge the code PRs** (none needs a database):
   - #5023 PR 1, safety: already merged.
   - #5026 PR 2, agent parity.
   - Then retarget **#5030** (PR 3, rooms + humans) and **#5029** (PR 4, turn-taking) from
     `telephony-pr2-agent-parity` to `next` and merge both. They touch separate code and can merge in either order.
2. **Check out `telephony-schema-core`** (draft #5027) on top of the merged `next` and do Part 1 there: apply
   the migration, run CodeGen, append the output, commit, and take #5027 out of draft.
3. **Contact-center app** (Part 2): only after Part 1, because its migration has real foreign keys to the core tables.
4. **Post-CodeGen code** (Part 3): one PR per lettered task, each against `next` after #5027 merges.
5. **Live verification** (Part 4).

Use a database no other session or agent is using (`DB_DATABASE` in `.env`). Two CodeGen runs against one
database corrupt each other and both report success.

---

## Part 1 - Core schema (branch `telephony-schema-core`)

**What the branch adds:** one migration,
`migrations/v6/V202610032200__v6.2.x__Telephony_PhoneNumber_NumberPool_Interaction.sql`. It is the **only DDL in MJ
core for the whole program**: eight new tables plus one nullable column on a shipped table.

| # | Object | Purpose |
|---|---|---|
| 1 | `NumberPool` | Named group of numbers with a caller-ID selection rule |
| 2 | `PhoneNumber` | An owned E.164 number, its capabilities, status, pool |
| 3 | `Interaction` | One live conversation on any channel (Phone / Web / Meeting), with recording flag and cost |
| 4 | `InteractionEvent` | Append-only lifecycle log (offered, transferred, recording started, ended, ...) |
| 5 | `InteractionLink` | Polymorphic link to any record (caller, regarding, created), like `TaggedItem` |
| 6 | `InteractionOffer` | Durable hand-off offer to a person (replaces PR 3's in-memory registry) |
| 7 | `Meeting` | Zoom-style meeting in Explorer: ad hoc or scheduled, dial-in, recording policy, transcript |
| 8 | `MeetingParticipant` | Invited or present user, AI agent or external guest |
| 9 | `AIAgentSessionBridge.TurnAddressing` | Records Auto / ModelSide / Regex per bridged agent (PR 4) |

It contains hand-written DDL and extended properties only. The CodeGen output is deliberately missing; you generate
and append it. CI's `check:codegen-tail` reports drift until you do; that is expected.

**Not in this branch (by design):** TypeScript against the new tables, any `migrations-pg/` counterpart (the build
engineer converts at release), and `metadata/` seed rows (none needed; the CHECK value lists are the vocabulary).

### Steps

1. **Apply the migration.**
   ```bash
   pnpm run mj:migrate
   ```
   Confirm the eight tables exist in `__mj` and `AIAgentSessionBridge` has `TurnAddressing`. They depend on shipped
   tables `AIBridgeProvider`, `AIAgentSession`, `AIAgentSessionBridge`, `AIAgent`, `User`, `Entity` and `Conversation`.

2. **Run CodeGen** (full run; this is a schema change):
   ```bash
   pnpm run mj:codegen
   ```
   It creates the `Entity`, `EntityField` and `EntityRelationship` rows, the base views, the
   `spCreate`/`spUpdate`/`spDelete` procedures and grants, and regenerates the entity classes, the MJServer resolvers
   and the Explorer forms. `AIAgentSessionBridge`'s view and procedures are regenerated for the new column. If CodeGen
   reports `success: false`, or per-entity field and view-column counts disagree, run it a second time (a new
   virtual column can appear one pass late).

3. **Append the CodeGen SQL to the migration.** Paste the whole generated `migrations/v6/CodeGen_Run_*.sql` at the
   bottom of the migration, below the `CODEGEN OUTPUT TO BE APPENDED LOCALLY` banner (the 56 blank lines and the banner
   are already there; keep them). Delete the standalone `CodeGen_Run_*.sql`. If the run also regenerated unrelated
   objects because your database was not at the last released version, leave those out and say so in the banner.

4. **Check the Sequence rule.** Every `EntityField` INSERT in the appended block must use the apply-time
   `(SELECT COALESCE(MAX([Sequence]), 0) + 1 ...)` expression, never a literal:
   ```bash
   node .github/scripts/check-migration-entityfield-sequence.mjs
   ```

5. **Build and verify.**
   ```bash
   cd packages/MJCoreEntities && pnpm run build
   cd ../.. && pnpm run check:codegen-tail      # must now pass
   pnpm run check:changeset
   ```
   Commit the migration (with its CodeGen tail), the regenerated entity classes, the MJServer generated resolvers and
   the Explorer generated forms together. Never commit `mj.config.cjs` or the generated host folders.

6. **Revert any `sync` write-backs** under `metadata/` if you ran `mj sync push`.

### Generated entity names to expect

| Table | Entity name | Generated class |
|---|---|---|
| `NumberPool` | `MJ: Number Pools` | `MJNumberPoolEntity` |
| `PhoneNumber` | `MJ: Phone Numbers` | `MJPhoneNumberEntity` |
| `Interaction` | `MJ: Interactions` | `MJInteractionEntity` |
| `InteractionEvent` | `MJ: Interaction Events` | `MJInteractionEventEntity` |
| `InteractionLink` | `MJ: Interaction Links` | `MJInteractionLinkEntity` |
| `InteractionOffer` | `MJ: Interaction Offers` | `MJInteractionOfferEntity` |
| `Meeting` | `MJ: Meetings` | `MJMeetingEntity` |
| `MeetingParticipant` | `MJ: Meeting Participants` | `MJMeetingParticipantEntity` |

Verify against `packages/MJCoreEntities/src/generated/entities/__mj.ts` after CodeGen; that file is the source of truth.
Expect string-union types from every `IN (...)` CHECK (`Channel`, `Direction`, `Status`, `EventType`, `Role`, `Mode`,
`SelectionRule`, `Capabilities`, `RecordingPolicy`, `InviteStatus`, `TurnAddressing`). `PhoneNumber.Number` is `.Number`.

### Things to review in the CodeGen output

- **`InteractionEvent` is append-only.** Consider turning `TrackRecordChanges` off for it (every row is already an
  event) and add the server-side guard in task 3A.
- **Compound CHECKs** (`CK_PhoneNumber_E164`, `CK_MeetingParticipant_ExternalPhoneE164`, `CK_Meeting_DialInCodeDigits`,
  `CK_MeetingParticipant_ExactlyOneKind`) must not turn into bogus value lists. Confirm CodeGen skipped them.
- **`InteractionLink.RecordID`** is `NVARCHAR(450)` to match `TaggedItem.RecordID` and stay inside the index key limit.
- **`Meeting.DialInCode`** is a meeting join code, not a credential; it is fine as plain text, but make sure the
  generated form does not show it to non-hosts (task 3D).

---

## Part 2 - Contact-center Open App (`bizapps-contact-center`)

The app's repository is `MemberJunction/bizapps-contact-center` (create it if it does not exist yet; the initial history
was authored locally). Follow that repository's `LOCAL-HANDOFF.md`: Part 1 applies the app migration (16 tables in its
own schema, with foreign keys up to `PhoneNumber`, `NumberPool`, `Interaction`, `User`, `AIAgent`, `Entity` and
`__mj_BizAppsCommon.Person`), runs CodeGen scoped to the app schema and appends the output; Part 2 is tasks T1-T10
(routing engine wiring, queues with wait estimates, assignment strategies, business hours, escalation, campaign dialer
with calling hours and do-not-call, dashboards). Before you start, raise its `@memberjunction/*` pins from
`6.1.0-edge.5` to the version that contains #5027.

---

## Part 3 - Post-CodeGen code in MJ core

One PR per lettered task, against `next` after #5027 merges. Use the generated entity classes and typed properties
only (no `.Get()`/`.Set()`), pass `contextUser` server-side, and check every `Save()`/`Delete()` boolean.

### 3A. Record an Interaction per call and per room

- In the telephony session starters (Twilio / Vonage / RingCentral: `TelephonyCallSessionStarter`; LiveKit SIP:
  `RoomCallSessionStarter` / `LiveKitSipTelephonyService`), create an `Interaction` (`Channel='Phone'`, `Direction`,
  `PhoneNumberID`, `RemoteAddress`, `ExternalID` = carrier call id, `AgentSessionID`, `RoomName`).
- Web rooms that use `EnableHandoff` create one with `Channel='Web'`; meetings with `Channel='Meeting'`.
- Write `InteractionEvent` rows at created / answered / offered / accepted / declined / transferred / escalated /
  recording started / recording stopped / ended, and close the row with `EndedAt` and `EndReason`. Mark `Abandoned`
  when the caller leaves before an answer.
- `InteractionLink` rows for the caller (`Role='Caller'`, the Person resolved by `ICallerIdentityResolver`), the
  subject (`Regarding`) and anything the agent creates (`Created`).
- `CostEstimate`: duration times a per-provider rate from configuration (the carrier's own cost API can replace it later).
- Server-side entity subclass for `InteractionEvent` that refuses update and delete.
- Inbound routing by number: resolve the dialed number to its `PhoneNumber` row before falling back to the
  agent-identity lookup.
- Outbound number pools: a selector over `NumberPool` / `PhoneNumber` implementing `RoundRobin`, `LocalPresence`
  and `Random`, honouring `PhoneNumber.Status='Active'` and `MaxConcurrentPerNumber` (count active `Interaction` rows).

### 3B. Durable hand-off offers (PR 3 item 1)

Replace `HandoffOfferRegistry`'s in-memory map with `MJ: Interaction Offers` (see
[`LOCAL-HANDOFF-PR3.md`](./LOCAL-HANDOFF-PR3.md) item 1 for the surface). Accept and decline are a compare-and-set on
`Status = 'Pending'` so two instances cannot both win (do it in one `RunInEntityTransaction` that reloads the row
and checks `Status` before saving). Expire pending offers past `ExpiresAt` on read and in a sweep. Publish the live
change through the cluster pub/sub, not only the in-process PubSub. Keep the existing per-user cap (10 pending).
After this, remove the "single MJAPI instance" caveat from `DEPLOYMENT.md` §6c.

### 3C. Persist turn addressing (PR 4 item 3)

Write the resolved addressing mode to `AIAgentSessionBridge.TurnAddressing` when `AIBridgeEngine` creates the bridge
row (`ActiveBridgeSession.AddressingMode`). Optional per-agent defaults and a persisted turn-event log stay deferred
(see [`LOCAL-HANDOFF-PR4.md`](./LOCAL-HANDOFF-PR4.md) items 2-4).

### 3D. Meetings in MJ Explorer (PR 6)

Built on the shared room components (`ng-livekit-room` L1, `mj-livekit-room` L2) and the Meet application.

- **Server.** A `MeetingResolver` (or Remote Operation) to create, schedule, start, end and cancel meetings. The
  `RoomName` is always generated (`mj-mtg-<uuid>`), never user-chosen. Only the host or a co-host may change a meeting.
- **Room authorization.** This is the security item to land first. Token minting for a room tied to a `Meeting` must
  check that the user is the host or a `MeetingParticipant`; for a room tied to an `InteractionOffer`, that the user
  accepted it. Apply the same check to `MintLiveKitClientToken`, `StartLiveKitAgentRoomSession`, `StopLiveKitAgentRoomSession`, `EndLiveKitRoom`, `InviteUsersToLiveKitRoom`, `StartLiveKitRecording` and
  `GetLiveKitRoomTurnState`. Today any signed-in user can join any room by name.
- **Invitations.** `MeetingParticipant` rows, a "Meeting Invitation" notification type, and RSVP updates to
  `InviteStatus`. External guests get a link through the existing magic-link flow, scoped to that one room.
- **Phone dial-in.** When `AllowPhoneDialIn`, a LiveKit SIP dispatch for the meeting's `DialInPhoneNumberID`; the caller
  enters `DialInCode` (DTMF) to be placed in the room. Generate codes randomly (at least 6 digits) and refuse a code
  already used by another live meeting on the same number. Rate-limit wrong codes per caller number.
- **AI agents as participants.** `Role='Agent'` rows start agents through `LiveKitAgentRoomCoordinator` when the
  meeting goes live; PR 4's turn-taking applies.
- **Recording.** Honour `RecordingPolicy`: announce to every participant (spoken for phone legs, a banner for browser
  legs) before egress starts, write `RecordingStarted` / `RecordingStopped` events on the meeting's `Interaction`, and
  link the file through the meeting's `Conversation` (the existing `RegisterMeetingRecordingFile` path).
- **UI.** L2 widgets with no Router imports: meeting list, schedule form, participant picker, lobby. An L3 "Meetings"
  resource in the Meet app that calls `NotifyLoadComplete()`. Design tokens only, `mj-loading`, confirm buttons left.

### 3E. Operations dashboards

An L3 dashboard over `MJ: Interactions` / `MJ: Interaction Events`: volume by channel and direction, answer rate,
abandonment, average handle time, transfers and escalations, cost by day and by number, and live calls now. Load with
one `RunViews` batch and aggregate in memory. Queue and agent-occupancy views belong in the contact-center app (T-tasks).

### 3F. Metadata (push with `mj sync push`; the release build folds it into the consolidated Metadata_Sync)

- Meet application nav items: **Conversation Console** (`HumanHandoffConsoleResource`, `fa-solid fa-headset`),
  **Meetings** (3D) and, optionally, **Agent test bed** (PR 4 item 1).
- Notification types: **Conversation Handoff Offer** (then switch `NotificationHandoffNotifier` to it) and
  **Meeting Invitation**.
- Revert `sync` write-backs before committing a feature PR.

---

## Part 4 - Live verification

Run [`LIVE-CALL-CHECKLIST.md`](./LIVE-CALL-CHECKLIST.md) end to end against a real Twilio number, a LiveKit Cloud project
with SIP enabled, and both full-duplex models. The rows most likely to need fixes:

- LiveKit SIP SDK calls and webhook attribute names (PR 3).
- Whether GPT-Live and Gemini 3.8 Live actually call `i_am_addressed` / `yield_turn` (PR 4).
- Twilio Elastic SIP trunk settings (PR 3).
- Vonage outbound (PR 2) and RingCentral (unproven since the assessment).

### Acceptance checks

- `pnpm run test:integration` passes, and every touched package's `pnpm test` passes.
- An inbound call to a configured number reaches the right agent, has an `Interaction` with events, and ends cleanly.
- A warm transfer to a person in the Conversation Console works with two MJAPI instances running (3B).
- A user who is not a participant cannot mint a token for a meeting room (3D).
- A scheduled meeting with one browser user, one phone dial-in and one AI agent runs, records with an announcement, and
  leaves a transcript Conversation.
- `check:codegen-tail`, `check:changeset`, `check:standards` and `check:ui` pass.
