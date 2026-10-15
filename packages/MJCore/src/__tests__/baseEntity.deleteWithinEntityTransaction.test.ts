import { describe, it, expect, beforeEach } from 'vitest';
import { BaseEntity } from '../generic/baseEntity';
import { CompositeKey } from '../generic/compositeKey';
import { EntityInfo, RecordChange } from '../generic/entityInfo';
import { EntityDeleteOptions, EntitySaveOptions, IEntityDataProvider, ProviderConfigDataBase } from '../generic/interfaces';
import { UserInfo } from '../generic/securityInfo';
import { EntityTransactionScope } from '../generic/entityTransactionScope';
import { TransactionGroupBase, TransactionResult } from '../generic/transactionGroup';

/** A server-side provider double that records how its entity-transaction scopes are settled. */
class ScopeRecordingProvider implements IEntityDataProvider {
    public SupportsEntityTransactions = true;
    public Settles: Array<'begin' | 'commit' | 'rollback'> = [];

    public async BeginEntityTransaction(): Promise<EntityTransactionScope> {
        this.Settles.push('begin');
        return {
            IsNested: false,
            Commit: async (): Promise<void> => { this.Settles.push('commit'); },
            Rollback: async (): Promise<void> => { this.Settles.push('rollback'); },
        };
    }
    public async Config(_configData: ProviderConfigDataBase): Promise<boolean> { return true; }
    public async Load(_entity: BaseEntity, _key: CompositeKey, _rels: string[], _user: UserInfo): Promise<{}> { return {}; }
    public async Save(_entity: BaseEntity, _user: UserInfo, _options: EntitySaveOptions): Promise<{}> { return {}; }
    public async Delete(_entity: BaseEntity, _options: EntityDeleteOptions, _user: UserInfo): Promise<boolean> { return true; }
    public async GetRecordChanges(_entityName: string, _key: CompositeKey): Promise<RecordChange[]> { return []; }
}

/** What a generated CascadeDeletes override does, with the inner delete scripted. */
class CascadingEntity extends BaseEntity {
    public InnerResult: boolean | Error = true;
    public InnerCalls = 0;
    public override async Delete(_options?: EntityDeleteOptions): Promise<boolean> {
        return this.DeleteWithinEntityTransaction(async () => {
            this.InnerCalls++;
            if (this.InnerResult instanceof Error) {
                throw this.InnerResult;
            }
            return this.InnerResult;
        });
    }
}

class NeverSubmittedGroup extends TransactionGroupBase {
    protected async HandleSubmit(): Promise<TransactionResult[]> { return []; }
}

const info = (): EntityInfo => new EntityInfo({ ID: 'E0000000-0000-4000-8000-0000000000C1', Name: 'Cascade Parents', SchemaName: 'dbo', BaseTable: 'CascadeParent', BaseView: 'vwCascadeParents', Status: 'Active', CascadeDeletes: true, AllowDeleteAPI: true, EntityFields: [] });

describe('BaseEntity.DeleteWithinEntityTransaction', () => {
    let provider: ScopeRecordingProvider;
    let entity: CascadingEntity;
    beforeEach(() => {
        provider = new ScopeRecordingProvider();
        entity = new CascadingEntity(info(), provider);
    });

    it('commits a successful delete on the record\'s own provider', async () => {
        await expect(entity.Delete()).resolves.toBe(true);
        expect(provider.Settles).toEqual(['begin', 'commit']);
    });

    it('rolls back a delete that returned false, and returns false', async () => {
        entity.InnerResult = false;
        await expect(entity.Delete()).resolves.toBe(false);
        expect(provider.Settles).toEqual(['begin', 'rollback']);
    });

    it('inside a TransactionGroup opens no transaction: the group supplies atomicity on Submit', async () => {
        entity.TransactionGroup = new NeverSubmittedGroup();
        await expect(entity.Delete()).resolves.toBe(true);
        expect(entity.InnerCalls).toBe(1);
        expect(provider.Settles).toEqual([]);
    });

});
