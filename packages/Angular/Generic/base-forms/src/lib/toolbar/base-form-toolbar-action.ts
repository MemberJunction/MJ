import { BaseEntity, EntityInfo, IMetadataProvider } from '@memberjunction/core';
import { MJGlobal, RegisterClassEx } from '@memberjunction/global';
import type { BaseFormComponent } from '../base-form-component';
import type { FormAgentLinksSummary } from '../chrome/form-composition-snapshot';
import {
    FormToolbarItemConfig,
    ToolbarItemMode,
    ToolbarItemPlacement,
    ToolbarItemVariant
} from '../types/form-toolbar-item';

/**
 * Structured metadata attached to a {@link BaseFormToolbarAction} registration via
 * `@RegisterClassEx(BaseFormToolbarAction, { key, priority?, metadata })` or
 * {@link RegisterFormToolbarAction}.
 */
export interface FormToolbarActionRegistrationMetadata extends Record<string, unknown> {
    /**
     * Unique toolbar item key (e.g. `'links'`, `'send-invoice'`, `'approve-contract'`).
     * When multiple registrations share the same `Key`, the registration with the highest
     * ClassFactory `Priority` wins (last-wins override).
     */
    Key: string;

    /**
     * Scope controlling which entity forms mount this toolbar action:
     * - `'*'` (default): global — mounts on every entity form
     * - Exact entity name (case-insensitive): e.g. `'MJ: AI Agents'`
     * - Glob/wildcard pattern on entity name: e.g. `'MJ_BizApps_Orders:*'`, `'*Order*'`, `'MJ: AI *'`
     * - Schema prefix: e.g. `'schema:mj_bizapps_accounting'` (matches `EntityInfo.SchemaName`)
     * - Array of any of the above: e.g. `['Invoices', 'Credit Memos', 'MJ_BizApps_Orders:*']`
     */
    EntityScope?: string | readonly string[];

    /** Optional inline button label text. */
    Text?: string;

    /** Label displayed in the toolbar's More (`...`) menu. Defaults to `Text` or `Description`. */
    MenuLabel?: string;

    /** Tooltip text displayed on hover. */
    Description?: string;

    /** Font Awesome icon class (e.g. `'fa-solid fa-diagram-project'`). */
    Icon?: string;

    /** Visual button variant. Default: `'default'`. */
    Variant?: ToolbarItemVariant;

    /** Form mode(s) in which the button appears (`'read'` | `'edit'` | `'both'`). Default: `'read'`. */
    Mode?: ToolbarItemMode;

    /** Toolbar placement group (`'actions'` | `'right'` | `'overflow'`). Default: `'actions'`. */
    Placement?: ToolbarItemPlacement;

    /** Numeric sort order within its placement group. */
    Order?: number;

    /**
     * Whether the action participates in per-user pinning (`mj.form.toolbar.pinnedActions`).
     * When `true`, the button renders on the main bar only when pinned by the user (or in
     * `DefaultPinnedActions`), and otherwise lives in the More (`...`) menu.
     */
    Pinnable?: boolean;

    /** Optional custom CSS class name. */
    CssClass?: string;
}

/**
 * Convenience decorator for registering a {@link BaseFormToolbarAction} subclass with
 * `MJGlobal.Instance.ClassFactory`.
 *
 * When subclassing an existing toolbar action plugin (such as `RecordLinksToolbarAction`),
 * any metadata properties omitted here (including `Key`, `Icon`, `MenuLabel`, `Order`, `Pinnable`, etc.)
 * are automatically inherited from the superclass registration at resolution time.
 */
export function RegisterFormToolbarAction(
    metadata: Partial<FormToolbarActionRegistrationMetadata> = {},
    priority = 0
): (constructor: Function) => void {
    return RegisterClassEx(BaseFormToolbarAction, {
        key: metadata.Key,
        priority,
        skipNullKeyWarning: true,
        autoRegisterWithRootClass: true,
        metadata: metadata as Record<string, unknown>
    });
}

/**
 * Runtime context passed into every {@link BaseFormToolbarAction} lifecycle hook.
 * Gives the action read access to the record, entity, provider, and toolbar visibility/pin state,
 * plus callbacks to update its own badge, loading state, disabled state, active state, or host drawer.
 */
export interface FormToolbarActionLifecycleContext {
    /** The active entity record on the form. */
    readonly Record: BaseEntity;
    /** Metadata for the active entity. */
    readonly EntityInfo: EntityInfo;
    /** Metadata provider scoped to the form. */
    readonly Provider: IMetadataProvider;
    /** Whether the form is currently in edit mode. */
    readonly EditMode: boolean;
    /** Whether the record currently has unsaved changes. */
    readonly IsDirty: boolean;
    /** Whether this toolbar action is currently pinned to the user's main toolbar. */
    readonly IsPinned: boolean;
    /** Whether this toolbar action is currently visible (either inline or pinned on the bar). */
    readonly IsVisibleOnBar: boolean;
    /** Optional reference to the host `BaseFormComponent`. */
    readonly FormComponent: BaseFormComponent | null;

    /** Update the badge count or text displayed on this toolbar button. */
    SetBadge(badge: string | number | null | undefined): void;
    /** Update the loading spinner state on this toolbar button. */
    SetLoading(loading: boolean): void;
    /** Update the disabled state (and optional disabled-reason tooltip) on this toolbar button. */
    SetDisabled(disabled: boolean, reason?: string): void;
    /** Update whether this toolbar button renders in its active/open state (e.g. while its drawer is open). */
    SetActive(active: boolean): void;
    /** Toggle or set the built-in Record Links drawer open state on the form container. */
    SetRecordLinksDrawerOpen(open: boolean): void;
    /** Return whether the built-in Record Links drawer is currently open on the form container. */
    IsRecordLinksDrawerOpen(): boolean;
    /** Publish an updated record links summary to the form container and AI agent context. */
    SetLinksSummary(summary: FormAgentLinksSummary): void;
    /** Request change detection on the host form container and toolbar. */
    RequestChangeDetection(): void;
}

/**
 * Abstract base class for pluggable, lifecycle-aware form toolbar buttons.
 *
 * Subclasses register via `@RegisterFormToolbarAction({ Key: '...', EntityScope: '...', ... })`
 * (or `@RegisterClassEx(BaseFormToolbarAction, { key: '...', metadata: { ... } })`).
 *
 * When `<mj-record-form-container>` initializes for an entity, it discovers all matching
 * `BaseFormToolbarAction` registrations for that entity (supporting exact entity names, wildcard
 * patterns like `'MJ_BizApps_Orders:*'`, schema prefixes like `'schema:mj_bizapps_accounting'`,
 * or global `'*'`), instantiates each winning action, and invokes its lifecycle hooks:
 * - {@link IsApplicable}
 * - {@link OnInit}
 * - {@link OnPrewarm} (where the action can inspect `ctx.IsPinned` / `ctx.IsVisibleOnBar` to decide whether to run network pre-warming)
 * - {@link OnPinStateChanged}
 * - {@link OnRecordSaved}
 * - {@link OnRecordRefreshed}
 * - {@link OnExecute}
 * - {@link OnDestroy}
 */
export abstract class BaseFormToolbarAction {
    /** Registration metadata populated by the host container when instantiated. */
    public Metadata!: FormToolbarActionRegistrationMetadata;

    /** Current badge value managed by this action instance. */
    public Badge: string | number | undefined = undefined;

    /** Current loading spinner state managed by this action instance. */
    public IsLoading = false;

    /** Current disabled state managed by this action instance. */
    public Disabled = false;

    /** Optional tooltip explaining why the button is disabled. */
    public DisabledReason: string | undefined = undefined;

    /** Whether the action's associated drawer/panel is currently active/open. */
    public IsActive = false;

    /**
     * Optional runtime guard beyond static `EntityScope` matching.
     * Return `false` to hide/exclude this action for the current record or mode.
     */
    public IsApplicable(ctx: FormToolbarActionLifecycleContext): boolean {
        return Boolean(ctx.Record && ctx.EntityInfo);
    }

    /**
     * Called when the form container binds to a record.
     */
    public OnInit(_ctx: FormToolbarActionLifecycleContext): void | Promise<void> {
        // Optional override
    }

    /**
     * Called during form badge-count pre-warming (`RecordReady`).
     * Subclasses can inspect `ctx.IsPinned` or `ctx.IsVisibleOnBar` to decide whether to run
     * network pre-fetch queries or defer them until {@link OnExecute} / {@link OnPinStateChanged}.
     */
    public OnPrewarm(_ctx: FormToolbarActionLifecycleContext): void | Promise<void> {
        // Optional override
    }

    /**
     * Called when the user pins or unpins this action in the toolbar's More (`...`) menu.
     */
    public OnPinStateChanged(_ctx: FormToolbarActionLifecycleContext, _isPinned: boolean): void | Promise<void> {
        // Optional override
    }

    /**
     * Called after the active record is saved or live-refreshed from the server.
     */
    public OnRecordRefreshed(_ctx: FormToolbarActionLifecycleContext): void | Promise<void> {
        // Optional override
    }

    /**
     * Called when the user clicks the toolbar button (either inline on the bar or inside the More menu).
     */
    public abstract OnExecute(ctx: FormToolbarActionLifecycleContext, event?: MouseEvent): void | Promise<void>;

    /**
     * Called when the host form container is destroyed or switches to a different entity.
     */
    public OnDestroy(): void {
        // Optional override
    }

    /**
     * Builds the `FormToolbarItemConfig` projection consumed by `<mj-form-toolbar>`.
     */
    public ToToolbarItemConfig(
        onTrigger: (event?: MouseEvent) => void | Promise<void>
    ): FormToolbarItemConfig {
        const meta = this.Metadata;
        const baseCss = meta.CssClass ?? '';
        const activeCss = this.IsActive ? 'mj-forms-toolbar__btn--active' : '';
        const combinedCss = [baseCss, activeCss].filter(Boolean).join(' ');

        return {
            Key: meta.Key,
            Text: meta.Text,
            MenuLabel: meta.MenuLabel ?? meta.Text ?? meta.Description ?? meta.Key,
            Description: meta.Description ?? meta.MenuLabel ?? meta.Text ?? meta.Key,
            Icon: meta.Icon ?? 'fa-solid fa-circle-dot',
            Variant: meta.Variant ?? 'default',
            Mode: meta.Mode ?? 'read',
            Placement: meta.Placement ?? 'actions',
            Order: meta.Order ?? 100,
            Pinnable: meta.Pinnable ?? true,
            Badge: this.Badge,
            IsLoading: this.IsLoading,
            Disabled: this.Disabled ? (this.DisabledReason || true) : false,
            CssClass: combinedCss || undefined,
            OnClick: () => onTrigger()
        };
    }
}

/**
 * Evaluates whether a `FormToolbarActionRegistrationMetadata.EntityScope` matches the given `EntityInfo`.
 *
 * Supported scope patterns:
 * - `undefined` or `'*'`: matches all entities
 * - `'schema:<schemaName>'`: case-insensitive match against `entityInfo.SchemaName`
 * - Glob pattern containing `'*'`: case-insensitive wildcard match against `entityInfo.Name`
 * - Exact string: case-insensitive match against `entityInfo.Name`
 * - Array of patterns: matches if any element in the array matches
 */
export function MatchesToolbarActionEntityScope(
    scope: string | readonly string[] | undefined,
    entityInfo: EntityInfo | null | undefined
): boolean {
    if (!entityInfo) return false;
    if (scope === undefined || scope === null || scope === '*') {
        return true;
    }
    const patterns = Array.isArray(scope) ? scope : [scope];
    if (patterns.length === 0) return true;

    const entityNameLower = (entityInfo.Name ?? '').trim().toLowerCase();
    const schemaNameLower = (entityInfo.SchemaName ?? '').trim().toLowerCase();

    for (const rawPattern of patterns) {
        if (typeof rawPattern !== 'string') continue;
        const pattern = rawPattern.trim().toLowerCase();
        if (!pattern || pattern === '*') {
            return true;
        }
        if (pattern.startsWith('schema:')) {
            const targetSchema = pattern.slice('schema:'.length).trim();
            if (targetSchema && schemaNameLower === targetSchema) {
                return true;
            }
            continue;
        }
        if (pattern.includes('*')) {
            const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
            const regex = new RegExp(`^${escaped}$`, 'i');
            if (regex.test(entityNameLower)) {
                return true;
            }
            continue;
        }
        if (entityNameLower === pattern) {
            return true;
        }
    }
    return false;
}

function isStrictSubclassOf(subCtor: unknown, superCtor: unknown): boolean {
    if (typeof subCtor !== 'function' || typeof superCtor !== 'function' || subCtor === superCtor) {
        return false;
    }
    return Boolean(
        subCtor.prototype &&
        superCtor.prototype &&
        subCtor.prototype instanceof (superCtor as new (...args: unknown[]) => unknown)
    );
}

function isSpecificEntityScope(scope: string | readonly string[] | undefined): boolean {
    if (scope === undefined || scope === null || scope === '*') return false;
    const list = Array.isArray(scope) ? scope : [scope];
    return list.some((s) => typeof s === 'string' && s.trim().length > 0 && s.trim() !== '*');
}

/**
 * Discovers all `BaseFormToolbarAction` registrations in `MJGlobal.Instance.ClassFactory`
 * (including subclasses registered via `@RegisterFormToolbarAction`, `@RegisterClass`, or
 * `@RegisterClassEx` against either `BaseFormToolbarAction` or a concrete action superclass),
 * merges inherited metadata up the class prototype chain, filters by `EntityScope` against
 * `entityInfo`, and resolves a single winning action per `Key` where:
 * 1. A subclass always overrides its superclass (`Sub.prototype instanceof Super`),
 * 2. An entity-scoped registration overrides a global (`'*'`) registration of equal priority,
 * 3. Higher ClassFactory `Priority` (and later registration order on ties) wins.
 */
export function ResolveFormToolbarActionsForEntity(
    entityInfo: EntityInfo | null | undefined
): BaseFormToolbarAction[] {
    if (!entityInfo) return [];
    const byRoot = MJGlobal.Instance.ClassFactory.GetRegistrationsByRootClass(BaseFormToolbarAction);
    const byBase = MJGlobal.Instance.ClassFactory.GetAllRegistrations(BaseFormToolbarAction);
    const allRegistrations = Array.from(new Set([...byRoot, ...byBase]));

    // Build a lookup from constructor -> merged metadata by walking registered superclasses
    const resolveEffectiveMetadata = (
        reg: (typeof allRegistrations)[number]
    ): FormToolbarActionRegistrationMetadata | null => {
        // Find all ancestor registrations in prototype order (oldest ancestor -> immediate parent)
        const ancestors = allRegistrations
            .filter((other) => isStrictSubclassOf(reg.SubClass, other.SubClass))
            .sort((a, b) => ( isStrictSubclassOf(a.SubClass, b.SubClass) ? 1 : -1 ));

        const merged: Record<string, unknown> = {};
        for (const anc of ancestors) {
            if (anc.Metadata && typeof anc.Metadata === 'object') {
                for (const [k, v] of Object.entries(anc.Metadata)) {
                    if (v !== undefined) merged[k] = v;
                }
            }
            if (typeof anc.Key === 'string' && anc.Key.trim().length > 0 && !merged['Key']) {
                merged['Key'] = anc.Key.trim();
            }
        }
        if (reg.Metadata && typeof reg.Metadata === 'object') {
            for (const [k, v] of Object.entries(reg.Metadata)) {
                if (v !== undefined) merged[k] = v;
            }
        }
        if (typeof reg.Key === 'string' && reg.Key.trim().length > 0 && !merged['Key']) {
            merged['Key'] = reg.Key.trim();
        }

        const key = merged['Key'];
        if (typeof key !== 'string' || key.trim().length === 0) {
            return null;
        }
        return merged as FormToolbarActionRegistrationMetadata;
    };

    interface ResolvedCandidate {
        Registration: (typeof allRegistrations)[number];
        Metadata: FormToolbarActionRegistrationMetadata;
    }

    const winnerByKey = new Map<string, ResolvedCandidate>();
    for (const reg of allRegistrations) {
        const meta = resolveEffectiveMetadata(reg);
        if (!meta) continue;
        if (!MatchesToolbarActionEntityScope(meta.EntityScope, entityInfo)) continue;

        const normKey = meta.Key.trim().toLowerCase();
        const existing = winnerByKey.get(normKey);
        if (!existing) {
            winnerByKey.set(normKey, { Registration: reg, Metadata: meta });
            continue;
        }

        // 1. Subclass always overrides its superclass
        if (isStrictSubclassOf(reg.SubClass, existing.Registration.SubClass)) {
            winnerByKey.set(normKey, { Registration: reg, Metadata: meta });
            continue;
        }
        if (isStrictSubclassOf(existing.Registration.SubClass, reg.SubClass)) {
            continue;
        }

        // 2. Specific EntityScope overrides global ('*') when priority is equal
        const candidateSpecific = isSpecificEntityScope(meta.EntityScope);
        const existingSpecific = isSpecificEntityScope(existing.Metadata.EntityScope);
        if (candidateSpecific && !existingSpecific && reg.Priority >= existing.Registration.Priority) {
            winnerByKey.set(normKey, { Registration: reg, Metadata: meta });
            continue;
        }
        if (existingSpecific && !candidateSpecific && existing.Registration.Priority >= reg.Priority) {
            continue;
        }

        // 3. Higher Priority (or last-registered on ties) wins
        if (reg.Priority >= existing.Registration.Priority) {
            winnerByKey.set(normKey, { Registration: reg, Metadata: meta });
        }
    }

    const instances: BaseFormToolbarAction[] = [];
    for (const winner of winnerByKey.values()) {
        const Ctor = winner.Registration.SubClass as new () => BaseFormToolbarAction;
        const instance = new Ctor();
        instance.Metadata = winner.Metadata;
        instances.push(instance);
    }

    return instances.sort((a, b) => (a.Metadata.Order ?? 100) - (b.Metadata.Order ?? 100));
}
