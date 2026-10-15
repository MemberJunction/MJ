---
"@memberjunction/core-entities-server": patch
"@memberjunction/livekit-room-server": patch
"@memberjunction/telephony-adapters": patch
---

Add Interaction lifecycle tracking, append-only InteractionEvent enforcement, caller linking, and outbound number pool selection.

- **Append-only InteractionEvent**: `MJInteractionEventEntityServer` blocks update and delete operations on `MJ: Interaction Events`.
- **Interaction lifecycle**: `InteractionLifecycleService` manages creation, state transitions, caller linking, event logging, and duration/cost computation across phone and room calls.
- **Outbound number pool selection**: `NumberPoolSelector` supports `RoundRobin`, `LocalPresence`, and `Random` selection policies, respecting `MaxConcurrentPerNumber` limits.
- **Inbound routing**: Resolves dialed numbers to active agent identities and associated `PhoneNumber` records.
