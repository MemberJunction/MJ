import { IncomingMessage } from 'http';
import * as url from 'url';
import { default as jwt } from 'jsonwebtoken';
import 'reflect-metadata';
import { Subject, firstValueFrom } from 'rxjs';
import { AuthenticationError, AuthorizationError } from 'type-graphql';
import sql from 'mssql';
import { getSigningKeys, getSystemUser, getValidationOptions, verifyUserRecord, extractUserInfoFromPayload } from './auth/index.refactored.js';
import { authCache } from './cache.js';
import { userEmailMap, apiKey, mj_core_schema } from './config.js';
import { DataSourceInfo, UserPayload } from './types.js';
import { TokenExpiredError } from './auth/index.js';
import { GetReadOnlyDataSource, GetReadWriteDataSource } from './util.js';
import { v4 as uuidv4 } from 'uuid';
import e from 'express';
import { DatabaseProviderBase } from '@memberjunction/core';
import { SQLServerDataProvider, SQLServerProviderConfigData } from '@memberjunction/sqlserver-dataprovider';
import { AuthProviderRegistry } from './auth/AuthProviderRegistry.js';

const verifyAsync = async (issuer: string, token: string): Promise<jwt.JwtPayload> =>
  new Promise((resolve, reject) => {
    const options = getValidationOptions(issuer);
    
    if (!options) {
      reject(new Error(`No validation options found for issuer ${issuer}`));
      return;
    }

    jwt.verify(token, getSigningKeys(issuer), options, (err, jwt) => {
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

      // Verify issuer is supported
      const registry = AuthProviderRegistry.getInstance();
      if (!registry.getByIssuer(issuer)) {
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

// Rest of the file remains the same...