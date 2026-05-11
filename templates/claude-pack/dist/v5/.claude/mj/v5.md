# MemberJunction v5 — Version-Specific Notes

This file ships only with the v5 pack. When you upgrade to v6, `mj update:claude`
will replace it with the v6 overlay. Anything here is **specific to MJ major
version 5** — entity names that exist today, footguns that have been observed
in v5, and the location of v5 migrations.

For cross-version guidance (the patterns that work on every MJ major), see
`core/*.md`. This overlay adds v5-specific facts on top.

## Migrations folder

In v5, all migrations live under:

```
migrations/v5/
```

If you're authoring a new SQL migration, that's where the file goes. The
filename convention is `V<YYYYMMDDHHMM>__v[VERSION].x_<DESCRIPTION>.sql`.
See `core/07-migrations-basics.md` for the full filename rules and per-column
gotchas (hardcoded UUIDs, the `${flyway:defaultSchema}` placeholder, etc.).

## Entities with the `MJ: ` prefix in v5

Almost every entity added in the v5 line uses an `MJ: ` prefix. The full
list lives in your generated `entity_subclasses.ts`, but the ones you'll hit
most often:

- `MJ: AI Agent Runs`, `MJ: AI Agent Run Steps`, `MJ: AI Agent Prompts`
- `MJ: AI Prompt Runs`, `MJ: AI Prompt Models`
- `MJ: AI Configurations`, `MJ: AI Configuration Params`
- `MJ: AI Vendors`, `MJ: AI Vendor Types`, `MJ: AI Model Vendors`
- `MJ: Conversation Artifacts`, `MJ: Conversation Artifact Versions`
- `MJ: Artifact Types`, `MJ: Conversation Artifact Permissions`
- `MJ: Dashboard User Preferences`, `MJ: Dashboard User States`
- `MJ: Report Versions`, `MJ: Report User States`
- `MJ: Record Changes` (the audit log every entity writes to by default)

Older entities — `Users`, `Roles`, `User Views`, `AI Models`, `AI Prompts`,
`AI Agents`, `Entities`, `Entity Fields` — do **not** carry the prefix.

## v5 footguns (running list)

This list is short on purpose — only documented gotchas land here. Each entry
gets a one-liner and a pointer to the longer doc.

- **Don't seed lookup tables with SQL `INSERT`.** Use mj-sync metadata files
  under `metadata/` instead. See `core/16-metadata-files.md`.
- **Browser cache when switching SQL Server ↔ PostgreSQL on the same port.**
  GraphQLDataProvider caches metadata client-side; SQL Server returns UUIDs
  uppercase and PostgreSQL returns them lowercase, so stale cache causes
  silent mismatches.

## AI subsystem snapshot (v5)

The AI Agent + AI Prompt + AI Configuration entities form the runtime
configuration surface for everything AI-related in v5:

- **`AI Models`** — model definitions (claude-opus-4-7, gpt-4o, …).
- **`MJ: AI Vendors`** — providers (Anthropic, OpenAI, Groq, …).
- **`MJ: AI Model Vendors`** — which vendors can serve which model, with token limits.
- **`MJ: AI Prompts`** — reusable prompt templates with parameters.
- **`MJ: AI Agents`** — composed agents with prompts, actions, and types.
- **`MJ: AI Agent Runs`** / **`MJ: AI Prompt Runs`** — execution records.

If you're wiring up a new model, the canonical flow is: add the `AI Model`
record, add an `MJ: AI Model Vendor` linking it to the vendor that can run
it, then reference the model by ID from prompts/agents.

## What lives in `core/` (cross-version, not here)

Topics you might expect in this overlay but that are actually in `core/`
because they apply to every MJ major:

- BaseEntity patterns and the typed-property rule → `core/02-entity-essentials.md`
- RunView / RunViews / ResultType → `core/03-runview-patterns.md`
- Migration filename rules and `${flyway:defaultSchema}` → `core/07-migrations-basics.md`
- Angular form extension pattern → `core/10-angular-essentials.md`

When v6 ships, this v5 overlay stops being authoritative; until then it
captures the things that would mislead you if stale.
