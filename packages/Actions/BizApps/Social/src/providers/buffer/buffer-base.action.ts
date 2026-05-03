import { RegisterClass } from '@memberjunction/global';
import { BaseSocialMediaAction, SocialPost, SocialAnalytics, MediaFile } from '../../base/base-social.action';
import { LogStatus } from '@memberjunction/core';
import axios from 'axios';
import { BaseAction } from '@memberjunction/actions';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';

// ---------------------------------------------------------------------------
// Buffer API string unions
// ---------------------------------------------------------------------------

export type BufferPostStatus = 'draft' | 'buffer' | 'sent' | 'failed' | 'canceled' | 'approved' | 'rejected';
export type BufferShareMode = 'addToQueue' | 'shareNext' | 'shareNow' | 'customScheduled';

const MAX_SEARCH_PAGES = 50;
const MAX_RATE_LIMIT_RETRIES = 3;

// ---------------------------------------------------------------------------
// GraphQL response types
// ---------------------------------------------------------------------------

interface GraphQLErrorEntry {
  message: string;
  locations?: Array<{ line: number; column: number }>;
  path?: string[];
  extensions?: Record<string, unknown>;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: GraphQLErrorEntry[];
}

// ---------------------------------------------------------------------------
// Buffer domain types (GraphQL schema)
// ---------------------------------------------------------------------------

export interface BufferChannel {
  id: string;
  name: string;
  service: string;
  displayName: string;
  avatar: string;
  isDisconnected: boolean;
  type: string;
  timezone: string;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
  isQueuePaused: boolean;
  serviceId: string;
}

export interface BufferAssets {
  images?: Array<{ url: string; thumbnailUrl?: string }>;
  videos?: Array<{ url: string; thumbnailUrl?: string }>;
  documents?: Array<{ url: string; title?: string }>;
  link?: { url: string; title?: string; description?: string; thumbnailUrl?: string };
}

export interface BufferPost {
  id: string;
  text: string;
  status: BufferPostStatus;
  dueAt: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
  channelId: string;
  channelService: string;
  schedulingType: string;
  via: string;
  assets: BufferAssets | null;
  tags: Array<{ id: string; name: string }>;
}

interface BufferPageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

interface BufferPostsConnection {
  edges: Array<{ node: BufferPost }>;
  pageInfo: BufferPageInfo;
  totalCount: number;
}

interface BufferOrganization {
  id: string;
  name: string;
}

interface BufferAccount {
  id: string;
  name: string;
  organizations: BufferOrganization[];
}

// ---------------------------------------------------------------------------
// Query/mutation data shapes
// ---------------------------------------------------------------------------

interface AccountQueryData {
  account: BufferAccount;
}

interface ChannelsQueryData {
  channels: BufferChannel[];
}

interface PostsQueryData {
  posts: BufferPostsConnection;
}

interface PostMutationResult {
  post?: BufferPost;
  message?: string;
}

interface CreatePostMutationData {
  createPost: PostMutationResult;
}

interface DeletePostMutationData {
  deletePost: PostMutationResult;
}

// ---------------------------------------------------------------------------
// Custom error
// ---------------------------------------------------------------------------

export class BufferGraphQLError extends Error {
  public readonly Extensions?: Record<string, unknown>;

  constructor(message: string, extensions?: Record<string, unknown>) {
    super(message);
    this.name = 'BufferGraphQLError';
    this.Extensions = extensions;
  }
}

// ---------------------------------------------------------------------------
// GraphQL documents
// ---------------------------------------------------------------------------

const ACCOUNT_QUERY = `
  query GetAccount {
    account {
      id
      name
      organizations { id name }
    }
  }
`;

const CHANNELS_QUERY = `
  query GetChannels($input: ChannelsInput!) {
    channels(input: $input) {
      id name service displayName avatar
      isDisconnected type timezone organizationId
      createdAt updatedAt isQueuePaused serviceId
    }
  }
`;

const POSTS_QUERY = `
  query GetPosts($input: PostsInput!, $first: Int, $after: String) {
    posts(input: $input, first: $first, after: $after) {
      edges {
        node {
          id text status dueAt sentAt createdAt updatedAt
          channelId channelService schedulingType via
          assets {
            images { url thumbnailUrl }
            videos { url thumbnailUrl }
            documents { url title }
            link { url title description thumbnailUrl }
          }
          tags { id name }
        }
      }
      pageInfo { hasNextPage endCursor }
      totalCount
    }
  }
`;

const CREATE_POST_MUTATION = `
  mutation CreatePost($input: CreatePostInput!) {
    createPost(input: $input) {
      ... on PostActionSuccess {
        post {
          id text status dueAt sentAt createdAt
          channelId channelService
        }
      }
      ... on MutationError { message }
    }
  }
`;

const DELETE_POST_MUTATION = `
  mutation DeletePost($input: DeletePostInput!) {
    deletePost(input: $input) {
      ... on PostActionSuccess { post { id } }
      ... on MutationError { message }
    }
  }
`;

// ---------------------------------------------------------------------------
// Base action
// ---------------------------------------------------------------------------

/**
 * Base class for all Buffer social media actions.
 * Uses Buffer's GraphQL API at https://api.buffer.com.
 *
 * Migration note: replaces the deprecated v1 REST API at api.bufferapp.com/1.
 * Key concept renames: profiles → channels, updates → posts.
 */
@RegisterClass(BaseAction, 'BufferBaseAction')
export abstract class BufferBaseAction extends BaseSocialMediaAction {
  protected get platformName(): string {
    return 'Buffer';
  }

  protected get apiBaseUrl(): string {
    return 'https://api.buffer.com';
  }

  /** Common params shared by all Buffer actions. */
  protected get bufferCommonParams(): ActionParam[] {
    return [...this.commonSocialParams, { Name: 'OrganizationID', Type: 'Input', Value: null }];
  }

  // -----------------------------------------------------------------------
  // Action helpers — reduce boilerplate in subclasses
  // -----------------------------------------------------------------------

  /**
   * Validate CompanyIntegrationID and initialize OAuth.
   *
   * Pass the full `RunActionParams` so the per-request provider on `params.Provider` is
   * threaded into `initializeOAuth` (multi-tenant correctness — every entity load/save
   * inside the OAuth flow binds to the request's connection, not the global default).
   *
   * Returns null on success, or an error result.
   */
  protected async ensureAuthenticated(params: RunActionParams): Promise<ActionResultSimple | null> {
    const companyIntegrationId = this.getParamValue(params.Params, 'CompanyIntegrationID');
    if (!companyIntegrationId) {
      return { Success: false, ResultCode: 'MISSING_PARAM', Message: 'CompanyIntegrationID is required', Params: params.Params };
    }
    if (!(await this.initializeOAuth(companyIntegrationId, params))) {
      return { Success: false, ResultCode: 'INVALID_TOKEN', Message: 'Failed to initialize Buffer connection', Params: params.Params };
    }
    return null;
  }

  /** Set an output parameter value by name. */
  protected setOutputParam(params: ActionParam[], name: string, value: unknown): void {
    const param = params.find((p) => p.Name === name);
    if (param) param.Value = value;
  }

  /** Build a standardized error result from a caught exception. */
  protected buildErrorResult(error: unknown, verb: string, params: ActionParam[]): ActionResultSimple {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    const resultCode = this.mapBufferError(error);
    return { Success: false, ResultCode: resultCode, Message: `Failed to ${verb}: ${message}`, Params: params };
  }

  /** Group posts by day using a date accessor. */
  protected groupPostsByDay(posts: SocialPost[], dateField: 'publishedAt' | 'scheduledFor'): Record<string, number> {
    return posts.reduce(
      (acc, post) => {
        const date = dateField === 'scheduledFor' ? post.scheduledFor : post.publishedAt;
        if (date) {
          const day = date.toISOString().split('T')[0];
          acc[day] = (acc[day] || 0) + 1;
        }
        return acc;
      },
      {} as Record<string, number>,
    );
  }

  // -----------------------------------------------------------------------
  // GraphQL execution
  // -----------------------------------------------------------------------

  /** Execute a GraphQL query or mutation against the Buffer API. */
  protected async executeGraphQL<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const token = this.getAccessToken();
    if (!token) {
      throw new Error('No access token available for Buffer API');
    }

    try {
      const response = await axios.post<GraphQLResponse<T>>(
        this.apiBaseUrl,
        { query, variables },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        },
      );

      this.throwOnGraphQLErrors(response.data);

      if (!response.data.data) {
        throw new Error('No data in Buffer GraphQL response');
      }

      return response.data.data;
    } catch (error) {
      return this.handleExecutionError<T>(error, query, variables, 0);
    }
  }

  private throwOnGraphQLErrors<T>(body: GraphQLResponse<T>): void {
    if (body.errors?.length) {
      const first = body.errors[0];
      throw new BufferGraphQLError(first.message, first.extensions);
    }
  }

  private async handleExecutionError<T>(error: unknown, query: string, variables: Record<string, unknown> | undefined, retryCount: number): Promise<T> {
    if (error instanceof BufferGraphQLError) throw error;

    if (axios.isAxiosError(error) && error.response?.status === 429) {
      if (retryCount >= MAX_RATE_LIMIT_RETRIES) {
        throw new Error(`Buffer API rate limit exceeded after ${MAX_RATE_LIMIT_RETRIES} retries`);
      }
      const retryAfter = error.response.headers['retry-after'];
      const seconds = retryAfter ? parseInt(String(retryAfter)) || 60 : 60;
      await this.handleRateLimit(seconds);
      try {
        return await this.executeGraphQL<T>(query, variables);
      } catch (retryError) {
        return this.handleExecutionError<T>(retryError, query, variables, retryCount + 1);
      }
    }

    throw error;
  }

  // -----------------------------------------------------------------------
  // Organization ID resolution
  // -----------------------------------------------------------------------

  /** Resolve org ID from params or by fetching the account's first org. */
  protected async resolveOrganizationId(params: ActionParam[]): Promise<string> {
    const explicit = this.getParamValue(params, 'OrganizationID') as string | null;
    if (explicit) return explicit;

    const data = await this.executeGraphQL<AccountQueryData>(ACCOUNT_QUERY);
    const orgs = data.account.organizations;
    if (orgs.length === 0) {
      throw new Error('No organizations found for this Buffer account');
    }
    return orgs[0].id;
  }

  // -----------------------------------------------------------------------
  // Channel operations
  // -----------------------------------------------------------------------

  /** Fetch all channels for an organization. */
  protected async fetchChannels(organizationId: string): Promise<BufferChannel[]> {
    const data = await this.executeGraphQL<ChannelsQueryData>(CHANNELS_QUERY, {
      input: { organizationId },
    });
    return data.channels;
  }

  // -----------------------------------------------------------------------
  // Post operations
  // -----------------------------------------------------------------------

  /** Fetch posts with optional filters and cursor-based pagination. */
  protected async fetchPosts(
    organizationId: string,
    filters?: {
      channelIds?: string[];
      status?: BufferPostStatus;
      startDate?: string;
      endDate?: string;
      tags?: string[];
    },
    first?: number,
    after?: string,
  ): Promise<BufferPostsConnection> {
    const input = this.buildPostsInput(organizationId, filters);
    const variables: Record<string, unknown> = { input };
    if (first != null) variables.first = first;
    if (after) variables.after = after;

    const data = await this.executeGraphQL<PostsQueryData>(POSTS_QUERY, variables);
    return data.posts;
  }

  private buildPostsInput(
    organizationId: string,
    filters?: {
      channelIds?: string[];
      status?: BufferPostStatus;
      startDate?: string;
      endDate?: string;
      tags?: string[];
    },
  ): Record<string, unknown> {
    const input: Record<string, unknown> = { organizationId };
    if (!filters) return input;

    const filter: Record<string, unknown> = {};
    if (filters.channelIds?.length) filter.channelIds = filters.channelIds;
    if (filters.status) filter.status = filters.status;
    if (filters.startDate) filter.startDate = filters.startDate;
    if (filters.endDate) filter.endDate = filters.endDate;
    if (filters.tags?.length) filter.tags = filters.tags;

    if (Object.keys(filter).length > 0) input.filter = filter;
    return input;
  }

  /** Create a post via the createPost mutation. */
  protected async createBufferPost(input: {
    channelId: string;
    text: string;
    mode?: BufferShareMode;
    dueAt?: string;
    schedulingType?: string;
    assets?: BufferAssets;
    tagIds?: string[];
  }): Promise<BufferPost> {
    const data = await this.executeGraphQL<CreatePostMutationData>(CREATE_POST_MUTATION, { input });

    if (data.createPost.message) {
      throw new BufferGraphQLError(data.createPost.message);
    }
    if (!data.createPost.post) {
      throw new Error('createPost returned no post data');
    }

    return data.createPost.post;
  }

  /** Delete a post via the deletePost mutation. */
  protected async deleteBufferPost(postId: string): Promise<boolean> {
    const data = await this.executeGraphQL<DeletePostMutationData>(DELETE_POST_MUTATION, { input: { postId } });

    if (data.deletePost.message) {
      throw new BufferGraphQLError(data.deletePost.message);
    }

    return !!data.deletePost.post;
  }

  // -----------------------------------------------------------------------
  // Token refresh (API keys don't expire)
  // -----------------------------------------------------------------------

  protected async refreshAccessToken(): Promise<void> {
    LogStatus('Buffer API uses API keys which do not require refresh');
  }

  // -----------------------------------------------------------------------
  // Media upload — not supported as a standalone operation in the GraphQL API
  // -----------------------------------------------------------------------

  protected async uploadSingleMedia(_file: MediaFile): Promise<string> {
    throw new Error(
      'Buffer GraphQL API does not support standalone media upload. ' + 'Pass pre-hosted media URLs via the assets parameter on createPost instead.',
    );
  }

  // -----------------------------------------------------------------------
  // Post search (implements abstract from BaseSocialMediaAction)
  // -----------------------------------------------------------------------

  protected async searchPosts(params: {
    query?: string;
    hashtags?: string[];
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
    channelIds?: string[];
    organizationId?: string;
  }): Promise<SocialPost[]> {
    if (!params.organizationId) {
      throw new Error('OrganizationID is required for searching Buffer posts');
    }

    const filters = this.buildSearchFilters(params);
    const collected = await this.collectSearchResults(params, filters);
    const offset = params.offset || 0;
    return collected.slice(offset, offset + (params.limit || 100));
  }

  private buildSearchFilters(params: { channelIds?: string[]; startDate?: Date; endDate?: Date }): {
    channelIds?: string[];
    status: BufferPostStatus;
    startDate?: string;
    endDate?: string;
  } {
    const filters: { channelIds?: string[]; status: BufferPostStatus; startDate?: string; endDate?: string } = {
      status: 'sent',
    };
    if (params.channelIds?.length) filters.channelIds = params.channelIds;
    if (params.startDate) filters.startDate = params.startDate.toISOString();
    if (params.endDate) filters.endDate = params.endDate.toISOString();
    return filters;
  }

  private async collectSearchResults(
    params: { query?: string; hashtags?: string[]; limit?: number; organizationId?: string },
    filters: { channelIds?: string[]; status: BufferPostStatus; startDate?: string; endDate?: string },
  ): Promise<SocialPost[]> {
    const limit = params.limit || 100;
    const pageSize = Math.min(limit, 100);
    const results: SocialPost[] = [];
    let cursor: string | undefined;
    let hasMore = true;
    let pagesRead = 0;

    while (hasMore && results.length < limit && pagesRead < MAX_SEARCH_PAGES) {
      const connection = await this.fetchPosts(params.organizationId!, filters, pageSize, cursor);
      const posts = connection.edges.map((edge) => this.normalizePost(edge.node));
      const filtered = this.applyClientSideFilters(posts, params.query, params.hashtags);
      results.push(...filtered);

      hasMore = connection.pageInfo.hasNextPage;
      cursor = connection.pageInfo.endCursor || undefined;
      pagesRead++;
    }

    return results;
  }

  /** Apply text/hashtag filters the GraphQL API doesn't support natively. */
  private applyClientSideFilters(posts: SocialPost[], query?: string, hashtags?: string[]): SocialPost[] {
    return posts.filter((post) => {
      if (query && !post.content.toLowerCase().includes(query.toLowerCase())) {
        return false;
      }
      if (hashtags?.length) {
        const postTags = this.extractHashtags(post.content);
        const hasMatch = hashtags.some((tag) => postTags.includes(tag.toLowerCase().replace('#', '')));
        if (!hasMatch) return false;
      }
      return true;
    });
  }

  // -----------------------------------------------------------------------
  // Post normalization
  // -----------------------------------------------------------------------

  protected normalizePost(bufferPost: BufferPost): SocialPost {
    return {
      id: bufferPost.id,
      platform: 'Buffer',
      profileId: bufferPost.channelId,
      content: bufferPost.text || '',
      mediaUrls: this.extractAssetUrls(bufferPost.assets),
      publishedAt: bufferPost.sentAt ? new Date(bufferPost.sentAt) : new Date(bufferPost.createdAt),
      scheduledFor: bufferPost.dueAt ? new Date(bufferPost.dueAt) : undefined,
      platformSpecificData: {
        channelService: bufferPost.channelService,
        status: bufferPost.status,
        via: bufferPost.via,
        schedulingType: bufferPost.schedulingType,
        tags: bufferPost.tags,
      },
    };
  }

  private extractAssetUrls(assets: BufferAssets | null): string[] {
    if (!assets) return [];
    const urls: string[] = [];
    if (assets.images) urls.push(...assets.images.map((img) => img.url));
    if (assets.videos) urls.push(...assets.videos.map((vid) => vid.url));
    if (assets.documents) urls.push(...assets.documents.map((doc) => doc.url));
    if (assets.link) urls.push(assets.link.url);
    return urls;
  }

  // -----------------------------------------------------------------------
  // Analytics normalization (retained for interface compatibility;
  // the GraphQL API does not yet expose analytics)
  // -----------------------------------------------------------------------

  protected normalizeAnalytics(bufferStats: Record<string, number>): SocialAnalytics {
    return {
      impressions: bufferStats['reach'] || 0,
      engagements:
        (bufferStats['clicks'] || 0) +
        (bufferStats['favorites'] || 0) +
        (bufferStats['mentions'] || 0) +
        (bufferStats['retweets'] || 0) +
        (bufferStats['shares'] || 0) +
        (bufferStats['comments'] || 0),
      clicks: bufferStats['clicks'] || 0,
      shares: bufferStats['shares'] || bufferStats['retweets'] || 0,
      comments: bufferStats['comments'] || bufferStats['mentions'] || 0,
      likes: bufferStats['favorites'] || bufferStats['likes'] || 0,
      reach: bufferStats['reach'] || 0,
      saves: undefined,
      videoViews: undefined,
      platformMetrics: bufferStats,
    };
  }

  // -----------------------------------------------------------------------
  // Hashtag extraction
  // -----------------------------------------------------------------------

  protected extractHashtags(content: string): string[] {
    const regex = /#(\w+)/g;
    const hashtags: string[] = [];
    let match;
    while ((match = regex.exec(content)) !== null) {
      hashtags.push(match[1].toLowerCase());
    }
    return hashtags;
  }

  // -----------------------------------------------------------------------
  // Error mapping
  // -----------------------------------------------------------------------

  protected mapBufferError(error: unknown): string {
    if (error instanceof BufferGraphQLError) {
      return this.mapGraphQLErrorCode(error);
    }
    if (axios.isAxiosError(error) && error.response) {
      return this.mapHttpStatusCode(error.response.status, error.response.data);
    }
    return 'PLATFORM_ERROR';
  }

  private mapGraphQLErrorCode(error: BufferGraphQLError): string {
    const code = error.Extensions?.['code'] as string | undefined;
    if (code === 'UNAUTHORIZED') return 'INVALID_TOKEN';
    if (code === 'FORBIDDEN') return 'INSUFFICIENT_PERMISSIONS';
    if (code === 'NOT_FOUND') return 'POST_NOT_FOUND';
    return 'PLATFORM_ERROR';
  }

  private mapHttpStatusCode(status: number, data: unknown): string {
    if (status === 401) return 'INVALID_TOKEN';
    if (status === 429) return 'RATE_LIMIT';
    if (status === 403) return 'INSUFFICIENT_PERMISSIONS';
    if (status === 404) return 'POST_NOT_FOUND';

    if (data && typeof data === 'object') {
      const errorField = (data as Record<string, unknown>)['error'];
      if (typeof errorField === 'string' && errorField.includes('media')) {
        return 'INVALID_MEDIA';
      }
    }

    return 'PLATFORM_ERROR';
  }
}
