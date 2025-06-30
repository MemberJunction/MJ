# Instagram Actions for MemberJunction

This directory contains the Instagram implementation for the MemberJunction Social Media Actions package.

## Overview

Instagram actions use the Facebook Graph API (v18.0) since Instagram is owned by Meta. The implementation requires:
- OAuth 2.0 authentication via CompanyIntegration table
- Instagram Business Account (stored in CustomAttribute1)
- Facebook Page ID (stored in CustomAttribute2)
- App ID and App Secret (stored in CustomAttribute3 and CustomAttribute4)

## Available Actions

### 1. Create Post (`Instagram - Create Post`)
Creates a new Instagram post with support for:
- Feed posts (single image/video)
- Carousel posts (multiple images/videos, max 10)
- Reels (short-form videos)
- Location tagging
- User tagging
- Scheduling (requires Facebook Creator Studio)

### 2. Get Business Posts (`Instagram - Get Business Posts`)
Retrieves posts from an Instagram Business account with:
- Pagination support
- Date range filtering
- Media type filtering
- Engagement metrics
- Insights data (optional)

### 3. Get Post Insights (`Instagram - Get Post Insights`)
Retrieves detailed analytics for a specific post including:
- Impressions and reach
- Engagement metrics (likes, comments, saves, shares)
- Video-specific metrics (views, completion rate)
- Performance scoring
- Time period analysis

### 4. Get Account Insights (`Instagram - Get Account Insights`)
Retrieves account-level insights including:
- Follower demographics (age, gender, location, language)
- Growth metrics
- Content performance summary
- Peak activity times
- Profile views and website clicks

### 5. Schedule Post (`Instagram - Schedule Post`)
Schedules posts for future publication:
- Returns scheduling data for integration with Creator Studio
- Validates scheduling constraints (10 min - 75 days)
- Supports all post types
- Note: Direct API scheduling is limited; requires third-party integration

### 6. Get Comments (`Instagram - Get Comments`)
Retrieves comments for a post with:
- Nested replies support
- Hidden comments (with moderation permissions)
- Sentiment analysis
- Engagement metrics
- Keyword and emoji analysis

### 7. Create Story (`Instagram - Create Story`)
Creates Instagram Stories with:
- Images or videos (max 60 seconds)
- Interactive stickers (polls, questions, countdown, music, location)
- Link stickers (requires 10k+ followers or verification)
- User mentions and hashtags
- 24-hour expiration

### 8. Search Posts (`Instagram - Search Posts`)
Searches historical posts from the business account:
- Text search in captions
- Hashtag filtering
- Date range filtering
- Media type filtering
- Minimum engagement threshold
- Performance analysis and suggestions

## Rate Limits

Instagram API rate limits:
- 200 calls per hour per user
- Rate limit headers are checked and respected
- Automatic retry with exponential backoff

## Media Requirements

### Images
- Formats: JPEG, PNG
- Max size: 5MB
- Aspect ratios: 1:1 (square), 4:5 (portrait), 1.91:1 (landscape)

### Videos
- Formats: MP4, MOV
- Max size: 100MB (feed), 512MB (IGTV)
- Duration: 3-60 seconds (feed), up to 60 seconds (reels), up to 10 minutes (IGTV)

### Stories
- Images: 30MB max
- Videos: 100MB max, 60 seconds max
- Aspect ratio: 9:16 (recommended)

## Important Notes

1. **Media Upload**: Instagram requires media to be hosted at public URLs. The current implementation includes placeholder methods for CDN upload that need to be implemented based on your infrastructure.

2. **Search Limitations**: Instagram API only allows searching within your own business account's posts, not general Instagram content.

3. **Story Links**: Link stickers in stories require either 10,000+ followers or account verification.

4. **Scheduling**: Native API scheduling is limited. The implementation returns scheduling data that can be used with Facebook Creator Studio or third-party scheduling tools.

5. **Permissions**: Ensure your Instagram app has the required permissions:
   - `instagram_basic`
   - `instagram_content_publish`
   - `instagram_manage_insights`
   - `instagram_manage_comments`

## Error Handling

All actions implement comprehensive error handling for:
- Rate limiting (with retry logic)
- Invalid media
- Insufficient permissions
- Post not found
- Platform-specific errors

Results are returned via output parameters following MemberJunction patterns.