/**
 * @fileoverview In-memory cache of `MJ: User External Identities`, the bindings between a User and
 * an identity-provider account (token issuer + subject). The login path reads it on every request,
 * so lookups never touch the database; saves and deletes reach it through BaseEngine's entity
 * events, including from other servers.
 *
 * @module @memberjunction/server/auth
 */
import { BaseEngine, BaseEnginePropertyConfig, LogError, UserInfo, type IMetadataProvider } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import type { MJUserExternalIdentityEntity } from '@memberjunction/core-entities';

/** The account fields a new binding is saved with. */
export interface NewExternalIdentity {
  Issuer: string;
  Subject: string;
  ProviderName?: string;
}

/** A binding's `LastLoginAt` is rewritten only once this much time has passed since the last write. */
const LAST_LOGIN_WRITE_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Loaded lazily by the login path, as the system user, on the first authenticated request. Not a
 * startup engine: a database not yet migrated to the table must still serve email-matched logins.
 */
export class UserExternalIdentityEngine extends BaseEngine<UserExternalIdentityEngine> {
  private _bindings: MJUserExternalIdentityEntity[] = [];
  private readonly touchesInFlight = new Set<string>();

  public static get Instance(): UserExternalIdentityEngine {
    return super.getInstance<UserExternalIdentityEngine>();
  }

  /** Loads every binding. Unfiltered and unordered, so entity events update the array in place. */
  public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
    const configs: Partial<BaseEnginePropertyConfig>[] = [
      {
        PropertyName: '_bindings',
        EntityName: 'MJ: User External Identities',
        CacheLocal: true,
      },
    ];
    await this.Load(configs, provider, forceRefresh, contextUser);
  }

  /** Every binding. */
  public get Bindings(): MJUserExternalIdentityEntity[] {
    return this.GetConfigData<MJUserExternalIdentityEntity>('_bindings');
  }

  /** The binding for a provider account, matched exactly on issuer and subject. */
  public FindBinding(issuer: string, subject: string): MJUserExternalIdentityEntity | undefined {
    return this.Bindings.find((b) => b.Issuer === issuer && b.Subject === subject);
  }

  /** Every binding a User holds. */
  public BindingsForUser(userID: string): MJUserExternalIdentityEntity[] {
    return this.Bindings.filter((b) => UUIDsEqual(b.UserID, userID));
  }

  /**
   * Saves a binding and returns its ID, or undefined when the save failed. A failure does not stop
   * the login it came from (that login already matched by email); it is logged, and the next login
   * tries again. The usual cause is another server binding the same account a moment earlier, which
   * the unique (Issuer, Subject) constraint turns into a failed insert here.
   */
  public async CreateBinding(userID: string, identity: NewExternalIdentity, contextUser: UserInfo): Promise<string | undefined> {
    const binding = await this.ProviderToUse.GetEntityObject<MJUserExternalIdentityEntity>('MJ: User External Identities', contextUser);
    binding.NewRecord();
    binding.UserID = userID;
    binding.Issuer = identity.Issuer;
    binding.Subject = identity.Subject;
    binding.ProviderName = identity.ProviderName ?? null;
    binding.LastLoginAt = new Date();
    if (!(await binding.Save())) {
      LogError(`[Auth] Could not bind ${identity.Issuer} subject ${identity.Subject} to User ${userID}: ${binding.LatestResult?.CompleteMessage ?? 'unknown error'}`);
      return undefined;
    }
    return binding.ID;
  }

  /** Writes `LastLoginAt` when it is missing or more than a day old. */
  public async TouchLastLogin(bindingID: string, contextUser: UserInfo): Promise<void> {
    const binding = this.Bindings.find((b) => UUIDsEqual(b.ID, bindingID));
    if (!binding || !this.isLastLoginStale(binding) || this.touchesInFlight.has(bindingID)) {
      return;
    }
    this.touchesInFlight.add(bindingID);
    try {
      const fresh = await this.ProviderToUse.GetEntityObject<MJUserExternalIdentityEntity>('MJ: User External Identities', contextUser);
      if (!(await fresh.InnerLoad(binding.PrimaryKey))) {
        return;
      }
      fresh.LastLoginAt = new Date();
      if (!(await fresh.Save())) {
        LogError(`[Auth] Could not record login time for binding ${bindingID}: ${fresh.LatestResult?.CompleteMessage ?? 'unknown error'}`);
      }
    } finally {
      this.touchesInFlight.delete(bindingID);
    }
  }

  private isLastLoginStale(binding: MJUserExternalIdentityEntity): boolean {
    const last = binding.LastLoginAt;
    return !last || Date.now() - last.getTime() > LAST_LOGIN_WRITE_INTERVAL_MS;
  }
}
