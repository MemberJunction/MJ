# Field-Level Security (FLS) Guide

Role-based, per-field access control for entity data — who can **read** and who can **update**
each column, enforced server-side. Built for the compensation / donor-giving / personnel-record
class of requirement: an entity most users may work with, containing a few columns most users
must never see.

This guide is for administrators configuring FLS and for developers building on entities that
carry it. It documents the configuration model, what is and is not enforced, and — read these
before restricting anything — the configuration constraints and trust boundaries.

---

## 1. Configuration model

FLS is data, not code: rows in **`MJ: Entity Field Permissions`** (`EntityFieldPermission`),
each mapping an entity **field** to a **role** with access flags:

| Column | Meaning |
|---|---|
| `EntityFieldID` | The field being secured |
| `RoleID` | The role the row applies to |
| `Type` | `Allow` or `Deny` |
| `CanRead` / `CanUpdate` | The access being granted (Allow) or revoked (Deny) |
| `CanCreate` | Present in the schema but **not enforced** in this release |

### Aggregation semantics

- **No rows on a field → default open.** Every existing deployment is unaffected until an
  admin explicitly adds rows. Zero migration burden.
- **Any row on a field → allow-list mode for that field.** Only roles holding an `Allow` row
  with the flag set get that access; a user whose roles match no rows gets **nothing** on that
  field. Adding the first row to a field is therefore a deployment-visible event — see §5.
- **Across a user's roles**: Allow flags OR together; Deny flags OR together; result =
  `Allow AND NOT Deny`. **A single Deny row on any of the user's roles beats every Allow.**
- **No person is ever exempt.** There is no admin bypass and no Owner carve-out — deliberately.
  A feature whose purpose is confidentiality cannot ship with a role that quietly reads
  everything. (Administering FLS never requires reading the secured *values*; the admin UI
  edits permission rows, not the data.) **The one exemption is the MJ system user**, which is
  not a person — see §1.1.
- `CanRead` and `CanUpdate` aggregate **independently**. Read-denied + update-allowed is a
  legal configuration (a write-only field, e.g. SSN capture); so is readable + update-denied.

### 1.1 The one thing that surprises everyone: the first rule closes the field

Read this before you add your first rule to any field.

The open-by-default behavior is a property of the **field**, not of the user. So:

- A field with **no** rules is readable by everyone.
- A field with **one** rule is readable only by roles that have an explicit Allow. Everyone
  else gets nothing — **including users no rule ever mentions.**

That means adding a single Deny rule for one role does two things at once. It denies that
role, and it closes the field for every user who does not hold an Allow. People expect a Deny
list; what they get is an allow list that switches on the moment any rule exists.

**There is no "everyone except role X" form.** Securing a field means listing who *may* read
it. If four roles should keep access and one should lose it, write four Allow rows — not one
Deny row.

**Practical rule:** when you secure a field, add the Allow rows for every role that should keep
access **in the same change**. Otherwise working users lose the field at the next metadata
refresh.

### The system user is exempt

The MJ system user — the account the server runs its own work as — is exempt from field
security. It is the only exemption, and it exists because of the flip above: the first rule an
admin writes, on any role at all, would otherwise strip that field from the server itself.
Engines then cache partially loaded records process-wide and serve them to every user, with
nothing at the point of failure pointing back at the rule that caused it.

It costs nothing in protection. The server reads the database through a single service login
that can already see every column, so denying the system user at this layer protects no data —
it only stops the server from doing its own work. Anyone who can act as the system user (the
system API key) is already fully trusted by design.

MJ also refuses to entangle that account with restricted roles in the first place: you cannot
save a field rule aimed at a role the system user holds, and you cannot give the system user a
role that already carries field rules.

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

1. There is an `EntityFieldPermission` row with `Type = 'Deny'` and `CanRead` set. MJ never
   invents a DENY from a missing Allow — the database tier is a conservative subset of the
   app tier, not a copy of it.
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

- **Adding the first row to a field flips it to allow-list mode** (§1). Before adding it,
  enumerate which roles legitimately need the field and create their Allow rows in the same
  change, or working users lose access on the next metadata refresh.
- **Restricted users still need their baseline roles.** A user holding *only* a custom
  restricted role has no read on the metadata entities and cannot even boot a client session.
  FLS composes with normal role grants (e.g. UI role + the custom role); the custom role's
  Deny wins wherever both apply.
- **Test as the restricted user.** The fastest check: run a RunView with the denied field in
  `ExtraFilter` (expect the §2 rejection message), then load a record and confirm the field is
  absent from the payload.
