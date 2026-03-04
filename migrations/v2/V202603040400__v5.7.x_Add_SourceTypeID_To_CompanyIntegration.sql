-- Migration: Add SourceTypeID and Configuration columns to CompanyIntegration
-- Links each company integration to its source type

ALTER TABLE ${flyway:defaultSchema}.CompanyIntegration
    ADD SourceTypeID UNIQUEIDENTIFIER NULL;

ALTER TABLE ${flyway:defaultSchema}.CompanyIntegration
    ADD Configuration NVARCHAR(MAX) NULL;

ALTER TABLE ${flyway:defaultSchema}.CompanyIntegration
    ADD CONSTRAINT FK_CompanyIntegration_IntegrationSourceType
    FOREIGN KEY (SourceTypeID) REFERENCES ${flyway:defaultSchema}.IntegrationSourceType(ID);
