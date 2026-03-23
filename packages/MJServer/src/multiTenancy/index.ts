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
  return (req, _res, next) => {
    const userPayload = (req as { userPayload?: UserPayload }).userPayload;
    if (!userPayload?.userRecord) {
      // No authenticated user — skip tenant resolution
      next();
      return;
    }

    if (config.contextSource === 'header') {
      const tenantId = req.headers[config.tenantHeader.toLowerCase()] as string | undefined;
      if (tenantId) {
        attachTenantContext(userPayload.userRecord as UserInfo, tenantId, 'header');
      }
    }
    next();
  };
}

/**
 * Attaches TenantContext to a UserInfo object.
 * Called from the GraphQL context function after authentication.
 */
export function attachTenantContext(
  user: UserInfo,
  tenantId: string,
  source: TenantContext['Source']
): void {
  user.TenantContext = { TenantID: tenantId, Source: source };
}

/**
 * Determines whether a given entity name should have tenant filtering applied.
 */
function isEntityScoped(entityName: string, config: MultiTenancyConfig): boolean {
  // Auto-exclude core MJ entities (entities in the __mj schema)
  if (config.autoExcludeCoreEntities) {
    const md = new Metadata();
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

    // Determine which column holds the tenant ID
    const tenantColumn = config.entityColumnMappings[entityName] ?? config.defaultTenantColumn;
    const tenantFilter = `[${tenantColumn}] = '${contextUser.TenantContext.TenantID}'`;

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
