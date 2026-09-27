# Bound data access, approval status and calendars

**What this is.** A plan for five additions to MemberJunction core. Each is opt-in: with none of them used, every view, dashboard, query, agent and communication provider behaves exactly as today.

| # | Addition | For |
|---|---|---|
| A14 | Properties on user views | A view with declared inputs, some of which only the server may set |
| A15 | Properties on dashboards, and an interactive component part | One property set once, driving every part of a dashboard |
| A16 | Bound, hidden action parameters for agents | An agent's tool call whose scope the model can't see or change |
| A17 | Locked query parameters, server-set context variables, and an approval status | A query a caller can't re-aim, and a record of which definitions are approved |
| A18 | Calendars in Communication | Creating and syncing events with Outlook and Google Calendar from any record |

**Why.** An app on MemberJunction often needs to hand a view, a dashboard, a query or an action to people and agents with some of its inputs fixed by the server. The first is [BizApps Collaboration](https://github.com/MemberJunction/bizapps-collaboration): a chapter's space shows the *Members* view with `Chapter` set to that chapter, a sponsor's space shows that sponsor's booth leads, and neither the viewer nor the space's agent can change which chapter or sponsor it is. MemberJunction has no way to say that today. Views can't declare inputs, dashboards can't pass context to their parts, every action parameter is described to the model, and any query parameter can be set by whoever calls it.

The item numbers are Collaboration's (its plan's § 6, in [bizapps-collaboration#8](https://github.com/MemberJunction/bizapps-collaboration/pull/8)), so its pull requests and this one cite the same things. Nothing here names Collaboration: each addition is generic.

**Checked against:** MJ `next` at `830c11c` (2026-09-27). Paths are under `packages/`. `E:<line>` is a line of `MJCoreEntities/src/generated/entities/__mj.ts` at that commit. Lines move, so search by name.

**Who does what.** The builder implements it in this pull request, in the order below, with each item's tests. The plan's author reviews it with a numbered punch list per push. A18 is independent of the rest: if it grows, it moves to its own pull request, citing this plan.

## Contents

1. [Order and delivery](#1-order-and-delivery)
2. [A16. Bound, hidden action parameters for agents](#2-a16-bound-hidden-action-parameters-for-agents)
3. [A14. Properties on user views](#3-a14-properties-on-user-views)
4. [A15. Properties on dashboards, and an interactive component part](#4-a15-properties-on-dashboards-and-an-interactive-component-part)
5. [A17. Locked query parameters, server-set context variables, and an approval status](#5-a17-locked-query-parameters-server-set-context-variables-and-an-approval-status)
6. [A18. Calendars in Communication](#6-a18-calendars-in-communication)
7. [Rules for the work](#7-rules-for-the-work)
8. [Design points to settle first](#8-design-points-to-settle-first)

## 1. Order and delivery

1. **A16,** the smallest and the most urgent: it's what stops a model choosing which record an action acts on.
2. **A14,** then **A15**, which builds on A14's property shape.
3. **A17.**
4. **A18,** here or in its own pull request.

Each item lands with its unit tests and, where it touches the database or GraphQL, an integration check in the deterministic tier. A migration takes a `minor` changeset; anything else a `patch`. The design points in [§ 8](#8-design-points-to-settle-first) are settled in a comment before the first migration.

## 2. A16. Bound, hidden action parameters for agents

**Today:**
- `formatActionDetails` (`AI/Agents/src/base-agent.ts:7854`) describes every parameter whose type is Input or Both to the model: its name, whether it's required, its type, description and default.
- `ExecuteSingleAction` (`base-agent.ts:7429`) maps the model's values straight to the action's inputs. It passes `params.context`, which the model can't see, as the action's `Context`, after writing the agent's ID and active skill IDs onto it.
- `MJ: AI Agent Actions` (E:35191) has no column for a value fixed per agent. Loop agents have no way to fix a parameter.
- **Flow agents already do:** `ActionInputMapping` on `MJ: AI Agent Steps` (E:44826) maps static values or payload paths to an action's inputs.
- `ExecuteAgentParams` (`AI/CorePlus/src/agent-types.ts:1048`) already takes `context` and `actionChanges` (`:1605`), which add or remove actions for the root run, every sub-agent, or named ones.

**Add:**
- **`ExecuteAgentParams.boundActionParams`:** `Record<actionID, Record<paramName, value>>`, applied to the run and every sub-agent run, the way `actionChanges` is.
- **A bound parameter:**
  - is left out of the parameter list the model is given for that action;
  - is set in `ExecuteSingleAction` from the binding, overriding any value the model sent for it. An overridden value is logged with the run and step IDs, and never passed on;
  - refuses the action when the parameter is required and its bound value is null or missing.
- **Optionally,** a `BoundParameters` JSON column on `MJ: AI Agent Actions`, for values fixed for one agent, merged under the run's `boundActionParams`. It takes static values in `ActionInputMapping`'s shape, so the two stay one idea.
- **The action execution log** records which parameters were bound, so an audit can tell a bound value from a chosen one.

**Tests:** the model's tool description has no bound parameter; a model-written value is discarded and logged; the action receives the bound value; a sub-agent's call to the same action gets the same binding; a required parameter bound to nothing refuses the action; with no bindings, the prompt and the calls are byte-for-byte today's.

**Accept:** a run with `boundActionParams` for an action's `ChapterID` shows the model no `ChapterID`; a `ChapterID` the model writes is ignored and logged; the action gets the bound value; and a sub-agent's call gets the same binding.

## 3. A14. Properties on user views

**Today:**
- A view holds a filter, a sort, and grid and display state. `RunViewParams` (`MJCore/src/views/runView.ts:125`) adds `ExtraFilter`, `OrderBy` and `UserSearchString`.
- A view's filter can hold one template token, `{%UserView "id"%}`, which `RenderViewWhereClause` expands (`GenericDatabaseProvider/src/GenericDatabaseProvider.ts:2554`). Any other token throws.
- `ExtraFilter`, `OrderBy` and a view's stored filter pass `ValidateUserProvidedSQLClause` (`MJCore/src/generic/databaseProviderBase.ts:1251`), a keyword denylist. Over GraphQL, `assertClientClauseUsesEntityBaseViews` (`MJServer/src/generic/ResolverBase.ts:922`) also parses a client's clause and lets it read only entity base views. Its own comment warns that a subquery against another entity's base view doesn't pick up that entity's row-level security.
- `AssertPredicatesRespectFieldSecurity` (`MJCore/src/generic/providerBase.ts:2717`) refuses a predicate that names a field the user can't read.
- `MJ: User Views` (E:127269) has no column for an input, so a view can't declare one.

**Add:**
- **`Properties` on `MJ: User Views`,** a nullable JSON column, typed through MemberJunction's JSONType wiring:

  ```ts
  export interface UserViewProperty {
      /** Unique within the view. */
      Name: string;
      Type: 'string' | 'number' | 'boolean' | 'date' | 'uuid';
      Description?: string;
      DefaultValue?: string | number | boolean | null;
      IsRequired?: boolean;
      /** False: only server code may set it, and a client value is refused. Default true. */
      AllowOverride?: boolean;
      /** The predicate the value drives. */
      Target: { Field: string; Operator: '=' | '<>' | 'IN' | '>' | '>=' | '<' | '<=' };
  }
  ```

- **`RunViewParams.Properties`:** `Record<string, value>`, the values for this run.
- **In the provider:** each property with a value, or with a non-null default, becomes one predicate on its target field, ANDed with the view's own filter and any `ExtraFilter`.
  - The server builds the predicate from the property's `Target` and the value. The value is never pasted into SQL as text: it's bound as a parameter where the view path takes parameters, and otherwise written as a typed literal after it's checked against the property's type (a UUID parsed, a number checked, a date parsed, a string escaped with `EscapeSQLString`).
  - The predicate passes `ValidateUserProvidedSQLClause`, and its target field passes the same field-security check as any other predicate.
  - A property with `IsRequired` and no value refuses the run.
- **Row-level security** applies on top, unchanged.
- **Over GraphQL,** a client value for a property whose `AllowOverride` is false is refused, with an error naming the property. Server code sets it.
- **The view designer** gets a Properties panel: add, edit and remove properties, with the field and operator chosen from the entity's fields.

**Tests:** the SQL a property produces for each operator and type; a wrong-typed value refused; a required property with no value refused; row-level security still applied; a client value for a locked property refused over GraphQL; a view with no properties runs exactly as today.

**Accept:** a *Members* view with a `Chapter` property that defaults to null returns every member to staff; run with `Chapter = X`, it returns X's members; a value of the wrong type is refused; row-level security still applies on top.

## 4. A15. Properties on dashboards, and an interactive component part

**Today:**
- A dashboard keeps its layout in `UIConfigDetails` on `MJ: Dashboards` (E:80138). Its config (`DashboardConfig`, `Angular/Generic/dashboard-viewer/src/lib/models/dashboard-types.ts:24`) holds a layout and settings, and no parameters.
- The viewer creates each part through the class factory and sets only its panel, part type and edit flag (`dashboard-viewer/dashboard-viewer.component.ts`, `instance.Panel`). It passes no context and no data provider.
- The Query part saves parameter values per user per query, under `QueryViewer_<queryId>_LastParams` (`query-viewer/src/lib/query-data-grid/models/query-grid-types.ts:484`), not per dashboard. The same query on two dashboards shares one saved set.
- The query viewer reads its query from the global `QueryEngine` (`query-viewer.component.ts:230`) and runs it on `Provider ?? Metadata.Provider`. Today a host can reroute a part's queries only by registering its own class under `QueryPanelRenderer`, adding a part type, or replacing the process-wide provider.
- The part types are View, Query, Artifact and WebURL (`metadata/dashboard-part-types/`), so an interactive component reaches a dashboard only through the Artifact part, which hosts it with default utilities and no props.
- The React host (`Angular/Generic/react/src/lib/components/mj-react-component.component.ts`) takes props through `ComponentProps` (`:420`), and data access through a `utilities` input (`:237`) carrying `md`, `rv` and `rq`. A host can already give one component its own `rq`. No MJ host does.

**Add:**
- **`Properties` on the dashboard,** with A14's shape, minus `Target`: a dashboard property feeds its parts rather than a field.
- **A mapping in each part's configuration** from the dashboard's properties to the part's inputs:
  - a View part maps to the view's properties (A14);
  - a Query part maps to the query's parameters. A mapped parameter overrides the user's saved value, is never saved back into it (that set is shared by every dashboard showing the query), and isn't offered for editing;
  - a Component part maps to the component's props.
- **A `Properties` input on the dashboard viewer,** so a host sets the values once.
- **An Interactive Component part type,** first-class: the component's registry name and version, and its props mapping.
- **A host hook for data access** ([§ 8](#8-design-points-to-settle-first), point 1): the viewer accepts an optional runner for queries and hands it to its parts, so an app can route a part's queries through its own server operation. The Component part passes the same runner to the React host as `utilities.rq`.

**Tests:** property values reach each part type through its mapping; an unmapped part is unchanged; a saved Query-part value is overridden by a mapped property and not offered for editing; the component part renders a registered component with mapped props; a dashboard with no properties renders exactly as today.

**Accept:** one chapter dashboard, with its `Chapter` property set once, drives a view part, a query part and a component part, and each shows only that chapter.

## 5. A17. Locked query parameters, server-set context variables, and an approval status

**Today:**
- Saved queries are trusted, admin-authored SQL: row-level security doesn't apply to them (`GenericDatabaseProvider.ts:4178`).
- A query's SQL is a Nunjucks template whose context is only its declared, validated parameters (`QueryProcessor/src/queryParameterProcessor.ts:475`). There's no server-set variable. User tokens (`{{User<Field>}}`) exist only in row-level security filter text (`MJCore/src/generic/securityInfo.ts:550`).
- The caller can set every parameter (`RunQueryParams.Parameters`, `MJCore/src/generic/runQuery.ts:42`). `MJ: Query Parameters` (E:106951) has no mark for the server's, and a parameter's `DefaultValue` is informational, never injected. Unknown parameters are refused.
- Query Permissions are by role (`MJ: Query Permissions`). A query with no permission rows is open to anyone who can read every entity it uses. Once rows exist, a role grant overrides those entity checks, including for the queries it composes (`MJCoreEntities/src/custom/MJQueryEntityExtended.ts:107`).
- `MJ: Queries.Status` ('Approved', 'Expired', 'Pending', 'Rejected', default 'Pending') exists, but a query that isn't Approved only logs a warning when it runs (`GenericDatabaseProvider.ts:3688`); composition requires Reusable and Approved. Queries have no approved-by or approved-at. User views and dashboards have no status. Components have Draft, Published and Deprecated, which is publication, not approval. No entity records query tests. The nearest precedent is `CodeApprovalStatus`, `CodeApprovedByUserID` and `CodeApprovedAt` on `MJ: Actions`.

**Add:**
- **Locked parameters.** A query parameter can be marked as the server's: a client value for it is refused over GraphQL, and server code sets it through `RunQueryParams`. Whether the mark lives on the query's parameter metadata or per call (`RunQueryParams.LockedParameters`) is [§ 8](#8-design-points-to-settle-first)'s point 2; the metadata mark protects every caller, and this plan recommends it.
- **Server-set context variables** in a query's template, such as `{{Context.UserID}}` and `{{Context.UserEmail}}`: a reserved `Context` object in the template's render context, filled from the context user on the server and never from a client. A parameter named `Context` is refused. A query's SQL can then carry its own access predicate. A server operation that runs a query on a user's behalf passes that user as the context.
- **An approval status** on queries, user views, dashboards and interactive components: approved or not, who approved it, when, and the tests it passed. Queries keep their `Status` and gain who and when. [§ 8](#8-design-points-to-settle-first)'s point 3 decides the shape for the rest.

**Tests:** a client value for a locked parameter is refused and logged; server code sets it; a context variable can't be set from a client; a query with no locked parameters and no context variables runs exactly as today; the approval status reads and writes, with its audit.

**Accept:** a query's `ChapterID`, locked, can't be changed over GraphQL; the attempt is refused and logged.

## 6. A18. Calendars in Communication

**Today:**
- `BaseProvider.GetEvents` (`Communication/base-types/src/BaseProvider.ts:1388`) is a communication provider's only calendar method: read-only, and unsupported by default. Only the MS Graph provider implements it (`Communication/providers/MSGraph/src/MSGraphProvider.ts:909`). Nothing in MemberJunction calls it except tests.
- The realtime bridge has its own read-only calendar clients, `GraphCalendarClient` and `GoogleCalendarClient` (`AI/RealtimeBridge/Server/src/calendar-clients.ts:108` and `:233`). `CalendarWatcher` (`calendar-watcher.ts:148`) uses them to poll an agent's invitations and create scheduled agent session bridges.
- MemberJunction has no calendar entities, no calendar view type and no calendar component.

**Add:**
- **A calendar interface on communication providers,** with a capability flag so a provider without it says so: create, update and cancel an event; invite attendees; read RSVPs; and sync changes both ways, through Graph delta queries and Google sync tokens.
- **The MS Graph implementation,** extending what it has, and **a Google Calendar implementation.**
- **`MJ: Calendar Event Links`:** the provider, the calendar account, the external event's ID and series ID, `EntityID` and `RecordID`, the sync token, and when it last synced, so any record can be tied to an event.
- **One implementation:** the realtime bridge's two clients fold into this layer.

**Tests:** each provider's create, update, cancel, invite and RSVP against recorded responses; a delta sync applying a moved time and a changed RSVP; the bridge's invitation polling on the new layer.

**Accept:** an MJ record creates an Outlook event and a Google event with attendees; a time change in either calendar flows back to the record; an RSVP updates the attendee.

## 7. Rules for the work

MemberJunction's own `CLAUDE.md` governs, and these points matter most here:
- **Everything is opt-in,** and every default keeps today's behavior.
- **A migration carries DDL and its CodeGen output only,** in `migrations/v6/`, named `V<YYYYMMDDHHMM>__v6.2.x__<Name>.sql` (the current band), with apply-time `EntityField` sequences. Metadata (JSONType wiring, seed rows, permissions) is JSON under `metadata/`, pushed before CodeGen runs.
- **T-SQL only.** PostgreSQL is converted by the toolchain at release.
- **Strong types:** no `any`, and no `.Get()` or `.Set()` in place of generated properties.
- **Both test tiers pass:** each changed package's unit tests, and the deterministic integration tier.
- **Changesets:** `minor` for a migration, `patch` otherwise.
- **When the work merges,** this plan moves to `plans/complete/`.

## 8. Design points to settle first

1. **Data access from a dashboard's parts and from components.** A host that lets people run only its own server operation for queries needs a seam. The React host has one (`utilities`); the dashboard viewer and the query viewer don't. Say where the hook goes (a runner input, a `Provider` passed down, or both), and whether views need one too; row-level security already covers views.
2. **Where a parameter is locked.** On the query's parameter metadata, so every caller is covered, or per call. The plan recommends metadata, with `RunQueryParams` carrying server-set values.
3. **The approval status's shape.** Columns on each of the four entities, following `MJ: Actions`' `CodeApproval*` set, or one approval entity keyed by entity, record and the version approved. Also: whether server code may ask for a query to be refused unless it's Approved (opt-in), since today it only warns.
4. **View properties and saved filters.** How a property interacts with a view's saved filter state and the grid's own filters in the UI, and whether a property can be shown to the user as a read-only chip. The same question for a Query part: how a mapped parameter looks next to the user's own.
5. **Calendar ownership.** Whose calendar a created event lives in, the acting user's or a service mailbox, is the app's choice; the interface must support both.
