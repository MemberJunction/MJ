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
import { CloneUserForSessionContext } from '../auth/sessionUserClone.js';

/**
 * Allowlist for tenant identifiers arriving from a request header: GUIDs and
 * conservative identifiers only. Anything else is rejected AT THE BOUNDARY with
 * a 400 — never silently dropped, because a dropped tenant header degrades to an
 * UNSCOPED session, which is the fail-open case validation exists to prevent.
 * Escaping at predicate construction is defense in depth behind this, not a
 * substitute: `x' OR '1'='1` previously survived to the WHERE clause because the
 * downstream keyword blocklist strips string literals before matching and has no
 * rule for OR.
 */
const TENANT_ID_PATTERN = /^[A-Za-z0-9_.\-]{1,128}$/;

/** True when the value is acceptable as a tenant identifier. Exported for tests. */
export function IsValidTenantId(tenantId: string): boolean {
  return TENANT_ID_PATTERN.test(tenantId);
}

/** Custom tenant context extractor signature */
export type TenantContextExtractor = (
  user: UserInfo,
  req: Express.Request
) => Promise<{ TenantID: string } | null>;

/**
 * Creates Express middleware that resolves and attaches TenantContext
 * to the authenticated user's UserInfo for each request.
 *
 * This middleware runs in the post-auth slot (after `createUnifiedAuthMiddleware`)
 * so `req.userPayload` is available. It reads the tenant ID from the configured
 * source and attaches it directly to `userPayload.userRecord.TenantContext`.
 *
 * By the time GraphQL resolvers or REST handlers run, the contextUser already
 * has TenantContext set — no deferred pickup via `req['__mj_tenantId']` needed.
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
      // reject rather than silently pick one (Array.prototype's coercion to a comma-joined
      // string would otherwise sail past IsValidTenantId's regex unnoticed for some inputs).
      if (Array.isArray(rawHeader)) {
        res.status(400).json({ error: `Malformed ${config.tenantHeader} header: expected a single value.` });
        return;
      }
      const tenantId = rawHeader;
      if (tenantId) {
        if (!IsValidTenantId(tenantId)) {
          // Reject the REQUEST, never degrade to an unscoped session: a malformed
          // tenant header that silently attaches nothing produces a session with NO
          // tenant filter at all — strictly worse than failing loudly.
          res.status(400).json({ error: 'Invalid tenant identifier' });
          return;
        }
        // Clone before stamping: userRecord is very often the SHARED UserCache
        // instance, and stamping it in place races concurrent requests for the
        // same user (one request's tenant becomes another's, same-instant).
        const sessionUser = CloneUserForSessionContext(userPayload.userRecord as UserInfo);
        attachTenantContext(sessionUser, tenantId, 'header');
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
 * The caller is responsible for two invariants (createTenantMiddleware shows both):
 * validate untrusted tenant ids with {@link IsValidTenantId} BEFORE calling, and
 * never pass the shared cached UserInfo — clone it first
 * (CloneUserForSessionContext). This function still validates as defense in depth
 * so a future caller from a different source ('linkedEntity', 'custom') cannot
 * reintroduce the injection path.
 */
export function attachTenantContext(
  user: UserInfo,
  tenantId: string,
  source: TenantContext['Source']
): void {
  if (!IsValidTenantId(tenantId)) {
    throw new Error(`Invalid tenant identifier (must match ${TENANT_ID_PATTERN})`);
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

    // Determine which column holds the tenant ID. The column is operator config, not
    // user input — but it is interpolated into an identifier position, so it must
    // resolve to a real, non-virtual field on the entity (rejecting typos AND ruling
    // out identifier injection through a compromised config), and it is quoted through
    // the platform-appropriate helper rather than hardcoded T-SQL brackets, which are
    // invalid on PostgreSQL.
    const tenantColumn = config.entityColumnMappings[entityName] ?? config.defaultTenantColumn;
    const md = new Metadata(); // global-provider-ok: same rationale as isEntityScoped above — hooks carry no per-request provider
    const entityInfo = md.EntityByName(entityName);
    const field = entityInfo?.Fields.find(
      f => !f.IsVirtual && f.Name.trim().toLowerCase() === tenantColumn.trim().toLowerCase()
    );
    if (!field) {
      throw new Error(
        `Multi-tenancy misconfiguration: tenant column '${tenantColumn}' does not resolve to a stored field on entity '${entityName}'`
      );
    }

    // Escape the value at construction even though the boundary validated it —
    // defense in depth for future callers that attach TenantContext from sources
    // other than the validated header path.
    const safeTenantId = contextUser.TenantContext.TenantID.replace(/'/g, "''");
    const tenantFilter = `${QuoteFilterIdentifier(field.Name)} = '${safeTenantId}'`;

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
 * Quotes an identifier for use in a tenant predicate via the active provider's
 * QuoteIdentifier (DatabaseProviderBase always exposes one server-side, yielding [x]
 * on SQL Server and "x" on PostgreSQL). Throws — never falls back to hardcoded T-SQL
 * bracket quoting — when no provider is available: a silent fallback would emit
 * invalid SQL on PostgreSQL, and "fails to build a query" is a worse failure mode to
 * debug than "refused to build one." A tenant filter must fail closed, loudly, at the
 * point where it can no longer guarantee platform-correct SQL. Exported for tests.
 */
export function QuoteFilterIdentifier(name: string): string {
  const provider = Metadata.Provider as unknown as { QuoteIdentifier?: (id: string) => string }; // global-provider-ok: hook-level code, single server provider
  if (!provider || typeof provider.QuoteIdentifier !== 'function') {
    throw new Error(
      `[MultiTenancy] Cannot quote identifier '${name}': no database provider available to quote it — refusing to fall back to hardcoded bracket syntax, which is invalid on PostgreSQL.`
    );
  }
  return provider.QuoteIdentifier(name);
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
