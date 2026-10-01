import { BaseEngine, BaseEnginePropertyConfig, IMetadataProvider, LogError, ProviderType, RunView, UserInfo, type BaseEntityEvent } from "@memberjunction/core";
import { EscapeSQLString, NormalizeUUID, UUIDsEqual } from "@memberjunction/global";
import type { Observable } from "rxjs";
import type { MJComponentEntity, MJEntityFormContributionEntity, MJEntityFormOverrideEntity } from "../generated/entity_subclasses";
import { FormScopeAllowedOnEntity } from "../custom/FormScope/FormScopeRules";
import type { InstanceConfigEngine } from "./InstanceConfigEngine";

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
 * This engine threads the needle: it loads `Type='Form'` Components (small
 * dataset — a few dozen per typical deployment, ~5MB max), the
 * `EntityFormOverride` rows (tiny) and, unless metadata contributions are
 * switched off, the `MJ: Entity Form Contributions` rows. In the browser it
 * loads the shared overrides and contributions and the signed-in user's own;
 * on a server it loads every row. Specification is included because
 * the cockpit + Skip rendering both need it. Loaded as `entity_object` so
 * callers can call `.Save()` / `.Delete()` on the cached instances directly.
 *
 * It deliberately does NOT load `Type='Widget'` rows: `Widget` is an open set
 * grown by registry sync and general authoring, unrelated to form-panel
 * adoption, and this cache is written to client local storage on every boot.
 * The widget a contribution renders is fetched by ID on first use
 * ({@link InteractiveFormsEngine.GetComponentByID}) and kept in memory until any
 * `MJ: Components` row is saved, deleted or changed on another server, so each
 * distinct panel component costs one query, not one per mount.
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
     * (server, CLI). The browser has no environment: the Explorer shell calls
     * {@link ApplyInstanceConfiguration} after Instance Config loads and before any form opens, and
     * another browser host can do the same or set this directly before the first `Config()`.
     */
    private static _metadataContributionsEnabled: boolean = InteractiveFormsEngine.readContributionsFlag();

    /** The `MJ: Instance Configurations` key that turns metadata contributions off in the browser. */
    public static readonly MetadataContributionsConfigKey = 'Forms.MetadataContributions.Enabled';

    public static get MetadataContributionsEnabled(): boolean {
        return InteractiveFormsEngine._metadataContributionsEnabled;
    }
    public static set MetadataContributionsEnabled(value: boolean) {
        InteractiveFormsEngine._metadataContributionsEnabled = value;
    }

    /**
     * Turns metadata contributions off when the instance configuration
     * ({@link MetadataContributionsConfigKey}) is `false`. A missing key leaves the switch as it is,
     * and a `true` never turns back on a switch that is already off.
     *
     * Call it after `InstanceConfigEngine.Config()` has finished and before the first form opens.
     * Before Instance Config has loaded, or when it fails to load, the key reads as missing and
     * the switch stays on.
     */
    public static ApplyInstanceConfiguration(config: Pick<InstanceConfigEngine, 'GetBoolean'>): void {
        if (!config.GetBoolean(InteractiveFormsEngine.MetadataContributionsConfigKey, true)) {
            InteractiveFormsEngine.MetadataContributionsEnabled = false;
        }
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

    /** Components fetched by {@link GetComponentByID}, by normalized ID. */
    private _componentsByID = new Map<string, MJComponentEntity>();
    /** Lookups in flight, by normalized ID, so panels that mount together share one query. */
    private _componentLookups = new Map<string, Promise<MJComponentEntity | null>>();
    private _componentInvalidationSubscribed = false;

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
        const personalRowsFilter = InteractiveFormsEngine.personalRowsLoadFilter(provider ?? this.ProviderToUse, contextUser);
        const overrides: Partial<BaseEnginePropertyConfig> = {
            Type: 'entity',
            EntityName: 'MJ: Entity Form Overrides',
            PropertyName: '_overrides',
            CacheLocal: true,
        };
        if (personalRowsFilter) overrides.Filter = personalRowsFilter;
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
                // cache; `GetComponentByID` fetches it by ID on first use. The filter takes no
                // subquery over `vwEntityFormContributions`: a view name resolves against the
                // connecting user's default schema rather than the core schema, and a filter
                // that fails takes the WHOLE engine down with it, so every form would wait on a
                // cache that never loads. Fetching exactly the components that render, lazily,
                // needs no cross-schema SQL at all.
                Filter: "Type='Form'",
                CacheLocal: true,
            },
            overrides,
        ];
        if (contributionsEnabled) {
            const contributions: Partial<BaseEnginePropertyConfig> = {
                Type: 'entity',
                EntityName: 'MJ: Entity Form Contributions',
                PropertyName: '_contributions',
                CacheLocal: true,
            };
            if (personalRowsFilter) contributions.Filter = personalRowsFilter;
            c.push(contributions);
        }
        await this.Load(c, provider, forceRefresh, contextUser);
    }

    /**
     * The filter for the override and contribution loads: in the browser, every shared row plus
     * the signed-in user's own personal rows; on a server, none.
     *
     * A browser cache holds one user's view, so other users' personal rows (with their Notes and
     * Configuration) stay on the server. A server cache is shared by every user of the process,
     * so it holds every row and each reader filters what it serves.
     */
    private static personalRowsLoadFilter(
        provider: IMetadataProvider | null | undefined,
        contextUser: UserInfo | undefined,
    ): string | null {
        if (!provider || provider.ProviderType === ProviderType.Database) return null;
        const userID = (contextUser ?? provider.CurrentUser)?.ID;
        return userID ? `Scope <> 'User' OR UserID = '${EscapeSQLString(userID)}'` : null;
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
     * Active contribution rows that apply to (entity, user, roles): User rows for this
     * user, Role rows for any of the user's roles, and Global rows. Sorted by
     * `Precedence` DESC then `SortKey` DESC. Last-wins collapse against compiled
     * registrations happens in ng-base-forms, not here.
     *
     * On an identity or permission entity only the user's own rows apply
     * ({@link FormScopeAllowedOnEntity}). The clamp is applied here, on the read path, because
     * `mj sync` — the path an OpenApp actually uses — and direct SQL bypass the actions.
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
            && FormScopeAllowedOnEntity(c.Entity, c.Scope)
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
     * A form from the loaded forms, or a widget {@link GetComponentByID} has already fetched.
     * Undefined for a widget not fetched yet.
     */
    public FindComponentByID(id: string): MJComponentEntity | undefined {
        if (!id) return undefined;
        return this.FindFormByID(id) ?? this._componentsByID.get(NormalizeUUID(id));
    }

    /**
     * Any Component by ID: a whole form from the loaded forms, otherwise one query by ID, kept in
     * memory for the next caller. Panels that ask at the same time share one query. A failed or
     * empty lookup is not kept, so the next caller tries again. Every kept component is dropped
     * when any `MJ: Components` row is saved, deleted or changed on another server.
     *
     * @returns The component, or null when it does not exist or the lookup failed.
     */
    public async GetComponentByID(
        id: string,
        contextUser?: UserInfo,
        provider?: IMetadataProvider,
    ): Promise<MJComponentEntity | null> {
        if (!id) return null;
        const loaded = this.FindComponentByID(id);
        if (loaded) return loaded;
        this.subscribeComponentInvalidation();
        const key = NormalizeUUID(id);
        const inFlight = this._componentLookups.get(key);
        if (inFlight) return inFlight;
        const lookup = this.queryComponentByID(id, contextUser, provider).then((component) => {
            // A component change during the query cleared the maps; this result is then stale.
            if (this._componentLookups.get(key) !== lookup) return component;
            this._componentLookups.delete(key);
            if (component) this._componentsByID.set(key, component);
            return component;
        });
        this._componentLookups.set(key, lookup);
        return lookup;
    }

    /** Drops every component {@link GetComponentByID} kept. */
    public ClearComponentCache(): void {
        this._componentsByID.clear();
        this._componentLookups.clear();
    }

    private async queryComponentByID(
        id: string,
        contextUser: UserInfo | undefined,
        provider: IMetadataProvider | undefined,
    ): Promise<MJComponentEntity | null> {
        const source = provider ?? this.ProviderToUse;
        try {
            const result = await RunView.FromMetadataProvider(source).RunView<MJComponentEntity>({
                EntityName: 'MJ: Components',
                ExtraFilter: `ID='${EscapeSQLString(id)}'`,
                ResultType: 'entity_object',
                MaxRows: 1,
            }, contextUser ?? source?.CurrentUser);
            if (!result.Success) {
                LogError(`InteractiveFormsEngine: component lookup failed for ${id}: ${result.ErrorMessage ?? 'unknown error'}`);
                return null;
            }
            return (result.Results ?? [])[0] ?? null;
        } catch (err) {
            LogError(`InteractiveFormsEngine: component lookup threw for ${id}: ${err instanceof Error ? err.message : String(err)}`);
            return null;
        }
    }

    /**
     * A save of any `MJ: Components` row, and a change to one on another server, refreshes the
     * forms array (a widget is not in it, so the save is not applied in place), and that emission
     * drops what {@link GetComponentByID} kept. A delete of a row outside the array changes no
     * array; {@link HandleIndividualBaseEntityEvent} covers it. Subscribed before anything is
     * kept, so the replay on subscribe clears nothing.
     */
    private subscribeComponentInvalidation(): void {
        if (this._componentInvalidationSubscribed) return;
        this._componentInvalidationSubscribed = true;
        this.Forms$.subscribe(() => this.ClearComponentCache());
    }

    /**
     * Drops what {@link GetComponentByID} kept when an `MJ: Components` row is deleted, here or on
     * another server, then handles the event as every engine does. BaseEngine ignores a delete of a
     * row that is not in a loaded array, which a fetched widget never is.
     */
    protected override async HandleIndividualBaseEntityEvent(event: BaseEntityEvent): Promise<boolean> {
        if (InteractiveFormsEngine.isComponentDelete(event)) this.ClearComponentCache();
        return super.HandleIndividualBaseEntityEvent(event);
    }

    private static isComponentDelete(event: BaseEntityEvent): boolean {
        const entityName = (event.baseEntity?.EntityInfo?.Name ?? event.entityName ?? '').trim().toLowerCase();
        if (entityName !== 'mj: components') return false;
        if (event.type === 'delete') return true;
        return event.type === 'remote-invalidate' && (event.payload as { action?: string } | null | undefined)?.action === 'delete';
    }


    /**
     * Resolver-style lookup matching the runtime form-resolver's scope
     * priority: User > Role > Global. Returns the highest-priority
     * Active override for the given (entity, user, roles) tuple, or null
     * if none match. Within the same scope, lower `Priority` wins (the
     * resolver convention — Priority is sort key, not boost). On an identity
     * or permission entity only the user's own forms count
     * ({@link FormScopeAllowedOnEntity}).
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
            && FormScopeAllowedOnEntity(o.Entity, o.Scope)
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
