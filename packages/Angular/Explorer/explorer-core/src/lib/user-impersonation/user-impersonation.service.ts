import { DestroyRef, inject, Injectable } from '@angular/core';
import {
    LocalCacheManager,
    LogError,
    Metadata,
    SetProvider,
    type IMetadataProvider,
    type UserInfo,
} from '@memberjunction/core';
import { UserInfoEngine } from '@memberjunction/core-entities';
import { GetGlobalObjectStore, MJEventType, MJGlobal, UUIDsEqual } from '@memberjunction/global';
import {
    GraphQLDataProvider,
    GraphQLProviderConfigData,
} from '@memberjunction/graphql-dataprovider';
import { ApplicationManager, WorkspaceStateManager } from '@memberjunction/ng-base-application';
import { SharedService } from '@memberjunction/ng-shared';
import { BehaviorSubject, distinctUntilChanged, map, type Observable } from 'rxjs';
import {
    MJ_USER_IMPERSONATION_TRANSPORT,
    type MJImpersonationActionResult,
    type MJImpersonationAppAdapter,
    type MJImpersonationCandidate,
    type MJImpersonationMode,
    type MJImpersonationProviderLike,
    type MJImpersonationState,
    type MJImpersonationTransportAdapter,
} from './user-impersonation.types';

const GRAPHQL_PROVIDER_SINGLETON_KEY = '___SINGLETON__GraphQLDataProvider';
const IMPERSONATION_SERVICE_GLOBAL_KEY = '___SINGLETON__MJUserImpersonationService';
const DEFAULT_TTL_MINUTES = 15; // Fallback mirroring server USER_IMPERSONATION_DEFAULT_TTL_MINUTES until MJCanImpersonateUsers responds
const MAX_TTL_MINUTES = 60; // Fallback mirroring server USER_IMPERSONATION_MAX_TTL_MINUTES ceiling until MJCanImpersonateUsers responds

const CAN_IMPERSONATE_QUERY = `
query MJCanImpersonateUsers {
  MJCanImpersonateUsers {
    CanImpersonate
    CanImpersonateWithWrites
    AuthorizationName
    WriteAuthorizationName
    DefaultTTLMinutes
    MaxTTLMinutes
    ResultCode
    Message
  }
}
`;

const LIST_IMPERSONATABLE_USERS_QUERY = `
query MJListImpersonatableUsers($input: MJListImpersonatableUsersInput) {
  MJListImpersonatableUsers(input: $input) {
    Authorized
    ResultCode
    Message
    TotalCount
    Users {
      UserID
      Name
      FirstName
      LastName
      Email
      Title
      Type
      RoleNames
    }
  }
}
`;

const START_USER_IMPERSONATION_MUTATION = `
mutation MJStartUserImpersonation($input: MJStartUserImpersonationInput!) {
  MJStartUserImpersonation(input: $input) {
    Success
    ResultCode
    Message
    RawApiKey
    APIKeyID
    ExpiresAt
    Mode
    ReadOnly
    TargetUser {
      UserID
      Name
      FirstName
      LastName
      Email
      Title
      Type
      RoleNames
    }
  }
}
`;

const END_USER_IMPERSONATION_MUTATION = `
mutation MJEndUserImpersonation($input: MJEndUserImpersonationInput!) {
  MJEndUserImpersonation(input: $input) {
    Success
    ResultCode
    Message
    APIKeyID
  }
}
`;

interface CanImpersonateWirePayload {
    CanImpersonate?: boolean;
    CanImpersonateWithWrites?: boolean;
    AuthorizationName?: string | null;
    WriteAuthorizationName?: string | null;
    DefaultTTLMinutes?: number | null;
    MaxTTLMinutes?: number | null;
    ResultCode?: string | null;
    Message?: string | null;
}

interface ImpersonatableUserWireRow {
    UserID: string;
    Name: string;
    FirstName?: string | null;
    LastName?: string | null;
    Email: string;
    Title?: string | null;
    Type?: string | null;
    RoleNames?: readonly string[] | null;
}

interface ListUsersWirePayload {
    Authorized?: boolean;
    ResultCode?: string | null;
    Message?: string | null;
    TotalCount?: number;
    Users?: readonly ImpersonatableUserWireRow[] | null;
}

interface StartImpersonationWirePayload {
    Success?: boolean;
    ResultCode?: string | null;
    Message?: string | null;
    RawApiKey?: string | null;
    APIKeyID?: string | null;
    ExpiresAt?: string | null;
    Mode?: string | null;
    ReadOnly?: boolean | null;
    TargetUser?: ImpersonatableUserWireRow | null;
}

interface EndImpersonationWirePayload {
    Success?: boolean;
    ResultCode?: string | null;
    Message?: string | null;
    APIKeyID?: string | null;
}

interface SavedUserInfoSettingMethods {
    readonly setSetting: (
        settingKey: string,
        value: string,
        contextUser?: UserInfo
    ) => Promise<boolean>;
    readonly setSettingDebounced: (
        settingKey: string,
        value: string,
        contextUser?: UserInfo
    ) => void;
    readonly deleteSetting: (settingKey: string) => Promise<boolean>;
}

function mapWireUser(row: ImpersonatableUserWireRow): MJImpersonationCandidate {
    return {
        userId: row.UserID,
        name: row.Name,
        firstName: row.FirstName?.trim() || null,
        lastName: row.LastName?.trim() || null,
        email: row.Email ?? '',
        title: row.Title?.trim() || null,
        type: row.Type?.trim() || null,
        roleNames: Array.isArray(row.RoleNames) ? [...row.RoleNames] : [],
    };
}

function isProviderLike(candidate: unknown): candidate is MJImpersonationProviderLike {
    return (
        typeof candidate === 'object' &&
        candidate !== null &&
        typeof (candidate as Partial<MJImpersonationProviderLike>).ExecuteGQL === 'function'
    );
}

function isMetadataProviderLike(
    candidate: MJImpersonationProviderLike
): candidate is MJImpersonationProviderLike & IMetadataProvider {
    return (
        'Entities' in candidate &&
        'GetEntityObject' in candidate &&
        typeof (candidate as Partial<IMetadataProvider>).GetEntityObject === 'function'
    );
}

/**
 * Retrieves the active root {@link MJUserImpersonationService} from MJ's Global Object Store
 * so non-DI application drivers and extensions can register adapters or trigger the switcher.
 */
export function GetActiveUserImpersonationService(): MJUserImpersonationService | null {
    const store = GetGlobalObjectStore();
    const candidate = store?.[IMPERSONATION_SERVICE_GLOBAL_KEY];
    return candidate instanceof MJUserImpersonationService ? candidate : null;
}

/**
 * Generic Explorer service coordinating Dual-Key, Read-Only-by-Default User Impersonation ("View As User...").
 *
 * Security & runtime invariants:
 * - Preserves the original authenticated `GraphQLDataProvider` before any impersonation switch so
 *   all control-plane operations always authenticate under the real user's Bearer JWT session.
 * - Never stores `rawApiKey` on service fields, observable state, DOM attributes, URLs, `UserInfoEngine`,
 *   or browser storage — holds it only in a transient local variable while constructing the impersonated
 *   `GraphQLDataProvider` and zeroes the reference immediately.
 * - Serializes all `StartImpersonation` / `ExitImpersonation` transitions through an async mutex queue
 *   so rapid double-clicks or concurrent switches never race or orphan server API keys.
 * - Flushes any pending `UserInfoEngine` debounced writes under the real actor BEFORE switching, and
 *   suppresses background `UserInfoEngine.SetSetting*` writes while Read-Only impersonation is active
 *   so UI splitter/grid/tab preference saves never spam mutation errors or pollute target user settings.
 * - Schedules automatic session exit at `ExpiresAt` and fires best-effort `keepalive` key revocation on
 *   browser tab `pagehide`.
 */
@Injectable({ providedIn: 'root' })
export class MJUserImpersonationService {
    private readonly injectedTransport = inject(MJ_USER_IMPERSONATION_TRANSPORT, { optional: true });
    private readonly appManager = inject(ApplicationManager, { optional: true });
    private readonly workspaceManager = inject(WorkspaceStateManager, { optional: true });
    private readonly destroyRef = inject(DestroyRef, { optional: true });

    private originalActorProvider: MJImpersonationProviderLike | null = null;
    private activeImpersonatedProvider: MJImpersonationProviderLike | null = null;
    private capabilityChecked = false;
    private transitionQueue: Promise<void> = Promise.resolve();
    private expiryTimer: ReturnType<typeof setTimeout> | null = null;
    private savedSettingMethods: SavedUserInfoSettingMethods | null = null;
    private pageHideListenerBound: (() => void) | null = null;
    private readonly adapters = new Map<string, MJImpersonationAppAdapter>();

    private readonly stateSubject = new BehaviorSubject<MJImpersonationState>({
        canImpersonate: false,
        canImpersonateWithWrites: false,
        activeTarget: null,
        mode: 'ViewAs',
        readOnly: true,
        apiKeyId: null,
        expiresAt: null,
        defaultTtlMinutes: DEFAULT_TTL_MINUTES,
        maxTtlMinutes: MAX_TTL_MINUTES,
        switching: false,
        errorMessage: null,
        actorIdentity: null,
    });
    private readonly dialogOpenSubject = new BehaviorSubject<boolean>(false);
    private readonly candidatesSubject = new BehaviorSubject<readonly MJImpersonationCandidate[]>([]);
    private readonly totalCountSubject = new BehaviorSubject<number>(0);
    private readonly loadingUsersSubject = new BehaviorSubject<boolean>(false);
    private readonly adaptersVersionSubject = new BehaviorSubject<number>(0);

    public readonly State$: Observable<MJImpersonationState> = this.stateSubject.asObservable();
    public readonly CanImpersonate$: Observable<boolean> = this.stateSubject.pipe(
        map((s) => s.canImpersonate),
        distinctUntilChanged()
    );
    public readonly IsImpersonating$: Observable<boolean> = this.stateSubject.pipe(
        map((s) => s.activeTarget !== null),
        distinctUntilChanged()
    );
    public readonly DialogOpen$: Observable<boolean> = this.dialogOpenSubject.asObservable();
    public readonly Candidates$: Observable<readonly MJImpersonationCandidate[]> =
        this.candidatesSubject.asObservable();
    public readonly TotalCount$: Observable<number> = this.totalCountSubject.asObservable();
    public readonly LoadingUsers$: Observable<boolean> = this.loadingUsersSubject.asObservable();
    public readonly AdaptersChanged$: Observable<number> = this.adaptersVersionSubject.asObservable();

    public constructor() {
        const store = GetGlobalObjectStore();
        if (store) {
            store[IMPERSONATION_SERVICE_GLOBAL_KEY] = this;
        }
        this.CaptureOriginalActorProvider();
        this.registerPageHideCleanup();
        this.destroyRef?.onDestroy(() => {
            this.clearExpiryTimer();
            this.restoreUserInfoSettingWrites();
            this.unregisterPageHideCleanup();
        });
    }

    public get CurrentState(): MJImpersonationState {
        return this.stateSubject.getValue();
    }

    public get CanImpersonate(): boolean {
        return this.stateSubject.getValue().canImpersonate;
    }

    public get CanImpersonateWithWrites(): boolean {
        return this.stateSubject.getValue().canImpersonateWithWrites;
    }

    public get ActiveTarget(): MJImpersonationCandidate | null {
        return this.stateSubject.getValue().activeTarget;
    }

    public get IsImpersonating(): boolean {
        return this.stateSubject.getValue().activeTarget !== null;
    }

    public get IsReadOnlySession(): boolean {
        const state = this.stateSubject.getValue();
        return state.activeTarget !== null && state.readOnly;
    }

    public get DialogOpen(): boolean {
        return this.dialogOpenSubject.getValue();
    }

    public get Candidates(): readonly MJImpersonationCandidate[] {
        return this.candidatesSubject.getValue();
    }

    /**
     * Captures and preserves the original authenticated `GraphQLDataProvider` before any
     * impersonation begins. Once captured, it is never overwritten by an impersonated provider.
     */
    public CaptureOriginalActorProvider(): MJImpersonationProviderLike | null {
        if (this.originalActorProvider) {
            return this.originalActorProvider;
        }
        const active = this.getTransport().getActiveProvider();
        if (active) {
            this.originalActorProvider = active;
            const user = active.CurrentUser;
            if (user && !this.stateSubject.getValue().actorIdentity) {
                this.patchState({
                    actorIdentity: {
                        id: user.ID,
                        name: user.Name || user.Email || user.ID,
                        email: user.Email || '',
                    },
                });
            }
        }
        return this.originalActorProvider;
    }

    /**
     * Verifies with the server (`MJCanImpersonateUsers`) whether user impersonation is enabled on
     * the server AND the real underlying user holds `User Impersonation` (and optionally `ActAs`).
     * Fails closed to `false`.
     */
    public async CheckCanImpersonate(forceRefresh: boolean = false): Promise<boolean> {
        if (this.capabilityChecked && !forceRefresh) {
            return this.stateSubject.getValue().canImpersonate;
        }

        const actorProvider = this.CaptureOriginalActorProvider();
        if (!actorProvider) {
            this.patchState({ canImpersonate: false, canImpersonateWithWrites: false });
            return false;
        }

        try {
            const response = await actorProvider.ExecuteGQL(CAN_IMPERSONATE_QUERY);
            const payload = response['MJCanImpersonateUsers'] as CanImpersonateWirePayload | undefined;
            const allowed = Boolean(payload?.CanImpersonate);
            const allowWrites = allowed && Boolean(payload?.CanImpersonateWithWrites);
            const defaultTtl =
                typeof payload?.DefaultTTLMinutes === 'number' && payload.DefaultTTLMinutes > 0
                    ? payload.DefaultTTLMinutes
                    : DEFAULT_TTL_MINUTES;
            const maxTtl =
                typeof payload?.MaxTTLMinutes === 'number' && payload.MaxTTLMinutes > 0
                    ? payload.MaxTTLMinutes
                    : MAX_TTL_MINUTES;

            this.capabilityChecked = true;
            this.patchState({
                canImpersonate: allowed,
                canImpersonateWithWrites: allowWrites,
                defaultTtlMinutes: defaultTtl,
                maxTtlMinutes: maxTtl,
            });
            return allowed;
        } catch {
            this.capabilityChecked = true;
            this.patchState({ canImpersonate: false, canImpersonateWithWrites: false });
            return false;
        }
    }

    /**
     * Registers an application-specific impersonation adapter (custom title, quick presets,
     * category filters, candidate enrichment, and post-switch callback).
     * Returns a disposer function that unregisters the adapter.
     */
    public RegisterAppAdapter(adapter: MJImpersonationAppAdapter): () => void {
        this.adapters.set(adapter.id, adapter);
        this.adaptersVersionSubject.next(this.adaptersVersionSubject.getValue() + 1);
        return () => this.UnregisterAppAdapter(adapter.id);
    }

    /** Unregisters a previously registered application adapter by its `id`. */
    public UnregisterAppAdapter(adapterId: string): void {
        if (this.adapters.delete(adapterId)) {
            this.adaptersVersionSubject.next(this.adaptersVersionSubject.getValue() + 1);
        }
    }

    /**
     * Returns registered adapters matching the currently active Explorer application
     * (plus global adapters with no `appPaths`), sorted by ascending priority.
     */
    public GetActiveAdapters(): readonly MJImpersonationAppAdapter[] {
        const activeApp = this.appManager?.GetActiveApp?.() ?? null;
        const activePath = (activeApp?.Path ?? '').trim().toLowerCase();
        const activeName = (activeApp?.Name ?? '').trim().toLowerCase();

        const matching: MJImpersonationAppAdapter[] = [];
        for (const adapter of this.adapters.values()) {
            if (!adapter.appPaths || adapter.appPaths.length === 0) {
                matching.push(adapter);
                continue;
            }
            const matchesApp = adapter.appPaths.some((p) => {
                const normalized = p.trim().toLowerCase();
                return normalized === activePath || normalized === activeName;
            });
            if (matchesApp) {
                matching.push(adapter);
            }
        }
        return matching.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
    }

    /** Opens the responsive "View As User..." dialog when the caller is authorized. */
    public OpenDialog(): void {
        if (!this.CanImpersonate) {
            return;
        }
        this.dialogOpenSubject.next(true);
        void this.LoadUsers('', true);
    }

    /** Closes the "View As User..." dialog. */
    public CloseDialog(): void {
        if (this.dialogOpenSubject.getValue()) {
            this.dialogOpenSubject.next(false);
        }
    }

    /**
     * Fetches active impersonatable users from the server over the preserved original actor session,
     * applies any active app adapters' `enrichCandidates` hooks, and updates `Candidates$`.
     */
    public async LoadUsers(
        search: string = '',
        forceRefresh: boolean = false,
        limit: number = 200
    ): Promise<readonly MJImpersonationCandidate[]> {
        if (!forceRefresh && !search.trim() && this.candidatesSubject.getValue().length > 0) {
            return this.candidatesSubject.getValue();
        }

        const actorProvider = this.CaptureOriginalActorProvider();
        if (!actorProvider || !this.CanImpersonate) {
            this.candidatesSubject.next([]);
            this.totalCountSubject.next(0);
            return [];
        }

        this.loadingUsersSubject.next(true);
        this.patchState({ errorMessage: null });

        try {
            const trimmedSearch = search.trim();
            const response = await actorProvider.ExecuteGQL(LIST_IMPERSONATABLE_USERS_QUERY, {
                input: {
                    ...(trimmedSearch ? { Search: trimmedSearch } : {}),
                    Limit: limit,
                },
            });
            const payload = response['MJListImpersonatableUsers'] as ListUsersWirePayload | undefined;

            if (!payload?.Authorized) {
                this.candidatesSubject.next([]);
                this.totalCountSubject.next(0);
                this.patchState({
                    errorMessage: payload?.Message ?? 'Not authorized to list impersonatable users.',
                });
                return [];
            }

            let candidates: readonly MJImpersonationCandidate[] = (payload.Users ?? []).map(mapWireUser);
            candidates = await this.applyAdapterEnrichments(candidates);
            const visible = candidates.filter((c) => !c.hidden);

            this.candidatesSubject.next(visible);
            this.totalCountSubject.next(
                typeof payload.TotalCount === 'number' ? payload.TotalCount : visible.length
            );
            return visible;
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unable to load users.';
            this.patchState({ errorMessage: message });
            return [];
        } finally {
            this.loadingUsersSubject.next(false);
        }
    }

    /**
     * Switches the active MJ GraphQL provider to a real server-authenticated impersonated session
     * for `targetUserId` using a newly minted short-lived (`15m` default) scoped API key.
     * Serialized through a transition mutex so rapid double-clicks never race or orphan keys.
     */
    public StartImpersonation(
        targetUserId: string,
        ttlMinutes?: number,
        mode: MJImpersonationMode = 'ViewAs'
    ): Promise<MJImpersonationActionResult> {
        return this.runSerializedTransition(() =>
            this.startImpersonationInternal(targetUserId, ttlMinutes, mode)
        );
    }

    /**
     * Revokes the active temporary impersonation API key over the preserved real user provider,
     * restores the original provider, restores `UserInfoEngine` write methods, flushes cached tabs,
     * and invokes adapter `afterSwitch(null)` hooks.
     */
    public ExitImpersonation(): Promise<MJImpersonationActionResult> {
        return this.runSerializedTransition(() => this.exitImpersonationInternal());
    }

    private runSerializedTransition<T>(task: () => Promise<T>): Promise<T> {
        const prior = this.transitionQueue;
        let release!: () => void;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        this.transitionQueue = prior.then(() => gate, () => gate);
        return prior
            .catch(() => undefined)
            .then(task)
            .finally(() => release());
    }

    private async startImpersonationInternal(
        targetUserId: string,
        ttlMinutes: number | undefined,
        requestedMode: MJImpersonationMode
    ): Promise<MJImpersonationActionResult> {
        const cleanTargetId = targetUserId.trim();
        if (!cleanTargetId) {
            return { success: false, message: 'A target user ID is required.' };
        }

        const actorProvider = this.CaptureOriginalActorProvider();
        const currentState = this.stateSubject.getValue();
        if (!actorProvider || !currentState.canImpersonate) {
            return { success: false, message: 'User Impersonation authorization is required.' };
        }

        if (requestedMode === 'ActAs' && !currentState.canImpersonateWithWrites) {
            return {
                success: false,
                message: 'Write-enabled impersonation (Act As) is not permitted for this session.',
            };
        }

        const previousApiKeyId = currentState.apiKeyId;
        const previousImpersonatedProvider = this.activeImpersonatedProvider;
        const wasAlreadyImpersonating = currentState.activeTarget !== null;

        this.patchState({ switching: true, errorMessage: null });

        try {
            // If switching from the real actor session, flush any pending debounced user settings
            // BEFORE swapping providers so actor preferences save under the real actor's account.
            if (!wasAlreadyImpersonating) {
                await this.flushActorSettingsSafely();
            }

            const startRes = await actorProvider.ExecuteGQL(START_USER_IMPERSONATION_MUTATION, {
                input: {
                    TargetUserID: cleanTargetId,
                    Mode: requestedMode,
                    ...(typeof ttlMinutes === 'number' ? { TTLMinutes: ttlMinutes } : {}),
                },
            });
            const payload = startRes['MJStartUserImpersonation'] as
                | StartImpersonationWirePayload
                | undefined;

            if (!payload?.Success || !payload.RawApiKey || !payload.APIKeyID || !payload.TargetUser) {
                const msg = payload?.Message ?? 'Failed to start user impersonation.';
                this.patchState({ switching: false, errorMessage: msg });
                return { success: false, message: msg };
            }

            const actorConfig = actorProvider.ConfigData;
            const transport = this.getTransport();
            let rawKeyTransient: string | null = payload.RawApiKey;
            let impersonatedProvider: MJImpersonationProviderLike;
            try {
                impersonatedProvider = await transport.createImpersonatedProvider({
                    graphqlUrl: actorConfig?.URL ?? '',
                    wsUrl: actorConfig?.WSURL ?? '',
                    rawApiKey: rawKeyTransient,
                    mjCoreSchemaName: actorConfig?.MJCoreSchemaName,
                    includeSchemas: actorConfig?.IncludeSchemas,
                    excludeSchemas: actorConfig?.ExcludeSchemas,
                    mjApiUrl: actorConfig?.MJAPIURL,
                });
            } catch (connectErr) {
                await this.revokeKeySilently(actorProvider, payload.APIKeyID);
                const msg =
                    connectErr instanceof Error
                        ? connectErr.message
                        : 'Failed to connect impersonated session.';
                this.patchState({ switching: false, errorMessage: msg });
                return { success: false, message: msg };
            } finally {
                // Zero transient rawApiKey reference immediately — never retained on service state.
                rawKeyTransient = null;
            }

            const confirmedMode: MJImpersonationMode = payload.Mode === 'ActAs' ? 'ActAs' : 'ViewAs';
            const confirmedReadOnly = confirmedMode !== 'ActAs' || payload.ReadOnly !== false;

            if (confirmedReadOnly) {
                this.suppressUserInfoSettingWrites();
            } else {
                this.restoreUserInfoSettingWrites();
            }

            // Atomically swap active MJ Metadata.Provider + GraphQLDataProvider singleton
            transport.installProvider(impersonatedProvider);
            this.activeImpersonatedProvider = impersonatedProvider;

            try {
                await transport.syncProviderReferences(impersonatedProvider);
            } catch {
                // Non-fatal: active provider is installed
            }

            // Revoke & dispose any previous impersonated key/provider now that the new session is active
            if (previousApiKeyId && previousApiKeyId !== payload.APIKeyID) {
                await this.revokeKeySilently(actorProvider, previousApiKeyId);
            }
            if (previousImpersonatedProvider && previousImpersonatedProvider !== impersonatedProvider) {
                await this.disposeProviderSilently(previousImpersonatedProvider);
            }

            const existingEnriched = this.candidatesSubject
                .getValue()
                .find((c) => UUIDsEqual(c.userId, cleanTargetId));
            const activeTarget = existingEnriched ?? mapWireUser(payload.TargetUser);

            this.scheduleExpiryAutoExit(payload.ExpiresAt ?? null);
            this.dialogOpenSubject.next(false);
            this.patchState({
                activeTarget,
                mode: confirmedMode,
                readOnly: confirmedReadOnly,
                apiKeyId: payload.APIKeyID,
                expiresAt: payload.ExpiresAt ?? null,
                switching: true,
                errorMessage: null,
            });

            await this.finalizeSwitchTransition(activeTarget);
            this.patchState({ switching: false });

            return {
                success: true,
                message: confirmedReadOnly
                    ? `Now viewing as ${activeTarget.name} (Read-Only).`
                    : `Now acting as ${activeTarget.name} (Write Mode Enabled).`,
            };
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unable to switch user.';
            this.patchState({ switching: false, errorMessage: message });
            return { success: false, message };
        }
    }

    private async exitImpersonationInternal(): Promise<MJImpersonationActionResult> {
        const state = this.stateSubject.getValue();
        const actorProvider = this.CaptureOriginalActorProvider();
        if (!actorProvider) {
            return { success: false, message: 'Original authenticated session is unavailable.' };
        }

        const keyIdToRevoke = state.apiKeyId;
        const discardedProvider = this.activeImpersonatedProvider;

        this.clearExpiryTimer();
        this.patchState({ switching: true, errorMessage: null });

        try {
            if (keyIdToRevoke) {
                await this.revokeKeySilently(actorProvider, keyIdToRevoke);
            }

            const transport = this.getTransport();
            transport.installProvider(actorProvider);
            this.activeImpersonatedProvider = null;
            this.restoreUserInfoSettingWrites();

            try {
                await transport.syncProviderReferences(actorProvider);
            } catch {
                // Non-fatal
            }

            if (discardedProvider && discardedProvider !== actorProvider) {
                await this.disposeProviderSilently(discardedProvider);
            }

            this.dialogOpenSubject.next(false);
            this.patchState({
                activeTarget: null,
                mode: 'ViewAs',
                readOnly: true,
                apiKeyId: null,
                expiresAt: null,
                switching: true,
                errorMessage: null,
            });

            await this.finalizeSwitchTransition(null);
            this.patchState({ switching: false });

            return {
                success: true,
                message: 'Returned to your account.',
            };
        } catch (err) {
            this.restoreUserInfoSettingWrites();
            const message = err instanceof Error ? err.message : 'Unable to exit impersonation.';
            this.patchState({ switching: false, errorMessage: message });
            return { success: false, message };
        }
    }

    private patchState(partial: Partial<MJImpersonationState>): void {
        this.stateSubject.next({
            ...this.stateSubject.getValue(),
            ...partial,
        });
    }

    private async flushActorSettingsSafely(): Promise<void> {
        try {
            const engine = UserInfoEngine.Instance;
            if (engine?.HasPendingSettings) {
                await engine.FlushPendingSettings();
            }
        } catch {
            // Non-fatal: never block impersonation start if UserInfoEngine is uninitialized
        }
    }

    /**
     * Suppresses background `UserInfoEngine` preference mutations (`SetSetting`, `SetSettingDebounced`,
     * `DeleteSetting`) while Read-Only impersonation is active so splitter/grid/tab layout changes do
     * not spam GraphQL `IMPERSONATION_READ_ONLY` errors or mutate the target user's stored preferences.
     */
    private suppressUserInfoSettingWrites(): void {
        if (this.savedSettingMethods) {
            return;
        }
        try {
            const engine = UserInfoEngine.Instance;
            if (!engine) {
                return;
            }
            this.savedSettingMethods = {
                setSetting: engine.SetSetting,
                setSettingDebounced: engine.SetSettingDebounced,
                deleteSetting: engine.DeleteSetting,
            };
            engine.SetSetting = async (): Promise<boolean> => true;
            engine.SetSettingDebounced = (): void => {
                // No-op during Read-Only user impersonation
            };
            engine.DeleteSetting = async (): Promise<boolean> => true;
        } catch {
            // Non-fatal in minimal test environments
        }
    }

    private restoreUserInfoSettingWrites(): void {
        if (!this.savedSettingMethods) {
            return;
        }
        try {
            const engine = UserInfoEngine.Instance;
            if (engine) {
                engine.SetSetting = this.savedSettingMethods.setSetting;
                engine.SetSettingDebounced = this.savedSettingMethods.setSettingDebounced;
                engine.DeleteSetting = this.savedSettingMethods.deleteSetting;
            }
        } catch {
            // Non-fatal
        } finally {
            this.savedSettingMethods = null;
        }
    }

    private scheduleExpiryAutoExit(expiresAtIso: string | null): void {
        this.clearExpiryTimer();
        if (!expiresAtIso) {
            return;
        }
        const expiresMs = Date.parse(expiresAtIso);
        if (!Number.isFinite(expiresMs)) {
            return;
        }
        const delayMs = Math.max(0, expiresMs - Date.now());
        this.expiryTimer = setTimeout(() => {
            this.expiryTimer = null;
            if (this.IsImpersonating) {
                void this.ExitImpersonation();
            }
        }, delayMs);
        const maybeNodeTimer = this.expiryTimer as { unref?: () => void };
        maybeNodeTimer.unref?.();
    }

    private clearExpiryTimer(): void {
        if (this.expiryTimer !== null) {
            clearTimeout(this.expiryTimer);
            this.expiryTimer = null;
        }
    }

    private registerPageHideCleanup(): void {
        const win = (globalThis as { window?: Window }).window;
        if (!win || typeof win.addEventListener !== 'function') {
            return;
        }
        this.pageHideListenerBound = () => {
            this.handlePageHideCleanup();
        };
        win.addEventListener('pagehide', this.pageHideListenerBound);
    }

    private unregisterPageHideCleanup(): void {
        const win = (globalThis as { window?: Window }).window;
        if (win && this.pageHideListenerBound && typeof win.removeEventListener === 'function') {
            win.removeEventListener('pagehide', this.pageHideListenerBound);
        }
        this.pageHideListenerBound = null;
    }

    private handlePageHideCleanup(): void {
        const state = this.stateSubject.getValue();
        if (!state.apiKeyId) {
            return;
        }
        const keyId = state.apiKeyId;
        const actorProvider = this.originalActorProvider;
        const discarded = this.activeImpersonatedProvider;

        this.clearExpiryTimer();
        this.restoreUserInfoSettingWrites();
        this.activeImpersonatedProvider = null;

        const graphqlUrl = actorProvider?.ConfigData?.URL;
        const bearerToken = actorProvider?.ConfigData?.Token;
        if (graphqlUrl && bearerToken && typeof fetch === 'function') {
            try {
                const authHeader = bearerToken.startsWith('Bearer ')
                    ? bearerToken
                    : `Bearer ${bearerToken}`;
                void fetch(graphqlUrl, {
                    method: 'POST',
                    keepalive: true,
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: authHeader,
                    },
                    body: JSON.stringify({
                        query: END_USER_IMPERSONATION_MUTATION,
                        variables: { input: { APIKeyID: keyId } },
                    }),
                }).catch(() => undefined);
            } catch {
                // Best-effort unload revocation
            }
        } else if (actorProvider) {
            void this.revokeKeySilently(actorProvider, keyId);
        }

        if (discarded && discarded !== actorProvider) {
            void this.disposeProviderSilently(discarded);
        }
    }

    private async applyAdapterEnrichments(
        baseCandidates: readonly MJImpersonationCandidate[]
    ): Promise<readonly MJImpersonationCandidate[]> {
        let current = baseCandidates;
        for (const adapter of this.GetActiveAdapters()) {
            if (!adapter.enrichCandidates) {
                continue;
            }
            try {
                current = await adapter.enrichCandidates(current);
            } catch (err) {
                LogError(
                    `MJUserImpersonationService adapter "${adapter.id}" enrichCandidates failed: ${err instanceof Error ? err.message : String(err)}`
                );
            }
        }
        return current;
    }

    private async finalizeSwitchTransition(activeTarget: MJImpersonationCandidate | null): Promise<void> {
        const transport = this.getTransport();
        if (transport.resetWorkspaceAfterSwitch) {
            try {
                await transport.resetWorkspaceAfterSwitch();
            } catch {
                // Non-fatal
            }
        } else {
            await this.resetWorkspaceTabsAndCache();
        }

        for (const adapter of this.GetActiveAdapters()) {
            if (!adapter.afterSwitch) {
                continue;
            }
            try {
                await adapter.afterSwitch(activeTarget);
            } catch (err) {
                LogError(
                    `MJUserImpersonationService adapter "${adapter.id}" afterSwitch failed: ${err instanceof Error ? err.message : String(err)}`
                );
            }
        }
    }

    private async resetWorkspaceTabsAndCache(): Promise<void> {
        try {
            // Clear LocalCacheManager entries on every enter/switch/exit boundary so actor and
            // impersonated target rows can never mix in local storage or memory caches.
            if (LocalCacheManager.Instance?.IsInitialized) {
                await LocalCacheManager.Instance.ClearAll();
            }
            if (this.workspaceManager) {
                const cfg = this.workspaceManager.GetConfiguration();
                const activeTabId = cfg?.activeTabId;
                if (activeTabId) {
                    this.workspaceManager.CloseOtherTabs(activeTabId);
                }
            }
            // Flush Explorer's ComponentCacheManager so detached resource components from the
            // previous user are destroyed rather than reattached with stale RLS-scoped data.
            MJGlobal.Instance.RaiseEvent({
                component: this,
                event: MJEventType.TenantChanged,
                eventCode: 'TenantChanged',
                args: null,
            });
        } catch {
            // Non-fatal
        }
    }

    private async revokeKeySilently(
        actorProvider: MJImpersonationProviderLike,
        apiKeyId: string
    ): Promise<void> {
        try {
            const res = await actorProvider.ExecuteGQL(END_USER_IMPERSONATION_MUTATION, {
                input: { APIKeyID: apiKeyId },
            });
            const payload = res['MJEndUserImpersonation'] as EndImpersonationWirePayload | undefined;
            void payload;
        } catch {
            // Non-fatal: temporary keys also expire automatically via server 15m TTL.
        }
    }

    private async disposeProviderSilently(provider: MJImpersonationProviderLike): Promise<void> {
        try {
            if (typeof provider.Dispose === 'function') {
                await provider.Dispose();
            }
        } catch {
            // Non-fatal cleanup
        }
    }

    private getTransport(): MJImpersonationTransportAdapter {
        if (this.injectedTransport) {
            return this.injectedTransport;
        }
        return {
            getActiveProvider: (): MJImpersonationProviderLike | null => {
                try {
                    const mdProvider = Metadata.Provider; // global-provider-ok: Explorer impersonation service explicitly captures/swaps the process-global active provider
                    if (isProviderLike(mdProvider)) {
                        return mdProvider;
                    }
                } catch {
                    // Metadata.Provider may throw if not initialized yet
                }
                const store = GetGlobalObjectStore();
                const singleton = store?.[GRAPHQL_PROVIDER_SINGLETON_KEY];
                return isProviderLike(singleton) ? singleton : null;
            },
            installProvider: (provider: MJImpersonationProviderLike): void => {
                if (isMetadataProviderLike(provider)) {
                    SetProvider(provider);
                }
                const store = GetGlobalObjectStore();
                if (store) {
                    store[GRAPHQL_PROVIDER_SINGLETON_KEY] = provider;
                }
            },
            createImpersonatedProvider: async ({
                graphqlUrl,
                wsUrl,
                rawApiKey,
                mjCoreSchemaName,
                includeSchemas,
                excludeSchemas,
                mjApiUrl,
            }): Promise<MJImpersonationProviderLike> => {
                const provider = new GraphQLDataProvider(true);
                const configData = new GraphQLProviderConfigData(
                    '',
                    graphqlUrl,
                    wsUrl,
                    async () => '',
                    mjCoreSchemaName,
                    includeSchemas,
                    excludeSchemas,
                    undefined,
                    rawApiKey
                );
                if (mjApiUrl) {
                    configData.MJAPIURL = mjApiUrl;
                }
                const ok = await provider.Config(configData, undefined, true);
                if (!ok) {
                    throw new Error('Impersonated GraphQLDataProvider Config() failed.');
                }
                // ProviderBase.Config() fast-copies entity metadata from the active global
                // Metadata.Provider (including the original actor's CurrentUser). Explicitly
                // refresh CurrentUser from the server over the impersonated API key so roles
                // and permissions reflect the target user immediately.
                const impersonatedUser = await provider.RefreshCurrentUser();
                if (!impersonatedUser) {
                    throw new Error('Impersonated GraphQLDataProvider failed to resolve target CurrentUser.');
                }
                return provider;
            },
            syncProviderReferences: async (provider: MJImpersonationProviderLike): Promise<void> => {
                // Intentionally avoid UserInfoEngine.Instance.Config(true, ...) during impersonation:
                // UserInfoEngine emits DataChange$ before updating _loadedForUserId, which can make
                // ApplicationManager emit [] and trigger ShellComponent teardown. Updating provider
                // references in place keeps Explorer mounted cleanly while all queries run under the
                // active impersonated session.
                const metaProvider = isMetadataProviderLike(provider) ? provider : undefined;
                if (metaProvider) {
                    if (this.appManager) {
                        this.appManager.Provider = metaProvider;
                        for (const app of this.appManager.GetAllSystemApps()) {
                            app.Provider = metaProvider;
                        }
                    }
                    if (this.workspaceManager) {
                        this.workspaceManager.Provider = metaProvider;
                    }
                    if (SharedService.Instance) {
                        SharedService.Instance.Provider = metaProvider;
                    }
                }
                if (provider instanceof GraphQLDataProvider) {
                    provider.InvalidateRunViewDedupCache();
                }
            },
        };
    }
}
