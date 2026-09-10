# Field-Level Security (FLS) Guide

Role-based, per-field access control for entity data — who can **read**, **update**, and
**create** each column, enforced server-side. Built for the compensation / donor-giving /
personnel-record class of requirement: an entity most users may work with, containing a few
columns most users must never see.

This guide is for administrators configuring FLS and for developers building on entities that
carry it. It documents the configuration model, what is and is not enforced, and — read these
before restricting anything — the configuration constraints and trust boundaries.

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

> **Why the guard looks at the whole field, not the rule you are editing.** Whether a change
> restricts someone is a property of the **aggregate across every role they hold**, never of one
> rule on its own. `No Access` cannot take away what another role granted — but set *every* one of
> the system user's roles to `No Access` in turn and no `Deny` was ever written, yet nothing is
> left granting the field. So the guard evaluates the rules as they would stand *after* your
> change, for update and delete. Inserts need only the `Deny` check, since adding a rule can never
> remove an existing `Allow`.

A **startup check** sweeps FLS-enabled entities and logs any field the system user has lost access
to. It is the backstop for states the save path never saw — direct SQL, a migration, a role taken
off the account. It warns rather than refusing to boot: bad configuration should be loud, but a
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
  caller may actually read (§3.1.1).

A change made outside the entity layer — direct SQL, a migration — is picked up on the periodic
refresh cycle, whose staleness check always reads database timestamps rather than its own cache,
or on an API restart.

## 2. What is enforced (API tier)

All enforcement is server-side; client-side checks are UX only. For a user with a non-empty
denied set on an entity:

| Surface | Behavior |
|---|---|
| **RunView / list results** | Denied columns are stripped from result rows at the output boundary — on both cache hits and cache misses. |
| **Single-record GraphQL loads** | Denied fields are stripped from the response (`MapFieldNamesToCodeNames`, the same boundary that masks encrypted fields). |
| **Caller-authored predicates** — `ExtraFilter`, `OrderBy`, `Aggregates[].expression` **on the request** (a saved view's own stored clauses are *not* screened — see §5) | The request is **rejected** before execution. Output stripping alone would be theater: `ExtraFilter: "Salary > 200000"` or `Aggregates: [{expression: 'MIN(Salary)'}]` reconstructs values without the column ever appearing in a result. |
| **`UserSearchString`** | Not rejected — denied fields are simply excluded from the searched-field list. |
| **Saves (update)** | A save that modifies a field the user cannot update is rejected server-side before SQL generation. |
| **Saves (denied-read fields)** | Values a client sends for fields it cannot *read* are **silently ignored** — such a field was stripped from every payload the client ever received, so any value it sends back is fabricated by the transport, not user intent. This is what makes "load a record, edit an unrelated field, save" safe for restricted users. |
| **Creates** | A value supplied for a field the user may not create is **dropped, and the column takes its default** — the insert is never rejected. Rejecting would name the field, confirming it exists and is restricted; and silently defaulting is exactly what an unrestricted user gets by leaving the field blank, so a restricted user ends up with the same record shape rather than a failure. |
| **Typed accessors (`Get` / `Set`)** | Reading or writing a denied field **by name** throws, so a restricted field surfaces as a clear failure instead of a silent blank. Framework-internal machinery — validation, save-SQL generation, serialization — reads values directly and is exempt, which is what keeps stored values intact through a restricted user's round trip. |
| **`MJ: Record Changes` payload** | The audit trail is projected against **the entity each row is about**, not against Record Changes. Denied field keys are dropped from `ChangesJSON` and `FullRecordJSON`; `ChangesDescription` is **withheld entirely**. See §3.2. |
| **Record names** (FK links, breadcrumbs, pickers) | When an entity's **name field** is denied, the record's display name is withheld and every caller **falls back to the primary key**. This applies to the `GetEntityRecordName` query and to `BaseEntity.GetRecordName()` alike. It is a fallback rather than an error on purpose: `GetRecordName()` runs automatically after every load and save, so throwing would make records on that entity fail to open rather than merely hide a name — and answering "no name" keeps the query from becoming a probe that tells restricted apart from missing. |
| **Entity forms** | Fields the user cannot read are **not rendered at all**. The form checks access before touching a value, so one denied column cannot take out the form it sits in. A field you can read but not write renders read-only rather than editable — which matters most on **create**, where the server drops the value silently and this is the only signal you get. |
| **Grids and view configuration** | Denied columns are not rendered, and the view-configuration panel does not offer them as columns. Your **saved column preferences are left intact** — a denial is reversible, so hiding a column never rewrites the preference that mentions it, and the column reappears when access is restored. Saved **sort** settings are dropped, because a denied field in `ORDER BY` is rejected outright rather than degrading. |

### The update rejection depends on hydrating from the database

The update check rejects **dirty** fields — the ones whose value differs from what the record was
loaded with. That is only a security boundary if the loaded state is the database's, so on an
FLS-enabled entity `ResolverBase.UpdateRecord` always loads the row rather than taking its
`OldValues___` shortcut (`MustLoadTruthFromDatabase`).

The shortcut exists because a client that already holds the prior state makes the round trip
redundant. It is not safe here. A value the client supplies in `OldValues___` is applied through
`LoadFromData`, which records it as the field's *initial* value — so the field is never dirty, the
update check never examines it, and save-SQL generation sends it regardless (it omits only
not-loaded fields, never non-dirty ones). A caller could then write a field it may not write by
pinning the value in `OldValues___` and never naming it in the mutation.

Note this is not covered by the denied-read strip. That strip forces the database load too, but
only when the caller has at least one denied-**read** field. The configuration this feature most
exists to serve — *read a field, but do not change it* — leaves that set empty, which is precisely
when the entity flag has to carry the decision on its own.

**If you are tuning this path, the entity flag is not the optional term.** Removing it reopens a
silent write. `packages/MJServer/src/__tests__/resolverBase.fls.test.ts` pins it.

### The denial message — ambiguous for READ, explicit for WRITE

**READ denials** — a predicate naming an unreadable field, or a typed accessor touching one — read:

> `Field 'X' does not exist on entity 'Y' or you do not have access to it.`

That never discloses *which* of the two is true, modeled on SQL Server's posture. Confirming
"this field exists and is restricted" would turn any predicate into a probe for which columns a
deployment considers sensitive. Recognize this wording as (possibly) FLS at work; do not
"improve" it to name the reason.

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

Three things worth knowing:

- **A caller who is denied nothing sees the payload byte-for-byte unchanged.** The projection is a
  no-op for unrestricted users, and for deployments where no entity has field security enabled.
- **It fails closed when the subject entity cannot be determined** — an `EntityID` that no longer
  resolves to a known entity, or a query narrowed with `Fields` such that the rows carry no
  `EntityID` at all. Both drop all three payload columns. The second case is why: field narrowing
  runs before the projection, so failing open there would make `Fields: ['ChangesJSON']` a
  one-parameter bypass.
- **Server-internal code still sees full values**, exactly as in §3.4. The projection is applied to
  API output — RunView results on both cache paths, and single-record GraphQL responses — not to
  `entity_object` results, whose fields round-trip through save-SQL generation and would be written
  back narrowed.

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

Payload columns outside this set are not projected. `Comments` is user-authored, and `ErrorLog`
belongs to replay machinery; neither is derived from the target entity's field values.

### 3.3 Saved queries are NOT FLS-filtered

`RunQuery` results are not field-filtered. A saved query is an admin-authored, curated
artifact: **run access to the query is the grant.** An admin who writes
`SELECT AVG(Salary) AS TeamMetric …` and grants a role run access has exposed that data to
that role, regardless of FLS rows on `Salary` — column stripping could not catch aggregates
and derived columns anyway, and pretending otherwise would be false assurance. Review a
query's SQL against your FLS posture *when granting run access*.

This is unchanged by §3.2. A saved query that reads `MJ: Record Changes` directly is **not**
payload-projected — the projection lives on the RunView and single-record read paths, which is
where the platform, not an admin, decides what a caller receives. If your deployment restricts
fields and exposes the audit trail through saved queries, review those queries the same way you
review any other.

### 3.4 Server-internal code sees full values

Entity objects loaded server-side retain every column in memory — the trust boundary is the
API output, exactly as with encrypted fields. Engines are no longer a concern here: on a
server, `BaseEngine` always loads its shared caches as the MJ system user regardless of who
triggered the load, so engine data cannot be narrowed by a restricted caller — and the
configuration guards in §1.4 are what keep the system user itself unrestricted. For NON-engine
server code (an action or agent step holding a restricted `contextUser`), single-record loads
fetch only the caller's allowed columns; anything beyond that remains code the server trusts.

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
- **Test as the restricted user.** The fastest check: run a RunView with the denied field in
  `ExtraFilter` (expect the §2 rejection message), then load a record and confirm the field is
  absent from the payload.

### Accepted residuals

Three things this feature does *not* do. The first two are deliberate. The third is a known gap with
a fix pending; it is recorded here because §2 promises the opposite and an administrator planning a
restriction needs to know before they rely on it.

- **The shape of your restrictions ships to every authenticated browser.** Enforcement is
  server-side and complete, but the `EntityFieldPermissions` dataset item is part of the metadata
  every signed-in client loads — so *which roles are denied which named fields* is readable by any
  authenticated user, whether or not those rules apply to them. That is what makes client-side
  selection-set narrowing possible, and narrowing is why a denied field is never requested rather
  than requested and stripped. The residual is real all the same: for the confidentiality cases this
  feature exists to serve — compensation, donor records — the *names of the sensitive columns* are
  themselves informative, and it sits oddly beside the care taken to have `ReadableFields___` list
  readable rather than denied fields (§2). Values never ship; only the rule shape does. Metadata
  tiering ([#3485](https://github.com/MemberJunction/MJ/issues/3485)) is the fix, after which
  restricted users stop receiving rules that do not concern them.

- **A saved User View's own filter and sort are NOT screened against your denials.** §2 says a
  caller-authored predicate naming a denied field is rejected before execution, and that is true of
  `ExtraFilter`, `OrderBy` and `Aggregates[].expression` on the request. It is **not** true of the
  `WhereClause` and `OrderByClause` stored on a User View: those are applied later, inside the
  provider's own query assembly, and never reach the predicate gate. The only screen they get is the
  forbidden-keyword check, which has no notion of denied columns.

  This is not admin-gated. Only `CustomWhereClause` requires elevation; an ordinary filter is saved
  by any user, and a sort is written by clicking a grid column header. So a user denied read on
  `Employees.Salary` can save a view filtered `Salary > 200000`, run it, and read the answer off the
  row set — the column is still stripped from the output, but *which rows come back* is the
  disclosure. Binary-searching the threshold recovers exact values; a saved `Salary DESC` sort leaks
  the ranking in one call.

  Until this is closed, treat a restriction as protecting the **values** rather than proving
  non-disclosure, on any entity where restricted users can save their own views. The fix is to run
  the gate against the effective clauses after the stored view resolves, rather than only against
  the caller-supplied `RunViewParams`.

- **Field security on a CORE MJ entity has not been exercised end to end.** Every scenario behind
  this guide was validated against application entities. Restricting a field on a core `__mj` entity
  is the highest-risk configuration available — it is the one that can strip the system user, which
  runs background work and shares one engine cache across all users — and it was deliberately not
  tested. The mechanism that makes it survivable *is* covered: the system-user access guard, the
  five configuration guards, and the unrestrictable-field rules are all exercised by the IT91
  lifecycle checks (§1.4). What has never been run is the whole path on a real core entity. Treat
  that configuration as unproven, try it on a non-production database first, and expect to need
  §4.3 (turning it back off) close at hand.
