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

**Checked against:** MJ `next` at `830c11c` (2026-09-27). `E:<line>` is a line of `packages/MJCoreEntities/src/generated/entities/__mj.ts` at that commit; lines move, so search by name.

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
- Every input parameter of an agent's actions is described to the model when its tools are built (`AI/Agents/src/base-agent.ts`, the action-description builder).
- `ExecuteSingleAction` passes the model's values straight through to the action, and passes `params.context`, which the model can't see, alongside them.
- `MJ: AI Agent Actions` has no column for a value fixed per agent.
- `ExecuteAgentParams` (`AI/CorePlus/src/agent-types.ts`) already takes `actionChanges`, which add or remove actions for a run and its sub-agents, and `context`.

**Add:**
- **`ExecuteAgentParams.boundActionParams`:** `Record<actionID, Record<paramName, value>>`, applied to the run and every sub-agent run, the way `actionChanges` is.
- **A bound parameter:**
  - is left out of the parameter list the model is given for that action;
  - is set in `ExecuteSingleAction` from the binding, overriding any value the model sent for it. An overridden value is logged with the run and step IDs, and never passed on;
  - refuses the action when the parameter is required and its bound value is null or missing.
- **Optionally,** a `BoundParameters` JSON column on `MJ: AI Agent Actions`, for values fixed for one agent, merged under the run's `boundActionParams`.
- **The action execution log** records which parameters were bound, so an audit can tell a bound value from a chosen one.

**Tests:** the model's tool description has no bound parameter; a model-written value is discarded and logged; the action receives the bound value; a sub-agent's call to the same action gets the same binding; a required parameter bound to nothing refuses the action; with no bindings, the prompt and the calls are byte-for-byte today's.

**Accept:** a run with `boundActionParams` for an action's `ChapterID` shows the model no `ChapterID`; a `ChapterID` the model writes is ignored and logged; the action gets the bound value; and a sub-agent's call gets the same binding.

## 3. A14. Properties on user views

**Today:**
- A view holds a filter, a sort, and grid and display state. `RunViewParams` (`MJCore/src/views/runView.ts`) adds `ExtraFilter`, `OrderBy` and a search string.
- A view's filter can hold one template token, `{%UserView "id"%}`, which the provider expands (`GenericDatabaseProvider/src/GenericDatabaseProvider.ts`); any other token throws.
- A view can't declare an input.

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
- **In the provider:** each property with a value, or with a non-null default, becomes one predicate on its target field, ANDed with the view's own filter and any `ExtraFilter`. The value is never pasted into SQL as text: it's bound as a parameter where the provider's view path takes parameters, and otherwise written as a typed literal after it's checked against the property's type (a UUID parsed, a number checked, a date parsed, a string escaped with `EscapeSQLString`). The predicate goes through the same SQL screen as `ExtraFilter`. A property with `IsRequired` and no value refuses the run.
- **Row-level security** applies on top, unchanged.
- **Over GraphQL,** a client value for a property whose `AllowOverride` is false is refused, with an error naming the property. Server code sets it.
- **The view designer** gets a Properties panel: add, edit and remove properties, with the field and operator chosen from the entity's fields.

**Tests:** the SQL a property produces for each operator and type; a wrong-typed value refused; a required property with no value refused; row-level security still applied; a client value for a locked property refused over GraphQL; a view with no properties runs exactly as today.

**Accept:** a *Members* view with a `Chapter` property that defaults to null returns every member to staff; run with `Chapter = X`, it returns X's members; a value of the wrong type is refused; row-level security still applies on top.

## 4. A15. Properties on dashboards, and an interactive component part

**Today:**
- A dashboard keeps its layout in `UIConfigDetails` (`E:` the `MJ: Dashboards` entity). It has no parameters, and nothing passes context to its parts (`Angular/Generic/dashboard-viewer/src/lib/models/dashboard-types.ts`).
- Its Query part saves each user's own parameter values.
- The part types are View, Query, Artifact and WebURL, so an interactive component reaches a dashboard only through the Artifact part.
- Interactive components already take props, through `ComponentProps` on the React host (`Angular/Generic/react/src/lib/components/mj-react-component.component.ts`).

**Add:**
- **`Properties` on the dashboard,** with A14's shape, minus `Target`: a dashboard property feeds its parts rather than a field.
- **A mapping in each part's configuration** from the dashboard's properties to the part's inputs:
  - a View part maps to the view's properties (A14);
  - a Query part maps to the query's parameters. A mapped parameter overrides the user's saved value, and the part doesn't offer it for editing;
  - a Component part maps to the component's props.
- **A `Properties` input on the dashboard viewer,** so a host sets the values once.
- **An Interactive Component part type,** first-class: the component's registry name and version, and its props mapping.
- **A host hook for data access** ([§ 8](#8-design-points-to-settle-first), point 1): the viewer, and the React host, accept an optional runner for queries, so an app can route a part's or a component's queries through its own server operation.

**Tests:** property values reach each part type through its mapping; an unmapped part is unchanged; a saved Query-part value is overridden by a mapped property and not offered for editing; the component part renders a registered component with mapped props; a dashboard with no properties renders exactly as today.

**Accept:** one chapter dashboard, with its `Chapter` property set once, drives a view part, a query part and a component part, and each shows only that chapter.

## 5. A17. Locked query parameters, server-set context variables, and an approval status

**Today:**
- Queries are trusted SQL: row-level security doesn't apply to them (`GenericDatabaseProvider.ts`, the query path).
- A query's parameters can all be set by its caller; nothing marks one as the server's.
- Query Permissions are by role only (`MJ: Query Permissions`).

**Add:**
- **Locked parameters.** A query parameter can be marked as the server's: a client value for it is refused over GraphQL, and server code sets it through `RunQueryParams`. Whether the mark lives on the query's parameter metadata or per call (`RunQueryParams.LockedParameters`) is [§ 8](#8-design-points-to-settle-first)'s point 2; the metadata mark protects every caller, and this plan recommends it.
- **Server-set context variables** in a query's template, such as `{{Context.UserID}}` and `{{Context.UserEmail}}`, filled from the context user on the server and never from a client, so a query's SQL can carry its own access predicate. A server operation that runs a query on a user's behalf passes that user as the context.
- **An approval status** on queries, user views, dashboards and interactive components: approved or not, who approved it, when, and the tests it passed. First check what MemberJunction already records: a `Status` on queries, the component registry's own states, and any query test records. [§ 8](#8-design-points-to-settle-first)'s point 3 decides between a column set on each entity and one approval entity keyed by entity and record.

**Tests:** a client value for a locked parameter is refused and logged; server code sets it; a context variable can't be set from a client; a query with no locked parameters and no context variables runs exactly as today; the approval status reads and writes, with its audit.

**Accept:** a query's `ChapterID`, locked, can't be changed over GraphQL; the attempt is refused and logged.

## 6. A18. Calendars in Communication

**Today:**
- A communication provider can only read events: `BaseProvider.GetEvents` (`Communication/base-types/src/BaseProvider.ts`) is read-only and unsupported by default, and only the MS Graph provider implements it (`Communication/providers/MSGraph/src/MSGraphProvider.ts`).
- The realtime bridge has its own Graph and Google calendar clients, which poll the agent's invitations (`AI/RealtimeBridge/Server/src/calendar-watcher.ts`, `calendar-clients.ts`).
- MemberJunction has no calendar entities.

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
- **A migration carries DDL and its CodeGen output only,** in `migrations/v6/`, with apply-time `EntityField` sequences. Metadata (JSONType wiring, seed rows, permissions) is JSON under `metadata/`, pushed before CodeGen runs.
- **T-SQL only.** PostgreSQL is converted by the toolchain at release.
- **Strong types:** no `any`, and no `.Get()` or `.Set()` in place of generated properties.
- **Both test tiers pass:** each changed package's unit tests, and the deterministic integration tier.
- **Changesets:** `minor` for a migration, `patch` otherwise.

## 8. Design points to settle first

1. **Data access from a dashboard's parts and from components.** A host that lets people run only its own server operation for queries needs the dashboard viewer and the React host to accept a query runner. Say where the hook goes, and whether views need one too; row-level security already covers views.
2. **Where a parameter is locked.** On the query's parameter metadata, so every caller is covered, or per call. The plan recommends metadata, with `RunQueryParams` carrying server-set values.
3. **The approval status's shape.** A column set on four entities, or one approval entity keyed by entity and record (with the version it approved). Check what MemberJunction already has first.
4. **View properties and saved filters.** How a property interacts with a view's saved filter state and the grid's own filters in the UI, and whether a property can be shown to the user as a read-only chip.
5. **Calendar ownership.** Whose calendar a created event lives in, the acting user's or a service mailbox, is the app's choice; the interface must support both.
