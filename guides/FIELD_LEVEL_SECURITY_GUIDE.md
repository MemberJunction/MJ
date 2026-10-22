# Field-Level Security (FLS) Guide

Role-based, per-field access control for entity data — who can **read**, **update**, and
**create** each column, enforced server-side. Built for the compensation / donor-giving /
personnel-record class of requirement: an entity most users may work with, containing a few
columns most users must never see.

This guide is for administrators configuring FLS and for developers building on entities that
carry it. It documents the configuration model, what is and is not enforced, and — read these
before restricting anything — the configuration constraints and trust boundaries. Developers
adding an action, transport, cache, agent data source, template, communication or index should
also read §6, which is the checklist those features must follow.

---

## 1. Configuration model

### 1.1 Field security is ON or OFF per entity

Every entity has an **`Enable Field Level Security`** flag, and it is off by default. While it
is off, field permission rows are ignored entirely — so nothing you configure can change access
on an entity that has not opted in.

**Turning it ON is safe.** MJ snapshots the entity's existing entity-level permissions into
per-field rows at that moment, so every role keeps exactly the access it already had. Enabling
changes nothing until you tighten a specific field.

**Turning it OFF keeps the rows**, functionally inactive. Re-enabling does not lose your
configuration, and MJ reconciles whatever the schema gained in the meantime.

You never maintain those rows by hand. Add a column, grant a role access to the entity, drop a
column, revoke a role — MJ adds and removes the corresponding field rows for you. What it will
never do is overwrite a rule you wrote: a tightening survives every reconciliation, including
disable → schema change → re-enable.

### 1.2 The three verbs

Rows live in **`MJ: Entity Field Permissions`** (`EntityFieldPermission`), one per
(field, role):

| Column | Meaning |
|---|---|
| `EntityFieldID` | The field being secured |
| `RoleID` | The role the row applies to |
| `ReadAccess` | Whether this role may read the field's values |
| `UpdateAccess` | Whether this role may change the value on an existing record |
| `CreateAccess` | Whether this role may supply the value when creating a record |

Each verb is one of three values, behaving the way SQL Server's own permissions do:

| Value | Meaning |
|---|---|
| **`No Access`** | Neutral, and the default. Grants nothing, blocks nothing — another role's `Allow` still wins. |
| **`Allow`** | Grants the action for this role. |
| **`Deny`** | Beats everything. One `Deny` anywhere across the user's roles wins, no matter how many `Allow`s sit beside it. |

Across the roles a user holds, each verb resolves independently:
**allowed if any matching row says `Allow` and none says `Deny`.**

Because `No Access` is the default, a row you create by hand grants nothing until you say so.

### 1.3 Read is required for Update and Create

A field a user cannot see is one they cannot change. MJ enforces this in two places, and it
needs both:

- **Per row**, a database constraint refuses `Update = Allow` or `Create = Allow` unless
  `Read = Allow`. You will get an error when you save such a row.
- **Across roles**, the runtime enforces it again. Two rows that are each perfectly legal — role
  A granting Read+Update, role B denying Read — combine, for a user holding both, into
  read-denied and update-allowed. No per-row constraint can see that; the runtime clamps it.

So a write-only field is not a configuration MJ supports. If you need one, capture the value
through a purpose-built action rather than a restricted column.

### 1.4 Nobody is exempt

There is no admin bypass, no Owner carve-out, and **no exempt account at all** — deliberately. A
feature whose purpose is confidentiality cannot ship with a role that quietly reads everything.
Administering FLS never requires reading the secured *values*; the admin UI edits permission
rows, not the data.

That includes the **MJ system user** — the account the server runs its own work as. It is not
special-cased anywhere in the permission evaluation. Its access comes from ordinary permission
rows, like everyone else's: it holds the standard roles (UI, Developer, Integration), and
enabling field security on an entity writes `Allow` rows for every role that can read that
entity, including those.

What MJ protects instead is the **configuration**. The system user's engine caches are
process-wide and shared across every user, so a restricted system user would leave partially
loaded records where everyone reads them, with nothing at the point of failure pointing back at
the rule that caused it. So MJ refuses any change that would leave that account with less field
access than its entity-level permissions already give it:

- a rule that **denies** anything to a role the system user holds is refused;
- an edit that would turn its **last** `Allow` on a field into `No Access` is refused;
- a delete that would remove its **last** `Allow` on a field is refused;
- giving the system user a role that already denies a field is refused;
- **taking a role off** the system user is refused when the roles it keeps would no longer grant a
  field it can currently use.

The last two are mirror images, and both are needed — without the pair, the forbidden state is
reachable simply by doing the steps in a different order. Assignment only has to weigh *denying*
rules, since adding a role can only add rules to the aggregate. Removal is the opposite shape: what
matters is not what the departing role said but whether an `Allow` survives without it. A removal
that also costs the account its *entity-level* read is permitted — it is then denied one level up,
where field rules decide nothing.

Anything that does not reduce its access saves normally — including `Allow` and `No Access` rows
on those roles, which is the mechanism the server's own access depends on. Rules aimed at any
other role are untouched by all of this.

**The guards judge stored state, one write at a time.** Each guard reads the system user's roles
and the relevant field rules from the database, not from the user cache or loaded metadata, so two
quick saves (give the system user a role, then deny a field on it) cannot each pass against a cache
the other has not reached yet. They run on every save, `ReplayOnly` included. Re-pointing a rule's
`RoleID` or `EntityFieldID`, or a role assignment's `UserID` or `RoleID`, is judged against the
target it leaves as well as the one it lands on. Taking a role off the system user is judged on
entities with field security switched off too, so "disable, remove the role, re-enable" cannot
strip a field. **A transaction group holding more than one guarded write that concerns the system
user is refused**: the items of a group are checked before any of them is written, so no check
could see the others' changes. Save such changes one at a time.

> **Why the guard looks at the whole field, not the rule you are editing.** Whether a change
> restricts someone is a property of the **aggregate across every role they hold**, never of one
> rule on its own. `No Access` cannot take away what another role granted — but set *every* one of
> the system user's roles to `No Access` in turn and no `Deny` was ever written, yet nothing is
> left granting the field. So the guard evaluates the rules as they would stand *after* your
> change, for update and delete. Inserts need only the `Deny` check, since adding a rule can never
> remove an existing `Allow`.

A **startup check** sweeps FLS-enabled entities and logs any field the system user has lost access
to. It is the backstop for states the save path never saw — direct SQL, a migration, a role taken
off the account outside the entity layer. **It runs only when the server boots**: a state written
by direct SQL while the server is running is not reported until the next restart. It warns rather
than refusing to boot: bad configuration should be loud, but a
server that will not start is worse, not least because the application is usually how an
administrator would fix the rows. Cost is negligible (entities without the flag are skipped on a
boolean read; no queries at all).

The difference matters. A configuration rule is visible in the data and an administrator can
reason about it; a runtime bypass is invisible at the one place access is decided, and can only
be trusted rather than checked.

### 1.5 What "no rows" means

On an entity with field security **off**, rows are ignored — everything is governed by
entity-level permissions as usual.

On an entity with field security **on**, a field with no rows for any of your roles is
**denied**. That is deliberate. MJ creates the rows that should exist, so a missing row means
reconciliation has not caught up — and failing closed turns that into a visible "I cannot see
this column" rather than a silent loss of protection. If a field disappears unexpectedly after a
schema change, run CodeGen; that is the pass which reconciles new columns.

### Unrestrictable targets

Rows targeting these are rejected at save time *and* ignored by the aggregation (defense in
depth):

- **Primary keys** (hard and soft) — stripping a PK would break entity loads, composite keys,
  relationship resolution, and cache identity.
- **`__mj_` system columns**.
- Fields on the **security-configuration and identity entities** themselves: `MJ: Entities`,
  `Entity Fields`, `Entity Permissions`, `Entity Field Permissions`, `Roles`, `Users`,
  `User Roles` — restricting the configuration surface is self-referential lockout, not
  security.

**Read-only fields take Read rules but not write rules.** A read-only field — a joined foreign-key
display column, a computed column, anything with `AllowUpdateAPI` off — cannot be written through
the API by any user, so an Update or Create verb on it decides nothing in either direction: a
`Deny` prevents nothing that was possible and an `Allow` grants nothing that was not. Those two
verbs are refused at save time, and reconciliation does not author them. **Read is untouched** —
restricting read on a foreign-key display column ("hide which client this contract belongs to") is
one of the main things field security is for.

**How quickly a permission change takes effect.** Metadata is built from the `MJ_Metadata`
dataset, and every provider records which entities compose it — so a save or delete of any member
entity (`MJ: Entities`, `MJ: Entity Permissions`, `MJ: Entity Field Permissions`, `MJ: Roles`, …)
schedules a refresh of the provider that owns that metadata. Membership is the dataset definition
itself: adding a `DatasetItem` row extends coverage with no code change, and no entity names are
hardcoded anywhere in the mechanism.

The timing differs by tier, and the distinction matters:

- **The server that processed the change** re-reads within ~1–2 seconds (a short debounce so the
  enclosing transaction commits first, then a full reload in the background — requests keep
  serving the old graph until the atomic swap). **This is the one that governs enforcement.**
- **Other server instances** converge on their periodic refresh tick.
- **Connected browsers** converge over a longer randomized window, jittered so sessions do not
  stampede. That is **display freshness only** — a browser on stale metadata may briefly still
  render a column it no longer has, but every request it makes is answered by a server that
  enforces the current rules, and the response carries `ReadableFields___` stating what the
  caller may actually read (§3.1.1). A browser's cached view results carry the field-security
  key they were loaded under; when the server's key for that user no longer matches (a column was
  taken away), the server answers "stale" and the browser reloads instead of showing the old rows.

A change made outside the entity layer — direct SQL, a migration — is picked up on the periodic
refresh cycle, whose staleness check always reads database timestamps rather than its own cache,
or on an API restart.

### 1.6 IS-A child entities inherit their ancestors' rules

An IS-A child entity (for example `Members` as a child of `People`) carries a mirror of each parent
field, read from the same database row. A rule on the parent's field therefore has to hold on the
child too, or a role denied `People.Phone` could read it by querying `Members`.

- **Field security applies to a child when it applies to the child or to any ancestor.** Every
  runtime check asks `EntityInfo.FieldLevelSecurityApplies`, which is true when the entity's own
  flag is on or any IS-A ancestor's is. The child's own flag usually stays off; you do not need to
  turn it on for inherited rules to work.
- **Only mirrored fields inherit.** A child field inherits a parent denial only when it mirrors a
  parent field of the same name. A field the child defines itself answers to the child's own rules,
  even if its name happens to resemble a denied parent field.
- **A child rule cannot reopen a parent denial.** When the child's own flag is on, its rules add to
  what it inherits; a `Deny` on the parent still wins.
- **Configure rules on the entity that owns the field.** Reconciliation, CodeGen and the
  system-user guards (§1.4) work on the owning entity's rows, so a parent field is restricted on the
  parent.

The database tier does not follow this inheritance; see §4.2.

## 2. What is enforced (API tier)

### 2.1 The rule: a denied value never reaches a principal the rule does not entitle

A denied value may exist in server memory. What it must never do is reach a **principal** the
rule does not entitle. A principal is whoever ends up holding the value, and that is a wider set
than "whoever called the API":

| Destination | Principal |
|---|---|
| API response (GraphQL, REST, MCP, A2A, websocket streams) | The caller |
| Action output, and the action execution log that stores it | The caller, or the agent acting for them |
| LLM context: prompt data, tool results, agent payloads | The user the agent acts for. The model can repeat the value back, and run steps store it. |
| Rendered template or communication | The sender composing it, and through them the recipient |
| A stored derived artifact: embeddings, vector metadata, tags, document text, data contexts | Everyone who can read that artifact later |
| Logs, run steps and prompt runs | The administrators and developers who can read them |

An earlier version of this guide said "the perimeter is API output, not server memory". That was
too narrow: agents, actions, templates and communications all run *inside* the server and hand
values onward. Under the principal rule they are held to the same standard as a GraphQL response.

What the rule leaves alone is work that never hands a value to a principal: the audit trail,
cache slots, validation, archiving, integration and metadata sync, identity resolution and save
internals. Those can, and do, see full rows.

### 2.2 What each surface does

All enforcement is server-side; client-side checks are UX only. For a user with a non-empty
denied set on an entity:

| Surface | Behavior |
|---|---|
| **Entity objects** | An entity object built for a restricted user **never holds** a denied value (§2.3). `GetAll()`, `GetDataObject()`, `To()`, `Fields[i].Value` and `JSON.stringify(entity)` therefore return only what that user may read. |
| **RunView / list results** | Denied columns never reach the caller: they are stripped from result rows at the output boundary on cache hits and cache misses, and `entity_object` results follow §2.3. |
| **Single-record loads** | Only the caller's readable columns are fetched; denied fields are marked `NotLoaded`. The GraphQL response is projected again on the way out (`MapFieldNamesToCodeNames`, the same boundary that masks encrypted fields). |
| **Filters, sorts, aggregates and search** | One gate in the provider checks **every clause the query will actually run** and **rejects** the request when one names a denied field (§2.6). That covers the request's `ExtraFilter`, `OrderBy`, `Aggregates[].expression` and `OverrideExcludeFilter`, a saved view's own stored filter and sort (including `CustomWhereClause` views), and search terms spliced into SQL. Output stripping alone would be theater: `ExtraFilter: "Salary > 200000"` or `MIN(Salary)` reconstructs values without the column ever appearing in a result. |
| **`UserSearchString`** | Denied fields are excluded from the searched-field list. A term that an entity's search format splices directly into SQL goes through the same gate as any other filter. |
| **Client input** | A create or update whose input names a field the caller cannot **read**, or a field that does not exist, is **rejected** with one message for both cases (§2.7). |
| **Saves (update)** | A save that modifies a field the user cannot update is rejected server-side before SQL generation. |
| **Creates** | A value supplied for a field the user can read but may not create is **dropped, and the column takes its default** — the insert is not rejected. Silently defaulting is exactly what an unrestricted user gets by leaving the field blank, so a restricted user ends up with the same record shape rather than a failure. (A field the user cannot *read* is rejected as client input, above.) |
| **Typed accessors (`Get` / `Set`)** | Reading or writing a denied field **by name** throws, so a restricted field surfaces as a clear failure instead of a silent blank. `IsFieldReadableByActiveUser(name)` asks the same question without throwing. |
| **Saved queries (`RunQuery`)** | The SQL a run will execute is checked against the caller's denials, unless the query's own role list authorizes them (§3.3). |
| **Datasets** | Dataset items never select the caller's denied columns, their rows are projected on cache hits and misses, and item filters go through the provider gate. |
| **`MJ: Record Changes` payload** | The audit trail is projected against **the entity each row is about**, not against Record Changes. Denied field keys are dropped from `ChangesJSON` and `FullRecordJSON`; `ChangesDescription` is **withheld entirely**. See §3.2. |
| **Record names** (FK links, breadcrumbs, pickers) | When an entity's **name field** is denied, the record's display name is withheld and every caller **falls back to the primary key**. This applies to every server-side name lookup — the provider's `GetEntityRecordName(s)` (and so the GraphQL query and search-result names) — and to `BaseEntity.GetRecordName()`. Every field the name is built from must be readable, and with no acting user the name is withheld. Server providers keep no record-name cache, so one user's lookup is never served to another. It is a fallback rather than an error on purpose: `GetRecordName()` runs automatically after every load and save, so throwing would make records on that entity fail to open rather than merely hide a name — and answering "no name" keeps the query from becoming a probe that tells restricted apart from missing. |
| **Entity forms** | Fields the user cannot read are **not rendered at all**. The form checks access before touching a value, so one denied column cannot take out the form it sits in. A field you can read but not write renders read-only rather than editable — which matters most on **create**, where the server drops the value silently and this is the only signal you get. |
| **Grids and view configuration** | Denied columns are not rendered, and the view-configuration panel does not offer them as columns. Your **saved column preferences are left intact** — a denial is reversible, so hiding a column never rewrites the preference that mentions it, and the column reappears when access is restored. Saved **sort** settings are dropped, because a denied field in `ORDER BY` is rejected outright rather than degrading. |
| **Search, vectors and tags** | Restricted fields are left out of indexes when they are built, and search results are projected for each reader (§3.6). |
| **Communications and templates** | A message is composed with the **sender's** permissions; a merge field the sender cannot read renders empty (§3.7). |

### 2.3 An entity object's width follows its user

**An entity object never holds a value its user is denied.** Every point where an object is filled
from a row applies the object's own user's denials: `Load`, `LoadFromData` (both the fast path and
the slow path), `Hydrate`, RunView `entity_object` results, the IS-A parent merge,
`SaveEntityGraph` results, and the re-read after `Save()`. A denied field is left `NotLoaded`, and
the value is not kept anywhere on the object.

That is why the serializers need no field-security code of their own. `GetAll()`, `To()`,
`GetDataObject()`, `GetDataObjectJSON()`, `Fields[i].Value`, `JSON.stringify(entity)` and
`CopyFrom` all read what is there, and the denied value is not there.

Three details matter in practice:

- **It holds for new records.** `NewRecord()` leaves a restricted user's denied fields `NotLoaded`
  instead of holding their defaults, so a new record's payload never names them (the server would
  refuse it, §2.7) and the insert leaves those columns to their database defaults.
- **It holds after a save.** The provider re-reads the row after an insert or update, then marks
  the user's denied fields `NotLoaded` before handing the object back. A restricted user's saved
  object is exactly as wide as their loaded one.
- **It is safe for saves.** `NotLoaded` fields are left out of the UPDATE, so a narrowed object
  never writes a blank over a stored value.
- **It costs nothing for everyone else.** An unrestricted user's object, and a system-user
  object, keep the zero-copy fast path. Shared cache rows are never modified: a restricted user's
  object gets a copy without the denied keys.

The object's user is the `contextUser` it was created with (`GetEntityObject(name, contextUser)`).
An object created **as the system user**, or **with no user** on a server, holds every column. That
is the case to watch for: see §2.4 and §6.

**The precise contract.** "An object built for a restricted user never holds a denied value" holds
under these conditions:

- **The user is set before the object is filled, or the change narrows it.** Setting
  `ContextCurrentUser` on an object that already holds a record narrows it to the new user: values
  the new user may not read become `NotLoaded` on the object, its IS-A parent, its embedded
  records and the children in its loaded related-record collections, which all get the same user. Nothing is widened — a field the old user could not read stays
  `NotLoaded` for a new user who could, because its value was never loaded. Set the user first
  wherever you can (pass it to `GetEntityObject`), so the record is loaded at the right width.
- **The source is a plain row.** `LoadFromData`, `Hydrate` and the other entry points narrow the
  keys of the row they are given. Given an entity object instead of a row, `LoadFromData` reads that
  object's own `GetAll()` (what *its* user may read) rather than its typed getters. `CopyFrom`
  copies from another entity object and skips every field the target's user may not read.
- **Something holds a user.** With no user, the object holds every column.

The helpers that project or gate values follow the same "no user" rule:
`ProjectEntityValuesForUser`, `ProjectEntityValueRowsForUser` and
`AssertClientInputWritableForUser` **pass their input through unchanged when no user is given**.
That is what a browser needs (the client has no user to project for; the server enforces), but on a
server it means a missing user silently disables the projection. Always pass the user the output
is for.

### 2.4 Work done on behalf of a user runs as that user

Most leaks this feature has had to close came from server code that loaded data as the system user
and then delivered it to a person. The rule is: **work on behalf of a user runs as that user.**
System identity is for work whose output stays in system-internal stores. Where a system-identity
result does reach a person, it is projected for **that person** first.

What that means today:

- **Agents** run as the conversation user. Their data sources, tool actions and re-executed
  SQL artifacts load data under that user's permissions.
- **Actions** receive the caller as `ContextUser`, and must load with it. Entity actions load
  their record as the caller, and their results are projected for the caller before they are
  returned.
- **Entity communications** (previews and sends) read recipients and related data as the
  sender (§3.7).
- **A2A** runs entity work as the authenticated caller, and refuses to run when no user can be
  resolved, instead of falling back to an arbitrary user. Tasks belong to their caller.
- **Templates** render with the user of that render. Concurrent renders each see their own user.
  The contract is on the caller: **pass the user as `ContextUser`** on every render done on a
  user's behalf (a render nested inside another inherits the outer render's user). The engine never
  falls back to whichever caller first configured the process-wide engine. A render with no user
  fails fast: an extension that needs a user, such as the AI prompt extension, rejects the render
  with an error instead of running as someone else or hanging.
- **Engines** (`BaseEngine`) load their shared caches as the system user (§3.4). Anything taken
  from an engine cache and handed to a person is projected first; on a server, an engine that
  loads an entity with field security logs a one-time reminder of this.

**Caches of user-scoped data are keyed by the user.** Data loaded under one user's permissions
(row-level security, field security, entity permissions) differs from the next user's. An
in-process cache that stores it must include the user in its key, or the first caller's rows are
handed to everyone after them. `UserScopedCacheKey(userID, ...parts)` from `@memberjunction/global`
builds that key; it returns `null` when there is no user, which means "do not cache". The agent
data-source cache, the Entity Document placeholder cache (which also keys on a hash of the record
values rendered) and the IS-A subtype lookup cache all use it. The in-memory vector index is
cached per **permission class** instead: users who agree on entity read, the effective row filter and the vector columns they are denied share one loaded
index, the cache is bounded and evicts least-recently-used, and a saved row reaches a row-filtered
class's index only after that class re-reads it. The RunView cache has its own permission
fingerprint (§3.4).

### 2.5 Every transport projects its output

§2.3 is the main control. As defence in depth, every wire transport also passes what it
returns through one shared projection, `ProjectEntityValuesForUser` (or its array form,
`ProjectEntityValueRowsForUser`) from `@memberjunction/core`. It drops denied keys under both the
field `Name` and its `CodeName`, adds `ReadableFields___` for MJ clients, and applies the Record
Changes payload projection (§3.2).

The transports that use it:

- **GraphQL** entity resolvers (read, create, update, and the row a delete returns), transaction groups (including the
  update delta, which is computed from projected values), `SaveEntityGraph`, the File, Query and
  User View resolvers, entity-action results, and the agent-run and test-run streams.
- **REST** CRUD and view endpoints. REST always returns `simple` results; a request for
  `entity_object` is answered with plain rows.
- **MCP** entity tools and the agent-run-step export. View queries return `simple` results.
- **A2A** entity operations.
- **Cache-invalidation broadcasts** over websockets never carry row data for an entity with field
  security, or for `MJ: Record Changes` (whose payloads hold other entities' values); receivers
  re-read under their own permissions.
- **Entity status messages** over websockets go only to the session whose user owns the object
  that raised them, and never carry a record payload for a delete, for an entity with field
  security, or for Record Changes.
- **CloudEvents** and the debug log carry only the primary key and the changed field *names* for an
  entity with field security, never values. Record Changes rows are not sent to CloudEvents.

### 2.6 The filter, sort and aggregate gate

Predicates can leak values that never appear in a result: `Salary > 200000` returns rows only when
it is true, and a sort on `Salary` ranks people by pay. So a predicate naming a denied field is
**refused before it runs**, and the refusal is made in one place: the provider, after the view has
been resolved, on the clauses as they will actually run. It applies to every caller (GraphQL, REST,
agents, actions), not only to client requests.

- **It parses the SQL.** Identifiers are resolved from the dialect-aware SQL scanner's tokens,
  so a column name inside a string literal or a comment does not cause a false refusal, and
  quoted, bracketed, differently cased or look-alike spellings of a denied column are still
  caught.
- **It refuses whole-row constructs** for a caller who is denied something on the entity the SQL
  reads: `SELECT *` and `alias.*` subqueries, `FOR JSON` / `FOR XML`, functions over `*` such as
  `CHECKSUM(*)`, `NATURAL JOIN`, and using a table as a value. Each would read the denied column
  without naming it. A caller who is denied nothing is not scanned at all.
- **It refuses ordinal sorts** for the same callers. `OrderBy: "3"` sorts by the third column of
  the view's `SELECT *`, which may be a denied one, so an integer `OrderBy` item is refused;
  named sorts such as `Name DESC` are checked as usual.
- **It refuses what it cannot read.** SQL the scanner cannot read the way the database does, or
  dynamic SQL, is refused for a caller who carries a denial on an entity it could read. So is a
  name holding a control, format or default-ignorable character (a zero-width joiner, a word
  joiner, a direction mark): SQL Server collations can give such characters no weight, so
  `[Salary]` with a U+2060 word joiner typed after `Sal` still resolves to the real column.
- **Row comparisons count as reads.** `SELECT *` inside `EXISTS (…)` is allowed only when the
  subquery has no set operation (`UNION`, `INTERSECT`, `EXCEPT`) and no row-picking `ORDER BY`,
  `OFFSET`, `FETCH` or `LIMIT`; with one, the `*` compares whole rows, denied column included.
- **PostgreSQL Unicode identifiers are decoded.** `U&"…"` (any case, with or without `UESCAPE`) is
  read as one identifier and checked as the name it spells. A malformed escape makes the text
  unreadable, so it is refused.
- **"Denied" and "does not exist" look the same.** For a caller carrying denials, a column that
  does not exist produces the same error as a denied one, including when the database is the one
  that rejects it.

A field-security refusal **throws** a `FieldSecurityError` from the provider's RunView path rather
than coming back as an ordinary `Success: false` result. One refused view in a `RunViews` batch
fails only that view: it comes back `Success: false` with the refusal's message, and the other
views run.

**Every transport also runs the client clause screen.** GraphQL, REST, MCP `Run_*_View` and A2A
`QueryEntity` pass caller-supplied filters and sorts through `ClientClauseScreen` before the
provider gate. In-process callers (agents, actions) get the provider gate alone, which has to stand
on its own.

### 2.7 Client input naming a field the caller cannot read is rejected

For a caller who is denied at least one field on an entity, a create or update is **rejected**
when its input names:

- a field the caller cannot **read**, or
- a key that is **not a field** of the entity (or of an IS-A ancestor).

Both get the same message:

> `Field 'X' cannot be written on entity 'Y'.`

Treating unknown keys the same way is what keeps the refusal from revealing which columns exist:
refusing only denied keys would answer "does `Salary` exist?" for any key a caller tries. Keys the
transports add themselves (`OldValues___`, `ReadableFields___`, `__typename`, the companion and
restore/clone context payloads) are accepted.

Earlier versions silently dropped such values. Rejecting them changes nothing for well-behaved
clients: under §2.3 a client never received a denied value, so it never sends one back. A value for
a field the caller could not read can only be fabricated.

The rejection applies on GraphQL create and update (including `OldValues___` keys), transaction
groups (including transaction variables that name a field), embedded-record input, the field maps
of `MergeRecords`, REST, the File and Query resolvers, MCP and A2A. Callers who are denied nothing on the entity are unaffected.

### 2.8 The update rejection depends on hydrating from the database

The update check rejects **dirty** fields — the ones whose value differs from what the record was
loaded with. That is only a security boundary if the loaded state is the database's, so on an
entity where field security applies, `ResolverBase.UpdateRecord` always loads the row rather than
taking its `OldValues___` shortcut (`MustLoadTruthFromDatabase`).

The shortcut exists because a client that already holds the prior state makes the round trip
redundant. It is not safe here. A value the client supplies in `OldValues___` is applied through
`LoadFromData`, which records it as the field's *initial* value — so the field is never dirty, the
update check never examines it, and save-SQL generation sends it regardless (it omits only
not-loaded fields, never non-dirty ones). A caller could then write a field it may not write by
pinning the value in `OldValues___` and never naming it in the mutation.

Note this is not covered by the client-input rejection (§2.7). That rejection applies only when the
caller has at least one denied-**read** field. The configuration this feature most exists to serve —
*read a field, but do not change it* — leaves that set empty, which is precisely when the entity
flag has to carry the decision on its own.

**If you are tuning this path, the entity flag is not the optional term.** Removing it reopens a
silent write. `packages/MJServer/src/__tests__/resolverBase.fls.test.ts` pins it.

### 2.9 The denial messages

**READ denials** — a predicate naming an unreadable field, or a typed accessor touching one — read:

> `Field 'X' does not exist on entity 'Y' or you do not have access to it.`

That never discloses *which* of the two is true, modeled on SQL Server's posture. Confirming
"this field exists and is restricted" would turn any predicate into a probe for which columns a
deployment considers sensitive. Recognize this wording as (possibly) FLS at work; do not
"improve" it to name the reason.

**Client input** naming a field the caller cannot read, or no field at all, reads
`Field 'X' cannot be written on entity 'Y'.` (§2.7), equally ambiguous for the same reason.

**Whole-row and unreadable SQL** refusals say what to change without naming a column:
`SQL that reads entity 'Y' may not read whole rows (…) — name each column it reads.` and
`SQL that reads entity 'Y' could not be checked against your field permissions — rewrite it so it
reads as plain SQL.`

**WRITE denials on a field the caller can read** name the missing permission:

> `You do not have permission to update field 'X' on entity 'Y'.`

Nothing is disclosed by that. Both facts the ambiguous wording protects — that the column exists,
and that it is restricted for this caller — are already theirs: they can read the field and see
its values. All the explicit wording adds is *which* permission is missing, which they would learn
by attempting the save regardless. Telling someone that a field they are looking at might not
exist is misleading rather than discreet, and it generates support questions instead of
preventing probes.

The split is not cosmetic — it holds under [#3485](https://github.com/MemberJunction/MJ/issues/3485)
too. Part of the case for ambiguity is that once metadata is filtered for restricted users,
"does not exist" becomes literally true from the client's vantage point. That is true for a field
they cannot read, which stops shipping to them. It is false for a readable one, which keeps
shipping.

A write refusal on a field the caller **cannot** read keeps the ambiguous wording. That path is
reachable: `SetMany` deliberately skips the readability assertion (it is the hydration and
resolver-apply path), so server-side code can dirty a read-denied field and reach the update gate.

Rejections are logged at debug level (`[FieldSecurity] …`); routine output stripping is not
logged (it happens on every request to a restricted entity and carries no signal).

## 3. Configuration constraints — read before restricting a field

### 3.1 NOT NULL columns can be restricted — with one exception on CREATE

**Restricting READ on a NOT NULL column is fully supported**, including foreign-key display
columns, which inherit non-nullability from the key they display. Earlier versions could not do
this: the generated GraphQL object types derived their non-null marker from the column's NOT NULL
constraint, and an omitted field then failed response serialization.

That derivation was wrong, and it is the thing that changed. A database constraint and a GraphQL
`!` say different things:

- **NOT NULL** — no *row* stores an empty value in this column.
- **`String!`** — every *response*, to every caller, carries a value for this field.

The second does not follow from the first. It only coincided while every caller saw every column
of every row they could read, which is exactly what field security ends. Generated output types
now promise presence only where field security is structurally incapable of stripping a field —
primary keys and `__mj_` system columns. Input types are unchanged: they carry the *write*
contract, which the database constraint does still govern.

**The one real remaining constraint is on CREATE**, and it is not a GraphQL problem:

> A user denied **Create** on a column that is **NOT NULL with no database default** cannot create
> records on that entity.

Nobody can supply the value — the user is not permitted to and the database has no default to fall
back on. Depending on whether the user can also *read* the field, this surfaces in one of two
places: as a validation failure ("field is required") when the form cannot render it, or as a
stored-procedure error when it can. NOT NULL *with* a default is fine — the create suppression
omits the field and the column takes its default, which is exactly what an unrestricted user gets
by leaving it blank.

So: before denying **Create** on a column, check whether it is NOT NULL with no default. Denying
**Read** or **Update** carries no such constraint.

### 3.1.1 Distinguishing "restricted" from "genuinely NULL"

A denied field is omitted from the response object, but GraphQL emits every field the client
*selected* — so a denied field the client asked for arrives as an explicit `null`. To keep those
apart, responses carry `ReadableFields___`: the server's own list of the fields this caller may
read, for the request that actually ran. Anything not on it is marked `NotLoaded` on the entity
rather than loaded as null.

This is deliberately the server's answer rather than the client's. A client computing it from its
own metadata is wrong in the window right after a permission change — and will be wrong
permanently once metadata is filtered for restricted users. It lists *readable* fields rather than
denied ones for the same forward-looking reason: naming denied fields would hand back exactly what
metadata filtering exists to withhold.

The field is emitted on every generated object type and is null for callers with no restrictions.
Clients request it only on entities with field security enabled, so a client still works against a
server whose schema predates it — except on a field-security-enabled entity, where the two must
match versions.

### 3.2 Record Changes is projected against the entity each row is about

`MJ: Record Changes` rows carry full old/new field payloads for tracked entities, and the audit
entity's own field security is switched **off** — it is not the entity being secured. Every other
enforcement point therefore short-circuits on it. Without a dedicated control, anyone with
entity-level read on the audit trail could read a denied field's values straight out of it, in the
default configuration. **That control now exists**; you do not have to configure around it.

Each row names its subject in its own `EntityID` column, and the denied set is computed against
*that* entity, per row, for the reading user:

| Column | Treatment |
|---|---|
| `ChangesJSON` | Projected — denied field keys dropped, everything else kept |
| `FullRecordJSON` | Projected the same way; it is a whole-row snapshot |
| `ChangesDescription` | **Withheld entirely**, whenever the caller is denied any field on the target entity |

`ChangesDescription` is human prose ("Salary changed from 100000 to 120000"). Redacting prose on
the fly leaks on the first value that appears in an unexpected form, so it is dropped rather than
edited. Callers degrade to a generic label — the record-changes UI shows "Changes made".

**Rows are never hidden.** This narrows payloads; it does not suppress audit entries. A user denied
one field still sees that a record changed, when, and by whom, and still sees the fields they are
entitled to. Row-level suppression was considered and rejected: it would destroy the entire audit
history of an FLS-enabled entity for anyone denied a single column.

Four things worth knowing:

- **A caller who is denied nothing sees the payload byte-for-byte unchanged.** The projection is a
  no-op for unrestricted users, and for deployments where no entity has field security enabled.
- **It fails closed when the subject entity cannot be determined** — an `EntityID` that no longer
  resolves to a known entity, or a query narrowed with `Fields` such that the rows carry no
  `EntityID` at all. Both drop all three payload columns. The second case is why: field narrowing
  runs before the projection, so failing open there would make `Fields: ['ChangesJSON']` a
  one-parameter bypass.
- **It covers every way of asking.** RunView results on both cache paths, requests that name only
  a saved view (`ViewID`/`ViewName`), single-record GraphQL responses, and the shared transport
  projection (§2.5) all project per row from that row's own `EntityID`.
- **A Record Change *entity object* keeps its full payload.** The payload columns are fields the
  reader may read; it is their *contents* that are narrowed, and an `entity_object` result's fields
  round-trip through save-SQL generation, which would write a narrowed payload back. Code that hands
  a Record Change object to a person must pass its values through `ProjectEntityValuesForUser`,
  which applies this projection.

**A narrowed payload can never be written back.** This is the write half, and without it the
projection would destroy the history it protects. A narrowed `ChangesJSON` hydrates a client-side
entity as an ordinary loaded value, and save-SQL generation writes *every* field rather than only
dirty ones — so a restricted user who edited `Comments` on a Record Change and saved would silently
replace the stored payload with the narrowed one they were shown, and the row would go on looking
complete. So when a caller who carries **any** field denial updates a Record Change, the server
ignores every payload column they send and reloads the stored values from the database first. It is
the same rule field security already applies to denied-read fields on writes — a value the client
could not have seen in full is a transport artifact, not user intent — widened here because the
column itself is readable and it is the *contents* that were narrowed. Nothing is manufactured at
any point: what a reader receives is either the stored value or a strict subset of it, and only the
stored value is ever persisted.

**Every save and delete stores a full-width payload, whoever makes it.** A restricted user's entity object
never holds the fields they cannot read (§2.3), so a payload built from that object alone would
leave those columns out. When an update's saving object is narrower than the entity, the provider
reads the stored row once, full width, on the save's own connection (inside an open transaction,
it reads that transaction's state), and builds both snapshots from it: `FullRecordJSON` is the
stored row overlaid with the save's values, and the old-values side is the stored row for every
field the object never held. `ChangesJSON` still lists only what the save changed — a field the
object never held has the same value on both sides. A field the saver wrote blind (write allowed,
read denied) records its true stored value as the old value. A full-width object, which is every
unrestricted or system-user save of a record loaded whole, costs no extra query. A save queued in a
transaction group is generated when `Save()` is called, so its snapshot describes the row as of
then.

A delete is handled the same way: a restricted user's delete records the full stored row, so a
record restored from the recycle bin comes back with the columns its deleter could not read.

A create has no stored row yet. A field the insert omits because the user may not supply it is
left out of that create's `FullRecordJSON`, rather than recorded with a value the record never
received; the column holds its database default, and the record's next change snapshots it.

Payload columns outside this set are not projected. `Comments` is user-authored, and `ErrorLog`
belongs to replay machinery; neither is derived from the target entity's field values.

### 3.3 Saved queries are checked against the caller's denials

A saved query (`RunQuery`) can read any column of any entity, in any clause, so its results cannot
be projected the way a view's can: `SELECT AVG(Salary) AS TeamMetric` has no `Salary` column to
strip. Instead, the SQL a run will **actually execute** — after composition and template rendering
— is checked against the caller's denials, and the run is **refused** if it would read a denied
field. The query is never partially answered.

How a run is decided:

1. **The query's role list wins.** A query with `MJ: Query Permissions` rows is authorized by that
   list alone: a user holding one of those roles may run it whatever it reads, and a user holding
   none may not. This bypasses field security as well as the entity checks, on purpose — query
   permissions are role-based, like granting EXECUTE on a stored procedure. **Review a query's SQL
   against your field rules before giving it a role list.**
2. **Otherwise, the entities come from the SQL.** Every entity whose base view or table the
   rendered SQL reads must be readable by the user (entity-level Read), for every caller, whether or
   not field security is involved. They are found by parsing the SQL, not taken from the query's
   `QueryEntities` rows, so a query whose rows are missing or stale is still checked. SQL the
   parser cannot read is refused for a user who cannot read every entity.
3. **Every column reference is checked.** The select list, `WHERE`, `JOIN`, `GROUP BY`,
   `ORDER BY` and `HAVING`, inside expressions and aggregates (`UPPER(Salary)`, `SUM(Salary)`). A
   predicate on a denied column leaks as surely as selecting it.
4. **It fails closed.** `SELECT *` / `alias.*` over an entity the user is denied something on, a
   column that cannot be traced through a CTE or derived table, and SQL that cannot be parsed are
   all refused for that user. So is any relation that is **not a CTE or an entity's base view or
   base table** — a custom reporting view, a synonym, a table-valued function, a temp table, a name
   in another database, `EXEC`/`CALL` — for a user who carries any field denial, because what
   such an object reads cannot be checked. Existing saved queries over custom reporting views stop
   running for restricted users; review the SQL and grant the query through its role list (step 1)
   if it is safe for them.
5. **Users denied nothing are not scanned.** When no entity the query reads has field security for
   this user, the check costs nothing.

The refusal says only that the query cannot be run; it never names the field. Because the check
runs per user on every run, cache hits included, a shared query-result cache cannot serve a
refused user. `QueryFields` metadata plays no part in the decision: it documents the query for
the UI, but it is extracted partly by an LLM and is not accurate enough to be a security source.

Two things this does **not** do:

- **Row-level security is not applied to saved queries.** That is a separate, existing design
  choice, and unchanged here.
- **A saved query that reads `MJ: Record Changes` is not payload-projected.** Record Changes has
  field security off, so the check above passes it, and the payload projection (§3.2) lives on the
  RunView, single-record and transport paths. If you expose the audit trail through a saved query,
  review it the way you would any other.

The SQL that is checked is the SQL that runs. Query templates refuse the `random` filter, the Nunjucks
built-in that can render differently twice, because the check and the execution render the
template separately.

**Ad-hoc SQL** is stricter than a saved query, and the check sits in the provider, so every
in-process caller is covered: an agent re-running a SQL-backed artifact, Data Context SQL items,
`ExecuteQueryFromSpec` (and so `TestQuerySQL`), as well as client ad-hoc queries. For any caller
except the system user, **every table the statement reads must be an entity base view the caller
can read with no row-level filter and no denied field**, on any entity, because raw SQL applies
neither row-level nor field-level security. The system user is exempt only when passed explicitly;
ad-hoc SQL with no user is refused rather than run as the process user. It runs on the read-only
connection.

### 3.4 What stays in server memory

Server memory may hold denied values; the principal rule (§2.1) is about where they go next.
What holds full-width data, and why that is safe:

- **Engine caches** (`BaseEngine`) are loaded once as the MJ system user and shared by every
  request, so they hold every column. The configuration guards in §1.4 are what keep the system
  user itself unrestricted. Anything engine-derived that is delivered to a person is projected for
  that person first.
- **System-user and no-user entity objects** hold every column (§2.3). Use them for work whose
  output stays in system-internal stores.
- **The server RunView cache is segmented by field-security fingerprint**, the same way it is
  segmented for row-level security. Users with the same denials share a slot; a user with different
  denials gets a different slot. A shared slot would leak even if every read were projected,
  because search results are matched differently per permission class: which rows come back from a
  search over a denied field is itself the disclosure. Read-time projection still runs on every row
  as a backstop, and a save event that arrives with fields missing clears the slot rather than
  patching a row in place.
- **The audit trail** (`MJ: Record Changes`) stores its payloads unprojected and projects them
  for each reader (§3.2). That includes a restricted user's own saves: the provider reads the
  stored row to complete the snapshot, so the payload never narrows to what the saver could see.

For server code acting for a user, the rule is simple: create entity objects and run views with
that user as `contextUser`, and they will never hold a value the user is denied.

### 3.5 Datasets and data contexts

**Datasets** do not segment their cache the way RunView does. Each item has one **shared,
full-width** server cache slot: a caller denied fields never has them selected, such a narrowed
read is never written to the shared slot, and rows are projected for the caller on every hit and
miss. Record Changes items get the payload projection, and a dataset's item filters go through the
provider gate (§2.6). A row filter does key the slot, so one user's filtered rows are never served
to another. The metadata dataset that clients boot
from is not narrowed; see the first residual in §5.

**Data Context items** can carry a saved copy of their rows (`DataJSON`), captured under the
permissions of whoever saved it. Those saved rows are served to a reader only when the reader's
own run could not be narrower: the item reads one entity, neither it nor an IS-A ancestor has field
security, and the reader may read it with no row-level filter. Query and SQL items can read any
number of entities, so their saved rows are never served. Otherwise the item is re-run for the
reader.

### 3.6 Search, vectors and tags (derived indexes)

An index is built once, usually by a privileged account or a scheduled job, and then served to
everyone. Field security handles that in two layers:

- **At index time, restricted fields are left out.** On an entity where field security applies,
  any field that is **not readable by every role** — it has a `Deny` or `No Access` read rule for
  any role, no rules at all, or no `Allow` read rule for a role that can read the entity — is left
  out of Entity Document template data, vector display metadata, Entity Record Document text,
  duplicate-detection text and match reasoning, the record-process inference default mapping and
  autotagging content. The rule is `GetIndexRestrictedFieldNames` in `@memberjunction/core`, shared
  by every consumer. ("A role that can read the entity" is one with an entity-level `Allow` granting
  Read and no entity-level `Deny`; roles that cannot read the entity are not counted.) IS-A
  children leave out their mirrors of a parent's restricted fields. An embedding cannot be
  projected after the fact, so this is the only way to keep a restricted value out of the vectors.
  The cost is accepted: semantic search does not match on restricted fields.

  Two paths need more than the record's own fields:
  - **Related rows** that an Entity Document template pulls in with `Relationship()` drop the same
    index-restricted fields of the related entity, plus any field the user of the render may not
    read. The join field is kept, since its value is the parent record's own key. This covers
    Entity Record Document text, autotagging content and the record-process inference context
    built from the same document. (Vector sync renders through
    `EntityDocumentTemplateDataBuilder`, which applies the same rule to related rows.)
  - **The Entity Document placeholder cache** is keyed on the user and on a hash of the record
    values passed to the render, as well as the entity, record and placeholder. So a render whose
    values had restricted fields removed never gets back a value cached by an earlier, unstripped
    render of the same record.
- **At read time, results are projected per reader.** Search results (`RawMetadata`, snippets
  and titles) are projected for each reader, alongside the existing entity, row-level and origin
  checks. The external vector-fetch path requires entity read access and projects metadata, and
  duplicate-detection candidates are projected.

**Re-index after upgrading, and whenever a field gains a `Deny` or `No Access` read rule.**
Indexes built before the exclusion, or before the rule, still contain the restricted text. MJ does
not rebuild them for you:

1. **Re-vectorize** every Entity Document on an entity where field security applies (the Vectorize
   Entity action). For an external vector store such as Pinecone, re-sync or rebuild the index so
   the old vectors and their metadata are replaced.
2. **Re-run autotagging** for the Entity content sources on those entities. Content items
   regenerate when their checksum changes, which the exclusion causes.
3. **Review existing tags.** Tags already produced from restricted text are not removed
   automatically; review them or re-tag.

Until you re-index, read-time projection keeps the restricted values out of metadata and snippets,
but similarity matching on the old embeddings can still reflect them.

### 3.7 Communications and templates

A message is composed **with the sender's permissions**. Entity communication previews and sends
read recipient records and related data as the acting user, so row-level security, entity
permissions and field security all apply, and the caller's view clauses are screened like any
RunView. A merge field the sender cannot read **renders empty**: the sender is the principal
composing the message, and must not be able to mail a value to a third party that they could not
read themselves. A request with no acting user is refused rather than run as the system user.

Templates render with the user of that render, so concurrent renders for different users each see
their own permissions.

### 3.8 Agents and prompt runs

An agent runs as the conversation user (§2.4). Its `entity_object` data sources produce objects
narrowed for that user, its `RunQuery` data sources go through the saved-query check (§3.3), its
tool actions run with that user as `ContextUser`, and its data-source cache keys on the user. Agent
notes and examples injected into its prompts come from the shared engine cache and are projected
for the run's user. Public web-widget guests and anonymous sessions are the exception: see the
residual in §5.

Prompt runs store the **rendered** system prompt, which includes any data preloaded into it. That
data was loaded for the user the agent acted for, but the stored prompt run can be read by others:
see the residual in §5.

## 4. Direct database connections (the DB tier)

Everything in §2 protects users who come through the API. This section is about the other
door: a person or tool that connects to the database directly with SQL credentials — most
often a BI tool such as Power BI.

**These are two separate perimeters, and neither replaces the other.** MJ's API talks to the
database as one fixed service login. The MJ user is application state, never a database
account. So database permissions cannot see API users, and API-tier rules cannot see direct
connections. Configure both if you have both.

### 4.1 What MJ emits, per platform

**SQL Server.** CodeGen writes `DENY SELECT ([Column]) ON [schema].[BaseView] TO [role]` into
each entity's generated permissions file, which runs on every CodeGen pass. A DENY is emitted
only when all of these hold:

1. The entity has **field security switched on**, and there is an `EntityFieldPermission` row
   with `ReadAccess = 'Deny'`. MJ never invents a DENY from a `No Access` or a missing row —
   `No Access` blocks nothing on its own, so mirroring it would make the database tier
   *stricter* than the app tier rather than the conservative subset it is meant to be.
   Switching field security off on an entity removes its DENYs on the next CodeGen run.
2. The role is a **custom role you created** and gave a `SQLName`. The three standard roles
   (UI, Developer, Integration) never get DENYs, because the API service login belongs to
   them and a DENY beats every grant — the API would lose the column for everyone.
3. No protected service login belongs to the role. CodeGen checks this each run and, if one
   does, **skips the DENY and prints a warning**. Take the service login out of the role if
   you want database-level enforcement for it.

A Deny row aimed at a standard role still works normally at the API tier. It just gets no
database mirror. The same is true for any role with a blank `SQLName` — that means
"application only" on purpose, and CodeGen now logs one line per such role so you can tell
the difference between "configured that way" and "not working."

**PostgreSQL emits nothing.** PostgreSQL has no DENY at all; its privileges only add up. MJ's
"a Deny always wins" rule cannot be expressed there, and shipping an approximation with
different behavior would be worse than shipping none. **A direct PostgreSQL connection gets no
automatic field security.** Protect those connections another way, or keep them off the
database.

### 4.2 What a direct user experiences

- **A denied column is an error, not a hidden column.** `SELECT *` fails, and so does naming
  the column. Your BI modeler has to list the allowed columns instead. In Power BI the
  navigator still shows column names — the values are what's blocked.
- **Rows are not protected at all.** MJ's row-level security is a WHERE clause added by the
  API, so a direct connection bypasses it completely. Direct users get column protection with
  no row protection. Say this plainly to anyone requesting direct access.
- **BI roles must be SELECT-only.** Do not grant EXECUTE on the CRUD stored procedures. Those
  procedures return the full row when they finish, and that path does not go through the
  column DENY — an EXECUTE grant hands back exactly what the DENY was hiding.
- **A shared account defeats per-user rules.** If everyone connects through one gateway
  account, everyone sees that account's access. Per-user enforcement needs per-user
  credentials or SSO passthrough.
- **IS-A child views are not covered.** The column DENY is written on the base view of the entity
  that owns the field. An IS-A child's base view exposes the same parent column again, and gets no
  DENY, so a direct user who can select from the child's view reads the parent's restricted field
  there. The API tier does apply the inheritance (§1.6); the database tier does not.

### 4.3 Changing your mind is now safe

CodeGen used to only ever add grants. Deleting a permission record stopped MJ from writing it
again, but the grant already in the database stayed until the view happened to be rebuilt.

CodeGen now reads the live permission state each run and re-asserts the current configuration.
Deleting a Deny row removes the DENY on the next run; deleting an `EntityPermission` row
removes that role's access to the view. Hand-made changes inside the area CodeGen manages
(its views, CRUD procedures and search functions, for roles with a `SQLName`) are reset to
match the metadata, so the metadata is the source of truth. Grants to anything else — DBA
roles, `db_datareader`, accounts MJ does not know about — are never touched.

**Run CodeGen after changing field permissions** if you rely on database-tier enforcement.
Until it runs, only the API tier reflects the change.

## 5. Operational notes

- **There is currently no UI for the entity flag.** `Enable Field Level Security` is not exposed on
  the Entity form in Explorer — the custom form that entity uses does not render it, and the flag is
  the *only* thing standing between a configured rule and an enforced one. Until that is added
  ([#4297](https://github.com/MemberJunction/MJ/issues/4297)), turn it on the way the integration
  tests do: save `EnableFieldLevelSecurity` through the entity layer (`MJ: Entities`), which is also
  what runs the snapshot. Editing the column with direct SQL is **not** equivalent — it commits the
  flag without the rows, and on an enabled entity a field with no rows is denied, so it locks every
  user out of every field on that entity.
- **Enabling field security on an entity is safe and reversible** (§1.1). It snapshots current
  access, so nothing changes until you tighten a field; switching it off keeps your rules for
  later. You do not maintain the rows by hand — MJ reconciles them as the schema and
  entity-level permissions change, and never overwrites a rule you wrote.
- **Run CodeGen after a schema change on an enabled entity.** That is the pass which creates
  rows for new columns. Until it runs, a new column is denied to everyone (§1.5).
- **Restricted users still need their baseline roles.** A user holding *only* a custom
  restricted role has no read on the metadata entities and cannot even boot a client session.
  FLS composes with normal role grants (e.g. UI role + the custom role); the custom role's
  Deny wins wherever both apply.
- **Re-index after restricting a field** (§3.6). Embeddings, vector metadata, document text and
  tags built before a `Deny` or `No Access` read rule still contain the restricted text until you
  re-vectorize and re-tag.
- **Flush RunView cache keys in a persistent shared cache (Redis) when you upgrade.** Before this
  release, a restricted user's cache miss could write narrowed rows into the slot unrestricted users
  read. Unrestricted users' slot keys do not change, so those rows would keep being served, missing
  columns, until a save or eviction cleared them; during a rolling deploy older servers keep writing
  them. Flush once every server runs the new release. Browser (IndexedDB) slots for restricted users
  re-key on their own.
- **Upgrade clients with the server.** Older client libraries send every field, denied ones at
  their defaults, when a transaction group creates a record, and the server refuses that input for
  a restricted user (§2.7). Reload open browser tabs, and move pinned consumers to the matching
  client release.
- **Test as the restricted user.** The fastest check: run a RunView with the denied field in
  `ExtraFilter` (expect the §2.9 rejection message), then load a record and confirm the field is
  absent from the payload.

### Accepted residuals

What this feature does *not* do. Each is a known, deliberate limit; an administrator planning a
restriction should know them before relying on it.

- **The shape of your restrictions ships to every authenticated browser.** Enforcement is
  server-side and complete, but the `EntityFieldPermissions` dataset item is part of the metadata
  every signed-in client loads — so *which roles are denied which named fields* is readable by any
  authenticated user, whether or not those rules apply to them. That is what makes client-side
  selection-set narrowing possible, and narrowing is why a denied field is never requested rather
  than requested and stripped. The residual is real all the same: for the confidentiality cases this
  feature exists to serve — compensation, donor records — the *names of the sensitive columns* are
  themselves informative, and it sits oddly beside the care taken to have `ReadableFields___` list
  readable rather than denied fields (§3.1.1). Values never ship; only the rule shape does. Metadata
  tiering ([#3485](https://github.com/MemberJunction/MJ/issues/3485)) is the fix, after which
  restricted users stop receiving rules that do not concern them.

- **Behaviour can still hint at a value.** Field security withholds values and refuses predicates
  that name them; it does not hide every effect a value has. Row counts and totals over fields the
  user *can* read, aggregates in a saved query authorized by its role list, a validation message a
  developer wrote that quotes another field, or a duplicate-detection match are all ways a careful
  user can infer something about a restricted value. Treat a restriction as protecting the
  **values**, and review custom validation and saved queries on restricted entities with that in
  mind.

- **The database-tier DENY covers only the owning entity's view** (§4.2). An IS-A child's view
  exposes the parent's restricted columns to direct database users. API users are protected
  (§1.6).

- **Developer and Integration roles can read stored prompt runs, which contain rendered data.** A
  prompt run always stores the rendered system prompt, so data an agent preloaded for one user is
  persisted, whatever the data-capture setting. Prompt runs are filtered to their own runs for the
  UI role, but the Developer and Integration roles can read every user's. Grant those roles
  accordingly.

- **Embeddings created before re-indexing still encode restricted text** (§3.6). Read-time
  projection removes the values from metadata and snippets, but similarity on old vectors can still
  reflect them until you re-vectorize.

- **Field security on a CORE MJ entity has not been exercised end to end.** Every scenario behind
  this guide was validated against application entities. Restricting a field on a core `__mj` entity
  is the highest-risk configuration available — it is the one that can strip the system user, which
  runs background work and shares one engine cache across all users — and it was deliberately not
  tested. The mechanism that makes it survivable *is* covered. The IT91 lifecycle checks exercise the
  `No Access`, delete, `Deny` and role-removal guards and the startup sweep (§1.4); IT130's
  mutation-tier checks cover a lowercase `deny` on a system-user role and re-pointing a rule's
  `RoleID` or a system-user role assignment. The stored-state reads, the refusal of transaction
  groups with several guarded writes, and re-pointing a rule's `EntityFieldID` are covered by unit
  tests only. What has never been run is the whole path on a real core entity. Treat
  that configuration as unproven, try it on a non-production database first, and expect to need
  §4.3 (turning it back off) close at hand.

- **Public web-widget guests and anonymous sessions run agents as the system user.** A widget guest
  or a scoped anonymous (magic-link) session has no MJ user of its own, so the pinned agent runs
  elevated, and its data sources, tools and notes read with no field-level or row-level security.
  This is tracked as a security advisory. Until it is fixed, **pin only agents whose data sources
  and tools read public data** to a widget or anonymous session.

- **Database constraint errors may echo denied values.** A unique-index violation reports the
  duplicate key, and the provider returns the database's message to the caller. With a unique index
  over `(Email, SSN)` and `SSN` denied, a collision on `Email` can show the SSN
  ([#5981](https://github.com/MemberJunction/MJ/issues/5981)). Avoid unique indexes and constraints
  that include a restricted column, or keep their messages away from restricted users.

- **Related rows loaded with an entity are not narrowed.** `InnerLoad` with
  `EntityRelationshipsToLoad` reads related records without the user's field, row-level or entity
  checks and attaches them to the object unprojected
  ([#5982](https://github.com/MemberJunction/MJ/issues/5982)). No transport returns them today
  (REST `?include=` leaves related data out of its response), but do not serialize such an object
  to a restricted user.

- **Shared conversations and artifacts can hold rows loaded for another user.** An agent's answer,
  and any artifact it produced, holds what its user could read. Sharing that conversation or
  artifact shows it to whoever it is shared with, whatever their own rules.

- **Agent run steps and action execution logs store what passed through them.** Action execution
  log `Params` and `ResultParams` are projected for the user the action ran for, but agent-run-step
  `InputData`/`OutputData` store what the agent saw, as free-form text that cannot be projected
  (MCP's `Get_Agent_Run_Step_Detail` returns them as stored to anyone who may read the step).
  Anyone who can read another user's run steps or logs can read that data; grant those entities
  accordingly.

- **Slack and Teams can fall back to a service account.** When a messaging adapter cannot map the
  person messaging to an MJ user, it can run as its configured service account, so the reply holds
  what that account can read. Give that account only the access every channel member may have.

- **System-only resolvers hand full-width data to their caller.** `GetData` and
  `RunAIAgentSystemUser` require a system-level caller and return what the system user reads. A
  service that calls them and passes the result to a person has to project it for that person.

- **The action-output projection is a backstop, not a guarantee.** `RunAction` output projects
  entity objects precisely, but a plain object is recognised as an entity row only when it carries
  the entity's primary key and at least 80% of its keys are that entity's fields. These are not
  projected:
  - rows without their primary key, and rows enriched with many extra keys;
  - rows nested more than 6 levels deep in a parameter value;
  - objects with a `toJSON()` method, whose serialized form is whatever that method returns;
  - instances of classes other than `BaseEntity`. `RunAction` output drops them, but the action
    execution log serializes their own properties;
  - JSON strings and `ActionResult.Message`.

  (`Map` and `Set` serialize to `{}`, so they carry nothing.) An action must load as its
  `ContextUser` (§6), which is the real control.

- **Memory Manager can promote a user's conversation content to a shared note.** A company- or
  global-scope agent note promoted from one user's conversation can carry what that user could read
  to every user the note reaches. Review promoted notes on agents that work with restricted data.

## 6. Building on field-level security

This section is for developers adding code that reads entity data and hands it to someone. The
rules come from §2; this is the checklist form.

### 6.1 The rules

1. **Principal rule.** A denied value must never reach a principal the rule does not entitle
   (§2.1). Ask "who ends up holding this value?" — a caller, an LLM, a recipient, a reader of a
   stored artifact — and make sure it is the user whose permissions loaded it.
2. **Run as the user you act for.** Pass that user as `contextUser` to `GetEntityObject`,
   `RunView`, `RunQuery` and actions. Never fall back to the system user, `Metadata.CurrentUser` or
   the first user in a cache when the caller is unknown: refuse instead.
3. **Width follows the user.** An object built for the user holds only what they may read, after
   `Save()` and on `NewRecord()` too. Set the user before filling the object (changing it later
   narrows, never widens), and fill it from a plain row or another entity object (§2.3). An object
   built as the system user, taken from an engine, or built with no user holds everything.
4. **Project at the boundary.** Anything not built for the receiving user goes through
   `ProjectEntityValuesForUser` / `ProjectEntityValueRowsForUser` before it leaves. Transports
   project even values that were built for the user, as defence in depth. These helpers, and the
   input gate below, pass their input through unchanged when the user is missing, so on a server
   always pass one.
5. **Gate client input.** Before `SetMany` on input from a client, call
   `AssertClientInputWritableForUser(entityInfo, values, user)`. It refuses denied and unknown keys
   with the same message.
6. **Key user-scoped caches on the user.** Use `UserScopedCacheKey`, and skip the cache when it
   returns `null`.
7. **Keep "denied" and "unknown" indistinguishable.** Never write an error, log line or response
   that confirms a restricted column exists.
8. **Check `FieldLevelSecurityApplies`, not `EnableFieldLevelSecurity`,** at runtime, so IS-A
   inheritance is honoured. The raw flag is for configuration code only.

### 6.2 Checklist by kind of feature

| You are adding | Check |
|---|---|
| **An action** | Load with `params.ContextUser`. Return values from objects built for that user, or project them. Output parameters are also stored in the action execution log, so the same applies to anything you put there. |
| **A transport or resolver** | Gate client input (rule 5). Project every returned record, including post-save responses, deltas and companions. Do not return `entity_object` results over the wire: return `simple` rows. Do not put row values in broadcasts or events for an entity where field security applies. |
| **A cache** | If it holds data loaded under a user's permissions, key it on the user (rule 6) or on a complete permission fingerprint. If it holds full-width system data, project every read for the reader. A server path that reads or fills a RunView cache slot builds its key with `ProviderBase.ComputeRunViewCacheFingerprint(params, contextUser)`, the one key builder, which carries the request, the connection, the user's row-level clause and the user's field-security segment. Never assemble a RunView fingerprint by hand. |
| **An agent data source or tool** | The agent's user is the principal. Load as that user; never pre-load as the system user and filter later. Remember the model can repeat anything in its context, and run steps store it. |
| **A template or communication** | Render with the sender's user. Strip fields the sender cannot read before merging, so they render empty. |
| **An index** (vectors, tags, document text, search provider, or LLM input built once and stored) | Leave out fields not readable by every role at index time (`GetIndexRestrictedFieldNames` in `@memberjunction/core`), and project results per reader at read time. Document that existing indexes need rebuilding. |
| **SQL that a user influences** | Run filters, sorts and aggregates through the provider (it applies the §2.6 gate). A transport that accepts filters from a client also runs `ClientClauseScreen.ScreenViewClauses`, as GraphQL, REST, MCP and A2A do. For whole statements, use the provider's ad-hoc SQL path with the user passed explicitly, on the read-only connection; `FieldSecuritySQLGate.AssertStatementAllowed` checks a statement against a user's denials. |

### 6.3 The source guard

`check:guards` (and the CI "Source guards" job) runs a scanner over MJServer (resolvers, REST,
`generic`, agent sessions, realtime, services and `index.ts`), the MCP and A2A servers, `AI/Agents`,
and every package under `Actions`, `Communication`, `Templates`, `SearchEngine` and
`MessagingAdapters`. It flags `.GetAll(`, `.GetDataObject(`, `.GetDataObjectJSON(`, `.To(`,
`JSON.stringify(<entity or rows>)`, `.Fields.map(f => f.Value)` and view results written straight
to an HTTP response. A flagged line passes when the `//` comment directly above it carries
`// fls-guard: <reason>` on a line of its own (the comment may run over several `//` lines). A
marker trailing code does not count, on the flagged line or the one before it. Reasons look like "projected by ProjectEntityValuesForUser below", "loaded as the caller; width follows its
user", or "system-user-only resolver". The scanner is a reminder, not a proof: it cannot see
types, so it recognizes entities only by name. The scanner is
`packages/MJGlobal/src/__tests__/FieldSecurityEgressCompliance.test.ts`.

### 6.4 Testing

A test only counts once you have seen it **fail** against the code without the fix. For
field-security work that means a test that puts a denied value into the system and asserts it never
appears in what your feature produces:

- **Use a real restricted user.** The `fieldSecurityFixture.ts` files in the CoreActions, Actions
  Engine and RuntimeHost test folders, and `fieldSecurityFixtures.ts` in MJServer's, build an
  `Employees` entity whose `Salary` only an HR role may read, an intern who is denied it, and real
  `BaseEntity` objects, so the tests exercise the actual narrowing.
- **Assert on the whole output.** Serialize everything your feature returns, logs or stores and
  assert the denied value's text is absent, rather than checking one property.
- **Cover both sides.** The unrestricted user still sees the value; the restricted user does not;
  a key that does not exist and a denied key produce the same error.
- **Run the integration bundles** against a private database (see the `bootstrap-clean-db` skill):
  - `IT90 - Field-Level Security Enforcement`;
  - `IT91 - FLS Lifecycle and System-User Guards` (mutation tier, `RUN_MUTATION_TESTS=1`);
  - `IT92 - FLS Over-The-Wire (client transport)`, which runs as a genuinely restricted wire
    identity;
  - `IT130 - FLS Close-out (server)`: object width, the clause gate, datasets, Record Changes, the
    configuration guards (CO14–CO16 are mutation tier) and the consumers that deliver onward;
  - `IT131 - FLS Close-out Over-The-Wire (client transport)`: client-input rejection and transport
    projection over GraphQL and REST, as restricted users with their own API keys. Its REST checks
    need `MJ_REST_API_ENABLED=true` on MJAPI;
  - `IT132 - FLS Close-out (cache segmentation, RunQuery)`: cache segmentation
    and saved-query enforcement.
- **A missing precondition is a skip, not a pass.** In an integration check, call `SkipCheck(reason)`
  from `@memberjunction/testing-integration` when a fixture is not seeded or a transport is off; it
  throws, and the runners record the check as Skipped. Returning early scores the check as Passed
  and reports coverage the run did not have. Read the skip counts in the results.
