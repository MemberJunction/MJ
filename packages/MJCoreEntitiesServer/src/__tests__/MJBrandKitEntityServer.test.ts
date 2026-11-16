import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseEntity, ValidationErrorType, ValidationResult } from '@memberjunction/core';
import { MJBrandKitEntityServer } from '../custom/MJBrandKitEntityServer.server';

describe('MJBrandKitEntityServer', () => {
    let runViewMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        runViewMock = vi.fn().mockResolvedValue({ Success: true, Results: [] });
        const baseResult = new ValidationResult();
        baseResult.Success = true;
        vi.spyOn(BaseEntity.prototype, 'ValidateAsync').mockResolvedValue(baseResult);
    });

    function createBrandKitEntity(options: {
        id?: string | null;
        isDefault?: boolean;
        companyId?: string | null;
        isSaved?: boolean;
        dirtyFields?: string[];
    }): MJBrandKitEntityServer {
        const entity = Object.create(MJBrandKitEntityServer.prototype) as MJBrandKitEntityServer;
        const dirtySet = new Set(options.dirtyFields ?? []);

        Object.defineProperty(entity, 'ID', {
            value: options.id === undefined ? 'DBBE8BC2-8FEF-4DA9-B24A-C6038129B696' : options.id,
            configurable: true,
        });
        Object.defineProperty(entity, 'IsDefault', { value: options.isDefault ?? false, configurable: true });
        Object.defineProperty(entity, 'CompanyID', { value: options.companyId ?? null, configurable: true });
        Object.defineProperty(entity, 'IsSaved', { value: options.isSaved ?? false, configurable: true });
        Object.defineProperty(entity, 'RunViewProviderToUse', {
            value: { RunView: runViewMock },
            configurable: true,
        });
        Object.defineProperty(entity, 'ContextCurrentUser', { value: { ID: 'user-1' }, configurable: true });

        entity.GetFieldByName = vi.fn().mockImplementation((name: string) => ({
            Dirty: dirtySet.has(name),
        })) as unknown as MJBrandKitEntityServer['GetFieldByName'];

        return entity;
    }

    it('runs no query when IsDefault is false', async () => {
        const entity = createBrandKitEntity({ isDefault: false, isSaved: false });
        const result = await entity.ValidateAsync();
        expect(result.Success).toBe(true);
        expect(result.Errors).toHaveLength(0);
        expect(runViewMock).not.toHaveBeenCalled();
    });

    it('runs no query when a saved record has IsDefault=true but neither IsDefault nor CompanyID is dirty', async () => {
        const entity = createBrandKitEntity({
            isDefault: true,
            isSaved: true,
            dirtyFields: ['Name'],
        });
        const result = await entity.ValidateAsync();
        expect(result.Success).toBe(true);
        expect(result.Errors).toHaveLength(0);
        expect(runViewMock).not.toHaveBeenCalled();
    });

    it('fails with Source IsDefault when another default exists for the same company', async () => {
        const companyId = 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA';
        const ownId = 'BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB';
        runViewMock.mockResolvedValueOnce({
            Success: true,
            Results: [{ ID: 'CCCCCCCC-CCCC-4CCC-8CCC-CCCCCCCCCCCC', Name: 'Acme Primary' }],
        });

        const entity = createBrandKitEntity({
            id: ownId,
            isDefault: true,
            companyId,
            isSaved: false,
        });

        const result = await entity.ValidateAsync();
        expect(result.Success).toBe(false);
        expect(result.Errors).toHaveLength(1);
        expect(result.Errors[0].Source).toBe('IsDefault');
        expect(result.Errors[0].Type).toBe(ValidationErrorType.Failure);
        expect(result.Errors[0].Message).toBe(
            "Brand kit 'Acme Primary' is already the default for this company. Clear its IsDefault first."
        );
        expect(runViewMock).toHaveBeenCalledWith(
            {
                EntityName: 'MJ: Brand Kits',
                ExtraFilter: `IsDefault = 1 AND CompanyID = '${companyId}' AND ID <> '${ownId}'`,
                Fields: ['ID', 'Name'],
                ResultType: 'simple',
                MaxRows: 1,
            },
            { ID: 'user-1' }
        );
    });

    it('filters CompanyID IS NULL and excludes own ID for the org-wide case', async () => {
        const ownId = 'DBBE8BC2-8FEF-4DA9-B24A-C6038129B696';
        runViewMock.mockResolvedValueOnce({
            Success: true,
            Results: [{ ID: '11111111-1111-4111-8111-111111111111', Name: 'MemberJunction' }],
        });

        const entity = createBrandKitEntity({
            id: ownId,
            isDefault: true,
            companyId: null,
            isSaved: true,
            dirtyFields: ['IsDefault'],
        });

        const result = await entity.ValidateAsync();
        expect(result.Success).toBe(false);
        expect(result.Errors).toHaveLength(1);
        expect(result.Errors[0].Source).toBe('IsDefault');
        expect(result.Errors[0].Message).toBe(
            "Brand kit 'MemberJunction' is already the default for all companies. Clear its IsDefault first."
        );
        expect(runViewMock).toHaveBeenCalledWith(
            {
                EntityName: 'MJ: Brand Kits',
                ExtraFilter: `IsDefault = 1 AND CompanyID IS NULL AND ID <> '${ownId}'`,
                Fields: ['ID', 'Name'],
                ResultType: 'simple',
                MaxRows: 1,
            },
            { ID: 'user-1' }
        );
    });

    it('fails the save when RunView returns Success: false', async () => {
        runViewMock.mockResolvedValueOnce({
            Success: false,
            Results: [],
            ErrorMessage: 'Database connection lost',
        });

        const entity = createBrandKitEntity({
            isDefault: true,
            companyId: null,
            isSaved: false,
        });

        const result = await entity.ValidateAsync();
        expect(result.Success).toBe(false);
        expect(result.Errors).toHaveLength(1);
        expect(result.Errors[0].Source).toBe('IsDefault');
        expect(result.Errors[0].Type).toBe(ValidationErrorType.Failure);
        expect(result.Errors[0].Message).toMatch(/could not check for another default kit/i);
    });
});
