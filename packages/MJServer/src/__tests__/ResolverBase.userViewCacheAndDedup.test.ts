import 'reflect-metadata';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { UserViewEngine } from '@memberjunction/core-entities';
import type { MJUserViewEntityExtended } from '@memberjunction/core-entities';
import { RunView } from '@memberjunction/core';
import type { IMetadataProvider, IRunViewProvider, RunViewParams, UserInfo } from '@memberjunction/core';
import { ResolverBase } from '../generic/ResolverBase.js';
import { RunViewResolver, RunViewByNameInput, RunViewByIDInput } from '../generic/RunViewResolver.js';

class UserViewProbe extends ResolverBase {
    public async TestRunViewByID(
        viewInput: RunViewByIDInput,
        provider: IMetadataProvider,
        userPayload: { userRecord: UserInfo; email: string }
    ) {
        return this.RunViewByIDGeneric(viewInput, provider, userPayload as never);
    }

    public async TestRunViewByName(
        viewInput: RunViewByNameInput,
        provider: IMetadataProvider,
        userPayload: { userRecord: UserInfo; email: string }
    ) {
        return this.RunViewByNameGeneric(viewInput, provider, userPayload as never);
    }
}

describe('ResolverBase & RunViewResolver UserViewEngine cache and ViewEntity forwarding (MJ-CORE-9)', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('resolves MJ: User Views from UserViewEngine cache first, forwards ViewEntity into RunViewParams, and reuses _resolvedViewEntity in RunViewResolver', async () => {
        const mockViewEntity = {
            ID: 'view-123',
            Name: 'Active Widgets',
            EntityID: 'entity-widgets',
            Entity: 'Widgets',
            WhereClause: 'Status = 1',
            GridState: null,
            SortState: null,
        } as unknown as MJUserViewEntityExtended;

        vi.spyOn(UserViewEngine.Instance, 'Loaded', 'get').mockReturnValue(true);
        const getViewByIdSpy = vi.spyOn(UserViewEngine.Instance, 'GetViewById').mockReturnValue(mockViewEntity);
        const getViewByNameSpy = vi.spyOn(UserViewEngine.Instance, 'GetViewByName').mockReturnValue(mockViewEntity);

        const capturedRunViewParams: RunViewParams[] = [];
        const providerRunViewSpy = vi.fn().mockImplementation(async (params: RunViewParams) => {
            capturedRunViewParams.push(params);
            return {
                Success: true,
                Results: [{ ID: 'w-1', Name: 'Widget A' }],
                RowCount: 1,
                TotalRowCount: 1,
                ExecutionTime: 2,
                ErrorMessage: '',
                UserViewRunID: '',
            };
        });
        const fakeProvider = {
            Entities: [
                {
                    ID: 'entity-widgets',
                    Name: 'Widgets',
                    PrimaryKeys: [{ Name: 'ID', CodeName: 'ID' }],
                    Fields: [
                        { Name: 'ID', CodeName: 'ID', AllowInView: true, DefaultInView: true, IsBinaryFieldType: false },
                        { Name: 'Name', CodeName: 'Name', AllowInView: true, DefaultInView: true, IsBinaryFieldType: false },
                    ],
                    EncryptedFields: [],
                },
            ],
            EntityByName: () => ({
                ID: 'entity-widgets',
                Name: 'Widgets',
                PrimaryKeys: [{ Name: 'ID', CodeName: 'ID' }],
                Fields: [
                    { Name: 'ID', CodeName: 'ID', AllowInView: true, DefaultInView: true, IsBinaryFieldType: false },
                    { Name: 'Name', CodeName: 'Name', AllowInView: true, DefaultInView: true, IsBinaryFieldType: false },
                ],
                EncryptedFields: [],
            }),
            EntityByID: () => ({
                ID: 'entity-widgets',
                Name: 'Widgets',
                PrimaryKeys: [{ Name: 'ID', CodeName: 'ID' }],
                Fields: [
                    { Name: 'ID', CodeName: 'ID', AllowInView: true, DefaultInView: true, IsBinaryFieldType: false },
                    { Name: 'Name', CodeName: 'Name', AllowInView: true, DefaultInView: true, IsBinaryFieldType: false },
                ],
                EncryptedFields: [],
            }),
            RunView: providerRunViewSpy,
        } as unknown as IMetadataProvider & IRunViewProvider;

        const userPayload = {
            email: 'tester@example.com',
            userRecord: { ID: 'u-1', Email: 'tester@example.com' } as unknown as UserInfo,
        };

        const resolver = new RunViewResolver();
        const findBySpy = vi.spyOn(
            resolver as unknown as { findBy: (...args: unknown[]) => Promise<unknown> },
            'findBy'
        );

        const byIdResult = await resolver.RunViewByID(
            { ViewID: 'view-123' } as RunViewByIDInput,
            { providers: [{ provider: fakeProvider, type: 'Read-Only' }], userPayload } as never
        );

        expect(getViewByIdSpy).toHaveBeenCalledWith('view-123');
        expect(findBySpy).not.toHaveBeenCalled();
        expect(capturedRunViewParams).toHaveLength(1);
        expect(capturedRunViewParams[0].ViewEntity).toBe(mockViewEntity);
        expect(byIdResult?.Results).toHaveLength(1);

        const byNameResult = await resolver.RunViewByName(
            { ViewName: 'Active Widgets' } as RunViewByNameInput,
            { providers: [{ provider: fakeProvider, type: 'Read-Only' }], userPayload } as never
        );

        expect(getViewByNameSpy).toHaveBeenCalledWith('Active Widgets');
        expect(findBySpy).not.toHaveBeenCalled();
        expect(capturedRunViewParams).toHaveLength(2);
        expect(capturedRunViewParams[1].ViewEntity).toBe(mockViewEntity);
        expect(byNameResult?.Results).toHaveLength(1);
    });
});
