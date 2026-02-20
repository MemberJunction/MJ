/**************************************************************************************************
 * Migration: Test Run Output Entities
 *
 * Purpose: Create two new generic entities for storing structured, sequenced outputs from test runs.
 * Any test type can use these for output storage (screenshots, logs, data, video, audio, etc.).
 *
 * Entities created:
 *   1. MJ: Test Run Output Types - Lookup table for output categories
 *   2. MJ: Test Run Outputs - Individual output artifacts from test runs
 *
 * Version: 4.4.x
 **************************************************************************************************/

-- ============================================================================
-- 1. TestRunOutputType (MJ: Test Run Output Types)
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.[TestRunOutputType] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [Name] NVARCHAR(100) NOT NULL,
    [Description] NVARCHAR(MAX) NULL,
    CONSTRAINT [PK_TestRunOutputType] PRIMARY KEY ([ID]),
    CONSTRAINT [UQ_TestRunOutputType_Name] UNIQUE ([Name])
);
GO

-- Extended properties for TestRunOutputType
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Unique name identifying this output type (e.g., Screenshot, Log, Data, Video)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'TestRunOutputType', @level2type=N'COLUMN', @level2name=N'Name';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Description of what this output type represents and when it is used', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'TestRunOutputType', @level2type=N'COLUMN', @level2name=N'Description';
GO

-- ============================================================================
-- 2. TestRunOutput (MJ: Test Run Outputs)
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.[TestRunOutput] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [TestRunID] UNIQUEIDENTIFIER NOT NULL,
    [OutputTypeID] UNIQUEIDENTIFIER NOT NULL,
    [Sequence] INT NOT NULL DEFAULT 0,
    [StepNumber] INT NULL,
    [Name] NVARCHAR(255) NULL,
    [Description] NVARCHAR(MAX) NULL,
    [MimeType] NVARCHAR(100) NULL,
    [InlineData] NVARCHAR(MAX) NULL,
    [FileSizeBytes] INT NULL,
    [Width] INT NULL,
    [Height] INT NULL,
    [DurationSeconds] DECIMAL(10, 3) NULL,
    [Metadata] NVARCHAR(MAX) NULL,
    CONSTRAINT [PK_TestRunOutput] PRIMARY KEY ([ID]),
    CONSTRAINT [FK_TestRunOutput_TestRun] FOREIGN KEY ([TestRunID])
        REFERENCES ${flyway:defaultSchema}.[TestRun]([ID]),
    CONSTRAINT [FK_TestRunOutput_OutputType] FOREIGN KEY ([OutputTypeID])
        REFERENCES ${flyway:defaultSchema}.[TestRunOutputType]([ID])
);
GO

-- Extended properties for TestRunOutput
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Foreign key to the parent test run that produced this output', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'TestRunOutput', @level2type=N'COLUMN', @level2name=N'TestRunID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Foreign key to the output type category (Screenshot, Log, Video, etc.)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'TestRunOutput', @level2type=N'COLUMN', @level2name=N'OutputTypeID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Chronological ordering for storyboarding outputs across steps', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'TestRunOutput', @level2type=N'COLUMN', @level2name=N'Sequence';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Which step produced this output, for step-based tests like Computer Use', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'TestRunOutput', @level2type=N'COLUMN', @level2name=N'StepNumber';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Human-readable label for this output (e.g., Step 3 Screenshot)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'TestRunOutput', @level2type=N'COLUMN', @level2name=N'Name';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Additional context about this output', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'TestRunOutput', @level2type=N'COLUMN', @level2name=N'Description';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'MIME type of the output data (e.g., image/png, text/plain, application/json, video/mp4)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'TestRunOutput', @level2type=N'COLUMN', @level2name=N'MimeType';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Base64-encoded binary data (images, audio, video) or text content (logs, JSON, HTML)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'TestRunOutput', @level2type=N'COLUMN', @level2name=N'InlineData';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Size of the output data in bytes', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'TestRunOutput', @level2type=N'COLUMN', @level2name=N'FileSizeBytes';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Width in pixels for image or video outputs', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'TestRunOutput', @level2type=N'COLUMN', @level2name=N'Width';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Height in pixels for image or video outputs', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'TestRunOutput', @level2type=N'COLUMN', @level2name=N'Height';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Duration in seconds for audio or video outputs', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'TestRunOutput', @level2type=N'COLUMN', @level2name=N'DurationSeconds';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON object with additional metadata about this output (e.g., URL at time of capture, tool calls, error info)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'TestRunOutput', @level2type=N'COLUMN', @level2name=N'Metadata';
GO

-- ============================================================================
-- 3. Seed TestRunOutputType rows
-- ============================================================================
INSERT INTO ${flyway:defaultSchema}.[TestRunOutputType] ([ID], [Name], [Description])
VALUES
    ('A1B2C3D4-E5F6-7890-ABCD-100000000001', 'Screenshot', 'Image capture at a point in time'),
    ('A1B2C3D4-E5F6-7890-ABCD-100000000002', 'Log', 'Text log output'),
    ('A1B2C3D4-E5F6-7890-ABCD-100000000003', 'Data', 'Structured JSON data'),
    ('A1B2C3D4-E5F6-7890-ABCD-100000000004', 'HTML', 'HTML content'),
    ('A1B2C3D4-E5F6-7890-ABCD-100000000005', 'Video', 'Video recording'),
    ('A1B2C3D4-E5F6-7890-ABCD-100000000006', 'Audio', 'Audio recording'),
    ('A1B2C3D4-E5F6-7890-ABCD-100000000007', 'File', 'Generic file output');
GO




























































































