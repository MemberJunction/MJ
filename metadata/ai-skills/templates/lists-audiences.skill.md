# Lists & Audiences Skill

You now have list and audience management capability: building record lists from views, composing and maintaining them, sharing them, and resolving audiences for downstream use.

## Building Lists

- ***Materialize List From View*** — snapshot a view's current results into a list. The standard way to turn "everyone matching these criteria" into a concrete, workable set.
- ***Add View Results To List*** — append a view's results to an existing list instead of creating a new one.
- ***Refresh List From Source*** — re-run the list's source criteria to pick up records that newly qualify. Clarify with the user whether refresh should add-only or also reflect drop-offs, and say what the action will do before running it.
- ***Compose Lists*** — set operations across lists (union/intersect/difference) to build precise segments from existing lists rather than re-deriving from scratch.

## Lists From a Query or a Conversation

***Create List From Query*** turns the records a query returns into a list that keeps itself current.

- Offer it only when the result is a set of records (people, members, orders, events), never after counts, totals or other summaries.
- When the user ran a saved query, pass its `QueryID` (and `Parameters`).
- Otherwise pass `SQL` you write yourself, under the same rules as ***Run Ad-hoc Query***: it reads entity base views (`__mj.vwAIModels`, never the entity name `[AI Models]`) and selects the column that holds each record's ID. Pass that column as `KeyField` and the full entity name as `EntityName` (`MJ: AI Models`, with any prefix). Records shown in an earlier turn don't carry their SQL into this one, so write the query again, with the ID column.
- Work out the entity, base view and ID column yourself; never ask the user for them. If you need to look up a base view, activate **Data Analysis & Queries**.
- Suggest a descriptive name, and say in plain words which records the list will hold.
- Before creating the list, ask what the user hasn't already told you: whether a refresh should only add new records (`Additive`, the default) or also remove records that stop matching (`Sync`), and whether it should refresh automatically (default off). "Keep it up to date" answers the second question, not the first. Fill `RefreshMode` and `RefreshAutomatically` from the answers.
- Explain that SQL from the conversation is saved as a query in the user's User Lists, Pending approval, and that editing that query pauses refreshes until the list's owner approves the change.
- Report the list name, record count, refresh mode, whether it refreshes automatically, and the query it refreshes from. If the action says the list won't refresh, tell the user why.

## Maintaining Lists

- ***Move List Members*** — transfer members between lists (e.g. stage progressions).
- ***Bulk Update List Item Status*** — status transitions across many members at once. State the count affected before running bulk mutations.

## Sharing & Collaboration

- ***Share List* / *Unshare List*** — grant/revoke other users' access to a list.
- ***Invite To List* / *Revoke List Invitation*** — invitation-based membership flows.
- Sharing changes who can see member data — confirm the grantee and the intent before sharing lists containing personal information.

## Audiences

***Resolve Audience*** expands an audience definition into its concrete recipient set. **Always report the resolved count to the user.** A resolved audience is typically the input to a send (via a Communications-capable agent or skill) — resolution itself is safe and read-only, but flag clearly when the next step the user is heading toward is an outbound send, and defer to that step's own confirmation gate.

## Practical Notes

- Name lists descriptively with their criteria and vintage ("Lapsed Members — 2026-06 snapshot"); a list named "New List 3" is technical debt.
- Prefer composing existing lists over re-materializing overlapping views — it preserves lineage and is cheaper.
