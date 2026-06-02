import { Injectable, Type } from '@angular/core';
import { IMetadataProvider, UserInfo, EntityInfo, LogError } from '@memberjunction/core';
import { InteractiveFormsEngine } from '@memberjunction/core-entities';
import { MJGlobal, UUIDsEqual } from '@memberjunction/global';
import { BaseFormComponent } from '../base-form-component';
import { UserInfoEngine } from '@memberjunction/core-entities';

/**
 * Slim row shape for an `EntityFormOverride` lookup. Resolution doesn't need
 * the full BaseEntity object — `simple` ResultType is faster and avoids a
 * compile-time dependency on the generated entity class. The row is only ever
 * read by the resolver; mutation goes through the generated entity in other
 * code paths (Studio, AI authoring).
 */
export interface EntityFormOverrideRow {
    ID: string;
    EntityID: string;
    ComponentID: string;
    Scope: 'User' | 'Role' | 'Global';
    UserID: string | null;
    RoleID: string | null;
    Priority: number;
    Status: 'Active' | 'Inactive' | 'Pending';
    Name?: string;
    Description?: string | null;
}

/** Resolved form kind for a given (entity, user, roles) tuple. */
export type FormResolution =
    | { kind: 'interactive'; override: EntityFormOverrideRow; variants: EntityFormOverrideRow[] }
    | { kind: 'class'; subClass: Type<BaseFormComponent>; variants: EntityFormOverrideRow[] }
    | { kind: 'none'; variants: EntityFormOverrideRow[] };

/**
 * UserInfoEngine setting-key prefix for per-user, per-entity form-variant
 * preferences. Persisted to `MJ: User Settings` so the choice follows the
 * user across browsers and devices — localStorage is intentionally NOT used.
 *
 * Key format: `mj.formVariant.<entityname-lowercased>`.
 *
 * Value is one of:
 *   - an `EntityFormOverride.ID` (UUID) → use that specific override
 *   - {@link FormResolverService.EXPLICIT_DEFAULT_SENTINEL} → user picked
 *     the CodeGen Angular fallback explicitly; resolver skips all overrides
 *   - (key absent) → no preference, apply auto-pick rules
 */
const VARIANT_SETTING_PREFIX = 'mj.formVariant.';

/**
 * Picks the form to render for an entity record and exposes the full list of
 * applicable variants so the toolbar's variant switcher can offer alternates.
 *
 * Tier order for the **default** pick:
 *   1. `EntityFormOverride` row matching the caller's User/Role/Global scope,
 *      Status='Active', ordered by scope tier (User > Role > Global), then
 *      Priority DESC, then `__mj_CreatedAt DESC`. First row wins.
 *   2. Existing `ClassFactory.GetRegistration(BaseFormComponent, entityName)` —
 *      the @RegisterClass + CodeGen-generated path used today.
 *   3. None — caller surfaces the "no form registered" error.
 *
 * **Session selection.** If the user previously chose a non-default variant
 * via the variant switcher and that choice is still applicable + Active, that
 * choice wins over the default. Choice is keyed by entity name in
 * `localStorage`. Honoring this is part of the variant-switcher contract;
 * without it, switching variants would only last for the lifetime of the
 * record-form view.
 *
 * **Performance.** Backed by `InteractiveFormsEngine` (in MJCoreEntities)
 * — overrides are cached in memory with BaseEntity event-driven
 * invalidation, so resolution is an O(N) JS filter against a small
 * set instead of a per-LoadForm RunView round-trip. Cold latency
 * dropped from ~50ms to <1ms after the first load. The engine is
 * lazy-Config'd here on first resolution; users who never open a
 * record pay nothing.
 */
@Injectable({ providedIn: 'root' })
export class FormResolverService {

    async ResolveFormForEntity(
        entity: EntityInfo,
        user: UserInfo,
        provider: IMetadataProvider,
    ): Promise<FormResolution> {
        const variants = await this.listApplicableVariants(entity, user, provider);
        const active = this.pickActive(entity, variants);

        if (active) {
            return { kind: 'interactive', override: active, variants };
        }

        const reg = MJGlobal.Instance.ClassFactory.GetRegistration(BaseFormComponent, entity.Name);
        return reg
            ? { kind: 'class', subClass: reg.SubClass as Type<BaseFormComponent>, variants }
            : { kind: 'none', variants };
    }

    /**
     * Public list-API for the variant switcher UI. Returns all variants
     * applicable to (entity, user). Includes Active, Pending, and Inactive
     * rows so the picker can offer "switch back to v1.0.0" alongside the
     * current active variant.
     */
    async ListVariantsForEntity(
        entity: EntityInfo,
        user: UserInfo,
        provider: IMetadataProvider,
    ): Promise<EntityFormOverrideRow[]> {
        return this.listApplicableVariants(entity, user, provider);
    }

    /**
     * Sentinel stored in localStorage when the user **explicitly picks the
     * "Default form"** option from the variant picker. Distinct from a
     * missing localStorage key (= "no preference, use auto-pick rules")
     * and from an override UUID. Without this sentinel, picking "Default"
     * cleared the preference and `pickActive` re-applied the auto-pick —
     * which always selects the first Active override, making the
     * CodeGen/Angular fallback unreachable from the UI.
     *
     * Format: a leading `__` makes it visually distinct from a UUID and
     * impossible to collide with one (UUIDs don't contain underscores).
     */
    public static readonly EXPLICIT_DEFAULT_SENTINEL = '__codegen-default__';

    /**
     * Build the per-entity setting key. Lowercased so case variants of
     * the entity name collapse onto a single record in `MJ: User Settings`.
     */
    private settingKey(entityName: string): string {
        return VARIANT_SETTING_PREFIX + entityName.toLowerCase();
    }

    /**
     * Persist a specific override choice. Pass the override UUID. Writes
     * via `UserInfoEngine.SetSettingDebounced` so rapid successive picks
     * don't hammer the DB. Use {@link SetExplicitDefault} to record "user
     * wants the CodeGen Angular fallback" and {@link ClearSelectedVariant}
     * to wipe the preference entirely (revert to auto-pick).
     */
    SetSelectedVariant(entityName: string, overrideID: string): void {
        UserInfoEngine.Instance.SetSettingDebounced(this.settingKey(entityName), overrideID);
    }

    /**
     * Record that the user explicitly picked the "Default form" row in
     * the picker. `pickActive` reads this sentinel and returns null even
     * when Active overrides exist for the entity, so the form-loading
     * path falls back to CodeGen's `@RegisterClass` lookup.
     */
    SetExplicitDefault(entityName: string): void {
        UserInfoEngine.Instance.SetSettingDebounced(
            this.settingKey(entityName),
            FormResolverService.EXPLICIT_DEFAULT_SENTINEL,
        );
    }

    /**
     * Wipe the user's stored preference for this entity. Next load
     * applies the auto-pick rules (first Active override in tier order).
     * Called internally when a saved override ID is no longer valid.
     * Fire-and-forget — the resolver doesn't need to await the delete.
     */
    ClearSelectedVariant(entityName: string): void {
        void UserInfoEngine.Instance.DeleteSetting(this.settingKey(entityName))
            .catch(err => LogError(`FormResolverService.ClearSelectedVariant: ${err instanceof Error ? err.message : String(err)}`));
    }

    /**
     * Read the user's previously-saved variant choice for the entity.
     * Synchronous because `UserInfoEngine` keeps the user-settings table
     * in memory after bootstrap. Returns the stored UUID, the explicit-
     * default sentinel, or null when no preference exists.
     */
    GetSelectedVariant(entityName: string): string | null {
        return UserInfoEngine.Instance.GetSetting(this.settingKey(entityName)) ?? null;
    }

    // ── internals ────────────────────────────────────────────────────────

    private async listApplicableVariants(
        entity: EntityInfo,
        user: UserInfo,
        provider: IMetadataProvider,
    ): Promise<EntityFormOverrideRow[]> {
        // Lazy-load the form-metadata engine on first call. No-op when
        // already loaded. BaseEngine's event subscription keeps the
        // cache fresh through save / delete / remote-invalidate — we
        // don't need `BypassCache: true` (the previous RunView path's
        // escape hatch) because the engine's invalidation IS that
        // freshness guarantee. See `InteractiveFormsEngine` doc-block.
        try {
            await InteractiveFormsEngine.Instance.Config(false, user, provider);
        } catch (err) {
            LogError(`FormResolverService: InteractiveFormsEngine.Config failed: ${err instanceof Error ? err.message : String(err)}`);
            return [];
        }

        const userRoleIds = new Set(
            (user.UserRoles ?? []).map(r => r.RoleID).filter((id): id is string => !!id),
        );

        // Filter cached overrides for this (entity, user, roles) tuple.
        // Includes Active + Pending + Inactive (the variant picker shows
        // all three; pickActive() filters to Active separately). Replaces
        // a per-LoadForm RunView with an in-memory predicate — sub-ms.
        const applicable = InteractiveFormsEngine.Instance.Overrides.filter(o => {
            if (!o.EntityID || !UUIDsEqual(o.EntityID, entity.ID)) return false;
            if (o.Scope === 'User')   return !!o.UserID && o.UserID.toLowerCase() === user.ID.toLowerCase();
            if (o.Scope === 'Role')   return !!o.RoleID && userRoleIds.has(o.RoleID);
            if (o.Scope === 'Global') return true;
            return false;
        });

        // Sort: User > Role > Global, then Priority DESC (higher beats),
        // then newest first. Matches the prior SQL ORDER BY semantics so
        // pickActive() / the variant switcher see the same order.
        const scopeRank = (s: string | null | undefined): number => {
            if (s === 'User')   return 1;
            if (s === 'Role')   return 2;
            if (s === 'Global') return 3;
            return 4;
        };
        applicable.sort((a, b) => {
            const sa = scopeRank(a.Scope);
            const sb = scopeRank(b.Scope);
            if (sa !== sb) return sa - sb;
            const pa = a.Priority ?? 0;
            const pb = b.Priority ?? 0;
            if (pa !== pb) return pb - pa;  // Priority DESC
            const ca = a.__mj_CreatedAt instanceof Date ? a.__mj_CreatedAt.getTime() : 0;
            const cb = b.__mj_CreatedAt instanceof Date ? b.__mj_CreatedAt.getTime() : 0;
            return cb - ca;  // newest first
        });

        // Project to the slim row shape the resolver returns. Keeps the
        // contract identical to the old RunView return so callers don't
        // change shape.
        return applicable.map(o => ({
            ID: o.ID,
            EntityID: o.EntityID,
            ComponentID: o.ComponentID,
            Scope: o.Scope as 'User' | 'Role' | 'Global',
            UserID: o.UserID,
            RoleID: o.RoleID,
            Priority: o.Priority,
            Status: o.Status as 'Active' | 'Inactive' | 'Pending',
            Name: o.Name,
            Description: o.Description,
        }));
    }

    /**
     * Pick the override that should actually render given the variant list
     * and the user's stored selection (if any).
     *
     * Selection rules:
     *   - If the user explicitly picked the "Default form" row in the
     *     variant picker (sentinel in localStorage) → return null so the
     *     form-loading path falls back to CodeGen's `@RegisterClass` lookup.
     *     This is what makes the Angular fallback reachable from the UI.
     *   - Else if the user has a saved variant ID AND that variant is in
     *     the applicable list AND it's Active → use it.
     *   - Else → first Active row in tier+priority order (auto-pick).
     *   - Else → null (fall back to CodeGen/@RegisterClass path).
     */
    private pickActive(
        entity: EntityInfo,
        variants: EntityFormOverrideRow[],
    ): EntityFormOverrideRow | null {
        const selectedID = this.GetSelectedVariant(entity.Name);
        if (selectedID === FormResolverService.EXPLICIT_DEFAULT_SENTINEL) {
            return null;
        }
        if (selectedID) {
            const sel = variants.find(v => v.Status === 'Active' && UUIDsEqual(v.ID, selectedID));
            if (sel) return sel;
            // Selection no longer valid — wipe it so future loads auto-pick.
            this.ClearSelectedVariant(entity.Name);
        }
        return variants.find(v => v.Status === 'Active') ?? null;
    }
}
