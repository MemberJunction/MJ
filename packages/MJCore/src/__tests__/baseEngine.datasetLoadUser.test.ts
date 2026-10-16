import { describe, it, expect } from 'vitest';
import { BaseEngine, BaseEnginePropertyConfig } from '../generic/baseEngine';
import { UserInfo } from '../generic/securityInfo';
import { DatasetItemFilterType, DatasetResultType, IMetadataProvider } from '../generic/interfaces';

/**
 * An engine's dataset is shared by every caller of the process, so loading it must not apply the
 * read permissions or row filter of the user who triggered the load. The provider's dataset read
 * applies both when it is given a context user, so the engine passes none.
 */
interface RecordedRead {
    Method: 'GetDatasetByName' | 'GetAndCacheDatasetByName';
    ContextUser: UserInfo | undefined;
    ForceRefresh: boolean | undefined;
}

class TestEngine extends BaseEngine<TestEngine> {
    public async Config(_forceRefresh?: boolean, _contextUser?: UserInfo, _provider?: IMetadataProvider): Promise<void> {
        // no-op for tests
    }

    public UseProviderForTest(provider: IMetadataProvider): void {
        (this as unknown as { _provider: IMetadataProvider })._provider = provider;
    }

    public async LoadDatasetForTest(config: BaseEnginePropertyConfig, user: UserInfo, bypassCache: boolean): Promise<void> {
        await this.LoadSingleDatasetConfig(config, user, bypassCache);
    }
}

function emptyDataset(name: string): DatasetResultType {
    return { DatasetID: 'ds', DatasetName: name, Success: true, Status: '', LatestUpdateDate: new Date(0), Results: [] };
}

function recordingProvider(reads: RecordedRead[]): IMetadataProvider {
    const provider = {
        async GetDatasetByName(
            datasetName: string,
            _itemFilters?: DatasetItemFilterType[],
            contextUser?: UserInfo,
            _providerToUse?: IMetadataProvider,
            forceRefresh?: boolean,
        ): Promise<DatasetResultType> {
            reads.push({ Method: 'GetDatasetByName', ContextUser: contextUser, ForceRefresh: forceRefresh });
            return emptyDataset(datasetName);
        },
        async GetAndCacheDatasetByName(datasetName: string, _itemFilters?: DatasetItemFilterType[], contextUser?: UserInfo): Promise<DatasetResultType> {
            reads.push({ Method: 'GetAndCacheDatasetByName', ContextUser: contextUser, ForceRefresh: undefined });
            return emptyDataset(datasetName);
        },
        async CacheDataset(): Promise<void> {
            /* no-op */
        },
    };
    return provider as unknown as IMetadataProvider;
}

const REQUEST_USER = { ID: 'request-user', Email: 'caller@example.com' } as unknown as UserInfo;

function datasetConfig(): BaseEnginePropertyConfig {
    return new BaseEnginePropertyConfig({
        Type: 'dataset',
        DatasetName: 'Template_Metadata',
        PropertyName: '_templateMetadata',
        AddToObject: false,
    });
}

describe('BaseEngine dataset loads', () => {
    it('reads a force-refreshed dataset without the triggering user', async () => {
        const reads: RecordedRead[] = [];
        const engine = new TestEngine();
        engine.UseProviderForTest(recordingProvider(reads));

        await engine.LoadDatasetForTest(datasetConfig(), REQUEST_USER, true);

        expect(reads).toEqual([{ Method: 'GetDatasetByName', ContextUser: undefined, ForceRefresh: true }]);
    });

    it('reads a cached dataset without the triggering user', async () => {
        const reads: RecordedRead[] = [];
        const engine = new TestEngine();
        engine.UseProviderForTest(recordingProvider(reads));

        await engine.LoadDatasetForTest(datasetConfig(), REQUEST_USER, false);

        expect(reads).toEqual([{ Method: 'GetAndCacheDatasetByName', ContextUser: undefined, ForceRefresh: undefined }]);
    });
});
