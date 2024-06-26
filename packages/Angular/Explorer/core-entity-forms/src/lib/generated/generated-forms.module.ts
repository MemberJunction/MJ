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
import { UserViewGridModule } from '@memberjunction/ng-user-view-grid';
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
import { CompanyFormComponent, LoadCompanyFormComponent } from "./Entities/Company/company.form.component";
import { EmployeeFormComponent, LoadEmployeeFormComponent } from "./Entities/Employee/employee.form.component";
import { UserFavoriteFormComponent, LoadUserFavoriteFormComponent } from "./Entities/UserFavorite/userfavorite.form.component";
import { EmployeeCompanyIntegrationFormComponent, LoadEmployeeCompanyIntegrationFormComponent } from "./Entities/EmployeeCompanyIntegration/employeecompanyintegration.form.component";
import { EmployeeRoleFormComponent, LoadEmployeeRoleFormComponent } from "./Entities/EmployeeRole/employeerole.form.component";
import { EmployeeSkillFormComponent, LoadEmployeeSkillFormComponent } from "./Entities/EmployeeSkill/employeeskill.form.component";
import { RoleFormComponent, LoadRoleFormComponent } from "./Entities/Role/role.form.component";
import { SkillFormComponent, LoadSkillFormComponent } from "./Entities/Skill/skill.form.component";
import { IntegrationURLFormatFormComponent, LoadIntegrationURLFormatFormComponent } from "./Entities/IntegrationURLFormat/integrationurlformat.form.component";
import { IntegrationFormComponent, LoadIntegrationFormComponent } from "./Entities/Integration/integration.form.component";
import { CompanyIntegrationFormComponent, LoadCompanyIntegrationFormComponent } from "./Entities/CompanyIntegration/companyintegration.form.component";
import { EntityFieldFormComponent, LoadEntityFieldFormComponent } from "./Entities/EntityField/entityfield.form.component";
import { EntityFormComponent, LoadEntityFormComponent } from "./Entities/Entity/entity.form.component";
import { UserFormComponent, LoadUserFormComponent } from "./Entities/User/user.form.component";
import { EntityRelationshipFormComponent, LoadEntityRelationshipFormComponent } from "./Entities/EntityRelationship/entityrelationship.form.component";
import { UserRecordLogFormComponent, LoadUserRecordLogFormComponent } from "./Entities/UserRecordLog/userrecordlog.form.component";
import { UserViewFormComponent, LoadUserViewFormComponent } from "./Entities/UserView/userview.form.component";
import { CompanyIntegrationRunFormComponent, LoadCompanyIntegrationRunFormComponent } from "./Entities/CompanyIntegrationRun/companyintegrationrun.form.component";
import { CompanyIntegrationRunDetailFormComponent, LoadCompanyIntegrationRunDetailFormComponent } from "./Entities/CompanyIntegrationRunDetail/companyintegrationrundetail.form.component";
import { ErrorLogFormComponent, LoadErrorLogFormComponent } from "./Entities/ErrorLog/errorlog.form.component";
import { ApplicationFormComponent, LoadApplicationFormComponent } from "./Entities/Application/application.form.component";
import { ApplicationEntityFormComponent, LoadApplicationEntityFormComponent } from "./Entities/ApplicationEntity/applicationentity.form.component";
import { EntityPermissionFormComponent, LoadEntityPermissionFormComponent } from "./Entities/EntityPermission/entitypermission.form.component";
import { UserApplicationEntityFormComponent, LoadUserApplicationEntityFormComponent } from "./Entities/UserApplicationEntity/userapplicationentity.form.component";
import { UserApplicationFormComponent, LoadUserApplicationFormComponent } from "./Entities/UserApplication/userapplication.form.component";
import { CompanyIntegrationRunAPILogFormComponent, LoadCompanyIntegrationRunAPILogFormComponent } from "./Entities/CompanyIntegrationRunAPILog/companyintegrationrunapilog.form.component";
import { ListFormComponent, LoadListFormComponent } from "./Entities/List/list.form.component";
import { ListDetailFormComponent, LoadListDetailFormComponent } from "./Entities/ListDetail/listdetail.form.component";
import { UserViewRunFormComponent, LoadUserViewRunFormComponent } from "./Entities/UserViewRun/userviewrun.form.component";
import { UserViewRunDetailFormComponent, LoadUserViewRunDetailFormComponent } from "./Entities/UserViewRunDetail/userviewrundetail.form.component";
import { WorkflowRunFormComponent, LoadWorkflowRunFormComponent } from "./Entities/WorkflowRun/workflowrun.form.component";
import { WorkflowFormComponent, LoadWorkflowFormComponent } from "./Entities/Workflow/workflow.form.component";
import { WorkflowEngineFormComponent, LoadWorkflowEngineFormComponent } from "./Entities/WorkflowEngine/workflowengine.form.component";
import { RecordChangeFormComponent, LoadRecordChangeFormComponent } from "./Entities/RecordChange/recordchange.form.component";
import { UserRoleFormComponent, LoadUserRoleFormComponent } from "./Entities/UserRole/userrole.form.component";
import { RowLevelSecurityFilterFormComponent, LoadRowLevelSecurityFilterFormComponent } from "./Entities/RowLevelSecurityFilter/rowlevelsecurityfilter.form.component";
import { AuditLogFormComponent, LoadAuditLogFormComponent } from "./Entities/AuditLog/auditlog.form.component";
import { AuthorizationFormComponent, LoadAuthorizationFormComponent } from "./Entities/Authorization/authorization.form.component";
import { AuthorizationRoleFormComponent, LoadAuthorizationRoleFormComponent } from "./Entities/AuthorizationRole/authorizationrole.form.component";
import { AuditLogTypeFormComponent, LoadAuditLogTypeFormComponent } from "./Entities/AuditLogType/auditlogtype.form.component";
import { EntityFieldValueFormComponent, LoadEntityFieldValueFormComponent } from "./Entities/EntityFieldValue/entityfieldvalue.form.component";
import { AIModelFormComponent, LoadAIModelFormComponent } from "./Entities/AIModel/aimodel.form.component";
import { AIActionFormComponent, LoadAIActionFormComponent } from "./Entities/AIAction/aiaction.form.component";
import { AIModelActionFormComponent, LoadAIModelActionFormComponent } from "./Entities/AIModelAction/aimodelaction.form.component";
import { EntityAIActionFormComponent, LoadEntityAIActionFormComponent } from "./Entities/EntityAIAction/entityaiaction.form.component";
import { AIModelTypeFormComponent, LoadAIModelTypeFormComponent } from "./Entities/AIModelType/aimodeltype.form.component";
import { QueueTypeFormComponent, LoadQueueTypeFormComponent } from "./Entities/QueueType/queuetype.form.component";
import { QueueFormComponent, LoadQueueFormComponent } from "./Entities/Queue/queue.form.component";
import { QueueTaskFormComponent, LoadQueueTaskFormComponent } from "./Entities/QueueTask/queuetask.form.component";
import { DashboardFormComponent, LoadDashboardFormComponent } from "./Entities/Dashboard/dashboard.form.component";
import { OutputTriggerTypeFormComponent, LoadOutputTriggerTypeFormComponent } from "./Entities/OutputTriggerType/outputtriggertype.form.component";
import { OutputFormatTypeFormComponent, LoadOutputFormatTypeFormComponent } from "./Entities/OutputFormatType/outputformattype.form.component";
import { OutputDeliveryTypeFormComponent, LoadOutputDeliveryTypeFormComponent } from "./Entities/OutputDeliveryType/outputdeliverytype.form.component";
import { ReportFormComponent, LoadReportFormComponent } from "./Entities/Report/report.form.component";
import { ReportSnapshotFormComponent, LoadReportSnapshotFormComponent } from "./Entities/ReportSnapshot/reportsnapshot.form.component";
import { ResourceTypeFormComponent, LoadResourceTypeFormComponent } from "./Entities/ResourceType/resourcetype.form.component";
import { TagFormComponent, LoadTagFormComponent } from "./Entities/Tag/tag.form.component";
import { TaggedItemFormComponent, LoadTaggedItemFormComponent } from "./Entities/TaggedItem/taggeditem.form.component";
import { WorkspaceFormComponent, LoadWorkspaceFormComponent } from "./Entities/Workspace/workspace.form.component";
import { WorkspaceItemFormComponent, LoadWorkspaceItemFormComponent } from "./Entities/WorkspaceItem/workspaceitem.form.component";
import { DatasetFormComponent, LoadDatasetFormComponent } from "./Entities/Dataset/dataset.form.component";
import { DatasetItemFormComponent, LoadDatasetItemFormComponent } from "./Entities/DatasetItem/datasetitem.form.component";
import { ConversationDetailFormComponent, LoadConversationDetailFormComponent } from "./Entities/ConversationDetail/conversationdetail.form.component";
import { ConversationFormComponent, LoadConversationFormComponent } from "./Entities/Conversation/conversation.form.component";
import { UserNotificationFormComponent, LoadUserNotificationFormComponent } from "./Entities/UserNotification/usernotification.form.component";
import { SchemaInfoFormComponent, LoadSchemaInfoFormComponent } from "./Entities/SchemaInfo/schemainfo.form.component";
import { CompanyIntegrationRecordMapFormComponent, LoadCompanyIntegrationRecordMapFormComponent } from "./Entities/CompanyIntegrationRecordMap/companyintegrationrecordmap.form.component";
import { RecordMergeLogFormComponent, LoadRecordMergeLogFormComponent } from "./Entities/RecordMergeLog/recordmergelog.form.component";
import { RecordMergeDeletionLogFormComponent, LoadRecordMergeDeletionLogFormComponent } from "./Entities/RecordMergeDeletionLog/recordmergedeletionlog.form.component";
import { QueryFieldFormComponent, LoadQueryFieldFormComponent } from "./Entities/QueryField/queryfield.form.component";
import { QueryCategoryFormComponent, LoadQueryCategoryFormComponent } from "./Entities/QueryCategory/querycategory.form.component";
import { QueryFormComponent, LoadQueryFormComponent } from "./Entities/Query/query.form.component";
import { QueryPermissionFormComponent, LoadQueryPermissionFormComponent } from "./Entities/QueryPermission/querypermission.form.component";
import { VectorIndexFormComponent, LoadVectorIndexFormComponent } from "./Entities/VectorIndex/vectorindex.form.component";
import { EntityDocumentTypeFormComponent, LoadEntityDocumentTypeFormComponent } from "./Entities/EntityDocumentType/entitydocumenttype.form.component";
import { EntityDocumentRunFormComponent, LoadEntityDocumentRunFormComponent } from "./Entities/EntityDocumentRun/entitydocumentrun.form.component";
import { VectorDatabaseFormComponent, LoadVectorDatabaseFormComponent } from "./Entities/VectorDatabase/vectordatabase.form.component";
import { EntityRecordDocumentFormComponent, LoadEntityRecordDocumentFormComponent } from "./Entities/EntityRecordDocument/entityrecorddocument.form.component";
import { EntityDocumentFormComponent, LoadEntityDocumentFormComponent } from "./Entities/EntityDocument/entitydocument.form.component";
import { DataContextItemFormComponent, LoadDataContextItemFormComponent } from "./Entities/DataContextItem/datacontextitem.form.component";
import { DataContextFormComponent, LoadDataContextFormComponent } from "./Entities/DataContext/datacontext.form.component";
import { UserViewCategoryFormComponent, LoadUserViewCategoryFormComponent } from "./Entities/UserViewCategory/userviewcategory.form.component";
import { DashboardCategoryFormComponent, LoadDashboardCategoryFormComponent } from "./Entities/DashboardCategory/dashboardcategory.form.component";
import { ReportCategoryFormComponent, LoadReportCategoryFormComponent } from "./Entities/ReportCategory/reportcategory.form.component";
import { FileStorageProviderFormComponent, LoadFileStorageProviderFormComponent } from "./Entities/FileStorageProvider/filestorageprovider.form.component";
import { FileFormComponent, LoadFileFormComponent } from "./Entities/File/file.form.component";
import { FileCategoryFormComponent, LoadFileCategoryFormComponent } from "./Entities/FileCategory/filecategory.form.component";
import { FileEntityRecordLinkFormComponent, LoadFileEntityRecordLinkFormComponent } from "./Entities/FileEntityRecordLink/fileentityrecordlink.form.component";
import { VersionInstallationFormComponent, LoadVersionInstallationFormComponent } from "./Entities/VersionInstallation/versioninstallation.form.component";
import { DuplicateRunDetailMatchFormComponent, LoadDuplicateRunDetailMatchFormComponent } from "./Entities/DuplicateRunDetailMatch/duplicaterundetailmatch.form.component";
import { EntityDocumentSettingFormComponent, LoadEntityDocumentSettingFormComponent } from "./Entities/EntityDocumentSetting/entitydocumentsetting.form.component";
import { EntitySettingFormComponent, LoadEntitySettingFormComponent } from "./Entities/EntitySetting/entitysetting.form.component";
import { DuplicateRunFormComponent, LoadDuplicateRunFormComponent } from "./Entities/DuplicateRun/duplicaterun.form.component";
import { DuplicateRunDetailFormComponent, LoadDuplicateRunDetailFormComponent } from "./Entities/DuplicateRunDetail/duplicaterundetail.form.component";
import { ApplicationSettingFormComponent, LoadApplicationSettingFormComponent } from "./Entities/ApplicationSetting/applicationsetting.form.component";
import { ActionCategoryFormComponent, LoadActionCategoryFormComponent } from "./Entities/ActionCategory/actioncategory.form.component";
import { EntityActionFormComponent, LoadEntityActionFormComponent } from "./Entities/EntityAction/entityaction.form.component";
import { EntityActionInvocationFormComponent, LoadEntityActionInvocationFormComponent } from "./Entities/EntityActionInvocation/entityactioninvocation.form.component";
import { ActionAuthorizationFormComponent, LoadActionAuthorizationFormComponent } from "./Entities/ActionAuthorization/actionauthorization.form.component";
import { EntityActionInvocationTypeFormComponent, LoadEntityActionInvocationTypeFormComponent } from "./Entities/EntityActionInvocationType/entityactioninvocationtype.form.component";
import { ActionFormComponent, LoadActionFormComponent } from "./Entities/Action/action.form.component";
import { EntityActionFilterFormComponent, LoadEntityActionFilterFormComponent } from "./Entities/EntityActionFilter/entityactionfilter.form.component";
import { ActionFilterFormComponent, LoadActionFilterFormComponent } from "./Entities/ActionFilter/actionfilter.form.component";
import { ActionContextTypeFormComponent, LoadActionContextTypeFormComponent } from "./Entities/ActionContextType/actioncontexttype.form.component";
import { ActionResultCodeFormComponent, LoadActionResultCodeFormComponent } from "./Entities/ActionResultCode/actionresultcode.form.component";
import { ActionContextFormComponent, LoadActionContextFormComponent } from "./Entities/ActionContext/actioncontext.form.component";
import { ActionExecutionLogFormComponent, LoadActionExecutionLogFormComponent } from "./Entities/ActionExecutionLog/actionexecutionlog.form.component";
import { ActionParamFormComponent, LoadActionParamFormComponent } from "./Entities/ActionParam/actionparam.form.component";
import { ActionLibraryFormComponent, LoadActionLibraryFormComponent } from "./Entities/ActionLibrary/actionlibrary.form.component";
import { LibraryFormComponent, LoadLibraryFormComponent } from "./Entities/Library/library.form.component";
import { ListCategoryFormComponent, LoadListCategoryFormComponent } from "./Entities/ListCategory/listcategory.form.component";
import { CommunicationProviderFormComponent, LoadCommunicationProviderFormComponent } from "./Entities/CommunicationProvider/communicationprovider.form.component";
import { CommunicationRunFormComponent, LoadCommunicationRunFormComponent } from "./Entities/CommunicationRun/communicationrun.form.component";
import { CommunicationProviderMessageTypeFormComponent, LoadCommunicationProviderMessageTypeFormComponent } from "./Entities/CommunicationProviderMessageType/communicationprovidermessagetype.form.component";
import { CommunicationLogFormComponent, LoadCommunicationLogFormComponent } from "./Entities/CommunicationLog/communicationlog.form.component";
import { CommunicationBaseMessageTypeFormComponent, LoadCommunicationBaseMessageTypeFormComponent } from "./Entities/CommunicationBaseMessageType/communicationbasemessagetype.form.component";
import { TemplateFormComponent, LoadTemplateFormComponent } from "./Entities/Template/template.form.component";
import { TemplateCategoryFormComponent, LoadTemplateCategoryFormComponent } from "./Entities/TemplateCategory/templatecategory.form.component";
import { TemplateContentFormComponent, LoadTemplateContentFormComponent } from "./Entities/TemplateContent/templatecontent.form.component";
import { TemplateParamFormComponent, LoadTemplateParamFormComponent } from "./Entities/TemplateParam/templateparam.form.component";
import { TemplateContentTypeFormComponent, LoadTemplateContentTypeFormComponent } from "./Entities/TemplateContentType/templatecontenttype.form.component";
import { RecommendationFormComponent, LoadRecommendationFormComponent } from "./Entities/Recommendation/recommendation.form.component";
import { RecommendationProviderFormComponent, LoadRecommendationProviderFormComponent } from "./Entities/RecommendationProvider/recommendationprovider.form.component";
import { RecommendationRunFormComponent, LoadRecommendationRunFormComponent } from "./Entities/RecommendationRun/recommendationrun.form.component";
import { RecommendationItemFormComponent, LoadRecommendationItemFormComponent } from "./Entities/RecommendationItem/recommendationitem.form.component";
import { EntityCommunicationMessageTypeFormComponent, LoadEntityCommunicationMessageTypeFormComponent } from "./Entities/EntityCommunicationMessageType/entitycommunicationmessagetype.form.component";
import { EntityCommunicationFieldFormComponent, LoadEntityCommunicationFieldFormComponent } from "./Entities/EntityCommunicationField/entitycommunicationfield.form.component";
import { RecordChangeReplayRunFormComponent, LoadRecordChangeReplayRunFormComponent } from "./Entities/RecordChangeReplayRun/recordchangereplayrun.form.component";
import { LibraryItemFormComponent, LoadLibraryItemFormComponent } from "./Entities/LibraryItem/libraryitem.form.component";
import { EntityRelationshipDisplayComponentFormComponent, LoadEntityRelationshipDisplayComponentFormComponent } from "./Entities/EntityRelationshipDisplayComponent/entityrelationshipdisplaycomponent.form.component";
import { EntityActionParamFormComponent, LoadEntityActionParamFormComponent } from "./Entities/EntityActionParam/entityactionparam.form.component";
import { CompanyDetailsComponent, LoadCompanyDetailsComponent } from "./Entities/Company/sections/details.component"
import { EmployeeDetailsComponent, LoadEmployeeDetailsComponent } from "./Entities/Employee/sections/details.component"
import { UserFavoriteDetailsComponent, LoadUserFavoriteDetailsComponent } from "./Entities/UserFavorite/sections/details.component"
import { EmployeeCompanyIntegrationDetailsComponent, LoadEmployeeCompanyIntegrationDetailsComponent } from "./Entities/EmployeeCompanyIntegration/sections/details.component"
import { EmployeeRoleDetailsComponent, LoadEmployeeRoleDetailsComponent } from "./Entities/EmployeeRole/sections/details.component"
import { EmployeeSkillDetailsComponent, LoadEmployeeSkillDetailsComponent } from "./Entities/EmployeeSkill/sections/details.component"
import { RoleDetailsComponent, LoadRoleDetailsComponent } from "./Entities/Role/sections/details.component"
import { SkillDetailsComponent, LoadSkillDetailsComponent } from "./Entities/Skill/sections/details.component"
import { IntegrationURLFormatDetailsComponent, LoadIntegrationURLFormatDetailsComponent } from "./Entities/IntegrationURLFormat/sections/details.component"
import { IntegrationDetailsComponent, LoadIntegrationDetailsComponent } from "./Entities/Integration/sections/details.component"
import { CompanyIntegrationDetailsComponent, LoadCompanyIntegrationDetailsComponent } from "./Entities/CompanyIntegration/sections/details.component"
import { EntityFieldDetailsComponent, LoadEntityFieldDetailsComponent } from "./Entities/EntityField/sections/details.component"
import { EntityDetailsComponent, LoadEntityDetailsComponent } from "./Entities/Entity/sections/details.component"
import { EntityTopComponent, LoadEntityTopComponent } from "./Entities/Entity/sections/top.component"
import { EntityAuditComponent, LoadEntityAuditComponent } from "./Entities/Entity/sections/audit.component"
import { EntityAPIComponent, LoadEntityAPIComponent } from "./Entities/Entity/sections/api.component"
import { EntityDBComponent, LoadEntityDBComponent } from "./Entities/Entity/sections/db.component"
import { EntityUIComponent, LoadEntityUIComponent } from "./Entities/Entity/sections/ui.component"
import { UserDetailsComponent, LoadUserDetailsComponent } from "./Entities/User/sections/details.component"
import { EntityRelationshipDetailsComponent, LoadEntityRelationshipDetailsComponent } from "./Entities/EntityRelationship/sections/details.component"
import { UserRecordLogDetailsComponent, LoadUserRecordLogDetailsComponent } from "./Entities/UserRecordLog/sections/details.component"
import { UserViewDetailsComponent, LoadUserViewDetailsComponent } from "./Entities/UserView/sections/details.component"
import { CompanyIntegrationRunDetailsComponent, LoadCompanyIntegrationRunDetailsComponent } from "./Entities/CompanyIntegrationRun/sections/details.component"
import { CompanyIntegrationRunDetailDetailsComponent, LoadCompanyIntegrationRunDetailDetailsComponent } from "./Entities/CompanyIntegrationRunDetail/sections/details.component"
import { ErrorLogDetailsComponent, LoadErrorLogDetailsComponent } from "./Entities/ErrorLog/sections/details.component"
import { ApplicationDetailsComponent, LoadApplicationDetailsComponent } from "./Entities/Application/sections/details.component"
import { ApplicationEntityDetailsComponent, LoadApplicationEntityDetailsComponent } from "./Entities/ApplicationEntity/sections/details.component"
import { EntityPermissionDetailsComponent, LoadEntityPermissionDetailsComponent } from "./Entities/EntityPermission/sections/details.component"
import { UserApplicationEntityDetailsComponent, LoadUserApplicationEntityDetailsComponent } from "./Entities/UserApplicationEntity/sections/details.component"
import { UserApplicationDetailsComponent, LoadUserApplicationDetailsComponent } from "./Entities/UserApplication/sections/details.component"
import { CompanyIntegrationRunAPILogDetailsComponent, LoadCompanyIntegrationRunAPILogDetailsComponent } from "./Entities/CompanyIntegrationRunAPILog/sections/details.component"
import { ListDetailsComponent, LoadListDetailsComponent } from "./Entities/List/sections/details.component"
import { ListDetailDetailsComponent, LoadListDetailDetailsComponent } from "./Entities/ListDetail/sections/details.component"
import { UserViewRunDetailsComponent, LoadUserViewRunDetailsComponent } from "./Entities/UserViewRun/sections/details.component"
import { UserViewRunDetailDetailsComponent, LoadUserViewRunDetailDetailsComponent } from "./Entities/UserViewRunDetail/sections/details.component"
import { WorkflowRunDetailsComponent, LoadWorkflowRunDetailsComponent } from "./Entities/WorkflowRun/sections/details.component"
import { WorkflowDetailsComponent, LoadWorkflowDetailsComponent } from "./Entities/Workflow/sections/details.component"
import { WorkflowEngineDetailsComponent, LoadWorkflowEngineDetailsComponent } from "./Entities/WorkflowEngine/sections/details.component"
import { RecordChangeDetailsComponent, LoadRecordChangeDetailsComponent } from "./Entities/RecordChange/sections/details.component"
import { UserRoleDetailsComponent, LoadUserRoleDetailsComponent } from "./Entities/UserRole/sections/details.component"
import { RowLevelSecurityFilterDetailsComponent, LoadRowLevelSecurityFilterDetailsComponent } from "./Entities/RowLevelSecurityFilter/sections/details.component"
import { AuditLogDetailsComponent, LoadAuditLogDetailsComponent } from "./Entities/AuditLog/sections/details.component"
import { AuthorizationDetailsComponent, LoadAuthorizationDetailsComponent } from "./Entities/Authorization/sections/details.component"
import { AuthorizationRoleDetailsComponent, LoadAuthorizationRoleDetailsComponent } from "./Entities/AuthorizationRole/sections/details.component"
import { AuditLogTypeDetailsComponent, LoadAuditLogTypeDetailsComponent } from "./Entities/AuditLogType/sections/details.component"
import { EntityFieldValueDetailsComponent, LoadEntityFieldValueDetailsComponent } from "./Entities/EntityFieldValue/sections/details.component"
import { AIModelDetailsComponent, LoadAIModelDetailsComponent } from "./Entities/AIModel/sections/details.component"
import { AIActionDetailsComponent, LoadAIActionDetailsComponent } from "./Entities/AIAction/sections/details.component"
import { AIModelActionDetailsComponent, LoadAIModelActionDetailsComponent } from "./Entities/AIModelAction/sections/details.component"
import { EntityAIActionDetailsComponent, LoadEntityAIActionDetailsComponent } from "./Entities/EntityAIAction/sections/details.component"
import { AIModelTypeDetailsComponent, LoadAIModelTypeDetailsComponent } from "./Entities/AIModelType/sections/details.component"
import { QueueTypeDetailsComponent, LoadQueueTypeDetailsComponent } from "./Entities/QueueType/sections/details.component"
import { QueueDetailsComponent, LoadQueueDetailsComponent } from "./Entities/Queue/sections/details.component"
import { QueueTaskDetailsComponent, LoadQueueTaskDetailsComponent } from "./Entities/QueueTask/sections/details.component"
import { DashboardDetailsComponent, LoadDashboardDetailsComponent } from "./Entities/Dashboard/sections/details.component"
import { OutputTriggerTypeDetailsComponent, LoadOutputTriggerTypeDetailsComponent } from "./Entities/OutputTriggerType/sections/details.component"
import { OutputFormatTypeDetailsComponent, LoadOutputFormatTypeDetailsComponent } from "./Entities/OutputFormatType/sections/details.component"
import { OutputDeliveryTypeDetailsComponent, LoadOutputDeliveryTypeDetailsComponent } from "./Entities/OutputDeliveryType/sections/details.component"
import { ReportDetailsComponent, LoadReportDetailsComponent } from "./Entities/Report/sections/details.component"
import { ReportSnapshotDetailsComponent, LoadReportSnapshotDetailsComponent } from "./Entities/ReportSnapshot/sections/details.component"
import { ResourceTypeDetailsComponent, LoadResourceTypeDetailsComponent } from "./Entities/ResourceType/sections/details.component"
import { TagDetailsComponent, LoadTagDetailsComponent } from "./Entities/Tag/sections/details.component"
import { TaggedItemDetailsComponent, LoadTaggedItemDetailsComponent } from "./Entities/TaggedItem/sections/details.component"
import { WorkspaceDetailsComponent, LoadWorkspaceDetailsComponent } from "./Entities/Workspace/sections/details.component"
import { WorkspaceItemDetailsComponent, LoadWorkspaceItemDetailsComponent } from "./Entities/WorkspaceItem/sections/details.component"
import { DatasetDetailsComponent, LoadDatasetDetailsComponent } from "./Entities/Dataset/sections/details.component"
import { DatasetItemDetailsComponent, LoadDatasetItemDetailsComponent } from "./Entities/DatasetItem/sections/details.component"
import { ConversationDetailDetailsComponent, LoadConversationDetailDetailsComponent } from "./Entities/ConversationDetail/sections/details.component"
import { ConversationDetailsComponent, LoadConversationDetailsComponent } from "./Entities/Conversation/sections/details.component"
import { UserNotificationDetailsComponent, LoadUserNotificationDetailsComponent } from "./Entities/UserNotification/sections/details.component"
import { SchemaInfoDetailsComponent, LoadSchemaInfoDetailsComponent } from "./Entities/SchemaInfo/sections/details.component"
import { CompanyIntegrationRecordMapDetailsComponent, LoadCompanyIntegrationRecordMapDetailsComponent } from "./Entities/CompanyIntegrationRecordMap/sections/details.component"
import { RecordMergeLogDetailsComponent, LoadRecordMergeLogDetailsComponent } from "./Entities/RecordMergeLog/sections/details.component"
import { RecordMergeDeletionLogDetailsComponent, LoadRecordMergeDeletionLogDetailsComponent } from "./Entities/RecordMergeDeletionLog/sections/details.component"
import { QueryFieldDetailsComponent, LoadQueryFieldDetailsComponent } from "./Entities/QueryField/sections/details.component"
import { QueryCategoryDetailsComponent, LoadQueryCategoryDetailsComponent } from "./Entities/QueryCategory/sections/details.component"
import { QueryDetailsComponent, LoadQueryDetailsComponent } from "./Entities/Query/sections/details.component"
import { QueryPermissionDetailsComponent, LoadQueryPermissionDetailsComponent } from "./Entities/QueryPermission/sections/details.component"
import { VectorIndexDetailsComponent, LoadVectorIndexDetailsComponent } from "./Entities/VectorIndex/sections/details.component"
import { EntityDocumentTypeDetailsComponent, LoadEntityDocumentTypeDetailsComponent } from "./Entities/EntityDocumentType/sections/details.component"
import { EntityDocumentRunDetailsComponent, LoadEntityDocumentRunDetailsComponent } from "./Entities/EntityDocumentRun/sections/details.component"
import { VectorDatabaseDetailsComponent, LoadVectorDatabaseDetailsComponent } from "./Entities/VectorDatabase/sections/details.component"
import { EntityRecordDocumentDetailsComponent, LoadEntityRecordDocumentDetailsComponent } from "./Entities/EntityRecordDocument/sections/details.component"
import { EntityDocumentDetailsComponent, LoadEntityDocumentDetailsComponent } from "./Entities/EntityDocument/sections/details.component"
import { DataContextItemDetailsComponent, LoadDataContextItemDetailsComponent } from "./Entities/DataContextItem/sections/details.component"
import { DataContextDetailsComponent, LoadDataContextDetailsComponent } from "./Entities/DataContext/sections/details.component"
import { UserViewCategoryDetailsComponent, LoadUserViewCategoryDetailsComponent } from "./Entities/UserViewCategory/sections/details.component"
import { DashboardCategoryDetailsComponent, LoadDashboardCategoryDetailsComponent } from "./Entities/DashboardCategory/sections/details.component"
import { ReportCategoryDetailsComponent, LoadReportCategoryDetailsComponent } from "./Entities/ReportCategory/sections/details.component"
import { FileStorageProviderDetailsComponent, LoadFileStorageProviderDetailsComponent } from "./Entities/FileStorageProvider/sections/details.component"
import { FileDetailsComponent, LoadFileDetailsComponent } from "./Entities/File/sections/details.component"
import { FileCategoryDetailsComponent, LoadFileCategoryDetailsComponent } from "./Entities/FileCategory/sections/details.component"
import { FileEntityRecordLinkDetailsComponent, LoadFileEntityRecordLinkDetailsComponent } from "./Entities/FileEntityRecordLink/sections/details.component"
import { VersionInstallationDetailsComponent, LoadVersionInstallationDetailsComponent } from "./Entities/VersionInstallation/sections/details.component"
import { DuplicateRunDetailMatchDetailsComponent, LoadDuplicateRunDetailMatchDetailsComponent } from "./Entities/DuplicateRunDetailMatch/sections/details.component"
import { EntityDocumentSettingDetailsComponent, LoadEntityDocumentSettingDetailsComponent } from "./Entities/EntityDocumentSetting/sections/details.component"
import { EntitySettingDetailsComponent, LoadEntitySettingDetailsComponent } from "./Entities/EntitySetting/sections/details.component"
import { DuplicateRunDetailsComponent, LoadDuplicateRunDetailsComponent } from "./Entities/DuplicateRun/sections/details.component"
import { DuplicateRunDetailDetailsComponent, LoadDuplicateRunDetailDetailsComponent } from "./Entities/DuplicateRunDetail/sections/details.component"
import { ApplicationSettingDetailsComponent, LoadApplicationSettingDetailsComponent } from "./Entities/ApplicationSetting/sections/details.component"
import { ActionCategoryDetailsComponent, LoadActionCategoryDetailsComponent } from "./Entities/ActionCategory/sections/details.component"
import { EntityActionDetailsComponent, LoadEntityActionDetailsComponent } from "./Entities/EntityAction/sections/details.component"
import { EntityActionInvocationDetailsComponent, LoadEntityActionInvocationDetailsComponent } from "./Entities/EntityActionInvocation/sections/details.component"
import { ActionAuthorizationDetailsComponent, LoadActionAuthorizationDetailsComponent } from "./Entities/ActionAuthorization/sections/details.component"
import { EntityActionInvocationTypeDetailsComponent, LoadEntityActionInvocationTypeDetailsComponent } from "./Entities/EntityActionInvocationType/sections/details.component"
import { ActionDetailsComponent, LoadActionDetailsComponent } from "./Entities/Action/sections/details.component"
import { ActionTopComponent, LoadActionTopComponent } from "./Entities/Action/sections/top.component"
import { ActionCodeComponent, LoadActionCodeComponent } from "./Entities/Action/sections/code.component"
import { EntityActionFilterDetailsComponent, LoadEntityActionFilterDetailsComponent } from "./Entities/EntityActionFilter/sections/details.component"
import { ActionFilterDetailsComponent, LoadActionFilterDetailsComponent } from "./Entities/ActionFilter/sections/details.component"
import { ActionContextTypeDetailsComponent, LoadActionContextTypeDetailsComponent } from "./Entities/ActionContextType/sections/details.component"
import { ActionResultCodeDetailsComponent, LoadActionResultCodeDetailsComponent } from "./Entities/ActionResultCode/sections/details.component"
import { ActionContextDetailsComponent, LoadActionContextDetailsComponent } from "./Entities/ActionContext/sections/details.component"
import { ActionExecutionLogDetailsComponent, LoadActionExecutionLogDetailsComponent } from "./Entities/ActionExecutionLog/sections/details.component"
import { ActionParamDetailsComponent, LoadActionParamDetailsComponent } from "./Entities/ActionParam/sections/details.component"
import { ActionLibraryDetailsComponent, LoadActionLibraryDetailsComponent } from "./Entities/ActionLibrary/sections/details.component"
import { LibraryDetailsComponent, LoadLibraryDetailsComponent } from "./Entities/Library/sections/details.component"
import { ListCategoryDetailsComponent, LoadListCategoryDetailsComponent } from "./Entities/ListCategory/sections/details.component"
import { CommunicationProviderDetailsComponent, LoadCommunicationProviderDetailsComponent } from "./Entities/CommunicationProvider/sections/details.component"
import { CommunicationRunDetailsComponent, LoadCommunicationRunDetailsComponent } from "./Entities/CommunicationRun/sections/details.component"
import { CommunicationProviderMessageTypeDetailsComponent, LoadCommunicationProviderMessageTypeDetailsComponent } from "./Entities/CommunicationProviderMessageType/sections/details.component"
import { CommunicationLogDetailsComponent, LoadCommunicationLogDetailsComponent } from "./Entities/CommunicationLog/sections/details.component"
import { CommunicationBaseMessageTypeDetailsComponent, LoadCommunicationBaseMessageTypeDetailsComponent } from "./Entities/CommunicationBaseMessageType/sections/details.component"
import { TemplateDetailsComponent, LoadTemplateDetailsComponent } from "./Entities/Template/sections/details.component"
import { TemplateCategoryDetailsComponent, LoadTemplateCategoryDetailsComponent } from "./Entities/TemplateCategory/sections/details.component"
import { TemplateContentDetailsComponent, LoadTemplateContentDetailsComponent } from "./Entities/TemplateContent/sections/details.component"
import { TemplateParamDetailsComponent, LoadTemplateParamDetailsComponent } from "./Entities/TemplateParam/sections/details.component"
import { TemplateContentTypeDetailsComponent, LoadTemplateContentTypeDetailsComponent } from "./Entities/TemplateContentType/sections/details.component"
import { RecommendationDetailsComponent, LoadRecommendationDetailsComponent } from "./Entities/Recommendation/sections/details.component"
import { RecommendationProviderDetailsComponent, LoadRecommendationProviderDetailsComponent } from "./Entities/RecommendationProvider/sections/details.component"
import { RecommendationRunDetailsComponent, LoadRecommendationRunDetailsComponent } from "./Entities/RecommendationRun/sections/details.component"
import { RecommendationItemDetailsComponent, LoadRecommendationItemDetailsComponent } from "./Entities/RecommendationItem/sections/details.component"
import { EntityCommunicationMessageTypeDetailsComponent, LoadEntityCommunicationMessageTypeDetailsComponent } from "./Entities/EntityCommunicationMessageType/sections/details.component"
import { EntityCommunicationFieldDetailsComponent, LoadEntityCommunicationFieldDetailsComponent } from "./Entities/EntityCommunicationField/sections/details.component"
import { RecordChangeReplayRunDetailsComponent, LoadRecordChangeReplayRunDetailsComponent } from "./Entities/RecordChangeReplayRun/sections/details.component"
import { LibraryItemDetailsComponent, LoadLibraryItemDetailsComponent } from "./Entities/LibraryItem/sections/details.component"
import { EntityRelationshipDisplayComponentDetailsComponent, LoadEntityRelationshipDisplayComponentDetailsComponent } from "./Entities/EntityRelationshipDisplayComponent/sections/details.component"
import { EntityActionParamDetailsComponent, LoadEntityActionParamDetailsComponent } from "./Entities/EntityActionParam/sections/details.component"
import { JoinGridModule } from "@memberjunction/ng-join-grid"   

@NgModule({
declarations: [
    CompanyFormComponent,
    EmployeeFormComponent,
    UserFavoriteFormComponent,
    EmployeeCompanyIntegrationFormComponent,
    EmployeeRoleFormComponent,
    EmployeeSkillFormComponent,
    RoleFormComponent,
    SkillFormComponent,
    IntegrationURLFormatFormComponent,
    IntegrationFormComponent,
    CompanyIntegrationFormComponent,
    EntityFieldFormComponent,
    EntityFormComponent,
    UserFormComponent,
    EntityRelationshipFormComponent,
    UserRecordLogFormComponent,
    UserViewFormComponent,
    CompanyIntegrationRunFormComponent,
    CompanyIntegrationRunDetailFormComponent,
    ErrorLogFormComponent],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
    InputsModule,
    ButtonsModule,
    DateInputsModule,
    UserViewGridModule,
    LinkDirectivesModule,
    BaseFormsModule,
    FormToolbarModule,
    MJTabStripModule,
    ContainerDirectivesModule,
    DropDownListModule,
    ComboBoxModule,
    UserViewGridModule
],
exports: [
]
})
export class GeneratedForms_SubModule_0 { }
    


@NgModule({
declarations: [
    ApplicationFormComponent,
    ApplicationEntityFormComponent,
    EntityPermissionFormComponent,
    UserApplicationEntityFormComponent,
    UserApplicationFormComponent,
    CompanyIntegrationRunAPILogFormComponent,
    ListFormComponent,
    ListDetailFormComponent,
    UserViewRunFormComponent,
    UserViewRunDetailFormComponent,
    WorkflowRunFormComponent,
    WorkflowFormComponent,
    WorkflowEngineFormComponent,
    RecordChangeFormComponent,
    UserRoleFormComponent,
    RowLevelSecurityFilterFormComponent,
    AuditLogFormComponent,
    AuthorizationFormComponent,
    AuthorizationRoleFormComponent,
    AuditLogTypeFormComponent],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
    InputsModule,
    ButtonsModule,
    DateInputsModule,
    UserViewGridModule,
    LinkDirectivesModule,
    BaseFormsModule,
    FormToolbarModule,
    MJTabStripModule,
    ContainerDirectivesModule,
    DropDownListModule,
    ComboBoxModule,
    UserViewGridModule
],
exports: [
]
})
export class GeneratedForms_SubModule_1 { }
    


@NgModule({
declarations: [
    EntityFieldValueFormComponent,
    AIModelFormComponent,
    AIActionFormComponent,
    AIModelActionFormComponent,
    EntityAIActionFormComponent,
    AIModelTypeFormComponent,
    QueueTypeFormComponent,
    QueueFormComponent,
    QueueTaskFormComponent,
    DashboardFormComponent,
    OutputTriggerTypeFormComponent,
    OutputFormatTypeFormComponent,
    OutputDeliveryTypeFormComponent,
    ReportFormComponent,
    ReportSnapshotFormComponent,
    ResourceTypeFormComponent,
    TagFormComponent,
    TaggedItemFormComponent,
    WorkspaceFormComponent,
    WorkspaceItemFormComponent],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
    InputsModule,
    ButtonsModule,
    DateInputsModule,
    UserViewGridModule,
    LinkDirectivesModule,
    BaseFormsModule,
    FormToolbarModule,
    MJTabStripModule,
    ContainerDirectivesModule,
    DropDownListModule,
    ComboBoxModule,
    UserViewGridModule
],
exports: [
]
})
export class GeneratedForms_SubModule_2 { }
    


@NgModule({
declarations: [
    DatasetFormComponent,
    DatasetItemFormComponent,
    ConversationDetailFormComponent,
    ConversationFormComponent,
    UserNotificationFormComponent,
    SchemaInfoFormComponent,
    CompanyIntegrationRecordMapFormComponent,
    RecordMergeLogFormComponent,
    RecordMergeDeletionLogFormComponent,
    QueryFieldFormComponent,
    QueryCategoryFormComponent,
    QueryFormComponent,
    QueryPermissionFormComponent,
    VectorIndexFormComponent,
    EntityDocumentTypeFormComponent,
    EntityDocumentRunFormComponent,
    VectorDatabaseFormComponent,
    EntityRecordDocumentFormComponent,
    EntityDocumentFormComponent,
    DataContextItemFormComponent],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
    InputsModule,
    ButtonsModule,
    DateInputsModule,
    UserViewGridModule,
    LinkDirectivesModule,
    BaseFormsModule,
    FormToolbarModule,
    MJTabStripModule,
    ContainerDirectivesModule,
    DropDownListModule,
    ComboBoxModule,
    UserViewGridModule
],
exports: [
]
})
export class GeneratedForms_SubModule_3 { }
    


@NgModule({
declarations: [
    DataContextFormComponent,
    UserViewCategoryFormComponent,
    DashboardCategoryFormComponent,
    ReportCategoryFormComponent,
    FileStorageProviderFormComponent,
    FileFormComponent,
    FileCategoryFormComponent,
    FileEntityRecordLinkFormComponent,
    VersionInstallationFormComponent,
    DuplicateRunDetailMatchFormComponent,
    EntityDocumentSettingFormComponent,
    EntitySettingFormComponent,
    DuplicateRunFormComponent,
    DuplicateRunDetailFormComponent,
    ApplicationSettingFormComponent,
    ActionCategoryFormComponent,
    EntityActionFormComponent,
    EntityActionInvocationFormComponent,
    ActionAuthorizationFormComponent,
    EntityActionInvocationTypeFormComponent],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
    InputsModule,
    ButtonsModule,
    DateInputsModule,
    UserViewGridModule,
    LinkDirectivesModule,
    BaseFormsModule,
    FormToolbarModule,
    MJTabStripModule,
    ContainerDirectivesModule,
    DropDownListModule,
    ComboBoxModule,
    UserViewGridModule
],
exports: [
]
})
export class GeneratedForms_SubModule_4 { }
    


@NgModule({
declarations: [
    ActionFormComponent,
    EntityActionFilterFormComponent,
    ActionFilterFormComponent,
    ActionContextTypeFormComponent,
    ActionResultCodeFormComponent,
    ActionContextFormComponent,
    ActionExecutionLogFormComponent,
    ActionParamFormComponent,
    ActionLibraryFormComponent,
    LibraryFormComponent,
    ListCategoryFormComponent,
    CommunicationProviderFormComponent,
    CommunicationRunFormComponent,
    CommunicationProviderMessageTypeFormComponent,
    CommunicationLogFormComponent,
    CommunicationBaseMessageTypeFormComponent,
    TemplateFormComponent,
    TemplateCategoryFormComponent,
    TemplateContentFormComponent,
    TemplateParamFormComponent],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
    InputsModule,
    ButtonsModule,
    DateInputsModule,
    UserViewGridModule,
    LinkDirectivesModule,
    BaseFormsModule,
    FormToolbarModule,
    MJTabStripModule,
    ContainerDirectivesModule,
    DropDownListModule,
    ComboBoxModule,
    UserViewGridModule,
    JoinGridModule
],
exports: [
]
})
export class GeneratedForms_SubModule_5 { }
    


@NgModule({
declarations: [
    TemplateContentTypeFormComponent,
    RecommendationFormComponent,
    RecommendationProviderFormComponent,
    RecommendationRunFormComponent,
    RecommendationItemFormComponent,
    EntityCommunicationMessageTypeFormComponent,
    EntityCommunicationFieldFormComponent,
    RecordChangeReplayRunFormComponent,
    LibraryItemFormComponent,
    EntityRelationshipDisplayComponentFormComponent,
    EntityActionParamFormComponent,
    CompanyDetailsComponent,
    EmployeeDetailsComponent,
    UserFavoriteDetailsComponent,
    EmployeeCompanyIntegrationDetailsComponent,
    EmployeeRoleDetailsComponent,
    EmployeeSkillDetailsComponent,
    RoleDetailsComponent,
    SkillDetailsComponent,
    IntegrationURLFormatDetailsComponent],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
    InputsModule,
    ButtonsModule,
    DateInputsModule,
    UserViewGridModule,
    LinkDirectivesModule,
    BaseFormsModule,
    FormToolbarModule,
    MJTabStripModule,
    ContainerDirectivesModule,
    DropDownListModule,
    ComboBoxModule,
    UserViewGridModule
],
exports: [
]
})
export class GeneratedForms_SubModule_6 { }
    


@NgModule({
declarations: [
    IntegrationDetailsComponent,
    CompanyIntegrationDetailsComponent,
    EntityFieldDetailsComponent,
    EntityDetailsComponent,
    EntityTopComponent,
    EntityAuditComponent,
    EntityAPIComponent,
    EntityDBComponent,
    EntityUIComponent,
    UserDetailsComponent,
    EntityRelationshipDetailsComponent,
    UserRecordLogDetailsComponent,
    UserViewDetailsComponent,
    CompanyIntegrationRunDetailsComponent,
    CompanyIntegrationRunDetailDetailsComponent,
    ErrorLogDetailsComponent,
    ApplicationDetailsComponent,
    ApplicationEntityDetailsComponent,
    EntityPermissionDetailsComponent,
    UserApplicationEntityDetailsComponent],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
    InputsModule,
    ButtonsModule,
    DateInputsModule,
    UserViewGridModule,
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
    UserApplicationDetailsComponent,
    CompanyIntegrationRunAPILogDetailsComponent,
    ListDetailsComponent,
    ListDetailDetailsComponent,
    UserViewRunDetailsComponent,
    UserViewRunDetailDetailsComponent,
    WorkflowRunDetailsComponent,
    WorkflowDetailsComponent,
    WorkflowEngineDetailsComponent,
    RecordChangeDetailsComponent,
    UserRoleDetailsComponent,
    RowLevelSecurityFilterDetailsComponent,
    AuditLogDetailsComponent,
    AuthorizationDetailsComponent,
    AuthorizationRoleDetailsComponent,
    AuditLogTypeDetailsComponent,
    EntityFieldValueDetailsComponent,
    AIModelDetailsComponent,
    AIActionDetailsComponent,
    AIModelActionDetailsComponent],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
    InputsModule,
    ButtonsModule,
    DateInputsModule,
    UserViewGridModule,
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
    EntityAIActionDetailsComponent,
    AIModelTypeDetailsComponent,
    QueueTypeDetailsComponent,
    QueueDetailsComponent,
    QueueTaskDetailsComponent,
    DashboardDetailsComponent,
    OutputTriggerTypeDetailsComponent,
    OutputFormatTypeDetailsComponent,
    OutputDeliveryTypeDetailsComponent,
    ReportDetailsComponent,
    ReportSnapshotDetailsComponent,
    ResourceTypeDetailsComponent,
    TagDetailsComponent,
    TaggedItemDetailsComponent,
    WorkspaceDetailsComponent,
    WorkspaceItemDetailsComponent,
    DatasetDetailsComponent,
    DatasetItemDetailsComponent,
    ConversationDetailDetailsComponent,
    ConversationDetailsComponent],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
    InputsModule,
    ButtonsModule,
    DateInputsModule,
    UserViewGridModule,
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
    UserNotificationDetailsComponent,
    SchemaInfoDetailsComponent,
    CompanyIntegrationRecordMapDetailsComponent,
    RecordMergeLogDetailsComponent,
    RecordMergeDeletionLogDetailsComponent,
    QueryFieldDetailsComponent,
    QueryCategoryDetailsComponent,
    QueryDetailsComponent,
    QueryPermissionDetailsComponent,
    VectorIndexDetailsComponent,
    EntityDocumentTypeDetailsComponent,
    EntityDocumentRunDetailsComponent,
    VectorDatabaseDetailsComponent,
    EntityRecordDocumentDetailsComponent,
    EntityDocumentDetailsComponent,
    DataContextItemDetailsComponent,
    DataContextDetailsComponent,
    UserViewCategoryDetailsComponent,
    DashboardCategoryDetailsComponent,
    ReportCategoryDetailsComponent],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
    InputsModule,
    ButtonsModule,
    DateInputsModule,
    UserViewGridModule,
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
    FileStorageProviderDetailsComponent,
    FileDetailsComponent,
    FileCategoryDetailsComponent,
    FileEntityRecordLinkDetailsComponent,
    VersionInstallationDetailsComponent,
    DuplicateRunDetailMatchDetailsComponent,
    EntityDocumentSettingDetailsComponent,
    EntitySettingDetailsComponent,
    DuplicateRunDetailsComponent,
    DuplicateRunDetailDetailsComponent,
    ApplicationSettingDetailsComponent,
    ActionCategoryDetailsComponent,
    EntityActionDetailsComponent,
    EntityActionInvocationDetailsComponent,
    ActionAuthorizationDetailsComponent,
    EntityActionInvocationTypeDetailsComponent,
    ActionDetailsComponent,
    ActionTopComponent,
    ActionCodeComponent,
    EntityActionFilterDetailsComponent],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
    InputsModule,
    ButtonsModule,
    DateInputsModule,
    UserViewGridModule,
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
    ActionFilterDetailsComponent,
    ActionContextTypeDetailsComponent,
    ActionResultCodeDetailsComponent,
    ActionContextDetailsComponent,
    ActionExecutionLogDetailsComponent,
    ActionParamDetailsComponent,
    ActionLibraryDetailsComponent,
    LibraryDetailsComponent,
    ListCategoryDetailsComponent,
    CommunicationProviderDetailsComponent,
    CommunicationRunDetailsComponent,
    CommunicationProviderMessageTypeDetailsComponent,
    CommunicationLogDetailsComponent,
    CommunicationBaseMessageTypeDetailsComponent,
    TemplateDetailsComponent,
    TemplateCategoryDetailsComponent,
    TemplateContentDetailsComponent,
    TemplateParamDetailsComponent,
    TemplateContentTypeDetailsComponent,
    RecommendationDetailsComponent],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
    InputsModule,
    ButtonsModule,
    DateInputsModule,
    UserViewGridModule,
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
    RecommendationProviderDetailsComponent,
    RecommendationRunDetailsComponent,
    RecommendationItemDetailsComponent,
    EntityCommunicationMessageTypeDetailsComponent,
    EntityCommunicationFieldDetailsComponent,
    RecordChangeReplayRunDetailsComponent,
    LibraryItemDetailsComponent,
    EntityRelationshipDisplayComponentDetailsComponent,
    EntityActionParamDetailsComponent],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
    InputsModule,
    ButtonsModule,
    DateInputsModule,
    UserViewGridModule,
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
    
export function LoadCoreGeneratedForms() {
    // This function doesn't do much, but it calls each generated form's loader function
    // which in turn calls the sections for that generated form. Ultimately, those bits of 
    // code do NOTHING - the point is to prevent the code from being eliminated during tree shaking
    // since it is dynamically instantiated on demand, and the Angular compiler has no way to know that,
    // in production builds tree shaking will eliminate the code unless we do this
    LoadCompanyFormComponent();
    LoadEmployeeFormComponent();
    LoadUserFavoriteFormComponent();
    LoadEmployeeCompanyIntegrationFormComponent();
    LoadEmployeeRoleFormComponent();
    LoadEmployeeSkillFormComponent();
    LoadRoleFormComponent();
    LoadSkillFormComponent();
    LoadIntegrationURLFormatFormComponent();
    LoadIntegrationFormComponent();
    LoadCompanyIntegrationFormComponent();
    LoadEntityFieldFormComponent();
    LoadEntityFormComponent();
    LoadUserFormComponent();
    LoadEntityRelationshipFormComponent();
    LoadUserRecordLogFormComponent();
    LoadUserViewFormComponent();
    LoadCompanyIntegrationRunFormComponent();
    LoadCompanyIntegrationRunDetailFormComponent();
    LoadErrorLogFormComponent();
    LoadApplicationFormComponent();
    LoadApplicationEntityFormComponent();
    LoadEntityPermissionFormComponent();
    LoadUserApplicationEntityFormComponent();
    LoadUserApplicationFormComponent();
    LoadCompanyIntegrationRunAPILogFormComponent();
    LoadListFormComponent();
    LoadListDetailFormComponent();
    LoadUserViewRunFormComponent();
    LoadUserViewRunDetailFormComponent();
    LoadWorkflowRunFormComponent();
    LoadWorkflowFormComponent();
    LoadWorkflowEngineFormComponent();
    LoadRecordChangeFormComponent();
    LoadUserRoleFormComponent();
    LoadRowLevelSecurityFilterFormComponent();
    LoadAuditLogFormComponent();
    LoadAuthorizationFormComponent();
    LoadAuthorizationRoleFormComponent();
    LoadAuditLogTypeFormComponent();
    LoadEntityFieldValueFormComponent();
    LoadAIModelFormComponent();
    LoadAIActionFormComponent();
    LoadAIModelActionFormComponent();
    LoadEntityAIActionFormComponent();
    LoadAIModelTypeFormComponent();
    LoadQueueTypeFormComponent();
    LoadQueueFormComponent();
    LoadQueueTaskFormComponent();
    LoadDashboardFormComponent();
    LoadOutputTriggerTypeFormComponent();
    LoadOutputFormatTypeFormComponent();
    LoadOutputDeliveryTypeFormComponent();
    LoadReportFormComponent();
    LoadReportSnapshotFormComponent();
    LoadResourceTypeFormComponent();
    LoadTagFormComponent();
    LoadTaggedItemFormComponent();
    LoadWorkspaceFormComponent();
    LoadWorkspaceItemFormComponent();
    LoadDatasetFormComponent();
    LoadDatasetItemFormComponent();
    LoadConversationDetailFormComponent();
    LoadConversationFormComponent();
    LoadUserNotificationFormComponent();
    LoadSchemaInfoFormComponent();
    LoadCompanyIntegrationRecordMapFormComponent();
    LoadRecordMergeLogFormComponent();
    LoadRecordMergeDeletionLogFormComponent();
    LoadQueryFieldFormComponent();
    LoadQueryCategoryFormComponent();
    LoadQueryFormComponent();
    LoadQueryPermissionFormComponent();
    LoadVectorIndexFormComponent();
    LoadEntityDocumentTypeFormComponent();
    LoadEntityDocumentRunFormComponent();
    LoadVectorDatabaseFormComponent();
    LoadEntityRecordDocumentFormComponent();
    LoadEntityDocumentFormComponent();
    LoadDataContextItemFormComponent();
    LoadDataContextFormComponent();
    LoadUserViewCategoryFormComponent();
    LoadDashboardCategoryFormComponent();
    LoadReportCategoryFormComponent();
    LoadFileStorageProviderFormComponent();
    LoadFileFormComponent();
    LoadFileCategoryFormComponent();
    LoadFileEntityRecordLinkFormComponent();
    LoadVersionInstallationFormComponent();
    LoadDuplicateRunDetailMatchFormComponent();
    LoadEntityDocumentSettingFormComponent();
    LoadEntitySettingFormComponent();
    LoadDuplicateRunFormComponent();
    LoadDuplicateRunDetailFormComponent();
    LoadApplicationSettingFormComponent();
    LoadActionCategoryFormComponent();
    LoadEntityActionFormComponent();
    LoadEntityActionInvocationFormComponent();
    LoadActionAuthorizationFormComponent();
    LoadEntityActionInvocationTypeFormComponent();
    LoadActionFormComponent();
    LoadEntityActionFilterFormComponent();
    LoadActionFilterFormComponent();
    LoadActionContextTypeFormComponent();
    LoadActionResultCodeFormComponent();
    LoadActionContextFormComponent();
    LoadActionExecutionLogFormComponent();
    LoadActionParamFormComponent();
    LoadActionLibraryFormComponent();
    LoadLibraryFormComponent();
    LoadListCategoryFormComponent();
    LoadCommunicationProviderFormComponent();
    LoadCommunicationRunFormComponent();
    LoadCommunicationProviderMessageTypeFormComponent();
    LoadCommunicationLogFormComponent();
    LoadCommunicationBaseMessageTypeFormComponent();
    LoadTemplateFormComponent();
    LoadTemplateCategoryFormComponent();
    LoadTemplateContentFormComponent();
    LoadTemplateParamFormComponent();
    LoadTemplateContentTypeFormComponent();
    LoadRecommendationFormComponent();
    LoadRecommendationProviderFormComponent();
    LoadRecommendationRunFormComponent();
    LoadRecommendationItemFormComponent();
    LoadEntityCommunicationMessageTypeFormComponent();
    LoadEntityCommunicationFieldFormComponent();
    LoadRecordChangeReplayRunFormComponent();
    LoadLibraryItemFormComponent();
    LoadEntityRelationshipDisplayComponentFormComponent();
    LoadEntityActionParamFormComponent();
    LoadCompanyDetailsComponent();
    LoadEmployeeDetailsComponent();
    LoadUserFavoriteDetailsComponent();
    LoadEmployeeCompanyIntegrationDetailsComponent();
    LoadEmployeeRoleDetailsComponent();
    LoadEmployeeSkillDetailsComponent();
    LoadRoleDetailsComponent();
    LoadSkillDetailsComponent();
    LoadIntegrationURLFormatDetailsComponent();
    LoadIntegrationDetailsComponent();
    LoadCompanyIntegrationDetailsComponent();
    LoadEntityFieldDetailsComponent();
    LoadEntityDetailsComponent();
    LoadEntityTopComponent();
    LoadEntityAuditComponent();
    LoadEntityAPIComponent();
    LoadEntityDBComponent();
    LoadEntityUIComponent();
    LoadUserDetailsComponent();
    LoadEntityRelationshipDetailsComponent();
    LoadUserRecordLogDetailsComponent();
    LoadUserViewDetailsComponent();
    LoadCompanyIntegrationRunDetailsComponent();
    LoadCompanyIntegrationRunDetailDetailsComponent();
    LoadErrorLogDetailsComponent();
    LoadApplicationDetailsComponent();
    LoadApplicationEntityDetailsComponent();
    LoadEntityPermissionDetailsComponent();
    LoadUserApplicationEntityDetailsComponent();
    LoadUserApplicationDetailsComponent();
    LoadCompanyIntegrationRunAPILogDetailsComponent();
    LoadListDetailsComponent();
    LoadListDetailDetailsComponent();
    LoadUserViewRunDetailsComponent();
    LoadUserViewRunDetailDetailsComponent();
    LoadWorkflowRunDetailsComponent();
    LoadWorkflowDetailsComponent();
    LoadWorkflowEngineDetailsComponent();
    LoadRecordChangeDetailsComponent();
    LoadUserRoleDetailsComponent();
    LoadRowLevelSecurityFilterDetailsComponent();
    LoadAuditLogDetailsComponent();
    LoadAuthorizationDetailsComponent();
    LoadAuthorizationRoleDetailsComponent();
    LoadAuditLogTypeDetailsComponent();
    LoadEntityFieldValueDetailsComponent();
    LoadAIModelDetailsComponent();
    LoadAIActionDetailsComponent();
    LoadAIModelActionDetailsComponent();
    LoadEntityAIActionDetailsComponent();
    LoadAIModelTypeDetailsComponent();
    LoadQueueTypeDetailsComponent();
    LoadQueueDetailsComponent();
    LoadQueueTaskDetailsComponent();
    LoadDashboardDetailsComponent();
    LoadOutputTriggerTypeDetailsComponent();
    LoadOutputFormatTypeDetailsComponent();
    LoadOutputDeliveryTypeDetailsComponent();
    LoadReportDetailsComponent();
    LoadReportSnapshotDetailsComponent();
    LoadResourceTypeDetailsComponent();
    LoadTagDetailsComponent();
    LoadTaggedItemDetailsComponent();
    LoadWorkspaceDetailsComponent();
    LoadWorkspaceItemDetailsComponent();
    LoadDatasetDetailsComponent();
    LoadDatasetItemDetailsComponent();
    LoadConversationDetailDetailsComponent();
    LoadConversationDetailsComponent();
    LoadUserNotificationDetailsComponent();
    LoadSchemaInfoDetailsComponent();
    LoadCompanyIntegrationRecordMapDetailsComponent();
    LoadRecordMergeLogDetailsComponent();
    LoadRecordMergeDeletionLogDetailsComponent();
    LoadQueryFieldDetailsComponent();
    LoadQueryCategoryDetailsComponent();
    LoadQueryDetailsComponent();
    LoadQueryPermissionDetailsComponent();
    LoadVectorIndexDetailsComponent();
    LoadEntityDocumentTypeDetailsComponent();
    LoadEntityDocumentRunDetailsComponent();
    LoadVectorDatabaseDetailsComponent();
    LoadEntityRecordDocumentDetailsComponent();
    LoadEntityDocumentDetailsComponent();
    LoadDataContextItemDetailsComponent();
    LoadDataContextDetailsComponent();
    LoadUserViewCategoryDetailsComponent();
    LoadDashboardCategoryDetailsComponent();
    LoadReportCategoryDetailsComponent();
    LoadFileStorageProviderDetailsComponent();
    LoadFileDetailsComponent();
    LoadFileCategoryDetailsComponent();
    LoadFileEntityRecordLinkDetailsComponent();
    LoadVersionInstallationDetailsComponent();
    LoadDuplicateRunDetailMatchDetailsComponent();
    LoadEntityDocumentSettingDetailsComponent();
    LoadEntitySettingDetailsComponent();
    LoadDuplicateRunDetailsComponent();
    LoadDuplicateRunDetailDetailsComponent();
    LoadApplicationSettingDetailsComponent();
    LoadActionCategoryDetailsComponent();
    LoadEntityActionDetailsComponent();
    LoadEntityActionInvocationDetailsComponent();
    LoadActionAuthorizationDetailsComponent();
    LoadEntityActionInvocationTypeDetailsComponent();
    LoadActionDetailsComponent();
    LoadActionTopComponent();
    LoadActionCodeComponent();
    LoadEntityActionFilterDetailsComponent();
    LoadActionFilterDetailsComponent();
    LoadActionContextTypeDetailsComponent();
    LoadActionResultCodeDetailsComponent();
    LoadActionContextDetailsComponent();
    LoadActionExecutionLogDetailsComponent();
    LoadActionParamDetailsComponent();
    LoadActionLibraryDetailsComponent();
    LoadLibraryDetailsComponent();
    LoadListCategoryDetailsComponent();
    LoadCommunicationProviderDetailsComponent();
    LoadCommunicationRunDetailsComponent();
    LoadCommunicationProviderMessageTypeDetailsComponent();
    LoadCommunicationLogDetailsComponent();
    LoadCommunicationBaseMessageTypeDetailsComponent();
    LoadTemplateDetailsComponent();
    LoadTemplateCategoryDetailsComponent();
    LoadTemplateContentDetailsComponent();
    LoadTemplateParamDetailsComponent();
    LoadTemplateContentTypeDetailsComponent();
    LoadRecommendationDetailsComponent();
    LoadRecommendationProviderDetailsComponent();
    LoadRecommendationRunDetailsComponent();
    LoadRecommendationItemDetailsComponent();
    LoadEntityCommunicationMessageTypeDetailsComponent();
    LoadEntityCommunicationFieldDetailsComponent();
    LoadRecordChangeReplayRunDetailsComponent();
    LoadLibraryItemDetailsComponent();
    LoadEntityRelationshipDisplayComponentDetailsComponent();
    LoadEntityActionParamDetailsComponent();
}
    