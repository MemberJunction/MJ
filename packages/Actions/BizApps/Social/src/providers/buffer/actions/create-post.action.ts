import { RegisterClass } from '@memberjunction/global';
import { BufferBaseAction, BufferAssets, BufferPost, BufferPostStatus, BufferShareMode } from '../buffer-base.action';
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
 */
function buildAssetsInput(
  imageUrls: string[] | null,
  videoUrls: string[] | null,
  mediaLink: string | null,
  mediaDescription: string | null,
): BufferAssets | undefined {
  const assets: BufferAssets = {};
  let hasAssets = false;

  if (imageUrls?.length) {
    assets.images = imageUrls.map((url) => ({ url }));
    hasAssets = true;
  }
  if (videoUrls?.length) {
    assets.videos = videoUrls.map((url) => ({ url }));
    hasAssets = true;
  }
  if (mediaLink) {
    assets.link = { url: mediaLink, description: mediaDescription || undefined };
    hasAssets = true;
  }

  return hasAssets ? assets : undefined;
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
      { Name: 'CreatedPosts', Type: 'Output', Value: null },
      { Name: 'Summary', Type: 'Output', Value: null },
    ];
  }

  public get Description(): string {
    return 'Creates a new post in Buffer that can be scheduled or posted immediately to one or more channels';
  }
}
