import { JwtHeader, SigningKeyCallback, JwtPayload } from 'jsonwebtoken';
import { configInfo } from '../config.js';
import { UserCache } from '@memberjunction/sqlserver-dataprovider';
import sql from 'mssql';
import { Metadata, RoleInfo, UserInfo } from '@memberjunction/core';
import { NewUserBase } from './newUsers.js';
import { MJGlobal } from '@memberjunction/global';
import { MJUserEntity, MJUserEntityType } from '@memberjunction/core-entities';
import { AuthProviderFactory } from './AuthProviderFactory.js';
import { initializeAuthProviders } from './initializeProviders.js';

export { TokenExpiredError } from './tokenExpiredError.js';
export { IAuthProvider } from './IAuthProvider.js';
export { AuthProviderFactory } from './AuthProviderFactory.js';
export * from './APIKeyScopeAuth.js';

// This is a hard-coded forever constant due to internal migrations

class MissingAuthError extends Error {
  constructor() {
    super('No authentication providers configured. Please configure at least one auth provider in mj.config.cjs');
    this.name = 'MissingAuthError';
  }
}

const refreshUserCache = async (dataSource?: sql.ConnectionPool) => {
  const startTime: number = Date.now();
  await UserCache.Instance.Refresh(dataSource);
  const endTime: number = Date.now();
  const elapsed: number = endTime - startTime;

  // if elapsed time is less than the delay setting, wait for the additional time to achieve the full delay
  // the below also makes sure we never go more than a 30 second total delay
  const delay = configInfo.userHandling.updateCacheWhenNotFoundDelay
    ? configInfo.userHandling.updateCacheWhenNotFoundDelay < 30000
      ? configInfo.userHandling.updateCacheWhenNotFoundDelay
      : 30000
    : 0;
  if (elapsed < delay) await new Promise((resolve) => setTimeout(resolve, delay - elapsed));

  const finalTime: number = Date.now();
  const finalElapsed: number = finalTime - startTime;

  console.log(
    `   UserCache updated in ${elapsed}ms, total elapsed time of ${finalElapsed}ms including delay of ${delay}ms (if needed). Attempting to find the user again via recursive call`
  );
};

/**
 * Gets validation options for a specific issuer
 * This maintains backward compatibility with the old structure
 */
export const getValidationOptions = (issuer: string): { audience: string; jwksUri: string } | undefined => {
  const factory = AuthProviderFactory.getInstance();
  const provider = factory.getByIssuer(issuer);
  
  if (!provider) {
    return undefined;
  }

  return {
    audience: provider.audience,
    jwksUri: provider.jwksUri
  };
};

/**
 * Backward compatible validationOptions object
 * @deprecated Use getValidationOptions() or AuthProviderRegistry instead
 */
export const validationOptions: Record<string, { audience: string; jwksUri: string }> = new Proxy({}, {
  get: (target, prop: string) => {
    return getValidationOptions(prop);
  },
  has: (target, prop: string) => {
    return getValidationOptions(prop) !== undefined;
  },
  ownKeys: () => {
    const factory = AuthProviderFactory.getInstance();
    return factory.getAllProviders().map(p => p.issuer);
  }
});

export class UserPayload {
  aio?: string;
  aud?: string;
  exp?: number;
  iat?: number;
  iss?: string;
  name?: string;
  nbf?: number;
  nonce?: string;
  oid?: string;
  preferred_username?: string;
  rh?: string;
  sub?: string;
  tid?: string;
  uti?: string;
  ver?: string;
  email?: string;
  given_name?: string;
  family_name?: string;
  [key: string]: unknown; // Allow additional claims
}

/**
 * Gets signing keys for JWT validation
 */
export const getSigningKeys = (issuer: string) => (header: JwtHeader, cb: SigningKeyCallback) => {
  const factory = AuthProviderFactory.getInstance();
  
  // Initialize providers if not already done
  if (!factory.hasProviders()) {
    initializeAuthProviders();
  }

  const provider = factory.getByIssuer(issuer);
  
  if (!provider) {
    // Check if we have any providers at all
    if (!factory.hasProviders()) {
      throw new MissingAuthError();
    }
    throw new Error(`No authentication provider found for issuer: ${issuer}`);
  }

  provider.getSigningKey(header, cb);
};

/**
 * Extracts user information from JWT payload using the appropriate provider
 */
export const extractUserInfoFromPayload = (payload: JwtPayload): {
  email?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  preferredUsername?: string;
} => {
  const factory = AuthProviderFactory.getInstance();
  const issuer = payload.iss;
  
  if (!issuer) {
    // Fallback to default extraction
    const preferredUsername = payload.preferred_username as string | undefined;
    return {
      email: payload.email as string | undefined || preferredUsername,
      firstName: payload.given_name as string | undefined,
      lastName: payload.family_name as string | undefined,
      fullName: payload.name as string | undefined,
      preferredUsername
    };
  }

  const provider = factory.getByIssuer(issuer);
  
  if (!provider) {
    // Fallback to default extraction
    const fullName = payload.name as string | undefined;
    const preferredUsername = payload.preferred_username as string | undefined;
    return {
      email: payload.email as string | undefined || preferredUsername,
      firstName: payload.given_name as string | undefined || fullName?.split(' ')[0],
      lastName: payload.family_name as string | undefined || fullName?.split(' ')[1] || fullName?.split(' ')[0],
      fullName,
      preferredUsername
    };
  }

  return provider.extractUserInfo(payload);
};

export const getSystemUser = async (dataSource?: sql.ConnectionPool, attemptCacheUpdateIfNeeded: boolean = true): Promise<UserInfo> => {
  const systemUser = UserCache.Instance.GetSystemUser();
  if (!systemUser) {
    if (dataSource && attemptCacheUpdateIfNeeded) {
      console.warn(`System user not found in cache. Updating cache in attempt to find the user...`);

      await refreshUserCache(dataSource);
      return getSystemUser(dataSource, false); // try one more time but do not update cache next time if not found
    }
    throw new Error(`System user ID '${UserCache.Instance.SYSTEM_USER_ID}' not found in database`);
  }
  return systemUser;
};

export const verifyUserRecord = async (
  email?: string,
  firstName?: string,
  lastName?: string,
  requestDomain?: string,
  dataSource?: sql.ConnectionPool,
  attemptCacheUpdateIfNeeded: boolean = true
): Promise<UserInfo | undefined> => {
  if (!email) return undefined;

  let user = UserCache.Instance.Users.find((u) => {
    if (!u.Email || u.Email.trim() === '') {
      // this condition should never occur. If it doesn throw a console error including the user id
      // DB requires non-null but this is just an extra check and we could in theory have a blank string in the DB
      console.error(`SYSTEM METADATA ISSUE: User ${u.ID} has no email address`);
      return false;
    } else return u.Email.toLowerCase().trim() === email.toLowerCase().trim();
  });

  if (!user) {
    if (
      configInfo.userHandling.autoCreateNewUsers &&
      firstName &&
      lastName &&
      (requestDomain || configInfo.userHandling.newUserLimitedToAuthorizedDomains === false)
    ) {
      // check to see if the domain that we have a request coming in from matches one of the domains in the autoCreateNewUsersDomains setting
      let passesDomainCheck: boolean =
        configInfo.userHandling.newUserLimitedToAuthorizedDomains ===
        false; /*in this first condition, we are set up to NOT care about domain */
      if (!passesDomainCheck && requestDomain) {
        /*in this second condition, we check the domain against authorized domains*/
        passesDomainCheck = configInfo.userHandling.newUserAuthorizedDomains.some((pattern) => {
          // Convert wildcard domain patterns to regular expressions
          const regex = new RegExp('^' + pattern.toLowerCase().trim().replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
          return regex.test(requestDomain?.toLowerCase().trim());
        });
      }

      if (passesDomainCheck) {
        // we have a domain from the request that matches one of the domains provided by the configuration, so we will create a new user
        console.warn(`User ${email} not found in cache. Attempting to create a new user...`);
        const newUserCreator: NewUserBase = MJGlobal.Instance.ClassFactory.CreateInstance<NewUserBase>(NewUserBase); // this will create the object that handles creating the new user for us
        const newUser: MJUserEntity | null = await newUserCreator.createNewUser(firstName, lastName, email);
        if (newUser) {
          // new user worked! we already have the stuff we need for the cache, so no need to go to the DB now, just create a new UserInfo object and use the return value from the createNewUser method
          // to init it, including passing in the role list for the user.
          const md: Metadata = new Metadata();

          const initData: MJUserEntityType & { UserRoles: { UserID: string; RoleName: string; RoleID: string }[] } = newUser.GetAll();

          initData.UserRoles = configInfo.userHandling.newUserRoles.map((role) => {
            const roleInfo: RoleInfo | undefined = md.Roles.find((r) => r.Name === role);
            const roleID: string = roleInfo ? roleInfo.ID : '';

            return { UserID: initData.ID, RoleName: role, RoleID: roleID };
          });

          user = new UserInfo(Metadata.Provider, initData);
          UserCache.Instance.Users.push(user);
          console.warn(`   >>> New user ${email} created successfully!`);
        }
      } else {
        console.warn(
          `User ${email} not found in cache. Request domain '${requestDomain}' does not match any of the domains in the newUserAuthorizedDomains setting. To ignore domain, make sure you set the newUserLimitedToAuthorizedDomains setting to false. In this case we are NOT creating a new user.`
        );
      }
    }

    if (!user && configInfo.userHandling.updateCacheWhenNotFound && dataSource && attemptCacheUpdateIfNeeded) {
      // if we get here that means in the above, if we were attempting to create a new user, it did not work, or it wasn't attempted and we have a config that asks us to auto update the cache
      console.warn(`User ${email} not found in cache. Updating cache in attempt to find the user...`);

      await refreshUserCache(dataSource);

      return verifyUserRecord(email, firstName, lastName, requestDomain, dataSource, false); // try one more time but do not update cache next time if not found
    }
  }

  return user;
};

// Initialize providers on module load
initializeAuthProviders();