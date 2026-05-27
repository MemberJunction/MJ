import { BaseEngine, BaseEnginePropertyConfig, IMetadataProvider, UserInfo } from "@memberjunction/core";
import { NormalizeUUID, UUIDsEqual } from "@memberjunction/global";
import type { Observable } from "rxjs";
import type { MJComponentEntity, MJEntityFormOverrideEntity } from "../generated/entity_subclasses";

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
 * This engine threads the needle: load `Type='Form'` Components only
 * (small dataset — a few dozen per typical deployment, ~5MB max) plus
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

    private _forms: MJComponentEntity[] = [];
    private _overrides: MJEntityFormOverrideEntity[] = [];

    /**
     * Lazy-load the form Component + override caches. Safe to call from
     * every entry point — no-op if already loaded (unless `forceRefresh`).
     */
    public async Config(
        forceRefresh?: boolean,
        contextUser?: UserInfo,
        provider?: IMetadataProvider,
    ): Promise<void> {
        const c: Partial<BaseEnginePropertyConfig>[] = [
            {
                Type: 'entity',
                EntityName: 'MJ: Components',
                PropertyName: '_forms',
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
        await this.Load(c, provider, forceRefresh, contextUser);
    }

    // ─── Read-side accessors ────────────────────────────────────────────────

    /** All cached form-role Components. */
    public get Forms(): MJComponentEntity[] {
        return this._forms ?? [];
    }

    /** All cached EntityFormOverride rows (all scopes — caller filters). */
    public get Overrides(): MJEntityFormOverrideEntity[] {
        return this._overrides ?? [];
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
