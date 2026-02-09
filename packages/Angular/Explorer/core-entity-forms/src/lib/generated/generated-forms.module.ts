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
import { MJTabStripModule } from "@memberjunction/ng-tabstrip";
import { ContainerDirectivesModule } from "@memberjunction/ng-container-directives";
import { LayoutModule } from '@progress/kendo-angular-layout';

// Import Generated Components
import { ActionAuthorizationFormComponent } from "./Entities/ActionAuthorization/actionauthorization.form.component";
import { ActionCategoryFormComponent } from "./Entities/ActionCategory/actioncategory.form.component";
import { ActionContextTypeFormComponent } from "./Entities/ActionContextType/actioncontexttype.form.component";
import { ActionContextFormComponent } from "./Entities/ActionContext/actioncontext.form.component";
import { ActionExecutionLogFormComponent } from "./Entities/ActionExecutionLog/actionexecutionlog.form.component";
import { ActionFilterFormComponent } from "./Entities/ActionFilter/actionfilter.form.component";
import { ActionLibraryFormComponent } from "./Entities/ActionLibrary/actionlibrary.form.component";
import { ActionParamFormComponent } from "./Entities/ActionParam/actionparam.form.component";
import { ActionResultCodeFormComponent } from "./Entities/ActionResultCode/actionresultcode.form.component";
import { ActionFormComponent } from "./Entities/Action/action.form.component";
import { AIActionFormComponent } from "./Entities/AIAction/aiaction.form.component";
import { AIAgentActionFormComponent } from "./Entities/AIAgentAction/aiagentaction.form.component";
import { AIAgentLearningCycleFormComponent } from "./Entities/AIAgentLearningCycle/aiagentlearningcycle.form.component";
import { AIAgentModelFormComponent } from "./Entities/AIAgentModel/aiagentmodel.form.component";
import { AIAgentNoteTypeFormComponent } from "./Entities/AIAgentNoteType/aiagentnotetype.form.component";
import { AIAgentNoteFormComponent } from "./Entities/AIAgentNote/aiagentnote.form.component";
import { AIAgentRequestFormComponent } from "./Entities/AIAgentRequest/aiagentrequest.form.component";
import { AIAgentFormComponent } from "./Entities/AIAgent/aiagent.form.component";
import { AIModelActionFormComponent } from "./Entities/AIModelAction/aimodelaction.form.component";
import { AIModelTypeFormComponent } from "./Entities/AIModelType/aimodeltype.form.component";
import { AIModelFormComponent } from "./Entities/AIModel/aimodel.form.component";
import { AIPromptCategoryFormComponent } from "./Entities/AIPromptCategory/aipromptcategory.form.component";
import { AIPromptTypeFormComponent } from "./Entities/AIPromptType/aiprompttype.form.component";
import { AIPromptFormComponent } from "./Entities/AIPrompt/aiprompt.form.component";
import { AIResultCacheFormComponent } from "./Entities/AIResultCache/airesultcache.form.component";
import { ApplicationEntityFormComponent } from "./Entities/ApplicationEntity/applicationentity.form.component";
import { ApplicationSettingFormComponent } from "./Entities/ApplicationSetting/applicationsetting.form.component";
import { ApplicationFormComponent } from "./Entities/Application/application.form.component";
import { AuditLogTypeFormComponent } from "./Entities/AuditLogType/auditlogtype.form.component";
import { AuditLogFormComponent } from "./Entities/AuditLog/auditlog.form.component";
import { AuthorizationRoleFormComponent } from "./Entities/AuthorizationRole/authorizationrole.form.component";
import { AuthorizationFormComponent } from "./Entities/Authorization/authorization.form.component";
import { CommunicationBaseMessageTypeFormComponent } from "./Entities/CommunicationBaseMessageType/communicationbasemessagetype.form.component";
import { CommunicationLogFormComponent } from "./Entities/CommunicationLog/communicationlog.form.component";
import { CommunicationProviderMessageTypeFormComponent } from "./Entities/CommunicationProviderMessageType/communicationprovidermessagetype.form.component";
import { CommunicationProviderFormComponent } from "./Entities/CommunicationProvider/communicationprovider.form.component";
import { CommunicationRunFormComponent } from "./Entities/CommunicationRun/communicationrun.form.component";
import { CompanyFormComponent } from "./Entities/Company/company.form.component";
import { CompanyIntegrationRecordMapFormComponent } from "./Entities/CompanyIntegrationRecordMap/companyintegrationrecordmap.form.component";
import { CompanyIntegrationRunAPILogFormComponent } from "./Entities/CompanyIntegrationRunAPILog/companyintegrationrunapilog.form.component";
import { CompanyIntegrationRunDetailFormComponent } from "./Entities/CompanyIntegrationRunDetail/companyintegrationrundetail.form.component";
import { CompanyIntegrationRunFormComponent } from "./Entities/CompanyIntegrationRun/companyintegrationrun.form.component";
import { CompanyIntegrationFormComponent } from "./Entities/CompanyIntegration/companyintegration.form.component";
import { ContentFileTypeFormComponent } from "./Entities/ContentFileType/contentfiletype.form.component";
import { ContentItemAttributeFormComponent } from "./Entities/ContentItemAttribute/contentitemattribute.form.component";
import { ContentItemTagFormComponent } from "./Entities/ContentItemTag/contentitemtag.form.component";
import { ContentItemFormComponent } from "./Entities/ContentItem/contentitem.form.component";
import { ContentProcessRunFormComponent } from "./Entities/ContentProcessRun/contentprocessrun.form.component";
import { ContentSourceParamFormComponent } from "./Entities/ContentSourceParam/contentsourceparam.form.component";
import { ContentSourceTypeParamFormComponent } from "./Entities/ContentSourceTypeParam/contentsourcetypeparam.form.component";
import { ContentSourceTypeFormComponent } from "./Entities/ContentSourceType/contentsourcetype.form.component";
import { ContentSourceFormComponent } from "./Entities/ContentSource/contentsource.form.component";
import { ContentTypeAttributeFormComponent } from "./Entities/ContentTypeAttribute/contenttypeattribute.form.component";
import { ContentTypeFormComponent } from "./Entities/ContentType/contenttype.form.component";
import { ConversationDetailFormComponent } from "./Entities/ConversationDetail/conversationdetail.form.component";
import { ConversationFormComponent } from "./Entities/Conversation/conversation.form.component";
import { DashboardCategoryFormComponent } from "./Entities/DashboardCategory/dashboardcategory.form.component";
import { DashboardFormComponent } from "./Entities/Dashboard/dashboard.form.component";
import { DataContextItemFormComponent } from "./Entities/DataContextItem/datacontextitem.form.component";
import { DataContextFormComponent } from "./Entities/DataContext/datacontext.form.component";
import { DatasetItemFormComponent } from "./Entities/DatasetItem/datasetitem.form.component";
import { DatasetFormComponent } from "./Entities/Dataset/dataset.form.component";
import { DuplicateRunDetailMatchFormComponent } from "./Entities/DuplicateRunDetailMatch/duplicaterundetailmatch.form.component";
import { DuplicateRunDetailFormComponent } from "./Entities/DuplicateRunDetail/duplicaterundetail.form.component";
import { DuplicateRunFormComponent } from "./Entities/DuplicateRun/duplicaterun.form.component";
import { EmployeeCompanyIntegrationFormComponent } from "./Entities/EmployeeCompanyIntegration/employeecompanyintegration.form.component";
import { EmployeeRoleFormComponent } from "./Entities/EmployeeRole/employeerole.form.component";
import { EmployeeSkillFormComponent } from "./Entities/EmployeeSkill/employeeskill.form.component";
import { EmployeeFormComponent } from "./Entities/Employee/employee.form.component";
import { EntityFormComponent } from "./Entities/Entity/entity.form.component";
import { EntityActionFilterFormComponent } from "./Entities/EntityActionFilter/entityactionfilter.form.component";
import { EntityActionInvocationTypeFormComponent } from "./Entities/EntityActionInvocationType/entityactioninvocationtype.form.component";
import { EntityActionInvocationFormComponent } from "./Entities/EntityActionInvocation/entityactioninvocation.form.component";
import { EntityActionParamFormComponent } from "./Entities/EntityActionParam/entityactionparam.form.component";
import { EntityActionFormComponent } from "./Entities/EntityAction/entityaction.form.component";
import { EntityAIActionFormComponent } from "./Entities/EntityAIAction/entityaiaction.form.component";
import { EntityCommunicationFieldFormComponent } from "./Entities/EntityCommunicationField/entitycommunicationfield.form.component";
import { EntityCommunicationMessageTypeFormComponent } from "./Entities/EntityCommunicationMessageType/entitycommunicationmessagetype.form.component";
import { EntityDocumentRunFormComponent } from "./Entities/EntityDocumentRun/entitydocumentrun.form.component";
import { EntityDocumentSettingFormComponent } from "./Entities/EntityDocumentSetting/entitydocumentsetting.form.component";
import { EntityDocumentTypeFormComponent } from "./Entities/EntityDocumentType/entitydocumenttype.form.component";
import { EntityDocumentFormComponent } from "./Entities/EntityDocument/entitydocument.form.component";
import { EntityFieldValueFormComponent } from "./Entities/EntityFieldValue/entityfieldvalue.form.component";
import { EntityFieldFormComponent } from "./Entities/EntityField/entityfield.form.component";
import { EntityPermissionFormComponent } from "./Entities/EntityPermission/entitypermission.form.component";
import { EntityRecordDocumentFormComponent } from "./Entities/EntityRecordDocument/entityrecorddocument.form.component";
import { EntityRelationshipDisplayComponentFormComponent } from "./Entities/EntityRelationshipDisplayComponent/entityrelationshipdisplaycomponent.form.component";
import { EntityRelationshipFormComponent } from "./Entities/EntityRelationship/entityrelationship.form.component";
import { EntitySettingFormComponent } from "./Entities/EntitySetting/entitysetting.form.component";
import { ErrorLogFormComponent } from "./Entities/ErrorLog/errorlog.form.component";
import { ExplorerNavigationItemFormComponent } from "./Entities/ExplorerNavigationItem/explorernavigationitem.form.component";
import { FileCategoryFormComponent } from "./Entities/FileCategory/filecategory.form.component";
import { FileEntityRecordLinkFormComponent } from "./Entities/FileEntityRecordLink/fileentityrecordlink.form.component";
import { FileStorageProviderFormComponent } from "./Entities/FileStorageProvider/filestorageprovider.form.component";
import { FileFormComponent } from "./Entities/File/file.form.component";
import { GeneratedCodeCategoryFormComponent } from "./Entities/GeneratedCodeCategory/generatedcodecategory.form.component";
import { GeneratedCodeFormComponent } from "./Entities/GeneratedCode/generatedcode.form.component";
import { IntegrationURLFormatFormComponent } from "./Entities/IntegrationURLFormat/integrationurlformat.form.component";
import { IntegrationFormComponent } from "./Entities/Integration/integration.form.component";
import { LibraryFormComponent } from "./Entities/Library/library.form.component";
import { LibraryItemFormComponent } from "./Entities/LibraryItem/libraryitem.form.component";
import { ListCategoryFormComponent } from "./Entities/ListCategory/listcategory.form.component";
import { ListDetailFormComponent } from "./Entities/ListDetail/listdetail.form.component";
import { ListFormComponent } from "./Entities/List/list.form.component";
import { AccessControlRuleFormComponent } from "./Entities/AccessControlRule/accesscontrolrule.form.component";
import { AIAgentArtifactTypeFormComponent } from "./Entities/AIAgentArtifactType/aiagentartifacttype.form.component";
import { AIAgentConfigurationFormComponent } from "./Entities/AIAgentConfiguration/aiagentconfiguration.form.component";
import { AIAgentDataSourceFormComponent } from "./Entities/AIAgentDataSource/aiagentdatasource.form.component";
import { AIAgentExampleFormComponent } from "./Entities/AIAgentExample/aiagentexample.form.component";
import { AIAgentModalityFormComponent } from "./Entities/AIAgentModality/aiagentmodality.form.component";
import { AIAgentPermissionFormComponent } from "./Entities/AIAgentPermission/aiagentpermission.form.component";
import { AIAgentPromptFormComponent } from "./Entities/AIAgentPrompt/aiagentprompt.form.component";
import { AIAgentRelationshipFormComponent } from "./Entities/AIAgentRelationship/aiagentrelationship.form.component";
import { AIAgentRunMediaFormComponent } from "./Entities/AIAgentRunMedia/aiagentrunmedia.form.component";
import { AIAgentRunStepFormComponent } from "./Entities/AIAgentRunStep/aiagentrunstep.form.component";
import { AIAgentRunFormComponent } from "./Entities/AIAgentRun/aiagentrun.form.component";
import { AIAgentStepPathFormComponent } from "./Entities/AIAgentStepPath/aiagentsteppath.form.component";
import { AIAgentStepFormComponent } from "./Entities/AIAgentStep/aiagentstep.form.component";
import { AIAgentTypeFormComponent } from "./Entities/AIAgentType/aiagenttype.form.component";
import { AIArchitectureFormComponent } from "./Entities/AIArchitecture/aiarchitecture.form.component";
import { AIConfigurationParamFormComponent } from "./Entities/AIConfigurationParam/aiconfigurationparam.form.component";
import { AIConfigurationFormComponent } from "./Entities/AIConfiguration/aiconfiguration.form.component";
import { AICredentialBindingFormComponent } from "./Entities/AICredentialBinding/aicredentialbinding.form.component";
import { AIModalityFormComponent } from "./Entities/AIModality/aimodality.form.component";
import { AIModelArchitectureFormComponent } from "./Entities/AIModelArchitecture/aimodelarchitecture.form.component";
import { AIModelCostFormComponent } from "./Entities/AIModelCost/aimodelcost.form.component";
import { AIModelModalityFormComponent } from "./Entities/AIModelModality/aimodelmodality.form.component";
import { AIModelPriceTypeFormComponent } from "./Entities/AIModelPriceType/aimodelpricetype.form.component";
import { AIModelPriceUnitTypeFormComponent } from "./Entities/AIModelPriceUnitType/aimodelpriceunittype.form.component";
import { AIModelVendorFormComponent } from "./Entities/AIModelVendor/aimodelvendor.form.component";
import { AIPromptModelFormComponent } from "./Entities/AIPromptModel/aipromptmodel.form.component";
import { AIPromptRunMediaFormComponent } from "./Entities/AIPromptRunMedia/aipromptrunmedia.form.component";
import { AIPromptRunFormComponent } from "./Entities/AIPromptRun/aipromptrun.form.component";
import { AIVendorTypeDefinitionFormComponent } from "./Entities/AIVendorTypeDefinition/aivendortypedefinition.form.component";
import { AIVendorTypeFormComponent } from "./Entities/AIVendorType/aivendortype.form.component";
import { AIVendorFormComponent } from "./Entities/AIVendor/aivendor.form.component";
import { APIApplicationScopeFormComponent } from "./Entities/APIApplicationScope/apiapplicationscope.form.component";
import { APIApplicationFormComponent } from "./Entities/APIApplication/apiapplication.form.component";
import { APIKeyApplicationFormComponent } from "./Entities/APIKeyApplication/apikeyapplication.form.component";
import { APIKeyScopeFormComponent } from "./Entities/APIKeyScope/apikeyscope.form.component";
import { APIKeyUsageLogFormComponent } from "./Entities/APIKeyUsageLog/apikeyusagelog.form.component";
import { APIKeyFormComponent } from "./Entities/APIKey/apikey.form.component";
import { APIScopeFormComponent } from "./Entities/APIScope/apiscope.form.component";
import { ArtifactPermissionFormComponent } from "./Entities/ArtifactPermission/artifactpermission.form.component";
import { ArtifactTypeFormComponent } from "./Entities/ArtifactType/artifacttype.form.component";
import { ArtifactUseFormComponent } from "./Entities/ArtifactUse/artifactuse.form.component";
import { ArtifactVersionAttributeFormComponent } from "./Entities/ArtifactVersionAttribute/artifactversionattribute.form.component";
import { ArtifactVersionFormComponent } from "./Entities/ArtifactVersion/artifactversion.form.component";
import { ArtifactFormComponent } from "./Entities/Artifact/artifact.form.component";
import { CollectionArtifactFormComponent } from "./Entities/CollectionArtifact/collectionartifact.form.component";
import { CollectionPermissionFormComponent } from "./Entities/CollectionPermission/collectionpermission.form.component";
import { CollectionFormComponent } from "./Entities/Collection/collection.form.component";
import { ComponentDependencyFormComponent } from "./Entities/ComponentDependency/componentdependency.form.component";
import { ComponentLibraryFormComponent } from "./Entities/ComponentLibrary/componentlibrary.form.component";
import { ComponentLibraryLinkFormComponent } from "./Entities/ComponentLibraryLink/componentlibrarylink.form.component";
import { ComponentRegistryFormComponent } from "./Entities/ComponentRegistry/componentregistry.form.component";
import { ComponentFormComponent } from "./Entities/Component/component.form.component";
import { ConversationArtifactPermissionFormComponent } from "./Entities/ConversationArtifactPermission/conversationartifactpermission.form.component";
import { ConversationArtifactVersionFormComponent } from "./Entities/ConversationArtifactVersion/conversationartifactversion.form.component";
import { ConversationArtifactFormComponent } from "./Entities/ConversationArtifact/conversationartifact.form.component";
import { ConversationDetailArtifactFormComponent } from "./Entities/ConversationDetailArtifact/conversationdetailartifact.form.component";
import { ConversationDetailAttachmentFormComponent } from "./Entities/ConversationDetailAttachment/conversationdetailattachment.form.component";
import { ConversationDetailRatingFormComponent } from "./Entities/ConversationDetailRating/conversationdetailrating.form.component";
import { CredentialCategoryFormComponent } from "./Entities/CredentialCategory/credentialcategory.form.component";
import { CredentialTypeFormComponent } from "./Entities/CredentialType/credentialtype.form.component";
import { CredentialFormComponent } from "./Entities/Credential/credential.form.component";
import { DashboardCategoryLinkFormComponent } from "./Entities/DashboardCategoryLink/dashboardcategorylink.form.component";
import { DashboardCategoryPermissionFormComponent } from "./Entities/DashboardCategoryPermission/dashboardcategorypermission.form.component";
import { DashboardPartTypeFormComponent } from "./Entities/DashboardPartType/dashboardparttype.form.component";
import { DashboardPermissionFormComponent } from "./Entities/DashboardPermission/dashboardpermission.form.component";
import { DashboardUserPreferenceFormComponent } from "./Entities/DashboardUserPreference/dashboarduserpreference.form.component";
import { DashboardUserStateFormComponent } from "./Entities/DashboardUserState/dashboarduserstate.form.component";
import { EncryptionAlgorithmFormComponent } from "./Entities/EncryptionAlgorithm/encryptionalgorithm.form.component";
import { EncryptionKeySourceFormComponent } from "./Entities/EncryptionKeySource/encryptionkeysource.form.component";
import { EncryptionKeyFormComponent } from "./Entities/EncryptionKey/encryptionkey.form.component";
import { EnvironmentFormComponent } from "./Entities/Environment/environment.form.component";
import { FileStorageAccountFormComponent } from "./Entities/FileStorageAccount/filestorageaccount.form.component";
import { ListInvitationFormComponent } from "./Entities/ListInvitation/listinvitation.form.component";
import { ListShareFormComponent } from "./Entities/ListShare/listshare.form.component";
import { MCPServerConnectionPermissionFormComponent } from "./Entities/MCPServerConnectionPermission/mcpserverconnectionpermission.form.component";
import { MCPServerConnectionToolFormComponent } from "./Entities/MCPServerConnectionTool/mcpserverconnectiontool.form.component";
import { MCPServerConnectionFormComponent } from "./Entities/MCPServerConnection/mcpserverconnection.form.component";
import { MCPServerToolFormComponent } from "./Entities/MCPServerTool/mcpservertool.form.component";
import { MCPServerFormComponent } from "./Entities/MCPServer/mcpserver.form.component";
import { MCPToolExecutionLogFormComponent } from "./Entities/MCPToolExecutionLog/mcptoolexecutionlog.form.component";
import { OAuthAuthServerMetadataCacheFormComponent } from "./Entities/OAuthAuthServerMetadataCache/oauthauthservermetadatacache.form.component";
import { OAuthAuthorizationStateFormComponent } from "./Entities/OAuthAuthorizationState/oauthauthorizationstate.form.component";
import { OAuthClientRegistrationFormComponent } from "./Entities/OAuthClientRegistration/oauthclientregistration.form.component";
import { OAuthTokenFormComponent } from "./Entities/OAuthToken/oauthtoken.form.component";
import { ProjectFormComponent } from "./Entities/Project/project.form.component";
import { PublicLinkFormComponent } from "./Entities/PublicLink/publiclink.form.component";
import { QueryParameterFormComponent } from "./Entities/QueryParameter/queryparameter.form.component";
import { RecordLinkFormComponent } from "./Entities/RecordLink/recordlink.form.component";
import { ReportUserStateFormComponent } from "./Entities/ReportUserState/reportuserstate.form.component";
import { ReportVersionFormComponent } from "./Entities/ReportVersion/reportversion.form.component";
import { ScheduledJobRunFormComponent } from "./Entities/ScheduledJobRun/scheduledjobrun.form.component";
import { ScheduledJobTypeFormComponent } from "./Entities/ScheduledJobType/scheduledjobtype.form.component";
import { ScheduledJobFormComponent } from "./Entities/ScheduledJob/scheduledjob.form.component";
import { TaskDependencyFormComponent } from "./Entities/TaskDependency/taskdependency.form.component";
import { TaskTypeFormComponent } from "./Entities/TaskType/tasktype.form.component";
import { TaskFormComponent } from "./Entities/Task/task.form.component";
import { TestRubricFormComponent } from "./Entities/TestRubric/testrubric.form.component";
import { TestRunFeedbackFormComponent } from "./Entities/TestRunFeedback/testrunfeedback.form.component";
import { TestRunFormComponent } from "./Entities/TestRun/testrun.form.component";
import { TestSuiteRunFormComponent } from "./Entities/TestSuiteRun/testsuiterun.form.component";
import { TestSuiteTestFormComponent } from "./Entities/TestSuiteTest/testsuitetest.form.component";
import { TestSuiteFormComponent } from "./Entities/TestSuite/testsuite.form.component";
import { TestTypeFormComponent } from "./Entities/TestType/testtype.form.component";
import { TestFormComponent } from "./Entities/Test/test.form.component";
import { UserNotificationPreferenceFormComponent } from "./Entities/UserNotificationPreference/usernotificationpreference.form.component";
import { UserNotificationTypeFormComponent } from "./Entities/UserNotificationType/usernotificationtype.form.component";
import { UserSettingFormComponent } from "./Entities/UserSetting/usersetting.form.component";
import { VersionLabelItemFormComponent } from "./Entities/VersionLabelItem/versionlabelitem.form.component";
import { VersionLabelRestoreFormComponent } from "./Entities/VersionLabelRestore/versionlabelrestore.form.component";
import { VersionLabelFormComponent } from "./Entities/VersionLabel/versionlabel.form.component";
import { OutputDeliveryTypeFormComponent } from "./Entities/OutputDeliveryType/outputdeliverytype.form.component";
import { OutputFormatTypeFormComponent } from "./Entities/OutputFormatType/outputformattype.form.component";
import { OutputTriggerTypeFormComponent } from "./Entities/OutputTriggerType/outputtriggertype.form.component";
import { QueryFormComponent } from "./Entities/Query/query.form.component";
import { QueryCategoryFormComponent } from "./Entities/QueryCategory/querycategory.form.component";
import { QueryEntityFormComponent } from "./Entities/QueryEntity/queryentity.form.component";
import { QueryFieldFormComponent } from "./Entities/QueryField/queryfield.form.component";
import { QueryPermissionFormComponent } from "./Entities/QueryPermission/querypermission.form.component";
import { QueueTaskFormComponent } from "./Entities/QueueTask/queuetask.form.component";
import { QueueTypeFormComponent } from "./Entities/QueueType/queuetype.form.component";
import { QueueFormComponent } from "./Entities/Queue/queue.form.component";
import { RecommendationItemFormComponent } from "./Entities/RecommendationItem/recommendationitem.form.component";
import { RecommendationProviderFormComponent } from "./Entities/RecommendationProvider/recommendationprovider.form.component";
import { RecommendationRunFormComponent } from "./Entities/RecommendationRun/recommendationrun.form.component";
import { RecommendationFormComponent } from "./Entities/Recommendation/recommendation.form.component";
import { RecordChangeReplayRunFormComponent } from "./Entities/RecordChangeReplayRun/recordchangereplayrun.form.component";
import { RecordChangeFormComponent } from "./Entities/RecordChange/recordchange.form.component";
import { RecordMergeDeletionLogFormComponent } from "./Entities/RecordMergeDeletionLog/recordmergedeletionlog.form.component";
import { RecordMergeLogFormComponent } from "./Entities/RecordMergeLog/recordmergelog.form.component";
import { ReportCategoryFormComponent } from "./Entities/ReportCategory/reportcategory.form.component";
import { ReportSnapshotFormComponent } from "./Entities/ReportSnapshot/reportsnapshot.form.component";
import { ReportFormComponent } from "./Entities/Report/report.form.component";
import { ResourceLinkFormComponent } from "./Entities/ResourceLink/resourcelink.form.component";
import { ResourcePermissionFormComponent } from "./Entities/ResourcePermission/resourcepermission.form.component";
import { ResourceTypeFormComponent } from "./Entities/ResourceType/resourcetype.form.component";
import { RoleFormComponent } from "./Entities/Role/role.form.component";
import { RowLevelSecurityFilterFormComponent } from "./Entities/RowLevelSecurityFilter/rowlevelsecurityfilter.form.component";
import { ScheduledActionParamFormComponent } from "./Entities/ScheduledActionParam/scheduledactionparam.form.component";
import { ScheduledActionFormComponent } from "./Entities/ScheduledAction/scheduledaction.form.component";
import { SchemaInfoFormComponent } from "./Entities/SchemaInfo/schemainfo.form.component";
import { SkillFormComponent } from "./Entities/Skill/skill.form.component";
import { TaggedItemFormComponent } from "./Entities/TaggedItem/taggeditem.form.component";
import { TagFormComponent } from "./Entities/Tag/tag.form.component";
import { TemplateCategoryFormComponent } from "./Entities/TemplateCategory/templatecategory.form.component";
import { TemplateContentTypeFormComponent } from "./Entities/TemplateContentType/templatecontenttype.form.component";
import { TemplateContentFormComponent } from "./Entities/TemplateContent/templatecontent.form.component";
import { TemplateParamFormComponent } from "./Entities/TemplateParam/templateparam.form.component";
import { TemplateFormComponent } from "./Entities/Template/template.form.component";
import { UserApplicationEntityFormComponent } from "./Entities/UserApplicationEntity/userapplicationentity.form.component";
import { UserApplicationFormComponent } from "./Entities/UserApplication/userapplication.form.component";
import { UserFavoriteFormComponent } from "./Entities/UserFavorite/userfavorite.form.component";
import { UserNotificationFormComponent } from "./Entities/UserNotification/usernotification.form.component";
import { UserRecordLogFormComponent } from "./Entities/UserRecordLog/userrecordlog.form.component";
import { UserRoleFormComponent } from "./Entities/UserRole/userrole.form.component";
import { UserViewCategoryFormComponent } from "./Entities/UserViewCategory/userviewcategory.form.component";
import { UserViewRunDetailFormComponent } from "./Entities/UserViewRunDetail/userviewrundetail.form.component";
import { UserViewRunFormComponent } from "./Entities/UserViewRun/userviewrun.form.component";
import { UserViewFormComponent } from "./Entities/UserView/userview.form.component";
import { UserFormComponent } from "./Entities/User/user.form.component";
import { VectorDatabaseFormComponent } from "./Entities/VectorDatabase/vectordatabase.form.component";
import { VectorIndexFormComponent } from "./Entities/VectorIndex/vectorindex.form.component";
import { VersionInstallationFormComponent } from "./Entities/VersionInstallation/versioninstallation.form.component";
import { WorkflowEngineFormComponent } from "./Entities/WorkflowEngine/workflowengine.form.component";
import { WorkflowRunFormComponent } from "./Entities/WorkflowRun/workflowrun.form.component";
import { WorkflowFormComponent } from "./Entities/Workflow/workflow.form.component";
import { WorkspaceItemFormComponent } from "./Entities/WorkspaceItem/workspaceitem.form.component";
import { WorkspaceFormComponent } from "./Entities/Workspace/workspace.form.component";
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
    BaseFormsModule,
    EntityViewerModule,
    LinkDirectivesModule,
    MJTabStripModule,
    ContainerDirectivesModule
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
    BaseFormsModule,
    EntityViewerModule,
    LinkDirectivesModule,
    MJTabStripModule,
    ContainerDirectivesModule,
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
    BaseFormsModule,
    EntityViewerModule,
    LinkDirectivesModule,
    MJTabStripModule,
    ContainerDirectivesModule
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
    BaseFormsModule,
    EntityViewerModule,
    LinkDirectivesModule,
    MJTabStripModule,
    ContainerDirectivesModule
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
    GeneratedCodeCategoryFormComponent,
    GeneratedCodeFormComponent,
    IntegrationURLFormatFormComponent,
    IntegrationFormComponent,
    LibraryFormComponent],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
    BaseFormsModule,
    EntityViewerModule,
    LinkDirectivesModule,
    MJTabStripModule,
    ContainerDirectivesModule
],
exports: [
]
})
export class GeneratedForms_SubModule_4 { }
    


@NgModule({
declarations: [
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
    AIAgentTypeFormComponent,
    AIArchitectureFormComponent],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
    BaseFormsModule,
    EntityViewerModule,
    LinkDirectivesModule,
    MJTabStripModule,
    ContainerDirectivesModule
],
exports: [
]
})
export class GeneratedForms_SubModule_5 { }
    


@NgModule({
declarations: [
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
    APIApplicationScopeFormComponent,
    APIApplicationFormComponent,
    APIKeyApplicationFormComponent,
    APIKeyScopeFormComponent],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
    BaseFormsModule,
    EntityViewerModule,
    LinkDirectivesModule,
    MJTabStripModule,
    ContainerDirectivesModule
],
exports: [
]
})
export class GeneratedForms_SubModule_6 { }
    


@NgModule({
declarations: [
    APIKeyUsageLogFormComponent,
    APIKeyFormComponent,
    APIScopeFormComponent,
    ArtifactPermissionFormComponent,
    ArtifactTypeFormComponent,
    ArtifactUseFormComponent,
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
    ConversationArtifactFormComponent],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
    BaseFormsModule,
    EntityViewerModule,
    LinkDirectivesModule,
    MJTabStripModule,
    ContainerDirectivesModule
],
exports: [
]
})
export class GeneratedForms_SubModule_7 { }
    


@NgModule({
declarations: [
    ConversationDetailArtifactFormComponent,
    ConversationDetailAttachmentFormComponent,
    ConversationDetailRatingFormComponent,
    CredentialCategoryFormComponent,
    CredentialTypeFormComponent,
    CredentialFormComponent,
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
    FileStorageAccountFormComponent,
    ListInvitationFormComponent,
    ListShareFormComponent,
    MCPServerConnectionPermissionFormComponent],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
    BaseFormsModule,
    EntityViewerModule,
    LinkDirectivesModule,
    MJTabStripModule,
    ContainerDirectivesModule
],
exports: [
]
})
export class GeneratedForms_SubModule_8 { }
    


@NgModule({
declarations: [
    MCPServerConnectionToolFormComponent,
    MCPServerConnectionFormComponent,
    MCPServerToolFormComponent,
    MCPServerFormComponent,
    MCPToolExecutionLogFormComponent,
    OAuthAuthServerMetadataCacheFormComponent,
    OAuthAuthorizationStateFormComponent,
    OAuthClientRegistrationFormComponent,
    OAuthTokenFormComponent,
    ProjectFormComponent,
    PublicLinkFormComponent,
    QueryParameterFormComponent,
    RecordLinkFormComponent,
    ReportUserStateFormComponent,
    ReportVersionFormComponent,
    ScheduledJobRunFormComponent,
    ScheduledJobTypeFormComponent,
    ScheduledJobFormComponent,
    TaskDependencyFormComponent,
    TaskTypeFormComponent],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
    BaseFormsModule,
    EntityViewerModule,
    LinkDirectivesModule,
    MJTabStripModule,
    ContainerDirectivesModule
],
exports: [
]
})
export class GeneratedForms_SubModule_9 { }
    


@NgModule({
declarations: [
    TaskFormComponent,
    TestRubricFormComponent,
    TestRunFeedbackFormComponent,
    TestRunFormComponent,
    TestSuiteRunFormComponent,
    TestSuiteTestFormComponent,
    TestSuiteFormComponent,
    TestTypeFormComponent,
    TestFormComponent,
    UserNotificationPreferenceFormComponent,
    UserNotificationTypeFormComponent,
    UserSettingFormComponent,
    VersionLabelItemFormComponent,
    VersionLabelRestoreFormComponent,
    VersionLabelFormComponent,
    OutputDeliveryTypeFormComponent,
    OutputFormatTypeFormComponent,
    OutputTriggerTypeFormComponent,
    QueryFormComponent,
    QueryCategoryFormComponent],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
    BaseFormsModule,
    EntityViewerModule,
    LinkDirectivesModule,
    MJTabStripModule,
    ContainerDirectivesModule
],
exports: [
]
})
export class GeneratedForms_SubModule_10 { }
    


@NgModule({
declarations: [
    QueryEntityFormComponent,
    QueryFieldFormComponent,
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
    ResourceTypeFormComponent],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
    BaseFormsModule,
    EntityViewerModule,
    LinkDirectivesModule,
    MJTabStripModule,
    ContainerDirectivesModule
],
exports: [
]
})
export class GeneratedForms_SubModule_11 { }
    


@NgModule({
declarations: [
    RoleFormComponent,
    RowLevelSecurityFilterFormComponent,
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
    UserViewCategoryFormComponent],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
    BaseFormsModule,
    EntityViewerModule,
    LinkDirectivesModule,
    MJTabStripModule,
    ContainerDirectivesModule
],
exports: [
]
})
export class GeneratedForms_SubModule_12 { }
    


@NgModule({
declarations: [
    UserViewRunDetailFormComponent,
    UserViewRunFormComponent,
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
    BaseFormsModule,
    EntityViewerModule,
    LinkDirectivesModule,
    MJTabStripModule,
    ContainerDirectivesModule
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
    