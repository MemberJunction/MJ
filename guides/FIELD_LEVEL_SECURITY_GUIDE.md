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
- **Nothing overrides a Deny.** There is no per-user exemption, no admin bypass, no Owner
  carve-out — deliberately. A feature whose purpose is confidentiality cannot ship with a role
  that quietly reads everything. (Administering FLS never requires reading the secured
  *values*; the admin UI edits permission rows, not the data.)
- `CanRead` and `CanUpdate` aggregate **independently**. Read-denied + update-allowed is a
  legal configuration (a write-only field, e.g. SSN capture); so is readable + update-denied.

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

Entity objects loaded server-side (engines, agents, actions running under a `contextUser`)
retain every column in memory — the trust boundary is the API output, exactly as with
encrypted fields. An FLS-restricted `contextUser` driving a server-side engine is a
configuration to avoid, not a supported isolation mechanism.

## 4. Direct database connections (DB tier) — summary

> Full documentation ships with the DB-tier enforcement work (CodeGen-emitted column DENYs).
> The load-bearing facts, which are true today:

- **The API service login is the only database principal MJ uses.** Everything in §2 is
  API-tier enforcement; it does not depend on database-level permissions, and database-level
  permissions cannot see API users.
- **Direct SQL connections** (e.g. BI tools like Power BI) are a separate perimeter:
  - **SQL Server**: column-level `DENY`s will be emitted for **custom (DBA-created) roles
    only** — the standard UI/Developer/Integration roles never receive DB-tier DENYs (an FLS
    row against a standard role is enforced at the API tier only).
  - **PostgreSQL**: **no automatic FLS at the database tier at all** (PG has no DENY, so MJ's
    Deny-wins semantics cannot be expressed there). Direct PG connections see every column.
  - **Row-level security does not apply to direct connections on either platform** — MJ RLS
    is API-tier WHERE-clause injection. Column protection without row protection.
  - **BI roles must be SELECT-only.** A direct user with EXECUTE on the CRUD procs can read
    full rows from proc output, bypassing column DENYs.
  - A denied column produces a **hard error** (not a narrowed result) for direct users,
    including `SELECT *` — direct consumers must enumerate their allowed columns.

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
