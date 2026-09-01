---
"@memberjunction/server": patch
---

A new COLUMN found by a schema refresh is created disabled, like a new object.

New objects already waited for the user (`autoEnableNewObjects`, default false). New columns did
not: a field map for a newly-appeared source field inherited the entity map's enabled state, so a
column appearing on an object already being synced started syncing immediately — no decision from
anyone, and no flag to control it. A column is as much a schema change as a table.

Adds `autoEnableNewColumns` (default false) to `IntegrationSchemaEvolution`, mirroring
`autoEnableNewObjects`. The map still bounds the column: nothing is Active on a map that isn't.
A **re-added** column is deliberately ungated — that row is not new, it was disabled because the
source stopped reporting the column, and gating it would silently demote a column the user chose to
sync every time the source flickered.

The decision moves into `decideFieldMapReconcile` in `integration/EntityMapLifecycle`, which is
unit-tested. Left inline it could not be tested at all: the resolver imports schema-builder and
schema-engine, so it cannot be loaded in a unit test.
