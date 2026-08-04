# Getting help

When this pack doesn't answer your question, here's where to look next.

## In-depth guides in the MJ repo

The pack files in `core/` are summaries. For the deep dives — the
multi-page treatments with edge cases, internal architecture, and
historical context — see the `guides/` folder in the MJ source repo.
The ones most likely to help integrators:

- **`guides/UUID_COMPARISON_GUIDE.md`** — comparing UUIDs across SQL Server
  (uppercase) and PostgreSQL (lowercase). Always use `UUIDsEqual()`, never
  `===`. Critical if you're touching code that compares entity IDs.
  https://github.com/MemberJunction/MJ/blob/main/guides/UUID_COMPARISON_GUIDE.md

- **`guides/DASHBOARD_BEST_PRACTICES.md`** — building MJ dashboards.
  Architecture, state management with getter/setters, engine class
  patterns (no Angular services for data), user preferences, local
  caching, layout patterns, permission checking.
  https://github.com/MemberJunction/MJ/blob/main/guides/DASHBOARD_BEST_PRACTICES.md

- **`guides/LAZY_LOADING_GUIDE.md`** — MJExplorer's code-split lazy loading.
  Adding dashboard components, making a package lazy-loadable, the
  auto-generated lazy config.
  https://github.com/MemberJunction/MJ/blob/main/guides/LAZY_LOADING_GUIDE.md

- **`guides/BASE_ENTITY_SERVER_PATTERNS.md`** — server-side entity
  subclasses (the `MJCoreEntitiesServer` package). Persisted-embedding
  pattern, cross-record invariants via `ValidateAsync` (not DB triggers),
  FK cleanup before delete. Read this before writing a server-side
  entity subclass.
  https://github.com/MemberJunction/MJ/blob/main/guides/BASE_ENTITY_SERVER_PATTERNS.md

- **`guides/CACHING_AND_PUBSUB_GUIDE.md`** — the full caching architecture
  beyond the summary in `15-performance-and-caching.md`. Multi-server
  invalidation, BaseEntity event-driven cache sync, exact invalidation
  vs replacement semantics.
  https://github.com/MemberJunction/MJ/blob/main/guides/CACHING_AND_PUBSUB_GUIDE.md

The full list is at https://github.com/MemberJunction/MJ/tree/main/guides.

## Documentation site

For end-user / installer-level documentation:

- **https://docs.memberjunction.org** — official MJ docs

## API + entity reference

The CodeGen-emitted entity classes are the source of truth for "what
fields does entity X have":

- **`packages/MJCoreEntities/src/generated/entity_subclasses.ts`** (MJ source)
- Or in your installed project: `node_modules/@memberjunction/core-entities/dist/generated/entity_subclasses.d.ts`

Search for the entity name in those files; the `@RegisterClass`
decorator's second argument is the canonical entity name string.

## Filing issues / asking questions

- **GitHub issues** — https://github.com/MemberJunction/MJ/issues
- **GitHub discussions** — https://github.com/MemberJunction/MJ/discussions

When filing a bug, include:

- MJ version (`mj --version`)
- Node version (`node --version`)
- The exact command or code path that failed
- The full error message (including stack)
- Whether it reproduces on a fresh install

## The pack itself

You're reading the MJ Claude Pack — a curated bundle of MJ-specific
context for Claude Code. The pack source:

- **https://github.com/MemberJunction/MJ/tree/main/templates/claude-pack**

To refresh your locally-installed pack:

```bash
mj update:claude            # apply the latest pack
mj update:claude --check    # see if an update is available
```

The full implementation plan for the pack lives at:

- **https://github.com/MemberJunction/MJ/blob/main/plans/claude-install-pack.md**

## Internal Claude Code references

- Claude Code documentation: https://docs.claude.com/claude-code
- Claude Code GitHub: https://github.com/anthropics/claude-code
