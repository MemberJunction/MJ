/*
 * Engineer-Mindset Framework Reset — drop pre-imposed enum CHECK constraints.
 * Column drops deferred; Configuration JSON usage replaces those columns at
 * the role-file level.
 */

ALTER TABLE ${flyway:defaultSchema}.Integration            DROP CONSTRAINT CK_Integration_APIBaseURLMode;
ALTER TABLE ${flyway:defaultSchema}.Integration            DROP CONSTRAINT CK_Integration_TokenRefreshStrategy;
ALTER TABLE ${flyway:defaultSchema}.Integration            DROP CONSTRAINT CK_Integration_AuthHeaderPattern;
ALTER TABLE ${flyway:defaultSchema}.Integration            DROP CONSTRAINT CK_Integration_ErrorResponseShape;
ALTER TABLE ${flyway:defaultSchema}.Integration            DROP CONSTRAINT CK_Integration_IncrementalSyncCapability;
ALTER TABLE ${flyway:defaultSchema}.Integration            DROP CONSTRAINT CK_Integration_WebhookSignatureAlgorithm;
ALTER TABLE ${flyway:defaultSchema}.Integration            DROP CONSTRAINT CK_Integration_APIVersioningStrategy;
ALTER TABLE ${flyway:defaultSchema}.Integration            DROP CONSTRAINT CK_Integration_PrimaryKeyFieldConfidence;
ALTER TABLE ${flyway:defaultSchema}.IntegrationObject      DROP CONSTRAINT CK_IntegrationObject_IncrementalWatermarkType;
ALTER TABLE ${flyway:defaultSchema}.IntegrationObject      DROP CONSTRAINT CK_IntegrationObject_BulkAPIMethod;
