import { IncomingMessage } from 'http';
import * as url from 'url';
import { default as jwt } from 'jsonwebtoken';
import 'reflect-metadata';
import { Subject, firstValueFrom } from 'rxjs';
import { AuthenticationError, AuthorizationError } from 'type-graphql';
import sql from 'mssql';
import { getSigningKeys, getSystemUser, validationOptions, verifyUserRecord } from './auth/index.js';
import { authCache } from './cache.js';
import { userEmailMap, apiKey, mj_core_schema } from './config.js';
import { DataSourceInfo, UserPayload } from './types.js';
import { TokenExpiredError } from './auth/index.js';
import { GetReadOnlyDataSource, GetReadWriteDataSource } from './util.js';
import { v4 as uuidv4 } from 'uuid';
import e from 'express';
import { DatabaseProviderBase } from '@memberjunction/core';
import { SQLServerDataProvider, SQLServerProviderConfigData } from '@memberjunction/sqlserver-dataprovider';

const verifyAsync = async (issuer: string, options: jwt.VerifyOptions, token: string): Promise<jwt.JwtPayload> =>
  new Promise((resolve, reject) => {
    jwt.verify(token, getSigningKeys(issuer), options, (err, jwt) => {
      if (jwt && typeof jwt !== 'string' && !err) {
        const payload = jwt.payload ?? jwt;

        console.log(`Valid token: ${payload.name} (${payload.email ? payload.email : payload.preferred_username})`); // temporary fix to check preferred_username if email is not present
        resolve(payload);
      } else {
        console.warn('Invalid token');
        reject(err);
      }
    });
  });

export const getUserPayload = async (
  bearerToken: string,
  sessionId = 'default',
  dataSources: DataSourceInfo[],
  requestDomain?: string,
  requestApiKey?: string 
): Promise<UserPayload> => {
  try {
    const readOnlyDataSource = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
    const readWriteDataSource = GetReadWriteDataSource(dataSources);

    if (requestApiKey && requestApiKey != String(undefined)) {
      // use requestApiKey for auth
      if (requestApiKey === apiKey) {
        const systemUser = await getSystemUser(readOnlyDataSource);
        return {
          userRecord: systemUser,
          email: systemUser.Email,
          sessionId,
          isSystemUser: true,
          apiKey,
        };
      }
      throw new AuthenticationError('Invalid API key provided');
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
      throw new TokenExpiredError(expiryDate);
    }

    if (!authCache.has(token)) {
      const issuer = payload.iss;
      if (!issuer) {
        console.warn('No issuer claim on token');
        throw new AuthenticationError('Missing issuer claim on token');
      }

      await verifyAsync(issuer, validationOptions[issuer], token);
      authCache.set(token, true);
    }

    const email = payload?.email ? ((userEmailMap ?? {})[payload?.email] ?? payload?.email) : payload?.preferred_username; // temporary fix to check preferred_username if email is not present
    const fullName = payload?.name;
    const firstName = payload?.given_name || fullName?.split(' ')[0];
    const lastName = payload?.family_name || fullName?.split(' ')[1] || fullName?.split(' ')[0];
    const userRecord = await verifyUserRecord(email, firstName, lastName, requestDomain, readWriteDataSource);

    if (!userRecord) {
      console.error(`User ${email} not found`);
      throw new AuthorizationError();
    } else if (!userRecord.IsActive) {
      console.error(`User ${email} found but inactive`);
      throw new AuthorizationError();
    }

    return { userRecord, email, sessionId };
  } catch (e) {
    console.error(e);
    if (e instanceof TokenExpiredError) {
      throw e;
    } else return {} as UserPayload;
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
    const apiKey = String(req.headers['x-mj-api-key']);
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const operationName: string | undefined = (req as any).body?.operationName;
    if (operationName !== 'IntrospectionQuery') {
      console.log({ operationName });
    }

    const userPayload = await getUserPayload(
      bearerToken,
      sessionId,
      dataSources,
      requestDomain?.hostname ? requestDomain.hostname : undefined,
      apiKey 
    );

    // now create a new instance of SQLServerDataProvider for each request
    const config = new SQLServerProviderConfigData(dataSource, mj_core_schema, 0, undefined, undefined, false);
    const p = new SQLServerDataProvider();
    await p.Config(config);

    const contextResult = { 
      dataSource, 
      dataSources, 
      userPayload: userPayload,
      provider: p
    };
    
    return contextResult;
  };
