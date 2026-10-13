import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    BaseEntity,
    BaseEntityResult,
    CompositeKey,
    EntityDeleteOptions,
    EntityInfo,
    EntitySaveOptions,
    IEntityDataProvider,
    ProviderConfigDataBase,
    RecordChange,
    TransactionGroupBase,
    TransactionResult,
    UserInfo,
    type EntityTransactionScope,
} from '@memberjunction/core';
import { MJAIPromptEntity } from '../generated/entity_subclasses';

/**
 * The generated CascadeDeletes `Delete()` override, exercised on a real generated class
 * (`MJAIPromptEntity`, CascadeDeletes = 1), which delegates to `BaseEntity.DeleteWithinEntityTransaction`.
 * Only the provider and `BaseEntity.Delete` — the inner delete the override wraps — are test
 * doubles, so these tests pin the override's contract end to end: the transaction is opened on the
 * record's provider, settled exactly once, and a failed delete returns false with its real error
 * left in LatestResult.
 */

const REAL_ERROR = "The DELETE statement conflicted with the REFERENCE constraint 'FK_x'. (Msg 547)";

/** A server-side provider double that records how its entity-transaction scopes are settled. */
class ScopeRecordingProvider implements IEntityDataProvider {
    public SupportsEntityTransactions = true;
    public Begins = 0;
    public Settles: Array<'commit' | 'rollback'> = [];
    public RollbackError: Error | null = null;

    public async BeginEntityTransaction(): Promise<EntityTransactionScope> {
        this.Begins++;
        return {
            IsNested: false,
            Commit: async (): Promise<void> => {
                this.Settles.push('commit');
            },
            Rollback: async (): Promise<void> => {
                this.Settles.push('rollback');
                if (this.RollbackError) {
                    throw this.RollbackError;
                }
            },
        };
    }

    public async Config(_configData: ProviderConfigDataBase): Promise<boolean> {
        return true;
    }
    public async Load(_entity: BaseEntity, _key: CompositeKey, _rels: string[], _user: UserInfo): Promise<{}> {
        return {};
    }
    public async Save(_entity: BaseEntity, _user: UserInfo, _options: EntitySaveOptions): Promise<{}> {
        return {};
    }
    public async Delete(_entity: BaseEntity, _options: EntityDeleteOptions, _user: UserInfo): Promise<boolean> {
        throw new Error('the inner delete is stubbed on BaseEntity; the provider delete must not be reached');
    }
    public async GetRecordChanges(_entityName: string, _key: CompositeKey): Promise<RecordChange[]> {
        return [];
    }
}

/** A group the test never submits; only its presence on the record matters. */
class NeverSubmittedGroup extends TransactionGroupBase {
    protected async HandleSubmit(): Promise<TransactionResult[]> {
        return [];
    }
}

function aiPromptsEntityInfo(): EntityInfo {
    return new EntityInfo({
        ID: 'E0000000-0000-4000-8000-0000000A1A1A',
        Name: 'MJ: AI Prompts',
        BaseTable: 'AIPrompt',
        BaseView: 'vwAIPrompts',
        SchemaName: '__mj',
        Status: 'Active',
        CascadeDeletes: true,
        AllowDeleteAPI: true,
        EntityFields: [],
    });
}

/** Records a failed delete the way BaseEntity does: a failed result entry carrying the real error. */
function recordFailure(entity: BaseEntity): void {
    const result = new BaseEntityResult();
    result.Success = false;
    result.Type = 'delete';
    result.Message = REAL_ERROR;
    result.StartedAt = new Date();
    result.EndedAt = new Date();
    entity.RegisterResultHistoryEntry(result);
}

describe('generated CascadeDeletes Delete() override', () => {
    let provider: ScopeRecordingProvider;
    let prompt: MJAIPromptEntity;
    let errorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        provider = new ScopeRecordingProvider();
        prompt = new MJAIPromptEntity(aiPromptsEntityInfo(), provider);
        errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('a failed delete returns false, rolls back once on the record\'s provider, and keeps the real error in LatestResult', async () => {
        vi.spyOn(BaseEntity.prototype, 'Delete').mockImplementation(async function (this: BaseEntity): Promise<boolean> {
            recordFailure(this);
            return false;
        });
        await expect(prompt.Delete()).resolves.toBe(false);
        expect(provider.Begins).toBe(1);
        expect(provider.Settles).toEqual(['rollback']);
        expect(prompt.LatestResult?.Success).toBe(false);
        expect(prompt.LatestResult?.Message).toBe(REAL_ERROR);
    });

    it('a rollback that fails after a failed delete is logged — Delete still returns false with the real error', async () => {
        provider.RollbackError = new Error('No active transaction to rollback');
        vi.spyOn(BaseEntity.prototype, 'Delete').mockImplementation(async function (this: BaseEntity): Promise<boolean> {
            recordFailure(this);
            return false;
        });
        await expect(prompt.Delete()).resolves.toBe(false);
        expect(provider.Settles).toEqual(['rollback']);
        expect(prompt.LatestResult?.Message).toBe(REAL_ERROR);
        expect(errorSpy.mock.calls.flat().map(String).join(' ')).toMatch(/rollback failed after the work reported failure.*No active transaction to rollback/);
    });

    it('a successful delete commits once and returns true', async () => {
        vi.spyOn(BaseEntity.prototype, 'Delete').mockResolvedValue(true);
        await expect(prompt.Delete()).resolves.toBe(true);
        expect(provider.Begins).toBe(1);
        expect(provider.Settles).toEqual(['commit']);
    });

    it('an inner delete that throws rolls back once and rethrows that same error', async () => {
        const thrown = new Error('inner delete threw');
        vi.spyOn(BaseEntity.prototype, 'Delete').mockRejectedValue(thrown);
        await expect(prompt.Delete()).rejects.toBe(thrown);
        expect(provider.Settles).toEqual(['rollback']);
    });

    it('an inner delete that throws a FALSY value still rethrows it after the single rollback', async () => {
        vi.spyOn(BaseEntity.prototype, 'Delete').mockRejectedValue(undefined);
        let threw = false;
        let caught: unknown = 'not reached';
        try {
            await prompt.Delete();
        } catch (e) {
            threw = true;
            caught = e;
        }
        expect(threw).toBe(true);
        expect(caught).toBeUndefined();
        expect(provider.Settles).toEqual(['rollback']);
    });

    it('a delete queued on a TransactionGroup opens no transaction — the group supplies atomicity on Submit', async () => {
        const inner = vi.spyOn(BaseEntity.prototype, 'Delete').mockResolvedValue(true);
        prompt.TransactionGroup = new NeverSubmittedGroup();
        await expect(prompt.Delete()).resolves.toBe(true);
        expect(inner).toHaveBeenCalledTimes(1);
        expect(provider.Begins).toBe(0);
        expect(provider.Settles).toEqual([]);
    });

    it('a provider without entity transactions (client side) delegates straight to the inner delete', async () => {
        provider.SupportsEntityTransactions = false;
        const inner = vi.spyOn(BaseEntity.prototype, 'Delete').mockResolvedValue(true);
        await expect(prompt.Delete()).resolves.toBe(true);
        expect(inner).toHaveBeenCalledTimes(1);
        expect(provider.Begins).toBe(0);
    });
});
