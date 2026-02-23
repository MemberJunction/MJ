/**********************************************************************************
* GENERATED FILE - This file is automatically managed by the MJ CodeGen tool, 
* 
* DO NOT MODIFY THIS FILE - any changes you make will be wiped out the next time the file is
* generated
* 
**********************************************************************************/
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// MemberJunction Imports
import { BaseFormsModule } from '@memberjunction/ng-base-forms';
import { EntityViewerModule } from '@memberjunction/ng-entity-viewer';
import { LinkDirectivesModule } from '@memberjunction/ng-link-directives';
import { LayoutModule } from '@progress/kendo-angular-layout';

// Import Generated Components
import { MJAccessControlRulesFormComponent } from "./Entities/MJAccessControlRules/mjaccesscontrolrules.form.component";
import { MJActionAuthorizationsFormComponent } from "./Entities/MJActionAuthorizations/mjactionauthorizations.form.component";
import { MJActionCategoriesFormComponent } from "./Entities/MJActionCategories/mjactioncategories.form.component";
import { MJActionContextTypesFormComponent } from "./Entities/MJActionContextTypes/mjactioncontexttypes.form.component";
import { MJActionContextsFormComponent } from "./Entities/MJActionContexts/mjactioncontexts.form.component";
import { MJActionExecutionLogsFormComponent } from "./Entities/MJActionExecutionLogs/mjactionexecutionlogs.form.component";
import { MJActionFiltersFormComponent } from "./Entities/MJActionFilters/mjactionfilters.form.component";
import { MJActionLibrariesFormComponent } from "./Entities/MJActionLibraries/mjactionlibraries.form.component";
import { MJActionParamsFormComponent } from "./Entities/MJActionParams/mjactionparams.form.component";
import { MJActionResultCodesFormComponent } from "./Entities/MJActionResultCodes/mjactionresultcodes.form.component";
import { MJActionsFormComponent } from "./Entities/MJActions/mjactions.form.component";
import { MJAIActionsFormComponent } from "./Entities/MJAIActions/mjaiactions.form.component";
import { MJAIAgentActionsFormComponent } from "./Entities/MJAIAgentActions/mjaiagentactions.form.component";
import { MJAIAgentArtifactTypesFormComponent } from "./Entities/MJAIAgentArtifactTypes/mjaiagentartifacttypes.form.component";
import { MJAIAgentConfigurationsFormComponent } from "./Entities/MJAIAgentConfigurations/mjaiagentconfigurations.form.component";
import { MJAIAgentDataSourcesFormComponent } from "./Entities/MJAIAgentDataSources/mjaiagentdatasources.form.component";
import { MJAIAgentExamplesFormComponent } from "./Entities/MJAIAgentExamples/mjaiagentexamples.form.component";
import { MJAIAgentLearningCyclesFormComponent } from "./Entities/MJAIAgentLearningCycles/mjaiagentlearningcycles.form.component";
import { MJAIAgentModalitiesFormComponent } from "./Entities/MJAIAgentModalities/mjaiagentmodalities.form.component";
import { MJAIAgentModelsFormComponent } from "./Entities/MJAIAgentModels/mjaiagentmodels.form.component";
import { MJAIAgentNoteTypesFormComponent } from "./Entities/MJAIAgentNoteTypes/mjaiagentnotetypes.form.component";
import { MJAIAgentNotesFormComponent } from "./Entities/MJAIAgentNotes/mjaiagentnotes.form.component";
import { MJAIAgentPermissionsFormComponent } from "./Entities/MJAIAgentPermissions/mjaiagentpermissions.form.component";
import { MJAIAgentPromptsFormComponent } from "./Entities/MJAIAgentPrompts/mjaiagentprompts.form.component";
import { MJAIAgentRelationshipsFormComponent } from "./Entities/MJAIAgentRelationships/mjaiagentrelationships.form.component";
import { MJAIAgentRequestsFormComponent } from "./Entities/MJAIAgentRequests/mjaiagentrequests.form.component";
import { MJAIAgentRunMediasFormComponent } from "./Entities/MJAIAgentRunMedias/mjaiagentrunmedias.form.component";
import { MJAIAgentRunStepsFormComponent } from "./Entities/MJAIAgentRunSteps/mjaiagentrunsteps.form.component";
import { MJAIAgentRunsFormComponent } from "./Entities/MJAIAgentRuns/mjaiagentruns.form.component";
import { MJAIAgentStepPathsFormComponent } from "./Entities/MJAIAgentStepPaths/mjaiagentsteppaths.form.component";
import { MJAIAgentStepsFormComponent } from "./Entities/MJAIAgentSteps/mjaiagentsteps.form.component";
import { MJAIAgentTypesFormComponent } from "./Entities/MJAIAgentTypes/mjaiagenttypes.form.component";
import { MJAIAgentsFormComponent } from "./Entities/MJAIAgents/mjaiagents.form.component";
import { MJAIArchitecturesFormComponent } from "./Entities/MJAIArchitectures/mjaiarchitectures.form.component";
import { MJAIConfigurationParamsFormComponent } from "./Entities/MJAIConfigurationParams/mjaiconfigurationparams.form.component";
import { MJAIConfigurationsFormComponent } from "./Entities/MJAIConfigurations/mjaiconfigurations.form.component";
import { MJAICredentialBindingsFormComponent } from "./Entities/MJAICredentialBindings/mjaicredentialbindings.form.component";
import { MJAIModalitiesFormComponent } from "./Entities/MJAIModalities/mjaimodalities.form.component";
import { MJAIModelActionsFormComponent } from "./Entities/MJAIModelActions/mjaimodelactions.form.component";
import { MJAIModelArchitecturesFormComponent } from "./Entities/MJAIModelArchitectures/mjaimodelarchitectures.form.component";
import { MJAIModelCostsFormComponent } from "./Entities/MJAIModelCosts/mjaimodelcosts.form.component";
import { MJAIModelModalitiesFormComponent } from "./Entities/MJAIModelModalities/mjaimodelmodalities.form.component";
import { MJAIModelPriceTypesFormComponent } from "./Entities/MJAIModelPriceTypes/mjaimodelpricetypes.form.component";
import { MJAIModelPriceUnitTypesFormComponent } from "./Entities/MJAIModelPriceUnitTypes/mjaimodelpriceunittypes.form.component";
import { MJAIModelTypesFormComponent } from "./Entities/MJAIModelTypes/mjaimodeltypes.form.component";
import { MJAIModelVendorsFormComponent } from "./Entities/MJAIModelVendors/mjaimodelvendors.form.component";
import { MJAIModelsFormComponent } from "./Entities/MJAIModels/mjaimodels.form.component";
import { MJAIPromptCategoriesFormComponent } from "./Entities/MJAIPromptCategories/mjaipromptcategories.form.component";
import { MJAIPromptModelsFormComponent } from "./Entities/MJAIPromptModels/mjaipromptmodels.form.component";
import { MJAIPromptRunMediasFormComponent } from "./Entities/MJAIPromptRunMedias/mjaipromptrunmedias.form.component";
import { MJAIPromptRunsFormComponent } from "./Entities/MJAIPromptRuns/mjaipromptruns.form.component";
import { MJAIPromptTypesFormComponent } from "./Entities/MJAIPromptTypes/mjaiprompttypes.form.component";
import { MJAIPromptsFormComponent } from "./Entities/MJAIPrompts/mjaiprompts.form.component";
import { MJAIResultCacheFormComponent } from "./Entities/MJAIResultCache/mjairesultcache.form.component";
import { MJAIVendorTypeDefinitionsFormComponent } from "./Entities/MJAIVendorTypeDefinitions/mjaivendortypedefinitions.form.component";
import { MJAIVendorTypesFormComponent } from "./Entities/MJAIVendorTypes/mjaivendortypes.form.component";
import { MJAIVendorsFormComponent } from "./Entities/MJAIVendors/mjaivendors.form.component";
import { MJAPIApplicationScopesFormComponent } from "./Entities/MJAPIApplicationScopes/mjapiapplicationscopes.form.component";
import { MJAPIApplicationsFormComponent } from "./Entities/MJAPIApplications/mjapiapplications.form.component";
import { MJAPIKeyApplicationsFormComponent } from "./Entities/MJAPIKeyApplications/mjapikeyapplications.form.component";
import { MJAPIKeyScopesFormComponent } from "./Entities/MJAPIKeyScopes/mjapikeyscopes.form.component";
import { MJAPIKeyUsageLogsFormComponent } from "./Entities/MJAPIKeyUsageLogs/mjapikeyusagelogs.form.component";
import { MJAPIKeysFormComponent } from "./Entities/MJAPIKeys/mjapikeys.form.component";
import { MJAPIScopesFormComponent } from "./Entities/MJAPIScopes/mjapiscopes.form.component";
import { MJApplicationEntitiesFormComponent } from "./Entities/MJApplicationEntities/mjapplicationentities.form.component";
import { MJApplicationSettingsFormComponent } from "./Entities/MJApplicationSettings/mjapplicationsettings.form.component";
import { MJApplicationsFormComponent } from "./Entities/MJApplications/mjapplications.form.component";
import { MJArtifactPermissionsFormComponent } from "./Entities/MJArtifactPermissions/mjartifactpermissions.form.component";
import { MJArtifactTypesFormComponent } from "./Entities/MJArtifactTypes/mjartifacttypes.form.component";
import { MJArtifactUsesFormComponent } from "./Entities/MJArtifactUses/mjartifactuses.form.component";
import { MJArtifactVersionAttributesFormComponent } from "./Entities/MJArtifactVersionAttributes/mjartifactversionattributes.form.component";
import { MJArtifactVersionsFormComponent } from "./Entities/MJArtifactVersions/mjartifactversions.form.component";
import { MJArtifactsFormComponent } from "./Entities/MJArtifacts/mjartifacts.form.component";
import { MJAuditLogTypesFormComponent } from "./Entities/MJAuditLogTypes/mjauditlogtypes.form.component";
import { MJAuditLogsFormComponent } from "./Entities/MJAuditLogs/mjauditlogs.form.component";
import { MJAuthorizationRolesFormComponent } from "./Entities/MJAuthorizationRoles/mjauthorizationroles.form.component";
import { MJAuthorizationsFormComponent } from "./Entities/MJAuthorizations/mjauthorizations.form.component";
import { MJCollectionArtifactsFormComponent } from "./Entities/MJCollectionArtifacts/mjcollectionartifacts.form.component";
import { MJCollectionPermissionsFormComponent } from "./Entities/MJCollectionPermissions/mjcollectionpermissions.form.component";
import { MJCollectionsFormComponent } from "./Entities/MJCollections/mjcollections.form.component";
import { MJCommunicationBaseMessageTypesFormComponent } from "./Entities/MJCommunicationBaseMessageTypes/mjcommunicationbasemessagetypes.form.component";
import { MJCommunicationLogsFormComponent } from "./Entities/MJCommunicationLogs/mjcommunicationlogs.form.component";
import { MJCommunicationProviderMessageTypesFormComponent } from "./Entities/MJCommunicationProviderMessageTypes/mjcommunicationprovidermessagetypes.form.component";
import { MJCommunicationProvidersFormComponent } from "./Entities/MJCommunicationProviders/mjcommunicationproviders.form.component";
import { MJCommunicationRunsFormComponent } from "./Entities/MJCommunicationRuns/mjcommunicationruns.form.component";
import { MJCompaniesFormComponent } from "./Entities/MJCompanies/mjcompanies.form.component";
import { MJCompanyIntegrationRecordMapsFormComponent } from "./Entities/MJCompanyIntegrationRecordMaps/mjcompanyintegrationrecordmaps.form.component";
import { MJCompanyIntegrationRunAPILogsFormComponent } from "./Entities/MJCompanyIntegrationRunAPILogs/mjcompanyintegrationrunapilogs.form.component";
import { MJCompanyIntegrationRunDetailsFormComponent } from "./Entities/MJCompanyIntegrationRunDetails/mjcompanyintegrationrundetails.form.component";
import { MJCompanyIntegrationRunsFormComponent } from "./Entities/MJCompanyIntegrationRuns/mjcompanyintegrationruns.form.component";
import { MJCompanyIntegrationsFormComponent } from "./Entities/MJCompanyIntegrations/mjcompanyintegrations.form.component";
import { MJComponentDependenciesFormComponent } from "./Entities/MJComponentDependencies/mjcomponentdependencies.form.component";
import { MJComponentLibrariesFormComponent } from "./Entities/MJComponentLibraries/mjcomponentlibraries.form.component";
import { MJComponentLibraryLinksFormComponent } from "./Entities/MJComponentLibraryLinks/mjcomponentlibrarylinks.form.component";
import { MJComponentRegistriesFormComponent } from "./Entities/MJComponentRegistries/mjcomponentregistries.form.component";
import { MJComponentsFormComponent } from "./Entities/MJComponents/mjcomponents.form.component";
import { MJContentFileTypesFormComponent } from "./Entities/MJContentFileTypes/mjcontentfiletypes.form.component";
import { MJContentItemAttributesFormComponent } from "./Entities/MJContentItemAttributes/mjcontentitemattributes.form.component";
import { MJContentItemTagsFormComponent } from "./Entities/MJContentItemTags/mjcontentitemtags.form.component";
import { MJContentItemsFormComponent } from "./Entities/MJContentItems/mjcontentitems.form.component";
import { MJContentProcessRunsFormComponent } from "./Entities/MJContentProcessRuns/mjcontentprocessruns.form.component";
import { MJContentSourceParamsFormComponent } from "./Entities/MJContentSourceParams/mjcontentsourceparams.form.component";
import { MJContentSourceTypeParamsFormComponent } from "./Entities/MJContentSourceTypeParams/mjcontentsourcetypeparams.form.component";
import { MJContentSourceTypesFormComponent } from "./Entities/MJContentSourceTypes/mjcontentsourcetypes.form.component";
import { MJContentSourcesFormComponent } from "./Entities/MJContentSources/mjcontentsources.form.component";
import { MJContentTypeAttributesFormComponent } from "./Entities/MJContentTypeAttributes/mjcontenttypeattributes.form.component";
import { MJContentTypesFormComponent } from "./Entities/MJContentTypes/mjcontenttypes.form.component";
import { MJConversationArtifactPermissionsFormComponent } from "./Entities/MJConversationArtifactPermissions/mjconversationartifactpermissions.form.component";
import { MJConversationArtifactVersionsFormComponent } from "./Entities/MJConversationArtifactVersions/mjconversationartifactversions.form.component";
import { MJConversationArtifactsFormComponent } from "./Entities/MJConversationArtifacts/mjconversationartifacts.form.component";
import { MJConversationDetailArtifactsFormComponent } from "./Entities/MJConversationDetailArtifacts/mjconversationdetailartifacts.form.component";
import { MJConversationDetailAttachmentsFormComponent } from "./Entities/MJConversationDetailAttachments/mjconversationdetailattachments.form.component";
import { MJConversationDetailRatingsFormComponent } from "./Entities/MJConversationDetailRatings/mjconversationdetailratings.form.component";
import { MJConversationDetailsFormComponent } from "./Entities/MJConversationDetails/mjconversationdetails.form.component";
import { MJConversationsFormComponent } from "./Entities/MJConversations/mjconversations.form.component";
import { MJCredentialCategoriesFormComponent } from "./Entities/MJCredentialCategories/mjcredentialcategories.form.component";
import { MJCredentialTypesFormComponent } from "./Entities/MJCredentialTypes/mjcredentialtypes.form.component";
import { MJCredentialsFormComponent } from "./Entities/MJCredentials/mjcredentials.form.component";
import { MJDashboardCategoriesFormComponent } from "./Entities/MJDashboardCategories/mjdashboardcategories.form.component";
import { MJDashboardCategoryLinksFormComponent } from "./Entities/MJDashboardCategoryLinks/mjdashboardcategorylinks.form.component";
import { MJDashboardCategoryPermissionsFormComponent } from "./Entities/MJDashboardCategoryPermissions/mjdashboardcategorypermissions.form.component";
import { MJDashboardPartTypesFormComponent } from "./Entities/MJDashboardPartTypes/mjdashboardparttypes.form.component";
import { MJDashboardPermissionsFormComponent } from "./Entities/MJDashboardPermissions/mjdashboardpermissions.form.component";
import { MJDashboardUserPreferencesFormComponent } from "./Entities/MJDashboardUserPreferences/mjdashboarduserpreferences.form.component";
import { MJDashboardUserStatesFormComponent } from "./Entities/MJDashboardUserStates/mjdashboarduserstates.form.component";
import { MJDashboardsFormComponent } from "./Entities/MJDashboards/mjdashboards.form.component";
import { MJDataContextItemsFormComponent } from "./Entities/MJDataContextItems/mjdatacontextitems.form.component";
import { MJDataContextsFormComponent } from "./Entities/MJDataContexts/mjdatacontexts.form.component";
import { MJDatasetItemsFormComponent } from "./Entities/MJDatasetItems/mjdatasetitems.form.component";
import { MJDatasetsFormComponent } from "./Entities/MJDatasets/mjdatasets.form.component";
import { MJDuplicateRunDetailMatchesFormComponent } from "./Entities/MJDuplicateRunDetailMatches/mjduplicaterundetailmatches.form.component";
import { MJDuplicateRunDetailsFormComponent } from "./Entities/MJDuplicateRunDetails/mjduplicaterundetails.form.component";
import { MJDuplicateRunsFormComponent } from "./Entities/MJDuplicateRuns/mjduplicateruns.form.component";
import { MJEmployeeCompanyIntegrationsFormComponent } from "./Entities/MJEmployeeCompanyIntegrations/mjemployeecompanyintegrations.form.component";
import { MJEmployeeRolesFormComponent } from "./Entities/MJEmployeeRoles/mjemployeeroles.form.component";
import { MJEmployeeSkillsFormComponent } from "./Entities/MJEmployeeSkills/mjemployeeskills.form.component";
import { MJEmployeesFormComponent } from "./Entities/MJEmployees/mjemployees.form.component";
import { MJEncryptionAlgorithmsFormComponent } from "./Entities/MJEncryptionAlgorithms/mjencryptionalgorithms.form.component";
import { MJEncryptionKeySourcesFormComponent } from "./Entities/MJEncryptionKeySources/mjencryptionkeysources.form.component";
import { MJEncryptionKeysFormComponent } from "./Entities/MJEncryptionKeys/mjencryptionkeys.form.component";
import { MJEntitiesFormComponent } from "./Entities/MJEntities/mjentities.form.component";
import { MJEntityActionFiltersFormComponent } from "./Entities/MJEntityActionFilters/mjentityactionfilters.form.component";
import { MJEntityActionInvocationTypesFormComponent } from "./Entities/MJEntityActionInvocationTypes/mjentityactioninvocationtypes.form.component";
import { MJEntityActionInvocationsFormComponent } from "./Entities/MJEntityActionInvocations/mjentityactioninvocations.form.component";
import { MJEntityActionParamsFormComponent } from "./Entities/MJEntityActionParams/mjentityactionparams.form.component";
import { MJEntityActionsFormComponent } from "./Entities/MJEntityActions/mjentityactions.form.component";
import { MJEntityAIActionsFormComponent } from "./Entities/MJEntityAIActions/mjentityaiactions.form.component";
import { MJEntityCommunicationFieldsFormComponent } from "./Entities/MJEntityCommunicationFields/mjentitycommunicationfields.form.component";
import { MJEntityCommunicationMessageTypesFormComponent } from "./Entities/MJEntityCommunicationMessageTypes/mjentitycommunicationmessagetypes.form.component";
import { MJEntityDocumentRunsFormComponent } from "./Entities/MJEntityDocumentRuns/mjentitydocumentruns.form.component";
import { MJEntityDocumentSettingsFormComponent } from "./Entities/MJEntityDocumentSettings/mjentitydocumentsettings.form.component";
import { MJEntityDocumentTypesFormComponent } from "./Entities/MJEntityDocumentTypes/mjentitydocumenttypes.form.component";
import { MJEntityDocumentsFormComponent } from "./Entities/MJEntityDocuments/mjentitydocuments.form.component";
import { MJEntityFieldValuesFormComponent } from "./Entities/MJEntityFieldValues/mjentityfieldvalues.form.component";
import { MJEntityFieldsFormComponent } from "./Entities/MJEntityFields/mjentityfields.form.component";
import { MJEntityPermissionsFormComponent } from "./Entities/MJEntityPermissions/mjentitypermissions.form.component";
import { MJEntityRecordDocumentsFormComponent } from "./Entities/MJEntityRecordDocuments/mjentityrecorddocuments.form.component";
import { MJEntityRelationshipDisplayComponentsFormComponent } from "./Entities/MJEntityRelationshipDisplayComponents/mjentityrelationshipdisplaycomponents.form.component";
import { MJEntityRelationshipsFormComponent } from "./Entities/MJEntityRelationships/mjentityrelationships.form.component";
import { MJEntitySettingsFormComponent } from "./Entities/MJEntitySettings/mjentitysettings.form.component";
import { MJEnvironmentsFormComponent } from "./Entities/MJEnvironments/mjenvironments.form.component";
import { MJErrorLogsFormComponent } from "./Entities/MJErrorLogs/mjerrorlogs.form.component";
import { MJExplorerNavigationItemsFormComponent } from "./Entities/MJExplorerNavigationItems/mjexplorernavigationitems.form.component";
import { MJFileCategoriesFormComponent } from "./Entities/MJFileCategories/mjfilecategories.form.component";
import { MJFileEntityRecordLinksFormComponent } from "./Entities/MJFileEntityRecordLinks/mjfileentityrecordlinks.form.component";
import { MJFileStorageAccountsFormComponent } from "./Entities/MJFileStorageAccounts/mjfilestorageaccounts.form.component";
import { MJFileStorageProvidersFormComponent } from "./Entities/MJFileStorageProviders/mjfilestorageproviders.form.component";
import { MJFilesFormComponent } from "./Entities/MJFiles/mjfiles.form.component";
import { MJGeneratedCodeCategoriesFormComponent } from "./Entities/MJGeneratedCodeCategories/mjgeneratedcodecategories.form.component";
import { MJGeneratedCodesFormComponent } from "./Entities/MJGeneratedCodes/mjgeneratedcodes.form.component";
import { MJIntegrationURLFormatsFormComponent } from "./Entities/MJIntegrationURLFormats/mjintegrationurlformats.form.component";
import { MJIntegrationsFormComponent } from "./Entities/MJIntegrations/mjintegrations.form.component";
import { MJLibrariesFormComponent } from "./Entities/MJLibraries/mjlibraries.form.component";
import { MJLibraryItemsFormComponent } from "./Entities/MJLibraryItems/mjlibraryitems.form.component";
import { MJListCategoriesFormComponent } from "./Entities/MJListCategories/mjlistcategories.form.component";
import { MJListDetailsFormComponent } from "./Entities/MJListDetails/mjlistdetails.form.component";
import { MJListInvitationsFormComponent } from "./Entities/MJListInvitations/mjlistinvitations.form.component";
import { MJListSharesFormComponent } from "./Entities/MJListShares/mjlistshares.form.component";
import { MJListsFormComponent } from "./Entities/MJLists/mjlists.form.component";
import { MJMCPServerConnectionPermissionsFormComponent } from "./Entities/MJMCPServerConnectionPermissions/mjmcpserverconnectionpermissions.form.component";
import { MJMCPServerConnectionToolsFormComponent } from "./Entities/MJMCPServerConnectionTools/mjmcpserverconnectiontools.form.component";
import { MJMCPServerConnectionsFormComponent } from "./Entities/MJMCPServerConnections/mjmcpserverconnections.form.component";
import { MJMCPServerToolsFormComponent } from "./Entities/MJMCPServerTools/mjmcpservertools.form.component";
import { MJMCPServersFormComponent } from "./Entities/MJMCPServers/mjmcpservers.form.component";
import { MJMCPToolExecutionLogsFormComponent } from "./Entities/MJMCPToolExecutionLogs/mjmcptoolexecutionlogs.form.component";
import { MJOAuthAuthServerMetadataCachesFormComponent } from "./Entities/MJOAuthAuthServerMetadataCaches/mjoauthauthservermetadatacaches.form.component";
import { MJOAuthAuthorizationStatesFormComponent } from "./Entities/MJOAuthAuthorizationStates/mjoauthauthorizationstates.form.component";
import { MJOAuthClientRegistrationsFormComponent } from "./Entities/MJOAuthClientRegistrations/mjoauthclientregistrations.form.component";
import { MJOAuthTokensFormComponent } from "./Entities/MJOAuthTokens/mjoauthtokens.form.component";
import { MJOpenAppDependenciesFormComponent } from "./Entities/MJOpenAppDependencies/mjopenappdependencies.form.component";
import { MJOpenAppInstallHistoriesFormComponent } from "./Entities/MJOpenAppInstallHistories/mjopenappinstallhistories.form.component";
import { MJOpenAppsFormComponent } from "./Entities/MJOpenApps/mjopenapps.form.component";
import { MJOutputDeliveryTypesFormComponent } from "./Entities/MJOutputDeliveryTypes/mjoutputdeliverytypes.form.component";
import { MJOutputFormatTypesFormComponent } from "./Entities/MJOutputFormatTypes/mjoutputformattypes.form.component";
import { MJOutputTriggerTypesFormComponent } from "./Entities/MJOutputTriggerTypes/mjoutputtriggertypes.form.component";
import { MJProjectsFormComponent } from "./Entities/MJProjects/mjprojects.form.component";
import { MJPublicLinksFormComponent } from "./Entities/MJPublicLinks/mjpubliclinks.form.component";
import { MJQueriesFormComponent } from "./Entities/MJQueries/mjqueries.form.component";
import { MJQueryCategoriesFormComponent } from "./Entities/MJQueryCategories/mjquerycategories.form.component";
import { MJQueryEntitiesFormComponent } from "./Entities/MJQueryEntities/mjqueryentities.form.component";
import { MJQueryFieldsFormComponent } from "./Entities/MJQueryFields/mjqueryfields.form.component";
import { MJQueryParametersFormComponent } from "./Entities/MJQueryParameters/mjqueryparameters.form.component";
import { MJQueryPermissionsFormComponent } from "./Entities/MJQueryPermissions/mjquerypermissions.form.component";
import { MJQueueTasksFormComponent } from "./Entities/MJQueueTasks/mjqueuetasks.form.component";
import { MJQueueTypesFormComponent } from "./Entities/MJQueueTypes/mjqueuetypes.form.component";
import { MJQueuesFormComponent } from "./Entities/MJQueues/mjqueues.form.component";
import { MJRecommendationItemsFormComponent } from "./Entities/MJRecommendationItems/mjrecommendationitems.form.component";
import { MJRecommendationProvidersFormComponent } from "./Entities/MJRecommendationProviders/mjrecommendationproviders.form.component";
import { MJRecommendationRunsFormComponent } from "./Entities/MJRecommendationRuns/mjrecommendationruns.form.component";
import { MJRecommendationsFormComponent } from "./Entities/MJRecommendations/mjrecommendations.form.component";
import { MJRecordChangeReplayRunsFormComponent } from "./Entities/MJRecordChangeReplayRuns/mjrecordchangereplayruns.form.component";
import { MJRecordChangesFormComponent } from "./Entities/MJRecordChanges/mjrecordchanges.form.component";
import { MJRecordLinksFormComponent } from "./Entities/MJRecordLinks/mjrecordlinks.form.component";
import { MJRecordMergeDeletionLogsFormComponent } from "./Entities/MJRecordMergeDeletionLogs/mjrecordmergedeletionlogs.form.component";
import { MJRecordMergeLogsFormComponent } from "./Entities/MJRecordMergeLogs/mjrecordmergelogs.form.component";
import { MJReportCategoriesFormComponent } from "./Entities/MJReportCategories/mjreportcategories.form.component";
import { MJReportSnapshotsFormComponent } from "./Entities/MJReportSnapshots/mjreportsnapshots.form.component";
import { MJReportUserStatesFormComponent } from "./Entities/MJReportUserStates/mjreportuserstates.form.component";
import { MJReportVersionsFormComponent } from "./Entities/MJReportVersions/mjreportversions.form.component";
import { MJReportsFormComponent } from "./Entities/MJReports/mjreports.form.component";
import { MJResourceLinksFormComponent } from "./Entities/MJResourceLinks/mjresourcelinks.form.component";
import { MJResourcePermissionsFormComponent } from "./Entities/MJResourcePermissions/mjresourcepermissions.form.component";
import { MJResourceTypesFormComponent } from "./Entities/MJResourceTypes/mjresourcetypes.form.component";
import { MJRolesFormComponent } from "./Entities/MJRoles/mjroles.form.component";
import { MJRowLevelSecurityFiltersFormComponent } from "./Entities/MJRowLevelSecurityFilters/mjrowlevelsecurityfilters.form.component";
import { MJScheduledActionParamsFormComponent } from "./Entities/MJScheduledActionParams/mjscheduledactionparams.form.component";
import { MJScheduledActionsFormComponent } from "./Entities/MJScheduledActions/mjscheduledactions.form.component";
import { MJScheduledJobRunsFormComponent } from "./Entities/MJScheduledJobRuns/mjscheduledjobruns.form.component";
import { MJScheduledJobTypesFormComponent } from "./Entities/MJScheduledJobTypes/mjscheduledjobtypes.form.component";
import { MJScheduledJobsFormComponent } from "./Entities/MJScheduledJobs/mjscheduledjobs.form.component";
import { MJSchemaInfoFormComponent } from "./Entities/MJSchemaInfo/mjschemainfo.form.component";
import { MJSkillsFormComponent } from "./Entities/MJSkills/mjskills.form.component";
import { MJTaggedItemsFormComponent } from "./Entities/MJTaggedItems/mjtaggeditems.form.component";
import { MJTagsFormComponent } from "./Entities/MJTags/mjtags.form.component";
import { MJTaskDependenciesFormComponent } from "./Entities/MJTaskDependencies/mjtaskdependencies.form.component";
import { MJTaskTypesFormComponent } from "./Entities/MJTaskTypes/mjtasktypes.form.component";
import { MJTasksFormComponent } from "./Entities/MJTasks/mjtasks.form.component";
import { MJTemplateCategoriesFormComponent } from "./Entities/MJTemplateCategories/mjtemplatecategories.form.component";
import { MJTemplateContentTypesFormComponent } from "./Entities/MJTemplateContentTypes/mjtemplatecontenttypes.form.component";
import { MJTemplateContentsFormComponent } from "./Entities/MJTemplateContents/mjtemplatecontents.form.component";
import { MJTemplateParamsFormComponent } from "./Entities/MJTemplateParams/mjtemplateparams.form.component";
import { MJTemplatesFormComponent } from "./Entities/MJTemplates/mjtemplates.form.component";
import { MJTestRubricsFormComponent } from "./Entities/MJTestRubrics/mjtestrubrics.form.component";
import { MJTestRunFeedbacksFormComponent } from "./Entities/MJTestRunFeedbacks/mjtestrunfeedbacks.form.component";
import { MJTestRunsFormComponent } from "./Entities/MJTestRuns/mjtestruns.form.component";
import { MJTestSuiteRunsFormComponent } from "./Entities/MJTestSuiteRuns/mjtestsuiteruns.form.component";
import { MJTestSuiteTestsFormComponent } from "./Entities/MJTestSuiteTests/mjtestsuitetests.form.component";
import { MJTestSuitesFormComponent } from "./Entities/MJTestSuites/mjtestsuites.form.component";
import { MJTestTypesFormComponent } from "./Entities/MJTestTypes/mjtesttypes.form.component";
import { MJTestsFormComponent } from "./Entities/MJTests/mjtests.form.component";
import { MJUserApplicationEntitiesFormComponent } from "./Entities/MJUserApplicationEntities/mjuserapplicationentities.form.component";
import { MJUserApplicationsFormComponent } from "./Entities/MJUserApplications/mjuserapplications.form.component";
import { MJUserFavoritesFormComponent } from "./Entities/MJUserFavorites/mjuserfavorites.form.component";
import { MJUserNotificationPreferencesFormComponent } from "./Entities/MJUserNotificationPreferences/mjusernotificationpreferences.form.component";
import { MJUserNotificationTypesFormComponent } from "./Entities/MJUserNotificationTypes/mjusernotificationtypes.form.component";
import { MJUserNotificationsFormComponent } from "./Entities/MJUserNotifications/mjusernotifications.form.component";
import { MJUserRecordLogsFormComponent } from "./Entities/MJUserRecordLogs/mjuserrecordlogs.form.component";
import { MJUserRolesFormComponent } from "./Entities/MJUserRoles/mjuserroles.form.component";
import { MJUserSettingsFormComponent } from "./Entities/MJUserSettings/mjusersettings.form.component";
import { MJUserViewCategoriesFormComponent } from "./Entities/MJUserViewCategories/mjuserviewcategories.form.component";
import { MJUserViewRunDetailsFormComponent } from "./Entities/MJUserViewRunDetails/mjuserviewrundetails.form.component";
import { MJUserViewRunsFormComponent } from "./Entities/MJUserViewRuns/mjuserviewruns.form.component";
import { MJUserViewsFormComponent } from "./Entities/MJUserViews/mjuserviews.form.component";
import { MJUsersFormComponent } from "./Entities/MJUsers/mjusers.form.component";
import { MJVectorDatabasesFormComponent } from "./Entities/MJVectorDatabases/mjvectordatabases.form.component";
import { MJVectorIndexesFormComponent } from "./Entities/MJVectorIndexes/mjvectorindexes.form.component";
import { MJVersionInstallationsFormComponent } from "./Entities/MJVersionInstallations/mjversioninstallations.form.component";
import { MJVersionLabelItemsFormComponent } from "./Entities/MJVersionLabelItems/mjversionlabelitems.form.component";
import { MJVersionLabelRestoresFormComponent } from "./Entities/MJVersionLabelRestores/mjversionlabelrestores.form.component";
import { MJVersionLabelsFormComponent } from "./Entities/MJVersionLabels/mjversionlabels.form.component";
import { MJWorkflowEnginesFormComponent } from "./Entities/MJWorkflowEngines/mjworkflowengines.form.component";
import { MJWorkflowRunsFormComponent } from "./Entities/MJWorkflowRuns/mjworkflowruns.form.component";
import { MJWorkflowsFormComponent } from "./Entities/MJWorkflows/mjworkflows.form.component";
import { MJWorkspaceItemsFormComponent } from "./Entities/MJWorkspaceItems/mjworkspaceitems.form.component";
import { MJWorkspacesFormComponent } from "./Entities/MJWorkspaces/mjworkspaces.form.component";
import { JoinGridModule } from "@memberjunction/ng-join-grid"   

@NgModule({
declarations: [
    MJAccessControlRulesFormComponent,
    MJActionAuthorizationsFormComponent,
    MJActionCategoriesFormComponent,
    MJActionContextTypesFormComponent,
    MJActionContextsFormComponent,
    MJActionExecutionLogsFormComponent,
    MJActionFiltersFormComponent,
    MJActionLibrariesFormComponent,
    MJActionParamsFormComponent,
    MJActionResultCodesFormComponent,
    MJActionsFormComponent,
    MJAIActionsFormComponent,
    MJAIAgentActionsFormComponent,
    MJAIAgentArtifactTypesFormComponent,
    MJAIAgentConfigurationsFormComponent,
    MJAIAgentDataSourcesFormComponent,
    MJAIAgentExamplesFormComponent,
    MJAIAgentLearningCyclesFormComponent,
    MJAIAgentModalitiesFormComponent,
    MJAIAgentModelsFormComponent],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
    BaseFormsModule,
    EntityViewerModule,
    LinkDirectivesModule
],
exports: [
]
})
export class GeneratedForms_SubModule_0 { }
    


@NgModule({
declarations: [
    MJAIAgentNoteTypesFormComponent,
    MJAIAgentNotesFormComponent,
    MJAIAgentPermissionsFormComponent,
    MJAIAgentPromptsFormComponent,
    MJAIAgentRelationshipsFormComponent,
    MJAIAgentRequestsFormComponent,
    MJAIAgentRunMediasFormComponent,
    MJAIAgentRunStepsFormComponent,
    MJAIAgentRunsFormComponent,
    MJAIAgentStepPathsFormComponent,
    MJAIAgentStepsFormComponent,
    MJAIAgentTypesFormComponent,
    MJAIAgentsFormComponent,
    MJAIArchitecturesFormComponent,
    MJAIConfigurationParamsFormComponent,
    MJAIConfigurationsFormComponent,
    MJAICredentialBindingsFormComponent,
    MJAIModalitiesFormComponent,
    MJAIModelActionsFormComponent,
    MJAIModelArchitecturesFormComponent],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
    BaseFormsModule,
    EntityViewerModule,
    LinkDirectivesModule
],
exports: [
]
})
export class GeneratedForms_SubModule_1 { }
    


@NgModule({
declarations: [
    MJAIModelCostsFormComponent,
    MJAIModelModalitiesFormComponent,
    MJAIModelPriceTypesFormComponent,
    MJAIModelPriceUnitTypesFormComponent,
    MJAIModelTypesFormComponent,
    MJAIModelVendorsFormComponent,
    MJAIModelsFormComponent,
    MJAIPromptCategoriesFormComponent,
    MJAIPromptModelsFormComponent,
    MJAIPromptRunMediasFormComponent,
    MJAIPromptRunsFormComponent,
    MJAIPromptTypesFormComponent,
    MJAIPromptsFormComponent,
    MJAIResultCacheFormComponent,
    MJAIVendorTypeDefinitionsFormComponent,
    MJAIVendorTypesFormComponent,
    MJAIVendorsFormComponent,
    MJAPIApplicationScopesFormComponent,
    MJAPIApplicationsFormComponent,
    MJAPIKeyApplicationsFormComponent],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
    BaseFormsModule,
    EntityViewerModule,
    LinkDirectivesModule
],
exports: [
]
})
export class GeneratedForms_SubModule_2 { }
    


@NgModule({
declarations: [
    MJAPIKeyScopesFormComponent,
    MJAPIKeyUsageLogsFormComponent,
    MJAPIKeysFormComponent,
    MJAPIScopesFormComponent,
    MJApplicationEntitiesFormComponent,
    MJApplicationSettingsFormComponent,
    MJApplicationsFormComponent,
    MJArtifactPermissionsFormComponent,
    MJArtifactTypesFormComponent,
    MJArtifactUsesFormComponent,
    MJArtifactVersionAttributesFormComponent,
    MJArtifactVersionsFormComponent,
    MJArtifactsFormComponent,
    MJAuditLogTypesFormComponent,
    MJAuditLogsFormComponent,
    MJAuthorizationRolesFormComponent,
    MJAuthorizationsFormComponent,
    MJCollectionArtifactsFormComponent,
    MJCollectionPermissionsFormComponent,
    MJCollectionsFormComponent],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
    BaseFormsModule,
    EntityViewerModule,
    LinkDirectivesModule
],
exports: [
]
})
export class GeneratedForms_SubModule_3 { }
    


@NgModule({
declarations: [
    MJCommunicationBaseMessageTypesFormComponent,
    MJCommunicationLogsFormComponent,
    MJCommunicationProviderMessageTypesFormComponent,
    MJCommunicationProvidersFormComponent,
    MJCommunicationRunsFormComponent,
    MJCompaniesFormComponent,
    MJCompanyIntegrationRecordMapsFormComponent,
    MJCompanyIntegrationRunAPILogsFormComponent,
    MJCompanyIntegrationRunDetailsFormComponent,
    MJCompanyIntegrationRunsFormComponent,
    MJCompanyIntegrationsFormComponent,
    MJComponentDependenciesFormComponent,
    MJComponentLibrariesFormComponent,
    MJComponentLibraryLinksFormComponent,
    MJComponentRegistriesFormComponent,
    MJComponentsFormComponent,
    MJContentFileTypesFormComponent,
    MJContentItemAttributesFormComponent,
    MJContentItemTagsFormComponent,
    MJContentItemsFormComponent],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
    BaseFormsModule,
    EntityViewerModule,
    LinkDirectivesModule,
    JoinGridModule
],
exports: [
]
})
export class GeneratedForms_SubModule_4 { }
    


@NgModule({
declarations: [
    MJContentProcessRunsFormComponent,
    MJContentSourceParamsFormComponent,
    MJContentSourceTypeParamsFormComponent,
    MJContentSourceTypesFormComponent,
    MJContentSourcesFormComponent,
    MJContentTypeAttributesFormComponent,
    MJContentTypesFormComponent,
    MJConversationArtifactPermissionsFormComponent,
    MJConversationArtifactVersionsFormComponent,
    MJConversationArtifactsFormComponent,
    MJConversationDetailArtifactsFormComponent,
    MJConversationDetailAttachmentsFormComponent,
    MJConversationDetailRatingsFormComponent,
    MJConversationDetailsFormComponent,
    MJConversationsFormComponent,
    MJCredentialCategoriesFormComponent,
    MJCredentialTypesFormComponent,
    MJCredentialsFormComponent,
    MJDashboardCategoriesFormComponent,
    MJDashboardCategoryLinksFormComponent],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
    BaseFormsModule,
    EntityViewerModule,
    LinkDirectivesModule
],
exports: [
]
})
export class GeneratedForms_SubModule_5 { }
    


@NgModule({
declarations: [
    MJDashboardCategoryPermissionsFormComponent,
    MJDashboardPartTypesFormComponent,
    MJDashboardPermissionsFormComponent,
    MJDashboardUserPreferencesFormComponent,
    MJDashboardUserStatesFormComponent,
    MJDashboardsFormComponent,
    MJDataContextItemsFormComponent,
    MJDataContextsFormComponent,
    MJDatasetItemsFormComponent,
    MJDatasetsFormComponent,
    MJDuplicateRunDetailMatchesFormComponent,
    MJDuplicateRunDetailsFormComponent,
    MJDuplicateRunsFormComponent,
    MJEmployeeCompanyIntegrationsFormComponent,
    MJEmployeeRolesFormComponent,
    MJEmployeeSkillsFormComponent,
    MJEmployeesFormComponent,
    MJEncryptionAlgorithmsFormComponent,
    MJEncryptionKeySourcesFormComponent,
    MJEncryptionKeysFormComponent],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
    BaseFormsModule,
    EntityViewerModule,
    LinkDirectivesModule
],
exports: [
]
})
export class GeneratedForms_SubModule_6 { }
    


@NgModule({
declarations: [
    MJEntitiesFormComponent,
    MJEntityActionFiltersFormComponent,
    MJEntityActionInvocationTypesFormComponent,
    MJEntityActionInvocationsFormComponent,
    MJEntityActionParamsFormComponent,
    MJEntityActionsFormComponent,
    MJEntityAIActionsFormComponent,
    MJEntityCommunicationFieldsFormComponent,
    MJEntityCommunicationMessageTypesFormComponent,
    MJEntityDocumentRunsFormComponent,
    MJEntityDocumentSettingsFormComponent,
    MJEntityDocumentTypesFormComponent,
    MJEntityDocumentsFormComponent,
    MJEntityFieldValuesFormComponent,
    MJEntityFieldsFormComponent,
    MJEntityPermissionsFormComponent,
    MJEntityRecordDocumentsFormComponent,
    MJEntityRelationshipDisplayComponentsFormComponent,
    MJEntityRelationshipsFormComponent,
    MJEntitySettingsFormComponent],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
    BaseFormsModule,
    EntityViewerModule,
    LinkDirectivesModule
],
exports: [
]
})
export class GeneratedForms_SubModule_7 { }
    


@NgModule({
declarations: [
    MJEnvironmentsFormComponent,
    MJErrorLogsFormComponent,
    MJExplorerNavigationItemsFormComponent,
    MJFileCategoriesFormComponent,
    MJFileEntityRecordLinksFormComponent,
    MJFileStorageAccountsFormComponent,
    MJFileStorageProvidersFormComponent,
    MJFilesFormComponent,
    MJGeneratedCodeCategoriesFormComponent,
    MJGeneratedCodesFormComponent,
    MJIntegrationURLFormatsFormComponent,
    MJIntegrationsFormComponent,
    MJLibrariesFormComponent,
    MJLibraryItemsFormComponent,
    MJListCategoriesFormComponent,
    MJListDetailsFormComponent,
    MJListInvitationsFormComponent,
    MJListSharesFormComponent,
    MJListsFormComponent,
    MJMCPServerConnectionPermissionsFormComponent],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
    BaseFormsModule,
    EntityViewerModule,
    LinkDirectivesModule
],
exports: [
]
})
export class GeneratedForms_SubModule_8 { }
    


@NgModule({
declarations: [
    MJMCPServerConnectionToolsFormComponent,
    MJMCPServerConnectionsFormComponent,
    MJMCPServerToolsFormComponent,
    MJMCPServersFormComponent,
    MJMCPToolExecutionLogsFormComponent,
    MJOAuthAuthServerMetadataCachesFormComponent,
    MJOAuthAuthorizationStatesFormComponent,
    MJOAuthClientRegistrationsFormComponent,
    MJOAuthTokensFormComponent,
    MJOpenAppDependenciesFormComponent,
    MJOpenAppInstallHistoriesFormComponent,
    MJOpenAppsFormComponent,
    MJOutputDeliveryTypesFormComponent,
    MJOutputFormatTypesFormComponent,
    MJOutputTriggerTypesFormComponent,
    MJProjectsFormComponent,
    MJPublicLinksFormComponent,
    MJQueriesFormComponent,
    MJQueryCategoriesFormComponent,
    MJQueryEntitiesFormComponent],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
    BaseFormsModule,
    EntityViewerModule,
    LinkDirectivesModule
],
exports: [
]
})
export class GeneratedForms_SubModule_9 { }
    


@NgModule({
declarations: [
    MJQueryFieldsFormComponent,
    MJQueryParametersFormComponent,
    MJQueryPermissionsFormComponent,
    MJQueueTasksFormComponent,
    MJQueueTypesFormComponent,
    MJQueuesFormComponent,
    MJRecommendationItemsFormComponent,
    MJRecommendationProvidersFormComponent,
    MJRecommendationRunsFormComponent,
    MJRecommendationsFormComponent,
    MJRecordChangeReplayRunsFormComponent,
    MJRecordChangesFormComponent,
    MJRecordLinksFormComponent,
    MJRecordMergeDeletionLogsFormComponent,
    MJRecordMergeLogsFormComponent,
    MJReportCategoriesFormComponent,
    MJReportSnapshotsFormComponent,
    MJReportUserStatesFormComponent,
    MJReportVersionsFormComponent,
    MJReportsFormComponent],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
    BaseFormsModule,
    EntityViewerModule,
    LinkDirectivesModule
],
exports: [
]
})
export class GeneratedForms_SubModule_10 { }
    


@NgModule({
declarations: [
    MJResourceLinksFormComponent,
    MJResourcePermissionsFormComponent,
    MJResourceTypesFormComponent,
    MJRolesFormComponent,
    MJRowLevelSecurityFiltersFormComponent,
    MJScheduledActionParamsFormComponent,
    MJScheduledActionsFormComponent,
    MJScheduledJobRunsFormComponent,
    MJScheduledJobTypesFormComponent,
    MJScheduledJobsFormComponent,
    MJSchemaInfoFormComponent,
    MJSkillsFormComponent,
    MJTaggedItemsFormComponent,
    MJTagsFormComponent,
    MJTaskDependenciesFormComponent,
    MJTaskTypesFormComponent,
    MJTasksFormComponent,
    MJTemplateCategoriesFormComponent,
    MJTemplateContentTypesFormComponent,
    MJTemplateContentsFormComponent],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
    BaseFormsModule,
    EntityViewerModule,
    LinkDirectivesModule
],
exports: [
]
})
export class GeneratedForms_SubModule_11 { }
    


@NgModule({
declarations: [
    MJTemplateParamsFormComponent,
    MJTemplatesFormComponent,
    MJTestRubricsFormComponent,
    MJTestRunFeedbacksFormComponent,
    MJTestRunsFormComponent,
    MJTestSuiteRunsFormComponent,
    MJTestSuiteTestsFormComponent,
    MJTestSuitesFormComponent,
    MJTestTypesFormComponent,
    MJTestsFormComponent,
    MJUserApplicationEntitiesFormComponent,
    MJUserApplicationsFormComponent,
    MJUserFavoritesFormComponent,
    MJUserNotificationPreferencesFormComponent,
    MJUserNotificationTypesFormComponent,
    MJUserNotificationsFormComponent,
    MJUserRecordLogsFormComponent,
    MJUserRolesFormComponent,
    MJUserSettingsFormComponent,
    MJUserViewCategoriesFormComponent],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
    BaseFormsModule,
    EntityViewerModule,
    LinkDirectivesModule
],
exports: [
]
})
export class GeneratedForms_SubModule_12 { }
    


@NgModule({
declarations: [
    MJUserViewRunDetailsFormComponent,
    MJUserViewRunsFormComponent,
    MJUserViewsFormComponent,
    MJUsersFormComponent,
    MJVectorDatabasesFormComponent,
    MJVectorIndexesFormComponent,
    MJVersionInstallationsFormComponent,
    MJVersionLabelItemsFormComponent,
    MJVersionLabelRestoresFormComponent,
    MJVersionLabelsFormComponent,
    MJWorkflowEnginesFormComponent,
    MJWorkflowRunsFormComponent,
    MJWorkflowsFormComponent,
    MJWorkspaceItemsFormComponent,
    MJWorkspacesFormComponent],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
    BaseFormsModule,
    EntityViewerModule,
    LinkDirectivesModule
],
exports: [
]
})
export class GeneratedForms_SubModule_13 { }
    


@NgModule({
declarations: [
],
imports: [
    GeneratedForms_SubModule_0,
    GeneratedForms_SubModule_1,
    GeneratedForms_SubModule_2,
    GeneratedForms_SubModule_3,
    GeneratedForms_SubModule_4,
    GeneratedForms_SubModule_5,
    GeneratedForms_SubModule_6,
    GeneratedForms_SubModule_7,
    GeneratedForms_SubModule_8,
    GeneratedForms_SubModule_9,
    GeneratedForms_SubModule_10,
    GeneratedForms_SubModule_11,
    GeneratedForms_SubModule_12,
    GeneratedForms_SubModule_13
]
})
export class CoreGeneratedFormsModule { }
    
// Note: LoadXXXGeneratedForms() functions have been removed. Tree-shaking prevention
// is now handled by the pre-built class registration manifest system.
// See packages/CodeGenLib/CLASS_MANIFEST_GUIDE.md for details.
    