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
 * - **Per-User `OwnerUserID` Isolation in `CredentialEngine`** — credentials are stored through
 *   `CredentialEngine.Instance` (`@memberjunction/credentials`) unless a caller injects another
 *   `IUserDelegatedCredentialStore`
 * - **Gates 1–3 are administrator settings on `MJ: Communication Providers`** (`AllowUserDelegatedOAuth`,
 *   `AllowedEmailDomains`, `AllowedOAuthTenantIDs`); `ReadProviderUserOAuthGates` lifts them off the row
 * - **One-Click Disconnect & Token Revocation**
 *
 * @module @memberjunction/core-actions
 */

import * as crypto from 'crypto';
import { UserInfo } from '@memberjunction/core';
import { BaseSingleton, SafeJSONParse, UUIDsEqual } from '@memberjunction/global';
import { MJCommunicationProviderEntity, MJCredentialEntity } from '@memberjunction/core-entities';
import { CredentialEngine } from '@memberjunction/credentials';
import { BaseUserScopedCommunicationAction } from './user-scoped-communication.action';

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

/** The administrator-controlled gate fields of `ProviderUserOAuthPolicyConfig`, as stored on `MJ: Communication Providers`. */
export type ProviderUserOAuthGates = Pick<
    ProviderUserOAuthPolicyConfig,
    'ProviderName' | 'AllowUserDelegatedOAuth' | 'AllowedEmailDomains' | 'AllowedOAuthTenantIDs'
>;

/**
 * Lift Gates 1–3 off a `MJ: Communication Providers` row. `AllowedOAuthTenantIDs` is stored comma-separated
 * and returned as a trimmed list, or null when the column is empty (no tenant restriction).
 * The caller merges the result with the OAuth client settings (endpoints, client id, scopes) to form the
 * full `ProviderUserOAuthPolicyConfig`.
 */
export function ReadProviderUserOAuthGates(provider: MJCommunicationProviderEntity): ProviderUserOAuthGates {
    const tenantIDs = (provider.AllowedOAuthTenantIDs ?? '')
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
    return {
        ProviderName: provider.Name,
        AllowUserDelegatedOAuth: provider.AllowUserDelegatedOAuth === true,
        AllowedEmailDomains: provider.AllowedEmailDomains ?? null,
        AllowedOAuthTenantIDs: tenantIDs.length > 0 ? tenantIDs : null,
    };
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
        /** Defaults to `CredentialEngine.Instance`. */
        credentialStore?: IUserDelegatedCredentialStore;
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

        const store = this.resolveCredentialStore(params.credentialStore);
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
        /** Defaults to `CredentialEngine.Instance`. */
        credentialStore?: IUserDelegatedCredentialStore;
    }): Promise<OAuthDisconnectResult> {
        const store = this.resolveCredentialStore(params.credentialStore);
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

    /** `CredentialEngine` owns delegated-credential naming, owner binding, encryption and audit; it is the default store. */
    private resolveCredentialStore(injected: IUserDelegatedCredentialStore | undefined): IUserDelegatedCredentialStore {
        return injected ?? CredentialEngine.Instance;
    }

    /** Clear pending in-memory authorization sessions (for unit testing). */
    public ClearPendingSessions(): void {
        this.pendingSessions.clear();
    }
}
