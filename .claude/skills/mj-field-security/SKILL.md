---
name: mj-field-security
description: Build or review MemberJunction code that hands entity data onward so it respects field-level security — new actions, GraphQL/REST/MCP/A2A transports and resolvers, caches, agent data sources and tools, templates, communications, and derived indexes (vectors, tags, search). Covers the principal rule, on-behalf-of identity, object width following its user, the shared output projection, client-input rejection, user-keyed caches, the fls-guard source guard, and how to test with a restricted user (failing first). Use when adding or changing any such code, or when a review or the check:guards scanner flags an entity serialization.
---

# Building on MJ field-level security

Field-level security (FLS) lets an administrator deny a role Read, Update or Create on single
fields. Enforcement is server-side, and most of it is automatic. What is not automatic is code that
takes entity values and **hands them to someone**. This skill is the checklist for that code.

The full model is [`guides/FIELD_LEVEL_SECURITY_GUIDE.md`](../../../guides/FIELD_LEVEL_SECURITY_GUIDE.md).
Read §2 (what is enforced) and §6 (building on it) before starting.

---

## Step 1 — Name the principal

Write down **who ends up holding the values** your code produces. A denied value may sit in server
memory; it must never reach a principal the rule does not entitle.

| Your output goes to | The principal |
|---|---|
| An API response, stream, broadcast or event | The caller |
| An action's output params (also saved in the action execution log) | The caller, or the agent acting for them |
| An LLM prompt, tool result or agent payload (also saved in run steps) | The user the agent acts for |
| A rendered template or message | The sender, and through them the recipient |
| A stored artifact: embedding, vector metadata, tag, document text, data context | Everyone who reads it later |

If you cannot name a single user, the output must not contain values from fields restricted for
any role (see Step 5, indexes).

## Step 2 — Load as that principal

- Pass the user to every load: `GetEntityObject(name, contextUser)`, `RunView(params, contextUser)`,
  `RunQuery(params, contextUser)`, actions' `ContextUser`.
- When the user is unknown, **refuse**. Never fall back to the system user, `Metadata.CurrentUser`,
  `UserCache.Users[0]` or a configured service account.
- An object built for a restricted user **never holds a denied value**, after `Save()` and on
  `NewRecord()` too. Its `GetAll()`, `GetDataObject()`, `Fields[i].Value` and `JSON.stringify` are
  safe for **that same user**.
- That holds when the user is set **before** the object is filled (pass it to `GetEntityObject`).
  Setting `ContextCurrentUser` on a loaded object narrows it to the new user, but never widens it.
  Fill from a plain row or another entity object: `LoadFromData` reads an entity source through its
  own `GetAll()`, and `CopyFrom` skips fields the target's user may not read.
- An object built as the system user, read from a `BaseEngine` cache, or built with no user holds
  **every column**. Treat its values as unprojected.

## Step 3 — Project at the boundary

Anything not built for the receiving principal must be projected before it leaves:

```typescript
import { ProjectEntityValuesForUser, ProjectEntityValueRowsForUser } from '@memberjunction/core';

// one record
const safe = ProjectEntityValuesForUser(provider, entity.EntityInfo, entity.GetAll(), user);
// many records of one entity
const rows = ProjectEntityValueRowsForUser(provider, entityInfo, plainRows, user);
```

It drops denied keys by Name and CodeName in any case, projects Record Changes payloads per row,
and can add `ReadableFields___` for MJ clients (`{ includeReadableFields: true }`). **With no user
it returns its input unchanged** (the browser has no user to project for), so on a server always
pass the user the output is for.

Wire transports project **everything** they return, as defence in depth, and return `simple`
rows, never `entity_object`. Broadcasts and events for an entity where FLS applies carry keys and
changed field names, never values.

## Step 4 — Gate client input

Before applying client input with `SetMany`:

```typescript
import { AssertClientInputWritableForUser } from '@memberjunction/core';

AssertClientInputWritableForUser(entity.EntityInfo, input, user);
entity.SetMany(input);
```

For a user denied anything on the entity, a key naming a field they cannot read **or no field at
all** throws a `FieldSecurityError` with the same message (`Field 'X' cannot be written on entity
'Y'.`). Keep denied and unknown indistinguishable in every error, log line and response you write.
Pass transport-only keys through `additionalAllowedKeys`.

## Step 5 — Check the feature-specific items

- **Caches** of user-scoped data: key with `UserScopedCacheKey(userID, ...parts)` from
  `@memberjunction/global`; a `null` key means do not cache. A cache of full-width system data must
  project every read for the reader. RunView cache slots are keyed only by
  `ProviderBase.ComputeRunViewCacheFingerprint(params, contextUser)`; never build one by hand.
- **Agent data sources and tools:** load as the agent's user. Do not preload as the system user and
  filter afterwards; the model can repeat anything in its context.
- **Templates and communications:** render as the sender; strip fields the sender cannot read so
  they render empty.
- **Indexes** (and LLM input built once and stored): leave out
  `GetIndexRestrictedFieldNames(entity)` (`@memberjunction/core`) at index time, project results per
  reader at read time, and tell admins existing indexes need rebuilding. The rule excludes a field
  with a `Deny` or `No Access` read rule, no rules at all, or no `Allow` read rule for a role that
  can read the entity.
- **SQL a user influences:** let the provider run filters, sorts and aggregates (it applies the
  parse-based gate). A transport taking client filters also runs
  `ClientClauseScreen.ScreenViewClauses`, as GraphQL, REST, MCP and A2A do. For whole statements use
  the provider's ad-hoc SQL path with the user passed explicitly (no user is refused) and the
  read-only connection; `FieldSecuritySQLGate.AssertStatementAllowed` checks a statement against a
  user.
- **IS-A:** check `EntityInfo.FieldLevelSecurityApplies`, not `EnableFieldLevelSecurity`, at runtime.

## Step 6 — Satisfy the source guard

```bash
pnpm run check:guards
```

The `FieldSecurityEgressCompliance` scanner flags `.GetAll(`, `.GetDataObject(`,
`.GetDataObjectJSON(`, `.To(`, `JSON.stringify(<entity or rows>)`, `.Fields.map(f => f.Value)` and
view results written to an HTTP response, in MJServer (resolvers, REST, `generic`, agent sessions,
realtime, services), the MCP and A2A servers, `AI/Agents`, and the Actions, Communication,
Templates, SearchEngine and MessagingAdapters packages. For each flagged line, either project the value or mark the line (or the
line above) with a short reason:

```typescript
// fls-guard: loaded as params.ContextUser; width follows its user
const recordData = entity.GetAll();
```

Good reasons: "projected by ProjectEntityValuesForUser below", "system-user-only resolver",
"EntityInfo metadata, not record values". "safe" alone is not a reason.

## Step 7 — Test it, failing first

A test only counts once you have **seen it fail** against the code without your fix.

1. **Build a restricted user.** Reuse the fixtures: `packages/Actions/CoreActions/src/__tests__/fieldSecurityFixture.ts`
   (also in `Actions/Engine` and `Actions/RuntimeHost`) and
   `packages/MJServer/src/__tests__/fieldSecurityFixtures.ts`. They give an `Employees` entity whose
   `Salary` only HR may read, an intern denied it, an HR user, and real `BaseEntity` objects.
2. **Write the leak test first.** Run your feature as the intern and assert the salary's **text**
   is absent from everything it returns, logs or stores (`JSON.stringify` the whole output and
   search it). Run it and watch it fail.
3. **Fix, then watch it pass.** Add the HR-user case (still sees the value) and, for input paths,
   the case where a denied key and an unknown key produce the same error.
4. **Run the package's whole suite**: `cd packages/<Package> && pnpm test`.
5. **Run the integration bundles** on a private database (see the `bootstrap-clean-db` skill):
   - `IT90 - Field-Level Security Enforcement`
   - `IT91 - FLS Lifecycle and System-User Guards` (mutation tier, `RUN_MUTATION_TESTS=1`)
   - `IT92 - FLS Over-The-Wire (client transport)`, as a genuinely restricted wire identity
   - `IT133 - FLS Close-out (server)` (CO14–CO16 are mutation tier)
   - `IT134 - FLS Close-out Over-The-Wire (client transport)`; its REST checks need
     `MJ_REST_API_ENABLED=true` on MJAPI
   - `IT135 - FLS Close-out (cache segmentation, RunQuery)`

   ```bash
   pnpm mj test run "IT134 - FLS Close-out Over-The-Wire (client transport)"
   ```
6. **A missing precondition is a skip, not a pass.** In an integration check, end with
   `SkipCheck(reason)` (`@memberjunction/testing-integration`) when a fixture is not seeded or a
   transport is off. It throws, and the runners record the check as Skipped; an early `return`
   scores as Passed. Check the skip counts before you report coverage.
