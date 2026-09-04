---
"@memberjunction/server": patch
---

A schema refresh now adopts new objects AND new columns; only sync-discovered columns are suggested.

Two changes that together make the refresh/sync split explicit:

- `autoEnableNewObjects` now defaults to **true**. A refresh is an explicit request to bring the
  source's current shape in, so an object it finds is adopted rather than left disabled waiting for
  a second click.
- New **columns** gain the matching `autoEnableNewColumns` (also default true). They previously
  inherited the entity map's enabled state with no flag at all, so the behaviour is unchanged by
  default — but it is now a stated decision with a way to opt out, instead of an accident.

The deliberate asymmetry: a column first seen **mid-sync** is still never auto-created. It is
captured as a candidate with its statistics and requires acceptance before any DDL runs
(`Configuration.autoPromoteCustomColumns`, default false). A refresh is a deliberate act; a sync is
not, and must not reshape the schema on its own.

The map continues to bound the column — nothing is Active on a map that isn't — and a re-added
column returns to Active ungated, since that row is not new.

The decision moves into `decideFieldMapReconcile` in `integration/EntityMapLifecycle`, which is
unit-tested. Left inline it could not be tested at all: the resolver imports schema-builder and
schema-engine, so it cannot be loaded in a unit test.
