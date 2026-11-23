import { Inject, Injectable, InjectionToken, OnDestroy, Optional } from '@angular/core';
import { IMetadataProvider, Metadata, UserInfo } from '@memberjunction/core';
import { InstanceConfigEngine, MJUserApplicationEntity, UserInfoEngine } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import type { ShellChromeFlags } from '../shell-chrome-policy';

/**
 * Computed visibility flags for Explorer shell chrome controls.
 * Restricted participant profiles narrow these flags deterministically while
 * standard and administrative users retain full baseline shell chrome.
 */
export interface ShellChromeVisibility {
    showGlobalSearch: boolean;
    showFloatingChat: boolean;
    showAppSwitcher: boolean;
    showNotifications: boolean;
    showAdminMenuItems: boolean;
    isRestrictedParticipant: boolean;
}

/**
 * Role-based visibility rule evaluated against `UserInfo.UserRoles`.
 * Multiple matching rules compose fail-closed (boolean AND).
 */
export interface ShellChromePolicyRoleRule {
    /** Role name matched case-insensitively against `UserRoleInfo.Role`. */
    roleName?: string;
    /** Role UUID matched via case-insensitive `UUIDsEqual` against `UserRoleInfo.RoleID`. */
    roleId?: string;
    /** Whether matching this rule marks the session as a restricted participant (default true). */
    isRestrictedParticipant?: boolean;
    /** Optional per-control visibility overrides applied when this rule matches. */
    visibility?: Partial<Omit<ShellChromeVisibility, 'isRestrictedParticipant'>>;
}

/**
 * Domain-neutral policy configuration driving `ShellChromePolicyService`.
 */
export interface ShellChromePolicyConfig {
    /** Role names classified as restricted participants (case-insensitive). */
    restrictedRoleNames: string[];
    /** Role names classified as unrestricted internal/admin users (take precedence over generic heuristics). */
    unrestrictedRoleNames: string[];
    /** Explicit per-role rules evaluated in order and combined fail-closed. */
    roleRules: ShellChromePolicyRoleRule[];
    /** Baseline visibility flags when a user is classified as a restricted participant. */
    restrictedDefaults: Omit<ShellChromeVisibility, 'isRestrictedParticipant'>;
    /** When true and `UserInfoEngine` is loaded, having zero accessible applications restricts chrome. */
    restrictOnZeroAccessibleApps: boolean;
}

/**
 * Non-escalating per-user chrome preferences persisted via `UserInfoEngine.SetSettingDebounced`.
 * Preferences may narrow chrome (`false`) but can never re-enable controls disabled by policy.
 */
export interface ShellChromeUserPreferences {
    showGlobalSearch?: boolean;
    showFloatingChat?: boolean;
    showAppSwitcher?: boolean;
    showNotifications?: boolean;
    showAdminMenuItems?: boolean;
}

/**
 * Optional evaluation context for deterministic unit testing and multi-provider callers.
 */
export interface ShellChromePolicyEvaluateOptions {
    provider?: IMetadataProvider | null;
    user?: UserInfo | null;
    userInfoEngine?: UserInfoEngine | null;
    sessionRestrictedToApplicationId?: string | null;
    configOverride?: Partial<ShellChromePolicyConfig> | null;
}

/** DI token allowing host applications to inject default shell chrome policy configuration. */
export const SHELL_CHROME_POLICY_CONFIG = new InjectionToken<Partial<ShellChromePolicyConfig>>(
    'SHELL_CHROME_POLICY_CONFIG',
);

/** `UserInfoEngine` setting key for host/admin policy configuration JSON. */
export const SHELL_CHROME_POLICY_CONFIG_SETTING_KEY = 'mj.shell.chromePolicy.config.v1';

/** `UserInfoEngine` setting key for non-escalating user chrome preferences JSON. */
export const SHELL_CHROME_USER_PREFS_SETTING_KEY = 'mj.shell.chromePolicy.preferences.v1';

/** `InstanceConfigEngine` key for deployment-level shell chrome policy configuration JSON. */
export const SHELL_CHROME_POLICY_INSTANCE_CONFIG_KEY = 'Shell.ChromePolicy.Config';

/** Default domain-neutral role names treated as restricted external participants. */
export const DEFAULT_RESTRICTED_PARTICIPANT_ROLES: readonly string[] = [
    'External Participant',
    'Restricted Participant',
    'Participant',
    'External User',
    'Portal Guest',
    'Magic Link Baseline',
];

/** Default role names that retain unrestricted Explorer shell chrome. */
export const DEFAULT_UNRESTRICTED_ROLES: readonly string[] = [
    'Administrator',
    'Developer',
];

/** Default unrestricted shell chrome visibility for standard and administrative users. */
export const UNRESTRICTED_SHELL_CHROME_VISIBILITY: Readonly<ShellChromeVisibility> = {
    showGlobalSearch: true,
    showFloatingChat: true,
    showAppSwitcher: true,
    showNotifications: true,
    showAdminMenuItems: true,
    isRestrictedParticipant: false,
};

/** Default restricted shell chrome visibility for restricted participant profiles. */
export const RESTRICTED_SHELL_CHROME_VISIBILITY: Readonly<ShellChromeVisibility> = {
    showGlobalSearch: false,
    showFloatingChat: false,
    showAppSwitcher: false,
    showNotifications: false,
    showAdminMenuItems: false,
    isRestrictedParticipant: true,
};

type JsonPrimitive = string | number | boolean | null;
type JsonObject = { [key: string]: JsonValue };
type JsonValue = JsonPrimitive | JsonValue[] | JsonObject;

const VISIBILITY_FLAG_KEYS: readonly (keyof Omit<ShellChromeVisibility, 'isRestrictedParticipant'>)[] = [
    'showGlobalSearch',
    'showFloatingChat',
    'showAppSwitcher',
    'showNotifications',
    'showAdminMenuItems',
];

/**
 * Returns a fresh copy of the default domain-neutral `ShellChromePolicyConfig`.
 */
export function CreateDefaultShellChromePolicyConfig(): ShellChromePolicyConfig {
    return {
        restrictedRoleNames: [...DEFAULT_RESTRICTED_PARTICIPANT_ROLES],
        unrestrictedRoleNames: [...DEFAULT_UNRESTRICTED_ROLES],
        roleRules: [],
        restrictedDefaults: {
            showGlobalSearch: RESTRICTED_SHELL_CHROME_VISIBILITY.showGlobalSearch,
            showFloatingChat: RESTRICTED_SHELL_CHROME_VISIBILITY.showFloatingChat,
            showAppSwitcher: RESTRICTED_SHELL_CHROME_VISIBILITY.showAppSwitcher,
            showNotifications: RESTRICTED_SHELL_CHROME_VISIBILITY.showNotifications,
            showAdminMenuItems: RESTRICTED_SHELL_CHROME_VISIBILITY.showAdminMenuItems,
        },
        restrictOnZeroAccessibleApps: true,
    };
}

/**
 * Merges a partial policy configuration cleanly onto a base configuration without mutating inputs.
 */
export function MergeShellChromePolicyConfig(
    base: ShellChromePolicyConfig,
    override?: Partial<ShellChromePolicyConfig> | null,
): ShellChromePolicyConfig {
    if (!override) {
        return {
            ...base,
            restrictedRoleNames: [...base.restrictedRoleNames],
            unrestrictedRoleNames: [...base.unrestrictedRoleNames],
            roleRules: base.roleRules.map(cloneRoleRule),
            restrictedDefaults: { ...base.restrictedDefaults },
        };
    }

    return {
        restrictedRoleNames: Array.isArray(override.restrictedRoleNames)
            ? [...override.restrictedRoleNames]
            : [...base.restrictedRoleNames],
        unrestrictedRoleNames: Array.isArray(override.unrestrictedRoleNames)
            ? [...override.unrestrictedRoleNames]
            : [...base.unrestrictedRoleNames],
        roleRules: Array.isArray(override.roleRules)
            ? override.roleRules.map(cloneRoleRule)
            : base.roleRules.map(cloneRoleRule),
        restrictedDefaults: override.restrictedDefaults
            ? { ...base.restrictedDefaults, ...override.restrictedDefaults }
            : { ...base.restrictedDefaults },
        restrictOnZeroAccessibleApps:
            typeof override.restrictOnZeroAccessibleApps === 'boolean'
                ? override.restrictOnZeroAccessibleApps
                : base.restrictOnZeroAccessibleApps,
    };
}

/**
 * Structural equality helper for two `ShellChromeVisibility` snapshots.
 */
export function AreShellChromeVisibilitiesEqual(
    a: ShellChromeVisibility,
    b: ShellChromeVisibility,
): boolean {
    return (
        a.showGlobalSearch === b.showGlobalSearch &&
        a.showFloatingChat === b.showFloatingChat &&
        a.showAppSwitcher === b.showAppSwitcher &&
        a.showNotifications === b.showNotifications &&
        a.showAdminMenuItems === b.showAdminMenuItems &&
        a.isRestrictedParticipant === b.isRestrictedParticipant
    );
}

/**
 * Narrows existing `ShellChromeFlags` using resolved `ShellChromeVisibility`.
 * Never widens a `false` flag in `flags` back to `true`.
 */
export function ApplyShellChromeVisibilityToFlags(
    flags: ShellChromeFlags,
    visibility: ShellChromeVisibility,
): ShellChromeFlags {
    return {
        ...flags,
        searchBar: flags.searchBar && visibility.showGlobalSearch,
        searchPreview: flags.searchPreview && visibility.showGlobalSearch,
        notifications: flags.notifications && visibility.showNotifications,
        appSwitcher: flags.appSwitcher && visibility.showAppSwitcher,
        chatOverlay: flags.chatOverlay && visibility.showFloatingChat,
    };
}

function cloneRoleRule(rule: ShellChromePolicyRoleRule): ShellChromePolicyRoleRule {
    return {
        ...rule,
        visibility: rule.visibility ? { ...rule.visibility } : undefined,
    };
}

function isPlainJsonObject(value: JsonValue | undefined): value is JsonObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(obj: JsonObject, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(obj, key);
}

function parseJsonObject(raw: string | undefined | null): JsonObject | null {
    if (!raw || typeof raw !== 'string') {
        return null;
    }
    const trimmed = raw.trim();
    if (!trimmed) {
        return null;
    }
    try {
        const parsed: JsonValue = JSON.parse(trimmed);
        return isPlainJsonObject(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

function extractStringArray(obj: JsonObject, key: string): string[] | undefined {
    if (!hasOwn(obj, key)) {
        return undefined;
    }
    const val = obj[key];
    if (!Array.isArray(val)) {
        return undefined;
    }
    return val.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function extractVisibilityPartial(
    obj: JsonObject,
): Partial<Omit<ShellChromeVisibility, 'isRestrictedParticipant'>> | undefined {
    const out: Partial<Omit<ShellChromeVisibility, 'isRestrictedParticipant'>> = {};
    let hasAny = false;
    for (const key of VISIBILITY_FLAG_KEYS) {
        if (hasOwn(obj, key) && typeof obj[key] === 'boolean') {
            out[key] = obj[key] as boolean;
            hasAny = true;
        }
    }
    return hasAny ? out : undefined;
}

function extractRoleRules(obj: JsonObject): ShellChromePolicyRoleRule[] | undefined {
    if (!hasOwn(obj, 'roleRules') || !Array.isArray(obj['roleRules'])) {
        return undefined;
    }
    const rules: ShellChromePolicyRoleRule[] = [];
    for (const item of obj['roleRules']) {
        if (!isPlainJsonObject(item)) {
            continue;
        }
        const roleName = hasOwn(item, 'roleName') && typeof item['roleName'] === 'string' ? item['roleName'] : undefined;
        const roleId = hasOwn(item, 'roleId') && typeof item['roleId'] === 'string' ? item['roleId'] : undefined;
        if (!roleName && !roleId) {
            continue;
        }
        const isRestrictedParticipant =
            hasOwn(item, 'isRestrictedParticipant') && typeof item['isRestrictedParticipant'] === 'boolean'
                ? item['isRestrictedParticipant']
                : undefined;
        const visibility =
            hasOwn(item, 'visibility') && isPlainJsonObject(item['visibility'])
                ? extractVisibilityPartial(item['visibility'])
                : undefined;
        rules.push({ roleName, roleId, isRestrictedParticipant, visibility });
    }
    return rules;
}

function parsePolicyConfigJson(raw: string | undefined | null): Partial<ShellChromePolicyConfig> | null {
    const obj = parseJsonObject(raw);
    if (!obj) {
        return null;
    }
    const out: Partial<ShellChromePolicyConfig> = {};
    const restrictedRoleNames = extractStringArray(obj, 'restrictedRoleNames');
    if (restrictedRoleNames) {
        out.restrictedRoleNames = restrictedRoleNames;
    }
    const unrestrictedRoleNames = extractStringArray(obj, 'unrestrictedRoleNames');
    if (unrestrictedRoleNames) {
        out.unrestrictedRoleNames = unrestrictedRoleNames;
    }
    const roleRules = extractRoleRules(obj);
    if (roleRules) {
        out.roleRules = roleRules;
    }
    if (hasOwn(obj, 'restrictedDefaults') && isPlainJsonObject(obj['restrictedDefaults'])) {
        const partialDefaults = extractVisibilityPartial(obj['restrictedDefaults']);
        if (partialDefaults) {
            out.restrictedDefaults = {
                ...RESTRICTED_SHELL_CHROME_VISIBILITY,
                ...partialDefaults,
            };
        }
    }
    if (hasOwn(obj, 'restrictOnZeroAccessibleApps') && typeof obj['restrictOnZeroAccessibleApps'] === 'boolean') {
        out.restrictOnZeroAccessibleApps = obj['restrictOnZeroAccessibleApps'];
    }
    return out;
}

function parseUserPreferencesJson(raw: string | undefined | null): ShellChromeUserPreferences {
    const obj = parseJsonObject(raw);
    if (!obj) {
        return {};
    }
    return extractVisibilityPartial(obj) ?? {};
}

function normalizeRoleName(roleName: string | null | undefined): string {
    return (roleName ?? '').trim().toLowerCase();
}

/**
 * Evaluates and publishes deterministic Explorer shell chrome visibility flags for the
 * authenticated user from `UserInfoEngine.Instance` roles, application grants, and
 * persisted policy/preference settings without ever accessing browser web storage.
 */
@Injectable({ providedIn: 'root' })
export class ShellChromePolicyService implements OnDestroy {
    private readonly destroy$ = new Subject<void>();
    private policyConfig: ShellChromePolicyConfig;
    private readonly visibilitySubject: BehaviorSubject<ShellChromeVisibility>;

    /** Observable stream emitting visibility whenever user roles, apps, or policy settings change. */
    public readonly Visibility$: Observable<ShellChromeVisibility>;

    constructor(
        @Optional() @Inject(SHELL_CHROME_POLICY_CONFIG) initialConfig?: Partial<ShellChromePolicyConfig> | null,
    ) {
        this.policyConfig = MergeShellChromePolicyConfig(CreateDefaultShellChromePolicyConfig(), initialConfig);
        this.visibilitySubject = new BehaviorSubject<ShellChromeVisibility>(this.EvaluateVisibility());
        this.Visibility$ = this.visibilitySubject.asObservable();
        this.subscribeToEngineChanges();
    }

    /** Latest resolved visibility snapshot. */
    public get CurrentVisibility(): ShellChromeVisibility {
        return this.visibilitySubject.value;
    }

    /**
     * Evaluates visibility deterministically from `UserInfoEngine.Instance`, `CurrentUser`
     * roles, and non-escalating `UserInfoEngine` settings. Read-only: never writes settings.
     */
    public GetVisibility(options?: ShellChromePolicyEvaluateOptions): ShellChromeVisibility {
        return this.EvaluateVisibility(options);
    }

    /**
     * Computes `ShellChromeVisibility` for the given evaluation context (or live singletons).
     */
    public EvaluateVisibility(options?: ShellChromePolicyEvaluateOptions): ShellChromeVisibility {
        const provider = this.resolveProvider(options?.provider);
        const engine = this.resolveUserInfoEngine(provider, options?.userInfoEngine);
        const user = this.resolveUser(provider, engine, options?.user);
        const config = this.resolveEffectiveConfig(engine, options?.configOverride);

        const isRestricted = this.determineRestrictedStatus(user, engine, config, options?.sessionRestrictedToApplicationId);
        const matchingRules = this.findMatchingRoleRules(user, config);
        const visibility = this.buildBaseVisibility(isRestricted, config, matchingRules);
        const userPrefs = this.readUserPreferences(engine);

        return this.applyNonEscalatingUserPreferences(visibility, userPrefs);
    }

    /**
     * Re-evaluates visibility and notifies subscribers if any visibility flag changed.
     */
    public Refresh(options?: ShellChromePolicyEvaluateOptions): ShellChromeVisibility {
        const next = this.EvaluateVisibility(options);
        if (!AreShellChromeVisibilitiesEqual(this.visibilitySubject.value, next)) {
            this.visibilitySubject.next(next);
        }
        return next;
    }

    /**
     * Returns true when the current (or supplied) user resolves as a restricted participant.
     */
    public IsRestrictedParticipant(options?: ShellChromePolicyEvaluateOptions): boolean {
        return this.EvaluateVisibility(options).isRestrictedParticipant;
    }

    /** Returns a defensive copy of the active in-memory policy configuration. */
    public GetPolicyConfig(): ShellChromePolicyConfig {
        return MergeShellChromePolicyConfig(this.policyConfig);
    }

    /**
     * Updates the policy configuration and optionally persists it via `UserInfoEngine.SetSettingDebounced`.
     */
    public SetPolicyConfig(
        config: Partial<ShellChromePolicyConfig>,
        persist = false,
        options?: ShellChromePolicyEvaluateOptions,
    ): void {
        this.policyConfig = MergeShellChromePolicyConfig(this.policyConfig, config);
        if (persist) {
            const provider = this.resolveProvider(options?.provider);
            const engine = this.resolveUserInfoEngine(provider, options?.userInfoEngine);
            this.safeSetSettingDebounced(engine, SHELL_CHROME_POLICY_CONFIG_SETTING_KEY, JSON.stringify(this.policyConfig));
        }
        this.Refresh(options);
    }

    /**
     * Resets policy configuration to domain-neutral defaults and optionally clears persisted config.
     */
    public ResetPolicyConfig(clearPersisted = false, options?: ShellChromePolicyEvaluateOptions): void {
        this.policyConfig = CreateDefaultShellChromePolicyConfig();
        if (clearPersisted) {
            const provider = this.resolveProvider(options?.provider);
            const engine = this.resolveUserInfoEngine(provider, options?.userInfoEngine);
            this.safeSetSettingDebounced(engine, SHELL_CHROME_POLICY_CONFIG_SETTING_KEY, '');
        }
        this.Refresh(options);
    }

    /**
     * Reads the current user's persisted non-escalating chrome preferences from `UserInfoEngine`.
     */
    public GetUserPreferences(options?: ShellChromePolicyEvaluateOptions): ShellChromeUserPreferences {
        const provider = this.resolveProvider(options?.provider);
        const engine = this.resolveUserInfoEngine(provider, options?.userInfoEngine);
        return this.readUserPreferences(engine);
    }

    /**
     * Persists user chrome preferences via `UserInfoEngine.SetSettingDebounced`.
     * Policy boundaries remain fail-closed: preferences can narrow chrome but never widen past role rules.
     */
    public SetUserPreferences(
        preferences: Partial<ShellChromeUserPreferences>,
        options?: ShellChromePolicyEvaluateOptions,
    ): void {
        const provider = this.resolveProvider(options?.provider);
        const engine = this.resolveUserInfoEngine(provider, options?.userInfoEngine);
        const current = this.readUserPreferences(engine);
        const next: ShellChromeUserPreferences = { ...current, ...preferences };
        this.safeSetSettingDebounced(engine, SHELL_CHROME_USER_PREFS_SETTING_KEY, JSON.stringify(next));
        this.Refresh(options);
    }

    /**
     * Clears any persisted user-level chrome preference overrides via `UserInfoEngine.SetSettingDebounced`.
     */
    public ResetUserPreferences(options?: ShellChromePolicyEvaluateOptions): void {
        const provider = this.resolveProvider(options?.provider);
        const engine = this.resolveUserInfoEngine(provider, options?.userInfoEngine);
        this.safeSetSettingDebounced(engine, SHELL_CHROME_USER_PREFS_SETTING_KEY, '{}');
        this.Refresh(options);
    }

    /**
     * Narrows `ShellChromeFlags` with current (or supplied) `ShellChromeVisibility`.
     */
    public ApplyToChromeFlags(
        flags: ShellChromeFlags,
        visibility: ShellChromeVisibility = this.CurrentVisibility,
    ): ShellChromeFlags {
        return ApplyShellChromeVisibilityToFlags(flags, visibility);
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    private subscribeToEngineChanges(): void {
        const engine = UserInfoEngine.Instance;
        engine.UserApplications$?.pipe(takeUntil(this.destroy$)).subscribe(() => {
            this.Refresh();
        });
        engine.DataChange$?.pipe(takeUntil(this.destroy$)).subscribe(() => {
            this.Refresh();
        });
    }

    private resolveProvider(provider?: IMetadataProvider | null): IMetadataProvider | null {
        return provider ?? Metadata.Provider ?? null;
    }

    private resolveUserInfoEngine(
        provider: IMetadataProvider | null,
        explicitEngine?: UserInfoEngine | null,
    ): UserInfoEngine {
        if (explicitEngine) {
            return explicitEngine;
        }
        if (provider && provider.InstanceConnectionString) {
            return UserInfoEngine.GetProviderInstance<UserInfoEngine>(provider, UserInfoEngine) as UserInfoEngine;
        }
        return UserInfoEngine.Instance;
    }

    private resolveUser(
        provider: IMetadataProvider | null,
        engine: UserInfoEngine,
        explicitUser?: UserInfo | null,
    ): UserInfo | null {
        if (explicitUser !== undefined) {
            return explicitUser;
        }
        if (provider?.CurrentUser) {
            return provider.CurrentUser;
        }
        return engine.ProviderToUse?.CurrentUser ?? null;
    }

    private resolveEffectiveConfig(
        engine: UserInfoEngine,
        configOverride?: Partial<ShellChromePolicyConfig> | null,
    ): ShellChromePolicyConfig {
        let resolved = MergeShellChromePolicyConfig(this.policyConfig);

        const instanceRaw = this.safeGetInstanceConfig(SHELL_CHROME_POLICY_INSTANCE_CONFIG_KEY);
        const instanceParsed = parsePolicyConfigJson(instanceRaw);
        if (instanceParsed) {
            resolved = MergeShellChromePolicyConfig(resolved, instanceParsed);
        }

        const settingRaw = this.safeGetSetting(engine, SHELL_CHROME_POLICY_CONFIG_SETTING_KEY);
        const settingParsed = parsePolicyConfigJson(settingRaw);
        if (settingParsed) {
            resolved = this.mergeNonWeakeningSettingConfig(resolved, settingParsed);
        }

        if (configOverride) {
            resolved = MergeShellChromePolicyConfig(resolved, configOverride);
        }
        return resolved;
    }

    /**
     * Merges a `UserInfoEngine` setting-based policy config while preventing a user-writable
     * setting from stripping authoritative restricted roles, adding unrestricted bypass roles,
     * or disabling `restrictOnZeroAccessibleApps`.
     */
    private mergeNonWeakeningSettingConfig(
        authoritative: ShellChromePolicyConfig,
        settingConfig: Partial<ShellChromePolicyConfig>,
    ): ShellChromePolicyConfig {
        const mergedRestrictedRoles = new Set(authoritative.restrictedRoleNames);
        for (const role of settingConfig.restrictedRoleNames ?? []) {
            mergedRestrictedRoles.add(role);
        }

        const nextDefaults = { ...authoritative.restrictedDefaults };
        if (settingConfig.restrictedDefaults) {
            for (const key of VISIBILITY_FLAG_KEYS) {
                nextDefaults[key] = nextDefaults[key] && Boolean(settingConfig.restrictedDefaults[key]);
            }
        }

        return {
            restrictedRoleNames: [...mergedRestrictedRoles],
            unrestrictedRoleNames: [...authoritative.unrestrictedRoleNames],
            roleRules: [
                ...authoritative.roleRules.map(cloneRoleRule),
                ...(settingConfig.roleRules ?? []).map(cloneRoleRule),
            ],
            restrictedDefaults: nextDefaults,
            restrictOnZeroAccessibleApps: authoritative.restrictOnZeroAccessibleApps,
        };
    }

    private determineRestrictedStatus(
        user: UserInfo | null,
        engine: UserInfoEngine,
        config: ShellChromePolicyConfig,
        sessionRestrictedToApplicationId?: string | null,
    ): boolean {
        if (sessionRestrictedToApplicationId && sessionRestrictedToApplicationId.trim().length > 0) {
            return true;
        }
        if (this.hasUnrestrictedRole(user, config)) {
            return false;
        }
        if (this.hasRestrictedRoleOrRule(user, config)) {
            return true;
        }
        if (config.restrictOnZeroAccessibleApps && this.hasConfirmedZeroAccessibleApps(engine)) {
            return true;
        }
        return false;
    }

    private hasUnrestrictedRole(user: UserInfo | null, config: ShellChromePolicyConfig): boolean {
        if (!user) {
            return false;
        }
        if (user.Type === 'Owner') {
            return true;
        }
        const roles = Array.isArray(user.UserRoles) ? user.UserRoles : [];
        const unrestrictedSet = new Set(config.unrestrictedRoleNames.map(normalizeRoleName).filter(Boolean));
        return roles.some((ur) => unrestrictedSet.has(normalizeRoleName(ur.Role)));
    }

    private hasRestrictedRoleOrRule(user: UserInfo | null, config: ShellChromePolicyConfig): boolean {
        if (!user) {
            return false;
        }
        const roles = Array.isArray(user.UserRoles) ? user.UserRoles : [];
        const restrictedSet = new Set(config.restrictedRoleNames.map(normalizeRoleName).filter(Boolean));
        if (roles.some((ur) => restrictedSet.has(normalizeRoleName(ur.Role)))) {
            return true;
        }
        const matchingRules = this.findMatchingRoleRules(user, config);
        return matchingRules.some((rule) => rule.isRestrictedParticipant !== false);
    }

    private hasConfirmedZeroAccessibleApps(engine: UserInfoEngine): boolean {
        if (!engine.Loaded && !engine.LoadedForUserId) {
            return false;
        }
        try {
            if (typeof engine.IsPropertyPermissionConstrained === 'function' &&
                engine.IsPropertyPermissionConstrained('_userApplications')) {
                return true;
            }
            const activeApps: MJUserApplicationEntity[] = engine.ActiveUserApplications ?? [];
            const accessibleApps = activeApps.filter((ua) =>
                typeof engine.UserHasApplicationAccess === 'function'
                    ? engine.UserHasApplicationAccess(ua.ApplicationID)
                    : true,
            );
            return accessibleApps.length === 0;
        } catch {
            return true;
        }
    }

    private findMatchingRoleRules(user: UserInfo | null, config: ShellChromePolicyConfig): ShellChromePolicyRoleRule[] {
        if (!user || !Array.isArray(user.UserRoles) || config.roleRules.length === 0) {
            return [];
        }
        return config.roleRules.filter((rule) => this.roleRuleMatchesUser(rule, user));
    }

    private roleRuleMatchesUser(rule: ShellChromePolicyRoleRule, user: UserInfo): boolean {
        const targetName = normalizeRoleName(rule.roleName);
        return user.UserRoles.some((ur) => {
            if (rule.roleId && UUIDsEqual(ur.RoleID, rule.roleId)) {
                return true;
            }
            if (targetName && normalizeRoleName(ur.Role) === targetName) {
                return true;
            }
            return false;
        });
    }

    private buildBaseVisibility(
        isRestricted: boolean,
        config: ShellChromePolicyConfig,
        matchingRules: ShellChromePolicyRoleRule[],
    ): ShellChromeVisibility {
        const result: ShellChromeVisibility = isRestricted
            ? { ...config.restrictedDefaults, isRestrictedParticipant: true }
            : { ...UNRESTRICTED_SHELL_CHROME_VISIBILITY };

        for (const key of VISIBILITY_FLAG_KEYS) {
            let anyRuleExplicitlyFalse = false;
            let anyRuleExplicitlyTrue = false;
            for (const rule of matchingRules) {
                const ruleValue = rule.visibility?.[key];
                if (ruleValue === false) {
                    anyRuleExplicitlyFalse = true;
                } else if (ruleValue === true) {
                    anyRuleExplicitlyTrue = true;
                }
            }
            if (anyRuleExplicitlyFalse) {
                result[key] = false;
            } else if (isRestricted && anyRuleExplicitlyTrue) {
                result[key] = true;
            }
        }
        return result;
    }

    private applyNonEscalatingUserPreferences(
        boundary: ShellChromeVisibility,
        prefs: ShellChromeUserPreferences,
    ): ShellChromeVisibility {
        const next: ShellChromeVisibility = { ...boundary };
        for (const key of VISIBILITY_FLAG_KEYS) {
            if (prefs[key] === false) {
                next[key] = false;
            }
        }
        return next;
    }

    private readUserPreferences(engine: UserInfoEngine): ShellChromeUserPreferences {
        return parseUserPreferencesJson(this.safeGetSetting(engine, SHELL_CHROME_USER_PREFS_SETTING_KEY));
    }

    private safeGetSetting(engine: UserInfoEngine, key: string): string | undefined {
        try {
            return engine.GetSetting(key);
        } catch {
            return undefined;
        }
    }

    private safeSetSettingDebounced(engine: UserInfoEngine, key: string, value: string): void {
        try {
            engine.SetSettingDebounced(key, value);
        } catch {
            // Best-effort persistence when engine/provider is unavailable in isolated harnesses
        }
    }

    private safeGetInstanceConfig(key: string): string | undefined {
        try {
            return InstanceConfigEngine.Instance.Get(key);
        } catch {
            return undefined;
        }
    }
}
