import { RegisterClass } from '@memberjunction/global';
import { FacebookBaseAction, FacebookComment } from '../facebook-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { SocialMediaErrorCode } from '../../../base/base-social.action';
import { LogStatus, LogError } from '@memberjunction/core';
import axios from 'axios';
import { BaseAction } from '@memberjunction/actions';

/**
 * Responds to comments on Facebook posts or other comments.
 * Supports replying to top-level comments and nested replies.
 */
@RegisterClass(BaseAction, 'FacebookRespondToCommentsAction')
export class FacebookRespondToCommentsAction extends FacebookBaseAction {
    /**
     * Get action description
     */
    public get Description(): string {
        return 'Responds to comments on Facebook posts, pages, or other comments with text replies or reactions';
    }

    /**
     * Define the parameters for this action
     */
    public get Params(): ActionParam[] {
        return [
            ...this.commonSocialParams,
            {
                Name: 'CommentID',
                Type: 'Input',
                Value: null,
                },
            {
                Name: 'ResponseText',
                Type: 'Input',
                Value: null,
                },
            {
                Name: 'AttachmentURL',
                Type: 'Input',
                Value: null,
                },
            {
                Name: 'LikeComment',
                Type: 'Input',
                Value: false,
                },
            {
                Name: 'HideComment',
                Type: 'Input',
                Value: false,
                },
            {
                Name: 'DeleteComment',
                Type: 'Input',
                Value: false,
                },
            {
                Name: 'PrivateReply',
                Type: 'Input',
                Value: false,
                },
            {
                Name: 'PageID',
                Type: 'Input',
                Value: null,
                }
        ];
    }

    /**
     * Execute the action
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const { Params, ContextUser } = params;
        
        try {
            // Validate required parameters
            const companyIntegrationId = this.getParamValue(Params, 'CompanyIntegrationID');
            const commentId = this.getParamValue(Params, 'CommentID');
            
            if (!companyIntegrationId) {
                return {
                Success: false,
                Message: 'CompanyIntegrationID is required',
                ResultCode: 'INVALID_TOKEN'
            };
            }

            if (!commentId) {
                return {
                Success: false,
                Message: 'CommentID is required',
                ResultCode: 'MISSING_REQUIRED_PARAM'
            };
            }

            // Initialize OAuth
            if (!await this.initializeOAuth(companyIntegrationId)) {
                return {
                Success: false,
                Message: 'Failed to initialize Facebook OAuth connection',
                ResultCode: 'INVALID_TOKEN'
            };
            }

            // Get parameters
            const responseText = this.getParamValue(Params, 'ResponseText') as string;
            const attachmentUrl = this.getParamValue(Params, 'AttachmentURL') as string;
            const likeComment = this.getParamValue(Params, 'LikeComment') as boolean;
            const hideComment = this.getParamValue(Params, 'HideComment') as boolean;
            const deleteComment = this.getParamValue(Params, 'DeleteComment') as boolean;
            const privateReply = this.getParamValue(Params, 'PrivateReply') as boolean;
            const pageId = this.getParamValue(Params, 'PageID') as string;

            // Validate that at least one action is specified
            if (!responseText && !attachmentUrl && !likeComment && !hideComment && !deleteComment) {
                return {
                Success: false,
                Message: 'At least one action (ResponseText, AttachmentURL, LikeComment, HideComment, or DeleteComment) is required',
                ResultCode: 'MISSING_ACTION'
            };
            }

            // Get appropriate access token
            let accessToken = this.getAccessToken();
            if (pageId) {
                // Use page access token for page actions
                accessToken = await this.getPageAccessToken(pageId);
            }

            LogStatus(`Processing comment ${commentId}...`);

            // Get comment details first
            const commentDetails = await this.getCommentDetails(commentId, accessToken!);
            if (!commentDetails) {
                return {
                Success: false,
                Message: 'Comment not found or access denied',
                ResultCode: 'NOT_FOUND'
            };
            }

            const results: any = {
                commentId,
                originalComment: {
                    message: commentDetails.message,
                    from: commentDetails.from,
                    createdTime: commentDetails.created_time
                },
                actions: []
            };

            // Handle delete action first (if specified)
            if (deleteComment) {
                try {
                    await this.deleteCommentAction(commentId, accessToken!);
                    results.actions.push({ action: 'delete', success: true });
                    LogStatus(`Deleted comment ${commentId}`);
                    
                    // If deleted, no other actions can be performed
                    return {
                Success: true,
                Message: 'Comment deleted successfully',
                ResultCode: 'SUCCESS',
                Params
            };
                } catch (error) {
                    LogError(`Failed to delete comment: ${error}`);
                    results.actions.push({ 
                        action: 'delete', 
                        success: false, 
                        error: error instanceof Error ? error.message : 'Unknown error' 
                    });
                }
            }

            // Handle hide action
            if (hideComment) {
                try {
                    await this.hideCommentAction(commentId, accessToken!, true);
                    results.actions.push({ action: 'hide', success: true });
                    LogStatus(`Hidden comment ${commentId}`);
                } catch (error) {
                    LogError(`Failed to hide comment: ${error}`);
                    results.actions.push({ 
                        action: 'hide', 
                        success: false, 
                        error: error instanceof Error ? error.message : 'Unknown error' 
                    });
                }
            }

            // Handle like action
            if (likeComment) {
                try {
                    await this.likeCommentAction(commentId, accessToken!);
                    results.actions.push({ action: 'like', success: true });
                    LogStatus(`Liked comment ${commentId}`);
                } catch (error) {
                    LogError(`Failed to like comment: ${error}`);
                    results.actions.push({ 
                        action: 'like', 
                        success: false, 
                        error: error instanceof Error ? error.message : 'Unknown error' 
                    });
                }
            }

            // Handle reply action
            if (responseText || attachmentUrl) {
                try {
                    const replyResult = await this.replyToComment(
                        commentId,
                        responseText,
                        attachmentUrl,
                        privateReply,
                        accessToken!
                    );
                    
                    results.actions.push({ 
                        action: privateReply ? 'private_reply' : 'reply', 
                        success: true,
                        replyId: replyResult.id,
                        message: responseText
                    });
                    
                    LogStatus(`Replied to comment ${commentId}`);
                } catch (error) {
                    LogError(`Failed to reply to comment: ${error}`);
                    results.actions.push({ 
                        action: privateReply ? 'private_reply' : 'reply', 
                        success: false, 
                        error: error instanceof Error ? error.message : 'Unknown error' 
                    });
                }
            }

            // Check if any actions succeeded
            const successfulActions = results.actions.filter((a: any) => a.success);
            if (successfulActions.length === 0) {
                return {
                    Success: false,
                    Message: 'All requested actions failed',
                    ResultCode: 'ERROR'
                };
            }

            return {
                Success: true,
                Message: `Successfully completed ${successfulActions.length} of ${results.actions.length} actions`,
                ResultCode: 'SUCCESS',
                Params
            };

        } catch (error) {
            LogError(`Failed to respond to Facebook comment: ${error instanceof Error ? error.message : 'Unknown error'}`);
            
            if (this.isAuthError(error)) {
                return this.handleOAuthError(error);
            }

            return {
                Success: false,
                Message: error instanceof Error ? error.message : 'Unknown error occurred',
                ResultCode: 'ERROR'
            };
        }
    }

    /**
     * Get comment details
     */
    private async getCommentDetails(commentId: string, accessToken: string): Promise<FacebookComment | null> {
        try {
            const response = await axios.get(
                `${this.apiBaseUrl}/${commentId}`,
                {
                    params: {
                        access_token: accessToken,
                        fields: 'id,message,created_time,from,like_count,comment_count,parent'
                    }
                }
            );

            return response.data;
        } catch (error) {
            LogError(`Failed to get comment details: ${error}`);
            return null;
        }
    }

    /**
     * Reply to a comment
     */
    private async replyToComment(
        commentId: string,
        message: string | null,
        attachmentUrl: string | null,
        privateReply: boolean,
        accessToken: string
    ): Promise<any> {
        const endpoint = privateReply 
            ? `${this.apiBaseUrl}/${commentId}/private_replies`
            : `${this.apiBaseUrl}/${commentId}/comments`;

        const data: any = {};
        
        if (message) {
            data.message = message;
        }
        
        if (attachmentUrl) {
            data.attachment_url = attachmentUrl;
        }

        const response = await axios.post(endpoint, data, {
            params: {
                access_token: accessToken
            }
        });

        return response.data;
    }

    /**
     * Like a comment
     */
    private async likeCommentAction(commentId: string, accessToken: string): Promise<void> {
        await axios.post(
            `${this.apiBaseUrl}/${commentId}/likes`,
            {},
            {
                params: {
                    access_token: accessToken
                }
            }
        );
    }

    /**
     * Hide or unhide a comment
     */
    private async hideCommentAction(commentId: string, accessToken: string, hide: boolean): Promise<void> {
        await axios.post(
            `${this.apiBaseUrl}/${commentId}`,
            {
                is_hidden: hide
            },
            {
                params: {
                    access_token: accessToken
                }
            }
        );
    }

    /**
     * Delete a comment
     */
    private async deleteCommentAction(commentId: string, accessToken: string): Promise<void> {
        await axios.delete(
            `${this.apiBaseUrl}/${commentId}`,
            {
                params: {
                    access_token: accessToken
                }
            }
        );
    }


}