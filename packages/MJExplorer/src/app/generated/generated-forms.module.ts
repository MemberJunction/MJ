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
import { AbstractCategoryFormComponent, LoadAbstractCategoryFormComponent } from "./Entities/AbstractCategory/abstractcategory.form.component";
import { AbstractFormComponent, LoadAbstractFormComponent } from "./Entities/Abstract/abstract.form.component";
import { AccountingPeriodFormComponent, LoadAccountingPeriodFormComponent } from "./Entities/AccountingPeriod/accountingperiod.form.component";
import { AdInsertionOrderOptionFormComponent, LoadAdInsertionOrderOptionFormComponent } from "./Entities/AdInsertionOrderOption/adinsertionorderoption.form.component";
import { AddressTypeFormComponent, LoadAddressTypeFormComponent } from "./Entities/AddressType/addresstype.form.component";
import { AddressFormComponent, LoadAddressFormComponent } from "./Entities/Address/address.form.component";
import { AdvertisingBlindBoxFormComponent, LoadAdvertisingBlindBoxFormComponent } from "./Entities/AdvertisingBlindBox/advertisingblindbox.form.component";
import { AdvertisingColorCodeFormComponent, LoadAdvertisingColorCodeFormComponent } from "./Entities/AdvertisingColorCode/advertisingcolorcode.form.component";
import { AdvertisingContractPublicationFormComponent, LoadAdvertisingContractPublicationFormComponent } from "./Entities/AdvertisingContractPublication/advertisingcontractpublication.form.component";
import { AdvertisingContractSalesRepresentativeFormComponent, LoadAdvertisingContractSalesRepresentativeFormComponent } from "./Entities/AdvertisingContractSalesRepresentative/advertisingcontractsalesrepresentative.form.component";
import { AdvertisingContractFormComponent, LoadAdvertisingContractFormComponent } from "./Entities/AdvertisingContract/advertisingcontract.form.component";
import { AdvertisingFileTypeFormComponent, LoadAdvertisingFileTypeFormComponent } from "./Entities/AdvertisingFileType/advertisingfiletype.form.component";
import { AdvertisingFrequencyCodeFormComponent, LoadAdvertisingFrequencyCodeFormComponent } from "./Entities/AdvertisingFrequencyCode/advertisingfrequencycode.form.component";
import { AdvertisingInsertionOrdAdjustHistoryFormComponent, LoadAdvertisingInsertionOrdAdjustHistoryFormComponent } from "./Entities/AdvertisingInsertionOrdAdjustHistory/advertisinginsertionordadjusthistory.form.component";
import { AdvertisingInsertionOrdBillToFormComponent, LoadAdvertisingInsertionOrdBillToFormComponent } from "./Entities/AdvertisingInsertionOrdBillTo/advertisinginsertionordbillto.form.component";
import { AdvertisingInsertionOrdSalesRepFormComponent, LoadAdvertisingInsertionOrdSalesRepFormComponent } from "./Entities/AdvertisingInsertionOrdSalesRep/advertisinginsertionordsalesrep.form.component";
import { AdvertisingInsertionOrderFormComponent, LoadAdvertisingInsertionOrderFormComponent } from "./Entities/AdvertisingInsertionOrder/advertisinginsertionorder.form.component";
import { AdvertisingOptionsFormComponent, LoadAdvertisingOptionsFormComponent } from "./Entities/AdvertisingOptions/advertisingoptions.form.component";
import { AdvertisingPositionCodeFormComponent, LoadAdvertisingPositionCodeFormComponent } from "./Entities/AdvertisingPositionCode/advertisingpositioncode.form.component";
import { AdvertisingPriceOverrideReasonFormComponent, LoadAdvertisingPriceOverrideReasonFormComponent } from "./Entities/AdvertisingPriceOverrideReason/advertisingpriceoverridereason.form.component";
import { AdvertisingProductSectionFormComponent, LoadAdvertisingProductSectionFormComponent } from "./Entities/AdvertisingProductSection/advertisingproductsection.form.component";
import { AdvertisingRateCardDeadlineFormComponent, LoadAdvertisingRateCardDeadlineFormComponent } from "./Entities/AdvertisingRateCardDeadline/advertisingratecarddeadline.form.component";
import { AdvertisingRateCardRateOptionFormComponent, LoadAdvertisingRateCardRateOptionFormComponent } from "./Entities/AdvertisingRateCardRateOption/advertisingratecardrateoption.form.component";
import { AdvertisingRateCardRateSectionFormComponent, LoadAdvertisingRateCardRateSectionFormComponent } from "./Entities/AdvertisingRateCardRateSection/advertisingratecardratesection.form.component";
import { AdvertisingRateCardRateFormComponent, LoadAdvertisingRateCardRateFormComponent } from "./Entities/AdvertisingRateCardRate/advertisingratecardrate.form.component";
import { AdvertisingRateCardFormComponent, LoadAdvertisingRateCardFormComponent } from "./Entities/AdvertisingRateCard/advertisingratecard.form.component";
import { AdvertisingSizeCodeFormComponent, LoadAdvertisingSizeCodeFormComponent } from "./Entities/AdvertisingSizeCode/advertisingsizecode.form.component";
import { AdvertisingUnitDefinitionFormComponent, LoadAdvertisingUnitDefinitionFormComponent } from "./Entities/AdvertisingUnitDefinition/advertisingunitdefinition.form.component";
import { AnswerSheetAnswerFormComponent, LoadAnswerSheetAnswerFormComponent } from "./Entities/AnswerSheetAnswer/answersheetanswer.form.component";
import { AnswerSheetFormComponent, LoadAnswerSheetFormComponent } from "./Entities/AnswerSheet/answersheet.form.component";
import { AttendeeStatusFormComponent, LoadAttendeeStatusFormComponent } from "./Entities/AttendeeStatus/attendeestatus.form.component";
import { AwardGrantedFormComponent, LoadAwardGrantedFormComponent } from "./Entities/AwardGranted/awardgranted.form.component";
import { AwardNominationFormComponent, LoadAwardNominationFormComponent } from "./Entities/AwardNomination/awardnomination.form.component";
import { AwardTypeFormComponent, LoadAwardTypeFormComponent } from "./Entities/AwardType/awardtype.form.component";
import { BatchAccountEntryFormComponent, LoadBatchAccountEntryFormComponent } from "./Entities/BatchAccountEntry/batchaccountentry.form.component";
import { BatchExportTypeFormComponent, LoadBatchExportTypeFormComponent } from "./Entities/BatchExportType/batchexporttype.form.component";
import { BatchFormComponent, LoadBatchFormComponent } from "./Entities/Batch/batch.form.component";
import { BoothFormComponent, LoadBoothFormComponent } from "./Entities/Booth/booth.form.component";
import { CampaignActivityForecastFormComponent, LoadCampaignActivityForecastFormComponent } from "./Entities/CampaignActivityForecast/campaignactivityforecast.form.component";
import { CampaignCostTypeFormComponent, LoadCampaignCostTypeFormComponent } from "./Entities/CampaignCostType/campaigncosttype.form.component";
import { CampaignCostFormComponent, LoadCampaignCostFormComponent } from "./Entities/CampaignCost/campaigncost.form.component";
import { CampaignDocStatusTypeFormComponent, LoadCampaignDocStatusTypeFormComponent } from "./Entities/CampaignDocStatusType/campaigndocstatustype.form.component";
import { CampaignDocumentTypeFormComponent, LoadCampaignDocumentTypeFormComponent } from "./Entities/CampaignDocumentType/campaigndocumenttype.form.component";
import { CampaignDocumentFormComponent, LoadCampaignDocumentFormComponent } from "./Entities/CampaignDocument/campaigndocument.form.component";
import { CampaignGLAccountFormComponent, LoadCampaignGLAccountFormComponent } from "./Entities/CampaignGLAccount/campaignglaccount.form.component";
import { CampaignImportFileColumnFormComponent, LoadCampaignImportFileColumnFormComponent } from "./Entities/CampaignImportFileColumn/campaignimportfilecolumn.form.component";
import { CampaignLinkedDocumentFormComponent, LoadCampaignLinkedDocumentFormComponent } from "./Entities/CampaignLinkedDocument/campaignlinkeddocument.form.component";
import { CampaignListDetailFormComponent, LoadCampaignListDetailFormComponent } from "./Entities/CampaignListDetail/campaignlistdetail.form.component";
import { CampaignProductCategoryFormComponent, LoadCampaignProductCategoryFormComponent } from "./Entities/CampaignProductCategory/campaignproductcategory.form.component";
import { CampaignProductFormComponent, LoadCampaignProductFormComponent } from "./Entities/CampaignProduct/campaignproduct.form.component";
import { CampaignProspectStatusTypeFormComponent, LoadCampaignProspectStatusTypeFormComponent } from "./Entities/CampaignProspectStatusType/campaignprospectstatustype.form.component";
import { CampaignSegmentDocumentFormComponent, LoadCampaignSegmentDocumentFormComponent } from "./Entities/CampaignSegmentDocument/campaignsegmentdocument.form.component";
import { CampaignSegmentFormComponent, LoadCampaignSegmentFormComponent } from "./Entities/CampaignSegment/campaignsegment.form.component";
import { CampaignStatusTypeFormComponent, LoadCampaignStatusTypeFormComponent } from "./Entities/CampaignStatusType/campaignstatustype.form.component";
import { CampaignTypeFormComponent, LoadCampaignTypeFormComponent } from "./Entities/CampaignType/campaigntype.form.component";
import { CampaignFormComponent, LoadCampaignFormComponent } from "./Entities/Campaign/campaign.form.component";
import { CancellationOrderlinesFormComponent, LoadCancellationOrderlinesFormComponent } from "./Entities/CancellationOrderlines/cancellationorderlines.form.component";
import { CancellationReasonFormComponent, LoadCancellationReasonFormComponent } from "./Entities/CancellationReason/cancellationreason.form.component";
import { CaseAssigneeDefaultFormComponent, LoadCaseAssigneeDefaultFormComponent } from "./Entities/CaseAssigneeDefault/caseassigneedefault.form.component";
import { CaseAssigneePostalCodeFormComponent, LoadCaseAssigneePostalCodeFormComponent } from "./Entities/CaseAssigneePostalCode/caseassigneepostalcode.form.component";
import { CaseAssigneeFormComponent, LoadCaseAssigneeFormComponent } from "./Entities/CaseAssignee/caseassignee.form.component";
import { CaseCategoryFormComponent, LoadCaseCategoryFormComponent } from "./Entities/CaseCategory/casecategory.form.component";
import { CaseCostTypeFormComponent, LoadCaseCostTypeFormComponent } from "./Entities/CaseCostType/casecosttype.form.component";
import { CaseCostFormComponent, LoadCaseCostFormComponent } from "./Entities/CaseCost/casecost.form.component";
import { CaseIssueFormComponent, LoadCaseIssueFormComponent } from "./Entities/CaseIssue/caseissue.form.component";
import { CasePriorityFormComponent, LoadCasePriorityFormComponent } from "./Entities/CasePriority/casepriority.form.component";
import { CaseReasonFormComponent, LoadCaseReasonFormComponent } from "./Entities/CaseReason/casereason.form.component";
import { CaseReportMethodFormComponent, LoadCaseReportMethodFormComponent } from "./Entities/CaseReportMethod/casereportmethod.form.component";
import { CaseReporterFormComponent, LoadCaseReporterFormComponent } from "./Entities/CaseReporter/casereporter.form.component";
import { CaseResultFormComponent, LoadCaseResultFormComponent } from "./Entities/CaseResult/caseresult.form.component";
import { CaseRoleFormComponent, LoadCaseRoleFormComponent } from "./Entities/CaseRole/caserole.form.component";
import { CaseSatisfactionLevelFormComponent, LoadCaseSatisfactionLevelFormComponent } from "./Entities/CaseSatisfactionLevel/casesatisfactionlevel.form.component";
import { CaseStatusFormComponent, LoadCaseStatusFormComponent } from "./Entities/CaseStatus/casestatus.form.component";
import { CaseSurveyMethodFormComponent, LoadCaseSurveyMethodFormComponent } from "./Entities/CaseSurveyMethod/casesurveymethod.form.component";
import { CaseTypeFormComponent, LoadCaseTypeFormComponent } from "./Entities/CaseType/casetype.form.component";
import { CasesFormComponent, LoadCasesFormComponent } from "./Entities/Cases/cases.form.component";
import { CashCtrlBatchDetailAllocFormComponent, LoadCashCtrlBatchDetailAllocFormComponent } from "./Entities/CashCtrlBatchDetailAlloc/cashctrlbatchdetailalloc.form.component";
import { CashCtrlBatchDetailFormComponent, LoadCashCtrlBatchDetailFormComponent } from "./Entities/CashCtrlBatchDetail/cashctrlbatchdetail.form.component";
import { CashCtrlBatchFormComponent, LoadCashCtrlBatchFormComponent } from "./Entities/CashCtrlBatch/cashctrlbatch.form.component";
import { CertificationAnswerSheetFormComponent, LoadCertificationAnswerSheetFormComponent } from "./Entities/CertificationAnswerSheet/certificationanswersheet.form.component";
import { CertificationFormComponent, LoadCertificationFormComponent } from "./Entities/Certification/certification.form.component";
import { CESPlanKPIMetricFormComponent, LoadCESPlanKPIMetricFormComponent } from "./Entities/CESPlanKPIMetric/cesplankpimetric.form.component";
import { CESPlanKPIRunMappingFormComponent, LoadCESPlanKPIRunMappingFormComponent } from "./Entities/CESPlanKPIRunMapping/cesplankpirunmapping.form.component";
import { CESPlanFormComponent, LoadCESPlanFormComponent } from "./Entities/CESPlan/cesplan.form.component";
import { CESPointFormComponent, LoadCESPointFormComponent } from "./Entities/CESPoint/cespoint.form.component";
import { CESScoreFormComponent, LoadCESScoreFormComponent } from "./Entities/CESScore/cesscore.form.component";
import { ChapterAssignmentRuleFormComponent, LoadChapterAssignmentRuleFormComponent } from "./Entities/ChapterAssignmentRule/chapterassignmentrule.form.component";
import { ChapterAuthorizationFormComponent, LoadChapterAuthorizationFormComponent } from "./Entities/ChapterAuthorization/chapterauthorization.form.component";
import { ChapterMeetingFormComponent, LoadChapterMeetingFormComponent } from "./Entities/ChapterMeeting/chaptermeeting.form.component";
import { ChapterMembershipProductFormComponent, LoadChapterMembershipProductFormComponent } from "./Entities/ChapterMembershipProduct/chaptermembershipproduct.form.component";
import { ChapterReportCategoryFormComponent, LoadChapterReportCategoryFormComponent } from "./Entities/ChapterReportCategory/chapterreportcategory.form.component";
import { ChapterReportFormComponent, LoadChapterReportFormComponent } from "./Entities/ChapterReport/chapterreport.form.component";
import { ChapterRoleTypeAuthorizationFormComponent, LoadChapterRoleTypeAuthorizationFormComponent } from "./Entities/ChapterRoleTypeAuthorization/chapterroletypeauthorization.form.component";
import { ChapterRoleTypeFormComponent, LoadChapterRoleTypeFormComponent } from "./Entities/ChapterRoleType/chapterroletype.form.component";
import { ChapterRoleFormComponent, LoadChapterRoleFormComponent } from "./Entities/ChapterRole/chapterrole.form.component";
import { ClassCertificatePrintRunFormComponent, LoadClassCertificatePrintRunFormComponent } from "./Entities/ClassCertificatePrintRun/classcertificateprintrun.form.component";
import { ClassExamFormComponent, LoadClassExamFormComponent } from "./Entities/ClassExam/classexam.form.component";
import { ClassExpectedStudentFormComponent, LoadClassExpectedStudentFormComponent } from "./Entities/ClassExpectedStudent/classexpectedstudent.form.component";
import { ClassPartUseFormComponent, LoadClassPartUseFormComponent } from "./Entities/ClassPartUse/classpartuse.form.component";
import { ClassRegistrationPartStatusFormComponent, LoadClassRegistrationPartStatusFormComponent } from "./Entities/ClassRegistrationPartStatus/classregistrationpartstatus.form.component";
import { ClassRegistrationFormComponent, LoadClassRegistrationFormComponent } from "./Entities/ClassRegistration/classregistration.form.component";
import { ClassReqDesigFormComponent, LoadClassReqDesigFormComponent } from "./Entities/ClassReqDesig/classreqdesig.form.component";
import { ClassScheduleAgendaFormComponent, LoadClassScheduleAgendaFormComponent } from "./Entities/ClassScheduleAgenda/classscheduleagenda.form.component";
import { ClassScheduleFormComponent, LoadClassScheduleFormComponent } from "./Entities/ClassSchedule/classschedule.form.component";
import { ClassFormComponent, LoadClassFormComponent } from "./Entities/Class/class.form.component";
import { CommissionAgmtDetTierFormComponent, LoadCommissionAgmtDetTierFormComponent } from "./Entities/CommissionAgmtDetTier/commissionagmtdettier.form.component";
import { CommissionAgreementDetailFormComponent, LoadCommissionAgreementDetailFormComponent } from "./Entities/CommissionAgreementDetail/commissionagreementdetail.form.component";
import { CommissionAgreementFormComponent, LoadCommissionAgreementFormComponent } from "./Entities/CommissionAgreement/commissionagreement.form.component";
import { CommissionBaseFormulaFormComponent, LoadCommissionBaseFormulaFormComponent } from "./Entities/CommissionBaseFormula/commissionbaseformula.form.component";
import { CommissionPayDetAdjustmentFormComponent, LoadCommissionPayDetAdjustmentFormComponent } from "./Entities/CommissionPayDetAdjustment/commissionpaydetadjustment.form.component";
import { CommissionPayDetTierFormComponent, LoadCommissionPayDetTierFormComponent } from "./Entities/CommissionPayDetTier/commissionpaydettier.form.component";
import { CommissionPaySourceDetailFormComponent, LoadCommissionPaySourceDetailFormComponent } from "./Entities/CommissionPaySourceDetail/commissionpaysourcedetail.form.component";
import { CommissionPaymentDetailFormComponent, LoadCommissionPaymentDetailFormComponent } from "./Entities/CommissionPaymentDetail/commissionpaymentdetail.form.component";
import { CommissionPaymentFormComponent, LoadCommissionPaymentFormComponent } from "./Entities/CommissionPayment/commissionpayment.form.component";
import { CommissionPlanDetailFormComponent, LoadCommissionPlanDetailFormComponent } from "./Entities/CommissionPlanDetail/commissionplandetail.form.component";
import { CommissionPlanItemFormComponent, LoadCommissionPlanItemFormComponent } from "./Entities/CommissionPlanItem/commissionplanitem.form.component";
import { CommissionPlanFormComponent, LoadCommissionPlanFormComponent } from "./Entities/CommissionPlan/commissionplan.form.component";
import { CommissionRateScaleDetailFormComponent, LoadCommissionRateScaleDetailFormComponent } from "./Entities/CommissionRateScaleDetail/commissionratescaledetail.form.component";
import { CommissionRateScaleFormComponent, LoadCommissionRateScaleFormComponent } from "./Entities/CommissionRateScale/commissionratescale.form.component";
import { CommissionSourceFormComponent, LoadCommissionSourceFormComponent } from "./Entities/CommissionSource/commissionsource.form.component";
import { CommissionTerritoryFormComponent, LoadCommissionTerritoryFormComponent } from "./Entities/CommissionTerritory/commissionterritory.form.component";
import { CommissionTypeFormComponent, LoadCommissionTypeFormComponent } from "./Entities/CommissionType/commissiontype.form.component";
import { CommitteeNomineeFormComponent, LoadCommitteeNomineeFormComponent } from "./Entities/CommitteeNominee/committeenominee.form.component";
import { CommitteeRoleFormComponent, LoadCommitteeRoleFormComponent } from "./Entities/CommitteeRole/committeerole.form.component";
import { CommitteeTermMeetingFormComponent, LoadCommitteeTermMeetingFormComponent } from "./Entities/CommitteeTermMeeting/committeetermmeeting.form.component";
import { CommitteeTermMemberFormComponent, LoadCommitteeTermMemberFormComponent } from "./Entities/CommitteeTermMember/committeetermmember.form.component";
import { CommitteeTermRenewalMembersFormComponent, LoadCommitteeTermRenewalMembersFormComponent } from "./Entities/CommitteeTermRenewalMembers/committeetermrenewalmembers.form.component";
import { CommitteeTermRenewalFormComponent, LoadCommitteeTermRenewalFormComponent } from "./Entities/CommitteeTermRenewal/committeetermrenewal.form.component";
import { CommitteeTermFormComponent, LoadCommitteeTermFormComponent } from "./Entities/CommitteeTerm/committeeterm.form.component";
import { CommitteeTypeFormComponent, LoadCommitteeTypeFormComponent } from "./Entities/CommitteeType/committeetype.form.component";
import { CommitteeFormComponent, LoadCommitteeFormComponent } from "./Entities/Committee/committee.form.component";
import { Company__dboFormComponent, LoadCompany__dboFormComponent } from "./Entities/Company__dbo/company__dbo.form.component";
import { CompanyAccountManagerFormComponent, LoadCompanyAccountManagerFormComponent } from "./Entities/CompanyAccountManager/companyaccountmanager.form.component";
import { CompanyAddressFormComponent, LoadCompanyAddressFormComponent } from "./Entities/CompanyAddress/companyaddress.form.component";
import { CompanyCompanyFormComponent, LoadCompanyCompanyFormComponent } from "./Entities/CompanyCompany/companycompany.form.component";
import { CompanyPersonFunctionFormComponent, LoadCompanyPersonFunctionFormComponent } from "./Entities/CompanyPersonFunction/companypersonfunction.form.component";
import { CompanyPersonFormComponent, LoadCompanyPersonFormComponent } from "./Entities/CompanyPerson/companyperson.form.component";
import { CompanyPhoneFormComponent, LoadCompanyPhoneFormComponent } from "./Entities/CompanyPhone/companyphone.form.component";
import { CompanyProductCodeFormComponent, LoadCompanyProductCodeFormComponent } from "./Entities/CompanyProductCode/companyproductcode.form.component";
import { CompanyRelationshipTypeFormComponent, LoadCompanyRelationshipTypeFormComponent } from "./Entities/CompanyRelationshipType/companyrelationshiptype.form.component";
import { CompanySavedPaymentMethodFormComponent, LoadCompanySavedPaymentMethodFormComponent } from "./Entities/CompanySavedPaymentMethod/companysavedpaymentmethod.form.component";
import { CompanyTaxExCodeFormComponent, LoadCompanyTaxExCodeFormComponent } from "./Entities/CompanyTaxExCode/companytaxexcode.form.component";
import { CompanyTypeFormComponent, LoadCompanyTypeFormComponent } from "./Entities/CompanyType/companytype.form.component";
import { ContactLogCategoryFormComponent, LoadContactLogCategoryFormComponent } from "./Entities/ContactLogCategory/contactlogcategory.form.component";
import { ContactLogLinkFormComponent, LoadContactLogLinkFormComponent } from "./Entities/ContactLogLink/contactloglink.form.component";
import { ContactLogTypeFormComponent, LoadContactLogTypeFormComponent } from "./Entities/ContactLogType/contactlogtype.form.component";
import { ContactLogFormComponent, LoadContactLogFormComponent } from "./Entities/ContactLog/contactlog.form.component";
import { ContinentFormComponent, LoadContinentFormComponent } from "./Entities/Continent/continent.form.component";
import { CountryFormComponent, LoadCountryFormComponent } from "./Entities/Country/country.form.component";
import { CourseCategoryFormComponent, LoadCourseCategoryFormComponent } from "./Entities/CourseCategory/coursecategory.form.component";
import { CourseEnrollmentTypeFormComponent, LoadCourseEnrollmentTypeFormComponent } from "./Entities/CourseEnrollmentType/courseenrollmenttype.form.component";
import { CourseETMaterialsFormComponent, LoadCourseETMaterialsFormComponent } from "./Entities/CourseETMaterials/courseetmaterials.form.component";
import { CourseExamFormComponent, LoadCourseExamFormComponent } from "./Entities/CourseExam/courseexam.form.component";
import { CourseInstrDesigFormComponent, LoadCourseInstrDesigFormComponent } from "./Entities/CourseInstrDesig/courseinstrdesig.form.component";
import { CourseInstructorFormComponent, LoadCourseInstructorFormComponent } from "./Entities/CourseInstructor/courseinstructor.form.component";
import { CoursePartCategoryFormComponent, LoadCoursePartCategoryFormComponent } from "./Entities/CoursePartCategory/coursepartcategory.form.component";
import { CoursePartUseFormComponent, LoadCoursePartUseFormComponent } from "./Entities/CoursePartUse/coursepartuse.form.component";
import { CoursePartFormComponent, LoadCoursePartFormComponent } from "./Entities/CoursePart/coursepart.form.component";
import { CoursePreReqFormComponent, LoadCoursePreReqFormComponent } from "./Entities/CoursePreReq/courseprereq.form.component";
import { CourseSchoolSubFormComponent, LoadCourseSchoolSubFormComponent } from "./Entities/CourseSchoolSub/courseschoolsub.form.component";
import { CourseSchoolFormComponent, LoadCourseSchoolFormComponent } from "./Entities/CourseSchool/courseschool.form.component";
import { CourseFormComponent, LoadCourseFormComponent } from "./Entities/Course/course.form.component";
import { CreditCardTypeFormComponent, LoadCreditCardTypeFormComponent } from "./Entities/CreditCardType/creditcardtype.form.component";
import { CreditStatusFormComponent, LoadCreditStatusFormComponent } from "./Entities/CreditStatus/creditstatus.form.component";
import { CreditStatusApproverFormComponent, LoadCreditStatusApproverFormComponent } from "./Entities/CreditStatusApprover/creditstatusapprover.form.component";
import { CultureFormatFormComponent, LoadCultureFormatFormComponent } from "./Entities/CultureFormat/cultureformat.form.component";
import { CultureStringCategoryFormComponent, LoadCultureStringCategoryFormComponent } from "./Entities/CultureStringCategory/culturestringcategory.form.component";
import { CultureStringLocalFormComponent, LoadCultureStringLocalFormComponent } from "./Entities/CultureStringLocal/culturestringlocal.form.component";
import { CultureStringFormComponent, LoadCultureStringFormComponent } from "./Entities/CultureString/culturestring.form.component";
import { CultureFormComponent, LoadCultureFormComponent } from "./Entities/Culture/culture.form.component";
import { CurrencySpotRateFormComponent, LoadCurrencySpotRateFormComponent } from "./Entities/CurrencySpotRate/currencyspotrate.form.component";
import { CurrencyTypeFormComponent, LoadCurrencyTypeFormComponent } from "./Entities/CurrencyType/currencytype.form.component";
import { CurriculumApplicationDetailFormComponent, LoadCurriculumApplicationDetailFormComponent } from "./Entities/CurriculumApplicationDetail/curriculumapplicationdetail.form.component";
import { CurriculumApplicationFormComponent, LoadCurriculumApplicationFormComponent } from "./Entities/CurriculumApplication/curriculumapplication.form.component";
import { CurriculumCategoryFormComponent, LoadCurriculumCategoryFormComponent } from "./Entities/CurriculumCategory/curriculumcategory.form.component";
import { CurriculumCourseFormComponent, LoadCurriculumCourseFormComponent } from "./Entities/CurriculumCourse/curriculumcourse.form.component";
import { CurriculumDefinitionCategoryFormComponent, LoadCurriculumDefinitionCategoryFormComponent } from "./Entities/CurriculumDefinitionCategory/curriculumdefinitioncategory.form.component";
import { CurriculumDefinitionFormComponent, LoadCurriculumDefinitionFormComponent } from "./Entities/CurriculumDefinition/curriculumdefinition.form.component";
import { CurriculumSchoolFormComponent, LoadCurriculumSchoolFormComponent } from "./Entities/CurriculumSchool/curriculumschool.form.component";
import { DepartmentFormComponent, LoadDepartmentFormComponent } from "./Entities/Department/department.form.component";
import { DiscussionForumLinkFormComponent, LoadDiscussionForumLinkFormComponent } from "./Entities/DiscussionForumLink/discussionforumlink.form.component";
import { DiscussionForumMessageFormComponent, LoadDiscussionForumMessageFormComponent } from "./Entities/DiscussionForumMessage/discussionforummessage.form.component";
import { DiscussionForumModeratorFormComponent, LoadDiscussionForumModeratorFormComponent } from "./Entities/DiscussionForumModerator/discussionforummoderator.form.component";
import { DiscussionForumSubscriptionFormComponent, LoadDiscussionForumSubscriptionFormComponent } from "./Entities/DiscussionForumSubscription/discussionforumsubscription.form.component";
import { DiscussionForumUserFormComponent, LoadDiscussionForumUserFormComponent } from "./Entities/DiscussionForumUser/discussionforumuser.form.component";
import { DiscussionForumWebGroupFormComponent, LoadDiscussionForumWebGroupFormComponent } from "./Entities/DiscussionForumWebGroup/discussionforumwebgroup.form.component";
import { DiscussionForumFormComponent, LoadDiscussionForumFormComponent } from "./Entities/DiscussionForum/discussionforum.form.component";
import { DistributionTypeFormComponent, LoadDistributionTypeFormComponent } from "./Entities/DistributionType/distributiontype.form.component";
import { DonorAdvisedFundAllocationFormComponent, LoadDonorAdvisedFundAllocationFormComponent } from "./Entities/DonorAdvisedFundAllocation/donoradvisedfundallocation.form.component";
import { DonorAdvisedFundFormComponent, LoadDonorAdvisedFundFormComponent } from "./Entities/DonorAdvisedFund/donoradvisedfund.form.component";
import { DownloadItemsFormComponent, LoadDownloadItemsFormComponent } from "./Entities/DownloadItems/downloaditems.form.component";
import { DuesCategoryFormComponent, LoadDuesCategoryFormComponent } from "./Entities/DuesCategory/duescategory.form.component";
import { EducationCategoryFormComponent, LoadEducationCategoryFormComponent } from "./Entities/EducationCategory/educationcategory.form.component";
import { EducationFieldFormComponent, LoadEducationFieldFormComponent } from "./Entities/EducationField/educationfield.form.component";
import { EducationLevelFormComponent, LoadEducationLevelFormComponent } from "./Entities/EducationLevel/educationlevel.form.component";
import { EducationStatusFormComponent, LoadEducationStatusFormComponent } from "./Entities/EducationStatus/educationstatus.form.component";
import { EducationUnitFormComponent, LoadEducationUnitFormComponent } from "./Entities/EducationUnit/educationunit.form.component";
import { EmployeePositionCodesFormComponent, LoadEmployeePositionCodesFormComponent } from "./Entities/EmployeePositionCodes/employeepositioncodes.form.component";
import { EmployeeSkill__dboFormComponent, LoadEmployeeSkill__dboFormComponent } from "./Entities/EmployeeSkill__dbo/employeeskill__dbo.form.component";
import { Employee__dboFormComponent, LoadEmployee__dboFormComponent } from "./Entities/Employee__dbo/employee__dbo.form.component";
import { EnrollmentTypeFormComponent, LoadEnrollmentTypeFormComponent } from "./Entities/EnrollmentType/enrollmenttype.form.component";
import { ExamQuestionAnswersFormComponent, LoadExamQuestionAnswersFormComponent } from "./Entities/ExamQuestionAnswers/examquestionanswers.form.component";
import { ExamQuestionFormComponent, LoadExamQuestionFormComponent } from "./Entities/ExamQuestion/examquestion.form.component";
import { ExamFormComponent, LoadExamFormComponent } from "./Entities/Exam/exam.form.component";
import { ExpoBoothConfigurationFormComponent, LoadExpoBoothConfigurationFormComponent } from "./Entities/ExpoBoothConfiguration/expoboothconfiguration.form.component";
import { ExpoFloorplanFormComponent, LoadExpoFloorplanFormComponent } from "./Entities/ExpoFloorplan/expofloorplan.form.component";
import { ExpoPriorityPointTypeFormComponent, LoadExpoPriorityPointTypeFormComponent } from "./Entities/ExpoPriorityPointType/expoprioritypointtype.form.component";
import { ExpoPriorityPointFormComponent, LoadExpoPriorityPointFormComponent } from "./Entities/ExpoPriorityPoint/expoprioritypoint.form.component";
import { ExpoFormComponent, LoadExpoFormComponent } from "./Entities/Expo/expo.form.component";
import { ExternalSystemFormComponent, LoadExternalSystemFormComponent } from "./Entities/ExternalSystem/externalsystem.form.component";
import { FloorplanStatusFormComponent, LoadFloorplanStatusFormComponent } from "./Entities/FloorplanStatus/floorplanstatus.form.component";
import { FloorplanSystemFormComponent, LoadFloorplanSystemFormComponent } from "./Entities/FloorplanSystem/floorplansystem.form.component";
import { FloorplanFormComponent, LoadFloorplanFormComponent } from "./Entities/Floorplan/floorplan.form.component";
import { FoodPreferenceFormComponent, LoadFoodPreferenceFormComponent } from "./Entities/FoodPreference/foodpreference.form.component";
import { FreightMethodsFormComponent, LoadFreightMethodsFormComponent } from "./Entities/FreightMethods/freightmethods.form.component";
import { FrequencyAgreementFormComponent, LoadFrequencyAgreementFormComponent } from "./Entities/FrequencyAgreement/frequencyagreement.form.component";
import { FunctionRoleFormComponent, LoadFunctionRoleFormComponent } from "./Entities/FunctionRole/functionrole.form.component";
import { FundCampaignGivingFormComponent, LoadFundCampaignGivingFormComponent } from "./Entities/FundCampaignGiving/fundcampaigngiving.form.component";
import { FundCampaignProductFormComponent, LoadFundCampaignProductFormComponent } from "./Entities/FundCampaignProduct/fundcampaignproduct.form.component";
import { FundCampaignSolicitorProspectFormComponent, LoadFundCampaignSolicitorProspectFormComponent } from "./Entities/FundCampaignSolicitorProspect/fundcampaignsolicitorprospect.form.component";
import { FundCampaignSolicitorFormComponent, LoadFundCampaignSolicitorFormComponent } from "./Entities/FundCampaignSolicitor/fundcampaignsolicitor.form.component";
import { FundCampaignFormComponent, LoadFundCampaignFormComponent } from "./Entities/FundCampaign/fundcampaign.form.component";
import { FundraisingPriceFormComponent, LoadFundraisingPriceFormComponent } from "./Entities/FundraisingPrice/fundraisingprice.form.component";
import { FundraisingPricingOptionFormComponent, LoadFundraisingPricingOptionFormComponent } from "./Entities/FundraisingPricingOption/fundraisingpricingoption.form.component";
import { GiftsInKindCategoriesFormComponent, LoadGiftsInKindCategoriesFormComponent } from "./Entities/GiftsInKindCategories/giftsinkindcategories.form.component";
import { GiftsInKindFormComponent, LoadGiftsInKindFormComponent } from "./Entities/GiftsInKind/giftsinkind.form.component";
import { GLAccountFormComponent, LoadGLAccountFormComponent } from "./Entities/GLAccount/glaccount.form.component";
import { GLOrderLevelFormComponent, LoadGLOrderLevelFormComponent } from "./Entities/GLOrderLevel/glorderlevel.form.component";
import { GLPaymentLevelFormComponent, LoadGLPaymentLevelFormComponent } from "./Entities/GLPaymentLevel/glpaymentlevel.form.component";
import { GrantDisbursementFormComponent, LoadGrantDisbursementFormComponent } from "./Entities/GrantDisbursement/grantdisbursement.form.component";
import { GrantDueDiligenceStepLinkFormComponent, LoadGrantDueDiligenceStepLinkFormComponent } from "./Entities/GrantDueDiligenceStepLink/grantduediligencesteplink.form.component";
import { GrantDueDiligenceStepFormComponent, LoadGrantDueDiligenceStepFormComponent } from "./Entities/GrantDueDiligenceStep/grantduediligencestep.form.component";
import { GrantReportPaymentLinkFormComponent, LoadGrantReportPaymentLinkFormComponent } from "./Entities/GrantReportPaymentLink/grantreportpaymentlink.form.component";
import { GrantReportFormComponent, LoadGrantReportFormComponent } from "./Entities/GrantReport/grantreport.form.component";
import { GrantsFormComponent, LoadGrantsFormComponent } from "./Entities/Grants/grants.form.component";
import { HousingBlockOptionFormComponent, LoadHousingBlockOptionFormComponent } from "./Entities/HousingBlockOption/housingblockoption.form.component";
import { HousingBlockRoomFormComponent, LoadHousingBlockRoomFormComponent } from "./Entities/HousingBlockRoom/housingblockroom.form.component";
import { HousingBlockFormComponent, LoadHousingBlockFormComponent } from "./Entities/HousingBlock/housingblock.form.component";
import { HousingReservationDetOptionFormComponent, LoadHousingReservationDetOptionFormComponent } from "./Entities/HousingReservationDetOption/housingreservationdetoption.form.component";
import { HousingReservationDetailFormComponent, LoadHousingReservationDetailFormComponent } from "./Entities/HousingReservationDetail/housingreservationdetail.form.component";
import { HousingReservationGuestFormComponent, LoadHousingReservationGuestFormComponent } from "./Entities/HousingReservationGuest/housingreservationguest.form.component";
import { HousingReservationFormComponent, LoadHousingReservationFormComponent } from "./Entities/HousingReservation/housingreservation.form.component";
import { HousingRoomTypeFormComponent, LoadHousingRoomTypeFormComponent } from "./Entities/HousingRoomType/housingroomtype.form.component";
import { HousingTransferDetailFormComponent, LoadHousingTransferDetailFormComponent } from "./Entities/HousingTransferDetail/housingtransferdetail.form.component";
import { HousingTransferTypeFormComponent, LoadHousingTransferTypeFormComponent } from "./Entities/HousingTransferType/housingtransfertype.form.component";
import { HousingTransferFormComponent, LoadHousingTransferFormComponent } from "./Entities/HousingTransfer/housingtransfer.form.component";
import { HousingFormComponent, LoadHousingFormComponent } from "./Entities/Housing/housing.form.component";
import { InstantMessagingUserProfileFormComponent, LoadInstantMessagingUserProfileFormComponent } from "./Entities/InstantMessagingUserProfile/instantmessaginguserprofile.form.component";
import { InstructorDesignationFormComponent, LoadInstructorDesignationFormComponent } from "./Entities/InstructorDesignation/instructordesignation.form.component";
import { InternationalSupportFundCategoryFormComponent, LoadInternationalSupportFundCategoryFormComponent } from "./Entities/InternationalSupportFundCategory/internationalsupportfundcategory.form.component";
import { InternationalSupportFundFormComponent, LoadInternationalSupportFundFormComponent } from "./Entities/InternationalSupportFund/internationalsupportfund.form.component";
import { InventoryLocationFormComponent, LoadInventoryLocationFormComponent } from "./Entities/InventoryLocation/inventorylocation.form.component";
import { InventoryOnOrderFormComponent, LoadInventoryOnOrderFormComponent } from "./Entities/InventoryOnOrder/inventoryonorder.form.component";
import { InventoryTransferFormComponent, LoadInventoryTransferFormComponent } from "./Entities/InventoryTransfer/inventorytransfer.form.component";
import { InvoiceConsolidationOrderFormComponent, LoadInvoiceConsolidationOrderFormComponent } from "./Entities/InvoiceConsolidationOrder/invoiceconsolidationorder.form.component";
import { InvoiceConsolidationPaymentFormComponent, LoadInvoiceConsolidationPaymentFormComponent } from "./Entities/InvoiceConsolidationPayment/invoiceconsolidationpayment.form.component";
import { InvoiceConsolidationFormComponent, LoadInvoiceConsolidationFormComponent } from "./Entities/InvoiceConsolidation/invoiceconsolidation.form.component";
import { InvoiceMessageFormComponent, LoadInvoiceMessageFormComponent } from "./Entities/InvoiceMessage/invoicemessage.form.component";
import { IssueCategoryFormComponent, LoadIssueCategoryFormComponent } from "./Entities/IssueCategory/issuecategory.form.component";
import { IssueFormComponent, LoadIssueFormComponent } from "./Entities/Issue/issue.form.component";
import { ItemRatingEntryFormComponent, LoadItemRatingEntryFormComponent } from "./Entities/ItemRatingEntry/itemratingentry.form.component";
import { ItemRatingTypeDefinitionFormComponent, LoadItemRatingTypeDefinitionFormComponent } from "./Entities/ItemRatingTypeDefinition/itemratingtypedefinition.form.component";
import { ItemRatingTypeFormComponent, LoadItemRatingTypeFormComponent } from "./Entities/ItemRatingType/itemratingtype.form.component";
import { ItemRatingFormComponent, LoadItemRatingFormComponent } from "./Entities/ItemRating/itemrating.form.component";
import { ItemReviewEntriesFormComponent, LoadItemReviewEntriesFormComponent } from "./Entities/ItemReviewEntries/itemreviewentries.form.component";
import { KeyPerformanceIndicatorFormComponent, LoadKeyPerformanceIndicatorFormComponent } from "./Entities/KeyPerformanceIndicator/keyperformanceindicator.form.component";
import { KnowledgeAnswerFormComponent, LoadKnowledgeAnswerFormComponent } from "./Entities/KnowledgeAnswer/knowledgeanswer.form.component";
import { KnowledgeCaptureModeFormComponent, LoadKnowledgeCaptureModeFormComponent } from "./Entities/KnowledgeCaptureMode/knowledgecapturemode.form.component";
import { KnowledgeCategoryFormComponent, LoadKnowledgeCategoryFormComponent } from "./Entities/KnowledgeCategory/knowledgecategory.form.component";
import { KnowledgeDeliveryTypeFormComponent, LoadKnowledgeDeliveryTypeFormComponent } from "./Entities/KnowledgeDeliveryType/knowledgedeliverytype.form.component";
import { KnowledgeParticipantFormComponent, LoadKnowledgeParticipantFormComponent } from "./Entities/KnowledgeParticipant/knowledgeparticipant.form.component";
import { KnowledgeResultDetailFormComponent, LoadKnowledgeResultDetailFormComponent } from "./Entities/KnowledgeResultDetail/knowledgeresultdetail.form.component";
import { KnowledgeResultFormComponent, LoadKnowledgeResultFormComponent } from "./Entities/KnowledgeResult/knowledgeresult.form.component";
import { KnowledgeStatusFormComponent, LoadKnowledgeStatusFormComponent } from "./Entities/KnowledgeStatus/knowledgestatus.form.component";
import { KnowledgeStyleSheetFormComponent, LoadKnowledgeStyleSheetFormComponent } from "./Entities/KnowledgeStyleSheet/knowledgestylesheet.form.component";
import { KnowledgeTrackingTypeFormComponent, LoadKnowledgeTrackingTypeFormComponent } from "./Entities/KnowledgeTrackingType/knowledgetrackingtype.form.component";
import { KPIFormulaFormComponent, LoadKPIFormulaFormComponent } from "./Entities/KPIFormula/kpiformula.form.component";
import { KPIMetricMappingFormComponent, LoadKPIMetricMappingFormComponent } from "./Entities/KPIMetricMapping/kpimetricmapping.form.component";
import { KPIMetricFormComponent, LoadKPIMetricFormComponent } from "./Entities/KPIMetric/kpimetric.form.component";
import { KPIResultParticipantRecordFormComponent, LoadKPIResultParticipantRecordFormComponent } from "./Entities/KPIResultParticipantRecord/kpiresultparticipantrecord.form.component";
import { KPIResultFormComponent, LoadKPIResultFormComponent } from "./Entities/KPIResult/kpiresult.form.component";
import { KPIRunFormComponent, LoadKPIRunFormComponent } from "./Entities/KPIRun/kpirun.form.component";
import { KPIUnitTypeFormComponent, LoadKPIUnitTypeFormComponent } from "./Entities/KPIUnitType/kpiunittype.form.component";
import { LearningManagementSystemAttributeFormComponent, LoadLearningManagementSystemAttributeFormComponent } from "./Entities/LearningManagementSystemAttribute/learningmanagementsystemattribute.form.component";
import { LearningManagementSystemInteractionFormComponent, LoadLearningManagementSystemInteractionFormComponent } from "./Entities/LearningManagementSystemInteraction/learningmanagementsysteminteraction.form.component";
import { LearningManagementSystemFormComponent, LoadLearningManagementSystemFormComponent } from "./Entities/LearningManagementSystem/learningmanagementsystem.form.component";
import { ListDetailArchiveFormComponent, LoadListDetailArchiveFormComponent } from "./Entities/ListDetailArchive/listdetailarchive.form.component";
import { ListDetail__dboFormComponent, LoadListDetail__dboFormComponent } from "./Entities/ListDetail__dbo/listdetail__dbo.form.component";
import { ListTypeFormComponent, LoadListTypeFormComponent } from "./Entities/ListType/listtype.form.component";
import { List__dboFormComponent, LoadList__dboFormComponent } from "./Entities/List__dbo/list__dbo.form.component";
import { MailingActivityFormComponent, LoadMailingActivityFormComponent } from "./Entities/MailingActivity/mailingactivity.form.component";
import { MailingActivityDetailFormComponent, LoadMailingActivityDetailFormComponent } from "./Entities/MailingActivityDetail/mailingactivitydetail.form.component";
import { MarketPlaceCategoryFormComponent, LoadMarketPlaceCategoryFormComponent } from "./Entities/MarketPlaceCategory/marketplacecategory.form.component";
import { MarketPlaceInfoRequestFormComponent, LoadMarketPlaceInfoRequestFormComponent } from "./Entities/MarketPlaceInfoRequest/marketplaceinforequest.form.component";
import { MarketPlaceListingTypeFormComponent, LoadMarketPlaceListingTypeFormComponent } from "./Entities/MarketPlaceListingType/marketplacelistingtype.form.component";
import { MarketPlaceListingFormComponent, LoadMarketPlaceListingFormComponent } from "./Entities/MarketPlaceListing/marketplacelisting.form.component";
import { MeetingAttPossValueFormComponent, LoadMeetingAttPossValueFormComponent } from "./Entities/MeetingAttPossValue/meetingattpossvalue.form.component";
import { MeetingAttendeeGroupFormComponent, LoadMeetingAttendeeGroupFormComponent } from "./Entities/MeetingAttendeeGroup/meetingattendeegroup.form.component";
import { MeetingAttendeeTypeFormComponent, LoadMeetingAttendeeTypeFormComponent } from "./Entities/MeetingAttendeeType/meetingattendeetype.form.component";
import { MeetingAttributeFormComponent, LoadMeetingAttributeFormComponent } from "./Entities/MeetingAttribute/meetingattribute.form.component";
import { MeetingEducationUnitFormComponent, LoadMeetingEducationUnitFormComponent } from "./Entities/MeetingEducationUnit/meetingeducationunit.form.component";
import { MeetingHotelFormComponent, LoadMeetingHotelFormComponent } from "./Entities/MeetingHotel/meetinghotel.form.component";
import { MeetingResourceFormComponent, LoadMeetingResourceFormComponent } from "./Entities/MeetingResource/meetingresource.form.component";
import { MeetingRoomPossibleTypeFormComponent, LoadMeetingRoomPossibleTypeFormComponent } from "./Entities/MeetingRoomPossibleType/meetingroompossibletype.form.component";
import { MeetingRoomRoomFormComponent, LoadMeetingRoomRoomFormComponent } from "./Entities/MeetingRoomRoom/meetingroomroom.form.component";
import { MeetingRoomTypeFormComponent, LoadMeetingRoomTypeFormComponent } from "./Entities/MeetingRoomType/meetingroomtype.form.component";
import { MeetingRoomFormComponent, LoadMeetingRoomFormComponent } from "./Entities/MeetingRoom/meetingroom.form.component";
import { MeetingSessionFormComponent, LoadMeetingSessionFormComponent } from "./Entities/MeetingSession/meetingsession.form.component";
import { MeetingSpeakerEvalFormComponent, LoadMeetingSpeakerEvalFormComponent } from "./Entities/MeetingSpeakerEval/meetingspeakereval.form.component";
import { MeetingSpeakerFormComponent, LoadMeetingSpeakerFormComponent } from "./Entities/MeetingSpeaker/meetingspeaker.form.component";
import { MeetingSponsorFormComponent, LoadMeetingSponsorFormComponent } from "./Entities/MeetingSponsor/meetingsponsor.form.component";
import { MeetingStatusFormComponent, LoadMeetingStatusFormComponent } from "./Entities/MeetingStatus/meetingstatus.form.component";
import { MeetingTimeSlotFormComponent, LoadMeetingTimeSlotFormComponent } from "./Entities/MeetingTimeSlot/meetingtimeslot.form.component";
import { MeetingTrackFormComponent, LoadMeetingTrackFormComponent } from "./Entities/MeetingTrack/meetingtrack.form.component";
import { MeetingTransferEmailFormComponent, LoadMeetingTransferEmailFormComponent } from "./Entities/MeetingTransferEmail/meetingtransferemail.form.component";
import { MeetingTransferFormComponent, LoadMeetingTransferFormComponent } from "./Entities/MeetingTransfer/meetingtransfer.form.component";
import { MeetingTypeAttPossValueFormComponent, LoadMeetingTypeAttPossValueFormComponent } from "./Entities/MeetingTypeAttPossValue/meetingtypeattpossvalue.form.component";
import { MeetingTypeAttributeFormComponent, LoadMeetingTypeAttributeFormComponent } from "./Entities/MeetingTypeAttribute/meetingtypeattribute.form.component";
import { MeetingTypeFormComponent, LoadMeetingTypeFormComponent } from "./Entities/MeetingType/meetingtype.form.component";
import { MeetingFormComponent, LoadMeetingFormComponent } from "./Entities/Meeting/meeting.form.component";
import { MemberStatusTypeFormComponent, LoadMemberStatusTypeFormComponent } from "./Entities/MemberStatusType/memberstatustype.form.component";
import { MemberTypeFormComponent, LoadMemberTypeFormComponent } from "./Entities/MemberType/membertype.form.component";
import { MembershipApplicationDefinitionProductFormComponent, LoadMembershipApplicationDefinitionProductFormComponent } from "./Entities/MembershipApplicationDefinitionProduct/membershipapplicationdefinitionproduct.form.component";
import { MembershipApplicationDefinitionFormComponent, LoadMembershipApplicationDefinitionFormComponent } from "./Entities/MembershipApplicationDefinition/membershipapplicationdefinition.form.component";
import { MembershipApplicationFormComponent, LoadMembershipApplicationFormComponent } from "./Entities/MembershipApplication/membershipapplication.form.component";
import { MembershipEmailSchedulesFormComponent, LoadMembershipEmailSchedulesFormComponent } from "./Entities/MembershipEmailSchedules/membershipemailschedules.form.component";
import { MembershipEnrollmentFormComponent, LoadMembershipEnrollmentFormComponent } from "./Entities/MembershipEnrollment/membershipenrollment.form.component";
import { MembershipStatusFormComponent, LoadMembershipStatusFormComponent } from "./Entities/MembershipStatus/membershipstatus.form.component";
import { MerchantAccountFormComponent, LoadMerchantAccountFormComponent } from "./Entities/MerchantAccount/merchantaccount.form.component";
import { OpportunityFormComponent, LoadOpportunityFormComponent } from "./Entities/Opportunity/opportunity.form.component";
import { OpportunityCompetitorFormComponent, LoadOpportunityCompetitorFormComponent } from "./Entities/OpportunityCompetitor/opportunitycompetitor.form.component";
import { OpportunityContactRoleTypeFormComponent, LoadOpportunityContactRoleTypeFormComponent } from "./Entities/OpportunityContactRoleType/opportunitycontactroletype.form.component";
import { OpportunityContactFormComponent, LoadOpportunityContactFormComponent } from "./Entities/OpportunityContact/opportunitycontact.form.component";
import { OpportunityDetailFormComponent, LoadOpportunityDetailFormComponent } from "./Entities/OpportunityDetail/opportunitydetail.form.component";
import { OpportunityHistoryFormComponent, LoadOpportunityHistoryFormComponent } from "./Entities/OpportunityHistory/opportunityhistory.form.component";
import { OpportunityPartnerRoleTypeFormComponent, LoadOpportunityPartnerRoleTypeFormComponent } from "./Entities/OpportunityPartnerRoleType/opportunitypartnerroletype.form.component";
import { OpportunityPartnerRoleFormComponent, LoadOpportunityPartnerRoleFormComponent } from "./Entities/OpportunityPartnerRole/opportunitypartnerrole.form.component";
import { OpportunityPartnerFormComponent, LoadOpportunityPartnerFormComponent } from "./Entities/OpportunityPartner/opportunitypartner.form.component";
import { OpportunityReferenceTypeFormComponent, LoadOpportunityReferenceTypeFormComponent } from "./Entities/OpportunityReferenceType/opportunityreferencetype.form.component";
import { OpportunityReferenceFormComponent, LoadOpportunityReferenceFormComponent } from "./Entities/OpportunityReference/opportunityreference.form.component";
import { OpportunityRoleFormComponent, LoadOpportunityRoleFormComponent } from "./Entities/OpportunityRole/opportunityrole.form.component";
import { OpportunitySellingRoleTypeFormComponent, LoadOpportunitySellingRoleTypeFormComponent } from "./Entities/OpportunitySellingRoleType/opportunitysellingroletype.form.component";
import { OpportunitySourceFormComponent, LoadOpportunitySourceFormComponent } from "./Entities/OpportunitySource/opportunitysource.form.component";
import { OpportunityStageOpportunityTypeFormComponent, LoadOpportunityStageOpportunityTypeFormComponent } from "./Entities/OpportunityStageOpportunityType/opportunitystageopportunitytype.form.component";
import { OpportunityStageFormComponent, LoadOpportunityStageFormComponent } from "./Entities/OpportunityStage/opportunitystage.form.component";
import { OpportunityStatusReportFormComponent, LoadOpportunityStatusReportFormComponent } from "./Entities/OpportunityStatusReport/opportunitystatusreport.form.component";
import { OpportunityTypeFormComponent, LoadOpportunityTypeFormComponent } from "./Entities/OpportunityType/opportunitytype.form.component";
import { OrderBalanceFormComponent, LoadOrderBalanceFormComponent } from "./Entities/OrderBalance/orderbalance.form.component";
import { OrderBoothCoExhibitorFormComponent, LoadOrderBoothCoExhibitorFormComponent } from "./Entities/OrderBoothCoExhibitor/orderboothcoexhibitor.form.component";
import { OrderBoothDetailFormComponent, LoadOrderBoothDetailFormComponent } from "./Entities/OrderBoothDetail/orderboothdetail.form.component";
import { OrderBoothProductCodeFormComponent, LoadOrderBoothProductCodeFormComponent } from "./Entities/OrderBoothProductCode/orderboothproductcode.form.component";
import { OrderCancellationWizardFormComponent, LoadOrderCancellationWizardFormComponent } from "./Entities/OrderCancellationWizard/ordercancellationwizard.form.component";
import { OrderCurrencySpotRateFormComponent, LoadOrderCurrencySpotRateFormComponent } from "./Entities/OrderCurrencySpotRate/ordercurrencyspotrate.form.component";
import { OrderDetailFormComponent, LoadOrderDetailFormComponent } from "./Entities/OrderDetail/orderdetail.form.component";
import { OrderGLEntryFormComponent, LoadOrderGLEntryFormComponent } from "./Entities/OrderGLEntry/orderglentry.form.component";
import { OrderInvAllocationFormComponent, LoadOrderInvAllocationFormComponent } from "./Entities/OrderInvAllocation/orderinvallocation.form.component";
import { OrderLineTaxFormComponent, LoadOrderLineTaxFormComponent } from "./Entities/OrderLineTax/orderlinetax.form.component";
import { OrderMasterFormComponent, LoadOrderMasterFormComponent } from "./Entities/OrderMaster/ordermaster.form.component";
import { OrderMeetingDetailAttributeFormComponent, LoadOrderMeetingDetailAttributeFormComponent } from "./Entities/OrderMeetingDetailAttribute/ordermeetingdetailattribute.form.component";
import { OrderMeetingDetailEducationUnitFormComponent, LoadOrderMeetingDetailEducationUnitFormComponent } from "./Entities/OrderMeetingDetailEducationUnit/ordermeetingdetaileducationunit.form.component";
import { OrderMeetingDetailFormComponent, LoadOrderMeetingDetailFormComponent } from "./Entities/OrderMeetingDetail/ordermeetingdetail.form.component";
import { OrderMeetingSessionDetailFormComponent, LoadOrderMeetingSessionDetailFormComponent } from "./Entities/OrderMeetingSessionDetail/ordermeetingsessiondetail.form.component";
import { OrderPmtScheduleFormComponent, LoadOrderPmtScheduleFormComponent } from "./Entities/OrderPmtSchedule/orderpmtschedule.form.component";
import { OrderShipmentTaxFormComponent, LoadOrderShipmentTaxFormComponent } from "./Entities/OrderShipmentTax/ordershipmenttax.form.component";
import { OrderShipmentFormComponent, LoadOrderShipmentFormComponent } from "./Entities/OrderShipment/ordershipment.form.component";
import { OrderSourceFormComponent, LoadOrderSourceFormComponent } from "./Entities/OrderSource/ordersource.form.component";
import { OrderStateFormComponent, LoadOrderStateFormComponent } from "./Entities/OrderState/orderstate.form.component";
import { OrderStatusTypeFormComponent, LoadOrderStatusTypeFormComponent } from "./Entities/OrderStatusType/orderstatustype.form.component";
import { OrderTotalFormComponent, LoadOrderTotalFormComponent } from "./Entities/OrderTotal/ordertotal.form.component";
import { OrderTypeFormComponent, LoadOrderTypeFormComponent } from "./Entities/OrderType/ordertype.form.component";
import { OrganizationAddressFormComponent, LoadOrganizationAddressFormComponent } from "./Entities/OrganizationAddress/organizationaddress.form.component";
import { OrganizationGLAccountFormComponent, LoadOrganizationGLAccountFormComponent } from "./Entities/OrganizationGLAccount/organizationglaccount.form.component";
import { OrganizationInterCompanyGLFormComponent, LoadOrganizationInterCompanyGLFormComponent } from "./Entities/OrganizationInterCompanyGL/organizationintercompanygl.form.component";
import { OrganizationFormComponent, LoadOrganizationFormComponent } from "./Entities/Organization/organization.form.component";
import { PaymentAuthorizationFormComponent, LoadPaymentAuthorizationFormComponent } from "./Entities/PaymentAuthorization/paymentauthorization.form.component";
import { PaymentDetailFormComponent, LoadPaymentDetailFormComponent } from "./Entities/PaymentDetail/paymentdetail.form.component";
import { PaymentGLEntryFormComponent, LoadPaymentGLEntryFormComponent } from "./Entities/PaymentGLEntry/paymentglentry.form.component";
import { PaymentInformationFormComponent, LoadPaymentInformationFormComponent } from "./Entities/PaymentInformation/paymentinformation.form.component";
import { PaymentStatusTypeFormComponent, LoadPaymentStatusTypeFormComponent } from "./Entities/PaymentStatusType/paymentstatustype.form.component";
import { PaymentTypeGLAccountFormComponent, LoadPaymentTypeGLAccountFormComponent } from "./Entities/PaymentTypeGLAccount/paymenttypeglaccount.form.component";
import { PaymentTypeFormComponent, LoadPaymentTypeFormComponent } from "./Entities/PaymentType/paymenttype.form.component";
import { PaymentFormComponent, LoadPaymentFormComponent } from "./Entities/Payment/payment.form.component";
import { PersonFormComponent, LoadPersonFormComponent } from "./Entities/Person/person.form.component";
import { PersonAccountManagerFormComponent, LoadPersonAccountManagerFormComponent } from "./Entities/PersonAccountManager/personaccountmanager.form.component";
import { PersonAddressFormComponent, LoadPersonAddressFormComponent } from "./Entities/PersonAddress/personaddress.form.component";
import { PersonEducationFormComponent, LoadPersonEducationFormComponent } from "./Entities/PersonEducation/personeducation.form.component";
import { PersonExternalAccountFormComponent, LoadPersonExternalAccountFormComponent } from "./Entities/PersonExternalAccount/personexternalaccount.form.component";
import { PersonFunctionFormComponent, LoadPersonFunctionFormComponent } from "./Entities/PersonFunction/personfunction.form.component";
import { PersonPersonFormComponent, LoadPersonPersonFormComponent } from "./Entities/PersonPerson/personperson.form.component";
import { PersonPhoneFormComponent, LoadPersonPhoneFormComponent } from "./Entities/PersonPhone/personphone.form.component";
import { PersonRelationshipAttributeFormComponent, LoadPersonRelationshipAttributeFormComponent } from "./Entities/PersonRelationshipAttribute/personrelationshipattribute.form.component";
import { PersonRelationshipTypeFormComponent, LoadPersonRelationshipTypeFormComponent } from "./Entities/PersonRelationshipType/personrelationshiptype.form.component";
import { PersonSavedPaymentMethodFormComponent, LoadPersonSavedPaymentMethodFormComponent } from "./Entities/PersonSavedPaymentMethod/personsavedpaymentmethod.form.component";
import { PersonTaxExCodeFormComponent, LoadPersonTaxExCodeFormComponent } from "./Entities/PersonTaxExCode/persontaxexcode.form.component";
import { PhoneNumberFormComponent, LoadPhoneNumberFormComponent } from "./Entities/PhoneNumber/phonenumber.form.component";
import { PhoneRegionCodesFormComponent, LoadPhoneRegionCodesFormComponent } from "./Entities/PhoneRegionCodes/phoneregioncodes.form.component";
import { PledgeContactTypeFormComponent, LoadPledgeContactTypeFormComponent } from "./Entities/PledgeContactType/pledgecontacttype.form.component";
import { PledgeContactFormComponent, LoadPledgeContactFormComponent } from "./Entities/PledgeContact/pledgecontact.form.component";
import { PledgeFundFormComponent, LoadPledgeFundFormComponent } from "./Entities/PledgeFund/pledgefund.form.component";
import { PledgeGuestListFormComponent, LoadPledgeGuestListFormComponent } from "./Entities/PledgeGuestList/pledgeguestlist.form.component";
import { PledgePaymentScheduleFormComponent, LoadPledgePaymentScheduleFormComponent } from "./Entities/PledgePaymentSchedule/pledgepaymentschedule.form.component";
import { PledgeStageFormComponent, LoadPledgeStageFormComponent } from "./Entities/PledgeStage/pledgestage.form.component";
import { PledgeFormComponent, LoadPledgeFormComponent } from "./Entities/Pledge/pledge.form.component";
import { PostalCodeFormComponent, LoadPostalCodeFormComponent } from "./Entities/PostalCode/postalcode.form.component";
import { PrefCommunicationMethodFormComponent, LoadPrefCommunicationMethodFormComponent } from "./Entities/PrefCommunicationMethod/prefcommunicationmethod.form.component";
import { PrefixFormComponent, LoadPrefixFormComponent } from "./Entities/Prefix/prefix.form.component";
import { PricingRuleFormComponent, LoadPricingRuleFormComponent } from "./Entities/PricingRule/pricingrule.form.component";
import { ProdInvLedgerEntryFormComponent, LoadProdInvLedgerEntryFormComponent } from "./Entities/ProdInvLedgerEntry/prodinvledgerentry.form.component";
import { ProductAssemblyFormComponent, LoadProductAssemblyFormComponent } from "./Entities/ProductAssembly/productassembly.form.component";
import { ProductAttributeFormComponent, LoadProductAttributeFormComponent } from "./Entities/ProductAttribute/productattribute.form.component";
import { ProductCategoryFormComponent, LoadProductCategoryFormComponent } from "./Entities/ProductCategory/productcategory.form.component";
import { ProductCategoryAttribFormComponent, LoadProductCategoryAttribFormComponent } from "./Entities/ProductCategoryAttrib/productcategoryattrib.form.component";
import { ProductCategoryGLAccountFormComponent, LoadProductCategoryGLAccountFormComponent } from "./Entities/ProductCategoryGLAccount/productcategoryglaccount.form.component";
import { ProductCodeFormComponent, LoadProductCodeFormComponent } from "./Entities/ProductCode/productcode.form.component";
import { ProductCostDetailFormComponent, LoadProductCostDetailFormComponent } from "./Entities/ProductCostDetail/productcostdetail.form.component";
import { ProductCostTypeFormComponent, LoadProductCostTypeFormComponent } from "./Entities/ProductCostType/productcosttype.form.component";
import { ProductCostFormComponent, LoadProductCostFormComponent } from "./Entities/ProductCost/productcost.form.component";
import { ProductDownloadHistoryFormComponent, LoadProductDownloadHistoryFormComponent } from "./Entities/ProductDownloadHistory/productdownloadhistory.form.component";
import { ProductDownloadsFormComponent, LoadProductDownloadsFormComponent } from "./Entities/ProductDownloads/productdownloads.form.component";
import { ProductGLAccountFormComponent, LoadProductGLAccountFormComponent } from "./Entities/ProductGLAccount/productglaccount.form.component";
import { ProductHistAvgCostFormComponent, LoadProductHistAvgCostFormComponent } from "./Entities/ProductHistAvgCost/producthistavgcost.form.component";
import { ProductInvLedgerFormComponent, LoadProductInvLedgerFormComponent } from "./Entities/ProductInvLedger/productinvledger.form.component";
import { ProductInventoryLedgerEntryTransactionsFormComponent, LoadProductInventoryLedgerEntryTransactionsFormComponent } from "./Entities/ProductInventoryLedgerEntryTransactions/productinventoryledgerentrytransactions.form.component";
import { ProductIssueFormComponent, LoadProductIssueFormComponent } from "./Entities/ProductIssue/productissue.form.component";
import { ProductKitTypeFormComponent, LoadProductKitTypeFormComponent } from "./Entities/ProductKitType/productkittype.form.component";
import { ProductPriceFormComponent, LoadProductPriceFormComponent } from "./Entities/ProductPrice/productprice.form.component";
import { ProductRelationFormComponent, LoadProductRelationFormComponent } from "./Entities/ProductRelation/productrelation.form.component";
import { ProductRelationshipTypeFormComponent, LoadProductRelationshipTypeFormComponent } from "./Entities/ProductRelationshipType/productrelationshiptype.form.component";
import { ProductTypeAttributeFormComponent, LoadProductTypeAttributeFormComponent } from "./Entities/ProductTypeAttribute/producttypeattribute.form.component";
import { ProductTypeFormComponent, LoadProductTypeFormComponent } from "./Entities/ProductType/producttype.form.component";
import { ProductVendorFormComponent, LoadProductVendorFormComponent } from "./Entities/ProductVendor/productvendor.form.component";
import { ProductVersionFormComponent, LoadProductVersionFormComponent } from "./Entities/ProductVersion/productversion.form.component";
import { ProductWebTemplateFormComponent, LoadProductWebTemplateFormComponent } from "./Entities/ProductWebTemplate/productwebtemplate.form.component";
import { ProductFormComponent, LoadProductFormComponent } from "./Entities/Product/product.form.component";
import { PublicationContributorFormComponent, LoadPublicationContributorFormComponent } from "./Entities/PublicationContributor/publicationcontributor.form.component";
import { PublicationRoleFormComponent, LoadPublicationRoleFormComponent } from "./Entities/PublicationRole/publicationrole.form.component";
import { PublicationFormComponent, LoadPublicationFormComponent } from "./Entities/Publication/publication.form.component";
import { QuestionBranchAnswerBranchFormComponent, LoadQuestionBranchAnswerBranchFormComponent } from "./Entities/QuestionBranchAnswerBranch/questionbranchanswerbranch.form.component";
import { QuestionBranchFormComponent, LoadQuestionBranchFormComponent } from "./Entities/QuestionBranch/questionbranch.form.component";
import { QuestionKnowledgeAnswerFormComponent, LoadQuestionKnowledgeAnswerFormComponent } from "./Entities/QuestionKnowledgeAnswer/questionknowledgeanswer.form.component";
import { QuestionTreeKnowledgeDeliveryTypeFormComponent, LoadQuestionTreeKnowledgeDeliveryTypeFormComponent } from "./Entities/QuestionTreeKnowledgeDeliveryType/questiontreeknowledgedeliverytype.form.component";
import { QuestionTreeKnowledgeStyleSheetFormComponent, LoadQuestionTreeKnowledgeStyleSheetFormComponent } from "./Entities/QuestionTreeKnowledgeStyleSheet/questiontreeknowledgestylesheet.form.component";
import { QuestionTreeListKnowledgeStyleSheetFormComponent, LoadQuestionTreeListKnowledgeStyleSheetFormComponent } from "./Entities/QuestionTreeListKnowledgeStyleSheet/questiontreelistknowledgestylesheet.form.component";
import { QuestionTreeFormComponent, LoadQuestionTreeFormComponent } from "./Entities/QuestionTree/questiontree.form.component";
import { QuestionTypeFormComponent, LoadQuestionTypeFormComponent } from "./Entities/QuestionType/questiontype.form.component";
import { QuestionFormComponent, LoadQuestionFormComponent } from "./Entities/Question/question.form.component";
import { RatedItemTypeFormComponent, LoadRatedItemTypeFormComponent } from "./Entities/RatedItemType/rateditemtype.form.component";
import { RatedItemFormComponent, LoadRatedItemFormComponent } from "./Entities/RatedItem/rateditem.form.component";
import { ReferralRequestVendorFormComponent, LoadReferralRequestVendorFormComponent } from "./Entities/ReferralRequestVendor/referralrequestvendor.form.component";
import { ReferralRequestFormComponent, LoadReferralRequestFormComponent } from "./Entities/ReferralRequest/referralrequest.form.component";
import { ReferralTypeFormComponent, LoadReferralTypeFormComponent } from "./Entities/ReferralType/referraltype.form.component";
import { ReferralFormComponent, LoadReferralFormComponent } from "./Entities/Referral/referral.form.component";
import { RegistrationLineFormComponent, LoadRegistrationLineFormComponent } from "./Entities/RegistrationLine/registrationline.form.component";
import { ResourceType__dboFormComponent, LoadResourceType__dboFormComponent } from "./Entities/ResourceType__dbo/resourcetype__dbo.form.component";
import { ResourceFormComponent, LoadResourceFormComponent } from "./Entities/Resource/resource.form.component";
import { RestrictedCountryFormComponent, LoadRestrictedCountryFormComponent } from "./Entities/RestrictedCountry/restrictedcountry.form.component";
import { RevenueCategoryFormComponent, LoadRevenueCategoryFormComponent } from "./Entities/RevenueCategory/revenuecategory.form.component";
import { RevenueRecognitionTypeFormComponent, LoadRevenueRecognitionTypeFormComponent } from "./Entities/RevenueRecognitionType/revenuerecognitiontype.form.component";
import { SalesTargetTypeFormComponent, LoadSalesTargetTypeFormComponent } from "./Entities/SalesTargetType/salestargettype.form.component";
import { SalesTargetFormComponent, LoadSalesTargetFormComponent } from "./Entities/SalesTarget/salestarget.form.component";
import { SalesTaxRateFormComponent, LoadSalesTaxRateFormComponent } from "./Entities/SalesTaxRate/salestaxrate.form.component";
import { ScheduleTransAccountEntryFormComponent, LoadScheduleTransAccountEntryFormComponent } from "./Entities/ScheduleTransAccountEntry/scheduletransaccountentry.form.component";
import { ScheduledTransactionGroupFormComponent, LoadScheduledTransactionGroupFormComponent } from "./Entities/ScheduledTransactionGroup/scheduledtransactiongroup.form.component";
import { ScheduledTransactionFormComponent, LoadScheduledTransactionFormComponent } from "./Entities/ScheduledTransaction/scheduledtransaction.form.component";
import { ScriptLanguageFormComponent, LoadScriptLanguageFormComponent } from "./Entities/ScriptLanguage/scriptlanguage.form.component";
import { ScriptTypeFormComponent, LoadScriptTypeFormComponent } from "./Entities/ScriptType/scripttype.form.component";
import { ScriptFormComponent, LoadScriptFormComponent } from "./Entities/Script/script.form.component";
import { ShipTypeFormComponent, LoadShipTypeFormComponent } from "./Entities/ShipType/shiptype.form.component";
import { SkillLevelFormComponent, LoadSkillLevelFormComponent } from "./Entities/SkillLevel/skilllevel.form.component";
import { Skill__dboFormComponent, LoadSkill__dboFormComponent } from "./Entities/Skill__dbo/skill__dbo.form.component";
import { SocialstreamFormComponent, LoadSocialstreamFormComponent } from "./Entities/Socialstream/socialstream.form.component";
import { StandingOrProdCatFormComponent, LoadStandingOrProdCatFormComponent } from "./Entities/StandingOrProdCat/standingorprodcat.form.component";
import { StandingOrProdFormComponent, LoadStandingOrProdFormComponent } from "./Entities/StandingOrProd/standingorprod.form.component";
import { StandingOrPurchasesFormComponent, LoadStandingOrPurchasesFormComponent } from "./Entities/StandingOrPurchases/standingorpurchases.form.component";
import { StandingOrderScheduleFormComponent, LoadStandingOrderScheduleFormComponent } from "./Entities/StandingOrderSchedule/standingorderschedule.form.component";
import { StandingOrderFormComponent, LoadStandingOrderFormComponent } from "./Entities/StandingOrder/standingorder.form.component";
import { StateProvinceFormComponent, LoadStateProvinceFormComponent } from "./Entities/StateProvince/stateprovince.form.component";
import { SubsCancelReasonFormComponent, LoadSubsCancelReasonFormComponent } from "./Entities/SubsCancelReason/subscancelreason.form.component";
import { SubscriptionDeliveryLogFormComponent, LoadSubscriptionDeliveryLogFormComponent } from "./Entities/SubscriptionDeliveryLog/subscriptiondeliverylog.form.component";
import { SubscriptionDeliveryScheduleFormComponent, LoadSubscriptionDeliveryScheduleFormComponent } from "./Entities/SubscriptionDeliverySchedule/subscriptiondeliveryschedule.form.component";
import { SubscriptionFulfillmentFormComponent, LoadSubscriptionFulfillmentFormComponent } from "./Entities/SubscriptionFulfillment/subscriptionfulfillment.form.component";
import { SubscriptionPurchaseTypeFormComponent, LoadSubscriptionPurchaseTypeFormComponent } from "./Entities/SubscriptionPurchaseType/subscriptionpurchasetype.form.component";
import { SubscriptionPurchaseFormComponent, LoadSubscriptionPurchaseFormComponent } from "./Entities/SubscriptionPurchase/subscriptionpurchase.form.component";
import { SubscriptionStatusFormComponent, LoadSubscriptionStatusFormComponent } from "./Entities/SubscriptionStatus/subscriptionstatus.form.component";
import { SubscriptionTypeFormComponent, LoadSubscriptionTypeFormComponent } from "./Entities/SubscriptionType/subscriptiontype.form.component";
import { SubscriptionFormComponent, LoadSubscriptionFormComponent } from "./Entities/Subscription/subscription.form.component";
import { SuffixFormComponent, LoadSuffixFormComponent } from "./Entities/Suffix/suffix.form.component";
import { TaskLinkFormComponent, LoadTaskLinkFormComponent } from "./Entities/TaskLink/tasklink.form.component";
import { TaskTypeFormComponent, LoadTaskTypeFormComponent } from "./Entities/TaskType/tasktype.form.component";
import { TaskFormComponent, LoadTaskFormComponent } from "./Entities/Task/task.form.component";
import { TaxJurisdictionFormComponent, LoadTaxJurisdictionFormComponent } from "./Entities/TaxJurisdiction/taxjurisdiction.form.component";
import { TopicCodeLinkFormComponent, LoadTopicCodeLinkFormComponent } from "./Entities/TopicCodeLink/topiccodelink.form.component";
import { TopicCodeFormComponent, LoadTopicCodeFormComponent } from "./Entities/TopicCode/topiccode.form.component";
import { WebClickthroughFormComponent, LoadWebClickthroughFormComponent } from "./Entities/WebClickthrough/webclickthrough.form.component";
import { WebGroupFormComponent, LoadWebGroupFormComponent } from "./Entities/WebGroup/webgroup.form.component";
import { WebShoppingCartFormComponent, LoadWebShoppingCartFormComponent } from "./Entities/WebShoppingCart/webshoppingcart.form.component";
import { WebUserActivityFormComponent, LoadWebUserActivityFormComponent } from "./Entities/WebUserActivity/webuseractivity.form.component";
import { WebUserGroupFormComponent, LoadWebUserGroupFormComponent } from "./Entities/WebUserGroup/webusergroup.form.component";
import { WebUserFormComponent, LoadWebUserFormComponent } from "./Entities/WebUser/webuser.form.component";
import { AbstractCategoryDetailsComponent, LoadAbstractCategoryDetailsComponent } from "./Entities/AbstractCategory/sections/details.component"
import { AbstractDetailsComponent, LoadAbstractDetailsComponent } from "./Entities/Abstract/sections/details.component"
import { AccountingPeriodDetailsComponent, LoadAccountingPeriodDetailsComponent } from "./Entities/AccountingPeriod/sections/details.component"
import { AdInsertionOrderOptionDetailsComponent, LoadAdInsertionOrderOptionDetailsComponent } from "./Entities/AdInsertionOrderOption/sections/details.component"
import { AddressTypeDetailsComponent, LoadAddressTypeDetailsComponent } from "./Entities/AddressType/sections/details.component"
import { AddressDetailsComponent, LoadAddressDetailsComponent } from "./Entities/Address/sections/details.component"
import { AdvertisingBlindBoxDetailsComponent, LoadAdvertisingBlindBoxDetailsComponent } from "./Entities/AdvertisingBlindBox/sections/details.component"
import { AdvertisingColorCodeDetailsComponent, LoadAdvertisingColorCodeDetailsComponent } from "./Entities/AdvertisingColorCode/sections/details.component"
import { AdvertisingContractPublicationDetailsComponent, LoadAdvertisingContractPublicationDetailsComponent } from "./Entities/AdvertisingContractPublication/sections/details.component"
import { AdvertisingContractSalesRepresentativeDetailsComponent, LoadAdvertisingContractSalesRepresentativeDetailsComponent } from "./Entities/AdvertisingContractSalesRepresentative/sections/details.component"
import { AdvertisingContractDetailsComponent, LoadAdvertisingContractDetailsComponent } from "./Entities/AdvertisingContract/sections/details.component"
import { AdvertisingFileTypeDetailsComponent, LoadAdvertisingFileTypeDetailsComponent } from "./Entities/AdvertisingFileType/sections/details.component"
import { AdvertisingFrequencyCodeDetailsComponent, LoadAdvertisingFrequencyCodeDetailsComponent } from "./Entities/AdvertisingFrequencyCode/sections/details.component"
import { AdvertisingInsertionOrdAdjustHistoryDetailsComponent, LoadAdvertisingInsertionOrdAdjustHistoryDetailsComponent } from "./Entities/AdvertisingInsertionOrdAdjustHistory/sections/details.component"
import { AdvertisingInsertionOrdBillToDetailsComponent, LoadAdvertisingInsertionOrdBillToDetailsComponent } from "./Entities/AdvertisingInsertionOrdBillTo/sections/details.component"
import { AdvertisingInsertionOrdSalesRepDetailsComponent, LoadAdvertisingInsertionOrdSalesRepDetailsComponent } from "./Entities/AdvertisingInsertionOrdSalesRep/sections/details.component"
import { AdvertisingInsertionOrderDetailsComponent, LoadAdvertisingInsertionOrderDetailsComponent } from "./Entities/AdvertisingInsertionOrder/sections/details.component"
import { AdvertisingOptionsDetailsComponent, LoadAdvertisingOptionsDetailsComponent } from "./Entities/AdvertisingOptions/sections/details.component"
import { AdvertisingPositionCodeDetailsComponent, LoadAdvertisingPositionCodeDetailsComponent } from "./Entities/AdvertisingPositionCode/sections/details.component"
import { AdvertisingPriceOverrideReasonDetailsComponent, LoadAdvertisingPriceOverrideReasonDetailsComponent } from "./Entities/AdvertisingPriceOverrideReason/sections/details.component"
import { AdvertisingProductSectionDetailsComponent, LoadAdvertisingProductSectionDetailsComponent } from "./Entities/AdvertisingProductSection/sections/details.component"
import { AdvertisingRateCardDeadlineDetailsComponent, LoadAdvertisingRateCardDeadlineDetailsComponent } from "./Entities/AdvertisingRateCardDeadline/sections/details.component"
import { AdvertisingRateCardRateOptionDetailsComponent, LoadAdvertisingRateCardRateOptionDetailsComponent } from "./Entities/AdvertisingRateCardRateOption/sections/details.component"
import { AdvertisingRateCardRateSectionDetailsComponent, LoadAdvertisingRateCardRateSectionDetailsComponent } from "./Entities/AdvertisingRateCardRateSection/sections/details.component"
import { AdvertisingRateCardRateDetailsComponent, LoadAdvertisingRateCardRateDetailsComponent } from "./Entities/AdvertisingRateCardRate/sections/details.component"
import { AdvertisingRateCardDetailsComponent, LoadAdvertisingRateCardDetailsComponent } from "./Entities/AdvertisingRateCard/sections/details.component"
import { AdvertisingSizeCodeDetailsComponent, LoadAdvertisingSizeCodeDetailsComponent } from "./Entities/AdvertisingSizeCode/sections/details.component"
import { AdvertisingUnitDefinitionDetailsComponent, LoadAdvertisingUnitDefinitionDetailsComponent } from "./Entities/AdvertisingUnitDefinition/sections/details.component"
import { AnswerSheetAnswerDetailsComponent, LoadAnswerSheetAnswerDetailsComponent } from "./Entities/AnswerSheetAnswer/sections/details.component"
import { AnswerSheetDetailsComponent, LoadAnswerSheetDetailsComponent } from "./Entities/AnswerSheet/sections/details.component"
import { AttendeeStatusDetailsComponent, LoadAttendeeStatusDetailsComponent } from "./Entities/AttendeeStatus/sections/details.component"
import { AwardGrantedDetailsComponent, LoadAwardGrantedDetailsComponent } from "./Entities/AwardGranted/sections/details.component"
import { AwardNominationDetailsComponent, LoadAwardNominationDetailsComponent } from "./Entities/AwardNomination/sections/details.component"
import { AwardTypeDetailsComponent, LoadAwardTypeDetailsComponent } from "./Entities/AwardType/sections/details.component"
import { BatchAccountEntryDetailsComponent, LoadBatchAccountEntryDetailsComponent } from "./Entities/BatchAccountEntry/sections/details.component"
import { BatchExportTypeDetailsComponent, LoadBatchExportTypeDetailsComponent } from "./Entities/BatchExportType/sections/details.component"
import { BatchDetailsComponent, LoadBatchDetailsComponent } from "./Entities/Batch/sections/details.component"
import { BoothDetailsComponent, LoadBoothDetailsComponent } from "./Entities/Booth/sections/details.component"
import { CampaignActivityForecastDetailsComponent, LoadCampaignActivityForecastDetailsComponent } from "./Entities/CampaignActivityForecast/sections/details.component"
import { CampaignCostTypeDetailsComponent, LoadCampaignCostTypeDetailsComponent } from "./Entities/CampaignCostType/sections/details.component"
import { CampaignCostDetailsComponent, LoadCampaignCostDetailsComponent } from "./Entities/CampaignCost/sections/details.component"
import { CampaignDocStatusTypeDetailsComponent, LoadCampaignDocStatusTypeDetailsComponent } from "./Entities/CampaignDocStatusType/sections/details.component"
import { CampaignDocumentTypeDetailsComponent, LoadCampaignDocumentTypeDetailsComponent } from "./Entities/CampaignDocumentType/sections/details.component"
import { CampaignDocumentDetailsComponent, LoadCampaignDocumentDetailsComponent } from "./Entities/CampaignDocument/sections/details.component"
import { CampaignGLAccountDetailsComponent, LoadCampaignGLAccountDetailsComponent } from "./Entities/CampaignGLAccount/sections/details.component"
import { CampaignImportFileColumnDetailsComponent, LoadCampaignImportFileColumnDetailsComponent } from "./Entities/CampaignImportFileColumn/sections/details.component"
import { CampaignLinkedDocumentDetailsComponent, LoadCampaignLinkedDocumentDetailsComponent } from "./Entities/CampaignLinkedDocument/sections/details.component"
import { CampaignListDetailDetailsComponent, LoadCampaignListDetailDetailsComponent } from "./Entities/CampaignListDetail/sections/details.component"
import { CampaignProductCategoryDetailsComponent, LoadCampaignProductCategoryDetailsComponent } from "./Entities/CampaignProductCategory/sections/details.component"
import { CampaignProductDetailsComponent, LoadCampaignProductDetailsComponent } from "./Entities/CampaignProduct/sections/details.component"
import { CampaignProspectStatusTypeDetailsComponent, LoadCampaignProspectStatusTypeDetailsComponent } from "./Entities/CampaignProspectStatusType/sections/details.component"
import { CampaignSegmentDocumentDetailsComponent, LoadCampaignSegmentDocumentDetailsComponent } from "./Entities/CampaignSegmentDocument/sections/details.component"
import { CampaignSegmentDetailsComponent, LoadCampaignSegmentDetailsComponent } from "./Entities/CampaignSegment/sections/details.component"
import { CampaignStatusTypeDetailsComponent, LoadCampaignStatusTypeDetailsComponent } from "./Entities/CampaignStatusType/sections/details.component"
import { CampaignTypeDetailsComponent, LoadCampaignTypeDetailsComponent } from "./Entities/CampaignType/sections/details.component"
import { CampaignDetailsComponent, LoadCampaignDetailsComponent } from "./Entities/Campaign/sections/details.component"
import { CancellationOrderlinesDetailsComponent, LoadCancellationOrderlinesDetailsComponent } from "./Entities/CancellationOrderlines/sections/details.component"
import { CancellationReasonDetailsComponent, LoadCancellationReasonDetailsComponent } from "./Entities/CancellationReason/sections/details.component"
import { CaseAssigneeDefaultDetailsComponent, LoadCaseAssigneeDefaultDetailsComponent } from "./Entities/CaseAssigneeDefault/sections/details.component"
import { CaseAssigneePostalCodeDetailsComponent, LoadCaseAssigneePostalCodeDetailsComponent } from "./Entities/CaseAssigneePostalCode/sections/details.component"
import { CaseAssigneeDetailsComponent, LoadCaseAssigneeDetailsComponent } from "./Entities/CaseAssignee/sections/details.component"
import { CaseCategoryDetailsComponent, LoadCaseCategoryDetailsComponent } from "./Entities/CaseCategory/sections/details.component"
import { CaseCostTypeDetailsComponent, LoadCaseCostTypeDetailsComponent } from "./Entities/CaseCostType/sections/details.component"
import { CaseCostDetailsComponent, LoadCaseCostDetailsComponent } from "./Entities/CaseCost/sections/details.component"
import { CaseIssueDetailsComponent, LoadCaseIssueDetailsComponent } from "./Entities/CaseIssue/sections/details.component"
import { CasePriorityDetailsComponent, LoadCasePriorityDetailsComponent } from "./Entities/CasePriority/sections/details.component"
import { CaseReasonDetailsComponent, LoadCaseReasonDetailsComponent } from "./Entities/CaseReason/sections/details.component"
import { CaseReportMethodDetailsComponent, LoadCaseReportMethodDetailsComponent } from "./Entities/CaseReportMethod/sections/details.component"
import { CaseReporterDetailsComponent, LoadCaseReporterDetailsComponent } from "./Entities/CaseReporter/sections/details.component"
import { CaseResultDetailsComponent, LoadCaseResultDetailsComponent } from "./Entities/CaseResult/sections/details.component"
import { CaseRoleDetailsComponent, LoadCaseRoleDetailsComponent } from "./Entities/CaseRole/sections/details.component"
import { CaseSatisfactionLevelDetailsComponent, LoadCaseSatisfactionLevelDetailsComponent } from "./Entities/CaseSatisfactionLevel/sections/details.component"
import { CaseStatusDetailsComponent, LoadCaseStatusDetailsComponent } from "./Entities/CaseStatus/sections/details.component"
import { CaseSurveyMethodDetailsComponent, LoadCaseSurveyMethodDetailsComponent } from "./Entities/CaseSurveyMethod/sections/details.component"
import { CaseTypeDetailsComponent, LoadCaseTypeDetailsComponent } from "./Entities/CaseType/sections/details.component"
import { CasesDetailsComponent, LoadCasesDetailsComponent } from "./Entities/Cases/sections/details.component"
import { CashCtrlBatchDetailAllocDetailsComponent, LoadCashCtrlBatchDetailAllocDetailsComponent } from "./Entities/CashCtrlBatchDetailAlloc/sections/details.component"
import { CashCtrlBatchDetailDetailsComponent, LoadCashCtrlBatchDetailDetailsComponent } from "./Entities/CashCtrlBatchDetail/sections/details.component"
import { CashCtrlBatchDetailsComponent, LoadCashCtrlBatchDetailsComponent } from "./Entities/CashCtrlBatch/sections/details.component"
import { CertificationAnswerSheetDetailsComponent, LoadCertificationAnswerSheetDetailsComponent } from "./Entities/CertificationAnswerSheet/sections/details.component"
import { CertificationDetailsComponent, LoadCertificationDetailsComponent } from "./Entities/Certification/sections/details.component"
import { CESPlanKPIMetricDetailsComponent, LoadCESPlanKPIMetricDetailsComponent } from "./Entities/CESPlanKPIMetric/sections/details.component"
import { CESPlanKPIRunMappingDetailsComponent, LoadCESPlanKPIRunMappingDetailsComponent } from "./Entities/CESPlanKPIRunMapping/sections/details.component"
import { CESPlanDetailsComponent, LoadCESPlanDetailsComponent } from "./Entities/CESPlan/sections/details.component"
import { CESPointDetailsComponent, LoadCESPointDetailsComponent } from "./Entities/CESPoint/sections/details.component"
import { CESScoreDetailsComponent, LoadCESScoreDetailsComponent } from "./Entities/CESScore/sections/details.component"
import { ChapterAssignmentRuleDetailsComponent, LoadChapterAssignmentRuleDetailsComponent } from "./Entities/ChapterAssignmentRule/sections/details.component"
import { ChapterAuthorizationDetailsComponent, LoadChapterAuthorizationDetailsComponent } from "./Entities/ChapterAuthorization/sections/details.component"
import { ChapterMeetingDetailsComponent, LoadChapterMeetingDetailsComponent } from "./Entities/ChapterMeeting/sections/details.component"
import { ChapterMembershipProductDetailsComponent, LoadChapterMembershipProductDetailsComponent } from "./Entities/ChapterMembershipProduct/sections/details.component"
import { ChapterReportCategoryDetailsComponent, LoadChapterReportCategoryDetailsComponent } from "./Entities/ChapterReportCategory/sections/details.component"
import { ChapterReportDetailsComponent, LoadChapterReportDetailsComponent } from "./Entities/ChapterReport/sections/details.component"
import { ChapterRoleTypeAuthorizationDetailsComponent, LoadChapterRoleTypeAuthorizationDetailsComponent } from "./Entities/ChapterRoleTypeAuthorization/sections/details.component"
import { ChapterRoleTypeDetailsComponent, LoadChapterRoleTypeDetailsComponent } from "./Entities/ChapterRoleType/sections/details.component"
import { ChapterRoleDetailsComponent, LoadChapterRoleDetailsComponent } from "./Entities/ChapterRole/sections/details.component"
import { ClassCertificatePrintRunDetailsComponent, LoadClassCertificatePrintRunDetailsComponent } from "./Entities/ClassCertificatePrintRun/sections/details.component"
import { ClassExamDetailsComponent, LoadClassExamDetailsComponent } from "./Entities/ClassExam/sections/details.component"
import { ClassExpectedStudentDetailsComponent, LoadClassExpectedStudentDetailsComponent } from "./Entities/ClassExpectedStudent/sections/details.component"
import { ClassPartUseDetailsComponent, LoadClassPartUseDetailsComponent } from "./Entities/ClassPartUse/sections/details.component"
import { ClassRegistrationPartStatusDetailsComponent, LoadClassRegistrationPartStatusDetailsComponent } from "./Entities/ClassRegistrationPartStatus/sections/details.component"
import { ClassRegistrationDetailsComponent, LoadClassRegistrationDetailsComponent } from "./Entities/ClassRegistration/sections/details.component"
import { ClassReqDesigDetailsComponent, LoadClassReqDesigDetailsComponent } from "./Entities/ClassReqDesig/sections/details.component"
import { ClassScheduleAgendaDetailsComponent, LoadClassScheduleAgendaDetailsComponent } from "./Entities/ClassScheduleAgenda/sections/details.component"
import { ClassScheduleDetailsComponent, LoadClassScheduleDetailsComponent } from "./Entities/ClassSchedule/sections/details.component"
import { ClassDetailsComponent, LoadClassDetailsComponent } from "./Entities/Class/sections/details.component"
import { CommissionAgmtDetTierDetailsComponent, LoadCommissionAgmtDetTierDetailsComponent } from "./Entities/CommissionAgmtDetTier/sections/details.component"
import { CommissionAgreementDetailDetailsComponent, LoadCommissionAgreementDetailDetailsComponent } from "./Entities/CommissionAgreementDetail/sections/details.component"
import { CommissionAgreementDetailsComponent, LoadCommissionAgreementDetailsComponent } from "./Entities/CommissionAgreement/sections/details.component"
import { CommissionBaseFormulaDetailsComponent, LoadCommissionBaseFormulaDetailsComponent } from "./Entities/CommissionBaseFormula/sections/details.component"
import { CommissionPayDetAdjustmentDetailsComponent, LoadCommissionPayDetAdjustmentDetailsComponent } from "./Entities/CommissionPayDetAdjustment/sections/details.component"
import { CommissionPayDetTierDetailsComponent, LoadCommissionPayDetTierDetailsComponent } from "./Entities/CommissionPayDetTier/sections/details.component"
import { CommissionPaySourceDetailDetailsComponent, LoadCommissionPaySourceDetailDetailsComponent } from "./Entities/CommissionPaySourceDetail/sections/details.component"
import { CommissionPaymentDetailDetailsComponent, LoadCommissionPaymentDetailDetailsComponent } from "./Entities/CommissionPaymentDetail/sections/details.component"
import { CommissionPaymentDetailsComponent, LoadCommissionPaymentDetailsComponent } from "./Entities/CommissionPayment/sections/details.component"
import { CommissionPlanDetailDetailsComponent, LoadCommissionPlanDetailDetailsComponent } from "./Entities/CommissionPlanDetail/sections/details.component"
import { CommissionPlanItemDetailsComponent, LoadCommissionPlanItemDetailsComponent } from "./Entities/CommissionPlanItem/sections/details.component"
import { CommissionPlanDetailsComponent, LoadCommissionPlanDetailsComponent } from "./Entities/CommissionPlan/sections/details.component"
import { CommissionRateScaleDetailDetailsComponent, LoadCommissionRateScaleDetailDetailsComponent } from "./Entities/CommissionRateScaleDetail/sections/details.component"
import { CommissionRateScaleDetailsComponent, LoadCommissionRateScaleDetailsComponent } from "./Entities/CommissionRateScale/sections/details.component"
import { CommissionSourceDetailsComponent, LoadCommissionSourceDetailsComponent } from "./Entities/CommissionSource/sections/details.component"
import { CommissionTerritoryDetailsComponent, LoadCommissionTerritoryDetailsComponent } from "./Entities/CommissionTerritory/sections/details.component"
import { CommissionTypeDetailsComponent, LoadCommissionTypeDetailsComponent } from "./Entities/CommissionType/sections/details.component"
import { CommitteeNomineeDetailsComponent, LoadCommitteeNomineeDetailsComponent } from "./Entities/CommitteeNominee/sections/details.component"
import { CommitteeRoleDetailsComponent, LoadCommitteeRoleDetailsComponent } from "./Entities/CommitteeRole/sections/details.component"
import { CommitteeTermMeetingDetailsComponent, LoadCommitteeTermMeetingDetailsComponent } from "./Entities/CommitteeTermMeeting/sections/details.component"
import { CommitteeTermMemberDetailsComponent, LoadCommitteeTermMemberDetailsComponent } from "./Entities/CommitteeTermMember/sections/details.component"
import { CommitteeTermRenewalMembersDetailsComponent, LoadCommitteeTermRenewalMembersDetailsComponent } from "./Entities/CommitteeTermRenewalMembers/sections/details.component"
import { CommitteeTermRenewalDetailsComponent, LoadCommitteeTermRenewalDetailsComponent } from "./Entities/CommitteeTermRenewal/sections/details.component"
import { CommitteeTermDetailsComponent, LoadCommitteeTermDetailsComponent } from "./Entities/CommitteeTerm/sections/details.component"
import { CommitteeTypeDetailsComponent, LoadCommitteeTypeDetailsComponent } from "./Entities/CommitteeType/sections/details.component"
import { CommitteeDetailsComponent, LoadCommitteeDetailsComponent } from "./Entities/Committee/sections/details.component"
import { Company__dboDetailsComponent, LoadCompany__dboDetailsComponent } from "./Entities/Company__dbo/sections/details.component"
import { CompanyAccountManagerDetailsComponent, LoadCompanyAccountManagerDetailsComponent } from "./Entities/CompanyAccountManager/sections/details.component"
import { CompanyAddressDetailsComponent, LoadCompanyAddressDetailsComponent } from "./Entities/CompanyAddress/sections/details.component"
import { CompanyCompanyDetailsComponent, LoadCompanyCompanyDetailsComponent } from "./Entities/CompanyCompany/sections/details.component"
import { CompanyPersonFunctionDetailsComponent, LoadCompanyPersonFunctionDetailsComponent } from "./Entities/CompanyPersonFunction/sections/details.component"
import { CompanyPersonDetailsComponent, LoadCompanyPersonDetailsComponent } from "./Entities/CompanyPerson/sections/details.component"
import { CompanyPhoneDetailsComponent, LoadCompanyPhoneDetailsComponent } from "./Entities/CompanyPhone/sections/details.component"
import { CompanyProductCodeDetailsComponent, LoadCompanyProductCodeDetailsComponent } from "./Entities/CompanyProductCode/sections/details.component"
import { CompanyRelationshipTypeDetailsComponent, LoadCompanyRelationshipTypeDetailsComponent } from "./Entities/CompanyRelationshipType/sections/details.component"
import { CompanySavedPaymentMethodDetailsComponent, LoadCompanySavedPaymentMethodDetailsComponent } from "./Entities/CompanySavedPaymentMethod/sections/details.component"
import { CompanyTaxExCodeDetailsComponent, LoadCompanyTaxExCodeDetailsComponent } from "./Entities/CompanyTaxExCode/sections/details.component"
import { CompanyTypeDetailsComponent, LoadCompanyTypeDetailsComponent } from "./Entities/CompanyType/sections/details.component"
import { ContactLogCategoryDetailsComponent, LoadContactLogCategoryDetailsComponent } from "./Entities/ContactLogCategory/sections/details.component"
import { ContactLogLinkDetailsComponent, LoadContactLogLinkDetailsComponent } from "./Entities/ContactLogLink/sections/details.component"
import { ContactLogTypeDetailsComponent, LoadContactLogTypeDetailsComponent } from "./Entities/ContactLogType/sections/details.component"
import { ContactLogDetailsComponent, LoadContactLogDetailsComponent } from "./Entities/ContactLog/sections/details.component"
import { ContinentDetailsComponent, LoadContinentDetailsComponent } from "./Entities/Continent/sections/details.component"
import { CountryDetailsComponent, LoadCountryDetailsComponent } from "./Entities/Country/sections/details.component"
import { CourseCategoryDetailsComponent, LoadCourseCategoryDetailsComponent } from "./Entities/CourseCategory/sections/details.component"
import { CourseEnrollmentTypeDetailsComponent, LoadCourseEnrollmentTypeDetailsComponent } from "./Entities/CourseEnrollmentType/sections/details.component"
import { CourseETMaterialsDetailsComponent, LoadCourseETMaterialsDetailsComponent } from "./Entities/CourseETMaterials/sections/details.component"
import { CourseExamDetailsComponent, LoadCourseExamDetailsComponent } from "./Entities/CourseExam/sections/details.component"
import { CourseInstrDesigDetailsComponent, LoadCourseInstrDesigDetailsComponent } from "./Entities/CourseInstrDesig/sections/details.component"
import { CourseInstructorDetailsComponent, LoadCourseInstructorDetailsComponent } from "./Entities/CourseInstructor/sections/details.component"
import { CoursePartCategoryDetailsComponent, LoadCoursePartCategoryDetailsComponent } from "./Entities/CoursePartCategory/sections/details.component"
import { CoursePartUseDetailsComponent, LoadCoursePartUseDetailsComponent } from "./Entities/CoursePartUse/sections/details.component"
import { CoursePartDetailsComponent, LoadCoursePartDetailsComponent } from "./Entities/CoursePart/sections/details.component"
import { CoursePreReqDetailsComponent, LoadCoursePreReqDetailsComponent } from "./Entities/CoursePreReq/sections/details.component"
import { CourseSchoolSubDetailsComponent, LoadCourseSchoolSubDetailsComponent } from "./Entities/CourseSchoolSub/sections/details.component"
import { CourseSchoolDetailsComponent, LoadCourseSchoolDetailsComponent } from "./Entities/CourseSchool/sections/details.component"
import { CourseDetailsComponent, LoadCourseDetailsComponent } from "./Entities/Course/sections/details.component"
import { CreditCardTypeDetailsComponent, LoadCreditCardTypeDetailsComponent } from "./Entities/CreditCardType/sections/details.component"
import { CreditStatusDetailsComponent, LoadCreditStatusDetailsComponent } from "./Entities/CreditStatus/sections/details.component"
import { CreditStatusApproverDetailsComponent, LoadCreditStatusApproverDetailsComponent } from "./Entities/CreditStatusApprover/sections/details.component"
import { CultureFormatDetailsComponent, LoadCultureFormatDetailsComponent } from "./Entities/CultureFormat/sections/details.component"
import { CultureStringCategoryDetailsComponent, LoadCultureStringCategoryDetailsComponent } from "./Entities/CultureStringCategory/sections/details.component"
import { CultureStringLocalDetailsComponent, LoadCultureStringLocalDetailsComponent } from "./Entities/CultureStringLocal/sections/details.component"
import { CultureStringDetailsComponent, LoadCultureStringDetailsComponent } from "./Entities/CultureString/sections/details.component"
import { CultureDetailsComponent, LoadCultureDetailsComponent } from "./Entities/Culture/sections/details.component"
import { CurrencySpotRateDetailsComponent, LoadCurrencySpotRateDetailsComponent } from "./Entities/CurrencySpotRate/sections/details.component"
import { CurrencyTypeDetailsComponent, LoadCurrencyTypeDetailsComponent } from "./Entities/CurrencyType/sections/details.component"
import { CurriculumApplicationDetailDetailsComponent, LoadCurriculumApplicationDetailDetailsComponent } from "./Entities/CurriculumApplicationDetail/sections/details.component"
import { CurriculumApplicationDetailsComponent, LoadCurriculumApplicationDetailsComponent } from "./Entities/CurriculumApplication/sections/details.component"
import { CurriculumCategoryDetailsComponent, LoadCurriculumCategoryDetailsComponent } from "./Entities/CurriculumCategory/sections/details.component"
import { CurriculumCourseDetailsComponent, LoadCurriculumCourseDetailsComponent } from "./Entities/CurriculumCourse/sections/details.component"
import { CurriculumDefinitionCategoryDetailsComponent, LoadCurriculumDefinitionCategoryDetailsComponent } from "./Entities/CurriculumDefinitionCategory/sections/details.component"
import { CurriculumDefinitionDetailsComponent, LoadCurriculumDefinitionDetailsComponent } from "./Entities/CurriculumDefinition/sections/details.component"
import { CurriculumSchoolDetailsComponent, LoadCurriculumSchoolDetailsComponent } from "./Entities/CurriculumSchool/sections/details.component"
import { DepartmentDetailsComponent, LoadDepartmentDetailsComponent } from "./Entities/Department/sections/details.component"
import { DiscussionForumLinkDetailsComponent, LoadDiscussionForumLinkDetailsComponent } from "./Entities/DiscussionForumLink/sections/details.component"
import { DiscussionForumMessageDetailsComponent, LoadDiscussionForumMessageDetailsComponent } from "./Entities/DiscussionForumMessage/sections/details.component"
import { DiscussionForumModeratorDetailsComponent, LoadDiscussionForumModeratorDetailsComponent } from "./Entities/DiscussionForumModerator/sections/details.component"
import { DiscussionForumSubscriptionDetailsComponent, LoadDiscussionForumSubscriptionDetailsComponent } from "./Entities/DiscussionForumSubscription/sections/details.component"
import { DiscussionForumUserDetailsComponent, LoadDiscussionForumUserDetailsComponent } from "./Entities/DiscussionForumUser/sections/details.component"
import { DiscussionForumWebGroupDetailsComponent, LoadDiscussionForumWebGroupDetailsComponent } from "./Entities/DiscussionForumWebGroup/sections/details.component"
import { DiscussionForumDetailsComponent, LoadDiscussionForumDetailsComponent } from "./Entities/DiscussionForum/sections/details.component"
import { DistributionTypeDetailsComponent, LoadDistributionTypeDetailsComponent } from "./Entities/DistributionType/sections/details.component"
import { DonorAdvisedFundAllocationDetailsComponent, LoadDonorAdvisedFundAllocationDetailsComponent } from "./Entities/DonorAdvisedFundAllocation/sections/details.component"
import { DonorAdvisedFundDetailsComponent, LoadDonorAdvisedFundDetailsComponent } from "./Entities/DonorAdvisedFund/sections/details.component"
import { DownloadItemsDetailsComponent, LoadDownloadItemsDetailsComponent } from "./Entities/DownloadItems/sections/details.component"
import { DuesCategoryDetailsComponent, LoadDuesCategoryDetailsComponent } from "./Entities/DuesCategory/sections/details.component"
import { EducationCategoryDetailsComponent, LoadEducationCategoryDetailsComponent } from "./Entities/EducationCategory/sections/details.component"
import { EducationFieldDetailsComponent, LoadEducationFieldDetailsComponent } from "./Entities/EducationField/sections/details.component"
import { EducationLevelDetailsComponent, LoadEducationLevelDetailsComponent } from "./Entities/EducationLevel/sections/details.component"
import { EducationStatusDetailsComponent, LoadEducationStatusDetailsComponent } from "./Entities/EducationStatus/sections/details.component"
import { EducationUnitDetailsComponent, LoadEducationUnitDetailsComponent } from "./Entities/EducationUnit/sections/details.component"
import { EmployeePositionCodesDetailsComponent, LoadEmployeePositionCodesDetailsComponent } from "./Entities/EmployeePositionCodes/sections/details.component"
import { EmployeeSkill__dboDetailsComponent, LoadEmployeeSkill__dboDetailsComponent } from "./Entities/EmployeeSkill__dbo/sections/details.component"
import { Employee__dboDetailsComponent, LoadEmployee__dboDetailsComponent } from "./Entities/Employee__dbo/sections/details.component"
import { EnrollmentTypeDetailsComponent, LoadEnrollmentTypeDetailsComponent } from "./Entities/EnrollmentType/sections/details.component"
import { ExamQuestionAnswersDetailsComponent, LoadExamQuestionAnswersDetailsComponent } from "./Entities/ExamQuestionAnswers/sections/details.component"
import { ExamQuestionDetailsComponent, LoadExamQuestionDetailsComponent } from "./Entities/ExamQuestion/sections/details.component"
import { ExamDetailsComponent, LoadExamDetailsComponent } from "./Entities/Exam/sections/details.component"
import { ExpoBoothConfigurationDetailsComponent, LoadExpoBoothConfigurationDetailsComponent } from "./Entities/ExpoBoothConfiguration/sections/details.component"
import { ExpoFloorplanDetailsComponent, LoadExpoFloorplanDetailsComponent } from "./Entities/ExpoFloorplan/sections/details.component"
import { ExpoPriorityPointTypeDetailsComponent, LoadExpoPriorityPointTypeDetailsComponent } from "./Entities/ExpoPriorityPointType/sections/details.component"
import { ExpoPriorityPointDetailsComponent, LoadExpoPriorityPointDetailsComponent } from "./Entities/ExpoPriorityPoint/sections/details.component"
import { ExpoDetailsComponent, LoadExpoDetailsComponent } from "./Entities/Expo/sections/details.component"
import { ExternalSystemDetailsComponent, LoadExternalSystemDetailsComponent } from "./Entities/ExternalSystem/sections/details.component"
import { FloorplanStatusDetailsComponent, LoadFloorplanStatusDetailsComponent } from "./Entities/FloorplanStatus/sections/details.component"
import { FloorplanSystemDetailsComponent, LoadFloorplanSystemDetailsComponent } from "./Entities/FloorplanSystem/sections/details.component"
import { FloorplanDetailsComponent, LoadFloorplanDetailsComponent } from "./Entities/Floorplan/sections/details.component"
import { FoodPreferenceDetailsComponent, LoadFoodPreferenceDetailsComponent } from "./Entities/FoodPreference/sections/details.component"
import { FreightMethodsDetailsComponent, LoadFreightMethodsDetailsComponent } from "./Entities/FreightMethods/sections/details.component"
import { FrequencyAgreementDetailsComponent, LoadFrequencyAgreementDetailsComponent } from "./Entities/FrequencyAgreement/sections/details.component"
import { FunctionRoleDetailsComponent, LoadFunctionRoleDetailsComponent } from "./Entities/FunctionRole/sections/details.component"
import { FundCampaignGivingDetailsComponent, LoadFundCampaignGivingDetailsComponent } from "./Entities/FundCampaignGiving/sections/details.component"
import { FundCampaignProductDetailsComponent, LoadFundCampaignProductDetailsComponent } from "./Entities/FundCampaignProduct/sections/details.component"
import { FundCampaignSolicitorProspectDetailsComponent, LoadFundCampaignSolicitorProspectDetailsComponent } from "./Entities/FundCampaignSolicitorProspect/sections/details.component"
import { FundCampaignSolicitorDetailsComponent, LoadFundCampaignSolicitorDetailsComponent } from "./Entities/FundCampaignSolicitor/sections/details.component"
import { FundCampaignDetailsComponent, LoadFundCampaignDetailsComponent } from "./Entities/FundCampaign/sections/details.component"
import { FundraisingPriceDetailsComponent, LoadFundraisingPriceDetailsComponent } from "./Entities/FundraisingPrice/sections/details.component"
import { FundraisingPricingOptionDetailsComponent, LoadFundraisingPricingOptionDetailsComponent } from "./Entities/FundraisingPricingOption/sections/details.component"
import { GiftsInKindCategoriesDetailsComponent, LoadGiftsInKindCategoriesDetailsComponent } from "./Entities/GiftsInKindCategories/sections/details.component"
import { GiftsInKindDetailsComponent, LoadGiftsInKindDetailsComponent } from "./Entities/GiftsInKind/sections/details.component"
import { GLAccountDetailsComponent, LoadGLAccountDetailsComponent } from "./Entities/GLAccount/sections/details.component"
import { GLOrderLevelDetailsComponent, LoadGLOrderLevelDetailsComponent } from "./Entities/GLOrderLevel/sections/details.component"
import { GLPaymentLevelDetailsComponent, LoadGLPaymentLevelDetailsComponent } from "./Entities/GLPaymentLevel/sections/details.component"
import { GrantDisbursementDetailsComponent, LoadGrantDisbursementDetailsComponent } from "./Entities/GrantDisbursement/sections/details.component"
import { GrantDueDiligenceStepLinkDetailsComponent, LoadGrantDueDiligenceStepLinkDetailsComponent } from "./Entities/GrantDueDiligenceStepLink/sections/details.component"
import { GrantDueDiligenceStepDetailsComponent, LoadGrantDueDiligenceStepDetailsComponent } from "./Entities/GrantDueDiligenceStep/sections/details.component"
import { GrantReportPaymentLinkDetailsComponent, LoadGrantReportPaymentLinkDetailsComponent } from "./Entities/GrantReportPaymentLink/sections/details.component"
import { GrantReportDetailsComponent, LoadGrantReportDetailsComponent } from "./Entities/GrantReport/sections/details.component"
import { GrantsDetailsComponent, LoadGrantsDetailsComponent } from "./Entities/Grants/sections/details.component"
import { HousingBlockOptionDetailsComponent, LoadHousingBlockOptionDetailsComponent } from "./Entities/HousingBlockOption/sections/details.component"
import { HousingBlockRoomDetailsComponent, LoadHousingBlockRoomDetailsComponent } from "./Entities/HousingBlockRoom/sections/details.component"
import { HousingBlockDetailsComponent, LoadHousingBlockDetailsComponent } from "./Entities/HousingBlock/sections/details.component"
import { HousingReservationDetOptionDetailsComponent, LoadHousingReservationDetOptionDetailsComponent } from "./Entities/HousingReservationDetOption/sections/details.component"
import { HousingReservationDetailDetailsComponent, LoadHousingReservationDetailDetailsComponent } from "./Entities/HousingReservationDetail/sections/details.component"
import { HousingReservationGuestDetailsComponent, LoadHousingReservationGuestDetailsComponent } from "./Entities/HousingReservationGuest/sections/details.component"
import { HousingReservationDetailsComponent, LoadHousingReservationDetailsComponent } from "./Entities/HousingReservation/sections/details.component"
import { HousingRoomTypeDetailsComponent, LoadHousingRoomTypeDetailsComponent } from "./Entities/HousingRoomType/sections/details.component"
import { HousingTransferDetailDetailsComponent, LoadHousingTransferDetailDetailsComponent } from "./Entities/HousingTransferDetail/sections/details.component"
import { HousingTransferTypeDetailsComponent, LoadHousingTransferTypeDetailsComponent } from "./Entities/HousingTransferType/sections/details.component"
import { HousingTransferDetailsComponent, LoadHousingTransferDetailsComponent } from "./Entities/HousingTransfer/sections/details.component"
import { HousingDetailsComponent, LoadHousingDetailsComponent } from "./Entities/Housing/sections/details.component"
import { InstantMessagingUserProfileDetailsComponent, LoadInstantMessagingUserProfileDetailsComponent } from "./Entities/InstantMessagingUserProfile/sections/details.component"
import { InstructorDesignationDetailsComponent, LoadInstructorDesignationDetailsComponent } from "./Entities/InstructorDesignation/sections/details.component"
import { InternationalSupportFundCategoryDetailsComponent, LoadInternationalSupportFundCategoryDetailsComponent } from "./Entities/InternationalSupportFundCategory/sections/details.component"
import { InternationalSupportFundDetailsComponent, LoadInternationalSupportFundDetailsComponent } from "./Entities/InternationalSupportFund/sections/details.component"
import { InventoryLocationDetailsComponent, LoadInventoryLocationDetailsComponent } from "./Entities/InventoryLocation/sections/details.component"
import { InventoryOnOrderDetailsComponent, LoadInventoryOnOrderDetailsComponent } from "./Entities/InventoryOnOrder/sections/details.component"
import { InventoryTransferDetailsComponent, LoadInventoryTransferDetailsComponent } from "./Entities/InventoryTransfer/sections/details.component"
import { InvoiceConsolidationOrderDetailsComponent, LoadInvoiceConsolidationOrderDetailsComponent } from "./Entities/InvoiceConsolidationOrder/sections/details.component"
import { InvoiceConsolidationPaymentDetailsComponent, LoadInvoiceConsolidationPaymentDetailsComponent } from "./Entities/InvoiceConsolidationPayment/sections/details.component"
import { InvoiceConsolidationDetailsComponent, LoadInvoiceConsolidationDetailsComponent } from "./Entities/InvoiceConsolidation/sections/details.component"
import { InvoiceMessageDetailsComponent, LoadInvoiceMessageDetailsComponent } from "./Entities/InvoiceMessage/sections/details.component"
import { IssueCategoryDetailsComponent, LoadIssueCategoryDetailsComponent } from "./Entities/IssueCategory/sections/details.component"
import { IssueDetailsComponent, LoadIssueDetailsComponent } from "./Entities/Issue/sections/details.component"
import { ItemRatingEntryDetailsComponent, LoadItemRatingEntryDetailsComponent } from "./Entities/ItemRatingEntry/sections/details.component"
import { ItemRatingTypeDefinitionDetailsComponent, LoadItemRatingTypeDefinitionDetailsComponent } from "./Entities/ItemRatingTypeDefinition/sections/details.component"
import { ItemRatingTypeDetailsComponent, LoadItemRatingTypeDetailsComponent } from "./Entities/ItemRatingType/sections/details.component"
import { ItemRatingDetailsComponent, LoadItemRatingDetailsComponent } from "./Entities/ItemRating/sections/details.component"
import { ItemReviewEntriesDetailsComponent, LoadItemReviewEntriesDetailsComponent } from "./Entities/ItemReviewEntries/sections/details.component"
import { KeyPerformanceIndicatorDetailsComponent, LoadKeyPerformanceIndicatorDetailsComponent } from "./Entities/KeyPerformanceIndicator/sections/details.component"
import { KnowledgeAnswerDetailsComponent, LoadKnowledgeAnswerDetailsComponent } from "./Entities/KnowledgeAnswer/sections/details.component"
import { KnowledgeCaptureModeDetailsComponent, LoadKnowledgeCaptureModeDetailsComponent } from "./Entities/KnowledgeCaptureMode/sections/details.component"
import { KnowledgeCategoryDetailsComponent, LoadKnowledgeCategoryDetailsComponent } from "./Entities/KnowledgeCategory/sections/details.component"
import { KnowledgeDeliveryTypeDetailsComponent, LoadKnowledgeDeliveryTypeDetailsComponent } from "./Entities/KnowledgeDeliveryType/sections/details.component"
import { KnowledgeParticipantDetailsComponent, LoadKnowledgeParticipantDetailsComponent } from "./Entities/KnowledgeParticipant/sections/details.component"
import { KnowledgeResultDetailDetailsComponent, LoadKnowledgeResultDetailDetailsComponent } from "./Entities/KnowledgeResultDetail/sections/details.component"
import { KnowledgeResultDetailsComponent, LoadKnowledgeResultDetailsComponent } from "./Entities/KnowledgeResult/sections/details.component"
import { KnowledgeStatusDetailsComponent, LoadKnowledgeStatusDetailsComponent } from "./Entities/KnowledgeStatus/sections/details.component"
import { KnowledgeStyleSheetDetailsComponent, LoadKnowledgeStyleSheetDetailsComponent } from "./Entities/KnowledgeStyleSheet/sections/details.component"
import { KnowledgeTrackingTypeDetailsComponent, LoadKnowledgeTrackingTypeDetailsComponent } from "./Entities/KnowledgeTrackingType/sections/details.component"
import { KPIFormulaDetailsComponent, LoadKPIFormulaDetailsComponent } from "./Entities/KPIFormula/sections/details.component"
import { KPIMetricMappingDetailsComponent, LoadKPIMetricMappingDetailsComponent } from "./Entities/KPIMetricMapping/sections/details.component"
import { KPIMetricDetailsComponent, LoadKPIMetricDetailsComponent } from "./Entities/KPIMetric/sections/details.component"
import { KPIResultParticipantRecordDetailsComponent, LoadKPIResultParticipantRecordDetailsComponent } from "./Entities/KPIResultParticipantRecord/sections/details.component"
import { KPIResultDetailsComponent, LoadKPIResultDetailsComponent } from "./Entities/KPIResult/sections/details.component"
import { KPIRunDetailsComponent, LoadKPIRunDetailsComponent } from "./Entities/KPIRun/sections/details.component"
import { KPIUnitTypeDetailsComponent, LoadKPIUnitTypeDetailsComponent } from "./Entities/KPIUnitType/sections/details.component"
import { LearningManagementSystemAttributeDetailsComponent, LoadLearningManagementSystemAttributeDetailsComponent } from "./Entities/LearningManagementSystemAttribute/sections/details.component"
import { LearningManagementSystemInteractionDetailsComponent, LoadLearningManagementSystemInteractionDetailsComponent } from "./Entities/LearningManagementSystemInteraction/sections/details.component"
import { LearningManagementSystemDetailsComponent, LoadLearningManagementSystemDetailsComponent } from "./Entities/LearningManagementSystem/sections/details.component"
import { ListDetailArchiveDetailsComponent, LoadListDetailArchiveDetailsComponent } from "./Entities/ListDetailArchive/sections/details.component"
import { ListDetail__dboDetailsComponent, LoadListDetail__dboDetailsComponent } from "./Entities/ListDetail__dbo/sections/details.component"
import { ListTypeDetailsComponent, LoadListTypeDetailsComponent } from "./Entities/ListType/sections/details.component"
import { List__dboDetailsComponent, LoadList__dboDetailsComponent } from "./Entities/List__dbo/sections/details.component"
import { MailingActivityDetailsComponent, LoadMailingActivityDetailsComponent } from "./Entities/MailingActivity/sections/details.component"
import { MailingActivityDetailDetailsComponent, LoadMailingActivityDetailDetailsComponent } from "./Entities/MailingActivityDetail/sections/details.component"
import { MarketPlaceCategoryDetailsComponent, LoadMarketPlaceCategoryDetailsComponent } from "./Entities/MarketPlaceCategory/sections/details.component"
import { MarketPlaceInfoRequestDetailsComponent, LoadMarketPlaceInfoRequestDetailsComponent } from "./Entities/MarketPlaceInfoRequest/sections/details.component"
import { MarketPlaceListingTypeDetailsComponent, LoadMarketPlaceListingTypeDetailsComponent } from "./Entities/MarketPlaceListingType/sections/details.component"
import { MarketPlaceListingDetailsComponent, LoadMarketPlaceListingDetailsComponent } from "./Entities/MarketPlaceListing/sections/details.component"
import { MeetingAttPossValueDetailsComponent, LoadMeetingAttPossValueDetailsComponent } from "./Entities/MeetingAttPossValue/sections/details.component"
import { MeetingAttendeeGroupDetailsComponent, LoadMeetingAttendeeGroupDetailsComponent } from "./Entities/MeetingAttendeeGroup/sections/details.component"
import { MeetingAttendeeTypeDetailsComponent, LoadMeetingAttendeeTypeDetailsComponent } from "./Entities/MeetingAttendeeType/sections/details.component"
import { MeetingAttributeDetailsComponent, LoadMeetingAttributeDetailsComponent } from "./Entities/MeetingAttribute/sections/details.component"
import { MeetingEducationUnitDetailsComponent, LoadMeetingEducationUnitDetailsComponent } from "./Entities/MeetingEducationUnit/sections/details.component"
import { MeetingHotelDetailsComponent, LoadMeetingHotelDetailsComponent } from "./Entities/MeetingHotel/sections/details.component"
import { MeetingResourceDetailsComponent, LoadMeetingResourceDetailsComponent } from "./Entities/MeetingResource/sections/details.component"
import { MeetingRoomPossibleTypeDetailsComponent, LoadMeetingRoomPossibleTypeDetailsComponent } from "./Entities/MeetingRoomPossibleType/sections/details.component"
import { MeetingRoomRoomDetailsComponent, LoadMeetingRoomRoomDetailsComponent } from "./Entities/MeetingRoomRoom/sections/details.component"
import { MeetingRoomTypeDetailsComponent, LoadMeetingRoomTypeDetailsComponent } from "./Entities/MeetingRoomType/sections/details.component"
import { MeetingRoomDetailsComponent, LoadMeetingRoomDetailsComponent } from "./Entities/MeetingRoom/sections/details.component"
import { MeetingSessionDetailsComponent, LoadMeetingSessionDetailsComponent } from "./Entities/MeetingSession/sections/details.component"
import { MeetingSpeakerEvalDetailsComponent, LoadMeetingSpeakerEvalDetailsComponent } from "./Entities/MeetingSpeakerEval/sections/details.component"
import { MeetingSpeakerDetailsComponent, LoadMeetingSpeakerDetailsComponent } from "./Entities/MeetingSpeaker/sections/details.component"
import { MeetingSponsorDetailsComponent, LoadMeetingSponsorDetailsComponent } from "./Entities/MeetingSponsor/sections/details.component"
import { MeetingStatusDetailsComponent, LoadMeetingStatusDetailsComponent } from "./Entities/MeetingStatus/sections/details.component"
import { MeetingTimeSlotDetailsComponent, LoadMeetingTimeSlotDetailsComponent } from "./Entities/MeetingTimeSlot/sections/details.component"
import { MeetingTrackDetailsComponent, LoadMeetingTrackDetailsComponent } from "./Entities/MeetingTrack/sections/details.component"
import { MeetingTransferEmailDetailsComponent, LoadMeetingTransferEmailDetailsComponent } from "./Entities/MeetingTransferEmail/sections/details.component"
import { MeetingTransferDetailsComponent, LoadMeetingTransferDetailsComponent } from "./Entities/MeetingTransfer/sections/details.component"
import { MeetingTypeAttPossValueDetailsComponent, LoadMeetingTypeAttPossValueDetailsComponent } from "./Entities/MeetingTypeAttPossValue/sections/details.component"
import { MeetingTypeAttributeDetailsComponent, LoadMeetingTypeAttributeDetailsComponent } from "./Entities/MeetingTypeAttribute/sections/details.component"
import { MeetingTypeDetailsComponent, LoadMeetingTypeDetailsComponent } from "./Entities/MeetingType/sections/details.component"
import { MeetingDetailsComponent, LoadMeetingDetailsComponent } from "./Entities/Meeting/sections/details.component"
import { MemberStatusTypeDetailsComponent, LoadMemberStatusTypeDetailsComponent } from "./Entities/MemberStatusType/sections/details.component"
import { MemberTypeDetailsComponent, LoadMemberTypeDetailsComponent } from "./Entities/MemberType/sections/details.component"
import { MembershipApplicationDefinitionProductDetailsComponent, LoadMembershipApplicationDefinitionProductDetailsComponent } from "./Entities/MembershipApplicationDefinitionProduct/sections/details.component"
import { MembershipApplicationDefinitionDetailsComponent, LoadMembershipApplicationDefinitionDetailsComponent } from "./Entities/MembershipApplicationDefinition/sections/details.component"
import { MembershipApplicationDetailsComponent, LoadMembershipApplicationDetailsComponent } from "./Entities/MembershipApplication/sections/details.component"
import { MembershipEmailSchedulesDetailsComponent, LoadMembershipEmailSchedulesDetailsComponent } from "./Entities/MembershipEmailSchedules/sections/details.component"
import { MembershipEnrollmentDetailsComponent, LoadMembershipEnrollmentDetailsComponent } from "./Entities/MembershipEnrollment/sections/details.component"
import { MembershipStatusDetailsComponent, LoadMembershipStatusDetailsComponent } from "./Entities/MembershipStatus/sections/details.component"
import { MerchantAccountDetailsComponent, LoadMerchantAccountDetailsComponent } from "./Entities/MerchantAccount/sections/details.component"
import { OpportunityDetailsComponent, LoadOpportunityDetailsComponent } from "./Entities/Opportunity/sections/details.component"
import { OpportunityCompetitorDetailsComponent, LoadOpportunityCompetitorDetailsComponent } from "./Entities/OpportunityCompetitor/sections/details.component"
import { OpportunityContactRoleTypeDetailsComponent, LoadOpportunityContactRoleTypeDetailsComponent } from "./Entities/OpportunityContactRoleType/sections/details.component"
import { OpportunityContactDetailsComponent, LoadOpportunityContactDetailsComponent } from "./Entities/OpportunityContact/sections/details.component"
import { OpportunityDetailDetailsComponent, LoadOpportunityDetailDetailsComponent } from "./Entities/OpportunityDetail/sections/details.component"
import { OpportunityHistoryDetailsComponent, LoadOpportunityHistoryDetailsComponent } from "./Entities/OpportunityHistory/sections/details.component"
import { OpportunityPartnerRoleTypeDetailsComponent, LoadOpportunityPartnerRoleTypeDetailsComponent } from "./Entities/OpportunityPartnerRoleType/sections/details.component"
import { OpportunityPartnerRoleDetailsComponent, LoadOpportunityPartnerRoleDetailsComponent } from "./Entities/OpportunityPartnerRole/sections/details.component"
import { OpportunityPartnerDetailsComponent, LoadOpportunityPartnerDetailsComponent } from "./Entities/OpportunityPartner/sections/details.component"
import { OpportunityReferenceTypeDetailsComponent, LoadOpportunityReferenceTypeDetailsComponent } from "./Entities/OpportunityReferenceType/sections/details.component"
import { OpportunityReferenceDetailsComponent, LoadOpportunityReferenceDetailsComponent } from "./Entities/OpportunityReference/sections/details.component"
import { OpportunityRoleDetailsComponent, LoadOpportunityRoleDetailsComponent } from "./Entities/OpportunityRole/sections/details.component"
import { OpportunitySellingRoleTypeDetailsComponent, LoadOpportunitySellingRoleTypeDetailsComponent } from "./Entities/OpportunitySellingRoleType/sections/details.component"
import { OpportunitySourceDetailsComponent, LoadOpportunitySourceDetailsComponent } from "./Entities/OpportunitySource/sections/details.component"
import { OpportunityStageOpportunityTypeDetailsComponent, LoadOpportunityStageOpportunityTypeDetailsComponent } from "./Entities/OpportunityStageOpportunityType/sections/details.component"
import { OpportunityStageDetailsComponent, LoadOpportunityStageDetailsComponent } from "./Entities/OpportunityStage/sections/details.component"
import { OpportunityStatusReportDetailsComponent, LoadOpportunityStatusReportDetailsComponent } from "./Entities/OpportunityStatusReport/sections/details.component"
import { OpportunityTypeDetailsComponent, LoadOpportunityTypeDetailsComponent } from "./Entities/OpportunityType/sections/details.component"
import { OrderBalanceDetailsComponent, LoadOrderBalanceDetailsComponent } from "./Entities/OrderBalance/sections/details.component"
import { OrderBoothCoExhibitorDetailsComponent, LoadOrderBoothCoExhibitorDetailsComponent } from "./Entities/OrderBoothCoExhibitor/sections/details.component"
import { OrderBoothDetailDetailsComponent, LoadOrderBoothDetailDetailsComponent } from "./Entities/OrderBoothDetail/sections/details.component"
import { OrderBoothProductCodeDetailsComponent, LoadOrderBoothProductCodeDetailsComponent } from "./Entities/OrderBoothProductCode/sections/details.component"
import { OrderCancellationWizardDetailsComponent, LoadOrderCancellationWizardDetailsComponent } from "./Entities/OrderCancellationWizard/sections/details.component"
import { OrderCurrencySpotRateDetailsComponent, LoadOrderCurrencySpotRateDetailsComponent } from "./Entities/OrderCurrencySpotRate/sections/details.component"
import { OrderDetailDetailsComponent, LoadOrderDetailDetailsComponent } from "./Entities/OrderDetail/sections/details.component"
import { OrderGLEntryDetailsComponent, LoadOrderGLEntryDetailsComponent } from "./Entities/OrderGLEntry/sections/details.component"
import { OrderInvAllocationDetailsComponent, LoadOrderInvAllocationDetailsComponent } from "./Entities/OrderInvAllocation/sections/details.component"
import { OrderLineTaxDetailsComponent, LoadOrderLineTaxDetailsComponent } from "./Entities/OrderLineTax/sections/details.component"
import { OrderMasterDetailsComponent, LoadOrderMasterDetailsComponent } from "./Entities/OrderMaster/sections/details.component"
import { OrderMeetingDetailAttributeDetailsComponent, LoadOrderMeetingDetailAttributeDetailsComponent } from "./Entities/OrderMeetingDetailAttribute/sections/details.component"
import { OrderMeetingDetailEducationUnitDetailsComponent, LoadOrderMeetingDetailEducationUnitDetailsComponent } from "./Entities/OrderMeetingDetailEducationUnit/sections/details.component"
import { OrderMeetingDetailDetailsComponent, LoadOrderMeetingDetailDetailsComponent } from "./Entities/OrderMeetingDetail/sections/details.component"
import { OrderMeetingSessionDetailDetailsComponent, LoadOrderMeetingSessionDetailDetailsComponent } from "./Entities/OrderMeetingSessionDetail/sections/details.component"
import { OrderPmtScheduleDetailsComponent, LoadOrderPmtScheduleDetailsComponent } from "./Entities/OrderPmtSchedule/sections/details.component"
import { OrderShipmentTaxDetailsComponent, LoadOrderShipmentTaxDetailsComponent } from "./Entities/OrderShipmentTax/sections/details.component"
import { OrderShipmentDetailsComponent, LoadOrderShipmentDetailsComponent } from "./Entities/OrderShipment/sections/details.component"
import { OrderSourceDetailsComponent, LoadOrderSourceDetailsComponent } from "./Entities/OrderSource/sections/details.component"
import { OrderStateDetailsComponent, LoadOrderStateDetailsComponent } from "./Entities/OrderState/sections/details.component"
import { OrderStatusTypeDetailsComponent, LoadOrderStatusTypeDetailsComponent } from "./Entities/OrderStatusType/sections/details.component"
import { OrderTotalDetailsComponent, LoadOrderTotalDetailsComponent } from "./Entities/OrderTotal/sections/details.component"
import { OrderTypeDetailsComponent, LoadOrderTypeDetailsComponent } from "./Entities/OrderType/sections/details.component"
import { OrganizationAddressDetailsComponent, LoadOrganizationAddressDetailsComponent } from "./Entities/OrganizationAddress/sections/details.component"
import { OrganizationGLAccountDetailsComponent, LoadOrganizationGLAccountDetailsComponent } from "./Entities/OrganizationGLAccount/sections/details.component"
import { OrganizationInterCompanyGLDetailsComponent, LoadOrganizationInterCompanyGLDetailsComponent } from "./Entities/OrganizationInterCompanyGL/sections/details.component"
import { OrganizationDetailsComponent, LoadOrganizationDetailsComponent } from "./Entities/Organization/sections/details.component"
import { PaymentAuthorizationDetailsComponent, LoadPaymentAuthorizationDetailsComponent } from "./Entities/PaymentAuthorization/sections/details.component"
import { PaymentDetailDetailsComponent, LoadPaymentDetailDetailsComponent } from "./Entities/PaymentDetail/sections/details.component"
import { PaymentGLEntryDetailsComponent, LoadPaymentGLEntryDetailsComponent } from "./Entities/PaymentGLEntry/sections/details.component"
import { PaymentInformationDetailsComponent, LoadPaymentInformationDetailsComponent } from "./Entities/PaymentInformation/sections/details.component"
import { PaymentStatusTypeDetailsComponent, LoadPaymentStatusTypeDetailsComponent } from "./Entities/PaymentStatusType/sections/details.component"
import { PaymentTypeGLAccountDetailsComponent, LoadPaymentTypeGLAccountDetailsComponent } from "./Entities/PaymentTypeGLAccount/sections/details.component"
import { PaymentTypeDetailsComponent, LoadPaymentTypeDetailsComponent } from "./Entities/PaymentType/sections/details.component"
import { PaymentDetailsComponent, LoadPaymentDetailsComponent } from "./Entities/Payment/sections/details.component"
import { PersonDetailsComponent, LoadPersonDetailsComponent } from "./Entities/Person/sections/details.component"
import { PersonAccountManagerDetailsComponent, LoadPersonAccountManagerDetailsComponent } from "./Entities/PersonAccountManager/sections/details.component"
import { PersonAddressDetailsComponent, LoadPersonAddressDetailsComponent } from "./Entities/PersonAddress/sections/details.component"
import { PersonEducationDetailsComponent, LoadPersonEducationDetailsComponent } from "./Entities/PersonEducation/sections/details.component"
import { PersonExternalAccountDetailsComponent, LoadPersonExternalAccountDetailsComponent } from "./Entities/PersonExternalAccount/sections/details.component"
import { PersonFunctionDetailsComponent, LoadPersonFunctionDetailsComponent } from "./Entities/PersonFunction/sections/details.component"
import { PersonPersonDetailsComponent, LoadPersonPersonDetailsComponent } from "./Entities/PersonPerson/sections/details.component"
import { PersonPhoneDetailsComponent, LoadPersonPhoneDetailsComponent } from "./Entities/PersonPhone/sections/details.component"
import { PersonRelationshipAttributeDetailsComponent, LoadPersonRelationshipAttributeDetailsComponent } from "./Entities/PersonRelationshipAttribute/sections/details.component"
import { PersonRelationshipTypeDetailsComponent, LoadPersonRelationshipTypeDetailsComponent } from "./Entities/PersonRelationshipType/sections/details.component"
import { PersonSavedPaymentMethodDetailsComponent, LoadPersonSavedPaymentMethodDetailsComponent } from "./Entities/PersonSavedPaymentMethod/sections/details.component"
import { PersonTaxExCodeDetailsComponent, LoadPersonTaxExCodeDetailsComponent } from "./Entities/PersonTaxExCode/sections/details.component"
import { PhoneNumberDetailsComponent, LoadPhoneNumberDetailsComponent } from "./Entities/PhoneNumber/sections/details.component"
import { PhoneRegionCodesDetailsComponent, LoadPhoneRegionCodesDetailsComponent } from "./Entities/PhoneRegionCodes/sections/details.component"
import { PledgeContactTypeDetailsComponent, LoadPledgeContactTypeDetailsComponent } from "./Entities/PledgeContactType/sections/details.component"
import { PledgeContactDetailsComponent, LoadPledgeContactDetailsComponent } from "./Entities/PledgeContact/sections/details.component"
import { PledgeFundDetailsComponent, LoadPledgeFundDetailsComponent } from "./Entities/PledgeFund/sections/details.component"
import { PledgeGuestListDetailsComponent, LoadPledgeGuestListDetailsComponent } from "./Entities/PledgeGuestList/sections/details.component"
import { PledgePaymentScheduleDetailsComponent, LoadPledgePaymentScheduleDetailsComponent } from "./Entities/PledgePaymentSchedule/sections/details.component"
import { PledgeStageDetailsComponent, LoadPledgeStageDetailsComponent } from "./Entities/PledgeStage/sections/details.component"
import { PledgeDetailsComponent, LoadPledgeDetailsComponent } from "./Entities/Pledge/sections/details.component"
import { PostalCodeDetailsComponent, LoadPostalCodeDetailsComponent } from "./Entities/PostalCode/sections/details.component"
import { PrefCommunicationMethodDetailsComponent, LoadPrefCommunicationMethodDetailsComponent } from "./Entities/PrefCommunicationMethod/sections/details.component"
import { PrefixDetailsComponent, LoadPrefixDetailsComponent } from "./Entities/Prefix/sections/details.component"
import { PricingRuleDetailsComponent, LoadPricingRuleDetailsComponent } from "./Entities/PricingRule/sections/details.component"
import { ProdInvLedgerEntryDetailsComponent, LoadProdInvLedgerEntryDetailsComponent } from "./Entities/ProdInvLedgerEntry/sections/details.component"
import { ProductAssemblyDetailsComponent, LoadProductAssemblyDetailsComponent } from "./Entities/ProductAssembly/sections/details.component"
import { ProductAttributeDetailsComponent, LoadProductAttributeDetailsComponent } from "./Entities/ProductAttribute/sections/details.component"
import { ProductCategoryDetailsComponent, LoadProductCategoryDetailsComponent } from "./Entities/ProductCategory/sections/details.component"
import { ProductCategoryAttribDetailsComponent, LoadProductCategoryAttribDetailsComponent } from "./Entities/ProductCategoryAttrib/sections/details.component"
import { ProductCategoryGLAccountDetailsComponent, LoadProductCategoryGLAccountDetailsComponent } from "./Entities/ProductCategoryGLAccount/sections/details.component"
import { ProductCodeDetailsComponent, LoadProductCodeDetailsComponent } from "./Entities/ProductCode/sections/details.component"
import { ProductCostDetailDetailsComponent, LoadProductCostDetailDetailsComponent } from "./Entities/ProductCostDetail/sections/details.component"
import { ProductCostTypeDetailsComponent, LoadProductCostTypeDetailsComponent } from "./Entities/ProductCostType/sections/details.component"
import { ProductCostDetailsComponent, LoadProductCostDetailsComponent } from "./Entities/ProductCost/sections/details.component"
import { ProductDownloadHistoryDetailsComponent, LoadProductDownloadHistoryDetailsComponent } from "./Entities/ProductDownloadHistory/sections/details.component"
import { ProductDownloadsDetailsComponent, LoadProductDownloadsDetailsComponent } from "./Entities/ProductDownloads/sections/details.component"
import { ProductGLAccountDetailsComponent, LoadProductGLAccountDetailsComponent } from "./Entities/ProductGLAccount/sections/details.component"
import { ProductHistAvgCostDetailsComponent, LoadProductHistAvgCostDetailsComponent } from "./Entities/ProductHistAvgCost/sections/details.component"
import { ProductInvLedgerDetailsComponent, LoadProductInvLedgerDetailsComponent } from "./Entities/ProductInvLedger/sections/details.component"
import { ProductInventoryLedgerEntryTransactionsDetailsComponent, LoadProductInventoryLedgerEntryTransactionsDetailsComponent } from "./Entities/ProductInventoryLedgerEntryTransactions/sections/details.component"
import { ProductIssueDetailsComponent, LoadProductIssueDetailsComponent } from "./Entities/ProductIssue/sections/details.component"
import { ProductKitTypeDetailsComponent, LoadProductKitTypeDetailsComponent } from "./Entities/ProductKitType/sections/details.component"
import { ProductPriceDetailsComponent, LoadProductPriceDetailsComponent } from "./Entities/ProductPrice/sections/details.component"
import { ProductRelationDetailsComponent, LoadProductRelationDetailsComponent } from "./Entities/ProductRelation/sections/details.component"
import { ProductRelationshipTypeDetailsComponent, LoadProductRelationshipTypeDetailsComponent } from "./Entities/ProductRelationshipType/sections/details.component"
import { ProductTypeAttributeDetailsComponent, LoadProductTypeAttributeDetailsComponent } from "./Entities/ProductTypeAttribute/sections/details.component"
import { ProductTypeDetailsComponent, LoadProductTypeDetailsComponent } from "./Entities/ProductType/sections/details.component"
import { ProductVendorDetailsComponent, LoadProductVendorDetailsComponent } from "./Entities/ProductVendor/sections/details.component"
import { ProductVersionDetailsComponent, LoadProductVersionDetailsComponent } from "./Entities/ProductVersion/sections/details.component"
import { ProductWebTemplateDetailsComponent, LoadProductWebTemplateDetailsComponent } from "./Entities/ProductWebTemplate/sections/details.component"
import { ProductDetailsComponent, LoadProductDetailsComponent } from "./Entities/Product/sections/details.component"
import { PublicationContributorDetailsComponent, LoadPublicationContributorDetailsComponent } from "./Entities/PublicationContributor/sections/details.component"
import { PublicationRoleDetailsComponent, LoadPublicationRoleDetailsComponent } from "./Entities/PublicationRole/sections/details.component"
import { PublicationDetailsComponent, LoadPublicationDetailsComponent } from "./Entities/Publication/sections/details.component"
import { QuestionBranchAnswerBranchDetailsComponent, LoadQuestionBranchAnswerBranchDetailsComponent } from "./Entities/QuestionBranchAnswerBranch/sections/details.component"
import { QuestionBranchDetailsComponent, LoadQuestionBranchDetailsComponent } from "./Entities/QuestionBranch/sections/details.component"
import { QuestionKnowledgeAnswerDetailsComponent, LoadQuestionKnowledgeAnswerDetailsComponent } from "./Entities/QuestionKnowledgeAnswer/sections/details.component"
import { QuestionTreeKnowledgeDeliveryTypeDetailsComponent, LoadQuestionTreeKnowledgeDeliveryTypeDetailsComponent } from "./Entities/QuestionTreeKnowledgeDeliveryType/sections/details.component"
import { QuestionTreeKnowledgeStyleSheetDetailsComponent, LoadQuestionTreeKnowledgeStyleSheetDetailsComponent } from "./Entities/QuestionTreeKnowledgeStyleSheet/sections/details.component"
import { QuestionTreeListKnowledgeStyleSheetDetailsComponent, LoadQuestionTreeListKnowledgeStyleSheetDetailsComponent } from "./Entities/QuestionTreeListKnowledgeStyleSheet/sections/details.component"
import { QuestionTreeDetailsComponent, LoadQuestionTreeDetailsComponent } from "./Entities/QuestionTree/sections/details.component"
import { QuestionTypeDetailsComponent, LoadQuestionTypeDetailsComponent } from "./Entities/QuestionType/sections/details.component"
import { QuestionDetailsComponent, LoadQuestionDetailsComponent } from "./Entities/Question/sections/details.component"
import { RatedItemTypeDetailsComponent, LoadRatedItemTypeDetailsComponent } from "./Entities/RatedItemType/sections/details.component"
import { RatedItemDetailsComponent, LoadRatedItemDetailsComponent } from "./Entities/RatedItem/sections/details.component"
import { ReferralRequestVendorDetailsComponent, LoadReferralRequestVendorDetailsComponent } from "./Entities/ReferralRequestVendor/sections/details.component"
import { ReferralRequestDetailsComponent, LoadReferralRequestDetailsComponent } from "./Entities/ReferralRequest/sections/details.component"
import { ReferralTypeDetailsComponent, LoadReferralTypeDetailsComponent } from "./Entities/ReferralType/sections/details.component"
import { ReferralDetailsComponent, LoadReferralDetailsComponent } from "./Entities/Referral/sections/details.component"
import { RegistrationLineDetailsComponent, LoadRegistrationLineDetailsComponent } from "./Entities/RegistrationLine/sections/details.component"
import { ResourceType__dboDetailsComponent, LoadResourceType__dboDetailsComponent } from "./Entities/ResourceType__dbo/sections/details.component"
import { ResourceDetailsComponent, LoadResourceDetailsComponent } from "./Entities/Resource/sections/details.component"
import { RestrictedCountryDetailsComponent, LoadRestrictedCountryDetailsComponent } from "./Entities/RestrictedCountry/sections/details.component"
import { RevenueCategoryDetailsComponent, LoadRevenueCategoryDetailsComponent } from "./Entities/RevenueCategory/sections/details.component"
import { RevenueRecognitionTypeDetailsComponent, LoadRevenueRecognitionTypeDetailsComponent } from "./Entities/RevenueRecognitionType/sections/details.component"
import { SalesTargetTypeDetailsComponent, LoadSalesTargetTypeDetailsComponent } from "./Entities/SalesTargetType/sections/details.component"
import { SalesTargetDetailsComponent, LoadSalesTargetDetailsComponent } from "./Entities/SalesTarget/sections/details.component"
import { SalesTaxRateDetailsComponent, LoadSalesTaxRateDetailsComponent } from "./Entities/SalesTaxRate/sections/details.component"
import { ScheduleTransAccountEntryDetailsComponent, LoadScheduleTransAccountEntryDetailsComponent } from "./Entities/ScheduleTransAccountEntry/sections/details.component"
import { ScheduledTransactionGroupDetailsComponent, LoadScheduledTransactionGroupDetailsComponent } from "./Entities/ScheduledTransactionGroup/sections/details.component"
import { ScheduledTransactionDetailsComponent, LoadScheduledTransactionDetailsComponent } from "./Entities/ScheduledTransaction/sections/details.component"
import { ScriptLanguageDetailsComponent, LoadScriptLanguageDetailsComponent } from "./Entities/ScriptLanguage/sections/details.component"
import { ScriptTypeDetailsComponent, LoadScriptTypeDetailsComponent } from "./Entities/ScriptType/sections/details.component"
import { ScriptDetailsComponent, LoadScriptDetailsComponent } from "./Entities/Script/sections/details.component"
import { ShipTypeDetailsComponent, LoadShipTypeDetailsComponent } from "./Entities/ShipType/sections/details.component"
import { SkillLevelDetailsComponent, LoadSkillLevelDetailsComponent } from "./Entities/SkillLevel/sections/details.component"
import { Skill__dboDetailsComponent, LoadSkill__dboDetailsComponent } from "./Entities/Skill__dbo/sections/details.component"
import { SocialstreamDetailsComponent, LoadSocialstreamDetailsComponent } from "./Entities/Socialstream/sections/details.component"
import { StandingOrProdCatDetailsComponent, LoadStandingOrProdCatDetailsComponent } from "./Entities/StandingOrProdCat/sections/details.component"
import { StandingOrProdDetailsComponent, LoadStandingOrProdDetailsComponent } from "./Entities/StandingOrProd/sections/details.component"
import { StandingOrPurchasesDetailsComponent, LoadStandingOrPurchasesDetailsComponent } from "./Entities/StandingOrPurchases/sections/details.component"
import { StandingOrderScheduleDetailsComponent, LoadStandingOrderScheduleDetailsComponent } from "./Entities/StandingOrderSchedule/sections/details.component"
import { StandingOrderDetailsComponent, LoadStandingOrderDetailsComponent } from "./Entities/StandingOrder/sections/details.component"
import { StateProvinceDetailsComponent, LoadStateProvinceDetailsComponent } from "./Entities/StateProvince/sections/details.component"
import { SubsCancelReasonDetailsComponent, LoadSubsCancelReasonDetailsComponent } from "./Entities/SubsCancelReason/sections/details.component"
import { SubscriptionDeliveryLogDetailsComponent, LoadSubscriptionDeliveryLogDetailsComponent } from "./Entities/SubscriptionDeliveryLog/sections/details.component"
import { SubscriptionDeliveryScheduleDetailsComponent, LoadSubscriptionDeliveryScheduleDetailsComponent } from "./Entities/SubscriptionDeliverySchedule/sections/details.component"
import { SubscriptionFulfillmentDetailsComponent, LoadSubscriptionFulfillmentDetailsComponent } from "./Entities/SubscriptionFulfillment/sections/details.component"
import { SubscriptionPurchaseTypeDetailsComponent, LoadSubscriptionPurchaseTypeDetailsComponent } from "./Entities/SubscriptionPurchaseType/sections/details.component"
import { SubscriptionPurchaseDetailsComponent, LoadSubscriptionPurchaseDetailsComponent } from "./Entities/SubscriptionPurchase/sections/details.component"
import { SubscriptionStatusDetailsComponent, LoadSubscriptionStatusDetailsComponent } from "./Entities/SubscriptionStatus/sections/details.component"
import { SubscriptionTypeDetailsComponent, LoadSubscriptionTypeDetailsComponent } from "./Entities/SubscriptionType/sections/details.component"
import { SubscriptionDetailsComponent, LoadSubscriptionDetailsComponent } from "./Entities/Subscription/sections/details.component"
import { SuffixDetailsComponent, LoadSuffixDetailsComponent } from "./Entities/Suffix/sections/details.component"
import { TaskLinkDetailsComponent, LoadTaskLinkDetailsComponent } from "./Entities/TaskLink/sections/details.component"
import { TaskTypeDetailsComponent, LoadTaskTypeDetailsComponent } from "./Entities/TaskType/sections/details.component"
import { TaskDetailsComponent, LoadTaskDetailsComponent } from "./Entities/Task/sections/details.component"
import { TaxJurisdictionDetailsComponent, LoadTaxJurisdictionDetailsComponent } from "./Entities/TaxJurisdiction/sections/details.component"
import { TopicCodeLinkDetailsComponent, LoadTopicCodeLinkDetailsComponent } from "./Entities/TopicCodeLink/sections/details.component"
import { TopicCodeDetailsComponent, LoadTopicCodeDetailsComponent } from "./Entities/TopicCode/sections/details.component"
import { WebClickthroughDetailsComponent, LoadWebClickthroughDetailsComponent } from "./Entities/WebClickthrough/sections/details.component"
import { WebGroupDetailsComponent, LoadWebGroupDetailsComponent } from "./Entities/WebGroup/sections/details.component"
import { WebShoppingCartDetailsComponent, LoadWebShoppingCartDetailsComponent } from "./Entities/WebShoppingCart/sections/details.component"
import { WebUserActivityDetailsComponent, LoadWebUserActivityDetailsComponent } from "./Entities/WebUserActivity/sections/details.component"
import { WebUserGroupDetailsComponent, LoadWebUserGroupDetailsComponent } from "./Entities/WebUserGroup/sections/details.component"
import { WebUserDetailsComponent, LoadWebUserDetailsComponent } from "./Entities/WebUser/sections/details.component"
   

@NgModule({
declarations: [
    AbstractCategoryFormComponent,
    AbstractFormComponent,
    AccountingPeriodFormComponent,
    AdInsertionOrderOptionFormComponent,
    AddressTypeFormComponent,
    AddressFormComponent,
    AdvertisingBlindBoxFormComponent,
    AdvertisingColorCodeFormComponent,
    AdvertisingContractPublicationFormComponent,
    AdvertisingContractSalesRepresentativeFormComponent,
    AdvertisingContractFormComponent,
    AdvertisingFileTypeFormComponent,
    AdvertisingFrequencyCodeFormComponent,
    AdvertisingInsertionOrdAdjustHistoryFormComponent,
    AdvertisingInsertionOrdBillToFormComponent,
    AdvertisingInsertionOrdSalesRepFormComponent,
    AdvertisingInsertionOrderFormComponent,
    AdvertisingOptionsFormComponent,
    AdvertisingPositionCodeFormComponent,
    AdvertisingPriceOverrideReasonFormComponent],
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
    AdvertisingProductSectionFormComponent,
    AdvertisingRateCardDeadlineFormComponent,
    AdvertisingRateCardRateOptionFormComponent,
    AdvertisingRateCardRateSectionFormComponent,
    AdvertisingRateCardRateFormComponent,
    AdvertisingRateCardFormComponent,
    AdvertisingSizeCodeFormComponent,
    AdvertisingUnitDefinitionFormComponent,
    AnswerSheetAnswerFormComponent,
    AnswerSheetFormComponent,
    AttendeeStatusFormComponent,
    AwardGrantedFormComponent,
    AwardNominationFormComponent,
    AwardTypeFormComponent,
    BatchAccountEntryFormComponent,
    BatchExportTypeFormComponent,
    BatchFormComponent,
    BoothFormComponent,
    CampaignActivityForecastFormComponent,
    CampaignCostTypeFormComponent],
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
    CampaignCostFormComponent,
    CampaignDocStatusTypeFormComponent,
    CampaignDocumentTypeFormComponent,
    CampaignDocumentFormComponent,
    CampaignGLAccountFormComponent,
    CampaignImportFileColumnFormComponent,
    CampaignLinkedDocumentFormComponent,
    CampaignListDetailFormComponent,
    CampaignProductCategoryFormComponent,
    CampaignProductFormComponent,
    CampaignProspectStatusTypeFormComponent,
    CampaignSegmentDocumentFormComponent,
    CampaignSegmentFormComponent,
    CampaignStatusTypeFormComponent,
    CampaignTypeFormComponent,
    CampaignFormComponent,
    CancellationOrderlinesFormComponent,
    CancellationReasonFormComponent,
    CaseAssigneeDefaultFormComponent,
    CaseAssigneePostalCodeFormComponent],
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
    CaseAssigneeFormComponent,
    CaseCategoryFormComponent,
    CaseCostTypeFormComponent,
    CaseCostFormComponent,
    CaseIssueFormComponent,
    CasePriorityFormComponent,
    CaseReasonFormComponent,
    CaseReportMethodFormComponent,
    CaseReporterFormComponent,
    CaseResultFormComponent,
    CaseRoleFormComponent,
    CaseSatisfactionLevelFormComponent,
    CaseStatusFormComponent,
    CaseSurveyMethodFormComponent,
    CaseTypeFormComponent,
    CasesFormComponent,
    CashCtrlBatchDetailAllocFormComponent,
    CashCtrlBatchDetailFormComponent,
    CashCtrlBatchFormComponent,
    CertificationAnswerSheetFormComponent],
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
    CertificationFormComponent,
    CESPlanKPIMetricFormComponent,
    CESPlanKPIRunMappingFormComponent,
    CESPlanFormComponent,
    CESPointFormComponent,
    CESScoreFormComponent,
    ChapterAssignmentRuleFormComponent,
    ChapterAuthorizationFormComponent,
    ChapterMeetingFormComponent,
    ChapterMembershipProductFormComponent,
    ChapterReportCategoryFormComponent,
    ChapterReportFormComponent,
    ChapterRoleTypeAuthorizationFormComponent,
    ChapterRoleTypeFormComponent,
    ChapterRoleFormComponent,
    ClassCertificatePrintRunFormComponent,
    ClassExamFormComponent,
    ClassExpectedStudentFormComponent,
    ClassPartUseFormComponent,
    ClassRegistrationPartStatusFormComponent],
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
    ClassRegistrationFormComponent,
    ClassReqDesigFormComponent,
    ClassScheduleAgendaFormComponent,
    ClassScheduleFormComponent,
    ClassFormComponent,
    CommissionAgmtDetTierFormComponent,
    CommissionAgreementDetailFormComponent,
    CommissionAgreementFormComponent,
    CommissionBaseFormulaFormComponent,
    CommissionPayDetAdjustmentFormComponent,
    CommissionPayDetTierFormComponent,
    CommissionPaySourceDetailFormComponent,
    CommissionPaymentDetailFormComponent,
    CommissionPaymentFormComponent,
    CommissionPlanDetailFormComponent,
    CommissionPlanItemFormComponent,
    CommissionPlanFormComponent,
    CommissionRateScaleDetailFormComponent,
    CommissionRateScaleFormComponent,
    CommissionSourceFormComponent],
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
export class GeneratedForms_SubModule_5 { }
    


@NgModule({
declarations: [
    CommissionTerritoryFormComponent,
    CommissionTypeFormComponent,
    CommitteeNomineeFormComponent,
    CommitteeRoleFormComponent,
    CommitteeTermMeetingFormComponent,
    CommitteeTermMemberFormComponent,
    CommitteeTermRenewalMembersFormComponent,
    CommitteeTermRenewalFormComponent,
    CommitteeTermFormComponent,
    CommitteeTypeFormComponent,
    CommitteeFormComponent,
    Company__dboFormComponent,
    CompanyAccountManagerFormComponent,
    CompanyAddressFormComponent,
    CompanyCompanyFormComponent,
    CompanyPersonFunctionFormComponent,
    CompanyPersonFormComponent,
    CompanyPhoneFormComponent,
    CompanyProductCodeFormComponent,
    CompanyRelationshipTypeFormComponent],
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
    CompanySavedPaymentMethodFormComponent,
    CompanyTaxExCodeFormComponent,
    CompanyTypeFormComponent,
    ContactLogCategoryFormComponent,
    ContactLogLinkFormComponent,
    ContactLogTypeFormComponent,
    ContactLogFormComponent,
    ContinentFormComponent,
    CountryFormComponent,
    CourseCategoryFormComponent,
    CourseEnrollmentTypeFormComponent,
    CourseETMaterialsFormComponent,
    CourseExamFormComponent,
    CourseInstrDesigFormComponent,
    CourseInstructorFormComponent,
    CoursePartCategoryFormComponent,
    CoursePartUseFormComponent,
    CoursePartFormComponent,
    CoursePreReqFormComponent,
    CourseSchoolSubFormComponent],
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
export class GeneratedForms_SubModule_7 { }
    


@NgModule({
declarations: [
    CourseSchoolFormComponent,
    CourseFormComponent,
    CreditCardTypeFormComponent,
    CreditStatusFormComponent,
    CreditStatusApproverFormComponent,
    CultureFormatFormComponent,
    CultureStringCategoryFormComponent,
    CultureStringLocalFormComponent,
    CultureStringFormComponent,
    CultureFormComponent,
    CurrencySpotRateFormComponent,
    CurrencyTypeFormComponent,
    CurriculumApplicationDetailFormComponent,
    CurriculumApplicationFormComponent,
    CurriculumCategoryFormComponent,
    CurriculumCourseFormComponent,
    CurriculumDefinitionCategoryFormComponent,
    CurriculumDefinitionFormComponent,
    CurriculumSchoolFormComponent,
    DepartmentFormComponent],
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
export class GeneratedForms_SubModule_8 { }
    


@NgModule({
declarations: [
    DiscussionForumLinkFormComponent,
    DiscussionForumMessageFormComponent,
    DiscussionForumModeratorFormComponent,
    DiscussionForumSubscriptionFormComponent,
    DiscussionForumUserFormComponent,
    DiscussionForumWebGroupFormComponent,
    DiscussionForumFormComponent,
    DistributionTypeFormComponent,
    DonorAdvisedFundAllocationFormComponent,
    DonorAdvisedFundFormComponent,
    DownloadItemsFormComponent,
    DuesCategoryFormComponent,
    EducationCategoryFormComponent,
    EducationFieldFormComponent,
    EducationLevelFormComponent,
    EducationStatusFormComponent,
    EducationUnitFormComponent,
    EmployeePositionCodesFormComponent,
    EmployeeSkill__dboFormComponent,
    Employee__dboFormComponent],
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
export class GeneratedForms_SubModule_9 { }
    


@NgModule({
declarations: [
    EnrollmentTypeFormComponent,
    ExamQuestionAnswersFormComponent,
    ExamQuestionFormComponent,
    ExamFormComponent,
    ExpoBoothConfigurationFormComponent,
    ExpoFloorplanFormComponent,
    ExpoPriorityPointTypeFormComponent,
    ExpoPriorityPointFormComponent,
    ExpoFormComponent,
    ExternalSystemFormComponent,
    FloorplanStatusFormComponent,
    FloorplanSystemFormComponent,
    FloorplanFormComponent,
    FoodPreferenceFormComponent,
    FreightMethodsFormComponent,
    FrequencyAgreementFormComponent,
    FunctionRoleFormComponent,
    FundCampaignGivingFormComponent,
    FundCampaignProductFormComponent,
    FundCampaignSolicitorProspectFormComponent],
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
export class GeneratedForms_SubModule_10 { }
    


@NgModule({
declarations: [
    FundCampaignSolicitorFormComponent,
    FundCampaignFormComponent,
    FundraisingPriceFormComponent,
    FundraisingPricingOptionFormComponent,
    GiftsInKindCategoriesFormComponent,
    GiftsInKindFormComponent,
    GLAccountFormComponent,
    GLOrderLevelFormComponent,
    GLPaymentLevelFormComponent,
    GrantDisbursementFormComponent,
    GrantDueDiligenceStepLinkFormComponent,
    GrantDueDiligenceStepFormComponent,
    GrantReportPaymentLinkFormComponent,
    GrantReportFormComponent,
    GrantsFormComponent,
    HousingBlockOptionFormComponent,
    HousingBlockRoomFormComponent,
    HousingBlockFormComponent,
    HousingReservationDetOptionFormComponent,
    HousingReservationDetailFormComponent],
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
export class GeneratedForms_SubModule_11 { }
    


@NgModule({
declarations: [
    HousingReservationGuestFormComponent,
    HousingReservationFormComponent,
    HousingRoomTypeFormComponent,
    HousingTransferDetailFormComponent,
    HousingTransferTypeFormComponent,
    HousingTransferFormComponent,
    HousingFormComponent,
    InstantMessagingUserProfileFormComponent,
    InstructorDesignationFormComponent,
    InternationalSupportFundCategoryFormComponent,
    InternationalSupportFundFormComponent,
    InventoryLocationFormComponent,
    InventoryOnOrderFormComponent,
    InventoryTransferFormComponent,
    InvoiceConsolidationOrderFormComponent,
    InvoiceConsolidationPaymentFormComponent,
    InvoiceConsolidationFormComponent,
    InvoiceMessageFormComponent,
    IssueCategoryFormComponent,
    IssueFormComponent],
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
export class GeneratedForms_SubModule_12 { }
    


@NgModule({
declarations: [
    ItemRatingEntryFormComponent,
    ItemRatingTypeDefinitionFormComponent,
    ItemRatingTypeFormComponent,
    ItemRatingFormComponent,
    ItemReviewEntriesFormComponent,
    KeyPerformanceIndicatorFormComponent,
    KnowledgeAnswerFormComponent,
    KnowledgeCaptureModeFormComponent,
    KnowledgeCategoryFormComponent,
    KnowledgeDeliveryTypeFormComponent,
    KnowledgeParticipantFormComponent,
    KnowledgeResultDetailFormComponent,
    KnowledgeResultFormComponent,
    KnowledgeStatusFormComponent,
    KnowledgeStyleSheetFormComponent,
    KnowledgeTrackingTypeFormComponent,
    KPIFormulaFormComponent,
    KPIMetricMappingFormComponent,
    KPIMetricFormComponent,
    KPIResultParticipantRecordFormComponent],
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
export class GeneratedForms_SubModule_13 { }
    


@NgModule({
declarations: [
    KPIResultFormComponent,
    KPIRunFormComponent,
    KPIUnitTypeFormComponent,
    LearningManagementSystemAttributeFormComponent,
    LearningManagementSystemInteractionFormComponent,
    LearningManagementSystemFormComponent,
    ListDetailArchiveFormComponent,
    ListDetail__dboFormComponent,
    ListTypeFormComponent,
    List__dboFormComponent,
    MailingActivityFormComponent,
    MailingActivityDetailFormComponent,
    MarketPlaceCategoryFormComponent,
    MarketPlaceInfoRequestFormComponent,
    MarketPlaceListingTypeFormComponent,
    MarketPlaceListingFormComponent,
    MeetingAttPossValueFormComponent,
    MeetingAttendeeGroupFormComponent,
    MeetingAttendeeTypeFormComponent,
    MeetingAttributeFormComponent],
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
export class GeneratedForms_SubModule_14 { }
    


@NgModule({
declarations: [
    MeetingEducationUnitFormComponent,
    MeetingHotelFormComponent,
    MeetingResourceFormComponent,
    MeetingRoomPossibleTypeFormComponent,
    MeetingRoomRoomFormComponent,
    MeetingRoomTypeFormComponent,
    MeetingRoomFormComponent,
    MeetingSessionFormComponent,
    MeetingSpeakerEvalFormComponent,
    MeetingSpeakerFormComponent,
    MeetingSponsorFormComponent,
    MeetingStatusFormComponent,
    MeetingTimeSlotFormComponent,
    MeetingTrackFormComponent,
    MeetingTransferEmailFormComponent,
    MeetingTransferFormComponent,
    MeetingTypeAttPossValueFormComponent,
    MeetingTypeAttributeFormComponent,
    MeetingTypeFormComponent,
    MeetingFormComponent],
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
export class GeneratedForms_SubModule_15 { }
    


@NgModule({
declarations: [
    MemberStatusTypeFormComponent,
    MemberTypeFormComponent,
    MembershipApplicationDefinitionProductFormComponent,
    MembershipApplicationDefinitionFormComponent,
    MembershipApplicationFormComponent,
    MembershipEmailSchedulesFormComponent,
    MembershipEnrollmentFormComponent,
    MembershipStatusFormComponent,
    MerchantAccountFormComponent,
    OpportunityFormComponent,
    OpportunityCompetitorFormComponent,
    OpportunityContactRoleTypeFormComponent,
    OpportunityContactFormComponent,
    OpportunityDetailFormComponent,
    OpportunityHistoryFormComponent,
    OpportunityPartnerRoleTypeFormComponent,
    OpportunityPartnerRoleFormComponent,
    OpportunityPartnerFormComponent,
    OpportunityReferenceTypeFormComponent,
    OpportunityReferenceFormComponent],
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
export class GeneratedForms_SubModule_16 { }
    


@NgModule({
declarations: [
    OpportunityRoleFormComponent,
    OpportunitySellingRoleTypeFormComponent,
    OpportunitySourceFormComponent,
    OpportunityStageOpportunityTypeFormComponent,
    OpportunityStageFormComponent,
    OpportunityStatusReportFormComponent,
    OpportunityTypeFormComponent,
    OrderBalanceFormComponent,
    OrderBoothCoExhibitorFormComponent,
    OrderBoothDetailFormComponent,
    OrderBoothProductCodeFormComponent,
    OrderCancellationWizardFormComponent,
    OrderCurrencySpotRateFormComponent,
    OrderDetailFormComponent,
    OrderGLEntryFormComponent,
    OrderInvAllocationFormComponent,
    OrderLineTaxFormComponent,
    OrderMasterFormComponent,
    OrderMeetingDetailAttributeFormComponent,
    OrderMeetingDetailEducationUnitFormComponent],
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
export class GeneratedForms_SubModule_17 { }
    


@NgModule({
declarations: [
    OrderMeetingDetailFormComponent,
    OrderMeetingSessionDetailFormComponent,
    OrderPmtScheduleFormComponent,
    OrderShipmentTaxFormComponent,
    OrderShipmentFormComponent,
    OrderSourceFormComponent,
    OrderStateFormComponent,
    OrderStatusTypeFormComponent,
    OrderTotalFormComponent,
    OrderTypeFormComponent,
    OrganizationAddressFormComponent,
    OrganizationGLAccountFormComponent,
    OrganizationInterCompanyGLFormComponent,
    OrganizationFormComponent,
    PaymentAuthorizationFormComponent,
    PaymentDetailFormComponent,
    PaymentGLEntryFormComponent,
    PaymentInformationFormComponent,
    PaymentStatusTypeFormComponent,
    PaymentTypeGLAccountFormComponent],
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
export class GeneratedForms_SubModule_18 { }
    


@NgModule({
declarations: [
    PaymentTypeFormComponent,
    PaymentFormComponent,
    PersonFormComponent,
    PersonAccountManagerFormComponent,
    PersonAddressFormComponent,
    PersonEducationFormComponent,
    PersonExternalAccountFormComponent,
    PersonFunctionFormComponent,
    PersonPersonFormComponent,
    PersonPhoneFormComponent,
    PersonRelationshipAttributeFormComponent,
    PersonRelationshipTypeFormComponent,
    PersonSavedPaymentMethodFormComponent,
    PersonTaxExCodeFormComponent,
    PhoneNumberFormComponent,
    PhoneRegionCodesFormComponent,
    PledgeContactTypeFormComponent,
    PledgeContactFormComponent,
    PledgeFundFormComponent,
    PledgeGuestListFormComponent],
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
export class GeneratedForms_SubModule_19 { }
    


@NgModule({
declarations: [
    PledgePaymentScheduleFormComponent,
    PledgeStageFormComponent,
    PledgeFormComponent,
    PostalCodeFormComponent,
    PrefCommunicationMethodFormComponent,
    PrefixFormComponent,
    PricingRuleFormComponent,
    ProdInvLedgerEntryFormComponent,
    ProductAssemblyFormComponent,
    ProductAttributeFormComponent,
    ProductCategoryFormComponent,
    ProductCategoryAttribFormComponent,
    ProductCategoryGLAccountFormComponent,
    ProductCodeFormComponent,
    ProductCostDetailFormComponent,
    ProductCostTypeFormComponent,
    ProductCostFormComponent,
    ProductDownloadHistoryFormComponent,
    ProductDownloadsFormComponent,
    ProductGLAccountFormComponent],
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
export class GeneratedForms_SubModule_20 { }
    


@NgModule({
declarations: [
    ProductHistAvgCostFormComponent,
    ProductInvLedgerFormComponent,
    ProductInventoryLedgerEntryTransactionsFormComponent,
    ProductIssueFormComponent,
    ProductKitTypeFormComponent,
    ProductPriceFormComponent,
    ProductRelationFormComponent,
    ProductRelationshipTypeFormComponent,
    ProductTypeAttributeFormComponent,
    ProductTypeFormComponent,
    ProductVendorFormComponent,
    ProductVersionFormComponent,
    ProductWebTemplateFormComponent,
    ProductFormComponent,
    PublicationContributorFormComponent,
    PublicationRoleFormComponent,
    PublicationFormComponent,
    QuestionBranchAnswerBranchFormComponent,
    QuestionBranchFormComponent,
    QuestionKnowledgeAnswerFormComponent],
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
export class GeneratedForms_SubModule_21 { }
    


@NgModule({
declarations: [
    QuestionTreeKnowledgeDeliveryTypeFormComponent,
    QuestionTreeKnowledgeStyleSheetFormComponent,
    QuestionTreeListKnowledgeStyleSheetFormComponent,
    QuestionTreeFormComponent,
    QuestionTypeFormComponent,
    QuestionFormComponent,
    RatedItemTypeFormComponent,
    RatedItemFormComponent,
    ReferralRequestVendorFormComponent,
    ReferralRequestFormComponent,
    ReferralTypeFormComponent,
    ReferralFormComponent,
    RegistrationLineFormComponent,
    ResourceType__dboFormComponent,
    ResourceFormComponent,
    RestrictedCountryFormComponent,
    RevenueCategoryFormComponent,
    RevenueRecognitionTypeFormComponent,
    SalesTargetTypeFormComponent,
    SalesTargetFormComponent],
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
export class GeneratedForms_SubModule_22 { }
    


@NgModule({
declarations: [
    SalesTaxRateFormComponent,
    ScheduleTransAccountEntryFormComponent,
    ScheduledTransactionGroupFormComponent,
    ScheduledTransactionFormComponent,
    ScriptLanguageFormComponent,
    ScriptTypeFormComponent,
    ScriptFormComponent,
    ShipTypeFormComponent,
    SkillLevelFormComponent,
    Skill__dboFormComponent,
    SocialstreamFormComponent,
    StandingOrProdCatFormComponent,
    StandingOrProdFormComponent,
    StandingOrPurchasesFormComponent,
    StandingOrderScheduleFormComponent,
    StandingOrderFormComponent,
    StateProvinceFormComponent,
    SubsCancelReasonFormComponent,
    SubscriptionDeliveryLogFormComponent,
    SubscriptionDeliveryScheduleFormComponent],
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
export class GeneratedForms_SubModule_23 { }
    


@NgModule({
declarations: [
    SubscriptionFulfillmentFormComponent,
    SubscriptionPurchaseTypeFormComponent,
    SubscriptionPurchaseFormComponent,
    SubscriptionStatusFormComponent,
    SubscriptionTypeFormComponent,
    SubscriptionFormComponent,
    SuffixFormComponent,
    TaskLinkFormComponent,
    TaskTypeFormComponent,
    TaskFormComponent,
    TaxJurisdictionFormComponent,
    TopicCodeLinkFormComponent,
    TopicCodeFormComponent,
    WebClickthroughFormComponent,
    WebGroupFormComponent,
    WebShoppingCartFormComponent,
    WebUserActivityFormComponent,
    WebUserGroupFormComponent,
    WebUserFormComponent,
    AbstractCategoryDetailsComponent],
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
export class GeneratedForms_SubModule_24 { }
    


@NgModule({
declarations: [
    AbstractDetailsComponent,
    AccountingPeriodDetailsComponent,
    AdInsertionOrderOptionDetailsComponent,
    AddressTypeDetailsComponent,
    AddressDetailsComponent,
    AdvertisingBlindBoxDetailsComponent,
    AdvertisingColorCodeDetailsComponent,
    AdvertisingContractPublicationDetailsComponent,
    AdvertisingContractSalesRepresentativeDetailsComponent,
    AdvertisingContractDetailsComponent,
    AdvertisingFileTypeDetailsComponent,
    AdvertisingFrequencyCodeDetailsComponent,
    AdvertisingInsertionOrdAdjustHistoryDetailsComponent,
    AdvertisingInsertionOrdBillToDetailsComponent,
    AdvertisingInsertionOrdSalesRepDetailsComponent,
    AdvertisingInsertionOrderDetailsComponent,
    AdvertisingOptionsDetailsComponent,
    AdvertisingPositionCodeDetailsComponent,
    AdvertisingPriceOverrideReasonDetailsComponent,
    AdvertisingProductSectionDetailsComponent],
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
export class GeneratedForms_SubModule_25 { }
    


@NgModule({
declarations: [
    AdvertisingRateCardDeadlineDetailsComponent,
    AdvertisingRateCardRateOptionDetailsComponent,
    AdvertisingRateCardRateSectionDetailsComponent,
    AdvertisingRateCardRateDetailsComponent,
    AdvertisingRateCardDetailsComponent,
    AdvertisingSizeCodeDetailsComponent,
    AdvertisingUnitDefinitionDetailsComponent,
    AnswerSheetAnswerDetailsComponent,
    AnswerSheetDetailsComponent,
    AttendeeStatusDetailsComponent,
    AwardGrantedDetailsComponent,
    AwardNominationDetailsComponent,
    AwardTypeDetailsComponent,
    BatchAccountEntryDetailsComponent,
    BatchExportTypeDetailsComponent,
    BatchDetailsComponent,
    BoothDetailsComponent,
    CampaignActivityForecastDetailsComponent,
    CampaignCostTypeDetailsComponent,
    CampaignCostDetailsComponent],
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
export class GeneratedForms_SubModule_26 { }
    


@NgModule({
declarations: [
    CampaignDocStatusTypeDetailsComponent,
    CampaignDocumentTypeDetailsComponent,
    CampaignDocumentDetailsComponent,
    CampaignGLAccountDetailsComponent,
    CampaignImportFileColumnDetailsComponent,
    CampaignLinkedDocumentDetailsComponent,
    CampaignListDetailDetailsComponent,
    CampaignProductCategoryDetailsComponent,
    CampaignProductDetailsComponent,
    CampaignProspectStatusTypeDetailsComponent,
    CampaignSegmentDocumentDetailsComponent,
    CampaignSegmentDetailsComponent,
    CampaignStatusTypeDetailsComponent,
    CampaignTypeDetailsComponent,
    CampaignDetailsComponent,
    CancellationOrderlinesDetailsComponent,
    CancellationReasonDetailsComponent,
    CaseAssigneeDefaultDetailsComponent,
    CaseAssigneePostalCodeDetailsComponent,
    CaseAssigneeDetailsComponent],
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
export class GeneratedForms_SubModule_27 { }
    


@NgModule({
declarations: [
    CaseCategoryDetailsComponent,
    CaseCostTypeDetailsComponent,
    CaseCostDetailsComponent,
    CaseIssueDetailsComponent,
    CasePriorityDetailsComponent,
    CaseReasonDetailsComponent,
    CaseReportMethodDetailsComponent,
    CaseReporterDetailsComponent,
    CaseResultDetailsComponent,
    CaseRoleDetailsComponent,
    CaseSatisfactionLevelDetailsComponent,
    CaseStatusDetailsComponent,
    CaseSurveyMethodDetailsComponent,
    CaseTypeDetailsComponent,
    CasesDetailsComponent,
    CashCtrlBatchDetailAllocDetailsComponent,
    CashCtrlBatchDetailDetailsComponent,
    CashCtrlBatchDetailsComponent,
    CertificationAnswerSheetDetailsComponent,
    CertificationDetailsComponent],
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
export class GeneratedForms_SubModule_28 { }
    


@NgModule({
declarations: [
    CESPlanKPIMetricDetailsComponent,
    CESPlanKPIRunMappingDetailsComponent,
    CESPlanDetailsComponent,
    CESPointDetailsComponent,
    CESScoreDetailsComponent,
    ChapterAssignmentRuleDetailsComponent,
    ChapterAuthorizationDetailsComponent,
    ChapterMeetingDetailsComponent,
    ChapterMembershipProductDetailsComponent,
    ChapterReportCategoryDetailsComponent,
    ChapterReportDetailsComponent,
    ChapterRoleTypeAuthorizationDetailsComponent,
    ChapterRoleTypeDetailsComponent,
    ChapterRoleDetailsComponent,
    ClassCertificatePrintRunDetailsComponent,
    ClassExamDetailsComponent,
    ClassExpectedStudentDetailsComponent,
    ClassPartUseDetailsComponent,
    ClassRegistrationPartStatusDetailsComponent,
    ClassRegistrationDetailsComponent],
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
export class GeneratedForms_SubModule_29 { }
    


@NgModule({
declarations: [
    ClassReqDesigDetailsComponent,
    ClassScheduleAgendaDetailsComponent,
    ClassScheduleDetailsComponent,
    ClassDetailsComponent,
    CommissionAgmtDetTierDetailsComponent,
    CommissionAgreementDetailDetailsComponent,
    CommissionAgreementDetailsComponent,
    CommissionBaseFormulaDetailsComponent,
    CommissionPayDetAdjustmentDetailsComponent,
    CommissionPayDetTierDetailsComponent,
    CommissionPaySourceDetailDetailsComponent,
    CommissionPaymentDetailDetailsComponent,
    CommissionPaymentDetailsComponent,
    CommissionPlanDetailDetailsComponent,
    CommissionPlanItemDetailsComponent,
    CommissionPlanDetailsComponent,
    CommissionRateScaleDetailDetailsComponent,
    CommissionRateScaleDetailsComponent,
    CommissionSourceDetailsComponent,
    CommissionTerritoryDetailsComponent],
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
export class GeneratedForms_SubModule_30 { }
    


@NgModule({
declarations: [
    CommissionTypeDetailsComponent,
    CommitteeNomineeDetailsComponent,
    CommitteeRoleDetailsComponent,
    CommitteeTermMeetingDetailsComponent,
    CommitteeTermMemberDetailsComponent,
    CommitteeTermRenewalMembersDetailsComponent,
    CommitteeTermRenewalDetailsComponent,
    CommitteeTermDetailsComponent,
    CommitteeTypeDetailsComponent,
    CommitteeDetailsComponent,
    Company__dboDetailsComponent,
    CompanyAccountManagerDetailsComponent,
    CompanyAddressDetailsComponent,
    CompanyCompanyDetailsComponent,
    CompanyPersonFunctionDetailsComponent,
    CompanyPersonDetailsComponent,
    CompanyPhoneDetailsComponent,
    CompanyProductCodeDetailsComponent,
    CompanyRelationshipTypeDetailsComponent,
    CompanySavedPaymentMethodDetailsComponent],
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
export class GeneratedForms_SubModule_31 { }
    


@NgModule({
declarations: [
    CompanyTaxExCodeDetailsComponent,
    CompanyTypeDetailsComponent,
    ContactLogCategoryDetailsComponent,
    ContactLogLinkDetailsComponent,
    ContactLogTypeDetailsComponent,
    ContactLogDetailsComponent,
    ContinentDetailsComponent,
    CountryDetailsComponent,
    CourseCategoryDetailsComponent,
    CourseEnrollmentTypeDetailsComponent,
    CourseETMaterialsDetailsComponent,
    CourseExamDetailsComponent,
    CourseInstrDesigDetailsComponent,
    CourseInstructorDetailsComponent,
    CoursePartCategoryDetailsComponent,
    CoursePartUseDetailsComponent,
    CoursePartDetailsComponent,
    CoursePreReqDetailsComponent,
    CourseSchoolSubDetailsComponent,
    CourseSchoolDetailsComponent],
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
export class GeneratedForms_SubModule_32 { }
    


@NgModule({
declarations: [
    CourseDetailsComponent,
    CreditCardTypeDetailsComponent,
    CreditStatusDetailsComponent,
    CreditStatusApproverDetailsComponent,
    CultureFormatDetailsComponent,
    CultureStringCategoryDetailsComponent,
    CultureStringLocalDetailsComponent,
    CultureStringDetailsComponent,
    CultureDetailsComponent,
    CurrencySpotRateDetailsComponent,
    CurrencyTypeDetailsComponent,
    CurriculumApplicationDetailDetailsComponent,
    CurriculumApplicationDetailsComponent,
    CurriculumCategoryDetailsComponent,
    CurriculumCourseDetailsComponent,
    CurriculumDefinitionCategoryDetailsComponent,
    CurriculumDefinitionDetailsComponent,
    CurriculumSchoolDetailsComponent,
    DepartmentDetailsComponent,
    DiscussionForumLinkDetailsComponent],
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
export class GeneratedForms_SubModule_33 { }
    


@NgModule({
declarations: [
    DiscussionForumMessageDetailsComponent,
    DiscussionForumModeratorDetailsComponent,
    DiscussionForumSubscriptionDetailsComponent,
    DiscussionForumUserDetailsComponent,
    DiscussionForumWebGroupDetailsComponent,
    DiscussionForumDetailsComponent,
    DistributionTypeDetailsComponent,
    DonorAdvisedFundAllocationDetailsComponent,
    DonorAdvisedFundDetailsComponent,
    DownloadItemsDetailsComponent,
    DuesCategoryDetailsComponent,
    EducationCategoryDetailsComponent,
    EducationFieldDetailsComponent,
    EducationLevelDetailsComponent,
    EducationStatusDetailsComponent,
    EducationUnitDetailsComponent,
    EmployeePositionCodesDetailsComponent,
    EmployeeSkill__dboDetailsComponent,
    Employee__dboDetailsComponent,
    EnrollmentTypeDetailsComponent],
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
export class GeneratedForms_SubModule_34 { }
    


@NgModule({
declarations: [
    ExamQuestionAnswersDetailsComponent,
    ExamQuestionDetailsComponent,
    ExamDetailsComponent,
    ExpoBoothConfigurationDetailsComponent,
    ExpoFloorplanDetailsComponent,
    ExpoPriorityPointTypeDetailsComponent,
    ExpoPriorityPointDetailsComponent,
    ExpoDetailsComponent,
    ExternalSystemDetailsComponent,
    FloorplanStatusDetailsComponent,
    FloorplanSystemDetailsComponent,
    FloorplanDetailsComponent,
    FoodPreferenceDetailsComponent,
    FreightMethodsDetailsComponent,
    FrequencyAgreementDetailsComponent,
    FunctionRoleDetailsComponent,
    FundCampaignGivingDetailsComponent,
    FundCampaignProductDetailsComponent,
    FundCampaignSolicitorProspectDetailsComponent,
    FundCampaignSolicitorDetailsComponent],
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
export class GeneratedForms_SubModule_35 { }
    


@NgModule({
declarations: [
    FundCampaignDetailsComponent,
    FundraisingPriceDetailsComponent,
    FundraisingPricingOptionDetailsComponent,
    GiftsInKindCategoriesDetailsComponent,
    GiftsInKindDetailsComponent,
    GLAccountDetailsComponent,
    GLOrderLevelDetailsComponent,
    GLPaymentLevelDetailsComponent,
    GrantDisbursementDetailsComponent,
    GrantDueDiligenceStepLinkDetailsComponent,
    GrantDueDiligenceStepDetailsComponent,
    GrantReportPaymentLinkDetailsComponent,
    GrantReportDetailsComponent,
    GrantsDetailsComponent,
    HousingBlockOptionDetailsComponent,
    HousingBlockRoomDetailsComponent,
    HousingBlockDetailsComponent,
    HousingReservationDetOptionDetailsComponent,
    HousingReservationDetailDetailsComponent,
    HousingReservationGuestDetailsComponent],
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
export class GeneratedForms_SubModule_36 { }
    


@NgModule({
declarations: [
    HousingReservationDetailsComponent,
    HousingRoomTypeDetailsComponent,
    HousingTransferDetailDetailsComponent,
    HousingTransferTypeDetailsComponent,
    HousingTransferDetailsComponent,
    HousingDetailsComponent,
    InstantMessagingUserProfileDetailsComponent,
    InstructorDesignationDetailsComponent,
    InternationalSupportFundCategoryDetailsComponent,
    InternationalSupportFundDetailsComponent,
    InventoryLocationDetailsComponent,
    InventoryOnOrderDetailsComponent,
    InventoryTransferDetailsComponent,
    InvoiceConsolidationOrderDetailsComponent,
    InvoiceConsolidationPaymentDetailsComponent,
    InvoiceConsolidationDetailsComponent,
    InvoiceMessageDetailsComponent,
    IssueCategoryDetailsComponent,
    IssueDetailsComponent,
    ItemRatingEntryDetailsComponent],
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
export class GeneratedForms_SubModule_37 { }
    


@NgModule({
declarations: [
    ItemRatingTypeDefinitionDetailsComponent,
    ItemRatingTypeDetailsComponent,
    ItemRatingDetailsComponent,
    ItemReviewEntriesDetailsComponent,
    KeyPerformanceIndicatorDetailsComponent,
    KnowledgeAnswerDetailsComponent,
    KnowledgeCaptureModeDetailsComponent,
    KnowledgeCategoryDetailsComponent,
    KnowledgeDeliveryTypeDetailsComponent,
    KnowledgeParticipantDetailsComponent,
    KnowledgeResultDetailDetailsComponent,
    KnowledgeResultDetailsComponent,
    KnowledgeStatusDetailsComponent,
    KnowledgeStyleSheetDetailsComponent,
    KnowledgeTrackingTypeDetailsComponent,
    KPIFormulaDetailsComponent,
    KPIMetricMappingDetailsComponent,
    KPIMetricDetailsComponent,
    KPIResultParticipantRecordDetailsComponent,
    KPIResultDetailsComponent],
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
export class GeneratedForms_SubModule_38 { }
    


@NgModule({
declarations: [
    KPIRunDetailsComponent,
    KPIUnitTypeDetailsComponent,
    LearningManagementSystemAttributeDetailsComponent,
    LearningManagementSystemInteractionDetailsComponent,
    LearningManagementSystemDetailsComponent,
    ListDetailArchiveDetailsComponent,
    ListDetail__dboDetailsComponent,
    ListTypeDetailsComponent,
    List__dboDetailsComponent,
    MailingActivityDetailsComponent,
    MailingActivityDetailDetailsComponent,
    MarketPlaceCategoryDetailsComponent,
    MarketPlaceInfoRequestDetailsComponent,
    MarketPlaceListingTypeDetailsComponent,
    MarketPlaceListingDetailsComponent,
    MeetingAttPossValueDetailsComponent,
    MeetingAttendeeGroupDetailsComponent,
    MeetingAttendeeTypeDetailsComponent,
    MeetingAttributeDetailsComponent,
    MeetingEducationUnitDetailsComponent],
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
export class GeneratedForms_SubModule_39 { }
    


@NgModule({
declarations: [
    MeetingHotelDetailsComponent,
    MeetingResourceDetailsComponent,
    MeetingRoomPossibleTypeDetailsComponent,
    MeetingRoomRoomDetailsComponent,
    MeetingRoomTypeDetailsComponent,
    MeetingRoomDetailsComponent,
    MeetingSessionDetailsComponent,
    MeetingSpeakerEvalDetailsComponent,
    MeetingSpeakerDetailsComponent,
    MeetingSponsorDetailsComponent,
    MeetingStatusDetailsComponent,
    MeetingTimeSlotDetailsComponent,
    MeetingTrackDetailsComponent,
    MeetingTransferEmailDetailsComponent,
    MeetingTransferDetailsComponent,
    MeetingTypeAttPossValueDetailsComponent,
    MeetingTypeAttributeDetailsComponent,
    MeetingTypeDetailsComponent,
    MeetingDetailsComponent,
    MemberStatusTypeDetailsComponent],
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
export class GeneratedForms_SubModule_40 { }
    


@NgModule({
declarations: [
    MemberTypeDetailsComponent,
    MembershipApplicationDefinitionProductDetailsComponent,
    MembershipApplicationDefinitionDetailsComponent,
    MembershipApplicationDetailsComponent,
    MembershipEmailSchedulesDetailsComponent,
    MembershipEnrollmentDetailsComponent,
    MembershipStatusDetailsComponent,
    MerchantAccountDetailsComponent,
    OpportunityDetailsComponent,
    OpportunityCompetitorDetailsComponent,
    OpportunityContactRoleTypeDetailsComponent,
    OpportunityContactDetailsComponent,
    OpportunityDetailDetailsComponent,
    OpportunityHistoryDetailsComponent,
    OpportunityPartnerRoleTypeDetailsComponent,
    OpportunityPartnerRoleDetailsComponent,
    OpportunityPartnerDetailsComponent,
    OpportunityReferenceTypeDetailsComponent,
    OpportunityReferenceDetailsComponent,
    OpportunityRoleDetailsComponent],
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
export class GeneratedForms_SubModule_41 { }
    


@NgModule({
declarations: [
    OpportunitySellingRoleTypeDetailsComponent,
    OpportunitySourceDetailsComponent,
    OpportunityStageOpportunityTypeDetailsComponent,
    OpportunityStageDetailsComponent,
    OpportunityStatusReportDetailsComponent,
    OpportunityTypeDetailsComponent,
    OrderBalanceDetailsComponent,
    OrderBoothCoExhibitorDetailsComponent,
    OrderBoothDetailDetailsComponent,
    OrderBoothProductCodeDetailsComponent,
    OrderCancellationWizardDetailsComponent,
    OrderCurrencySpotRateDetailsComponent,
    OrderDetailDetailsComponent,
    OrderGLEntryDetailsComponent,
    OrderInvAllocationDetailsComponent,
    OrderLineTaxDetailsComponent,
    OrderMasterDetailsComponent,
    OrderMeetingDetailAttributeDetailsComponent,
    OrderMeetingDetailEducationUnitDetailsComponent,
    OrderMeetingDetailDetailsComponent],
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
export class GeneratedForms_SubModule_42 { }
    


@NgModule({
declarations: [
    OrderMeetingSessionDetailDetailsComponent,
    OrderPmtScheduleDetailsComponent,
    OrderShipmentTaxDetailsComponent,
    OrderShipmentDetailsComponent,
    OrderSourceDetailsComponent,
    OrderStateDetailsComponent,
    OrderStatusTypeDetailsComponent,
    OrderTotalDetailsComponent,
    OrderTypeDetailsComponent,
    OrganizationAddressDetailsComponent,
    OrganizationGLAccountDetailsComponent,
    OrganizationInterCompanyGLDetailsComponent,
    OrganizationDetailsComponent,
    PaymentAuthorizationDetailsComponent,
    PaymentDetailDetailsComponent,
    PaymentGLEntryDetailsComponent,
    PaymentInformationDetailsComponent,
    PaymentStatusTypeDetailsComponent,
    PaymentTypeGLAccountDetailsComponent,
    PaymentTypeDetailsComponent],
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
export class GeneratedForms_SubModule_43 { }
    


@NgModule({
declarations: [
    PaymentDetailsComponent,
    PersonDetailsComponent,
    PersonAccountManagerDetailsComponent,
    PersonAddressDetailsComponent,
    PersonEducationDetailsComponent,
    PersonExternalAccountDetailsComponent,
    PersonFunctionDetailsComponent,
    PersonPersonDetailsComponent,
    PersonPhoneDetailsComponent,
    PersonRelationshipAttributeDetailsComponent,
    PersonRelationshipTypeDetailsComponent,
    PersonSavedPaymentMethodDetailsComponent,
    PersonTaxExCodeDetailsComponent,
    PhoneNumberDetailsComponent,
    PhoneRegionCodesDetailsComponent,
    PledgeContactTypeDetailsComponent,
    PledgeContactDetailsComponent,
    PledgeFundDetailsComponent,
    PledgeGuestListDetailsComponent,
    PledgePaymentScheduleDetailsComponent],
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
export class GeneratedForms_SubModule_44 { }
    


@NgModule({
declarations: [
    PledgeStageDetailsComponent,
    PledgeDetailsComponent,
    PostalCodeDetailsComponent,
    PrefCommunicationMethodDetailsComponent,
    PrefixDetailsComponent,
    PricingRuleDetailsComponent,
    ProdInvLedgerEntryDetailsComponent,
    ProductAssemblyDetailsComponent,
    ProductAttributeDetailsComponent,
    ProductCategoryDetailsComponent,
    ProductCategoryAttribDetailsComponent,
    ProductCategoryGLAccountDetailsComponent,
    ProductCodeDetailsComponent,
    ProductCostDetailDetailsComponent,
    ProductCostTypeDetailsComponent,
    ProductCostDetailsComponent,
    ProductDownloadHistoryDetailsComponent,
    ProductDownloadsDetailsComponent,
    ProductGLAccountDetailsComponent,
    ProductHistAvgCostDetailsComponent],
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
export class GeneratedForms_SubModule_45 { }
    


@NgModule({
declarations: [
    ProductInvLedgerDetailsComponent,
    ProductInventoryLedgerEntryTransactionsDetailsComponent,
    ProductIssueDetailsComponent,
    ProductKitTypeDetailsComponent,
    ProductPriceDetailsComponent,
    ProductRelationDetailsComponent,
    ProductRelationshipTypeDetailsComponent,
    ProductTypeAttributeDetailsComponent,
    ProductTypeDetailsComponent,
    ProductVendorDetailsComponent,
    ProductVersionDetailsComponent,
    ProductWebTemplateDetailsComponent,
    ProductDetailsComponent,
    PublicationContributorDetailsComponent,
    PublicationRoleDetailsComponent,
    PublicationDetailsComponent,
    QuestionBranchAnswerBranchDetailsComponent,
    QuestionBranchDetailsComponent,
    QuestionKnowledgeAnswerDetailsComponent,
    QuestionTreeKnowledgeDeliveryTypeDetailsComponent],
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
export class GeneratedForms_SubModule_46 { }
    


@NgModule({
declarations: [
    QuestionTreeKnowledgeStyleSheetDetailsComponent,
    QuestionTreeListKnowledgeStyleSheetDetailsComponent,
    QuestionTreeDetailsComponent,
    QuestionTypeDetailsComponent,
    QuestionDetailsComponent,
    RatedItemTypeDetailsComponent,
    RatedItemDetailsComponent,
    ReferralRequestVendorDetailsComponent,
    ReferralRequestDetailsComponent,
    ReferralTypeDetailsComponent,
    ReferralDetailsComponent,
    RegistrationLineDetailsComponent,
    ResourceType__dboDetailsComponent,
    ResourceDetailsComponent,
    RestrictedCountryDetailsComponent,
    RevenueCategoryDetailsComponent,
    RevenueRecognitionTypeDetailsComponent,
    SalesTargetTypeDetailsComponent,
    SalesTargetDetailsComponent,
    SalesTaxRateDetailsComponent],
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
export class GeneratedForms_SubModule_47 { }
    


@NgModule({
declarations: [
    ScheduleTransAccountEntryDetailsComponent,
    ScheduledTransactionGroupDetailsComponent,
    ScheduledTransactionDetailsComponent,
    ScriptLanguageDetailsComponent,
    ScriptTypeDetailsComponent,
    ScriptDetailsComponent,
    ShipTypeDetailsComponent,
    SkillLevelDetailsComponent,
    Skill__dboDetailsComponent,
    SocialstreamDetailsComponent,
    StandingOrProdCatDetailsComponent,
    StandingOrProdDetailsComponent,
    StandingOrPurchasesDetailsComponent,
    StandingOrderScheduleDetailsComponent,
    StandingOrderDetailsComponent,
    StateProvinceDetailsComponent,
    SubsCancelReasonDetailsComponent,
    SubscriptionDeliveryLogDetailsComponent,
    SubscriptionDeliveryScheduleDetailsComponent,
    SubscriptionFulfillmentDetailsComponent],
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
export class GeneratedForms_SubModule_48 { }
    


@NgModule({
declarations: [
    SubscriptionPurchaseTypeDetailsComponent,
    SubscriptionPurchaseDetailsComponent,
    SubscriptionStatusDetailsComponent,
    SubscriptionTypeDetailsComponent,
    SubscriptionDetailsComponent,
    SuffixDetailsComponent,
    TaskLinkDetailsComponent,
    TaskTypeDetailsComponent,
    TaskDetailsComponent,
    TaxJurisdictionDetailsComponent,
    TopicCodeLinkDetailsComponent,
    TopicCodeDetailsComponent,
    WebClickthroughDetailsComponent,
    WebGroupDetailsComponent,
    WebShoppingCartDetailsComponent,
    WebUserActivityDetailsComponent,
    WebUserGroupDetailsComponent,
    WebUserDetailsComponent],
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
export class GeneratedForms_SubModule_49 { }
    


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
    GeneratedForms_SubModule_31,
    GeneratedForms_SubModule_32,
    GeneratedForms_SubModule_33,
    GeneratedForms_SubModule_34,
    GeneratedForms_SubModule_35,
    GeneratedForms_SubModule_36,
    GeneratedForms_SubModule_37,
    GeneratedForms_SubModule_38,
    GeneratedForms_SubModule_39,
    GeneratedForms_SubModule_40,
    GeneratedForms_SubModule_41,
    GeneratedForms_SubModule_42,
    GeneratedForms_SubModule_43,
    GeneratedForms_SubModule_44,
    GeneratedForms_SubModule_45,
    GeneratedForms_SubModule_46,
    GeneratedForms_SubModule_47,
    GeneratedForms_SubModule_48,
    GeneratedForms_SubModule_49
]
})
export class GeneratedFormsModule { }
    
export function LoadGeneratedForms() {
    // This function doesn't do much, but it calls each generated form's loader function
    // which in turn calls the sections for that generated form. Ultimately, those bits of 
    // code do NOTHING - the point is to prevent the code from being eliminated during tree shaking
    // since it is dynamically instantiated on demand, and the Angular compiler has no way to know that,
    // in production builds tree shaking will eliminate the code unless we do this
    LoadAbstractCategoryFormComponent();
    LoadAbstractFormComponent();
    LoadAccountingPeriodFormComponent();
    LoadAdInsertionOrderOptionFormComponent();
    LoadAddressTypeFormComponent();
    LoadAddressFormComponent();
    LoadAdvertisingBlindBoxFormComponent();
    LoadAdvertisingColorCodeFormComponent();
    LoadAdvertisingContractPublicationFormComponent();
    LoadAdvertisingContractSalesRepresentativeFormComponent();
    LoadAdvertisingContractFormComponent();
    LoadAdvertisingFileTypeFormComponent();
    LoadAdvertisingFrequencyCodeFormComponent();
    LoadAdvertisingInsertionOrdAdjustHistoryFormComponent();
    LoadAdvertisingInsertionOrdBillToFormComponent();
    LoadAdvertisingInsertionOrdSalesRepFormComponent();
    LoadAdvertisingInsertionOrderFormComponent();
    LoadAdvertisingOptionsFormComponent();
    LoadAdvertisingPositionCodeFormComponent();
    LoadAdvertisingPriceOverrideReasonFormComponent();
    LoadAdvertisingProductSectionFormComponent();
    LoadAdvertisingRateCardDeadlineFormComponent();
    LoadAdvertisingRateCardRateOptionFormComponent();
    LoadAdvertisingRateCardRateSectionFormComponent();
    LoadAdvertisingRateCardRateFormComponent();
    LoadAdvertisingRateCardFormComponent();
    LoadAdvertisingSizeCodeFormComponent();
    LoadAdvertisingUnitDefinitionFormComponent();
    LoadAnswerSheetAnswerFormComponent();
    LoadAnswerSheetFormComponent();
    LoadAttendeeStatusFormComponent();
    LoadAwardGrantedFormComponent();
    LoadAwardNominationFormComponent();
    LoadAwardTypeFormComponent();
    LoadBatchAccountEntryFormComponent();
    LoadBatchExportTypeFormComponent();
    LoadBatchFormComponent();
    LoadBoothFormComponent();
    LoadCampaignActivityForecastFormComponent();
    LoadCampaignCostTypeFormComponent();
    LoadCampaignCostFormComponent();
    LoadCampaignDocStatusTypeFormComponent();
    LoadCampaignDocumentTypeFormComponent();
    LoadCampaignDocumentFormComponent();
    LoadCampaignGLAccountFormComponent();
    LoadCampaignImportFileColumnFormComponent();
    LoadCampaignLinkedDocumentFormComponent();
    LoadCampaignListDetailFormComponent();
    LoadCampaignProductCategoryFormComponent();
    LoadCampaignProductFormComponent();
    LoadCampaignProspectStatusTypeFormComponent();
    LoadCampaignSegmentDocumentFormComponent();
    LoadCampaignSegmentFormComponent();
    LoadCampaignStatusTypeFormComponent();
    LoadCampaignTypeFormComponent();
    LoadCampaignFormComponent();
    LoadCancellationOrderlinesFormComponent();
    LoadCancellationReasonFormComponent();
    LoadCaseAssigneeDefaultFormComponent();
    LoadCaseAssigneePostalCodeFormComponent();
    LoadCaseAssigneeFormComponent();
    LoadCaseCategoryFormComponent();
    LoadCaseCostTypeFormComponent();
    LoadCaseCostFormComponent();
    LoadCaseIssueFormComponent();
    LoadCasePriorityFormComponent();
    LoadCaseReasonFormComponent();
    LoadCaseReportMethodFormComponent();
    LoadCaseReporterFormComponent();
    LoadCaseResultFormComponent();
    LoadCaseRoleFormComponent();
    LoadCaseSatisfactionLevelFormComponent();
    LoadCaseStatusFormComponent();
    LoadCaseSurveyMethodFormComponent();
    LoadCaseTypeFormComponent();
    LoadCasesFormComponent();
    LoadCashCtrlBatchDetailAllocFormComponent();
    LoadCashCtrlBatchDetailFormComponent();
    LoadCashCtrlBatchFormComponent();
    LoadCertificationAnswerSheetFormComponent();
    LoadCertificationFormComponent();
    LoadCESPlanKPIMetricFormComponent();
    LoadCESPlanKPIRunMappingFormComponent();
    LoadCESPlanFormComponent();
    LoadCESPointFormComponent();
    LoadCESScoreFormComponent();
    LoadChapterAssignmentRuleFormComponent();
    LoadChapterAuthorizationFormComponent();
    LoadChapterMeetingFormComponent();
    LoadChapterMembershipProductFormComponent();
    LoadChapterReportCategoryFormComponent();
    LoadChapterReportFormComponent();
    LoadChapterRoleTypeAuthorizationFormComponent();
    LoadChapterRoleTypeFormComponent();
    LoadChapterRoleFormComponent();
    LoadClassCertificatePrintRunFormComponent();
    LoadClassExamFormComponent();
    LoadClassExpectedStudentFormComponent();
    LoadClassPartUseFormComponent();
    LoadClassRegistrationPartStatusFormComponent();
    LoadClassRegistrationFormComponent();
    LoadClassReqDesigFormComponent();
    LoadClassScheduleAgendaFormComponent();
    LoadClassScheduleFormComponent();
    LoadClassFormComponent();
    LoadCommissionAgmtDetTierFormComponent();
    LoadCommissionAgreementDetailFormComponent();
    LoadCommissionAgreementFormComponent();
    LoadCommissionBaseFormulaFormComponent();
    LoadCommissionPayDetAdjustmentFormComponent();
    LoadCommissionPayDetTierFormComponent();
    LoadCommissionPaySourceDetailFormComponent();
    LoadCommissionPaymentDetailFormComponent();
    LoadCommissionPaymentFormComponent();
    LoadCommissionPlanDetailFormComponent();
    LoadCommissionPlanItemFormComponent();
    LoadCommissionPlanFormComponent();
    LoadCommissionRateScaleDetailFormComponent();
    LoadCommissionRateScaleFormComponent();
    LoadCommissionSourceFormComponent();
    LoadCommissionTerritoryFormComponent();
    LoadCommissionTypeFormComponent();
    LoadCommitteeNomineeFormComponent();
    LoadCommitteeRoleFormComponent();
    LoadCommitteeTermMeetingFormComponent();
    LoadCommitteeTermMemberFormComponent();
    LoadCommitteeTermRenewalMembersFormComponent();
    LoadCommitteeTermRenewalFormComponent();
    LoadCommitteeTermFormComponent();
    LoadCommitteeTypeFormComponent();
    LoadCommitteeFormComponent();
    LoadCompany__dboFormComponent();
    LoadCompanyAccountManagerFormComponent();
    LoadCompanyAddressFormComponent();
    LoadCompanyCompanyFormComponent();
    LoadCompanyPersonFunctionFormComponent();
    LoadCompanyPersonFormComponent();
    LoadCompanyPhoneFormComponent();
    LoadCompanyProductCodeFormComponent();
    LoadCompanyRelationshipTypeFormComponent();
    LoadCompanySavedPaymentMethodFormComponent();
    LoadCompanyTaxExCodeFormComponent();
    LoadCompanyTypeFormComponent();
    LoadContactLogCategoryFormComponent();
    LoadContactLogLinkFormComponent();
    LoadContactLogTypeFormComponent();
    LoadContactLogFormComponent();
    LoadContinentFormComponent();
    LoadCountryFormComponent();
    LoadCourseCategoryFormComponent();
    LoadCourseEnrollmentTypeFormComponent();
    LoadCourseETMaterialsFormComponent();
    LoadCourseExamFormComponent();
    LoadCourseInstrDesigFormComponent();
    LoadCourseInstructorFormComponent();
    LoadCoursePartCategoryFormComponent();
    LoadCoursePartUseFormComponent();
    LoadCoursePartFormComponent();
    LoadCoursePreReqFormComponent();
    LoadCourseSchoolSubFormComponent();
    LoadCourseSchoolFormComponent();
    LoadCourseFormComponent();
    LoadCreditCardTypeFormComponent();
    LoadCreditStatusFormComponent();
    LoadCreditStatusApproverFormComponent();
    LoadCultureFormatFormComponent();
    LoadCultureStringCategoryFormComponent();
    LoadCultureStringLocalFormComponent();
    LoadCultureStringFormComponent();
    LoadCultureFormComponent();
    LoadCurrencySpotRateFormComponent();
    LoadCurrencyTypeFormComponent();
    LoadCurriculumApplicationDetailFormComponent();
    LoadCurriculumApplicationFormComponent();
    LoadCurriculumCategoryFormComponent();
    LoadCurriculumCourseFormComponent();
    LoadCurriculumDefinitionCategoryFormComponent();
    LoadCurriculumDefinitionFormComponent();
    LoadCurriculumSchoolFormComponent();
    LoadDepartmentFormComponent();
    LoadDiscussionForumLinkFormComponent();
    LoadDiscussionForumMessageFormComponent();
    LoadDiscussionForumModeratorFormComponent();
    LoadDiscussionForumSubscriptionFormComponent();
    LoadDiscussionForumUserFormComponent();
    LoadDiscussionForumWebGroupFormComponent();
    LoadDiscussionForumFormComponent();
    LoadDistributionTypeFormComponent();
    LoadDonorAdvisedFundAllocationFormComponent();
    LoadDonorAdvisedFundFormComponent();
    LoadDownloadItemsFormComponent();
    LoadDuesCategoryFormComponent();
    LoadEducationCategoryFormComponent();
    LoadEducationFieldFormComponent();
    LoadEducationLevelFormComponent();
    LoadEducationStatusFormComponent();
    LoadEducationUnitFormComponent();
    LoadEmployeePositionCodesFormComponent();
    LoadEmployeeSkill__dboFormComponent();
    LoadEmployee__dboFormComponent();
    LoadEnrollmentTypeFormComponent();
    LoadExamQuestionAnswersFormComponent();
    LoadExamQuestionFormComponent();
    LoadExamFormComponent();
    LoadExpoBoothConfigurationFormComponent();
    LoadExpoFloorplanFormComponent();
    LoadExpoPriorityPointTypeFormComponent();
    LoadExpoPriorityPointFormComponent();
    LoadExpoFormComponent();
    LoadExternalSystemFormComponent();
    LoadFloorplanStatusFormComponent();
    LoadFloorplanSystemFormComponent();
    LoadFloorplanFormComponent();
    LoadFoodPreferenceFormComponent();
    LoadFreightMethodsFormComponent();
    LoadFrequencyAgreementFormComponent();
    LoadFunctionRoleFormComponent();
    LoadFundCampaignGivingFormComponent();
    LoadFundCampaignProductFormComponent();
    LoadFundCampaignSolicitorProspectFormComponent();
    LoadFundCampaignSolicitorFormComponent();
    LoadFundCampaignFormComponent();
    LoadFundraisingPriceFormComponent();
    LoadFundraisingPricingOptionFormComponent();
    LoadGiftsInKindCategoriesFormComponent();
    LoadGiftsInKindFormComponent();
    LoadGLAccountFormComponent();
    LoadGLOrderLevelFormComponent();
    LoadGLPaymentLevelFormComponent();
    LoadGrantDisbursementFormComponent();
    LoadGrantDueDiligenceStepLinkFormComponent();
    LoadGrantDueDiligenceStepFormComponent();
    LoadGrantReportPaymentLinkFormComponent();
    LoadGrantReportFormComponent();
    LoadGrantsFormComponent();
    LoadHousingBlockOptionFormComponent();
    LoadHousingBlockRoomFormComponent();
    LoadHousingBlockFormComponent();
    LoadHousingReservationDetOptionFormComponent();
    LoadHousingReservationDetailFormComponent();
    LoadHousingReservationGuestFormComponent();
    LoadHousingReservationFormComponent();
    LoadHousingRoomTypeFormComponent();
    LoadHousingTransferDetailFormComponent();
    LoadHousingTransferTypeFormComponent();
    LoadHousingTransferFormComponent();
    LoadHousingFormComponent();
    LoadInstantMessagingUserProfileFormComponent();
    LoadInstructorDesignationFormComponent();
    LoadInternationalSupportFundCategoryFormComponent();
    LoadInternationalSupportFundFormComponent();
    LoadInventoryLocationFormComponent();
    LoadInventoryOnOrderFormComponent();
    LoadInventoryTransferFormComponent();
    LoadInvoiceConsolidationOrderFormComponent();
    LoadInvoiceConsolidationPaymentFormComponent();
    LoadInvoiceConsolidationFormComponent();
    LoadInvoiceMessageFormComponent();
    LoadIssueCategoryFormComponent();
    LoadIssueFormComponent();
    LoadItemRatingEntryFormComponent();
    LoadItemRatingTypeDefinitionFormComponent();
    LoadItemRatingTypeFormComponent();
    LoadItemRatingFormComponent();
    LoadItemReviewEntriesFormComponent();
    LoadKeyPerformanceIndicatorFormComponent();
    LoadKnowledgeAnswerFormComponent();
    LoadKnowledgeCaptureModeFormComponent();
    LoadKnowledgeCategoryFormComponent();
    LoadKnowledgeDeliveryTypeFormComponent();
    LoadKnowledgeParticipantFormComponent();
    LoadKnowledgeResultDetailFormComponent();
    LoadKnowledgeResultFormComponent();
    LoadKnowledgeStatusFormComponent();
    LoadKnowledgeStyleSheetFormComponent();
    LoadKnowledgeTrackingTypeFormComponent();
    LoadKPIFormulaFormComponent();
    LoadKPIMetricMappingFormComponent();
    LoadKPIMetricFormComponent();
    LoadKPIResultParticipantRecordFormComponent();
    LoadKPIResultFormComponent();
    LoadKPIRunFormComponent();
    LoadKPIUnitTypeFormComponent();
    LoadLearningManagementSystemAttributeFormComponent();
    LoadLearningManagementSystemInteractionFormComponent();
    LoadLearningManagementSystemFormComponent();
    LoadListDetailArchiveFormComponent();
    LoadListDetail__dboFormComponent();
    LoadListTypeFormComponent();
    LoadList__dboFormComponent();
    LoadMailingActivityFormComponent();
    LoadMailingActivityDetailFormComponent();
    LoadMarketPlaceCategoryFormComponent();
    LoadMarketPlaceInfoRequestFormComponent();
    LoadMarketPlaceListingTypeFormComponent();
    LoadMarketPlaceListingFormComponent();
    LoadMeetingAttPossValueFormComponent();
    LoadMeetingAttendeeGroupFormComponent();
    LoadMeetingAttendeeTypeFormComponent();
    LoadMeetingAttributeFormComponent();
    LoadMeetingEducationUnitFormComponent();
    LoadMeetingHotelFormComponent();
    LoadMeetingResourceFormComponent();
    LoadMeetingRoomPossibleTypeFormComponent();
    LoadMeetingRoomRoomFormComponent();
    LoadMeetingRoomTypeFormComponent();
    LoadMeetingRoomFormComponent();
    LoadMeetingSessionFormComponent();
    LoadMeetingSpeakerEvalFormComponent();
    LoadMeetingSpeakerFormComponent();
    LoadMeetingSponsorFormComponent();
    LoadMeetingStatusFormComponent();
    LoadMeetingTimeSlotFormComponent();
    LoadMeetingTrackFormComponent();
    LoadMeetingTransferEmailFormComponent();
    LoadMeetingTransferFormComponent();
    LoadMeetingTypeAttPossValueFormComponent();
    LoadMeetingTypeAttributeFormComponent();
    LoadMeetingTypeFormComponent();
    LoadMeetingFormComponent();
    LoadMemberStatusTypeFormComponent();
    LoadMemberTypeFormComponent();
    LoadMembershipApplicationDefinitionProductFormComponent();
    LoadMembershipApplicationDefinitionFormComponent();
    LoadMembershipApplicationFormComponent();
    LoadMembershipEmailSchedulesFormComponent();
    LoadMembershipEnrollmentFormComponent();
    LoadMembershipStatusFormComponent();
    LoadMerchantAccountFormComponent();
    LoadOpportunityFormComponent();
    LoadOpportunityCompetitorFormComponent();
    LoadOpportunityContactRoleTypeFormComponent();
    LoadOpportunityContactFormComponent();
    LoadOpportunityDetailFormComponent();
    LoadOpportunityHistoryFormComponent();
    LoadOpportunityPartnerRoleTypeFormComponent();
    LoadOpportunityPartnerRoleFormComponent();
    LoadOpportunityPartnerFormComponent();
    LoadOpportunityReferenceTypeFormComponent();
    LoadOpportunityReferenceFormComponent();
    LoadOpportunityRoleFormComponent();
    LoadOpportunitySellingRoleTypeFormComponent();
    LoadOpportunitySourceFormComponent();
    LoadOpportunityStageOpportunityTypeFormComponent();
    LoadOpportunityStageFormComponent();
    LoadOpportunityStatusReportFormComponent();
    LoadOpportunityTypeFormComponent();
    LoadOrderBalanceFormComponent();
    LoadOrderBoothCoExhibitorFormComponent();
    LoadOrderBoothDetailFormComponent();
    LoadOrderBoothProductCodeFormComponent();
    LoadOrderCancellationWizardFormComponent();
    LoadOrderCurrencySpotRateFormComponent();
    LoadOrderDetailFormComponent();
    LoadOrderGLEntryFormComponent();
    LoadOrderInvAllocationFormComponent();
    LoadOrderLineTaxFormComponent();
    LoadOrderMasterFormComponent();
    LoadOrderMeetingDetailAttributeFormComponent();
    LoadOrderMeetingDetailEducationUnitFormComponent();
    LoadOrderMeetingDetailFormComponent();
    LoadOrderMeetingSessionDetailFormComponent();
    LoadOrderPmtScheduleFormComponent();
    LoadOrderShipmentTaxFormComponent();
    LoadOrderShipmentFormComponent();
    LoadOrderSourceFormComponent();
    LoadOrderStateFormComponent();
    LoadOrderStatusTypeFormComponent();
    LoadOrderTotalFormComponent();
    LoadOrderTypeFormComponent();
    LoadOrganizationAddressFormComponent();
    LoadOrganizationGLAccountFormComponent();
    LoadOrganizationInterCompanyGLFormComponent();
    LoadOrganizationFormComponent();
    LoadPaymentAuthorizationFormComponent();
    LoadPaymentDetailFormComponent();
    LoadPaymentGLEntryFormComponent();
    LoadPaymentInformationFormComponent();
    LoadPaymentStatusTypeFormComponent();
    LoadPaymentTypeGLAccountFormComponent();
    LoadPaymentTypeFormComponent();
    LoadPaymentFormComponent();
    LoadPersonFormComponent();
    LoadPersonAccountManagerFormComponent();
    LoadPersonAddressFormComponent();
    LoadPersonEducationFormComponent();
    LoadPersonExternalAccountFormComponent();
    LoadPersonFunctionFormComponent();
    LoadPersonPersonFormComponent();
    LoadPersonPhoneFormComponent();
    LoadPersonRelationshipAttributeFormComponent();
    LoadPersonRelationshipTypeFormComponent();
    LoadPersonSavedPaymentMethodFormComponent();
    LoadPersonTaxExCodeFormComponent();
    LoadPhoneNumberFormComponent();
    LoadPhoneRegionCodesFormComponent();
    LoadPledgeContactTypeFormComponent();
    LoadPledgeContactFormComponent();
    LoadPledgeFundFormComponent();
    LoadPledgeGuestListFormComponent();
    LoadPledgePaymentScheduleFormComponent();
    LoadPledgeStageFormComponent();
    LoadPledgeFormComponent();
    LoadPostalCodeFormComponent();
    LoadPrefCommunicationMethodFormComponent();
    LoadPrefixFormComponent();
    LoadPricingRuleFormComponent();
    LoadProdInvLedgerEntryFormComponent();
    LoadProductAssemblyFormComponent();
    LoadProductAttributeFormComponent();
    LoadProductCategoryFormComponent();
    LoadProductCategoryAttribFormComponent();
    LoadProductCategoryGLAccountFormComponent();
    LoadProductCodeFormComponent();
    LoadProductCostDetailFormComponent();
    LoadProductCostTypeFormComponent();
    LoadProductCostFormComponent();
    LoadProductDownloadHistoryFormComponent();
    LoadProductDownloadsFormComponent();
    LoadProductGLAccountFormComponent();
    LoadProductHistAvgCostFormComponent();
    LoadProductInvLedgerFormComponent();
    LoadProductInventoryLedgerEntryTransactionsFormComponent();
    LoadProductIssueFormComponent();
    LoadProductKitTypeFormComponent();
    LoadProductPriceFormComponent();
    LoadProductRelationFormComponent();
    LoadProductRelationshipTypeFormComponent();
    LoadProductTypeAttributeFormComponent();
    LoadProductTypeFormComponent();
    LoadProductVendorFormComponent();
    LoadProductVersionFormComponent();
    LoadProductWebTemplateFormComponent();
    LoadProductFormComponent();
    LoadPublicationContributorFormComponent();
    LoadPublicationRoleFormComponent();
    LoadPublicationFormComponent();
    LoadQuestionBranchAnswerBranchFormComponent();
    LoadQuestionBranchFormComponent();
    LoadQuestionKnowledgeAnswerFormComponent();
    LoadQuestionTreeKnowledgeDeliveryTypeFormComponent();
    LoadQuestionTreeKnowledgeStyleSheetFormComponent();
    LoadQuestionTreeListKnowledgeStyleSheetFormComponent();
    LoadQuestionTreeFormComponent();
    LoadQuestionTypeFormComponent();
    LoadQuestionFormComponent();
    LoadRatedItemTypeFormComponent();
    LoadRatedItemFormComponent();
    LoadReferralRequestVendorFormComponent();
    LoadReferralRequestFormComponent();
    LoadReferralTypeFormComponent();
    LoadReferralFormComponent();
    LoadRegistrationLineFormComponent();
    LoadResourceType__dboFormComponent();
    LoadResourceFormComponent();
    LoadRestrictedCountryFormComponent();
    LoadRevenueCategoryFormComponent();
    LoadRevenueRecognitionTypeFormComponent();
    LoadSalesTargetTypeFormComponent();
    LoadSalesTargetFormComponent();
    LoadSalesTaxRateFormComponent();
    LoadScheduleTransAccountEntryFormComponent();
    LoadScheduledTransactionGroupFormComponent();
    LoadScheduledTransactionFormComponent();
    LoadScriptLanguageFormComponent();
    LoadScriptTypeFormComponent();
    LoadScriptFormComponent();
    LoadShipTypeFormComponent();
    LoadSkillLevelFormComponent();
    LoadSkill__dboFormComponent();
    LoadSocialstreamFormComponent();
    LoadStandingOrProdCatFormComponent();
    LoadStandingOrProdFormComponent();
    LoadStandingOrPurchasesFormComponent();
    LoadStandingOrderScheduleFormComponent();
    LoadStandingOrderFormComponent();
    LoadStateProvinceFormComponent();
    LoadSubsCancelReasonFormComponent();
    LoadSubscriptionDeliveryLogFormComponent();
    LoadSubscriptionDeliveryScheduleFormComponent();
    LoadSubscriptionFulfillmentFormComponent();
    LoadSubscriptionPurchaseTypeFormComponent();
    LoadSubscriptionPurchaseFormComponent();
    LoadSubscriptionStatusFormComponent();
    LoadSubscriptionTypeFormComponent();
    LoadSubscriptionFormComponent();
    LoadSuffixFormComponent();
    LoadTaskLinkFormComponent();
    LoadTaskTypeFormComponent();
    LoadTaskFormComponent();
    LoadTaxJurisdictionFormComponent();
    LoadTopicCodeLinkFormComponent();
    LoadTopicCodeFormComponent();
    LoadWebClickthroughFormComponent();
    LoadWebGroupFormComponent();
    LoadWebShoppingCartFormComponent();
    LoadWebUserActivityFormComponent();
    LoadWebUserGroupFormComponent();
    LoadWebUserFormComponent();
    LoadAbstractCategoryDetailsComponent();
    LoadAbstractDetailsComponent();
    LoadAccountingPeriodDetailsComponent();
    LoadAdInsertionOrderOptionDetailsComponent();
    LoadAddressTypeDetailsComponent();
    LoadAddressDetailsComponent();
    LoadAdvertisingBlindBoxDetailsComponent();
    LoadAdvertisingColorCodeDetailsComponent();
    LoadAdvertisingContractPublicationDetailsComponent();
    LoadAdvertisingContractSalesRepresentativeDetailsComponent();
    LoadAdvertisingContractDetailsComponent();
    LoadAdvertisingFileTypeDetailsComponent();
    LoadAdvertisingFrequencyCodeDetailsComponent();
    LoadAdvertisingInsertionOrdAdjustHistoryDetailsComponent();
    LoadAdvertisingInsertionOrdBillToDetailsComponent();
    LoadAdvertisingInsertionOrdSalesRepDetailsComponent();
    LoadAdvertisingInsertionOrderDetailsComponent();
    LoadAdvertisingOptionsDetailsComponent();
    LoadAdvertisingPositionCodeDetailsComponent();
    LoadAdvertisingPriceOverrideReasonDetailsComponent();
    LoadAdvertisingProductSectionDetailsComponent();
    LoadAdvertisingRateCardDeadlineDetailsComponent();
    LoadAdvertisingRateCardRateOptionDetailsComponent();
    LoadAdvertisingRateCardRateSectionDetailsComponent();
    LoadAdvertisingRateCardRateDetailsComponent();
    LoadAdvertisingRateCardDetailsComponent();
    LoadAdvertisingSizeCodeDetailsComponent();
    LoadAdvertisingUnitDefinitionDetailsComponent();
    LoadAnswerSheetAnswerDetailsComponent();
    LoadAnswerSheetDetailsComponent();
    LoadAttendeeStatusDetailsComponent();
    LoadAwardGrantedDetailsComponent();
    LoadAwardNominationDetailsComponent();
    LoadAwardTypeDetailsComponent();
    LoadBatchAccountEntryDetailsComponent();
    LoadBatchExportTypeDetailsComponent();
    LoadBatchDetailsComponent();
    LoadBoothDetailsComponent();
    LoadCampaignActivityForecastDetailsComponent();
    LoadCampaignCostTypeDetailsComponent();
    LoadCampaignCostDetailsComponent();
    LoadCampaignDocStatusTypeDetailsComponent();
    LoadCampaignDocumentTypeDetailsComponent();
    LoadCampaignDocumentDetailsComponent();
    LoadCampaignGLAccountDetailsComponent();
    LoadCampaignImportFileColumnDetailsComponent();
    LoadCampaignLinkedDocumentDetailsComponent();
    LoadCampaignListDetailDetailsComponent();
    LoadCampaignProductCategoryDetailsComponent();
    LoadCampaignProductDetailsComponent();
    LoadCampaignProspectStatusTypeDetailsComponent();
    LoadCampaignSegmentDocumentDetailsComponent();
    LoadCampaignSegmentDetailsComponent();
    LoadCampaignStatusTypeDetailsComponent();
    LoadCampaignTypeDetailsComponent();
    LoadCampaignDetailsComponent();
    LoadCancellationOrderlinesDetailsComponent();
    LoadCancellationReasonDetailsComponent();
    LoadCaseAssigneeDefaultDetailsComponent();
    LoadCaseAssigneePostalCodeDetailsComponent();
    LoadCaseAssigneeDetailsComponent();
    LoadCaseCategoryDetailsComponent();
    LoadCaseCostTypeDetailsComponent();
    LoadCaseCostDetailsComponent();
    LoadCaseIssueDetailsComponent();
    LoadCasePriorityDetailsComponent();
    LoadCaseReasonDetailsComponent();
    LoadCaseReportMethodDetailsComponent();
    LoadCaseReporterDetailsComponent();
    LoadCaseResultDetailsComponent();
    LoadCaseRoleDetailsComponent();
    LoadCaseSatisfactionLevelDetailsComponent();
    LoadCaseStatusDetailsComponent();
    LoadCaseSurveyMethodDetailsComponent();
    LoadCaseTypeDetailsComponent();
    LoadCasesDetailsComponent();
    LoadCashCtrlBatchDetailAllocDetailsComponent();
    LoadCashCtrlBatchDetailDetailsComponent();
    LoadCashCtrlBatchDetailsComponent();
    LoadCertificationAnswerSheetDetailsComponent();
    LoadCertificationDetailsComponent();
    LoadCESPlanKPIMetricDetailsComponent();
    LoadCESPlanKPIRunMappingDetailsComponent();
    LoadCESPlanDetailsComponent();
    LoadCESPointDetailsComponent();
    LoadCESScoreDetailsComponent();
    LoadChapterAssignmentRuleDetailsComponent();
    LoadChapterAuthorizationDetailsComponent();
    LoadChapterMeetingDetailsComponent();
    LoadChapterMembershipProductDetailsComponent();
    LoadChapterReportCategoryDetailsComponent();
    LoadChapterReportDetailsComponent();
    LoadChapterRoleTypeAuthorizationDetailsComponent();
    LoadChapterRoleTypeDetailsComponent();
    LoadChapterRoleDetailsComponent();
    LoadClassCertificatePrintRunDetailsComponent();
    LoadClassExamDetailsComponent();
    LoadClassExpectedStudentDetailsComponent();
    LoadClassPartUseDetailsComponent();
    LoadClassRegistrationPartStatusDetailsComponent();
    LoadClassRegistrationDetailsComponent();
    LoadClassReqDesigDetailsComponent();
    LoadClassScheduleAgendaDetailsComponent();
    LoadClassScheduleDetailsComponent();
    LoadClassDetailsComponent();
    LoadCommissionAgmtDetTierDetailsComponent();
    LoadCommissionAgreementDetailDetailsComponent();
    LoadCommissionAgreementDetailsComponent();
    LoadCommissionBaseFormulaDetailsComponent();
    LoadCommissionPayDetAdjustmentDetailsComponent();
    LoadCommissionPayDetTierDetailsComponent();
    LoadCommissionPaySourceDetailDetailsComponent();
    LoadCommissionPaymentDetailDetailsComponent();
    LoadCommissionPaymentDetailsComponent();
    LoadCommissionPlanDetailDetailsComponent();
    LoadCommissionPlanItemDetailsComponent();
    LoadCommissionPlanDetailsComponent();
    LoadCommissionRateScaleDetailDetailsComponent();
    LoadCommissionRateScaleDetailsComponent();
    LoadCommissionSourceDetailsComponent();
    LoadCommissionTerritoryDetailsComponent();
    LoadCommissionTypeDetailsComponent();
    LoadCommitteeNomineeDetailsComponent();
    LoadCommitteeRoleDetailsComponent();
    LoadCommitteeTermMeetingDetailsComponent();
    LoadCommitteeTermMemberDetailsComponent();
    LoadCommitteeTermRenewalMembersDetailsComponent();
    LoadCommitteeTermRenewalDetailsComponent();
    LoadCommitteeTermDetailsComponent();
    LoadCommitteeTypeDetailsComponent();
    LoadCommitteeDetailsComponent();
    LoadCompany__dboDetailsComponent();
    LoadCompanyAccountManagerDetailsComponent();
    LoadCompanyAddressDetailsComponent();
    LoadCompanyCompanyDetailsComponent();
    LoadCompanyPersonFunctionDetailsComponent();
    LoadCompanyPersonDetailsComponent();
    LoadCompanyPhoneDetailsComponent();
    LoadCompanyProductCodeDetailsComponent();
    LoadCompanyRelationshipTypeDetailsComponent();
    LoadCompanySavedPaymentMethodDetailsComponent();
    LoadCompanyTaxExCodeDetailsComponent();
    LoadCompanyTypeDetailsComponent();
    LoadContactLogCategoryDetailsComponent();
    LoadContactLogLinkDetailsComponent();
    LoadContactLogTypeDetailsComponent();
    LoadContactLogDetailsComponent();
    LoadContinentDetailsComponent();
    LoadCountryDetailsComponent();
    LoadCourseCategoryDetailsComponent();
    LoadCourseEnrollmentTypeDetailsComponent();
    LoadCourseETMaterialsDetailsComponent();
    LoadCourseExamDetailsComponent();
    LoadCourseInstrDesigDetailsComponent();
    LoadCourseInstructorDetailsComponent();
    LoadCoursePartCategoryDetailsComponent();
    LoadCoursePartUseDetailsComponent();
    LoadCoursePartDetailsComponent();
    LoadCoursePreReqDetailsComponent();
    LoadCourseSchoolSubDetailsComponent();
    LoadCourseSchoolDetailsComponent();
    LoadCourseDetailsComponent();
    LoadCreditCardTypeDetailsComponent();
    LoadCreditStatusDetailsComponent();
    LoadCreditStatusApproverDetailsComponent();
    LoadCultureFormatDetailsComponent();
    LoadCultureStringCategoryDetailsComponent();
    LoadCultureStringLocalDetailsComponent();
    LoadCultureStringDetailsComponent();
    LoadCultureDetailsComponent();
    LoadCurrencySpotRateDetailsComponent();
    LoadCurrencyTypeDetailsComponent();
    LoadCurriculumApplicationDetailDetailsComponent();
    LoadCurriculumApplicationDetailsComponent();
    LoadCurriculumCategoryDetailsComponent();
    LoadCurriculumCourseDetailsComponent();
    LoadCurriculumDefinitionCategoryDetailsComponent();
    LoadCurriculumDefinitionDetailsComponent();
    LoadCurriculumSchoolDetailsComponent();
    LoadDepartmentDetailsComponent();
    LoadDiscussionForumLinkDetailsComponent();
    LoadDiscussionForumMessageDetailsComponent();
    LoadDiscussionForumModeratorDetailsComponent();
    LoadDiscussionForumSubscriptionDetailsComponent();
    LoadDiscussionForumUserDetailsComponent();
    LoadDiscussionForumWebGroupDetailsComponent();
    LoadDiscussionForumDetailsComponent();
    LoadDistributionTypeDetailsComponent();
    LoadDonorAdvisedFundAllocationDetailsComponent();
    LoadDonorAdvisedFundDetailsComponent();
    LoadDownloadItemsDetailsComponent();
    LoadDuesCategoryDetailsComponent();
    LoadEducationCategoryDetailsComponent();
    LoadEducationFieldDetailsComponent();
    LoadEducationLevelDetailsComponent();
    LoadEducationStatusDetailsComponent();
    LoadEducationUnitDetailsComponent();
    LoadEmployeePositionCodesDetailsComponent();
    LoadEmployeeSkill__dboDetailsComponent();
    LoadEmployee__dboDetailsComponent();
    LoadEnrollmentTypeDetailsComponent();
    LoadExamQuestionAnswersDetailsComponent();
    LoadExamQuestionDetailsComponent();
    LoadExamDetailsComponent();
    LoadExpoBoothConfigurationDetailsComponent();
    LoadExpoFloorplanDetailsComponent();
    LoadExpoPriorityPointTypeDetailsComponent();
    LoadExpoPriorityPointDetailsComponent();
    LoadExpoDetailsComponent();
    LoadExternalSystemDetailsComponent();
    LoadFloorplanStatusDetailsComponent();
    LoadFloorplanSystemDetailsComponent();
    LoadFloorplanDetailsComponent();
    LoadFoodPreferenceDetailsComponent();
    LoadFreightMethodsDetailsComponent();
    LoadFrequencyAgreementDetailsComponent();
    LoadFunctionRoleDetailsComponent();
    LoadFundCampaignGivingDetailsComponent();
    LoadFundCampaignProductDetailsComponent();
    LoadFundCampaignSolicitorProspectDetailsComponent();
    LoadFundCampaignSolicitorDetailsComponent();
    LoadFundCampaignDetailsComponent();
    LoadFundraisingPriceDetailsComponent();
    LoadFundraisingPricingOptionDetailsComponent();
    LoadGiftsInKindCategoriesDetailsComponent();
    LoadGiftsInKindDetailsComponent();
    LoadGLAccountDetailsComponent();
    LoadGLOrderLevelDetailsComponent();
    LoadGLPaymentLevelDetailsComponent();
    LoadGrantDisbursementDetailsComponent();
    LoadGrantDueDiligenceStepLinkDetailsComponent();
    LoadGrantDueDiligenceStepDetailsComponent();
    LoadGrantReportPaymentLinkDetailsComponent();
    LoadGrantReportDetailsComponent();
    LoadGrantsDetailsComponent();
    LoadHousingBlockOptionDetailsComponent();
    LoadHousingBlockRoomDetailsComponent();
    LoadHousingBlockDetailsComponent();
    LoadHousingReservationDetOptionDetailsComponent();
    LoadHousingReservationDetailDetailsComponent();
    LoadHousingReservationGuestDetailsComponent();
    LoadHousingReservationDetailsComponent();
    LoadHousingRoomTypeDetailsComponent();
    LoadHousingTransferDetailDetailsComponent();
    LoadHousingTransferTypeDetailsComponent();
    LoadHousingTransferDetailsComponent();
    LoadHousingDetailsComponent();
    LoadInstantMessagingUserProfileDetailsComponent();
    LoadInstructorDesignationDetailsComponent();
    LoadInternationalSupportFundCategoryDetailsComponent();
    LoadInternationalSupportFundDetailsComponent();
    LoadInventoryLocationDetailsComponent();
    LoadInventoryOnOrderDetailsComponent();
    LoadInventoryTransferDetailsComponent();
    LoadInvoiceConsolidationOrderDetailsComponent();
    LoadInvoiceConsolidationPaymentDetailsComponent();
    LoadInvoiceConsolidationDetailsComponent();
    LoadInvoiceMessageDetailsComponent();
    LoadIssueCategoryDetailsComponent();
    LoadIssueDetailsComponent();
    LoadItemRatingEntryDetailsComponent();
    LoadItemRatingTypeDefinitionDetailsComponent();
    LoadItemRatingTypeDetailsComponent();
    LoadItemRatingDetailsComponent();
    LoadItemReviewEntriesDetailsComponent();
    LoadKeyPerformanceIndicatorDetailsComponent();
    LoadKnowledgeAnswerDetailsComponent();
    LoadKnowledgeCaptureModeDetailsComponent();
    LoadKnowledgeCategoryDetailsComponent();
    LoadKnowledgeDeliveryTypeDetailsComponent();
    LoadKnowledgeParticipantDetailsComponent();
    LoadKnowledgeResultDetailDetailsComponent();
    LoadKnowledgeResultDetailsComponent();
    LoadKnowledgeStatusDetailsComponent();
    LoadKnowledgeStyleSheetDetailsComponent();
    LoadKnowledgeTrackingTypeDetailsComponent();
    LoadKPIFormulaDetailsComponent();
    LoadKPIMetricMappingDetailsComponent();
    LoadKPIMetricDetailsComponent();
    LoadKPIResultParticipantRecordDetailsComponent();
    LoadKPIResultDetailsComponent();
    LoadKPIRunDetailsComponent();
    LoadKPIUnitTypeDetailsComponent();
    LoadLearningManagementSystemAttributeDetailsComponent();
    LoadLearningManagementSystemInteractionDetailsComponent();
    LoadLearningManagementSystemDetailsComponent();
    LoadListDetailArchiveDetailsComponent();
    LoadListDetail__dboDetailsComponent();
    LoadListTypeDetailsComponent();
    LoadList__dboDetailsComponent();
    LoadMailingActivityDetailsComponent();
    LoadMailingActivityDetailDetailsComponent();
    LoadMarketPlaceCategoryDetailsComponent();
    LoadMarketPlaceInfoRequestDetailsComponent();
    LoadMarketPlaceListingTypeDetailsComponent();
    LoadMarketPlaceListingDetailsComponent();
    LoadMeetingAttPossValueDetailsComponent();
    LoadMeetingAttendeeGroupDetailsComponent();
    LoadMeetingAttendeeTypeDetailsComponent();
    LoadMeetingAttributeDetailsComponent();
    LoadMeetingEducationUnitDetailsComponent();
    LoadMeetingHotelDetailsComponent();
    LoadMeetingResourceDetailsComponent();
    LoadMeetingRoomPossibleTypeDetailsComponent();
    LoadMeetingRoomRoomDetailsComponent();
    LoadMeetingRoomTypeDetailsComponent();
    LoadMeetingRoomDetailsComponent();
    LoadMeetingSessionDetailsComponent();
    LoadMeetingSpeakerEvalDetailsComponent();
    LoadMeetingSpeakerDetailsComponent();
    LoadMeetingSponsorDetailsComponent();
    LoadMeetingStatusDetailsComponent();
    LoadMeetingTimeSlotDetailsComponent();
    LoadMeetingTrackDetailsComponent();
    LoadMeetingTransferEmailDetailsComponent();
    LoadMeetingTransferDetailsComponent();
    LoadMeetingTypeAttPossValueDetailsComponent();
    LoadMeetingTypeAttributeDetailsComponent();
    LoadMeetingTypeDetailsComponent();
    LoadMeetingDetailsComponent();
    LoadMemberStatusTypeDetailsComponent();
    LoadMemberTypeDetailsComponent();
    LoadMembershipApplicationDefinitionProductDetailsComponent();
    LoadMembershipApplicationDefinitionDetailsComponent();
    LoadMembershipApplicationDetailsComponent();
    LoadMembershipEmailSchedulesDetailsComponent();
    LoadMembershipEnrollmentDetailsComponent();
    LoadMembershipStatusDetailsComponent();
    LoadMerchantAccountDetailsComponent();
    LoadOpportunityDetailsComponent();
    LoadOpportunityCompetitorDetailsComponent();
    LoadOpportunityContactRoleTypeDetailsComponent();
    LoadOpportunityContactDetailsComponent();
    LoadOpportunityDetailDetailsComponent();
    LoadOpportunityHistoryDetailsComponent();
    LoadOpportunityPartnerRoleTypeDetailsComponent();
    LoadOpportunityPartnerRoleDetailsComponent();
    LoadOpportunityPartnerDetailsComponent();
    LoadOpportunityReferenceTypeDetailsComponent();
    LoadOpportunityReferenceDetailsComponent();
    LoadOpportunityRoleDetailsComponent();
    LoadOpportunitySellingRoleTypeDetailsComponent();
    LoadOpportunitySourceDetailsComponent();
    LoadOpportunityStageOpportunityTypeDetailsComponent();
    LoadOpportunityStageDetailsComponent();
    LoadOpportunityStatusReportDetailsComponent();
    LoadOpportunityTypeDetailsComponent();
    LoadOrderBalanceDetailsComponent();
    LoadOrderBoothCoExhibitorDetailsComponent();
    LoadOrderBoothDetailDetailsComponent();
    LoadOrderBoothProductCodeDetailsComponent();
    LoadOrderCancellationWizardDetailsComponent();
    LoadOrderCurrencySpotRateDetailsComponent();
    LoadOrderDetailDetailsComponent();
    LoadOrderGLEntryDetailsComponent();
    LoadOrderInvAllocationDetailsComponent();
    LoadOrderLineTaxDetailsComponent();
    LoadOrderMasterDetailsComponent();
    LoadOrderMeetingDetailAttributeDetailsComponent();
    LoadOrderMeetingDetailEducationUnitDetailsComponent();
    LoadOrderMeetingDetailDetailsComponent();
    LoadOrderMeetingSessionDetailDetailsComponent();
    LoadOrderPmtScheduleDetailsComponent();
    LoadOrderShipmentTaxDetailsComponent();
    LoadOrderShipmentDetailsComponent();
    LoadOrderSourceDetailsComponent();
    LoadOrderStateDetailsComponent();
    LoadOrderStatusTypeDetailsComponent();
    LoadOrderTotalDetailsComponent();
    LoadOrderTypeDetailsComponent();
    LoadOrganizationAddressDetailsComponent();
    LoadOrganizationGLAccountDetailsComponent();
    LoadOrganizationInterCompanyGLDetailsComponent();
    LoadOrganizationDetailsComponent();
    LoadPaymentAuthorizationDetailsComponent();
    LoadPaymentDetailDetailsComponent();
    LoadPaymentGLEntryDetailsComponent();
    LoadPaymentInformationDetailsComponent();
    LoadPaymentStatusTypeDetailsComponent();
    LoadPaymentTypeGLAccountDetailsComponent();
    LoadPaymentTypeDetailsComponent();
    LoadPaymentDetailsComponent();
    LoadPersonDetailsComponent();
    LoadPersonAccountManagerDetailsComponent();
    LoadPersonAddressDetailsComponent();
    LoadPersonEducationDetailsComponent();
    LoadPersonExternalAccountDetailsComponent();
    LoadPersonFunctionDetailsComponent();
    LoadPersonPersonDetailsComponent();
    LoadPersonPhoneDetailsComponent();
    LoadPersonRelationshipAttributeDetailsComponent();
    LoadPersonRelationshipTypeDetailsComponent();
    LoadPersonSavedPaymentMethodDetailsComponent();
    LoadPersonTaxExCodeDetailsComponent();
    LoadPhoneNumberDetailsComponent();
    LoadPhoneRegionCodesDetailsComponent();
    LoadPledgeContactTypeDetailsComponent();
    LoadPledgeContactDetailsComponent();
    LoadPledgeFundDetailsComponent();
    LoadPledgeGuestListDetailsComponent();
    LoadPledgePaymentScheduleDetailsComponent();
    LoadPledgeStageDetailsComponent();
    LoadPledgeDetailsComponent();
    LoadPostalCodeDetailsComponent();
    LoadPrefCommunicationMethodDetailsComponent();
    LoadPrefixDetailsComponent();
    LoadPricingRuleDetailsComponent();
    LoadProdInvLedgerEntryDetailsComponent();
    LoadProductAssemblyDetailsComponent();
    LoadProductAttributeDetailsComponent();
    LoadProductCategoryDetailsComponent();
    LoadProductCategoryAttribDetailsComponent();
    LoadProductCategoryGLAccountDetailsComponent();
    LoadProductCodeDetailsComponent();
    LoadProductCostDetailDetailsComponent();
    LoadProductCostTypeDetailsComponent();
    LoadProductCostDetailsComponent();
    LoadProductDownloadHistoryDetailsComponent();
    LoadProductDownloadsDetailsComponent();
    LoadProductGLAccountDetailsComponent();
    LoadProductHistAvgCostDetailsComponent();
    LoadProductInvLedgerDetailsComponent();
    LoadProductInventoryLedgerEntryTransactionsDetailsComponent();
    LoadProductIssueDetailsComponent();
    LoadProductKitTypeDetailsComponent();
    LoadProductPriceDetailsComponent();
    LoadProductRelationDetailsComponent();
    LoadProductRelationshipTypeDetailsComponent();
    LoadProductTypeAttributeDetailsComponent();
    LoadProductTypeDetailsComponent();
    LoadProductVendorDetailsComponent();
    LoadProductVersionDetailsComponent();
    LoadProductWebTemplateDetailsComponent();
    LoadProductDetailsComponent();
    LoadPublicationContributorDetailsComponent();
    LoadPublicationRoleDetailsComponent();
    LoadPublicationDetailsComponent();
    LoadQuestionBranchAnswerBranchDetailsComponent();
    LoadQuestionBranchDetailsComponent();
    LoadQuestionKnowledgeAnswerDetailsComponent();
    LoadQuestionTreeKnowledgeDeliveryTypeDetailsComponent();
    LoadQuestionTreeKnowledgeStyleSheetDetailsComponent();
    LoadQuestionTreeListKnowledgeStyleSheetDetailsComponent();
    LoadQuestionTreeDetailsComponent();
    LoadQuestionTypeDetailsComponent();
    LoadQuestionDetailsComponent();
    LoadRatedItemTypeDetailsComponent();
    LoadRatedItemDetailsComponent();
    LoadReferralRequestVendorDetailsComponent();
    LoadReferralRequestDetailsComponent();
    LoadReferralTypeDetailsComponent();
    LoadReferralDetailsComponent();
    LoadRegistrationLineDetailsComponent();
    LoadResourceType__dboDetailsComponent();
    LoadResourceDetailsComponent();
    LoadRestrictedCountryDetailsComponent();
    LoadRevenueCategoryDetailsComponent();
    LoadRevenueRecognitionTypeDetailsComponent();
    LoadSalesTargetTypeDetailsComponent();
    LoadSalesTargetDetailsComponent();
    LoadSalesTaxRateDetailsComponent();
    LoadScheduleTransAccountEntryDetailsComponent();
    LoadScheduledTransactionGroupDetailsComponent();
    LoadScheduledTransactionDetailsComponent();
    LoadScriptLanguageDetailsComponent();
    LoadScriptTypeDetailsComponent();
    LoadScriptDetailsComponent();
    LoadShipTypeDetailsComponent();
    LoadSkillLevelDetailsComponent();
    LoadSkill__dboDetailsComponent();
    LoadSocialstreamDetailsComponent();
    LoadStandingOrProdCatDetailsComponent();
    LoadStandingOrProdDetailsComponent();
    LoadStandingOrPurchasesDetailsComponent();
    LoadStandingOrderScheduleDetailsComponent();
    LoadStandingOrderDetailsComponent();
    LoadStateProvinceDetailsComponent();
    LoadSubsCancelReasonDetailsComponent();
    LoadSubscriptionDeliveryLogDetailsComponent();
    LoadSubscriptionDeliveryScheduleDetailsComponent();
    LoadSubscriptionFulfillmentDetailsComponent();
    LoadSubscriptionPurchaseTypeDetailsComponent();
    LoadSubscriptionPurchaseDetailsComponent();
    LoadSubscriptionStatusDetailsComponent();
    LoadSubscriptionTypeDetailsComponent();
    LoadSubscriptionDetailsComponent();
    LoadSuffixDetailsComponent();
    LoadTaskLinkDetailsComponent();
    LoadTaskTypeDetailsComponent();
    LoadTaskDetailsComponent();
    LoadTaxJurisdictionDetailsComponent();
    LoadTopicCodeLinkDetailsComponent();
    LoadTopicCodeDetailsComponent();
    LoadWebClickthroughDetailsComponent();
    LoadWebGroupDetailsComponent();
    LoadWebShoppingCartDetailsComponent();
    LoadWebUserActivityDetailsComponent();
    LoadWebUserGroupDetailsComponent();
    LoadWebUserDetailsComponent();
}
    