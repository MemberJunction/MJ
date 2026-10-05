# Bound data access, approval status and calendars

**What this is.** A plan for six additions to MemberJunction core. Each is opt-in: with none of them used, every view, dashboard, query, agent and communication provider behaves exactly as today. The exception is A19, a fix: it changes what a person with a grant on a shared conversation may write.

| # | Addition | For |
|---|---|---|
| A14 | Properties on user views | A view with declared inputs, some of which only the server may set |
| A15 | Properties on dashboards, and an interactive component part | One property set once, mapped onto each part's own inputs, with a default at every level, and changed by a selection in another part |
| A16 | Bound, hidden action parameters for agents | An agent's tool call whose scope the model can't see or change |
| A17 | Locked query parameters, server-set context variables, and an approval status | A query a caller can't re-aim, and a record of which definitions are approved |
| A18 | Calendars in Communication, and a calendar view | Creating and syncing events with Outlook and Google Calendar from any record, and showing records on a calendar |
| A19 | Who a conversation message is from | A shared conversation where nobody posts as someone else, or as the agent |

**Why.** An app on MemberJunction often needs to hand a view, a dashboard, a query or an action to people and agents with some of its inputs fixed by the server. The first is [BizApps Collaboration](https://github.com/MemberJunction/bizapps-collaboration): a chapter's space shows the *Members* view with `Chapter` set to that chapter, a sponsor's space shows that sponsor's booth leads, and neither the viewer nor the space's agent can change which chapter or sponsor it is. MemberJunction has no way to say that today. Views can't declare inputs, dashboards can't pass context to their parts, every action parameter is described to the model, and any query parameter can be set by whoever calls it. A19 is a hole found while building Collaboration's chat: in any shared conversation, a person with an `Edit` grant can post as someone else, or as the agent.

The item numbers are Collaboration's (its plan's § 6, in [bizapps-collaboration#8](https://github.com/MemberJunction/bizapps-collaboration/pull/8)), so its pull requests and this one cite the same things. No addition names Collaboration: each is generic. [§ 6.1](#61-a18-in-the-apps-meetings-in-bizapps-tasks-activities-in-bizapps-common) names two apps only to say how they use A18: bizapps-tasks tracks meetings on it, and bizapps-common's activity import stays beside it.

**Checked against:** MJ `next` at `830c11c` (2026-09-27), § 4.1 and § 7 at `9b8a84e` (the same day), and for § 6.1, bizapps-common's `next` at `df6bfc2` and bizapps-collaboration#8's plan. Paths are under `packages/`. `E:<line>` is a line of `MJCoreEntities/src/generated/entities/__mj.ts` at that commit. Lines move, so search by name.

**Who does what.** The builder implements A14 to A19 in this pull request, in the order below, with each item's tests, once bizapps-collaboration#7 and #8 are done (Amith, 2026-09-27; Collaboration's D36). #8 merges first, with the grants that need these additions closed, and a follow-up there opens them once a release carries this pull request. The plan's author reviews it with a numbered punch list per push. § 6.1's app work isn't built here: bizapps-tasks builds it in its own code pull request (bizapps-collaboration#8's workstream T), citing § 6.1. It needs no plan pull request of its own.

## Contents

1. [Order and delivery](#1-order-and-delivery)
2. [A16. Bound, hidden action parameters for agents](#2-a16-bound-hidden-action-parameters-for-agents)
3. [A14. Properties on user views](#3-a14-properties-on-user-views)
4. [A15. Properties on dashboards, and an interactive component part](#4-a15-properties-on-dashboards-and-an-interactive-component-part)
   - [4.1 Events and wires](#41-events-and-wires)
5. [A17. Locked query parameters, server-set context variables, and an approval status](#5-a17-locked-query-parameters-server-set-context-variables-and-an-approval-status)
6. [A18. Calendars in Communication, and a calendar view](#6-a18-calendars-in-communication-and-a-calendar-view)
   - [6.1 A18 in the apps: meetings in bizapps-tasks, activities in bizapps-common](#61-a18-in-the-apps-meetings-in-bizapps-tasks-activities-in-bizapps-common)
7. [A19. Who a conversation message is from](#7-a19-who-a-conversation-message-is-from)
8. [Rules for the work](#8-rules-for-the-work)
9. [Design points to settle first](#9-design-points-to-settle-first)

## 1. Order and delivery

1. **A16,** the smallest and the most urgent: it's what stops a model choosing which record an action acts on.
2. **A19,** which closes a hole in every shared conversation ([§ 7](#7-a19-who-a-conversation-message-is-from)).
3. **A14,** then **A15**, which builds on A14's property shape and its defaults.
4. **A17.**
5. **A18.** bizapps-tasks then builds § 6.1 on the release that carries it.

Each item lands with its unit tests and, where it touches the database or GraphQL, an integration check in the deterministic tier. A migration takes a `minor` changeset; anything else a `patch`. The design points in [§ 9](#9-design-points-to-settle-first) are settled in a comment before the first migration.

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

**Built (2026-10-05), with these decisions beyond the text above:**
- A binding that names no input parameter of the action refuses the call, like a required parameter bound to nothing, so a misspelled name fails loudly instead of leaving the real parameter open to the model. A binding keyed by anything but a known Action ID fails the run at its start, for the same reason.
- A refused call is a fatal circuit-breaker block: the model is told only that the action is unavailable (naming the parameter would reveal what is hidden), the reason is logged with the run and step IDs, and the action is locked out for the rest of the run.
- A bound parameter is also left out of a narrowed catalog, of the result echoed to the model, of the model-facing invocation record, and of what Find Candidate Actions and Find Best Action report (they read the bindings from the action `Context` as `BoundActionParams`).
- A run with bindings is not offered task graphs and refuses one the model emits anyway: a graph's action nodes are dispatched outside the agent's binding gate.
- The optional `BoundParameters` column on `MJ: AI Agent Actions` is not built. Runtime bindings are not persisted, so a run resumed from a stored request ([§ 9](#9-design-points-to-settle-first), new point 8) starts without them.
- Known limits, documented on the field: the realtime client-direct action path and the workflow meta-actions (Loop, Conditional, Retry, Parallel Execute, Execute Agent) dispatch actions themselves and do not apply bindings; an action's own message text may mention a bound value.

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
      /** Used when a run gives no value: a fixed value or a token (see "Defaults and tokens" below). */
      Default?: PropertyDefault;
      IsRequired?: boolean;
      /** False: only server code may set it, and a client value is refused. Default true. */
      AllowOverride?: boolean;
      /** The predicate the value drives. */
      Target: { Field: string; Operator: '=' | '<>' | 'IN' | '>' | '>=' | '<' | '<=' };
  }
  ```

- **`RunViewParams.Properties`:** `Record<string, value>`, the values for this run.
- **In the provider:** each property with a value, or with a default (a fixed value that isn't null, or a token, worked out on the server), becomes one predicate on its target field, ANDed with the view's own filter and any `ExtraFilter`.
  - The server builds the predicate from the property's `Target` and the value. The value is never pasted into SQL as text: it's bound as a parameter where the view path takes parameters, and otherwise written as a typed literal after it's checked against the property's type (a UUID parsed, a number checked, a date parsed, a string escaped with `EscapeSQLString`).
  - The predicate passes `ValidateUserProvidedSQLClause`, and its target field passes the same field-security check as any other predicate.
  - A property with `IsRequired` and no value refuses the run.
- **Row-level security** applies on top, unchanged.
- **Over GraphQL,** a client value for a property whose `AllowOverride` is false is refused, with an error naming the property. Server code sets it.
- **The view designer** gets a Properties panel: add, edit and remove properties, with the field and operator chosen from the entity's fields.

**Tests:** the SQL a property produces for each operator and type; a wrong-typed value refused; a required property with no value refused; a token default worked out on the server; row-level security still applied; a client value for a locked property refused over GraphQL; a view with no properties runs exactly as today.

**Accept:** a *Members* view with a `Chapter` property that defaults to null returns every member to staff; run with `Chapter = X`, it returns X's members; a value of the wrong type is refused; row-level security still applies on top. A *Recent Sign-ups* view whose `Since` property defaults to thirty days ago returns the last thirty days' members when run with no value.

### Defaults and tokens

A14's view properties, A15's dashboard properties and part mappings, and A17's server-set variables share one idea of a default:

```ts
/** A fixed value, or a token worked out when the value is used. */
export type PropertyDefault =
    | { Value: string | number | boolean | null }
    | { Token: ContextToken; Offset?: { Amount: number; Unit: 'day' | 'week' | 'month' | 'quarter' | 'year' } };

export type ContextToken =
    | 'Context.UserID' | 'Context.UserEmail' | 'Context.UserName'
    | 'Context.Now' | 'Context.Today'
    | 'Context.StartOfWeek' | 'Context.StartOfMonth' | 'Context.StartOfQuarter' | 'Context.StartOfYear';
```

- **Tokens are a closed set, not formulas.** Each is worked out from the context user and the clock alone, so it can't read data, and it comes out the same wherever it runs. They're the names A17 gives a query template's server-set variables, so a default and a template say the same thing the same way. A new token is added here, in core, for every app.
- **An app's own context is never a token.** Which chapter or which space is a property value, set by the host (A15) or by server code.
- **Offsets apply to the date tokens only.** Thirty days ago is `Context.Today` with -30 days; the start of last month is `Context.StartOfMonth` with -1 month. A month offset from a day the target month doesn't have lands on its last day. An offset on a user token is refused when the definition is saved.
- **One resolver,** in `MJCore`, used by the server and the browser alike, so the two can differ only in the time zone they're given ([§ 9](#9-design-points-to-settle-first), point 6).
- **A token is worked out where its value is set.** The server works out a view property's default when a run gives no value, any value only the server may set (A14's `AllowOverride` false, A17's locked parameters), and A17's template variables. The dashboard viewer works out the defaults it applies itself (A15): the browser could send any value there anyway.
- **Checked when saved:** a token's name, an offset's unit, and a fixed value's type against the property's.

**Tests:** each token; each offset unit, including 31 March with -1 month (the last day of February) and a leap year; the resolver giving the same answer on the server and in the browser for the same user, time and zone; a bad token, a bad unit or an offset on a user token refused on save.

## 4. A15. Properties on dashboards, and an interactive component part

**Today:**
- A dashboard keeps its layout in `UIConfigDetails` on `MJ: Dashboards` (E:80138). Its config (`DashboardConfig`, `Angular/Generic/dashboard-viewer/src/lib/models/dashboard-types.ts:24`) holds a layout and settings, and no parameters.
- The viewer creates each part through the class factory and sets only its panel, part type and edit flag (`dashboard-viewer/dashboard-viewer.component.ts`, `instance.Panel`). It passes no context and no data provider.
- The Query part saves parameter values per user per query, under `QueryViewer_<queryId>_LastParams` (`query-viewer/src/lib/query-data-grid/models/query-grid-types.ts:484`), not per dashboard. The same query on two dashboards shares one saved set.
- The query viewer reads its query from the global `QueryEngine` (`query-viewer.component.ts:230`) and runs it on `Provider ?? Metadata.Provider`. Today a host can reroute a part's queries only by registering its own class under `QueryPanelRenderer`, adding a part type, or replacing the process-wide provider.
- The part types are View, Query, Artifact and WebURL (`metadata/dashboard-part-types/`), so an interactive component reaches a dashboard only through the Artifact part, which hosts it with default utilities and no props.
- The React host (`Angular/Generic/react/src/lib/components/mj-react-component.component.ts`) takes props through `ComponentProps` (`:420`), and data access through a `utilities` input (`:237`) carrying `md`, `rv` and `rq`. A host can already give one component its own `rq`. No MJ host does.

**Add:**
- **`Properties` on the dashboard,** with A14's shape minus `Target` and `AllowOverride`: a dashboard property feeds its parts rather than a field, and its value lives in the browser, so it can't be locked (a value only the server may set is locked on the part's input instead, below). Each has a type and, if it wants one, a default ([§ 3's *Defaults and tokens*](#defaults-and-tokens): a fixed value or a token).
- **A `Properties` input on the dashboard viewer,** so a host sets the values once.
- **Each part type declares its inputs,** so the designer and the viewer know what a part can take:
  - a View part: its view's properties (A14);
  - a Query part: its query's parameters (`MJ: Query Parameters`);
  - a Component part: its component's declared props (`ComponentSpec.properties`, `InteractiveComponents/src/component-spec.ts:280`);
  - a Web URL part: named placeholders in its URL, such as `{Chapter}`, each URL-encoded when it's filled;
  - an Artifact part: none.
- **Each part maps the dashboard's properties onto its own inputs, and the names needn't match.** A dashboard's `Chapter` can feed a view property called `ChapterID`, a query parameter called `chapter_id` and a component prop called `selectedChapter`. The mappings live in the part's configuration, as `inputMappings`, beside the keys each part already keeps there (`viewId`, `queryId`, `url`, `artifactId`):

  ```ts
  export interface DashboardPartInputMapping {
      /** The part's own input: a view property, a query parameter, a component prop or a URL placeholder. */
      Input: string;
      /** The dashboard property that feeds it. Omitted: the input takes Default alone. */
      Property?: string;
      /** Used when the dashboard property has no value, and always when Property is omitted. */
      Default?: PropertyDefault;
  }
  ```

- **A default at every level, applied in one order.** An input takes the first of:
  1. the value the host sets for the dashboard property;
  2. the dashboard property's default;
  3. the mapping's default;
  4. the input's own default, as it works today or in A14: a view property's default, a component prop's `defaultValue`, or the value the query viewer's parameter form fills in from a parameter's `DefaultValue` (`query-viewer/src/lib/query-parameter-form/query-parameter-form.component.ts:176`).

  A required input with none of these stops its part, which says which input is missing; it never runs with the input blank. To give one part a different value, map it to a different dashboard property, or give its mapping a `Default` and no `Property`.
- **Tokens in these defaults** are worked out by the viewer, in the browser, with § 3's one resolver.
- **Only what the browser may set is mapped.** An input only the server may set, a view property whose `AllowOverride` is false or a locked query parameter (A17), can't be mapped: the designer shows it as set by the server, and the host's runner sets it there ([§ 9](#9-design-points-to-settle-first), point 1).
- **A mapped query parameter** overrides the user's saved value, is never saved back into it (that set is shared by every dashboard showing the query), and isn't offered for editing.
- **The designer** gets a Properties panel for the dashboard (add, edit and remove its properties, each with a default), and an Inputs list in each part's configuration: every input the part declares, each mapped to a dashboard property, fixed by a default, or left to its own.
- **A broken mapping shows on its part.** Saving refuses a mapping to an input the part doesn't declare, from a property the dashboard doesn't have, or between types that don't match. If a part's inputs change later (a view's property renamed), the part shows the error rather than running without the value.
- **An Interactive Component part type,** first-class: the component's registry name and version, and its props mapping.
- **A host hook for data access** ([§ 9](#9-design-points-to-settle-first), point 1): the viewer accepts an optional runner for queries and hands it to its parts, so an app can route a part's queries through its own server operation. The Component part passes the same runner to the React host as `utilities.rq`.

**Tests:** property values reach each part type through its mapping, under names that differ from the dashboard's; each level of the order wins when the ones above it are empty; a token default worked out in the browser; a mapping with a `Default` and no `Property`; a required input with no value stops its part and names the input; an input only the server may set can't be mapped; a broken mapping refused on save, and shown on its part when a view's property is renamed afterwards; an unmapped part is unchanged; a saved Query-part value is overridden by a mapped property and not offered for editing; the component part renders a registered component with mapped props; a dashboard with no properties renders exactly as today.

**Accept:** one chapter dashboard, with its `Chapter` property set once, drives a view part (`ChapterID`), a query part (`chapter_id`) and a component part (`selectedChapter`), and each shows only that chapter. With the host setting nothing else, a `Since` property that defaults to the start of the month gives the query part this month's rows.

### 4.1 Events and wires

Amith, 2026-09-28: a part's event can set a dashboard property, so selecting a row in one part filters another.

**Today:**
- A part reports a selection through `BaseDashboardPart.DataChanged` (`Angular/Generic/dashboard-viewer/src/lib/parts/base-dashboard-part.ts:113`): the View part when a row is selected, with the record and its key (`view-part.component.ts:196`), and the Query part when an entity link is clicked (`query-part.component.ts:214`). The viewer listens to neither, so nothing on the dashboard reacts.
- The query viewer raises a row selection (`SelectionChange`, `query-viewer/src/lib/query-viewer/query-viewer.component.ts:142`), and the Query part doesn't pass it on.
- `PanelInteractionEvent` (`dashboard-viewer/src/lib/models/dashboard-types.ts:110`) declares `'record-select'`, but the viewer never raises it: it raises only its own add, configure and remove requests.
- An interactive component declares its events in its spec (`ComponentSpec.events`, `InteractiveComponents/src/component-spec.ts:285`), each a `ComponentEvent` with named, typed parameters (`component-props-events.ts:46`). The React host raises them as `ComponentEvent` (`mj-react-component.component.ts:449`).

**Add:**
- **Each part type declares its events,** as it declares its inputs:
  - a View part: `RecordSelected`, whose values are the selected record's fields;
  - a Query part: `RowSelected`, whose values are the selected row's columns, from the query viewer's `SelectionChange`;
  - a Component part: its component's declared events, whose values are each event's parameters;
  - Web URL and Artifact parts: none.
- **A wire sets a dashboard property from an event.** Wires live in the dashboard's configuration, beside its properties:

  ```ts
  export interface DashboardWire {
      /** The part that raises the event. */
      Panel: string;
      /** One of the events that part declares. */
      Event: string;
      /** Which of the event's values: a record's field, a row's column or an event's parameter. */
      Value: string;
      /** The dashboard property it sets. */
      Property: string;
  }
  ```

- **One path for values.** A wire sets a dashboard property, never a part's input. The property then reaches the parts through their own mappings, as a host's value does, so the left part's selection reaches the right part under the right part's own input name.
- **Where an event's value sits in A15's order:** after the host's value and before the dashboard property's default. The host's value always wins, so a selection can't change context the host set, such as a chapter space's chapter.
- **Clearing the selection** removes the event's value, so the property goes back to the host's value or its default.
- **No loops:** a part isn't refreshed by a value its own event set.
- **A wire only narrows.** It sets a dashboard property, which can't reach an input only the server may set (A15), and a view property's value is one more predicate ANDed with the view's filter, under row-level security. So a selection changes what a part shows, never what a person may see.
- **The host hears it too:** the viewer raises `PanelInteraction` with `'record-select'` for a View or Query part's selection.
- **The designer** gets a Wires list: each wire's part, event, value and property. Saving refuses a wire from an event the part doesn't declare, to a property the dashboard doesn't have, or with a value whose type doesn't match the property's.

**Tests:** a View part's selection sets its wired property, and the parts mapped from it refresh; a Query part's row and a component's event do the same; the host's value wins over an event's; clearing the selection returns the property to its default; the part that raised the event isn't refreshed by it; `PanelInteraction` raises `'record-select'`; a broken wire refused on save; a dashboard with no wires behaves exactly as today.

**Accept:** a dashboard with a *Chapters* view on the left and a *Members* view on the right. The left part's `RecordSelected` is wired, by its `ID`, to a `Chapter` property, which the right part maps onto its view's `ChapterID`. Selecting a chapter shows its members on the right, and clearing the selection shows every member the viewer may see. When the host sets `Chapter`, selecting on the left doesn't change the right.

## 5. A17. Locked query parameters, server-set context variables, and an approval status

**Today:**
- Saved queries are trusted, admin-authored SQL: row-level security doesn't apply to them (`GenericDatabaseProvider.ts:4178`).
- A query's SQL is a Nunjucks template whose context is only its declared, validated parameters (`QueryProcessor/src/queryParameterProcessor.ts:475`). There's no server-set variable. User tokens (`{{User<Field>}}`) exist only in row-level security filter text (`MJCore/src/generic/securityInfo.ts:550`).
- The caller can set every parameter (`RunQueryParams.Parameters`, `MJCore/src/generic/runQuery.ts:42`). `MJ: Query Parameters` (E:106951) has no mark for the server's, and a parameter's `DefaultValue` is informational, never injected. Unknown parameters are refused.
- Query Permissions are by role (`MJ: Query Permissions`). A query with no permission rows is open to anyone who can read every entity it uses. Once rows exist, a role grant overrides those entity checks, including for the queries it composes (`MJCoreEntities/src/custom/MJQueryEntityExtended.ts:107`).
- `MJ: Queries.Status` ('Approved', 'Expired', 'Pending', 'Rejected', default 'Pending') exists, but a query that isn't Approved only logs a warning when it runs (`GenericDatabaseProvider.ts:3688`); composition requires Reusable and Approved. Queries have no approved-by or approved-at. User views and dashboards have no status. Components have Draft, Published and Deprecated, which is publication, not approval. No entity records query tests. The nearest precedent is `CodeApprovalStatus`, `CodeApprovedByUserID` and `CodeApprovedAt` on `MJ: Actions`.

**Add:**
- **Locked parameters.** A query parameter can be marked as the server's: a client value for it is refused over GraphQL, and server code sets it through `RunQueryParams`. Whether the mark lives on the query's parameter metadata or per call (`RunQueryParams.LockedParameters`) is [§ 9](#9-design-points-to-settle-first)'s point 2; the metadata mark protects every caller, and this plan recommends it.
- **Server-set context variables** in a query's template, such as `{{Context.UserID}}` and `{{Context.UserEmail}}`: a reserved `Context` object in the template's render context, filled from the context user on the server and never from a client. Its variables are [§ 3's tokens](#defaults-and-tokens), worked out by the same resolver, so a template and a default name the same values. A parameter named `Context` is refused. A query's SQL can then carry its own access predicate. A server operation that runs a query on a user's behalf passes that user as the context.
- **An approval status** on queries, user views, dashboards and interactive components: approved or not, who approved it, when, and the tests it passed. Queries keep their `Status` and gain who and when. [§ 9](#9-design-points-to-settle-first)'s point 3 decides the shape for the rest.

**Tests:** a client value for a locked parameter is refused and logged; server code sets it; a context variable can't be set from a client; a query with no locked parameters and no context variables runs exactly as today; the approval status reads and writes, with its audit.

**Accept:** a query's `ChapterID`, locked, can't be changed over GraphQL; the attempt is refused and logged.

## 6. A18. Calendars in Communication, and a calendar view

**Today:**
- `BaseProvider.GetEvents` (`Communication/base-types/src/BaseProvider.ts:1388`) is a communication provider's only calendar method: read-only, and unsupported by default. Only the MS Graph provider implements it (`Communication/providers/MSGraph/src/MSGraphProvider.ts:909`).
- Inside MemberJunction, only tests call it. Outside it, bizapps-common's activity sync reads Outlook events through it (`ActivitySync`'s `GraphCalendarTransport` and `MSGraphCalendarSyncProvider`) over a rolling window of past and coming days, and saves each as a *Meeting* activity, keyed by Graph's event ID.
- The realtime bridge has its own read-only calendar clients, `GraphCalendarClient` and `GoogleCalendarClient` (`AI/RealtimeBridge/Server/src/calendar-clients.ts:108` and `:233`). `CalendarWatcher` (`calendar-watcher.ts:148`) uses them to poll an agent's invitations and create scheduled agent session bridges.
- MemberJunction has no calendar entities, no calendar view type and no calendar component. The entity viewer's modes are grid, cards, timeline and map (`EntityViewMode`, `Angular/Generic/entity-viewer/src/lib/types.ts:20`).

**Add:**
- **A calendar interface on communication providers,** with a capability flag so a provider without it says so: create, update and cancel an event; invite attendees; read RSVPs; and sync changes both ways, through Graph delta queries and Google sync tokens.
- **The MS Graph implementation,** extending what it has, and **a Google Calendar implementation.** `GetEvents` keeps working as it does, so bizapps-common's import is unchanged.
- **`MJ: Calendar Event Links`:** the provider, the calendar account, the external event's ID and series ID, its iCalendar UID, `EntityID` and `RecordID`, the sync token, and when it last synced, so any record can be tied to an event. The provider's event ID is per mailbox: the same meeting has a different Graph ID in each attendee's calendar. The iCalendar UID (Graph's `iCalUId`, Google's `iCalUID`) is the same in all of them, so it's what another app matches on ([§ 6.1](#61-a18-in-the-apps-meetings-in-bizapps-tasks-activities-in-bizapps-common)).
- **One implementation:** the realtime bridge's two clients fold into this layer.
- **A Calendar view type** for user views, beside grid, cards, timeline and map: records placed on a day, week or month by a start field and an optional end field, which the view names. It needs no calendar provider, and it works for any entity with a date.

**Tests:** each provider's create, update, cancel, invite and RSVP against recorded responses; a delta sync applying a moved time and a changed RSVP; the iCalendar UID stored on create and matched on sync; the bridge's invitation polling on the new layer; the Calendar view placing records by their start and end fields, and one with no end field.

**Accept:** an MJ record creates an Outlook event and a Google event with attendees; a time change in either calendar flows back to the record; an RSVP updates the attendee. A user view of those records shows them on a calendar.

### 6.1 A18 in the apps: meetings in bizapps-tasks, activities in bizapps-common

This part isn't built in this pull request. It says where calendar tracking goes in the BizApps, so the apps build it once, on A18. bizapps-tasks builds it in its own code pull request (bizapps-collaboration#8's workstream T), citing this section.

**The answer: bizapps-tasks.** A meeting is a unit of work: it has an agenda, attendees, notes and follow-up tasks, and it's planned before it happens. bizapps-collaboration#8's plan already moves meetings and agendas out of Committees into bizapps-tasks (its D33 and workstream T). bizapps-common draws the same line in its Activities migration (`V202608171935`): an activity is an interaction that happened, and "a Task is not an Activity".

**The case for bizapps-common, and why it doesn't hold.** Common is the layer every app has, so meetings there would reach apps that don't install bizapps-tasks. And it already reads calendars: its activity sync imports Outlook events as *Meeting* activities. But an activity records that an interaction happened, for a person's or an organization's timeline. It has no agenda, no RSVP and no follow-ups, and common only reads calendars. A planned meeting is work, and its follow-ups are tasks, so in common it would need bizapps-tasks, which common can't depend on: its dependencies point only toward MemberJunction core. So common keeps its import, and bizapps-tasks owns meetings.

**What goes where:**

| Concern | Where | Why |
|---|---|---|
| Talking to calendars: create, update, cancel, invite, RSVPs, sync | MJ core (A18) | One client for every app. The realtime bridge's two fold in |
| Which record an external event belongs to | MJ core (`MJ: Calendar Event Links`) | Any record in any app, with no calendar column on an app's tables |
| Meetings, agendas, attendees and their RSVPs, notes, follow-up tasks | bizapps-tasks (workstream T) | A meeting is work, and tasks and meetings link both ways |
| That a meeting took place, on a person's or organization's timeline | bizapps-common (its activities) | It already imports calendar events as *Meeting* activities |
| A calendar entity in bizapps-common | Nowhere | A18's link table covers any record, and common stays blind to the apps above it |

**What bizapps-tasks builds:**
1. **Pin the MJ release** that carries A18.
2. **No calendar column on `Meeting`.** Committees' unused `CalendarEventID` isn't carried over: a meeting's event is its row in `MJ: Calendar Event Links`, with the Meetings entity's `EntityID` and the meeting's ID as `RecordID`.
3. **Create the event in the organizer's calendar,** through A18. With no connected calendar, the meeting still saves, and offers the `.ics` download below.
4. **Attendees:** each `MeetingAttendee`, a person or a guest by email, is invited. RSVPs come back through A18's sync into the attendee's RSVP.
5. **Both ways:** a change of time, place or attendees in the app updates the event; a change or cancellation in the calendar updates the meeting; and cancelling the meeting cancels the event.
6. **The `.ics` fallback,** built on the server with a `DTSTAMP`, and with the same UID as the link row, so a calendar that imports it and one that got the invitation hold one event, not two.
7. **Follow-ups:** a task made from a meeting or an agenda item links to it through `TaskLink`.
8. **Calendars on screen:** user views of meetings get A18's Calendar view type with no work, and the task panel gains a calendar mode, beside its others, for meetings and dated tasks.

**One owner per event.** A meeting planned in bizapps-tasks shows up in bizapps-common's import too, once in each connected mailbox that holds it. To keep that one meeting with one record behind it:
- **Only bizapps-tasks writes to calendars;** common only reads.
- **Both sides keep the iCalendar UID.** bizapps-tasks has it on the link row. Common keeps it today only inside each activity's raw event, and should keep it as a column, next to Graph's ID.
- **Common links by the UID, without knowing the apps.** When it imports an event whose UID has a row in `MJ: Calendar Event Links`, it adds an activity link (its polymorphic `ActivityLink`) to the record that row names. It reads only MJ core's table and never names bizapps-tasks, so it stays blind to the apps above it. A meeting then shows once on each attendee's timeline, tied to the meeting.
- **Neither writes the other's rows:** bizapps-tasks writes no activities, and common writes no meetings.
- **Common may move to A18's sync later,** instead of re-reading a window each run. That's its own choice; A18 keeps `GetEvents` as it is.

## 7. A19. Who a conversation message is from

**Today:**
- `MJConversationDetailEntityExtended` (`MJCoreEntities/src/custom/MJConversationDetailEntityExtended.ts:51`) guards writes to messages on the server. The conversation's owner, or a person with an `Edit` or `Owner` grant on it, may create, change or delete any of its messages. It checks who may write, not what they write: only the rating fields (`UserRating`, `UserFeedback`) are kept to the owner.
- So a person with an `Edit` grant can:
  - save a message with someone else's `UserID`, or with none, which shows as the conversation's owner;
  - save one with `Role` `AI`, which reads as the agent's reply;
  - change or delete other people's messages.
- MJ's chat creates each agent reply's row in the browser before the run starts (`Angular/Generic/conversations/src/lib/components/message/message-input.component.ts:2939`, with `Role` `AI` and In-Progress; Sage's delegation row the same way, `:2545`), and saves the final text from the browser when the run returns (`updateConversationDetail`, `:2814`). The server's `AgentRunner.RunAgentInConversation` (`AI/Agents/src/AgentRunner.ts:262`) writes the run's progress, final text and status into the same row (`:503`). All of these writes run with the person who asked as the user, so on the server a real reply and a forged one look the same.
- The runner already creates the reply's row itself when it isn't given one (`:384`). A host that runs turns on its own server, through the chat area's `AgentTurnHandler` (MJ#4788), writes replies as the system user already.
- The gate lets a server save with no user through. A save as the system user gets no such pass: the system user must own the conversation or hold a grant on it.

**Add:**
- **People post as themselves.** A `User` message a person creates carries their own `UserID`: the server fills it in when it's empty and refuses someone else's. Only its author changes it. Its author or the conversation's owner deletes it.
- **Only the server writes the agent's replies.** A row with `Role` `AI` or `Error` is created, and its content changed, only by server code writing as the system user. A person's save of one is refused, except the owner's rating fields.
- **The system user may write any message,** as a save with no user may today, so server code can write replies in anyone's conversation.
- **The chat stops writing replies from the browser.** The runner creates the reply's row on the server, as the system user, and the browser shows that row ([§ 9](#9-design-points-to-settle-first), point 7). The browser no longer saves the final text. The other server code that writes `AI` rows writes them as the system user too: the realtime session's (`MJServer/src/resolvers/RealtimeClientSessionResolver.ts:2453` and `:2880`) and the task graph's (`MJServer/src/services/TaskGraphContinuationDeliverer.ts:77`).
- **Delivery:** the rules for `User` messages are safe alone and can land first. The rule for replies lands with the chat's change, in the same release, or MJ's own chat can't write a reply at all.

**Tests:** a grantee's message with another person's `UserID` refused, and one with none saved with the grantee's; a grantee's `AI` row refused; a grantee changing or deleting another person's message refused; the owner deleting any message allowed; the runner creating the reply's row as the system user, and the chat showing it; the owner rating an agent's reply still allowed; a person's own conversation, agent replies included, working exactly as today.

**Accept:** in a conversation shared with `Edit`, the grantee's message saved with the owner's `UserID` is refused, and so is one with `Role` `AI`. The grantee's @-mention of an agent still gets a reply, written by the system user.

## 8. Rules for the work

MemberJunction's own `CLAUDE.md` governs, and these points matter most here:
- **Everything is opt-in,** and every default keeps today's behavior, except A19's fix.
- **A migration carries DDL and its CodeGen output only,** in `migrations/v6/`, named `V<YYYYMMDDHHMM>__v6.2.x__<Name>.sql` (the current band), with apply-time `EntityField` sequences. Metadata (JSONType wiring, seed rows, permissions) is JSON under `metadata/`, pushed before CodeGen runs.
- **T-SQL only.** PostgreSQL is converted by the toolchain at release.
- **Strong types:** no `any`, and no `.Get()` or `.Set()` in place of generated properties.
- **Both test tiers pass:** each changed package's unit tests, and the deterministic integration tier.
- **Changesets:** `minor` for a migration, `patch` otherwise.
- **When the work merges,** this plan moves to `plans/complete/`.

## 9. Design points to settle first

1. **Data access from a dashboard's parts and from components.** A host that lets people run only its own server operation for queries needs a seam. The React host has one (`utilities`); the dashboard viewer and the query viewer don't. Say where the hook goes (a runner input, a `Provider` passed down, or both), and whether views need one too; row-level security already covers views.
2. **Where a parameter is locked.** On the query's parameter metadata, so every caller is covered, or per call. The plan recommends metadata, with `RunQueryParams` carrying server-set values.
3. **The approval status's shape.** Columns on each of the four entities, following `MJ: Actions`' `CodeApproval*` set, or one approval entity keyed by entity, record and the version approved. Also: whether server code may ask for a query to be refused unless it's Approved (opt-in), since today it only warns.
4. **View properties and saved filters.** How a property interacts with a view's saved filter state and the grid's own filters in the UI, and whether a property can be shown to the user as a read-only chip. The same question for a Query part: how a mapped parameter looks next to the user's own.
5. **Calendar ownership.** Whose calendar a created event lives in, the acting user's or a service mailbox, is the app's choice; the interface must support both. bizapps-tasks uses the organizer's ([§ 6.1](#61-a18-in-the-apps-meetings-in-bizapps-tasks-activities-in-bizapps-common)).
6. **Tokens: the list, the time zone and the week.** Confirm [§ 3's list](#defaults-and-tokens), and that an app can't add its own (its context is a property value the host sets). Then two rules the resolver needs:
   - **The time zone** a date token is worked out in. MemberJunction keeps no time zone per user today; its only time zone column is a record process's schedule. The browser has the viewer's zone, and the server must come out the same, or a part's range moves by a day near midnight. The choices: the browser's zone sent with each request, a user setting, or UTC.
   - **The first day of a week,** for `Context.StartOfWeek`: Monday, Sunday, or a setting.
7. **How the chat gets its reply's row** (A19). The runner creates the row on the server. Say whether its ID reaches the browser on the run's progress channel before the run starts, or through a separate server call that creates the row first, and how the chat keeps its duration timer, which starts from the row's `__mj_CreatedAt` today.
8. **Where bindings persist** (A16). Runtime `boundActionParams` are not stored, so a run resumed after an `ask_user` pause (`MJ: AI Agent Requests`) starts without them and the hidden parameter is open to the model again; `actionChanges` have the same limit. Either a `BoundActionParams` JSON column on `MJ: AI Agent Runs`, written at run start and read back on resume (covers per-run bindings such as a space's chapter), or the per-agent `BoundParameters` column the text above calls optional (covers a value fixed for every run of one agent), or both. Either is a `minor` migration.
