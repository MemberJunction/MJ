---
paths:
  - "packages/Actions/**"
  - "packages/AI/**"
  - "packages/MJServer/**"
  - "packages/Communication/**"
  - "packages/SearchEngine/**"
---

# Field-level security when handing entity data onward

Loads for packages whose code hands entity values to someone: actions, agents and AI servers,
GraphQL/REST transports, communications and search. The full model is
[`guides/FIELD_LEVEL_SECURITY_GUIDE.md`](../../guides/FIELD_LEVEL_SECURITY_GUIDE.md); §6 is the
checklist, and the `mj-field-security` skill walks through it with tests.

## The rules

- **Principal rule.** A denied value may sit in server memory, but must never reach a principal the
  rule does not entitle: an API caller, an LLM's context, a message recipient, a reader of a stored
  artifact (vectors, tags, data contexts, logs, action execution logs).
- **Run as the user you act for.** Pass that user as `contextUser` to `GetEntityObject`, `RunView`,
  `RunQuery` and actions. When the user is unknown, refuse; never fall back to the system user,
  `CurrentUser` or the first cached user.
- **Width follows the user.** An entity object built for a restricted user never holds a denied
  value, after `Save()` too, so its `GetAll()` / `JSON.stringify` are safe for that same user. An
  object built as the system user, taken from an engine cache, or built with no user holds every
  column.
- **Project at the boundary.** Values not built for the receiving user go through
  `ProjectEntityValuesForUser` / `ProjectEntityValueRowsForUser` (`@memberjunction/core`). Wire
  transports project everything, and return `simple` rows, never `entity_object`.
- **Gate client input.** Call `AssertClientInputWritableForUser` before `SetMany` on client input.
  Denied and unknown keys get the same error; keep it that way.
- **Key user-scoped caches on the user** with `UserScopedCacheKey` (`@memberjunction/global`); a
  `null` key means do not cache.
- **Check `EntityInfo.FieldLevelSecurityApplies`** at runtime, not `EnableFieldLevelSecurity`, so
  IS-A children inherit their ancestors' rules.
- **Indexes** leave out fields not readable by every role (`GetIndexRestrictedFieldNames`) and
  project results per reader.

## The source guard

`pnpm run check:guards` flags `.GetAll(`, `.GetDataObject(`, `.GetDataObjectJSON(` and
`JSON.stringify(<entity>)` in MJServer resolvers and REST, the MCP and A2A servers, and actions.
Project the value, or mark the line (or the line above) with `// fls-guard: <short reason>` saying
why it is safe, for example `loaded as the caller; width follows its user`.
