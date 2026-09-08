import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Per-action tests for the TikTok provider.
 *
 * Boundary mocking: BaseOAuthAction is mocked (OAuth succeeds, a test access
 * token is always available) and the HTTP layer is mocked so
 * `httpClient.request(config)` captures the exact endpoint/method/payload
 * each action sends via `makeTikTokRequest`.
 */

const http = vi.hoisted(() => {
  const instance = {
    Get: vi.fn(),
    Post: vi.fn(),
    Put: vi.fn(),
    Patch: vi.fn(),
    Delete: vi.fn(),
    Head: vi.fn(),
    Request: vi.fn(),
  };
  const standalone = {
    HttpGet: vi.fn(),
    HttpPost: vi.fn(),
    HttpPut: vi.fn(),
    HttpPatch: vi.fn(),
    HttpDelete: vi.fn(),
    HttpHead: vi.fn(),
    HttpRequest: vi.fn(),
  };
  return { instance, standalone };
});

vi.mock('@memberjunction/network-utils', () => ({
  // `new HttpClient(...)` hands back the shared spy instance so assertions can inspect calls.
  HttpClient: vi.fn(function () { return http.instance; }),
  HttpError: class HttpError extends Error {
    Status = 0;
    Data: unknown = undefined;
    Headers: Record<string, string> = {};
  },
  IsHttpError: vi.fn((e: unknown) => typeof e === 'object' && e !== null && 'Status' in e),
  ...http.standalone,
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
import { CreateVideoPostAction } from '../providers/tiktok/actions/create-video-post.action';
import { GetAccountAnalyticsAction } from '../providers/tiktok/actions/get-account-analytics.action';
import { GetCommentsAction } from '../providers/tiktok/actions/get-comments.action';
import { GetTrendingHashtagsAction } from '../providers/tiktok/actions/get-trending-hashtags.action';
import { GetUserVideosAction } from '../providers/tiktok/actions/get-user-videos.action';
import { GetVideoAnalyticsAction } from '../providers/tiktok/actions/get-video-analytics.action';
import { SearchVideosAction } from '../providers/tiktok/actions/search-videos.action';

const contextUser = { ID: 'user-1', Name: 'Test User', Email: 'test@example.com' } as unknown as UserInfo;

type RunnableAction = { InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> };
type RequestConfig = { Url: string; Method: string; Body?: unknown; Query?: Record<string, unknown> };

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

function mockRequests(routes: Array<{ method?: string; url: string; response: unknown }>): void {
  http.instance.Request.mockImplementation((config: RequestConfig) => {
    for (const route of routes) {
      const methodMatches = !route.method || route.method.toUpperCase() === String(config.Method).toUpperCase();
      if (methodMatches && config.Url === route.url) {
        return Promise.resolve({ Data: route.response, Headers: {}, Status: 200 });
      }
    }
    return Promise.reject(new Error(`Unmocked request ${config.Method} ${config.Url}`));
  });
}

function requestCalls(): RequestConfig[] {
  return http.instance.Request.mock.calls.map((call) => call[0] as RequestConfig);
}

const sampleVideo = {
  id: 'vid-1',
  share_url: 'https://www.tiktok.com/@user/video/vid-1',
  title: 'My Video',
  description: 'Fun video #fun',
  duration: 30,
  cover_image_url: 'https://cdn.tiktok.com/cover.jpg',
  share_count: 5,
  view_count: 1000,
  like_count: 100,
  comment_count: 10,
  create_time: 1718444400,
};

beforeEach(() => {
  http.instance.Request.mockReset();
});

// ─── CreateVideoPostAction ──────────────────────────────────────────────────

describe('TikTok CreateVideoPostAction', () => {
  let action: CreateVideoPostAction;

  beforeEach(() => {
    action = new CreateVideoPostAction();
  });

  it('should fail when CompanyIntegrationID is missing', async () => {
    const result = await run(action, inputs({ VideoURL: 'https://example.com/v.mp4' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('ERROR');
    expect(result.Message).toBe('Failed to create TikTok video post: CompanyIntegrationID is required');
  });

  it('should fail when neither VideoURL nor VideoFile is provided', async () => {
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('ERROR');
    expect(result.Message).toBe('Failed to create TikTok video post: Either VideoURL or VideoFile is required');
  });

  it('should return API_LIMITATION with manual alternatives when upload approval is absent', async () => {
    // getCustomAttribute(3) returns null in the harness → no upload approval
    const result = await run(
      action,
      inputs({ CompanyIntegrationID: 'ci-1', VideoURL: 'https://example.com/v.mp4', Title: 'T' }, ['PostID', 'PostURL', 'Alternatives']),
    );
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('API_LIMITATION');
    expect(result.Message).toContain('special API approval');
    const alternatives = outParam(result, 'Alternatives') as { manualProcess: string[] };
    expect(alternatives.manualProcess.length).toBeGreaterThan(0);
    expect(http.instance.Request).not.toHaveBeenCalled();
  });

  it('should POST /v2/video/upload/ when upload approval is granted', async () => {
    vi.spyOn(action as never, 'getCustomAttribute').mockReturnValue('approved' as never);
    mockRequests([
      {
        method: 'POST',
        url: '/v2/video/upload/',
        response: { data: { video_id: 'vid-9', share_url: 'https://tiktok.com/v/vid-9', status: 'processing' } },
      },
    ]);

    const result = await run(
      action,
      inputs(
        {
          CompanyIntegrationID: 'ci-1',
          VideoURL: 'https://example.com/v.mp4',
          Title: 'T',
          Description: 'desc',
          Hashtags: ['fun'],
        },
        ['PostID', 'PostURL', 'Status'],
      ),
    );

    const call = requestCalls()[0];
    expect(call.Url).toBe('/v2/video/upload/');
    expect(call.Body).toEqual(
      expect.objectContaining({
        video_url: 'https://example.com/v.mp4',
        title: 'T',
        description: 'desc #fun',
        privacy_level: 'PUBLIC',
        allow_comments: true,
        allow_duet: true,
        allow_stitch: true,
      }),
    );
    expect(result.Success).toBe(true);
    expect(result.ResultCode).toBe('SUCCESS');
    expect(result.Message).toBe('Successfully created TikTok video post: vid-9');
    expect(outParam(result, 'PostID')).toBe('vid-9');
    expect(outParam(result, 'PostURL')).toBe('https://tiktok.com/v/vid-9');
  });
});

// ─── GetAccountAnalyticsAction ──────────────────────────────────────────────

describe('TikTok GetAccountAnalyticsAction', () => {
  it('should fail when CompanyIntegrationID is missing', async () => {
    const action = new GetAccountAnalyticsAction();
    const result = await run(action, inputs({}));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('ERROR');
    expect(result.Message).toBe('Failed to get TikTok account analytics: CompanyIntegrationID is required');
  });
});

// ─── GetCommentsAction ──────────────────────────────────────────────────────

describe('TikTok GetCommentsAction', () => {
  let action: GetCommentsAction;

  beforeEach(() => {
    action = new GetCommentsAction();
  });

  it('should fail when CompanyIntegrationID is missing', async () => {
    const result = await run(action, inputs({ VideoID: 'vid-1' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('ERROR');
    expect(result.Message).toBe('Failed to get TikTok comments: CompanyIntegrationID is required');
  });

  it('should fail when VideoID is missing', async () => {
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('ERROR');
    expect(result.Message).toBe('Failed to get TikTok comments: VideoID is required');
  });

  it('should GET /v2/video/comment/list/ with video_id, max_count and sort_by', async () => {
    mockRequests([
      {
        method: 'GET',
        url: '/v2/video/comment/list/',
        response: {
          data: {
            comments: [
              {
                comment_id: 'c-1',
                text: 'Great video!',
                create_time: 1718444400,
                user: { open_id: 'u-1', display_name: 'Fan', avatar_url: 'https://cdn/a.jpg' },
                like_count: 3,
                reply_count: 0,
              },
            ],
            has_more: false,
          },
        },
      },
    ]);

    const result = await run(
      action,
      inputs({ CompanyIntegrationID: 'ci-1', VideoID: 'vid-1', MaxComments: 250 }, ['Comments', 'Summary', 'RawData']),
    );

    const call = requestCalls()[0];
    expect(call.Url).toBe('/v2/video/comment/list/');
    expect(call.Query).toEqual({ video_id: 'vid-1', max_count: 100, sort_by: 'time' });
    expect(result.Success).toBe(true);
    expect(result.ResultCode).toBe('SUCCESS');
    const comments = outParam(result, 'Comments') as Array<{ id: string; text: string; likes: number }>;
    expect(comments).toHaveLength(1);
    expect(comments[0].id).toBe('c-1');
    expect(comments[0].likes).toBe(3);
  });
});

// ─── GetTrendingHashtagsAction ──────────────────────────────────────────────

describe('TikTok GetTrendingHashtagsAction', () => {
  it('should fail when CompanyIntegrationID is missing', async () => {
    const action = new GetTrendingHashtagsAction();
    const result = await run(action, inputs({}));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('ERROR');
    expect(result.Message).toBe('Failed to get TikTok trending hashtags: CompanyIntegrationID is required');
  });
});

// ─── GetUserVideosAction ────────────────────────────────────────────────────

describe('TikTok GetUserVideosAction', () => {
  let action: GetUserVideosAction;

  beforeEach(() => {
    action = new GetUserVideosAction();
  });

  it('should fail when CompanyIntegrationID is missing', async () => {
    const result = await run(action, inputs({}));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('ERROR');
    expect(result.Message).toBe('Failed to get TikTok user videos: CompanyIntegrationID is required');
  });

  it('should GET /v2/video/list/ and normalize videos to SocialPost format', async () => {
    mockRequests([
      { method: 'GET', url: '/v2/video/list/', response: { data: { videos: [sampleVideo] } } },
    ]);

    const result = await run(
      action,
      inputs({ CompanyIntegrationID: 'ci-1', MaxVideos: 500 }, ['Videos', 'Summary', 'RawData']),
    );

    const call = requestCalls()[0];
    expect(call.Url).toBe('/v2/video/list/');
    expect(call.Query).toEqual(
      expect.objectContaining({ max_count: 100 }), // capped at TikTok limit
    );
    expect(result.Success).toBe(true);
    expect(result.Message).toBe('Retrieved 1 videos from TikTok user');
    const videos = outParam(result, 'Videos') as Array<{ id: string; platform: string; analytics?: { likes: number } }>;
    expect(videos[0].id).toBe('vid-1');
    expect(videos[0].platform).toBe('TikTok');
    expect(videos[0].analytics?.likes).toBe(100);
    const summary = outParam(result, 'Summary') as { totalVideos: number; totalViews: number };
    expect(summary.totalVideos).toBe(1);
    expect(summary.totalViews).toBe(1000);
  });
});

// ─── GetVideoAnalyticsAction ────────────────────────────────────────────────

describe('TikTok GetVideoAnalyticsAction', () => {
  let action: GetVideoAnalyticsAction;

  beforeEach(() => {
    action = new GetVideoAnalyticsAction();
  });

  it('should fail when CompanyIntegrationID is missing', async () => {
    const result = await run(action, inputs({ VideoIDs: ['vid-1'] }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('ERROR');
    expect(result.Message).toBe('Failed to get TikTok video analytics: CompanyIntegrationID is required');
  });

  it('should fail when VideoIDs array is missing', async () => {
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('ERROR');
    expect(result.Message).toBe('Failed to get TikTok video analytics: VideoIDs array is required');
  });

  it('should POST /v2/video/data/ per video with the requested metric fields', async () => {
    mockRequests([
      {
        method: 'POST',
        url: '/v2/video/data/',
        response: {
          data: {
            title: 'My Video',
            create_time: 1718444400,
            share_url: 'https://tiktok.com/v/vid-1',
            view_count: 1000,
            like_count: 100,
            comment_count: 10,
            share_count: 5,
          },
        },
      },
    ]);

    const result = await run(
      action,
      inputs({ CompanyIntegrationID: 'ci-1', VideoIDs: ['vid-1'] }, ['Analytics', 'Summary']),
    );

    const call = requestCalls()[0];
    expect(call.Url).toBe('/v2/video/data/');
    expect(call.Body).toEqual({ video_id: 'vid-1', fields: 'views,likes,comments,shares' });
    expect(result.Success).toBe(true);
    expect(result.ResultCode).toBe('SUCCESS');
    expect(result.Message).toBe('Successfully retrieved analytics for 1 videos');
    const analytics = outParam(result, 'Analytics') as Array<{ videoId: string; analytics: { likes: number; videoViews?: number } }>;
    expect(analytics[0].videoId).toBe('vid-1');
    expect(analytics[0].analytics.likes).toBe(100);
    expect(analytics[0].analytics.videoViews).toBe(1000);
  });
});

// ─── SearchVideosAction ─────────────────────────────────────────────────────

describe('TikTok SearchVideosAction', () => {
  let action: SearchVideosAction;

  beforeEach(() => {
    action = new SearchVideosAction();
  });

  it('should fail when CompanyIntegrationID is missing', async () => {
    const result = await run(action, inputs({ Query: 'fun' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('ERROR');
    expect(result.Message).toBe('Failed to search TikTok videos: CompanyIntegrationID is required');
  });

  it('should search within the user video library via /v2/video/list/', async () => {
    mockRequests([
      { method: 'GET', url: '/v2/video/list/', response: { data: { videos: [sampleVideo] } } },
    ]);

    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1', Query: 'Fun' }, ['Videos', 'Summary']));

    expect(requestCalls()[0].Url).toBe('/v2/video/list/');
    expect(result.Success).toBe(true);
  });
});
