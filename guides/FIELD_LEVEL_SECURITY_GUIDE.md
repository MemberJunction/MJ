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

### 1.4 No person is exempt

There is no admin bypass and no Owner carve-out — deliberately. A feature whose purpose is
confidentiality cannot ship with a role that quietly reads everything. Administering FLS never
requires reading the secured *values*; the admin UI edits permission rows, not the data.

The one exemption is the **MJ system user**, which is not a person: it is the account the server
runs its own work as. Its engine caches are process-wide and shared across every user, so a
restricted system user would leave partially loaded records where everyone reads them, with
nothing at the point of failure pointing back at the rule that caused it. The exemption also
protects no data — the server reaches the database through a single service login that can
already see every column, so denying it at this layer only stops the server doing its own work.

MJ refuses to entangle that account with restricted roles in the first place: you cannot save a
field rule aimed at a role the system user holds, and you cannot give the system user a role
that already carries field rules.

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

Permission changes take effect on the normal metadata refresh (API restart or cache refresh),
like entity permissions.

## 2. What is enforced (API tier)

All enforcement is server-side; client-side checks are UX only. For a user with a non-empty
denied set on an entity:

| Surface | Behavior |
|---|---|
| **RunView / list results** | Denied columns are stripped from result rows at the output boundary — on both cache hits and cache misses. |
| **Single-record GraphQL loads** | Denied fields are stripped from the response (`MapFieldNamesToCodeNames`, the same boundary that masks encrypted fields). |
| **Caller-authored predicates** — `ExtraFilter`, `OrderBy`, `Aggregates[].expression` | The request is **rejected** before execution. Output stripping alone would be theater: `ExtraFilter: "Salary > 200000"` or `Aggregates: [{expression: 'MIN(Salary)'}]` reconstructs values without the column ever appearing in a result. |
| **`UserSearchString`** | Not rejected — denied fields are simply excluded from the searched-field list. |
| **Saves (update)** | A save that modifies a field the user cannot update is rejected server-side before SQL generation. |
| **Saves (denied-read fields)** | Values a client sends for fields it cannot *read* are **silently ignored** — such a field was stripped from every payload the client ever received, so any value it sends back is fabricated by the transport, not user intent. This is what makes "load a record, edit an unrelated field, save" safe for restricted users. |
| **Creates** | A value supplied for a field the user may not create is **dropped, and the column takes its default** — the insert is never rejected. Rejecting would name the field, confirming it exists and is restricted; and silently defaulting is exactly what an unrestricted user gets by leaving the field blank, so a restricted user ends up with the same record shape rather than a failure. |
| **Typed accessors (`Get` / `Set`)** | Reading or writing a denied field **by name** throws, so a restricted field surfaces as a clear failure instead of a silent blank. Framework-internal machinery — validation, save-SQL generation, serialization — reads values directly and is exempt, which is what keeps stored values intact through a restricted user's round trip. |
| **Entity forms** | Fields the user cannot read are **not rendered at all**. The form checks access before touching a value, so one denied column cannot take out the form it sits in. |

### The denial message — deliberately ambiguous

Rejections read:

> `Field 'X' does not exist on entity 'Y' or you do not have access to it.`

It never discloses *which* of the two is true, modeled on SQL Server's posture. Confirming
"this field exists and is restricted" would turn any predicate into a probe for which columns
a deployment considers sensitive. Recognize this wording as (possibly) FLS at work; do not
"improve" it to name the reason.

Rejections are logged at debug level (`[FieldSecurity] …`); routine output stripping is not
logged (it happens on every request to a restricted entity and carries no signal).

## 3. Configuration constraints — read before restricting a field

### 3.1 Do not restrict NOT NULL columns

**FLS-restricted fields should be nullable.** The generated GraphQL object types mark NOT NULL
columns non-nullable, and FLS omission makes such a field resolve to null for denied users.
Verified consequences:

- **Single-record loads break**: the whole record resolves to null for the denied user.
- **Update responses break**: the denied user's save **succeeds in the database**, but the
  mutation *response* fails serialization — the client reports a failed save for an edit that
  actually landed.
- **Creation can break**: NOT NULL + no default + a denied user means nobody supplies the
  value and validation fails — that user cannot create records at all.

Nullable denied fields degrade gracefully (they simply come back absent/null). If a sensitive
column is currently NOT NULL, make it nullable (or leave it unrestricted) before adding FLS
rows.

### 3.2 Record Changes is a trust boundary

`MJ: Record Changes` rows carry full old/new field payloads for tracked entities. A user who
can read Record Changes can read a denied field's values out of the audit trail.

**Do not grant entity-level read on `MJ: Record Changes` to roles that carry FLS denials on
any entity — or to roles that should not read a tracked entity's data generally.** If a
deployment needs broader Record Changes access, the blunt per-deployment tool is to
FLS-restrict Record Changes' own payload columns (`ChangesJSON`, `ChangesDescription`,
`FullRecordJSON`) for the roles in question. Payload-level redaction keyed to the target
entity's own FLS is a future record-change-auditing overhaul, not a current feature.

### 3.3 Saved queries are NOT FLS-filtered

`RunQuery` results are not field-filtered. A saved query is an admin-authored, curated
artifact: **run access to the query is the grant.** An admin who writes
`SELECT AVG(Salary) AS TeamMetric …` and grants a role run access has exposed that data to
that role, regardless of FLS rows on `Salary` — column stripping could not catch aggregates
and derived columns anyway, and pretending otherwise would be false assurance. Review a
query's SQL against your FLS posture *when granting run access*.

### 3.4 Server-internal code sees full values

Entity objects loaded server-side retain every column in memory — the trust boundary is the
API output, exactly as with encrypted fields. Engines are no longer a concern here: on a
server, `BaseEngine` always loads its shared caches as the MJ system user regardless of who
triggered the load, so engine data cannot be narrowed by a restricted caller. For NON-engine
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
