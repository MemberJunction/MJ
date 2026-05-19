import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies (same pattern as get-bundles.action.test.ts)
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
import { GetLearnWorldsUsersAction } from '../providers/learnworlds/actions/get-users.action';
import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { LearnWorldsUser, LWApiUser } from '../providers/learnworlds/interfaces';

/**
 * Helper to create a mock UserInfo for test context
 */
function createMockContextUser(): UserInfo {
  return { ID: 'test-user-id', Name: 'Test User', Email: 'test@example.com' } as unknown as UserInfo;
}

/**
 * Helper to build a raw LW API user object matching the LWApiUser interface
 */
function createRawApiUser(overrides: Partial<LWApiUser> = {}): LWApiUser {
  return {
    id: 'user-1',
    email: 'alice@example.com',
    username: 'alice',
    first_name: 'Alice',
    last_name: 'Smith',
    full_name: 'Alice Smith',
    status: 'active',
    role: 'student',
    created: '2024-06-15T10:00:00Z',
    last_login: '2024-07-01T08:30:00Z',
    tags: ['beginner'],
    custom_fields: { company: 'Acme' },
    course_stats: {
      total: 5,
      completed: 3,
      in_progress: 2,
      total_time_spent: 7200,
    },
    avatar_url: 'https://example.com/avatar.jpg',
    bio: 'A learner',
    location: 'NYC',
    timezone: 'America/New_York',
    ...overrides,
  };
}

describe('GetLearnWorldsUsersAction', () => {
  let action: GetLearnWorldsUsersAction;
  let contextUser: UserInfo;

  beforeEach(() => {
    action = new GetLearnWorldsUsersAction();
    contextUser = createMockContextUser();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GetUsers() typed method', () => {
    it('should return mapped users and summary on happy path', async () => {
      const rawUser = createRawApiUser();
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([rawUser] as never);

      const result = await action.GetUsers({ CompanyID: 'comp-1' }, contextUser);

      expect(result.TotalCount).toBe(1);
      expect(result.Users).toHaveLength(1);
      expect(result.Summary).toBeDefined();
      expect(result.Summary.totalUsers).toBe(1);
    });

    it('should correctly map all user fields including course_stats', async () => {
      const rawUser = createRawApiUser();
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([rawUser] as never);

      const result = await action.GetUsers({ CompanyID: 'comp-1' }, contextUser);
      const user: LearnWorldsUser = result.Users[0];

      expect(user.id).toBe('user-1');
      expect(user.email).toBe('alice@example.com');
      expect(user.username).toBe('alice');
      expect(user.firstName).toBe('Alice');
      expect(user.lastName).toBe('Smith');
      expect(user.fullName).toBe('Alice Smith');
      expect(user.status).toBe('active');
      expect(user.role).toBe('student');
      expect(user.createdAt).toBeInstanceOf(Date);
      expect(user.lastLoginAt).toBeInstanceOf(Date);
      expect(user.tags).toEqual(['beginner']);
      expect(user.customFields).toEqual({ company: 'Acme' });
      expect(user.totalCourses).toBe(5);
      expect(user.completedCourses).toBe(3);
      expect(user.inProgressCourses).toBe(2);
      expect(user.totalTimeSpent).toBe(7200);
      expect(user.avatarUrl).toBe('https://example.com/avatar.jpg');
      expect(user.bio).toBe('A learner');
      expect(user.location).toBe('NYC');
      expect(user.timezone).toBe('America/New_York');
    });

    it('should use _id fallback when id is missing', async () => {
      const rawUser = createRawApiUser({ id: undefined, _id: 'alt-user-id' });
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([rawUser] as never);

      const result = await action.GetUsers({ CompanyID: 'comp-1' }, contextUser);

      expect(result.Users[0].id).toBe('alt-user-id');
    });

    it('should default missing course_stats to zero', async () => {
      const rawUser = createRawApiUser({ course_stats: undefined });
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([rawUser] as never);

      const result = await action.GetUsers({ CompanyID: 'comp-1' }, contextUser);
      const user = result.Users[0];

      expect(user.totalCourses).toBe(0);
      expect(user.completedCourses).toBe(0);
      expect(user.inProgressCourses).toBe(0);
      expect(user.totalTimeSpent).toBe(0);
    });

    it('should compute summary role counts correctly', async () => {
      const users: LWApiUser[] = [
        createRawApiUser({ id: 'u1', email: 'a@test.com', role: 'student' }),
        createRawApiUser({ id: 'u2', email: 'b@test.com', role: 'student' }),
        createRawApiUser({ id: 'u3', email: 'c@test.com', role: 'instructor' }),
        createRawApiUser({ id: 'u4', email: 'd@test.com', role: 'admin' }),
      ];
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue(users as never);

      const result = await action.GetUsers({ CompanyID: 'comp-1' }, contextUser);

      expect(result.Summary.usersByRole).toEqual({
        student: 2,
        instructor: 1,
        admin: 1,
      });
    });

    it('should compute summary active/inactive/suspended counts', async () => {
      const users: LWApiUser[] = [
        createRawApiUser({ id: 'u1', email: 'a@test.com', status: 'active' }),
        createRawApiUser({ id: 'u2', email: 'b@test.com', status: 'active' }),
        createRawApiUser({ id: 'u3', email: 'c@test.com', status: 'inactive' }),
        createRawApiUser({ id: 'u4', email: 'd@test.com', status: 'suspended' }),
        createRawApiUser({ id: 'u5', email: 'e@test.com', status: 'blocked' }),
      ];
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue(users as never);

      const result = await action.GetUsers({ CompanyID: 'comp-1' }, contextUser);

      expect(result.Summary.activeUsers).toBe(2);
      expect(result.Summary.inactiveUsers).toBe(1);
      // 'blocked' maps to 'suspended' via mapUserStatus
      expect(result.Summary.suspendedUsers).toBe(2);
    });

    it('should compute averageCoursesPerUser correctly', async () => {
      const users: LWApiUser[] = [
        createRawApiUser({ id: 'u1', email: 'a@test.com', course_stats: { total: 10 } }),
        createRawApiUser({ id: 'u2', email: 'b@test.com', course_stats: { total: 6 } }),
      ];
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue(users as never);

      const result = await action.GetUsers({ CompanyID: 'comp-1' }, contextUser);

      expect(result.Summary.averageCoursesPerUser).toBe(8); // (10 + 6) / 2
    });

    it('should compute totalTimeSpent across all users', async () => {
      const users: LWApiUser[] = [
        createRawApiUser({ id: 'u1', email: 'a@test.com', course_stats: { total_time_spent: 1000 } }),
        createRawApiUser({ id: 'u2', email: 'b@test.com', course_stats: { total_time_spent: 2500 } }),
      ];
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue(users as never);

      const result = await action.GetUsers({ CompanyID: 'comp-1' }, contextUser);

      expect(result.Summary.totalTimeSpent).toBe(3500);
    });

    it('should rank mostActiveUsers by completedCourses descending, limited to 5', async () => {
      const users: LWApiUser[] = Array.from({ length: 7 }, (_, i) =>
        createRawApiUser({
          id: `u${i}`,
          email: `user${i}@test.com`,
          first_name: `User${i}`,
          last_name: 'Test',
          full_name: `User${i} Test`,
          course_stats: { total: 10, completed: (i + 1) * 2, in_progress: 1, total_time_spent: 100 },
        }),
      );
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue(users as never);

      const result = await action.GetUsers({ CompanyID: 'comp-1' }, contextUser);

      expect(result.Summary.mostActiveUsers).toHaveLength(5);
      // Most completed first
      expect(result.Summary.mostActiveUsers[0].completedCourses).toBe(14); // (6+1)*2 = 14
      expect(result.Summary.mostActiveUsers[0].name).toBe('User6 Test');
      // Verify descending order
      for (let i = 1; i < result.Summary.mostActiveUsers.length; i++) {
        const prev = result.Summary.mostActiveUsers[i - 1].completedCourses ?? 0;
        const curr = result.Summary.mostActiveUsers[i].completedCourses ?? 0;
        expect(prev).toBeGreaterThanOrEqual(curr);
      }
    });

    it('should exclude users with zero completedCourses from mostActiveUsers', async () => {
      const users: LWApiUser[] = [
        createRawApiUser({ id: 'u1', email: 'a@test.com', course_stats: { completed: 0 } }),
        createRawApiUser({ id: 'u2', email: 'b@test.com', course_stats: { completed: 5 } }),
      ];
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue(users as never);

      const result = await action.GetUsers({ CompanyID: 'comp-1' }, contextUser);

      expect(result.Summary.mostActiveUsers).toHaveLength(1);
      expect(result.Summary.mostActiveUsers[0].id).toBe('u2');
    });

    it('should find recentSignups within the last 30 days', async () => {
      // Fix "now" so the 30-day window is deterministic
      const fakeNow = new Date('2024-08-01T00:00:00Z');
      vi.useFakeTimers({ now: fakeNow });

      const recentDate = '2024-07-20T10:00:00Z'; // within 30 days of fakeNow
      const oldDate = '2024-01-01T10:00:00Z'; // outside 30 days
      const users: LWApiUser[] = [
        createRawApiUser({ id: 'recent-1', email: 'new@test.com', created: recentDate, first_name: 'New', full_name: 'New User' }),
        createRawApiUser({ id: 'old-1', email: 'old@test.com', created: oldDate, first_name: 'Old', full_name: 'Old User' }),
      ];
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue(users as never);

      const result = await action.GetUsers({ CompanyID: 'comp-1' }, contextUser);

      expect(result.Summary.recentSignups).toHaveLength(1);
      expect(result.Summary.recentSignups[0].id).toBe('recent-1');
      expect(result.Summary.recentSignups[0].name).toBe('New User');
      expect(result.Summary.recentSignups[0].signupDate).toBeInstanceOf(Date);

      vi.useRealTimers();
    });

    it('should limit recentSignups to 10 entries', async () => {
      const fakeNow = new Date('2024-08-01T00:00:00Z');
      vi.useFakeTimers({ now: fakeNow });

      const users: LWApiUser[] = Array.from({ length: 15 }, (_, i) =>
        createRawApiUser({
          id: `recent-${i}`,
          email: `user${i}@test.com`,
          full_name: `User ${i}`,
          created: `2024-07-${String(15 + i).padStart(2, '0')}T10:00:00Z`,
        }),
      );
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue(users as never);

      const result = await action.GetUsers({ CompanyID: 'comp-1' }, contextUser);

      expect(result.Summary.recentSignups.length).toBeLessThanOrEqual(10);

      vi.useRealTimers();
    });

    it('should handle an empty user list', async () => {
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([] as never);

      const result = await action.GetUsers({ CompanyID: 'comp-1' }, contextUser);

      expect(result.TotalCount).toBe(0);
      expect(result.Users).toEqual([]);
      expect(result.Summary.totalUsers).toBe(0);
      expect(result.Summary.activeUsers).toBe(0);
      expect(result.Summary.inactiveUsers).toBe(0);
      expect(result.Summary.suspendedUsers).toBe(0);
      expect(result.Summary.usersByRole).toEqual({});
      expect(result.Summary.averageCoursesPerUser).toBe(0);
      expect(result.Summary.totalTimeSpent).toBe(0);
      expect(result.Summary.mostActiveUsers).toEqual([]);
      expect(result.Summary.recentSignups).toEqual([]);
    });

    it('should propagate errors from the paginated request', async () => {
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockRejectedValue(new Error('Network failure'));

      await expect(action.GetUsers({ CompanyID: 'comp-1' }, contextUser)).rejects.toThrow('Network failure');
    });

    it('should construct fullName from first_name and last_name when full_name is missing', async () => {
      const rawUser = createRawApiUser({ full_name: undefined, first_name: 'Jane', last_name: 'Doe' });
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([rawUser] as never);

      const result = await action.GetUsers({ CompanyID: 'comp-1' }, contextUser);

      expect(result.Users[0].fullName).toBe('Jane Doe');
    });

    it('should default username to email when username is missing', async () => {
      const rawUser = createRawApiUser({ username: undefined, email: 'fallback@example.com' });
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([rawUser] as never);

      const result = await action.GetUsers({ CompanyID: 'comp-1' }, contextUser);

      expect(result.Users[0].username).toBe('fallback@example.com');
    });

    it('should default role to student when not specified', async () => {
      const rawUser = createRawApiUser({ role: undefined });
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([rawUser] as never);

      const result = await action.GetUsers({ CompanyID: 'comp-1' }, contextUser);

      expect(result.Users[0].role).toBe('student');
    });

    it('should default status to active when not specified', async () => {
      const rawUser = createRawApiUser({ status: undefined });
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([rawUser] as never);

      const result = await action.GetUsers({ CompanyID: 'comp-1' }, contextUser);

      expect(result.Users[0].status).toBe('active');
    });
  });

  describe('InternalRunAction()', () => {
    it('should return success when GetUsers succeeds', async () => {
      const mockUsers: LearnWorldsUser[] = [
        {
          id: 'user-1',
          email: 'alice@example.com',
          username: 'alice',
          firstName: 'Alice',
          lastName: 'Smith',
          fullName: 'Alice Smith',
          status: 'active',
          role: 'student',
          createdAt: new Date('2024-06-15T10:00:00Z'),
          totalCourses: 5,
          completedCourses: 3,
          inProgressCourses: 2,
          totalTimeSpent: 7200,
        },
      ];

      vi.spyOn(action, 'GetUsers').mockResolvedValue({
        Users: mockUsers,
        TotalCount: 1,
        Summary: {
          totalUsers: 1,
          activeUsers: 1,
          inactiveUsers: 0,
          suspendedUsers: 0,
          usersByRole: { student: 1 },
          averageCoursesPerUser: 5,
          totalTimeSpent: 7200,
          mostActiveUsers: [{ id: 'user-1', name: 'Alice Smith', completedCourses: 3 }],
          recentSignups: [],
        },
      });

      const runParams: RunActionParams = {
        Params: [
          { Name: 'CompanyID', Type: 'Input', Value: 'comp-1' },
          { Name: 'SearchText', Type: 'Input', Value: undefined },
          { Name: 'Role', Type: 'Input', Value: undefined },
          { Name: 'Status', Type: 'Input', Value: undefined },
          { Name: 'MaxResults', Type: 'Input', Value: undefined },
        ],
        ContextUser: contextUser,
      } as unknown as RunActionParams;

      const result = (await action['InternalRunAction'](runParams)) as ActionResultSimple;

      expect(result.Success).toBe(true);
      expect(result.ResultCode).toBe('SUCCESS');
      expect(result.Message).toContain('Successfully retrieved 1 users from LearnWorlds');
    });

    it('should return error result when GetUsers throws', async () => {
      vi.spyOn(action, 'GetUsers').mockRejectedValue(new Error('API connection failed'));

      const runParams: RunActionParams = {
        Params: [{ Name: 'CompanyID', Type: 'Input', Value: 'comp-1' }],
        ContextUser: contextUser,
      } as unknown as RunActionParams;

      const result = (await action['InternalRunAction'](runParams)) as ActionResultSimple;

      expect(result.Success).toBe(false);
      expect(result.ResultCode).toBe('ERROR');
      expect(result.Message).toContain('API connection failed');
    });

    it('should return error when ContextUser is missing', async () => {
      const runParams: RunActionParams = {
        Params: [{ Name: 'CompanyID', Type: 'Input', Value: 'comp-1' }],
        ContextUser: undefined,
      } as unknown as RunActionParams;

      const result = (await action['InternalRunAction'](runParams)) as ActionResultSimple;

      expect(result.Success).toBe(false);
      expect(result.ResultCode).toBe('ERROR');
      expect(result.Message).toContain('Context user is required');
    });

    it('should handle non-Error thrown values', async () => {
      vi.spyOn(action, 'GetUsers').mockRejectedValue('string error');

      const runParams: RunActionParams = {
        Params: [{ Name: 'CompanyID', Type: 'Input', Value: 'comp-1' }],
        ContextUser: contextUser,
      } as unknown as RunActionParams;

      const result = (await action['InternalRunAction'](runParams)) as ActionResultSimple;

      expect(result.Success).toBe(false);
      expect(result.ResultCode).toBe('ERROR');
      expect(result.Message).toContain('Unknown error occurred');
    });
  });
});
