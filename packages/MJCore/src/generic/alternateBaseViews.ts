import { BaseEntity } from './baseEntity';
import { EntityAlternateBaseViewInfo, EntityInfo } from './entityInfo';
import { LogStatusEx } from './logging';
import { UserInfo } from './securityInfo';
import { RunViewParams } from '../views/runView';

/**
 * Validates that `name` is a safe, unquoted SQL identifier (`1..128` characters, starting
 * with an ASCII letter or underscore and containing only ASCII letters, digits, or underscores).
 *
 * Lives in `@memberjunction/core` so both client/server metadata validation (`ProviderBase`,
 * `MJEntityAlternateBaseViewEntityServer`) and SQL generators can validate `ViewName` and
 * `SchemaName` without introducing a dependency on `@memberjunction/schema-engine`.
 */
export function IsValidSQLIdentifier(name: string | null | undefined): boolean {
    if (typeof name !== 'string') {
        return false;
    }
    return name.length > 0 && name.length <= 128 && /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}

/**
 * Validates that `name` is a valid semantic `EntityAlternateBaseView.Name`:
 * non-empty after trimming, at most 100 characters, not starting with `//` (so `abv:` + `Name`
 * can never form `abv://...`), and containing neither `|` nor `:` (the cache-fingerprint segment
 * and prefix delimiters used by `LocalCacheManager` and `GenericDatabaseProvider`). Mirrors
 * `CK_EntityAlternateBaseView_Name` in SQL.
 */
export function IsValidAlternateBaseViewName(name: string | null | undefined): boolean {
    if (typeof name !== 'string') {
        return false;
    }
    const trimmed = name.trim();
    return (
        trimmed.length > 0 &&
        trimmed.length <= 100 &&
        !trimmed.startsWith('//') &&
        !name.includes('|') &&
        !name.includes(':')
    );
}

/**
 * Options for resolving and authorizing an alternate base view on an entity.
 */
export interface ResolveAlternateBaseViewOptions {
    /** The parent entity on which the alternate base view is registered. */
    entity: EntityInfo;
    /** The semantic `Name` of the alternate base view (for example, `'Active'`). */
    alternateBaseViewName: string;
    /** Optional user context for entity `CanRead` permission checks. */
    contextUser?: UserInfo;
    /**
     * When `true` (the default whenever `contextUser` is provided), enforces
     * `entity.CanRead` for `contextUser` when `entity.Permissions` is populated.
     */
    enforcePermissions?: boolean;
    /**
     * When `false`, throws if the alternate base view (or any ancestor in its `ParentID` chain)
     * has `Status === 'Deprecated'`. Defaults to `true` (allows deprecated views with a log warning).
     */
    allowDeprecated?: boolean;
    /**
     * When `true`, suppresses the `[Deprecated]` log warning while still honoring `allowDeprecated`.
     * Used by internal call sites that delegate after a caller has already logged deprecation.
     */
    suppressDeprecationWarning?: boolean;
    /** Optional caller label included in deprecation warnings and error messages. */
    callerName?: string;
}

/**
 * Resolved alternate base view metadata ready for SQL generation or cache routing.
 */
export interface AlternateBaseViewResolution {
    /** The resolved alternate base view metadata object. */
    view: EntityAlternateBaseViewInfo;
    /** The owning entity metadata object. */
    entity: EntityInfo;
    /** Physical SQL view name (`view.ViewName`). */
    effectiveViewName: string;
    /** Physical database schema name (`view.EffectiveSchemaName`). */
    effectiveSchemaName: string;
}

/**
 * Resolves a semantic `AlternateBaseView` name against `entity`, validates that it is
 * registered and usable (`Status` is `'Active'` or `'Deprecated'`, including all ancestors
 * in any `ParentID` chain), emits a warning when deprecated, and enforces entity `CanRead`
 * when `contextUser` is provided.
 *
 * Throws a descriptive `Error` on unknown, disabled, or unauthorized alternate base views
 * (never silently falls back to `entity.BaseView`, preventing filtered-row disclosure).
 */
export function ResolveAlternateBaseView(options: ResolveAlternateBaseViewOptions): AlternateBaseViewResolution {
    const {
        entity,
        contextUser,
        enforcePermissions = true,
        allowDeprecated = true,
        suppressDeprecationWarning = false,
        callerName,
    } = options;
    const rawName = typeof options.alternateBaseViewName === 'string' ? options.alternateBaseViewName.trim() : '';
    if (!rawName) {
        throw new Error(`AlternateBaseView name cannot be empty on entity '${entity.Name}'.`);
    }

    const view = findRegisteredAlternateBaseViewOrThrow(entity, rawName);
    assertAlternateBaseViewUsableAndIdentifiersValid(entity, view);
    checkAlternateBaseViewDeprecation(entity, view, allowDeprecated, suppressDeprecationWarning, callerName);
    assertAlternateBaseViewReadPermission(entity, contextUser, enforcePermissions);

    return {
        view,
        entity,
        effectiveViewName: view.ViewName,
        effectiveSchemaName: view.EffectiveSchemaName,
    };
}

function findRegisteredAlternateBaseViewOrThrow(entity: EntityInfo, rawName: string): EntityAlternateBaseViewInfo {
    const view = entity.GetAlternateBaseView(rawName);
    if (!view) {
        const available = entity.AlternateBaseViews
            .filter(v => v.IsUsable)
            .map(v => v.Name)
            .join(', ');
        throw new Error(
            `AlternateBaseView '${rawName}' is not registered on entity '${entity.Name}'. ` +
            `Available alternate base views: ${available || '(none)'}`,
        );
    }
    return view;
}

function assertAlternateBaseViewUsableAndIdentifiersValid(entity: EntityInfo, view: EntityAlternateBaseViewInfo): void {
    if (!view.IsUsable) {
        throw new Error(
            `AlternateBaseView '${view.Name}' on entity '${entity.Name}' is disabled and cannot be used.`,
        );
    }
    if (!IsValidSQLIdentifier(view.ViewName)) {
        throw new Error(
            `AlternateBaseView '${view.Name}' on entity '${entity.Name}' has an invalid SQL ViewName '${view.ViewName}'.`,
        );
    }
    if (view.EffectiveSchemaName && !IsValidSQLIdentifier(view.EffectiveSchemaName)) {
        throw new Error(
            `AlternateBaseView '${view.Name}' on entity '${entity.Name}' has an invalid SQL SchemaName '${view.EffectiveSchemaName}'.`,
        );
    }
}

function checkAlternateBaseViewDeprecation(
    entity: EntityInfo,
    view: EntityAlternateBaseViewInfo,
    allowDeprecated: boolean,
    suppressDeprecationWarning: boolean,
    callerName?: string,
): void {
    if (!view.IsDeprecated) {
        return;
    }
    if (!allowDeprecated) {
        throw new Error(
            `AlternateBaseView '${view.Name}' on entity '${entity.Name}' is deprecated and cannot be used.`,
        );
    }
    if (!suppressDeprecationWarning) {
        LogStatusEx({
            message: `[Deprecated] AlternateBaseView '${view.Name}' on entity '${entity.Name}' is deprecated${callerName ? ` (called from ${callerName})` : ''}.`,
            verboseOnly: false,
        });
    }
}

function assertAlternateBaseViewReadPermission(
    entity: EntityInfo,
    contextUser: UserInfo | undefined,
    enforcePermissions: boolean,
): void {
    if (enforcePermissions && contextUser && entity.Permissions && entity.Permissions.length > 0) {
        const entityPerms = entity.GetUserPermisions(contextUser);
        if (!entityPerms?.CanRead) {
            throw new Error(
                `User '${contextUser.Email}' does not have permission to read entity '${entity.Name}'.`,
            );
        }
    }
}

/**
 * Searches across `entities` for an entity that registers a physical SQL view matching
 * `viewName` (and optional `schemaName`) as an `EntityAlternateBaseView`.
 *
 * Used by SQL AST extractors (Query entity extraction, `ClientClauseScreen`, and ad-hoc SQL
 * read authorization) so queries referencing an alternate base view resolve to its parent
 * entity alongside the matched `EntityAlternateBaseViewInfo`.
 */
export function FindAlternateBaseViewByPhysicalName(
    entities: readonly EntityInfo[],
    viewName: string | undefined | null,
    schemaName?: string | null,
): { entity: EntityInfo; alternateView: EntityAlternateBaseViewInfo } | undefined {
    const normalizedView = viewName?.trim();
    if (!normalizedView) {
        return undefined;
    }
    for (const entity of entities) {
        const match = entity.GetAlternateBaseViewByViewName(normalizedView, schemaName);
        if (match) {
            return { entity, alternateView: match };
        }
    }
    return undefined;
}

const _viewEntityPinnedAbvCache = new WeakMap<BaseEntity, { raw: unknown; value: string | undefined }>();

/**
 * Extracts a pinned `alternateBaseView` semantic name from a loaded User View `BaseEntity`
 * (`DisplayState` JSON column) without introducing a dependency from `@memberjunction/core`
 * to `@memberjunction/core-entities`.
 *
 * Memoizes the parsed result per `(viewEntity, rawDisplayState)` in a `WeakMap` so hot paths
 * (`GetEffectiveAlternateBaseViewName` across cache eligibility, fingerprinting, dedup, and
 * telemetry) do not `JSON.parse(DisplayState)` on every call.
 *
 * Mirrors the `ViewEntity.Get('EntityID')` / `ViewEntity.Get('WhereClause')` access pattern
 * in `RunView.GetEntityNameFromRunViewParams` and `ProviderBase.ResolveRunViewEntitySync`.
 */
export function GetPinnedAlternateBaseViewFromViewEntity(
    viewEntity: BaseEntity | undefined | null,
): string | undefined {
    if (!viewEntity || typeof viewEntity.Get !== 'function') {
        return undefined;
    }
    // Weak-typing accessor on ViewEntity is deliberate in MJCore to avoid circular dependency on core-entities
    const rawDisplayState: unknown = viewEntity.Get('DisplayState');
    const cached = _viewEntityPinnedAbvCache.get(viewEntity);
    if (cached && cached.raw === rawDisplayState) {
        return cached.value;
    }
    const value = ExtractAlternateBaseViewFromDisplayState(rawDisplayState);
    if (typeof viewEntity === 'object') {
        _viewEntityPinnedAbvCache.set(viewEntity, { raw: rawDisplayState, value });
    }
    return value;
}

/**
 * Extracts `alternateBaseView` (or `AlternateBaseView`) from a raw `DisplayState` JSON string
 * or parsed object. Returns `undefined` when absent or blank.
 */
export function ExtractAlternateBaseViewFromDisplayState(rawDisplayState: unknown): string | undefined {
    if (!rawDisplayState) {
        return undefined;
    }
    if (typeof rawDisplayState === 'string') {
        const trimmed = rawDisplayState.trim();
        if (!trimmed.startsWith('{')) {
            return undefined;
        }
        try {
            const parsed = JSON.parse(trimmed) as Record<string, unknown>;
            return extractFromDisplayStateObject(parsed);
        } catch {
            return undefined;
        }
    }
    if (typeof rawDisplayState === 'object') {
        return extractFromDisplayStateObject(rawDisplayState as Record<string, unknown>);
    }
    return undefined;
}

function extractFromDisplayStateObject(record: Record<string, unknown> | null | undefined): string | undefined {
    if (!record || typeof record !== 'object') {
        return undefined;
    }
    const candidate = typeof record.alternateBaseView === 'string'
        ? record.alternateBaseView
        : typeof record.AlternateBaseView === 'string'
            ? record.AlternateBaseView
            : undefined;
    if (!candidate) {
        return undefined;
    }
    const trimmed = candidate.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * True when `params.AlternateBaseView` is explicitly set to `""` (or whitespace-only),
 * meaning the caller is explicitly overriding any saved User View `DisplayState.alternateBaseView`
 * pin back to the entity's canonical `BaseView`.
 */
export function IsExplicitBaseViewOverride(params: RunViewParams | undefined | null): boolean {
    return typeof params?.AlternateBaseView === 'string' && params.AlternateBaseView.trim().length === 0;
}

/**
 * Returns the effective semantic `AlternateBaseView` name for a `RunViewParams` object:
 * - An explicit non-empty `params.AlternateBaseView` takes precedence over a saved User View's
 *   pinned `DisplayState.alternateBaseView` on `params.ViewEntity`.
 * - An explicit empty `params.AlternateBaseView: ""` overrides a saved User View's pin back to
 *   `BaseView` (returns `undefined` without falling back to `params.ViewEntity`).
 * - When `params.AlternateBaseView` is `undefined`, falls back to `params.ViewEntity`'s pinned
 *   `DisplayState.alternateBaseView`.
 */
export function GetEffectiveAlternateBaseViewName(params: RunViewParams | undefined | null): string | undefined {
    if (!params) {
        return undefined;
    }
    if (typeof params.AlternateBaseView === 'string') {
        const trimmed = params.AlternateBaseView.trim();
        return trimmed.length > 0 ? trimmed : undefined;
    }
    return GetPinnedAlternateBaseViewFromViewEntity(params.ViewEntity);
}
