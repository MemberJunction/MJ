/**
 * Multi-tenant data separation framework.
 *
 * Provides factory functions that create Express middleware and provider hooks
 * based on the `multiTenancy` section of mj.config.cjs. All functions return
 * standard hook/middleware types from WS2 so they integrate seamlessly with
 * the MJServer extensibility system.
 */

import type { RequestHandler } from 'express';
import type { PreRunViewHook, PreSaveHook } from '@memberjunction/core';
import { Metadata, type UserInfo, type TenantContext } from '@memberjunction/core';
import type { MultiTenancyConfig } from '../config.js';
import type { UserPayload } from '../types.js';
import { cloneUserInfoForSession } from '../userInfoSession.js';

/** Custom tenant context extractor signature */
export type TenantContextExtractor = (
  user: UserInfo,
  req: Express.Request
) => Promise<{ TenantID: string } | null>;

/**
 * Tenant ids must be a bounded, punctuation-free identifier (GUIDs included). Enforced at the
 * boundary in `attachTenantContext` — a malformed id is rejected outright rather than degrading
 * to an unscoped session. See WS2 plan §4.1 fix (1).
 */
const TENANT_ID_PATTERN = /^[A-Za-z0-9_.-]{1,128}$/;

/** Thrown by `attachTenantContext` when `tenantId` fails the boundary validation. */
export class TenantContextValidationError extends Error {}

/**
 * Creates Express middleware that resolves and attaches TenantContext
 * to the authenticated user's UserInfo for each request.
 *
 * This middleware runs in the post-auth slot (after `createUnifiedAuthMiddleware`)
 * so `req.userPayload` is available. It reads the tenant ID from the configured
 * source and attaches it to a per-request clone of `userPayload.userRecord`.
 *
 * By the time GraphQL resolvers or REST handlers run, the contextUser already
 * has TenantContext set — no deferred pickup via `req['__mj_tenantId']` needed.
 *
 * `userPayload.userRecord` may be the shared `UserCache` instance (true for both JWT and
 * API-key sessions — see `context.ts`), so TenantContext is stamped onto a fresh clone
 * (`cloneUserInfoForSession`), never the shared instance — otherwise concurrent requests for
 * the same user with different tenant headers would race on one object. See WS2 plan §4.2.
 *
 * A malformed/oversized header is rejected with 400 and the request never proceeds — it must
 * never fall through to `next()` with an unscoped session (WS2 plan §4.1 fix (1)).
 */
export function createTenantMiddleware(config: MultiTenancyConfig): RequestHandler {
  return (req, res, next) => {
    const userPayload = (req as { userPayload?: UserPayload }).userPayload;
    if (!userPayload?.userRecord) {
      // No authenticated user — skip tenant resolution
      next();
      return;
    }

    if (config.contextSource === 'header') {
      const rawHeader = req.headers[config.tenantHeader.toLowerCase()];
      // A repeated header arrives as string[] — ambiguous which value is authoritative, so
      // reject rather than silently pick one.
      if (Array.isArray(rawHeader)) {
        res.status(400).json({ error: `Malformed ${config.tenantHeader} header: expected a single value.` });
        return;
      }
      if (rawHeader) {
        const sessionUser = cloneUserInfoForSession(userPayload.userRecord as UserInfo, Metadata.Provider); // global-provider-ok: same rationale as isEntityScoped above — hooks/middleware don't carry a per-request provider
        try {
          attachTenantContext(sessionUser, rawHeader, 'header');
        } catch (err) {
          res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid tenant context header.' });
          return;
        }
        userPayload.userRecord = sessionUser;
      }
    }
    next();
  };
}

/**
 * Attaches TenantContext to a UserInfo object.
 * Called from the GraphQL context function after authentication.
 *
 * Validates `tenantId` against `TENANT_ID_PATTERN` regardless of `source` — the boundary check
 * lives here so every caller (header today; a future `linkedEntity`/`custom` source tomorrow)
 * gets it, not just `createTenantMiddleware`. Throws `TenantContextValidationError` and leaves
 * `user.TenantContext` untouched on failure — never a partial/degraded assignment.
 */
export function attachTenantContext(
  user: UserInfo,
  tenantId: string,
  source: TenantContext['Source']
): void {
  if (typeof tenantId !== 'string' || !TENANT_ID_PATTERN.test(tenantId)) {
    throw new TenantContextValidationError(
      `Invalid tenant id from source '${source}': must be 1-128 characters matching [A-Za-z0-9_.-].`
    );
  }
  user.TenantContext = { TenantID: tenantId, Source: source };
}

/**
 * Determines whether a given entity name should have tenant filtering applied.
 */
function isEntityScoped(entityName: string, config: MultiTenancyConfig): boolean {
  // Auto-exclude core MJ entities (entities in the __mj schema)
  if (config.autoExcludeCoreEntities) {
    const md = new Metadata(); // global-provider-ok: read-only schema check. Hooks (PreRunViewHook/PreSaveHook) don't carry per-request provider; reading the constant `__mj` schema flag is identical across every provider's catalog.
    const entity = md.Entities.find(
      e => e.Name.trim().toLowerCase() === entityName.trim().toLowerCase()
    );
    if (entity && entity.SchemaName === '__mj') {
      return false;
    }
  }

  const normalizedName = entityName.trim().toLowerCase();
  const normalizedScoped = config.scopedEntities.map(e => e.trim().toLowerCase());

  if (config.scopingStrategy === 'allowlist') {
    // Only entities explicitly listed are scoped
    return normalizedScoped.includes(normalizedName);
  }

  // Denylist: all entities are scoped EXCEPT those listed
  return !normalizedScoped.includes(normalizedName);
}

/**
 * Checks if a user has an admin role that bypasses tenant filtering.
 */
function isAdminUser(user: UserInfo, adminRoles: string[]): boolean {
  if (!user.UserRoles || user.UserRoles.length === 0) return false;
  const normalizedAdmin = adminRoles.map(r => r.trim().toLowerCase());
  return user.UserRoles.some(
    ur => normalizedAdmin.includes(ur.Role?.trim().toLowerCase() ?? '')
  );
}

/** Narrow capability this hook needs from the resolved metadata provider. */
interface IdentifierQuotingProvider {
  QuoteIdentifier(name: string): string;
}

function providesIdentifierQuoting(provider: object): provider is IdentifierQuotingProvider {
  return 'QuoteIdentifier' in provider && typeof (provider as IdentifierQuotingProvider).QuoteIdentifier === 'function';
}

/**
 * Builds the `<quoted column> = '<escaped tenant id>'` predicate for `createTenantPreRunViewHook`.
 *
 * Defense in depth beyond the `attachTenantContext` boundary check (WS2 plan §4.1 fix (2)):
 * escapes the tenant id here too, so a future caller reaching `attachTenantContext` from a
 * `'linkedEntity'`/`'custom'` source can't reintroduce the injection hole by construction alone.
 * Verifies `tenantColumn` resolves to a real, non-virtual field (fix (3)) and quotes it via the
 * provider's own `QuoteIdentifier` rather than hardcoded `[...]` bracket syntax, which is invalid
 * on PostgreSQL (fix (4)). Throws — never returns an unfiltered/best-guess predicate — when the
 * entity, column, or a usable provider can't be resolved; the calling hook aborts the request.
 */
function buildTenantFilterClause(entityName: string, tenantColumn: string, tenantId: string): string {
  const md = Metadata.Provider; // global-provider-ok: same rationale as isEntityScoped above
  const entity = md?.EntityByName(entityName);
  if (!entity) {
    throw new Error(`[MultiTenancy] Cannot scope entity '${entityName}': entity not found in metadata.`);
  }
  const field = entity.Fields.find(
    f => f.Name.trim().toLowerCase() === tenantColumn.trim().toLowerCase() && !f.IsVirtual
  );
  if (!field) {
    throw new Error(
      `[MultiTenancy] Cannot scope entity '${entityName}': tenant column '${tenantColumn}' does not resolve to a real, non-virtual field.`
    );
  }
  if (!md || !providesIdentifierQuoting(md)) {
    throw new Error(
      `[MultiTenancy] Cannot scope entity '${entityName}': no database provider available to quote the tenant column identifier.`
    );
  }
  const safeTenantId = tenantId.replace(/'/g, "''");
  return `${md.QuoteIdentifier(field.Name)} = '${safeTenantId}'`;
}

/**
 * Creates a PreRunViewHook that auto-injects tenant WHERE clauses
 * into RunView queries for scoped entities.
 */
export function createTenantPreRunViewHook(config: MultiTenancyConfig): PreRunViewHook {
  return (params, contextUser) => {
    // No tenant context → no filtering
    if (!contextUser?.TenantContext) return params;

    // Admin users bypass tenant filtering
    if (isAdminUser(contextUser, config.adminRoles)) return params;

    // Resolve entity name from params
    const entityName = params.EntityName;
    if (!entityName) return params; // Can't filter without knowing the entity

    // Check if this entity should be scoped
    if (!isEntityScoped(entityName, config)) return params;

    // Determine which column holds the tenant ID
    const tenantColumn = config.entityColumnMappings[entityName] ?? config.defaultTenantColumn;
    const tenantFilter = buildTenantFilterClause(entityName, tenantColumn, contextUser.TenantContext.TenantID);

    // Inject the tenant filter
    if (params.ExtraFilter && typeof params.ExtraFilter === 'string' && params.ExtraFilter.trim().length > 0) {
      params.ExtraFilter = `(${params.ExtraFilter}) AND ${tenantFilter}`;
    } else {
      params.ExtraFilter = tenantFilter;
    }

    return params;
  };
}

/**
 * Creates a PreSaveHook that validates the tenant column on writes.
 *
 * In 'strict' mode, rejects saves where the tenant column value doesn't
 * match the user's TenantContext. In 'log' mode, warns but allows. In
 * 'off' mode, this hook is a no-op.
 */
export function createTenantPreSaveHook(config: MultiTenancyConfig): PreSaveHook {
  return (entity, contextUser) => {
    // No validation needed if write protection is off
    if (config.writeProtection === 'off') return true;

    // No tenant context → no validation
    if (!contextUser?.TenantContext) return true;

    // Admin users bypass write validation
    if (isAdminUser(contextUser, config.adminRoles)) return true;

    // Check if this entity should be scoped
    const entityName = entity.EntityInfo?.Name;
    if (!entityName) return true;
    if (!isEntityScoped(entityName, config)) return true;

    // Determine which column holds the tenant ID
    const tenantColumn = config.entityColumnMappings[entityName] ?? config.defaultTenantColumn;

    // Get the value of the tenant column from the entity
    const tenantFieldValue = entity.Get(tenantColumn);

    // For new records without the tenant column set, auto-assign the tenant ID
    if (!entity.IsSaved && (tenantFieldValue === null || tenantFieldValue === undefined)) {
      entity.Set(tenantColumn, contextUser.TenantContext.TenantID);
      return true;
    }

    // Validate the tenant column matches
    if (tenantFieldValue && String(tenantFieldValue) !== contextUser.TenantContext.TenantID) {
      const message = `Save rejected: ${entityName} record belongs to tenant '${tenantFieldValue}' but user is in tenant '${contextUser.TenantContext.TenantID}'`;
      if (config.writeProtection === 'strict') {
        return message; // Reject with error message
      }
      // 'log' mode — warn but allow
      console.warn(`[MultiTenancy] ${message}`);
    }

    return true;
  };
}
