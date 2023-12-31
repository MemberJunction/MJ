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
import { InputsModule } from '@progress/kendo-angular-inputs';
import { DateInputsModule } from '@progress/kendo-angular-dateinputs';
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { LayoutModule } from '@progress/kendo-angular-layout';
import { ExplorerCoreModule } from '@memberjunction/ng-explorer-core';
import { UserViewGridModule } from '@memberjunction/ng-user-view-grid';
import { LinkDirectivesModule } from '@memberjunction/ng-link-directives';

// Import Generated Components
import { CompanyFormComponent, LoadCompanyFormComponent } from "./Entities/Company/company.form.component";
import { EmployeeFormComponent, LoadEmployeeFormComponent } from "./Entities/Employee/employee.form.component";
import { UserFavoriteFormComponent, LoadUserFavoriteFormComponent } from "./Entities/UserFavorite/userfavorite.form.component";
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
import { ApplicationFormComponent, LoadApplicationFormComponent } from "./Entities/Application/application.form.component";
import { ApplicationEntityFormComponent, LoadApplicationEntityFormComponent } from "./Entities/ApplicationEntity/applicationentity.form.component";
import { EntityPermissionFormComponent, LoadEntityPermissionFormComponent } from "./Entities/EntityPermission/entitypermission.form.component";
import { UserApplicationEntityFormComponent, LoadUserApplicationEntityFormComponent } from "./Entities/UserApplicationEntity/userapplicationentity.form.component";
import { UserApplicationFormComponent, LoadUserApplicationFormComponent } from "./Entities/UserApplication/userapplication.form.component";
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
import { ResourceFolderFormComponent, LoadResourceFolderFormComponent } from "./Entities/ResourceFolder/resourcefolder.form.component";
import { SchemaInfoFormComponent, LoadSchemaInfoFormComponent } from "./Entities/SchemaInfo/schemainfo.form.component";
import { CompanyIntegrationRecordMapFormComponent, LoadCompanyIntegrationRecordMapFormComponent } from "./Entities/CompanyIntegrationRecordMap/companyintegrationrecordmap.form.component";
import { RecordMergeLogFormComponent, LoadRecordMergeLogFormComponent } from "./Entities/RecordMergeLog/recordmergelog.form.component";
import { RecordMergeDeletionLogFormComponent, LoadRecordMergeDeletionLogFormComponent } from "./Entities/RecordMergeDeletionLog/recordmergedeletionlog.form.component";
import { CompanyDetailsComponent, LoadCompanyDetailsComponent } from "./Entities/Company/sections/details.component"
import { EmployeeDetailsComponent, LoadEmployeeDetailsComponent } from "./Entities/Employee/sections/details.component"
import { UserFavoriteDetailsComponent, LoadUserFavoriteDetailsComponent } from "./Entities/UserFavorite/sections/details.component"
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
import { ApplicationDetailsComponent, LoadApplicationDetailsComponent } from "./Entities/Application/sections/details.component"
import { ApplicationEntityDetailsComponent, LoadApplicationEntityDetailsComponent } from "./Entities/ApplicationEntity/sections/details.component"
import { EntityPermissionDetailsComponent, LoadEntityPermissionDetailsComponent } from "./Entities/EntityPermission/sections/details.component"
import { UserApplicationEntityDetailsComponent, LoadUserApplicationEntityDetailsComponent } from "./Entities/UserApplicationEntity/sections/details.component"
import { UserApplicationDetailsComponent, LoadUserApplicationDetailsComponent } from "./Entities/UserApplication/sections/details.component"
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
import { ResourceFolderDetailsComponent, LoadResourceFolderDetailsComponent } from "./Entities/ResourceFolder/sections/details.component"
import { SchemaInfoDetailsComponent, LoadSchemaInfoDetailsComponent } from "./Entities/SchemaInfo/sections/details.component"
import { CompanyIntegrationRecordMapDetailsComponent, LoadCompanyIntegrationRecordMapDetailsComponent } from "./Entities/CompanyIntegrationRecordMap/sections/details.component"
import { RecordMergeLogDetailsComponent, LoadRecordMergeLogDetailsComponent } from "./Entities/RecordMergeLog/sections/details.component"
import { RecordMergeDeletionLogDetailsComponent, LoadRecordMergeDeletionLogDetailsComponent } from "./Entities/RecordMergeDeletionLog/sections/details.component"


@NgModule({
declarations: [
    CompanyFormComponent,
    EmployeeFormComponent,
    UserFavoriteFormComponent,
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
    ApplicationFormComponent,
    ApplicationEntityFormComponent,
    EntityPermissionFormComponent,
    UserApplicationEntityFormComponent,
    UserApplicationFormComponent,
    ListFormComponent],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
    InputsModule,
    ButtonsModule,
    DateInputsModule,
    ExplorerCoreModule,
    UserViewGridModule,
    LinkDirectivesModule
],
exports: [
]
})
export class GeneratedForms_SubModule_0 { }



@NgModule({
declarations: [
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
    AuditLogTypeFormComponent,
    EntityFieldValueFormComponent,
    AIModelFormComponent,
    AIActionFormComponent,
    AIModelActionFormComponent,
    EntityAIActionFormComponent,
    AIModelTypeFormComponent,
    QueueTypeFormComponent],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
    InputsModule,
    ButtonsModule,
    DateInputsModule,
    ExplorerCoreModule,
    UserViewGridModule,
    LinkDirectivesModule
],
exports: [
]
})
export class GeneratedForms_SubModule_1 { }



@NgModule({
declarations: [
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
    WorkspaceItemFormComponent,
    DatasetFormComponent,
    DatasetItemFormComponent,
    ConversationDetailFormComponent,
    ConversationFormComponent,
    UserNotificationFormComponent,
    ResourceFolderFormComponent,
    SchemaInfoFormComponent],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
    InputsModule,
    ButtonsModule,
    DateInputsModule,
    ExplorerCoreModule,
    UserViewGridModule,
    LinkDirectivesModule
],
exports: [
]
})
export class GeneratedForms_SubModule_2 { }



@NgModule({
declarations: [
    CompanyIntegrationRecordMapFormComponent,
    RecordMergeLogFormComponent,
    RecordMergeDeletionLogFormComponent,
    CompanyDetailsComponent,
    EmployeeDetailsComponent,
    UserFavoriteDetailsComponent,
    RoleDetailsComponent,
    SkillDetailsComponent,
    IntegrationURLFormatDetailsComponent,
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
    EntityRelationshipDetailsComponent],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
    InputsModule,
    ButtonsModule,
    DateInputsModule,
    ExplorerCoreModule,
    UserViewGridModule,
    LinkDirectivesModule
],
exports: [
]
})
export class GeneratedForms_SubModule_3 { }



@NgModule({
declarations: [
    UserRecordLogDetailsComponent,
    UserViewDetailsComponent,
    ApplicationDetailsComponent,
    ApplicationEntityDetailsComponent,
    EntityPermissionDetailsComponent,
    UserApplicationEntityDetailsComponent,
    UserApplicationDetailsComponent,
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
    AuthorizationRoleDetailsComponent],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
    InputsModule,
    ButtonsModule,
    DateInputsModule,
    ExplorerCoreModule,
    UserViewGridModule,
    LinkDirectivesModule
],
exports: [
]
})
export class GeneratedForms_SubModule_4 { }



@NgModule({
declarations: [
    AuditLogTypeDetailsComponent,
    EntityFieldValueDetailsComponent,
    AIModelDetailsComponent,
    AIActionDetailsComponent,
    AIModelActionDetailsComponent,
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
    WorkspaceDetailsComponent],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
    InputsModule,
    ButtonsModule,
    DateInputsModule,
    ExplorerCoreModule,
    UserViewGridModule,
    LinkDirectivesModule
],
exports: [
]
})
export class GeneratedForms_SubModule_5 { }



@NgModule({
declarations: [
    WorkspaceItemDetailsComponent,
    DatasetDetailsComponent,
    DatasetItemDetailsComponent,
    ConversationDetailDetailsComponent,
    ConversationDetailsComponent,
    UserNotificationDetailsComponent,
    ResourceFolderDetailsComponent,
    SchemaInfoDetailsComponent,
    CompanyIntegrationRecordMapDetailsComponent,
    RecordMergeLogDetailsComponent,
    RecordMergeDeletionLogDetailsComponent],
imports: [
    CommonModule,
    FormsModule,
    LayoutModule,
    InputsModule,
    ButtonsModule,
    DateInputsModule,
    ExplorerCoreModule,
    UserViewGridModule,
    LinkDirectivesModule
],
exports: [
]
})
export class GeneratedForms_SubModule_6 { }



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
    GeneratedForms_SubModule_6
]
})
export class GeneratedFormsModule { }

export function LoadGeneratedForms() {
    // This function doesn't do much, but it calls each generated form's loader function
    // which in turn calls the sections for that generated form. Ultimately, those bits of 
    // code do NOTHING - the point is to prevent the code from being eliminated during tree shaking
    // since it is dynamically instantiated on demand, and the Angular compiler has no way to know that,
    // in production builds tree shaking will eliminate the code unless we do this
    LoadCompanyFormComponent();
    LoadEmployeeFormComponent();
    LoadUserFavoriteFormComponent();
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
    LoadApplicationFormComponent();
    LoadApplicationEntityFormComponent();
    LoadEntityPermissionFormComponent();
    LoadUserApplicationEntityFormComponent();
    LoadUserApplicationFormComponent();
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
    LoadResourceFolderFormComponent();
    LoadSchemaInfoFormComponent();
    LoadCompanyIntegrationRecordMapFormComponent();
    LoadRecordMergeLogFormComponent();
    LoadRecordMergeDeletionLogFormComponent();
    LoadCompanyDetailsComponent();
    LoadEmployeeDetailsComponent();
    LoadUserFavoriteDetailsComponent();
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
    LoadApplicationDetailsComponent();
    LoadApplicationEntityDetailsComponent();
    LoadEntityPermissionDetailsComponent();
    LoadUserApplicationEntityDetailsComponent();
    LoadUserApplicationDetailsComponent();
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
    LoadResourceFolderDetailsComponent();
    LoadSchemaInfoDetailsComponent();
    LoadCompanyIntegrationRecordMapDetailsComponent();
    LoadRecordMergeLogDetailsComponent();
    LoadRecordMergeDeletionLogDetailsComponent();
}
