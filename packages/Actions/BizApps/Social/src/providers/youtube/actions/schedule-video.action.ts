import { RegisterClass } from '@memberjunction/global';
import { YouTubeBaseAction } from '../youtube-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';

/**
 * Action to schedule a YouTube video for publishing
 */
@RegisterClass(YouTubeBaseAction, 'YouTubeScheduleVideoAction')
export class YouTubeScheduleVideoAction extends YouTubeBaseAction {
    /**
     * Schedule a video for publishing on YouTube
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const { Params, ContextUser } = params;
        
        try {
            // Initialize OAuth
            const companyIntegrationId = this.getParamValue(Params, 'CompanyIntegrationID');
            if (!companyIntegrationId) {
                throw new Error('CompanyIntegrationID is required');
            }

            const initialized = await this.initializeOAuth(companyIntegrationId);
            if (!initialized) {
                throw new Error('Failed to initialize YouTube OAuth connection');
            }

            // Extract parameters
            const videoId = this.getParamValue(Params, 'VideoID');
            const publishAt = this.getParamValue(Params, 'PublishAt');
            const notifySubscribers = this.getParamValue(Params, 'NotifySubscribers') ?? true;
            const premiereTiming = this.getParamValue(Params, 'PremiereTiming');
            const enableChat = this.getParamValue(Params, 'EnableChat') ?? false;

            // Validate required parameters
            if (!videoId) {
                throw new Error('VideoID is required');
            }
            if (!publishAt) {
                throw new Error('PublishAt date/time is required');
            }

            // Validate publish date is in the future
            const publishDate = new Date(publishAt);
            if (publishDate <= new Date()) {
                throw new Error('PublishAt must be a future date/time');
            }

            // Get current video details
            const currentVideo = await this.makeYouTubeRequest<any>(
                '/videos',
                'GET',
                undefined,
                {
                    part: 'snippet,status',
                    id: videoId
                },
                ContextUser
            );

            if (!currentVideo.items || currentVideo.items.length === 0) {
                throw new Error(`Video not found: ${videoId}`);
            }

            const video = currentVideo.items[0];
            
            // Verify video is currently private
            if (video.status.privacyStatus !== 'private') {
                throw new Error(`Video must be private to schedule. Current status: ${video.status.privacyStatus}`);
            }

            // Prepare update data
            const updateData: any = {
                id: videoId,
                status: {
                    privacyStatus: 'private', // Keep private until publish time
                    publishAt: this.formatDate(publishDate),
                    selfDeclaredMadeForKids: video.status.selfDeclaredMadeForKids,
                    notifySubscribers: notifySubscribers
                }
            };

            // Handle premiere settings
            if (premiereTiming === 'premiere') {
                // Set up as a premiere
                updateData.status.privacyStatus = 'unlisted'; // Premieres start as unlisted
                updateData.liveStreamingDetails = {
                    scheduledStartTime: this.formatDate(publishDate),
                    enableLowLatency: false,
                    enableAutoStart: true,
                    enableDvr: true
                };
                
                if (enableChat) {
                    updateData.liveStreamingDetails.enableClosedCaptions = false;
                    updateData.liveStreamingDetails.enableContentEncryption = false;
                    updateData.liveStreamingDetails.enableEmbed = true;
                }
            }

            // Update the video
            const updateResponse = await this.makeYouTubeRequest<any>(
                '/videos',
                'PUT',
                updateData,
                {
                    part: 'status' + (premiereTiming === 'premiere' ? ',liveStreamingDetails' : '')
                },
                ContextUser
            );

            // Get updated video details
            const updatedVideo = await this.makeYouTubeRequest<any>(
                '/videos',
                'GET',
                undefined,
                {
                    part: 'snippet,status,contentDetails' + (premiereTiming === 'premiere' ? ',liveStreamingDetails' : ''),
                    id: videoId
                },
                ContextUser
            );

            const finalVideo = updatedVideo.items[0];

            // Calculate time until publish
            const timeUntilPublish = publishDate.getTime() - Date.now();
            const hoursUntilPublish = Math.floor(timeUntilPublish / (1000 * 60 * 60));
            const minutesUntilPublish = Math.floor((timeUntilPublish % (1000 * 60 * 60)) / (1000 * 60));

            // Prepare result
            const result = {
                videoId: finalVideo.id,
                videoUrl: `https://www.youtube.com/watch?v=${finalVideo.id}`,
                title: finalVideo.snippet.title,
                scheduledFor: finalVideo.status.publishAt,
                scheduledForLocal: new Date(finalVideo.status.publishAt).toLocaleString(),
                timeUntilPublish: {
                    hours: hoursUntilPublish,
                    minutes: minutesUntilPublish,
                    formatted: `${hoursUntilPublish}h ${minutesUntilPublish}m`
                },
                privacyStatus: finalVideo.status.privacyStatus,
                notifySubscribers: notifySubscribers,
                isPremiere: premiereTiming === 'premiere',
                premiereDetails: premiereTiming === 'premiere' ? {
                    scheduledStartTime: finalVideo.liveStreamingDetails?.scheduledStartTime,
                    chatEnabled: enableChat
                } : null,
                thumbnails: finalVideo.snippet.thumbnails,
                duration: finalVideo.contentDetails.duration,
                quotaCost: this.getQuotaCost('videos.update')
            };

            // Update output parameters
            const outputParams = [...Params];
            const scheduleDetailsParam = outputParams.find(p => p.Name === 'ScheduleDetails');
            if (scheduleDetailsParam) scheduleDetailsParam.Value = result;
            const scheduledTimeParam = outputParams.find(p => p.Name === 'ScheduledTime');
            if (scheduledTimeParam) scheduledTimeParam.Value = result.scheduledFor;

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Video scheduled successfully for ${result.scheduledForLocal} (${result.timeUntilPublish.formatted} from now)`,
                Params: outputParams
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            
            return {
                Success: false,
                ResultCode: this.getErrorCode(errorMessage),
                Message: `Failed to schedule video: ${errorMessage}`,
                Params
            };
        }
    }

    /**
     * Get error code from error message
     */
    private getErrorCode(message: string): string {
        if (message.includes('quota')) return 'QUOTA_EXCEEDED';
        if (message.includes('401') || message.includes('unauthorized')) return 'INVALID_TOKEN';
        if (message.includes('403') || message.includes('forbidden')) return 'INSUFFICIENT_PERMISSIONS';
        if (message.includes('404')) return 'NOT_FOUND';
        if (message.includes('rate limit')) return 'RATE_LIMIT';
        if (message.includes('future')) return 'INVALID_DATE';
        if (message.includes('private')) return 'INVALID_STATUS';
        return 'ERROR';
    }

    /**
     * Define the parameters this action expects
     */
    public get Params(): ActionParam[] {
        const baseParams = this.commonSocialParams;
        const specificParams: ActionParam[] = [
            {
                Name: 'VideoID',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'PublishAt',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'NotifySubscribers',
                Type: 'Input',
                Value: true
            },
            {
                Name: 'PremiereTiming',
                Type: 'Input',
                Value: 'standard'
            },
            {
                Name: 'EnableChat',
                Type: 'Input',
                Value: false
            },
            {
                Name: 'ScheduleDetails',
                Type: 'Output',
                Value: null
            },
            {
                Name: 'ScheduledTime',
                Type: 'Output',
                Value: null
            }
        ];
        return [...baseParams, ...specificParams];
    }

    /**
     * Metadata about this action
     */
    public get Description(): string {
        return 'Schedules a private YouTube video to be published at a specific date/time with optional premiere settings';
    }
}