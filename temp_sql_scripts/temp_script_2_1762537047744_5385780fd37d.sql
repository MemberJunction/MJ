 DECLARE @RefreshError_MJ_ComponentDependencies INT = 0;
                          BEGIN TRY
                              EXEC sp_refreshview '__mj.vwComponentDependencies';
                          END TRY
                          BEGIN CATCH
                              SET @RefreshError_MJ_ComponentDependencies = 1;
                              PRINT 'View refresh failed for __mj.vwComponentDependencies: ' + ERROR_MESSAGE();
                          END CATCH
                          
                          IF @RefreshError_MJ_ComponentDependencies = 1
                          BEGIN
                              PRINT 'Attempting to regenerate view definition for __mj.vwComponentDependencies';
                          END
                         DECLARE @RefreshError_MJ_AIModelCosts INT = 0;
                          BEGIN TRY
                              EXEC sp_refreshview '__mj.vwAIModelCosts';
                          END TRY
                          BEGIN CATCH
                              SET @RefreshError_MJ_AIModelCosts = 1;
                              PRINT 'View refresh failed for __mj.vwAIModelCosts: ' + ERROR_MESSAGE();
                          END CATCH
                          
                          IF @RefreshError_MJ_AIModelCosts = 1
                          BEGIN
                              PRINT 'Attempting to regenerate view definition for __mj.vwAIModelCosts';
                          END
                         DECLARE @RefreshError_EmployeeCompanyIntegrations INT = 0;
                          BEGIN TRY
                              EXEC sp_refreshview '__mj.vwEmployeeCompanyIntegrations';
                          END TRY
                          BEGIN CATCH
                              SET @RefreshError_EmployeeCompanyIntegrations = 1;
                              PRINT 'View refresh failed for __mj.vwEmployeeCompanyIntegrations: ' + ERROR_MESSAGE();
                          END CATCH
                          
                          IF @RefreshError_EmployeeCompanyIntegrations = 1
                          BEGIN
                              PRINT 'Attempting to regenerate view definition for __mj.vwEmployeeCompanyIntegrations';
                          END
                         DECLARE @RefreshError_EmployeeRoles INT = 0;
                          BEGIN TRY
                              EXEC sp_refreshview '__mj.vwEmployeeRoles';
                          END TRY
                          BEGIN CATCH
                              SET @RefreshError_EmployeeRoles = 1;
                              PRINT 'View refresh failed for __mj.vwEmployeeRoles: ' + ERROR_MESSAGE();
                          END CATCH
                          
                          IF @RefreshError_EmployeeRoles = 1
                          BEGIN
                              PRINT 'Attempting to regenerate view definition for __mj.vwEmployeeRoles';
                          END
                         DECLARE @RefreshError_EmployeeSkills INT = 0;
                          BEGIN TRY
                              EXEC sp_refreshview '__mj.vwEmployeeSkills';
                          END TRY
                          BEGIN CATCH
                              SET @RefreshError_EmployeeSkills = 1;
                              PRINT 'View refresh failed for __mj.vwEmployeeSkills: ' + ERROR_MESSAGE();
                          END CATCH
                          
                          IF @RefreshError_EmployeeSkills = 1
                          BEGIN
                              PRINT 'Attempting to regenerate view definition for __mj.vwEmployeeSkills';
                          END
                         DECLARE @RefreshError_AIActions INT = 0;
                          BEGIN TRY
                              EXEC sp_refreshview '__mj.vwAIActions';
                          END TRY
                          BEGIN CATCH
                              SET @RefreshError_AIActions = 1;
                              PRINT 'View refresh failed for __mj.vwAIActions: ' + ERROR_MESSAGE();
                          END CATCH
                          
                          IF @RefreshError_AIActions = 1
                          BEGIN
                              PRINT 'Attempting to regenerate view definition for __mj.vwAIActions';
                          END
                         DECLARE @RefreshError_QueueTasks INT = 0;
                          BEGIN TRY
                              EXEC sp_refreshview '__mj.vwQueueTasks';
                          END TRY
                          BEGIN CATCH
                              SET @RefreshError_QueueTasks = 1;
                              PRINT 'View refresh failed for __mj.vwQueueTasks: ' + ERROR_MESSAGE();
                          END CATCH
                          
                          IF @RefreshError_QueueTasks = 1
                          BEGIN
                              PRINT 'Attempting to regenerate view definition for __mj.vwQueueTasks';
                          END
                         DECLARE @RefreshError_CompanyIntegrationRecordMaps INT = 0;
                          BEGIN TRY
                              EXEC sp_refreshview '__mj.vwCompanyIntegrationRecordMaps';
                          END TRY
                          BEGIN CATCH
                              SET @RefreshError_CompanyIntegrationRecordMaps = 1;
                              PRINT 'View refresh failed for __mj.vwCompanyIntegrationRecordMaps: ' + ERROR_MESSAGE();
                          END CATCH
                          
                          IF @RefreshError_CompanyIntegrationRecordMaps = 1
                          BEGIN
                              PRINT 'Attempting to regenerate view definition for __mj.vwCompanyIntegrationRecordMaps';
                          END
                         DECLARE @RefreshError_VectorIndexes INT = 0;
                          BEGIN TRY
                              EXEC sp_refreshview '__mj.vwVectorIndexes';
                          END TRY
                          BEGIN CATCH
                              SET @RefreshError_VectorIndexes = 1;
                              PRINT 'View refresh failed for __mj.vwVectorIndexes: ' + ERROR_MESSAGE();
                          END CATCH
                          
                          IF @RefreshError_VectorIndexes = 1
                          BEGIN
                              PRINT 'Attempting to regenerate view definition for __mj.vwVectorIndexes';
                          END
                         DECLARE @RefreshError_FileEntityRecordLinks INT = 0;
                          BEGIN TRY
                              EXEC sp_refreshview '__mj.vwFileEntityRecordLinks';
                          END TRY
                          BEGIN CATCH
                              SET @RefreshError_FileEntityRecordLinks = 1;
                              PRINT 'View refresh failed for __mj.vwFileEntityRecordLinks: ' + ERROR_MESSAGE();
                          END CATCH
                          
                          IF @RefreshError_FileEntityRecordLinks = 1
                          BEGIN
                              PRINT 'Attempting to regenerate view definition for __mj.vwFileEntityRecordLinks';
                          END
                         DECLARE @RefreshError_EntityCommunicationFields INT = 0;
                          BEGIN TRY
                              EXEC sp_refreshview '__mj.vwEntityCommunicationFields';
                          END TRY
                          BEGIN CATCH
                              SET @RefreshError_EntityCommunicationFields = 1;
                              PRINT 'View refresh failed for __mj.vwEntityCommunicationFields: ' + ERROR_MESSAGE();
                          END CATCH
                          
                          IF @RefreshError_EntityCommunicationFields = 1
                          BEGIN
                              PRINT 'Attempting to regenerate view definition for __mj.vwEntityCommunicationFields';
                          END
                         DECLARE @RefreshError_MJ_AIModelVendors INT = 0;
                          BEGIN TRY
                              EXEC sp_refreshview '__mj.vwAIModelVendors';
                          END TRY
                          BEGIN CATCH
                              SET @RefreshError_MJ_AIModelVendors = 1;
                              PRINT 'View refresh failed for __mj.vwAIModelVendors: ' + ERROR_MESSAGE();
                          END CATCH
                          
                          IF @RefreshError_MJ_AIModelVendors = 1
                          BEGIN
                              PRINT 'Attempting to regenerate view definition for __mj.vwAIModelVendors';
                          END
                         DECLARE @RefreshError_MJ_ComponentLibraryLinks INT = 0;
                          BEGIN TRY
                              EXEC sp_refreshview '__mj.vwComponentLibraryLinks';
                          END TRY
                          BEGIN CATCH
                              SET @RefreshError_MJ_ComponentLibraryLinks = 1;
                              PRINT 'View refresh failed for __mj.vwComponentLibraryLinks: ' + ERROR_MESSAGE();
                          END CATCH
                          
                          IF @RefreshError_MJ_ComponentLibraryLinks = 1
                          BEGIN
                              PRINT 'Attempting to regenerate view definition for __mj.vwComponentLibraryLinks';
                          END
                         DECLARE @RefreshError_ContentTypes INT = 0;
                          BEGIN TRY
                              EXEC sp_refreshview '__mj.vwContentTypes';
                          END TRY
                          BEGIN CATCH
                              SET @RefreshError_ContentTypes = 1;
                              PRINT 'View refresh failed for __mj.vwContentTypes: ' + ERROR_MESSAGE();
                          END CATCH
                          
                          IF @RefreshError_ContentTypes = 1
                          BEGIN
                              PRINT 'Attempting to regenerate view definition for __mj.vwContentTypes';
                          END
                         DECLARE @RefreshError_GeneratedCodes INT = 0;
                          BEGIN TRY
                              EXEC sp_refreshview '__mj.vwGeneratedCodes';
                          END TRY
                          BEGIN CATCH
                              SET @RefreshError_GeneratedCodes = 1;
                              PRINT 'View refresh failed for __mj.vwGeneratedCodes: ' + ERROR_MESSAGE();
                          END CATCH
                          
                          IF @RefreshError_GeneratedCodes = 1
                          BEGIN
                              PRINT 'Attempting to regenerate view definition for __mj.vwGeneratedCodes';
                          END
                        