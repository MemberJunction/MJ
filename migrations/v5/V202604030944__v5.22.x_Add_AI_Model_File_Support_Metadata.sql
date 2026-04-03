-- Add file input support metadata to AI Models.
-- Enables the agent framework to decide whether to use native file upload
-- (e.g., Claude PDF support, Gemini multi-file) vs artifact tools for
-- content exploration. See design doc Section 8.7.

-- AI Model level: base capabilities of the model
ALTER TABLE ${flyway:defaultSchema}.AIModel
    ADD SupportsFileInput BIT NOT NULL DEFAULT 0;

ALTER TABLE ${flyway:defaultSchema}.AIModel
    ADD SupportedFileTypes NVARCHAR(500) NULL;

ALTER TABLE ${flyway:defaultSchema}.AIModel
    ADD MaxFileSize INT NULL;

ALTER TABLE ${flyway:defaultSchema}.AIModel
    ADD MaxTotalFileSize INT NULL;

ALTER TABLE ${flyway:defaultSchema}.AIModel
    ADD MaxFilesPerRequest INT NULL;

-- AI Model Vendor level: vendor-specific overrides
-- Same model served by different vendors may have different file limits
ALTER TABLE ${flyway:defaultSchema}.AIModelVendor
    ADD HasFileAPI BIT NOT NULL DEFAULT 0;

ALTER TABLE ${flyway:defaultSchema}.AIModelVendor
    ADD SupportsFileInput BIT NULL;

ALTER TABLE ${flyway:defaultSchema}.AIModelVendor
    ADD SupportedFileTypes NVARCHAR(500) NULL;

ALTER TABLE ${flyway:defaultSchema}.AIModelVendor
    ADD MaxFileSize INT NULL;

ALTER TABLE ${flyway:defaultSchema}.AIModelVendor
    ADD MaxTotalFileSize INT NULL;

ALTER TABLE ${flyway:defaultSchema}.AIModelVendor
    ADD MaxFilesPerRequest INT NULL;

-- AI Prompt Model level: per-prompt overrides for file handling
ALTER TABLE ${flyway:defaultSchema}.AIPromptModel
    ADD UseFileAPI BIT NULL;

ALTER TABLE ${flyway:defaultSchema}.AIPromptModel
    ADD UseNativeFileInput BIT NULL;

-- Seed known file support for existing models
-- Claude models support PDF input natively
UPDATE ${flyway:defaultSchema}.AIModel
    SET SupportsFileInput = 1,
        SupportedFileTypes = 'application/pdf,image/*',
        MaxFileSize = 32000000,
        MaxFilesPerRequest = 5
    WHERE Name LIKE '%Claude%' OR Name LIKE '%Opus%' OR Name LIKE '%Sonnet%' OR Name LIKE '%Haiku%';

-- Gemini models support multiple file types
UPDATE ${flyway:defaultSchema}.AIModel
    SET SupportsFileInput = 1,
        SupportedFileTypes = 'application/pdf,image/*,audio/*,video/*,text/*',
        MaxFileSize = 20000000,
        MaxFilesPerRequest = 10
    WHERE Name LIKE '%Gemini%';
