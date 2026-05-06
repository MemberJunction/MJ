# Unified Permissions Architecture — Review & Architectural Recommendations

> **Context**: This document provides a review of the [Unified Permissions Architecture plan](./unified-permissions-architecture.md) with architectural commentary, industry comparisons, and concrete improvement proposals. It is intended to be read alongside the original plan.
>
> **Implementation status**: **Phase 1 (Application Roles) is complete.** See the [Phase 1 Deliverables Checklist](./unified-permissions-architecture.md#18-phase-1-deliverables-checklist) in the primary plan for per-item status. The recommendations in this document apply to Phase 2 and beyond.

---

## 1. Industry Comparison: How the Plan Aligns with Established Authorization Systems

The Phase 2 design makes several strong choices that align with proven patterns in production authorization systems. This section maps each design decision to its industry equivalent and highlights where the plan diverges intentionally or could be strengthened.

### 1.1 What the Plan Does Well

#### Provider/Plugin Architecture

The `IPermissionProvider` pattern is the **Strategy pattern** applied to authorization — the same approach used by:

- **ASP.NET Core** — `IAuthorizationHandler` interface with multiple registered handlers
- **Spring Security** — `AccessDecisionVoter` chain where each voter evaluates independently

Each MJ permission domain encapsulates its own logic while exposing a uniform interface to `PermissionEngine`. This is the standard approach for systems that evolved organically with multiple permission models and need unification without rewriting each subsystem.

#### Normalized Permission Tuples

The `NormalizedPermission` type (domain + resource type + resource ID + grantee + actions + effect) is structurally similar to **Google Zanzibar's relation tuples** (`object#relation@subject`), which powers Google Drive, YouTube, and Cloud IAM. Open-source implementations of this model include:

| System | Maintained By | Notes |
|---|---|---|
| SpiceDB | AuthZed | Full Zanzibar implementation, gRPC API |
| OpenFGA | Auth0/Okta | Zanzibar-inspired, used in Okta's products |
| Ory Keto | Ory | Zanzibar-inspired, Go-based |

The MJ plan's version is simpler (no recursive group expansion or tuple rewriting), but for MJ's scale that is appropriate.

#### Open-by-Default Fallback

The "zero ApplicationRole records = open access" pattern avoids a common migration disaster. AWS IAM and Azure RBAC both default to **deny-by-default**, which is more secure but catastrophic if applied retroactively to an existing system with live users. The plan's approach prioritizes safe migration — the right trade-off for MJ's situation.

#### Deny-Overrides-Allow Semantics

The plan's Phase 2b addition of Deny support follows the **XACML deny-overrides** combining algorithm, which is the industry standard for policy evaluation. AWS IAM, Azure RBAC, and GCP IAM all use this model: an explicit Deny at any level overrides any number of Allow grants.

### 1.2 Gap Analysis: Three Areas for Improvement

The following three areas represent gaps between the current plan and capabilities found in mature authorization infrastructure. Each is analyzed in detail in Sections 2-5 below.

| # | Gap | Industry Reference | Risk if Not Addressed | Recommended Phase |
|---|---|---|---|---|
| 1 | No relationship-based access control (ReBAC) | Zanzibar, SpiceDB, OpenFGA | Permission management doesn't scale with hierarchical resources (folders, categories, teams of teams); hierarchy logic duplicated across providers instead of shared | Phase 2b-2c |
| 2 | No declarative policy language | OPA/Rego, Cedar, Casbin | Authorization logic scattered across provider classes; difficult for compliance audits | Phase 3 (future) |
| 3 | Cross-domain permission enumeration may not scale | SpiceDB streaming, AWS IAM Access Analyzer | Enumeration queries degrade as resource counts grow | Phase 2a (design consideration) |

---

## 2. Relationship-Based Access Control (ReBAC) — Deep Dive

This is the highest-impact improvement we recommend. The current plan uses **flat permission checks** — each provider independently resolves "does User X have Permission Y on Resource Z?" by querying its own tables. ReBAC instead stores **relationships** (edges in a graph) and traverses them at query time, which dramatically reduces the permission management burden for hierarchical resources.

### 2.1 How ReBAC Works (Zanzibar Model)

Everything is stored as **relation tuples** — simple 3-part statements:

```
object#relation@subject
```

Concrete examples:

```
document:budget-2026#owner@user:sarah
document:budget-2026#parent@folder:finance
folder:finance#viewer@team:analysts
team:analysts#member@user:jordan
```

These are edges in a directed graph. The authorization model (schema) defines how relationships compose:

```
type document
  relations
    define owner: [user]
    define parent: [folder]
    define editor: owner or editor from parent
    define viewer: editor or viewer from parent

type folder
  relations
    define owner: [user]
    define editor: owner or [user, team#member]
    define viewer: editor or [user, team#member]

type team
  relations
    define member: [user]
```

The critical syntax is `viewer from parent` — this means "to check if someone can view a document, also check if they can view the document's parent folder." The engine recursively walks the graph.

### 2.2 Worked Example: Permission Check via Graph Traversal

**Question: "Can Jordan view document:budget-2026?"**

The engine evaluates the `viewer` definition for `document: editor OR viewer from parent`

**Step 1 — Check `editor` (which is: `owner OR editor from parent`):**
- Is Jordan the owner of budget-2026? No tuple exists.
- Is Jordan an editor of budget-2026's parent? Find parent: `folder:finance`. Is Jordan an editor of finance? No.

**Step 2 — Check `viewer from parent`:**
- Find parent: `document:budget-2026#parent@folder:finance`
- Can Jordan view `folder:finance`? Check folder's viewer definition: `editor OR [user, team#member]`
- Is Jordan a direct viewer? No.
- Is Jordan a member of a team that's a viewer? Find: `folder:finance#viewer@team:analysts` — yes. Find: `team:analysts#member@user:jordan` — yes.

**Result: Allowed.** The engine traversed 4 relationship hops:

```
user:jordan ──member──> team:analysts ──viewer──> folder:finance ──parent──> document:budget-2026
```

### 2.3 Why This Matters for MJ

MJ already has several hierarchical permission scenarios:

- **Dashboard Categories** → Dashboards (category permissions should cascade to dashboards within)
- **Collections** → Artifacts (collection sharing should cascade to contained artifacts)
- **Applications** → Resources within apps
- **Entity Schemas** → Entities within schemas
- **Teams/Roles** → Users within roles (MJ already has this via UserRole)

Without ReBAC, each of these hierarchies requires custom cascade logic duplicated across providers. With ReBAC, you define the hierarchy once in the authorization model and the traversal engine handles it uniformly.

| Scenario | Without ReBAC | With ReBAC |
|---|---|---|
| Add user to a team | Must create permission records for every resource the team accesses | Add one `team#member` tuple — access propagates automatically |
| Move dashboard to new category | Must manually update all permission records | Change one `parent` tuple — permissions follow the resource |
| "Who can access this?" query | Query each provider independently | Single graph traversal from the resource |
| New resource type with hierarchy | Build custom cascade logic in a new provider | Define relations in metadata, write tuples, done |
| Nested groups (team of teams) | Not possible without custom code | Natural — `team:engineering#member@team:backend` |

---

## 3. Proposed MJ Implementation of ReBAC

This section provides a concrete design for adding ReBAC to MJ, designed to integrate with (not replace) the Phase 2 provider architecture.

### 3.1 New Database Schema

#### Table: `PermissionResourceType`

Defines the types of resources that participate in the relationship graph.

```sql
CREATE TABLE ${flyway:defaultSchema}.PermissionResourceType (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(200) NOT NULL,           -- e.g. 'Dashboard', 'DashboardCategory', 'Team', 'Application'
    Description NVARCHAR(MAX) NULL,
    CONSTRAINT PK_PermissionResourceType PRIMARY KEY (ID),
    CONSTRAINT UQ_PermissionResourceType_Name UNIQUE (Name)
);
```

#### Table: `PermissionRelationDefinition`

Defines what relations a resource type supports and how they compose. This is the **authorization model** — the schema that controls how the graph is traversed.

```sql
CREATE TABLE ${flyway:defaultSchema}.PermissionRelationDefinition (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    ResourceTypeID UNIQUEIDENTIFIER NOT NULL,
    Name NVARCHAR(100) NOT NULL,                -- e.g. 'owner', 'editor', 'viewer', 'parent', 'member'
    CompositionRule NVARCHAR(MAX) NULL,          -- JSON: how this relation resolves
    CONSTRAINT PK_PermissionRelationDef PRIMARY KEY (ID),
    CONSTRAINT FK_PermissionRelationDef_ResourceType
        FOREIGN KEY (ResourceTypeID) REFERENCES ${flyway:defaultSchema}.PermissionResourceType(ID),
    CONSTRAINT UQ_PermissionRelationDef UNIQUE (ResourceTypeID, Name)
);
```

The `CompositionRule` JSON encodes the union logic:

```json
{
  "union": [
    { "direct": ["User", "Team#member"] },
    { "implied": "editor" },
    { "traversal": { "relation": "parent", "permission": "viewer" } }
  ]
}
```

This reads as: **"viewer = directly assigned users or team members OR anyone who is an editor OR anyone who is a viewer of the parent resource."**

- **`direct`**: Check for an explicit tuple. Entries like `"Team#member"` mean "check if the subject is a member of a Team that has this relation."
- **`implied`**: Inherit from a stronger relation on the same resource (e.g., all editors are also viewers).
- **`traversal`**: Follow a structural relationship to another resource and check a permission there (e.g., follow the `parent` relation to the parent folder and check `viewer` on it).

#### Table: `PermissionRelationTuple`

The actual relationship instances — the edges in the graph. This is the runtime data that the traversal engine reads.

```sql
CREATE TABLE ${flyway:defaultSchema}.PermissionRelationTuple (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),

    -- The object (resource being accessed)
    ResourceTypeID UNIQUEIDENTIFIER NOT NULL,
    ResourceID NVARCHAR(100) NOT NULL,

    -- The relation
    RelationDefinitionID UNIQUEIDENTIFIER NOT NULL,

    -- The subject (who/what has this relation)
    SubjectResourceTypeID UNIQUEIDENTIFIER NULL,   -- NULL when subject is a direct User
    SubjectResourceID NVARCHAR(100) NOT NULL,       -- User ID, Team ID, Folder ID, etc.
    SubjectRelation NVARCHAR(100) NULL,             -- e.g. 'member' for Team#member

    -- Metadata
    GrantedByUserID UNIQUEIDENTIFIER NULL,
    ExpiresAt DATETIMEOFFSET NULL,

    CONSTRAINT PK_PermissionRelationTuple PRIMARY KEY (ID),
    CONSTRAINT FK_PRT_ResourceType
        FOREIGN KEY (ResourceTypeID) REFERENCES ${flyway:defaultSchema}.PermissionResourceType(ID),
    CONSTRAINT FK_PRT_RelationDef
        FOREIGN KEY (RelationDefinitionID) REFERENCES ${flyway:defaultSchema}.PermissionRelationDefinition(ID)
);

-- Critical index for permission checks: "does this exact tuple exist?"
CREATE UNIQUE INDEX UQ_PermissionRelationTuple
    ON ${flyway:defaultSchema}.PermissionRelationTuple
    (ResourceTypeID, ResourceID, RelationDefinitionID,
     SubjectResourceTypeID, SubjectResourceID, SubjectRelation);

-- Index for reverse lookups: "what does this subject have access to?"
CREATE INDEX IX_PRT_Subject
    ON ${flyway:defaultSchema}.PermissionRelationTuple
    (SubjectResourceTypeID, SubjectResourceID);
```

#### Example Data

The Dashboard hierarchy scenario:

| ResourceType | ResourceID | Relation | SubjectType | SubjectID | SubjectRelation |
|---|---|---|---|---|---|
| Dashboard | q1-report-id | owner | User | sarah-id | NULL |
| Dashboard | q1-report-id | parent | DashboardCategory | sales-cat-id | NULL |
| DashboardCategory | sales-cat-id | viewer | Role | analyst-role-id | member |
| Role | analyst-role-id | member | User | jordan-id | NULL |

Query: "Can Jordan view the Q1 Report dashboard?"
Traversal: `jordan → member of → Analyst role → viewer of → Sales category → parent of → Q1 Report` — **Allowed**.

### 3.2 Graph Traversal Engine

Core runtime component that walks the relationship graph:

```typescript
export class RelationshipResolver extends BaseSingleton<RelationshipResolver> {
    protected constructor() { super(); }

    public static get Instance(): RelationshipResolver {
        return RelationshipResolver.getInstance<RelationshipResolver>();
    }

    /**
     * Core check: "Does subject have relation on resource?"
     * Recursively traverses the authorization model.
     *
     * @param resourceType - Type of the resource (e.g. 'Dashboard')
     * @param resourceId - ID of the specific resource
     * @param relation - The relation to check (e.g. 'viewer')
     * @param subjectType - Type of the subject (e.g. 'User')
     * @param subjectId - ID of the subject
     * @param context - Tracks visited nodes to prevent infinite cycles
     */
    public async Check(
        resourceType: string,
        resourceId: string,
        relation: string,
        subjectType: string,
        subjectId: string,
        context: TraversalContext
    ): Promise<boolean> {
        // Cycle detection: prevent infinite loops in the graph
        const key = `${resourceType}:${resourceId}#${relation}@${subjectType}:${subjectId}`;
        if (context.Visited.has(key)) return false;
        context.Visited.add(key);

        const definition = this.GetRelationDefinition(resourceType, relation);
        if (!definition?.CompositionRule) return false;

        const rule: CompositionRule = JSON.parse(definition.CompositionRule);

        // Evaluate each source in the union — short-circuit on first true
        for (const source of rule.union) {
            if (await this.EvaluateSource(
                source, resourceType, resourceId, relation,
                subjectType, subjectId, context
            )) {
                return true;
            }
        }

        return false;
    }

    private async EvaluateSource(
        source: CompositionSource,
        resourceType: string, resourceId: string, relation: string,
        subjectType: string, subjectId: string,
        context: TraversalContext
    ): Promise<boolean> {
        // Direct tuple check
        if (source.direct) {
            if (await this.EvaluateDirectSource(
                source.direct, resourceType, resourceId, relation,
                subjectType, subjectId, context
            )) {
                return true;
            }
        }

        // Implied relation (e.g. "editor implies viewer")
        if (source.implied) {
            if (await this.Check(
                resourceType, resourceId, source.implied,
                subjectType, subjectId, context
            )) {
                return true;
            }
        }

        // Traversal (e.g. "viewer from parent")
        if (source.traversal) {
            if (await this.EvaluateTraversal(
                source.traversal, resourceType, resourceId,
                subjectType, subjectId, context
            )) {
                return true;
            }
        }

        return false;
    }

    private async EvaluateDirectSource(
        allowedTypes: string[],
        resourceType: string, resourceId: string, relation: string,
        subjectType: string, subjectId: string,
        context: TraversalContext
    ): Promise<boolean> {
        // Check for explicit tuple: resource#relation@subject
        if (await this.HasDirectTuple(resourceType, resourceId, relation, subjectType, subjectId)) {
            return true;
        }

        // Check group membership patterns (e.g. "Team#member")
        for (const allowedType of allowedTypes) {
            if (!allowedType.includes('#')) continue;

            const [groupType, groupRelation] = allowedType.split('#');

            // Find all groups of this type that have the relation on the resource
            const groups = await this.GetSubjectsWithRelation(
                resourceType, resourceId, relation, groupType
            );

            // Check if the subject is a member of any of those groups
            for (const group of groups) {
                if (await this.Check(
                    groupType, group.SubjectResourceID, groupRelation,
                    subjectType, subjectId, context
                )) {
                    return true;
                }
            }
        }

        return false;
    }

    private async EvaluateTraversal(
        traversal: { relation: string; permission: string },
        resourceType: string, resourceId: string,
        subjectType: string, subjectId: string,
        context: TraversalContext
    ): Promise<boolean> {
        // Find all resources related via the structural relation (e.g. "parent")
        const relatedResources = await this.GetRelatedResources(
            resourceType, resourceId, traversal.relation
        );

        // Check the target permission on each related resource
        for (const related of relatedResources) {
            if (await this.Check(
                related.ResourceType, related.ResourceID,
                traversal.permission,
                subjectType, subjectId, context
            )) {
                return true;
            }
        }

        return false;
    }
}
```

Supporting types:

```typescript
export class TraversalContext {
    public readonly Visited: Set<string> = new Set();
    public Depth: number = 0;
    public readonly MaxDepth: number = 15; // Safety limit
}

interface CompositionRule {
    union: CompositionSource[];
}

interface CompositionSource {
    direct?: string[];                                      // e.g. ["User", "Team#member"]
    implied?: string;                                       // e.g. "editor"
    traversal?: { relation: string; permission: string };   // e.g. { relation: "parent", permission: "viewer" }
}
```

### 3.3 Integration with Phase 2 Provider Architecture

The relationship graph does **not** replace the provider architecture — it becomes an **optional backend** that providers can delegate to. This is critical for backwards compatibility:

- **Existing providers** continue working with their specialized tables, unchanged.
- **New or migrated providers** can store relationships as tuples and delegate checks to the `RelationshipResolver`.

Example — migrating `DashboardPermissionProvider` to use ReBAC:

```typescript
@RegisterClass(IPermissionProvider, 'DashboardPermissionProvider')
export class DashboardPermissionProvider implements IPermissionProvider {
    readonly DomainName = 'Dashboard Permissions';
    // ...

    CheckPermission(userId, resourceType, resourceId, action, userRoles): PermissionCheckResult {
        const resolver = RelationshipResolver.Instance;

        // Map permission actions to relation names
        const relationMap: Record<PermissionAction, string> = {
            Read: 'viewer', Create: 'creator', Update: 'editor',
            Delete: 'owner', Share: 'owner', Execute: 'viewer', Admin: 'owner'
        };

        const relation = relationMap[action];
        const allowed = await resolver.Check(
            'Dashboard', resourceId, relation,
            'User', userId, new TraversalContext()
        );

        return {
            Allowed: allowed,
            DomainName: this.DomainName,
            Reason: allowed ? 'Granted via relationship traversal' : 'No relationship path found'
        };
    }
}
```

### 3.4 Bridging Existing MJ Data into Relationship Tuples

MJ's entity metadata system already describes relationships via foreign keys. A sync process could automatically create relationship tuples from existing permission data:

```
DashboardCategoryPermission: Role "Analyst" can view category "Sales"
  → tuple: DashboardCategory:sales-id#viewer@Role:analyst-id

Dashboard "Q1 Report" belongs to category "Sales" (via CategoryID FK)
  → tuple: Dashboard:q1-report-id#parent@DashboardCategory:sales-id

UserRole: Jordan has role "Analyst"
  → tuple: Role:analyst-id#member@User:jordan-id
```

This bridge layer means existing permission data continues to work through the new graph-based system without manual migration of every record.

### 3.5 Mapping Flat MJ Subsystems to Tuples

A common concern is that ReBAC only benefits hierarchical permission models. In practice, **every** existing MJ permission subsystem maps naturally to tuples — flat subsystems are just tuples with no traversal. The tuple model provides a uniform storage and query format regardless of whether hierarchy is involved.

> **Note on tuple syntax**: Tuples use `Object#Relation@Subject` ordering, which is the reverse of English grammar ("Subject Verb Object"). This is because permission checks are typically indexed by the **object** first ("who can access *this resource*?"), so the object-first ordering optimizes for database lookups. To read a tuple in natural English, read right-to-left: `@Role:Developer` **is a** `#reader` **of** `Entity:Users`.

#### Entity Permissions

Today's `EntityPermission` table stores CRUD boolean columns per role:

| EntityID | RoleID | CanRead | CanUpdate | CanCreate | CanDelete |
|---|---|---|---|---|---|
| (Users entity) | (Developer role) | 1 | 1 | 1 | 0 |

That single row expresses four permission statements. As tuples:

```
Entity:Users#reader@Role:Developer
Entity:Users#updater@Role:Developer
Entity:Users#creator@Role:Developer
(no delete tuple — Developer can't delete Users)
```

Combined with the existing role membership:

```
Role:Developer#member@User:jordan-id
```

The engine answers "Can Jordan read the Users entity?" by connecting two tuples:

```
User:jordan ──member of──> Role:Developer ──reader of──> Entity:Users
```

Today, `EntityInfo.GetUserPermissions()` does this same two-hop lookup imperatively by iterating `user.UserRoles`. The tuple model makes the traversal explicit and uniform. For flat entity permissions, this is a lateral move — **but** it opens the door to schema-level hierarchy if needed later (e.g., "grant read on all entities in the Sales schema").

#### Authorizations

Today's `Authorization` + `AuthorizationRole` tables:

| Authorization.Name | AuthorizationRole.RoleID | AuthorizationRole.Type |
|---|---|---|
| "Can Execute Actions" | (Developer role) | Allow |
| "Can Execute Actions" | (Intern role) | Deny |

As tuples:

```
Authorization:CanExecuteActions#executor@Role:Developer        (Allow)
Authorization:CanExecuteActions#denied_executor@Role:Intern    (Deny)
```

Authorizations also have a **parent-child hierarchy** (`ParentID` on the `Authorization` table) that `AuthorizationInfo.UserCanExecute()` does not currently traverse. With tuples, you add structural relationships:

```
Authorization:CanExecuteActions#parent@Authorization:AIFeatures
Authorization:CanRunAgents#parent@Authorization:AIFeatures
```

And define that `executor` cascades from parent:

```
Authorization.executor = direct assignment OR executor from parent
```

Now granting `Authorization:AIFeatures#executor@Role:Developer` automatically grants executor on "Can Execute Actions" and "Can Run Agents" — without creating separate `AuthorizationRole` records for each child.

#### AI Agent Permissions

Today's `AIAgentPermission` table supports both user and role grantees:

| AgentID | UserID | RoleID | CanView | CanRun | CanEdit | CanDelete |
|---|---|---|---|---|---|---|
| (CodeReviewer) | jordan-id | NULL | 1 | 1 | 0 | 0 |
| (CodeReviewer) | NULL | (Developer) | 1 | 1 | 1 | 0 |

As tuples:

```
AIAgent:CodeReviewer#viewer@User:jordan
AIAgent:CodeReviewer#runner@User:jordan
AIAgent:CodeReviewer#viewer@Role:Developer
AIAgent:CodeReviewer#runner@Role:Developer
AIAgent:CodeReviewer#editor@Role:Developer
```

This is flat and direct — same data, different shape. But AI Agents have **types** (`AIAgentType`). With tuples, you can express type-level permissions:

```
AIAgentType:Analysis#runner@Role:Developer
AIAgent:DataAnalyzer#type@AIAgentType:Analysis
AIAgent:TrendSpotter#type@AIAgentType:Analysis
```

With a composition rule:

```
AIAgent.runner = direct assignment OR runner from type
```

Now adding a new Analysis-type agent automatically inherits the "Developers can run" permission — no need to create per-agent `AIAgentPermission` rows.

#### Summary: When Tuples Add Value vs. When They're Lateral

| Subsystem | Has Hierarchy? | Tuple Benefit |
|---|---|---|
| Entity Permissions | Not today (could add schema-level) | Lateral move unless schema hierarchy is added |
| Authorizations | Yes (ParentID exists, not traversed today) | **Unlocks parent→child cascade** that's currently missing |
| Dashboard Permissions | Yes (categories) | **Unlocks category→dashboard cascade** |
| AI Agent Permissions | Yes (agent types) | **Unlocks type→agent cascade** |
| Artifact/Collection Perms | Yes (collection→artifact) | **Unlocks collection→artifact cascade** |
| Application Roles | Not today | Lateral move |
| Query Permissions | No | Lateral move |
| Access Control Rules | No | Lateral move |

The recommendation remains: **start ReBAC with subsystems that have natural hierarchy** (Dashboards, Authorizations, AI Agents, Artifacts) and leave flat subsystems on their existing tables unless a hierarchy need emerges.

### 3.6 Performance: Caching Architecture for Graph Traversal

Graph traversal can be expensive — each hop in the relationship graph is potentially a database query. This section explains how production systems solve this problem, how MJ's existing caching infrastructure maps to those solutions, and provides a concrete caching design for the `RelationshipResolver`.

#### The Problem

In the "Can Sarah view Pipeline Forecast?" example, the engine makes 4 hops. Each hop is at minimum one database lookup. For a single check that's fine, but consider:

- The Sharing Center's "User Access Report" checks permissions across **every resource in every domain** for a single user
- A page load in MJExplorer might check 20+ permissions (nav items, buttons, entities, dashboards)
- An API request listing dashboards must filter by permission — a check **per dashboard**

At Google's scale (billions of tuples, millions of checks/second), naive traversal would be impossibly slow. Their solution is "leopard indexing."

#### How Zanzibar's Leopard Indexing Works

The idea is conceptually straightforward: **precompute and cache the results of graph traversals so you don't have to walk the graph at query time.**

**Layer 1 — Group Expansion**

For every user, precompute which groups they belong to, recursively:

```
User:Sarah → expands to → [User:Sarah, Role:Analyst, Role:UI, Team:SalesTeam]
```

This handles the "member of" hops. Instead of traversing `User → Role → ...` at query time, look up Sarah's expanded set directly. This is cached and invalidated when group membership changes.

**Layer 2 — Relationship Path Caching**

For frequently accessed resources, cache the result of the full traversal:

```
Cache key:   (Dashboard:PipelineForecast, viewer, User:Sarah)
Cache value: { Allowed: true, ContributingTuples: [tuple-1, tuple-2, tuple-3, tuple-4] }
```

Or inverted — for a given user, cache what they can access:

```
Cache key:   (User:Sarah, viewer, Dashboard)
Cache value: [Dashboard:Q1Revenue, Dashboard:PipelineForecast, ...]
```

**Cache Invalidation**

When a tuple changes, which cached results are affected? Zanzibar tracks **which tuples contributed to each cached result**. When a tuple is added or removed, it invalidates only the cached results that depended on that tuple:

```
Tuple removed: Role:Analyst#member@User:Sarah
  → Invalidate: Sarah's group expansion cache
  → Invalidate: Every cached permission result where Sarah's access depended on the Analyst role
```

The "leopard" part is about doing this invalidation efficiently — maintaining a reverse index from tuples to cached results, so you don't have to scan the entire cache.

Zanzibar also uses a **timestamp-based approach** called "zookies" (Zanzibar cookies). Every permission check returns a token representing "the state of the world at this point in time." Subsequent checks can say "give me a result at least as fresh as this token." This allows serving slightly stale cached results when freshness requirements allow it, avoiding thundering herd problems when a popular tuple changes.

#### How MJ's Existing Caching Maps to Zanzibar

MJ's `BaseEngine` caching already provides the foundation for both layers:

| MJ Cache Feature | Zanzibar Equivalent |
|---|---|
| `UserInfoEngine` caches user roles in memory at startup | Layer 1 — group expansion |
| BaseEntity event-driven invalidation (`AfterSave`, `AfterDelete`) | Tuple change → cache invalidation |
| `RunView` auto-cache for small, unfiltered result sets | Tuple table caching (if small enough) |
| `TrustLocalCacheCompletely = true` on server | "Serve from cache without re-checking DB" |

**The gap is Layer 2** — MJ caches raw data (entity records, role lists) but not computed permission results. The `RelationshipResolver` needs a result cache that stores "Can X do Y on Z?" answers and invalidates them when contributing tuples change.

#### Concrete Design: Three-Tier Permission Cache

**Tier 1 — Group Expansion (already exists in MJ)**

`UserInfoEngine` loads all `UserRole` records at startup and caches them. When the resolver needs to check "is Sarah a member of Role:Analyst?", it checks the cached role list instead of querying the database. The only addition needed is invalidating the resolver's result cache when `UserInfoEngine` detects a role membership change:

```typescript
// In UserInfoEngine, when role data is refreshed:
public override async Config(forceRefresh?, contextUser?, provider?) {
    await super.Config(forceRefresh, contextUser, provider);

    if (forceRefresh) {
        // Role memberships may have changed — invalidate permission results
        // that depended on role traversals
        RelationshipResolver.Instance.InvalidateAllRoleResults();
    }
}
```

**Tier 2 — Tuple Lookup Cache (natural extension of MJ caching)**

Cache all `PermissionRelationTuple` records in memory (via `BaseEngine` data loading) so that `HasDirectTuple()` is a `Map` lookup instead of a database query. Invalidate via BaseEntity events on the tuple entity. This is identical to how MJ already caches entity metadata, application roles, etc.

**Tier 3 — Traversal Result Cache (new layer)**

Cache the boolean results of full graph traversals, along with which tuples contributed to each result:

```typescript
export class RelationshipResolver extends BaseSingleton<RelationshipResolver> {
    // Cache: "Can subject S do relation R on resource X?" → result
    // Key format: "resourceType:resourceId#relation@subjectType:subjectId"
    private _resultCache: Map<string, CachedPermissionResult> = new Map();

    public async Check(
        resourceType: string, resourceId: string, relation: string,
        subjectType: string, subjectId: string,
        context: TraversalContext
    ): Promise<boolean> {
        const cacheKey = `${resourceType}:${resourceId}#${relation}@${subjectType}:${subjectId}`;

        // Check cache first
        const cached = this._resultCache.get(cacheKey);
        if (cached && !this.IsExpired(cached)) {
            return cached.Allowed;
        }

        // Cache miss — do the full traversal
        const result = await this.ResolveCheck(
            resourceType, resourceId, relation,
            subjectType, subjectId, context
        );

        // Cache the result along with which tuples contributed to it
        this._resultCache.set(cacheKey, {
            Allowed: result.Allowed,
            ContributingTupleIDs: result.ContributingTuples,
            CachedAt: Date.now()
        });

        return result.Allowed;
    }
}

interface CachedPermissionResult {
    Allowed: boolean;
    ContributingTupleIDs: string[];  // Which tuples were traversed to produce this result
    CachedAt: number;
}
```

**Cache Invalidation via BaseEntity Events**

When a `PermissionRelationTuple` is saved or deleted, invalidate any cached results that depended on it:

```typescript
// On the PermissionRelationTuple entity subclass
@RegisterClass(BaseEntity, 'MJ: Permission Relation Tuples')
export class PermissionRelationTupleEntity extends PermissionRelationTupleEntity_ {

    override async AfterSave(): Promise<boolean> {
        RelationshipResolver.Instance.InvalidateTuple(this.ID);
        return true;
    }

    override async AfterDelete(): Promise<boolean> {
        RelationshipResolver.Instance.InvalidateTuple(this.ID);
        return true;
    }
}
```

In the resolver:

```typescript
public InvalidateTuple(tupleId: string): void {
    // Find all cached results that depended on this tuple and remove them
    for (const [key, cached] of this._resultCache) {
        if (cached.ContributingTupleIDs.includes(tupleId)) {
            this._resultCache.delete(key);
        }
    }
}

public InvalidateAllRoleResults(): void {
    // Role membership changed — invalidate all cached results
    // (conservative but safe; a more targeted approach would track
    // which results involved role traversals)
    this._resultCache.clear();
}
```

#### Summary: Three Tiers from Cheapest to Most Expensive

| Tier | What's Cached | Cache Hit Cost | Cache Miss Cost | Invalidation Trigger |
|---|---|---|---|---|
| 1. Group expansion | User → [all roles/teams] | In-memory Map lookup | 1 DB query (RunView on UserRole) | UserRole entity save/delete |
| 2. Tuple lookup | "Does tuple X exist?" | In-memory Map lookup | 1 DB query | PermissionRelationTuple save/delete |
| 3. Traversal result | "Can Sarah view PipelineForecast?" → boolean | In-memory Map lookup | Full graph walk (multiple hops) | Any contributing tuple save/delete |

Tiers 1 and 2 are direct extensions of what MJ already does with `BaseEngine` caching. Tier 3 is the new layer that makes ReBAC performant. All three tiers use the same invalidation mechanism (BaseEntity events) that MJ's caching infrastructure already supports.

#### What MJ Does NOT Need from Zanzibar

Several Zanzibar features solve problems that don't exist at MJ's scale:

| Zanzibar Feature | What It Solves | Why MJ Doesn't Need It |
|---|---|---|
| Zookies / consistency tokens | Distributed cache consistency across data centers | MJ runs a single server process with one in-memory cache |
| Reverse tuple indexing | O(1) invalidation when cache has billions of entries | MJ's cache will have thousands of entries; linear scan in a `Map` takes microseconds |
| Sharded tuple storage | Partitioning billions of tuples across multiple databases | MJ stores everything in one SQL Server instance |
| Leopard locality-aware distribution | Minimizing network hops across peer nodes | Single-process server, no peer distribution |

These features would become relevant if MJ ever needed to support millions of concurrent users with billions of permission relationships. At that point, evaluating SpiceDB or OpenFGA as an external authorization service (rather than building deeper into the MJ codebase) would likely be more practical.

---

## 4. Declarative Policy Language — Future Consideration

### What It Is

Systems like **OPA (Open Policy Agent)** with Rego, **Cedar** (Amazon's authorization language), and **Casbin** allow writing authorization rules as declarative policies rather than imperative code:

```cedar
// Cedar example
permit(
    principal in Group::"analysts",
    action == Action::"view",
    resource in Folder::"finance"
) when {
    resource.classification != "top-secret"
};
```

### How MJ Compares

The Phase 2 plan uses imperative TypeScript code in each provider class. Authorization logic is distributed across `EntityPermissionProvider.CheckPermission()`, `DashboardPermissionProvider.CheckPermission()`, etc.

### Trade-offs

| Aspect | Imperative (MJ Plan) | Declarative (OPA/Cedar) |
|---|---|---|
| Developer familiarity | High — it's just TypeScript | Lower — new language to learn |
| Auditability | Must read code across provider classes | Single policy file, auditor-friendly |
| Runtime flexibility | Requires code deployment to change | Policies can be updated without redeploy |
| Type safety | Full TypeScript checking | Separate validation tooling |
| Compliance | Harder to prove to auditors | Designed for compliance review |

### Recommendation

**Not needed for Phase 2.** The imperative provider approach is the right choice for MJ's current stage. A declarative policy layer could be considered as a Phase 3 addition if MJ moves into compliance-heavy enterprise environments (healthcare, finance, government) where auditors need to review authorization rules without reading TypeScript.

If pursued in the future, the `CompositionRule` JSON in the ReBAC proposal (Section 3.1) is already a step in this direction — it's a declarative rule evaluated by a generic engine rather than hardcoded in a provider class.

---

## 5. Cross-Domain Permission Enumeration — Scalability Considerations

### The Problem: Enumeration vs. Checking

The original plan's `PermissionEngine` includes a `GetAllUserPermissions()` method that aggregates across all providers to answer "what can User X access?" This is a fundamentally different (and harder) problem than a permission check.

**Permission check** ("Can Sarah view Pipeline Forecast?") — scoped to one resource, one user. With caching, this is a constant-time lookup or a short graph walk. Cost: **O(graph depth)**, typically 1-5 hops.

**Permission enumeration** ("What can Sarah access?") — unbounded. Must evaluate every resource across every domain. Cost: **O(domains × resources-per-domain × check-cost-per-resource)**. For a user with the Developer role in a typical MJ deployment:

| Domain | Resources to Evaluate | Check Cost Each | Subtotal |
|---|---|---|---|
| Entity Permissions | ~200 entities | 1 hop (role → entity) | ~200 checks |
| Dashboards | ~50 dashboards | 1-4 hops (category traversal) | 50-200 checks |
| AI Agents | ~30 agents | 1-3 hops (type traversal) | 30-90 checks |
| Authorizations | ~20 authorizations | 1-3 hops (parent traversal) | 20-60 checks |
| Applications | ~8 apps | 1 hop | ~8 checks |
| Collections/Artifacts | ~100 artifacts | 1-3 hops | 100-300 checks |
| Other subsystems | ~50 resources | 1 hop | ~50 checks |
| **Total** | | | **~500-900 checks** |

At current MJ scale, this completes in 1-3 seconds with the Tier 1-2 caching from Section 3.6. But it scales linearly with resource count — if dashboards grow to 500, entities to 2,000, or artifacts to 10,000, enumeration time grows proportionally.

ReBAC makes this worse before it makes it better: a flat SQL query like `SELECT EntityID FROM EntityPermission WHERE RoleID = @id AND CanRead = 1` becomes a reverse graph walk that must expand group memberships and follow structural relationships backwards.

### How Production Systems Handle This

| System | Approach | Freshness | Latency |
|---|---|---|---|
| SpiceDB | `LookupResources` API — streams results progressively, supports timeouts and cursors | Real-time | Progressive (first results in ms, full set may take seconds) |
| AWS IAM Access Analyzer | Background job computes access reports on a schedule; admin console reads precomputed results | Minutes stale | Instant read |
| Zanzibar | Reverse-index expansion precomputes reachable resources per subject; updated on tuple writes | Near real-time | Fast read, slower write |
| Keycloak | Policy evaluation per-resource with pagination; admin API supports filtered queries | Real-time | Scales with filter specificity |

### Recommended Architecture for MJ

Rather than a single monolithic enumeration call, design the API around **scoped, domain-filtered queries** that the UI can compose as needed.

#### Design 1: Domain-Scoped Enumeration

Replace a single cross-domain call with per-domain queries that the Sharing Center (or any consumer) calls independently:

```typescript
/**
 * Get all resources a user can access within a specific domain.
 * Scoped queries are fast because they hit one provider and one
 * set of cached data.
 */
public GetUserResourcesForDomain(
    userId: string,
    userRoles: UserRoleInfo[],
    domainName: string,
    options?: {
        ResourceType?: string;   // Further narrow within the domain
        Action?: PermissionAction; // e.g. only resources they can Edit
        Offset?: number;
        Limit?: number;
    }
): NormalizedPermission[] {
    const provider = this._providers.get(domainName);
    if (!provider) return [];
    return provider.GetUserResources(userId, userRoles, options);
}

/**
 * Get a summary count of accessible resources per domain.
 * Much cheaper than full enumeration — each provider just counts
 * matching records without building full NormalizedPermission objects.
 */
public GetUserPermissionSummary(
    userId: string,
    userRoles: UserRoleInfo[]
): DomainPermissionSummary[] {
    const summaries: DomainPermissionSummary[] = [];
    for (const [name, provider] of this._providers) {
        summaries.push({
            DomainName: name,
            AccessibleResourceCount: provider.CountUserResources(userId, userRoles),
            SupportedActions: provider.SupportedActions
        });
    }
    return summaries;
}

interface DomainPermissionSummary {
    DomainName: string;
    AccessibleResourceCount: number;
    SupportedActions: PermissionAction[];
}
```

The Sharing Center UI would:
1. Call `GetUserPermissionSummary()` to render the collapsible section headers with counts ("Entity Permissions (142 entities)", "Dashboards (8 dashboards)")
2. When a user expands a section, call `GetUserResourcesForDomain()` for just that domain
3. Each section loads independently — no single call blocks on all domains

This is the same progressive-loading pattern that SpiceDB uses with streaming, adapted to MJ's request/response model.

#### Design 2: Instrumented Enumeration with Budgets

For cases where a full cross-domain enumeration is genuinely needed (e.g., CSV export, compliance reporting), add a time budget and per-provider instrumentation:

```typescript
public async EnumerateAllUserPermissions(
    userId: string,
    userRoles: UserRoleInfo[],
    options?: {
        TimeBudgetMs?: number;     // Stop after this many ms (default: 10000)
        DomainFilter?: string[];   // Only query specific domains
    }
): Promise<EnumerationResult> {
    const budget = options?.TimeBudgetMs ?? 10000;
    const startTime = Date.now();
    const results: NormalizedPermission[] = [];
    const domainTimings: Record<string, number> = {};
    let timedOut = false;

    const domains = options?.DomainFilter
        ? [...this._providers].filter(([name]) => options.DomainFilter!.includes(name))
        : [...this._providers];

    for (const [name, provider] of domains) {
        if (Date.now() - startTime > budget) {
            timedOut = true;
            break;
        }

        const providerStart = Date.now();
        results.push(...provider.GetUserResources(userId, userRoles));
        domainTimings[name] = Date.now() - providerStart;
    }

    return {
        Permissions: results,
        Complete: !timedOut,
        DomainTimings: domainTimings,
        TotalElapsedMs: Date.now() - startTime
    };
}

interface EnumerationResult {
    Permissions: NormalizedPermission[];
    Complete: boolean;                     // false if time budget was exceeded
    DomainTimings: Record<string, number>; // ms per provider, for diagnostics
    TotalElapsedMs: number;
}
```

The time budget prevents runaway enumeration from blocking the server. The `DomainTimings` output identifies which provider is the bottleneck if performance degrades, directing optimization effort to the right place.

#### Design 3: Background Materialization (Future, If Needed)

If scoped queries and budgeted enumeration prove insufficient at scale, add a materialized access report computed on demand and cached. The report would be invalidated by the same BaseEntity events that drive the Tier 3 traversal cache (Section 3.6), and the admin UI would show a "last computed" timestamp with a manual refresh option — the same pattern AWS IAM Access Analyzer uses.

This should only be built if instrumentation from Design 2 shows consistent budget overruns at real-world deployment scale.

---

## 6. Summary of Recommendations

| # | Recommendation | Priority | When to Implement | Impact |
|---|---|---|---|---|
| 1 | Add ReBAC tables (`PermissionResourceType`, `PermissionRelationDefinition`, `PermissionRelationTuple`) | High | Phase 2b | Enables hierarchical permission traversal, eliminates per-provider cascade logic |
| 2 | Build `RelationshipResolver` graph traversal engine | High | Phase 2b | Core runtime for ReBAC checks |
| 3 | Implement three-tier caching (group expansion, tuple lookup, traversal result) with BaseEntity event invalidation (see Section 3.6) | High | Phase 2b-2c | Makes ReBAC performant without external dependencies |
| 4 | Migrate Dashboard Permissions as first ReBAC-backed provider | Medium | Phase 2c | Proves the pattern on a real subsystem with natural hierarchy |
| 5 | Replace monolithic cross-domain enumeration with domain-scoped queries and budgeted enumeration (see Section 5) | Medium | Phase 2a | Prevents scalability bottleneck; enables progressive UI loading |
| 6 | Consider declarative policy language | Low | Phase 3 (future) | Only needed for compliance-heavy enterprise deployments |

### Proposed Revised Phasing

```
Phase 1   — Application Roles ✅ COMPLETED (unchanged from original plan)

Phase 2a  — Provider architecture + PermissionEngine + basic Sharing Center
            (unchanged from original plan)

Phase 2b  — Full provider coverage + Deny support
            NEW: Add ReBAC schema (PermissionResourceType, PermissionRelationDefinition,
                 PermissionRelationTuple) and RelationshipResolver engine
            NEW: Implement Tier 1 (group expansion via UserInfoEngine — already exists)
                 and Tier 2 (tuple lookup cache via BaseEngine data loading) caching
            NEW: Add pagination to GetUserResources()

Phase 2c  — Advanced features + server-side enforcement
            NEW: Migrate DashboardPermissionProvider to ReBAC as proof-of-concept
            NEW: Implement Tier 3 traversal result caching with BaseEntity event
                 invalidation on PermissionRelationTuple
            NEW: Bridge existing permission data into relationship tuples

Phase 2d  — (new) Expand ReBAC to other hierarchical subsystems
            Migrate: Artifacts/Collections, Authorizations (parent-child), AI Agents (types)
            Evaluate: Whether remaining flat subsystems (Entity Permissions, Query Permissions,
                      Access Control Rules) benefit from migration

Phase 3   — (future, if needed) Declarative policy language for compliance
```

---

## Appendix A: Reference Material

### Authorization Systems Referenced

| System | Type | Documentation |
|---|---|---|
| Google Zanzibar | ReBAC (paper) | [research.google/pubs/zanzibar](https://research.google/pubs/zanzibar/) |
| SpiceDB (AuthZed) | ReBAC (open source) | [authzed.com/docs](https://authzed.com/docs) |
| OpenFGA (Auth0) | ReBAC (open source) | [openfga.dev/docs](https://openfga.dev/docs) |
| OPA / Rego | Policy engine | [openpolicyagent.org](https://www.openpolicyagent.org/) |
| Cedar (AWS) | Policy language | [cedarpolicy.com](https://www.cedarpolicy.com/) |
| Casbin | Policy engine | [casbin.org](https://casbin.org/) |
| ASP.NET Core Authorization | Handler pattern | Microsoft Docs |
| Spring Security | Voter pattern | Spring Docs |
| XACML | Policy standard | OASIS Standard |

### Key Terminology

| Term | Definition |
|---|---|
| **ReBAC** | Relationship-Based Access Control — authorization decisions derived from traversing a graph of relationships between subjects and resources |
| **Relation Tuple** | A single edge in the authorization graph: `resource#relation@subject` |
| **Composition Rule** | A declarative definition of how a relation resolves — via direct assignment, implication from a stronger relation, or traversal through a structural relationship |
| **Implied Relation** | A relation that is automatically granted by holding a stronger relation (e.g., all editors are also viewers) |
| **Traversal** | Following a structural relationship (like `parent`) to check permissions on a related resource |
| **Materialized Permissions** | A denormalized cache of computed permission results, rebuilt when the underlying tuples change |
