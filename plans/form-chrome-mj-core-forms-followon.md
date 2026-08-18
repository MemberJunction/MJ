# Follow-on: MJ core entity forms (not this PR)

After the OpenApp chrome PRs. Do **not** convert everything.

## Keep custom

These forms are product surfaces, not generated grids with a coat of paint.

| Entity | Why it stays custom |
|---|---|
| **Entities** | Metadata workbench. Field list, relationships, CodeGen knobs, JSONType — a generated form would hide the job. |
| **AI Agents** | Prompt / action / sub-agent graph. Already `*Extended`. |
| **AI Prompts** | Template + model binding editor. |
| **Applications** | Nav items, application entities, default app chrome. |
| **Dashboards** | Layout designer, not a record form. |
| **Queries** | SQL / param editor. |
| **Actions** | Param + category + code surface. |
| **Users / Roles / Permissions** | Security UX; generated related-grids of grants would be hostile. |
| **Conversations / Agent Runs** | Timeline / observability, not a CRUD accordion. |

## Generated + L1 inclusion (do these)

Hubs that CodeGen already emits, currently an ER dump.

| Entity | Suggested Primary | More | None |
|---|---|---|---|
| **Users** | User Roles | User Record Changes | Created-by everywhere (agents, prompts, lists…) |
| **Roles** | Role Users, Role Permissions | — | Inverse “used by” dumps |
| **Lists** | List Details | — | Share / notification satellites |
| **Workspaces / Views** | View columns / filters if they exist as ERs | User view state | — |
| **Content Sources** | Content Items | Crawler settings (or contribution) | Run logs |
| **Content Items** | — | Tags / links | Run details |
| **Communication Providers / Logs** | Provider params | Logs | — |
| **File Storage Providers** | — | Files | — |
| **Scheduled Jobs** | Runs | — | Step dumps |
| **Record Changes** | — | keep-all or accordion | Do not hang RC on every parent as Primary (already More via System Metadata) |
| **Entity Fields** (when opened as a record) | Entity Field Values | — | Other fields of the same entity |
| **Entity Relationships** (as a record) | — | — | Keep tiny; accordion |

## Layout defaults

- Leave most `__mj` entities on `Layout: auto`. They flip to left-nav only when first-class count ≥ 8.
- Punch `Layout: left-nav` only on **Users**, **Roles**, **Lists**, **Content Sources**.
- Punch `RelatedRolePolicy: keep-all-primary` on working singletons (a single Scheduled Job, a single Entity Field).

## How to ship

One metadata PR in MJ: `metadata/entity-relationships/.form-chrome-core.json` keyed by `@lookup` on `MJ: Entity Relationships`. No CodeGen HTML edits. Same inclusion model as the OpenApps.

## Explicitly skip

- Generated forms that are already a single Details panel with 0–2 related grids (most lookup tables).
- Anything whose custom form is the Explorer feature (dashboards, conversations, agent studio).
