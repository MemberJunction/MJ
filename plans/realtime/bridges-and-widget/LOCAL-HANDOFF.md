# Local handoff

Steps that must be done on a developer machine with a database, because the authoring agents have none.
Each section is self-contained and belongs to one branch. Other branches may append their own sections.

---

## Core schema (branch `telephony-schema-core`)

**What the branch adds:** one migration, `migrations/v6/V202610032200__v6.2.x__Telephony_PhoneNumber_NumberPool_Interaction.sql`,
creating five core-schema tables: `NumberPool`, `PhoneNumber`, `Interaction`, `InteractionEvent`, `InteractionLink`.
It contains hand-written DDL and extended properties only. The CodeGen output is deliberately missing; you generate and
append it. CI's `check:codegen-tail` reports five drifts until you do (one per new table); that is expected.

**Not in this branch (by design):** any TypeScript against the new tables, any `migrations-pg/` counterpart (the build
engineer converts at release), any `metadata/` seed rows (none needed; the CHECK value lists are the vocabulary).

### Steps

Use a database no other session is using (`DB_DATABASE` in your `.env`). Do not run these against a shared dev database
while another agent might be mid-run.

1. **Apply the migration.**
   ```bash
   pnpm run mj:migrate
   ```
   Confirm the five tables exist in `__mj`. They depend on existing tables `AIBridgeProvider`, `AIAgentSession`,
   `AIAgent`, `User` and `Entity`, all already shipped.

2. **Run CodeGen.** Full run is correct here (this is a schema change with new tables):
   ```bash
   pnpm run mj:codegen
   ```
   It creates the `Entity`, `EntityField` and `EntityRelationship` rows, the base views, the `spCreate/spUpdate/spDelete`
   procedures and grants, and regenerates the entity classes (`generated/entities/__mj.ts`), the MJServer resolvers and the Explorer forms.
   If CodeGen reports `success: false` or per-entity field/view-column counts disagree, run it a second time
   (a new virtual column can appear one pass late).

3. **Append the CodeGen SQL to the migration.** Take the generated `migrations/v6/CodeGen_Run_*.sql` and paste its entire
   contents at the bottom of `V202610032200__...Telephony_PhoneNumber_NumberPool_Interaction.sql`, below the
   `CODEGEN OUTPUT TO BE APPENDED LOCALLY` banner. The 55 blank lines and the banner above are already in the file; keep
   them. Delete the standalone `CodeGen_Run_*.sql` afterwards (the migration is the single artifact). Per the migrations
   guide, if this run emitted unrelated regenerations (validator functions, form fields) because your database was not at
   the last released version, leave those out and say so in the banner.

4. **Check the Sequence rule.** Every `EntityField` INSERT in the appended block must use the apply-time
   `(SELECT COALESCE(MAX([Sequence]), 0) + 1 ...)` expression, never a literal:
   ```bash
   node .github/scripts/check-migration-entityfield-sequence.mjs
   ```

5. **Build and verify the tail.**
   ```bash
   cd packages/MJCoreEntities && pnpm run build
   cd ../.. && pnpm run check:codegen-tail      # must now pass
   pnpm run check:changeset                     # once the changeset is committed
   ```
   Commit the migration (now with the CodeGen tail), the regenerated entity classes, the MJServer generated resolvers and the
   Explorer generated forms together.

6. **Revert any `sync` write-backs** under `metadata/` if you happened to run `mj sync push` (not required for this change).

### Generated entity names to expect

| Table | Entity name | Generated class |
|---|---|---|
| `NumberPool` | `MJ: Number Pools` | `MJNumberPoolEntity` |
| `PhoneNumber` | `MJ: Phone Numbers` | `MJPhoneNumberEntity` |
| `Interaction` | `MJ: Interactions` | `MJInteractionEntity` |
| `InteractionEvent` | `MJ: Interaction Events` | `MJInteractionEventEntity` |
| `InteractionLink` | `MJ: Interaction Links` | `MJInteractionLinkEntity` |

Verify against `packages/MJCoreEntities/src/generated/entities/__mj.ts` after CodeGen; that file is the source of
truth, and the exact names depend on the configured entity prefix defaults.

Expect string-union types for `Channel`, `Direction`, `Status`, `EventType`, `Role`, `SelectionRule` and `Capabilities`
(from the CHECK constraints). The `Number` column is accessed as `.Number`.

### Things to review in the CodeGen output

- **`InteractionEvent` is append-only.** CodeGen will turn on `TrackRecordChanges` by default; consider turning it off
  for this entity (every row is already an event record) and, in a follow-up, add a server-side entity subclass that
  rejects update and delete.
- **`CK_PhoneNumber_E164`** is a compound CHECK (`LIKE` plus `LEN`). CodeGen turns simple `IN (...)` lists into value
  lists and should skip this one; confirm it did not generate a bogus value list for `Number`.
- **`InteractionLink` and `RecordID`** is `NVARCHAR(450)` to match `TaggedItem.RecordID` so the unique constraint stays
  within SQL Server's index key limit.

### Follow-up code tasks this unlocks (each a separate PR after the types exist)

1. **Record an Interaction plus events per call.** In the telephony session starter, create an `Interaction`
   (`Channel='Phone'`, `Direction`, `PhoneNumberID`, `RemoteAddress`, `ExternalID` from the carrier call id, `AgentSessionID`),
   write `InteractionEvent` rows at created / answered / transferred / escalated / ended, and close the row with
   `EndedAt` and `EndReason`. Mark `Abandoned` when the caller leaves before an answer.
2. **Write `InteractionLink` rows** for the caller (`Role='Caller'`, e.g. the resolved Person or Contact), the subject
   (`Role='Regarding'`) and anything the agent creates during the call (`Role='Created'`).
3. **Number pool selection for outbound.** A small selector over `NumberPool` / `PhoneNumber` implementing
   `RoundRobin`, `LocalPresence` and `Random`, honouring `PhoneNumber.Status='Active'` and
   `NumberPool.MaxConcurrentPerNumber` (count active `Interaction` rows per number). Used when placing an outbound call
   in place of a hard-coded caller ID.
4. **Inbound routing by number.** Resolve a dialed number to its `PhoneNumber` row (and from there the provider / agent
   identity) when a call arrives.
5. **Append-only guard** for `InteractionEvent` in a server-side entity subclass.

The separate contact-center Open App references these tables with real foreign keys from its own schema; nothing in MJ core
may reference the app (dependencies point up only).
