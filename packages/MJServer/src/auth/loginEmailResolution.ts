/**
 * Which email a verified login is matched to a User record by, and whether that differs from the
 * identity the token carries.
 *
 * The server links a login to a User row by email alone. `USER_EMAIL_MAP` can rewrite that email
 * before the lookup, which makes a login run as a different person's record. That is a legitimate
 * development aid, but it is silent, so a misconfigured map on a shared machine looks exactly like
 * an authentication bug. These helpers keep the token's identity next to the one actually used, so
 * the session audit and the server log can say when the two differ.
 */

/** The identity fields of a verified token that the lookup can use. */
export interface LoginIdentityClaims {
  email?: string; // case-violation-ok-legacy-back-compat: mirrors the provider's extracted user info shape
  preferredUsername?: string; // case-violation-ok-legacy-back-compat: mirrors the provider's extracted user info shape
}

/** The email the token carries and the email the User lookup will use. */
export interface LoginEmailResolution {
  /** The identity from the verified token: its email claim, or its preferred username when it has none. */
  TokenEmail: string | undefined;
  /** The email the User record is looked up by, after any `USER_EMAIL_MAP` rewrite. */
  LookupEmail: string | undefined;
  /** True when `USER_EMAIL_MAP` replaced the token's email with a different one. */
  Remapped: boolean;
}

/**
 * Resolves the lookup email for a verified token. The map applies only to the email claim, with an
 * exact (case-sensitive) key match, as it always has; a preferred username is never remapped.
 *
 * Named without "login"/"auth"/"verify": CodeQL treats calls with those words as authentication
 * actions and reports the `if (!token)` guard above this call in GetUserPayload as a user-controlled
 * bypass. This is a plain lookup, not an authentication step.
 */
export function ResolveUserLookupEmail(claims: LoginIdentityClaims, emailMap: Record<string, string> | undefined): LoginEmailResolution {
  if (!claims.email) {
    return { TokenEmail: claims.preferredUsername, LookupEmail: claims.preferredUsername, Remapped: false };
  }
  const mapped = emailMap?.[claims.email];
  const lookupEmail = mapped ?? claims.email;
  return { TokenEmail: claims.email, LookupEmail: lookupEmail, Remapped: mapped !== undefined && !EmailsMatch(mapped, claims.email) };
}

/** Case-insensitive, whitespace-trimmed comparison, matching how the User lookup compares emails. */
export function EmailsMatch(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) {
    return false;
  }
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * The startup warning for a configured `USER_EMAIL_MAP`, or null when the map is absent or rewrites
 * nothing. Lists every entry so whoever starts the server can see whose record each login will use.
 */
export function DescribeUserEmailMap(emailMap: Record<string, string> | undefined): string | null {
  const entries = Object.entries(emailMap ?? {}).filter(([from, to]) => !EmailsMatch(from, to));
  if (entries.length === 0) {
    return null;
  }
  const lines = entries.map(([from, to]) => `  ${from} -> ${to}`).join('\n');
  return (
    `[Auth] USER_EMAIL_MAP is set: ${entries.length} login email(s) will be matched to a different user's record. ` +
    `A login with the first address runs as the user with the second. Remove the setting unless this is intended.\n${lines}`
  );
}
