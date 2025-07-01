# Social Media Actions for MemberJunction

## Overview

This package provides comprehensive social media automation capabilities for MemberJunction, enabling agents and applications to interact with major social media platforms programmatically. The implementation follows MJ's established patterns for BizApps actions while providing platform-specific functionality.

## Architecture

### Class Hierarchy

```
BaseAction (from @memberjunction/actions)
    └── BaseOAuthAction (from @memberjunction/actions/Engine/src/generic)
        └── BaseSocialMediaAction (base for all social actions)
            ├── BaseHootSuiteAction
            ├── BaseBufferAction
            ├── BaseLinkedInAction
            ├── BaseTwitterAction
            ├── BaseFacebookAction
            ├── BaseInstagramAction
            ├── BaseTikTokAction
            └── BaseYouTubeAction
```

### Authentication

All social media platforms use OAuth 2.0 authentication. Credentials are stored in the MemberJunction CompanyIntegration table with the following structure:

- **Integration Entity**: Defines the platform (e.g., "Twitter", "LinkedIn")
- **CompanyIntegration Entity**: Stores company-specific credentials
  - `AccessToken`: OAuth access token
  - `RefreshToken`: OAuth refresh token (where applicable)
  - `ExpirationDate`: Token expiration timestamp
  - `CustomAttribute1-5`: Platform-specific data (e.g., account IDs)

The `BaseOAuthAction` class provides:
- Token retrieval from CompanyIntegration
- Automatic token refresh when expired
- OAuth flow helpers
- Standard error handling for auth failures

## Package Structure

```
packages/Actions/BizApps/Social/
├── README.md (this file)
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── base/
│   │   └── base-social.action.ts
│   └── providers/
│       ├── hootsuite/
│       │   ├── hootsuite-base.action.ts
│       │   └── actions/
│       │       ├── get-scheduled-posts.action.ts
│       │       ├── create-scheduled-post.action.ts
│       │       ├── get-analytics.action.ts
│       │       ├── get-social-profiles.action.ts
│       │       ├── update-scheduled-post.action.ts
│       │       ├── delete-scheduled-post.action.ts
│       │       ├── bulk-schedule-posts.action.ts
│       │       └── search-posts.action.ts
│       ├── buffer/
│       │   ├── buffer-base.action.ts
│       │   └── actions/
│       │       ├── get-profiles.action.ts
│       │       ├── create-post.action.ts
│       │       ├── get-pending-posts.action.ts
│       │       ├── get-sent-posts.action.ts
│       │       ├── get-analytics.action.ts
│       │       ├── reorder-queue.action.ts
│       │       ├── delete-post.action.ts
│       │       └── search-posts.action.ts
│       ├── linkedin/
│       │   ├── linkedin-base.action.ts
│       │   └── actions/
│       │       ├── create-post.action.ts
│       │       ├── get-organization-posts.action.ts
│       │       ├── get-personal-posts.action.ts
│       │       ├── get-post-analytics.action.ts
│       │       ├── schedule-post.action.ts
│       │       ├── get-followers.action.ts
│       │       ├── create-article.action.ts
│       │       └── search-posts.action.ts
│       ├── twitter/
│       │   ├── twitter-base.action.ts
│       │   └── actions/
│       │       ├── create-tweet.action.ts
│       │       ├── create-thread.action.ts
│       │       ├── get-timeline.action.ts
│       │       ├── get-mentions.action.ts
│       │       ├── get-analytics.action.ts
│       │       ├── schedule-tweet.action.ts
│       │       ├── delete-tweet.action.ts
│       │       └── search-tweets.action.ts
│       ├── facebook/
│       │   ├── facebook-base.action.ts
│       │   └── actions/
│       │       ├── create-post.action.ts
│       │       ├── get-page-posts.action.ts
│       │       ├── get-post-insights.action.ts
│       │       ├── schedule-post.action.ts
│       │       ├── create-album.action.ts
│       │       ├── get-page-insights.action.ts
│       │       ├── respond-to-comments.action.ts
│       │       ├── boost-post.action.ts
│       │       └── search-posts.action.ts
│       ├── instagram/
│       │   ├── instagram-base.action.ts
│       │   └── actions/
│       │       ├── create-post.action.ts
│       │       ├── get-business-posts.action.ts
│       │       ├── get-post-insights.action.ts
│       │       ├── get-account-insights.action.ts
│       │       ├── schedule-post.action.ts
│       │       ├── get-comments.action.ts
│       │       ├── create-story.action.ts
│       │       └── search-posts.action.ts
│       ├── tiktok/
│       │   ├── tiktok-base.action.ts
│       │   └── actions/
│       │       ├── get-user-videos.action.ts
│       │       ├── get-video-analytics.action.ts
│       │       ├── get-account-analytics.action.ts
│       │       ├── create-video-post.action.ts
│       │       ├── get-comments.action.ts
│       │       ├── get-trending-hashtags.action.ts
│       │       └── search-videos.action.ts
│       └── youtube/
│           ├── youtube-base.action.ts
│           └── actions/
│               ├── upload-video.action.ts
│               ├── get-channel-videos.action.ts
│               ├── get-video-analytics.action.ts
│               ├── update-video-metadata.action.ts
│               ├── create-playlist.action.ts
│               ├── schedule-video.action.ts
│               ├── get-comments.action.ts
│               ├── get-channel-analytics.action.ts
│               └── search-videos.action.ts
```

## Common Features

### BaseSocialMediaAction

Provides common functionality for all social platforms:

```typescript
export abstract class BaseSocialMediaAction extends BaseOAuthAction {
    // Common parameters for all social actions
    protected get commonParams(): ActionParam[] {
        return [
            { Name: 'CompanyIntegrationID', Type: 'guid', Required: true, Description: 'Company integration identifier' },
            { Name: 'ProfileID', Type: 'string', Required: false, Description: 'Social profile/account ID' }
        ];
    }

    // Analytics normalization
    protected normalizeAnalytics(platformData: any): SocialAnalytics {
        // Convert platform-specific metrics to common format
    }

    // Media handling
    protected async uploadMedia(files: MediaFile[]): Promise<string[]> {
        // Handle media uploads with size/format validation
    }

    // Rate limiting
    protected async handleRateLimit(retryAfter: number): Promise<void> {
        // Intelligent rate limit handling
    }

    // Historical post search
    protected abstract searchPosts(params: SearchParams): Promise<SocialPost[]>;
}
```

### Common Interfaces

```typescript
interface SocialPost {
    id: string;
    platform: string;
    profileId: string;
    content: string;
    mediaUrls: string[];
    publishedAt: Date;
    scheduledFor?: Date;
    analytics?: SocialAnalytics;
    platformSpecificData: Record<string, any>;
}

interface SocialAnalytics {
    impressions: number;
    engagements: number;
    clicks: number;
    shares: number;
    comments: number;
    likes: number;
    reach: number;
    saves?: number;
    videoViews?: number;
    platformMetrics: Record<string, any>;
}

interface SearchParams {
    query?: string;
    hashtags?: string[];
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
}

interface MediaFile {
    filename: string;
    mimeType: string;
    data: Buffer | string; // Base64 or buffer
    size: number;
}
```

## Platform-Specific Implementation Details

### HootSuite
- **API Version**: v1
- **Rate Limits**: 250 requests per hour
- **Special Features**: Multi-platform posting, team collaboration
- **Search Capabilities**: Full text search across connected accounts

### Buffer
- **API Version**: v1
- **Rate Limits**: 600 requests per hour  
- **Special Features**: Optimal timing suggestions, queue management
- **Search Capabilities**: Search within scheduled and sent posts

### LinkedIn
- **API Version**: v2 (LinkedIn Marketing Developer Platform)
- **Rate Limits**: Application-level and member-level limits
- **Special Features**: Organization vs personal posts, article publishing
- **Search Capabilities**: Search organization posts, limited personal post search

### Twitter/X
- **API Version**: v2
- **Rate Limits**: Varies by endpoint (15-900 requests per 15 min)
- **Special Features**: Thread creation, advanced search operators
- **Search Capabilities**: Full Twitter search API with operators

### Facebook
- **API Version**: Graph API v18.0
- **Rate Limits**: 200 calls per hour per user
- **Special Features**: Page vs profile posts, boost capabilities
- **Search Capabilities**: Search within page posts, limited by privacy

### Instagram
- **API Version**: Instagram Basic Display API + Graph API
- **Rate Limits**: 200 calls per hour per user
- **Special Features**: Stories, reels, shopping tags
- **Search Capabilities**: Business account posts only

### TikTok
- **API Version**: Display API v2
- **Rate Limits**: 1000 requests per day
- **Special Features**: Video only, trending discovery
- **Search Capabilities**: Limited to user's own videos

### YouTube
- **API Version**: Data API v3
- **Rate Limits**: 10,000 quota units per day
- **Special Features**: Video management, playlists, premieres
- **Search Capabilities**: Full channel video search with filters

## Error Handling

All actions implement comprehensive error handling:

```typescript
enum SocialMediaErrorCode {
    RATE_LIMIT_EXCEEDED = 'RATE_LIMIT',
    INVALID_TOKEN = 'INVALID_TOKEN',
    TOKEN_EXPIRED = 'TOKEN_EXPIRED',
    PLATFORM_ERROR = 'PLATFORM_ERROR',
    INVALID_MEDIA = 'INVALID_MEDIA',
    POST_NOT_FOUND = 'POST_NOT_FOUND',
    INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS'
}
```

## Usage Examples

### Creating a Post
```typescript
const action = new CreatePostAction();
await action.RunAction({
    CompanyIntegrationID: 'abc-123',
    ProfileID: 'page-456',
    Content: 'Check out our new product!',
    MediaFiles: [{
        filename: 'product.jpg',
        mimeType: 'image/jpeg',
        data: base64Data,
        size: 1024000
    }],
    ScheduledTime: '2024-01-15T10:00:00Z'
});
```

### Searching Historical Posts
```typescript
const action = new SearchPostsAction();
const result = await action.RunAction({
    CompanyIntegrationID: 'abc-123',
    Query: 'product launch',
    StartDate: '2023-01-01',
    EndDate: '2023-12-31',
    Limit: 100
});

// Analyze content patterns
const posts = result.Result as SocialPost[];
const contentPatterns = analyzePostContent(posts);
```

### Getting Analytics
```typescript
const action = new GetPostAnalyticsAction();
const result = await action.RunAction({
    CompanyIntegrationID: 'abc-123',
    PostID: 'post-789',
    MetricTypes: ['impressions', 'engagements', 'clicks']
});
```

## Development Guidelines

1. **Credential Storage**: Always use CompanyIntegration for OAuth tokens
2. **Rate Limiting**: Implement exponential backoff for rate limit errors
3. **Media Handling**: Validate media size/format before upload
4. **Error Messages**: Provide clear, actionable error messages
5. **Logging**: Log all API requests for debugging
6. **Testing**: Mock API responses for unit tests

## Testing

Each platform should have:
- Unit tests for action logic
- Integration tests with mock API responses
- Manual testing checklist for OAuth flow
- Performance tests for bulk operations

## Future Enhancements

1. **Webhook Support**: Real-time notifications for comments/mentions
2. **Batch Operations**: Bulk post creation/scheduling
3. **AI Integration**: Content suggestions based on historical performance
4. **Cross-Platform Analytics**: Unified dashboard across all platforms
5. **Content Calendar**: Visual planning interface

## Contributing

When adding new actions:
1. Extend the appropriate base class
2. Implement all required parameters
3. Add comprehensive error handling
4. Include search functionality where available
5. Update metadata files
6. Add unit tests
7. Document any platform-specific quirks

## License

See MemberJunction main license.