# Social Media Actions Inventory

## Summary

Total Actions: 66 actions across 8 platforms

### Platform Breakdown:
- **Buffer**: 8 actions
- **Facebook**: 9 actions  
- **Hootsuite**: 8 actions
- **Instagram**: 8 actions
- **LinkedIn**: 8 actions
- **TikTok**: 7 actions
- **Twitter**: 8 actions
- **YouTube**: 9 actions

## Detailed Action List

### Buffer Actions (8)

1. **BufferCreatePostAction**
   - Description: Creates a new post in Buffer that can be scheduled or posted immediately to one or more social media profiles
   - Inputs: ProfileIDs, Content, MediaFiles, MediaLink, MediaDescription, ScheduledTime, PostNow, AddToTop, ShortenLinks
   - Outputs: CreatedPosts, Summary
   - Result Codes: INVALID_TOKEN, SUCCESS

2. **BufferDeletePostAction**
   - Description: Deletes a pending or sent post from Buffer
   - Inputs: UpdateID
   - Outputs: Deleted, Summary
   - Result Codes: INVALID_TOKEN, SUCCESS, DELETE_FAILED

3. **BufferGetAnalyticsAction**
   - Description: Retrieves detailed analytics and interaction metrics for a specific Buffer post
   - Inputs: UpdateID
   - Outputs: Analytics
   - Result Codes: INVALID_TOKEN, SUCCESS

4. **BufferGetPendingPostsAction**
   - Description: Retrieves pending (scheduled) posts from Buffer for a specific social media profile
   - Inputs: ProfileID, Page, Count, Since, UseUTC
   - Outputs: Posts, Summary
   - Result Codes: INVALID_TOKEN, SUCCESS

5. **BufferGetProfilesAction**
   - Description: Retrieves all Buffer profiles (social media accounts) associated with the authenticated user
   - Inputs: (none)
   - Outputs: Profiles, Summary
   - Result Codes: INVALID_TOKEN, SUCCESS

6. **BufferGetSentPostsAction**
   - Description: Retrieves sent (published) posts from Buffer for a specific social media profile with analytics data
   - Inputs: ProfileID, Page, Count, Since, UseUTC
   - Outputs: Posts, Summary
   - Result Codes: INVALID_TOKEN, SUCCESS

7. **BufferReorderQueueAction**
   - Description: Reorders posts in a Buffer profile's queue
   - Inputs: ProfileID, UpdateIDs, Offset
   - Outputs: Summary, ReorderedPosts
   - Result Codes: INVALID_TOKEN, SUCCESS

8. **BufferSearchPostsAction**
   - Description: Searches historical posts in Buffer across profiles with support for date ranges, hashtags, and content queries
   - Inputs: Query, ProfileIDs, Hashtags, StartDate, EndDate, Limit, Offset, IncludeAnalytics
   - Outputs: Posts, Summary
   - Result Codes: INVALID_TOKEN, SUCCESS

### Facebook Actions (9)

1. **FacebookBoostPostAction**
   - Description: Boosts (promotes) a Facebook post to reach a wider audience through paid advertising
   - Inputs: PostID, AdAccountID, Budget, Duration, Objective, AudienceType, TargetingSpec, StartTime, CallToAction
   - Result Codes: INVALID_TOKEN, MISSING_REQUIRED_PARAM, INVALID_BUDGET, INVALID_DURATION, SUCCESS, INSUFFICIENT_PERMISSIONS, ERROR

2. **FacebookCreateAlbumAction**
   - Description: Creates a photo album on a Facebook page and optionally uploads photos to it
   - Inputs: PageID, AlbumName, Description, Location, Privacy, Photos, PhotoCaptions, CoverPhotoIndex, MakeAlbumPublic
   - Result Codes: INVALID_TOKEN, MISSING_REQUIRED_PARAM, INVALID_MEDIA, SUCCESS, ERROR

3. **FacebookCreatePostAction**
   - Description: Creates a new post on a Facebook page with optional media attachments and scheduling
   - Inputs: PageID, Content, Link, MediaFiles, ScheduledTime, Tags, PlaceID, Privacy, Published
   - Result Codes: INVALID_TOKEN, MISSING_REQUIRED_PARAM, MISSING_CONTENT, INVALID_SCHEDULE_TIME, INVALID_MEDIA, SUCCESS, ERROR

4. **FacebookGetPageInsightsAction**
   - Description: Retrieves comprehensive analytics for a Facebook page including views, engagement, demographics, and performance metrics
   - Inputs: PageID, MetricTypes, Period, StartDate, EndDate, IncludeDemographics, IncludeVideoMetrics, CompareWithPrevious
   - Result Codes: INVALID_TOKEN, MISSING_REQUIRED_PARAM, SUCCESS, ERROR

5. **FacebookGetPagePostsAction**
   - Description: Retrieves posts from a Facebook page with optional date range filtering and pagination
   - Inputs: PageID, StartDate, EndDate, Limit, MaxResults, IncludeUnpublished, IncludeInsights
   - Result Codes: INVALID_TOKEN, MISSING_REQUIRED_PARAM, SUCCESS, ERROR

6. **FacebookGetPostInsightsAction**
   - Description: Retrieves detailed analytics and insights for a specific Facebook post including reach, impressions, and engagement metrics
   - Inputs: PostID, MetricTypes, Period, IncludeVideoMetrics, IncludeDemographics
   - Result Codes: INVALID_TOKEN, MISSING_REQUIRED_PARAM, SUCCESS, INSUFFICIENT_PERMISSIONS, ERROR

7. **FacebookRespondToCommentsAction**
   - Description: Responds to comments on Facebook posts, pages, or other comments with text replies or reactions
   - Inputs: CommentID, ResponseText, AttachmentURL, LikeComment, HideComment, DeleteComment, PrivateReply, PageID
   - Result Codes: INVALID_TOKEN, MISSING_REQUIRED_PARAM, MISSING_ACTION, NOT_FOUND, SUCCESS, ERROR

8. **FacebookSchedulePostAction**
   - Description: Schedules a post to be published on a Facebook page at a specified future time (10 minutes to 6 months in advance)
   - Inputs: PageID, Content, ScheduledTime, Link, MediaFiles, Tags, PlaceID, TargetingRestrictions, AllowReschedule
   - Result Codes: INVALID_TOKEN, MISSING_REQUIRED_PARAM, INVALID_SCHEDULE_TIME, MISSING_CONTENT, SCHEDULE_CONFLICT, INVALID_MEDIA, SUCCESS, ERROR

9. **FacebookSearchPostsAction**
   - Description: Searches for historical posts on Facebook pages with filters for date ranges, keywords, hashtags, and content types
   - Inputs: PageIDs, Query, Hashtags, StartDate, EndDate, PostTypes, MinEngagements, IncludeMetrics, Limit, SortBy, SortOrder
   - Result Codes: INVALID_TOKEN, SUCCESS, ERROR

### Hootsuite Actions (8)

1. **HootSuiteBulkSchedulePostsAction**
   - Description: Bulk schedules multiple posts to HootSuite with support for auto-scheduling intervals and validation
   - Inputs: Posts, DefaultProfileIDs, ScheduleInterval, StartTime, SkipOnError, ValidateOnly
   - Outputs: Results, Errors, Summary
   - Result Codes: ERROR

2. **HootSuiteCreateScheduledPostAction**
   - Description: Creates a scheduled post in HootSuite with support for multiple social profiles, media attachments, and scheduling
   - Inputs: Content, ProfileIDs, ScheduledTime, MediaFiles, Tags, Location, TargetingOptions
   - Outputs: CreatedPost, PostID
   - Result Codes: SUCCESS, ERROR

3. **HootSuiteDeleteScheduledPostAction**
   - Description: Deletes a scheduled post from HootSuite. Only SCHEDULED, DRAFT, or FAILED posts can be deleted. Published posts cannot be deleted.
   - Inputs: PostID, ConfirmDeletion
   - Outputs: DeletedPostInfo, DeletionVerified
   - Result Codes: CONFIRMATION_REQUIRED, POST_NOT_FOUND, CANNOT_DELETE_PUBLISHED, SUCCESS, ERROR

4. **HootSuiteGetAnalyticsAction**
   - Description: Retrieves analytics data from HootSuite for posts, profiles, or overall account performance
   - Inputs: PostID, StartDate, EndDate, MetricsType, AggregateByProfile
   - Outputs: Analytics, Summary
   - Result Codes: SUCCESS, ERROR

5. **HootSuiteGetScheduledPostsAction**
   - Description: Retrieves scheduled posts from HootSuite with optional date filtering and analytics
   - Inputs: StartDate, EndDate, Limit, IncludeAnalytics
   - Outputs: ScheduledPosts, Summary
   - Result Codes: SUCCESS, ERROR

6. **HootSuiteGetSocialProfilesAction**
   - Description: Retrieves all social profiles connected to the HootSuite account with optional filtering
   - Inputs: IncludeInactive, SocialNetwork
   - Outputs: Profiles, Summary
   - Result Codes: SUCCESS, ERROR

7. **HootSuiteSearchPostsAction**
   - Description: Searches historical posts in HootSuite with support for text queries, hashtags, date ranges, and content analysis
   - Inputs: Query, Hashtags, StartDate, EndDate, PostState, Limit, IncludeAnalytics, SortBy, SortOrder
   - Outputs: Posts, Summary
   - Result Codes: SUCCESS, ERROR

8. **HootSuiteUpdateScheduledPostAction**
   - Description: Updates a scheduled post in HootSuite. Only SCHEDULED and DRAFT posts can be updated.
   - Inputs: PostID, Content, ProfileIDs, ScheduledTime, MediaFiles, ReplaceMedia, Tags, Location
   - Outputs: UpdatedPost, ChangesSummary
   - Result Codes: NO_CHANGES, SUCCESS, ERROR

### Instagram Actions (8)

1. **Instagram - Create Post**
   - Description: Creates a new Instagram post with images or videos. Supports feed posts, carousels, and reels.
   - Inputs: Content, MediaFiles, PostType, LocationID, TaggedUsers, ScheduledTime
   - Result Codes: AUTH_FAILED, MISSING_MEDIA, INVALID_CAROUSEL, INVALID_REEL, INVALID_SCHEDULE_TIME, SCHEDULING_NOT_SUPPORTED, SUCCESS, RATE_LIMIT, INVALID_MEDIA, ERROR

2. **Instagram - Create Story**
   - Description: Creates an Instagram Story with support for stickers, links, mentions, and interactive elements. Stories disappear after 24 hours.
   - Inputs: MediaFile, StickerType, StickerData, LinkUrl, LinkText, MentionedUsers, Hashtags
   - Result Codes: AUTH_FAILED, MISSING_MEDIA, INVALID_MEDIA, SUCCESS, RATE_LIMIT, ERROR

3. **Instagram - Get Account Insights**
   - Description: Retrieves comprehensive account-level insights including follower demographics, reach, impressions, and growth metrics.
   - Inputs: Period, StartDate, EndDate, IncludeDemographics
   - Result Codes: AUTH_FAILED, SUCCESS, RATE_LIMIT, INSUFFICIENT_PERMISSIONS, ERROR

4. **Instagram - Get Business Posts**
   - Description: Retrieves posts from an Instagram Business account with optional metrics and filtering.
   - Inputs: Limit, MediaType, IncludeMetrics, AfterCursor, StartDate, EndDate
   - Result Codes: AUTH_FAILED, SUCCESS, RATE_LIMIT, INSUFFICIENT_PERMISSIONS, ERROR

5. **Instagram - Get Comments**
   - Description: Retrieves comments for an Instagram post including replies, metrics, and sentiment analysis.
   - Inputs: PostID, IncludeReplies, IncludeHidden, Limit, AfterCursor
   - Result Codes: AUTH_FAILED, MISSING_PARAMS, SUCCESS, RATE_LIMIT, POST_NOT_FOUND, ERROR

6. **Instagram - Get Post Insights**
   - Description: Retrieves detailed analytics and insights for a specific Instagram post including impressions, reach, engagement, and more.
   - Inputs: PostID, MetricTypes, Period
   - Result Codes: AUTH_FAILED, MISSING_PARAMS, POST_NOT_FOUND, INVALID_METRICS, SUCCESS, RATE_LIMIT, ERROR

7. **Instagram - Schedule Post**
   - Description: Schedules an Instagram post for future publication. Returns scheduling data that can be used with Creator Studio or custom scheduling solutions.
   - Inputs: Content, MediaUrls, ScheduledTime, PostType, LocationID, TaggedUsers, FirstComment
   - Result Codes: AUTH_FAILED, MISSING_PARAMS, MISSING_MEDIA, INVALID_SCHEDULE_TIME, SCHEDULE_TOO_SOON, SCHEDULE_TOO_FAR, SUCCESS, RATE_LIMIT, ERROR

8. **Instagram - Search Posts**
   - Description: Searches historical Instagram posts from your business account with filters for date range, hashtags, content, and engagement metrics.
   - Inputs: Query, Hashtags, StartDate, EndDate, MediaType, MinEngagement, Limit, IncludeArchived
   - Result Codes: AUTH_FAILED, SUCCESS, RATE_LIMIT, ERROR

### LinkedIn Actions (8)

1. **LinkedInCreateArticleAction**
   - Description: Creates a LinkedIn article (long-form content) with title, content, and optional cover image. Note: Uses rich media shares to simulate article functionality due to API limitations.
   - Inputs: Title, Content, Description, CoverImage, AuthorType, OrganizationID, Visibility, PublishImmediately
   - Outputs: Article, ArticleID
   - Result Codes: SUCCESS, ERROR

2. **LinkedInCreatePostAction**
   - Description: Creates a post on LinkedIn for personal profiles or organization pages with optional media attachments
   - Inputs: Content, AuthorType, OrganizationID, MediaFiles, Visibility, VisibleToGuest
   - Outputs: CreatedPost, PostID
   - Result Codes: SUCCESS, ERROR

3. **LinkedInGetFollowersAction**
   - Description: Retrieves follower statistics for LinkedIn personal profiles or organization pages, including demographics and growth metrics where available
   - Inputs: EntityType, OrganizationID, IncludeGrowth, TimeRange
   - Outputs: FollowerCount, FollowerStatistics
   - Result Codes: SUCCESS, ERROR

4. **LinkedInGetOrganizationPostsAction**
   - Description: Retrieves posts from a LinkedIn organization page with optional analytics data
   - Inputs: OrganizationID, Count, StartIndex, IncludeAnalytics
   - Outputs: Posts, TotalCount
   - Result Codes: SUCCESS, ERROR

5. **LinkedInGetPersonalPostsAction**
   - Description: Retrieves posts from the authenticated user's LinkedIn profile with optional analytics
   - Inputs: Count, StartIndex, IncludeAnalytics
   - Outputs: Posts, TotalCount
   - Result Codes: SUCCESS, ERROR

6. **LinkedInGetPostAnalyticsAction**
   - Description: Retrieves detailed analytics for a LinkedIn post (organization posts have more detailed analytics than personal posts)
   - Inputs: PostID, AuthorType, OrganizationID, TimeRange
   - Outputs: Analytics, RawAnalytics
   - Result Codes: SUCCESS, ERROR

7. **LinkedInSchedulePostAction**
   - Description: Schedules a post for future publishing on LinkedIn. Note: LinkedIn API does not support native scheduling, so this stores the post for later publishing via a scheduler service.
   - Inputs: Content, ScheduledTime, AuthorType, OrganizationID, MediaFiles, Visibility, VisibleToGuest
   - Outputs: ScheduledPost, ScheduledID
   - Result Codes: SUCCESS, ERROR

8. **LinkedInSearchPostsAction**
   - Description: Searches for historical LinkedIn posts with support for content search, hashtags, date ranges, and author filtering. Retrieves posts from personal profiles and organization pages.
   - Inputs: Query, Hashtags, StartDate, EndDate, AuthorType, OrganizationID, Limit, Offset, IncludeAnalytics
   - Outputs: Posts, TotalCount
   - Result Codes: SUCCESS, ERROR

### TikTok Actions (7)

1. **CreateVideoPostAction**
   - Description: Creates a video post on TikTok (requires special API approval from TikTok)
   - Inputs: VideoURL, VideoFile, Title, Description, Hashtags, PrivacyLevel, AllowComments, AllowDuet, AllowStitch, ScheduleTime
   - Outputs: PostID, PostURL, Status, Alternatives
   - Result Codes: API_LIMITATION, SUCCESS, INSUFFICIENT_PERMISSIONS

2. **GetAccountAnalyticsAction**
   - Description: Retrieves comprehensive analytics for a TikTok account including followers, engagement rates, and content performance
   - Inputs: DateRange, IncludeVideoStats, IncludeAudienceData
   - Outputs: AccountAnalytics, AudienceData, Summary
   - Result Codes: SUCCESS

3. **GetCommentsAction**
   - Description: Retrieves and analyzes comments from TikTok videos including sentiment, engagement metrics, and notable comments
   - Inputs: VideoID, MaxComments, IncludeReplies, SortBy
   - Outputs: Comments, Summary, RawData
   - Result Codes: SUCCESS

4. **GetTrendingHashtagsAction**
   - Description: Analyzes hashtag performance from your TikTok content and provides trending insights (Note: Direct trending API not available)
   - Inputs: Country, Category, Limit, IncludeStats
   - Outputs: TrendingHashtags, Insights, Summary
   - Result Codes: SUCCESS

5. **GetUserVideosAction**
   - Description: Retrieves videos from a TikTok user account with analytics and metadata
   - Inputs: UserID, MaxVideos, IncludeAnalytics
   - Outputs: Videos, Summary, RawData
   - Result Codes: SUCCESS

6. **GetVideoAnalyticsAction**
   - Description: Retrieves detailed analytics for specific TikTok videos including views, likes, comments, and shares
   - Inputs: VideoIDs, DateRange, Metrics
   - Outputs: Analytics, Summary
   - Result Codes: (none)

7. **SearchVideosAction**
   - Description: Searches historical TikTok videos with advanced filtering, date ranges, and performance analytics (searches within your own videos only due to API limitations)
   - Inputs: Query, Hashtags, StartDate, EndDate, MinViews, MinEngagement, SortBy, SortOrder, Limit, Offset
   - Outputs: Videos, Summary, RawData
   - Result Codes: SUCCESS

### Twitter Actions (8)

1. **TwitterCreateThreadAction**
   - Description: Creates a thread (series of connected tweets) on Twitter/X with optional media attachments and automatic numbering
   - Inputs: Tweets, MediaFilesByTweet, IncludeNumbers, NumberFormat
   - Outputs: CreatedPosts, TweetIDs, ThreadURL
   - Result Codes: SUCCESS

2. **TwitterCreateTweetAction**
   - Description: Creates a tweet on Twitter/X with optional media attachments, polls, replies, or quote tweets
   - Inputs: Content, MediaFiles, ReplyToTweetID, QuoteTweetID, PollOptions, PollDurationMinutes
   - Outputs: CreatedPost, TweetID, TweetURL
   - Result Codes: SUCCESS

3. **TwitterDeleteTweetAction**
   - Description: Deletes a tweet from Twitter/X. Requires explicit confirmation and ownership of the tweet.
   - Inputs: TweetID, ConfirmDeletion
   - Outputs: DeletedTweetDetails, DeletionTime
   - Result Codes: CONFIRMATION_REQUIRED, SUCCESS

4. **TwitterGetAnalyticsAction**
   - Description: Gets analytics data from Twitter/X for specific tweets or account-level metrics with time-based analysis
   - Inputs: AnalyticsType, TweetIDs, StartDate, EndDate, Granularity
   - Outputs: Analytics, AggregateMetrics, OverallMetrics, TimeBasedAnalytics
   - Result Codes: SUCCESS

5. **TwitterGetMentionsAction**
   - Description: Gets tweets that mention the authenticated user on Twitter/X with engagement statistics and filtering options
   - Inputs: MaxResults, StartTime, EndTime, SinceID, UntilID, IncludeRetweets
   - Outputs: Mentions, Tweets, Statistics
   - Result Codes: SUCCESS

6. **TwitterGetTimelineAction**
   - Description: Gets timeline tweets from Twitter/X including home timeline or a specific user's timeline
   - Inputs: TimelineType, UserID, Username, MaxResults, ExcludeReplies, ExcludeRetweets, StartTime, EndTime, SinceID, UntilID
   - Outputs: Posts, Tweets, Statistics
   - Result Codes: SUCCESS

7. **TwitterScheduleTweetAction**
   - Description: Schedules a tweet for future posting on Twitter/X with optional media attachments, polls, replies, or quote tweets
   - Inputs: Content, ScheduledTime, MediaFiles, ReplyToTweetID, QuoteTweetID, PollOptions, PollDurationMinutes
   - Outputs: ScheduledTweetID, ScheduledTweetData, EstimatedURL
   - Result Codes: SUCCESS

8. **TwitterSearchTweetsAction**
   - Description: Searches for tweets on Twitter/X using advanced operators and filters, with comprehensive analysis of results including historical data
   - Inputs: Query, Hashtags, FromUser, ToUser, MentionUser, StartDate, EndDate, Language, HasMedia, HasLinks, IsRetweet, IsReply, IsQuote, IsVerified, MinLikes, MinRetweets, MinReplies, Place, MaxResults, SortOrder
   - Outputs: Posts, Tweets, Analysis, ActualQuery
   - Result Codes: SUCCESS

### YouTube Actions (9)

1. **YouTubeCreatePlaylistAction**
   - Description: Creates a YouTube playlist and optionally adds videos to it
   - Inputs: Title, Description, Privacy, VideoIDs, Tags
   - Outputs: PlaylistID, PlaylistURL, PlaylistDetails
   - Result Codes: SUCCESS

2. **YouTubeGetChannelAnalyticsAction**
   - Description: Gets comprehensive analytics for a YouTube channel including statistics, growth metrics, and performance indicators
   - Inputs: ChannelID, StartDate, EndDate, Metrics, Dimensions, Sort, MaxResults
   - Outputs: Analytics, Summary, ChannelInfo
   - Result Codes: SUCCESS

3. **YouTubeGetChannelVideosAction**
   - Description: Gets videos from a YouTube channel with filtering and pagination support
   - Inputs: ChannelID, MaxResults, OrderBy, PublishedAfter, PublishedBefore, Query
   - Outputs: Videos, NextPageToken, TotalResults
   - Result Codes: SUCCESS

4. **YouTubeGetCommentsAction**
   - Description: Gets comments from YouTube videos or channels with sentiment analysis and statistics
   - Inputs: VideoID, ChannelID, MaxResults, OrderBy, SearchTerms, IncludeReplies
   - Outputs: Comments, Statistics, NextPageToken
   - Result Codes: SUCCESS

5. **YouTubeGetVideoAnalyticsAction**
   - Description: Gets analytics data for YouTube videos including views, engagement, and performance metrics
   - Inputs: VideoIDs, StartDate, EndDate, Metrics, Dimensions
   - Outputs: Analytics, VideoDetails
   - Result Codes: SUCCESS

6. **YouTubeScheduleVideoAction**
   - Description: Schedules a private YouTube video to be published at a specific date/time with optional premiere settings
   - Inputs: VideoID, PublishAt, EnablePremiere, PremiereCountdown
   - Outputs: UpdatedVideo, ScheduleDetails
   - Result Codes: SUCCESS

7. **YouTubeSearchVideosAction**
   - Description: Searches YouTube videos with comprehensive filtering options including historical content retrieval with date ranges
   - Inputs: Query, ChannelID, PublishedAfter, PublishedBefore, Duration, VideoType, Order, MaxResults, RegionCode, Language, SafeSearch
   - Outputs: Videos, NextPageToken, TotalResults
   - Result Codes: SUCCESS

8. **YouTubeUpdateVideoMetadataAction**
   - Description: Updates metadata for a YouTube video including title, description, tags, privacy settings, and thumbnail
   - Inputs: VideoID, Title, Description, Tags, CategoryID, Privacy, ThumbnailFile, RecordingDate
   - Outputs: UpdatedVideo, VideoDetails
   - Result Codes: SUCCESS

9. **YouTubeUploadVideoAction**
   - Description: Uploads a video to YouTube with metadata, thumbnail, and scheduling options
   - Inputs: Title, Description, Tags, CategoryID, PrivacyStatus, VideoFile, ThumbnailFile, NotifySubscribers, PublishAt
   - Outputs: VideoDetails, VideoID, VideoURL
   - Result Codes: SUCCESS

## Common Error/Result Codes Across Platforms

- **SUCCESS**: Operation completed successfully
- **ERROR**: Generic error occurred
- **INVALID_TOKEN**: OAuth token is invalid or expired
- **RATE_LIMIT**: API rate limit exceeded
- **INSUFFICIENT_PERMISSIONS**: User lacks required permissions
- **MISSING_REQUIRED_PARAM**: Required parameter is missing
- **INVALID_MEDIA**: Media file is invalid or unsupported
- **POST_NOT_FOUND**: Requested post/content not found
- **AUTH_FAILED**: Authentication failed
- **INVALID_SCHEDULE_TIME**: Scheduled time is invalid

## Key Observations

1. **OAuth Integration**: All actions extend from base classes that handle OAuth authentication
2. **Media Handling**: Most platforms support media uploads with validation
3. **Analytics**: Comprehensive analytics retrieval across all platforms
4. **Scheduling**: Most platforms support post scheduling (LinkedIn and TikTok have limitations)
5. **Search Capabilities**: All platforms provide historical post search with various filters
6. **Rate Limiting**: Built-in rate limit handling with exponential backoff
7. **Error Handling**: Consistent error code mapping across platforms
8. **Bulk Operations**: Some platforms (Buffer, Hootsuite) support bulk operations

## Platform-Specific Notes

- **Instagram**: Requires Business account for most analytics features
- **LinkedIn**: API doesn't support native scheduling; uses workaround
- **TikTok**: Requires special API approval for posting capabilities
- **Twitter**: Recently rebranded to X, comprehensive API support
- **YouTube**: High quota costs for certain operations
- **Buffer/Hootsuite**: Multi-platform management tools with cross-posting capabilities