/**
 * @fileoverview Imperative shell for magic links: invite creation, redemption,
 * user provisioning, and session-token minting. The pure logic lives in
 * `magicLinkCore.ts`; this module wires it to the DB, key manager, and
 * communication engine.
 *
 * @module @memberjunction/server/auth/magicLink
 */

import {
  Metadata,
  RunView,
  UserInfo,
  LogError,
  LogStatus,
  type DatabaseProviderBase,
  type IMetadataProvider,
  type RoleInfo,
} from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import {
  type MJMagicLinkInviteEntity,
  type MJMagicLinkRedemptionEntity,
  type MJMagicLinkInviteApplicationEntity,
  type MJMagicLinkInviteRoleEntity,
  type MJUserEntity,
  type MJUserRoleEntity,
  type MJUserApplicationEntity,
  type MJUserEntityType,
  type MJApplicationRoleEntity,
} from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/sqlserver-dataprovider';
import { CommunicationEngine } from '@memberjunction/communication-engine';
import { Message } from '@memberjunction/communication-types';
import { configInfo, type MagicLinkConfig } from '../../config.js';
import { MagicLinkKeyManager } from './MagicLinkKeys.js';
import { generateRawToken, generateSessionId, hashToken, evaluateInvite, buildSessionClaims, buildConsumeInviteSQL, canIssueInvites, isRoleGrantable, MAGIC_LINK_TOKEN_PREFIX } from './magicLinkCore.js';
import type {
  CreateMagicLinkInviteParams,
  CreateMagicLinkInviteResult,
  RedeemMagicLinkResult,
  RedeemAuditContext,
} from './types.js';

const INVITE_ENTITY = 'MJ: Magic Link Invites';
const REDEMPTION_ENTITY = 'MJ: Magic Link Redemptions';
/** Shared Anonymous principal — seeded by the Phase-4 migration; must match that UUID. */
const ANONYMOUS_USER_ID = '273910DF-28F1-45C1-A8F8-6E9AD8E5F008';

/** Outcome of provisioning a redeeming user. */
interface ProvisionResult {
  success: boolean;
  /** The provisioned/linked user's ID — used for the redemption audit row. */
  userId?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  error?: string;
}

/**
 * Magic-link service. One instance per server, constructed with the resolved
 * public URL and the validated config.
 */
export class MagicLinkService {
  constructor(
    private readonly publicUrl: string,
    private readonly config: MagicLinkConfig,
  ) {}

  /**
   * Creates a single-use, app-scoped invite, persists its hashed token, and
   * (when a communication provider is configured) emails the link.
   *
   * @param params  invite parameters
   * @param creatingUser  the authenticated internal user issuing the invite
   * @param provider  the request's metadata provider; falls back to the global default
   */
  public async CreateInvite(
    params: CreateMagicLinkInviteParams,
    creatingUser: UserInfo,
    provider?: IMetadataProvider,
  ): Promise<CreateMagicLinkInviteResult> {
    try {
      const md = provider ?? Metadata.Provider;

      // Authorization: only Owners (or members of configured issuer roles) may
      // mint invites. Without this, ANY authenticated user — including an
      // external user already holding a restricted magic-link session — could
      // issue invites and escalate.
      const callerRoleNames = (creatingUser.UserRoles ?? []).map((r) => r.Role).filter((n): n is string => !!n);
      if (!canIssueInvites(creatingUser.Type, callerRoleNames, this.config.inviteIssuerRoleNames)) {
        return { success: false, errorCode: 'forbidden', error: 'Not authorized to issue magic-link invites.' };
      }

      const roleId = params.roleId ?? this.resolveRestrictedRoleId(md);
      if (!roleId) {
        return { success: false, error: `Restricted role '${this.config.restrictedRoleName}' not found and no roleId supplied.` };
      }

      // Role allow-list: an invite may only grant the restricted role (or roles
      // the deployment explicitly opted into). Blocks the escalation where a
      // caller supplies the roleId of a privileged role (e.g. Owner).
      const roleToGrant = md.Roles.find((r) => UUIDsEqual(r.ID, roleId));
      if (!roleToGrant) {
        return { success: false, errorCode: 'invalid_role', error: `Role '${roleId}' not found.` };
      }
      if (!isRoleGrantable(roleToGrant.Name, this.config.restrictedRoleName, this.config.grantableRoleNames)) {
        return {
          success: false,
          errorCode: 'invalid_role',
          error: `Role '${roleToGrant.Name}' is not grantable via magic-link. Add it to magicLink.grantableRoleNames to allow it.`,
        };
      }

      const app = md.Applications.find((a) => UUIDsEqual(a.ID, params.applicationId));
      if (!app) {
        return { success: false, error: `Application '${params.applicationId}' not found.` };
      }

      const rawToken = generateRawToken();
      const expiresInHours = params.expiresInHours ?? this.config.defaultExpiresInHours;
      const expiresAt = new Date(Date.now() + expiresInHours * 3600 * 1000);

      const invite = await md.GetEntityObject<MJMagicLinkInviteEntity>(INVITE_ENTITY, creatingUser);
      invite.NewRecord();
      invite.TokenHash = hashToken(rawToken);
      invite.Email = params.email;
      invite.ApplicationID = params.applicationId;
      invite.RoleID = roleId;
      invite.ExpiresAt = expiresAt;
      invite.MaxUses = params.maxUses ?? 1;
      invite.UseCount = 0;
      invite.CreatedByUserID = creatingUser.ID;
      invite.Status = 'Active';

      if (!(await invite.Save())) {
        return { success: false, error: `Failed to create invite: ${invite.LatestResult?.CompleteMessage ?? 'unknown error'}` };
      }

      // Phase 2: pre-stage the multi-scope child rows (one app + one role) mirroring
      // the single ApplicationID/RoleID. Additive — the columns stay authoritative for
      // redemption today; this populates the child tables for the eventual switch to
      // multi-scope reads. Best-effort so a child-row hiccup never fails issuance.
      await this.writeInviteScopeChildRows(invite.ID, params.applicationId, roleId, creatingUser, md);

      const redemptionUrl = this.buildRedemptionUrl(rawToken);

      let emailSent = false;
      if (this.config.communicationProvider) {
        emailSent = await this.sendInviteEmail(params.email, redemptionUrl, app.Name, creatingUser);
      }

      return {
        success: true,
        inviteId: invite.ID,
        redemptionUrl,
        // Surface the raw token only when we couldn't deliver it ourselves.
        rawToken: emailSent ? undefined : rawToken,
        emailSent,
        expiresAt: expiresAt.toISOString(),
      };
    } catch (e) {
      LogError(e);
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  /**
   * Redeems a raw token: validates the invite, atomically consumes one use,
   * provisions/links the user with the restricted role + app, and mints a
   * session JWT. Runs in the public (pre-auth) path, so it uses the global
   * provider and a configured provisioning context user.
   *
   * Single-use is enforced by a compare-and-swap UPDATE ({@link consumeInvite})
   * BEFORE the token is minted — two concurrent redemptions of a single-use
   * link race on the same row and exactly one wins. The consume is the gate:
   * if a later step fails, the use is already burned (fail-closed). That is the
   * correct trade-off for a single-use credential — burning a token on a server
   * error is recoverable (re-issue); allowing replay is not.
   */
  public async RedeemInvite(rawToken: string, audit?: RedeemAuditContext): Promise<RedeemMagicLinkResult> {
    // Captured by the `done` closure below so every exit path — success or any
    // failure — records exactly one MagicLinkRedemption row with the outcome and
    // whatever attribution we'd resolved by then.
    let inviteId: string | undefined;
    let provisionedUserId: string | undefined;
    let ctxUser: UserInfo | null = null;
    const done = async (result: RedeemMagicLinkResult): Promise<RedeemMagicLinkResult> => {
      await this.recordRedemption(result, inviteId, provisionedUserId, audit, ctxUser);
      return result;
    };

    try {
      if (!rawToken || !rawToken.startsWith(MAGIC_LINK_TOKEN_PREFIX)) {
        return done({ success: false, errorCode: 'invalid', error: 'Malformed token.' });
      }

      ctxUser = this.resolveProvisioningContextUser();
      if (!ctxUser) {
        LogError('[MagicLink] No provisioning context user available for redemption.');
        return done({ success: false, errorCode: 'server_error', error: 'Server not configured for provisioning.' });
      }
      const contextUser = ctxUser;

      // global-provider-ok: redemption runs in the pre-auth flow, no per-request provider yet
      const md = Metadata.Provider; // global-provider-ok: server-side magic-link service; runs under the server's single default provider
      const provider = md as DatabaseProviderBase;

      const tokenHash = hashToken(rawToken);
      const rv = new RunView();
      const found = await rv.RunView<MJMagicLinkInviteEntity>(
        {
          EntityName: INVITE_ENTITY,
          ExtraFilter: `TokenHash = '${tokenHash}'`,
          ResultType: 'entity_object',
        },
        contextUser,
      );

      if (!found.Success) {
        LogError(`[MagicLink] Invite lookup failed: ${found.ErrorMessage}`);
        return done({ success: false, errorCode: 'server_error', error: 'Lookup failed.' });
      }
      const invite = found.Results?.[0];
      if (!invite) {
        return done({ success: false, errorCode: 'not_found', error: 'Invite not found.' });
      }
      inviteId = invite.ID;

      // Fast, friendly pre-check (returns a precise reason). NOT the authority —
      // the atomic consume below is what actually enforces single-use.
      const eligibility = evaluateInvite(invite, Date.now());
      if (!eligibility.ok) {
        return done({ success: false, errorCode: eligibility.errorCode, error: `Invite is ${eligibility.errorCode}.` });
      }

      // Fail-closed on the inviter: if the user who issued this link is no longer
      // an active account, the link dies with them. Without this, a deactivated
      // employee's outstanding invites would keep working (and provisioning would
      // silently fall back to an Owner context). The invite is only as trustworthy
      // as the still-active person who minted it.
      if (!this.isInviterActive(invite.CreatedByUserID)) {
        LogError(`[MagicLink] Invite ${invite.ID} rejected: inviter ${invite.CreatedByUserID} is not an active user.`);
        return done({ success: false, errorCode: 'invalid', error: 'The user who issued this invite is no longer active.' });
      }

      const role = md.Roles.find((r) => UUIDsEqual(r.ID, invite.RoleID));
      if (!role) {
        LogError(`[MagicLink] Invite ${invite.ID} references missing role ${invite.RoleID}.`);
        return done({ success: false, errorCode: 'server_error', error: 'Invite role not found.' });
      }

      // Atomic consume BEFORE minting. If we lose the race (0 rows updated), the
      // invite was concurrently consumed/expired — re-evaluate the now-stale
      // in-memory copy only to surface a precise code; default to 'consumed'.
      if (!(await this.consumeInvite(invite, provider, contextUser))) {
        // Lost the race or the invite expired between the pre-check and the
        // consume. The in-memory copy still looks eligible if only the DB-side
        // use count changed, so default that case to 'consumed'.
        const recheck = evaluateInvite(invite, Date.now());
        return done({ success: false, errorCode: recheck.ok ? 'consumed' : recheck.errorCode, error: 'Invite already redeemed or expired.' });
      }

      const provision = await this.provisionUser(invite, role, contextUser);
      if (!provision.success) {
        // Token already consumed (fail-closed). The link cannot be reused.
        LogError(`[MagicLink] Provisioning failed after consuming invite ${invite.ID}: ${provision.error}`);
        return done({ success: false, errorCode: 'provisioning_failed', error: provision.error });
      }
      provisionedUserId = provision.userId;

      const nowSeconds = Math.floor(Date.now() / 1000);
      const isAnon = invite.IdentityMode === 'anonymous';
      const claims = buildSessionClaims({
        issuer: this.publicUrl,
        audience: this.config.audience,
        inviteId: invite.ID,
        email: provision.email!,
        firstName: provision.firstName,
        lastName: provision.lastName,
        applicationId: invite.ApplicationID,
        roleName: role.Name,
        invitedByUserId: invite.CreatedByUserID,
        anonymous: isAnon,
        // Per-session id for anon forensics (correlates one session's activity since all
        // anon redemptions share the Anonymous principal). Carried into the redemption audit row.
        sessionId: isAnon ? generateSessionId() : undefined,
        // Resource-share scope (Phase 5): the single shared resource this link grants.
        resourceId: invite.ResourceID ?? undefined,
        nowSeconds,
        ttlSeconds: this.config.sessionTokenTtlHours * 3600,
      });
      const token = MagicLinkKeyManager.Instance.Sign(claims);

      const app = md.Applications.find((a) => UUIDsEqual(a.ID, invite.ApplicationID));

      return done({
        success: true,
        token,
        expiresAt: new Date(claims.exp * 1000).toISOString(),
        applicationId: invite.ApplicationID,
        applicationName: app?.Name,
        applicationPath: app?.Path || undefined,
        email: provision.email,
      });
    } catch (e) {
      LogError(e);
      return done({ success: false, errorCode: 'server_error', error: e instanceof Error ? e.message : String(e) });
    }
  }

  /**
   * Writes one MagicLinkRedemption audit row for a redemption attempt. Best-effort:
   * a failure here is logged but never fails the redemption (the user already has,
   * or has been denied, their session — losing an audit row must not change that).
   *
   * InviteID/ProvisionedUserID are null when the attempt didn't get far enough to
   * resolve them (e.g. a malformed or unknown token — exactly the scan/brute-force
   * signal we want recorded). IP/User-Agent/Origin are stored as supplied by the
   * router per the deployment's audit policy.
   */
  private async recordRedemption(
    result: RedeemMagicLinkResult,
    inviteId: string | undefined,
    provisionedUserId: string | undefined,
    audit: RedeemAuditContext | undefined,
    contextUser: UserInfo | null,
  ): Promise<void> {
    try {
      const ctx = contextUser ?? this.resolveProvisioningContextUser();
      if (!ctx) {
        LogError('[MagicLink] Cannot record redemption audit row: no context user available.');
        return;
      }
      // global-provider-ok: redemption runs pre-auth, no per-request provider yet.
      const md = Metadata.Provider; // global-provider-ok: server-side magic-link service; runs under the server's single default provider
      const row = await md.GetEntityObject<MJMagicLinkRedemptionEntity>(REDEMPTION_ENTITY, ctx);
      row.NewRecord();
      if (inviteId) {
        row.InviteID = inviteId;
      }
      row.AttemptedAt = new Date();
      row.Outcome = result.success ? 'success' : result.errorCode ?? 'server_error';
      row.IPAddress = audit?.ipAddress ?? null;
      row.UserAgent = audit?.userAgent ?? null;
      row.Origin = audit?.origin ?? null;
      if (provisionedUserId) {
        row.ProvisionedUserID = provisionedUserId;
      }
      if (!(await row.Save())) {
        LogError(`[MagicLink] Failed to write redemption audit row: ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`);
      }
    } catch (e) {
      LogError(`[MagicLink] Redemption audit write threw: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /**
   * Writes the Phase-2 multi-scope child rows (one application + one role) that
   * mirror the invite's single ApplicationID/RoleID. The columns remain the
   * source of truth for redemption today; these rows pre-stage the data for the
   * eventual switch to multi-scope reads, avoiding a breaking migration later.
   * Best-effort: a child-write failure is logged but does not fail invite
   * issuance (the columns alone keep the one-of-each flow working).
   */
  private async writeInviteScopeChildRows(
    inviteId: string,
    applicationId: string,
    roleId: string,
    creatingUser: UserInfo,
    md: IMetadataProvider,
  ): Promise<void> {
    try {
      const appRow = await md.GetEntityObject<MJMagicLinkInviteApplicationEntity>('MJ: Magic Link Invite Applications', creatingUser);
      appRow.NewRecord();
      appRow.InviteID = inviteId;
      appRow.ApplicationID = applicationId;
      if (!(await appRow.Save())) {
        LogError(`[MagicLink] Failed to write invite-application child row: ${appRow.LatestResult?.CompleteMessage ?? 'unknown error'}`);
      }

      const roleRow = await md.GetEntityObject<MJMagicLinkInviteRoleEntity>('MJ: Magic Link Invite Roles', creatingUser);
      roleRow.NewRecord();
      roleRow.InviteID = inviteId;
      roleRow.RoleID = roleId;
      if (!(await roleRow.Save())) {
        LogError(`[MagicLink] Failed to write invite-role child row: ${roleRow.LatestResult?.CompleteMessage ?? 'unknown error'}`);
      }
    } catch (e) {
      LogError(`[MagicLink] Writing invite scope child rows threw: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** Resolves the configured restricted role's ID, if present. */
  private resolveRestrictedRoleId(md: IMetadataProvider): string | undefined {
    const name = this.config.restrictedRoleName.trim().toLowerCase();
    const role: RoleInfo | undefined = md.Roles.find((r) => r.Name.trim().toLowerCase() === name);
    return role?.ID;
  }

  /** Builds the shareable redemption URL. */
  private buildRedemptionUrl(rawToken: string): string {
    const base = this.publicUrl.replace(/\/$/, '');
    return `${base}/magic-link/redeem?token=${encodeURIComponent(rawToken)}`;
  }

  /**
   * Provisions the redeeming user: finds them by email or creates them, then
   * ensures the restricted role and the single app assignment exist.
   */
  private async provisionUser(invite: MJMagicLinkInviteEntity, role: RoleInfo, contextUser: UserInfo): Promise<ProvisionResult> {
    // Ensure the invite's role can ACCESS the invite's app (Application Role with
    // CanAccess) — otherwise Explorer's app-access gate bounces the user off the
    // scoped app to a default. The invite is the authorization for that role to
    // reach that app. Idempotent + role/app-level (independent of the user/identity mode).
    await this.ensureAppAccess(invite.RoleID, invite.ApplicationID, contextUser);

    // Anonymous mode: resolve the shared Anonymous principal. CRITICALLY, we do NOT
    // write any UserRole/UserApplication for it — the anon user must never accrete
    // scope (that would make every anon visitor a superuser). Scope rides on the
    // per-session JWT claims; enforcement is claims-based, not role-based.
    if (invite.IdentityMode === 'anonymous') {
      return this.resolveAnonymousPrincipal();
    }

    const email = invite.Email;
    if (!email) {
      return { success: false, error: 'Email-mode invite is missing an email address.' };
    }

    const existing = UserCache.Instance.Users.find(
      (u) => !!u.Email && u.Email.trim().toLowerCase() === email.trim().toLowerCase(),
    );

    if (existing) {
      // Provisioning guard: never silently attach an external role/app to a
      // privileged existing account (Owner, or anyone holding a role OUTSIDE the
      // set of roles magic-link may legitimately grant). The invite's own granted
      // role is part of that allowed set, so a prior magic-link guest holding only
      // that role can re-redeem a multi-use link.
      if (this.isProtectedAccount(existing, role.Name)) {
        const detail = `existing account '${existing.Email}' is an Owner or already holds non-restricted roles`;
        if (this.config.provisioningGuard === 'block') {
          LogError(`[MagicLink] Blocked provisioning onto protected account: ${detail} (provisioningGuard=block).`);
          return { success: false, error: 'This email matches an existing privileged account; magic-link provisioning was blocked.' };
        }
        LogError(`[MagicLink] WARNING: provisioning external scope onto protected account — ${detail} (provisioningGuard=warn); proceeding.`);
      }

      const ok = await this.ensureRoleAndApp(existing.ID, invite.RoleID, invite.ApplicationID, contextUser);
      return ok
        ? { success: true, userId: existing.ID, email: existing.Email, firstName: existing.FirstName ?? undefined, lastName: existing.LastName ?? undefined }
        : { success: false, error: 'Failed to assign role/application to existing user.' };
    }

    return this.createScopedUser(invite, role, contextUser);
  }

  /**
   * Resolves the shared Anonymous principal for an anonymous-mode redemption. This
   * principal is an ATTRIBUTION ANCHOR only — it holds no scenario roles and gets no
   * UserRole/UserApplication rows here, so concurrent anon visitors can never accrete
   * scope onto a shared identity. Their actual scope lives in the per-session JWT
   * claims (mj_scopes) and is enforced claims-side. Fail-closed if the principal was
   * never seeded (the Phase-4 migration is required).
   */
  private resolveAnonymousPrincipal(): ProvisionResult {
    const anon = UserCache.Instance.Users.find((u) => UUIDsEqual(u.ID, ANONYMOUS_USER_ID));
    if (!anon) {
      LogError(`[MagicLink] Anonymous principal ${ANONYMOUS_USER_ID} not found in cache; run the Phase-4 migration.`);
      return { success: false, error: 'Anonymous access is not configured on this server.' };
    }
    return { success: true, userId: anon.ID, email: anon.Email ?? undefined, firstName: 'Anonymous', lastName: undefined };
  }

  /**
   * True if an existing account is "protected" from magic-link provisioning: an
   * Owner, or a user holding any role OUTSIDE the set of roles magic-link may
   * legitimately grant. That allowed set is: the configured restricted role, the
   * deployment's `grantableRoleNames`, AND the role THIS invite grants. So a prior
   * magic-link guest holding only magic-link-grantable roles (e.g. the invite's own
   * granted role) is NOT protected — re-redeeming a multi-use link is the intended
   * flow. A user holding e.g. Developer/Admin is still protected and blocked.
   *
   * @param user  the existing account being re-provisioned
   * @param invitedRoleName  the role name this invite grants
   */
  private isProtectedAccount(user: UserInfo, invitedRoleName: string): boolean {
    if ((user.Type ?? '').trim().toLowerCase() === 'owner') {
      return true;
    }
    const allowed = new Set<string>(
      [this.config.restrictedRoleName, ...this.config.grantableRoleNames, invitedRoleName]
        .filter((n): n is string => !!n)
        .map((n) => n.trim().toLowerCase()),
    );
    return (user.UserRoles ?? []).some((r) => !!r.Role && !allowed.has(r.Role.trim().toLowerCase()));
  }

  /** Creates a new user with exactly the restricted role + single app, transactionally. */
  private async createScopedUser(invite: MJMagicLinkInviteEntity, role: RoleInfo, contextUser: UserInfo): Promise<ProvisionResult> {
    // Single provider for BOTH the transaction and the entity writes, so the
    // BeginTransaction/Save/Commit are provably on the same connection.
    // global-provider-ok: redemption runs in the pre-auth flow, no per-request provider yet.
    const provider = Metadata.Provider as DatabaseProviderBase; // global-provider-ok: server-side magic-link service; runs under the server's single default provider
    const email = invite.Email;
    // The invite does not persist a name; provision a sensible default. (The
    // create-invite params accept first/last name but there is no column to
    // store them yet — see types.ts CreateMagicLinkInviteParams.)
    const firstName = 'Guest';
    const lastName = email;

    await provider.BeginTransaction();
    try {
      const user = await provider.GetEntityObject<MJUserEntity>('MJ: Users', contextUser);
      user.NewRecord();
      user.Name = email;
      user.Email = email;
      user.FirstName = firstName;
      user.LastName = lastName;
      user.Type = 'User';
      user.IsActive = true;
      if (!(await user.Save())) {
        throw new Error(`user save failed: ${user.LatestResult?.CompleteMessage ?? 'unknown'}`);
      }

      const userRole = await provider.GetEntityObject<MJUserRoleEntity>('MJ: User Roles', contextUser);
      userRole.NewRecord();
      userRole.UserID = user.ID;
      userRole.RoleID = invite.RoleID;
      if (!(await userRole.Save())) {
        throw new Error(`user role save failed: ${userRole.LatestResult?.CompleteMessage ?? 'unknown'}`);
      }

      const userApp = await provider.GetEntityObject<MJUserApplicationEntity>('MJ: User Applications', contextUser);
      userApp.NewRecord();
      userApp.UserID = user.ID;
      userApp.ApplicationID = invite.ApplicationID;
      userApp.Sequence = 0;
      userApp.IsActive = true;
      if (!(await userApp.Save())) {
        throw new Error(`user application save failed: ${userApp.LatestResult?.CompleteMessage ?? 'unknown'}`);
      }

      await provider.CommitTransaction();

      // Seed the UserCache so the very next request (carrying the minted JWT)
      // resolves this user without a full cache refresh.
      this.pushUserToCache(user, role);

      LogStatus(`[MagicLink] Provisioned external user ${email} with role '${role.Name}'.`);
      return { success: true, userId: user.ID, email, firstName, lastName };
    } catch (txErr) {
      await provider.RollbackTransaction();
      LogError(txErr);
      return { success: false, error: txErr instanceof Error ? txErr.message : String(txErr) };
    }
  }

  /** Idempotently ensures an existing user has the given role and app assignment. */
  private async ensureRoleAndApp(userId: string, roleId: string, applicationId: string, contextUser: UserInfo): Promise<boolean> {
    try {
      const md = new Metadata(); // global-provider-ok: server-side magic-link provisioning; runs under the server's single default provider
      const rv = new RunView();

      const [roleRes, appRes] = await rv.RunViews(
        [
          { EntityName: 'MJ: User Roles', ExtraFilter: `UserID = '${userId}' AND RoleID = '${roleId}'`, ResultType: 'simple' },
          { EntityName: 'MJ: User Applications', ExtraFilter: `UserID = '${userId}' AND ApplicationID = '${applicationId}'`, ResultType: 'simple' },
        ],
        contextUser,
      );

      if (roleRes.Success && (roleRes.Results?.length ?? 0) === 0) {
        const userRole = await md.GetEntityObject<MJUserRoleEntity>('MJ: User Roles', contextUser);
        userRole.NewRecord();
        userRole.UserID = userId;
        userRole.RoleID = roleId;
        if (!(await userRole.Save())) {
          LogError(`[MagicLink] Failed to add role to existing user: ${userRole.LatestResult?.CompleteMessage}`);
          return false;
        }
      }

      if (appRes.Success && (appRes.Results?.length ?? 0) === 0) {
        const userApp = await md.GetEntityObject<MJUserApplicationEntity>('MJ: User Applications', contextUser);
        userApp.NewRecord();
        userApp.UserID = userId;
        userApp.ApplicationID = applicationId;
        userApp.Sequence = 0;
        userApp.IsActive = true;
        if (!(await userApp.Save())) {
          LogError(`[MagicLink] Failed to add application to existing user: ${userApp.LatestResult?.CompleteMessage}`);
          return false;
        }
      }

      return true;
    } catch (e) {
      LogError(e);
      return false;
    }
  }

  /** Idempotently ensures the role has CanAccess to the application (Application Role). */
  private async ensureAppAccess(roleId: string, applicationId: string, contextUser: UserInfo): Promise<void> {
    try {
      const rv = new RunView();
      const res = await rv.RunView(
        {
          EntityName: 'MJ: Application Roles',
          ExtraFilter: `RoleID = '${roleId}' AND ApplicationID = '${applicationId}'`,
          ResultType: 'simple',
        },
        contextUser,
      );
      if (res.Success && (res.Results?.length ?? 0) > 0) {
        return; // already granted
      }
      const md = new Metadata(); // global-provider-ok: server-side magic-link provisioning; runs under the server's single default provider
      const appRole = await md.GetEntityObject<MJApplicationRoleEntity>('MJ: Application Roles', contextUser);
      appRole.NewRecord();
      appRole.ApplicationID = applicationId;
      appRole.RoleID = roleId;
      appRole.CanAccess = true;
      appRole.CanAdmin = false;
      if (!(await appRole.Save())) {
        LogError(`[MagicLink] Failed to grant app access: ${appRole.LatestResult?.CompleteMessage ?? 'unknown'}`);
      }
    } catch (e) {
      LogError(e);
    }
  }

  /**
   * Atomically consumes one use of the invite via a compare-and-swap UPDATE.
   * The WHERE clause re-checks every eligibility condition (Active, not
   * exhausted, not expired) at the DB level, so the increment and the guard are
   * a single atomic operation. Returns true ONLY when this call updated the row
   * (won the race); concurrent redemptions of a single-use link see 0 rows.
   *
   * Fail-closed: any DB error returns false and the redemption is rejected.
   */
  private async consumeInvite(invite: MJMagicLinkInviteEntity, provider: DatabaseProviderBase, contextUser: UserInfo): Promise<boolean> {
    try {
      const entityInfo = provider.EntityByName(INVITE_ENTITY);
      if (!entityInfo) {
        LogError(`[MagicLink] Entity metadata for '${INVITE_ENTITY}' not found; cannot consume invite.`);
        return false;
      }
      const table = `[${entityInfo.SchemaName}].[${entityInfo.BaseTable}]`;
      // OUTPUT returns one row iff the WHERE matched — the atomic single-use gate.
      const sql = buildConsumeInviteSQL(table);
      const rows = await provider.ExecuteSQL<{ ID: string }>(sql, [invite.ID], { isMutation: true }, contextUser);
      return Array.isArray(rows) && rows.length === 1;
    } catch (e) {
      LogError(`[MagicLink] Atomic consume failed for invite ${invite.ID}: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
  }

  /** Pushes a freshly created user into the UserCache with its single role. */
  private pushUserToCache(user: MJUserEntity, role: RoleInfo): void {
    const initData: MJUserEntityType & { UserRoles: { UserID: string; RoleName: string; RoleID: string }[] } = user.GetAll();
    initData.UserRoles = [{ UserID: user.ID, RoleName: role.Name, RoleID: role.ID }];
    const ui = new UserInfo(Metadata.Provider, initData); // global-provider-ok: redemption runs pre-auth, seeding the shared cache
    UserCache.Instance.Users.push(ui);
  }

  /**
   * True iff the invite's creator resolves to a still-active user. Used to
   * fail-closed at redeem time so a deactivated/removed inviter's outstanding
   * links stop working. A missing/blank CreatedByUserID is treated as inactive.
   */
  private isInviterActive(createdByUserId: string | null | undefined): boolean {
    if (!createdByUserId) {
      return false;
    }
    const inviter = UserCache.Instance.Users.find((u) => UUIDsEqual(u.ID, createdByUserId));
    return !!inviter && inviter.IsActive === true;
  }

  /** Resolves the user whose context provisions magic-link users. */
  private resolveProvisioningContextUser(): UserInfo | null {
    const candidate = this.config.contextUserForProvisioning || configInfo.userHandling?.contextUserForNewUserCreation;
    if (candidate) {
      const byName = UserCache.Instance.UserByName(candidate);
      if (byName) {
        return byName;
      }
      LogError(`[MagicLink] Configured provisioning user '${candidate}' not found; falling back to an Owner.`);
    }
    return UserCache.Users.find((u) => u.Type?.trim().toLowerCase() === 'owner') ?? null;
  }

  /** Sends the invite email via the configured communication provider. Best-effort. */
  private async sendInviteEmail(email: string, redemptionUrl: string, appName: string, contextUser: UserInfo): Promise<boolean> {
    try {
      const engine = CommunicationEngine.Instance;
      await engine.Config(false, contextUser);

      const msg = new Message();
      msg.From = this.config.fromAddress ?? '';
      msg.To = email;
      msg.Subject = `You've been invited to ${appName}`;
      msg.Body = `You've been invited to access ${appName}. Open this link to sign in:\n\n${redemptionUrl}\n\nThis link is single-use and will expire.`;
      msg.HTMLBody =
        `<p>You've been invited to access <strong>${appName}</strong>.</p>` +
        `<p><a href="${redemptionUrl}">Click here to sign in</a></p>` +
        `<p>This link is single-use and will expire.</p>`;

      const result = await engine.SendSingleMessage(this.config.communicationProvider!, 'Email', msg);
      if (!result?.Success) {
        LogError(`[MagicLink] Email send failed: ${result?.Error ?? 'unknown error'}`);
        return false;
      }
      return true;
    } catch (e) {
      LogError(`[MagicLink] Email send threw: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
  }
}
