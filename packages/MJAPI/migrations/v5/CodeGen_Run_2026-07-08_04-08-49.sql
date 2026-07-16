/* Set soft PK for acgi.CompanyAdmin.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'F0F9B6DD-56E8-48A4-8E6C-6570F60E4A1E' AND [Name] = 'recordKey';

/* Set soft PK for acgi.CompanyAdmin.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'F0F9B6DD-56E8-48A4-8E6C-6570F60E4A1E' AND [Name] = 'id';

/* Set soft FK for acgi.CompanyAdmin.custId → Customer.custId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '617D549E-533C-420E-81A5-1C6785B4E23D',
                                    [RelatedEntityFieldName] = 'custId',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'F0F9B6DD-56E8-48A4-8E6C-6570F60E4A1E' AND [Name] = 'custId';

/* Set soft FK for acgi.CompanyAdmin.custId → Customer.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '617D549E-533C-420E-81A5-1C6785B4E23D',
                                    [RelatedEntityFieldName] = 'recordKey',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'F0F9B6DD-56E8-48A4-8E6C-6570F60E4A1E' AND [Name] = 'custId';

/* Set soft PK for acgi.Customer.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '617D549E-533C-420E-81A5-1C6785B4E23D' AND [Name] = 'recordKey';

/* Set soft PK for acgi.Employee.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '2FB06A45-01E0-4176-86E7-FE94CCF511F6' AND [Name] = 'recordKey';

/* Set soft PK for acgi.Employee.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '2FB06A45-01E0-4176-86E7-FE94CCF511F6' AND [Name] = 'id';

/* Set soft FK for acgi.Employee.custId → Customer.custId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '617D549E-533C-420E-81A5-1C6785B4E23D',
                                    [RelatedEntityFieldName] = 'custId',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '2FB06A45-01E0-4176-86E7-FE94CCF511F6' AND [Name] = 'custId';

/* Set soft FK for acgi.Employee.custId → Customer.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '617D549E-533C-420E-81A5-1C6785B4E23D',
                                    [RelatedEntityFieldName] = 'recordKey',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '2FB06A45-01E0-4176-86E7-FE94CCF511F6' AND [Name] = 'custId';

/* Set soft PK for acgi.Address.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '18B0628E-6DCD-4712-9B20-662C977773E7' AND [Name] = 'recordKey';

/* Set soft FK for acgi.Address.custId → Customer.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '617D549E-533C-420E-81A5-1C6785B4E23D',
                                    [RelatedEntityFieldName] = 'recordKey',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '18B0628E-6DCD-4712-9B20-662C977773E7' AND [Name] = 'custId';

/* Set soft PK for acgi.Alias.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'EDDBD2C3-EBD8-47D9-90FF-2E490A8FE4BC' AND [Name] = 'recordKey';

/* Set soft FK for acgi.Alias.custId → Customer.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '617D549E-533C-420E-81A5-1C6785B4E23D',
                                    [RelatedEntityFieldName] = 'recordKey',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'EDDBD2C3-EBD8-47D9-90FF-2E490A8FE4BC' AND [Name] = 'custId';

/* Set soft PK for acgi.Bio.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '705DEC63-20F2-4CC9-B978-31FA973D2B4E' AND [Name] = 'recordKey';

/* Set soft FK for acgi.Bio.custId → Customer.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '617D549E-533C-420E-81A5-1C6785B4E23D',
                                    [RelatedEntityFieldName] = 'recordKey',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '705DEC63-20F2-4CC9-B978-31FA973D2B4E' AND [Name] = 'custId';

/* Set soft PK for acgi.Certification.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '8C11C912-45B3-4579-B540-680438F7DC4C' AND [Name] = 'recordKey';

/* Set soft FK for acgi.Certification.custId → Customer.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '617D549E-533C-420E-81A5-1C6785B4E23D',
                                    [RelatedEntityFieldName] = 'recordKey',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '8C11C912-45B3-4579-B540-680438F7DC4C' AND [Name] = 'custId';

/* Set soft PK for acgi.CommitteePosition.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'B29835FA-A452-4BAE-89C7-31EEF77CB4DE' AND [Name] = 'recordKey';

/* Set soft FK for acgi.CommitteePosition.custId → Customer.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '617D549E-533C-420E-81A5-1C6785B4E23D',
                                    [RelatedEntityFieldName] = 'recordKey',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'B29835FA-A452-4BAE-89C7-31EEF77CB4DE' AND [Name] = 'custId';

/* Set soft PK for acgi.CommunicationPreference.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'BC9216F8-C086-411D-B048-29218938A358' AND [Name] = 'recordKey';

/* Set soft FK for acgi.CommunicationPreference.custId → Customer.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '617D549E-533C-420E-81A5-1C6785B4E23D',
                                    [RelatedEntityFieldName] = 'recordKey',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'BC9216F8-C086-411D-B048-29218938A358' AND [Name] = 'custId';

/* Set soft PK for acgi.CustomerAttribute.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '83ED684F-6FF9-4217-9129-08212A1D4705' AND [Name] = 'recordKey';

/* Set soft FK for acgi.CustomerAttribute.custId → Customer.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '617D549E-533C-420E-81A5-1C6785B4E23D',
                                    [RelatedEntityFieldName] = 'recordKey',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '83ED684F-6FF9-4217-9129-08212A1D4705' AND [Name] = 'custId';

/* Set soft PK for acgi.CustomerDimAttr.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'E7829F64-7288-4785-A975-AD18EE0B98B3' AND [Name] = 'recordKey';

/* Set soft FK for acgi.CustomerDimAttr.custId → Customer.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '617D549E-533C-420E-81A5-1C6785B4E23D',
                                    [RelatedEntityFieldName] = 'recordKey',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'E7829F64-7288-4785-A975-AD18EE0B98B3' AND [Name] = 'custId';

/* Set soft PK for acgi.CustomerFile.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '8E609AAA-AF7D-40B2-88E0-342047CED0F8' AND [Name] = 'recordKey';

/* Set soft FK for acgi.CustomerFile.custId → Customer.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '617D549E-533C-420E-81A5-1C6785B4E23D',
                                    [RelatedEntityFieldName] = 'recordKey',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '8E609AAA-AF7D-40B2-88E0-342047CED0F8' AND [Name] = 'custId';

/* Set soft PK for acgi.CustomerRole.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'BF63EDBE-5BE7-49D5-8FB9-AE25DB5C3C4E' AND [Name] = 'recordKey';

/* Set soft FK for acgi.CustomerRole.custId → Customer.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '617D549E-533C-420E-81A5-1C6785B4E23D',
                                    [RelatedEntityFieldName] = 'recordKey',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'BF63EDBE-5BE7-49D5-8FB9-AE25DB5C3C4E' AND [Name] = 'custId';

/* Set soft PK for acgi.DirectoryOptOut.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '3841CD11-0490-4CC3-95FC-84381A0B2F86' AND [Name] = 'recordKey';

/* Set soft FK for acgi.DirectoryOptOut.custId → Customer.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '617D549E-533C-420E-81A5-1C6785B4E23D',
                                    [RelatedEntityFieldName] = 'recordKey',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '3841CD11-0490-4CC3-95FC-84381A0B2F86' AND [Name] = 'custId';

/* Set soft PK for acgi.Email.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '432CF3C7-906B-4C61-A3DA-63CDA4819193' AND [Name] = 'recordKey';

/* Set soft FK for acgi.Email.custId → Customer.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '617D549E-533C-420E-81A5-1C6785B4E23D',
                                    [RelatedEntityFieldName] = 'recordKey',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '432CF3C7-906B-4C61-A3DA-63CDA4819193' AND [Name] = 'custId';

/* Set soft PK for acgi.Job.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '3F7CAD3C-614C-448A-A3DE-3AD56C3A0BC9' AND [Name] = 'recordKey';

/* Set soft FK for acgi.Job.custId → Customer.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '617D549E-533C-420E-81A5-1C6785B4E23D',
                                    [RelatedEntityFieldName] = 'recordKey',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '3F7CAD3C-614C-448A-A3DE-3AD56C3A0BC9' AND [Name] = 'custId';

/* Set soft PK for acgi.Membership.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '5AB42973-A474-4760-95C0-D19D4EC86FAB' AND [Name] = 'recordKey';

/* Set soft FK for acgi.Membership.custId → Customer.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '617D549E-533C-420E-81A5-1C6785B4E23D',
                                    [RelatedEntityFieldName] = 'recordKey',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '5AB42973-A474-4760-95C0-D19D4EC86FAB' AND [Name] = 'custId';

/* Set soft PK for acgi.Phone.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'AA45AA7C-5433-4E3C-AB6C-841C712C04E0' AND [Name] = 'recordKey';

/* Set soft FK for acgi.Phone.custId → Customer.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '617D549E-533C-420E-81A5-1C6785B4E23D',
                                    [RelatedEntityFieldName] = 'recordKey',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'AA45AA7C-5433-4E3C-AB6C-841C712C04E0' AND [Name] = 'custId';

/* Set soft PK for acgi.ReferralInfo.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '3E9C15C2-045F-4C6B-AC93-416F900DC2D5' AND [Name] = 'recordKey';

/* Set soft FK for acgi.ReferralInfo.custId → Customer.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '617D549E-533C-420E-81A5-1C6785B4E23D',
                                    [RelatedEntityFieldName] = 'recordKey',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '3E9C15C2-045F-4C6B-AC93-416F900DC2D5' AND [Name] = 'custId';

/* Set soft PK for acgi.Subscription.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'BDC6581F-68CC-4608-8881-19907881A632' AND [Name] = 'recordKey';

/* Set soft FK for acgi.Subscription.custId → Customer.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '617D549E-533C-420E-81A5-1C6785B4E23D',
                                    [RelatedEntityFieldName] = 'recordKey',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'BDC6581F-68CC-4608-8881-19907881A632' AND [Name] = 'custId';

/* Set soft PK for acgi.Website.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '4634372E-91D9-4A91-9006-1F7A726EBE5B' AND [Name] = 'recordKey';

/* Set soft FK for acgi.Website.custId → Customer.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '617D549E-533C-420E-81A5-1C6785B4E23D',
                                    [RelatedEntityFieldName] = 'recordKey',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '4634372E-91D9-4A91-9006-1F7A726EBE5B' AND [Name] = 'custId';

/* Index for Foreign Keys for Address */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Addresses
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key custId in table Address
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Address_custId' 
    AND object_id = OBJECT_ID('[acgi].[Address]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Address_custId ON [acgi].[Address] ([custId]);

/* Index for Foreign Keys for Alias */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Alias
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key custId in table Alias
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Alias_custId' 
    AND object_id = OBJECT_ID('[acgi].[Alias]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Alias_custId ON [acgi].[Alias] ([custId]);

/* Index for Foreign Keys for Bio */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Bios
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key custId in table Bio
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Bio_custId' 
    AND object_id = OBJECT_ID('[acgi].[Bio]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Bio_custId ON [acgi].[Bio] ([custId]);

/* Index for Foreign Keys for Certification */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Certifications
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key custId in table Certification
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Certification_custId' 
    AND object_id = OBJECT_ID('[acgi].[Certification]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Certification_custId ON [acgi].[Certification] ([custId]);

/* Index for Foreign Keys for CommitteePosition */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Committee Positions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key custId in table CommitteePosition
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CommitteePosition_custId' 
    AND object_id = OBJECT_ID('[acgi].[CommitteePosition]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CommitteePosition_custId ON [acgi].[CommitteePosition] ([custId]);

/* Base View SQL for Addresses */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Addresses
-- Item: vwAddresses
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Addresses
-----               SCHEMA:      acgi
-----               BASE TABLE:  Address
-----               PRIMARY KEY: recordKey
------------------------------------------------------------
IF OBJECT_ID('[acgi].[vwAddresses]', 'V') IS NOT NULL
    DROP VIEW [acgi].[vwAddresses];
GO

CREATE VIEW [acgi].[vwAddresses]
AS
SELECT
    a.*
FROM
    [acgi].[Address] AS a
GO
GRANT SELECT ON [acgi].[vwAddresses] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Addresses */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Addresses
-- Item: Permissions for vwAddresses
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [acgi].[vwAddresses] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Addresses */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Addresses
-- Item: spCreateAddress
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Address
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spCreateAddress]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spCreateAddress];
GO

CREATE PROCEDURE [acgi].[spCreateAddress]
    @county_Clear bit = 0,
    @county nvarchar(255) = NULL,
    @lockCode_Clear bit = 0,
    @lockCode nvarchar(255) = NULL,
    @street2_Clear bit = 0,
    @street2 nvarchar(255) = NULL,
    @custId_Clear bit = 0,
    @custId nvarchar(255) = NULL,
    @recordKey nvarchar(255) = NULL,
    @addressTypeDescr_Clear bit = 0,
    @addressTypeDescr nvarchar(255) = NULL,
    @province_Clear bit = 0,
    @province nvarchar(255) = NULL,
    @regionCode_Clear bit = 0,
    @regionCode nvarchar(255) = NULL,
    @countryCode_Clear bit = 0,
    @countryCode nvarchar(255) = NULL,
    @countryDescr_Clear bit = 0,
    @countryDescr nvarchar(255) = NULL,
    @addressType_Clear bit = 0,
    @addressType nvarchar(255) = NULL,
    @street3_Clear bit = 0,
    @street3 nvarchar(255) = NULL,
    @city_Clear bit = 0,
    @city nvarchar(255) = NULL,
    @state_Clear bit = 0,
    @state nvarchar(255) = NULL,
    @addressSerno_Clear bit = 0,
    @addressSerno nvarchar(255) = NULL,
    @street1_Clear bit = 0,
    @street1 nvarchar(255) = NULL,
    @longitude_Clear bit = 0,
    @longitude nvarchar(255) = NULL,
    @showInDirectory_Clear bit = 0,
    @showInDirectory nvarchar(255) = NULL,
    @preferred_Clear bit = 0,
    @preferred nvarchar(255) = NULL,
    @postalCode_Clear bit = 0,
    @postalCode nvarchar(255) = NULL,
    @badAddress_Clear bit = 0,
    @badAddress nvarchar(255) = NULL,
    @regionDescr_Clear bit = 0,
    @regionDescr nvarchar(255) = NULL,
    @latitude_Clear bit = 0,
    @latitude nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [acgi].[Address]
        (
            [county],
                [lockCode],
                [street2],
                [custId],
                [addressTypeDescr],
                [province],
                [regionCode],
                [countryCode],
                [countryDescr],
                [addressType],
                [street3],
                [city],
                [state],
                [addressSerno],
                [street1],
                [longitude],
                [showInDirectory],
                [preferred],
                [postalCode],
                [badAddress],
                [regionDescr],
                [latitude],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [recordKey]
        )
    VALUES
        (
            CASE WHEN @county_Clear = 1 THEN NULL ELSE ISNULL(@county, NULL) END,
                CASE WHEN @lockCode_Clear = 1 THEN NULL ELSE ISNULL(@lockCode, NULL) END,
                CASE WHEN @street2_Clear = 1 THEN NULL ELSE ISNULL(@street2, NULL) END,
                CASE WHEN @custId_Clear = 1 THEN NULL ELSE ISNULL(@custId, NULL) END,
                CASE WHEN @addressTypeDescr_Clear = 1 THEN NULL ELSE ISNULL(@addressTypeDescr, NULL) END,
                CASE WHEN @province_Clear = 1 THEN NULL ELSE ISNULL(@province, NULL) END,
                CASE WHEN @regionCode_Clear = 1 THEN NULL ELSE ISNULL(@regionCode, NULL) END,
                CASE WHEN @countryCode_Clear = 1 THEN NULL ELSE ISNULL(@countryCode, NULL) END,
                CASE WHEN @countryDescr_Clear = 1 THEN NULL ELSE ISNULL(@countryDescr, NULL) END,
                CASE WHEN @addressType_Clear = 1 THEN NULL ELSE ISNULL(@addressType, NULL) END,
                CASE WHEN @street3_Clear = 1 THEN NULL ELSE ISNULL(@street3, NULL) END,
                CASE WHEN @city_Clear = 1 THEN NULL ELSE ISNULL(@city, NULL) END,
                CASE WHEN @state_Clear = 1 THEN NULL ELSE ISNULL(@state, NULL) END,
                CASE WHEN @addressSerno_Clear = 1 THEN NULL ELSE ISNULL(@addressSerno, NULL) END,
                CASE WHEN @street1_Clear = 1 THEN NULL ELSE ISNULL(@street1, NULL) END,
                CASE WHEN @longitude_Clear = 1 THEN NULL ELSE ISNULL(@longitude, NULL) END,
                CASE WHEN @showInDirectory_Clear = 1 THEN NULL ELSE ISNULL(@showInDirectory, NULL) END,
                CASE WHEN @preferred_Clear = 1 THEN NULL ELSE ISNULL(@preferred, NULL) END,
                CASE WHEN @postalCode_Clear = 1 THEN NULL ELSE ISNULL(@postalCode, NULL) END,
                CASE WHEN @badAddress_Clear = 1 THEN NULL ELSE ISNULL(@badAddress, NULL) END,
                CASE WHEN @regionDescr_Clear = 1 THEN NULL ELSE ISNULL(@regionDescr, NULL) END,
                CASE WHEN @latitude_Clear = 1 THEN NULL ELSE ISNULL(@latitude, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @recordKey
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [acgi].[vwAddresses] WHERE [recordKey] = @recordKey
END
GO
GRANT EXECUTE ON [acgi].[spCreateAddress] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Addresses */

GRANT EXECUTE ON [acgi].[spCreateAddress] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Addresses */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Addresses
-- Item: spUpdateAddress
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Address
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spUpdateAddress]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spUpdateAddress];
GO

CREATE PROCEDURE [acgi].[spUpdateAddress]
    @county_Clear bit = 0,
    @county nvarchar(255) = NULL,
    @lockCode_Clear bit = 0,
    @lockCode nvarchar(255) = NULL,
    @street2_Clear bit = 0,
    @street2 nvarchar(255) = NULL,
    @custId_Clear bit = 0,
    @custId nvarchar(255) = NULL,
    @recordKey nvarchar(255),
    @addressTypeDescr_Clear bit = 0,
    @addressTypeDescr nvarchar(255) = NULL,
    @province_Clear bit = 0,
    @province nvarchar(255) = NULL,
    @regionCode_Clear bit = 0,
    @regionCode nvarchar(255) = NULL,
    @countryCode_Clear bit = 0,
    @countryCode nvarchar(255) = NULL,
    @countryDescr_Clear bit = 0,
    @countryDescr nvarchar(255) = NULL,
    @addressType_Clear bit = 0,
    @addressType nvarchar(255) = NULL,
    @street3_Clear bit = 0,
    @street3 nvarchar(255) = NULL,
    @city_Clear bit = 0,
    @city nvarchar(255) = NULL,
    @state_Clear bit = 0,
    @state nvarchar(255) = NULL,
    @addressSerno_Clear bit = 0,
    @addressSerno nvarchar(255) = NULL,
    @street1_Clear bit = 0,
    @street1 nvarchar(255) = NULL,
    @longitude_Clear bit = 0,
    @longitude nvarchar(255) = NULL,
    @showInDirectory_Clear bit = 0,
    @showInDirectory nvarchar(255) = NULL,
    @preferred_Clear bit = 0,
    @preferred nvarchar(255) = NULL,
    @postalCode_Clear bit = 0,
    @postalCode nvarchar(255) = NULL,
    @badAddress_Clear bit = 0,
    @badAddress nvarchar(255) = NULL,
    @regionDescr_Clear bit = 0,
    @regionDescr nvarchar(255) = NULL,
    @latitude_Clear bit = 0,
    @latitude nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [acgi].[Address]
    SET
        [county] = CASE WHEN @county_Clear = 1 THEN NULL ELSE ISNULL(@county, [county]) END,
        [lockCode] = CASE WHEN @lockCode_Clear = 1 THEN NULL ELSE ISNULL(@lockCode, [lockCode]) END,
        [street2] = CASE WHEN @street2_Clear = 1 THEN NULL ELSE ISNULL(@street2, [street2]) END,
        [custId] = CASE WHEN @custId_Clear = 1 THEN NULL ELSE ISNULL(@custId, [custId]) END,
        [addressTypeDescr] = CASE WHEN @addressTypeDescr_Clear = 1 THEN NULL ELSE ISNULL(@addressTypeDescr, [addressTypeDescr]) END,
        [province] = CASE WHEN @province_Clear = 1 THEN NULL ELSE ISNULL(@province, [province]) END,
        [regionCode] = CASE WHEN @regionCode_Clear = 1 THEN NULL ELSE ISNULL(@regionCode, [regionCode]) END,
        [countryCode] = CASE WHEN @countryCode_Clear = 1 THEN NULL ELSE ISNULL(@countryCode, [countryCode]) END,
        [countryDescr] = CASE WHEN @countryDescr_Clear = 1 THEN NULL ELSE ISNULL(@countryDescr, [countryDescr]) END,
        [addressType] = CASE WHEN @addressType_Clear = 1 THEN NULL ELSE ISNULL(@addressType, [addressType]) END,
        [street3] = CASE WHEN @street3_Clear = 1 THEN NULL ELSE ISNULL(@street3, [street3]) END,
        [city] = CASE WHEN @city_Clear = 1 THEN NULL ELSE ISNULL(@city, [city]) END,
        [state] = CASE WHEN @state_Clear = 1 THEN NULL ELSE ISNULL(@state, [state]) END,
        [addressSerno] = CASE WHEN @addressSerno_Clear = 1 THEN NULL ELSE ISNULL(@addressSerno, [addressSerno]) END,
        [street1] = CASE WHEN @street1_Clear = 1 THEN NULL ELSE ISNULL(@street1, [street1]) END,
        [longitude] = CASE WHEN @longitude_Clear = 1 THEN NULL ELSE ISNULL(@longitude, [longitude]) END,
        [showInDirectory] = CASE WHEN @showInDirectory_Clear = 1 THEN NULL ELSE ISNULL(@showInDirectory, [showInDirectory]) END,
        [preferred] = CASE WHEN @preferred_Clear = 1 THEN NULL ELSE ISNULL(@preferred, [preferred]) END,
        [postalCode] = CASE WHEN @postalCode_Clear = 1 THEN NULL ELSE ISNULL(@postalCode, [postalCode]) END,
        [badAddress] = CASE WHEN @badAddress_Clear = 1 THEN NULL ELSE ISNULL(@badAddress, [badAddress]) END,
        [regionDescr] = CASE WHEN @regionDescr_Clear = 1 THEN NULL ELSE ISNULL(@regionDescr, [regionDescr]) END,
        [latitude] = CASE WHEN @latitude_Clear = 1 THEN NULL ELSE ISNULL(@latitude, [latitude]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [recordKey] = @recordKey

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [acgi].[vwAddresses] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [acgi].[vwAddresses]
                                    WHERE
                                        [recordKey] = @recordKey
                                    
END
GO

GRANT EXECUTE ON [acgi].[spUpdateAddress] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Address table
------------------------------------------------------------
IF OBJECT_ID('[acgi].[trgUpdateAddress]', 'TR') IS NOT NULL
    DROP TRIGGER [acgi].[trgUpdateAddress];
GO
CREATE TRIGGER [acgi].trgUpdateAddress
ON [acgi].[Address]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [acgi].[Address]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [acgi].[Address] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[recordKey] = I.[recordKey];
END;
GO

/* spUpdate Permissions for Addresses */

GRANT EXECUTE ON [acgi].[spUpdateAddress] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Alias */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Alias
-- Item: vwAlias
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Alias
-----               SCHEMA:      acgi
-----               BASE TABLE:  Alias
-----               PRIMARY KEY: recordKey
------------------------------------------------------------
IF OBJECT_ID('[acgi].[vwAlias]', 'V') IS NOT NULL
    DROP VIEW [acgi].[vwAlias];
GO

CREATE VIEW [acgi].[vwAlias]
AS
SELECT
    a.*
FROM
    [acgi].[Alias] AS a
GO
GRANT SELECT ON [acgi].[vwAlias] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Alias */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Alias
-- Item: Permissions for vwAlias
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [acgi].[vwAlias] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Alias */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Alias
-- Item: spCreateAlias
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Alias
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spCreateAlias]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spCreateAlias];
GO

CREATE PROCEDURE [acgi].[spCreateAlias]
    @custId_Clear bit = 0,
    @custId nvarchar(255) = NULL,
    @aliasTypeDescr_Clear bit = 0,
    @aliasTypeDescr nvarchar(255) = NULL,
    @aliasType_Clear bit = 0,
    @aliasType nvarchar(255) = NULL,
    @aliasValue_Clear bit = 0,
    @aliasValue nvarchar(255) = NULL,
    @recordKey nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [acgi].[Alias]
        (
            [custId],
                [aliasTypeDescr],
                [aliasType],
                [aliasValue],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [recordKey]
        )
    VALUES
        (
            CASE WHEN @custId_Clear = 1 THEN NULL ELSE ISNULL(@custId, NULL) END,
                CASE WHEN @aliasTypeDescr_Clear = 1 THEN NULL ELSE ISNULL(@aliasTypeDescr, NULL) END,
                CASE WHEN @aliasType_Clear = 1 THEN NULL ELSE ISNULL(@aliasType, NULL) END,
                CASE WHEN @aliasValue_Clear = 1 THEN NULL ELSE ISNULL(@aliasValue, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @recordKey
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [acgi].[vwAlias] WHERE [recordKey] = @recordKey
END
GO
GRANT EXECUTE ON [acgi].[spCreateAlias] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Alias */

GRANT EXECUTE ON [acgi].[spCreateAlias] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Alias */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Alias
-- Item: spUpdateAlias
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Alias
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spUpdateAlias]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spUpdateAlias];
GO

CREATE PROCEDURE [acgi].[spUpdateAlias]
    @custId_Clear bit = 0,
    @custId nvarchar(255) = NULL,
    @aliasTypeDescr_Clear bit = 0,
    @aliasTypeDescr nvarchar(255) = NULL,
    @aliasType_Clear bit = 0,
    @aliasType nvarchar(255) = NULL,
    @aliasValue_Clear bit = 0,
    @aliasValue nvarchar(255) = NULL,
    @recordKey nvarchar(255),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [acgi].[Alias]
    SET
        [custId] = CASE WHEN @custId_Clear = 1 THEN NULL ELSE ISNULL(@custId, [custId]) END,
        [aliasTypeDescr] = CASE WHEN @aliasTypeDescr_Clear = 1 THEN NULL ELSE ISNULL(@aliasTypeDescr, [aliasTypeDescr]) END,
        [aliasType] = CASE WHEN @aliasType_Clear = 1 THEN NULL ELSE ISNULL(@aliasType, [aliasType]) END,
        [aliasValue] = CASE WHEN @aliasValue_Clear = 1 THEN NULL ELSE ISNULL(@aliasValue, [aliasValue]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [recordKey] = @recordKey

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [acgi].[vwAlias] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [acgi].[vwAlias]
                                    WHERE
                                        [recordKey] = @recordKey
                                    
END
GO

GRANT EXECUTE ON [acgi].[spUpdateAlias] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Alias table
------------------------------------------------------------
IF OBJECT_ID('[acgi].[trgUpdateAlias]', 'TR') IS NOT NULL
    DROP TRIGGER [acgi].[trgUpdateAlias];
GO
CREATE TRIGGER [acgi].trgUpdateAlias
ON [acgi].[Alias]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [acgi].[Alias]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [acgi].[Alias] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[recordKey] = I.[recordKey];
END;
GO

/* spUpdate Permissions for Alias */

GRANT EXECUTE ON [acgi].[spUpdateAlias] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Bios */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Bios
-- Item: vwBios
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Bios
-----               SCHEMA:      acgi
-----               BASE TABLE:  Bio
-----               PRIMARY KEY: recordKey
------------------------------------------------------------
IF OBJECT_ID('[acgi].[vwBios]', 'V') IS NOT NULL
    DROP VIEW [acgi].[vwBios];
GO

CREATE VIEW [acgi].[vwBios]
AS
SELECT
    b.*
FROM
    [acgi].[Bio] AS b
GO
GRANT SELECT ON [acgi].[vwBios] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Bios */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Bios
-- Item: Permissions for vwBios
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [acgi].[vwBios] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Bios */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Bios
-- Item: spCreateBio
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Bio
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spCreateBio]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spCreateBio];
GO

CREATE PROCEDURE [acgi].[spCreateBio]
    @recordKey nvarchar(255) = NULL,
    @lockCode_Clear bit = 0,
    @lockCode nvarchar(255) = NULL,
    @bioText_Clear bit = 0,
    @bioText nvarchar(255) = NULL,
    @custId_Clear bit = 0,
    @custId nvarchar(255) = NULL,
    @imageThumbnail_Clear bit = 0,
    @imageThumbnail nvarchar(255) = NULL,
    @imageFull_Clear bit = 0,
    @imageFull nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [acgi].[Bio]
        (
            [lockCode],
                [bioText],
                [custId],
                [imageThumbnail],
                [imageFull],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [recordKey]
        )
    VALUES
        (
            CASE WHEN @lockCode_Clear = 1 THEN NULL ELSE ISNULL(@lockCode, NULL) END,
                CASE WHEN @bioText_Clear = 1 THEN NULL ELSE ISNULL(@bioText, NULL) END,
                CASE WHEN @custId_Clear = 1 THEN NULL ELSE ISNULL(@custId, NULL) END,
                CASE WHEN @imageThumbnail_Clear = 1 THEN NULL ELSE ISNULL(@imageThumbnail, NULL) END,
                CASE WHEN @imageFull_Clear = 1 THEN NULL ELSE ISNULL(@imageFull, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @recordKey
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [acgi].[vwBios] WHERE [recordKey] = @recordKey
END
GO
GRANT EXECUTE ON [acgi].[spCreateBio] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Bios */

GRANT EXECUTE ON [acgi].[spCreateBio] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Bios */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Bios
-- Item: spUpdateBio
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Bio
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spUpdateBio]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spUpdateBio];
GO

CREATE PROCEDURE [acgi].[spUpdateBio]
    @recordKey nvarchar(255),
    @lockCode_Clear bit = 0,
    @lockCode nvarchar(255) = NULL,
    @bioText_Clear bit = 0,
    @bioText nvarchar(255) = NULL,
    @custId_Clear bit = 0,
    @custId nvarchar(255) = NULL,
    @imageThumbnail_Clear bit = 0,
    @imageThumbnail nvarchar(255) = NULL,
    @imageFull_Clear bit = 0,
    @imageFull nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [acgi].[Bio]
    SET
        [lockCode] = CASE WHEN @lockCode_Clear = 1 THEN NULL ELSE ISNULL(@lockCode, [lockCode]) END,
        [bioText] = CASE WHEN @bioText_Clear = 1 THEN NULL ELSE ISNULL(@bioText, [bioText]) END,
        [custId] = CASE WHEN @custId_Clear = 1 THEN NULL ELSE ISNULL(@custId, [custId]) END,
        [imageThumbnail] = CASE WHEN @imageThumbnail_Clear = 1 THEN NULL ELSE ISNULL(@imageThumbnail, [imageThumbnail]) END,
        [imageFull] = CASE WHEN @imageFull_Clear = 1 THEN NULL ELSE ISNULL(@imageFull, [imageFull]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [recordKey] = @recordKey

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [acgi].[vwBios] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [acgi].[vwBios]
                                    WHERE
                                        [recordKey] = @recordKey
                                    
END
GO

GRANT EXECUTE ON [acgi].[spUpdateBio] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Bio table
------------------------------------------------------------
IF OBJECT_ID('[acgi].[trgUpdateBio]', 'TR') IS NOT NULL
    DROP TRIGGER [acgi].[trgUpdateBio];
GO
CREATE TRIGGER [acgi].trgUpdateBio
ON [acgi].[Bio]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [acgi].[Bio]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [acgi].[Bio] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[recordKey] = I.[recordKey];
END;
GO

/* spUpdate Permissions for Bios */

GRANT EXECUTE ON [acgi].[spUpdateBio] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Certifications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Certifications
-- Item: vwCertifications
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Certifications
-----               SCHEMA:      acgi
-----               BASE TABLE:  Certification
-----               PRIMARY KEY: recordKey
------------------------------------------------------------
IF OBJECT_ID('[acgi].[vwCertifications]', 'V') IS NOT NULL
    DROP VIEW [acgi].[vwCertifications];
GO

CREATE VIEW [acgi].[vwCertifications]
AS
SELECT
    c.*
FROM
    [acgi].[Certification] AS c
GO
GRANT SELECT ON [acgi].[vwCertifications] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Certifications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Certifications
-- Item: Permissions for vwCertifications
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [acgi].[vwCertifications] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Certifications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Certifications
-- Item: spCreateCertification
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Certification
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spCreateCertification]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spCreateCertification];
GO

CREATE PROCEDURE [acgi].[spCreateCertification]
    @certificateLevel_Clear bit = 0,
    @certificateLevel nvarchar(255) = NULL,
    @startDate_Clear bit = 0,
    @startDate nvarchar(255) = NULL,
    @lockCode_Clear bit = 0,
    @lockCode nvarchar(255) = NULL,
    @endDate_Clear bit = 0,
    @endDate nvarchar(255) = NULL,
    @completionDate_Clear bit = 0,
    @completionDate nvarchar(255) = NULL,
    @certificateSpecialty_Clear bit = 0,
    @certificateSpecialty nvarchar(255) = NULL,
    @periodSerno_Clear bit = 0,
    @periodSerno nvarchar(255) = NULL,
    @recordKey nvarchar(255) = NULL,
    @certificateType_Clear bit = 0,
    @certificateType nvarchar(255) = NULL,
    @certificateStatus_Clear bit = 0,
    @certificateStatus nvarchar(255) = NULL,
    @evalStartDate_Clear bit = 0,
    @evalStartDate nvarchar(255) = NULL,
    @custId_Clear bit = 0,
    @custId nvarchar(255) = NULL,
    @certified_Clear bit = 0,
    @certified nvarchar(255) = NULL,
    @certificateNumber_Clear bit = 0,
    @certificateNumber nvarchar(255) = NULL,
    @evalEndDate_Clear bit = 0,
    @evalEndDate nvarchar(255) = NULL,
    @completionCode_Clear bit = 0,
    @completionCode nvarchar(255) = NULL,
    @certifiedSinceDate_Clear bit = 0,
    @certifiedSinceDate nvarchar(255) = NULL,
    @certificateExpDate_Clear bit = 0,
    @certificateExpDate nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [acgi].[Certification]
        (
            [certificateLevel],
                [startDate],
                [lockCode],
                [endDate],
                [completionDate],
                [certificateSpecialty],
                [periodSerno],
                [certificateType],
                [certificateStatus],
                [evalStartDate],
                [custId],
                [certified],
                [certificateNumber],
                [evalEndDate],
                [completionCode],
                [certifiedSinceDate],
                [certificateExpDate],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [recordKey]
        )
    VALUES
        (
            CASE WHEN @certificateLevel_Clear = 1 THEN NULL ELSE ISNULL(@certificateLevel, NULL) END,
                CASE WHEN @startDate_Clear = 1 THEN NULL ELSE ISNULL(@startDate, NULL) END,
                CASE WHEN @lockCode_Clear = 1 THEN NULL ELSE ISNULL(@lockCode, NULL) END,
                CASE WHEN @endDate_Clear = 1 THEN NULL ELSE ISNULL(@endDate, NULL) END,
                CASE WHEN @completionDate_Clear = 1 THEN NULL ELSE ISNULL(@completionDate, NULL) END,
                CASE WHEN @certificateSpecialty_Clear = 1 THEN NULL ELSE ISNULL(@certificateSpecialty, NULL) END,
                CASE WHEN @periodSerno_Clear = 1 THEN NULL ELSE ISNULL(@periodSerno, NULL) END,
                CASE WHEN @certificateType_Clear = 1 THEN NULL ELSE ISNULL(@certificateType, NULL) END,
                CASE WHEN @certificateStatus_Clear = 1 THEN NULL ELSE ISNULL(@certificateStatus, NULL) END,
                CASE WHEN @evalStartDate_Clear = 1 THEN NULL ELSE ISNULL(@evalStartDate, NULL) END,
                CASE WHEN @custId_Clear = 1 THEN NULL ELSE ISNULL(@custId, NULL) END,
                CASE WHEN @certified_Clear = 1 THEN NULL ELSE ISNULL(@certified, NULL) END,
                CASE WHEN @certificateNumber_Clear = 1 THEN NULL ELSE ISNULL(@certificateNumber, NULL) END,
                CASE WHEN @evalEndDate_Clear = 1 THEN NULL ELSE ISNULL(@evalEndDate, NULL) END,
                CASE WHEN @completionCode_Clear = 1 THEN NULL ELSE ISNULL(@completionCode, NULL) END,
                CASE WHEN @certifiedSinceDate_Clear = 1 THEN NULL ELSE ISNULL(@certifiedSinceDate, NULL) END,
                CASE WHEN @certificateExpDate_Clear = 1 THEN NULL ELSE ISNULL(@certificateExpDate, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @recordKey
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [acgi].[vwCertifications] WHERE [recordKey] = @recordKey
END
GO
GRANT EXECUTE ON [acgi].[spCreateCertification] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Certifications */

GRANT EXECUTE ON [acgi].[spCreateCertification] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Certifications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Certifications
-- Item: spUpdateCertification
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Certification
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spUpdateCertification]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spUpdateCertification];
GO

CREATE PROCEDURE [acgi].[spUpdateCertification]
    @certificateLevel_Clear bit = 0,
    @certificateLevel nvarchar(255) = NULL,
    @startDate_Clear bit = 0,
    @startDate nvarchar(255) = NULL,
    @lockCode_Clear bit = 0,
    @lockCode nvarchar(255) = NULL,
    @endDate_Clear bit = 0,
    @endDate nvarchar(255) = NULL,
    @completionDate_Clear bit = 0,
    @completionDate nvarchar(255) = NULL,
    @certificateSpecialty_Clear bit = 0,
    @certificateSpecialty nvarchar(255) = NULL,
    @periodSerno_Clear bit = 0,
    @periodSerno nvarchar(255) = NULL,
    @recordKey nvarchar(255),
    @certificateType_Clear bit = 0,
    @certificateType nvarchar(255) = NULL,
    @certificateStatus_Clear bit = 0,
    @certificateStatus nvarchar(255) = NULL,
    @evalStartDate_Clear bit = 0,
    @evalStartDate nvarchar(255) = NULL,
    @custId_Clear bit = 0,
    @custId nvarchar(255) = NULL,
    @certified_Clear bit = 0,
    @certified nvarchar(255) = NULL,
    @certificateNumber_Clear bit = 0,
    @certificateNumber nvarchar(255) = NULL,
    @evalEndDate_Clear bit = 0,
    @evalEndDate nvarchar(255) = NULL,
    @completionCode_Clear bit = 0,
    @completionCode nvarchar(255) = NULL,
    @certifiedSinceDate_Clear bit = 0,
    @certifiedSinceDate nvarchar(255) = NULL,
    @certificateExpDate_Clear bit = 0,
    @certificateExpDate nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [acgi].[Certification]
    SET
        [certificateLevel] = CASE WHEN @certificateLevel_Clear = 1 THEN NULL ELSE ISNULL(@certificateLevel, [certificateLevel]) END,
        [startDate] = CASE WHEN @startDate_Clear = 1 THEN NULL ELSE ISNULL(@startDate, [startDate]) END,
        [lockCode] = CASE WHEN @lockCode_Clear = 1 THEN NULL ELSE ISNULL(@lockCode, [lockCode]) END,
        [endDate] = CASE WHEN @endDate_Clear = 1 THEN NULL ELSE ISNULL(@endDate, [endDate]) END,
        [completionDate] = CASE WHEN @completionDate_Clear = 1 THEN NULL ELSE ISNULL(@completionDate, [completionDate]) END,
        [certificateSpecialty] = CASE WHEN @certificateSpecialty_Clear = 1 THEN NULL ELSE ISNULL(@certificateSpecialty, [certificateSpecialty]) END,
        [periodSerno] = CASE WHEN @periodSerno_Clear = 1 THEN NULL ELSE ISNULL(@periodSerno, [periodSerno]) END,
        [certificateType] = CASE WHEN @certificateType_Clear = 1 THEN NULL ELSE ISNULL(@certificateType, [certificateType]) END,
        [certificateStatus] = CASE WHEN @certificateStatus_Clear = 1 THEN NULL ELSE ISNULL(@certificateStatus, [certificateStatus]) END,
        [evalStartDate] = CASE WHEN @evalStartDate_Clear = 1 THEN NULL ELSE ISNULL(@evalStartDate, [evalStartDate]) END,
        [custId] = CASE WHEN @custId_Clear = 1 THEN NULL ELSE ISNULL(@custId, [custId]) END,
        [certified] = CASE WHEN @certified_Clear = 1 THEN NULL ELSE ISNULL(@certified, [certified]) END,
        [certificateNumber] = CASE WHEN @certificateNumber_Clear = 1 THEN NULL ELSE ISNULL(@certificateNumber, [certificateNumber]) END,
        [evalEndDate] = CASE WHEN @evalEndDate_Clear = 1 THEN NULL ELSE ISNULL(@evalEndDate, [evalEndDate]) END,
        [completionCode] = CASE WHEN @completionCode_Clear = 1 THEN NULL ELSE ISNULL(@completionCode, [completionCode]) END,
        [certifiedSinceDate] = CASE WHEN @certifiedSinceDate_Clear = 1 THEN NULL ELSE ISNULL(@certifiedSinceDate, [certifiedSinceDate]) END,
        [certificateExpDate] = CASE WHEN @certificateExpDate_Clear = 1 THEN NULL ELSE ISNULL(@certificateExpDate, [certificateExpDate]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [recordKey] = @recordKey

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [acgi].[vwCertifications] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [acgi].[vwCertifications]
                                    WHERE
                                        [recordKey] = @recordKey
                                    
END
GO

GRANT EXECUTE ON [acgi].[spUpdateCertification] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Certification table
------------------------------------------------------------
IF OBJECT_ID('[acgi].[trgUpdateCertification]', 'TR') IS NOT NULL
    DROP TRIGGER [acgi].[trgUpdateCertification];
GO
CREATE TRIGGER [acgi].trgUpdateCertification
ON [acgi].[Certification]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [acgi].[Certification]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [acgi].[Certification] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[recordKey] = I.[recordKey];
END;
GO

/* spUpdate Permissions for Certifications */

GRANT EXECUTE ON [acgi].[spUpdateCertification] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Committee Positions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Committee Positions
-- Item: vwCommitteePositions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Committee Positions
-----               SCHEMA:      acgi
-----               BASE TABLE:  CommitteePosition
-----               PRIMARY KEY: recordKey
------------------------------------------------------------
IF OBJECT_ID('[acgi].[vwCommitteePositions]', 'V') IS NOT NULL
    DROP VIEW [acgi].[vwCommitteePositions];
GO

CREATE VIEW [acgi].[vwCommitteePositions]
AS
SELECT
    c.*
FROM
    [acgi].[CommitteePosition] AS c
GO
GRANT SELECT ON [acgi].[vwCommitteePositions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Committee Positions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Committee Positions
-- Item: Permissions for vwCommitteePositions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [acgi].[vwCommitteePositions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Committee Positions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Committee Positions
-- Item: spCreateCommitteePosition
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CommitteePosition
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spCreateCommitteePosition]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spCreateCommitteePosition];
GO

CREATE PROCEDURE [acgi].[spCreateCommitteePosition]
    @committeeGroup_Clear bit = 0,
    @committeeGroup nvarchar(255) = NULL,
    @committeeDescr_Clear bit = 0,
    @committeeDescr nvarchar(255) = NULL,
    @committeeGrpDescr_Clear bit = 0,
    @committeeGrpDescr nvarchar(255) = NULL,
    @custId_Clear bit = 0,
    @custId nvarchar(255) = NULL,
    @startDate_Clear bit = 0,
    @startDate nvarchar(255) = NULL,
    @positionDescr_Clear bit = 0,
    @positionDescr nvarchar(255) = NULL,
    @subgroupName_Clear bit = 0,
    @subgroupName nvarchar(255) = NULL,
    @positionSerno_Clear bit = 0,
    @positionSerno nvarchar(255) = NULL,
    @recordKey nvarchar(255) = NULL,
    @subgroupId_Clear bit = 0,
    @subgroupId nvarchar(255) = NULL,
    @endDate_Clear bit = 0,
    @endDate nvarchar(255) = NULL,
    @positionCode_Clear bit = 0,
    @positionCode nvarchar(255) = NULL,
    @committeeType_Clear bit = 0,
    @committeeType nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [acgi].[CommitteePosition]
        (
            [committeeGroup],
                [committeeDescr],
                [committeeGrpDescr],
                [custId],
                [startDate],
                [positionDescr],
                [subgroupName],
                [positionSerno],
                [subgroupId],
                [endDate],
                [positionCode],
                [committeeType],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [recordKey]
        )
    VALUES
        (
            CASE WHEN @committeeGroup_Clear = 1 THEN NULL ELSE ISNULL(@committeeGroup, NULL) END,
                CASE WHEN @committeeDescr_Clear = 1 THEN NULL ELSE ISNULL(@committeeDescr, NULL) END,
                CASE WHEN @committeeGrpDescr_Clear = 1 THEN NULL ELSE ISNULL(@committeeGrpDescr, NULL) END,
                CASE WHEN @custId_Clear = 1 THEN NULL ELSE ISNULL(@custId, NULL) END,
                CASE WHEN @startDate_Clear = 1 THEN NULL ELSE ISNULL(@startDate, NULL) END,
                CASE WHEN @positionDescr_Clear = 1 THEN NULL ELSE ISNULL(@positionDescr, NULL) END,
                CASE WHEN @subgroupName_Clear = 1 THEN NULL ELSE ISNULL(@subgroupName, NULL) END,
                CASE WHEN @positionSerno_Clear = 1 THEN NULL ELSE ISNULL(@positionSerno, NULL) END,
                CASE WHEN @subgroupId_Clear = 1 THEN NULL ELSE ISNULL(@subgroupId, NULL) END,
                CASE WHEN @endDate_Clear = 1 THEN NULL ELSE ISNULL(@endDate, NULL) END,
                CASE WHEN @positionCode_Clear = 1 THEN NULL ELSE ISNULL(@positionCode, NULL) END,
                CASE WHEN @committeeType_Clear = 1 THEN NULL ELSE ISNULL(@committeeType, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @recordKey
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [acgi].[vwCommitteePositions] WHERE [recordKey] = @recordKey
END
GO
GRANT EXECUTE ON [acgi].[spCreateCommitteePosition] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Committee Positions */

GRANT EXECUTE ON [acgi].[spCreateCommitteePosition] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Committee Positions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Committee Positions
-- Item: spUpdateCommitteePosition
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CommitteePosition
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spUpdateCommitteePosition]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spUpdateCommitteePosition];
GO

CREATE PROCEDURE [acgi].[spUpdateCommitteePosition]
    @committeeGroup_Clear bit = 0,
    @committeeGroup nvarchar(255) = NULL,
    @committeeDescr_Clear bit = 0,
    @committeeDescr nvarchar(255) = NULL,
    @committeeGrpDescr_Clear bit = 0,
    @committeeGrpDescr nvarchar(255) = NULL,
    @custId_Clear bit = 0,
    @custId nvarchar(255) = NULL,
    @startDate_Clear bit = 0,
    @startDate nvarchar(255) = NULL,
    @positionDescr_Clear bit = 0,
    @positionDescr nvarchar(255) = NULL,
    @subgroupName_Clear bit = 0,
    @subgroupName nvarchar(255) = NULL,
    @positionSerno_Clear bit = 0,
    @positionSerno nvarchar(255) = NULL,
    @recordKey nvarchar(255),
    @subgroupId_Clear bit = 0,
    @subgroupId nvarchar(255) = NULL,
    @endDate_Clear bit = 0,
    @endDate nvarchar(255) = NULL,
    @positionCode_Clear bit = 0,
    @positionCode nvarchar(255) = NULL,
    @committeeType_Clear bit = 0,
    @committeeType nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [acgi].[CommitteePosition]
    SET
        [committeeGroup] = CASE WHEN @committeeGroup_Clear = 1 THEN NULL ELSE ISNULL(@committeeGroup, [committeeGroup]) END,
        [committeeDescr] = CASE WHEN @committeeDescr_Clear = 1 THEN NULL ELSE ISNULL(@committeeDescr, [committeeDescr]) END,
        [committeeGrpDescr] = CASE WHEN @committeeGrpDescr_Clear = 1 THEN NULL ELSE ISNULL(@committeeGrpDescr, [committeeGrpDescr]) END,
        [custId] = CASE WHEN @custId_Clear = 1 THEN NULL ELSE ISNULL(@custId, [custId]) END,
        [startDate] = CASE WHEN @startDate_Clear = 1 THEN NULL ELSE ISNULL(@startDate, [startDate]) END,
        [positionDescr] = CASE WHEN @positionDescr_Clear = 1 THEN NULL ELSE ISNULL(@positionDescr, [positionDescr]) END,
        [subgroupName] = CASE WHEN @subgroupName_Clear = 1 THEN NULL ELSE ISNULL(@subgroupName, [subgroupName]) END,
        [positionSerno] = CASE WHEN @positionSerno_Clear = 1 THEN NULL ELSE ISNULL(@positionSerno, [positionSerno]) END,
        [subgroupId] = CASE WHEN @subgroupId_Clear = 1 THEN NULL ELSE ISNULL(@subgroupId, [subgroupId]) END,
        [endDate] = CASE WHEN @endDate_Clear = 1 THEN NULL ELSE ISNULL(@endDate, [endDate]) END,
        [positionCode] = CASE WHEN @positionCode_Clear = 1 THEN NULL ELSE ISNULL(@positionCode, [positionCode]) END,
        [committeeType] = CASE WHEN @committeeType_Clear = 1 THEN NULL ELSE ISNULL(@committeeType, [committeeType]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [recordKey] = @recordKey

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [acgi].[vwCommitteePositions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [acgi].[vwCommitteePositions]
                                    WHERE
                                        [recordKey] = @recordKey
                                    
END
GO

GRANT EXECUTE ON [acgi].[spUpdateCommitteePosition] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CommitteePosition table
------------------------------------------------------------
IF OBJECT_ID('[acgi].[trgUpdateCommitteePosition]', 'TR') IS NOT NULL
    DROP TRIGGER [acgi].[trgUpdateCommitteePosition];
GO
CREATE TRIGGER [acgi].trgUpdateCommitteePosition
ON [acgi].[CommitteePosition]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [acgi].[CommitteePosition]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [acgi].[CommitteePosition] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[recordKey] = I.[recordKey];
END;
GO

/* spUpdate Permissions for Committee Positions */

GRANT EXECUTE ON [acgi].[spUpdateCommitteePosition] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Addresses */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Addresses
-- Item: spDeleteAddress
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Address
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spDeleteAddress]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spDeleteAddress];
GO

CREATE PROCEDURE [acgi].[spDeleteAddress]
    @recordKey nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [acgi].[Address]
    WHERE
        [recordKey] = @recordKey


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [recordKey] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @recordKey AS [recordKey] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [acgi].[spDeleteAddress] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Addresses */

GRANT EXECUTE ON [acgi].[spDeleteAddress] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Alias */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Alias
-- Item: spDeleteAlias
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Alias
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spDeleteAlias]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spDeleteAlias];
GO

CREATE PROCEDURE [acgi].[spDeleteAlias]
    @recordKey nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [acgi].[Alias]
    WHERE
        [recordKey] = @recordKey


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [recordKey] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @recordKey AS [recordKey] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [acgi].[spDeleteAlias] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Alias */

GRANT EXECUTE ON [acgi].[spDeleteAlias] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Bios */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Bios
-- Item: spDeleteBio
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Bio
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spDeleteBio]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spDeleteBio];
GO

CREATE PROCEDURE [acgi].[spDeleteBio]
    @recordKey nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [acgi].[Bio]
    WHERE
        [recordKey] = @recordKey


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [recordKey] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @recordKey AS [recordKey] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [acgi].[spDeleteBio] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Bios */

GRANT EXECUTE ON [acgi].[spDeleteBio] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Certifications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Certifications
-- Item: spDeleteCertification
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Certification
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spDeleteCertification]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spDeleteCertification];
GO

CREATE PROCEDURE [acgi].[spDeleteCertification]
    @recordKey nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [acgi].[Certification]
    WHERE
        [recordKey] = @recordKey


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [recordKey] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @recordKey AS [recordKey] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [acgi].[spDeleteCertification] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Certifications */

GRANT EXECUTE ON [acgi].[spDeleteCertification] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Committee Positions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Committee Positions
-- Item: spDeleteCommitteePosition
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CommitteePosition
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spDeleteCommitteePosition]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spDeleteCommitteePosition];
GO

CREATE PROCEDURE [acgi].[spDeleteCommitteePosition]
    @recordKey nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [acgi].[CommitteePosition]
    WHERE
        [recordKey] = @recordKey


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [recordKey] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @recordKey AS [recordKey] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [acgi].[spDeleteCommitteePosition] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Committee Positions */

GRANT EXECUTE ON [acgi].[spDeleteCommitteePosition] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for CommunicationPreference */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Communication Preferences
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key custId in table CommunicationPreference
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CommunicationPreference_custId' 
    AND object_id = OBJECT_ID('[acgi].[CommunicationPreference]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CommunicationPreference_custId ON [acgi].[CommunicationPreference] ([custId]);

/* Index for Foreign Keys for CompanyAdmin */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Company Admins
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key custId in table CompanyAdmin
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CompanyAdmin_custId' 
    AND object_id = OBJECT_ID('[acgi].[CompanyAdmin]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CompanyAdmin_custId ON [acgi].[CompanyAdmin] ([custId]);

/* Index for Foreign Keys for CustomerAttribute */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Customer Attributes
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key custId in table CustomerAttribute
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CustomerAttribute_custId' 
    AND object_id = OBJECT_ID('[acgi].[CustomerAttribute]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CustomerAttribute_custId ON [acgi].[CustomerAttribute] ([custId]);

/* Index for Foreign Keys for CustomerDimAttr */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Customer Dim Attrs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key custId in table CustomerDimAttr
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CustomerDimAttr_custId' 
    AND object_id = OBJECT_ID('[acgi].[CustomerDimAttr]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CustomerDimAttr_custId ON [acgi].[CustomerDimAttr] ([custId]);

/* Index for Foreign Keys for CustomerFile */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Customer Files
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key custId in table CustomerFile
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CustomerFile_custId' 
    AND object_id = OBJECT_ID('[acgi].[CustomerFile]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CustomerFile_custId ON [acgi].[CustomerFile] ([custId]);

/* Base View SQL for Communication Preferences */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Communication Preferences
-- Item: vwCommunicationPreferences
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Communication Preferences
-----               SCHEMA:      acgi
-----               BASE TABLE:  CommunicationPreference
-----               PRIMARY KEY: recordKey
------------------------------------------------------------
IF OBJECT_ID('[acgi].[vwCommunicationPreferences]', 'V') IS NOT NULL
    DROP VIEW [acgi].[vwCommunicationPreferences];
GO

CREATE VIEW [acgi].[vwCommunicationPreferences]
AS
SELECT
    c.*
FROM
    [acgi].[CommunicationPreference] AS c
GO
GRANT SELECT ON [acgi].[vwCommunicationPreferences] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Communication Preferences */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Communication Preferences
-- Item: Permissions for vwCommunicationPreferences
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [acgi].[vwCommunicationPreferences] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Communication Preferences */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Communication Preferences
-- Item: spCreateCommunicationPreference
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CommunicationPreference
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spCreateCommunicationPreference]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spCreateCommunicationPreference];
GO

CREATE PROCEDURE [acgi].[spCreateCommunicationPreference]
    @preferredEmail_Clear bit = 0,
    @preferredEmail nvarchar(255) = NULL,
    @subcategoryCode_Clear bit = 0,
    @subcategoryCode nvarchar(255) = NULL,
    @subcategoryDescr_Clear bit = 0,
    @subcategoryDescr nvarchar(255) = NULL,
    @categoryDescr_Clear bit = 0,
    @categoryDescr nvarchar(255) = NULL,
    @globalOptOut_Clear bit = 0,
    @globalOptOut nvarchar(255) = NULL,
    @custId_Clear bit = 0,
    @custId nvarchar(255) = NULL,
    @categoryCode_Clear bit = 0,
    @categoryCode nvarchar(255) = NULL,
    @recordKey nvarchar(255) = NULL,
    @receiveEmail_Clear bit = 0,
    @receiveEmail nvarchar(255) = NULL,
    @preferredEmailSerno_Clear bit = 0,
    @preferredEmailSerno nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [acgi].[CommunicationPreference]
        (
            [preferredEmail],
                [subcategoryCode],
                [subcategoryDescr],
                [categoryDescr],
                [globalOptOut],
                [custId],
                [categoryCode],
                [receiveEmail],
                [preferredEmailSerno],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [recordKey]
        )
    VALUES
        (
            CASE WHEN @preferredEmail_Clear = 1 THEN NULL ELSE ISNULL(@preferredEmail, NULL) END,
                CASE WHEN @subcategoryCode_Clear = 1 THEN NULL ELSE ISNULL(@subcategoryCode, NULL) END,
                CASE WHEN @subcategoryDescr_Clear = 1 THEN NULL ELSE ISNULL(@subcategoryDescr, NULL) END,
                CASE WHEN @categoryDescr_Clear = 1 THEN NULL ELSE ISNULL(@categoryDescr, NULL) END,
                CASE WHEN @globalOptOut_Clear = 1 THEN NULL ELSE ISNULL(@globalOptOut, NULL) END,
                CASE WHEN @custId_Clear = 1 THEN NULL ELSE ISNULL(@custId, NULL) END,
                CASE WHEN @categoryCode_Clear = 1 THEN NULL ELSE ISNULL(@categoryCode, NULL) END,
                CASE WHEN @receiveEmail_Clear = 1 THEN NULL ELSE ISNULL(@receiveEmail, NULL) END,
                CASE WHEN @preferredEmailSerno_Clear = 1 THEN NULL ELSE ISNULL(@preferredEmailSerno, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @recordKey
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [acgi].[vwCommunicationPreferences] WHERE [recordKey] = @recordKey
END
GO
GRANT EXECUTE ON [acgi].[spCreateCommunicationPreference] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Communication Preferences */

GRANT EXECUTE ON [acgi].[spCreateCommunicationPreference] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Communication Preferences */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Communication Preferences
-- Item: spUpdateCommunicationPreference
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CommunicationPreference
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spUpdateCommunicationPreference]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spUpdateCommunicationPreference];
GO

CREATE PROCEDURE [acgi].[spUpdateCommunicationPreference]
    @preferredEmail_Clear bit = 0,
    @preferredEmail nvarchar(255) = NULL,
    @subcategoryCode_Clear bit = 0,
    @subcategoryCode nvarchar(255) = NULL,
    @subcategoryDescr_Clear bit = 0,
    @subcategoryDescr nvarchar(255) = NULL,
    @categoryDescr_Clear bit = 0,
    @categoryDescr nvarchar(255) = NULL,
    @globalOptOut_Clear bit = 0,
    @globalOptOut nvarchar(255) = NULL,
    @custId_Clear bit = 0,
    @custId nvarchar(255) = NULL,
    @categoryCode_Clear bit = 0,
    @categoryCode nvarchar(255) = NULL,
    @recordKey nvarchar(255),
    @receiveEmail_Clear bit = 0,
    @receiveEmail nvarchar(255) = NULL,
    @preferredEmailSerno_Clear bit = 0,
    @preferredEmailSerno nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [acgi].[CommunicationPreference]
    SET
        [preferredEmail] = CASE WHEN @preferredEmail_Clear = 1 THEN NULL ELSE ISNULL(@preferredEmail, [preferredEmail]) END,
        [subcategoryCode] = CASE WHEN @subcategoryCode_Clear = 1 THEN NULL ELSE ISNULL(@subcategoryCode, [subcategoryCode]) END,
        [subcategoryDescr] = CASE WHEN @subcategoryDescr_Clear = 1 THEN NULL ELSE ISNULL(@subcategoryDescr, [subcategoryDescr]) END,
        [categoryDescr] = CASE WHEN @categoryDescr_Clear = 1 THEN NULL ELSE ISNULL(@categoryDescr, [categoryDescr]) END,
        [globalOptOut] = CASE WHEN @globalOptOut_Clear = 1 THEN NULL ELSE ISNULL(@globalOptOut, [globalOptOut]) END,
        [custId] = CASE WHEN @custId_Clear = 1 THEN NULL ELSE ISNULL(@custId, [custId]) END,
        [categoryCode] = CASE WHEN @categoryCode_Clear = 1 THEN NULL ELSE ISNULL(@categoryCode, [categoryCode]) END,
        [receiveEmail] = CASE WHEN @receiveEmail_Clear = 1 THEN NULL ELSE ISNULL(@receiveEmail, [receiveEmail]) END,
        [preferredEmailSerno] = CASE WHEN @preferredEmailSerno_Clear = 1 THEN NULL ELSE ISNULL(@preferredEmailSerno, [preferredEmailSerno]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [recordKey] = @recordKey

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [acgi].[vwCommunicationPreferences] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [acgi].[vwCommunicationPreferences]
                                    WHERE
                                        [recordKey] = @recordKey
                                    
END
GO

GRANT EXECUTE ON [acgi].[spUpdateCommunicationPreference] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CommunicationPreference table
------------------------------------------------------------
IF OBJECT_ID('[acgi].[trgUpdateCommunicationPreference]', 'TR') IS NOT NULL
    DROP TRIGGER [acgi].[trgUpdateCommunicationPreference];
GO
CREATE TRIGGER [acgi].trgUpdateCommunicationPreference
ON [acgi].[CommunicationPreference]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [acgi].[CommunicationPreference]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [acgi].[CommunicationPreference] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[recordKey] = I.[recordKey];
END;
GO

/* spUpdate Permissions for Communication Preferences */

GRANT EXECUTE ON [acgi].[spUpdateCommunicationPreference] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Company Admins */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Company Admins
-- Item: vwCompanyAdmins
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Company Admins
-----               SCHEMA:      acgi
-----               BASE TABLE:  CompanyAdmin
-----               PRIMARY KEY: recordKey, id
------------------------------------------------------------
IF OBJECT_ID('[acgi].[vwCompanyAdmins]', 'V') IS NOT NULL
    DROP VIEW [acgi].[vwCompanyAdmins];
GO

CREATE VIEW [acgi].[vwCompanyAdmins]
AS
SELECT
    c.*
FROM
    [acgi].[CompanyAdmin] AS c
GO
GRANT SELECT ON [acgi].[vwCompanyAdmins] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Company Admins */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Company Admins
-- Item: Permissions for vwCompanyAdmins
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [acgi].[vwCompanyAdmins] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Company Admins */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Company Admins
-- Item: spCreateCompanyAdmin
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CompanyAdmin
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spCreateCompanyAdmin]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spCreateCompanyAdmin];
GO

CREATE PROCEDURE [acgi].[spCreateCompanyAdmin]
    @recordKey nvarchar(255) = NULL,
    @custId_Clear bit = 0,
    @custId nvarchar(255) = NULL,
    @displayNm_Clear bit = 0,
    @displayNm nvarchar(255) = NULL,
    @id nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [acgi].[CompanyAdmin]
        (
            [custId],
                [displayNm],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [recordKey],
                [id]
        )
    VALUES
        (
            CASE WHEN @custId_Clear = 1 THEN NULL ELSE ISNULL(@custId, NULL) END,
                CASE WHEN @displayNm_Clear = 1 THEN NULL ELSE ISNULL(@displayNm, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @recordKey,
                @id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [acgi].[vwCompanyAdmins] WHERE [recordKey] = @recordKey AND [id] = @id
END
GO
GRANT EXECUTE ON [acgi].[spCreateCompanyAdmin] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Company Admins */

GRANT EXECUTE ON [acgi].[spCreateCompanyAdmin] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Company Admins */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Company Admins
-- Item: spUpdateCompanyAdmin
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CompanyAdmin
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spUpdateCompanyAdmin]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spUpdateCompanyAdmin];
GO

CREATE PROCEDURE [acgi].[spUpdateCompanyAdmin]
    @recordKey nvarchar(255),
    @custId_Clear bit = 0,
    @custId nvarchar(255) = NULL,
    @displayNm_Clear bit = 0,
    @displayNm nvarchar(255) = NULL,
    @id nvarchar(255),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [acgi].[CompanyAdmin]
    SET
        [custId] = CASE WHEN @custId_Clear = 1 THEN NULL ELSE ISNULL(@custId, [custId]) END,
        [displayNm] = CASE WHEN @displayNm_Clear = 1 THEN NULL ELSE ISNULL(@displayNm, [displayNm]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [recordKey] = @recordKey AND [id] = @id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [acgi].[vwCompanyAdmins] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [acgi].[vwCompanyAdmins]
                                    WHERE
                                        [recordKey] = @recordKey AND [id] = @id
                                    
END
GO

GRANT EXECUTE ON [acgi].[spUpdateCompanyAdmin] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CompanyAdmin table
------------------------------------------------------------
IF OBJECT_ID('[acgi].[trgUpdateCompanyAdmin]', 'TR') IS NOT NULL
    DROP TRIGGER [acgi].[trgUpdateCompanyAdmin];
GO
CREATE TRIGGER [acgi].trgUpdateCompanyAdmin
ON [acgi].[CompanyAdmin]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [acgi].[CompanyAdmin]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [acgi].[CompanyAdmin] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[recordKey] = I.[recordKey] AND _organicTable.[id] = I.[id];
END;
GO

/* spUpdate Permissions for Company Admins */

GRANT EXECUTE ON [acgi].[spUpdateCompanyAdmin] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Customer Attributes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Customer Attributes
-- Item: vwCustomerAttributes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Customer Attributes
-----               SCHEMA:      acgi
-----               BASE TABLE:  CustomerAttribute
-----               PRIMARY KEY: recordKey
------------------------------------------------------------
IF OBJECT_ID('[acgi].[vwCustomerAttributes]', 'V') IS NOT NULL
    DROP VIEW [acgi].[vwCustomerAttributes];
GO

CREATE VIEW [acgi].[vwCustomerAttributes]
AS
SELECT
    c.*
FROM
    [acgi].[CustomerAttribute] AS c
GO
GRANT SELECT ON [acgi].[vwCustomerAttributes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Customer Attributes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Customer Attributes
-- Item: Permissions for vwCustomerAttributes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [acgi].[vwCustomerAttributes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Customer Attributes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Customer Attributes
-- Item: spCreateCustomerAttribute
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CustomerAttribute
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spCreateCustomerAttribute]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spCreateCustomerAttribute];
GO

CREATE PROCEDURE [acgi].[spCreateCustomerAttribute]
    @typeName_Clear bit = 0,
    @typeName nvarchar(255) = NULL,
    @URLtoFile_Clear bit = 0,
    @URLtoFile nvarchar(255) = NULL,
    @URLtoThumbnail_Clear bit = 0,
    @URLtoThumbnail nvarchar(255) = NULL,
    @lockCode_Clear bit = 0,
    @lockCode nvarchar(255) = NULL,
    @code_Clear bit = 0,
    @code nvarchar(255) = NULL,
    @char_Clear bit = 0,
    @char nvarchar(255) = NULL,
    @custId_Clear bit = 0,
    @custId nvarchar(255) = NULL,
    @number_Clear bit = 0,
    @number nvarchar(255) = NULL,
    @recordKey nvarchar(255) = NULL,
    @date_Clear bit = 0,
    @date nvarchar(255) = NULL,
    @codeDescr_Clear bit = 0,
    @codeDescr nvarchar(255) = NULL,
    @type_Clear bit = 0,
    @type nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [acgi].[CustomerAttribute]
        (
            [typeName],
                [URLtoFile],
                [URLtoThumbnail],
                [lockCode],
                [code],
                [char],
                [custId],
                [number],
                [date],
                [codeDescr],
                [type],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [recordKey]
        )
    VALUES
        (
            CASE WHEN @typeName_Clear = 1 THEN NULL ELSE ISNULL(@typeName, NULL) END,
                CASE WHEN @URLtoFile_Clear = 1 THEN NULL ELSE ISNULL(@URLtoFile, NULL) END,
                CASE WHEN @URLtoThumbnail_Clear = 1 THEN NULL ELSE ISNULL(@URLtoThumbnail, NULL) END,
                CASE WHEN @lockCode_Clear = 1 THEN NULL ELSE ISNULL(@lockCode, NULL) END,
                CASE WHEN @code_Clear = 1 THEN NULL ELSE ISNULL(@code, NULL) END,
                CASE WHEN @char_Clear = 1 THEN NULL ELSE ISNULL(@char, NULL) END,
                CASE WHEN @custId_Clear = 1 THEN NULL ELSE ISNULL(@custId, NULL) END,
                CASE WHEN @number_Clear = 1 THEN NULL ELSE ISNULL(@number, NULL) END,
                CASE WHEN @date_Clear = 1 THEN NULL ELSE ISNULL(@date, NULL) END,
                CASE WHEN @codeDescr_Clear = 1 THEN NULL ELSE ISNULL(@codeDescr, NULL) END,
                CASE WHEN @type_Clear = 1 THEN NULL ELSE ISNULL(@type, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @recordKey
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [acgi].[vwCustomerAttributes] WHERE [recordKey] = @recordKey
END
GO
GRANT EXECUTE ON [acgi].[spCreateCustomerAttribute] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Customer Attributes */

GRANT EXECUTE ON [acgi].[spCreateCustomerAttribute] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Customer Attributes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Customer Attributes
-- Item: spUpdateCustomerAttribute
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CustomerAttribute
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spUpdateCustomerAttribute]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spUpdateCustomerAttribute];
GO

CREATE PROCEDURE [acgi].[spUpdateCustomerAttribute]
    @typeName_Clear bit = 0,
    @typeName nvarchar(255) = NULL,
    @URLtoFile_Clear bit = 0,
    @URLtoFile nvarchar(255) = NULL,
    @URLtoThumbnail_Clear bit = 0,
    @URLtoThumbnail nvarchar(255) = NULL,
    @lockCode_Clear bit = 0,
    @lockCode nvarchar(255) = NULL,
    @code_Clear bit = 0,
    @code nvarchar(255) = NULL,
    @char_Clear bit = 0,
    @char nvarchar(255) = NULL,
    @custId_Clear bit = 0,
    @custId nvarchar(255) = NULL,
    @number_Clear bit = 0,
    @number nvarchar(255) = NULL,
    @recordKey nvarchar(255),
    @date_Clear bit = 0,
    @date nvarchar(255) = NULL,
    @codeDescr_Clear bit = 0,
    @codeDescr nvarchar(255) = NULL,
    @type_Clear bit = 0,
    @type nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [acgi].[CustomerAttribute]
    SET
        [typeName] = CASE WHEN @typeName_Clear = 1 THEN NULL ELSE ISNULL(@typeName, [typeName]) END,
        [URLtoFile] = CASE WHEN @URLtoFile_Clear = 1 THEN NULL ELSE ISNULL(@URLtoFile, [URLtoFile]) END,
        [URLtoThumbnail] = CASE WHEN @URLtoThumbnail_Clear = 1 THEN NULL ELSE ISNULL(@URLtoThumbnail, [URLtoThumbnail]) END,
        [lockCode] = CASE WHEN @lockCode_Clear = 1 THEN NULL ELSE ISNULL(@lockCode, [lockCode]) END,
        [code] = CASE WHEN @code_Clear = 1 THEN NULL ELSE ISNULL(@code, [code]) END,
        [char] = CASE WHEN @char_Clear = 1 THEN NULL ELSE ISNULL(@char, [char]) END,
        [custId] = CASE WHEN @custId_Clear = 1 THEN NULL ELSE ISNULL(@custId, [custId]) END,
        [number] = CASE WHEN @number_Clear = 1 THEN NULL ELSE ISNULL(@number, [number]) END,
        [date] = CASE WHEN @date_Clear = 1 THEN NULL ELSE ISNULL(@date, [date]) END,
        [codeDescr] = CASE WHEN @codeDescr_Clear = 1 THEN NULL ELSE ISNULL(@codeDescr, [codeDescr]) END,
        [type] = CASE WHEN @type_Clear = 1 THEN NULL ELSE ISNULL(@type, [type]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [recordKey] = @recordKey

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [acgi].[vwCustomerAttributes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [acgi].[vwCustomerAttributes]
                                    WHERE
                                        [recordKey] = @recordKey
                                    
END
GO

GRANT EXECUTE ON [acgi].[spUpdateCustomerAttribute] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CustomerAttribute table
------------------------------------------------------------
IF OBJECT_ID('[acgi].[trgUpdateCustomerAttribute]', 'TR') IS NOT NULL
    DROP TRIGGER [acgi].[trgUpdateCustomerAttribute];
GO
CREATE TRIGGER [acgi].trgUpdateCustomerAttribute
ON [acgi].[CustomerAttribute]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [acgi].[CustomerAttribute]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [acgi].[CustomerAttribute] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[recordKey] = I.[recordKey];
END;
GO

/* spUpdate Permissions for Customer Attributes */

GRANT EXECUTE ON [acgi].[spUpdateCustomerAttribute] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Customer Dim Attrs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Customer Dim Attrs
-- Item: vwCustomerDimAttrs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Customer Dim Attrs
-----               SCHEMA:      acgi
-----               BASE TABLE:  CustomerDimAttr
-----               PRIMARY KEY: recordKey
------------------------------------------------------------
IF OBJECT_ID('[acgi].[vwCustomerDimAttrs]', 'V') IS NOT NULL
    DROP VIEW [acgi].[vwCustomerDimAttrs];
GO

CREATE VIEW [acgi].[vwCustomerDimAttrs]
AS
SELECT
    c.*
FROM
    [acgi].[CustomerDimAttr] AS c
GO
GRANT SELECT ON [acgi].[vwCustomerDimAttrs] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Customer Dim Attrs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Customer Dim Attrs
-- Item: Permissions for vwCustomerDimAttrs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [acgi].[vwCustomerDimAttrs] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Customer Dim Attrs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Customer Dim Attrs
-- Item: spCreateCustomerDimAttr
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CustomerDimAttr
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spCreateCustomerDimAttr]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spCreateCustomerDimAttr];
GO

CREATE PROCEDURE [acgi].[spCreateCustomerDimAttr]
    @date_Clear bit = 0,
    @date nvarchar(255) = NULL,
    @number_Clear bit = 0,
    @number nvarchar(255) = NULL,
    @lockCode_Clear bit = 0,
    @lockCode nvarchar(255) = NULL,
    @recordKey nvarchar(255) = NULL,
    @dimensionType_Clear bit = 0,
    @dimensionType nvarchar(255) = NULL,
    @char_Clear bit = 0,
    @char nvarchar(255) = NULL,
    @custId_Clear bit = 0,
    @custId nvarchar(255) = NULL,
    @type_Clear bit = 0,
    @type nvarchar(255) = NULL,
    @dimensionCode_Clear bit = 0,
    @dimensionCode nvarchar(255) = NULL,
    @code_Clear bit = 0,
    @code nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [acgi].[CustomerDimAttr]
        (
            [date],
                [number],
                [lockCode],
                [dimensionType],
                [char],
                [custId],
                [type],
                [dimensionCode],
                [code],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [recordKey]
        )
    VALUES
        (
            CASE WHEN @date_Clear = 1 THEN NULL ELSE ISNULL(@date, NULL) END,
                CASE WHEN @number_Clear = 1 THEN NULL ELSE ISNULL(@number, NULL) END,
                CASE WHEN @lockCode_Clear = 1 THEN NULL ELSE ISNULL(@lockCode, NULL) END,
                CASE WHEN @dimensionType_Clear = 1 THEN NULL ELSE ISNULL(@dimensionType, NULL) END,
                CASE WHEN @char_Clear = 1 THEN NULL ELSE ISNULL(@char, NULL) END,
                CASE WHEN @custId_Clear = 1 THEN NULL ELSE ISNULL(@custId, NULL) END,
                CASE WHEN @type_Clear = 1 THEN NULL ELSE ISNULL(@type, NULL) END,
                CASE WHEN @dimensionCode_Clear = 1 THEN NULL ELSE ISNULL(@dimensionCode, NULL) END,
                CASE WHEN @code_Clear = 1 THEN NULL ELSE ISNULL(@code, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @recordKey
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [acgi].[vwCustomerDimAttrs] WHERE [recordKey] = @recordKey
END
GO
GRANT EXECUTE ON [acgi].[spCreateCustomerDimAttr] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Customer Dim Attrs */

GRANT EXECUTE ON [acgi].[spCreateCustomerDimAttr] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Customer Dim Attrs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Customer Dim Attrs
-- Item: spUpdateCustomerDimAttr
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CustomerDimAttr
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spUpdateCustomerDimAttr]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spUpdateCustomerDimAttr];
GO

CREATE PROCEDURE [acgi].[spUpdateCustomerDimAttr]
    @date_Clear bit = 0,
    @date nvarchar(255) = NULL,
    @number_Clear bit = 0,
    @number nvarchar(255) = NULL,
    @lockCode_Clear bit = 0,
    @lockCode nvarchar(255) = NULL,
    @recordKey nvarchar(255),
    @dimensionType_Clear bit = 0,
    @dimensionType nvarchar(255) = NULL,
    @char_Clear bit = 0,
    @char nvarchar(255) = NULL,
    @custId_Clear bit = 0,
    @custId nvarchar(255) = NULL,
    @type_Clear bit = 0,
    @type nvarchar(255) = NULL,
    @dimensionCode_Clear bit = 0,
    @dimensionCode nvarchar(255) = NULL,
    @code_Clear bit = 0,
    @code nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [acgi].[CustomerDimAttr]
    SET
        [date] = CASE WHEN @date_Clear = 1 THEN NULL ELSE ISNULL(@date, [date]) END,
        [number] = CASE WHEN @number_Clear = 1 THEN NULL ELSE ISNULL(@number, [number]) END,
        [lockCode] = CASE WHEN @lockCode_Clear = 1 THEN NULL ELSE ISNULL(@lockCode, [lockCode]) END,
        [dimensionType] = CASE WHEN @dimensionType_Clear = 1 THEN NULL ELSE ISNULL(@dimensionType, [dimensionType]) END,
        [char] = CASE WHEN @char_Clear = 1 THEN NULL ELSE ISNULL(@char, [char]) END,
        [custId] = CASE WHEN @custId_Clear = 1 THEN NULL ELSE ISNULL(@custId, [custId]) END,
        [type] = CASE WHEN @type_Clear = 1 THEN NULL ELSE ISNULL(@type, [type]) END,
        [dimensionCode] = CASE WHEN @dimensionCode_Clear = 1 THEN NULL ELSE ISNULL(@dimensionCode, [dimensionCode]) END,
        [code] = CASE WHEN @code_Clear = 1 THEN NULL ELSE ISNULL(@code, [code]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [recordKey] = @recordKey

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [acgi].[vwCustomerDimAttrs] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [acgi].[vwCustomerDimAttrs]
                                    WHERE
                                        [recordKey] = @recordKey
                                    
END
GO

GRANT EXECUTE ON [acgi].[spUpdateCustomerDimAttr] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CustomerDimAttr table
------------------------------------------------------------
IF OBJECT_ID('[acgi].[trgUpdateCustomerDimAttr]', 'TR') IS NOT NULL
    DROP TRIGGER [acgi].[trgUpdateCustomerDimAttr];
GO
CREATE TRIGGER [acgi].trgUpdateCustomerDimAttr
ON [acgi].[CustomerDimAttr]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [acgi].[CustomerDimAttr]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [acgi].[CustomerDimAttr] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[recordKey] = I.[recordKey];
END;
GO

/* spUpdate Permissions for Customer Dim Attrs */

GRANT EXECUTE ON [acgi].[spUpdateCustomerDimAttr] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Customer Files */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Customer Files
-- Item: vwCustomerFiles
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Customer Files
-----               SCHEMA:      acgi
-----               BASE TABLE:  CustomerFile
-----               PRIMARY KEY: recordKey
------------------------------------------------------------
IF OBJECT_ID('[acgi].[vwCustomerFiles]', 'V') IS NOT NULL
    DROP VIEW [acgi].[vwCustomerFiles];
GO

CREATE VIEW [acgi].[vwCustomerFiles]
AS
SELECT
    c.*
FROM
    [acgi].[CustomerFile] AS c
GO
GRANT SELECT ON [acgi].[vwCustomerFiles] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Customer Files */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Customer Files
-- Item: Permissions for vwCustomerFiles
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [acgi].[vwCustomerFiles] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Customer Files */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Customer Files
-- Item: spCreateCustomerFile
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CustomerFile
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spCreateCustomerFile]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spCreateCustomerFile];
GO

CREATE PROCEDURE [acgi].[spCreateCustomerFile]
    @mimeType_Clear bit = 0,
    @mimeType nvarchar(255) = NULL,
    @descr_Clear bit = 0,
    @descr nvarchar(255) = NULL,
    @docSize_Clear bit = 0,
    @docSize nvarchar(255) = NULL,
    @lockCode_Clear bit = 0,
    @lockCode nvarchar(255) = NULL,
    @docType_Clear bit = 0,
    @docType nvarchar(255) = NULL,
    @qual1_Clear bit = 0,
    @qual1 nvarchar(255) = NULL,
    @displayOrder_Clear bit = 0,
    @displayOrder nvarchar(255) = NULL,
    @fileName_Clear bit = 0,
    @fileName nvarchar(255) = NULL,
    @fileSerno_Clear bit = 0,
    @fileSerno nvarchar(255) = NULL,
    @urlToFileThumbnail_Clear bit = 0,
    @urlToFileThumbnail nvarchar(255) = NULL,
    @custId_Clear bit = 0,
    @custId nvarchar(255) = NULL,
    @recordKey nvarchar(255) = NULL,
    @shortName_Clear bit = 0,
    @shortName nvarchar(255) = NULL,
    @tags_Clear bit = 0,
    @tags nvarchar(255) = NULL,
    @urlToFile_Clear bit = 0,
    @urlToFile nvarchar(255) = NULL,
    @context_Clear bit = 0,
    @context nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [acgi].[CustomerFile]
        (
            [mimeType],
                [descr],
                [docSize],
                [lockCode],
                [docType],
                [qual1],
                [displayOrder],
                [fileName],
                [fileSerno],
                [urlToFileThumbnail],
                [custId],
                [shortName],
                [tags],
                [urlToFile],
                [context],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [recordKey]
        )
    VALUES
        (
            CASE WHEN @mimeType_Clear = 1 THEN NULL ELSE ISNULL(@mimeType, NULL) END,
                CASE WHEN @descr_Clear = 1 THEN NULL ELSE ISNULL(@descr, NULL) END,
                CASE WHEN @docSize_Clear = 1 THEN NULL ELSE ISNULL(@docSize, NULL) END,
                CASE WHEN @lockCode_Clear = 1 THEN NULL ELSE ISNULL(@lockCode, NULL) END,
                CASE WHEN @docType_Clear = 1 THEN NULL ELSE ISNULL(@docType, NULL) END,
                CASE WHEN @qual1_Clear = 1 THEN NULL ELSE ISNULL(@qual1, NULL) END,
                CASE WHEN @displayOrder_Clear = 1 THEN NULL ELSE ISNULL(@displayOrder, NULL) END,
                CASE WHEN @fileName_Clear = 1 THEN NULL ELSE ISNULL(@fileName, NULL) END,
                CASE WHEN @fileSerno_Clear = 1 THEN NULL ELSE ISNULL(@fileSerno, NULL) END,
                CASE WHEN @urlToFileThumbnail_Clear = 1 THEN NULL ELSE ISNULL(@urlToFileThumbnail, NULL) END,
                CASE WHEN @custId_Clear = 1 THEN NULL ELSE ISNULL(@custId, NULL) END,
                CASE WHEN @shortName_Clear = 1 THEN NULL ELSE ISNULL(@shortName, NULL) END,
                CASE WHEN @tags_Clear = 1 THEN NULL ELSE ISNULL(@tags, NULL) END,
                CASE WHEN @urlToFile_Clear = 1 THEN NULL ELSE ISNULL(@urlToFile, NULL) END,
                CASE WHEN @context_Clear = 1 THEN NULL ELSE ISNULL(@context, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @recordKey
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [acgi].[vwCustomerFiles] WHERE [recordKey] = @recordKey
END
GO
GRANT EXECUTE ON [acgi].[spCreateCustomerFile] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Customer Files */

GRANT EXECUTE ON [acgi].[spCreateCustomerFile] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Customer Files */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Customer Files
-- Item: spUpdateCustomerFile
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CustomerFile
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spUpdateCustomerFile]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spUpdateCustomerFile];
GO

CREATE PROCEDURE [acgi].[spUpdateCustomerFile]
    @mimeType_Clear bit = 0,
    @mimeType nvarchar(255) = NULL,
    @descr_Clear bit = 0,
    @descr nvarchar(255) = NULL,
    @docSize_Clear bit = 0,
    @docSize nvarchar(255) = NULL,
    @lockCode_Clear bit = 0,
    @lockCode nvarchar(255) = NULL,
    @docType_Clear bit = 0,
    @docType nvarchar(255) = NULL,
    @qual1_Clear bit = 0,
    @qual1 nvarchar(255) = NULL,
    @displayOrder_Clear bit = 0,
    @displayOrder nvarchar(255) = NULL,
    @fileName_Clear bit = 0,
    @fileName nvarchar(255) = NULL,
    @fileSerno_Clear bit = 0,
    @fileSerno nvarchar(255) = NULL,
    @urlToFileThumbnail_Clear bit = 0,
    @urlToFileThumbnail nvarchar(255) = NULL,
    @custId_Clear bit = 0,
    @custId nvarchar(255) = NULL,
    @recordKey nvarchar(255),
    @shortName_Clear bit = 0,
    @shortName nvarchar(255) = NULL,
    @tags_Clear bit = 0,
    @tags nvarchar(255) = NULL,
    @urlToFile_Clear bit = 0,
    @urlToFile nvarchar(255) = NULL,
    @context_Clear bit = 0,
    @context nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [acgi].[CustomerFile]
    SET
        [mimeType] = CASE WHEN @mimeType_Clear = 1 THEN NULL ELSE ISNULL(@mimeType, [mimeType]) END,
        [descr] = CASE WHEN @descr_Clear = 1 THEN NULL ELSE ISNULL(@descr, [descr]) END,
        [docSize] = CASE WHEN @docSize_Clear = 1 THEN NULL ELSE ISNULL(@docSize, [docSize]) END,
        [lockCode] = CASE WHEN @lockCode_Clear = 1 THEN NULL ELSE ISNULL(@lockCode, [lockCode]) END,
        [docType] = CASE WHEN @docType_Clear = 1 THEN NULL ELSE ISNULL(@docType, [docType]) END,
        [qual1] = CASE WHEN @qual1_Clear = 1 THEN NULL ELSE ISNULL(@qual1, [qual1]) END,
        [displayOrder] = CASE WHEN @displayOrder_Clear = 1 THEN NULL ELSE ISNULL(@displayOrder, [displayOrder]) END,
        [fileName] = CASE WHEN @fileName_Clear = 1 THEN NULL ELSE ISNULL(@fileName, [fileName]) END,
        [fileSerno] = CASE WHEN @fileSerno_Clear = 1 THEN NULL ELSE ISNULL(@fileSerno, [fileSerno]) END,
        [urlToFileThumbnail] = CASE WHEN @urlToFileThumbnail_Clear = 1 THEN NULL ELSE ISNULL(@urlToFileThumbnail, [urlToFileThumbnail]) END,
        [custId] = CASE WHEN @custId_Clear = 1 THEN NULL ELSE ISNULL(@custId, [custId]) END,
        [shortName] = CASE WHEN @shortName_Clear = 1 THEN NULL ELSE ISNULL(@shortName, [shortName]) END,
        [tags] = CASE WHEN @tags_Clear = 1 THEN NULL ELSE ISNULL(@tags, [tags]) END,
        [urlToFile] = CASE WHEN @urlToFile_Clear = 1 THEN NULL ELSE ISNULL(@urlToFile, [urlToFile]) END,
        [context] = CASE WHEN @context_Clear = 1 THEN NULL ELSE ISNULL(@context, [context]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [recordKey] = @recordKey

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [acgi].[vwCustomerFiles] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [acgi].[vwCustomerFiles]
                                    WHERE
                                        [recordKey] = @recordKey
                                    
END
GO

GRANT EXECUTE ON [acgi].[spUpdateCustomerFile] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CustomerFile table
------------------------------------------------------------
IF OBJECT_ID('[acgi].[trgUpdateCustomerFile]', 'TR') IS NOT NULL
    DROP TRIGGER [acgi].[trgUpdateCustomerFile];
GO
CREATE TRIGGER [acgi].trgUpdateCustomerFile
ON [acgi].[CustomerFile]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [acgi].[CustomerFile]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [acgi].[CustomerFile] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[recordKey] = I.[recordKey];
END;
GO

/* spUpdate Permissions for Customer Files */

GRANT EXECUTE ON [acgi].[spUpdateCustomerFile] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Communication Preferences */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Communication Preferences
-- Item: spDeleteCommunicationPreference
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CommunicationPreference
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spDeleteCommunicationPreference]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spDeleteCommunicationPreference];
GO

CREATE PROCEDURE [acgi].[spDeleteCommunicationPreference]
    @recordKey nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [acgi].[CommunicationPreference]
    WHERE
        [recordKey] = @recordKey


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [recordKey] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @recordKey AS [recordKey] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [acgi].[spDeleteCommunicationPreference] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Communication Preferences */

GRANT EXECUTE ON [acgi].[spDeleteCommunicationPreference] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Company Admins */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Company Admins
-- Item: spDeleteCompanyAdmin
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CompanyAdmin
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spDeleteCompanyAdmin]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spDeleteCompanyAdmin];
GO

CREATE PROCEDURE [acgi].[spDeleteCompanyAdmin]
    @recordKey nvarchar(255), @id nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [acgi].[CompanyAdmin]
    WHERE
        [recordKey] = @recordKey AND [id] = @id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [recordKey], NULL AS [id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @recordKey AS [recordKey], @id AS [id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [acgi].[spDeleteCompanyAdmin] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Company Admins */

GRANT EXECUTE ON [acgi].[spDeleteCompanyAdmin] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Customer Attributes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Customer Attributes
-- Item: spDeleteCustomerAttribute
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CustomerAttribute
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spDeleteCustomerAttribute]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spDeleteCustomerAttribute];
GO

CREATE PROCEDURE [acgi].[spDeleteCustomerAttribute]
    @recordKey nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [acgi].[CustomerAttribute]
    WHERE
        [recordKey] = @recordKey


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [recordKey] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @recordKey AS [recordKey] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [acgi].[spDeleteCustomerAttribute] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Customer Attributes */

GRANT EXECUTE ON [acgi].[spDeleteCustomerAttribute] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Customer Dim Attrs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Customer Dim Attrs
-- Item: spDeleteCustomerDimAttr
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CustomerDimAttr
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spDeleteCustomerDimAttr]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spDeleteCustomerDimAttr];
GO

CREATE PROCEDURE [acgi].[spDeleteCustomerDimAttr]
    @recordKey nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [acgi].[CustomerDimAttr]
    WHERE
        [recordKey] = @recordKey


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [recordKey] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @recordKey AS [recordKey] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [acgi].[spDeleteCustomerDimAttr] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Customer Dim Attrs */

GRANT EXECUTE ON [acgi].[spDeleteCustomerDimAttr] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Customer Files */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Customer Files
-- Item: spDeleteCustomerFile
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CustomerFile
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spDeleteCustomerFile]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spDeleteCustomerFile];
GO

CREATE PROCEDURE [acgi].[spDeleteCustomerFile]
    @recordKey nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [acgi].[CustomerFile]
    WHERE
        [recordKey] = @recordKey


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [recordKey] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @recordKey AS [recordKey] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [acgi].[spDeleteCustomerFile] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Customer Files */

GRANT EXECUTE ON [acgi].[spDeleteCustomerFile] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for CustomerRole */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Customer Roles
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key custId in table CustomerRole
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CustomerRole_custId' 
    AND object_id = OBJECT_ID('[acgi].[CustomerRole]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CustomerRole_custId ON [acgi].[CustomerRole] ([custId]);

/* Index for Foreign Keys for Customer */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Customers
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for DirectoryOptOut */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Directory Opt Outs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key custId in table DirectoryOptOut
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DirectoryOptOut_custId' 
    AND object_id = OBJECT_ID('[acgi].[DirectoryOptOut]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DirectoryOptOut_custId ON [acgi].[DirectoryOptOut] ([custId]);

/* Index for Foreign Keys for Email */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Emails
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key custId in table Email
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Email_custId' 
    AND object_id = OBJECT_ID('[acgi].[Email]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Email_custId ON [acgi].[Email] ([custId]);

/* Index for Foreign Keys for Employee */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Employees
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key custId in table Employee
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Employee_custId' 
    AND object_id = OBJECT_ID('[acgi].[Employee]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Employee_custId ON [acgi].[Employee] ([custId]);

/* Base View SQL for Customer Roles */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Customer Roles
-- Item: vwCustomerRoles
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Customer Roles
-----               SCHEMA:      acgi
-----               BASE TABLE:  CustomerRole
-----               PRIMARY KEY: recordKey
------------------------------------------------------------
IF OBJECT_ID('[acgi].[vwCustomerRoles]', 'V') IS NOT NULL
    DROP VIEW [acgi].[vwCustomerRoles];
GO

CREATE VIEW [acgi].[vwCustomerRoles]
AS
SELECT
    c.*
FROM
    [acgi].[CustomerRole] AS c
GO
GRANT SELECT ON [acgi].[vwCustomerRoles] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Customer Roles */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Customer Roles
-- Item: Permissions for vwCustomerRoles
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [acgi].[vwCustomerRoles] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Customer Roles */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Customer Roles
-- Item: spCreateCustomerRole
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CustomerRole
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spCreateCustomerRole]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spCreateCustomerRole];
GO

CREATE PROCEDURE [acgi].[spCreateCustomerRole]
    @role_Clear bit = 0,
    @role nvarchar(255) = NULL,
    @custId_Clear bit = 0,
    @custId nvarchar(255) = NULL,
    @recordKey nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [acgi].[CustomerRole]
        (
            [role],
                [custId],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [recordKey]
        )
    VALUES
        (
            CASE WHEN @role_Clear = 1 THEN NULL ELSE ISNULL(@role, NULL) END,
                CASE WHEN @custId_Clear = 1 THEN NULL ELSE ISNULL(@custId, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @recordKey
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [acgi].[vwCustomerRoles] WHERE [recordKey] = @recordKey
END
GO
GRANT EXECUTE ON [acgi].[spCreateCustomerRole] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Customer Roles */

GRANT EXECUTE ON [acgi].[spCreateCustomerRole] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Customer Roles */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Customer Roles
-- Item: spUpdateCustomerRole
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CustomerRole
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spUpdateCustomerRole]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spUpdateCustomerRole];
GO

CREATE PROCEDURE [acgi].[spUpdateCustomerRole]
    @role_Clear bit = 0,
    @role nvarchar(255) = NULL,
    @custId_Clear bit = 0,
    @custId nvarchar(255) = NULL,
    @recordKey nvarchar(255),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [acgi].[CustomerRole]
    SET
        [role] = CASE WHEN @role_Clear = 1 THEN NULL ELSE ISNULL(@role, [role]) END,
        [custId] = CASE WHEN @custId_Clear = 1 THEN NULL ELSE ISNULL(@custId, [custId]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [recordKey] = @recordKey

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [acgi].[vwCustomerRoles] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [acgi].[vwCustomerRoles]
                                    WHERE
                                        [recordKey] = @recordKey
                                    
END
GO

GRANT EXECUTE ON [acgi].[spUpdateCustomerRole] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CustomerRole table
------------------------------------------------------------
IF OBJECT_ID('[acgi].[trgUpdateCustomerRole]', 'TR') IS NOT NULL
    DROP TRIGGER [acgi].[trgUpdateCustomerRole];
GO
CREATE TRIGGER [acgi].trgUpdateCustomerRole
ON [acgi].[CustomerRole]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [acgi].[CustomerRole]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [acgi].[CustomerRole] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[recordKey] = I.[recordKey];
END;
GO

/* spUpdate Permissions for Customer Roles */

GRANT EXECUTE ON [acgi].[spUpdateCustomerRole] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Customers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Customers
-- Item: vwCustomers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Customers
-----               SCHEMA:      acgi
-----               BASE TABLE:  Customer
-----               PRIMARY KEY: recordKey
------------------------------------------------------------
IF OBJECT_ID('[acgi].[vwCustomers]', 'V') IS NOT NULL
    DROP VIEW [acgi].[vwCustomers];
GO

CREATE VIEW [acgi].[vwCustomers]
AS
SELECT
    c.*
FROM
    [acgi].[Customer] AS c
GO
GRANT SELECT ON [acgi].[vwCustomers] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Customers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Customers
-- Item: Permissions for vwCustomers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [acgi].[vwCustomers] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Customers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Customers
-- Item: spCreateCustomer
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Customer
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spCreateCustomer]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spCreateCustomer];
GO

CREATE PROCEDURE [acgi].[spCreateCustomer]
    @displayName_Clear bit = 0,
    @displayName nvarchar(255) = NULL,
    @custId_Clear bit = 0,
    @custId nvarchar(255) = NULL,
    @suffixName_Clear bit = 0,
    @suffixName nvarchar(255) = NULL,
    @middleName_Clear bit = 0,
    @middleName nvarchar(255) = NULL,
    @prefixName_Clear bit = 0,
    @prefixName nvarchar(255) = NULL,
    @loginId_Clear bit = 0,
    @loginId nvarchar(255) = NULL,
    @createDate_Clear bit = 0,
    @createDate nvarchar(255) = NULL,
    @lastName_Clear bit = 0,
    @lastName nvarchar(255) = NULL,
    @custType_Clear bit = 0,
    @custType nvarchar(255) = NULL,
    @informalName_Clear bit = 0,
    @informalName nvarchar(255) = NULL,
    @firstName_Clear bit = 0,
    @firstName nvarchar(255) = NULL,
    @recordKey nvarchar(255) = NULL,
    @toBePurged_Clear bit = 0,
    @toBePurged nvarchar(255) = NULL,
    @lockCode_Clear bit = 0,
    @lockCode nvarchar(255) = NULL,
    @degreeName_Clear bit = 0,
    @degreeName nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [acgi].[Customer]
        (
            [displayName],
                [custId],
                [suffixName],
                [middleName],
                [prefixName],
                [loginId],
                [createDate],
                [lastName],
                [custType],
                [informalName],
                [firstName],
                [toBePurged],
                [lockCode],
                [degreeName],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [recordKey]
        )
    VALUES
        (
            CASE WHEN @displayName_Clear = 1 THEN NULL ELSE ISNULL(@displayName, NULL) END,
                CASE WHEN @custId_Clear = 1 THEN NULL ELSE ISNULL(@custId, NULL) END,
                CASE WHEN @suffixName_Clear = 1 THEN NULL ELSE ISNULL(@suffixName, NULL) END,
                CASE WHEN @middleName_Clear = 1 THEN NULL ELSE ISNULL(@middleName, NULL) END,
                CASE WHEN @prefixName_Clear = 1 THEN NULL ELSE ISNULL(@prefixName, NULL) END,
                CASE WHEN @loginId_Clear = 1 THEN NULL ELSE ISNULL(@loginId, NULL) END,
                CASE WHEN @createDate_Clear = 1 THEN NULL ELSE ISNULL(@createDate, NULL) END,
                CASE WHEN @lastName_Clear = 1 THEN NULL ELSE ISNULL(@lastName, NULL) END,
                CASE WHEN @custType_Clear = 1 THEN NULL ELSE ISNULL(@custType, NULL) END,
                CASE WHEN @informalName_Clear = 1 THEN NULL ELSE ISNULL(@informalName, NULL) END,
                CASE WHEN @firstName_Clear = 1 THEN NULL ELSE ISNULL(@firstName, NULL) END,
                CASE WHEN @toBePurged_Clear = 1 THEN NULL ELSE ISNULL(@toBePurged, NULL) END,
                CASE WHEN @lockCode_Clear = 1 THEN NULL ELSE ISNULL(@lockCode, NULL) END,
                CASE WHEN @degreeName_Clear = 1 THEN NULL ELSE ISNULL(@degreeName, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @recordKey
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [acgi].[vwCustomers] WHERE [recordKey] = @recordKey
END
GO
GRANT EXECUTE ON [acgi].[spCreateCustomer] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Customers */

GRANT EXECUTE ON [acgi].[spCreateCustomer] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Customers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Customers
-- Item: spUpdateCustomer
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Customer
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spUpdateCustomer]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spUpdateCustomer];
GO

CREATE PROCEDURE [acgi].[spUpdateCustomer]
    @displayName_Clear bit = 0,
    @displayName nvarchar(255) = NULL,
    @custId_Clear bit = 0,
    @custId nvarchar(255) = NULL,
    @suffixName_Clear bit = 0,
    @suffixName nvarchar(255) = NULL,
    @middleName_Clear bit = 0,
    @middleName nvarchar(255) = NULL,
    @prefixName_Clear bit = 0,
    @prefixName nvarchar(255) = NULL,
    @loginId_Clear bit = 0,
    @loginId nvarchar(255) = NULL,
    @createDate_Clear bit = 0,
    @createDate nvarchar(255) = NULL,
    @lastName_Clear bit = 0,
    @lastName nvarchar(255) = NULL,
    @custType_Clear bit = 0,
    @custType nvarchar(255) = NULL,
    @informalName_Clear bit = 0,
    @informalName nvarchar(255) = NULL,
    @firstName_Clear bit = 0,
    @firstName nvarchar(255) = NULL,
    @recordKey nvarchar(255),
    @toBePurged_Clear bit = 0,
    @toBePurged nvarchar(255) = NULL,
    @lockCode_Clear bit = 0,
    @lockCode nvarchar(255) = NULL,
    @degreeName_Clear bit = 0,
    @degreeName nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [acgi].[Customer]
    SET
        [displayName] = CASE WHEN @displayName_Clear = 1 THEN NULL ELSE ISNULL(@displayName, [displayName]) END,
        [custId] = CASE WHEN @custId_Clear = 1 THEN NULL ELSE ISNULL(@custId, [custId]) END,
        [suffixName] = CASE WHEN @suffixName_Clear = 1 THEN NULL ELSE ISNULL(@suffixName, [suffixName]) END,
        [middleName] = CASE WHEN @middleName_Clear = 1 THEN NULL ELSE ISNULL(@middleName, [middleName]) END,
        [prefixName] = CASE WHEN @prefixName_Clear = 1 THEN NULL ELSE ISNULL(@prefixName, [prefixName]) END,
        [loginId] = CASE WHEN @loginId_Clear = 1 THEN NULL ELSE ISNULL(@loginId, [loginId]) END,
        [createDate] = CASE WHEN @createDate_Clear = 1 THEN NULL ELSE ISNULL(@createDate, [createDate]) END,
        [lastName] = CASE WHEN @lastName_Clear = 1 THEN NULL ELSE ISNULL(@lastName, [lastName]) END,
        [custType] = CASE WHEN @custType_Clear = 1 THEN NULL ELSE ISNULL(@custType, [custType]) END,
        [informalName] = CASE WHEN @informalName_Clear = 1 THEN NULL ELSE ISNULL(@informalName, [informalName]) END,
        [firstName] = CASE WHEN @firstName_Clear = 1 THEN NULL ELSE ISNULL(@firstName, [firstName]) END,
        [toBePurged] = CASE WHEN @toBePurged_Clear = 1 THEN NULL ELSE ISNULL(@toBePurged, [toBePurged]) END,
        [lockCode] = CASE WHEN @lockCode_Clear = 1 THEN NULL ELSE ISNULL(@lockCode, [lockCode]) END,
        [degreeName] = CASE WHEN @degreeName_Clear = 1 THEN NULL ELSE ISNULL(@degreeName, [degreeName]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [recordKey] = @recordKey

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [acgi].[vwCustomers] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [acgi].[vwCustomers]
                                    WHERE
                                        [recordKey] = @recordKey
                                    
END
GO

GRANT EXECUTE ON [acgi].[spUpdateCustomer] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Customer table
------------------------------------------------------------
IF OBJECT_ID('[acgi].[trgUpdateCustomer]', 'TR') IS NOT NULL
    DROP TRIGGER [acgi].[trgUpdateCustomer];
GO
CREATE TRIGGER [acgi].trgUpdateCustomer
ON [acgi].[Customer]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [acgi].[Customer]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [acgi].[Customer] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[recordKey] = I.[recordKey];
END;
GO

/* spUpdate Permissions for Customers */

GRANT EXECUTE ON [acgi].[spUpdateCustomer] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Directory Opt Outs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Directory Opt Outs
-- Item: vwDirectoryOptOuts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Directory Opt Outs
-----               SCHEMA:      acgi
-----               BASE TABLE:  DirectoryOptOut
-----               PRIMARY KEY: recordKey
------------------------------------------------------------
IF OBJECT_ID('[acgi].[vwDirectoryOptOuts]', 'V') IS NOT NULL
    DROP VIEW [acgi].[vwDirectoryOptOuts];
GO

CREATE VIEW [acgi].[vwDirectoryOptOuts]
AS
SELECT
    d.*
FROM
    [acgi].[DirectoryOptOut] AS d
GO
GRANT SELECT ON [acgi].[vwDirectoryOptOuts] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Directory Opt Outs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Directory Opt Outs
-- Item: Permissions for vwDirectoryOptOuts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [acgi].[vwDirectoryOptOuts] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Directory Opt Outs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Directory Opt Outs
-- Item: spCreateDirectoryOptOut
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR DirectoryOptOut
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spCreateDirectoryOptOut]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spCreateDirectoryOptOut];
GO

CREATE PROCEDURE [acgi].[spCreateDirectoryOptOut]
    @custId_Clear bit = 0,
    @custId nvarchar(255) = NULL,
    @opt_out_Clear bit = 0,
    @opt_out nvarchar(255) = NULL,
    @directory_id_Clear bit = 0,
    @directory_id nvarchar(255) = NULL,
    @recordKey nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [acgi].[DirectoryOptOut]
        (
            [custId],
                [opt_out],
                [directory_id],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [recordKey]
        )
    VALUES
        (
            CASE WHEN @custId_Clear = 1 THEN NULL ELSE ISNULL(@custId, NULL) END,
                CASE WHEN @opt_out_Clear = 1 THEN NULL ELSE ISNULL(@opt_out, NULL) END,
                CASE WHEN @directory_id_Clear = 1 THEN NULL ELSE ISNULL(@directory_id, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @recordKey
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [acgi].[vwDirectoryOptOuts] WHERE [recordKey] = @recordKey
END
GO
GRANT EXECUTE ON [acgi].[spCreateDirectoryOptOut] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Directory Opt Outs */

GRANT EXECUTE ON [acgi].[spCreateDirectoryOptOut] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Directory Opt Outs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Directory Opt Outs
-- Item: spUpdateDirectoryOptOut
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR DirectoryOptOut
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spUpdateDirectoryOptOut]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spUpdateDirectoryOptOut];
GO

CREATE PROCEDURE [acgi].[spUpdateDirectoryOptOut]
    @custId_Clear bit = 0,
    @custId nvarchar(255) = NULL,
    @opt_out_Clear bit = 0,
    @opt_out nvarchar(255) = NULL,
    @directory_id_Clear bit = 0,
    @directory_id nvarchar(255) = NULL,
    @recordKey nvarchar(255),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [acgi].[DirectoryOptOut]
    SET
        [custId] = CASE WHEN @custId_Clear = 1 THEN NULL ELSE ISNULL(@custId, [custId]) END,
        [opt_out] = CASE WHEN @opt_out_Clear = 1 THEN NULL ELSE ISNULL(@opt_out, [opt_out]) END,
        [directory_id] = CASE WHEN @directory_id_Clear = 1 THEN NULL ELSE ISNULL(@directory_id, [directory_id]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [recordKey] = @recordKey

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [acgi].[vwDirectoryOptOuts] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [acgi].[vwDirectoryOptOuts]
                                    WHERE
                                        [recordKey] = @recordKey
                                    
END
GO

GRANT EXECUTE ON [acgi].[spUpdateDirectoryOptOut] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the DirectoryOptOut table
------------------------------------------------------------
IF OBJECT_ID('[acgi].[trgUpdateDirectoryOptOut]', 'TR') IS NOT NULL
    DROP TRIGGER [acgi].[trgUpdateDirectoryOptOut];
GO
CREATE TRIGGER [acgi].trgUpdateDirectoryOptOut
ON [acgi].[DirectoryOptOut]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [acgi].[DirectoryOptOut]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [acgi].[DirectoryOptOut] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[recordKey] = I.[recordKey];
END;
GO

/* spUpdate Permissions for Directory Opt Outs */

GRANT EXECUTE ON [acgi].[spUpdateDirectoryOptOut] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Emails */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Emails
-- Item: vwEmails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Emails
-----               SCHEMA:      acgi
-----               BASE TABLE:  Email
-----               PRIMARY KEY: recordKey
------------------------------------------------------------
IF OBJECT_ID('[acgi].[vwEmails]', 'V') IS NOT NULL
    DROP VIEW [acgi].[vwEmails];
GO

CREATE VIEW [acgi].[vwEmails]
AS
SELECT
    e.*
FROM
    [acgi].[Email] AS e
GO
GRANT SELECT ON [acgi].[vwEmails] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Emails */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Emails
-- Item: Permissions for vwEmails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [acgi].[vwEmails] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Emails */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Emails
-- Item: spCreateEmail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Email
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spCreateEmail]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spCreateEmail];
GO

CREATE PROCEDURE [acgi].[spCreateEmail]
    @badAddress_Clear bit = 0,
    @badAddress nvarchar(255) = NULL,
    @emailSerno_Clear bit = 0,
    @emailSerno nvarchar(255) = NULL,
    @lockCode_Clear bit = 0,
    @lockCode nvarchar(255) = NULL,
    @custId_Clear bit = 0,
    @custId nvarchar(255) = NULL,
    @recordKey nvarchar(255) = NULL,
    @remark_Clear bit = 0,
    @remark nvarchar(255) = NULL,
    @emailTypeDescr_Clear bit = 0,
    @emailTypeDescr nvarchar(255) = NULL,
    @emailType_Clear bit = 0,
    @emailType nvarchar(255) = NULL,
    @preferred_Clear bit = 0,
    @preferred nvarchar(255) = NULL,
    @address_Clear bit = 0,
    @address nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [acgi].[Email]
        (
            [badAddress],
                [emailSerno],
                [lockCode],
                [custId],
                [remark],
                [emailTypeDescr],
                [emailType],
                [preferred],
                [address],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [recordKey]
        )
    VALUES
        (
            CASE WHEN @badAddress_Clear = 1 THEN NULL ELSE ISNULL(@badAddress, NULL) END,
                CASE WHEN @emailSerno_Clear = 1 THEN NULL ELSE ISNULL(@emailSerno, NULL) END,
                CASE WHEN @lockCode_Clear = 1 THEN NULL ELSE ISNULL(@lockCode, NULL) END,
                CASE WHEN @custId_Clear = 1 THEN NULL ELSE ISNULL(@custId, NULL) END,
                CASE WHEN @remark_Clear = 1 THEN NULL ELSE ISNULL(@remark, NULL) END,
                CASE WHEN @emailTypeDescr_Clear = 1 THEN NULL ELSE ISNULL(@emailTypeDescr, NULL) END,
                CASE WHEN @emailType_Clear = 1 THEN NULL ELSE ISNULL(@emailType, NULL) END,
                CASE WHEN @preferred_Clear = 1 THEN NULL ELSE ISNULL(@preferred, NULL) END,
                CASE WHEN @address_Clear = 1 THEN NULL ELSE ISNULL(@address, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @recordKey
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [acgi].[vwEmails] WHERE [recordKey] = @recordKey
END
GO
GRANT EXECUTE ON [acgi].[spCreateEmail] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Emails */

GRANT EXECUTE ON [acgi].[spCreateEmail] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Emails */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Emails
-- Item: spUpdateEmail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Email
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spUpdateEmail]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spUpdateEmail];
GO

CREATE PROCEDURE [acgi].[spUpdateEmail]
    @badAddress_Clear bit = 0,
    @badAddress nvarchar(255) = NULL,
    @emailSerno_Clear bit = 0,
    @emailSerno nvarchar(255) = NULL,
    @lockCode_Clear bit = 0,
    @lockCode nvarchar(255) = NULL,
    @custId_Clear bit = 0,
    @custId nvarchar(255) = NULL,
    @recordKey nvarchar(255),
    @remark_Clear bit = 0,
    @remark nvarchar(255) = NULL,
    @emailTypeDescr_Clear bit = 0,
    @emailTypeDescr nvarchar(255) = NULL,
    @emailType_Clear bit = 0,
    @emailType nvarchar(255) = NULL,
    @preferred_Clear bit = 0,
    @preferred nvarchar(255) = NULL,
    @address_Clear bit = 0,
    @address nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [acgi].[Email]
    SET
        [badAddress] = CASE WHEN @badAddress_Clear = 1 THEN NULL ELSE ISNULL(@badAddress, [badAddress]) END,
        [emailSerno] = CASE WHEN @emailSerno_Clear = 1 THEN NULL ELSE ISNULL(@emailSerno, [emailSerno]) END,
        [lockCode] = CASE WHEN @lockCode_Clear = 1 THEN NULL ELSE ISNULL(@lockCode, [lockCode]) END,
        [custId] = CASE WHEN @custId_Clear = 1 THEN NULL ELSE ISNULL(@custId, [custId]) END,
        [remark] = CASE WHEN @remark_Clear = 1 THEN NULL ELSE ISNULL(@remark, [remark]) END,
        [emailTypeDescr] = CASE WHEN @emailTypeDescr_Clear = 1 THEN NULL ELSE ISNULL(@emailTypeDescr, [emailTypeDescr]) END,
        [emailType] = CASE WHEN @emailType_Clear = 1 THEN NULL ELSE ISNULL(@emailType, [emailType]) END,
        [preferred] = CASE WHEN @preferred_Clear = 1 THEN NULL ELSE ISNULL(@preferred, [preferred]) END,
        [address] = CASE WHEN @address_Clear = 1 THEN NULL ELSE ISNULL(@address, [address]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [recordKey] = @recordKey

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [acgi].[vwEmails] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [acgi].[vwEmails]
                                    WHERE
                                        [recordKey] = @recordKey
                                    
END
GO

GRANT EXECUTE ON [acgi].[spUpdateEmail] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Email table
------------------------------------------------------------
IF OBJECT_ID('[acgi].[trgUpdateEmail]', 'TR') IS NOT NULL
    DROP TRIGGER [acgi].[trgUpdateEmail];
GO
CREATE TRIGGER [acgi].trgUpdateEmail
ON [acgi].[Email]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [acgi].[Email]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [acgi].[Email] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[recordKey] = I.[recordKey];
END;
GO

/* spUpdate Permissions for Emails */

GRANT EXECUTE ON [acgi].[spUpdateEmail] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Employees */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Employees
-- Item: vwEmployees
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Employees
-----               SCHEMA:      acgi
-----               BASE TABLE:  Employee
-----               PRIMARY KEY: recordKey, id
------------------------------------------------------------
IF OBJECT_ID('[acgi].[vwEmployees]', 'V') IS NOT NULL
    DROP VIEW [acgi].[vwEmployees];
GO

CREATE VIEW [acgi].[vwEmployees]
AS
SELECT
    e.*
FROM
    [acgi].[Employee] AS e
GO
GRANT SELECT ON [acgi].[vwEmployees] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Employees */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Employees
-- Item: Permissions for vwEmployees
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [acgi].[vwEmployees] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Employees */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Employees
-- Item: spCreateEmployee
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Employee
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spCreateEmployee]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spCreateEmployee];
GO

CREATE PROCEDURE [acgi].[spCreateEmployee]
    @employeeAttributes_Clear bit = 0,
    @employeeAttributes nvarchar(255) = NULL,
    @recordKey nvarchar(255) = NULL,
    @id nvarchar(255) = NULL,
    @functionDescr_Clear bit = 0,
    @functionDescr nvarchar(255) = NULL,
    @lastName_Clear bit = 0,
    @lastName nvarchar(255) = NULL,
    @titleCodeDescr_Clear bit = 0,
    @titleCodeDescr nvarchar(255) = NULL,
    @custId_Clear bit = 0,
    @custId nvarchar(255) = NULL,
    @firstName_Clear bit = 0,
    @firstName nvarchar(255) = NULL,
    @titleCode_Clear bit = 0,
    @titleCode nvarchar(255) = NULL,
    @lockCode_Clear bit = 0,
    @lockCode nvarchar(255) = NULL,
    @displayName_Clear bit = 0,
    @displayName nvarchar(255) = NULL,
    @administrator_Clear bit = 0,
    @administrator nvarchar(255) = NULL,
    @functionCode_Clear bit = 0,
    @functionCode nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [acgi].[Employee]
        (
            [employeeAttributes],
                [functionDescr],
                [lastName],
                [titleCodeDescr],
                [custId],
                [firstName],
                [titleCode],
                [lockCode],
                [displayName],
                [administrator],
                [functionCode],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [recordKey],
                [id]
        )
    VALUES
        (
            CASE WHEN @employeeAttributes_Clear = 1 THEN NULL ELSE ISNULL(@employeeAttributes, NULL) END,
                CASE WHEN @functionDescr_Clear = 1 THEN NULL ELSE ISNULL(@functionDescr, NULL) END,
                CASE WHEN @lastName_Clear = 1 THEN NULL ELSE ISNULL(@lastName, NULL) END,
                CASE WHEN @titleCodeDescr_Clear = 1 THEN NULL ELSE ISNULL(@titleCodeDescr, NULL) END,
                CASE WHEN @custId_Clear = 1 THEN NULL ELSE ISNULL(@custId, NULL) END,
                CASE WHEN @firstName_Clear = 1 THEN NULL ELSE ISNULL(@firstName, NULL) END,
                CASE WHEN @titleCode_Clear = 1 THEN NULL ELSE ISNULL(@titleCode, NULL) END,
                CASE WHEN @lockCode_Clear = 1 THEN NULL ELSE ISNULL(@lockCode, NULL) END,
                CASE WHEN @displayName_Clear = 1 THEN NULL ELSE ISNULL(@displayName, NULL) END,
                CASE WHEN @administrator_Clear = 1 THEN NULL ELSE ISNULL(@administrator, NULL) END,
                CASE WHEN @functionCode_Clear = 1 THEN NULL ELSE ISNULL(@functionCode, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @recordKey,
                @id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [acgi].[vwEmployees] WHERE [recordKey] = @recordKey AND [id] = @id
END
GO
GRANT EXECUTE ON [acgi].[spCreateEmployee] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Employees */

GRANT EXECUTE ON [acgi].[spCreateEmployee] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Employees */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Employees
-- Item: spUpdateEmployee
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Employee
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spUpdateEmployee]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spUpdateEmployee];
GO

CREATE PROCEDURE [acgi].[spUpdateEmployee]
    @employeeAttributes_Clear bit = 0,
    @employeeAttributes nvarchar(255) = NULL,
    @recordKey nvarchar(255),
    @id nvarchar(255),
    @functionDescr_Clear bit = 0,
    @functionDescr nvarchar(255) = NULL,
    @lastName_Clear bit = 0,
    @lastName nvarchar(255) = NULL,
    @titleCodeDescr_Clear bit = 0,
    @titleCodeDescr nvarchar(255) = NULL,
    @custId_Clear bit = 0,
    @custId nvarchar(255) = NULL,
    @firstName_Clear bit = 0,
    @firstName nvarchar(255) = NULL,
    @titleCode_Clear bit = 0,
    @titleCode nvarchar(255) = NULL,
    @lockCode_Clear bit = 0,
    @lockCode nvarchar(255) = NULL,
    @displayName_Clear bit = 0,
    @displayName nvarchar(255) = NULL,
    @administrator_Clear bit = 0,
    @administrator nvarchar(255) = NULL,
    @functionCode_Clear bit = 0,
    @functionCode nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [acgi].[Employee]
    SET
        [employeeAttributes] = CASE WHEN @employeeAttributes_Clear = 1 THEN NULL ELSE ISNULL(@employeeAttributes, [employeeAttributes]) END,
        [functionDescr] = CASE WHEN @functionDescr_Clear = 1 THEN NULL ELSE ISNULL(@functionDescr, [functionDescr]) END,
        [lastName] = CASE WHEN @lastName_Clear = 1 THEN NULL ELSE ISNULL(@lastName, [lastName]) END,
        [titleCodeDescr] = CASE WHEN @titleCodeDescr_Clear = 1 THEN NULL ELSE ISNULL(@titleCodeDescr, [titleCodeDescr]) END,
        [custId] = CASE WHEN @custId_Clear = 1 THEN NULL ELSE ISNULL(@custId, [custId]) END,
        [firstName] = CASE WHEN @firstName_Clear = 1 THEN NULL ELSE ISNULL(@firstName, [firstName]) END,
        [titleCode] = CASE WHEN @titleCode_Clear = 1 THEN NULL ELSE ISNULL(@titleCode, [titleCode]) END,
        [lockCode] = CASE WHEN @lockCode_Clear = 1 THEN NULL ELSE ISNULL(@lockCode, [lockCode]) END,
        [displayName] = CASE WHEN @displayName_Clear = 1 THEN NULL ELSE ISNULL(@displayName, [displayName]) END,
        [administrator] = CASE WHEN @administrator_Clear = 1 THEN NULL ELSE ISNULL(@administrator, [administrator]) END,
        [functionCode] = CASE WHEN @functionCode_Clear = 1 THEN NULL ELSE ISNULL(@functionCode, [functionCode]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [recordKey] = @recordKey AND [id] = @id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [acgi].[vwEmployees] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [acgi].[vwEmployees]
                                    WHERE
                                        [recordKey] = @recordKey AND [id] = @id
                                    
END
GO

GRANT EXECUTE ON [acgi].[spUpdateEmployee] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Employee table
------------------------------------------------------------
IF OBJECT_ID('[acgi].[trgUpdateEmployee]', 'TR') IS NOT NULL
    DROP TRIGGER [acgi].[trgUpdateEmployee];
GO
CREATE TRIGGER [acgi].trgUpdateEmployee
ON [acgi].[Employee]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [acgi].[Employee]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [acgi].[Employee] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[recordKey] = I.[recordKey] AND _organicTable.[id] = I.[id];
END;
GO

/* spUpdate Permissions for Employees */

GRANT EXECUTE ON [acgi].[spUpdateEmployee] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Customer Roles */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Customer Roles
-- Item: spDeleteCustomerRole
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CustomerRole
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spDeleteCustomerRole]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spDeleteCustomerRole];
GO

CREATE PROCEDURE [acgi].[spDeleteCustomerRole]
    @recordKey nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [acgi].[CustomerRole]
    WHERE
        [recordKey] = @recordKey


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [recordKey] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @recordKey AS [recordKey] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [acgi].[spDeleteCustomerRole] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Customer Roles */

GRANT EXECUTE ON [acgi].[spDeleteCustomerRole] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Customers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Customers
-- Item: spDeleteCustomer
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Customer
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spDeleteCustomer]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spDeleteCustomer];
GO

CREATE PROCEDURE [acgi].[spDeleteCustomer]
    @recordKey nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [acgi].[Customer]
    WHERE
        [recordKey] = @recordKey


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [recordKey] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @recordKey AS [recordKey] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [acgi].[spDeleteCustomer] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Customers */

GRANT EXECUTE ON [acgi].[spDeleteCustomer] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Directory Opt Outs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Directory Opt Outs
-- Item: spDeleteDirectoryOptOut
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR DirectoryOptOut
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spDeleteDirectoryOptOut]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spDeleteDirectoryOptOut];
GO

CREATE PROCEDURE [acgi].[spDeleteDirectoryOptOut]
    @recordKey nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [acgi].[DirectoryOptOut]
    WHERE
        [recordKey] = @recordKey


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [recordKey] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @recordKey AS [recordKey] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [acgi].[spDeleteDirectoryOptOut] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Directory Opt Outs */

GRANT EXECUTE ON [acgi].[spDeleteDirectoryOptOut] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Emails */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Emails
-- Item: spDeleteEmail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Email
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spDeleteEmail]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spDeleteEmail];
GO

CREATE PROCEDURE [acgi].[spDeleteEmail]
    @recordKey nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [acgi].[Email]
    WHERE
        [recordKey] = @recordKey


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [recordKey] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @recordKey AS [recordKey] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [acgi].[spDeleteEmail] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Emails */

GRANT EXECUTE ON [acgi].[spDeleteEmail] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Employees */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Employees
-- Item: spDeleteEmployee
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Employee
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spDeleteEmployee]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spDeleteEmployee];
GO

CREATE PROCEDURE [acgi].[spDeleteEmployee]
    @recordKey nvarchar(255), @id nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [acgi].[Employee]
    WHERE
        [recordKey] = @recordKey AND [id] = @id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [recordKey], NULL AS [id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @recordKey AS [recordKey], @id AS [id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [acgi].[spDeleteEmployee] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Employees */

GRANT EXECUTE ON [acgi].[spDeleteEmployee] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for Job */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Jobs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key custId in table Job
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Job_custId' 
    AND object_id = OBJECT_ID('[acgi].[Job]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Job_custId ON [acgi].[Job] ([custId]);

/* Index for Foreign Keys for Membership */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Memberships
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key custId in table Membership
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Membership_custId' 
    AND object_id = OBJECT_ID('[acgi].[Membership]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Membership_custId ON [acgi].[Membership] ([custId]);

/* Base View SQL for Jobs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Jobs
-- Item: vwJobs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Jobs
-----               SCHEMA:      acgi
-----               BASE TABLE:  Job
-----               PRIMARY KEY: recordKey
------------------------------------------------------------
IF OBJECT_ID('[acgi].[vwJobs]', 'V') IS NOT NULL
    DROP VIEW [acgi].[vwJobs];
GO

CREATE VIEW [acgi].[vwJobs]
AS
SELECT
    j.*
FROM
    [acgi].[Job] AS j
GO
GRANT SELECT ON [acgi].[vwJobs] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Jobs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Jobs
-- Item: Permissions for vwJobs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [acgi].[vwJobs] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Jobs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Jobs
-- Item: spCreateJob
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Job
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spCreateJob]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spCreateJob];
GO

CREATE PROCEDURE [acgi].[spCreateJob]
    @custId_Clear bit = 0,
    @custId nvarchar(255) = NULL,
    @employerId_Clear bit = 0,
    @employerId nvarchar(255) = NULL,
    @titleNameLong_Clear bit = 0,
    @titleNameLong nvarchar(255) = NULL,
    @lockCode_Clear bit = 0,
    @lockCode nvarchar(255) = NULL,
    @titleName_Clear bit = 0,
    @titleName nvarchar(255) = NULL,
    @functionDescr_Clear bit = 0,
    @functionDescr nvarchar(255) = NULL,
    @employmentSerno_Clear bit = 0,
    @employmentSerno nvarchar(255) = NULL,
    @remark_Clear bit = 0,
    @remark nvarchar(255) = NULL,
    @employerName_Clear bit = 0,
    @employerName nvarchar(255) = NULL,
    @functionCode_Clear bit = 0,
    @functionCode nvarchar(255) = NULL,
    @titleCode_Clear bit = 0,
    @titleCode nvarchar(255) = NULL,
    @endDate_Clear bit = 0,
    @endDate nvarchar(255) = NULL,
    @employmentAttributes_Clear bit = 0,
    @employmentAttributes nvarchar(255) = NULL,
    @hoursPerWeek_Clear bit = 0,
    @hoursPerWeek nvarchar(255) = NULL,
    @employerCustTyDescr_Clear bit = 0,
    @employerCustTyDescr nvarchar(255) = NULL,
    @preferred_Clear bit = 0,
    @preferred nvarchar(255) = NULL,
    @employerCustTy_Clear bit = 0,
    @employerCustTy nvarchar(255) = NULL,
    @titleCodeDescr_Clear bit = 0,
    @titleCodeDescr nvarchar(255) = NULL,
    @startDate_Clear bit = 0,
    @startDate nvarchar(255) = NULL,
    @recordKey nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [acgi].[Job]
        (
            [custId],
                [employerId],
                [titleNameLong],
                [lockCode],
                [titleName],
                [functionDescr],
                [employmentSerno],
                [remark],
                [employerName],
                [functionCode],
                [titleCode],
                [endDate],
                [employmentAttributes],
                [hoursPerWeek],
                [employerCustTyDescr],
                [preferred],
                [employerCustTy],
                [titleCodeDescr],
                [startDate],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [recordKey]
        )
    VALUES
        (
            CASE WHEN @custId_Clear = 1 THEN NULL ELSE ISNULL(@custId, NULL) END,
                CASE WHEN @employerId_Clear = 1 THEN NULL ELSE ISNULL(@employerId, NULL) END,
                CASE WHEN @titleNameLong_Clear = 1 THEN NULL ELSE ISNULL(@titleNameLong, NULL) END,
                CASE WHEN @lockCode_Clear = 1 THEN NULL ELSE ISNULL(@lockCode, NULL) END,
                CASE WHEN @titleName_Clear = 1 THEN NULL ELSE ISNULL(@titleName, NULL) END,
                CASE WHEN @functionDescr_Clear = 1 THEN NULL ELSE ISNULL(@functionDescr, NULL) END,
                CASE WHEN @employmentSerno_Clear = 1 THEN NULL ELSE ISNULL(@employmentSerno, NULL) END,
                CASE WHEN @remark_Clear = 1 THEN NULL ELSE ISNULL(@remark, NULL) END,
                CASE WHEN @employerName_Clear = 1 THEN NULL ELSE ISNULL(@employerName, NULL) END,
                CASE WHEN @functionCode_Clear = 1 THEN NULL ELSE ISNULL(@functionCode, NULL) END,
                CASE WHEN @titleCode_Clear = 1 THEN NULL ELSE ISNULL(@titleCode, NULL) END,
                CASE WHEN @endDate_Clear = 1 THEN NULL ELSE ISNULL(@endDate, NULL) END,
                CASE WHEN @employmentAttributes_Clear = 1 THEN NULL ELSE ISNULL(@employmentAttributes, NULL) END,
                CASE WHEN @hoursPerWeek_Clear = 1 THEN NULL ELSE ISNULL(@hoursPerWeek, NULL) END,
                CASE WHEN @employerCustTyDescr_Clear = 1 THEN NULL ELSE ISNULL(@employerCustTyDescr, NULL) END,
                CASE WHEN @preferred_Clear = 1 THEN NULL ELSE ISNULL(@preferred, NULL) END,
                CASE WHEN @employerCustTy_Clear = 1 THEN NULL ELSE ISNULL(@employerCustTy, NULL) END,
                CASE WHEN @titleCodeDescr_Clear = 1 THEN NULL ELSE ISNULL(@titleCodeDescr, NULL) END,
                CASE WHEN @startDate_Clear = 1 THEN NULL ELSE ISNULL(@startDate, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @recordKey
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [acgi].[vwJobs] WHERE [recordKey] = @recordKey
END
GO
GRANT EXECUTE ON [acgi].[spCreateJob] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Jobs */

GRANT EXECUTE ON [acgi].[spCreateJob] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Jobs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Jobs
-- Item: spUpdateJob
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Job
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spUpdateJob]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spUpdateJob];
GO

CREATE PROCEDURE [acgi].[spUpdateJob]
    @custId_Clear bit = 0,
    @custId nvarchar(255) = NULL,
    @employerId_Clear bit = 0,
    @employerId nvarchar(255) = NULL,
    @titleNameLong_Clear bit = 0,
    @titleNameLong nvarchar(255) = NULL,
    @lockCode_Clear bit = 0,
    @lockCode nvarchar(255) = NULL,
    @titleName_Clear bit = 0,
    @titleName nvarchar(255) = NULL,
    @functionDescr_Clear bit = 0,
    @functionDescr nvarchar(255) = NULL,
    @employmentSerno_Clear bit = 0,
    @employmentSerno nvarchar(255) = NULL,
    @remark_Clear bit = 0,
    @remark nvarchar(255) = NULL,
    @employerName_Clear bit = 0,
    @employerName nvarchar(255) = NULL,
    @functionCode_Clear bit = 0,
    @functionCode nvarchar(255) = NULL,
    @titleCode_Clear bit = 0,
    @titleCode nvarchar(255) = NULL,
    @endDate_Clear bit = 0,
    @endDate nvarchar(255) = NULL,
    @employmentAttributes_Clear bit = 0,
    @employmentAttributes nvarchar(255) = NULL,
    @hoursPerWeek_Clear bit = 0,
    @hoursPerWeek nvarchar(255) = NULL,
    @employerCustTyDescr_Clear bit = 0,
    @employerCustTyDescr nvarchar(255) = NULL,
    @preferred_Clear bit = 0,
    @preferred nvarchar(255) = NULL,
    @employerCustTy_Clear bit = 0,
    @employerCustTy nvarchar(255) = NULL,
    @titleCodeDescr_Clear bit = 0,
    @titleCodeDescr nvarchar(255) = NULL,
    @startDate_Clear bit = 0,
    @startDate nvarchar(255) = NULL,
    @recordKey nvarchar(255),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [acgi].[Job]
    SET
        [custId] = CASE WHEN @custId_Clear = 1 THEN NULL ELSE ISNULL(@custId, [custId]) END,
        [employerId] = CASE WHEN @employerId_Clear = 1 THEN NULL ELSE ISNULL(@employerId, [employerId]) END,
        [titleNameLong] = CASE WHEN @titleNameLong_Clear = 1 THEN NULL ELSE ISNULL(@titleNameLong, [titleNameLong]) END,
        [lockCode] = CASE WHEN @lockCode_Clear = 1 THEN NULL ELSE ISNULL(@lockCode, [lockCode]) END,
        [titleName] = CASE WHEN @titleName_Clear = 1 THEN NULL ELSE ISNULL(@titleName, [titleName]) END,
        [functionDescr] = CASE WHEN @functionDescr_Clear = 1 THEN NULL ELSE ISNULL(@functionDescr, [functionDescr]) END,
        [employmentSerno] = CASE WHEN @employmentSerno_Clear = 1 THEN NULL ELSE ISNULL(@employmentSerno, [employmentSerno]) END,
        [remark] = CASE WHEN @remark_Clear = 1 THEN NULL ELSE ISNULL(@remark, [remark]) END,
        [employerName] = CASE WHEN @employerName_Clear = 1 THEN NULL ELSE ISNULL(@employerName, [employerName]) END,
        [functionCode] = CASE WHEN @functionCode_Clear = 1 THEN NULL ELSE ISNULL(@functionCode, [functionCode]) END,
        [titleCode] = CASE WHEN @titleCode_Clear = 1 THEN NULL ELSE ISNULL(@titleCode, [titleCode]) END,
        [endDate] = CASE WHEN @endDate_Clear = 1 THEN NULL ELSE ISNULL(@endDate, [endDate]) END,
        [employmentAttributes] = CASE WHEN @employmentAttributes_Clear = 1 THEN NULL ELSE ISNULL(@employmentAttributes, [employmentAttributes]) END,
        [hoursPerWeek] = CASE WHEN @hoursPerWeek_Clear = 1 THEN NULL ELSE ISNULL(@hoursPerWeek, [hoursPerWeek]) END,
        [employerCustTyDescr] = CASE WHEN @employerCustTyDescr_Clear = 1 THEN NULL ELSE ISNULL(@employerCustTyDescr, [employerCustTyDescr]) END,
        [preferred] = CASE WHEN @preferred_Clear = 1 THEN NULL ELSE ISNULL(@preferred, [preferred]) END,
        [employerCustTy] = CASE WHEN @employerCustTy_Clear = 1 THEN NULL ELSE ISNULL(@employerCustTy, [employerCustTy]) END,
        [titleCodeDescr] = CASE WHEN @titleCodeDescr_Clear = 1 THEN NULL ELSE ISNULL(@titleCodeDescr, [titleCodeDescr]) END,
        [startDate] = CASE WHEN @startDate_Clear = 1 THEN NULL ELSE ISNULL(@startDate, [startDate]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [recordKey] = @recordKey

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [acgi].[vwJobs] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [acgi].[vwJobs]
                                    WHERE
                                        [recordKey] = @recordKey
                                    
END
GO

GRANT EXECUTE ON [acgi].[spUpdateJob] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Job table
------------------------------------------------------------
IF OBJECT_ID('[acgi].[trgUpdateJob]', 'TR') IS NOT NULL
    DROP TRIGGER [acgi].[trgUpdateJob];
GO
CREATE TRIGGER [acgi].trgUpdateJob
ON [acgi].[Job]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [acgi].[Job]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [acgi].[Job] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[recordKey] = I.[recordKey];
END;
GO

/* spUpdate Permissions for Jobs */

GRANT EXECUTE ON [acgi].[spUpdateJob] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Memberships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Memberships
-- Item: vwMemberships
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Memberships
-----               SCHEMA:      acgi
-----               BASE TABLE:  Membership
-----               PRIMARY KEY: recordKey
------------------------------------------------------------
IF OBJECT_ID('[acgi].[vwMemberships]', 'V') IS NOT NULL
    DROP VIEW [acgi].[vwMemberships];
GO

CREATE VIEW [acgi].[vwMemberships]
AS
SELECT
    m.*
FROM
    [acgi].[Membership] AS m
GO
GRANT SELECT ON [acgi].[vwMemberships] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Memberships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Memberships
-- Item: Permissions for vwMemberships
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [acgi].[vwMemberships] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Memberships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Memberships
-- Item: spCreateMembership
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Membership
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spCreateMembership]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spCreateMembership];
GO

CREATE PROCEDURE [acgi].[spCreateMembership]
    @relationshipStartDate_Clear bit = 0,
    @relationshipStartDate nvarchar(255) = NULL,
    @custId_Clear bit = 0,
    @custId nvarchar(255) = NULL,
    @classCode_Clear bit = 0,
    @classCode nvarchar(255) = NULL,
    @subgroupName_Clear bit = 0,
    @subgroupName nvarchar(255) = NULL,
    @directOrInherited_Clear bit = 0,
    @directOrInherited nvarchar(255) = NULL,
    @classSubclassDescr_Clear bit = 0,
    @classSubclassDescr nvarchar(255) = NULL,
    @slotSummaries_Clear bit = 0,
    @slotSummaries nvarchar(255) = NULL,
    @statusCode_Clear bit = 0,
    @statusCode nvarchar(255) = NULL,
    @expirationDate_Clear bit = 0,
    @expirationDate nvarchar(255) = NULL,
    @joinDate_Clear bit = 0,
    @joinDate nvarchar(255) = NULL,
    @subgroupTypeDescr_Clear bit = 0,
    @subgroupTypeDescr nvarchar(255) = NULL,
    @relationshipTypeDescr_Clear bit = 0,
    @relationshipTypeDescr nvarchar(255) = NULL,
    @paidThroughDate_Clear bit = 0,
    @paidThroughDate nvarchar(255) = NULL,
    @subgroupType_Clear bit = 0,
    @subgroupType nvarchar(255) = NULL,
    @subgroupId_Clear bit = 0,
    @subgroupId nvarchar(255) = NULL,
    @relationshipType_Clear bit = 0,
    @relationshipType nvarchar(255) = NULL,
    @subclassCode_Clear bit = 0,
    @subclassCode nvarchar(255) = NULL,
    @reinstateDate_Clear bit = 0,
    @reinstateDate nvarchar(255) = NULL,
    @member_Clear bit = 0,
    @member nvarchar(255) = NULL,
    @recordKey nvarchar(255) = NULL,
    @lockCode_Clear bit = 0,
    @lockCode nvarchar(255) = NULL,
    @statusDescr_Clear bit = 0,
    @statusDescr nvarchar(255) = NULL,
    @inheritedFromCustId_Clear bit = 0,
    @inheritedFromCustId nvarchar(255) = NULL,
    @relationshipEndDate_Clear bit = 0,
    @relationshipEndDate nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [acgi].[Membership]
        (
            [relationshipStartDate],
                [custId],
                [classCode],
                [subgroupName],
                [directOrInherited],
                [classSubclassDescr],
                [slotSummaries],
                [statusCode],
                [expirationDate],
                [joinDate],
                [subgroupTypeDescr],
                [relationshipTypeDescr],
                [paidThroughDate],
                [subgroupType],
                [subgroupId],
                [relationshipType],
                [subclassCode],
                [reinstateDate],
                [member],
                [lockCode],
                [statusDescr],
                [inheritedFromCustId],
                [relationshipEndDate],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [recordKey]
        )
    VALUES
        (
            CASE WHEN @relationshipStartDate_Clear = 1 THEN NULL ELSE ISNULL(@relationshipStartDate, NULL) END,
                CASE WHEN @custId_Clear = 1 THEN NULL ELSE ISNULL(@custId, NULL) END,
                CASE WHEN @classCode_Clear = 1 THEN NULL ELSE ISNULL(@classCode, NULL) END,
                CASE WHEN @subgroupName_Clear = 1 THEN NULL ELSE ISNULL(@subgroupName, NULL) END,
                CASE WHEN @directOrInherited_Clear = 1 THEN NULL ELSE ISNULL(@directOrInherited, NULL) END,
                CASE WHEN @classSubclassDescr_Clear = 1 THEN NULL ELSE ISNULL(@classSubclassDescr, NULL) END,
                CASE WHEN @slotSummaries_Clear = 1 THEN NULL ELSE ISNULL(@slotSummaries, NULL) END,
                CASE WHEN @statusCode_Clear = 1 THEN NULL ELSE ISNULL(@statusCode, NULL) END,
                CASE WHEN @expirationDate_Clear = 1 THEN NULL ELSE ISNULL(@expirationDate, NULL) END,
                CASE WHEN @joinDate_Clear = 1 THEN NULL ELSE ISNULL(@joinDate, NULL) END,
                CASE WHEN @subgroupTypeDescr_Clear = 1 THEN NULL ELSE ISNULL(@subgroupTypeDescr, NULL) END,
                CASE WHEN @relationshipTypeDescr_Clear = 1 THEN NULL ELSE ISNULL(@relationshipTypeDescr, NULL) END,
                CASE WHEN @paidThroughDate_Clear = 1 THEN NULL ELSE ISNULL(@paidThroughDate, NULL) END,
                CASE WHEN @subgroupType_Clear = 1 THEN NULL ELSE ISNULL(@subgroupType, NULL) END,
                CASE WHEN @subgroupId_Clear = 1 THEN NULL ELSE ISNULL(@subgroupId, NULL) END,
                CASE WHEN @relationshipType_Clear = 1 THEN NULL ELSE ISNULL(@relationshipType, NULL) END,
                CASE WHEN @subclassCode_Clear = 1 THEN NULL ELSE ISNULL(@subclassCode, NULL) END,
                CASE WHEN @reinstateDate_Clear = 1 THEN NULL ELSE ISNULL(@reinstateDate, NULL) END,
                CASE WHEN @member_Clear = 1 THEN NULL ELSE ISNULL(@member, NULL) END,
                CASE WHEN @lockCode_Clear = 1 THEN NULL ELSE ISNULL(@lockCode, NULL) END,
                CASE WHEN @statusDescr_Clear = 1 THEN NULL ELSE ISNULL(@statusDescr, NULL) END,
                CASE WHEN @inheritedFromCustId_Clear = 1 THEN NULL ELSE ISNULL(@inheritedFromCustId, NULL) END,
                CASE WHEN @relationshipEndDate_Clear = 1 THEN NULL ELSE ISNULL(@relationshipEndDate, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @recordKey
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [acgi].[vwMemberships] WHERE [recordKey] = @recordKey
END
GO
GRANT EXECUTE ON [acgi].[spCreateMembership] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Memberships */

GRANT EXECUTE ON [acgi].[spCreateMembership] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Memberships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Memberships
-- Item: spUpdateMembership
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Membership
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spUpdateMembership]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spUpdateMembership];
GO

CREATE PROCEDURE [acgi].[spUpdateMembership]
    @relationshipStartDate_Clear bit = 0,
    @relationshipStartDate nvarchar(255) = NULL,
    @custId_Clear bit = 0,
    @custId nvarchar(255) = NULL,
    @classCode_Clear bit = 0,
    @classCode nvarchar(255) = NULL,
    @subgroupName_Clear bit = 0,
    @subgroupName nvarchar(255) = NULL,
    @directOrInherited_Clear bit = 0,
    @directOrInherited nvarchar(255) = NULL,
    @classSubclassDescr_Clear bit = 0,
    @classSubclassDescr nvarchar(255) = NULL,
    @slotSummaries_Clear bit = 0,
    @slotSummaries nvarchar(255) = NULL,
    @statusCode_Clear bit = 0,
    @statusCode nvarchar(255) = NULL,
    @expirationDate_Clear bit = 0,
    @expirationDate nvarchar(255) = NULL,
    @joinDate_Clear bit = 0,
    @joinDate nvarchar(255) = NULL,
    @subgroupTypeDescr_Clear bit = 0,
    @subgroupTypeDescr nvarchar(255) = NULL,
    @relationshipTypeDescr_Clear bit = 0,
    @relationshipTypeDescr nvarchar(255) = NULL,
    @paidThroughDate_Clear bit = 0,
    @paidThroughDate nvarchar(255) = NULL,
    @subgroupType_Clear bit = 0,
    @subgroupType nvarchar(255) = NULL,
    @subgroupId_Clear bit = 0,
    @subgroupId nvarchar(255) = NULL,
    @relationshipType_Clear bit = 0,
    @relationshipType nvarchar(255) = NULL,
    @subclassCode_Clear bit = 0,
    @subclassCode nvarchar(255) = NULL,
    @reinstateDate_Clear bit = 0,
    @reinstateDate nvarchar(255) = NULL,
    @member_Clear bit = 0,
    @member nvarchar(255) = NULL,
    @recordKey nvarchar(255),
    @lockCode_Clear bit = 0,
    @lockCode nvarchar(255) = NULL,
    @statusDescr_Clear bit = 0,
    @statusDescr nvarchar(255) = NULL,
    @inheritedFromCustId_Clear bit = 0,
    @inheritedFromCustId nvarchar(255) = NULL,
    @relationshipEndDate_Clear bit = 0,
    @relationshipEndDate nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [acgi].[Membership]
    SET
        [relationshipStartDate] = CASE WHEN @relationshipStartDate_Clear = 1 THEN NULL ELSE ISNULL(@relationshipStartDate, [relationshipStartDate]) END,
        [custId] = CASE WHEN @custId_Clear = 1 THEN NULL ELSE ISNULL(@custId, [custId]) END,
        [classCode] = CASE WHEN @classCode_Clear = 1 THEN NULL ELSE ISNULL(@classCode, [classCode]) END,
        [subgroupName] = CASE WHEN @subgroupName_Clear = 1 THEN NULL ELSE ISNULL(@subgroupName, [subgroupName]) END,
        [directOrInherited] = CASE WHEN @directOrInherited_Clear = 1 THEN NULL ELSE ISNULL(@directOrInherited, [directOrInherited]) END,
        [classSubclassDescr] = CASE WHEN @classSubclassDescr_Clear = 1 THEN NULL ELSE ISNULL(@classSubclassDescr, [classSubclassDescr]) END,
        [slotSummaries] = CASE WHEN @slotSummaries_Clear = 1 THEN NULL ELSE ISNULL(@slotSummaries, [slotSummaries]) END,
        [statusCode] = CASE WHEN @statusCode_Clear = 1 THEN NULL ELSE ISNULL(@statusCode, [statusCode]) END,
        [expirationDate] = CASE WHEN @expirationDate_Clear = 1 THEN NULL ELSE ISNULL(@expirationDate, [expirationDate]) END,
        [joinDate] = CASE WHEN @joinDate_Clear = 1 THEN NULL ELSE ISNULL(@joinDate, [joinDate]) END,
        [subgroupTypeDescr] = CASE WHEN @subgroupTypeDescr_Clear = 1 THEN NULL ELSE ISNULL(@subgroupTypeDescr, [subgroupTypeDescr]) END,
        [relationshipTypeDescr] = CASE WHEN @relationshipTypeDescr_Clear = 1 THEN NULL ELSE ISNULL(@relationshipTypeDescr, [relationshipTypeDescr]) END,
        [paidThroughDate] = CASE WHEN @paidThroughDate_Clear = 1 THEN NULL ELSE ISNULL(@paidThroughDate, [paidThroughDate]) END,
        [subgroupType] = CASE WHEN @subgroupType_Clear = 1 THEN NULL ELSE ISNULL(@subgroupType, [subgroupType]) END,
        [subgroupId] = CASE WHEN @subgroupId_Clear = 1 THEN NULL ELSE ISNULL(@subgroupId, [subgroupId]) END,
        [relationshipType] = CASE WHEN @relationshipType_Clear = 1 THEN NULL ELSE ISNULL(@relationshipType, [relationshipType]) END,
        [subclassCode] = CASE WHEN @subclassCode_Clear = 1 THEN NULL ELSE ISNULL(@subclassCode, [subclassCode]) END,
        [reinstateDate] = CASE WHEN @reinstateDate_Clear = 1 THEN NULL ELSE ISNULL(@reinstateDate, [reinstateDate]) END,
        [member] = CASE WHEN @member_Clear = 1 THEN NULL ELSE ISNULL(@member, [member]) END,
        [lockCode] = CASE WHEN @lockCode_Clear = 1 THEN NULL ELSE ISNULL(@lockCode, [lockCode]) END,
        [statusDescr] = CASE WHEN @statusDescr_Clear = 1 THEN NULL ELSE ISNULL(@statusDescr, [statusDescr]) END,
        [inheritedFromCustId] = CASE WHEN @inheritedFromCustId_Clear = 1 THEN NULL ELSE ISNULL(@inheritedFromCustId, [inheritedFromCustId]) END,
        [relationshipEndDate] = CASE WHEN @relationshipEndDate_Clear = 1 THEN NULL ELSE ISNULL(@relationshipEndDate, [relationshipEndDate]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [recordKey] = @recordKey

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [acgi].[vwMemberships] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [acgi].[vwMemberships]
                                    WHERE
                                        [recordKey] = @recordKey
                                    
END
GO

GRANT EXECUTE ON [acgi].[spUpdateMembership] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Membership table
------------------------------------------------------------
IF OBJECT_ID('[acgi].[trgUpdateMembership]', 'TR') IS NOT NULL
    DROP TRIGGER [acgi].[trgUpdateMembership];
GO
CREATE TRIGGER [acgi].trgUpdateMembership
ON [acgi].[Membership]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [acgi].[Membership]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [acgi].[Membership] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[recordKey] = I.[recordKey];
END;
GO

/* spUpdate Permissions for Memberships */

GRANT EXECUTE ON [acgi].[spUpdateMembership] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Jobs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Jobs
-- Item: spDeleteJob
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Job
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spDeleteJob]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spDeleteJob];
GO

CREATE PROCEDURE [acgi].[spDeleteJob]
    @recordKey nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [acgi].[Job]
    WHERE
        [recordKey] = @recordKey


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [recordKey] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @recordKey AS [recordKey] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [acgi].[spDeleteJob] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Jobs */

GRANT EXECUTE ON [acgi].[spDeleteJob] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Memberships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Memberships
-- Item: spDeleteMembership
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Membership
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spDeleteMembership]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spDeleteMembership];
GO

CREATE PROCEDURE [acgi].[spDeleteMembership]
    @recordKey nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [acgi].[Membership]
    WHERE
        [recordKey] = @recordKey


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [recordKey] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @recordKey AS [recordKey] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [acgi].[spDeleteMembership] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Memberships */

GRANT EXECUTE ON [acgi].[spDeleteMembership] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for Phone */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Phones
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key custId in table Phone
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Phone_custId' 
    AND object_id = OBJECT_ID('[acgi].[Phone]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Phone_custId ON [acgi].[Phone] ([custId]);

/* Index for Foreign Keys for ReferralInfo */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Referral Infos
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key custId in table ReferralInfo
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ReferralInfo_custId' 
    AND object_id = OBJECT_ID('[acgi].[ReferralInfo]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ReferralInfo_custId ON [acgi].[ReferralInfo] ([custId]);

/* Index for Foreign Keys for Subscription */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Subscriptions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key custId in table Subscription
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Subscription_custId' 
    AND object_id = OBJECT_ID('[acgi].[Subscription]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Subscription_custId ON [acgi].[Subscription] ([custId]);

/* Index for Foreign Keys for Website */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Websites
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key custId in table Website
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Website_custId' 
    AND object_id = OBJECT_ID('[acgi].[Website]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Website_custId ON [acgi].[Website] ([custId]);

/* Base View SQL for Phones */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Phones
-- Item: vwPhones
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Phones
-----               SCHEMA:      acgi
-----               BASE TABLE:  Phone
-----               PRIMARY KEY: recordKey
------------------------------------------------------------
IF OBJECT_ID('[acgi].[vwPhones]', 'V') IS NOT NULL
    DROP VIEW [acgi].[vwPhones];
GO

CREATE VIEW [acgi].[vwPhones]
AS
SELECT
    p.*
FROM
    [acgi].[Phone] AS p
GO
GRANT SELECT ON [acgi].[vwPhones] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Phones */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Phones
-- Item: Permissions for vwPhones
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [acgi].[vwPhones] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Phones */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Phones
-- Item: spCreatePhone
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Phone
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spCreatePhone]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spCreatePhone];
GO

CREATE PROCEDURE [acgi].[spCreatePhone]
    @number_Clear bit = 0,
    @number nvarchar(255) = NULL,
    @custId_Clear bit = 0,
    @custId nvarchar(255) = NULL,
    @preferred_Clear bit = 0,
    @preferred nvarchar(255) = NULL,
    @recordKey nvarchar(255) = NULL,
    @phoneSerno_Clear bit = 0,
    @phoneSerno nvarchar(255) = NULL,
    @lockCode_Clear bit = 0,
    @lockCode nvarchar(255) = NULL,
    @phoneTypeDescr_Clear bit = 0,
    @phoneTypeDescr nvarchar(255) = NULL,
    @ext_Clear bit = 0,
    @ext nvarchar(255) = NULL,
    @remark_Clear bit = 0,
    @remark nvarchar(255) = NULL,
    @phoneType_Clear bit = 0,
    @phoneType nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [acgi].[Phone]
        (
            [number],
                [custId],
                [preferred],
                [phoneSerno],
                [lockCode],
                [phoneTypeDescr],
                [ext],
                [remark],
                [phoneType],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [recordKey]
        )
    VALUES
        (
            CASE WHEN @number_Clear = 1 THEN NULL ELSE ISNULL(@number, NULL) END,
                CASE WHEN @custId_Clear = 1 THEN NULL ELSE ISNULL(@custId, NULL) END,
                CASE WHEN @preferred_Clear = 1 THEN NULL ELSE ISNULL(@preferred, NULL) END,
                CASE WHEN @phoneSerno_Clear = 1 THEN NULL ELSE ISNULL(@phoneSerno, NULL) END,
                CASE WHEN @lockCode_Clear = 1 THEN NULL ELSE ISNULL(@lockCode, NULL) END,
                CASE WHEN @phoneTypeDescr_Clear = 1 THEN NULL ELSE ISNULL(@phoneTypeDescr, NULL) END,
                CASE WHEN @ext_Clear = 1 THEN NULL ELSE ISNULL(@ext, NULL) END,
                CASE WHEN @remark_Clear = 1 THEN NULL ELSE ISNULL(@remark, NULL) END,
                CASE WHEN @phoneType_Clear = 1 THEN NULL ELSE ISNULL(@phoneType, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @recordKey
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [acgi].[vwPhones] WHERE [recordKey] = @recordKey
END
GO
GRANT EXECUTE ON [acgi].[spCreatePhone] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Phones */

GRANT EXECUTE ON [acgi].[spCreatePhone] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Phones */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Phones
-- Item: spUpdatePhone
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Phone
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spUpdatePhone]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spUpdatePhone];
GO

CREATE PROCEDURE [acgi].[spUpdatePhone]
    @number_Clear bit = 0,
    @number nvarchar(255) = NULL,
    @custId_Clear bit = 0,
    @custId nvarchar(255) = NULL,
    @preferred_Clear bit = 0,
    @preferred nvarchar(255) = NULL,
    @recordKey nvarchar(255),
    @phoneSerno_Clear bit = 0,
    @phoneSerno nvarchar(255) = NULL,
    @lockCode_Clear bit = 0,
    @lockCode nvarchar(255) = NULL,
    @phoneTypeDescr_Clear bit = 0,
    @phoneTypeDescr nvarchar(255) = NULL,
    @ext_Clear bit = 0,
    @ext nvarchar(255) = NULL,
    @remark_Clear bit = 0,
    @remark nvarchar(255) = NULL,
    @phoneType_Clear bit = 0,
    @phoneType nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [acgi].[Phone]
    SET
        [number] = CASE WHEN @number_Clear = 1 THEN NULL ELSE ISNULL(@number, [number]) END,
        [custId] = CASE WHEN @custId_Clear = 1 THEN NULL ELSE ISNULL(@custId, [custId]) END,
        [preferred] = CASE WHEN @preferred_Clear = 1 THEN NULL ELSE ISNULL(@preferred, [preferred]) END,
        [phoneSerno] = CASE WHEN @phoneSerno_Clear = 1 THEN NULL ELSE ISNULL(@phoneSerno, [phoneSerno]) END,
        [lockCode] = CASE WHEN @lockCode_Clear = 1 THEN NULL ELSE ISNULL(@lockCode, [lockCode]) END,
        [phoneTypeDescr] = CASE WHEN @phoneTypeDescr_Clear = 1 THEN NULL ELSE ISNULL(@phoneTypeDescr, [phoneTypeDescr]) END,
        [ext] = CASE WHEN @ext_Clear = 1 THEN NULL ELSE ISNULL(@ext, [ext]) END,
        [remark] = CASE WHEN @remark_Clear = 1 THEN NULL ELSE ISNULL(@remark, [remark]) END,
        [phoneType] = CASE WHEN @phoneType_Clear = 1 THEN NULL ELSE ISNULL(@phoneType, [phoneType]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [recordKey] = @recordKey

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [acgi].[vwPhones] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [acgi].[vwPhones]
                                    WHERE
                                        [recordKey] = @recordKey
                                    
END
GO

GRANT EXECUTE ON [acgi].[spUpdatePhone] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Phone table
------------------------------------------------------------
IF OBJECT_ID('[acgi].[trgUpdatePhone]', 'TR') IS NOT NULL
    DROP TRIGGER [acgi].[trgUpdatePhone];
GO
CREATE TRIGGER [acgi].trgUpdatePhone
ON [acgi].[Phone]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [acgi].[Phone]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [acgi].[Phone] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[recordKey] = I.[recordKey];
END;
GO

/* spUpdate Permissions for Phones */

GRANT EXECUTE ON [acgi].[spUpdatePhone] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Referral Infos */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Referral Infos
-- Item: vwReferralInfos
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Referral Infos
-----               SCHEMA:      acgi
-----               BASE TABLE:  ReferralInfo
-----               PRIMARY KEY: recordKey
------------------------------------------------------------
IF OBJECT_ID('[acgi].[vwReferralInfos]', 'V') IS NOT NULL
    DROP VIEW [acgi].[vwReferralInfos];
GO

CREATE VIEW [acgi].[vwReferralInfos]
AS
SELECT
    r.*
FROM
    [acgi].[ReferralInfo] AS r
GO
GRANT SELECT ON [acgi].[vwReferralInfos] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Referral Infos */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Referral Infos
-- Item: Permissions for vwReferralInfos
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [acgi].[vwReferralInfos] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Referral Infos */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Referral Infos
-- Item: spCreateReferralInfo
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ReferralInfo
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spCreateReferralInfo]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spCreateReferralInfo];
GO

CREATE PROCEDURE [acgi].[spCreateReferralInfo]
    @publishWebsiteFlag_Clear bit = 0,
    @publishWebsiteFlag nvarchar(255) = NULL,
    @prefFaxSerno_Clear bit = 0,
    @prefFaxSerno nvarchar(255) = NULL,
    @contactTxt1_Clear bit = 0,
    @contactTxt1 nvarchar(255) = NULL,
    @vendorType_Clear bit = 0,
    @vendorType nvarchar(255) = NULL,
    @prefPhoneSerno_Clear bit = 0,
    @prefPhoneSerno nvarchar(255) = NULL,
    @publishEmailFlag_Clear bit = 0,
    @publishEmailFlag nvarchar(255) = NULL,
    @publishAddrFlag_Clear bit = 0,
    @publishAddrFlag nvarchar(255) = NULL,
    @publishPhoneFlag_Clear bit = 0,
    @publishPhoneFlag nvarchar(255) = NULL,
    @prefWebsiteSerno_Clear bit = 0,
    @prefWebsiteSerno nvarchar(255) = NULL,
    @lastUpdatedDate_Clear bit = 0,
    @lastUpdatedDate nvarchar(255) = NULL,
    @custId_Clear bit = 0,
    @custId nvarchar(255) = NULL,
    @prefEmailSerno_Clear bit = 0,
    @prefEmailSerno nvarchar(255) = NULL,
    @contactTxt2_Clear bit = 0,
    @contactTxt2 nvarchar(255) = NULL,
    @publishInDirectoryFlag_Clear bit = 0,
    @publishInDirectoryFlag nvarchar(255) = NULL,
    @status_Clear bit = 0,
    @status nvarchar(255) = NULL,
    @publishFaxFlag_Clear bit = 0,
    @publishFaxFlag nvarchar(255) = NULL,
    @prefAddrSerno_Clear bit = 0,
    @prefAddrSerno nvarchar(255) = NULL,
    @recordKey nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [acgi].[ReferralInfo]
        (
            [publishWebsiteFlag],
                [prefFaxSerno],
                [contactTxt1],
                [vendorType],
                [prefPhoneSerno],
                [publishEmailFlag],
                [publishAddrFlag],
                [publishPhoneFlag],
                [prefWebsiteSerno],
                [lastUpdatedDate],
                [custId],
                [prefEmailSerno],
                [contactTxt2],
                [publishInDirectoryFlag],
                [status],
                [publishFaxFlag],
                [prefAddrSerno],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [recordKey]
        )
    VALUES
        (
            CASE WHEN @publishWebsiteFlag_Clear = 1 THEN NULL ELSE ISNULL(@publishWebsiteFlag, NULL) END,
                CASE WHEN @prefFaxSerno_Clear = 1 THEN NULL ELSE ISNULL(@prefFaxSerno, NULL) END,
                CASE WHEN @contactTxt1_Clear = 1 THEN NULL ELSE ISNULL(@contactTxt1, NULL) END,
                CASE WHEN @vendorType_Clear = 1 THEN NULL ELSE ISNULL(@vendorType, NULL) END,
                CASE WHEN @prefPhoneSerno_Clear = 1 THEN NULL ELSE ISNULL(@prefPhoneSerno, NULL) END,
                CASE WHEN @publishEmailFlag_Clear = 1 THEN NULL ELSE ISNULL(@publishEmailFlag, NULL) END,
                CASE WHEN @publishAddrFlag_Clear = 1 THEN NULL ELSE ISNULL(@publishAddrFlag, NULL) END,
                CASE WHEN @publishPhoneFlag_Clear = 1 THEN NULL ELSE ISNULL(@publishPhoneFlag, NULL) END,
                CASE WHEN @prefWebsiteSerno_Clear = 1 THEN NULL ELSE ISNULL(@prefWebsiteSerno, NULL) END,
                CASE WHEN @lastUpdatedDate_Clear = 1 THEN NULL ELSE ISNULL(@lastUpdatedDate, NULL) END,
                CASE WHEN @custId_Clear = 1 THEN NULL ELSE ISNULL(@custId, NULL) END,
                CASE WHEN @prefEmailSerno_Clear = 1 THEN NULL ELSE ISNULL(@prefEmailSerno, NULL) END,
                CASE WHEN @contactTxt2_Clear = 1 THEN NULL ELSE ISNULL(@contactTxt2, NULL) END,
                CASE WHEN @publishInDirectoryFlag_Clear = 1 THEN NULL ELSE ISNULL(@publishInDirectoryFlag, NULL) END,
                CASE WHEN @status_Clear = 1 THEN NULL ELSE ISNULL(@status, NULL) END,
                CASE WHEN @publishFaxFlag_Clear = 1 THEN NULL ELSE ISNULL(@publishFaxFlag, NULL) END,
                CASE WHEN @prefAddrSerno_Clear = 1 THEN NULL ELSE ISNULL(@prefAddrSerno, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @recordKey
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [acgi].[vwReferralInfos] WHERE [recordKey] = @recordKey
END
GO
GRANT EXECUTE ON [acgi].[spCreateReferralInfo] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Referral Infos */

GRANT EXECUTE ON [acgi].[spCreateReferralInfo] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Referral Infos */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Referral Infos
-- Item: spUpdateReferralInfo
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ReferralInfo
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spUpdateReferralInfo]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spUpdateReferralInfo];
GO

CREATE PROCEDURE [acgi].[spUpdateReferralInfo]
    @publishWebsiteFlag_Clear bit = 0,
    @publishWebsiteFlag nvarchar(255) = NULL,
    @prefFaxSerno_Clear bit = 0,
    @prefFaxSerno nvarchar(255) = NULL,
    @contactTxt1_Clear bit = 0,
    @contactTxt1 nvarchar(255) = NULL,
    @vendorType_Clear bit = 0,
    @vendorType nvarchar(255) = NULL,
    @prefPhoneSerno_Clear bit = 0,
    @prefPhoneSerno nvarchar(255) = NULL,
    @publishEmailFlag_Clear bit = 0,
    @publishEmailFlag nvarchar(255) = NULL,
    @publishAddrFlag_Clear bit = 0,
    @publishAddrFlag nvarchar(255) = NULL,
    @publishPhoneFlag_Clear bit = 0,
    @publishPhoneFlag nvarchar(255) = NULL,
    @prefWebsiteSerno_Clear bit = 0,
    @prefWebsiteSerno nvarchar(255) = NULL,
    @lastUpdatedDate_Clear bit = 0,
    @lastUpdatedDate nvarchar(255) = NULL,
    @custId_Clear bit = 0,
    @custId nvarchar(255) = NULL,
    @prefEmailSerno_Clear bit = 0,
    @prefEmailSerno nvarchar(255) = NULL,
    @contactTxt2_Clear bit = 0,
    @contactTxt2 nvarchar(255) = NULL,
    @publishInDirectoryFlag_Clear bit = 0,
    @publishInDirectoryFlag nvarchar(255) = NULL,
    @status_Clear bit = 0,
    @status nvarchar(255) = NULL,
    @publishFaxFlag_Clear bit = 0,
    @publishFaxFlag nvarchar(255) = NULL,
    @prefAddrSerno_Clear bit = 0,
    @prefAddrSerno nvarchar(255) = NULL,
    @recordKey nvarchar(255),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [acgi].[ReferralInfo]
    SET
        [publishWebsiteFlag] = CASE WHEN @publishWebsiteFlag_Clear = 1 THEN NULL ELSE ISNULL(@publishWebsiteFlag, [publishWebsiteFlag]) END,
        [prefFaxSerno] = CASE WHEN @prefFaxSerno_Clear = 1 THEN NULL ELSE ISNULL(@prefFaxSerno, [prefFaxSerno]) END,
        [contactTxt1] = CASE WHEN @contactTxt1_Clear = 1 THEN NULL ELSE ISNULL(@contactTxt1, [contactTxt1]) END,
        [vendorType] = CASE WHEN @vendorType_Clear = 1 THEN NULL ELSE ISNULL(@vendorType, [vendorType]) END,
        [prefPhoneSerno] = CASE WHEN @prefPhoneSerno_Clear = 1 THEN NULL ELSE ISNULL(@prefPhoneSerno, [prefPhoneSerno]) END,
        [publishEmailFlag] = CASE WHEN @publishEmailFlag_Clear = 1 THEN NULL ELSE ISNULL(@publishEmailFlag, [publishEmailFlag]) END,
        [publishAddrFlag] = CASE WHEN @publishAddrFlag_Clear = 1 THEN NULL ELSE ISNULL(@publishAddrFlag, [publishAddrFlag]) END,
        [publishPhoneFlag] = CASE WHEN @publishPhoneFlag_Clear = 1 THEN NULL ELSE ISNULL(@publishPhoneFlag, [publishPhoneFlag]) END,
        [prefWebsiteSerno] = CASE WHEN @prefWebsiteSerno_Clear = 1 THEN NULL ELSE ISNULL(@prefWebsiteSerno, [prefWebsiteSerno]) END,
        [lastUpdatedDate] = CASE WHEN @lastUpdatedDate_Clear = 1 THEN NULL ELSE ISNULL(@lastUpdatedDate, [lastUpdatedDate]) END,
        [custId] = CASE WHEN @custId_Clear = 1 THEN NULL ELSE ISNULL(@custId, [custId]) END,
        [prefEmailSerno] = CASE WHEN @prefEmailSerno_Clear = 1 THEN NULL ELSE ISNULL(@prefEmailSerno, [prefEmailSerno]) END,
        [contactTxt2] = CASE WHEN @contactTxt2_Clear = 1 THEN NULL ELSE ISNULL(@contactTxt2, [contactTxt2]) END,
        [publishInDirectoryFlag] = CASE WHEN @publishInDirectoryFlag_Clear = 1 THEN NULL ELSE ISNULL(@publishInDirectoryFlag, [publishInDirectoryFlag]) END,
        [status] = CASE WHEN @status_Clear = 1 THEN NULL ELSE ISNULL(@status, [status]) END,
        [publishFaxFlag] = CASE WHEN @publishFaxFlag_Clear = 1 THEN NULL ELSE ISNULL(@publishFaxFlag, [publishFaxFlag]) END,
        [prefAddrSerno] = CASE WHEN @prefAddrSerno_Clear = 1 THEN NULL ELSE ISNULL(@prefAddrSerno, [prefAddrSerno]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [recordKey] = @recordKey

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [acgi].[vwReferralInfos] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [acgi].[vwReferralInfos]
                                    WHERE
                                        [recordKey] = @recordKey
                                    
END
GO

GRANT EXECUTE ON [acgi].[spUpdateReferralInfo] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ReferralInfo table
------------------------------------------------------------
IF OBJECT_ID('[acgi].[trgUpdateReferralInfo]', 'TR') IS NOT NULL
    DROP TRIGGER [acgi].[trgUpdateReferralInfo];
GO
CREATE TRIGGER [acgi].trgUpdateReferralInfo
ON [acgi].[ReferralInfo]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [acgi].[ReferralInfo]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [acgi].[ReferralInfo] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[recordKey] = I.[recordKey];
END;
GO

/* spUpdate Permissions for Referral Infos */

GRANT EXECUTE ON [acgi].[spUpdateReferralInfo] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Subscriptions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Subscriptions
-- Item: vwSubscriptions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Subscriptions
-----               SCHEMA:      acgi
-----               BASE TABLE:  Subscription
-----               PRIMARY KEY: recordKey
------------------------------------------------------------
IF OBJECT_ID('[acgi].[vwSubscriptions]', 'V') IS NOT NULL
    DROP VIEW [acgi].[vwSubscriptions];
GO

CREATE VIEW [acgi].[vwSubscriptions]
AS
SELECT
    s.*
FROM
    [acgi].[Subscription] AS s
GO
GRANT SELECT ON [acgi].[vwSubscriptions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Subscriptions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Subscriptions
-- Item: Permissions for vwSubscriptions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [acgi].[vwSubscriptions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Subscriptions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Subscriptions
-- Item: spCreateSubscription
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Subscription
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spCreateSubscription]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spCreateSubscription];
GO

CREATE PROCEDURE [acgi].[spCreateSubscription]
    @beginDate_Clear bit = 0,
    @beginDate nvarchar(255) = NULL,
    @packageName_Clear bit = 0,
    @packageName nvarchar(255) = NULL,
    @expirationDate_Clear bit = 0,
    @expirationDate nvarchar(255) = NULL,
    @custId_Clear bit = 0,
    @custId nvarchar(255) = NULL,
    @recordKey nvarchar(255) = NULL,
    @packageCode_Clear bit = 0,
    @packageCode nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [acgi].[Subscription]
        (
            [beginDate],
                [packageName],
                [expirationDate],
                [custId],
                [packageCode],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [recordKey]
        )
    VALUES
        (
            CASE WHEN @beginDate_Clear = 1 THEN NULL ELSE ISNULL(@beginDate, NULL) END,
                CASE WHEN @packageName_Clear = 1 THEN NULL ELSE ISNULL(@packageName, NULL) END,
                CASE WHEN @expirationDate_Clear = 1 THEN NULL ELSE ISNULL(@expirationDate, NULL) END,
                CASE WHEN @custId_Clear = 1 THEN NULL ELSE ISNULL(@custId, NULL) END,
                CASE WHEN @packageCode_Clear = 1 THEN NULL ELSE ISNULL(@packageCode, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @recordKey
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [acgi].[vwSubscriptions] WHERE [recordKey] = @recordKey
END
GO
GRANT EXECUTE ON [acgi].[spCreateSubscription] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Subscriptions */

GRANT EXECUTE ON [acgi].[spCreateSubscription] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Subscriptions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Subscriptions
-- Item: spUpdateSubscription
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Subscription
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spUpdateSubscription]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spUpdateSubscription];
GO

CREATE PROCEDURE [acgi].[spUpdateSubscription]
    @beginDate_Clear bit = 0,
    @beginDate nvarchar(255) = NULL,
    @packageName_Clear bit = 0,
    @packageName nvarchar(255) = NULL,
    @expirationDate_Clear bit = 0,
    @expirationDate nvarchar(255) = NULL,
    @custId_Clear bit = 0,
    @custId nvarchar(255) = NULL,
    @recordKey nvarchar(255),
    @packageCode_Clear bit = 0,
    @packageCode nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [acgi].[Subscription]
    SET
        [beginDate] = CASE WHEN @beginDate_Clear = 1 THEN NULL ELSE ISNULL(@beginDate, [beginDate]) END,
        [packageName] = CASE WHEN @packageName_Clear = 1 THEN NULL ELSE ISNULL(@packageName, [packageName]) END,
        [expirationDate] = CASE WHEN @expirationDate_Clear = 1 THEN NULL ELSE ISNULL(@expirationDate, [expirationDate]) END,
        [custId] = CASE WHEN @custId_Clear = 1 THEN NULL ELSE ISNULL(@custId, [custId]) END,
        [packageCode] = CASE WHEN @packageCode_Clear = 1 THEN NULL ELSE ISNULL(@packageCode, [packageCode]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [recordKey] = @recordKey

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [acgi].[vwSubscriptions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [acgi].[vwSubscriptions]
                                    WHERE
                                        [recordKey] = @recordKey
                                    
END
GO

GRANT EXECUTE ON [acgi].[spUpdateSubscription] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Subscription table
------------------------------------------------------------
IF OBJECT_ID('[acgi].[trgUpdateSubscription]', 'TR') IS NOT NULL
    DROP TRIGGER [acgi].[trgUpdateSubscription];
GO
CREATE TRIGGER [acgi].trgUpdateSubscription
ON [acgi].[Subscription]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [acgi].[Subscription]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [acgi].[Subscription] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[recordKey] = I.[recordKey];
END;
GO

/* spUpdate Permissions for Subscriptions */

GRANT EXECUTE ON [acgi].[spUpdateSubscription] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Websites */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Websites
-- Item: vwWebsites
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Websites
-----               SCHEMA:      acgi
-----               BASE TABLE:  Website
-----               PRIMARY KEY: recordKey
------------------------------------------------------------
IF OBJECT_ID('[acgi].[vwWebsites]', 'V') IS NOT NULL
    DROP VIEW [acgi].[vwWebsites];
GO

CREATE VIEW [acgi].[vwWebsites]
AS
SELECT
    w.*
FROM
    [acgi].[Website] AS w
GO
GRANT SELECT ON [acgi].[vwWebsites] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Websites */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Websites
-- Item: Permissions for vwWebsites
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [acgi].[vwWebsites] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Websites */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Websites
-- Item: spCreateWebsite
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Website
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spCreateWebsite]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spCreateWebsite];
GO

CREATE PROCEDURE [acgi].[spCreateWebsite]
    @custId_Clear bit = 0,
    @custId nvarchar(255) = NULL,
    @remark_Clear bit = 0,
    @remark nvarchar(255) = NULL,
    @websiteTypeDescr_Clear bit = 0,
    @websiteTypeDescr nvarchar(255) = NULL,
    @address_Clear bit = 0,
    @address nvarchar(255) = NULL,
    @websiteSerno_Clear bit = 0,
    @websiteSerno nvarchar(255) = NULL,
    @preferred_Clear bit = 0,
    @preferred nvarchar(255) = NULL,
    @badAddress_Clear bit = 0,
    @badAddress nvarchar(255) = NULL,
    @recordKey nvarchar(255) = NULL,
    @lockCode_Clear bit = 0,
    @lockCode nvarchar(255) = NULL,
    @websiteType_Clear bit = 0,
    @websiteType nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [acgi].[Website]
        (
            [custId],
                [remark],
                [websiteTypeDescr],
                [address],
                [websiteSerno],
                [preferred],
                [badAddress],
                [lockCode],
                [websiteType],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [recordKey]
        )
    VALUES
        (
            CASE WHEN @custId_Clear = 1 THEN NULL ELSE ISNULL(@custId, NULL) END,
                CASE WHEN @remark_Clear = 1 THEN NULL ELSE ISNULL(@remark, NULL) END,
                CASE WHEN @websiteTypeDescr_Clear = 1 THEN NULL ELSE ISNULL(@websiteTypeDescr, NULL) END,
                CASE WHEN @address_Clear = 1 THEN NULL ELSE ISNULL(@address, NULL) END,
                CASE WHEN @websiteSerno_Clear = 1 THEN NULL ELSE ISNULL(@websiteSerno, NULL) END,
                CASE WHEN @preferred_Clear = 1 THEN NULL ELSE ISNULL(@preferred, NULL) END,
                CASE WHEN @badAddress_Clear = 1 THEN NULL ELSE ISNULL(@badAddress, NULL) END,
                CASE WHEN @lockCode_Clear = 1 THEN NULL ELSE ISNULL(@lockCode, NULL) END,
                CASE WHEN @websiteType_Clear = 1 THEN NULL ELSE ISNULL(@websiteType, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @recordKey
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [acgi].[vwWebsites] WHERE [recordKey] = @recordKey
END
GO
GRANT EXECUTE ON [acgi].[spCreateWebsite] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Websites */

GRANT EXECUTE ON [acgi].[spCreateWebsite] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Websites */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Websites
-- Item: spUpdateWebsite
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Website
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spUpdateWebsite]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spUpdateWebsite];
GO

CREATE PROCEDURE [acgi].[spUpdateWebsite]
    @custId_Clear bit = 0,
    @custId nvarchar(255) = NULL,
    @remark_Clear bit = 0,
    @remark nvarchar(255) = NULL,
    @websiteTypeDescr_Clear bit = 0,
    @websiteTypeDescr nvarchar(255) = NULL,
    @address_Clear bit = 0,
    @address nvarchar(255) = NULL,
    @websiteSerno_Clear bit = 0,
    @websiteSerno nvarchar(255) = NULL,
    @preferred_Clear bit = 0,
    @preferred nvarchar(255) = NULL,
    @badAddress_Clear bit = 0,
    @badAddress nvarchar(255) = NULL,
    @recordKey nvarchar(255),
    @lockCode_Clear bit = 0,
    @lockCode nvarchar(255) = NULL,
    @websiteType_Clear bit = 0,
    @websiteType nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [acgi].[Website]
    SET
        [custId] = CASE WHEN @custId_Clear = 1 THEN NULL ELSE ISNULL(@custId, [custId]) END,
        [remark] = CASE WHEN @remark_Clear = 1 THEN NULL ELSE ISNULL(@remark, [remark]) END,
        [websiteTypeDescr] = CASE WHEN @websiteTypeDescr_Clear = 1 THEN NULL ELSE ISNULL(@websiteTypeDescr, [websiteTypeDescr]) END,
        [address] = CASE WHEN @address_Clear = 1 THEN NULL ELSE ISNULL(@address, [address]) END,
        [websiteSerno] = CASE WHEN @websiteSerno_Clear = 1 THEN NULL ELSE ISNULL(@websiteSerno, [websiteSerno]) END,
        [preferred] = CASE WHEN @preferred_Clear = 1 THEN NULL ELSE ISNULL(@preferred, [preferred]) END,
        [badAddress] = CASE WHEN @badAddress_Clear = 1 THEN NULL ELSE ISNULL(@badAddress, [badAddress]) END,
        [lockCode] = CASE WHEN @lockCode_Clear = 1 THEN NULL ELSE ISNULL(@lockCode, [lockCode]) END,
        [websiteType] = CASE WHEN @websiteType_Clear = 1 THEN NULL ELSE ISNULL(@websiteType, [websiteType]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [recordKey] = @recordKey

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [acgi].[vwWebsites] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [acgi].[vwWebsites]
                                    WHERE
                                        [recordKey] = @recordKey
                                    
END
GO

GRANT EXECUTE ON [acgi].[spUpdateWebsite] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Website table
------------------------------------------------------------
IF OBJECT_ID('[acgi].[trgUpdateWebsite]', 'TR') IS NOT NULL
    DROP TRIGGER [acgi].[trgUpdateWebsite];
GO
CREATE TRIGGER [acgi].trgUpdateWebsite
ON [acgi].[Website]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [acgi].[Website]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [acgi].[Website] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[recordKey] = I.[recordKey];
END;
GO

/* spUpdate Permissions for Websites */

GRANT EXECUTE ON [acgi].[spUpdateWebsite] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Phones */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Phones
-- Item: spDeletePhone
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Phone
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spDeletePhone]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spDeletePhone];
GO

CREATE PROCEDURE [acgi].[spDeletePhone]
    @recordKey nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [acgi].[Phone]
    WHERE
        [recordKey] = @recordKey


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [recordKey] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @recordKey AS [recordKey] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [acgi].[spDeletePhone] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Phones */

GRANT EXECUTE ON [acgi].[spDeletePhone] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Referral Infos */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Referral Infos
-- Item: spDeleteReferralInfo
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ReferralInfo
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spDeleteReferralInfo]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spDeleteReferralInfo];
GO

CREATE PROCEDURE [acgi].[spDeleteReferralInfo]
    @recordKey nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [acgi].[ReferralInfo]
    WHERE
        [recordKey] = @recordKey


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [recordKey] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @recordKey AS [recordKey] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [acgi].[spDeleteReferralInfo] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Referral Infos */

GRANT EXECUTE ON [acgi].[spDeleteReferralInfo] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Subscriptions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Subscriptions
-- Item: spDeleteSubscription
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Subscription
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spDeleteSubscription]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spDeleteSubscription];
GO

CREATE PROCEDURE [acgi].[spDeleteSubscription]
    @recordKey nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [acgi].[Subscription]
    WHERE
        [recordKey] = @recordKey


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [recordKey] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @recordKey AS [recordKey] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [acgi].[spDeleteSubscription] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Subscriptions */

GRANT EXECUTE ON [acgi].[spDeleteSubscription] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Websites */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Websites
-- Item: spDeleteWebsite
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Website
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spDeleteWebsite]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spDeleteWebsite];
GO

CREATE PROCEDURE [acgi].[spDeleteWebsite]
    @recordKey nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [acgi].[Website]
    WHERE
        [recordKey] = @recordKey


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [recordKey] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @recordKey AS [recordKey] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [acgi].[spDeleteWebsite] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Websites */

GRANT EXECUTE ON [acgi].[spDeleteWebsite] TO [cdp_Developer], [cdp_Integration];

/* Set soft PK for acgi.CompanyAdmin.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'F0F9B6DD-56E8-48A4-8E6C-6570F60E4A1E' AND [Name] = 'recordKey';

/* Set soft PK for acgi.CompanyAdmin.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'F0F9B6DD-56E8-48A4-8E6C-6570F60E4A1E' AND [Name] = 'id';

/* Set soft FK for acgi.CompanyAdmin.custId → Customer.custId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '617D549E-533C-420E-81A5-1C6785B4E23D',
                                    [RelatedEntityFieldName] = 'custId',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'F0F9B6DD-56E8-48A4-8E6C-6570F60E4A1E' AND [Name] = 'custId';

/* Set soft FK for acgi.CompanyAdmin.custId → Customer.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '617D549E-533C-420E-81A5-1C6785B4E23D',
                                    [RelatedEntityFieldName] = 'recordKey',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'F0F9B6DD-56E8-48A4-8E6C-6570F60E4A1E' AND [Name] = 'custId';

/* Set soft PK for acgi.Customer.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '617D549E-533C-420E-81A5-1C6785B4E23D' AND [Name] = 'recordKey';

/* Set soft PK for acgi.Employee.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '2FB06A45-01E0-4176-86E7-FE94CCF511F6' AND [Name] = 'recordKey';

/* Set soft PK for acgi.Employee.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '2FB06A45-01E0-4176-86E7-FE94CCF511F6' AND [Name] = 'id';

/* Set soft FK for acgi.Employee.custId → Customer.custId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '617D549E-533C-420E-81A5-1C6785B4E23D',
                                    [RelatedEntityFieldName] = 'custId',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '2FB06A45-01E0-4176-86E7-FE94CCF511F6' AND [Name] = 'custId';

/* Set soft FK for acgi.Employee.custId → Customer.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '617D549E-533C-420E-81A5-1C6785B4E23D',
                                    [RelatedEntityFieldName] = 'recordKey',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '2FB06A45-01E0-4176-86E7-FE94CCF511F6' AND [Name] = 'custId';

/* Set soft PK for acgi.Address.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '18B0628E-6DCD-4712-9B20-662C977773E7' AND [Name] = 'recordKey';

/* Set soft FK for acgi.Address.custId → Customer.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '617D549E-533C-420E-81A5-1C6785B4E23D',
                                    [RelatedEntityFieldName] = 'recordKey',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '18B0628E-6DCD-4712-9B20-662C977773E7' AND [Name] = 'custId';

/* Set soft PK for acgi.Alias.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'EDDBD2C3-EBD8-47D9-90FF-2E490A8FE4BC' AND [Name] = 'recordKey';

/* Set soft FK for acgi.Alias.custId → Customer.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '617D549E-533C-420E-81A5-1C6785B4E23D',
                                    [RelatedEntityFieldName] = 'recordKey',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'EDDBD2C3-EBD8-47D9-90FF-2E490A8FE4BC' AND [Name] = 'custId';

/* Set soft PK for acgi.Bio.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '705DEC63-20F2-4CC9-B978-31FA973D2B4E' AND [Name] = 'recordKey';

/* Set soft FK for acgi.Bio.custId → Customer.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '617D549E-533C-420E-81A5-1C6785B4E23D',
                                    [RelatedEntityFieldName] = 'recordKey',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '705DEC63-20F2-4CC9-B978-31FA973D2B4E' AND [Name] = 'custId';

/* Set soft PK for acgi.Certification.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '8C11C912-45B3-4579-B540-680438F7DC4C' AND [Name] = 'recordKey';

/* Set soft FK for acgi.Certification.custId → Customer.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '617D549E-533C-420E-81A5-1C6785B4E23D',
                                    [RelatedEntityFieldName] = 'recordKey',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '8C11C912-45B3-4579-B540-680438F7DC4C' AND [Name] = 'custId';

/* Set soft PK for acgi.CommitteePosition.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'B29835FA-A452-4BAE-89C7-31EEF77CB4DE' AND [Name] = 'recordKey';

/* Set soft FK for acgi.CommitteePosition.custId → Customer.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '617D549E-533C-420E-81A5-1C6785B4E23D',
                                    [RelatedEntityFieldName] = 'recordKey',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'B29835FA-A452-4BAE-89C7-31EEF77CB4DE' AND [Name] = 'custId';

/* Set soft PK for acgi.CommunicationPreference.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'BC9216F8-C086-411D-B048-29218938A358' AND [Name] = 'recordKey';

/* Set soft FK for acgi.CommunicationPreference.custId → Customer.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '617D549E-533C-420E-81A5-1C6785B4E23D',
                                    [RelatedEntityFieldName] = 'recordKey',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'BC9216F8-C086-411D-B048-29218938A358' AND [Name] = 'custId';

/* Set soft PK for acgi.CustomerAttribute.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '83ED684F-6FF9-4217-9129-08212A1D4705' AND [Name] = 'recordKey';

/* Set soft FK for acgi.CustomerAttribute.custId → Customer.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '617D549E-533C-420E-81A5-1C6785B4E23D',
                                    [RelatedEntityFieldName] = 'recordKey',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '83ED684F-6FF9-4217-9129-08212A1D4705' AND [Name] = 'custId';

/* Set soft PK for acgi.CustomerDimAttr.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'E7829F64-7288-4785-A975-AD18EE0B98B3' AND [Name] = 'recordKey';

/* Set soft FK for acgi.CustomerDimAttr.custId → Customer.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '617D549E-533C-420E-81A5-1C6785B4E23D',
                                    [RelatedEntityFieldName] = 'recordKey',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'E7829F64-7288-4785-A975-AD18EE0B98B3' AND [Name] = 'custId';

/* Set soft PK for acgi.CustomerFile.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '8E609AAA-AF7D-40B2-88E0-342047CED0F8' AND [Name] = 'recordKey';

/* Set soft FK for acgi.CustomerFile.custId → Customer.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '617D549E-533C-420E-81A5-1C6785B4E23D',
                                    [RelatedEntityFieldName] = 'recordKey',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '8E609AAA-AF7D-40B2-88E0-342047CED0F8' AND [Name] = 'custId';

/* Set soft PK for acgi.CustomerRole.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'BF63EDBE-5BE7-49D5-8FB9-AE25DB5C3C4E' AND [Name] = 'recordKey';

/* Set soft FK for acgi.CustomerRole.custId → Customer.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '617D549E-533C-420E-81A5-1C6785B4E23D',
                                    [RelatedEntityFieldName] = 'recordKey',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'BF63EDBE-5BE7-49D5-8FB9-AE25DB5C3C4E' AND [Name] = 'custId';

/* Set soft PK for acgi.DirectoryOptOut.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '3841CD11-0490-4CC3-95FC-84381A0B2F86' AND [Name] = 'recordKey';

/* Set soft FK for acgi.DirectoryOptOut.custId → Customer.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '617D549E-533C-420E-81A5-1C6785B4E23D',
                                    [RelatedEntityFieldName] = 'recordKey',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '3841CD11-0490-4CC3-95FC-84381A0B2F86' AND [Name] = 'custId';

/* Set soft PK for acgi.Email.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '432CF3C7-906B-4C61-A3DA-63CDA4819193' AND [Name] = 'recordKey';

/* Set soft FK for acgi.Email.custId → Customer.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '617D549E-533C-420E-81A5-1C6785B4E23D',
                                    [RelatedEntityFieldName] = 'recordKey',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '432CF3C7-906B-4C61-A3DA-63CDA4819193' AND [Name] = 'custId';

/* Set soft PK for acgi.Job.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '3F7CAD3C-614C-448A-A3DE-3AD56C3A0BC9' AND [Name] = 'recordKey';

/* Set soft FK for acgi.Job.custId → Customer.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '617D549E-533C-420E-81A5-1C6785B4E23D',
                                    [RelatedEntityFieldName] = 'recordKey',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '3F7CAD3C-614C-448A-A3DE-3AD56C3A0BC9' AND [Name] = 'custId';

/* Set soft PK for acgi.Membership.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '5AB42973-A474-4760-95C0-D19D4EC86FAB' AND [Name] = 'recordKey';

/* Set soft FK for acgi.Membership.custId → Customer.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '617D549E-533C-420E-81A5-1C6785B4E23D',
                                    [RelatedEntityFieldName] = 'recordKey',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '5AB42973-A474-4760-95C0-D19D4EC86FAB' AND [Name] = 'custId';

/* Set soft PK for acgi.Phone.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'AA45AA7C-5433-4E3C-AB6C-841C712C04E0' AND [Name] = 'recordKey';

/* Set soft FK for acgi.Phone.custId → Customer.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '617D549E-533C-420E-81A5-1C6785B4E23D',
                                    [RelatedEntityFieldName] = 'recordKey',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'AA45AA7C-5433-4E3C-AB6C-841C712C04E0' AND [Name] = 'custId';

/* Set soft PK for acgi.ReferralInfo.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '3E9C15C2-045F-4C6B-AC93-416F900DC2D5' AND [Name] = 'recordKey';

/* Set soft FK for acgi.ReferralInfo.custId → Customer.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '617D549E-533C-420E-81A5-1C6785B4E23D',
                                    [RelatedEntityFieldName] = 'recordKey',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '3E9C15C2-045F-4C6B-AC93-416F900DC2D5' AND [Name] = 'custId';

/* Set soft PK for acgi.Subscription.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'BDC6581F-68CC-4608-8881-19907881A632' AND [Name] = 'recordKey';

/* Set soft FK for acgi.Subscription.custId → Customer.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '617D549E-533C-420E-81A5-1C6785B4E23D',
                                    [RelatedEntityFieldName] = 'recordKey',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'BDC6581F-68CC-4608-8881-19907881A632' AND [Name] = 'custId';

/* Set soft PK for acgi.Website.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '4634372E-91D9-4A91-9006-1F7A726EBE5B' AND [Name] = 'recordKey';

/* Set soft FK for acgi.Website.custId → Customer.recordKey */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '617D549E-533C-420E-81A5-1C6785B4E23D',
                                    [RelatedEntityFieldName] = 'recordKey',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '4634372E-91D9-4A91-9006-1F7A726EBE5B' AND [Name] = 'custId';

