import { RegisterClass } from '@memberjunction/global';
import { LinkedInBaseAction, LinkedInShareData, LinkedInArticle } from '../linkedin-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { LogStatus, LogError } from '@memberjunction/global';
import { MediaFile } from '../../../base/base-social.action';
import { BaseAction } from '@memberjunction/actions';

/**
 * Action to create a LinkedIn article (long-form content)
 */
@RegisterClass(BaseAction, 'LinkedInCreateArticleAction')
export class LinkedInCreateArticleAction extends LinkedInBaseAction {
  /**
   * Create a LinkedIn article
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
      const title = this.getParamValue(Params, 'Title');
      const content = this.getParamValue(Params, 'Content');
      const description = this.getParamValue(Params, 'Description');
      const coverImage = this.getParamValue(Params, 'CoverImage');
      const authorType = this.getParamValue(Params, 'AuthorType') || 'personal'; // 'personal' or 'organization'
      const organizationId = this.getParamValue(Params, 'OrganizationID');
      const visibility = this.getParamValue(Params, 'Visibility') || 'PUBLIC';
      const publishImmediately = this.getParamValue(Params, 'PublishImmediately') !== false; // Default true

      // Validate required parameters
      if (!title) {
        throw new Error('Title is required');
      }
      if (!content) {
        throw new Error('Content is required');
      }

      // Determine author URN
      let authorUrn: string;
      if (authorType === 'organization') {
        if (!organizationId) {
          // Get first admin organization if not specified
          const orgs = await this.getAdminOrganizations();
          if (orgs.length === 0) {
            throw new Error('No organizations found. Please specify OrganizationID.');
          }
          authorUrn = orgs[0].urn;
          LogStatus(`Using organization: ${orgs[0].name}`);
        } else {
          authorUrn = `urn:li:organization:${organizationId}`;
        }
      } else {
        // Personal article
        authorUrn = await this.getCurrentUserUrn();
      }

      // Upload cover image if provided
      let coverImageUrn: string | undefined;
      if (coverImage) {
        LogStatus('Uploading cover image...');
        const coverImageFile = coverImage as MediaFile;
        const uploadedUrns = await this.uploadMedia([coverImageFile]);
        coverImageUrn = uploadedUrns[0];
      }

      // Create article share data
      const articleShareData: LinkedInShareData = {
        author: authorUrn,
        lifecycleState: publishImmediately ? 'PUBLISHED' : 'DRAFT',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: {
              text: description || `Check out my new article: ${title}`,
            },
            shareMediaCategory: 'ARTICLE',
            media: [
              {
                status: 'READY' as const,
                media: '', // Article URL will be filled after creation
                title: {
                  text: title,
                },
                description: description
                  ? {
                      text: description,
                    }
                  : undefined,
              },
            ],
          },
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': visibility as any,
        },
      };

      // Format content for LinkedIn article
      const formattedContent = this.formatArticleContent(content);

      // Create the article
      LogStatus('Creating LinkedIn article...');

      // Note: LinkedIn's v2 API has limited article creation support
      // Full article creation typically requires using the Publishing Platform API
      // This implementation creates an article-style share with rich content

      // For now, we'll create a rich media share that looks like an article
      const articlePost = await this.createRichMediaShare(
        authorUrn,
        title,
        formattedContent,
        description,
        coverImageUrn,
        visibility,
        publishImmediately
      );

      // Update output parameters
      const outputParams = [...Params];
      const articleParam = outputParams.find((p) => p.Name === 'Article');
      if (articleParam) articleParam.Value = articlePost;
      const articleIdParam = outputParams.find((p) => p.Name === 'ArticleID');
      if (articleIdParam) articleIdParam.Value = articlePost.id;

      return {
        Success: true,
        ResultCode: 'SUCCESS',
        Message: `Successfully created LinkedIn article: ${title}`,
        Params: outputParams,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      return {
        Success: false,
        ResultCode: 'ERROR',
        Message: `Failed to create LinkedIn article: ${errorMessage}`,
        Params,
      };
    }
  }

  /**
   * Format article content for LinkedIn
   */
  private formatArticleContent(content: string): string {
    // LinkedIn articles support basic HTML formatting
    // Convert markdown-style formatting to LinkedIn-compatible format
    let formatted = content;

    // Convert markdown headers to bold text
    formatted = formatted.replace(/^### (.+)$/gm, '\n**$1**\n');
    formatted = formatted.replace(/^## (.+)$/gm, '\n**$1**\n');
    formatted = formatted.replace(/^# (.+)$/gm, '\n**$1**\n');

    // Convert markdown bold
    formatted = formatted.replace(/\*\*(.+?)\*\*/g, '**$1**');

    // Convert markdown italic
    formatted = formatted.replace(/\*(.+?)\*/g, '_$1_');

    // Add line breaks for paragraphs
    formatted = formatted.replace(/\n\n/g, '\n\n');

    // Truncate if too long (LinkedIn has character limits)
    const maxLength = 3000; // LinkedIn's limit for share commentary
    if (formatted.length > maxLength) {
      formatted = formatted.substring(0, maxLength - 3) + '...';
    }

    return formatted;
  }

  /**
   * Create a rich media share that resembles an article
   */
  private async createRichMediaShare(
    authorUrn: string,
    title: string,
    content: string,
    description?: string,
    coverImageUrn?: string,
    visibility: string = 'PUBLIC',
    publishImmediately: boolean = true
  ): Promise<any> {
    try {
      // Create a rich share with article-like formatting
      const shareData: LinkedInShareData = {
        author: authorUrn,
        lifecycleState: publishImmediately ? 'PUBLISHED' : 'DRAFT',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: {
              text: `📝 ${title}\n\n${content}`,
            },
            shareMediaCategory: coverImageUrn ? 'IMAGE' : 'NONE',
            media: coverImageUrn
              ? [
                  {
                    status: 'READY' as const,
                    media: coverImageUrn,
                    title: {
                      text: title,
                    },
                    description: description
                      ? {
                          text: description,
                        }
                      : undefined,
                  },
                ]
              : undefined,
          },
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': visibility as any,
        },
      };

      const postId = await this.createShare(shareData);

      // Return article-like object
      return {
        id: postId,
        title: title,
        content: content,
        description: description,
        coverImage: coverImageUrn,
        author: authorUrn,
        publishedAt: publishImmediately ? new Date().toISOString() : null,
        visibility: visibility,
        url: `https://www.linkedin.com/feed/update/${postId}/`,
      };
    } catch (error) {
      LogError(`Failed to create rich media share: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * Define the parameters this action expects
   */
  public get Params(): ActionParam[] {
    return [
      ...this.commonSocialParams,
      {
        Name: 'Title',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'Content',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'Description',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'CoverImage',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'AuthorType',
        Type: 'Input',
        Value: 'personal', // 'personal' or 'organization'
      },
      {
        Name: 'OrganizationID',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'Visibility',
        Type: 'Input',
        Value: 'PUBLIC', // 'PUBLIC', 'CONNECTIONS', 'LOGGED_IN', 'CONTAINER'
      },
      {
        Name: 'PublishImmediately',
        Type: 'Input',
        Value: true,
      },
      {
        Name: 'Article',
        Type: 'Output',
        Value: null,
      },
      {
        Name: 'ArticleID',
        Type: 'Output',
        Value: null,
      },
    ];
  }

  /**
   * Get action description
   */
  public get Description(): string {
    return 'Creates a LinkedIn article (long-form content) with title, content, and optional cover image. Note: Uses rich media shares to simulate article functionality due to API limitations.';
  }
}
