import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Per-action tests for the Facebook provider.
 *
 * Facebook actions return structured validation results (no thrown errors for
 * missing params), so validation paths assert the exact ResultCode + Message
 * pairs. The HTTP boundary is the axios module mock: `axiosInstance.*` calls
 * (via axios.create) and direct `axios.post/get` calls (page-token flows) are
 * both captured.
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
    protected handleOAuthError(_error: unknown): { Success: boolean; Message: string; ResultCode: string } {
      return { Success: false, Message: 'Authentication failed. Token may be expired or revoked.', ResultCode: 'INVALID_TOKEN' };
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
import { FacebookBoostPostAction } from '../providers/facebook/actions/boost-post.action';
import { FacebookCreateAlbumAction } from '../providers/facebook/actions/create-album.action';
import { FacebookCreatePostAction } from '../providers/facebook/actions/create-post.action';
import { FacebookGetPageInsightsAction } from '../providers/facebook/actions/get-page-insights.action';
import { FacebookGetPagePostsAction } from '../providers/facebook/actions/get-page-posts.action';
import { FacebookGetPostInsightsAction } from '../providers/facebook/actions/get-post-insights.action';
import { FacebookRespondToCommentsAction } from '../providers/facebook/actions/respond-to-comments.action';
import { FacebookSchedulePostAction } from '../providers/facebook/actions/schedule-post.action';
import { FacebookSearchPostsAction } from '../providers/facebook/actions/search-posts.action';

const contextUser = { ID: 'user-1', Name: 'Test User', Email: 'test@example.com' } as unknown as UserInfo;
const API = 'https://graph.facebook.com/v18.0';

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

const pageList = { data: [{ id: 'page-1', name: 'MJ Page', access_token: 'page-token-1', category: 'Software' }] };

const fbPost = {
  id: 'page-1_post-1',
  message: 'Hello Facebook',
  created_time: '2024-06-15T10:00:00+0000',
  from: { id: 'page-1', name: 'MJ Page' },
  permalink_url: 'https://facebook.com/page-1/posts/post-1',
};

beforeEach(() => {
  http.instance.get.mockReset();
  http.instance.post.mockReset();
  http.axiosDefault.get.mockReset();
  http.axiosDefault.post.mockReset();
});

// ─── FacebookCreatePostAction ───────────────────────────────────────────────

describe('FacebookCreatePostAction', () => {
  let action: FacebookCreatePostAction;

  beforeEach(() => {
    action = new FacebookCreatePostAction();
  });

  it('should fail with INVALID_TOKEN when CompanyIntegrationID is missing', async () => {
    const result = await run(action, inputs({ PageID: 'page-1', Content: 'Hi' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('INVALID_TOKEN');
    expect(result.Message).toBe('CompanyIntegrationID is required');
  });

  it('should fail with MISSING_REQUIRED_PARAM when PageID is missing', async () => {
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1', Content: 'Hi' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('MISSING_REQUIRED_PARAM');
    expect(result.Message).toBe('PageID is required');
  });

  it('should fail with INVALID_TOKEN when OAuth initialization fails', async () => {
    vi.spyOn(action as never, 'initializeOAuth').mockResolvedValue(false as never);
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1', PageID: 'page-1', Content: 'Hi' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('INVALID_TOKEN');
    expect(result.Message).toBe('Failed to initialize Facebook OAuth connection');
  });

  it('should fail with MISSING_CONTENT when no content, link, or media is provided', async () => {
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1', PageID: 'page-1' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('MISSING_CONTENT');
    expect(result.Message).toBe('At least one of Content, Link, or MediaFiles is required');
  });

  it('should reject scheduled times less than 10 minutes out', async () => {
    const tooSoon = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const result = await run(
      action,
      inputs({ CompanyIntegrationID: 'ci-1', PageID: 'page-1', Content: 'Hi', ScheduledTime: tooSoon }),
    );
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('INVALID_SCHEDULE_TIME');
    expect(result.Message).toBe('Scheduled time must be at least 10 minutes in the future');
  });

  it('should POST to /{pageId}/feed with the page access token on happy path', async () => {
    http.instance.get.mockImplementation((url: string) => {
      if (url === '/me/accounts') return Promise.resolve({ data: pageList, headers: {} });
      if (url === `/${fbPost.id}`) return Promise.resolve({ data: fbPost, headers: {} });
      return Promise.reject(new Error(`Unmocked GET ${url}`));
    });
    http.axiosDefault.post.mockResolvedValue({ data: { id: fbPost.id }, headers: {} });

    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1', PageID: 'page-1', Content: 'Hello Facebook' }));

    expect(http.axiosDefault.post).toHaveBeenCalledWith(
      `${API}/page-1/feed`,
      { message: 'Hello Facebook', published: true },
      { params: { access_token: 'page-token-1' } },
    );
    expect(result.Success).toBe(true);
    expect(result.ResultCode).toBe('SUCCESS');
    expect(result.Message).toBe('Post created successfully');
  });
});

// ─── FacebookSchedulePostAction ─────────────────────────────────────────────

describe('FacebookSchedulePostAction', () => {
  let action: FacebookSchedulePostAction;

  beforeEach(() => {
    action = new FacebookSchedulePostAction();
  });

  it('should fail with MISSING_REQUIRED_PARAM when PageID is missing', async () => {
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1', ScheduledTime: '2999-01-01T00:00:00Z' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('MISSING_REQUIRED_PARAM');
    expect(result.Message).toBe('PageID is required');
  });

  it('should fail with MISSING_REQUIRED_PARAM when ScheduledTime is missing', async () => {
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1', PageID: 'page-1' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('MISSING_REQUIRED_PARAM');
    expect(result.Message).toBe('ScheduledTime is required');
  });

  it('should reject an unparseable ScheduledTime', async () => {
    const result = await run(
      action,
      inputs({ CompanyIntegrationID: 'ci-1', PageID: 'page-1', ScheduledTime: 'not-a-date' }),
    );
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('INVALID_SCHEDULE_TIME');
    expect(result.Message).toBe('Invalid scheduled time format. Use ISO 8601 format.');
  });

  it('should reject scheduled times more than 6 months out', async () => {
    const tooFar = new Date(Date.now() + 200 * 24 * 60 * 60 * 1000).toISOString();
    const result = await run(
      action,
      inputs({ CompanyIntegrationID: 'ci-1', PageID: 'page-1', ScheduledTime: tooFar }),
    );
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('INVALID_SCHEDULE_TIME');
    expect(result.Message).toBe('Scheduled time cannot be more than 6 months in the future');
  });

  it('should fail with MISSING_CONTENT when no content is provided for a valid schedule', async () => {
    const valid = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const result = await run(
      action,
      inputs({ CompanyIntegrationID: 'ci-1', PageID: 'page-1', ScheduledTime: valid }),
    );
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('MISSING_CONTENT');
    expect(result.Message).toBe('At least one of Content, Link, or MediaFiles is required');
  });
});

// ─── FacebookBoostPostAction ────────────────────────────────────────────────

describe('FacebookBoostPostAction', () => {
  let action: FacebookBoostPostAction;

  beforeEach(() => {
    action = new FacebookBoostPostAction();
  });

  it('should fail with INVALID_TOKEN when CompanyIntegrationID is missing', async () => {
    const result = await run(action, inputs({ PostID: 'p', AdAccountID: 'a', Budget: 100 }));
    expect(result.ResultCode).toBe('INVALID_TOKEN');
    expect(result.Message).toBe('CompanyIntegrationID is required');
  });

  it('should fail with MISSING_REQUIRED_PARAM when PostID is missing', async () => {
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1', AdAccountID: 'a', Budget: 100 }));
    expect(result.ResultCode).toBe('MISSING_REQUIRED_PARAM');
    expect(result.Message).toBe('PostID is required');
  });

  it('should fail with MISSING_REQUIRED_PARAM when AdAccountID is missing', async () => {
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1', PostID: 'p', Budget: 100 }));
    expect(result.ResultCode).toBe('MISSING_REQUIRED_PARAM');
    expect(result.Message).toBe('AdAccountID is required');
  });

  it('should fail with INVALID_BUDGET when Budget is missing or non-positive', async () => {
    const missing = await run(action, inputs({ CompanyIntegrationID: 'ci-1', PostID: 'p', AdAccountID: 'a' }));
    expect(missing.ResultCode).toBe('INVALID_BUDGET');
    expect(missing.Message).toBe('Budget must be a positive number');

    const negative = await run(
      action,
      inputs({ CompanyIntegrationID: 'ci-1', PostID: 'p', AdAccountID: 'a', Budget: -5 }),
    );
    expect(negative.ResultCode).toBe('INVALID_BUDGET');
  });

  it('should fail with INVALID_DURATION when Duration is outside 1-30 days', async () => {
    const result = await run(
      action,
      inputs({ CompanyIntegrationID: 'ci-1', PostID: 'p', AdAccountID: 'a', Budget: 100, Duration: 45 }),
    );
    expect(result.ResultCode).toBe('INVALID_DURATION');
    expect(result.Message).toBe('Duration must be between 1 and 30 days');
  });
});

// ─── FacebookCreateAlbumAction ──────────────────────────────────────────────

describe('FacebookCreateAlbumAction', () => {
  let action: FacebookCreateAlbumAction;

  beforeEach(() => {
    action = new FacebookCreateAlbumAction();
  });

  it('should fail with INVALID_TOKEN when CompanyIntegrationID is missing', async () => {
    const result = await run(action, inputs({ PageID: 'page-1', AlbumName: 'Summer' }));
    expect(result.ResultCode).toBe('INVALID_TOKEN');
    expect(result.Message).toBe('CompanyIntegrationID is required');
  });

  it('should fail with MISSING_REQUIRED_PARAM when PageID is missing', async () => {
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1', AlbumName: 'Summer' }));
    expect(result.ResultCode).toBe('MISSING_REQUIRED_PARAM');
    expect(result.Message).toBe('PageID is required');
  });

  it('should fail with MISSING_REQUIRED_PARAM when AlbumName is missing', async () => {
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1', PageID: 'page-1' }));
    expect(result.ResultCode).toBe('MISSING_REQUIRED_PARAM');
    expect(result.Message).toBe('AlbumName is required');
  });
});

// ─── FacebookGetPageInsightsAction ──────────────────────────────────────────

describe('FacebookGetPageInsightsAction', () => {
  let action: FacebookGetPageInsightsAction;

  beforeEach(() => {
    action = new FacebookGetPageInsightsAction();
  });

  it('should fail with INVALID_TOKEN when CompanyIntegrationID is missing', async () => {
    const result = await run(action, inputs({ PageID: 'page-1' }));
    expect(result.ResultCode).toBe('INVALID_TOKEN');
    expect(result.Message).toBe('CompanyIntegrationID is required');
  });

  it('should fail with MISSING_REQUIRED_PARAM when PageID is missing', async () => {
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1' }));
    expect(result.ResultCode).toBe('MISSING_REQUIRED_PARAM');
    expect(result.Message).toBe('PageID is required');
  });
});

// ─── FacebookGetPagePostsAction ─────────────────────────────────────────────

describe('FacebookGetPagePostsAction', () => {
  let action: FacebookGetPagePostsAction;

  beforeEach(() => {
    action = new FacebookGetPagePostsAction();
  });

  it('should fail with INVALID_TOKEN when CompanyIntegrationID is missing', async () => {
    const result = await run(action, inputs({ PageID: 'page-1' }));
    expect(result.ResultCode).toBe('INVALID_TOKEN');
    expect(result.Message).toBe('CompanyIntegrationID is required');
  });

  it('should fail with MISSING_REQUIRED_PARAM when PageID is missing', async () => {
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1' }));
    expect(result.ResultCode).toBe('MISSING_REQUIRED_PARAM');
    expect(result.Message).toBe('PageID is required');
  });

  it('should GET /{pageId}/posts with the page access token', async () => {
    http.instance.get.mockImplementation((url: string) => {
      if (url === '/me/accounts') return Promise.resolve({ data: pageList, headers: {} });
      return Promise.reject(new Error(`Unmocked GET ${url}`));
    });
    http.axiosDefault.get.mockResolvedValue({ data: { data: [fbPost] }, headers: {} });

    const result = await run(
      action,
      inputs({ CompanyIntegrationID: 'ci-1', PageID: 'page-1', Limit: 25 }, ['Posts', 'Summary']),
    );

    expect(http.axiosDefault.get).toHaveBeenCalledWith(
      `${API}/page-1/posts`,
      expect.objectContaining({
        params: expect.objectContaining({ access_token: 'page-token-1', limit: 25 }),
      }),
    );
    expect(result.Success).toBe(true);
    expect(result.ResultCode).toBe('SUCCESS');
    expect(result.Message).toBe('Successfully retrieved 1 posts');
  });
});

// ─── FacebookGetPostInsightsAction ──────────────────────────────────────────

describe('FacebookGetPostInsightsAction', () => {
  let action: FacebookGetPostInsightsAction;

  beforeEach(() => {
    action = new FacebookGetPostInsightsAction();
  });

  it('should fail with INVALID_TOKEN when CompanyIntegrationID is missing', async () => {
    const result = await run(action, inputs({ PostID: 'p-1' }));
    expect(result.ResultCode).toBe('INVALID_TOKEN');
    expect(result.Message).toBe('CompanyIntegrationID is required');
  });

  it('should fail with MISSING_REQUIRED_PARAM when PostID is missing', async () => {
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1' }));
    expect(result.ResultCode).toBe('MISSING_REQUIRED_PARAM');
    expect(result.Message).toBe('PostID is required');
  });
});

// ─── FacebookRespondToCommentsAction ────────────────────────────────────────

describe('FacebookRespondToCommentsAction', () => {
  let action: FacebookRespondToCommentsAction;

  beforeEach(() => {
    action = new FacebookRespondToCommentsAction();
  });

  it('should fail with INVALID_TOKEN when CompanyIntegrationID is missing', async () => {
    const result = await run(action, inputs({ CommentID: 'c-1', ResponseText: 'Thanks!' }));
    expect(result.ResultCode).toBe('INVALID_TOKEN');
    expect(result.Message).toBe('CompanyIntegrationID is required');
  });

  it('should fail with MISSING_REQUIRED_PARAM when CommentID is missing', async () => {
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1', ResponseText: 'Thanks!' }));
    expect(result.ResultCode).toBe('MISSING_REQUIRED_PARAM');
    expect(result.Message).toBe('CommentID is required');
  });

  it('should fail with MISSING_ACTION when no response action is specified', async () => {
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1', CommentID: 'c-1' }));
    expect(result.ResultCode).toBe('MISSING_ACTION');
    expect(result.Message).toBe(
      'At least one action (ResponseText, AttachmentURL, LikeComment, HideComment, or DeleteComment) is required',
    );
  });
});

// ─── FacebookSearchPostsAction ──────────────────────────────────────────────

describe('FacebookSearchPostsAction', () => {
  let action: FacebookSearchPostsAction;

  beforeEach(() => {
    action = new FacebookSearchPostsAction();
  });

  it('should fail with INVALID_TOKEN when CompanyIntegrationID is missing', async () => {
    const result = await run(action, inputs({ Query: 'hello' }));
    expect(result.ResultCode).toBe('INVALID_TOKEN');
    expect(result.Message).toBe('CompanyIntegrationID is required');
  });

  it('should fail with INVALID_TOKEN when OAuth initialization fails', async () => {
    vi.spyOn(action as never, 'initializeOAuth').mockResolvedValue(false as never);
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1', Query: 'hello' }));
    expect(result.ResultCode).toBe('INVALID_TOKEN');
    expect(result.Message).toBe('Failed to initialize Facebook OAuth connection');
  });
});
