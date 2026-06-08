import { BaseEngine, BaseEnginePropertyConfig, IMetadataProvider, UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { MJSignatureAccountEntity, MJSignatureProviderEntity } from '@memberjunction/core-entities';

/** A signature account paired with its resolved provider entity. */
export interface SignatureAccountWithProvider {
    account: MJSignatureAccountEntity;
    provider: MJSignatureProviderEntity;
}

/**
 * Metadata cache for the eSignature subsystem — providers + accounts. Extends {@link BaseEngine}
 * so saves/deletes/remote-invalidations on those entities keep the cache fresh automatically.
 *
 * This is the metadata-only layer (safe for any context that has the entities). The server-side
 * {@link SignatureEngine} wraps this and adds driver resolution, credential decryption, and the
 * envelope lifecycle operations. Mirrors the FileStorageEngineBase / FileStorageEngine split.
 */
export class SignatureEngineBase extends BaseEngine<SignatureEngineBase> {
    public static get Instance(): SignatureEngineBase {
        return super.getInstance<SignatureEngineBase>();
    }

    private _accounts: MJSignatureAccountEntity[] = [];
    private _providers: MJSignatureProviderEntity[] = [];

    /** Load signature accounts + providers into the cache (idempotent unless forceRefresh). */
    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        const configs: Partial<BaseEnginePropertyConfig>[] = [
            {
                Type: 'entity',
                EntityName: 'MJ: Signature Accounts',
                PropertyName: '_accounts',
                CacheLocal: true,
            },
            {
                Type: 'entity',
                EntityName: 'MJ: Signature Providers',
                PropertyName: '_providers',
                CacheLocal: true,
            },
        ];
        await this.Load(configs, provider, forceRefresh, contextUser);
    }

    // ---- Cached-data getters ----------------------------------------------------------------------

    public get Accounts(): MJSignatureAccountEntity[] {
        return this._accounts || [];
    }

    public get Providers(): MJSignatureProviderEntity[] {
        return this._providers || [];
    }

    /** Accounts joined to their provider entity; accounts whose provider is missing are dropped. */
    public get AccountsWithProviders(): SignatureAccountWithProvider[] {
        const providerMap = new Map<string, MJSignatureProviderEntity>();
        this.Providers.forEach((p) => providerMap.set(p.ID, p));

        return this.Accounts.map((account) => {
            const provider = providerMap.get(account.SignatureProviderID);
            return provider ? { account, provider } : null;
        }).filter((item): item is SignatureAccountWithProvider => item !== null);
    }

    // ---- Lookups ----------------------------------------------------------------------------------

    public GetAccountById(accountId: string): MJSignatureAccountEntity | undefined {
        return this.Accounts.find((a) => UUIDsEqual(a.ID, accountId));
    }

    public GetProviderById(providerId: string): MJSignatureProviderEntity | undefined {
        return this.Providers.find((p) => UUIDsEqual(p.ID, providerId));
    }

    public GetAccountByName(name: string): MJSignatureAccountEntity | undefined {
        return this.Accounts.find((a) => a.Name?.trim().toLowerCase() === name.trim().toLowerCase());
    }

    public GetProviderByDriverKey(driverKey: string): MJSignatureProviderEntity | undefined {
        const key = driverKey.trim().toLowerCase();
        return this.Providers.find((p) => p.ServerDriverKey?.trim().toLowerCase() === key);
    }

    /** Resolve an account with its provider; null if either is missing. */
    public GetAccountWithProvider(accountId: string): SignatureAccountWithProvider | null {
        const account = this.GetAccountById(accountId);
        if (!account) {
            return null;
        }
        const provider = this.GetProviderById(account.SignatureProviderID);
        return provider ? { account, provider } : null;
    }
}
