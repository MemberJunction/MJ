import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies (same pattern as lms.test.ts)
vi.mock('@memberjunction/actions', () => ({
  BaseAction: class BaseAction {
    protected async InternalRunAction(): Promise<unknown> {
      return {};
    }
  },
}));

vi.mock('@memberjunction/global', () => ({
  RegisterClass: () => (target: unknown) => target,
}));

vi.mock('@memberjunction/core', () => ({
  UserInfo: class UserInfo {},
  Metadata: vi.fn(),
  RunView: vi.fn().mockImplementation(() => ({
    RunView: vi.fn().mockResolvedValue({ Success: true, Results: [] }),
  })),
}));

vi.mock('@memberjunction/core-entities', () => ({
  MJCompanyIntegrationEntity: class MJCompanyIntegrationEntity {
    CompanyID: string = '';
    APIKey: string | null = null;
    AccessToken: string | null = null;
    ExternalSystemID: string | null = null;
    CustomAttribute1: string | null = null;
  },
}));

vi.mock('@memberjunction/actions-base', () => ({
  ActionParam: class ActionParam {
    Name: string = '';
    Value: unknown = null;
    Type: string = 'Input';
  },
}));

import { UserInfo } from '@memberjunction/core';
import { GetBundlesAction } from '../providers/learnworlds/actions/get-bundles.action';
import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { LearnWorldsBundle } from '../providers/learnworlds/interfaces';

/**
 * Helper to create a mock UserInfo for test context
 */
function createMockContextUser(): UserInfo {
  return { ID: 'test-user-id', Name: 'Test User', Email: 'test@example.com' } as unknown as UserInfo;
}

/**
 * Helper to build a raw LW API bundle object matching the LWApiBundle interface
 */
function createRawApiBundle(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'bundle-1',
    title: 'Starter Bundle',
    description: 'A great bundle',
    price: 49.99,
    currency: 'USD',
    courses: ['course-1', 'course-2'],
    is_active: true,
    created_at: '2024-06-15T10:00:00Z',
    updated_at: '2024-06-20T12:00:00Z',
    thumbnail_url: 'https://example.com/thumb.jpg',
    total_courses: 2,
    total_enrollments: 150,
    ...overrides,
  };
}

describe('GetBundlesAction', () => {
  let action: GetBundlesAction;
  let contextUser: UserInfo;

  beforeEach(() => {
    action = new GetBundlesAction();
    contextUser = createMockContextUser();
  });

  describe('GetBundles() typed method', () => {
    it('should get bundles successfully', async () => {
      const rawBundle = createRawApiBundle();
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([rawBundle] as never);

      const result = await action.GetBundles({ CompanyID: 'comp-1' }, contextUser);

      expect(result.TotalCount).toBe(1);
      expect(result.Bundles).toHaveLength(1);

      const bundle: LearnWorldsBundle = result.Bundles[0];
      expect(bundle.id).toBe('bundle-1');
      expect(bundle.title).toBe('Starter Bundle');
      expect(bundle.description).toBe('A great bundle');
      expect(bundle.price).toBe(49.99);
      expect(bundle.currency).toBe('USD');
      expect(bundle.courses).toEqual(['course-1', 'course-2']);
      expect(bundle.isActive).toBe(true);
      expect(bundle.totalCourses).toBe(2);
      expect(bundle.totalEnrollments).toBe(150);
      expect(bundle.thumbnailUrl).toBe('https://example.com/thumb.jpg');
    });

    it('should handle empty results', async () => {
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([] as never);

      const result = await action.GetBundles({ CompanyID: 'comp-1', SearchText: 'nonexistent' }, contextUser);

      expect(result.TotalCount).toBe(0);
      expect(result.Bundles).toEqual([]);
    });

    it('should map bundles with _id fallback', async () => {
      const rawBundle = createRawApiBundle({ id: undefined, _id: 'alt-bundle-id' });
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([rawBundle] as never);

      const result = await action.GetBundles({ CompanyID: 'comp-1' }, contextUser);

      expect(result.Bundles[0].id).toBe('alt-bundle-id');
    });

    it('should default isActive to true when is_active is not false', async () => {
      const rawBundle = createRawApiBundle({ is_active: undefined });
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([rawBundle] as never);

      const result = await action.GetBundles({ CompanyID: 'comp-1' }, contextUser);

      expect(result.Bundles[0].isActive).toBe(true);
    });

    it('should compute totalCourses from courses array when total_courses is missing', async () => {
      const rawBundle = createRawApiBundle({ total_courses: undefined, courses: ['c1', 'c2', 'c3'] });
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([rawBundle] as never);

      const result = await action.GetBundles({ CompanyID: 'comp-1' }, contextUser);

      expect(result.Bundles[0].totalCourses).toBe(3);
    });

    it('should use students_count as fallback for totalEnrollments', async () => {
      const rawBundle = createRawApiBundle({ total_enrollments: undefined, students_count: 42 });
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([rawBundle] as never);

      const result = await action.GetBundles({ CompanyID: 'comp-1' }, contextUser);

      expect(result.Bundles[0].totalEnrollments).toBe(42);
    });
  });

  describe('InternalRunAction()', () => {
    it('should return success when GetBundles succeeds', async () => {
      const mockBundles: LearnWorldsBundle[] = [
        {
          id: 'bundle-1',
          title: 'Bundle A',
          courses: ['c1'],
          isActive: true,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-02T00:00:00.000Z',
          totalCourses: 1,
          totalEnrollments: 10,
        },
        {
          id: 'bundle-2',
          title: 'Bundle B',
          courses: ['c2', 'c3'],
          isActive: true,
          createdAt: '2024-02-01T00:00:00.000Z',
          updatedAt: '2024-02-02T00:00:00.000Z',
          totalCourses: 2,
          totalEnrollments: 20,
        },
      ];

      vi.spyOn(action, 'GetBundles').mockResolvedValue({
        Bundles: mockBundles,
        TotalCount: 2,
      });

      const runParams: RunActionParams = {
        Params: [
          { Name: 'CompanyID', Type: 'Input', Value: 'comp-1' },
          { Name: 'SearchText', Type: 'Input', Value: undefined },
          { Name: 'MaxResults', Type: 'Input', Value: undefined },
        ],
        ContextUser: contextUser,
      } as unknown as RunActionParams;

      const result = (await action['InternalRunAction'](runParams)) as ActionResultSimple;

      expect(result.Success).toBe(true);
      expect(result.ResultCode).toBe('SUCCESS');
      expect(result.Message).toContain('Successfully retrieved 2 bundle(s)');
    });

    it('should return error result when GetBundles throws', async () => {
      vi.spyOn(action, 'GetBundles').mockRejectedValue(new Error('API connection failed'));

      const runParams: RunActionParams = {
        Params: [{ Name: 'CompanyID', Type: 'Input', Value: 'comp-1' }],
        ContextUser: contextUser,
      } as unknown as RunActionParams;

      const result = (await action['InternalRunAction'](runParams)) as ActionResultSimple;

      expect(result.Success).toBe(false);
      expect(result.ResultCode).toBe('ERROR');
      expect(result.Message).toContain('Error retrieving bundles');
      expect(result.Message).toContain('API connection failed');
    });
  });
});
