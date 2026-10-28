/**
 * Which User record a verified login runs as, decided by the identity provider's account ID before
 * any email match.
 *
 * A login used to reach its User record by email alone, so a `USER_EMAIL_MAP` entry, an email change
 * at the provider, or a second record carrying the same address sent it to whichever record matched.
 * `MJ: User External Identities` binds a User to a provider account by the token's issuer and
 * subject. A bound login always resolves to its bound record. An unbound login falls back to email
 * once and is bound on that match, so every existing user is bound on their next sign-in.
 *
 * The decision rules live in {@link DecideBoundLogin} and {@link DecideEmailMatchBinding}, which are
 * pure so they can be tested without a database; {@link ResolveLoginUser} wires them to the caches.
 */
import { LogError, LogStatusEx, Metadata, UserInfo } from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';
import type { MJUserExternalIdentityEntity } from '@memberjunction/core-entities';
import sql from 'mssql';
import { VerifyUserRecord } from './index.js';
import { UserExternalIdentityEngine } from './UserExternalIdentityEngine.js';
import { EmailsMatch, type LoginEmailResolution } from './loginEmailResolution.js';

/** The provider account a verified token belongs to. */
export interface LoginIdentity {
  /** The token's `iss` claim. */
  Issuer: string;
  /** The provider's stable account ID (see `IAuthProvider.ExtractSubject`). */
  Subject: string;
  /** The configured provider's name, stored for operators; matching never uses it. */
  ProviderName?: string;
}

/** The fields of a binding the decision rules read. */
export type LoginBinding = Pick<MJUserExternalIdentityEntity, 'ID' | 'UserID' | 'Issuer' | 'Subject'>;

/** Builds the identity for a token, or undefined when it has no issuer or no stable subject. */
export function BuildLoginIdentity(issuer: string | undefined, subject: string | undefined, providerName?: string): LoginIdentity | undefined {
  if (!issuer || !subject) {
    return undefined;
  }
  return { Issuer: issuer, Subject: subject, ProviderName: providerName };
}

/** What to do with an email-matched user, given the bindings that user already holds. */
export type EmailMatchBindingDecision =
  /** Save a binding for this identity: the user has none from this issuer. */
  | { Kind: 'bind' }
  /** Run the login without a binding: there is no identity, or the email was remapped. */
  | { Kind: 'skip'; Reason: 'no-identity' | 'remapped' }
  /** Refuse the login: the user is already bound to a different account at this issuer. */
  | { Kind: 'refuse'; Reason: 'issuer-already-bound'; ExistingBindingID: string };

/**
 * Decides whether an email match may be bound. A remapped login is never bound, so a
 * `USER_EMAIL_MAP` entry cannot permanently attach one person's account to another's record. A user
 * already bound to a different account at the same issuer is refused: one issuer never gives one
 * person two subjects, so the login belongs to someone else who carries the same email (a recreated
 * or reassigned mailbox). A binding from a new issuer is allowed, which is the multi-provider case.
 */
export function DecideEmailMatchBinding(
  identity: LoginIdentity | undefined,
  remapped: boolean,
  userBindings: LoginBinding[]
): EmailMatchBindingDecision {
  if (!identity) {
    return { Kind: 'skip', Reason: 'no-identity' };
  }
  if (remapped) {
    return { Kind: 'skip', Reason: 'remapped' };
  }
  const sameIssuer = userBindings.find((b) => b.Issuer === identity.Issuer);
  if (sameIssuer) {
    return { Kind: 'refuse', Reason: 'issuer-already-bound', ExistingBindingID: sameIssuer.ID };
  }
  return { Kind: 'bind' };
}

/** Whether a bound user's record email no longer matches the email the token carries. */
export function HasEmailDrift(user: UserInfo, tokenEmail: string | undefined): boolean {
  return !!tokenEmail && !!user.Email && !EmailsMatch(user.Email, tokenEmail);
}

/** The inputs {@link ResolveLoginUser} needs from the request. */
export interface ResolveLoginUserArgs {
  Identity: LoginIdentity | undefined;
  LoginEmail: LoginEmailResolution;
  FirstName?: string;
  LastName?: string;
  RequestDomain?: string;
  DataSource?: sql.ConnectionPool;
}

/** The User a login runs as, and how it was found. */
export interface ResolvedLoginUser {
  User: UserInfo | undefined;
  /** How the user was found: by binding, by email (bound now or not), or refused. */
  Source: 'binding' | 'email' | 'refused' | 'not-found';
  /** The binding that resolved the login, or the one just saved; undefined otherwise. */
  BindingID?: string;
  /** True when a bound user's record email differs from the token's email. */
  EmailDrift: boolean;
}

/**
 * Resolves the User a verified login runs as. Order:
 * 1. A `USER_EMAIL_MAP` remap wins over any binding and is never bound: the map is an operator's
 *    explicit instruction (and is logged at startup and per token).
 * 2. A binding for (issuer, subject) resolves to its User, whatever email the token carries.
 * 3. Otherwise the email match runs, and its result is bound per {@link DecideEmailMatchBinding}.
 */
export async function ResolveLoginUser(args: ResolveLoginUserArgs): Promise<ResolvedLoginUser> {
  const bindingsReady = await ensureBindingsLoaded();
  const identity = bindingsReady ? args.Identity : undefined;

  if (identity && !args.LoginEmail.Remapped) {
    const bound = await resolveFromBinding(identity, args.LoginEmail.TokenEmail);
    if (bound) {
      return bound;
    }
  }

  const user = await VerifyUserRecord(args.LoginEmail.LookupEmail, args.FirstName, args.LastName, args.RequestDomain, args.DataSource);
  if (!user) {
    return { User: undefined, Source: 'not-found', EmailDrift: false };
  }
  return bindEmailMatch(user, identity, args.LoginEmail.Remapped);
}

/** Looks the identity up in the bindings; undefined when it has none. */
async function resolveFromBinding(identity: LoginIdentity, tokenEmail: string | undefined): Promise<ResolvedLoginUser | undefined> {
  const binding = UserExternalIdentityEngine.Instance.FindBinding(identity.Issuer, identity.Subject);
  if (!binding) {
    return undefined;
  }
  const user = await UserCache.Instance.FindUser({ ID: binding.UserID });
  if (!user) {
    // The foreign key keeps a bound User from being deleted, so this is a cache that has not seen
    // the row yet. Refuse rather than fall back to email: the account is bound, and email is the
    // weaker proof.
    LogError(`[Auth] Login for ${identity.Issuer} subject ${identity.Subject} is bound to User ${binding.UserID}, which could not be loaded. Refusing the login.`);
    return { User: undefined, Source: 'refused', BindingID: binding.ID, EmailDrift: false };
  }
  return { User: user, Source: 'binding', BindingID: binding.ID, EmailDrift: HasEmailDrift(user, tokenEmail) };
}

/** Applies {@link DecideEmailMatchBinding} to an email-matched user. */
async function bindEmailMatch(user: UserInfo, identity: LoginIdentity | undefined, remapped: boolean): Promise<ResolvedLoginUser> {
  const userBindings = identity ? UserExternalIdentityEngine.Instance.BindingsForUser(user.ID) : [];
  const decision = DecideEmailMatchBinding(identity, remapped, userBindings);

  if (decision.Kind === 'refuse' && identity) {
    LogError(
      `[Auth] Refusing login: ${identity.Issuer} subject ${identity.Subject} matched User ${user.ID} (${user.Email}) by email, ` +
        `but that user is already bound to a different account at this issuer (binding ${decision.ExistingBindingID}). ` +
        `If this is the same person with a new account, delete that row from MJ: User External Identities and sign in again.`
    );
    return { User: undefined, Source: 'refused', EmailDrift: false };
  }
  if (decision.Kind === 'bind' && identity) {
    const bindingID = await UserExternalIdentityEngine.Instance.CreateBinding(user.ID, identity, UserCache.Instance.GetSystemUser());
    return { User: user, Source: 'email', BindingID: bindingID, EmailDrift: false };
  }
  return { User: user, Source: 'email', EmailDrift: false };
}

/**
 * Loads the binding cache on first use. When it cannot load (a database not yet migrated to the
 * table), logins fall back to email-only matching, which is how every login worked before bindings
 * existed. Logged once.
 */
async function ensureBindingsLoaded(): Promise<boolean> {
  const engine = UserExternalIdentityEngine.Instance;
  if (engine.Loaded) {
    return true;
  }
  try {
    // Pre-context auth path: per-request providers do not exist yet, so the global is the only one.
    await engine.Config(false, UserCache.Instance.GetSystemUser(), Metadata.Provider); // global-provider-ok: pre-context auth path
    return engine.Loaded;
  } catch (e) {
    if (!bindingLoadFailureLogged) {
      bindingLoadFailureLogged = true;
      LogError(`[Auth] Could not load MJ: User External Identities; logins are matched by email only until it loads: ${e instanceof Error ? e.message : String(e)}`);
    }
    return false;
  }
}
let bindingLoadFailureLogged = false;

/** Writes `LastLoginAt` for a binding, at most once a day. Fire-and-forget; failures are logged. */
export function RecordBindingLogin(bindingID: string | undefined): void {
  if (!bindingID) {
    return;
  }
  void UserExternalIdentityEngine.Instance.TouchLastLogin(bindingID, UserCache.Instance.GetSystemUser()).catch((e) =>
    LogStatusEx({ message: `[Auth] Could not record login time for binding ${bindingID}: ${e instanceof Error ? e.message : String(e)}`, verboseOnly: true })
  );
}
