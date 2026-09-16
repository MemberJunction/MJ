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

// Import Generated Components
import { MJAIActionFormComponent } from "./Entities/MJAIAction/mjaiaction.form.component";
import { MJAIAgentActionFormComponent } from "./Entities/MJAIAgentAction/mjaiagentaction.form.component";
import { MJAIAgentArtifactTypeFormComponent } from "./Entities/MJAIAgentArtifactType/mjaiagentartifacttype.form.component";
import { MJAIAgentCategoryFormComponent } from "./Entities/MJAIAgentCategory/mjaiagentcategory.form.component";
import { MJAIAgentChannelFormComponent } from "./Entities/MJAIAgentChannel/mjaiagentchannel.form.component";
import { MJAIAgentClientToolFormComponent } from "./Entities/MJAIAgentClientTool/mjaiagentclienttool.form.component";
import { MJAIAgentCoAgentFormComponent } from "./Entities/MJAIAgentCoAgent/mjaiagentcoagent.form.component";
import { MJAIAgentConfigurationFormComponent } from "./Entities/MJAIAgentConfiguration/mjaiagentconfiguration.form.component";
import { MJAIAgentCredentialFormComponent } from "./Entities/MJAIAgentCredential/mjaiagentcredential.form.component";
import { MJAIAgentDataSourceFormComponent } from "./Entities/MJAIAgentDataSource/mjaiagentdatasource.form.component";
import { MJAIAgentExampleFormComponent } from "./Entities/MJAIAgentExample/mjaiagentexample.form.component";
import { MJAIAgentFormComponent } from "./Entities/MJAIAgent/mjaiagent.form.component";
import { MJAIAgentHarnessFormComponent } from "./Entities/MJAIAgentHarness/mjaiagentharness.form.component";
import { MJAIAgentLearningCycleFormComponent } from "./Entities/MJAIAgentLearningCycle/mjaiagentlearningcycle.form.component";
import { MJAIAgentModalityFormComponent } from "./Entities/MJAIAgentModality/mjaiagentmodality.form.component";
import { MJAIAgentModelFormComponent } from "./Entities/MJAIAgentModel/mjaiagentmodel.form.component";
import { MJAIAgentNoteFormComponent } from "./Entities/MJAIAgentNote/mjaiagentnote.form.component";
import { MJAIAgentNoteTypeFormComponent } from "./Entities/MJAIAgentNoteType/mjaiagentnotetype.form.component";
import { MJAIAgentPermissionFormComponent } from "./Entities/MJAIAgentPermission/mjaiagentpermission.form.component";
import { MJAIAgentPersonaFormComponent } from "./Entities/MJAIAgentPersona/mjaiagentpersona.form.component";
import { MJAIAgentPromptFormComponent } from "./Entities/MJAIAgentPrompt/mjaiagentprompt.form.component";
import { MJAIAgentRelationshipFormComponent } from "./Entities/MJAIAgentRelationship/mjaiagentrelationship.form.component";
import { MJAIAgentRequestFormComponent } from "./Entities/MJAIAgentRequest/mjaiagentrequest.form.component";
import { MJAIAgentRequestTypeFormComponent } from "./Entities/MJAIAgentRequestType/mjaiagentrequesttype.form.component";
import { MJAIAgentRunFormComponent } from "./Entities/MJAIAgentRun/mjaiagentrun.form.component";
import { MJAIAgentRunMediaFormComponent } from "./Entities/MJAIAgentRunMedia/mjaiagentrunmedia.form.component";
import { MJAIAgentRunStepFormComponent } from "./Entities/MJAIAgentRunStep/mjaiagentrunstep.form.component";
import { MJAIAgentSearchScopeFormComponent } from "./Entities/MJAIAgentSearchScope/mjaiagentsearchscope.form.component";
import { MJAIAgentSessionBridgeFormComponent } from "./Entities/MJAIAgentSessionBridge/mjaiagentsessionbridge.form.component";
import { MJAIAgentSessionBridgeParticipantFormComponent } from "./Entities/MJAIAgentSessionBridgeParticipant/mjaiagentsessionbridgeparticipant.form.component";
import { MJAIAgentSessionChannelFormComponent } from "./Entities/MJAIAgentSessionChannel/mjaiagentsessionchannel.form.component";
import { MJAIAgentSessionFormComponent } from "./Entities/MJAIAgentSession/mjaiagentsession.form.component";
import { MJAIAgentSkillFormComponent } from "./Entities/MJAIAgentSkill/mjaiagentskill.form.component";
import { MJAIAgentStepFormComponent } from "./Entities/MJAIAgentStep/mjaiagentstep.form.component";
import { MJAIAgentStepPathFormComponent } from "./Entities/MJAIAgentStepPath/mjaiagentsteppath.form.component";
import { MJAIAgentTypeFormComponent } from "./Entities/MJAIAgentType/mjaiagenttype.form.component";
import { MJAIArchitectureFormComponent } from "./Entities/MJAIArchitecture/mjaiarchitecture.form.component";
import { MJAIBridgeAgentIdentityFormComponent } from "./Entities/MJAIBridgeAgentIdentity/mjaibridgeagentidentity.form.component";
import { MJAIBridgeProviderChannelFormComponent } from "./Entities/MJAIBridgeProviderChannel/mjaibridgeproviderchannel.form.component";
import { MJAIBridgeProviderFormComponent } from "./Entities/MJAIBridgeProvider/mjaibridgeprovider.form.component";
import { MJAIClientToolDefinitionFormComponent } from "./Entities/MJAIClientToolDefinition/mjaiclienttooldefinition.form.component";
import { MJAIConfigurationFormComponent } from "./Entities/MJAIConfiguration/mjaiconfiguration.form.component";
import { MJAIConfigurationParamFormComponent } from "./Entities/MJAIConfigurationParam/mjaiconfigurationparam.form.component";
import { MJAICredentialBindingFormComponent } from "./Entities/MJAICredentialBinding/mjaicredentialbinding.form.component";
import { MJAIModalityFormComponent } from "./Entities/MJAIModality/mjaimodality.form.component";
import { MJAIModelActionFormComponent } from "./Entities/MJAIModelAction/mjaimodelaction.form.component";
import { MJAIModelArchitectureFormComponent } from "./Entities/MJAIModelArchitecture/mjaimodelarchitecture.form.component";
import { MJAIModelCostFormComponent } from "./Entities/MJAIModelCost/mjaimodelcost.form.component";
import { MJAIModelFormComponent } from "./Entities/MJAIModel/mjaimodel.form.component";
import { MJAIModelModalityFormComponent } from "./Entities/MJAIModelModality/mjaimodelmodality.form.component";
import { MJAIModelPersonaFormComponent } from "./Entities/MJAIModelPersona/mjaimodelpersona.form.component";
import { MJAIModelPriceTypeFormComponent } from "./Entities/MJAIModelPriceType/mjaimodelpricetype.form.component";
import { MJAIModelPriceUnitTypeFormComponent } from "./Entities/MJAIModelPriceUnitType/mjaimodelpriceunittype.form.component";
import { MJAIModelTypeFormComponent } from "./Entities/MJAIModelType/mjaimodeltype.form.component";
import { MJAIModelVendorFormComponent } from "./Entities/MJAIModelVendor/mjaimodelvendor.form.component";
import { MJAIPersonaFormComponent } from "./Entities/MJAIPersona/mjaipersona.form.component";
import { MJAIPersonaVendorFormComponent } from "./Entities/MJAIPersonaVendor/mjaipersonavendor.form.component";
import { MJAIPromptCategoryFormComponent } from "./Entities/MJAIPromptCategory/mjaipromptcategory.form.component";
import { MJAIPromptFormComponent } from "./Entities/MJAIPrompt/mjaiprompt.form.component";
import { MJAIPromptModelFormComponent } from "./Entities/MJAIPromptModel/mjaipromptmodel.form.component";
import { MJAIPromptRunFormComponent } from "./Entities/MJAIPromptRun/mjaipromptrun.form.component";
import { MJAIPromptRunMediaFormComponent } from "./Entities/MJAIPromptRunMedia/mjaipromptrunmedia.form.component";
import { MJAIPromptTypeFormComponent } from "./Entities/MJAIPromptType/mjaiprompttype.form.component";
import { MJAIRemoteBrowserProviderFormComponent } from "./Entities/MJAIRemoteBrowserProvider/mjairemotebrowserprovider.form.component";
import { MJAIResultCacheFormComponent } from "./Entities/MJAIResultCache/mjairesultcache.form.component";
import { MJAISkillActionFormComponent } from "./Entities/MJAISkillAction/mjaiskillaction.form.component";
import { MJAISkillFormComponent } from "./Entities/MJAISkill/mjaiskill.form.component";
import { MJAISkillPermissionFormComponent } from "./Entities/MJAISkillPermission/mjaiskillpermission.form.component";
import { MJAISkillSearchScopeFormComponent } from "./Entities/MJAISkillSearchScope/mjaiskillsearchscope.form.component";
import { MJAISkillSubAgentFormComponent } from "./Entities/MJAISkillSubAgent/mjaiskillsubagent.form.component";
import { MJAIUsageTypeFormComponent } from "./Entities/MJAIUsageType/mjaiusagetype.form.component";
import { MJAIVendorFormComponent } from "./Entities/MJAIVendor/mjaivendor.form.component";
import { MJAIVendorTypeDefinitionFormComponent } from "./Entities/MJAIVendorTypeDefinition/mjaivendortypedefinition.form.component";
import { MJAIVendorTypeFormComponent } from "./Entities/MJAIVendorType/mjaivendortype.form.component";
import { MJAPIApplicationFormComponent } from "./Entities/MJAPIApplication/mjapiapplication.form.component";
import { MJAPIApplicationScopeFormComponent } from "./Entities/MJAPIApplicationScope/mjapiapplicationscope.form.component";
import { MJAPIKeyApplicationFormComponent } from "./Entities/MJAPIKeyApplication/mjapikeyapplication.form.component";
import { MJAPIKeyFormComponent } from "./Entities/MJAPIKey/mjapikey.form.component";
import { MJAPIKeyScopeFormComponent } from "./Entities/MJAPIKeyScope/mjapikeyscope.form.component";
import { MJAPIKeyUsageLogFormComponent } from "./Entities/MJAPIKeyUsageLog/mjapikeyusagelog.form.component";
import { MJAPIScopeFormComponent } from "./Entities/MJAPIScope/mjapiscope.form.component";
import { MJAccessControlRuleFormComponent } from "./Entities/MJAccessControlRule/mjaccesscontrolrule.form.component";
import { MJActionAuthorizationFormComponent } from "./Entities/MJActionAuthorization/mjactionauthorization.form.component";
import { MJActionCategoryFormComponent } from "./Entities/MJActionCategory/mjactioncategory.form.component";
import { MJActionContextFormComponent } from "./Entities/MJActionContext/mjactioncontext.form.component";
import { MJActionContextTypeFormComponent } from "./Entities/MJActionContextType/mjactioncontexttype.form.component";
import { MJActionExecutionLogFormComponent } from "./Entities/MJActionExecutionLog/mjactionexecutionlog.form.component";
import { MJActionFilterFormComponent } from "./Entities/MJActionFilter/mjactionfilter.form.component";
import { MJActionFormComponent } from "./Entities/MJAction/mjaction.form.component";
import { MJActionLibraryFormComponent } from "./Entities/MJActionLibrary/mjactionlibrary.form.component";
import { MJActionParamFormComponent } from "./Entities/MJActionParam/mjactionparam.form.component";
import { MJActionResultCodeFormComponent } from "./Entities/MJActionResultCode/mjactionresultcode.form.component";
import { MJApplicationEntityFormComponent } from "./Entities/MJApplicationEntity/mjapplicationentity.form.component";
import { MJApplicationFormComponent } from "./Entities/MJApplication/mjapplication.form.component";
import { MJApplicationRoleFormComponent } from "./Entities/MJApplicationRole/mjapplicationrole.form.component";
import { MJApplicationSettingFormComponent } from "./Entities/MJApplicationSetting/mjapplicationsetting.form.component";
import { MJArchiveConfigurationEntityFormComponent } from "./Entities/MJArchiveConfigurationEntity/mjarchiveconfigurationentity.form.component";
import { MJArchiveConfigurationFormComponent } from "./Entities/MJArchiveConfiguration/mjarchiveconfiguration.form.component";
import { MJArchiveRunDetailFormComponent } from "./Entities/MJArchiveRunDetail/mjarchiverundetail.form.component";
import { MJArchiveRunFormComponent } from "./Entities/MJArchiveRun/mjarchiverun.form.component";
import { MJArtifactFormComponent } from "./Entities/MJArtifact/mjartifact.form.component";
import { MJArtifactPermissionFormComponent } from "./Entities/MJArtifactPermission/mjartifactpermission.form.component";
import { MJArtifactTypeFormComponent } from "./Entities/MJArtifactType/mjartifacttype.form.component";
import { MJArtifactUseFormComponent } from "./Entities/MJArtifactUse/mjartifactuse.form.component";
import { MJArtifactVersionAttributeFormComponent } from "./Entities/MJArtifactVersionAttribute/mjartifactversionattribute.form.component";
import { MJArtifactVersionFormComponent } from "./Entities/MJArtifactVersion/mjartifactversion.form.component";
import { MJAuditLogFormComponent } from "./Entities/MJAuditLog/mjauditlog.form.component";
import { MJAuditLogTypeFormComponent } from "./Entities/MJAuditLogType/mjauditlogtype.form.component";
import { MJAuthenticationProviderFormComponent } from "./Entities/MJAuthenticationProvider/mjauthenticationprovider.form.component";
import { MJAuthorizationFormComponent } from "./Entities/MJAuthorization/mjauthorization.form.component";
import { MJAuthorizationRoleFormComponent } from "./Entities/MJAuthorizationRole/mjauthorizationrole.form.component";
import { MJClusterAnalysisClusterFormComponent } from "./Entities/MJClusterAnalysisCluster/mjclusteranalysiscluster.form.component";
import { MJClusterAnalysisFormComponent } from "./Entities/MJClusterAnalysis/mjclusteranalysis.form.component";
import { MJCollectionArtifactFormComponent } from "./Entities/MJCollectionArtifact/mjcollectionartifact.form.component";
import { MJCollectionFormComponent } from "./Entities/MJCollection/mjcollection.form.component";
import { MJCollectionPermissionFormComponent } from "./Entities/MJCollectionPermission/mjcollectionpermission.form.component";
import { MJCommunicationBaseMessageTypeFormComponent } from "./Entities/MJCommunicationBaseMessageType/mjcommunicationbasemessagetype.form.component";
import { MJCommunicationLogFormComponent } from "./Entities/MJCommunicationLog/mjcommunicationlog.form.component";
import { MJCommunicationProviderFormComponent } from "./Entities/MJCommunicationProvider/mjcommunicationprovider.form.component";
import { MJCommunicationProviderMessageTypeFormComponent } from "./Entities/MJCommunicationProviderMessageType/mjcommunicationprovidermessagetype.form.component";
import { MJCommunicationRunFormComponent } from "./Entities/MJCommunicationRun/mjcommunicationrun.form.component";
import { MJCompanyFormComponent } from "./Entities/MJCompany/mjcompany.form.component";
import { MJCompanyIntegrationEntityMapFormComponent } from "./Entities/MJCompanyIntegrationEntityMap/mjcompanyintegrationentitymap.form.component";
import { MJCompanyIntegrationFieldMapFormComponent } from "./Entities/MJCompanyIntegrationFieldMap/mjcompanyintegrationfieldmap.form.component";
import { MJCompanyIntegrationFormComponent } from "./Entities/MJCompanyIntegration/mjcompanyintegration.form.component";
import { MJCompanyIntegrationRecordMapFormComponent } from "./Entities/MJCompanyIntegrationRecordMap/mjcompanyintegrationrecordmap.form.component";
import { MJCompanyIntegrationRunAPILogFormComponent } from "./Entities/MJCompanyIntegrationRunAPILog/mjcompanyintegrationrunapilog.form.component";
import { MJCompanyIntegrationRunDetailFormComponent } from "./Entities/MJCompanyIntegrationRunDetail/mjcompanyintegrationrundetail.form.component";
import { MJCompanyIntegrationRunFormComponent } from "./Entities/MJCompanyIntegrationRun/mjcompanyintegrationrun.form.component";
import { MJCompanyIntegrationSyncWatermarkFormComponent } from "./Entities/MJCompanyIntegrationSyncWatermark/mjcompanyintegrationsyncwatermark.form.component";
import { MJComponentDependencyFormComponent } from "./Entities/MJComponentDependency/mjcomponentdependency.form.component";
import { MJComponentFormComponent } from "./Entities/MJComponent/mjcomponent.form.component";
import { MJComponentLibraryFormComponent } from "./Entities/MJComponentLibrary/mjcomponentlibrary.form.component";
import { MJComponentLibraryLinkFormComponent } from "./Entities/MJComponentLibraryLink/mjcomponentlibrarylink.form.component";
import { MJComponentRegistryFormComponent } from "./Entities/MJComponentRegistry/mjcomponentregistry.form.component";
import { MJContentFileTypeFormComponent } from "./Entities/MJContentFileType/mjcontentfiletype.form.component";
import { MJContentItemAttributeFormComponent } from "./Entities/MJContentItemAttribute/mjcontentitemattribute.form.component";
import { MJContentItemChunkFormComponent } from "./Entities/MJContentItemChunk/mjcontentitemchunk.form.component";
import { MJContentItemDuplicateFormComponent } from "./Entities/MJContentItemDuplicate/mjcontentitemduplicate.form.component";
import { MJContentItemFormComponent } from "./Entities/MJContentItem/mjcontentitem.form.component";
import { MJContentItemTagFormComponent } from "./Entities/MJContentItemTag/mjcontentitemtag.form.component";
import { MJContentProcessRunDetailFormComponent } from "./Entities/MJContentProcessRunDetail/mjcontentprocessrundetail.form.component";
import { MJContentProcessRunFormComponent } from "./Entities/MJContentProcessRun/mjcontentprocessrun.form.component";
import { MJContentProcessRunPromptRunFormComponent } from "./Entities/MJContentProcessRunPromptRun/mjcontentprocessrunpromptrun.form.component";
import { MJContentSourceFormComponent } from "./Entities/MJContentSource/mjcontentsource.form.component";
import { MJContentSourceParamFormComponent } from "./Entities/MJContentSourceParam/mjcontentsourceparam.form.component";
import { MJContentSourceTypeFormComponent } from "./Entities/MJContentSourceType/mjcontentsourcetype.form.component";
import { MJContentSourceTypeParamFormComponent } from "./Entities/MJContentSourceTypeParam/mjcontentsourcetypeparam.form.component";
import { MJContentTypeAttributeFormComponent } from "./Entities/MJContentTypeAttribute/mjcontenttypeattribute.form.component";
import { MJContentTypeFormComponent } from "./Entities/MJContentType/mjcontenttype.form.component";
import { MJConversationArtifactFormComponent } from "./Entities/MJConversationArtifact/mjconversationartifact.form.component";
import { MJConversationArtifactPermissionFormComponent } from "./Entities/MJConversationArtifactPermission/mjconversationartifactpermission.form.component";
import { MJConversationArtifactVersionFormComponent } from "./Entities/MJConversationArtifactVersion/mjconversationartifactversion.form.component";
import { MJConversationCompactionRunFormComponent } from "./Entities/MJConversationCompactionRun/mjconversationcompactionrun.form.component";
import { MJConversationDetailArtifactFormComponent } from "./Entities/MJConversationDetailArtifact/mjconversationdetailartifact.form.component";
import { MJConversationDetailAttachmentFormComponent } from "./Entities/MJConversationDetailAttachment/mjconversationdetailattachment.form.component";
import { MJConversationDetailFormComponent } from "./Entities/MJConversationDetail/mjconversationdetail.form.component";
import { MJConversationDetailRatingFormComponent } from "./Entities/MJConversationDetailRating/mjconversationdetailrating.form.component";
import { MJConversationFormComponent } from "./Entities/MJConversation/mjconversation.form.component";
import { MJConversationSkillFormComponent } from "./Entities/MJConversationSkill/mjconversationskill.form.component";
import { MJConversationWidgetInstanceFormComponent } from "./Entities/MJConversationWidgetInstance/mjconversationwidgetinstance.form.component";
import { MJCountryFormComponent } from "./Entities/MJCountry/mjcountry.form.component";
import { MJCredentialCategoryFormComponent } from "./Entities/MJCredentialCategory/mjcredentialcategory.form.component";
import { MJCredentialFormComponent } from "./Entities/MJCredential/mjcredential.form.component";
import { MJCredentialTypeFormComponent } from "./Entities/MJCredentialType/mjcredentialtype.form.component";
import { MJDashboardCategoryFormComponent } from "./Entities/MJDashboardCategory/mjdashboardcategory.form.component";
import { MJDashboardCategoryLinkFormComponent } from "./Entities/MJDashboardCategoryLink/mjdashboardcategorylink.form.component";
import { MJDashboardCategoryPermissionFormComponent } from "./Entities/MJDashboardCategoryPermission/mjdashboardcategorypermission.form.component";
import { MJDashboardFormComponent } from "./Entities/MJDashboard/mjdashboard.form.component";
import { MJDashboardPartTypeFormComponent } from "./Entities/MJDashboardPartType/mjdashboardparttype.form.component";
import { MJDashboardPermissionFormComponent } from "./Entities/MJDashboardPermission/mjdashboardpermission.form.component";
import { MJDashboardUserPreferenceFormComponent } from "./Entities/MJDashboardUserPreference/mjdashboarduserpreference.form.component";
import { MJDashboardUserStateFormComponent } from "./Entities/MJDashboardUserState/mjdashboarduserstate.form.component";
import { MJDataContextFormComponent } from "./Entities/MJDataContext/mjdatacontext.form.component";
import { MJDataContextItemFormComponent } from "./Entities/MJDataContextItem/mjdatacontextitem.form.component";
import { MJDatasetFormComponent } from "./Entities/MJDataset/mjdataset.form.component";
import { MJDatasetItemFormComponent } from "./Entities/MJDatasetItem/mjdatasetitem.form.component";
import { MJDuplicateRunDetailFormComponent } from "./Entities/MJDuplicateRunDetail/mjduplicaterundetail.form.component";
import { MJDuplicateRunDetailMatchFormComponent } from "./Entities/MJDuplicateRunDetailMatch/mjduplicaterundetailmatch.form.component";
import { MJDuplicateRunFormComponent } from "./Entities/MJDuplicateRun/mjduplicaterun.form.component";
import { MJEmployeeCompanyIntegrationFormComponent } from "./Entities/MJEmployeeCompanyIntegration/mjemployeecompanyintegration.form.component";
import { MJEmployeeFormComponent } from "./Entities/MJEmployee/mjemployee.form.component";
import { MJEmployeeRoleFormComponent } from "./Entities/MJEmployeeRole/mjemployeerole.form.component";
import { MJEmployeeSkillFormComponent } from "./Entities/MJEmployeeSkill/mjemployeeskill.form.component";
import { MJEncryptionAlgorithmFormComponent } from "./Entities/MJEncryptionAlgorithm/mjencryptionalgorithm.form.component";
import { MJEncryptionKeyFormComponent } from "./Entities/MJEncryptionKey/mjencryptionkey.form.component";
import { MJEncryptionKeySourceFormComponent } from "./Entities/MJEncryptionKeySource/mjencryptionkeysource.form.component";
import { MJEntityAIActionFormComponent } from "./Entities/MJEntityAIAction/mjentityaiaction.form.component";
import { MJEntityActionFilterFormComponent } from "./Entities/MJEntityActionFilter/mjentityactionfilter.form.component";
import { MJEntityActionFormComponent } from "./Entities/MJEntityAction/mjentityaction.form.component";
import { MJEntityActionInvocationFormComponent } from "./Entities/MJEntityActionInvocation/mjentityactioninvocation.form.component";
import { MJEntityActionInvocationTypeFormComponent } from "./Entities/MJEntityActionInvocationType/mjentityactioninvocationtype.form.component";
import { MJEntityActionParamFormComponent } from "./Entities/MJEntityActionParam/mjentityactionparam.form.component";
import { MJEntityCommunicationFieldFormComponent } from "./Entities/MJEntityCommunicationField/mjentitycommunicationfield.form.component";
import { MJEntityCommunicationMessageTypeFormComponent } from "./Entities/MJEntityCommunicationMessageType/mjentitycommunicationmessagetype.form.component";
import { MJEntityDocumentFormComponent } from "./Entities/MJEntityDocument/mjentitydocument.form.component";
import { MJEntityDocumentRunFormComponent } from "./Entities/MJEntityDocumentRun/mjentitydocumentrun.form.component";
import { MJEntityDocumentSettingFormComponent } from "./Entities/MJEntityDocumentSetting/mjentitydocumentsetting.form.component";
import { MJEntityDocumentTypeFormComponent } from "./Entities/MJEntityDocumentType/mjentitydocumenttype.form.component";
import { MJEntityFieldFormComponent } from "./Entities/MJEntityField/mjentityfield.form.component";
import { MJEntityFieldPermissionFormComponent } from "./Entities/MJEntityFieldPermission/mjentityfieldpermission.form.component";
import { MJEntityFieldValueFormComponent } from "./Entities/MJEntityFieldValue/mjentityfieldvalue.form.component";
import { MJEntityFormComponent } from "./Entities/MJEntity/mjentity.form.component";
import { MJEntityFormOverrideFormComponent } from "./Entities/MJEntityFormOverride/mjentityformoverride.form.component";
import { MJEntityOrganicKeyFormComponent } from "./Entities/MJEntityOrganicKey/mjentityorganickey.form.component";
import { MJEntityOrganicKeyRelatedEntityFormComponent } from "./Entities/MJEntityOrganicKeyRelatedEntity/mjentityorganickeyrelatedentity.form.component";
import { MJEntityPermissionFormComponent } from "./Entities/MJEntityPermission/mjentitypermission.form.component";
import { MJEntityRecordDocumentFormComponent } from "./Entities/MJEntityRecordDocument/mjentityrecorddocument.form.component";
import { MJEntityRelationshipDisplayComponentFormComponent } from "./Entities/MJEntityRelationshipDisplayComponent/mjentityrelationshipdisplaycomponent.form.component";
import { MJEntityRelationshipFormComponent } from "./Entities/MJEntityRelationship/mjentityrelationship.form.component";
import { MJEntitySettingFormComponent } from "./Entities/MJEntitySetting/mjentitysetting.form.component";
import { MJEnvironmentFormComponent } from "./Entities/MJEnvironment/mjenvironment.form.component";
import { MJErrorLogFormComponent } from "./Entities/MJErrorLog/mjerrorlog.form.component";
import { MJExperimentFormComponent } from "./Entities/MJExperiment/mjexperiment.form.component";
import { MJExperimentSessionFormComponent } from "./Entities/MJExperimentSession/mjexperimentsession.form.component";
import { MJExperimentSessionIterationFormComponent } from "./Entities/MJExperimentSessionIteration/mjexperimentsessioniteration.form.component";
import { MJExplorerNavigationItemFormComponent } from "./Entities/MJExplorerNavigationItem/mjexplorernavigationitem.form.component";
import { MJExternalDataSourceFormComponent } from "./Entities/MJExternalDataSource/mjexternaldatasource.form.component";
import { MJExternalDataSourceTypeFormComponent } from "./Entities/MJExternalDataSourceType/mjexternaldatasourcetype.form.component";
import { MJFileCategoryFormComponent } from "./Entities/MJFileCategory/mjfilecategory.form.component";
import { MJFileEntityRecordLinkFormComponent } from "./Entities/MJFileEntityRecordLink/mjfileentityrecordlink.form.component";
import { MJFileFormComponent } from "./Entities/MJFile/mjfile.form.component";
import { MJFileStorageAccountFormComponent } from "./Entities/MJFileStorageAccount/mjfilestorageaccount.form.component";
import { MJFileStorageAccountPermissionFormComponent } from "./Entities/MJFileStorageAccountPermission/mjfilestorageaccountpermission.form.component";
import { MJFileStorageProviderFormComponent } from "./Entities/MJFileStorageProvider/mjfilestorageprovider.form.component";
import { MJFormChromeRuleFormComponent } from "./Entities/MJFormChromeRule/mjformchromerule.form.component";
import { MJGeneratedCodeCategoryFormComponent } from "./Entities/MJGeneratedCodeCategory/mjgeneratedcodecategory.form.component";
import { MJGeneratedCodeFormComponent } from "./Entities/MJGeneratedCode/mjgeneratedcode.form.component";
import { MJIdentityClaimFormComponent } from "./Entities/MJIdentityClaim/mjidentityclaim.form.component";
import { MJIdentityClaimTypeFormComponent } from "./Entities/MJIdentityClaimType/mjidentityclaimtype.form.component";
import { MJInstanceConfigurationFormComponent } from "./Entities/MJInstanceConfiguration/mjinstanceconfiguration.form.component";
import { MJIntegrationFormComponent } from "./Entities/MJIntegration/mjintegration.form.component";
import { MJIntegrationObjectFieldFormComponent } from "./Entities/MJIntegrationObjectField/mjintegrationobjectfield.form.component";
import { MJIntegrationObjectFormComponent } from "./Entities/MJIntegrationObject/mjintegrationobject.form.component";
import { MJIntegrationSourceTypeFormComponent } from "./Entities/MJIntegrationSourceType/mjintegrationsourcetype.form.component";
import { MJIntegrationURLFormatFormComponent } from "./Entities/MJIntegrationURLFormat/mjintegrationurlformat.form.component";
import { MJKnowledgeHubSavedSearchFormComponent } from "./Entities/MJKnowledgeHubSavedSearch/mjknowledgehubsavedsearch.form.component";
import { MJLibraryFormComponent } from "./Entities/MJLibrary/mjlibrary.form.component";
import { MJLibraryItemFormComponent } from "./Entities/MJLibraryItem/mjlibraryitem.form.component";
import { MJListCategoryFormComponent } from "./Entities/MJListCategory/mjlistcategory.form.component";
import { MJListDetailFormComponent } from "./Entities/MJListDetail/mjlistdetail.form.component";
import { MJListFormComponent } from "./Entities/MJList/mjlist.form.component";
import { MJListInvitationFormComponent } from "./Entities/MJListInvitation/mjlistinvitation.form.component";
import { MJListShareFormComponent } from "./Entities/MJListShare/mjlistshare.form.component";
import { MJMCPServerConnectionFormComponent } from "./Entities/MJMCPServerConnection/mjmcpserverconnection.form.component";
import { MJMCPServerConnectionPermissionFormComponent } from "./Entities/MJMCPServerConnectionPermission/mjmcpserverconnectionpermission.form.component";
import { MJMCPServerConnectionToolFormComponent } from "./Entities/MJMCPServerConnectionTool/mjmcpserverconnectiontool.form.component";
import { MJMCPServerFormComponent } from "./Entities/MJMCPServer/mjmcpserver.form.component";
import { MJMCPServerToolFormComponent } from "./Entities/MJMCPServerTool/mjmcpservertool.form.component";
import { MJMCPToolExecutionLogFormComponent } from "./Entities/MJMCPToolExecutionLog/mjmcptoolexecutionlog.form.component";
import { MJMCPToolFavoriteFormComponent } from "./Entities/MJMCPToolFavorite/mjmcptoolfavorite.form.component";
import { MJMLAlgorithmFormComponent } from "./Entities/MJMLAlgorithm/mjmlalgorithm.form.component";
import { MJMLAlgorithmUseCaseFormComponent } from "./Entities/MJMLAlgorithmUseCase/mjmlalgorithmusecase.form.component";
import { MJMLAlgorithmUseCaseRankingFormComponent } from "./Entities/MJMLAlgorithmUseCaseRanking/mjmlalgorithmusecaseranking.form.component";
import { MJMLModelFormComponent } from "./Entities/MJMLModel/mjmlmodel.form.component";
import { MJMLModelScoringBindingFormComponent } from "./Entities/MJMLModelScoringBinding/mjmlmodelscoringbinding.form.component";
import { MJMLTrainingPipelineFormComponent } from "./Entities/MJMLTrainingPipeline/mjmltrainingpipeline.form.component";
import { MJMLTrainingRunFormComponent } from "./Entities/MJMLTrainingRun/mjmltrainingrun.form.component";
import { MJMagicLinkInviteAllowedDomainFormComponent } from "./Entities/MJMagicLinkInviteAllowedDomain/mjmagiclinkinvitealloweddomain.form.component";
import { MJMagicLinkInviteAllowedPathFormComponent } from "./Entities/MJMagicLinkInviteAllowedPath/mjmagiclinkinviteallowedpath.form.component";
import { MJMagicLinkInviteApplicationFormComponent } from "./Entities/MJMagicLinkInviteApplication/mjmagiclinkinviteapplication.form.component";
import { MJMagicLinkInviteFormComponent } from "./Entities/MJMagicLinkInvite/mjmagiclinkinvite.form.component";
import { MJMagicLinkInviteRoleFormComponent } from "./Entities/MJMagicLinkInviteRole/mjmagiclinkinviterole.form.component";
import { MJMagicLinkRedemptionFormComponent } from "./Entities/MJMagicLinkRedemption/mjmagiclinkredemption.form.component";
import { MJMaterializedResultFormComponent } from "./Entities/MJMaterializedResult/mjmaterializedresult.form.component";
import { MJMaterializedResultQueryFormComponent } from "./Entities/MJMaterializedResultQuery/mjmaterializedresultquery.form.component";
import { MJOAuthAuthServerMetadataCacheFormComponent } from "./Entities/MJOAuthAuthServerMetadataCache/mjoauthauthservermetadatacache.form.component";
import { MJOAuthAuthorizationStateFormComponent } from "./Entities/MJOAuthAuthorizationState/mjoauthauthorizationstate.form.component";
import { MJOAuthClientRegistrationFormComponent } from "./Entities/MJOAuthClientRegistration/mjoauthclientregistration.form.component";
import { MJOAuthTokenFormComponent } from "./Entities/MJOAuthToken/mjoauthtoken.form.component";
import { MJOpenAppDependencyFormComponent } from "./Entities/MJOpenAppDependency/mjopenappdependency.form.component";
import { MJOpenAppFormComponent } from "./Entities/MJOpenApp/mjopenapp.form.component";
import { MJOpenAppInstallHistoryFormComponent } from "./Entities/MJOpenAppInstallHistory/mjopenappinstallhistory.form.component";
import { MJOutputDeliveryTypeFormComponent } from "./Entities/MJOutputDeliveryType/mjoutputdeliverytype.form.component";
import { MJOutputFormatTypeFormComponent } from "./Entities/MJOutputFormatType/mjoutputformattype.form.component";
import { MJPermissionDomainFormComponent } from "./Entities/MJPermissionDomain/mjpermissiondomain.form.component";
import { MJProcessRunDetailFormComponent } from "./Entities/MJProcessRunDetail/mjprocessrundetail.form.component";
import { MJProcessRunFormComponent } from "./Entities/MJProcessRun/mjprocessrun.form.component";
import { MJProjectFormComponent } from "./Entities/MJProject/mjproject.form.component";
import { MJPublicLinkFormComponent } from "./Entities/MJPublicLink/mjpubliclink.form.component";
import { MJQueryCategoryFormComponent } from "./Entities/MJQueryCategory/mjquerycategory.form.component";
import { MJQueryDependencyFormComponent } from "./Entities/MJQueryDependency/mjquerydependency.form.component";
import { MJQueryEntityFormComponent } from "./Entities/MJQueryEntity/mjqueryentity.form.component";
import { MJQueryFieldFormComponent } from "./Entities/MJQueryField/mjqueryfield.form.component";
import { MJQueryFormComponent } from "./Entities/MJQuery/mjquery.form.component";
import { MJQueryParameterFormComponent } from "./Entities/MJQueryParameter/mjqueryparameter.form.component";
import { MJQueryPermissionFormComponent } from "./Entities/MJQueryPermission/mjquerypermission.form.component";
import { MJQuerySQLFormComponent } from "./Entities/MJQuerySQL/mjquerysql.form.component";
import { MJQueueFormComponent } from "./Entities/MJQueue/mjqueue.form.component";
import { MJQueueTaskFormComponent } from "./Entities/MJQueueTask/mjqueuetask.form.component";
import { MJQueueTypeFormComponent } from "./Entities/MJQueueType/mjqueuetype.form.component";
import { MJRSUPendingWorkFormComponent } from "./Entities/MJRSUPendingWork/mjrsupendingwork.form.component";
import { MJRecommendationFormComponent } from "./Entities/MJRecommendation/mjrecommendation.form.component";
import { MJRecommendationItemFormComponent } from "./Entities/MJRecommendationItem/mjrecommendationitem.form.component";
import { MJRecommendationProviderFormComponent } from "./Entities/MJRecommendationProvider/mjrecommendationprovider.form.component";
import { MJRecommendationRunFormComponent } from "./Entities/MJRecommendationRun/mjrecommendationrun.form.component";
import { MJRecordChangeFormComponent } from "./Entities/MJRecordChange/mjrecordchange.form.component";
import { MJRecordChangeReplayRunFormComponent } from "./Entities/MJRecordChangeReplayRun/mjrecordchangereplayrun.form.component";
import { MJRecordGeoCodeFormComponent } from "./Entities/MJRecordGeoCode/mjrecordgeocode.form.component";
import { MJRecordLinkFormComponent } from "./Entities/MJRecordLink/mjrecordlink.form.component";
import { MJRecordMergeDeletionLogFormComponent } from "./Entities/MJRecordMergeDeletionLog/mjrecordmergedeletionlog.form.component";
import { MJRecordMergeLogFormComponent } from "./Entities/MJRecordMergeLog/mjrecordmergelog.form.component";
import { MJRecordProcessCategoryFormComponent } from "./Entities/MJRecordProcessCategory/mjrecordprocesscategory.form.component";
import { MJRecordProcessFormComponent } from "./Entities/MJRecordProcess/mjrecordprocess.form.component";
import { MJRecordProcessWatermarkFormComponent } from "./Entities/MJRecordProcessWatermark/mjrecordprocesswatermark.form.component";
import { MJRemoteOperationCategoryFormComponent } from "./Entities/MJRemoteOperationCategory/mjremoteoperationcategory.form.component";
import { MJRemoteOperationFormComponent } from "./Entities/MJRemoteOperation/mjremoteoperation.form.component";
import { MJResourceLinkFormComponent } from "./Entities/MJResourceLink/mjresourcelink.form.component";
import { MJResourcePermissionFormComponent } from "./Entities/MJResourcePermission/mjresourcepermission.form.component";
import { MJResourceTypeFormComponent } from "./Entities/MJResourceType/mjresourcetype.form.component";
import { MJRoleFormComponent } from "./Entities/MJRole/mjrole.form.component";
import { MJRowLevelSecurityFilterFormComponent } from "./Entities/MJRowLevelSecurityFilter/mjrowlevelsecurityfilter.form.component";
import { MJSQLDialectFormComponent } from "./Entities/MJSQLDialect/mjsqldialect.form.component";
import { MJScheduledJobFormComponent } from "./Entities/MJScheduledJob/mjscheduledjob.form.component";
import { MJScheduledJobRunFormComponent } from "./Entities/MJScheduledJobRun/mjscheduledjobrun.form.component";
import { MJScheduledJobTypeFormComponent } from "./Entities/MJScheduledJobType/mjscheduledjobtype.form.component";
import { MJSchemaInfoFormComponent } from "./Entities/MJSchemaInfo/mjschemainfo.form.component";
import { MJScopedPromptConfigFormComponent } from "./Entities/MJScopedPromptConfig/mjscopedpromptconfig.form.component";
import { MJScopedPromptPartFormComponent } from "./Entities/MJScopedPromptPart/mjscopedpromptpart.form.component";
import { MJSearchExecutionLogFormComponent } from "./Entities/MJSearchExecutionLog/mjsearchexecutionlog.form.component";
import { MJSearchProviderFormComponent } from "./Entities/MJSearchProvider/mjsearchprovider.form.component";
import { MJSearchScopeEntityFormComponent } from "./Entities/MJSearchScopeEntity/mjsearchscopeentity.form.component";
import { MJSearchScopeExternalIndexFormComponent } from "./Entities/MJSearchScopeExternalIndex/mjsearchscopeexternalindex.form.component";
import { MJSearchScopeFormComponent } from "./Entities/MJSearchScope/mjsearchscope.form.component";
import { MJSearchScopePermissionFormComponent } from "./Entities/MJSearchScopePermission/mjsearchscopepermission.form.component";
import { MJSearchScopeProviderFormComponent } from "./Entities/MJSearchScopeProvider/mjsearchscopeprovider.form.component";
import { MJSearchScopeStorageAccountFormComponent } from "./Entities/MJSearchScopeStorageAccount/mjsearchscopestorageaccount.form.component";
import { MJSearchScopeTestQueryFormComponent } from "./Entities/MJSearchScopeTestQuery/mjsearchscopetestquery.form.component";
import { MJSignatureAccountFormComponent } from "./Entities/MJSignatureAccount/mjsignatureaccount.form.component";
import { MJSignatureProviderFormComponent } from "./Entities/MJSignatureProvider/mjsignatureprovider.form.component";
import { MJSignatureRequestDocumentFormComponent } from "./Entities/MJSignatureRequestDocument/mjsignaturerequestdocument.form.component";
import { MJSignatureRequestFormComponent } from "./Entities/MJSignatureRequest/mjsignaturerequest.form.component";
import { MJSignatureRequestLogFormComponent } from "./Entities/MJSignatureRequestLog/mjsignaturerequestlog.form.component";
import { MJSignatureRequestRecipientFormComponent } from "./Entities/MJSignatureRequestRecipient/mjsignaturerequestrecipient.form.component";
import { MJSkillFormComponent } from "./Entities/MJSkill/mjskill.form.component";
import { MJStateProvinceFormComponent } from "./Entities/MJStateProvince/mjstateprovince.form.component";
import { MJTagAuditLogFormComponent } from "./Entities/MJTagAuditLog/mjtagauditlog.form.component";
import { MJTagCoOccurrenceFormComponent } from "./Entities/MJTagCoOccurrence/mjtagcooccurrence.form.component";
import { MJTagFormComponent } from "./Entities/MJTag/mjtag.form.component";
import { MJTagScopeFormComponent } from "./Entities/MJTagScope/mjtagscope.form.component";
import { MJTagSuggestionFormComponent } from "./Entities/MJTagSuggestion/mjtagsuggestion.form.component";
import { MJTagSynonymFormComponent } from "./Entities/MJTagSynonym/mjtagsynonym.form.component";
import { MJTaggedItemFormComponent } from "./Entities/MJTaggedItem/mjtaggeditem.form.component";
import { MJTaskDependencyFormComponent } from "./Entities/MJTaskDependency/mjtaskdependency.form.component";
import { MJTaskFormComponent } from "./Entities/MJTask/mjtask.form.component";
import { MJTaskTypeFormComponent } from "./Entities/MJTaskType/mjtasktype.form.component";
import { MJTemplateCategoryFormComponent } from "./Entities/MJTemplateCategory/mjtemplatecategory.form.component";
import { MJTemplateContentFormComponent } from "./Entities/MJTemplateContent/mjtemplatecontent.form.component";
import { MJTemplateContentTypeFormComponent } from "./Entities/MJTemplateContentType/mjtemplatecontenttype.form.component";
import { MJTemplateFormComponent } from "./Entities/MJTemplate/mjtemplate.form.component";
import { MJTemplateParamFormComponent } from "./Entities/MJTemplateParam/mjtemplateparam.form.component";
import { MJTestFormComponent } from "./Entities/MJTest/mjtest.form.component";
import { MJTestRubricFormComponent } from "./Entities/MJTestRubric/mjtestrubric.form.component";
import { MJTestRunFeedbackFormComponent } from "./Entities/MJTestRunFeedback/mjtestrunfeedback.form.component";
import { MJTestRunFormComponent } from "./Entities/MJTestRun/mjtestrun.form.component";
import { MJTestRunOutputFormComponent } from "./Entities/MJTestRunOutput/mjtestrunoutput.form.component";
import { MJTestRunOutputTypeFormComponent } from "./Entities/MJTestRunOutputType/mjtestrunoutputtype.form.component";
import { MJTestSuiteFormComponent } from "./Entities/MJTestSuite/mjtestsuite.form.component";
import { MJTestSuiteRunFormComponent } from "./Entities/MJTestSuiteRun/mjtestsuiterun.form.component";
import { MJTestSuiteTestFormComponent } from "./Entities/MJTestSuiteTest/mjtestsuitetest.form.component";
import { MJTestTypeFormComponent } from "./Entities/MJTestType/mjtesttype.form.component";
import { MJThemeFormComponent } from "./Entities/MJTheme/mjtheme.form.component";
import { MJUserApplicationEntityFormComponent } from "./Entities/MJUserApplicationEntity/mjuserapplicationentity.form.component";
import { MJUserApplicationFormComponent } from "./Entities/MJUserApplication/mjuserapplication.form.component";
import { MJUserFavoriteFormComponent } from "./Entities/MJUserFavorite/mjuserfavorite.form.component";
import { MJUserFormComponent } from "./Entities/MJUser/mjuser.form.component";
import { MJUserNotificationFormComponent } from "./Entities/MJUserNotification/mjusernotification.form.component";
import { MJUserNotificationPreferenceFormComponent } from "./Entities/MJUserNotificationPreference/mjusernotificationpreference.form.component";
import { MJUserNotificationTypeFormComponent } from "./Entities/MJUserNotificationType/mjusernotificationtype.form.component";
import { MJUserRecordLogFormComponent } from "./Entities/MJUserRecordLog/mjuserrecordlog.form.component";
import { MJUserRoleFormComponent } from "./Entities/MJUserRole/mjuserrole.form.component";
import { MJUserRoutineFormComponent } from "./Entities/MJUserRoutine/mjuserroutine.form.component";
import { MJUserRoutineRecipientFormComponent } from "./Entities/MJUserRoutineRecipient/mjuserroutinerecipient.form.component";
import { MJUserRoutineRunFormComponent } from "./Entities/MJUserRoutineRun/mjuserroutinerun.form.component";
import { MJUserSettingFormComponent } from "./Entities/MJUserSetting/mjusersetting.form.component";
import { MJUserViewCategoryFormComponent } from "./Entities/MJUserViewCategory/mjuserviewcategory.form.component";
import { MJUserViewFormComponent } from "./Entities/MJUserView/mjuserview.form.component";
import { MJUserViewRunDetailFormComponent } from "./Entities/MJUserViewRunDetail/mjuserviewrundetail.form.component";
import { MJUserViewRunFormComponent } from "./Entities/MJUserViewRun/mjuserviewrun.form.component";
import { MJVectorDatabaseFormComponent } from "./Entities/MJVectorDatabase/mjvectordatabase.form.component";
import { MJVectorIndexFormComponent } from "./Entities/MJVectorIndex/mjvectorindex.form.component";
import { MJVersionInstallationFormComponent } from "./Entities/MJVersionInstallation/mjversioninstallation.form.component";
import { MJVersionLabelFormComponent } from "./Entities/MJVersionLabel/mjversionlabel.form.component";
import { MJVersionLabelItemFormComponent } from "./Entities/MJVersionLabelItem/mjversionlabelitem.form.component";
import { MJVersionLabelRestoreFormComponent } from "./Entities/MJVersionLabelRestore/mjversionlabelrestore.form.component";
import { MJViewTypeFormComponent } from "./Entities/MJViewType/mjviewtype.form.component";
import { MJWorkspaceFormComponent } from "./Entities/MJWorkspace/mjworkspace.form.component";
import { MJWorkspaceItemFormComponent } from "./Entities/MJWorkspaceItem/mjworkspaceitem.form.component";
import { JoinGridModule } from "@memberjunction/ng-join-grid"   

@NgModule({
declarations: [
    MJAIAgentSessionFormComponent,
    MJAIConfigurationParamFormComponent,
    MJAIPromptModelFormComponent,
    MJActionContextFormComponent,
    MJEncryptionKeySourceFormComponent,
    MJEntityActionFormComponent,
    MJQueryDependencyFormComponent,
    MJStateProvinceFormComponent,
    MJViewTypeFormComponent
],
imports: [
    CommonModule,
    FormsModule,
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
    MJAIAgentCoAgentFormComponent,
    MJArtifactFormComponent,
    MJClusterAnalysisClusterFormComponent,
    MJCountryFormComponent,
    MJKnowledgeHubSavedSearchFormComponent,
    MJMagicLinkInviteFormComponent,
    MJMaterializedResultFormComponent
],
imports: [
    CommonModule,
    FormsModule,
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
    MJAIAgentNoteFormComponent,
    MJAIAgentTypeFormComponent,
    MJAuditLogTypeFormComponent,
    MJComponentFormComponent,
    MJContentTypeAttributeFormComponent,
    MJConversationArtifactVersionFormComponent,
    MJConversationCompactionRunFormComponent,
    MJEntityAIActionFormComponent,
    MJEntityFormComponent,
    MJIntegrationSourceTypeFormComponent,
    MJScopedPromptPartFormComponent,
    MJSearchScopePermissionFormComponent,
    MJSignatureRequestFormComponent,
    MJTemplateContentTypeFormComponent
],
imports: [
    CommonModule,
    FormsModule,
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
    MJAIAgentRunFormComponent,
    MJAIAgentRunMediaFormComponent,
    MJAIPromptTypeFormComponent,
    MJAIVendorTypeFormComponent,
    MJCommunicationBaseMessageTypeFormComponent,
    MJContentSourceTypeFormComponent,
    MJEmployeeFormComponent,
    MJEmployeeRoleFormComponent,
    MJOAuthTokenFormComponent,
    MJQueryCategoryFormComponent,
    MJRecommendationItemFormComponent,
    MJRecordProcessWatermarkFormComponent,
    MJSearchScopeFormComponent,
    MJSearchScopeStorageAccountFormComponent,
    MJUserNotificationTypeFormComponent
],
imports: [
    CommonModule,
    FormsModule,
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
    MJAIAgentLearningCycleFormComponent,
    MJAISkillActionFormComponent,
    MJArtifactPermissionFormComponent,
    MJCredentialTypeFormComponent,
    MJEntityRelationshipFormComponent,
    MJExperimentSessionFormComponent,
    MJMCPServerConnectionToolFormComponent
],
imports: [
    CommonModule,
    FormsModule,
    BaseFormsModule,
    EntityViewerModule,
    LinkDirectivesModule
],
exports: [
]
})
export class GeneratedForms_SubModule_4 { }
    


@NgModule({
declarations: [
    MJAIAgentCredentialFormComponent,
    MJAIAgentDataSourceFormComponent,
    MJAIAgentRunStepFormComponent,
    MJAIBridgeAgentIdentityFormComponent,
    MJAPIApplicationFormComponent,
    MJArchiveRunDetailFormComponent,
    MJComponentLibraryFormComponent,
    MJContentItemAttributeFormComponent,
    MJContentItemFormComponent,
    MJContentItemTagFormComponent,
    MJContentProcessRunDetailFormComponent,
    MJDashboardUserPreferenceFormComponent,
    MJDuplicateRunFormComponent,
    MJEntityDocumentSettingFormComponent,
    MJFileFormComponent,
    MJFileStorageAccountFormComponent,
    MJIdentityClaimTypeFormComponent,
    MJMCPToolExecutionLogFormComponent,
    MJOpenAppInstallHistoryFormComponent,
    MJUserRoutineRunFormComponent,
    MJVectorDatabaseFormComponent,
    MJWorkspaceItemFormComponent
],
imports: [
    CommonModule,
    FormsModule,
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
    MJAIModelFormComponent,
    MJArchiveRunFormComponent,
    MJCollectionPermissionFormComponent,
    MJContentFileTypeFormComponent,
    MJContentProcessRunFormComponent,
    MJDataContextFormComponent,
    MJOAuthAuthServerMetadataCacheFormComponent,
    MJResourcePermissionFormComponent
],
imports: [
    CommonModule,
    FormsModule,
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
    MJAIAgentSessionBridgeFormComponent,
    MJAIAgentSkillFormComponent,
    MJArchiveConfigurationFormComponent,
    MJCollectionFormComponent,
    MJComponentRegistryFormComponent,
    MJDatasetFormComponent,
    MJGeneratedCodeCategoryFormComponent,
    MJQueryFieldFormComponent,
    MJRSUPendingWorkFormComponent,
    MJResourceTypeFormComponent
],
imports: [
    CommonModule,
    FormsModule,
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
    MJAIModelVendorFormComponent,
    MJActionContextTypeFormComponent,
    MJActionLibraryFormComponent,
    MJAuthenticationProviderFormComponent,
    MJCredentialCategoryFormComponent,
    MJDashboardPartTypeFormComponent,
    MJEntityFieldFormComponent,
    MJOAuthClientRegistrationFormComponent,
    MJOutputDeliveryTypeFormComponent,
    MJProjectFormComponent
],
imports: [
    CommonModule,
    FormsModule,
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
    MJApplicationFormComponent,
    MJArtifactTypeFormComponent,
    MJCollectionArtifactFormComponent,
    MJConversationDetailFormComponent,
    MJEntityActionParamFormComponent,
    MJMagicLinkInviteRoleFormComponent,
    MJProcessRunFormComponent,
    MJTestRunFeedbackFormComponent,
    MJUserViewCategoryFormComponent
],
imports: [
    CommonModule,
    FormsModule,
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
    MJAIAgentFormComponent,
    MJAIAgentNoteTypeFormComponent,
    MJAIResultCacheFormComponent,
    MJActionAuthorizationFormComponent,
    MJArchiveConfigurationEntityFormComponent,
    MJAuditLogFormComponent,
    MJCompanyFormComponent,
    MJContentItemChunkFormComponent,
    MJDatasetItemFormComponent,
    MJInstanceConfigurationFormComponent,
    MJQueryParameterFormComponent,
    MJTagCoOccurrenceFormComponent,
    MJTemplateContentFormComponent
],
imports: [
    CommonModule,
    FormsModule,
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
    MJAIAgentPermissionFormComponent,
    MJAIPromptCategoryFormComponent,
    MJCommunicationProviderMessageTypeFormComponent,
    MJCompanyIntegrationRunFormComponent,
    MJDashboardUserStateFormComponent,
    MJDataContextItemFormComponent,
    MJExperimentSessionIterationFormComponent,
    MJListCategoryFormComponent,
    MJQueryFormComponent,
    MJTestRunOutputFormComponent,
    MJTestRunOutputTypeFormComponent
],
imports: [
    CommonModule,
    FormsModule,
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
    MJAIAgentArtifactTypeFormComponent,
    MJAIAgentHarnessFormComponent,
    MJAIAgentPromptFormComponent,
    MJAIAgentRelationshipFormComponent,
    MJAIBridgeProviderChannelFormComponent,
    MJAIPromptRunFormComponent,
    MJAIUsageTypeFormComponent,
    MJAIVendorTypeDefinitionFormComponent,
    MJAccessControlRuleFormComponent,
    MJAuthorizationRoleFormComponent,
    MJContentSourceTypeParamFormComponent,
    MJCredentialFormComponent,
    MJMLAlgorithmUseCaseFormComponent,
    MJOAuthAuthorizationStateFormComponent,
    MJTagSynonymFormComponent,
    MJUserNotificationPreferenceFormComponent,
    MJVectorIndexFormComponent
],
imports: [
    CommonModule,
    FormsModule,
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
    MJAIModelPriceUnitTypeFormComponent,
    MJApplicationSettingFormComponent,
    MJArtifactVersionAttributeFormComponent,
    MJArtifactVersionFormComponent,
    MJEncryptionAlgorithmFormComponent,
    MJEntityFieldPermissionFormComponent,
    MJFileStorageProviderFormComponent,
    MJIdentityClaimFormComponent,
    MJIntegrationFormComponent,
    MJMagicLinkInviteAllowedDomainFormComponent,
    MJRowLevelSecurityFilterFormComponent,
    MJSignatureRequestRecipientFormComponent
],
imports: [
    CommonModule,
    FormsModule,
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
    MJAIAgentExampleFormComponent,
    MJAIModelTypeFormComponent,
    MJAPIKeyFormComponent,
    MJConversationDetailAttachmentFormComponent,
    MJConversationDetailRatingFormComponent,
    MJDashboardPermissionFormComponent,
    MJLibraryFormComponent,
    MJMCPServerConnectionFormComponent,
    MJQueryEntityFormComponent,
    MJRemoteOperationCategoryFormComponent,
    MJSchemaInfoFormComponent,
    MJSignatureProviderFormComponent,
    MJTaggedItemFormComponent,
    MJUserFormComponent
],
imports: [
    CommonModule,
    FormsModule,
    BaseFormsModule,
    EntityViewerModule,
    LinkDirectivesModule
],
exports: [
]
})
export class GeneratedForms_SubModule_14 { }
    


@NgModule({
declarations: [
    MJAIActionFormComponent,
    MJAIAgentModalityFormComponent,
    MJAIModelArchitectureFormComponent,
    MJAIModelPriceTypeFormComponent,
    MJAIPersonaVendorFormComponent,
    MJAISkillPermissionFormComponent,
    MJAPIScopeFormComponent,
    MJDashboardCategoryLinkFormComponent,
    MJGeneratedCodeFormComponent,
    MJMLTrainingRunFormComponent,
    MJUserApplicationEntityFormComponent
],
imports: [
    CommonModule,
    FormsModule,
    BaseFormsModule,
    EntityViewerModule,
    LinkDirectivesModule
],
exports: [
]
})
export class GeneratedForms_SubModule_15 { }
    


@NgModule({
declarations: [
    MJAIAgentSearchScopeFormComponent,
    MJAIModelPersonaFormComponent,
    MJArtifactUseFormComponent,
    MJCommunicationRunFormComponent,
    MJContentTypeFormComponent,
    MJIntegrationObjectFormComponent,
    MJSearchScopeExternalIndexFormComponent,
    MJSearchScopeProviderFormComponent,
    MJSkillFormComponent,
    MJThemeFormComponent,
    MJUserSettingFormComponent,
    MJVersionLabelItemFormComponent
],
imports: [
    CommonModule,
    FormsModule,
    BaseFormsModule,
    EntityViewerModule,
    LinkDirectivesModule
],
exports: [
]
})
export class GeneratedForms_SubModule_16 { }
    


@NgModule({
declarations: [
    MJAIModelCostFormComponent,
    MJAPIApplicationScopeFormComponent,
    MJActionCategoryFormComponent,
    MJActionResultCodeFormComponent,
    MJApplicationRoleFormComponent,
    MJCompanyIntegrationEntityMapFormComponent,
    MJCompanyIntegrationRunAPILogFormComponent,
    MJComponentDependencyFormComponent,
    MJEntityDocumentFormComponent,
    MJMLAlgorithmFormComponent,
    MJMLModelFormComponent,
    MJMagicLinkRedemptionFormComponent,
    MJScheduledJobTypeFormComponent,
    MJSignatureRequestDocumentFormComponent,
    MJUserViewFormComponent
],
imports: [
    CommonModule,
    FormsModule,
    BaseFormsModule,
    EntityViewerModule,
    LinkDirectivesModule
],
exports: [
]
})
export class GeneratedForms_SubModule_17 { }
    


@NgModule({
declarations: [
    MJAIPromptRunMediaFormComponent,
    MJCompanyIntegrationFormComponent,
    MJEntityActionInvocationFormComponent,
    MJMCPServerFormComponent,
    MJPermissionDomainFormComponent,
    MJRecordChangeReplayRunFormComponent,
    MJUserRoleFormComponent
],
imports: [
    CommonModule,
    FormsModule,
    BaseFormsModule,
    EntityViewerModule,
    LinkDirectivesModule
],
exports: [
]
})
export class GeneratedForms_SubModule_18 { }
    


@NgModule({
declarations: [
    MJAIAgentModelFormComponent,
    MJAICredentialBindingFormComponent,
    MJAIModelModalityFormComponent,
    MJAIPromptFormComponent,
    MJAISkillSubAgentFormComponent,
    MJAIVendorFormComponent,
    MJClusterAnalysisFormComponent,
    MJCompanyIntegrationRecordMapFormComponent,
    MJContentSourceFormComponent,
    MJEncryptionKeyFormComponent,
    MJEntityPermissionFormComponent,
    MJErrorLogFormComponent,
    MJFileEntityRecordLinkFormComponent,
    MJLibraryItemFormComponent,
    MJListFormComponent,
    MJTagScopeFormComponent,
    MJUserNotificationFormComponent,
    MJVersionInstallationFormComponent,
    MJVersionLabelRestoreFormComponent
],
imports: [
    CommonModule,
    FormsModule,
    BaseFormsModule,
    EntityViewerModule,
    LinkDirectivesModule
],
exports: [
]
})
export class GeneratedForms_SubModule_19 { }
    


@NgModule({
declarations: [
    MJAIAgentPersonaFormComponent,
    MJAIModalityFormComponent,
    MJAISkillSearchScopeFormComponent,
    MJCompanyIntegrationRunDetailFormComponent,
    MJConversationArtifactFormComponent,
    MJEntityOrganicKeyRelatedEntityFormComponent,
    MJEntitySettingFormComponent,
    MJMagicLinkInviteAllowedPathFormComponent,
    MJTaskFormComponent,
    MJTestSuiteRunFormComponent
],
imports: [
    CommonModule,
    FormsModule,
    BaseFormsModule,
    EntityViewerModule,
    LinkDirectivesModule
],
exports: [
]
})
export class GeneratedForms_SubModule_20 { }
    


@NgModule({
declarations: [
    MJAIAgentClientToolFormComponent,
    MJAIAgentStepPathFormComponent,
    MJAIPersonaFormComponent,
    MJActionExecutionLogFormComponent,
    MJCompanyIntegrationSyncWatermarkFormComponent,
    MJComponentLibraryLinkFormComponent,
    MJExternalDataSourceTypeFormComponent,
    MJMCPToolFavoriteFormComponent,
    MJMaterializedResultQueryFormComponent,
    MJOutputFormatTypeFormComponent,
    MJQueueTaskFormComponent,
    MJRecommendationProviderFormComponent,
    MJRecordProcessCategoryFormComponent,
    MJTemplateCategoryFormComponent,
    MJUserViewRunDetailFormComponent,
    MJVersionLabelFormComponent
],
imports: [
    CommonModule,
    FormsModule,
    BaseFormsModule,
    EntityViewerModule,
    LinkDirectivesModule
],
exports: [
]
})
export class GeneratedForms_SubModule_21 { }
    


@NgModule({
declarations: [
    MJAIAgentConfigurationFormComponent,
    MJAPIKeyApplicationFormComponent,
    MJContentItemDuplicateFormComponent,
    MJDashboardCategoryPermissionFormComponent,
    MJDuplicateRunDetailFormComponent,
    MJEmployeeCompanyIntegrationFormComponent,
    MJEntityDocumentRunFormComponent,
    MJIntegrationObjectFieldFormComponent,
    MJListInvitationFormComponent,
    MJQueueFormComponent,
    MJSearchScopeEntityFormComponent,
    MJSignatureRequestLogFormComponent,
    MJUserApplicationFormComponent,
    MJUserViewRunFormComponent
],
imports: [
    CommonModule,
    FormsModule,
    BaseFormsModule,
    EntityViewerModule,
    LinkDirectivesModule
],
exports: [
]
})
export class GeneratedForms_SubModule_22 { }
    


@NgModule({
declarations: [
    MJAIAgentSessionChannelFormComponent,
    MJAIConfigurationFormComponent,
    MJAPIKeyUsageLogFormComponent,
    MJActionFilterFormComponent,
    MJConversationSkillFormComponent,
    MJDashboardCategoryFormComponent,
    MJMLModelScoringBindingFormComponent,
    MJRoleFormComponent,
    MJScopedPromptConfigFormComponent,
    MJSearchExecutionLogFormComponent,
    MJSearchScopeTestQueryFormComponent,
    MJTaskDependencyFormComponent,
    MJTestFormComponent,
    MJTestTypeFormComponent
],
imports: [
    CommonModule,
    FormsModule,
    BaseFormsModule,
    EntityViewerModule,
    LinkDirectivesModule
],
exports: [
]
})
export class GeneratedForms_SubModule_23 { }
    


@NgModule({
declarations: [
    MJAIAgentActionFormComponent,
    MJAIAgentStepFormComponent,
    MJAIArchitectureFormComponent,
    MJAPIKeyScopeFormComponent,
    MJApplicationEntityFormComponent,
    MJAuthorizationFormComponent,
    MJCompanyIntegrationFieldMapFormComponent,
    MJEntityFormOverrideFormComponent,
    MJFileStorageAccountPermissionFormComponent,
    MJMCPServerToolFormComponent,
    MJMLAlgorithmUseCaseRankingFormComponent,
    MJMLTrainingPipelineFormComponent,
    MJRecordChangeFormComponent,
    MJRecordLinkFormComponent,
    MJTestRubricFormComponent,
    MJTestRunFormComponent,
    MJUserRoutineFormComponent,
    MJWorkspaceFormComponent
],
imports: [
    CommonModule,
    FormsModule,
    BaseFormsModule,
    EntityViewerModule,
    LinkDirectivesModule
],
exports: [
]
})
export class GeneratedForms_SubModule_24 { }
    


@NgModule({
declarations: [
    MJAIAgentChannelFormComponent,
    MJActionFormComponent,
    MJCommunicationLogFormComponent,
    MJConversationArtifactPermissionFormComponent,
    MJEntityDocumentTypeFormComponent,
    MJEntityFieldValueFormComponent,
    MJFormChromeRuleFormComponent,
    MJOpenAppDependencyFormComponent,
    MJSQLDialectFormComponent,
    MJScheduledJobFormComponent
],
imports: [
    CommonModule,
    FormsModule,
    BaseFormsModule,
    EntityViewerModule,
    LinkDirectivesModule
],
exports: [
]
})
export class GeneratedForms_SubModule_25 { }
    


@NgModule({
declarations: [
    MJActionParamFormComponent,
    MJConversationFormComponent,
    MJEntityActionInvocationTypeFormComponent,
    MJEntityCommunicationFieldFormComponent,
    MJEntityOrganicKeyFormComponent,
    MJEntityRecordDocumentFormComponent,
    MJOpenAppFormComponent,
    MJProcessRunDetailFormComponent,
    MJQueryPermissionFormComponent,
    MJRecordMergeLogFormComponent,
    MJRemoteOperationFormComponent,
    MJTagAuditLogFormComponent
],
imports: [
    CommonModule,
    FormsModule,
    BaseFormsModule,
    EntityViewerModule,
    LinkDirectivesModule
],
exports: [
]
})
export class GeneratedForms_SubModule_26 { }
    


@NgModule({
declarations: [
    MJAIAgentRequestFormComponent,
    MJAIAgentRequestTypeFormComponent,
    MJConversationWidgetInstanceFormComponent,
    MJDuplicateRunDetailMatchFormComponent,
    MJEntityCommunicationMessageTypeFormComponent,
    MJMagicLinkInviteApplicationFormComponent,
    MJTagSuggestionFormComponent,
    MJTestSuiteFormComponent,
    MJTestSuiteTestFormComponent,
    MJUserRecordLogFormComponent,
    MJUserRoutineRecipientFormComponent
],
imports: [
    CommonModule,
    FormsModule,
    BaseFormsModule,
    EntityViewerModule,
    LinkDirectivesModule
],
exports: [
]
})
export class GeneratedForms_SubModule_27 { }
    


@NgModule({
declarations: [
    MJAIAgentSessionBridgeParticipantFormComponent,
    MJAIModelActionFormComponent,
    MJAIRemoteBrowserProviderFormComponent,
    MJCommunicationProviderFormComponent,
    MJContentSourceParamFormComponent,
    MJEmployeeSkillFormComponent,
    MJEnvironmentFormComponent,
    MJListDetailFormComponent,
    MJPublicLinkFormComponent,
    MJRecordMergeDeletionLogFormComponent,
    MJSearchProviderFormComponent,
    MJSignatureAccountFormComponent,
    MJTaskTypeFormComponent
],
imports: [
    CommonModule,
    FormsModule,
    BaseFormsModule,
    EntityViewerModule,
    LinkDirectivesModule,
    JoinGridModule
],
exports: [
]
})
export class GeneratedForms_SubModule_28 { }
    


@NgModule({
declarations: [
    MJAIBridgeProviderFormComponent,
    MJAIClientToolDefinitionFormComponent,
    MJContentProcessRunPromptRunFormComponent,
    MJExplorerNavigationItemFormComponent,
    MJExternalDataSourceFormComponent,
    MJFileCategoryFormComponent,
    MJRecordProcessFormComponent,
    MJTemplateFormComponent
],
imports: [
    CommonModule,
    FormsModule,
    BaseFormsModule,
    EntityViewerModule,
    LinkDirectivesModule
],
exports: [
]
})
export class GeneratedForms_SubModule_29 { }
    


@NgModule({
declarations: [
    MJAIAgentCategoryFormComponent,
    MJAISkillFormComponent,
    MJEntityActionFilterFormComponent,
    MJExperimentFormComponent,
    MJListShareFormComponent,
    MJQueueTypeFormComponent,
    MJRecommendationFormComponent,
    MJRecordGeoCodeFormComponent,
    MJScheduledJobRunFormComponent,
    MJTemplateParamFormComponent,
    MJUserFavoriteFormComponent
],
imports: [
    CommonModule,
    FormsModule,
    BaseFormsModule,
    EntityViewerModule,
    LinkDirectivesModule
],
exports: [
]
})
export class GeneratedForms_SubModule_30 { }
    


@NgModule({
declarations: [
    MJConversationDetailArtifactFormComponent,
    MJDashboardFormComponent,
    MJEntityRelationshipDisplayComponentFormComponent,
    MJIntegrationURLFormatFormComponent,
    MJMCPServerConnectionPermissionFormComponent,
    MJQuerySQLFormComponent,
    MJRecommendationRunFormComponent,
    MJResourceLinkFormComponent,
    MJTagFormComponent
],
imports: [
    CommonModule,
    FormsModule,
    BaseFormsModule,
    EntityViewerModule,
    LinkDirectivesModule
],
exports: [
]
})
export class GeneratedForms_SubModule_31 { }
    


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
    GeneratedForms_SubModule_13,
    GeneratedForms_SubModule_14,
    GeneratedForms_SubModule_15,
    GeneratedForms_SubModule_16,
    GeneratedForms_SubModule_17,
    GeneratedForms_SubModule_18,
    GeneratedForms_SubModule_19,
    GeneratedForms_SubModule_20,
    GeneratedForms_SubModule_21,
    GeneratedForms_SubModule_22,
    GeneratedForms_SubModule_23,
    GeneratedForms_SubModule_24,
    GeneratedForms_SubModule_25,
    GeneratedForms_SubModule_26,
    GeneratedForms_SubModule_27,
    GeneratedForms_SubModule_28,
    GeneratedForms_SubModule_29,
    GeneratedForms_SubModule_30,
    GeneratedForms_SubModule_31
]
})
export class CoreGeneratedFormsModule { }
    
// Note: LoadXXXGeneratedForms() functions have been removed. Tree-shaking prevention
// is now handled by the pre-built class registration manifest system.
// See packages/CodeGenLib/CLASS_MANIFEST_GUIDE.md for details.
    