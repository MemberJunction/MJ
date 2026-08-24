import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Per-action tests for the YouTube provider.
 *
 * Boundary mocking: BaseOAuthAction is mocked (OAuth succeeds by default,
 * makeAuthenticatedRequest passes a test token straight through) and the HTTP layer is
 * mocked so `httpClient.request(config)` captures the exact endpoint,
 * method, params and payload each action sends to the YouTube Data API.
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
import { YouTubeCreatePlaylistAction } from '../providers/youtube/actions/create-playlist.action';
import { YouTubeGetChannelAnalyticsAction } from '../providers/youtube/actions/get-channel-analytics.action';
import { YouTubeGetChannelVideosAction } from '../providers/youtube/actions/get-channel-videos.action';
import { YouTubeGetCommentsAction } from '../providers/youtube/actions/get-comments.action';
import { YouTubeGetVideoAnalyticsAction } from '../providers/youtube/actions/get-video-analytics.action';
import { YouTubeScheduleVideoAction } from '../providers/youtube/actions/schedule-video.action';
import { YouTubeSearchVideosAction } from '../providers/youtube/actions/search-videos.action';
import { YouTubeUpdateVideoMetadataAction } from '../providers/youtube/actions/update-video-metadata.action';
import { YouTubeUploadVideoAction } from '../providers/youtube/actions/upload-video.action';

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

/** Route mock for httpClient.request keyed on `${method} ${url}`. */
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

beforeEach(() => {
  http.instance.Request.mockReset();
  http.instance.Get.mockReset();
  http.instance.Post.mockReset();
});

// ─── YouTubeCreatePlaylistAction ────────────────────────────────────────────

describe('YouTubeCreatePlaylistAction', () => {
  let action: YouTubeCreatePlaylistAction;

  beforeEach(() => {
    action = new YouTubeCreatePlaylistAction();
  });

  it('should fail when CompanyIntegrationID is missing', async () => {
    const result = await run(action, inputs({ Title: 'My List' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('ERROR');
    expect(result.Message).toBe('Failed to create playlist: CompanyIntegrationID is required');
  });

  it('should fail when OAuth initialization fails', async () => {
    vi.spyOn(action as never, 'initializeOAuth').mockResolvedValue(false as never);
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1', Title: 'My List' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('ERROR');
    expect(result.Message).toBe('Failed to create playlist: Failed to initialize YouTube OAuth connection');
  });

  it('should fail when Title is missing', async () => {
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('ERROR');
    expect(result.Message).toBe('Failed to create playlist: Title is required for playlist creation');
  });

  it('should POST /playlists with snippet/status payload and map outputs', async () => {
    mockRequests([
      { method: 'POST', url: '/playlists', response: { id: 'pl-1' } },
      {
        method: 'GET',
        url: '/playlists',
        response: {
          items: [
            {
              id: 'pl-1',
              snippet: {
                title: 'My List',
                description: '',
                tags: [],
                channelId: 'ch-1',
                channelTitle: 'MJ Channel',
                publishedAt: '2024-06-15T10:00:00Z',
                thumbnails: {},
              },
              status: { privacyStatus: 'private' },
              contentDetails: { itemCount: 0 },
            },
          ],
        },
      },
    ]);

    const result = await run(
      action,
      inputs({ CompanyIntegrationID: 'ci-1', Title: 'My List' }, ['PlaylistDetails', 'PlaylistID', 'PlaylistURL']),
    );

    const post = requestCalls().find((c) => String(c.Method).toUpperCase() === 'POST');
    expect(post).toBeDefined();
    expect(post!.Url).toBe('/playlists');
    expect(post!.Query).toEqual({ part: 'snippet,status' });
    expect(post!.Body).toEqual({
      snippet: { title: 'My List', description: '', tags: [], defaultLanguage: 'en' },
      status: { privacyStatus: 'private' },
    });
    expect(result.Success).toBe(true);
    expect(result.ResultCode).toBe('SUCCESS');
    expect(result.Message).toBe('Playlist created successfully with 0 videos: https://www.youtube.com/playlist?list=pl-1');
    expect(outParam(result, 'PlaylistID')).toBe('pl-1');
    expect(outParam(result, 'PlaylistURL')).toBe('https://www.youtube.com/playlist?list=pl-1');
  });
});

// ─── YouTubeGetChannelAnalyticsAction ───────────────────────────────────────

describe('YouTubeGetChannelAnalyticsAction', () => {
  let action: YouTubeGetChannelAnalyticsAction;

  beforeEach(() => {
    action = new YouTubeGetChannelAnalyticsAction();
  });

  it('should fail when CompanyIntegrationID is missing', async () => {
    const result = await run(action, inputs({}));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('ERROR');
    expect(result.Message).toBe('Failed to get channel analytics: CompanyIntegrationID is required');
  });

  it('should look up the authenticated channel (mine:true) and fail when none exists', async () => {
    mockRequests([{ method: 'GET', url: '/channels', response: { items: [] } }]);
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1' }));

    const call = requestCalls()[0];
    expect(call.Url).toBe('/channels');
    expect(call.Query).toEqual(expect.objectContaining({ mine: true }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('ERROR');
    expect(result.Message).toBe('Failed to get channel analytics: No channel found for authenticated user');
  });

  it('should map a missing explicit channel to NOT_FOUND', async () => {
    mockRequests([{ method: 'GET', url: '/channels', response: { items: [] } }]);
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1', ChannelID: 'ch-404' }));

    const call = requestCalls()[0];
    expect(call.Query).toEqual(expect.objectContaining({ id: 'ch-404' }));
    expect(result.Success).toBe(false);
    // 'Channel not found: ch-404' contains '404' → mapped to NOT_FOUND
    expect(result.ResultCode).toBe('NOT_FOUND');
    expect(result.Message).toBe('Failed to get channel analytics: Channel not found: ch-404');
  });
});

// ─── YouTubeGetChannelVideosAction ──────────────────────────────────────────

describe('YouTubeGetChannelVideosAction', () => {
  let action: YouTubeGetChannelVideosAction;

  beforeEach(() => {
    action = new YouTubeGetChannelVideosAction();
  });

  it('should fail when CompanyIntegrationID is missing', async () => {
    const result = await run(action, inputs({}));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('ERROR');
    expect(result.Message).toBe('Failed to get channel videos: CompanyIntegrationID is required');
  });

  it('should resolve the authenticated channel and fail when none exists', async () => {
    mockRequests([{ method: 'GET', url: '/channels', response: { items: [] } }]);
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1' }));

    const call = requestCalls()[0];
    expect(call.Url).toBe('/channels');
    expect(call.Query).toEqual({ part: 'id,snippet', mine: true });
    expect(result.Success).toBe(false);
    expect(result.Message).toBe('Failed to get channel videos: No channel found for authenticated user');
  });
});

// ─── YouTubeGetCommentsAction ───────────────────────────────────────────────

describe('YouTubeGetCommentsAction', () => {
  let action: YouTubeGetCommentsAction;

  beforeEach(() => {
    action = new YouTubeGetCommentsAction();
  });

  it('should fail when CompanyIntegrationID is missing', async () => {
    const result = await run(action, inputs({ VideoID: 'v-1' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('ERROR');
    expect(result.Message).toBe('Failed to get comments: CompanyIntegrationID is required');
  });

  it('should fail when neither VideoID nor ChannelID is provided', async () => {
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('ERROR');
    expect(result.Message).toBe('Failed to get comments: Either VideoID or ChannelID is required');
  });

  it('should GET /commentThreads with allThreadsRelatedToChannelId for channel queries', async () => {
    mockRequests([{ method: 'GET', url: '/commentThreads', response: { items: [] } }]);

    const result = await run(
      action,
      inputs({ CompanyIntegrationID: 'ci-1', ChannelID: 'ch-1' }, ['Comments', 'Summary', 'NextPageToken']),
    );

    const call = requestCalls()[0];
    expect(call.Url).toBe('/commentThreads');
    expect(call.Query).toEqual(
      expect.objectContaining({
        part: 'snippet,replies',
        maxResults: 100,
        order: 'time',
        textFormat: 'plainText',
        allThreadsRelatedToChannelId: 'ch-1',
      }),
    );
    expect(result.Success).toBe(true);
    expect(result.ResultCode).toBe('SUCCESS');
    expect(result.Message).toBe('Retrieved 0 comments from 0 threads');
    expect(outParam(result, 'Comments')).toEqual([]);
  });
});

// ─── YouTubeGetVideoAnalyticsAction ─────────────────────────────────────────

describe('YouTubeGetVideoAnalyticsAction', () => {
  let action: YouTubeGetVideoAnalyticsAction;

  beforeEach(() => {
    action = new YouTubeGetVideoAnalyticsAction();
  });

  it('should fail when CompanyIntegrationID is missing', async () => {
    const result = await run(action, inputs({ VideoIDs: ['v-1'] }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('ERROR');
    expect(result.Message).toBe('Failed to get video analytics: CompanyIntegrationID is required');
  });

  it('should fail when VideoIDs is missing', async () => {
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('ERROR');
    expect(result.Message).toBe('Failed to get video analytics: VideoIDs parameter is required');
  });

  it('should fail when VideoIDs is an empty array', async () => {
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1', VideoIDs: [] }));
    expect(result.Success).toBe(false);
    expect(result.Message).toBe('Failed to get video analytics: VideoIDs parameter is required');
  });

  it('should GET /videos with comma-joined ids and map statistics', async () => {
    mockRequests([
      {
        method: 'GET',
        url: '/videos',
        response: {
          items: [
            {
              id: 'v-1',
              snippet: { title: 'Video One', publishedAt: '2024-06-01T00:00:00Z', tags: ['a'] },
              statistics: { viewCount: '1000', likeCount: '100', commentCount: '10', favoriteCount: '1' },
              status: { privacyStatus: 'public' },
              contentDetails: { duration: 'PT1M' },
            },
          ],
        },
      },
    ]);

    const result = await run(
      action,
      inputs({ CompanyIntegrationID: 'ci-1', VideoIDs: ['v-1', 'v-2'] }, ['Analytics', 'Summary']),
    );

    const call = requestCalls()[0];
    expect(call.Url).toBe('/videos');
    expect(call.Query).toEqual({ part: 'snippet,statistics,contentDetails,status', id: 'v-1,v-2' });
    expect(result.Success).toBe(true);
    expect(result.Message).toBe('Retrieved analytics for 1 videos');
    const analytics = outParam(result, 'Analytics') as Array<{ videoId: string; metrics: { views: number; likes: number } }>;
    expect(analytics[0].videoId).toBe('v-1');
    expect(analytics[0].metrics.views).toBe(1000);
    expect(analytics[0].metrics.likes).toBe(100);
  });
});

// ─── YouTubeScheduleVideoAction ─────────────────────────────────────────────

describe('YouTubeScheduleVideoAction', () => {
  let action: YouTubeScheduleVideoAction;

  beforeEach(() => {
    action = new YouTubeScheduleVideoAction();
  });

  it('should fail when VideoID is missing', async () => {
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1', PublishAt: '2999-01-01T00:00:00Z' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('ERROR');
    expect(result.Message).toBe('Failed to schedule video: VideoID is required');
  });

  it('should fail when PublishAt is missing', async () => {
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1', VideoID: 'v-1' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('ERROR');
    expect(result.Message).toBe('Failed to schedule video: PublishAt date/time is required');
  });

  it('should map a past PublishAt to INVALID_DATE', async () => {
    const result = await run(
      action,
      inputs({ CompanyIntegrationID: 'ci-1', VideoID: 'v-1', PublishAt: '2020-01-01T00:00:00Z' }),
    );
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('INVALID_DATE');
    expect(result.Message).toBe('Failed to schedule video: PublishAt must be a future date/time');
  });

  it('should map a non-private video to INVALID_STATUS', async () => {
    mockRequests([
      {
        method: 'GET',
        url: '/videos',
        response: { items: [{ id: 'v-1', snippet: { title: 'V' }, status: { privacyStatus: 'public' } }] },
      },
    ]);
    const result = await run(
      action,
      inputs({ CompanyIntegrationID: 'ci-1', VideoID: 'v-1', PublishAt: '2999-01-01T00:00:00Z' }),
    );

    expect(requestCalls()[0].Query).toEqual({ part: 'snippet,status', id: 'v-1' });
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('INVALID_STATUS');
    expect(result.Message).toBe('Failed to schedule video: Video must be private to schedule. Current status: public');
  });
});

// ─── YouTubeSearchVideosAction ──────────────────────────────────────────────

describe('YouTubeSearchVideosAction', () => {
  let action: YouTubeSearchVideosAction;

  beforeEach(() => {
    action = new YouTubeSearchVideosAction();
  });

  it('should fail when CompanyIntegrationID is missing', async () => {
    const result = await run(action, inputs({ Query: 'cats' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('ERROR');
    expect(result.Message).toBe('Failed to search videos: CompanyIntegrationID is required');
  });

  it('should fail when OAuth initialization fails', async () => {
    vi.spyOn(action as never, 'initializeOAuth').mockResolvedValue(false as never);
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1', Query: 'cats' }));
    expect(result.Success).toBe(false);
    expect(result.Message).toBe('Failed to search videos: Failed to initialize YouTube OAuth connection');
  });
});

// ─── YouTubeUpdateVideoMetadataAction ───────────────────────────────────────

describe('YouTubeUpdateVideoMetadataAction', () => {
  let action: YouTubeUpdateVideoMetadataAction;

  beforeEach(() => {
    action = new YouTubeUpdateVideoMetadataAction();
  });

  it('should fail when VideoID is missing', async () => {
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1', Title: 'New Title' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('ERROR');
    expect(result.Message).toBe('Failed to update video metadata: VideoID is required');
  });

  it('should GET the current video and fail when it does not exist', async () => {
    mockRequests([{ method: 'GET', url: '/videos', response: { items: [] } }]);
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1', VideoID: 'v-404', Title: 'T' }));

    const call = requestCalls()[0];
    expect(call.Url).toBe('/videos');
    expect(call.Query).toEqual(expect.objectContaining({ id: 'v-404' }));
    expect(result.Success).toBe(false);
    // 'Video not found: v-404' contains '404' → mapped to NOT_FOUND
    expect(result.ResultCode).toBe('NOT_FOUND');
    expect(result.Message).toBe('Failed to update video metadata: Video not found: v-404');
  });
});

// ─── YouTubeUploadVideoAction ───────────────────────────────────────────────

describe('YouTubeUploadVideoAction', () => {
  let action: YouTubeUploadVideoAction;

  beforeEach(() => {
    action = new YouTubeUploadVideoAction();
  });

  it('should fail when CompanyIntegrationID is missing', async () => {
    const result = await run(action, inputs({ Title: 'Video' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('ERROR');
    expect(result.Message).toBe('Failed to upload video: CompanyIntegrationID is required');
  });

  it('should fail when Title is missing', async () => {
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('ERROR');
    expect(result.Message).toBe('Failed to upload video: Title is required for video upload');
  });

  it('should fail when VideoFile is missing', async () => {
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1', Title: 'Video' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('ERROR');
    expect(result.Message).toBe('Failed to upload video: VideoFile is required');
  });
});
