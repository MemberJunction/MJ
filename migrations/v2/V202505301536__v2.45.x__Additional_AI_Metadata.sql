-- Add PromptRole and PromptPosition columns to ${flyway:defaultSchema}.AIPrompt table
  ALTER TABLE [${flyway:defaultSchema}].[AIPrompt]
  ADD [PromptRole] nvarchar(20) NOT NULL
      CONSTRAINT [DF_AIPrompt_PromptRole] DEFAULT N'System'
      CONSTRAINT [CK_AIPrompt_PromptRole] CHECK ([PromptRole] IN (N'System', N'User', N'Assistant', N'SystemOrUser')),
      [PromptPosition] nvarchar(20) NOT NULL
      CONSTRAINT [DF_AIPrompt_PromptPosition] DEFAULT N'First'
      CONSTRAINT [CK_AIPrompt_PromptPosition] CHECK ([PromptPosition] IN (N'First', N'Last'));

  -- Document the PromptRole column
  EXEC sp_addextendedproperty
      @name = N'MS_Description',
      @value = N'Determines how the prompt is used in conversation: System (always first message), User (positioned by PromptPosition), Assistant (positioned by PromptPosition), or SystemOrUser (try system first, fallback to user last if system slot taken)',
      @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
      @level1type = N'TABLE',  @level1name = N'AIPrompt',
      @level2type = N'COLUMN', @level2name = N'PromptRole';

  -- Document the PromptPosition column  
  EXEC sp_addextendedproperty
      @name = N'MS_Description',
      @value = N'Controls message placement for User and Assistant role prompts: First (beginning of conversation) or Last (end of conversation). Not used for System role prompts which are always first',
      @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
      @level1type = N'TABLE',  @level1name = N'AIPrompt',
      @level2type = N'COLUMN', @level2name = N'PromptPosition';
