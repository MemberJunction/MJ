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
import { MJAccessControlRuleFormComponent } from "./Entities/MJAccessControlRule/mjaccesscontrolrule.form.component";
import { MJActionAuthorizationFormComponent } from "./Entities/MJActionAuthorization/mjactionauthorization.form.component";
import { MJActionCategoryFormComponent } from "./Entities/MJActionCategory/mjactioncategory.form.component";
import { MJActionContextTypeFormComponent } from "./Entities/MJActionContextType/mjactioncontexttype.form.component";
import { MJActionContextFormComponent } from "./Entities/MJActionContext/mjactioncontext.form.component";
import { MJActionExecutionLogFormComponent } from "./Entities/MJActionExecutionLog/mjactionexecutionlog.form.component";
import { MJActionFilterFormComponent } from "./Entities/MJActionFilter/mjactionfilter.form.component";
import { MJActionLibraryFormComponent } from "./Entities/MJActionLibrary/mjactionlibrary.form.component";
import { MJActionParamFormComponent } from "./Entities/MJActionParam/mjactionparam.form.component";
import { MJActionResultCodeFormComponent } from "./Entities/MJActionResultCode/mjactionresultcode.form.component";
import { MJActionFormComponent } from "./Entities/MJAction/mjaction.form.component";
import { MJAIActionFormComponent } from "./Entities/MJAIAction/mjaiaction.form.component";
import { MJAIAgentActionFormComponent } from "./Entities/MJAIAgentAction/mjaiagentaction.form.component";
import { MJAIAgentArtifactTypeFormComponent } from "./Entities/MJAIAgentArtifactType/mjaiagentartifacttype.form.component";
import { MJAIAgentConfigurationFormComponent } from "./Entities/MJAIAgentConfiguration/mjaiagentconfiguration.form.component";
import { MJAIAgentDataSourceFormComponent } from "./Entities/MJAIAgentDataSource/mjaiagentdatasource.form.component";
import { MJAIAgentExampleFormComponent } from "./Entities/MJAIAgentExample/mjaiagentexample.form.component";
import { MJAIAgentLearningCycleFormComponent } from "./Entities/MJAIAgentLearningCycle/mjaiagentlearningcycle.form.component";
import { MJAIAgentModalityFormComponent } from "./Entities/MJAIAgentModality/mjaiagentmodality.form.component";
import { MJAIAgentModelFormComponent } from "./Entities/MJAIAgentModel/mjaiagentmodel.form.component";
import { MJAIAgentNoteTypeFormComponent } from "./Entities/MJAIAgentNoteType/mjaiagentnotetype.form.component";
import { MJAIAgentNoteFormComponent } from "./Entities/MJAIAgentNote/mjaiagentnote.form.component";
import { MJAIAgentPermissionFormComponent } from "./Entities/MJAIAgentPermission/mjaiagentpermission.form.component";
import { MJAIAgentPromptFormComponent } from "./Entities/MJAIAgentPrompt/mjaiagentprompt.form.component";
import { MJAIAgentRelationshipFormComponent } from "./Entities/MJAIAgentRelationship/mjaiagentrelationship.form.component";
import { MJAIAgentRequestFormComponent } from "./Entities/MJAIAgentRequest/mjaiagentrequest.form.component";
import { MJAIAgentRunMediaFormComponent } from "./Entities/MJAIAgentRunMedia/mjaiagentrunmedia.form.component";
import { MJAIAgentRunStepFormComponent } from "./Entities/MJAIAgentRunStep/mjaiagentrunstep.form.component";
import { MJAIAgentRunFormComponent } from "./Entities/MJAIAgentRun/mjaiagentrun.form.component";
import { MJAIAgentStepPathFormComponent } from "./Entities/MJAIAgentStepPath/mjaiagentsteppath.form.component";
import { MJAIAgentStepFormComponent } from "./Entities/MJAIAgentStep/mjaiagentstep.form.component";
import { MJAIAgentTypeFormComponent } from "./Entities/MJAIAgentType/mjaiagenttype.form.component";
import { MJAIAgentFormComponent } from "./Entities/MJAIAgent/mjaiagent.form.component";
import { MJAIArchitectureFormComponent } from "./Entities/MJAIArchitecture/mjaiarchitecture.form.component";
import { MJAIConfigurationParamFormComponent } from "./Entities/MJAIConfigurationParam/mjaiconfigurationparam.form.component";
import { MJAIConfigurationFormComponent } from "./Entities/MJAIConfiguration/mjaiconfiguration.form.component";
import { MJAICredentialBindingFormComponent } from "./Entities/MJAICredentialBinding/mjaicredentialbinding.form.component";
import { MJAIModalityFormComponent } from "./Entities/MJAIModality/mjaimodality.form.component";
import { MJAIModelActionFormComponent } from "./Entities/MJAIModelAction/mjaimodelaction.form.component";
import { MJAIModelArchitectureFormComponent } from "./Entities/MJAIModelArchitecture/mjaimodelarchitecture.form.component";
import { MJAIModelCostFormComponent } from "./Entities/MJAIModelCost/mjaimodelcost.form.component";
import { MJAIModelModalityFormComponent } from "./Entities/MJAIModelModality/mjaimodelmodality.form.component";
import { MJAIModelPriceTypeFormComponent } from "./Entities/MJAIModelPriceType/mjaimodelpricetype.form.component";
import { MJAIModelPriceUnitTypeFormComponent } from "./Entities/MJAIModelPriceUnitType/mjaimodelpriceunittype.form.component";
import { MJAIModelTypeFormComponent } from "./Entities/MJAIModelType/mjaimodeltype.form.component";
import { MJAIModelVendorFormComponent } from "./Entities/MJAIModelVendor/mjaimodelvendor.form.component";
import { MJAIModelFormComponent } from "./Entities/MJAIModel/mjaimodel.form.component";
import { MJAIPromptCategoryFormComponent } from "./Entities/MJAIPromptCategory/mjaipromptcategory.form.component";
import { MJAIPromptModelFormComponent } from "./Entities/MJAIPromptModel/mjaipromptmodel.form.component";
import { MJAIPromptRunMediaFormComponent } from "./Entities/MJAIPromptRunMedia/mjaipromptrunmedia.form.component";
import { MJAIPromptRunFormComponent } from "./Entities/MJAIPromptRun/mjaipromptrun.form.component";
import { MJAIPromptTypeFormComponent } from "./Entities/MJAIPromptType/mjaiprompttype.form.component";
import { MJAIPromptFormComponent } from "./Entities/MJAIPrompt/mjaiprompt.form.component";
import { MJAIResultCacheFormComponent } from "./Entities/MJAIResultCache/mjairesultcache.form.component";
import { MJAIVendorTypeDefinitionFormComponent } from "./Entities/MJAIVendorTypeDefinition/mjaivendortypedefinition.form.component";
import { MJAIVendorTypeFormComponent } from "./Entities/MJAIVendorType/mjaivendortype.form.component";
import { MJAIVendorFormComponent } from "./Entities/MJAIVendor/mjaivendor.form.component";
import { MJAPIApplicationScopeFormComponent } from "./Entities/MJAPIApplicationScope/mjapiapplicationscope.form.component";
import { MJAPIApplicationFormComponent } from "./Entities/MJAPIApplication/mjapiapplication.form.component";
import { MJAPIKeyApplicationFormComponent } from "./Entities/MJAPIKeyApplication/mjapikeyapplication.form.component";
import { MJAPIKeyScopeFormComponent } from "./Entities/MJAPIKeyScope/mjapikeyscope.form.component";
import { MJAPIKeyUsageLogFormComponent } from "./Entities/MJAPIKeyUsageLog/mjapikeyusagelog.form.component";
import { MJAPIKeyFormComponent } from "./Entities/MJAPIKey/mjapikey.form.component";
import { MJAPIScopeFormComponent } from "./Entities/MJAPIScope/mjapiscope.form.component";
import { MJApplicationEntityFormComponent } from "./Entities/MJApplicationEntity/mjapplicationentity.form.component";
import { MJApplicationSettingFormComponent } from "./Entities/MJApplicationSetting/mjapplicationsetting.form.component";
import { MJApplicationFormComponent } from "./Entities/MJApplication/mjapplication.form.component";
import { MJArtifactPermissionFormComponent } from "./Entities/MJArtifactPermission/mjartifactpermission.form.component";
import { MJArtifactTypeFormComponent } from "./Entities/MJArtifactType/mjartifacttype.form.component";
import { MJArtifactUseFormComponent } from "./Entities/MJArtifactUse/mjartifactuse.form.component";
import { MJArtifactVersionAttributeFormComponent } from "./Entities/MJArtifactVersionAttribute/mjartifactversionattribute.form.component";
import { MJArtifactVersionFormComponent } from "./Entities/MJArtifactVersion/mjartifactversion.form.component";
import { MJArtifactFormComponent } from "./Entities/MJArtifact/mjartifact.form.component";
import { MJAuditLogTypeFormComponent } from "./Entities/MJAuditLogType/mjauditlogtype.form.component";
import { MJAuditLogFormComponent } from "./Entities/MJAuditLog/mjauditlog.form.component";
import { MJAuthorizationRoleFormComponent } from "./Entities/MJAuthorizationRole/mjauthorizationrole.form.component";
import { MJAuthorizationFormComponent } from "./Entities/MJAuthorization/mjauthorization.form.component";
import { MJCollectionArtifactFormComponent } from "./Entities/MJCollectionArtifact/mjcollectionartifact.form.component";
import { MJCollectionPermissionFormComponent } from "./Entities/MJCollectionPermission/mjcollectionpermission.form.component";
import { MJCollectionFormComponent } from "./Entities/MJCollection/mjcollection.form.component";
import { MJCommunicationBaseMessageTypeFormComponent } from "./Entities/MJCommunicationBaseMessageType/mjcommunicationbasemessagetype.form.component";
import { MJCommunicationLogFormComponent } from "./Entities/MJCommunicationLog/mjcommunicationlog.form.component";
import { MJCommunicationProviderMessageTypeFormComponent } from "./Entities/MJCommunicationProviderMessageType/mjcommunicationprovidermessagetype.form.component";
import { MJCommunicationProviderFormComponent } from "./Entities/MJCommunicationProvider/mjcommunicationprovider.form.component";
import { MJCommunicationRunFormComponent } from "./Entities/MJCommunicationRun/mjcommunicationrun.form.component";
import { MJCompanyFormComponent } from "./Entities/MJCompany/mjcompany.form.component";
import { MJCompanyIntegrationRecordMapFormComponent } from "./Entities/MJCompanyIntegrationRecordMap/mjcompanyintegrationrecordmap.form.component";
import { MJCompanyIntegrationRunAPILogFormComponent } from "./Entities/MJCompanyIntegrationRunAPILog/mjcompanyintegrationrunapilog.form.component";
import { MJCompanyIntegrationRunDetailFormComponent } from "./Entities/MJCompanyIntegrationRunDetail/mjcompanyintegrationrundetail.form.component";
import { MJCompanyIntegrationRunFormComponent } from "./Entities/MJCompanyIntegrationRun/mjcompanyintegrationrun.form.component";
import { MJCompanyIntegrationFormComponent } from "./Entities/MJCompanyIntegration/mjcompanyintegration.form.component";
import { MJComponentDependencyFormComponent } from "./Entities/MJComponentDependency/mjcomponentdependency.form.component";
import { MJComponentLibraryFormComponent } from "./Entities/MJComponentLibrary/mjcomponentlibrary.form.component";
import { MJComponentLibraryLinkFormComponent } from "./Entities/MJComponentLibraryLink/mjcomponentlibrarylink.form.component";
import { MJComponentRegistryFormComponent } from "./Entities/MJComponentRegistry/mjcomponentregistry.form.component";
import { MJComponentFormComponent } from "./Entities/MJComponent/mjcomponent.form.component";
import { MJContentFileTypeFormComponent } from "./Entities/MJContentFileType/mjcontentfiletype.form.component";
import { MJContentItemAttributeFormComponent } from "./Entities/MJContentItemAttribute/mjcontentitemattribute.form.component";
import { MJContentItemTagFormComponent } from "./Entities/MJContentItemTag/mjcontentitemtag.form.component";
import { MJContentItemFormComponent } from "./Entities/MJContentItem/mjcontentitem.form.component";
import { MJContentProcessRunFormComponent } from "./Entities/MJContentProcessRun/mjcontentprocessrun.form.component";
import { MJContentSourceParamFormComponent } from "./Entities/MJContentSourceParam/mjcontentsourceparam.form.component";
import { MJContentSourceTypeParamFormComponent } from "./Entities/MJContentSourceTypeParam/mjcontentsourcetypeparam.form.component";
import { MJContentSourceTypeFormComponent } from "./Entities/MJContentSourceType/mjcontentsourcetype.form.component";
import { MJContentSourceFormComponent } from "./Entities/MJContentSource/mjcontentsource.form.component";
import { MJContentTypeAttributeFormComponent } from "./Entities/MJContentTypeAttribute/mjcontenttypeattribute.form.component";
import { MJContentTypeFormComponent } from "./Entities/MJContentType/mjcontenttype.form.component";
import { MJConversationArtifactPermissionFormComponent } from "./Entities/MJConversationArtifactPermission/mjconversationartifactpermission.form.component";
import { MJConversationArtifactVersionFormComponent } from "./Entities/MJConversationArtifactVersion/mjconversationartifactversion.form.component";
import { MJConversationArtifactFormComponent } from "./Entities/MJConversationArtifact/mjconversationartifact.form.component";
import { MJConversationDetailArtifactFormComponent } from "./Entities/MJConversationDetailArtifact/mjconversationdetailartifact.form.component";
import { MJConversationDetailAttachmentFormComponent } from "./Entities/MJConversationDetailAttachment/mjconversationdetailattachment.form.component";
import { MJConversationDetailRatingFormComponent } from "./Entities/MJConversationDetailRating/mjconversationdetailrating.form.component";
import { MJConversationDetailFormComponent } from "./Entities/MJConversationDetail/mjconversationdetail.form.component";
import { MJConversationFormComponent } from "./Entities/MJConversation/mjconversation.form.component";
import { MJCredentialCategoryFormComponent } from "./Entities/MJCredentialCategory/mjcredentialcategory.form.component";
import { MJCredentialTypeFormComponent } from "./Entities/MJCredentialType/mjcredentialtype.form.component";
import { MJCredentialFormComponent } from "./Entities/MJCredential/mjcredential.form.component";
import { MJDashboardCategoryFormComponent } from "./Entities/MJDashboardCategory/mjdashboardcategory.form.component";
import { MJDashboardCategoryLinkFormComponent } from "./Entities/MJDashboardCategoryLink/mjdashboardcategorylink.form.component";
import { MJDashboardCategoryPermissionFormComponent } from "./Entities/MJDashboardCategoryPermission/mjdashboardcategorypermission.form.component";
import { MJDashboardPartTypeFormComponent } from "./Entities/MJDashboardPartType/mjdashboardparttype.form.component";
import { MJDashboardPermissionFormComponent } from "./Entities/MJDashboardPermission/mjdashboardpermission.form.component";
import { MJDashboardUserPreferenceFormComponent } from "./Entities/MJDashboardUserPreference/mjdashboarduserpreference.form.component";
import { MJDashboardUserStateFormComponent } from "./Entities/MJDashboardUserState/mjdashboarduserstate.form.component";
import { MJDashboardFormComponent } from "./Entities/MJDashboard/mjdashboard.form.component";
import { MJDataContextItemFormComponent } from "./Entities/MJDataContextItem/mjdatacontextitem.form.component";
import { MJDataContextFormComponent } from "./Entities/MJDataContext/mjdatacontext.form.component";
import { MJDatasetItemFormComponent } from "./Entities/MJDatasetItem/mjdatasetitem.form.component";
import { MJDatasetFormComponent } from "./Entities/MJDataset/mjdataset.form.component";
import { MJDuplicateRunDetailMatchFormComponent } from "./Entities/MJDuplicateRunDetailMatch/mjduplicaterundetailmatch.form.component";
import { MJDuplicateRunDetailFormComponent } from "./Entities/MJDuplicateRunDetail/mjduplicaterundetail.form.component";
import { MJDuplicateRunFormComponent } from "./Entities/MJDuplicateRun/mjduplicaterun.form.component";
import { MJEmployeeCompanyIntegrationFormComponent } from "./Entities/MJEmployeeCompanyIntegration/mjemployeecompanyintegration.form.component";
import { MJEmployeeRoleFormComponent } from "./Entities/MJEmployeeRole/mjemployeerole.form.component";
import { MJEmployeeSkillFormComponent } from "./Entities/MJEmployeeSkill/mjemployeeskill.form.component";
import { MJEmployeeFormComponent } from "./Entities/MJEmployee/mjemployee.form.component";
import { MJEncryptionAlgorithmFormComponent } from "./Entities/MJEncryptionAlgorithm/mjencryptionalgorithm.form.component";
import { MJEncryptionKeySourceFormComponent } from "./Entities/MJEncryptionKeySource/mjencryptionkeysource.form.component";
import { MJEncryptionKeyFormComponent } from "./Entities/MJEncryptionKey/mjencryptionkey.form.component";
import { MJEntityFormComponent } from "./Entities/MJEntity/mjentity.form.component";
import { MJEntityActionFilterFormComponent } from "./Entities/MJEntityActionFilter/mjentityactionfilter.form.component";
import { MJEntityActionInvocationTypeFormComponent } from "./Entities/MJEntityActionInvocationType/mjentityactioninvocationtype.form.component";
import { MJEntityActionInvocationFormComponent } from "./Entities/MJEntityActionInvocation/mjentityactioninvocation.form.component";
import { MJEntityActionParamFormComponent } from "./Entities/MJEntityActionParam/mjentityactionparam.form.component";
import { MJEntityActionFormComponent } from "./Entities/MJEntityAction/mjentityaction.form.component";
import { MJEntityAIActionFormComponent } from "./Entities/MJEntityAIAction/mjentityaiaction.form.component";
import { MJEntityCommunicationFieldFormComponent } from "./Entities/MJEntityCommunicationField/mjentitycommunicationfield.form.component";
import { MJEntityCommunicationMessageTypeFormComponent } from "./Entities/MJEntityCommunicationMessageType/mjentitycommunicationmessagetype.form.component";
import { MJEntityDocumentRunFormComponent } from "./Entities/MJEntityDocumentRun/mjentitydocumentrun.form.component";
import { MJEntityDocumentSettingFormComponent } from "./Entities/MJEntityDocumentSetting/mjentitydocumentsetting.form.component";
import { MJEntityDocumentTypeFormComponent } from "./Entities/MJEntityDocumentType/mjentitydocumenttype.form.component";
import { MJEntityDocumentFormComponent } from "./Entities/MJEntityDocument/mjentitydocument.form.component";
import { MJEntityFieldValueFormComponent } from "./Entities/MJEntityFieldValue/mjentityfieldvalue.form.component";
import { MJEntityFieldFormComponent } from "./Entities/MJEntityField/mjentityfield.form.component";
import { MJEntityPermissionFormComponent } from "./Entities/MJEntityPermission/mjentitypermission.form.component";
import { MJEntityRecordDocumentFormComponent } from "./Entities/MJEntityRecordDocument/mjentityrecorddocument.form.component";
import { MJEntityRelationshipDisplayComponentFormComponent } from "./Entities/MJEntityRelationshipDisplayComponent/mjentityrelationshipdisplaycomponent.form.component";
import { MJEntityRelationshipFormComponent } from "./Entities/MJEntityRelationship/mjentityrelationship.form.component";
import { MJEntitySettingFormComponent } from "./Entities/MJEntitySetting/mjentitysetting.form.component";
import { MJEnvironmentFormComponent } from "./Entities/MJEnvironment/mjenvironment.form.component";
import { MJErrorLogFormComponent } from "./Entities/MJErrorLog/mjerrorlog.form.component";
import { MJExplorerNavigationItemFormComponent } from "./Entities/MJExplorerNavigationItem/mjexplorernavigationitem.form.component";
import { MJFileCategoryFormComponent } from "./Entities/MJFileCategory/mjfilecategory.form.component";
import { MJFileEntityRecordLinkFormComponent } from "./Entities/MJFileEntityRecordLink/mjfileentityrecordlink.form.component";
import { MJFileStorageAccountFormComponent } from "./Entities/MJFileStorageAccount/mjfilestorageaccount.form.component";
import { MJFileStorageProviderFormComponent } from "./Entities/MJFileStorageProvider/mjfilestorageprovider.form.component";
import { MJFileFormComponent } from "./Entities/MJFile/mjfile.form.component";
import { MJGeneratedCodeCategoryFormComponent } from "./Entities/MJGeneratedCodeCategory/mjgeneratedcodecategory.form.component";
import { MJGeneratedCodeFormComponent } from "./Entities/MJGeneratedCode/mjgeneratedcode.form.component";
import { MJIntegrationURLFormatFormComponent } from "./Entities/MJIntegrationURLFormat/mjintegrationurlformat.form.component";
import { MJIntegrationFormComponent } from "./Entities/MJIntegration/mjintegration.form.component";
import { MJLibraryFormComponent } from "./Entities/MJLibrary/mjlibrary.form.component";
import { MJLibraryItemFormComponent } from "./Entities/MJLibraryItem/mjlibraryitem.form.component";
import { MJListCategoryFormComponent } from "./Entities/MJListCategory/mjlistcategory.form.component";
import { MJListDetailFormComponent } from "./Entities/MJListDetail/mjlistdetail.form.component";
import { MJListInvitationFormComponent } from "./Entities/MJListInvitation/mjlistinvitation.form.component";
import { MJListShareFormComponent } from "./Entities/MJListShare/mjlistshare.form.component";
import { MJListFormComponent } from "./Entities/MJList/mjlist.form.component";
import { MJMCPServerConnectionPermissionFormComponent } from "./Entities/MJMCPServerConnectionPermission/mjmcpserverconnectionpermission.form.component";
import { MJMCPServerConnectionToolFormComponent } from "./Entities/MJMCPServerConnectionTool/mjmcpserverconnectiontool.form.component";
import { MJMCPServerConnectionFormComponent } from "./Entities/MJMCPServerConnection/mjmcpserverconnection.form.component";
import { MJMCPServerToolFormComponent } from "./Entities/MJMCPServerTool/mjmcpservertool.form.component";
import { MJMCPServerFormComponent } from "./Entities/MJMCPServer/mjmcpserver.form.component";
import { MJMCPToolExecutionLogFormComponent } from "./Entities/MJMCPToolExecutionLog/mjmcptoolexecutionlog.form.component";
import { MJOAuthAuthServerMetadataCacheFormComponent } from "./Entities/MJOAuthAuthServerMetadataCache/mjoauthauthservermetadatacache.form.component";
import { MJOAuthAuthorizationStateFormComponent } from "./Entities/MJOAuthAuthorizationState/mjoauthauthorizationstate.form.component";
import { MJOAuthClientRegistrationFormComponent } from "./Entities/MJOAuthClientRegistration/mjoauthclientregistration.form.component";
import { MJOAuthTokenFormComponent } from "./Entities/MJOAuthToken/mjoauthtoken.form.component";
import { MJOpenAppDependencyFormComponent } from "./Entities/MJOpenAppDependency/mjopenappdependency.form.component";
import { MJOpenAppInstallHistoryFormComponent } from "./Entities/MJOpenAppInstallHistory/mjopenappinstallhistory.form.component";
import { MJOpenAppFormComponent } from "./Entities/MJOpenApp/mjopenapp.form.component";
import { MJOutputDeliveryTypeFormComponent } from "./Entities/MJOutputDeliveryType/mjoutputdeliverytype.form.component";
import { MJOutputFormatTypeFormComponent } from "./Entities/MJOutputFormatType/mjoutputformattype.form.component";
import { MJOutputTriggerTypeFormComponent } from "./Entities/MJOutputTriggerType/mjoutputtriggertype.form.component";
import { MJProjectFormComponent } from "./Entities/MJProject/mjproject.form.component";
import { MJPublicLinkFormComponent } from "./Entities/MJPublicLink/mjpubliclink.form.component";
import { MJQueryFormComponent } from "./Entities/MJQuery/mjquery.form.component";
import { MJQueryCategoryFormComponent } from "./Entities/MJQueryCategory/mjquerycategory.form.component";
import { MJQueryEntityFormComponent } from "./Entities/MJQueryEntity/mjqueryentity.form.component";
import { MJQueryFieldFormComponent } from "./Entities/MJQueryField/mjqueryfield.form.component";
import { MJQueryParameterFormComponent } from "./Entities/MJQueryParameter/mjqueryparameter.form.component";
import { MJQueryPermissionFormComponent } from "./Entities/MJQueryPermission/mjquerypermission.form.component";
import { MJQueueTaskFormComponent } from "./Entities/MJQueueTask/mjqueuetask.form.component";
import { MJQueueTypeFormComponent } from "./Entities/MJQueueType/mjqueuetype.form.component";
import { MJQueueFormComponent } from "./Entities/MJQueue/mjqueue.form.component";
import { MJRecommendationItemFormComponent } from "./Entities/MJRecommendationItem/mjrecommendationitem.form.component";
import { MJRecommendationProviderFormComponent } from "./Entities/MJRecommendationProvider/mjrecommendationprovider.form.component";
import { MJRecommendationRunFormComponent } from "./Entities/MJRecommendationRun/mjrecommendationrun.form.component";
import { MJRecommendationFormComponent } from "./Entities/MJRecommendation/mjrecommendation.form.component";
import { MJRecordChangeReplayRunFormComponent } from "./Entities/MJRecordChangeReplayRun/mjrecordchangereplayrun.form.component";
import { MJRecordChangeFormComponent } from "./Entities/MJRecordChange/mjrecordchange.form.component";
import { MJRecordLinkFormComponent } from "./Entities/MJRecordLink/mjrecordlink.form.component";
import { MJRecordMergeDeletionLogFormComponent } from "./Entities/MJRecordMergeDeletionLog/mjrecordmergedeletionlog.form.component";
import { MJRecordMergeLogFormComponent } from "./Entities/MJRecordMergeLog/mjrecordmergelog.form.component";
import { MJReportCategoryFormComponent } from "./Entities/MJReportCategory/mjreportcategory.form.component";
import { MJReportSnapshotFormComponent } from "./Entities/MJReportSnapshot/mjreportsnapshot.form.component";
import { MJReportUserStateFormComponent } from "./Entities/MJReportUserState/mjreportuserstate.form.component";
import { MJReportVersionFormComponent } from "./Entities/MJReportVersion/mjreportversion.form.component";
import { MJReportFormComponent } from "./Entities/MJReport/mjreport.form.component";
import { MJResourceLinkFormComponent } from "./Entities/MJResourceLink/mjresourcelink.form.component";
import { MJResourcePermissionFormComponent } from "./Entities/MJResourcePermission/mjresourcepermission.form.component";
import { MJResourceTypeFormComponent } from "./Entities/MJResourceType/mjresourcetype.form.component";
import { MJRoleFormComponent } from "./Entities/MJRole/mjrole.form.component";
import { MJRowLevelSecurityFilterFormComponent } from "./Entities/MJRowLevelSecurityFilter/mjrowlevelsecurityfilter.form.component";
import { MJScheduledActionParamFormComponent } from "./Entities/MJScheduledActionParam/mjscheduledactionparam.form.component";
import { MJScheduledActionFormComponent } from "./Entities/MJScheduledAction/mjscheduledaction.form.component";
import { MJScheduledJobRunFormComponent } from "./Entities/MJScheduledJobRun/mjscheduledjobrun.form.component";
import { MJScheduledJobTypeFormComponent } from "./Entities/MJScheduledJobType/mjscheduledjobtype.form.component";
import { MJScheduledJobFormComponent } from "./Entities/MJScheduledJob/mjscheduledjob.form.component";
import { MJSchemaInfoFormComponent } from "./Entities/MJSchemaInfo/mjschemainfo.form.component";
import { MJSkillFormComponent } from "./Entities/MJSkill/mjskill.form.component";
import { MJTaggedItemFormComponent } from "./Entities/MJTaggedItem/mjtaggeditem.form.component";
import { MJTagFormComponent } from "./Entities/MJTag/mjtag.form.component";
import { MJTaskDependencyFormComponent } from "./Entities/MJTaskDependency/mjtaskdependency.form.component";
import { MJTaskTypeFormComponent } from "./Entities/MJTaskType/mjtasktype.form.component";
import { MJTaskFormComponent } from "./Entities/MJTask/mjtask.form.component";
import { MJTemplateCategoryFormComponent } from "./Entities/MJTemplateCategory/mjtemplatecategory.form.component";
import { MJTemplateContentTypeFormComponent } from "./Entities/MJTemplateContentType/mjtemplatecontenttype.form.component";
import { MJTemplateContentFormComponent } from "./Entities/MJTemplateContent/mjtemplatecontent.form.component";
import { MJTemplateParamFormComponent } from "./Entities/MJTemplateParam/mjtemplateparam.form.component";
import { MJTemplateFormComponent } from "./Entities/MJTemplate/mjtemplate.form.component";
import { MJTestRubricFormComponent } from "./Entities/MJTestRubric/mjtestrubric.form.component";
import { MJTestRunFeedbackFormComponent } from "./Entities/MJTestRunFeedback/mjtestrunfeedback.form.component";
import { MJTestRunOutputTypeFormComponent } from "./Entities/MJTestRunOutputType/mjtestrunoutputtype.form.component";
import { MJTestRunOutputFormComponent } from "./Entities/MJTestRunOutput/mjtestrunoutput.form.component";
import { MJTestRunFormComponent } from "./Entities/MJTestRun/mjtestrun.form.component";
import { MJTestSuiteRunFormComponent } from "./Entities/MJTestSuiteRun/mjtestsuiterun.form.component";
import { MJTestSuiteTestFormComponent } from "./Entities/MJTestSuiteTest/mjtestsuitetest.form.component";
import { MJTestSuiteFormComponent } from "./Entities/MJTestSuite/mjtestsuite.form.component";
import { MJTestTypeFormComponent } from "./Entities/MJTestType/mjtesttype.form.component";
import { MJTestFormComponent } from "./Entities/MJTest/mjtest.form.component";
import { MJUserApplicationEntityFormComponent } from "./Entities/MJUserApplicationEntity/mjuserapplicationentity.form.component";
import { MJUserApplicationFormComponent } from "./Entities/MJUserApplication/mjuserapplication.form.component";
import { MJUserFavoriteFormComponent } from "./Entities/MJUserFavorite/mjuserfavorite.form.component";
import { MJUserNotificationPreferenceFormComponent } from "./Entities/MJUserNotificationPreference/mjusernotificationpreference.form.component";
import { MJUserNotificationTypeFormComponent } from "./Entities/MJUserNotificationType/mjusernotificationtype.form.component";
import { MJUserNotificationFormComponent } from "./Entities/MJUserNotification/mjusernotification.form.component";
import { MJUserRecordLogFormComponent } from "./Entities/MJUserRecordLog/mjuserrecordlog.form.component";
import { MJUserRoleFormComponent } from "./Entities/MJUserRole/mjuserrole.form.component";
import { MJUserSettingFormComponent } from "./Entities/MJUserSetting/mjusersetting.form.component";
import { MJUserViewCategoryFormComponent } from "./Entities/MJUserViewCategory/mjuserviewcategory.form.component";
import { MJUserViewRunDetailFormComponent } from "./Entities/MJUserViewRunDetail/mjuserviewrundetail.form.component";
import { MJUserViewRunFormComponent } from "./Entities/MJUserViewRun/mjuserviewrun.form.component";
import { MJUserViewFormComponent } from "./Entities/MJUserView/mjuserview.form.component";
import { MJUserFormComponent } from "./Entities/MJUser/mjuser.form.component";
import { MJVectorDatabaseFormComponent } from "./Entities/MJVectorDatabase/mjvectordatabase.form.component";
import { MJVectorIndexFormComponent } from "./Entities/MJVectorIndex/mjvectorindex.form.component";
import { MJVersionInstallationFormComponent } from "./Entities/MJVersionInstallation/mjversioninstallation.form.component";
import { MJVersionLabelItemFormComponent } from "./Entities/MJVersionLabelItem/mjversionlabelitem.form.component";
import { MJVersionLabelRestoreFormComponent } from "./Entities/MJVersionLabelRestore/mjversionlabelrestore.form.component";
import { MJVersionLabelFormComponent } from "./Entities/MJVersionLabel/mjversionlabel.form.component";
import { MJWorkflowEngineFormComponent } from "./Entities/MJWorkflowEngine/mjworkflowengine.form.component";
import { MJWorkflowRunFormComponent } from "./Entities/MJWorkflowRun/mjworkflowrun.form.component";
import { MJWorkflowFormComponent } from "./Entities/MJWorkflow/mjworkflow.form.component";
import { MJWorkspaceItemFormComponent } from "./Entities/MJWorkspaceItem/mjworkspaceitem.form.component";
import { MJWorkspaceFormComponent } from "./Entities/MJWorkspace/mjworkspace.form.component";
import { JoinGridModule } from "@memberjunction/ng-join-grid"   

@NgModule({
declarations: [
    MJAccessControlRuleFormComponent,
    MJActionAuthorizationFormComponent,
    MJActionCategoryFormComponent,
    MJActionContextTypeFormComponent,
    MJActionContextFormComponent,
    MJActionExecutionLogFormComponent,
    MJActionFilterFormComponent,
    MJActionLibraryFormComponent,
    MJActionParamFormComponent,
    MJActionResultCodeFormComponent,
    MJActionFormComponent,
    MJAIActionFormComponent,
    MJAIAgentActionFormComponent,
    MJAIAgentArtifactTypeFormComponent,
    MJAIAgentConfigurationFormComponent,
    MJAIAgentDataSourceFormComponent,
    MJAIAgentExampleFormComponent,
    MJAIAgentLearningCycleFormComponent,
    MJAIAgentModalityFormComponent,
    MJAIAgentModelFormComponent],
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
    MJAIAgentNoteTypeFormComponent,
    MJAIAgentNoteFormComponent,
    MJAIAgentPermissionFormComponent,
    MJAIAgentPromptFormComponent,
    MJAIAgentRelationshipFormComponent,
    MJAIAgentRequestFormComponent,
    MJAIAgentRunMediaFormComponent,
    MJAIAgentRunStepFormComponent,
    MJAIAgentRunFormComponent,
    MJAIAgentStepPathFormComponent,
    MJAIAgentStepFormComponent,
    MJAIAgentTypeFormComponent,
    MJAIAgentFormComponent,
    MJAIArchitectureFormComponent,
    MJAIConfigurationParamFormComponent,
    MJAIConfigurationFormComponent,
    MJAICredentialBindingFormComponent,
    MJAIModalityFormComponent,
    MJAIModelActionFormComponent,
    MJAIModelArchitectureFormComponent],
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
    MJAIModelCostFormComponent,
    MJAIModelModalityFormComponent,
    MJAIModelPriceTypeFormComponent,
    MJAIModelPriceUnitTypeFormComponent,
    MJAIModelTypeFormComponent,
    MJAIModelVendorFormComponent,
    MJAIModelFormComponent,
    MJAIPromptCategoryFormComponent,
    MJAIPromptModelFormComponent,
    MJAIPromptRunMediaFormComponent,
    MJAIPromptRunFormComponent,
    MJAIPromptTypeFormComponent,
    MJAIPromptFormComponent,
    MJAIResultCacheFormComponent,
    MJAIVendorTypeDefinitionFormComponent,
    MJAIVendorTypeFormComponent,
    MJAIVendorFormComponent,
    MJAPIApplicationScopeFormComponent,
    MJAPIApplicationFormComponent,
    MJAPIKeyApplicationFormComponent],
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
    MJAPIKeyScopeFormComponent,
    MJAPIKeyUsageLogFormComponent,
    MJAPIKeyFormComponent,
    MJAPIScopeFormComponent,
    MJApplicationEntityFormComponent,
    MJApplicationSettingFormComponent,
    MJApplicationFormComponent,
    MJArtifactPermissionFormComponent,
    MJArtifactTypeFormComponent,
    MJArtifactUseFormComponent,
    MJArtifactVersionAttributeFormComponent,
    MJArtifactVersionFormComponent,
    MJArtifactFormComponent,
    MJAuditLogTypeFormComponent,
    MJAuditLogFormComponent,
    MJAuthorizationRoleFormComponent,
    MJAuthorizationFormComponent,
    MJCollectionArtifactFormComponent,
    MJCollectionPermissionFormComponent,
    MJCollectionFormComponent],
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
    MJCommunicationBaseMessageTypeFormComponent,
    MJCommunicationLogFormComponent,
    MJCommunicationProviderMessageTypeFormComponent,
    MJCommunicationProviderFormComponent,
    MJCommunicationRunFormComponent,
    MJCompanyFormComponent,
    MJCompanyIntegrationRecordMapFormComponent,
    MJCompanyIntegrationRunAPILogFormComponent,
    MJCompanyIntegrationRunDetailFormComponent,
    MJCompanyIntegrationRunFormComponent,
    MJCompanyIntegrationFormComponent,
    MJComponentDependencyFormComponent,
    MJComponentLibraryFormComponent,
    MJComponentLibraryLinkFormComponent,
    MJComponentRegistryFormComponent,
    MJComponentFormComponent,
    MJContentFileTypeFormComponent,
    MJContentItemAttributeFormComponent,
    MJContentItemTagFormComponent,
    MJContentItemFormComponent],
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
    MJContentProcessRunFormComponent,
    MJContentSourceParamFormComponent,
    MJContentSourceTypeParamFormComponent,
    MJContentSourceTypeFormComponent,
    MJContentSourceFormComponent,
    MJContentTypeAttributeFormComponent,
    MJContentTypeFormComponent,
    MJConversationArtifactPermissionFormComponent,
    MJConversationArtifactVersionFormComponent,
    MJConversationArtifactFormComponent,
    MJConversationDetailArtifactFormComponent,
    MJConversationDetailAttachmentFormComponent,
    MJConversationDetailRatingFormComponent,
    MJConversationDetailFormComponent,
    MJConversationFormComponent,
    MJCredentialCategoryFormComponent,
    MJCredentialTypeFormComponent,
    MJCredentialFormComponent,
    MJDashboardCategoryFormComponent,
    MJDashboardCategoryLinkFormComponent],
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
    MJDashboardCategoryPermissionFormComponent,
    MJDashboardPartTypeFormComponent,
    MJDashboardPermissionFormComponent,
    MJDashboardUserPreferenceFormComponent,
    MJDashboardUserStateFormComponent,
    MJDashboardFormComponent,
    MJDataContextItemFormComponent,
    MJDataContextFormComponent,
    MJDatasetItemFormComponent,
    MJDatasetFormComponent,
    MJDuplicateRunDetailMatchFormComponent,
    MJDuplicateRunDetailFormComponent,
    MJDuplicateRunFormComponent,
    MJEmployeeCompanyIntegrationFormComponent,
    MJEmployeeRoleFormComponent,
    MJEmployeeSkillFormComponent,
    MJEmployeeFormComponent,
    MJEncryptionAlgorithmFormComponent,
    MJEncryptionKeySourceFormComponent,
    MJEncryptionKeyFormComponent],
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
    MJEntityFormComponent,
    MJEntityActionFilterFormComponent,
    MJEntityActionInvocationTypeFormComponent,
    MJEntityActionInvocationFormComponent,
    MJEntityActionParamFormComponent,
    MJEntityActionFormComponent,
    MJEntityAIActionFormComponent,
    MJEntityCommunicationFieldFormComponent,
    MJEntityCommunicationMessageTypeFormComponent,
    MJEntityDocumentRunFormComponent,
    MJEntityDocumentSettingFormComponent,
    MJEntityDocumentTypeFormComponent,
    MJEntityDocumentFormComponent,
    MJEntityFieldValueFormComponent,
    MJEntityFieldFormComponent,
    MJEntityPermissionFormComponent,
    MJEntityRecordDocumentFormComponent,
    MJEntityRelationshipDisplayComponentFormComponent,
    MJEntityRelationshipFormComponent,
    MJEntitySettingFormComponent],
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
    MJEnvironmentFormComponent,
    MJErrorLogFormComponent,
    MJExplorerNavigationItemFormComponent,
    MJFileCategoryFormComponent,
    MJFileEntityRecordLinkFormComponent,
    MJFileStorageAccountFormComponent,
    MJFileStorageProviderFormComponent,
    MJFileFormComponent,
    MJGeneratedCodeCategoryFormComponent,
    MJGeneratedCodeFormComponent,
    MJIntegrationURLFormatFormComponent,
    MJIntegrationFormComponent,
    MJLibraryFormComponent,
    MJLibraryItemFormComponent,
    MJListCategoryFormComponent,
    MJListDetailFormComponent,
    MJListInvitationFormComponent,
    MJListShareFormComponent,
    MJListFormComponent,
    MJMCPServerConnectionPermissionFormComponent],
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
    MJMCPServerConnectionToolFormComponent,
    MJMCPServerConnectionFormComponent,
    MJMCPServerToolFormComponent,
    MJMCPServerFormComponent,
    MJMCPToolExecutionLogFormComponent,
    MJOAuthAuthServerMetadataCacheFormComponent,
    MJOAuthAuthorizationStateFormComponent,
    MJOAuthClientRegistrationFormComponent,
    MJOAuthTokenFormComponent,
    MJOpenAppDependencyFormComponent,
    MJOpenAppInstallHistoryFormComponent,
    MJOpenAppFormComponent,
    MJOutputDeliveryTypeFormComponent,
    MJOutputFormatTypeFormComponent,
    MJOutputTriggerTypeFormComponent,
    MJProjectFormComponent,
    MJPublicLinkFormComponent,
    MJQueryFormComponent,
    MJQueryCategoryFormComponent,
    MJQueryEntityFormComponent],
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
    MJQueryFieldFormComponent,
    MJQueryParameterFormComponent,
    MJQueryPermissionFormComponent,
    MJQueueTaskFormComponent,
    MJQueueTypeFormComponent,
    MJQueueFormComponent,
    MJRecommendationItemFormComponent,
    MJRecommendationProviderFormComponent,
    MJRecommendationRunFormComponent,
    MJRecommendationFormComponent,
    MJRecordChangeReplayRunFormComponent,
    MJRecordChangeFormComponent,
    MJRecordLinkFormComponent,
    MJRecordMergeDeletionLogFormComponent,
    MJRecordMergeLogFormComponent,
    MJReportCategoryFormComponent,
    MJReportSnapshotFormComponent,
    MJReportUserStateFormComponent,
    MJReportVersionFormComponent,
    MJReportFormComponent],
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
    MJResourceLinkFormComponent,
    MJResourcePermissionFormComponent,
    MJResourceTypeFormComponent,
    MJRoleFormComponent,
    MJRowLevelSecurityFilterFormComponent,
    MJScheduledActionParamFormComponent,
    MJScheduledActionFormComponent,
    MJScheduledJobRunFormComponent,
    MJScheduledJobTypeFormComponent,
    MJScheduledJobFormComponent,
    MJSchemaInfoFormComponent,
    MJSkillFormComponent,
    MJTaggedItemFormComponent,
    MJTagFormComponent,
    MJTaskDependencyFormComponent,
    MJTaskTypeFormComponent,
    MJTaskFormComponent,
    MJTemplateCategoryFormComponent,
    MJTemplateContentTypeFormComponent,
    MJTemplateContentFormComponent],
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
    MJTemplateParamFormComponent,
    MJTemplateFormComponent,
    MJTestRubricFormComponent,
    MJTestRunFeedbackFormComponent,
    MJTestRunOutputTypeFormComponent,
    MJTestRunOutputFormComponent,
    MJTestRunFormComponent,
    MJTestSuiteRunFormComponent,
    MJTestSuiteTestFormComponent,
    MJTestSuiteFormComponent,
    MJTestTypeFormComponent,
    MJTestFormComponent,
    MJUserApplicationEntityFormComponent,
    MJUserApplicationFormComponent,
    MJUserFavoriteFormComponent,
    MJUserNotificationPreferenceFormComponent,
    MJUserNotificationTypeFormComponent,
    MJUserNotificationFormComponent,
    MJUserRecordLogFormComponent,
    MJUserRoleFormComponent],
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
    MJUserSettingFormComponent,
    MJUserViewCategoryFormComponent,
    MJUserViewRunDetailFormComponent,
    MJUserViewRunFormComponent,
    MJUserViewFormComponent,
    MJUserFormComponent,
    MJVectorDatabaseFormComponent,
    MJVectorIndexFormComponent,
    MJVersionInstallationFormComponent,
    MJVersionLabelItemFormComponent,
    MJVersionLabelRestoreFormComponent,
    MJVersionLabelFormComponent,
    MJWorkflowEngineFormComponent,
    MJWorkflowRunFormComponent,
    MJWorkflowFormComponent,
    MJWorkspaceItemFormComponent,
    MJWorkspaceFormComponent],
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
    