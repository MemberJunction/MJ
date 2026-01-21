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
import { FormToolbarModule } from '@memberjunction/ng-form-toolbar';
import { EntityViewerModule } from '@memberjunction/ng-entity-viewer';
import { LinkDirectivesModule } from '@memberjunction/ng-link-directives';
import { MJTabStripModule } from "@memberjunction/ng-tabstrip";
import { ContainerDirectivesModule } from "@memberjunction/ng-container-directives";

// Kendo Imports
import { InputsModule } from '@progress/kendo-angular-inputs';
import { DateInputsModule } from '@progress/kendo-angular-dateinputs';
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { LayoutModule } from '@progress/kendo-angular-layout';
import { ComboBoxModule } from '@progress/kendo-angular-dropdowns';
import { DropDownListModule } from '@progress/kendo-angular-dropdowns';

// Import Generated Components
import { ActionAuthorizationFormComponent, LoadActionAuthorizationFormComponent } from "./Entities/ActionAuthorization/actionauthorization.form.component";
import { ActionCategoryFormComponent, LoadActionCategoryFormComponent } from "./Entities/ActionCategory/actioncategory.form.component";
import { ActionContextTypeFormComponent, LoadActionContextTypeFormComponent } from "./Entities/ActionContextType/actioncontexttype.form.component";
import { ActionContextFormComponent, LoadActionContextFormComponent } from "./Entities/ActionContext/actioncontext.form.component";
import { ActionExecutionLogFormComponent, LoadActionExecutionLogFormComponent } from "./Entities/ActionExecutionLog/actionexecutionlog.form.component";
import { ActionFilterFormComponent, LoadActionFilterFormComponent } from "./Entities/ActionFilter/actionfilter.form.component";
import { ActionLibraryFormComponent, LoadActionLibraryFormComponent } from "./Entities/ActionLibrary/actionlibrary.form.component";
import { ActionParamFormComponent, LoadActionParamFormComponent } from "./Entities/ActionParam/actionparam.form.component";
import { ActionResultCodeFormComponent, LoadActionResultCodeFormComponent } from "./Entities/ActionResultCode/actionresultcode.form.component";
import { ActionFormComponent, LoadActionFormComponent } from "./Entities/Action/action.form.component";
import { AIActionFormComponent, LoadAIActionFormComponent } from "./Entities/AIAction/aiaction.form.component";
import { AIAgentActionFormComponent, LoadAIAgentActionFormComponent } from "./Entities/AIAgentAction/aiagentaction.form.component";
import { AIAgentLearningCycleFormComponent, LoadAIAgentLearningCycleFormComponent } from "./Entities/AIAgentLearningCycle/aiagentlearningcycle.form.component";
import { AIAgentModelFormComponent, LoadAIAgentModelFormComponent } from "./Entities/AIAgentModel/aiagentmodel.form.component";
import { AIAgentNoteTypeFormComponent, LoadAIAgentNoteTypeFormComponent } from "./Entities/AIAgentNoteType/aiagentnotetype.form.component";
import { AIAgentNoteFormComponent, LoadAIAgentNoteFormComponent } from "./Entities/AIAgentNote/aiagentnote.form.component";
import { AIAgentRequestFormComponent, LoadAIAgentRequestFormComponent } from "./Entities/AIAgentRequest/aiagentrequest.form.component";
import { AIAgentFormComponent, LoadAIAgentFormComponent } from "./Entities/AIAgent/aiagent.form.component";
import { AIModelActionFormComponent, LoadAIModelActionFormComponent } from "./Entities/AIModelAction/aimodelaction.form.component";
import { AIModelTypeFormComponent, LoadAIModelTypeFormComponent } from "./Entities/AIModelType/aimodeltype.form.component";
import { AIModelFormComponent, LoadAIModelFormComponent } from "./Entities/AIModel/aimodel.form.component";
import { AIPromptCategoryFormComponent, LoadAIPromptCategoryFormComponent } from "./Entities/AIPromptCategory/aipromptcategory.form.component";
import { AIPromptTypeFormComponent, LoadAIPromptTypeFormComponent } from "./Entities/AIPromptType/aiprompttype.form.component";
import { AIPromptFormComponent, LoadAIPromptFormComponent } from "./Entities/AIPrompt/aiprompt.form.component";
import { AIResultCacheFormComponent, LoadAIResultCacheFormComponent } from "./Entities/AIResultCache/airesultcache.form.component";
import { ApplicationEntityFormComponent, LoadApplicationEntityFormComponent } from "./Entities/ApplicationEntity/applicationentity.form.component";
import { ApplicationSettingFormComponent, LoadApplicationSettingFormComponent } from "./Entities/ApplicationSetting/applicationsetting.form.component";
import { ApplicationFormComponent, LoadApplicationFormComponent } from "./Entities/Application/application.form.component";
import { AuditLogTypeFormComponent, LoadAuditLogTypeFormComponent } from "./Entities/AuditLogType/auditlogtype.form.component";
import { AuditLogFormComponent, LoadAuditLogFormComponent } from "./Entities/AuditLog/auditlog.form.component";
import { AuthorizationRoleFormComponent, LoadAuthorizationRoleFormComponent } from "./Entities/AuthorizationRole/authorizationrole.form.component";
import { AuthorizationFormComponent, LoadAuthorizationFormComponent } from "./Entities/Authorization/authorization.form.component";
import { CommunicationBaseMessageTypeFormComponent, LoadCommunicationBaseMessageTypeFormComponent } from "./Entities/CommunicationBaseMessageType/communicationbasemessagetype.form.component";
import { CommunicationLogFormComponent, LoadCommunicationLogFormComponent } from "./Entities/CommunicationLog/communicationlog.form.component";
import { CommunicationProviderMessageTypeFormComponent, LoadCommunicationProviderMessageTypeFormComponent } from "./Entities/CommunicationProviderMessageType/communicationprovidermessagetype.form.component";
import { CommunicationProviderFormComponent, LoadCommunicationProviderFormComponent } from "./Entities/CommunicationProvider/communicationprovider.form.component";
import { CommunicationRunFormComponent, LoadCommunicationRunFormComponent } from "./Entities/CommunicationRun/communicationrun.form.component";
import { CompanyFormComponent, LoadCompanyFormComponent } from "./Entities/Company/company.form.component";
import { CompanyIntegrationRecordMapFormComponent, LoadCompanyIntegrationRecordMapFormComponent } from "./Entities/CompanyIntegrationRecordMap/companyintegrationrecordmap.form.component";
import { CompanyIntegrationRunAPILogFormComponent, LoadCompanyIntegrationRunAPILogFormComponent } from "./Entities/CompanyIntegrationRunAPILog/companyintegrationrunapilog.form.component";
import { CompanyIntegrationRunDetailFormComponent, LoadCompanyIntegrationRunDetailFormComponent } from "./Entities/CompanyIntegrationRunDetail/companyintegrationrundetail.form.component";
import { CompanyIntegrationRunFormComponent, LoadCompanyIntegrationRunFormComponent } from "./Entities/CompanyIntegrationRun/companyintegrationrun.form.component";
import { CompanyIntegrationFormComponent, LoadCompanyIntegrationFormComponent } from "./Entities/CompanyIntegration/companyintegration.form.component";
import { ContentFileTypeFormComponent, LoadContentFileTypeFormComponent } from "./Entities/ContentFileType/contentfiletype.form.component";
import { ContentItemAttributeFormComponent, LoadContentItemAttributeFormComponent } from "./Entities/ContentItemAttribute/contentitemattribute.form.component";
import { ContentItemTagFormComponent, LoadContentItemTagFormComponent } from "./Entities/ContentItemTag/contentitemtag.form.component";
import { ContentItemFormComponent, LoadContentItemFormComponent } from "./Entities/ContentItem/contentitem.form.component";
import { ContentProcessRunFormComponent, LoadContentProcessRunFormComponent } from "./Entities/ContentProcessRun/contentprocessrun.form.component";
import { ContentSourceParamFormComponent, LoadContentSourceParamFormComponent } from "./Entities/ContentSourceParam/contentsourceparam.form.component";
import { ContentSourceTypeParamFormComponent, LoadContentSourceTypeParamFormComponent } from "./Entities/ContentSourceTypeParam/contentsourcetypeparam.form.component";
import { ContentSourceTypeFormComponent, LoadContentSourceTypeFormComponent } from "./Entities/ContentSourceType/contentsourcetype.form.component";
import { ContentSourceFormComponent, LoadContentSourceFormComponent } from "./Entities/ContentSource/contentsource.form.component";
import { ContentTypeAttributeFormComponent, LoadContentTypeAttributeFormComponent } from "./Entities/ContentTypeAttribute/contenttypeattribute.form.component";
import { ContentTypeFormComponent, LoadContentTypeFormComponent } from "./Entities/ContentType/contenttype.form.component";
import { ConversationDetailFormComponent, LoadConversationDetailFormComponent } from "./Entities/ConversationDetail/conversationdetail.form.component";
import { ConversationFormComponent, LoadConversationFormComponent } from "./Entities/Conversation/conversation.form.component";
import { DashboardCategoryFormComponent, LoadDashboardCategoryFormComponent } from "./Entities/DashboardCategory/dashboardcategory.form.component";
import { DashboardFormComponent, LoadDashboardFormComponent } from "./Entities/Dashboard/dashboard.form.component";
import { DataContextItemFormComponent, LoadDataContextItemFormComponent } from "./Entities/DataContextItem/datacontextitem.form.component";
import { DataContextFormComponent, LoadDataContextFormComponent } from "./Entities/DataContext/datacontext.form.component";
import { DatasetItemFormComponent, LoadDatasetItemFormComponent } from "./Entities/DatasetItem/datasetitem.form.component";
import { DatasetFormComponent, LoadDatasetFormComponent } from "./Entities/Dataset/dataset.form.component";
import { DuplicateRunDetailMatchFormComponent, LoadDuplicateRunDetailMatchFormComponent } from "./Entities/DuplicateRunDetailMatch/duplicaterundetailmatch.form.component";
import { DuplicateRunDetailFormComponent, LoadDuplicateRunDetailFormComponent } from "./Entities/DuplicateRunDetail/duplicaterundetail.form.component";
import { DuplicateRunFormComponent, LoadDuplicateRunFormComponent } from "./Entities/DuplicateRun/duplicaterun.form.component";
import { EmployeeCompanyIntegrationFormComponent, LoadEmployeeCompanyIntegrationFormComponent } from "./Entities/EmployeeCompanyIntegration/employeecompanyintegration.form.component";
import { EmployeeRoleFormComponent, LoadEmployeeRoleFormComponent } from "./Entities/EmployeeRole/employeerole.form.component";
import { EmployeeSkillFormComponent, LoadEmployeeSkillFormComponent } from "./Entities/EmployeeSkill/employeeskill.form.component";
import { EmployeeFormComponent, LoadEmployeeFormComponent } from "./Entities/Employee/employee.form.component";
import { EntityFormComponent, LoadEntityFormComponent } from "./Entities/Entity/entity.form.component";
import { EntityActionFilterFormComponent, LoadEntityActionFilterFormComponent } from "./Entities/EntityActionFilter/entityactionfilter.form.component";
import { EntityActionInvocationTypeFormComponent, LoadEntityActionInvocationTypeFormComponent } from "./Entities/EntityActionInvocationType/entityactioninvocationtype.form.component";
import { EntityActionInvocationFormComponent, LoadEntityActionInvocationFormComponent } from "./Entities/EntityActionInvocation/entityactioninvocation.form.component";
import { EntityActionParamFormComponent, LoadEntityActionParamFormComponent } from "./Entities/EntityActionParam/entityactionparam.form.component";
import { EntityActionFormComponent, LoadEntityActionFormComponent } from "./Entities/EntityAction/entityaction.form.component";
import { EntityAIActionFormComponent, LoadEntityAIActionFormComponent } from "./Entities/EntityAIAction/entityaiaction.form.component";
import { EntityCommunicationFieldFormComponent, LoadEntityCommunicationFieldFormComponent } from "./Entities/EntityCommunicationField/entitycommunicationfield.form.component";
import { EntityCommunicationMessageTypeFormComponent, LoadEntityCommunicationMessageTypeFormComponent } from "./Entities/EntityCommunicationMessageType/entitycommunicationmessagetype.form.component";
import { EntityDocumentRunFormComponent, LoadEntityDocumentRunFormComponent } from "./Entities/EntityDocumentRun/entitydocumentrun.form.component";
import { EntityDocumentSettingFormComponent, LoadEntityDocumentSettingFormComponent } from "./Entities/EntityDocumentSetting/entitydocumentsetting.form.component";
import { EntityDocumentTypeFormComponent, LoadEntityDocumentTypeFormComponent } from "./Entities/EntityDocumentType/entitydocumenttype.form.component";
import { EntityDocumentFormComponent, LoadEntityDocumentFormComponent } from "./Entities/EntityDocument/entitydocument.form.component";
import { EntityFieldValueFormComponent, LoadEntityFieldValueFormComponent } from "./Entities/EntityFieldValue/entityfieldvalue.form.component";
import { EntityFieldFormComponent, LoadEntityFieldFormComponent } from "./Entities/EntityField/entityfield.form.component";
import { EntityPermissionFormComponent, LoadEntityPermissionFormComponent } from "./Entities/EntityPermission/entitypermission.form.component";
import { EntityRecordDocumentFormComponent, LoadEntityRecordDocumentFormComponent } from "./Entities/EntityRecordDocument/entityrecorddocument.form.component";
import { EntityRelationshipDisplayComponentFormComponent, LoadEntityRelationshipDisplayComponentFormComponent } from "./Entities/EntityRelationshipDisplayComponent/entityrelationshipdisplaycomponent.form.component";
import { EntityRelationshipFormComponent, LoadEntityRelationshipFormComponent } from "./Entities/EntityRelationship/entityrelationship.form.component";
import { EntitySettingFormComponent, LoadEntitySettingFormComponent } from "./Entities/EntitySetting/entitysetting.form.component";
import { ErrorLogFormComponent, LoadErrorLogFormComponent } from "./Entities/ErrorLog/errorlog.form.component";
import { ExplorerNavigationItemFormComponent, LoadExplorerNavigationItemFormComponent } from "./Entities/ExplorerNavigationItem/explorernavigationitem.form.component";
import { FileCategoryFormComponent, LoadFileCategoryFormComponent } from "./Entities/FileCategory/filecategory.form.component";
import { FileEntityRecordLinkFormComponent, LoadFileEntityRecordLinkFormComponent } from "./Entities/FileEntityRecordLink/fileentityrecordlink.form.component";
import { FileStorageProviderFormComponent, LoadFileStorageProviderFormComponent } from "./Entities/FileStorageProvider/filestorageprovider.form.component";
import { FileFormComponent, LoadFileFormComponent } from "./Entities/File/file.form.component";
import { flyway_schema_historyFormComponent, Loadflyway_schema_historyFormComponent } from "./Entities/flyway_schema_history/flyway_schema_history.form.component";
import { GeneratedCodeCategoryFormComponent, LoadGeneratedCodeCategoryFormComponent } from "./Entities/GeneratedCodeCategory/generatedcodecategory.form.component";
import { GeneratedCodeFormComponent, LoadGeneratedCodeFormComponent } from "./Entities/GeneratedCode/generatedcode.form.component";
import { IntegrationURLFormatFormComponent, LoadIntegrationURLFormatFormComponent } from "./Entities/IntegrationURLFormat/integrationurlformat.form.component";
import { IntegrationFormComponent, LoadIntegrationFormComponent } from "./Entities/Integration/integration.form.component";
import { LibraryFormComponent, LoadLibraryFormComponent } from "./Entities/Library/library.form.component";
import { LibraryItemFormComponent, LoadLibraryItemFormComponent } from "./Entities/LibraryItem/libraryitem.form.component";
import { ListCategoryFormComponent, LoadListCategoryFormComponent } from "./Entities/ListCategory/listcategory.form.component";
import { ListDetailFormComponent, LoadListDetailFormComponent } from "./Entities/ListDetail/listdetail.form.component";
import { ListFormComponent, LoadListFormComponent } from "./Entities/List/list.form.component";
import { AccessControlRuleFormComponent, LoadAccessControlRuleFormComponent } from "./Entities/AccessControlRule/accesscontrolrule.form.component";
import { AIAgentArtifactTypeFormComponent, LoadAIAgentArtifactTypeFormComponent } from "./Entities/AIAgentArtifactType/aiagentartifacttype.form.component";
import { AIAgentConfigurationFormComponent, LoadAIAgentConfigurationFormComponent } from "./Entities/AIAgentConfiguration/aiagentconfiguration.form.component";
import { AIAgentDataSourceFormComponent, LoadAIAgentDataSourceFormComponent } from "./Entities/AIAgentDataSource/aiagentdatasource.form.component";
import { AIAgentExampleFormComponent, LoadAIAgentExampleFormComponent } from "./Entities/AIAgentExample/aiagentexample.form.component";
import { AIAgentModalityFormComponent, LoadAIAgentModalityFormComponent } from "./Entities/AIAgentModality/aiagentmodality.form.component";
import { AIAgentPermissionFormComponent, LoadAIAgentPermissionFormComponent } from "./Entities/AIAgentPermission/aiagentpermission.form.component";
import { AIAgentPromptFormComponent, LoadAIAgentPromptFormComponent } from "./Entities/AIAgentPrompt/aiagentprompt.form.component";
import { AIAgentRelationshipFormComponent, LoadAIAgentRelationshipFormComponent } from "./Entities/AIAgentRelationship/aiagentrelationship.form.component";
import { AIAgentRunMediaFormComponent, LoadAIAgentRunMediaFormComponent } from "./Entities/AIAgentRunMedia/aiagentrunmedia.form.component";
import { AIAgentRunStepFormComponent, LoadAIAgentRunStepFormComponent } from "./Entities/AIAgentRunStep/aiagentrunstep.form.component";
import { AIAgentRunFormComponent, LoadAIAgentRunFormComponent } from "./Entities/AIAgentRun/aiagentrun.form.component";
import { AIAgentStepPathFormComponent, LoadAIAgentStepPathFormComponent } from "./Entities/AIAgentStepPath/aiagentsteppath.form.component";
import { AIAgentStepFormComponent, LoadAIAgentStepFormComponent } from "./Entities/AIAgentStep/aiagentstep.form.component";
import { AIAgentTypeFormComponent, LoadAIAgentTypeFormComponent } from "./Entities/AIAgentType/aiagenttype.form.component";
import { AIArchitectureFormComponent, LoadAIArchitectureFormComponent } from "./Entities/AIArchitecture/aiarchitecture.form.component";
import { AIConfigurationParamFormComponent, LoadAIConfigurationParamFormComponent } from "./Entities/AIConfigurationParam/aiconfigurationparam.form.component";
import { AIConfigurationFormComponent, LoadAIConfigurationFormComponent } from "./Entities/AIConfiguration/aiconfiguration.form.component";
import { AICredentialBindingFormComponent, LoadAICredentialBindingFormComponent } from "./Entities/AICredentialBinding/aicredentialbinding.form.component";
import { AIModalityFormComponent, LoadAIModalityFormComponent } from "./Entities/AIModality/aimodality.form.component";
import { AIModelArchitectureFormComponent, LoadAIModelArchitectureFormComponent } from "./Entities/AIModelArchitecture/aimodelarchitecture.form.component";
import { AIModelCostFormComponent, LoadAIModelCostFormComponent } from "./Entities/AIModelCost/aimodelcost.form.component";
import { AIModelModalityFormComponent, LoadAIModelModalityFormComponent } from "./Entities/AIModelModality/aimodelmodality.form.component";
import { AIModelPriceTypeFormComponent, LoadAIModelPriceTypeFormComponent } from "./Entities/AIModelPriceType/aimodelpricetype.form.component";
import { AIModelPriceUnitTypeFormComponent, LoadAIModelPriceUnitTypeFormComponent } from "./Entities/AIModelPriceUnitType/aimodelpriceunittype.form.component";
import { AIModelVendorFormComponent, LoadAIModelVendorFormComponent } from "./Entities/AIModelVendor/aimodelvendor.form.component";
import { AIPromptModelFormComponent, LoadAIPromptModelFormComponent } from "./Entities/AIPromptModel/aipromptmodel.form.component";
import { AIPromptRunMediaFormComponent, LoadAIPromptRunMediaFormComponent } from "./Entities/AIPromptRunMedia/aipromptrunmedia.form.component";
import { AIPromptRunFormComponent, LoadAIPromptRunFormComponent } from "./Entities/AIPromptRun/aipromptrun.form.component";
import { AIVendorTypeDefinitionFormComponent, LoadAIVendorTypeDefinitionFormComponent } from "./Entities/AIVendorTypeDefinition/aivendortypedefinition.form.component";
import { AIVendorTypeFormComponent, LoadAIVendorTypeFormComponent } from "./Entities/AIVendorType/aivendortype.form.component";
import { AIVendorFormComponent, LoadAIVendorFormComponent } from "./Entities/AIVendor/aivendor.form.component";
import { ArtifactPermissionFormComponent, LoadArtifactPermissionFormComponent } from "./Entities/ArtifactPermission/artifactpermission.form.component";
import { ArtifactTypeFormComponent, LoadArtifactTypeFormComponent } from "./Entities/ArtifactType/artifacttype.form.component";
import { ArtifactUseFormComponent, LoadArtifactUseFormComponent } from "./Entities/ArtifactUse/artifactuse.form.component";
import { ArtifactVersionAttributeFormComponent, LoadArtifactVersionAttributeFormComponent } from "./Entities/ArtifactVersionAttribute/artifactversionattribute.form.component";
import { ArtifactVersionFormComponent, LoadArtifactVersionFormComponent } from "./Entities/ArtifactVersion/artifactversion.form.component";
import { ArtifactFormComponent, LoadArtifactFormComponent } from "./Entities/Artifact/artifact.form.component";
import { CollectionArtifactFormComponent, LoadCollectionArtifactFormComponent } from "./Entities/CollectionArtifact/collectionartifact.form.component";
import { CollectionPermissionFormComponent, LoadCollectionPermissionFormComponent } from "./Entities/CollectionPermission/collectionpermission.form.component";
import { CollectionFormComponent, LoadCollectionFormComponent } from "./Entities/Collection/collection.form.component";
import { ComponentDependencyFormComponent, LoadComponentDependencyFormComponent } from "./Entities/ComponentDependency/componentdependency.form.component";
import { ComponentLibraryFormComponent, LoadComponentLibraryFormComponent } from "./Entities/ComponentLibrary/componentlibrary.form.component";
import { ComponentLibraryLinkFormComponent, LoadComponentLibraryLinkFormComponent } from "./Entities/ComponentLibraryLink/componentlibrarylink.form.component";
import { ComponentRegistryFormComponent, LoadComponentRegistryFormComponent } from "./Entities/ComponentRegistry/componentregistry.form.component";
import { ComponentFormComponent, LoadComponentFormComponent } from "./Entities/Component/component.form.component";
import { ConversationArtifactPermissionFormComponent, LoadConversationArtifactPermissionFormComponent } from "./Entities/ConversationArtifactPermission/conversationartifactpermission.form.component";
import { ConversationArtifactVersionFormComponent, LoadConversationArtifactVersionFormComponent } from "./Entities/ConversationArtifactVersion/conversationartifactversion.form.component";
import { ConversationArtifactFormComponent, LoadConversationArtifactFormComponent } from "./Entities/ConversationArtifact/conversationartifact.form.component";
import { ConversationDetailArtifactFormComponent, LoadConversationDetailArtifactFormComponent } from "./Entities/ConversationDetailArtifact/conversationdetailartifact.form.component";
import { ConversationDetailAttachmentFormComponent, LoadConversationDetailAttachmentFormComponent } from "./Entities/ConversationDetailAttachment/conversationdetailattachment.form.component";
import { ConversationDetailRatingFormComponent, LoadConversationDetailRatingFormComponent } from "./Entities/ConversationDetailRating/conversationdetailrating.form.component";
import { CredentialCategoryFormComponent, LoadCredentialCategoryFormComponent } from "./Entities/CredentialCategory/credentialcategory.form.component";
import { CredentialTypeFormComponent, LoadCredentialTypeFormComponent } from "./Entities/CredentialType/credentialtype.form.component";
import { CredentialFormComponent, LoadCredentialFormComponent } from "./Entities/Credential/credential.form.component";
import { DashboardCategoryLinkFormComponent, LoadDashboardCategoryLinkFormComponent } from "./Entities/DashboardCategoryLink/dashboardcategorylink.form.component";
import { DashboardCategoryPermissionFormComponent, LoadDashboardCategoryPermissionFormComponent } from "./Entities/DashboardCategoryPermission/dashboardcategorypermission.form.component";
import { DashboardPartTypeFormComponent, LoadDashboardPartTypeFormComponent } from "./Entities/DashboardPartType/dashboardparttype.form.component";
import { DashboardPermissionFormComponent, LoadDashboardPermissionFormComponent } from "./Entities/DashboardPermission/dashboardpermission.form.component";
import { DashboardUserPreferenceFormComponent, LoadDashboardUserPreferenceFormComponent } from "./Entities/DashboardUserPreference/dashboarduserpreference.form.component";
import { DashboardUserStateFormComponent, LoadDashboardUserStateFormComponent } from "./Entities/DashboardUserState/dashboarduserstate.form.component";
import { EncryptionAlgorithmFormComponent, LoadEncryptionAlgorithmFormComponent } from "./Entities/EncryptionAlgorithm/encryptionalgorithm.form.component";
import { EncryptionKeySourceFormComponent, LoadEncryptionKeySourceFormComponent } from "./Entities/EncryptionKeySource/encryptionkeysource.form.component";
import { EncryptionKeyFormComponent, LoadEncryptionKeyFormComponent } from "./Entities/EncryptionKey/encryptionkey.form.component";
import { EnvironmentFormComponent, LoadEnvironmentFormComponent } from "./Entities/Environment/environment.form.component";
import { ListInvitationFormComponent, LoadListInvitationFormComponent } from "./Entities/ListInvitation/listinvitation.form.component";
import { ListShareFormComponent, LoadListShareFormComponent } from "./Entities/ListShare/listshare.form.component";
import { ProjectFormComponent, LoadProjectFormComponent } from "./Entities/Project/project.form.component";
import { PublicLinkFormComponent, LoadPublicLinkFormComponent } from "./Entities/PublicLink/publiclink.form.component";
import { QueryParameterFormComponent, LoadQueryParameterFormComponent } from "./Entities/QueryParameter/queryparameter.form.component";
import { RecordLinkFormComponent, LoadRecordLinkFormComponent } from "./Entities/RecordLink/recordlink.form.component";
import { ReportUserStateFormComponent, LoadReportUserStateFormComponent } from "./Entities/ReportUserState/reportuserstate.form.component";
import { ReportVersionFormComponent, LoadReportVersionFormComponent } from "./Entities/ReportVersion/reportversion.form.component";
import { ScheduledJobRunFormComponent, LoadScheduledJobRunFormComponent } from "./Entities/ScheduledJobRun/scheduledjobrun.form.component";
import { ScheduledJobTypeFormComponent, LoadScheduledJobTypeFormComponent } from "./Entities/ScheduledJobType/scheduledjobtype.form.component";
import { ScheduledJobFormComponent, LoadScheduledJobFormComponent } from "./Entities/ScheduledJob/scheduledjob.form.component";
import { TaskDependencyFormComponent, LoadTaskDependencyFormComponent } from "./Entities/TaskDependency/taskdependency.form.component";
import { TaskTypeFormComponent, LoadTaskTypeFormComponent } from "./Entities/TaskType/tasktype.form.component";
import { TaskFormComponent, LoadTaskFormComponent } from "./Entities/Task/task.form.component";
import { TestRubricFormComponent, LoadTestRubricFormComponent } from "./Entities/TestRubric/testrubric.form.component";
import { TestRunFeedbackFormComponent, LoadTestRunFeedbackFormComponent } from "./Entities/TestRunFeedback/testrunfeedback.form.component";
import { TestRunFormComponent, LoadTestRunFormComponent } from "./Entities/TestRun/testrun.form.component";
import { TestSuiteRunFormComponent, LoadTestSuiteRunFormComponent } from "./Entities/TestSuiteRun/testsuiterun.form.component";
import { TestSuiteTestFormComponent, LoadTestSuiteTestFormComponent } from "./Entities/TestSuiteTest/testsuitetest.form.component";
import { TestSuiteFormComponent, LoadTestSuiteFormComponent } from "./Entities/TestSuite/testsuite.form.component";
import { TestTypeFormComponent, LoadTestTypeFormComponent } from "./Entities/TestType/testtype.form.component";
import { TestFormComponent, LoadTestFormComponent } from "./Entities/Test/test.form.component";
import { UserSettingFormComponent, LoadUserSettingFormComponent } from "./Entities/UserSetting/usersetting.form.component";
import { OutputDeliveryTypeFormComponent, LoadOutputDeliveryTypeFormComponent } from "./Entities/OutputDeliveryType/outputdeliverytype.form.component";
import { OutputFormatTypeFormComponent, LoadOutputFormatTypeFormComponent } from "./Entities/OutputFormatType/outputformattype.form.component";
import { OutputTriggerTypeFormComponent, LoadOutputTriggerTypeFormComponent } from "./Entities/OutputTriggerType/outputtriggertype.form.component";
import { QueryFormComponent, LoadQueryFormComponent } from "./Entities/Query/query.form.component";
import { QueryCategoryFormComponent, LoadQueryCategoryFormComponent } from "./Entities/QueryCategory/querycategory.form.component";
import { QueryEntityFormComponent, LoadQueryEntityFormComponent } from "./Entities/QueryEntity/queryentity.form.component";
import { QueryFieldFormComponent, LoadQueryFieldFormComponent } from "./Entities/QueryField/queryfield.form.component";
import { QueryPermissionFormComponent, LoadQueryPermissionFormComponent } from "./Entities/QueryPermission/querypermission.form.component";
import { QueueTaskFormComponent, LoadQueueTaskFormComponent } from "./Entities/QueueTask/queuetask.form.component";
import { QueueTypeFormComponent, LoadQueueTypeFormComponent } from "./Entities/QueueType/queuetype.form.component";
import { QueueFormComponent, LoadQueueFormComponent } from "./Entities/Queue/queue.form.component";
import { RecommendationItemFormComponent, LoadRecommendationItemFormComponent } from "./Entities/RecommendationItem/recommendationitem.form.component";
import { RecommendationProviderFormComponent, LoadRecommendationProviderFormComponent } from "./Entities/RecommendationProvider/recommendationprovider.form.component";
import { RecommendationRunFormComponent, LoadRecommendationRunFormComponent } from "./Entities/RecommendationRun/recommendationrun.form.component";
import { RecommendationFormComponent, LoadRecommendationFormComponent } from "./Entities/Recommendation/recommendation.form.component";
import { RecordChangeReplayRunFormComponent, LoadRecordChangeReplayRunFormComponent } from "./Entities/RecordChangeReplayRun/recordchangereplayrun.form.component";
import { RecordChangeFormComponent, LoadRecordChangeFormComponent } from "./Entities/RecordChange/recordchange.form.component";
import { RecordMergeDeletionLogFormComponent, LoadRecordMergeDeletionLogFormComponent } from "./Entities/RecordMergeDeletionLog/recordmergedeletionlog.form.component";
import { RecordMergeLogFormComponent, LoadRecordMergeLogFormComponent } from "./Entities/RecordMergeLog/recordmergelog.form.component";
import { ReportCategoryFormComponent, LoadReportCategoryFormComponent } from "./Entities/ReportCategory/reportcategory.form.component";
import { ReportSnapshotFormComponent, LoadReportSnapshotFormComponent } from "./Entities/ReportSnapshot/reportsnapshot.form.component";
import { ReportFormComponent, LoadReportFormComponent } from "./Entities/Report/report.form.component";
import { ResourceLinkFormComponent, LoadResourceLinkFormComponent } from "./Entities/ResourceLink/resourcelink.form.component";
import { ResourcePermissionFormComponent, LoadResourcePermissionFormComponent } from "./Entities/ResourcePermission/resourcepermission.form.component";
import { ResourceTypeFormComponent, LoadResourceTypeFormComponent } from "./Entities/ResourceType/resourcetype.form.component";
import { RoleFormComponent, LoadRoleFormComponent } from "./Entities/Role/role.form.component";
import { RowLevelSecurityFilterFormComponent, LoadRowLevelSecurityFilterFormComponent } from "./Entities/RowLevelSecurityFilter/rowlevelsecurityfilter.form.component";
import { ScheduledActionParamFormComponent, LoadScheduledActionParamFormComponent } from "./Entities/ScheduledActionParam/scheduledactionparam.form.component";
import { ScheduledActionFormComponent, LoadScheduledActionFormComponent } from "./Entities/ScheduledAction/scheduledaction.form.component";
import { SchemaInfoFormComponent, LoadSchemaInfoFormComponent } from "./Entities/SchemaInfo/schemainfo.form.component";
import { SkillFormComponent, LoadSkillFormComponent } from "./Entities/Skill/skill.form.component";
import { TaggedItemFormComponent, LoadTaggedItemFormComponent } from "./Entities/TaggedItem/taggeditem.form.component";
import { TagFormComponent, LoadTagFormComponent } from "./Entities/Tag/tag.form.component";
import { TemplateCategoryFormComponent, LoadTemplateCategoryFormComponent } from "./Entities/TemplateCategory/templatecategory.form.component";
import { TemplateContentTypeFormComponent, LoadTemplateContentTypeFormComponent } from "./Entities/TemplateContentType/templatecontenttype.form.component";
import { TemplateContentFormComponent, LoadTemplateContentFormComponent } from "./Entities/TemplateContent/templatecontent.form.component";
import { TemplateParamFormComponent, LoadTemplateParamFormComponent } from "./Entities/TemplateParam/templateparam.form.component";
import { TemplateFormComponent, LoadTemplateFormComponent } from "./Entities/Template/template.form.component";
import { UserApplicationEntityFormComponent, LoadUserApplicationEntityFormComponent } from "./Entities/UserApplicationEntity/userapplicationentity.form.component";
import { UserApplicationFormComponent, LoadUserApplicationFormComponent } from "./Entities/UserApplication/userapplication.form.component";
import { UserFavoriteFormComponent, LoadUserFavoriteFormComponent } from "./Entities/UserFavorite/userfavorite.form.component";
import { UserNotificationFormComponent, LoadUserNotificationFormComponent } from "./Entities/UserNotification/usernotification.form.component";
import { UserRecordLogFormComponent, LoadUserRecordLogFormComponent } from "./Entities/UserRecordLog/userrecordlog.form.component";
import { UserRoleFormComponent, LoadUserRoleFormComponent } from "./Entities/UserRole/userrole.form.component";
import { UserViewCategoryFormComponent, LoadUserViewCategoryFormComponent } from "./Entities/UserViewCategory/userviewcategory.form.component";
import { UserViewRunDetailFormComponent, LoadUserViewRunDetailFormComponent } from "./Entities/UserViewRunDetail/userviewrundetail.form.component";
import { UserViewRunFormComponent, LoadUserViewRunFormComponent } from "./Entities/UserViewRun/userviewrun.form.component";
import { UserViewFormComponent, LoadUserViewFormComponent } from "./Entities/UserView/userview.form.component";
import { UserFormComponent, LoadUserFormComponent } from "./Entities/User/user.form.component";
import { VectorDatabaseFormComponent, LoadVectorDatabaseFormComponent } from "./Entities/VectorDatabase/vectordatabase.form.component";
import { VectorIndexFormComponent, LoadVectorIndexFormComponent } from "./Entities/VectorIndex/vectorindex.form.component";
import { VersionInstallationFormComponent, LoadVersionInstallationFormComponent } from "./Entities/VersionInstallation/versioninstallation.form.component";
import { WorkflowEngineFormComponent, LoadWorkflowEngineFormComponent } from "./Entities/WorkflowEngine/workflowengine.form.component";
import { WorkflowRunFormComponent, LoadWorkflowRunFormComponent } from "./Entities/WorkflowRun/workflowrun.form.component";
import { WorkflowFormComponent, LoadWorkflowFormComponent } from "./Entities/Workflow/workflow.form.component";
import { WorkspaceItemFormComponent, LoadWorkspaceItemFormComponent } from "./Entities/WorkspaceItem/workspaceitem.form.component";
import { WorkspaceFormComponent, LoadWorkspaceFormComponent } from "./Entities/Workspace/workspace.form.component";
import { JoinGridModule } from "@memberjunction/ng-join-grid"   

@NgModule({
declarations: [
    ActionAuthorizationFormComponent,
    ActionCategoryFormComponent,
    ActionContextTypeFormComponent,
    ActionContextFormComponent,
    ActionExecutionLogFormComponent,
    ActionFilterFormComponent,
    ActionLibraryFormComponent,
    ActionParamFormComponent,
    ActionResultCodeFormComponent,
    ActionFormComponent,
    AIActionFormComponent,
    AIAgentActionFormComponent,
    AIAgentLearningCycleFormComponent,
    AIAgentModelFormComponent,
    AIAgentNoteTypeFormComponent,
    AIAgentNoteFormComponent,
    AIAgentRequestFormComponent,
    AIAgentFormComponent,
    AIModelActionFormComponent,
    AIModelTypeFormComponent],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
    InputsModule,
    ButtonsModule,
    DateInputsModule,
    EntityViewerModule,
    LinkDirectivesModule,
    BaseFormsModule,
    FormToolbarModule,
    MJTabStripModule,
    ContainerDirectivesModule,
    DropDownListModule,
    ComboBoxModule
],
exports: [
]
})
export class GeneratedForms_SubModule_0 { }
    


@NgModule({
declarations: [
    AIModelFormComponent,
    AIPromptCategoryFormComponent,
    AIPromptTypeFormComponent,
    AIPromptFormComponent,
    AIResultCacheFormComponent,
    ApplicationEntityFormComponent,
    ApplicationSettingFormComponent,
    ApplicationFormComponent,
    AuditLogTypeFormComponent,
    AuditLogFormComponent,
    AuthorizationRoleFormComponent,
    AuthorizationFormComponent,
    CommunicationBaseMessageTypeFormComponent,
    CommunicationLogFormComponent,
    CommunicationProviderMessageTypeFormComponent,
    CommunicationProviderFormComponent,
    CommunicationRunFormComponent,
    CompanyFormComponent,
    CompanyIntegrationRecordMapFormComponent,
    CompanyIntegrationRunAPILogFormComponent],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
    InputsModule,
    ButtonsModule,
    DateInputsModule,
    EntityViewerModule,
    LinkDirectivesModule,
    BaseFormsModule,
    FormToolbarModule,
    MJTabStripModule,
    ContainerDirectivesModule,
    DropDownListModule,
    ComboBoxModule,
    JoinGridModule
],
exports: [
]
})
export class GeneratedForms_SubModule_1 { }
    


@NgModule({
declarations: [
    CompanyIntegrationRunDetailFormComponent,
    CompanyIntegrationRunFormComponent,
    CompanyIntegrationFormComponent,
    ContentFileTypeFormComponent,
    ContentItemAttributeFormComponent,
    ContentItemTagFormComponent,
    ContentItemFormComponent,
    ContentProcessRunFormComponent,
    ContentSourceParamFormComponent,
    ContentSourceTypeParamFormComponent,
    ContentSourceTypeFormComponent,
    ContentSourceFormComponent,
    ContentTypeAttributeFormComponent,
    ContentTypeFormComponent,
    ConversationDetailFormComponent,
    ConversationFormComponent,
    DashboardCategoryFormComponent,
    DashboardFormComponent,
    DataContextItemFormComponent,
    DataContextFormComponent],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
    InputsModule,
    ButtonsModule,
    DateInputsModule,
    EntityViewerModule,
    LinkDirectivesModule,
    BaseFormsModule,
    FormToolbarModule,
    MJTabStripModule,
    ContainerDirectivesModule,
    DropDownListModule,
    ComboBoxModule
],
exports: [
]
})
export class GeneratedForms_SubModule_2 { }
    


@NgModule({
declarations: [
    DatasetItemFormComponent,
    DatasetFormComponent,
    DuplicateRunDetailMatchFormComponent,
    DuplicateRunDetailFormComponent,
    DuplicateRunFormComponent,
    EmployeeCompanyIntegrationFormComponent,
    EmployeeRoleFormComponent,
    EmployeeSkillFormComponent,
    EmployeeFormComponent,
    EntityFormComponent,
    EntityActionFilterFormComponent,
    EntityActionInvocationTypeFormComponent,
    EntityActionInvocationFormComponent,
    EntityActionParamFormComponent,
    EntityActionFormComponent,
    EntityAIActionFormComponent,
    EntityCommunicationFieldFormComponent,
    EntityCommunicationMessageTypeFormComponent,
    EntityDocumentRunFormComponent,
    EntityDocumentSettingFormComponent],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
    InputsModule,
    ButtonsModule,
    DateInputsModule,
    EntityViewerModule,
    LinkDirectivesModule,
    BaseFormsModule,
    FormToolbarModule,
    MJTabStripModule,
    ContainerDirectivesModule,
    DropDownListModule,
    ComboBoxModule
],
exports: [
]
})
export class GeneratedForms_SubModule_3 { }
    


@NgModule({
declarations: [
    EntityDocumentTypeFormComponent,
    EntityDocumentFormComponent,
    EntityFieldValueFormComponent,
    EntityFieldFormComponent,
    EntityPermissionFormComponent,
    EntityRecordDocumentFormComponent,
    EntityRelationshipDisplayComponentFormComponent,
    EntityRelationshipFormComponent,
    EntitySettingFormComponent,
    ErrorLogFormComponent,
    ExplorerNavigationItemFormComponent,
    FileCategoryFormComponent,
    FileEntityRecordLinkFormComponent,
    FileStorageProviderFormComponent,
    FileFormComponent,
    flyway_schema_historyFormComponent,
    GeneratedCodeCategoryFormComponent,
    GeneratedCodeFormComponent,
    IntegrationURLFormatFormComponent,
    IntegrationFormComponent],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
    InputsModule,
    ButtonsModule,
    DateInputsModule,
    EntityViewerModule,
    LinkDirectivesModule,
    BaseFormsModule,
    FormToolbarModule,
    MJTabStripModule,
    ContainerDirectivesModule,
    DropDownListModule,
    ComboBoxModule
],
exports: [
]
})
export class GeneratedForms_SubModule_4 { }
    


@NgModule({
declarations: [
    LibraryFormComponent,
    LibraryItemFormComponent,
    ListCategoryFormComponent,
    ListDetailFormComponent,
    ListFormComponent,
    AccessControlRuleFormComponent,
    AIAgentArtifactTypeFormComponent,
    AIAgentConfigurationFormComponent,
    AIAgentDataSourceFormComponent,
    AIAgentExampleFormComponent,
    AIAgentModalityFormComponent,
    AIAgentPermissionFormComponent,
    AIAgentPromptFormComponent,
    AIAgentRelationshipFormComponent,
    AIAgentRunMediaFormComponent,
    AIAgentRunStepFormComponent,
    AIAgentRunFormComponent,
    AIAgentStepPathFormComponent,
    AIAgentStepFormComponent,
    AIAgentTypeFormComponent],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
    InputsModule,
    ButtonsModule,
    DateInputsModule,
    EntityViewerModule,
    LinkDirectivesModule,
    BaseFormsModule,
    FormToolbarModule,
    MJTabStripModule,
    ContainerDirectivesModule,
    DropDownListModule,
    ComboBoxModule
],
exports: [
]
})
export class GeneratedForms_SubModule_5 { }
    


@NgModule({
declarations: [
    AIArchitectureFormComponent,
    AIConfigurationParamFormComponent,
    AIConfigurationFormComponent,
    AICredentialBindingFormComponent,
    AIModalityFormComponent,
    AIModelArchitectureFormComponent,
    AIModelCostFormComponent,
    AIModelModalityFormComponent,
    AIModelPriceTypeFormComponent,
    AIModelPriceUnitTypeFormComponent,
    AIModelVendorFormComponent,
    AIPromptModelFormComponent,
    AIPromptRunMediaFormComponent,
    AIPromptRunFormComponent,
    AIVendorTypeDefinitionFormComponent,
    AIVendorTypeFormComponent,
    AIVendorFormComponent,
    ArtifactPermissionFormComponent,
    ArtifactTypeFormComponent,
    ArtifactUseFormComponent],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
    InputsModule,
    ButtonsModule,
    DateInputsModule,
    EntityViewerModule,
    LinkDirectivesModule,
    BaseFormsModule,
    FormToolbarModule,
    MJTabStripModule,
    ContainerDirectivesModule,
    DropDownListModule,
    ComboBoxModule
],
exports: [
]
})
export class GeneratedForms_SubModule_6 { }
    


@NgModule({
declarations: [
    ArtifactVersionAttributeFormComponent,
    ArtifactVersionFormComponent,
    ArtifactFormComponent,
    CollectionArtifactFormComponent,
    CollectionPermissionFormComponent,
    CollectionFormComponent,
    ComponentDependencyFormComponent,
    ComponentLibraryFormComponent,
    ComponentLibraryLinkFormComponent,
    ComponentRegistryFormComponent,
    ComponentFormComponent,
    ConversationArtifactPermissionFormComponent,
    ConversationArtifactVersionFormComponent,
    ConversationArtifactFormComponent,
    ConversationDetailArtifactFormComponent,
    ConversationDetailAttachmentFormComponent,
    ConversationDetailRatingFormComponent,
    CredentialCategoryFormComponent,
    CredentialTypeFormComponent,
    CredentialFormComponent],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
    InputsModule,
    ButtonsModule,
    DateInputsModule,
    EntityViewerModule,
    LinkDirectivesModule,
    BaseFormsModule,
    FormToolbarModule,
    MJTabStripModule,
    ContainerDirectivesModule,
    DropDownListModule,
    ComboBoxModule
],
exports: [
]
})
export class GeneratedForms_SubModule_7 { }
    


@NgModule({
declarations: [
    DashboardCategoryLinkFormComponent,
    DashboardCategoryPermissionFormComponent,
    DashboardPartTypeFormComponent,
    DashboardPermissionFormComponent,
    DashboardUserPreferenceFormComponent,
    DashboardUserStateFormComponent,
    EncryptionAlgorithmFormComponent,
    EncryptionKeySourceFormComponent,
    EncryptionKeyFormComponent,
    EnvironmentFormComponent,
    ListInvitationFormComponent,
    ListShareFormComponent,
    ProjectFormComponent,
    PublicLinkFormComponent,
    QueryParameterFormComponent,
    RecordLinkFormComponent,
    ReportUserStateFormComponent,
    ReportVersionFormComponent,
    ScheduledJobRunFormComponent,
    ScheduledJobTypeFormComponent],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
    InputsModule,
    ButtonsModule,
    DateInputsModule,
    EntityViewerModule,
    LinkDirectivesModule,
    BaseFormsModule,
    FormToolbarModule,
    MJTabStripModule,
    ContainerDirectivesModule,
    DropDownListModule,
    ComboBoxModule
],
exports: [
]
})
export class GeneratedForms_SubModule_8 { }
    


@NgModule({
declarations: [
    ScheduledJobFormComponent,
    TaskDependencyFormComponent,
    TaskTypeFormComponent,
    TaskFormComponent,
    TestRubricFormComponent,
    TestRunFeedbackFormComponent,
    TestRunFormComponent,
    TestSuiteRunFormComponent,
    TestSuiteTestFormComponent,
    TestSuiteFormComponent,
    TestTypeFormComponent,
    TestFormComponent,
    UserSettingFormComponent,
    OutputDeliveryTypeFormComponent,
    OutputFormatTypeFormComponent,
    OutputTriggerTypeFormComponent,
    QueryFormComponent,
    QueryCategoryFormComponent,
    QueryEntityFormComponent,
    QueryFieldFormComponent],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
    InputsModule,
    ButtonsModule,
    DateInputsModule,
    EntityViewerModule,
    LinkDirectivesModule,
    BaseFormsModule,
    FormToolbarModule,
    MJTabStripModule,
    ContainerDirectivesModule,
    DropDownListModule,
    ComboBoxModule
],
exports: [
]
})
export class GeneratedForms_SubModule_9 { }
    


@NgModule({
declarations: [
    QueryPermissionFormComponent,
    QueueTaskFormComponent,
    QueueTypeFormComponent,
    QueueFormComponent,
    RecommendationItemFormComponent,
    RecommendationProviderFormComponent,
    RecommendationRunFormComponent,
    RecommendationFormComponent,
    RecordChangeReplayRunFormComponent,
    RecordChangeFormComponent,
    RecordMergeDeletionLogFormComponent,
    RecordMergeLogFormComponent,
    ReportCategoryFormComponent,
    ReportSnapshotFormComponent,
    ReportFormComponent,
    ResourceLinkFormComponent,
    ResourcePermissionFormComponent,
    ResourceTypeFormComponent,
    RoleFormComponent,
    RowLevelSecurityFilterFormComponent],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
    InputsModule,
    ButtonsModule,
    DateInputsModule,
    EntityViewerModule,
    LinkDirectivesModule,
    BaseFormsModule,
    FormToolbarModule,
    MJTabStripModule,
    ContainerDirectivesModule,
    DropDownListModule,
    ComboBoxModule
],
exports: [
]
})
export class GeneratedForms_SubModule_10 { }
    


@NgModule({
declarations: [
    ScheduledActionParamFormComponent,
    ScheduledActionFormComponent,
    SchemaInfoFormComponent,
    SkillFormComponent,
    TaggedItemFormComponent,
    TagFormComponent,
    TemplateCategoryFormComponent,
    TemplateContentTypeFormComponent,
    TemplateContentFormComponent,
    TemplateParamFormComponent,
    TemplateFormComponent,
    UserApplicationEntityFormComponent,
    UserApplicationFormComponent,
    UserFavoriteFormComponent,
    UserNotificationFormComponent,
    UserRecordLogFormComponent,
    UserRoleFormComponent,
    UserViewCategoryFormComponent,
    UserViewRunDetailFormComponent,
    UserViewRunFormComponent],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
    InputsModule,
    ButtonsModule,
    DateInputsModule,
    EntityViewerModule,
    LinkDirectivesModule,
    BaseFormsModule,
    FormToolbarModule,
    MJTabStripModule,
    ContainerDirectivesModule,
    DropDownListModule,
    ComboBoxModule
],
exports: [
]
})
export class GeneratedForms_SubModule_11 { }
    


@NgModule({
declarations: [
    UserViewFormComponent,
    UserFormComponent,
    VectorDatabaseFormComponent,
    VectorIndexFormComponent,
    VersionInstallationFormComponent,
    WorkflowEngineFormComponent,
    WorkflowRunFormComponent,
    WorkflowFormComponent,
    WorkspaceItemFormComponent,
    WorkspaceFormComponent],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
    InputsModule,
    ButtonsModule,
    DateInputsModule,
    EntityViewerModule,
    LinkDirectivesModule,
    BaseFormsModule,
    FormToolbarModule,
    MJTabStripModule,
    ContainerDirectivesModule,
    DropDownListModule,
    ComboBoxModule
],
exports: [
]
})
export class GeneratedForms_SubModule_12 { }
    


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
    GeneratedForms_SubModule_12
]
})
export class CoreGeneratedFormsModule { }
    
export function LoadCoreGeneratedForms() {
    // This function doesn't do much, but it calls each generated form's loader function
    // which in turn calls the sections for that generated form. Ultimately, those bits of
    // code do NOTHING - the point is to prevent the code from being eliminated during tree shaking
    // since it is dynamically instantiated on demand, and the Angular compiler has no way to know that,
    // in production builds tree shaking will eliminate the code unless we do this
    LoadActionAuthorizationFormComponent();
    LoadActionCategoryFormComponent();
    LoadActionContextTypeFormComponent();
    LoadActionContextFormComponent();
    LoadActionExecutionLogFormComponent();
    LoadActionFilterFormComponent();
    LoadActionLibraryFormComponent();
    LoadActionParamFormComponent();
    LoadActionResultCodeFormComponent();
    LoadActionFormComponent();
    LoadAIActionFormComponent();
    LoadAIAgentActionFormComponent();
    LoadAIAgentLearningCycleFormComponent();
    LoadAIAgentModelFormComponent();
    LoadAIAgentNoteTypeFormComponent();
    LoadAIAgentNoteFormComponent();
    LoadAIAgentRequestFormComponent();
    LoadAIAgentFormComponent();
    LoadAIModelActionFormComponent();
    LoadAIModelTypeFormComponent();
    LoadAIModelFormComponent();
    LoadAIPromptCategoryFormComponent();
    LoadAIPromptTypeFormComponent();
    LoadAIPromptFormComponent();
    LoadAIResultCacheFormComponent();
    LoadApplicationEntityFormComponent();
    LoadApplicationSettingFormComponent();
    LoadApplicationFormComponent();
    LoadAuditLogTypeFormComponent();
    LoadAuditLogFormComponent();
    LoadAuthorizationRoleFormComponent();
    LoadAuthorizationFormComponent();
    LoadCommunicationBaseMessageTypeFormComponent();
    LoadCommunicationLogFormComponent();
    LoadCommunicationProviderMessageTypeFormComponent();
    LoadCommunicationProviderFormComponent();
    LoadCommunicationRunFormComponent();
    LoadCompanyFormComponent();
    LoadCompanyIntegrationRecordMapFormComponent();
    LoadCompanyIntegrationRunAPILogFormComponent();
    LoadCompanyIntegrationRunDetailFormComponent();
    LoadCompanyIntegrationRunFormComponent();
    LoadCompanyIntegrationFormComponent();
    LoadContentFileTypeFormComponent();
    LoadContentItemAttributeFormComponent();
    LoadContentItemTagFormComponent();
    LoadContentItemFormComponent();
    LoadContentProcessRunFormComponent();
    LoadContentSourceParamFormComponent();
    LoadContentSourceTypeParamFormComponent();
    LoadContentSourceTypeFormComponent();
    LoadContentSourceFormComponent();
    LoadContentTypeAttributeFormComponent();
    LoadContentTypeFormComponent();
    LoadConversationDetailFormComponent();
    LoadConversationFormComponent();
    LoadDashboardCategoryFormComponent();
    LoadDashboardFormComponent();
    LoadDataContextItemFormComponent();
    LoadDataContextFormComponent();
    LoadDatasetItemFormComponent();
    LoadDatasetFormComponent();
    LoadDuplicateRunDetailMatchFormComponent();
    LoadDuplicateRunDetailFormComponent();
    LoadDuplicateRunFormComponent();
    LoadEmployeeCompanyIntegrationFormComponent();
    LoadEmployeeRoleFormComponent();
    LoadEmployeeSkillFormComponent();
    LoadEmployeeFormComponent();
    LoadEntityFormComponent();
    LoadEntityActionFilterFormComponent();
    LoadEntityActionInvocationTypeFormComponent();
    LoadEntityActionInvocationFormComponent();
    LoadEntityActionParamFormComponent();
    LoadEntityActionFormComponent();
    LoadEntityAIActionFormComponent();
    LoadEntityCommunicationFieldFormComponent();
    LoadEntityCommunicationMessageTypeFormComponent();
    LoadEntityDocumentRunFormComponent();
    LoadEntityDocumentSettingFormComponent();
    LoadEntityDocumentTypeFormComponent();
    LoadEntityDocumentFormComponent();
    LoadEntityFieldValueFormComponent();
    LoadEntityFieldFormComponent();
    LoadEntityPermissionFormComponent();
    LoadEntityRecordDocumentFormComponent();
    LoadEntityRelationshipDisplayComponentFormComponent();
    LoadEntityRelationshipFormComponent();
    LoadEntitySettingFormComponent();
    LoadErrorLogFormComponent();
    LoadExplorerNavigationItemFormComponent();
    LoadFileCategoryFormComponent();
    LoadFileEntityRecordLinkFormComponent();
    LoadFileStorageProviderFormComponent();
    LoadFileFormComponent();
    Loadflyway_schema_historyFormComponent();
    LoadGeneratedCodeCategoryFormComponent();
    LoadGeneratedCodeFormComponent();
    LoadIntegrationURLFormatFormComponent();
    LoadIntegrationFormComponent();
    LoadLibraryFormComponent();
    LoadLibraryItemFormComponent();
    LoadListCategoryFormComponent();
    LoadListDetailFormComponent();
    LoadListFormComponent();
    LoadAccessControlRuleFormComponent();
    LoadAIAgentArtifactTypeFormComponent();
    LoadAIAgentConfigurationFormComponent();
    LoadAIAgentDataSourceFormComponent();
    LoadAIAgentExampleFormComponent();
    LoadAIAgentModalityFormComponent();
    LoadAIAgentPermissionFormComponent();
    LoadAIAgentPromptFormComponent();
    LoadAIAgentRelationshipFormComponent();
    LoadAIAgentRunMediaFormComponent();
    LoadAIAgentRunStepFormComponent();
    LoadAIAgentRunFormComponent();
    LoadAIAgentStepPathFormComponent();
    LoadAIAgentStepFormComponent();
    LoadAIAgentTypeFormComponent();
    LoadAIArchitectureFormComponent();
    LoadAIConfigurationParamFormComponent();
    LoadAIConfigurationFormComponent();
    LoadAICredentialBindingFormComponent();
    LoadAIModalityFormComponent();
    LoadAIModelArchitectureFormComponent();
    LoadAIModelCostFormComponent();
    LoadAIModelModalityFormComponent();
    LoadAIModelPriceTypeFormComponent();
    LoadAIModelPriceUnitTypeFormComponent();
    LoadAIModelVendorFormComponent();
    LoadAIPromptModelFormComponent();
    LoadAIPromptRunMediaFormComponent();
    LoadAIPromptRunFormComponent();
    LoadAIVendorTypeDefinitionFormComponent();
    LoadAIVendorTypeFormComponent();
    LoadAIVendorFormComponent();
    LoadArtifactPermissionFormComponent();
    LoadArtifactTypeFormComponent();
    LoadArtifactUseFormComponent();
    LoadArtifactVersionAttributeFormComponent();
    LoadArtifactVersionFormComponent();
    LoadArtifactFormComponent();
    LoadCollectionArtifactFormComponent();
    LoadCollectionPermissionFormComponent();
    LoadCollectionFormComponent();
    LoadComponentDependencyFormComponent();
    LoadComponentLibraryFormComponent();
    LoadComponentLibraryLinkFormComponent();
    LoadComponentRegistryFormComponent();
    LoadComponentFormComponent();
    LoadConversationArtifactPermissionFormComponent();
    LoadConversationArtifactVersionFormComponent();
    LoadConversationArtifactFormComponent();
    LoadConversationDetailArtifactFormComponent();
    LoadConversationDetailAttachmentFormComponent();
    LoadConversationDetailRatingFormComponent();
    LoadCredentialCategoryFormComponent();
    LoadCredentialTypeFormComponent();
    LoadCredentialFormComponent();
    LoadDashboardCategoryLinkFormComponent();
    LoadDashboardCategoryPermissionFormComponent();
    LoadDashboardPartTypeFormComponent();
    LoadDashboardPermissionFormComponent();
    LoadDashboardUserPreferenceFormComponent();
    LoadDashboardUserStateFormComponent();
    LoadEncryptionAlgorithmFormComponent();
    LoadEncryptionKeySourceFormComponent();
    LoadEncryptionKeyFormComponent();
    LoadEnvironmentFormComponent();
    LoadListInvitationFormComponent();
    LoadListShareFormComponent();
    LoadProjectFormComponent();
    LoadPublicLinkFormComponent();
    LoadQueryParameterFormComponent();
    LoadRecordLinkFormComponent();
    LoadReportUserStateFormComponent();
    LoadReportVersionFormComponent();
    LoadScheduledJobRunFormComponent();
    LoadScheduledJobTypeFormComponent();
    LoadScheduledJobFormComponent();
    LoadTaskDependencyFormComponent();
    LoadTaskTypeFormComponent();
    LoadTaskFormComponent();
    LoadTestRubricFormComponent();
    LoadTestRunFeedbackFormComponent();
    LoadTestRunFormComponent();
    LoadTestSuiteRunFormComponent();
    LoadTestSuiteTestFormComponent();
    LoadTestSuiteFormComponent();
    LoadTestTypeFormComponent();
    LoadTestFormComponent();
    LoadUserSettingFormComponent();
    LoadOutputDeliveryTypeFormComponent();
    LoadOutputFormatTypeFormComponent();
    LoadOutputTriggerTypeFormComponent();
    LoadQueryFormComponent();
    LoadQueryCategoryFormComponent();
    LoadQueryEntityFormComponent();
    LoadQueryFieldFormComponent();
    LoadQueryPermissionFormComponent();
    LoadQueueTaskFormComponent();
    LoadQueueTypeFormComponent();
    LoadQueueFormComponent();
    LoadRecommendationItemFormComponent();
    LoadRecommendationProviderFormComponent();
    LoadRecommendationRunFormComponent();
    LoadRecommendationFormComponent();
    LoadRecordChangeReplayRunFormComponent();
    LoadRecordChangeFormComponent();
    LoadRecordMergeDeletionLogFormComponent();
    LoadRecordMergeLogFormComponent();
    LoadReportCategoryFormComponent();
    LoadReportSnapshotFormComponent();
    LoadReportFormComponent();
    LoadResourceLinkFormComponent();
    LoadResourcePermissionFormComponent();
    LoadResourceTypeFormComponent();
    LoadRoleFormComponent();
    LoadRowLevelSecurityFilterFormComponent();
    LoadScheduledActionParamFormComponent();
    LoadScheduledActionFormComponent();
    LoadSchemaInfoFormComponent();
    LoadSkillFormComponent();
    LoadTaggedItemFormComponent();
    LoadTagFormComponent();
    LoadTemplateCategoryFormComponent();
    LoadTemplateContentTypeFormComponent();
    LoadTemplateContentFormComponent();
    LoadTemplateParamFormComponent();
    LoadTemplateFormComponent();
    LoadUserApplicationEntityFormComponent();
    LoadUserApplicationFormComponent();
    LoadUserFavoriteFormComponent();
    LoadUserNotificationFormComponent();
    LoadUserRecordLogFormComponent();
    LoadUserRoleFormComponent();
    LoadUserViewCategoryFormComponent();
    LoadUserViewRunDetailFormComponent();
    LoadUserViewRunFormComponent();
    LoadUserViewFormComponent();
    LoadUserFormComponent();
    LoadVectorDatabaseFormComponent();
    LoadVectorIndexFormComponent();
    LoadVersionInstallationFormComponent();
    LoadWorkflowEngineFormComponent();
    LoadWorkflowRunFormComponent();
    LoadWorkflowFormComponent();
    LoadWorkspaceItemFormComponent();
    LoadWorkspaceFormComponent();
}
    