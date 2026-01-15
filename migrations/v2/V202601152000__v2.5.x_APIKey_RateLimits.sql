/*
** Migration: Add Rate Limiting Fields to APIKey Table
** Version: 2.5.x
** Date: 2026-01-15
**
** Description:
** Adds rate limiting configuration fields to the APIKey table to support
** request throttling per API key. This enables Phase 3 rate limiting feature.
**
** Changes:
** - Add RateLimitRequests: Maximum requests allowed within the time window
** - Add RateLimitWindowSeconds: Time window for rate limiting (in seconds)
**
** Default Rate Limit: 1000 requests per hour (3600 seconds)
*/

-- Add rate limiting columns to APIKey table
ALTER TABLE [${flyway:defaultSchema}].APIKey
ADD
    RateLimitRequests INT NULL,
    RateLimitWindowSeconds INT NULL;

-- Set default values for existing records
UPDATE [${flyway:defaultSchema}].APIKey
SET
    RateLimitRequests = 1000,
    RateLimitWindowSeconds = 3600
WHERE
    RateLimitRequests IS NULL
    OR RateLimitWindowSeconds IS NULL;

-- Add defaults for future records
ALTER TABLE [${flyway:defaultSchema}].APIKey
ADD CONSTRAINT DF_APIKey_RateLimitRequests DEFAULT 1000 FOR RateLimitRequests;

ALTER TABLE [${flyway:defaultSchema}].APIKey
ADD CONSTRAINT DF_APIKey_RateLimitWindowSeconds DEFAULT 3600 FOR RateLimitWindowSeconds;

-- Add extended properties (documentation)
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Maximum number of requests allowed within the rate limit window. Default: 1000 requests per hour.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'APIKey',
    @level2type = N'COLUMN', @level2name = N'RateLimitRequests';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Time window in seconds for rate limiting. Default: 3600 (1 hour). Common values: 60 (1 min), 300 (5 min), 3600 (1 hour), 86400 (1 day).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'APIKey',
    @level2type = N'COLUMN', @level2name = N'RateLimitWindowSeconds';

-- Add check constraint to ensure positive values
ALTER TABLE [${flyway:defaultSchema}].APIKey
ADD CONSTRAINT CK_APIKey_RateLimitRequests CHECK (RateLimitRequests > 0);

ALTER TABLE [${flyway:defaultSchema}].APIKey
ADD CONSTRAINT CK_APIKey_RateLimitWindowSeconds CHECK (RateLimitWindowSeconds > 0);

PRINT 'Rate limiting fields added to APIKey table successfully';
PRINT 'Default rate limit: 1000 requests per 3600 seconds (1 hour)';
