/********************************************************************************
* ALL ENTITIES - TypeGraphQL Type Class Definition - AUTO GENERATED FILE
* Generated Entities and Resolvers for Server
*
*   >>> DO NOT MODIFY THIS FILE!!!!!!!!!!!!
*   >>> YOUR CHANGES WILL BE OVERWRITTEN
*   >>> THE NEXT TIME THIS FILE IS GENERATED
*
**********************************************************************************/
import { Arg, Ctx, Int, Query, Resolver, Field, Float, ObjectType, FieldResolver, Root, InputType, Mutation,
            PubSub, PubSubEngine, ResolverBase, RunViewByIDInput, RunViewByNameInput, RunDynamicViewInput,
            AppContext, KeyValuePairInput, DeleteOptionsInput, GraphQLTimestamp as Timestamp,
            GetReadOnlyDataSource, GetReadWriteDataSource, GetReadOnlyProvider, GetReadWriteProvider } from '@memberjunction/server';
import { SQLServerDataProvider } from '@memberjunction/sqlserver-dataprovider';
import { Metadata, EntityPermissionType, CompositeKey, UserInfo } from '@memberjunction/core'

import { MaxLength } from 'class-validator';
import * as mj_core_schema_server_object_types from '@memberjunction/server'


import { AccountEntity, ContactEntity, NU__Affiliation__cEntity, NU__Committee__cEntity, NU__CommitteeMembership__cEntity, NU__Event__cEntity, NU__Membership__cEntity, NU__Order__cEntity, NU__OrderItem__cEntity, NU__OrderItemLine__cEntity, NU__Payment__cEntity, NU__PaymentLine__cEntity, NU__Product__cEntity, NU__Registration2__cEntity, acct_descEntity, RegionsEntity, core_data_codesEntity, educatorEntity, Core_DataEntity, Salary_Ranking_TableEntity, co_dist_descEntity, Table_5Entity, edschoolEntity, crsassgnEntity, ConversationDetail__bettyEntity, ConversationDetailContentEntity, Conversation__bettyEntity, OrganizationEntity, PersonEntity, UserJoinerEntity, ConversationDetail_250606Entity, ActivityEntity } from 'mj_generatedentities';
    

//****************************************************************************
// ENTITY CLASS for Accounts
//****************************************************************************
@ObjectType()
export class Account_ {
    @Field() 
    @MaxLength(100)
    Id: string;
        
    @Field(() => Boolean, {nullable: true}) 
    IsDeleted?: boolean;
        
    @Field({nullable: true}) 
    MasterRecordId?: string;
        
    @Field({nullable: true}) 
    Name?: string;
        
    @Field({nullable: true}) 
    LastName?: string;
        
    @Field({nullable: true}) 
    FirstName?: string;
        
    @Field({nullable: true}) 
    Salutation?: string;
        
    @Field({nullable: true}) 
    Type?: string;
        
    @Field({nullable: true}) 
    RecordTypeId?: string;
        
    @Field({nullable: true}) 
    ParentId?: string;
        
    @Field({nullable: true}) 
    BillingStreet?: string;
        
    @Field({nullable: true}) 
    BillingCity?: string;
        
    @Field({nullable: true}) 
    BillingState?: string;
        
    @Field({nullable: true}) 
    BillingPostalCode?: string;
        
    @Field({nullable: true}) 
    BillingCountry?: string;
        
    @Field(() => Float, {nullable: true}) 
    BillingLatitude?: number;
        
    @Field(() => Float, {nullable: true}) 
    BillingLongitude?: number;
        
    @Field({nullable: true}) 
    BillingGeocodeAccuracy?: string;
        
    @Field({nullable: true}) 
    ShippingStreet?: string;
        
    @Field({nullable: true}) 
    ShippingCity?: string;
        
    @Field({nullable: true}) 
    ShippingState?: string;
        
    @Field({nullable: true}) 
    ShippingPostalCode?: string;
        
    @Field({nullable: true}) 
    ShippingCountry?: string;
        
    @Field(() => Float, {nullable: true}) 
    ShippingLatitude?: number;
        
    @Field(() => Float, {nullable: true}) 
    ShippingLongitude?: number;
        
    @Field({nullable: true}) 
    ShippingGeocodeAccuracy?: string;
        
    @Field({nullable: true}) 
    Phone?: string;
        
    @Field({nullable: true}) 
    Fax?: string;
        
    @Field({nullable: true}) 
    AccountNumber?: string;
        
    @Field({nullable: true}) 
    Website?: string;
        
    @Field({nullable: true}) 
    PhotoUrl?: string;
        
    @Field({nullable: true}) 
    Sic?: string;
        
    @Field({nullable: true}) 
    Industry?: string;
        
    @Field(() => Float, {nullable: true}) 
    AnnualRevenue?: number;
        
    @Field(() => Int, {nullable: true}) 
    NumberOfEmployees?: number;
        
    @Field({nullable: true}) 
    Ownership?: string;
        
    @Field({nullable: true}) 
    TickerSymbol?: string;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field({nullable: true}) 
    Rating?: string;
        
    @Field({nullable: true}) 
    Site?: string;
        
    @Field({nullable: true}) 
    OwnerId?: string;
        
    @Field({nullable: true}) 
    CreatedById?: string;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    LastModifiedDate?: Date;
        
    @Field({nullable: true}) 
    LastModifiedById?: string;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    SystemModstamp?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    LastActivityDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    LastViewedDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    LastReferencedDate?: Date;
        
    @Field(() => Boolean, {nullable: true}) 
    IsPartner?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    IsCustomerPortal?: boolean;
        
    @Field({nullable: true}) 
    PersonContactId?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    IsPersonAccount?: boolean;
        
    @Field({nullable: true}) 
    ChannelProgramName?: string;
        
    @Field({nullable: true}) 
    ChannelProgramLevelName?: string;
        
    @Field({nullable: true}) 
    PersonMailingStreet?: string;
        
    @Field({nullable: true}) 
    PersonMailingCity?: string;
        
    @Field({nullable: true}) 
    PersonMailingState?: string;
        
    @Field({nullable: true}) 
    PersonMailingPostalCode?: string;
        
    @Field({nullable: true}) 
    PersonMailingCountry?: string;
        
    @Field(() => Float, {nullable: true}) 
    PersonMailingLatitude?: number;
        
    @Field(() => Float, {nullable: true}) 
    PersonMailingLongitude?: number;
        
    @Field({nullable: true}) 
    PersonMailingGeocodeAccuracy?: string;
        
    @Field({nullable: true}) 
    PersonOtherStreet?: string;
        
    @Field({nullable: true}) 
    PersonOtherCity?: string;
        
    @Field({nullable: true}) 
    PersonOtherState?: string;
        
    @Field({nullable: true}) 
    PersonOtherPostalCode?: string;
        
    @Field({nullable: true}) 
    PersonOtherCountry?: string;
        
    @Field(() => Float, {nullable: true}) 
    PersonOtherLatitude?: number;
        
    @Field(() => Float, {nullable: true}) 
    PersonOtherLongitude?: number;
        
    @Field({nullable: true}) 
    PersonOtherGeocodeAccuracy?: string;
        
    @Field({nullable: true}) 
    PersonMobilePhone?: string;
        
    @Field({nullable: true}) 
    PersonHomePhone?: string;
        
    @Field({nullable: true}) 
    PersonOtherPhone?: string;
        
    @Field({nullable: true}) 
    PersonAssistantPhone?: string;
        
    @Field({nullable: true}) 
    PersonEmail?: string;
        
    @Field({nullable: true}) 
    PersonTitle?: string;
        
    @Field({nullable: true}) 
    PersonDepartment?: string;
        
    @Field({nullable: true}) 
    PersonAssistantName?: string;
        
    @Field({nullable: true}) 
    PersonLeadSource?: string;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    PersonBirthdate?: Date;
        
    @Field(() => Boolean, {nullable: true}) 
    PersonHasOptedOutOfEmail?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    PersonHasOptedOutOfFax?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    PersonDoNotCall?: boolean;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    PersonLastCURequestDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    PersonLastCUUpdateDate?: Date;
        
    @Field({nullable: true}) 
    PersonEmailBouncedReason?: string;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    PersonEmailBouncedDate?: Date;
        
    @Field({nullable: true}) 
    PersonIndividualId?: string;
        
    @Field({nullable: true}) 
    Jigsaw?: string;
        
    @Field({nullable: true}) 
    JigsawCompanyId?: string;
        
    @Field({nullable: true}) 
    AccountSource?: string;
        
    @Field({nullable: true}) 
    SicDesc?: string;
        
    @Field(() => Float, {nullable: true}) 
    NU__AccountBalance__c?: number;
        
    @Field({nullable: true}) 
    NU__AccountID__c?: string;
        
    @Field(() => Float, {nullable: true}) 
    NU__AccountMoneySpent__c?: number;
        
    @Field({nullable: true}) 
    NU__CasualName__c?: string;
        
    @Field({nullable: true}) 
    NU__CommunicationPreference__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    NU__CopyFromMailingToBilling__c?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    NU__CopyFromMailingToOther__c?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    NU__CopyFromMailingToShipping__c?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    NU__CopyFromPrimaryAffiliationBilling__c?: boolean;
        
    @Field({nullable: true}) 
    NU__Designation__c?: string;
        
    @Field({nullable: true}) 
    NU__Ethnicity__c?: string;
        
    @Field({nullable: true}) 
    NU__ExternalID__c?: string;
        
    @Field({nullable: true}) 
    NU__FacebookAccount__c?: string;
        
    @Field({nullable: true}) 
    NU__FullName__c?: string;
        
    @Field({nullable: true}) 
    NU__Gender__c?: string;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    NU__JoinOn__c?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    NU__LapsedOn__c?: Date;
        
    @Field({nullable: true}) 
    NU__Lapsed__c?: string;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    NU__LastLogin__c?: Date;
        
    @Field({nullable: true}) 
    NU__LegacyID__c?: string;
        
    @Field({nullable: true}) 
    NU__LinkedInAccount__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    NU__MarkForDelete__c?: boolean;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    NU__MemberThru__c?: Date;
        
    @Field({nullable: true}) 
    NU__Member__c?: string;
        
    @Field({nullable: true}) 
    NU__MembershipType__c?: string;
        
    @Field({nullable: true}) 
    NU__Membership__c?: string;
        
    @Field({nullable: true}) 
    NU__MiddleName__c?: string;
        
    @Field({nullable: true}) 
    NU__OtherEmail__c?: string;
        
    @Field({nullable: true}) 
    NU__OtherFax__c?: string;
        
    @Field({nullable: true}) 
    NU__PasswordHash__c?: string;
        
    @Field({nullable: true}) 
    NU__PasswordSalt__c?: string;
        
    @Field({nullable: true}) 
    NU__PersonAccountData__c?: string;
        
    @Field({nullable: true}) 
    NU__PersonContact__c?: string;
        
    @Field({nullable: true}) 
    NU__PersonEmail__c?: string;
        
    @Field({nullable: true}) 
    NU__PrimaryAffiliation__c?: string;
        
    @Field({nullable: true}) 
    NU__PrimaryEntity__c?: string;
        
    @Field({nullable: true}) 
    NU__RecordTypeName__c?: string;
        
    @Field({nullable: true}) 
    NU__RecoveryAnswer1__c?: string;
        
    @Field({nullable: true}) 
    NU__RecoveryAnswer2__c?: string;
        
    @Field({nullable: true}) 
    NU__RecoveryAnswer3__c?: string;
        
    @Field({nullable: true}) 
    NU__RecoveryQuestion1__c?: string;
        
    @Field({nullable: true}) 
    NU__RecoveryQuestion2__c?: string;
        
    @Field({nullable: true}) 
    NU__RecoveryQuestion3__c?: string;
        
    @Field({nullable: true}) 
    NU__SecurityGroup__c?: string;
        
    @Field({nullable: true}) 
    NU__StatusMembershipFlag__c?: string;
        
    @Field({nullable: true}) 
    NU__StatusMembership__c?: string;
        
    @Field({nullable: true}) 
    NU__Status__c?: string;
        
    @Field({nullable: true}) 
    NU__Suffix__c?: string;
        
    @Field({nullable: true}) 
    NU__TaxExemptId__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    NU__TaxExempt__c?: boolean;
        
    @Field(() => Float, {nullable: true}) 
    NU__TotalAffiliateBalance__c?: number;
        
    @Field(() => Float, {nullable: true}) 
    NU__TotalAffiliateMoneySpent__c?: number;
        
    @Field({nullable: true}) 
    NU__TwitterAccount__c?: string;
        
    @Field({nullable: true}) 
    NU__Username__c?: string;
        
    @Field({nullable: true}) 
    NU__ValidEmailDomains__c?: string;
        
    @Field({nullable: true}) 
    Pay_Type__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    No_CTA__c?: boolean;
        
    @Field(() => Float, {nullable: true}) 
    Certified_CTA_Dues__c?: number;
        
    @Field(() => Boolean, {nullable: true}) 
    Refund_to_Individual__c?: boolean;
        
    @Field({nullable: true}) 
    Student_year__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    Fellowship_program__c?: boolean;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    Expected_graduation_date__c?: Date;
        
    @Field(() => Boolean, {nullable: true}) 
    Student_teach__c?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    Member_of_FTA__c?: boolean;
        
    @Field({nullable: true}) 
    Grade_Level__c?: string;
        
    @Field({nullable: true}) 
    NU__PrimaryAffiliationRecord__c?: string;
        
    @Field({nullable: true}) 
    Is_certified__c?: string;
        
    @Field({nullable: true}) 
    Account_Owner_Data_Processing__c?: string;
        
    @Field({nullable: true}) 
    AccrualDues__c?: string;
        
    @Field({nullable: true}) 
    DESE_Key__c?: string;
        
    @Field({nullable: true}) 
    SSN_Last_4__c?: string;
        
    @Field({nullable: true}) 
    CTA_Number__c?: string;
        
    @Field({nullable: true}) 
    CloudingoAgent__BAR__c?: string;
        
    @Field({nullable: true}) 
    Membership_Product_Name__c?: string;
        
    @Field({nullable: true}) 
    Beneficiary__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    Exclude_Directory__c?: boolean;
        
    @Field({nullable: true}) 
    NU__PrimaryContactEmail__c?: string;
        
    @Field({nullable: true}) 
    Previous_Last_Name__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    Collect_Student_Chapter_Dues__c?: boolean;
        
    @Field({nullable: true}) 
    Contact_if_problems__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    Display_CTA_Dues__c?: boolean;
        
    @Field({nullable: true}) 
    Payroll_deduction_through__c?: string;
        
    @Field({nullable: true}) 
    CTA_Priority__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    Easy_Renewal__c?: boolean;
        
    @Field({nullable: true}) 
    Contact_Account_del__c?: string;
        
    @Field({nullable: true}) 
    Member_Id__c?: string;
        
    @Field({nullable: true}) 
    School_District_Account__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    MSTA_Action__c?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    No_outside_solicitation__c?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    No_Magazine__c?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    Opt_out_of_all_MSTA_mail__c?: boolean;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    Membership_Card__c?: Date;
        
    @Field({nullable: true}) 
    Beneficiary_Relation__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    Opt_out_of_all_MSTA_Email__c?: boolean;
        
    @Field({nullable: true}) 
    Content_Area__c?: string;
        
    @Field({nullable: true}) 
    NU__PrimaryContactName__c?: string;
        
    @Field({nullable: true}) 
    NU__PrimaryLocationQualityCode__c?: string;
        
    @Field(() => Float, {nullable: true}) 
    NU__PrimaryLocation__Latitude__s?: number;
        
    @Field(() => Float, {nullable: true}) 
    NU__PrimaryLocation__Longitude__s?: number;
        
    @Field({nullable: true}) 
    Region__c?: string;
        
    @Field({nullable: true}) 
    Institution__c?: string;
        
    @Field({nullable: true}) 
    Work_Phone__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    Deceased__c?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    Expelled__c?: boolean;
        
    @Field({nullable: true}) 
    Legacy_Customer_Type__c?: string;
        
    @Field({nullable: true}) 
    Future_Member_Type__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    Future_Member__c?: boolean;
        
    @Field({nullable: true}) 
    Future_Pay_Type__c?: string;
        
    @Field({nullable: true}) 
    Future_Product_Type__c?: string;
        
    @Field({nullable: true}) 
    Future_Status__c?: string;
        
    @Field({nullable: true}) 
    New_Member_Type__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    New_Member__c?: boolean;
        
    @Field({nullable: true}) 
    New_Product_Type__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    Suspend__c?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    UnmatchedBalances__c?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    Test_Owner_Matches_Parent__c?: boolean;
        
    @Field({nullable: true}) 
    Institution_CTA_Number__c?: string;
        
    @Field({nullable: true}) 
    Marketing_Label__c?: string;
        
    @Field({nullable: true}) 
    Future_Marketing_Label__c?: string;
        
    @Field({nullable: true}) 
    InstitutionId__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    Easy_Renewal_Complete__c?: boolean;
        
    @Field({nullable: true}) 
    Remove_Reason__c?: string;
        
    @Field({nullable: true}) 
    MobileAdmin__c?: string;
        
    @Field({nullable: true}) 
    MobileDirectoryActive__c?: string;
        
    @Field({nullable: true}) 
    MobileInfo__c?: string;
        
    @Field({nullable: true}) 
    Future_Renewal_Notice_Code__c?: string;
        
    @Field({nullable: true}) 
    NU__PrimaryContact__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    NU__UpdatePrimaryLocation__c?: boolean;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    Agreed_to_Terms__c?: Date;
        
    @Field({nullable: true}) 
    Alternate_Work_Phone__c?: string;
        
    @Field({nullable: true}) 
    School_Address__c?: string;
        
    @Field({nullable: true}) 
    School_City_F__c?: string;
        
    @Field({nullable: true}) 
    School_Country_F__c?: string;
        
    @Field({nullable: true}) 
    School_StateProvince__c?: string;
        
    @Field({nullable: true}) 
    School_Street__c?: string;
        
    @Field({nullable: true}) 
    School_ZipPostal_Code__c?: string;
        
    @Field({nullable: true}) 
    Student_At_School_Address_Line_1__c?: string;
        
    @Field({nullable: true}) 
    Student_At_School_Address_Line_2__c?: string;
        
    @Field({nullable: true}) 
    Student_At_School_Address_Line_3__c?: string;
        
    @Field({nullable: true}) 
    Student_At_School_City__c?: string;
        
    @Field({nullable: true}) 
    Student_At_School_Country__c?: string;
        
    @Field({nullable: true}) 
    Student_At_School_PostalCode__c?: string;
        
    @Field({nullable: true}) 
    Student_At_School_State__c?: string;
        
    @Field({nullable: true}) 
    Student_At_School_Street__c?: string;
        
    @Field({nullable: true}) 
    Student_At_School__c?: string;
        
    @Field({nullable: true}) 
    Use_for_Billing__c?: string;
        
    @Field({nullable: true}) 
    Use_for_Mailing__c?: string;
        
    @Field({nullable: true}) 
    Use_for_Shipping__c?: string;
        
    @Field({nullable: true}) 
    Future_Product_List_Price__c?: string;
        
    @Field(() => Float, {nullable: true}) 
    Chapter_Dues_Amount__c?: number;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    Lapsed_Beyond_Grace_Return_Date__c?: Date;
        
    @Field({nullable: true}) 
    MSTA_Legacy_Customer_Type__c?: string;
        
    @Field({nullable: true}) 
    Renewal_Forms_Sort__c?: string;
        
    @Field({nullable: true}) 
    State_House_District__c?: string;
        
    @Field({nullable: true}) 
    State_Senate_District__c?: string;
        
    @Field(() => Float, {nullable: true}) 
    NU__CreditBalance__c?: number;
        
    @Field({nullable: true}) 
    Abbreviation__c?: string;
        
    @Field({nullable: true}) 
    Previous_Acct_Owner__c?: string;
        
    @Field({nullable: true}) 
    County__c?: string;
        
    @Field({nullable: true}) 
    Alt_Contact_Account_del__c?: string;
        
    @Field(() => Float, {nullable: true}) 
    Net_Promoter_Score__c?: number;
        
    @Field(() => Float, {nullable: true}) 
    NU__TotalAffiliatedAccounts__c?: number;
        
    @Field({nullable: true}) 
    Respondent_Comments__c?: string;
        
    @Field({nullable: true}) 
    NU__FullNameOverride__c?: string;
        
    @Field(() => Float, {nullable: true}) 
    Birthday_Day__c?: number;
        
    @Field(() => Boolean, {nullable: true}) 
    Non_member_Opt_In__c?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    NU__Trusted__c?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    NC__AccountCreatedThroughSocialSignOn__c?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    NC__AccountDoesNotHavePassword__c?: boolean;
        
    @Field({nullable: true}) 
    Expected_Graduation_Month__c?: string;
        
    @Field({nullable: true}) 
    Expected_Graduation_Year__c?: string;
        
    @Field({nullable: true}) 
    geopointe__Geocode__c?: string;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    Non_Renewal_Mailing__c?: Date;
        
    @Field({nullable: true}) 
    NU__ProfileImageRevisionId__c?: string;
        
    @Field({nullable: true}) 
    NU__ProfileImageURL__c?: string;
        
    @Field({nullable: true}) 
    NU__ProfileImage__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    NU__SandboxEnabled__c?: boolean;
        
    @Field({nullable: true}) 
    NPS_Year__c?: string;
        
    @Field({nullable: true}) 
    NPS_Response_Label__c?: string;
        
    @Field({nullable: true}) 
    AgencyUsedforFoodService__c?: string;
        
    @Field({nullable: true}) 
    NPFollowupComments__c?: string;
        
    @Field({nullable: true}) 
    AgencyusedforSubstitutes__c?: string;
        
    @Field(() => Float, {nullable: true}) 
    School_Building_Number__c?: number;
        
    @Field({nullable: true}) 
    AgencyusedforCustodialServices__c?: string;
        
    @Field({nullable: true}) 
    CollectiveBargaining__c?: string;
        
    @Field({nullable: true}) 
    ContractforCustodial__c?: string;
        
    @Field({nullable: true}) 
    ContractforFoodService__c?: string;
        
    @Field({nullable: true}) 
    ContractforSubstitutes__c?: string;
        
    @Field({nullable: true}) 
    rrpu__Alert_Message__c?: string;
        
    @Field(() => Float, {nullable: true}) 
    CloudingoAgent__BAS__c?: number;
        
    @Field({nullable: true}) 
    CloudingoAgent__BAV__c?: string;
        
    @Field({nullable: true}) 
    CloudingoAgent__BRDI__c?: string;
        
    @Field({nullable: true}) 
    CloudingoAgent__BTZ__c?: string;
        
    @Field({nullable: true}) 
    CloudingoAgent__SAR__c?: string;
        
    @Field(() => Float, {nullable: true}) 
    CloudingoAgent__SAS__c?: number;
        
    @Field({nullable: true}) 
    CloudingoAgent__SAV__c?: string;
        
    @Field({nullable: true}) 
    CloudingoAgent__SRDI__c?: string;
        
    @Field({nullable: true}) 
    CloudingoAgent__STZ__c?: string;
        
    @Field({nullable: true}) 
    LongFormID__c?: string;
        
    @Field({nullable: true}) 
    InstitutionLongID__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    BillHighway__c?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    NoPacket__c?: boolean;
        
    @Field({nullable: true}) 
    YourMembershipType__c?: string;
        
    @Field({nullable: true}) 
    YourProductType__c?: string;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    NC_DPP__AnonymizedDate__c?: Date;
        
    @Field(() => Float, {nullable: true}) 
    NumCurrentYearMemberships__c?: number;
        
    @Field(() => Boolean, {nullable: true}) 
    DoNotSendMembershipCard__c?: boolean;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    NewBylawsReceived__c?: Date;
        
    @Field({nullable: true}) 
    BillHighwayStatus__c?: string;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    BillHighwayCanceledDate__c?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    NU__LapsedOnOverride__c?: Date;
        
    @Field({nullable: true}) 
    NU__MemberOverride__c?: string;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    qualtrics__NPS_Date__c?: Date;
        
    @Field(() => Float, {nullable: true}) 
    qualtrics__Net_Promoter_Score__c?: number;
        
    @Field({nullable: true}) 
    NPHowCanWeImprove__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    NPFollowup__c?: boolean;
        
    @Field({nullable: true}) 
    NPEmail__c?: string;
        
    @Field({nullable: true}) 
    District_Attorney__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    Email_Opt_in_Weekly_Bytes__c?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    MNEA_LM_1_Filed__c?: boolean;
        
    @Field({nullable: true}) 
    MSTA_LM_1_Filed__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    Email_Opt_in_Events__c?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    Email_Opt_in_Action__c?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    Email_Opt_in_News__c?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    Email_Opt_in_Leaders__c?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    Email_Opt_in_Partners__c?: boolean;
        
    @Field({nullable: true}) 
    CurrentFiscalYear__c?: string;
        
    @Field({nullable: true}) 
    InsuranceCoverageDates__c?: string;
        
    @Field({nullable: true}) 
    Membership_Year__c?: string;
        
    @Field({nullable: true}) 
    TodaysDate__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    IsStudent__c?: boolean;
        
    @Field({nullable: true}) 
    PreferredAddress__c?: string;
        
    @Field({nullable: true}) 
    ChMemberType__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    Known_Bad_Home_Address__c?: boolean;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    CTA_Dues_Collection_Agreement__c?: Date;
        
    @Field(() => Boolean, {nullable: true}) 
    ACH_Agreement_On_File__c?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    MSTA_Collecting_CTA_Dues__c?: boolean;
        
    @Field({nullable: true}) 
    Region_Abbreviation__c?: string;
        
    @Field(() => Float, {nullable: true}) 
    Chapter_Dues__c?: number;
        
    @Field({nullable: true}) 
    Recruited_By__c?: string;
        
    @Field({nullable: true}) 
    Duplicate_Key__c?: string;
        
    @Field({nullable: true}) 
    Position__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    PSRS_Petition__c?: boolean;
        
    @Field(() => Float, {nullable: true}) 
    CTA_Dues_Amount_to_Display_on_Renewal__c?: number;
        
    @Field(() => Float, {nullable: true}) 
    Non_certified_CTA_Dues__c?: number;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    Collective_Bargaining_Agreement_Received__c?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    Collective_Bargaining_Agreement_Expires__c?: Date;
        
    @Field(() => Float, {nullable: true}) 
    DESKSCMT__Desk_Company_Id__c?: number;
        
    @Field(() => Float, {nullable: true}) 
    P2A__Advocate_ID__c?: number;
        
    @Field({nullable: true}) 
    P2A__City_District__c?: string;
        
    @Field({nullable: true}) 
    P2A__County__c?: string;
        
    @Field({nullable: true}) 
    P2A__Federal_House_District__c?: string;
        
    @Field({nullable: true}) 
    P2A__State_House_District__c?: string;
        
    @Field({nullable: true}) 
    P2A__State_Senate_District__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    P2A__Synced__c?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    DESKSCMT__Desk_Migrated_Account__c?: boolean;
        
    @Field(() => Float, {nullable: true}) 
    Desk_Id__c?: number;
        
    @Field(() => Boolean, {nullable: true}) 
    NU__IsMemberFlag__c?: boolean;
        
    @Field({nullable: true}) 
    Field_Rep_Number__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    No_DocuSign__c?: boolean;
        
    @Field({nullable: true}) 
    DocuSignCurrentBuilding__c?: string;
        
    @Field({nullable: true}) 
    bg_Docusign_Job__c?: string;
        
    @Field({nullable: true}) 
    envelope_event__c?: string;
        
    @Field({nullable: true}) 
    envelope_id__c?: string;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    envelope_resent_date_time__c?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    envelope_sent_date_time__c?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    envelope_status_retrieval_datetime__c?: Date;
        
    @Field({nullable: true}) 
    envelope_status_value__c?: string;
        
    @Field({nullable: true}) 
    envelope_template_id__c?: string;
        
    @Field({nullable: true}) 
    Envelope_Email_Body__c?: string;
        
    @Field({nullable: true}) 
    Envelope_Email_Subject_Line__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    Resigned__c?: boolean;
        
    @Field(() => Float, {nullable: true}) 
    Membership_Dues__c?: number;
        
    @Field({nullable: true}) 
    Reason_for_Resigning__c?: string;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    DocuSignEndDate__c?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    Paper_Renewals_Sent__c?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    DocuSign_Completed_List_Sent__c?: Date;
        
    @Field({nullable: true}) 
    Schedule__c?: string;
        
    @Field({nullable: true}) 
    Schedule_Type__c?: string;
        
    @Field({nullable: true}) 
    Schedule_Stage__c?: string;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    Schedule_Start_Date__c?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    Schedule_End_Date__c?: Date;
        
    @Field({nullable: true}) 
    DocuSign_Status__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    Membership_Pending__c?: boolean;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    CTA_Officers_Recorded__c?: Date;
        
    @Field({nullable: true}) 
    Duplicate_Key_Fname_DOB_Zip_Addr__c?: string;
        
    @Field({nullable: true}) 
    Duplicate_Key_fname_DOB_Last4__c?: string;
        
    @Field({nullable: true}) 
    Duplicate_Key_fname_DOB_Last4_formula__c?: string;
        
    @Field({nullable: true}) 
    Duplicate_Key_fname_DOB_Zip__c?: string;
        
    @Field({nullable: true}) 
    Duplicate_Key_fname_DOB__c?: string;
        
    @Field({nullable: true}) 
    Duplicate_Key_fname_Last4_Zip__c?: string;
        
    @Field({nullable: true}) 
    Duplicate_Key_fname_Last4__c?: string;
        
    @Field({nullable: true}) 
    Duplicate_Key_fname_temp__c?: string;
        
    @Field({nullable: true}) 
    Resolve_Concurrent_Membership_B4_Merging__c?: string;
        
    @Field({nullable: true}) 
    fname__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    is_master_Fname_DOB_Last4SSN__c?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    is_master_Fname_DOB_Zip_AddrOrPhone__c?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    is_master_Fname_DOB_Zip_Addr__c?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    is_master_Fname_DOB_Zip__c?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    is_master_Fname_Last4SSN_Zip__c?: boolean;
        
    @Field({nullable: true}) 
    masterID_ref_fname_DOB_Last4__c?: string;
        
    @Field({nullable: true}) 
    masterID_ref_fname_DOB_Zip_AddrOrPhone__c?: string;
        
    @Field({nullable: true}) 
    masterID_ref_fname_DOB_Zip_Addr__c?: string;
        
    @Field({nullable: true}) 
    masterID_ref_fname_DOB_Zip__c?: string;
        
    @Field({nullable: true}) 
    masterID_ref_fname_Last4_Zip__c?: string;
        
    @Field({nullable: true}) 
    matching_key_Fname_DOB_Last4SSN__c?: string;
        
    @Field({nullable: true}) 
    matching_key_Fname_DOB_Zip__c?: string;
        
    @Field({nullable: true}) 
    matching_key_Fname_Last4SSN_Zip__c?: string;
        
    @Field(() => Float, {nullable: true}) 
    Number_of_Payroll_Payments__c?: number;
        
    @Field({nullable: true}) 
    New_Building_from_DocuSign__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    qtr1_cta_dues_processed__c?: boolean;
        
    @Field(() => Float, {nullable: true}) 
    qtr1_dues_pending_pmnt_to_institution__c?: number;
        
    @Field(() => Float, {nullable: true}) 
    qtr1_dues_processed_pmnt_to_institution__c?: number;
        
    @Field(() => Float, {nullable: true}) 
    qtr1_new_dues_to_pay_to_institution__c?: number;
        
    @Field(() => Boolean, {nullable: true}) 
    qtr2_cta_dues_processed__c?: boolean;
        
    @Field(() => Float, {nullable: true}) 
    qtr2_dues_pending_pmnt_to_institution__c?: number;
        
    @Field(() => Float, {nullable: true}) 
    qtr2_dues_processed_pmnt_to_institution__c?: number;
        
    @Field(() => Float, {nullable: true}) 
    qtr2_new_dues_to_pay_to_institution__c?: number;
        
    @Field(() => Boolean, {nullable: true}) 
    qtr3_cta_dues_processed__c?: boolean;
        
    @Field(() => Float, {nullable: true}) 
    qtr3_dues_pending_pmnt_to_institution__c?: number;
        
    @Field(() => Float, {nullable: true}) 
    qtr3_dues_processed_pmnt_to_institution__c?: number;
        
    @Field(() => Float, {nullable: true}) 
    qtr3_new_dues_to_pay_to_institution__c?: number;
        
    @Field(() => Boolean, {nullable: true}) 
    qtr4_cta_dues_processed__c?: boolean;
        
    @Field(() => Float, {nullable: true}) 
    qtr4_dues_pending_pmnt_to_institution__c?: number;
        
    @Field(() => Float, {nullable: true}) 
    qtr4_dues_processed_pmnt_to_institution__c?: number;
        
    @Field(() => Float, {nullable: true}) 
    qtr4_new_dues_to_pay_to_institution__c?: number;
        
    @Field(() => Float, {nullable: true}) 
    txs_dues_pending_pmnt_to_institution__c?: number;
        
    @Field(() => Float, {nullable: true}) 
    txs_dues_processed_pmnt_to_institution__c?: number;
        
    @Field(() => Float, {nullable: true}) 
    DocuSign_Entered_CTA_Dues__c?: number;
        
    @Field({nullable: true}) 
    Highest_Level_of_Education__c?: string;
        
    @Field({nullable: true}) 
    Anticipated_Retirement_Year__c?: string;
        
    @Field({nullable: true}) 
    Associate_Job_Category__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    Billing_Address_Override__c?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    Mailing_Address_Override__c?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    Exempt_from_Book_Studies__c?: boolean;
        
    @Field(() => Float, {nullable: true}) 
    Dues_Balance__c?: number;
        
    @Field({nullable: true}) 
    Paying_CTA_Dues_Thru_MSTA__c?: string;
        
    @Field({nullable: true}) 
    Simple_Pay_Type__c?: string;
        
    @Field({nullable: true}) 
    ConsentItem__c?: string;
        
    @Field({nullable: true}) 
    UltimateId__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    AllowPayroll__c?: boolean;
        
    @Field(() => Float, {nullable: true}) 
    Number_of_Payroll_Deductions__c?: number;
        
    @Field({nullable: true}) 
    Home_Phone_Type__c?: string;
        
    @Field({nullable: true}) 
    Mobile_Type__c?: string;
        
    @Field({nullable: true}) 
    namz__AssignmentRule__c?: string;
        
    @Field({nullable: true}) 
    namz__PrimaryAffiliation__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    Known_Bad_Home_Phone__c?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    Known_Bad_Mobile__c?: boolean;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    Home_Phone_Verified__c?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    Mobile_Phone_Verified__c?: Date;
        
    @Field(() => Boolean, {nullable: true}) 
    NU__ExcludeFromAffiliationSearch__c?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    Home_Phone_Is_Valid__c?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    Mobile_Is_Valid__c?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    HomePhoneVerifiedCurrFiscal__c?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    MobileVerifiedCurrFiscal__c?: boolean;
        
    @Field({nullable: true}) 
    NU__ExternalID__pc?: string;
        
    @Field({nullable: true}) 
    ET_Field_Rep__pc?: string;
        
    @Field({nullable: true}) 
    Deskcom__twitter_username__pc?: string;
        
    @Field({nullable: true}) 
    e4sf__Engage_Address_City__pc?: string;
        
    @Field({nullable: true}) 
    e4sf__Engage_Address_Country__pc?: string;
        
    @Field({nullable: true}) 
    e4sf__Engage_Address_PostalCode__pc?: string;
        
    @Field({nullable: true}) 
    e4sf__Engage_Address_State__pc?: string;
        
    @Field({nullable: true}) 
    e4sf__Engage_Address_Street__pc?: string;
        
    @Field({nullable: true}) 
    e4sf__Engage_Batch_Id__pc?: string;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    e4sf__Engage_Date_Last_Sync__pc?: Date;
        
    @Field({nullable: true}) 
    e4sf__Engage_Ext_Id__pc?: string;
        
    @Field({nullable: true}) 
    e4sf__Engage_Federal_District_Lower_Chamber__pc?: string;
        
    @Field({nullable: true}) 
    e4sf__Engage_Federal_District_Upper_Chamber__pc?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    e4sf__Engage_Is_Advocate__pc?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    e4sf__Engage_Never_Sync_To_Engage__pc?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    e4sf__Engage_Opt_Out__pc?: boolean;
        
    @Field({nullable: true}) 
    e4sf__Engage_Phone__pc?: string;
        
    @Field({nullable: true}) 
    e4sf__Engage_State_District_Lower_Chamber__pc?: string;
        
    @Field({nullable: true}) 
    e4sf__Engage_State_District_Upper_Chamber__pc?: string;
        
    @Field({nullable: true}) 
    geopointe__Geocode__pc?: string;
        
    @Field({nullable: true}) 
    rrpu__Alert_Message__pc?: string;
        
    @Field(() => Float, {nullable: true}) 
    CloudingoAgent__CES__pc?: number;
        
    @Field({nullable: true}) 
    CloudingoAgent__MAR__pc?: string;
        
    @Field(() => Float, {nullable: true}) 
    CloudingoAgent__MAS__pc?: number;
        
    @Field({nullable: true}) 
    CloudingoAgent__MAV__pc?: string;
        
    @Field({nullable: true}) 
    CloudingoAgent__MRDI__pc?: string;
        
    @Field({nullable: true}) 
    CloudingoAgent__MTZ__pc?: string;
        
    @Field({nullable: true}) 
    CloudingoAgent__OAR__pc?: string;
        
    @Field(() => Float, {nullable: true}) 
    CloudingoAgent__OAS__pc?: number;
        
    @Field({nullable: true}) 
    CloudingoAgent__OAV__pc?: string;
        
    @Field({nullable: true}) 
    CloudingoAgent__ORDI__pc?: string;
        
    @Field({nullable: true}) 
    CloudingoAgent__OTZ__pc?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    NC_DPP__Anonymize__pc?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    NC_DPP__Consented__pc?: boolean;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    NC_DPP__LastConsentedDate__pc?: Date;
        
    @Field({nullable: true}) 
    NU__Biography__pc?: string;
        
    @Field({nullable: true}) 
    NU__Degrees__pc?: string;
        
    @Field({nullable: true}) 
    NU__DoctoralInstitution__pc?: string;
        
    @Field({nullable: true}) 
    NU__Expertise__pc?: string;
        
    @Field({nullable: true}) 
    NU__GraduateInstitution__pc?: string;
        
    @Field({nullable: true}) 
    NU__Interests__pc?: string;
        
    @Field({nullable: true}) 
    NU__UndergraduateInstitution__pc?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    et4ae5__HasOptedOutOfMobile__pc?: boolean;
        
    @Field({nullable: true}) 
    et4ae5__Mobile_Country_Code__pc?: string;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    qualtrics__Informed_Consent_Date__pc?: Date;
        
    @Field(() => Boolean, {nullable: true}) 
    qualtrics__Informed_Consent__pc?: boolean;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    qualtrics__Last_Survey_Invitation__pc?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    qualtrics__Last_Survey_Response__pc?: Date;
        
    @Field(() => Float, {nullable: true}) 
    qualtrics__Net_Promoter_Score__pc?: number;
        
    @Field(() => Boolean, {nullable: true}) 
    is_eligible_for_SFMC_sync__pc?: boolean;
        
    @Field({nullable: true}) 
    Long_Form_ID__pc?: string;
        
    @Field({nullable: true}) 
    Institution__pc?: string;
        
    @Field({nullable: true}) 
    Member__pc?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    Eligible_For_SFMC_Sync__pc?: boolean;
        
    @Field(() => Float, {nullable: true}) 
    DESKSCMT__Desk_Customer_Id__pc?: number;
        
    @Field(() => Boolean, {nullable: true}) 
    DESKSCMT__Desk_Migrated_Contact__pc?: boolean;
        
    @Field({nullable: true}) 
    title__pc?: string;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    created_at__pc?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    updated_at__pc?: Date;
        
    @Field(() => Float, {nullable: true}) 
    P2A__Advocate_ID__pc?: number;
        
    @Field({nullable: true}) 
    P2A__City_District__pc?: string;
        
    @Field({nullable: true}) 
    P2A__County__pc?: string;
        
    @Field({nullable: true}) 
    P2A__Federal_House_District__pc?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    P2A__Phone2Action_Email_Optin__pc?: boolean;
        
    @Field({nullable: true}) 
    P2A__State_House_District__pc?: string;
        
    @Field({nullable: true}) 
    P2A__State_Senate_District__pc?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    P2A__Synced__pc?: boolean;
        
    @Field({nullable: true}) 
    external_id__pc?: string;
        
    @Field({nullable: true}) 
    background__pc?: string;
        
    @Field({nullable: true}) 
    language__pc?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    access_private_portal__pc?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    access_company_cases__pc?: boolean;
        
    @Field(() => Float, {nullable: true}) 
    Desk_Id__pc?: number;
        
    @Field({nullable: true}) 
    rcsfl__SMS_Number__pc?: string;
        
    @Field({nullable: true}) 
    rcsfl__SendSMS__pc?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    Troubleshoot?: string;
        
    @Field(() => [Person_])
    Persons_NimbleAccountIDArray: Person_[]; // Link to Persons
    
    @Field(() => [Organization_])
    Organizations_NimbleAccountIDArray: Organization_[]; // Link to Organizations
    
}

//****************************************************************************
// INPUT TYPE for Accounts
//****************************************************************************
@InputType()
export class CreateAccountInput {
    @Field({ nullable: true })
    Id?: string;

    @Field(() => Boolean, { nullable: true })
    IsDeleted: boolean | null;

    @Field({ nullable: true })
    MasterRecordId: string | null;

    @Field({ nullable: true })
    Name: string | null;

    @Field({ nullable: true })
    LastName: string | null;

    @Field({ nullable: true })
    FirstName: string | null;

    @Field({ nullable: true })
    Salutation: string | null;

    @Field({ nullable: true })
    Type: string | null;

    @Field({ nullable: true })
    RecordTypeId: string | null;

    @Field({ nullable: true })
    ParentId: string | null;

    @Field({ nullable: true })
    BillingStreet: string | null;

    @Field({ nullable: true })
    BillingCity: string | null;

    @Field({ nullable: true })
    BillingState: string | null;

    @Field({ nullable: true })
    BillingPostalCode: string | null;

    @Field({ nullable: true })
    BillingCountry: string | null;

    @Field(() => Float, { nullable: true })
    BillingLatitude: number | null;

    @Field(() => Float, { nullable: true })
    BillingLongitude: number | null;

    @Field({ nullable: true })
    BillingGeocodeAccuracy: string | null;

    @Field({ nullable: true })
    ShippingStreet: string | null;

    @Field({ nullable: true })
    ShippingCity: string | null;

    @Field({ nullable: true })
    ShippingState: string | null;

    @Field({ nullable: true })
    ShippingPostalCode: string | null;

    @Field({ nullable: true })
    ShippingCountry: string | null;

    @Field(() => Float, { nullable: true })
    ShippingLatitude: number | null;

    @Field(() => Float, { nullable: true })
    ShippingLongitude: number | null;

    @Field({ nullable: true })
    ShippingGeocodeAccuracy: string | null;

    @Field({ nullable: true })
    Phone: string | null;

    @Field({ nullable: true })
    Fax: string | null;

    @Field({ nullable: true })
    AccountNumber: string | null;

    @Field({ nullable: true })
    Website: string | null;

    @Field({ nullable: true })
    PhotoUrl: string | null;

    @Field({ nullable: true })
    Sic: string | null;

    @Field({ nullable: true })
    Industry: string | null;

    @Field(() => Float, { nullable: true })
    AnnualRevenue: number | null;

    @Field(() => Int, { nullable: true })
    NumberOfEmployees: number | null;

    @Field({ nullable: true })
    Ownership: string | null;

    @Field({ nullable: true })
    TickerSymbol: string | null;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    Rating: string | null;

    @Field({ nullable: true })
    Site: string | null;

    @Field({ nullable: true })
    OwnerId: string | null;

    @Field({ nullable: true })
    CreatedById: string | null;

    @Field({ nullable: true })
    LastModifiedById: string | null;

    @Field(() => Boolean, { nullable: true })
    IsPartner: boolean | null;

    @Field(() => Boolean, { nullable: true })
    IsCustomerPortal: boolean | null;

    @Field({ nullable: true })
    PersonContactId: string | null;

    @Field(() => Boolean, { nullable: true })
    IsPersonAccount: boolean | null;

    @Field({ nullable: true })
    ChannelProgramName: string | null;

    @Field({ nullable: true })
    ChannelProgramLevelName: string | null;

    @Field({ nullable: true })
    PersonMailingStreet: string | null;

    @Field({ nullable: true })
    PersonMailingCity: string | null;

    @Field({ nullable: true })
    PersonMailingState: string | null;

    @Field({ nullable: true })
    PersonMailingPostalCode: string | null;

    @Field({ nullable: true })
    PersonMailingCountry: string | null;

    @Field(() => Float, { nullable: true })
    PersonMailingLatitude: number | null;

    @Field(() => Float, { nullable: true })
    PersonMailingLongitude: number | null;

    @Field({ nullable: true })
    PersonMailingGeocodeAccuracy: string | null;

    @Field({ nullable: true })
    PersonOtherStreet: string | null;

    @Field({ nullable: true })
    PersonOtherCity: string | null;

    @Field({ nullable: true })
    PersonOtherState: string | null;

    @Field({ nullable: true })
    PersonOtherPostalCode: string | null;

    @Field({ nullable: true })
    PersonOtherCountry: string | null;

    @Field(() => Float, { nullable: true })
    PersonOtherLatitude: number | null;

    @Field(() => Float, { nullable: true })
    PersonOtherLongitude: number | null;

    @Field({ nullable: true })
    PersonOtherGeocodeAccuracy: string | null;

    @Field({ nullable: true })
    PersonMobilePhone: string | null;

    @Field({ nullable: true })
    PersonHomePhone: string | null;

    @Field({ nullable: true })
    PersonOtherPhone: string | null;

    @Field({ nullable: true })
    PersonAssistantPhone: string | null;

    @Field({ nullable: true })
    PersonEmail: string | null;

    @Field({ nullable: true })
    PersonTitle: string | null;

    @Field({ nullable: true })
    PersonDepartment: string | null;

    @Field({ nullable: true })
    PersonAssistantName: string | null;

    @Field({ nullable: true })
    PersonLeadSource: string | null;

    @Field(() => Boolean, { nullable: true })
    PersonHasOptedOutOfEmail: boolean | null;

    @Field(() => Boolean, { nullable: true })
    PersonHasOptedOutOfFax: boolean | null;

    @Field(() => Boolean, { nullable: true })
    PersonDoNotCall: boolean | null;

    @Field({ nullable: true })
    PersonEmailBouncedReason: string | null;

    @Field({ nullable: true })
    PersonIndividualId: string | null;

    @Field({ nullable: true })
    Jigsaw: string | null;

    @Field({ nullable: true })
    JigsawCompanyId: string | null;

    @Field({ nullable: true })
    AccountSource: string | null;

    @Field({ nullable: true })
    SicDesc: string | null;

    @Field(() => Float, { nullable: true })
    NU__AccountBalance__c: number | null;

    @Field({ nullable: true })
    NU__AccountID__c: string | null;

    @Field(() => Float, { nullable: true })
    NU__AccountMoneySpent__c: number | null;

    @Field({ nullable: true })
    NU__CasualName__c: string | null;

    @Field({ nullable: true })
    NU__CommunicationPreference__c: string | null;

    @Field(() => Boolean, { nullable: true })
    NU__CopyFromMailingToBilling__c: boolean | null;

    @Field(() => Boolean, { nullable: true })
    NU__CopyFromMailingToOther__c: boolean | null;

    @Field(() => Boolean, { nullable: true })
    NU__CopyFromMailingToShipping__c: boolean | null;

    @Field(() => Boolean, { nullable: true })
    NU__CopyFromPrimaryAffiliationBilling__c: boolean | null;

    @Field({ nullable: true })
    NU__Designation__c: string | null;

    @Field({ nullable: true })
    NU__Ethnicity__c: string | null;

    @Field({ nullable: true })
    NU__ExternalID__c: string | null;

    @Field({ nullable: true })
    NU__FacebookAccount__c: string | null;

    @Field({ nullable: true })
    NU__FullName__c: string | null;

    @Field({ nullable: true })
    NU__Gender__c: string | null;

    @Field({ nullable: true })
    NU__Lapsed__c: string | null;

    @Field({ nullable: true })
    NU__LegacyID__c: string | null;

    @Field({ nullable: true })
    NU__LinkedInAccount__c: string | null;

    @Field(() => Boolean, { nullable: true })
    NU__MarkForDelete__c: boolean | null;

    @Field({ nullable: true })
    NU__Member__c: string | null;

    @Field({ nullable: true })
    NU__MembershipType__c: string | null;

    @Field({ nullable: true })
    NU__Membership__c: string | null;

    @Field({ nullable: true })
    NU__MiddleName__c: string | null;

    @Field({ nullable: true })
    NU__OtherEmail__c: string | null;

    @Field({ nullable: true })
    NU__OtherFax__c: string | null;

    @Field({ nullable: true })
    NU__PasswordHash__c: string | null;

    @Field({ nullable: true })
    NU__PasswordSalt__c: string | null;

    @Field({ nullable: true })
    NU__PersonAccountData__c: string | null;

    @Field({ nullable: true })
    NU__PersonContact__c: string | null;

    @Field({ nullable: true })
    NU__PersonEmail__c: string | null;

    @Field({ nullable: true })
    NU__PrimaryAffiliation__c: string | null;

    @Field({ nullable: true })
    NU__PrimaryEntity__c: string | null;

    @Field({ nullable: true })
    NU__RecordTypeName__c: string | null;

    @Field({ nullable: true })
    NU__RecoveryAnswer1__c: string | null;

    @Field({ nullable: true })
    NU__RecoveryAnswer2__c: string | null;

    @Field({ nullable: true })
    NU__RecoveryAnswer3__c: string | null;

    @Field({ nullable: true })
    NU__RecoveryQuestion1__c: string | null;

    @Field({ nullable: true })
    NU__RecoveryQuestion2__c: string | null;

    @Field({ nullable: true })
    NU__RecoveryQuestion3__c: string | null;

    @Field({ nullable: true })
    NU__SecurityGroup__c: string | null;

    @Field({ nullable: true })
    NU__StatusMembershipFlag__c: string | null;

    @Field({ nullable: true })
    NU__StatusMembership__c: string | null;

    @Field({ nullable: true })
    NU__Status__c: string | null;

    @Field({ nullable: true })
    NU__Suffix__c: string | null;

    @Field({ nullable: true })
    NU__TaxExemptId__c: string | null;

    @Field(() => Boolean, { nullable: true })
    NU__TaxExempt__c: boolean | null;

    @Field(() => Float, { nullable: true })
    NU__TotalAffiliateBalance__c: number | null;

    @Field(() => Float, { nullable: true })
    NU__TotalAffiliateMoneySpent__c: number | null;

    @Field({ nullable: true })
    NU__TwitterAccount__c: string | null;

    @Field({ nullable: true })
    NU__Username__c: string | null;

    @Field({ nullable: true })
    NU__ValidEmailDomains__c: string | null;

    @Field({ nullable: true })
    Pay_Type__c: string | null;

    @Field(() => Boolean, { nullable: true })
    No_CTA__c: boolean | null;

    @Field(() => Float, { nullable: true })
    Certified_CTA_Dues__c: number | null;

    @Field(() => Boolean, { nullable: true })
    Refund_to_Individual__c: boolean | null;

    @Field({ nullable: true })
    Student_year__c: string | null;

    @Field(() => Boolean, { nullable: true })
    Fellowship_program__c: boolean | null;

    @Field(() => Boolean, { nullable: true })
    Student_teach__c: boolean | null;

    @Field(() => Boolean, { nullable: true })
    Member_of_FTA__c: boolean | null;

    @Field({ nullable: true })
    Grade_Level__c: string | null;

    @Field({ nullable: true })
    NU__PrimaryAffiliationRecord__c: string | null;

    @Field({ nullable: true })
    Is_certified__c: string | null;

    @Field({ nullable: true })
    Account_Owner_Data_Processing__c: string | null;

    @Field({ nullable: true })
    AccrualDues__c: string | null;

    @Field({ nullable: true })
    DESE_Key__c: string | null;

    @Field({ nullable: true })
    SSN_Last_4__c: string | null;

    @Field({ nullable: true })
    CTA_Number__c: string | null;

    @Field({ nullable: true })
    CloudingoAgent__BAR__c: string | null;

    @Field({ nullable: true })
    Membership_Product_Name__c: string | null;

    @Field({ nullable: true })
    Beneficiary__c: string | null;

    @Field(() => Boolean, { nullable: true })
    Exclude_Directory__c: boolean | null;

    @Field({ nullable: true })
    NU__PrimaryContactEmail__c: string | null;

    @Field({ nullable: true })
    Previous_Last_Name__c: string | null;

    @Field(() => Boolean, { nullable: true })
    Collect_Student_Chapter_Dues__c: boolean | null;

    @Field({ nullable: true })
    Contact_if_problems__c: string | null;

    @Field(() => Boolean, { nullable: true })
    Display_CTA_Dues__c: boolean | null;

    @Field({ nullable: true })
    Payroll_deduction_through__c: string | null;

    @Field({ nullable: true })
    CTA_Priority__c: string | null;

    @Field(() => Boolean, { nullable: true })
    Easy_Renewal__c: boolean | null;

    @Field({ nullable: true })
    Contact_Account_del__c: string | null;

    @Field({ nullable: true })
    Member_Id__c: string | null;

    @Field({ nullable: true })
    School_District_Account__c: string | null;

    @Field(() => Boolean, { nullable: true })
    MSTA_Action__c: boolean | null;

    @Field(() => Boolean, { nullable: true })
    No_outside_solicitation__c: boolean | null;

    @Field(() => Boolean, { nullable: true })
    No_Magazine__c: boolean | null;

    @Field(() => Boolean, { nullable: true })
    Opt_out_of_all_MSTA_mail__c: boolean | null;

    @Field({ nullable: true })
    Beneficiary_Relation__c: string | null;

    @Field(() => Boolean, { nullable: true })
    Opt_out_of_all_MSTA_Email__c: boolean | null;

    @Field({ nullable: true })
    Content_Area__c: string | null;

    @Field({ nullable: true })
    NU__PrimaryContactName__c: string | null;

    @Field({ nullable: true })
    NU__PrimaryLocationQualityCode__c: string | null;

    @Field(() => Float, { nullable: true })
    NU__PrimaryLocation__Latitude__s: number | null;

    @Field(() => Float, { nullable: true })
    NU__PrimaryLocation__Longitude__s: number | null;

    @Field({ nullable: true })
    Region__c: string | null;

    @Field({ nullable: true })
    Institution__c: string | null;

    @Field({ nullable: true })
    Work_Phone__c: string | null;

    @Field(() => Boolean, { nullable: true })
    Deceased__c: boolean | null;

    @Field(() => Boolean, { nullable: true })
    Expelled__c: boolean | null;

    @Field({ nullable: true })
    Legacy_Customer_Type__c: string | null;

    @Field({ nullable: true })
    Future_Member_Type__c: string | null;

    @Field(() => Boolean, { nullable: true })
    Future_Member__c: boolean | null;

    @Field({ nullable: true })
    Future_Pay_Type__c: string | null;

    @Field({ nullable: true })
    Future_Product_Type__c: string | null;

    @Field({ nullable: true })
    Future_Status__c: string | null;

    @Field({ nullable: true })
    New_Member_Type__c: string | null;

    @Field(() => Boolean, { nullable: true })
    New_Member__c: boolean | null;

    @Field({ nullable: true })
    New_Product_Type__c: string | null;

    @Field(() => Boolean, { nullable: true })
    Suspend__c: boolean | null;

    @Field(() => Boolean, { nullable: true })
    UnmatchedBalances__c: boolean | null;

    @Field(() => Boolean, { nullable: true })
    Test_Owner_Matches_Parent__c: boolean | null;

    @Field({ nullable: true })
    Institution_CTA_Number__c: string | null;

    @Field({ nullable: true })
    Marketing_Label__c: string | null;

    @Field({ nullable: true })
    Future_Marketing_Label__c: string | null;

    @Field({ nullable: true })
    InstitutionId__c: string | null;

    @Field(() => Boolean, { nullable: true })
    Easy_Renewal_Complete__c: boolean | null;

    @Field({ nullable: true })
    Remove_Reason__c: string | null;

    @Field({ nullable: true })
    MobileAdmin__c: string | null;

    @Field({ nullable: true })
    MobileDirectoryActive__c: string | null;

    @Field({ nullable: true })
    MobileInfo__c: string | null;

    @Field({ nullable: true })
    Future_Renewal_Notice_Code__c: string | null;

    @Field({ nullable: true })
    NU__PrimaryContact__c: string | null;

    @Field(() => Boolean, { nullable: true })
    NU__UpdatePrimaryLocation__c: boolean | null;

    @Field({ nullable: true })
    Alternate_Work_Phone__c: string | null;

    @Field({ nullable: true })
    School_Address__c: string | null;

    @Field({ nullable: true })
    School_City_F__c: string | null;

    @Field({ nullable: true })
    School_Country_F__c: string | null;

    @Field({ nullable: true })
    School_StateProvince__c: string | null;

    @Field({ nullable: true })
    School_Street__c: string | null;

    @Field({ nullable: true })
    School_ZipPostal_Code__c: string | null;

    @Field({ nullable: true })
    Student_At_School_Address_Line_1__c: string | null;

    @Field({ nullable: true })
    Student_At_School_Address_Line_2__c: string | null;

    @Field({ nullable: true })
    Student_At_School_Address_Line_3__c: string | null;

    @Field({ nullable: true })
    Student_At_School_City__c: string | null;

    @Field({ nullable: true })
    Student_At_School_Country__c: string | null;

    @Field({ nullable: true })
    Student_At_School_PostalCode__c: string | null;

    @Field({ nullable: true })
    Student_At_School_State__c: string | null;

    @Field({ nullable: true })
    Student_At_School_Street__c: string | null;

    @Field({ nullable: true })
    Student_At_School__c: string | null;

    @Field({ nullable: true })
    Use_for_Billing__c: string | null;

    @Field({ nullable: true })
    Use_for_Mailing__c: string | null;

    @Field({ nullable: true })
    Use_for_Shipping__c: string | null;

    @Field({ nullable: true })
    Future_Product_List_Price__c: string | null;

    @Field(() => Float, { nullable: true })
    Chapter_Dues_Amount__c: number | null;

    @Field({ nullable: true })
    MSTA_Legacy_Customer_Type__c: string | null;

    @Field({ nullable: true })
    Renewal_Forms_Sort__c: string | null;

    @Field({ nullable: true })
    State_House_District__c: string | null;

    @Field({ nullable: true })
    State_Senate_District__c: string | null;

    @Field(() => Float, { nullable: true })
    NU__CreditBalance__c: number | null;

    @Field({ nullable: true })
    Abbreviation__c: string | null;

    @Field({ nullable: true })
    Previous_Acct_Owner__c: string | null;

    @Field({ nullable: true })
    County__c: string | null;

    @Field({ nullable: true })
    Alt_Contact_Account_del__c: string | null;

    @Field(() => Float, { nullable: true })
    Net_Promoter_Score__c: number | null;

    @Field(() => Float, { nullable: true })
    NU__TotalAffiliatedAccounts__c: number | null;

    @Field({ nullable: true })
    Respondent_Comments__c: string | null;

    @Field({ nullable: true })
    NU__FullNameOverride__c: string | null;

    @Field(() => Float, { nullable: true })
    Birthday_Day__c: number | null;

    @Field(() => Boolean, { nullable: true })
    Non_member_Opt_In__c: boolean | null;

    @Field(() => Boolean, { nullable: true })
    NU__Trusted__c: boolean | null;

    @Field(() => Boolean, { nullable: true })
    NC__AccountCreatedThroughSocialSignOn__c: boolean | null;

    @Field(() => Boolean, { nullable: true })
    NC__AccountDoesNotHavePassword__c: boolean | null;

    @Field({ nullable: true })
    Expected_Graduation_Month__c: string | null;

    @Field({ nullable: true })
    Expected_Graduation_Year__c: string | null;

    @Field({ nullable: true })
    geopointe__Geocode__c: string | null;

    @Field({ nullable: true })
    NU__ProfileImageRevisionId__c: string | null;

    @Field({ nullable: true })
    NU__ProfileImageURL__c: string | null;

    @Field({ nullable: true })
    NU__ProfileImage__c: string | null;

    @Field(() => Boolean, { nullable: true })
    NU__SandboxEnabled__c: boolean | null;

    @Field({ nullable: true })
    NPS_Year__c: string | null;

    @Field({ nullable: true })
    NPS_Response_Label__c: string | null;

    @Field({ nullable: true })
    AgencyUsedforFoodService__c: string | null;

    @Field({ nullable: true })
    NPFollowupComments__c: string | null;

    @Field({ nullable: true })
    AgencyusedforSubstitutes__c: string | null;

    @Field(() => Float, { nullable: true })
    School_Building_Number__c: number | null;

    @Field({ nullable: true })
    AgencyusedforCustodialServices__c: string | null;

    @Field({ nullable: true })
    CollectiveBargaining__c: string | null;

    @Field({ nullable: true })
    ContractforCustodial__c: string | null;

    @Field({ nullable: true })
    ContractforFoodService__c: string | null;

    @Field({ nullable: true })
    ContractforSubstitutes__c: string | null;

    @Field({ nullable: true })
    rrpu__Alert_Message__c: string | null;

    @Field(() => Float, { nullable: true })
    CloudingoAgent__BAS__c: number | null;

    @Field({ nullable: true })
    CloudingoAgent__BAV__c: string | null;

    @Field({ nullable: true })
    CloudingoAgent__BRDI__c: string | null;

    @Field({ nullable: true })
    CloudingoAgent__BTZ__c: string | null;

    @Field({ nullable: true })
    CloudingoAgent__SAR__c: string | null;

    @Field(() => Float, { nullable: true })
    CloudingoAgent__SAS__c: number | null;

    @Field({ nullable: true })
    CloudingoAgent__SAV__c: string | null;

    @Field({ nullable: true })
    CloudingoAgent__SRDI__c: string | null;

    @Field({ nullable: true })
    CloudingoAgent__STZ__c: string | null;

    @Field({ nullable: true })
    LongFormID__c: string | null;

    @Field({ nullable: true })
    InstitutionLongID__c: string | null;

    @Field(() => Boolean, { nullable: true })
    BillHighway__c: boolean | null;

    @Field(() => Boolean, { nullable: true })
    NoPacket__c: boolean | null;

    @Field({ nullable: true })
    YourMembershipType__c: string | null;

    @Field({ nullable: true })
    YourProductType__c: string | null;

    @Field(() => Float, { nullable: true })
    NumCurrentYearMemberships__c: number | null;

    @Field(() => Boolean, { nullable: true })
    DoNotSendMembershipCard__c: boolean | null;

    @Field({ nullable: true })
    BillHighwayStatus__c: string | null;

    @Field({ nullable: true })
    NU__MemberOverride__c: string | null;

    @Field(() => Float, { nullable: true })
    qualtrics__Net_Promoter_Score__c: number | null;

    @Field({ nullable: true })
    NPHowCanWeImprove__c: string | null;

    @Field(() => Boolean, { nullable: true })
    NPFollowup__c: boolean | null;

    @Field({ nullable: true })
    NPEmail__c: string | null;

    @Field({ nullable: true })
    District_Attorney__c: string | null;

    @Field(() => Boolean, { nullable: true })
    Email_Opt_in_Weekly_Bytes__c: boolean | null;

    @Field(() => Boolean, { nullable: true })
    MNEA_LM_1_Filed__c: boolean | null;

    @Field({ nullable: true })
    MSTA_LM_1_Filed__c: string | null;

    @Field(() => Boolean, { nullable: true })
    Email_Opt_in_Events__c: boolean | null;

    @Field(() => Boolean, { nullable: true })
    Email_Opt_in_Action__c: boolean | null;

    @Field(() => Boolean, { nullable: true })
    Email_Opt_in_News__c: boolean | null;

    @Field(() => Boolean, { nullable: true })
    Email_Opt_in_Leaders__c: boolean | null;

    @Field(() => Boolean, { nullable: true })
    Email_Opt_in_Partners__c: boolean | null;

    @Field({ nullable: true })
    CurrentFiscalYear__c: string | null;

    @Field({ nullable: true })
    InsuranceCoverageDates__c: string | null;

    @Field({ nullable: true })
    Membership_Year__c: string | null;

    @Field({ nullable: true })
    TodaysDate__c: string | null;

    @Field(() => Boolean, { nullable: true })
    IsStudent__c: boolean | null;

    @Field({ nullable: true })
    PreferredAddress__c: string | null;

    @Field({ nullable: true })
    ChMemberType__c: string | null;

    @Field(() => Boolean, { nullable: true })
    Known_Bad_Home_Address__c: boolean | null;

    @Field(() => Boolean, { nullable: true })
    ACH_Agreement_On_File__c: boolean | null;

    @Field(() => Boolean, { nullable: true })
    MSTA_Collecting_CTA_Dues__c: boolean | null;

    @Field({ nullable: true })
    Region_Abbreviation__c: string | null;

    @Field(() => Float, { nullable: true })
    Chapter_Dues__c: number | null;

    @Field({ nullable: true })
    Recruited_By__c: string | null;

    @Field({ nullable: true })
    Duplicate_Key__c: string | null;

    @Field({ nullable: true })
    Position__c: string | null;

    @Field(() => Boolean, { nullable: true })
    PSRS_Petition__c: boolean | null;

    @Field(() => Float, { nullable: true })
    CTA_Dues_Amount_to_Display_on_Renewal__c: number | null;

    @Field(() => Float, { nullable: true })
    Non_certified_CTA_Dues__c: number | null;

    @Field(() => Float, { nullable: true })
    DESKSCMT__Desk_Company_Id__c: number | null;

    @Field(() => Float, { nullable: true })
    P2A__Advocate_ID__c: number | null;

    @Field({ nullable: true })
    P2A__City_District__c: string | null;

    @Field({ nullable: true })
    P2A__County__c: string | null;

    @Field({ nullable: true })
    P2A__Federal_House_District__c: string | null;

    @Field({ nullable: true })
    P2A__State_House_District__c: string | null;

    @Field({ nullable: true })
    P2A__State_Senate_District__c: string | null;

    @Field(() => Boolean, { nullable: true })
    P2A__Synced__c: boolean | null;

    @Field(() => Boolean, { nullable: true })
    DESKSCMT__Desk_Migrated_Account__c: boolean | null;

    @Field(() => Float, { nullable: true })
    Desk_Id__c: number | null;

    @Field(() => Boolean, { nullable: true })
    NU__IsMemberFlag__c: boolean | null;

    @Field({ nullable: true })
    Field_Rep_Number__c: string | null;

    @Field(() => Boolean, { nullable: true })
    No_DocuSign__c: boolean | null;

    @Field({ nullable: true })
    DocuSignCurrentBuilding__c: string | null;

    @Field({ nullable: true })
    bg_Docusign_Job__c: string | null;

    @Field({ nullable: true })
    envelope_event__c: string | null;

    @Field({ nullable: true })
    envelope_id__c: string | null;

    @Field({ nullable: true })
    envelope_status_value__c: string | null;

    @Field({ nullable: true })
    envelope_template_id__c: string | null;

    @Field({ nullable: true })
    Envelope_Email_Body__c: string | null;

    @Field({ nullable: true })
    Envelope_Email_Subject_Line__c: string | null;

    @Field(() => Boolean, { nullable: true })
    Resigned__c: boolean | null;

    @Field(() => Float, { nullable: true })
    Membership_Dues__c: number | null;

    @Field({ nullable: true })
    Reason_for_Resigning__c: string | null;

    @Field({ nullable: true })
    Schedule__c: string | null;

    @Field({ nullable: true })
    Schedule_Type__c: string | null;

    @Field({ nullable: true })
    Schedule_Stage__c: string | null;

    @Field({ nullable: true })
    DocuSign_Status__c: string | null;

    @Field(() => Boolean, { nullable: true })
    Membership_Pending__c: boolean | null;

    @Field({ nullable: true })
    Duplicate_Key_Fname_DOB_Zip_Addr__c: string | null;

    @Field({ nullable: true })
    Duplicate_Key_fname_DOB_Last4__c: string | null;

    @Field({ nullable: true })
    Duplicate_Key_fname_DOB_Last4_formula__c: string | null;

    @Field({ nullable: true })
    Duplicate_Key_fname_DOB_Zip__c: string | null;

    @Field({ nullable: true })
    Duplicate_Key_fname_DOB__c: string | null;

    @Field({ nullable: true })
    Duplicate_Key_fname_Last4_Zip__c: string | null;

    @Field({ nullable: true })
    Duplicate_Key_fname_Last4__c: string | null;

    @Field({ nullable: true })
    Duplicate_Key_fname_temp__c: string | null;

    @Field({ nullable: true })
    Resolve_Concurrent_Membership_B4_Merging__c: string | null;

    @Field({ nullable: true })
    fname__c: string | null;

    @Field(() => Boolean, { nullable: true })
    is_master_Fname_DOB_Last4SSN__c: boolean | null;

    @Field(() => Boolean, { nullable: true })
    is_master_Fname_DOB_Zip_AddrOrPhone__c: boolean | null;

    @Field(() => Boolean, { nullable: true })
    is_master_Fname_DOB_Zip_Addr__c: boolean | null;

    @Field(() => Boolean, { nullable: true })
    is_master_Fname_DOB_Zip__c: boolean | null;

    @Field(() => Boolean, { nullable: true })
    is_master_Fname_Last4SSN_Zip__c: boolean | null;

    @Field({ nullable: true })
    masterID_ref_fname_DOB_Last4__c: string | null;

    @Field({ nullable: true })
    masterID_ref_fname_DOB_Zip_AddrOrPhone__c: string | null;

    @Field({ nullable: true })
    masterID_ref_fname_DOB_Zip_Addr__c: string | null;

    @Field({ nullable: true })
    masterID_ref_fname_DOB_Zip__c: string | null;

    @Field({ nullable: true })
    masterID_ref_fname_Last4_Zip__c: string | null;

    @Field({ nullable: true })
    matching_key_Fname_DOB_Last4SSN__c: string | null;

    @Field({ nullable: true })
    matching_key_Fname_DOB_Zip__c: string | null;

    @Field({ nullable: true })
    matching_key_Fname_Last4SSN_Zip__c: string | null;

    @Field(() => Float, { nullable: true })
    Number_of_Payroll_Payments__c: number | null;

    @Field({ nullable: true })
    New_Building_from_DocuSign__c: string | null;

    @Field(() => Boolean, { nullable: true })
    qtr1_cta_dues_processed__c: boolean | null;

    @Field(() => Float, { nullable: true })
    qtr1_dues_pending_pmnt_to_institution__c: number | null;

    @Field(() => Float, { nullable: true })
    qtr1_dues_processed_pmnt_to_institution__c: number | null;

    @Field(() => Float, { nullable: true })
    qtr1_new_dues_to_pay_to_institution__c: number | null;

    @Field(() => Boolean, { nullable: true })
    qtr2_cta_dues_processed__c: boolean | null;

    @Field(() => Float, { nullable: true })
    qtr2_dues_pending_pmnt_to_institution__c: number | null;

    @Field(() => Float, { nullable: true })
    qtr2_dues_processed_pmnt_to_institution__c: number | null;

    @Field(() => Float, { nullable: true })
    qtr2_new_dues_to_pay_to_institution__c: number | null;

    @Field(() => Boolean, { nullable: true })
    qtr3_cta_dues_processed__c: boolean | null;

    @Field(() => Float, { nullable: true })
    qtr3_dues_pending_pmnt_to_institution__c: number | null;

    @Field(() => Float, { nullable: true })
    qtr3_dues_processed_pmnt_to_institution__c: number | null;

    @Field(() => Float, { nullable: true })
    qtr3_new_dues_to_pay_to_institution__c: number | null;

    @Field(() => Boolean, { nullable: true })
    qtr4_cta_dues_processed__c: boolean | null;

    @Field(() => Float, { nullable: true })
    qtr4_dues_pending_pmnt_to_institution__c: number | null;

    @Field(() => Float, { nullable: true })
    qtr4_dues_processed_pmnt_to_institution__c: number | null;

    @Field(() => Float, { nullable: true })
    qtr4_new_dues_to_pay_to_institution__c: number | null;

    @Field(() => Float, { nullable: true })
    txs_dues_pending_pmnt_to_institution__c: number | null;

    @Field(() => Float, { nullable: true })
    txs_dues_processed_pmnt_to_institution__c: number | null;

    @Field(() => Float, { nullable: true })
    DocuSign_Entered_CTA_Dues__c: number | null;

    @Field({ nullable: true })
    Highest_Level_of_Education__c: string | null;

    @Field({ nullable: true })
    Anticipated_Retirement_Year__c: string | null;

    @Field({ nullable: true })
    Associate_Job_Category__c: string | null;

    @Field(() => Boolean, { nullable: true })
    Billing_Address_Override__c: boolean | null;

    @Field(() => Boolean, { nullable: true })
    Mailing_Address_Override__c: boolean | null;

    @Field(() => Boolean, { nullable: true })
    Exempt_from_Book_Studies__c: boolean | null;

    @Field(() => Float, { nullable: true })
    Dues_Balance__c: number | null;

    @Field({ nullable: true })
    Paying_CTA_Dues_Thru_MSTA__c: string | null;

    @Field({ nullable: true })
    Simple_Pay_Type__c: string | null;

    @Field({ nullable: true })
    ConsentItem__c: string | null;

    @Field({ nullable: true })
    UltimateId__c: string | null;

    @Field(() => Boolean, { nullable: true })
    AllowPayroll__c: boolean | null;

    @Field(() => Float, { nullable: true })
    Number_of_Payroll_Deductions__c: number | null;

    @Field({ nullable: true })
    Home_Phone_Type__c: string | null;

    @Field({ nullable: true })
    Mobile_Type__c: string | null;

    @Field({ nullable: true })
    namz__AssignmentRule__c: string | null;

    @Field({ nullable: true })
    namz__PrimaryAffiliation__c: string | null;

    @Field(() => Boolean, { nullable: true })
    Known_Bad_Home_Phone__c: boolean | null;

    @Field(() => Boolean, { nullable: true })
    Known_Bad_Mobile__c: boolean | null;

    @Field(() => Boolean, { nullable: true })
    NU__ExcludeFromAffiliationSearch__c: boolean | null;

    @Field(() => Boolean, { nullable: true })
    Home_Phone_Is_Valid__c: boolean | null;

    @Field(() => Boolean, { nullable: true })
    Mobile_Is_Valid__c: boolean | null;

    @Field(() => Boolean, { nullable: true })
    HomePhoneVerifiedCurrFiscal__c: boolean | null;

    @Field(() => Boolean, { nullable: true })
    MobileVerifiedCurrFiscal__c: boolean | null;

    @Field({ nullable: true })
    NU__ExternalID__pc: string | null;

    @Field({ nullable: true })
    ET_Field_Rep__pc: string | null;

    @Field({ nullable: true })
    Deskcom__twitter_username__pc: string | null;

    @Field({ nullable: true })
    e4sf__Engage_Address_City__pc: string | null;

    @Field({ nullable: true })
    e4sf__Engage_Address_Country__pc: string | null;

    @Field({ nullable: true })
    e4sf__Engage_Address_PostalCode__pc: string | null;

    @Field({ nullable: true })
    e4sf__Engage_Address_State__pc: string | null;

    @Field({ nullable: true })
    e4sf__Engage_Address_Street__pc: string | null;

    @Field({ nullable: true })
    e4sf__Engage_Batch_Id__pc: string | null;

    @Field({ nullable: true })
    e4sf__Engage_Ext_Id__pc: string | null;

    @Field({ nullable: true })
    e4sf__Engage_Federal_District_Lower_Chamber__pc: string | null;

    @Field({ nullable: true })
    e4sf__Engage_Federal_District_Upper_Chamber__pc: string | null;

    @Field(() => Boolean, { nullable: true })
    e4sf__Engage_Is_Advocate__pc: boolean | null;

    @Field(() => Boolean, { nullable: true })
    e4sf__Engage_Never_Sync_To_Engage__pc: boolean | null;

    @Field(() => Boolean, { nullable: true })
    e4sf__Engage_Opt_Out__pc: boolean | null;

    @Field({ nullable: true })
    e4sf__Engage_Phone__pc: string | null;

    @Field({ nullable: true })
    e4sf__Engage_State_District_Lower_Chamber__pc: string | null;

    @Field({ nullable: true })
    e4sf__Engage_State_District_Upper_Chamber__pc: string | null;

    @Field({ nullable: true })
    geopointe__Geocode__pc: string | null;

    @Field({ nullable: true })
    rrpu__Alert_Message__pc: string | null;

    @Field(() => Float, { nullable: true })
    CloudingoAgent__CES__pc: number | null;

    @Field({ nullable: true })
    CloudingoAgent__MAR__pc: string | null;

    @Field(() => Float, { nullable: true })
    CloudingoAgent__MAS__pc: number | null;

    @Field({ nullable: true })
    CloudingoAgent__MAV__pc: string | null;

    @Field({ nullable: true })
    CloudingoAgent__MRDI__pc: string | null;

    @Field({ nullable: true })
    CloudingoAgent__MTZ__pc: string | null;

    @Field({ nullable: true })
    CloudingoAgent__OAR__pc: string | null;

    @Field(() => Float, { nullable: true })
    CloudingoAgent__OAS__pc: number | null;

    @Field({ nullable: true })
    CloudingoAgent__OAV__pc: string | null;

    @Field({ nullable: true })
    CloudingoAgent__ORDI__pc: string | null;

    @Field({ nullable: true })
    CloudingoAgent__OTZ__pc: string | null;

    @Field(() => Boolean, { nullable: true })
    NC_DPP__Anonymize__pc: boolean | null;

    @Field(() => Boolean, { nullable: true })
    NC_DPP__Consented__pc: boolean | null;

    @Field({ nullable: true })
    NU__Biography__pc: string | null;

    @Field({ nullable: true })
    NU__Degrees__pc: string | null;

    @Field({ nullable: true })
    NU__DoctoralInstitution__pc: string | null;

    @Field({ nullable: true })
    NU__Expertise__pc: string | null;

    @Field({ nullable: true })
    NU__GraduateInstitution__pc: string | null;

    @Field({ nullable: true })
    NU__Interests__pc: string | null;

    @Field({ nullable: true })
    NU__UndergraduateInstitution__pc: string | null;

    @Field(() => Boolean, { nullable: true })
    et4ae5__HasOptedOutOfMobile__pc: boolean | null;

    @Field({ nullable: true })
    et4ae5__Mobile_Country_Code__pc: string | null;

    @Field(() => Boolean, { nullable: true })
    qualtrics__Informed_Consent__pc: boolean | null;

    @Field(() => Float, { nullable: true })
    qualtrics__Net_Promoter_Score__pc: number | null;

    @Field(() => Boolean, { nullable: true })
    is_eligible_for_SFMC_sync__pc: boolean | null;

    @Field({ nullable: true })
    Long_Form_ID__pc: string | null;

    @Field({ nullable: true })
    Institution__pc: string | null;

    @Field({ nullable: true })
    Member__pc: string | null;

    @Field(() => Boolean, { nullable: true })
    Eligible_For_SFMC_Sync__pc: boolean | null;

    @Field(() => Float, { nullable: true })
    DESKSCMT__Desk_Customer_Id__pc: number | null;

    @Field(() => Boolean, { nullable: true })
    DESKSCMT__Desk_Migrated_Contact__pc: boolean | null;

    @Field({ nullable: true })
    title__pc: string | null;

    @Field(() => Float, { nullable: true })
    P2A__Advocate_ID__pc: number | null;

    @Field({ nullable: true })
    P2A__City_District__pc: string | null;

    @Field({ nullable: true })
    P2A__County__pc: string | null;

    @Field({ nullable: true })
    P2A__Federal_House_District__pc: string | null;

    @Field(() => Boolean, { nullable: true })
    P2A__Phone2Action_Email_Optin__pc: boolean | null;

    @Field({ nullable: true })
    P2A__State_House_District__pc: string | null;

    @Field({ nullable: true })
    P2A__State_Senate_District__pc: string | null;

    @Field(() => Boolean, { nullable: true })
    P2A__Synced__pc: boolean | null;

    @Field({ nullable: true })
    external_id__pc: string | null;

    @Field({ nullable: true })
    background__pc: string | null;

    @Field({ nullable: true })
    language__pc: string | null;

    @Field(() => Boolean, { nullable: true })
    access_private_portal__pc: boolean | null;

    @Field(() => Boolean, { nullable: true })
    access_company_cases__pc: boolean | null;

    @Field(() => Float, { nullable: true })
    Desk_Id__pc: number | null;

    @Field({ nullable: true })
    rcsfl__SMS_Number__pc: string | null;

    @Field({ nullable: true })
    rcsfl__SendSMS__pc: string | null;

    @Field({ nullable: true })
    Troubleshoot: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Accounts
//****************************************************************************
@InputType()
export class UpdateAccountInput {
    @Field()
    Id: string;

    @Field(() => Boolean, { nullable: true })
    IsDeleted?: boolean | null;

    @Field({ nullable: true })
    MasterRecordId?: string | null;

    @Field({ nullable: true })
    Name?: string | null;

    @Field({ nullable: true })
    LastName?: string | null;

    @Field({ nullable: true })
    FirstName?: string | null;

    @Field({ nullable: true })
    Salutation?: string | null;

    @Field({ nullable: true })
    Type?: string | null;

    @Field({ nullable: true })
    RecordTypeId?: string | null;

    @Field({ nullable: true })
    ParentId?: string | null;

    @Field({ nullable: true })
    BillingStreet?: string | null;

    @Field({ nullable: true })
    BillingCity?: string | null;

    @Field({ nullable: true })
    BillingState?: string | null;

    @Field({ nullable: true })
    BillingPostalCode?: string | null;

    @Field({ nullable: true })
    BillingCountry?: string | null;

    @Field(() => Float, { nullable: true })
    BillingLatitude?: number | null;

    @Field(() => Float, { nullable: true })
    BillingLongitude?: number | null;

    @Field({ nullable: true })
    BillingGeocodeAccuracy?: string | null;

    @Field({ nullable: true })
    ShippingStreet?: string | null;

    @Field({ nullable: true })
    ShippingCity?: string | null;

    @Field({ nullable: true })
    ShippingState?: string | null;

    @Field({ nullable: true })
    ShippingPostalCode?: string | null;

    @Field({ nullable: true })
    ShippingCountry?: string | null;

    @Field(() => Float, { nullable: true })
    ShippingLatitude?: number | null;

    @Field(() => Float, { nullable: true })
    ShippingLongitude?: number | null;

    @Field({ nullable: true })
    ShippingGeocodeAccuracy?: string | null;

    @Field({ nullable: true })
    Phone?: string | null;

    @Field({ nullable: true })
    Fax?: string | null;

    @Field({ nullable: true })
    AccountNumber?: string | null;

    @Field({ nullable: true })
    Website?: string | null;

    @Field({ nullable: true })
    PhotoUrl?: string | null;

    @Field({ nullable: true })
    Sic?: string | null;

    @Field({ nullable: true })
    Industry?: string | null;

    @Field(() => Float, { nullable: true })
    AnnualRevenue?: number | null;

    @Field(() => Int, { nullable: true })
    NumberOfEmployees?: number | null;

    @Field({ nullable: true })
    Ownership?: string | null;

    @Field({ nullable: true })
    TickerSymbol?: string | null;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    Rating?: string | null;

    @Field({ nullable: true })
    Site?: string | null;

    @Field({ nullable: true })
    OwnerId?: string | null;

    @Field({ nullable: true })
    CreatedById?: string | null;

    @Field({ nullable: true })
    LastModifiedById?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsPartner?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    IsCustomerPortal?: boolean | null;

    @Field({ nullable: true })
    PersonContactId?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsPersonAccount?: boolean | null;

    @Field({ nullable: true })
    ChannelProgramName?: string | null;

    @Field({ nullable: true })
    ChannelProgramLevelName?: string | null;

    @Field({ nullable: true })
    PersonMailingStreet?: string | null;

    @Field({ nullable: true })
    PersonMailingCity?: string | null;

    @Field({ nullable: true })
    PersonMailingState?: string | null;

    @Field({ nullable: true })
    PersonMailingPostalCode?: string | null;

    @Field({ nullable: true })
    PersonMailingCountry?: string | null;

    @Field(() => Float, { nullable: true })
    PersonMailingLatitude?: number | null;

    @Field(() => Float, { nullable: true })
    PersonMailingLongitude?: number | null;

    @Field({ nullable: true })
    PersonMailingGeocodeAccuracy?: string | null;

    @Field({ nullable: true })
    PersonOtherStreet?: string | null;

    @Field({ nullable: true })
    PersonOtherCity?: string | null;

    @Field({ nullable: true })
    PersonOtherState?: string | null;

    @Field({ nullable: true })
    PersonOtherPostalCode?: string | null;

    @Field({ nullable: true })
    PersonOtherCountry?: string | null;

    @Field(() => Float, { nullable: true })
    PersonOtherLatitude?: number | null;

    @Field(() => Float, { nullable: true })
    PersonOtherLongitude?: number | null;

    @Field({ nullable: true })
    PersonOtherGeocodeAccuracy?: string | null;

    @Field({ nullable: true })
    PersonMobilePhone?: string | null;

    @Field({ nullable: true })
    PersonHomePhone?: string | null;

    @Field({ nullable: true })
    PersonOtherPhone?: string | null;

    @Field({ nullable: true })
    PersonAssistantPhone?: string | null;

    @Field({ nullable: true })
    PersonEmail?: string | null;

    @Field({ nullable: true })
    PersonTitle?: string | null;

    @Field({ nullable: true })
    PersonDepartment?: string | null;

    @Field({ nullable: true })
    PersonAssistantName?: string | null;

    @Field({ nullable: true })
    PersonLeadSource?: string | null;

    @Field(() => Boolean, { nullable: true })
    PersonHasOptedOutOfEmail?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    PersonHasOptedOutOfFax?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    PersonDoNotCall?: boolean | null;

    @Field({ nullable: true })
    PersonEmailBouncedReason?: string | null;

    @Field({ nullable: true })
    PersonIndividualId?: string | null;

    @Field({ nullable: true })
    Jigsaw?: string | null;

    @Field({ nullable: true })
    JigsawCompanyId?: string | null;

    @Field({ nullable: true })
    AccountSource?: string | null;

    @Field({ nullable: true })
    SicDesc?: string | null;

    @Field(() => Float, { nullable: true })
    NU__AccountBalance__c?: number | null;

    @Field({ nullable: true })
    NU__AccountID__c?: string | null;

    @Field(() => Float, { nullable: true })
    NU__AccountMoneySpent__c?: number | null;

    @Field({ nullable: true })
    NU__CasualName__c?: string | null;

    @Field({ nullable: true })
    NU__CommunicationPreference__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    NU__CopyFromMailingToBilling__c?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    NU__CopyFromMailingToOther__c?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    NU__CopyFromMailingToShipping__c?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    NU__CopyFromPrimaryAffiliationBilling__c?: boolean | null;

    @Field({ nullable: true })
    NU__Designation__c?: string | null;

    @Field({ nullable: true })
    NU__Ethnicity__c?: string | null;

    @Field({ nullable: true })
    NU__ExternalID__c?: string | null;

    @Field({ nullable: true })
    NU__FacebookAccount__c?: string | null;

    @Field({ nullable: true })
    NU__FullName__c?: string | null;

    @Field({ nullable: true })
    NU__Gender__c?: string | null;

    @Field({ nullable: true })
    NU__Lapsed__c?: string | null;

    @Field({ nullable: true })
    NU__LegacyID__c?: string | null;

    @Field({ nullable: true })
    NU__LinkedInAccount__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    NU__MarkForDelete__c?: boolean | null;

    @Field({ nullable: true })
    NU__Member__c?: string | null;

    @Field({ nullable: true })
    NU__MembershipType__c?: string | null;

    @Field({ nullable: true })
    NU__Membership__c?: string | null;

    @Field({ nullable: true })
    NU__MiddleName__c?: string | null;

    @Field({ nullable: true })
    NU__OtherEmail__c?: string | null;

    @Field({ nullable: true })
    NU__OtherFax__c?: string | null;

    @Field({ nullable: true })
    NU__PasswordHash__c?: string | null;

    @Field({ nullable: true })
    NU__PasswordSalt__c?: string | null;

    @Field({ nullable: true })
    NU__PersonAccountData__c?: string | null;

    @Field({ nullable: true })
    NU__PersonContact__c?: string | null;

    @Field({ nullable: true })
    NU__PersonEmail__c?: string | null;

    @Field({ nullable: true })
    NU__PrimaryAffiliation__c?: string | null;

    @Field({ nullable: true })
    NU__PrimaryEntity__c?: string | null;

    @Field({ nullable: true })
    NU__RecordTypeName__c?: string | null;

    @Field({ nullable: true })
    NU__RecoveryAnswer1__c?: string | null;

    @Field({ nullable: true })
    NU__RecoveryAnswer2__c?: string | null;

    @Field({ nullable: true })
    NU__RecoveryAnswer3__c?: string | null;

    @Field({ nullable: true })
    NU__RecoveryQuestion1__c?: string | null;

    @Field({ nullable: true })
    NU__RecoveryQuestion2__c?: string | null;

    @Field({ nullable: true })
    NU__RecoveryQuestion3__c?: string | null;

    @Field({ nullable: true })
    NU__SecurityGroup__c?: string | null;

    @Field({ nullable: true })
    NU__StatusMembershipFlag__c?: string | null;

    @Field({ nullable: true })
    NU__StatusMembership__c?: string | null;

    @Field({ nullable: true })
    NU__Status__c?: string | null;

    @Field({ nullable: true })
    NU__Suffix__c?: string | null;

    @Field({ nullable: true })
    NU__TaxExemptId__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    NU__TaxExempt__c?: boolean | null;

    @Field(() => Float, { nullable: true })
    NU__TotalAffiliateBalance__c?: number | null;

    @Field(() => Float, { nullable: true })
    NU__TotalAffiliateMoneySpent__c?: number | null;

    @Field({ nullable: true })
    NU__TwitterAccount__c?: string | null;

    @Field({ nullable: true })
    NU__Username__c?: string | null;

    @Field({ nullable: true })
    NU__ValidEmailDomains__c?: string | null;

    @Field({ nullable: true })
    Pay_Type__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    No_CTA__c?: boolean | null;

    @Field(() => Float, { nullable: true })
    Certified_CTA_Dues__c?: number | null;

    @Field(() => Boolean, { nullable: true })
    Refund_to_Individual__c?: boolean | null;

    @Field({ nullable: true })
    Student_year__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    Fellowship_program__c?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    Student_teach__c?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    Member_of_FTA__c?: boolean | null;

    @Field({ nullable: true })
    Grade_Level__c?: string | null;

    @Field({ nullable: true })
    NU__PrimaryAffiliationRecord__c?: string | null;

    @Field({ nullable: true })
    Is_certified__c?: string | null;

    @Field({ nullable: true })
    Account_Owner_Data_Processing__c?: string | null;

    @Field({ nullable: true })
    AccrualDues__c?: string | null;

    @Field({ nullable: true })
    DESE_Key__c?: string | null;

    @Field({ nullable: true })
    SSN_Last_4__c?: string | null;

    @Field({ nullable: true })
    CTA_Number__c?: string | null;

    @Field({ nullable: true })
    CloudingoAgent__BAR__c?: string | null;

    @Field({ nullable: true })
    Membership_Product_Name__c?: string | null;

    @Field({ nullable: true })
    Beneficiary__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    Exclude_Directory__c?: boolean | null;

    @Field({ nullable: true })
    NU__PrimaryContactEmail__c?: string | null;

    @Field({ nullable: true })
    Previous_Last_Name__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    Collect_Student_Chapter_Dues__c?: boolean | null;

    @Field({ nullable: true })
    Contact_if_problems__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    Display_CTA_Dues__c?: boolean | null;

    @Field({ nullable: true })
    Payroll_deduction_through__c?: string | null;

    @Field({ nullable: true })
    CTA_Priority__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    Easy_Renewal__c?: boolean | null;

    @Field({ nullable: true })
    Contact_Account_del__c?: string | null;

    @Field({ nullable: true })
    Member_Id__c?: string | null;

    @Field({ nullable: true })
    School_District_Account__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    MSTA_Action__c?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    No_outside_solicitation__c?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    No_Magazine__c?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    Opt_out_of_all_MSTA_mail__c?: boolean | null;

    @Field({ nullable: true })
    Beneficiary_Relation__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    Opt_out_of_all_MSTA_Email__c?: boolean | null;

    @Field({ nullable: true })
    Content_Area__c?: string | null;

    @Field({ nullable: true })
    NU__PrimaryContactName__c?: string | null;

    @Field({ nullable: true })
    NU__PrimaryLocationQualityCode__c?: string | null;

    @Field(() => Float, { nullable: true })
    NU__PrimaryLocation__Latitude__s?: number | null;

    @Field(() => Float, { nullable: true })
    NU__PrimaryLocation__Longitude__s?: number | null;

    @Field({ nullable: true })
    Region__c?: string | null;

    @Field({ nullable: true })
    Institution__c?: string | null;

    @Field({ nullable: true })
    Work_Phone__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    Deceased__c?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    Expelled__c?: boolean | null;

    @Field({ nullable: true })
    Legacy_Customer_Type__c?: string | null;

    @Field({ nullable: true })
    Future_Member_Type__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    Future_Member__c?: boolean | null;

    @Field({ nullable: true })
    Future_Pay_Type__c?: string | null;

    @Field({ nullable: true })
    Future_Product_Type__c?: string | null;

    @Field({ nullable: true })
    Future_Status__c?: string | null;

    @Field({ nullable: true })
    New_Member_Type__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    New_Member__c?: boolean | null;

    @Field({ nullable: true })
    New_Product_Type__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    Suspend__c?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    UnmatchedBalances__c?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    Test_Owner_Matches_Parent__c?: boolean | null;

    @Field({ nullable: true })
    Institution_CTA_Number__c?: string | null;

    @Field({ nullable: true })
    Marketing_Label__c?: string | null;

    @Field({ nullable: true })
    Future_Marketing_Label__c?: string | null;

    @Field({ nullable: true })
    InstitutionId__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    Easy_Renewal_Complete__c?: boolean | null;

    @Field({ nullable: true })
    Remove_Reason__c?: string | null;

    @Field({ nullable: true })
    MobileAdmin__c?: string | null;

    @Field({ nullable: true })
    MobileDirectoryActive__c?: string | null;

    @Field({ nullable: true })
    MobileInfo__c?: string | null;

    @Field({ nullable: true })
    Future_Renewal_Notice_Code__c?: string | null;

    @Field({ nullable: true })
    NU__PrimaryContact__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    NU__UpdatePrimaryLocation__c?: boolean | null;

    @Field({ nullable: true })
    Alternate_Work_Phone__c?: string | null;

    @Field({ nullable: true })
    School_Address__c?: string | null;

    @Field({ nullable: true })
    School_City_F__c?: string | null;

    @Field({ nullable: true })
    School_Country_F__c?: string | null;

    @Field({ nullable: true })
    School_StateProvince__c?: string | null;

    @Field({ nullable: true })
    School_Street__c?: string | null;

    @Field({ nullable: true })
    School_ZipPostal_Code__c?: string | null;

    @Field({ nullable: true })
    Student_At_School_Address_Line_1__c?: string | null;

    @Field({ nullable: true })
    Student_At_School_Address_Line_2__c?: string | null;

    @Field({ nullable: true })
    Student_At_School_Address_Line_3__c?: string | null;

    @Field({ nullable: true })
    Student_At_School_City__c?: string | null;

    @Field({ nullable: true })
    Student_At_School_Country__c?: string | null;

    @Field({ nullable: true })
    Student_At_School_PostalCode__c?: string | null;

    @Field({ nullable: true })
    Student_At_School_State__c?: string | null;

    @Field({ nullable: true })
    Student_At_School_Street__c?: string | null;

    @Field({ nullable: true })
    Student_At_School__c?: string | null;

    @Field({ nullable: true })
    Use_for_Billing__c?: string | null;

    @Field({ nullable: true })
    Use_for_Mailing__c?: string | null;

    @Field({ nullable: true })
    Use_for_Shipping__c?: string | null;

    @Field({ nullable: true })
    Future_Product_List_Price__c?: string | null;

    @Field(() => Float, { nullable: true })
    Chapter_Dues_Amount__c?: number | null;

    @Field({ nullable: true })
    MSTA_Legacy_Customer_Type__c?: string | null;

    @Field({ nullable: true })
    Renewal_Forms_Sort__c?: string | null;

    @Field({ nullable: true })
    State_House_District__c?: string | null;

    @Field({ nullable: true })
    State_Senate_District__c?: string | null;

    @Field(() => Float, { nullable: true })
    NU__CreditBalance__c?: number | null;

    @Field({ nullable: true })
    Abbreviation__c?: string | null;

    @Field({ nullable: true })
    Previous_Acct_Owner__c?: string | null;

    @Field({ nullable: true })
    County__c?: string | null;

    @Field({ nullable: true })
    Alt_Contact_Account_del__c?: string | null;

    @Field(() => Float, { nullable: true })
    Net_Promoter_Score__c?: number | null;

    @Field(() => Float, { nullable: true })
    NU__TotalAffiliatedAccounts__c?: number | null;

    @Field({ nullable: true })
    Respondent_Comments__c?: string | null;

    @Field({ nullable: true })
    NU__FullNameOverride__c?: string | null;

    @Field(() => Float, { nullable: true })
    Birthday_Day__c?: number | null;

    @Field(() => Boolean, { nullable: true })
    Non_member_Opt_In__c?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    NU__Trusted__c?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    NC__AccountCreatedThroughSocialSignOn__c?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    NC__AccountDoesNotHavePassword__c?: boolean | null;

    @Field({ nullable: true })
    Expected_Graduation_Month__c?: string | null;

    @Field({ nullable: true })
    Expected_Graduation_Year__c?: string | null;

    @Field({ nullable: true })
    geopointe__Geocode__c?: string | null;

    @Field({ nullable: true })
    NU__ProfileImageRevisionId__c?: string | null;

    @Field({ nullable: true })
    NU__ProfileImageURL__c?: string | null;

    @Field({ nullable: true })
    NU__ProfileImage__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    NU__SandboxEnabled__c?: boolean | null;

    @Field({ nullable: true })
    NPS_Year__c?: string | null;

    @Field({ nullable: true })
    NPS_Response_Label__c?: string | null;

    @Field({ nullable: true })
    AgencyUsedforFoodService__c?: string | null;

    @Field({ nullable: true })
    NPFollowupComments__c?: string | null;

    @Field({ nullable: true })
    AgencyusedforSubstitutes__c?: string | null;

    @Field(() => Float, { nullable: true })
    School_Building_Number__c?: number | null;

    @Field({ nullable: true })
    AgencyusedforCustodialServices__c?: string | null;

    @Field({ nullable: true })
    CollectiveBargaining__c?: string | null;

    @Field({ nullable: true })
    ContractforCustodial__c?: string | null;

    @Field({ nullable: true })
    ContractforFoodService__c?: string | null;

    @Field({ nullable: true })
    ContractforSubstitutes__c?: string | null;

    @Field({ nullable: true })
    rrpu__Alert_Message__c?: string | null;

    @Field(() => Float, { nullable: true })
    CloudingoAgent__BAS__c?: number | null;

    @Field({ nullable: true })
    CloudingoAgent__BAV__c?: string | null;

    @Field({ nullable: true })
    CloudingoAgent__BRDI__c?: string | null;

    @Field({ nullable: true })
    CloudingoAgent__BTZ__c?: string | null;

    @Field({ nullable: true })
    CloudingoAgent__SAR__c?: string | null;

    @Field(() => Float, { nullable: true })
    CloudingoAgent__SAS__c?: number | null;

    @Field({ nullable: true })
    CloudingoAgent__SAV__c?: string | null;

    @Field({ nullable: true })
    CloudingoAgent__SRDI__c?: string | null;

    @Field({ nullable: true })
    CloudingoAgent__STZ__c?: string | null;

    @Field({ nullable: true })
    LongFormID__c?: string | null;

    @Field({ nullable: true })
    InstitutionLongID__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    BillHighway__c?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    NoPacket__c?: boolean | null;

    @Field({ nullable: true })
    YourMembershipType__c?: string | null;

    @Field({ nullable: true })
    YourProductType__c?: string | null;

    @Field(() => Float, { nullable: true })
    NumCurrentYearMemberships__c?: number | null;

    @Field(() => Boolean, { nullable: true })
    DoNotSendMembershipCard__c?: boolean | null;

    @Field({ nullable: true })
    BillHighwayStatus__c?: string | null;

    @Field({ nullable: true })
    NU__MemberOverride__c?: string | null;

    @Field(() => Float, { nullable: true })
    qualtrics__Net_Promoter_Score__c?: number | null;

    @Field({ nullable: true })
    NPHowCanWeImprove__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    NPFollowup__c?: boolean | null;

    @Field({ nullable: true })
    NPEmail__c?: string | null;

    @Field({ nullable: true })
    District_Attorney__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    Email_Opt_in_Weekly_Bytes__c?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    MNEA_LM_1_Filed__c?: boolean | null;

    @Field({ nullable: true })
    MSTA_LM_1_Filed__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    Email_Opt_in_Events__c?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    Email_Opt_in_Action__c?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    Email_Opt_in_News__c?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    Email_Opt_in_Leaders__c?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    Email_Opt_in_Partners__c?: boolean | null;

    @Field({ nullable: true })
    CurrentFiscalYear__c?: string | null;

    @Field({ nullable: true })
    InsuranceCoverageDates__c?: string | null;

    @Field({ nullable: true })
    Membership_Year__c?: string | null;

    @Field({ nullable: true })
    TodaysDate__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsStudent__c?: boolean | null;

    @Field({ nullable: true })
    PreferredAddress__c?: string | null;

    @Field({ nullable: true })
    ChMemberType__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    Known_Bad_Home_Address__c?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    ACH_Agreement_On_File__c?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    MSTA_Collecting_CTA_Dues__c?: boolean | null;

    @Field({ nullable: true })
    Region_Abbreviation__c?: string | null;

    @Field(() => Float, { nullable: true })
    Chapter_Dues__c?: number | null;

    @Field({ nullable: true })
    Recruited_By__c?: string | null;

    @Field({ nullable: true })
    Duplicate_Key__c?: string | null;

    @Field({ nullable: true })
    Position__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    PSRS_Petition__c?: boolean | null;

    @Field(() => Float, { nullable: true })
    CTA_Dues_Amount_to_Display_on_Renewal__c?: number | null;

    @Field(() => Float, { nullable: true })
    Non_certified_CTA_Dues__c?: number | null;

    @Field(() => Float, { nullable: true })
    DESKSCMT__Desk_Company_Id__c?: number | null;

    @Field(() => Float, { nullable: true })
    P2A__Advocate_ID__c?: number | null;

    @Field({ nullable: true })
    P2A__City_District__c?: string | null;

    @Field({ nullable: true })
    P2A__County__c?: string | null;

    @Field({ nullable: true })
    P2A__Federal_House_District__c?: string | null;

    @Field({ nullable: true })
    P2A__State_House_District__c?: string | null;

    @Field({ nullable: true })
    P2A__State_Senate_District__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    P2A__Synced__c?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    DESKSCMT__Desk_Migrated_Account__c?: boolean | null;

    @Field(() => Float, { nullable: true })
    Desk_Id__c?: number | null;

    @Field(() => Boolean, { nullable: true })
    NU__IsMemberFlag__c?: boolean | null;

    @Field({ nullable: true })
    Field_Rep_Number__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    No_DocuSign__c?: boolean | null;

    @Field({ nullable: true })
    DocuSignCurrentBuilding__c?: string | null;

    @Field({ nullable: true })
    bg_Docusign_Job__c?: string | null;

    @Field({ nullable: true })
    envelope_event__c?: string | null;

    @Field({ nullable: true })
    envelope_id__c?: string | null;

    @Field({ nullable: true })
    envelope_status_value__c?: string | null;

    @Field({ nullable: true })
    envelope_template_id__c?: string | null;

    @Field({ nullable: true })
    Envelope_Email_Body__c?: string | null;

    @Field({ nullable: true })
    Envelope_Email_Subject_Line__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    Resigned__c?: boolean | null;

    @Field(() => Float, { nullable: true })
    Membership_Dues__c?: number | null;

    @Field({ nullable: true })
    Reason_for_Resigning__c?: string | null;

    @Field({ nullable: true })
    Schedule__c?: string | null;

    @Field({ nullable: true })
    Schedule_Type__c?: string | null;

    @Field({ nullable: true })
    Schedule_Stage__c?: string | null;

    @Field({ nullable: true })
    DocuSign_Status__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    Membership_Pending__c?: boolean | null;

    @Field({ nullable: true })
    Duplicate_Key_Fname_DOB_Zip_Addr__c?: string | null;

    @Field({ nullable: true })
    Duplicate_Key_fname_DOB_Last4__c?: string | null;

    @Field({ nullable: true })
    Duplicate_Key_fname_DOB_Last4_formula__c?: string | null;

    @Field({ nullable: true })
    Duplicate_Key_fname_DOB_Zip__c?: string | null;

    @Field({ nullable: true })
    Duplicate_Key_fname_DOB__c?: string | null;

    @Field({ nullable: true })
    Duplicate_Key_fname_Last4_Zip__c?: string | null;

    @Field({ nullable: true })
    Duplicate_Key_fname_Last4__c?: string | null;

    @Field({ nullable: true })
    Duplicate_Key_fname_temp__c?: string | null;

    @Field({ nullable: true })
    Resolve_Concurrent_Membership_B4_Merging__c?: string | null;

    @Field({ nullable: true })
    fname__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    is_master_Fname_DOB_Last4SSN__c?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    is_master_Fname_DOB_Zip_AddrOrPhone__c?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    is_master_Fname_DOB_Zip_Addr__c?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    is_master_Fname_DOB_Zip__c?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    is_master_Fname_Last4SSN_Zip__c?: boolean | null;

    @Field({ nullable: true })
    masterID_ref_fname_DOB_Last4__c?: string | null;

    @Field({ nullable: true })
    masterID_ref_fname_DOB_Zip_AddrOrPhone__c?: string | null;

    @Field({ nullable: true })
    masterID_ref_fname_DOB_Zip_Addr__c?: string | null;

    @Field({ nullable: true })
    masterID_ref_fname_DOB_Zip__c?: string | null;

    @Field({ nullable: true })
    masterID_ref_fname_Last4_Zip__c?: string | null;

    @Field({ nullable: true })
    matching_key_Fname_DOB_Last4SSN__c?: string | null;

    @Field({ nullable: true })
    matching_key_Fname_DOB_Zip__c?: string | null;

    @Field({ nullable: true })
    matching_key_Fname_Last4SSN_Zip__c?: string | null;

    @Field(() => Float, { nullable: true })
    Number_of_Payroll_Payments__c?: number | null;

    @Field({ nullable: true })
    New_Building_from_DocuSign__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    qtr1_cta_dues_processed__c?: boolean | null;

    @Field(() => Float, { nullable: true })
    qtr1_dues_pending_pmnt_to_institution__c?: number | null;

    @Field(() => Float, { nullable: true })
    qtr1_dues_processed_pmnt_to_institution__c?: number | null;

    @Field(() => Float, { nullable: true })
    qtr1_new_dues_to_pay_to_institution__c?: number | null;

    @Field(() => Boolean, { nullable: true })
    qtr2_cta_dues_processed__c?: boolean | null;

    @Field(() => Float, { nullable: true })
    qtr2_dues_pending_pmnt_to_institution__c?: number | null;

    @Field(() => Float, { nullable: true })
    qtr2_dues_processed_pmnt_to_institution__c?: number | null;

    @Field(() => Float, { nullable: true })
    qtr2_new_dues_to_pay_to_institution__c?: number | null;

    @Field(() => Boolean, { nullable: true })
    qtr3_cta_dues_processed__c?: boolean | null;

    @Field(() => Float, { nullable: true })
    qtr3_dues_pending_pmnt_to_institution__c?: number | null;

    @Field(() => Float, { nullable: true })
    qtr3_dues_processed_pmnt_to_institution__c?: number | null;

    @Field(() => Float, { nullable: true })
    qtr3_new_dues_to_pay_to_institution__c?: number | null;

    @Field(() => Boolean, { nullable: true })
    qtr4_cta_dues_processed__c?: boolean | null;

    @Field(() => Float, { nullable: true })
    qtr4_dues_pending_pmnt_to_institution__c?: number | null;

    @Field(() => Float, { nullable: true })
    qtr4_dues_processed_pmnt_to_institution__c?: number | null;

    @Field(() => Float, { nullable: true })
    qtr4_new_dues_to_pay_to_institution__c?: number | null;

    @Field(() => Float, { nullable: true })
    txs_dues_pending_pmnt_to_institution__c?: number | null;

    @Field(() => Float, { nullable: true })
    txs_dues_processed_pmnt_to_institution__c?: number | null;

    @Field(() => Float, { nullable: true })
    DocuSign_Entered_CTA_Dues__c?: number | null;

    @Field({ nullable: true })
    Highest_Level_of_Education__c?: string | null;

    @Field({ nullable: true })
    Anticipated_Retirement_Year__c?: string | null;

    @Field({ nullable: true })
    Associate_Job_Category__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    Billing_Address_Override__c?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    Mailing_Address_Override__c?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    Exempt_from_Book_Studies__c?: boolean | null;

    @Field(() => Float, { nullable: true })
    Dues_Balance__c?: number | null;

    @Field({ nullable: true })
    Paying_CTA_Dues_Thru_MSTA__c?: string | null;

    @Field({ nullable: true })
    Simple_Pay_Type__c?: string | null;

    @Field({ nullable: true })
    ConsentItem__c?: string | null;

    @Field({ nullable: true })
    UltimateId__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    AllowPayroll__c?: boolean | null;

    @Field(() => Float, { nullable: true })
    Number_of_Payroll_Deductions__c?: number | null;

    @Field({ nullable: true })
    Home_Phone_Type__c?: string | null;

    @Field({ nullable: true })
    Mobile_Type__c?: string | null;

    @Field({ nullable: true })
    namz__AssignmentRule__c?: string | null;

    @Field({ nullable: true })
    namz__PrimaryAffiliation__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    Known_Bad_Home_Phone__c?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    Known_Bad_Mobile__c?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    NU__ExcludeFromAffiliationSearch__c?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    Home_Phone_Is_Valid__c?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    Mobile_Is_Valid__c?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    HomePhoneVerifiedCurrFiscal__c?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    MobileVerifiedCurrFiscal__c?: boolean | null;

    @Field({ nullable: true })
    NU__ExternalID__pc?: string | null;

    @Field({ nullable: true })
    ET_Field_Rep__pc?: string | null;

    @Field({ nullable: true })
    Deskcom__twitter_username__pc?: string | null;

    @Field({ nullable: true })
    e4sf__Engage_Address_City__pc?: string | null;

    @Field({ nullable: true })
    e4sf__Engage_Address_Country__pc?: string | null;

    @Field({ nullable: true })
    e4sf__Engage_Address_PostalCode__pc?: string | null;

    @Field({ nullable: true })
    e4sf__Engage_Address_State__pc?: string | null;

    @Field({ nullable: true })
    e4sf__Engage_Address_Street__pc?: string | null;

    @Field({ nullable: true })
    e4sf__Engage_Batch_Id__pc?: string | null;

    @Field({ nullable: true })
    e4sf__Engage_Ext_Id__pc?: string | null;

    @Field({ nullable: true })
    e4sf__Engage_Federal_District_Lower_Chamber__pc?: string | null;

    @Field({ nullable: true })
    e4sf__Engage_Federal_District_Upper_Chamber__pc?: string | null;

    @Field(() => Boolean, { nullable: true })
    e4sf__Engage_Is_Advocate__pc?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    e4sf__Engage_Never_Sync_To_Engage__pc?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    e4sf__Engage_Opt_Out__pc?: boolean | null;

    @Field({ nullable: true })
    e4sf__Engage_Phone__pc?: string | null;

    @Field({ nullable: true })
    e4sf__Engage_State_District_Lower_Chamber__pc?: string | null;

    @Field({ nullable: true })
    e4sf__Engage_State_District_Upper_Chamber__pc?: string | null;

    @Field({ nullable: true })
    geopointe__Geocode__pc?: string | null;

    @Field({ nullable: true })
    rrpu__Alert_Message__pc?: string | null;

    @Field(() => Float, { nullable: true })
    CloudingoAgent__CES__pc?: number | null;

    @Field({ nullable: true })
    CloudingoAgent__MAR__pc?: string | null;

    @Field(() => Float, { nullable: true })
    CloudingoAgent__MAS__pc?: number | null;

    @Field({ nullable: true })
    CloudingoAgent__MAV__pc?: string | null;

    @Field({ nullable: true })
    CloudingoAgent__MRDI__pc?: string | null;

    @Field({ nullable: true })
    CloudingoAgent__MTZ__pc?: string | null;

    @Field({ nullable: true })
    CloudingoAgent__OAR__pc?: string | null;

    @Field(() => Float, { nullable: true })
    CloudingoAgent__OAS__pc?: number | null;

    @Field({ nullable: true })
    CloudingoAgent__OAV__pc?: string | null;

    @Field({ nullable: true })
    CloudingoAgent__ORDI__pc?: string | null;

    @Field({ nullable: true })
    CloudingoAgent__OTZ__pc?: string | null;

    @Field(() => Boolean, { nullable: true })
    NC_DPP__Anonymize__pc?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    NC_DPP__Consented__pc?: boolean | null;

    @Field({ nullable: true })
    NU__Biography__pc?: string | null;

    @Field({ nullable: true })
    NU__Degrees__pc?: string | null;

    @Field({ nullable: true })
    NU__DoctoralInstitution__pc?: string | null;

    @Field({ nullable: true })
    NU__Expertise__pc?: string | null;

    @Field({ nullable: true })
    NU__GraduateInstitution__pc?: string | null;

    @Field({ nullable: true })
    NU__Interests__pc?: string | null;

    @Field({ nullable: true })
    NU__UndergraduateInstitution__pc?: string | null;

    @Field(() => Boolean, { nullable: true })
    et4ae5__HasOptedOutOfMobile__pc?: boolean | null;

    @Field({ nullable: true })
    et4ae5__Mobile_Country_Code__pc?: string | null;

    @Field(() => Boolean, { nullable: true })
    qualtrics__Informed_Consent__pc?: boolean | null;

    @Field(() => Float, { nullable: true })
    qualtrics__Net_Promoter_Score__pc?: number | null;

    @Field(() => Boolean, { nullable: true })
    is_eligible_for_SFMC_sync__pc?: boolean | null;

    @Field({ nullable: true })
    Long_Form_ID__pc?: string | null;

    @Field({ nullable: true })
    Institution__pc?: string | null;

    @Field({ nullable: true })
    Member__pc?: string | null;

    @Field(() => Boolean, { nullable: true })
    Eligible_For_SFMC_Sync__pc?: boolean | null;

    @Field(() => Float, { nullable: true })
    DESKSCMT__Desk_Customer_Id__pc?: number | null;

    @Field(() => Boolean, { nullable: true })
    DESKSCMT__Desk_Migrated_Contact__pc?: boolean | null;

    @Field({ nullable: true })
    title__pc?: string | null;

    @Field(() => Float, { nullable: true })
    P2A__Advocate_ID__pc?: number | null;

    @Field({ nullable: true })
    P2A__City_District__pc?: string | null;

    @Field({ nullable: true })
    P2A__County__pc?: string | null;

    @Field({ nullable: true })
    P2A__Federal_House_District__pc?: string | null;

    @Field(() => Boolean, { nullable: true })
    P2A__Phone2Action_Email_Optin__pc?: boolean | null;

    @Field({ nullable: true })
    P2A__State_House_District__pc?: string | null;

    @Field({ nullable: true })
    P2A__State_Senate_District__pc?: string | null;

    @Field(() => Boolean, { nullable: true })
    P2A__Synced__pc?: boolean | null;

    @Field({ nullable: true })
    external_id__pc?: string | null;

    @Field({ nullable: true })
    background__pc?: string | null;

    @Field({ nullable: true })
    language__pc?: string | null;

    @Field(() => Boolean, { nullable: true })
    access_private_portal__pc?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    access_company_cases__pc?: boolean | null;

    @Field(() => Float, { nullable: true })
    Desk_Id__pc?: number | null;

    @Field({ nullable: true })
    rcsfl__SMS_Number__pc?: string | null;

    @Field({ nullable: true })
    rcsfl__SendSMS__pc?: string | null;

    @Field({ nullable: true })
    Troubleshoot?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Accounts
//****************************************************************************
@ObjectType()
export class RunAccountViewResult {
    @Field(() => [Account_])
    Results: Account_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(Account_)
export class AccountResolver extends ResolverBase {
    @Query(() => RunAccountViewResult)
    async RunAccountViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAccountViewResult)
    async RunAccountViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunAccountViewResult)
    async RunAccountDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Accounts';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => Account_, { nullable: true })
    async Account(@Arg('Id', () => String) Id: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Account_ | null> {
        this.CheckUserReadPermissions('Accounts', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [nams].[vwAccounts] WHERE [Id]='${Id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Accounts', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Accounts', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @FieldResolver(() => [Person_])
    async Persons_NimbleAccountIDArray(@Root() account_: Account_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Persons', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [common].[vwPersons] WHERE [NimbleAccountID]='${account_.Id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Persons', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.ArrayMapFieldNamesToCodeNames('Persons', rows);
        return result;
    }
        
    @FieldResolver(() => [Organization_])
    async Organizations_NimbleAccountIDArray(@Root() account_: Account_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Organizations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [common].[vwOrganizations] WHERE [NimbleAccountID]='${account_.Id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Organizations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.ArrayMapFieldNamesToCodeNames('Organizations', rows);
        return result;
    }
        
    @Mutation(() => Account_)
    async CreateAccount(
        @Arg('input', () => CreateAccountInput) input: CreateAccountInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Accounts', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => Account_)
    async UpdateAccount(
        @Arg('input', () => UpdateAccountInput) input: UpdateAccountInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Accounts', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => Account_)
    async DeleteAccount(@Arg('Id', () => String) Id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'Id', Value: Id}]);
        return this.DeleteRecord('Accounts', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Contacts
//****************************************************************************
@ObjectType()
export class Contact_ {
    @Field() 
    @MaxLength(100)
    Id: string;
        
    @Field(() => Boolean, {nullable: true}) 
    IsDeleted?: boolean;
        
    @Field({nullable: true}) 
    MasterRecordId?: string;
        
    @Field({nullable: true}) 
    AccountId?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    IsPersonAccount?: boolean;
        
    @Field({nullable: true}) 
    LastName?: string;
        
    @Field({nullable: true}) 
    FirstName?: string;
        
    @Field({nullable: true}) 
    Salutation?: string;
        
    @Field({nullable: true}) 
    Name?: string;
        
    @Field({nullable: true}) 
    OtherStreet?: string;
        
    @Field({nullable: true}) 
    OtherCity?: string;
        
    @Field({nullable: true}) 
    OtherState?: string;
        
    @Field({nullable: true}) 
    OtherPostalCode?: string;
        
    @Field({nullable: true}) 
    OtherCountry?: string;
        
    @Field(() => Float, {nullable: true}) 
    OtherLatitude?: number;
        
    @Field(() => Float, {nullable: true}) 
    OtherLongitude?: number;
        
    @Field({nullable: true}) 
    OtherGeocodeAccuracy?: string;
        
    @Field({nullable: true}) 
    MailingStreet?: string;
        
    @Field({nullable: true}) 
    MailingCity?: string;
        
    @Field({nullable: true}) 
    MailingState?: string;
        
    @Field({nullable: true}) 
    MailingPostalCode?: string;
        
    @Field({nullable: true}) 
    MailingCountry?: string;
        
    @Field(() => Float, {nullable: true}) 
    MailingLatitude?: number;
        
    @Field(() => Float, {nullable: true}) 
    MailingLongitude?: number;
        
    @Field({nullable: true}) 
    MailingGeocodeAccuracy?: string;
        
    @Field({nullable: true}) 
    Phone?: string;
        
    @Field({nullable: true}) 
    Fax?: string;
        
    @Field({nullable: true}) 
    MobilePhone?: string;
        
    @Field({nullable: true}) 
    HomePhone?: string;
        
    @Field({nullable: true}) 
    OtherPhone?: string;
        
    @Field({nullable: true}) 
    AssistantPhone?: string;
        
    @Field({nullable: true}) 
    ReportsToId?: string;
        
    @Field({nullable: true}) 
    Email?: string;
        
    @Field({nullable: true}) 
    Title?: string;
        
    @Field({nullable: true}) 
    Department?: string;
        
    @Field({nullable: true}) 
    AssistantName?: string;
        
    @Field({nullable: true}) 
    LeadSource?: string;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    Birthdate?: Date;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field({nullable: true}) 
    OwnerId?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    HasOptedOutOfEmail?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    HasOptedOutOfFax?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    DoNotCall?: boolean;
        
    @Field({nullable: true}) 
    CreatedById?: string;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    LastModifiedDate?: Date;
        
    @Field({nullable: true}) 
    LastModifiedById?: string;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    SystemModstamp?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    LastActivityDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    LastCURequestDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    LastCUUpdateDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    LastViewedDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    LastReferencedDate?: Date;
        
    @Field({nullable: true}) 
    EmailBouncedReason?: string;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    EmailBouncedDate?: Date;
        
    @Field(() => Boolean, {nullable: true}) 
    IsEmailBounced?: boolean;
        
    @Field({nullable: true}) 
    PhotoUrl?: string;
        
    @Field({nullable: true}) 
    Jigsaw?: string;
        
    @Field({nullable: true}) 
    JigsawContactId?: string;
        
    @Field({nullable: true}) 
    IndividualId?: string;
        
    @Field({nullable: true}) 
    NU__ExternalID__c?: string;
        
    @Field({nullable: true}) 
    ET_Field_Rep__c?: string;
        
    @Field({nullable: true}) 
    Deskcom__twitter_username__c?: string;
        
    @Field({nullable: true}) 
    e4sf__Engage_Address_City__c?: string;
        
    @Field({nullable: true}) 
    e4sf__Engage_Address_Country__c?: string;
        
    @Field({nullable: true}) 
    e4sf__Engage_Address_PostalCode__c?: string;
        
    @Field({nullable: true}) 
    e4sf__Engage_Address_State__c?: string;
        
    @Field({nullable: true}) 
    e4sf__Engage_Address_Street__c?: string;
        
    @Field({nullable: true}) 
    e4sf__Engage_Batch_Id__c?: string;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    e4sf__Engage_Date_Last_Sync__c?: Date;
        
    @Field({nullable: true}) 
    e4sf__Engage_Ext_Id__c?: string;
        
    @Field({nullable: true}) 
    e4sf__Engage_Federal_District_Lower_Chamber__c?: string;
        
    @Field({nullable: true}) 
    e4sf__Engage_Federal_District_Upper_Chamber__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    e4sf__Engage_Is_Advocate__c?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    e4sf__Engage_Never_Sync_To_Engage__c?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    e4sf__Engage_Opt_Out__c?: boolean;
        
    @Field({nullable: true}) 
    e4sf__Engage_Phone__c?: string;
        
    @Field({nullable: true}) 
    e4sf__Engage_State_District_Lower_Chamber__c?: string;
        
    @Field({nullable: true}) 
    e4sf__Engage_State_District_Upper_Chamber__c?: string;
        
    @Field({nullable: true}) 
    geopointe__Geocode__c?: string;
        
    @Field({nullable: true}) 
    rrpu__Alert_Message__c?: string;
        
    @Field(() => Float, {nullable: true}) 
    CloudingoAgent__CES__c?: number;
        
    @Field({nullable: true}) 
    CloudingoAgent__MAR__c?: string;
        
    @Field(() => Float, {nullable: true}) 
    CloudingoAgent__MAS__c?: number;
        
    @Field({nullable: true}) 
    CloudingoAgent__MAV__c?: string;
        
    @Field({nullable: true}) 
    CloudingoAgent__MRDI__c?: string;
        
    @Field({nullable: true}) 
    CloudingoAgent__MTZ__c?: string;
        
    @Field({nullable: true}) 
    CloudingoAgent__OAR__c?: string;
        
    @Field(() => Float, {nullable: true}) 
    CloudingoAgent__OAS__c?: number;
        
    @Field({nullable: true}) 
    CloudingoAgent__OAV__c?: string;
        
    @Field({nullable: true}) 
    CloudingoAgent__ORDI__c?: string;
        
    @Field({nullable: true}) 
    CloudingoAgent__OTZ__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    NC_DPP__Anonymize__c?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    NC_DPP__Consented__c?: boolean;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    NC_DPP__LastConsentedDate__c?: Date;
        
    @Field({nullable: true}) 
    NU__Biography__c?: string;
        
    @Field({nullable: true}) 
    NU__Degrees__c?: string;
        
    @Field({nullable: true}) 
    NU__DoctoralInstitution__c?: string;
        
    @Field({nullable: true}) 
    NU__Expertise__c?: string;
        
    @Field({nullable: true}) 
    NU__GraduateInstitution__c?: string;
        
    @Field({nullable: true}) 
    NU__Interests__c?: string;
        
    @Field({nullable: true}) 
    NU__UndergraduateInstitution__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    et4ae5__HasOptedOutOfMobile__c?: boolean;
        
    @Field({nullable: true}) 
    et4ae5__Mobile_Country_Code__c?: string;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    qualtrics__Informed_Consent_Date__c?: Date;
        
    @Field(() => Boolean, {nullable: true}) 
    qualtrics__Informed_Consent__c?: boolean;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    qualtrics__Last_Survey_Invitation__c?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    qualtrics__Last_Survey_Response__c?: Date;
        
    @Field(() => Float, {nullable: true}) 
    qualtrics__Net_Promoter_Score__c?: number;
        
    @Field(() => Boolean, {nullable: true}) 
    is_eligible_for_SFMC_sync__c?: boolean;
        
    @Field({nullable: true}) 
    Long_Form_ID__c?: string;
        
    @Field({nullable: true}) 
    Institution__c?: string;
        
    @Field({nullable: true}) 
    Member__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    Eligible_For_SFMC_Sync__c?: boolean;
        
    @Field(() => Float, {nullable: true}) 
    DESKSCMT__Desk_Customer_Id__c?: number;
        
    @Field(() => Boolean, {nullable: true}) 
    DESKSCMT__Desk_Migrated_Contact__c?: boolean;
        
    @Field({nullable: true}) 
    title__c?: string;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    created_at__c?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    updated_at__c?: Date;
        
    @Field(() => Float, {nullable: true}) 
    P2A__Advocate_ID__c?: number;
        
    @Field({nullable: true}) 
    P2A__City_District__c?: string;
        
    @Field({nullable: true}) 
    P2A__County__c?: string;
        
    @Field({nullable: true}) 
    P2A__Federal_House_District__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    P2A__Phone2Action_Email_Optin__c?: boolean;
        
    @Field({nullable: true}) 
    P2A__State_House_District__c?: string;
        
    @Field({nullable: true}) 
    P2A__State_Senate_District__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    P2A__Synced__c?: boolean;
        
    @Field({nullable: true}) 
    external_id__c?: string;
        
    @Field({nullable: true}) 
    background__c?: string;
        
    @Field({nullable: true}) 
    language__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    access_private_portal__c?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    access_company_cases__c?: boolean;
        
    @Field(() => Float, {nullable: true}) 
    Desk_Id__c?: number;
        
    @Field({nullable: true}) 
    rcsfl__SMS_Number__c?: string;
        
    @Field({nullable: true}) 
    rcsfl__SendSMS__c?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    Troubleshoot?: string;
        
    @Field(() => [Person_])
    Persons_NimbleContactIDArray: Person_[]; // Link to Persons
    
}

//****************************************************************************
// INPUT TYPE for Contacts
//****************************************************************************
@InputType()
export class CreateContactInput {
    @Field({ nullable: true })
    Id?: string;

    @Field(() => Boolean, { nullable: true })
    IsDeleted: boolean | null;

    @Field({ nullable: true })
    MasterRecordId: string | null;

    @Field({ nullable: true })
    AccountId: string | null;

    @Field(() => Boolean, { nullable: true })
    IsPersonAccount: boolean | null;

    @Field({ nullable: true })
    LastName: string | null;

    @Field({ nullable: true })
    FirstName: string | null;

    @Field({ nullable: true })
    Salutation: string | null;

    @Field({ nullable: true })
    Name: string | null;

    @Field({ nullable: true })
    OtherStreet: string | null;

    @Field({ nullable: true })
    OtherCity: string | null;

    @Field({ nullable: true })
    OtherState: string | null;

    @Field({ nullable: true })
    OtherPostalCode: string | null;

    @Field({ nullable: true })
    OtherCountry: string | null;

    @Field(() => Float, { nullable: true })
    OtherLatitude: number | null;

    @Field(() => Float, { nullable: true })
    OtherLongitude: number | null;

    @Field({ nullable: true })
    OtherGeocodeAccuracy: string | null;

    @Field({ nullable: true })
    MailingStreet: string | null;

    @Field({ nullable: true })
    MailingCity: string | null;

    @Field({ nullable: true })
    MailingState: string | null;

    @Field({ nullable: true })
    MailingPostalCode: string | null;

    @Field({ nullable: true })
    MailingCountry: string | null;

    @Field(() => Float, { nullable: true })
    MailingLatitude: number | null;

    @Field(() => Float, { nullable: true })
    MailingLongitude: number | null;

    @Field({ nullable: true })
    MailingGeocodeAccuracy: string | null;

    @Field({ nullable: true })
    Phone: string | null;

    @Field({ nullable: true })
    Fax: string | null;

    @Field({ nullable: true })
    MobilePhone: string | null;

    @Field({ nullable: true })
    HomePhone: string | null;

    @Field({ nullable: true })
    OtherPhone: string | null;

    @Field({ nullable: true })
    AssistantPhone: string | null;

    @Field({ nullable: true })
    ReportsToId: string | null;

    @Field({ nullable: true })
    Email: string | null;

    @Field({ nullable: true })
    Title: string | null;

    @Field({ nullable: true })
    Department: string | null;

    @Field({ nullable: true })
    AssistantName: string | null;

    @Field({ nullable: true })
    LeadSource: string | null;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    OwnerId: string | null;

    @Field(() => Boolean, { nullable: true })
    HasOptedOutOfEmail: boolean | null;

    @Field(() => Boolean, { nullable: true })
    HasOptedOutOfFax: boolean | null;

    @Field(() => Boolean, { nullable: true })
    DoNotCall: boolean | null;

    @Field({ nullable: true })
    CreatedById: string | null;

    @Field({ nullable: true })
    LastModifiedById: string | null;

    @Field({ nullable: true })
    EmailBouncedReason: string | null;

    @Field(() => Boolean, { nullable: true })
    IsEmailBounced: boolean | null;

    @Field({ nullable: true })
    PhotoUrl: string | null;

    @Field({ nullable: true })
    Jigsaw: string | null;

    @Field({ nullable: true })
    JigsawContactId: string | null;

    @Field({ nullable: true })
    IndividualId: string | null;

    @Field({ nullable: true })
    NU__ExternalID__c: string | null;

    @Field({ nullable: true })
    ET_Field_Rep__c: string | null;

    @Field({ nullable: true })
    Deskcom__twitter_username__c: string | null;

    @Field({ nullable: true })
    e4sf__Engage_Address_City__c: string | null;

    @Field({ nullable: true })
    e4sf__Engage_Address_Country__c: string | null;

    @Field({ nullable: true })
    e4sf__Engage_Address_PostalCode__c: string | null;

    @Field({ nullable: true })
    e4sf__Engage_Address_State__c: string | null;

    @Field({ nullable: true })
    e4sf__Engage_Address_Street__c: string | null;

    @Field({ nullable: true })
    e4sf__Engage_Batch_Id__c: string | null;

    @Field({ nullable: true })
    e4sf__Engage_Ext_Id__c: string | null;

    @Field({ nullable: true })
    e4sf__Engage_Federal_District_Lower_Chamber__c: string | null;

    @Field({ nullable: true })
    e4sf__Engage_Federal_District_Upper_Chamber__c: string | null;

    @Field(() => Boolean, { nullable: true })
    e4sf__Engage_Is_Advocate__c: boolean | null;

    @Field(() => Boolean, { nullable: true })
    e4sf__Engage_Never_Sync_To_Engage__c: boolean | null;

    @Field(() => Boolean, { nullable: true })
    e4sf__Engage_Opt_Out__c: boolean | null;

    @Field({ nullable: true })
    e4sf__Engage_Phone__c: string | null;

    @Field({ nullable: true })
    e4sf__Engage_State_District_Lower_Chamber__c: string | null;

    @Field({ nullable: true })
    e4sf__Engage_State_District_Upper_Chamber__c: string | null;

    @Field({ nullable: true })
    geopointe__Geocode__c: string | null;

    @Field({ nullable: true })
    rrpu__Alert_Message__c: string | null;

    @Field(() => Float, { nullable: true })
    CloudingoAgent__CES__c: number | null;

    @Field({ nullable: true })
    CloudingoAgent__MAR__c: string | null;

    @Field(() => Float, { nullable: true })
    CloudingoAgent__MAS__c: number | null;

    @Field({ nullable: true })
    CloudingoAgent__MAV__c: string | null;

    @Field({ nullable: true })
    CloudingoAgent__MRDI__c: string | null;

    @Field({ nullable: true })
    CloudingoAgent__MTZ__c: string | null;

    @Field({ nullable: true })
    CloudingoAgent__OAR__c: string | null;

    @Field(() => Float, { nullable: true })
    CloudingoAgent__OAS__c: number | null;

    @Field({ nullable: true })
    CloudingoAgent__OAV__c: string | null;

    @Field({ nullable: true })
    CloudingoAgent__ORDI__c: string | null;

    @Field({ nullable: true })
    CloudingoAgent__OTZ__c: string | null;

    @Field(() => Boolean, { nullable: true })
    NC_DPP__Anonymize__c: boolean | null;

    @Field(() => Boolean, { nullable: true })
    NC_DPP__Consented__c: boolean | null;

    @Field({ nullable: true })
    NU__Biography__c: string | null;

    @Field({ nullable: true })
    NU__Degrees__c: string | null;

    @Field({ nullable: true })
    NU__DoctoralInstitution__c: string | null;

    @Field({ nullable: true })
    NU__Expertise__c: string | null;

    @Field({ nullable: true })
    NU__GraduateInstitution__c: string | null;

    @Field({ nullable: true })
    NU__Interests__c: string | null;

    @Field({ nullable: true })
    NU__UndergraduateInstitution__c: string | null;

    @Field(() => Boolean, { nullable: true })
    et4ae5__HasOptedOutOfMobile__c: boolean | null;

    @Field({ nullable: true })
    et4ae5__Mobile_Country_Code__c: string | null;

    @Field(() => Boolean, { nullable: true })
    qualtrics__Informed_Consent__c: boolean | null;

    @Field(() => Float, { nullable: true })
    qualtrics__Net_Promoter_Score__c: number | null;

    @Field(() => Boolean, { nullable: true })
    is_eligible_for_SFMC_sync__c: boolean | null;

    @Field({ nullable: true })
    Long_Form_ID__c: string | null;

    @Field({ nullable: true })
    Institution__c: string | null;

    @Field({ nullable: true })
    Member__c: string | null;

    @Field(() => Boolean, { nullable: true })
    Eligible_For_SFMC_Sync__c: boolean | null;

    @Field(() => Float, { nullable: true })
    DESKSCMT__Desk_Customer_Id__c: number | null;

    @Field(() => Boolean, { nullable: true })
    DESKSCMT__Desk_Migrated_Contact__c: boolean | null;

    @Field({ nullable: true })
    title__c: string | null;

    @Field(() => Float, { nullable: true })
    P2A__Advocate_ID__c: number | null;

    @Field({ nullable: true })
    P2A__City_District__c: string | null;

    @Field({ nullable: true })
    P2A__County__c: string | null;

    @Field({ nullable: true })
    P2A__Federal_House_District__c: string | null;

    @Field(() => Boolean, { nullable: true })
    P2A__Phone2Action_Email_Optin__c: boolean | null;

    @Field({ nullable: true })
    P2A__State_House_District__c: string | null;

    @Field({ nullable: true })
    P2A__State_Senate_District__c: string | null;

    @Field(() => Boolean, { nullable: true })
    P2A__Synced__c: boolean | null;

    @Field({ nullable: true })
    external_id__c: string | null;

    @Field({ nullable: true })
    background__c: string | null;

    @Field({ nullable: true })
    language__c: string | null;

    @Field(() => Boolean, { nullable: true })
    access_private_portal__c: boolean | null;

    @Field(() => Boolean, { nullable: true })
    access_company_cases__c: boolean | null;

    @Field(() => Float, { nullable: true })
    Desk_Id__c: number | null;

    @Field({ nullable: true })
    rcsfl__SMS_Number__c: string | null;

    @Field({ nullable: true })
    rcsfl__SendSMS__c: string | null;

    @Field({ nullable: true })
    Troubleshoot: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Contacts
//****************************************************************************
@InputType()
export class UpdateContactInput {
    @Field()
    Id: string;

    @Field(() => Boolean, { nullable: true })
    IsDeleted?: boolean | null;

    @Field({ nullable: true })
    MasterRecordId?: string | null;

    @Field({ nullable: true })
    AccountId?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsPersonAccount?: boolean | null;

    @Field({ nullable: true })
    LastName?: string | null;

    @Field({ nullable: true })
    FirstName?: string | null;

    @Field({ nullable: true })
    Salutation?: string | null;

    @Field({ nullable: true })
    Name?: string | null;

    @Field({ nullable: true })
    OtherStreet?: string | null;

    @Field({ nullable: true })
    OtherCity?: string | null;

    @Field({ nullable: true })
    OtherState?: string | null;

    @Field({ nullable: true })
    OtherPostalCode?: string | null;

    @Field({ nullable: true })
    OtherCountry?: string | null;

    @Field(() => Float, { nullable: true })
    OtherLatitude?: number | null;

    @Field(() => Float, { nullable: true })
    OtherLongitude?: number | null;

    @Field({ nullable: true })
    OtherGeocodeAccuracy?: string | null;

    @Field({ nullable: true })
    MailingStreet?: string | null;

    @Field({ nullable: true })
    MailingCity?: string | null;

    @Field({ nullable: true })
    MailingState?: string | null;

    @Field({ nullable: true })
    MailingPostalCode?: string | null;

    @Field({ nullable: true })
    MailingCountry?: string | null;

    @Field(() => Float, { nullable: true })
    MailingLatitude?: number | null;

    @Field(() => Float, { nullable: true })
    MailingLongitude?: number | null;

    @Field({ nullable: true })
    MailingGeocodeAccuracy?: string | null;

    @Field({ nullable: true })
    Phone?: string | null;

    @Field({ nullable: true })
    Fax?: string | null;

    @Field({ nullable: true })
    MobilePhone?: string | null;

    @Field({ nullable: true })
    HomePhone?: string | null;

    @Field({ nullable: true })
    OtherPhone?: string | null;

    @Field({ nullable: true })
    AssistantPhone?: string | null;

    @Field({ nullable: true })
    ReportsToId?: string | null;

    @Field({ nullable: true })
    Email?: string | null;

    @Field({ nullable: true })
    Title?: string | null;

    @Field({ nullable: true })
    Department?: string | null;

    @Field({ nullable: true })
    AssistantName?: string | null;

    @Field({ nullable: true })
    LeadSource?: string | null;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    OwnerId?: string | null;

    @Field(() => Boolean, { nullable: true })
    HasOptedOutOfEmail?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    HasOptedOutOfFax?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    DoNotCall?: boolean | null;

    @Field({ nullable: true })
    CreatedById?: string | null;

    @Field({ nullable: true })
    LastModifiedById?: string | null;

    @Field({ nullable: true })
    EmailBouncedReason?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsEmailBounced?: boolean | null;

    @Field({ nullable: true })
    PhotoUrl?: string | null;

    @Field({ nullable: true })
    Jigsaw?: string | null;

    @Field({ nullable: true })
    JigsawContactId?: string | null;

    @Field({ nullable: true })
    IndividualId?: string | null;

    @Field({ nullable: true })
    NU__ExternalID__c?: string | null;

    @Field({ nullable: true })
    ET_Field_Rep__c?: string | null;

    @Field({ nullable: true })
    Deskcom__twitter_username__c?: string | null;

    @Field({ nullable: true })
    e4sf__Engage_Address_City__c?: string | null;

    @Field({ nullable: true })
    e4sf__Engage_Address_Country__c?: string | null;

    @Field({ nullable: true })
    e4sf__Engage_Address_PostalCode__c?: string | null;

    @Field({ nullable: true })
    e4sf__Engage_Address_State__c?: string | null;

    @Field({ nullable: true })
    e4sf__Engage_Address_Street__c?: string | null;

    @Field({ nullable: true })
    e4sf__Engage_Batch_Id__c?: string | null;

    @Field({ nullable: true })
    e4sf__Engage_Ext_Id__c?: string | null;

    @Field({ nullable: true })
    e4sf__Engage_Federal_District_Lower_Chamber__c?: string | null;

    @Field({ nullable: true })
    e4sf__Engage_Federal_District_Upper_Chamber__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    e4sf__Engage_Is_Advocate__c?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    e4sf__Engage_Never_Sync_To_Engage__c?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    e4sf__Engage_Opt_Out__c?: boolean | null;

    @Field({ nullable: true })
    e4sf__Engage_Phone__c?: string | null;

    @Field({ nullable: true })
    e4sf__Engage_State_District_Lower_Chamber__c?: string | null;

    @Field({ nullable: true })
    e4sf__Engage_State_District_Upper_Chamber__c?: string | null;

    @Field({ nullable: true })
    geopointe__Geocode__c?: string | null;

    @Field({ nullable: true })
    rrpu__Alert_Message__c?: string | null;

    @Field(() => Float, { nullable: true })
    CloudingoAgent__CES__c?: number | null;

    @Field({ nullable: true })
    CloudingoAgent__MAR__c?: string | null;

    @Field(() => Float, { nullable: true })
    CloudingoAgent__MAS__c?: number | null;

    @Field({ nullable: true })
    CloudingoAgent__MAV__c?: string | null;

    @Field({ nullable: true })
    CloudingoAgent__MRDI__c?: string | null;

    @Field({ nullable: true })
    CloudingoAgent__MTZ__c?: string | null;

    @Field({ nullable: true })
    CloudingoAgent__OAR__c?: string | null;

    @Field(() => Float, { nullable: true })
    CloudingoAgent__OAS__c?: number | null;

    @Field({ nullable: true })
    CloudingoAgent__OAV__c?: string | null;

    @Field({ nullable: true })
    CloudingoAgent__ORDI__c?: string | null;

    @Field({ nullable: true })
    CloudingoAgent__OTZ__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    NC_DPP__Anonymize__c?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    NC_DPP__Consented__c?: boolean | null;

    @Field({ nullable: true })
    NU__Biography__c?: string | null;

    @Field({ nullable: true })
    NU__Degrees__c?: string | null;

    @Field({ nullable: true })
    NU__DoctoralInstitution__c?: string | null;

    @Field({ nullable: true })
    NU__Expertise__c?: string | null;

    @Field({ nullable: true })
    NU__GraduateInstitution__c?: string | null;

    @Field({ nullable: true })
    NU__Interests__c?: string | null;

    @Field({ nullable: true })
    NU__UndergraduateInstitution__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    et4ae5__HasOptedOutOfMobile__c?: boolean | null;

    @Field({ nullable: true })
    et4ae5__Mobile_Country_Code__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    qualtrics__Informed_Consent__c?: boolean | null;

    @Field(() => Float, { nullable: true })
    qualtrics__Net_Promoter_Score__c?: number | null;

    @Field(() => Boolean, { nullable: true })
    is_eligible_for_SFMC_sync__c?: boolean | null;

    @Field({ nullable: true })
    Long_Form_ID__c?: string | null;

    @Field({ nullable: true })
    Institution__c?: string | null;

    @Field({ nullable: true })
    Member__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    Eligible_For_SFMC_Sync__c?: boolean | null;

    @Field(() => Float, { nullable: true })
    DESKSCMT__Desk_Customer_Id__c?: number | null;

    @Field(() => Boolean, { nullable: true })
    DESKSCMT__Desk_Migrated_Contact__c?: boolean | null;

    @Field({ nullable: true })
    title__c?: string | null;

    @Field(() => Float, { nullable: true })
    P2A__Advocate_ID__c?: number | null;

    @Field({ nullable: true })
    P2A__City_District__c?: string | null;

    @Field({ nullable: true })
    P2A__County__c?: string | null;

    @Field({ nullable: true })
    P2A__Federal_House_District__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    P2A__Phone2Action_Email_Optin__c?: boolean | null;

    @Field({ nullable: true })
    P2A__State_House_District__c?: string | null;

    @Field({ nullable: true })
    P2A__State_Senate_District__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    P2A__Synced__c?: boolean | null;

    @Field({ nullable: true })
    external_id__c?: string | null;

    @Field({ nullable: true })
    background__c?: string | null;

    @Field({ nullable: true })
    language__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    access_private_portal__c?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    access_company_cases__c?: boolean | null;

    @Field(() => Float, { nullable: true })
    Desk_Id__c?: number | null;

    @Field({ nullable: true })
    rcsfl__SMS_Number__c?: string | null;

    @Field({ nullable: true })
    rcsfl__SendSMS__c?: string | null;

    @Field({ nullable: true })
    Troubleshoot?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Contacts
//****************************************************************************
@ObjectType()
export class RunContactViewResult {
    @Field(() => [Contact_])
    Results: Contact_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(Contact_)
export class ContactResolver extends ResolverBase {
    @Query(() => RunContactViewResult)
    async RunContactViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunContactViewResult)
    async RunContactViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunContactViewResult)
    async RunContactDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Contacts';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => Contact_, { nullable: true })
    async Contact(@Arg('Id', () => String) Id: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Contact_ | null> {
        this.CheckUserReadPermissions('Contacts', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [nams].[vwContacts] WHERE [Id]='${Id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Contacts', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Contacts', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @FieldResolver(() => [Person_])
    async Persons_NimbleContactIDArray(@Root() contact_: Contact_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Persons', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [common].[vwPersons] WHERE [NimbleContactID]='${contact_.Id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Persons', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.ArrayMapFieldNamesToCodeNames('Persons', rows);
        return result;
    }
        
    @Mutation(() => Contact_)
    async CreateContact(
        @Arg('input', () => CreateContactInput) input: CreateContactInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Contacts', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => Contact_)
    async UpdateContact(
        @Arg('input', () => UpdateContactInput) input: UpdateContactInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Contacts', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => Contact_)
    async DeleteContact(@Arg('Id', () => String) Id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'Id', Value: Id}]);
        return this.DeleteRecord('Contacts', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Affiliations
//****************************************************************************
@ObjectType()
export class NU__Affiliation__c_ {
    @Field() 
    @MaxLength(100)
    Id: string;
        
    @Field({nullable: true}) 
    OwnerId?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    IsDeleted?: boolean;
        
    @Field({nullable: true}) 
    Name?: string;
        
    @Field({nullable: true}) 
    CreatedById?: string;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    LastModifiedDate?: Date;
        
    @Field({nullable: true}) 
    LastModifiedById?: string;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    SystemModstamp?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    LastActivityDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    LastViewedDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    LastReferencedDate?: Date;
        
    @Field({nullable: true}) 
    NU__Account__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    NU__DoNotFlowdownAddress__c?: boolean;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    NU__EndDate__c?: Date;
        
    @Field({nullable: true}) 
    NU__ExternalID__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    NU__IsCompanyManager__c?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    NU__IsPrimary__c?: boolean;
        
    @Field({nullable: true}) 
    NU__ParentAccount__c?: string;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    NU__RemovalDate__c?: Date;
        
    @Field({nullable: true}) 
    NU__RemovalReason__c?: string;
        
    @Field({nullable: true}) 
    NU__Role__c?: string;
        
    @Field({nullable: true}) 
    NU__Search__c?: string;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    NU__StartDate__c?: Date;
        
    @Field(() => Boolean, {nullable: true}) 
    Is_CTA_Leader__c?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    NU__IsPrimaryContact__c?: boolean;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    NU__RemovalDate2__c?: Date;
        
    @Field({nullable: true}) 
    NU__StatusFlag__c?: string;
        
    @Field({nullable: true}) 
    NU__Status__c?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    Troubleshoot?: string;
        
}

//****************************************************************************
// INPUT TYPE for Affiliations
//****************************************************************************
@InputType()
export class CreateNU__Affiliation__cInput {
    @Field({ nullable: true })
    Id?: string;

    @Field({ nullable: true })
    OwnerId: string | null;

    @Field(() => Boolean, { nullable: true })
    IsDeleted: boolean | null;

    @Field({ nullable: true })
    Name: string | null;

    @Field({ nullable: true })
    CreatedById: string | null;

    @Field({ nullable: true })
    LastModifiedById: string | null;

    @Field({ nullable: true })
    NU__Account__c: string | null;

    @Field(() => Boolean, { nullable: true })
    NU__DoNotFlowdownAddress__c: boolean | null;

    @Field({ nullable: true })
    NU__ExternalID__c: string | null;

    @Field(() => Boolean, { nullable: true })
    NU__IsCompanyManager__c: boolean | null;

    @Field(() => Boolean, { nullable: true })
    NU__IsPrimary__c: boolean | null;

    @Field({ nullable: true })
    NU__ParentAccount__c: string | null;

    @Field({ nullable: true })
    NU__RemovalReason__c: string | null;

    @Field({ nullable: true })
    NU__Role__c: string | null;

    @Field({ nullable: true })
    NU__Search__c: string | null;

    @Field(() => Boolean, { nullable: true })
    Is_CTA_Leader__c: boolean | null;

    @Field(() => Boolean, { nullable: true })
    NU__IsPrimaryContact__c: boolean | null;

    @Field({ nullable: true })
    NU__StatusFlag__c: string | null;

    @Field({ nullable: true })
    NU__Status__c: string | null;

    @Field({ nullable: true })
    Troubleshoot: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Affiliations
//****************************************************************************
@InputType()
export class UpdateNU__Affiliation__cInput {
    @Field()
    Id: string;

    @Field({ nullable: true })
    OwnerId?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsDeleted?: boolean | null;

    @Field({ nullable: true })
    Name?: string | null;

    @Field({ nullable: true })
    CreatedById?: string | null;

    @Field({ nullable: true })
    LastModifiedById?: string | null;

    @Field({ nullable: true })
    NU__Account__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    NU__DoNotFlowdownAddress__c?: boolean | null;

    @Field({ nullable: true })
    NU__ExternalID__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    NU__IsCompanyManager__c?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    NU__IsPrimary__c?: boolean | null;

    @Field({ nullable: true })
    NU__ParentAccount__c?: string | null;

    @Field({ nullable: true })
    NU__RemovalReason__c?: string | null;

    @Field({ nullable: true })
    NU__Role__c?: string | null;

    @Field({ nullable: true })
    NU__Search__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    Is_CTA_Leader__c?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    NU__IsPrimaryContact__c?: boolean | null;

    @Field({ nullable: true })
    NU__StatusFlag__c?: string | null;

    @Field({ nullable: true })
    NU__Status__c?: string | null;

    @Field({ nullable: true })
    Troubleshoot?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Affiliations
//****************************************************************************
@ObjectType()
export class RunNU__Affiliation__cViewResult {
    @Field(() => [NU__Affiliation__c_])
    Results: NU__Affiliation__c_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(NU__Affiliation__c_)
export class NU__Affiliation__cResolver extends ResolverBase {
    @Query(() => RunNU__Affiliation__cViewResult)
    async RunNU__Affiliation__cViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunNU__Affiliation__cViewResult)
    async RunNU__Affiliation__cViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunNU__Affiliation__cViewResult)
    async RunNU__Affiliation__cDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Affiliations';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => NU__Affiliation__c_, { nullable: true })
    async NU__Affiliation__c(@Arg('Id', () => String) Id: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<NU__Affiliation__c_ | null> {
        this.CheckUserReadPermissions('Affiliations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [nams].[vwNU__Affiliation__cs] WHERE [Id]='${Id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Affiliations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Affiliations', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @Mutation(() => NU__Affiliation__c_)
    async CreateNU__Affiliation__c(
        @Arg('input', () => CreateNU__Affiliation__cInput) input: CreateNU__Affiliation__cInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Affiliations', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => NU__Affiliation__c_)
    async UpdateNU__Affiliation__c(
        @Arg('input', () => UpdateNU__Affiliation__cInput) input: UpdateNU__Affiliation__cInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Affiliations', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => NU__Affiliation__c_)
    async DeleteNU__Affiliation__c(@Arg('Id', () => String) Id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'Id', Value: Id}]);
        return this.DeleteRecord('Affiliations', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Committees
//****************************************************************************
@ObjectType()
export class NU__Committee__c_ {
    @Field() 
    @MaxLength(100)
    Id: string;
        
    @Field({nullable: true}) 
    OwnerId?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    IsDeleted?: boolean;
        
    @Field({nullable: true}) 
    Name?: string;
        
    @Field({nullable: true}) 
    CreatedById?: string;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    LastModifiedDate?: Date;
        
    @Field({nullable: true}) 
    LastModifiedById?: string;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    SystemModstamp?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    LastActivityDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    LastViewedDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    LastReferencedDate?: Date;
        
    @Field({nullable: true}) 
    NU__AvailableTitles__c?: string;
        
    @Field({nullable: true}) 
    NU__CommitteeShortName__c?: string;
        
    @Field({nullable: true}) 
    NU__Description__c?: string;
        
    @Field({nullable: true}) 
    NU__ExternalID__c?: string;
        
    @Field({nullable: true}) 
    NU__FullDescription__c?: string;
        
    @Field({nullable: true}) 
    NU__Status__c?: string;
        
    @Field(() => Float, {nullable: true}) 
    NU__TermMonths__c?: number;
        
    @Field({nullable: true}) 
    NU__Type__c?: string;
        
    @Field(() => Float, {nullable: true}) 
    NU__CommitteeCount__c?: number;
        
    @Field({nullable: true}) 
    Account__c?: string;
        
    @Field({nullable: true}) 
    Staff_Liaison_1__c?: string;
        
    @Field({nullable: true}) 
    Staff_Liaison_2__c?: string;
        
    @Field({nullable: true}) 
    Staff_Liaison_3__c?: string;
        
    @Field({nullable: true}) 
    Terms_Allowed__c?: string;
        
    @Field(() => Float, {nullable: true}) 
    Current_Committee_Member_Count__c?: number;
        
    @Field({nullable: true}) 
    Owner_ExternalID__c?: string;
        
    @Field({nullable: true}) 
    CommitteeRecordID__c?: string;
        
    @Field(() => Float, {nullable: true}) 
    CCTA_Dues_Forward_Eligible__c?: number;
        
    @Field(() => Float, {nullable: true}) 
    CCTA_Dues_Forward_Ineligible__c?: number;
        
    @Field({nullable: true}) 
    ChatterGroupId__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    CommunityGroup__c?: boolean;
        
    @Field({nullable: true}) 
    Staff_Liaison_4__c?: string;
        
    @Field({nullable: true}) 
    Staff_Liaison_5__c?: string;
        
    @Field(() => Float, {nullable: true}) 
    NU__CommitteeCount2__c?: number;
        
    @Field({nullable: true}) 
    Collaboration_Group_ID__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    Uses_Community_Group_Automation__c?: boolean;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    Troubleshoot?: string;
        
}

//****************************************************************************
// INPUT TYPE for Committees
//****************************************************************************
@InputType()
export class CreateNU__Committee__cInput {
    @Field({ nullable: true })
    Id?: string;

    @Field({ nullable: true })
    OwnerId: string | null;

    @Field(() => Boolean, { nullable: true })
    IsDeleted: boolean | null;

    @Field({ nullable: true })
    Name: string | null;

    @Field({ nullable: true })
    CreatedById: string | null;

    @Field({ nullable: true })
    LastModifiedById: string | null;

    @Field({ nullable: true })
    NU__AvailableTitles__c: string | null;

    @Field({ nullable: true })
    NU__CommitteeShortName__c: string | null;

    @Field({ nullable: true })
    NU__Description__c: string | null;

    @Field({ nullable: true })
    NU__ExternalID__c: string | null;

    @Field({ nullable: true })
    NU__FullDescription__c: string | null;

    @Field({ nullable: true })
    NU__Status__c: string | null;

    @Field(() => Float, { nullable: true })
    NU__TermMonths__c: number | null;

    @Field({ nullable: true })
    NU__Type__c: string | null;

    @Field(() => Float, { nullable: true })
    NU__CommitteeCount__c: number | null;

    @Field({ nullable: true })
    Account__c: string | null;

    @Field({ nullable: true })
    Staff_Liaison_1__c: string | null;

    @Field({ nullable: true })
    Staff_Liaison_2__c: string | null;

    @Field({ nullable: true })
    Staff_Liaison_3__c: string | null;

    @Field({ nullable: true })
    Terms_Allowed__c: string | null;

    @Field(() => Float, { nullable: true })
    Current_Committee_Member_Count__c: number | null;

    @Field({ nullable: true })
    Owner_ExternalID__c: string | null;

    @Field({ nullable: true })
    CommitteeRecordID__c: string | null;

    @Field(() => Float, { nullable: true })
    CCTA_Dues_Forward_Eligible__c: number | null;

    @Field(() => Float, { nullable: true })
    CCTA_Dues_Forward_Ineligible__c: number | null;

    @Field({ nullable: true })
    ChatterGroupId__c: string | null;

    @Field(() => Boolean, { nullable: true })
    CommunityGroup__c: boolean | null;

    @Field({ nullable: true })
    Staff_Liaison_4__c: string | null;

    @Field({ nullable: true })
    Staff_Liaison_5__c: string | null;

    @Field(() => Float, { nullable: true })
    NU__CommitteeCount2__c: number | null;

    @Field({ nullable: true })
    Collaboration_Group_ID__c: string | null;

    @Field(() => Boolean, { nullable: true })
    Uses_Community_Group_Automation__c: boolean | null;

    @Field({ nullable: true })
    Troubleshoot: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Committees
//****************************************************************************
@InputType()
export class UpdateNU__Committee__cInput {
    @Field()
    Id: string;

    @Field({ nullable: true })
    OwnerId?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsDeleted?: boolean | null;

    @Field({ nullable: true })
    Name?: string | null;

    @Field({ nullable: true })
    CreatedById?: string | null;

    @Field({ nullable: true })
    LastModifiedById?: string | null;

    @Field({ nullable: true })
    NU__AvailableTitles__c?: string | null;

    @Field({ nullable: true })
    NU__CommitteeShortName__c?: string | null;

    @Field({ nullable: true })
    NU__Description__c?: string | null;

    @Field({ nullable: true })
    NU__ExternalID__c?: string | null;

    @Field({ nullable: true })
    NU__FullDescription__c?: string | null;

    @Field({ nullable: true })
    NU__Status__c?: string | null;

    @Field(() => Float, { nullable: true })
    NU__TermMonths__c?: number | null;

    @Field({ nullable: true })
    NU__Type__c?: string | null;

    @Field(() => Float, { nullable: true })
    NU__CommitteeCount__c?: number | null;

    @Field({ nullable: true })
    Account__c?: string | null;

    @Field({ nullable: true })
    Staff_Liaison_1__c?: string | null;

    @Field({ nullable: true })
    Staff_Liaison_2__c?: string | null;

    @Field({ nullable: true })
    Staff_Liaison_3__c?: string | null;

    @Field({ nullable: true })
    Terms_Allowed__c?: string | null;

    @Field(() => Float, { nullable: true })
    Current_Committee_Member_Count__c?: number | null;

    @Field({ nullable: true })
    Owner_ExternalID__c?: string | null;

    @Field({ nullable: true })
    CommitteeRecordID__c?: string | null;

    @Field(() => Float, { nullable: true })
    CCTA_Dues_Forward_Eligible__c?: number | null;

    @Field(() => Float, { nullable: true })
    CCTA_Dues_Forward_Ineligible__c?: number | null;

    @Field({ nullable: true })
    ChatterGroupId__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    CommunityGroup__c?: boolean | null;

    @Field({ nullable: true })
    Staff_Liaison_4__c?: string | null;

    @Field({ nullable: true })
    Staff_Liaison_5__c?: string | null;

    @Field(() => Float, { nullable: true })
    NU__CommitteeCount2__c?: number | null;

    @Field({ nullable: true })
    Collaboration_Group_ID__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    Uses_Community_Group_Automation__c?: boolean | null;

    @Field({ nullable: true })
    Troubleshoot?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Committees
//****************************************************************************
@ObjectType()
export class RunNU__Committee__cViewResult {
    @Field(() => [NU__Committee__c_])
    Results: NU__Committee__c_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(NU__Committee__c_)
export class NU__Committee__cResolver extends ResolverBase {
    @Query(() => RunNU__Committee__cViewResult)
    async RunNU__Committee__cViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunNU__Committee__cViewResult)
    async RunNU__Committee__cViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunNU__Committee__cViewResult)
    async RunNU__Committee__cDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Committees';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => NU__Committee__c_, { nullable: true })
    async NU__Committee__c(@Arg('Id', () => String) Id: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<NU__Committee__c_ | null> {
        this.CheckUserReadPermissions('Committees', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [nams].[vwNU__Committee__cs] WHERE [Id]='${Id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Committees', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Committees', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @Mutation(() => NU__Committee__c_)
    async CreateNU__Committee__c(
        @Arg('input', () => CreateNU__Committee__cInput) input: CreateNU__Committee__cInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Committees', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => NU__Committee__c_)
    async UpdateNU__Committee__c(
        @Arg('input', () => UpdateNU__Committee__cInput) input: UpdateNU__Committee__cInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Committees', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => NU__Committee__c_)
    async DeleteNU__Committee__c(@Arg('Id', () => String) Id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'Id', Value: Id}]);
        return this.DeleteRecord('Committees', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Committee Memberships
//****************************************************************************
@ObjectType()
export class NU__CommitteeMembership__c_ {
    @Field() 
    @MaxLength(100)
    Id: string;
        
    @Field(() => Boolean, {nullable: true}) 
    IsDeleted?: boolean;
        
    @Field({nullable: true}) 
    Name?: string;
        
    @Field({nullable: true}) 
    CreatedById?: string;
        
    @Field(() => Int, {nullable: true}) 
    LastModifiedDate?: Date;
        
    @Field({nullable: true}) 
    LastModifiedById?: string;
        
    @Field(() => Int, {nullable: true}) 
    SystemModstamp?: Date;
        
    @Field(() => Int, {nullable: true}) 
    LastActivityDate?: Date;
        
    @Field(() => Int, {nullable: true}) 
    LastViewedDate?: Date;
        
    @Field(() => Int, {nullable: true}) 
    LastReferencedDate?: Date;
        
    @Field({nullable: true}) 
    NU__Account__c?: string;
        
    @Field({nullable: true}) 
    NU__Committee__c?: string;
        
    @Field({nullable: true}) 
    NU__CommitteePosition__c?: string;
        
    @Field(() => Int, {nullable: true}) 
    NU__EndDate__c?: Date;
        
    @Field({nullable: true}) 
    NU__ExternalID__c?: string;
        
    @Field({nullable: true}) 
    NU__FormulaPositionSort__c?: string;
        
    @Field({nullable: true}) 
    NU__MemberEmail__c?: string;
        
    @Field({nullable: true}) 
    NU__Position__c?: string;
        
    @Field({nullable: true}) 
    NU__Search__c?: string;
        
    @Field(() => Int, {nullable: true}) 
    NU__StartDate__c?: Date;
        
    @Field({nullable: true}) 
    NU__State__c?: string;
        
    @Field({nullable: true}) 
    NU__StatusFlag__c?: string;
        
    @Field({nullable: true}) 
    NU__SupportingOrganization__c?: string;
        
    @Field({nullable: true}) 
    Term__c?: string;
        
    @Field({nullable: true}) 
    NU__StampedState__c?: string;
        
    @Field({nullable: true}) 
    Committee_Short_Name__c?: string;
        
    @Field({nullable: true}) 
    Committee_Type__c?: string;
        
    @Field({nullable: true}) 
    Member_ID__c?: string;
        
    @Field({nullable: true}) 
    CommitteePositionName__c?: string;
        
    @Field({nullable: true}) 
    CommitteeName__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    CTA_Dues_Forward_Eligible__c?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    CTA_Dues_Forward_Ineligible__c?: boolean;
        
    @Field({nullable: true}) 
    Committee_Account__c?: string;
        
    @Field({nullable: true}) 
    Committee_Account_ID__c?: string;
        
    @Field({nullable: true}) 
    NU__Account2__c?: string;
        
    @Field({nullable: true}) 
    NU__Committee2__c?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    Troubleshoot?: string;
        
}

//****************************************************************************
// INPUT TYPE for Committee Memberships
//****************************************************************************
@InputType()
export class CreateNU__CommitteeMembership__cInput {
    @Field({ nullable: true })
    Id?: string;

    @Field(() => Boolean, { nullable: true })
    IsDeleted: boolean | null;

    @Field({ nullable: true })
    Name: string | null;

    @Field({ nullable: true })
    CreatedById: string | null;

    @Field(() => Int, { nullable: true })
    LastModifiedDate: Date | null;

    @Field({ nullable: true })
    LastModifiedById: string | null;

    @Field(() => Int, { nullable: true })
    SystemModstamp: Date | null;

    @Field(() => Int, { nullable: true })
    LastActivityDate: Date | null;

    @Field(() => Int, { nullable: true })
    LastViewedDate: Date | null;

    @Field(() => Int, { nullable: true })
    LastReferencedDate: Date | null;

    @Field({ nullable: true })
    NU__Account__c: string | null;

    @Field({ nullable: true })
    NU__Committee__c: string | null;

    @Field({ nullable: true })
    NU__CommitteePosition__c: string | null;

    @Field(() => Int, { nullable: true })
    NU__EndDate__c: Date | null;

    @Field({ nullable: true })
    NU__ExternalID__c: string | null;

    @Field({ nullable: true })
    NU__FormulaPositionSort__c: string | null;

    @Field({ nullable: true })
    NU__MemberEmail__c: string | null;

    @Field({ nullable: true })
    NU__Position__c: string | null;

    @Field({ nullable: true })
    NU__Search__c: string | null;

    @Field(() => Int, { nullable: true })
    NU__StartDate__c: Date | null;

    @Field({ nullable: true })
    NU__State__c: string | null;

    @Field({ nullable: true })
    NU__StatusFlag__c: string | null;

    @Field({ nullable: true })
    NU__SupportingOrganization__c: string | null;

    @Field({ nullable: true })
    Term__c: string | null;

    @Field({ nullable: true })
    NU__StampedState__c: string | null;

    @Field({ nullable: true })
    Committee_Short_Name__c: string | null;

    @Field({ nullable: true })
    Committee_Type__c: string | null;

    @Field({ nullable: true })
    Member_ID__c: string | null;

    @Field({ nullable: true })
    CommitteePositionName__c: string | null;

    @Field({ nullable: true })
    CommitteeName__c: string | null;

    @Field(() => Boolean, { nullable: true })
    CTA_Dues_Forward_Eligible__c: boolean | null;

    @Field(() => Boolean, { nullable: true })
    CTA_Dues_Forward_Ineligible__c: boolean | null;

    @Field({ nullable: true })
    Committee_Account__c: string | null;

    @Field({ nullable: true })
    Committee_Account_ID__c: string | null;

    @Field({ nullable: true })
    NU__Account2__c: string | null;

    @Field({ nullable: true })
    NU__Committee2__c: string | null;

    @Field({ nullable: true })
    Troubleshoot: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Committee Memberships
//****************************************************************************
@InputType()
export class UpdateNU__CommitteeMembership__cInput {
    @Field()
    Id: string;

    @Field(() => Boolean, { nullable: true })
    IsDeleted?: boolean | null;

    @Field({ nullable: true })
    Name?: string | null;

    @Field({ nullable: true })
    CreatedById?: string | null;

    @Field(() => Int, { nullable: true })
    LastModifiedDate?: Date | null;

    @Field({ nullable: true })
    LastModifiedById?: string | null;

    @Field(() => Int, { nullable: true })
    SystemModstamp?: Date | null;

    @Field(() => Int, { nullable: true })
    LastActivityDate?: Date | null;

    @Field(() => Int, { nullable: true })
    LastViewedDate?: Date | null;

    @Field(() => Int, { nullable: true })
    LastReferencedDate?: Date | null;

    @Field({ nullable: true })
    NU__Account__c?: string | null;

    @Field({ nullable: true })
    NU__Committee__c?: string | null;

    @Field({ nullable: true })
    NU__CommitteePosition__c?: string | null;

    @Field(() => Int, { nullable: true })
    NU__EndDate__c?: Date | null;

    @Field({ nullable: true })
    NU__ExternalID__c?: string | null;

    @Field({ nullable: true })
    NU__FormulaPositionSort__c?: string | null;

    @Field({ nullable: true })
    NU__MemberEmail__c?: string | null;

    @Field({ nullable: true })
    NU__Position__c?: string | null;

    @Field({ nullable: true })
    NU__Search__c?: string | null;

    @Field(() => Int, { nullable: true })
    NU__StartDate__c?: Date | null;

    @Field({ nullable: true })
    NU__State__c?: string | null;

    @Field({ nullable: true })
    NU__StatusFlag__c?: string | null;

    @Field({ nullable: true })
    NU__SupportingOrganization__c?: string | null;

    @Field({ nullable: true })
    Term__c?: string | null;

    @Field({ nullable: true })
    NU__StampedState__c?: string | null;

    @Field({ nullable: true })
    Committee_Short_Name__c?: string | null;

    @Field({ nullable: true })
    Committee_Type__c?: string | null;

    @Field({ nullable: true })
    Member_ID__c?: string | null;

    @Field({ nullable: true })
    CommitteePositionName__c?: string | null;

    @Field({ nullable: true })
    CommitteeName__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    CTA_Dues_Forward_Eligible__c?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    CTA_Dues_Forward_Ineligible__c?: boolean | null;

    @Field({ nullable: true })
    Committee_Account__c?: string | null;

    @Field({ nullable: true })
    Committee_Account_ID__c?: string | null;

    @Field({ nullable: true })
    NU__Account2__c?: string | null;

    @Field({ nullable: true })
    NU__Committee2__c?: string | null;

    @Field({ nullable: true })
    Troubleshoot?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Committee Memberships
//****************************************************************************
@ObjectType()
export class RunNU__CommitteeMembership__cViewResult {
    @Field(() => [NU__CommitteeMembership__c_])
    Results: NU__CommitteeMembership__c_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(NU__CommitteeMembership__c_)
export class NU__CommitteeMembership__cResolver extends ResolverBase {
    @Query(() => RunNU__CommitteeMembership__cViewResult)
    async RunNU__CommitteeMembership__cViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunNU__CommitteeMembership__cViewResult)
    async RunNU__CommitteeMembership__cViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunNU__CommitteeMembership__cViewResult)
    async RunNU__CommitteeMembership__cDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Committee Memberships';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => NU__CommitteeMembership__c_, { nullable: true })
    async NU__CommitteeMembership__c(@Arg('Id', () => String) Id: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<NU__CommitteeMembership__c_ | null> {
        this.CheckUserReadPermissions('Committee Memberships', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [nams].[vwNU__CommitteeMembership__cs] WHERE [Id]='${Id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Committee Memberships', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Committee Memberships', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @Mutation(() => NU__CommitteeMembership__c_)
    async CreateNU__CommitteeMembership__c(
        @Arg('input', () => CreateNU__CommitteeMembership__cInput) input: CreateNU__CommitteeMembership__cInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Committee Memberships', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => NU__CommitteeMembership__c_)
    async UpdateNU__CommitteeMembership__c(
        @Arg('input', () => UpdateNU__CommitteeMembership__cInput) input: UpdateNU__CommitteeMembership__cInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Committee Memberships', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => NU__CommitteeMembership__c_)
    async DeleteNU__CommitteeMembership__c(@Arg('Id', () => String) Id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'Id', Value: Id}]);
        return this.DeleteRecord('Committee Memberships', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Events
//****************************************************************************
@ObjectType()
export class NU__Event__c_ {
    @Field() 
    @MaxLength(100)
    Id: string;
        
    @Field(() => Boolean, {nullable: true}) 
    IsDeleted?: boolean;
        
    @Field({nullable: true}) 
    Name?: string;
        
    @Field({nullable: true}) 
    RecordTypeId?: string;
        
    @Field({nullable: true}) 
    CreatedById?: string;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    LastModifiedDate?: Date;
        
    @Field({nullable: true}) 
    LastModifiedById?: string;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    SystemModstamp?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    LastActivityDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    LastViewedDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    LastReferencedDate?: Date;
        
    @Field({nullable: true}) 
    NU__Entity__c?: string;
        
    @Field(() => Float, {nullable: true}) 
    NU__ActualCost__c?: number;
        
    @Field(() => Float, {nullable: true}) 
    NU__ActualRevenue__c?: number;
        
    @Field({nullable: true}) 
    NU__AddressLine1__c?: string;
        
    @Field({nullable: true}) 
    NU__AddressLine2__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    NU__AllowCoWorkerRegistration__c?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    NU__AllowGuestRegistration__c?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    NU__AllowSingleClickRegistration__c?: boolean;
        
    @Field({nullable: true}) 
    NU__BadgeLogo__c?: string;
        
    @Field(() => Float, {nullable: true}) 
    NU__BudgetedCosts__c?: number;
        
    @Field({nullable: true}) 
    NU__CentralPhoneNumber__c?: string;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    NU__CheckInTime__c?: Date;
        
    @Field({nullable: true}) 
    NU__City__c?: string;
        
    @Field({nullable: true}) 
    NU__ConfirmationText2__c?: string;
        
    @Field({nullable: true}) 
    NU__ConfirmationText__c?: string;
        
    @Field({nullable: true}) 
    NU__Country__c?: string;
        
    @Field({nullable: true}) 
    NU__Description__c?: string;
        
    @Field({nullable: true}) 
    NU__Directions__c?: string;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    NU__EarlyRegistrationCutOffDate__c?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    NU__EndDate__c?: Date;
        
    @Field(() => Boolean, {nullable: true}) 
    NU__EntityLogoOnBadgeEnabled__c?: boolean;
        
    @Field({nullable: true}) 
    NU__EventDetailsUrl__c?: string;
        
    @Field(() => Float, {nullable: true}) 
    NU__ExpectedRevenue__c?: number;
        
    @Field({nullable: true}) 
    NU__ExternalID__c?: string;
        
    @Field({nullable: true}) 
    NU__GuestPageDescription__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    NU__Hidden__c?: boolean;
        
    @Field({nullable: true}) 
    NU__InvoiceText__c?: string;
        
    @Field({nullable: true}) 
    NU__LegacyEventID__c?: string;
        
    @Field({nullable: true}) 
    NU__Location__c?: string;
        
    @Field({nullable: true}) 
    NU__Logo__c?: string;
        
    @Field(() => Float, {nullable: true}) 
    NU__MaxNumberOfRegistrations__c?: number;
        
    @Field({nullable: true}) 
    NU__PostalCode__c?: string;
        
    @Field({nullable: true}) 
    NU__QuestionPageDescription__c?: string;
        
    @Field({nullable: true}) 
    NU__RegistrantPageDescription__c?: string;
        
    @Field({nullable: true}) 
    NU__RegistrantSelectionPageDescription__c?: string;
        
    @Field({nullable: true}) 
    NU__RegistrationUrl__c?: string;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    NU__RegularRegistrationCutOffDate__c?: Date;
        
    @Field({nullable: true}) 
    NU__RestrictTo__c?: string;
        
    @Field({nullable: true}) 
    NU__RoomNameNumber__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    NU__SelfServiceEnabled__c?: boolean;
        
    @Field({nullable: true}) 
    NU__SessionPageDescription__c?: string;
        
    @Field({nullable: true}) 
    NU__ShortName__c?: string;
        
    @Field({nullable: true}) 
    NU__StaffContact__c?: string;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    NU__StartDate__c?: Date;
        
    @Field({nullable: true}) 
    NU__StateProvince__c?: string;
        
    @Field({nullable: true}) 
    NU__StatusFlag__c?: string;
        
    @Field({nullable: true}) 
    NU__Status__c?: string;
        
    @Field({nullable: true}) 
    NU__SummaryPageDescription__c?: string;
        
    @Field({nullable: true}) 
    NU__TwitterEventDetailTweet__c?: string;
        
    @Field({nullable: true}) 
    NU__TwitterOrderSummaryTweet__c?: string;
        
    @Field({nullable: true}) 
    NU__Twitter_Hash_Tag__c?: string;
        
    @Field({nullable: true}) 
    NU__Type__c?: string;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    NU__WebRegistrationEndDate__c?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    NU__WebRegistrationStartDate__c?: Date;
        
    @Field(() => Float, {nullable: true}) 
    NU__TotalCancellations2__c?: number;
        
    @Field(() => Float, {nullable: true}) 
    NU__TotalCancellations__c?: number;
        
    @Field(() => Float, {nullable: true}) 
    NU__TotalRegistrants2__c?: number;
        
    @Field(() => Float, {nullable: true}) 
    NU__TotalRegistrants__c?: number;
        
    @Field({nullable: true}) 
    Committee__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    NU__IsCancellable__c?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    MobileActive__c?: boolean;
        
    @Field({nullable: true}) 
    MobileFeedUrl__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    MobileHideNewsEntriesDate__c?: boolean;
        
    @Field({nullable: true}) 
    MobileItineraryTitle__c?: string;
        
    @Field({nullable: true}) 
    MobileNewsTitle__c?: string;
        
    @Field({nullable: true}) 
    MobileNewsTwitterIcon__c?: string;
        
    @Field({nullable: true}) 
    MobileNewsTwitterTitle__c?: string;
        
    @Field({nullable: true}) 
    MobileScheduleItineraryIcon__c?: string;
        
    @Field({nullable: true}) 
    MobileScheduleItineraryTitle__c?: string;
        
    @Field({nullable: true}) 
    MobileScheduleTitle__c?: string;
        
    @Field({nullable: true}) 
    MobileSection1Content__c?: string;
        
    @Field({nullable: true}) 
    MobileSection1Icon__c?: string;
        
    @Field({nullable: true}) 
    MobileSection1Title__c?: string;
        
    @Field({nullable: true}) 
    MobileSection2Content__c?: string;
        
    @Field({nullable: true}) 
    MobileSection2Icon__c?: string;
        
    @Field({nullable: true}) 
    MobileSection2Title__c?: string;
        
    @Field({nullable: true}) 
    MobileSection3Content__c?: string;
        
    @Field({nullable: true}) 
    MobileSection3Icon__c?: string;
        
    @Field({nullable: true}) 
    MobileSection3Title__c?: string;
        
    @Field({nullable: true}) 
    MobileSpeakersIcon__c?: string;
        
    @Field({nullable: true}) 
    MobileSpeakersTitle__c?: string;
        
    @Field({nullable: true}) 
    MobileSponsorsIcon__c?: string;
        
    @Field({nullable: true}) 
    MobileSponsorsTitle__c?: string;
        
    @Field({nullable: true}) 
    MobileTwitterTitle__c?: string;
        
    @Field({nullable: true}) 
    ChatterGroupId__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    CommunityGroup__c?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    IsBTAEvent__c?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    NU__IsEditable__c?: boolean;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    NU__RegistrationModificationCutOffDate__c?: Date;
        
    @Field(() => Boolean, {nullable: true}) 
    NU__WaitlistActiveInSelfService__c?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    NU__WaitlistEnabled__c?: boolean;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    NU__RegistrationCountLastUpdated__c?: Date;
        
    @Field({nullable: true}) 
    NU__ShortDescription__c?: string;
        
    @Field(() => Float, {nullable: true}) 
    NU__TotalCancellations3__c?: number;
        
    @Field(() => Float, {nullable: true}) 
    NU__TotalRegistrants3__c?: number;
        
    @Field(() => Boolean, {nullable: true}) 
    NC__CollectBadge__c?: boolean;
        
    @Field({nullable: true}) 
    NC__CommunityHubEventUrl__c?: string;
        
    @Field({nullable: true}) 
    InxpoShowKey__c?: string;
        
    @Field({nullable: true}) 
    InxpoShowPackageKey__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    NU__CollectBadge__c?: boolean;
        
    @Field({nullable: true}) 
    NU_CBCW__LMSErrorMessage__c?: string;
        
    @Field({nullable: true}) 
    NU_CBCW__LMSExternalId__c?: string;
        
    @Field({nullable: true}) 
    NU_CBCW__LMSSynchronizationStatus__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    NU_CBCW__SyncWithLMS__c?: boolean;
        
    @Field(() => Float, {nullable: true}) 
    namz__EventQuestionCount__c?: number;
        
    @Field(() => Float, {nullable: true}) 
    namz__EventSessionGroupCount__c?: number;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    Troubleshoot?: string;
        
}

//****************************************************************************
// INPUT TYPE for Events
//****************************************************************************
@InputType()
export class CreateNU__Event__cInput {
    @Field({ nullable: true })
    Id?: string;

    @Field(() => Boolean, { nullable: true })
    IsDeleted: boolean | null;

    @Field({ nullable: true })
    Name: string | null;

    @Field({ nullable: true })
    RecordTypeId: string | null;

    @Field({ nullable: true })
    CreatedById: string | null;

    @Field({ nullable: true })
    LastModifiedById: string | null;

    @Field({ nullable: true })
    NU__Entity__c: string | null;

    @Field(() => Float, { nullable: true })
    NU__ActualCost__c: number | null;

    @Field(() => Float, { nullable: true })
    NU__ActualRevenue__c: number | null;

    @Field({ nullable: true })
    NU__AddressLine1__c: string | null;

    @Field({ nullable: true })
    NU__AddressLine2__c: string | null;

    @Field(() => Boolean, { nullable: true })
    NU__AllowCoWorkerRegistration__c: boolean | null;

    @Field(() => Boolean, { nullable: true })
    NU__AllowGuestRegistration__c: boolean | null;

    @Field(() => Boolean, { nullable: true })
    NU__AllowSingleClickRegistration__c: boolean | null;

    @Field({ nullable: true })
    NU__BadgeLogo__c: string | null;

    @Field(() => Float, { nullable: true })
    NU__BudgetedCosts__c: number | null;

    @Field({ nullable: true })
    NU__CentralPhoneNumber__c: string | null;

    @Field({ nullable: true })
    NU__City__c: string | null;

    @Field({ nullable: true })
    NU__ConfirmationText2__c: string | null;

    @Field({ nullable: true })
    NU__ConfirmationText__c: string | null;

    @Field({ nullable: true })
    NU__Country__c: string | null;

    @Field({ nullable: true })
    NU__Description__c: string | null;

    @Field({ nullable: true })
    NU__Directions__c: string | null;

    @Field(() => Boolean, { nullable: true })
    NU__EntityLogoOnBadgeEnabled__c: boolean | null;

    @Field({ nullable: true })
    NU__EventDetailsUrl__c: string | null;

    @Field(() => Float, { nullable: true })
    NU__ExpectedRevenue__c: number | null;

    @Field({ nullable: true })
    NU__ExternalID__c: string | null;

    @Field({ nullable: true })
    NU__GuestPageDescription__c: string | null;

    @Field(() => Boolean, { nullable: true })
    NU__Hidden__c: boolean | null;

    @Field({ nullable: true })
    NU__InvoiceText__c: string | null;

    @Field({ nullable: true })
    NU__LegacyEventID__c: string | null;

    @Field({ nullable: true })
    NU__Location__c: string | null;

    @Field({ nullable: true })
    NU__Logo__c: string | null;

    @Field(() => Float, { nullable: true })
    NU__MaxNumberOfRegistrations__c: number | null;

    @Field({ nullable: true })
    NU__PostalCode__c: string | null;

    @Field({ nullable: true })
    NU__QuestionPageDescription__c: string | null;

    @Field({ nullable: true })
    NU__RegistrantPageDescription__c: string | null;

    @Field({ nullable: true })
    NU__RegistrantSelectionPageDescription__c: string | null;

    @Field({ nullable: true })
    NU__RegistrationUrl__c: string | null;

    @Field({ nullable: true })
    NU__RestrictTo__c: string | null;

    @Field({ nullable: true })
    NU__RoomNameNumber__c: string | null;

    @Field(() => Boolean, { nullable: true })
    NU__SelfServiceEnabled__c: boolean | null;

    @Field({ nullable: true })
    NU__SessionPageDescription__c: string | null;

    @Field({ nullable: true })
    NU__ShortName__c: string | null;

    @Field({ nullable: true })
    NU__StaffContact__c: string | null;

    @Field({ nullable: true })
    NU__StateProvince__c: string | null;

    @Field({ nullable: true })
    NU__StatusFlag__c: string | null;

    @Field({ nullable: true })
    NU__Status__c: string | null;

    @Field({ nullable: true })
    NU__SummaryPageDescription__c: string | null;

    @Field({ nullable: true })
    NU__TwitterEventDetailTweet__c: string | null;

    @Field({ nullable: true })
    NU__TwitterOrderSummaryTweet__c: string | null;

    @Field({ nullable: true })
    NU__Twitter_Hash_Tag__c: string | null;

    @Field({ nullable: true })
    NU__Type__c: string | null;

    @Field(() => Float, { nullable: true })
    NU__TotalCancellations2__c: number | null;

    @Field(() => Float, { nullable: true })
    NU__TotalCancellations__c: number | null;

    @Field(() => Float, { nullable: true })
    NU__TotalRegistrants2__c: number | null;

    @Field(() => Float, { nullable: true })
    NU__TotalRegistrants__c: number | null;

    @Field({ nullable: true })
    Committee__c: string | null;

    @Field(() => Boolean, { nullable: true })
    NU__IsCancellable__c: boolean | null;

    @Field(() => Boolean, { nullable: true })
    MobileActive__c: boolean | null;

    @Field({ nullable: true })
    MobileFeedUrl__c: string | null;

    @Field(() => Boolean, { nullable: true })
    MobileHideNewsEntriesDate__c: boolean | null;

    @Field({ nullable: true })
    MobileItineraryTitle__c: string | null;

    @Field({ nullable: true })
    MobileNewsTitle__c: string | null;

    @Field({ nullable: true })
    MobileNewsTwitterIcon__c: string | null;

    @Field({ nullable: true })
    MobileNewsTwitterTitle__c: string | null;

    @Field({ nullable: true })
    MobileScheduleItineraryIcon__c: string | null;

    @Field({ nullable: true })
    MobileScheduleItineraryTitle__c: string | null;

    @Field({ nullable: true })
    MobileScheduleTitle__c: string | null;

    @Field({ nullable: true })
    MobileSection1Content__c: string | null;

    @Field({ nullable: true })
    MobileSection1Icon__c: string | null;

    @Field({ nullable: true })
    MobileSection1Title__c: string | null;

    @Field({ nullable: true })
    MobileSection2Content__c: string | null;

    @Field({ nullable: true })
    MobileSection2Icon__c: string | null;

    @Field({ nullable: true })
    MobileSection2Title__c: string | null;

    @Field({ nullable: true })
    MobileSection3Content__c: string | null;

    @Field({ nullable: true })
    MobileSection3Icon__c: string | null;

    @Field({ nullable: true })
    MobileSection3Title__c: string | null;

    @Field({ nullable: true })
    MobileSpeakersIcon__c: string | null;

    @Field({ nullable: true })
    MobileSpeakersTitle__c: string | null;

    @Field({ nullable: true })
    MobileSponsorsIcon__c: string | null;

    @Field({ nullable: true })
    MobileSponsorsTitle__c: string | null;

    @Field({ nullable: true })
    MobileTwitterTitle__c: string | null;

    @Field({ nullable: true })
    ChatterGroupId__c: string | null;

    @Field(() => Boolean, { nullable: true })
    CommunityGroup__c: boolean | null;

    @Field(() => Boolean, { nullable: true })
    IsBTAEvent__c: boolean | null;

    @Field(() => Boolean, { nullable: true })
    NU__IsEditable__c: boolean | null;

    @Field(() => Boolean, { nullable: true })
    NU__WaitlistActiveInSelfService__c: boolean | null;

    @Field(() => Boolean, { nullable: true })
    NU__WaitlistEnabled__c: boolean | null;

    @Field({ nullable: true })
    NU__ShortDescription__c: string | null;

    @Field(() => Float, { nullable: true })
    NU__TotalCancellations3__c: number | null;

    @Field(() => Float, { nullable: true })
    NU__TotalRegistrants3__c: number | null;

    @Field(() => Boolean, { nullable: true })
    NC__CollectBadge__c: boolean | null;

    @Field({ nullable: true })
    NC__CommunityHubEventUrl__c: string | null;

    @Field({ nullable: true })
    InxpoShowKey__c: string | null;

    @Field({ nullable: true })
    InxpoShowPackageKey__c: string | null;

    @Field(() => Boolean, { nullable: true })
    NU__CollectBadge__c: boolean | null;

    @Field({ nullable: true })
    NU_CBCW__LMSErrorMessage__c: string | null;

    @Field({ nullable: true })
    NU_CBCW__LMSExternalId__c: string | null;

    @Field({ nullable: true })
    NU_CBCW__LMSSynchronizationStatus__c: string | null;

    @Field(() => Boolean, { nullable: true })
    NU_CBCW__SyncWithLMS__c: boolean | null;

    @Field(() => Float, { nullable: true })
    namz__EventQuestionCount__c: number | null;

    @Field(() => Float, { nullable: true })
    namz__EventSessionGroupCount__c: number | null;

    @Field({ nullable: true })
    Troubleshoot: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Events
//****************************************************************************
@InputType()
export class UpdateNU__Event__cInput {
    @Field()
    Id: string;

    @Field(() => Boolean, { nullable: true })
    IsDeleted?: boolean | null;

    @Field({ nullable: true })
    Name?: string | null;

    @Field({ nullable: true })
    RecordTypeId?: string | null;

    @Field({ nullable: true })
    CreatedById?: string | null;

    @Field({ nullable: true })
    LastModifiedById?: string | null;

    @Field({ nullable: true })
    NU__Entity__c?: string | null;

    @Field(() => Float, { nullable: true })
    NU__ActualCost__c?: number | null;

    @Field(() => Float, { nullable: true })
    NU__ActualRevenue__c?: number | null;

    @Field({ nullable: true })
    NU__AddressLine1__c?: string | null;

    @Field({ nullable: true })
    NU__AddressLine2__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    NU__AllowCoWorkerRegistration__c?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    NU__AllowGuestRegistration__c?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    NU__AllowSingleClickRegistration__c?: boolean | null;

    @Field({ nullable: true })
    NU__BadgeLogo__c?: string | null;

    @Field(() => Float, { nullable: true })
    NU__BudgetedCosts__c?: number | null;

    @Field({ nullable: true })
    NU__CentralPhoneNumber__c?: string | null;

    @Field({ nullable: true })
    NU__City__c?: string | null;

    @Field({ nullable: true })
    NU__ConfirmationText2__c?: string | null;

    @Field({ nullable: true })
    NU__ConfirmationText__c?: string | null;

    @Field({ nullable: true })
    NU__Country__c?: string | null;

    @Field({ nullable: true })
    NU__Description__c?: string | null;

    @Field({ nullable: true })
    NU__Directions__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    NU__EntityLogoOnBadgeEnabled__c?: boolean | null;

    @Field({ nullable: true })
    NU__EventDetailsUrl__c?: string | null;

    @Field(() => Float, { nullable: true })
    NU__ExpectedRevenue__c?: number | null;

    @Field({ nullable: true })
    NU__ExternalID__c?: string | null;

    @Field({ nullable: true })
    NU__GuestPageDescription__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    NU__Hidden__c?: boolean | null;

    @Field({ nullable: true })
    NU__InvoiceText__c?: string | null;

    @Field({ nullable: true })
    NU__LegacyEventID__c?: string | null;

    @Field({ nullable: true })
    NU__Location__c?: string | null;

    @Field({ nullable: true })
    NU__Logo__c?: string | null;

    @Field(() => Float, { nullable: true })
    NU__MaxNumberOfRegistrations__c?: number | null;

    @Field({ nullable: true })
    NU__PostalCode__c?: string | null;

    @Field({ nullable: true })
    NU__QuestionPageDescription__c?: string | null;

    @Field({ nullable: true })
    NU__RegistrantPageDescription__c?: string | null;

    @Field({ nullable: true })
    NU__RegistrantSelectionPageDescription__c?: string | null;

    @Field({ nullable: true })
    NU__RegistrationUrl__c?: string | null;

    @Field({ nullable: true })
    NU__RestrictTo__c?: string | null;

    @Field({ nullable: true })
    NU__RoomNameNumber__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    NU__SelfServiceEnabled__c?: boolean | null;

    @Field({ nullable: true })
    NU__SessionPageDescription__c?: string | null;

    @Field({ nullable: true })
    NU__ShortName__c?: string | null;

    @Field({ nullable: true })
    NU__StaffContact__c?: string | null;

    @Field({ nullable: true })
    NU__StateProvince__c?: string | null;

    @Field({ nullable: true })
    NU__StatusFlag__c?: string | null;

    @Field({ nullable: true })
    NU__Status__c?: string | null;

    @Field({ nullable: true })
    NU__SummaryPageDescription__c?: string | null;

    @Field({ nullable: true })
    NU__TwitterEventDetailTweet__c?: string | null;

    @Field({ nullable: true })
    NU__TwitterOrderSummaryTweet__c?: string | null;

    @Field({ nullable: true })
    NU__Twitter_Hash_Tag__c?: string | null;

    @Field({ nullable: true })
    NU__Type__c?: string | null;

    @Field(() => Float, { nullable: true })
    NU__TotalCancellations2__c?: number | null;

    @Field(() => Float, { nullable: true })
    NU__TotalCancellations__c?: number | null;

    @Field(() => Float, { nullable: true })
    NU__TotalRegistrants2__c?: number | null;

    @Field(() => Float, { nullable: true })
    NU__TotalRegistrants__c?: number | null;

    @Field({ nullable: true })
    Committee__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    NU__IsCancellable__c?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    MobileActive__c?: boolean | null;

    @Field({ nullable: true })
    MobileFeedUrl__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    MobileHideNewsEntriesDate__c?: boolean | null;

    @Field({ nullable: true })
    MobileItineraryTitle__c?: string | null;

    @Field({ nullable: true })
    MobileNewsTitle__c?: string | null;

    @Field({ nullable: true })
    MobileNewsTwitterIcon__c?: string | null;

    @Field({ nullable: true })
    MobileNewsTwitterTitle__c?: string | null;

    @Field({ nullable: true })
    MobileScheduleItineraryIcon__c?: string | null;

    @Field({ nullable: true })
    MobileScheduleItineraryTitle__c?: string | null;

    @Field({ nullable: true })
    MobileScheduleTitle__c?: string | null;

    @Field({ nullable: true })
    MobileSection1Content__c?: string | null;

    @Field({ nullable: true })
    MobileSection1Icon__c?: string | null;

    @Field({ nullable: true })
    MobileSection1Title__c?: string | null;

    @Field({ nullable: true })
    MobileSection2Content__c?: string | null;

    @Field({ nullable: true })
    MobileSection2Icon__c?: string | null;

    @Field({ nullable: true })
    MobileSection2Title__c?: string | null;

    @Field({ nullable: true })
    MobileSection3Content__c?: string | null;

    @Field({ nullable: true })
    MobileSection3Icon__c?: string | null;

    @Field({ nullable: true })
    MobileSection3Title__c?: string | null;

    @Field({ nullable: true })
    MobileSpeakersIcon__c?: string | null;

    @Field({ nullable: true })
    MobileSpeakersTitle__c?: string | null;

    @Field({ nullable: true })
    MobileSponsorsIcon__c?: string | null;

    @Field({ nullable: true })
    MobileSponsorsTitle__c?: string | null;

    @Field({ nullable: true })
    MobileTwitterTitle__c?: string | null;

    @Field({ nullable: true })
    ChatterGroupId__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    CommunityGroup__c?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    IsBTAEvent__c?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    NU__IsEditable__c?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    NU__WaitlistActiveInSelfService__c?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    NU__WaitlistEnabled__c?: boolean | null;

    @Field({ nullable: true })
    NU__ShortDescription__c?: string | null;

    @Field(() => Float, { nullable: true })
    NU__TotalCancellations3__c?: number | null;

    @Field(() => Float, { nullable: true })
    NU__TotalRegistrants3__c?: number | null;

    @Field(() => Boolean, { nullable: true })
    NC__CollectBadge__c?: boolean | null;

    @Field({ nullable: true })
    NC__CommunityHubEventUrl__c?: string | null;

    @Field({ nullable: true })
    InxpoShowKey__c?: string | null;

    @Field({ nullable: true })
    InxpoShowPackageKey__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    NU__CollectBadge__c?: boolean | null;

    @Field({ nullable: true })
    NU_CBCW__LMSErrorMessage__c?: string | null;

    @Field({ nullable: true })
    NU_CBCW__LMSExternalId__c?: string | null;

    @Field({ nullable: true })
    NU_CBCW__LMSSynchronizationStatus__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    NU_CBCW__SyncWithLMS__c?: boolean | null;

    @Field(() => Float, { nullable: true })
    namz__EventQuestionCount__c?: number | null;

    @Field(() => Float, { nullable: true })
    namz__EventSessionGroupCount__c?: number | null;

    @Field({ nullable: true })
    Troubleshoot?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Events
//****************************************************************************
@ObjectType()
export class RunNU__Event__cViewResult {
    @Field(() => [NU__Event__c_])
    Results: NU__Event__c_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(NU__Event__c_)
export class NU__Event__cResolver extends ResolverBase {
    @Query(() => RunNU__Event__cViewResult)
    async RunNU__Event__cViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunNU__Event__cViewResult)
    async RunNU__Event__cViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunNU__Event__cViewResult)
    async RunNU__Event__cDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Events';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => NU__Event__c_, { nullable: true })
    async NU__Event__c(@Arg('Id', () => String) Id: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<NU__Event__c_ | null> {
        this.CheckUserReadPermissions('Events', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [nams].[vwNU__Event__cs] WHERE [Id]='${Id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Events', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Events', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @Mutation(() => NU__Event__c_)
    async CreateNU__Event__c(
        @Arg('input', () => CreateNU__Event__cInput) input: CreateNU__Event__cInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Events', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => NU__Event__c_)
    async UpdateNU__Event__c(
        @Arg('input', () => UpdateNU__Event__cInput) input: UpdateNU__Event__cInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Events', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => NU__Event__c_)
    async DeleteNU__Event__c(@Arg('Id', () => String) Id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'Id', Value: Id}]);
        return this.DeleteRecord('Events', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Memberships
//****************************************************************************
@ObjectType()
export class NU__Membership__c_ {
    @Field() 
    @MaxLength(100)
    Id: string;
        
    @Field(() => Boolean, {nullable: true}) 
    IsDeleted?: boolean;
        
    @Field({nullable: true}) 
    Name?: string;
        
    @Field({nullable: true}) 
    CreatedById?: string;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    LastModifiedDate?: Date;
        
    @Field({nullable: true}) 
    LastModifiedById?: string;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    SystemModstamp?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    LastActivityDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    LastViewedDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    LastReferencedDate?: Date;
        
    @Field({nullable: true}) 
    NU__Account__c?: string;
        
    @Field({nullable: true}) 
    NU__MembershipType__c?: string;
        
    @Field(() => Float, {nullable: true}) 
    NU__Amount__c?: number;
        
    @Field(() => Float, {nullable: true}) 
    NU__Balance__c?: number;
        
    @Field({nullable: true}) 
    NU__Category__c?: string;
        
    @Field({nullable: true}) 
    NU__CustomerEmail__c?: string;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    NU__EndDate__c?: Date;
        
    @Field({nullable: true}) 
    NU__EntityName__c?: string;
        
    @Field(() => Float, {nullable: true}) 
    NU__ExternalAmount__c?: number;
        
    @Field({nullable: true}) 
    NU__ExternalID__c?: string;
        
    @Field({nullable: true}) 
    NU__MembershipProductName__c?: string;
        
    @Field({nullable: true}) 
    NU__OrderItemLine__c?: string;
        
    @Field({nullable: true}) 
    NU__OrderItem__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    NU__Pending__c?: boolean;
        
    @Field({nullable: true}) 
    NU__PrimaryAffiliation__c?: string;
        
    @Field({nullable: true}) 
    NU__Search__c?: string;
        
    @Field({nullable: true}) 
    NU__Stage__c?: string;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    NU__StartDate__c?: Date;
        
    @Field({nullable: true}) 
    NU__StatusFlag__c?: string;
        
    @Field({nullable: true}) 
    NU__Status__c?: string;
        
    @Field(() => Float, {nullable: true}) 
    NU__TotalPayment__c?: number;
        
    @Field({nullable: true}) 
    AccrualDues__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    Need_Member_Application__c?: boolean;
        
    @Field({nullable: true}) 
    NU__PrimaryContactEmail__c?: string;
        
    @Field({nullable: true}) 
    NU__PrimaryContactName__c?: string;
        
    @Field({nullable: true}) 
    External_Product__c?: string;
        
    @Field({nullable: true}) 
    Membership_Product_Name__c?: string;
        
    @Field({nullable: true}) 
    ExternalStatus__c?: string;
        
    @Field(() => Float, {nullable: true}) 
    Legacy_Liability_Amount__c?: number;
        
    @Field(() => Float, {nullable: true}) 
    Legacy_SMSTA_Dues_Amount__c?: number;
        
    @Field(() => Float, {nullable: true}) 
    Legacy_Other_CTA_Dues_Amount__c?: number;
        
    @Field({nullable: true}) 
    Legacy_Parent__c?: string;
        
    @Field({nullable: true}) 
    Legacy_Product_Code_Conv__c?: string;
        
    @Field({nullable: true}) 
    Institution__c?: string;
        
    @Field({nullable: true}) 
    Institution_at_Membership__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    NU__AutoRenew__c?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    NU__AutomaticRenewalCreated__c?: boolean;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    NU__AutomaticRenewalDate__c?: Date;
        
    @Field(() => Float, {nullable: true}) 
    NU__AutomaticRenewalDuesAmount__c?: number;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    NU__AutomaticRenewalRepricingDate__c?: Date;
        
    @Field({nullable: true}) 
    NU__RecurringPayment__c?: string;
        
    @Field({nullable: true}) 
    School_Building__c?: string;
        
    @Field({nullable: true}) 
    InstitutionID__c?: string;
        
    @Field(() => Float, {nullable: true}) 
    Year__c?: number;
        
    @Field({nullable: true}) 
    Marketing_Label__c?: string;
        
    @Field(() => Float, {nullable: true}) 
    Year_End__c?: number;
        
    @Field({nullable: true}) 
    Member_Id__c?: string;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    Lapsed_Beyond_Grace_Return_Date__c?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    NU__EndDateOverride__c?: Date;
        
    @Field({nullable: true}) 
    NU__MembershipType2__c?: string;
        
    @Field({nullable: true}) 
    NU__PrimaryMembershipProduct__c?: string;
        
    @Field({nullable: true}) 
    NU__Account2__c?: string;
        
    @Field(() => Float, {nullable: true}) 
    ExternalTotalPayment__c?: number;
        
    @Field(() => Float, {nullable: true}) 
    ExternalBalance__c?: number;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    ExternalCanceledDate__c?: Date;
        
    @Field(() => Float, {nullable: true}) 
    TotalBalance__c?: number;
        
    @Field(() => Float, {nullable: true}) 
    AllPayments__c?: number;
        
    @Field(() => Boolean, {nullable: true}) 
    NU__ExcludeFromBilling__c?: boolean;
        
    @Field(() => Float, {nullable: true}) 
    NU__ExternalQuantity__c?: number;
        
    @Field(() => Float, {nullable: true}) 
    NU__Quantity__c?: number;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    NU__ExternalTransactionDate__c?: Date;
        
    @Field(() => Float, {nullable: true}) 
    NU__ExternalUnitPrice__c?: number;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    NU__TransactionDate__c?: Date;
        
    @Field(() => Float, {nullable: true}) 
    NU__UnitPrice__c?: number;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    NU__OriginalEndDate__c?: Date;
        
    @Field({nullable: true}) 
    Institution_backup__c?: string;
        
    @Field({nullable: true}) 
    Primary_Affiliation_Backup__c?: string;
        
    @Field({nullable: true}) 
    School_Building_backup__c?: string;
        
    @Field({nullable: true}) 
    ChapterDuesProduct__c?: string;
        
    @Field({nullable: true}) 
    Chapter_Dues_Product_Name__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    Paying_CTA_Dues_Thru_MSTA__c?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    Chapter_Dues_Mismatch__c?: boolean;
        
    @Field({nullable: true}) 
    Pay_Type__c?: string;
        
    @Field({nullable: true}) 
    Simple_Pay_Type__c?: string;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    Join_Renew_Date__c?: Date;
        
    @Field(() => Boolean, {nullable: true}) 
    Joined_the_CTA__c?: boolean;
        
    @Field({nullable: true}) 
    Membership_Year__c?: string;
        
    @Field({nullable: true}) 
    namz__RenewalOrder__c?: string;
        
    @Field({nullable: true}) 
    Region__c?: string;
        
    @Field({nullable: true}) 
    NU__Order__c?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    Troubleshoot?: string;
        
}

//****************************************************************************
// INPUT TYPE for Memberships
//****************************************************************************
@InputType()
export class CreateNU__Membership__cInput {
    @Field({ nullable: true })
    Id?: string;

    @Field(() => Boolean, { nullable: true })
    IsDeleted: boolean | null;

    @Field({ nullable: true })
    Name: string | null;

    @Field({ nullable: true })
    CreatedById: string | null;

    @Field({ nullable: true })
    LastModifiedById: string | null;

    @Field({ nullable: true })
    NU__Account__c: string | null;

    @Field({ nullable: true })
    NU__MembershipType__c: string | null;

    @Field(() => Float, { nullable: true })
    NU__Amount__c: number | null;

    @Field(() => Float, { nullable: true })
    NU__Balance__c: number | null;

    @Field({ nullable: true })
    NU__Category__c: string | null;

    @Field({ nullable: true })
    NU__CustomerEmail__c: string | null;

    @Field({ nullable: true })
    NU__EntityName__c: string | null;

    @Field(() => Float, { nullable: true })
    NU__ExternalAmount__c: number | null;

    @Field({ nullable: true })
    NU__ExternalID__c: string | null;

    @Field({ nullable: true })
    NU__MembershipProductName__c: string | null;

    @Field({ nullable: true })
    NU__OrderItemLine__c: string | null;

    @Field({ nullable: true })
    NU__OrderItem__c: string | null;

    @Field(() => Boolean, { nullable: true })
    NU__Pending__c: boolean | null;

    @Field({ nullable: true })
    NU__PrimaryAffiliation__c: string | null;

    @Field({ nullable: true })
    NU__Search__c: string | null;

    @Field({ nullable: true })
    NU__Stage__c: string | null;

    @Field({ nullable: true })
    NU__StatusFlag__c: string | null;

    @Field({ nullable: true })
    NU__Status__c: string | null;

    @Field(() => Float, { nullable: true })
    NU__TotalPayment__c: number | null;

    @Field({ nullable: true })
    AccrualDues__c: string | null;

    @Field(() => Boolean, { nullable: true })
    Need_Member_Application__c: boolean | null;

    @Field({ nullable: true })
    NU__PrimaryContactEmail__c: string | null;

    @Field({ nullable: true })
    NU__PrimaryContactName__c: string | null;

    @Field({ nullable: true })
    External_Product__c: string | null;

    @Field({ nullable: true })
    Membership_Product_Name__c: string | null;

    @Field({ nullable: true })
    ExternalStatus__c: string | null;

    @Field(() => Float, { nullable: true })
    Legacy_Liability_Amount__c: number | null;

    @Field(() => Float, { nullable: true })
    Legacy_SMSTA_Dues_Amount__c: number | null;

    @Field(() => Float, { nullable: true })
    Legacy_Other_CTA_Dues_Amount__c: number | null;

    @Field({ nullable: true })
    Legacy_Parent__c: string | null;

    @Field({ nullable: true })
    Legacy_Product_Code_Conv__c: string | null;

    @Field({ nullable: true })
    Institution__c: string | null;

    @Field({ nullable: true })
    Institution_at_Membership__c: string | null;

    @Field(() => Boolean, { nullable: true })
    NU__AutoRenew__c: boolean | null;

    @Field(() => Boolean, { nullable: true })
    NU__AutomaticRenewalCreated__c: boolean | null;

    @Field(() => Float, { nullable: true })
    NU__AutomaticRenewalDuesAmount__c: number | null;

    @Field({ nullable: true })
    NU__RecurringPayment__c: string | null;

    @Field({ nullable: true })
    School_Building__c: string | null;

    @Field({ nullable: true })
    InstitutionID__c: string | null;

    @Field(() => Float, { nullable: true })
    Year__c: number | null;

    @Field({ nullable: true })
    Marketing_Label__c: string | null;

    @Field(() => Float, { nullable: true })
    Year_End__c: number | null;

    @Field({ nullable: true })
    Member_Id__c: string | null;

    @Field({ nullable: true })
    NU__MembershipType2__c: string | null;

    @Field({ nullable: true })
    NU__PrimaryMembershipProduct__c: string | null;

    @Field({ nullable: true })
    NU__Account2__c: string | null;

    @Field(() => Float, { nullable: true })
    ExternalTotalPayment__c: number | null;

    @Field(() => Float, { nullable: true })
    ExternalBalance__c: number | null;

    @Field(() => Float, { nullable: true })
    TotalBalance__c: number | null;

    @Field(() => Float, { nullable: true })
    AllPayments__c: number | null;

    @Field(() => Boolean, { nullable: true })
    NU__ExcludeFromBilling__c: boolean | null;

    @Field(() => Float, { nullable: true })
    NU__ExternalQuantity__c: number | null;

    @Field(() => Float, { nullable: true })
    NU__Quantity__c: number | null;

    @Field(() => Float, { nullable: true })
    NU__ExternalUnitPrice__c: number | null;

    @Field(() => Float, { nullable: true })
    NU__UnitPrice__c: number | null;

    @Field({ nullable: true })
    Institution_backup__c: string | null;

    @Field({ nullable: true })
    Primary_Affiliation_Backup__c: string | null;

    @Field({ nullable: true })
    School_Building_backup__c: string | null;

    @Field({ nullable: true })
    ChapterDuesProduct__c: string | null;

    @Field({ nullable: true })
    Chapter_Dues_Product_Name__c: string | null;

    @Field(() => Boolean, { nullable: true })
    Paying_CTA_Dues_Thru_MSTA__c: boolean | null;

    @Field(() => Boolean, { nullable: true })
    Chapter_Dues_Mismatch__c: boolean | null;

    @Field({ nullable: true })
    Pay_Type__c: string | null;

    @Field({ nullable: true })
    Simple_Pay_Type__c: string | null;

    @Field(() => Boolean, { nullable: true })
    Joined_the_CTA__c: boolean | null;

    @Field({ nullable: true })
    Membership_Year__c: string | null;

    @Field({ nullable: true })
    namz__RenewalOrder__c: string | null;

    @Field({ nullable: true })
    Region__c: string | null;

    @Field({ nullable: true })
    NU__Order__c: string | null;

    @Field({ nullable: true })
    Troubleshoot: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Memberships
//****************************************************************************
@InputType()
export class UpdateNU__Membership__cInput {
    @Field()
    Id: string;

    @Field(() => Boolean, { nullable: true })
    IsDeleted?: boolean | null;

    @Field({ nullable: true })
    Name?: string | null;

    @Field({ nullable: true })
    CreatedById?: string | null;

    @Field({ nullable: true })
    LastModifiedById?: string | null;

    @Field({ nullable: true })
    NU__Account__c?: string | null;

    @Field({ nullable: true })
    NU__MembershipType__c?: string | null;

    @Field(() => Float, { nullable: true })
    NU__Amount__c?: number | null;

    @Field(() => Float, { nullable: true })
    NU__Balance__c?: number | null;

    @Field({ nullable: true })
    NU__Category__c?: string | null;

    @Field({ nullable: true })
    NU__CustomerEmail__c?: string | null;

    @Field({ nullable: true })
    NU__EntityName__c?: string | null;

    @Field(() => Float, { nullable: true })
    NU__ExternalAmount__c?: number | null;

    @Field({ nullable: true })
    NU__ExternalID__c?: string | null;

    @Field({ nullable: true })
    NU__MembershipProductName__c?: string | null;

    @Field({ nullable: true })
    NU__OrderItemLine__c?: string | null;

    @Field({ nullable: true })
    NU__OrderItem__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    NU__Pending__c?: boolean | null;

    @Field({ nullable: true })
    NU__PrimaryAffiliation__c?: string | null;

    @Field({ nullable: true })
    NU__Search__c?: string | null;

    @Field({ nullable: true })
    NU__Stage__c?: string | null;

    @Field({ nullable: true })
    NU__StatusFlag__c?: string | null;

    @Field({ nullable: true })
    NU__Status__c?: string | null;

    @Field(() => Float, { nullable: true })
    NU__TotalPayment__c?: number | null;

    @Field({ nullable: true })
    AccrualDues__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    Need_Member_Application__c?: boolean | null;

    @Field({ nullable: true })
    NU__PrimaryContactEmail__c?: string | null;

    @Field({ nullable: true })
    NU__PrimaryContactName__c?: string | null;

    @Field({ nullable: true })
    External_Product__c?: string | null;

    @Field({ nullable: true })
    Membership_Product_Name__c?: string | null;

    @Field({ nullable: true })
    ExternalStatus__c?: string | null;

    @Field(() => Float, { nullable: true })
    Legacy_Liability_Amount__c?: number | null;

    @Field(() => Float, { nullable: true })
    Legacy_SMSTA_Dues_Amount__c?: number | null;

    @Field(() => Float, { nullable: true })
    Legacy_Other_CTA_Dues_Amount__c?: number | null;

    @Field({ nullable: true })
    Legacy_Parent__c?: string | null;

    @Field({ nullable: true })
    Legacy_Product_Code_Conv__c?: string | null;

    @Field({ nullable: true })
    Institution__c?: string | null;

    @Field({ nullable: true })
    Institution_at_Membership__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    NU__AutoRenew__c?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    NU__AutomaticRenewalCreated__c?: boolean | null;

    @Field(() => Float, { nullable: true })
    NU__AutomaticRenewalDuesAmount__c?: number | null;

    @Field({ nullable: true })
    NU__RecurringPayment__c?: string | null;

    @Field({ nullable: true })
    School_Building__c?: string | null;

    @Field({ nullable: true })
    InstitutionID__c?: string | null;

    @Field(() => Float, { nullable: true })
    Year__c?: number | null;

    @Field({ nullable: true })
    Marketing_Label__c?: string | null;

    @Field(() => Float, { nullable: true })
    Year_End__c?: number | null;

    @Field({ nullable: true })
    Member_Id__c?: string | null;

    @Field({ nullable: true })
    NU__MembershipType2__c?: string | null;

    @Field({ nullable: true })
    NU__PrimaryMembershipProduct__c?: string | null;

    @Field({ nullable: true })
    NU__Account2__c?: string | null;

    @Field(() => Float, { nullable: true })
    ExternalTotalPayment__c?: number | null;

    @Field(() => Float, { nullable: true })
    ExternalBalance__c?: number | null;

    @Field(() => Float, { nullable: true })
    TotalBalance__c?: number | null;

    @Field(() => Float, { nullable: true })
    AllPayments__c?: number | null;

    @Field(() => Boolean, { nullable: true })
    NU__ExcludeFromBilling__c?: boolean | null;

    @Field(() => Float, { nullable: true })
    NU__ExternalQuantity__c?: number | null;

    @Field(() => Float, { nullable: true })
    NU__Quantity__c?: number | null;

    @Field(() => Float, { nullable: true })
    NU__ExternalUnitPrice__c?: number | null;

    @Field(() => Float, { nullable: true })
    NU__UnitPrice__c?: number | null;

    @Field({ nullable: true })
    Institution_backup__c?: string | null;

    @Field({ nullable: true })
    Primary_Affiliation_Backup__c?: string | null;

    @Field({ nullable: true })
    School_Building_backup__c?: string | null;

    @Field({ nullable: true })
    ChapterDuesProduct__c?: string | null;

    @Field({ nullable: true })
    Chapter_Dues_Product_Name__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    Paying_CTA_Dues_Thru_MSTA__c?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    Chapter_Dues_Mismatch__c?: boolean | null;

    @Field({ nullable: true })
    Pay_Type__c?: string | null;

    @Field({ nullable: true })
    Simple_Pay_Type__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    Joined_the_CTA__c?: boolean | null;

    @Field({ nullable: true })
    Membership_Year__c?: string | null;

    @Field({ nullable: true })
    namz__RenewalOrder__c?: string | null;

    @Field({ nullable: true })
    Region__c?: string | null;

    @Field({ nullable: true })
    NU__Order__c?: string | null;

    @Field({ nullable: true })
    Troubleshoot?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Memberships
//****************************************************************************
@ObjectType()
export class RunNU__Membership__cViewResult {
    @Field(() => [NU__Membership__c_])
    Results: NU__Membership__c_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(NU__Membership__c_)
export class NU__Membership__cResolver extends ResolverBase {
    @Query(() => RunNU__Membership__cViewResult)
    async RunNU__Membership__cViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunNU__Membership__cViewResult)
    async RunNU__Membership__cViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunNU__Membership__cViewResult)
    async RunNU__Membership__cDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Memberships';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => NU__Membership__c_, { nullable: true })
    async NU__Membership__c(@Arg('Id', () => String) Id: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<NU__Membership__c_ | null> {
        this.CheckUserReadPermissions('Memberships', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [nams].[vwNU__Membership__cs] WHERE [Id]='${Id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Memberships', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Memberships', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @Mutation(() => NU__Membership__c_)
    async CreateNU__Membership__c(
        @Arg('input', () => CreateNU__Membership__cInput) input: CreateNU__Membership__cInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Memberships', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => NU__Membership__c_)
    async UpdateNU__Membership__c(
        @Arg('input', () => UpdateNU__Membership__cInput) input: UpdateNU__Membership__cInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Memberships', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => NU__Membership__c_)
    async DeleteNU__Membership__c(@Arg('Id', () => String) Id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'Id', Value: Id}]);
        return this.DeleteRecord('Memberships', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Orders
//****************************************************************************
@ObjectType()
export class NU__Order__c_ {
    @Field() 
    @MaxLength(100)
    Id: string;
        
    @Field({nullable: true}) 
    OwnerId?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    IsDeleted?: boolean;
        
    @Field({nullable: true}) 
    Name?: string;
        
    @Field({nullable: true}) 
    CreatedById?: string;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    LastModifiedDate?: Date;
        
    @Field({nullable: true}) 
    LastModifiedById?: string;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    SystemModstamp?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    LastActivityDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    LastViewedDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    LastReferencedDate?: Date;
        
    @Field({nullable: true}) 
    NU__AdditionalEmail__c?: string;
        
    @Field(() => Float, {nullable: true}) 
    NU__Balance__c?: number;
        
    @Field({nullable: true}) 
    NU__BillToPrimaryAffiliation__c?: string;
        
    @Field({nullable: true}) 
    NU__BillTo__c?: string;
        
    @Field({nullable: true}) 
    NU__Entity__c?: string;
        
    @Field({nullable: true}) 
    NU__ExternalId__c?: string;
        
    @Field({nullable: true}) 
    NU__InvoiceARAging__c?: string;
        
    @Field({nullable: true}) 
    NU__InvoiceAgingScheduleCategory__c?: string;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    NU__InvoiceDate__c?: Date;
        
    @Field(() => Float, {nullable: true}) 
    NU__InvoiceDaysOutstanding__c?: number;
        
    @Field({nullable: true}) 
    NU__InvoiceDescription__c?: string;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    NU__InvoiceDueDate__c?: Date;
        
    @Field({nullable: true}) 
    NU__InvoiceEmail__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    NU__InvoiceGenerated__c?: boolean;
        
    @Field({nullable: true}) 
    NU__InvoiceNumber__c?: string;
        
    @Field(() => Float, {nullable: true}) 
    NU__InvoiceTerm__c?: number;
        
    @Field({nullable: true}) 
    NU__PurchaseOrderNumber__c?: string;
        
    @Field({nullable: true}) 
    NU__Search__c?: string;
        
    @Field({nullable: true}) 
    NU__SelfServiceOrderNumber__c?: string;
        
    @Field({nullable: true}) 
    NU__Status__c?: string;
        
    @Field(() => Float, {nullable: true}) 
    NU__TotalShippingAndTax__c?: number;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    NU__TransactionDate__c?: Date;
        
    @Field(() => Float, {nullable: true}) 
    NU__ActiveOrderItemCount__c?: number;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    NU__AdjustmentDate__c?: Date;
        
    @Field(() => Float, {nullable: true}) 
    NU__GrandTotal__c?: number;
        
    @Field(() => Float, {nullable: true}) 
    NU__SubTotal__c?: number;
        
    @Field(() => Float, {nullable: true}) 
    NU__TotalPayment__c?: number;
        
    @Field(() => Float, {nullable: true}) 
    NU__TotalShipping__c?: number;
        
    @Field(() => Float, {nullable: true}) 
    NU__TotalTax__c?: number;
        
    @Field({nullable: true}) 
    AccrualDues__c?: string;
        
    @Field(() => Float, {nullable: true}) 
    NU__TotalDiscounts__c?: number;
        
    @Field(() => Float, {nullable: true}) 
    NU__RecurringBalance__c?: number;
        
    @Field({nullable: true}) 
    NU__Purpose__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    NU__BillMe__c?: boolean;
        
    @Field({nullable: true}) 
    NU__AdditionalEmails__c?: string;
        
    @Field({nullable: true}) 
    NU__ConfirmationEmail__c?: string;
        
    @Field({nullable: true}) 
    NU__Identifier__c?: string;
        
    @Field({nullable: true}) 
    NU__PaymentUrl__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    OnAutopay__c?: boolean;
        
    @Field({nullable: true}) 
    NU__ExternalTaxId__c?: string;
        
    @Field({nullable: true}) 
    NU__ExternalTaxTransactionStatus__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    IsCreatedByCHUser__c?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    namz__ActiveShoppingCart__c?: boolean;
        
    @Field({nullable: true}) 
    namz__Cart__c?: string;
        
    @Field({nullable: true}) 
    namz__GuestFirstName__c?: string;
        
    @Field({nullable: true}) 
    namz__GuestLastName__c?: string;
        
    @Field({nullable: true}) 
    namz__State__c?: string;
        
    @Field({nullable: true}) 
    namz__LightningCheckoutUrl__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    namz__ForGuest__c?: boolean;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    Troubleshoot?: string;
        
}

//****************************************************************************
// INPUT TYPE for Orders
//****************************************************************************
@InputType()
export class CreateNU__Order__cInput {
    @Field({ nullable: true })
    Id?: string;

    @Field({ nullable: true })
    OwnerId: string | null;

    @Field(() => Boolean, { nullable: true })
    IsDeleted: boolean | null;

    @Field({ nullable: true })
    Name: string | null;

    @Field({ nullable: true })
    CreatedById: string | null;

    @Field({ nullable: true })
    LastModifiedById: string | null;

    @Field({ nullable: true })
    NU__AdditionalEmail__c: string | null;

    @Field(() => Float, { nullable: true })
    NU__Balance__c: number | null;

    @Field({ nullable: true })
    NU__BillToPrimaryAffiliation__c: string | null;

    @Field({ nullable: true })
    NU__BillTo__c: string | null;

    @Field({ nullable: true })
    NU__Entity__c: string | null;

    @Field({ nullable: true })
    NU__ExternalId__c: string | null;

    @Field({ nullable: true })
    NU__InvoiceARAging__c: string | null;

    @Field({ nullable: true })
    NU__InvoiceAgingScheduleCategory__c: string | null;

    @Field(() => Float, { nullable: true })
    NU__InvoiceDaysOutstanding__c: number | null;

    @Field({ nullable: true })
    NU__InvoiceDescription__c: string | null;

    @Field({ nullable: true })
    NU__InvoiceEmail__c: string | null;

    @Field(() => Boolean, { nullable: true })
    NU__InvoiceGenerated__c: boolean | null;

    @Field({ nullable: true })
    NU__InvoiceNumber__c: string | null;

    @Field(() => Float, { nullable: true })
    NU__InvoiceTerm__c: number | null;

    @Field({ nullable: true })
    NU__PurchaseOrderNumber__c: string | null;

    @Field({ nullable: true })
    NU__Search__c: string | null;

    @Field({ nullable: true })
    NU__SelfServiceOrderNumber__c: string | null;

    @Field({ nullable: true })
    NU__Status__c: string | null;

    @Field(() => Float, { nullable: true })
    NU__TotalShippingAndTax__c: number | null;

    @Field(() => Float, { nullable: true })
    NU__ActiveOrderItemCount__c: number | null;

    @Field(() => Float, { nullable: true })
    NU__GrandTotal__c: number | null;

    @Field(() => Float, { nullable: true })
    NU__SubTotal__c: number | null;

    @Field(() => Float, { nullable: true })
    NU__TotalPayment__c: number | null;

    @Field(() => Float, { nullable: true })
    NU__TotalShipping__c: number | null;

    @Field(() => Float, { nullable: true })
    NU__TotalTax__c: number | null;

    @Field({ nullable: true })
    AccrualDues__c: string | null;

    @Field(() => Float, { nullable: true })
    NU__TotalDiscounts__c: number | null;

    @Field(() => Float, { nullable: true })
    NU__RecurringBalance__c: number | null;

    @Field({ nullable: true })
    NU__Purpose__c: string | null;

    @Field(() => Boolean, { nullable: true })
    NU__BillMe__c: boolean | null;

    @Field({ nullable: true })
    NU__AdditionalEmails__c: string | null;

    @Field({ nullable: true })
    NU__ConfirmationEmail__c: string | null;

    @Field({ nullable: true })
    NU__Identifier__c: string | null;

    @Field({ nullable: true })
    NU__PaymentUrl__c: string | null;

    @Field(() => Boolean, { nullable: true })
    OnAutopay__c: boolean | null;

    @Field({ nullable: true })
    NU__ExternalTaxId__c: string | null;

    @Field({ nullable: true })
    NU__ExternalTaxTransactionStatus__c: string | null;

    @Field(() => Boolean, { nullable: true })
    IsCreatedByCHUser__c: boolean | null;

    @Field(() => Boolean, { nullable: true })
    namz__ActiveShoppingCart__c: boolean | null;

    @Field({ nullable: true })
    namz__Cart__c: string | null;

    @Field({ nullable: true })
    namz__GuestFirstName__c: string | null;

    @Field({ nullable: true })
    namz__GuestLastName__c: string | null;

    @Field({ nullable: true })
    namz__State__c: string | null;

    @Field({ nullable: true })
    namz__LightningCheckoutUrl__c: string | null;

    @Field(() => Boolean, { nullable: true })
    namz__ForGuest__c: boolean | null;

    @Field({ nullable: true })
    Troubleshoot: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Orders
//****************************************************************************
@InputType()
export class UpdateNU__Order__cInput {
    @Field()
    Id: string;

    @Field({ nullable: true })
    OwnerId?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsDeleted?: boolean | null;

    @Field({ nullable: true })
    Name?: string | null;

    @Field({ nullable: true })
    CreatedById?: string | null;

    @Field({ nullable: true })
    LastModifiedById?: string | null;

    @Field({ nullable: true })
    NU__AdditionalEmail__c?: string | null;

    @Field(() => Float, { nullable: true })
    NU__Balance__c?: number | null;

    @Field({ nullable: true })
    NU__BillToPrimaryAffiliation__c?: string | null;

    @Field({ nullable: true })
    NU__BillTo__c?: string | null;

    @Field({ nullable: true })
    NU__Entity__c?: string | null;

    @Field({ nullable: true })
    NU__ExternalId__c?: string | null;

    @Field({ nullable: true })
    NU__InvoiceARAging__c?: string | null;

    @Field({ nullable: true })
    NU__InvoiceAgingScheduleCategory__c?: string | null;

    @Field(() => Float, { nullable: true })
    NU__InvoiceDaysOutstanding__c?: number | null;

    @Field({ nullable: true })
    NU__InvoiceDescription__c?: string | null;

    @Field({ nullable: true })
    NU__InvoiceEmail__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    NU__InvoiceGenerated__c?: boolean | null;

    @Field({ nullable: true })
    NU__InvoiceNumber__c?: string | null;

    @Field(() => Float, { nullable: true })
    NU__InvoiceTerm__c?: number | null;

    @Field({ nullable: true })
    NU__PurchaseOrderNumber__c?: string | null;

    @Field({ nullable: true })
    NU__Search__c?: string | null;

    @Field({ nullable: true })
    NU__SelfServiceOrderNumber__c?: string | null;

    @Field({ nullable: true })
    NU__Status__c?: string | null;

    @Field(() => Float, { nullable: true })
    NU__TotalShippingAndTax__c?: number | null;

    @Field(() => Float, { nullable: true })
    NU__ActiveOrderItemCount__c?: number | null;

    @Field(() => Float, { nullable: true })
    NU__GrandTotal__c?: number | null;

    @Field(() => Float, { nullable: true })
    NU__SubTotal__c?: number | null;

    @Field(() => Float, { nullable: true })
    NU__TotalPayment__c?: number | null;

    @Field(() => Float, { nullable: true })
    NU__TotalShipping__c?: number | null;

    @Field(() => Float, { nullable: true })
    NU__TotalTax__c?: number | null;

    @Field({ nullable: true })
    AccrualDues__c?: string | null;

    @Field(() => Float, { nullable: true })
    NU__TotalDiscounts__c?: number | null;

    @Field(() => Float, { nullable: true })
    NU__RecurringBalance__c?: number | null;

    @Field({ nullable: true })
    NU__Purpose__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    NU__BillMe__c?: boolean | null;

    @Field({ nullable: true })
    NU__AdditionalEmails__c?: string | null;

    @Field({ nullable: true })
    NU__ConfirmationEmail__c?: string | null;

    @Field({ nullable: true })
    NU__Identifier__c?: string | null;

    @Field({ nullable: true })
    NU__PaymentUrl__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    OnAutopay__c?: boolean | null;

    @Field({ nullable: true })
    NU__ExternalTaxId__c?: string | null;

    @Field({ nullable: true })
    NU__ExternalTaxTransactionStatus__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsCreatedByCHUser__c?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    namz__ActiveShoppingCart__c?: boolean | null;

    @Field({ nullable: true })
    namz__Cart__c?: string | null;

    @Field({ nullable: true })
    namz__GuestFirstName__c?: string | null;

    @Field({ nullable: true })
    namz__GuestLastName__c?: string | null;

    @Field({ nullable: true })
    namz__State__c?: string | null;

    @Field({ nullable: true })
    namz__LightningCheckoutUrl__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    namz__ForGuest__c?: boolean | null;

    @Field({ nullable: true })
    Troubleshoot?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Orders
//****************************************************************************
@ObjectType()
export class RunNU__Order__cViewResult {
    @Field(() => [NU__Order__c_])
    Results: NU__Order__c_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(NU__Order__c_)
export class NU__Order__cResolver extends ResolverBase {
    @Query(() => RunNU__Order__cViewResult)
    async RunNU__Order__cViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunNU__Order__cViewResult)
    async RunNU__Order__cViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunNU__Order__cViewResult)
    async RunNU__Order__cDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Orders';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => NU__Order__c_, { nullable: true })
    async NU__Order__c(@Arg('Id', () => String) Id: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<NU__Order__c_ | null> {
        this.CheckUserReadPermissions('Orders', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [nams].[vwNU__Order__cs] WHERE [Id]='${Id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Orders', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Orders', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @Mutation(() => NU__Order__c_)
    async CreateNU__Order__c(
        @Arg('input', () => CreateNU__Order__cInput) input: CreateNU__Order__cInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Orders', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => NU__Order__c_)
    async UpdateNU__Order__c(
        @Arg('input', () => UpdateNU__Order__cInput) input: UpdateNU__Order__cInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Orders', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => NU__Order__c_)
    async DeleteNU__Order__c(@Arg('Id', () => String) Id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'Id', Value: Id}]);
        return this.DeleteRecord('Orders', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Order Items
//****************************************************************************
@ObjectType()
export class NU__OrderItem__c_ {
    @Field() 
    @MaxLength(100)
    Id: string;
        
    @Field(() => Boolean, {nullable: true}) 
    IsDeleted?: boolean;
        
    @Field({nullable: true}) 
    Name?: string;
        
    @Field({nullable: true}) 
    RecordTypeId?: string;
        
    @Field({nullable: true}) 
    CreatedById?: string;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    LastModifiedDate?: Date;
        
    @Field({nullable: true}) 
    LastModifiedById?: string;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    SystemModstamp?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    LastActivityDate?: Date;
        
    @Field({nullable: true}) 
    NU__Order__c?: string;
        
    @Field({nullable: true}) 
    NU__ARGLAccount__c?: string;
        
    @Field(() => Float, {nullable: true}) 
    NU__Balance__c?: number;
        
    @Field({nullable: true}) 
    NU__CustomerPrimaryAffiliation__c?: string;
        
    @Field({nullable: true}) 
    NU__Customer__c?: string;
        
    @Field({nullable: true}) 
    NU__ExternalID__c?: string;
        
    @Field(() => Float, {nullable: true}) 
    NU__GrandTotal__c?: number;
        
    @Field(() => Boolean, {nullable: true}) 
    NU__IsShipped__c?: boolean;
        
    @Field({nullable: true}) 
    NU__PriceClass__c?: string;
        
    @Field({nullable: true}) 
    NU__SalesTax__c?: string;
        
    @Field({nullable: true}) 
    NU__ShippingAddress__c?: string;
        
    @Field({nullable: true}) 
    NU__ShippingCity__c?: string;
        
    @Field({nullable: true}) 
    NU__ShippingCountry__c?: string;
        
    @Field({nullable: true}) 
    NU__ShippingGLAccount__c?: string;
        
    @Field({nullable: true}) 
    NU__ShippingMethod__c?: string;
        
    @Field({nullable: true}) 
    NU__ShippingPostalCode__c?: string;
        
    @Field({nullable: true}) 
    NU__ShippingState__c?: string;
        
    @Field({nullable: true}) 
    NU__ShippingStreet__c?: string;
        
    @Field({nullable: true}) 
    NU__Source__c?: string;
        
    @Field({nullable: true}) 
    NU__Status__c?: string;
        
    @Field(() => Float, {nullable: true}) 
    NU__TaxableTotal__c?: number;
        
    @Field(() => Float, {nullable: true}) 
    NU__TotalShippingAndTax__c?: number;
        
    @Field(() => Float, {nullable: true}) 
    NU__TotalShipping__c?: number;
        
    @Field(() => Float, {nullable: true}) 
    NU__TotalTax__c?: number;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    NU__TransactionDate__c?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    NU__AdjustmentDate__c?: Date;
        
    @Field(() => Float, {nullable: true}) 
    NU__ShippingItemLineCount__c?: number;
        
    @Field(() => Float, {nullable: true}) 
    NU__SubTotal__c?: number;
        
    @Field(() => Float, {nullable: true}) 
    NU__TaxableAmount__c?: number;
        
    @Field(() => Float, {nullable: true}) 
    NU__TotalPayment__c?: number;
        
    @Field(() => Float, {nullable: true}) 
    NU__Discounts__c?: number;
        
    @Field({nullable: true}) 
    Customer_Last_Name__c?: string;
        
    @Field({nullable: true}) 
    NU__ShipMethod__c?: string;
        
    @Field({nullable: true}) 
    NU__RecordTypeName__c?: string;
        
    @Field({nullable: true}) 
    NU__Entity__c?: string;
        
    @Field(() => Float, {nullable: true}) 
    NU__RecurringBalance__c?: number;
        
    @Field({nullable: true}) 
    NU__BillingHistory__c?: string;
        
    @Field(() => Float, {nullable: true}) 
    NU__AdjustmentVersion__c?: number;
        
    @Field(() => Boolean, {nullable: true}) 
    NU__BillMe__c?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    NU__Recurring__c?: boolean;
        
    @Field(() => Float, {nullable: true}) 
    NU__TotalTaxableAmount__c?: number;
        
    @Field(() => Boolean, {nullable: true}) 
    Opted_in_to_CTA_Dues__c?: boolean;
        
    @Field({nullable: true}) 
    NU__Data__c?: string;
        
    @Field({nullable: true}) 
    namz__CartItem__c?: string;
        
    @Field({nullable: true}) 
    namz__Appeal__c?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    Troubleshoot?: string;
        
}

//****************************************************************************
// INPUT TYPE for Order Items
//****************************************************************************
@InputType()
export class CreateNU__OrderItem__cInput {
    @Field({ nullable: true })
    Id?: string;

    @Field(() => Boolean, { nullable: true })
    IsDeleted: boolean | null;

    @Field({ nullable: true })
    Name: string | null;

    @Field({ nullable: true })
    RecordTypeId: string | null;

    @Field({ nullable: true })
    CreatedById: string | null;

    @Field({ nullable: true })
    LastModifiedById: string | null;

    @Field({ nullable: true })
    NU__Order__c: string | null;

    @Field({ nullable: true })
    NU__ARGLAccount__c: string | null;

    @Field(() => Float, { nullable: true })
    NU__Balance__c: number | null;

    @Field({ nullable: true })
    NU__CustomerPrimaryAffiliation__c: string | null;

    @Field({ nullable: true })
    NU__Customer__c: string | null;

    @Field({ nullable: true })
    NU__ExternalID__c: string | null;

    @Field(() => Float, { nullable: true })
    NU__GrandTotal__c: number | null;

    @Field(() => Boolean, { nullable: true })
    NU__IsShipped__c: boolean | null;

    @Field({ nullable: true })
    NU__PriceClass__c: string | null;

    @Field({ nullable: true })
    NU__SalesTax__c: string | null;

    @Field({ nullable: true })
    NU__ShippingAddress__c: string | null;

    @Field({ nullable: true })
    NU__ShippingCity__c: string | null;

    @Field({ nullable: true })
    NU__ShippingCountry__c: string | null;

    @Field({ nullable: true })
    NU__ShippingGLAccount__c: string | null;

    @Field({ nullable: true })
    NU__ShippingMethod__c: string | null;

    @Field({ nullable: true })
    NU__ShippingPostalCode__c: string | null;

    @Field({ nullable: true })
    NU__ShippingState__c: string | null;

    @Field({ nullable: true })
    NU__ShippingStreet__c: string | null;

    @Field({ nullable: true })
    NU__Source__c: string | null;

    @Field({ nullable: true })
    NU__Status__c: string | null;

    @Field(() => Float, { nullable: true })
    NU__TaxableTotal__c: number | null;

    @Field(() => Float, { nullable: true })
    NU__TotalShippingAndTax__c: number | null;

    @Field(() => Float, { nullable: true })
    NU__TotalShipping__c: number | null;

    @Field(() => Float, { nullable: true })
    NU__TotalTax__c: number | null;

    @Field(() => Float, { nullable: true })
    NU__ShippingItemLineCount__c: number | null;

    @Field(() => Float, { nullable: true })
    NU__SubTotal__c: number | null;

    @Field(() => Float, { nullable: true })
    NU__TaxableAmount__c: number | null;

    @Field(() => Float, { nullable: true })
    NU__TotalPayment__c: number | null;

    @Field(() => Float, { nullable: true })
    NU__Discounts__c: number | null;

    @Field({ nullable: true })
    Customer_Last_Name__c: string | null;

    @Field({ nullable: true })
    NU__ShipMethod__c: string | null;

    @Field({ nullable: true })
    NU__RecordTypeName__c: string | null;

    @Field({ nullable: true })
    NU__Entity__c: string | null;

    @Field(() => Float, { nullable: true })
    NU__RecurringBalance__c: number | null;

    @Field({ nullable: true })
    NU__BillingHistory__c: string | null;

    @Field(() => Float, { nullable: true })
    NU__AdjustmentVersion__c: number | null;

    @Field(() => Boolean, { nullable: true })
    NU__BillMe__c: boolean | null;

    @Field(() => Boolean, { nullable: true })
    NU__Recurring__c: boolean | null;

    @Field(() => Float, { nullable: true })
    NU__TotalTaxableAmount__c: number | null;

    @Field(() => Boolean, { nullable: true })
    Opted_in_to_CTA_Dues__c: boolean | null;

    @Field({ nullable: true })
    NU__Data__c: string | null;

    @Field({ nullable: true })
    namz__CartItem__c: string | null;

    @Field({ nullable: true })
    namz__Appeal__c: string | null;

    @Field({ nullable: true })
    Troubleshoot: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Order Items
//****************************************************************************
@InputType()
export class UpdateNU__OrderItem__cInput {
    @Field()
    Id: string;

    @Field(() => Boolean, { nullable: true })
    IsDeleted?: boolean | null;

    @Field({ nullable: true })
    Name?: string | null;

    @Field({ nullable: true })
    RecordTypeId?: string | null;

    @Field({ nullable: true })
    CreatedById?: string | null;

    @Field({ nullable: true })
    LastModifiedById?: string | null;

    @Field({ nullable: true })
    NU__Order__c?: string | null;

    @Field({ nullable: true })
    NU__ARGLAccount__c?: string | null;

    @Field(() => Float, { nullable: true })
    NU__Balance__c?: number | null;

    @Field({ nullable: true })
    NU__CustomerPrimaryAffiliation__c?: string | null;

    @Field({ nullable: true })
    NU__Customer__c?: string | null;

    @Field({ nullable: true })
    NU__ExternalID__c?: string | null;

    @Field(() => Float, { nullable: true })
    NU__GrandTotal__c?: number | null;

    @Field(() => Boolean, { nullable: true })
    NU__IsShipped__c?: boolean | null;

    @Field({ nullable: true })
    NU__PriceClass__c?: string | null;

    @Field({ nullable: true })
    NU__SalesTax__c?: string | null;

    @Field({ nullable: true })
    NU__ShippingAddress__c?: string | null;

    @Field({ nullable: true })
    NU__ShippingCity__c?: string | null;

    @Field({ nullable: true })
    NU__ShippingCountry__c?: string | null;

    @Field({ nullable: true })
    NU__ShippingGLAccount__c?: string | null;

    @Field({ nullable: true })
    NU__ShippingMethod__c?: string | null;

    @Field({ nullable: true })
    NU__ShippingPostalCode__c?: string | null;

    @Field({ nullable: true })
    NU__ShippingState__c?: string | null;

    @Field({ nullable: true })
    NU__ShippingStreet__c?: string | null;

    @Field({ nullable: true })
    NU__Source__c?: string | null;

    @Field({ nullable: true })
    NU__Status__c?: string | null;

    @Field(() => Float, { nullable: true })
    NU__TaxableTotal__c?: number | null;

    @Field(() => Float, { nullable: true })
    NU__TotalShippingAndTax__c?: number | null;

    @Field(() => Float, { nullable: true })
    NU__TotalShipping__c?: number | null;

    @Field(() => Float, { nullable: true })
    NU__TotalTax__c?: number | null;

    @Field(() => Float, { nullable: true })
    NU__ShippingItemLineCount__c?: number | null;

    @Field(() => Float, { nullable: true })
    NU__SubTotal__c?: number | null;

    @Field(() => Float, { nullable: true })
    NU__TaxableAmount__c?: number | null;

    @Field(() => Float, { nullable: true })
    NU__TotalPayment__c?: number | null;

    @Field(() => Float, { nullable: true })
    NU__Discounts__c?: number | null;

    @Field({ nullable: true })
    Customer_Last_Name__c?: string | null;

    @Field({ nullable: true })
    NU__ShipMethod__c?: string | null;

    @Field({ nullable: true })
    NU__RecordTypeName__c?: string | null;

    @Field({ nullable: true })
    NU__Entity__c?: string | null;

    @Field(() => Float, { nullable: true })
    NU__RecurringBalance__c?: number | null;

    @Field({ nullable: true })
    NU__BillingHistory__c?: string | null;

    @Field(() => Float, { nullable: true })
    NU__AdjustmentVersion__c?: number | null;

    @Field(() => Boolean, { nullable: true })
    NU__BillMe__c?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    NU__Recurring__c?: boolean | null;

    @Field(() => Float, { nullable: true })
    NU__TotalTaxableAmount__c?: number | null;

    @Field(() => Boolean, { nullable: true })
    Opted_in_to_CTA_Dues__c?: boolean | null;

    @Field({ nullable: true })
    NU__Data__c?: string | null;

    @Field({ nullable: true })
    namz__CartItem__c?: string | null;

    @Field({ nullable: true })
    namz__Appeal__c?: string | null;

    @Field({ nullable: true })
    Troubleshoot?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Order Items
//****************************************************************************
@ObjectType()
export class RunNU__OrderItem__cViewResult {
    @Field(() => [NU__OrderItem__c_])
    Results: NU__OrderItem__c_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(NU__OrderItem__c_)
export class NU__OrderItem__cResolver extends ResolverBase {
    @Query(() => RunNU__OrderItem__cViewResult)
    async RunNU__OrderItem__cViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunNU__OrderItem__cViewResult)
    async RunNU__OrderItem__cViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunNU__OrderItem__cViewResult)
    async RunNU__OrderItem__cDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Order Items';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => NU__OrderItem__c_, { nullable: true })
    async NU__OrderItem__c(@Arg('Id', () => String) Id: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<NU__OrderItem__c_ | null> {
        this.CheckUserReadPermissions('Order Items', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [nams].[vwNU__OrderItem__cs] WHERE [Id]='${Id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Order Items', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Order Items', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @Mutation(() => NU__OrderItem__c_)
    async CreateNU__OrderItem__c(
        @Arg('input', () => CreateNU__OrderItem__cInput) input: CreateNU__OrderItem__cInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Order Items', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => NU__OrderItem__c_)
    async UpdateNU__OrderItem__c(
        @Arg('input', () => UpdateNU__OrderItem__cInput) input: UpdateNU__OrderItem__cInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Order Items', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => NU__OrderItem__c_)
    async DeleteNU__OrderItem__c(@Arg('Id', () => String) Id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'Id', Value: Id}]);
        return this.DeleteRecord('Order Items', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Order Item Lines
//****************************************************************************
@ObjectType()
export class NU__OrderItemLine__c_ {
    @Field() 
    @MaxLength(100)
    Id: string;
        
    @Field(() => Boolean, {nullable: true}) 
    IsDeleted?: boolean;
        
    @Field({nullable: true}) 
    Name?: string;
        
    @Field({nullable: true}) 
    CreatedById?: string;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    LastModifiedDate?: Date;
        
    @Field({nullable: true}) 
    LastModifiedById?: string;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    SystemModstamp?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    LastActivityDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    LastViewedDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    LastReferencedDate?: Date;
        
    @Field({nullable: true}) 
    NU__OrderItem__c?: string;
        
    @Field({nullable: true}) 
    NU__Product__c?: string;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    NU__AdjustmentDate__c?: Date;
        
    @Field({nullable: true}) 
    NU__DeferredSchedule__c?: string;
        
    @Field({nullable: true}) 
    NU__Donation__c?: string;
        
    @Field({nullable: true}) 
    NU__EventBadge__c?: string;
        
    @Field({nullable: true}) 
    NU__ExternalID__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    NU__IsShippable__c?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    NU__IsTaxable__c?: boolean;
        
    @Field({nullable: true}) 
    NU__MembershipTypeProductLink__c?: string;
        
    @Field({nullable: true}) 
    NU__Membership__c?: string;
        
    @Field({nullable: true}) 
    NU__Merchandise__c?: string;
        
    @Field(() => Float, {nullable: true}) 
    NU__Quantity__c?: number;
        
    @Field({nullable: true}) 
    NU__Registration2__c?: string;
        
    @Field({nullable: true}) 
    NU__Status__c?: string;
        
    @Field({nullable: true}) 
    NU__Subscription__c?: string;
        
    @Field(() => Float, {nullable: true}) 
    NU__TotalPrice__c?: number;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    NU__TransactionDate__c?: Date;
        
    @Field(() => Float, {nullable: true}) 
    NU__UnitPrice__c?: number;
        
    @Field({nullable: true}) 
    NU__Miscellaneous__c?: string;
        
    @Field({nullable: true}) 
    InstitutionAtMembership__c?: string;
        
    @Field({nullable: true}) 
    MemberFirstName__c?: string;
        
    @Field({nullable: true}) 
    MemberLastName__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    Paid_to_SMSTA__c?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    SMSTAChapterDuesProduct__c?: boolean;
        
    @Field({nullable: true}) 
    NU__Product2__c?: string;
        
    @Field({nullable: true}) 
    CustomerExtID__c?: string;
        
    @Field({nullable: true}) 
    namz__CartItemLine__c?: string;
        
    @Field({nullable: true}) 
    namz__ParentProduct__c?: string;
        
    @Field(() => Float, {nullable: true}) 
    namz__UnitPriceOverride__c?: number;
        
    @Field({nullable: true}) 
    namz__OrderState__c?: string;
        
    @Field(() => Float, {nullable: true}) 
    NU__NetValue__c?: number;
        
    @Field(() => Float, {nullable: true}) 
    NU__TaxValue__c?: number;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Order Item Lines
//****************************************************************************
@InputType()
export class CreateNU__OrderItemLine__cInput {
    @Field({ nullable: true })
    Id?: string;

    @Field(() => Boolean, { nullable: true })
    IsDeleted: boolean | null;

    @Field({ nullable: true })
    Name: string | null;

    @Field({ nullable: true })
    CreatedById: string | null;

    @Field({ nullable: true })
    LastModifiedById: string | null;

    @Field({ nullable: true })
    NU__OrderItem__c: string | null;

    @Field({ nullable: true })
    NU__Product__c: string | null;

    @Field({ nullable: true })
    NU__DeferredSchedule__c: string | null;

    @Field({ nullable: true })
    NU__Donation__c: string | null;

    @Field({ nullable: true })
    NU__EventBadge__c: string | null;

    @Field({ nullable: true })
    NU__ExternalID__c: string | null;

    @Field(() => Boolean, { nullable: true })
    NU__IsShippable__c: boolean | null;

    @Field(() => Boolean, { nullable: true })
    NU__IsTaxable__c: boolean | null;

    @Field({ nullable: true })
    NU__MembershipTypeProductLink__c: string | null;

    @Field({ nullable: true })
    NU__Membership__c: string | null;

    @Field({ nullable: true })
    NU__Merchandise__c: string | null;

    @Field(() => Float, { nullable: true })
    NU__Quantity__c: number | null;

    @Field({ nullable: true })
    NU__Registration2__c: string | null;

    @Field({ nullable: true })
    NU__Status__c: string | null;

    @Field({ nullable: true })
    NU__Subscription__c: string | null;

    @Field(() => Float, { nullable: true })
    NU__TotalPrice__c: number | null;

    @Field(() => Float, { nullable: true })
    NU__UnitPrice__c: number | null;

    @Field({ nullable: true })
    NU__Miscellaneous__c: string | null;

    @Field({ nullable: true })
    InstitutionAtMembership__c: string | null;

    @Field({ nullable: true })
    MemberFirstName__c: string | null;

    @Field({ nullable: true })
    MemberLastName__c: string | null;

    @Field(() => Boolean, { nullable: true })
    Paid_to_SMSTA__c: boolean | null;

    @Field(() => Boolean, { nullable: true })
    SMSTAChapterDuesProduct__c: boolean | null;

    @Field({ nullable: true })
    NU__Product2__c: string | null;

    @Field({ nullable: true })
    CustomerExtID__c: string | null;

    @Field({ nullable: true })
    namz__CartItemLine__c: string | null;

    @Field({ nullable: true })
    namz__ParentProduct__c: string | null;

    @Field(() => Float, { nullable: true })
    namz__UnitPriceOverride__c: number | null;

    @Field({ nullable: true })
    namz__OrderState__c: string | null;

    @Field(() => Float, { nullable: true })
    NU__NetValue__c: number | null;

    @Field(() => Float, { nullable: true })
    NU__TaxValue__c: number | null;
}
    

//****************************************************************************
// INPUT TYPE for Order Item Lines
//****************************************************************************
@InputType()
export class UpdateNU__OrderItemLine__cInput {
    @Field()
    Id: string;

    @Field(() => Boolean, { nullable: true })
    IsDeleted?: boolean | null;

    @Field({ nullable: true })
    Name?: string | null;

    @Field({ nullable: true })
    CreatedById?: string | null;

    @Field({ nullable: true })
    LastModifiedById?: string | null;

    @Field({ nullable: true })
    NU__OrderItem__c?: string | null;

    @Field({ nullable: true })
    NU__Product__c?: string | null;

    @Field({ nullable: true })
    NU__DeferredSchedule__c?: string | null;

    @Field({ nullable: true })
    NU__Donation__c?: string | null;

    @Field({ nullable: true })
    NU__EventBadge__c?: string | null;

    @Field({ nullable: true })
    NU__ExternalID__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    NU__IsShippable__c?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    NU__IsTaxable__c?: boolean | null;

    @Field({ nullable: true })
    NU__MembershipTypeProductLink__c?: string | null;

    @Field({ nullable: true })
    NU__Membership__c?: string | null;

    @Field({ nullable: true })
    NU__Merchandise__c?: string | null;

    @Field(() => Float, { nullable: true })
    NU__Quantity__c?: number | null;

    @Field({ nullable: true })
    NU__Registration2__c?: string | null;

    @Field({ nullable: true })
    NU__Status__c?: string | null;

    @Field({ nullable: true })
    NU__Subscription__c?: string | null;

    @Field(() => Float, { nullable: true })
    NU__TotalPrice__c?: number | null;

    @Field(() => Float, { nullable: true })
    NU__UnitPrice__c?: number | null;

    @Field({ nullable: true })
    NU__Miscellaneous__c?: string | null;

    @Field({ nullable: true })
    InstitutionAtMembership__c?: string | null;

    @Field({ nullable: true })
    MemberFirstName__c?: string | null;

    @Field({ nullable: true })
    MemberLastName__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    Paid_to_SMSTA__c?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    SMSTAChapterDuesProduct__c?: boolean | null;

    @Field({ nullable: true })
    NU__Product2__c?: string | null;

    @Field({ nullable: true })
    CustomerExtID__c?: string | null;

    @Field({ nullable: true })
    namz__CartItemLine__c?: string | null;

    @Field({ nullable: true })
    namz__ParentProduct__c?: string | null;

    @Field(() => Float, { nullable: true })
    namz__UnitPriceOverride__c?: number | null;

    @Field({ nullable: true })
    namz__OrderState__c?: string | null;

    @Field(() => Float, { nullable: true })
    NU__NetValue__c?: number | null;

    @Field(() => Float, { nullable: true })
    NU__TaxValue__c?: number | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Order Item Lines
//****************************************************************************
@ObjectType()
export class RunNU__OrderItemLine__cViewResult {
    @Field(() => [NU__OrderItemLine__c_])
    Results: NU__OrderItemLine__c_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(NU__OrderItemLine__c_)
export class NU__OrderItemLine__cResolver extends ResolverBase {
    @Query(() => RunNU__OrderItemLine__cViewResult)
    async RunNU__OrderItemLine__cViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunNU__OrderItemLine__cViewResult)
    async RunNU__OrderItemLine__cViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunNU__OrderItemLine__cViewResult)
    async RunNU__OrderItemLine__cDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Order Item Lines';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => NU__OrderItemLine__c_, { nullable: true })
    async NU__OrderItemLine__c(@Arg('Id', () => String) Id: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<NU__OrderItemLine__c_ | null> {
        this.CheckUserReadPermissions('Order Item Lines', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [nams].[vwNU__OrderItemLine__cs] WHERE [Id]='${Id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Order Item Lines', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Order Item Lines', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @Mutation(() => NU__OrderItemLine__c_)
    async CreateNU__OrderItemLine__c(
        @Arg('input', () => CreateNU__OrderItemLine__cInput) input: CreateNU__OrderItemLine__cInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Order Item Lines', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => NU__OrderItemLine__c_)
    async UpdateNU__OrderItemLine__c(
        @Arg('input', () => UpdateNU__OrderItemLine__cInput) input: UpdateNU__OrderItemLine__cInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Order Item Lines', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => NU__OrderItemLine__c_)
    async DeleteNU__OrderItemLine__c(@Arg('Id', () => String) Id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'Id', Value: Id}]);
        return this.DeleteRecord('Order Item Lines', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Payments
//****************************************************************************
@ObjectType()
export class NU__Payment__c_ {
    @Field() 
    @MaxLength(100)
    Id: string;
        
    @Field({nullable: true}) 
    OwnerId?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    IsDeleted?: boolean;
        
    @Field({nullable: true}) 
    Name?: string;
        
    @Field({nullable: true}) 
    CreatedById?: string;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    LastModifiedDate?: Date;
        
    @Field({nullable: true}) 
    LastModifiedById?: string;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    SystemModstamp?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    LastActivityDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    LastViewedDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    LastReferencedDate?: Date;
        
    @Field({nullable: true}) 
    NU__CheckNumber__c?: string;
        
    @Field({nullable: true}) 
    NU__CreditCardCity__c?: string;
        
    @Field({nullable: true}) 
    NU__CreditCardCountry__c?: string;
        
    @Field({nullable: true}) 
    NU__CreditCardExpirationMonth__c?: string;
        
    @Field({nullable: true}) 
    NU__CreditCardExpirationYear__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    NU__CreditCardIsVoid__c?: boolean;
        
    @Field({nullable: true}) 
    NU__CreditCardName__c?: string;
        
    @Field({nullable: true}) 
    NU__CreditCardNumber__c?: string;
        
    @Field({nullable: true}) 
    NU__CreditCardPostalCode__c?: string;
        
    @Field({nullable: true}) 
    NU__CreditCardRefundedPayment__c?: string;
        
    @Field({nullable: true}) 
    NU__CreditCardSecurityCode__c?: string;
        
    @Field({nullable: true}) 
    NU__CreditCardState__c?: string;
        
    @Field({nullable: true}) 
    NU__CreditCardStreet2__c?: string;
        
    @Field({nullable: true}) 
    NU__CreditCardStreet3__c?: string;
        
    @Field({nullable: true}) 
    NU__CreditCardStreet__c?: string;
        
    @Field({nullable: true}) 
    NU__EntityCreditCardIssuer__c?: string;
        
    @Field({nullable: true}) 
    NU__EntityPaymentMethod__c?: string;
        
    @Field({nullable: true}) 
    NU__ExternalID__c?: string;
        
    @Field({nullable: true}) 
    NU__Note__c?: string;
        
    @Field(() => Float, {nullable: true}) 
    NU__PaymentAmount__c?: number;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    NU__PaymentDate__c?: Date;
        
    @Field({nullable: true}) 
    NU__PaymentProcessorAuthorizationId__c?: string;
        
    @Field({nullable: true}) 
    NU__PaymentProcessorAvsCode__c?: string;
        
    @Field({nullable: true}) 
    NU__PaymentProcessorCardHolderVerifCode__c?: string;
        
    @Field({nullable: true}) 
    NU__PaymentProcessorCode__c?: string;
        
    @Field({nullable: true}) 
    NU__PaymentProcessorRawResponse__c?: string;
        
    @Field({nullable: true}) 
    NU__PaymentProcessorReasonCode__c?: string;
        
    @Field({nullable: true}) 
    NU__PaymentProcessorReasonMessage__c?: string;
        
    @Field({nullable: true}) 
    NU__PaymentProcessorSercurityVerifCode__c?: string;
        
    @Field({nullable: true}) 
    NU__PaymentProcessorSplitTenderId__c?: string;
        
    @Field({nullable: true}) 
    NU__PaymentProcessorTransactionId__c?: string;
        
    @Field({nullable: true}) 
    NU__PurchaseOrderNumber__c?: string;
        
    @Field({nullable: true}) 
    NU__Source__c?: string;
        
    @Field({nullable: true}) 
    NU__Payer__c?: string;
        
    @Field({nullable: true}) 
    Batch__c?: string;
        
    @Field({nullable: true}) 
    District_CTA_Account__c?: string;
        
    @Field({nullable: true}) 
    Dues_Year__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    Unsubmitted_Payment__c?: boolean;
        
    @Field({nullable: true}) 
    NU__RecurringPaymentMessages__c?: string;
        
    @Field({nullable: true}) 
    NU__RecurringPaymentResultCode__c?: string;
        
    @Field({nullable: true}) 
    NU__RecurringPayment__c?: string;
        
    @Field({nullable: true}) 
    Batch_Title__c?: string;
        
    @Field(() => Float, {nullable: true}) 
    NU__AvailableCreditBalance__c?: number;
        
    @Field({nullable: true}) 
    NU__CreditPayableGLAccount__c?: string;
        
    @Field({nullable: true}) 
    NU__Entity__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    NU__IsCredit__c?: boolean;
        
    @Field(() => Float, {nullable: true}) 
    NU__TotalPaymentApplied__c?: number;
        
    @Field(() => Boolean, {nullable: true}) 
    NU__PendingRefund__c?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    NU__PendingCapture__c?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    NU__CreatedByExternalPaymentMethod__c?: boolean;
        
    @Field({nullable: true}) 
    NU__ExternalPaymentProfile__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    NU__AuthorizationReceived__c?: boolean;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    NU__SettlementDate__c?: Date;
        
    @Field(() => Boolean, {nullable: true}) 
    NU__SettlementFail__c?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    NU__ExpressPayment__c?: boolean;
        
    @Field({nullable: true}) 
    NU__GatewayStatus__c?: string;
        
    @Field({nullable: true}) 
    NU__ScheduleLine__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    NU__PointOfSaleDevice__c?: boolean;
        
    @Field({nullable: true}) 
    namz__State__c?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    Troubleshoot?: string;
        
}

//****************************************************************************
// INPUT TYPE for Payments
//****************************************************************************
@InputType()
export class CreateNU__Payment__cInput {
    @Field({ nullable: true })
    Id?: string;

    @Field({ nullable: true })
    OwnerId: string | null;

    @Field(() => Boolean, { nullable: true })
    IsDeleted: boolean | null;

    @Field({ nullable: true })
    Name: string | null;

    @Field({ nullable: true })
    CreatedById: string | null;

    @Field({ nullable: true })
    LastModifiedById: string | null;

    @Field({ nullable: true })
    NU__CheckNumber__c: string | null;

    @Field({ nullable: true })
    NU__CreditCardCity__c: string | null;

    @Field({ nullable: true })
    NU__CreditCardCountry__c: string | null;

    @Field({ nullable: true })
    NU__CreditCardExpirationMonth__c: string | null;

    @Field({ nullable: true })
    NU__CreditCardExpirationYear__c: string | null;

    @Field(() => Boolean, { nullable: true })
    NU__CreditCardIsVoid__c: boolean | null;

    @Field({ nullable: true })
    NU__CreditCardName__c: string | null;

    @Field({ nullable: true })
    NU__CreditCardNumber__c: string | null;

    @Field({ nullable: true })
    NU__CreditCardPostalCode__c: string | null;

    @Field({ nullable: true })
    NU__CreditCardRefundedPayment__c: string | null;

    @Field({ nullable: true })
    NU__CreditCardSecurityCode__c: string | null;

    @Field({ nullable: true })
    NU__CreditCardState__c: string | null;

    @Field({ nullable: true })
    NU__CreditCardStreet2__c: string | null;

    @Field({ nullable: true })
    NU__CreditCardStreet3__c: string | null;

    @Field({ nullable: true })
    NU__CreditCardStreet__c: string | null;

    @Field({ nullable: true })
    NU__EntityCreditCardIssuer__c: string | null;

    @Field({ nullable: true })
    NU__EntityPaymentMethod__c: string | null;

    @Field({ nullable: true })
    NU__ExternalID__c: string | null;

    @Field({ nullable: true })
    NU__Note__c: string | null;

    @Field(() => Float, { nullable: true })
    NU__PaymentAmount__c: number | null;

    @Field({ nullable: true })
    NU__PaymentProcessorAuthorizationId__c: string | null;

    @Field({ nullable: true })
    NU__PaymentProcessorAvsCode__c: string | null;

    @Field({ nullable: true })
    NU__PaymentProcessorCardHolderVerifCode__c: string | null;

    @Field({ nullable: true })
    NU__PaymentProcessorCode__c: string | null;

    @Field({ nullable: true })
    NU__PaymentProcessorRawResponse__c: string | null;

    @Field({ nullable: true })
    NU__PaymentProcessorReasonCode__c: string | null;

    @Field({ nullable: true })
    NU__PaymentProcessorReasonMessage__c: string | null;

    @Field({ nullable: true })
    NU__PaymentProcessorSercurityVerifCode__c: string | null;

    @Field({ nullable: true })
    NU__PaymentProcessorSplitTenderId__c: string | null;

    @Field({ nullable: true })
    NU__PaymentProcessorTransactionId__c: string | null;

    @Field({ nullable: true })
    NU__PurchaseOrderNumber__c: string | null;

    @Field({ nullable: true })
    NU__Source__c: string | null;

    @Field({ nullable: true })
    NU__Payer__c: string | null;

    @Field({ nullable: true })
    Batch__c: string | null;

    @Field({ nullable: true })
    District_CTA_Account__c: string | null;

    @Field({ nullable: true })
    Dues_Year__c: string | null;

    @Field(() => Boolean, { nullable: true })
    Unsubmitted_Payment__c: boolean | null;

    @Field({ nullable: true })
    NU__RecurringPaymentMessages__c: string | null;

    @Field({ nullable: true })
    NU__RecurringPaymentResultCode__c: string | null;

    @Field({ nullable: true })
    NU__RecurringPayment__c: string | null;

    @Field({ nullable: true })
    Batch_Title__c: string | null;

    @Field(() => Float, { nullable: true })
    NU__AvailableCreditBalance__c: number | null;

    @Field({ nullable: true })
    NU__CreditPayableGLAccount__c: string | null;

    @Field({ nullable: true })
    NU__Entity__c: string | null;

    @Field(() => Boolean, { nullable: true })
    NU__IsCredit__c: boolean | null;

    @Field(() => Float, { nullable: true })
    NU__TotalPaymentApplied__c: number | null;

    @Field(() => Boolean, { nullable: true })
    NU__PendingRefund__c: boolean | null;

    @Field(() => Boolean, { nullable: true })
    NU__PendingCapture__c: boolean | null;

    @Field(() => Boolean, { nullable: true })
    NU__CreatedByExternalPaymentMethod__c: boolean | null;

    @Field({ nullable: true })
    NU__ExternalPaymentProfile__c: string | null;

    @Field(() => Boolean, { nullable: true })
    NU__AuthorizationReceived__c: boolean | null;

    @Field(() => Boolean, { nullable: true })
    NU__SettlementFail__c: boolean | null;

    @Field(() => Boolean, { nullable: true })
    NU__ExpressPayment__c: boolean | null;

    @Field({ nullable: true })
    NU__GatewayStatus__c: string | null;

    @Field({ nullable: true })
    NU__ScheduleLine__c: string | null;

    @Field(() => Boolean, { nullable: true })
    NU__PointOfSaleDevice__c: boolean | null;

    @Field({ nullable: true })
    namz__State__c: string | null;

    @Field({ nullable: true })
    Troubleshoot: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Payments
//****************************************************************************
@InputType()
export class UpdateNU__Payment__cInput {
    @Field()
    Id: string;

    @Field({ nullable: true })
    OwnerId?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsDeleted?: boolean | null;

    @Field({ nullable: true })
    Name?: string | null;

    @Field({ nullable: true })
    CreatedById?: string | null;

    @Field({ nullable: true })
    LastModifiedById?: string | null;

    @Field({ nullable: true })
    NU__CheckNumber__c?: string | null;

    @Field({ nullable: true })
    NU__CreditCardCity__c?: string | null;

    @Field({ nullable: true })
    NU__CreditCardCountry__c?: string | null;

    @Field({ nullable: true })
    NU__CreditCardExpirationMonth__c?: string | null;

    @Field({ nullable: true })
    NU__CreditCardExpirationYear__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    NU__CreditCardIsVoid__c?: boolean | null;

    @Field({ nullable: true })
    NU__CreditCardName__c?: string | null;

    @Field({ nullable: true })
    NU__CreditCardNumber__c?: string | null;

    @Field({ nullable: true })
    NU__CreditCardPostalCode__c?: string | null;

    @Field({ nullable: true })
    NU__CreditCardRefundedPayment__c?: string | null;

    @Field({ nullable: true })
    NU__CreditCardSecurityCode__c?: string | null;

    @Field({ nullable: true })
    NU__CreditCardState__c?: string | null;

    @Field({ nullable: true })
    NU__CreditCardStreet2__c?: string | null;

    @Field({ nullable: true })
    NU__CreditCardStreet3__c?: string | null;

    @Field({ nullable: true })
    NU__CreditCardStreet__c?: string | null;

    @Field({ nullable: true })
    NU__EntityCreditCardIssuer__c?: string | null;

    @Field({ nullable: true })
    NU__EntityPaymentMethod__c?: string | null;

    @Field({ nullable: true })
    NU__ExternalID__c?: string | null;

    @Field({ nullable: true })
    NU__Note__c?: string | null;

    @Field(() => Float, { nullable: true })
    NU__PaymentAmount__c?: number | null;

    @Field({ nullable: true })
    NU__PaymentProcessorAuthorizationId__c?: string | null;

    @Field({ nullable: true })
    NU__PaymentProcessorAvsCode__c?: string | null;

    @Field({ nullable: true })
    NU__PaymentProcessorCardHolderVerifCode__c?: string | null;

    @Field({ nullable: true })
    NU__PaymentProcessorCode__c?: string | null;

    @Field({ nullable: true })
    NU__PaymentProcessorRawResponse__c?: string | null;

    @Field({ nullable: true })
    NU__PaymentProcessorReasonCode__c?: string | null;

    @Field({ nullable: true })
    NU__PaymentProcessorReasonMessage__c?: string | null;

    @Field({ nullable: true })
    NU__PaymentProcessorSercurityVerifCode__c?: string | null;

    @Field({ nullable: true })
    NU__PaymentProcessorSplitTenderId__c?: string | null;

    @Field({ nullable: true })
    NU__PaymentProcessorTransactionId__c?: string | null;

    @Field({ nullable: true })
    NU__PurchaseOrderNumber__c?: string | null;

    @Field({ nullable: true })
    NU__Source__c?: string | null;

    @Field({ nullable: true })
    NU__Payer__c?: string | null;

    @Field({ nullable: true })
    Batch__c?: string | null;

    @Field({ nullable: true })
    District_CTA_Account__c?: string | null;

    @Field({ nullable: true })
    Dues_Year__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    Unsubmitted_Payment__c?: boolean | null;

    @Field({ nullable: true })
    NU__RecurringPaymentMessages__c?: string | null;

    @Field({ nullable: true })
    NU__RecurringPaymentResultCode__c?: string | null;

    @Field({ nullable: true })
    NU__RecurringPayment__c?: string | null;

    @Field({ nullable: true })
    Batch_Title__c?: string | null;

    @Field(() => Float, { nullable: true })
    NU__AvailableCreditBalance__c?: number | null;

    @Field({ nullable: true })
    NU__CreditPayableGLAccount__c?: string | null;

    @Field({ nullable: true })
    NU__Entity__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    NU__IsCredit__c?: boolean | null;

    @Field(() => Float, { nullable: true })
    NU__TotalPaymentApplied__c?: number | null;

    @Field(() => Boolean, { nullable: true })
    NU__PendingRefund__c?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    NU__PendingCapture__c?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    NU__CreatedByExternalPaymentMethod__c?: boolean | null;

    @Field({ nullable: true })
    NU__ExternalPaymentProfile__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    NU__AuthorizationReceived__c?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    NU__SettlementFail__c?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    NU__ExpressPayment__c?: boolean | null;

    @Field({ nullable: true })
    NU__GatewayStatus__c?: string | null;

    @Field({ nullable: true })
    NU__ScheduleLine__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    NU__PointOfSaleDevice__c?: boolean | null;

    @Field({ nullable: true })
    namz__State__c?: string | null;

    @Field({ nullable: true })
    Troubleshoot?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Payments
//****************************************************************************
@ObjectType()
export class RunNU__Payment__cViewResult {
    @Field(() => [NU__Payment__c_])
    Results: NU__Payment__c_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(NU__Payment__c_)
export class NU__Payment__cResolver extends ResolverBase {
    @Query(() => RunNU__Payment__cViewResult)
    async RunNU__Payment__cViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunNU__Payment__cViewResult)
    async RunNU__Payment__cViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunNU__Payment__cViewResult)
    async RunNU__Payment__cDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Payments';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => NU__Payment__c_, { nullable: true })
    async NU__Payment__c(@Arg('Id', () => String) Id: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<NU__Payment__c_ | null> {
        this.CheckUserReadPermissions('Payments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [nams].[vwNU__Payment__cs] WHERE [Id]='${Id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Payments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Payments', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @Mutation(() => NU__Payment__c_)
    async CreateNU__Payment__c(
        @Arg('input', () => CreateNU__Payment__cInput) input: CreateNU__Payment__cInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Payments', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => NU__Payment__c_)
    async UpdateNU__Payment__c(
        @Arg('input', () => UpdateNU__Payment__cInput) input: UpdateNU__Payment__cInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Payments', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => NU__Payment__c_)
    async DeleteNU__Payment__c(@Arg('Id', () => String) Id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'Id', Value: Id}]);
        return this.DeleteRecord('Payments', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Payment Lines
//****************************************************************************
@ObjectType()
export class NU__PaymentLine__c_ {
    @Field() 
    @MaxLength(100)
    Id: string;
        
    @Field(() => Boolean, {nullable: true}) 
    IsDeleted?: boolean;
        
    @Field({nullable: true}) 
    Name?: string;
        
    @Field({nullable: true}) 
    CreatedById?: string;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    LastModifiedDate?: Date;
        
    @Field({nullable: true}) 
    LastModifiedById?: string;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    SystemModstamp?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    LastActivityDate?: Date;
        
    @Field({nullable: true}) 
    NU__OrderItem__c?: string;
        
    @Field({nullable: true}) 
    NU__Payment__c?: string;
        
    @Field({nullable: true}) 
    NU__ExternalID__c?: string;
        
    @Field(() => Float, {nullable: true}) 
    NU__PaymentAmount__c?: number;
        
    @Field(() => Boolean, {nullable: true}) 
    Verified__c?: boolean;
        
    @Field({nullable: true}) 
    NU__CreditCardIssuerName__c?: string;
        
    @Field({nullable: true}) 
    NU__ExternalID2__c?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    Troubleshoot?: string;
        
}

//****************************************************************************
// INPUT TYPE for Payment Lines
//****************************************************************************
@InputType()
export class CreateNU__PaymentLine__cInput {
    @Field({ nullable: true })
    Id?: string;

    @Field(() => Boolean, { nullable: true })
    IsDeleted: boolean | null;

    @Field({ nullable: true })
    Name: string | null;

    @Field({ nullable: true })
    CreatedById: string | null;

    @Field({ nullable: true })
    LastModifiedById: string | null;

    @Field({ nullable: true })
    NU__OrderItem__c: string | null;

    @Field({ nullable: true })
    NU__Payment__c: string | null;

    @Field({ nullable: true })
    NU__ExternalID__c: string | null;

    @Field(() => Float, { nullable: true })
    NU__PaymentAmount__c: number | null;

    @Field(() => Boolean, { nullable: true })
    Verified__c: boolean | null;

    @Field({ nullable: true })
    NU__CreditCardIssuerName__c: string | null;

    @Field({ nullable: true })
    NU__ExternalID2__c: string | null;

    @Field({ nullable: true })
    Troubleshoot: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Payment Lines
//****************************************************************************
@InputType()
export class UpdateNU__PaymentLine__cInput {
    @Field()
    Id: string;

    @Field(() => Boolean, { nullable: true })
    IsDeleted?: boolean | null;

    @Field({ nullable: true })
    Name?: string | null;

    @Field({ nullable: true })
    CreatedById?: string | null;

    @Field({ nullable: true })
    LastModifiedById?: string | null;

    @Field({ nullable: true })
    NU__OrderItem__c?: string | null;

    @Field({ nullable: true })
    NU__Payment__c?: string | null;

    @Field({ nullable: true })
    NU__ExternalID__c?: string | null;

    @Field(() => Float, { nullable: true })
    NU__PaymentAmount__c?: number | null;

    @Field(() => Boolean, { nullable: true })
    Verified__c?: boolean | null;

    @Field({ nullable: true })
    NU__CreditCardIssuerName__c?: string | null;

    @Field({ nullable: true })
    NU__ExternalID2__c?: string | null;

    @Field({ nullable: true })
    Troubleshoot?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Payment Lines
//****************************************************************************
@ObjectType()
export class RunNU__PaymentLine__cViewResult {
    @Field(() => [NU__PaymentLine__c_])
    Results: NU__PaymentLine__c_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(NU__PaymentLine__c_)
export class NU__PaymentLine__cResolver extends ResolverBase {
    @Query(() => RunNU__PaymentLine__cViewResult)
    async RunNU__PaymentLine__cViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunNU__PaymentLine__cViewResult)
    async RunNU__PaymentLine__cViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunNU__PaymentLine__cViewResult)
    async RunNU__PaymentLine__cDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Payment Lines';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => NU__PaymentLine__c_, { nullable: true })
    async NU__PaymentLine__c(@Arg('Id', () => String) Id: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<NU__PaymentLine__c_ | null> {
        this.CheckUserReadPermissions('Payment Lines', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [nams].[vwNU__PaymentLine__cs] WHERE [Id]='${Id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Payment Lines', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Payment Lines', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @Mutation(() => NU__PaymentLine__c_)
    async CreateNU__PaymentLine__c(
        @Arg('input', () => CreateNU__PaymentLine__cInput) input: CreateNU__PaymentLine__cInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Payment Lines', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => NU__PaymentLine__c_)
    async UpdateNU__PaymentLine__c(
        @Arg('input', () => UpdateNU__PaymentLine__cInput) input: UpdateNU__PaymentLine__cInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Payment Lines', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => NU__PaymentLine__c_)
    async DeleteNU__PaymentLine__c(@Arg('Id', () => String) Id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'Id', Value: Id}]);
        return this.DeleteRecord('Payment Lines', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Products
//****************************************************************************
@ObjectType()
export class NU__Product__c_ {
    @Field() 
    @MaxLength(100)
    Id: string;
        
    @Field(() => Boolean, {nullable: true}) 
    IsDeleted?: boolean;
        
    @Field({nullable: true}) 
    Name?: string;
        
    @Field({nullable: true}) 
    RecordTypeId?: string;
        
    @Field({nullable: true}) 
    CreatedById?: string;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    LastModifiedDate?: Date;
        
    @Field({nullable: true}) 
    LastModifiedById?: string;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    SystemModstamp?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    LastActivityDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    LastViewedDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    LastReferencedDate?: Date;
        
    @Field({nullable: true}) 
    NU__Entity__c?: string;
        
    @Field({nullable: true}) 
    NU__ConflictCodes__c?: string;
        
    @Field({nullable: true}) 
    NU__DeferredRevenueMethod__c?: string;
        
    @Field({nullable: true}) 
    NU__Description__c?: string;
        
    @Field(() => Float, {nullable: true}) 
    NU__DisplayOrder__c?: number;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    NU__EventSessionEndDate__c?: Date;
        
    @Field({nullable: true}) 
    NU__EventSessionGroup__c?: string;
        
    @Field({nullable: true}) 
    NU__EventSessionSpecialVenueInstructions__c?: string;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    NU__EventSessionStartDate__c?: Date;
        
    @Field({nullable: true}) 
    NU__Event__c?: string;
        
    @Field({nullable: true}) 
    NU__ExternalID__c?: string;
        
    @Field(() => Float, {nullable: true}) 
    NU__InventoryOnHand__c?: number;
        
    @Field(() => Float, {nullable: true}) 
    NU__InventoryUsed__c?: number;
        
    @Field(() => Float, {nullable: true}) 
    NU__Inventory__c?: number;
        
    @Field(() => Boolean, {nullable: true}) 
    NU__IsEventBadge__c?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    NU__IsFee__c?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    NU__IsShippable__c?: boolean;
        
    @Field(() => Boolean, {nullable: true}) 
    NU__IsTaxable__c?: boolean;
        
    @Field(() => Float, {nullable: true}) 
    NU__ListPrice__c?: number;
        
    @Field(() => Float, {nullable: true}) 
    NU__QuantityMax__c?: number;
        
    @Field({nullable: true}) 
    NU__RecordTypeName__c?: string;
        
    @Field({nullable: true}) 
    NU__RevenueGLAccount__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    NU__SelfServiceEnabled__c?: boolean;
        
    @Field({nullable: true}) 
    NU__ShortName__c?: string;
        
    @Field({nullable: true}) 
    NU__Status__c?: string;
        
    @Field({nullable: true}) 
    NU__SubscriptionAnnualStartMonth__c?: string;
        
    @Field(() => Float, {nullable: true}) 
    NU__SubscriptionGracePeriod__c?: number;
        
    @Field({nullable: true}) 
    NU__SubscriptionRenewalType__c?: string;
        
    @Field({nullable: true}) 
    NU__SubscriptionStartDateControl__c?: string;
        
    @Field(() => Float, {nullable: true}) 
    NU__SubscriptionTerm__c?: number;
        
    @Field(() => Boolean, {nullable: true}) 
    NU__TrackInventory__c?: boolean;
        
    @Field({nullable: true}) 
    NU__WebProductImageURL__c?: string;
        
    @Field(() => Float, {nullable: true}) 
    NU__WeightInPounds__c?: number;
        
    @Field({nullable: true}) 
    Legacy_Product_Code__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    MobileActive__c?: boolean;
        
    @Field({nullable: true}) 
    MobileLocation__c?: string;
        
    @Field({nullable: true}) 
    MobileTwitterHashTag__c?: string;
        
    @Field({nullable: true}) 
    Payroll_Payment_Detail__c?: string;
        
    @Field({nullable: true}) 
    Marketing_Label__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    Easy_Renewal__c?: boolean;
        
    @Field({nullable: true}) 
    Account__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    SMSTA_Product__c?: boolean;
        
    @Field(() => Float, {nullable: true}) 
    SMSTATotalOwed__c?: number;
        
    @Field({nullable: true}) 
    NU__Event2__c?: string;
        
    @Field({nullable: true}) 
    NU__DownloadUrl__c?: string;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    NU__InventoryLastUpdated__c?: Date;
        
    @Field(() => Boolean, {nullable: true}) 
    NU__IsDownloadable__c?: boolean;
        
    @Field({nullable: true}) 
    NU__ShortDescription__c?: string;
        
    @Field({nullable: true}) 
    NU__RegistrationTypes__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    NU__BillMeEnabled__c?: boolean;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    NU__EndDate__c?: Date;
        
    @Field({nullable: true}) 
    NU__FeeType__c?: string;
        
    @Field(() => Float, {nullable: true}) 
    NU__Rate__c?: number;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    NU__StartDate__c?: Date;
        
    @Field({nullable: true}) 
    NU__CheckoutUrl__c?: string;
        
    @Field({nullable: true}) 
    NU__SuggestedDonationAmounts__c?: string;
        
    @Field({nullable: true}) 
    NU__UrlParameterName__c?: string;
        
    @Field({nullable: true}) 
    NU__CommodityCode__c?: string;
        
    @Field({nullable: true}) 
    NU__UnitOfMeasurement__c?: string;
        
    @Field({nullable: true}) 
    NU__Publication__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    NU__RecurringEligible__c?: boolean;
        
    @Field({nullable: true}) 
    NU__RecurringFrequency__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    NU__CanNotBeSoldSeparately2__c?: boolean;
        
    @Field({nullable: true}) 
    NU__TaxCode__c?: string;
        
    @Field({nullable: true}) 
    NU_CBCW__LMSExternalId__c?: string;
        
    @Field(() => Float, {nullable: true}) 
    NU_CBCW__LMSTerm__c?: number;
        
    @Field(() => Boolean, {nullable: true}) 
    NU_CBCW__SyncWithLMS__c?: boolean;
        
    @Field({nullable: true}) 
    Institution__c?: string;
        
    @Field({nullable: true}) 
    NU__DescriptionRichText__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    NU__AllowCrossEntityCoupon__c?: boolean;
        
    @Field({nullable: true}) 
    NU_CBCW__LMSErrorMessage__c?: string;
        
    @Field({nullable: true}) 
    NU_CBCW__LMSLifecycleStatus__c?: string;
        
    @Field({nullable: true}) 
    NU_CBCW__LMSSynchronizationStatus__c?: string;
        
    @Field({nullable: true}) 
    NU_CBCW__LMSType__c?: string;
        
    @Field(() => Boolean, {nullable: true}) 
    namz__SkipCheckoutForZeroDollars__c?: boolean;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    Troubleshoot?: string;
        
}

//****************************************************************************
// INPUT TYPE for Products
//****************************************************************************
@InputType()
export class CreateNU__Product__cInput {
    @Field({ nullable: true })
    Id?: string;

    @Field(() => Boolean, { nullable: true })
    IsDeleted: boolean | null;

    @Field({ nullable: true })
    Name: string | null;

    @Field({ nullable: true })
    RecordTypeId: string | null;

    @Field({ nullable: true })
    CreatedById: string | null;

    @Field({ nullable: true })
    LastModifiedById: string | null;

    @Field({ nullable: true })
    NU__Entity__c: string | null;

    @Field({ nullable: true })
    NU__ConflictCodes__c: string | null;

    @Field({ nullable: true })
    NU__DeferredRevenueMethod__c: string | null;

    @Field({ nullable: true })
    NU__Description__c: string | null;

    @Field(() => Float, { nullable: true })
    NU__DisplayOrder__c: number | null;

    @Field({ nullable: true })
    NU__EventSessionGroup__c: string | null;

    @Field({ nullable: true })
    NU__EventSessionSpecialVenueInstructions__c: string | null;

    @Field({ nullable: true })
    NU__Event__c: string | null;

    @Field({ nullable: true })
    NU__ExternalID__c: string | null;

    @Field(() => Float, { nullable: true })
    NU__InventoryOnHand__c: number | null;

    @Field(() => Float, { nullable: true })
    NU__InventoryUsed__c: number | null;

    @Field(() => Float, { nullable: true })
    NU__Inventory__c: number | null;

    @Field(() => Boolean, { nullable: true })
    NU__IsEventBadge__c: boolean | null;

    @Field(() => Boolean, { nullable: true })
    NU__IsFee__c: boolean | null;

    @Field(() => Boolean, { nullable: true })
    NU__IsShippable__c: boolean | null;

    @Field(() => Boolean, { nullable: true })
    NU__IsTaxable__c: boolean | null;

    @Field(() => Float, { nullable: true })
    NU__ListPrice__c: number | null;

    @Field(() => Float, { nullable: true })
    NU__QuantityMax__c: number | null;

    @Field({ nullable: true })
    NU__RecordTypeName__c: string | null;

    @Field({ nullable: true })
    NU__RevenueGLAccount__c: string | null;

    @Field(() => Boolean, { nullable: true })
    NU__SelfServiceEnabled__c: boolean | null;

    @Field({ nullable: true })
    NU__ShortName__c: string | null;

    @Field({ nullable: true })
    NU__Status__c: string | null;

    @Field({ nullable: true })
    NU__SubscriptionAnnualStartMonth__c: string | null;

    @Field(() => Float, { nullable: true })
    NU__SubscriptionGracePeriod__c: number | null;

    @Field({ nullable: true })
    NU__SubscriptionRenewalType__c: string | null;

    @Field({ nullable: true })
    NU__SubscriptionStartDateControl__c: string | null;

    @Field(() => Float, { nullable: true })
    NU__SubscriptionTerm__c: number | null;

    @Field(() => Boolean, { nullable: true })
    NU__TrackInventory__c: boolean | null;

    @Field({ nullable: true })
    NU__WebProductImageURL__c: string | null;

    @Field(() => Float, { nullable: true })
    NU__WeightInPounds__c: number | null;

    @Field({ nullable: true })
    Legacy_Product_Code__c: string | null;

    @Field(() => Boolean, { nullable: true })
    MobileActive__c: boolean | null;

    @Field({ nullable: true })
    MobileLocation__c: string | null;

    @Field({ nullable: true })
    MobileTwitterHashTag__c: string | null;

    @Field({ nullable: true })
    Payroll_Payment_Detail__c: string | null;

    @Field({ nullable: true })
    Marketing_Label__c: string | null;

    @Field(() => Boolean, { nullable: true })
    Easy_Renewal__c: boolean | null;

    @Field({ nullable: true })
    Account__c: string | null;

    @Field(() => Boolean, { nullable: true })
    SMSTA_Product__c: boolean | null;

    @Field(() => Float, { nullable: true })
    SMSTATotalOwed__c: number | null;

    @Field({ nullable: true })
    NU__Event2__c: string | null;

    @Field({ nullable: true })
    NU__DownloadUrl__c: string | null;

    @Field(() => Boolean, { nullable: true })
    NU__IsDownloadable__c: boolean | null;

    @Field({ nullable: true })
    NU__ShortDescription__c: string | null;

    @Field({ nullable: true })
    NU__RegistrationTypes__c: string | null;

    @Field(() => Boolean, { nullable: true })
    NU__BillMeEnabled__c: boolean | null;

    @Field({ nullable: true })
    NU__FeeType__c: string | null;

    @Field(() => Float, { nullable: true })
    NU__Rate__c: number | null;

    @Field({ nullable: true })
    NU__CheckoutUrl__c: string | null;

    @Field({ nullable: true })
    NU__SuggestedDonationAmounts__c: string | null;

    @Field({ nullable: true })
    NU__UrlParameterName__c: string | null;

    @Field({ nullable: true })
    NU__CommodityCode__c: string | null;

    @Field({ nullable: true })
    NU__UnitOfMeasurement__c: string | null;

    @Field({ nullable: true })
    NU__Publication__c: string | null;

    @Field(() => Boolean, { nullable: true })
    NU__RecurringEligible__c: boolean | null;

    @Field({ nullable: true })
    NU__RecurringFrequency__c: string | null;

    @Field(() => Boolean, { nullable: true })
    NU__CanNotBeSoldSeparately2__c: boolean | null;

    @Field({ nullable: true })
    NU__TaxCode__c: string | null;

    @Field({ nullable: true })
    NU_CBCW__LMSExternalId__c: string | null;

    @Field(() => Float, { nullable: true })
    NU_CBCW__LMSTerm__c: number | null;

    @Field(() => Boolean, { nullable: true })
    NU_CBCW__SyncWithLMS__c: boolean | null;

    @Field({ nullable: true })
    Institution__c: string | null;

    @Field({ nullable: true })
    NU__DescriptionRichText__c: string | null;

    @Field(() => Boolean, { nullable: true })
    NU__AllowCrossEntityCoupon__c: boolean | null;

    @Field({ nullable: true })
    NU_CBCW__LMSErrorMessage__c: string | null;

    @Field({ nullable: true })
    NU_CBCW__LMSLifecycleStatus__c: string | null;

    @Field({ nullable: true })
    NU_CBCW__LMSSynchronizationStatus__c: string | null;

    @Field({ nullable: true })
    NU_CBCW__LMSType__c: string | null;

    @Field(() => Boolean, { nullable: true })
    namz__SkipCheckoutForZeroDollars__c: boolean | null;

    @Field({ nullable: true })
    Troubleshoot: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Products
//****************************************************************************
@InputType()
export class UpdateNU__Product__cInput {
    @Field()
    Id: string;

    @Field(() => Boolean, { nullable: true })
    IsDeleted?: boolean | null;

    @Field({ nullable: true })
    Name?: string | null;

    @Field({ nullable: true })
    RecordTypeId?: string | null;

    @Field({ nullable: true })
    CreatedById?: string | null;

    @Field({ nullable: true })
    LastModifiedById?: string | null;

    @Field({ nullable: true })
    NU__Entity__c?: string | null;

    @Field({ nullable: true })
    NU__ConflictCodes__c?: string | null;

    @Field({ nullable: true })
    NU__DeferredRevenueMethod__c?: string | null;

    @Field({ nullable: true })
    NU__Description__c?: string | null;

    @Field(() => Float, { nullable: true })
    NU__DisplayOrder__c?: number | null;

    @Field({ nullable: true })
    NU__EventSessionGroup__c?: string | null;

    @Field({ nullable: true })
    NU__EventSessionSpecialVenueInstructions__c?: string | null;

    @Field({ nullable: true })
    NU__Event__c?: string | null;

    @Field({ nullable: true })
    NU__ExternalID__c?: string | null;

    @Field(() => Float, { nullable: true })
    NU__InventoryOnHand__c?: number | null;

    @Field(() => Float, { nullable: true })
    NU__InventoryUsed__c?: number | null;

    @Field(() => Float, { nullable: true })
    NU__Inventory__c?: number | null;

    @Field(() => Boolean, { nullable: true })
    NU__IsEventBadge__c?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    NU__IsFee__c?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    NU__IsShippable__c?: boolean | null;

    @Field(() => Boolean, { nullable: true })
    NU__IsTaxable__c?: boolean | null;

    @Field(() => Float, { nullable: true })
    NU__ListPrice__c?: number | null;

    @Field(() => Float, { nullable: true })
    NU__QuantityMax__c?: number | null;

    @Field({ nullable: true })
    NU__RecordTypeName__c?: string | null;

    @Field({ nullable: true })
    NU__RevenueGLAccount__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    NU__SelfServiceEnabled__c?: boolean | null;

    @Field({ nullable: true })
    NU__ShortName__c?: string | null;

    @Field({ nullable: true })
    NU__Status__c?: string | null;

    @Field({ nullable: true })
    NU__SubscriptionAnnualStartMonth__c?: string | null;

    @Field(() => Float, { nullable: true })
    NU__SubscriptionGracePeriod__c?: number | null;

    @Field({ nullable: true })
    NU__SubscriptionRenewalType__c?: string | null;

    @Field({ nullable: true })
    NU__SubscriptionStartDateControl__c?: string | null;

    @Field(() => Float, { nullable: true })
    NU__SubscriptionTerm__c?: number | null;

    @Field(() => Boolean, { nullable: true })
    NU__TrackInventory__c?: boolean | null;

    @Field({ nullable: true })
    NU__WebProductImageURL__c?: string | null;

    @Field(() => Float, { nullable: true })
    NU__WeightInPounds__c?: number | null;

    @Field({ nullable: true })
    Legacy_Product_Code__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    MobileActive__c?: boolean | null;

    @Field({ nullable: true })
    MobileLocation__c?: string | null;

    @Field({ nullable: true })
    MobileTwitterHashTag__c?: string | null;

    @Field({ nullable: true })
    Payroll_Payment_Detail__c?: string | null;

    @Field({ nullable: true })
    Marketing_Label__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    Easy_Renewal__c?: boolean | null;

    @Field({ nullable: true })
    Account__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    SMSTA_Product__c?: boolean | null;

    @Field(() => Float, { nullable: true })
    SMSTATotalOwed__c?: number | null;

    @Field({ nullable: true })
    NU__Event2__c?: string | null;

    @Field({ nullable: true })
    NU__DownloadUrl__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    NU__IsDownloadable__c?: boolean | null;

    @Field({ nullable: true })
    NU__ShortDescription__c?: string | null;

    @Field({ nullable: true })
    NU__RegistrationTypes__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    NU__BillMeEnabled__c?: boolean | null;

    @Field({ nullable: true })
    NU__FeeType__c?: string | null;

    @Field(() => Float, { nullable: true })
    NU__Rate__c?: number | null;

    @Field({ nullable: true })
    NU__CheckoutUrl__c?: string | null;

    @Field({ nullable: true })
    NU__SuggestedDonationAmounts__c?: string | null;

    @Field({ nullable: true })
    NU__UrlParameterName__c?: string | null;

    @Field({ nullable: true })
    NU__CommodityCode__c?: string | null;

    @Field({ nullable: true })
    NU__UnitOfMeasurement__c?: string | null;

    @Field({ nullable: true })
    NU__Publication__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    NU__RecurringEligible__c?: boolean | null;

    @Field({ nullable: true })
    NU__RecurringFrequency__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    NU__CanNotBeSoldSeparately2__c?: boolean | null;

    @Field({ nullable: true })
    NU__TaxCode__c?: string | null;

    @Field({ nullable: true })
    NU_CBCW__LMSExternalId__c?: string | null;

    @Field(() => Float, { nullable: true })
    NU_CBCW__LMSTerm__c?: number | null;

    @Field(() => Boolean, { nullable: true })
    NU_CBCW__SyncWithLMS__c?: boolean | null;

    @Field({ nullable: true })
    Institution__c?: string | null;

    @Field({ nullable: true })
    NU__DescriptionRichText__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    NU__AllowCrossEntityCoupon__c?: boolean | null;

    @Field({ nullable: true })
    NU_CBCW__LMSErrorMessage__c?: string | null;

    @Field({ nullable: true })
    NU_CBCW__LMSLifecycleStatus__c?: string | null;

    @Field({ nullable: true })
    NU_CBCW__LMSSynchronizationStatus__c?: string | null;

    @Field({ nullable: true })
    NU_CBCW__LMSType__c?: string | null;

    @Field(() => Boolean, { nullable: true })
    namz__SkipCheckoutForZeroDollars__c?: boolean | null;

    @Field({ nullable: true })
    Troubleshoot?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Products
//****************************************************************************
@ObjectType()
export class RunNU__Product__cViewResult {
    @Field(() => [NU__Product__c_])
    Results: NU__Product__c_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(NU__Product__c_)
export class NU__Product__cResolver extends ResolverBase {
    @Query(() => RunNU__Product__cViewResult)
    async RunNU__Product__cViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunNU__Product__cViewResult)
    async RunNU__Product__cViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunNU__Product__cViewResult)
    async RunNU__Product__cDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Products';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => NU__Product__c_, { nullable: true })
    async NU__Product__c(@Arg('Id', () => String) Id: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<NU__Product__c_ | null> {
        this.CheckUserReadPermissions('Products', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [nams].[vwNU__Product__cs] WHERE [Id]='${Id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Products', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Products', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @Mutation(() => NU__Product__c_)
    async CreateNU__Product__c(
        @Arg('input', () => CreateNU__Product__cInput) input: CreateNU__Product__cInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Products', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => NU__Product__c_)
    async UpdateNU__Product__c(
        @Arg('input', () => UpdateNU__Product__cInput) input: UpdateNU__Product__cInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Products', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => NU__Product__c_)
    async DeleteNU__Product__c(@Arg('Id', () => String) Id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'Id', Value: Id}]);
        return this.DeleteRecord('Products', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Registrations
//****************************************************************************
@ObjectType()
export class NU__Registration2__c_ {
    @Field() 
    @MaxLength(100)
    Id: string;
        
    @Field(() => Boolean, {nullable: true}) 
    IsDeleted?: boolean;
        
    @Field({nullable: true}) 
    Name?: string;
        
    @Field({nullable: true}) 
    CreatedById?: string;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    LastModifiedDate?: Date;
        
    @Field({nullable: true}) 
    LastModifiedById?: string;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    SystemModstamp?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    LastActivityDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    LastViewedDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    LastReferencedDate?: Date;
        
    @Field({nullable: true}) 
    NU__Account__c?: string;
        
    @Field({nullable: true}) 
    NU__Event__c?: string;
        
    @Field(() => Float, {nullable: true}) 
    NU__Amount__c?: number;
        
    @Field(() => Float, {nullable: true}) 
    NU__Balance__c?: number;
        
    @Field({nullable: true}) 
    NU__EntityName__c?: string;
        
    @Field({nullable: true}) 
    NU__EventName__c?: string;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    NU__EventStartDate__c?: Date;
        
    @Field(() => Float, {nullable: true}) 
    NU__ExternalAmount__c?: number;
        
    @Field({nullable: true}) 
    NU__ExternalId__c?: string;
        
    @Field({nullable: true}) 
    NU__FullName__c?: string;
        
    @Field({nullable: true}) 
    NU__OrderItem__c?: string;
        
    @Field({nullable: true}) 
    NU__PriceClass__c?: string;
        
    @Field({nullable: true}) 
    NU__PrimaryAffiliation__c?: string;
        
    @Field({nullable: true}) 
    NU__RegistrantAddress__c?: string;
        
    @Field({nullable: true}) 
    NU__RegistrantEmail__c?: string;
        
    @Field({nullable: true}) 
    NU__Search__c?: string;
        
    @Field({nullable: true}) 
    NU__StatusFlag__c?: string;
        
    @Field({nullable: true}) 
    NU__Status__c?: string;
        
    @Field(() => Float, {nullable: true}) 
    NU__TotalPayment__c?: number;
        
    @Field({nullable: true}) 
    Registrant_Institution__c?: string;
        
    @Field({nullable: true}) 
    EventID__c?: string;
        
    @Field({nullable: true}) 
    Event_Short_Name__c?: string;
        
    @Field({nullable: true}) 
    Member_ID__c?: string;
        
    @Field({nullable: true}) 
    NU__CancellationReason__c?: string;
        
    @Field({nullable: true}) 
    NU__Event2__c?: string;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    NU__EventStartDate2__c?: Date;
        
    @Field({nullable: true}) 
    NU__RegistrationType__c?: string;
        
    @Field({nullable: true}) 
    NU__Passcode__c?: string;
        
    @Field({nullable: true}) 
    NU__Account2__c?: string;
        
    @Field({nullable: true}) 
    InxpoSyncResponse__c?: string;
        
    @Field({nullable: true}) 
    InxpoSyncStatus__c?: string;
        
    @Field(() => Float, {nullable: true}) 
    NU__ExternalQuantity__c?: number;
        
    @Field(() => Float, {nullable: true}) 
    NU__Quantity__c?: number;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    NU__ExternalTransactionDate__c?: Date;
        
    @Field(() => Float, {nullable: true}) 
    NU__ExternalUnitPrice__c?: number;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    NU__TransactionDate__c?: Date;
        
    @Field(() => Float, {nullable: true}) 
    NU__UnitPrice__c?: number;
        
    @Field(() => Boolean, {nullable: true}) 
    Exempt_from_Book_Studies__c?: boolean;
        
    @Field({nullable: true}) 
    namz__EventAnswers__c?: string;
        
    @Field({nullable: true}) 
    namz__EventBadge__c?: string;
        
    @Field({nullable: true}) 
    namz__OrderItemLine__c?: string;
        
    @Field({nullable: true}) 
    NU__Order__c?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    Troubleshoot?: string;
        
}

//****************************************************************************
// INPUT TYPE for Registrations
//****************************************************************************
@InputType()
export class CreateNU__Registration2__cInput {
    @Field({ nullable: true })
    Id?: string;

    @Field(() => Boolean, { nullable: true })
    IsDeleted: boolean | null;

    @Field({ nullable: true })
    Name: string | null;

    @Field({ nullable: true })
    CreatedById: string | null;

    @Field({ nullable: true })
    LastModifiedById: string | null;

    @Field({ nullable: true })
    NU__Account__c: string | null;

    @Field({ nullable: true })
    NU__Event__c: string | null;

    @Field(() => Float, { nullable: true })
    NU__Amount__c: number | null;

    @Field(() => Float, { nullable: true })
    NU__Balance__c: number | null;

    @Field({ nullable: true })
    NU__EntityName__c: string | null;

    @Field({ nullable: true })
    NU__EventName__c: string | null;

    @Field(() => Float, { nullable: true })
    NU__ExternalAmount__c: number | null;

    @Field({ nullable: true })
    NU__ExternalId__c: string | null;

    @Field({ nullable: true })
    NU__FullName__c: string | null;

    @Field({ nullable: true })
    NU__OrderItem__c: string | null;

    @Field({ nullable: true })
    NU__PriceClass__c: string | null;

    @Field({ nullable: true })
    NU__PrimaryAffiliation__c: string | null;

    @Field({ nullable: true })
    NU__RegistrantAddress__c: string | null;

    @Field({ nullable: true })
    NU__RegistrantEmail__c: string | null;

    @Field({ nullable: true })
    NU__Search__c: string | null;

    @Field({ nullable: true })
    NU__StatusFlag__c: string | null;

    @Field({ nullable: true })
    NU__Status__c: string | null;

    @Field(() => Float, { nullable: true })
    NU__TotalPayment__c: number | null;

    @Field({ nullable: true })
    Registrant_Institution__c: string | null;

    @Field({ nullable: true })
    EventID__c: string | null;

    @Field({ nullable: true })
    Event_Short_Name__c: string | null;

    @Field({ nullable: true })
    Member_ID__c: string | null;

    @Field({ nullable: true })
    NU__CancellationReason__c: string | null;

    @Field({ nullable: true })
    NU__Event2__c: string | null;

    @Field({ nullable: true })
    NU__RegistrationType__c: string | null;

    @Field({ nullable: true })
    NU__Passcode__c: string | null;

    @Field({ nullable: true })
    NU__Account2__c: string | null;

    @Field({ nullable: true })
    InxpoSyncResponse__c: string | null;

    @Field({ nullable: true })
    InxpoSyncStatus__c: string | null;

    @Field(() => Float, { nullable: true })
    NU__ExternalQuantity__c: number | null;

    @Field(() => Float, { nullable: true })
    NU__Quantity__c: number | null;

    @Field(() => Float, { nullable: true })
    NU__ExternalUnitPrice__c: number | null;

    @Field(() => Float, { nullable: true })
    NU__UnitPrice__c: number | null;

    @Field(() => Boolean, { nullable: true })
    Exempt_from_Book_Studies__c: boolean | null;

    @Field({ nullable: true })
    namz__EventAnswers__c: string | null;

    @Field({ nullable: true })
    namz__EventBadge__c: string | null;

    @Field({ nullable: true })
    namz__OrderItemLine__c: string | null;

    @Field({ nullable: true })
    NU__Order__c: string | null;

    @Field({ nullable: true })
    Troubleshoot: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Registrations
//****************************************************************************
@InputType()
export class UpdateNU__Registration2__cInput {
    @Field()
    Id: string;

    @Field(() => Boolean, { nullable: true })
    IsDeleted?: boolean | null;

    @Field({ nullable: true })
    Name?: string | null;

    @Field({ nullable: true })
    CreatedById?: string | null;

    @Field({ nullable: true })
    LastModifiedById?: string | null;

    @Field({ nullable: true })
    NU__Account__c?: string | null;

    @Field({ nullable: true })
    NU__Event__c?: string | null;

    @Field(() => Float, { nullable: true })
    NU__Amount__c?: number | null;

    @Field(() => Float, { nullable: true })
    NU__Balance__c?: number | null;

    @Field({ nullable: true })
    NU__EntityName__c?: string | null;

    @Field({ nullable: true })
    NU__EventName__c?: string | null;

    @Field(() => Float, { nullable: true })
    NU__ExternalAmount__c?: number | null;

    @Field({ nullable: true })
    NU__ExternalId__c?: string | null;

    @Field({ nullable: true })
    NU__FullName__c?: string | null;

    @Field({ nullable: true })
    NU__OrderItem__c?: string | null;

    @Field({ nullable: true })
    NU__PriceClass__c?: string | null;

    @Field({ nullable: true })
    NU__PrimaryAffiliation__c?: string | null;

    @Field({ nullable: true })
    NU__RegistrantAddress__c?: string | null;

    @Field({ nullable: true })
    NU__RegistrantEmail__c?: string | null;

    @Field({ nullable: true })
    NU__Search__c?: string | null;

    @Field({ nullable: true })
    NU__StatusFlag__c?: string | null;

    @Field({ nullable: true })
    NU__Status__c?: string | null;

    @Field(() => Float, { nullable: true })
    NU__TotalPayment__c?: number | null;

    @Field({ nullable: true })
    Registrant_Institution__c?: string | null;

    @Field({ nullable: true })
    EventID__c?: string | null;

    @Field({ nullable: true })
    Event_Short_Name__c?: string | null;

    @Field({ nullable: true })
    Member_ID__c?: string | null;

    @Field({ nullable: true })
    NU__CancellationReason__c?: string | null;

    @Field({ nullable: true })
    NU__Event2__c?: string | null;

    @Field({ nullable: true })
    NU__RegistrationType__c?: string | null;

    @Field({ nullable: true })
    NU__Passcode__c?: string | null;

    @Field({ nullable: true })
    NU__Account2__c?: string | null;

    @Field({ nullable: true })
    InxpoSyncResponse__c?: string | null;

    @Field({ nullable: true })
    InxpoSyncStatus__c?: string | null;

    @Field(() => Float, { nullable: true })
    NU__ExternalQuantity__c?: number | null;

    @Field(() => Float, { nullable: true })
    NU__Quantity__c?: number | null;

    @Field(() => Float, { nullable: true })
    NU__ExternalUnitPrice__c?: number | null;

    @Field(() => Float, { nullable: true })
    NU__UnitPrice__c?: number | null;

    @Field(() => Boolean, { nullable: true })
    Exempt_from_Book_Studies__c?: boolean | null;

    @Field({ nullable: true })
    namz__EventAnswers__c?: string | null;

    @Field({ nullable: true })
    namz__EventBadge__c?: string | null;

    @Field({ nullable: true })
    namz__OrderItemLine__c?: string | null;

    @Field({ nullable: true })
    NU__Order__c?: string | null;

    @Field({ nullable: true })
    Troubleshoot?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Registrations
//****************************************************************************
@ObjectType()
export class RunNU__Registration2__cViewResult {
    @Field(() => [NU__Registration2__c_])
    Results: NU__Registration2__c_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(NU__Registration2__c_)
export class NU__Registration2__cResolver extends ResolverBase {
    @Query(() => RunNU__Registration2__cViewResult)
    async RunNU__Registration2__cViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunNU__Registration2__cViewResult)
    async RunNU__Registration2__cViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunNU__Registration2__cViewResult)
    async RunNU__Registration2__cDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Registrations';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => NU__Registration2__c_, { nullable: true })
    async NU__Registration2__c(@Arg('Id', () => String) Id: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<NU__Registration2__c_ | null> {
        this.CheckUserReadPermissions('Registrations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [nams].[vwNU__Registration2__cs] WHERE [Id]='${Id}' ` + this.getRowLevelSecurityWhereClause(provider, 'Registrations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Registrations', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @Mutation(() => NU__Registration2__c_)
    async CreateNU__Registration2__c(
        @Arg('input', () => CreateNU__Registration2__cInput) input: CreateNU__Registration2__cInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Registrations', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => NU__Registration2__c_)
    async UpdateNU__Registration2__c(
        @Arg('input', () => UpdateNU__Registration2__cInput) input: UpdateNU__Registration2__cInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Registrations', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => NU__Registration2__c_)
    async DeleteNU__Registration2__c(@Arg('Id', () => String) Id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'Id', Value: Id}]);
        return this.DeleteRecord('Registrations', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Account Descriptions
//****************************************************************************
@ObjectType()
export class acct_desc_ {
    @Field(() => Int, {nullable: true}) 
    acct_number?: number;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    acct_desc?: string;
        
    @Field(() => Int) 
    ID: number;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Account Descriptions
//****************************************************************************
@InputType()
export class Createacct_descInput {
    @Field(() => Int, { nullable: true })
    acct_number: number | null;

    @Field({ nullable: true })
    acct_desc: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Account Descriptions
//****************************************************************************
@InputType()
export class Updateacct_descInput {
    @Field(() => Int, { nullable: true })
    acct_number?: number | null;

    @Field({ nullable: true })
    acct_desc?: string | null;

    @Field(() => Int)
    ID: number;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Account Descriptions
//****************************************************************************
@ObjectType()
export class Runacct_descViewResult {
    @Field(() => [acct_desc_])
    Results: acct_desc_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(acct_desc_)
export class acct_descResolver extends ResolverBase {
    @Query(() => Runacct_descViewResult)
    async Runacct_descViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => Runacct_descViewResult)
    async Runacct_descViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => Runacct_descViewResult)
    async Runacct_descDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Account Descriptions';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => acct_desc_, { nullable: true })
    async acct_desc(@Arg('ID', () => Int) ID: number, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<acct_desc_ | null> {
        this.CheckUserReadPermissions('Account Descriptions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [dese].[vwacct_descs] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Account Descriptions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Account Descriptions', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @Mutation(() => acct_desc_)
    async Createacct_desc(
        @Arg('input', () => Createacct_descInput) input: Createacct_descInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Account Descriptions', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => acct_desc_)
    async Updateacct_desc(
        @Arg('input', () => Updateacct_descInput) input: Updateacct_descInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Account Descriptions', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => acct_desc_)
    async Deleteacct_desc(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Account Descriptions', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Regions
//****************************************************************************
@ObjectType()
export class Regions_ {
    @Field(() => Int, {nullable: true}) 
    Primary_Key?: number;
        
    @Field(() => Int, {nullable: true}) 
    Region_Order?: number;
        
    @Field({nullable: true}) 
    @MaxLength(15)
    Region_Short?: string;
        
    @Field({nullable: true}) 
    @MaxLength(30)
    Region_Long?: string;
        
    @Field(() => Int) 
    ID: number;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Regions
//****************************************************************************
@InputType()
export class CreateRegionsInput {
    @Field(() => Int, { nullable: true })
    Primary_Key: number | null;

    @Field(() => Int, { nullable: true })
    Region_Order: number | null;

    @Field({ nullable: true })
    Region_Short: string | null;

    @Field({ nullable: true })
    Region_Long: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Regions
//****************************************************************************
@InputType()
export class UpdateRegionsInput {
    @Field(() => Int, { nullable: true })
    Primary_Key?: number | null;

    @Field(() => Int, { nullable: true })
    Region_Order?: number | null;

    @Field({ nullable: true })
    Region_Short?: string | null;

    @Field({ nullable: true })
    Region_Long?: string | null;

    @Field(() => Int)
    ID: number;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Regions
//****************************************************************************
@ObjectType()
export class RunRegionsViewResult {
    @Field(() => [Regions_])
    Results: Regions_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(Regions_)
export class RegionsResolver extends ResolverBase {
    @Query(() => RunRegionsViewResult)
    async RunRegionsViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunRegionsViewResult)
    async RunRegionsViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunRegionsViewResult)
    async RunRegionsDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Regions';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => Regions_, { nullable: true })
    async Regions(@Arg('ID', () => Int) ID: number, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Regions_ | null> {
        this.CheckUserReadPermissions('Regions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [dese].[vwRegions] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Regions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Regions', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @Mutation(() => Regions_)
    async CreateRegions(
        @Arg('input', () => CreateRegionsInput) input: CreateRegionsInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Regions', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => Regions_)
    async UpdateRegions(
        @Arg('input', () => UpdateRegionsInput) input: UpdateRegionsInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Regions', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => Regions_)
    async DeleteRegions(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Regions', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Core Data Codes
//****************************************************************************
@ObjectType()
export class core_data_codes_ {
    @Field({nullable: true}) 
    @MaxLength(2)
    poscod?: string;
        
    @Field({nullable: true}) 
    @MaxLength(30)
    pos_name?: string;
        
    @Field({nullable: true}) 
    @MaxLength(25)
    abbrev?: string;
        
    @Field(() => Int) 
    ID: number;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Core Data Codes
//****************************************************************************
@InputType()
export class Createcore_data_codesInput {
    @Field({ nullable: true })
    poscod: string | null;

    @Field({ nullable: true })
    pos_name: string | null;

    @Field({ nullable: true })
    abbrev: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Core Data Codes
//****************************************************************************
@InputType()
export class Updatecore_data_codesInput {
    @Field({ nullable: true })
    poscod?: string | null;

    @Field({ nullable: true })
    pos_name?: string | null;

    @Field({ nullable: true })
    abbrev?: string | null;

    @Field(() => Int)
    ID: number;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Core Data Codes
//****************************************************************************
@ObjectType()
export class Runcore_data_codesViewResult {
    @Field(() => [core_data_codes_])
    Results: core_data_codes_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(core_data_codes_)
export class core_data_codesResolver extends ResolverBase {
    @Query(() => Runcore_data_codesViewResult)
    async Runcore_data_codesViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => Runcore_data_codesViewResult)
    async Runcore_data_codesViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => Runcore_data_codesViewResult)
    async Runcore_data_codesDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Core Data Codes';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => core_data_codes_, { nullable: true })
    async core_data_codes(@Arg('ID', () => Int) ID: number, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<core_data_codes_ | null> {
        this.CheckUserReadPermissions('Core Data Codes', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [dese].[vwcore_data_codes] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Core Data Codes', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Core Data Codes', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @Mutation(() => core_data_codes_)
    async Createcore_data_codes(
        @Arg('input', () => Createcore_data_codesInput) input: Createcore_data_codesInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Core Data Codes', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => core_data_codes_)
    async Updatecore_data_codes(
        @Arg('input', () => Updatecore_data_codesInput) input: Updatecore_data_codesInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Core Data Codes', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => core_data_codes_)
    async Deletecore_data_codes(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Core Data Codes', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Educators
//****************************************************************************
@ObjectType()
export class educator_ {
    @Field({nullable: true}) 
    @MaxLength(100)
    edssn?: string;
        
    @Field({nullable: true}) 
    @MaxLength(20)
    year?: string;
        
    @Field({nullable: true}) 
    @MaxLength(20)
    co_dist_code?: string;
        
    @Field({nullable: true}) 
    @MaxLength(50)
    edlname?: string;
        
    @Field({nullable: true}) 
    @MaxLength(50)
    edfname?: string;
        
    @Field({nullable: true}) 
    @MaxLength(1)
    edminit?: string;
        
    @Field({nullable: true}) 
    @MaxLength(1)
    edsex?: string;
        
    @Field({nullable: true}) 
    @MaxLength(1)
    edrace?: string;
        
    @Field(() => Float, {nullable: true}) 
    edcondur?: number;
        
    @Field(() => Int, {nullable: true}) 
    edttsal?: number;
        
    @Field(() => Int, {nullable: true}) 
    edrtsal?: number;
        
    @Field(() => Int, {nullable: true}) 
    edecsal?: number;
        
    @Field(() => Int, {nullable: true}) 
    ededsal?: number;
        
    @Field(() => Int, {nullable: true}) 
    edminsal?: number;
        
    @Field({nullable: true}) 
    @MaxLength(1)
    carladr?: string;
        
    @Field({nullable: true}) 
    @MaxLength(4)
    edhidgre?: string;
        
    @Field(() => Int, {nullable: true}) 
    edyrexdi?: number;
        
    @Field(() => Int, {nullable: true}) 
    edyrexmo?: number;
        
    @Field(() => Int, {nullable: true}) 
    edyrexpb?: number;
        
    @Field({nullable: true}) 
    @MaxLength(4)
    latehire?: string;
        
    @Field({nullable: true}) 
    @MaxLength(4)
    erlyterm?: string;
        
    @Field(() => Int, {nullable: true}) 
    edttmin?: number;
        
    @Field(() => Float, {nullable: true}) 
    edttfte?: number;
        
    @Field({nullable: true}) 
    @MaxLength(1)
    edshared?: string;
        
    @Field({nullable: true}) 
    @MaxLength(1020)
    edcommt?: string;
        
    @Field({nullable: true}) 
    @MaxLength(1)
    edsusp?: string;
        
    @Field({nullable: true}) 
    @MaxLength(1)
    edsuspsu?: string;
        
    @Field({nullable: true}) 
    @MaxLength(1)
    edsuspsd?: string;
        
    @Field({nullable: true}) 
    @MaxLength(1)
    edsuspsf?: string;
        
    @Field({nullable: true}) 
    @MaxLength(1)
    edsusptr?: string;
        
    @Field({nullable: true}) 
    @MaxLength(1)
    edsuspvf?: string;
        
    @Field({nullable: true}) 
    @MaxLength(1)
    edsuspve?: string;
        
    @Field({nullable: true}) 
    @MaxLength(8)
    edladate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(4)
    edlauser?: string;
        
    @Field({nullable: true}) 
    @MaxLength(1)
    eddelete?: string;
        
    @Field({nullable: true}) 
    @MaxLength(6)
    edfiscal?: string;
        
    @Field(() => Int, {nullable: true}) 
    edcondms?: number;
        
    @Field({nullable: true}) 
    @MaxLength(1)
    edhqpdev?: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    edemail?: string;
        
    @Field(() => Int) 
    ID: number;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [Person_])
    Persons_EducatorIDArray: Person_[]; // Link to Persons
    
}

//****************************************************************************
// INPUT TYPE for Educators
//****************************************************************************
@InputType()
export class CreateeducatorInput {
    @Field({ nullable: true })
    edssn: string | null;

    @Field({ nullable: true })
    year: string | null;

    @Field({ nullable: true })
    co_dist_code: string | null;

    @Field({ nullable: true })
    edlname: string | null;

    @Field({ nullable: true })
    edfname: string | null;

    @Field({ nullable: true })
    edminit: string | null;

    @Field({ nullable: true })
    edsex: string | null;

    @Field({ nullable: true })
    edrace: string | null;

    @Field(() => Float, { nullable: true })
    edcondur: number | null;

    @Field(() => Int, { nullable: true })
    edttsal: number | null;

    @Field(() => Int, { nullable: true })
    edrtsal: number | null;

    @Field(() => Int, { nullable: true })
    edecsal: number | null;

    @Field(() => Int, { nullable: true })
    ededsal: number | null;

    @Field(() => Int, { nullable: true })
    edminsal: number | null;

    @Field({ nullable: true })
    carladr: string | null;

    @Field({ nullable: true })
    edhidgre: string | null;

    @Field(() => Int, { nullable: true })
    edyrexdi: number | null;

    @Field(() => Int, { nullable: true })
    edyrexmo: number | null;

    @Field(() => Int, { nullable: true })
    edyrexpb: number | null;

    @Field({ nullable: true })
    latehire: string | null;

    @Field({ nullable: true })
    erlyterm: string | null;

    @Field(() => Int, { nullable: true })
    edttmin: number | null;

    @Field(() => Float, { nullable: true })
    edttfte: number | null;

    @Field({ nullable: true })
    edshared: string | null;

    @Field({ nullable: true })
    edcommt: string | null;

    @Field({ nullable: true })
    edsusp: string | null;

    @Field({ nullable: true })
    edsuspsu: string | null;

    @Field({ nullable: true })
    edsuspsd: string | null;

    @Field({ nullable: true })
    edsuspsf: string | null;

    @Field({ nullable: true })
    edsusptr: string | null;

    @Field({ nullable: true })
    edsuspvf: string | null;

    @Field({ nullable: true })
    edsuspve: string | null;

    @Field({ nullable: true })
    edladate: Date | null;

    @Field({ nullable: true })
    edlauser: string | null;

    @Field({ nullable: true })
    eddelete: string | null;

    @Field({ nullable: true })
    edfiscal: string | null;

    @Field(() => Int, { nullable: true })
    edcondms: number | null;

    @Field({ nullable: true })
    edhqpdev: string | null;

    @Field({ nullable: true })
    edemail: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Educators
//****************************************************************************
@InputType()
export class UpdateeducatorInput {
    @Field({ nullable: true })
    edssn?: string | null;

    @Field({ nullable: true })
    year?: string | null;

    @Field({ nullable: true })
    co_dist_code?: string | null;

    @Field({ nullable: true })
    edlname?: string | null;

    @Field({ nullable: true })
    edfname?: string | null;

    @Field({ nullable: true })
    edminit?: string | null;

    @Field({ nullable: true })
    edsex?: string | null;

    @Field({ nullable: true })
    edrace?: string | null;

    @Field(() => Float, { nullable: true })
    edcondur?: number | null;

    @Field(() => Int, { nullable: true })
    edttsal?: number | null;

    @Field(() => Int, { nullable: true })
    edrtsal?: number | null;

    @Field(() => Int, { nullable: true })
    edecsal?: number | null;

    @Field(() => Int, { nullable: true })
    ededsal?: number | null;

    @Field(() => Int, { nullable: true })
    edminsal?: number | null;

    @Field({ nullable: true })
    carladr?: string | null;

    @Field({ nullable: true })
    edhidgre?: string | null;

    @Field(() => Int, { nullable: true })
    edyrexdi?: number | null;

    @Field(() => Int, { nullable: true })
    edyrexmo?: number | null;

    @Field(() => Int, { nullable: true })
    edyrexpb?: number | null;

    @Field({ nullable: true })
    latehire?: string | null;

    @Field({ nullable: true })
    erlyterm?: string | null;

    @Field(() => Int, { nullable: true })
    edttmin?: number | null;

    @Field(() => Float, { nullable: true })
    edttfte?: number | null;

    @Field({ nullable: true })
    edshared?: string | null;

    @Field({ nullable: true })
    edcommt?: string | null;

    @Field({ nullable: true })
    edsusp?: string | null;

    @Field({ nullable: true })
    edsuspsu?: string | null;

    @Field({ nullable: true })
    edsuspsd?: string | null;

    @Field({ nullable: true })
    edsuspsf?: string | null;

    @Field({ nullable: true })
    edsusptr?: string | null;

    @Field({ nullable: true })
    edsuspvf?: string | null;

    @Field({ nullable: true })
    edsuspve?: string | null;

    @Field({ nullable: true })
    edladate?: Date | null;

    @Field({ nullable: true })
    edlauser?: string | null;

    @Field({ nullable: true })
    eddelete?: string | null;

    @Field({ nullable: true })
    edfiscal?: string | null;

    @Field(() => Int, { nullable: true })
    edcondms?: number | null;

    @Field({ nullable: true })
    edhqpdev?: string | null;

    @Field({ nullable: true })
    edemail?: string | null;

    @Field(() => Int)
    ID: number;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Educators
//****************************************************************************
@ObjectType()
export class RuneducatorViewResult {
    @Field(() => [educator_])
    Results: educator_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(educator_)
export class educatorResolver extends ResolverBase {
    @Query(() => RuneducatorViewResult)
    async RuneducatorViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RuneducatorViewResult)
    async RuneducatorViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RuneducatorViewResult)
    async RuneducatorDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Educators';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => educator_, { nullable: true })
    async educator(@Arg('ID', () => Int) ID: number, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<educator_ | null> {
        this.CheckUserReadPermissions('Educators', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [dese].[vweducators] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Educators', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Educators', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @FieldResolver(() => [Person_])
    async Persons_EducatorIDArray(@Root() educator_: educator_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Persons', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [common].[vwPersons] WHERE [EducatorID]=${educator_.ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Persons', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.ArrayMapFieldNamesToCodeNames('Persons', rows);
        return result;
    }
        
    @Mutation(() => educator_)
    async Createeducator(
        @Arg('input', () => CreateeducatorInput) input: CreateeducatorInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Educators', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => educator_)
    async Updateeducator(
        @Arg('input', () => UpdateeducatorInput) input: UpdateeducatorInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Educators', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => educator_)
    async Deleteeducator(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Educators', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Core Datas
//****************************************************************************
@ObjectType()
export class Core_Data_ {
    @Field({nullable: true}) 
    @MaxLength(100)
    esssn?: string;
        
    @Field({nullable: true}) 
    @MaxLength(20)
    co_dist_code?: string;
        
    @Field({nullable: true}) 
    @MaxLength(20)
    year?: string;
        
    @Field({nullable: true}) 
    @MaxLength(30)
    pos_name?: string;
        
    @Field({nullable: true}) 
    @MaxLength(50)
    edlname?: string;
        
    @Field({nullable: true}) 
    @MaxLength(50)
    edfname?: string;
        
    @Field({nullable: true}) 
    @MaxLength(1)
    edminit?: string;
        
    @Field(() => Int, {nullable: true}) 
    edrtsal?: number;
        
    @Field(() => Float, {nullable: true}) 
    edttsal?: number;
        
    @Field(() => Float, {nullable: true}) 
    edsbfte?: number;
        
    @Field(() => Int, {nullable: true}) 
    edyrexdi?: number;
        
    @Field(() => Int, {nullable: true}) 
    edyrexmo?: number;
        
    @Field({nullable: true}) 
    @MaxLength(4)
    edhidgre?: string;
        
    @Field({nullable: true}) 
    @MaxLength(2)
    esposcod?: string;
        
    @Field({nullable: true}) 
    @MaxLength(12)
    esschool?: string;
        
    @Field(() => Int) 
    ID: number;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Core Datas
//****************************************************************************
@InputType()
export class CreateCore_DataInput {
    @Field({ nullable: true })
    esssn: string | null;

    @Field({ nullable: true })
    co_dist_code: string | null;

    @Field({ nullable: true })
    year: string | null;

    @Field({ nullable: true })
    pos_name: string | null;

    @Field({ nullable: true })
    edlname: string | null;

    @Field({ nullable: true })
    edfname: string | null;

    @Field({ nullable: true })
    edminit: string | null;

    @Field(() => Int, { nullable: true })
    edrtsal: number | null;

    @Field(() => Float, { nullable: true })
    edttsal: number | null;

    @Field(() => Float, { nullable: true })
    edsbfte: number | null;

    @Field(() => Int, { nullable: true })
    edyrexdi: number | null;

    @Field(() => Int, { nullable: true })
    edyrexmo: number | null;

    @Field({ nullable: true })
    edhidgre: string | null;

    @Field({ nullable: true })
    esposcod: string | null;

    @Field({ nullable: true })
    esschool: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Core Datas
//****************************************************************************
@InputType()
export class UpdateCore_DataInput {
    @Field({ nullable: true })
    esssn?: string | null;

    @Field({ nullable: true })
    co_dist_code?: string | null;

    @Field({ nullable: true })
    year?: string | null;

    @Field({ nullable: true })
    pos_name?: string | null;

    @Field({ nullable: true })
    edlname?: string | null;

    @Field({ nullable: true })
    edfname?: string | null;

    @Field({ nullable: true })
    edminit?: string | null;

    @Field(() => Int, { nullable: true })
    edrtsal?: number | null;

    @Field(() => Float, { nullable: true })
    edttsal?: number | null;

    @Field(() => Float, { nullable: true })
    edsbfte?: number | null;

    @Field(() => Int, { nullable: true })
    edyrexdi?: number | null;

    @Field(() => Int, { nullable: true })
    edyrexmo?: number | null;

    @Field({ nullable: true })
    edhidgre?: string | null;

    @Field({ nullable: true })
    esposcod?: string | null;

    @Field({ nullable: true })
    esschool?: string | null;

    @Field(() => Int)
    ID: number;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Core Datas
//****************************************************************************
@ObjectType()
export class RunCore_DataViewResult {
    @Field(() => [Core_Data_])
    Results: Core_Data_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(Core_Data_)
export class Core_DataResolver extends ResolverBase {
    @Query(() => RunCore_DataViewResult)
    async RunCore_DataViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunCore_DataViewResult)
    async RunCore_DataViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunCore_DataViewResult)
    async RunCore_DataDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Core Datas';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => Core_Data_, { nullable: true })
    async Core_Data(@Arg('ID', () => Int) ID: number, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Core_Data_ | null> {
        this.CheckUserReadPermissions('Core Datas', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [dese].[vwCore_Datas] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Core Datas', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Core Datas', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @Mutation(() => Core_Data_)
    async CreateCore_Data(
        @Arg('input', () => CreateCore_DataInput) input: CreateCore_DataInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Core Datas', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => Core_Data_)
    async UpdateCore_Data(
        @Arg('input', () => UpdateCore_DataInput) input: UpdateCore_DataInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Core Datas', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => Core_Data_)
    async DeleteCore_Data(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Core Datas', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Salary Ranking Tables
//****************************************************************************
@ObjectType()
export class Salary_Ranking_Table_ {
    @Field({nullable: true}) 
    @MaxLength(20)
    co_dist_code?: string;
        
    @Field({nullable: true}) 
    @MaxLength(20)
    year?: string;
        
    @Field({nullable: true}) 
    @MaxLength(10)
    co_dist_char?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    description?: string;
        
    @Field(() => Float, {nullable: true}) 
    supt_sal?: number;
        
    @Field(() => Float, {nullable: true}) 
    supt_sal_rank?: number;
        
    @Field(() => Float, {nullable: true}) 
    STATE_supt_sal?: number;
        
    @Field(() => Float, {nullable: true}) 
    supt_sal_all?: number;
        
    @Field(() => Float, {nullable: true}) 
    STATE_supt_sal_all?: number;
        
    @Field(() => Float, {nullable: true}) 
    admin_sal?: number;
        
    @Field(() => Float, {nullable: true}) 
    admin_sal_rank?: number;
        
    @Field(() => Float, {nullable: true}) 
    STATE_admin_sal?: number;
        
    @Field(() => Float, {nullable: true}) 
    tchr_sal?: number;
        
    @Field(() => Float, {nullable: true}) 
    tchr_sal_rank?: number;
        
    @Field(() => Float, {nullable: true}) 
    STATE_tchr_sal?: number;
        
    @Field(() => Int) 
    ID: number;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Salary Ranking Tables
//****************************************************************************
@InputType()
export class CreateSalary_Ranking_TableInput {
    @Field({ nullable: true })
    co_dist_code: string | null;

    @Field({ nullable: true })
    year: string | null;

    @Field({ nullable: true })
    co_dist_char: string | null;

    @Field({ nullable: true })
    description: string | null;

    @Field(() => Float, { nullable: true })
    supt_sal: number | null;

    @Field(() => Float, { nullable: true })
    supt_sal_rank: number | null;

    @Field(() => Float, { nullable: true })
    STATE_supt_sal: number | null;

    @Field(() => Float, { nullable: true })
    supt_sal_all: number | null;

    @Field(() => Float, { nullable: true })
    STATE_supt_sal_all: number | null;

    @Field(() => Float, { nullable: true })
    admin_sal: number | null;

    @Field(() => Float, { nullable: true })
    admin_sal_rank: number | null;

    @Field(() => Float, { nullable: true })
    STATE_admin_sal: number | null;

    @Field(() => Float, { nullable: true })
    tchr_sal: number | null;

    @Field(() => Float, { nullable: true })
    tchr_sal_rank: number | null;

    @Field(() => Float, { nullable: true })
    STATE_tchr_sal: number | null;
}
    

//****************************************************************************
// INPUT TYPE for Salary Ranking Tables
//****************************************************************************
@InputType()
export class UpdateSalary_Ranking_TableInput {
    @Field({ nullable: true })
    co_dist_code?: string | null;

    @Field({ nullable: true })
    year?: string | null;

    @Field({ nullable: true })
    co_dist_char?: string | null;

    @Field({ nullable: true })
    description?: string | null;

    @Field(() => Float, { nullable: true })
    supt_sal?: number | null;

    @Field(() => Float, { nullable: true })
    supt_sal_rank?: number | null;

    @Field(() => Float, { nullable: true })
    STATE_supt_sal?: number | null;

    @Field(() => Float, { nullable: true })
    supt_sal_all?: number | null;

    @Field(() => Float, { nullable: true })
    STATE_supt_sal_all?: number | null;

    @Field(() => Float, { nullable: true })
    admin_sal?: number | null;

    @Field(() => Float, { nullable: true })
    admin_sal_rank?: number | null;

    @Field(() => Float, { nullable: true })
    STATE_admin_sal?: number | null;

    @Field(() => Float, { nullable: true })
    tchr_sal?: number | null;

    @Field(() => Float, { nullable: true })
    tchr_sal_rank?: number | null;

    @Field(() => Float, { nullable: true })
    STATE_tchr_sal?: number | null;

    @Field(() => Int)
    ID: number;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Salary Ranking Tables
//****************************************************************************
@ObjectType()
export class RunSalary_Ranking_TableViewResult {
    @Field(() => [Salary_Ranking_Table_])
    Results: Salary_Ranking_Table_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(Salary_Ranking_Table_)
export class Salary_Ranking_TableResolver extends ResolverBase {
    @Query(() => RunSalary_Ranking_TableViewResult)
    async RunSalary_Ranking_TableViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunSalary_Ranking_TableViewResult)
    async RunSalary_Ranking_TableViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunSalary_Ranking_TableViewResult)
    async RunSalary_Ranking_TableDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Salary Ranking Tables';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => Salary_Ranking_Table_, { nullable: true })
    async Salary_Ranking_Table(@Arg('ID', () => Int) ID: number, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Salary_Ranking_Table_ | null> {
        this.CheckUserReadPermissions('Salary Ranking Tables', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [dese].[vwSalary_Ranking_Tables] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Salary Ranking Tables', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Salary Ranking Tables', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @Mutation(() => Salary_Ranking_Table_)
    async CreateSalary_Ranking_Table(
        @Arg('input', () => CreateSalary_Ranking_TableInput) input: CreateSalary_Ranking_TableInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Salary Ranking Tables', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => Salary_Ranking_Table_)
    async UpdateSalary_Ranking_Table(
        @Arg('input', () => UpdateSalary_Ranking_TableInput) input: UpdateSalary_Ranking_TableInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Salary Ranking Tables', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => Salary_Ranking_Table_)
    async DeleteSalary_Ranking_Table(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Salary Ranking Tables', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for County District Codes
//****************************************************************************
@ObjectType()
export class co_dist_desc_ {
    @Field({nullable: true}) 
    @MaxLength(20)
    co_dist_code?: string;
        
    @Field({nullable: true}) 
    @MaxLength(80)
    description?: string;
        
    @Field({nullable: true}) 
    @MaxLength(6)
    co_dist_char?: string;
        
    @Field({nullable: true}) 
    @MaxLength(75)
    Street?: string;
        
    @Field({nullable: true}) 
    @MaxLength(75)
    Mail?: string;
        
    @Field({nullable: true}) 
    @MaxLength(75)
    City?: string;
        
    @Field({nullable: true}) 
    @MaxLength(75)
    State?: string;
        
    @Field({nullable: true}) 
    @MaxLength(75)
    Zip?: string;
        
    @Field({nullable: true}) 
    @MaxLength(25)
    Phone?: string;
        
    @Field({nullable: true}) 
    @MaxLength(25)
    Fax?: string;
        
    @Field({nullable: true}) 
    @MaxLength(75)
    Region?: string;
        
    @Field({nullable: true}) 
    @MaxLength(75)
    Sal_Region?: string;
        
    @Field({nullable: true}) 
    @MaxLength(75)
    Sal_Region_BAK?: string;
        
    @Field({nullable: true}) 
    @MaxLength(75)
    Field_Area?: string;
        
    @Field({nullable: true}) 
    @MaxLength(75)
    County?: string;
        
    @Field(() => Int, {nullable: true}) 
    enabledthru?: number;
        
    @Field(() => Int) 
    ID: number;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [Organization_])
    Organizations_DistrictIDArray: Organization_[]; // Link to Organizations
    
}

//****************************************************************************
// INPUT TYPE for County District Codes
//****************************************************************************
@InputType()
export class Createco_dist_descInput {
    @Field({ nullable: true })
    co_dist_code: string | null;

    @Field({ nullable: true })
    description: string | null;

    @Field({ nullable: true })
    co_dist_char: string | null;

    @Field({ nullable: true })
    Street: string | null;

    @Field({ nullable: true })
    Mail: string | null;

    @Field({ nullable: true })
    City: string | null;

    @Field({ nullable: true })
    State: string | null;

    @Field({ nullable: true })
    Zip: string | null;

    @Field({ nullable: true })
    Phone: string | null;

    @Field({ nullable: true })
    Fax: string | null;

    @Field({ nullable: true })
    Region: string | null;

    @Field({ nullable: true })
    Sal_Region: string | null;

    @Field({ nullable: true })
    Sal_Region_BAK: string | null;

    @Field({ nullable: true })
    Field_Area: string | null;

    @Field({ nullable: true })
    County: string | null;

    @Field(() => Int, { nullable: true })
    enabledthru: number | null;
}
    

//****************************************************************************
// INPUT TYPE for County District Codes
//****************************************************************************
@InputType()
export class Updateco_dist_descInput {
    @Field({ nullable: true })
    co_dist_code?: string | null;

    @Field({ nullable: true })
    description?: string | null;

    @Field({ nullable: true })
    co_dist_char?: string | null;

    @Field({ nullable: true })
    Street?: string | null;

    @Field({ nullable: true })
    Mail?: string | null;

    @Field({ nullable: true })
    City?: string | null;

    @Field({ nullable: true })
    State?: string | null;

    @Field({ nullable: true })
    Zip?: string | null;

    @Field({ nullable: true })
    Phone?: string | null;

    @Field({ nullable: true })
    Fax?: string | null;

    @Field({ nullable: true })
    Region?: string | null;

    @Field({ nullable: true })
    Sal_Region?: string | null;

    @Field({ nullable: true })
    Sal_Region_BAK?: string | null;

    @Field({ nullable: true })
    Field_Area?: string | null;

    @Field({ nullable: true })
    County?: string | null;

    @Field(() => Int, { nullable: true })
    enabledthru?: number | null;

    @Field(() => Int)
    ID: number;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for County District Codes
//****************************************************************************
@ObjectType()
export class Runco_dist_descViewResult {
    @Field(() => [co_dist_desc_])
    Results: co_dist_desc_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(co_dist_desc_)
export class co_dist_descResolver extends ResolverBase {
    @Query(() => Runco_dist_descViewResult)
    async Runco_dist_descViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => Runco_dist_descViewResult)
    async Runco_dist_descViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => Runco_dist_descViewResult)
    async Runco_dist_descDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'County District Codes';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => co_dist_desc_, { nullable: true })
    async co_dist_desc(@Arg('ID', () => Int) ID: number, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<co_dist_desc_ | null> {
        this.CheckUserReadPermissions('County District Codes', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [dese].[vwco_dist_descs] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause(provider, 'County District Codes', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('County District Codes', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @FieldResolver(() => [Organization_])
    async Organizations_DistrictIDArray(@Root() co_dist_desc_: co_dist_desc_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Organizations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [common].[vwOrganizations] WHERE [DistrictID]=${co_dist_desc_.ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Organizations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.ArrayMapFieldNamesToCodeNames('Organizations', rows);
        return result;
    }
        
    @Mutation(() => co_dist_desc_)
    async Createco_dist_desc(
        @Arg('input', () => Createco_dist_descInput) input: Createco_dist_descInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('County District Codes', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => co_dist_desc_)
    async Updateco_dist_desc(
        @Arg('input', () => Updateco_dist_descInput) input: Updateco_dist_descInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('County District Codes', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => co_dist_desc_)
    async Deleteco_dist_desc(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('County District Codes', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Enrolments
//****************************************************************************
@ObjectType()
export class Table_5_ {
    @Field({nullable: true}) 
    @MaxLength(12)
    District?: string;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    District_Name?: string;
        
    @Field(() => Float, {nullable: true}) 
    Enrollment?: number;
        
    @Field(() => Int) 
    ID: number;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Enrolments
//****************************************************************************
@InputType()
export class CreateTable_5Input {
    @Field({ nullable: true })
    District: string | null;

    @Field({ nullable: true })
    District_Name: string | null;

    @Field(() => Float, { nullable: true })
    Enrollment: number | null;
}
    

//****************************************************************************
// INPUT TYPE for Enrolments
//****************************************************************************
@InputType()
export class UpdateTable_5Input {
    @Field({ nullable: true })
    District?: string | null;

    @Field({ nullable: true })
    District_Name?: string | null;

    @Field(() => Float, { nullable: true })
    Enrollment?: number | null;

    @Field(() => Int)
    ID: number;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Enrolments
//****************************************************************************
@ObjectType()
export class RunTable_5ViewResult {
    @Field(() => [Table_5_])
    Results: Table_5_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(Table_5_)
export class Table_5Resolver extends ResolverBase {
    @Query(() => RunTable_5ViewResult)
    async RunTable_5ViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunTable_5ViewResult)
    async RunTable_5ViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunTable_5ViewResult)
    async RunTable_5DynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Enrolments';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => Table_5_, { nullable: true })
    async Table_5(@Arg('ID', () => Int) ID: number, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Table_5_ | null> {
        this.CheckUserReadPermissions('Enrolments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [dese].[vwTable_5s] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Enrolments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Enrolments', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @Mutation(() => Table_5_)
    async CreateTable_5(
        @Arg('input', () => CreateTable_5Input) input: CreateTable_5Input,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Enrolments', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => Table_5_)
    async UpdateTable_5(
        @Arg('input', () => UpdateTable_5Input) input: UpdateTable_5Input,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Enrolments', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => Table_5_)
    async DeleteTable_5(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Enrolments', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Schools
//****************************************************************************
@ObjectType()
export class edschool_ {
    @Field({nullable: true}) 
    @MaxLength(100)
    esssn?: string;
        
    @Field({nullable: true}) 
    @MaxLength(20)
    co_dist_code?: string;
        
    @Field({nullable: true}) 
    @MaxLength(12)
    esschool?: string;
        
    @Field({nullable: true}) 
    @MaxLength(2)
    esposcod?: string;
        
    @Field({nullable: true}) 
    @MaxLength(20)
    year?: string;
        
    @Field({nullable: true}) 
    @MaxLength(4)
    progtyp?: string;
        
    @Field(() => Int, {nullable: true}) 
    linenum?: number;
        
    @Field(() => Float, {nullable: true}) 
    edsbfte?: number;
        
    @Field(() => Int, {nullable: true}) 
    asalary?: number;
        
    @Field(() => Int, {nullable: true}) 
    monspos?: number;
        
    @Field({nullable: true}) 
    @MaxLength(1)
    avtcode?: string;
        
    @Field(() => Int, {nullable: true}) 
    srcecode?: number;
        
    @Field({nullable: true}) 
    @MaxLength(1)
    voctime1?: string;
        
    @Field({nullable: true}) 
    @MaxLength(1)
    voctime2?: string;
        
    @Field(() => Int, {nullable: true}) 
    vreimba?: number;
        
    @Field(() => Int, {nullable: true}) 
    edsbmins?: number;
        
    @Field(() => Int, {nullable: true}) 
    edprpos?: number;
        
    @Field({nullable: true}) 
    @MaxLength(70)
    cacommt?: string;
        
    @Field({nullable: true}) 
    @MaxLength(1)
    essusp?: string;
        
    @Field({nullable: true}) 
    @MaxLength(1)
    essuspsu?: string;
        
    @Field({nullable: true}) 
    @MaxLength(1)
    essuspsd?: string;
        
    @Field({nullable: true}) 
    @MaxLength(1)
    essuspsf?: string;
        
    @Field({nullable: true}) 
    @MaxLength(1)
    essusptr?: string;
        
    @Field({nullable: true}) 
    @MaxLength(1)
    essuspvf?: string;
        
    @Field({nullable: true}) 
    @MaxLength(1)
    essuspve?: string;
        
    @Field({nullable: true}) 
    @MaxLength(8)
    esladate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(4)
    eslauser?: string;
        
    @Field({nullable: true}) 
    @MaxLength(1)
    esdelete?: string;
        
    @Field({nullable: true}) 
    @MaxLength(8)
    eslsdate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(8)
    eseedate?: Date;
        
    @Field(() => Int) 
    ID: number;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [Organization_])
    Organizations_EdSchoolIDArray: Organization_[]; // Link to Organizations
    
}

//****************************************************************************
// INPUT TYPE for Schools
//****************************************************************************
@InputType()
export class CreateedschoolInput {
    @Field({ nullable: true })
    esssn: string | null;

    @Field({ nullable: true })
    co_dist_code: string | null;

    @Field({ nullable: true })
    esschool: string | null;

    @Field({ nullable: true })
    esposcod: string | null;

    @Field({ nullable: true })
    year: string | null;

    @Field({ nullable: true })
    progtyp: string | null;

    @Field(() => Int, { nullable: true })
    linenum: number | null;

    @Field(() => Float, { nullable: true })
    edsbfte: number | null;

    @Field(() => Int, { nullable: true })
    asalary: number | null;

    @Field(() => Int, { nullable: true })
    monspos: number | null;

    @Field({ nullable: true })
    avtcode: string | null;

    @Field(() => Int, { nullable: true })
    srcecode: number | null;

    @Field({ nullable: true })
    voctime1: string | null;

    @Field({ nullable: true })
    voctime2: string | null;

    @Field(() => Int, { nullable: true })
    vreimba: number | null;

    @Field(() => Int, { nullable: true })
    edsbmins: number | null;

    @Field(() => Int, { nullable: true })
    edprpos: number | null;

    @Field({ nullable: true })
    cacommt: string | null;

    @Field({ nullable: true })
    essusp: string | null;

    @Field({ nullable: true })
    essuspsu: string | null;

    @Field({ nullable: true })
    essuspsd: string | null;

    @Field({ nullable: true })
    essuspsf: string | null;

    @Field({ nullable: true })
    essusptr: string | null;

    @Field({ nullable: true })
    essuspvf: string | null;

    @Field({ nullable: true })
    essuspve: string | null;

    @Field({ nullable: true })
    esladate: Date | null;

    @Field({ nullable: true })
    eslauser: string | null;

    @Field({ nullable: true })
    esdelete: string | null;

    @Field({ nullable: true })
    eslsdate: Date | null;

    @Field({ nullable: true })
    eseedate: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Schools
//****************************************************************************
@InputType()
export class UpdateedschoolInput {
    @Field({ nullable: true })
    esssn?: string | null;

    @Field({ nullable: true })
    co_dist_code?: string | null;

    @Field({ nullable: true })
    esschool?: string | null;

    @Field({ nullable: true })
    esposcod?: string | null;

    @Field({ nullable: true })
    year?: string | null;

    @Field({ nullable: true })
    progtyp?: string | null;

    @Field(() => Int, { nullable: true })
    linenum?: number | null;

    @Field(() => Float, { nullable: true })
    edsbfte?: number | null;

    @Field(() => Int, { nullable: true })
    asalary?: number | null;

    @Field(() => Int, { nullable: true })
    monspos?: number | null;

    @Field({ nullable: true })
    avtcode?: string | null;

    @Field(() => Int, { nullable: true })
    srcecode?: number | null;

    @Field({ nullable: true })
    voctime1?: string | null;

    @Field({ nullable: true })
    voctime2?: string | null;

    @Field(() => Int, { nullable: true })
    vreimba?: number | null;

    @Field(() => Int, { nullable: true })
    edsbmins?: number | null;

    @Field(() => Int, { nullable: true })
    edprpos?: number | null;

    @Field({ nullable: true })
    cacommt?: string | null;

    @Field({ nullable: true })
    essusp?: string | null;

    @Field({ nullable: true })
    essuspsu?: string | null;

    @Field({ nullable: true })
    essuspsd?: string | null;

    @Field({ nullable: true })
    essuspsf?: string | null;

    @Field({ nullable: true })
    essusptr?: string | null;

    @Field({ nullable: true })
    essuspvf?: string | null;

    @Field({ nullable: true })
    essuspve?: string | null;

    @Field({ nullable: true })
    esladate?: Date | null;

    @Field({ nullable: true })
    eslauser?: string | null;

    @Field({ nullable: true })
    esdelete?: string | null;

    @Field({ nullable: true })
    eslsdate?: Date | null;

    @Field({ nullable: true })
    eseedate?: Date | null;

    @Field(() => Int)
    ID: number;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Schools
//****************************************************************************
@ObjectType()
export class RunedschoolViewResult {
    @Field(() => [edschool_])
    Results: edschool_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(edschool_)
export class edschoolResolver extends ResolverBase {
    @Query(() => RunedschoolViewResult)
    async RunedschoolViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunedschoolViewResult)
    async RunedschoolViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunedschoolViewResult)
    async RunedschoolDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Schools';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => edschool_, { nullable: true })
    async edschool(@Arg('ID', () => Int) ID: number, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<edschool_ | null> {
        this.CheckUserReadPermissions('Schools', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [dese].[vwedschools] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Schools', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Schools', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @FieldResolver(() => [Organization_])
    async Organizations_EdSchoolIDArray(@Root() edschool_: edschool_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Organizations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [common].[vwOrganizations] WHERE [EdSchoolID]=${edschool_.ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Organizations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.ArrayMapFieldNamesToCodeNames('Organizations', rows);
        return result;
    }
        
    @Mutation(() => edschool_)
    async Createedschool(
        @Arg('input', () => CreateedschoolInput) input: CreateedschoolInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Schools', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => edschool_)
    async Updateedschool(
        @Arg('input', () => UpdateedschoolInput) input: UpdateedschoolInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Schools', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => edschool_)
    async Deleteedschool(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Schools', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Course Descriptions
//****************************************************************************
@ObjectType()
export class crsassgn_ {
    @Field({nullable: true}) 
    @MaxLength(100)
    cassn?: string;
        
    @Field({nullable: true}) 
    @MaxLength(6)
    cactydis?: string;
        
    @Field({nullable: true}) 
    @MaxLength(4)
    caschool?: string;
        
    @Field({nullable: true}) 
    @MaxLength(2)
    caposcod?: string;
        
    @Field({nullable: true}) 
    @MaxLength(8)
    cayear?: string;
        
    @Field({nullable: true}) 
    @MaxLength(4)
    caprogtp?: string;
        
    @Field(() => Int, {nullable: true}) 
    calineno?: number;
        
    @Field({nullable: true}) 
    @MaxLength(2)
    caasgnno?: string;
        
    @Field({nullable: true}) 
    @MaxLength(6)
    csnum?: string;
        
    @Field(() => Int, {nullable: true}) 
    crsseq?: number;
        
    @Field({nullable: true}) 
    @MaxLength(2)
    crsgrade?: string;
        
    @Field(() => Int, {nullable: true}) 
    semester?: number;
        
    @Field({nullable: true}) 
    @MaxLength(2)
    pgmcode?: string;
        
    @Field({nullable: true}) 
    @MaxLength(2)
    delivsys?: string;
        
    @Field(() => Int, {nullable: true}) 
    crsmin?: number;
        
    @Field(() => Int, {nullable: true}) 
    cacredit?: number;
        
    @Field(() => Int, {nullable: true}) 
    enroll?: number;
        
    @Field(() => Int, {nullable: true}) 
    stumale?: number;
        
    @Field(() => Int, {nullable: true}) 
    stufml?: number;
        
    @Field(() => Int, {nullable: true}) 
    stublk?: number;
        
    @Field(() => Int, {nullable: true}) 
    stuwhit?: number;
        
    @Field(() => Int, {nullable: true}) 
    stuhsp?: number;
        
    @Field(() => Int, {nullable: true}) 
    stuasn?: number;
        
    @Field(() => Int, {nullable: true}) 
    stuind?: number;
        
    @Field(() => Int, {nullable: true}) 
    stuhan?: number;
        
    @Field(() => Int, {nullable: true}) 
    studis?: number;
        
    @Field(() => Int, {nullable: true}) 
    stuexit?: number;
        
    @Field(() => Int, {nullable: true}) 
    stuadlt?: number;
        
    @Field({nullable: true}) 
    @MaxLength(1)
    casusp?: string;
        
    @Field({nullable: true}) 
    @MaxLength(1)
    casuspsu?: string;
        
    @Field({nullable: true}) 
    @MaxLength(1)
    casuspsd?: string;
        
    @Field({nullable: true}) 
    @MaxLength(1)
    casuspsf?: string;
        
    @Field({nullable: true}) 
    @MaxLength(1)
    casusptr?: string;
        
    @Field({nullable: true}) 
    @MaxLength(1)
    casuspvf?: string;
        
    @Field({nullable: true}) 
    @MaxLength(1)
    casuspve?: string;
        
    @Field({nullable: true}) 
    @MaxLength(8)
    caladate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(4)
    calauser?: string;
        
    @Field({nullable: true}) 
    @MaxLength(1)
    cadelete?: string;
        
    @Field({nullable: true}) 
    @MaxLength(8)
    castdate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(8)
    caendate?: Date;
        
    @Field(() => Int, {nullable: true}) 
    caclsid?: number;
        
    @Field(() => Int, {nullable: true}) 
    caaide?: number;
        
    @Field({nullable: true}) 
    @MaxLength(1)
    cacertid?: string;
        
    @Field({nullable: true}) 
    @MaxLength(8)
    caeffect?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(8)
    caexp?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(1)
    casuspse?: string;
        
    @Field({nullable: true}) 
    @MaxLength(3)
    combined_classes?: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    comment?: string;
        
    @Field(() => Int) 
    ID: number;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Course Descriptions
//****************************************************************************
@InputType()
export class CreatecrsassgnInput {
    @Field({ nullable: true })
    cassn: string | null;

    @Field({ nullable: true })
    cactydis: string | null;

    @Field({ nullable: true })
    caschool: string | null;

    @Field({ nullable: true })
    caposcod: string | null;

    @Field({ nullable: true })
    cayear: string | null;

    @Field({ nullable: true })
    caprogtp: string | null;

    @Field(() => Int, { nullable: true })
    calineno: number | null;

    @Field({ nullable: true })
    caasgnno: string | null;

    @Field({ nullable: true })
    csnum: string | null;

    @Field(() => Int, { nullable: true })
    crsseq: number | null;

    @Field({ nullable: true })
    crsgrade: string | null;

    @Field(() => Int, { nullable: true })
    semester: number | null;

    @Field({ nullable: true })
    pgmcode: string | null;

    @Field({ nullable: true })
    delivsys: string | null;

    @Field(() => Int, { nullable: true })
    crsmin: number | null;

    @Field(() => Int, { nullable: true })
    cacredit: number | null;

    @Field(() => Int, { nullable: true })
    enroll: number | null;

    @Field(() => Int, { nullable: true })
    stumale: number | null;

    @Field(() => Int, { nullable: true })
    stufml: number | null;

    @Field(() => Int, { nullable: true })
    stublk: number | null;

    @Field(() => Int, { nullable: true })
    stuwhit: number | null;

    @Field(() => Int, { nullable: true })
    stuhsp: number | null;

    @Field(() => Int, { nullable: true })
    stuasn: number | null;

    @Field(() => Int, { nullable: true })
    stuind: number | null;

    @Field(() => Int, { nullable: true })
    stuhan: number | null;

    @Field(() => Int, { nullable: true })
    studis: number | null;

    @Field(() => Int, { nullable: true })
    stuexit: number | null;

    @Field(() => Int, { nullable: true })
    stuadlt: number | null;

    @Field({ nullable: true })
    casusp: string | null;

    @Field({ nullable: true })
    casuspsu: string | null;

    @Field({ nullable: true })
    casuspsd: string | null;

    @Field({ nullable: true })
    casuspsf: string | null;

    @Field({ nullable: true })
    casusptr: string | null;

    @Field({ nullable: true })
    casuspvf: string | null;

    @Field({ nullable: true })
    casuspve: string | null;

    @Field({ nullable: true })
    caladate: Date | null;

    @Field({ nullable: true })
    calauser: string | null;

    @Field({ nullable: true })
    cadelete: string | null;

    @Field({ nullable: true })
    castdate: Date | null;

    @Field({ nullable: true })
    caendate: Date | null;

    @Field(() => Int, { nullable: true })
    caclsid: number | null;

    @Field(() => Int, { nullable: true })
    caaide: number | null;

    @Field({ nullable: true })
    cacertid: string | null;

    @Field({ nullable: true })
    caeffect: Date | null;

    @Field({ nullable: true })
    caexp: Date | null;

    @Field({ nullable: true })
    casuspse: string | null;

    @Field({ nullable: true })
    combined_classes: string | null;

    @Field({ nullable: true })
    comment: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Course Descriptions
//****************************************************************************
@InputType()
export class UpdatecrsassgnInput {
    @Field({ nullable: true })
    cassn?: string | null;

    @Field({ nullable: true })
    cactydis?: string | null;

    @Field({ nullable: true })
    caschool?: string | null;

    @Field({ nullable: true })
    caposcod?: string | null;

    @Field({ nullable: true })
    cayear?: string | null;

    @Field({ nullable: true })
    caprogtp?: string | null;

    @Field(() => Int, { nullable: true })
    calineno?: number | null;

    @Field({ nullable: true })
    caasgnno?: string | null;

    @Field({ nullable: true })
    csnum?: string | null;

    @Field(() => Int, { nullable: true })
    crsseq?: number | null;

    @Field({ nullable: true })
    crsgrade?: string | null;

    @Field(() => Int, { nullable: true })
    semester?: number | null;

    @Field({ nullable: true })
    pgmcode?: string | null;

    @Field({ nullable: true })
    delivsys?: string | null;

    @Field(() => Int, { nullable: true })
    crsmin?: number | null;

    @Field(() => Int, { nullable: true })
    cacredit?: number | null;

    @Field(() => Int, { nullable: true })
    enroll?: number | null;

    @Field(() => Int, { nullable: true })
    stumale?: number | null;

    @Field(() => Int, { nullable: true })
    stufml?: number | null;

    @Field(() => Int, { nullable: true })
    stublk?: number | null;

    @Field(() => Int, { nullable: true })
    stuwhit?: number | null;

    @Field(() => Int, { nullable: true })
    stuhsp?: number | null;

    @Field(() => Int, { nullable: true })
    stuasn?: number | null;

    @Field(() => Int, { nullable: true })
    stuind?: number | null;

    @Field(() => Int, { nullable: true })
    stuhan?: number | null;

    @Field(() => Int, { nullable: true })
    studis?: number | null;

    @Field(() => Int, { nullable: true })
    stuexit?: number | null;

    @Field(() => Int, { nullable: true })
    stuadlt?: number | null;

    @Field({ nullable: true })
    casusp?: string | null;

    @Field({ nullable: true })
    casuspsu?: string | null;

    @Field({ nullable: true })
    casuspsd?: string | null;

    @Field({ nullable: true })
    casuspsf?: string | null;

    @Field({ nullable: true })
    casusptr?: string | null;

    @Field({ nullable: true })
    casuspvf?: string | null;

    @Field({ nullable: true })
    casuspve?: string | null;

    @Field({ nullable: true })
    caladate?: Date | null;

    @Field({ nullable: true })
    calauser?: string | null;

    @Field({ nullable: true })
    cadelete?: string | null;

    @Field({ nullable: true })
    castdate?: Date | null;

    @Field({ nullable: true })
    caendate?: Date | null;

    @Field(() => Int, { nullable: true })
    caclsid?: number | null;

    @Field(() => Int, { nullable: true })
    caaide?: number | null;

    @Field({ nullable: true })
    cacertid?: string | null;

    @Field({ nullable: true })
    caeffect?: Date | null;

    @Field({ nullable: true })
    caexp?: Date | null;

    @Field({ nullable: true })
    casuspse?: string | null;

    @Field({ nullable: true })
    combined_classes?: string | null;

    @Field({ nullable: true })
    comment?: string | null;

    @Field(() => Int)
    ID: number;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Course Descriptions
//****************************************************************************
@ObjectType()
export class RuncrsassgnViewResult {
    @Field(() => [crsassgn_])
    Results: crsassgn_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(crsassgn_)
export class crsassgnResolver extends ResolverBase {
    @Query(() => RuncrsassgnViewResult)
    async RuncrsassgnViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RuncrsassgnViewResult)
    async RuncrsassgnViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RuncrsassgnViewResult)
    async RuncrsassgnDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Course Descriptions';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => crsassgn_, { nullable: true })
    async crsassgn(@Arg('ID', () => Int) ID: number, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<crsassgn_ | null> {
        this.CheckUserReadPermissions('Course Descriptions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [dese].[vwcrsassgns] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Course Descriptions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Course Descriptions', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @Mutation(() => crsassgn_)
    async Createcrsassgn(
        @Arg('input', () => CreatecrsassgnInput) input: CreatecrsassgnInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Course Descriptions', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => crsassgn_)
    async Updatecrsassgn(
        @Arg('input', () => UpdatecrsassgnInput) input: UpdatecrsassgnInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Course Descriptions', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => crsassgn_)
    async Deletecrsassgn(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Course Descriptions', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Conversation Details__betty
//****************************************************************************
@ObjectType()
export class ConversationDetail__betty_ {
    @Field(() => Int) 
    ID: number;
        
    @Field(() => Int) 
    ConversationID: number;
        
    @Field() 
    Input: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    InputEmbeddingID?: string;
        
    @Field({nullable: true}) 
    Output?: string;
        
    @Field({nullable: true}) 
    Error?: string;
        
    @Field() 
    @MaxLength(8)
    DateCreated: Date;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    SourceIP?: string;
        
    @Field() 
    @MaxLength(8)
    mj_CreatedAt: Date;
        
    @Field() 
    @MaxLength(8)
    mj_UpdatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Conversation Details__betty
//****************************************************************************
@InputType()
export class CreateConversationDetail__bettyInput {
    @Field(() => Int, { nullable: true })
    ID?: number;

    @Field(() => Int, { nullable: true })
    ConversationID?: number;

    @Field({ nullable: true })
    Input?: string;

    @Field({ nullable: true })
    InputEmbeddingID: string | null;

    @Field({ nullable: true })
    Output: string | null;

    @Field({ nullable: true })
    Error: string | null;

    @Field({ nullable: true })
    DateCreated?: Date;

    @Field({ nullable: true })
    SourceIP: string | null;

    @Field({ nullable: true })
    mj_CreatedAt?: Date;

    @Field({ nullable: true })
    mj_UpdatedAt?: Date;
}
    

//****************************************************************************
// INPUT TYPE for Conversation Details__betty
//****************************************************************************
@InputType()
export class UpdateConversationDetail__bettyInput {
    @Field(() => Int)
    ID: number;

    @Field(() => Int, { nullable: true })
    ConversationID?: number;

    @Field({ nullable: true })
    Input?: string;

    @Field({ nullable: true })
    InputEmbeddingID?: string | null;

    @Field({ nullable: true })
    Output?: string | null;

    @Field({ nullable: true })
    Error?: string | null;

    @Field({ nullable: true })
    DateCreated?: Date;

    @Field({ nullable: true })
    SourceIP?: string | null;

    @Field({ nullable: true })
    mj_CreatedAt?: Date;

    @Field({ nullable: true })
    mj_UpdatedAt?: Date;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Conversation Details__betty
//****************************************************************************
@ObjectType()
export class RunConversationDetail__bettyViewResult {
    @Field(() => [ConversationDetail__betty_])
    Results: ConversationDetail__betty_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(ConversationDetail__betty_)
export class ConversationDetail__bettyResolver extends ResolverBase {
    @Query(() => RunConversationDetail__bettyViewResult)
    async RunConversationDetail__bettyViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunConversationDetail__bettyViewResult)
    async RunConversationDetail__bettyViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunConversationDetail__bettyViewResult)
    async RunConversationDetail__bettyDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Conversation Details__betty';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => ConversationDetail__betty_, { nullable: true })
    async ConversationDetail__betty(@Arg('ID', () => Int) ID: number, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<ConversationDetail__betty_ | null> {
        this.CheckUserReadPermissions('Conversation Details__betty', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [betty].[vwConversationDetails__betty] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Conversation Details__betty', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Conversation Details__betty', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @Mutation(() => ConversationDetail__betty_)
    async CreateConversationDetail__betty(
        @Arg('input', () => CreateConversationDetail__bettyInput) input: CreateConversationDetail__bettyInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Conversation Details__betty', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => ConversationDetail__betty_)
    async UpdateConversationDetail__betty(
        @Arg('input', () => UpdateConversationDetail__bettyInput) input: UpdateConversationDetail__bettyInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Conversation Details__betty', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => ConversationDetail__betty_)
    async DeleteConversationDetail__betty(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Conversation Details__betty', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Conversation Detail Contents
//****************************************************************************
@ObjectType()
export class ConversationDetailContent_ {
    @Field(() => Int) 
    ID: number;
        
    @Field(() => Int) 
    ConversationDetailID: number;
        
    @Field(() => Int) 
    ContentID: number;
        
    @Field(() => Float) 
    Score: number;
        
    @Field() 
    @MaxLength(8)
    mj_CreatedAt: Date;
        
    @Field() 
    @MaxLength(8)
    mj_UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Title?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    UserLink?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Conversation Detail Contents
//****************************************************************************
@InputType()
export class CreateConversationDetailContentInput {
    @Field(() => Int, { nullable: true })
    ID?: number;

    @Field(() => Int, { nullable: true })
    ConversationDetailID?: number;

    @Field(() => Int, { nullable: true })
    ContentID?: number;

    @Field(() => Float, { nullable: true })
    Score?: number;

    @Field({ nullable: true })
    mj_CreatedAt?: Date;

    @Field({ nullable: true })
    mj_UpdatedAt?: Date;

    @Field({ nullable: true })
    Title: string | null;

    @Field({ nullable: true })
    UserLink: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Conversation Detail Contents
//****************************************************************************
@InputType()
export class UpdateConversationDetailContentInput {
    @Field(() => Int)
    ID: number;

    @Field(() => Int, { nullable: true })
    ConversationDetailID?: number;

    @Field(() => Int, { nullable: true })
    ContentID?: number;

    @Field(() => Float, { nullable: true })
    Score?: number;

    @Field({ nullable: true })
    mj_CreatedAt?: Date;

    @Field({ nullable: true })
    mj_UpdatedAt?: Date;

    @Field({ nullable: true })
    Title?: string | null;

    @Field({ nullable: true })
    UserLink?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Conversation Detail Contents
//****************************************************************************
@ObjectType()
export class RunConversationDetailContentViewResult {
    @Field(() => [ConversationDetailContent_])
    Results: ConversationDetailContent_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(ConversationDetailContent_)
export class ConversationDetailContentResolver extends ResolverBase {
    @Query(() => RunConversationDetailContentViewResult)
    async RunConversationDetailContentViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunConversationDetailContentViewResult)
    async RunConversationDetailContentViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunConversationDetailContentViewResult)
    async RunConversationDetailContentDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Conversation Detail Contents';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => ConversationDetailContent_, { nullable: true })
    async ConversationDetailContent(@Arg('ID', () => Int) ID: number, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<ConversationDetailContent_ | null> {
        this.CheckUserReadPermissions('Conversation Detail Contents', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [betty].[vwConversationDetailContents] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Conversation Detail Contents', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Conversation Detail Contents', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @Mutation(() => ConversationDetailContent_)
    async CreateConversationDetailContent(
        @Arg('input', () => CreateConversationDetailContentInput) input: CreateConversationDetailContentInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Conversation Detail Contents', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => ConversationDetailContent_)
    async UpdateConversationDetailContent(
        @Arg('input', () => UpdateConversationDetailContentInput) input: UpdateConversationDetailContentInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Conversation Detail Contents', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => ConversationDetailContent_)
    async DeleteConversationDetailContent(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Conversation Detail Contents', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Conversations__betty
//****************************************************************************
@ObjectType()
export class Conversation__betty_ {
    @Field(() => Int) 
    ID: number;
        
    @Field(() => Int, {nullable: true}) 
    OrganizationID?: number;
        
    @Field(() => Int, {nullable: true}) 
    OrganizationKeyID?: number;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    UserID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(8)
    DateCreated?: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Conversations__betty
//****************************************************************************
@InputType()
export class CreateConversation__bettyInput {
    @Field(() => Int, { nullable: true })
    ID?: number;

    @Field(() => Int, { nullable: true })
    OrganizationID: number | null;

    @Field(() => Int, { nullable: true })
    OrganizationKeyID: number | null;

    @Field({ nullable: true })
    UserID: string | null;

    @Field({ nullable: true })
    DateCreated: Date | null;
}
    

//****************************************************************************
// INPUT TYPE for Conversations__betty
//****************************************************************************
@InputType()
export class UpdateConversation__bettyInput {
    @Field(() => Int)
    ID: number;

    @Field(() => Int, { nullable: true })
    OrganizationID?: number | null;

    @Field(() => Int, { nullable: true })
    OrganizationKeyID?: number | null;

    @Field({ nullable: true })
    UserID?: string | null;

    @Field({ nullable: true })
    DateCreated?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Conversations__betty
//****************************************************************************
@ObjectType()
export class RunConversation__bettyViewResult {
    @Field(() => [Conversation__betty_])
    Results: Conversation__betty_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(Conversation__betty_)
export class Conversation__bettyResolver extends ResolverBase {
    @Query(() => RunConversation__bettyViewResult)
    async RunConversation__bettyViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunConversation__bettyViewResult)
    async RunConversation__bettyViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunConversation__bettyViewResult)
    async RunConversation__bettyDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Conversations__betty';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => Conversation__betty_, { nullable: true })
    async Conversation__betty(@Arg('ID', () => Int) ID: number, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Conversation__betty_ | null> {
        this.CheckUserReadPermissions('Conversations__betty', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [betty].[vwConversations__betty] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Conversations__betty', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Conversations__betty', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @Mutation(() => Conversation__betty_)
    async CreateConversation__betty(
        @Arg('input', () => CreateConversation__bettyInput) input: CreateConversation__bettyInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Conversations__betty', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => Conversation__betty_)
    async UpdateConversation__betty(
        @Arg('input', () => UpdateConversation__bettyInput) input: UpdateConversation__bettyInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Conversations__betty', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => Conversation__betty_)
    async DeleteConversation__betty(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Conversations__betty', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Organizations
//****************************************************************************
@ObjectType({ description: `Organization is used to connect data from across multiple schemas. These source schemas represent different source systems like membership, education, events, etc. The CompanyLink table has entries for "matches" between records that represent companies/organizations across the different source systems so that we have a structured way to unify this data in the CDP.` })
export class Organization_ {
    @Field(() => Int) 
    ID: number;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    NimbleAccountID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    Name?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    OrganizationType?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Region?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Institution?: string;
        
    @Field(() => Int, {nullable: true}) 
    DistrictID?: number;
        
    @Field({nullable: true}) 
    @MaxLength(20)
    co_dist_code?: string;
        
    @Field(() => [Person_])
    Persons_NimbleInstitutionIDArray: Person_[]; // Link to Persons
    
    @Field(() => [Organization_])
    Organizations_NimbleAccountIDArray: Organization_[]; // Link to Organizations
    
    @Field(() => [Organization_])
    Organizations_InstitutionArray: Organization_[]; // Link to Organizations
    
    @Field(() => [Core_Data_])
    CoreDatas_co_dist_codeArray: Core_Data_[]; // Link to CoreDatas
    
    @Field(() => [educator_])
    Educators_co_dist_codeArray: educator_[]; // Link to Educators
    
    @Field(() => [edschool_])
    Schools_co_dist_codeArray: edschool_[]; // Link to Schools
    
    @Field(() => [NU__Order__c_])
    Orders_NU__BillToPrimaryAffiliation__cArray: NU__Order__c_[]; // Link to Orders
    
    @Field(() => [NU__Registration2__c_])
    Registrations_NU__PrimaryAffiliation__cArray: NU__Registration2__c_[]; // Link to Registrations
    
    @Field(() => [NU__Affiliation__c_])
    Affiliations_NU__Account__cArray: NU__Affiliation__c_[]; // Link to Affiliations
    
    @Field(() => [NU__CommitteeMembership__c_])
    CommitteeMemberships_NU__SupportingOrganization__cArray: NU__CommitteeMembership__c_[]; // Link to CommitteeMemberships
    
}

//****************************************************************************
// INPUT TYPE for Organizations
//****************************************************************************
@InputType()
export class CreateOrganizationInput {
    @Field({ nullable: true })
    NimbleAccountID: string | null;

    @Field({ nullable: true })
    Name: string | null;

    @Field({ nullable: true })
    OrganizationType: string | null;

    @Field({ nullable: true })
    Region: string | null;

    @Field({ nullable: true })
    Institution: string | null;

    @Field(() => Int, { nullable: true })
    DistrictID: number | null;

    @Field({ nullable: true })
    co_dist_code: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Organizations
//****************************************************************************
@InputType()
export class UpdateOrganizationInput {
    @Field(() => Int)
    ID: number;

    @Field({ nullable: true })
    NimbleAccountID?: string | null;

    @Field({ nullable: true })
    Name?: string | null;

    @Field({ nullable: true })
    OrganizationType?: string | null;

    @Field({ nullable: true })
    Region?: string | null;

    @Field({ nullable: true })
    Institution?: string | null;

    @Field(() => Int, { nullable: true })
    DistrictID?: number | null;

    @Field({ nullable: true })
    co_dist_code?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Organizations
//****************************************************************************
@ObjectType()
export class RunOrganizationViewResult {
    @Field(() => [Organization_])
    Results: Organization_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(Organization_)
export class OrganizationResolver extends ResolverBase {
    @Query(() => RunOrganizationViewResult)
    async RunOrganizationViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunOrganizationViewResult)
    async RunOrganizationViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunOrganizationViewResult)
    async RunOrganizationDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Organizations';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => Organization_, { nullable: true })
    async Organization(@Arg('ID', () => Int) ID: number, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Organization_ | null> {
        this.CheckUserReadPermissions('Organizations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [common].[vwOrganizations] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Organizations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Organizations', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @FieldResolver(() => [Person_])
    async Persons_NimbleInstitutionIDArray(@Root() organization_: Organization_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Persons', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [common].[vwPersons] WHERE [NimbleInstitutionID]='${organization_.NimbleAccountID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Persons', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.ArrayMapFieldNamesToCodeNames('Persons', rows);
        return result;
    }
        
    @FieldResolver(() => [Organization_])
    async Organizations_NimbleAccountIDArray(@Root() organization_: Organization_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Organizations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [common].[vwOrganizations] WHERE [NimbleAccountID]='${organization_.NimbleAccountID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Organizations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.ArrayMapFieldNamesToCodeNames('Organizations', rows);
        return result;
    }
        
    @FieldResolver(() => [Organization_])
    async Organizations_InstitutionArray(@Root() organization_: Organization_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Organizations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [common].[vwOrganizations] WHERE [Institution]='${organization_.Name}' ` + this.getRowLevelSecurityWhereClause(provider, 'Organizations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.ArrayMapFieldNamesToCodeNames('Organizations', rows);
        return result;
    }
        
    @FieldResolver(() => [Core_Data_])
    async CoreDatas_co_dist_codeArray(@Root() organization_: Organization_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Core Datas', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [dese].[vwCore_Datas] WHERE [co_dist_code]='${organization_.co_dist_code}' ` + this.getRowLevelSecurityWhereClause(provider, 'Core Datas', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.ArrayMapFieldNamesToCodeNames('Core Datas', rows);
        return result;
    }
        
    @FieldResolver(() => [educator_])
    async Educators_co_dist_codeArray(@Root() organization_: Organization_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Educators', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [dese].[vweducators] WHERE [co_dist_code]='${organization_.co_dist_code}' ` + this.getRowLevelSecurityWhereClause(provider, 'Educators', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.ArrayMapFieldNamesToCodeNames('Educators', rows);
        return result;
    }
        
    @FieldResolver(() => [edschool_])
    async Schools_co_dist_codeArray(@Root() organization_: Organization_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Schools', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [dese].[vwedschools] WHERE [co_dist_code]='${organization_.co_dist_code}' ` + this.getRowLevelSecurityWhereClause(provider, 'Schools', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.ArrayMapFieldNamesToCodeNames('Schools', rows);
        return result;
    }
        
    @FieldResolver(() => [NU__Order__c_])
    async Orders_NU__BillToPrimaryAffiliation__cArray(@Root() organization_: Organization_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Orders', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [nams].[vwNU__Order__cs] WHERE [NU__BillToPrimaryAffiliation__c]='${organization_.NimbleAccountID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Orders', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.ArrayMapFieldNamesToCodeNames('Orders', rows);
        return result;
    }
        
    @FieldResolver(() => [NU__Registration2__c_])
    async Registrations_NU__PrimaryAffiliation__cArray(@Root() organization_: Organization_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Registrations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [nams].[vwNU__Registration2__cs] WHERE [NU__PrimaryAffiliation__c]='${organization_.Name}' ` + this.getRowLevelSecurityWhereClause(provider, 'Registrations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.ArrayMapFieldNamesToCodeNames('Registrations', rows);
        return result;
    }
        
    @FieldResolver(() => [NU__Affiliation__c_])
    async Affiliations_NU__Account__cArray(@Root() organization_: Organization_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Affiliations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [nams].[vwNU__Affiliation__cs] WHERE [NU__Account__c]='${organization_.NimbleAccountID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Affiliations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.ArrayMapFieldNamesToCodeNames('Affiliations', rows);
        return result;
    }
        
    @FieldResolver(() => [NU__CommitteeMembership__c_])
    async CommitteeMemberships_NU__SupportingOrganization__cArray(@Root() organization_: Organization_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Committee Memberships', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [nams].[vwNU__CommitteeMembership__cs] WHERE [NU__SupportingOrganization__c]='${organization_.NimbleAccountID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Committee Memberships', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.ArrayMapFieldNamesToCodeNames('Committee Memberships', rows);
        return result;
    }
        
    @Mutation(() => Organization_)
    async CreateOrganization(
        @Arg('input', () => CreateOrganizationInput) input: CreateOrganizationInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Organizations', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => Organization_)
    async UpdateOrganization(
        @Arg('input', () => UpdateOrganizationInput) input: UpdateOrganizationInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Organizations', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => Organization_)
    async DeleteOrganization(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Organizations', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Persons
//****************************************************************************
@ObjectType({ description: `Person is used to connect data from across multiple schemas. These source schemas represent different source systems like membership, education, events, etc. The Person table has entries for "matches" between records that represent people across the different source systems so that we have a structured way to unify this data in the CDP.` })
export class Person_ {
    @Field(() => Int) 
    ID: number;
        
    @Field({nullable: true}) 
    @MaxLength(320)
    FirstName?: string;
        
    @Field({nullable: true}) 
    @MaxLength(320)
    LastName?: string;
        
    @Field({nullable: true}) 
    @MaxLength(1000)
    FullName?: string;
        
    @Field({nullable: true}) 
    @MaxLength(320)
    Email?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    NimbleAccountID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    NimbleContactID?: string;
        
    @Field(() => Int, {nullable: true}) 
    OrganizationID?: number;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    MembershipType?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    edssn?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Region?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    Institution?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    NimblePrimaryAffiliationID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    NimbleInstitutionID?: string;
        
    @Field({nullable: true}) 
    NimbleAccount?: string;
        
    @Field(() => [crsassgn_])
    CourseDescriptions_cassnArray: crsassgn_[]; // Link to CourseDescriptions
    
    @Field(() => [Core_Data_])
    CoreDatas_esssnArray: Core_Data_[]; // Link to CoreDatas
    
    @Field(() => [educator_])
    Educators_edssnArray: educator_[]; // Link to Educators
    
    @Field(() => [edschool_])
    Schools_esssnArray: edschool_[]; // Link to Schools
    
    @Field(() => [NU__Membership__c_])
    Memberships_NU__Account__cArray: NU__Membership__c_[]; // Link to Memberships
    
    @Field(() => [NU__Order__c_])
    Orders_NU__BillTo__cArray: NU__Order__c_[]; // Link to Orders
    
    @Field(() => [NU__Registration2__c_])
    Registrations_NU__Account__cArray: NU__Registration2__c_[]; // Link to Registrations
    
    @Field(() => [NU__Affiliation__c_])
    Affiliations_NU__Account__cArray: NU__Affiliation__c_[]; // Link to Affiliations
    
    @Field(() => [NU__CommitteeMembership__c_])
    CommitteeMemberships_NU__Account__cArray: NU__CommitteeMembership__c_[]; // Link to CommitteeMemberships
    
}

//****************************************************************************
// INPUT TYPE for Persons
//****************************************************************************
@InputType()
export class CreatePersonInput {
    @Field({ nullable: true })
    FirstName: string | null;

    @Field({ nullable: true })
    LastName: string | null;

    @Field({ nullable: true })
    FullName: string | null;

    @Field({ nullable: true })
    Email: string | null;

    @Field({ nullable: true })
    NimbleAccountID: string | null;

    @Field({ nullable: true })
    NimbleContactID: string | null;

    @Field(() => Int, { nullable: true })
    OrganizationID: number | null;

    @Field({ nullable: true })
    MembershipType: string | null;

    @Field({ nullable: true })
    edssn: string | null;

    @Field({ nullable: true })
    Region: string | null;

    @Field({ nullable: true })
    Institution: string | null;

    @Field({ nullable: true })
    NimblePrimaryAffiliationID: string | null;

    @Field({ nullable: true })
    NimbleInstitutionID: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Persons
//****************************************************************************
@InputType()
export class UpdatePersonInput {
    @Field(() => Int)
    ID: number;

    @Field({ nullable: true })
    FirstName?: string | null;

    @Field({ nullable: true })
    LastName?: string | null;

    @Field({ nullable: true })
    FullName?: string | null;

    @Field({ nullable: true })
    Email?: string | null;

    @Field({ nullable: true })
    NimbleAccountID?: string | null;

    @Field({ nullable: true })
    NimbleContactID?: string | null;

    @Field(() => Int, { nullable: true })
    OrganizationID?: number | null;

    @Field({ nullable: true })
    MembershipType?: string | null;

    @Field({ nullable: true })
    edssn?: string | null;

    @Field({ nullable: true })
    Region?: string | null;

    @Field({ nullable: true })
    Institution?: string | null;

    @Field({ nullable: true })
    NimblePrimaryAffiliationID?: string | null;

    @Field({ nullable: true })
    NimbleInstitutionID?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Persons
//****************************************************************************
@ObjectType()
export class RunPersonViewResult {
    @Field(() => [Person_])
    Results: Person_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(Person_)
export class PersonResolver extends ResolverBase {
    @Query(() => RunPersonViewResult)
    async RunPersonViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunPersonViewResult)
    async RunPersonViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunPersonViewResult)
    async RunPersonDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Persons';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => Person_, { nullable: true })
    async Person(@Arg('ID', () => Int) ID: number, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Person_ | null> {
        this.CheckUserReadPermissions('Persons', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [common].[vwPersons] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Persons', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Persons', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @FieldResolver(() => [crsassgn_])
    async CourseDescriptions_cassnArray(@Root() person_: Person_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Course Descriptions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [dese].[vwcrsassgns] WHERE [cassn]='${person_.edssn}' ` + this.getRowLevelSecurityWhereClause(provider, 'Course Descriptions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.ArrayMapFieldNamesToCodeNames('Course Descriptions', rows);
        return result;
    }
        
    @FieldResolver(() => [Core_Data_])
    async CoreDatas_esssnArray(@Root() person_: Person_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Core Datas', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [dese].[vwCore_Datas] WHERE [esssn]='${person_.edssn}' ` + this.getRowLevelSecurityWhereClause(provider, 'Core Datas', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.ArrayMapFieldNamesToCodeNames('Core Datas', rows);
        return result;
    }
        
    @FieldResolver(() => [educator_])
    async Educators_edssnArray(@Root() person_: Person_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Educators', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [dese].[vweducators] WHERE [edssn]='${person_.edssn}' ` + this.getRowLevelSecurityWhereClause(provider, 'Educators', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.ArrayMapFieldNamesToCodeNames('Educators', rows);
        return result;
    }
        
    @FieldResolver(() => [edschool_])
    async Schools_esssnArray(@Root() person_: Person_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Schools', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [dese].[vwedschools] WHERE [esssn]='${person_.edssn}' ` + this.getRowLevelSecurityWhereClause(provider, 'Schools', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.ArrayMapFieldNamesToCodeNames('Schools', rows);
        return result;
    }
        
    @FieldResolver(() => [NU__Membership__c_])
    async Memberships_NU__Account__cArray(@Root() person_: Person_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Memberships', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [nams].[vwNU__Membership__cs] WHERE [NU__Account__c]='${person_.NimbleAccountID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Memberships', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.ArrayMapFieldNamesToCodeNames('Memberships', rows);
        return result;
    }
        
    @FieldResolver(() => [NU__Order__c_])
    async Orders_NU__BillTo__cArray(@Root() person_: Person_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Orders', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [nams].[vwNU__Order__cs] WHERE [NU__BillTo__c]='${person_.NimbleAccountID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Orders', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.ArrayMapFieldNamesToCodeNames('Orders', rows);
        return result;
    }
        
    @FieldResolver(() => [NU__Registration2__c_])
    async Registrations_NU__Account__cArray(@Root() person_: Person_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Registrations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [nams].[vwNU__Registration2__cs] WHERE [NU__Account__c]='${person_.NimbleAccountID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Registrations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.ArrayMapFieldNamesToCodeNames('Registrations', rows);
        return result;
    }
        
    @FieldResolver(() => [NU__Affiliation__c_])
    async Affiliations_NU__Account__cArray(@Root() person_: Person_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Affiliations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [nams].[vwNU__Affiliation__cs] WHERE [NU__Account__c]='${person_.NimbleAccountID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Affiliations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.ArrayMapFieldNamesToCodeNames('Affiliations', rows);
        return result;
    }
        
    @FieldResolver(() => [NU__CommitteeMembership__c_])
    async CommitteeMemberships_NU__Account__cArray(@Root() person_: Person_, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Committee Memberships', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [nams].[vwNU__CommitteeMembership__cs] WHERE [NU__Account__c]='${person_.NimbleAccountID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Committee Memberships', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.ArrayMapFieldNamesToCodeNames('Committee Memberships', rows);
        return result;
    }
        
    @Mutation(() => Person_)
    async CreatePerson(
        @Arg('input', () => CreatePersonInput) input: CreatePersonInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Persons', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => Person_)
    async UpdatePerson(
        @Arg('input', () => UpdatePersonInput) input: UpdatePersonInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Persons', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => Person_)
    async DeletePerson(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Persons', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for User Joiners
//****************************************************************************
@ObjectType()
export class UserJoiner_ {
    @Field(() => Int) 
    ID: number;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    Name?: string;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    UserID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    AccountID?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for User Joiners
//****************************************************************************
@InputType()
export class CreateUserJoinerInput {
    @Field(() => Int, { nullable: true })
    ID?: number;

    @Field({ nullable: true })
    Name: string | null;

    @Field({ nullable: true })
    UserID: string | null;

    @Field({ nullable: true })
    AccountID: string | null;
}
    

//****************************************************************************
// INPUT TYPE for User Joiners
//****************************************************************************
@InputType()
export class UpdateUserJoinerInput {
    @Field(() => Int)
    ID: number;

    @Field({ nullable: true })
    Name?: string | null;

    @Field({ nullable: true })
    UserID?: string | null;

    @Field({ nullable: true })
    AccountID?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for User Joiners
//****************************************************************************
@ObjectType()
export class RunUserJoinerViewResult {
    @Field(() => [UserJoiner_])
    Results: UserJoiner_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(UserJoiner_)
export class UserJoinerResolver extends ResolverBase {
    @Query(() => RunUserJoinerViewResult)
    async RunUserJoinerViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunUserJoinerViewResult)
    async RunUserJoinerViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunUserJoinerViewResult)
    async RunUserJoinerDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'User Joiners';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => UserJoiner_, { nullable: true })
    async UserJoiner(@Arg('ID', () => Int) ID: number, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<UserJoiner_ | null> {
        this.CheckUserReadPermissions('User Joiners', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [nams].[vwUserJoiners] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause(provider, 'User Joiners', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('User Joiners', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @Mutation(() => UserJoiner_)
    async CreateUserJoiner(
        @Arg('input', () => CreateUserJoinerInput) input: CreateUserJoinerInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('User Joiners', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => UserJoiner_)
    async UpdateUserJoiner(
        @Arg('input', () => UpdateUserJoinerInput) input: UpdateUserJoinerInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('User Joiners', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => UserJoiner_)
    async DeleteUserJoiner(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('User Joiners', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Conversation Detail -250606s
//****************************************************************************
@ObjectType()
export class ConversationDetail_250606_ {
    @Field(() => Int) 
    ID: number;
        
    @Field(() => Int) 
    ConversationID: number;
        
    @Field() 
    Input: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    InputEmbeddingID?: string;
        
    @Field({nullable: true}) 
    Output?: string;
        
    @Field({nullable: true}) 
    Error?: string;
        
    @Field() 
    @MaxLength(8)
    DateCreated: Date;
        
    @Field() 
    @MaxLength(100)
    SourceIP: string;
        
    @Field() 
    @MaxLength(10)
    mj_CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    mj_UpdatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Conversation Detail -250606s
//****************************************************************************
@InputType()
export class CreateConversationDetail_250606Input {
    @Field(() => Int, { nullable: true })
    ID?: number;

    @Field(() => Int, { nullable: true })
    ConversationID?: number;

    @Field({ nullable: true })
    Input?: string;

    @Field({ nullable: true })
    InputEmbeddingID: string | null;

    @Field({ nullable: true })
    Output: string | null;

    @Field({ nullable: true })
    Error: string | null;

    @Field({ nullable: true })
    DateCreated?: Date;

    @Field({ nullable: true })
    SourceIP?: string;

    @Field({ nullable: true })
    mj_CreatedAt?: Date;

    @Field({ nullable: true })
    mj_UpdatedAt?: Date;
}
    

//****************************************************************************
// INPUT TYPE for Conversation Detail -250606s
//****************************************************************************
@InputType()
export class UpdateConversationDetail_250606Input {
    @Field(() => Int)
    ID: number;

    @Field(() => Int, { nullable: true })
    ConversationID?: number;

    @Field({ nullable: true })
    Input?: string;

    @Field({ nullable: true })
    InputEmbeddingID?: string | null;

    @Field({ nullable: true })
    Output?: string | null;

    @Field({ nullable: true })
    Error?: string | null;

    @Field({ nullable: true })
    DateCreated?: Date;

    @Field({ nullable: true })
    SourceIP?: string;

    @Field({ nullable: true })
    mj_CreatedAt?: Date;

    @Field({ nullable: true })
    mj_UpdatedAt?: Date;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Conversation Detail -250606s
//****************************************************************************
@ObjectType()
export class RunConversationDetail_250606ViewResult {
    @Field(() => [ConversationDetail_250606_])
    Results: ConversationDetail_250606_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(ConversationDetail_250606_)
export class ConversationDetail_250606Resolver extends ResolverBase {
    @Query(() => RunConversationDetail_250606ViewResult)
    async RunConversationDetail_250606ViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunConversationDetail_250606ViewResult)
    async RunConversationDetail_250606ViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunConversationDetail_250606ViewResult)
    async RunConversationDetail_250606DynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Conversation Detail -250606s';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => ConversationDetail_250606_, { nullable: true })
    async ConversationDetail_250606(@Arg('ID', () => Int) ID: number, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<ConversationDetail_250606_ | null> {
        this.CheckUserReadPermissions('Conversation Detail -250606s', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [betty].[vwConversationDetail-250606s] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause(provider, 'Conversation Detail -250606s', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Conversation Detail -250606s', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @Mutation(() => ConversationDetail_250606_)
    async CreateConversationDetail_250606(
        @Arg('input', () => CreateConversationDetail_250606Input) input: CreateConversationDetail_250606Input,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Conversation Detail -250606s', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => ConversationDetail_250606_)
    async UpdateConversationDetail_250606(
        @Arg('input', () => UpdateConversationDetail_250606Input) input: UpdateConversationDetail_250606Input,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Conversation Detail -250606s', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => ConversationDetail_250606_)
    async DeleteConversationDetail_250606(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Conversation Detail -250606s', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Activities
//****************************************************************************
@ObjectType()
export class Activity_ {
    @Field({nullable: true}) 
    @MaxLength(16)
    ID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(20)
    Activity?: string;
        
    @Field() 
    @MaxLength(20)
    ActivityID: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    ActivityType?: string;
        
    @Field({nullable: true}) 
    @MaxLength(8)
    ActivityDate?: Date;
        
    @Field({nullable: true}) 
    ActivityLink?: string;
        
    @Field({nullable: true}) 
    @MaxLength(20)
    CheckInID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(20)
    ContactID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    ContactName?: string;
        
    @Field({nullable: true}) 
    @MaxLength(200)
    ContactEmail?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    ContactExternalID?: string;
        
    @Field(() => Int, {nullable: true}) 
    CampaignID?: number;
        
    @Field({nullable: true}) 
    @MaxLength(1000)
    CampaignName?: string;
        
    @Field({nullable: true}) 
    @MaxLength(20)
    CheckInNotificationID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    CheckInNotificationType?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Activities
//****************************************************************************
@InputType()
export class CreateActivityInput {
    @Field({ nullable: true })
    ID: string | null;

    @Field({ nullable: true })
    Activity: string | null;

    @Field({ nullable: true })
    ActivityID?: string;

    @Field({ nullable: true })
    ActivityType: string | null;

    @Field({ nullable: true })
    ActivityDate: Date | null;

    @Field({ nullable: true })
    ActivityLink: string | null;

    @Field({ nullable: true })
    CheckInID: string | null;

    @Field({ nullable: true })
    ContactID: string | null;

    @Field({ nullable: true })
    ContactName: string | null;

    @Field({ nullable: true })
    ContactEmail: string | null;

    @Field({ nullable: true })
    ContactExternalID: string | null;

    @Field(() => Int, { nullable: true })
    CampaignID: number | null;

    @Field({ nullable: true })
    CampaignName: string | null;

    @Field({ nullable: true })
    CheckInNotificationID: string | null;

    @Field({ nullable: true })
    CheckInNotificationType: string | null;
}
    

//****************************************************************************
// INPUT TYPE for Activities
//****************************************************************************
@InputType()
export class UpdateActivityInput {
    @Field({ nullable: true })
    ID?: string | null;

    @Field({ nullable: true })
    Activity?: string | null;

    @Field()
    ActivityID: string;

    @Field({ nullable: true })
    ActivityType?: string | null;

    @Field({ nullable: true })
    ActivityDate?: Date | null;

    @Field({ nullable: true })
    ActivityLink?: string | null;

    @Field({ nullable: true })
    CheckInID?: string | null;

    @Field({ nullable: true })
    ContactID?: string | null;

    @Field({ nullable: true })
    ContactName?: string | null;

    @Field({ nullable: true })
    ContactEmail?: string | null;

    @Field({ nullable: true })
    ContactExternalID?: string | null;

    @Field(() => Int, { nullable: true })
    CampaignID?: number | null;

    @Field({ nullable: true })
    CampaignName?: string | null;

    @Field({ nullable: true })
    CheckInNotificationID?: string | null;

    @Field({ nullable: true })
    CheckInNotificationType?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Activities
//****************************************************************************
@ObjectType()
export class RunActivityViewResult {
    @Field(() => [Activity_])
    Results: Activity_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(Activity_)
export class ActivityResolver extends ResolverBase {
    @Query(() => RunActivityViewResult)
    async RunActivityViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunActivityViewResult)
    async RunActivityViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunActivityViewResult)
    async RunActivityDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Activities';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => Activity_, { nullable: true })
    async Activity(@Arg('ActivityID', () => String) ActivityID: string, @Ctx() { dataSources, userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Activity_ | null> {
        this.CheckUserReadPermissions('Activities', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const connPool = GetReadOnlyDataSource(dataSources, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM [propfuel].[vwActivities] WHERE [ActivityID]='${ActivityID}' ` + this.getRowLevelSecurityWhereClause(provider, 'Activities', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await SQLServerDataProvider.ExecuteSQLWithPool(connPool, sSQL, undefined, this.GetUserFromPayload(userPayload));
        const result = this.MapFieldNamesToCodeNames('Activities', rows && rows.length > 0 ? rows[0] : {})
        return result;
    }
    
    @Mutation(() => Activity_)
    async CreateActivity(
        @Arg('input', () => CreateActivityInput) input: CreateActivityInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Activities', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => Activity_)
    async UpdateActivity(
        @Arg('input', () => UpdateActivityInput) input: UpdateActivityInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Activities', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => Activity_)
    async DeleteActivity(@Arg('ActivityID', () => String) ActivityID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ActivityID', Value: ActivityID}]);
        return this.DeleteRecord('Activities', key, options, provider, userPayload, pubSub);
    }
    
}