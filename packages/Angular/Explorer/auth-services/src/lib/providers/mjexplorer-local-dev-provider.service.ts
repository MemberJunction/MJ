import { Injectable, Inject, Optional, Provider } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { MJAuthBase } from '../mjexplorer-auth-base.service';
import {
  StandardUserInfo,
  StandardAuthToken,
  StandardAuthError,
  AuthErrorType,
  TokenRefreshResult,
} from '../auth-types';

export interface LocalDevAuthConfig {
  graphqlUri?: string;
  email?: string;
}

interface DevLoginResponse {
  success: boolean;
  token?: string;
  expiresAt?: string;
  error?: string;
}

interface DecodedLocalDevClaims {
  sub?: string;
  email?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  preferred_username?: string;
  exp?: number;
}

/**
 * Local development authentication provider (`local`).
 *
 * Designed strictly for localhost development when `MJ_DEV_AUTH_ENABLED=true` on MJAPI.
 * Automatically acquires a short-lived RS256 development JWT from `POST /auth/dev-login`
 * without requiring an external identity provider (no Entra/Auth0 Client ID or Tenant ID).
 */
@Injectable({
  providedIn: 'root',
})
@RegisterClass(MJAuthBase, 'local')
export class MJLocalDevProvider extends MJAuthBase {
  public static readonly PROVIDER_TYPE = 'local';
  public static readonly STORAGE_KEY = 'mj_local_dev_token';

  readonly type = MJLocalDevProvider.PROVIDER_TYPE;
  private localConfig: LocalDevAuthConfig;
  private token: string | null = null;
  private claims: DecodedLocalDevClaims | null = null;

  constructor(@Optional() @Inject('localDevAuthConfig') config?: LocalDevAuthConfig) {
    super({
      name: MJLocalDevProvider.PROVIDER_TYPE,
      type: MJLocalDevProvider.PROVIDER_TYPE,
      ...(config ?? {}),
    });
    this.localConfig = config ?? {};
  }

  async initialize(): Promise<void> {
    const existing = this.readValidStoredToken();
    if (existing) {
      this.applyToken(existing.token, existing.claims);
      return;
    }

    const acquired = await this.acquireDevToken();
    if (acquired) {
      this.applyToken(acquired.token, acquired.claims);
    } else {
      this.updateUserInfo(null);
      this.updateAuthState(false);
    }
  }

  protected async loginInternal(_options?: Record<string, unknown>): Promise<void> {
    const existing = this.readValidStoredToken();
    if (existing) {
      this.applyToken(existing.token, existing.claims);
      return;
    }
    const acquired = await this.acquireDevToken();
    if (acquired) {
      this.applyToken(acquired.token, acquired.claims);
    } else {
      this.updateUserInfo(null);
      this.updateAuthState(false);
    }
  }

  protected async logoutInternal(): Promise<void> {
    this.clearToken();
    this.token = null;
    this.claims = null;
    this.updateUserInfo(null);
    this.updateAuthState(false);
  }

  async handleCallback(): Promise<void> {
    await this.initialize();
  }

  protected async extractIdTokenInternal(): Promise<string | null> {
    const existing = this.readValidStoredToken(60);
    if (existing) {
      return existing.token;
    }
    const acquired = await this.acquireDevToken();
    if (acquired) {
      this.applyToken(acquired.token, acquired.claims);
      return acquired.token;
    }
    return null;
  }

  protected async extractTokenInfoInternal(): Promise<StandardAuthToken | null> {
    const idToken = await this.extractIdTokenInternal();
    if (!idToken) {
      return null;
    }
    const claims = this.claims ?? this.decodePayload(idToken);
    const exp = claims?.exp;
    return {
      idToken,
      accessToken: idToken,
      expiresAt: exp ? exp * 1000 : 0,
    };
  }

  protected async extractUserInfoInternal(): Promise<StandardUserInfo | null> {
    const existing = this.readValidStoredToken();
    const claims = existing?.claims ?? this.claims;
    if (!claims) {
      return null;
    }
    return this.claimsToUserInfo(claims);
  }

  protected async refreshTokenInternal(): Promise<TokenRefreshResult> {
    const acquired = await this.acquireDevToken();
    if (!acquired) {
      return {
        success: false,
        error: {
          type: AuthErrorType.TOKEN_EXPIRED,
          message: 'Failed to acquire or refresh local dev session token from /auth/dev-login.',
          userMessage: 'Your local development session expired and could not be renewed.',
        },
      };
    }
    this.applyToken(acquired.token, acquired.claims);
    return {
      success: true,
      token: {
        idToken: acquired.token,
        accessToken: acquired.token,
        expiresAt: acquired.claims.exp ? acquired.claims.exp * 1000 : 0,
      },
    };
  }

  protected classifyErrorInternal(error: unknown): StandardAuthError {
    const msg = error instanceof Error ? error.message : String(error ?? 'Local dev auth error');
    return {
      type: AuthErrorType.UNKNOWN_ERROR,
      message: msg,
      userMessage: msg,
      originalError: error,
    };
  }

  protected async getProfilePictureUrlInternal(): Promise<string | null> {
    return null;
  }

  protected async handleSessionExpiryInternal(): Promise<void> {
    await this.loginInternal();
  }

  override getRequiredConfig(): string[] {
    return [];
  }

  override validateConfig(_config?: Record<string, unknown>): boolean {
    return true;
  }

  static angularProviderFactory = (environment: Record<string, unknown>): Provider[] => {
    const graphqlUri = (environment['GRAPHQL_URI'] as string | undefined) || 'http://localhost:4000/';
    const email = environment['LOCAL_DEV_EMAIL'] as string | undefined;
    return [
      {
        provide: 'localDevAuthConfig',
        useValue: { graphqlUri, email } satisfies LocalDevAuthConfig,
      },
    ];
  };

  static AngularProviderFactory = MJLocalDevProvider.angularProviderFactory;

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private resolveDevLoginUrl(): string {
    const rawUri = this.localConfig.graphqlUri || 'http://localhost:4000/';
    const trimmed = rawUri.replace(/\/+$/, '').replace(/\/graphql$/i, '');
    return `${trimmed}/auth/dev-login`;
  }

  private async acquireDevToken(): Promise<{ token: string; claims: DecodedLocalDevClaims } | null> {
    try {
      const url = this.resolveDevLoginUrl();
      const bodyPayload = this.localConfig.email ? { email: this.localConfig.email } : {};
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(bodyPayload),
      });

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as DevLoginResponse;
      if (!data.success || !data.token) {
        return null;
      }

      const claims = this.decodePayload(data.token);
      if (!claims || this.isExpired(claims)) {
        return null;
      }

      try {
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.setItem(MJLocalDevProvider.STORAGE_KEY, data.token);
        }
      } catch {
        // Ignore storage write errors in restricted contexts
      }

      return { token: data.token, claims };
    } catch {
      return null;
    }
  }

  private readValidStoredToken(minRemainingSeconds = 0): { token: string; claims: DecodedLocalDevClaims } | null {
    try {
      if (typeof sessionStorage === 'undefined') {
        return null;
      }
      const stored = sessionStorage.getItem(MJLocalDevProvider.STORAGE_KEY);
      if (!stored) {
        return null;
      }
      const claims = this.decodePayload(stored);
      if (!claims || this.isExpired(claims, minRemainingSeconds)) {
        sessionStorage.removeItem(MJLocalDevProvider.STORAGE_KEY);
        return null;
      }
      return { token: stored, claims };
    } catch {
      return null;
    }
  }

  private clearToken(): void {
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(MJLocalDevProvider.STORAGE_KEY);
      }
    } catch {
      // Ignore storage access errors
    }
  }

  private applyToken(token: string, claims: DecodedLocalDevClaims): void {
    this.token = token;
    this.claims = claims;
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(MJLocalDevProvider.STORAGE_KEY, token);
      }
    } catch {
      // Ignore storage access errors
    }
    this.updateUserInfo(this.claimsToUserInfo(claims));
    this.updateAuthState(true);
  }

  private claimsToUserInfo(claims: DecodedLocalDevClaims): StandardUserInfo {
    const email = claims.email ?? '';
    const given = claims.given_name;
    const family = claims.family_name;
    const name = claims.name || [given, family].filter(Boolean).join(' ') || email;
    return {
      id: claims.sub ?? email,
      name,
      email,
      givenName: given,
      familyName: family,
      preferredUsername: claims.preferred_username || email,
      emailVerified: true,
    };
  }

  private isExpired(claims: DecodedLocalDevClaims, minRemainingSeconds = 0): boolean {
    if (typeof claims.exp !== 'number') {
      return true;
    }
    return Math.floor(Date.now() / 1000) + minRemainingSeconds >= claims.exp;
  }

  private decodePayload(jwtToken: string): DecodedLocalDevClaims | null {
    const parts = jwtToken.split('.');
    if (parts.length !== 3) {
      return null;
    }
    try {
      const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
      const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
      const jsonStr = new TextDecoder().decode(bytes);
      return JSON.parse(jsonStr) as DecodedLocalDevClaims;
    } catch {
      return null;
    }
  }
}
