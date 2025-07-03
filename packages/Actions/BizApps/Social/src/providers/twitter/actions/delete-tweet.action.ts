import { RegisterClass } from '@memberjunction/global';
import { TwitterBaseAction } from '../twitter-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { LogStatus, LogError } from '@memberjunction/core';

/**
 * Action to delete a tweet from Twitter/X
 */
@RegisterClass(BaseAction, 'TwitterDeleteTweetAction')
export class TwitterDeleteTweetAction extends TwitterBaseAction {
    /**
     * Delete a tweet from Twitter
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const { Params, ContextUser } = params;
        
        try {
            // Initialize OAuth
            const companyIntegrationId = this.getParamValue(Params, 'CompanyIntegrationID');
            if (!await this.initializeOAuth(companyIntegrationId)) {
                throw new Error('Failed to initialize OAuth connection');
            }

            // Extract parameters
            const tweetId = this.getParamValue(Params, 'TweetID');
            const confirmDeletion = this.getParamValue(Params, 'ConfirmDeletion') === true;

            // Validate required parameters
            if (!tweetId) {
                throw new Error('TweetID is required');
            }

            // Safety check - require explicit confirmation
            if (!confirmDeletion) {
                return {
                    Success: false,
                    ResultCode: 'CONFIRMATION_REQUIRED',
                    Message: 'Tweet deletion requires explicit confirmation. Set ConfirmDeletion to true.',
                    Params
                };
            }

            // Get the tweet details before deletion (for output)
            let tweetDetails: any = null;
            try {
                LogStatus(`Retrieving tweet details for ID: ${tweetId}...`);
                const response = await this.axiosInstance.get(`/tweets/${tweetId}`, {
                    params: {
                        'tweet.fields': 'id,text,created_at,author_id,public_metrics',
                        'expansions': 'author_id',
                        'user.fields': 'id,username'
                    }
                });

                if (response.data.data) {
                    tweetDetails = {
                        id: response.data.data.id,
                        text: response.data.data.text,
                        createdAt: response.data.data.created_at,
                        metrics: response.data.data.public_metrics
                    };

                    // Verify ownership
                    const currentUser = await this.getCurrentUser();
                    if (response.data.data.author_id !== currentUser.id) {
                        throw new Error('You can only delete your own tweets');
                    }
                }
            } catch (error) {
                // If we can't retrieve the tweet, it might already be deleted or we don't have access
                LogStatus('Could not retrieve tweet details. It may already be deleted or inaccessible.');
            }

            // Delete the tweet
            LogStatus(`Deleting tweet ID: ${tweetId}...`);
            await this.deleteTweet(tweetId);

            // Update output parameters
            const outputParams = [...Params];
            const deletedDetailsParam = outputParams.find(p => p.Name === 'DeletedTweetDetails');
            if (deletedDetailsParam && tweetDetails) deletedDetailsParam.Value = tweetDetails;
            const deletionTimeParam = outputParams.find(p => p.Name === 'DeletionTime');
            if (deletionTimeParam) deletionTimeParam.Value = new Date().toISOString();

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Successfully deleted tweet (ID: ${tweetId})`,
                Params: outputParams
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            
            return {
                Success: false,
                ResultCode: this.getErrorCode(error),
                Message: `Failed to delete tweet: ${errorMessage}`,
                Params
            };
        }
    }

    /**
     * Get error code based on error type
     */
    private getErrorCode(error: any): string {
        if (error instanceof Error) {
            if (error.message.includes('Rate Limit')) return 'RATE_LIMIT';
            if (error.message.includes('Unauthorized')) return 'INVALID_TOKEN';
            if (error.message.includes('Not Found')) return 'TWEET_NOT_FOUND';
            if (error.message.includes('Forbidden')) return 'INSUFFICIENT_PERMISSIONS';
            if (error.message.includes('own tweets')) return 'NOT_OWNER';
        }
        return 'ERROR';
    }

    /**
     * Define the parameters this action expects
     */
    public get Params(): ActionParam[] {
        return [
            ...this.commonSocialParams,
            {
                Name: 'TweetID',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'ConfirmDeletion',
                Type: 'Input',
                Value: false
            },
            {
                Name: 'DeletedTweetDetails',
                Type: 'Output',
                Value: null
            },
            {
                Name: 'DeletionTime',
                Type: 'Output',
                Value: null
            }
        ];
    }

    /**
     * Get action description
     */
    public get Description(): string {
        return 'Deletes a tweet from Twitter/X. Requires explicit confirmation and ownership of the tweet.';
    }
}