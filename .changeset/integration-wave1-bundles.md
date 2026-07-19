---
"@memberjunction/testing-integration": patch
"@memberjunction/server": patch
---

Integration-test expansion Wave 1 — three new bundles (26 checks), all client-first where a client surface exists.

**`app-wiring` (10 checks, client-first)** — the "every shipped app is wired correctly" contract, parameterized over ALL applications so new apps inherit it automatically. Provider↔table parity, nav-item well-formedness, exactly-one-default-tab, **globally-unique DriverClass** (the catalog's latent risk #1), unique slugs, entity/role/settings link resolution, `CanAdmin ⇒ CanAccess`, agent-reference resolution, and non-Active apps excluded from new-user fan-out. Measured 25 apps / 77 nav items / **77 distinct DriverClass values, zero collisions**.

**`view-execution` (9 checks, client-first)** — the Viewing System data layer over the real wire: dynamic filter row-set equality (by PK set, not counts), Filter-JSON→WHERE compilation, ExtraFilter injection guard, `Fields` projection (+forced PK), OFFSET and keyset pagination completeness (no dup/gap), composite-PK keyset refusal, MaxRows/IgnoreMaxRows, and aggregates-vs-pagination.

**`metadata-consistency` (7 checks, server transport)** — metadata↔physical-DB audit sweeping all entities: generated views and CRUD procs exist, CHECK-constraint values match `EntityFieldValue`, FK indexes present, field sequences gapless and matching base-view column order, column descriptions, and SchemaInfo coverage/casing.

Also adds the `G5` static CI gate (`.github/scripts/check-driverclass-registrations.sh`) for DriverClass→Angular `@RegisterClass` resolution, which no server-side check can observe.

All three ship both parity siblings (tsx dispatcher + metadata IT record joined to the deterministic suite). Every collection-iterating check asserts its collection is non-empty first, so a failed load cannot pass vacuously.

**MC6 is a ratchet, not an absolute gate**: 270 core-schema columns predate the describe-every-column rule, so it fails only when that count *grows*. PK/FK columns are exempt per `migrations/CLAUDE.md` (correcting an initial 1003 false-positive count).
