import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Per-action tests for the Twitter/X provider.
 *
 * Boundary mocking strategy (mirrors the LMS per-action pattern):
 * - `@memberjunction/actions` BaseOAuthAction is mocked so `initializeOAuth`
 *   succeeds by default (individual tests spy on it to force failure).
 * - `@memberjunction/network-utils` is mocked at module level; `new HttpClient()` returns a shared mock
 *   instance whose get/post/delete calls capture the exact endpoint + payload
 *   each action sends.
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
import { TwitterCreateTweetAction } from '../providers/twitter/actions/create-tweet.action';
import { TwitterCreateThreadAction } from '../providers/twitter/actions/create-thread.action';
import { TwitterDeleteTweetAction } from '../providers/twitter/actions/delete-tweet.action';
import { TwitterGetAnalyticsAction } from '../providers/twitter/actions/get-analytics.action';
import { TwitterGetMentionsAction } from '../providers/twitter/actions/get-mentions.action';
import { TwitterGetTimelineAction } from '../providers/twitter/actions/get-timeline.action';
import { TwitterScheduleTweetAction } from '../providers/twitter/actions/schedule-tweet.action';
import { TwitterSearchTweetsAction } from '../providers/twitter/actions/search-tweets.action';

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

const twitterUser = { id: 'tw-user-1', username: 'mjtester', name: 'MJ Tester', created_at: '2020-01-01T00:00:00Z' };

function mockGetByUrl(routes: Record<string, unknown>): void {
  http.instance.Get.mockImplementation((url: string) => {
    for (const [prefix, data] of Object.entries(routes)) {
      if (url.startsWith(prefix)) {
        return Promise.resolve({ Data: data, Headers: {} });
      }
    }
    return Promise.reject(new Error(`Unmocked GET ${url}`));
  });
}

beforeEach(() => {
  http.instance.Get.mockReset();
  http.instance.Post.mockReset();
  http.instance.Put.mockReset();
  http.instance.Delete.mockReset();
  http.instance.Request.mockReset();
  http.standalone.HttpGet.mockReset();
  http.standalone.HttpPost.mockReset();
  http.standalone.HttpPut.mockReset();
});

// ─── TwitterCreateTweetAction ───────────────────────────────────────────────

describe('TwitterCreateTweetAction', () => {
  let action: TwitterCreateTweetAction;

  beforeEach(() => {
    action = new TwitterCreateTweetAction();
  });

  it('should fail with ERROR when OAuth initialization fails', async () => {
    vi.spyOn(action as never, 'initializeOAuth').mockResolvedValue(false as never);
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1', Content: 'Hello' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('ERROR');
    expect(result.Message).toBe('Failed to create tweet: Failed to initialize OAuth connection');
  });

  it('should fail with ERROR when Content is missing', async () => {
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('ERROR');
    expect(result.Message).toBe('Failed to create tweet: Content is required');
  });

  it('should fail with CONTENT_TOO_LONG when Content exceeds 280 characters', async () => {
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1', Content: 'x'.repeat(281) }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('CONTENT_TOO_LONG');
    expect(result.Message).toContain("exceeds Twitter's 280 character limit (current: 281 characters)");
  });

  it('should fail with ERROR when more than 4 poll options are provided', async () => {
    const result = await run(
      action,
      inputs({ CompanyIntegrationID: 'ci-1', Content: 'Poll!', PollOptions: ['a', 'b', 'c', 'd', 'e'] }),
    );
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('ERROR');
    expect(result.Message).toContain('Twitter polls support a maximum of 4 options');
  });

  it('should map an over-long poll option to CONTENT_TOO_LONG (message contains "character limit")', async () => {
    const result = await run(
      action,
      inputs({ CompanyIntegrationID: 'ci-1', Content: 'Poll!', PollOptions: ['ok', 'x'.repeat(26)] }),
    );
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('CONTENT_TOO_LONG');
    expect(result.Message).toContain('exceeds 25 character limit');
  });

  it('should fail with INVALID_MEDIA when more than 4 media files are provided', async () => {
    const media = Array.from({ length: 5 }, (_, i) => ({
      filename: `f${i}.jpg`,
      mimeType: 'image/jpeg',
      data: 'aGVsbG8=',
      size: 10,
    }));
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1', Content: 'Pics', MediaFiles: media }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('INVALID_MEDIA');
    expect(result.Message).toContain('maximum of 4 media items');
  });

  it('should POST /tweets with the exact payload and map outputs on happy path', async () => {
    http.instance.Post.mockResolvedValue({
      Data: { data: { id: 'tweet-9', text: 'Hello world', created_at: '2024-06-15T10:00:00Z' } },
      Headers: {},
    });
    mockGetByUrl({ '/users/me': { data: twitterUser } });

    const result = await run(
      action,
      inputs(
        { CompanyIntegrationID: 'ci-1', Content: 'Hello world', ReplyToTweetID: 'orig-1', QuoteTweetID: 'quote-1' },
        ['CreatedPost', 'TweetID', 'TweetURL'],
      ),
    );

    expect(http.instance.Post).toHaveBeenCalledWith('/tweets', {
      text: 'Hello world',
      reply: { in_reply_to_tweet_id: 'orig-1' },
      quote_tweet_id: 'quote-1',
    });
    expect(result.Success).toBe(true);
    expect(result.ResultCode).toBe('SUCCESS');
    expect(result.Message).toBe('Successfully created tweet (ID: tweet-9)');
    expect(outParam(result, 'TweetID')).toBe('tweet-9');
    expect(outParam(result, 'TweetURL')).toBe('https://twitter.com/mjtester/status/tweet-9');
    const createdPost = outParam(result, 'CreatedPost') as { id: string; platform: string; content: string };
    expect(createdPost.id).toBe('tweet-9');
    expect(createdPost.platform).toBe('Twitter');
    expect(createdPost.content).toBe('Hello world');
  });
});

// ─── TwitterCreateThreadAction ──────────────────────────────────────────────

describe('TwitterCreateThreadAction', () => {
  let action: TwitterCreateThreadAction;

  beforeEach(() => {
    action = new TwitterCreateThreadAction();
  });

  it('should fail when Tweets array is missing', async () => {
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('ERROR');
    expect(result.Message).toBe('Failed to create thread: Tweets array is required and must not be empty');
  });

  it('should fail when the thread has fewer than 2 tweets', async () => {
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1', Tweets: ['only one'] }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('ERROR');
    expect(result.Message).toContain('A thread must contain at least 2 tweets');
  });

  it('should fail when the thread has more than 25 tweets', async () => {
    const tweets = Array.from({ length: 26 }, (_, i) => `tweet ${i}`);
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1', Tweets: tweets }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('ERROR');
    expect(result.Message).toContain('Twitter threads are limited to 25 tweets');
  });

  it('should fail with CONTENT_TOO_LONG when any tweet exceeds 280 characters', async () => {
    const result = await run(
      action,
      inputs({ CompanyIntegrationID: 'ci-1', Tweets: ['x'.repeat(281), 'short'], IncludeNumbers: false }),
    );
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('CONTENT_TOO_LONG');
    expect(result.Message).toContain("Tweet 1 exceeds Twitter's 280 character limit");
  });

  it('should chain tweets via reply.in_reply_to_tweet_id and report the thread URL', async () => {
    let counter = 0;
    http.instance.Post.mockImplementation(() => {
      counter += 1;
      return Promise.resolve({
        Data: { data: { id: `t-${counter}`, text: `tweet ${counter}`, created_at: '2024-06-15T10:00:00Z' } },
        Headers: {},
      });
    });
    mockGetByUrl({ '/users/me': { data: twitterUser } });

    const result = await run(
      action,
      inputs(
        { CompanyIntegrationID: 'ci-1', Tweets: ['first', 'second'], IncludeNumbers: false },
        ['CreatedPosts', 'TweetIDs', 'ThreadURL'],
      ),
    );

    expect(http.instance.Post).toHaveBeenNthCalledWith(1, '/tweets', { text: 'first' });
    expect(http.instance.Post).toHaveBeenNthCalledWith(2, '/tweets', {
      text: 'second',
      reply: { in_reply_to_tweet_id: 't-1' },
    });
    expect(result.Success).toBe(true);
    expect(result.ResultCode).toBe('SUCCESS');
    expect(result.Message).toBe('Successfully created thread with 2 tweets');
    expect(outParam(result, 'TweetIDs')).toEqual(['t-1', 't-2']);
    expect(outParam(result, 'ThreadURL')).toBe('https://twitter.com/mjtester/status/t-1');
  }, 10000);
});

// ─── TwitterDeleteTweetAction ───────────────────────────────────────────────

describe('TwitterDeleteTweetAction', () => {
  let action: TwitterDeleteTweetAction;

  beforeEach(() => {
    action = new TwitterDeleteTweetAction();
  });

  it('should fail when TweetID is missing', async () => {
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1', ConfirmDeletion: true }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('ERROR');
    expect(result.Message).toBe('Failed to delete tweet: TweetID is required');
  });

  it('should require explicit confirmation before deleting', async () => {
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1', TweetID: 't-1' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('CONFIRMATION_REQUIRED');
    expect(result.Message).toContain('Set ConfirmDeletion to true');
  });

  it('should DELETE /tweets/{id} on confirmed happy path', async () => {
    mockGetByUrl({
      '/tweets/t-9': {
        data: { id: 't-9', text: 'bye', created_at: '2024-06-15T10:00:00Z', author_id: twitterUser.id },
      },
      '/users/me': { data: twitterUser },
    });
    http.instance.Delete.mockResolvedValue({ Data: {}, Headers: {}, Status: 200 });

    const result = await run(
      action,
      inputs({ CompanyIntegrationID: 'ci-1', TweetID: 't-9', ConfirmDeletion: true }, ['DeletedTweetDetails', 'DeletionTime']),
    );

    expect(http.instance.Delete).toHaveBeenCalledWith('/tweets/t-9');
    expect(result.Success).toBe(true);
    expect(result.ResultCode).toBe('SUCCESS');
    expect(result.Message).toBe('Successfully deleted tweet (ID: t-9)');
    expect(outParam(result, 'DeletionTime')).toBeTruthy();
    const details = outParam(result, 'DeletedTweetDetails') as { id: string; text: string };
    expect(details.id).toBe('t-9');
    expect(details.text).toBe('bye');
  });

  it('deletes a non-owned tweet anyway — the ownership guard is dead code (swallowed by the detail-retrieval catch)', async () => {
    mockGetByUrl({
      '/tweets/t-9': {
        data: { id: 't-9', text: 'not mine', created_at: '2024-06-15T10:00:00Z', author_id: 'someone-else' },
      },
      '/users/me': { data: twitterUser },
    });
    http.instance.Delete.mockResolvedValue({ Data: {}, Headers: {}, Status: 200 });

    // NOTE (current behavior): the ownership check throws inside the inner
    // try/catch that also guards detail retrieval, so the error is swallowed
    // and the delete proceeds anyway. This test documents that the delete
    // still succeeds — the ownership guard is dead code as written.
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1', TweetID: 't-9', ConfirmDeletion: true }));
    expect(result.Success).toBe(true);
    expect(http.instance.Delete).toHaveBeenCalledWith('/tweets/t-9');
  });
});

// ─── TwitterGetAnalyticsAction ──────────────────────────────────────────────

describe('TwitterGetAnalyticsAction', () => {
  let action: TwitterGetAnalyticsAction;

  beforeEach(() => {
    action = new TwitterGetAnalyticsAction();
  });

  it('should fail when AnalyticsType is tweets and TweetIDs is missing', async () => {
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1', AnalyticsType: 'tweets' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('ERROR');
    expect(result.Message).toBe('Failed to get analytics: TweetIDs array is required for tweet analytics');
  });

  it('should GET /tweets with comma-joined ids for tweet analytics', async () => {
    http.instance.Get.mockResolvedValue({
      Data: {
        data: [
          {
            id: 't-1',
            text: 'analyzed tweet',
            created_at: '2024-06-15T10:00:00Z',
            public_metrics: {
              retweet_count: 2,
              reply_count: 1,
              like_count: 10,
              quote_count: 0,
              bookmark_count: 0,
              impression_count: 100,
            },
          },
        ],
      },
      Headers: {},
    });

    const result = await run(
      action,
      inputs({ CompanyIntegrationID: 'ci-1', AnalyticsType: 'tweets', TweetIDs: ['t-1', 't-2'] }, ['Analytics', 'AggregateMetrics']),
    );

    expect(http.instance.Get).toHaveBeenCalledWith('/tweets', {
      Query: expect.objectContaining({ ids: 't-1,t-2' }),
    });
    expect(result.Success).toBe(true);
    expect(result.ResultCode).toBe('SUCCESS');
    expect(result.Message).toBe('Successfully retrieved analytics for 1 tweets');
    const analytics = outParam(result, 'Analytics') as Array<{ tweetId: string; metrics: { likes: number } }>;
    expect(analytics).toHaveLength(1);
    expect(analytics[0].tweetId).toBe('t-1');
    expect(analytics[0].metrics.likes).toBe(10);
  });
});

// ─── TwitterGetMentionsAction ───────────────────────────────────────────────

describe('TwitterGetMentionsAction', () => {
  let action: TwitterGetMentionsAction;

  beforeEach(() => {
    action = new TwitterGetMentionsAction();
  });

  it('should fail with ERROR when OAuth initialization fails', async () => {
    vi.spyOn(action as never, 'initializeOAuth').mockResolvedValue(false as never);
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('ERROR');
    expect(result.Message).toBe('Failed to get mentions: Failed to initialize OAuth connection');
  });

  it('should GET /users/{id}/mentions and normalize results', async () => {
    mockGetByUrl({
      '/users/me': { data: twitterUser },
      [`/users/${twitterUser.id}/mentions`]: {
        data: [
          {
            id: 'm-1',
            text: '@mjtester hi there',
            created_at: '2024-06-15T10:00:00Z',
            author_id: 'fan-1',
            public_metrics: { retweet_count: 0, reply_count: 0, like_count: 3, quote_count: 0, bookmark_count: 0, impression_count: 50 },
          },
        ],
        meta: {},
      },
    });

    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1' }, ['Mentions', 'Tweets', 'Statistics']));

    expect(http.instance.Get).toHaveBeenCalledWith(
      `/users/${twitterUser.id}/mentions`,
      expect.objectContaining({ Query: expect.objectContaining({ max_results: 100 }) }),
    );
    expect(result.Success).toBe(true);
    expect(result.Message).toBe('Successfully retrieved 1 mentions');
    const stats = outParam(result, 'Statistics') as { totalMentions: number; mentionTypes: { directMentions: number } };
    expect(stats.totalMentions).toBe(1);
    expect(stats.mentionTypes.directMentions).toBe(1);
  });
});

// ─── TwitterGetTimelineAction ───────────────────────────────────────────────

describe('TwitterGetTimelineAction', () => {
  let action: TwitterGetTimelineAction;

  beforeEach(() => {
    action = new TwitterGetTimelineAction();
  });

  it('should GET the reverse-chronological home timeline by default', async () => {
    mockGetByUrl({
      '/users/me': { data: twitterUser },
      [`/users/${twitterUser.id}/timelines/reverse_chronological`]: {
        data: [{ id: 'h-1', text: 'home tweet', created_at: '2024-06-15T10:00:00Z', author_id: 'a-1' }],
        meta: {},
      },
    });

    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1' }, ['Posts', 'Tweets', 'Statistics']));

    expect(http.instance.Get).toHaveBeenCalledWith(
      `/users/${twitterUser.id}/timelines/reverse_chronological`,
      expect.anything(),
    );
    expect(result.Success).toBe(true);
    expect(result.Message).toBe('Successfully retrieved 1 tweets from home timeline');
  });

  it('should resolve a username then GET /users/{id}/tweets for user timelines', async () => {
    mockGetByUrl({
      '/users/by/username/jack': { data: { id: 'jack-id' } },
      '/users/jack-id/tweets': {
        data: [{ id: 'u-1', text: 'user tweet', created_at: '2024-06-15T10:00:00Z', author_id: 'jack-id' }],
        meta: {},
      },
    });

    const result = await run(
      action,
      inputs({ CompanyIntegrationID: 'ci-1', TimelineType: 'user', Username: 'jack' }, ['Posts']),
    );

    expect(http.instance.Get).toHaveBeenCalledWith('/users/by/username/jack', { Query: { 'user.fields': 'id' } });
    expect(http.instance.Get).toHaveBeenCalledWith('/users/jack-id/tweets', expect.anything());
    expect(result.Success).toBe(true);
    expect(result.Message).toBe('Successfully retrieved 1 tweets from user timeline');
  });
});

// ─── TwitterScheduleTweetAction ─────────────────────────────────────────────

describe('TwitterScheduleTweetAction', () => {
  let action: TwitterScheduleTweetAction;

  beforeEach(() => {
    action = new TwitterScheduleTweetAction();
  });

  it('should fail when Content is missing', async () => {
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1', ScheduledTime: '2999-01-01T00:00:00Z' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('ERROR');
    expect(result.Message).toBe('Failed to schedule tweet: Content is required');
  });

  it('should fail when ScheduledTime is missing', async () => {
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1', Content: 'later' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('ERROR');
    expect(result.Message).toBe('Failed to schedule tweet: ScheduledTime is required');
  });

  it('should fail with INVALID_SCHEDULE_TIME when ScheduledTime is in the past', async () => {
    const result = await run(
      action,
      inputs({ CompanyIntegrationID: 'ci-1', Content: 'later', ScheduledTime: '2020-01-01T00:00:00Z' }),
    );
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('INVALID_SCHEDULE_TIME');
    expect(result.Message).toContain('ScheduledTime must be in the future');
  });

  it('should fail with INVALID_SCHEDULE_TIME when ScheduledTime is more than 1 year out', async () => {
    const farFuture = new Date();
    farFuture.setFullYear(farFuture.getFullYear() + 2);
    const result = await run(
      action,
      inputs({ CompanyIntegrationID: 'ci-1', Content: 'later', ScheduledTime: farFuture.toISOString() }),
    );
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('INVALID_SCHEDULE_TIME');
    expect(result.Message).toContain('cannot be more than 1 year in the future');
  });

  it('should fail with CONTENT_TOO_LONG for over-long content', async () => {
    const soon = new Date(Date.now() + 60 * 60 * 1000);
    const result = await run(
      action,
      inputs({ CompanyIntegrationID: 'ci-1', Content: 'x'.repeat(281), ScheduledTime: soon.toISOString() }),
    );
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('CONTENT_TOO_LONG');
  });

  it('should build the scheduled tweet record and outputs on happy path', async () => {
    mockGetByUrl({ '/users/me': { data: twitterUser } });
    const soon = new Date(Date.now() + 60 * 60 * 1000);

    const result = await run(
      action,
      inputs(
        { CompanyIntegrationID: 'ci-1', Content: 'later gator', ScheduledTime: soon.toISOString(), ReplyToTweetID: 'r-1' },
        ['ScheduledTweetID', 'ScheduledTweetData', 'EstimatedURL'],
      ),
    );

    expect(result.Success).toBe(true);
    expect(result.ResultCode).toBe('SUCCESS');
    expect(String(outParam(result, 'ScheduledTweetID'))).toMatch(/^scheduled_/);
    expect(outParam(result, 'EstimatedURL')).toBe('https://twitter.com/mjtester/status/[pending]');
    const data = outParam(result, 'ScheduledTweetData') as {
      tweetData: { text: string; reply?: { in_reply_to_tweet_id: string } };
      status: string;
    };
    expect(data.tweetData.text).toBe('later gator');
    expect(data.tweetData.reply).toEqual({ in_reply_to_tweet_id: 'r-1' });
    expect(data.status).toBe('scheduled');
    // No tweet is actually posted for scheduling
    expect(http.instance.Post).not.toHaveBeenCalled();
  });
});

// ─── TwitterSearchTweetsAction ──────────────────────────────────────────────

describe('TwitterSearchTweetsAction', () => {
  let action: TwitterSearchTweetsAction;

  beforeEach(() => {
    action = new TwitterSearchTweetsAction();
  });

  it('should fail when no search parameter is provided', async () => {
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('ERROR');
    expect(result.Message).toBe('Failed to search tweets: At least one search parameter must be provided');
  });

  it('should fail with QUERY_TOO_LONG when the built query exceeds 512 characters', async () => {
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1', Query: 'x'.repeat(513) }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('QUERY_TOO_LONG');
    expect(result.Message).toContain("exceeds Twitter's 512 character limit");
  });

  it('should GET /tweets/search/recent with the built query', async () => {
    http.instance.Get.mockResolvedValue({
      Data: {
        data: [{ id: 's-1', text: 'hello result', created_at: '2024-06-15T10:00:00Z', author_id: 'a-1' }],
        meta: {},
      },
      Headers: {},
    });

    const result = await run(
      action,
      inputs({ CompanyIntegrationID: 'ci-1', Query: 'hello', Hashtags: ['mj'], FromUser: 'mjtester' }, ['Posts', 'ActualQuery']),
    );

    expect(http.instance.Get).toHaveBeenCalledWith('/tweets/search/recent', {
      Query: expect.objectContaining({
        query: 'hello (#mj) from:mjtester',
        max_results: 100,
        sort_order: 'recency',
      }),
    });
    expect(result.Success).toBe(true);
    expect(result.Message).toBe('Successfully found 1 tweets matching search criteria');
    expect(outParam(result, 'ActualQuery')).toBe('hello (#mj) from:mjtester');
  });
});
