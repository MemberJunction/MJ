import { RegisterClass } from '@memberjunction/global';
import { BufferBaseAction, BufferAssetInput, BufferPost, BufferPostStatus, BufferShareMode } from '../buffer-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';

function resolveShareMode(postNow: boolean, addToTop: boolean, scheduledTime: string | null): BufferShareMode {
  if (postNow) return 'shareNow';
  if (addToTop) return 'shareNext';
  if (scheduledTime) return 'customScheduled';
  return 'addToQueue';
}

/**
 * Builds the assets input from image/video URLs and link params.
 *
 * One `AssetInput` entry per attachment, each naming its kind. Buffer moved
 * createPost to this array form on 2026-05-25 and rejects the older
 * `{ images: [...] }` object, which is why this does not build a `BufferAssets`.
 */
function buildAssetsInput(
  imageUrls: string[] | null,
  videoUrls: string[] | null,
  mediaLink: string | null,
  mediaDescription: string | null,
): BufferAssetInput[] | undefined {
  const assets: BufferAssetInput[] = [];

  for (const url of imageUrls ?? []) {
    if (url) assets.push({ image: { url } });
  }
  for (const url of videoUrls ?? []) {
    if (url) assets.push({ video: { url } });
  }
  if (mediaLink) {
    assets.push({ link: { url: mediaLink, description: mediaDescription || undefined } });
  }

  return assets.length > 0 ? assets : undefined;
}

/**
 * Read the `PlatformMetadata` param, accepted as an object or as a JSON string —
 * both forms arrive, from typed callers and from agent/UI inputs respectively.
 *
 * Unparseable JSON throws rather than being dropped: metadata carries things like
 * LinkedIn @mention annotations, and posting the text without them silently
 * publishes something different from what the caller composed.
 */
function parsePlatformMetadata(value: unknown): Record<string, unknown> | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value === 'string') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new Error('PlatformMetadata was a string but not valid JSON');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('PlatformMetadata must be an object keyed by service name, e.g. { "linkedin": { ... } }');
    }
    return parsed as Record<string, unknown>;
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('PlatformMetadata must be an object keyed by service name, e.g. { "linkedin": { ... } }');
  }
  return value as Record<string, unknown>;
}

interface CreatedPostSummary {
  id: string;
  channelId: string;
  channelService: string;
  status: BufferPostStatus;
  scheduledAt: string | null;
  text: string;
}

function summarizePost(post: BufferPost): CreatedPostSummary {
  return {
    id: post.id,
    channelId: post.channelId,
    channelService: post.channelService,
    status: post.status,
    scheduledAt: post.dueAt,
    text: post.text,
  };
}

/**
 * Creates a new post in Buffer via the GraphQL createPost mutation.
 *
 * The new API accepts one channelId per mutation call. To post to multiple
 * channels, pass an array of ChannelIDs and a separate createPost call is
 * made for each.
 *
 * Two params exist for posting on someone else's behalf. `CredentialID` (on every
 * Buffer action) makes the calls with a token from an `MJ: Credentials` row instead
 * of the tenant's own connection, which is what publishing to an employee's personal
 * channel requires. `PlatformMetadata` passes Buffer's per-service extras through —
 * `{ "linkedin": { "annotations": [...] } }` is how an @mention survives the trip,
 * and without it the post publishes as plain text with the mention spelled out.
 */
@RegisterClass(BaseAction, 'BufferCreatePostAction')
export class BufferCreatePostAction extends BufferBaseAction {
  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    const { Params } = params;

    try {
      const channelIds = this.getParamValue(Params, 'ChannelIDs') as string[] | null;
      const content = this.getParamValue(Params, 'Content') as string | null;
      const imageUrls = this.getParamValue(Params, 'ImageURLs') as string[] | null;
      const videoUrls = this.getParamValue(Params, 'VideoURLs') as string[] | null;
      const mediaLink = this.getParamValue(Params, 'MediaLink') as string | null;
      const mediaDescription = this.getParamValue(Params, 'MediaDescription') as string | null;
      const scheduledTime = this.getParamValue(Params, 'ScheduledTime') as string | null;
      const postNow = this.getParamValue(Params, 'PostNow') === true;
      const addToTop = this.getParamValue(Params, 'AddToTop') === true;
      const platformMetadata = parsePlatformMetadata(this.getParamValue(Params, 'PlatformMetadata'));

      if (!channelIds?.length) throw new Error('ChannelIDs array is required with at least one channel');
      if (!content && !imageUrls?.length && !videoUrls?.length && !mediaLink) {
        throw new Error('Content, ImageURLs, VideoURLs, or MediaLink is required');
      }

      const authError = await this.ensureAuthenticated(params);
      if (authError) return authError;

      const mode = resolveShareMode(postNow, addToTop, scheduledTime);
      const assets = buildAssetsInput(imageUrls, videoUrls, mediaLink, mediaDescription);
      const dueAt = scheduledTime ? new Date(scheduledTime).toISOString() : undefined;

      const results = await Promise.allSettled(
        channelIds.map((channelId) =>
          this.createBufferPost({
            channelId,
            text: content || '',
            mode,
            dueAt,
            assets,
            metadata: platformMetadata,
          }),
        ),
      );

      const succeeded = results
        .filter((r): r is PromiseSettledResult<BufferPost> & { status: 'fulfilled' } => r.status === 'fulfilled')
        .map((r) => summarizePost(r.value));
      const failed = results
        .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
        .map((r) => (r.reason instanceof Error ? r.reason.message : String(r.reason)));

      const summary = {
        totalCreated: succeeded.length,
        totalFailed: failed.length,
        channels: channelIds,
        scheduled: mode !== 'shareNow',
        scheduledTime: scheduledTime || null,
        hasMedia: !!assets,
        errors: failed.length > 0 ? failed : undefined,
      };

      this.setOutputParam(Params, 'CreatedPosts', succeeded);
      this.setOutputParam(Params, 'Summary', summary);

      if (succeeded.length === 0) {
        return { Success: false, ResultCode: 'CREATE_FAILED', Message: `Failed to create posts: ${failed.join('; ')}`, Params };
      }

      const msg =
        failed.length > 0 ? `Created ${succeeded.length} post(s), ${failed.length} failed` : `Successfully created ${succeeded.length} Buffer post(s)`;
      return { Success: true, ResultCode: 'SUCCESS', Message: msg, Params };
    } catch (error) {
      return this.buildErrorResult(error, 'create Buffer post', Params);
    }
  }

  public get Params(): ActionParam[] {
    return [
      ...this.bufferCommonParams,
      { Name: 'ChannelIDs', Type: 'Input', Value: null },
      { Name: 'Content', Type: 'Input', Value: null },
      { Name: 'ImageURLs', Type: 'Input', Value: null },
      { Name: 'VideoURLs', Type: 'Input', Value: null },
      { Name: 'MediaLink', Type: 'Input', Value: null },
      { Name: 'MediaDescription', Type: 'Input', Value: null },
      { Name: 'ScheduledTime', Type: 'Input', Value: null },
      { Name: 'PostNow', Type: 'Input', Value: false },
      { Name: 'AddToTop', Type: 'Input', Value: false },
      { Name: 'PlatformMetadata', Type: 'Input', Value: null },
      { Name: 'CreatedPosts', Type: 'Output', Value: null },
      { Name: 'Summary', Type: 'Output', Value: null },
    ];
  }

  public get Description(): string {
    return 'Creates a new post in Buffer that can be scheduled or posted immediately to one or more channels';
  }
}
