/* SQL text to add special date field __mj_CreatedAt to entity BoardGameNight.GameDesigner */
ALTER TABLE [BoardGameNight].[GameDesigner] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity BoardGameNight.GameDesigner */
UPDATE [BoardGameNight].[GameDesigner] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity BoardGameNight.GameDesigner */
ALTER TABLE [BoardGameNight].[GameDesigner] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity BoardGameNight.GameDesigner */
ALTER TABLE [BoardGameNight].[GameDesigner] ADD CONSTRAINT [DF_BoardGameNight_GameDesigner___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity BoardGameNight.GameDesigner */
ALTER TABLE [BoardGameNight].[GameDesigner] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity BoardGameNight.GameDesigner */
UPDATE [BoardGameNight].[GameDesigner] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity BoardGameNight.GameDesigner */
ALTER TABLE [BoardGameNight].[GameDesigner] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity BoardGameNight.GameDesigner */
ALTER TABLE [BoardGameNight].[GameDesigner] ADD CONSTRAINT [DF_BoardGameNight_GameDesigner___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity BoardGameNight.Game */
ALTER TABLE [BoardGameNight].[Game] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity BoardGameNight.Game */
UPDATE [BoardGameNight].[Game] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity BoardGameNight.Game */
ALTER TABLE [BoardGameNight].[Game] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity BoardGameNight.Game */
ALTER TABLE [BoardGameNight].[Game] ADD CONSTRAINT [DF_BoardGameNight_Game___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity BoardGameNight.Game */
ALTER TABLE [BoardGameNight].[Game] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity BoardGameNight.Game */
UPDATE [BoardGameNight].[Game] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity BoardGameNight.Game */
ALTER TABLE [BoardGameNight].[Game] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity BoardGameNight.Game */
ALTER TABLE [BoardGameNight].[Game] ADD CONSTRAINT [DF_BoardGameNight_Game___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity BoardGameNight.Publisher */
ALTER TABLE [BoardGameNight].[Publisher] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity BoardGameNight.Publisher */
UPDATE [BoardGameNight].[Publisher] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity BoardGameNight.Publisher */
ALTER TABLE [BoardGameNight].[Publisher] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity BoardGameNight.Publisher */
ALTER TABLE [BoardGameNight].[Publisher] ADD CONSTRAINT [DF_BoardGameNight_Publisher___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity BoardGameNight.Publisher */
ALTER TABLE [BoardGameNight].[Publisher] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity BoardGameNight.Publisher */
UPDATE [BoardGameNight].[Publisher] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity BoardGameNight.Publisher */
ALTER TABLE [BoardGameNight].[Publisher] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity BoardGameNight.Publisher */
ALTER TABLE [BoardGameNight].[Publisher] ADD CONSTRAINT [DF_BoardGameNight_Publisher___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity BoardGameNight.Player */
ALTER TABLE [BoardGameNight].[Player] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity BoardGameNight.Player */
UPDATE [BoardGameNight].[Player] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity BoardGameNight.Player */
ALTER TABLE [BoardGameNight].[Player] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity BoardGameNight.Player */
ALTER TABLE [BoardGameNight].[Player] ADD CONSTRAINT [DF_BoardGameNight_Player___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity BoardGameNight.Player */
ALTER TABLE [BoardGameNight].[Player] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity BoardGameNight.Player */
UPDATE [BoardGameNight].[Player] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity BoardGameNight.Player */
ALTER TABLE [BoardGameNight].[Player] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity BoardGameNight.Player */
ALTER TABLE [BoardGameNight].[Player] ADD CONSTRAINT [DF_BoardGameNight_Player___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity BoardGameNight.Designer */
ALTER TABLE [BoardGameNight].[Designer] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity BoardGameNight.Designer */
UPDATE [BoardGameNight].[Designer] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity BoardGameNight.Designer */
ALTER TABLE [BoardGameNight].[Designer] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity BoardGameNight.Designer */
ALTER TABLE [BoardGameNight].[Designer] ADD CONSTRAINT [DF_BoardGameNight_Designer___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity BoardGameNight.Designer */
ALTER TABLE [BoardGameNight].[Designer] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity BoardGameNight.Designer */
UPDATE [BoardGameNight].[Designer] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity BoardGameNight.Designer */
ALTER TABLE [BoardGameNight].[Designer] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity BoardGameNight.Designer */
ALTER TABLE [BoardGameNight].[Designer] ADD CONSTRAINT [DF_BoardGameNight_Designer___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity BoardGameNight.PlaySession */
ALTER TABLE [BoardGameNight].[PlaySession] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity BoardGameNight.PlaySession */
UPDATE [BoardGameNight].[PlaySession] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity BoardGameNight.PlaySession */
ALTER TABLE [BoardGameNight].[PlaySession] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity BoardGameNight.PlaySession */
ALTER TABLE [BoardGameNight].[PlaySession] ADD CONSTRAINT [DF_BoardGameNight_PlaySession___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity BoardGameNight.PlaySession */
ALTER TABLE [BoardGameNight].[PlaySession] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity BoardGameNight.PlaySession */
UPDATE [BoardGameNight].[PlaySession] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity BoardGameNight.PlaySession */
ALTER TABLE [BoardGameNight].[PlaySession] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity BoardGameNight.PlaySession */
ALTER TABLE [BoardGameNight].[PlaySession] ADD CONSTRAINT [DF_BoardGameNight_PlaySession___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity BoardGameNight.PlaySessionPlayer */
ALTER TABLE [BoardGameNight].[PlaySessionPlayer] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity BoardGameNight.PlaySessionPlayer */
UPDATE [BoardGameNight].[PlaySessionPlayer] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity BoardGameNight.PlaySessionPlayer */
ALTER TABLE [BoardGameNight].[PlaySessionPlayer] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity BoardGameNight.PlaySessionPlayer */
ALTER TABLE [BoardGameNight].[PlaySessionPlayer] ADD CONSTRAINT [DF_BoardGameNight_PlaySessionPlayer___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity BoardGameNight.PlaySessionPlayer */
ALTER TABLE [BoardGameNight].[PlaySessionPlayer] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity BoardGameNight.PlaySessionPlayer */
UPDATE [BoardGameNight].[PlaySessionPlayer] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity BoardGameNight.PlaySessionPlayer */
ALTER TABLE [BoardGameNight].[PlaySessionPlayer] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity BoardGameNight.PlaySessionPlayer */
ALTER TABLE [BoardGameNight].[PlaySessionPlayer] ADD CONSTRAINT [DF_BoardGameNight_PlaySessionPlayer___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

