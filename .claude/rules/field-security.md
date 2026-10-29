---
paths:
  - "packages/Actions/**"
  - "packages/AI/**"
  - "packages/MJServer/**"
  - "packages/Communication/**"
  - "packages/SearchEngine/**"
  - "packages/Templates/**"
  - "packages/ContentAutotagging/**"
  - "packages/MJDataContext*/**"
  - "packages/MJCore/**"
  - "packages/GenericDatabaseProvider/**"
  - "packages/Angular/**"
---

# Field-level security when handing entity data onward

Loads for packages whose code hands entity values to someone, or that implement the enforcement
itself: actions, agents and AI servers, GraphQL/REST transports, communications, templates, search
and autotagging, data contexts, the core entity layer and database provider, and the Angular
client. The full model is
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
  value, after `Save()` and on `NewRecord()` too, so its `GetAll()` / `JSON.stringify` are safe for
  that same user. Set the user before filling the object; setting `ContextCurrentUser` later
  narrows it but never widens it. Fill from a plain row or another entity object (`LoadFromData`
  reads an entity source through its own `GetAll()`; `CopyFrom` skips unreadable fields). An object
  built as the system user, taken from an engine cache, or built with no user holds every column.
- **Project at the boundary.** Values not built for the receiving user go through
  `ProjectEntityValuesForUser` / `ProjectEntityValueRowsForUser` (`@memberjunction/core`). Wire
  transports project everything, and return `simple` rows, never `entity_object`. These helpers
  and the input gate pass input through unchanged when the user is missing (a browser has none),
  so on a server always pass the user.
- **Gate client input.** Call `AssertClientInputWritableForUser` before `SetMany` on client input.
  Denied and unknown keys get the same error; keep it that way.
- **Key user-scoped caches on the user** with `UserScopedCacheKey` (`@memberjunction/global`); a
  `null` key means do not cache.
- **Check `EntityInfo.FieldLevelSecurityApplies`** at runtime, not `EnableFieldLevelSecurity`, so
  IS-A children inherit their ancestors' rules.
- **Indexes** leave out fields not readable by every role (`GetIndexRestrictedFieldNames` in
  `@memberjunction/core`): a field with a `Deny` or `No Access` read rule, no rules at all, or no
  `Allow` read rule for a role that can read the entity. Project results per reader.
- **RunView cache keys** come from `ProviderBase.ComputeRunViewCacheFingerprint` only; never build a
  slot fingerprint by hand, or a path can leave out the user's row-level or field-security segment.

## The source guard

`pnpm run check:guards` flags `.GetAll(`, `.GetDataObject(`, `.GetDataObjectJSON(`, `.To(`,
`JSON.stringify(<entity or rows>)`, `.Fields.map(f => f.Value)` and view results written to an HTTP
response, in MJServer (resolvers, REST, `generic`, agent sessions, realtime, services), the MCP and
A2A servers, `AI/Agents`, and the Actions, Communication, Templates, SearchEngine and
MessagingAdapters packages.
Project the value, or put `// fls-guard: <short reason>` saying why it is safe, for example
`loaded as the caller; width follows its user`, on a comment-only line in the comment block
directly above the flagged line. A marker trailing code does not count.
