import { JwtHeader, SigningKeyCallback } from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { auth0Domain, auth0WebClientID, configInfo, tenantID, webClientID } from '../config.js';
import { UserCache } from '@memberjunction/sqlserver-dataprovider';
import { DataSource } from 'typeorm';
import { Metadata, RoleInfo, UserInfo } from '@memberjunction/core';
import { NewUserBase } from './newUsers.js';
import { MJGlobal } from '@memberjunction/global';
import { UserEntity, UserEntityType } from '@memberjunction/core-entities';

export { TokenExpiredError } from './tokenExpiredError.js';

const missingAzureConfig = !tenantID || !webClientID;
const missingAuth0Config = !auth0Domain || !auth0WebClientID;

class MissingAuthError extends Error {
  constructor() {
    super('Could not find authentication configuration for either MSAL or Auth0 in the server environment variables.');
    this.name = 'MissingAuthError';
  }
}

const issuers = {
  azure: `https://login.microsoftonline.com/${tenantID}/v2.0`,
  auth0: `https://${auth0Domain}/`,
};

export const validationOptions = {
  [issuers.auth0]: {
    audience: auth0WebClientID,
    jwksUri: `https://${auth0Domain}/.well-known/jwks.json`,
  },
  [issuers.azure]: {
    audience: webClientID,
    jwksUri: `https://login.microsoftonline.com/${tenantID}/discovery/v2.0/keys`,
  },
};

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
  // what about an array of roles???
}

export const getSigningKeys = (issuer: string) => (header: JwtHeader, cb: SigningKeyCallback) => {
  if (!validationOptions[issuer]) {
    throw new Error(`No validation options found for issuer ${issuer}`);
  }

  const jwksUri = validationOptions[issuer].jwksUri;
  if (missingAuth0Config && missingAzureConfig) {
    throw new MissingAuthError();
  }
  if (missingAuth0Config) {
    console.warn('Auth0 configuration not found in environment variables');
  }
  if (missingAzureConfig) {
    console.warn('MSAL configuration not found in environment variables');
  }

  jwksClient({ jwksUri })
    .getSigningKey(header.kid)
    .then((key) => {
      cb(null, 'publicKey' in key ? key.publicKey : key.rsaPublicKey);
    })
    .catch((err) => console.error(err));
};

export const verifyUserRecord = async (
  email?: string,
  firstName?: string,
  lastName?: string,
  requestDomain?: string,
  dataSource?: DataSource,
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
        const newUser: UserEntity | null = await newUserCreator.createNewUser(firstName, lastName, email);
        if (newUser) {
          // new user worked! we already have the stuff we need for the cache, so no need to go to the DB now, just create a new UserInfo object and use the return value from the createNewUser method
          // to init it, including passing in the role list for the user.
          const md: Metadata = new Metadata();

          const initData: UserEntityType & {UserRoles: {UserID: string, RoleName: string, RoleID: string}[] } = newUser.GetAll();
          
          initData.UserRoles = configInfo.userHandling.newUserRoles.map((role) => {
            const roleInfo: RoleInfo | undefined = md.Roles.find((r) => r.Name === role);
            const roleID: string = roleInfo ? roleInfo.ID : "";
            
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
        `   UserCache updated in ${elapsed}ms, total elapsed time of ${finalElapsed}ms including delay of ${delay}ms (if needed). Attempting to find the user again via recursive call to verifyUserRecord()`
      );
      return verifyUserRecord(email, firstName, lastName, requestDomain, dataSource, false); // try one more time but do not update cache next time if not found
    }
  }

  return user;
};
