import { RegisterClass } from '@memberjunction/global';
import { HootSuiteBaseAction, HootSuitePost } from '../hootsuite-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { LogStatus, LogError } from '@memberjunction/global';
import { MediaFile } from '../../../base/base-social.action';
import { BaseAction } from '@memberjunction/actions';

/**
 * Interface for bulk post data
 */
interface BulkPostData {
  content: string;
  scheduledTime?: string;
  profileIds?: string[];
  mediaFiles?: MediaFile[];
  tags?: string[];
  location?: { latitude: number; longitude: number };
}

/**
 * Action to bulk schedule multiple posts in HootSuite
 */
@RegisterClass(BaseAction, 'HootSuiteBulkSchedulePostsAction')
export class HootSuiteBulkSchedulePostsAction extends HootSuiteBaseAction {
  /**
   * Bulk schedule posts in HootSuite
   */
  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    const { Params, ContextUser } = params;

    try {
      // Initialize OAuth
      const companyIntegrationId = this.getParamValue(Params, 'CompanyIntegrationID');
      if (!(await this.initializeOAuth(companyIntegrationId))) {
        throw new Error('Failed to initialize OAuth connection');
      }

      // Extract parameters
      const posts = this.getParamValue(Params, 'Posts') as BulkPostData[];
      const defaultProfileIds = this.getParamValue(Params, 'DefaultProfileIDs');
      const scheduleInterval = this.getParamValue(Params, 'ScheduleInterval');
      const startTime = this.getParamValue(Params, 'StartTime');
      const skipOnError = this.getParamValue(Params, 'SkipOnError') || true;
      const validateOnly = this.getParamValue(Params, 'ValidateOnly') || false;

      // Validate required parameters
      if (!posts || !Array.isArray(posts) || posts.length === 0) {
        throw new Error('Posts array is required and must not be empty');
      }

      // Get default profiles if not specified
      let defaultProfiles: string[] = [];
      if (defaultProfileIds && Array.isArray(defaultProfileIds)) {
        defaultProfiles = defaultProfileIds;
      } else if (defaultProfileIds && typeof defaultProfileIds === 'string') {
        defaultProfiles = [defaultProfileIds];
      } else {
        // Get all available profiles as default
        const profiles = await this.getSocialProfiles();
        if (profiles.length === 0) {
          throw new Error('No social profiles found. Please specify DefaultProfileIDs.');
        }
        defaultProfiles = profiles.map((p) => p.id);
        LogStatus(`Using ${defaultProfiles.length} default profiles`);
      }

      // Calculate schedule times if interval is specified
      let baseScheduleTime: Date | null = null;
      if (scheduleInterval && startTime) {
        baseScheduleTime = new Date(startTime);
      }

      // Process posts
      const results: any[] = [];
      const errors: any[] = [];
      let successCount = 0;
      let failureCount = 0;

      LogStatus(`Processing ${posts.length} posts for bulk scheduling...`);

      for (let i = 0; i < posts.length; i++) {
        const post = posts[i];
        const postIndex = i + 1;

        try {
          // Validate post data
          this.validateBulkPost(post, postIndex);

          // Calculate scheduled time for this post
          let scheduledTime = post.scheduledTime;
          if (!scheduledTime && baseScheduleTime && scheduleInterval) {
            const offsetMinutes = i * scheduleInterval;
            const postScheduleTime = new Date(baseScheduleTime);
            postScheduleTime.setMinutes(postScheduleTime.getMinutes() + offsetMinutes);
            scheduledTime = postScheduleTime.toISOString();
          }

          // Prepare profile IDs
          const profileIds = post.profileIds || defaultProfiles;

          // If validate only, just check the data
          if (validateOnly) {
            results.push({
              index: postIndex,
              status: 'VALIDATED',
              content: post.content.substring(0, 50) + '...',
              scheduledTime: scheduledTime,
              profileCount: profileIds.length,
            });
            successCount++;
            continue;
          }

          // Upload media if provided
          let mediaIds: string[] = [];
          if (post.mediaFiles && Array.isArray(post.mediaFiles)) {
            LogStatus(`Uploading ${post.mediaFiles.length} media files for post ${postIndex}...`);
            mediaIds = await this.uploadMedia(post.mediaFiles);
          }

          // Create the post
          const postData: any = {
            text: post.content,
            socialProfileIds: profileIds,
            scheduledTime: scheduledTime ? this.formatHootSuiteDate(scheduledTime) : undefined,
            mediaIds: mediaIds.length > 0 ? mediaIds : undefined,
            tags: post.tags,
            location: post.location,
          };

          const response = await this.axiosInstance.post('/messages', postData);
          const createdPost = response.data;

          results.push({
            index: postIndex,
            status: 'SUCCESS',
            postId: createdPost.id,
            content: post.content.substring(0, 50) + '...',
            scheduledTime: createdPost.scheduledTime,
            profileCount: profileIds.length,
          });
          successCount++;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';

          errors.push({
            index: postIndex,
            content: post.content.substring(0, 50) + '...',
            error: errorMessage,
          });
          failureCount++;

          if (!skipOnError) {
            throw new Error(`Failed at post ${postIndex}: ${errorMessage}`);
          }
        }

        // Log progress every 10 posts
        if (i > 0 && (i + 1) % 10 === 0) {
          LogStatus(`Processed ${i + 1}/${posts.length} posts...`);
        }
      }

      // Create summary
      const summary = {
        totalPosts: posts.length,
        successCount: successCount,
        failureCount: failureCount,
        validationOnly: validateOnly,
        processingTime: new Date().toISOString(),
        scheduleRange: baseScheduleTime
          ? {
              start: baseScheduleTime.toISOString(),
              end: new Date(baseScheduleTime.getTime() + (posts.length - 1) * (scheduleInterval || 0) * 60000).toISOString(),
            }
          : null,
      };

      // Update output parameters
      const outputParams = [...Params];
      const resultsParam = outputParams.find((p) => p.Name === 'Results');
      if (resultsParam) resultsParam.Value = results;
      const errorsParam = outputParams.find((p) => p.Name === 'Errors');
      if (errorsParam) errorsParam.Value = errors;
      const summaryParam = outputParams.find((p) => p.Name === 'Summary');
      if (summaryParam) summaryParam.Value = summary;

      const resultCode = failureCount === 0 ? 'SUCCESS' : successCount > 0 ? 'PARTIAL_SUCCESS' : 'FAILED';
      const message = validateOnly
        ? `Validated ${successCount} posts, ${failureCount} failed validation`
        : `Successfully scheduled ${successCount} posts, ${failureCount} failed`;

      return {
        Success: failureCount === 0 || (skipOnError && successCount > 0),
        ResultCode: resultCode,
        Message: message,
        Params: outputParams,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      return {
        Success: false,
        ResultCode: 'ERROR',
        Message: `Failed to bulk schedule posts: ${errorMessage}`,
        Params,
      };
    }
  }

  /**
   * Validate bulk post data
   */
  private validateBulkPost(post: BulkPostData, index: number): void {
    if (!post.content || typeof post.content !== 'string' || post.content.trim().length === 0) {
      throw new Error(`Post ${index}: Content is required and must not be empty`);
    }

    if (post.content.length > 10000) {
      throw new Error(`Post ${index}: Content exceeds maximum length of 10000 characters`);
    }

    if (post.scheduledTime && isNaN(Date.parse(post.scheduledTime))) {
      throw new Error(`Post ${index}: Invalid scheduled time format`);
    }

    if (post.location) {
      if (typeof post.location.latitude !== 'number' || typeof post.location.longitude !== 'number') {
        throw new Error(`Post ${index}: Location must have numeric latitude and longitude`);
      }
    }
  }

  /**
   * Define the parameters this action expects
   */
  public get Params(): ActionParam[] {
    return [
      ...this.oauthParams,
      {
        Name: 'Posts',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'DefaultProfileIDs',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'ScheduleInterval',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'StartTime',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'SkipOnError',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'ValidateOnly',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'Results',
        Type: 'Output',
        Value: null,
      },
      {
        Name: 'Errors',
        Type: 'Output',
        Value: null,
      },
      {
        Name: 'Summary',
        Type: 'Output',
        Value: null,
      },
    ];
  }

  /**
   * Get action description
   */
  public get Description(): string {
    return 'Bulk schedules multiple posts to HootSuite with support for auto-scheduling intervals and validation';
  }
}
