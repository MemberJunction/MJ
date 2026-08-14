import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Per-action tests for the LinkedIn provider.
 *
 * Boundary mocking: BaseOAuthAction is mocked (OAuth succeeds by default) and
 * axios is mocked so `axiosInstance.get/post` capture the exact endpoint and
 * payload each action sends to the LinkedIn REST API.
 * Base-class behaviors (normalizeAnalytics, handleLinkedInError, rate-limit
 * parsing) are covered once in social.test.ts.
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
import { LinkedInCreateArticleAction } from '../providers/linkedin/actions/create-article.action';
import { LinkedInCreatePostAction } from '../providers/linkedin/actions/create-post.action';
import { LinkedInGetFollowersAction } from '../providers/linkedin/actions/get-followers.action';
import { LinkedInGetOrganizationPostsAction } from '../providers/linkedin/actions/get-organization-posts.action';
import { LinkedInGetPersonalPostsAction } from '../providers/linkedin/actions/get-personal-posts.action';
import { LinkedInGetPostAnalyticsAction } from '../providers/linkedin/actions/get-post-analytics.action';
import { LinkedInSchedulePostAction } from '../providers/linkedin/actions/schedule-post.action';
import { LinkedInSearchPostsAction } from '../providers/linkedin/actions/search-posts.action';

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

function makeShare(id: string, authorUrn: string, text: string): Record<string, unknown> {
  return {
    id,
    author: authorUrn,
    created: { actor: authorUrn, time: 1718444400000 },
    firstPublishedAt: 1718444400000,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': { shareCommentary: { text }, shareMediaCategory: 'NONE' },
    },
    visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
  };
}

function mockGetByUrl(routes: Record<string, unknown>): void {
  http.instance.get.mockImplementation((url: string) => {
    for (const [prefix, data] of Object.entries(routes)) {
      if (url.startsWith(prefix)) {
        return Promise.resolve({ data, headers: {} });
      }
    }
    return Promise.reject(new Error(`Unmocked GET ${url}`));
  });
}

beforeEach(() => {
  http.instance.get.mockReset();
  http.instance.post.mockReset();
});

// ─── LinkedInCreatePostAction ───────────────────────────────────────────────

describe('LinkedInCreatePostAction', () => {
  let action: LinkedInCreatePostAction;

  beforeEach(() => {
    action = new LinkedInCreatePostAction();
  });

  it('should fail with ERROR when OAuth initialization fails', async () => {
    vi.spyOn(action as never, 'initializeOAuth').mockResolvedValue(false as never);
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1', Content: 'Hi' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('ERROR');
    expect(result.Message).toBe('Failed to create LinkedIn post: Failed to initialize OAuth connection');
  });

  it('should fail when Content is missing', async () => {
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('ERROR');
    expect(result.Message).toBe('Failed to create LinkedIn post: Content is required');
  });

  it('should fail for organization posts when no admin organizations exist', async () => {
    mockGetByUrl({ '/organizationalEntityAcls': { elements: [] } });
    const result = await run(
      action,
      inputs({ CompanyIntegrationID: 'ci-1', Content: 'Hi', AuthorType: 'organization' }),
    );
    expect(result.Success).toBe(false);
    expect(result.Message).toBe('Failed to create LinkedIn post: No organizations found. Please specify OrganizationID.');
  });

  it('should POST /ugcPosts with the exact UGC share payload for personal posts', async () => {
    const authorUrn = 'urn:li:person:me-1';
    mockGetByUrl({
      '/me': { id: 'me-1' },
      '/ugcPosts': { elements: [makeShare('share-1', authorUrn, 'Hello LinkedIn')] },
    });
    http.instance.post.mockResolvedValue({ data: { id: 'share-1' }, headers: {} });

    const result = await run(
      action,
      inputs({ CompanyIntegrationID: 'ci-1', Content: 'Hello LinkedIn' }, ['CreatedPost', 'PostID']),
    );

    expect(http.instance.post).toHaveBeenCalledWith('/ugcPosts', {
      author: authorUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: 'Hello LinkedIn' },
          shareMediaCategory: 'NONE',
          media: undefined,
        },
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
      distribution: { linkedInDistributionTarget: { visibleToGuest: true } },
    });
    expect(result.Success).toBe(true);
    expect(result.ResultCode).toBe('SUCCESS');
    expect(result.Message).toBe('Successfully created LinkedIn post (ID: share-1)');
    expect(outParam(result, 'PostID')).toBe('share-1');
    const post = outParam(result, 'CreatedPost') as { id: string; platform: string; content: string };
    expect(post.platform).toBe('LinkedIn');
    expect(post.content).toBe('Hello LinkedIn');
  });

  it('should use the organization URN when OrganizationID is provided', async () => {
    const orgUrn = 'urn:li:organization:987';
    mockGetByUrl({ '/ugcPosts': { elements: [makeShare('share-2', orgUrn, 'Org post')] } });
    http.instance.post.mockResolvedValue({ data: { id: 'share-2' }, headers: {} });

    const result = await run(
      action,
      inputs({ CompanyIntegrationID: 'ci-1', Content: 'Org post', AuthorType: 'organization', OrganizationID: '987' }),
    );

    const [, payload] = http.instance.post.mock.calls[0] as [string, { author: string }];
    expect(payload.author).toBe(orgUrn);
    expect(result.Success).toBe(true);
  });
});

// ─── LinkedInCreateArticleAction ────────────────────────────────────────────

describe('LinkedInCreateArticleAction', () => {
  let action: LinkedInCreateArticleAction;

  beforeEach(() => {
    action = new LinkedInCreateArticleAction();
  });

  it('should fail when Title is missing', async () => {
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1', Content: 'Body' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('ERROR');
    expect(result.Message).toBe('Failed to create LinkedIn article: Title is required');
  });

  it('should fail when Content is missing', async () => {
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1', Title: 'My Article' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('ERROR');
    expect(result.Message).toBe('Failed to create LinkedIn article: Content is required');
  });

  it('should fail for organization articles when no admin organizations exist', async () => {
    mockGetByUrl({ '/organizationalEntityAcls': { elements: [] } });
    const result = await run(
      action,
      inputs({ CompanyIntegrationID: 'ci-1', Title: 'T', Content: 'C', AuthorType: 'organization' }),
    );
    expect(result.Success).toBe(false);
    expect(result.Message).toBe('Failed to create LinkedIn article: No organizations found. Please specify OrganizationID.');
  });
});

// ─── LinkedInGetFollowersAction ─────────────────────────────────────────────

describe('LinkedInGetFollowersAction', () => {
  let action: LinkedInGetFollowersAction;

  beforeEach(() => {
    action = new LinkedInGetFollowersAction();
  });

  it('should fail with ERROR when OAuth initialization fails', async () => {
    vi.spyOn(action as never, 'initializeOAuth').mockResolvedValue(false as never);
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('ERROR');
    expect(result.Message).toBe('Failed to get followers: Failed to initialize OAuth connection');
  });

  it('should fail for organizations when no admin organizations exist', async () => {
    mockGetByUrl({ '/organizationalEntityAcls': { elements: [] } });
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1' }));
    expect(result.Success).toBe(false);
    expect(result.Message).toBe('Failed to get followers: No organizations found. Please specify OrganizationID.');
  });
});

// ─── LinkedInGetOrganizationPostsAction ─────────────────────────────────────

describe('LinkedInGetOrganizationPostsAction', () => {
  let action: LinkedInGetOrganizationPostsAction;

  beforeEach(() => {
    action = new LinkedInGetOrganizationPostsAction();
  });

  it('should fail when no admin organizations exist and none specified', async () => {
    mockGetByUrl({ '/organizationalEntityAcls': { elements: [] } });
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('ERROR');
    expect(result.Message).toBe('Failed to get organization posts: No organizations found. Please specify OrganizationID.');
  });

  it('should GET /ugcPosts with the organization author filter', async () => {
    const orgUrn = 'urn:li:organization:42';
    mockGetByUrl({ '/ugcPosts': { elements: [makeShare('s-1', orgUrn, 'Post A')] } });

    const result = await run(
      action,
      inputs({ CompanyIntegrationID: 'ci-1', OrganizationID: '42', Count: 10 }, ['Posts', 'TotalCount']),
    );

    expect(http.instance.get).toHaveBeenCalledWith('/ugcPosts', {
      params: { q: 'authors', authors: `List(${orgUrn})`, count: 10, start: 0 },
    });
    expect(result.Success).toBe(true);
    expect(result.Message).toBe('Successfully retrieved 1 organization posts');
    expect(outParam(result, 'TotalCount')).toBe(1);
  });
});

// ─── LinkedInGetPersonalPostsAction ─────────────────────────────────────────

describe('LinkedInGetPersonalPostsAction', () => {
  let action: LinkedInGetPersonalPostsAction;

  beforeEach(() => {
    action = new LinkedInGetPersonalPostsAction();
  });

  it('should fail with ERROR when OAuth initialization fails', async () => {
    vi.spyOn(action as never, 'initializeOAuth').mockResolvedValue(false as never);
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1' }));
    expect(result.Success).toBe(false);
    expect(result.Message).toBe('Failed to get personal posts: Failed to initialize OAuth connection');
  });

  it('should resolve the personal URN and GET /ugcPosts for it', async () => {
    const meUrn = 'urn:li:person:me-1';
    mockGetByUrl({
      '/me': { id: 'me-1' },
      '/ugcPosts': { elements: [makeShare('s-9', meUrn, 'Mine')] },
    });

    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1' }, ['Posts', 'TotalCount']));

    expect(http.instance.get).toHaveBeenCalledWith('/ugcPosts', {
      params: { q: 'authors', authors: `List(${meUrn})`, count: 50, start: 0 },
    });
    expect(result.Success).toBe(true);
    expect(result.Message).toBe('Successfully retrieved 1 personal posts');
  });
});

// ─── LinkedInGetPostAnalyticsAction ─────────────────────────────────────────

describe('LinkedInGetPostAnalyticsAction', () => {
  let action: LinkedInGetPostAnalyticsAction;

  beforeEach(() => {
    action = new LinkedInGetPostAnalyticsAction();
  });

  it('should fail when PostID is missing', async () => {
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('ERROR');
    expect(result.Message).toBe('Failed to get post analytics: PostID is required');
  });

  it('should GET /organizationalEntityShareStatistics with the share filter', async () => {
    const orgUrn = 'urn:li:organization:42';
    mockGetByUrl({
      '/organizationalEntityShareStatistics': {
        elements: [
          {
            totalShareStatistics: {
              impressionCount: 500,
              clickCount: 20,
              likeCount: 30,
              commentCount: 5,
              shareCount: 2,
              uniqueImpressionsCount: 400,
            },
          },
        ],
      },
    });

    const result = await run(
      action,
      inputs({ CompanyIntegrationID: 'ci-1', PostID: 'share-1', OrganizationID: '42' }, ['Analytics', 'RawAnalytics']),
    );

    expect(http.instance.get).toHaveBeenCalledWith('/organizationalEntityShareStatistics', {
      params: { q: 'organizationalEntity', organizationalEntity: orgUrn, shares: 'List(share-1)' },
    });
    expect(result.Success).toBe(true);
    expect(result.Message).toBe('Successfully retrieved analytics for post share-1');
    const analytics = outParam(result, 'Analytics') as { impressions: number; likes: number; reach: number };
    expect(analytics.impressions).toBe(500);
    expect(analytics.likes).toBe(30);
    expect(analytics.reach).toBe(400);
  });
});

// ─── LinkedInSchedulePostAction ─────────────────────────────────────────────

describe('LinkedInSchedulePostAction', () => {
  let action: LinkedInSchedulePostAction;

  beforeEach(() => {
    action = new LinkedInSchedulePostAction();
  });

  it('should fail when Content is missing', async () => {
    const result = await run(
      action,
      inputs({ CompanyIntegrationID: 'ci-1', ScheduledTime: '2999-01-01T00:00:00Z' }),
    );
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('ERROR');
    expect(result.Message).toBe('Failed to schedule LinkedIn post: Content is required');
  });

  it('should fail when ScheduledTime is missing', async () => {
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1', Content: 'Later' }));
    expect(result.Success).toBe(false);
    expect(result.Message).toBe('Failed to schedule LinkedIn post: ScheduledTime is required');
  });

  it('should fail when ScheduledTime is in the past', async () => {
    const result = await run(
      action,
      inputs({ CompanyIntegrationID: 'ci-1', Content: 'Later', ScheduledTime: '2020-01-01T00:00:00Z' }),
    );
    expect(result.Success).toBe(false);
    expect(result.Message).toBe('Failed to schedule LinkedIn post: ScheduledTime must be in the future');
  });
});

// ─── LinkedInSearchPostsAction ──────────────────────────────────────────────

describe('LinkedInSearchPostsAction', () => {
  let action: LinkedInSearchPostsAction;

  beforeEach(() => {
    action = new LinkedInSearchPostsAction();
  });

  it('should fail with ERROR when OAuth initialization fails', async () => {
    vi.spyOn(action as never, 'initializeOAuth').mockResolvedValue(false as never);
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1', Query: 'x' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('ERROR');
    expect(result.Message).toBe('Failed to search posts: Failed to initialize OAuth connection');
  });
});
