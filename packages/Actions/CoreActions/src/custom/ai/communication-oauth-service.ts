/**
 * @fileoverview Posture 3 Per-User OAuth 2.0 (`3LO`) Service & Route Handlers for Enterprise
 * Communication Providers (Microsoft Graph & Google Workspace).
 *
 * Implements Stage 8, Deliverable 4 of the Chief of Staff architecture:
 * - **PKCE (`S256`) Authorization Flow (`/api/v1/communication-oauth/initiate`)**
 * - **OAuth 2.0 Callback & Token Exchange (`/api/v1/communication-oauth/callback`)**
 * - **Four Mandatory Enterprise Security Gates**:
 *   1. `AllowUserDelegatedOAuth === true` (admin opt-in gate)
 *   2. `AllowedEmailDomains` match on both `contextUser.Email` and the authenticated OAuth identity
 *   3. `AllowedOAuthTenantIDs` match on the token's tenant/workspace claim (`tid` / `hd`)
 *   4. Strict Principal Match (`tokenProfile.email === contextUser.Email`, case-insensitive) — blocks
 *      a user from linking a personal `@gmail.com` or another employee's mailbox to their corporate MJ identity
 * - **Per-User `OwnerUserID` Isolation in `CredentialEngine`**
 * - **One-Click Disconnect & Token Revocation**
 *
 * @module @memberjunction/core-actions
 */

import * as crypto from 'crypto';
import { IMetadataProvider, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { BaseSingleton, EscapeSQLString, SafeJSONParse, UUIDsEqual } from '@memberjunction/global';
import { MJCredentialEntity } from '@memberjunction/core-entities';
import { BaseUserScopedCommunicationAction } from './chief-of-staff-calendar-email.action';

/**
 * Values stored in a per-user delegated OAuth 2.0 (`3LO`) credential.
 */
export interface UserDelegatedOAuthStoredValues {
    [key: string]: string;
    ownerUserId: string;
    principalEmail: string;
    providerName: string;
    accessToken: string;
    refreshToken: string;
    tokenType: string;
    scope: string;
    tenantId: string;
    issuedAt: string;
}

/**
 * Options for storing a per-user delegated OAuth 2.0 (`3LO`) credential.
 */
export interface StoreUserDelegatedOAuthInput {
    providerName: string;
    ownerUserId: string;
    principalEmail: string;
    accessToken: string;
    refreshToken?: string;
    tokenType?: string;
    scope?: string;
    tenantId?: string;
    expiresAt?: Date;
}

/**
 * Structural interface satisfied by `CredentialEngine.Instance` in `@memberjunction/credentials`.
 */
export interface IUserDelegatedCredentialStore {
    StoreUserDelegatedCredential(
        options: StoreUserDelegatedOAuthInput,
        contextUser: UserInfo
    ): Promise<Pick<MJCredentialEntity, 'ID'>>;

    GetUserDelegatedCredential(
        providerName: string,
        contextUser: UserInfo
    ): Promise<{ values: UserDelegatedOAuthStoredValues } | null>;

    RevokeUserDelegatedCredential(
        providerName: string,
        contextUser: UserInfo
    ): Promise<boolean>;
}

/**
 * Admin-configured Posture 3 OAuth 2.0 (`3LO`) policy for a communication provider.
 */
export interface ProviderUserOAuthPolicyConfig {
    ProviderName: 'Microsoft Graph' | 'Gmail' | string;
    /** Gate 1: Admin must explicitly enable Posture 3 per-user delegated OAuth. */
    AllowUserDelegatedOAuth: boolean;
    /** Gate 2: Optional comma-separated list of permitted corporate email domains (e.g., "company.com,sub.company.com"). */
    AllowedEmailDomains?: string | null;
    /** Gate 3: Optional list of permitted Azure AD Tenant IDs (`tid`) or Google Workspace hosted domains (`hd`). */
    AllowedOAuthTenantIDs?: string[] | null;
    ClientId: string;
    ClientSecret?: string;
    AuthorizationEndpoint: string;
    TokenEndpoint: string;
    RevocationEndpoint?: string;
    RedirectUri: string;
    Scopes: string[];
}

/**
 * Ephemeral PKCE (`S256`) authorization session created by `/api/v1/communication-oauth/initiate`.
 */
export interface PendingOAuthAuthorizationSession {
    State: string;
    CodeVerifier: string;
    CodeChallenge: string;
    CodeChallengeMethod: 'S256';
    UserID: string;
    UserEmail: string;
    ProviderName: string;
    RedirectUri: string;
    CreatedAtMs: number;
    ExpiresAtMs: number;
}

/**
 * Verified identity and token payload returned by the OAuth provider's token & userinfo/id_token exchange.
 */
export interface VerifiedOAuthTokenExchangeResult {
    AccessToken: string;
    RefreshToken?: string;
    TokenType?: string;
    Scope?: string;
    ExpiresInSeconds?: number;
    /** Verified email address of the authenticated OAuth principal (from `id_token` or `/me` / `/userinfo`). */
    PrincipalEmail: string;
    /** Verified Azure AD `tid` or Google Workspace `hd` tenant identifier. */
    TenantID?: string | null;
}

/**
 * Injectable token exchange & revocation transport seam (defaults to `fetch` against Microsoft/Google endpoints).
 */
export interface IOAuthTokenTransport {
    ExchangeAuthorizationCode(params: {
        policy: ProviderUserOAuthPolicyConfig;
        code: string;
        codeVerifier: string;
        redirectUri: string;
    }): Promise<VerifiedOAuthTokenExchangeResult>;

    RevokeToken?(params: {
        policy: ProviderUserOAuthPolicyConfig;
        token: string;
    }): Promise<boolean>;
}

/**
 * Result codes returned by `CommunicationUserOAuthService`.
 */
export type CommunicationOAuthResultCode =
    | 'AUTHORIZATION_INITIATED'
    | 'OAUTH_CONNECTED'
    | 'OAUTH_DISCONNECTED'
    | 'GATE_1_USER_OAUTH_DISABLED'
    | 'GATE_2_DOMAIN_MISMATCH'
    | 'GATE_3_TENANT_MISMATCH'
    | 'GATE_4_PRINCIPAL_EMAIL_MISMATCH'
    | 'INVALID_OR_EXPIRED_STATE'
    | 'STATE_USER_MISMATCH'
    | 'TOKEN_EXCHANGE_FAILED';

/**
 * Outcome of `/api/v1/communication-oauth/initiate`.
 */
export interface OAuthInitiateResult {
    Success: boolean;
    ResultCode: CommunicationOAuthResultCode;
    Message: string;
    AuthorizationUrl: string | null;
    State: string | null;
    CodeChallenge: string | null;
    CodeChallengeMethod: 'S256' | null;
}

/**
 * Outcome of `/api/v1/communication-oauth/callback`.
 */
export interface OAuthCallbackResult {
    Success: boolean;
    ResultCode: CommunicationOAuthResultCode;
    Message: string;
    CredentialID: string | null;
    ProviderName: string | null;
    OwnerUserID: string | null;
    PrincipalEmail: string | null;
}

/**
 * Outcome of disconnecting & revoking a user's 3LO OAuth credential.
 */
export interface OAuthDisconnectResult {
    Success: boolean;
    ResultCode: CommunicationOAuthResultCode;
    Message: string;
    RevokedAtProvider: boolean;
    CredentialDeactivated: boolean;
}

const SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Service implementing Posture 3 Per-User OAuth 2.0 (`3LO`) with PKCE (`S256`),
 * the 4 mandatory enterprise security gates, `OwnerUserID` credential isolation,
 * and one-click token revocation.
 */
export class CommunicationUserOAuthService extends BaseSingleton<CommunicationUserOAuthService> {
    private readonly pendingSessions = new Map<string, PendingOAuthAuthorizationSession>();

    public constructor() {
        super();
    }

    public static get Instance(): CommunicationUserOAuthService {
        return CommunicationUserOAuthService.getInstance<CommunicationUserOAuthService>();
    }

    /**
     * Generates a RFC 7636 PKCE (`S256`) `code_verifier` and `code_challenge` pair.
     */
    public GeneratePkcePair(): { codeVerifier: string; codeChallenge: string; codeChallengeMethod: 'S256' } {
        const codeVerifier = crypto.randomBytes(32).toString('base64url');
        const codeChallenge = crypto.createHash('sha256').update(codeVerifier, 'ascii').digest('base64url');
        return {
            codeVerifier,
            codeChallenge,
            codeChallengeMethod: 'S256',
        };
    }

    /**
     * Initiates a Posture 3 OAuth 2.0 (`3LO`) authorization flow (`/api/v1/communication-oauth/initiate`).
     * Enforces Gate 1 (`AllowUserDelegatedOAuth === true`) and Gate 2 (`AllowedEmailDomains` on `contextUser.Email`)
     * before issuing a PKCE (`S256`) authorization URL.
     */
    public InitiateAuthorizationFlow(
        policy: ProviderUserOAuthPolicyConfig,
        contextUser: UserInfo,
        nowMs: number = Date.now()
    ): OAuthInitiateResult {
        // Gate 1: Admin must explicitly enable AllowUserDelegatedOAuth
        if (policy.AllowUserDelegatedOAuth !== true) {
            return {
                Success: false,
                ResultCode: 'GATE_1_USER_OAUTH_DISABLED',
                Message: `Per-user delegated OAuth (3LO) is disabled for provider '${policy.ProviderName}' (AllowUserDelegatedOAuth=false).`,
                AuthorizationUrl: null,
                State: null,
                CodeChallenge: null,
                CodeChallengeMethod: null,
            };
        }

        const userEmail = (contextUser.Email ?? '').trim().toLowerCase();
        // Gate 2 (preflight): Verify contextUser.Email matches AllowedEmailDomains
        if (!userEmail || !BaseUserScopedCommunicationAction.IsEmailDomainAllowed(userEmail, policy.AllowedEmailDomains)) {
            return {
                Success: false,
                ResultCode: 'GATE_2_DOMAIN_MISMATCH',
                Message: `User email '${userEmail || 'missing'}' is not permitted by AllowedEmailDomains (${policy.AllowedEmailDomains ?? 'none'}) for provider '${policy.ProviderName}'.`,
                AuthorizationUrl: null,
                State: null,
                CodeChallenge: null,
                CodeChallengeMethod: null,
            };
        }

        const state = crypto.randomBytes(24).toString('base64url');
        const pkce = this.GeneratePkcePair();

        const session: PendingOAuthAuthorizationSession = {
            State: state,
            CodeVerifier: pkce.codeVerifier,
            CodeChallenge: pkce.codeChallenge,
            CodeChallengeMethod: 'S256',
            UserID: contextUser.ID,
            UserEmail: userEmail,
            ProviderName: policy.ProviderName,
            RedirectUri: policy.RedirectUri,
            CreatedAtMs: nowMs,
            ExpiresAtMs: nowMs + SESSION_TTL_MS,
        };
        this.pendingSessions.set(state, session);

        const url = new URL(policy.AuthorizationEndpoint);
        url.searchParams.set('client_id', policy.ClientId);
        url.searchParams.set('response_type', 'code');
        url.searchParams.set('redirect_uri', policy.RedirectUri);
        url.searchParams.set('scope', policy.Scopes.join(' '));
        url.searchParams.set('state', state);
        url.searchParams.set('code_challenge', pkce.codeChallenge);
        url.searchParams.set('code_challenge_method', 'S256');
        url.searchParams.set('login_hint', userEmail);

        return {
            Success: true,
            ResultCode: 'AUTHORIZATION_INITIATED',
            Message: `Generated PKCE (S256) OAuth 2.0 authorization URL for ${userEmail} on ${policy.ProviderName}.`,
            AuthorizationUrl: url.toString(),
            State: state,
            CodeChallenge: pkce.codeChallenge,
            CodeChallengeMethod: 'S256',
        };
    }

    /**
     * Completes the Posture 3 OAuth 2.0 (`3LO`) callback (`/api/v1/communication-oauth/callback`),
     * enforcing all 4 security gates before persisting the user-isolated credential in `CredentialEngine`.
     */
    public async HandleOAuthCallback(params: {
        state: string;
        code: string;
        policy: ProviderUserOAuthPolicyConfig;
        contextUser: UserInfo;
        transport: IOAuthTokenTransport;
        credentialStore?: IUserDelegatedCredentialStore;
        /** Provider the default credential store should use; falls back to the global provider. */
        metadataProvider?: IMetadataProvider;
        nowMs?: number;
    }): Promise<OAuthCallbackResult> {
        const nowMs = params.nowMs ?? Date.now();
        const session = this.pendingSessions.get(params.state);
        this.pendingSessions.delete(params.state);

        if (!session || nowMs > session.ExpiresAtMs) {
            return {
                Success: false,
                ResultCode: 'INVALID_OR_EXPIRED_STATE',
                Message: 'OAuth state parameter is invalid or has expired.',
                CredentialID: null,
                ProviderName: null,
                OwnerUserID: null,
                PrincipalEmail: null,
            };
        }

        if (!UUIDsEqual(session.UserID, params.contextUser.ID)) {
            return {
                Success: false,
                ResultCode: 'STATE_USER_MISMATCH',
                Message: 'OAuth callback user does not match the user who initiated the authorization flow.',
                CredentialID: null,
                ProviderName: session.ProviderName,
                OwnerUserID: null,
                PrincipalEmail: null,
            };
        }

        // Gate 1: Re-verify AllowUserDelegatedOAuth at callback time
        if (params.policy.AllowUserDelegatedOAuth !== true) {
            return {
                Success: false,
                ResultCode: 'GATE_1_USER_OAUTH_DISABLED',
                Message: `Per-user delegated OAuth (3LO) is disabled for provider '${params.policy.ProviderName}'.`,
                CredentialID: null,
                ProviderName: params.policy.ProviderName,
                OwnerUserID: null,
                PrincipalEmail: null,
            };
        }

        let tokenResult: VerifiedOAuthTokenExchangeResult;
        try {
            tokenResult = await params.transport.ExchangeAuthorizationCode({
                policy: params.policy,
                code: params.code,
                codeVerifier: session.CodeVerifier,
                redirectUri: session.RedirectUri,
            });
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return {
                Success: false,
                ResultCode: 'TOKEN_EXCHANGE_FAILED',
                Message: `OAuth code exchange failed: ${msg}`,
                CredentialID: null,
                ProviderName: params.policy.ProviderName,
                OwnerUserID: null,
                PrincipalEmail: null,
            };
        }

        const contextEmail = (params.contextUser.Email ?? '').trim().toLowerCase();
        const tokenEmail = (tokenResult.PrincipalEmail ?? '').trim().toLowerCase();

        // Gate 2: AllowedEmailDomains check on the authenticated token principal email
        if (
            !tokenEmail ||
            !BaseUserScopedCommunicationAction.IsEmailDomainAllowed(tokenEmail, params.policy.AllowedEmailDomains)
        ) {
            return {
                Success: false,
                ResultCode: 'GATE_2_DOMAIN_MISMATCH',
                Message: `Authenticated OAuth principal '${tokenEmail || 'unknown'}' is outside AllowedEmailDomains (${params.policy.AllowedEmailDomains ?? 'none'}).`,
                CredentialID: null,
                ProviderName: params.policy.ProviderName,
                OwnerUserID: null,
                PrincipalEmail: tokenEmail || null,
            };
        }

        // Gate 3: AllowedOAuthTenantIDs check on the token's tenant ID (`tid` / `hd`)
        const allowedTenants = (params.policy.AllowedOAuthTenantIDs ?? [])
            .map((t) => t.trim().toLowerCase())
            .filter((t) => t.length > 0);
        if (allowedTenants.length > 0) {
            const actualTenant = (tokenResult.TenantID ?? '').trim().toLowerCase();
            if (!actualTenant || !allowedTenants.includes(actualTenant)) {
                return {
                    Success: false,
                    ResultCode: 'GATE_3_TENANT_MISMATCH',
                    Message: `Authenticated OAuth tenant '${tokenResult.TenantID ?? 'none'}' is not in AllowedOAuthTenantIDs for provider '${params.policy.ProviderName}'.`,
                    CredentialID: null,
                    ProviderName: params.policy.ProviderName,
                    OwnerUserID: null,
                    PrincipalEmail: tokenEmail,
                };
            }
        }

        // Gate 4: Strict Principal Match (`token.email === contextUser.Email`)
        if (tokenEmail !== contextEmail) {
            return {
                Success: false,
                ResultCode: 'GATE_4_PRINCIPAL_EMAIL_MISMATCH',
                Message: `Strict principal mismatch: authenticated OAuth account '${tokenEmail}' does not match MJ user '${contextEmail}'. Cross-account linking is forbidden.`,
                CredentialID: null,
                ProviderName: params.policy.ProviderName,
                OwnerUserID: null,
                PrincipalEmail: tokenEmail,
            };
        }

        const store = params.credentialStore ?? this.createDefaultEntityCredentialStore(params.metadataProvider);
        const expiresAt = tokenResult.ExpiresInSeconds
            ? new Date(nowMs + tokenResult.ExpiresInSeconds * 1000)
            : undefined;

        const savedCred = await store.StoreUserDelegatedCredential(
            {
                providerName: params.policy.ProviderName,
                ownerUserId: params.contextUser.ID,
                principalEmail: tokenEmail,
                accessToken: tokenResult.AccessToken,
                refreshToken: tokenResult.RefreshToken,
                tokenType: tokenResult.TokenType ?? 'Bearer',
                scope: tokenResult.Scope ?? params.policy.Scopes.join(' '),
                tenantId: tokenResult.TenantID ?? '',
                expiresAt,
            },
            params.contextUser
        );

        return {
            Success: true,
            ResultCode: 'OAUTH_CONNECTED',
            Message: `Connected per-user OAuth 2.0 (3LO) credential for ${tokenEmail} on ${params.policy.ProviderName}.`,
            CredentialID: savedCred.ID,
            ProviderName: params.policy.ProviderName,
            OwnerUserID: params.contextUser.ID,
            PrincipalEmail: tokenEmail,
        };
    }

    /**
     * One-click Disconnect & Revoke flow: revokes the user's OAuth token with the upstream provider
     * (when `RevokeToken` is supported) and deactivates/wipes the user's isolated credential in `CredentialEngine`.
     */
    public async DisconnectAndRevokeUserOAuth(params: {
        policy: ProviderUserOAuthPolicyConfig;
        contextUser: UserInfo;
        transport?: IOAuthTokenTransport;
        credentialStore?: IUserDelegatedCredentialStore;
        /** Provider the default credential store should use; falls back to the global provider. */
        metadataProvider?: IMetadataProvider;
    }): Promise<OAuthDisconnectResult> {
        const store = params.credentialStore ?? this.createDefaultEntityCredentialStore(params.metadataProvider);
        const existing = await store.GetUserDelegatedCredential(
            params.policy.ProviderName,
            params.contextUser
        );

        let revokedAtProvider = false;
        if (existing && params.transport?.RevokeToken) {
            const tokenToRevoke = existing.values.refreshToken || existing.values.accessToken;
            if (tokenToRevoke) {
                try {
                    revokedAtProvider = await params.transport.RevokeToken({
                        policy: params.policy,
                        token: tokenToRevoke,
                    });
                } catch {
                    revokedAtProvider = false;
                }
            }
        }

        const deactivated = await store.RevokeUserDelegatedCredential(
            params.policy.ProviderName,
            params.contextUser
        );

        return {
            Success: true,
            ResultCode: 'OAUTH_DISCONNECTED',
            Message: `Disconnected and revoked per-user OAuth 2.0 (3LO) credential for ${params.contextUser.Email} on ${params.policy.ProviderName}.`,
            RevokedAtProvider: revokedAtProvider,
            CredentialDeactivated: deactivated,
        };
    }

    private createDefaultEntityCredentialStore(provider?: IMetadataProvider): IUserDelegatedCredentialStore {
        const md = provider ?? Metadata.Provider;
        const buildName = (providerName: string, userId: string): string =>
            `UserOAuth3LO:${providerName.trim()}:${userId.trim().toLowerCase()}`;

        return {
            StoreUserDelegatedCredential: async (options, contextUser) => {
                if (!UUIDsEqual(options.ownerUserId, contextUser.ID)) {
                    throw new Error('Credential owner mismatch');
                }
                const rv = RunView.FromMetadataProvider(md);
                const name = buildName(options.providerName, options.ownerUserId);
                const safeName = EscapeSQLString(name);
                const existingRes = await rv.RunView<MJCredentialEntity>(
                    {
                        EntityName: 'MJ: Credentials',
                        ExtraFilter: `Name='${safeName}'`,
                        MaxRows: 1,
                        ResultType: 'entity_object',
                    },
                    contextUser
                );
                const cred =
                    existingRes.Success && existingRes.Results.length > 0
                        ? existingRes.Results[0]
                        : await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);

                const values: UserDelegatedOAuthStoredValues = {
                    ownerUserId: options.ownerUserId,
                    principalEmail: options.principalEmail.trim().toLowerCase(),
                    providerName: options.providerName.trim(),
                    accessToken: options.accessToken,
                    refreshToken: options.refreshToken ?? '',
                    tokenType: options.tokenType ?? 'Bearer',
                    scope: options.scope ?? '',
                    tenantId: options.tenantId ?? '',
                    issuedAt: new Date().toISOString(),
                };
                cred.Name = name;
                cred.Values = JSON.stringify(values);
                cred.IsActive = true;
                cred.IsDefault = false;
                cred.ExpiresAt = options.expiresAt ?? null;
                const saved = await cred.Save();
                if (!saved) {
                    throw new Error(
                        `Failed to store delegated credential '${name}': ${cred.LatestResult?.CompleteMessage ?? 'unknown error'}`
                    );
                }
                return { ID: cred.ID };
            },
            GetUserDelegatedCredential: async (providerName, contextUser) => {
                const rv = RunView.FromMetadataProvider(md);
                const safeName = EscapeSQLString(buildName(providerName, contextUser.ID));
                const res = await rv.RunView<MJCredentialEntity>(
                    {
                        EntityName: 'MJ: Credentials',
                        ExtraFilter: `Name='${safeName}' AND IsActive=1`,
                        MaxRows: 1,
                        ResultType: 'entity_object',
                    },
                    contextUser
                );
                if (!res.Success || res.Results.length === 0) {
                    return null;
                }
                const parsed = SafeJSONParse<UserDelegatedOAuthStoredValues>(res.Results[0].Values);
                if (!parsed || !UUIDsEqual(parsed.ownerUserId, contextUser.ID)) {
                    throw new Error('Credential owner mismatch');
                }
                return { values: parsed };
            },
            RevokeUserDelegatedCredential: async (providerName, contextUser) => {
                const rv = RunView.FromMetadataProvider(md);
                const safeName = EscapeSQLString(buildName(providerName, contextUser.ID));
                const res = await rv.RunView<MJCredentialEntity>(
                    {
                        EntityName: 'MJ: Credentials',
                        ExtraFilter: `Name='${safeName}' AND IsActive=1`,
                        MaxRows: 1,
                        ResultType: 'entity_object',
                    },
                    contextUser
                );
                if (!res.Success || res.Results.length === 0) {
                    return false;
                }
                const cred = res.Results[0];
                cred.IsActive = false;
                cred.Values = JSON.stringify({
                    ownerUserId: contextUser.ID,
                    revokedAt: new Date().toISOString(),
                });
                return cred.Save();
            },
        };
    }

    /** Clear pending in-memory authorization sessions (for unit testing). */
    public ClearPendingSessions(): void {
        this.pendingSessions.clear();
    }
}
