/**
 * @fileoverview GraphQL redemption surface for MJ: Identity Claims.
 *
 * Exposes the server-side claim lifecycle (`IdentityClaimEngineServer`) to authenticated
 * clients: list my pending claims, redeem one claim (optionally with the emailed verification
 * token), and redeem everything pending for my email in one call. This is the surface the
 * claim emails' `/claims/redeem?id=..&token=..` links land on (via the Explorer redeem page).
 *
 * Security posture:
 * - Authentication is required (the engine refuses without a user); authorization is the
 *   engine's own gate — email match or timing-safe token match, further constrained by the
 *   claim type's Configuration and the IdP's `email_verified` assertion carried on
 *   `UserPayload.emailVerified`.
 * - A small in-memory fixed-window rate limit bounds redemption attempts per user, since
 *   GraphQL mutations get no per-operation limit from the transport tier.
 *
 * @module @memberjunction/server/resolvers/IdentityClaimRedemptionResolver
 */
import { Arg, Ctx, Field, Mutation, ObjectType, Query, Resolver } from 'type-graphql';
import { UserInfo } from '@memberjunction/core';
import { IdentityClaimEngineServer } from '@memberjunction/core-entities-server';
import { AppContext } from '../types.js';
import { GetReadWriteProvider } from '../util.js';
import { ResolverBase } from '../generic/ResolverBase.js';

@ObjectType()
export class IdentityClaimRedemptionResult {
  @Field()
  Success: boolean;

  @Field({ nullable: true })
  ErrorMessage?: string;

  @Field({ nullable: true })
  ClaimID?: string;

  /** JSON-serialized driver result data (shape is driver-specific) */
  @Field({ nullable: true })
  Data?: string;
}

@ObjectType()
export class PendingIdentityClaim {
  @Field()
  ID: string;

  @Field()
  ClaimTypeID: string;

  @Field({ nullable: true })
  ClaimTypeName?: string;

  @Field({ nullable: true })
  EntityID?: string;

  @Field({ nullable: true })
  RecordID?: string;

  @Field()
  Status: string;

  @Field()
  ExpiresAt: Date;
}

/**
 * Fixed-window per-user attempt limiter for redemption mutations. Redemption is a
 * human-interactive flow — a handful of attempts per minute is generous; dozens is
 * token guessing.
 */
const REDEEM_WINDOW_MS = 60_000;
const REDEEM_MAX_ATTEMPTS_PER_WINDOW = 10;
const REDEEM_ATTEMPTS_CACHE_MAX = 10_000;
const redeemAttempts = new Map<string, { windowStart: number; count: number }>();

function redeemRateLimitExceeded(userId: string): boolean {
  const now = Date.now();
  const entry = redeemAttempts.get(userId);
  if (!entry || now - entry.windowStart >= REDEEM_WINDOW_MS) {
    if (redeemAttempts.size >= REDEEM_ATTEMPTS_CACHE_MAX) {
      // Bounded map: evict the oldest insertion rather than growing without limit.
      const oldest = redeemAttempts.keys().next().value;
      if (oldest !== undefined) {
        redeemAttempts.delete(oldest);
      }
    }
    redeemAttempts.set(userId, { windowStart: now, count: 1 });
    return false;
  }
  entry.count++;
  return entry.count > REDEEM_MAX_ATTEMPTS_PER_WINDOW;
}

@Resolver()
export class IdentityClaimRedemptionResolver extends ResolverBase {
  /**
   * Lists the caller's pending, unexpired identity claims (matched on their normalized email).
   */
  @Query(() => [PendingIdentityClaim])
  async GetMyPendingIdentityClaims(@Ctx() ctx: AppContext): Promise<PendingIdentityClaim[]> {
    const user = ctx.userPayload.userRecord as UserInfo;
    if (!user) {
      throw new Error('User is not authenticated');
    }
    await this.CheckAPIKeyScopeAuthorization('identity:claims', 'read', ctx.userPayload);

    const engine = IdentityClaimEngineServer.Instance;
    await engine.Config(false, user);
    const provider = GetReadWriteProvider(ctx.providers);
    const claims = await engine.GetPendingClaimsForEmail(user.Email, user, provider);
    return claims.map((c) => ({
      ID: c.ID,
      ClaimTypeID: c.ClaimTypeID,
      ClaimTypeName: engine.GetClaimTypeByID(c.ClaimTypeID)?.Name,
      EntityID: c.EntityID ?? undefined,
      RecordID: c.RecordID ?? undefined,
      Status: c.Status,
      ExpiresAt: c.ExpiresAt,
    }));
  }

  /**
   * Redeems a single identity claim for the authenticated caller. The engine enforces the
   * authorization gate: email match (subject to the IdP's email_verified assertion and the
   * claim type's Configuration) OR the emailed verification token.
   */
  @Mutation(() => IdentityClaimRedemptionResult)
  async RedeemIdentityClaim(
    @Arg('ClaimID') claimID: string,
    @Ctx() ctx: AppContext,
    @Arg('Token', { nullable: true }) token?: string,
  ): Promise<IdentityClaimRedemptionResult> {
    const user = ctx.userPayload.userRecord as UserInfo;
    if (!user) {
      throw new Error('User is not authenticated');
    }
    await this.CheckAPIKeyScopeAuthorization('identity:claims', claimID, ctx.userPayload);

    if (redeemRateLimitExceeded(user.ID)) {
      return { Success: false, ErrorMessage: 'Too many redemption attempts — please wait a minute and try again', ClaimID: claimID };
    }

    const engine = IdentityClaimEngineServer.Instance;
    await engine.Config(false, user);
    const provider = GetReadWriteProvider(ctx.providers);
    const result = await engine.RedeemClaim(claimID, user, provider, token ?? undefined, {
      EmailVerified: ctx.userPayload.emailVerified,
    });
    return {
      Success: result.Success,
      ErrorMessage: result.ErrorMessage,
      ClaimID: claimID,
      Data: result.Data ? JSON.stringify(result.Data) : undefined,
    };
  }

  /**
   * Discovers and redeems every pending claim addressed to the caller's email — the on-demand
   * form of the automatic claim-on-login sweep. Each redemption runs through the full engine
   * gate; failures are returned per-claim, never thrown.
   */
  @Mutation(() => [IdentityClaimRedemptionResult])
  async AutoClaimPendingIdentityClaims(@Ctx() ctx: AppContext): Promise<IdentityClaimRedemptionResult[]> {
    const user = ctx.userPayload.userRecord as UserInfo;
    if (!user) {
      throw new Error('User is not authenticated');
    }
    await this.CheckAPIKeyScopeAuthorization('identity:claims', 'auto', ctx.userPayload);

    if (redeemRateLimitExceeded(user.ID)) {
      return [{ Success: false, ErrorMessage: 'Too many redemption attempts — please wait a minute and try again' }];
    }

    const engine = IdentityClaimEngineServer.Instance;
    await engine.Config(false, user);
    const provider = GetReadWriteProvider(ctx.providers);
    const results = await engine.AutoClaimForUser(user, provider, { EmailVerified: ctx.userPayload.emailVerified });
    return results.map((r) => ({
      Success: r.Success,
      ErrorMessage: r.ErrorMessage,
      Data: r.Data ? JSON.stringify(r.Data) : undefined,
    }));
  }
}
