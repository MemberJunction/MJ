-- =============================================================================================================
-- Board Game Night Demo Schema
-- MemberJunction Learning Demo: New Entities + CodeGen
--
-- This script creates a standalone [BoardGameNight] schema with tables and sample data designed to
-- exercise the parts of MemberJunction CodeGen that are most worth seeing:
--
--   1. Straightforward entities with FK relationships
--      Publisher -> Game -> PlaySession
--
--   2. A junction table WITH a payload (the centerpiece)
--      PlaySession >-- PlaySessionPlayer --< Player
--      Carries Score, Placement, IsWinner, FactionOrColor. CodeGen produces related-entity grids on
--      BOTH parent forms, with the payload columns visible.
--
--   3. A PURE junction table for contrast (no payload)
--      Game >-- GameDesigner --< Designer
--
--   4. CHECK constraints as value lists
--      Game.Category, Game.OwnershipStatus, Player.SkillLevel, PlaySession.Outcome all become
--      EntityFieldValue rows, which become real dropdowns in the generated Angular forms.
--      Game.Weight uses a RANGE check instead -- deliberately, to show what does NOT become a value list.
--
--   5. A 4-deep FK chain
--      Publisher -> Game -> PlaySession -> PlaySessionPlayer, which is what makes the generated
--      base views worth reading.
--
-- WHAT THIS SCRIPT DELIBERATELY DOES NOT CREATE (all of it is CodeGen's job -- do not hand-author):
--   - __mj_CreatedAt / __mj_UpdatedAt columns and their update triggers
--   - Base views (vw*)
--   - CRUD stored procedures (spCreate* / spUpdate* / spDelete*)
--   - Foreign key indexes (IDX_AUTO_MJ_FKEY_*)
--   - Entity / EntityField / EntityFieldValue metadata rows
--
-- USAGE:
--   1. Run this script against your OWN development database (never a shared one -- see CLAUDE.md,
--      "One database per agent"). It creates the [BoardGameNight] schema and everything in it.
--      It does NOT touch the MJ metadata schema.
--   2. Add "BoardGameNight" to the schema list CodeGen scans, then run `mj codegen`.
--   3. Read the generated entity subclasses, resolvers, and forms. That is the payoff.
--
-- RE-RUNNING THIS SCRIPT OBLIGATES A FOLLOW-UP `mj codegen`. Phase 1 drops only the seven tables,
-- which is all this script owns. Once CodeGen has run against this schema, dropping those tables
-- leaves its output stranded: the vw* views and spCreate*/spUpdate* procs survive (a non-schemabound
-- view does not block DROP TABLE), Phase 2 recreates the tables WITHOUT __mj_CreatedAt /
-- __mj_UpdatedAt, and every one of those objects then fails at runtime with "Invalid column name".
-- MJ metadata is left holding EntityField rows for two columns that no longer exist -- the
-- broken-metadata state CLAUDE.md describes under "One database per agent". Nothing reports an
-- error until something reads the schema, so re-run CodeGen immediately, not eventually.
--
-- ASCII ONLY: designer names use unaccented spellings so the file is safe under any sqlcmd codepage.
-- =============================================================================================================


-- =============================================================================================================
-- PHASE 1: CREATE SCHEMA
-- =============================================================================================================
PRINT '=== Phase 1: Creating BoardGameNight schema ===';
GO

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'BoardGameNight')
BEGIN
    EXEC('CREATE SCHEMA [BoardGameNight]');
    PRINT '  Created schema [BoardGameNight]';
END
ELSE
BEGIN
    PRINT '  Schema [BoardGameNight] already exists, dropping existing objects...';

    -- Tables only. CodeGen's vw* views and sp* procs are deliberately left alone -- they are its
    -- output, not ours, and deleting them here would muddle the point the header makes. The cost is
    -- that they briefly reference columns Phase 2 does not recreate, which is why re-running this
    -- script REQUIRES re-running `mj codegen` afterward. See the header note.

    -- Drop in reverse dependency order
    IF OBJECT_ID('BoardGameNight.PlaySessionPlayer', 'U') IS NOT NULL
        DROP TABLE [BoardGameNight].[PlaySessionPlayer];
    IF OBJECT_ID('BoardGameNight.PlaySession', 'U') IS NOT NULL
        DROP TABLE [BoardGameNight].[PlaySession];
    IF OBJECT_ID('BoardGameNight.GameDesigner', 'U') IS NOT NULL
        DROP TABLE [BoardGameNight].[GameDesigner];
    IF OBJECT_ID('BoardGameNight.Game', 'U') IS NOT NULL
        DROP TABLE [BoardGameNight].[Game];
    IF OBJECT_ID('BoardGameNight.Designer', 'U') IS NOT NULL
        DROP TABLE [BoardGameNight].[Designer];
    IF OBJECT_ID('BoardGameNight.Publisher', 'U') IS NOT NULL
        DROP TABLE [BoardGameNight].[Publisher];
    IF OBJECT_ID('BoardGameNight.Player', 'U') IS NOT NULL
        DROP TABLE [BoardGameNight].[Player];

    PRINT '  Dropped existing tables';

    -- Only worth saying when CodeGen has actually run here; a first run has no output to strand.
    IF EXISTS (SELECT 1 FROM sys.views v JOIN sys.schemas s ON s.schema_id = v.schema_id
               WHERE s.name = 'BoardGameNight' AND v.name LIKE 'vw%')
    BEGIN
        PRINT '';
        PRINT '  *** CodeGen output detected in this schema. Its views and procs now reference';
        PRINT '  *** __mj_CreatedAt / __mj_UpdatedAt, which Phase 2 does NOT recreate.';
        PRINT '  *** You MUST run `mj codegen` after this script finishes, or reads against';
        PRINT '  *** [BoardGameNight] will fail with "Invalid column name".';
        PRINT '';
    END
END
GO


-- =============================================================================================================
-- PHASE 2: TABLES
--
-- Primary keys, foreign keys, CHECK constraints, and UNIQUE constraints only.
-- No audit columns, no indexes, no views, no procs -- CodeGen owns all of those.
-- =============================================================================================================
PRINT '=== Phase 2: Creating tables ===';
GO

-- ---------------------------------------------------------------------------
-- Publisher: the company that published a game.
-- Parent of Game (1:N).
-- ---------------------------------------------------------------------------
CREATE TABLE [BoardGameNight].[Publisher] (
    [ID]          UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [Name]        NVARCHAR(200)    NOT NULL,
    [FoundedYear] INT              NULL,
    [Country]     NVARCHAR(100)    NULL,
    [Website]     NVARCHAR(500)    NULL,
    CONSTRAINT [PK_BGN_Publisher] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [UQ_BGN_Publisher_Name] UNIQUE ([Name]),
    CONSTRAINT [CK_BGN_Publisher_FoundedYear] CHECK ([FoundedYear] IS NULL OR [FoundedYear] BETWEEN 1800 AND 2100)
);
PRINT '  Created [BoardGameNight].[Publisher]';
GO

-- ---------------------------------------------------------------------------
-- Designer: a person who designed one or more games.
-- Linked to Game through the GameDesigner pure junction (M:N).
-- ---------------------------------------------------------------------------
CREATE TABLE [BoardGameNight].[Designer] (
    [ID]        UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [FirstName] NVARCHAR(100)    NOT NULL,
    [LastName]  NVARCHAR(100)    NOT NULL,
    [Bio]       NVARCHAR(MAX)    NULL,
    [Website]   NVARCHAR(500)    NULL,
    CONSTRAINT [PK_BGN_Designer] PRIMARY KEY CLUSTERED ([ID])
);
PRINT '  Created [BoardGameNight].[Designer]';
GO

-- ---------------------------------------------------------------------------
-- Game: a board game in the collection (or on the wishlist).
--
-- Two CHECK constraints here become dropdowns after CodeGen (Category, OwnershipStatus).
-- A third (Weight) is a RANGE check and deliberately does NOT -- it stays a plain numeric input.
-- That contrast is the lesson.
-- ---------------------------------------------------------------------------
CREATE TABLE [BoardGameNight].[Game] (
    [ID]                 UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [Name]               NVARCHAR(255)    NOT NULL,
    [PublisherID]        UNIQUEIDENTIFIER NOT NULL,
    [YearPublished]      INT              NULL,
    [MinPlayers]         INT              NOT NULL,
    [MaxPlayers]         INT              NOT NULL,
    [MinPlayTimeMinutes] INT              NULL,
    [MaxPlayTimeMinutes] INT              NULL,
    [Weight]             DECIMAL(3,2)     NULL,
    [Category]           NVARCHAR(50)     NOT NULL,
    [OwnershipStatus]    NVARCHAR(30)     NOT NULL DEFAULT 'Owned',
    [AcquiredDate]       DATE             NULL,
    [PurchasePrice]      DECIMAL(10,2)    NULL,
    [Notes]              NVARCHAR(MAX)    NULL,
    CONSTRAINT [PK_BGN_Game] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_BGN_Game_Publisher] FOREIGN KEY ([PublisherID])
        REFERENCES [BoardGameNight].[Publisher]([ID]),
    CONSTRAINT [CK_BGN_Game_Category] CHECK ([Category] IN
        ('Strategy', 'Family', 'Party', 'Co-op', 'Deck Builder', 'Abstract', 'Dexterity', 'Trivia', 'Legacy')),
    CONSTRAINT [CK_BGN_Game_OwnershipStatus] CHECK ([OwnershipStatus] IN
        ('Owned', 'Wishlist', 'Loaned Out', 'Sold', 'Retired')),
    -- Range check, NOT a value list. CodeGen will not build a dropdown from this.
    CONSTRAINT [CK_BGN_Game_Weight] CHECK ([Weight] IS NULL OR [Weight] BETWEEN 1.00 AND 5.00),
    CONSTRAINT [CK_BGN_Game_PlayerCount] CHECK ([MinPlayers] >= 1 AND [MaxPlayers] >= [MinPlayers]),
    CONSTRAINT [CK_BGN_Game_PlayTime] CHECK
        ([MinPlayTimeMinutes] IS NULL OR [MaxPlayTimeMinutes] IS NULL OR [MaxPlayTimeMinutes] >= [MinPlayTimeMinutes])
);
PRINT '  Created [BoardGameNight].[Game]';
GO

-- ---------------------------------------------------------------------------
-- GameDesigner: PURE junction table (M:N, no payload).
--
-- Contrast this with PlaySessionPlayer below. Same machinery, visibly different generated result:
-- CodeGen produces a simple link grid here, versus a data-bearing grid there.
-- ---------------------------------------------------------------------------
CREATE TABLE [BoardGameNight].[GameDesigner] (
    [ID]         UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [GameID]     UNIQUEIDENTIFIER NOT NULL,
    [DesignerID] UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT [PK_BGN_GameDesigner] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_BGN_GameDesigner_Game] FOREIGN KEY ([GameID])
        REFERENCES [BoardGameNight].[Game]([ID]),
    CONSTRAINT [FK_BGN_GameDesigner_Designer] FOREIGN KEY ([DesignerID])
        REFERENCES [BoardGameNight].[Designer]([ID]),
    CONSTRAINT [UQ_BGN_GameDesigner] UNIQUE ([GameID], [DesignerID])
);
PRINT '  Created [BoardGameNight].[GameDesigner] (pure junction)';
GO

-- ---------------------------------------------------------------------------
-- Player: a person who shows up on game night.
-- Parent of PlaySessionPlayer (1:N).
-- ---------------------------------------------------------------------------
CREATE TABLE [BoardGameNight].[Player] (
    [ID]         UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [FirstName]  NVARCHAR(100)    NOT NULL,
    [LastName]   NVARCHAR(100)    NOT NULL,
    [Nickname]   NVARCHAR(50)     NULL,
    [Email]      NVARCHAR(255)    NULL,
    [JoinedDate] DATE             NULL,
    [SkillLevel] NVARCHAR(20)     NOT NULL DEFAULT 'Casual',
    [IsActive]   BIT              NOT NULL DEFAULT 1,
    CONSTRAINT [PK_BGN_Player] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [UQ_BGN_Player_Email] UNIQUE ([Email]),
    CONSTRAINT [CK_BGN_Player_SkillLevel] CHECK ([SkillLevel] IN
        ('Novice', 'Casual', 'Regular', 'Shark'))
);
PRINT '  Created [BoardGameNight].[Player]';
GO

-- ---------------------------------------------------------------------------
-- PlaySession: one game, played once, on one night.
--
-- Outcome distinguishes competitive from cooperative results, which is what makes
-- PlaySessionPlayer.Score legitimately nullable.
-- ---------------------------------------------------------------------------
CREATE TABLE [BoardGameNight].[PlaySession] (
    [ID]              UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [GameID]          UNIQUEIDENTIFIER NOT NULL,
    [PlayedAt]        DATETIME2        NOT NULL,
    [LocationName]    NVARCHAR(200)    NULL,
    [DurationMinutes] INT              NULL,
    [Outcome]         NVARCHAR(30)     NOT NULL DEFAULT 'Completed',
    [Notes]           NVARCHAR(MAX)    NULL,
    CONSTRAINT [PK_BGN_PlaySession] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_BGN_PlaySession_Game] FOREIGN KEY ([GameID])
        REFERENCES [BoardGameNight].[Game]([ID]),
    CONSTRAINT [CK_BGN_PlaySession_Outcome] CHECK ([Outcome] IN
        ('Completed', 'Co-op Win', 'Co-op Loss', 'Abandoned')),
    CONSTRAINT [CK_BGN_PlaySession_Duration] CHECK ([DurationMinutes] IS NULL OR [DurationMinutes] > 0)
);
PRINT '  Created [BoardGameNight].[PlaySession]';
GO

-- ---------------------------------------------------------------------------
-- PlaySessionPlayer: THE CENTERPIECE.
--
-- A junction table that carries its own data. After CodeGen you get a related-entity grid on the
-- PlaySession form AND on the Player form, both showing Score / Placement / IsWinner -- built
-- entirely from these two foreign keys plus the payload columns.
--
-- Score and Placement are nullable on purpose: cooperative sessions have neither.
-- ---------------------------------------------------------------------------
CREATE TABLE [BoardGameNight].[PlaySessionPlayer] (
    [ID]             UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [PlaySessionID]  UNIQUEIDENTIFIER NOT NULL,
    [PlayerID]       UNIQUEIDENTIFIER NOT NULL,
    [Score]          INT              NULL,
    [Placement]      INT              NULL,
    [IsWinner]       BIT              NOT NULL DEFAULT 0,
    [FactionOrColor] NVARCHAR(100)    NULL,
    [Notes]          NVARCHAR(MAX)    NULL,
    CONSTRAINT [PK_BGN_PlaySessionPlayer] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_BGN_PlaySessionPlayer_PlaySession] FOREIGN KEY ([PlaySessionID])
        REFERENCES [BoardGameNight].[PlaySession]([ID]),
    CONSTRAINT [FK_BGN_PlaySessionPlayer_Player] FOREIGN KEY ([PlayerID])
        REFERENCES [BoardGameNight].[Player]([ID]),
    CONSTRAINT [UQ_BGN_PlaySessionPlayer] UNIQUE ([PlaySessionID], [PlayerID]),
    CONSTRAINT [CK_BGN_PlaySessionPlayer_Placement] CHECK ([Placement] IS NULL OR [Placement] >= 1)
);
PRINT '  Created [BoardGameNight].[PlaySessionPlayer] (junction with payload)';
GO


-- =============================================================================================================
-- PHASE 3: EXTENDED PROPERTIES
--
-- CodeGen reads these to populate Entity and EntityField descriptions in MJ metadata. They surface
-- as tooltips and help text in the generated forms, and they are what an AI agent reads when it
-- needs to understand your schema. Documenting every column is worth the keystrokes.
-- =============================================================================================================
PRINT '=== Phase 3: Adding extended properties ===';
GO

-- ---- Publisher ----
EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'A company that publishes board games. Parent of Game in a one-to-many relationship.',
    @level0type=N'SCHEMA', @level0name=N'BoardGameNight', @level1type=N'TABLE', @level1name=N'Publisher';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Unique identifier for this publisher.',
    @level0type=N'SCHEMA', @level0name=N'BoardGameNight', @level1type=N'TABLE', @level1name=N'Publisher', @level2type=N'COLUMN', @level2name=N'ID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Company name as it appears on the box. Unique across all publishers.',
    @level0type=N'SCHEMA', @level0name=N'BoardGameNight', @level1type=N'TABLE', @level1name=N'Publisher', @level2type=N'COLUMN', @level2name=N'Name';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Year the company was founded.',
    @level0type=N'SCHEMA', @level0name=N'BoardGameNight', @level1type=N'TABLE', @level1name=N'Publisher', @level2type=N'COLUMN', @level2name=N'FoundedYear';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Country where the publisher is headquartered.',
    @level0type=N'SCHEMA', @level0name=N'BoardGameNight', @level1type=N'TABLE', @level1name=N'Publisher', @level2type=N'COLUMN', @level2name=N'Country';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Publisher website URL.',
    @level0type=N'SCHEMA', @level0name=N'BoardGameNight', @level1type=N'TABLE', @level1name=N'Publisher', @level2type=N'COLUMN', @level2name=N'Website';
GO

-- ---- Designer ----
EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'A person who designs board games. Linked to Game through the GameDesigner junction table in a many-to-many relationship.',
    @level0type=N'SCHEMA', @level0name=N'BoardGameNight', @level1type=N'TABLE', @level1name=N'Designer';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Unique identifier for this designer.',
    @level0type=N'SCHEMA', @level0name=N'BoardGameNight', @level1type=N'TABLE', @level1name=N'Designer', @level2type=N'COLUMN', @level2name=N'ID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Designer given name.',
    @level0type=N'SCHEMA', @level0name=N'BoardGameNight', @level1type=N'TABLE', @level1name=N'Designer', @level2type=N'COLUMN', @level2name=N'FirstName';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Designer family name.',
    @level0type=N'SCHEMA', @level0name=N'BoardGameNight', @level1type=N'TABLE', @level1name=N'Designer', @level2type=N'COLUMN', @level2name=N'LastName';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Short biography or notable design credits.',
    @level0type=N'SCHEMA', @level0name=N'BoardGameNight', @level1type=N'TABLE', @level1name=N'Designer', @level2type=N'COLUMN', @level2name=N'Bio';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Designer personal or studio website URL.',
    @level0type=N'SCHEMA', @level0name=N'BoardGameNight', @level1type=N'TABLE', @level1name=N'Designer', @level2type=N'COLUMN', @level2name=N'Website';
GO

-- ---- Game ----
EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'A board game in the collection, on the wishlist, or previously owned. Belongs to one Publisher, has many Designers through GameDesigner, and is played across many PlaySessions.',
    @level0type=N'SCHEMA', @level0name=N'BoardGameNight', @level1type=N'TABLE', @level1name=N'Game';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Unique identifier for this game.',
    @level0type=N'SCHEMA', @level0name=N'BoardGameNight', @level1type=N'TABLE', @level1name=N'Game', @level2type=N'COLUMN', @level2name=N'ID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Game title as printed on the box.',
    @level0type=N'SCHEMA', @level0name=N'BoardGameNight', @level1type=N'TABLE', @level1name=N'Game', @level2type=N'COLUMN', @level2name=N'Name';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Foreign key to the Publisher that released this edition.',
    @level0type=N'SCHEMA', @level0name=N'BoardGameNight', @level1type=N'TABLE', @level1name=N'Game', @level2type=N'COLUMN', @level2name=N'PublisherID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Year of first publication.',
    @level0type=N'SCHEMA', @level0name=N'BoardGameNight', @level1type=N'TABLE', @level1name=N'Game', @level2type=N'COLUMN', @level2name=N'YearPublished';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Minimum number of players supported by the rules.',
    @level0type=N'SCHEMA', @level0name=N'BoardGameNight', @level1type=N'TABLE', @level1name=N'Game', @level2type=N'COLUMN', @level2name=N'MinPlayers';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Maximum number of players supported by the rules.',
    @level0type=N'SCHEMA', @level0name=N'BoardGameNight', @level1type=N'TABLE', @level1name=N'Game', @level2type=N'COLUMN', @level2name=N'MaxPlayers';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Publisher-stated minimum play time in minutes.',
    @level0type=N'SCHEMA', @level0name=N'BoardGameNight', @level1type=N'TABLE', @level1name=N'Game', @level2type=N'COLUMN', @level2name=N'MinPlayTimeMinutes';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Publisher-stated maximum play time in minutes. Compare against PlaySession.DurationMinutes to see how badly the box lies.',
    @level0type=N'SCHEMA', @level0name=N'BoardGameNight', @level1type=N'TABLE', @level1name=N'Game', @level2type=N'COLUMN', @level2name=N'MaxPlayTimeMinutes';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Complexity rating from 1.00 (lightest) to 5.00 (heaviest), BoardGameGeek style. Enforced by a range CHECK, not a value list.',
    @level0type=N'SCHEMA', @level0name=N'BoardGameNight', @level1type=N'TABLE', @level1name=N'Game', @level2type=N'COLUMN', @level2name=N'Weight';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Primary game category. Constrained to a fixed list, which CodeGen turns into a dropdown.',
    @level0type=N'SCHEMA', @level0name=N'BoardGameNight', @level1type=N'TABLE', @level1name=N'Game', @level2type=N'COLUMN', @level2name=N'Category';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Current ownership state of this title. Constrained to a fixed list, which CodeGen turns into a dropdown.',
    @level0type=N'SCHEMA', @level0name=N'BoardGameNight', @level1type=N'TABLE', @level1name=N'Game', @level2type=N'COLUMN', @level2name=N'OwnershipStatus';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Date the copy was acquired. Null for wishlist titles.',
    @level0type=N'SCHEMA', @level0name=N'BoardGameNight', @level1type=N'TABLE', @level1name=N'Game', @level2type=N'COLUMN', @level2name=N'AcquiredDate';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Purchase price paid, in USD. Null for wishlist titles or gifts.',
    @level0type=N'SCHEMA', @level0name=N'BoardGameNight', @level1type=N'TABLE', @level1name=N'Game', @level2type=N'COLUMN', @level2name=N'PurchasePrice';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Free-form notes about this copy: expansions owned, house rules, condition.',
    @level0type=N'SCHEMA', @level0name=N'BoardGameNight', @level1type=N'TABLE', @level1name=N'Game', @level2type=N'COLUMN', @level2name=N'Notes';
GO

-- ---- GameDesigner ----
EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Pure junction table linking Games to Designers in a many-to-many relationship. Carries no data of its own -- contrast with PlaySessionPlayer, which does.',
    @level0type=N'SCHEMA', @level0name=N'BoardGameNight', @level1type=N'TABLE', @level1name=N'GameDesigner';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Unique identifier for this game-designer link.',
    @level0type=N'SCHEMA', @level0name=N'BoardGameNight', @level1type=N'TABLE', @level1name=N'GameDesigner', @level2type=N'COLUMN', @level2name=N'ID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Foreign key to the Game.',
    @level0type=N'SCHEMA', @level0name=N'BoardGameNight', @level1type=N'TABLE', @level1name=N'GameDesigner', @level2type=N'COLUMN', @level2name=N'GameID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Foreign key to the Designer.',
    @level0type=N'SCHEMA', @level0name=N'BoardGameNight', @level1type=N'TABLE', @level1name=N'GameDesigner', @level2type=N'COLUMN', @level2name=N'DesignerID';
GO

-- ---- Player ----
EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'A person who attends game night. Linked to PlaySession through PlaySessionPlayer, which also records how they did.',
    @level0type=N'SCHEMA', @level0name=N'BoardGameNight', @level1type=N'TABLE', @level1name=N'Player';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Unique identifier for this player.',
    @level0type=N'SCHEMA', @level0name=N'BoardGameNight', @level1type=N'TABLE', @level1name=N'Player', @level2type=N'COLUMN', @level2name=N'ID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Player given name.',
    @level0type=N'SCHEMA', @level0name=N'BoardGameNight', @level1type=N'TABLE', @level1name=N'Player', @level2type=N'COLUMN', @level2name=N'FirstName';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Player family name.',
    @level0type=N'SCHEMA', @level0name=N'BoardGameNight', @level1type=N'TABLE', @level1name=N'Player', @level2type=N'COLUMN', @level2name=N'LastName';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'What everyone actually calls them at the table.',
    @level0type=N'SCHEMA', @level0name=N'BoardGameNight', @level1type=N'TABLE', @level1name=N'Player', @level2type=N'COLUMN', @level2name=N'Nickname';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Contact email address. Unique across all players.',
    @level0type=N'SCHEMA', @level0name=N'BoardGameNight', @level1type=N'TABLE', @level1name=N'Player', @level2type=N'COLUMN', @level2name=N'Email';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Date this player first joined the group.',
    @level0type=N'SCHEMA', @level0name=N'BoardGameNight', @level1type=N'TABLE', @level1name=N'Player', @level2type=N'COLUMN', @level2name=N'JoinedDate';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Self-reported experience level. Constrained to a fixed list, which CodeGen turns into a dropdown.',
    @level0type=N'SCHEMA', @level0name=N'BoardGameNight', @level1type=N'TABLE', @level1name=N'Player', @level2type=N'COLUMN', @level2name=N'SkillLevel';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Whether this player still attends. Inactive players are retained so historical sessions stay intact.',
    @level0type=N'SCHEMA', @level0name=N'BoardGameNight', @level1type=N'TABLE', @level1name=N'Player', @level2type=N'COLUMN', @level2name=N'IsActive';
GO

-- ---- PlaySession ----
EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'One playthrough of one Game on one night. Has many participants through PlaySessionPlayer.',
    @level0type=N'SCHEMA', @level0name=N'BoardGameNight', @level1type=N'TABLE', @level1name=N'PlaySession';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Unique identifier for this play session.',
    @level0type=N'SCHEMA', @level0name=N'BoardGameNight', @level1type=N'TABLE', @level1name=N'PlaySession', @level2type=N'COLUMN', @level2name=N'ID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Foreign key to the Game that was played.',
    @level0type=N'SCHEMA', @level0name=N'BoardGameNight', @level1type=N'TABLE', @level1name=N'PlaySession', @level2type=N'COLUMN', @level2name=N'GameID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Date and time the session started.',
    @level0type=N'SCHEMA', @level0name=N'BoardGameNight', @level1type=N'TABLE', @level1name=N'PlaySession', @level2type=N'COLUMN', @level2name=N'PlayedAt';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Where the session took place.',
    @level0type=N'SCHEMA', @level0name=N'BoardGameNight', @level1type=N'TABLE', @level1name=N'PlaySession', @level2type=N'COLUMN', @level2name=N'LocationName';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Actual elapsed play time in minutes, including setup and teardown.',
    @level0type=N'SCHEMA', @level0name=N'BoardGameNight', @level1type=N'TABLE', @level1name=N'PlaySession', @level2type=N'COLUMN', @level2name=N'DurationMinutes';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'How the session ended. Competitive games use Completed; cooperative games use Co-op Win or Co-op Loss; Abandoned means nobody finished. Constrained to a fixed list, which CodeGen turns into a dropdown.',
    @level0type=N'SCHEMA', @level0name=N'BoardGameNight', @level1type=N'TABLE', @level1name=N'PlaySession', @level2type=N'COLUMN', @level2name=N'Outcome';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Free-form notes about the session: memorable plays, rules arguments, what went wrong.',
    @level0type=N'SCHEMA', @level0name=N'BoardGameNight', @level1type=N'TABLE', @level1name=N'PlaySession', @level2type=N'COLUMN', @level2name=N'Notes';
GO

-- ---- PlaySessionPlayer ----
EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Junction table linking a Player to a PlaySession, carrying that player''s result for that session. Unlike GameDesigner, this junction has a payload -- score, placement, and win flag -- which is why CodeGen generates a data-bearing grid on both parent forms.',
    @level0type=N'SCHEMA', @level0name=N'BoardGameNight', @level1type=N'TABLE', @level1name=N'PlaySessionPlayer';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Unique identifier for this participation record.',
    @level0type=N'SCHEMA', @level0name=N'BoardGameNight', @level1type=N'TABLE', @level1name=N'PlaySessionPlayer', @level2type=N'COLUMN', @level2name=N'ID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Foreign key to the PlaySession.',
    @level0type=N'SCHEMA', @level0name=N'BoardGameNight', @level1type=N'TABLE', @level1name=N'PlaySessionPlayer', @level2type=N'COLUMN', @level2name=N'PlaySessionID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Foreign key to the Player.',
    @level0type=N'SCHEMA', @level0name=N'BoardGameNight', @level1type=N'TABLE', @level1name=N'PlaySessionPlayer', @level2type=N'COLUMN', @level2name=N'PlayerID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Final score for this player. Null for cooperative and abandoned sessions, where individual scores do not exist.',
    @level0type=N'SCHEMA', @level0name=N'BoardGameNight', @level1type=N'TABLE', @level1name=N'PlaySessionPlayer', @level2type=N'COLUMN', @level2name=N'Score';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Finishing position, 1 being first. Null for cooperative and abandoned sessions.',
    @level0type=N'SCHEMA', @level0name=N'BoardGameNight', @level1type=N'TABLE', @level1name=N'PlaySessionPlayer', @level2type=N'COLUMN', @level2name=N'Placement';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Whether this player won. In a cooperative session every participant shares the same value.',
    @level0type=N'SCHEMA', @level0name=N'BoardGameNight', @level1type=N'TABLE', @level1name=N'PlaySessionPlayer', @level2type=N'COLUMN', @level2name=N'IsWinner';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Which faction, character, spirit, or player color this player used.',
    @level0type=N'SCHEMA', @level0name=N'BoardGameNight', @level1type=N'TABLE', @level1name=N'PlaySessionPlayer', @level2type=N'COLUMN', @level2name=N'FactionOrColor';
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Free-form notes about this player''s game.',
    @level0type=N'SCHEMA', @level0name=N'BoardGameNight', @level1type=N'TABLE', @level1name=N'PlaySessionPlayer', @level2type=N'COLUMN', @level2name=N'Notes';
GO


-- =============================================================================================================
-- PHASE 4: SEED DATA
--
-- Deterministic UUIDs are used for Publisher, Designer, Game, Player, and PlaySession so the rows can
-- reference each other without lookups and so re-running the script produces identical data. The two
-- junction tables use the NEWSEQUENTIALID() default, since nothing references them.
--
-- UUID prefixes:  ...0001 Publisher | ...0002 Designer | ...0003 Game | ...0004 Player | ...0005 PlaySession
-- =============================================================================================================
PRINT '=== Phase 4: Inserting seed data ===';
GO

-- ---- Publishers (18) ----
INSERT INTO [BoardGameNight].[Publisher] ([ID], [Name], [FoundedYear], [Country], [Website]) VALUES
    ('B6A00001-0000-4000-8000-000000000001', N'Days of Wonder',      1998, N'France',         N'https://www.daysofwonder.com'),
    ('B6A00001-0000-4000-8000-000000000002', N'Stonemaier Games',    2012, N'United States',  N'https://stonemaiergames.com'),
    ('B6A00001-0000-4000-8000-000000000003', N'Z-Man Games',         1999, N'United States',  N'https://www.zmangames.com'),
    ('B6A00001-0000-4000-8000-000000000004', N'Repos Production',    2007, N'Belgium',        N'https://www.rprod.com'),
    ('B6A00001-0000-4000-8000-000000000005', N'Leder Games',         2014, N'United States',  N'https://ledergames.com'),
    ('B6A00001-0000-4000-8000-000000000006', N'Cephalofair Games',   2015, N'United States',  N'https://cephalofair.com'),
    ('B6A00001-0000-4000-8000-000000000007', N'Czech Games Edition', 2007, N'Czech Republic', N'https://czechgames.com'),
    ('B6A00001-0000-4000-8000-000000000008', N'Plan B Games',        2017, N'Canada',         N'https://www.planbgames.com'),
    ('B6A00001-0000-4000-8000-000000000009', N'Roxley Games',        2015, N'Canada',         N'https://roxley.com'),
    ('B6A00001-0000-4000-8000-000000000010', N'Dire Wolf Digital',   2011, N'United States',  N'https://www.direwolfdigital.com'),
    ('B6A00001-0000-4000-8000-000000000011', N'Kosmos',              1822, N'Germany',        N'https://www.kosmos.de'),
    ('B6A00001-0000-4000-8000-000000000012', N'Lookout Games',       1999, N'Germany',        N'https://lookout-spiele.de'),
    ('B6A00001-0000-4000-8000-000000000013', N'Greater Than Games',  2011, N'United States',  N'https://greaterthangames.com'),
    ('B6A00001-0000-4000-8000-000000000014', N'Catan Studio',        2016, N'United States',  N'https://www.catan.com'),
    ('B6A00001-0000-4000-8000-000000000015', N'Flatout Games',       2018, N'United States',  N'https://flatoutgames.com'),
    ('B6A00001-0000-4000-8000-000000000016', N'FryxGames',           2010, N'Sweden',         N'https://www.fryxgames.se'),
    ('B6A00001-0000-4000-8000-000000000017', N'Starling Games',      2016, N'United States',  N'https://starling.games'),
    ('B6A00001-0000-4000-8000-000000000018', N'CMYK',                2019, N'United States',  N'https://cmyk.games');
PRINT '  Inserted 18 publishers';
GO

-- ---- Designers (20) ----
INSERT INTO [BoardGameNight].[Designer] ([ID], [FirstName], [LastName], [Bio], [Website]) VALUES
    ('B6A00002-0000-4000-8000-000000000001', N'Elizabeth', N'Hargrave', N'Designer known for nature-themed engine builders.', NULL),
    ('B6A00002-0000-4000-8000-000000000002', N'Alan',      N'Moon',     N'Designer of route-building and set-collection games.', NULL),
    ('B6A00002-0000-4000-8000-000000000003', N'Klaus',     N'Teuber',   N'Designer whose trading and settlement games defined modern hobby gaming.', NULL),
    ('B6A00002-0000-4000-8000-000000000004', N'Matt',      N'Leacock',  N'Designer specializing in cooperative games.', NULL),
    ('B6A00002-0000-4000-8000-000000000005', N'Antoine',   N'Bauza',    N'Designer of card drafting and cooperative titles.', NULL),
    ('B6A00002-0000-4000-8000-000000000006', N'Jamey',     N'Stegmaier', N'Designer and publisher; founder of Stonemaier Games.', NULL),
    ('B6A00002-0000-4000-8000-000000000007', N'Cole',      N'Wehrle',   N'Designer of asymmetric wargames with narrative depth.', NULL),
    ('B6A00002-0000-4000-8000-000000000008', N'Isaac',     N'Childres', N'Designer of large-scale cooperative campaign games.', NULL),
    ('B6A00002-0000-4000-8000-000000000009', N'Michael',   N'Kiesling', N'Designer of abstract and tile-laying games.', NULL),
    ('B6A00002-0000-4000-8000-000000000010', N'Vlaada',    N'Chvatil',  N'Designer with a wide range from party games to heavy strategy.', NULL),
    ('B6A00002-0000-4000-8000-000000000011', N'Jacob',     N'Fryxelius', N'Designer of engine-building games with a science theme.', NULL),
    ('B6A00002-0000-4000-8000-000000000012', N'Eric',      N'Reuss',    N'Designer of complex cooperative strategy games.', NULL),
    ('B6A00002-0000-4000-8000-000000000013', N'James',     N'Wilson',   N'Designer of worker placement games with tableau building.', NULL),
    ('B6A00002-0000-4000-8000-000000000014', N'Randy',     N'Flynn',    N'Designer of accessible tile-laying puzzle games.', NULL),
    ('B6A00002-0000-4000-8000-000000000015', N'Martin',    N'Wallace',  N'Designer of economic and network-building games.', NULL),
    ('B6A00002-0000-4000-8000-000000000016', N'Gavan',     N'Brown',    N'Co-designer and publisher of economic strategy games.', NULL),
    ('B6A00002-0000-4000-8000-000000000017', N'Paul',      N'Dennen',   N'Designer of deck building and worker placement hybrids.', NULL),
    ('B6A00002-0000-4000-8000-000000000018', N'Thomas',    N'Sing',     N'Designer of cooperative trick-taking games.', NULL),
    ('B6A00002-0000-4000-8000-000000000019', N'Uwe',       N'Rosenberg', N'Designer of farming, harvest, and polyomino games.', NULL),
    ('B6A00002-0000-4000-8000-000000000020', N'Wolfgang',  N'Warsch',   N'Designer of dice games and social deduction party games.', NULL);
PRINT '  Inserted 20 designers';
GO

-- ---- Games (20) ----
INSERT INTO [BoardGameNight].[Game]
    ([ID], [Name], [PublisherID], [YearPublished], [MinPlayers], [MaxPlayers],
     [MinPlayTimeMinutes], [MaxPlayTimeMinutes], [Weight], [Category], [OwnershipStatus],
     [AcquiredDate], [PurchasePrice], [Notes]) VALUES
    ('B6A00003-0000-4000-8000-000000000001', N'Wingspan',            'B6A00001-0000-4000-8000-000000000002', 2019, 1, 5,  40,  70, 2.44, N'Strategy',     N'Owned',      '2022-03-15', 59.99,  N'European Expansion sleeved and mixed in.'),
    ('B6A00003-0000-4000-8000-000000000002', N'Ticket to Ride',      'B6A00001-0000-4000-8000-000000000001', 2004, 2, 5,  30,  60, 1.84, N'Family',       N'Owned',      '2019-11-02', 44.99,  N'The gateway game. Never leaves the shelf for long.'),
    ('B6A00003-0000-4000-8000-000000000003', N'Catan',               'B6A00001-0000-4000-8000-000000000014', 1995, 3, 4,  60, 120, 2.30, N'Strategy',     N'Owned',      '2018-06-20', 39.99,  N'Original box, corners held together with tape.'),
    ('B6A00003-0000-4000-8000-000000000004', N'Pandemic',            'B6A00001-0000-4000-8000-000000000003', 2008, 2, 4,  45,  45, 2.40, N'Co-op',        N'Owned',      '2020-01-18', 34.99,  N'House rule: no takebacks on the Medic.'),
    ('B6A00003-0000-4000-8000-000000000005', N'7 Wonders',           'B6A00001-0000-4000-8000-000000000004', 2010, 3, 7,  30,  30, 2.32, N'Strategy',     N'Owned',      '2021-08-09', 49.99,  N'Best filler for a big table.'),
    ('B6A00003-0000-4000-8000-000000000006', N'Scythe',              'B6A00001-0000-4000-8000-000000000002', 2016, 1, 5,  90, 115, 3.44, N'Strategy',     N'Owned',      '2022-12-25', 89.99,  N'Holiday gift. Insert is worth the shelf space.'),
    ('B6A00003-0000-4000-8000-000000000007', N'Root',                'B6A00001-0000-4000-8000-000000000005', 2018, 2, 4,  60,  90, 3.79, N'Strategy',     N'Owned',      '2023-04-11', 69.99,  N'Asymmetry means the first game is always a teach.'),
    ('B6A00003-0000-4000-8000-000000000008', N'Gloomhaven',          'B6A00001-0000-4000-8000-000000000006', 2017, 1, 4,  60, 120, 3.90, N'Co-op',        N'Loaned Out', '2021-02-14', 139.99, N'Loaned to Marcus in June 2026. Campaign at scenario 14.'),
    ('B6A00003-0000-4000-8000-000000000009', N'Azul',                'B6A00001-0000-4000-8000-000000000008', 2017, 2, 4,  30,  45, 1.77, N'Abstract',     N'Owned',      '2022-05-30', 39.99,  N'The tiles feel incredible. That is most of the appeal.'),
    ('B6A00003-0000-4000-8000-000000000010', N'Codenames',           'B6A00001-0000-4000-8000-000000000007', 2015, 2, 8,  15,  15, 1.28, N'Party',        N'Owned',      '2019-09-14', 19.99,  N'Travels well. Lives in the car.'),
    ('B6A00003-0000-4000-8000-000000000011', N'Terraforming Mars',   'B6A00001-0000-4000-8000-000000000016', 2016, 1, 5, 120, 120, 3.27, N'Strategy',     N'Owned',      '2023-01-07', 69.99,  N'Box insert replaced. Original was unusable.'),
    ('B6A00003-0000-4000-8000-000000000012', N'Spirit Island',       'B6A00001-0000-4000-8000-000000000013', 2017, 1, 4,  90, 120, 4.07, N'Co-op',        N'Owned',      '2023-07-22', 79.99,  N'Heaviest co-op we own. Worth every minute.'),
    ('B6A00003-0000-4000-8000-000000000013', N'Everdell',            'B6A00001-0000-4000-8000-000000000017', 2018, 1, 4,  40,  80, 2.83, N'Strategy',     N'Owned',      '2024-02-03', 64.99,  N'The cardboard tree is pure theater and we love it.'),
    ('B6A00003-0000-4000-8000-000000000014', N'Cascadia',            'B6A00001-0000-4000-8000-000000000015', 2021, 1, 4,  30,  45, 1.84, N'Family',       N'Owned',      '2024-06-18', 39.99,  N'Best teaching game we have for new players.'),
    ('B6A00003-0000-4000-8000-000000000015', N'Brass: Birmingham',   'B6A00001-0000-4000-8000-000000000009', 2018, 2, 4,  60, 120, 3.91, N'Strategy',     N'Wishlist',   NULL,         NULL,   N'Waiting for a reprint at a sane price.'),
    ('B6A00003-0000-4000-8000-000000000016', N'Dune: Imperium',      'B6A00001-0000-4000-8000-000000000010', 2020, 1, 4,  60, 120, 3.03, N'Deck Builder', N'Owned',      '2024-10-05', 54.99,  N'Rise of Ix expansion not yet purchased.'),
    ('B6A00003-0000-4000-8000-000000000017', N'The Crew',            'B6A00001-0000-4000-8000-000000000011', 2019, 2, 5,  20,  20, 2.02, N'Co-op',        N'Owned',      '2023-11-11', 14.99,  N'Cheapest game on the shelf, highest plays per dollar.'),
    ('B6A00003-0000-4000-8000-000000000018', N'Patchwork',           'B6A00001-0000-4000-8000-000000000012', 2014, 2, 2,  15,  30, 1.61, N'Abstract',     N'Owned',      '2021-12-01', 24.99,  N'Strictly two players. Our default weeknight game.'),
    ('B6A00003-0000-4000-8000-000000000019', N'Just One',            'B6A00001-0000-4000-8000-000000000004', 2018, 3, 7,  20,  20, 1.06, N'Party',        N'Owned',      '2022-10-28', 24.99,  N'Cooperative despite being a party game. Great for mixed groups.'),
    ('B6A00003-0000-4000-8000-000000000020', N'Wavelength',          'B6A00001-0000-4000-8000-000000000018', 2019, 2, 12, 30,  45, 1.19, N'Party',        N'Sold',       '2022-07-04', 29.99,  N'Sold in 2026. Fun but rarely hit the table.');
PRINT '  Inserted 20 games';
GO

-- ---- GameDesigner links (pure junction -- IDs auto-generated) ----
INSERT INTO [BoardGameNight].[GameDesigner] ([GameID], [DesignerID]) VALUES
    ('B6A00003-0000-4000-8000-000000000001', 'B6A00002-0000-4000-8000-000000000001'),  -- Wingspan / Hargrave
    ('B6A00003-0000-4000-8000-000000000002', 'B6A00002-0000-4000-8000-000000000002'),  -- Ticket to Ride / Moon
    ('B6A00003-0000-4000-8000-000000000003', 'B6A00002-0000-4000-8000-000000000003'),  -- Catan / Teuber
    ('B6A00003-0000-4000-8000-000000000004', 'B6A00002-0000-4000-8000-000000000004'),  -- Pandemic / Leacock
    ('B6A00003-0000-4000-8000-000000000005', 'B6A00002-0000-4000-8000-000000000005'),  -- 7 Wonders / Bauza
    ('B6A00003-0000-4000-8000-000000000006', 'B6A00002-0000-4000-8000-000000000006'),  -- Scythe / Stegmaier
    ('B6A00003-0000-4000-8000-000000000007', 'B6A00002-0000-4000-8000-000000000007'),  -- Root / Wehrle
    ('B6A00003-0000-4000-8000-000000000008', 'B6A00002-0000-4000-8000-000000000008'),  -- Gloomhaven / Childres
    ('B6A00003-0000-4000-8000-000000000009', 'B6A00002-0000-4000-8000-000000000009'),  -- Azul / Kiesling
    ('B6A00003-0000-4000-8000-000000000010', 'B6A00002-0000-4000-8000-000000000010'),  -- Codenames / Chvatil
    ('B6A00003-0000-4000-8000-000000000011', 'B6A00002-0000-4000-8000-000000000011'),  -- Terraforming Mars / Fryxelius
    ('B6A00003-0000-4000-8000-000000000012', 'B6A00002-0000-4000-8000-000000000012'),  -- Spirit Island / Reuss
    ('B6A00003-0000-4000-8000-000000000013', 'B6A00002-0000-4000-8000-000000000013'),  -- Everdell / Wilson
    ('B6A00003-0000-4000-8000-000000000014', 'B6A00002-0000-4000-8000-000000000014'),  -- Cascadia / Flynn
    -- Brass: Birmingham has TWO designers -- the M:N case the junction exists for
    ('B6A00003-0000-4000-8000-000000000015', 'B6A00002-0000-4000-8000-000000000015'),  -- Brass / Wallace
    ('B6A00003-0000-4000-8000-000000000015', 'B6A00002-0000-4000-8000-000000000016'),  -- Brass / Brown
    ('B6A00003-0000-4000-8000-000000000016', 'B6A00002-0000-4000-8000-000000000017'),  -- Dune: Imperium / Dennen
    ('B6A00003-0000-4000-8000-000000000017', 'B6A00002-0000-4000-8000-000000000018'),  -- The Crew / Sing
    ('B6A00003-0000-4000-8000-000000000018', 'B6A00002-0000-4000-8000-000000000019'),  -- Patchwork / Rosenberg
    ('B6A00003-0000-4000-8000-000000000019', 'B6A00002-0000-4000-8000-000000000005'),  -- Just One / Bauza (reused designer)
    ('B6A00003-0000-4000-8000-000000000020', 'B6A00002-0000-4000-8000-000000000020');  -- Wavelength / Warsch
PRINT '  Inserted 21 game-designer links';
GO

-- ---- Players (8) ----
INSERT INTO [BoardGameNight].[Player]
    ([ID], [FirstName], [LastName], [Nickname], [Email], [JoinedDate], [SkillLevel], [IsActive]) VALUES
    ('B6A00004-0000-4000-8000-000000000001', N'Caitlin', N'Tuttle',    N'Cait',  N'caitlin@example.com', '2018-06-01', N'Regular', 1),
    ('B6A00004-0000-4000-8000-000000000002', N'Marcus',  N'Webb',      N'Mars',  N'marcus@example.com',  '2018-06-01', N'Shark',   1),
    ('B6A00004-0000-4000-8000-000000000003', N'Priya',   N'Raghavan',  N'Pree',  N'priya@example.com',   '2019-03-14', N'Regular', 1),
    ('B6A00004-0000-4000-8000-000000000004', N'Diego',   N'Salazar',   N'Dee',   N'diego@example.com',   '2020-09-22', N'Casual',  1),
    ('B6A00004-0000-4000-8000-000000000005', N'Hannah',  N'Kowalski',  N'Han',   N'hannah@example.com',  '2019-01-08', N'Shark',   1),
    ('B6A00004-0000-4000-8000-000000000006', N'Tomas',   N'Lindqvist', N'Tommy', N'tomas@example.com',   '2021-05-30', N'Casual',  1),
    ('B6A00004-0000-4000-8000-000000000007', N'Ada',     N'Nwosu',     N'Ada',   N'ada@example.com',     '2025-08-19', N'Novice',  1),
    ('B6A00004-0000-4000-8000-000000000008', N'Jonah',   N'Feldman',   N'Jo',    N'jonah@example.com',   '2020-02-11', N'Regular', 0);
PRINT '  Inserted 8 players';
GO

-- ---- Play sessions (24, spanning Sep 2025 - Aug 2026) ----
INSERT INTO [BoardGameNight].[PlaySession]
    ([ID], [GameID], [PlayedAt], [LocationName], [DurationMinutes], [Outcome], [Notes]) VALUES
    ('B6A00005-0000-4000-8000-000000000001', 'B6A00003-0000-4000-8000-000000000001', '2025-09-12T19:30:00', N'Caitlin''s Place',          75,  N'Completed',  N'First play with the European expansion cards mixed in.'),
    ('B6A00005-0000-4000-8000-000000000002', 'B6A00003-0000-4000-8000-000000000010', '2025-09-26T20:00:00', N'Marcus & Hannah''s Loft',   20,  N'Completed',  N'Two rounds. Red team took both.'),
    ('B6A00005-0000-4000-8000-000000000003', 'B6A00003-0000-4000-8000-000000000004', '2025-10-04T18:00:00', N'The Rolling Die Cafe',      55,  N'Co-op Loss', N'Four outbreaks in South America. Never recovered.'),
    ('B6A00005-0000-4000-8000-000000000004', 'B6A00003-0000-4000-8000-000000000002', '2025-10-18T19:00:00', N'Priya''s Apartment',        65,  N'Completed',  N'Marcus blocked the northern route on turn three and cruised.'),
    ('B6A00005-0000-4000-8000-000000000005', 'B6A00003-0000-4000-8000-000000000006', '2025-11-01T19:30:00', N'Caitlin''s Place',          130, N'Completed',  N'Ran forty minutes over the box estimate, as always.'),
    ('B6A00005-0000-4000-8000-000000000006', 'B6A00003-0000-4000-8000-000000000019', '2025-11-15T20:00:00', N'Community Center Room B',   25,  N'Co-op Win',  N'Eleven of thirteen. Best result yet.'),
    ('B6A00005-0000-4000-8000-000000000007', 'B6A00003-0000-4000-8000-000000000012', '2025-11-29T18:30:00', N'Marcus & Hannah''s Loft',   110, N'Co-op Win',  N'Won on the second-to-last invader card. Genuinely tense.'),
    ('B6A00005-0000-4000-8000-000000000008', 'B6A00003-0000-4000-8000-000000000009', '2025-12-13T19:00:00', N'The Rolling Die Cafe',      40,  N'Completed',  N'Tomas went all in on the blue column and it paid off.'),
    ('B6A00005-0000-4000-8000-000000000009', 'B6A00003-0000-4000-8000-000000000001', '2025-12-20T19:30:00', N'Caitlin''s Place',          85,  N'Completed',  N'Holiday session. Five players is a stretch for this one.'),
    ('B6A00005-0000-4000-8000-000000000010', 'B6A00003-0000-4000-8000-000000000007', '2026-01-10T19:00:00', N'Priya''s Apartment',        95,  N'Completed',  N'Vagabond nearly stole it at the end.'),
    ('B6A00005-0000-4000-8000-000000000011', 'B6A00003-0000-4000-8000-000000000017', '2026-01-24T20:00:00', N'Community Center Room B',   30,  N'Co-op Win',  N'Cleared through mission twelve in one sitting.'),
    ('B6A00005-0000-4000-8000-000000000012', 'B6A00003-0000-4000-8000-000000000011', '2026-02-07T18:30:00', N'Marcus & Hannah''s Loft',   165, N'Completed',  N'Nobody is allowed to suggest this on a weeknight again.'),
    ('B6A00005-0000-4000-8000-000000000013', 'B6A00003-0000-4000-8000-000000000014', '2026-02-21T19:00:00', N'The Rolling Die Cafe',      45,  N'Completed',  N'Ada''s first win. The table did not see it coming.'),
    ('B6A00005-0000-4000-8000-000000000014', 'B6A00003-0000-4000-8000-000000000013', '2026-03-07T19:30:00', N'Caitlin''s Place',          80,  N'Completed',  N'Jonah''s last session before moving away.'),
    ('B6A00005-0000-4000-8000-000000000015', 'B6A00003-0000-4000-8000-000000000020', '2026-03-21T20:00:00', N'Community Center Room B',   40,  N'Completed',  N'Final play before we sold it.'),
    ('B6A00005-0000-4000-8000-000000000016', 'B6A00003-0000-4000-8000-000000000004', '2026-04-04T19:00:00', N'Priya''s Apartment',        50,  N'Co-op Win',  N'Cured all four with two cards left in the deck.'),
    ('B6A00005-0000-4000-8000-000000000017', 'B6A00003-0000-4000-8000-000000000016', '2026-04-18T18:00:00', N'Marcus & Hannah''s Loft',   110, N'Completed',  N'Hannah went full combat and it worked.'),
    ('B6A00005-0000-4000-8000-000000000018', 'B6A00003-0000-4000-8000-000000000003', '2026-05-02T19:30:00', N'Caitlin''s Place',          95,  N'Completed',  N'Nostalgia night. Still holds up.'),
    ('B6A00005-0000-4000-8000-000000000019', 'B6A00003-0000-4000-8000-000000000018', '2026-05-16T20:00:00', N'Caitlin''s Place',          25,  N'Completed',  N'Quiet two-player evening.'),
    ('B6A00005-0000-4000-8000-000000000020', 'B6A00003-0000-4000-8000-000000000005', '2026-06-06T19:00:00', N'The Rolling Die Cafe',      45,  N'Completed',  N'Five players, three ages, forty-five minutes. Perfect.'),
    ('B6A00005-0000-4000-8000-000000000021', 'B6A00003-0000-4000-8000-000000000008', '2026-06-20T18:30:00', N'Marcus & Hannah''s Loft',   140, N'Co-op Loss', N'Scenario 14. Exhausted two characters before the boss.'),
    ('B6A00005-0000-4000-8000-000000000022', 'B6A00003-0000-4000-8000-000000000001', '2026-07-11T19:00:00', N'Caitlin''s Place',          60,  N'Completed',  N'Three players is the sweet spot.'),
    ('B6A00005-0000-4000-8000-000000000023', 'B6A00003-0000-4000-8000-000000000010', '2026-07-25T20:00:00', N'Community Center Room B',   30,  N'Completed',  N'Full table of eight. Chaos, in a good way.'),
    ('B6A00005-0000-4000-8000-000000000024', 'B6A00003-0000-4000-8000-000000000007', '2026-08-08T19:30:00', N'Priya''s Apartment',        100, N'Abandoned',  N'Called it at midnight with no clear leader. Scores not recorded.');
PRINT '  Inserted 24 play sessions';
GO

-- ---- PlaySessionPlayer: the payload rows (IDs auto-generated) ----
--
-- Data shape worth noticing:
--   - Competitive sessions have Score + Placement, exactly one IsWinner = 1
--   - Cooperative sessions have Score = NULL, Placement = NULL, all players share IsWinner
--   - The abandoned session has all three NULL/0
--   - Team party games split the table into two "placements"
INSERT INTO [BoardGameNight].[PlaySessionPlayer]
    ([PlaySessionID], [PlayerID], [Score], [Placement], [IsWinner], [FactionOrColor], [Notes]) VALUES

    -- S01 Wingspan (competitive, 4p)
    ('B6A00005-0000-4000-8000-000000000001', 'B6A00004-0000-4000-8000-000000000001',  78, 4, 0, N'Blue',   NULL),
    ('B6A00005-0000-4000-8000-000000000001', 'B6A00004-0000-4000-8000-000000000002',  91, 2, 0, N'Red',    NULL),
    ('B6A00005-0000-4000-8000-000000000001', 'B6A00004-0000-4000-8000-000000000003',  84, 3, 0, N'Green',  NULL),
    ('B6A00005-0000-4000-8000-000000000001', 'B6A00004-0000-4000-8000-000000000005',  95, 1, 1, N'Purple', N'Nectar engine in the forest row.'),

    -- S02 Codenames (team party game, 6p)
    ('B6A00005-0000-4000-8000-000000000002', 'B6A00004-0000-4000-8000-000000000001',   1, 1, 1, N'Red Team',  N'Spymaster.'),
    ('B6A00005-0000-4000-8000-000000000002', 'B6A00004-0000-4000-8000-000000000003',   1, 1, 1, N'Red Team',  NULL),
    ('B6A00005-0000-4000-8000-000000000002', 'B6A00004-0000-4000-8000-000000000005',   1, 1, 1, N'Red Team',  NULL),
    ('B6A00005-0000-4000-8000-000000000002', 'B6A00004-0000-4000-8000-000000000002',   0, 2, 0, N'Blue Team', N'Spymaster.'),
    ('B6A00005-0000-4000-8000-000000000002', 'B6A00004-0000-4000-8000-000000000004',   0, 2, 0, N'Blue Team', NULL),
    ('B6A00005-0000-4000-8000-000000000002', 'B6A00004-0000-4000-8000-000000000006',   0, 2, 0, N'Blue Team', N'Guessed the assassin.'),

    -- S03 Pandemic (co-op loss, 4p)
    ('B6A00005-0000-4000-8000-000000000003', 'B6A00004-0000-4000-8000-000000000001', NULL, NULL, 0, N'Medic',      NULL),
    ('B6A00005-0000-4000-8000-000000000003', 'B6A00004-0000-4000-8000-000000000002', NULL, NULL, 0, N'Scientist',  NULL),
    ('B6A00005-0000-4000-8000-000000000003', 'B6A00004-0000-4000-8000-000000000004', NULL, NULL, 0, N'Dispatcher', NULL),
    ('B6A00005-0000-4000-8000-000000000003', 'B6A00004-0000-4000-8000-000000000007', NULL, NULL, 0, N'Researcher', N'First game. Took the blame graciously.'),

    -- S04 Ticket to Ride (competitive, 5p)
    ('B6A00005-0000-4000-8000-000000000004', 'B6A00004-0000-4000-8000-000000000001', 112, 3, 0, N'Blue',   NULL),
    ('B6A00005-0000-4000-8000-000000000004', 'B6A00004-0000-4000-8000-000000000002', 134, 1, 1, N'Red',    N'Longest route bonus sealed it.'),
    ('B6A00005-0000-4000-8000-000000000004', 'B6A00004-0000-4000-8000-000000000003',  98, 5, 0, N'Green',  NULL),
    ('B6A00005-0000-4000-8000-000000000004', 'B6A00004-0000-4000-8000-000000000005', 121, 2, 0, N'Yellow', NULL),
    ('B6A00005-0000-4000-8000-000000000004', 'B6A00004-0000-4000-8000-000000000008', 107, 4, 0, N'Black',  NULL),

    -- S05 Scythe (competitive, 4p)
    ('B6A00005-0000-4000-8000-000000000005', 'B6A00004-0000-4000-8000-000000000002',  71, 1, 1, N'Nordic',  N'Never fought once. Just built.'),
    ('B6A00005-0000-4000-8000-000000000005', 'B6A00004-0000-4000-8000-000000000003',  54, 3, 0, N'Rusviet', NULL),
    ('B6A00005-0000-4000-8000-000000000005', 'B6A00004-0000-4000-8000-000000000005',  68, 2, 0, N'Crimea',  NULL),
    ('B6A00005-0000-4000-8000-000000000005', 'B6A00004-0000-4000-8000-000000000008',  49, 4, 0, N'Saxony',  N'All aggression, no economy.'),

    -- S06 Just One (cooperative party game, 6p)
    ('B6A00005-0000-4000-8000-000000000006', 'B6A00004-0000-4000-8000-000000000001', NULL, NULL, 1, NULL, NULL),
    ('B6A00005-0000-4000-8000-000000000006', 'B6A00004-0000-4000-8000-000000000003', NULL, NULL, 1, NULL, NULL),
    ('B6A00005-0000-4000-8000-000000000006', 'B6A00004-0000-4000-8000-000000000004', NULL, NULL, 1, NULL, NULL),
    ('B6A00005-0000-4000-8000-000000000006', 'B6A00004-0000-4000-8000-000000000005', NULL, NULL, 1, NULL, NULL),
    ('B6A00005-0000-4000-8000-000000000006', 'B6A00004-0000-4000-8000-000000000006', NULL, NULL, 1, NULL, NULL),
    ('B6A00005-0000-4000-8000-000000000006', 'B6A00004-0000-4000-8000-000000000007', NULL, NULL, 1, NULL, N'Wrote the same clue as Tomas three times.'),

    -- S07 Spirit Island (co-op win, 3p)
    ('B6A00005-0000-4000-8000-000000000007', 'B6A00004-0000-4000-8000-000000000001', NULL, NULL, 1, N'Lightning''s Swift Strike', NULL),
    ('B6A00005-0000-4000-8000-000000000007', 'B6A00004-0000-4000-8000-000000000002', NULL, NULL, 1, N'River Surges in Sunlight',  NULL),
    ('B6A00005-0000-4000-8000-000000000007', 'B6A00004-0000-4000-8000-000000000005', NULL, NULL, 1, N'Vital Strength of the Earth', NULL),

    -- S08 Azul (competitive, 4p)
    ('B6A00005-0000-4000-8000-000000000008', 'B6A00004-0000-4000-8000-000000000001',  62, 2, 0, N'Blue',   NULL),
    ('B6A00005-0000-4000-8000-000000000008', 'B6A00004-0000-4000-8000-000000000004',  48, 3, 0, N'Red',    NULL),
    ('B6A00005-0000-4000-8000-000000000008', 'B6A00004-0000-4000-8000-000000000006',  71, 1, 1, N'Yellow', N'Completed three full columns.'),
    ('B6A00005-0000-4000-8000-000000000008', 'B6A00004-0000-4000-8000-000000000007',  39, 4, 0, N'Black',  NULL),

    -- S09 Wingspan (competitive, 5p)
    ('B6A00005-0000-4000-8000-000000000009', 'B6A00004-0000-4000-8000-000000000001',  88, 4, 0, N'Blue',   NULL),
    ('B6A00005-0000-4000-8000-000000000009', 'B6A00004-0000-4000-8000-000000000002',  95, 2, 0, N'Red',    NULL),
    ('B6A00005-0000-4000-8000-000000000009', 'B6A00004-0000-4000-8000-000000000003', 102, 1, 1, N'Green',  N'Egg-laying engine, textbook.'),
    ('B6A00005-0000-4000-8000-000000000009', 'B6A00004-0000-4000-8000-000000000005',  91, 3, 0, N'Purple', NULL),
    ('B6A00005-0000-4000-8000-000000000009', 'B6A00004-0000-4000-8000-000000000008',  79, 5, 0, N'Teal',   NULL),

    -- S10 Root (competitive, 4p)
    ('B6A00005-0000-4000-8000-000000000010', 'B6A00004-0000-4000-8000-000000000002',  30, 2, 0, N'Marquise de Cat',   NULL),
    ('B6A00005-0000-4000-8000-000000000010', 'B6A00004-0000-4000-8000-000000000003',  24, 3, 0, N'Eyrie Dynasties',   N'Turmoil twice in a row.'),
    ('B6A00005-0000-4000-8000-000000000010', 'B6A00004-0000-4000-8000-000000000005',  31, 1, 1, N'Woodland Alliance', N'Won on the final turn.'),
    ('B6A00005-0000-4000-8000-000000000010', 'B6A00004-0000-4000-8000-000000000008',  22, 4, 0, N'Vagabond',          NULL),

    -- S11 The Crew (co-op win, 4p)
    ('B6A00005-0000-4000-8000-000000000011', 'B6A00004-0000-4000-8000-000000000001', NULL, NULL, 1, NULL, NULL),
    ('B6A00005-0000-4000-8000-000000000011', 'B6A00004-0000-4000-8000-000000000003', NULL, NULL, 1, NULL, N'Commander for most missions.'),
    ('B6A00005-0000-4000-8000-000000000011', 'B6A00004-0000-4000-8000-000000000004', NULL, NULL, 1, NULL, NULL),
    ('B6A00005-0000-4000-8000-000000000011', 'B6A00004-0000-4000-8000-000000000006', NULL, NULL, 1, NULL, NULL),

    -- S12 Terraforming Mars (competitive, 4p)
    ('B6A00005-0000-4000-8000-000000000012', 'B6A00004-0000-4000-8000-000000000002',  92, 1, 1, N'Helion',           N'Heat as currency, all game.'),
    ('B6A00005-0000-4000-8000-000000000012', 'B6A00004-0000-4000-8000-000000000003',  74, 3, 0, N'Ecoline',          NULL),
    ('B6A00005-0000-4000-8000-000000000012', 'B6A00004-0000-4000-8000-000000000005',  87, 2, 0, N'Tharsis Republic', NULL),
    ('B6A00005-0000-4000-8000-000000000012', 'B6A00004-0000-4000-8000-000000000008',  68, 4, 0, N'Mining Guild',     NULL),

    -- S13 Cascadia (competitive, 4p)
    ('B6A00005-0000-4000-8000-000000000013', 'B6A00004-0000-4000-8000-000000000001',  95, 2, 0, NULL, NULL),
    ('B6A00005-0000-4000-8000-000000000013', 'B6A00004-0000-4000-8000-000000000004',  88, 3, 0, NULL, NULL),
    ('B6A00005-0000-4000-8000-000000000013', 'B6A00004-0000-4000-8000-000000000006',  79, 4, 0, NULL, NULL),
    ('B6A00005-0000-4000-8000-000000000013', 'B6A00004-0000-4000-8000-000000000007', 101, 1, 1, NULL, N'First win. Nailed the hawk scoring card.'),

    -- S14 Everdell (competitive, 4p)
    ('B6A00005-0000-4000-8000-000000000014', 'B6A00004-0000-4000-8000-000000000001',  56, 4, 0, N'Tan',   NULL),
    ('B6A00005-0000-4000-8000-000000000014', 'B6A00004-0000-4000-8000-000000000002',  63, 2, 0, N'Green', NULL),
    ('B6A00005-0000-4000-8000-000000000014', 'B6A00004-0000-4000-8000-000000000005',  58, 3, 0, N'Blue',  NULL),
    ('B6A00005-0000-4000-8000-000000000014', 'B6A00004-0000-4000-8000-000000000008',  71, 1, 1, N'Red',   N'Went out on a high note.'),

    -- S15 Wavelength (team party game, 6p)
    ('B6A00005-0000-4000-8000-000000000015', 'B6A00004-0000-4000-8000-000000000001',  10, 1, 1, N'Left Brain',  NULL),
    ('B6A00005-0000-4000-8000-000000000015', 'B6A00004-0000-4000-8000-000000000004',  10, 1, 1, N'Left Brain',  NULL),
    ('B6A00005-0000-4000-8000-000000000015', 'B6A00004-0000-4000-8000-000000000007',  10, 1, 1, N'Left Brain',  NULL),
    ('B6A00005-0000-4000-8000-000000000015', 'B6A00004-0000-4000-8000-000000000002',   7, 2, 0, N'Right Brain', NULL),
    ('B6A00005-0000-4000-8000-000000000015', 'B6A00004-0000-4000-8000-000000000005',   7, 2, 0, N'Right Brain', NULL),
    ('B6A00005-0000-4000-8000-000000000015', 'B6A00004-0000-4000-8000-000000000008',   7, 2, 0, N'Right Brain', NULL),

    -- S16 Pandemic (co-op win, 4p)
    ('B6A00005-0000-4000-8000-000000000016', 'B6A00004-0000-4000-8000-000000000001', NULL, NULL, 1, N'Dispatcher',        NULL),
    ('B6A00005-0000-4000-8000-000000000016', 'B6A00004-0000-4000-8000-000000000003', NULL, NULL, 1, N'Medic',             NULL),
    ('B6A00005-0000-4000-8000-000000000016', 'B6A00004-0000-4000-8000-000000000006', NULL, NULL, 1, N'Scientist',         NULL),
    ('B6A00005-0000-4000-8000-000000000016', 'B6A00004-0000-4000-8000-000000000007', NULL, NULL, 1, N'Operations Expert', N'Redemption for October.'),

    -- S17 Dune: Imperium (competitive, 4p)
    ('B6A00005-0000-4000-8000-000000000017', 'B6A00004-0000-4000-8000-000000000002',  10, 2, 0, N'Paul Atreides',      NULL),
    ('B6A00005-0000-4000-8000-000000000017', 'B6A00004-0000-4000-8000-000000000003',   9, 3, 0, N'Ilesa Ecaz',         NULL),
    ('B6A00005-0000-4000-8000-000000000017', 'B6A00004-0000-4000-8000-000000000005',  12, 1, 1, N'Baron Harkonnen',    N'Won both final conflicts.'),
    ('B6A00005-0000-4000-8000-000000000017', 'B6A00004-0000-4000-8000-000000000008',   8, 4, 0, N'Amber Metulli',      NULL),

    -- S18 Catan (competitive, 4p)
    ('B6A00005-0000-4000-8000-000000000018', 'B6A00004-0000-4000-8000-000000000001',  10, 1, 1, N'Orange', N'Longest road plus two dev card points.'),
    ('B6A00005-0000-4000-8000-000000000018', 'B6A00004-0000-4000-8000-000000000004',   8, 3, 0, N'Blue',   NULL),
    ('B6A00005-0000-4000-8000-000000000018', 'B6A00004-0000-4000-8000-000000000006',   7, 4, 0, N'White',  NULL),
    ('B6A00005-0000-4000-8000-000000000018', 'B6A00004-0000-4000-8000-000000000008',   9, 2, 0, N'Red',    NULL),

    -- S19 Patchwork (competitive, 2p)
    ('B6A00005-0000-4000-8000-000000000019', 'B6A00004-0000-4000-8000-000000000001',  18, 2, 0, NULL, NULL),
    ('B6A00005-0000-4000-8000-000000000019', 'B6A00004-0000-4000-8000-000000000005',  24, 1, 1, NULL, N'Got the seven-by-seven bonus.'),

    -- S20 7 Wonders (competitive, 5p)
    ('B6A00005-0000-4000-8000-000000000020', 'B6A00004-0000-4000-8000-000000000001',  58, 3, 0, N'Giza',           NULL),
    ('B6A00005-0000-4000-8000-000000000020', 'B6A00004-0000-4000-8000-000000000002',  64, 1, 1, N'Rhodos',         N'Military plus science split.'),
    ('B6A00005-0000-4000-8000-000000000020', 'B6A00004-0000-4000-8000-000000000003',  52, 4, 0, N'Ephesos',        NULL),
    ('B6A00005-0000-4000-8000-000000000020', 'B6A00004-0000-4000-8000-000000000005',  61, 2, 0, N'Halikarnassos',  NULL),
    ('B6A00005-0000-4000-8000-000000000020', 'B6A00004-0000-4000-8000-000000000008',  49, 5, 0, N'Olympia',        NULL),

    -- S21 Gloomhaven (co-op loss, 4p)
    ('B6A00005-0000-4000-8000-000000000021', 'B6A00004-0000-4000-8000-000000000002', NULL, NULL, 0, N'Brute',       NULL),
    ('B6A00005-0000-4000-8000-000000000021', 'B6A00004-0000-4000-8000-000000000003', NULL, NULL, 0, N'Tinkerer',    N'Exhausted on round eight.'),
    ('B6A00005-0000-4000-8000-000000000021', 'B6A00004-0000-4000-8000-000000000005', NULL, NULL, 0, N'Spellweaver', NULL),
    ('B6A00005-0000-4000-8000-000000000021', 'B6A00004-0000-4000-8000-000000000008', NULL, NULL, 0, N'Scoundrel',   N'Exhausted on round six.'),

    -- S22 Wingspan (competitive, 3p)
    ('B6A00005-0000-4000-8000-000000000022', 'B6A00004-0000-4000-8000-000000000001',  84, 1, 1, N'Blue',   N'Finally.'),
    ('B6A00005-0000-4000-8000-000000000022', 'B6A00004-0000-4000-8000-000000000006',  72, 2, 0, N'Red',    NULL),
    ('B6A00005-0000-4000-8000-000000000022', 'B6A00004-0000-4000-8000-000000000007',  68, 3, 0, N'Green',  NULL),

    -- S23 Codenames (team party game, 8p)
    ('B6A00005-0000-4000-8000-000000000023', 'B6A00004-0000-4000-8000-000000000001',   1, 1, 1, N'Red Team',  NULL),
    ('B6A00005-0000-4000-8000-000000000023', 'B6A00004-0000-4000-8000-000000000003',   1, 1, 1, N'Red Team',  N'Spymaster.'),
    ('B6A00005-0000-4000-8000-000000000023', 'B6A00004-0000-4000-8000-000000000005',   1, 1, 1, N'Red Team',  NULL),
    ('B6A00005-0000-4000-8000-000000000023', 'B6A00004-0000-4000-8000-000000000007',   1, 1, 1, N'Red Team',  NULL),
    ('B6A00005-0000-4000-8000-000000000023', 'B6A00004-0000-4000-8000-000000000002',   0, 2, 0, N'Blue Team', N'Spymaster.'),
    ('B6A00005-0000-4000-8000-000000000023', 'B6A00004-0000-4000-8000-000000000004',   0, 2, 0, N'Blue Team', NULL),
    ('B6A00005-0000-4000-8000-000000000023', 'B6A00004-0000-4000-8000-000000000006',   0, 2, 0, N'Blue Team', NULL),
    ('B6A00005-0000-4000-8000-000000000023', 'B6A00004-0000-4000-8000-000000000008',   0, 2, 0, N'Blue Team', N'Visiting for the weekend.'),

    -- S24 Root (abandoned, 4p -- no scores recorded)
    ('B6A00005-0000-4000-8000-000000000024', 'B6A00004-0000-4000-8000-000000000001', NULL, NULL, 0, N'Marquise de Cat',   NULL),
    ('B6A00005-0000-4000-8000-000000000024', 'B6A00004-0000-4000-8000-000000000002', NULL, NULL, 0, N'Eyrie Dynasties',   NULL),
    ('B6A00005-0000-4000-8000-000000000024', 'B6A00004-0000-4000-8000-000000000005', NULL, NULL, 0, N'Woodland Alliance', NULL),
    ('B6A00005-0000-4000-8000-000000000024', 'B6A00004-0000-4000-8000-000000000008', NULL, NULL, 0, N'Vagabond',          NULL);
PRINT '  Inserted play session participation records';
GO


-- =============================================================================================================
-- PHASE 5: VERIFICATION
--
-- These are ad-hoc SELECTs for confirming the load, NOT persisted views. Creating views here would
-- step on CodeGen's territory -- the leaderboard and game-stats views come later, as a separate
-- virtual-entity exercise.
-- =============================================================================================================
PRINT '=== Phase 5: Verification ===';
GO

PRINT '';
PRINT '--- Row counts ---';
SELECT 'Publisher'         AS [Table], COUNT(*) AS [Rows] FROM [BoardGameNight].[Publisher]
UNION ALL SELECT 'Designer',          COUNT(*) FROM [BoardGameNight].[Designer]
UNION ALL SELECT 'Game',              COUNT(*) FROM [BoardGameNight].[Game]
UNION ALL SELECT 'GameDesigner',      COUNT(*) FROM [BoardGameNight].[GameDesigner]
UNION ALL SELECT 'Player',            COUNT(*) FROM [BoardGameNight].[Player]
UNION ALL SELECT 'PlaySession',       COUNT(*) FROM [BoardGameNight].[PlaySession]
UNION ALL SELECT 'PlaySessionPlayer', COUNT(*) FROM [BoardGameNight].[PlaySessionPlayer];
GO


-- -------------------------------------------------------------------------------------------------
-- Full contents of all seven tables, in dependency order -- one result grid per table.
--
-- Columns are listed explicitly rather than with SELECT *, on purpose: once CodeGen has run against
-- this schema the tables also carry __mj_CreatedAt / __mj_UpdatedAt, and SELECT * would make this
-- output change shape depending on whether CodeGen had run yet. Naming the columns keeps every run
-- comparable, and keeps this block showing only what THIS script creates.
--
-- The two junction tables additionally resolve their foreign keys to names. A grid of GUID pairs is
-- technically the table's contents and communicates nothing; the raw keys are kept alongside.
-- -------------------------------------------------------------------------------------------------
PRINT '';
PRINT '--- [1/7] Publisher ---';
SELECT [ID], [Name], [FoundedYear], [Country], [Website]
FROM [BoardGameNight].[Publisher]
ORDER BY [Name];
GO

PRINT '';
PRINT '--- [2/7] Designer ---';
SELECT [ID], [FirstName], [LastName], [Bio], [Website]
FROM [BoardGameNight].[Designer]
ORDER BY [LastName], [FirstName];
GO

PRINT '';
PRINT '--- [3/7] Game ---';
SELECT [ID], [Name], [PublisherID], [YearPublished], [MinPlayers], [MaxPlayers],
       [MinPlayTimeMinutes], [MaxPlayTimeMinutes], [Weight], [Category], [OwnershipStatus],
       [AcquiredDate], [PurchasePrice], [Notes]
FROM [BoardGameNight].[Game]
ORDER BY [Name];
GO

PRINT '';
PRINT '--- [4/7] GameDesigner (pure junction -- no payload) ---';
SELECT gd.[ID], gd.[GameID], gd.[DesignerID],
       g.[Name]                                  AS [Game],
       d.[FirstName] + ' ' + d.[LastName]        AS [Designer]
FROM [BoardGameNight].[GameDesigner] gd
    INNER JOIN [BoardGameNight].[Game] g     ON g.[ID] = gd.[GameID]
    INNER JOIN [BoardGameNight].[Designer] d ON d.[ID] = gd.[DesignerID]
ORDER BY g.[Name], d.[LastName];
GO

PRINT '';
PRINT '--- [5/7] Player ---';
SELECT [ID], [FirstName], [LastName], [Nickname], [Email], [JoinedDate], [SkillLevel], [IsActive]
FROM [BoardGameNight].[Player]
ORDER BY [LastName], [FirstName];
GO

PRINT '';
PRINT '--- [6/7] PlaySession ---';
SELECT s.[ID], s.[GameID], s.[PlayedAt], s.[LocationName], s.[DurationMinutes], s.[Outcome], s.[Notes],
       g.[Name] AS [Game]
FROM [BoardGameNight].[PlaySession] s
    INNER JOIN [BoardGameNight].[Game] g ON g.[ID] = s.[GameID]
ORDER BY s.[PlayedAt];
GO

PRINT '';
PRINT '--- [7/7] PlaySessionPlayer (junction WITH payload -- the centerpiece) ---';
SELECT psp.[ID], psp.[PlaySessionID], psp.[PlayerID],
       psp.[Score], psp.[Placement], psp.[IsWinner], psp.[FactionOrColor], psp.[Notes],
       g.[Name]        AS [Game],
       s.[PlayedAt],
       s.[Outcome],
       p.[Nickname]    AS [Player]
FROM [BoardGameNight].[PlaySessionPlayer] psp
    INNER JOIN [BoardGameNight].[PlaySession] s ON s.[ID] = psp.[PlaySessionID]
    INNER JOIN [BoardGameNight].[Game] g        ON g.[ID] = s.[GameID]
    INNER JOIN [BoardGameNight].[Player] p      ON p.[ID] = psp.[PlayerID]
ORDER BY s.[PlayedAt], psp.[Placement], p.[Nickname];
GO

PRINT '';
PRINT '--- Preview of the leaderboard you will build as a virtual entity later ---';
SELECT
    p.[Nickname],
    p.[SkillLevel],
    COUNT(DISTINCT psp.[PlaySessionID])                              AS [SessionsPlayed],
    SUM(CAST(psp.[IsWinner] AS INT))                                 AS [Wins],
    CAST(100.0 * SUM(CAST(psp.[IsWinner] AS INT))
         / NULLIF(COUNT(DISTINCT psp.[PlaySessionID]), 0) AS DECIMAL(5,1)) AS [WinRatePct],
    AVG(CAST(psp.[Placement] AS DECIMAL(5,2)))                       AS [AvgPlacement]
FROM [BoardGameNight].[Player] p
    LEFT JOIN [BoardGameNight].[PlaySessionPlayer] psp ON psp.[PlayerID] = p.[ID]
GROUP BY p.[Nickname], p.[SkillLevel]
ORDER BY [Wins] DESC, [SessionsPlayed] DESC;
GO

PRINT '';
PRINT '--- Data integrity: every competitive session should have exactly one winner ---';
SELECT
    s.[ID],
    g.[Name]                                AS [Game],
    s.[Outcome],
    COUNT(psp.[ID])                         AS [Participants],
    SUM(CAST(psp.[IsWinner] AS INT))        AS [WinnerCount]
FROM [BoardGameNight].[PlaySession] s
    INNER JOIN [BoardGameNight].[Game] g              ON g.[ID] = s.[GameID]
    INNER JOIN [BoardGameNight].[PlaySessionPlayer] psp ON psp.[PlaySessionID] = s.[ID]
WHERE s.[Outcome] = 'Completed'
  AND g.[Category] <> 'Party'     -- team party games legitimately have multiple winners
GROUP BY s.[ID], g.[Name], s.[Outcome]
HAVING SUM(CAST(psp.[IsWinner] AS INT)) <> 1;
GO

PRINT '';
PRINT '--- Data integrity: every session should fit its game player count ---';
SELECT
    g.[Name]        AS [Game],
    s.[PlayedAt],
    COUNT(psp.[ID]) AS [ActualPlayers],
    g.[MinPlayers],
    g.[MaxPlayers]
FROM [BoardGameNight].[PlaySession] s
    INNER JOIN [BoardGameNight].[Game] g              ON g.[ID] = s.[GameID]
    INNER JOIN [BoardGameNight].[PlaySessionPlayer] psp ON psp.[PlaySessionID] = s.[ID]
GROUP BY g.[Name], s.[PlayedAt], g.[MinPlayers], g.[MaxPlayers]
HAVING COUNT(psp.[ID]) < g.[MinPlayers] OR COUNT(psp.[ID]) > g.[MaxPlayers];
GO

PRINT '';
PRINT '=== BoardGameNight schema created successfully ===';
PRINT '';
PRINT 'NEXT STEPS:';
PRINT '  1. Add "BoardGameNight" to the schema list CodeGen scans.';
PRINT '  2. Run: mj codegen';
PRINT '  3. Read what it generated:';
PRINT '       - packages/MJCoreEntities/src/generated/entity_subclasses.ts  (entity classes)';
PRINT '       - the new vw* views and spCreate/spUpdate/spDelete procs in this schema';
PRINT '       - the generated Angular forms, especially PlaySession and Player';
PRINT '  4. Confirm the CHECK constraints became dropdowns, and that Game.Weight did NOT.';
GO
