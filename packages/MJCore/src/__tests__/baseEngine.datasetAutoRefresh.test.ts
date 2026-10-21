import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseEngine, BaseEnginePropertyConfig } from '../generic/baseEngine';
import { BaseEntity } from '../generic/baseEntity';
import { BaseEntityResult } from '../generic/baseEntity';
import type { EntityInfo } from '../generic/entityInfo';
import type { IMetadataProvider } from '../generic/interfaces';
import type { UserInfo } from '../generic/securityInfo';

interface MockTemplateRow {
    ID: string;
    Name: string;
    Content?: MockContentRow[];
    GetAll(): Record<string, unknown>;
    LoadFromData(data: Record<string, unknown>): Promise<boolean>;
    EntityInfo: EntityInfo;
}

interface MockContentRow {
    ID: string;
    TemplateID: string;
    TemplateText: string;
    GetAll(): Record<string, unknown>;
    LoadFromData(data: Record<string, unknown>): Promise<boolean>;
    EntityInfo: EntityInfo;
}

function makeEntityInfo(name: string): EntityInfo {
    return {
        Name: name,
        PrimaryKeys: [{ Name: 'ID', CodeName: 'ID', IsUniqueIdentifier: true }],
        Fields: [],
    } as unknown as EntityInfo;
}

function makeMockEntity<T extends { ID: string }>(entityName: string, initial: T): T & MockTemplateRow {
    const info = makeEntityInfo(entityName);
    const state: Record<string, unknown> = { ...initial };
    const entity = {
        ...initial,
        EntityInfo: info,
        GetAll: () => ({ ...state }),
        LoadFromData: async (data: Record<string, unknown>) => {
            Object.assign(state, data);
            Object.assign(entity, data);
            return true;
        },
    };
    return entity as unknown as T & MockTemplateRow;
}

class DatasetAutoRefreshTestEngine extends BaseEngine<DatasetAutoRefreshTestEngine> {
    public _metadata!: {
        Templates: MockTemplateRow[];
        TemplateContents: MockContentRow[];
    };
    public additionalLoadingCount = 0;
    public mockProvider!: IMetadataProvider;

    public override async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        const configs: Partial<BaseEnginePropertyConfig>[] = [
            {
                Type: 'dataset',
                DatasetName: 'Template_Metadata',
                DatasetResultHandling: 'single_property',
                PropertyName: '_metadata',
                AutoRefresh: true,
            },
        ];
        await this.Load(configs, provider ?? this.mockProvider, forceRefresh ?? false, contextUser);
    }

    public override get ProviderToUse(): IMetadataProvider {
        return this.mockProvider;
    }

    public async ConfigTest(contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        await this.Config(false, contextUser, provider);
    }

    protected override async AdditionalLoading(): Promise<void> {
        this.additionalLoadingCount++;
        if (this._metadata?.Templates && this._metadata?.TemplateContents) {
            for (const t of this._metadata.Templates) {
                t.Content = this._metadata.TemplateContents.filter(
                    (c) => c.TemplateID.toLowerCase() === t.ID.toLowerCase()
                );
            }
        }
    }

    public async SimulateEntityEvent(entity: BaseEntity, type: 'save' | 'delete', payload?: Record<string, unknown>): Promise<void> {
        await (this as unknown as {
            HandleIndividualBaseEntityEvent(event: { baseEntity: BaseEntity; type: 'save' | 'delete'; payload?: Record<string, unknown> }): Promise<boolean>;
        }).HandleIndividualBaseEntityEvent({ baseEntity: entity, type, payload });
    }
}

describe('BaseEngine dataset single_property loading & AutoRefresh (MJ-CORE-5)', () => {
    let engine: DatasetAutoRefreshTestEngine;
    const contextUser = { ID: 'user-1', Name: 'Test User', Email: 'test@example.com' } as unknown as UserInfo;

    beforeEach(() => {
        engine = new DatasetAutoRefreshTestEngine();
    });

    it('passes contextUser to GetAndCacheDatasetByName and updates constituent arrays in-place on save/delete', async () => {
        const getAndCacheSpy = vi.fn().mockResolvedValue({
            Success: true,
            Results: [
                {
                    Code: 'Templates',
                    EntityName: 'MJ: Templates',
                    Results: [{ ID: 'T-1', Name: 'Welcome Email' }],
                },
                {
                    Code: 'TemplateContents',
                    EntityName: 'MJ: Template Contents',
                    Results: [{ ID: 'TC-1', TemplateID: 'T-1', TemplateText: 'Hello {{name}}' }],
                },
            ],
        });

        const provider = {
            Entities: [makeEntityInfo('MJ: Templates'), makeEntityInfo('MJ: Template Contents')],
            EntityByName: (name: string) => makeEntityInfo(name),
            GetAndCacheDatasetByName: getAndCacheSpy,
            GetEntityObject: vi.fn().mockImplementation(async (entityName: string, dataOrUser?: unknown) => {
                const initialData =
                    dataOrUser && typeof dataOrUser === 'object' && !('Email' in (dataOrUser as Record<string, unknown>))
                        ? (dataOrUser as { ID: string; Name?: string; TemplateID?: string; TemplateText?: string })
                        : { ID: '' };
                return makeMockEntity(entityName, initialData);
            }),
        } as unknown as IMetadataProvider;

        engine.mockProvider = provider;
        await engine.ConfigTest(contextUser, provider);

        expect(getAndCacheSpy).toHaveBeenCalledTimes(1);
        expect(getAndCacheSpy).toHaveBeenCalledWith('Template_Metadata', undefined, contextUser);
        expect(engine._metadata.Templates).toHaveLength(1);
        expect(engine._metadata.Templates[0].Content).toHaveLength(1);
        expect(engine.additionalLoadingCount).toBe(1);

        // Simulate updating the existing TemplateContent entity
        const updatedContent = makeMockEntity('MJ: Template Contents', {
            ID: 'tc-1', // case-insensitive UUID match
            TemplateID: 'T-1',
            TemplateText: 'Updated {{name}}!',
        });
        await engine.SimulateEntityEvent(updatedContent as unknown as BaseEntity, 'save');

        expect(engine._metadata.TemplateContents).toHaveLength(1);
        expect(engine._metadata.TemplateContents[0].TemplateText).toBe('Updated {{name}}!');
        expect(engine._metadata.Templates[0].Content?.[0].TemplateText).toBe('Updated {{name}}!');
        expect(engine.additionalLoadingCount).toBe(2);

        // Simulate saving a brand new Template entity
        const newTemplate = makeMockEntity('MJ: Templates', {
            ID: 'T-2',
            Name: 'Followup Email',
        });
        await engine.SimulateEntityEvent(newTemplate as unknown as BaseEntity, 'save');
        expect(engine._metadata.Templates).toHaveLength(2);
        expect(engine.additionalLoadingCount).toBe(3);

        // Simulate deleting the second Template entity
        const deletedTemplate = {
            ...newTemplate,
            LatestResult: Object.assign(new BaseEntityResult(), {
                Type: 'delete' as const,
                Success: true,
                OriginalValues: [{ FieldName: 'ID', Value: 'T-2' }],
            }),
        };
        await engine.SimulateEntityEvent(deletedTemplate as unknown as BaseEntity, 'delete');
        expect(engine._metadata.Templates).toHaveLength(1);
        expect(engine._metadata.Templates[0].ID).toBe('T-1');
        expect(engine.additionalLoadingCount).toBe(4);
    });
});
