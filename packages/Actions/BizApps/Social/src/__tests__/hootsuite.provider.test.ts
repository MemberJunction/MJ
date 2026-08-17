import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Per-action tests for the HootSuite provider.
 *
 * Boundary mocking: BaseOAuthAction is mocked (OAuth succeeds by default) and
 * axios is mocked so `axiosInstance.get/post/patch/delete` capture the exact
 * endpoint and payload each action sends to the HootSuite REST API.
 */

const http = vi.hoisted(() => {
  const instance = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    request: vi.fn(),
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
    defaults: { headers: { common: {} as Record<string, string> } },
  };
  const axiosDefault = {
    create: vi.fn(() => instance),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    request: vi.fn(),
    isAxiosError: vi.fn(() => false),
  };
  return { instance, axiosDefault };
});

vi.mock('axios', () => ({
  default: http.axiosDefault,
  AxiosError: class AxiosError extends Error {},
}));

vi.mock('@memberjunction/actions', () => {
  class BaseAction {}
  class BaseOAuthAction extends BaseAction {
    protected get oauthParams(): Array<{ Name: string; Type: string; Value: unknown }> {
      return [{ Name: 'CompanyIntegrationID', Type: 'Input', Value: null }];
    }
    protected async initializeOAuth(): Promise<boolean> {
      return true;
    }
    protected getAccessToken(): string | null {
      return 'test-access-token';
    }
    protected getRefreshToken(): string | null {
      return 'test-refresh-token';
    }
    protected getCustomAttribute(_attributeNumber: number): string | null {
      return null;
    }
    protected async setCustomAttribute(_attributeNumber: number, _value: string): Promise<void> {}
    protected isTokenExpired(): boolean {
      return false;
    }
    protected isAuthError(_error: unknown): boolean {
      return false;
    }
    protected async makeAuthenticatedRequest<T>(requestFn: (token: string) => Promise<T>): Promise<T> {
      return requestFn('test-access-token');
    }
    protected async updateStoredTokens(_a: string, _r?: string, _e?: number): Promise<void> {}
  }
  class OAuth2Manager {}
  return { BaseAction, BaseOAuthAction, OAuth2Manager };
});

vi.mock('@memberjunction/global', () => ({
  RegisterClass: () => (target: unknown) => target,
  UUIDsEqual: (a: string, b: string) => a === b,
}));

vi.mock('@memberjunction/core', () => ({
  UserInfo: class UserInfo {},
  Metadata: vi.fn(),
  LogStatus: vi.fn(),
  LogError: vi.fn(),
  RunView: vi.fn().mockImplementation(() => ({
    RunView: vi.fn().mockResolvedValue({ Success: true, Results: [] }),
  })),
}));

vi.mock('@memberjunction/core-entities', () => ({
  MJCompanyIntegrationEntity: class MJCompanyIntegrationEntity {},
  MJIntegrationEntity: class MJIntegrationEntity {},
}));

vi.mock('@memberjunction/actions-base', () => ({
  ActionParam: class ActionParam {},
}));

import { UserInfo } from '@memberjunction/core';
import type { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { HootSuiteBulkSchedulePostsAction } from '../providers/hootsuite/actions/bulk-schedule-posts.action';
import { HootSuiteCreateScheduledPostAction } from '../providers/hootsuite/actions/create-scheduled-post.action';
import { HootSuiteDeleteScheduledPostAction } from '../providers/hootsuite/actions/delete-scheduled-post.action';
import { HootSuiteGetAnalyticsAction } from '../providers/hootsuite/actions/get-analytics.action';
import { HootSuiteGetScheduledPostsAction } from '../providers/hootsuite/actions/get-scheduled-posts.action';
import { HootSuiteGetSocialProfilesAction } from '../providers/hootsuite/actions/get-social-profiles.action';
import { HootSuiteSearchPostsAction } from '../providers/hootsuite/actions/search-posts.action';
import { HootSuiteUpdateScheduledPostAction } from '../providers/hootsuite/actions/update-scheduled-post.action';

const contextUser = { ID: 'user-1', Name: 'Test User', Email: 'test@example.com' } as unknown as UserInfo;

type RunnableAction = { InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> };

function inputs(values: Record<string, unknown>, outputs: string[] = []): ActionParam[] {
  const params = Object.entries(values).map(
    ([Name, Value]) => ({ Name, Value, Type: 'Input' } as ActionParam),
  );
  for (const name of outputs) {
    params.push({ Name: name, Value: null, Type: 'Output' } as ActionParam);
  }
  return params;
}

async function run(action: object, params: ActionParam[]): Promise<ActionResultSimple> {
  const runParams = { Params: params, ContextUser: contextUser } as unknown as RunActionParams;
  return (action as RunnableAction).InternalRunAction(runParams);
}

function outParam(result: ActionResultSimple, name: string): unknown {
  return result.Params?.find((p) => p.Name === name)?.Value;
}

const hsPost = {
  id: 'hs-1',
  text: 'Scheduled hello',
  state: 'SCHEDULED',
  scheduledTime: '2999-01-01T00:00:00.000Z',
  socialProfileIds: ['p1'],
  createdTime: '2024-06-15T10:00:00Z',
  mediaIds: [] as string[],
  tags: [] as string[],
};

function notFoundError(): Error {
  return Object.assign(new Error('Request failed with status code 404'), { response: { status: 404 } });
}

beforeEach(() => {
  http.instance.get.mockReset();
  http.instance.post.mockReset();
  http.instance.patch.mockReset();
  http.instance.delete.mockReset();
});

// ─── HootSuiteCreateScheduledPostAction ─────────────────────────────────────

describe('HootSuiteCreateScheduledPostAction', () => {
  let action: HootSuiteCreateScheduledPostAction;

  beforeEach(() => {
    action = new HootSuiteCreateScheduledPostAction();
  });

  it('should fail with ERROR when OAuth initialization fails', async () => {
    vi.spyOn(action as never, 'initializeOAuth').mockResolvedValue(false as never);
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1', Content: 'Hi' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('ERROR');
    expect(result.Message).toBe('Failed to create scheduled post: Failed to initialize OAuth connection');
  });

  it('should fail when Content is missing', async () => {
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('ERROR');
    expect(result.Message).toBe('Failed to create scheduled post: Content is required');
  });

  it('should fail when no profiles exist and none are specified', async () => {
    http.instance.get.mockResolvedValue({ data: { data: [] }, headers: {} });
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1', Content: 'Hi' }));
    expect(result.Success).toBe(false);
    expect(result.Message).toBe('Failed to create scheduled post: No social profiles found. Please specify ProfileIDs.');
  });

  it('should POST /messages with the exact scheduling payload', async () => {
    http.instance.post.mockResolvedValue({ data: hsPost, headers: {} });

    const result = await run(
      action,
      inputs(
        {
          CompanyIntegrationID: 'ci-1',
          Content: 'Scheduled hello',
          ProfileIDs: ['p1'],
          ScheduledTime: '2999-01-01T00:00:00Z',
          Tags: ['launch'],
        },
        ['CreatedPost', 'PostID'],
      ),
    );

    expect(http.instance.post).toHaveBeenCalledWith('/messages', {
      text: 'Scheduled hello',
      socialProfileIds: ['p1'],
      scheduledTime: new Date('2999-01-01T00:00:00Z').toISOString(),
      mediaIds: undefined,
      tags: ['launch'],
      location: undefined,
    });
    expect(result.Success).toBe(true);
    expect(result.ResultCode).toBe('SUCCESS');
    expect(result.Message).toBe('Successfully created scheduled post (ID: hs-1)');
    expect(outParam(result, 'PostID')).toBe('hs-1');
    const post = outParam(result, 'CreatedPost') as { id: string; platform: string; scheduledFor?: Date };
    expect(post.platform).toBe('HootSuite');
    expect(post.scheduledFor?.toISOString()).toBe('2999-01-01T00:00:00.000Z');
  });
});

// ─── HootSuiteDeleteScheduledPostAction ─────────────────────────────────────

describe('HootSuiteDeleteScheduledPostAction', () => {
  let action: HootSuiteDeleteScheduledPostAction;

  beforeEach(() => {
    action = new HootSuiteDeleteScheduledPostAction();
  });

  it('should fail when PostID is missing', async () => {
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1', ConfirmDeletion: true }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('ERROR');
    expect(result.Message).toBe('Failed to delete scheduled post: PostID is required');
  });

  it('should require explicit confirmation before deleting', async () => {
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1', PostID: 'hs-1' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('CONFIRMATION_REQUIRED');
    expect(result.Message).toBe('Deletion not confirmed. Set ConfirmDeletion to true to proceed.');
  });

  it('should return POST_NOT_FOUND when the post does not exist', async () => {
    http.instance.get.mockRejectedValue(notFoundError());
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1', PostID: 'hs-404', ConfirmDeletion: true }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('POST_NOT_FOUND');
    expect(result.Message).toBe('Post with ID hs-404 not found');
  });

  it('should refuse to delete published posts', async () => {
    http.instance.get.mockResolvedValue({ data: { ...hsPost, state: 'PUBLISHED' }, headers: {} });
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1', PostID: 'hs-1', ConfirmDeletion: true }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('CANNOT_DELETE_PUBLISHED');
    expect(result.Message).toBe('Cannot delete published posts. Only scheduled, draft, or failed posts can be deleted.');
  });

  it('should DELETE /messages/{id} and verify the deletion', async () => {
    let getCalls = 0;
    http.instance.get.mockImplementation(() => {
      getCalls += 1;
      if (getCalls === 1) return Promise.resolve({ data: hsPost, headers: {} });
      return Promise.reject(notFoundError()); // verification 404 = confirmed deleted
    });
    http.instance.delete.mockResolvedValue({ data: {}, headers: {} });

    const result = await run(
      action,
      inputs({ CompanyIntegrationID: 'ci-1', PostID: 'hs-1', ConfirmDeletion: true }, ['DeletedPostInfo', 'DeletionVerified']),
    );

    expect(http.instance.delete).toHaveBeenCalledWith('/messages/hs-1');
    expect(result.Success).toBe(true);
    expect(result.ResultCode).toBe('SUCCESS');
    expect(result.Message).toBe('Successfully deleted post hs-1');
    expect(outParam(result, 'DeletionVerified')).toBe(true);
    const info = outParam(result, 'DeletedPostInfo') as { id: string; state: string };
    expect(info.id).toBe('hs-1');
    expect(info.state).toBe('SCHEDULED');
  });
});

// ─── HootSuiteGetAnalyticsAction ────────────────────────────────────────────

describe('HootSuiteGetAnalyticsAction', () => {
  it('should fail with ERROR when OAuth initialization fails', async () => {
    const action = new HootSuiteGetAnalyticsAction();
    vi.spyOn(action as never, 'initializeOAuth').mockResolvedValue(false as never);
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('ERROR');
    expect(result.Message).toBe('Failed to get analytics: Failed to initialize OAuth connection');
  });
});

// ─── HootSuiteGetScheduledPostsAction ───────────────────────────────────────

describe('HootSuiteGetScheduledPostsAction', () => {
  let action: HootSuiteGetScheduledPostsAction;

  beforeEach(() => {
    action = new HootSuiteGetScheduledPostsAction();
  });

  it('should fail with ERROR when OAuth initialization fails', async () => {
    vi.spyOn(action as never, 'initializeOAuth').mockResolvedValue(false as never);
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1' }));
    expect(result.Message).toBe('Failed to get scheduled posts: Failed to initialize OAuth connection');
  });

  it('should GET /messages filtered by SCHEDULED state', async () => {
    http.instance.get.mockResolvedValue({ data: { data: [hsPost] }, headers: {} });

    const result = await run(
      action,
      inputs({ CompanyIntegrationID: 'ci-1', ProfileID: 'p1', Limit: 10 }, ['ScheduledPosts', 'Summary']),
    );

    expect(http.instance.get).toHaveBeenCalledWith('/messages', {
      params: expect.objectContaining({ state: 'SCHEDULED', socialProfileIds: 'p1', limit: 10, maxResults: 10 }),
    });
    expect(result.Success).toBe(true);
    expect(result.ResultCode).toBe('SUCCESS');
    expect(result.Message).toBe('Retrieved 1 scheduled posts');
    const posts = outParam(result, 'ScheduledPosts') as Array<{ id: string; platform: string }>;
    expect(posts[0].id).toBe('hs-1');
    expect(posts[0].platform).toBe('HootSuite');
  });
});

// ─── HootSuiteGetSocialProfilesAction ───────────────────────────────────────

describe('HootSuiteGetSocialProfilesAction', () => {
  let action: HootSuiteGetSocialProfilesAction;

  beforeEach(() => {
    action = new HootSuiteGetSocialProfilesAction();
  });

  it('should fail with ERROR when OAuth initialization fails', async () => {
    vi.spyOn(action as never, 'initializeOAuth').mockResolvedValue(false as never);
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1' }));
    expect(result.Message).toBe('Failed to get social profiles: Failed to initialize OAuth connection');
  });

  it('should GET /socialProfiles and enrich the results', async () => {
    http.instance.get.mockImplementation((url: string) => {
      if (url === '/socialProfiles') {
        return Promise.resolve({
          data: {
            data: [
              {
                id: 'p1',
                displayName: 'MJ Twitter',
                socialNetworkId: 'TWITTER',
                socialNetworkUserId: 'u1',
                avatarUrl: 'https://a.png',
                type: 'PROFILE',
                ownerId: 'o1',
              },
            ],
          },
          headers: {},
        });
      }
      return Promise.reject(new Error(`Unmocked GET ${url}`));
    });

    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1' }, ['Profiles', 'Summary']));

    expect(http.instance.get).toHaveBeenCalledWith('/socialProfiles');
    expect(result.Success).toBe(true);
    expect(result.ResultCode).toBe('SUCCESS');
    expect(result.Message).toBe('Retrieved 1 social profiles');
    const profiles = outParam(result, 'Profiles') as Array<{ id: string; displayName: string }>;
    expect(profiles[0].id).toBe('p1');
  });
});

// ─── HootSuiteSearchPostsAction ─────────────────────────────────────────────

describe('HootSuiteSearchPostsAction', () => {
  it('should fail with ERROR when OAuth initialization fails', async () => {
    const action = new HootSuiteSearchPostsAction();
    vi.spyOn(action as never, 'initializeOAuth').mockResolvedValue(false as never);
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1', Query: 'x' }));
    expect(result.Success).toBe(false);
    expect(result.Message).toBe('Failed to search posts: Failed to initialize OAuth connection');
  });
});

// ─── HootSuiteUpdateScheduledPostAction ─────────────────────────────────────

describe('HootSuiteUpdateScheduledPostAction', () => {
  let action: HootSuiteUpdateScheduledPostAction;

  beforeEach(() => {
    action = new HootSuiteUpdateScheduledPostAction();
  });

  it('should fail when PostID is missing', async () => {
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1', Content: 'New' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('ERROR');
    expect(result.Message).toBe('Failed to update scheduled post: PostID is required');
  });

  it('should refuse to update a published post', async () => {
    http.instance.get.mockResolvedValue({ data: { ...hsPost, state: 'PUBLISHED' }, headers: {} });
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1', PostID: 'hs-1', Content: 'New' }));
    expect(result.Success).toBe(false);
    expect(result.Message).toBe(
      'Failed to update scheduled post: Cannot update post in PUBLISHED state. Only SCHEDULED and DRAFT posts can be updated.',
    );
  });

  it('should return NO_CHANGES when no update fields are provided', async () => {
    http.instance.get.mockResolvedValue({ data: hsPost, headers: {} });
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1', PostID: 'hs-1' }));
    expect(result.Success).toBe(true);
    expect(result.ResultCode).toBe('NO_CHANGES');
    expect(result.Message).toBe('No updates were provided');
    expect(http.instance.patch).not.toHaveBeenCalled();
  });

  it('should PATCH /messages/{id} with only the changed fields', async () => {
    http.instance.get.mockResolvedValue({ data: hsPost, headers: {} });
    http.instance.patch.mockResolvedValue({ data: { ...hsPost, text: 'Updated text' }, headers: {} });

    const result = await run(
      action,
      inputs({ CompanyIntegrationID: 'ci-1', PostID: 'hs-1', Content: 'Updated text' }, ['UpdatedPost', 'ChangesSummary']),
    );

    expect(http.instance.patch).toHaveBeenCalledWith('/messages/hs-1', { text: 'Updated text' });
    expect(result.Success).toBe(true);
    expect(result.ResultCode).toBe('SUCCESS');
    expect(result.Message).toBe('Successfully updated scheduled post (ID: hs-1)');
    const summary = outParam(result, 'ChangesSummary') as { fieldsUpdated: string[] };
    expect(summary.fieldsUpdated).toEqual(['text']);
  });
});

// ─── HootSuiteBulkSchedulePostsAction ───────────────────────────────────────

describe('HootSuiteBulkSchedulePostsAction', () => {
  let action: HootSuiteBulkSchedulePostsAction;

  beforeEach(() => {
    action = new HootSuiteBulkSchedulePostsAction();
  });

  it('should fail with ERROR when OAuth initialization fails', async () => {
    vi.spyOn(action as never, 'initializeOAuth').mockResolvedValue(false as never);
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1', Posts: [{ content: 'x' }] }));
    expect(result.Success).toBe(false);
    expect(result.Message).toBe('Failed to bulk schedule posts: Failed to initialize OAuth connection');
  });

  it('should fail when the Posts array is missing or empty', async () => {
    const missing = await run(action, inputs({ CompanyIntegrationID: 'ci-1' }));
    expect(missing.Success).toBe(false);
    expect(missing.Message).toBe('Failed to bulk schedule posts: Posts array is required and must not be empty');

    const empty = await run(action, inputs({ CompanyIntegrationID: 'ci-1', Posts: [] }));
    expect(empty.Success).toBe(false);
    expect(empty.Message).toBe('Failed to bulk schedule posts: Posts array is required and must not be empty');
  });

  it('should fail when no default profiles exist and none are specified', async () => {
    http.instance.get.mockResolvedValue({ data: { data: [] }, headers: {} });
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1', Posts: [{ content: 'x' }] }));
    expect(result.Success).toBe(false);
    expect(result.Message).toBe('Failed to bulk schedule posts: No social profiles found. Please specify DefaultProfileIDs.');
  });
});
