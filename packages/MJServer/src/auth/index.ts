import { JwtHeader, SigningKeyCallback, JwtPayload } from 'jsonwebtoken';
import { configInfo } from '../config.js';
import { UserCache } from '@memberjunction/sqlserver-dataprovider';
import sql from 'mssql';
import { Metadata, RoleInfo, UserInfo } from '@memberjunction/core';
import { NewUserBase } from './newUsers.js';
import { MJGlobal } from '@memberjunction/global';
import { MJUserEntity, MJUserEntityType } from '@memberjunction/core-entities';
import { AuthProviderFactory } from '@memberjunction/auth-providers';
import { initializeAuthProviders } from './initializeProviders.js';

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
 * Gets validation options for a specific issuer.
 * When multiple providers share the same issuer (e.g. two Auth0 apps on
 * the same domain with different audiences/client IDs), all unique audiences
 * are aggregated into an array. jwt.verify() natively accepts string | string[].
 */
export const getValidationOptions = (issuer: string): { audience: string | string[]; jwksUri: string } | undefined => {
  const factory = AuthProviderFactory.Instance;
  const providers = factory.getAllByIssuer(issuer);

  if (providers.length === 0) {
    return undefined;
  }

  // Collect unique audiences from all providers matching this issuer
  const audiences = [...new Set(providers.map(p => p.audience))];

  return {
    audience: audiences.length === 1 ? audiences[0] : audiences,
    jwksUri: providers[0].jwksUri  // Same issuer = same JWKS endpoint
  };
};

/**
 * Backward compatible validationOptions object
 * @deprecated Use getValidationOptions() or AuthProviderRegistry instead
 */
export const validationOptions: Record<string, { audience: string | string[]; jwksUri: string }> = new Proxy({}, {
  get: (target, prop: string) => {
    return getValidationOptions(prop);
  },
  has: (target, prop: string) => {
    return getValidationOptions(prop) !== undefined;
  },
  ownKeys: () => {
    const factory = AuthProviderFactory.Instance;
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
  const factory = AuthProviderFactory.Instance;
  
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
  const factory = AuthProviderFactory.Instance;
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

/**
 * Extracts the lowercased domain portion of an email address.
 *
 * @returns the domain, or an empty string when the value is not an email address (e.g. an IdP that
 *          issues a bare username). Callers MUST treat an empty result as "cannot be authorized"
 *          rather than as a wildcard.
 */
const extractEmailDomain = (email: string): string => {
  const parts = email.split('@');
  // Reject anything that isn't exactly local@domain — a value with 0 or 2+ '@' is not an address we
  // can make a trust decision about.
  if (parts.length !== 2) return '';
  return parts[1].toLowerCase().trim();
};

/**
 * Tests a domain against `userHandling.newUserAuthorizedDomains`, honoring `*` wildcards.
 *
 * Note that a pattern is matched in full, so `*.example.com` matches `mail.example.com` but NOT
 * `example.com` — list both if you need both.
 */
const isDomainAuthorized = (domain: string): boolean =>
  configInfo.userHandling.newUserAuthorizedDomains.some((pattern) => {
    // Convert wildcard domain patterns to regular expressions
    const regex = new RegExp('^' + pattern.toLowerCase().trim().replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
    return regex.test(domain);
  });

/**
 * Resolves a verified identity to an MJ `UserInfo`, optionally auto-provisioning a new user.
 *
 * @param requestDomain the hostname parsed from the request's `Origin` header. **Not used for any
 *        authorization decision** — it is spoofable on non-browser requests, and new-user domain
 *        authorization runs against the verified JWT's email domain instead. Retained for audit
 *        logging and for the recursive retry call.
 */
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
    // NOTE: `requestDomain` (parsed from the spoofable `Origin` header) is deliberately NOT part of
    // this condition. It was previously required here, which meant a non-browser client sending no
    // Origin could never auto-provision while an attacker simply forged one — it gated entry without
    // authorizing anything. Authorization happens below, against the verified identity's email domain.
    if (configInfo.userHandling.autoCreateNewUsers && firstName && lastName) {
      // SECURITY: authorize against the EMAIL DOMAIN of the cryptographically-verified identity,
      // NOT the request `Origin` header. Origin is trivially spoofable on non-browser / bearer-token
      // requests, so gating on it let a holder of any valid IdP token auto-provision an account under
      // an authorized domain by sending a forged Origin. The email comes from the verified JWT.
      const emailDomain: string = extractEmailDomain(email);
      let passesDomainCheck: boolean =
        configInfo.userHandling.newUserLimitedToAuthorizedDomains ===
        false; /*in this first condition, we are set up to NOT care about domain */
      if (!passesDomainCheck) {
        passesDomainCheck = emailDomain.length > 0 && isDomainAuthorized(emailDomain);
      }

      if (passesDomainCheck) {
        // we have a domain from the request that matches one of the domains provided by the configuration, so we will create a new user
        console.warn(`User ${email} not found in cache. Attempting to create a new user...`);
        const newUserCreator: NewUserBase = MJGlobal.Instance.ClassFactory.CreateInstance<NewUserBase>(NewUserBase); // this will create the object that handles creating the new user for us
        const newUser: MJUserEntity | null = await newUserCreator.createNewUser(firstName, lastName, email);
        if (newUser) {
          // new user worked! we already have the stuff we need for the cache, so no need to go to the DB now, just create a new UserInfo object and use the return value from the createNewUser method
          // to init it, including passing in the role list for the user.
          const md: Metadata = new Metadata(); // global-provider-ok: JWT validation + role lookup runs BEFORE AppContext.providers is built — no per-request provider yet

          const initData: MJUserEntityType & { UserRoles: { UserID: string; Role: string; RoleID: string }[] } = newUser.GetAll();

          initData.UserRoles = configInfo.userHandling.newUserRoles.map((role) => {
            const roleInfo: RoleInfo | undefined = md.Roles.find((r) => r.Name === role);
            const roleID: string = roleInfo ? roleInfo.ID : '';

            return { UserID: initData.ID, Role: role, RoleID: roleID };
          });

          user = new UserInfo(Metadata.Provider, initData); // global-provider-ok: same JWT-validation context — no per-request provider yet
          UserCache.Instance.Users.push(user);
          console.warn(`   >>> New user ${email} created successfully!`);
        }
      } else if (emailDomain.length === 0) {
        // The verified identity carries no email domain at all — typically an IdP that issues a bare
        // `preferred_username` with no `email` claim. There is nothing to match against, so the gate
        // denies rather than falling back to anything spoofable.
        console.warn(
          `User ${email} not found in cache and will NOT be auto-created: the verified identity has no email domain (no '@'), so it cannot be matched against newUserAuthorizedDomains. This usually means the identity provider issues a username rather than an email address — configure it to emit an 'email' claim, or set newUserLimitedToAuthorizedDomains to false to disable domain checking.`
        );
      } else {
        console.warn(
          `User ${email} not found in cache. Email domain '${emailDomain}' does not match any of the domains in the newUserAuthorizedDomains setting. NOTE: this check is against the EMAIL DOMAIN of the verified identity, NOT the browser Origin — if newUserAuthorizedDomains lists frontend hostnames (e.g. 'app.example.com'), replace them with email domains (e.g. 'example.com'). To ignore domain, make sure you set the newUserLimitedToAuthorizedDomains setting to false. In this case we are NOT creating a new user.`
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