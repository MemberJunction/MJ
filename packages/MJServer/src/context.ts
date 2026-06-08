import { IncomingMessage } from 'http';
import * as url from 'url';
import { default as jwt } from 'jsonwebtoken';
import 'reflect-metadata';
import { Subject, firstValueFrom } from 'rxjs';
import { AuthenticationError, AuthorizationError } from 'type-graphql';
import sql from 'mssql';
import { getSigningKeys, getSystemUser, getValidationOptions, verifyUserRecord, extractUserInfoFromPayload } from './auth/index.js';
import { TokenExpiredError, AuthProviderFactory } from '@memberjunction/auth-providers';
import { authCache } from './cache.js';
import { userEmailMap, apiKey, mj_core_schema } from './config.js';
import { buildBoundaryLogPayload } from './logging/boundaryLogPayload.js';
import { DataSourceInfo, UserPayload } from './types.js';
import { GetReadOnlyDataSource, GetReadWriteDataSource } from './util.js';
import { v4 as uuidv4 } from 'uuid';
import e from 'express';
import type { RequestHandler, Request, Response, NextFunction } from 'express';
import { DatabaseProviderBase, UserInfo, type MagicLinkScope } from '@memberjunction/core';
import { SQLServerDataProvider, SQLServerProviderConfigData, UserCache } from '@memberjunction/sqlserver-dataprovider';
import { Metadata } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { resolveDbPlatformFromEnv } from '@memberjunction/generic-database-provider';
import { GetAPIKeyEngine } from '@memberjunction/api-keys';

// ── Session / login audit (Phase 3) ───────────────────────────────────────────
// Writes one `MJ: Audit Logs` row per session establishment (and per auth failure),
// across EVERY provider, hooked at token validation below. Deduped by (iss, sub, iat)
// in a bounded, no-TTL map so a given issued token logs ONCE per process — not per
// request. (We deliberately do NOT reuse authCache for this: its 1h TTL would re-log
// long-lived sessions every hour.) Reviewers asked to audit all user access with
// timestamp/IP/browser — that payload lives in the Details JSON; the table has no
// dedicated columns. Best-effort throughout: an audit failure NEVER blocks auth.
const SESSION_AUDIT_TYPE = 'Session Established';
const LOGIN_FAILED_AUDIT_TYPE = 'Login Failed';
const SESSION_AUDIT_CACHE_MAX = 50_000;
const sessionAuditSeen = new Map<string, number>(); // insertion-ordered → evict oldest

function sessionAuditKey(prefix: string, payload: jwt.JwtPayload | null): string {
  return `${prefix}|${payload?.iss ?? 'unknown'}|${payload?.sub ?? 'nosub'}|${payload?.iat ?? 0}`;
}

/** First-seen guard: true the first time a key is seen this process; bounds the map. */
function markSessionAuditSeen(key: string): boolean {
  if (sessionAuditSeen.has(key)) {
    return false;
  }
  if (sessionAuditSeen.size >= SESSION_AUDIT_CACHE_MAX) {
    const oldest = sessionAuditSeen.keys().next().value;
    if (oldest !== undefined) {
      sessionAuditSeen.delete(oldest);
    }
  }
  sessionAuditSeen.set(key, Date.now());
  return true;
}

let _usersEntityId: string | null | undefined; // resolved lazily; null once known-missing
function resolveUsersEntityId(): string | null {
  if (_usersEntityId === undefined) {
    const md = Metadata.Provider; // global-provider-ok: server auth path; Users entity ID is process-global metadata
    _usersEntityId = md?.EntityByName('Users')?.ID ?? md?.EntityByName('MJ: Users')?.ID ?? null;
  }
  return _usersEntityId;
}

/**
 * Writes one session/login audit row via the provider's CreateAuditLogRecord helper
 * (resolves the audit-log type by name from the in-memory cache, fire-and-forget save).
 * EntityID points at the Users entity + the user's ID as RecordID — a session event
 * is "about" the user. Full IP/UA/origin go in Details (per reviewer request); a
 * deployment may later truncate/hash them via an audit-policy knob.
 */
async function writeSessionAudit(args: {
  user: UserInfo;
  auditTypeName: string;
  status: 'Success' | 'Failed';
  payload: jwt.JwtPayload | null;
  requestContext: RequestContext | undefined;
  requestDomain: string | undefined;
  description: string;
  extraDetails?: Record<string, unknown>;
}): Promise<void> {
  try {
    // global-provider-ok: pre-context auth path; the audit-log-type cache is process-global metadata.
    const provider = Metadata.Provider as unknown as DatabaseProviderBase; // global-provider-ok: server auth audit path; runs under the server's single default provider
    const usersEntityId = resolveUsersEntityId();
    if (!provider || !usersEntityId) {
      return;
    }
    // Audit rows MUST be saved under a PRIVILEGED context. The session user may be a
    // permission-less magic-link guest with no create rights on MJ: Audit Logs — saving
    // as them silently fails the permission check (this is exactly why the built-in
    // CreateAuditLogRecord, which saves as `user`, drops guest session rows). We record
    // the real session user in UserID but write the row as the system user.
    const writer = await getSystemUser();
    const auditType = provider.AuditLogTypes?.find(
      (t) => t?.Name?.trim().toLowerCase() === args.auditTypeName.trim().toLowerCase(),
    );
    if (!writer || !auditType) {
      return;
    }
    const details = JSON.stringify({
      provider: args.payload?.iss ?? null,
      sub: args.payload?.sub ?? null,
      iat: args.payload?.iat ?? null,
      ipAddress: args.requestContext?.ipAddress ?? null,
      userAgent: args.requestContext?.userAgent ?? null,
      origin: args.requestDomain ?? null,
      endpoint: args.requestContext?.endpoint ?? null,
      ...(args.extraDetails ?? {}),
    });
    const row = await provider.GetEntityObject('MJ: Audit Logs', writer);
    row.NewRecord();
    row.Set('UserID', args.user.ID);
    row.Set('AuditLogTypeID', auditType.ID);
    row.Set('Status', args.status);
    row.Set('EntityID', usersEntityId);
    row.Set('RecordID', args.user.ID);
    row.Set('Details', details);
    row.Set('Description', args.description);
    if (!(await row.Save())) {
      console.warn('[SessionAudit] audit row save returned false:', row.LatestResult?.CompleteMessage ?? 'unknown');
    }
  } catch (e) {
    console.warn('[SessionAudit] failed to write audit row:', e instanceof Error ? e.message : String(e));
  }
}

/** Best-effort failure audit: decodes the attempted identity, dedupes, attributes to the system user. */
async function auditLoginFailure(
  bearerToken: string | undefined,
  error: unknown,
  requestContext: RequestContext | undefined,
  requestDomain: string | undefined,
): Promise<void> {
  try {
    const token = bearerToken ? bearerToken.replace('Bearer ', '') : '';
    if (!token) {
      // No credential was presented — a public/unauthenticated request (favicon, health
      // checks, anonymous GraphQL), NOT a failed login. Auditing these is pure noise.
      return;
    }
    let payload: jwt.JwtPayload | null = null;
    const decoded = jwt.decode(token);
    if (decoded && typeof decoded !== 'string') {
      payload = decoded;
    }
    // Dedup by (iss,sub,iat) when the token decodes; otherwise by the token tail so that
    // a scan presenting many DIFFERENT garbage tokens doesn't collapse into a single row.
    const key = payload ? sessionAuditKey('fail', payload) : `fail|raw|${token.slice(-24)}`;
    if (!markSessionAuditSeen(key)) {
      return; // already logged this failing identity/token — don't let a retry loop spam
    }
    // No-arg: getSystemUser pulls from the process-global UserCache (no ConnectionPool needed here).
    const systemUser = await getSystemUser();
    if (!systemUser) {
      return;
    }
    await writeSessionAudit({
      user: systemUser,
      auditTypeName: LOGIN_FAILED_AUDIT_TYPE,
      status: 'Failed',
      payload,
      requestContext,
      requestDomain,
      description: 'Authentication failed during token validation',
      extraDetails: {
        attemptedEmail: payload && typeof payload === 'object' ? (payload as Record<string, unknown>)['email'] ?? null : null,
        reason: error instanceof Error ? error.message : String(error),
      },
    });
  } catch (e) {
    console.warn('[SessionAudit] failed to write login-failure row:', e instanceof Error ? e.message : String(e));
  }
}

// ── Phase 5: magic-link session scoping (resource scope + anonymous role synthesis) ──
// Builds the per-request UserInfo for a magic-link session, carrying:
//   • a per-session RESOURCE scope (ResourceID/ResourceType from the verified claims) so
//     resource-pinned RLS (`{{ScopeResourceID}}`) confines a share to one resource + its
//     FK-reachable dependents — the granted role stays narrow. Applies to named AND anon.
//   • for ANONYMOUS sessions only, the claimed role(s) synthesized in memory (the shared
//     Anonymous principal holds no DB roles, by design — so anon sessions can't accrete).
// Always returns a FRESH UserInfo when it sets per-session state, because the resolved
// userRecord may be a SHARED cached instance (e.g. multiple recruiters on one per-company
// link) — mutating it would leak one session's scope to another. Non-magic-link sessions,
// and named sessions with no resource scope, are returned untouched.
function buildMagicLinkSessionUser(userRecord: UserInfo, payload: jwt.JwtPayload): UserInfo {
  if (payload['mj_magic_link'] !== true) {
    return userRecord;
  }
  const md = Metadata.Provider; // global-provider-ok: server-side magic-link session built under the server's single default provider
  const isAnon = payload['mj_anon'] === true;
  const scopes = payload['mj_scopes'];

  // Per-session resource scope (single-resource share; multi-resource union is a follow-on).
  let scope: MagicLinkScope | undefined;
  if (Array.isArray(scopes)) {
    const withResource = scopes.find((s) => s && typeof s.resourceId === 'string' && s.resourceId);
    if (withResource) {
      scope = {
        ResourceID: withResource.resourceId,
        ResourceType: typeof withResource.resourceType === 'string' ? withResource.resourceType : undefined,
      };
    }
  }

  // Anonymous: synthesize the claimed role(s) (persisted nowhere). Named: keep real DB roles.
  let synthesizedRoles: { UserID: string; RoleID: string; RoleName: string }[] | undefined;
  if (isAnon) {
    const roleNames = new Set<string>();
    if (Array.isArray(scopes)) {
      for (const s of scopes) {
        if (s && typeof s.role === 'string') {
          roleNames.add(s.role);
        }
      }
    }
    if (typeof payload['mj_role'] === 'string') {
      roleNames.add(payload['mj_role'] as string);
    }
    synthesizedRoles = [];
    for (const rn of roleNames) {
      const role = md?.Roles.find((r) => r.Name?.trim().toLowerCase() === rn.trim().toLowerCase());
      if (role) {
        synthesizedRoles.push({ UserID: userRecord.ID, RoleID: role.ID, RoleName: role.Name });
      }
    }
  }

  // Named session with no resource scope → no per-request state needed, use the cached user.
  if (!isAnon && !scope) {
    return userRecord;
  }

  const sessionUser = new UserInfo(md, {
    ...userRecord,
    _UserRoles: undefined,
    UserRoles: isAnon ? synthesizedRoles : userRecord.UserRoles,
  });
  if (scope) {
    sessionUser.MagicLinkScope = scope;
  }
  if (isAnon) {
    // Mark the session so the CurrentUser field resolver serves these synthesized roles
    // (the shared Anonymous principal holds none in the DB). See UserInfo.IsMagicLinkAnonymous.
    sessionUser.IsMagicLinkAnonymous = true;
  }
  return sessionUser;
}

const verifyAsync = async (issuer: string, token: string): Promise<jwt.JwtPayload> =>
  new Promise((resolve, reject) => {
    const options = getValidationOptions(issuer);
    
    if (!options) {
      reject(new Error(`No validation options found for issuer ${issuer}`));
      return;
    }

    const verifyOptions: jwt.VerifyOptions = {};
    if (Array.isArray(options.audience)) {
      verifyOptions.audience = options.audience as [string, ...string[]];
    } else {
      verifyOptions.audience = options.audience;
    }

    jwt.verify(token, getSigningKeys(issuer), verifyOptions, (err, jwt) => {
      if (jwt && typeof jwt !== 'string' && !err) {
        const payload = jwt.payload ?? jwt;

        // Use provider to extract user info for logging
        const userInfo = extractUserInfoFromPayload(payload);
        console.log(`Valid token: ${userInfo.fullName || 'Unknown'} (${userInfo.email || userInfo.preferredUsername || 'Unknown'})`);
        resolve(payload);
      } else {
        console.warn('Invalid token');
        reject(err);
      }
    });
  });

/**
 * Request context for API key usage logging.
 */
export interface RequestContext {
  /** The API endpoint path (e.g., '/graphql', '/mcp') */
  endpoint: string;
  /** HTTP method (e.g., 'POST', 'GET') */
  method: string;
  /** GraphQL operation name if available */
  operationName?: string;
  /** Client IP address */
  ipAddress?: string;
  /** User-Agent header */
  userAgent?: string;
}

export const getUserPayload = async (
  bearerToken: string,
  sessionId = 'default',
  dataSources: DataSourceInfo[],
  requestDomain?: string,
  systemApiKey?: string,
  userApiKey?: string,
  requestContext?: RequestContext
): Promise<UserPayload> => {
  try {
    const readOnlyDataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
    const readWriteDataSource = GetReadWriteDataSource(dataSources);

    // Check for user API key first (X-API-Key header with mj_sk_* format)
    // This authenticates as the specific user who owns the API key
    if (userApiKey && userApiKey !== String(undefined)) {
      // Use system user as context for validation operations
      const systemUser = await getSystemUser(readOnlyDataSource);
      const apiKeyEngine = GetAPIKeyEngine();
      const validationResult = await apiKeyEngine.ValidateAPIKey(
        {
          RawKey: userApiKey,
          ApplicationName: 'MJAPI', // Check if key is bound to this application
          Endpoint: requestContext?.endpoint ?? '/api',
          Method: requestContext?.method ?? 'POST',
          Operation: requestContext?.operationName ?? null,
          StatusCode: 200, // Auth succeeded if we get here
          ResponseTimeMs: undefined, // Not available at auth time
          IPAddress: requestContext?.ipAddress ?? null,
          UserAgent: requestContext?.userAgent ?? null,
        },
        systemUser
      );

      if (validationResult.IsValid && validationResult.User) {
        // Get the user from UserCache to ensure UserRoles is properly populated
        // The validationResult.User from APIKeyEngine doesn't include UserRoles
        const cachedUser = UserCache.Instance.Users.find(
          u => UUIDsEqual(u.ID, validationResult.User.ID)
        );

        // Use cached user if available, otherwise fall back to the validation result
        const userRecord = cachedUser || validationResult.User;

        return {
          userRecord,
          email: userRecord.Email,
          sessionId,
          apiKeyId: validationResult.APIKeyId,
          apiKeyHash: validationResult.APIKeyHash,
        };
      }

      // MJ API key validation failed - use generic message to prevent enumeration
      throw new AuthenticationError('Invalid API key');
    }

    // Check for system API key (x-mj-api-key header)
    // This authenticates as the system user for system-level operations
    if (systemApiKey && systemApiKey != String(undefined)) {
      if (systemApiKey === apiKey) {
        const systemUser = await getSystemUser(readOnlyDataSource);
        return {
          userRecord: systemUser,
          email: systemUser.Email,
          sessionId,
          isSystemUser: true,
          apiKey,
        };
      }
      throw new AuthenticationError('Invalid system API key');
    }

    const token = bearerToken.replace('Bearer ', '');

    if (!token) {
      console.warn('No token to validate');
      throw new AuthenticationError('Missing token');
    }

    const payload = jwt.decode(token);
    if (!payload || typeof payload === 'string') {
      throw new AuthenticationError('Invalid token payload');
    }

    const expiryDate = new Date((payload.exp ?? 0) * 1000);
    if (expiryDate.getTime() <= Date.now()) {
      // Log at warn level since token expiration is expected behavior (long-lived browser sessions)
      console.warn(`Token expired at ${expiryDate.toISOString()} - client should refresh`);
      throw new TokenExpiredError(expiryDate);
    }

    if (!authCache.has(token)) {
      const issuer = payload.iss;
      if (!issuer) {
        console.warn('No issuer claim on token');
        throw new AuthenticationError('Missing issuer claim on token');
      }

      // Verify issuer is supported
      const factory = AuthProviderFactory.Instance;
      if (!factory.getByIssuer(issuer)) {
        console.warn(`Unsupported issuer: ${issuer}`);
        throw new AuthenticationError(`Unsupported authentication provider: ${issuer}`);
      }

      await verifyAsync(issuer, token);
      authCache.set(token, true);
    }

    // Use provider to extract user information
    const userInfo = extractUserInfoFromPayload(payload);
    const email = userInfo.email ? ((userEmailMap ?? {})[userInfo.email] ?? userInfo.email) : userInfo.preferredUsername;
    
    const userRecord = await verifyUserRecord(
      email, 
      userInfo.firstName, 
      userInfo.lastName, 
      requestDomain, 
      readWriteDataSource
    );

    if (!userRecord) {
      console.error(`User ${email} not found`);
      throw new AuthorizationError();
    } else if (!userRecord.IsActive) {
      console.error(`User ${email} found but inactive`);
      throw new AuthorizationError();
    }

    // Claims authorizer: for anonymous magic-link sessions, replace the role-less
    // Anonymous principal with an in-memory UserInfo carrying the claimed role(s), so
    // the session enforces exactly the link's granted scope (no DB accretion). No-op
    // for everything else.
    const sessionUser = buildMagicLinkSessionUser(userRecord, payload);

    // Session-established audit — once per issued token (deduped), fire-and-forget so
    // it never adds latency to the request. The dedup mark is set synchronously here.
    if (markSessionAuditSeen(sessionAuditKey('sess', payload))) {
      void writeSessionAudit({
        user: sessionUser,
        auditTypeName: SESSION_AUDIT_TYPE,
        status: 'Success',
        payload,
        requestContext,
        requestDomain,
        description: `Session established via ${payload.iss ?? 'unknown provider'}`,
      });
    }

    return { userRecord: sessionUser, email: sessionUser.Email, sessionId };
  } catch (error) {
    console.error(error);
    if (error instanceof TokenExpiredError) {
      throw error; // expected for long-lived sessions; not a failure worth auditing
    }
    // Best-effort failure audit (token scanning / brute-force signal). Never blocks auth.
    void auditLoginFailure(bearerToken, error, requestContext, requestDomain);
    throw new AuthenticationError('Unable to authenticate user');
  }
};

/**
 * Extracts auth headers and builds a RequestContext from an Express request.
 * Shared by both the unified auth middleware and the WebSocket context.
 */
function extractAuthInputs(req: IncomingMessage): {
  bearerToken: string;
  sessionId: string;
  requestDomain: string | undefined;
  systemApiKey: string;
  userApiKey: string;
  requestContext: RequestContext;
} {
  const sessionIdRaw = req.headers['x-session-id'];
  const requestDomain = url.parse(req.headers.origin || '');
  const sessionId = sessionIdRaw ? sessionIdRaw.toString() : '';
  const bearerToken = req.headers.authorization ?? '';
  const systemApiKey = String(req.headers['x-mj-api-key']);
  const userApiKey = String(req.headers['x-api-key']);
  const expressReq = req as e.Request;

  const requestContext: RequestContext = {
    endpoint: expressReq.path || expressReq.url || '/api',
    method: expressReq.method || 'POST',
    operationName: undefined,
    ipAddress: expressReq.ip || expressReq.socket?.remoteAddress || undefined,
    userAgent: req.headers['user-agent'] as string | undefined,
  };

  return {
    bearerToken,
    sessionId,
    requestDomain: requestDomain?.hostname ?? undefined,
    systemApiKey,
    userApiKey,
    requestContext,
  };
}

/**
 * Creates a single Express middleware that authenticates ALL routes.
 *
 * On success, attaches `req.userPayload` (UserPayload) and `req['mjUser']` (UserInfo)
 * so downstream middleware and route handlers can read the authenticated user without
 * re-authenticating. On failure, returns 401.
 *
 * Register OAuth callback routes BEFORE this middleware so they remain unauthenticated.
 */
export function createUnifiedAuthMiddleware(
  dataSources: DataSourceInfo[]
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Skip CORS preflight requests — OPTIONS requests never carry credentials
    // and must pass through to the downstream cors() middleware to get proper headers.
    if (req.method === 'OPTIONS') {
      next();
      return;
    }

    try {
      const { bearerToken, sessionId, requestDomain, systemApiKey, userApiKey, requestContext } =
        extractAuthInputs(req);

      const userPayload = await getUserPayload(
        bearerToken,
        sessionId,
        dataSources,
        requestDomain,
        systemApiKey,
        userApiKey,
        requestContext
      );

      if (!userPayload) {
        res.status(401).json({ error: 'Invalid token' });
        return;
      }

      // Attach to request for downstream consumers
      req.userPayload = userPayload;
      // Standard Express convention and MJ REST convention
      (req as unknown as Record<string, unknown>)['user'] = userPayload;
      (req as unknown as Record<string, unknown>)['mjUser'] = userPayload.userRecord;

      next();
    } catch (error) {
      if (error instanceof TokenExpiredError) {
        res.status(401).json({
          errors: [{
            message: 'Token expired',
            extensions: { code: 'JWT_EXPIRED' }
          }]
        });
        return;
      }
      console.error('Auth error:', error);
      res.status(401).json({ error: 'Authentication failed' });
    }
  };
}

/**
 * Creates the GraphQL context from an already-authenticated request.
 *
 * The unified auth middleware has already resolved `req.userPayload` before this runs.
 * This function reads the payload and creates per-request database providers.
 */
export const contextFunction =
  ({ setupComplete$, dataSource, dataSources }: { setupComplete$: Subject<unknown>; dataSource: sql.ConnectionPool, dataSources: DataSourceInfo[] }) =>
  async ({ req }: { req: IncomingMessage }) => {
    await firstValueFrom(setupComplete$); // wait for setup to complete before processing the request

    // Log the GraphQL operation for debugging (skip introspection noise)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reqAny = req as any;
    const operationName: string | undefined = reqAny.body?.operationName;
    if (operationName !== 'IntrospectionQuery') {
      console.dir(buildBoundaryLogPayload(operationName), { depth: null, breakLength: 200 });
    }

    // Auth already happened in the unified auth middleware — just read the result
    const expressReq = req as e.Request;
    const userPayload = expressReq.userPayload;
    if (!userPayload) {
      throw new AuthenticationError('No user payload — auth middleware may not have run');
    }

    if (Metadata.Provider.Entities.length === 0 ) { // global-provider-ok: diagnostic warning about global provider state
      console.warn('WARNING: No entities found in global/shared metadata, this can often be due to the use of **global** Metadata/RunView/DB Providers in a multi-user environment. Check your code to make sure you are using the providers passed to you in AppContext by MJServer and not calling new Metadata() new RunView() new RunQuery() and similar patterns as those are unstable at times in multi-user server environments!!!'); // global-provider-ok: diagnostic warning text mentions the anti-pattern by name
    }

    // Create per-request provider instance based on database type
    const providers = await createPerRequestProviders(dataSource, dataSources);

    return {
      dataSource,
      dataSources,
      userPayload,
      providers,
    };
  };

/**
 * Creates per-request DatabaseProviderBase instances for the GraphQL context.
 * Handles both SQL Server and PostgreSQL paths.
 */
async function createPerRequestProviders(
  dataSource: sql.ConnectionPool,
  dataSources: DataSourceInfo[]
): Promise<Array<{ provider: DatabaseProviderBase; type: 'Read-Write' | 'Read-Only' }>> {
  const isPostgres = resolveDbPlatformFromEnv() === 'postgresql';

  let p: DatabaseProviderBase;
  if (isPostgres) {
    p = await createPostgresProvider();
  } else {
    const config = new SQLServerProviderConfigData(dataSource, mj_core_schema, 0, undefined, undefined, false);
    const sqlProvider = new SQLServerDataProvider();
    await sqlProvider.Config(config);
    p = sqlProvider as unknown as DatabaseProviderBase;
  }

  const providers: Array<{ provider: DatabaseProviderBase; type: 'Read-Write' | 'Read-Only' }> = [
    { provider: p, type: 'Read-Write' }
  ];

  if (!isPostgres) {
    const rp = await tryCreateReadOnlyProvider(dataSources);
    if (rp) {
      providers.push({ provider: rp, type: 'Read-Only' });
    }
  }

  return providers;
}

/**
 * Creates a PostgreSQL per-request provider, sharing the connection pool
 * from the primary provider to avoid pool exhaustion.
 */
async function createPostgresProvider(): Promise<DatabaseProviderBase> {
  const { PostgreSQLDataProvider, PostgreSQLProviderConfigData } = await import('@memberjunction/postgresql-dataprovider');
  const pgHost = process.env.PG_HOST || process.env.DB_HOST || 'localhost';
  const pgPort = parseInt(process.env.PG_PORT || process.env.DB_PORT || '5432', 10);
  const pgUser = process.env.PG_USERNAME || process.env.DB_USERNAME || 'postgres';
  const pgPass = process.env.PG_PASSWORD || process.env.DB_PASSWORD || '';
  const pgDatabase = process.env.PG_DATABASE || process.env.DB_DATABASE || '';

  const pgProvider = new PostgreSQLDataProvider();
  const pgConfig = new PostgreSQLProviderConfigData(
    { Host: pgHost, Port: pgPort, Database: pgDatabase, User: pgUser, Password: pgPass },
    mj_core_schema,
    0,
    undefined,
    undefined,
    false, // use existing metadata from global provider
  );

  // Share the connection pool from the primary provider to avoid pool exhaustion
  const primaryProvider = Metadata.Provider as unknown as { DatabaseConnection?: import('pg').Pool }; // global-provider-ok: bootstrap (per-connection PG pool sharing)
  if (primaryProvider?.DatabaseConnection) {
    await pgProvider.ConfigWithSharedPool(pgConfig, primaryProvider.DatabaseConnection);
  } else {
    await pgProvider.Config(pgConfig);
  }

  return pgProvider;
}

/**
 * Attempts to create a read-only SQL Server provider.
 * Returns null if no read-only data source is available.
 */
async function tryCreateReadOnlyProvider(
  dataSources: DataSourceInfo[]
): Promise<DatabaseProviderBase | null> {
  try {
    const readOnlyDataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: false });
    if (readOnlyDataSource) {
      const roProvider = new SQLServerDataProvider();
      const rConfig = new SQLServerProviderConfigData(readOnlyDataSource, mj_core_schema, 0, undefined, undefined, false);
      await roProvider.Config(rConfig);
      return roProvider as unknown as DatabaseProviderBase;
    }
  }
  catch (_err) {
    // no read only data source available, this is OK
  }
  return null;
}