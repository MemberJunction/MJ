# Building Applications on MemberJunction

> **The short version** — MemberJunction is best known as an AI data platform: unify your data, add intelligence, ship faster. But the engine that ingests and reasons over your data is also a **first-class application development platform** for database-driven business apps. You model a schema; MJ generates a complete, type-safe, secured full-stack application around it — typed data access, APIs, UI, business logic, and AI — all in **one language (TypeScript)** with **one object model that runs identically on every tier**. AI isn't bolted on at the end: agents, prompts, and RAG are first-class building blocks that operate directly on the same entities and actions your UI uses, so the apps you build are **AI-native by default**. Once your data is in MJ, you build directly on it. You don't move it somewhere else first.

This is the **developer's hub** for that story. It explains the architecture, the model that makes it work, and links to the authoritative README/guide for every layer so you can go from "my data is in MJ" to "I'm shipping a custom application on MJ."

---

## Table of contents

1. [Who this guide is for](#who-this-guide-is-for)
2. [The one idea that matters most: one language, one object model, every tier](#the-one-idea-that-matters-most-one-language-one-object-model-every-tier)
3. [The architecture, in layers](#the-architecture-in-layers)
4. [The core idea: model the schema, get the application](#the-core-idea-model-the-schema-get-the-application)
5. [The build journey](#the-build-journey)
6. [Layer-by-layer deep dive](#layer-by-layer-deep-dive)
   - [1. Data modeling & schema](#1-data-modeling--schema)
   - [2. Code generation — the engine that ties it together](#2-code-generation--the-engine-that-ties-it-together)
   - [3. The entity framework — typed data access](#3-the-entity-framework--typed-data-access)
   - [4. Write once, run on every tier — the isomorphic core in practice](#4-write-once-run-on-every-tier--the-isomorphic-core-in-practice)
   - [5. The API layer](#5-the-api-layer)
   - [6. Security, permissions & audit](#6-security-permissions--audit)
   - [7. The UI layer — MJExplorer, reusable components & your framework](#7-the-ui-layer--mjexplorer-reusable-components--your-framework-of-choice)
   - [8. Business logic — the Actions framework](#8-business-logic--the-actions-framework)
   - [9. AI — the force multiplier](#9-ai--the-force-multiplier)
   - [10. Application metadata as code](#10-application-metadata-as-code)
   - [11. Deployment](#11-deployment)
7. [Building AI-native applications](#building-ai-native-applications)
8. [How MJ compares to other frameworks](#how-mj-compares-to-other-frameworks)
9. [Building on MJ & joining the community](#building-on-mj--joining-the-community)
10. [Cross-cutting developer guides](#cross-cutting-developer-guides)
11. [A mental model to keep](#a-mental-model-to-keep)

---

## Who this guide is for

You've probably arrived one of two ways:

1. **You came for the data/AI platform.** You pulled data in from other systems — CRM, accounting, a legacy database, spreadsheets — and now you're wondering: *can I actually build applications on top of this, or do I have to export it somewhere else?* You build right here.
2. **You're starting greenfield.** You want a database-driven business application — a membership system, a CRM, a case-management tool, an internal ops console — and you want the data layer, API, security, audit, and UI handled for you so you can focus on what's unique to your domain.

Either way, the rest of this guide shows you the layers MJ gives you and where to learn each one.

---

## The one idea that matters most: one language, one object model, every tier

If you take away nothing else, take this: **MemberJunction lets you write your data and business logic *once*, in TypeScript, and run that *exact same code* on the server, in the browser, in a CLI, and inside background jobs and AI agents.** This is rare, and it is the single biggest reason MJ apps are faster to build and cheaper to maintain than conventionally-architected apps.

### Why this is uncommon — and powerful

A typical database-driven web app forces you to redefine your domain several times, in several languages, across a tier boundary:

| Concern | Conventional stack | MemberJunction |
|---|---|---|
| Schema / migrations | SQL | SQL (migrations) |
| Server data model | ORM models (often a 2nd language/DSL) | **`BaseEntity` subclass (TypeScript)** |
| API contract | GraphQL SDL / OpenAPI / gRPC proto | **Auto-generated from metadata** |
| API serialization | Hand-written DTOs / serializers | **Handled by the provider** |
| Client data model | TS interfaces duplicating the server | **The same `BaseEntity` subclass** |
| Client API calls | fetch/axios/Apollo hooks | **The same `RunView` / `.Save()` calls** |
| Validation | Re-implemented per tier | **One `Validate()` on the entity, runs everywhere** |

Each row in the "conventional" column is a place where your model can drift, where a field rename breaks something silently, and where you write and test the *same logic twice*. MemberJunction collapses the whole column into **one typed object model**.

> Quoting `@memberjunction/core`'s own readme: *"The package uses a **provider model** that allows the same application code to run transparently on different tiers. On the server, a `SQLServerDataProvider` communicates directly with the database. On the client, a `GraphQLDataProvider` routes requests through the GraphQL API. **Your code does not need to know which provider is active.**"*

### How it works: the provider model

`Metadata`, `BaseEntity`, `RunView`, `RunQuery`, and `TransactionGroup` are tier-independent abstractions in [`@memberjunction/core`](../packages/MJCore/readme.md). At application startup, you register **one provider**. That provider is the only thing that knows *how* to reach the data. Everything above it is identical regardless of tier.

```mermaid
flowchart TB
    subgraph Same["Your code — written ONCE, identical on every tier"]
        direction LR
        MD["Metadata"]
        BE["BaseEntity<br/>subclasses"]
        RV["RunView /<br/>RunViews"]
        RQ["RunQuery"]
        TG["TransactionGroup"]
        VAL["Validate()"]
    end

    subgraph Boot["Bootstrap registers ONE provider per process"]
        direction LR
        SP["SQLServerDataProvider"]
        GP["GraphQLDataProvider"]
    end

    DB[("SQL Server / PostgreSQL")]
    API["GraphQL API"]

    Same --> SP
    Same --> GP
    SP -->|"Server, CLI,<br/>jobs, agents"| DB
    GP -->|"Browser /<br/>Angular"| API
    API --> DB

    style Same fill:#2d8659,stroke:#1a5c3a,color:#fff
    style Boot fill:#7c5295,stroke:#563a6b,color:#fff
    style DB fill:#b8762f,stroke:#8a5722,color:#fff
    style API fill:#2d6a9f,stroke:#1a4971,color:#fff
```

The payoff:

- **Share real logic, not just types.** A validation rule, a computed field, a "recalculate totals" method on an entity subclass is written once and is correct on the server *and* in the browser.
- **No DTO/mapping layer.** There is no translation step between "server object" and "client object" — they are the same class.
- **Refactors are safe.** Rename a field via CodeGen and TypeScript flags every call site across all tiers, because there's only one set of types.
- **One mental model for the whole team.** Front-end and back-end developers use the same `GetEntityObject` / `RunView` / `.Save()` vocabulary.

See [§4](#4-write-once-run-on-every-tier--the-isomorphic-core-in-practice) for concrete side-by-side code.

---

## The architecture, in layers

MemberJunction is a layered stack. Each layer depends only on the ones below it, and the **core object model layer is shared by everything above it** on every tier.

```mermaid
flowchart TB
    subgraph L7["⬢ Presentation — MJExplorer (Angular) · custom apps · CLI · MCP clients"]
        direction LR
        UI1["Generated &amp; custom forms"]
        UI2["Dashboards &amp; grids"]
        UI3["Generic component library"]
    end

    subgraph L6["⬢ AI &amp; Automation — agents · prompts · vectors · actions · scheduling · comms"]
        direction LR
        AI1["Agent framework"]
        AI2["Actions (business logic)"]
        AI3["Communication &amp; jobs"]
    end

    subgraph L5["⬢ API — GraphQL (auto-generated) · REST · MCP · A2A"]
        direction LR
        API1["MJServer"]
        API2["API keys &amp; scopes"]
    end

    subgraph L4["⬢ Core Object Model (TypeScript) — SHARED ON EVERY TIER"]
        direction LR
        C1["Metadata"]
        C2["BaseEntity"]
        C3["RunView / RunQuery"]
        C4["TransactionGroup"]
    end

    subgraph L3["⬢ Providers — SQLServerDataProvider (server) · GraphQLDataProvider (client)"]
        direction LR
        P1["Server provider"]
        P2["Client provider"]
    end

    subgraph L2["⬢ Generated Code — entity classes · views · stored procs · resolvers · forms"]
        direction LR
        G1["CodeGen output"]
    end

    subgraph L1["⬢ Data &amp; Metadata — SQL Server / PostgreSQL + MJ metadata catalog"]
        direction LR
        D1["Your schema"]
        D2["Entity / field / permission metadata"]
    end

    L7 --> L6 --> L5 --> L4 --> L3 --> L2 --> L1

    style L7 fill:#2d6a9f,stroke:#1a4971,color:#fff
    style L6 fill:#7c5295,stroke:#563a6b,color:#fff
    style L5 fill:#2d8659,stroke:#1a5c3a,color:#fff
    style L4 fill:#1f9d8f,stroke:#147068,color:#fff
    style L3 fill:#9f6f2d,stroke:#71501f,color:#fff
    style L2 fill:#b8762f,stroke:#8a5722,color:#fff
    style L1 fill:#64748b,stroke:#475569,color:#fff
```

The teal **Core Object Model** layer is the one to internalize: it sits in the middle of the stack and is literally the same code whether the request originates from an Angular component or a server-side agent.

---

## The core idea: model the schema, get the application

MemberJunction is **metadata-driven**. You define (or import) a database schema, register the tables as *entities* in MJ's metadata, and the platform generates and maintains everything downstream — and keeps it in sync as the schema evolves.

```mermaid
flowchart LR
    SCHEMA[("Your DB schema")] --> META["MJ Metadata<br/>(Entities, Fields,<br/>Relationships,<br/>Permissions, Validation)"]
    META -->|CodeGen| OUT

    subgraph OUT["Generated &amp; kept in sync"]
        direction TB
        O1["Typed entity classes (TS)<br/>validation · change tracking"]
        O2["SQL views &amp; stored procs<br/>RLS &amp; audit baked in"]
        O3["GraphQL API + typed client"]
        O4["Angular forms, grids,<br/>dashboard scaffolding"]
        O5["Action subclasses"]
    end

    style SCHEMA fill:#64748b,stroke:#475569,color:#fff
    style META fill:#2d8659,stroke:#1a5c3a,color:#fff
    style OUT fill:#2d6a9f,stroke:#1a4971,color:#fff
```

In practice: **you write the code that's genuinely unique to your business** — custom forms, dashboards, actions, agents — and MJ handles the repetitive, error-prone plumbing every database app needs (CRUD, typed clients, API surface, row-level security, field permissions, audit trails, change tracking). All of it regenerates from metadata whenever the schema changes, so it never drifts.

---

## The build journey

A typical "build an app on MJ" path, with the doc to read at each step:

```mermaid
flowchart LR
    A["1. Model data<br/>migrations"] --> B["2. Run CodeGen<br/>generate the stack"]
    B --> C["3. Work with data<br/>typed entities + RunView"]
    C --> D["4. Expose &amp; consume<br/>GraphQL + typed client"]
    D --> E["5. Build UI<br/>forms · dashboards"]
    E --> F["6. Add business logic<br/>Actions"]
    F --> G["7. Layer in AI<br/>agents · prompts · RAG"]
    G --> H["8. Config as code<br/>MetadataSync"]
    H --> I["9. Deploy<br/>containers · migrations"]

    style A fill:#64748b,stroke:#475569,color:#fff
    style B fill:#b8762f,stroke:#8a5722,color:#fff
    style C fill:#1f9d8f,stroke:#147068,color:#fff
    style D fill:#2d8659,stroke:#1a5c3a,color:#fff
    style E fill:#2d6a9f,stroke:#1a4971,color:#fff
    style F fill:#7c5295,stroke:#563a6b,color:#fff
    style G fill:#7c5295,stroke:#563a6b,color:#fff
    style H fill:#9f6f2d,stroke:#71501f,color:#fff
    style I fill:#64748b,stroke:#475569,color:#fff
```

| Step | What you do | Start here |
|------|-------------|------------|
| 1. **Model your data** | Create/evolve tables via migrations; register them as entities | [migrations/CLAUDE.md](../migrations/CLAUDE.md) · [Organic Keys](../packages/MJCore/docs/organic-keys.md) |
| 2. **Generate the stack** | Run CodeGen to produce entities, views, sprocs, API, forms | [CodeGenLib README](../packages/CodeGenLib/README.md) |
| 3. **Work with data in code** | Use typed `BaseEntity` classes + `RunView` | [MJCore readme](../packages/MJCore/readme.md) · [MJCoreEntities readme](../packages/MJCoreEntities/readme.md) |
| 4. **Expose & consume the API** | GraphQL server + typed client provider | [MJServer README](../packages/MJServer/README.md) · [GraphQLDataProvider README](../packages/GraphQLDataProvider/README.md) |
| 5. **Build the UI** | Explorer shell, generated + custom forms, dashboards | [Angular README](../packages/Angular/README.md) · [Dashboard Best Practices](DASHBOARD_BEST_PRACTICES.md) |
| 6. **Add business logic** | Actions for workflows, validation, integrations | [Actions README](../packages/Actions/README.md) |
| 7. **Layer in AI** | Agents, prompts, RAG over your now-unified data | [AI README](../packages/AI/README.md) · [Agents README](../packages/AI/Agents/README.md) |
| 8. **Manage app metadata as code** | Version your config/seed data declaratively | [MetadataSync README](../packages/MetadataSync/README.md) · [metadata/CLAUDE.md](../metadata/CLAUDE.md) |
| 9. **Deploy** | Containers, migrations, environments | [DEPLOYMENT.md](../DEPLOYMENT.md) |

---

## Layer-by-layer deep dive

### 1. Data modeling & schema

Your application starts with a schema. MJ doesn't hide SQL from you — it embraces it and layers metadata on top.

#### You own the schema — MJ never alters it behind your back

A defining choice in MJ: **the database is the source of truth for your schema, and you (DBA/developer) own all DDL.** MJ performs **no implicit schema changes**. Instead, it **introspects** your database to discover tables, columns, keys, indexes, and relationships, **reads the documentation already in the database** (SQL Server extended properties / Postgres `COMMENT`s), and **keeps its metadata layer in sync** with what's actually there. You're free to use any column types, indexing strategy, schemas, computed columns, or vendor features you like — MJ adapts to your schema rather than dictating it.

Schema changes flow through **explicit, versioned migrations** applied by **[Skyway](https://github.com/MemberJunction/skyway)** — MJ's open-source, **Flyway-compatible** migration engine written in TypeScript. This is what makes MJ's upgrade story **deterministic, verifiable, and robust**, and why it slots cleanly into CI/CD:

- **Deterministic & repeatable.** The *same* immutable, versioned migration files run in dev, staging, and production, in the same order, producing the same result. No "it worked on my environment" schema drift.
- **Verifiable.** Migrations are **checksum-verified** against the recorded history — if a previously-applied migration is altered, Skyway detects it and refuses to proceed, so tampering and accidental drift surface immediately instead of silently corrupting an environment.
- **Atomic.** Skyway's per-run transaction mode wraps all pending migrations in a **single transaction** on databases with transactional DDL (SQL Server and PostgreSQL). A failed upgrade rolls back cleanly — you never end up with a half-applied schema.
- **Reviewable as code.** Because schema changes are DDL files in source control (not side effects of editing metadata in a UI), they go through normal **pull-request review**, diff cleanly, and are gated by the same CI as the rest of your code.
- **In sync automatically.** After a migration runs, **CodeGen** (see §2) introspects the change and regenerates the typed entities, base views, and CRUD procedures to match — so the application layer never drifts from the database.

The loop is: **author DDL in a migration → Skyway applies it atomically → MJ introspects & syncs metadata → CodeGen regenerates the typed stack.** Each step is explicit, versioned, and reproducible — the foundation for a robust CI/CD pipeline.

Two more freedoms worth knowing:

- **UUID primary keys by default, but no fixed key shape.** MJ defaults to `UNIQUEIDENTIFIER` / UUID PKs, yet — because it reads keys from your schema rather than mandating them — supports **any primary-/foreign-key style, including composite and natural keys**. (MJ normalizes UUID casing differences between SQL Server and PostgreSQL for you.)
- **Bring existing data as-is.** Point CodeGen at existing tables and MJ registers them as entities — migrations are how you *evolve* the schema over time, not a precondition for building.

#### Reference material

- **[migrations/CLAUDE.md](../migrations/CLAUDE.md)** — Authoring database migrations: naming conventions, hardcoded UUIDs, and what CodeGen adds automatically (timestamps, FK indexes) so you don't.
- **[Skyway](https://github.com/MemberJunction/skyway)** — The open-source, Flyway-compatible TypeScript migration engine that applies your migrations atomically and verifiably.
- **[Organic Keys](../packages/MJCore/docs/organic-keys.md)** — Working with natural/composite keys, not just surrogate IDs.
- **[ISA Relationships](../packages/MJCore/docs/isa-relationships.md)** — Modeling inheritance/subtyping across entities.
- **[Virtual Entities](../packages/MJCore/docs/virtual-entities.md)** — Surface a view or external source as a first-class entity without a physical table.
- **[Soft Deletes Guide](SOFT_DELETES_GUIDE.md)** — Opt into `DeleteType='Soft'` and get filtered views + soft-delete stored procedures managed for you.
- **[Full-Text Search Guide](../packages/MJCore/docs/FULL_TEXT_SEARCH_GUIDE.md)** — Native SQL full-text search wired into entities.

### 2. Code generation — the engine that ties it together

CodeGen turns metadata into a working full-stack app and keeps everything synchronized as your schema evolves. One schema change fans out into every artifact your app needs:

```mermaid
flowchart TB
    CG{{"mj codegen"}}
    META[("MJ Metadata")] --> CG
    CG --> E1["entity_subclasses.ts<br/>typed classes + Zod schemas"]
    CG --> E2["SQL views<br/>(joins, computed fields)"]
    CG --> E3["spCreate / spUpdate / spDelete<br/>+ permissions"]
    CG --> E4["GraphQL resolvers"]
    CG --> E5["Angular entity forms"]
    CG --> E6["Action subclasses"]

    style CG fill:#b8762f,stroke:#8a5722,color:#fff
    style META fill:#2d8659,stroke:#1a5c3a,color:#fff
```

- **[CodeGenLib README](../packages/CodeGenLib/README.md)** — What CodeGen produces and how to run it.
- **[Multi-Database Workflow](../packages/CodeGenLib/MULTI_DATABASE_WORKFLOW.md)** — Running CodeGen across multiple database targets/platforms.
- **Never hand-edit generated files** — regenerate instead (see the CodeGen rules in the root [CLAUDE.md](../CLAUDE.md)). This is what guarantees the layers never drift apart.

### 3. The entity framework — typed data access

This is how you read and write data in code, with full type safety, validation, dirty-tracking, and automatic audit. Three lines load, modify, and save any record — validated and audited:

```typescript
import { Metadata } from '@memberjunction/core';
import { CustomerEntity } from 'mj_generatedentities';

const md = new Metadata();
const customer = await md.GetEntityObject<CustomerEntity>('Customers');
await customer.Load(customerId);
customer.Status = 'Active';        // strongly typed — IntelliSense + compile-time checks
const ok = await customer.Save();  // runs validation, writes audit trail, fires downstream events
```

Loading collections uses `RunView` with a generic for full typing:

```typescript
import { RunView } from '@memberjunction/core';

const rv = new RunView();
const result = await rv.RunView<CustomerEntity>({
  EntityName: 'Customers',
  ExtraFilter: `Status = 'Active'`,
  OrderBy: 'AnnualRevenue DESC',
  ResultType: 'entity_object'
});
if (result.Success) {
  for (const c of result.Results) { /* fully-typed CustomerEntity */ }
}
```

Read these before going deep:

- **[MJCore readme](../packages/MJCore/readme.md)** — The metadata engine, `Metadata`, `BaseEntity`, `RunView`/`RunViews`, providers, `TransactionGroup`, and the core utilities every tier uses.
- **[MJCoreEntities readme](../packages/MJCoreEntities/readme.md)** — The generated entity subclasses for MJ's own metadata schema, and the pattern your app's entities follow.
- **[BaseEntity Server-Side Patterns](BASE_ENTITY_SERVER_PATTERNS.md)** — Persisted embeddings, cross-record invariants via `ValidateAsync`, FK cleanup before delete.
- **[RunQuery Pagination](../packages/MJCore/docs/runquery-pagination.md)** & **[Keyset Pagination Guide](KEYSET_PAGINATION_GUIDE.md)** — Efficient paging for grids and bulk jobs.
- **[Caching & Real-Time Sync Guide](CACHING_AND_PUBSUB_GUIDE.md)** — The multi-tier cache, RunView cache behavior, and event-driven invalidation that keeps your UI live.

### 4. Write once, run on every tier — the isomorphic core in practice

This section makes [the headline idea](#the-one-idea-that-matters-most-one-language-one-object-model-every-tier) concrete. The code below is **the same** whether it runs in a Node.js server, an Angular component, a CLI command, or an AI agent. The only difference is which provider was registered at bootstrap.

**Server-side** (a resolver, action, or job — note `contextUser` for multi-user isolation):

```typescript
const rv = new RunView();
const result = await rv.RunView<InvoiceEntity>(
  { EntityName: 'Invoices', ExtraFilter: `Status='Open'`, ResultType: 'entity_object' },
  contextUser   // server passes the request's user; loaded entities carry it
);
for (const inv of result.Results) {
  inv.Status = 'Overdue';
  await inv.Save();   // uses the entity's established user context
}
```

**Client-side** (an Angular component — same classes, same calls, no DTOs, no fetch):

```typescript
const rv = new RunView();
const result = await rv.RunView<InvoiceEntity>(
  { EntityName: 'Invoices', ExtraFilter: `Status='Open'`, ResultType: 'entity_object' }
);  // browser context user is implicit
for (const inv of result.Results) {
  inv.Status = 'Overdue';
  await inv.Save();
}
```

Same `InvoiceEntity` class. Same `RunView`. Same `.Save()` with its validation, dirty-tracking, and audit. The server hits the database directly through `SQLServerDataProvider`; the browser routes through `GraphQLDataProvider` → the GraphQL API → the database. **You wrote and tested the logic once.**

Where this pays off most:

- **Domain methods on entity subclasses.** Put `RecalculateTotals()` or a `Validate()` rule on your `InvoiceEntity` subclass and it's enforced identically on both tiers — no client/server skew.
- **Background agents and the UI share logic.** An AI agent that processes invoices and the screen a human uses to process them run the *same* code path.
- **Migrating code between tiers is free.** Logic that started client-side can move to a server action with zero rewrite.

Provider-tier docs:

- **[GraphQLDataProvider README](../packages/GraphQLDataProvider/README.md)** — The typed client provider; the browser half of the model.
- **[SQLServerDataProvider README](../packages/SQLServerDataProvider/README.md)** — The server provider that executes against the database directly.

> **One caution for multi-provider scenarios:** in code that may run under a non-default provider (a client talking to multiple MJ servers, or per-request server contexts), use the provider you were handed (`this`, an event's `provider`, or a passed parameter) rather than reaching for the global `new Metadata()`. See the "Don't reach for the global Metadata provider" rules in the root [CLAUDE.md](../CLAUDE.md).

### 5. The API layer

Every entity is automatically exposed through a secured, typed API — no resolver code to write.

```mermaid
flowchart LR
    subgraph Clients
        NG["Angular / browser"]
        EX["External systems"]
        MC["MCP / A2A clients"]
    end
    GQL["GraphQL API<br/>(MJServer)"]
    AUTH["Auth: Auth0 / Azure AD / Okta<br/>+ API keys &amp; scopes"]
    PROV["SQLServerDataProvider"]
    DB[("Database")]

    NG --> GQL
    EX --> GQL
    MC --> GQL
    GQL --> AUTH --> PROV --> DB

    style GQL fill:#2d8659,stroke:#1a5c3a,color:#fff
    style AUTH fill:#7c5295,stroke:#563a6b,color:#fff
    style PROV fill:#9f6f2d,stroke:#71501f,color:#fff
    style DB fill:#64748b,stroke:#475569,color:#fff
```

- **[MJServer README](../packages/MJServer/README.md)** — The GraphQL API gateway: schema generation, authentication, query-depth limiting, scheduling hooks.
- **[GraphQLDataProvider README](../packages/GraphQLDataProvider/README.md)** — The typed client so the *same* `BaseEntity` / `RunView` code runs in the browser against the API.
- **[APIKeys README](../packages/APIKeys/README.md)** — Programmatic access with hierarchical scopes for service-to-service and integration use cases.

### 6. Security, permissions & audit

Security isn't an add-on you wire up per screen — it's generated into the data layer and enforced everywhere the object model runs.

- **Row-level security & field permissions** — defined in metadata, baked into generated views/stored procedures, enforced at the data layer regardless of tier.
- **Audit trail / Record Changes** — every `BaseEntity.Save()` and `Delete()` is tracked automatically. You get built-in version history without writing any of it. See *Entity Version Control* in the root [CLAUDE.md](../CLAUDE.md).
- **Authentication** — Auth0, Azure AD (MSAL), and Okta supported out of the box via [auth-services](../packages/Angular/Explorer/auth-services/README.md) on the client and [MJServer](../packages/MJServer/README.md) on the server.
- **API authorization** — [APIKeys README](../packages/APIKeys/README.md) for scoped, key-based access.
- **Field-level encryption** — [Encryption README](../packages/Encryption/README.md) for AES-256 encryption of sensitive columns.

### 7. The UI layer — MJExplorer, reusable components & your framework of choice

MJ ships **MJExplorer** — a complete Angular application — as the **default tool for exploring data, chat, dashboards, and administration**. But "the default UI is Angular" doesn't mean you're locked into Angular:

- **Most of Explorer is generic, reusable Angular.** The large majority of what's in Explorer is a library of **generic Angular components** (grids, viewers, dialogs, chat, filter builders, dashboards, and more) designed to be used in **any Angular application** — Explorer is largely a curated assembly of these reusable pieces, not a monolith. Drop them into your own Angular app.
- **A React bridge** lets teams build their UI in **React** while still using MJ component capabilities — see the [React runtime](../packages/React/README.md).
- **The TypeScript object model is frontend-agnostic.** `Metadata`, `BaseEntity`, `RunView`, and the GraphQL data provider are plain TypeScript with **no UI-framework dependency**, so they work in **any TS-enabled environment** — Vue, Next.js, Svelte, a Node service, or a CLI. You consume your data and business logic identically regardless of frontend.

So the UI story is: a great default app (Explorer) + reusable Angular components + a React bridge + a framework-agnostic TypeScript core. Because every surface speaks the same object model, components bind directly to typed entities.

- **[Angular README](../packages/Angular/README.md)** — Overview of the 60+ Angular packages: the Explorer app, the generic component library, bootstrap.
- **[Generic Angular component library](../packages/Angular/Generic/README.md)** — Reusable components usable in any Angular app (grids, viewers, dialogs, chat, filter builder, dashboards, and more).
- **[React runtime](../packages/React/README.md)** — The React bridge for building MJ UIs in React.
- **[Angular CLAUDE.md](../packages/Angular/CLAUDE.md)** — Conventions: standalone vs NgModule, change detection, custom forms, naming, the MJ UI components.
- **[Explorer README](../packages/Angular/Explorer/README.md)** — The Explorer application: shell, routing, generated entity forms, custom forms, lists, dashboards.
- **[MJExplorer README](../packages/MJExplorer/README.md)** — The runnable Explorer app itself.
- **[Dashboard Best Practices](DASHBOARD_BEST_PRACTICES.md)** — Building dashboards the MJ way: page chrome, state management, engine classes, permissions.
- **[Navigation and Routing Guide](NAVIGATION_AND_ROUTING_GUIDE.md)** — URL state, deep links, sub-navigation.
- **[Lazy Loading Guide](LAZY_LOADING_GUIDE.md)** — Code-split your dashboards/features for fast startup.
- **[Theming](THEMING.md)** & **[App Color Architecture](APP_COLOR_ARCHITECTURE.md)** — Design tokens, dark mode, white-labeling. No hardcoded colors.

### 8. Business logic — the Actions framework

Actions are MJ's metadata-driven unit of business logic: reusable, discoverable, and invocable by UI, workflows, schedules, agents, and external systems. They're the seam where your domain logic becomes available to both humans and AI.

```mermaid
flowchart LR
    subgraph Callers
        U["UI buttons"]
        S["Scheduled jobs"]
        AG["AI agents"]
        EXT["External systems"]
    end
    ACT["Action<br/>(metadata-defined)"]
    LOGIC["Your TypeScript<br/>(uses BaseEntity, RunView,<br/>service classes directly)"]

    U --> ACT
    S --> ACT
    AG --> ACT
    EXT --> ACT
    ACT --> LOGIC

    style ACT fill:#7c5295,stroke:#563a6b,color:#fff
    style LOGIC fill:#1f9d8f,stroke:#147068,color:#fff
```

- **[Actions README](../packages/Actions/README.md)** — The framework, core actions, and the BizApps integration actions (CRM, Accounting, LMS, Social, Form Builders).
- **[Actions CLAUDE.md](../packages/Actions/CLAUDE.md)** — Authoring patterns, parameter validation, error handling, and **when to use an Action vs. a direct class call** (a critical design boundary — Actions are for integration edges, not internal code-to-code calls).
- **[Scheduling README](../packages/Scheduling/README.md)** — Run actions on cron schedules with distributed locking.
- **[Communication README](../packages/Communication/README.md)** — Multi-channel email/SMS (SendGrid, Gmail, MS Graph, Twilio) and entity-level messaging.
- **[Templates README](../packages/Templates/README.md)** — Nunjucks templating with optional AI-generated content for documents, emails, and more.

### 9. AI — the force multiplier

This is where the "AI data platform" and "app dev platform" stories converge: because your data is unified in MJ entities, AI features have a clean, governed substrate to reason over — and agents invoke the very same Actions and entities your UI does.

- **[AI README](../packages/AI/README.md)** — The full AI stack: provider abstraction (15+ providers), engine, prompts, vectors, agents.
- **[Agents README](../packages/AI/Agents/README.md)** — Build autonomous, multi-step agents with sub-agent delegation that operate on your entities and actions.
- **[Prompts README](../packages/AI/Prompts/README.md)** — Hierarchical prompt templates, model selection, execution tracking.
- **[Search Scopes & RAG+ Guide](SEARCH_SCOPES_AND_RAG_GUIDE.md)** — Retrieval-augmented generation over your data.
- **[Content Autotagging](CONTENT_AUTOTAGGING_GUIDE.md)** & **[Taxonomy & Tagging](TAXONOMY_TAGGING_GUIDE.md)** — Automatically classify and organize records.

### 10. Application metadata as code

Beyond schema, your *application configuration* — apps, navigation, seed/reference data, agent and action definitions — is itself metadata you can version, diff, and deploy declaratively.

- **[MetadataSync README](../packages/MetadataSync/README.md)** — Push/pull MJ metadata records as files; treat config as code.
- **[metadata/CLAUDE.md](../metadata/CLAUDE.md)** — Authoring metadata files: `@lookup` / `@file` / `@parent` references, seeding lookup tables, defining applications and nav.
- **[MJCLI README](../packages/MJCLI/README.md)** — The command line for codegen, metadata sync, and platform operations.

### 11. Deployment

- **[DEPLOYMENT.md](../DEPLOYMENT.md)** — Containerized deployment, environment configuration.
- **[docker/CLAUDE.md](../docker/CLAUDE.md)** — MJAPI container and workbench configurations.
- **[UPDATES.md](../UPDATES.md)** & **[v5.0 Upgrade Guide](../UPGRADE-v5.0.md)** — Promoting changes across dev/stage/prod and upgrading MJ versions.

---

## Building AI-native applications

"AI-native" doesn't mean "has a chatbot in the corner." In MemberJunction it means AI is woven into the fabric of the application: the *same* entities, actions, and metadata that power your screens are the things your AI agents read, reason over, and act on. There's no separate "AI integration layer" to build and keep in sync — because there's no second model of your domain to integrate with.

### Why MJ apps are AI-native by construction

Everything an AI feature needs is already first-class in the platform:

- **A governed, unified data substrate.** Your data is already modeled as entities with relationships, permissions, and descriptions. That metadata is exactly what an LLM needs to query and manipulate data safely — and what powers RAG without a bespoke pipeline.
- **Actions as a tool surface.** The [Actions framework](#8-business-logic--the-actions-framework) is metadata-driven and discoverable, which is precisely the shape an agent needs to call your business logic. The action a user triggers from a button is the same action an agent invokes as a tool.
- **The shared object model.** An agent running server-side uses the same `BaseEntity` / `RunView` / `.Save()` code your UI uses ([§4](#4-write-once-run-on-every-tier--the-isomorphic-core-in-practice)). Human and agent paths can't drift, because they're literally the same code.
- **Provider independence.** [15+ AI providers](../packages/AI/README.md) sit behind one abstraction, so you choose models per task without rewrites.

### The AI-native loop

```mermaid
flowchart LR
    subgraph App["Your AI-native application"]
        direction TB
        USER["User"]
        AGENT["AI Agent<br/>(plan · decide · act)"]
        PROMPT["Prompts<br/>(hierarchical templates)"]
        RAG["RAG / Vector search<br/>over your entities"]
    end

    subgraph Shared["Shared domain — same model for humans &amp; AI"]
        direction TB
        ENT["Entities<br/>(BaseEntity)"]
        ACT["Actions<br/>(business logic / tools)"]
        DATA[("Your unified data")]
    end

    USER <--> AGENT
    AGENT --> PROMPT
    AGENT --> RAG
    AGENT -->|"invokes as tools"| ACT
    RAG --> ENT
    ACT --> ENT
    ENT --> DATA

    style App fill:#7c5295,stroke:#563a6b,color:#fff
    style Shared fill:#1f9d8f,stroke:#147068,color:#fff
    style DATA fill:#64748b,stroke:#475569,color:#fff
```

### Patterns for AI-native features

- **Agentic workflows over your data** — multi-step agents that read entities, call actions, and write results back, with sub-agent delegation. See [Agents README](../packages/AI/Agents/README.md).
- **RAG grounded in your entities** — semantic search and retrieval scoped to the records a user is allowed to see. See [Search Scopes & RAG+ Guide](SEARCH_SCOPES_AND_RAG_GUIDE.md).
- **AI-assisted content** — generate documents, emails, and summaries from entity data via the [Templates engine](../packages/Templates/README.md) and [Prompts](../packages/AI/Prompts/README.md).
- **Automatic classification & enrichment** — autotagging and taxonomy assignment as records arrive. See [Content Autotagging](CONTENT_AUTOTAGGING_GUIDE.md) and [Taxonomy & Tagging](TAXONOMY_TAGGING_GUIDE.md).
- **In-app AI surfaces** — embed chat, agent test harnesses, and conversation UIs from the Angular generic component library (`@memberjunction/ng-conversations`, `@memberjunction/ng-ai-test-harness`).

The throughline: because AI shares your app's object model and action surface, **adding intelligence is additive, not architectural**. You don't re-platform to become AI-native — you already are.

---

## How MJ compares to other frameworks

If you're weighing MemberJunction against the stacks you already know — Next.js/Vercel, Supabase, Ruby on Rails, Django, or a hand-rolled Node + ORM + SPA — see the companion **[Framework Comparison Guide](FRAMEWORK_COMPARISON.md)**. It's an objective, where-each-shines breakdown: what MJ gives you out of the box (typed isomorphic object model, generated API/UI/security/audit, AI-native substrate), where the others are a better fit, and how to think about the trade-offs.

---

## Building on MJ & joining the community

MemberJunction is open source (ISC), and there are two complementary ways to engage with it — building *on* the platform, and helping shape the platform itself.

### Build your application on MJ

You're encouraged to build on MJ, whether your app is **commercial or open source**. The platform gives you the data layer, API, security, UI, Actions, and AI; you bring the domain. Several **open-source apps in the MemberJunction org** show this in practice and are worth studying as references (and reusing):

- **[BizApps Common](https://github.com/MemberJunction/bizapps-common)** — a production-ready, schema-complete, fully-typed set of **foundational business entities** (people, organizations, addresses, relationships) packaged as an MJ Open App, so applications share these core entities instead of reinventing them.
- **[BizApps Tasks](https://github.com/MemberJunction/bizapps-tasks)** — a complete, reusable **task-management system** as an MJ Open App: multi-person assignment, sub-task hierarchies, dependency tracking, and templating that any MJ app can integrate without building its own.
- **[Committees](https://github.com/MemberJunction/committees)** — a **governance platform** built on MJ that unifies committee structure, membership, meetings, motions and voting, action tracking, and document linking.

These are real, working examples of the patterns in this guide — clone them, read how they're structured, and build on or alongside them.

### Help shape the platform

If you want to extend the framework itself, the best first step isn't to fork in isolation — it's to **plug into the community**, where your ideas can land in the platform and benefit everyone:

- **Join the community and get active in [Discussions](https://github.com/MemberJunction/MJ/discussions)** — ask questions, share what you're building, and float ideas early.
- **File [Issues](https://github.com/MemberJunction/MJ/issues)** for bugs and feature requests.
- **Raise pull requests** with fixes, new features, ideas, and plugins — see [`CONTRIBUTING.md`](../CONTRIBUTING.md) for setup, coding standards, and the PR process.

And of course, because MJ is open source, you can always **read, fork, and extend** the platform directly. But contributing back through the community means your extensions are maintained with the project rather than diverging from it.

---

## Cross-cutting developer guides

These apply no matter which layer you're working in. The **[guides/ index](README.md)** is the full list; the essentials:

- **[UUID Comparison Guide](UUID_COMPARISON_GUIDE.md)** — Always use `UUIDsEqual()`; SQL Server and PostgreSQL case UUIDs differently.
- **[Caching & Real-Time Synchronization Guide](CACHING_AND_PUBSUB_GUIDE.md)** — Server cache + reactive `BaseEngine` patterns for live UIs.
- **[BaseEntity Server-Side Patterns](BASE_ENTITY_SERVER_PATTERNS.md)** — The right way to extend entities on the server.
- The foundational **[CLAUDE.md](../CLAUDE.md)** at the repo root — coding standards, type-safety rules, naming conventions, and the architectural guardrails that keep an MJ app maintainable.

---

## A mental model to keep

> **MJ as a data platform** ingests and unifies your data and makes it intelligent.
> **MJ as an app platform** lets you build the applications your business runs on, directly on that unified data — in one language, with one object model, on every tier — without rebuilding the data layer, API, security, audit, or UI from scratch every time.

They're the same platform. The data you brought in is the foundation; everything in this guide is what you build on top of it — and the fact that you build it *once* and run it *everywhere* is what makes MJ fast.

For the bird's-eye view of all 175 packages, see the **[packages/ directory overview](../packages/README.md)** and the package directory in the root **[README](../README.md)**.
