# Schema and Code Authoring Guide

The rules here come up again and again in review, across repos and developers, mostly because AI
tools produce the opposite by default. They apply to MJ and to every app built on it (the BizApps
repos included). Where a rule can be checked by a machine it is an `@memberjunction/standards`
check, named in the rule. A repo turns a check on with `mj standards adopt`.

If you are an AI agent writing or reviewing code in an MJ repo, treat each rule as a requirement,
and in a review flag each violation with the rule's name.

## Migrations are plain DDL

**Rule:** write migration DDL without existence guards. No `IF OBJECT_ID(...) IS NULL`, no
`IF COL_LENGTH(...) IS NULL`, no `IF NOT EXISTS (SELECT … FROM sys.…)`, no `DROP … IF EXISTS`,
and no guarded `sp_addextendedproperty`.

**Why:** Skyway runs each migration exactly once, in order, and records that it did. A migration
never needs to be idempotent. A guard does harm instead: when the schema is not what the migration
expects, the guard turns a loud failure into a silent no-op. Guards also make the PostgreSQL
conversion harder and the migration slower.

```sql
-- ✅
ALTER TABLE [${flyway:defaultSchema}].[ContactType] ADD CommunicationBaseMessageTypeID UNIQUEIDENTIFIER NULL;

-- ❌
IF COL_LENGTH(N'[${flyway:defaultSchema}].[ContactType]', N'CommunicationBaseMessageTypeID') IS NULL
    ALTER TABLE [${flyway:defaultSchema}].[ContactType] ADD CommunicationBaseMessageTypeID UNIQUEIDENTIFIER NULL;
```

To replace a hand-written procedure or view, use `CREATE OR ALTER`, not `DROP … IF EXISTS` first.

**The one exception** is a guard on *another app's* object that may legitimately not be installed,
for example an app checking whether BizApps Common's function exists before using it. Mark it with
`-- mj-standards-allow: existence-guard` and say why on that line.

**Enforced by:** `migration-existence-guards` (error). It reads only the hand-written part of a
migration, because CodeGen's appended output guards its own drops.

## Value lists are written for people

**Rule:** values in a CHECK-constrained list are written the way people read them:
`'Opted In'`, `'Not Specified'`, `'In Progress'`. Not `'OptedIn'`, `'NOT_SPECIFIED'` or `'in_progress'`.

**Why:** these values are what people see. CodeGen turns the list into the field's dropdown, its
`EntityFieldValue` rows and its TypeScript union, and the values appear as-is in views, queries
and reports. Code never needs a "computer-friendly" spelling, because CodeGen already gives it a
typed union to compare against.

Proper names that are written run together (`'TypeScript'`, `'WhatsApp'`) are fine. A repo lists
them in the check's `AllowedValues` option.

**Enforced by:** `readable-status-values` (warn). MJ's older migrations use run-together values
widely; the check reads only migrations after a repo adopts it, and existing lists stay as they are.

## A closed list is a CHECK constraint, with a way out

**Rule:** when a column almost always holds one of a few values, constrain it with a CHECK list and
include `'Other'`. Put the exceptions in a separate nullable details column
(`NVARCHAR(MAX) NULL`, named for what it holds, such as `SourceDetails`). Don't use a wide free-text
column for something that is usually one of a few values.

**Why:** a CHECK list gives every consumer a dropdown, a typed union and clean grouping in reports.
A free-text column gives each of them a cleanup job.

## Defaults belong in the schema

**Rule:** when a column has a default, declare it with `DEFAULT` in the migration. Don't hard-code
it in an entity subclass (`this.Source = 'Staff'` in `NewRecord()`).

**Why:** a schema default applies to every writer: the API, imports, SQL, other apps. A subclass
default applies only to code that goes through that class, and CodeGen shows the schema default
everywhere else.

## Ordering columns are named `Sequence`

**Rule:** a column that orders rows for display is `Sequence`, as everywhere else in MJ. Not
`DisplayRank`, `SortOrder`, `DisplayOrder` or `Position`.

## Each layer holds its own concepts

**Rule:** a generic layer only holds generic things. MJ core and BizApps Common seed metadata that
every app needs (consent purposes such as `Marketing` and `Transactional`), never an app's own
concepts (`Fundraising`, `Surveys`). Those belong in the app that owns them.

**Why:** separation of concerns applies to metadata and documentation as much as to code. An app
concept seeded in a shared layer shows up in every other app that installs it.

## Object-oriented first

**Rule:** logic lives on classes, as static or instance members. Use module-level functions only when
there really is no owning class. AI tools tend to produce working but free-floating helper functions
next to a class; move them onto the class they serve.

**Why:** MJ is an object-oriented codebase. Members are discoverable from the type, can be
overridden through the class factory, and keep related behavior together.

## Use the shared helpers, don't wrap them

**Rule:** call MJ's shared helpers directly (`UUIDsEqual`, `NormalizeUUID` and the rest in
`@memberjunction/global`). Don't write a local function that wraps one with slightly different
edge-case behavior.

**Why:** a local variant drifts. `UUIDsEqual` already treats two null or undefined values as equal
and one as unequal; a wrapper that also treats `''` as missing is a second definition of "same ID"
that the next reader won't know about.

## Where this is enforced

| Rule | How |
|---|---|
| Migrations are plain DDL | `migration-existence-guards` standard |
| Value lists are written for people | `readable-status-values` standard |
| Everything else | Review. Reviewers, human or AI, cite the rule by name. |

A repo adopts the checks with `mj standards adopt`, then sets each check's `FromVersion` option
to the timestamp it adopted at, so migrations that have already run are never flagged.
