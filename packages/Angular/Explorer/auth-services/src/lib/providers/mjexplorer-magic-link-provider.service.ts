import { Injectable } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { MJAuthBase } from '../mjexplorer-auth-base.service';
import {
  StandardUserInfo,
  StandardAuthToken,
  StandardAuthError,
  AuthErrorType,
  TokenRefreshResult,
  SessionScope,
} from '../auth-types';

/** sessionStorage key holding the magic-link session token for this tab. */
const TOKEN_STORAGE_KEY = 'mj_magic_link_token';

/**
 * Client-side auth provider for MemberJunction-issued magic-link sessions.
 *
 * Unlike MSAL/Auth0, there is no interactive login and no SDK: the session
 * token (minted server-side when the user redeemed their invite) arrives in the
 * URL fragment — `#token=<jwt>` — when `/magic-link/redeem` redirects the
 * browser to Explorer. This provider extracts it, stashes it in sessionStorage
 * (per-tab, so it dies with the tab), decodes the claims for display, and hands
 * the token to the GraphQL client via `getIdToken()`. The server validates it
 * through the standard JWKS path.
 *
 * Set `AUTH_TYPE: 'magic-link'` in the Explorer environment to use this
 * provider. There are no refresh tokens — when the session expires the user
 * must redeem a fresh link.
 */
@Injectable({ providedIn: 'root' })
@RegisterClass(MJAuthBase, 'magic-link')
export class MJMagicLinkProvider extends MJAuthBase {
  static readonly PROVIDER_TYPE = 'magic-link';
  readonly type = MJMagicLinkProvider.PROVIDER_TYPE;

  private token: string | null = null;
  private claims: Record<string, unknown> | null = null;

  constructor() {
    super({ name: MJMagicLinkProvider.PROVIDER_TYPE, type: MJMagicLinkProvider.PROVIDER_TYPE });
  }

  async initialize(): Promise<void> {
    // Token may arrive in the URL fragment from the redeem redirect, or already
    // be stored from earlier in this tab's session.
    const fromHash = this.readTokenFromHash();
    const stored = sessionStorage.getItem(TOKEN_STORAGE_KEY);
    const token = fromHash ?? stored;

    if (!token) {
      this.updateAuthState(false);
      return;
    }

    this.token = token;
    this.claims = this.decode(token);

    if (fromHash) {
      sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
      this.stripHash(); // remove the token from the visible URL
    }

    if (this.isExpired()) {
      // Stale token — treat as logged out so the user is prompted for a fresh link.
      sessionStorage.removeItem(TOKEN_STORAGE_KEY);
      this.token = null;
      this.claims = null;
      this.updateAuthState(false);
      return;
    }

    this.updateUserInfo(this.toUserInfo(this.claims));
    this.updateAuthState(true);
  }

  protected async loginInternal(): Promise<void> {
    // No interactive login path — access is only via a magic-link redemption URL.
    this.updateAuthState(false);
  }

  protected async logoutInternal(): Promise<void> {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    this.token = null;
    this.claims = null;
    this.updateUserInfo(null);
    this.updateAuthState(false);
  }

  async handleCallback(): Promise<void> {
    // No OAuth callback for magic links.
  }

  protected async extractIdTokenInternal(): Promise<string | null> {
    return this.token ?? sessionStorage.getItem(TOKEN_STORAGE_KEY);
  }

  protected async extractTokenInfoInternal(): Promise<StandardAuthToken | null> {
    const idToken = await this.extractIdTokenInternal();
    if (!idToken) {
      return null;
    }
    const claims = this.claims ?? this.decode(idToken);
    const exp = claims?.['exp'] as number | undefined;
    return { idToken, expiresAt: exp ? exp * 1000 : 0 };
  }

  protected async extractUserInfoInternal(): Promise<StandardUserInfo | null> {
    return this.toUserInfo(this.claims);
  }

  protected async refreshTokenInternal(): Promise<TokenRefreshResult> {
    // No refresh tokens for magic-link sessions. Hand back the current token
    // while it's valid; once expired, signal TOKEN_EXPIRED.
    const token = await this.extractTokenInfoInternal();
    if (token && !this.isExpired()) {
      return { success: true, token };
    }
    return {
      success: false,
      error: {
        type: AuthErrorType.TOKEN_EXPIRED,
        message: 'Magic-link session expired',
        userMessage: 'Your access link has expired. Please request a new one.',
      },
    };
  }

  protected classifyErrorInternal(error: unknown): StandardAuthError {
    const message = (error as { message?: string })?.message ?? 'Unknown error';
    return { type: AuthErrorType.UNKNOWN_ERROR, message, originalError: error };
  }

  protected async getProfilePictureUrlInternal(): Promise<string | null> {
    return null;
  }

  protected async handleSessionExpiryInternal(): Promise<void> {
    // No interactive re-auth — the user must redeem a fresh link.
  }

  /**
   * Magic-link sessions are locked to the single app the invite scoped to
   * (`mj_app_id`), so the shell hides app-switching and keeps the user there.
   */
  override GetSessionScope(): SessionScope | null {
    const appId = this.claims?.['mj_app_id'] as string | undefined;
    if (this.claims?.['mj_magic_link'] === true && appId) {
      return { restrictedToApplicationId: appId, magicLink: true };
    }
    return null;
  }

  override getRequiredConfig(): string[] {
    return [];
  }

  override validateConfig(): boolean {
    return true;
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  /** Reads `token` from the URL fragment (`#token=...`). */
  private readTokenFromHash(): string | null {
    const hash = window.location.hash;
    if (!hash) {
      return null;
    }
    return new URLSearchParams(hash.replace(/^#/, '')).get('token');
  }

  /** Removes the token from the address bar without reloading. */
  private stripHash(): void {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  /** Decodes a JWT payload (no verification — the server validates). */
  private decode(token: string): Record<string, unknown> | null {
    try {
      const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(atob(payload)) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  private isExpired(): boolean {
    const exp = this.claims?.['exp'] as number | undefined;
    return !!exp && Date.now() >= exp * 1000;
  }

  private toUserInfo(claims: Record<string, unknown> | null): StandardUserInfo | null {
    if (!claims) {
      return null;
    }
    const email = (claims['email'] as string) || '';
    return {
      id: (claims['sub'] as string) || email,
      email,
      name: (claims['name'] as string) || email,
      givenName: claims['given_name'] as string | undefined,
      familyName: claims['family_name'] as string | undefined,
      preferredUsername: email,
      emailVerified: true,
    };
  }
}
