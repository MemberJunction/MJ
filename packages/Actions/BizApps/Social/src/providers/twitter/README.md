# Twitter/X Actions for MemberJunction

This directory contains the Twitter/X implementation for MemberJunction's Social Media Actions package.

## Overview

The Twitter implementation provides comprehensive access to Twitter's API v2 with OAuth 2.0 authentication, enabling automated social media operations including content creation, analytics, and advanced search capabilities.

## Architecture

### Base Class: `TwitterBaseAction`
- Extends `BaseSocialMediaAction`
- Handles OAuth 2.0 authentication with token refresh
- Manages rate limiting with automatic retry
- Provides common Twitter API utilities
- Supports media upload with chunking for large files

## Available Actions

### 1. **Create Tweet** (`TwitterCreateTweetAction`)
- Post tweets with text content (up to 280 characters)
- Attach up to 4 media files (images, GIFs, videos)
- Create polls with 2-4 options
- Reply to existing tweets
- Quote tweet functionality

### 2. **Create Thread** (`TwitterCreateThreadAction`)
- Post connected series of tweets (up to 25)
- Automatic thread numbering (customizable format)
- Media support for each tweet in thread
- Maintains reply chain for proper threading

### 3. **Get Timeline** (`TwitterGetTimelineAction`)
- Retrieve home timeline (authenticated user's feed)
- Get specific user's timeline
- Filter options (exclude replies/retweets)
- Time-based filtering with date ranges
- Pagination support for large result sets

### 4. **Get Mentions** (`TwitterGetMentionsAction`)
- Retrieve tweets mentioning the authenticated user
- Analyze mention types (direct, replies, quotes)
- Engagement statistics for mentions
- Identify top engaging mentions

### 5. **Get Analytics** (`TwitterGetAnalyticsAction`)
- Tweet-level analytics for specific tweet IDs
- Account-level analytics with time-based aggregation
- Engagement metrics (likes, retweets, replies, impressions)
- Top performing content identification
- Time-series analysis (hourly, daily, total)

### 6. **Schedule Tweet** (`TwitterScheduleTweetAction`)
- Schedule tweets for future posting
- Supports all tweet features (media, polls, etc.)
- Handles media upload timing (24-hour expiration)
- Returns scheduling metadata for tracking

### 7. **Delete Tweet** (`TwitterDeleteTweetAction`)
- Delete tweets by ID
- Requires explicit confirmation
- Verifies ownership before deletion
- Captures tweet details before deletion

### 8. **Search Tweets** (`TwitterSearchTweetsAction`)
- **Full historical search with advanced operators**
- Text search with boolean operators
- User filters (from:, to:, @mentions)
- Content filters (has:media, has:links)
- Tweet type filters (is:retweet, is:reply, is:quote)
- Language filtering
- Engagement thresholds (with Academic access)
- Date range searches for historical data
- Comprehensive result analysis

## Authentication

Uses OAuth 2.0 with credentials stored in CompanyIntegration:
- `AccessToken`: OAuth 2.0 access token
- `RefreshToken`: OAuth 2.0 refresh token  
- `CustomAttribute2`: Client ID
- `CustomAttribute3`: Client Secret

## Rate Limiting

Twitter API v2 rate limits vary by endpoint:
- Search: 450 requests per 15-minute window (app-level)
- Timeline: 75 requests per 15-minute window (user-level)
- Tweet creation: 300 per 3-hour window
- Media upload: 415 per 15-minute window

The implementation automatically handles rate limiting with:
- Header parsing for remaining requests
- Automatic retry with exponential backoff
- Proper wait times based on reset timestamps

## Search Capabilities

The search implementation provides powerful capabilities:

### Basic Search
```typescript
{
    Query: "memberjunction",
    MaxResults: 100
}
```

### Advanced Search with Operators
```typescript
{
    Query: "data platform",
    FromUser: "memberjunction",
    HasMedia: true,
    StartDate: "2023-01-01",
    EndDate: "2023-12-31",
    Language: "en",
    MinLikes: 10
}
```

### Search Operators Supported
- **Text**: Exact phrases, boolean (AND/OR)
- **Users**: from:username, to:username, @mentions
- **Content**: has:media, has:links, has:hashtags
- **Type**: is:retweet, is:reply, is:quote, is:verified
- **Engagement**: min_faves:n, min_retweets:n (Academic access)
- **Time**: Start/end dates for historical searches
- **Location**: place:"location name"

## Error Handling

Comprehensive error handling with specific result codes:
- `RATE_LIMIT`: Rate limit exceeded
- `INVALID_TOKEN`: Authentication failure
- `CONTENT_TOO_LONG`: Tweet exceeds character limit
- `INVALID_MEDIA`: Media validation failure
- `TWEET_NOT_FOUND`: Tweet doesn't exist
- `INSUFFICIENT_PERMISSIONS`: Missing required scopes
- `NOT_OWNER`: Attempting to modify another user's content

## Media Support

### Supported Formats
- Images: JPEG, PNG, GIF, WebP (max 5MB, 15MB for GIFs)
- Videos: MP4 (max 512MB)

### Upload Process
1. Initialize upload with media metadata
2. Upload in chunks (5MB chunks for large files)
3. Finalize upload
4. Wait for processing (videos only)
5. Attach media ID to tweet

## Usage Examples

### Create a Tweet with Media
```typescript
const action = new TwitterCreateTweetAction();
await action.Run({
    CompanyIntegrationID: 'integration-id',
    Content: 'Check out our new features!',
    MediaFiles: [{
        filename: 'screenshot.png',
        mimeType: 'image/png',
        data: base64ImageData,
        size: 1024000
    }]
});
```

### Search Historical Tweets
```typescript
const action = new TwitterSearchTweetsAction();
const result = await action.Run({
    CompanyIntegrationID: 'integration-id',
    Query: 'artificial intelligence',
    StartDate: '2023-01-01',
    EndDate: '2023-12-31',
    HasMedia: true,
    IsVerified: true,
    MaxResults: 500
});

// Access comprehensive analysis
const analysis = result.Params.find(p => p.Name === 'Analysis').Value;
console.log('Top hashtags:', analysis.topHashtags);
console.log('Engagement stats:', analysis.engagementStats);
```

## Testing

When testing Twitter actions:
1. Use a test account with proper API access
2. Be mindful of rate limits during testing
3. Test media upload with various file sizes
4. Verify search operators work as expected
5. Test error scenarios (rate limits, invalid content)

## Future Enhancements

1. Streaming API support for real-time monitoring
2. Twitter Spaces integration
3. Advanced analytics with Twitter Analytics API
4. Batch operations for bulk tweet management
5. DM (Direct Message) support
6. Twitter Lists management