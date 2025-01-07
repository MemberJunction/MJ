ALTER TABLE ${flyway:defaultSchema}.ConversationDetail
ADD
    UserRating INT NULL,
    UserFeedback NVARCHAR(MAX) NULL,
    ReflectionInsights NVARCHAR(MAX) NULL,
    SummaryOfEarlierConversation NVARCHAR(MAX) NULL;
GO
-- Add check constraint for UserRating to limit values between 1 and 10
ALTER TABLE ${flyway:defaultSchema}.ConversationDetail
ADD CONSTRAINT CK_UserRating_Range CHECK (UserRating BETWEEN 1 AND 10);

-- Add extended properties for the new columns
EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'This column is used to capture user feedback as a rating scale. The scale ranges from 1 to 10, where 1 might represent thumbs down, and 10 might represent thumbs up or the highest rating in a star-based scale.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ConversationDetail',
    @level2type = N'COLUMN', @level2name = 'UserRating';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'This column is used to store user text feedback about a given AI response, describing what they liked or disliked.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ConversationDetail',
    @level2type = N'COLUMN', @level2name = 'UserFeedback';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'This column stores human or AI-generated reflections on how to improve future responses based on the user feedback and the AI output generated for prior messages in the conversation.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ConversationDetail',
    @level2type = N'COLUMN', @level2name = 'ReflectionInsights';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'This column optionally stores a summary of the entire conversation leading up to this particular conversation detail record. It is used in long-running conversations to optimize performance by summarizing earlier parts.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ConversationDetail',
    @level2type = N'COLUMN', @level2name = 'SummaryOfEarlierConversation';
