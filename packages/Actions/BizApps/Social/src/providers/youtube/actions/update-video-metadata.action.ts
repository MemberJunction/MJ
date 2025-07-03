import { RegisterClass } from '@memberjunction/global';
import { YouTubeBaseAction } from '../youtube-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';

/**
 * Action to update metadata for a YouTube video
 */
@RegisterClass(BaseAction, 'YouTubeUpdateVideoMetadataAction')
export class YouTubeUpdateVideoMetadataAction extends YouTubeBaseAction {
    /**
     * Update video metadata on YouTube
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
            const title = this.getParamValue(Params, 'Title');
            const description = this.getParamValue(Params, 'Description');
            const tags = this.getParamValue(Params, 'Tags');
            const categoryId = this.getParamValue(Params, 'CategoryID');
            const privacyStatus = this.getParamValue(Params, 'PrivacyStatus');
            const embeddable = this.getParamValue(Params, 'Embeddable');
            const publicStatsViewable = this.getParamValue(Params, 'PublicStatsViewable');
            const publishAt = this.getParamValue(Params, 'PublishAt');
            const license = this.getParamValue(Params, 'License');
            const recordingDate = this.getParamValue(Params, 'RecordingDate');
            const thumbnailFile = this.getParamValue(Params, 'ThumbnailFile');

            // Validate required parameters
            if (!videoId) {
                throw new Error('VideoID is required');
            }

            // First, get the current video details to preserve unchanged fields
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
            const currentSnippet = video.snippet;
            const currentStatus = video.status;

            // Build update request with only changed fields
            const updateData: any = {
                id: videoId,
                snippet: {
                    title: title !== undefined ? title : currentSnippet.title,
                    description: description !== undefined ? description : currentSnippet.description,
                    tags: tags !== undefined ? tags : currentSnippet.tags,
                    categoryId: categoryId !== undefined ? categoryId : currentSnippet.categoryId
                },
                status: {
                    privacyStatus: privacyStatus !== undefined ? privacyStatus : currentStatus.privacyStatus,
                    embeddable: embeddable !== undefined ? embeddable : currentStatus.embeddable,
                    publicStatsViewable: publicStatsViewable !== undefined ? publicStatsViewable : currentStatus.publicStatsViewable,
                    selfDeclaredMadeForKids: currentStatus.selfDeclaredMadeForKids // Required field
                }
            };

            // Add optional fields if provided
            if (publishAt) {
                updateData.status.publishAt = this.formatDate(publishAt);
            }
            if (license) {
                updateData.status.license = license;
            }
            if (recordingDate) {
                updateData.recordingDetails = {
                    recordingDate: this.formatDate(recordingDate)
                };
            }

            // Update the video
            const updateResponse = await this.makeYouTubeRequest<any>(
                '/videos',
                'PUT',
                updateData,
                {
                    part: 'snippet,status' + (recordingDate ? ',recordingDetails' : '')
                },
                ContextUser
            );

            // Update thumbnail if provided
            if (thumbnailFile) {
                try {
                    await this.uploadThumbnail(videoId, thumbnailFile);
                } catch (error) {
                    // Log thumbnail upload failure but don't fail the entire operation
                    console.error('Failed to update thumbnail:', error);
                }
            }

            // Get updated video details
            const updatedVideo = await this.makeYouTubeRequest<any>(
                '/videos',
                'GET',
                undefined,
                {
                    part: 'snippet,status,statistics,contentDetails',
                    id: videoId
                },
                ContextUser
            );

            const finalVideo = updatedVideo.items[0];

            // Prepare result
            const result = {
                videoId: finalVideo.id,
                videoUrl: `https://www.youtube.com/watch?v=${finalVideo.id}`,
                updatedFields: this.getUpdatedFields(currentSnippet, currentStatus, finalVideo.snippet, finalVideo.status),
                title: finalVideo.snippet.title,
                description: finalVideo.snippet.description,
                tags: finalVideo.snippet.tags,
                categoryId: finalVideo.snippet.categoryId,
                privacyStatus: finalVideo.status.privacyStatus,
                publishAt: finalVideo.status.publishAt,
                embeddable: finalVideo.status.embeddable,
                publicStatsViewable: finalVideo.status.publicStatsViewable,
                thumbnails: finalVideo.snippet.thumbnails,
                statistics: finalVideo.statistics,
                quotaCost: this.getQuotaCost('videos.update')
            };

            // Update output parameters
            const outputParams = [...Params];
            const videoDetailsParam = outputParams.find(p => p.Name === 'VideoDetails');
            if (videoDetailsParam) videoDetailsParam.Value = result;
            const updatedFieldsParam = outputParams.find(p => p.Name === 'UpdatedFields');
            if (updatedFieldsParam) updatedFieldsParam.Value = result.updatedFields;

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Video metadata updated successfully. ${result.updatedFields.length} fields changed.`,
                Params: outputParams
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            
            return {
                Success: false,
                ResultCode: this.getErrorCode(errorMessage),
                Message: `Failed to update video metadata: ${errorMessage}`,
                Params
            };
        }
    }

    /**
     * Upload thumbnail for a video
     */
    private async uploadThumbnail(videoId: string, thumbnailFile: any): Promise<void> {
        const thumbnailData = Buffer.isBuffer(thumbnailFile.data) 
            ? thumbnailFile.data 
            : Buffer.from(thumbnailFile.data, 'base64');

        // Validate thumbnail
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/bmp'];
        if (!allowedTypes.includes(thumbnailFile.mimeType)) {
            throw new Error('Invalid thumbnail format. Supported formats: JPEG, PNG, GIF, BMP');
        }

        const maxSize = 2 * 1024 * 1024; // 2MB
        if (thumbnailData.length > maxSize) {
            throw new Error(`Thumbnail too large. Maximum size is 2MB`);
        }

        await this.makeYouTubeRequest(
            '/thumbnails/set',
            'POST',
            thumbnailData,
            {
                videoId: videoId
            }
        );
    }

    /**
     * Determine which fields were updated
     */
    private getUpdatedFields(oldSnippet: any, oldStatus: any, newSnippet: any, newStatus: any): string[] {
        const updated: string[] = [];

        if (oldSnippet.title !== newSnippet.title) updated.push('title');
        if (oldSnippet.description !== newSnippet.description) updated.push('description');
        if (JSON.stringify(oldSnippet.tags) !== JSON.stringify(newSnippet.tags)) updated.push('tags');
        if (oldSnippet.categoryId !== newSnippet.categoryId) updated.push('categoryId');
        if (oldStatus.privacyStatus !== newStatus.privacyStatus) updated.push('privacyStatus');
        if (oldStatus.embeddable !== newStatus.embeddable) updated.push('embeddable');
        if (oldStatus.publicStatsViewable !== newStatus.publicStatsViewable) updated.push('publicStatsViewable');
        if (oldStatus.publishAt !== newStatus.publishAt) updated.push('publishAt');

        return updated;
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
                Name: 'Title',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Description',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Tags',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'CategoryID',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'PrivacyStatus',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Embeddable',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'PublicStatsViewable',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'PublishAt',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'License',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'RecordingDate',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'ThumbnailFile',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'VideoDetails',
                Type: 'Output',
                Value: null
            },
            {
                Name: 'UpdatedFields',
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
        return 'Updates metadata for a YouTube video including title, description, tags, privacy settings, and thumbnail';
    }
}