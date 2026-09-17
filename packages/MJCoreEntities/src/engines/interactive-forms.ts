import { BaseEngine, BaseEnginePropertyConfig, IMetadataProvider, UserInfo } from "@memberjunction/core";
import { NormalizeUUID, UUIDsEqual } from "@memberjunction/global";
import type { Observable } from "rxjs";
import type { MJComponentEntity, MJEntityFormContributionEntity, MJEntityFormOverrideEntity } from "../generated/entity_subclasses";

/**
 * Cache of MemberJunction interactive-form metadata: the form-role
 * `MJ: Components` rows and their `MJ: Entity Form Overrides`. Designed
 * to be the single source of truth for **both** the Form Studio
 * authoring surface and the runtime form resolver.
 *
 * ## Why this engine exists
 *
 * Before this engine, three independent paths competed:
 *
 *   1. The cockpit's `loadExistingForms()` — RunView, no cache, manual
 *      reload after every mutation. Routinely raced BaseEntity events
 *      and produced "couldn't load form X" toasts after delete because
 *      the event handler's reload happened before the post-delete
 *      reload could land.
 *   2. `FormResolverService` — RunView per render to find the right
 *      override for an (entity, user) pair. ~50ms cold latency on every
 *      Explorer form open.
 *   3. `ComponentMetadataEngine` — caches library / registry catalog
 *      data but **deliberately omits** `MJ: Components` themselves
 *      because the full Component table includes ~150MB of `Specification`
 *      JSON across non-form types (Skip artifacts, dashboards, etc.).
 *
 * This engine threads the needle: load `Type='Form'` Components plus only the
 * widgets that a `MJ: Entity Form Contributions` row actually references
 * (small dataset — a few dozen per typical deployment, ~5MB max). It deliberately
 * does NOT load every `Type='Widget'` row: `Widget` is an open set grown by
 * registry sync and general authoring, unrelated to form-panel adoption, and this
 * cache is written to client local storage on every boot. Scoping by reference
 * keeps the set proportional to the feature's use. Plus
 * **all** `EntityFormOverride` rows (tiny). Specification is included
 * because the cockpit + Skip rendering both need it. Loaded as
 * `entity_object` so callers can call `.Save()` / `.Delete()` on the
 * cached instances directly.
 *
 * ## Reactivity for free
 *
 * BaseEngine handles the reactive plumbing — there is **no manual
 * invalidation code in this engine**:
 *
 *   - The `Configs` array passed to `Load()` tells BaseEngine which
 *     entities to subscribe to via the global MJEventType.ComponentEvent
 *     bus. Save / delete / remote-invalidate events for `MJ: Components`
 *     or `MJ: Entity Form Overrides` automatically refresh the matching
 *     in-memory array (or apply an in-place mutation when possible).
 *   - Each property has a lazy `BehaviorSubject` exposed via
 *     `ObserveProperty(propertyName)`. Subscribers receive the current
 *     array immediately and re-receive it on every mutation.
 *   - Convenience getters `Forms$` and `Overrides$` wrap
 *     `ObserveProperty` for ergonomic Angular `async`-pipe consumption.
 *
 * ## Lazy load pattern
 *
 * Always called as `await InteractiveFormsEngine.Instance.Config(false)`
 * before reading state. BaseEngine.Config is a no-op when already loaded
 * (forceRefresh=false), so callers can sprinkle the call at every entry
 * point without worrying about cost — first caller pays the load
 * (~1 RunView per entity), everyone else gets cache hits. Users who
 * never touch Form Studio pay nothing.
 *
 * ## Where to use it
 *
 *   - Form Studio cockpit (`form-builder-resource.component.ts`): replace
 *     `loadExistingForms()` / `loadVersionsForActiveForm()` with
 *     subscriptions to `Forms$`. Mutations elsewhere (agent saves,
 *     other browser tabs via remote-invalidate, etc.) refresh the
 *     UI automatically.
 *   - `FormResolverService`: replace per-resolution RunView with
 *     `GetActiveOverrideForEntity()` in-memory lookup. Sub-ms instead
 *     of ~50ms.
 *   - Form Builder agent's deterministic Builder: no explicit
 *     refresh needed after `Create`/`Modify Interactive Form` — the
 *     BaseEntity events those actions raise drive the cache update.
 */
export class InteractiveFormsEngine extends BaseEngine<InteractiveFormsEngine> {
    /** Standard singleton accessor — never construct directly. */
    public static get Instance(): InteractiveFormsEngine {
        return super.getInstance<InteractiveFormsEngine>();
    }

    /**
     * Instance-level kill switch for metadata-registered form contributions.
     *
     * When false the engine loads no contribution rows and keeps the Components filter
     * narrow, so every consumer sees exactly the pre-feature behavior: compiled
     * `BaseFormPanel` registrations only. This is the rollback path for a bad load or a
     * misbehaving panel — no migration, no deployment of a code change.
     *
     * Seeded from `MJ_FORMS_METADATA_CONTRIBUTIONS=false` where an environment exists
     * (server, CLI); a browser host can set it directly before the first `Config()`.
     */
    private static _metadataContributionsEnabled: boolean = InteractiveFormsEngine.readContributionsFlag();

    public static get MetadataContributionsEnabled(): boolean {
        return InteractiveFormsEngine._metadataContributionsEnabled;
    }
    public static set MetadataContributionsEnabled(value: boolean) {
        InteractiveFormsEngine._metadataContributionsEnabled = value;
    }

    private static readContributionsFlag(): boolean {
        // Guarded: this class runs in the browser too, where `process` does not exist.
        const env = typeof process !== 'undefined' ? process?.env?.MJ_FORMS_METADATA_CONTRIBUTIONS : undefined;
        if (env === undefined || env === null || env.trim().length === 0) return true;
        const v = env.trim().toLowerCase();
        return !(v === 'false' || v === '0' || v === 'off' || v === 'no');
    }

    private _forms: MJComponentEntity[] = [];
    private _overrides: MJEntityFormOverrideEntity[] = [];
    private _contributions: MJEntityFormContributionEntity[] = [];

    /**
     * Lazy-load the form Component + override caches. Safe to call from
     * every entry point — no-op if already loaded (unless `forceRefresh`).
     */
    public async Config(
        forceRefresh?: boolean,
        contextUser?: UserInfo,
        provider?: IMetadataProvider,
    ): Promise<void> {
        const contributionsEnabled = InteractiveFormsEngine.MetadataContributionsEnabled;
        const c: Partial<BaseEnginePropertyConfig>[] = [
            {
                Type: 'entity',
                EntityName: 'MJ: Components',
                PropertyName: '_forms',
                // Whole forms only — deliberately NOT widened to all widgets: `Widget` is an
                // open set grown by registry sync and general authoring, and this cache is
                // written to client local storage on every boot.
                //
                // A contribution's panel Component (Type='Widget') is therefore NOT in this
                // cache; `InteractiveFormPanelComponent` fetches the single component it needs
                // by ID. An earlier version scoped this filter with a subquery over
                // `vwEntityFormContributions`, which is worse in every way that matters: the
                // view name resolves against the connecting user's default schema rather than
                // the core schema, and a filter that fails takes the WHOLE engine down with it
                // — every form then waits on a cache that never loads. Loading exactly the
                // components that render, lazily, needs no cross-schema SQL at all.
                Filter: "Type='Form'",
                CacheLocal: true,
            },
            {
                Type: 'entity',
                EntityName: 'MJ: Entity Form Overrides',
                PropertyName: '_overrides',
                CacheLocal: true,
            },
        ];
        if (contributionsEnabled) {
            c.push({
                Type: 'entity',
                EntityName: 'MJ: Entity Form Contributions',
                PropertyName: '_contributions',
                CacheLocal: true,
            });
        }
        await this.Load(c, provider, forceRefresh, contextUser);
    }

    // ─── Read-side accessors ────────────────────────────────────────────────

    /** All cached form-role Components. */
    public get Forms(): MJComponentEntity[] {
        return this.GetConfigData<MJComponentEntity>('_forms');
    }

    /** All cached EntityFormOverride rows (all scopes — caller filters). */
    public get Overrides(): MJEntityFormOverrideEntity[] {
        return this.GetConfigData<MJEntityFormOverrideEntity>('_overrides');
    }

    /**
     * RxJS Observable of the forms array. Emits the current array on
     * subscribe (BehaviorSubject semantics) and re-emits on every save /
     * delete / remote-invalidate that affects `MJ: Components`. Use this
     * in Angular components for auto-refreshing UIs:
     *
     * ```ts
     * forms$ = InteractiveFormsEngine.Instance.Forms$.pipe(
     *   map(forms => forms.filter(f => f.Type === 'Form'))
     * );
     * ```
     */
    public get Forms$(): Observable<MJComponentEntity[]> {
        return this.ObserveProperty<MJComponentEntity>('_forms');
    }

    /** RxJS Observable of the overrides array — same reactivity contract as `Forms$`. */
    public get Overrides$(): Observable<MJEntityFormOverrideEntity[]> {
        return this.ObserveProperty<MJEntityFormOverrideEntity>('_overrides');
    }

    // ─── Convenience queries ────────────────────────────────────────────────

    /**
     * Return the override rows for a specific user (User-scope only).
     * Roles + Global overrides are filtered out — they're per-policy,
     * not per-user. Use {@link GetActiveOverrideForEntity} when you need
     * the resolver-style lookup that considers all scopes.
     */
    public GetUserOverrides(userID: string): MJEntityFormOverrideEntity[] {
        if (!userID) return [];
        return this.Overrides.filter(o =>
            o.Scope === 'User' && o.UserID && UUIDsEqual(o.UserID, userID),
        );
    }

    /**
     * All cached EntityFormContribution rows (all scopes, all statuses — callers filter).
     *
     * Returns nothing while the kill switch is off. Dropping the entity from the load list is
     * not enough on its own: a process that already loaded rows would keep serving them from
     * the engine's data map, so the switch would appear to do nothing until a restart. The
     * rollback path has to work in the process that is misbehaving.
     */
    public get Contributions(): MJEntityFormContributionEntity[] {
        if (!InteractiveFormsEngine.MetadataContributionsEnabled) return [];
        return this.GetConfigData<MJEntityFormContributionEntity>('_contributions');
    }

    /** Emits on every save / delete / remote-invalidate that touches `MJ: Entity Form Contributions`. */
    public get Contributions$(): Observable<MJEntityFormContributionEntity[]> {
        return this.ObserveProperty<MJEntityFormContributionEntity>('_contributions');
    }

    /**
     * True once the contribution cache has completed its first load.
     *
     * Slot hosts wait on this before the first mount: rendering compiled contributions and
     * then adding rows a tick later is visible, and for a `bare` hero that replaces a baked
     * section it means the user watches the Details panel render and then disappear.
     */
    public get ContributionsReady(): boolean {
        return this.Loaded || this.IsPermissionConstrained;
    }

    /**
     * Entities whose forms never carry a Global or Role contribution, whatever wrote the row.
     *
     * A contribution places a runtime-interpreted React spec on a form; on an identity or
     * authorization surface that is the one place it must not happen silently for other
     * people. A user may still place a `User`-scope contribution on their own form.
     */
    private static readonly RESTRICTED_CONTRIBUTION_ENTITIES: ReadonlySet<string> = new Set([
        'mj: users', 'mj: roles', 'mj: user roles', 'mj: authorizations', 'mj: authorization roles',
    ]);

    /**
     * The clamp is applied here, on the read path, rather than at the write paths.
     * The action family already forces `Scope='User'` on every write, so a check there can
     * never fire, and `mj sync` — the path an OpenApp actually uses — bypasses actions
     * altogether. Filtering where the rows are consumed covers every writer, including
     * direct SQL, and cannot be routed around.
     */
    private static scopeAllowedOnEntity(entityName: string | null, scope: string): boolean {
        if (scope === 'User') return true;
        const name = (entityName ?? '').trim().toLowerCase();
        return !InteractiveFormsEngine.RESTRICTED_CONTRIBUTION_ENTITIES.has(name);
    }

    /**
     * Active contribution rows that apply to (entity, user, roles): User rows for this
     * user, Role rows for any of the user's roles, and Global rows. Sorted by
     * `Precedence` DESC then `SortKey` DESC. Last-wins collapse against compiled
     * registrations happens in ng-base-forms, not here.
     */
    public GetApplicableContributions(
        entityID: string,
        userID: string,
        roleIDs: ReadonlyArray<string>,
    ): MJEntityFormContributionEntity[] {
        if (!entityID) return [];
        const rows = this.Contributions.filter(c =>
            c.EntityID && UUIDsEqual(c.EntityID, entityID)
            && c.Status === 'Active'
            && InteractiveFormsEngine.scopeAllowedOnEntity(c.Entity, c.Scope)
            && (
                (c.Scope === 'User'   && !!c.UserID && !!userID && UUIDsEqual(c.UserID, userID)) ||
                (c.Scope === 'Role'   && !!c.RoleID && roleIDs.some(r => UUIDsEqual(r, c.RoleID as string))) ||
                (c.Scope === 'Global')
            ),
        );
        return rows.sort((a, b) => {
            const p = (b.Precedence ?? 0) - (a.Precedence ?? 0);
            if (p !== 0) return p;
            return (b.SortKey ?? 0) - (a.SortKey ?? 0);
        });
    }

    /**
     * Find any cached form or panel Component by ID. `FindFormByID` remains as an alias —
     * the cache now also holds the widget Components that contributions reference.
     */
    public FindComponentByID(id: string): MJComponentEntity | undefined {
        return this.FindFormByID(id);
    }


    /**
     * Resolver-style lookup matching the runtime form-resolver's scope
     * priority: User > Role > Global. Returns the highest-priority
     * Active override for the given (entity, user, roles) tuple, or null
     * if none match. Within the same scope, lower `Priority` wins (the
     * resolver convention — Priority is sort key, not boost).
     *
     * @param entityID The target `MJ: Entities.ID`.
     * @param userID The current user's `MJ: Users.ID`.
     * @param roleIDs The current user's role IDs (used to match Role-scope rows).
     */
    public GetActiveOverrideForEntity(
        entityID: string,
        userID: string,
        roleIDs: ReadonlyArray<string>,
    ): MJEntityFormOverrideEntity | null {
        if (!entityID) return null;
        const candidates = this.Overrides.filter(o =>
            o.EntityID && UUIDsEqual(o.EntityID, entityID)
            && o.Status === 'Active'
            && (
                (o.Scope === 'User'   && o.UserID && userID && UUIDsEqual(o.UserID, userID)) ||
                (o.Scope === 'Role'   && o.RoleID && roleIDs.some(r => UUIDsEqual(r, o.RoleID!))) ||
                (o.Scope === 'Global')
            ),
        );
        if (candidates.length === 0) return null;
        // Sort by scope priority then row priority (low first).
        const scoreScope = (s: string | null): number => {
            if (s === 'User')   return 0;
            if (s === 'Role')   return 1;
            if (s === 'Global') return 2;
            return 3;
        };
        candidates.sort((a, b) => {
            const sa = scoreScope(a.Scope);
            const sb = scoreScope(b.Scope);
            if (sa !== sb) return sa - sb;
            return (a.Priority ?? 0) - (b.Priority ?? 0);
        });
        return candidates[0];
    }

    /**
     * All Components in a given Name lineage. The cockpit's version rail
     * uses this — every version of "MembersDemo" has the same Component.Name,
     * differentiated by Version + VersionSequence.
     */
    public GetLineageByName(name: string): MJComponentEntity[] {
        if (!name) return [];
        const n = name.trim().toLowerCase();
        return this.Forms
            .filter(c => (c.Name ?? '').trim().toLowerCase() === n)
            .sort((a, b) => (b.VersionSequence ?? 0) - (a.VersionSequence ?? 0));
    }

    /** Find a form by Component ID. O(N) — N is small (form count, not all Components). */
    public FindFormByID(id: string): MJComponentEntity | undefined {
        if (!id) return undefined;
        const normID = NormalizeUUID(id);
        return this.Forms.find(c => NormalizeUUID(c.ID) === normID);
    }

    /** Find an override row by its primary key. */
    public FindOverrideByID(id: string): MJEntityFormOverrideEntity | undefined {
        if (!id) return undefined;
        const normID = NormalizeUUID(id);
        return this.Overrides.find(o => NormalizeUUID(o.ID) === normID);
    }
}
