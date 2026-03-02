import { IncomingMessage } from 'http';
import * as url from 'url';
import { default as jwt } from 'jsonwebtoken';
import 'reflect-metadata';
import { Subject, firstValueFrom } from 'rxjs';
import { AuthenticationError, AuthorizationError } from 'type-graphql';
import sql from 'mssql';
import { getSigningKeys, getSystemUser, getValidationOptions, verifyUserRecord, extractUserInfoFromPayload, TokenExpiredError } from './auth/index.js';
import { authCache } from './cache.js';
import { userEmailMap, apiKey, mj_core_schema } from './config.js';
import { DataSourceInfo, UserPayload } from './types.js';
import { GetReadOnlyDataSource, GetReadWriteDataSource } from './util.js';
import { v4 as uuidv4 } from 'uuid';
import e from 'express';
import { DatabaseProviderBase } from '@memberjunction/core';
import { SQLServerDataProvider, SQLServerProviderConfigData, UserCache } from '@memberjunction/sqlserver-dataprovider';
import { AuthProviderFactory } from './auth/AuthProviderFactory.js';
import { Metadata } from '@memberjunction/core';
import { GetAPIKeyEngine } from '@memberjunction/api-keys';

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
          u => u.ID === validationResult.User.ID
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
      const factory = AuthProviderFactory.getInstance();
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

    return { userRecord, email: userRecord.Email, sessionId };
  } catch (error) {
    console.error(error);
    if (error instanceof TokenExpiredError) {
      throw error;
    }
    throw new AuthenticationError('Unable to authenticate user');
  }
};

export const contextFunction =
  ({ setupComplete$, dataSource, dataSources }: { setupComplete$: Subject<unknown>; dataSource: sql.ConnectionPool, dataSources: DataSourceInfo[] }) =>
  async ({ req }: { req: IncomingMessage }) => {
    await firstValueFrom(setupComplete$); // wait for setup to complete before processing the request

    // Extract request data first (synchronous operations)
    const sessionIdRaw = req.headers['x-session-id'];
    const requestDomain = url.parse(req.headers.origin || '');
    const sessionId = sessionIdRaw ? sessionIdRaw.toString() : '';
    const bearerToken = req.headers.authorization ?? '';

    // Two types of API keys:
    // - x-mj-api-key: System API key for system-level operations (authenticates as system user)
    // - X-API-Key: User API key (mj_sk_*) for user-authenticated operations
    const systemApiKey = String(req.headers['x-mj-api-key']);
    const userApiKey = String(req.headers['x-api-key']);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reqAny = req as any;
    const operationName: string | undefined = reqAny.body?.operationName;
    if (operationName !== 'IntrospectionQuery') {
      console.log({ operationName, variables: reqAny.body?.variables || undefined });
    }

    // Build request context for API key logging
    // Note: responseTimeMs is not available at auth time, only endpoint/method/ip/ua
    const expressReq = req as e.Request;
    const requestContext: RequestContext = {
      endpoint: expressReq.path || expressReq.url || '/api',
      method: expressReq.method || 'POST',
      operationName: operationName,
      ipAddress: expressReq.ip || expressReq.socket?.remoteAddress || undefined,
      userAgent: req.headers['user-agent'] as string | undefined,
    };

    const userPayload = await getUserPayload(
      bearerToken,
      sessionId,
      dataSources,
      requestDomain?.hostname ? requestDomain.hostname : undefined,
      systemApiKey,
      userApiKey,
      requestContext
    );

    if (Metadata.Provider.Entities.length === 0 ) {
      console.warn('WARNING: No entities found in global/shared metadata, this can often be due to the use of **global** Metadata/RunView/DB Providers in a multi-user environment. Check your code to make sure you are using the providers passed to you in AppContext by MJServer and not calling new Metadata() new RunView() new RunQuery() and similar patterns as those are unstable at times in multi-user server environments!!!');
    }

    // Create per-request provider instance based on database type
    const dbType = process.env.DB_TYPE?.toLowerCase();
    const isPostgres = dbType === 'postgresql' || dbType === 'postgres' || dbType === 'pg';

    let p: DatabaseProviderBase;
    if (isPostgres) {
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

      // Share the connection pool from the primary provider to avoid pool exhaustion.
      // Each per-request provider was creating its own pool, leading to "too many clients" errors.
      const primaryProvider = Metadata.Provider as unknown as { DatabaseConnection?: import('pg').Pool };
      if (primaryProvider?.DatabaseConnection) {
        await pgProvider.ConfigWithSharedPool(pgConfig, primaryProvider.DatabaseConnection);
      } else {
        await pgProvider.Config(pgConfig);
      }
      p = pgProvider;
    } else {
      const config = new SQLServerProviderConfigData(dataSource, mj_core_schema, 0, undefined, undefined, false);
      const sqlProvider = new SQLServerDataProvider();
      await sqlProvider.Config(config);
      p = sqlProvider as unknown as DatabaseProviderBase;
    }

    let rp: DatabaseProviderBase | null = null;
    if (!isPostgres) {
      try {
        const readOnlyDataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: false });
        if (readOnlyDataSource) {
          const roProvider = new SQLServerDataProvider();
          const rConfig = new SQLServerProviderConfigData(readOnlyDataSource, mj_core_schema, 0, undefined, undefined, false);
          await roProvider.Config(rConfig);
          rp = roProvider as unknown as DatabaseProviderBase;
        }
      }
      catch (_err) {
        // no read only data source available, so rp will remain null, this is OK!
      }
    }

    const providers = [{
      provider: p,
      type: 'Read-Write' as 'Read-Write' | 'Read-Only'
    }];
    if (rp) {
      providers.push({
        provider: rp,
        type: 'Read-Only' as 'Read-Write' | 'Read-Only'
      });
    }

    const contextResult = {
      dataSource,
      dataSources,
      userPayload: userPayload,
      providers,
    };

    return contextResult;
  };