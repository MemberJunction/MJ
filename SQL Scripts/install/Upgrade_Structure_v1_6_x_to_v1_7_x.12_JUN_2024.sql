/*

   MemberJunction Upgrade Script
   TYPE: STRUCTURE
   FROM: 1.6.x
   TO:   1.7.x
*/
SET NUMERIC_ROUNDABORT OFF
GO
SET ANSI_PADDING, ANSI_WARNINGS, CONCAT_NULL_YIELDS_NULL, ARITHABORT, QUOTED_IDENTIFIER, ANSI_NULLS ON
GO
SET XACT_ABORT ON
GO
SET TRANSACTION ISOLATION LEVEL Serializable
GO
BEGIN TRANSACTION
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[RecordChange]'
GO
ALTER TABLE [__mj].[RecordChange] DROP CONSTRAINT [CK_RecordChange_Status]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[ApplicationEntity]'
GO
ALTER TABLE [__mj].[ApplicationEntity] DROP CONSTRAINT [DF_ApplicationEntity_DefaultForNewUser]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Dropping constraints from [__mj].[RecordChange]'
GO
ALTER TABLE [__mj].[RecordChange] DROP CONSTRAINT [DF_RecordChange_Status]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateWorkflow] on [__mj].[Workflow]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the Workflow table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateWorkflow]
ON [__mj].[Workflow]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Workflow]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[Workflow] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateAIModelAction] on [__mj].[AIModelAction]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the AIModelAction table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateAIModelAction]
ON [__mj].[AIModelAction]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[AIModelAction]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[AIModelAction] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateEntityField] on [__mj].[EntityField]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the EntityField table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateEntityField]
ON [__mj].[EntityField]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityField]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[EntityField] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateEntityBehaviorType] on [__mj].[EntityBehaviorType]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the EntityBehaviorType table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateEntityBehaviorType]
ON [__mj].[EntityBehaviorType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityBehaviorType]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[EntityBehaviorType] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateEmployeeCompanyIntegration] on [__mj].[EmployeeCompanyIntegration]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the EmployeeCompanyIntegration table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateEmployeeCompanyIntegration]
ON [__mj].[EmployeeCompanyIntegration]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EmployeeCompanyIntegration]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[EmployeeCompanyIntegration] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateEntityDocument] on [__mj].[EntityDocument]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the EntityDocument table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateEntityDocument]
ON [__mj].[EntityDocument]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityDocument]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[EntityDocument] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateEntityAction] on [__mj].[EntityAction]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the EntityAction table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateEntityAction]
ON [__mj].[EntityAction]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityAction]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[EntityAction] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateCompanyIntegration] on [__mj].[CompanyIntegration]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the CompanyIntegration table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateCompanyIntegration]
ON [__mj].[CompanyIntegration]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[CompanyIntegration]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[CompanyIntegration] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateRecommendation] on [__mj].[Recommendation]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the Recommendation table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateRecommendation]
ON [__mj].[Recommendation]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Recommendation]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[Recommendation] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateQueryPermission] on [__mj].[QueryPermission]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the QueryPermission table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateQueryPermission]
ON [__mj].[QueryPermission]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[QueryPermission]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[QueryPermission] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateReport] on [__mj].[Report]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the Report table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateReport]
ON [__mj].[Report]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Report]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[Report] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateActionContextType] on [__mj].[ActionContextType]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the ActionContextType table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateActionContextType]
ON [__mj].[ActionContextType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ActionContextType]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[ActionContextType] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateListCategory] on [__mj].[ListCategory]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the ListCategory table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateListCategory]
ON [__mj].[ListCategory]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ListCategory]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[ListCategory] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateRecordMergeDeletionLog] on [__mj].[RecordMergeDeletionLog]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the RecordMergeDeletionLog table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateRecordMergeDeletionLog]
ON [__mj].[RecordMergeDeletionLog]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[RecordMergeDeletionLog]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[RecordMergeDeletionLog] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateSchemaInfo] on [__mj].[SchemaInfo]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the SchemaInfo table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateSchemaInfo]
ON [__mj].[SchemaInfo]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[SchemaInfo]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[SchemaInfo] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateActionCategory] on [__mj].[ActionCategory]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the ActionCategory table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateActionCategory]
ON [__mj].[ActionCategory]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ActionCategory]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[ActionCategory] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateFile] on [__mj].[File]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the File table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateFile]
ON [__mj].[File]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[File]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[File] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateAIModel] on [__mj].[AIModel]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the AIModel table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateAIModel]
ON [__mj].[AIModel]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[AIModel]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[AIModel] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateApplicationSetting] on [__mj].[ApplicationSetting]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the ApplicationSetting table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateApplicationSetting]
ON [__mj].[ApplicationSetting]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ApplicationSetting]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[ApplicationSetting] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateAction] on [__mj].[Action]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the Action table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateAction]
ON [__mj].[Action]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Action]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[Action] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateTemplateParam] on [__mj].[TemplateParam]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the TemplateParam table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateTemplateParam]
ON [__mj].[TemplateParam]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[TemplateParam]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[TemplateParam] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateRole] on [__mj].[Role]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the Role table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateRole]
ON [__mj].[Role]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Role]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[Role] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateEntityDocumentType] on [__mj].[EntityDocumentType]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the EntityDocumentType table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateEntityDocumentType]
ON [__mj].[EntityDocumentType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityDocumentType]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[EntityDocumentType] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateUserView] on [__mj].[UserView]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the UserView table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateUserView]
ON [__mj].[UserView]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[UserView]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[UserView] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateCommunicationProviderMessageType] on [__mj].[CommunicationProviderMessageType]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the CommunicationProviderMessageType table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateCommunicationProviderMessageType]
ON [__mj].[CommunicationProviderMessageType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[CommunicationProviderMessageType]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[CommunicationProviderMessageType] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateEntityRecordDocument] on [__mj].[EntityRecordDocument]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the EntityRecordDocument table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateEntityRecordDocument]
ON [__mj].[EntityRecordDocument]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityRecordDocument]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[EntityRecordDocument] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateEntityActionInvocationType] on [__mj].[EntityActionInvocationType]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the EntityActionInvocationType table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateEntityActionInvocationType]
ON [__mj].[EntityActionInvocationType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityActionInvocationType]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[EntityActionInvocationType] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateActionLibrary] on [__mj].[ActionLibrary]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the ActionLibrary table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateActionLibrary]
ON [__mj].[ActionLibrary]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ActionLibrary]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[ActionLibrary] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateDuplicateRun] on [__mj].[DuplicateRun]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the DuplicateRun table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateDuplicateRun]
ON [__mj].[DuplicateRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[DuplicateRun]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[DuplicateRun] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateVectorIndex] on [__mj].[VectorIndex]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the VectorIndex table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateVectorIndex]
ON [__mj].[VectorIndex]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[VectorIndex]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[VectorIndex] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateActionAuthorization] on [__mj].[ActionAuthorization]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the ActionAuthorization table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateActionAuthorization]
ON [__mj].[ActionAuthorization]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ActionAuthorization]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[ActionAuthorization] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateAuditLog] on [__mj].[AuditLog]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the AuditLog table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateAuditLog]
ON [__mj].[AuditLog]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[AuditLog]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[AuditLog] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateTemplateContent] on [__mj].[TemplateContent]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the TemplateContent table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateTemplateContent]
ON [__mj].[TemplateContent]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[TemplateContent]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[TemplateContent] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateWorkspace] on [__mj].[Workspace]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the Workspace table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateWorkspace]
ON [__mj].[Workspace]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Workspace]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[Workspace] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateActionFilter] on [__mj].[ActionFilter]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the ActionFilter table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateActionFilter]
ON [__mj].[ActionFilter]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ActionFilter]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[ActionFilter] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateVersionInstallation] on [__mj].[VersionInstallation]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the VersionInstallation table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateVersionInstallation]
ON [__mj].[VersionInstallation]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[VersionInstallation]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[VersionInstallation] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateEntityDocumentRun] on [__mj].[EntityDocumentRun]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the EntityDocumentRun table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateEntityDocumentRun]
ON [__mj].[EntityDocumentRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityDocumentRun]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[EntityDocumentRun] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateActionResultCode] on [__mj].[ActionResultCode]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the ActionResultCode table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateActionResultCode]
ON [__mj].[ActionResultCode]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ActionResultCode]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[ActionResultCode] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateDuplicateRunDetailMatch] on [__mj].[DuplicateRunDetailMatch]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the DuplicateRunDetailMatch table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateDuplicateRunDetailMatch]
ON [__mj].[DuplicateRunDetailMatch]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[DuplicateRunDetailMatch]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[DuplicateRunDetailMatch] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateRecordMergeLog] on [__mj].[RecordMergeLog]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the RecordMergeLog table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateRecordMergeLog]
ON [__mj].[RecordMergeLog]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[RecordMergeLog]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[RecordMergeLog] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateCommunicationRun] on [__mj].[CommunicationRun]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the CommunicationRun table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateCommunicationRun]
ON [__mj].[CommunicationRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[CommunicationRun]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[CommunicationRun] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateActionParam] on [__mj].[ActionParam]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the ActionParam table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateActionParam]
ON [__mj].[ActionParam]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ActionParam]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[ActionParam] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateEntityCommunicationField] on [__mj].[EntityCommunicationField]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the EntityCommunicationField table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateEntityCommunicationField]
ON [__mj].[EntityCommunicationField]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityCommunicationField]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[EntityCommunicationField] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateFileEntityRecordLink] on [__mj].[FileEntityRecordLink]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the FileEntityRecordLink table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateFileEntityRecordLink]
ON [__mj].[FileEntityRecordLink]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[FileEntityRecordLink]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[FileEntityRecordLink] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateCommunicationLog] on [__mj].[CommunicationLog]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the CommunicationLog table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateCommunicationLog]
ON [__mj].[CommunicationLog]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[CommunicationLog]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[CommunicationLog] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[Query]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[Query] ADD
[UserQuestion] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[TechnicalDescription] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[ExecutionCostRank] [int] NULL
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateQuery] on [__mj].[Query]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the Query table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateQuery]
ON [__mj].[Query]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Query]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[Query] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateEntityActionInvocation] on [__mj].[EntityActionInvocation]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the EntityActionInvocation table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateEntityActionInvocation]
ON [__mj].[EntityActionInvocation]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityActionInvocation]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[EntityActionInvocation] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateEntityBehavior] on [__mj].[EntityBehavior]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the EntityBehavior table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateEntityBehavior]
ON [__mj].[EntityBehavior]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityBehavior]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[EntityBehavior] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateDataContext] on [__mj].[DataContext]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the DataContext table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateDataContext]
ON [__mj].[DataContext]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[DataContext]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[DataContext] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateUser] on [__mj].[User]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the User table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateUser]
ON [__mj].[User]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[User]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[User] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateQueryCategory] on [__mj].[QueryCategory]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the QueryCategory table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateQueryCategory]
ON [__mj].[QueryCategory]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[QueryCategory]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[QueryCategory] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateDataContextItem] on [__mj].[DataContextItem]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the DataContextItem table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateDataContextItem]
ON [__mj].[DataContextItem]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[DataContextItem]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[DataContextItem] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateCompany] on [__mj].[Company]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the Company table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateCompany]
ON [__mj].[Company]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Company]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[Company] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateConversationDetail] on [__mj].[ConversationDetail]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the ConversationDetail table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateConversationDetail]
ON [__mj].[ConversationDetail]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ConversationDetail]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[ConversationDetail] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateTemplateCategory] on [__mj].[TemplateCategory]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the TemplateCategory table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateTemplateCategory]
ON [__mj].[TemplateCategory]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[TemplateCategory]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[TemplateCategory] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateCommunicationProvider] on [__mj].[CommunicationProvider]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the CommunicationProvider table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateCommunicationProvider]
ON [__mj].[CommunicationProvider]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[CommunicationProvider]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[CommunicationProvider] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateConversation] on [__mj].[Conversation]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the Conversation table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateConversation]
ON [__mj].[Conversation]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Conversation]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[Conversation] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateCompanyIntegrationRecordMap] on [__mj].[CompanyIntegrationRecordMap]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the CompanyIntegrationRecordMap table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateCompanyIntegrationRecordMap]
ON [__mj].[CompanyIntegrationRecordMap]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[CompanyIntegrationRecordMap]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[CompanyIntegrationRecordMap] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateEmployee] on [__mj].[Employee]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the Employee table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateEmployee]
ON [__mj].[Employee]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Employee]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[Employee] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[Application]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[Application] ADD
[Icon] [nvarchar] (500) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[DefaultForNewUser] [bit] NOT NULL CONSTRAINT [DF_Application_DefaultForNewUser] DEFAULT ((1))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateApplication] on [__mj].[Application]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the Application table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateApplication]
ON [__mj].[Application]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Application]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[Application] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateDuplicateRunDetail] on [__mj].[DuplicateRunDetail]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the DuplicateRunDetail table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateDuplicateRunDetail]
ON [__mj].[DuplicateRunDetail]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[DuplicateRunDetail]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[DuplicateRunDetail] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateUserViewCategory] on [__mj].[UserViewCategory]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the UserViewCategory table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateUserViewCategory]
ON [__mj].[UserViewCategory]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[UserViewCategory]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[UserViewCategory] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateEntitySetting] on [__mj].[EntitySetting]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the EntitySetting table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateEntitySetting]
ON [__mj].[EntitySetting]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntitySetting]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[EntitySetting] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateTemplate] on [__mj].[Template]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the Template table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateTemplate]
ON [__mj].[Template]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Template]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[Template] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateFileStorageProvider] on [__mj].[FileStorageProvider]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the FileStorageProvider table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateFileStorageProvider]
ON [__mj].[FileStorageProvider]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[FileStorageProvider]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[FileStorageProvider] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateRecommendationItem] on [__mj].[RecommendationItem]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the RecommendationItem table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateRecommendationItem]
ON [__mj].[RecommendationItem]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[RecommendationItem]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[RecommendationItem] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateQueue] on [__mj].[Queue]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the Queue table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateQueue]
ON [__mj].[Queue]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Queue]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[Queue] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateActionExecutionLog] on [__mj].[ActionExecutionLog]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the ActionExecutionLog table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateActionExecutionLog]
ON [__mj].[ActionExecutionLog]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ActionExecutionLog]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[ActionExecutionLog] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateApplicationEntity] on [__mj].[ApplicationEntity]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the ApplicationEntity table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateApplicationEntity]
ON [__mj].[ApplicationEntity]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ApplicationEntity]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[ApplicationEntity] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateEntityRelationship] on [__mj].[EntityRelationship]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the EntityRelationship table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateEntityRelationship]
ON [__mj].[EntityRelationship]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityRelationship]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[EntityRelationship] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateLibrary] on [__mj].[Library]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the Library table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateLibrary]
ON [__mj].[Library]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Library]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[Library] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[Entity]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[Entity] ADD
[Icon] [nvarchar] (500) COLLATE SQL_Latin1_General_CP1_CI_AS NULL
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateEntity] on [__mj].[Entity]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the Entity table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateEntity]
ON [__mj].[Entity]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Entity]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[Entity] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateEmployeeRole] on [__mj].[EmployeeRole]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the EmployeeRole table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateEmployeeRole]
ON [__mj].[EmployeeRole]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EmployeeRole]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[EmployeeRole] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateVectorDatabase] on [__mj].[VectorDatabase]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the VectorDatabase table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateVectorDatabase]
ON [__mj].[VectorDatabase]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[VectorDatabase]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[VectorDatabase] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateFileCategory] on [__mj].[FileCategory]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the FileCategory table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateFileCategory]
ON [__mj].[FileCategory]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[FileCategory]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[FileCategory] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateEmployeeSkill] on [__mj].[EmployeeSkill]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the EmployeeSkill table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateEmployeeSkill]
ON [__mj].[EmployeeSkill]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EmployeeSkill]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[EmployeeSkill] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateEntityPermission] on [__mj].[EntityPermission]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the EntityPermission table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateEntityPermission]
ON [__mj].[EntityPermission]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityPermission]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[EntityPermission] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateWorkspaceItem] on [__mj].[WorkspaceItem]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the WorkspaceItem table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateWorkspaceItem]
ON [__mj].[WorkspaceItem]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[WorkspaceItem]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[WorkspaceItem] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateCommunicationBaseMessageType] on [__mj].[CommunicationBaseMessageType]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the CommunicationBaseMessageType table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateCommunicationBaseMessageType]
ON [__mj].[CommunicationBaseMessageType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[CommunicationBaseMessageType]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[CommunicationBaseMessageType] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateWorkflowEngine] on [__mj].[WorkflowEngine]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the WorkflowEngine table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateWorkflowEngine]
ON [__mj].[WorkflowEngine]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[WorkflowEngine]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[WorkflowEngine] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateEntityActionFilter] on [__mj].[EntityActionFilter]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the EntityActionFilter table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateEntityActionFilter]
ON [__mj].[EntityActionFilter]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityActionFilter]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[EntityActionFilter] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateUserNotification] on [__mj].[UserNotification]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the UserNotification table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateUserNotification]
ON [__mj].[UserNotification]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[UserNotification]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[UserNotification] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateUserFavorite] on [__mj].[UserFavorite]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the UserFavorite table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateUserFavorite]
ON [__mj].[UserFavorite]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[UserFavorite]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[UserFavorite] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateIntegration] on [__mj].[Integration]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the Integration table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateIntegration]
ON [__mj].[Integration]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Integration]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[Integration] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateActionContext] on [__mj].[ActionContext]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the ActionContext table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateActionContext]
ON [__mj].[ActionContext]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ActionContext]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[ActionContext] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateEntityCommunicationMessageType] on [__mj].[EntityCommunicationMessageType]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the EntityCommunicationMessageType table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateEntityCommunicationMessageType]
ON [__mj].[EntityCommunicationMessageType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityCommunicationMessageType]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[EntityCommunicationMessageType] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateTemplateContentType] on [__mj].[TemplateContentType]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the TemplateContentType table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateTemplateContentType]
ON [__mj].[TemplateContentType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[TemplateContentType]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[TemplateContentType] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateAIAction] on [__mj].[AIAction]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the AIAction table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateAIAction]
ON [__mj].[AIAction]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[AIAction]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[AIAction] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateReportCategory] on [__mj].[ReportCategory]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the ReportCategory table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateReportCategory]
ON [__mj].[ReportCategory]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ReportCategory]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[ReportCategory] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateEntityDocumentSetting] on [__mj].[EntityDocumentSetting]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the EntityDocumentSetting table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateEntityDocumentSetting]
ON [__mj].[EntityDocumentSetting]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityDocumentSetting]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[EntityDocumentSetting] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateList] on [__mj].[List]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the List table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateList]
ON [__mj].[List]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[List]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[List] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateRecommendationProvider] on [__mj].[RecommendationProvider]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the RecommendationProvider table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateRecommendationProvider]
ON [__mj].[RecommendationProvider]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[RecommendationProvider]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[RecommendationProvider] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateDashboardCategory] on [__mj].[DashboardCategory]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the DashboardCategory table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateDashboardCategory]
ON [__mj].[DashboardCategory]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[DashboardCategory]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[DashboardCategory] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateQueryField] on [__mj].[QueryField]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the QueryField table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateQueryField]
ON [__mj].[QueryField]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[QueryField]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[QueryField] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating trigger [__mj].[trgUpdateRecommendationRun] on [__mj].[RecommendationRun]'
GO


------------------------------------------------------------
----- TRIGGER FOR UpdatedAt field for the RecommendationRun table
------------------------------------------------------------
CREATE   TRIGGER [__mj].[trgUpdateRecommendationRun]
ON [__mj].[RecommendationRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[RecommendationRun]
    SET 
        UpdatedAt = GETDATE()
    FROM 
        [__mj].[RecommendationRun] AS _organicTable
    INNER JOIN 
        INSERTED AS I ON 
        _organicTable.[ID] = I.[ID];
END;
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[RecordChange]'
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[RecordChange] ADD
[Type] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_RecordChange_Type] DEFAULT (N'Create'),
[Source] [nvarchar] (20) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[IntegrationID] [int] NULL,
[ErrorLog] [nvarchar] (max) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
[CreatedAt] [datetime] NOT NULL CONSTRAINT [DF_RecordChange_CreatedAt] DEFAULT (getdate()),
[UpdatedAt] [datetime] NOT NULL CONSTRAINT [DF_RecordChange_UpdatedAt] DEFAULT (getdate())
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[RecordChange] ALTER COLUMN [RecordID] [nvarchar] (750) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
ALTER TABLE [__mj].[RecordChange] ALTER COLUMN [Status] [nvarchar] (50) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[RecordChange]'
GO
ALTER TABLE [__mj].[RecordChange] ADD CONSTRAINT [DF_RecordChange_Status] DEFAULT (N'Complete') FOR [Status]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating index [IX_RecordChange_RecordID] on [__mj].[RecordChange]'
GO
CREATE NONCLUSTERED INDEX [IX_RecordChange_RecordID] ON [__mj].[RecordChange] ([RecordID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateDuplicateRunDetailMatch]'
GO


ALTER PROCEDURE [__mj].[spUpdateDuplicateRunDetailMatch]
    @ID int,
    @DuplicateRunDetailID int,
    @MatchSource nvarchar(20),
    @MatchRecordID nvarchar(500),
    @MatchProbability numeric(12, 11),
    @MatchedAt datetime,
    @Action nvarchar(20),
    @ApprovalStatus nvarchar(20),
    @MergeStatus nvarchar(20),
    @MergedAt datetime,
    @RecordMergeLogID int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[DuplicateRunDetailMatch]
    SET 
        [DuplicateRunDetailID] = @DuplicateRunDetailID,
        [MatchSource] = @MatchSource,
        [MatchRecordID] = @MatchRecordID,
        [MatchProbability] = @MatchProbability,
        [MatchedAt] = @MatchedAt,
        [Action] = @Action,
        [ApprovalStatus] = @ApprovalStatus,
        [MergeStatus] = @MergeStatus,
        [MergedAt] = @MergedAt,
        [RecordMergeLogID] = @RecordMergeLogID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwDuplicateRunDetailMatches] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateEntityDocumentRun]'
GO


ALTER PROCEDURE [__mj].[spUpdateEntityDocumentRun]
    @ID int,
    @EntityDocumentID int,
    @StartedAt datetime,
    @EndedAt datetime,
    @Status nvarchar(15)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityDocumentRun]
    SET 
        [EntityDocumentID] = @EntityDocumentID,
        [StartedAt] = @StartedAt,
        [EndedAt] = @EndedAt,
        [Status] = @Status
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwEntityDocumentRuns] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateRecommendationItem]'
GO


ALTER PROCEDURE [__mj].[spUpdateRecommendationItem]
    @ID int,
    @RecommendationID int,
    @DestinationEntityID int,
    @DestinationEntityRecordID nvarchar(MAX),
    @MatchProbability decimal(18, 15)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[RecommendationItem]
    SET 
        [RecommendationID] = @RecommendationID,
        [DestinationEntityID] = @DestinationEntityID,
        [DestinationEntityRecordID] = @DestinationEntityRecordID,
        [MatchProbability] = @MatchProbability
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwRecommendationItems] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateEntityAction]'
GO


ALTER PROCEDURE [__mj].[spUpdateEntityAction]
    @ID int,
    @EntityID int,
    @ActionID int,
    @Status nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityAction]
    SET 
        [EntityID] = @EntityID,
        [ActionID] = @ActionID,
        [Status] = @Status
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwEntityActions] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateFileEntityRecordLink]'
GO


ALTER PROCEDURE [__mj].[spUpdateFileEntityRecordLink]
    @ID int,
    @FileID int,
    @EntityID int,
    @RecordID nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[FileEntityRecordLink]
    SET 
        [FileID] = @FileID,
        [EntityID] = @EntityID,
        [RecordID] = @RecordID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwFileEntityRecordLinks] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateDataContextItem]'
GO


ALTER PROCEDURE [__mj].[spUpdateDataContextItem]
    @ID int,
    @DataContextID int,
    @Type nvarchar(50),
    @ViewID int,
    @QueryID int,
    @EntityID int,
    @RecordID nvarchar(255),
    @SQL nvarchar(MAX),
    @DataJSON nvarchar(MAX),
    @LastRefreshedAt datetime
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[DataContextItem]
    SET 
        [DataContextID] = @DataContextID,
        [Type] = @Type,
        [ViewID] = @ViewID,
        [QueryID] = @QueryID,
        [EntityID] = @EntityID,
        [RecordID] = @RecordID,
        [SQL] = @SQL,
        [DataJSON] = @DataJSON,
        [LastRefreshedAt] = @LastRefreshedAt
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwDataContextItems] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateActionContextType]'
GO


ALTER PROCEDURE [__mj].[spUpdateActionContextType]
    @ID int,
    @Name nvarchar(255),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ActionContextType]
    SET 
        [Name] = @Name,
        [Description] = @Description
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwActionContextTypes] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateEntityCommunicationField]'
GO


ALTER PROCEDURE [__mj].[spUpdateEntityCommunicationField]
    @ID int,
    @EntityCommunicationMessageTypeID int,
    @FieldName nvarchar(500),
    @Priority int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityCommunicationField]
    SET 
        [EntityCommunicationMessageTypeID] = @EntityCommunicationMessageTypeID,
        [FieldName] = @FieldName,
        [Priority] = @Priority
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwEntityCommunicationFields] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateFileCategory]'
GO


ALTER PROCEDURE [__mj].[spUpdateFileCategory]
    @ID int,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @ParentID int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[FileCategory]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [ParentID] = @ParentID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwFileCategories] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateEntityDocument]'
GO


ALTER PROCEDURE [__mj].[spUpdateEntityDocument]
    @ID int,
    @Name nvarchar(250),
    @EntityID int,
    @TypeID int,
    @Status nvarchar(15),
    @Template nvarchar(MAX),
    @VectorDatabaseID int,
    @AIModelID int,
    @PotentialMatchThreshold numeric(12, 11),
    @AbsoluteMatchThreshold numeric(12, 11)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityDocument]
    SET 
        [Name] = @Name,
        [EntityID] = @EntityID,
        [TypeID] = @TypeID,
        [Status] = @Status,
        [Template] = @Template,
        [VectorDatabaseID] = @VectorDatabaseID,
        [AIModelID] = @AIModelID,
        [PotentialMatchThreshold] = @PotentialMatchThreshold,
        [AbsoluteMatchThreshold] = @AbsoluteMatchThreshold
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwEntityDocuments] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateActionCategory]'
GO


ALTER PROCEDURE [__mj].[spUpdateActionCategory]
    @ID int,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @ParentID int,
    @Status nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ActionCategory]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [ParentID] = @ParentID,
        [Status] = @Status
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwActionCategories] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateActionParam]'
GO


ALTER PROCEDURE [__mj].[spUpdateActionParam]
    @ID int,
    @ActionID int,
    @Name nvarchar(255),
    @DefaultValue nvarchar(MAX),
    @Type nchar(10),
    @ValueType nvarchar(30),
    @IsArray bit,
    @Description nvarchar(MAX),
    @IsRequired bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ActionParam]
    SET 
        [ActionID] = @ActionID,
        [Name] = @Name,
        [DefaultValue] = @DefaultValue,
        [Type] = @Type,
        [ValueType] = @ValueType,
        [IsArray] = @IsArray,
        [Description] = @Description,
        [IsRequired] = @IsRequired
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwActionParams] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spCreateApplication]'
GO


ALTER PROCEDURE [__mj].[spCreateApplication]
    @Name nvarchar(50),
    @Description nvarchar(MAX),
    @Icon nvarchar(500),
    @DefaultForNewUser bit
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[Application]
        (
            [Name],
            [Description],
            [Icon],
            [DefaultForNewUser]
        )
    VALUES
        (
            @Name,
            @Description,
            @Icon,
            @DefaultForNewUser
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwApplications] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateVectorDatabase]'
GO


ALTER PROCEDURE [__mj].[spUpdateVectorDatabase]
    @ID int,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @DefaultURL nvarchar(255),
    @ClassKey nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[VectorDatabase]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [DefaultURL] = @DefaultURL,
        [ClassKey] = @ClassKey
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwVectorDatabases] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateRecommendationRun]'
GO


ALTER PROCEDURE [__mj].[spUpdateRecommendationRun]
    @ID int,
    @RecommendationProviderID int,
    @StartDate datetime,
    @EndDate datetime,
    @Status nvarchar(50),
    @Description nvarchar(MAX),
    @RunByUserID int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[RecommendationRun]
    SET 
        [RecommendationProviderID] = @RecommendationProviderID,
        [StartDate] = @StartDate,
        [EndDate] = @EndDate,
        [Status] = @Status,
        [Description] = @Description,
        [RunByUserID] = @RunByUserID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwRecommendationRuns] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateAuditLog]'
GO


ALTER PROCEDURE [__mj].[spUpdateAuditLog]
    @ID int,
    @AuditLogTypeName nvarchar(50),
    @UserID int,
    @AuthorizationName nvarchar(100),
    @Status nvarchar(50),
    @Description nvarchar(MAX),
    @Details nvarchar(MAX),
    @EntityID int,
    @RecordID nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[AuditLog]
    SET 
        [AuditLogTypeName] = @AuditLogTypeName,
        [UserID] = @UserID,
        [AuthorizationName] = @AuthorizationName,
        [Status] = @Status,
        [Description] = @Description,
        [Details] = @Details,
        [EntityID] = @EntityID,
        [RecordID] = @RecordID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwAuditLogs] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[spCreateUserApplication]'
GO


CREATE PROCEDURE [__mj].[spCreateUserApplication]
    @UserID int,
    @ApplicationID int,
    @Sequence int,
    @IsActive bit
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[UserApplication]
        (
            [UserID],
            [ApplicationID],
            [Sequence],
            [IsActive]
        )
    VALUES
        (
            @UserID,
            @ApplicationID,
            @Sequence,
            @IsActive
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwUserApplications] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateCommunicationLog]'
GO


ALTER PROCEDURE [__mj].[spUpdateCommunicationLog]
    @ID int,
    @CommunicationProviderID int,
    @CommunicationProviderMessageTypeID int,
    @CommunicationRunID int,
    @Direction nvarchar(20),
    @MessageDate datetime,
    @Status nvarchar(50),
    @MessageContent nvarchar(MAX),
    @ErrorMessage nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[CommunicationLog]
    SET 
        [CommunicationProviderID] = @CommunicationProviderID,
        [CommunicationProviderMessageTypeID] = @CommunicationProviderMessageTypeID,
        [CommunicationRunID] = @CommunicationRunID,
        [Direction] = @Direction,
        [MessageDate] = @MessageDate,
        [Status] = @Status,
        [MessageContent] = @MessageContent,
        [ErrorMessage] = @ErrorMessage
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwCommunicationLogs] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateActionExecutionLog]'
GO


ALTER PROCEDURE [__mj].[spUpdateActionExecutionLog]
    @ID int,
    @ActionID int,
    @StartedAt datetime,
    @EndedAt datetime,
    @Params nvarchar(MAX),
    @ResultCode nvarchar(255),
    @UserID int,
    @RetentionPeriod int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ActionExecutionLog]
    SET 
        [ActionID] = @ActionID,
        [StartedAt] = @StartedAt,
        [EndedAt] = @EndedAt,
        [Params] = @Params,
        [ResultCode] = @ResultCode,
        [UserID] = @UserID,
        [RetentionPeriod] = @RetentionPeriod
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwActionExecutionLogs] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateEntityCommunicationMessageType]'
GO


ALTER PROCEDURE [__mj].[spUpdateEntityCommunicationMessageType]
    @ID int,
    @EntityID int,
    @BaseMessageTypeID int,
    @IsActive bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityCommunicationMessageType]
    SET 
        [EntityID] = @EntityID,
        [BaseMessageTypeID] = @BaseMessageTypeID,
        [IsActive] = @IsActive
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwEntityCommunicationMessageTypes] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateFile]'
GO


ALTER PROCEDURE [__mj].[spUpdateFile]
    @ID int,
    @Name nvarchar(500),
    @Description nvarchar(MAX),
    @ProviderID int,
    @ContentType nvarchar(50),
    @ProviderKey nvarchar(500),
    @CategoryID int,
    @Status nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[File]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [ProviderID] = @ProviderID,
        [ContentType] = @ContentType,
        [ProviderKey] = @ProviderKey,
        [CategoryID] = @CategoryID,
        [Status] = @Status
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwFiles] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateCompanyIntegrationRecordMap]'
GO


ALTER PROCEDURE [__mj].[spUpdateCompanyIntegrationRecordMap]
    @ID int,
    @CompanyIntegrationID int,
    @ExternalSystemRecordID nvarchar(100),
    @EntityID int,
    @EntityRecordID nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[CompanyIntegrationRecordMap]
    SET 
        [CompanyIntegrationID] = @CompanyIntegrationID,
        [ExternalSystemRecordID] = @ExternalSystemRecordID,
        [EntityID] = @EntityID,
        [EntityRecordID] = @EntityRecordID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwCompanyIntegrationRecordMaps] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateReport]'
GO


ALTER PROCEDURE [__mj].[spUpdateReport]
    @ID int,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @CategoryID int,
    @UserID int,
    @SharingScope nvarchar(20),
    @ConversationID int,
    @ConversationDetailID int,
    @DataContextID int,
    @Configuration nvarchar(MAX),
    @OutputTriggerTypeID int,
    @OutputFormatTypeID int,
    @OutputDeliveryTypeID int,
    @OutputEventID int,
    @OutputFrequency nvarchar(50),
    @OutputTargetEmail nvarchar(255),
    @OutputWorkflowID int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Report]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [CategoryID] = @CategoryID,
        [UserID] = @UserID,
        [SharingScope] = @SharingScope,
        [ConversationID] = @ConversationID,
        [ConversationDetailID] = @ConversationDetailID,
        [DataContextID] = @DataContextID,
        [Configuration] = @Configuration,
        [OutputTriggerTypeID] = @OutputTriggerTypeID,
        [OutputFormatTypeID] = @OutputFormatTypeID,
        [OutputDeliveryTypeID] = @OutputDeliveryTypeID,
        [OutputEventID] = @OutputEventID,
        [OutputFrequency] = @OutputFrequency,
        [OutputTargetEmail] = @OutputTargetEmail,
        [OutputWorkflowID] = @OutputWorkflowID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwReports] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateActionContext]'
GO


ALTER PROCEDURE [__mj].[spUpdateActionContext]
    @ID int,
    @ActionID int,
    @ContextTypeID int,
    @Status nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ActionContext]
    SET 
        [ActionID] = @ActionID,
        [ContextTypeID] = @ContextTypeID,
        [Status] = @Status
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwActionContexts] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateRecordMergeDeletionLog]'
GO


ALTER PROCEDURE [__mj].[spUpdateRecordMergeDeletionLog]
    @ID int,
    @RecordMergeLogID int,
    @DeletedRecordID nvarchar(255),
    @Status nvarchar(10),
    @ProcessingLog nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[RecordMergeDeletionLog]
    SET 
        [RecordMergeLogID] = @RecordMergeLogID,
        [DeletedRecordID] = @DeletedRecordID,
        [Status] = @Status,
        [ProcessingLog] = @ProcessingLog
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwRecordMergeDeletionLogs] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateCommunicationBaseMessageType]'
GO


ALTER PROCEDURE [__mj].[spUpdateCommunicationBaseMessageType]
    @ID int,
    @Type nvarchar(100),
    @SupportsAttachments bit,
    @SupportsSubjectLine bit,
    @SupportsHtml bit,
    @MaxBytes int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[CommunicationBaseMessageType]
    SET 
        [Type] = @Type,
        [SupportsAttachments] = @SupportsAttachments,
        [SupportsSubjectLine] = @SupportsSubjectLine,
        [SupportsHtml] = @SupportsHtml,
        [MaxBytes] = @MaxBytes
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwCommunicationBaseMessageTypes] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateApplicationEntity]'
GO


ALTER PROCEDURE [__mj].[spUpdateApplicationEntity]
    @ID int,
    @ApplicationName nvarchar(50),
    @EntityID int,
    @Sequence int,
    @DefaultForNewUser bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ApplicationEntity]
    SET 
        [ApplicationName] = @ApplicationName,
        [EntityID] = @EntityID,
        [Sequence] = @Sequence,
        [DefaultForNewUser] = @DefaultForNewUser
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwApplicationEntities] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateIntegration]'
GO


ALTER PROCEDURE [__mj].[spUpdateIntegration]
    @ID int,
    @Name nvarchar(100),
    @Description nvarchar(255),
    @NavigationBaseURL nvarchar(500),
    @ClassName nvarchar(100),
    @ImportPath nvarchar(100),
    @BatchMaxRequestCount int,
    @BatchRequestWaitTime int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Integration]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [NavigationBaseURL] = @NavigationBaseURL,
        [ClassName] = @ClassName,
        [ImportPath] = @ImportPath,
        [BatchMaxRequestCount] = @BatchMaxRequestCount,
        [BatchRequestWaitTime] = @BatchRequestWaitTime
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwIntegrations] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateActionResultCode]'
GO


ALTER PROCEDURE [__mj].[spUpdateActionResultCode]
    @ID int,
    @ActionID int,
    @ResultCode nvarchar(255),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ActionResultCode]
    SET 
        [ActionID] = @ActionID,
        [ResultCode] = @ResultCode,
        [Description] = @Description
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwActionResultCodes] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateRecordMergeLog]'
GO


ALTER PROCEDURE [__mj].[spUpdateRecordMergeLog]
    @ID int,
    @EntityID int,
    @SurvivingRecordID nvarchar(255),
    @InitiatedByUserID int,
    @ApprovalStatus nvarchar(10),
    @ApprovedByUserID int,
    @ProcessingStatus nvarchar(10),
    @ProcessingStartedAt datetime,
    @ProcessingEndedAt datetime,
    @ProcessingLog nvarchar(MAX),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[RecordMergeLog]
    SET 
        [EntityID] = @EntityID,
        [SurvivingRecordID] = @SurvivingRecordID,
        [InitiatedByUserID] = @InitiatedByUserID,
        [ApprovalStatus] = @ApprovalStatus,
        [ApprovedByUserID] = @ApprovedByUserID,
        [ProcessingStatus] = @ProcessingStatus,
        [ProcessingStartedAt] = @ProcessingStartedAt,
        [ProcessingEndedAt] = @ProcessingEndedAt,
        [ProcessingLog] = @ProcessingLog,
        [Comments] = @Comments
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwRecordMergeLogs] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateTemplate]'
GO


ALTER PROCEDURE [__mj].[spUpdateTemplate]
    @ID int,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @UserPrompt nvarchar(MAX),
    @CategoryID int,
    @UserID int,
    @ActiveAt datetime,
    @DisabledAt datetime,
    @IsActive bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Template]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [UserPrompt] = @UserPrompt,
        [CategoryID] = @CategoryID,
        [UserID] = @UserID,
        [ActiveAt] = @ActiveAt,
        [DisabledAt] = @DisabledAt,
        [IsActive] = @IsActive
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwTemplates] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateEntityPermission]'
GO


ALTER PROCEDURE [__mj].[spUpdateEntityPermission]
    @ID int,
    @EntityID int,
    @RoleName nvarchar(50),
    @CanCreate bit,
    @CanRead bit,
    @CanUpdate bit,
    @CanDelete bit,
    @ReadRLSFilterID int,
    @CreateRLSFilterID int,
    @UpdateRLSFilterID int,
    @DeleteRLSFilterID int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityPermission]
    SET 
        [EntityID] = @EntityID,
        [RoleName] = @RoleName,
        [CanCreate] = @CanCreate,
        [CanRead] = @CanRead,
        [CanUpdate] = @CanUpdate,
        [CanDelete] = @CanDelete,
        [ReadRLSFilterID] = @ReadRLSFilterID,
        [CreateRLSFilterID] = @CreateRLSFilterID,
        [UpdateRLSFilterID] = @UpdateRLSFilterID,
        [DeleteRLSFilterID] = @DeleteRLSFilterID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwEntityPermissions] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateQueryField]'
GO


ALTER PROCEDURE [__mj].[spUpdateQueryField]
    @ID int,
    @QueryID int,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Sequence int,
    @SQLBaseType nvarchar(50),
    @SQLFullType nvarchar(100),
    @SourceEntityID int,
    @SourceFieldName nvarchar(255),
    @IsComputed bit,
    @ComputationDescription nvarchar(MAX),
    @IsSummary bit,
    @SummaryDescription nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[QueryField]
    SET 
        [QueryID] = @QueryID,
        [Name] = @Name,
        [Description] = @Description,
        [Sequence] = @Sequence,
        [SQLBaseType] = @SQLBaseType,
        [SQLFullType] = @SQLFullType,
        [SourceEntityID] = @SourceEntityID,
        [SourceFieldName] = @SourceFieldName,
        [IsComputed] = @IsComputed,
        [ComputationDescription] = @ComputationDescription,
        [IsSummary] = @IsSummary,
        [SummaryDescription] = @SummaryDescription
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwQueryFields] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateCommunicationProviderMessageType]'
GO


ALTER PROCEDURE [__mj].[spUpdateCommunicationProviderMessageType]
    @ID int,
    @CommunicationProviderID int,
    @CommunicationBaseMessageTypeID int,
    @Name nvarchar(255),
    @Status nvarchar(20),
    @AdditionalAttributes nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[CommunicationProviderMessageType]
    SET 
        [CommunicationProviderID] = @CommunicationProviderID,
        [CommunicationBaseMessageTypeID] = @CommunicationBaseMessageTypeID,
        [Name] = @Name,
        [Status] = @Status,
        [AdditionalAttributes] = @AdditionalAttributes
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwCommunicationProviderMessageTypes] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateSchemaInfo]'
GO


ALTER PROCEDURE [__mj].[spUpdateSchemaInfo]
    @ID int,
    @SchemaName nvarchar(50),
    @EntityIDMin int,
    @EntityIDMax int,
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[SchemaInfo]
    SET 
        [SchemaName] = @SchemaName,
        [EntityIDMin] = @EntityIDMin,
        [EntityIDMax] = @EntityIDMax,
        [Comments] = @Comments
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwSchemaInfos] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateEmployeeSkill]'
GO


ALTER PROCEDURE [__mj].[spUpdateEmployeeSkill]
    @ID int,
    @EmployeeID int,
    @SkillID int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EmployeeSkill]
    SET 
        [EmployeeID] = @EmployeeID,
        [SkillID] = @SkillID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwEmployeeSkills] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateApplication]'
GO


ALTER PROCEDURE [__mj].[spUpdateApplication]
    @ID int,
    @Name nvarchar(50),
    @Description nvarchar(MAX),
    @Icon nvarchar(500),
    @DefaultForNewUser bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Application]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [Icon] = @Icon,
        [DefaultForNewUser] = @DefaultForNewUser
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwApplications] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateTemplateCategory]'
GO


ALTER PROCEDURE [__mj].[spUpdateTemplateCategory]
    @ID int,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @ParentID int,
    @UserID int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[TemplateCategory]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [ParentID] = @ParentID,
        [UserID] = @UserID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwTemplateCategories] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateRole]'
GO


ALTER PROCEDURE [__mj].[spUpdateRole]
    @ID int,
    @Name nvarchar(50),
    @Description nvarchar(MAX),
    @DirectoryID nvarchar(250),
    @SQLName nvarchar(250)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Role]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [DirectoryID] = @DirectoryID,
        [SQLName] = @SQLName
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwRoles] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spCreateEntity]'
GO


ALTER PROCEDURE [__mj].[spCreateEntity]
    @ID int,
    @ParentID int,
    @Name nvarchar(255),
    @NameSuffix nvarchar(255),
    @Description nvarchar(MAX),
    @AutoUpdateDescription bit,
    @BaseView nvarchar(255),
    @BaseViewGenerated bit,
    @VirtualEntity bit,
    @TrackRecordChanges bit,
    @AuditRecordAccess bit,
    @AuditViewRuns bit,
    @IncludeInAPI bit,
    @AllowAllRowsAPI bit,
    @AllowUpdateAPI bit,
    @AllowCreateAPI bit,
    @AllowDeleteAPI bit,
    @CustomResolverAPI bit,
    @AllowUserSearchAPI bit,
    @FullTextSearchEnabled bit,
    @FullTextCatalog nvarchar(255),
    @FullTextCatalogGenerated bit,
    @FullTextIndex nvarchar(255),
    @FullTextIndexGenerated bit,
    @FullTextSearchFunction nvarchar(255),
    @FullTextSearchFunctionGenerated bit,
    @UserViewMaxRows int,
    @spCreate nvarchar(255),
    @spUpdate nvarchar(255),
    @spDelete nvarchar(255),
    @spCreateGenerated bit,
    @spUpdateGenerated bit,
    @spDeleteGenerated bit,
    @CascadeDeletes bit,
    @spMatch nvarchar(255),
    @UserFormGenerated bit,
    @EntityObjectSubclassName nvarchar(255),
    @EntityObjectSubclassImport nvarchar(255),
    @PreferredCommunicationField nvarchar(255),
    @Icon nvarchar(500)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[Entity]
        (
            [ParentID],
            [Name],
            [NameSuffix],
            [Description],
            [AutoUpdateDescription],
            [BaseView],
            [BaseViewGenerated],
            [VirtualEntity],
            [TrackRecordChanges],
            [AuditRecordAccess],
            [AuditViewRuns],
            [IncludeInAPI],
            [AllowAllRowsAPI],
            [AllowUpdateAPI],
            [AllowCreateAPI],
            [AllowDeleteAPI],
            [CustomResolverAPI],
            [AllowUserSearchAPI],
            [FullTextSearchEnabled],
            [FullTextCatalog],
            [FullTextCatalogGenerated],
            [FullTextIndex],
            [FullTextIndexGenerated],
            [FullTextSearchFunction],
            [FullTextSearchFunctionGenerated],
            [UserViewMaxRows],
            [spCreate],
            [spUpdate],
            [spDelete],
            [spCreateGenerated],
            [spUpdateGenerated],
            [spDeleteGenerated],
            [CascadeDeletes],
            [spMatch],
            [UserFormGenerated],
            [EntityObjectSubclassName],
            [EntityObjectSubclassImport],
            [PreferredCommunicationField],
            [Icon]
        )
    VALUES
        (
            @ParentID,
            @Name,
            @NameSuffix,
            @Description,
            @AutoUpdateDescription,
            @BaseView,
            @BaseViewGenerated,
            @VirtualEntity,
            @TrackRecordChanges,
            @AuditRecordAccess,
            @AuditViewRuns,
            @IncludeInAPI,
            @AllowAllRowsAPI,
            @AllowUpdateAPI,
            @AllowCreateAPI,
            @AllowDeleteAPI,
            @CustomResolverAPI,
            @AllowUserSearchAPI,
            @FullTextSearchEnabled,
            @FullTextCatalog,
            @FullTextCatalogGenerated,
            @FullTextIndex,
            @FullTextIndexGenerated,
            @FullTextSearchFunction,
            @FullTextSearchFunctionGenerated,
            @UserViewMaxRows,
            @spCreate,
            @spUpdate,
            @spDelete,
            @spCreateGenerated,
            @spUpdateGenerated,
            @spDeleteGenerated,
            @CascadeDeletes,
            @spMatch,
            @UserFormGenerated,
            @EntityObjectSubclassName,
            @EntityObjectSubclassImport,
            @PreferredCommunicationField,
            @Icon
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwEntities] WHERE [ID] = @ID
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateAIModelAction]'
GO


ALTER PROCEDURE [__mj].[spUpdateAIModelAction]
    @ID int,
    @AIModelID int,
    @AIActionID int,
    @IsActive bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[AIModelAction]
    SET 
        [AIModelID] = @AIModelID,
        [AIActionID] = @AIActionID,
        [IsActive] = @IsActive
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwAIModelActions] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateEntityRelationship]'
GO


ALTER PROCEDURE [__mj].[spUpdateEntityRelationship]
    @ID int,
    @EntityID int,
    @Sequence int,
    @RelatedEntityID int,
    @BundleInAPI bit,
    @IncludeInParentAllQuery bit,
    @Type nchar(20),
    @EntityKeyField nvarchar(255),
    @RelatedEntityJoinField nvarchar(255),
    @JoinView nvarchar(255),
    @JoinEntityJoinField nvarchar(255),
    @JoinEntityInverseJoinField nvarchar(255),
    @DisplayInForm bit,
    @DisplayName nvarchar(255),
    @DisplayUserViewGUID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityRelationship]
    SET 
        [EntityID] = @EntityID,
        [Sequence] = @Sequence,
        [RelatedEntityID] = @RelatedEntityID,
        [BundleInAPI] = @BundleInAPI,
        [IncludeInParentAllQuery] = @IncludeInParentAllQuery,
        [Type] = @Type,
        [EntityKeyField] = @EntityKeyField,
        [RelatedEntityJoinField] = @RelatedEntityJoinField,
        [JoinView] = @JoinView,
        [JoinEntityJoinField] = @JoinEntityJoinField,
        [JoinEntityInverseJoinField] = @JoinEntityInverseJoinField,
        [DisplayInForm] = @DisplayInForm,
        [DisplayName] = @DisplayName
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwEntityRelationships] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating [__mj].[vwEntitiesWithExternalChangeTracking]'
GO

CREATE VIEW [__mj].[vwEntitiesWithExternalChangeTracking] 
AS
SELECT 
  e.* 
FROM 
  __mj.vwEntities e
WHERE 
  e.TrackRecordChanges=1 AND
  EXISTS (
		SELECT 
			1 
		FROM 
			__mj.vwEntityFields ef 
		WHERE 
			ef.Name='UpdatedAt' AND ef.Type='datetime' AND ef.EntityID = e.ID
		)
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateWorkspaceItem]'
GO


ALTER PROCEDURE [__mj].[spUpdateWorkspaceItem]
    @ID int,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @WorkSpaceID int,
    @ResourceTypeID int,
    @ResourceRecordID nvarchar(2000),
    @Sequence int,
    @Configuration nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[WorkspaceItem]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [WorkSpaceID] = @WorkSpaceID,
        [ResourceTypeID] = @ResourceTypeID,
        [ResourceRecordID] = @ResourceRecordID,
        [Sequence] = @Sequence,
        [Configuration] = @Configuration
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwWorkspaceItems] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateCompanyIntegration]'
GO


ALTER PROCEDURE [__mj].[spUpdateCompanyIntegration]
    @ID int,
    @CompanyName nvarchar(50),
    @IntegrationName nvarchar(100),
    @IsActive bit,
    @AccessToken nvarchar(255),
    @RefreshToken nvarchar(255),
    @TokenExpirationDate datetime,
    @APIKey nvarchar(255),
    @ExternalSystemID nvarchar(100),
    @IsExternalSystemReadOnly bit,
    @ClientID nvarchar(255),
    @ClientSecret nvarchar(255),
    @CustomAttribute1 nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[CompanyIntegration]
    SET 
        [CompanyName] = @CompanyName,
        [IntegrationName] = @IntegrationName,
        [IsActive] = @IsActive,
        [AccessToken] = @AccessToken,
        [RefreshToken] = @RefreshToken,
        [TokenExpirationDate] = @TokenExpirationDate,
        [APIKey] = @APIKey,
        [ExternalSystemID] = @ExternalSystemID,
        [IsExternalSystemReadOnly] = @IsExternalSystemReadOnly,
        [ClientID] = @ClientID,
        [ClientSecret] = @ClientSecret,
        [CustomAttribute1] = @CustomAttribute1
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwCompanyIntegrations] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateAIAction]'
GO


ALTER PROCEDURE [__mj].[spUpdateAIAction]
    @ID int,
    @Name nvarchar(50),
    @Description nvarchar(MAX),
    @DefaultModelID int,
    @DefaultPrompt nvarchar(MAX),
    @IsActive bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[AIAction]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [DefaultModelID] = @DefaultModelID,
        [DefaultPrompt] = @DefaultPrompt,
        [IsActive] = @IsActive
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwAIActions] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateWorkspace]'
GO


ALTER PROCEDURE [__mj].[spUpdateWorkspace]
    @ID int,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @UserID int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Workspace]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [UserID] = @UserID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwWorkspaces] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateEntity]'
GO


ALTER PROCEDURE [__mj].[spUpdateEntity]
    @ID int,
    @ParentID int,
    @Name nvarchar(255),
    @NameSuffix nvarchar(255),
    @Description nvarchar(MAX),
    @AutoUpdateDescription bit,
    @BaseView nvarchar(255),
    @BaseViewGenerated bit,
    @VirtualEntity bit,
    @TrackRecordChanges bit,
    @AuditRecordAccess bit,
    @AuditViewRuns bit,
    @IncludeInAPI bit,
    @AllowAllRowsAPI bit,
    @AllowUpdateAPI bit,
    @AllowCreateAPI bit,
    @AllowDeleteAPI bit,
    @CustomResolverAPI bit,
    @AllowUserSearchAPI bit,
    @FullTextSearchEnabled bit,
    @FullTextCatalog nvarchar(255),
    @FullTextCatalogGenerated bit,
    @FullTextIndex nvarchar(255),
    @FullTextIndexGenerated bit,
    @FullTextSearchFunction nvarchar(255),
    @FullTextSearchFunctionGenerated bit,
    @UserViewMaxRows int,
    @spCreate nvarchar(255),
    @spUpdate nvarchar(255),
    @spDelete nvarchar(255),
    @spCreateGenerated bit,
    @spUpdateGenerated bit,
    @spDeleteGenerated bit,
    @CascadeDeletes bit,
    @spMatch nvarchar(255),
    @UserFormGenerated bit,
    @EntityObjectSubclassName nvarchar(255),
    @EntityObjectSubclassImport nvarchar(255),
    @PreferredCommunicationField nvarchar(255),
    @Icon nvarchar(500)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Entity]
    SET 
        [ParentID] = @ParentID,
        [Name] = @Name,
        [NameSuffix] = @NameSuffix,
        [Description] = @Description,
        [AutoUpdateDescription] = @AutoUpdateDescription,
        [BaseView] = @BaseView,
        [BaseViewGenerated] = @BaseViewGenerated,
        [VirtualEntity] = @VirtualEntity,
        [TrackRecordChanges] = @TrackRecordChanges,
        [AuditRecordAccess] = @AuditRecordAccess,
        [AuditViewRuns] = @AuditViewRuns,
        [IncludeInAPI] = @IncludeInAPI,
        [AllowAllRowsAPI] = @AllowAllRowsAPI,
        [AllowUpdateAPI] = @AllowUpdateAPI,
        [AllowCreateAPI] = @AllowCreateAPI,
        [AllowDeleteAPI] = @AllowDeleteAPI,
        [CustomResolverAPI] = @CustomResolverAPI,
        [AllowUserSearchAPI] = @AllowUserSearchAPI,
        [FullTextSearchEnabled] = @FullTextSearchEnabled,
        [FullTextCatalog] = @FullTextCatalog,
        [FullTextCatalogGenerated] = @FullTextCatalogGenerated,
        [FullTextIndex] = @FullTextIndex,
        [FullTextIndexGenerated] = @FullTextIndexGenerated,
        [FullTextSearchFunction] = @FullTextSearchFunction,
        [FullTextSearchFunctionGenerated] = @FullTextSearchFunctionGenerated,
        [UserViewMaxRows] = @UserViewMaxRows,
        [spCreate] = @spCreate,
        [spUpdate] = @spUpdate,
        [spDelete] = @spDelete,
        [spCreateGenerated] = @spCreateGenerated,
        [spUpdateGenerated] = @spUpdateGenerated,
        [spDeleteGenerated] = @spDeleteGenerated,
        [CascadeDeletes] = @CascadeDeletes,
        [spMatch] = @spMatch,
        [UserFormGenerated] = @UserFormGenerated,
        [EntityObjectSubclassName] = @EntityObjectSubclassName,
        [EntityObjectSubclassImport] = @EntityObjectSubclassImport,
        [PreferredCommunicationField] = @PreferredCommunicationField,
        [Icon] = @Icon
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwEntities] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateDuplicateRunDetail]'
GO


ALTER PROCEDURE [__mj].[spUpdateDuplicateRunDetail]
    @ID int,
    @DuplicateRunID int,
    @RecordID nvarchar(500),
    @MatchStatus nvarchar(20),
    @SkippedReason nvarchar(MAX),
    @MatchErrorMessage nvarchar(MAX),
    @MergeStatus nvarchar(20),
    @MergeErrorMessage nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[DuplicateRunDetail]
    SET 
        [DuplicateRunID] = @DuplicateRunID,
        [RecordID] = @RecordID,
        [MatchStatus] = @MatchStatus,
        [SkippedReason] = @SkippedReason,
        [MatchErrorMessage] = @MatchErrorMessage,
        [MergeStatus] = @MergeStatus,
        [MergeErrorMessage] = @MergeErrorMessage
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwDuplicateRunDetails] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateAIModel]'
GO


ALTER PROCEDURE [__mj].[spUpdateAIModel]
    @ID int,
    @Name nvarchar(50),
    @Vendor nvarchar(50),
    @AIModelTypeID int,
    @IsActive bit,
    @Description nvarchar(MAX),
    @DriverClass nvarchar(100),
    @DriverImportPath nvarchar(255),
    @APIName nvarchar(100),
    @PowerRank int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[AIModel]
    SET 
        [Name] = @Name,
        [Vendor] = @Vendor,
        [AIModelTypeID] = @AIModelTypeID,
        [IsActive] = @IsActive,
        [Description] = @Description,
        [DriverClass] = @DriverClass,
        [DriverImportPath] = @DriverImportPath,
        [APIName] = @APIName,
        [PowerRank] = @PowerRank
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwAIModels] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateEntityField]'
GO


ALTER PROCEDURE [__mj].[spUpdateEntityField]
    @ID int,
    @DisplayName nvarchar(255),
    @Description nvarchar(MAX),
    @AutoUpdateDescription bit,
    @IsPrimaryKey bit,
    @IsUnique bit,
    @Category nvarchar(255),
    @ValueListType nvarchar(20),
    @ExtendedType nvarchar(50),
    @CodeType nvarchar(50),
    @DefaultInView bit,
    @ViewCellTemplate nvarchar(MAX),
    @DefaultColumnWidth int,
    @AllowUpdateAPI bit,
    @AllowUpdateInView bit,
    @IncludeInUserSearchAPI bit,
    @FullTextSearchEnabled bit,
    @UserSearchParamFormatAPI nvarchar(500),
    @IncludeInGeneratedForm bit,
    @GeneratedFormSection nvarchar(10),
    @IsNameField bit,
    @RelatedEntityID int,
    @RelatedEntityFieldName nvarchar(255),
    @IncludeRelatedEntityNameFieldInBaseView bit,
    @RelatedEntityNameFieldMap nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityField]
    SET 
        [DisplayName] = @DisplayName,
        [Description] = @Description,
        [AutoUpdateDescription] = @AutoUpdateDescription,
        [IsPrimaryKey] = @IsPrimaryKey,
        [IsUnique] = @IsUnique,
        [Category] = @Category,
        [ValueListType] = @ValueListType,
        [ExtendedType] = @ExtendedType,
        [CodeType] = @CodeType,
        [DefaultInView] = @DefaultInView,
        [ViewCellTemplate] = @ViewCellTemplate,
        [DefaultColumnWidth] = @DefaultColumnWidth,
        [AllowUpdateAPI] = @AllowUpdateAPI,
        [AllowUpdateInView] = @AllowUpdateInView,
        [IncludeInUserSearchAPI] = @IncludeInUserSearchAPI,
        [FullTextSearchEnabled] = @FullTextSearchEnabled,
        [UserSearchParamFormatAPI] = @UserSearchParamFormatAPI,
        [IncludeInGeneratedForm] = @IncludeInGeneratedForm,
        [GeneratedFormSection] = @GeneratedFormSection,
        [IsNameField] = @IsNameField,
        [RelatedEntityID] = @RelatedEntityID,
        [RelatedEntityFieldName] = @RelatedEntityFieldName,
        [IncludeRelatedEntityNameFieldInBaseView] = @IncludeRelatedEntityNameFieldInBaseView,
        [RelatedEntityNameFieldMap] = @RelatedEntityNameFieldMap
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwEntityFields] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateEntityDocumentSetting]'
GO


ALTER PROCEDURE [__mj].[spUpdateEntityDocumentSetting]
    @ID int,
    @EntityDocumentID int,
    @Name nvarchar(100),
    @Value nvarchar(MAX),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityDocumentSetting]
    SET 
        [EntityDocumentID] = @EntityDocumentID,
        [Name] = @Name,
        [Value] = @Value,
        [Comments] = @Comments
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwEntityDocumentSettings] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateUserViewCategory]'
GO


ALTER PROCEDURE [__mj].[spUpdateUserViewCategory]
    @ID int,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @ParentID int,
    @EntityID int,
    @UserID int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[UserViewCategory]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [ParentID] = @ParentID,
        [EntityID] = @EntityID,
        [UserID] = @UserID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwUserViewCategories] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spCreateQuery]'
GO


ALTER PROCEDURE [__mj].[spCreateQuery]
    @Name nvarchar(255),
    @UserQuestion nvarchar(MAX),
    @Description nvarchar(MAX),
    @CategoryID int,
    @SQL nvarchar(MAX),
    @TechnicalDescription nvarchar(MAX),
    @OriginalSQL nvarchar(MAX),
    @Feedback nvarchar(MAX),
    @Status nvarchar(15),
    @QualityRank int,
    @ExecutionCostRank int
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO 
    [__mj].[Query]
        (
            [Name],
            [UserQuestion],
            [Description],
            [CategoryID],
            [SQL],
            [TechnicalDescription],
            [OriginalSQL],
            [Feedback],
            [Status],
            [QualityRank],
            [ExecutionCostRank]
        )
    VALUES
        (
            @Name,
            @UserQuestion,
            @Description,
            @CategoryID,
            @SQL,
            @TechnicalDescription,
            @OriginalSQL,
            @Feedback,
            @Status,
            @QualityRank,
            @ExecutionCostRank
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwQueries] WHERE [ID] = SCOPE_IDENTITY()
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateUser]'
GO


ALTER PROCEDURE [__mj].[spUpdateUser]
    @ID int,
    @Name nvarchar(100),
    @FirstName nvarchar(50),
    @LastName nvarchar(50),
    @Title nvarchar(50),
    @Email nvarchar(100),
    @Type nchar(15),
    @IsActive bit,
    @LinkedRecordType nchar(10),
    @EmployeeID int,
    @LinkedEntityID int,
    @LinkedEntityRecordID int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[User]
    SET 
        [Name] = @Name,
        [FirstName] = @FirstName,
        [LastName] = @LastName,
        [Title] = @Title,
        [Email] = @Email,
        [Type] = @Type,
        [IsActive] = @IsActive,
        [LinkedRecordType] = @LinkedRecordType,
        [EmployeeID] = @EmployeeID,
        [LinkedEntityID] = @LinkedEntityID,
        [LinkedEntityRecordID] = @LinkedEntityRecordID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwUsers] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateDataContext]'
GO


ALTER PROCEDURE [__mj].[spUpdateDataContext]
    @ID int,
    @Name nvarchar(255),
    @UserID int,
    @Description nvarchar(MAX),
    @LastRefreshedAt datetime
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[DataContext]
    SET 
        [Name] = @Name,
        [UserID] = @UserID,
        [Description] = @Description,
        [LastRefreshedAt] = @LastRefreshedAt
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwDataContexts] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateActionAuthorization]'
GO


ALTER PROCEDURE [__mj].[spUpdateActionAuthorization]
    @ID int,
    @ActionID int,
    @AuthorizationName nvarchar(100),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ActionAuthorization]
    SET 
        [ActionID] = @ActionID,
        [AuthorizationName] = @AuthorizationName,
        [Comments] = @Comments
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwActionAuthorizations] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateReportCategory]'
GO


ALTER PROCEDURE [__mj].[spUpdateReportCategory]
    @ID int,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @ParentID int,
    @UserID int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ReportCategory]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [ParentID] = @ParentID,
        [UserID] = @UserID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwReportCategories] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateActionFilter]'
GO


ALTER PROCEDURE [__mj].[spUpdateActionFilter]
    @ID int,
    @UserDescription nvarchar(MAX),
    @UserComments nvarchar(MAX),
    @Code nvarchar(MAX),
    @CodeExplanation nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ActionFilter]
    SET 
        [UserDescription] = @UserDescription,
        [UserComments] = @UserComments,
        [Code] = @Code,
        [CodeExplanation] = @CodeExplanation
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwActionFilters] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateEntityBehavior]'
GO


ALTER PROCEDURE [__mj].[spUpdateEntityBehavior]
    @ID int,
    @EntityID int,
    @BehaviorTypeID int,
    @Description nvarchar(MAX),
    @RegenerateCode bit,
    @Code nvarchar(MAX),
    @CodeExplanation nvarchar(MAX),
    @CodeGenerated bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityBehavior]
    SET 
        [EntityID] = @EntityID,
        [BehaviorTypeID] = @BehaviorTypeID,
        [Description] = @Description,
        [RegenerateCode] = @RegenerateCode,
        [Code] = @Code,
        [CodeExplanation] = @CodeExplanation,
        [CodeGenerated] = @CodeGenerated
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwEntityBehaviors] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateQueryPermission]'
GO


ALTER PROCEDURE [__mj].[spUpdateQueryPermission]
    @ID int,
    @QueryID int,
    @RoleName nvarchar(50)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[QueryPermission]
    SET 
        [QueryID] = @QueryID,
        [RoleName] = @RoleName
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwQueryPermissions] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateTemplateContentType]'
GO


ALTER PROCEDURE [__mj].[spUpdateTemplateContentType]
    @ID int,
    @Name nvarchar(255),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[TemplateContentType]
    SET 
        [Name] = @Name,
        [Description] = @Description
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwTemplateContentTypes] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateFileStorageProvider]'
GO


ALTER PROCEDURE [__mj].[spUpdateFileStorageProvider]
    @ID int,
    @Name nvarchar(50),
    @Description nvarchar(MAX),
    @ServerDriverKey nvarchar(100),
    @ClientDriverKey nvarchar(100),
    @Priority int,
    @IsActive bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[FileStorageProvider]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [ServerDriverKey] = @ServerDriverKey,
        [ClientDriverKey] = @ClientDriverKey,
        [Priority] = @Priority,
        [IsActive] = @IsActive
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwFileStorageProviders] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateAction]'
GO


ALTER PROCEDURE [__mj].[spUpdateAction]
    @ID int,
    @CategoryID int,
    @Name nvarchar(425),
    @UserPrompt nvarchar(MAX),
    @UserComments nvarchar(MAX),
    @Code nvarchar(MAX),
    @CodeComments nvarchar(MAX),
    @CodeApprovalStatus nvarchar(20),
    @CodeApprovalComments nvarchar(MAX),
    @CodeApprovedByUserID int,
    @CodeApprovedAt datetime,
    @ForceCodeGeneration bit,
    @RetentionPeriod int,
    @Status nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Action]
    SET 
        [CategoryID] = @CategoryID,
        [Name] = @Name,
        [UserPrompt] = @UserPrompt,
        [UserComments] = @UserComments,
        [Code] = @Code,
        [CodeComments] = @CodeComments,
        [CodeApprovalStatus] = @CodeApprovalStatus,
        [CodeApprovalComments] = @CodeApprovalComments,
        [CodeApprovedByUserID] = @CodeApprovedByUserID,
        [CodeApprovedAt] = @CodeApprovedAt,
        [ForceCodeGeneration] = @ForceCodeGeneration,
        [RetentionPeriod] = @RetentionPeriod,
        [Status] = @Status
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwActions] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateEntitySetting]'
GO


ALTER PROCEDURE [__mj].[spUpdateEntitySetting]
    @ID int,
    @EntityID int,
    @Name nvarchar(100),
    @Value nvarchar(MAX),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntitySetting]
    SET 
        [EntityID] = @EntityID,
        [Name] = @Name,
        [Value] = @Value,
        [Comments] = @Comments
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwEntitySettings] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateQueryCategory]'
GO


ALTER PROCEDURE [__mj].[spUpdateQueryCategory]
    @ID int,
    @Name nvarchar(50),
    @ParentID int,
    @Description nvarchar(MAX),
    @UserID int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[QueryCategory]
    SET 
        [Name] = @Name,
        [ParentID] = @ParentID,
        [Description] = @Description,
        [UserID] = @UserID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwQueryCategories] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateTemplateParam]'
GO


ALTER PROCEDURE [__mj].[spUpdateTemplateParam]
    @ID int,
    @TemplateID int,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Type nvarchar(20),
    @DefaultValue nvarchar(MAX),
    @IsRequired bit,
    @EntityID int,
    @RecordID nvarchar(2000)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[TemplateParam]
    SET 
        [TemplateID] = @TemplateID,
        [Name] = @Name,
        [Description] = @Description,
        [Type] = @Type,
        [DefaultValue] = @DefaultValue,
        [IsRequired] = @IsRequired,
        [EntityID] = @EntityID,
        [RecordID] = @RecordID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwTemplateParams] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateDashboardCategory]'
GO


ALTER PROCEDURE [__mj].[spUpdateDashboardCategory]
    @ID int,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @ParentID int,
    @UserID int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[DashboardCategory]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [ParentID] = @ParentID,
        [UserID] = @UserID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwDashboardCategories] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateEntityActionFilter]'
GO


ALTER PROCEDURE [__mj].[spUpdateEntityActionFilter]
    @ID int,
    @EntityActionID int,
    @ActionFilterID int,
    @Sequence int,
    @Status nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityActionFilter]
    SET 
        [EntityActionID] = @EntityActionID,
        [ActionFilterID] = @ActionFilterID,
        [Sequence] = @Sequence,
        [Status] = @Status
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwEntityActionFilters] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateDuplicateRun]'
GO


ALTER PROCEDURE [__mj].[spUpdateDuplicateRun]
    @ID int,
    @EntityID int,
    @StartedByUserID int,
    @StartedAt datetime,
    @EndedAt datetime,
    @ApprovalStatus nvarchar(20),
    @ApprovalComments nvarchar(MAX),
    @ApprovedByUserID int,
    @ProcessingStatus nvarchar(20),
    @ProcessingErrorMessage nvarchar(MAX),
    @SourceListID int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[DuplicateRun]
    SET 
        [EntityID] = @EntityID,
        [StartedByUserID] = @StartedByUserID,
        [StartedAt] = @StartedAt,
        [EndedAt] = @EndedAt,
        [ApprovalStatus] = @ApprovalStatus,
        [ApprovalComments] = @ApprovalComments,
        [ApprovedByUserID] = @ApprovedByUserID,
        [ProcessingStatus] = @ProcessingStatus,
        [ProcessingErrorMessage] = @ProcessingErrorMessage,
        [SourceListID] = @SourceListID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwDuplicateRuns] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateEntityDocumentType]'
GO


ALTER PROCEDURE [__mj].[spUpdateEntityDocumentType]
    @ID int,
    @Name nvarchar(100),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityDocumentType]
    SET 
        [Name] = @Name,
        [Description] = @Description
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwEntityDocumentTypes] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateTemplateContent]'
GO


ALTER PROCEDURE [__mj].[spUpdateTemplateContent]
    @ID int,
    @TemplateID int,
    @TypeID int,
    @TemplateText nvarchar(MAX),
    @Priority int,
    @IsActive bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[TemplateContent]
    SET 
        [TemplateID] = @TemplateID,
        [TypeID] = @TypeID,
        [TemplateText] = @TemplateText,
        [Priority] = @Priority,
        [IsActive] = @IsActive
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwTemplateContents] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateEntityActionInvocationType]'
GO


ALTER PROCEDURE [__mj].[spUpdateEntityActionInvocationType]
    @ID int,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @DisplaySequence int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityActionInvocationType]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [DisplaySequence] = @DisplaySequence
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwEntityActionInvocationTypes] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateRecommendation]'
GO


ALTER PROCEDURE [__mj].[spUpdateRecommendation]
    @ID int,
    @RecommendationRunID int,
    @SourceEntityID int,
    @SourceEntityRecordID nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Recommendation]
    SET 
        [RecommendationRunID] = @RecommendationRunID,
        [SourceEntityID] = @SourceEntityID,
        [SourceEntityRecordID] = @SourceEntityRecordID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwRecommendations] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateVectorIndex]'
GO


ALTER PROCEDURE [__mj].[spUpdateVectorIndex]
    @ID int,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @VectorDatabaseID int,
    @EmbeddingModelID int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[VectorIndex]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [VectorDatabaseID] = @VectorDatabaseID,
        [EmbeddingModelID] = @EmbeddingModelID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwVectorIndexes] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateList]'
GO


ALTER PROCEDURE [__mj].[spUpdateList]
    @ID int,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @EntityID int,
    @UserID int,
    @ExternalSystemRecordID nvarchar(100),
    @CompanyIntegrationID int,
    @CategoryID int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[List]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [EntityID] = @EntityID,
        [UserID] = @UserID,
        [ExternalSystemRecordID] = @ExternalSystemRecordID,
        [CompanyIntegrationID] = @CompanyIntegrationID,
        [CategoryID] = @CategoryID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwLists] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateQuery]'
GO


ALTER PROCEDURE [__mj].[spUpdateQuery]
    @ID int,
    @Name nvarchar(255),
    @UserQuestion nvarchar(MAX),
    @Description nvarchar(MAX),
    @CategoryID int,
    @SQL nvarchar(MAX),
    @TechnicalDescription nvarchar(MAX),
    @OriginalSQL nvarchar(MAX),
    @Feedback nvarchar(MAX),
    @Status nvarchar(15),
    @QualityRank int,
    @ExecutionCostRank int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Query]
    SET 
        [Name] = @Name,
        [UserQuestion] = @UserQuestion,
        [Description] = @Description,
        [CategoryID] = @CategoryID,
        [SQL] = @SQL,
        [TechnicalDescription] = @TechnicalDescription,
        [OriginalSQL] = @OriginalSQL,
        [Feedback] = @Feedback,
        [Status] = @Status,
        [QualityRank] = @QualityRank,
        [ExecutionCostRank] = @ExecutionCostRank
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwQueries] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateRecommendationProvider]'
GO


ALTER PROCEDURE [__mj].[spUpdateRecommendationProvider]
    @ID int,
    @Name nvarchar(255),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[RecommendationProvider]
    SET 
        [Name] = @Name,
        [Description] = @Description
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwRecommendationProviders] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateLibrary]'
GO


ALTER PROCEDURE [__mj].[spUpdateLibrary]
    @ID int,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Status nvarchar(20),
    @ExportedItems nvarchar(MAX),
    @TypeDefinitions nvarchar(MAX),
    @SampleCode nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Library]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [Status] = @Status,
        [ExportedItems] = @ExportedItems,
        [TypeDefinitions] = @TypeDefinitions,
        [SampleCode] = @SampleCode
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwLibraries] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateActionLibrary]'
GO


ALTER PROCEDURE [__mj].[spUpdateActionLibrary]
    @ID int,
    @ActionID int,
    @LibraryID int,
    @ItemsUsed nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ActionLibrary]
    SET 
        [ActionID] = @ActionID,
        [LibraryID] = @LibraryID,
        [ItemsUsed] = @ItemsUsed
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwActionLibraries] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateConversationDetail]'
GO


ALTER PROCEDURE [__mj].[spUpdateConversationDetail]
    @ID int,
    @ConversationID int,
    @ExternalID nvarchar(100),
    @Role nvarchar(20),
    @Message nvarchar(MAX),
    @Error nvarchar(MAX),
    @HiddenToUser bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ConversationDetail]
    SET 
        [ConversationID] = @ConversationID,
        [ExternalID] = @ExternalID,
        [Role] = @Role,
        [Message] = @Message,
        [Error] = @Error,
        [HiddenToUser] = @HiddenToUser
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwConversationDetails] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateCommunicationProvider]'
GO


ALTER PROCEDURE [__mj].[spUpdateCommunicationProvider]
    @ID int,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Status nvarchar(20),
    @SupportsSending bit,
    @SupportsReceiving bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[CommunicationProvider]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [Status] = @Status,
        [SupportsSending] = @SupportsSending,
        [SupportsReceiving] = @SupportsReceiving
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwCommunicationProviders] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateUserNotification]'
GO


ALTER PROCEDURE [__mj].[spUpdateUserNotification]
    @ID int,
    @UserID int,
    @Title nvarchar(255),
    @Message nvarchar(MAX),
    @ResourceTypeID int,
    @ResourceRecordID int,
    @ResourceConfiguration nvarchar(MAX),
    @Unread bit,
    @ReadAt datetime
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[UserNotification]
    SET 
        [UserID] = @UserID,
        [Title] = @Title,
        [Message] = @Message,
        [ResourceTypeID] = @ResourceTypeID,
        [ResourceRecordID] = @ResourceRecordID,
        [ResourceConfiguration] = @ResourceConfiguration,
        [Unread] = @Unread,
        [ReadAt] = @ReadAt
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwUserNotifications] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateListCategory]'
GO


ALTER PROCEDURE [__mj].[spUpdateListCategory]
    @ID int,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @ParentID int,
    @UserID int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ListCategory]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [ParentID] = @ParentID,
        [UserID] = @UserID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwListCategories] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateConversation]'
GO


ALTER PROCEDURE [__mj].[spUpdateConversation]
    @ID int,
    @UserID int,
    @ExternalID nvarchar(100),
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @Type nvarchar(50),
    @IsArchived bit,
    @LinkedEntityID int,
    @LinkedRecordID nvarchar(500),
    @DataContextID int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Conversation]
    SET 
        [UserID] = @UserID,
        [ExternalID] = @ExternalID,
        [Name] = @Name,
        [Description] = @Description,
        [Type] = @Type,
        [IsArchived] = @IsArchived,
        [LinkedEntityID] = @LinkedEntityID,
        [LinkedRecordID] = @LinkedRecordID,
        [DataContextID] = @DataContextID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwConversations] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateEmployeeCompanyIntegration]'
GO


ALTER PROCEDURE [__mj].[spUpdateEmployeeCompanyIntegration]
    @ID int,
    @EmployeeID int,
    @CompanyIntegrationID int,
    @ExternalSystemRecordID nvarchar(100),
    @IsActive bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EmployeeCompanyIntegration]
    SET 
        [EmployeeID] = @EmployeeID,
        [CompanyIntegrationID] = @CompanyIntegrationID,
        [ExternalSystemRecordID] = @ExternalSystemRecordID,
        [IsActive] = @IsActive
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwEmployeeCompanyIntegrations] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateCommunicationRun]'
GO


ALTER PROCEDURE [__mj].[spUpdateCommunicationRun]
    @ID int,
    @UserID int,
    @Direction nvarchar(20),
    @Status nvarchar(20),
    @StartedAt datetime,
    @EndedAt datetime,
    @Comments nvarchar(MAX),
    @ErrorMessage nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[CommunicationRun]
    SET 
        [UserID] = @UserID,
        [Direction] = @Direction,
        [Status] = @Status,
        [StartedAt] = @StartedAt,
        [EndedAt] = @EndedAt,
        [Comments] = @Comments,
        [ErrorMessage] = @ErrorMessage
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwCommunicationRuns] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[vwRecordChanges]'
GO


ALTER VIEW [__mj].[vwRecordChanges]
AS
SELECT 
    r.*,
    Entity_EntityID.[Name] AS [Entity],
    User_UserID.[Name] AS [User],
    Integration_IntegrationID.[Name] AS [Integration]
FROM
    [__mj].[RecordChange] AS r
INNER JOIN
    [__mj].[Entity] AS Entity_EntityID
  ON
    [r].[EntityID] = Entity_EntityID.[ID]
INNER JOIN
    [__mj].[User] AS User_UserID
  ON
    [r].[UserID] = User_UserID.[ID]
LEFT OUTER JOIN
    [__mj].[Integration] AS Integration_IntegrationID
  ON
    [r].[IntegrationID] = Integration_IntegrationID.[ID]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spCreateRecordChange]'
GO

ALTER PROCEDURE [__mj].[spCreateRecordChange]
    @EntityName nvarchar(100),
    @RecordID NVARCHAR(750),
	  @UserID int,
    @ChangesJSON nvarchar(MAX),
    @ChangesDescription nvarchar(MAX),
    @FullRecordJSON nvarchar(MAX),
    @Status nchar(15),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO 
    [__mj].[RecordChange]
        (
            EntityID,
            RecordID,
			      UserID,
            ChangedAt,
            ChangesJSON,
            ChangesDescription,
            FullRecordJSON,
            Status,
            Comments
        )
    VALUES
        (
            (SELECT ID FROM __mj.Entity WHERE Name = @EntityName),
            @RecordID,
			      @UserID,
            GETDATE(),
            @ChangesJSON,
            @ChangesDescription,
            @FullRecordJSON,
            @Status,
            @Comments
        )

    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].vwRecordChanges WHERE ID = SCOPE_IDENTITY()
END




GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateEmployeeRole]'
GO


ALTER PROCEDURE [__mj].[spUpdateEmployeeRole]
    @ID int,
    @EmployeeID int,
    @RoleID int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EmployeeRole]
    SET 
        [EmployeeID] = @EmployeeID,
        [RoleID] = @RoleID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwEmployeeRoles] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateWorkflow]'
GO


ALTER PROCEDURE [__mj].[spUpdateWorkflow]
    @ID int,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @WorkflowEngineName nvarchar(100),
    @CompanyName nvarchar(50),
    @ExternalSystemRecordID nvarchar(100),
    @AutoRunEnabled bit,
    @AutoRunIntervalUnits nvarchar(20),
    @AutoRunInterval int,
    @SubclassName nvarchar(200)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Workflow]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [WorkflowEngineName] = @WorkflowEngineName,
        [CompanyName] = @CompanyName,
        [ExternalSystemRecordID] = @ExternalSystemRecordID,
        [AutoRunEnabled] = @AutoRunEnabled,
        [AutoRunIntervalUnits] = @AutoRunIntervalUnits,
        [AutoRunInterval] = @AutoRunInterval,
        [SubclassName] = @SubclassName
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwWorkflows] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateUserFavorite]'
GO


ALTER PROCEDURE [__mj].[spUpdateUserFavorite]
    @ID int,
    @UserID int,
    @EntityID int,
    @RecordID nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[UserFavorite]
    SET 
        [UserID] = @UserID,
        [EntityID] = @EntityID,
        [RecordID] = @RecordID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwUserFavorites] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateEmployee]'
GO


ALTER PROCEDURE [__mj].[spUpdateEmployee]
    @ID int,
    @FirstName nvarchar(30),
    @LastName nvarchar(50),
    @Title nvarchar(50),
    @Email nvarchar(100),
    @Phone nvarchar(20),
    @Active bit,
    @CompanyID int,
    @SupervisorID int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Employee]
    SET 
        [FirstName] = @FirstName,
        [LastName] = @LastName,
        [Title] = @Title,
        [Email] = @Email,
        [Phone] = @Phone,
        [Active] = @Active,
        [CompanyID] = @CompanyID,
        [SupervisorID] = @SupervisorID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwEmployees] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateQueue]'
GO


ALTER PROCEDURE [__mj].[spUpdateQueue]
    @ID int,
    @Name nvarchar(50),
    @Description nvarchar(MAX),
    @QueueTypeID int,
    @IsActive bit,
    @ProcessPID int,
    @ProcessPlatform nvarchar(30),
    @ProcessVersion nvarchar(15),
    @ProcessCwd nvarchar(100),
    @ProcessIPAddress nvarchar(50),
    @ProcessMacAddress nvarchar(50),
    @ProcessOSName nvarchar(25),
    @ProcessOSVersion nvarchar(10),
    @ProcessHostName nvarchar(50),
    @ProcessUserID nvarchar(25),
    @ProcessUserName nvarchar(50),
    @LastHeartbeat datetime
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Queue]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [QueueTypeID] = @QueueTypeID,
        [IsActive] = @IsActive,
        [ProcessPID] = @ProcessPID,
        [ProcessPlatform] = @ProcessPlatform,
        [ProcessVersion] = @ProcessVersion,
        [ProcessCwd] = @ProcessCwd,
        [ProcessIPAddress] = @ProcessIPAddress,
        [ProcessMacAddress] = @ProcessMacAddress,
        [ProcessOSName] = @ProcessOSName,
        [ProcessOSVersion] = @ProcessOSVersion,
        [ProcessHostName] = @ProcessHostName,
        [ProcessUserID] = @ProcessUserID,
        [ProcessUserName] = @ProcessUserName,
        [LastHeartbeat] = @LastHeartbeat
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwQueues] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateWorkflowEngine]'
GO


ALTER PROCEDURE [__mj].[spUpdateWorkflowEngine]
    @ID int,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @DriverPath nvarchar(500),
    @DriverClass nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[WorkflowEngine]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [DriverPath] = @DriverPath,
        [DriverClass] = @DriverClass
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwWorkflowEngines] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateUserView]'
GO


ALTER PROCEDURE [__mj].[spUpdateUserView]
    @ID int,
    @UserID int,
    @EntityID int,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @CategoryID int,
    @IsShared bit,
    @IsDefault bit,
    @GridState nvarchar(MAX),
    @FilterState nvarchar(MAX),
    @CustomFilterState bit,
    @SmartFilterEnabled bit,
    @SmartFilterPrompt nvarchar(MAX),
    @SmartFilterWhereClause nvarchar(MAX),
    @SmartFilterExplanation nvarchar(MAX),
    @WhereClause nvarchar(MAX),
    @CustomWhereClause bit,
    @SortState nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[UserView]
    SET 
        [UserID] = @UserID,
        [EntityID] = @EntityID,
        [Name] = @Name,
        [Description] = @Description,
        [CategoryID] = @CategoryID,
        [IsShared] = @IsShared,
        [IsDefault] = @IsDefault,
        [GridState] = @GridState,
        [FilterState] = @FilterState,
        [CustomFilterState] = @CustomFilterState,
        [SmartFilterEnabled] = @SmartFilterEnabled,
        [SmartFilterPrompt] = @SmartFilterPrompt,
        [SmartFilterWhereClause] = @SmartFilterWhereClause,
        [SmartFilterExplanation] = @SmartFilterExplanation,
        [WhereClause] = @WhereClause,
        [CustomWhereClause] = @CustomWhereClause,
        [SortState] = @SortState
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwUserViews] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateCompany]'
GO


ALTER PROCEDURE [__mj].[spUpdateCompany]
    @ID int,
    @Name nvarchar(50),
    @Description nvarchar(200),
    @Website nvarchar(100),
    @LogoURL nvarchar(500),
    @Domain nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[Company]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [Website] = @Website,
        [LogoURL] = @LogoURL,
        [Domain] = @Domain
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwCompanies] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateEntityBehaviorType]'
GO


ALTER PROCEDURE [__mj].[spUpdateEntityBehaviorType]
    @ID int,
    @Name nvarchar(100),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityBehaviorType]
    SET 
        [Name] = @Name,
        [Description] = @Description
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwEntityBehaviorTypes] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateEntityRecordDocument]'
GO


ALTER PROCEDURE [__mj].[spUpdateEntityRecordDocument]
    @ID int,
    @EntityID int,
    @RecordID nvarchar(255),
    @DocumentText nvarchar(MAX),
    @VectorIndexID int,
    @VectorID nvarchar(50),
    @VectorJSON nvarchar(MAX),
    @EntityRecordUpdatedAt datetime,
    @EntityDocumentID int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityRecordDocument]
    SET 
        [EntityID] = @EntityID,
        [RecordID] = @RecordID,
        [DocumentText] = @DocumentText,
        [VectorIndexID] = @VectorIndexID,
        [VectorID] = @VectorID,
        [VectorJSON] = @VectorJSON,
        [EntityRecordUpdatedAt] = @EntityRecordUpdatedAt,
        [EntityDocumentID] = @EntityDocumentID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwEntityRecordDocuments] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateApplicationSetting]'
GO


ALTER PROCEDURE [__mj].[spUpdateApplicationSetting]
    @ID int,
    @ApplicationName nvarchar(50),
    @Name nvarchar(100),
    @Value nvarchar(MAX),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[ApplicationSetting]
    SET 
        [ApplicationName] = @ApplicationName,
        [Name] = @Name,
        [Value] = @Value,
        [Comments] = @Comments
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwApplicationSettings] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateVersionInstallation]'
GO


ALTER PROCEDURE [__mj].[spUpdateVersionInstallation]
    @ID int,
    @MajorVersion int,
    @MinorVersion int,
    @PatchVersion int,
    @Type nvarchar(20),
    @InstalledAt datetime,
    @Status nvarchar(20),
    @InstallLog nvarchar(MAX),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[VersionInstallation]
    SET 
        [MajorVersion] = @MajorVersion,
        [MinorVersion] = @MinorVersion,
        [PatchVersion] = @PatchVersion,
        [Type] = @Type,
        [InstalledAt] = @InstalledAt,
        [Status] = @Status,
        [InstallLog] = @InstallLog,
        [Comments] = @Comments
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwVersionInstallations] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering [__mj].[spUpdateEntityActionInvocation]'
GO


ALTER PROCEDURE [__mj].[spUpdateEntityActionInvocation]
    @ID int,
    @EntityActionID int,
    @InvocationTypeID int,
    @Status nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [__mj].[EntityActionInvocation]
    SET 
        [EntityActionID] = @EntityActionID,
        [InvocationTypeID] = @InvocationTypeID,
        [Status] = @Status
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [__mj].[vwEntityActionInvocations] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[RecordChange]'
GO
ALTER TABLE [__mj].[RecordChange] ADD CONSTRAINT [CK_RecordChange_Status] CHECK (([Status]='Pending' OR [Status]='Complete'))
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding foreign keys to [__mj].[RecordChange]'
GO
ALTER TABLE [__mj].[RecordChange] ADD CONSTRAINT [FK_RecordChange_Integration] FOREIGN KEY ([IntegrationID]) REFERENCES [__mj].[Integration] ([ID])
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Adding constraints to [__mj].[ApplicationEntity]'
GO
ALTER TABLE [__mj].[ApplicationEntity] ADD CONSTRAINT [DF_ApplicationEntity_DefaultForNewUser] DEFAULT ((1)) FOR [DefaultForNewUser]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Creating extended properties'
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'When set to 1, the entity will be included by default for a new user when they first access the application in question', 'SCHEMA', N'__mj', 'TABLE', N'ApplicationEntity', 'COLUMN', N'DefaultForNewUser'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'If turned on, when a new user first uses the MJ Explorer app, the application records with this turned on will have this application included in their selected application list.', 'SCHEMA', N'__mj', 'TABLE', N'Application', 'COLUMN', N'DefaultForNewUser'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'Specify the CSS class information for the display icon for each application.', 'SCHEMA', N'__mj', 'TABLE', N'Application', 'COLUMN', N'Icon'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'Optional, specify an icon (CSS Class) for each entity for display in the UI', 'SCHEMA', N'__mj', 'TABLE', N'Entity', 'COLUMN', N'Icon'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'Higher numbers indicate more execution overhead/time required. Useful for planning which queries to use in various scenarios.', 'SCHEMA', N'__mj', 'TABLE', N'Query', 'COLUMN', N'ExecutionCostRank'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'Value indicating the quality of the query, higher values mean a better quality', 'SCHEMA', N'__mj', 'TABLE', N'Query', 'COLUMN', N'QualityRank'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'The date/time that the change occured.', 'SCHEMA', N'__mj', 'TABLE', N'RecordChange', 'COLUMN', N'ChangedAt'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'A generated, human-readable description of what was changed.', 'SCHEMA', N'__mj', 'TABLE', N'RecordChange', 'COLUMN', N'ChangesDescription'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'JSON structure that describes what was changed in a structured format.', 'SCHEMA', N'__mj', 'TABLE', N'RecordChange', 'COLUMN', N'ChangesJSON'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'A complete snapshot of the record AFTER the change was applied in a JSON format that can be parsed.', 'SCHEMA', N'__mj', 'TABLE', N'RecordChange', 'COLUMN', N'FullRecordJSON'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'If Source=External, this field can optionally specify which integration created the change, if known', 'SCHEMA', N'__mj', 'TABLE', N'RecordChange', 'COLUMN', N'IntegrationID'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'Internal or External', 'SCHEMA', N'__mj', 'TABLE', N'RecordChange', 'COLUMN', N'Source'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'For internal record changes generated within MJ, the status is immediately Complete. For external changes that are detected, the workflow starts off as Pending, then In Progress and finally either Complete or Error', 'SCHEMA', N'__mj', 'TABLE', N'RecordChange', 'COLUMN', N'Status'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'Create, Update, or Delete', 'SCHEMA', N'__mj', 'TABLE', N'RecordChange', 'COLUMN', N'Type'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
BEGIN TRY
	EXEC sp_addextendedproperty N'MS_Description', N'The user that made the change', 'SCHEMA', N'__mj', 'TABLE', N'RecordChange', 'COLUMN', N'UserID'
END TRY
BEGIN CATCH
	DECLARE @msg nvarchar(max);
	DECLARE @severity int;
	DECLARE @state int;
	SELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();
	RAISERROR(@msg, @severity, @state);

	SET NOEXEC ON
END CATCH
GO
PRINT N'Altering permissions on  [__mj].[spCreateUserApplication]'
GO
GRANT EXECUTE ON  [__mj].[spCreateUserApplication] TO [cdp_Developer]
GO
GRANT EXECUTE ON  [__mj].[spCreateUserApplication] TO [cdp_Integration]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
PRINT N'Altering permissions on  [__mj].[vwEntitiesWithExternalChangeTracking]'
GO
GRANT SELECT ON  [__mj].[vwEntitiesWithExternalChangeTracking] TO [cdp_Developer]
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
COMMIT TRANSACTION
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO
-- This statement writes to the SQL Server Log so SQL Monitor can show this deployment.
IF HAS_PERMS_BY_NAME(N'sys.xp_logevent', N'OBJECT', N'EXECUTE') = 1
BEGIN
    DECLARE @databaseName AS nvarchar(2048), @eventMessage AS nvarchar(2048)
    SET @databaseName = REPLACE(REPLACE(DB_NAME(), N'\', N'\\'), N'"', N'\"')
    SET @eventMessage = N'Redgate SQL Compare: { "deployment": { "description": "Redgate SQL Compare deployed to ' + @databaseName + N'", "database": "' + @databaseName + N'" }}'
    EXECUTE sys.xp_logevent 55000, @eventMessage
END
GO
DECLARE @Success AS BIT
SET @Success = 1
SET NOEXEC OFF
IF (@Success = 1) PRINT 'The database update succeeded'
ELSE BEGIN
	IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION
	PRINT 'The database update failed'
END
GO
