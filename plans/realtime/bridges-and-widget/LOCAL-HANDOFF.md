# Local hand-off — work that needs a database

Items here were deliberately left out of their PRs because they need a migration, a new entity, CodeGen or a
metadata change, and those PRs were built without a database. Each section is self-contained: it says what was
built, what is missing, and what to do locally. Append your own section; do not edit another PR's.

---

## PR 4 deferred to DB work

**PR 4 — full-duplex turn-taking and the agent test bed** (branch `realtime-pr4-turn-taking`, stacked on
`telephony-pr2-agent-parity`). Everything in PR 4 runs without a schema change: the turn-taking rules live in
`@memberjunction/ai-bridge-base` and `@memberjunction/ai-bridge-server`, the live state is an in-memory snapshot
(`AIBridgeEngine.GetRoomTurnSnapshot`) served by the `GetLiveKitRoomTurnState` query, and the test bed is the Live
Room that already ships in the Meet app. What follows needs the database.

### 1. A dedicated "Agent test bed" nav item in the Meet application (metadata)

**State today.** The test bed was built into the existing Live Room (`LiveKitRoomResource`, hosted by
`mj-livekit-agent-room`): per-agent turn mode and addressing pickers before the call and in the "Add an agent"
control, a roster badge per agent, and a **Turns** panel (floor holder, hand-offs, backchannels, loop cap, event
feed). No new Explorer dashboard was needed, so no application metadata changed.

**To do, if a separate entry is wanted.** A distinct "Agent test bed" tab (for example one that opens the Live Room
pre-seeded with two agents) needs a nav item on the Meet application: add it under `metadata/applications/` (the
application's `DefaultNavItems`, `ResourceType: "Custom"`, `DriverClass` = the registered resource class), push with
`mj sync push`, and let the release build fold it into the consolidated `Metadata_Sync` migration. Do not hand-write
the migration. If it reuses `LiveKitRoomResource`, it only needs a `Configuration`/query-param that pre-selects the
agents; if it is a new resource component, register it with `@RegisterClass(BaseResourceComponent, '<Name>')`,
call `NotifyLoadComplete()`, and add the tree-shaking `Load*` function to its module.

### 2. Persist turn-taking events (optional, new entity)

**State today.** `RecentEvents` is a 60-entry ring buffer per room in process memory (`MAX_ROOM_EVENTS` in
`multi-agent-room-coordinator.ts`). It is lost on restart and not visible to a person who opens the room later.

**To do, if a durable log is wanted.** Add a table (suggested: `AIAgentSessionTurnEvent`: `AgentSessionID`, `Seq`,
`Type`, `ToAgentSessionID`, `Reason`, `OccurredAt`) with a migration, run CodeGen, then have
`MultiAgentRoomCoordinator` emit through an injected sink (the coordinator is pure on purpose and takes no data
access) and write rows from the engine with `contextUser`. Replay fixtures already model the event shape
(`LiveKitRoomTurnEvent` in `@memberjunction/graphql-dataprovider`), so the table columns can follow it.

### 3. Per-agent turn-taking defaults (optional, new columns)

**State today.** `TurnMode` and `TurnAddressing` are chosen per session at start (start-call picker, add-agent
control) and sent as GraphQL arguments; nothing is stored against the agent. `AIAgentSessionBridge.TurnMode`
already persists the mode per bridge row; the addressing choice does not persist.

**To do, if defaults per agent are wanted.** Add `TurnAddressing` (`Auto`/`ModelSide`/`Regex`, CHECK constraint, default
`Auto`) to `AIAgentSessionBridge` for the audit trail, and optionally a default turn mode and addressing on the agent or
its co-agent pairing so the pickers pre-select them. Migration, then CodeGen, then read the typed properties; do not
use `.Get()`/`.Set()`.

### 4. Configurable loop cap per room or per deployment (optional, setting)

**State today.** The cap defaults to 8 consecutive agent turns. It can be tuned in code
(`AIBridgeEngine.ConfigureTurnLimits`, `SetRoomMaxConsecutiveAgentTurns`) but no setting or UI drives it.

**To do.** Read a deployment-level value from the existing configuration surface at startup and pass it to
`ConfigureTurnLimits`; if it should be set per room by a user, it needs a place to live (see item 3).

### Not DB work, but outstanding

- Live-model verification of the full-duplex signals: see the "Multi-agent rooms" rows in
  [`LIVE-CALL-CHECKLIST.md`](./LIVE-CALL-CHECKLIST.md). Until that is run, treat `i_am_addressed` / `yield_turn`
  reliability on each vendor's model as unknown; the floor gate is the safety net.
