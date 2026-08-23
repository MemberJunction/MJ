import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Per-action tests for the Instagram provider.
 *
 * Instagram actions return structured validation results (AUTH_FAILED /
 * MISSING_* / INVALID_* codes). The HTTP boundary is the axios module mock:
 * `makeInstagramRequest` routes through `axios.request` on the shared mock
 * instance, capturing endpoint/method/params for mapping assertions.
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
import { InstagramCreatePostAction } from '../providers/instagram/actions/create-post.action';
import { InstagramCreateStoryAction } from '../providers/instagram/actions/create-story.action';
import { InstagramGetAccountInsightsAction } from '../providers/instagram/actions/get-account-insights.action';
import { InstagramGetBusinessPostsAction } from '../providers/instagram/actions/get-business-posts.action';
import { InstagramGetCommentsAction } from '../providers/instagram/actions/get-comments.action';
import { InstagramGetPostInsightsAction } from '../providers/instagram/actions/get-post-insights.action';
import { InstagramSchedulePostAction } from '../providers/instagram/actions/schedule-post.action';
import { InstagramSearchPostsAction } from '../providers/instagram/actions/search-posts.action';

const contextUser = { ID: 'user-1', Name: 'Test User', Email: 'test@example.com' } as unknown as UserInfo;

type RunnableAction = { InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> };
type RequestConfig = { url: string; method: string; data?: unknown; params?: Record<string, unknown> };

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

const jpegFile = { filename: 'a.jpg', mimeType: 'image/jpeg', data: 'aGVsbG8=', size: 100 };
const mp4File = { filename: 'a.mp4', mimeType: 'video/mp4', data: 'aGVsbG8=', size: 100 };

function requestCalls(): RequestConfig[] {
  return http.instance.request.mock.calls.map((call) => call[0] as RequestConfig);
}

beforeEach(() => {
  http.instance.request.mockReset();
  http.instance.get.mockReset();
  http.instance.post.mockReset();
});

// ─── InstagramCreatePostAction ──────────────────────────────────────────────

describe('InstagramCreatePostAction', () => {
  let action: InstagramCreatePostAction;

  beforeEach(() => {
    action = new InstagramCreatePostAction();
  });

  it('should fail with AUTH_FAILED when OAuth initialization fails', async () => {
    vi.spyOn(action as never, 'initializeOAuth').mockResolvedValue(false as never);
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1', MediaFiles: [jpegFile] }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('AUTH_FAILED');
    expect(result.Message).toBe('Failed to initialize Instagram authentication');
  });

  it('should fail with MISSING_MEDIA when no media files are provided', async () => {
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('MISSING_MEDIA');
    expect(result.Message).toBe('At least one media file is required for Instagram posts');
  });

  it('should fail with INVALID_CAROUSEL when a carousel has fewer than 2 files', async () => {
    const result = await run(
      action,
      inputs({ CompanyIntegrationID: 'ci-1', MediaFiles: [jpegFile], PostType: 'CAROUSEL' }),
    );
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('INVALID_CAROUSEL');
    expect(result.Message).toBe('Carousel posts require at least 2 media files');
  });

  it('should fail with INVALID_REEL when a reel is not exactly one video', async () => {
    const result = await run(
      action,
      inputs({ CompanyIntegrationID: 'ci-1', MediaFiles: [jpegFile], PostType: 'REELS' }),
    );
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('INVALID_REEL');
    expect(result.Message).toBe('Reels require exactly one video file');
  });

  it('should fail with INVALID_SCHEDULE_TIME for past scheduled times', async () => {
    const result = await run(
      action,
      inputs({ CompanyIntegrationID: 'ci-1', MediaFiles: [jpegFile], ScheduledTime: '2020-01-01T00:00:00Z' }),
    );
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('INVALID_SCHEDULE_TIME');
    expect(result.Message).toBe('Scheduled time must be in the future');
  });

  it('should report SCHEDULING_NOT_SUPPORTED for future scheduled posts', async () => {
    const result = await run(
      action,
      inputs({ CompanyIntegrationID: 'ci-1', MediaFiles: [jpegFile], ScheduledTime: '2999-01-01T00:00:00Z' }),
    );
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('SCHEDULING_NOT_SUPPORTED');
    expect(result.Message).toBe('Instagram post scheduling requires Facebook Creator Studio integration');
  });
});

// ─── InstagramCreateStoryAction ─────────────────────────────────────────────

describe('InstagramCreateStoryAction', () => {
  let action: InstagramCreateStoryAction;

  beforeEach(() => {
    action = new InstagramCreateStoryAction();
  });

  it('should fail with AUTH_FAILED when OAuth initialization fails', async () => {
    vi.spyOn(action as never, 'initializeOAuth').mockResolvedValue(false as never);
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1', MediaFile: jpegFile }));
    expect(result.ResultCode).toBe('AUTH_FAILED');
  });

  it('should fail with MISSING_MEDIA when MediaFile is missing', async () => {
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('MISSING_MEDIA');
    expect(result.Message).toBe('MediaFile is required for stories');
  });

  it('should fail with INVALID_MEDIA for unsupported story media types', async () => {
    const result = await run(
      action,
      inputs({ CompanyIntegrationID: 'ci-1', MediaFile: { filename: 'a.bmp', mimeType: 'image/bmp', data: 'x', size: 10 } }),
    );
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('INVALID_MEDIA');
  });
});

// ─── InstagramGetAccountInsightsAction ──────────────────────────────────────

describe('InstagramGetAccountInsightsAction', () => {
  it('should fail with AUTH_FAILED when OAuth initialization fails', async () => {
    const action = new InstagramGetAccountInsightsAction();
    vi.spyOn(action as never, 'initializeOAuth').mockResolvedValue(false as never);
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('AUTH_FAILED');
    expect(result.Message).toBe('Failed to initialize Instagram authentication');
  });
});

// ─── InstagramGetBusinessPostsAction ────────────────────────────────────────

describe('InstagramGetBusinessPostsAction', () => {
  it('should fail with AUTH_FAILED when OAuth initialization fails', async () => {
    const action = new InstagramGetBusinessPostsAction();
    vi.spyOn(action as never, 'initializeOAuth').mockResolvedValue(false as never);
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('AUTH_FAILED');
  });
});

// ─── InstagramGetCommentsAction ─────────────────────────────────────────────

describe('InstagramGetCommentsAction', () => {
  let action: InstagramGetCommentsAction;

  beforeEach(() => {
    action = new InstagramGetCommentsAction();
  });

  it('should fail with MISSING_PARAMS when PostID is missing', async () => {
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('MISSING_PARAMS');
    expect(result.Message).toBe('PostID is required');
  });

  it('should GET {postId}/comments with access token and capped limit', async () => {
    http.instance.request.mockResolvedValue({ data: { data: [] }, headers: {} });

    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1', PostID: 'ig-post-1', Limit: 500 }));

    const call = requestCalls()[0];
    expect(call.url).toBe('ig-post-1/comments');
    expect(String(call.method)).toBe('GET');
    expect(call.params).toEqual(
      expect.objectContaining({ access_token: 'test-access-token', limit: 100 }),
    );
    expect(result.Success).toBe(true);
    expect(result.ResultCode).toBe('SUCCESS');
    expect(result.Message).toBe('Retrieved 0 comments');
    expect(outParam(result, 'ResultData')).toBeTruthy();
  });
});

// ─── InstagramGetPostInsightsAction ─────────────────────────────────────────

describe('InstagramGetPostInsightsAction', () => {
  let action: InstagramGetPostInsightsAction;

  beforeEach(() => {
    action = new InstagramGetPostInsightsAction();
  });

  it('should fail with MISSING_PARAMS when PostID is missing', async () => {
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('MISSING_PARAMS');
    expect(result.Message).toBe('PostID is required');
  });

  it('should return POST_NOT_FOUND when the post lookup fails', async () => {
    http.instance.request.mockRejectedValue(new Error('not found'));
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1', PostID: 'ig-404' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('POST_NOT_FOUND');
    expect(result.Message).toBe('Post not found or access denied');
  });
});

// ─── InstagramSchedulePostAction ────────────────────────────────────────────

describe('InstagramSchedulePostAction', () => {
  let action: InstagramSchedulePostAction;

  beforeEach(() => {
    action = new InstagramSchedulePostAction();
  });

  it('should fail with MISSING_PARAMS when ScheduledTime is missing', async () => {
    const result = await run(
      action,
      inputs({ CompanyIntegrationID: 'ci-1', MediaUrls: ['https://img/1.jpg'] }),
    );
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('MISSING_PARAMS');
    expect(result.Message).toBe('ScheduledTime is required');
  });

  it('should fail with MISSING_MEDIA when no media URLs are provided', async () => {
    const result = await run(
      action,
      inputs({ CompanyIntegrationID: 'ci-1', ScheduledTime: '2999-01-01T00:00:00Z' }),
    );
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('MISSING_MEDIA');
    expect(result.Message).toBe('At least one media URL is required');
  });

  it('should fail with INVALID_SCHEDULE_TIME for past times', async () => {
    const result = await run(
      action,
      inputs({ CompanyIntegrationID: 'ci-1', ScheduledTime: '2020-01-01T00:00:00Z', MediaUrls: ['https://img/1.jpg'] }),
    );
    expect(result.ResultCode).toBe('INVALID_SCHEDULE_TIME');
    expect(result.Message).toBe('Scheduled time must be in the future');
  });

  it('should fail with SCHEDULE_TOO_SOON when less than 10 minutes out', async () => {
    const tooSoon = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const result = await run(
      action,
      inputs({ CompanyIntegrationID: 'ci-1', ScheduledTime: tooSoon, MediaUrls: ['https://img/1.jpg'] }),
    );
    expect(result.ResultCode).toBe('SCHEDULE_TOO_SOON');
    expect(result.Message).toBe('Posts must be scheduled at least 10 minutes in the future');
  });

  it('should fail with SCHEDULE_TOO_FAR when more than 75 days out', async () => {
    const tooFar = new Date(Date.now() + 80 * 24 * 60 * 60 * 1000).toISOString();
    const result = await run(
      action,
      inputs({ CompanyIntegrationID: 'ci-1', ScheduledTime: tooFar, MediaUrls: ['https://img/1.jpg'] }),
    );
    expect(result.ResultCode).toBe('SCHEDULE_TOO_FAR');
    expect(result.Message).toBe('Posts cannot be scheduled more than 75 days in the future');
  });

  it('should store scheduling data locally without calling the Instagram API', async () => {
    const valid = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const result = await run(
      action,
      inputs({ CompanyIntegrationID: 'ci-1', ScheduledTime: valid, MediaUrls: ['https://img/1.jpg'], Content: 'Later' }),
    );

    expect(result.Success).toBe(true);
    expect(result.ResultCode).toBe('SUCCESS');
    expect(result.Message).toBe('Instagram post scheduled successfully');
    expect(http.instance.request).not.toHaveBeenCalled();
    const data = JSON.parse(String(outParam(result, 'ResultData'))) as { schedulingId: string; mediaCount: number };
    expect(data.schedulingId).toBeTruthy();
    expect(data.mediaCount).toBe(1);
  });
});

// ─── InstagramSearchPostsAction ─────────────────────────────────────────────

describe('InstagramSearchPostsAction', () => {
  it('should fail with AUTH_FAILED when OAuth initialization fails', async () => {
    const action = new InstagramSearchPostsAction();
    vi.spyOn(action as never, 'initializeOAuth').mockResolvedValue(false as never);
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1', Query: 'x' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('AUTH_FAILED');
  });
});
