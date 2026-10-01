import { MJGlobal, UUIDsEqual } from '@memberjunction/global';

/** A secondary scope dimension's value, as on the AI layer's scoped prompt configs. */
export type SecondaryScopeValue = string | number | boolean | string[];

/**
 * The scope a notification is sent in, mirroring the polymorphic scope MJ's AI layer carries for scoped prompt
 * configs and parts: a primary record of any entity (an Application, a Company, …) plus named secondary dimensions.
 * The engine adds the recipient and the recipient's roles as primary-scope candidates itself, so a caller names only
 * what it knows, usually its application and the notice's origin.
 */
export interface NotificationScope {
  primaryScopeEntityId?: string;
  primaryScopeRecordId?: string;
  secondaryScopes?: Record<string, SecondaryScopeValue>;
}

/** The well-known secondary dimension this package sets: who or what caused the notice. */
export const NOTIFICATION_ORIGIN_SCOPE = 'origin';
export type NotificationOrigin = 'Person' | 'System' | 'Automation';

/** `Allow`, `Deny`, or null for "leave it to the next level": the Entity Field Permissions posture. */
export type ChannelAccess = 'Allow' | 'Deny' | null;

/**
 * One row of `MJ: Scoped Notification Configs`, as the resolver reads it. Structural, so the generated entity class
 * satisfies it and tests can build rows without one.
 */
export interface ScopedNotificationConfigRow {
  ID: string;
  NotificationTypeID: string;
  PrimaryScopeEntityID: string | null;
  PrimaryScopeRecordID: string | null;
  SecondaryScopes: string | null;
  InApp: ChannelAccess;
  Email: ChannelAccess;
  SMS: ChannelAccess;
  IsLocked: boolean;
  Priority: number;
  Status: string;
}

/** Who the notice is for, as the resolver needs it: the user and the roles they hold. */
export interface NotificationRecipient {
  userId: string;
  roleIds: string[];
}

/** One channel's answer from the scoped level: a value, or nothing, and whether a locked Deny stands. */
export interface ScopedChannelDecision {
  /** The most specific non-null answer, Deny winning a tie; null when no in-scope row speaks to this channel. */
  value: ChannelAccess;
  /** True when any in-scope row denies this channel with `IsLocked`: nothing below may turn it on. */
  lockedOff: boolean;
}

export interface ScopedChannelDecisions {
  inApp: ScopedChannelDecision;
  email: ScopedChannelDecision;
  sms: ScopedChannelDecision;
  /** The rows that took part, most specific first, for logging and tests. */
  rows: ScopedNotificationConfigRow[];
}

/** Statuses eligible for resolution, as for scoped prompt configs. Archived rows are excluded. */
const RESOLVABLE_STATUSES = new Set<string>(['Active', 'Provisional']);

const NO_DECISION: ScopedChannelDecision = { value: null, lockedOff: false };

/**
 * ScopedNotificationConfigResolver: the notification sibling of `ScopedPromptConfigResolver`. Given the configs for a
 * notification type, the scope the notice is sent in and the recipient, it answers each channel from the most specific
 * in-scope row down.
 *
 * In scope: a global row (no primary record, no secondary scopes); a row whose primary record is the caller's primary
 * scope, the recipient, or a role the recipient holds; and in every case a row whose secondary scopes all match the
 * notice's. Specificity is the primitive's score: secondary match +4, primary record +2, global +1, ties by `Priority`.
 * At equal specificity one `Deny` beats any `Allow`, MJ's permission rule. A `Deny` on a row with `IsLocked` is
 * absorbing for everything less specific and for the recipient's own preference.
 *
 * Pluggable through `ClassFactory`: `CreateScopedNotificationConfigResolver()` returns a host's
 * `@RegisterClass(ScopedNotificationConfigResolver)` subclass when one is registered, else this base. The base itself
 * carries no decorator, like `ScopedPromptConfigResolver`: a decorated class in this package would pull it into every
 * host's generated class manifest, and the server bootstrap does not depend on it.
 * `isInScope` and `score` are the override points.
 */
export class ScopedNotificationConfigResolver {
  /** Resolves every channel for one notice. `candidates` are the type's rows, any status. */
  public Resolve(
    candidates: readonly ScopedNotificationConfigRow[],
    notificationTypeId: string,
    scope: NotificationScope | undefined,
    recipient: NotificationRecipient,
  ): ScopedChannelDecisions {
    const inScope = candidates
      .filter((c) => UUIDsEqual(c.NotificationTypeID, notificationTypeId) && RESOLVABLE_STATUSES.has(c.Status))
      .filter((c) => this.isInScope(c, scope, recipient))
      .sort((a, b) => this.score(b) - this.score(a) || (b.Priority ?? 0) - (a.Priority ?? 0));
    return {
      inApp: this.decide(inScope, (c) => c.InApp),
      email: this.decide(inScope, (c) => c.Email),
      sms: this.decide(inScope, (c) => c.SMS),
      rows: inScope,
    };
  }

  /**
   * Is this row for the notice at hand? A primary record must be the caller's primary scope, the recipient, or one of
   * the recipient's roles; every secondary scope the row names must match the notice's.
   */
  protected isInScope(c: ScopedNotificationConfigRow, scope: NotificationScope | undefined, recipient: NotificationRecipient): boolean {
    if (c.PrimaryScopeRecordID) {
      const record = c.PrimaryScopeRecordID;
      const matchesCaller =
        !!scope?.primaryScopeRecordId &&
        record.toLowerCase() === scope.primaryScopeRecordId.toLowerCase() &&
        (!c.PrimaryScopeEntityID || !scope.primaryScopeEntityId || UUIDsEqual(c.PrimaryScopeEntityID, scope.primaryScopeEntityId));
      const matchesRecipient = UUIDsEqual(record, recipient.userId);
      const matchesRole = recipient.roleIds.some((roleId) => UUIDsEqual(record, roleId));
      if (!matchesCaller && !matchesRecipient && !matchesRole) return false;
    }
    const rowScopes = this.parseScopes(c.SecondaryScopes);
    for (const key of Object.keys(rowScopes)) {
      const sent = scope?.secondaryScopes?.[key];
      if (sent === undefined || String(sent) !== String(rowScopes[key])) return false;
    }
    return true;
  }

  /** Specificity: secondary scopes match +4, primary record +2, global +1 (the prompt resolver's scale). */
  protected score(c: ScopedNotificationConfigRow): number {
    let s = 1;
    if (c.PrimaryScopeRecordID) s += 2;
    if (Object.keys(this.parseScopes(c.SecondaryScopes)).length > 0) s += 4;
    return s;
  }

  /** The most specific non-null answer for one channel, Deny winning a tie, with the lock noted. */
  private decide(sorted: ScopedNotificationConfigRow[], pick: (c: ScopedNotificationConfigRow) => ChannelAccess): ScopedChannelDecision {
    const lockedOff = sorted.some((c) => pick(c) === 'Deny' && c.IsLocked);
    let i = 0;
    while (i < sorted.length) {
      const level = this.score(sorted[i]);
      const peers: ChannelAccess[] = [];
      while (i < sorted.length && this.score(sorted[i]) === level) peers.push(pick(sorted[i++]));
      if (peers.includes('Deny')) return { value: 'Deny', lockedOff };
      if (peers.includes('Allow')) return { value: 'Allow', lockedOff };
    }
    return lockedOff ? { value: null, lockedOff } : NO_DECISION;
  }

  private parseScopes(json: string | null | undefined): Record<string, SecondaryScopeValue> {
    if (!json) return {};
    try {
      const parsed = JSON.parse(json) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, SecondaryScopeValue>) : {};
    } catch {
      return {};
    }
  }
}

/** The resolver the engine uses: the base class, or a host's registered subclass. */
export function CreateScopedNotificationConfigResolver(): ScopedNotificationConfigResolver {
  return MJGlobal.Instance.ClassFactory.CreateInstance<ScopedNotificationConfigResolver>(ScopedNotificationConfigResolver) ?? new ScopedNotificationConfigResolver();
}

/** One channel's inputs from every level, in the order the engine resolves them. */
export interface ChannelLevels {
  /** The type's default for the channel. */
  typeDefault: boolean;
  /** What the scoped configs said. */
  scoped: ScopedChannelDecision;
  /** The recipient's own preference for the channel, when the type allows preferences and one is set. */
  userPreference: boolean | null;
}

/**
 * The channel's effective value, most specific wins: the recipient's preference, then the scoped configs, then the
 * type's default. A locked Deny from the scoped level caps the recipient's preference: it may not turn the channel on.
 */
export function ResolveChannel(levels: ChannelLevels): boolean {
  if (levels.scoped.lockedOff) return false;
  if (levels.userPreference !== null) return levels.userPreference;
  if (levels.scoped.value === 'Deny') return false;
  if (levels.scoped.value === 'Allow') return true;
  return levels.typeDefault;
}
