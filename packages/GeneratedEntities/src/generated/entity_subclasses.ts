import { BaseEntity, EntitySaveOptions, EntityDeleteOptions, CompositeKey, ValidationResult, ValidationErrorInfo, ValidationErrorType, Metadata, ProviderType, DatabaseProviderBase } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { z } from "zod";

export const loadModule = () => {
  // no-op, only used to ensure this file is a valid module and to allow easy loading
}

     
 
/**
 * zod schema definition for the entity Activities
 */
export const ActivitySchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    ContactID: z.string().describe(`
        * * Field Name: ContactID
        * * Display Name: Contact
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Contacts (vwContacts.ID)
        * * Description: Reference to the contact this activity is associated with`),
    ActivityTypeID: z.string().describe(`
        * * Field Name: ActivityTypeID
        * * Display Name: Activity Type
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Activity Types (vwActivityTypes.ID)
        * * Description: Type of activity (Phone Call, Email, Meeting, etc.)`),
    UserID: z.string().describe(`
        * * Field Name: UserID
        * * Display Name: User
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Users (vwUsers.ID)
        * * Description: MemberJunction user who performed or logged this activity`),
    Subject: z.string().describe(`
        * * Field Name: Subject
        * * Display Name: Subject
        * * SQL Data Type: nvarchar(255)
        * * Description: Brief subject line or title for the activity`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Detailed description or notes about the activity`),
    RawContent: z.string().nullable().describe(`
        * * Field Name: RawContent
        * * Display Name: Raw Content
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Full raw content of the activity (email body, call transcript, etc.) used for AI analysis`),
    ActivityDate: z.date().describe(`
        * * Field Name: ActivityDate
        * * Display Name: Activity Date
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()
        * * Description: Date and time when the activity occurred`),
    DurationMinutes: z.number().nullable().describe(`
        * * Field Name: DurationMinutes
        * * Display Name: Duration (Minutes)
        * * SQL Data Type: int
        * * Description: Duration of the activity in minutes (for calls, meetings)`),
    Status: z.string().describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Completed
        * * Description: Current status of the activity (Planned, Completed, Cancelled)`),
    UrgencyLevel: z.string().nullable().describe(`
        * * Field Name: UrgencyLevel
        * * Display Name: Urgency Level
        * * SQL Data Type: nvarchar(20)
        * * Description: AI-detected urgency level (Low, Medium, High, Critical)`),
    UrgencyScore: z.number().nullable().describe(`
        * * Field Name: UrgencyScore
        * * Display Name: Urgency Score
        * * SQL Data Type: decimal(5, 4)
        * * Description: Numeric urgency score from AI analysis (0.0000 to 1.0000)`),
    RequiresFollowUp: z.boolean().describe(`
        * * Field Name: RequiresFollowUp
        * * Display Name: Requires Follow Up
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Indicates if this activity requires a follow-up action`),
    FollowUpDate: z.date().nullable().describe(`
        * * Field Name: FollowUpDate
        * * Display Name: Follow Up Date
        * * SQL Data Type: date
        * * Description: Suggested or scheduled date for follow-up`),
    ProcessedByAI: z.boolean().describe(`
        * * Field Name: ProcessedByAI
        * * Display Name: Processed By AI
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Indicates if this activity has been processed by AI for sentiment/tagging`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    ActivityType: z.string().describe(`
        * * Field Name: ActivityType
        * * Display Name: Activity Type
        * * SQL Data Type: nvarchar(100)`),
    User: z.string().describe(`
        * * Field Name: User
        * * Display Name: User
        * * SQL Data Type: nvarchar(100)`),
});

export type ActivityEntityType = z.infer<typeof ActivitySchema>;

/**
 * zod schema definition for the entity Activities__Demo
 */
export const Activity__DemoSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    ContactID: z.string().describe(`
        * * Field Name: ContactID
        * * Display Name: Contact
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Contacts__Demo (vwContacts__Demo.ID)
        * * Description: Reference to the contact this activity is associated with`),
    ActivityTypeID: z.string().describe(`
        * * Field Name: ActivityTypeID
        * * Display Name: Activity Type
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Activity Types__Demo (vwActivityTypes__Demo.ID)
        * * Description: Type of activity (Phone Call, Email, Meeting, etc.)`),
    UserID: z.string().describe(`
        * * Field Name: UserID
        * * Display Name: User
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Users (vwUsers.ID)
        * * Description: MemberJunction user who performed or logged this activity`),
    Subject: z.string().describe(`
        * * Field Name: Subject
        * * Display Name: Subject
        * * SQL Data Type: nvarchar(255)
        * * Description: Brief subject line or title for the activity`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Detailed description or notes about the activity`),
    RawContent: z.string().nullable().describe(`
        * * Field Name: RawContent
        * * Display Name: Raw Content
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Full raw content of the activity (email body, call transcript, etc.) used for AI analysis`),
    ActivityDate: z.date().describe(`
        * * Field Name: ActivityDate
        * * Display Name: Activity Date
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()
        * * Description: Date and time when the activity occurred`),
    DurationMinutes: z.number().nullable().describe(`
        * * Field Name: DurationMinutes
        * * Display Name: Duration (Minutes)
        * * SQL Data Type: int
        * * Description: Duration of the activity in minutes (for calls, meetings)`),
    Status: z.union([z.literal('Cancelled'), z.literal('Completed'), z.literal('Planned')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Completed
    * * Value List Type: List
    * * Possible Values 
    *   * Cancelled
    *   * Completed
    *   * Planned
        * * Description: Current status of the activity (Planned, Completed, Cancelled)`),
    UrgencyLevel: z.union([z.literal('Critical'), z.literal('High'), z.literal('Low'), z.literal('Medium')]).nullable().describe(`
        * * Field Name: UrgencyLevel
        * * Display Name: Urgency Level
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Critical
    *   * High
    *   * Low
    *   * Medium
        * * Description: AI-detected urgency level (Low, Medium, High, Critical)`),
    UrgencyScore: z.number().nullable().describe(`
        * * Field Name: UrgencyScore
        * * Display Name: Urgency Score
        * * SQL Data Type: decimal(5, 4)
        * * Description: Numeric urgency score from AI analysis (0.0000 to 1.0000)`),
    RequiresFollowUp: z.boolean().describe(`
        * * Field Name: RequiresFollowUp
        * * Display Name: Requires Follow Up
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Indicates if this activity requires a follow-up action`),
    FollowUpDate: z.date().nullable().describe(`
        * * Field Name: FollowUpDate
        * * Display Name: Follow Up Date
        * * SQL Data Type: date
        * * Description: Suggested or scheduled date for follow-up`),
    ProcessedByAI: z.boolean().describe(`
        * * Field Name: ProcessedByAI
        * * Display Name: Processed By AI
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Indicates if this activity has been processed by AI for sentiment/tagging`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    ActivityType: z.string().describe(`
        * * Field Name: ActivityType
        * * Display Name: Activity Type
        * * SQL Data Type: nvarchar(100)`),
    User: z.string().describe(`
        * * Field Name: User
        * * Display Name: User
        * * SQL Data Type: nvarchar(100)`),
});

export type Activity__DemoEntityType = z.infer<typeof Activity__DemoSchema>;

/**
 * zod schema definition for the entity Activity Sentiments
 */
export const ActivitySentimentSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    ActivityID: z.string().describe(`
        * * Field Name: ActivityID
        * * Display Name: Activity
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Activities__Demo (vwActivities__Demo.ID)
        * * Description: Reference to the activity that was analyzed`),
    OverallSentiment: z.union([z.literal('Negative'), z.literal('Neutral'), z.literal('Positive')]).describe(`
        * * Field Name: OverallSentiment
        * * Display Name: Overall Sentiment
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Negative
    *   * Neutral
    *   * Positive
        * * Description: Overall sentiment classification (Positive, Neutral, Negative)`),
    SentimentScore: z.number().describe(`
        * * Field Name: SentimentScore
        * * Display Name: Sentiment Score
        * * SQL Data Type: decimal(5, 4)
        * * Description: Numeric sentiment score from -1.0000 (negative) to 1.0000 (positive)`),
    EmotionCategory: z.string().nullable().describe(`
        * * Field Name: EmotionCategory
        * * Display Name: Emotion Category
        * * SQL Data Type: nvarchar(50)
        * * Description: Detected emotion category (Happy, Frustrated, Confused, Urgent, Grateful, etc.)`),
    ConfidenceScore: z.number().describe(`
        * * Field Name: ConfidenceScore
        * * Display Name: Confidence Score
        * * SQL Data Type: decimal(5, 4)
        * * Description: AI confidence in the analysis (0.0000 to 1.0000)`),
    AnalyzedAt: z.date().describe(`
        * * Field Name: AnalyzedAt
        * * Display Name: Analyzed At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()
        * * Description: Timestamp when the AI analysis was performed`),
    AIModelUsed: z.string().nullable().describe(`
        * * Field Name: AIModelUsed
        * * Display Name: AI Model Used
        * * SQL Data Type: nvarchar(255)
        * * Description: Name or identifier of the AI model used for analysis`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type ActivitySentimentEntityType = z.infer<typeof ActivitySentimentSchema>;

/**
 * zod schema definition for the entity Activity Tag Links
 */
export const ActivityTagLinkSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    ActivityID: z.string().describe(`
        * * Field Name: ActivityID
        * * Display Name: Activity
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Activities__Demo (vwActivities__Demo.ID)
        * * Description: Reference to the activity being tagged`),
    ActivityTagID: z.string().describe(`
        * * Field Name: ActivityTagID
        * * Display Name: Tag
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Activity Tags__Demo (vwActivityTags__Demo.ID)
        * * Description: Reference to the tag being applied`),
    ConfidenceScore: z.number().nullable().describe(`
        * * Field Name: ConfidenceScore
        * * Display Name: Confidence Score
        * * SQL Data Type: decimal(5, 4)
        * * Description: AI confidence score for this tag assignment (0.0000 to 1.0000), NULL for manual tags`),
    AppliedByAI: z.boolean().describe(`
        * * Field Name: AppliedByAI
        * * Display Name: Applied By AI
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Indicates if this tag was applied by AI vs manually by a user`),
    AppliedAt: z.date().describe(`
        * * Field Name: AppliedAt
        * * Display Name: Applied At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()
        * * Description: Timestamp when the tag was applied to the activity`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    ActivityTag: z.string().describe(`
        * * Field Name: ActivityTag
        * * Display Name: Tag Name
        * * SQL Data Type: nvarchar(100)`),
});

export type ActivityTagLinkEntityType = z.infer<typeof ActivityTagLinkSchema>;

/**
 * zod schema definition for the entity Activity Tags
 */
export const ActivityTagSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(100)`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(500)`),
    Color: z.string().nullable().describe(`
        * * Field Name: Color
        * * Display Name: Color
        * * SQL Data Type: nvarchar(50)`),
    IsAutoGenerated: z.boolean().describe(`
        * * Field Name: IsAutoGenerated
        * * Display Name: Auto Generated
        * * SQL Data Type: bit
        * * Default Value: 0`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type ActivityTagEntityType = z.infer<typeof ActivityTagSchema>;

/**
 * zod schema definition for the entity Activity Tags__Demo
 */
export const ActivityTag__DemoSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Tag Name
        * * SQL Data Type: nvarchar(100)
        * * Description: Display name of the activity tag`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(500)
        * * Description: Detailed description of what this tag represents`),
    Color: z.string().nullable().describe(`
        * * Field Name: Color
        * * Display Name: Color
        * * SQL Data Type: nvarchar(50)
        * * Description: Hex color code or color name for UI display`),
    IsAutoGenerated: z.boolean().describe(`
        * * Field Name: IsAutoGenerated
        * * Display Name: Auto Generated
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Indicates if this tag was created by AI vs manually by a user`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type ActivityTag__DemoEntityType = z.infer<typeof ActivityTag__DemoSchema>;

/**
 * zod schema definition for the entity Activity Topics
 */
export const ActivityTopicSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    ActivityID: z.string().describe(`
        * * Field Name: ActivityID
        * * Display Name: Activity
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Activities__Demo (vwActivities__Demo.ID)
        * * Description: Reference to the activity`),
    TopicID: z.string().describe(`
        * * Field Name: TopicID
        * * Display Name: Topic
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Topics (vwTopics.ID)
        * * Description: Reference to the detected topic`),
    ConfidenceScore: z.number().describe(`
        * * Field Name: ConfidenceScore
        * * Display Name: Confidence Score
        * * SQL Data Type: decimal(5, 4)
        * * Description: AI confidence score for this topic detection (0.0000 to 1.0000)`),
    RelevanceRank: z.number().describe(`
        * * Field Name: RelevanceRank
        * * Display Name: Relevance Rank
        * * SQL Data Type: int
        * * Default Value: 1
        * * Description: Relevance ranking (1 = primary topic, 2 = secondary, etc.)`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Topic: z.string().describe(`
        * * Field Name: Topic
        * * Display Name: Topic
        * * SQL Data Type: nvarchar(100)`),
});

export type ActivityTopicEntityType = z.infer<typeof ActivityTopicSchema>;

/**
 * zod schema definition for the entity Activity Types
 */
export const ActivityTypeSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(100)
        * * Description: Display name of the activity type`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(500)
        * * Description: Detailed description of what this activity type represents`),
    Icon: z.string().nullable().describe(`
        * * Field Name: Icon
        * * Display Name: Icon
        * * SQL Data Type: nvarchar(100)
        * * Description: Font Awesome or similar icon class for UI display`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type ActivityTypeEntityType = z.infer<typeof ActivityTypeSchema>;

/**
 * zod schema definition for the entity Activity Types__Demo
 */
export const ActivityType__DemoSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(100)
        * * Description: Display name of the activity type`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(500)
        * * Description: Detailed description of what this activity type represents`),
    Icon: z.string().nullable().describe(`
        * * Field Name: Icon
        * * Display Name: Icon
        * * SQL Data Type: nvarchar(100)
        * * Description: Font Awesome or similar icon class for UI display`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type ActivityType__DemoEntityType = z.infer<typeof ActivityType__DemoSchema>;

/**
 * zod schema definition for the entity Contact Insights
 */
export const ContactInsightSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    ContactID: z.string().describe(`
        * * Field Name: ContactID
        * * Display Name: Contact
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Contacts__Demo (vwContacts__Demo.ID)
        * * Description: Reference to the contact these insights are about`),
    OverallSentimentTrend: z.union([z.literal('Declining'), z.literal('Improving'), z.literal('Stable')]).nullable().describe(`
        * * Field Name: OverallSentimentTrend
        * * Display Name: Overall Sentiment Trend
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Declining
    *   * Improving
    *   * Stable
        * * Description: Trend of sentiment over time (Improving, Stable, Declining)`),
    AverageSentimentScore: z.number().nullable().describe(`
        * * Field Name: AverageSentimentScore
        * * Display Name: Average Sentiment Score
        * * SQL Data Type: decimal(5, 4)
        * * Description: Average sentiment score across all activities (-1.0000 to 1.0000)`),
    TopTopics: z.string().nullable().describe(`
        * * Field Name: TopTopics
        * * Display Name: Top Topics
        * * SQL Data Type: nvarchar(MAX)
        * * Description: JSON array of the most common topics for this contact`),
    EngagementLevel: z.union([z.literal('High'), z.literal('Low'), z.literal('Medium')]).nullable().describe(`
        * * Field Name: EngagementLevel
        * * Display Name: Engagement Level
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * High
    *   * Low
    *   * Medium
        * * Description: Overall engagement level based on activity frequency (Low, Medium, High)`),
    ChurnRiskScore: z.number().nullable().describe(`
        * * Field Name: ChurnRiskScore
        * * Display Name: Churn Risk Score
        * * SQL Data Type: decimal(5, 4)
        * * Description: AI-predicted churn risk score (0.0000 to 1.0000)`),
    LastAnalyzedAt: z.date().describe(`
        * * Field Name: LastAnalyzedAt
        * * Display Name: Last Analyzed At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()
        * * Description: Timestamp when insights were last recalculated`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type ContactInsightEntityType = z.infer<typeof ContactInsightSchema>;

/**
 * zod schema definition for the entity Contact Tag Links
 */
export const ContactTagLinkSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    ContactID: z.string().describe(`
        * * Field Name: ContactID
        * * Display Name: Contact
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Contacts__Demo (vwContacts__Demo.ID)
        * * Description: Reference to the contact being tagged`),
    ContactTagID: z.string().describe(`
        * * Field Name: ContactTagID
        * * Display Name: Tag
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Contact Tags (vwContactTags.ID)
        * * Description: Reference to the tag being applied`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    ContactTag: z.string().describe(`
        * * Field Name: ContactTag
        * * Display Name: Tag
        * * SQL Data Type: nvarchar(100)`),
});

export type ContactTagLinkEntityType = z.infer<typeof ContactTagLinkSchema>;

/**
 * zod schema definition for the entity Contact Tags
 */
export const ContactTagSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(100)
        * * Description: Display name of the tag`),
    Color: z.string().nullable().describe(`
        * * Field Name: Color
        * * Display Name: Color
        * * SQL Data Type: nvarchar(50)
        * * Description: Hex color code or color name for UI display`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type ContactTagEntityType = z.infer<typeof ContactTagSchema>;

/**
 * zod schema definition for the entity Contacts
 */
export const ContactSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    FirstName: z.string().describe(`
        * * Field Name: FirstName
        * * Display Name: First Name
        * * SQL Data Type: nvarchar(100)
        * * Description: First name of the contact`),
    LastName: z.string().describe(`
        * * Field Name: LastName
        * * Display Name: Last Name
        * * SQL Data Type: nvarchar(100)
        * * Description: Last name of the contact`),
    Email: z.string().nullable().describe(`
        * * Field Name: Email
        * * Display Name: Email
        * * SQL Data Type: nvarchar(255)
        * * Description: Primary email address for the contact`),
    Phone: z.string().nullable().describe(`
        * * Field Name: Phone
        * * Display Name: Phone
        * * SQL Data Type: nvarchar(50)
        * * Description: Primary phone number for the contact`),
    Company: z.string().nullable().describe(`
        * * Field Name: Company
        * * Display Name: Company
        * * SQL Data Type: nvarchar(255)
        * * Description: Company or organization the contact is associated with`),
    Title: z.string().nullable().describe(`
        * * Field Name: Title
        * * Display Name: Title
        * * SQL Data Type: nvarchar(150)
        * * Description: Job title or role of the contact`),
    Status: z.union([z.literal('Active'), z.literal('Inactive')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Inactive
        * * Description: Current status of the contact (Active or Inactive)`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type ContactEntityType = z.infer<typeof ContactSchema>;

/**
 * zod schema definition for the entity Contacts__CRM
 */
export const Contact__CRMSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    FirstName: z.string().describe(`
        * * Field Name: FirstName
        * * Display Name: First Name
        * * SQL Data Type: nvarchar(100)`),
    LastName: z.string().describe(`
        * * Field Name: LastName
        * * Display Name: Last Name
        * * SQL Data Type: nvarchar(100)`),
    Email: z.string().nullable().describe(`
        * * Field Name: Email
        * * Display Name: Email
        * * SQL Data Type: nvarchar(255)`),
    Phone: z.string().nullable().describe(`
        * * Field Name: Phone
        * * Display Name: Phone
        * * SQL Data Type: nvarchar(50)`),
    Company: z.string().nullable().describe(`
        * * Field Name: Company
        * * Display Name: Company
        * * SQL Data Type: nvarchar(255)`),
    Title: z.string().nullable().describe(`
        * * Field Name: Title
        * * Display Name: Title
        * * SQL Data Type: nvarchar(150)`),
    Status: z.string().describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Active`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type Contact__CRMEntityType = z.infer<typeof Contact__CRMSchema>;

/**
 * zod schema definition for the entity Contacts__Demo
 */
export const Contact__DemoSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    FirstName: z.string().describe(`
        * * Field Name: FirstName
        * * Display Name: First Name
        * * SQL Data Type: nvarchar(100)
        * * Description: First name of the contact`),
    LastName: z.string().describe(`
        * * Field Name: LastName
        * * Display Name: Last Name
        * * SQL Data Type: nvarchar(100)
        * * Description: Last name of the contact`),
    Email: z.string().nullable().describe(`
        * * Field Name: Email
        * * Display Name: Email
        * * SQL Data Type: nvarchar(255)
        * * Description: Primary email address for the contact`),
    Phone: z.string().nullable().describe(`
        * * Field Name: Phone
        * * Display Name: Phone
        * * SQL Data Type: nvarchar(50)
        * * Description: Primary phone number for the contact`),
    Company: z.string().nullable().describe(`
        * * Field Name: Company
        * * Display Name: Company
        * * SQL Data Type: nvarchar(255)
        * * Description: Company or organization the contact is associated with`),
    Title: z.string().nullable().describe(`
        * * Field Name: Title
        * * Display Name: Title
        * * SQL Data Type: nvarchar(150)
        * * Description: Job title or role of the contact`),
    Status: z.union([z.literal('Active'), z.literal('Inactive')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Inactive
        * * Description: Current status of the contact (Active or Inactive)`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type Contact__DemoEntityType = z.infer<typeof Contact__DemoSchema>;

/**
 * zod schema definition for the entity Topics
 */
export const TopicSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(100)
        * * Description: Display name of the topic`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(500)
        * * Description: Detailed description of what this topic covers`),
    ParentTopicID: z.string().nullable().describe(`
        * * Field Name: ParentTopicID
        * * Display Name: Parent Topic
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Topics (vwTopics.ID)
        * * Description: Reference to parent topic for hierarchical organization`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    ParentTopic: z.string().nullable().describe(`
        * * Field Name: ParentTopic
        * * Display Name: Parent Topic Name
        * * SQL Data Type: nvarchar(100)`),
    RootParentTopicID: z.string().nullable().describe(`
        * * Field Name: RootParentTopicID
        * * Display Name: Root Parent Topic
        * * SQL Data Type: uniqueidentifier`),
});

export type TopicEntityType = z.infer<typeof TopicSchema>;
 
 

/**
 * Activities - strongly typed entity sub-class
 * * Schema: Contacts
 * * Base Table: Activity
 * * Base View: vwActivities
 * * @description Records interactions and activities with contacts (calls, emails, meetings, notes)
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Activities')
export class ActivityEntity extends BaseEntity<ActivityEntityType> {
    /**
    * Loads the Activities record from the database
    * @param ID: string - primary key value to load the Activities record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ActivityEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: ContactID
    * * Display Name: Contact
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Contacts (vwContacts.ID)
    * * Description: Reference to the contact this activity is associated with
    */
    get ContactID(): string {
        return this.Get('ContactID');
    }
    set ContactID(value: string) {
        this.Set('ContactID', value);
    }

    /**
    * * Field Name: ActivityTypeID
    * * Display Name: Activity Type
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Activity Types (vwActivityTypes.ID)
    * * Description: Type of activity (Phone Call, Email, Meeting, etc.)
    */
    get ActivityTypeID(): string {
        return this.Get('ActivityTypeID');
    }
    set ActivityTypeID(value: string) {
        this.Set('ActivityTypeID', value);
    }

    /**
    * * Field Name: UserID
    * * Display Name: User
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Users (vwUsers.ID)
    * * Description: MemberJunction user who performed or logged this activity
    */
    get UserID(): string {
        return this.Get('UserID');
    }
    set UserID(value: string) {
        this.Set('UserID', value);
    }

    /**
    * * Field Name: Subject
    * * Display Name: Subject
    * * SQL Data Type: nvarchar(255)
    * * Description: Brief subject line or title for the activity
    */
    get Subject(): string {
        return this.Get('Subject');
    }
    set Subject(value: string) {
        this.Set('Subject', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Detailed description or notes about the activity
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: RawContent
    * * Display Name: Raw Content
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Full raw content of the activity (email body, call transcript, etc.) used for AI analysis
    */
    get RawContent(): string | null {
        return this.Get('RawContent');
    }
    set RawContent(value: string | null) {
        this.Set('RawContent', value);
    }

    /**
    * * Field Name: ActivityDate
    * * Display Name: Activity Date
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    * * Description: Date and time when the activity occurred
    */
    get ActivityDate(): Date {
        return this.Get('ActivityDate');
    }
    set ActivityDate(value: Date) {
        this.Set('ActivityDate', value);
    }

    /**
    * * Field Name: DurationMinutes
    * * Display Name: Duration (Minutes)
    * * SQL Data Type: int
    * * Description: Duration of the activity in minutes (for calls, meetings)
    */
    get DurationMinutes(): number | null {
        return this.Get('DurationMinutes');
    }
    set DurationMinutes(value: number | null) {
        this.Set('DurationMinutes', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Completed
    * * Description: Current status of the activity (Planned, Completed, Cancelled)
    */
    get Status(): string {
        return this.Get('Status');
    }
    set Status(value: string) {
        this.Set('Status', value);
    }

    /**
    * * Field Name: UrgencyLevel
    * * Display Name: Urgency Level
    * * SQL Data Type: nvarchar(20)
    * * Description: AI-detected urgency level (Low, Medium, High, Critical)
    */
    get UrgencyLevel(): string | null {
        return this.Get('UrgencyLevel');
    }
    set UrgencyLevel(value: string | null) {
        this.Set('UrgencyLevel', value);
    }

    /**
    * * Field Name: UrgencyScore
    * * Display Name: Urgency Score
    * * SQL Data Type: decimal(5, 4)
    * * Description: Numeric urgency score from AI analysis (0.0000 to 1.0000)
    */
    get UrgencyScore(): number | null {
        return this.Get('UrgencyScore');
    }
    set UrgencyScore(value: number | null) {
        this.Set('UrgencyScore', value);
    }

    /**
    * * Field Name: RequiresFollowUp
    * * Display Name: Requires Follow Up
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Indicates if this activity requires a follow-up action
    */
    get RequiresFollowUp(): boolean {
        return this.Get('RequiresFollowUp');
    }
    set RequiresFollowUp(value: boolean) {
        this.Set('RequiresFollowUp', value);
    }

    /**
    * * Field Name: FollowUpDate
    * * Display Name: Follow Up Date
    * * SQL Data Type: date
    * * Description: Suggested or scheduled date for follow-up
    */
    get FollowUpDate(): Date | null {
        return this.Get('FollowUpDate');
    }
    set FollowUpDate(value: Date | null) {
        this.Set('FollowUpDate', value);
    }

    /**
    * * Field Name: ProcessedByAI
    * * Display Name: Processed By AI
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Indicates if this activity has been processed by AI for sentiment/tagging
    */
    get ProcessedByAI(): boolean {
        return this.Get('ProcessedByAI');
    }
    set ProcessedByAI(value: boolean) {
        this.Set('ProcessedByAI', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: ActivityType
    * * Display Name: Activity Type
    * * SQL Data Type: nvarchar(100)
    */
    get ActivityType(): string {
        return this.Get('ActivityType');
    }

    /**
    * * Field Name: User
    * * Display Name: User
    * * SQL Data Type: nvarchar(100)
    */
    get User(): string {
        return this.Get('User');
    }
}


/**
 * Activities__Demo - strongly typed entity sub-class
 * * Schema: Demo
 * * Base Table: Activity
 * * Base View: vwActivities__Demo
 * * @description Records interactions and activities with contacts (calls, emails, meetings, notes)
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Activities__Demo')
export class Activity__DemoEntity extends BaseEntity<Activity__DemoEntityType> {
    /**
    * Loads the Activities__Demo record from the database
    * @param ID: string - primary key value to load the Activities__Demo record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof Activity__DemoEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: ContactID
    * * Display Name: Contact
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Contacts__Demo (vwContacts__Demo.ID)
    * * Description: Reference to the contact this activity is associated with
    */
    get ContactID(): string {
        return this.Get('ContactID');
    }
    set ContactID(value: string) {
        this.Set('ContactID', value);
    }

    /**
    * * Field Name: ActivityTypeID
    * * Display Name: Activity Type
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Activity Types__Demo (vwActivityTypes__Demo.ID)
    * * Description: Type of activity (Phone Call, Email, Meeting, etc.)
    */
    get ActivityTypeID(): string {
        return this.Get('ActivityTypeID');
    }
    set ActivityTypeID(value: string) {
        this.Set('ActivityTypeID', value);
    }

    /**
    * * Field Name: UserID
    * * Display Name: User
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Users (vwUsers.ID)
    * * Description: MemberJunction user who performed or logged this activity
    */
    get UserID(): string {
        return this.Get('UserID');
    }
    set UserID(value: string) {
        this.Set('UserID', value);
    }

    /**
    * * Field Name: Subject
    * * Display Name: Subject
    * * SQL Data Type: nvarchar(255)
    * * Description: Brief subject line or title for the activity
    */
    get Subject(): string {
        return this.Get('Subject');
    }
    set Subject(value: string) {
        this.Set('Subject', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Detailed description or notes about the activity
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: RawContent
    * * Display Name: Raw Content
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Full raw content of the activity (email body, call transcript, etc.) used for AI analysis
    */
    get RawContent(): string | null {
        return this.Get('RawContent');
    }
    set RawContent(value: string | null) {
        this.Set('RawContent', value);
    }

    /**
    * * Field Name: ActivityDate
    * * Display Name: Activity Date
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    * * Description: Date and time when the activity occurred
    */
    get ActivityDate(): Date {
        return this.Get('ActivityDate');
    }
    set ActivityDate(value: Date) {
        this.Set('ActivityDate', value);
    }

    /**
    * * Field Name: DurationMinutes
    * * Display Name: Duration (Minutes)
    * * SQL Data Type: int
    * * Description: Duration of the activity in minutes (for calls, meetings)
    */
    get DurationMinutes(): number | null {
        return this.Get('DurationMinutes');
    }
    set DurationMinutes(value: number | null) {
        this.Set('DurationMinutes', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Completed
    * * Value List Type: List
    * * Possible Values 
    *   * Cancelled
    *   * Completed
    *   * Planned
    * * Description: Current status of the activity (Planned, Completed, Cancelled)
    */
    get Status(): 'Cancelled' | 'Completed' | 'Planned' {
        return this.Get('Status');
    }
    set Status(value: 'Cancelled' | 'Completed' | 'Planned') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: UrgencyLevel
    * * Display Name: Urgency Level
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Critical
    *   * High
    *   * Low
    *   * Medium
    * * Description: AI-detected urgency level (Low, Medium, High, Critical)
    */
    get UrgencyLevel(): 'Critical' | 'High' | 'Low' | 'Medium' | null {
        return this.Get('UrgencyLevel');
    }
    set UrgencyLevel(value: 'Critical' | 'High' | 'Low' | 'Medium' | null) {
        this.Set('UrgencyLevel', value);
    }

    /**
    * * Field Name: UrgencyScore
    * * Display Name: Urgency Score
    * * SQL Data Type: decimal(5, 4)
    * * Description: Numeric urgency score from AI analysis (0.0000 to 1.0000)
    */
    get UrgencyScore(): number | null {
        return this.Get('UrgencyScore');
    }
    set UrgencyScore(value: number | null) {
        this.Set('UrgencyScore', value);
    }

    /**
    * * Field Name: RequiresFollowUp
    * * Display Name: Requires Follow Up
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Indicates if this activity requires a follow-up action
    */
    get RequiresFollowUp(): boolean {
        return this.Get('RequiresFollowUp');
    }
    set RequiresFollowUp(value: boolean) {
        this.Set('RequiresFollowUp', value);
    }

    /**
    * * Field Name: FollowUpDate
    * * Display Name: Follow Up Date
    * * SQL Data Type: date
    * * Description: Suggested or scheduled date for follow-up
    */
    get FollowUpDate(): Date | null {
        return this.Get('FollowUpDate');
    }
    set FollowUpDate(value: Date | null) {
        this.Set('FollowUpDate', value);
    }

    /**
    * * Field Name: ProcessedByAI
    * * Display Name: Processed By AI
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Indicates if this activity has been processed by AI for sentiment/tagging
    */
    get ProcessedByAI(): boolean {
        return this.Get('ProcessedByAI');
    }
    set ProcessedByAI(value: boolean) {
        this.Set('ProcessedByAI', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: ActivityType
    * * Display Name: Activity Type
    * * SQL Data Type: nvarchar(100)
    */
    get ActivityType(): string {
        return this.Get('ActivityType');
    }

    /**
    * * Field Name: User
    * * Display Name: User
    * * SQL Data Type: nvarchar(100)
    */
    get User(): string {
        return this.Get('User');
    }
}


/**
 * Activity Sentiments - strongly typed entity sub-class
 * * Schema: Demo
 * * Base Table: ActivitySentiment
 * * Base View: vwActivitySentiments
 * * @description Stores AI-generated sentiment analysis results for activities
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Activity Sentiments')
export class ActivitySentimentEntity extends BaseEntity<ActivitySentimentEntityType> {
    /**
    * Loads the Activity Sentiments record from the database
    * @param ID: string - primary key value to load the Activity Sentiments record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ActivitySentimentEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: ActivityID
    * * Display Name: Activity
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Activities__Demo (vwActivities__Demo.ID)
    * * Description: Reference to the activity that was analyzed
    */
    get ActivityID(): string {
        return this.Get('ActivityID');
    }
    set ActivityID(value: string) {
        this.Set('ActivityID', value);
    }

    /**
    * * Field Name: OverallSentiment
    * * Display Name: Overall Sentiment
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Negative
    *   * Neutral
    *   * Positive
    * * Description: Overall sentiment classification (Positive, Neutral, Negative)
    */
    get OverallSentiment(): 'Negative' | 'Neutral' | 'Positive' {
        return this.Get('OverallSentiment');
    }
    set OverallSentiment(value: 'Negative' | 'Neutral' | 'Positive') {
        this.Set('OverallSentiment', value);
    }

    /**
    * * Field Name: SentimentScore
    * * Display Name: Sentiment Score
    * * SQL Data Type: decimal(5, 4)
    * * Description: Numeric sentiment score from -1.0000 (negative) to 1.0000 (positive)
    */
    get SentimentScore(): number {
        return this.Get('SentimentScore');
    }
    set SentimentScore(value: number) {
        this.Set('SentimentScore', value);
    }

    /**
    * * Field Name: EmotionCategory
    * * Display Name: Emotion Category
    * * SQL Data Type: nvarchar(50)
    * * Description: Detected emotion category (Happy, Frustrated, Confused, Urgent, Grateful, etc.)
    */
    get EmotionCategory(): string | null {
        return this.Get('EmotionCategory');
    }
    set EmotionCategory(value: string | null) {
        this.Set('EmotionCategory', value);
    }

    /**
    * * Field Name: ConfidenceScore
    * * Display Name: Confidence Score
    * * SQL Data Type: decimal(5, 4)
    * * Description: AI confidence in the analysis (0.0000 to 1.0000)
    */
    get ConfidenceScore(): number {
        return this.Get('ConfidenceScore');
    }
    set ConfidenceScore(value: number) {
        this.Set('ConfidenceScore', value);
    }

    /**
    * * Field Name: AnalyzedAt
    * * Display Name: Analyzed At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    * * Description: Timestamp when the AI analysis was performed
    */
    get AnalyzedAt(): Date {
        return this.Get('AnalyzedAt');
    }
    set AnalyzedAt(value: Date) {
        this.Set('AnalyzedAt', value);
    }

    /**
    * * Field Name: AIModelUsed
    * * Display Name: AI Model Used
    * * SQL Data Type: nvarchar(255)
    * * Description: Name or identifier of the AI model used for analysis
    */
    get AIModelUsed(): string | null {
        return this.Get('AIModelUsed');
    }
    set AIModelUsed(value: string | null) {
        this.Set('AIModelUsed', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Activity Tag Links - strongly typed entity sub-class
 * * Schema: Demo
 * * Base Table: ActivityTagLink
 * * Base View: vwActivityTagLinks
 * * @description Join table linking activities to tags with AI confidence metadata
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Activity Tag Links')
export class ActivityTagLinkEntity extends BaseEntity<ActivityTagLinkEntityType> {
    /**
    * Loads the Activity Tag Links record from the database
    * @param ID: string - primary key value to load the Activity Tag Links record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ActivityTagLinkEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: ActivityID
    * * Display Name: Activity
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Activities__Demo (vwActivities__Demo.ID)
    * * Description: Reference to the activity being tagged
    */
    get ActivityID(): string {
        return this.Get('ActivityID');
    }
    set ActivityID(value: string) {
        this.Set('ActivityID', value);
    }

    /**
    * * Field Name: ActivityTagID
    * * Display Name: Tag
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Activity Tags__Demo (vwActivityTags__Demo.ID)
    * * Description: Reference to the tag being applied
    */
    get ActivityTagID(): string {
        return this.Get('ActivityTagID');
    }
    set ActivityTagID(value: string) {
        this.Set('ActivityTagID', value);
    }

    /**
    * * Field Name: ConfidenceScore
    * * Display Name: Confidence Score
    * * SQL Data Type: decimal(5, 4)
    * * Description: AI confidence score for this tag assignment (0.0000 to 1.0000), NULL for manual tags
    */
    get ConfidenceScore(): number | null {
        return this.Get('ConfidenceScore');
    }
    set ConfidenceScore(value: number | null) {
        this.Set('ConfidenceScore', value);
    }

    /**
    * * Field Name: AppliedByAI
    * * Display Name: Applied By AI
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Indicates if this tag was applied by AI vs manually by a user
    */
    get AppliedByAI(): boolean {
        return this.Get('AppliedByAI');
    }
    set AppliedByAI(value: boolean) {
        this.Set('AppliedByAI', value);
    }

    /**
    * * Field Name: AppliedAt
    * * Display Name: Applied At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    * * Description: Timestamp when the tag was applied to the activity
    */
    get AppliedAt(): Date {
        return this.Get('AppliedAt');
    }
    set AppliedAt(value: Date) {
        this.Set('AppliedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: ActivityTag
    * * Display Name: Tag Name
    * * SQL Data Type: nvarchar(100)
    */
    get ActivityTag(): string {
        return this.Get('ActivityTag');
    }
}


/**
 * Activity Tags - strongly typed entity sub-class
 * * Schema: Contacts
 * * Base Table: ActivityTag
 * * Base View: vwActivityTags
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Activity Tags')
export class ActivityTagEntity extends BaseEntity<ActivityTagEntityType> {
    /**
    * Loads the Activity Tags record from the database
    * @param ID: string - primary key value to load the Activity Tags record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ActivityTagEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(100)
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(500)
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: Color
    * * Display Name: Color
    * * SQL Data Type: nvarchar(50)
    */
    get Color(): string | null {
        return this.Get('Color');
    }
    set Color(value: string | null) {
        this.Set('Color', value);
    }

    /**
    * * Field Name: IsAutoGenerated
    * * Display Name: Auto Generated
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get IsAutoGenerated(): boolean {
        return this.Get('IsAutoGenerated');
    }
    set IsAutoGenerated(value: boolean) {
        this.Set('IsAutoGenerated', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Activity Tags__Demo - strongly typed entity sub-class
 * * Schema: Demo
 * * Base Table: ActivityTag
 * * Base View: vwActivityTags__Demo
 * * @description Tags specific to activities, including AI-generated tags (Complaint, Feature Request, Billing Issue, etc.)
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Activity Tags__Demo')
export class ActivityTag__DemoEntity extends BaseEntity<ActivityTag__DemoEntityType> {
    /**
    * Loads the Activity Tags__Demo record from the database
    * @param ID: string - primary key value to load the Activity Tags__Demo record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ActivityTag__DemoEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Tag Name
    * * SQL Data Type: nvarchar(100)
    * * Description: Display name of the activity tag
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(500)
    * * Description: Detailed description of what this tag represents
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: Color
    * * Display Name: Color
    * * SQL Data Type: nvarchar(50)
    * * Description: Hex color code or color name for UI display
    */
    get Color(): string | null {
        return this.Get('Color');
    }
    set Color(value: string | null) {
        this.Set('Color', value);
    }

    /**
    * * Field Name: IsAutoGenerated
    * * Display Name: Auto Generated
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Indicates if this tag was created by AI vs manually by a user
    */
    get IsAutoGenerated(): boolean {
        return this.Get('IsAutoGenerated');
    }
    set IsAutoGenerated(value: boolean) {
        this.Set('IsAutoGenerated', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Activity Topics - strongly typed entity sub-class
 * * Schema: Demo
 * * Base Table: ActivityTopic
 * * Base View: vwActivityTopics
 * * @description Links activities to detected topics with confidence and relevance ranking
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Activity Topics')
export class ActivityTopicEntity extends BaseEntity<ActivityTopicEntityType> {
    /**
    * Loads the Activity Topics record from the database
    * @param ID: string - primary key value to load the Activity Topics record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ActivityTopicEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: ActivityID
    * * Display Name: Activity
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Activities__Demo (vwActivities__Demo.ID)
    * * Description: Reference to the activity
    */
    get ActivityID(): string {
        return this.Get('ActivityID');
    }
    set ActivityID(value: string) {
        this.Set('ActivityID', value);
    }

    /**
    * * Field Name: TopicID
    * * Display Name: Topic
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Topics (vwTopics.ID)
    * * Description: Reference to the detected topic
    */
    get TopicID(): string {
        return this.Get('TopicID');
    }
    set TopicID(value: string) {
        this.Set('TopicID', value);
    }

    /**
    * * Field Name: ConfidenceScore
    * * Display Name: Confidence Score
    * * SQL Data Type: decimal(5, 4)
    * * Description: AI confidence score for this topic detection (0.0000 to 1.0000)
    */
    get ConfidenceScore(): number {
        return this.Get('ConfidenceScore');
    }
    set ConfidenceScore(value: number) {
        this.Set('ConfidenceScore', value);
    }

    /**
    * * Field Name: RelevanceRank
    * * Display Name: Relevance Rank
    * * SQL Data Type: int
    * * Default Value: 1
    * * Description: Relevance ranking (1 = primary topic, 2 = secondary, etc.)
    */
    get RelevanceRank(): number {
        return this.Get('RelevanceRank');
    }
    set RelevanceRank(value: number) {
        this.Set('RelevanceRank', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Topic
    * * Display Name: Topic
    * * SQL Data Type: nvarchar(100)
    */
    get Topic(): string {
        return this.Get('Topic');
    }
}


/**
 * Activity Types - strongly typed entity sub-class
 * * Schema: Contacts
 * * Base Table: ActivityType
 * * Base View: vwActivityTypes
 * * @description Lookup table defining types of activities (Phone Call, Email, Meeting, etc.)
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Activity Types')
export class ActivityTypeEntity extends BaseEntity<ActivityTypeEntityType> {
    /**
    * Loads the Activity Types record from the database
    * @param ID: string - primary key value to load the Activity Types record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ActivityTypeEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(100)
    * * Description: Display name of the activity type
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(500)
    * * Description: Detailed description of what this activity type represents
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: Icon
    * * Display Name: Icon
    * * SQL Data Type: nvarchar(100)
    * * Description: Font Awesome or similar icon class for UI display
    */
    get Icon(): string | null {
        return this.Get('Icon');
    }
    set Icon(value: string | null) {
        this.Set('Icon', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Activity Types__Demo - strongly typed entity sub-class
 * * Schema: Demo
 * * Base Table: ActivityType
 * * Base View: vwActivityTypes__Demo
 * * @description Lookup table defining types of activities (Phone Call, Email, Meeting, etc.)
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Activity Types__Demo')
export class ActivityType__DemoEntity extends BaseEntity<ActivityType__DemoEntityType> {
    /**
    * Loads the Activity Types__Demo record from the database
    * @param ID: string - primary key value to load the Activity Types__Demo record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ActivityType__DemoEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(100)
    * * Description: Display name of the activity type
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(500)
    * * Description: Detailed description of what this activity type represents
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: Icon
    * * Display Name: Icon
    * * SQL Data Type: nvarchar(100)
    * * Description: Font Awesome or similar icon class for UI display
    */
    get Icon(): string | null {
        return this.Get('Icon');
    }
    set Icon(value: string | null) {
        this.Set('Icon', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Contact Insights - strongly typed entity sub-class
 * * Schema: Demo
 * * Base Table: ContactInsight
 * * Base View: vwContactInsights
 * * @description Aggregated AI-generated insights rolled up at the contact level
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Contact Insights')
export class ContactInsightEntity extends BaseEntity<ContactInsightEntityType> {
    /**
    * Loads the Contact Insights record from the database
    * @param ID: string - primary key value to load the Contact Insights record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ContactInsightEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: ContactID
    * * Display Name: Contact
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Contacts__Demo (vwContacts__Demo.ID)
    * * Description: Reference to the contact these insights are about
    */
    get ContactID(): string {
        return this.Get('ContactID');
    }
    set ContactID(value: string) {
        this.Set('ContactID', value);
    }

    /**
    * * Field Name: OverallSentimentTrend
    * * Display Name: Overall Sentiment Trend
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Declining
    *   * Improving
    *   * Stable
    * * Description: Trend of sentiment over time (Improving, Stable, Declining)
    */
    get OverallSentimentTrend(): 'Declining' | 'Improving' | 'Stable' | null {
        return this.Get('OverallSentimentTrend');
    }
    set OverallSentimentTrend(value: 'Declining' | 'Improving' | 'Stable' | null) {
        this.Set('OverallSentimentTrend', value);
    }

    /**
    * * Field Name: AverageSentimentScore
    * * Display Name: Average Sentiment Score
    * * SQL Data Type: decimal(5, 4)
    * * Description: Average sentiment score across all activities (-1.0000 to 1.0000)
    */
    get AverageSentimentScore(): number | null {
        return this.Get('AverageSentimentScore');
    }
    set AverageSentimentScore(value: number | null) {
        this.Set('AverageSentimentScore', value);
    }

    /**
    * * Field Name: TopTopics
    * * Display Name: Top Topics
    * * SQL Data Type: nvarchar(MAX)
    * * Description: JSON array of the most common topics for this contact
    */
    get TopTopics(): string | null {
        return this.Get('TopTopics');
    }
    set TopTopics(value: string | null) {
        this.Set('TopTopics', value);
    }

    /**
    * * Field Name: EngagementLevel
    * * Display Name: Engagement Level
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * High
    *   * Low
    *   * Medium
    * * Description: Overall engagement level based on activity frequency (Low, Medium, High)
    */
    get EngagementLevel(): 'High' | 'Low' | 'Medium' | null {
        return this.Get('EngagementLevel');
    }
    set EngagementLevel(value: 'High' | 'Low' | 'Medium' | null) {
        this.Set('EngagementLevel', value);
    }

    /**
    * * Field Name: ChurnRiskScore
    * * Display Name: Churn Risk Score
    * * SQL Data Type: decimal(5, 4)
    * * Description: AI-predicted churn risk score (0.0000 to 1.0000)
    */
    get ChurnRiskScore(): number | null {
        return this.Get('ChurnRiskScore');
    }
    set ChurnRiskScore(value: number | null) {
        this.Set('ChurnRiskScore', value);
    }

    /**
    * * Field Name: LastAnalyzedAt
    * * Display Name: Last Analyzed At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    * * Description: Timestamp when insights were last recalculated
    */
    get LastAnalyzedAt(): Date {
        return this.Get('LastAnalyzedAt');
    }
    set LastAnalyzedAt(value: Date) {
        this.Set('LastAnalyzedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Contact Tag Links - strongly typed entity sub-class
 * * Schema: Demo
 * * Base Table: ContactTagLink
 * * Base View: vwContactTagLinks
 * * @description Join table linking contacts to their tags (many-to-many relationship)
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Contact Tag Links')
export class ContactTagLinkEntity extends BaseEntity<ContactTagLinkEntityType> {
    /**
    * Loads the Contact Tag Links record from the database
    * @param ID: string - primary key value to load the Contact Tag Links record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ContactTagLinkEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: ContactID
    * * Display Name: Contact
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Contacts__Demo (vwContacts__Demo.ID)
    * * Description: Reference to the contact being tagged
    */
    get ContactID(): string {
        return this.Get('ContactID');
    }
    set ContactID(value: string) {
        this.Set('ContactID', value);
    }

    /**
    * * Field Name: ContactTagID
    * * Display Name: Tag
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Contact Tags (vwContactTags.ID)
    * * Description: Reference to the tag being applied
    */
    get ContactTagID(): string {
        return this.Get('ContactTagID');
    }
    set ContactTagID(value: string) {
        this.Set('ContactTagID', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: ContactTag
    * * Display Name: Tag
    * * SQL Data Type: nvarchar(100)
    */
    get ContactTag(): string {
        return this.Get('ContactTag');
    }
}


/**
 * Contact Tags - strongly typed entity sub-class
 * * Schema: Demo
 * * Base Table: ContactTag
 * * Base View: vwContactTags
 * * @description Tags for categorizing and grouping contacts (VIP, Lead, Customer, etc.)
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Contact Tags')
export class ContactTagEntity extends BaseEntity<ContactTagEntityType> {
    /**
    * Loads the Contact Tags record from the database
    * @param ID: string - primary key value to load the Contact Tags record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ContactTagEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(100)
    * * Description: Display name of the tag
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Color
    * * Display Name: Color
    * * SQL Data Type: nvarchar(50)
    * * Description: Hex color code or color name for UI display
    */
    get Color(): string | null {
        return this.Get('Color');
    }
    set Color(value: string | null) {
        this.Set('Color', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Contacts - strongly typed entity sub-class
 * * Schema: Contacts
 * * Base Table: Contact
 * * Base View: vwContacts
 * * @description Stores contact information for people being tracked in the CRM system
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Contacts')
export class ContactEntity extends BaseEntity<ContactEntityType> {
    /**
    * Loads the Contacts record from the database
    * @param ID: string - primary key value to load the Contacts record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ContactEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: FirstName
    * * Display Name: First Name
    * * SQL Data Type: nvarchar(100)
    * * Description: First name of the contact
    */
    get FirstName(): string {
        return this.Get('FirstName');
    }
    set FirstName(value: string) {
        this.Set('FirstName', value);
    }

    /**
    * * Field Name: LastName
    * * Display Name: Last Name
    * * SQL Data Type: nvarchar(100)
    * * Description: Last name of the contact
    */
    get LastName(): string {
        return this.Get('LastName');
    }
    set LastName(value: string) {
        this.Set('LastName', value);
    }

    /**
    * * Field Name: Email
    * * Display Name: Email
    * * SQL Data Type: nvarchar(255)
    * * Description: Primary email address for the contact
    */
    get Email(): string | null {
        return this.Get('Email');
    }
    set Email(value: string | null) {
        this.Set('Email', value);
    }

    /**
    * * Field Name: Phone
    * * Display Name: Phone
    * * SQL Data Type: nvarchar(50)
    * * Description: Primary phone number for the contact
    */
    get Phone(): string | null {
        return this.Get('Phone');
    }
    set Phone(value: string | null) {
        this.Set('Phone', value);
    }

    /**
    * * Field Name: Company
    * * Display Name: Company
    * * SQL Data Type: nvarchar(255)
    * * Description: Company or organization the contact is associated with
    */
    get Company(): string | null {
        return this.Get('Company');
    }
    set Company(value: string | null) {
        this.Set('Company', value);
    }

    /**
    * * Field Name: Title
    * * Display Name: Title
    * * SQL Data Type: nvarchar(150)
    * * Description: Job title or role of the contact
    */
    get Title(): string | null {
        return this.Get('Title');
    }
    set Title(value: string | null) {
        this.Set('Title', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Inactive
    * * Description: Current status of the contact (Active or Inactive)
    */
    get Status(): 'Active' | 'Inactive' {
        return this.Get('Status');
    }
    set Status(value: 'Active' | 'Inactive') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Contacts__CRM - strongly typed entity sub-class
 * * Schema: CRM
 * * Base Table: Contact
 * * Base View: vwContacts__CRM
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Contacts__CRM')
export class Contact__CRMEntity extends BaseEntity<Contact__CRMEntityType> {
    /**
    * Loads the Contacts__CRM record from the database
    * @param ID: string - primary key value to load the Contacts__CRM record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof Contact__CRMEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: FirstName
    * * Display Name: First Name
    * * SQL Data Type: nvarchar(100)
    */
    get FirstName(): string {
        return this.Get('FirstName');
    }
    set FirstName(value: string) {
        this.Set('FirstName', value);
    }

    /**
    * * Field Name: LastName
    * * Display Name: Last Name
    * * SQL Data Type: nvarchar(100)
    */
    get LastName(): string {
        return this.Get('LastName');
    }
    set LastName(value: string) {
        this.Set('LastName', value);
    }

    /**
    * * Field Name: Email
    * * Display Name: Email
    * * SQL Data Type: nvarchar(255)
    */
    get Email(): string | null {
        return this.Get('Email');
    }
    set Email(value: string | null) {
        this.Set('Email', value);
    }

    /**
    * * Field Name: Phone
    * * Display Name: Phone
    * * SQL Data Type: nvarchar(50)
    */
    get Phone(): string | null {
        return this.Get('Phone');
    }
    set Phone(value: string | null) {
        this.Set('Phone', value);
    }

    /**
    * * Field Name: Company
    * * Display Name: Company
    * * SQL Data Type: nvarchar(255)
    */
    get Company(): string | null {
        return this.Get('Company');
    }
    set Company(value: string | null) {
        this.Set('Company', value);
    }

    /**
    * * Field Name: Title
    * * Display Name: Title
    * * SQL Data Type: nvarchar(150)
    */
    get Title(): string | null {
        return this.Get('Title');
    }
    set Title(value: string | null) {
        this.Set('Title', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Active
    */
    get Status(): string {
        return this.Get('Status');
    }
    set Status(value: string) {
        this.Set('Status', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Contacts__Demo - strongly typed entity sub-class
 * * Schema: Demo
 * * Base Table: Contact
 * * Base View: vwContacts__Demo
 * * @description Stores contact information for people being tracked in the CRM system
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Contacts__Demo')
export class Contact__DemoEntity extends BaseEntity<Contact__DemoEntityType> {
    /**
    * Loads the Contacts__Demo record from the database
    * @param ID: string - primary key value to load the Contacts__Demo record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof Contact__DemoEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: FirstName
    * * Display Name: First Name
    * * SQL Data Type: nvarchar(100)
    * * Description: First name of the contact
    */
    get FirstName(): string {
        return this.Get('FirstName');
    }
    set FirstName(value: string) {
        this.Set('FirstName', value);
    }

    /**
    * * Field Name: LastName
    * * Display Name: Last Name
    * * SQL Data Type: nvarchar(100)
    * * Description: Last name of the contact
    */
    get LastName(): string {
        return this.Get('LastName');
    }
    set LastName(value: string) {
        this.Set('LastName', value);
    }

    /**
    * * Field Name: Email
    * * Display Name: Email
    * * SQL Data Type: nvarchar(255)
    * * Description: Primary email address for the contact
    */
    get Email(): string | null {
        return this.Get('Email');
    }
    set Email(value: string | null) {
        this.Set('Email', value);
    }

    /**
    * * Field Name: Phone
    * * Display Name: Phone
    * * SQL Data Type: nvarchar(50)
    * * Description: Primary phone number for the contact
    */
    get Phone(): string | null {
        return this.Get('Phone');
    }
    set Phone(value: string | null) {
        this.Set('Phone', value);
    }

    /**
    * * Field Name: Company
    * * Display Name: Company
    * * SQL Data Type: nvarchar(255)
    * * Description: Company or organization the contact is associated with
    */
    get Company(): string | null {
        return this.Get('Company');
    }
    set Company(value: string | null) {
        this.Set('Company', value);
    }

    /**
    * * Field Name: Title
    * * Display Name: Title
    * * SQL Data Type: nvarchar(150)
    * * Description: Job title or role of the contact
    */
    get Title(): string | null {
        return this.Get('Title');
    }
    set Title(value: string | null) {
        this.Set('Title', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Inactive
    * * Description: Current status of the contact (Active or Inactive)
    */
    get Status(): 'Active' | 'Inactive' {
        return this.Get('Status');
    }
    set Status(value: 'Active' | 'Inactive') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Topics - strongly typed entity sub-class
 * * Schema: Demo
 * * Base Table: Topic
 * * Base View: vwTopics
 * * @description Hierarchical topic/theme categories detected in activities (Pricing, Support, Partnership, etc.)
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Topics')
export class TopicEntity extends BaseEntity<TopicEntityType> {
    /**
    * Loads the Topics record from the database
    * @param ID: string - primary key value to load the Topics record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof TopicEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(100)
    * * Description: Display name of the topic
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(500)
    * * Description: Detailed description of what this topic covers
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: ParentTopicID
    * * Display Name: Parent Topic
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Topics (vwTopics.ID)
    * * Description: Reference to parent topic for hierarchical organization
    */
    get ParentTopicID(): string | null {
        return this.Get('ParentTopicID');
    }
    set ParentTopicID(value: string | null) {
        this.Set('ParentTopicID', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: ParentTopic
    * * Display Name: Parent Topic Name
    * * SQL Data Type: nvarchar(100)
    */
    get ParentTopic(): string | null {
        return this.Get('ParentTopic');
    }

    /**
    * * Field Name: RootParentTopicID
    * * Display Name: Root Parent Topic
    * * SQL Data Type: uniqueidentifier
    */
    get RootParentTopicID(): string | null {
        return this.Get('RootParentTopicID');
    }
}
