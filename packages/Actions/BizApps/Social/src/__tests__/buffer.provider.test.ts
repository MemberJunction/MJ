import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Per-action tests for the Buffer provider.
 *
 * Buffer talks GraphQL over `HttpPost(apiBaseUrl, { query, variables })`,
 * so the module-level network-utils mock captures the exact mutation/query text and
 * variables each action sends. BaseOAuthAction is mocked so OAuth succeeds by
 * default. Base behaviors (normalizePost, mapBufferError, extractHashtags)
 * are covered in social.test.ts.
 */

const http = vi.hoisted(() => {
  const standalone = {
    HttpGet: vi.fn(),
    HttpPost: vi.fn(),
    HttpPut: vi.fn(),
    HttpPatch: vi.fn(),
    HttpDelete: vi.fn(),
    HttpHead: vi.fn(),
    HttpRequest: vi.fn(),
  };
  return { standalone };
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
import type { BufferPost } from '../providers/buffer/buffer-base.action';
import { BufferCreatePostAction } from '../providers/buffer/actions/create-post.action';
import { BufferDeletePostAction } from '../providers/buffer/actions/delete-post.action';
import { BufferGetAnalyticsAction } from '../providers/buffer/actions/get-analytics.action';
import { BufferGetChannelsAction } from '../providers/buffer/actions/get-channels.action';
import { BufferGetPendingPostsAction } from '../providers/buffer/actions/get-pending-posts.action';
import { BufferGetSentPostsAction } from '../providers/buffer/actions/get-sent-posts.action';
import { BufferReorderQueueAction } from '../providers/buffer/actions/reorder-queue.action';
import { BufferSearchPostsAction } from '../providers/buffer/actions/search-posts.action';

const contextUser = { ID: 'user-1', Name: 'Test User', Email: 'test@example.com' } as unknown as UserInfo;

type RunnableAction = { InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> };
type GraphQLBody = { query: string; variables?: Record<string, unknown> };

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

/**
 * Routes GraphQL calls by a substring of the operation text (e.g. 'createPost',
 * 'account', 'channels', 'posts').
 */
function mockGraphQL(routes: Array<{ match: string; data: unknown }>): void {
  http.standalone.HttpPost.mockImplementation((_url: string, body: GraphQLBody) => {
    for (const route of routes) {
      if (body.query.includes(route.match)) {
        return Promise.resolve({ Data: { data: route.data }, Headers: {}, Status: 200 });
      }
    }
    return Promise.reject(new Error(`Unmocked GraphQL operation: ${body.query.slice(0, 60)}`));
  });
}

function graphQLCalls(): Array<{ url: string; body: GraphQLBody }> {
  return http.standalone.HttpPost.mock.calls.map((call) => ({ url: call[0] as string, body: call[1] as GraphQLBody }));
}

function makeBufferPost(overrides: Partial<BufferPost> = {}): BufferPost {
  return {
    id: 'post-1',
    text: 'Hello Buffer #mj',
    status: 'sent',
    dueAt: null,
    sentAt: '2024-06-15T10:00:00Z',
    createdAt: '2024-06-15T09:00:00Z',
    updatedAt: '2024-06-15T10:00:00Z',
    channelId: 'ch-1',
    channelService: 'twitter',
    schedulingType: 'automatic_publishing',
    via: 'api',
    assets: null,
    tags: [],
    ...overrides,
  };
}

const postsConnection = (posts: BufferPost[], hasNextPage = false) => ({
  edges: posts.map((node) => ({ node })),
  pageInfo: { hasNextPage, endCursor: hasNextPage ? 'cursor-1' : null },
  totalCount: posts.length,
});

beforeEach(() => {
  http.standalone.HttpPost.mockReset();
});

// ─── BufferCreatePostAction ─────────────────────────────────────────────────

describe('BufferCreatePostAction', () => {
  let action: BufferCreatePostAction;

  beforeEach(() => {
    action = new BufferCreatePostAction();
  });

  it('should fail with PLATFORM_ERROR when ChannelIDs is missing', async () => {
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1', Content: 'Hi' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('PLATFORM_ERROR');
    expect(result.Message).toBe('Failed to create Buffer post: ChannelIDs array is required with at least one channel');
  });

  it('should fail when no content or media is provided', async () => {
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1', ChannelIDs: ['ch-1'] }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('PLATFORM_ERROR');
    expect(result.Message).toBe('Failed to create Buffer post: Content, ImageURLs, VideoURLs, or MediaLink is required');
  });

  it('should fail with MISSING_PARAM when CompanyIntegrationID is missing', async () => {
    const result = await run(action, inputs({ ChannelIDs: ['ch-1'], Content: 'Hi' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('MISSING_PARAM');
    expect(result.Message).toBe('CompanyIntegrationID is required');
  });

  it('should fail with INVALID_TOKEN when OAuth initialization fails', async () => {
    vi.spyOn(action as never, 'initializeOAuth').mockResolvedValue(false as never);
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1', ChannelIDs: ['ch-1'], Content: 'Hi' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('INVALID_TOKEN');
    expect(result.Message).toBe('Failed to initialize Buffer connection');
  });

  it('should send a createPost mutation per channel with the exact input', async () => {
    mockGraphQL([
      { match: 'createPost', data: { createPost: { post: makeBufferPost({ id: 'new-1', status: 'buffer' }) } } },
    ]);

    const result = await run(
      action,
      inputs(
        { CompanyIntegrationID: 'ci-1', ChannelIDs: ['ch-1'], Content: 'Queued post', ImageURLs: ['https://img/1.jpg'] },
        ['CreatedPosts', 'Summary'],
      ),
    );

    const calls = graphQLCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.buffer.com');
    expect(calls[0].body.variables).toEqual({
      input: {
        channelId: 'ch-1',
        text: 'Queued post',
        mode: 'addToQueue',
        dueAt: undefined,
        assets: { images: [{ url: 'https://img/1.jpg' }] },
      },
    });
    expect(result.Success).toBe(true);
    expect(result.ResultCode).toBe('SUCCESS');
    expect(result.Message).toBe('Successfully created 1 Buffer post(s)');
    const created = outParam(result, 'CreatedPosts') as Array<{ id: string; channelId: string }>;
    expect(created[0].id).toBe('new-1');
    expect(created[0].channelId).toBe('ch-1');
  });

  it('should use shareNow mode when PostNow is true', async () => {
    mockGraphQL([{ match: 'createPost', data: { createPost: { post: makeBufferPost() } } }]);

    await run(action, inputs({ CompanyIntegrationID: 'ci-1', ChannelIDs: ['ch-1'], Content: 'Now', PostNow: true }));

    const variables = graphQLCalls()[0].body.variables as { input: { mode: string } };
    expect(variables.input.mode).toBe('shareNow');
  });

  it('should return CREATE_FAILED when every channel fails', async () => {
    mockGraphQL([{ match: 'createPost', data: { createPost: { message: 'Channel not connected' } } }]);

    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1', ChannelIDs: ['ch-1'], Content: 'X' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('CREATE_FAILED');
    expect(result.Message).toBe('Failed to create posts: Channel not connected');
  });
});

// ─── BufferDeletePostAction ─────────────────────────────────────────────────

describe('BufferDeletePostAction', () => {
  let action: BufferDeletePostAction;

  beforeEach(() => {
    action = new BufferDeletePostAction();
  });

  it('should fail when PostID is missing', async () => {
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('PLATFORM_ERROR');
    expect(result.Message).toBe('Failed to delete post: PostID is required');
  });

  it('should send the deletePost mutation with the postId input', async () => {
    mockGraphQL([{ match: 'deletePost', data: { deletePost: { post: makeBufferPost() } } }]);

    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1', PostID: 'post-1' }, ['Deleted', 'Summary']));

    expect(graphQLCalls()[0].body.variables).toEqual({ input: { postId: 'post-1' } });
    expect(result.Success).toBe(true);
    expect(result.ResultCode).toBe('SUCCESS');
    expect(result.Message).toBe('Successfully deleted Buffer post post-1');
    expect(outParam(result, 'Deleted')).toBe(true);
  });

  it('should return DELETE_FAILED when the mutation returns no post', async () => {
    mockGraphQL([{ match: 'deletePost', data: { deletePost: { post: null } } }]);
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1', PostID: 'post-1' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('DELETE_FAILED');
    expect(result.Message).toBe('Failed to delete Buffer post post-1');
  });
});

// ─── BufferGetAnalyticsAction / BufferReorderQueueAction (NOT_SUPPORTED) ────

describe('BufferGetAnalyticsAction', () => {
  it('should always return NOT_SUPPORTED (Buffer GraphQL API has no analytics)', async () => {
    const result = await run(new BufferGetAnalyticsAction(), inputs({ CompanyIntegrationID: 'ci-1', PostID: 'p-1' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('NOT_SUPPORTED');
    expect(result.Message).toContain('Buffer analytics are not available');
    expect(http.standalone.HttpPost).not.toHaveBeenCalled();
  });
});

describe('BufferReorderQueueAction', () => {
  it('should always return NOT_SUPPORTED (no queue reorder mutation)', async () => {
    const result = await run(new BufferReorderQueueAction(), inputs({ CompanyIntegrationID: 'ci-1', ChannelID: 'ch-1' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('NOT_SUPPORTED');
    expect(result.Message).toContain('Queue reordering is not available');
    expect(http.standalone.HttpPost).not.toHaveBeenCalled();
  });
});

// ─── BufferGetChannelsAction ────────────────────────────────────────────────

describe('BufferGetChannelsAction', () => {
  let action: BufferGetChannelsAction;

  beforeEach(() => {
    action = new BufferGetChannelsAction();
  });

  it('should fail with MISSING_PARAM when CompanyIntegrationID is missing', async () => {
    const result = await run(action, inputs({}));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('MISSING_PARAM');
    expect(result.Message).toBe('CompanyIntegrationID is required');
  });

  it('should resolve the organization then fetch channels', async () => {
    mockGraphQL([
      { match: 'account', data: { account: { organizations: [{ id: 'org-1', name: 'Org' }] } } },
      {
        match: 'channels',
        data: {
          channels: [
            {
              id: 'ch-1',
              service: 'twitter',
              displayName: 'MJ',
              name: 'MJ Handle',
              type: 'profile',
              avatar: 'https://a.png',
              timezone: 'UTC',
              isDisconnected: false,
              isQueuePaused: false,
              createdAt: '2024-01-01T00:00:00Z',
              serviceId: 'svc-1',
            },
          ],
        },
      },
    ]);

    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1' }, ['Channels', 'Summary']));

    const channelsCall = graphQLCalls().find((c) => c.body.query.includes('channels'));
    expect(channelsCall?.body.variables).toEqual({ input: { organizationId: 'org-1' } });
    expect(result.Success).toBe(true);
    expect(result.Message).toBe('Retrieved 1 Buffer channels');
    const summary = outParam(result, 'Summary') as { totalChannels: number; channelsByService: Record<string, number> };
    expect(summary.totalChannels).toBe(1);
    expect(summary.channelsByService).toEqual({ twitter: 1 });
  });

  it('should fail when the Buffer account has no organizations', async () => {
    mockGraphQL([{ match: 'account', data: { account: { organizations: [] } } }]);
    const result = await run(action, inputs({ CompanyIntegrationID: 'ci-1' }));
    expect(result.Success).toBe(false);
    expect(result.Message).toBe('Failed to get Buffer channels: No organizations found for this Buffer account');
  });
});

// ─── BufferGetPendingPostsAction ────────────────────────────────────────────

describe('BufferGetPendingPostsAction', () => {
  let action: BufferGetPendingPostsAction;

  beforeEach(() => {
    action = new BufferGetPendingPostsAction();
  });

  it('should fail with MISSING_PARAM when CompanyIntegrationID is missing', async () => {
    const result = await run(action, inputs({}));
    expect(result.ResultCode).toBe('MISSING_PARAM');
  });

  it('should query posts filtered by status buffer with the channel filter', async () => {
    const pending = makeBufferPost({ id: 'p-queued', status: 'buffer', dueAt: '2024-06-16T12:00:00Z', sentAt: null });
    mockGraphQL([{ match: 'posts', data: { posts: postsConnection([pending]) } }]);

    const result = await run(
      action,
      inputs({ CompanyIntegrationID: 'ci-1', OrganizationID: 'org-1', ChannelID: 'ch-1', Limit: 10 }, ['Posts', 'Summary']),
    );

    expect(graphQLCalls()[0].body.variables).toEqual({
      input: { organizationId: 'org-1', filter: { channelIds: ['ch-1'], status: 'buffer' } },
      first: 10,
    });
    expect(result.Success).toBe(true);
    expect(result.Message).toBe('Retrieved 1 pending posts from Buffer');
    const posts = outParam(result, 'Posts') as Array<{ id: string; scheduledFor?: Date }>;
    expect(posts[0].id).toBe('p-queued');
    expect(posts[0].scheduledFor?.toISOString()).toBe('2024-06-16T12:00:00.000Z');
  });
});

// ─── BufferGetSentPostsAction ───────────────────────────────────────────────

describe('BufferGetSentPostsAction', () => {
  let action: BufferGetSentPostsAction;

  beforeEach(() => {
    action = new BufferGetSentPostsAction();
  });

  it('should fail with MISSING_PARAM when CompanyIntegrationID is missing', async () => {
    const result = await run(action, inputs({}));
    expect(result.ResultCode).toBe('MISSING_PARAM');
  });

  it('should query posts filtered by status sent with ISO date range', async () => {
    mockGraphQL([{ match: 'posts', data: { posts: postsConnection([makeBufferPost()]) } }]);

    const result = await run(
      action,
      inputs(
        {
          CompanyIntegrationID: 'ci-1',
          OrganizationID: 'org-1',
          StartDate: '2024-06-01',
          EndDate: '2024-06-30',
        },
        ['Posts', 'Summary'],
      ),
    );

    expect(graphQLCalls()[0].body.variables).toEqual({
      input: {
        organizationId: 'org-1',
        filter: {
          status: 'sent',
          startDate: new Date('2024-06-01').toISOString(),
          endDate: new Date('2024-06-30').toISOString(),
        },
      },
      first: 20,
    });
    expect(result.Success).toBe(true);
    expect(result.Message).toBe('Retrieved 1 sent posts from Buffer');
  });
});

// ─── BufferSearchPostsAction ────────────────────────────────────────────────

describe('BufferSearchPostsAction', () => {
  let action: BufferSearchPostsAction;

  beforeEach(() => {
    action = new BufferSearchPostsAction();
  });

  it('should fail with MISSING_PARAM when CompanyIntegrationID is missing', async () => {
    const result = await run(action, inputs({ Query: 'x' }));
    expect(result.ResultCode).toBe('MISSING_PARAM');
  });

  it('should search sent posts and apply the client-side text filter', async () => {
    const matching = makeBufferPost({ id: 'hit', text: 'Big announcement today' });
    const nonMatching = makeBufferPost({ id: 'miss', text: 'Unrelated content' });
    mockGraphQL([
      { match: 'account', data: { account: { organizations: [{ id: 'org-1', name: 'Org' }] } } },
      { match: 'posts', data: { posts: postsConnection([matching, nonMatching]) } },
    ]);

    const result = await run(
      action,
      inputs({ CompanyIntegrationID: 'ci-1', Query: 'announcement' }, ['Posts', 'Summary']),
    );

    const postsCall = graphQLCalls().find((c) => c.body.query.includes('posts'));
    const variables = postsCall?.body.variables as { input: { organizationId: string; filter: { status: string } } };
    expect(variables.input.organizationId).toBe('org-1');
    expect(variables.input.filter.status).toBe('sent');
    expect(result.Success).toBe(true);
    expect(result.Message).toBe('Found 1 posts matching search criteria');
    const posts = outParam(result, 'Posts') as Array<{ id: string }>;
    expect(posts).toHaveLength(1);
    expect(posts[0].id).toBe('hit');
  });
});
