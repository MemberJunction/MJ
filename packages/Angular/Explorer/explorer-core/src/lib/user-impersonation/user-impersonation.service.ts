import { inject, Injectable } from '@angular/core';
import {
    LogError,
    Metadata,
    SetProvider,
    type IMetadataProvider,
} from '@memberjunction/core';
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
    type MJImpersonationProviderLike,
    type MJImpersonationState,
    type MJImpersonationTransportAdapter,
} from './user-impersonation.types';

const GRAPHQL_PROVIDER_SINGLETON_KEY = '___SINGLETON__GraphQLDataProvider';
const IMPERSONATION_SERVICE_GLOBAL_KEY = '___SINGLETON__MJUserImpersonationService';

const CAN_IMPERSONATE_QUERY = `
query MJCanImpersonateUsers {
  MJCanImpersonateUsers {
    CanImpersonate
    AuthorizationName
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
    AuthorizationName?: string | null;
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
    TargetUser?: ImpersonatableUserWireRow | null;
}

interface EndImpersonationWirePayload {
    Success?: boolean;
    ResultCode?: string | null;
    Message?: string | null;
    APIKeyID?: string | null;
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
 * Generic Explorer service coordinating Authorization-gated User Impersonation ("View As User...").
 *
 * Key invariants:
 * - Preserves the original authenticated `GraphQLDataProvider` before any impersonation switch so
 *   all control-plane operations (`MJCanImpersonateUsers`, `MJListImpersonatableUsers`,
 *   `MJStartUserImpersonation`, `MJEndUserImpersonation`) always authenticate under the real user's
 *   session — enabling seamless User A -> User B -> Exit transitions.
 * - Atomically swaps `Metadata.Provider`, the `GraphQLDataProvider` global singleton, and Explorer
 *   service provider references in place without triggering `UserInfoEngine.Config(true)` shell teardown.
 * - Emits `MJEventType.TenantChanged` to flush `ComponentCacheManager` so cached tabs never bleed
 *   previous-user data into the new user's RLS scope.
 * - Exposes {@link RegisterAppAdapter} so any MJ application can contribute custom dialog titles,
 *   quick-switch presets, category filters, candidate enrichment, and post-switch navigation.
 */
@Injectable({ providedIn: 'root' })
export class MJUserImpersonationService {
    private readonly injectedTransport = inject(MJ_USER_IMPERSONATION_TRANSPORT, { optional: true });
    private readonly appManager = inject(ApplicationManager, { optional: true });
    private readonly workspaceManager = inject(WorkspaceStateManager, { optional: true });

    private originalActorProvider: MJImpersonationProviderLike | null = null;
    private activeImpersonatedProvider: MJImpersonationProviderLike | null = null;
    private capabilityChecked = false;
    private readonly adapters = new Map<string, MJImpersonationAppAdapter>();

    private readonly stateSubject = new BehaviorSubject<MJImpersonationState>({
        canImpersonate: false,
        activeTarget: null,
        apiKeyId: null,
        expiresAt: null,
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
    }

    public get CurrentState(): MJImpersonationState {
        return this.stateSubject.getValue();
    }

    public get CanImpersonate(): boolean {
        return this.stateSubject.getValue().canImpersonate;
    }

    public get ActiveTarget(): MJImpersonationCandidate | null {
        return this.stateSubject.getValue().activeTarget;
    }

    public get IsImpersonating(): boolean {
        return this.stateSubject.getValue().activeTarget !== null;
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
     * Verifies with the server (`MJCanImpersonateUsers`) whether the real underlying user holds
     * an explicit `User Impersonation` authorization grant. Fails closed to `false`.
     */
    public async CheckCanImpersonate(forceRefresh: boolean = false): Promise<boolean> {
        if (this.capabilityChecked && !forceRefresh) {
            return this.stateSubject.getValue().canImpersonate;
        }

        const actorProvider = this.CaptureOriginalActorProvider();
        if (!actorProvider) {
            this.patchState({ canImpersonate: false });
            return false;
        }

        try {
            const response = await actorProvider.ExecuteGQL(CAN_IMPERSONATE_QUERY);
            const payload = response['MJCanImpersonateUsers'] as CanImpersonateWirePayload | undefined;
            const allowed = Boolean(payload?.CanImpersonate);
            this.capabilityChecked = true;
            this.patchState({ canImpersonate: allowed });
            return allowed;
        } catch {
            this.capabilityChecked = true;
            this.patchState({ canImpersonate: false });
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
     * for `targetUserId` using a newly minted short-lived scoped API key.
     */
    public async StartImpersonation(
        targetUserId: string,
        ttlMinutes?: number
    ): Promise<MJImpersonationActionResult> {
        const cleanTargetId = targetUserId.trim();
        if (!cleanTargetId) {
            return { success: false, message: 'A target user ID is required.' };
        }

        const actorProvider = this.CaptureOriginalActorProvider();
        if (!actorProvider || !this.CanImpersonate) {
            return { success: false, message: 'User Impersonation authorization is required.' };
        }

        const previousApiKeyId = this.stateSubject.getValue().apiKeyId;
        const previousImpersonatedProvider = this.activeImpersonatedProvider;

        this.patchState({ switching: true, errorMessage: null });

        try {
            const startRes = await actorProvider.ExecuteGQL(START_USER_IMPERSONATION_MUTATION, {
                input: {
                    TargetUserID: cleanTargetId,
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
            let impersonatedProvider: MJImpersonationProviderLike;
            try {
                impersonatedProvider = await transport.createImpersonatedProvider({
                    graphqlUrl: actorConfig?.URL ?? '',
                    wsUrl: actorConfig?.WSURL ?? '',
                    rawApiKey: payload.RawApiKey,
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

            this.dialogOpenSubject.next(false);
            this.patchState({
                activeTarget,
                apiKeyId: payload.APIKeyID,
                expiresAt: payload.ExpiresAt ?? null,
                switching: true,
                errorMessage: null,
            });

            await this.finalizeSwitchTransition(activeTarget);
            this.patchState({ switching: false });

            return {
                success: true,
                message: `Now viewing as ${activeTarget.name}.`,
            };
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unable to switch user.';
            this.patchState({ switching: false, errorMessage: message });
            return { success: false, message };
        }
    }

    /**
     * Revokes the active temporary impersonation API key over the preserved real user provider,
     * restores the original provider, flushes cached tabs, and invokes adapter `afterSwitch(null)` hooks.
     */
    public async ExitImpersonation(): Promise<MJImpersonationActionResult> {
        const state = this.stateSubject.getValue();
        const actorProvider = this.CaptureOriginalActorProvider();
        if (!actorProvider) {
            return { success: false, message: 'Original authenticated session is unavailable.' };
        }

        const keyIdToRevoke = state.apiKeyId;
        const discardedProvider = this.activeImpersonatedProvider;

        this.patchState({ switching: true, errorMessage: null });

        try {
            if (keyIdToRevoke) {
                await this.revokeKeySilently(actorProvider, keyIdToRevoke);
            }

            const transport = this.getTransport();
            transport.installProvider(actorProvider);
            this.activeImpersonatedProvider = null;

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
            this.resetWorkspaceTabsAndCache();
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

    private resetWorkspaceTabsAndCache(): void {
        try {
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
            // Non-fatal: temporary keys also expire automatically via server TTL.
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
                    const mdProvider = Metadata.Provider;
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
