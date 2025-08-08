import { BaseEntity, EntitySaveOptions, EntityDeleteOptions, CompositeKey, ValidationResult, ValidationErrorInfo, ValidationErrorType, Metadata, ProviderType, DatabaseProviderBase } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { z } from "zod";

export const loadModule = () => {
  // no-op, only used to ensure this file is a valid module and to allow easy loading
}

     
 
/**
 * zod schema definition for the entity Account Descriptions
 */
export const acct_descSchema = z.object({
    acct_number: z.number().nullable().describe(`
        * * Field Name: acct_number
        * * Display Name: Account Number
        * * SQL Data Type: int`),
    acct_desc: z.string().nullable().describe(`
        * * Field Name: acct_desc
        * * Display Name: Account Description
        * * SQL Data Type: varchar(100)`),
    ID: z.number().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: int`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type acct_descEntityType = z.infer<typeof acct_descSchema>;

/**
 * zod schema definition for the entity Accounts
 */
export const AccountSchema = z.object({
    Id: z.string().describe(`
        * * Field Name: Id
        * * Display Name: Id
        * * SQL Data Type: nvarchar(50)`),
    IsDeleted: z.boolean().nullable().describe(`
        * * Field Name: IsDeleted
        * * Display Name: Is Deleted
        * * SQL Data Type: bit`),
    MasterRecordId: z.string().nullable().describe(`
        * * Field Name: MasterRecordId
        * * Display Name: Master Record Id
        * * SQL Data Type: nvarchar(MAX)`),
    Name: z.string().nullable().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(MAX)`),
    LastName: z.string().nullable().describe(`
        * * Field Name: LastName
        * * Display Name: Last Name
        * * SQL Data Type: nvarchar(MAX)`),
    FirstName: z.string().nullable().describe(`
        * * Field Name: FirstName
        * * Display Name: First Name
        * * SQL Data Type: nvarchar(MAX)`),
    Salutation: z.string().nullable().describe(`
        * * Field Name: Salutation
        * * Display Name: Salutation
        * * SQL Data Type: nvarchar(MAX)`),
    Type: z.string().nullable().describe(`
        * * Field Name: Type
        * * Display Name: Type
        * * SQL Data Type: nvarchar(MAX)`),
    RecordTypeId: z.string().nullable().describe(`
        * * Field Name: RecordTypeId
        * * Display Name: Record Type Id
        * * SQL Data Type: nvarchar(MAX)`),
    ParentId: z.string().nullable().describe(`
        * * Field Name: ParentId
        * * Display Name: Parent Id
        * * SQL Data Type: nvarchar(MAX)`),
    BillingStreet: z.string().nullable().describe(`
        * * Field Name: BillingStreet
        * * Display Name: Billing Street
        * * SQL Data Type: nvarchar(MAX)`),
    BillingCity: z.string().nullable().describe(`
        * * Field Name: BillingCity
        * * Display Name: Billing City
        * * SQL Data Type: nvarchar(MAX)`),
    BillingState: z.string().nullable().describe(`
        * * Field Name: BillingState
        * * Display Name: Billing State
        * * SQL Data Type: nvarchar(MAX)`),
    BillingPostalCode: z.string().nullable().describe(`
        * * Field Name: BillingPostalCode
        * * Display Name: Billing Postal Code
        * * SQL Data Type: nvarchar(MAX)`),
    BillingCountry: z.string().nullable().describe(`
        * * Field Name: BillingCountry
        * * Display Name: Billing Country
        * * SQL Data Type: nvarchar(MAX)`),
    BillingLatitude: z.number().nullable().describe(`
        * * Field Name: BillingLatitude
        * * Display Name: Billing Latitude
        * * SQL Data Type: decimal(18, 15)`),
    BillingLongitude: z.number().nullable().describe(`
        * * Field Name: BillingLongitude
        * * Display Name: Billing Longitude
        * * SQL Data Type: decimal(18, 15)`),
    BillingGeocodeAccuracy: z.string().nullable().describe(`
        * * Field Name: BillingGeocodeAccuracy
        * * Display Name: Billing Geocode Accuracy
        * * SQL Data Type: nvarchar(MAX)`),
    ShippingStreet: z.string().nullable().describe(`
        * * Field Name: ShippingStreet
        * * Display Name: Shipping Street
        * * SQL Data Type: nvarchar(MAX)`),
    ShippingCity: z.string().nullable().describe(`
        * * Field Name: ShippingCity
        * * Display Name: Shipping City
        * * SQL Data Type: nvarchar(MAX)`),
    ShippingState: z.string().nullable().describe(`
        * * Field Name: ShippingState
        * * Display Name: Shipping State
        * * SQL Data Type: nvarchar(MAX)`),
    ShippingPostalCode: z.string().nullable().describe(`
        * * Field Name: ShippingPostalCode
        * * Display Name: Shipping Postal Code
        * * SQL Data Type: nvarchar(MAX)`),
    ShippingCountry: z.string().nullable().describe(`
        * * Field Name: ShippingCountry
        * * Display Name: Shipping Country
        * * SQL Data Type: nvarchar(MAX)`),
    ShippingLatitude: z.number().nullable().describe(`
        * * Field Name: ShippingLatitude
        * * Display Name: Shipping Latitude
        * * SQL Data Type: decimal(18, 15)`),
    ShippingLongitude: z.number().nullable().describe(`
        * * Field Name: ShippingLongitude
        * * Display Name: Shipping Longitude
        * * SQL Data Type: decimal(18, 15)`),
    ShippingGeocodeAccuracy: z.string().nullable().describe(`
        * * Field Name: ShippingGeocodeAccuracy
        * * Display Name: Shipping Geocode Accuracy
        * * SQL Data Type: nvarchar(MAX)`),
    Phone: z.string().nullable().describe(`
        * * Field Name: Phone
        * * Display Name: Phone
        * * SQL Data Type: nvarchar(MAX)`),
    Fax: z.string().nullable().describe(`
        * * Field Name: Fax
        * * Display Name: Fax
        * * SQL Data Type: nvarchar(MAX)`),
    AccountNumber: z.string().nullable().describe(`
        * * Field Name: AccountNumber
        * * Display Name: Account Number
        * * SQL Data Type: nvarchar(MAX)`),
    Website: z.string().nullable().describe(`
        * * Field Name: Website
        * * Display Name: Website
        * * SQL Data Type: nvarchar(MAX)`),
    PhotoUrl: z.string().nullable().describe(`
        * * Field Name: PhotoUrl
        * * Display Name: Photo Url
        * * SQL Data Type: nvarchar(MAX)`),
    Sic: z.string().nullable().describe(`
        * * Field Name: Sic
        * * Display Name: Sic
        * * SQL Data Type: nvarchar(MAX)`),
    Industry: z.string().nullable().describe(`
        * * Field Name: Industry
        * * Display Name: Industry
        * * SQL Data Type: nvarchar(MAX)`),
    AnnualRevenue: z.number().nullable().describe(`
        * * Field Name: AnnualRevenue
        * * Display Name: Annual Revenue
        * * SQL Data Type: decimal(18, 0)`),
    NumberOfEmployees: z.number().nullable().describe(`
        * * Field Name: NumberOfEmployees
        * * Display Name: Number Of Employees
        * * SQL Data Type: int`),
    Ownership: z.string().nullable().describe(`
        * * Field Name: Ownership
        * * Display Name: Ownership
        * * SQL Data Type: nvarchar(MAX)`),
    TickerSymbol: z.string().nullable().describe(`
        * * Field Name: TickerSymbol
        * * Display Name: Ticker Symbol
        * * SQL Data Type: nvarchar(MAX)`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    Rating: z.string().nullable().describe(`
        * * Field Name: Rating
        * * Display Name: Rating
        * * SQL Data Type: nvarchar(MAX)`),
    Site: z.string().nullable().describe(`
        * * Field Name: Site
        * * Display Name: Site
        * * SQL Data Type: nvarchar(MAX)`),
    OwnerId: z.string().nullable().describe(`
        * * Field Name: OwnerId
        * * Display Name: Owner Id
        * * SQL Data Type: nvarchar(MAX)`),
    CreatedById: z.string().nullable().describe(`
        * * Field Name: CreatedById
        * * Display Name: Created By Id
        * * SQL Data Type: nvarchar(MAX)`),
    LastModifiedDate: z.date().nullable().describe(`
        * * Field Name: LastModifiedDate
        * * Display Name: Last Modified Date
        * * SQL Data Type: datetimeoffset`),
    LastModifiedById: z.string().nullable().describe(`
        * * Field Name: LastModifiedById
        * * Display Name: Last Modified By Id
        * * SQL Data Type: nvarchar(MAX)`),
    SystemModstamp: z.date().nullable().describe(`
        * * Field Name: SystemModstamp
        * * Display Name: System Modstamp
        * * SQL Data Type: datetimeoffset`),
    LastActivityDate: z.date().nullable().describe(`
        * * Field Name: LastActivityDate
        * * Display Name: Last Activity Date
        * * SQL Data Type: datetimeoffset`),
    LastViewedDate: z.date().nullable().describe(`
        * * Field Name: LastViewedDate
        * * Display Name: Last Viewed Date
        * * SQL Data Type: datetimeoffset`),
    LastReferencedDate: z.date().nullable().describe(`
        * * Field Name: LastReferencedDate
        * * Display Name: Last Referenced Date
        * * SQL Data Type: datetimeoffset`),
    IsPartner: z.boolean().nullable().describe(`
        * * Field Name: IsPartner
        * * Display Name: Is Partner
        * * SQL Data Type: bit`),
    IsCustomerPortal: z.boolean().nullable().describe(`
        * * Field Name: IsCustomerPortal
        * * Display Name: Is Customer Portal
        * * SQL Data Type: bit`),
    PersonContactId: z.string().nullable().describe(`
        * * Field Name: PersonContactId
        * * Display Name: Person Contact Id
        * * SQL Data Type: nvarchar(MAX)`),
    IsPersonAccount: z.boolean().nullable().describe(`
        * * Field Name: IsPersonAccount
        * * Display Name: Is Person Account
        * * SQL Data Type: bit`),
    ChannelProgramName: z.string().nullable().describe(`
        * * Field Name: ChannelProgramName
        * * Display Name: Channel Program Name
        * * SQL Data Type: nvarchar(MAX)`),
    ChannelProgramLevelName: z.string().nullable().describe(`
        * * Field Name: ChannelProgramLevelName
        * * Display Name: Channel Program Level Name
        * * SQL Data Type: nvarchar(MAX)`),
    PersonMailingStreet: z.string().nullable().describe(`
        * * Field Name: PersonMailingStreet
        * * Display Name: Person Mailing Street
        * * SQL Data Type: nvarchar(MAX)`),
    PersonMailingCity: z.string().nullable().describe(`
        * * Field Name: PersonMailingCity
        * * Display Name: Person Mailing City
        * * SQL Data Type: nvarchar(MAX)`),
    PersonMailingState: z.string().nullable().describe(`
        * * Field Name: PersonMailingState
        * * Display Name: Person Mailing State
        * * SQL Data Type: nvarchar(MAX)`),
    PersonMailingPostalCode: z.string().nullable().describe(`
        * * Field Name: PersonMailingPostalCode
        * * Display Name: Person Mailing Postal Code
        * * SQL Data Type: nvarchar(MAX)`),
    PersonMailingCountry: z.string().nullable().describe(`
        * * Field Name: PersonMailingCountry
        * * Display Name: Person Mailing Country
        * * SQL Data Type: nvarchar(MAX)`),
    PersonMailingLatitude: z.number().nullable().describe(`
        * * Field Name: PersonMailingLatitude
        * * Display Name: Person Mailing Latitude
        * * SQL Data Type: decimal(18, 15)`),
    PersonMailingLongitude: z.number().nullable().describe(`
        * * Field Name: PersonMailingLongitude
        * * Display Name: Person Mailing Longitude
        * * SQL Data Type: decimal(18, 15)`),
    PersonMailingGeocodeAccuracy: z.string().nullable().describe(`
        * * Field Name: PersonMailingGeocodeAccuracy
        * * Display Name: Person Mailing Geocode Accuracy
        * * SQL Data Type: nvarchar(MAX)`),
    PersonOtherStreet: z.string().nullable().describe(`
        * * Field Name: PersonOtherStreet
        * * Display Name: Person Other Street
        * * SQL Data Type: nvarchar(MAX)`),
    PersonOtherCity: z.string().nullable().describe(`
        * * Field Name: PersonOtherCity
        * * Display Name: Person Other City
        * * SQL Data Type: nvarchar(MAX)`),
    PersonOtherState: z.string().nullable().describe(`
        * * Field Name: PersonOtherState
        * * Display Name: Person Other State
        * * SQL Data Type: nvarchar(MAX)`),
    PersonOtherPostalCode: z.string().nullable().describe(`
        * * Field Name: PersonOtherPostalCode
        * * Display Name: Person Other Postal Code
        * * SQL Data Type: nvarchar(MAX)`),
    PersonOtherCountry: z.string().nullable().describe(`
        * * Field Name: PersonOtherCountry
        * * Display Name: Person Other Country
        * * SQL Data Type: nvarchar(MAX)`),
    PersonOtherLatitude: z.number().nullable().describe(`
        * * Field Name: PersonOtherLatitude
        * * Display Name: Person Other Latitude
        * * SQL Data Type: decimal(18, 15)`),
    PersonOtherLongitude: z.number().nullable().describe(`
        * * Field Name: PersonOtherLongitude
        * * Display Name: Person Other Longitude
        * * SQL Data Type: decimal(18, 15)`),
    PersonOtherGeocodeAccuracy: z.string().nullable().describe(`
        * * Field Name: PersonOtherGeocodeAccuracy
        * * Display Name: Person Other Geocode Accuracy
        * * SQL Data Type: nvarchar(MAX)`),
    PersonMobilePhone: z.string().nullable().describe(`
        * * Field Name: PersonMobilePhone
        * * Display Name: Person Mobile Phone
        * * SQL Data Type: nvarchar(MAX)`),
    PersonHomePhone: z.string().nullable().describe(`
        * * Field Name: PersonHomePhone
        * * Display Name: Person Home Phone
        * * SQL Data Type: nvarchar(MAX)`),
    PersonOtherPhone: z.string().nullable().describe(`
        * * Field Name: PersonOtherPhone
        * * Display Name: Person Other Phone
        * * SQL Data Type: nvarchar(MAX)`),
    PersonAssistantPhone: z.string().nullable().describe(`
        * * Field Name: PersonAssistantPhone
        * * Display Name: Person Assistant Phone
        * * SQL Data Type: nvarchar(MAX)`),
    PersonEmail: z.string().nullable().describe(`
        * * Field Name: PersonEmail
        * * Display Name: Person Email
        * * SQL Data Type: nvarchar(MAX)`),
    PersonTitle: z.string().nullable().describe(`
        * * Field Name: PersonTitle
        * * Display Name: Person Title
        * * SQL Data Type: nvarchar(MAX)`),
    PersonDepartment: z.string().nullable().describe(`
        * * Field Name: PersonDepartment
        * * Display Name: Person Department
        * * SQL Data Type: nvarchar(MAX)`),
    PersonAssistantName: z.string().nullable().describe(`
        * * Field Name: PersonAssistantName
        * * Display Name: Person Assistant Name
        * * SQL Data Type: nvarchar(MAX)`),
    PersonLeadSource: z.string().nullable().describe(`
        * * Field Name: PersonLeadSource
        * * Display Name: Person Lead Source
        * * SQL Data Type: nvarchar(MAX)`),
    PersonBirthdate: z.date().nullable().describe(`
        * * Field Name: PersonBirthdate
        * * Display Name: Person Birthdate
        * * SQL Data Type: datetimeoffset`),
    PersonHasOptedOutOfEmail: z.boolean().nullable().describe(`
        * * Field Name: PersonHasOptedOutOfEmail
        * * Display Name: Person Has Opted Out Of Email
        * * SQL Data Type: bit`),
    PersonHasOptedOutOfFax: z.boolean().nullable().describe(`
        * * Field Name: PersonHasOptedOutOfFax
        * * Display Name: Person Has Opted Out Of Fax
        * * SQL Data Type: bit`),
    PersonDoNotCall: z.boolean().nullable().describe(`
        * * Field Name: PersonDoNotCall
        * * Display Name: Person Do Not Call
        * * SQL Data Type: bit`),
    PersonLastCURequestDate: z.date().nullable().describe(`
        * * Field Name: PersonLastCURequestDate
        * * Display Name: Person Last CURequest Date
        * * SQL Data Type: datetimeoffset`),
    PersonLastCUUpdateDate: z.date().nullable().describe(`
        * * Field Name: PersonLastCUUpdateDate
        * * Display Name: Person Last CUUpdate Date
        * * SQL Data Type: datetimeoffset`),
    PersonEmailBouncedReason: z.string().nullable().describe(`
        * * Field Name: PersonEmailBouncedReason
        * * Display Name: Person Email Bounced Reason
        * * SQL Data Type: nvarchar(MAX)`),
    PersonEmailBouncedDate: z.date().nullable().describe(`
        * * Field Name: PersonEmailBouncedDate
        * * Display Name: Person Email Bounced Date
        * * SQL Data Type: datetimeoffset`),
    PersonIndividualId: z.string().nullable().describe(`
        * * Field Name: PersonIndividualId
        * * Display Name: Person Individual Id
        * * SQL Data Type: nvarchar(MAX)`),
    Jigsaw: z.string().nullable().describe(`
        * * Field Name: Jigsaw
        * * Display Name: Jigsaw
        * * SQL Data Type: nvarchar(MAX)`),
    JigsawCompanyId: z.string().nullable().describe(`
        * * Field Name: JigsawCompanyId
        * * Display Name: Jigsaw Company Id
        * * SQL Data Type: nvarchar(MAX)`),
    AccountSource: z.string().nullable().describe(`
        * * Field Name: AccountSource
        * * Display Name: Account Source
        * * SQL Data Type: nvarchar(MAX)`),
    SicDesc: z.string().nullable().describe(`
        * * Field Name: SicDesc
        * * Display Name: Sic Desc
        * * SQL Data Type: nvarchar(MAX)`),
    NU__AccountBalance__c: z.number().nullable().describe(`
        * * Field Name: NU__AccountBalance__c
        * * Display Name: NU__Account Balance __c
        * * SQL Data Type: decimal(18, 2)`),
    NU__AccountID__c: z.string().nullable().describe(`
        * * Field Name: NU__AccountID__c
        * * Display Name: NU__Account ID__c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__AccountMoneySpent__c: z.number().nullable().describe(`
        * * Field Name: NU__AccountMoneySpent__c
        * * Display Name: NU__Account Money Spent __c
        * * SQL Data Type: decimal(18, 2)`),
    NU__CasualName__c: z.string().nullable().describe(`
        * * Field Name: NU__CasualName__c
        * * Display Name: NU__Casual Name __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__CommunicationPreference__c: z.string().nullable().describe(`
        * * Field Name: NU__CommunicationPreference__c
        * * Display Name: NU__Communication Preference __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__CopyFromMailingToBilling__c: z.boolean().nullable().describe(`
        * * Field Name: NU__CopyFromMailingToBilling__c
        * * Display Name: NU__Copy From Mailing To Billing __c
        * * SQL Data Type: bit`),
    NU__CopyFromMailingToOther__c: z.boolean().nullable().describe(`
        * * Field Name: NU__CopyFromMailingToOther__c
        * * Display Name: NU__Copy From Mailing To Other __c
        * * SQL Data Type: bit`),
    NU__CopyFromMailingToShipping__c: z.boolean().nullable().describe(`
        * * Field Name: NU__CopyFromMailingToShipping__c
        * * Display Name: NU__Copy From Mailing To Shipping __c
        * * SQL Data Type: bit`),
    NU__CopyFromPrimaryAffiliationBilling__c: z.boolean().nullable().describe(`
        * * Field Name: NU__CopyFromPrimaryAffiliationBilling__c
        * * Display Name: NU__Copy From Primary Affiliation Billing __c
        * * SQL Data Type: bit`),
    NU__Designation__c: z.string().nullable().describe(`
        * * Field Name: NU__Designation__c
        * * Display Name: NU__Designation __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Ethnicity__c: z.string().nullable().describe(`
        * * Field Name: NU__Ethnicity__c
        * * Display Name: NU__Ethnicity __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__ExternalID__c: z.string().nullable().describe(`
        * * Field Name: NU__ExternalID__c
        * * Display Name: NU__External ID__c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__FacebookAccount__c: z.string().nullable().describe(`
        * * Field Name: NU__FacebookAccount__c
        * * Display Name: NU__Facebook Account __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__FullName__c: z.string().nullable().describe(`
        * * Field Name: NU__FullName__c
        * * Display Name: NU__Full Name __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Gender__c: z.string().nullable().describe(`
        * * Field Name: NU__Gender__c
        * * Display Name: NU__Gender __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__JoinOn__c: z.date().nullable().describe(`
        * * Field Name: NU__JoinOn__c
        * * Display Name: NU__Join On __c
        * * SQL Data Type: datetimeoffset`),
    NU__LapsedOn__c: z.date().nullable().describe(`
        * * Field Name: NU__LapsedOn__c
        * * Display Name: NU__Lapsed On __c
        * * SQL Data Type: datetimeoffset`),
    NU__Lapsed__c: z.string().nullable().describe(`
        * * Field Name: NU__Lapsed__c
        * * Display Name: NU__Lapsed __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__LastLogin__c: z.date().nullable().describe(`
        * * Field Name: NU__LastLogin__c
        * * Display Name: NU__Last Login __c
        * * SQL Data Type: datetimeoffset`),
    NU__LegacyID__c: z.string().nullable().describe(`
        * * Field Name: NU__LegacyID__c
        * * Display Name: NU__Legacy ID__c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__LinkedInAccount__c: z.string().nullable().describe(`
        * * Field Name: NU__LinkedInAccount__c
        * * Display Name: NU__Linked In Account __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__MarkForDelete__c: z.boolean().nullable().describe(`
        * * Field Name: NU__MarkForDelete__c
        * * Display Name: NU__Mark For Delete __c
        * * SQL Data Type: bit`),
    NU__MemberThru__c: z.date().nullable().describe(`
        * * Field Name: NU__MemberThru__c
        * * Display Name: NU__Member Thru __c
        * * SQL Data Type: datetimeoffset`),
    NU__Member__c: z.string().nullable().describe(`
        * * Field Name: NU__Member__c
        * * Display Name: NU__Member __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__MembershipType__c: z.string().nullable().describe(`
        * * Field Name: NU__MembershipType__c
        * * Display Name: NU__Membership Type __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Membership__c: z.string().nullable().describe(`
        * * Field Name: NU__Membership__c
        * * Display Name: NU__Membership __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__MiddleName__c: z.string().nullable().describe(`
        * * Field Name: NU__MiddleName__c
        * * Display Name: NU__Middle Name __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__OtherEmail__c: z.string().nullable().describe(`
        * * Field Name: NU__OtherEmail__c
        * * Display Name: NU__Other Email __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__OtherFax__c: z.string().nullable().describe(`
        * * Field Name: NU__OtherFax__c
        * * Display Name: NU__Other Fax __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__PasswordHash__c: z.string().nullable().describe(`
        * * Field Name: NU__PasswordHash__c
        * * Display Name: NU__Password Hash __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__PasswordSalt__c: z.string().nullable().describe(`
        * * Field Name: NU__PasswordSalt__c
        * * Display Name: NU__Password Salt __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__PersonAccountData__c: z.string().nullable().describe(`
        * * Field Name: NU__PersonAccountData__c
        * * Display Name: NU__Person Account Data __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__PersonContact__c: z.string().nullable().describe(`
        * * Field Name: NU__PersonContact__c
        * * Display Name: NU__Person Contact __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__PersonEmail__c: z.string().nullable().describe(`
        * * Field Name: NU__PersonEmail__c
        * * Display Name: NU__Person Email __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__PrimaryAffiliation__c: z.string().nullable().describe(`
        * * Field Name: NU__PrimaryAffiliation__c
        * * Display Name: NU__Primary Affiliation __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__PrimaryEntity__c: z.string().nullable().describe(`
        * * Field Name: NU__PrimaryEntity__c
        * * Display Name: NU__Primary Entity __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__RecordTypeName__c: z.string().nullable().describe(`
        * * Field Name: NU__RecordTypeName__c
        * * Display Name: Nimble Record Type
        * * SQL Data Type: nvarchar(MAX)`),
    NU__RecoveryAnswer1__c: z.string().nullable().describe(`
        * * Field Name: NU__RecoveryAnswer1__c
        * * Display Name: NU__Recovery Answer 1__c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__RecoveryAnswer2__c: z.string().nullable().describe(`
        * * Field Name: NU__RecoveryAnswer2__c
        * * Display Name: NU__Recovery Answer 2__c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__RecoveryAnswer3__c: z.string().nullable().describe(`
        * * Field Name: NU__RecoveryAnswer3__c
        * * Display Name: NU__Recovery Answer 3__c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__RecoveryQuestion1__c: z.string().nullable().describe(`
        * * Field Name: NU__RecoveryQuestion1__c
        * * Display Name: NU__Recovery Question 1__c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__RecoveryQuestion2__c: z.string().nullable().describe(`
        * * Field Name: NU__RecoveryQuestion2__c
        * * Display Name: NU__Recovery Question 2__c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__RecoveryQuestion3__c: z.string().nullable().describe(`
        * * Field Name: NU__RecoveryQuestion3__c
        * * Display Name: NU__Recovery Question 3__c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__SecurityGroup__c: z.string().nullable().describe(`
        * * Field Name: NU__SecurityGroup__c
        * * Display Name: NU__Security Group __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__StatusMembershipFlag__c: z.string().nullable().describe(`
        * * Field Name: NU__StatusMembershipFlag__c
        * * Display Name: NU__Status Membership Flag __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__StatusMembership__c: z.string().nullable().describe(`
        * * Field Name: NU__StatusMembership__c
        * * Display Name: NU__Status Membership __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Status__c: z.string().nullable().describe(`
        * * Field Name: NU__Status__c
        * * Display Name: Status
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Suffix__c: z.string().nullable().describe(`
        * * Field Name: NU__Suffix__c
        * * Display Name: NU__Suffix __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__TaxExemptId__c: z.string().nullable().describe(`
        * * Field Name: NU__TaxExemptId__c
        * * Display Name: NU__Tax Exempt Id __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__TaxExempt__c: z.boolean().nullable().describe(`
        * * Field Name: NU__TaxExempt__c
        * * Display Name: NU__Tax Exempt __c
        * * SQL Data Type: bit`),
    NU__TotalAffiliateBalance__c: z.number().nullable().describe(`
        * * Field Name: NU__TotalAffiliateBalance__c
        * * Display Name: NU__Total Affiliate Balance __c
        * * SQL Data Type: decimal(18, 2)`),
    NU__TotalAffiliateMoneySpent__c: z.number().nullable().describe(`
        * * Field Name: NU__TotalAffiliateMoneySpent__c
        * * Display Name: NU__Total Affiliate Money Spent __c
        * * SQL Data Type: decimal(18, 2)`),
    NU__TwitterAccount__c: z.string().nullable().describe(`
        * * Field Name: NU__TwitterAccount__c
        * * Display Name: NU__Twitter Account __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Username__c: z.string().nullable().describe(`
        * * Field Name: NU__Username__c
        * * Display Name: NU__Username __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__ValidEmailDomains__c: z.string().nullable().describe(`
        * * Field Name: NU__ValidEmailDomains__c
        * * Display Name: NU__Valid Email Domains __c
        * * SQL Data Type: nvarchar(MAX)`),
    Pay_Type__c: z.string().nullable().describe(`
        * * Field Name: Pay_Type__c
        * * Display Name: Pay _Type __c
        * * SQL Data Type: nvarchar(MAX)`),
    No_CTA__c: z.boolean().nullable().describe(`
        * * Field Name: No_CTA__c
        * * Display Name: No _CTA__c
        * * SQL Data Type: bit`),
    Certified_CTA_Dues__c: z.number().nullable().describe(`
        * * Field Name: Certified_CTA_Dues__c
        * * Display Name: Certified _CTA_Dues __c
        * * SQL Data Type: decimal(4, 2)`),
    Refund_to_Individual__c: z.boolean().nullable().describe(`
        * * Field Name: Refund_to_Individual__c
        * * Display Name: Refund _to _Individual __c
        * * SQL Data Type: bit`),
    Student_year__c: z.string().nullable().describe(`
        * * Field Name: Student_year__c
        * * Display Name: Student _year __c
        * * SQL Data Type: nvarchar(MAX)`),
    Fellowship_program__c: z.boolean().nullable().describe(`
        * * Field Name: Fellowship_program__c
        * * Display Name: Fellowship _program __c
        * * SQL Data Type: bit`),
    Expected_graduation_date__c: z.date().nullable().describe(`
        * * Field Name: Expected_graduation_date__c
        * * Display Name: Expected _graduation _date __c
        * * SQL Data Type: datetimeoffset`),
    Student_teach__c: z.boolean().nullable().describe(`
        * * Field Name: Student_teach__c
        * * Display Name: Student _teach __c
        * * SQL Data Type: bit`),
    Member_of_FTA__c: z.boolean().nullable().describe(`
        * * Field Name: Member_of_FTA__c
        * * Display Name: Member _of _FTA__c
        * * SQL Data Type: bit`),
    Grade_Level__c: z.string().nullable().describe(`
        * * Field Name: Grade_Level__c
        * * Display Name: Grade _Level __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__PrimaryAffiliationRecord__c: z.string().nullable().describe(`
        * * Field Name: NU__PrimaryAffiliationRecord__c
        * * Display Name: NU__Primary Affiliation Record __c
        * * SQL Data Type: nvarchar(MAX)`),
    Is_certified__c: z.string().nullable().describe(`
        * * Field Name: Is_certified__c
        * * Display Name: Is _certified __c
        * * SQL Data Type: nvarchar(MAX)`),
    Account_Owner_Data_Processing__c: z.string().nullable().describe(`
        * * Field Name: Account_Owner_Data_Processing__c
        * * Display Name: Account _Owner _Data _Processing __c
        * * SQL Data Type: nvarchar(MAX)`),
    AccrualDues__c: z.string().nullable().describe(`
        * * Field Name: AccrualDues__c
        * * Display Name: Accrual Dues __c
        * * SQL Data Type: nvarchar(MAX)`),
    DESE_Key__c: z.string().nullable().describe(`
        * * Field Name: DESE_Key__c
        * * Display Name: DESE_Key __c
        * * SQL Data Type: nvarchar(MAX)`),
    SSN_Last_4__c: z.string().nullable().describe(`
        * * Field Name: SSN_Last_4__c
        * * Display Name: SSN_Last _4__c
        * * SQL Data Type: nvarchar(MAX)`),
    CTA_Number__c: z.string().nullable().describe(`
        * * Field Name: CTA_Number__c
        * * Display Name: CTA_Number __c
        * * SQL Data Type: nvarchar(MAX)`),
    CloudingoAgent__BAR__c: z.string().nullable().describe(`
        * * Field Name: CloudingoAgent__BAR__c
        * * Display Name: Cloudingo Agent __BAR__c
        * * SQL Data Type: nvarchar(MAX)`),
    Membership_Product_Name__c: z.string().nullable().describe(`
        * * Field Name: Membership_Product_Name__c
        * * Display Name: Membership _Product _Name __c
        * * SQL Data Type: nvarchar(MAX)`),
    Beneficiary__c: z.string().nullable().describe(`
        * * Field Name: Beneficiary__c
        * * Display Name: Beneficiary __c
        * * SQL Data Type: nvarchar(MAX)`),
    Exclude_Directory__c: z.boolean().nullable().describe(`
        * * Field Name: Exclude_Directory__c
        * * Display Name: Exclude _Directory __c
        * * SQL Data Type: bit`),
    NU__PrimaryContactEmail__c: z.string().nullable().describe(`
        * * Field Name: NU__PrimaryContactEmail__c
        * * Display Name: NU__Primary Contact Email __c
        * * SQL Data Type: nvarchar(MAX)`),
    Previous_Last_Name__c: z.string().nullable().describe(`
        * * Field Name: Previous_Last_Name__c
        * * Display Name: Previous _Last _Name __c
        * * SQL Data Type: nvarchar(MAX)`),
    Collect_Student_Chapter_Dues__c: z.boolean().nullable().describe(`
        * * Field Name: Collect_Student_Chapter_Dues__c
        * * Display Name: Collect _Student _Chapter _Dues __c
        * * SQL Data Type: bit`),
    Contact_if_problems__c: z.string().nullable().describe(`
        * * Field Name: Contact_if_problems__c
        * * Display Name: Contact _if _problems __c
        * * SQL Data Type: nvarchar(MAX)`),
    Display_CTA_Dues__c: z.boolean().nullable().describe(`
        * * Field Name: Display_CTA_Dues__c
        * * Display Name: Display _CTA_Dues __c
        * * SQL Data Type: bit`),
    Payroll_deduction_through__c: z.string().nullable().describe(`
        * * Field Name: Payroll_deduction_through__c
        * * Display Name: Payroll _deduction _through __c
        * * SQL Data Type: nvarchar(MAX)`),
    CTA_Priority__c: z.string().nullable().describe(`
        * * Field Name: CTA_Priority__c
        * * Display Name: CTA_Priority __c
        * * SQL Data Type: nvarchar(MAX)`),
    Easy_Renewal__c: z.boolean().nullable().describe(`
        * * Field Name: Easy_Renewal__c
        * * Display Name: Easy _Renewal __c
        * * SQL Data Type: bit`),
    Contact_Account_del__c: z.string().nullable().describe(`
        * * Field Name: Contact_Account_del__c
        * * Display Name: Contact _Account _del __c
        * * SQL Data Type: nvarchar(MAX)`),
    Member_Id__c: z.string().nullable().describe(`
        * * Field Name: Member_Id__c
        * * Display Name: Member _Id __c
        * * SQL Data Type: nvarchar(MAX)`),
    School_District_Account__c: z.string().nullable().describe(`
        * * Field Name: School_District_Account__c
        * * Display Name: School _District _Account __c
        * * SQL Data Type: nvarchar(MAX)`),
    MSTA_Action__c: z.boolean().nullable().describe(`
        * * Field Name: MSTA_Action__c
        * * Display Name: MSTA_Action __c
        * * SQL Data Type: bit`),
    No_outside_solicitation__c: z.boolean().nullable().describe(`
        * * Field Name: No_outside_solicitation__c
        * * Display Name: No _outside _solicitation __c
        * * SQL Data Type: bit`),
    No_Magazine__c: z.boolean().nullable().describe(`
        * * Field Name: No_Magazine__c
        * * Display Name: No _Magazine __c
        * * SQL Data Type: bit`),
    Opt_out_of_all_MSTA_mail__c: z.boolean().nullable().describe(`
        * * Field Name: Opt_out_of_all_MSTA_mail__c
        * * Display Name: Opt _out _of _all _MSTA_mail __c
        * * SQL Data Type: bit`),
    Membership_Card__c: z.date().nullable().describe(`
        * * Field Name: Membership_Card__c
        * * Display Name: Membership _Card __c
        * * SQL Data Type: datetimeoffset`),
    Beneficiary_Relation__c: z.string().nullable().describe(`
        * * Field Name: Beneficiary_Relation__c
        * * Display Name: Beneficiary _Relation __c
        * * SQL Data Type: nvarchar(MAX)`),
    Opt_out_of_all_MSTA_Email__c: z.boolean().nullable().describe(`
        * * Field Name: Opt_out_of_all_MSTA_Email__c
        * * Display Name: Opt _out _of _all _MSTA_Email __c
        * * SQL Data Type: bit`),
    Content_Area__c: z.string().nullable().describe(`
        * * Field Name: Content_Area__c
        * * Display Name: Content _Area __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__PrimaryContactName__c: z.string().nullable().describe(`
        * * Field Name: NU__PrimaryContactName__c
        * * Display Name: NU__Primary Contact Name __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__PrimaryLocationQualityCode__c: z.string().nullable().describe(`
        * * Field Name: NU__PrimaryLocationQualityCode__c
        * * Display Name: NU__Primary Location Quality Code __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__PrimaryLocation__Latitude__s: z.number().nullable().describe(`
        * * Field Name: NU__PrimaryLocation__Latitude__s
        * * Display Name: NU__Primary Location __Latitude __s
        * * SQL Data Type: decimal(10, 7)`),
    NU__PrimaryLocation__Longitude__s: z.number().nullable().describe(`
        * * Field Name: NU__PrimaryLocation__Longitude__s
        * * Display Name: NU__Primary Location __Longitude __s
        * * SQL Data Type: decimal(10, 7)`),
    Region__c: z.string().nullable().describe(`
        * * Field Name: Region__c
        * * Display Name: Region
        * * SQL Data Type: nvarchar(MAX)`),
    Institution__c: z.string().nullable().describe(`
        * * Field Name: Institution__c
        * * Display Name: Institution __c
        * * SQL Data Type: nvarchar(MAX)`),
    Work_Phone__c: z.string().nullable().describe(`
        * * Field Name: Work_Phone__c
        * * Display Name: Work _Phone __c
        * * SQL Data Type: nvarchar(MAX)`),
    Deceased__c: z.boolean().nullable().describe(`
        * * Field Name: Deceased__c
        * * Display Name: Deceased __c
        * * SQL Data Type: bit`),
    Expelled__c: z.boolean().nullable().describe(`
        * * Field Name: Expelled__c
        * * Display Name: Expelled __c
        * * SQL Data Type: bit`),
    Legacy_Customer_Type__c: z.string().nullable().describe(`
        * * Field Name: Legacy_Customer_Type__c
        * * Display Name: Legacy _Customer _Type __c
        * * SQL Data Type: nvarchar(MAX)`),
    Future_Member_Type__c: z.string().nullable().describe(`
        * * Field Name: Future_Member_Type__c
        * * Display Name: Future _Member _Type __c
        * * SQL Data Type: nvarchar(MAX)`),
    Future_Member__c: z.boolean().nullable().describe(`
        * * Field Name: Future_Member__c
        * * Display Name: Future _Member __c
        * * SQL Data Type: bit`),
    Future_Pay_Type__c: z.string().nullable().describe(`
        * * Field Name: Future_Pay_Type__c
        * * Display Name: Future _Pay _Type __c
        * * SQL Data Type: nvarchar(MAX)`),
    Future_Product_Type__c: z.string().nullable().describe(`
        * * Field Name: Future_Product_Type__c
        * * Display Name: Future _Product _Type __c
        * * SQL Data Type: nvarchar(MAX)`),
    Future_Status__c: z.string().nullable().describe(`
        * * Field Name: Future_Status__c
        * * Display Name: Future _Status __c
        * * SQL Data Type: nvarchar(MAX)`),
    New_Member_Type__c: z.string().nullable().describe(`
        * * Field Name: New_Member_Type__c
        * * Display Name: New _Member _Type __c
        * * SQL Data Type: nvarchar(MAX)`),
    New_Member__c: z.boolean().nullable().describe(`
        * * Field Name: New_Member__c
        * * Display Name: New _Member __c
        * * SQL Data Type: bit`),
    New_Product_Type__c: z.string().nullable().describe(`
        * * Field Name: New_Product_Type__c
        * * Display Name: New _Product _Type __c
        * * SQL Data Type: nvarchar(MAX)`),
    Suspend__c: z.boolean().nullable().describe(`
        * * Field Name: Suspend__c
        * * Display Name: Suspend __c
        * * SQL Data Type: bit`),
    UnmatchedBalances__c: z.boolean().nullable().describe(`
        * * Field Name: UnmatchedBalances__c
        * * Display Name: Unmatched Balances __c
        * * SQL Data Type: bit`),
    Test_Owner_Matches_Parent__c: z.boolean().nullable().describe(`
        * * Field Name: Test_Owner_Matches_Parent__c
        * * Display Name: Test _Owner _Matches _Parent __c
        * * SQL Data Type: bit`),
    Institution_CTA_Number__c: z.string().nullable().describe(`
        * * Field Name: Institution_CTA_Number__c
        * * Display Name: Institution _CTA_Number __c
        * * SQL Data Type: nvarchar(MAX)`),
    Marketing_Label__c: z.string().nullable().describe(`
        * * Field Name: Marketing_Label__c
        * * Display Name: Marketing _Label __c
        * * SQL Data Type: nvarchar(MAX)`),
    Future_Marketing_Label__c: z.string().nullable().describe(`
        * * Field Name: Future_Marketing_Label__c
        * * Display Name: Future _Marketing _Label __c
        * * SQL Data Type: nvarchar(MAX)`),
    InstitutionId__c: z.string().nullable().describe(`
        * * Field Name: InstitutionId__c
        * * Display Name: Institution Id __c
        * * SQL Data Type: nvarchar(MAX)`),
    Easy_Renewal_Complete__c: z.boolean().nullable().describe(`
        * * Field Name: Easy_Renewal_Complete__c
        * * Display Name: Easy _Renewal _Complete __c
        * * SQL Data Type: bit`),
    Remove_Reason__c: z.string().nullable().describe(`
        * * Field Name: Remove_Reason__c
        * * Display Name: Remove _Reason __c
        * * SQL Data Type: nvarchar(MAX)`),
    MobileAdmin__c: z.string().nullable().describe(`
        * * Field Name: MobileAdmin__c
        * * Display Name: Mobile Admin __c
        * * SQL Data Type: nvarchar(MAX)`),
    MobileDirectoryActive__c: z.string().nullable().describe(`
        * * Field Name: MobileDirectoryActive__c
        * * Display Name: Mobile Directory Active __c
        * * SQL Data Type: nvarchar(MAX)`),
    MobileInfo__c: z.string().nullable().describe(`
        * * Field Name: MobileInfo__c
        * * Display Name: Mobile Info __c
        * * SQL Data Type: nvarchar(MAX)`),
    Future_Renewal_Notice_Code__c: z.string().nullable().describe(`
        * * Field Name: Future_Renewal_Notice_Code__c
        * * Display Name: Future _Renewal _Notice _Code __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__PrimaryContact__c: z.string().nullable().describe(`
        * * Field Name: NU__PrimaryContact__c
        * * Display Name: NU__Primary Contact __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__UpdatePrimaryLocation__c: z.boolean().nullable().describe(`
        * * Field Name: NU__UpdatePrimaryLocation__c
        * * Display Name: NU__Update Primary Location __c
        * * SQL Data Type: bit`),
    Agreed_to_Terms__c: z.date().nullable().describe(`
        * * Field Name: Agreed_to_Terms__c
        * * Display Name: Agreed _to _Terms __c
        * * SQL Data Type: datetimeoffset`),
    Alternate_Work_Phone__c: z.string().nullable().describe(`
        * * Field Name: Alternate_Work_Phone__c
        * * Display Name: Alternate _Work _Phone __c
        * * SQL Data Type: nvarchar(MAX)`),
    School_Address__c: z.string().nullable().describe(`
        * * Field Name: School_Address__c
        * * Display Name: School _Address __c
        * * SQL Data Type: nvarchar(MAX)`),
    School_City_F__c: z.string().nullable().describe(`
        * * Field Name: School_City_F__c
        * * Display Name: School _City _F__c
        * * SQL Data Type: nvarchar(MAX)`),
    School_Country_F__c: z.string().nullable().describe(`
        * * Field Name: School_Country_F__c
        * * Display Name: School _Country _F__c
        * * SQL Data Type: nvarchar(MAX)`),
    School_StateProvince__c: z.string().nullable().describe(`
        * * Field Name: School_StateProvince__c
        * * Display Name: School _State Province __c
        * * SQL Data Type: nvarchar(MAX)`),
    School_Street__c: z.string().nullable().describe(`
        * * Field Name: School_Street__c
        * * Display Name: School _Street __c
        * * SQL Data Type: nvarchar(MAX)`),
    School_ZipPostal_Code__c: z.string().nullable().describe(`
        * * Field Name: School_ZipPostal_Code__c
        * * Display Name: School _Zip Postal _Code __c
        * * SQL Data Type: nvarchar(MAX)`),
    Student_At_School_Address_Line_1__c: z.string().nullable().describe(`
        * * Field Name: Student_At_School_Address_Line_1__c
        * * Display Name: Student _At _School _Address _Line _1__c
        * * SQL Data Type: nvarchar(MAX)`),
    Student_At_School_Address_Line_2__c: z.string().nullable().describe(`
        * * Field Name: Student_At_School_Address_Line_2__c
        * * Display Name: Student _At _School _Address _Line _2__c
        * * SQL Data Type: nvarchar(MAX)`),
    Student_At_School_Address_Line_3__c: z.string().nullable().describe(`
        * * Field Name: Student_At_School_Address_Line_3__c
        * * Display Name: Student _At _School _Address _Line _3__c
        * * SQL Data Type: nvarchar(MAX)`),
    Student_At_School_City__c: z.string().nullable().describe(`
        * * Field Name: Student_At_School_City__c
        * * Display Name: Student _At _School _City __c
        * * SQL Data Type: nvarchar(MAX)`),
    Student_At_School_Country__c: z.string().nullable().describe(`
        * * Field Name: Student_At_School_Country__c
        * * Display Name: Student _At _School _Country __c
        * * SQL Data Type: nvarchar(MAX)`),
    Student_At_School_PostalCode__c: z.string().nullable().describe(`
        * * Field Name: Student_At_School_PostalCode__c
        * * Display Name: Student _At _School _Postal Code __c
        * * SQL Data Type: nvarchar(MAX)`),
    Student_At_School_State__c: z.string().nullable().describe(`
        * * Field Name: Student_At_School_State__c
        * * Display Name: Student _At _School _State __c
        * * SQL Data Type: nvarchar(MAX)`),
    Student_At_School_Street__c: z.string().nullable().describe(`
        * * Field Name: Student_At_School_Street__c
        * * Display Name: Student _At _School _Street __c
        * * SQL Data Type: nvarchar(MAX)`),
    Student_At_School__c: z.string().nullable().describe(`
        * * Field Name: Student_At_School__c
        * * Display Name: Student _At _School __c
        * * SQL Data Type: nvarchar(MAX)`),
    Use_for_Billing__c: z.string().nullable().describe(`
        * * Field Name: Use_for_Billing__c
        * * Display Name: Use _for _Billing __c
        * * SQL Data Type: nvarchar(MAX)`),
    Use_for_Mailing__c: z.string().nullable().describe(`
        * * Field Name: Use_for_Mailing__c
        * * Display Name: Use _for _Mailing __c
        * * SQL Data Type: nvarchar(MAX)`),
    Use_for_Shipping__c: z.string().nullable().describe(`
        * * Field Name: Use_for_Shipping__c
        * * Display Name: Use _for _Shipping __c
        * * SQL Data Type: nvarchar(MAX)`),
    Future_Product_List_Price__c: z.string().nullable().describe(`
        * * Field Name: Future_Product_List_Price__c
        * * Display Name: Future _Product _List _Price __c
        * * SQL Data Type: nvarchar(MAX)`),
    Chapter_Dues_Amount__c: z.number().nullable().describe(`
        * * Field Name: Chapter_Dues_Amount__c
        * * Display Name: Chapter _Dues _Amount __c
        * * SQL Data Type: decimal(18, 2)`),
    Lapsed_Beyond_Grace_Return_Date__c: z.date().nullable().describe(`
        * * Field Name: Lapsed_Beyond_Grace_Return_Date__c
        * * Display Name: Lapsed _Beyond _Grace _Return _Date __c
        * * SQL Data Type: datetimeoffset`),
    MSTA_Legacy_Customer_Type__c: z.string().nullable().describe(`
        * * Field Name: MSTA_Legacy_Customer_Type__c
        * * Display Name: MSTA_Legacy _Customer _Type __c
        * * SQL Data Type: nvarchar(MAX)`),
    Renewal_Forms_Sort__c: z.string().nullable().describe(`
        * * Field Name: Renewal_Forms_Sort__c
        * * Display Name: Renewal _Forms _Sort __c
        * * SQL Data Type: nvarchar(MAX)`),
    State_House_District__c: z.string().nullable().describe(`
        * * Field Name: State_House_District__c
        * * Display Name: State _House _District __c
        * * SQL Data Type: nvarchar(MAX)`),
    State_Senate_District__c: z.string().nullable().describe(`
        * * Field Name: State_Senate_District__c
        * * Display Name: State _Senate _District __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__CreditBalance__c: z.number().nullable().describe(`
        * * Field Name: NU__CreditBalance__c
        * * Display Name: NU__Credit Balance __c
        * * SQL Data Type: decimal(18, 2)`),
    Abbreviation__c: z.string().nullable().describe(`
        * * Field Name: Abbreviation__c
        * * Display Name: Abbreviation __c
        * * SQL Data Type: nvarchar(MAX)`),
    Previous_Acct_Owner__c: z.string().nullable().describe(`
        * * Field Name: Previous_Acct_Owner__c
        * * Display Name: Previous _Acct _Owner __c
        * * SQL Data Type: nvarchar(MAX)`),
    County__c: z.string().nullable().describe(`
        * * Field Name: County__c
        * * Display Name: County __c
        * * SQL Data Type: nvarchar(MAX)`),
    Alt_Contact_Account_del__c: z.string().nullable().describe(`
        * * Field Name: Alt_Contact_Account_del__c
        * * Display Name: Alt _Contact _Account _del __c
        * * SQL Data Type: nvarchar(MAX)`),
    Net_Promoter_Score__c: z.number().nullable().describe(`
        * * Field Name: Net_Promoter_Score__c
        * * Display Name: Net _Promoter _Score __c
        * * SQL Data Type: decimal(2, 0)`),
    NU__TotalAffiliatedAccounts__c: z.number().nullable().describe(`
        * * Field Name: NU__TotalAffiliatedAccounts__c
        * * Display Name: NU__Total Affiliated Accounts __c
        * * SQL Data Type: decimal(18, 0)`),
    Respondent_Comments__c: z.string().nullable().describe(`
        * * Field Name: Respondent_Comments__c
        * * Display Name: Respondent _Comments __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__FullNameOverride__c: z.string().nullable().describe(`
        * * Field Name: NU__FullNameOverride__c
        * * Display Name: NU__Full Name Override __c
        * * SQL Data Type: nvarchar(MAX)`),
    Birthday_Day__c: z.number().nullable().describe(`
        * * Field Name: Birthday_Day__c
        * * Display Name: Birthday _Day __c
        * * SQL Data Type: decimal(18, 0)`),
    Non_member_Opt_In__c: z.boolean().nullable().describe(`
        * * Field Name: Non_member_Opt_In__c
        * * Display Name: Non _member _Opt _In __c
        * * SQL Data Type: bit`),
    NU__Trusted__c: z.boolean().nullable().describe(`
        * * Field Name: NU__Trusted__c
        * * Display Name: NU__Trusted __c
        * * SQL Data Type: bit`),
    NC__AccountCreatedThroughSocialSignOn__c: z.boolean().nullable().describe(`
        * * Field Name: NC__AccountCreatedThroughSocialSignOn__c
        * * Display Name: NC__Account Created Through Social Sign On __c
        * * SQL Data Type: bit`),
    NC__AccountDoesNotHavePassword__c: z.boolean().nullable().describe(`
        * * Field Name: NC__AccountDoesNotHavePassword__c
        * * Display Name: NC__Account Does Not Have Password __c
        * * SQL Data Type: bit`),
    Expected_Graduation_Month__c: z.string().nullable().describe(`
        * * Field Name: Expected_Graduation_Month__c
        * * Display Name: Expected _Graduation _Month __c
        * * SQL Data Type: nvarchar(MAX)`),
    Expected_Graduation_Year__c: z.string().nullable().describe(`
        * * Field Name: Expected_Graduation_Year__c
        * * Display Name: Expected _Graduation _Year __c
        * * SQL Data Type: nvarchar(MAX)`),
    geopointe__Geocode__c: z.string().nullable().describe(`
        * * Field Name: geopointe__Geocode__c
        * * Display Name: geopointe __Geocode __c
        * * SQL Data Type: nvarchar(MAX)`),
    Non_Renewal_Mailing__c: z.date().nullable().describe(`
        * * Field Name: Non_Renewal_Mailing__c
        * * Display Name: Non _Renewal _Mailing __c
        * * SQL Data Type: datetimeoffset`),
    NU__ProfileImageRevisionId__c: z.string().nullable().describe(`
        * * Field Name: NU__ProfileImageRevisionId__c
        * * Display Name: NU__Profile Image Revision Id __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__ProfileImageURL__c: z.string().nullable().describe(`
        * * Field Name: NU__ProfileImageURL__c
        * * Display Name: NU__Profile Image URL__c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__ProfileImage__c: z.string().nullable().describe(`
        * * Field Name: NU__ProfileImage__c
        * * Display Name: NU__Profile Image __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__SandboxEnabled__c: z.boolean().nullable().describe(`
        * * Field Name: NU__SandboxEnabled__c
        * * Display Name: NU__Sandbox Enabled __c
        * * SQL Data Type: bit`),
    NPS_Year__c: z.string().nullable().describe(`
        * * Field Name: NPS_Year__c
        * * Display Name: NPS_Year __c
        * * SQL Data Type: nvarchar(MAX)`),
    NPS_Response_Label__c: z.string().nullable().describe(`
        * * Field Name: NPS_Response_Label__c
        * * Display Name: NPS_Response _Label __c
        * * SQL Data Type: nvarchar(MAX)`),
    AgencyUsedforFoodService__c: z.string().nullable().describe(`
        * * Field Name: AgencyUsedforFoodService__c
        * * Display Name: Agency Usedfor Food Service __c
        * * SQL Data Type: nvarchar(MAX)`),
    NPFollowupComments__c: z.string().nullable().describe(`
        * * Field Name: NPFollowupComments__c
        * * Display Name: NPFollowup Comments __c
        * * SQL Data Type: nvarchar(MAX)`),
    AgencyusedforSubstitutes__c: z.string().nullable().describe(`
        * * Field Name: AgencyusedforSubstitutes__c
        * * Display Name: Agencyusedfor Substitutes __c
        * * SQL Data Type: nvarchar(MAX)`),
    School_Building_Number__c: z.number().nullable().describe(`
        * * Field Name: School_Building_Number__c
        * * Display Name: School _Building _Number __c
        * * SQL Data Type: decimal(4, 0)`),
    AgencyusedforCustodialServices__c: z.string().nullable().describe(`
        * * Field Name: AgencyusedforCustodialServices__c
        * * Display Name: Agencyusedfor Custodial Services __c
        * * SQL Data Type: nvarchar(MAX)`),
    CollectiveBargaining__c: z.string().nullable().describe(`
        * * Field Name: CollectiveBargaining__c
        * * Display Name: Collective Bargaining __c
        * * SQL Data Type: nvarchar(MAX)`),
    ContractforCustodial__c: z.string().nullable().describe(`
        * * Field Name: ContractforCustodial__c
        * * Display Name: Contractfor Custodial __c
        * * SQL Data Type: nvarchar(MAX)`),
    ContractforFoodService__c: z.string().nullable().describe(`
        * * Field Name: ContractforFoodService__c
        * * Display Name: Contractfor Food Service __c
        * * SQL Data Type: nvarchar(MAX)`),
    ContractforSubstitutes__c: z.string().nullable().describe(`
        * * Field Name: ContractforSubstitutes__c
        * * Display Name: Contractfor Substitutes __c
        * * SQL Data Type: nvarchar(MAX)`),
    rrpu__Alert_Message__c: z.string().nullable().describe(`
        * * Field Name: rrpu__Alert_Message__c
        * * Display Name: rrpu __Alert _Message __c
        * * SQL Data Type: nvarchar(MAX)`),
    CloudingoAgent__BAS__c: z.number().nullable().describe(`
        * * Field Name: CloudingoAgent__BAS__c
        * * Display Name: Cloudingo Agent __BAS__c
        * * SQL Data Type: decimal(18, 0)`),
    CloudingoAgent__BAV__c: z.string().nullable().describe(`
        * * Field Name: CloudingoAgent__BAV__c
        * * Display Name: Cloudingo Agent __BAV__c
        * * SQL Data Type: nvarchar(MAX)`),
    CloudingoAgent__BRDI__c: z.string().nullable().describe(`
        * * Field Name: CloudingoAgent__BRDI__c
        * * Display Name: Cloudingo Agent __BRDI__c
        * * SQL Data Type: nvarchar(MAX)`),
    CloudingoAgent__BTZ__c: z.string().nullable().describe(`
        * * Field Name: CloudingoAgent__BTZ__c
        * * Display Name: Cloudingo Agent __BTZ__c
        * * SQL Data Type: nvarchar(MAX)`),
    CloudingoAgent__SAR__c: z.string().nullable().describe(`
        * * Field Name: CloudingoAgent__SAR__c
        * * Display Name: Cloudingo Agent __SAR__c
        * * SQL Data Type: nvarchar(MAX)`),
    CloudingoAgent__SAS__c: z.number().nullable().describe(`
        * * Field Name: CloudingoAgent__SAS__c
        * * Display Name: Cloudingo Agent __SAS__c
        * * SQL Data Type: decimal(18, 0)`),
    CloudingoAgent__SAV__c: z.string().nullable().describe(`
        * * Field Name: CloudingoAgent__SAV__c
        * * Display Name: Cloudingo Agent __SAV__c
        * * SQL Data Type: nvarchar(MAX)`),
    CloudingoAgent__SRDI__c: z.string().nullable().describe(`
        * * Field Name: CloudingoAgent__SRDI__c
        * * Display Name: Cloudingo Agent __SRDI__c
        * * SQL Data Type: nvarchar(MAX)`),
    CloudingoAgent__STZ__c: z.string().nullable().describe(`
        * * Field Name: CloudingoAgent__STZ__c
        * * Display Name: Cloudingo Agent __STZ__c
        * * SQL Data Type: nvarchar(MAX)`),
    LongFormID__c: z.string().nullable().describe(`
        * * Field Name: LongFormID__c
        * * Display Name: Long Form ID__c
        * * SQL Data Type: nvarchar(MAX)`),
    InstitutionLongID__c: z.string().nullable().describe(`
        * * Field Name: InstitutionLongID__c
        * * Display Name: Institution Long ID__c
        * * SQL Data Type: nvarchar(MAX)`),
    BillHighway__c: z.boolean().nullable().describe(`
        * * Field Name: BillHighway__c
        * * Display Name: Bill Highway __c
        * * SQL Data Type: bit`),
    NoPacket__c: z.boolean().nullable().describe(`
        * * Field Name: NoPacket__c
        * * Display Name: No Packet __c
        * * SQL Data Type: bit`),
    YourMembershipType__c: z.string().nullable().describe(`
        * * Field Name: YourMembershipType__c
        * * Display Name: Your Membership Type __c
        * * SQL Data Type: nvarchar(MAX)`),
    YourProductType__c: z.string().nullable().describe(`
        * * Field Name: YourProductType__c
        * * Display Name: Your Product Type __c
        * * SQL Data Type: nvarchar(MAX)`),
    NC_DPP__AnonymizedDate__c: z.date().nullable().describe(`
        * * Field Name: NC_DPP__AnonymizedDate__c
        * * Display Name: NC_DPP__Anonymized Date __c
        * * SQL Data Type: datetimeoffset`),
    NumCurrentYearMemberships__c: z.number().nullable().describe(`
        * * Field Name: NumCurrentYearMemberships__c
        * * Display Name: Num Current Year Memberships __c
        * * SQL Data Type: decimal(2, 0)`),
    DoNotSendMembershipCard__c: z.boolean().nullable().describe(`
        * * Field Name: DoNotSendMembershipCard__c
        * * Display Name: Do Not Send Membership Card __c
        * * SQL Data Type: bit`),
    NewBylawsReceived__c: z.date().nullable().describe(`
        * * Field Name: NewBylawsReceived__c
        * * Display Name: New Bylaws Received __c
        * * SQL Data Type: datetimeoffset`),
    BillHighwayStatus__c: z.string().nullable().describe(`
        * * Field Name: BillHighwayStatus__c
        * * Display Name: Bill Highway Status __c
        * * SQL Data Type: nvarchar(MAX)`),
    BillHighwayCanceledDate__c: z.date().nullable().describe(`
        * * Field Name: BillHighwayCanceledDate__c
        * * Display Name: Bill Highway Canceled Date __c
        * * SQL Data Type: datetimeoffset`),
    NU__LapsedOnOverride__c: z.date().nullable().describe(`
        * * Field Name: NU__LapsedOnOverride__c
        * * Display Name: NU__Lapsed On Override __c
        * * SQL Data Type: datetimeoffset`),
    NU__MemberOverride__c: z.string().nullable().describe(`
        * * Field Name: NU__MemberOverride__c
        * * Display Name: NU__Member Override __c
        * * SQL Data Type: nvarchar(MAX)`),
    qualtrics__NPS_Date__c: z.date().nullable().describe(`
        * * Field Name: qualtrics__NPS_Date__c
        * * Display Name: qualtrics __NPS_Date __c
        * * SQL Data Type: datetimeoffset`),
    qualtrics__Net_Promoter_Score__c: z.number().nullable().describe(`
        * * Field Name: qualtrics__Net_Promoter_Score__c
        * * Display Name: qualtrics __Net _Promoter _Score __c
        * * SQL Data Type: decimal(2, 0)`),
    NPHowCanWeImprove__c: z.string().nullable().describe(`
        * * Field Name: NPHowCanWeImprove__c
        * * Display Name: NPHow Can We Improve __c
        * * SQL Data Type: nvarchar(MAX)`),
    NPFollowup__c: z.boolean().nullable().describe(`
        * * Field Name: NPFollowup__c
        * * Display Name: NPFollowup __c
        * * SQL Data Type: bit`),
    NPEmail__c: z.string().nullable().describe(`
        * * Field Name: NPEmail__c
        * * Display Name: NPEmail __c
        * * SQL Data Type: nvarchar(MAX)`),
    District_Attorney__c: z.string().nullable().describe(`
        * * Field Name: District_Attorney__c
        * * Display Name: District _Attorney __c
        * * SQL Data Type: nvarchar(MAX)`),
    Email_Opt_in_Weekly_Bytes__c: z.boolean().nullable().describe(`
        * * Field Name: Email_Opt_in_Weekly_Bytes__c
        * * Display Name: Email _Opt _in _Weekly _Bytes __c
        * * SQL Data Type: bit`),
    MNEA_LM_1_Filed__c: z.boolean().nullable().describe(`
        * * Field Name: MNEA_LM_1_Filed__c
        * * Display Name: MNEA_LM_1_Filed __c
        * * SQL Data Type: bit`),
    MSTA_LM_1_Filed__c: z.string().nullable().describe(`
        * * Field Name: MSTA_LM_1_Filed__c
        * * Display Name: MSTA_LM_1_Filed __c
        * * SQL Data Type: nvarchar(MAX)`),
    Email_Opt_in_Events__c: z.boolean().nullable().describe(`
        * * Field Name: Email_Opt_in_Events__c
        * * Display Name: Email _Opt _in _Events __c
        * * SQL Data Type: bit`),
    Email_Opt_in_Action__c: z.boolean().nullable().describe(`
        * * Field Name: Email_Opt_in_Action__c
        * * Display Name: Email _Opt _in _Action __c
        * * SQL Data Type: bit`),
    Email_Opt_in_News__c: z.boolean().nullable().describe(`
        * * Field Name: Email_Opt_in_News__c
        * * Display Name: Email _Opt _in _News __c
        * * SQL Data Type: bit`),
    Email_Opt_in_Leaders__c: z.boolean().nullable().describe(`
        * * Field Name: Email_Opt_in_Leaders__c
        * * Display Name: Email _Opt _in _Leaders __c
        * * SQL Data Type: bit`),
    Email_Opt_in_Partners__c: z.boolean().nullable().describe(`
        * * Field Name: Email_Opt_in_Partners__c
        * * Display Name: Email _Opt _in _Partners __c
        * * SQL Data Type: bit`),
    CurrentFiscalYear__c: z.string().nullable().describe(`
        * * Field Name: CurrentFiscalYear__c
        * * Display Name: Current Fiscal Year __c
        * * SQL Data Type: nvarchar(MAX)`),
    InsuranceCoverageDates__c: z.string().nullable().describe(`
        * * Field Name: InsuranceCoverageDates__c
        * * Display Name: Insurance Coverage Dates __c
        * * SQL Data Type: nvarchar(MAX)`),
    Membership_Year__c: z.string().nullable().describe(`
        * * Field Name: Membership_Year__c
        * * Display Name: Membership _Year __c
        * * SQL Data Type: nvarchar(MAX)`),
    TodaysDate__c: z.string().nullable().describe(`
        * * Field Name: TodaysDate__c
        * * Display Name: Todays Date __c
        * * SQL Data Type: nvarchar(MAX)`),
    IsStudent__c: z.boolean().nullable().describe(`
        * * Field Name: IsStudent__c
        * * Display Name: Is Student __c
        * * SQL Data Type: bit`),
    PreferredAddress__c: z.string().nullable().describe(`
        * * Field Name: PreferredAddress__c
        * * Display Name: Preferred Address __c
        * * SQL Data Type: nvarchar(MAX)`),
    ChMemberType__c: z.string().nullable().describe(`
        * * Field Name: ChMemberType__c
        * * Display Name: Ch Member Type __c
        * * SQL Data Type: nvarchar(MAX)`),
    Known_Bad_Home_Address__c: z.boolean().nullable().describe(`
        * * Field Name: Known_Bad_Home_Address__c
        * * Display Name: Known _Bad _Home _Address __c
        * * SQL Data Type: bit`),
    CTA_Dues_Collection_Agreement__c: z.date().nullable().describe(`
        * * Field Name: CTA_Dues_Collection_Agreement__c
        * * Display Name: CTA_Dues _Collection _Agreement __c
        * * SQL Data Type: datetimeoffset`),
    ACH_Agreement_On_File__c: z.boolean().nullable().describe(`
        * * Field Name: ACH_Agreement_On_File__c
        * * Display Name: ACH_Agreement _On _File __c
        * * SQL Data Type: bit`),
    MSTA_Collecting_CTA_Dues__c: z.boolean().nullable().describe(`
        * * Field Name: MSTA_Collecting_CTA_Dues__c
        * * Display Name: MSTA_Collecting _CTA_Dues __c
        * * SQL Data Type: bit`),
    Region_Abbreviation__c: z.string().nullable().describe(`
        * * Field Name: Region_Abbreviation__c
        * * Display Name: Region _Abbreviation __c
        * * SQL Data Type: nvarchar(MAX)`),
    Chapter_Dues__c: z.number().nullable().describe(`
        * * Field Name: Chapter_Dues__c
        * * Display Name: Chapter _Dues __c
        * * SQL Data Type: decimal(18, 2)`),
    Recruited_By__c: z.string().nullable().describe(`
        * * Field Name: Recruited_By__c
        * * Display Name: Recruited _By __c
        * * SQL Data Type: nvarchar(MAX)`),
    Duplicate_Key__c: z.string().nullable().describe(`
        * * Field Name: Duplicate_Key__c
        * * Display Name: Duplicate _Key __c
        * * SQL Data Type: nvarchar(MAX)`),
    Position__c: z.string().nullable().describe(`
        * * Field Name: Position__c
        * * Display Name: Position __c
        * * SQL Data Type: nvarchar(MAX)`),
    PSRS_Petition__c: z.boolean().nullable().describe(`
        * * Field Name: PSRS_Petition__c
        * * Display Name: PSRS_Petition __c
        * * SQL Data Type: bit`),
    CTA_Dues_Amount_to_Display_on_Renewal__c: z.number().nullable().describe(`
        * * Field Name: CTA_Dues_Amount_to_Display_on_Renewal__c
        * * Display Name: CTA_Dues _Amount _to _Display _on _Renewal __c
        * * SQL Data Type: decimal(18, 2)`),
    Non_certified_CTA_Dues__c: z.number().nullable().describe(`
        * * Field Name: Non_certified_CTA_Dues__c
        * * Display Name: Non _certified _CTA_Dues __c
        * * SQL Data Type: decimal(4, 2)`),
    Collective_Bargaining_Agreement_Received__c: z.date().nullable().describe(`
        * * Field Name: Collective_Bargaining_Agreement_Received__c
        * * Display Name: Collective _Bargaining _Agreement _Received __c
        * * SQL Data Type: datetimeoffset`),
    Collective_Bargaining_Agreement_Expires__c: z.date().nullable().describe(`
        * * Field Name: Collective_Bargaining_Agreement_Expires__c
        * * Display Name: Collective _Bargaining _Agreement _Expires __c
        * * SQL Data Type: datetimeoffset`),
    DESKSCMT__Desk_Company_Id__c: z.number().nullable().describe(`
        * * Field Name: DESKSCMT__Desk_Company_Id__c
        * * Display Name: DESKSCMT__Desk _Company _Id __c
        * * SQL Data Type: decimal(18, 0)`),
    P2A__Advocate_ID__c: z.number().nullable().describe(`
        * * Field Name: P2A__Advocate_ID__c
        * * Display Name: P2A__Advocate _ID__c
        * * SQL Data Type: decimal(18, 0)`),
    P2A__City_District__c: z.string().nullable().describe(`
        * * Field Name: P2A__City_District__c
        * * Display Name: P2A__City _District __c
        * * SQL Data Type: nvarchar(MAX)`),
    P2A__County__c: z.string().nullable().describe(`
        * * Field Name: P2A__County__c
        * * Display Name: P2A__County __c
        * * SQL Data Type: nvarchar(MAX)`),
    P2A__Federal_House_District__c: z.string().nullable().describe(`
        * * Field Name: P2A__Federal_House_District__c
        * * Display Name: P2A__Federal _House _District __c
        * * SQL Data Type: nvarchar(MAX)`),
    P2A__State_House_District__c: z.string().nullable().describe(`
        * * Field Name: P2A__State_House_District__c
        * * Display Name: P2A__State _House _District __c
        * * SQL Data Type: nvarchar(MAX)`),
    P2A__State_Senate_District__c: z.string().nullable().describe(`
        * * Field Name: P2A__State_Senate_District__c
        * * Display Name: P2A__State _Senate _District __c
        * * SQL Data Type: nvarchar(MAX)`),
    P2A__Synced__c: z.boolean().nullable().describe(`
        * * Field Name: P2A__Synced__c
        * * Display Name: P2A__Synced __c
        * * SQL Data Type: bit`),
    DESKSCMT__Desk_Migrated_Account__c: z.boolean().nullable().describe(`
        * * Field Name: DESKSCMT__Desk_Migrated_Account__c
        * * Display Name: DESKSCMT__Desk _Migrated _Account __c
        * * SQL Data Type: bit`),
    Desk_Id__c: z.number().nullable().describe(`
        * * Field Name: Desk_Id__c
        * * Display Name: Desk _Id __c
        * * SQL Data Type: decimal(18, 0)`),
    NU__IsMemberFlag__c: z.boolean().nullable().describe(`
        * * Field Name: NU__IsMemberFlag__c
        * * Display Name: NU__Is Member Flag __c
        * * SQL Data Type: bit`),
    Field_Rep_Number__c: z.string().nullable().describe(`
        * * Field Name: Field_Rep_Number__c
        * * Display Name: Field _Rep _Number __c
        * * SQL Data Type: nvarchar(MAX)`),
    No_DocuSign__c: z.boolean().nullable().describe(`
        * * Field Name: No_DocuSign__c
        * * Display Name: No _Docu Sign __c
        * * SQL Data Type: bit`),
    DocuSignCurrentBuilding__c: z.string().nullable().describe(`
        * * Field Name: DocuSignCurrentBuilding__c
        * * Display Name: Docu Sign Current Building __c
        * * SQL Data Type: nvarchar(MAX)`),
    bg_Docusign_Job__c: z.string().nullable().describe(`
        * * Field Name: bg_Docusign_Job__c
        * * Display Name: bg _Docusign _Job __c
        * * SQL Data Type: nvarchar(MAX)`),
    envelope_event__c: z.string().nullable().describe(`
        * * Field Name: envelope_event__c
        * * Display Name: envelope _event __c
        * * SQL Data Type: nvarchar(MAX)`),
    envelope_id__c: z.string().nullable().describe(`
        * * Field Name: envelope_id__c
        * * Display Name: envelope _id __c
        * * SQL Data Type: nvarchar(MAX)`),
    envelope_resent_date_time__c: z.date().nullable().describe(`
        * * Field Name: envelope_resent_date_time__c
        * * Display Name: envelope _resent _date _time __c
        * * SQL Data Type: datetimeoffset`),
    envelope_sent_date_time__c: z.date().nullable().describe(`
        * * Field Name: envelope_sent_date_time__c
        * * Display Name: envelope _sent _date _time __c
        * * SQL Data Type: datetimeoffset`),
    envelope_status_retrieval_datetime__c: z.date().nullable().describe(`
        * * Field Name: envelope_status_retrieval_datetime__c
        * * Display Name: envelope _status _retrieval _datetime __c
        * * SQL Data Type: datetimeoffset`),
    envelope_status_value__c: z.string().nullable().describe(`
        * * Field Name: envelope_status_value__c
        * * Display Name: envelope _status _value __c
        * * SQL Data Type: nvarchar(MAX)`),
    envelope_template_id__c: z.string().nullable().describe(`
        * * Field Name: envelope_template_id__c
        * * Display Name: envelope _template _id __c
        * * SQL Data Type: nvarchar(MAX)`),
    Envelope_Email_Body__c: z.string().nullable().describe(`
        * * Field Name: Envelope_Email_Body__c
        * * Display Name: Envelope _Email _Body __c
        * * SQL Data Type: nvarchar(MAX)`),
    Envelope_Email_Subject_Line__c: z.string().nullable().describe(`
        * * Field Name: Envelope_Email_Subject_Line__c
        * * Display Name: Envelope _Email _Subject _Line __c
        * * SQL Data Type: nvarchar(MAX)`),
    Resigned__c: z.boolean().nullable().describe(`
        * * Field Name: Resigned__c
        * * Display Name: Resigned __c
        * * SQL Data Type: bit`),
    Membership_Dues__c: z.number().nullable().describe(`
        * * Field Name: Membership_Dues__c
        * * Display Name: Membership _Dues __c
        * * SQL Data Type: decimal(18, 2)`),
    Reason_for_Resigning__c: z.string().nullable().describe(`
        * * Field Name: Reason_for_Resigning__c
        * * Display Name: Reason _for _Resigning __c
        * * SQL Data Type: nvarchar(MAX)`),
    DocuSignEndDate__c: z.date().nullable().describe(`
        * * Field Name: DocuSignEndDate__c
        * * Display Name: Docu Sign End Date __c
        * * SQL Data Type: datetimeoffset`),
    Paper_Renewals_Sent__c: z.date().nullable().describe(`
        * * Field Name: Paper_Renewals_Sent__c
        * * Display Name: Paper _Renewals _Sent __c
        * * SQL Data Type: datetimeoffset`),
    DocuSign_Completed_List_Sent__c: z.date().nullable().describe(`
        * * Field Name: DocuSign_Completed_List_Sent__c
        * * Display Name: Docu Sign _Completed _List _Sent __c
        * * SQL Data Type: datetimeoffset`),
    Schedule__c: z.string().nullable().describe(`
        * * Field Name: Schedule__c
        * * Display Name: Schedule __c
        * * SQL Data Type: nvarchar(MAX)`),
    Schedule_Type__c: z.string().nullable().describe(`
        * * Field Name: Schedule_Type__c
        * * Display Name: Schedule _Type __c
        * * SQL Data Type: nvarchar(MAX)`),
    Schedule_Stage__c: z.string().nullable().describe(`
        * * Field Name: Schedule_Stage__c
        * * Display Name: Schedule _Stage __c
        * * SQL Data Type: nvarchar(MAX)`),
    Schedule_Start_Date__c: z.date().nullable().describe(`
        * * Field Name: Schedule_Start_Date__c
        * * Display Name: Schedule _Start _Date __c
        * * SQL Data Type: datetimeoffset`),
    Schedule_End_Date__c: z.date().nullable().describe(`
        * * Field Name: Schedule_End_Date__c
        * * Display Name: Schedule _End _Date __c
        * * SQL Data Type: datetimeoffset`),
    DocuSign_Status__c: z.string().nullable().describe(`
        * * Field Name: DocuSign_Status__c
        * * Display Name: Docu Sign _Status __c
        * * SQL Data Type: nvarchar(MAX)`),
    Membership_Pending__c: z.boolean().nullable().describe(`
        * * Field Name: Membership_Pending__c
        * * Display Name: Membership _Pending __c
        * * SQL Data Type: bit`),
    CTA_Officers_Recorded__c: z.date().nullable().describe(`
        * * Field Name: CTA_Officers_Recorded__c
        * * Display Name: CTA_Officers _Recorded __c
        * * SQL Data Type: datetimeoffset`),
    Duplicate_Key_Fname_DOB_Zip_Addr__c: z.string().nullable().describe(`
        * * Field Name: Duplicate_Key_Fname_DOB_Zip_Addr__c
        * * Display Name: Duplicate _Key _Fname _DOB_Zip _Addr __c
        * * SQL Data Type: nvarchar(MAX)`),
    Duplicate_Key_fname_DOB_Last4__c: z.string().nullable().describe(`
        * * Field Name: Duplicate_Key_fname_DOB_Last4__c
        * * Display Name: Duplicate _Key _fname _DOB_Last 4__c
        * * SQL Data Type: nvarchar(MAX)`),
    Duplicate_Key_fname_DOB_Last4_formula__c: z.string().nullable().describe(`
        * * Field Name: Duplicate_Key_fname_DOB_Last4_formula__c
        * * Display Name: Duplicate _Key _fname _DOB_Last 4_formula __c
        * * SQL Data Type: nvarchar(MAX)`),
    Duplicate_Key_fname_DOB_Zip__c: z.string().nullable().describe(`
        * * Field Name: Duplicate_Key_fname_DOB_Zip__c
        * * Display Name: Duplicate _Key _fname _DOB_Zip __c
        * * SQL Data Type: nvarchar(MAX)`),
    Duplicate_Key_fname_DOB__c: z.string().nullable().describe(`
        * * Field Name: Duplicate_Key_fname_DOB__c
        * * Display Name: Duplicate _Key _fname _DOB__c
        * * SQL Data Type: nvarchar(MAX)`),
    Duplicate_Key_fname_Last4_Zip__c: z.string().nullable().describe(`
        * * Field Name: Duplicate_Key_fname_Last4_Zip__c
        * * Display Name: Duplicate _Key _fname _Last 4_Zip __c
        * * SQL Data Type: nvarchar(MAX)`),
    Duplicate_Key_fname_Last4__c: z.string().nullable().describe(`
        * * Field Name: Duplicate_Key_fname_Last4__c
        * * Display Name: Duplicate _Key _fname _Last 4__c
        * * SQL Data Type: nvarchar(MAX)`),
    Duplicate_Key_fname_temp__c: z.string().nullable().describe(`
        * * Field Name: Duplicate_Key_fname_temp__c
        * * Display Name: Duplicate _Key _fname _temp __c
        * * SQL Data Type: nvarchar(MAX)`),
    Resolve_Concurrent_Membership_B4_Merging__c: z.string().nullable().describe(`
        * * Field Name: Resolve_Concurrent_Membership_B4_Merging__c
        * * Display Name: Resolve _Concurrent _Membership _B4_Merging __c
        * * SQL Data Type: nvarchar(MAX)`),
    fname__c: z.string().nullable().describe(`
        * * Field Name: fname__c
        * * Display Name: fname __c
        * * SQL Data Type: nvarchar(MAX)`),
    is_master_Fname_DOB_Last4SSN__c: z.boolean().nullable().describe(`
        * * Field Name: is_master_Fname_DOB_Last4SSN__c
        * * Display Name: is _master _Fname _DOB_Last 4SSN__c
        * * SQL Data Type: bit`),
    is_master_Fname_DOB_Zip_AddrOrPhone__c: z.boolean().nullable().describe(`
        * * Field Name: is_master_Fname_DOB_Zip_AddrOrPhone__c
        * * Display Name: is _master _Fname _DOB_Zip _Addr Or Phone __c
        * * SQL Data Type: bit`),
    is_master_Fname_DOB_Zip_Addr__c: z.boolean().nullable().describe(`
        * * Field Name: is_master_Fname_DOB_Zip_Addr__c
        * * Display Name: is _master _Fname _DOB_Zip _Addr __c
        * * SQL Data Type: bit`),
    is_master_Fname_DOB_Zip__c: z.boolean().nullable().describe(`
        * * Field Name: is_master_Fname_DOB_Zip__c
        * * Display Name: is _master _Fname _DOB_Zip __c
        * * SQL Data Type: bit`),
    is_master_Fname_Last4SSN_Zip__c: z.boolean().nullable().describe(`
        * * Field Name: is_master_Fname_Last4SSN_Zip__c
        * * Display Name: is _master _Fname _Last 4SSN_Zip __c
        * * SQL Data Type: bit`),
    masterID_ref_fname_DOB_Last4__c: z.string().nullable().describe(`
        * * Field Name: masterID_ref_fname_DOB_Last4__c
        * * Display Name: master ID_ref _fname _DOB_Last 4__c
        * * SQL Data Type: nvarchar(MAX)`),
    masterID_ref_fname_DOB_Zip_AddrOrPhone__c: z.string().nullable().describe(`
        * * Field Name: masterID_ref_fname_DOB_Zip_AddrOrPhone__c
        * * Display Name: master ID_ref _fname _DOB_Zip _Addr Or Phone __c
        * * SQL Data Type: nvarchar(MAX)`),
    masterID_ref_fname_DOB_Zip_Addr__c: z.string().nullable().describe(`
        * * Field Name: masterID_ref_fname_DOB_Zip_Addr__c
        * * Display Name: master ID_ref _fname _DOB_Zip _Addr __c
        * * SQL Data Type: nvarchar(MAX)`),
    masterID_ref_fname_DOB_Zip__c: z.string().nullable().describe(`
        * * Field Name: masterID_ref_fname_DOB_Zip__c
        * * Display Name: master ID_ref _fname _DOB_Zip __c
        * * SQL Data Type: nvarchar(MAX)`),
    masterID_ref_fname_Last4_Zip__c: z.string().nullable().describe(`
        * * Field Name: masterID_ref_fname_Last4_Zip__c
        * * Display Name: master ID_ref _fname _Last 4_Zip __c
        * * SQL Data Type: nvarchar(MAX)`),
    matching_key_Fname_DOB_Last4SSN__c: z.string().nullable().describe(`
        * * Field Name: matching_key_Fname_DOB_Last4SSN__c
        * * Display Name: matching _key _Fname _DOB_Last 4SSN__c
        * * SQL Data Type: nvarchar(MAX)`),
    matching_key_Fname_DOB_Zip__c: z.string().nullable().describe(`
        * * Field Name: matching_key_Fname_DOB_Zip__c
        * * Display Name: matching _key _Fname _DOB_Zip __c
        * * SQL Data Type: nvarchar(MAX)`),
    matching_key_Fname_Last4SSN_Zip__c: z.string().nullable().describe(`
        * * Field Name: matching_key_Fname_Last4SSN_Zip__c
        * * Display Name: matching _key _Fname _Last 4SSN_Zip __c
        * * SQL Data Type: nvarchar(MAX)`),
    Number_of_Payroll_Payments__c: z.number().nullable().describe(`
        * * Field Name: Number_of_Payroll_Payments__c
        * * Display Name: Number _of _Payroll _Payments __c
        * * SQL Data Type: decimal(2, 0)`),
    New_Building_from_DocuSign__c: z.string().nullable().describe(`
        * * Field Name: New_Building_from_DocuSign__c
        * * Display Name: New _Building _from _Docu Sign __c
        * * SQL Data Type: nvarchar(MAX)`),
    qtr1_cta_dues_processed__c: z.boolean().nullable().describe(`
        * * Field Name: qtr1_cta_dues_processed__c
        * * Display Name: qtr 1_cta _dues _processed __c
        * * SQL Data Type: bit`),
    qtr1_dues_pending_pmnt_to_institution__c: z.number().nullable().describe(`
        * * Field Name: qtr1_dues_pending_pmnt_to_institution__c
        * * Display Name: qtr 1_dues _pending _pmnt _to _institution __c
        * * SQL Data Type: decimal(18, 2)`),
    qtr1_dues_processed_pmnt_to_institution__c: z.number().nullable().describe(`
        * * Field Name: qtr1_dues_processed_pmnt_to_institution__c
        * * Display Name: qtr 1_dues _processed _pmnt _to _institution __c
        * * SQL Data Type: decimal(18, 2)`),
    qtr1_new_dues_to_pay_to_institution__c: z.number().nullable().describe(`
        * * Field Name: qtr1_new_dues_to_pay_to_institution__c
        * * Display Name: qtr 1_new _dues _to _pay _to _institution __c
        * * SQL Data Type: decimal(18, 2)`),
    qtr2_cta_dues_processed__c: z.boolean().nullable().describe(`
        * * Field Name: qtr2_cta_dues_processed__c
        * * Display Name: qtr 2_cta _dues _processed __c
        * * SQL Data Type: bit`),
    qtr2_dues_pending_pmnt_to_institution__c: z.number().nullable().describe(`
        * * Field Name: qtr2_dues_pending_pmnt_to_institution__c
        * * Display Name: qtr 2_dues _pending _pmnt _to _institution __c
        * * SQL Data Type: decimal(18, 2)`),
    qtr2_dues_processed_pmnt_to_institution__c: z.number().nullable().describe(`
        * * Field Name: qtr2_dues_processed_pmnt_to_institution__c
        * * Display Name: qtr 2_dues _processed _pmnt _to _institution __c
        * * SQL Data Type: decimal(18, 2)`),
    qtr2_new_dues_to_pay_to_institution__c: z.number().nullable().describe(`
        * * Field Name: qtr2_new_dues_to_pay_to_institution__c
        * * Display Name: qtr 2_new _dues _to _pay _to _institution __c
        * * SQL Data Type: decimal(18, 2)`),
    qtr3_cta_dues_processed__c: z.boolean().nullable().describe(`
        * * Field Name: qtr3_cta_dues_processed__c
        * * Display Name: qtr 3_cta _dues _processed __c
        * * SQL Data Type: bit`),
    qtr3_dues_pending_pmnt_to_institution__c: z.number().nullable().describe(`
        * * Field Name: qtr3_dues_pending_pmnt_to_institution__c
        * * Display Name: qtr 3_dues _pending _pmnt _to _institution __c
        * * SQL Data Type: decimal(18, 2)`),
    qtr3_dues_processed_pmnt_to_institution__c: z.number().nullable().describe(`
        * * Field Name: qtr3_dues_processed_pmnt_to_institution__c
        * * Display Name: qtr 3_dues _processed _pmnt _to _institution __c
        * * SQL Data Type: decimal(18, 2)`),
    qtr3_new_dues_to_pay_to_institution__c: z.number().nullable().describe(`
        * * Field Name: qtr3_new_dues_to_pay_to_institution__c
        * * Display Name: qtr 3_new _dues _to _pay _to _institution __c
        * * SQL Data Type: decimal(18, 2)`),
    qtr4_cta_dues_processed__c: z.boolean().nullable().describe(`
        * * Field Name: qtr4_cta_dues_processed__c
        * * Display Name: qtr 4_cta _dues _processed __c
        * * SQL Data Type: bit`),
    qtr4_dues_pending_pmnt_to_institution__c: z.number().nullable().describe(`
        * * Field Name: qtr4_dues_pending_pmnt_to_institution__c
        * * Display Name: qtr 4_dues _pending _pmnt _to _institution __c
        * * SQL Data Type: decimal(18, 2)`),
    qtr4_dues_processed_pmnt_to_institution__c: z.number().nullable().describe(`
        * * Field Name: qtr4_dues_processed_pmnt_to_institution__c
        * * Display Name: qtr 4_dues _processed _pmnt _to _institution __c
        * * SQL Data Type: decimal(18, 2)`),
    qtr4_new_dues_to_pay_to_institution__c: z.number().nullable().describe(`
        * * Field Name: qtr4_new_dues_to_pay_to_institution__c
        * * Display Name: qtr 4_new _dues _to _pay _to _institution __c
        * * SQL Data Type: decimal(18, 2)`),
    txs_dues_pending_pmnt_to_institution__c: z.number().nullable().describe(`
        * * Field Name: txs_dues_pending_pmnt_to_institution__c
        * * Display Name: txs _dues _pending _pmnt _to _institution __c
        * * SQL Data Type: decimal(18, 2)`),
    txs_dues_processed_pmnt_to_institution__c: z.number().nullable().describe(`
        * * Field Name: txs_dues_processed_pmnt_to_institution__c
        * * Display Name: txs _dues _processed _pmnt _to _institution __c
        * * SQL Data Type: decimal(18, 2)`),
    DocuSign_Entered_CTA_Dues__c: z.number().nullable().describe(`
        * * Field Name: DocuSign_Entered_CTA_Dues__c
        * * Display Name: Docu Sign _Entered _CTA_Dues __c
        * * SQL Data Type: decimal(7, 2)`),
    Highest_Level_of_Education__c: z.string().nullable().describe(`
        * * Field Name: Highest_Level_of_Education__c
        * * Display Name: Highest _Level _of _Education __c
        * * SQL Data Type: nvarchar(MAX)`),
    Anticipated_Retirement_Year__c: z.string().nullable().describe(`
        * * Field Name: Anticipated_Retirement_Year__c
        * * Display Name: Anticipated _Retirement _Year __c
        * * SQL Data Type: nvarchar(MAX)`),
    Associate_Job_Category__c: z.string().nullable().describe(`
        * * Field Name: Associate_Job_Category__c
        * * Display Name: Associate _Job _Category __c
        * * SQL Data Type: nvarchar(MAX)`),
    Billing_Address_Override__c: z.boolean().nullable().describe(`
        * * Field Name: Billing_Address_Override__c
        * * Display Name: Billing _Address _Override __c
        * * SQL Data Type: bit`),
    Mailing_Address_Override__c: z.boolean().nullable().describe(`
        * * Field Name: Mailing_Address_Override__c
        * * Display Name: Mailing _Address _Override __c
        * * SQL Data Type: bit`),
    Exempt_from_Book_Studies__c: z.boolean().nullable().describe(`
        * * Field Name: Exempt_from_Book_Studies__c
        * * Display Name: Exempt _from _Book _Studies __c
        * * SQL Data Type: bit`),
    Dues_Balance__c: z.number().nullable().describe(`
        * * Field Name: Dues_Balance__c
        * * Display Name: Dues _Balance __c
        * * SQL Data Type: decimal(18, 2)`),
    Paying_CTA_Dues_Thru_MSTA__c: z.string().nullable().describe(`
        * * Field Name: Paying_CTA_Dues_Thru_MSTA__c
        * * Display Name: Paying _CTA_Dues _Thru _MSTA__c
        * * SQL Data Type: nvarchar(MAX)`),
    Simple_Pay_Type__c: z.string().nullable().describe(`
        * * Field Name: Simple_Pay_Type__c
        * * Display Name: Simple _Pay _Type __c
        * * SQL Data Type: nvarchar(MAX)`),
    ConsentItem__c: z.string().nullable().describe(`
        * * Field Name: ConsentItem__c
        * * Display Name: Consent Item __c
        * * SQL Data Type: nvarchar(MAX)`),
    UltimateId__c: z.string().nullable().describe(`
        * * Field Name: UltimateId__c
        * * Display Name: Ultimate Id __c
        * * SQL Data Type: nvarchar(MAX)`),
    AllowPayroll__c: z.boolean().nullable().describe(`
        * * Field Name: AllowPayroll__c
        * * Display Name: Allow Payroll __c
        * * SQL Data Type: bit`),
    Number_of_Payroll_Deductions__c: z.number().nullable().describe(`
        * * Field Name: Number_of_Payroll_Deductions__c
        * * Display Name: Number _of _Payroll _Deductions __c
        * * SQL Data Type: decimal(2, 0)`),
    Home_Phone_Type__c: z.string().nullable().describe(`
        * * Field Name: Home_Phone_Type__c
        * * Display Name: Home _Phone _Type __c
        * * SQL Data Type: nvarchar(MAX)`),
    Mobile_Type__c: z.string().nullable().describe(`
        * * Field Name: Mobile_Type__c
        * * Display Name: Mobile _Type __c
        * * SQL Data Type: nvarchar(MAX)`),
    namz__AssignmentRule__c: z.string().nullable().describe(`
        * * Field Name: namz__AssignmentRule__c
        * * Display Name: namz __Assignment Rule __c
        * * SQL Data Type: nvarchar(MAX)`),
    namz__PrimaryAffiliation__c: z.string().nullable().describe(`
        * * Field Name: namz__PrimaryAffiliation__c
        * * Display Name: namz __Primary Affiliation __c
        * * SQL Data Type: nvarchar(MAX)`),
    Known_Bad_Home_Phone__c: z.boolean().nullable().describe(`
        * * Field Name: Known_Bad_Home_Phone__c
        * * Display Name: Known _Bad _Home _Phone __c
        * * SQL Data Type: bit`),
    Known_Bad_Mobile__c: z.boolean().nullable().describe(`
        * * Field Name: Known_Bad_Mobile__c
        * * Display Name: Known _Bad _Mobile __c
        * * SQL Data Type: bit`),
    Home_Phone_Verified__c: z.date().nullable().describe(`
        * * Field Name: Home_Phone_Verified__c
        * * Display Name: Home _Phone _Verified __c
        * * SQL Data Type: datetimeoffset`),
    Mobile_Phone_Verified__c: z.date().nullable().describe(`
        * * Field Name: Mobile_Phone_Verified__c
        * * Display Name: Mobile _Phone _Verified __c
        * * SQL Data Type: datetimeoffset`),
    NU__ExcludeFromAffiliationSearch__c: z.boolean().nullable().describe(`
        * * Field Name: NU__ExcludeFromAffiliationSearch__c
        * * Display Name: NU__Exclude From Affiliation Search __c
        * * SQL Data Type: bit`),
    Home_Phone_Is_Valid__c: z.boolean().nullable().describe(`
        * * Field Name: Home_Phone_Is_Valid__c
        * * Display Name: Home _Phone _Is _Valid __c
        * * SQL Data Type: bit`),
    Mobile_Is_Valid__c: z.boolean().nullable().describe(`
        * * Field Name: Mobile_Is_Valid__c
        * * Display Name: Mobile _Is _Valid __c
        * * SQL Data Type: bit`),
    HomePhoneVerifiedCurrFiscal__c: z.boolean().nullable().describe(`
        * * Field Name: HomePhoneVerifiedCurrFiscal__c
        * * Display Name: Home Phone Verified Curr Fiscal __c
        * * SQL Data Type: bit`),
    MobileVerifiedCurrFiscal__c: z.boolean().nullable().describe(`
        * * Field Name: MobileVerifiedCurrFiscal__c
        * * Display Name: Mobile Verified Curr Fiscal __c
        * * SQL Data Type: bit`),
    NU__ExternalID__pc: z.string().nullable().describe(`
        * * Field Name: NU__ExternalID__pc
        * * Display Name: NU__External ID__pc
        * * SQL Data Type: nvarchar(MAX)`),
    ET_Field_Rep__pc: z.string().nullable().describe(`
        * * Field Name: ET_Field_Rep__pc
        * * Display Name: ET_Field _Rep __pc
        * * SQL Data Type: nvarchar(MAX)`),
    Deskcom__twitter_username__pc: z.string().nullable().describe(`
        * * Field Name: Deskcom__twitter_username__pc
        * * Display Name: Deskcom __twitter _username __pc
        * * SQL Data Type: nvarchar(MAX)`),
    e4sf__Engage_Address_City__pc: z.string().nullable().describe(`
        * * Field Name: e4sf__Engage_Address_City__pc
        * * Display Name: e 4sf __Engage _Address _City __pc
        * * SQL Data Type: nvarchar(MAX)`),
    e4sf__Engage_Address_Country__pc: z.string().nullable().describe(`
        * * Field Name: e4sf__Engage_Address_Country__pc
        * * Display Name: e 4sf __Engage _Address _Country __pc
        * * SQL Data Type: nvarchar(MAX)`),
    e4sf__Engage_Address_PostalCode__pc: z.string().nullable().describe(`
        * * Field Name: e4sf__Engage_Address_PostalCode__pc
        * * Display Name: e 4sf __Engage _Address _Postal Code __pc
        * * SQL Data Type: nvarchar(MAX)`),
    e4sf__Engage_Address_State__pc: z.string().nullable().describe(`
        * * Field Name: e4sf__Engage_Address_State__pc
        * * Display Name: e 4sf __Engage _Address _State __pc
        * * SQL Data Type: nvarchar(MAX)`),
    e4sf__Engage_Address_Street__pc: z.string().nullable().describe(`
        * * Field Name: e4sf__Engage_Address_Street__pc
        * * Display Name: e 4sf __Engage _Address _Street __pc
        * * SQL Data Type: nvarchar(MAX)`),
    e4sf__Engage_Batch_Id__pc: z.string().nullable().describe(`
        * * Field Name: e4sf__Engage_Batch_Id__pc
        * * Display Name: e 4sf __Engage _Batch _Id __pc
        * * SQL Data Type: nvarchar(MAX)`),
    e4sf__Engage_Date_Last_Sync__pc: z.date().nullable().describe(`
        * * Field Name: e4sf__Engage_Date_Last_Sync__pc
        * * Display Name: e 4sf __Engage _Date _Last _Sync __pc
        * * SQL Data Type: datetimeoffset`),
    e4sf__Engage_Ext_Id__pc: z.string().nullable().describe(`
        * * Field Name: e4sf__Engage_Ext_Id__pc
        * * Display Name: e 4sf __Engage _Ext _Id __pc
        * * SQL Data Type: nvarchar(MAX)`),
    e4sf__Engage_Federal_District_Lower_Chamber__pc: z.string().nullable().describe(`
        * * Field Name: e4sf__Engage_Federal_District_Lower_Chamber__pc
        * * Display Name: e 4sf __Engage _Federal _District _Lower _Chamber __pc
        * * SQL Data Type: nvarchar(MAX)`),
    e4sf__Engage_Federal_District_Upper_Chamber__pc: z.string().nullable().describe(`
        * * Field Name: e4sf__Engage_Federal_District_Upper_Chamber__pc
        * * Display Name: e 4sf __Engage _Federal _District _Upper _Chamber __pc
        * * SQL Data Type: nvarchar(MAX)`),
    e4sf__Engage_Is_Advocate__pc: z.boolean().nullable().describe(`
        * * Field Name: e4sf__Engage_Is_Advocate__pc
        * * Display Name: e 4sf __Engage _Is _Advocate __pc
        * * SQL Data Type: bit`),
    e4sf__Engage_Never_Sync_To_Engage__pc: z.boolean().nullable().describe(`
        * * Field Name: e4sf__Engage_Never_Sync_To_Engage__pc
        * * Display Name: e 4sf __Engage _Never _Sync _To _Engage __pc
        * * SQL Data Type: bit`),
    e4sf__Engage_Opt_Out__pc: z.boolean().nullable().describe(`
        * * Field Name: e4sf__Engage_Opt_Out__pc
        * * Display Name: e 4sf __Engage _Opt _Out __pc
        * * SQL Data Type: bit`),
    e4sf__Engage_Phone__pc: z.string().nullable().describe(`
        * * Field Name: e4sf__Engage_Phone__pc
        * * Display Name: e 4sf __Engage _Phone __pc
        * * SQL Data Type: nvarchar(MAX)`),
    e4sf__Engage_State_District_Lower_Chamber__pc: z.string().nullable().describe(`
        * * Field Name: e4sf__Engage_State_District_Lower_Chamber__pc
        * * Display Name: e 4sf __Engage _State _District _Lower _Chamber __pc
        * * SQL Data Type: nvarchar(MAX)`),
    e4sf__Engage_State_District_Upper_Chamber__pc: z.string().nullable().describe(`
        * * Field Name: e4sf__Engage_State_District_Upper_Chamber__pc
        * * Display Name: e 4sf __Engage _State _District _Upper _Chamber __pc
        * * SQL Data Type: nvarchar(MAX)`),
    geopointe__Geocode__pc: z.string().nullable().describe(`
        * * Field Name: geopointe__Geocode__pc
        * * Display Name: geopointe __Geocode __pc
        * * SQL Data Type: nvarchar(MAX)`),
    rrpu__Alert_Message__pc: z.string().nullable().describe(`
        * * Field Name: rrpu__Alert_Message__pc
        * * Display Name: rrpu __Alert _Message __pc
        * * SQL Data Type: nvarchar(MAX)`),
    CloudingoAgent__CES__pc: z.number().nullable().describe(`
        * * Field Name: CloudingoAgent__CES__pc
        * * Display Name: Cloudingo Agent __CES__pc
        * * SQL Data Type: decimal(18, 0)`),
    CloudingoAgent__MAR__pc: z.string().nullable().describe(`
        * * Field Name: CloudingoAgent__MAR__pc
        * * Display Name: Cloudingo Agent __MAR__pc
        * * SQL Data Type: nvarchar(MAX)`),
    CloudingoAgent__MAS__pc: z.number().nullable().describe(`
        * * Field Name: CloudingoAgent__MAS__pc
        * * Display Name: Cloudingo Agent __MAS__pc
        * * SQL Data Type: decimal(18, 0)`),
    CloudingoAgent__MAV__pc: z.string().nullable().describe(`
        * * Field Name: CloudingoAgent__MAV__pc
        * * Display Name: Cloudingo Agent __MAV__pc
        * * SQL Data Type: nvarchar(MAX)`),
    CloudingoAgent__MRDI__pc: z.string().nullable().describe(`
        * * Field Name: CloudingoAgent__MRDI__pc
        * * Display Name: Cloudingo Agent __MRDI__pc
        * * SQL Data Type: nvarchar(MAX)`),
    CloudingoAgent__MTZ__pc: z.string().nullable().describe(`
        * * Field Name: CloudingoAgent__MTZ__pc
        * * Display Name: Cloudingo Agent __MTZ__pc
        * * SQL Data Type: nvarchar(MAX)`),
    CloudingoAgent__OAR__pc: z.string().nullable().describe(`
        * * Field Name: CloudingoAgent__OAR__pc
        * * Display Name: Cloudingo Agent __OAR__pc
        * * SQL Data Type: nvarchar(MAX)`),
    CloudingoAgent__OAS__pc: z.number().nullable().describe(`
        * * Field Name: CloudingoAgent__OAS__pc
        * * Display Name: Cloudingo Agent __OAS__pc
        * * SQL Data Type: decimal(18, 0)`),
    CloudingoAgent__OAV__pc: z.string().nullable().describe(`
        * * Field Name: CloudingoAgent__OAV__pc
        * * Display Name: Cloudingo Agent __OAV__pc
        * * SQL Data Type: nvarchar(MAX)`),
    CloudingoAgent__ORDI__pc: z.string().nullable().describe(`
        * * Field Name: CloudingoAgent__ORDI__pc
        * * Display Name: Cloudingo Agent __ORDI__pc
        * * SQL Data Type: nvarchar(MAX)`),
    CloudingoAgent__OTZ__pc: z.string().nullable().describe(`
        * * Field Name: CloudingoAgent__OTZ__pc
        * * Display Name: Cloudingo Agent __OTZ__pc
        * * SQL Data Type: nvarchar(MAX)`),
    NC_DPP__Anonymize__pc: z.boolean().nullable().describe(`
        * * Field Name: NC_DPP__Anonymize__pc
        * * Display Name: NC_DPP__Anonymize __pc
        * * SQL Data Type: bit`),
    NC_DPP__Consented__pc: z.boolean().nullable().describe(`
        * * Field Name: NC_DPP__Consented__pc
        * * Display Name: NC_DPP__Consented __pc
        * * SQL Data Type: bit`),
    NC_DPP__LastConsentedDate__pc: z.date().nullable().describe(`
        * * Field Name: NC_DPP__LastConsentedDate__pc
        * * Display Name: NC_DPP__Last Consented Date __pc
        * * SQL Data Type: datetimeoffset`),
    NU__Biography__pc: z.string().nullable().describe(`
        * * Field Name: NU__Biography__pc
        * * Display Name: NU__Biography __pc
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Degrees__pc: z.string().nullable().describe(`
        * * Field Name: NU__Degrees__pc
        * * Display Name: NU__Degrees __pc
        * * SQL Data Type: nvarchar(MAX)`),
    NU__DoctoralInstitution__pc: z.string().nullable().describe(`
        * * Field Name: NU__DoctoralInstitution__pc
        * * Display Name: NU__Doctoral Institution __pc
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Expertise__pc: z.string().nullable().describe(`
        * * Field Name: NU__Expertise__pc
        * * Display Name: NU__Expertise __pc
        * * SQL Data Type: nvarchar(MAX)`),
    NU__GraduateInstitution__pc: z.string().nullable().describe(`
        * * Field Name: NU__GraduateInstitution__pc
        * * Display Name: NU__Graduate Institution __pc
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Interests__pc: z.string().nullable().describe(`
        * * Field Name: NU__Interests__pc
        * * Display Name: NU__Interests __pc
        * * SQL Data Type: nvarchar(MAX)`),
    NU__UndergraduateInstitution__pc: z.string().nullable().describe(`
        * * Field Name: NU__UndergraduateInstitution__pc
        * * Display Name: NU__Undergraduate Institution __pc
        * * SQL Data Type: nvarchar(MAX)`),
    et4ae5__HasOptedOutOfMobile__pc: z.boolean().nullable().describe(`
        * * Field Name: et4ae5__HasOptedOutOfMobile__pc
        * * Display Name: et 4ae 5__Has Opted Out Of Mobile __pc
        * * SQL Data Type: bit`),
    et4ae5__Mobile_Country_Code__pc: z.string().nullable().describe(`
        * * Field Name: et4ae5__Mobile_Country_Code__pc
        * * Display Name: et 4ae 5__Mobile _Country _Code __pc
        * * SQL Data Type: nvarchar(MAX)`),
    qualtrics__Informed_Consent_Date__pc: z.date().nullable().describe(`
        * * Field Name: qualtrics__Informed_Consent_Date__pc
        * * Display Name: qualtrics __Informed _Consent _Date __pc
        * * SQL Data Type: datetimeoffset`),
    qualtrics__Informed_Consent__pc: z.boolean().nullable().describe(`
        * * Field Name: qualtrics__Informed_Consent__pc
        * * Display Name: qualtrics __Informed _Consent __pc
        * * SQL Data Type: bit`),
    qualtrics__Last_Survey_Invitation__pc: z.date().nullable().describe(`
        * * Field Name: qualtrics__Last_Survey_Invitation__pc
        * * Display Name: qualtrics __Last _Survey _Invitation __pc
        * * SQL Data Type: datetimeoffset`),
    qualtrics__Last_Survey_Response__pc: z.date().nullable().describe(`
        * * Field Name: qualtrics__Last_Survey_Response__pc
        * * Display Name: qualtrics __Last _Survey _Response __pc
        * * SQL Data Type: datetimeoffset`),
    qualtrics__Net_Promoter_Score__pc: z.number().nullable().describe(`
        * * Field Name: qualtrics__Net_Promoter_Score__pc
        * * Display Name: qualtrics __Net _Promoter _Score __pc
        * * SQL Data Type: decimal(2, 0)`),
    is_eligible_for_SFMC_sync__pc: z.boolean().nullable().describe(`
        * * Field Name: is_eligible_for_SFMC_sync__pc
        * * Display Name: is _eligible _for _SFMC_sync __pc
        * * SQL Data Type: bit`),
    Long_Form_ID__pc: z.string().nullable().describe(`
        * * Field Name: Long_Form_ID__pc
        * * Display Name: Long _Form _ID__pc
        * * SQL Data Type: nvarchar(MAX)`),
    Institution__pc: z.string().nullable().describe(`
        * * Field Name: Institution__pc
        * * Display Name: Institution __pc
        * * SQL Data Type: nvarchar(MAX)`),
    Member__pc: z.string().nullable().describe(`
        * * Field Name: Member__pc
        * * Display Name: Member __pc
        * * SQL Data Type: nvarchar(MAX)`),
    Eligible_For_SFMC_Sync__pc: z.boolean().nullable().describe(`
        * * Field Name: Eligible_For_SFMC_Sync__pc
        * * Display Name: Eligible _For _SFMC_Sync __pc
        * * SQL Data Type: bit`),
    DESKSCMT__Desk_Customer_Id__pc: z.number().nullable().describe(`
        * * Field Name: DESKSCMT__Desk_Customer_Id__pc
        * * Display Name: DESKSCMT__Desk _Customer _Id __pc
        * * SQL Data Type: decimal(18, 0)`),
    DESKSCMT__Desk_Migrated_Contact__pc: z.boolean().nullable().describe(`
        * * Field Name: DESKSCMT__Desk_Migrated_Contact__pc
        * * Display Name: DESKSCMT__Desk _Migrated _Contact __pc
        * * SQL Data Type: bit`),
    title__pc: z.string().nullable().describe(`
        * * Field Name: title__pc
        * * Display Name: title __pc
        * * SQL Data Type: nvarchar(MAX)`),
    created_at__pc: z.date().nullable().describe(`
        * * Field Name: created_at__pc
        * * Display Name: created _at __pc
        * * SQL Data Type: datetimeoffset`),
    updated_at__pc: z.date().nullable().describe(`
        * * Field Name: updated_at__pc
        * * Display Name: updated _at __pc
        * * SQL Data Type: datetimeoffset`),
    P2A__Advocate_ID__pc: z.number().nullable().describe(`
        * * Field Name: P2A__Advocate_ID__pc
        * * Display Name: P2A__Advocate _ID__pc
        * * SQL Data Type: decimal(18, 0)`),
    P2A__City_District__pc: z.string().nullable().describe(`
        * * Field Name: P2A__City_District__pc
        * * Display Name: P2A__City _District __pc
        * * SQL Data Type: nvarchar(MAX)`),
    P2A__County__pc: z.string().nullable().describe(`
        * * Field Name: P2A__County__pc
        * * Display Name: P2A__County __pc
        * * SQL Data Type: nvarchar(MAX)`),
    P2A__Federal_House_District__pc: z.string().nullable().describe(`
        * * Field Name: P2A__Federal_House_District__pc
        * * Display Name: P2A__Federal _House _District __pc
        * * SQL Data Type: nvarchar(MAX)`),
    P2A__Phone2Action_Email_Optin__pc: z.boolean().nullable().describe(`
        * * Field Name: P2A__Phone2Action_Email_Optin__pc
        * * Display Name: P2A__Phone 2Action _Email _Optin __pc
        * * SQL Data Type: bit`),
    P2A__State_House_District__pc: z.string().nullable().describe(`
        * * Field Name: P2A__State_House_District__pc
        * * Display Name: P2A__State _House _District __pc
        * * SQL Data Type: nvarchar(MAX)`),
    P2A__State_Senate_District__pc: z.string().nullable().describe(`
        * * Field Name: P2A__State_Senate_District__pc
        * * Display Name: P2A__State _Senate _District __pc
        * * SQL Data Type: nvarchar(MAX)`),
    P2A__Synced__pc: z.boolean().nullable().describe(`
        * * Field Name: P2A__Synced__pc
        * * Display Name: P2A__Synced __pc
        * * SQL Data Type: bit`),
    external_id__pc: z.string().nullable().describe(`
        * * Field Name: external_id__pc
        * * Display Name: external _id __pc
        * * SQL Data Type: nvarchar(MAX)`),
    background__pc: z.string().nullable().describe(`
        * * Field Name: background__pc
        * * Display Name: background __pc
        * * SQL Data Type: nvarchar(MAX)`),
    language__pc: z.string().nullable().describe(`
        * * Field Name: language__pc
        * * Display Name: language __pc
        * * SQL Data Type: nvarchar(MAX)`),
    access_private_portal__pc: z.boolean().nullable().describe(`
        * * Field Name: access_private_portal__pc
        * * Display Name: access _private _portal __pc
        * * SQL Data Type: bit`),
    access_company_cases__pc: z.boolean().nullable().describe(`
        * * Field Name: access_company_cases__pc
        * * Display Name: access _company _cases __pc
        * * SQL Data Type: bit`),
    Desk_Id__pc: z.number().nullable().describe(`
        * * Field Name: Desk_Id__pc
        * * Display Name: Desk _Id __pc
        * * SQL Data Type: decimal(18, 0)`),
    rcsfl__SMS_Number__pc: z.string().nullable().describe(`
        * * Field Name: rcsfl__SMS_Number__pc
        * * Display Name: rcsfl __SMS_Number __pc
        * * SQL Data Type: nvarchar(MAX)`),
    rcsfl__SendSMS__pc: z.string().nullable().describe(`
        * * Field Name: rcsfl__SendSMS__pc
        * * Display Name: rcsfl __Send SMS__pc
        * * SQL Data Type: nvarchar(MAX)`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Troubleshoot: z.string().nullable().describe(`
        * * Field Name: Troubleshoot
        * * Display Name: Troubleshoot
        * * SQL Data Type: nvarchar(50)`),
});

export type AccountEntityType = z.infer<typeof AccountSchema>;

/**
 * zod schema definition for the entity Activities
 */
export const ActivitySchema = z.object({
    ID: z.string().nullable().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier`),
    Activity: z.string().nullable().describe(`
        * * Field Name: Activity
        * * Display Name: Activity
        * * SQL Data Type: nvarchar(10)`),
    ActivityID: z.string().describe(`
        * * Field Name: ActivityID
        * * Display Name: Activity ID
        * * SQL Data Type: nvarchar(10)`),
    ActivityType: z.string().nullable().describe(`
        * * Field Name: ActivityType
        * * Display Name: Activity Type
        * * SQL Data Type: nvarchar(50)`),
    ActivityDate: z.date().nullable().describe(`
        * * Field Name: ActivityDate
        * * Display Name: Activity Date
        * * SQL Data Type: datetime`),
    ActivityLink: z.string().nullable().describe(`
        * * Field Name: ActivityLink
        * * Display Name: Activity Link
        * * SQL Data Type: nvarchar(MAX)`),
    CheckInID: z.string().nullable().describe(`
        * * Field Name: CheckInID
        * * Display Name: Check In ID
        * * SQL Data Type: nvarchar(10)`),
    ContactID: z.string().nullable().describe(`
        * * Field Name: ContactID
        * * Display Name: Contact ID
        * * SQL Data Type: nvarchar(10)`),
    ContactName: z.string().nullable().describe(`
        * * Field Name: ContactName
        * * Display Name: Contact Name
        * * SQL Data Type: nvarchar(100)`),
    ContactEmail: z.string().nullable().describe(`
        * * Field Name: ContactEmail
        * * Display Name: Contact Email
        * * SQL Data Type: nvarchar(100)`),
    ContactExternalID: z.string().nullable().describe(`
        * * Field Name: ContactExternalID
        * * Display Name: Contact External ID
        * * SQL Data Type: nvarchar(50)`),
    CampaignID: z.number().nullable().describe(`
        * * Field Name: CampaignID
        * * Display Name: Campaign ID
        * * SQL Data Type: int`),
    CampaignName: z.string().nullable().describe(`
        * * Field Name: CampaignName
        * * Display Name: Campaign Name
        * * SQL Data Type: nvarchar(500)`),
    CheckInNotificationID: z.string().nullable().describe(`
        * * Field Name: CheckInNotificationID
        * * Display Name: Check In Notification ID
        * * SQL Data Type: nvarchar(10)`),
    CheckInNotificationType: z.string().nullable().describe(`
        * * Field Name: CheckInNotificationType
        * * Display Name: Check In Notification Type
        * * SQL Data Type: nvarchar(50)`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type ActivityEntityType = z.infer<typeof ActivitySchema>;

/**
 * zod schema definition for the entity Affiliations
 */
export const NU__Affiliation__cSchema = z.object({
    Id: z.string().describe(`
        * * Field Name: Id
        * * Display Name: Id
        * * SQL Data Type: nvarchar(50)`),
    OwnerId: z.string().nullable().describe(`
        * * Field Name: OwnerId
        * * Display Name: Owner Id
        * * SQL Data Type: nvarchar(MAX)`),
    IsDeleted: z.boolean().nullable().describe(`
        * * Field Name: IsDeleted
        * * Display Name: Is Deleted
        * * SQL Data Type: bit`),
    Name: z.string().nullable().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(MAX)`),
    CreatedById: z.string().nullable().describe(`
        * * Field Name: CreatedById
        * * Display Name: Created By Id
        * * SQL Data Type: nvarchar(MAX)`),
    LastModifiedDate: z.date().nullable().describe(`
        * * Field Name: LastModifiedDate
        * * Display Name: Last Modified Date
        * * SQL Data Type: datetimeoffset`),
    LastModifiedById: z.string().nullable().describe(`
        * * Field Name: LastModifiedById
        * * Display Name: Last Modified By Id
        * * SQL Data Type: nvarchar(MAX)`),
    SystemModstamp: z.date().nullable().describe(`
        * * Field Name: SystemModstamp
        * * Display Name: System Modstamp
        * * SQL Data Type: datetimeoffset`),
    LastActivityDate: z.date().nullable().describe(`
        * * Field Name: LastActivityDate
        * * Display Name: Last Activity Date
        * * SQL Data Type: datetimeoffset`),
    LastViewedDate: z.date().nullable().describe(`
        * * Field Name: LastViewedDate
        * * Display Name: Last Viewed Date
        * * SQL Data Type: datetimeoffset`),
    LastReferencedDate: z.date().nullable().describe(`
        * * Field Name: LastReferencedDate
        * * Display Name: Last Referenced Date
        * * SQL Data Type: datetimeoffset`),
    NU__Account__c: z.string().nullable().describe(`
        * * Field Name: NU__Account__c
        * * Display Name: Nimble Account ID
        * * SQL Data Type: nvarchar(MAX)`),
    NU__DoNotFlowdownAddress__c: z.boolean().nullable().describe(`
        * * Field Name: NU__DoNotFlowdownAddress__c
        * * Display Name: NU__Do Not Flowdown Address __c
        * * SQL Data Type: bit`),
    NU__EndDate__c: z.date().nullable().describe(`
        * * Field Name: NU__EndDate__c
        * * Display Name: NU__End Date __c
        * * SQL Data Type: datetimeoffset`),
    NU__ExternalID__c: z.string().nullable().describe(`
        * * Field Name: NU__ExternalID__c
        * * Display Name: NU__External ID__c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__IsCompanyManager__c: z.boolean().nullable().describe(`
        * * Field Name: NU__IsCompanyManager__c
        * * Display Name: NU__Is Company Manager __c
        * * SQL Data Type: bit`),
    NU__IsPrimary__c: z.boolean().nullable().describe(`
        * * Field Name: NU__IsPrimary__c
        * * Display Name: NU__Is Primary __c
        * * SQL Data Type: bit`),
    NU__ParentAccount__c: z.string().nullable().describe(`
        * * Field Name: NU__ParentAccount__c
        * * Display Name: Nimble Parent Account ID
        * * SQL Data Type: nvarchar(MAX)`),
    NU__RemovalDate__c: z.date().nullable().describe(`
        * * Field Name: NU__RemovalDate__c
        * * Display Name: NU__Removal Date __c
        * * SQL Data Type: datetimeoffset`),
    NU__RemovalReason__c: z.string().nullable().describe(`
        * * Field Name: NU__RemovalReason__c
        * * Display Name: NU__Removal Reason __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Role__c: z.string().nullable().describe(`
        * * Field Name: NU__Role__c
        * * Display Name: Role
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Search__c: z.string().nullable().describe(`
        * * Field Name: NU__Search__c
        * * Display Name: Name
        * * SQL Data Type: nvarchar(MAX)`),
    NU__StartDate__c: z.date().nullable().describe(`
        * * Field Name: NU__StartDate__c
        * * Display Name: NU__Start Date __c
        * * SQL Data Type: datetimeoffset`),
    Is_CTA_Leader__c: z.boolean().nullable().describe(`
        * * Field Name: Is_CTA_Leader__c
        * * Display Name: Is _CTA_Leader __c
        * * SQL Data Type: bit`),
    NU__IsPrimaryContact__c: z.boolean().nullable().describe(`
        * * Field Name: NU__IsPrimaryContact__c
        * * Display Name: NU__Is Primary Contact __c
        * * SQL Data Type: bit`),
    NU__RemovalDate2__c: z.date().nullable().describe(`
        * * Field Name: NU__RemovalDate2__c
        * * Display Name: NU__Removal Date 2__c
        * * SQL Data Type: datetimeoffset`),
    NU__StatusFlag__c: z.string().nullable().describe(`
        * * Field Name: NU__StatusFlag__c
        * * Display Name: NU__Status Flag __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Status__c: z.string().nullable().describe(`
        * * Field Name: NU__Status__c
        * * Display Name: Status
        * * SQL Data Type: nvarchar(MAX)`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Troubleshoot: z.string().nullable().describe(`
        * * Field Name: Troubleshoot
        * * Display Name: Troubleshoot
        * * SQL Data Type: nvarchar(50)`),
});

export type NU__Affiliation__cEntityType = z.infer<typeof NU__Affiliation__cSchema>;

/**
 * zod schema definition for the entity Committee Memberships
 */
export const NU__CommitteeMembership__cSchema = z.object({
    Id: z.string().describe(`
        * * Field Name: Id
        * * Display Name: Id
        * * SQL Data Type: nvarchar(50)`),
    IsDeleted: z.boolean().nullable().describe(`
        * * Field Name: IsDeleted
        * * Display Name: Is Deleted
        * * SQL Data Type: bit`),
    Name: z.string().nullable().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(MAX)`),
    CreatedById: z.string().nullable().describe(`
        * * Field Name: CreatedById
        * * Display Name: Created By Id
        * * SQL Data Type: nvarchar(MAX)`),
    LastModifiedDate: z.date().nullable().describe(`
        * * Field Name: LastModifiedDate
        * * Display Name: Last Modified Date
        * * SQL Data Type: datetime2`),
    LastModifiedById: z.string().nullable().describe(`
        * * Field Name: LastModifiedById
        * * Display Name: Last Modified By Id
        * * SQL Data Type: nvarchar(MAX)`),
    SystemModstamp: z.date().nullable().describe(`
        * * Field Name: SystemModstamp
        * * Display Name: System Modstamp
        * * SQL Data Type: datetime2`),
    LastActivityDate: z.date().nullable().describe(`
        * * Field Name: LastActivityDate
        * * Display Name: Last Activity Date
        * * SQL Data Type: datetime2`),
    LastViewedDate: z.date().nullable().describe(`
        * * Field Name: LastViewedDate
        * * Display Name: Last Viewed Date
        * * SQL Data Type: datetime2`),
    LastReferencedDate: z.date().nullable().describe(`
        * * Field Name: LastReferencedDate
        * * Display Name: Last Referenced Date
        * * SQL Data Type: datetime2`),
    NU__Account__c: z.string().nullable().describe(`
        * * Field Name: NU__Account__c
        * * Display Name: NU__Account __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Committee__c: z.string().nullable().describe(`
        * * Field Name: NU__Committee__c
        * * Display Name: NU__Committee __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__CommitteePosition__c: z.string().nullable().describe(`
        * * Field Name: NU__CommitteePosition__c
        * * Display Name: NU__Committee Position __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__EndDate__c: z.date().nullable().describe(`
        * * Field Name: NU__EndDate__c
        * * Display Name: NU__End Date __c
        * * SQL Data Type: datetime2`),
    NU__ExternalID__c: z.string().nullable().describe(`
        * * Field Name: NU__ExternalID__c
        * * Display Name: NU__External ID__c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__FormulaPositionSort__c: z.string().nullable().describe(`
        * * Field Name: NU__FormulaPositionSort__c
        * * Display Name: NU__Formula Position Sort __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__MemberEmail__c: z.string().nullable().describe(`
        * * Field Name: NU__MemberEmail__c
        * * Display Name: Member Email
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Position__c: z.string().nullable().describe(`
        * * Field Name: NU__Position__c
        * * Display Name: NU__Position __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Search__c: z.string().nullable().describe(`
        * * Field Name: NU__Search__c
        * * Display Name: Member Name
        * * SQL Data Type: nvarchar(MAX)`),
    NU__StartDate__c: z.date().nullable().describe(`
        * * Field Name: NU__StartDate__c
        * * Display Name: NU__Start Date __c
        * * SQL Data Type: datetime2`),
    NU__State__c: z.string().nullable().describe(`
        * * Field Name: NU__State__c
        * * Display Name: State
        * * SQL Data Type: nvarchar(MAX)`),
    NU__StatusFlag__c: z.string().nullable().describe(`
        * * Field Name: NU__StatusFlag__c
        * * Display Name: NU__Status Flag __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__SupportingOrganization__c: z.string().nullable().describe(`
        * * Field Name: NU__SupportingOrganization__c
        * * Display Name: NU__Supporting Organization __c
        * * SQL Data Type: nvarchar(MAX)`),
    Term__c: z.string().nullable().describe(`
        * * Field Name: Term__c
        * * Display Name: Term __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__StampedState__c: z.string().nullable().describe(`
        * * Field Name: NU__StampedState__c
        * * Display Name: NU__Stamped State __c
        * * SQL Data Type: nvarchar(MAX)`),
    Committee_Short_Name__c: z.string().nullable().describe(`
        * * Field Name: Committee_Short_Name__c
        * * Display Name: Committee _Short _Name __c
        * * SQL Data Type: nvarchar(MAX)`),
    Committee_Type__c: z.string().nullable().describe(`
        * * Field Name: Committee_Type__c
        * * Display Name: Committee Type
        * * SQL Data Type: nvarchar(MAX)`),
    Member_ID__c: z.string().nullable().describe(`
        * * Field Name: Member_ID__c
        * * Display Name: Member _ID__c
        * * SQL Data Type: nvarchar(MAX)`),
    CommitteePositionName__c: z.string().nullable().describe(`
        * * Field Name: CommitteePositionName__c
        * * Display Name: Committee Position Name
        * * SQL Data Type: nvarchar(MAX)`),
    CommitteeName__c: z.string().nullable().describe(`
        * * Field Name: CommitteeName__c
        * * Display Name: Committee Name
        * * SQL Data Type: nvarchar(MAX)`),
    CTA_Dues_Forward_Eligible__c: z.boolean().nullable().describe(`
        * * Field Name: CTA_Dues_Forward_Eligible__c
        * * Display Name: CTA_Dues _Forward _Eligible __c
        * * SQL Data Type: bit`),
    CTA_Dues_Forward_Ineligible__c: z.boolean().nullable().describe(`
        * * Field Name: CTA_Dues_Forward_Ineligible__c
        * * Display Name: CTA_Dues _Forward _Ineligible __c
        * * SQL Data Type: bit`),
    Committee_Account__c: z.string().nullable().describe(`
        * * Field Name: Committee_Account__c
        * * Display Name: Committee Account
        * * SQL Data Type: nvarchar(MAX)`),
    Committee_Account_ID__c: z.string().nullable().describe(`
        * * Field Name: Committee_Account_ID__c
        * * Display Name: Committee _Account _ID__c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Account2__c: z.string().nullable().describe(`
        * * Field Name: NU__Account2__c
        * * Display Name: NU__Account 2__c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Committee2__c: z.string().nullable().describe(`
        * * Field Name: NU__Committee2__c
        * * Display Name: NU__Committee 2__c
        * * SQL Data Type: nvarchar(MAX)`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Troubleshoot: z.string().nullable().describe(`
        * * Field Name: Troubleshoot
        * * Display Name: Troubleshoot
        * * SQL Data Type: nvarchar(50)`),
});

export type NU__CommitteeMembership__cEntityType = z.infer<typeof NU__CommitteeMembership__cSchema>;

/**
 * zod schema definition for the entity Committees
 */
export const NU__Committee__cSchema = z.object({
    Id: z.string().describe(`
        * * Field Name: Id
        * * Display Name: Id
        * * SQL Data Type: nvarchar(50)`),
    OwnerId: z.string().nullable().describe(`
        * * Field Name: OwnerId
        * * Display Name: Owner Id
        * * SQL Data Type: nvarchar(MAX)`),
    IsDeleted: z.boolean().nullable().describe(`
        * * Field Name: IsDeleted
        * * Display Name: Is Deleted
        * * SQL Data Type: bit`),
    Name: z.string().nullable().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(MAX)`),
    CreatedById: z.string().nullable().describe(`
        * * Field Name: CreatedById
        * * Display Name: Created By Id
        * * SQL Data Type: nvarchar(MAX)`),
    LastModifiedDate: z.date().nullable().describe(`
        * * Field Name: LastModifiedDate
        * * Display Name: Last Modified Date
        * * SQL Data Type: datetimeoffset`),
    LastModifiedById: z.string().nullable().describe(`
        * * Field Name: LastModifiedById
        * * Display Name: Last Modified By Id
        * * SQL Data Type: nvarchar(MAX)`),
    SystemModstamp: z.date().nullable().describe(`
        * * Field Name: SystemModstamp
        * * Display Name: System Modstamp
        * * SQL Data Type: datetimeoffset`),
    LastActivityDate: z.date().nullable().describe(`
        * * Field Name: LastActivityDate
        * * Display Name: Last Activity Date
        * * SQL Data Type: datetimeoffset`),
    LastViewedDate: z.date().nullable().describe(`
        * * Field Name: LastViewedDate
        * * Display Name: Last Viewed Date
        * * SQL Data Type: datetimeoffset`),
    LastReferencedDate: z.date().nullable().describe(`
        * * Field Name: LastReferencedDate
        * * Display Name: Last Referenced Date
        * * SQL Data Type: datetimeoffset`),
    NU__AvailableTitles__c: z.string().nullable().describe(`
        * * Field Name: NU__AvailableTitles__c
        * * Display Name: AvailableTitles
        * * SQL Data Type: nvarchar(MAX)`),
    NU__CommitteeShortName__c: z.string().nullable().describe(`
        * * Field Name: NU__CommitteeShortName__c
        * * Display Name: CommitteeShortName
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Description__c: z.string().nullable().describe(`
        * * Field Name: NU__Description__c
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    NU__ExternalID__c: z.string().nullable().describe(`
        * * Field Name: NU__ExternalID__c
        * * Display Name: ExternalID
        * * SQL Data Type: nvarchar(MAX)`),
    NU__FullDescription__c: z.string().nullable().describe(`
        * * Field Name: NU__FullDescription__c
        * * Display Name: FullDescription
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Status__c: z.string().nullable().describe(`
        * * Field Name: NU__Status__c
        * * Display Name: Status
        * * SQL Data Type: nvarchar(MAX)`),
    NU__TermMonths__c: z.number().nullable().describe(`
        * * Field Name: NU__TermMonths__c
        * * Display Name: TermMonths
        * * SQL Data Type: decimal(3, 0)`),
    NU__Type__c: z.string().nullable().describe(`
        * * Field Name: NU__Type__c
        * * Display Name: Type
        * * SQL Data Type: nvarchar(MAX)`),
    NU__CommitteeCount__c: z.number().nullable().describe(`
        * * Field Name: NU__CommitteeCount__c
        * * Display Name: CommitteeCount
        * * SQL Data Type: decimal(18, 0)`),
    Account__c: z.string().nullable().describe(`
        * * Field Name: Account__c
        * * Display Name: Account __c
        * * SQL Data Type: nvarchar(MAX)`),
    Staff_Liaison_1__c: z.string().nullable().describe(`
        * * Field Name: Staff_Liaison_1__c
        * * Display Name: Staff _Liaison _1__c
        * * SQL Data Type: nvarchar(MAX)`),
    Staff_Liaison_2__c: z.string().nullable().describe(`
        * * Field Name: Staff_Liaison_2__c
        * * Display Name: Staff _Liaison _2__c
        * * SQL Data Type: nvarchar(MAX)`),
    Staff_Liaison_3__c: z.string().nullable().describe(`
        * * Field Name: Staff_Liaison_3__c
        * * Display Name: Staff _Liaison _3__c
        * * SQL Data Type: nvarchar(MAX)`),
    Terms_Allowed__c: z.string().nullable().describe(`
        * * Field Name: Terms_Allowed__c
        * * Display Name: Terms _Allowed __c
        * * SQL Data Type: nvarchar(MAX)`),
    Current_Committee_Member_Count__c: z.number().nullable().describe(`
        * * Field Name: Current_Committee_Member_Count__c
        * * Display Name: Current Committee Member Count
        * * SQL Data Type: decimal(5, 0)`),
    Owner_ExternalID__c: z.string().nullable().describe(`
        * * Field Name: Owner_ExternalID__c
        * * Display Name: Owner _External ID__c
        * * SQL Data Type: nvarchar(MAX)`),
    CommitteeRecordID__c: z.string().nullable().describe(`
        * * Field Name: CommitteeRecordID__c
        * * Display Name: Committee Record ID__c
        * * SQL Data Type: nvarchar(MAX)`),
    CCTA_Dues_Forward_Eligible__c: z.number().nullable().describe(`
        * * Field Name: CCTA_Dues_Forward_Eligible__c
        * * Display Name: CCTA_Dues _Forward _Eligible __c
        * * SQL Data Type: decimal(18, 0)`),
    CCTA_Dues_Forward_Ineligible__c: z.number().nullable().describe(`
        * * Field Name: CCTA_Dues_Forward_Ineligible__c
        * * Display Name: CCTA_Dues _Forward _Ineligible __c
        * * SQL Data Type: decimal(18, 0)`),
    ChatterGroupId__c: z.string().nullable().describe(`
        * * Field Name: ChatterGroupId__c
        * * Display Name: Chatter Group Id __c
        * * SQL Data Type: nvarchar(MAX)`),
    CommunityGroup__c: z.boolean().nullable().describe(`
        * * Field Name: CommunityGroup__c
        * * Display Name: Community Group __c
        * * SQL Data Type: bit`),
    Staff_Liaison_4__c: z.string().nullable().describe(`
        * * Field Name: Staff_Liaison_4__c
        * * Display Name: Staff _Liaison _4__c
        * * SQL Data Type: nvarchar(MAX)`),
    Staff_Liaison_5__c: z.string().nullable().describe(`
        * * Field Name: Staff_Liaison_5__c
        * * Display Name: Staff _Liaison _5__c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__CommitteeCount2__c: z.number().nullable().describe(`
        * * Field Name: NU__CommitteeCount2__c
        * * Display Name: CommitteeCount2
        * * SQL Data Type: decimal(18, 0)`),
    Collaboration_Group_ID__c: z.string().nullable().describe(`
        * * Field Name: Collaboration_Group_ID__c
        * * Display Name: Collaboration _Group _ID__c
        * * SQL Data Type: nvarchar(MAX)`),
    Uses_Community_Group_Automation__c: z.boolean().nullable().describe(`
        * * Field Name: Uses_Community_Group_Automation__c
        * * Display Name: Uses _Community _Group _Automation __c
        * * SQL Data Type: bit`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Troubleshoot: z.string().nullable().describe(`
        * * Field Name: Troubleshoot
        * * Display Name: Troubleshoot
        * * SQL Data Type: nvarchar(50)`),
});

export type NU__Committee__cEntityType = z.infer<typeof NU__Committee__cSchema>;

/**
 * zod schema definition for the entity Contacts
 */
export const ContactSchema = z.object({
    Id: z.string().describe(`
        * * Field Name: Id
        * * Display Name: Id
        * * SQL Data Type: nvarchar(50)`),
    IsDeleted: z.boolean().nullable().describe(`
        * * Field Name: IsDeleted
        * * Display Name: Is Deleted
        * * SQL Data Type: bit`),
    MasterRecordId: z.string().nullable().describe(`
        * * Field Name: MasterRecordId
        * * Display Name: Master Record Id
        * * SQL Data Type: nvarchar(MAX)`),
    AccountId: z.string().nullable().describe(`
        * * Field Name: AccountId
        * * Display Name: Account Id
        * * SQL Data Type: nvarchar(MAX)`),
    IsPersonAccount: z.boolean().nullable().describe(`
        * * Field Name: IsPersonAccount
        * * Display Name: Is Person Account
        * * SQL Data Type: bit`),
    LastName: z.string().nullable().describe(`
        * * Field Name: LastName
        * * Display Name: Last Name
        * * SQL Data Type: nvarchar(MAX)`),
    FirstName: z.string().nullable().describe(`
        * * Field Name: FirstName
        * * Display Name: First Name
        * * SQL Data Type: nvarchar(MAX)`),
    Salutation: z.string().nullable().describe(`
        * * Field Name: Salutation
        * * Display Name: Salutation
        * * SQL Data Type: nvarchar(MAX)`),
    Name: z.string().nullable().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(MAX)`),
    OtherStreet: z.string().nullable().describe(`
        * * Field Name: OtherStreet
        * * Display Name: Other Street
        * * SQL Data Type: nvarchar(MAX)`),
    OtherCity: z.string().nullable().describe(`
        * * Field Name: OtherCity
        * * Display Name: Other City
        * * SQL Data Type: nvarchar(MAX)`),
    OtherState: z.string().nullable().describe(`
        * * Field Name: OtherState
        * * Display Name: Other State
        * * SQL Data Type: nvarchar(MAX)`),
    OtherPostalCode: z.string().nullable().describe(`
        * * Field Name: OtherPostalCode
        * * Display Name: Other Postal Code
        * * SQL Data Type: nvarchar(MAX)`),
    OtherCountry: z.string().nullable().describe(`
        * * Field Name: OtherCountry
        * * Display Name: Other Country
        * * SQL Data Type: nvarchar(MAX)`),
    OtherLatitude: z.number().nullable().describe(`
        * * Field Name: OtherLatitude
        * * Display Name: Other Latitude
        * * SQL Data Type: decimal(18, 15)`),
    OtherLongitude: z.number().nullable().describe(`
        * * Field Name: OtherLongitude
        * * Display Name: Other Longitude
        * * SQL Data Type: decimal(18, 15)`),
    OtherGeocodeAccuracy: z.string().nullable().describe(`
        * * Field Name: OtherGeocodeAccuracy
        * * Display Name: Other Geocode Accuracy
        * * SQL Data Type: nvarchar(MAX)`),
    MailingStreet: z.string().nullable().describe(`
        * * Field Name: MailingStreet
        * * Display Name: Mailing Street
        * * SQL Data Type: nvarchar(MAX)`),
    MailingCity: z.string().nullable().describe(`
        * * Field Name: MailingCity
        * * Display Name: Mailing City
        * * SQL Data Type: nvarchar(MAX)`),
    MailingState: z.string().nullable().describe(`
        * * Field Name: MailingState
        * * Display Name: Mailing State
        * * SQL Data Type: nvarchar(MAX)`),
    MailingPostalCode: z.string().nullable().describe(`
        * * Field Name: MailingPostalCode
        * * Display Name: Mailing Postal Code
        * * SQL Data Type: nvarchar(MAX)`),
    MailingCountry: z.string().nullable().describe(`
        * * Field Name: MailingCountry
        * * Display Name: Mailing Country
        * * SQL Data Type: nvarchar(MAX)`),
    MailingLatitude: z.number().nullable().describe(`
        * * Field Name: MailingLatitude
        * * Display Name: Mailing Latitude
        * * SQL Data Type: decimal(18, 15)`),
    MailingLongitude: z.number().nullable().describe(`
        * * Field Name: MailingLongitude
        * * Display Name: Mailing Longitude
        * * SQL Data Type: decimal(18, 15)`),
    MailingGeocodeAccuracy: z.string().nullable().describe(`
        * * Field Name: MailingGeocodeAccuracy
        * * Display Name: Mailing Geocode Accuracy
        * * SQL Data Type: nvarchar(MAX)`),
    Phone: z.string().nullable().describe(`
        * * Field Name: Phone
        * * Display Name: Phone
        * * SQL Data Type: nvarchar(MAX)`),
    Fax: z.string().nullable().describe(`
        * * Field Name: Fax
        * * Display Name: Fax
        * * SQL Data Type: nvarchar(MAX)`),
    MobilePhone: z.string().nullable().describe(`
        * * Field Name: MobilePhone
        * * Display Name: Mobile Phone
        * * SQL Data Type: nvarchar(MAX)`),
    HomePhone: z.string().nullable().describe(`
        * * Field Name: HomePhone
        * * Display Name: Home Phone
        * * SQL Data Type: nvarchar(MAX)`),
    OtherPhone: z.string().nullable().describe(`
        * * Field Name: OtherPhone
        * * Display Name: Other Phone
        * * SQL Data Type: nvarchar(MAX)`),
    AssistantPhone: z.string().nullable().describe(`
        * * Field Name: AssistantPhone
        * * Display Name: Assistant Phone
        * * SQL Data Type: nvarchar(MAX)`),
    ReportsToId: z.string().nullable().describe(`
        * * Field Name: ReportsToId
        * * Display Name: Reports To Id
        * * SQL Data Type: nvarchar(MAX)`),
    Email: z.string().nullable().describe(`
        * * Field Name: Email
        * * Display Name: Email
        * * SQL Data Type: nvarchar(MAX)`),
    Title: z.string().nullable().describe(`
        * * Field Name: Title
        * * Display Name: Title
        * * SQL Data Type: nvarchar(MAX)`),
    Department: z.string().nullable().describe(`
        * * Field Name: Department
        * * Display Name: Department
        * * SQL Data Type: nvarchar(MAX)`),
    AssistantName: z.string().nullable().describe(`
        * * Field Name: AssistantName
        * * Display Name: Assistant Name
        * * SQL Data Type: nvarchar(MAX)`),
    LeadSource: z.string().nullable().describe(`
        * * Field Name: LeadSource
        * * Display Name: Lead Source
        * * SQL Data Type: nvarchar(MAX)`),
    Birthdate: z.date().nullable().describe(`
        * * Field Name: Birthdate
        * * Display Name: Birthdate
        * * SQL Data Type: datetimeoffset`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    OwnerId: z.string().nullable().describe(`
        * * Field Name: OwnerId
        * * Display Name: Owner Id
        * * SQL Data Type: nvarchar(MAX)`),
    HasOptedOutOfEmail: z.boolean().nullable().describe(`
        * * Field Name: HasOptedOutOfEmail
        * * Display Name: Has Opted Out Of Email
        * * SQL Data Type: bit`),
    HasOptedOutOfFax: z.boolean().nullable().describe(`
        * * Field Name: HasOptedOutOfFax
        * * Display Name: Has Opted Out Of Fax
        * * SQL Data Type: bit`),
    DoNotCall: z.boolean().nullable().describe(`
        * * Field Name: DoNotCall
        * * Display Name: Do Not Call
        * * SQL Data Type: bit`),
    CreatedById: z.string().nullable().describe(`
        * * Field Name: CreatedById
        * * Display Name: Created By Id
        * * SQL Data Type: nvarchar(MAX)`),
    LastModifiedDate: z.date().nullable().describe(`
        * * Field Name: LastModifiedDate
        * * Display Name: Last Modified Date
        * * SQL Data Type: datetimeoffset`),
    LastModifiedById: z.string().nullable().describe(`
        * * Field Name: LastModifiedById
        * * Display Name: Last Modified By Id
        * * SQL Data Type: nvarchar(MAX)`),
    SystemModstamp: z.date().nullable().describe(`
        * * Field Name: SystemModstamp
        * * Display Name: System Modstamp
        * * SQL Data Type: datetimeoffset`),
    LastActivityDate: z.date().nullable().describe(`
        * * Field Name: LastActivityDate
        * * Display Name: Last Activity Date
        * * SQL Data Type: datetimeoffset`),
    LastCURequestDate: z.date().nullable().describe(`
        * * Field Name: LastCURequestDate
        * * Display Name: Last CURequest Date
        * * SQL Data Type: datetimeoffset`),
    LastCUUpdateDate: z.date().nullable().describe(`
        * * Field Name: LastCUUpdateDate
        * * Display Name: Last CUUpdate Date
        * * SQL Data Type: datetimeoffset`),
    LastViewedDate: z.date().nullable().describe(`
        * * Field Name: LastViewedDate
        * * Display Name: Last Viewed Date
        * * SQL Data Type: datetimeoffset`),
    LastReferencedDate: z.date().nullable().describe(`
        * * Field Name: LastReferencedDate
        * * Display Name: Last Referenced Date
        * * SQL Data Type: datetimeoffset`),
    EmailBouncedReason: z.string().nullable().describe(`
        * * Field Name: EmailBouncedReason
        * * Display Name: Email Bounced Reason
        * * SQL Data Type: nvarchar(MAX)`),
    EmailBouncedDate: z.date().nullable().describe(`
        * * Field Name: EmailBouncedDate
        * * Display Name: Email Bounced Date
        * * SQL Data Type: datetimeoffset`),
    IsEmailBounced: z.boolean().nullable().describe(`
        * * Field Name: IsEmailBounced
        * * Display Name: Is Email Bounced
        * * SQL Data Type: bit`),
    PhotoUrl: z.string().nullable().describe(`
        * * Field Name: PhotoUrl
        * * Display Name: Photo Url
        * * SQL Data Type: nvarchar(MAX)`),
    Jigsaw: z.string().nullable().describe(`
        * * Field Name: Jigsaw
        * * Display Name: Jigsaw
        * * SQL Data Type: nvarchar(MAX)`),
    JigsawContactId: z.string().nullable().describe(`
        * * Field Name: JigsawContactId
        * * Display Name: Jigsaw Contact Id
        * * SQL Data Type: nvarchar(MAX)`),
    IndividualId: z.string().nullable().describe(`
        * * Field Name: IndividualId
        * * Display Name: Individual Id
        * * SQL Data Type: nvarchar(MAX)`),
    NU__ExternalID__c: z.string().nullable().describe(`
        * * Field Name: NU__ExternalID__c
        * * Display Name: NU__External ID__c
        * * SQL Data Type: nvarchar(MAX)`),
    ET_Field_Rep__c: z.string().nullable().describe(`
        * * Field Name: ET_Field_Rep__c
        * * Display Name: ET Field Rep
        * * SQL Data Type: nvarchar(MAX)`),
    Deskcom__twitter_username__c: z.string().nullable().describe(`
        * * Field Name: Deskcom__twitter_username__c
        * * Display Name: Deskcom __twitter _username __c
        * * SQL Data Type: nvarchar(MAX)`),
    e4sf__Engage_Address_City__c: z.string().nullable().describe(`
        * * Field Name: e4sf__Engage_Address_City__c
        * * Display Name: e 4sf __Engage _Address _City __c
        * * SQL Data Type: nvarchar(MAX)`),
    e4sf__Engage_Address_Country__c: z.string().nullable().describe(`
        * * Field Name: e4sf__Engage_Address_Country__c
        * * Display Name: e 4sf __Engage _Address _Country __c
        * * SQL Data Type: nvarchar(MAX)`),
    e4sf__Engage_Address_PostalCode__c: z.string().nullable().describe(`
        * * Field Name: e4sf__Engage_Address_PostalCode__c
        * * Display Name: e 4sf __Engage _Address _Postal Code __c
        * * SQL Data Type: nvarchar(MAX)`),
    e4sf__Engage_Address_State__c: z.string().nullable().describe(`
        * * Field Name: e4sf__Engage_Address_State__c
        * * Display Name: e 4sf __Engage _Address _State __c
        * * SQL Data Type: nvarchar(MAX)`),
    e4sf__Engage_Address_Street__c: z.string().nullable().describe(`
        * * Field Name: e4sf__Engage_Address_Street__c
        * * Display Name: e 4sf __Engage _Address _Street __c
        * * SQL Data Type: nvarchar(MAX)`),
    e4sf__Engage_Batch_Id__c: z.string().nullable().describe(`
        * * Field Name: e4sf__Engage_Batch_Id__c
        * * Display Name: e 4sf __Engage _Batch _Id __c
        * * SQL Data Type: nvarchar(MAX)`),
    e4sf__Engage_Date_Last_Sync__c: z.date().nullable().describe(`
        * * Field Name: e4sf__Engage_Date_Last_Sync__c
        * * Display Name: e 4sf __Engage _Date _Last _Sync __c
        * * SQL Data Type: datetimeoffset`),
    e4sf__Engage_Ext_Id__c: z.string().nullable().describe(`
        * * Field Name: e4sf__Engage_Ext_Id__c
        * * Display Name: e 4sf __Engage _Ext _Id __c
        * * SQL Data Type: nvarchar(MAX)`),
    e4sf__Engage_Federal_District_Lower_Chamber__c: z.string().nullable().describe(`
        * * Field Name: e4sf__Engage_Federal_District_Lower_Chamber__c
        * * Display Name: e 4sf __Engage _Federal _District _Lower _Chamber __c
        * * SQL Data Type: nvarchar(MAX)`),
    e4sf__Engage_Federal_District_Upper_Chamber__c: z.string().nullable().describe(`
        * * Field Name: e4sf__Engage_Federal_District_Upper_Chamber__c
        * * Display Name: e 4sf __Engage _Federal _District _Upper _Chamber __c
        * * SQL Data Type: nvarchar(MAX)`),
    e4sf__Engage_Is_Advocate__c: z.boolean().nullable().describe(`
        * * Field Name: e4sf__Engage_Is_Advocate__c
        * * Display Name: e 4sf __Engage _Is _Advocate __c
        * * SQL Data Type: bit`),
    e4sf__Engage_Never_Sync_To_Engage__c: z.boolean().nullable().describe(`
        * * Field Name: e4sf__Engage_Never_Sync_To_Engage__c
        * * Display Name: e 4sf __Engage _Never _Sync _To _Engage __c
        * * SQL Data Type: bit`),
    e4sf__Engage_Opt_Out__c: z.boolean().nullable().describe(`
        * * Field Name: e4sf__Engage_Opt_Out__c
        * * Display Name: e 4sf __Engage _Opt _Out __c
        * * SQL Data Type: bit`),
    e4sf__Engage_Phone__c: z.string().nullable().describe(`
        * * Field Name: e4sf__Engage_Phone__c
        * * Display Name: e 4sf __Engage _Phone __c
        * * SQL Data Type: nvarchar(MAX)`),
    e4sf__Engage_State_District_Lower_Chamber__c: z.string().nullable().describe(`
        * * Field Name: e4sf__Engage_State_District_Lower_Chamber__c
        * * Display Name: e 4sf __Engage _State _District _Lower _Chamber __c
        * * SQL Data Type: nvarchar(MAX)`),
    e4sf__Engage_State_District_Upper_Chamber__c: z.string().nullable().describe(`
        * * Field Name: e4sf__Engage_State_District_Upper_Chamber__c
        * * Display Name: e 4sf __Engage _State _District _Upper _Chamber __c
        * * SQL Data Type: nvarchar(MAX)`),
    geopointe__Geocode__c: z.string().nullable().describe(`
        * * Field Name: geopointe__Geocode__c
        * * Display Name: geopointe __Geocode __c
        * * SQL Data Type: nvarchar(MAX)`),
    rrpu__Alert_Message__c: z.string().nullable().describe(`
        * * Field Name: rrpu__Alert_Message__c
        * * Display Name: rrpu __Alert _Message __c
        * * SQL Data Type: nvarchar(MAX)`),
    CloudingoAgent__CES__c: z.number().nullable().describe(`
        * * Field Name: CloudingoAgent__CES__c
        * * Display Name: Cloudingo Agent __CES__c
        * * SQL Data Type: decimal(18, 0)`),
    CloudingoAgent__MAR__c: z.string().nullable().describe(`
        * * Field Name: CloudingoAgent__MAR__c
        * * Display Name: Cloudingo Agent __MAR__c
        * * SQL Data Type: nvarchar(MAX)`),
    CloudingoAgent__MAS__c: z.number().nullable().describe(`
        * * Field Name: CloudingoAgent__MAS__c
        * * Display Name: Cloudingo Agent __MAS__c
        * * SQL Data Type: decimal(18, 0)`),
    CloudingoAgent__MAV__c: z.string().nullable().describe(`
        * * Field Name: CloudingoAgent__MAV__c
        * * Display Name: Cloudingo Agent __MAV__c
        * * SQL Data Type: nvarchar(MAX)`),
    CloudingoAgent__MRDI__c: z.string().nullable().describe(`
        * * Field Name: CloudingoAgent__MRDI__c
        * * Display Name: Cloudingo Agent __MRDI__c
        * * SQL Data Type: nvarchar(MAX)`),
    CloudingoAgent__MTZ__c: z.string().nullable().describe(`
        * * Field Name: CloudingoAgent__MTZ__c
        * * Display Name: Cloudingo Agent __MTZ__c
        * * SQL Data Type: nvarchar(MAX)`),
    CloudingoAgent__OAR__c: z.string().nullable().describe(`
        * * Field Name: CloudingoAgent__OAR__c
        * * Display Name: Cloudingo Agent __OAR__c
        * * SQL Data Type: nvarchar(MAX)`),
    CloudingoAgent__OAS__c: z.number().nullable().describe(`
        * * Field Name: CloudingoAgent__OAS__c
        * * Display Name: Cloudingo Agent __OAS__c
        * * SQL Data Type: decimal(18, 0)`),
    CloudingoAgent__OAV__c: z.string().nullable().describe(`
        * * Field Name: CloudingoAgent__OAV__c
        * * Display Name: Cloudingo Agent __OAV__c
        * * SQL Data Type: nvarchar(MAX)`),
    CloudingoAgent__ORDI__c: z.string().nullable().describe(`
        * * Field Name: CloudingoAgent__ORDI__c
        * * Display Name: Cloudingo Agent __ORDI__c
        * * SQL Data Type: nvarchar(MAX)`),
    CloudingoAgent__OTZ__c: z.string().nullable().describe(`
        * * Field Name: CloudingoAgent__OTZ__c
        * * Display Name: Cloudingo Agent __OTZ__c
        * * SQL Data Type: nvarchar(MAX)`),
    NC_DPP__Anonymize__c: z.boolean().nullable().describe(`
        * * Field Name: NC_DPP__Anonymize__c
        * * Display Name: NC_DPP__Anonymize __c
        * * SQL Data Type: bit`),
    NC_DPP__Consented__c: z.boolean().nullable().describe(`
        * * Field Name: NC_DPP__Consented__c
        * * Display Name: NC_DPP__Consented __c
        * * SQL Data Type: bit`),
    NC_DPP__LastConsentedDate__c: z.date().nullable().describe(`
        * * Field Name: NC_DPP__LastConsentedDate__c
        * * Display Name: NC_DPP__Last Consented Date __c
        * * SQL Data Type: datetimeoffset`),
    NU__Biography__c: z.string().nullable().describe(`
        * * Field Name: NU__Biography__c
        * * Display Name: NU__Biography __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Degrees__c: z.string().nullable().describe(`
        * * Field Name: NU__Degrees__c
        * * Display Name: NU__Degrees __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__DoctoralInstitution__c: z.string().nullable().describe(`
        * * Field Name: NU__DoctoralInstitution__c
        * * Display Name: NU__Doctoral Institution __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Expertise__c: z.string().nullable().describe(`
        * * Field Name: NU__Expertise__c
        * * Display Name: NU__Expertise __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__GraduateInstitution__c: z.string().nullable().describe(`
        * * Field Name: NU__GraduateInstitution__c
        * * Display Name: NU__Graduate Institution __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Interests__c: z.string().nullable().describe(`
        * * Field Name: NU__Interests__c
        * * Display Name: NU__Interests __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__UndergraduateInstitution__c: z.string().nullable().describe(`
        * * Field Name: NU__UndergraduateInstitution__c
        * * Display Name: NU__Undergraduate Institution __c
        * * SQL Data Type: nvarchar(MAX)`),
    et4ae5__HasOptedOutOfMobile__c: z.boolean().nullable().describe(`
        * * Field Name: et4ae5__HasOptedOutOfMobile__c
        * * Display Name: et 4ae 5__Has Opted Out Of Mobile __c
        * * SQL Data Type: bit`),
    et4ae5__Mobile_Country_Code__c: z.string().nullable().describe(`
        * * Field Name: et4ae5__Mobile_Country_Code__c
        * * Display Name: et 4ae 5__Mobile _Country _Code __c
        * * SQL Data Type: nvarchar(MAX)`),
    qualtrics__Informed_Consent_Date__c: z.date().nullable().describe(`
        * * Field Name: qualtrics__Informed_Consent_Date__c
        * * Display Name: qualtrics __Informed _Consent _Date __c
        * * SQL Data Type: datetimeoffset`),
    qualtrics__Informed_Consent__c: z.boolean().nullable().describe(`
        * * Field Name: qualtrics__Informed_Consent__c
        * * Display Name: qualtrics __Informed _Consent __c
        * * SQL Data Type: bit`),
    qualtrics__Last_Survey_Invitation__c: z.date().nullable().describe(`
        * * Field Name: qualtrics__Last_Survey_Invitation__c
        * * Display Name: qualtrics __Last _Survey _Invitation __c
        * * SQL Data Type: datetimeoffset`),
    qualtrics__Last_Survey_Response__c: z.date().nullable().describe(`
        * * Field Name: qualtrics__Last_Survey_Response__c
        * * Display Name: qualtrics __Last _Survey _Response __c
        * * SQL Data Type: datetimeoffset`),
    qualtrics__Net_Promoter_Score__c: z.number().nullable().describe(`
        * * Field Name: qualtrics__Net_Promoter_Score__c
        * * Display Name: qualtrics __Net _Promoter _Score __c
        * * SQL Data Type: decimal(2, 0)`),
    is_eligible_for_SFMC_sync__c: z.boolean().nullable().describe(`
        * * Field Name: is_eligible_for_SFMC_sync__c
        * * Display Name: is _eligible _for _SFMC_sync __c
        * * SQL Data Type: bit`),
    Long_Form_ID__c: z.string().nullable().describe(`
        * * Field Name: Long_Form_ID__c
        * * Display Name: Long _Form _ID__c
        * * SQL Data Type: nvarchar(MAX)`),
    Institution__c: z.string().nullable().describe(`
        * * Field Name: Institution__c
        * * Display Name: Institution
        * * SQL Data Type: nvarchar(MAX)`),
    Member__c: z.string().nullable().describe(`
        * * Field Name: Member__c
        * * Display Name: Member
        * * SQL Data Type: nvarchar(MAX)`),
    Eligible_For_SFMC_Sync__c: z.boolean().nullable().describe(`
        * * Field Name: Eligible_For_SFMC_Sync__c
        * * Display Name: Eligible _For _SFMC_Sync __c
        * * SQL Data Type: bit`),
    DESKSCMT__Desk_Customer_Id__c: z.number().nullable().describe(`
        * * Field Name: DESKSCMT__Desk_Customer_Id__c
        * * Display Name: DESKSCMT__Desk _Customer _Id __c
        * * SQL Data Type: decimal(18, 0)`),
    DESKSCMT__Desk_Migrated_Contact__c: z.boolean().nullable().describe(`
        * * Field Name: DESKSCMT__Desk_Migrated_Contact__c
        * * Display Name: DESKSCMT__Desk _Migrated _Contact __c
        * * SQL Data Type: bit`),
    title__c: z.string().nullable().describe(`
        * * Field Name: title__c
        * * Display Name: title __c
        * * SQL Data Type: nvarchar(MAX)`),
    created_at__c: z.date().nullable().describe(`
        * * Field Name: created_at__c
        * * Display Name: created _at __c
        * * SQL Data Type: datetimeoffset`),
    updated_at__c: z.date().nullable().describe(`
        * * Field Name: updated_at__c
        * * Display Name: updated _at __c
        * * SQL Data Type: datetimeoffset`),
    P2A__Advocate_ID__c: z.number().nullable().describe(`
        * * Field Name: P2A__Advocate_ID__c
        * * Display Name: P2A__Advocate _ID__c
        * * SQL Data Type: decimal(18, 0)`),
    P2A__City_District__c: z.string().nullable().describe(`
        * * Field Name: P2A__City_District__c
        * * Display Name: P2A__City _District __c
        * * SQL Data Type: nvarchar(MAX)`),
    P2A__County__c: z.string().nullable().describe(`
        * * Field Name: P2A__County__c
        * * Display Name: P2A__County __c
        * * SQL Data Type: nvarchar(MAX)`),
    P2A__Federal_House_District__c: z.string().nullable().describe(`
        * * Field Name: P2A__Federal_House_District__c
        * * Display Name: P2A__Federal _House _District __c
        * * SQL Data Type: nvarchar(MAX)`),
    P2A__Phone2Action_Email_Optin__c: z.boolean().nullable().describe(`
        * * Field Name: P2A__Phone2Action_Email_Optin__c
        * * Display Name: P2A__Phone 2Action _Email _Optin __c
        * * SQL Data Type: bit`),
    P2A__State_House_District__c: z.string().nullable().describe(`
        * * Field Name: P2A__State_House_District__c
        * * Display Name: P2A__State _House _District __c
        * * SQL Data Type: nvarchar(MAX)`),
    P2A__State_Senate_District__c: z.string().nullable().describe(`
        * * Field Name: P2A__State_Senate_District__c
        * * Display Name: P2A__State _Senate _District __c
        * * SQL Data Type: nvarchar(MAX)`),
    P2A__Synced__c: z.boolean().nullable().describe(`
        * * Field Name: P2A__Synced__c
        * * Display Name: P2A__Synced __c
        * * SQL Data Type: bit`),
    external_id__c: z.string().nullable().describe(`
        * * Field Name: external_id__c
        * * Display Name: external _id __c
        * * SQL Data Type: nvarchar(MAX)`),
    background__c: z.string().nullable().describe(`
        * * Field Name: background__c
        * * Display Name: background __c
        * * SQL Data Type: nvarchar(MAX)`),
    language__c: z.string().nullable().describe(`
        * * Field Name: language__c
        * * Display Name: language __c
        * * SQL Data Type: nvarchar(MAX)`),
    access_private_portal__c: z.boolean().nullable().describe(`
        * * Field Name: access_private_portal__c
        * * Display Name: access _private _portal __c
        * * SQL Data Type: bit`),
    access_company_cases__c: z.boolean().nullable().describe(`
        * * Field Name: access_company_cases__c
        * * Display Name: access _company _cases __c
        * * SQL Data Type: bit`),
    Desk_Id__c: z.number().nullable().describe(`
        * * Field Name: Desk_Id__c
        * * Display Name: Desk _Id __c
        * * SQL Data Type: decimal(18, 0)`),
    rcsfl__SMS_Number__c: z.string().nullable().describe(`
        * * Field Name: rcsfl__SMS_Number__c
        * * Display Name: rcsfl __SMS_Number __c
        * * SQL Data Type: nvarchar(MAX)`),
    rcsfl__SendSMS__c: z.string().nullable().describe(`
        * * Field Name: rcsfl__SendSMS__c
        * * Display Name: rcsfl __Send SMS__c
        * * SQL Data Type: nvarchar(MAX)`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Troubleshoot: z.string().nullable().describe(`
        * * Field Name: Troubleshoot
        * * Display Name: Troubleshoot
        * * SQL Data Type: nvarchar(50)`),
});

export type ContactEntityType = z.infer<typeof ContactSchema>;

/**
 * zod schema definition for the entity Conversation Detail -250606s
 */
export const ConversationDetail_250606Schema = z.object({
    ID: z.number().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: int`),
    ConversationID: z.number().describe(`
        * * Field Name: ConversationID
        * * Display Name: Conversation ID
        * * SQL Data Type: int`),
    Input: z.string().describe(`
        * * Field Name: Input
        * * Display Name: Input
        * * SQL Data Type: nvarchar(MAX)`),
    InputEmbeddingID: z.string().nullable().describe(`
        * * Field Name: InputEmbeddingID
        * * Display Name: Input Embedding ID
        * * SQL Data Type: nvarchar(50)`),
    Output: z.string().nullable().describe(`
        * * Field Name: Output
        * * Display Name: Output
        * * SQL Data Type: nvarchar(MAX)`),
    Error: z.string().nullable().describe(`
        * * Field Name: Error
        * * Display Name: Error
        * * SQL Data Type: nvarchar(MAX)`),
    DateCreated: z.date().describe(`
        * * Field Name: DateCreated
        * * Display Name: Date Created
        * * SQL Data Type: datetime`),
    SourceIP: z.string().describe(`
        * * Field Name: SourceIP
        * * Display Name: Source IP
        * * SQL Data Type: nvarchar(50)`),
    mj_CreatedAt: z.date().describe(`
        * * Field Name: mj_CreatedAt
        * * Display Name: mj _ Created At
        * * SQL Data Type: datetimeoffset`),
    mj_UpdatedAt: z.date().describe(`
        * * Field Name: mj_UpdatedAt
        * * Display Name: mj _ Updated At
        * * SQL Data Type: datetimeoffset`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type ConversationDetail_250606EntityType = z.infer<typeof ConversationDetail_250606Schema>;

/**
 * zod schema definition for the entity Conversation Detail Contents
 */
export const ConversationDetailContentSchema = z.object({
    ID: z.number().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: int`),
    ConversationDetailID: z.number().describe(`
        * * Field Name: ConversationDetailID
        * * Display Name: Conversation Detail ID
        * * SQL Data Type: int`),
    ContentID: z.number().describe(`
        * * Field Name: ContentID
        * * Display Name: Content ID
        * * SQL Data Type: int`),
    Score: z.number().describe(`
        * * Field Name: Score
        * * Display Name: Score
        * * SQL Data Type: float(53)`),
    mj_CreatedAt: z.date().describe(`
        * * Field Name: mj_CreatedAt
        * * Display Name: mj _Created At
        * * SQL Data Type: datetime`),
    mj_UpdatedAt: z.date().describe(`
        * * Field Name: mj_UpdatedAt
        * * Display Name: mj _Updated At
        * * SQL Data Type: datetime`),
    Title: z.string().nullable().describe(`
        * * Field Name: Title
        * * Display Name: Title
        * * SQL Data Type: nvarchar(100)`),
    UserLink: z.string().nullable().describe(`
        * * Field Name: UserLink
        * * Display Name: User Link
        * * SQL Data Type: nvarchar(250)`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type ConversationDetailContentEntityType = z.infer<typeof ConversationDetailContentSchema>;

/**
 * zod schema definition for the entity Conversation Details__betty
 */
export const ConversationDetail__bettySchema = z.object({
    ID: z.number().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: int`),
    ConversationID: z.number().describe(`
        * * Field Name: ConversationID
        * * Display Name: Conversation ID
        * * SQL Data Type: int`),
    Input: z.string().describe(`
        * * Field Name: Input
        * * Display Name: Input
        * * SQL Data Type: nvarchar(MAX)`),
    InputEmbeddingID: z.string().nullable().describe(`
        * * Field Name: InputEmbeddingID
        * * Display Name: Input Embedding ID
        * * SQL Data Type: nvarchar(50)`),
    Output: z.string().nullable().describe(`
        * * Field Name: Output
        * * Display Name: Output
        * * SQL Data Type: nvarchar(MAX)`),
    Error: z.string().nullable().describe(`
        * * Field Name: Error
        * * Display Name: Error
        * * SQL Data Type: nvarchar(MAX)`),
    DateCreated: z.date().describe(`
        * * Field Name: DateCreated
        * * Display Name: Date Created
        * * SQL Data Type: datetime`),
    SourceIP: z.string().nullable().describe(`
        * * Field Name: SourceIP
        * * Display Name: Source IP
        * * SQL Data Type: nvarchar(50)`),
    mj_CreatedAt: z.date().describe(`
        * * Field Name: mj_CreatedAt
        * * Display Name: mj _Created At
        * * SQL Data Type: datetime`),
    mj_UpdatedAt: z.date().describe(`
        * * Field Name: mj_UpdatedAt
        * * Display Name: mj _Updated At
        * * SQL Data Type: datetime`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type ConversationDetail__bettyEntityType = z.infer<typeof ConversationDetail__bettySchema>;

/**
 * zod schema definition for the entity Conversations__betty
 */
export const Conversation__bettySchema = z.object({
    ID: z.number().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: int`),
    OrganizationID: z.number().nullable().describe(`
        * * Field Name: OrganizationID
        * * Display Name: Organization ID
        * * SQL Data Type: int`),
    OrganizationKeyID: z.number().nullable().describe(`
        * * Field Name: OrganizationKeyID
        * * Display Name: Organization Key ID
        * * SQL Data Type: int`),
    UserID: z.string().nullable().describe(`
        * * Field Name: UserID
        * * Display Name: User ID
        * * SQL Data Type: nvarchar(255)`),
    DateCreated: z.date().nullable().describe(`
        * * Field Name: DateCreated
        * * Display Name: Date Created
        * * SQL Data Type: datetime`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type Conversation__bettyEntityType = z.infer<typeof Conversation__bettySchema>;

/**
 * zod schema definition for the entity Core Data Codes
 */
export const core_data_codesSchema = z.object({
    poscod: z.string().nullable().describe(`
        * * Field Name: poscod
        * * Display Name: Position Code
        * * SQL Data Type: char(2)`),
    pos_name: z.string().nullable().describe(`
        * * Field Name: pos_name
        * * Display Name: Position Name
        * * SQL Data Type: varchar(30)`),
    abbrev: z.string().nullable().describe(`
        * * Field Name: abbrev
        * * Display Name: Abbreviation
        * * SQL Data Type: varchar(25)`),
    ID: z.number().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: int`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type core_data_codesEntityType = z.infer<typeof core_data_codesSchema>;

/**
 * zod schema definition for the entity Core Datas
 */
export const Core_DataSchema = z.object({
    esssn: z.string().nullable().describe(`
        * * Field Name: esssn
        * * Display Name: Social Security Number
        * * SQL Data Type: varchar(100)`),
    co_dist_code: z.string().nullable().describe(`
        * * Field Name: co_dist_code
        * * Display Name: County District Code
        * * SQL Data Type: nvarchar(10)`),
    year: z.string().nullable().describe(`
        * * Field Name: year
        * * Display Name: Year
        * * SQL Data Type: nvarchar(10)`),
    pos_name: z.string().nullable().describe(`
        * * Field Name: pos_name
        * * Display Name: Position Name
        * * SQL Data Type: varchar(30)`),
    edlname: z.string().nullable().describe(`
        * * Field Name: edlname
        * * Display Name: Last Name
        * * SQL Data Type: varchar(50)`),
    edfname: z.string().nullable().describe(`
        * * Field Name: edfname
        * * Display Name: First Name
        * * SQL Data Type: varchar(50)`),
    edminit: z.string().nullable().describe(`
        * * Field Name: edminit
        * * Display Name: Middle Initial
        * * SQL Data Type: char(1)`),
    edrtsal: z.number().nullable().describe(`
        * * Field Name: edrtsal
        * * Display Name: Regular Term Salary
        * * SQL Data Type: int`),
    edttsal: z.number().nullable().describe(`
        * * Field Name: edttsal
        * * Display Name: Total Salary
        * * SQL Data Type: decimal(15, 2)`),
    edsbfte: z.number().nullable().describe(`
        * * Field Name: edsbfte
        * * Display Name: Full-Time Equivalent
        * * SQL Data Type: decimal(3, 2)`),
    edyrexdi: z.number().nullable().describe(`
        * * Field Name: edyrexdi
        * * Display Name: Years of Experience at District
        * * SQL Data Type: int`),
    edyrexmo: z.number().nullable().describe(`
        * * Field Name: edyrexmo
        * * Display Name: Years of Experience in Missouri
        * * SQL Data Type: int`),
    edhidgre: z.string().nullable().describe(`
        * * Field Name: edhidgre
        * * Display Name: Highest Degree Attained
        * * SQL Data Type: char(4)`),
    esposcod: z.string().nullable().describe(`
        * * Field Name: esposcod
        * * Display Name: Position Code
        * * SQL Data Type: char(2)`),
    esschool: z.string().nullable().describe(`
        * * Field Name: esschool
        * * Display Name: School Code
        * * SQL Data Type: nvarchar(6)`),
    ID: z.number().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: int`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type Core_DataEntityType = z.infer<typeof Core_DataSchema>;

/**
 * zod schema definition for the entity County District Codes
 */
export const co_dist_descSchema = z.object({
    co_dist_code: z.string().nullable().describe(`
        * * Field Name: co_dist_code
        * * Display Name: County District Code
        * * SQL Data Type: nvarchar(10)`),
    description: z.string().nullable().describe(`
        * * Field Name: description
        * * Display Name: Description
        * * SQL Data Type: varchar(80)`),
    co_dist_char: z.string().nullable().describe(`
        * * Field Name: co_dist_char
        * * Display Name: County District Code
        * * SQL Data Type: char(6)`),
    Street: z.string().nullable().describe(`
        * * Field Name: Street
        * * Display Name: Street
        * * SQL Data Type: varchar(75)`),
    Mail: z.string().nullable().describe(`
        * * Field Name: Mail
        * * Display Name: Mail
        * * SQL Data Type: varchar(75)`),
    City: z.string().nullable().describe(`
        * * Field Name: City
        * * Display Name: City
        * * SQL Data Type: varchar(75)`),
    State: z.string().nullable().describe(`
        * * Field Name: State
        * * Display Name: State
        * * SQL Data Type: varchar(75)`),
    Zip: z.string().nullable().describe(`
        * * Field Name: Zip
        * * Display Name: Zip
        * * SQL Data Type: varchar(75)`),
    Phone: z.string().nullable().describe(`
        * * Field Name: Phone
        * * Display Name: Phone
        * * SQL Data Type: varchar(25)`),
    Fax: z.string().nullable().describe(`
        * * Field Name: Fax
        * * Display Name: Fax
        * * SQL Data Type: varchar(25)`),
    Region: z.string().nullable().describe(`
        * * Field Name: Region
        * * Display Name: Region
        * * SQL Data Type: varchar(75)`),
    Sal_Region: z.string().nullable().describe(`
        * * Field Name: Sal_Region
        * * Display Name: Salary Region
        * * SQL Data Type: varchar(75)`),
    Sal_Region_BAK: z.string().nullable().describe(`
        * * Field Name: Sal_Region_BAK
        * * Display Name: Sal _Region _BAK
        * * SQL Data Type: varchar(75)`),
    Field_Area: z.string().nullable().describe(`
        * * Field Name: Field_Area
        * * Display Name: Field Area
        * * SQL Data Type: varchar(75)`),
    County: z.string().nullable().describe(`
        * * Field Name: County
        * * Display Name: County
        * * SQL Data Type: varchar(75)`),
    enabledthru: z.number().nullable().describe(`
        * * Field Name: enabledthru
        * * Display Name: enabledthru
        * * SQL Data Type: int`),
    ID: z.number().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: int`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type co_dist_descEntityType = z.infer<typeof co_dist_descSchema>;

/**
 * zod schema definition for the entity Course Descriptions
 */
export const crsassgnSchema = z.object({
    cassn: z.string().nullable().describe(`
        * * Field Name: cassn
        * * Display Name: Social Security Number
        * * SQL Data Type: varchar(100)`),
    cactydis: z.string().nullable().describe(`
        * * Field Name: cactydis
        * * Display Name: County District Code
        * * SQL Data Type: char(6)`),
    caschool: z.string().nullable().describe(`
        * * Field Name: caschool
        * * Display Name: School Code
        * * SQL Data Type: char(4)`),
    caposcod: z.string().nullable().describe(`
        * * Field Name: caposcod
        * * Display Name: Position Code
        * * SQL Data Type: char(2)`),
    cayear: z.string().nullable().describe(`
        * * Field Name: cayear
        * * Display Name: School Year
        * * SQL Data Type: nvarchar(4)`),
    caprogtp: z.string().nullable().describe(`
        * * Field Name: caprogtp
        * * Display Name: Vocational Project Type
        * * SQL Data Type: char(4)`),
    calineno: z.number().nullable().describe(`
        * * Field Name: calineno
        * * Display Name: Vocational Line Number
        * * SQL Data Type: int`),
    caasgnno: z.string().nullable().describe(`
        * * Field Name: caasgnno
        * * Display Name: Assignment Code
        * * SQL Data Type: char(2)`),
    csnum: z.string().nullable().describe(`
        * * Field Name: csnum
        * * Display Name: Course Number
        * * SQL Data Type: char(6)`),
    crsseq: z.number().nullable().describe(`
        * * Field Name: crsseq
        * * Display Name: Course Sequence
        * * SQL Data Type: int`),
    crsgrade: z.string().nullable().describe(`
        * * Field Name: crsgrade
        * * Display Name: Course Grade
        * * SQL Data Type: char(2)`),
    semester: z.number().nullable().describe(`
        * * Field Name: semester
        * * Display Name: Semester
        * * SQL Data Type: int`),
    pgmcode: z.string().nullable().describe(`
        * * Field Name: pgmcode
        * * Display Name: Program Code
        * * SQL Data Type: char(2)`),
    delivsys: z.string().nullable().describe(`
        * * Field Name: delivsys
        * * Display Name: Delivery System
        * * SQL Data Type: char(2)`),
    crsmin: z.number().nullable().describe(`
        * * Field Name: crsmin
        * * Display Name: Course Minutes
        * * SQL Data Type: int`),
    cacredit: z.number().nullable().describe(`
        * * Field Name: cacredit
        * * Display Name: Credit
        * * SQL Data Type: int`),
    enroll: z.number().nullable().describe(`
        * * Field Name: enroll
        * * Display Name: Total Enrollment
        * * SQL Data Type: int`),
    stumale: z.number().nullable().describe(`
        * * Field Name: stumale
        * * Display Name: Male Enrollment
        * * SQL Data Type: int`),
    stufml: z.number().nullable().describe(`
        * * Field Name: stufml
        * * Display Name: Female Enrollment
        * * SQL Data Type: int`),
    stublk: z.number().nullable().describe(`
        * * Field Name: stublk
        * * Display Name: Black Enrollment
        * * SQL Data Type: int`),
    stuwhit: z.number().nullable().describe(`
        * * Field Name: stuwhit
        * * Display Name: White Enrollment
        * * SQL Data Type: int`),
    stuhsp: z.number().nullable().describe(`
        * * Field Name: stuhsp
        * * Display Name: Hispanic Enrollment
        * * SQL Data Type: int`),
    stuasn: z.number().nullable().describe(`
        * * Field Name: stuasn
        * * Display Name: Asian Enrollment
        * * SQL Data Type: int`),
    stuind: z.number().nullable().describe(`
        * * Field Name: stuind
        * * Display Name: stuind
        * * SQL Data Type: int`),
    stuhan: z.number().nullable().describe(`
        * * Field Name: stuhan
        * * Display Name: Handicapped Enrollment
        * * SQL Data Type: int`),
    studis: z.number().nullable().describe(`
        * * Field Name: studis
        * * Display Name: Disadvantaged Enrollment
        * * SQL Data Type: int`),
    stuexit: z.number().nullable().describe(`
        * * Field Name: stuexit
        * * Display Name: Exitor Enrollment
        * * SQL Data Type: int`),
    stuadlt: z.number().nullable().describe(`
        * * Field Name: stuadlt
        * * Display Name: Adult Enrollment
        * * SQL Data Type: int`),
    casusp: z.string().nullable().describe(`
        * * Field Name: casusp
        * * Display Name: Suspension Flag
        * * SQL Data Type: char(1)`),
    casuspsu: z.string().nullable().describe(`
        * * Field Name: casuspsu
        * * Display Name: casuspsu
        * * SQL Data Type: char(1)`),
    casuspsd: z.string().nullable().describe(`
        * * Field Name: casuspsd
        * * Display Name: casuspsd
        * * SQL Data Type: char(1)`),
    casuspsf: z.string().nullable().describe(`
        * * Field Name: casuspsf
        * * Display Name: casuspsf
        * * SQL Data Type: char(1)`),
    casusptr: z.string().nullable().describe(`
        * * Field Name: casusptr
        * * Display Name: casusptr
        * * SQL Data Type: char(1)`),
    casuspvf: z.string().nullable().describe(`
        * * Field Name: casuspvf
        * * Display Name: casuspvf
        * * SQL Data Type: char(1)`),
    casuspve: z.string().nullable().describe(`
        * * Field Name: casuspve
        * * Display Name: casuspve
        * * SQL Data Type: char(1)`),
    caladate: z.date().nullable().describe(`
        * * Field Name: caladate
        * * Display Name: Last Access Date
        * * SQL Data Type: datetime`),
    calauser: z.string().nullable().describe(`
        * * Field Name: calauser
        * * Display Name: Last Access User
        * * SQL Data Type: char(4)`),
    cadelete: z.string().nullable().describe(`
        * * Field Name: cadelete
        * * Display Name: Delete Flag
        * * SQL Data Type: char(1)`),
    castdate: z.date().nullable().describe(`
        * * Field Name: castdate
        * * Display Name: Course Start Date
        * * SQL Data Type: datetime`),
    caendate: z.date().nullable().describe(`
        * * Field Name: caendate
        * * Display Name: Course End Date
        * * SQL Data Type: datetime`),
    caclsid: z.number().nullable().describe(`
        * * Field Name: caclsid
        * * Display Name: Course Special Education Class ID
        * * SQL Data Type: int`),
    caaide: z.number().nullable().describe(`
        * * Field Name: caaide
        * * Display Name: Course Special Education Aide
        * * SQL Data Type: int`),
    cacertid: z.string().nullable().describe(`
        * * Field Name: cacertid
        * * Display Name: Course Certification ID
        * * SQL Data Type: char(1)`),
    caeffect: z.date().nullable().describe(`
        * * Field Name: caeffect
        * * Display Name: Course Certification Effect Date
        * * SQL Data Type: datetime`),
    caexp: z.date().nullable().describe(`
        * * Field Name: caexp
        * * Display Name: Course Certification Expiration Date
        * * SQL Data Type: datetime`),
    casuspse: z.string().nullable().describe(`
        * * Field Name: casuspse
        * * Display Name: casuspse
        * * SQL Data Type: char(1)`),
    combined_classes: z.string().nullable().describe(`
        * * Field Name: combined_classes
        * * Display Name: Combined Classes
        * * SQL Data Type: char(3)`),
    comment: z.string().nullable().describe(`
        * * Field Name: comment
        * * Display Name: Comment
        * * SQL Data Type: varchar(255)`),
    ID: z.number().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: int`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type crsassgnEntityType = z.infer<typeof crsassgnSchema>;

/**
 * zod schema definition for the entity Educators
 */
export const educatorSchema = z.object({
    edssn: z.string().nullable().describe(`
        * * Field Name: edssn
        * * Display Name: Social Security Number
        * * SQL Data Type: varchar(100)`),
    year: z.string().nullable().describe(`
        * * Field Name: year
        * * Display Name: Year
        * * SQL Data Type: nvarchar(10)`),
    co_dist_code: z.string().nullable().describe(`
        * * Field Name: co_dist_code
        * * Display Name: County District Code
        * * SQL Data Type: nvarchar(10)`),
    edlname: z.string().nullable().describe(`
        * * Field Name: edlname
        * * Display Name: Last Name
        * * SQL Data Type: varchar(50)`),
    edfname: z.string().nullable().describe(`
        * * Field Name: edfname
        * * Display Name: First Name
        * * SQL Data Type: varchar(50)`),
    edminit: z.string().nullable().describe(`
        * * Field Name: edminit
        * * Display Name: Middle Initial
        * * SQL Data Type: char(1)`),
    edsex: z.string().nullable().describe(`
        * * Field Name: edsex
        * * Display Name: Sex
        * * SQL Data Type: char(1)`),
    edrace: z.string().nullable().describe(`
        * * Field Name: edrace
        * * Display Name: Race
        * * SQL Data Type: char(1)`),
    edcondur: z.number().nullable().describe(`
        * * Field Name: edcondur
        * * Display Name: Extended Contract Duration
        * * SQL Data Type: decimal(5, 2)`),
    edttsal: z.number().nullable().describe(`
        * * Field Name: edttsal
        * * Display Name: Total Salary
        * * SQL Data Type: int`),
    edrtsal: z.number().nullable().describe(`
        * * Field Name: edrtsal
        * * Display Name: Regular Term Salary
        * * SQL Data Type: int`),
    edecsal: z.number().nullable().describe(`
        * * Field Name: edecsal
        * * Display Name: Extended Contract Salary
        * * SQL Data Type: int`),
    ededsal: z.number().nullable().describe(`
        * * Field Name: ededsal
        * * Display Name: Extra Duty Salary
        * * SQL Data Type: int`),
    edminsal: z.number().nullable().describe(`
        * * Field Name: edminsal
        * * Display Name: Minimum Salary Supplement
        * * SQL Data Type: int`),
    carladr: z.string().nullable().describe(`
        * * Field Name: carladr
        * * Display Name: Car Lad Step
        * * SQL Data Type: char(1)`),
    edhidgre: z.string().nullable().describe(`
        * * Field Name: edhidgre
        * * Display Name: Highest Degree Attained
        * * SQL Data Type: char(4)`),
    edyrexdi: z.number().nullable().describe(`
        * * Field Name: edyrexdi
        * * Display Name: Years of Experience in District
        * * SQL Data Type: int`),
    edyrexmo: z.number().nullable().describe(`
        * * Field Name: edyrexmo
        * * Display Name: Years of Experience in Missouri
        * * SQL Data Type: int`),
    edyrexpb: z.number().nullable().describe(`
        * * Field Name: edyrexpb
        * * Display Name: Years of Experience in Public Schools
        * * SQL Data Type: int`),
    latehire: z.string().nullable().describe(`
        * * Field Name: latehire
        * * Display Name: Late Hire
        * * SQL Data Type: char(4)`),
    erlyterm: z.string().nullable().describe(`
        * * Field Name: erlyterm
        * * Display Name: Early Termination
        * * SQL Data Type: char(4)`),
    edttmin: z.number().nullable().describe(`
        * * Field Name: edttmin
        * * Display Name: Total Minutes
        * * SQL Data Type: int`),
    edttfte: z.number().nullable().describe(`
        * * Field Name: edttfte
        * * Display Name: Total FTE
        * * SQL Data Type: decimal(3, 2)`),
    edshared: z.string().nullable().describe(`
        * * Field Name: edshared
        * * Display Name: Shared Districts
        * * SQL Data Type: char(1)`),
    edcommt: z.string().nullable().describe(`
        * * Field Name: edcommt
        * * Display Name: Educator Comments
        * * SQL Data Type: varchar(1020)`),
    edsusp: z.string().nullable().describe(`
        * * Field Name: edsusp
        * * Display Name: Suspended
        * * SQL Data Type: char(1)`),
    edsuspsu: z.string().nullable().describe(`
        * * Field Name: edsuspsu
        * * Display Name: edsuspsu
        * * SQL Data Type: char(1)`),
    edsuspsd: z.string().nullable().describe(`
        * * Field Name: edsuspsd
        * * Display Name: edsuspsd
        * * SQL Data Type: char(1)`),
    edsuspsf: z.string().nullable().describe(`
        * * Field Name: edsuspsf
        * * Display Name: edsuspsf
        * * SQL Data Type: char(1)`),
    edsusptr: z.string().nullable().describe(`
        * * Field Name: edsusptr
        * * Display Name: edsusptr
        * * SQL Data Type: char(1)`),
    edsuspvf: z.string().nullable().describe(`
        * * Field Name: edsuspvf
        * * Display Name: edsuspvf
        * * SQL Data Type: char(1)`),
    edsuspve: z.string().nullable().describe(`
        * * Field Name: edsuspve
        * * Display Name: edsuspve
        * * SQL Data Type: char(1)`),
    edladate: z.date().nullable().describe(`
        * * Field Name: edladate
        * * Display Name: Date of Last Update
        * * SQL Data Type: datetime`),
    edlauser: z.string().nullable().describe(`
        * * Field Name: edlauser
        * * Display Name: Date of Last User Update
        * * SQL Data Type: char(4)`),
    eddelete: z.string().nullable().describe(`
        * * Field Name: eddelete
        * * Display Name: Delete Flag
        * * SQL Data Type: char(1)`),
    edfiscal: z.string().nullable().describe(`
        * * Field Name: edfiscal
        * * Display Name: Fiscal Agent County Code
        * * SQL Data Type: char(6)`),
    edcondms: z.number().nullable().describe(`
        * * Field Name: edcondms
        * * Display Name: Contract Duration - Minimum Salary
        * * SQL Data Type: int`),
    edhqpdev: z.string().nullable().describe(`
        * * Field Name: edhqpdev
        * * Display Name: edhqpdev
        * * SQL Data Type: char(1)`),
    edemail: z.string().nullable().describe(`
        * * Field Name: edemail
        * * Display Name: Email
        * * SQL Data Type: varchar(255)`),
    ID: z.number().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: int`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type educatorEntityType = z.infer<typeof educatorSchema>;

/**
 * zod schema definition for the entity Enrolments
 */
export const Table_5Schema = z.object({
    District: z.string().nullable().describe(`
        * * Field Name: District
        * * Display Name: County District Code
        * * SQL Data Type: nvarchar(6)`),
    District_Name: z.string().nullable().describe(`
        * * Field Name: District Name
        * * Display Name: District  Name
        * * SQL Data Type: nvarchar(255)`),
    Enrollment: z.number().nullable().describe(`
        * * Field Name: Enrollment
        * * Display Name: Enrollment
        * * SQL Data Type: float(53)`),
    ID: z.number().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: int`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type Table_5EntityType = z.infer<typeof Table_5Schema>;

/**
 * zod schema definition for the entity Events
 */
export const NU__Event__cSchema = z.object({
    Id: z.string().describe(`
        * * Field Name: Id
        * * Display Name: Id
        * * SQL Data Type: nvarchar(50)`),
    IsDeleted: z.boolean().nullable().describe(`
        * * Field Name: IsDeleted
        * * Display Name: Is Deleted
        * * SQL Data Type: bit`),
    Name: z.string().nullable().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(MAX)`),
    RecordTypeId: z.string().nullable().describe(`
        * * Field Name: RecordTypeId
        * * Display Name: Record Type Id
        * * SQL Data Type: nvarchar(MAX)`),
    CreatedById: z.string().nullable().describe(`
        * * Field Name: CreatedById
        * * Display Name: Created By Id
        * * SQL Data Type: nvarchar(MAX)`),
    LastModifiedDate: z.date().nullable().describe(`
        * * Field Name: LastModifiedDate
        * * Display Name: Last Modified Date
        * * SQL Data Type: datetimeoffset`),
    LastModifiedById: z.string().nullable().describe(`
        * * Field Name: LastModifiedById
        * * Display Name: Last Modified By Id
        * * SQL Data Type: nvarchar(MAX)`),
    SystemModstamp: z.date().nullable().describe(`
        * * Field Name: SystemModstamp
        * * Display Name: System Modstamp
        * * SQL Data Type: datetimeoffset`),
    LastActivityDate: z.date().nullable().describe(`
        * * Field Name: LastActivityDate
        * * Display Name: Last Activity Date
        * * SQL Data Type: datetimeoffset`),
    LastViewedDate: z.date().nullable().describe(`
        * * Field Name: LastViewedDate
        * * Display Name: Last Viewed Date
        * * SQL Data Type: datetimeoffset`),
    LastReferencedDate: z.date().nullable().describe(`
        * * Field Name: LastReferencedDate
        * * Display Name: Last Referenced Date
        * * SQL Data Type: datetimeoffset`),
    NU__Entity__c: z.string().nullable().describe(`
        * * Field Name: NU__Entity__c
        * * Display Name: NU__Entity __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__ActualCost__c: z.number().nullable().describe(`
        * * Field Name: NU__ActualCost__c
        * * Display Name: NU__Actual Cost __c
        * * SQL Data Type: decimal(18, 2)`),
    NU__ActualRevenue__c: z.number().nullable().describe(`
        * * Field Name: NU__ActualRevenue__c
        * * Display Name: NU__Actual Revenue __c
        * * SQL Data Type: decimal(18, 2)`),
    NU__AddressLine1__c: z.string().nullable().describe(`
        * * Field Name: NU__AddressLine1__c
        * * Display Name: NU__Address Line 1__c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__AddressLine2__c: z.string().nullable().describe(`
        * * Field Name: NU__AddressLine2__c
        * * Display Name: NU__Address Line 2__c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__AllowCoWorkerRegistration__c: z.boolean().nullable().describe(`
        * * Field Name: NU__AllowCoWorkerRegistration__c
        * * Display Name: NU__Allow Co Worker Registration __c
        * * SQL Data Type: bit`),
    NU__AllowGuestRegistration__c: z.boolean().nullable().describe(`
        * * Field Name: NU__AllowGuestRegistration__c
        * * Display Name: NU__Allow Guest Registration __c
        * * SQL Data Type: bit`),
    NU__AllowSingleClickRegistration__c: z.boolean().nullable().describe(`
        * * Field Name: NU__AllowSingleClickRegistration__c
        * * Display Name: NU__Allow Single Click Registration __c
        * * SQL Data Type: bit`),
    NU__BadgeLogo__c: z.string().nullable().describe(`
        * * Field Name: NU__BadgeLogo__c
        * * Display Name: NU__Badge Logo __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__BudgetedCosts__c: z.number().nullable().describe(`
        * * Field Name: NU__BudgetedCosts__c
        * * Display Name: NU__Budgeted Costs __c
        * * SQL Data Type: decimal(18, 2)`),
    NU__CentralPhoneNumber__c: z.string().nullable().describe(`
        * * Field Name: NU__CentralPhoneNumber__c
        * * Display Name: NU__Central Phone Number __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__CheckInTime__c: z.date().nullable().describe(`
        * * Field Name: NU__CheckInTime__c
        * * Display Name: NU__Check In Time __c
        * * SQL Data Type: datetimeoffset`),
    NU__City__c: z.string().nullable().describe(`
        * * Field Name: NU__City__c
        * * Display Name: NU__City __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__ConfirmationText2__c: z.string().nullable().describe(`
        * * Field Name: NU__ConfirmationText2__c
        * * Display Name: NU__Confirmation Text 2__c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__ConfirmationText__c: z.string().nullable().describe(`
        * * Field Name: NU__ConfirmationText__c
        * * Display Name: NU__Confirmation Text __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Country__c: z.string().nullable().describe(`
        * * Field Name: NU__Country__c
        * * Display Name: NU__Country __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Description__c: z.string().nullable().describe(`
        * * Field Name: NU__Description__c
        * * Display Name: NU__Description __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Directions__c: z.string().nullable().describe(`
        * * Field Name: NU__Directions__c
        * * Display Name: NU__Directions __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__EarlyRegistrationCutOffDate__c: z.date().nullable().describe(`
        * * Field Name: NU__EarlyRegistrationCutOffDate__c
        * * Display Name: NU__Early Registration Cut Off Date __c
        * * SQL Data Type: datetimeoffset`),
    NU__EndDate__c: z.date().nullable().describe(`
        * * Field Name: NU__EndDate__c
        * * Display Name: NU__End Date __c
        * * SQL Data Type: datetimeoffset`),
    NU__EntityLogoOnBadgeEnabled__c: z.boolean().nullable().describe(`
        * * Field Name: NU__EntityLogoOnBadgeEnabled__c
        * * Display Name: NU__Entity Logo On Badge Enabled __c
        * * SQL Data Type: bit`),
    NU__EventDetailsUrl__c: z.string().nullable().describe(`
        * * Field Name: NU__EventDetailsUrl__c
        * * Display Name: Event Details URL
        * * SQL Data Type: nvarchar(MAX)`),
    NU__ExpectedRevenue__c: z.number().nullable().describe(`
        * * Field Name: NU__ExpectedRevenue__c
        * * Display Name: NU__Expected Revenue __c
        * * SQL Data Type: decimal(18, 2)`),
    NU__ExternalID__c: z.string().nullable().describe(`
        * * Field Name: NU__ExternalID__c
        * * Display Name: NU__External ID__c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__GuestPageDescription__c: z.string().nullable().describe(`
        * * Field Name: NU__GuestPageDescription__c
        * * Display Name: NU__Guest Page Description __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Hidden__c: z.boolean().nullable().describe(`
        * * Field Name: NU__Hidden__c
        * * Display Name: NU__Hidden __c
        * * SQL Data Type: bit`),
    NU__InvoiceText__c: z.string().nullable().describe(`
        * * Field Name: NU__InvoiceText__c
        * * Display Name: NU__Invoice Text __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__LegacyEventID__c: z.string().nullable().describe(`
        * * Field Name: NU__LegacyEventID__c
        * * Display Name: NU__Legacy Event ID__c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Location__c: z.string().nullable().describe(`
        * * Field Name: NU__Location__c
        * * Display Name: Event Location
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Logo__c: z.string().nullable().describe(`
        * * Field Name: NU__Logo__c
        * * Display Name: NU__Logo __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__MaxNumberOfRegistrations__c: z.number().nullable().describe(`
        * * Field Name: NU__MaxNumberOfRegistrations__c
        * * Display Name: NU__Max Number Of Registrations __c
        * * SQL Data Type: decimal(10, 0)`),
    NU__PostalCode__c: z.string().nullable().describe(`
        * * Field Name: NU__PostalCode__c
        * * Display Name: NU__Postal Code __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__QuestionPageDescription__c: z.string().nullable().describe(`
        * * Field Name: NU__QuestionPageDescription__c
        * * Display Name: NU__Question Page Description __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__RegistrantPageDescription__c: z.string().nullable().describe(`
        * * Field Name: NU__RegistrantPageDescription__c
        * * Display Name: NU__Registrant Page Description __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__RegistrantSelectionPageDescription__c: z.string().nullable().describe(`
        * * Field Name: NU__RegistrantSelectionPageDescription__c
        * * Display Name: NU__Registrant Selection Page Description __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__RegistrationUrl__c: z.string().nullable().describe(`
        * * Field Name: NU__RegistrationUrl__c
        * * Display Name: Event Registration URL
        * * SQL Data Type: nvarchar(MAX)`),
    NU__RegularRegistrationCutOffDate__c: z.date().nullable().describe(`
        * * Field Name: NU__RegularRegistrationCutOffDate__c
        * * Display Name: NU__Regular Registration Cut Off Date __c
        * * SQL Data Type: datetimeoffset`),
    NU__RestrictTo__c: z.string().nullable().describe(`
        * * Field Name: NU__RestrictTo__c
        * * Display Name: NU__Restrict To __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__RoomNameNumber__c: z.string().nullable().describe(`
        * * Field Name: NU__RoomNameNumber__c
        * * Display Name: NU__Room Name Number __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__SelfServiceEnabled__c: z.boolean().nullable().describe(`
        * * Field Name: NU__SelfServiceEnabled__c
        * * Display Name: NU__Self Service Enabled __c
        * * SQL Data Type: bit`),
    NU__SessionPageDescription__c: z.string().nullable().describe(`
        * * Field Name: NU__SessionPageDescription__c
        * * Display Name: NU__Session Page Description __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__ShortName__c: z.string().nullable().describe(`
        * * Field Name: NU__ShortName__c
        * * Display Name: NU__Short Name __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__StaffContact__c: z.string().nullable().describe(`
        * * Field Name: NU__StaffContact__c
        * * Display Name: NU__Staff Contact __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__StartDate__c: z.date().nullable().describe(`
        * * Field Name: NU__StartDate__c
        * * Display Name: NU__Start Date __c
        * * SQL Data Type: datetimeoffset`),
    NU__StateProvince__c: z.string().nullable().describe(`
        * * Field Name: NU__StateProvince__c
        * * Display Name: NU__State Province __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__StatusFlag__c: z.string().nullable().describe(`
        * * Field Name: NU__StatusFlag__c
        * * Display Name: NU__Status Flag __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Status__c: z.string().nullable().describe(`
        * * Field Name: NU__Status__c
        * * Display Name: Status
        * * SQL Data Type: nvarchar(MAX)`),
    NU__SummaryPageDescription__c: z.string().nullable().describe(`
        * * Field Name: NU__SummaryPageDescription__c
        * * Display Name: NU__Summary Page Description __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__TwitterEventDetailTweet__c: z.string().nullable().describe(`
        * * Field Name: NU__TwitterEventDetailTweet__c
        * * Display Name: NU__Twitter Event Detail Tweet __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__TwitterOrderSummaryTweet__c: z.string().nullable().describe(`
        * * Field Name: NU__TwitterOrderSummaryTweet__c
        * * Display Name: NU__Twitter Order Summary Tweet __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Twitter_Hash_Tag__c: z.string().nullable().describe(`
        * * Field Name: NU__Twitter_Hash_Tag__c
        * * Display Name: NU__Twitter _Hash _Tag __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Type__c: z.string().nullable().describe(`
        * * Field Name: NU__Type__c
        * * Display Name: Event Type
        * * SQL Data Type: nvarchar(MAX)`),
    NU__WebRegistrationEndDate__c: z.date().nullable().describe(`
        * * Field Name: NU__WebRegistrationEndDate__c
        * * Display Name: NU__Web Registration End Date __c
        * * SQL Data Type: datetimeoffset`),
    NU__WebRegistrationStartDate__c: z.date().nullable().describe(`
        * * Field Name: NU__WebRegistrationStartDate__c
        * * Display Name: NU__Web Registration Start Date __c
        * * SQL Data Type: datetimeoffset`),
    NU__TotalCancellations2__c: z.number().nullable().describe(`
        * * Field Name: NU__TotalCancellations2__c
        * * Display Name: NU__Total Cancellations 2__c
        * * SQL Data Type: decimal(18, 0)`),
    NU__TotalCancellations__c: z.number().nullable().describe(`
        * * Field Name: NU__TotalCancellations__c
        * * Display Name: NU__Total Cancellations __c
        * * SQL Data Type: decimal(18, 0)`),
    NU__TotalRegistrants2__c: z.number().nullable().describe(`
        * * Field Name: NU__TotalRegistrants2__c
        * * Display Name: Total Registrants
        * * SQL Data Type: decimal(18, 0)`),
    NU__TotalRegistrants__c: z.number().nullable().describe(`
        * * Field Name: NU__TotalRegistrants__c
        * * Display Name: NU__Total Registrants __c
        * * SQL Data Type: decimal(18, 0)`),
    Committee__c: z.string().nullable().describe(`
        * * Field Name: Committee__c
        * * Display Name: Committee __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__IsCancellable__c: z.boolean().nullable().describe(`
        * * Field Name: NU__IsCancellable__c
        * * Display Name: NU__Is Cancellable __c
        * * SQL Data Type: bit`),
    MobileActive__c: z.boolean().nullable().describe(`
        * * Field Name: MobileActive__c
        * * Display Name: Mobile Active __c
        * * SQL Data Type: bit`),
    MobileFeedUrl__c: z.string().nullable().describe(`
        * * Field Name: MobileFeedUrl__c
        * * Display Name: Mobile Feed Url __c
        * * SQL Data Type: nvarchar(MAX)`),
    MobileHideNewsEntriesDate__c: z.boolean().nullable().describe(`
        * * Field Name: MobileHideNewsEntriesDate__c
        * * Display Name: Mobile Hide News Entries Date __c
        * * SQL Data Type: bit`),
    MobileItineraryTitle__c: z.string().nullable().describe(`
        * * Field Name: MobileItineraryTitle__c
        * * Display Name: Mobile Itinerary Title __c
        * * SQL Data Type: nvarchar(MAX)`),
    MobileNewsTitle__c: z.string().nullable().describe(`
        * * Field Name: MobileNewsTitle__c
        * * Display Name: Mobile News Title __c
        * * SQL Data Type: nvarchar(MAX)`),
    MobileNewsTwitterIcon__c: z.string().nullable().describe(`
        * * Field Name: MobileNewsTwitterIcon__c
        * * Display Name: Mobile News Twitter Icon __c
        * * SQL Data Type: nvarchar(MAX)`),
    MobileNewsTwitterTitle__c: z.string().nullable().describe(`
        * * Field Name: MobileNewsTwitterTitle__c
        * * Display Name: Mobile News Twitter Title __c
        * * SQL Data Type: nvarchar(MAX)`),
    MobileScheduleItineraryIcon__c: z.string().nullable().describe(`
        * * Field Name: MobileScheduleItineraryIcon__c
        * * Display Name: Mobile Schedule Itinerary Icon __c
        * * SQL Data Type: nvarchar(MAX)`),
    MobileScheduleItineraryTitle__c: z.string().nullable().describe(`
        * * Field Name: MobileScheduleItineraryTitle__c
        * * Display Name: Mobile Schedule Itinerary Title __c
        * * SQL Data Type: nvarchar(MAX)`),
    MobileScheduleTitle__c: z.string().nullable().describe(`
        * * Field Name: MobileScheduleTitle__c
        * * Display Name: Mobile Schedule Title __c
        * * SQL Data Type: nvarchar(MAX)`),
    MobileSection1Content__c: z.string().nullable().describe(`
        * * Field Name: MobileSection1Content__c
        * * Display Name: Mobile Section 1Content __c
        * * SQL Data Type: nvarchar(MAX)`),
    MobileSection1Icon__c: z.string().nullable().describe(`
        * * Field Name: MobileSection1Icon__c
        * * Display Name: Mobile Section 1Icon __c
        * * SQL Data Type: nvarchar(MAX)`),
    MobileSection1Title__c: z.string().nullable().describe(`
        * * Field Name: MobileSection1Title__c
        * * Display Name: Mobile Section 1Title __c
        * * SQL Data Type: nvarchar(MAX)`),
    MobileSection2Content__c: z.string().nullable().describe(`
        * * Field Name: MobileSection2Content__c
        * * Display Name: Mobile Section 2Content __c
        * * SQL Data Type: nvarchar(MAX)`),
    MobileSection2Icon__c: z.string().nullable().describe(`
        * * Field Name: MobileSection2Icon__c
        * * Display Name: Mobile Section 2Icon __c
        * * SQL Data Type: nvarchar(MAX)`),
    MobileSection2Title__c: z.string().nullable().describe(`
        * * Field Name: MobileSection2Title__c
        * * Display Name: Mobile Section 2Title __c
        * * SQL Data Type: nvarchar(MAX)`),
    MobileSection3Content__c: z.string().nullable().describe(`
        * * Field Name: MobileSection3Content__c
        * * Display Name: Mobile Section 3Content __c
        * * SQL Data Type: nvarchar(MAX)`),
    MobileSection3Icon__c: z.string().nullable().describe(`
        * * Field Name: MobileSection3Icon__c
        * * Display Name: Mobile Section 3Icon __c
        * * SQL Data Type: nvarchar(MAX)`),
    MobileSection3Title__c: z.string().nullable().describe(`
        * * Field Name: MobileSection3Title__c
        * * Display Name: Mobile Section 3Title __c
        * * SQL Data Type: nvarchar(MAX)`),
    MobileSpeakersIcon__c: z.string().nullable().describe(`
        * * Field Name: MobileSpeakersIcon__c
        * * Display Name: Mobile Speakers Icon __c
        * * SQL Data Type: nvarchar(MAX)`),
    MobileSpeakersTitle__c: z.string().nullable().describe(`
        * * Field Name: MobileSpeakersTitle__c
        * * Display Name: Mobile Speakers Title __c
        * * SQL Data Type: nvarchar(MAX)`),
    MobileSponsorsIcon__c: z.string().nullable().describe(`
        * * Field Name: MobileSponsorsIcon__c
        * * Display Name: Mobile Sponsors Icon __c
        * * SQL Data Type: nvarchar(MAX)`),
    MobileSponsorsTitle__c: z.string().nullable().describe(`
        * * Field Name: MobileSponsorsTitle__c
        * * Display Name: Mobile Sponsors Title __c
        * * SQL Data Type: nvarchar(MAX)`),
    MobileTwitterTitle__c: z.string().nullable().describe(`
        * * Field Name: MobileTwitterTitle__c
        * * Display Name: Mobile Twitter Title __c
        * * SQL Data Type: nvarchar(MAX)`),
    ChatterGroupId__c: z.string().nullable().describe(`
        * * Field Name: ChatterGroupId__c
        * * Display Name: Chatter Group Id __c
        * * SQL Data Type: nvarchar(MAX)`),
    CommunityGroup__c: z.boolean().nullable().describe(`
        * * Field Name: CommunityGroup__c
        * * Display Name: Community Group __c
        * * SQL Data Type: bit`),
    IsBTAEvent__c: z.boolean().nullable().describe(`
        * * Field Name: IsBTAEvent__c
        * * Display Name: Is BTAEvent __c
        * * SQL Data Type: bit`),
    NU__IsEditable__c: z.boolean().nullable().describe(`
        * * Field Name: NU__IsEditable__c
        * * Display Name: NU__Is Editable __c
        * * SQL Data Type: bit`),
    NU__RegistrationModificationCutOffDate__c: z.date().nullable().describe(`
        * * Field Name: NU__RegistrationModificationCutOffDate__c
        * * Display Name: NU__Registration Modification Cut Off Date __c
        * * SQL Data Type: datetimeoffset`),
    NU__WaitlistActiveInSelfService__c: z.boolean().nullable().describe(`
        * * Field Name: NU__WaitlistActiveInSelfService__c
        * * Display Name: NU__Waitlist Active In Self Service __c
        * * SQL Data Type: bit`),
    NU__WaitlistEnabled__c: z.boolean().nullable().describe(`
        * * Field Name: NU__WaitlistEnabled__c
        * * Display Name: NU__Waitlist Enabled __c
        * * SQL Data Type: bit`),
    NU__RegistrationCountLastUpdated__c: z.date().nullable().describe(`
        * * Field Name: NU__RegistrationCountLastUpdated__c
        * * Display Name: NU__Registration Count Last Updated __c
        * * SQL Data Type: datetimeoffset`),
    NU__ShortDescription__c: z.string().nullable().describe(`
        * * Field Name: NU__ShortDescription__c
        * * Display Name: NU__Short Description __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__TotalCancellations3__c: z.number().nullable().describe(`
        * * Field Name: NU__TotalCancellations3__c
        * * Display Name: NU__Total Cancellations 3__c
        * * SQL Data Type: decimal(18, 0)`),
    NU__TotalRegistrants3__c: z.number().nullable().describe(`
        * * Field Name: NU__TotalRegistrants3__c
        * * Display Name: NU__Total Registrants 3__c
        * * SQL Data Type: decimal(18, 0)`),
    NC__CollectBadge__c: z.boolean().nullable().describe(`
        * * Field Name: NC__CollectBadge__c
        * * Display Name: NC__Collect Badge __c
        * * SQL Data Type: bit`),
    NC__CommunityHubEventUrl__c: z.string().nullable().describe(`
        * * Field Name: NC__CommunityHubEventUrl__c
        * * Display Name: NC__Community Hub Event Url __c
        * * SQL Data Type: nvarchar(MAX)`),
    InxpoShowKey__c: z.string().nullable().describe(`
        * * Field Name: InxpoShowKey__c
        * * Display Name: Inxpo Show Key __c
        * * SQL Data Type: nvarchar(MAX)`),
    InxpoShowPackageKey__c: z.string().nullable().describe(`
        * * Field Name: InxpoShowPackageKey__c
        * * Display Name: Inxpo Show Package Key __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__CollectBadge__c: z.boolean().nullable().describe(`
        * * Field Name: NU__CollectBadge__c
        * * Display Name: NU__Collect Badge __c
        * * SQL Data Type: bit`),
    NU_CBCW__LMSErrorMessage__c: z.string().nullable().describe(`
        * * Field Name: NU_CBCW__LMSErrorMessage__c
        * * Display Name: NU_CBCW__LMSError Message __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU_CBCW__LMSExternalId__c: z.string().nullable().describe(`
        * * Field Name: NU_CBCW__LMSExternalId__c
        * * Display Name: NU_CBCW__LMSExternal Id __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU_CBCW__LMSSynchronizationStatus__c: z.string().nullable().describe(`
        * * Field Name: NU_CBCW__LMSSynchronizationStatus__c
        * * Display Name: NU_CBCW__LMSSynchronization Status __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU_CBCW__SyncWithLMS__c: z.boolean().nullable().describe(`
        * * Field Name: NU_CBCW__SyncWithLMS__c
        * * Display Name: NU_CBCW__Sync With LMS__c
        * * SQL Data Type: bit`),
    namz__EventQuestionCount__c: z.number().nullable().describe(`
        * * Field Name: namz__EventQuestionCount__c
        * * Display Name: namz __Event Question Count __c
        * * SQL Data Type: decimal(18, 0)`),
    namz__EventSessionGroupCount__c: z.number().nullable().describe(`
        * * Field Name: namz__EventSessionGroupCount__c
        * * Display Name: namz __Event Session Group Count __c
        * * SQL Data Type: decimal(18, 0)`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Troubleshoot: z.string().nullable().describe(`
        * * Field Name: Troubleshoot
        * * Display Name: Troubleshoot
        * * SQL Data Type: nvarchar(50)`),
});

export type NU__Event__cEntityType = z.infer<typeof NU__Event__cSchema>;

/**
 * zod schema definition for the entity Memberships
 */
export const NU__Membership__cSchema = z.object({
    Id: z.string().describe(`
        * * Field Name: Id
        * * Display Name: Id
        * * SQL Data Type: nvarchar(50)`),
    IsDeleted: z.boolean().nullable().describe(`
        * * Field Name: IsDeleted
        * * Display Name: Is Deleted
        * * SQL Data Type: bit`),
    Name: z.string().nullable().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(MAX)`),
    CreatedById: z.string().nullable().describe(`
        * * Field Name: CreatedById
        * * Display Name: Created By Id
        * * SQL Data Type: nvarchar(MAX)`),
    LastModifiedDate: z.date().nullable().describe(`
        * * Field Name: LastModifiedDate
        * * Display Name: Last Modified Date
        * * SQL Data Type: datetimeoffset`),
    LastModifiedById: z.string().nullable().describe(`
        * * Field Name: LastModifiedById
        * * Display Name: Last Modified By Id
        * * SQL Data Type: nvarchar(MAX)`),
    SystemModstamp: z.date().nullable().describe(`
        * * Field Name: SystemModstamp
        * * Display Name: System Modstamp
        * * SQL Data Type: datetimeoffset`),
    LastActivityDate: z.date().nullable().describe(`
        * * Field Name: LastActivityDate
        * * Display Name: Last Activity Date
        * * SQL Data Type: datetimeoffset`),
    LastViewedDate: z.date().nullable().describe(`
        * * Field Name: LastViewedDate
        * * Display Name: Last Viewed Date
        * * SQL Data Type: datetimeoffset`),
    LastReferencedDate: z.date().nullable().describe(`
        * * Field Name: LastReferencedDate
        * * Display Name: Last Referenced Date
        * * SQL Data Type: datetimeoffset`),
    NU__Account__c: z.string().nullable().describe(`
        * * Field Name: NU__Account__c
        * * Display Name: NU__Account __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__MembershipType__c: z.string().nullable().describe(`
        * * Field Name: NU__MembershipType__c
        * * Display Name: NU__Membership Type __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Amount__c: z.number().nullable().describe(`
        * * Field Name: NU__Amount__c
        * * Display Name: NU__Amount __c
        * * SQL Data Type: decimal(18, 2)`),
    NU__Balance__c: z.number().nullable().describe(`
        * * Field Name: NU__Balance__c
        * * Display Name: NU__Balance __c
        * * SQL Data Type: decimal(18, 2)`),
    NU__Category__c: z.string().nullable().describe(`
        * * Field Name: NU__Category__c
        * * Display Name: Membership Category
        * * SQL Data Type: nvarchar(MAX)`),
    NU__CustomerEmail__c: z.string().nullable().describe(`
        * * Field Name: NU__CustomerEmail__c
        * * Display Name: Customer Email
        * * SQL Data Type: nvarchar(MAX)`),
    NU__EndDate__c: z.date().nullable().describe(`
        * * Field Name: NU__EndDate__c
        * * Display Name: NU__End Date __c
        * * SQL Data Type: datetimeoffset`),
    NU__EntityName__c: z.string().nullable().describe(`
        * * Field Name: NU__EntityName__c
        * * Display Name: Entity Name
        * * SQL Data Type: nvarchar(MAX)`),
    NU__ExternalAmount__c: z.number().nullable().describe(`
        * * Field Name: NU__ExternalAmount__c
        * * Display Name: NU__External Amount __c
        * * SQL Data Type: decimal(11, 2)`),
    NU__ExternalID__c: z.string().nullable().describe(`
        * * Field Name: NU__ExternalID__c
        * * Display Name: NU__External ID__c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__MembershipProductName__c: z.string().nullable().describe(`
        * * Field Name: NU__MembershipProductName__c
        * * Display Name: Member Product Name
        * * SQL Data Type: nvarchar(MAX)`),
    NU__OrderItemLine__c: z.string().nullable().describe(`
        * * Field Name: NU__OrderItemLine__c
        * * Display Name: NU__Order Item Line __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__OrderItem__c: z.string().nullable().describe(`
        * * Field Name: NU__OrderItem__c
        * * Display Name: NU__Order Item __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Pending__c: z.boolean().nullable().describe(`
        * * Field Name: NU__Pending__c
        * * Display Name: NU__Pending __c
        * * SQL Data Type: bit`),
    NU__PrimaryAffiliation__c: z.string().nullable().describe(`
        * * Field Name: NU__PrimaryAffiliation__c
        * * Display Name: NU__Primary Affiliation __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Search__c: z.string().nullable().describe(`
        * * Field Name: NU__Search__c
        * * Display Name: Member Name
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Stage__c: z.string().nullable().describe(`
        * * Field Name: NU__Stage__c
        * * Display Name: NU__Stage __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__StartDate__c: z.date().nullable().describe(`
        * * Field Name: NU__StartDate__c
        * * Display Name: NU__Start Date __c
        * * SQL Data Type: datetimeoffset`),
    NU__StatusFlag__c: z.string().nullable().describe(`
        * * Field Name: NU__StatusFlag__c
        * * Display Name: NU__Status Flag __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Status__c: z.string().nullable().describe(`
        * * Field Name: NU__Status__c
        * * Display Name: Member Status
        * * SQL Data Type: nvarchar(MAX)`),
    NU__TotalPayment__c: z.number().nullable().describe(`
        * * Field Name: NU__TotalPayment__c
        * * Display Name: NU__Total Payment __c
        * * SQL Data Type: decimal(18, 2)`),
    AccrualDues__c: z.string().nullable().describe(`
        * * Field Name: AccrualDues__c
        * * Display Name: Accrual Dues __c
        * * SQL Data Type: nvarchar(MAX)`),
    Need_Member_Application__c: z.boolean().nullable().describe(`
        * * Field Name: Need_Member_Application__c
        * * Display Name: Need _Member _Application __c
        * * SQL Data Type: bit`),
    NU__PrimaryContactEmail__c: z.string().nullable().describe(`
        * * Field Name: NU__PrimaryContactEmail__c
        * * Display Name: NU__Primary Contact Email __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__PrimaryContactName__c: z.string().nullable().describe(`
        * * Field Name: NU__PrimaryContactName__c
        * * Display Name: NU__Primary Contact Name __c
        * * SQL Data Type: nvarchar(MAX)`),
    External_Product__c: z.string().nullable().describe(`
        * * Field Name: External_Product__c
        * * Display Name: External _Product __c
        * * SQL Data Type: nvarchar(MAX)`),
    Membership_Product_Name__c: z.string().nullable().describe(`
        * * Field Name: Membership_Product_Name__c
        * * Display Name: Membership _Product _Name __c
        * * SQL Data Type: nvarchar(MAX)`),
    ExternalStatus__c: z.string().nullable().describe(`
        * * Field Name: ExternalStatus__c
        * * Display Name: External Status __c
        * * SQL Data Type: nvarchar(MAX)`),
    Legacy_Liability_Amount__c: z.number().nullable().describe(`
        * * Field Name: Legacy_Liability_Amount__c
        * * Display Name: Legacy _Liability _Amount __c
        * * SQL Data Type: decimal(11, 2)`),
    Legacy_SMSTA_Dues_Amount__c: z.number().nullable().describe(`
        * * Field Name: Legacy_SMSTA_Dues_Amount__c
        * * Display Name: Legacy _SMSTA_Dues _Amount __c
        * * SQL Data Type: decimal(11, 2)`),
    Legacy_Other_CTA_Dues_Amount__c: z.number().nullable().describe(`
        * * Field Name: Legacy_Other_CTA_Dues_Amount__c
        * * Display Name: Legacy _Other _CTA_Dues _Amount __c
        * * SQL Data Type: decimal(11, 2)`),
    Legacy_Parent__c: z.string().nullable().describe(`
        * * Field Name: Legacy_Parent__c
        * * Display Name: Legacy _Parent __c
        * * SQL Data Type: nvarchar(MAX)`),
    Legacy_Product_Code_Conv__c: z.string().nullable().describe(`
        * * Field Name: Legacy_Product_Code_Conv__c
        * * Display Name: Legacy _Product _Code _Conv __c
        * * SQL Data Type: nvarchar(MAX)`),
    Institution__c: z.string().nullable().describe(`
        * * Field Name: Institution__c
        * * Display Name: Institution
        * * SQL Data Type: nvarchar(MAX)`),
    Institution_at_Membership__c: z.string().nullable().describe(`
        * * Field Name: Institution_at_Membership__c
        * * Display Name: Institution _at _Membership __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__AutoRenew__c: z.boolean().nullable().describe(`
        * * Field Name: NU__AutoRenew__c
        * * Display Name: NU__Auto Renew __c
        * * SQL Data Type: bit`),
    NU__AutomaticRenewalCreated__c: z.boolean().nullable().describe(`
        * * Field Name: NU__AutomaticRenewalCreated__c
        * * Display Name: NU__Automatic Renewal Created __c
        * * SQL Data Type: bit`),
    NU__AutomaticRenewalDate__c: z.date().nullable().describe(`
        * * Field Name: NU__AutomaticRenewalDate__c
        * * Display Name: NU__Automatic Renewal Date __c
        * * SQL Data Type: datetimeoffset`),
    NU__AutomaticRenewalDuesAmount__c: z.number().nullable().describe(`
        * * Field Name: NU__AutomaticRenewalDuesAmount__c
        * * Display Name: NU__Automatic Renewal Dues Amount __c
        * * SQL Data Type: decimal(18, 2)`),
    NU__AutomaticRenewalRepricingDate__c: z.date().nullable().describe(`
        * * Field Name: NU__AutomaticRenewalRepricingDate__c
        * * Display Name: NU__Automatic Renewal Repricing Date __c
        * * SQL Data Type: datetimeoffset`),
    NU__RecurringPayment__c: z.string().nullable().describe(`
        * * Field Name: NU__RecurringPayment__c
        * * Display Name: NU__Recurring Payment __c
        * * SQL Data Type: nvarchar(MAX)`),
    School_Building__c: z.string().nullable().describe(`
        * * Field Name: School_Building__c
        * * Display Name: School _Building __c
        * * SQL Data Type: nvarchar(MAX)`),
    InstitutionID__c: z.string().nullable().describe(`
        * * Field Name: InstitutionID__c
        * * Display Name: Institution ID__c
        * * SQL Data Type: nvarchar(MAX)`),
    Year__c: z.number().nullable().describe(`
        * * Field Name: Year__c
        * * Display Name: Year __c
        * * SQL Data Type: decimal(18, 0)`),
    Marketing_Label__c: z.string().nullable().describe(`
        * * Field Name: Marketing_Label__c
        * * Display Name: Marketing _Label __c
        * * SQL Data Type: nvarchar(MAX)`),
    Year_End__c: z.number().nullable().describe(`
        * * Field Name: Year_End__c
        * * Display Name: Year _End __c
        * * SQL Data Type: decimal(18, 0)`),
    Member_Id__c: z.string().nullable().describe(`
        * * Field Name: Member_Id__c
        * * Display Name: Member _Id __c
        * * SQL Data Type: nvarchar(MAX)`),
    Lapsed_Beyond_Grace_Return_Date__c: z.date().nullable().describe(`
        * * Field Name: Lapsed_Beyond_Grace_Return_Date__c
        * * Display Name: Lapsed _Beyond _Grace _Return _Date __c
        * * SQL Data Type: datetimeoffset`),
    NU__EndDateOverride__c: z.date().nullable().describe(`
        * * Field Name: NU__EndDateOverride__c
        * * Display Name: NU__End Date Override __c
        * * SQL Data Type: datetimeoffset`),
    NU__MembershipType2__c: z.string().nullable().describe(`
        * * Field Name: NU__MembershipType2__c
        * * Display Name: NU__Membership Type 2__c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__PrimaryMembershipProduct__c: z.string().nullable().describe(`
        * * Field Name: NU__PrimaryMembershipProduct__c
        * * Display Name: NU__Primary Membership Product __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Account2__c: z.string().nullable().describe(`
        * * Field Name: NU__Account2__c
        * * Display Name: NU__Account 2__c
        * * SQL Data Type: nvarchar(MAX)`),
    ExternalTotalPayment__c: z.number().nullable().describe(`
        * * Field Name: ExternalTotalPayment__c
        * * Display Name: External Total Payment __c
        * * SQL Data Type: decimal(10, 2)`),
    ExternalBalance__c: z.number().nullable().describe(`
        * * Field Name: ExternalBalance__c
        * * Display Name: External Balance __c
        * * SQL Data Type: decimal(18, 2)`),
    ExternalCanceledDate__c: z.date().nullable().describe(`
        * * Field Name: ExternalCanceledDate__c
        * * Display Name: External Canceled Date __c
        * * SQL Data Type: datetimeoffset`),
    TotalBalance__c: z.number().nullable().describe(`
        * * Field Name: TotalBalance__c
        * * Display Name: Total Balance __c
        * * SQL Data Type: decimal(7, 2)`),
    AllPayments__c: z.number().nullable().describe(`
        * * Field Name: AllPayments__c
        * * Display Name: All Payments __c
        * * SQL Data Type: decimal(7, 2)`),
    NU__ExcludeFromBilling__c: z.boolean().nullable().describe(`
        * * Field Name: NU__ExcludeFromBilling__c
        * * Display Name: NU__Exclude From Billing __c
        * * SQL Data Type: bit`),
    NU__ExternalQuantity__c: z.number().nullable().describe(`
        * * Field Name: NU__ExternalQuantity__c
        * * Display Name: NU__External Quantity __c
        * * SQL Data Type: decimal(18, 0)`),
    NU__Quantity__c: z.number().nullable().describe(`
        * * Field Name: NU__Quantity__c
        * * Display Name: NU__Quantity __c
        * * SQL Data Type: decimal(18, 0)`),
    NU__ExternalTransactionDate__c: z.date().nullable().describe(`
        * * Field Name: NU__ExternalTransactionDate__c
        * * Display Name: NU__External Transaction Date __c
        * * SQL Data Type: datetimeoffset`),
    NU__ExternalUnitPrice__c: z.number().nullable().describe(`
        * * Field Name: NU__ExternalUnitPrice__c
        * * Display Name: NU__External Unit Price __c
        * * SQL Data Type: decimal(11, 2)`),
    NU__TransactionDate__c: z.date().nullable().describe(`
        * * Field Name: NU__TransactionDate__c
        * * Display Name: NU__Transaction Date __c
        * * SQL Data Type: datetimeoffset`),
    NU__UnitPrice__c: z.number().nullable().describe(`
        * * Field Name: NU__UnitPrice__c
        * * Display Name: NU__Unit Price __c
        * * SQL Data Type: decimal(18, 2)`),
    NU__OriginalEndDate__c: z.date().nullable().describe(`
        * * Field Name: NU__OriginalEndDate__c
        * * Display Name: NU__Original End Date __c
        * * SQL Data Type: datetimeoffset`),
    Institution_backup__c: z.string().nullable().describe(`
        * * Field Name: Institution_backup__c
        * * Display Name: Institution _backup __c
        * * SQL Data Type: nvarchar(MAX)`),
    Primary_Affiliation_Backup__c: z.string().nullable().describe(`
        * * Field Name: Primary_Affiliation_Backup__c
        * * Display Name: Primary _Affiliation _Backup __c
        * * SQL Data Type: nvarchar(MAX)`),
    School_Building_backup__c: z.string().nullable().describe(`
        * * Field Name: School_Building_backup__c
        * * Display Name: School _Building _backup __c
        * * SQL Data Type: nvarchar(MAX)`),
    ChapterDuesProduct__c: z.string().nullable().describe(`
        * * Field Name: ChapterDuesProduct__c
        * * Display Name: Chapter Dues Product __c
        * * SQL Data Type: nvarchar(MAX)`),
    Chapter_Dues_Product_Name__c: z.string().nullable().describe(`
        * * Field Name: Chapter_Dues_Product_Name__c
        * * Display Name: Chapter _Dues _Product _Name __c
        * * SQL Data Type: nvarchar(MAX)`),
    Paying_CTA_Dues_Thru_MSTA__c: z.boolean().nullable().describe(`
        * * Field Name: Paying_CTA_Dues_Thru_MSTA__c
        * * Display Name: Paying _CTA_Dues _Thru _MSTA__c
        * * SQL Data Type: bit`),
    Chapter_Dues_Mismatch__c: z.boolean().nullable().describe(`
        * * Field Name: Chapter_Dues_Mismatch__c
        * * Display Name: Chapter _Dues _Mismatch __c
        * * SQL Data Type: bit`),
    Pay_Type__c: z.string().nullable().describe(`
        * * Field Name: Pay_Type__c
        * * Display Name: Pay _Type __c
        * * SQL Data Type: nvarchar(MAX)`),
    Simple_Pay_Type__c: z.string().nullable().describe(`
        * * Field Name: Simple_Pay_Type__c
        * * Display Name: Simple _Pay _Type __c
        * * SQL Data Type: nvarchar(MAX)`),
    Join_Renew_Date__c: z.date().nullable().describe(`
        * * Field Name: Join_Renew_Date__c
        * * Display Name: Join _Renew _Date __c
        * * SQL Data Type: datetimeoffset`),
    Joined_the_CTA__c: z.boolean().nullable().describe(`
        * * Field Name: Joined_the_CTA__c
        * * Display Name: Joined _the _CTA__c
        * * SQL Data Type: bit`),
    Membership_Year__c: z.string().nullable().describe(`
        * * Field Name: Membership_Year__c
        * * Display Name: Membership Year
        * * SQL Data Type: nvarchar(MAX)`),
    namz__RenewalOrder__c: z.string().nullable().describe(`
        * * Field Name: namz__RenewalOrder__c
        * * Display Name: namz __Renewal Order __c
        * * SQL Data Type: nvarchar(MAX)`),
    Region__c: z.string().nullable().describe(`
        * * Field Name: Region__c
        * * Display Name: Region __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Order__c: z.string().nullable().describe(`
        * * Field Name: NU__Order__c
        * * Display Name: NU__Order __c
        * * SQL Data Type: nvarchar(MAX)`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Troubleshoot: z.string().nullable().describe(`
        * * Field Name: Troubleshoot
        * * Display Name: Troubleshoot
        * * SQL Data Type: nvarchar(50)`),
});

export type NU__Membership__cEntityType = z.infer<typeof NU__Membership__cSchema>;

/**
 * zod schema definition for the entity Order Item Lines
 */
export const NU__OrderItemLine__cSchema = z.object({
    Id: z.string().describe(`
        * * Field Name: Id
        * * Display Name: Id
        * * SQL Data Type: nvarchar(50)`),
    IsDeleted: z.boolean().nullable().describe(`
        * * Field Name: IsDeleted
        * * Display Name: Is Deleted
        * * SQL Data Type: bit`),
    Name: z.string().nullable().describe(`
        * * Field Name: Name
        * * Display Name: Order Item Line Number
        * * SQL Data Type: nvarchar(MAX)`),
    CreatedById: z.string().nullable().describe(`
        * * Field Name: CreatedById
        * * Display Name: Created By Id
        * * SQL Data Type: nvarchar(MAX)`),
    LastModifiedDate: z.date().nullable().describe(`
        * * Field Name: LastModifiedDate
        * * Display Name: Last Modified Date
        * * SQL Data Type: datetimeoffset`),
    LastModifiedById: z.string().nullable().describe(`
        * * Field Name: LastModifiedById
        * * Display Name: Last Modified By Id
        * * SQL Data Type: nvarchar(MAX)`),
    SystemModstamp: z.date().nullable().describe(`
        * * Field Name: SystemModstamp
        * * Display Name: System Modstamp
        * * SQL Data Type: datetimeoffset`),
    LastActivityDate: z.date().nullable().describe(`
        * * Field Name: LastActivityDate
        * * Display Name: Last Activity Date
        * * SQL Data Type: datetimeoffset`),
    LastViewedDate: z.date().nullable().describe(`
        * * Field Name: LastViewedDate
        * * Display Name: Last Viewed Date
        * * SQL Data Type: datetimeoffset`),
    LastReferencedDate: z.date().nullable().describe(`
        * * Field Name: LastReferencedDate
        * * Display Name: Last Referenced Date
        * * SQL Data Type: datetimeoffset`),
    NU__OrderItem__c: z.string().nullable().describe(`
        * * Field Name: NU__OrderItem__c
        * * Display Name: NU__Order Item __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Product__c: z.string().nullable().describe(`
        * * Field Name: NU__Product__c
        * * Display Name: NU__Product __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__AdjustmentDate__c: z.date().nullable().describe(`
        * * Field Name: NU__AdjustmentDate__c
        * * Display Name: NU__Adjustment Date __c
        * * SQL Data Type: datetimeoffset`),
    NU__DeferredSchedule__c: z.string().nullable().describe(`
        * * Field Name: NU__DeferredSchedule__c
        * * Display Name: NU__Deferred Schedule __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Donation__c: z.string().nullable().describe(`
        * * Field Name: NU__Donation__c
        * * Display Name: NU__Donation __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__EventBadge__c: z.string().nullable().describe(`
        * * Field Name: NU__EventBadge__c
        * * Display Name: NU__Event Badge __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__ExternalID__c: z.string().nullable().describe(`
        * * Field Name: NU__ExternalID__c
        * * Display Name: NU__External ID__c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__IsShippable__c: z.boolean().nullable().describe(`
        * * Field Name: NU__IsShippable__c
        * * Display Name: NU__Is Shippable __c
        * * SQL Data Type: bit`),
    NU__IsTaxable__c: z.boolean().nullable().describe(`
        * * Field Name: NU__IsTaxable__c
        * * Display Name: NU__Is Taxable __c
        * * SQL Data Type: bit`),
    NU__MembershipTypeProductLink__c: z.string().nullable().describe(`
        * * Field Name: NU__MembershipTypeProductLink__c
        * * Display Name: NU__Membership Type Product Link __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Membership__c: z.string().nullable().describe(`
        * * Field Name: NU__Membership__c
        * * Display Name: NU__Membership __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Merchandise__c: z.string().nullable().describe(`
        * * Field Name: NU__Merchandise__c
        * * Display Name: NU__Merchandise __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Quantity__c: z.number().nullable().describe(`
        * * Field Name: NU__Quantity__c
        * * Display Name: Quantity
        * * SQL Data Type: decimal(18, 0)`),
    NU__Registration2__c: z.string().nullable().describe(`
        * * Field Name: NU__Registration2__c
        * * Display Name: NU__Registration 2__c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Status__c: z.string().nullable().describe(`
        * * Field Name: NU__Status__c
        * * Display Name: Status
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Subscription__c: z.string().nullable().describe(`
        * * Field Name: NU__Subscription__c
        * * Display Name: NU__Subscription __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__TotalPrice__c: z.number().nullable().describe(`
        * * Field Name: NU__TotalPrice__c
        * * Display Name: Total Price
        * * SQL Data Type: decimal(18, 2)`),
    NU__TransactionDate__c: z.date().nullable().describe(`
        * * Field Name: NU__TransactionDate__c
        * * Display Name: NU__Transaction Date __c
        * * SQL Data Type: datetimeoffset`),
    NU__UnitPrice__c: z.number().nullable().describe(`
        * * Field Name: NU__UnitPrice__c
        * * Display Name: Unit Price
        * * SQL Data Type: decimal(11, 2)`),
    NU__Miscellaneous__c: z.string().nullable().describe(`
        * * Field Name: NU__Miscellaneous__c
        * * Display Name: NU__Miscellaneous __c
        * * SQL Data Type: nvarchar(MAX)`),
    InstitutionAtMembership__c: z.string().nullable().describe(`
        * * Field Name: InstitutionAtMembership__c
        * * Display Name: Member Institution
        * * SQL Data Type: nvarchar(MAX)`),
    MemberFirstName__c: z.string().nullable().describe(`
        * * Field Name: MemberFirstName__c
        * * Display Name: Member First Name
        * * SQL Data Type: nvarchar(MAX)`),
    MemberLastName__c: z.string().nullable().describe(`
        * * Field Name: MemberLastName__c
        * * Display Name: Member Last Name
        * * SQL Data Type: nvarchar(MAX)`),
    Paid_to_SMSTA__c: z.boolean().nullable().describe(`
        * * Field Name: Paid_to_SMSTA__c
        * * Display Name: Paid _to _SMSTA__c
        * * SQL Data Type: bit`),
    SMSTAChapterDuesProduct__c: z.boolean().nullable().describe(`
        * * Field Name: SMSTAChapterDuesProduct__c
        * * Display Name: SMSTAChapter Dues Product __c
        * * SQL Data Type: bit`),
    NU__Product2__c: z.string().nullable().describe(`
        * * Field Name: NU__Product2__c
        * * Display Name: NU__Product 2__c
        * * SQL Data Type: nvarchar(MAX)`),
    CustomerExtID__c: z.string().nullable().describe(`
        * * Field Name: CustomerExtID__c
        * * Display Name: Customer Ext ID__c
        * * SQL Data Type: nvarchar(MAX)`),
    namz__CartItemLine__c: z.string().nullable().describe(`
        * * Field Name: namz__CartItemLine__c
        * * Display Name: namz __Cart Item Line __c
        * * SQL Data Type: nvarchar(MAX)`),
    namz__ParentProduct__c: z.string().nullable().describe(`
        * * Field Name: namz__ParentProduct__c
        * * Display Name: namz __Parent Product __c
        * * SQL Data Type: nvarchar(MAX)`),
    namz__UnitPriceOverride__c: z.number().nullable().describe(`
        * * Field Name: namz__UnitPriceOverride__c
        * * Display Name: namz __Unit Price Override __c
        * * SQL Data Type: decimal(11, 2)`),
    namz__OrderState__c: z.string().nullable().describe(`
        * * Field Name: namz__OrderState__c
        * * Display Name: namz __Order State __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__NetValue__c: z.number().nullable().describe(`
        * * Field Name: NU__NetValue__c
        * * Display Name: NU__Net Value __c
        * * SQL Data Type: decimal(18, 2)`),
    NU__TaxValue__c: z.number().nullable().describe(`
        * * Field Name: NU__TaxValue__c
        * * Display Name: NU__Tax Value __c
        * * SQL Data Type: decimal(18, 2)`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type NU__OrderItemLine__cEntityType = z.infer<typeof NU__OrderItemLine__cSchema>;

/**
 * zod schema definition for the entity Order Items
 */
export const NU__OrderItem__cSchema = z.object({
    Id: z.string().describe(`
        * * Field Name: Id
        * * Display Name: Id
        * * SQL Data Type: nvarchar(50)`),
    IsDeleted: z.boolean().nullable().describe(`
        * * Field Name: IsDeleted
        * * Display Name: Is Deleted
        * * SQL Data Type: bit`),
    Name: z.string().nullable().describe(`
        * * Field Name: Name
        * * Display Name: Order Item
        * * SQL Data Type: nvarchar(MAX)`),
    RecordTypeId: z.string().nullable().describe(`
        * * Field Name: RecordTypeId
        * * Display Name: Record Type Id
        * * SQL Data Type: nvarchar(MAX)`),
    CreatedById: z.string().nullable().describe(`
        * * Field Name: CreatedById
        * * Display Name: Created By Id
        * * SQL Data Type: nvarchar(MAX)`),
    LastModifiedDate: z.date().nullable().describe(`
        * * Field Name: LastModifiedDate
        * * Display Name: Last Modified Date
        * * SQL Data Type: datetimeoffset`),
    LastModifiedById: z.string().nullable().describe(`
        * * Field Name: LastModifiedById
        * * Display Name: Last Modified By Id
        * * SQL Data Type: nvarchar(MAX)`),
    SystemModstamp: z.date().nullable().describe(`
        * * Field Name: SystemModstamp
        * * Display Name: System Modstamp
        * * SQL Data Type: datetimeoffset`),
    LastActivityDate: z.date().nullable().describe(`
        * * Field Name: LastActivityDate
        * * Display Name: Last Activity Date
        * * SQL Data Type: datetimeoffset`),
    NU__Order__c: z.string().nullable().describe(`
        * * Field Name: NU__Order__c
        * * Display Name: NU__Order __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__ARGLAccount__c: z.string().nullable().describe(`
        * * Field Name: NU__ARGLAccount__c
        * * Display Name: NU__ARGLAccount __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Balance__c: z.number().nullable().describe(`
        * * Field Name: NU__Balance__c
        * * Display Name: NU__Balance __c
        * * SQL Data Type: decimal(18, 2)`),
    NU__CustomerPrimaryAffiliation__c: z.string().nullable().describe(`
        * * Field Name: NU__CustomerPrimaryAffiliation__c
        * * Display Name: NU__Customer Primary Affiliation __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Customer__c: z.string().nullable().describe(`
        * * Field Name: NU__Customer__c
        * * Display Name: NU__Customer __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__ExternalID__c: z.string().nullable().describe(`
        * * Field Name: NU__ExternalID__c
        * * Display Name: NU__External ID__c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__GrandTotal__c: z.number().nullable().describe(`
        * * Field Name: NU__GrandTotal__c
        * * Display Name: NU__Grand Total __c
        * * SQL Data Type: decimal(18, 2)`),
    NU__IsShipped__c: z.boolean().nullable().describe(`
        * * Field Name: NU__IsShipped__c
        * * Display Name: NU__Is Shipped __c
        * * SQL Data Type: bit`),
    NU__PriceClass__c: z.string().nullable().describe(`
        * * Field Name: NU__PriceClass__c
        * * Display Name: NU__Price Class __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__SalesTax__c: z.string().nullable().describe(`
        * * Field Name: NU__SalesTax__c
        * * Display Name: NU__Sales Tax __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__ShippingAddress__c: z.string().nullable().describe(`
        * * Field Name: NU__ShippingAddress__c
        * * Display Name: NU__Shipping Address __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__ShippingCity__c: z.string().nullable().describe(`
        * * Field Name: NU__ShippingCity__c
        * * Display Name: NU__Shipping City __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__ShippingCountry__c: z.string().nullable().describe(`
        * * Field Name: NU__ShippingCountry__c
        * * Display Name: NU__Shipping Country __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__ShippingGLAccount__c: z.string().nullable().describe(`
        * * Field Name: NU__ShippingGLAccount__c
        * * Display Name: NU__Shipping GLAccount __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__ShippingMethod__c: z.string().nullable().describe(`
        * * Field Name: NU__ShippingMethod__c
        * * Display Name: NU__Shipping Method __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__ShippingPostalCode__c: z.string().nullable().describe(`
        * * Field Name: NU__ShippingPostalCode__c
        * * Display Name: NU__Shipping Postal Code __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__ShippingState__c: z.string().nullable().describe(`
        * * Field Name: NU__ShippingState__c
        * * Display Name: NU__Shipping State __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__ShippingStreet__c: z.string().nullable().describe(`
        * * Field Name: NU__ShippingStreet__c
        * * Display Name: NU__Shipping Street __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Source__c: z.string().nullable().describe(`
        * * Field Name: NU__Source__c
        * * Display Name: NU__Source __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Status__c: z.string().nullable().describe(`
        * * Field Name: NU__Status__c
        * * Display Name: Status
        * * SQL Data Type: nvarchar(MAX)`),
    NU__TaxableTotal__c: z.number().nullable().describe(`
        * * Field Name: NU__TaxableTotal__c
        * * Display Name: NU__Taxable Total __c
        * * SQL Data Type: decimal(18, 2)`),
    NU__TotalShippingAndTax__c: z.number().nullable().describe(`
        * * Field Name: NU__TotalShippingAndTax__c
        * * Display Name: NU__Total Shipping And Tax __c
        * * SQL Data Type: decimal(18, 2)`),
    NU__TotalShipping__c: z.number().nullable().describe(`
        * * Field Name: NU__TotalShipping__c
        * * Display Name: NU__Total Shipping __c
        * * SQL Data Type: decimal(11, 2)`),
    NU__TotalTax__c: z.number().nullable().describe(`
        * * Field Name: NU__TotalTax__c
        * * Display Name: NU__Total Tax __c
        * * SQL Data Type: decimal(11, 2)`),
    NU__TransactionDate__c: z.date().nullable().describe(`
        * * Field Name: NU__TransactionDate__c
        * * Display Name: Transaction Date
        * * SQL Data Type: datetimeoffset`),
    NU__AdjustmentDate__c: z.date().nullable().describe(`
        * * Field Name: NU__AdjustmentDate__c
        * * Display Name: NU__Adjustment Date __c
        * * SQL Data Type: datetimeoffset`),
    NU__ShippingItemLineCount__c: z.number().nullable().describe(`
        * * Field Name: NU__ShippingItemLineCount__c
        * * Display Name: NU__Shipping Item Line Count __c
        * * SQL Data Type: decimal(18, 0)`),
    NU__SubTotal__c: z.number().nullable().describe(`
        * * Field Name: NU__SubTotal__c
        * * Display Name: NU__Sub Total __c
        * * SQL Data Type: decimal(18, 2)`),
    NU__TaxableAmount__c: z.number().nullable().describe(`
        * * Field Name: NU__TaxableAmount__c
        * * Display Name: NU__Taxable Amount __c
        * * SQL Data Type: decimal(18, 2)`),
    NU__TotalPayment__c: z.number().nullable().describe(`
        * * Field Name: NU__TotalPayment__c
        * * Display Name: NU__Total Payment __c
        * * SQL Data Type: decimal(18, 2)`),
    NU__Discounts__c: z.number().nullable().describe(`
        * * Field Name: NU__Discounts__c
        * * Display Name: NU__Discounts __c
        * * SQL Data Type: decimal(18, 2)`),
    Customer_Last_Name__c: z.string().nullable().describe(`
        * * Field Name: Customer_Last_Name__c
        * * Display Name: Customer Last Name
        * * SQL Data Type: nvarchar(MAX)`),
    NU__ShipMethod__c: z.string().nullable().describe(`
        * * Field Name: NU__ShipMethod__c
        * * Display Name: NU__Ship Method __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__RecordTypeName__c: z.string().nullable().describe(`
        * * Field Name: NU__RecordTypeName__c
        * * Display Name: Record Type Name
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Entity__c: z.string().nullable().describe(`
        * * Field Name: NU__Entity__c
        * * Display Name: NU__Entity __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__RecurringBalance__c: z.number().nullable().describe(`
        * * Field Name: NU__RecurringBalance__c
        * * Display Name: NU__Recurring Balance __c
        * * SQL Data Type: decimal(18, 2)`),
    NU__BillingHistory__c: z.string().nullable().describe(`
        * * Field Name: NU__BillingHistory__c
        * * Display Name: NU__Billing History __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__AdjustmentVersion__c: z.number().nullable().describe(`
        * * Field Name: NU__AdjustmentVersion__c
        * * Display Name: NU__Adjustment Version __c
        * * SQL Data Type: decimal(18, 0)`),
    NU__BillMe__c: z.boolean().nullable().describe(`
        * * Field Name: NU__BillMe__c
        * * Display Name: NU__Bill Me __c
        * * SQL Data Type: bit`),
    NU__Recurring__c: z.boolean().nullable().describe(`
        * * Field Name: NU__Recurring__c
        * * Display Name: NU__Recurring __c
        * * SQL Data Type: bit`),
    NU__TotalTaxableAmount__c: z.number().nullable().describe(`
        * * Field Name: NU__TotalTaxableAmount__c
        * * Display Name: NU__Total Taxable Amount __c
        * * SQL Data Type: decimal(18, 2)`),
    Opted_in_to_CTA_Dues__c: z.boolean().nullable().describe(`
        * * Field Name: Opted_in_to_CTA_Dues__c
        * * Display Name: Opted _in _to _CTA_Dues __c
        * * SQL Data Type: bit`),
    NU__Data__c: z.string().nullable().describe(`
        * * Field Name: NU__Data__c
        * * Display Name: NU__Data __c
        * * SQL Data Type: nvarchar(MAX)`),
    namz__CartItem__c: z.string().nullable().describe(`
        * * Field Name: namz__CartItem__c
        * * Display Name: namz __Cart Item __c
        * * SQL Data Type: nvarchar(MAX)`),
    namz__Appeal__c: z.string().nullable().describe(`
        * * Field Name: namz__Appeal__c
        * * Display Name: namz __Appeal __c
        * * SQL Data Type: nvarchar(MAX)`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Troubleshoot: z.string().nullable().describe(`
        * * Field Name: Troubleshoot
        * * Display Name: Troubleshoot
        * * SQL Data Type: nvarchar(50)`),
});

export type NU__OrderItem__cEntityType = z.infer<typeof NU__OrderItem__cSchema>;

/**
 * zod schema definition for the entity Orders
 */
export const NU__Order__cSchema = z.object({
    Id: z.string().describe(`
        * * Field Name: Id
        * * Display Name: Id
        * * SQL Data Type: nvarchar(50)`),
    OwnerId: z.string().nullable().describe(`
        * * Field Name: OwnerId
        * * Display Name: Owner Id
        * * SQL Data Type: nvarchar(MAX)`),
    IsDeleted: z.boolean().nullable().describe(`
        * * Field Name: IsDeleted
        * * Display Name: Is Deleted
        * * SQL Data Type: bit`),
    Name: z.string().nullable().describe(`
        * * Field Name: Name
        * * Display Name: Order Name
        * * SQL Data Type: nvarchar(MAX)`),
    CreatedById: z.string().nullable().describe(`
        * * Field Name: CreatedById
        * * Display Name: Created By Id
        * * SQL Data Type: nvarchar(MAX)`),
    LastModifiedDate: z.date().nullable().describe(`
        * * Field Name: LastModifiedDate
        * * Display Name: Last Modified Date
        * * SQL Data Type: datetimeoffset`),
    LastModifiedById: z.string().nullable().describe(`
        * * Field Name: LastModifiedById
        * * Display Name: Last Modified By Id
        * * SQL Data Type: nvarchar(MAX)`),
    SystemModstamp: z.date().nullable().describe(`
        * * Field Name: SystemModstamp
        * * Display Name: System Modstamp
        * * SQL Data Type: datetimeoffset`),
    LastActivityDate: z.date().nullable().describe(`
        * * Field Name: LastActivityDate
        * * Display Name: Last Activity Date
        * * SQL Data Type: datetimeoffset`),
    LastViewedDate: z.date().nullable().describe(`
        * * Field Name: LastViewedDate
        * * Display Name: Last Viewed Date
        * * SQL Data Type: datetimeoffset`),
    LastReferencedDate: z.date().nullable().describe(`
        * * Field Name: LastReferencedDate
        * * Display Name: Last Referenced Date
        * * SQL Data Type: datetimeoffset`),
    NU__AdditionalEmail__c: z.string().nullable().describe(`
        * * Field Name: NU__AdditionalEmail__c
        * * Display Name: Email
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Balance__c: z.number().nullable().describe(`
        * * Field Name: NU__Balance__c
        * * Display Name: NU__Balance __c
        * * SQL Data Type: decimal(18, 2)`),
    NU__BillToPrimaryAffiliation__c: z.string().nullable().describe(`
        * * Field Name: NU__BillToPrimaryAffiliation__c
        * * Display Name: NU__Bill To Primary Affiliation __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__BillTo__c: z.string().nullable().describe(`
        * * Field Name: NU__BillTo__c
        * * Display Name: NU__Bill To __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Entity__c: z.string().nullable().describe(`
        * * Field Name: NU__Entity__c
        * * Display Name: NU__Entity __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__ExternalId__c: z.string().nullable().describe(`
        * * Field Name: NU__ExternalId__c
        * * Display Name: NU__External Id __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__InvoiceARAging__c: z.string().nullable().describe(`
        * * Field Name: NU__InvoiceARAging__c
        * * Display Name: NU__Invoice ARAging __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__InvoiceAgingScheduleCategory__c: z.string().nullable().describe(`
        * * Field Name: NU__InvoiceAgingScheduleCategory__c
        * * Display Name: NU__Invoice Aging Schedule Category __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__InvoiceDate__c: z.date().nullable().describe(`
        * * Field Name: NU__InvoiceDate__c
        * * Display Name: Invoice Date
        * * SQL Data Type: datetimeoffset`),
    NU__InvoiceDaysOutstanding__c: z.number().nullable().describe(`
        * * Field Name: NU__InvoiceDaysOutstanding__c
        * * Display Name: NU__Invoice Days Outstanding __c
        * * SQL Data Type: decimal(18, 0)`),
    NU__InvoiceDescription__c: z.string().nullable().describe(`
        * * Field Name: NU__InvoiceDescription__c
        * * Display Name: NU__Invoice Description __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__InvoiceDueDate__c: z.date().nullable().describe(`
        * * Field Name: NU__InvoiceDueDate__c
        * * Display Name: Invoice Due Date
        * * SQL Data Type: datetimeoffset`),
    NU__InvoiceEmail__c: z.string().nullable().describe(`
        * * Field Name: NU__InvoiceEmail__c
        * * Display Name: NU__Invoice Email __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__InvoiceGenerated__c: z.boolean().nullable().describe(`
        * * Field Name: NU__InvoiceGenerated__c
        * * Display Name: NU__Invoice Generated __c
        * * SQL Data Type: bit`),
    NU__InvoiceNumber__c: z.string().nullable().describe(`
        * * Field Name: NU__InvoiceNumber__c
        * * Display Name: Invoice Number
        * * SQL Data Type: nvarchar(MAX)`),
    NU__InvoiceTerm__c: z.number().nullable().describe(`
        * * Field Name: NU__InvoiceTerm__c
        * * Display Name: NU__Invoice Term __c
        * * SQL Data Type: decimal(3, 0)`),
    NU__PurchaseOrderNumber__c: z.string().nullable().describe(`
        * * Field Name: NU__PurchaseOrderNumber__c
        * * Display Name: NU__Purchase Order Number __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Search__c: z.string().nullable().describe(`
        * * Field Name: NU__Search__c
        * * Display Name: Name
        * * SQL Data Type: nvarchar(MAX)`),
    NU__SelfServiceOrderNumber__c: z.string().nullable().describe(`
        * * Field Name: NU__SelfServiceOrderNumber__c
        * * Display Name: NU__Self Service Order Number __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Status__c: z.string().nullable().describe(`
        * * Field Name: NU__Status__c
        * * Display Name: Status
        * * SQL Data Type: nvarchar(MAX)`),
    NU__TotalShippingAndTax__c: z.number().nullable().describe(`
        * * Field Name: NU__TotalShippingAndTax__c
        * * Display Name: NU__Total Shipping And Tax __c
        * * SQL Data Type: decimal(18, 2)`),
    NU__TransactionDate__c: z.date().nullable().describe(`
        * * Field Name: NU__TransactionDate__c
        * * Display Name: Transaction Date
        * * SQL Data Type: datetimeoffset`),
    NU__ActiveOrderItemCount__c: z.number().nullable().describe(`
        * * Field Name: NU__ActiveOrderItemCount__c
        * * Display Name: NU__Active Order Item Count __c
        * * SQL Data Type: decimal(18, 0)`),
    NU__AdjustmentDate__c: z.date().nullable().describe(`
        * * Field Name: NU__AdjustmentDate__c
        * * Display Name: NU__Adjustment Date __c
        * * SQL Data Type: datetimeoffset`),
    NU__GrandTotal__c: z.number().nullable().describe(`
        * * Field Name: NU__GrandTotal__c
        * * Display Name: Grand Total
        * * SQL Data Type: decimal(18, 2)`),
    NU__SubTotal__c: z.number().nullable().describe(`
        * * Field Name: NU__SubTotal__c
        * * Display Name: NU__Sub Total __c
        * * SQL Data Type: decimal(18, 2)`),
    NU__TotalPayment__c: z.number().nullable().describe(`
        * * Field Name: NU__TotalPayment__c
        * * Display Name: NU__Total Payment __c
        * * SQL Data Type: decimal(18, 2)`),
    NU__TotalShipping__c: z.number().nullable().describe(`
        * * Field Name: NU__TotalShipping__c
        * * Display Name: NU__Total Shipping __c
        * * SQL Data Type: decimal(11, 2)`),
    NU__TotalTax__c: z.number().nullable().describe(`
        * * Field Name: NU__TotalTax__c
        * * Display Name: NU__Total Tax __c
        * * SQL Data Type: decimal(11, 2)`),
    AccrualDues__c: z.string().nullable().describe(`
        * * Field Name: AccrualDues__c
        * * Display Name: Accrual Dues __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__TotalDiscounts__c: z.number().nullable().describe(`
        * * Field Name: NU__TotalDiscounts__c
        * * Display Name: NU__Total Discounts __c
        * * SQL Data Type: decimal(18, 2)`),
    NU__RecurringBalance__c: z.number().nullable().describe(`
        * * Field Name: NU__RecurringBalance__c
        * * Display Name: NU__Recurring Balance __c
        * * SQL Data Type: decimal(18, 2)`),
    NU__Purpose__c: z.string().nullable().describe(`
        * * Field Name: NU__Purpose__c
        * * Display Name: NU__Purpose __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__BillMe__c: z.boolean().nullable().describe(`
        * * Field Name: NU__BillMe__c
        * * Display Name: NU__Bill Me __c
        * * SQL Data Type: bit`),
    NU__AdditionalEmails__c: z.string().nullable().describe(`
        * * Field Name: NU__AdditionalEmails__c
        * * Display Name: NU__Additional Emails __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__ConfirmationEmail__c: z.string().nullable().describe(`
        * * Field Name: NU__ConfirmationEmail__c
        * * Display Name: NU__Confirmation Email __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Identifier__c: z.string().nullable().describe(`
        * * Field Name: NU__Identifier__c
        * * Display Name: NU__Identifier __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__PaymentUrl__c: z.string().nullable().describe(`
        * * Field Name: NU__PaymentUrl__c
        * * Display Name: NU__Payment Url __c
        * * SQL Data Type: nvarchar(MAX)`),
    OnAutopay__c: z.boolean().nullable().describe(`
        * * Field Name: OnAutopay__c
        * * Display Name: On Autopay __c
        * * SQL Data Type: bit`),
    NU__ExternalTaxId__c: z.string().nullable().describe(`
        * * Field Name: NU__ExternalTaxId__c
        * * Display Name: NU__External Tax Id __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__ExternalTaxTransactionStatus__c: z.string().nullable().describe(`
        * * Field Name: NU__ExternalTaxTransactionStatus__c
        * * Display Name: NU__External Tax Transaction Status __c
        * * SQL Data Type: nvarchar(MAX)`),
    IsCreatedByCHUser__c: z.boolean().nullable().describe(`
        * * Field Name: IsCreatedByCHUser__c
        * * Display Name: Is Created By CHUser __c
        * * SQL Data Type: bit`),
    namz__ActiveShoppingCart__c: z.boolean().nullable().describe(`
        * * Field Name: namz__ActiveShoppingCart__c
        * * Display Name: namz __Active Shopping Cart __c
        * * SQL Data Type: bit`),
    namz__Cart__c: z.string().nullable().describe(`
        * * Field Name: namz__Cart__c
        * * Display Name: namz __Cart __c
        * * SQL Data Type: nvarchar(MAX)`),
    namz__GuestFirstName__c: z.string().nullable().describe(`
        * * Field Name: namz__GuestFirstName__c
        * * Display Name: namz __Guest First Name __c
        * * SQL Data Type: nvarchar(MAX)`),
    namz__GuestLastName__c: z.string().nullable().describe(`
        * * Field Name: namz__GuestLastName__c
        * * Display Name: namz __Guest Last Name __c
        * * SQL Data Type: nvarchar(MAX)`),
    namz__State__c: z.string().nullable().describe(`
        * * Field Name: namz__State__c
        * * Display Name: namz __State __c
        * * SQL Data Type: nvarchar(MAX)`),
    namz__LightningCheckoutUrl__c: z.string().nullable().describe(`
        * * Field Name: namz__LightningCheckoutUrl__c
        * * Display Name: namz __Lightning Checkout Url __c
        * * SQL Data Type: nvarchar(MAX)`),
    namz__ForGuest__c: z.boolean().nullable().describe(`
        * * Field Name: namz__ForGuest__c
        * * Display Name: namz __For Guest __c
        * * SQL Data Type: bit`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Troubleshoot: z.string().nullable().describe(`
        * * Field Name: Troubleshoot
        * * Display Name: Troubleshoot
        * * SQL Data Type: nvarchar(50)`),
});

export type NU__Order__cEntityType = z.infer<typeof NU__Order__cSchema>;

/**
 * zod schema definition for the entity Organizations
 */
export const OrganizationSchema = z.object({
    ID: z.number().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: int`),
    NimbleAccountID: z.string().nullable().describe(`
        * * Field Name: NimbleAccountID
        * * Display Name: Nimble Account ID
        * * SQL Data Type: nvarchar(50)`),
    Name: z.string().nullable().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(250)`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    OrganizationType: z.string().nullable().describe(`
        * * Field Name: OrganizationType
        * * Display Name: Organization Type
        * * SQL Data Type: nvarchar(100)`),
    Region: z.string().nullable().describe(`
        * * Field Name: Region
        * * Display Name: Region
        * * SQL Data Type: nvarchar(100)`),
    Institution: z.string().nullable().describe(`
        * * Field Name: Institution
        * * Display Name: Institution
        * * SQL Data Type: nvarchar(100)`),
    DistrictID: z.number().nullable().describe(`
        * * Field Name: DistrictID
        * * Display Name: District ID
        * * SQL Data Type: int`),
    co_dist_code: z.string().nullable().describe(`
        * * Field Name: co_dist_code
        * * Display Name: County District Code
        * * SQL Data Type: nvarchar(10)`),
});

export type OrganizationEntityType = z.infer<typeof OrganizationSchema>;

/**
 * zod schema definition for the entity Payment Lines
 */
export const NU__PaymentLine__cSchema = z.object({
    Id: z.string().describe(`
        * * Field Name: Id
        * * Display Name: Id
        * * SQL Data Type: nvarchar(50)`),
    IsDeleted: z.boolean().nullable().describe(`
        * * Field Name: IsDeleted
        * * Display Name: Is Deleted
        * * SQL Data Type: bit`),
    Name: z.string().nullable().describe(`
        * * Field Name: Name
        * * Display Name: Payment Line Number
        * * SQL Data Type: nvarchar(MAX)`),
    CreatedById: z.string().nullable().describe(`
        * * Field Name: CreatedById
        * * Display Name: Created By Id
        * * SQL Data Type: nvarchar(MAX)`),
    LastModifiedDate: z.date().nullable().describe(`
        * * Field Name: LastModifiedDate
        * * Display Name: Last Modified Date
        * * SQL Data Type: datetimeoffset`),
    LastModifiedById: z.string().nullable().describe(`
        * * Field Name: LastModifiedById
        * * Display Name: Last Modified By Id
        * * SQL Data Type: nvarchar(MAX)`),
    SystemModstamp: z.date().nullable().describe(`
        * * Field Name: SystemModstamp
        * * Display Name: System Modstamp
        * * SQL Data Type: datetimeoffset`),
    LastActivityDate: z.date().nullable().describe(`
        * * Field Name: LastActivityDate
        * * Display Name: Last Activity Date
        * * SQL Data Type: datetimeoffset`),
    NU__OrderItem__c: z.string().nullable().describe(`
        * * Field Name: NU__OrderItem__c
        * * Display Name: Order Item ID
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Payment__c: z.string().nullable().describe(`
        * * Field Name: NU__Payment__c
        * * Display Name: Payment ID
        * * SQL Data Type: nvarchar(MAX)`),
    NU__ExternalID__c: z.string().nullable().describe(`
        * * Field Name: NU__ExternalID__c
        * * Display Name: NU__External ID__c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__PaymentAmount__c: z.number().nullable().describe(`
        * * Field Name: NU__PaymentAmount__c
        * * Display Name: Payment Amount
        * * SQL Data Type: decimal(18, 2)`),
    Verified__c: z.boolean().nullable().describe(`
        * * Field Name: Verified__c
        * * Display Name: Verified __c
        * * SQL Data Type: bit`),
    NU__CreditCardIssuerName__c: z.string().nullable().describe(`
        * * Field Name: NU__CreditCardIssuerName__c
        * * Display Name: NU__Credit Card Issuer Name __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__ExternalID2__c: z.string().nullable().describe(`
        * * Field Name: NU__ExternalID2__c
        * * Display Name: NU__External ID2__c
        * * SQL Data Type: nvarchar(MAX)`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Troubleshoot: z.string().nullable().describe(`
        * * Field Name: Troubleshoot
        * * Display Name: Troubleshoot
        * * SQL Data Type: nvarchar(50)`),
});

export type NU__PaymentLine__cEntityType = z.infer<typeof NU__PaymentLine__cSchema>;

/**
 * zod schema definition for the entity Payments
 */
export const NU__Payment__cSchema = z.object({
    Id: z.string().describe(`
        * * Field Name: Id
        * * Display Name: Id
        * * SQL Data Type: nvarchar(50)`),
    OwnerId: z.string().nullable().describe(`
        * * Field Name: OwnerId
        * * Display Name: Owner Id
        * * SQL Data Type: nvarchar(MAX)`),
    IsDeleted: z.boolean().nullable().describe(`
        * * Field Name: IsDeleted
        * * Display Name: Is Deleted
        * * SQL Data Type: bit`),
    Name: z.string().nullable().describe(`
        * * Field Name: Name
        * * Display Name: Payment Number
        * * SQL Data Type: nvarchar(MAX)`),
    CreatedById: z.string().nullable().describe(`
        * * Field Name: CreatedById
        * * Display Name: Created By Id
        * * SQL Data Type: nvarchar(MAX)`),
    LastModifiedDate: z.date().nullable().describe(`
        * * Field Name: LastModifiedDate
        * * Display Name: Last Modified Date
        * * SQL Data Type: datetimeoffset`),
    LastModifiedById: z.string().nullable().describe(`
        * * Field Name: LastModifiedById
        * * Display Name: Last Modified By Id
        * * SQL Data Type: nvarchar(MAX)`),
    SystemModstamp: z.date().nullable().describe(`
        * * Field Name: SystemModstamp
        * * Display Name: System Modstamp
        * * SQL Data Type: datetimeoffset`),
    LastActivityDate: z.date().nullable().describe(`
        * * Field Name: LastActivityDate
        * * Display Name: Last Activity Date
        * * SQL Data Type: datetimeoffset`),
    LastViewedDate: z.date().nullable().describe(`
        * * Field Name: LastViewedDate
        * * Display Name: Last Viewed Date
        * * SQL Data Type: datetimeoffset`),
    LastReferencedDate: z.date().nullable().describe(`
        * * Field Name: LastReferencedDate
        * * Display Name: Last Referenced Date
        * * SQL Data Type: datetimeoffset`),
    NU__CheckNumber__c: z.string().nullable().describe(`
        * * Field Name: NU__CheckNumber__c
        * * Display Name: NU__Check Number __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__CreditCardCity__c: z.string().nullable().describe(`
        * * Field Name: NU__CreditCardCity__c
        * * Display Name: NU__Credit Card City __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__CreditCardCountry__c: z.string().nullable().describe(`
        * * Field Name: NU__CreditCardCountry__c
        * * Display Name: NU__Credit Card Country __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__CreditCardExpirationMonth__c: z.string().nullable().describe(`
        * * Field Name: NU__CreditCardExpirationMonth__c
        * * Display Name: NU__Credit Card Expiration Month __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__CreditCardExpirationYear__c: z.string().nullable().describe(`
        * * Field Name: NU__CreditCardExpirationYear__c
        * * Display Name: NU__Credit Card Expiration Year __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__CreditCardIsVoid__c: z.boolean().nullable().describe(`
        * * Field Name: NU__CreditCardIsVoid__c
        * * Display Name: NU__Credit Card Is Void __c
        * * SQL Data Type: bit`),
    NU__CreditCardName__c: z.string().nullable().describe(`
        * * Field Name: NU__CreditCardName__c
        * * Display Name: NU__Credit Card Name __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__CreditCardNumber__c: z.string().nullable().describe(`
        * * Field Name: NU__CreditCardNumber__c
        * * Display Name: NU__Credit Card Number __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__CreditCardPostalCode__c: z.string().nullable().describe(`
        * * Field Name: NU__CreditCardPostalCode__c
        * * Display Name: NU__Credit Card Postal Code __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__CreditCardRefundedPayment__c: z.string().nullable().describe(`
        * * Field Name: NU__CreditCardRefundedPayment__c
        * * Display Name: NU__Credit Card Refunded Payment __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__CreditCardSecurityCode__c: z.string().nullable().describe(`
        * * Field Name: NU__CreditCardSecurityCode__c
        * * Display Name: NU__Credit Card Security Code __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__CreditCardState__c: z.string().nullable().describe(`
        * * Field Name: NU__CreditCardState__c
        * * Display Name: NU__Credit Card State __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__CreditCardStreet2__c: z.string().nullable().describe(`
        * * Field Name: NU__CreditCardStreet2__c
        * * Display Name: NU__Credit Card Street 2__c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__CreditCardStreet3__c: z.string().nullable().describe(`
        * * Field Name: NU__CreditCardStreet3__c
        * * Display Name: NU__Credit Card Street 3__c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__CreditCardStreet__c: z.string().nullable().describe(`
        * * Field Name: NU__CreditCardStreet__c
        * * Display Name: NU__Credit Card Street __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__EntityCreditCardIssuer__c: z.string().nullable().describe(`
        * * Field Name: NU__EntityCreditCardIssuer__c
        * * Display Name: NU__Entity Credit Card Issuer __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__EntityPaymentMethod__c: z.string().nullable().describe(`
        * * Field Name: NU__EntityPaymentMethod__c
        * * Display Name: NU__Entity Payment Method __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__ExternalID__c: z.string().nullable().describe(`
        * * Field Name: NU__ExternalID__c
        * * Display Name: NU__External ID__c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Note__c: z.string().nullable().describe(`
        * * Field Name: NU__Note__c
        * * Display Name: NU__Note __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__PaymentAmount__c: z.number().nullable().describe(`
        * * Field Name: NU__PaymentAmount__c
        * * Display Name: Payment Amount
        * * SQL Data Type: decimal(18, 2)`),
    NU__PaymentDate__c: z.date().nullable().describe(`
        * * Field Name: NU__PaymentDate__c
        * * Display Name: Payment Date
        * * SQL Data Type: datetimeoffset`),
    NU__PaymentProcessorAuthorizationId__c: z.string().nullable().describe(`
        * * Field Name: NU__PaymentProcessorAuthorizationId__c
        * * Display Name: NU__Payment Processor Authorization Id __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__PaymentProcessorAvsCode__c: z.string().nullable().describe(`
        * * Field Name: NU__PaymentProcessorAvsCode__c
        * * Display Name: NU__Payment Processor Avs Code __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__PaymentProcessorCardHolderVerifCode__c: z.string().nullable().describe(`
        * * Field Name: NU__PaymentProcessorCardHolderVerifCode__c
        * * Display Name: NU__Payment Processor Card Holder Verif Code __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__PaymentProcessorCode__c: z.string().nullable().describe(`
        * * Field Name: NU__PaymentProcessorCode__c
        * * Display Name: NU__Payment Processor Code __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__PaymentProcessorRawResponse__c: z.string().nullable().describe(`
        * * Field Name: NU__PaymentProcessorRawResponse__c
        * * Display Name: NU__Payment Processor Raw Response __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__PaymentProcessorReasonCode__c: z.string().nullable().describe(`
        * * Field Name: NU__PaymentProcessorReasonCode__c
        * * Display Name: NU__Payment Processor Reason Code __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__PaymentProcessorReasonMessage__c: z.string().nullable().describe(`
        * * Field Name: NU__PaymentProcessorReasonMessage__c
        * * Display Name: NU__Payment Processor Reason Message __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__PaymentProcessorSercurityVerifCode__c: z.string().nullable().describe(`
        * * Field Name: NU__PaymentProcessorSercurityVerifCode__c
        * * Display Name: NU__Payment Processor Sercurity Verif Code __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__PaymentProcessorSplitTenderId__c: z.string().nullable().describe(`
        * * Field Name: NU__PaymentProcessorSplitTenderId__c
        * * Display Name: NU__Payment Processor Split Tender Id __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__PaymentProcessorTransactionId__c: z.string().nullable().describe(`
        * * Field Name: NU__PaymentProcessorTransactionId__c
        * * Display Name: NU__Payment Processor Transaction Id __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__PurchaseOrderNumber__c: z.string().nullable().describe(`
        * * Field Name: NU__PurchaseOrderNumber__c
        * * Display Name: NU__Purchase Order Number __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Source__c: z.string().nullable().describe(`
        * * Field Name: NU__Source__c
        * * Display Name: Source
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Payer__c: z.string().nullable().describe(`
        * * Field Name: NU__Payer__c
        * * Display Name: NU__Payer __c
        * * SQL Data Type: nvarchar(MAX)`),
    Batch__c: z.string().nullable().describe(`
        * * Field Name: Batch__c
        * * Display Name: Batch __c
        * * SQL Data Type: nvarchar(MAX)`),
    District_CTA_Account__c: z.string().nullable().describe(`
        * * Field Name: District_CTA_Account__c
        * * Display Name: District _CTA_Account __c
        * * SQL Data Type: nvarchar(MAX)`),
    Dues_Year__c: z.string().nullable().describe(`
        * * Field Name: Dues_Year__c
        * * Display Name: Dues Year
        * * SQL Data Type: nvarchar(MAX)`),
    Unsubmitted_Payment__c: z.boolean().nullable().describe(`
        * * Field Name: Unsubmitted_Payment__c
        * * Display Name: Unsubmitted _Payment __c
        * * SQL Data Type: bit`),
    NU__RecurringPaymentMessages__c: z.string().nullable().describe(`
        * * Field Name: NU__RecurringPaymentMessages__c
        * * Display Name: NU__Recurring Payment Messages __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__RecurringPaymentResultCode__c: z.string().nullable().describe(`
        * * Field Name: NU__RecurringPaymentResultCode__c
        * * Display Name: NU__Recurring Payment Result Code __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__RecurringPayment__c: z.string().nullable().describe(`
        * * Field Name: NU__RecurringPayment__c
        * * Display Name: NU__Recurring Payment __c
        * * SQL Data Type: nvarchar(MAX)`),
    Batch_Title__c: z.string().nullable().describe(`
        * * Field Name: Batch_Title__c
        * * Display Name: Batch _Title __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__AvailableCreditBalance__c: z.number().nullable().describe(`
        * * Field Name: NU__AvailableCreditBalance__c
        * * Display Name: NU__Available Credit Balance __c
        * * SQL Data Type: decimal(18, 2)`),
    NU__CreditPayableGLAccount__c: z.string().nullable().describe(`
        * * Field Name: NU__CreditPayableGLAccount__c
        * * Display Name: NU__Credit Payable GLAccount __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Entity__c: z.string().nullable().describe(`
        * * Field Name: NU__Entity__c
        * * Display Name: Entity
        * * SQL Data Type: nvarchar(MAX)`),
    NU__IsCredit__c: z.boolean().nullable().describe(`
        * * Field Name: NU__IsCredit__c
        * * Display Name: NU__Is Credit __c
        * * SQL Data Type: bit`),
    NU__TotalPaymentApplied__c: z.number().nullable().describe(`
        * * Field Name: NU__TotalPaymentApplied__c
        * * Display Name: NU__Total Payment Applied __c
        * * SQL Data Type: decimal(18, 2)`),
    NU__PendingRefund__c: z.boolean().nullable().describe(`
        * * Field Name: NU__PendingRefund__c
        * * Display Name: NU__Pending Refund __c
        * * SQL Data Type: bit`),
    NU__PendingCapture__c: z.boolean().nullable().describe(`
        * * Field Name: NU__PendingCapture__c
        * * Display Name: NU__Pending Capture __c
        * * SQL Data Type: bit`),
    NU__CreatedByExternalPaymentMethod__c: z.boolean().nullable().describe(`
        * * Field Name: NU__CreatedByExternalPaymentMethod__c
        * * Display Name: NU__Created By External Payment Method __c
        * * SQL Data Type: bit`),
    NU__ExternalPaymentProfile__c: z.string().nullable().describe(`
        * * Field Name: NU__ExternalPaymentProfile__c
        * * Display Name: NU__External Payment Profile __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__AuthorizationReceived__c: z.boolean().nullable().describe(`
        * * Field Name: NU__AuthorizationReceived__c
        * * Display Name: NU__Authorization Received __c
        * * SQL Data Type: bit`),
    NU__SettlementDate__c: z.date().nullable().describe(`
        * * Field Name: NU__SettlementDate__c
        * * Display Name: NU__Settlement Date __c
        * * SQL Data Type: datetimeoffset`),
    NU__SettlementFail__c: z.boolean().nullable().describe(`
        * * Field Name: NU__SettlementFail__c
        * * Display Name: NU__Settlement Fail __c
        * * SQL Data Type: bit`),
    NU__ExpressPayment__c: z.boolean().nullable().describe(`
        * * Field Name: NU__ExpressPayment__c
        * * Display Name: NU__Express Payment __c
        * * SQL Data Type: bit`),
    NU__GatewayStatus__c: z.string().nullable().describe(`
        * * Field Name: NU__GatewayStatus__c
        * * Display Name: NU__Gateway Status __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__ScheduleLine__c: z.string().nullable().describe(`
        * * Field Name: NU__ScheduleLine__c
        * * Display Name: NU__Schedule Line __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__PointOfSaleDevice__c: z.boolean().nullable().describe(`
        * * Field Name: NU__PointOfSaleDevice__c
        * * Display Name: NU__Point Of Sale Device __c
        * * SQL Data Type: bit`),
    namz__State__c: z.string().nullable().describe(`
        * * Field Name: namz__State__c
        * * Display Name: namz __State __c
        * * SQL Data Type: nvarchar(MAX)`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Troubleshoot: z.string().nullable().describe(`
        * * Field Name: Troubleshoot
        * * Display Name: Troubleshoot
        * * SQL Data Type: nvarchar(50)`),
});

export type NU__Payment__cEntityType = z.infer<typeof NU__Payment__cSchema>;

/**
 * zod schema definition for the entity Persons
 */
export const PersonSchema = z.object({
    ID: z.number().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: int`),
    FirstName: z.string().nullable().describe(`
        * * Field Name: FirstName
        * * Display Name: First Name
        * * SQL Data Type: nvarchar(160)`),
    LastName: z.string().nullable().describe(`
        * * Field Name: LastName
        * * Display Name: Last Name
        * * SQL Data Type: nvarchar(160)`),
    FullName: z.string().nullable().describe(`
        * * Field Name: FullName
        * * Display Name: Full Name
        * * SQL Data Type: nvarchar(500)`),
    Email: z.string().nullable().describe(`
        * * Field Name: Email
        * * Display Name: Email
        * * SQL Data Type: nvarchar(160)`),
    NimbleAccountID: z.string().nullable().describe(`
        * * Field Name: NimbleAccountID
        * * Display Name: Nimble Account ID
        * * SQL Data Type: nvarchar(50)
        * * Related Entity/Foreign Key: Accounts (vwAccounts.Id)`),
    NimbleContactID: z.string().nullable().describe(`
        * * Field Name: NimbleContactID
        * * Display Name: Nimble Contact ID
        * * SQL Data Type: nvarchar(50)`),
    OrganizationID: z.number().nullable().describe(`
        * * Field Name: OrganizationID
        * * Display Name: Organization ID
        * * SQL Data Type: int`),
    MembershipType: z.string().nullable().describe(`
        * * Field Name: MembershipType
        * * Display Name: Membership Type
        * * SQL Data Type: nvarchar(250)`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    edssn: z.string().nullable().describe(`
        * * Field Name: edssn
        * * Display Name: SSN
        * * SQL Data Type: nvarchar(100)`),
    Region: z.string().nullable().describe(`
        * * Field Name: Region
        * * Display Name: Region
        * * SQL Data Type: nvarchar(100)`),
    Institution: z.string().nullable().describe(`
        * * Field Name: Institution
        * * Display Name: Institution
        * * SQL Data Type: nvarchar(100)`),
    NimblePrimaryAffiliationID: z.string().nullable().describe(`
        * * Field Name: NimblePrimaryAffiliationID
        * * Display Name: Nimble Primary Affiliation ID
        * * SQL Data Type: nvarchar(50)`),
    NimbleInstitutionID: z.string().nullable().describe(`
        * * Field Name: NimbleInstitutionID
        * * Display Name: Nimble Institution ID
        * * SQL Data Type: nvarchar(50)`),
    NimbleAccount: z.string().nullable().describe(`
        * * Field Name: NimbleAccount
        * * Display Name: Nimble Account
        * * SQL Data Type: nvarchar(MAX)`),
});

export type PersonEntityType = z.infer<typeof PersonSchema>;

/**
 * zod schema definition for the entity Products
 */
export const NU__Product__cSchema = z.object({
    Id: z.string().describe(`
        * * Field Name: Id
        * * Display Name: Id
        * * SQL Data Type: nvarchar(50)`),
    IsDeleted: z.boolean().nullable().describe(`
        * * Field Name: IsDeleted
        * * Display Name: Is Deleted
        * * SQL Data Type: bit`),
    Name: z.string().nullable().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(MAX)`),
    RecordTypeId: z.string().nullable().describe(`
        * * Field Name: RecordTypeId
        * * Display Name: Record Type Id
        * * SQL Data Type: nvarchar(MAX)`),
    CreatedById: z.string().nullable().describe(`
        * * Field Name: CreatedById
        * * Display Name: Created By Id
        * * SQL Data Type: nvarchar(MAX)`),
    LastModifiedDate: z.date().nullable().describe(`
        * * Field Name: LastModifiedDate
        * * Display Name: Last Modified Date
        * * SQL Data Type: datetimeoffset`),
    LastModifiedById: z.string().nullable().describe(`
        * * Field Name: LastModifiedById
        * * Display Name: Last Modified By Id
        * * SQL Data Type: nvarchar(MAX)`),
    SystemModstamp: z.date().nullable().describe(`
        * * Field Name: SystemModstamp
        * * Display Name: System Modstamp
        * * SQL Data Type: datetimeoffset`),
    LastActivityDate: z.date().nullable().describe(`
        * * Field Name: LastActivityDate
        * * Display Name: Last Activity Date
        * * SQL Data Type: datetimeoffset`),
    LastViewedDate: z.date().nullable().describe(`
        * * Field Name: LastViewedDate
        * * Display Name: Last Viewed Date
        * * SQL Data Type: datetimeoffset`),
    LastReferencedDate: z.date().nullable().describe(`
        * * Field Name: LastReferencedDate
        * * Display Name: Last Referenced Date
        * * SQL Data Type: datetimeoffset`),
    NU__Entity__c: z.string().nullable().describe(`
        * * Field Name: NU__Entity__c
        * * Display Name: NU__Entity __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__ConflictCodes__c: z.string().nullable().describe(`
        * * Field Name: NU__ConflictCodes__c
        * * Display Name: NU__Conflict Codes __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__DeferredRevenueMethod__c: z.string().nullable().describe(`
        * * Field Name: NU__DeferredRevenueMethod__c
        * * Display Name: NU__Deferred Revenue Method __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Description__c: z.string().nullable().describe(`
        * * Field Name: NU__Description__c
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    NU__DisplayOrder__c: z.number().nullable().describe(`
        * * Field Name: NU__DisplayOrder__c
        * * Display Name: NU__Display Order __c
        * * SQL Data Type: decimal(3, 0)`),
    NU__EventSessionEndDate__c: z.date().nullable().describe(`
        * * Field Name: NU__EventSessionEndDate__c
        * * Display Name: NU__Event Session End Date __c
        * * SQL Data Type: datetimeoffset`),
    NU__EventSessionGroup__c: z.string().nullable().describe(`
        * * Field Name: NU__EventSessionGroup__c
        * * Display Name: NU__Event Session Group __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__EventSessionSpecialVenueInstructions__c: z.string().nullable().describe(`
        * * Field Name: NU__EventSessionSpecialVenueInstructions__c
        * * Display Name: NU__Event Session Special Venue Instructions __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__EventSessionStartDate__c: z.date().nullable().describe(`
        * * Field Name: NU__EventSessionStartDate__c
        * * Display Name: NU__Event Session Start Date __c
        * * SQL Data Type: datetimeoffset`),
    NU__Event__c: z.string().nullable().describe(`
        * * Field Name: NU__Event__c
        * * Display Name: NU__Event __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__ExternalID__c: z.string().nullable().describe(`
        * * Field Name: NU__ExternalID__c
        * * Display Name: NU__External ID__c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__InventoryOnHand__c: z.number().nullable().describe(`
        * * Field Name: NU__InventoryOnHand__c
        * * Display Name: NU__Inventory On Hand __c
        * * SQL Data Type: decimal(18, 0)`),
    NU__InventoryUsed__c: z.number().nullable().describe(`
        * * Field Name: NU__InventoryUsed__c
        * * Display Name: NU__Inventory Used __c
        * * SQL Data Type: decimal(10, 0)`),
    NU__Inventory__c: z.number().nullable().describe(`
        * * Field Name: NU__Inventory__c
        * * Display Name: NU__Inventory __c
        * * SQL Data Type: decimal(10, 0)`),
    NU__IsEventBadge__c: z.boolean().nullable().describe(`
        * * Field Name: NU__IsEventBadge__c
        * * Display Name: NU__Is Event Badge __c
        * * SQL Data Type: bit`),
    NU__IsFee__c: z.boolean().nullable().describe(`
        * * Field Name: NU__IsFee__c
        * * Display Name: NU__Is Fee __c
        * * SQL Data Type: bit`),
    NU__IsShippable__c: z.boolean().nullable().describe(`
        * * Field Name: NU__IsShippable__c
        * * Display Name: NU__Is Shippable __c
        * * SQL Data Type: bit`),
    NU__IsTaxable__c: z.boolean().nullable().describe(`
        * * Field Name: NU__IsTaxable__c
        * * Display Name: NU__Is Taxable __c
        * * SQL Data Type: bit`),
    NU__ListPrice__c: z.number().nullable().describe(`
        * * Field Name: NU__ListPrice__c
        * * Display Name: NU__List Price __c
        * * SQL Data Type: decimal(11, 2)`),
    NU__QuantityMax__c: z.number().nullable().describe(`
        * * Field Name: NU__QuantityMax__c
        * * Display Name: NU__Quantity Max __c
        * * SQL Data Type: decimal(3, 0)`),
    NU__RecordTypeName__c: z.string().nullable().describe(`
        * * Field Name: NU__RecordTypeName__c
        * * Display Name: Record Type Name
        * * SQL Data Type: nvarchar(MAX)`),
    NU__RevenueGLAccount__c: z.string().nullable().describe(`
        * * Field Name: NU__RevenueGLAccount__c
        * * Display Name: NU__Revenue GLAccount __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__SelfServiceEnabled__c: z.boolean().nullable().describe(`
        * * Field Name: NU__SelfServiceEnabled__c
        * * Display Name: NU__Self Service Enabled __c
        * * SQL Data Type: bit`),
    NU__ShortName__c: z.string().nullable().describe(`
        * * Field Name: NU__ShortName__c
        * * Display Name: Short Name
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Status__c: z.string().nullable().describe(`
        * * Field Name: NU__Status__c
        * * Display Name: Status
        * * SQL Data Type: nvarchar(MAX)`),
    NU__SubscriptionAnnualStartMonth__c: z.string().nullable().describe(`
        * * Field Name: NU__SubscriptionAnnualStartMonth__c
        * * Display Name: NU__Subscription Annual Start Month __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__SubscriptionGracePeriod__c: z.number().nullable().describe(`
        * * Field Name: NU__SubscriptionGracePeriod__c
        * * Display Name: NU__Subscription Grace Period __c
        * * SQL Data Type: decimal(2, 0)`),
    NU__SubscriptionRenewalType__c: z.string().nullable().describe(`
        * * Field Name: NU__SubscriptionRenewalType__c
        * * Display Name: Suscription Renewal Type
        * * SQL Data Type: nvarchar(MAX)`),
    NU__SubscriptionStartDateControl__c: z.string().nullable().describe(`
        * * Field Name: NU__SubscriptionStartDateControl__c
        * * Display Name: NU__Subscription Start Date Control __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__SubscriptionTerm__c: z.number().nullable().describe(`
        * * Field Name: NU__SubscriptionTerm__c
        * * Display Name: NU__Subscription Term __c
        * * SQL Data Type: decimal(3, 0)`),
    NU__TrackInventory__c: z.boolean().nullable().describe(`
        * * Field Name: NU__TrackInventory__c
        * * Display Name: NU__Track Inventory __c
        * * SQL Data Type: bit`),
    NU__WebProductImageURL__c: z.string().nullable().describe(`
        * * Field Name: NU__WebProductImageURL__c
        * * Display Name: NU__Web Product Image URL__c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__WeightInPounds__c: z.number().nullable().describe(`
        * * Field Name: NU__WeightInPounds__c
        * * Display Name: NU__Weight In Pounds __c
        * * SQL Data Type: decimal(7, 2)`),
    Legacy_Product_Code__c: z.string().nullable().describe(`
        * * Field Name: Legacy_Product_Code__c
        * * Display Name: Legacy _Product _Code __c
        * * SQL Data Type: nvarchar(MAX)`),
    MobileActive__c: z.boolean().nullable().describe(`
        * * Field Name: MobileActive__c
        * * Display Name: Mobile Active __c
        * * SQL Data Type: bit`),
    MobileLocation__c: z.string().nullable().describe(`
        * * Field Name: MobileLocation__c
        * * Display Name: Mobile Location __c
        * * SQL Data Type: nvarchar(MAX)`),
    MobileTwitterHashTag__c: z.string().nullable().describe(`
        * * Field Name: MobileTwitterHashTag__c
        * * Display Name: Mobile Twitter Hash Tag __c
        * * SQL Data Type: nvarchar(MAX)`),
    Payroll_Payment_Detail__c: z.string().nullable().describe(`
        * * Field Name: Payroll_Payment_Detail__c
        * * Display Name: Payroll _Payment _Detail __c
        * * SQL Data Type: nvarchar(MAX)`),
    Marketing_Label__c: z.string().nullable().describe(`
        * * Field Name: Marketing_Label__c
        * * Display Name: Marketing _Label __c
        * * SQL Data Type: nvarchar(MAX)`),
    Easy_Renewal__c: z.boolean().nullable().describe(`
        * * Field Name: Easy_Renewal__c
        * * Display Name: Easy _Renewal __c
        * * SQL Data Type: bit`),
    Account__c: z.string().nullable().describe(`
        * * Field Name: Account__c
        * * Display Name: Account __c
        * * SQL Data Type: nvarchar(MAX)`),
    SMSTA_Product__c: z.boolean().nullable().describe(`
        * * Field Name: SMSTA_Product__c
        * * Display Name: SMSTA_Product __c
        * * SQL Data Type: bit`),
    SMSTATotalOwed__c: z.number().nullable().describe(`
        * * Field Name: SMSTATotalOwed__c
        * * Display Name: SMSTATotal Owed __c
        * * SQL Data Type: decimal(11, 2)`),
    NU__Event2__c: z.string().nullable().describe(`
        * * Field Name: NU__Event2__c
        * * Display Name: NU__Event 2__c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__DownloadUrl__c: z.string().nullable().describe(`
        * * Field Name: NU__DownloadUrl__c
        * * Display Name: NU__Download Url __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__InventoryLastUpdated__c: z.date().nullable().describe(`
        * * Field Name: NU__InventoryLastUpdated__c
        * * Display Name: NU__Inventory Last Updated __c
        * * SQL Data Type: datetimeoffset`),
    NU__IsDownloadable__c: z.boolean().nullable().describe(`
        * * Field Name: NU__IsDownloadable__c
        * * Display Name: NU__Is Downloadable __c
        * * SQL Data Type: bit`),
    NU__ShortDescription__c: z.string().nullable().describe(`
        * * Field Name: NU__ShortDescription__c
        * * Display Name: NU__Short Description __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__RegistrationTypes__c: z.string().nullable().describe(`
        * * Field Name: NU__RegistrationTypes__c
        * * Display Name: NU__Registration Types __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__BillMeEnabled__c: z.boolean().nullable().describe(`
        * * Field Name: NU__BillMeEnabled__c
        * * Display Name: NU__Bill Me Enabled __c
        * * SQL Data Type: bit`),
    NU__EndDate__c: z.date().nullable().describe(`
        * * Field Name: NU__EndDate__c
        * * Display Name: NU__End Date __c
        * * SQL Data Type: datetimeoffset`),
    NU__FeeType__c: z.string().nullable().describe(`
        * * Field Name: NU__FeeType__c
        * * Display Name: NU__Fee Type __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Rate__c: z.number().nullable().describe(`
        * * Field Name: NU__Rate__c
        * * Display Name: NU__Rate __c
        * * SQL Data Type: decimal(18, 0)`),
    NU__StartDate__c: z.date().nullable().describe(`
        * * Field Name: NU__StartDate__c
        * * Display Name: NU__Start Date __c
        * * SQL Data Type: datetimeoffset`),
    NU__CheckoutUrl__c: z.string().nullable().describe(`
        * * Field Name: NU__CheckoutUrl__c
        * * Display Name: NU__Checkout Url __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__SuggestedDonationAmounts__c: z.string().nullable().describe(`
        * * Field Name: NU__SuggestedDonationAmounts__c
        * * Display Name: NU__Suggested Donation Amounts __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__UrlParameterName__c: z.string().nullable().describe(`
        * * Field Name: NU__UrlParameterName__c
        * * Display Name: NU__Url Parameter Name __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__CommodityCode__c: z.string().nullable().describe(`
        * * Field Name: NU__CommodityCode__c
        * * Display Name: NU__Commodity Code __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__UnitOfMeasurement__c: z.string().nullable().describe(`
        * * Field Name: NU__UnitOfMeasurement__c
        * * Display Name: NU__Unit Of Measurement __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Publication__c: z.string().nullable().describe(`
        * * Field Name: NU__Publication__c
        * * Display Name: NU__Publication __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__RecurringEligible__c: z.boolean().nullable().describe(`
        * * Field Name: NU__RecurringEligible__c
        * * Display Name: NU__Recurring Eligible __c
        * * SQL Data Type: bit`),
    NU__RecurringFrequency__c: z.string().nullable().describe(`
        * * Field Name: NU__RecurringFrequency__c
        * * Display Name: NU__Recurring Frequency __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__CanNotBeSoldSeparately2__c: z.boolean().nullable().describe(`
        * * Field Name: NU__CanNotBeSoldSeparately2__c
        * * Display Name: NU__Can Not Be Sold Separately 2__c
        * * SQL Data Type: bit`),
    NU__TaxCode__c: z.string().nullable().describe(`
        * * Field Name: NU__TaxCode__c
        * * Display Name: NU__Tax Code __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU_CBCW__LMSExternalId__c: z.string().nullable().describe(`
        * * Field Name: NU_CBCW__LMSExternalId__c
        * * Display Name: NU_CBCW__LMSExternal Id __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU_CBCW__LMSTerm__c: z.number().nullable().describe(`
        * * Field Name: NU_CBCW__LMSTerm__c
        * * Display Name: NU_CBCW__LMSTerm __c
        * * SQL Data Type: decimal(3, 0)`),
    NU_CBCW__SyncWithLMS__c: z.boolean().nullable().describe(`
        * * Field Name: NU_CBCW__SyncWithLMS__c
        * * Display Name: NU_CBCW__Sync With LMS__c
        * * SQL Data Type: bit`),
    Institution__c: z.string().nullable().describe(`
        * * Field Name: Institution__c
        * * Display Name: Institution __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__DescriptionRichText__c: z.string().nullable().describe(`
        * * Field Name: NU__DescriptionRichText__c
        * * Display Name: NU__Description Rich Text __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__AllowCrossEntityCoupon__c: z.boolean().nullable().describe(`
        * * Field Name: NU__AllowCrossEntityCoupon__c
        * * Display Name: NU__Allow Cross Entity Coupon __c
        * * SQL Data Type: bit`),
    NU_CBCW__LMSErrorMessage__c: z.string().nullable().describe(`
        * * Field Name: NU_CBCW__LMSErrorMessage__c
        * * Display Name: NU_CBCW__LMSError Message __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU_CBCW__LMSLifecycleStatus__c: z.string().nullable().describe(`
        * * Field Name: NU_CBCW__LMSLifecycleStatus__c
        * * Display Name: NU_CBCW__LMSLifecycle Status __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU_CBCW__LMSSynchronizationStatus__c: z.string().nullable().describe(`
        * * Field Name: NU_CBCW__LMSSynchronizationStatus__c
        * * Display Name: NU_CBCW__LMSSynchronization Status __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU_CBCW__LMSType__c: z.string().nullable().describe(`
        * * Field Name: NU_CBCW__LMSType__c
        * * Display Name: NU_CBCW__LMSType __c
        * * SQL Data Type: nvarchar(MAX)`),
    namz__SkipCheckoutForZeroDollars__c: z.boolean().nullable().describe(`
        * * Field Name: namz__SkipCheckoutForZeroDollars__c
        * * Display Name: namz __Skip Checkout For Zero Dollars __c
        * * SQL Data Type: bit`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Troubleshoot: z.string().nullable().describe(`
        * * Field Name: Troubleshoot
        * * Display Name: Troubleshoot
        * * SQL Data Type: nvarchar(50)`),
});

export type NU__Product__cEntityType = z.infer<typeof NU__Product__cSchema>;

/**
 * zod schema definition for the entity Regions
 */
export const RegionsSchema = z.object({
    Primary_Key: z.number().nullable().describe(`
        * * Field Name: Primary_Key
        * * Display Name: Primary Key
        * * SQL Data Type: int`),
    Region_Order: z.number().nullable().describe(`
        * * Field Name: Region_Order
        * * Display Name: Region Order
        * * SQL Data Type: int`),
    Region_Short: z.string().nullable().describe(`
        * * Field Name: Region_Short
        * * Display Name: Region Abbreviation
        * * SQL Data Type: varchar(15)`),
    Region_Long: z.string().nullable().describe(`
        * * Field Name: Region_Long
        * * Display Name: Region Name
        * * SQL Data Type: varchar(30)`),
    ID: z.number().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: int`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type RegionsEntityType = z.infer<typeof RegionsSchema>;

/**
 * zod schema definition for the entity Registrations
 */
export const NU__Registration2__cSchema = z.object({
    Id: z.string().describe(`
        * * Field Name: Id
        * * Display Name: Id
        * * SQL Data Type: nvarchar(50)`),
    IsDeleted: z.boolean().nullable().describe(`
        * * Field Name: IsDeleted
        * * Display Name: Is Deleted
        * * SQL Data Type: bit`),
    Name: z.string().nullable().describe(`
        * * Field Name: Name
        * * Display Name: Registration Number
        * * SQL Data Type: nvarchar(MAX)`),
    CreatedById: z.string().nullable().describe(`
        * * Field Name: CreatedById
        * * Display Name: Created By Id
        * * SQL Data Type: nvarchar(MAX)`),
    LastModifiedDate: z.date().nullable().describe(`
        * * Field Name: LastModifiedDate
        * * Display Name: Last Modified Date
        * * SQL Data Type: datetimeoffset`),
    LastModifiedById: z.string().nullable().describe(`
        * * Field Name: LastModifiedById
        * * Display Name: Last Modified By Id
        * * SQL Data Type: nvarchar(MAX)`),
    SystemModstamp: z.date().nullable().describe(`
        * * Field Name: SystemModstamp
        * * Display Name: System Modstamp
        * * SQL Data Type: datetimeoffset`),
    LastActivityDate: z.date().nullable().describe(`
        * * Field Name: LastActivityDate
        * * Display Name: Last Activity Date
        * * SQL Data Type: datetimeoffset`),
    LastViewedDate: z.date().nullable().describe(`
        * * Field Name: LastViewedDate
        * * Display Name: Last Viewed Date
        * * SQL Data Type: datetimeoffset`),
    LastReferencedDate: z.date().nullable().describe(`
        * * Field Name: LastReferencedDate
        * * Display Name: Last Referenced Date
        * * SQL Data Type: datetimeoffset`),
    NU__Account__c: z.string().nullable().describe(`
        * * Field Name: NU__Account__c
        * * Display Name: NU__Account __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Event__c: z.string().nullable().describe(`
        * * Field Name: NU__Event__c
        * * Display Name: NU__Event __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Amount__c: z.number().nullable().describe(`
        * * Field Name: NU__Amount__c
        * * Display Name: NU__Amount __c
        * * SQL Data Type: decimal(18, 2)`),
    NU__Balance__c: z.number().nullable().describe(`
        * * Field Name: NU__Balance__c
        * * Display Name: NU__Balance __c
        * * SQL Data Type: decimal(18, 2)`),
    NU__EntityName__c: z.string().nullable().describe(`
        * * Field Name: NU__EntityName__c
        * * Display Name: Entity Name
        * * SQL Data Type: nvarchar(MAX)`),
    NU__EventName__c: z.string().nullable().describe(`
        * * Field Name: NU__EventName__c
        * * Display Name: Event Name
        * * SQL Data Type: nvarchar(MAX)`),
    NU__EventStartDate__c: z.date().nullable().describe(`
        * * Field Name: NU__EventStartDate__c
        * * Display Name: Event Start Date
        * * SQL Data Type: datetimeoffset`),
    NU__ExternalAmount__c: z.number().nullable().describe(`
        * * Field Name: NU__ExternalAmount__c
        * * Display Name: NU__External Amount __c
        * * SQL Data Type: decimal(11, 2)`),
    NU__ExternalId__c: z.string().nullable().describe(`
        * * Field Name: NU__ExternalId__c
        * * Display Name: NU__External Id __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__FullName__c: z.string().nullable().describe(`
        * * Field Name: NU__FullName__c
        * * Display Name: Full Name
        * * SQL Data Type: nvarchar(MAX)`),
    NU__OrderItem__c: z.string().nullable().describe(`
        * * Field Name: NU__OrderItem__c
        * * Display Name: NU__Order Item __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__PriceClass__c: z.string().nullable().describe(`
        * * Field Name: NU__PriceClass__c
        * * Display Name: Price Class
        * * SQL Data Type: nvarchar(MAX)`),
    NU__PrimaryAffiliation__c: z.string().nullable().describe(`
        * * Field Name: NU__PrimaryAffiliation__c
        * * Display Name: Primary Affiliation
        * * SQL Data Type: nvarchar(MAX)`),
    NU__RegistrantAddress__c: z.string().nullable().describe(`
        * * Field Name: NU__RegistrantAddress__c
        * * Display Name: NU__Registrant Address __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__RegistrantEmail__c: z.string().nullable().describe(`
        * * Field Name: NU__RegistrantEmail__c
        * * Display Name: Registrant Email
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Search__c: z.string().nullable().describe(`
        * * Field Name: NU__Search__c
        * * Display Name: NU__Search __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__StatusFlag__c: z.string().nullable().describe(`
        * * Field Name: NU__StatusFlag__c
        * * Display Name: NU__Status Flag __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Status__c: z.string().nullable().describe(`
        * * Field Name: NU__Status__c
        * * Display Name: Status
        * * SQL Data Type: nvarchar(MAX)`),
    NU__TotalPayment__c: z.number().nullable().describe(`
        * * Field Name: NU__TotalPayment__c
        * * Display Name: NU__Total Payment __c
        * * SQL Data Type: decimal(18, 2)`),
    Registrant_Institution__c: z.string().nullable().describe(`
        * * Field Name: Registrant_Institution__c
        * * Display Name: Registrant Email
        * * SQL Data Type: nvarchar(MAX)`),
    EventID__c: z.string().nullable().describe(`
        * * Field Name: EventID__c
        * * Display Name: Event ID__c
        * * SQL Data Type: nvarchar(MAX)`),
    Event_Short_Name__c: z.string().nullable().describe(`
        * * Field Name: Event_Short_Name__c
        * * Display Name: Event _Short _Name __c
        * * SQL Data Type: nvarchar(MAX)`),
    Member_ID__c: z.string().nullable().describe(`
        * * Field Name: Member_ID__c
        * * Display Name: Member ID
        * * SQL Data Type: nvarchar(MAX)`),
    NU__CancellationReason__c: z.string().nullable().describe(`
        * * Field Name: NU__CancellationReason__c
        * * Display Name: NU__Cancellation Reason __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Event2__c: z.string().nullable().describe(`
        * * Field Name: NU__Event2__c
        * * Display Name: NU__Event 2__c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__EventStartDate2__c: z.date().nullable().describe(`
        * * Field Name: NU__EventStartDate2__c
        * * Display Name: NU__Event Start Date 2__c
        * * SQL Data Type: datetimeoffset`),
    NU__RegistrationType__c: z.string().nullable().describe(`
        * * Field Name: NU__RegistrationType__c
        * * Display Name: NU__Registration Type __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Passcode__c: z.string().nullable().describe(`
        * * Field Name: NU__Passcode__c
        * * Display Name: NU__Passcode __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Account2__c: z.string().nullable().describe(`
        * * Field Name: NU__Account2__c
        * * Display Name: NU__Account 2__c
        * * SQL Data Type: nvarchar(MAX)`),
    InxpoSyncResponse__c: z.string().nullable().describe(`
        * * Field Name: InxpoSyncResponse__c
        * * Display Name: Inxpo Sync Response __c
        * * SQL Data Type: nvarchar(MAX)`),
    InxpoSyncStatus__c: z.string().nullable().describe(`
        * * Field Name: InxpoSyncStatus__c
        * * Display Name: Inxpo Sync Status __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__ExternalQuantity__c: z.number().nullable().describe(`
        * * Field Name: NU__ExternalQuantity__c
        * * Display Name: NU__External Quantity __c
        * * SQL Data Type: decimal(18, 0)`),
    NU__Quantity__c: z.number().nullable().describe(`
        * * Field Name: NU__Quantity__c
        * * Display Name: NU__Quantity __c
        * * SQL Data Type: decimal(18, 0)`),
    NU__ExternalTransactionDate__c: z.date().nullable().describe(`
        * * Field Name: NU__ExternalTransactionDate__c
        * * Display Name: NU__External Transaction Date __c
        * * SQL Data Type: datetimeoffset`),
    NU__ExternalUnitPrice__c: z.number().nullable().describe(`
        * * Field Name: NU__ExternalUnitPrice__c
        * * Display Name: NU__External Unit Price __c
        * * SQL Data Type: decimal(11, 2)`),
    NU__TransactionDate__c: z.date().nullable().describe(`
        * * Field Name: NU__TransactionDate__c
        * * Display Name: NU__Transaction Date __c
        * * SQL Data Type: datetimeoffset`),
    NU__UnitPrice__c: z.number().nullable().describe(`
        * * Field Name: NU__UnitPrice__c
        * * Display Name: NU__Unit Price __c
        * * SQL Data Type: decimal(18, 2)`),
    Exempt_from_Book_Studies__c: z.boolean().nullable().describe(`
        * * Field Name: Exempt_from_Book_Studies__c
        * * Display Name: Exempt _from _Book _Studies __c
        * * SQL Data Type: bit`),
    namz__EventAnswers__c: z.string().nullable().describe(`
        * * Field Name: namz__EventAnswers__c
        * * Display Name: namz __Event Answers __c
        * * SQL Data Type: nvarchar(MAX)`),
    namz__EventBadge__c: z.string().nullable().describe(`
        * * Field Name: namz__EventBadge__c
        * * Display Name: namz __Event Badge __c
        * * SQL Data Type: nvarchar(MAX)`),
    namz__OrderItemLine__c: z.string().nullable().describe(`
        * * Field Name: namz__OrderItemLine__c
        * * Display Name: namz __Order Item Line __c
        * * SQL Data Type: nvarchar(MAX)`),
    NU__Order__c: z.string().nullable().describe(`
        * * Field Name: NU__Order__c
        * * Display Name: Order ID
        * * SQL Data Type: nvarchar(MAX)`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Troubleshoot: z.string().nullable().describe(`
        * * Field Name: Troubleshoot
        * * Display Name: Troubleshoot
        * * SQL Data Type: nvarchar(50)`),
});

export type NU__Registration2__cEntityType = z.infer<typeof NU__Registration2__cSchema>;

/**
 * zod schema definition for the entity Salary Ranking Tables
 */
export const Salary_Ranking_TableSchema = z.object({
    co_dist_code: z.string().nullable().describe(`
        * * Field Name: co_dist_code
        * * Display Name: County District Code
        * * SQL Data Type: nvarchar(10)`),
    year: z.string().nullable().describe(`
        * * Field Name: year
        * * Display Name: Year
        * * SQL Data Type: nvarchar(10)`),
    co_dist_char: z.string().nullable().describe(`
        * * Field Name: co_dist_char
        * * Display Name: County District Code
        * * SQL Data Type: varchar(10)`),
    description: z.string().nullable().describe(`
        * * Field Name: description
        * * Display Name: Description
        * * SQL Data Type: varchar(100)`),
    supt_sal: z.number().nullable().describe(`
        * * Field Name: supt_sal
        * * Display Name: Superintendent Salary
        * * SQL Data Type: float(53)`),
    supt_sal_rank: z.number().nullable().describe(`
        * * Field Name: supt_sal_rank
        * * Display Name: Superintendent Salary Rank
        * * SQL Data Type: float(53)`),
    STATE_supt_sal: z.number().nullable().describe(`
        * * Field Name: STATE_supt_sal
        * * Display Name: State Superintendent Salary
        * * SQL Data Type: float(53)`),
    supt_sal_all: z.number().nullable().describe(`
        * * Field Name: supt_sal_all
        * * Display Name: supt _sal _all
        * * SQL Data Type: float(53)`),
    STATE_supt_sal_all: z.number().nullable().describe(`
        * * Field Name: STATE_supt_sal_all
        * * Display Name: STATE_supt _sal _all
        * * SQL Data Type: float(53)`),
    admin_sal: z.number().nullable().describe(`
        * * Field Name: admin_sal
        * * Display Name: Admin Salary
        * * SQL Data Type: float(53)`),
    admin_sal_rank: z.number().nullable().describe(`
        * * Field Name: admin_sal_rank
        * * Display Name: Admin Salary Rank
        * * SQL Data Type: float(53)`),
    STATE_admin_sal: z.number().nullable().describe(`
        * * Field Name: STATE_admin_sal
        * * Display Name: State Admin Salary
        * * SQL Data Type: float(53)`),
    tchr_sal: z.number().nullable().describe(`
        * * Field Name: tchr_sal
        * * Display Name: Teacher Salary
        * * SQL Data Type: float(53)`),
    tchr_sal_rank: z.number().nullable().describe(`
        * * Field Name: tchr_sal_rank
        * * Display Name: Teacher Salary Rank
        * * SQL Data Type: float(53)`),
    STATE_tchr_sal: z.number().nullable().describe(`
        * * Field Name: STATE_tchr_sal
        * * Display Name: State Teacher Salary
        * * SQL Data Type: float(53)`),
    ID: z.number().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: int`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type Salary_Ranking_TableEntityType = z.infer<typeof Salary_Ranking_TableSchema>;

/**
 * zod schema definition for the entity Schools
 */
export const edschoolSchema = z.object({
    esssn: z.string().nullable().describe(`
        * * Field Name: esssn
        * * Display Name: Social Security Number
        * * SQL Data Type: varchar(100)`),
    co_dist_code: z.string().nullable().describe(`
        * * Field Name: co_dist_code
        * * Display Name: County District Code
        * * SQL Data Type: nvarchar(10)`),
    esschool: z.string().nullable().describe(`
        * * Field Name: esschool
        * * Display Name: School Code
        * * SQL Data Type: nvarchar(6)`),
    esposcod: z.string().nullable().describe(`
        * * Field Name: esposcod
        * * Display Name: Position Code
        * * SQL Data Type: char(2)`),
    year: z.string().nullable().describe(`
        * * Field Name: year
        * * Display Name: Year
        * * SQL Data Type: nvarchar(10)`),
    progtyp: z.string().nullable().describe(`
        * * Field Name: progtyp
        * * Display Name: Vocational Project Type
        * * SQL Data Type: char(4)`),
    linenum: z.number().nullable().describe(`
        * * Field Name: linenum
        * * Display Name: Vocational Line Number
        * * SQL Data Type: int`),
    edsbfte: z.number().nullable().describe(`
        * * Field Name: edsbfte
        * * Display Name: Full-Time Equivalent
        * * SQL Data Type: decimal(3, 2)`),
    asalary: z.number().nullable().describe(`
        * * Field Name: asalary
        * * Display Name: Salary
        * * SQL Data Type: int`),
    monspos: z.number().nullable().describe(`
        * * Field Name: monspos
        * * Display Name: Vocational Months
        * * SQL Data Type: int`),
    avtcode: z.string().nullable().describe(`
        * * Field Name: avtcode
        * * Display Name: Vocational Area
        * * SQL Data Type: char(1)`),
    srcecode: z.number().nullable().describe(`
        * * Field Name: srcecode
        * * Display Name: Source Code
        * * SQL Data Type: int`),
    voctime1: z.string().nullable().describe(`
        * * Field Name: voctime1
        * * Display Name: Vocational Time Devoted 1
        * * SQL Data Type: char(1)`),
    voctime2: z.string().nullable().describe(`
        * * Field Name: voctime2
        * * Display Name: Vocational Time Devoted 2
        * * SQL Data Type: char(1)`),
    vreimba: z.number().nullable().describe(`
        * * Field Name: vreimba
        * * Display Name: Vocational Reimbursement
        * * SQL Data Type: int`),
    edsbmins: z.number().nullable().describe(`
        * * Field Name: edsbmins
        * * Display Name: School Building Minutes
        * * SQL Data Type: int`),
    edprpos: z.number().nullable().describe(`
        * * Field Name: edprpos
        * * Display Name: Purpose
        * * SQL Data Type: int`),
    cacommt: z.string().nullable().describe(`
        * * Field Name: cacommt
        * * Display Name: Course Comments
        * * SQL Data Type: char(70)`),
    essusp: z.string().nullable().describe(`
        * * Field Name: essusp
        * * Display Name: School Suspension Flag
        * * SQL Data Type: char(1)`),
    essuspsu: z.string().nullable().describe(`
        * * Field Name: essuspsu
        * * Display Name: essuspsu
        * * SQL Data Type: char(1)`),
    essuspsd: z.string().nullable().describe(`
        * * Field Name: essuspsd
        * * Display Name: essuspsd
        * * SQL Data Type: char(1)`),
    essuspsf: z.string().nullable().describe(`
        * * Field Name: essuspsf
        * * Display Name: essuspsf
        * * SQL Data Type: char(1)`),
    essusptr: z.string().nullable().describe(`
        * * Field Name: essusptr
        * * Display Name: essusptr
        * * SQL Data Type: char(1)`),
    essuspvf: z.string().nullable().describe(`
        * * Field Name: essuspvf
        * * Display Name: essuspvf
        * * SQL Data Type: char(1)`),
    essuspve: z.string().nullable().describe(`
        * * Field Name: essuspve
        * * Display Name: essuspve
        * * SQL Data Type: char(1)`),
    esladate: z.date().nullable().describe(`
        * * Field Name: esladate
        * * Display Name: Last Action Date
        * * SQL Data Type: datetime`),
    eslauser: z.string().nullable().describe(`
        * * Field Name: eslauser
        * * Display Name: Last Action User
        * * SQL Data Type: char(4)`),
    esdelete: z.string().nullable().describe(`
        * * Field Name: esdelete
        * * Display Name: Delete Flag
        * * SQL Data Type: char(1)`),
    eslsdate: z.date().nullable().describe(`
        * * Field Name: eslsdate
        * * Display Name: Building Late Start Date
        * * SQL Data Type: datetime`),
    eseedate: z.date().nullable().describe(`
        * * Field Name: eseedate
        * * Display Name: Building Early End Date
        * * SQL Data Type: datetime`),
    ID: z.number().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: int`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type edschoolEntityType = z.infer<typeof edschoolSchema>;

/**
 * zod schema definition for the entity User Joiners
 */
export const UserJoinerSchema = z.object({
    ID: z.number().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: int`),
    Name: z.string().nullable().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)`),
    UserID: z.string().nullable().describe(`
        * * Field Name: UserID
        * * Display Name: User ID
        * * SQL Data Type: nvarchar(255)`),
    AccountID: z.string().nullable().describe(`
        * * Field Name: AccountID
        * * Display Name: Account ID
        * * SQL Data Type: nvarchar(255)`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type UserJoinerEntityType = z.infer<typeof UserJoinerSchema>;
 
 

/**
 * Account Descriptions - strongly typed entity sub-class
 * * Schema: dese
 * * Base Table: acct_desc
 * * Base View: vwacct_descs
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Account Descriptions')
export class acct_descEntity extends BaseEntity<acct_descEntityType> {
    /**
    * Loads the Account Descriptions record from the database
    * @param ID: number - primary key value to load the Account Descriptions record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof acct_descEntity
    * @method
    * @override
    */
    public async Load(ID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: acct_number
    * * Display Name: Account Number
    * * SQL Data Type: int
    */
    get acct_number(): number | null {
        return this.Get('acct_number');
    }
    set acct_number(value: number | null) {
        this.Set('acct_number', value);
    }

    /**
    * * Field Name: acct_desc
    * * Display Name: Account Description
    * * SQL Data Type: varchar(100)
    */
    get acct_desc(): string | null {
        return this.Get('acct_desc');
    }
    set acct_desc(value: string | null) {
        this.Set('acct_desc', value);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: int
    */
    get ID(): number {
        return this.Get('ID');
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Accounts - strongly typed entity sub-class
 * * Schema: nams
 * * Base Table: Account
 * * Base View: vwAccounts
 * * Primary Key: Id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Accounts')
export class AccountEntity extends BaseEntity<AccountEntityType> {
    /**
    * Loads the Accounts record from the database
    * @param Id: string - primary key value to load the Accounts record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AccountEntity
    * @method
    * @override
    */
    public async Load(Id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'Id', Value: Id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: Id
    * * Display Name: Id
    * * SQL Data Type: nvarchar(50)
    */
    get Id(): string {
        return this.Get('Id');
    }
    set Id(value: string) {
        this.Set('Id', value);
    }

    /**
    * * Field Name: IsDeleted
    * * Display Name: Is Deleted
    * * SQL Data Type: bit
    */
    get IsDeleted(): boolean | null {
        return this.Get('IsDeleted');
    }
    set IsDeleted(value: boolean | null) {
        this.Set('IsDeleted', value);
    }

    /**
    * * Field Name: MasterRecordId
    * * Display Name: Master Record Id
    * * SQL Data Type: nvarchar(MAX)
    */
    get MasterRecordId(): string | null {
        return this.Get('MasterRecordId');
    }
    set MasterRecordId(value: string | null) {
        this.Set('MasterRecordId', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(MAX)
    */
    get Name(): string | null {
        return this.Get('Name');
    }
    set Name(value: string | null) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: LastName
    * * Display Name: Last Name
    * * SQL Data Type: nvarchar(MAX)
    */
    get LastName(): string | null {
        return this.Get('LastName');
    }
    set LastName(value: string | null) {
        this.Set('LastName', value);
    }

    /**
    * * Field Name: FirstName
    * * Display Name: First Name
    * * SQL Data Type: nvarchar(MAX)
    */
    get FirstName(): string | null {
        return this.Get('FirstName');
    }
    set FirstName(value: string | null) {
        this.Set('FirstName', value);
    }

    /**
    * * Field Name: Salutation
    * * Display Name: Salutation
    * * SQL Data Type: nvarchar(MAX)
    */
    get Salutation(): string | null {
        return this.Get('Salutation');
    }
    set Salutation(value: string | null) {
        this.Set('Salutation', value);
    }

    /**
    * * Field Name: Type
    * * Display Name: Type
    * * SQL Data Type: nvarchar(MAX)
    */
    get Type(): string | null {
        return this.Get('Type');
    }
    set Type(value: string | null) {
        this.Set('Type', value);
    }

    /**
    * * Field Name: RecordTypeId
    * * Display Name: Record Type Id
    * * SQL Data Type: nvarchar(MAX)
    */
    get RecordTypeId(): string | null {
        return this.Get('RecordTypeId');
    }
    set RecordTypeId(value: string | null) {
        this.Set('RecordTypeId', value);
    }

    /**
    * * Field Name: ParentId
    * * Display Name: Parent Id
    * * SQL Data Type: nvarchar(MAX)
    */
    get ParentId(): string | null {
        return this.Get('ParentId');
    }
    set ParentId(value: string | null) {
        this.Set('ParentId', value);
    }

    /**
    * * Field Name: BillingStreet
    * * Display Name: Billing Street
    * * SQL Data Type: nvarchar(MAX)
    */
    get BillingStreet(): string | null {
        return this.Get('BillingStreet');
    }
    set BillingStreet(value: string | null) {
        this.Set('BillingStreet', value);
    }

    /**
    * * Field Name: BillingCity
    * * Display Name: Billing City
    * * SQL Data Type: nvarchar(MAX)
    */
    get BillingCity(): string | null {
        return this.Get('BillingCity');
    }
    set BillingCity(value: string | null) {
        this.Set('BillingCity', value);
    }

    /**
    * * Field Name: BillingState
    * * Display Name: Billing State
    * * SQL Data Type: nvarchar(MAX)
    */
    get BillingState(): string | null {
        return this.Get('BillingState');
    }
    set BillingState(value: string | null) {
        this.Set('BillingState', value);
    }

    /**
    * * Field Name: BillingPostalCode
    * * Display Name: Billing Postal Code
    * * SQL Data Type: nvarchar(MAX)
    */
    get BillingPostalCode(): string | null {
        return this.Get('BillingPostalCode');
    }
    set BillingPostalCode(value: string | null) {
        this.Set('BillingPostalCode', value);
    }

    /**
    * * Field Name: BillingCountry
    * * Display Name: Billing Country
    * * SQL Data Type: nvarchar(MAX)
    */
    get BillingCountry(): string | null {
        return this.Get('BillingCountry');
    }
    set BillingCountry(value: string | null) {
        this.Set('BillingCountry', value);
    }

    /**
    * * Field Name: BillingLatitude
    * * Display Name: Billing Latitude
    * * SQL Data Type: decimal(18, 15)
    */
    get BillingLatitude(): number | null {
        return this.Get('BillingLatitude');
    }
    set BillingLatitude(value: number | null) {
        this.Set('BillingLatitude', value);
    }

    /**
    * * Field Name: BillingLongitude
    * * Display Name: Billing Longitude
    * * SQL Data Type: decimal(18, 15)
    */
    get BillingLongitude(): number | null {
        return this.Get('BillingLongitude');
    }
    set BillingLongitude(value: number | null) {
        this.Set('BillingLongitude', value);
    }

    /**
    * * Field Name: BillingGeocodeAccuracy
    * * Display Name: Billing Geocode Accuracy
    * * SQL Data Type: nvarchar(MAX)
    */
    get BillingGeocodeAccuracy(): string | null {
        return this.Get('BillingGeocodeAccuracy');
    }
    set BillingGeocodeAccuracy(value: string | null) {
        this.Set('BillingGeocodeAccuracy', value);
    }

    /**
    * * Field Name: ShippingStreet
    * * Display Name: Shipping Street
    * * SQL Data Type: nvarchar(MAX)
    */
    get ShippingStreet(): string | null {
        return this.Get('ShippingStreet');
    }
    set ShippingStreet(value: string | null) {
        this.Set('ShippingStreet', value);
    }

    /**
    * * Field Name: ShippingCity
    * * Display Name: Shipping City
    * * SQL Data Type: nvarchar(MAX)
    */
    get ShippingCity(): string | null {
        return this.Get('ShippingCity');
    }
    set ShippingCity(value: string | null) {
        this.Set('ShippingCity', value);
    }

    /**
    * * Field Name: ShippingState
    * * Display Name: Shipping State
    * * SQL Data Type: nvarchar(MAX)
    */
    get ShippingState(): string | null {
        return this.Get('ShippingState');
    }
    set ShippingState(value: string | null) {
        this.Set('ShippingState', value);
    }

    /**
    * * Field Name: ShippingPostalCode
    * * Display Name: Shipping Postal Code
    * * SQL Data Type: nvarchar(MAX)
    */
    get ShippingPostalCode(): string | null {
        return this.Get('ShippingPostalCode');
    }
    set ShippingPostalCode(value: string | null) {
        this.Set('ShippingPostalCode', value);
    }

    /**
    * * Field Name: ShippingCountry
    * * Display Name: Shipping Country
    * * SQL Data Type: nvarchar(MAX)
    */
    get ShippingCountry(): string | null {
        return this.Get('ShippingCountry');
    }
    set ShippingCountry(value: string | null) {
        this.Set('ShippingCountry', value);
    }

    /**
    * * Field Name: ShippingLatitude
    * * Display Name: Shipping Latitude
    * * SQL Data Type: decimal(18, 15)
    */
    get ShippingLatitude(): number | null {
        return this.Get('ShippingLatitude');
    }
    set ShippingLatitude(value: number | null) {
        this.Set('ShippingLatitude', value);
    }

    /**
    * * Field Name: ShippingLongitude
    * * Display Name: Shipping Longitude
    * * SQL Data Type: decimal(18, 15)
    */
    get ShippingLongitude(): number | null {
        return this.Get('ShippingLongitude');
    }
    set ShippingLongitude(value: number | null) {
        this.Set('ShippingLongitude', value);
    }

    /**
    * * Field Name: ShippingGeocodeAccuracy
    * * Display Name: Shipping Geocode Accuracy
    * * SQL Data Type: nvarchar(MAX)
    */
    get ShippingGeocodeAccuracy(): string | null {
        return this.Get('ShippingGeocodeAccuracy');
    }
    set ShippingGeocodeAccuracy(value: string | null) {
        this.Set('ShippingGeocodeAccuracy', value);
    }

    /**
    * * Field Name: Phone
    * * Display Name: Phone
    * * SQL Data Type: nvarchar(MAX)
    */
    get Phone(): string | null {
        return this.Get('Phone');
    }
    set Phone(value: string | null) {
        this.Set('Phone', value);
    }

    /**
    * * Field Name: Fax
    * * Display Name: Fax
    * * SQL Data Type: nvarchar(MAX)
    */
    get Fax(): string | null {
        return this.Get('Fax');
    }
    set Fax(value: string | null) {
        this.Set('Fax', value);
    }

    /**
    * * Field Name: AccountNumber
    * * Display Name: Account Number
    * * SQL Data Type: nvarchar(MAX)
    */
    get AccountNumber(): string | null {
        return this.Get('AccountNumber');
    }
    set AccountNumber(value: string | null) {
        this.Set('AccountNumber', value);
    }

    /**
    * * Field Name: Website
    * * Display Name: Website
    * * SQL Data Type: nvarchar(MAX)
    */
    get Website(): string | null {
        return this.Get('Website');
    }
    set Website(value: string | null) {
        this.Set('Website', value);
    }

    /**
    * * Field Name: PhotoUrl
    * * Display Name: Photo Url
    * * SQL Data Type: nvarchar(MAX)
    */
    get PhotoUrl(): string | null {
        return this.Get('PhotoUrl');
    }
    set PhotoUrl(value: string | null) {
        this.Set('PhotoUrl', value);
    }

    /**
    * * Field Name: Sic
    * * Display Name: Sic
    * * SQL Data Type: nvarchar(MAX)
    */
    get Sic(): string | null {
        return this.Get('Sic');
    }
    set Sic(value: string | null) {
        this.Set('Sic', value);
    }

    /**
    * * Field Name: Industry
    * * Display Name: Industry
    * * SQL Data Type: nvarchar(MAX)
    */
    get Industry(): string | null {
        return this.Get('Industry');
    }
    set Industry(value: string | null) {
        this.Set('Industry', value);
    }

    /**
    * * Field Name: AnnualRevenue
    * * Display Name: Annual Revenue
    * * SQL Data Type: decimal(18, 0)
    */
    get AnnualRevenue(): number | null {
        return this.Get('AnnualRevenue');
    }
    set AnnualRevenue(value: number | null) {
        this.Set('AnnualRevenue', value);
    }

    /**
    * * Field Name: NumberOfEmployees
    * * Display Name: Number Of Employees
    * * SQL Data Type: int
    */
    get NumberOfEmployees(): number | null {
        return this.Get('NumberOfEmployees');
    }
    set NumberOfEmployees(value: number | null) {
        this.Set('NumberOfEmployees', value);
    }

    /**
    * * Field Name: Ownership
    * * Display Name: Ownership
    * * SQL Data Type: nvarchar(MAX)
    */
    get Ownership(): string | null {
        return this.Get('Ownership');
    }
    set Ownership(value: string | null) {
        this.Set('Ownership', value);
    }

    /**
    * * Field Name: TickerSymbol
    * * Display Name: Ticker Symbol
    * * SQL Data Type: nvarchar(MAX)
    */
    get TickerSymbol(): string | null {
        return this.Get('TickerSymbol');
    }
    set TickerSymbol(value: string | null) {
        this.Set('TickerSymbol', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(MAX)
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: Rating
    * * Display Name: Rating
    * * SQL Data Type: nvarchar(MAX)
    */
    get Rating(): string | null {
        return this.Get('Rating');
    }
    set Rating(value: string | null) {
        this.Set('Rating', value);
    }

    /**
    * * Field Name: Site
    * * Display Name: Site
    * * SQL Data Type: nvarchar(MAX)
    */
    get Site(): string | null {
        return this.Get('Site');
    }
    set Site(value: string | null) {
        this.Set('Site', value);
    }

    /**
    * * Field Name: OwnerId
    * * Display Name: Owner Id
    * * SQL Data Type: nvarchar(MAX)
    */
    get OwnerId(): string | null {
        return this.Get('OwnerId');
    }
    set OwnerId(value: string | null) {
        this.Set('OwnerId', value);
    }

    /**
    * * Field Name: CreatedById
    * * Display Name: Created By Id
    * * SQL Data Type: nvarchar(MAX)
    */
    get CreatedById(): string | null {
        return this.Get('CreatedById');
    }
    set CreatedById(value: string | null) {
        this.Set('CreatedById', value);
    }

    /**
    * * Field Name: LastModifiedDate
    * * Display Name: Last Modified Date
    * * SQL Data Type: datetimeoffset
    */
    get LastModifiedDate(): Date | null {
        return this.Get('LastModifiedDate');
    }

    /**
    * * Field Name: LastModifiedById
    * * Display Name: Last Modified By Id
    * * SQL Data Type: nvarchar(MAX)
    */
    get LastModifiedById(): string | null {
        return this.Get('LastModifiedById');
    }
    set LastModifiedById(value: string | null) {
        this.Set('LastModifiedById', value);
    }

    /**
    * * Field Name: SystemModstamp
    * * Display Name: System Modstamp
    * * SQL Data Type: datetimeoffset
    */
    get SystemModstamp(): Date | null {
        return this.Get('SystemModstamp');
    }

    /**
    * * Field Name: LastActivityDate
    * * Display Name: Last Activity Date
    * * SQL Data Type: datetimeoffset
    */
    get LastActivityDate(): Date | null {
        return this.Get('LastActivityDate');
    }

    /**
    * * Field Name: LastViewedDate
    * * Display Name: Last Viewed Date
    * * SQL Data Type: datetimeoffset
    */
    get LastViewedDate(): Date | null {
        return this.Get('LastViewedDate');
    }

    /**
    * * Field Name: LastReferencedDate
    * * Display Name: Last Referenced Date
    * * SQL Data Type: datetimeoffset
    */
    get LastReferencedDate(): Date | null {
        return this.Get('LastReferencedDate');
    }

    /**
    * * Field Name: IsPartner
    * * Display Name: Is Partner
    * * SQL Data Type: bit
    */
    get IsPartner(): boolean | null {
        return this.Get('IsPartner');
    }
    set IsPartner(value: boolean | null) {
        this.Set('IsPartner', value);
    }

    /**
    * * Field Name: IsCustomerPortal
    * * Display Name: Is Customer Portal
    * * SQL Data Type: bit
    */
    get IsCustomerPortal(): boolean | null {
        return this.Get('IsCustomerPortal');
    }
    set IsCustomerPortal(value: boolean | null) {
        this.Set('IsCustomerPortal', value);
    }

    /**
    * * Field Name: PersonContactId
    * * Display Name: Person Contact Id
    * * SQL Data Type: nvarchar(MAX)
    */
    get PersonContactId(): string | null {
        return this.Get('PersonContactId');
    }
    set PersonContactId(value: string | null) {
        this.Set('PersonContactId', value);
    }

    /**
    * * Field Name: IsPersonAccount
    * * Display Name: Is Person Account
    * * SQL Data Type: bit
    */
    get IsPersonAccount(): boolean | null {
        return this.Get('IsPersonAccount');
    }
    set IsPersonAccount(value: boolean | null) {
        this.Set('IsPersonAccount', value);
    }

    /**
    * * Field Name: ChannelProgramName
    * * Display Name: Channel Program Name
    * * SQL Data Type: nvarchar(MAX)
    */
    get ChannelProgramName(): string | null {
        return this.Get('ChannelProgramName');
    }
    set ChannelProgramName(value: string | null) {
        this.Set('ChannelProgramName', value);
    }

    /**
    * * Field Name: ChannelProgramLevelName
    * * Display Name: Channel Program Level Name
    * * SQL Data Type: nvarchar(MAX)
    */
    get ChannelProgramLevelName(): string | null {
        return this.Get('ChannelProgramLevelName');
    }
    set ChannelProgramLevelName(value: string | null) {
        this.Set('ChannelProgramLevelName', value);
    }

    /**
    * * Field Name: PersonMailingStreet
    * * Display Name: Person Mailing Street
    * * SQL Data Type: nvarchar(MAX)
    */
    get PersonMailingStreet(): string | null {
        return this.Get('PersonMailingStreet');
    }
    set PersonMailingStreet(value: string | null) {
        this.Set('PersonMailingStreet', value);
    }

    /**
    * * Field Name: PersonMailingCity
    * * Display Name: Person Mailing City
    * * SQL Data Type: nvarchar(MAX)
    */
    get PersonMailingCity(): string | null {
        return this.Get('PersonMailingCity');
    }
    set PersonMailingCity(value: string | null) {
        this.Set('PersonMailingCity', value);
    }

    /**
    * * Field Name: PersonMailingState
    * * Display Name: Person Mailing State
    * * SQL Data Type: nvarchar(MAX)
    */
    get PersonMailingState(): string | null {
        return this.Get('PersonMailingState');
    }
    set PersonMailingState(value: string | null) {
        this.Set('PersonMailingState', value);
    }

    /**
    * * Field Name: PersonMailingPostalCode
    * * Display Name: Person Mailing Postal Code
    * * SQL Data Type: nvarchar(MAX)
    */
    get PersonMailingPostalCode(): string | null {
        return this.Get('PersonMailingPostalCode');
    }
    set PersonMailingPostalCode(value: string | null) {
        this.Set('PersonMailingPostalCode', value);
    }

    /**
    * * Field Name: PersonMailingCountry
    * * Display Name: Person Mailing Country
    * * SQL Data Type: nvarchar(MAX)
    */
    get PersonMailingCountry(): string | null {
        return this.Get('PersonMailingCountry');
    }
    set PersonMailingCountry(value: string | null) {
        this.Set('PersonMailingCountry', value);
    }

    /**
    * * Field Name: PersonMailingLatitude
    * * Display Name: Person Mailing Latitude
    * * SQL Data Type: decimal(18, 15)
    */
    get PersonMailingLatitude(): number | null {
        return this.Get('PersonMailingLatitude');
    }
    set PersonMailingLatitude(value: number | null) {
        this.Set('PersonMailingLatitude', value);
    }

    /**
    * * Field Name: PersonMailingLongitude
    * * Display Name: Person Mailing Longitude
    * * SQL Data Type: decimal(18, 15)
    */
    get PersonMailingLongitude(): number | null {
        return this.Get('PersonMailingLongitude');
    }
    set PersonMailingLongitude(value: number | null) {
        this.Set('PersonMailingLongitude', value);
    }

    /**
    * * Field Name: PersonMailingGeocodeAccuracy
    * * Display Name: Person Mailing Geocode Accuracy
    * * SQL Data Type: nvarchar(MAX)
    */
    get PersonMailingGeocodeAccuracy(): string | null {
        return this.Get('PersonMailingGeocodeAccuracy');
    }
    set PersonMailingGeocodeAccuracy(value: string | null) {
        this.Set('PersonMailingGeocodeAccuracy', value);
    }

    /**
    * * Field Name: PersonOtherStreet
    * * Display Name: Person Other Street
    * * SQL Data Type: nvarchar(MAX)
    */
    get PersonOtherStreet(): string | null {
        return this.Get('PersonOtherStreet');
    }
    set PersonOtherStreet(value: string | null) {
        this.Set('PersonOtherStreet', value);
    }

    /**
    * * Field Name: PersonOtherCity
    * * Display Name: Person Other City
    * * SQL Data Type: nvarchar(MAX)
    */
    get PersonOtherCity(): string | null {
        return this.Get('PersonOtherCity');
    }
    set PersonOtherCity(value: string | null) {
        this.Set('PersonOtherCity', value);
    }

    /**
    * * Field Name: PersonOtherState
    * * Display Name: Person Other State
    * * SQL Data Type: nvarchar(MAX)
    */
    get PersonOtherState(): string | null {
        return this.Get('PersonOtherState');
    }
    set PersonOtherState(value: string | null) {
        this.Set('PersonOtherState', value);
    }

    /**
    * * Field Name: PersonOtherPostalCode
    * * Display Name: Person Other Postal Code
    * * SQL Data Type: nvarchar(MAX)
    */
    get PersonOtherPostalCode(): string | null {
        return this.Get('PersonOtherPostalCode');
    }
    set PersonOtherPostalCode(value: string | null) {
        this.Set('PersonOtherPostalCode', value);
    }

    /**
    * * Field Name: PersonOtherCountry
    * * Display Name: Person Other Country
    * * SQL Data Type: nvarchar(MAX)
    */
    get PersonOtherCountry(): string | null {
        return this.Get('PersonOtherCountry');
    }
    set PersonOtherCountry(value: string | null) {
        this.Set('PersonOtherCountry', value);
    }

    /**
    * * Field Name: PersonOtherLatitude
    * * Display Name: Person Other Latitude
    * * SQL Data Type: decimal(18, 15)
    */
    get PersonOtherLatitude(): number | null {
        return this.Get('PersonOtherLatitude');
    }
    set PersonOtherLatitude(value: number | null) {
        this.Set('PersonOtherLatitude', value);
    }

    /**
    * * Field Name: PersonOtherLongitude
    * * Display Name: Person Other Longitude
    * * SQL Data Type: decimal(18, 15)
    */
    get PersonOtherLongitude(): number | null {
        return this.Get('PersonOtherLongitude');
    }
    set PersonOtherLongitude(value: number | null) {
        this.Set('PersonOtherLongitude', value);
    }

    /**
    * * Field Name: PersonOtherGeocodeAccuracy
    * * Display Name: Person Other Geocode Accuracy
    * * SQL Data Type: nvarchar(MAX)
    */
    get PersonOtherGeocodeAccuracy(): string | null {
        return this.Get('PersonOtherGeocodeAccuracy');
    }
    set PersonOtherGeocodeAccuracy(value: string | null) {
        this.Set('PersonOtherGeocodeAccuracy', value);
    }

    /**
    * * Field Name: PersonMobilePhone
    * * Display Name: Person Mobile Phone
    * * SQL Data Type: nvarchar(MAX)
    */
    get PersonMobilePhone(): string | null {
        return this.Get('PersonMobilePhone');
    }
    set PersonMobilePhone(value: string | null) {
        this.Set('PersonMobilePhone', value);
    }

    /**
    * * Field Name: PersonHomePhone
    * * Display Name: Person Home Phone
    * * SQL Data Type: nvarchar(MAX)
    */
    get PersonHomePhone(): string | null {
        return this.Get('PersonHomePhone');
    }
    set PersonHomePhone(value: string | null) {
        this.Set('PersonHomePhone', value);
    }

    /**
    * * Field Name: PersonOtherPhone
    * * Display Name: Person Other Phone
    * * SQL Data Type: nvarchar(MAX)
    */
    get PersonOtherPhone(): string | null {
        return this.Get('PersonOtherPhone');
    }
    set PersonOtherPhone(value: string | null) {
        this.Set('PersonOtherPhone', value);
    }

    /**
    * * Field Name: PersonAssistantPhone
    * * Display Name: Person Assistant Phone
    * * SQL Data Type: nvarchar(MAX)
    */
    get PersonAssistantPhone(): string | null {
        return this.Get('PersonAssistantPhone');
    }
    set PersonAssistantPhone(value: string | null) {
        this.Set('PersonAssistantPhone', value);
    }

    /**
    * * Field Name: PersonEmail
    * * Display Name: Person Email
    * * SQL Data Type: nvarchar(MAX)
    */
    get PersonEmail(): string | null {
        return this.Get('PersonEmail');
    }
    set PersonEmail(value: string | null) {
        this.Set('PersonEmail', value);
    }

    /**
    * * Field Name: PersonTitle
    * * Display Name: Person Title
    * * SQL Data Type: nvarchar(MAX)
    */
    get PersonTitle(): string | null {
        return this.Get('PersonTitle');
    }
    set PersonTitle(value: string | null) {
        this.Set('PersonTitle', value);
    }

    /**
    * * Field Name: PersonDepartment
    * * Display Name: Person Department
    * * SQL Data Type: nvarchar(MAX)
    */
    get PersonDepartment(): string | null {
        return this.Get('PersonDepartment');
    }
    set PersonDepartment(value: string | null) {
        this.Set('PersonDepartment', value);
    }

    /**
    * * Field Name: PersonAssistantName
    * * Display Name: Person Assistant Name
    * * SQL Data Type: nvarchar(MAX)
    */
    get PersonAssistantName(): string | null {
        return this.Get('PersonAssistantName');
    }
    set PersonAssistantName(value: string | null) {
        this.Set('PersonAssistantName', value);
    }

    /**
    * * Field Name: PersonLeadSource
    * * Display Name: Person Lead Source
    * * SQL Data Type: nvarchar(MAX)
    */
    get PersonLeadSource(): string | null {
        return this.Get('PersonLeadSource');
    }
    set PersonLeadSource(value: string | null) {
        this.Set('PersonLeadSource', value);
    }

    /**
    * * Field Name: PersonBirthdate
    * * Display Name: Person Birthdate
    * * SQL Data Type: datetimeoffset
    */
    get PersonBirthdate(): Date | null {
        return this.Get('PersonBirthdate');
    }

    /**
    * * Field Name: PersonHasOptedOutOfEmail
    * * Display Name: Person Has Opted Out Of Email
    * * SQL Data Type: bit
    */
    get PersonHasOptedOutOfEmail(): boolean | null {
        return this.Get('PersonHasOptedOutOfEmail');
    }
    set PersonHasOptedOutOfEmail(value: boolean | null) {
        this.Set('PersonHasOptedOutOfEmail', value);
    }

    /**
    * * Field Name: PersonHasOptedOutOfFax
    * * Display Name: Person Has Opted Out Of Fax
    * * SQL Data Type: bit
    */
    get PersonHasOptedOutOfFax(): boolean | null {
        return this.Get('PersonHasOptedOutOfFax');
    }
    set PersonHasOptedOutOfFax(value: boolean | null) {
        this.Set('PersonHasOptedOutOfFax', value);
    }

    /**
    * * Field Name: PersonDoNotCall
    * * Display Name: Person Do Not Call
    * * SQL Data Type: bit
    */
    get PersonDoNotCall(): boolean | null {
        return this.Get('PersonDoNotCall');
    }
    set PersonDoNotCall(value: boolean | null) {
        this.Set('PersonDoNotCall', value);
    }

    /**
    * * Field Name: PersonLastCURequestDate
    * * Display Name: Person Last CURequest Date
    * * SQL Data Type: datetimeoffset
    */
    get PersonLastCURequestDate(): Date | null {
        return this.Get('PersonLastCURequestDate');
    }

    /**
    * * Field Name: PersonLastCUUpdateDate
    * * Display Name: Person Last CUUpdate Date
    * * SQL Data Type: datetimeoffset
    */
    get PersonLastCUUpdateDate(): Date | null {
        return this.Get('PersonLastCUUpdateDate');
    }

    /**
    * * Field Name: PersonEmailBouncedReason
    * * Display Name: Person Email Bounced Reason
    * * SQL Data Type: nvarchar(MAX)
    */
    get PersonEmailBouncedReason(): string | null {
        return this.Get('PersonEmailBouncedReason');
    }
    set PersonEmailBouncedReason(value: string | null) {
        this.Set('PersonEmailBouncedReason', value);
    }

    /**
    * * Field Name: PersonEmailBouncedDate
    * * Display Name: Person Email Bounced Date
    * * SQL Data Type: datetimeoffset
    */
    get PersonEmailBouncedDate(): Date | null {
        return this.Get('PersonEmailBouncedDate');
    }

    /**
    * * Field Name: PersonIndividualId
    * * Display Name: Person Individual Id
    * * SQL Data Type: nvarchar(MAX)
    */
    get PersonIndividualId(): string | null {
        return this.Get('PersonIndividualId');
    }
    set PersonIndividualId(value: string | null) {
        this.Set('PersonIndividualId', value);
    }

    /**
    * * Field Name: Jigsaw
    * * Display Name: Jigsaw
    * * SQL Data Type: nvarchar(MAX)
    */
    get Jigsaw(): string | null {
        return this.Get('Jigsaw');
    }
    set Jigsaw(value: string | null) {
        this.Set('Jigsaw', value);
    }

    /**
    * * Field Name: JigsawCompanyId
    * * Display Name: Jigsaw Company Id
    * * SQL Data Type: nvarchar(MAX)
    */
    get JigsawCompanyId(): string | null {
        return this.Get('JigsawCompanyId');
    }
    set JigsawCompanyId(value: string | null) {
        this.Set('JigsawCompanyId', value);
    }

    /**
    * * Field Name: AccountSource
    * * Display Name: Account Source
    * * SQL Data Type: nvarchar(MAX)
    */
    get AccountSource(): string | null {
        return this.Get('AccountSource');
    }
    set AccountSource(value: string | null) {
        this.Set('AccountSource', value);
    }

    /**
    * * Field Name: SicDesc
    * * Display Name: Sic Desc
    * * SQL Data Type: nvarchar(MAX)
    */
    get SicDesc(): string | null {
        return this.Get('SicDesc');
    }
    set SicDesc(value: string | null) {
        this.Set('SicDesc', value);
    }

    /**
    * * Field Name: NU__AccountBalance__c
    * * Display Name: NU__Account Balance __c
    * * SQL Data Type: decimal(18, 2)
    */
    get NU__AccountBalance__c(): number | null {
        return this.Get('NU__AccountBalance__c');
    }
    set NU__AccountBalance__c(value: number | null) {
        this.Set('NU__AccountBalance__c', value);
    }

    /**
    * * Field Name: NU__AccountID__c
    * * Display Name: NU__Account ID__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__AccountID__c(): string | null {
        return this.Get('NU__AccountID__c');
    }
    set NU__AccountID__c(value: string | null) {
        this.Set('NU__AccountID__c', value);
    }

    /**
    * * Field Name: NU__AccountMoneySpent__c
    * * Display Name: NU__Account Money Spent __c
    * * SQL Data Type: decimal(18, 2)
    */
    get NU__AccountMoneySpent__c(): number | null {
        return this.Get('NU__AccountMoneySpent__c');
    }
    set NU__AccountMoneySpent__c(value: number | null) {
        this.Set('NU__AccountMoneySpent__c', value);
    }

    /**
    * * Field Name: NU__CasualName__c
    * * Display Name: NU__Casual Name __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__CasualName__c(): string | null {
        return this.Get('NU__CasualName__c');
    }
    set NU__CasualName__c(value: string | null) {
        this.Set('NU__CasualName__c', value);
    }

    /**
    * * Field Name: NU__CommunicationPreference__c
    * * Display Name: NU__Communication Preference __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__CommunicationPreference__c(): string | null {
        return this.Get('NU__CommunicationPreference__c');
    }
    set NU__CommunicationPreference__c(value: string | null) {
        this.Set('NU__CommunicationPreference__c', value);
    }

    /**
    * * Field Name: NU__CopyFromMailingToBilling__c
    * * Display Name: NU__Copy From Mailing To Billing __c
    * * SQL Data Type: bit
    */
    get NU__CopyFromMailingToBilling__c(): boolean | null {
        return this.Get('NU__CopyFromMailingToBilling__c');
    }
    set NU__CopyFromMailingToBilling__c(value: boolean | null) {
        this.Set('NU__CopyFromMailingToBilling__c', value);
    }

    /**
    * * Field Name: NU__CopyFromMailingToOther__c
    * * Display Name: NU__Copy From Mailing To Other __c
    * * SQL Data Type: bit
    */
    get NU__CopyFromMailingToOther__c(): boolean | null {
        return this.Get('NU__CopyFromMailingToOther__c');
    }
    set NU__CopyFromMailingToOther__c(value: boolean | null) {
        this.Set('NU__CopyFromMailingToOther__c', value);
    }

    /**
    * * Field Name: NU__CopyFromMailingToShipping__c
    * * Display Name: NU__Copy From Mailing To Shipping __c
    * * SQL Data Type: bit
    */
    get NU__CopyFromMailingToShipping__c(): boolean | null {
        return this.Get('NU__CopyFromMailingToShipping__c');
    }
    set NU__CopyFromMailingToShipping__c(value: boolean | null) {
        this.Set('NU__CopyFromMailingToShipping__c', value);
    }

    /**
    * * Field Name: NU__CopyFromPrimaryAffiliationBilling__c
    * * Display Name: NU__Copy From Primary Affiliation Billing __c
    * * SQL Data Type: bit
    */
    get NU__CopyFromPrimaryAffiliationBilling__c(): boolean | null {
        return this.Get('NU__CopyFromPrimaryAffiliationBilling__c');
    }
    set NU__CopyFromPrimaryAffiliationBilling__c(value: boolean | null) {
        this.Set('NU__CopyFromPrimaryAffiliationBilling__c', value);
    }

    /**
    * * Field Name: NU__Designation__c
    * * Display Name: NU__Designation __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Designation__c(): string | null {
        return this.Get('NU__Designation__c');
    }
    set NU__Designation__c(value: string | null) {
        this.Set('NU__Designation__c', value);
    }

    /**
    * * Field Name: NU__Ethnicity__c
    * * Display Name: NU__Ethnicity __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Ethnicity__c(): string | null {
        return this.Get('NU__Ethnicity__c');
    }
    set NU__Ethnicity__c(value: string | null) {
        this.Set('NU__Ethnicity__c', value);
    }

    /**
    * * Field Name: NU__ExternalID__c
    * * Display Name: NU__External ID__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__ExternalID__c(): string | null {
        return this.Get('NU__ExternalID__c');
    }
    set NU__ExternalID__c(value: string | null) {
        this.Set('NU__ExternalID__c', value);
    }

    /**
    * * Field Name: NU__FacebookAccount__c
    * * Display Name: NU__Facebook Account __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__FacebookAccount__c(): string | null {
        return this.Get('NU__FacebookAccount__c');
    }
    set NU__FacebookAccount__c(value: string | null) {
        this.Set('NU__FacebookAccount__c', value);
    }

    /**
    * * Field Name: NU__FullName__c
    * * Display Name: NU__Full Name __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__FullName__c(): string | null {
        return this.Get('NU__FullName__c');
    }
    set NU__FullName__c(value: string | null) {
        this.Set('NU__FullName__c', value);
    }

    /**
    * * Field Name: NU__Gender__c
    * * Display Name: NU__Gender __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Gender__c(): string | null {
        return this.Get('NU__Gender__c');
    }
    set NU__Gender__c(value: string | null) {
        this.Set('NU__Gender__c', value);
    }

    /**
    * * Field Name: NU__JoinOn__c
    * * Display Name: NU__Join On __c
    * * SQL Data Type: datetimeoffset
    */
    get NU__JoinOn__c(): Date | null {
        return this.Get('NU__JoinOn__c');
    }

    /**
    * * Field Name: NU__LapsedOn__c
    * * Display Name: NU__Lapsed On __c
    * * SQL Data Type: datetimeoffset
    */
    get NU__LapsedOn__c(): Date | null {
        return this.Get('NU__LapsedOn__c');
    }

    /**
    * * Field Name: NU__Lapsed__c
    * * Display Name: NU__Lapsed __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Lapsed__c(): string | null {
        return this.Get('NU__Lapsed__c');
    }
    set NU__Lapsed__c(value: string | null) {
        this.Set('NU__Lapsed__c', value);
    }

    /**
    * * Field Name: NU__LastLogin__c
    * * Display Name: NU__Last Login __c
    * * SQL Data Type: datetimeoffset
    */
    get NU__LastLogin__c(): Date | null {
        return this.Get('NU__LastLogin__c');
    }

    /**
    * * Field Name: NU__LegacyID__c
    * * Display Name: NU__Legacy ID__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__LegacyID__c(): string | null {
        return this.Get('NU__LegacyID__c');
    }
    set NU__LegacyID__c(value: string | null) {
        this.Set('NU__LegacyID__c', value);
    }

    /**
    * * Field Name: NU__LinkedInAccount__c
    * * Display Name: NU__Linked In Account __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__LinkedInAccount__c(): string | null {
        return this.Get('NU__LinkedInAccount__c');
    }
    set NU__LinkedInAccount__c(value: string | null) {
        this.Set('NU__LinkedInAccount__c', value);
    }

    /**
    * * Field Name: NU__MarkForDelete__c
    * * Display Name: NU__Mark For Delete __c
    * * SQL Data Type: bit
    */
    get NU__MarkForDelete__c(): boolean | null {
        return this.Get('NU__MarkForDelete__c');
    }
    set NU__MarkForDelete__c(value: boolean | null) {
        this.Set('NU__MarkForDelete__c', value);
    }

    /**
    * * Field Name: NU__MemberThru__c
    * * Display Name: NU__Member Thru __c
    * * SQL Data Type: datetimeoffset
    */
    get NU__MemberThru__c(): Date | null {
        return this.Get('NU__MemberThru__c');
    }

    /**
    * * Field Name: NU__Member__c
    * * Display Name: NU__Member __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Member__c(): string | null {
        return this.Get('NU__Member__c');
    }
    set NU__Member__c(value: string | null) {
        this.Set('NU__Member__c', value);
    }

    /**
    * * Field Name: NU__MembershipType__c
    * * Display Name: NU__Membership Type __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__MembershipType__c(): string | null {
        return this.Get('NU__MembershipType__c');
    }
    set NU__MembershipType__c(value: string | null) {
        this.Set('NU__MembershipType__c', value);
    }

    /**
    * * Field Name: NU__Membership__c
    * * Display Name: NU__Membership __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Membership__c(): string | null {
        return this.Get('NU__Membership__c');
    }
    set NU__Membership__c(value: string | null) {
        this.Set('NU__Membership__c', value);
    }

    /**
    * * Field Name: NU__MiddleName__c
    * * Display Name: NU__Middle Name __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__MiddleName__c(): string | null {
        return this.Get('NU__MiddleName__c');
    }
    set NU__MiddleName__c(value: string | null) {
        this.Set('NU__MiddleName__c', value);
    }

    /**
    * * Field Name: NU__OtherEmail__c
    * * Display Name: NU__Other Email __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__OtherEmail__c(): string | null {
        return this.Get('NU__OtherEmail__c');
    }
    set NU__OtherEmail__c(value: string | null) {
        this.Set('NU__OtherEmail__c', value);
    }

    /**
    * * Field Name: NU__OtherFax__c
    * * Display Name: NU__Other Fax __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__OtherFax__c(): string | null {
        return this.Get('NU__OtherFax__c');
    }
    set NU__OtherFax__c(value: string | null) {
        this.Set('NU__OtherFax__c', value);
    }

    /**
    * * Field Name: NU__PasswordHash__c
    * * Display Name: NU__Password Hash __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__PasswordHash__c(): string | null {
        return this.Get('NU__PasswordHash__c');
    }
    set NU__PasswordHash__c(value: string | null) {
        this.Set('NU__PasswordHash__c', value);
    }

    /**
    * * Field Name: NU__PasswordSalt__c
    * * Display Name: NU__Password Salt __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__PasswordSalt__c(): string | null {
        return this.Get('NU__PasswordSalt__c');
    }
    set NU__PasswordSalt__c(value: string | null) {
        this.Set('NU__PasswordSalt__c', value);
    }

    /**
    * * Field Name: NU__PersonAccountData__c
    * * Display Name: NU__Person Account Data __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__PersonAccountData__c(): string | null {
        return this.Get('NU__PersonAccountData__c');
    }
    set NU__PersonAccountData__c(value: string | null) {
        this.Set('NU__PersonAccountData__c', value);
    }

    /**
    * * Field Name: NU__PersonContact__c
    * * Display Name: NU__Person Contact __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__PersonContact__c(): string | null {
        return this.Get('NU__PersonContact__c');
    }
    set NU__PersonContact__c(value: string | null) {
        this.Set('NU__PersonContact__c', value);
    }

    /**
    * * Field Name: NU__PersonEmail__c
    * * Display Name: NU__Person Email __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__PersonEmail__c(): string | null {
        return this.Get('NU__PersonEmail__c');
    }
    set NU__PersonEmail__c(value: string | null) {
        this.Set('NU__PersonEmail__c', value);
    }

    /**
    * * Field Name: NU__PrimaryAffiliation__c
    * * Display Name: NU__Primary Affiliation __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__PrimaryAffiliation__c(): string | null {
        return this.Get('NU__PrimaryAffiliation__c');
    }
    set NU__PrimaryAffiliation__c(value: string | null) {
        this.Set('NU__PrimaryAffiliation__c', value);
    }

    /**
    * * Field Name: NU__PrimaryEntity__c
    * * Display Name: NU__Primary Entity __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__PrimaryEntity__c(): string | null {
        return this.Get('NU__PrimaryEntity__c');
    }
    set NU__PrimaryEntity__c(value: string | null) {
        this.Set('NU__PrimaryEntity__c', value);
    }

    /**
    * * Field Name: NU__RecordTypeName__c
    * * Display Name: Nimble Record Type
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__RecordTypeName__c(): string | null {
        return this.Get('NU__RecordTypeName__c');
    }
    set NU__RecordTypeName__c(value: string | null) {
        this.Set('NU__RecordTypeName__c', value);
    }

    /**
    * * Field Name: NU__RecoveryAnswer1__c
    * * Display Name: NU__Recovery Answer 1__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__RecoveryAnswer1__c(): string | null {
        return this.Get('NU__RecoveryAnswer1__c');
    }
    set NU__RecoveryAnswer1__c(value: string | null) {
        this.Set('NU__RecoveryAnswer1__c', value);
    }

    /**
    * * Field Name: NU__RecoveryAnswer2__c
    * * Display Name: NU__Recovery Answer 2__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__RecoveryAnswer2__c(): string | null {
        return this.Get('NU__RecoveryAnswer2__c');
    }
    set NU__RecoveryAnswer2__c(value: string | null) {
        this.Set('NU__RecoveryAnswer2__c', value);
    }

    /**
    * * Field Name: NU__RecoveryAnswer3__c
    * * Display Name: NU__Recovery Answer 3__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__RecoveryAnswer3__c(): string | null {
        return this.Get('NU__RecoveryAnswer3__c');
    }
    set NU__RecoveryAnswer3__c(value: string | null) {
        this.Set('NU__RecoveryAnswer3__c', value);
    }

    /**
    * * Field Name: NU__RecoveryQuestion1__c
    * * Display Name: NU__Recovery Question 1__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__RecoveryQuestion1__c(): string | null {
        return this.Get('NU__RecoveryQuestion1__c');
    }
    set NU__RecoveryQuestion1__c(value: string | null) {
        this.Set('NU__RecoveryQuestion1__c', value);
    }

    /**
    * * Field Name: NU__RecoveryQuestion2__c
    * * Display Name: NU__Recovery Question 2__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__RecoveryQuestion2__c(): string | null {
        return this.Get('NU__RecoveryQuestion2__c');
    }
    set NU__RecoveryQuestion2__c(value: string | null) {
        this.Set('NU__RecoveryQuestion2__c', value);
    }

    /**
    * * Field Name: NU__RecoveryQuestion3__c
    * * Display Name: NU__Recovery Question 3__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__RecoveryQuestion3__c(): string | null {
        return this.Get('NU__RecoveryQuestion3__c');
    }
    set NU__RecoveryQuestion3__c(value: string | null) {
        this.Set('NU__RecoveryQuestion3__c', value);
    }

    /**
    * * Field Name: NU__SecurityGroup__c
    * * Display Name: NU__Security Group __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__SecurityGroup__c(): string | null {
        return this.Get('NU__SecurityGroup__c');
    }
    set NU__SecurityGroup__c(value: string | null) {
        this.Set('NU__SecurityGroup__c', value);
    }

    /**
    * * Field Name: NU__StatusMembershipFlag__c
    * * Display Name: NU__Status Membership Flag __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__StatusMembershipFlag__c(): string | null {
        return this.Get('NU__StatusMembershipFlag__c');
    }
    set NU__StatusMembershipFlag__c(value: string | null) {
        this.Set('NU__StatusMembershipFlag__c', value);
    }

    /**
    * * Field Name: NU__StatusMembership__c
    * * Display Name: NU__Status Membership __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__StatusMembership__c(): string | null {
        return this.Get('NU__StatusMembership__c');
    }
    set NU__StatusMembership__c(value: string | null) {
        this.Set('NU__StatusMembership__c', value);
    }

    /**
    * * Field Name: NU__Status__c
    * * Display Name: Status
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Status__c(): string | null {
        return this.Get('NU__Status__c');
    }
    set NU__Status__c(value: string | null) {
        this.Set('NU__Status__c', value);
    }

    /**
    * * Field Name: NU__Suffix__c
    * * Display Name: NU__Suffix __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Suffix__c(): string | null {
        return this.Get('NU__Suffix__c');
    }
    set NU__Suffix__c(value: string | null) {
        this.Set('NU__Suffix__c', value);
    }

    /**
    * * Field Name: NU__TaxExemptId__c
    * * Display Name: NU__Tax Exempt Id __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__TaxExemptId__c(): string | null {
        return this.Get('NU__TaxExemptId__c');
    }
    set NU__TaxExemptId__c(value: string | null) {
        this.Set('NU__TaxExemptId__c', value);
    }

    /**
    * * Field Name: NU__TaxExempt__c
    * * Display Name: NU__Tax Exempt __c
    * * SQL Data Type: bit
    */
    get NU__TaxExempt__c(): boolean | null {
        return this.Get('NU__TaxExempt__c');
    }
    set NU__TaxExempt__c(value: boolean | null) {
        this.Set('NU__TaxExempt__c', value);
    }

    /**
    * * Field Name: NU__TotalAffiliateBalance__c
    * * Display Name: NU__Total Affiliate Balance __c
    * * SQL Data Type: decimal(18, 2)
    */
    get NU__TotalAffiliateBalance__c(): number | null {
        return this.Get('NU__TotalAffiliateBalance__c');
    }
    set NU__TotalAffiliateBalance__c(value: number | null) {
        this.Set('NU__TotalAffiliateBalance__c', value);
    }

    /**
    * * Field Name: NU__TotalAffiliateMoneySpent__c
    * * Display Name: NU__Total Affiliate Money Spent __c
    * * SQL Data Type: decimal(18, 2)
    */
    get NU__TotalAffiliateMoneySpent__c(): number | null {
        return this.Get('NU__TotalAffiliateMoneySpent__c');
    }
    set NU__TotalAffiliateMoneySpent__c(value: number | null) {
        this.Set('NU__TotalAffiliateMoneySpent__c', value);
    }

    /**
    * * Field Name: NU__TwitterAccount__c
    * * Display Name: NU__Twitter Account __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__TwitterAccount__c(): string | null {
        return this.Get('NU__TwitterAccount__c');
    }
    set NU__TwitterAccount__c(value: string | null) {
        this.Set('NU__TwitterAccount__c', value);
    }

    /**
    * * Field Name: NU__Username__c
    * * Display Name: NU__Username __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Username__c(): string | null {
        return this.Get('NU__Username__c');
    }
    set NU__Username__c(value: string | null) {
        this.Set('NU__Username__c', value);
    }

    /**
    * * Field Name: NU__ValidEmailDomains__c
    * * Display Name: NU__Valid Email Domains __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__ValidEmailDomains__c(): string | null {
        return this.Get('NU__ValidEmailDomains__c');
    }
    set NU__ValidEmailDomains__c(value: string | null) {
        this.Set('NU__ValidEmailDomains__c', value);
    }

    /**
    * * Field Name: Pay_Type__c
    * * Display Name: Pay _Type __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Pay_Type__c(): string | null {
        return this.Get('Pay_Type__c');
    }
    set Pay_Type__c(value: string | null) {
        this.Set('Pay_Type__c', value);
    }

    /**
    * * Field Name: No_CTA__c
    * * Display Name: No _CTA__c
    * * SQL Data Type: bit
    */
    get No_CTA__c(): boolean | null {
        return this.Get('No_CTA__c');
    }
    set No_CTA__c(value: boolean | null) {
        this.Set('No_CTA__c', value);
    }

    /**
    * * Field Name: Certified_CTA_Dues__c
    * * Display Name: Certified _CTA_Dues __c
    * * SQL Data Type: decimal(4, 2)
    */
    get Certified_CTA_Dues__c(): number | null {
        return this.Get('Certified_CTA_Dues__c');
    }
    set Certified_CTA_Dues__c(value: number | null) {
        this.Set('Certified_CTA_Dues__c', value);
    }

    /**
    * * Field Name: Refund_to_Individual__c
    * * Display Name: Refund _to _Individual __c
    * * SQL Data Type: bit
    */
    get Refund_to_Individual__c(): boolean | null {
        return this.Get('Refund_to_Individual__c');
    }
    set Refund_to_Individual__c(value: boolean | null) {
        this.Set('Refund_to_Individual__c', value);
    }

    /**
    * * Field Name: Student_year__c
    * * Display Name: Student _year __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Student_year__c(): string | null {
        return this.Get('Student_year__c');
    }
    set Student_year__c(value: string | null) {
        this.Set('Student_year__c', value);
    }

    /**
    * * Field Name: Fellowship_program__c
    * * Display Name: Fellowship _program __c
    * * SQL Data Type: bit
    */
    get Fellowship_program__c(): boolean | null {
        return this.Get('Fellowship_program__c');
    }
    set Fellowship_program__c(value: boolean | null) {
        this.Set('Fellowship_program__c', value);
    }

    /**
    * * Field Name: Expected_graduation_date__c
    * * Display Name: Expected _graduation _date __c
    * * SQL Data Type: datetimeoffset
    */
    get Expected_graduation_date__c(): Date | null {
        return this.Get('Expected_graduation_date__c');
    }

    /**
    * * Field Name: Student_teach__c
    * * Display Name: Student _teach __c
    * * SQL Data Type: bit
    */
    get Student_teach__c(): boolean | null {
        return this.Get('Student_teach__c');
    }
    set Student_teach__c(value: boolean | null) {
        this.Set('Student_teach__c', value);
    }

    /**
    * * Field Name: Member_of_FTA__c
    * * Display Name: Member _of _FTA__c
    * * SQL Data Type: bit
    */
    get Member_of_FTA__c(): boolean | null {
        return this.Get('Member_of_FTA__c');
    }
    set Member_of_FTA__c(value: boolean | null) {
        this.Set('Member_of_FTA__c', value);
    }

    /**
    * * Field Name: Grade_Level__c
    * * Display Name: Grade _Level __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Grade_Level__c(): string | null {
        return this.Get('Grade_Level__c');
    }
    set Grade_Level__c(value: string | null) {
        this.Set('Grade_Level__c', value);
    }

    /**
    * * Field Name: NU__PrimaryAffiliationRecord__c
    * * Display Name: NU__Primary Affiliation Record __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__PrimaryAffiliationRecord__c(): string | null {
        return this.Get('NU__PrimaryAffiliationRecord__c');
    }
    set NU__PrimaryAffiliationRecord__c(value: string | null) {
        this.Set('NU__PrimaryAffiliationRecord__c', value);
    }

    /**
    * * Field Name: Is_certified__c
    * * Display Name: Is _certified __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Is_certified__c(): string | null {
        return this.Get('Is_certified__c');
    }
    set Is_certified__c(value: string | null) {
        this.Set('Is_certified__c', value);
    }

    /**
    * * Field Name: Account_Owner_Data_Processing__c
    * * Display Name: Account _Owner _Data _Processing __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Account_Owner_Data_Processing__c(): string | null {
        return this.Get('Account_Owner_Data_Processing__c');
    }
    set Account_Owner_Data_Processing__c(value: string | null) {
        this.Set('Account_Owner_Data_Processing__c', value);
    }

    /**
    * * Field Name: AccrualDues__c
    * * Display Name: Accrual Dues __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get AccrualDues__c(): string | null {
        return this.Get('AccrualDues__c');
    }
    set AccrualDues__c(value: string | null) {
        this.Set('AccrualDues__c', value);
    }

    /**
    * * Field Name: DESE_Key__c
    * * Display Name: DESE_Key __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get DESE_Key__c(): string | null {
        return this.Get('DESE_Key__c');
    }
    set DESE_Key__c(value: string | null) {
        this.Set('DESE_Key__c', value);
    }

    /**
    * * Field Name: SSN_Last_4__c
    * * Display Name: SSN_Last _4__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get SSN_Last_4__c(): string | null {
        return this.Get('SSN_Last_4__c');
    }
    set SSN_Last_4__c(value: string | null) {
        this.Set('SSN_Last_4__c', value);
    }

    /**
    * * Field Name: CTA_Number__c
    * * Display Name: CTA_Number __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get CTA_Number__c(): string | null {
        return this.Get('CTA_Number__c');
    }
    set CTA_Number__c(value: string | null) {
        this.Set('CTA_Number__c', value);
    }

    /**
    * * Field Name: CloudingoAgent__BAR__c
    * * Display Name: Cloudingo Agent __BAR__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get CloudingoAgent__BAR__c(): string | null {
        return this.Get('CloudingoAgent__BAR__c');
    }
    set CloudingoAgent__BAR__c(value: string | null) {
        this.Set('CloudingoAgent__BAR__c', value);
    }

    /**
    * * Field Name: Membership_Product_Name__c
    * * Display Name: Membership _Product _Name __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Membership_Product_Name__c(): string | null {
        return this.Get('Membership_Product_Name__c');
    }
    set Membership_Product_Name__c(value: string | null) {
        this.Set('Membership_Product_Name__c', value);
    }

    /**
    * * Field Name: Beneficiary__c
    * * Display Name: Beneficiary __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Beneficiary__c(): string | null {
        return this.Get('Beneficiary__c');
    }
    set Beneficiary__c(value: string | null) {
        this.Set('Beneficiary__c', value);
    }

    /**
    * * Field Name: Exclude_Directory__c
    * * Display Name: Exclude _Directory __c
    * * SQL Data Type: bit
    */
    get Exclude_Directory__c(): boolean | null {
        return this.Get('Exclude_Directory__c');
    }
    set Exclude_Directory__c(value: boolean | null) {
        this.Set('Exclude_Directory__c', value);
    }

    /**
    * * Field Name: NU__PrimaryContactEmail__c
    * * Display Name: NU__Primary Contact Email __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__PrimaryContactEmail__c(): string | null {
        return this.Get('NU__PrimaryContactEmail__c');
    }
    set NU__PrimaryContactEmail__c(value: string | null) {
        this.Set('NU__PrimaryContactEmail__c', value);
    }

    /**
    * * Field Name: Previous_Last_Name__c
    * * Display Name: Previous _Last _Name __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Previous_Last_Name__c(): string | null {
        return this.Get('Previous_Last_Name__c');
    }
    set Previous_Last_Name__c(value: string | null) {
        this.Set('Previous_Last_Name__c', value);
    }

    /**
    * * Field Name: Collect_Student_Chapter_Dues__c
    * * Display Name: Collect _Student _Chapter _Dues __c
    * * SQL Data Type: bit
    */
    get Collect_Student_Chapter_Dues__c(): boolean | null {
        return this.Get('Collect_Student_Chapter_Dues__c');
    }
    set Collect_Student_Chapter_Dues__c(value: boolean | null) {
        this.Set('Collect_Student_Chapter_Dues__c', value);
    }

    /**
    * * Field Name: Contact_if_problems__c
    * * Display Name: Contact _if _problems __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Contact_if_problems__c(): string | null {
        return this.Get('Contact_if_problems__c');
    }
    set Contact_if_problems__c(value: string | null) {
        this.Set('Contact_if_problems__c', value);
    }

    /**
    * * Field Name: Display_CTA_Dues__c
    * * Display Name: Display _CTA_Dues __c
    * * SQL Data Type: bit
    */
    get Display_CTA_Dues__c(): boolean | null {
        return this.Get('Display_CTA_Dues__c');
    }
    set Display_CTA_Dues__c(value: boolean | null) {
        this.Set('Display_CTA_Dues__c', value);
    }

    /**
    * * Field Name: Payroll_deduction_through__c
    * * Display Name: Payroll _deduction _through __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Payroll_deduction_through__c(): string | null {
        return this.Get('Payroll_deduction_through__c');
    }
    set Payroll_deduction_through__c(value: string | null) {
        this.Set('Payroll_deduction_through__c', value);
    }

    /**
    * * Field Name: CTA_Priority__c
    * * Display Name: CTA_Priority __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get CTA_Priority__c(): string | null {
        return this.Get('CTA_Priority__c');
    }
    set CTA_Priority__c(value: string | null) {
        this.Set('CTA_Priority__c', value);
    }

    /**
    * * Field Name: Easy_Renewal__c
    * * Display Name: Easy _Renewal __c
    * * SQL Data Type: bit
    */
    get Easy_Renewal__c(): boolean | null {
        return this.Get('Easy_Renewal__c');
    }
    set Easy_Renewal__c(value: boolean | null) {
        this.Set('Easy_Renewal__c', value);
    }

    /**
    * * Field Name: Contact_Account_del__c
    * * Display Name: Contact _Account _del __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Contact_Account_del__c(): string | null {
        return this.Get('Contact_Account_del__c');
    }
    set Contact_Account_del__c(value: string | null) {
        this.Set('Contact_Account_del__c', value);
    }

    /**
    * * Field Name: Member_Id__c
    * * Display Name: Member _Id __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Member_Id__c(): string | null {
        return this.Get('Member_Id__c');
    }
    set Member_Id__c(value: string | null) {
        this.Set('Member_Id__c', value);
    }

    /**
    * * Field Name: School_District_Account__c
    * * Display Name: School _District _Account __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get School_District_Account__c(): string | null {
        return this.Get('School_District_Account__c');
    }
    set School_District_Account__c(value: string | null) {
        this.Set('School_District_Account__c', value);
    }

    /**
    * * Field Name: MSTA_Action__c
    * * Display Name: MSTA_Action __c
    * * SQL Data Type: bit
    */
    get MSTA_Action__c(): boolean | null {
        return this.Get('MSTA_Action__c');
    }
    set MSTA_Action__c(value: boolean | null) {
        this.Set('MSTA_Action__c', value);
    }

    /**
    * * Field Name: No_outside_solicitation__c
    * * Display Name: No _outside _solicitation __c
    * * SQL Data Type: bit
    */
    get No_outside_solicitation__c(): boolean | null {
        return this.Get('No_outside_solicitation__c');
    }
    set No_outside_solicitation__c(value: boolean | null) {
        this.Set('No_outside_solicitation__c', value);
    }

    /**
    * * Field Name: No_Magazine__c
    * * Display Name: No _Magazine __c
    * * SQL Data Type: bit
    */
    get No_Magazine__c(): boolean | null {
        return this.Get('No_Magazine__c');
    }
    set No_Magazine__c(value: boolean | null) {
        this.Set('No_Magazine__c', value);
    }

    /**
    * * Field Name: Opt_out_of_all_MSTA_mail__c
    * * Display Name: Opt _out _of _all _MSTA_mail __c
    * * SQL Data Type: bit
    */
    get Opt_out_of_all_MSTA_mail__c(): boolean | null {
        return this.Get('Opt_out_of_all_MSTA_mail__c');
    }
    set Opt_out_of_all_MSTA_mail__c(value: boolean | null) {
        this.Set('Opt_out_of_all_MSTA_mail__c', value);
    }

    /**
    * * Field Name: Membership_Card__c
    * * Display Name: Membership _Card __c
    * * SQL Data Type: datetimeoffset
    */
    get Membership_Card__c(): Date | null {
        return this.Get('Membership_Card__c');
    }

    /**
    * * Field Name: Beneficiary_Relation__c
    * * Display Name: Beneficiary _Relation __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Beneficiary_Relation__c(): string | null {
        return this.Get('Beneficiary_Relation__c');
    }
    set Beneficiary_Relation__c(value: string | null) {
        this.Set('Beneficiary_Relation__c', value);
    }

    /**
    * * Field Name: Opt_out_of_all_MSTA_Email__c
    * * Display Name: Opt _out _of _all _MSTA_Email __c
    * * SQL Data Type: bit
    */
    get Opt_out_of_all_MSTA_Email__c(): boolean | null {
        return this.Get('Opt_out_of_all_MSTA_Email__c');
    }
    set Opt_out_of_all_MSTA_Email__c(value: boolean | null) {
        this.Set('Opt_out_of_all_MSTA_Email__c', value);
    }

    /**
    * * Field Name: Content_Area__c
    * * Display Name: Content _Area __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Content_Area__c(): string | null {
        return this.Get('Content_Area__c');
    }
    set Content_Area__c(value: string | null) {
        this.Set('Content_Area__c', value);
    }

    /**
    * * Field Name: NU__PrimaryContactName__c
    * * Display Name: NU__Primary Contact Name __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__PrimaryContactName__c(): string | null {
        return this.Get('NU__PrimaryContactName__c');
    }
    set NU__PrimaryContactName__c(value: string | null) {
        this.Set('NU__PrimaryContactName__c', value);
    }

    /**
    * * Field Name: NU__PrimaryLocationQualityCode__c
    * * Display Name: NU__Primary Location Quality Code __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__PrimaryLocationQualityCode__c(): string | null {
        return this.Get('NU__PrimaryLocationQualityCode__c');
    }
    set NU__PrimaryLocationQualityCode__c(value: string | null) {
        this.Set('NU__PrimaryLocationQualityCode__c', value);
    }

    /**
    * * Field Name: NU__PrimaryLocation__Latitude__s
    * * Display Name: NU__Primary Location __Latitude __s
    * * SQL Data Type: decimal(10, 7)
    */
    get NU__PrimaryLocation__Latitude__s(): number | null {
        return this.Get('NU__PrimaryLocation__Latitude__s');
    }
    set NU__PrimaryLocation__Latitude__s(value: number | null) {
        this.Set('NU__PrimaryLocation__Latitude__s', value);
    }

    /**
    * * Field Name: NU__PrimaryLocation__Longitude__s
    * * Display Name: NU__Primary Location __Longitude __s
    * * SQL Data Type: decimal(10, 7)
    */
    get NU__PrimaryLocation__Longitude__s(): number | null {
        return this.Get('NU__PrimaryLocation__Longitude__s');
    }
    set NU__PrimaryLocation__Longitude__s(value: number | null) {
        this.Set('NU__PrimaryLocation__Longitude__s', value);
    }

    /**
    * * Field Name: Region__c
    * * Display Name: Region
    * * SQL Data Type: nvarchar(MAX)
    */
    get Region__c(): string | null {
        return this.Get('Region__c');
    }
    set Region__c(value: string | null) {
        this.Set('Region__c', value);
    }

    /**
    * * Field Name: Institution__c
    * * Display Name: Institution __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Institution__c(): string | null {
        return this.Get('Institution__c');
    }
    set Institution__c(value: string | null) {
        this.Set('Institution__c', value);
    }

    /**
    * * Field Name: Work_Phone__c
    * * Display Name: Work _Phone __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Work_Phone__c(): string | null {
        return this.Get('Work_Phone__c');
    }
    set Work_Phone__c(value: string | null) {
        this.Set('Work_Phone__c', value);
    }

    /**
    * * Field Name: Deceased__c
    * * Display Name: Deceased __c
    * * SQL Data Type: bit
    */
    get Deceased__c(): boolean | null {
        return this.Get('Deceased__c');
    }
    set Deceased__c(value: boolean | null) {
        this.Set('Deceased__c', value);
    }

    /**
    * * Field Name: Expelled__c
    * * Display Name: Expelled __c
    * * SQL Data Type: bit
    */
    get Expelled__c(): boolean | null {
        return this.Get('Expelled__c');
    }
    set Expelled__c(value: boolean | null) {
        this.Set('Expelled__c', value);
    }

    /**
    * * Field Name: Legacy_Customer_Type__c
    * * Display Name: Legacy _Customer _Type __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Legacy_Customer_Type__c(): string | null {
        return this.Get('Legacy_Customer_Type__c');
    }
    set Legacy_Customer_Type__c(value: string | null) {
        this.Set('Legacy_Customer_Type__c', value);
    }

    /**
    * * Field Name: Future_Member_Type__c
    * * Display Name: Future _Member _Type __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Future_Member_Type__c(): string | null {
        return this.Get('Future_Member_Type__c');
    }
    set Future_Member_Type__c(value: string | null) {
        this.Set('Future_Member_Type__c', value);
    }

    /**
    * * Field Name: Future_Member__c
    * * Display Name: Future _Member __c
    * * SQL Data Type: bit
    */
    get Future_Member__c(): boolean | null {
        return this.Get('Future_Member__c');
    }
    set Future_Member__c(value: boolean | null) {
        this.Set('Future_Member__c', value);
    }

    /**
    * * Field Name: Future_Pay_Type__c
    * * Display Name: Future _Pay _Type __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Future_Pay_Type__c(): string | null {
        return this.Get('Future_Pay_Type__c');
    }
    set Future_Pay_Type__c(value: string | null) {
        this.Set('Future_Pay_Type__c', value);
    }

    /**
    * * Field Name: Future_Product_Type__c
    * * Display Name: Future _Product _Type __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Future_Product_Type__c(): string | null {
        return this.Get('Future_Product_Type__c');
    }
    set Future_Product_Type__c(value: string | null) {
        this.Set('Future_Product_Type__c', value);
    }

    /**
    * * Field Name: Future_Status__c
    * * Display Name: Future _Status __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Future_Status__c(): string | null {
        return this.Get('Future_Status__c');
    }
    set Future_Status__c(value: string | null) {
        this.Set('Future_Status__c', value);
    }

    /**
    * * Field Name: New_Member_Type__c
    * * Display Name: New _Member _Type __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get New_Member_Type__c(): string | null {
        return this.Get('New_Member_Type__c');
    }
    set New_Member_Type__c(value: string | null) {
        this.Set('New_Member_Type__c', value);
    }

    /**
    * * Field Name: New_Member__c
    * * Display Name: New _Member __c
    * * SQL Data Type: bit
    */
    get New_Member__c(): boolean | null {
        return this.Get('New_Member__c');
    }
    set New_Member__c(value: boolean | null) {
        this.Set('New_Member__c', value);
    }

    /**
    * * Field Name: New_Product_Type__c
    * * Display Name: New _Product _Type __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get New_Product_Type__c(): string | null {
        return this.Get('New_Product_Type__c');
    }
    set New_Product_Type__c(value: string | null) {
        this.Set('New_Product_Type__c', value);
    }

    /**
    * * Field Name: Suspend__c
    * * Display Name: Suspend __c
    * * SQL Data Type: bit
    */
    get Suspend__c(): boolean | null {
        return this.Get('Suspend__c');
    }
    set Suspend__c(value: boolean | null) {
        this.Set('Suspend__c', value);
    }

    /**
    * * Field Name: UnmatchedBalances__c
    * * Display Name: Unmatched Balances __c
    * * SQL Data Type: bit
    */
    get UnmatchedBalances__c(): boolean | null {
        return this.Get('UnmatchedBalances__c');
    }
    set UnmatchedBalances__c(value: boolean | null) {
        this.Set('UnmatchedBalances__c', value);
    }

    /**
    * * Field Name: Test_Owner_Matches_Parent__c
    * * Display Name: Test _Owner _Matches _Parent __c
    * * SQL Data Type: bit
    */
    get Test_Owner_Matches_Parent__c(): boolean | null {
        return this.Get('Test_Owner_Matches_Parent__c');
    }
    set Test_Owner_Matches_Parent__c(value: boolean | null) {
        this.Set('Test_Owner_Matches_Parent__c', value);
    }

    /**
    * * Field Name: Institution_CTA_Number__c
    * * Display Name: Institution _CTA_Number __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Institution_CTA_Number__c(): string | null {
        return this.Get('Institution_CTA_Number__c');
    }
    set Institution_CTA_Number__c(value: string | null) {
        this.Set('Institution_CTA_Number__c', value);
    }

    /**
    * * Field Name: Marketing_Label__c
    * * Display Name: Marketing _Label __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Marketing_Label__c(): string | null {
        return this.Get('Marketing_Label__c');
    }
    set Marketing_Label__c(value: string | null) {
        this.Set('Marketing_Label__c', value);
    }

    /**
    * * Field Name: Future_Marketing_Label__c
    * * Display Name: Future _Marketing _Label __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Future_Marketing_Label__c(): string | null {
        return this.Get('Future_Marketing_Label__c');
    }
    set Future_Marketing_Label__c(value: string | null) {
        this.Set('Future_Marketing_Label__c', value);
    }

    /**
    * * Field Name: InstitutionId__c
    * * Display Name: Institution Id __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get InstitutionId__c(): string | null {
        return this.Get('InstitutionId__c');
    }
    set InstitutionId__c(value: string | null) {
        this.Set('InstitutionId__c', value);
    }

    /**
    * * Field Name: Easy_Renewal_Complete__c
    * * Display Name: Easy _Renewal _Complete __c
    * * SQL Data Type: bit
    */
    get Easy_Renewal_Complete__c(): boolean | null {
        return this.Get('Easy_Renewal_Complete__c');
    }
    set Easy_Renewal_Complete__c(value: boolean | null) {
        this.Set('Easy_Renewal_Complete__c', value);
    }

    /**
    * * Field Name: Remove_Reason__c
    * * Display Name: Remove _Reason __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Remove_Reason__c(): string | null {
        return this.Get('Remove_Reason__c');
    }
    set Remove_Reason__c(value: string | null) {
        this.Set('Remove_Reason__c', value);
    }

    /**
    * * Field Name: MobileAdmin__c
    * * Display Name: Mobile Admin __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get MobileAdmin__c(): string | null {
        return this.Get('MobileAdmin__c');
    }
    set MobileAdmin__c(value: string | null) {
        this.Set('MobileAdmin__c', value);
    }

    /**
    * * Field Name: MobileDirectoryActive__c
    * * Display Name: Mobile Directory Active __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get MobileDirectoryActive__c(): string | null {
        return this.Get('MobileDirectoryActive__c');
    }
    set MobileDirectoryActive__c(value: string | null) {
        this.Set('MobileDirectoryActive__c', value);
    }

    /**
    * * Field Name: MobileInfo__c
    * * Display Name: Mobile Info __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get MobileInfo__c(): string | null {
        return this.Get('MobileInfo__c');
    }
    set MobileInfo__c(value: string | null) {
        this.Set('MobileInfo__c', value);
    }

    /**
    * * Field Name: Future_Renewal_Notice_Code__c
    * * Display Name: Future _Renewal _Notice _Code __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Future_Renewal_Notice_Code__c(): string | null {
        return this.Get('Future_Renewal_Notice_Code__c');
    }
    set Future_Renewal_Notice_Code__c(value: string | null) {
        this.Set('Future_Renewal_Notice_Code__c', value);
    }

    /**
    * * Field Name: NU__PrimaryContact__c
    * * Display Name: NU__Primary Contact __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__PrimaryContact__c(): string | null {
        return this.Get('NU__PrimaryContact__c');
    }
    set NU__PrimaryContact__c(value: string | null) {
        this.Set('NU__PrimaryContact__c', value);
    }

    /**
    * * Field Name: NU__UpdatePrimaryLocation__c
    * * Display Name: NU__Update Primary Location __c
    * * SQL Data Type: bit
    */
    get NU__UpdatePrimaryLocation__c(): boolean | null {
        return this.Get('NU__UpdatePrimaryLocation__c');
    }
    set NU__UpdatePrimaryLocation__c(value: boolean | null) {
        this.Set('NU__UpdatePrimaryLocation__c', value);
    }

    /**
    * * Field Name: Agreed_to_Terms__c
    * * Display Name: Agreed _to _Terms __c
    * * SQL Data Type: datetimeoffset
    */
    get Agreed_to_Terms__c(): Date | null {
        return this.Get('Agreed_to_Terms__c');
    }

    /**
    * * Field Name: Alternate_Work_Phone__c
    * * Display Name: Alternate _Work _Phone __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Alternate_Work_Phone__c(): string | null {
        return this.Get('Alternate_Work_Phone__c');
    }
    set Alternate_Work_Phone__c(value: string | null) {
        this.Set('Alternate_Work_Phone__c', value);
    }

    /**
    * * Field Name: School_Address__c
    * * Display Name: School _Address __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get School_Address__c(): string | null {
        return this.Get('School_Address__c');
    }
    set School_Address__c(value: string | null) {
        this.Set('School_Address__c', value);
    }

    /**
    * * Field Name: School_City_F__c
    * * Display Name: School _City _F__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get School_City_F__c(): string | null {
        return this.Get('School_City_F__c');
    }
    set School_City_F__c(value: string | null) {
        this.Set('School_City_F__c', value);
    }

    /**
    * * Field Name: School_Country_F__c
    * * Display Name: School _Country _F__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get School_Country_F__c(): string | null {
        return this.Get('School_Country_F__c');
    }
    set School_Country_F__c(value: string | null) {
        this.Set('School_Country_F__c', value);
    }

    /**
    * * Field Name: School_StateProvince__c
    * * Display Name: School _State Province __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get School_StateProvince__c(): string | null {
        return this.Get('School_StateProvince__c');
    }
    set School_StateProvince__c(value: string | null) {
        this.Set('School_StateProvince__c', value);
    }

    /**
    * * Field Name: School_Street__c
    * * Display Name: School _Street __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get School_Street__c(): string | null {
        return this.Get('School_Street__c');
    }
    set School_Street__c(value: string | null) {
        this.Set('School_Street__c', value);
    }

    /**
    * * Field Name: School_ZipPostal_Code__c
    * * Display Name: School _Zip Postal _Code __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get School_ZipPostal_Code__c(): string | null {
        return this.Get('School_ZipPostal_Code__c');
    }
    set School_ZipPostal_Code__c(value: string | null) {
        this.Set('School_ZipPostal_Code__c', value);
    }

    /**
    * * Field Name: Student_At_School_Address_Line_1__c
    * * Display Name: Student _At _School _Address _Line _1__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Student_At_School_Address_Line_1__c(): string | null {
        return this.Get('Student_At_School_Address_Line_1__c');
    }
    set Student_At_School_Address_Line_1__c(value: string | null) {
        this.Set('Student_At_School_Address_Line_1__c', value);
    }

    /**
    * * Field Name: Student_At_School_Address_Line_2__c
    * * Display Name: Student _At _School _Address _Line _2__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Student_At_School_Address_Line_2__c(): string | null {
        return this.Get('Student_At_School_Address_Line_2__c');
    }
    set Student_At_School_Address_Line_2__c(value: string | null) {
        this.Set('Student_At_School_Address_Line_2__c', value);
    }

    /**
    * * Field Name: Student_At_School_Address_Line_3__c
    * * Display Name: Student _At _School _Address _Line _3__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Student_At_School_Address_Line_3__c(): string | null {
        return this.Get('Student_At_School_Address_Line_3__c');
    }
    set Student_At_School_Address_Line_3__c(value: string | null) {
        this.Set('Student_At_School_Address_Line_3__c', value);
    }

    /**
    * * Field Name: Student_At_School_City__c
    * * Display Name: Student _At _School _City __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Student_At_School_City__c(): string | null {
        return this.Get('Student_At_School_City__c');
    }
    set Student_At_School_City__c(value: string | null) {
        this.Set('Student_At_School_City__c', value);
    }

    /**
    * * Field Name: Student_At_School_Country__c
    * * Display Name: Student _At _School _Country __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Student_At_School_Country__c(): string | null {
        return this.Get('Student_At_School_Country__c');
    }
    set Student_At_School_Country__c(value: string | null) {
        this.Set('Student_At_School_Country__c', value);
    }

    /**
    * * Field Name: Student_At_School_PostalCode__c
    * * Display Name: Student _At _School _Postal Code __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Student_At_School_PostalCode__c(): string | null {
        return this.Get('Student_At_School_PostalCode__c');
    }
    set Student_At_School_PostalCode__c(value: string | null) {
        this.Set('Student_At_School_PostalCode__c', value);
    }

    /**
    * * Field Name: Student_At_School_State__c
    * * Display Name: Student _At _School _State __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Student_At_School_State__c(): string | null {
        return this.Get('Student_At_School_State__c');
    }
    set Student_At_School_State__c(value: string | null) {
        this.Set('Student_At_School_State__c', value);
    }

    /**
    * * Field Name: Student_At_School_Street__c
    * * Display Name: Student _At _School _Street __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Student_At_School_Street__c(): string | null {
        return this.Get('Student_At_School_Street__c');
    }
    set Student_At_School_Street__c(value: string | null) {
        this.Set('Student_At_School_Street__c', value);
    }

    /**
    * * Field Name: Student_At_School__c
    * * Display Name: Student _At _School __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Student_At_School__c(): string | null {
        return this.Get('Student_At_School__c');
    }
    set Student_At_School__c(value: string | null) {
        this.Set('Student_At_School__c', value);
    }

    /**
    * * Field Name: Use_for_Billing__c
    * * Display Name: Use _for _Billing __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Use_for_Billing__c(): string | null {
        return this.Get('Use_for_Billing__c');
    }
    set Use_for_Billing__c(value: string | null) {
        this.Set('Use_for_Billing__c', value);
    }

    /**
    * * Field Name: Use_for_Mailing__c
    * * Display Name: Use _for _Mailing __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Use_for_Mailing__c(): string | null {
        return this.Get('Use_for_Mailing__c');
    }
    set Use_for_Mailing__c(value: string | null) {
        this.Set('Use_for_Mailing__c', value);
    }

    /**
    * * Field Name: Use_for_Shipping__c
    * * Display Name: Use _for _Shipping __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Use_for_Shipping__c(): string | null {
        return this.Get('Use_for_Shipping__c');
    }
    set Use_for_Shipping__c(value: string | null) {
        this.Set('Use_for_Shipping__c', value);
    }

    /**
    * * Field Name: Future_Product_List_Price__c
    * * Display Name: Future _Product _List _Price __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Future_Product_List_Price__c(): string | null {
        return this.Get('Future_Product_List_Price__c');
    }
    set Future_Product_List_Price__c(value: string | null) {
        this.Set('Future_Product_List_Price__c', value);
    }

    /**
    * * Field Name: Chapter_Dues_Amount__c
    * * Display Name: Chapter _Dues _Amount __c
    * * SQL Data Type: decimal(18, 2)
    */
    get Chapter_Dues_Amount__c(): number | null {
        return this.Get('Chapter_Dues_Amount__c');
    }
    set Chapter_Dues_Amount__c(value: number | null) {
        this.Set('Chapter_Dues_Amount__c', value);
    }

    /**
    * * Field Name: Lapsed_Beyond_Grace_Return_Date__c
    * * Display Name: Lapsed _Beyond _Grace _Return _Date __c
    * * SQL Data Type: datetimeoffset
    */
    get Lapsed_Beyond_Grace_Return_Date__c(): Date | null {
        return this.Get('Lapsed_Beyond_Grace_Return_Date__c');
    }

    /**
    * * Field Name: MSTA_Legacy_Customer_Type__c
    * * Display Name: MSTA_Legacy _Customer _Type __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get MSTA_Legacy_Customer_Type__c(): string | null {
        return this.Get('MSTA_Legacy_Customer_Type__c');
    }
    set MSTA_Legacy_Customer_Type__c(value: string | null) {
        this.Set('MSTA_Legacy_Customer_Type__c', value);
    }

    /**
    * * Field Name: Renewal_Forms_Sort__c
    * * Display Name: Renewal _Forms _Sort __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Renewal_Forms_Sort__c(): string | null {
        return this.Get('Renewal_Forms_Sort__c');
    }
    set Renewal_Forms_Sort__c(value: string | null) {
        this.Set('Renewal_Forms_Sort__c', value);
    }

    /**
    * * Field Name: State_House_District__c
    * * Display Name: State _House _District __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get State_House_District__c(): string | null {
        return this.Get('State_House_District__c');
    }
    set State_House_District__c(value: string | null) {
        this.Set('State_House_District__c', value);
    }

    /**
    * * Field Name: State_Senate_District__c
    * * Display Name: State _Senate _District __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get State_Senate_District__c(): string | null {
        return this.Get('State_Senate_District__c');
    }
    set State_Senate_District__c(value: string | null) {
        this.Set('State_Senate_District__c', value);
    }

    /**
    * * Field Name: NU__CreditBalance__c
    * * Display Name: NU__Credit Balance __c
    * * SQL Data Type: decimal(18, 2)
    */
    get NU__CreditBalance__c(): number | null {
        return this.Get('NU__CreditBalance__c');
    }
    set NU__CreditBalance__c(value: number | null) {
        this.Set('NU__CreditBalance__c', value);
    }

    /**
    * * Field Name: Abbreviation__c
    * * Display Name: Abbreviation __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Abbreviation__c(): string | null {
        return this.Get('Abbreviation__c');
    }
    set Abbreviation__c(value: string | null) {
        this.Set('Abbreviation__c', value);
    }

    /**
    * * Field Name: Previous_Acct_Owner__c
    * * Display Name: Previous _Acct _Owner __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Previous_Acct_Owner__c(): string | null {
        return this.Get('Previous_Acct_Owner__c');
    }
    set Previous_Acct_Owner__c(value: string | null) {
        this.Set('Previous_Acct_Owner__c', value);
    }

    /**
    * * Field Name: County__c
    * * Display Name: County __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get County__c(): string | null {
        return this.Get('County__c');
    }
    set County__c(value: string | null) {
        this.Set('County__c', value);
    }

    /**
    * * Field Name: Alt_Contact_Account_del__c
    * * Display Name: Alt _Contact _Account _del __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Alt_Contact_Account_del__c(): string | null {
        return this.Get('Alt_Contact_Account_del__c');
    }
    set Alt_Contact_Account_del__c(value: string | null) {
        this.Set('Alt_Contact_Account_del__c', value);
    }

    /**
    * * Field Name: Net_Promoter_Score__c
    * * Display Name: Net _Promoter _Score __c
    * * SQL Data Type: decimal(2, 0)
    */
    get Net_Promoter_Score__c(): number | null {
        return this.Get('Net_Promoter_Score__c');
    }
    set Net_Promoter_Score__c(value: number | null) {
        this.Set('Net_Promoter_Score__c', value);
    }

    /**
    * * Field Name: NU__TotalAffiliatedAccounts__c
    * * Display Name: NU__Total Affiliated Accounts __c
    * * SQL Data Type: decimal(18, 0)
    */
    get NU__TotalAffiliatedAccounts__c(): number | null {
        return this.Get('NU__TotalAffiliatedAccounts__c');
    }
    set NU__TotalAffiliatedAccounts__c(value: number | null) {
        this.Set('NU__TotalAffiliatedAccounts__c', value);
    }

    /**
    * * Field Name: Respondent_Comments__c
    * * Display Name: Respondent _Comments __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Respondent_Comments__c(): string | null {
        return this.Get('Respondent_Comments__c');
    }
    set Respondent_Comments__c(value: string | null) {
        this.Set('Respondent_Comments__c', value);
    }

    /**
    * * Field Name: NU__FullNameOverride__c
    * * Display Name: NU__Full Name Override __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__FullNameOverride__c(): string | null {
        return this.Get('NU__FullNameOverride__c');
    }
    set NU__FullNameOverride__c(value: string | null) {
        this.Set('NU__FullNameOverride__c', value);
    }

    /**
    * * Field Name: Birthday_Day__c
    * * Display Name: Birthday _Day __c
    * * SQL Data Type: decimal(18, 0)
    */
    get Birthday_Day__c(): number | null {
        return this.Get('Birthday_Day__c');
    }
    set Birthday_Day__c(value: number | null) {
        this.Set('Birthday_Day__c', value);
    }

    /**
    * * Field Name: Non_member_Opt_In__c
    * * Display Name: Non _member _Opt _In __c
    * * SQL Data Type: bit
    */
    get Non_member_Opt_In__c(): boolean | null {
        return this.Get('Non_member_Opt_In__c');
    }
    set Non_member_Opt_In__c(value: boolean | null) {
        this.Set('Non_member_Opt_In__c', value);
    }

    /**
    * * Field Name: NU__Trusted__c
    * * Display Name: NU__Trusted __c
    * * SQL Data Type: bit
    */
    get NU__Trusted__c(): boolean | null {
        return this.Get('NU__Trusted__c');
    }
    set NU__Trusted__c(value: boolean | null) {
        this.Set('NU__Trusted__c', value);
    }

    /**
    * * Field Name: NC__AccountCreatedThroughSocialSignOn__c
    * * Display Name: NC__Account Created Through Social Sign On __c
    * * SQL Data Type: bit
    */
    get NC__AccountCreatedThroughSocialSignOn__c(): boolean | null {
        return this.Get('NC__AccountCreatedThroughSocialSignOn__c');
    }
    set NC__AccountCreatedThroughSocialSignOn__c(value: boolean | null) {
        this.Set('NC__AccountCreatedThroughSocialSignOn__c', value);
    }

    /**
    * * Field Name: NC__AccountDoesNotHavePassword__c
    * * Display Name: NC__Account Does Not Have Password __c
    * * SQL Data Type: bit
    */
    get NC__AccountDoesNotHavePassword__c(): boolean | null {
        return this.Get('NC__AccountDoesNotHavePassword__c');
    }
    set NC__AccountDoesNotHavePassword__c(value: boolean | null) {
        this.Set('NC__AccountDoesNotHavePassword__c', value);
    }

    /**
    * * Field Name: Expected_Graduation_Month__c
    * * Display Name: Expected _Graduation _Month __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Expected_Graduation_Month__c(): string | null {
        return this.Get('Expected_Graduation_Month__c');
    }
    set Expected_Graduation_Month__c(value: string | null) {
        this.Set('Expected_Graduation_Month__c', value);
    }

    /**
    * * Field Name: Expected_Graduation_Year__c
    * * Display Name: Expected _Graduation _Year __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Expected_Graduation_Year__c(): string | null {
        return this.Get('Expected_Graduation_Year__c');
    }
    set Expected_Graduation_Year__c(value: string | null) {
        this.Set('Expected_Graduation_Year__c', value);
    }

    /**
    * * Field Name: geopointe__Geocode__c
    * * Display Name: geopointe __Geocode __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get geopointe__Geocode__c(): string | null {
        return this.Get('geopointe__Geocode__c');
    }
    set geopointe__Geocode__c(value: string | null) {
        this.Set('geopointe__Geocode__c', value);
    }

    /**
    * * Field Name: Non_Renewal_Mailing__c
    * * Display Name: Non _Renewal _Mailing __c
    * * SQL Data Type: datetimeoffset
    */
    get Non_Renewal_Mailing__c(): Date | null {
        return this.Get('Non_Renewal_Mailing__c');
    }

    /**
    * * Field Name: NU__ProfileImageRevisionId__c
    * * Display Name: NU__Profile Image Revision Id __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__ProfileImageRevisionId__c(): string | null {
        return this.Get('NU__ProfileImageRevisionId__c');
    }
    set NU__ProfileImageRevisionId__c(value: string | null) {
        this.Set('NU__ProfileImageRevisionId__c', value);
    }

    /**
    * * Field Name: NU__ProfileImageURL__c
    * * Display Name: NU__Profile Image URL__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__ProfileImageURL__c(): string | null {
        return this.Get('NU__ProfileImageURL__c');
    }
    set NU__ProfileImageURL__c(value: string | null) {
        this.Set('NU__ProfileImageURL__c', value);
    }

    /**
    * * Field Name: NU__ProfileImage__c
    * * Display Name: NU__Profile Image __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__ProfileImage__c(): string | null {
        return this.Get('NU__ProfileImage__c');
    }
    set NU__ProfileImage__c(value: string | null) {
        this.Set('NU__ProfileImage__c', value);
    }

    /**
    * * Field Name: NU__SandboxEnabled__c
    * * Display Name: NU__Sandbox Enabled __c
    * * SQL Data Type: bit
    */
    get NU__SandboxEnabled__c(): boolean | null {
        return this.Get('NU__SandboxEnabled__c');
    }
    set NU__SandboxEnabled__c(value: boolean | null) {
        this.Set('NU__SandboxEnabled__c', value);
    }

    /**
    * * Field Name: NPS_Year__c
    * * Display Name: NPS_Year __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NPS_Year__c(): string | null {
        return this.Get('NPS_Year__c');
    }
    set NPS_Year__c(value: string | null) {
        this.Set('NPS_Year__c', value);
    }

    /**
    * * Field Name: NPS_Response_Label__c
    * * Display Name: NPS_Response _Label __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NPS_Response_Label__c(): string | null {
        return this.Get('NPS_Response_Label__c');
    }
    set NPS_Response_Label__c(value: string | null) {
        this.Set('NPS_Response_Label__c', value);
    }

    /**
    * * Field Name: AgencyUsedforFoodService__c
    * * Display Name: Agency Usedfor Food Service __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get AgencyUsedforFoodService__c(): string | null {
        return this.Get('AgencyUsedforFoodService__c');
    }
    set AgencyUsedforFoodService__c(value: string | null) {
        this.Set('AgencyUsedforFoodService__c', value);
    }

    /**
    * * Field Name: NPFollowupComments__c
    * * Display Name: NPFollowup Comments __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NPFollowupComments__c(): string | null {
        return this.Get('NPFollowupComments__c');
    }
    set NPFollowupComments__c(value: string | null) {
        this.Set('NPFollowupComments__c', value);
    }

    /**
    * * Field Name: AgencyusedforSubstitutes__c
    * * Display Name: Agencyusedfor Substitutes __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get AgencyusedforSubstitutes__c(): string | null {
        return this.Get('AgencyusedforSubstitutes__c');
    }
    set AgencyusedforSubstitutes__c(value: string | null) {
        this.Set('AgencyusedforSubstitutes__c', value);
    }

    /**
    * * Field Name: School_Building_Number__c
    * * Display Name: School _Building _Number __c
    * * SQL Data Type: decimal(4, 0)
    */
    get School_Building_Number__c(): number | null {
        return this.Get('School_Building_Number__c');
    }
    set School_Building_Number__c(value: number | null) {
        this.Set('School_Building_Number__c', value);
    }

    /**
    * * Field Name: AgencyusedforCustodialServices__c
    * * Display Name: Agencyusedfor Custodial Services __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get AgencyusedforCustodialServices__c(): string | null {
        return this.Get('AgencyusedforCustodialServices__c');
    }
    set AgencyusedforCustodialServices__c(value: string | null) {
        this.Set('AgencyusedforCustodialServices__c', value);
    }

    /**
    * * Field Name: CollectiveBargaining__c
    * * Display Name: Collective Bargaining __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get CollectiveBargaining__c(): string | null {
        return this.Get('CollectiveBargaining__c');
    }
    set CollectiveBargaining__c(value: string | null) {
        this.Set('CollectiveBargaining__c', value);
    }

    /**
    * * Field Name: ContractforCustodial__c
    * * Display Name: Contractfor Custodial __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get ContractforCustodial__c(): string | null {
        return this.Get('ContractforCustodial__c');
    }
    set ContractforCustodial__c(value: string | null) {
        this.Set('ContractforCustodial__c', value);
    }

    /**
    * * Field Name: ContractforFoodService__c
    * * Display Name: Contractfor Food Service __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get ContractforFoodService__c(): string | null {
        return this.Get('ContractforFoodService__c');
    }
    set ContractforFoodService__c(value: string | null) {
        this.Set('ContractforFoodService__c', value);
    }

    /**
    * * Field Name: ContractforSubstitutes__c
    * * Display Name: Contractfor Substitutes __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get ContractforSubstitutes__c(): string | null {
        return this.Get('ContractforSubstitutes__c');
    }
    set ContractforSubstitutes__c(value: string | null) {
        this.Set('ContractforSubstitutes__c', value);
    }

    /**
    * * Field Name: rrpu__Alert_Message__c
    * * Display Name: rrpu __Alert _Message __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get rrpu__Alert_Message__c(): string | null {
        return this.Get('rrpu__Alert_Message__c');
    }
    set rrpu__Alert_Message__c(value: string | null) {
        this.Set('rrpu__Alert_Message__c', value);
    }

    /**
    * * Field Name: CloudingoAgent__BAS__c
    * * Display Name: Cloudingo Agent __BAS__c
    * * SQL Data Type: decimal(18, 0)
    */
    get CloudingoAgent__BAS__c(): number | null {
        return this.Get('CloudingoAgent__BAS__c');
    }
    set CloudingoAgent__BAS__c(value: number | null) {
        this.Set('CloudingoAgent__BAS__c', value);
    }

    /**
    * * Field Name: CloudingoAgent__BAV__c
    * * Display Name: Cloudingo Agent __BAV__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get CloudingoAgent__BAV__c(): string | null {
        return this.Get('CloudingoAgent__BAV__c');
    }
    set CloudingoAgent__BAV__c(value: string | null) {
        this.Set('CloudingoAgent__BAV__c', value);
    }

    /**
    * * Field Name: CloudingoAgent__BRDI__c
    * * Display Name: Cloudingo Agent __BRDI__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get CloudingoAgent__BRDI__c(): string | null {
        return this.Get('CloudingoAgent__BRDI__c');
    }
    set CloudingoAgent__BRDI__c(value: string | null) {
        this.Set('CloudingoAgent__BRDI__c', value);
    }

    /**
    * * Field Name: CloudingoAgent__BTZ__c
    * * Display Name: Cloudingo Agent __BTZ__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get CloudingoAgent__BTZ__c(): string | null {
        return this.Get('CloudingoAgent__BTZ__c');
    }
    set CloudingoAgent__BTZ__c(value: string | null) {
        this.Set('CloudingoAgent__BTZ__c', value);
    }

    /**
    * * Field Name: CloudingoAgent__SAR__c
    * * Display Name: Cloudingo Agent __SAR__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get CloudingoAgent__SAR__c(): string | null {
        return this.Get('CloudingoAgent__SAR__c');
    }
    set CloudingoAgent__SAR__c(value: string | null) {
        this.Set('CloudingoAgent__SAR__c', value);
    }

    /**
    * * Field Name: CloudingoAgent__SAS__c
    * * Display Name: Cloudingo Agent __SAS__c
    * * SQL Data Type: decimal(18, 0)
    */
    get CloudingoAgent__SAS__c(): number | null {
        return this.Get('CloudingoAgent__SAS__c');
    }
    set CloudingoAgent__SAS__c(value: number | null) {
        this.Set('CloudingoAgent__SAS__c', value);
    }

    /**
    * * Field Name: CloudingoAgent__SAV__c
    * * Display Name: Cloudingo Agent __SAV__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get CloudingoAgent__SAV__c(): string | null {
        return this.Get('CloudingoAgent__SAV__c');
    }
    set CloudingoAgent__SAV__c(value: string | null) {
        this.Set('CloudingoAgent__SAV__c', value);
    }

    /**
    * * Field Name: CloudingoAgent__SRDI__c
    * * Display Name: Cloudingo Agent __SRDI__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get CloudingoAgent__SRDI__c(): string | null {
        return this.Get('CloudingoAgent__SRDI__c');
    }
    set CloudingoAgent__SRDI__c(value: string | null) {
        this.Set('CloudingoAgent__SRDI__c', value);
    }

    /**
    * * Field Name: CloudingoAgent__STZ__c
    * * Display Name: Cloudingo Agent __STZ__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get CloudingoAgent__STZ__c(): string | null {
        return this.Get('CloudingoAgent__STZ__c');
    }
    set CloudingoAgent__STZ__c(value: string | null) {
        this.Set('CloudingoAgent__STZ__c', value);
    }

    /**
    * * Field Name: LongFormID__c
    * * Display Name: Long Form ID__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get LongFormID__c(): string | null {
        return this.Get('LongFormID__c');
    }
    set LongFormID__c(value: string | null) {
        this.Set('LongFormID__c', value);
    }

    /**
    * * Field Name: InstitutionLongID__c
    * * Display Name: Institution Long ID__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get InstitutionLongID__c(): string | null {
        return this.Get('InstitutionLongID__c');
    }
    set InstitutionLongID__c(value: string | null) {
        this.Set('InstitutionLongID__c', value);
    }

    /**
    * * Field Name: BillHighway__c
    * * Display Name: Bill Highway __c
    * * SQL Data Type: bit
    */
    get BillHighway__c(): boolean | null {
        return this.Get('BillHighway__c');
    }
    set BillHighway__c(value: boolean | null) {
        this.Set('BillHighway__c', value);
    }

    /**
    * * Field Name: NoPacket__c
    * * Display Name: No Packet __c
    * * SQL Data Type: bit
    */
    get NoPacket__c(): boolean | null {
        return this.Get('NoPacket__c');
    }
    set NoPacket__c(value: boolean | null) {
        this.Set('NoPacket__c', value);
    }

    /**
    * * Field Name: YourMembershipType__c
    * * Display Name: Your Membership Type __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get YourMembershipType__c(): string | null {
        return this.Get('YourMembershipType__c');
    }
    set YourMembershipType__c(value: string | null) {
        this.Set('YourMembershipType__c', value);
    }

    /**
    * * Field Name: YourProductType__c
    * * Display Name: Your Product Type __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get YourProductType__c(): string | null {
        return this.Get('YourProductType__c');
    }
    set YourProductType__c(value: string | null) {
        this.Set('YourProductType__c', value);
    }

    /**
    * * Field Name: NC_DPP__AnonymizedDate__c
    * * Display Name: NC_DPP__Anonymized Date __c
    * * SQL Data Type: datetimeoffset
    */
    get NC_DPP__AnonymizedDate__c(): Date | null {
        return this.Get('NC_DPP__AnonymizedDate__c');
    }

    /**
    * * Field Name: NumCurrentYearMemberships__c
    * * Display Name: Num Current Year Memberships __c
    * * SQL Data Type: decimal(2, 0)
    */
    get NumCurrentYearMemberships__c(): number | null {
        return this.Get('NumCurrentYearMemberships__c');
    }
    set NumCurrentYearMemberships__c(value: number | null) {
        this.Set('NumCurrentYearMemberships__c', value);
    }

    /**
    * * Field Name: DoNotSendMembershipCard__c
    * * Display Name: Do Not Send Membership Card __c
    * * SQL Data Type: bit
    */
    get DoNotSendMembershipCard__c(): boolean | null {
        return this.Get('DoNotSendMembershipCard__c');
    }
    set DoNotSendMembershipCard__c(value: boolean | null) {
        this.Set('DoNotSendMembershipCard__c', value);
    }

    /**
    * * Field Name: NewBylawsReceived__c
    * * Display Name: New Bylaws Received __c
    * * SQL Data Type: datetimeoffset
    */
    get NewBylawsReceived__c(): Date | null {
        return this.Get('NewBylawsReceived__c');
    }

    /**
    * * Field Name: BillHighwayStatus__c
    * * Display Name: Bill Highway Status __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get BillHighwayStatus__c(): string | null {
        return this.Get('BillHighwayStatus__c');
    }
    set BillHighwayStatus__c(value: string | null) {
        this.Set('BillHighwayStatus__c', value);
    }

    /**
    * * Field Name: BillHighwayCanceledDate__c
    * * Display Name: Bill Highway Canceled Date __c
    * * SQL Data Type: datetimeoffset
    */
    get BillHighwayCanceledDate__c(): Date | null {
        return this.Get('BillHighwayCanceledDate__c');
    }

    /**
    * * Field Name: NU__LapsedOnOverride__c
    * * Display Name: NU__Lapsed On Override __c
    * * SQL Data Type: datetimeoffset
    */
    get NU__LapsedOnOverride__c(): Date | null {
        return this.Get('NU__LapsedOnOverride__c');
    }

    /**
    * * Field Name: NU__MemberOverride__c
    * * Display Name: NU__Member Override __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__MemberOverride__c(): string | null {
        return this.Get('NU__MemberOverride__c');
    }
    set NU__MemberOverride__c(value: string | null) {
        this.Set('NU__MemberOverride__c', value);
    }

    /**
    * * Field Name: qualtrics__NPS_Date__c
    * * Display Name: qualtrics __NPS_Date __c
    * * SQL Data Type: datetimeoffset
    */
    get qualtrics__NPS_Date__c(): Date | null {
        return this.Get('qualtrics__NPS_Date__c');
    }

    /**
    * * Field Name: qualtrics__Net_Promoter_Score__c
    * * Display Name: qualtrics __Net _Promoter _Score __c
    * * SQL Data Type: decimal(2, 0)
    */
    get qualtrics__Net_Promoter_Score__c(): number | null {
        return this.Get('qualtrics__Net_Promoter_Score__c');
    }
    set qualtrics__Net_Promoter_Score__c(value: number | null) {
        this.Set('qualtrics__Net_Promoter_Score__c', value);
    }

    /**
    * * Field Name: NPHowCanWeImprove__c
    * * Display Name: NPHow Can We Improve __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NPHowCanWeImprove__c(): string | null {
        return this.Get('NPHowCanWeImprove__c');
    }
    set NPHowCanWeImprove__c(value: string | null) {
        this.Set('NPHowCanWeImprove__c', value);
    }

    /**
    * * Field Name: NPFollowup__c
    * * Display Name: NPFollowup __c
    * * SQL Data Type: bit
    */
    get NPFollowup__c(): boolean | null {
        return this.Get('NPFollowup__c');
    }
    set NPFollowup__c(value: boolean | null) {
        this.Set('NPFollowup__c', value);
    }

    /**
    * * Field Name: NPEmail__c
    * * Display Name: NPEmail __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NPEmail__c(): string | null {
        return this.Get('NPEmail__c');
    }
    set NPEmail__c(value: string | null) {
        this.Set('NPEmail__c', value);
    }

    /**
    * * Field Name: District_Attorney__c
    * * Display Name: District _Attorney __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get District_Attorney__c(): string | null {
        return this.Get('District_Attorney__c');
    }
    set District_Attorney__c(value: string | null) {
        this.Set('District_Attorney__c', value);
    }

    /**
    * * Field Name: Email_Opt_in_Weekly_Bytes__c
    * * Display Name: Email _Opt _in _Weekly _Bytes __c
    * * SQL Data Type: bit
    */
    get Email_Opt_in_Weekly_Bytes__c(): boolean | null {
        return this.Get('Email_Opt_in_Weekly_Bytes__c');
    }
    set Email_Opt_in_Weekly_Bytes__c(value: boolean | null) {
        this.Set('Email_Opt_in_Weekly_Bytes__c', value);
    }

    /**
    * * Field Name: MNEA_LM_1_Filed__c
    * * Display Name: MNEA_LM_1_Filed __c
    * * SQL Data Type: bit
    */
    get MNEA_LM_1_Filed__c(): boolean | null {
        return this.Get('MNEA_LM_1_Filed__c');
    }
    set MNEA_LM_1_Filed__c(value: boolean | null) {
        this.Set('MNEA_LM_1_Filed__c', value);
    }

    /**
    * * Field Name: MSTA_LM_1_Filed__c
    * * Display Name: MSTA_LM_1_Filed __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get MSTA_LM_1_Filed__c(): string | null {
        return this.Get('MSTA_LM_1_Filed__c');
    }
    set MSTA_LM_1_Filed__c(value: string | null) {
        this.Set('MSTA_LM_1_Filed__c', value);
    }

    /**
    * * Field Name: Email_Opt_in_Events__c
    * * Display Name: Email _Opt _in _Events __c
    * * SQL Data Type: bit
    */
    get Email_Opt_in_Events__c(): boolean | null {
        return this.Get('Email_Opt_in_Events__c');
    }
    set Email_Opt_in_Events__c(value: boolean | null) {
        this.Set('Email_Opt_in_Events__c', value);
    }

    /**
    * * Field Name: Email_Opt_in_Action__c
    * * Display Name: Email _Opt _in _Action __c
    * * SQL Data Type: bit
    */
    get Email_Opt_in_Action__c(): boolean | null {
        return this.Get('Email_Opt_in_Action__c');
    }
    set Email_Opt_in_Action__c(value: boolean | null) {
        this.Set('Email_Opt_in_Action__c', value);
    }

    /**
    * * Field Name: Email_Opt_in_News__c
    * * Display Name: Email _Opt _in _News __c
    * * SQL Data Type: bit
    */
    get Email_Opt_in_News__c(): boolean | null {
        return this.Get('Email_Opt_in_News__c');
    }
    set Email_Opt_in_News__c(value: boolean | null) {
        this.Set('Email_Opt_in_News__c', value);
    }

    /**
    * * Field Name: Email_Opt_in_Leaders__c
    * * Display Name: Email _Opt _in _Leaders __c
    * * SQL Data Type: bit
    */
    get Email_Opt_in_Leaders__c(): boolean | null {
        return this.Get('Email_Opt_in_Leaders__c');
    }
    set Email_Opt_in_Leaders__c(value: boolean | null) {
        this.Set('Email_Opt_in_Leaders__c', value);
    }

    /**
    * * Field Name: Email_Opt_in_Partners__c
    * * Display Name: Email _Opt _in _Partners __c
    * * SQL Data Type: bit
    */
    get Email_Opt_in_Partners__c(): boolean | null {
        return this.Get('Email_Opt_in_Partners__c');
    }
    set Email_Opt_in_Partners__c(value: boolean | null) {
        this.Set('Email_Opt_in_Partners__c', value);
    }

    /**
    * * Field Name: CurrentFiscalYear__c
    * * Display Name: Current Fiscal Year __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get CurrentFiscalYear__c(): string | null {
        return this.Get('CurrentFiscalYear__c');
    }
    set CurrentFiscalYear__c(value: string | null) {
        this.Set('CurrentFiscalYear__c', value);
    }

    /**
    * * Field Name: InsuranceCoverageDates__c
    * * Display Name: Insurance Coverage Dates __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get InsuranceCoverageDates__c(): string | null {
        return this.Get('InsuranceCoverageDates__c');
    }
    set InsuranceCoverageDates__c(value: string | null) {
        this.Set('InsuranceCoverageDates__c', value);
    }

    /**
    * * Field Name: Membership_Year__c
    * * Display Name: Membership _Year __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Membership_Year__c(): string | null {
        return this.Get('Membership_Year__c');
    }
    set Membership_Year__c(value: string | null) {
        this.Set('Membership_Year__c', value);
    }

    /**
    * * Field Name: TodaysDate__c
    * * Display Name: Todays Date __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get TodaysDate__c(): string | null {
        return this.Get('TodaysDate__c');
    }
    set TodaysDate__c(value: string | null) {
        this.Set('TodaysDate__c', value);
    }

    /**
    * * Field Name: IsStudent__c
    * * Display Name: Is Student __c
    * * SQL Data Type: bit
    */
    get IsStudent__c(): boolean | null {
        return this.Get('IsStudent__c');
    }
    set IsStudent__c(value: boolean | null) {
        this.Set('IsStudent__c', value);
    }

    /**
    * * Field Name: PreferredAddress__c
    * * Display Name: Preferred Address __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get PreferredAddress__c(): string | null {
        return this.Get('PreferredAddress__c');
    }
    set PreferredAddress__c(value: string | null) {
        this.Set('PreferredAddress__c', value);
    }

    /**
    * * Field Name: ChMemberType__c
    * * Display Name: Ch Member Type __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get ChMemberType__c(): string | null {
        return this.Get('ChMemberType__c');
    }
    set ChMemberType__c(value: string | null) {
        this.Set('ChMemberType__c', value);
    }

    /**
    * * Field Name: Known_Bad_Home_Address__c
    * * Display Name: Known _Bad _Home _Address __c
    * * SQL Data Type: bit
    */
    get Known_Bad_Home_Address__c(): boolean | null {
        return this.Get('Known_Bad_Home_Address__c');
    }
    set Known_Bad_Home_Address__c(value: boolean | null) {
        this.Set('Known_Bad_Home_Address__c', value);
    }

    /**
    * * Field Name: CTA_Dues_Collection_Agreement__c
    * * Display Name: CTA_Dues _Collection _Agreement __c
    * * SQL Data Type: datetimeoffset
    */
    get CTA_Dues_Collection_Agreement__c(): Date | null {
        return this.Get('CTA_Dues_Collection_Agreement__c');
    }

    /**
    * * Field Name: ACH_Agreement_On_File__c
    * * Display Name: ACH_Agreement _On _File __c
    * * SQL Data Type: bit
    */
    get ACH_Agreement_On_File__c(): boolean | null {
        return this.Get('ACH_Agreement_On_File__c');
    }
    set ACH_Agreement_On_File__c(value: boolean | null) {
        this.Set('ACH_Agreement_On_File__c', value);
    }

    /**
    * * Field Name: MSTA_Collecting_CTA_Dues__c
    * * Display Name: MSTA_Collecting _CTA_Dues __c
    * * SQL Data Type: bit
    */
    get MSTA_Collecting_CTA_Dues__c(): boolean | null {
        return this.Get('MSTA_Collecting_CTA_Dues__c');
    }
    set MSTA_Collecting_CTA_Dues__c(value: boolean | null) {
        this.Set('MSTA_Collecting_CTA_Dues__c', value);
    }

    /**
    * * Field Name: Region_Abbreviation__c
    * * Display Name: Region _Abbreviation __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Region_Abbreviation__c(): string | null {
        return this.Get('Region_Abbreviation__c');
    }
    set Region_Abbreviation__c(value: string | null) {
        this.Set('Region_Abbreviation__c', value);
    }

    /**
    * * Field Name: Chapter_Dues__c
    * * Display Name: Chapter _Dues __c
    * * SQL Data Type: decimal(18, 2)
    */
    get Chapter_Dues__c(): number | null {
        return this.Get('Chapter_Dues__c');
    }
    set Chapter_Dues__c(value: number | null) {
        this.Set('Chapter_Dues__c', value);
    }

    /**
    * * Field Name: Recruited_By__c
    * * Display Name: Recruited _By __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Recruited_By__c(): string | null {
        return this.Get('Recruited_By__c');
    }
    set Recruited_By__c(value: string | null) {
        this.Set('Recruited_By__c', value);
    }

    /**
    * * Field Name: Duplicate_Key__c
    * * Display Name: Duplicate _Key __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Duplicate_Key__c(): string | null {
        return this.Get('Duplicate_Key__c');
    }
    set Duplicate_Key__c(value: string | null) {
        this.Set('Duplicate_Key__c', value);
    }

    /**
    * * Field Name: Position__c
    * * Display Name: Position __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Position__c(): string | null {
        return this.Get('Position__c');
    }
    set Position__c(value: string | null) {
        this.Set('Position__c', value);
    }

    /**
    * * Field Name: PSRS_Petition__c
    * * Display Name: PSRS_Petition __c
    * * SQL Data Type: bit
    */
    get PSRS_Petition__c(): boolean | null {
        return this.Get('PSRS_Petition__c');
    }
    set PSRS_Petition__c(value: boolean | null) {
        this.Set('PSRS_Petition__c', value);
    }

    /**
    * * Field Name: CTA_Dues_Amount_to_Display_on_Renewal__c
    * * Display Name: CTA_Dues _Amount _to _Display _on _Renewal __c
    * * SQL Data Type: decimal(18, 2)
    */
    get CTA_Dues_Amount_to_Display_on_Renewal__c(): number | null {
        return this.Get('CTA_Dues_Amount_to_Display_on_Renewal__c');
    }
    set CTA_Dues_Amount_to_Display_on_Renewal__c(value: number | null) {
        this.Set('CTA_Dues_Amount_to_Display_on_Renewal__c', value);
    }

    /**
    * * Field Name: Non_certified_CTA_Dues__c
    * * Display Name: Non _certified _CTA_Dues __c
    * * SQL Data Type: decimal(4, 2)
    */
    get Non_certified_CTA_Dues__c(): number | null {
        return this.Get('Non_certified_CTA_Dues__c');
    }
    set Non_certified_CTA_Dues__c(value: number | null) {
        this.Set('Non_certified_CTA_Dues__c', value);
    }

    /**
    * * Field Name: Collective_Bargaining_Agreement_Received__c
    * * Display Name: Collective _Bargaining _Agreement _Received __c
    * * SQL Data Type: datetimeoffset
    */
    get Collective_Bargaining_Agreement_Received__c(): Date | null {
        return this.Get('Collective_Bargaining_Agreement_Received__c');
    }

    /**
    * * Field Name: Collective_Bargaining_Agreement_Expires__c
    * * Display Name: Collective _Bargaining _Agreement _Expires __c
    * * SQL Data Type: datetimeoffset
    */
    get Collective_Bargaining_Agreement_Expires__c(): Date | null {
        return this.Get('Collective_Bargaining_Agreement_Expires__c');
    }

    /**
    * * Field Name: DESKSCMT__Desk_Company_Id__c
    * * Display Name: DESKSCMT__Desk _Company _Id __c
    * * SQL Data Type: decimal(18, 0)
    */
    get DESKSCMT__Desk_Company_Id__c(): number | null {
        return this.Get('DESKSCMT__Desk_Company_Id__c');
    }
    set DESKSCMT__Desk_Company_Id__c(value: number | null) {
        this.Set('DESKSCMT__Desk_Company_Id__c', value);
    }

    /**
    * * Field Name: P2A__Advocate_ID__c
    * * Display Name: P2A__Advocate _ID__c
    * * SQL Data Type: decimal(18, 0)
    */
    get P2A__Advocate_ID__c(): number | null {
        return this.Get('P2A__Advocate_ID__c');
    }
    set P2A__Advocate_ID__c(value: number | null) {
        this.Set('P2A__Advocate_ID__c', value);
    }

    /**
    * * Field Name: P2A__City_District__c
    * * Display Name: P2A__City _District __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get P2A__City_District__c(): string | null {
        return this.Get('P2A__City_District__c');
    }
    set P2A__City_District__c(value: string | null) {
        this.Set('P2A__City_District__c', value);
    }

    /**
    * * Field Name: P2A__County__c
    * * Display Name: P2A__County __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get P2A__County__c(): string | null {
        return this.Get('P2A__County__c');
    }
    set P2A__County__c(value: string | null) {
        this.Set('P2A__County__c', value);
    }

    /**
    * * Field Name: P2A__Federal_House_District__c
    * * Display Name: P2A__Federal _House _District __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get P2A__Federal_House_District__c(): string | null {
        return this.Get('P2A__Federal_House_District__c');
    }
    set P2A__Federal_House_District__c(value: string | null) {
        this.Set('P2A__Federal_House_District__c', value);
    }

    /**
    * * Field Name: P2A__State_House_District__c
    * * Display Name: P2A__State _House _District __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get P2A__State_House_District__c(): string | null {
        return this.Get('P2A__State_House_District__c');
    }
    set P2A__State_House_District__c(value: string | null) {
        this.Set('P2A__State_House_District__c', value);
    }

    /**
    * * Field Name: P2A__State_Senate_District__c
    * * Display Name: P2A__State _Senate _District __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get P2A__State_Senate_District__c(): string | null {
        return this.Get('P2A__State_Senate_District__c');
    }
    set P2A__State_Senate_District__c(value: string | null) {
        this.Set('P2A__State_Senate_District__c', value);
    }

    /**
    * * Field Name: P2A__Synced__c
    * * Display Name: P2A__Synced __c
    * * SQL Data Type: bit
    */
    get P2A__Synced__c(): boolean | null {
        return this.Get('P2A__Synced__c');
    }
    set P2A__Synced__c(value: boolean | null) {
        this.Set('P2A__Synced__c', value);
    }

    /**
    * * Field Name: DESKSCMT__Desk_Migrated_Account__c
    * * Display Name: DESKSCMT__Desk _Migrated _Account __c
    * * SQL Data Type: bit
    */
    get DESKSCMT__Desk_Migrated_Account__c(): boolean | null {
        return this.Get('DESKSCMT__Desk_Migrated_Account__c');
    }
    set DESKSCMT__Desk_Migrated_Account__c(value: boolean | null) {
        this.Set('DESKSCMT__Desk_Migrated_Account__c', value);
    }

    /**
    * * Field Name: Desk_Id__c
    * * Display Name: Desk _Id __c
    * * SQL Data Type: decimal(18, 0)
    */
    get Desk_Id__c(): number | null {
        return this.Get('Desk_Id__c');
    }
    set Desk_Id__c(value: number | null) {
        this.Set('Desk_Id__c', value);
    }

    /**
    * * Field Name: NU__IsMemberFlag__c
    * * Display Name: NU__Is Member Flag __c
    * * SQL Data Type: bit
    */
    get NU__IsMemberFlag__c(): boolean | null {
        return this.Get('NU__IsMemberFlag__c');
    }
    set NU__IsMemberFlag__c(value: boolean | null) {
        this.Set('NU__IsMemberFlag__c', value);
    }

    /**
    * * Field Name: Field_Rep_Number__c
    * * Display Name: Field _Rep _Number __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Field_Rep_Number__c(): string | null {
        return this.Get('Field_Rep_Number__c');
    }
    set Field_Rep_Number__c(value: string | null) {
        this.Set('Field_Rep_Number__c', value);
    }

    /**
    * * Field Name: No_DocuSign__c
    * * Display Name: No _Docu Sign __c
    * * SQL Data Type: bit
    */
    get No_DocuSign__c(): boolean | null {
        return this.Get('No_DocuSign__c');
    }
    set No_DocuSign__c(value: boolean | null) {
        this.Set('No_DocuSign__c', value);
    }

    /**
    * * Field Name: DocuSignCurrentBuilding__c
    * * Display Name: Docu Sign Current Building __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get DocuSignCurrentBuilding__c(): string | null {
        return this.Get('DocuSignCurrentBuilding__c');
    }
    set DocuSignCurrentBuilding__c(value: string | null) {
        this.Set('DocuSignCurrentBuilding__c', value);
    }

    /**
    * * Field Name: bg_Docusign_Job__c
    * * Display Name: bg _Docusign _Job __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get bg_Docusign_Job__c(): string | null {
        return this.Get('bg_Docusign_Job__c');
    }
    set bg_Docusign_Job__c(value: string | null) {
        this.Set('bg_Docusign_Job__c', value);
    }

    /**
    * * Field Name: envelope_event__c
    * * Display Name: envelope _event __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get envelope_event__c(): string | null {
        return this.Get('envelope_event__c');
    }
    set envelope_event__c(value: string | null) {
        this.Set('envelope_event__c', value);
    }

    /**
    * * Field Name: envelope_id__c
    * * Display Name: envelope _id __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get envelope_id__c(): string | null {
        return this.Get('envelope_id__c');
    }
    set envelope_id__c(value: string | null) {
        this.Set('envelope_id__c', value);
    }

    /**
    * * Field Name: envelope_resent_date_time__c
    * * Display Name: envelope _resent _date _time __c
    * * SQL Data Type: datetimeoffset
    */
    get envelope_resent_date_time__c(): Date | null {
        return this.Get('envelope_resent_date_time__c');
    }

    /**
    * * Field Name: envelope_sent_date_time__c
    * * Display Name: envelope _sent _date _time __c
    * * SQL Data Type: datetimeoffset
    */
    get envelope_sent_date_time__c(): Date | null {
        return this.Get('envelope_sent_date_time__c');
    }

    /**
    * * Field Name: envelope_status_retrieval_datetime__c
    * * Display Name: envelope _status _retrieval _datetime __c
    * * SQL Data Type: datetimeoffset
    */
    get envelope_status_retrieval_datetime__c(): Date | null {
        return this.Get('envelope_status_retrieval_datetime__c');
    }

    /**
    * * Field Name: envelope_status_value__c
    * * Display Name: envelope _status _value __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get envelope_status_value__c(): string | null {
        return this.Get('envelope_status_value__c');
    }
    set envelope_status_value__c(value: string | null) {
        this.Set('envelope_status_value__c', value);
    }

    /**
    * * Field Name: envelope_template_id__c
    * * Display Name: envelope _template _id __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get envelope_template_id__c(): string | null {
        return this.Get('envelope_template_id__c');
    }
    set envelope_template_id__c(value: string | null) {
        this.Set('envelope_template_id__c', value);
    }

    /**
    * * Field Name: Envelope_Email_Body__c
    * * Display Name: Envelope _Email _Body __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Envelope_Email_Body__c(): string | null {
        return this.Get('Envelope_Email_Body__c');
    }
    set Envelope_Email_Body__c(value: string | null) {
        this.Set('Envelope_Email_Body__c', value);
    }

    /**
    * * Field Name: Envelope_Email_Subject_Line__c
    * * Display Name: Envelope _Email _Subject _Line __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Envelope_Email_Subject_Line__c(): string | null {
        return this.Get('Envelope_Email_Subject_Line__c');
    }
    set Envelope_Email_Subject_Line__c(value: string | null) {
        this.Set('Envelope_Email_Subject_Line__c', value);
    }

    /**
    * * Field Name: Resigned__c
    * * Display Name: Resigned __c
    * * SQL Data Type: bit
    */
    get Resigned__c(): boolean | null {
        return this.Get('Resigned__c');
    }
    set Resigned__c(value: boolean | null) {
        this.Set('Resigned__c', value);
    }

    /**
    * * Field Name: Membership_Dues__c
    * * Display Name: Membership _Dues __c
    * * SQL Data Type: decimal(18, 2)
    */
    get Membership_Dues__c(): number | null {
        return this.Get('Membership_Dues__c');
    }
    set Membership_Dues__c(value: number | null) {
        this.Set('Membership_Dues__c', value);
    }

    /**
    * * Field Name: Reason_for_Resigning__c
    * * Display Name: Reason _for _Resigning __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Reason_for_Resigning__c(): string | null {
        return this.Get('Reason_for_Resigning__c');
    }
    set Reason_for_Resigning__c(value: string | null) {
        this.Set('Reason_for_Resigning__c', value);
    }

    /**
    * * Field Name: DocuSignEndDate__c
    * * Display Name: Docu Sign End Date __c
    * * SQL Data Type: datetimeoffset
    */
    get DocuSignEndDate__c(): Date | null {
        return this.Get('DocuSignEndDate__c');
    }

    /**
    * * Field Name: Paper_Renewals_Sent__c
    * * Display Name: Paper _Renewals _Sent __c
    * * SQL Data Type: datetimeoffset
    */
    get Paper_Renewals_Sent__c(): Date | null {
        return this.Get('Paper_Renewals_Sent__c');
    }

    /**
    * * Field Name: DocuSign_Completed_List_Sent__c
    * * Display Name: Docu Sign _Completed _List _Sent __c
    * * SQL Data Type: datetimeoffset
    */
    get DocuSign_Completed_List_Sent__c(): Date | null {
        return this.Get('DocuSign_Completed_List_Sent__c');
    }

    /**
    * * Field Name: Schedule__c
    * * Display Name: Schedule __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Schedule__c(): string | null {
        return this.Get('Schedule__c');
    }
    set Schedule__c(value: string | null) {
        this.Set('Schedule__c', value);
    }

    /**
    * * Field Name: Schedule_Type__c
    * * Display Name: Schedule _Type __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Schedule_Type__c(): string | null {
        return this.Get('Schedule_Type__c');
    }
    set Schedule_Type__c(value: string | null) {
        this.Set('Schedule_Type__c', value);
    }

    /**
    * * Field Name: Schedule_Stage__c
    * * Display Name: Schedule _Stage __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Schedule_Stage__c(): string | null {
        return this.Get('Schedule_Stage__c');
    }
    set Schedule_Stage__c(value: string | null) {
        this.Set('Schedule_Stage__c', value);
    }

    /**
    * * Field Name: Schedule_Start_Date__c
    * * Display Name: Schedule _Start _Date __c
    * * SQL Data Type: datetimeoffset
    */
    get Schedule_Start_Date__c(): Date | null {
        return this.Get('Schedule_Start_Date__c');
    }

    /**
    * * Field Name: Schedule_End_Date__c
    * * Display Name: Schedule _End _Date __c
    * * SQL Data Type: datetimeoffset
    */
    get Schedule_End_Date__c(): Date | null {
        return this.Get('Schedule_End_Date__c');
    }

    /**
    * * Field Name: DocuSign_Status__c
    * * Display Name: Docu Sign _Status __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get DocuSign_Status__c(): string | null {
        return this.Get('DocuSign_Status__c');
    }
    set DocuSign_Status__c(value: string | null) {
        this.Set('DocuSign_Status__c', value);
    }

    /**
    * * Field Name: Membership_Pending__c
    * * Display Name: Membership _Pending __c
    * * SQL Data Type: bit
    */
    get Membership_Pending__c(): boolean | null {
        return this.Get('Membership_Pending__c');
    }
    set Membership_Pending__c(value: boolean | null) {
        this.Set('Membership_Pending__c', value);
    }

    /**
    * * Field Name: CTA_Officers_Recorded__c
    * * Display Name: CTA_Officers _Recorded __c
    * * SQL Data Type: datetimeoffset
    */
    get CTA_Officers_Recorded__c(): Date | null {
        return this.Get('CTA_Officers_Recorded__c');
    }

    /**
    * * Field Name: Duplicate_Key_Fname_DOB_Zip_Addr__c
    * * Display Name: Duplicate _Key _Fname _DOB_Zip _Addr __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Duplicate_Key_Fname_DOB_Zip_Addr__c(): string | null {
        return this.Get('Duplicate_Key_Fname_DOB_Zip_Addr__c');
    }
    set Duplicate_Key_Fname_DOB_Zip_Addr__c(value: string | null) {
        this.Set('Duplicate_Key_Fname_DOB_Zip_Addr__c', value);
    }

    /**
    * * Field Name: Duplicate_Key_fname_DOB_Last4__c
    * * Display Name: Duplicate _Key _fname _DOB_Last 4__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Duplicate_Key_fname_DOB_Last4__c(): string | null {
        return this.Get('Duplicate_Key_fname_DOB_Last4__c');
    }
    set Duplicate_Key_fname_DOB_Last4__c(value: string | null) {
        this.Set('Duplicate_Key_fname_DOB_Last4__c', value);
    }

    /**
    * * Field Name: Duplicate_Key_fname_DOB_Last4_formula__c
    * * Display Name: Duplicate _Key _fname _DOB_Last 4_formula __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Duplicate_Key_fname_DOB_Last4_formula__c(): string | null {
        return this.Get('Duplicate_Key_fname_DOB_Last4_formula__c');
    }
    set Duplicate_Key_fname_DOB_Last4_formula__c(value: string | null) {
        this.Set('Duplicate_Key_fname_DOB_Last4_formula__c', value);
    }

    /**
    * * Field Name: Duplicate_Key_fname_DOB_Zip__c
    * * Display Name: Duplicate _Key _fname _DOB_Zip __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Duplicate_Key_fname_DOB_Zip__c(): string | null {
        return this.Get('Duplicate_Key_fname_DOB_Zip__c');
    }
    set Duplicate_Key_fname_DOB_Zip__c(value: string | null) {
        this.Set('Duplicate_Key_fname_DOB_Zip__c', value);
    }

    /**
    * * Field Name: Duplicate_Key_fname_DOB__c
    * * Display Name: Duplicate _Key _fname _DOB__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Duplicate_Key_fname_DOB__c(): string | null {
        return this.Get('Duplicate_Key_fname_DOB__c');
    }
    set Duplicate_Key_fname_DOB__c(value: string | null) {
        this.Set('Duplicate_Key_fname_DOB__c', value);
    }

    /**
    * * Field Name: Duplicate_Key_fname_Last4_Zip__c
    * * Display Name: Duplicate _Key _fname _Last 4_Zip __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Duplicate_Key_fname_Last4_Zip__c(): string | null {
        return this.Get('Duplicate_Key_fname_Last4_Zip__c');
    }
    set Duplicate_Key_fname_Last4_Zip__c(value: string | null) {
        this.Set('Duplicate_Key_fname_Last4_Zip__c', value);
    }

    /**
    * * Field Name: Duplicate_Key_fname_Last4__c
    * * Display Name: Duplicate _Key _fname _Last 4__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Duplicate_Key_fname_Last4__c(): string | null {
        return this.Get('Duplicate_Key_fname_Last4__c');
    }
    set Duplicate_Key_fname_Last4__c(value: string | null) {
        this.Set('Duplicate_Key_fname_Last4__c', value);
    }

    /**
    * * Field Name: Duplicate_Key_fname_temp__c
    * * Display Name: Duplicate _Key _fname _temp __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Duplicate_Key_fname_temp__c(): string | null {
        return this.Get('Duplicate_Key_fname_temp__c');
    }
    set Duplicate_Key_fname_temp__c(value: string | null) {
        this.Set('Duplicate_Key_fname_temp__c', value);
    }

    /**
    * * Field Name: Resolve_Concurrent_Membership_B4_Merging__c
    * * Display Name: Resolve _Concurrent _Membership _B4_Merging __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Resolve_Concurrent_Membership_B4_Merging__c(): string | null {
        return this.Get('Resolve_Concurrent_Membership_B4_Merging__c');
    }
    set Resolve_Concurrent_Membership_B4_Merging__c(value: string | null) {
        this.Set('Resolve_Concurrent_Membership_B4_Merging__c', value);
    }

    /**
    * * Field Name: fname__c
    * * Display Name: fname __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get fname__c(): string | null {
        return this.Get('fname__c');
    }
    set fname__c(value: string | null) {
        this.Set('fname__c', value);
    }

    /**
    * * Field Name: is_master_Fname_DOB_Last4SSN__c
    * * Display Name: is _master _Fname _DOB_Last 4SSN__c
    * * SQL Data Type: bit
    */
    get is_master_Fname_DOB_Last4SSN__c(): boolean | null {
        return this.Get('is_master_Fname_DOB_Last4SSN__c');
    }
    set is_master_Fname_DOB_Last4SSN__c(value: boolean | null) {
        this.Set('is_master_Fname_DOB_Last4SSN__c', value);
    }

    /**
    * * Field Name: is_master_Fname_DOB_Zip_AddrOrPhone__c
    * * Display Name: is _master _Fname _DOB_Zip _Addr Or Phone __c
    * * SQL Data Type: bit
    */
    get is_master_Fname_DOB_Zip_AddrOrPhone__c(): boolean | null {
        return this.Get('is_master_Fname_DOB_Zip_AddrOrPhone__c');
    }
    set is_master_Fname_DOB_Zip_AddrOrPhone__c(value: boolean | null) {
        this.Set('is_master_Fname_DOB_Zip_AddrOrPhone__c', value);
    }

    /**
    * * Field Name: is_master_Fname_DOB_Zip_Addr__c
    * * Display Name: is _master _Fname _DOB_Zip _Addr __c
    * * SQL Data Type: bit
    */
    get is_master_Fname_DOB_Zip_Addr__c(): boolean | null {
        return this.Get('is_master_Fname_DOB_Zip_Addr__c');
    }
    set is_master_Fname_DOB_Zip_Addr__c(value: boolean | null) {
        this.Set('is_master_Fname_DOB_Zip_Addr__c', value);
    }

    /**
    * * Field Name: is_master_Fname_DOB_Zip__c
    * * Display Name: is _master _Fname _DOB_Zip __c
    * * SQL Data Type: bit
    */
    get is_master_Fname_DOB_Zip__c(): boolean | null {
        return this.Get('is_master_Fname_DOB_Zip__c');
    }
    set is_master_Fname_DOB_Zip__c(value: boolean | null) {
        this.Set('is_master_Fname_DOB_Zip__c', value);
    }

    /**
    * * Field Name: is_master_Fname_Last4SSN_Zip__c
    * * Display Name: is _master _Fname _Last 4SSN_Zip __c
    * * SQL Data Type: bit
    */
    get is_master_Fname_Last4SSN_Zip__c(): boolean | null {
        return this.Get('is_master_Fname_Last4SSN_Zip__c');
    }
    set is_master_Fname_Last4SSN_Zip__c(value: boolean | null) {
        this.Set('is_master_Fname_Last4SSN_Zip__c', value);
    }

    /**
    * * Field Name: masterID_ref_fname_DOB_Last4__c
    * * Display Name: master ID_ref _fname _DOB_Last 4__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get masterID_ref_fname_DOB_Last4__c(): string | null {
        return this.Get('masterID_ref_fname_DOB_Last4__c');
    }
    set masterID_ref_fname_DOB_Last4__c(value: string | null) {
        this.Set('masterID_ref_fname_DOB_Last4__c', value);
    }

    /**
    * * Field Name: masterID_ref_fname_DOB_Zip_AddrOrPhone__c
    * * Display Name: master ID_ref _fname _DOB_Zip _Addr Or Phone __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get masterID_ref_fname_DOB_Zip_AddrOrPhone__c(): string | null {
        return this.Get('masterID_ref_fname_DOB_Zip_AddrOrPhone__c');
    }
    set masterID_ref_fname_DOB_Zip_AddrOrPhone__c(value: string | null) {
        this.Set('masterID_ref_fname_DOB_Zip_AddrOrPhone__c', value);
    }

    /**
    * * Field Name: masterID_ref_fname_DOB_Zip_Addr__c
    * * Display Name: master ID_ref _fname _DOB_Zip _Addr __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get masterID_ref_fname_DOB_Zip_Addr__c(): string | null {
        return this.Get('masterID_ref_fname_DOB_Zip_Addr__c');
    }
    set masterID_ref_fname_DOB_Zip_Addr__c(value: string | null) {
        this.Set('masterID_ref_fname_DOB_Zip_Addr__c', value);
    }

    /**
    * * Field Name: masterID_ref_fname_DOB_Zip__c
    * * Display Name: master ID_ref _fname _DOB_Zip __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get masterID_ref_fname_DOB_Zip__c(): string | null {
        return this.Get('masterID_ref_fname_DOB_Zip__c');
    }
    set masterID_ref_fname_DOB_Zip__c(value: string | null) {
        this.Set('masterID_ref_fname_DOB_Zip__c', value);
    }

    /**
    * * Field Name: masterID_ref_fname_Last4_Zip__c
    * * Display Name: master ID_ref _fname _Last 4_Zip __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get masterID_ref_fname_Last4_Zip__c(): string | null {
        return this.Get('masterID_ref_fname_Last4_Zip__c');
    }
    set masterID_ref_fname_Last4_Zip__c(value: string | null) {
        this.Set('masterID_ref_fname_Last4_Zip__c', value);
    }

    /**
    * * Field Name: matching_key_Fname_DOB_Last4SSN__c
    * * Display Name: matching _key _Fname _DOB_Last 4SSN__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get matching_key_Fname_DOB_Last4SSN__c(): string | null {
        return this.Get('matching_key_Fname_DOB_Last4SSN__c');
    }
    set matching_key_Fname_DOB_Last4SSN__c(value: string | null) {
        this.Set('matching_key_Fname_DOB_Last4SSN__c', value);
    }

    /**
    * * Field Name: matching_key_Fname_DOB_Zip__c
    * * Display Name: matching _key _Fname _DOB_Zip __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get matching_key_Fname_DOB_Zip__c(): string | null {
        return this.Get('matching_key_Fname_DOB_Zip__c');
    }
    set matching_key_Fname_DOB_Zip__c(value: string | null) {
        this.Set('matching_key_Fname_DOB_Zip__c', value);
    }

    /**
    * * Field Name: matching_key_Fname_Last4SSN_Zip__c
    * * Display Name: matching _key _Fname _Last 4SSN_Zip __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get matching_key_Fname_Last4SSN_Zip__c(): string | null {
        return this.Get('matching_key_Fname_Last4SSN_Zip__c');
    }
    set matching_key_Fname_Last4SSN_Zip__c(value: string | null) {
        this.Set('matching_key_Fname_Last4SSN_Zip__c', value);
    }

    /**
    * * Field Name: Number_of_Payroll_Payments__c
    * * Display Name: Number _of _Payroll _Payments __c
    * * SQL Data Type: decimal(2, 0)
    */
    get Number_of_Payroll_Payments__c(): number | null {
        return this.Get('Number_of_Payroll_Payments__c');
    }
    set Number_of_Payroll_Payments__c(value: number | null) {
        this.Set('Number_of_Payroll_Payments__c', value);
    }

    /**
    * * Field Name: New_Building_from_DocuSign__c
    * * Display Name: New _Building _from _Docu Sign __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get New_Building_from_DocuSign__c(): string | null {
        return this.Get('New_Building_from_DocuSign__c');
    }
    set New_Building_from_DocuSign__c(value: string | null) {
        this.Set('New_Building_from_DocuSign__c', value);
    }

    /**
    * * Field Name: qtr1_cta_dues_processed__c
    * * Display Name: qtr 1_cta _dues _processed __c
    * * SQL Data Type: bit
    */
    get qtr1_cta_dues_processed__c(): boolean | null {
        return this.Get('qtr1_cta_dues_processed__c');
    }
    set qtr1_cta_dues_processed__c(value: boolean | null) {
        this.Set('qtr1_cta_dues_processed__c', value);
    }

    /**
    * * Field Name: qtr1_dues_pending_pmnt_to_institution__c
    * * Display Name: qtr 1_dues _pending _pmnt _to _institution __c
    * * SQL Data Type: decimal(18, 2)
    */
    get qtr1_dues_pending_pmnt_to_institution__c(): number | null {
        return this.Get('qtr1_dues_pending_pmnt_to_institution__c');
    }
    set qtr1_dues_pending_pmnt_to_institution__c(value: number | null) {
        this.Set('qtr1_dues_pending_pmnt_to_institution__c', value);
    }

    /**
    * * Field Name: qtr1_dues_processed_pmnt_to_institution__c
    * * Display Name: qtr 1_dues _processed _pmnt _to _institution __c
    * * SQL Data Type: decimal(18, 2)
    */
    get qtr1_dues_processed_pmnt_to_institution__c(): number | null {
        return this.Get('qtr1_dues_processed_pmnt_to_institution__c');
    }
    set qtr1_dues_processed_pmnt_to_institution__c(value: number | null) {
        this.Set('qtr1_dues_processed_pmnt_to_institution__c', value);
    }

    /**
    * * Field Name: qtr1_new_dues_to_pay_to_institution__c
    * * Display Name: qtr 1_new _dues _to _pay _to _institution __c
    * * SQL Data Type: decimal(18, 2)
    */
    get qtr1_new_dues_to_pay_to_institution__c(): number | null {
        return this.Get('qtr1_new_dues_to_pay_to_institution__c');
    }
    set qtr1_new_dues_to_pay_to_institution__c(value: number | null) {
        this.Set('qtr1_new_dues_to_pay_to_institution__c', value);
    }

    /**
    * * Field Name: qtr2_cta_dues_processed__c
    * * Display Name: qtr 2_cta _dues _processed __c
    * * SQL Data Type: bit
    */
    get qtr2_cta_dues_processed__c(): boolean | null {
        return this.Get('qtr2_cta_dues_processed__c');
    }
    set qtr2_cta_dues_processed__c(value: boolean | null) {
        this.Set('qtr2_cta_dues_processed__c', value);
    }

    /**
    * * Field Name: qtr2_dues_pending_pmnt_to_institution__c
    * * Display Name: qtr 2_dues _pending _pmnt _to _institution __c
    * * SQL Data Type: decimal(18, 2)
    */
    get qtr2_dues_pending_pmnt_to_institution__c(): number | null {
        return this.Get('qtr2_dues_pending_pmnt_to_institution__c');
    }
    set qtr2_dues_pending_pmnt_to_institution__c(value: number | null) {
        this.Set('qtr2_dues_pending_pmnt_to_institution__c', value);
    }

    /**
    * * Field Name: qtr2_dues_processed_pmnt_to_institution__c
    * * Display Name: qtr 2_dues _processed _pmnt _to _institution __c
    * * SQL Data Type: decimal(18, 2)
    */
    get qtr2_dues_processed_pmnt_to_institution__c(): number | null {
        return this.Get('qtr2_dues_processed_pmnt_to_institution__c');
    }
    set qtr2_dues_processed_pmnt_to_institution__c(value: number | null) {
        this.Set('qtr2_dues_processed_pmnt_to_institution__c', value);
    }

    /**
    * * Field Name: qtr2_new_dues_to_pay_to_institution__c
    * * Display Name: qtr 2_new _dues _to _pay _to _institution __c
    * * SQL Data Type: decimal(18, 2)
    */
    get qtr2_new_dues_to_pay_to_institution__c(): number | null {
        return this.Get('qtr2_new_dues_to_pay_to_institution__c');
    }
    set qtr2_new_dues_to_pay_to_institution__c(value: number | null) {
        this.Set('qtr2_new_dues_to_pay_to_institution__c', value);
    }

    /**
    * * Field Name: qtr3_cta_dues_processed__c
    * * Display Name: qtr 3_cta _dues _processed __c
    * * SQL Data Type: bit
    */
    get qtr3_cta_dues_processed__c(): boolean | null {
        return this.Get('qtr3_cta_dues_processed__c');
    }
    set qtr3_cta_dues_processed__c(value: boolean | null) {
        this.Set('qtr3_cta_dues_processed__c', value);
    }

    /**
    * * Field Name: qtr3_dues_pending_pmnt_to_institution__c
    * * Display Name: qtr 3_dues _pending _pmnt _to _institution __c
    * * SQL Data Type: decimal(18, 2)
    */
    get qtr3_dues_pending_pmnt_to_institution__c(): number | null {
        return this.Get('qtr3_dues_pending_pmnt_to_institution__c');
    }
    set qtr3_dues_pending_pmnt_to_institution__c(value: number | null) {
        this.Set('qtr3_dues_pending_pmnt_to_institution__c', value);
    }

    /**
    * * Field Name: qtr3_dues_processed_pmnt_to_institution__c
    * * Display Name: qtr 3_dues _processed _pmnt _to _institution __c
    * * SQL Data Type: decimal(18, 2)
    */
    get qtr3_dues_processed_pmnt_to_institution__c(): number | null {
        return this.Get('qtr3_dues_processed_pmnt_to_institution__c');
    }
    set qtr3_dues_processed_pmnt_to_institution__c(value: number | null) {
        this.Set('qtr3_dues_processed_pmnt_to_institution__c', value);
    }

    /**
    * * Field Name: qtr3_new_dues_to_pay_to_institution__c
    * * Display Name: qtr 3_new _dues _to _pay _to _institution __c
    * * SQL Data Type: decimal(18, 2)
    */
    get qtr3_new_dues_to_pay_to_institution__c(): number | null {
        return this.Get('qtr3_new_dues_to_pay_to_institution__c');
    }
    set qtr3_new_dues_to_pay_to_institution__c(value: number | null) {
        this.Set('qtr3_new_dues_to_pay_to_institution__c', value);
    }

    /**
    * * Field Name: qtr4_cta_dues_processed__c
    * * Display Name: qtr 4_cta _dues _processed __c
    * * SQL Data Type: bit
    */
    get qtr4_cta_dues_processed__c(): boolean | null {
        return this.Get('qtr4_cta_dues_processed__c');
    }
    set qtr4_cta_dues_processed__c(value: boolean | null) {
        this.Set('qtr4_cta_dues_processed__c', value);
    }

    /**
    * * Field Name: qtr4_dues_pending_pmnt_to_institution__c
    * * Display Name: qtr 4_dues _pending _pmnt _to _institution __c
    * * SQL Data Type: decimal(18, 2)
    */
    get qtr4_dues_pending_pmnt_to_institution__c(): number | null {
        return this.Get('qtr4_dues_pending_pmnt_to_institution__c');
    }
    set qtr4_dues_pending_pmnt_to_institution__c(value: number | null) {
        this.Set('qtr4_dues_pending_pmnt_to_institution__c', value);
    }

    /**
    * * Field Name: qtr4_dues_processed_pmnt_to_institution__c
    * * Display Name: qtr 4_dues _processed _pmnt _to _institution __c
    * * SQL Data Type: decimal(18, 2)
    */
    get qtr4_dues_processed_pmnt_to_institution__c(): number | null {
        return this.Get('qtr4_dues_processed_pmnt_to_institution__c');
    }
    set qtr4_dues_processed_pmnt_to_institution__c(value: number | null) {
        this.Set('qtr4_dues_processed_pmnt_to_institution__c', value);
    }

    /**
    * * Field Name: qtr4_new_dues_to_pay_to_institution__c
    * * Display Name: qtr 4_new _dues _to _pay _to _institution __c
    * * SQL Data Type: decimal(18, 2)
    */
    get qtr4_new_dues_to_pay_to_institution__c(): number | null {
        return this.Get('qtr4_new_dues_to_pay_to_institution__c');
    }
    set qtr4_new_dues_to_pay_to_institution__c(value: number | null) {
        this.Set('qtr4_new_dues_to_pay_to_institution__c', value);
    }

    /**
    * * Field Name: txs_dues_pending_pmnt_to_institution__c
    * * Display Name: txs _dues _pending _pmnt _to _institution __c
    * * SQL Data Type: decimal(18, 2)
    */
    get txs_dues_pending_pmnt_to_institution__c(): number | null {
        return this.Get('txs_dues_pending_pmnt_to_institution__c');
    }
    set txs_dues_pending_pmnt_to_institution__c(value: number | null) {
        this.Set('txs_dues_pending_pmnt_to_institution__c', value);
    }

    /**
    * * Field Name: txs_dues_processed_pmnt_to_institution__c
    * * Display Name: txs _dues _processed _pmnt _to _institution __c
    * * SQL Data Type: decimal(18, 2)
    */
    get txs_dues_processed_pmnt_to_institution__c(): number | null {
        return this.Get('txs_dues_processed_pmnt_to_institution__c');
    }
    set txs_dues_processed_pmnt_to_institution__c(value: number | null) {
        this.Set('txs_dues_processed_pmnt_to_institution__c', value);
    }

    /**
    * * Field Name: DocuSign_Entered_CTA_Dues__c
    * * Display Name: Docu Sign _Entered _CTA_Dues __c
    * * SQL Data Type: decimal(7, 2)
    */
    get DocuSign_Entered_CTA_Dues__c(): number | null {
        return this.Get('DocuSign_Entered_CTA_Dues__c');
    }
    set DocuSign_Entered_CTA_Dues__c(value: number | null) {
        this.Set('DocuSign_Entered_CTA_Dues__c', value);
    }

    /**
    * * Field Name: Highest_Level_of_Education__c
    * * Display Name: Highest _Level _of _Education __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Highest_Level_of_Education__c(): string | null {
        return this.Get('Highest_Level_of_Education__c');
    }
    set Highest_Level_of_Education__c(value: string | null) {
        this.Set('Highest_Level_of_Education__c', value);
    }

    /**
    * * Field Name: Anticipated_Retirement_Year__c
    * * Display Name: Anticipated _Retirement _Year __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Anticipated_Retirement_Year__c(): string | null {
        return this.Get('Anticipated_Retirement_Year__c');
    }
    set Anticipated_Retirement_Year__c(value: string | null) {
        this.Set('Anticipated_Retirement_Year__c', value);
    }

    /**
    * * Field Name: Associate_Job_Category__c
    * * Display Name: Associate _Job _Category __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Associate_Job_Category__c(): string | null {
        return this.Get('Associate_Job_Category__c');
    }
    set Associate_Job_Category__c(value: string | null) {
        this.Set('Associate_Job_Category__c', value);
    }

    /**
    * * Field Name: Billing_Address_Override__c
    * * Display Name: Billing _Address _Override __c
    * * SQL Data Type: bit
    */
    get Billing_Address_Override__c(): boolean | null {
        return this.Get('Billing_Address_Override__c');
    }
    set Billing_Address_Override__c(value: boolean | null) {
        this.Set('Billing_Address_Override__c', value);
    }

    /**
    * * Field Name: Mailing_Address_Override__c
    * * Display Name: Mailing _Address _Override __c
    * * SQL Data Type: bit
    */
    get Mailing_Address_Override__c(): boolean | null {
        return this.Get('Mailing_Address_Override__c');
    }
    set Mailing_Address_Override__c(value: boolean | null) {
        this.Set('Mailing_Address_Override__c', value);
    }

    /**
    * * Field Name: Exempt_from_Book_Studies__c
    * * Display Name: Exempt _from _Book _Studies __c
    * * SQL Data Type: bit
    */
    get Exempt_from_Book_Studies__c(): boolean | null {
        return this.Get('Exempt_from_Book_Studies__c');
    }
    set Exempt_from_Book_Studies__c(value: boolean | null) {
        this.Set('Exempt_from_Book_Studies__c', value);
    }

    /**
    * * Field Name: Dues_Balance__c
    * * Display Name: Dues _Balance __c
    * * SQL Data Type: decimal(18, 2)
    */
    get Dues_Balance__c(): number | null {
        return this.Get('Dues_Balance__c');
    }
    set Dues_Balance__c(value: number | null) {
        this.Set('Dues_Balance__c', value);
    }

    /**
    * * Field Name: Paying_CTA_Dues_Thru_MSTA__c
    * * Display Name: Paying _CTA_Dues _Thru _MSTA__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Paying_CTA_Dues_Thru_MSTA__c(): string | null {
        return this.Get('Paying_CTA_Dues_Thru_MSTA__c');
    }
    set Paying_CTA_Dues_Thru_MSTA__c(value: string | null) {
        this.Set('Paying_CTA_Dues_Thru_MSTA__c', value);
    }

    /**
    * * Field Name: Simple_Pay_Type__c
    * * Display Name: Simple _Pay _Type __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Simple_Pay_Type__c(): string | null {
        return this.Get('Simple_Pay_Type__c');
    }
    set Simple_Pay_Type__c(value: string | null) {
        this.Set('Simple_Pay_Type__c', value);
    }

    /**
    * * Field Name: ConsentItem__c
    * * Display Name: Consent Item __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get ConsentItem__c(): string | null {
        return this.Get('ConsentItem__c');
    }
    set ConsentItem__c(value: string | null) {
        this.Set('ConsentItem__c', value);
    }

    /**
    * * Field Name: UltimateId__c
    * * Display Name: Ultimate Id __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get UltimateId__c(): string | null {
        return this.Get('UltimateId__c');
    }
    set UltimateId__c(value: string | null) {
        this.Set('UltimateId__c', value);
    }

    /**
    * * Field Name: AllowPayroll__c
    * * Display Name: Allow Payroll __c
    * * SQL Data Type: bit
    */
    get AllowPayroll__c(): boolean | null {
        return this.Get('AllowPayroll__c');
    }
    set AllowPayroll__c(value: boolean | null) {
        this.Set('AllowPayroll__c', value);
    }

    /**
    * * Field Name: Number_of_Payroll_Deductions__c
    * * Display Name: Number _of _Payroll _Deductions __c
    * * SQL Data Type: decimal(2, 0)
    */
    get Number_of_Payroll_Deductions__c(): number | null {
        return this.Get('Number_of_Payroll_Deductions__c');
    }
    set Number_of_Payroll_Deductions__c(value: number | null) {
        this.Set('Number_of_Payroll_Deductions__c', value);
    }

    /**
    * * Field Name: Home_Phone_Type__c
    * * Display Name: Home _Phone _Type __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Home_Phone_Type__c(): string | null {
        return this.Get('Home_Phone_Type__c');
    }
    set Home_Phone_Type__c(value: string | null) {
        this.Set('Home_Phone_Type__c', value);
    }

    /**
    * * Field Name: Mobile_Type__c
    * * Display Name: Mobile _Type __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Mobile_Type__c(): string | null {
        return this.Get('Mobile_Type__c');
    }
    set Mobile_Type__c(value: string | null) {
        this.Set('Mobile_Type__c', value);
    }

    /**
    * * Field Name: namz__AssignmentRule__c
    * * Display Name: namz __Assignment Rule __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get namz__AssignmentRule__c(): string | null {
        return this.Get('namz__AssignmentRule__c');
    }
    set namz__AssignmentRule__c(value: string | null) {
        this.Set('namz__AssignmentRule__c', value);
    }

    /**
    * * Field Name: namz__PrimaryAffiliation__c
    * * Display Name: namz __Primary Affiliation __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get namz__PrimaryAffiliation__c(): string | null {
        return this.Get('namz__PrimaryAffiliation__c');
    }
    set namz__PrimaryAffiliation__c(value: string | null) {
        this.Set('namz__PrimaryAffiliation__c', value);
    }

    /**
    * * Field Name: Known_Bad_Home_Phone__c
    * * Display Name: Known _Bad _Home _Phone __c
    * * SQL Data Type: bit
    */
    get Known_Bad_Home_Phone__c(): boolean | null {
        return this.Get('Known_Bad_Home_Phone__c');
    }
    set Known_Bad_Home_Phone__c(value: boolean | null) {
        this.Set('Known_Bad_Home_Phone__c', value);
    }

    /**
    * * Field Name: Known_Bad_Mobile__c
    * * Display Name: Known _Bad _Mobile __c
    * * SQL Data Type: bit
    */
    get Known_Bad_Mobile__c(): boolean | null {
        return this.Get('Known_Bad_Mobile__c');
    }
    set Known_Bad_Mobile__c(value: boolean | null) {
        this.Set('Known_Bad_Mobile__c', value);
    }

    /**
    * * Field Name: Home_Phone_Verified__c
    * * Display Name: Home _Phone _Verified __c
    * * SQL Data Type: datetimeoffset
    */
    get Home_Phone_Verified__c(): Date | null {
        return this.Get('Home_Phone_Verified__c');
    }

    /**
    * * Field Name: Mobile_Phone_Verified__c
    * * Display Name: Mobile _Phone _Verified __c
    * * SQL Data Type: datetimeoffset
    */
    get Mobile_Phone_Verified__c(): Date | null {
        return this.Get('Mobile_Phone_Verified__c');
    }

    /**
    * * Field Name: NU__ExcludeFromAffiliationSearch__c
    * * Display Name: NU__Exclude From Affiliation Search __c
    * * SQL Data Type: bit
    */
    get NU__ExcludeFromAffiliationSearch__c(): boolean | null {
        return this.Get('NU__ExcludeFromAffiliationSearch__c');
    }
    set NU__ExcludeFromAffiliationSearch__c(value: boolean | null) {
        this.Set('NU__ExcludeFromAffiliationSearch__c', value);
    }

    /**
    * * Field Name: Home_Phone_Is_Valid__c
    * * Display Name: Home _Phone _Is _Valid __c
    * * SQL Data Type: bit
    */
    get Home_Phone_Is_Valid__c(): boolean | null {
        return this.Get('Home_Phone_Is_Valid__c');
    }
    set Home_Phone_Is_Valid__c(value: boolean | null) {
        this.Set('Home_Phone_Is_Valid__c', value);
    }

    /**
    * * Field Name: Mobile_Is_Valid__c
    * * Display Name: Mobile _Is _Valid __c
    * * SQL Data Type: bit
    */
    get Mobile_Is_Valid__c(): boolean | null {
        return this.Get('Mobile_Is_Valid__c');
    }
    set Mobile_Is_Valid__c(value: boolean | null) {
        this.Set('Mobile_Is_Valid__c', value);
    }

    /**
    * * Field Name: HomePhoneVerifiedCurrFiscal__c
    * * Display Name: Home Phone Verified Curr Fiscal __c
    * * SQL Data Type: bit
    */
    get HomePhoneVerifiedCurrFiscal__c(): boolean | null {
        return this.Get('HomePhoneVerifiedCurrFiscal__c');
    }
    set HomePhoneVerifiedCurrFiscal__c(value: boolean | null) {
        this.Set('HomePhoneVerifiedCurrFiscal__c', value);
    }

    /**
    * * Field Name: MobileVerifiedCurrFiscal__c
    * * Display Name: Mobile Verified Curr Fiscal __c
    * * SQL Data Type: bit
    */
    get MobileVerifiedCurrFiscal__c(): boolean | null {
        return this.Get('MobileVerifiedCurrFiscal__c');
    }
    set MobileVerifiedCurrFiscal__c(value: boolean | null) {
        this.Set('MobileVerifiedCurrFiscal__c', value);
    }

    /**
    * * Field Name: NU__ExternalID__pc
    * * Display Name: NU__External ID__pc
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__ExternalID__pc(): string | null {
        return this.Get('NU__ExternalID__pc');
    }
    set NU__ExternalID__pc(value: string | null) {
        this.Set('NU__ExternalID__pc', value);
    }

    /**
    * * Field Name: ET_Field_Rep__pc
    * * Display Name: ET_Field _Rep __pc
    * * SQL Data Type: nvarchar(MAX)
    */
    get ET_Field_Rep__pc(): string | null {
        return this.Get('ET_Field_Rep__pc');
    }
    set ET_Field_Rep__pc(value: string | null) {
        this.Set('ET_Field_Rep__pc', value);
    }

    /**
    * * Field Name: Deskcom__twitter_username__pc
    * * Display Name: Deskcom __twitter _username __pc
    * * SQL Data Type: nvarchar(MAX)
    */
    get Deskcom__twitter_username__pc(): string | null {
        return this.Get('Deskcom__twitter_username__pc');
    }
    set Deskcom__twitter_username__pc(value: string | null) {
        this.Set('Deskcom__twitter_username__pc', value);
    }

    /**
    * * Field Name: e4sf__Engage_Address_City__pc
    * * Display Name: e 4sf __Engage _Address _City __pc
    * * SQL Data Type: nvarchar(MAX)
    */
    get e4sf__Engage_Address_City__pc(): string | null {
        return this.Get('e4sf__Engage_Address_City__pc');
    }
    set e4sf__Engage_Address_City__pc(value: string | null) {
        this.Set('e4sf__Engage_Address_City__pc', value);
    }

    /**
    * * Field Name: e4sf__Engage_Address_Country__pc
    * * Display Name: e 4sf __Engage _Address _Country __pc
    * * SQL Data Type: nvarchar(MAX)
    */
    get e4sf__Engage_Address_Country__pc(): string | null {
        return this.Get('e4sf__Engage_Address_Country__pc');
    }
    set e4sf__Engage_Address_Country__pc(value: string | null) {
        this.Set('e4sf__Engage_Address_Country__pc', value);
    }

    /**
    * * Field Name: e4sf__Engage_Address_PostalCode__pc
    * * Display Name: e 4sf __Engage _Address _Postal Code __pc
    * * SQL Data Type: nvarchar(MAX)
    */
    get e4sf__Engage_Address_PostalCode__pc(): string | null {
        return this.Get('e4sf__Engage_Address_PostalCode__pc');
    }
    set e4sf__Engage_Address_PostalCode__pc(value: string | null) {
        this.Set('e4sf__Engage_Address_PostalCode__pc', value);
    }

    /**
    * * Field Name: e4sf__Engage_Address_State__pc
    * * Display Name: e 4sf __Engage _Address _State __pc
    * * SQL Data Type: nvarchar(MAX)
    */
    get e4sf__Engage_Address_State__pc(): string | null {
        return this.Get('e4sf__Engage_Address_State__pc');
    }
    set e4sf__Engage_Address_State__pc(value: string | null) {
        this.Set('e4sf__Engage_Address_State__pc', value);
    }

    /**
    * * Field Name: e4sf__Engage_Address_Street__pc
    * * Display Name: e 4sf __Engage _Address _Street __pc
    * * SQL Data Type: nvarchar(MAX)
    */
    get e4sf__Engage_Address_Street__pc(): string | null {
        return this.Get('e4sf__Engage_Address_Street__pc');
    }
    set e4sf__Engage_Address_Street__pc(value: string | null) {
        this.Set('e4sf__Engage_Address_Street__pc', value);
    }

    /**
    * * Field Name: e4sf__Engage_Batch_Id__pc
    * * Display Name: e 4sf __Engage _Batch _Id __pc
    * * SQL Data Type: nvarchar(MAX)
    */
    get e4sf__Engage_Batch_Id__pc(): string | null {
        return this.Get('e4sf__Engage_Batch_Id__pc');
    }
    set e4sf__Engage_Batch_Id__pc(value: string | null) {
        this.Set('e4sf__Engage_Batch_Id__pc', value);
    }

    /**
    * * Field Name: e4sf__Engage_Date_Last_Sync__pc
    * * Display Name: e 4sf __Engage _Date _Last _Sync __pc
    * * SQL Data Type: datetimeoffset
    */
    get e4sf__Engage_Date_Last_Sync__pc(): Date | null {
        return this.Get('e4sf__Engage_Date_Last_Sync__pc');
    }

    /**
    * * Field Name: e4sf__Engage_Ext_Id__pc
    * * Display Name: e 4sf __Engage _Ext _Id __pc
    * * SQL Data Type: nvarchar(MAX)
    */
    get e4sf__Engage_Ext_Id__pc(): string | null {
        return this.Get('e4sf__Engage_Ext_Id__pc');
    }
    set e4sf__Engage_Ext_Id__pc(value: string | null) {
        this.Set('e4sf__Engage_Ext_Id__pc', value);
    }

    /**
    * * Field Name: e4sf__Engage_Federal_District_Lower_Chamber__pc
    * * Display Name: e 4sf __Engage _Federal _District _Lower _Chamber __pc
    * * SQL Data Type: nvarchar(MAX)
    */
    get e4sf__Engage_Federal_District_Lower_Chamber__pc(): string | null {
        return this.Get('e4sf__Engage_Federal_District_Lower_Chamber__pc');
    }
    set e4sf__Engage_Federal_District_Lower_Chamber__pc(value: string | null) {
        this.Set('e4sf__Engage_Federal_District_Lower_Chamber__pc', value);
    }

    /**
    * * Field Name: e4sf__Engage_Federal_District_Upper_Chamber__pc
    * * Display Name: e 4sf __Engage _Federal _District _Upper _Chamber __pc
    * * SQL Data Type: nvarchar(MAX)
    */
    get e4sf__Engage_Federal_District_Upper_Chamber__pc(): string | null {
        return this.Get('e4sf__Engage_Federal_District_Upper_Chamber__pc');
    }
    set e4sf__Engage_Federal_District_Upper_Chamber__pc(value: string | null) {
        this.Set('e4sf__Engage_Federal_District_Upper_Chamber__pc', value);
    }

    /**
    * * Field Name: e4sf__Engage_Is_Advocate__pc
    * * Display Name: e 4sf __Engage _Is _Advocate __pc
    * * SQL Data Type: bit
    */
    get e4sf__Engage_Is_Advocate__pc(): boolean | null {
        return this.Get('e4sf__Engage_Is_Advocate__pc');
    }
    set e4sf__Engage_Is_Advocate__pc(value: boolean | null) {
        this.Set('e4sf__Engage_Is_Advocate__pc', value);
    }

    /**
    * * Field Name: e4sf__Engage_Never_Sync_To_Engage__pc
    * * Display Name: e 4sf __Engage _Never _Sync _To _Engage __pc
    * * SQL Data Type: bit
    */
    get e4sf__Engage_Never_Sync_To_Engage__pc(): boolean | null {
        return this.Get('e4sf__Engage_Never_Sync_To_Engage__pc');
    }
    set e4sf__Engage_Never_Sync_To_Engage__pc(value: boolean | null) {
        this.Set('e4sf__Engage_Never_Sync_To_Engage__pc', value);
    }

    /**
    * * Field Name: e4sf__Engage_Opt_Out__pc
    * * Display Name: e 4sf __Engage _Opt _Out __pc
    * * SQL Data Type: bit
    */
    get e4sf__Engage_Opt_Out__pc(): boolean | null {
        return this.Get('e4sf__Engage_Opt_Out__pc');
    }
    set e4sf__Engage_Opt_Out__pc(value: boolean | null) {
        this.Set('e4sf__Engage_Opt_Out__pc', value);
    }

    /**
    * * Field Name: e4sf__Engage_Phone__pc
    * * Display Name: e 4sf __Engage _Phone __pc
    * * SQL Data Type: nvarchar(MAX)
    */
    get e4sf__Engage_Phone__pc(): string | null {
        return this.Get('e4sf__Engage_Phone__pc');
    }
    set e4sf__Engage_Phone__pc(value: string | null) {
        this.Set('e4sf__Engage_Phone__pc', value);
    }

    /**
    * * Field Name: e4sf__Engage_State_District_Lower_Chamber__pc
    * * Display Name: e 4sf __Engage _State _District _Lower _Chamber __pc
    * * SQL Data Type: nvarchar(MAX)
    */
    get e4sf__Engage_State_District_Lower_Chamber__pc(): string | null {
        return this.Get('e4sf__Engage_State_District_Lower_Chamber__pc');
    }
    set e4sf__Engage_State_District_Lower_Chamber__pc(value: string | null) {
        this.Set('e4sf__Engage_State_District_Lower_Chamber__pc', value);
    }

    /**
    * * Field Name: e4sf__Engage_State_District_Upper_Chamber__pc
    * * Display Name: e 4sf __Engage _State _District _Upper _Chamber __pc
    * * SQL Data Type: nvarchar(MAX)
    */
    get e4sf__Engage_State_District_Upper_Chamber__pc(): string | null {
        return this.Get('e4sf__Engage_State_District_Upper_Chamber__pc');
    }
    set e4sf__Engage_State_District_Upper_Chamber__pc(value: string | null) {
        this.Set('e4sf__Engage_State_District_Upper_Chamber__pc', value);
    }

    /**
    * * Field Name: geopointe__Geocode__pc
    * * Display Name: geopointe __Geocode __pc
    * * SQL Data Type: nvarchar(MAX)
    */
    get geopointe__Geocode__pc(): string | null {
        return this.Get('geopointe__Geocode__pc');
    }
    set geopointe__Geocode__pc(value: string | null) {
        this.Set('geopointe__Geocode__pc', value);
    }

    /**
    * * Field Name: rrpu__Alert_Message__pc
    * * Display Name: rrpu __Alert _Message __pc
    * * SQL Data Type: nvarchar(MAX)
    */
    get rrpu__Alert_Message__pc(): string | null {
        return this.Get('rrpu__Alert_Message__pc');
    }
    set rrpu__Alert_Message__pc(value: string | null) {
        this.Set('rrpu__Alert_Message__pc', value);
    }

    /**
    * * Field Name: CloudingoAgent__CES__pc
    * * Display Name: Cloudingo Agent __CES__pc
    * * SQL Data Type: decimal(18, 0)
    */
    get CloudingoAgent__CES__pc(): number | null {
        return this.Get('CloudingoAgent__CES__pc');
    }
    set CloudingoAgent__CES__pc(value: number | null) {
        this.Set('CloudingoAgent__CES__pc', value);
    }

    /**
    * * Field Name: CloudingoAgent__MAR__pc
    * * Display Name: Cloudingo Agent __MAR__pc
    * * SQL Data Type: nvarchar(MAX)
    */
    get CloudingoAgent__MAR__pc(): string | null {
        return this.Get('CloudingoAgent__MAR__pc');
    }
    set CloudingoAgent__MAR__pc(value: string | null) {
        this.Set('CloudingoAgent__MAR__pc', value);
    }

    /**
    * * Field Name: CloudingoAgent__MAS__pc
    * * Display Name: Cloudingo Agent __MAS__pc
    * * SQL Data Type: decimal(18, 0)
    */
    get CloudingoAgent__MAS__pc(): number | null {
        return this.Get('CloudingoAgent__MAS__pc');
    }
    set CloudingoAgent__MAS__pc(value: number | null) {
        this.Set('CloudingoAgent__MAS__pc', value);
    }

    /**
    * * Field Name: CloudingoAgent__MAV__pc
    * * Display Name: Cloudingo Agent __MAV__pc
    * * SQL Data Type: nvarchar(MAX)
    */
    get CloudingoAgent__MAV__pc(): string | null {
        return this.Get('CloudingoAgent__MAV__pc');
    }
    set CloudingoAgent__MAV__pc(value: string | null) {
        this.Set('CloudingoAgent__MAV__pc', value);
    }

    /**
    * * Field Name: CloudingoAgent__MRDI__pc
    * * Display Name: Cloudingo Agent __MRDI__pc
    * * SQL Data Type: nvarchar(MAX)
    */
    get CloudingoAgent__MRDI__pc(): string | null {
        return this.Get('CloudingoAgent__MRDI__pc');
    }
    set CloudingoAgent__MRDI__pc(value: string | null) {
        this.Set('CloudingoAgent__MRDI__pc', value);
    }

    /**
    * * Field Name: CloudingoAgent__MTZ__pc
    * * Display Name: Cloudingo Agent __MTZ__pc
    * * SQL Data Type: nvarchar(MAX)
    */
    get CloudingoAgent__MTZ__pc(): string | null {
        return this.Get('CloudingoAgent__MTZ__pc');
    }
    set CloudingoAgent__MTZ__pc(value: string | null) {
        this.Set('CloudingoAgent__MTZ__pc', value);
    }

    /**
    * * Field Name: CloudingoAgent__OAR__pc
    * * Display Name: Cloudingo Agent __OAR__pc
    * * SQL Data Type: nvarchar(MAX)
    */
    get CloudingoAgent__OAR__pc(): string | null {
        return this.Get('CloudingoAgent__OAR__pc');
    }
    set CloudingoAgent__OAR__pc(value: string | null) {
        this.Set('CloudingoAgent__OAR__pc', value);
    }

    /**
    * * Field Name: CloudingoAgent__OAS__pc
    * * Display Name: Cloudingo Agent __OAS__pc
    * * SQL Data Type: decimal(18, 0)
    */
    get CloudingoAgent__OAS__pc(): number | null {
        return this.Get('CloudingoAgent__OAS__pc');
    }
    set CloudingoAgent__OAS__pc(value: number | null) {
        this.Set('CloudingoAgent__OAS__pc', value);
    }

    /**
    * * Field Name: CloudingoAgent__OAV__pc
    * * Display Name: Cloudingo Agent __OAV__pc
    * * SQL Data Type: nvarchar(MAX)
    */
    get CloudingoAgent__OAV__pc(): string | null {
        return this.Get('CloudingoAgent__OAV__pc');
    }
    set CloudingoAgent__OAV__pc(value: string | null) {
        this.Set('CloudingoAgent__OAV__pc', value);
    }

    /**
    * * Field Name: CloudingoAgent__ORDI__pc
    * * Display Name: Cloudingo Agent __ORDI__pc
    * * SQL Data Type: nvarchar(MAX)
    */
    get CloudingoAgent__ORDI__pc(): string | null {
        return this.Get('CloudingoAgent__ORDI__pc');
    }
    set CloudingoAgent__ORDI__pc(value: string | null) {
        this.Set('CloudingoAgent__ORDI__pc', value);
    }

    /**
    * * Field Name: CloudingoAgent__OTZ__pc
    * * Display Name: Cloudingo Agent __OTZ__pc
    * * SQL Data Type: nvarchar(MAX)
    */
    get CloudingoAgent__OTZ__pc(): string | null {
        return this.Get('CloudingoAgent__OTZ__pc');
    }
    set CloudingoAgent__OTZ__pc(value: string | null) {
        this.Set('CloudingoAgent__OTZ__pc', value);
    }

    /**
    * * Field Name: NC_DPP__Anonymize__pc
    * * Display Name: NC_DPP__Anonymize __pc
    * * SQL Data Type: bit
    */
    get NC_DPP__Anonymize__pc(): boolean | null {
        return this.Get('NC_DPP__Anonymize__pc');
    }
    set NC_DPP__Anonymize__pc(value: boolean | null) {
        this.Set('NC_DPP__Anonymize__pc', value);
    }

    /**
    * * Field Name: NC_DPP__Consented__pc
    * * Display Name: NC_DPP__Consented __pc
    * * SQL Data Type: bit
    */
    get NC_DPP__Consented__pc(): boolean | null {
        return this.Get('NC_DPP__Consented__pc');
    }
    set NC_DPP__Consented__pc(value: boolean | null) {
        this.Set('NC_DPP__Consented__pc', value);
    }

    /**
    * * Field Name: NC_DPP__LastConsentedDate__pc
    * * Display Name: NC_DPP__Last Consented Date __pc
    * * SQL Data Type: datetimeoffset
    */
    get NC_DPP__LastConsentedDate__pc(): Date | null {
        return this.Get('NC_DPP__LastConsentedDate__pc');
    }

    /**
    * * Field Name: NU__Biography__pc
    * * Display Name: NU__Biography __pc
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Biography__pc(): string | null {
        return this.Get('NU__Biography__pc');
    }
    set NU__Biography__pc(value: string | null) {
        this.Set('NU__Biography__pc', value);
    }

    /**
    * * Field Name: NU__Degrees__pc
    * * Display Name: NU__Degrees __pc
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Degrees__pc(): string | null {
        return this.Get('NU__Degrees__pc');
    }
    set NU__Degrees__pc(value: string | null) {
        this.Set('NU__Degrees__pc', value);
    }

    /**
    * * Field Name: NU__DoctoralInstitution__pc
    * * Display Name: NU__Doctoral Institution __pc
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__DoctoralInstitution__pc(): string | null {
        return this.Get('NU__DoctoralInstitution__pc');
    }
    set NU__DoctoralInstitution__pc(value: string | null) {
        this.Set('NU__DoctoralInstitution__pc', value);
    }

    /**
    * * Field Name: NU__Expertise__pc
    * * Display Name: NU__Expertise __pc
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Expertise__pc(): string | null {
        return this.Get('NU__Expertise__pc');
    }
    set NU__Expertise__pc(value: string | null) {
        this.Set('NU__Expertise__pc', value);
    }

    /**
    * * Field Name: NU__GraduateInstitution__pc
    * * Display Name: NU__Graduate Institution __pc
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__GraduateInstitution__pc(): string | null {
        return this.Get('NU__GraduateInstitution__pc');
    }
    set NU__GraduateInstitution__pc(value: string | null) {
        this.Set('NU__GraduateInstitution__pc', value);
    }

    /**
    * * Field Name: NU__Interests__pc
    * * Display Name: NU__Interests __pc
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Interests__pc(): string | null {
        return this.Get('NU__Interests__pc');
    }
    set NU__Interests__pc(value: string | null) {
        this.Set('NU__Interests__pc', value);
    }

    /**
    * * Field Name: NU__UndergraduateInstitution__pc
    * * Display Name: NU__Undergraduate Institution __pc
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__UndergraduateInstitution__pc(): string | null {
        return this.Get('NU__UndergraduateInstitution__pc');
    }
    set NU__UndergraduateInstitution__pc(value: string | null) {
        this.Set('NU__UndergraduateInstitution__pc', value);
    }

    /**
    * * Field Name: et4ae5__HasOptedOutOfMobile__pc
    * * Display Name: et 4ae 5__Has Opted Out Of Mobile __pc
    * * SQL Data Type: bit
    */
    get et4ae5__HasOptedOutOfMobile__pc(): boolean | null {
        return this.Get('et4ae5__HasOptedOutOfMobile__pc');
    }
    set et4ae5__HasOptedOutOfMobile__pc(value: boolean | null) {
        this.Set('et4ae5__HasOptedOutOfMobile__pc', value);
    }

    /**
    * * Field Name: et4ae5__Mobile_Country_Code__pc
    * * Display Name: et 4ae 5__Mobile _Country _Code __pc
    * * SQL Data Type: nvarchar(MAX)
    */
    get et4ae5__Mobile_Country_Code__pc(): string | null {
        return this.Get('et4ae5__Mobile_Country_Code__pc');
    }
    set et4ae5__Mobile_Country_Code__pc(value: string | null) {
        this.Set('et4ae5__Mobile_Country_Code__pc', value);
    }

    /**
    * * Field Name: qualtrics__Informed_Consent_Date__pc
    * * Display Name: qualtrics __Informed _Consent _Date __pc
    * * SQL Data Type: datetimeoffset
    */
    get qualtrics__Informed_Consent_Date__pc(): Date | null {
        return this.Get('qualtrics__Informed_Consent_Date__pc');
    }

    /**
    * * Field Name: qualtrics__Informed_Consent__pc
    * * Display Name: qualtrics __Informed _Consent __pc
    * * SQL Data Type: bit
    */
    get qualtrics__Informed_Consent__pc(): boolean | null {
        return this.Get('qualtrics__Informed_Consent__pc');
    }
    set qualtrics__Informed_Consent__pc(value: boolean | null) {
        this.Set('qualtrics__Informed_Consent__pc', value);
    }

    /**
    * * Field Name: qualtrics__Last_Survey_Invitation__pc
    * * Display Name: qualtrics __Last _Survey _Invitation __pc
    * * SQL Data Type: datetimeoffset
    */
    get qualtrics__Last_Survey_Invitation__pc(): Date | null {
        return this.Get('qualtrics__Last_Survey_Invitation__pc');
    }

    /**
    * * Field Name: qualtrics__Last_Survey_Response__pc
    * * Display Name: qualtrics __Last _Survey _Response __pc
    * * SQL Data Type: datetimeoffset
    */
    get qualtrics__Last_Survey_Response__pc(): Date | null {
        return this.Get('qualtrics__Last_Survey_Response__pc');
    }

    /**
    * * Field Name: qualtrics__Net_Promoter_Score__pc
    * * Display Name: qualtrics __Net _Promoter _Score __pc
    * * SQL Data Type: decimal(2, 0)
    */
    get qualtrics__Net_Promoter_Score__pc(): number | null {
        return this.Get('qualtrics__Net_Promoter_Score__pc');
    }
    set qualtrics__Net_Promoter_Score__pc(value: number | null) {
        this.Set('qualtrics__Net_Promoter_Score__pc', value);
    }

    /**
    * * Field Name: is_eligible_for_SFMC_sync__pc
    * * Display Name: is _eligible _for _SFMC_sync __pc
    * * SQL Data Type: bit
    */
    get is_eligible_for_SFMC_sync__pc(): boolean | null {
        return this.Get('is_eligible_for_SFMC_sync__pc');
    }
    set is_eligible_for_SFMC_sync__pc(value: boolean | null) {
        this.Set('is_eligible_for_SFMC_sync__pc', value);
    }

    /**
    * * Field Name: Long_Form_ID__pc
    * * Display Name: Long _Form _ID__pc
    * * SQL Data Type: nvarchar(MAX)
    */
    get Long_Form_ID__pc(): string | null {
        return this.Get('Long_Form_ID__pc');
    }
    set Long_Form_ID__pc(value: string | null) {
        this.Set('Long_Form_ID__pc', value);
    }

    /**
    * * Field Name: Institution__pc
    * * Display Name: Institution __pc
    * * SQL Data Type: nvarchar(MAX)
    */
    get Institution__pc(): string | null {
        return this.Get('Institution__pc');
    }
    set Institution__pc(value: string | null) {
        this.Set('Institution__pc', value);
    }

    /**
    * * Field Name: Member__pc
    * * Display Name: Member __pc
    * * SQL Data Type: nvarchar(MAX)
    */
    get Member__pc(): string | null {
        return this.Get('Member__pc');
    }
    set Member__pc(value: string | null) {
        this.Set('Member__pc', value);
    }

    /**
    * * Field Name: Eligible_For_SFMC_Sync__pc
    * * Display Name: Eligible _For _SFMC_Sync __pc
    * * SQL Data Type: bit
    */
    get Eligible_For_SFMC_Sync__pc(): boolean | null {
        return this.Get('Eligible_For_SFMC_Sync__pc');
    }
    set Eligible_For_SFMC_Sync__pc(value: boolean | null) {
        this.Set('Eligible_For_SFMC_Sync__pc', value);
    }

    /**
    * * Field Name: DESKSCMT__Desk_Customer_Id__pc
    * * Display Name: DESKSCMT__Desk _Customer _Id __pc
    * * SQL Data Type: decimal(18, 0)
    */
    get DESKSCMT__Desk_Customer_Id__pc(): number | null {
        return this.Get('DESKSCMT__Desk_Customer_Id__pc');
    }
    set DESKSCMT__Desk_Customer_Id__pc(value: number | null) {
        this.Set('DESKSCMT__Desk_Customer_Id__pc', value);
    }

    /**
    * * Field Name: DESKSCMT__Desk_Migrated_Contact__pc
    * * Display Name: DESKSCMT__Desk _Migrated _Contact __pc
    * * SQL Data Type: bit
    */
    get DESKSCMT__Desk_Migrated_Contact__pc(): boolean | null {
        return this.Get('DESKSCMT__Desk_Migrated_Contact__pc');
    }
    set DESKSCMT__Desk_Migrated_Contact__pc(value: boolean | null) {
        this.Set('DESKSCMT__Desk_Migrated_Contact__pc', value);
    }

    /**
    * * Field Name: title__pc
    * * Display Name: title __pc
    * * SQL Data Type: nvarchar(MAX)
    */
    get title__pc(): string | null {
        return this.Get('title__pc');
    }
    set title__pc(value: string | null) {
        this.Set('title__pc', value);
    }

    /**
    * * Field Name: created_at__pc
    * * Display Name: created _at __pc
    * * SQL Data Type: datetimeoffset
    */
    get created_at__pc(): Date | null {
        return this.Get('created_at__pc');
    }

    /**
    * * Field Name: updated_at__pc
    * * Display Name: updated _at __pc
    * * SQL Data Type: datetimeoffset
    */
    get updated_at__pc(): Date | null {
        return this.Get('updated_at__pc');
    }

    /**
    * * Field Name: P2A__Advocate_ID__pc
    * * Display Name: P2A__Advocate _ID__pc
    * * SQL Data Type: decimal(18, 0)
    */
    get P2A__Advocate_ID__pc(): number | null {
        return this.Get('P2A__Advocate_ID__pc');
    }
    set P2A__Advocate_ID__pc(value: number | null) {
        this.Set('P2A__Advocate_ID__pc', value);
    }

    /**
    * * Field Name: P2A__City_District__pc
    * * Display Name: P2A__City _District __pc
    * * SQL Data Type: nvarchar(MAX)
    */
    get P2A__City_District__pc(): string | null {
        return this.Get('P2A__City_District__pc');
    }
    set P2A__City_District__pc(value: string | null) {
        this.Set('P2A__City_District__pc', value);
    }

    /**
    * * Field Name: P2A__County__pc
    * * Display Name: P2A__County __pc
    * * SQL Data Type: nvarchar(MAX)
    */
    get P2A__County__pc(): string | null {
        return this.Get('P2A__County__pc');
    }
    set P2A__County__pc(value: string | null) {
        this.Set('P2A__County__pc', value);
    }

    /**
    * * Field Name: P2A__Federal_House_District__pc
    * * Display Name: P2A__Federal _House _District __pc
    * * SQL Data Type: nvarchar(MAX)
    */
    get P2A__Federal_House_District__pc(): string | null {
        return this.Get('P2A__Federal_House_District__pc');
    }
    set P2A__Federal_House_District__pc(value: string | null) {
        this.Set('P2A__Federal_House_District__pc', value);
    }

    /**
    * * Field Name: P2A__Phone2Action_Email_Optin__pc
    * * Display Name: P2A__Phone 2Action _Email _Optin __pc
    * * SQL Data Type: bit
    */
    get P2A__Phone2Action_Email_Optin__pc(): boolean | null {
        return this.Get('P2A__Phone2Action_Email_Optin__pc');
    }
    set P2A__Phone2Action_Email_Optin__pc(value: boolean | null) {
        this.Set('P2A__Phone2Action_Email_Optin__pc', value);
    }

    /**
    * * Field Name: P2A__State_House_District__pc
    * * Display Name: P2A__State _House _District __pc
    * * SQL Data Type: nvarchar(MAX)
    */
    get P2A__State_House_District__pc(): string | null {
        return this.Get('P2A__State_House_District__pc');
    }
    set P2A__State_House_District__pc(value: string | null) {
        this.Set('P2A__State_House_District__pc', value);
    }

    /**
    * * Field Name: P2A__State_Senate_District__pc
    * * Display Name: P2A__State _Senate _District __pc
    * * SQL Data Type: nvarchar(MAX)
    */
    get P2A__State_Senate_District__pc(): string | null {
        return this.Get('P2A__State_Senate_District__pc');
    }
    set P2A__State_Senate_District__pc(value: string | null) {
        this.Set('P2A__State_Senate_District__pc', value);
    }

    /**
    * * Field Name: P2A__Synced__pc
    * * Display Name: P2A__Synced __pc
    * * SQL Data Type: bit
    */
    get P2A__Synced__pc(): boolean | null {
        return this.Get('P2A__Synced__pc');
    }
    set P2A__Synced__pc(value: boolean | null) {
        this.Set('P2A__Synced__pc', value);
    }

    /**
    * * Field Name: external_id__pc
    * * Display Name: external _id __pc
    * * SQL Data Type: nvarchar(MAX)
    */
    get external_id__pc(): string | null {
        return this.Get('external_id__pc');
    }
    set external_id__pc(value: string | null) {
        this.Set('external_id__pc', value);
    }

    /**
    * * Field Name: background__pc
    * * Display Name: background __pc
    * * SQL Data Type: nvarchar(MAX)
    */
    get background__pc(): string | null {
        return this.Get('background__pc');
    }
    set background__pc(value: string | null) {
        this.Set('background__pc', value);
    }

    /**
    * * Field Name: language__pc
    * * Display Name: language __pc
    * * SQL Data Type: nvarchar(MAX)
    */
    get language__pc(): string | null {
        return this.Get('language__pc');
    }
    set language__pc(value: string | null) {
        this.Set('language__pc', value);
    }

    /**
    * * Field Name: access_private_portal__pc
    * * Display Name: access _private _portal __pc
    * * SQL Data Type: bit
    */
    get access_private_portal__pc(): boolean | null {
        return this.Get('access_private_portal__pc');
    }
    set access_private_portal__pc(value: boolean | null) {
        this.Set('access_private_portal__pc', value);
    }

    /**
    * * Field Name: access_company_cases__pc
    * * Display Name: access _company _cases __pc
    * * SQL Data Type: bit
    */
    get access_company_cases__pc(): boolean | null {
        return this.Get('access_company_cases__pc');
    }
    set access_company_cases__pc(value: boolean | null) {
        this.Set('access_company_cases__pc', value);
    }

    /**
    * * Field Name: Desk_Id__pc
    * * Display Name: Desk _Id __pc
    * * SQL Data Type: decimal(18, 0)
    */
    get Desk_Id__pc(): number | null {
        return this.Get('Desk_Id__pc');
    }
    set Desk_Id__pc(value: number | null) {
        this.Set('Desk_Id__pc', value);
    }

    /**
    * * Field Name: rcsfl__SMS_Number__pc
    * * Display Name: rcsfl __SMS_Number __pc
    * * SQL Data Type: nvarchar(MAX)
    */
    get rcsfl__SMS_Number__pc(): string | null {
        return this.Get('rcsfl__SMS_Number__pc');
    }
    set rcsfl__SMS_Number__pc(value: string | null) {
        this.Set('rcsfl__SMS_Number__pc', value);
    }

    /**
    * * Field Name: rcsfl__SendSMS__pc
    * * Display Name: rcsfl __Send SMS__pc
    * * SQL Data Type: nvarchar(MAX)
    */
    get rcsfl__SendSMS__pc(): string | null {
        return this.Get('rcsfl__SendSMS__pc');
    }
    set rcsfl__SendSMS__pc(value: string | null) {
        this.Set('rcsfl__SendSMS__pc', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Troubleshoot
    * * Display Name: Troubleshoot
    * * SQL Data Type: nvarchar(50)
    */
    get Troubleshoot(): string | null {
        return this.Get('Troubleshoot');
    }
    set Troubleshoot(value: string | null) {
        this.Set('Troubleshoot', value);
    }
}


/**
 * Activities - strongly typed entity sub-class
 * * Schema: propfuel
 * * Base Table: Activity
 * * Base View: vwActivities
 * * Primary Key: ActivityID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Activities')
export class ActivityEntity extends BaseEntity<ActivityEntityType> {
    /**
    * Loads the Activities record from the database
    * @param ActivityID: string - primary key value to load the Activities record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ActivityEntity
    * @method
    * @override
    */
    public async Load(ActivityID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ActivityID', Value: ActivityID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    */
    get ID(): string | null {
        return this.Get('ID');
    }
    set ID(value: string | null) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Activity
    * * Display Name: Activity
    * * SQL Data Type: nvarchar(10)
    */
    get Activity(): string | null {
        return this.Get('Activity');
    }
    set Activity(value: string | null) {
        this.Set('Activity', value);
    }

    /**
    * * Field Name: ActivityID
    * * Display Name: Activity ID
    * * SQL Data Type: nvarchar(10)
    */
    get ActivityID(): string {
        return this.Get('ActivityID');
    }
    set ActivityID(value: string) {
        this.Set('ActivityID', value);
    }

    /**
    * * Field Name: ActivityType
    * * Display Name: Activity Type
    * * SQL Data Type: nvarchar(50)
    */
    get ActivityType(): string | null {
        return this.Get('ActivityType');
    }
    set ActivityType(value: string | null) {
        this.Set('ActivityType', value);
    }

    /**
    * * Field Name: ActivityDate
    * * Display Name: Activity Date
    * * SQL Data Type: datetime
    */
    get ActivityDate(): Date | null {
        return this.Get('ActivityDate');
    }
    set ActivityDate(value: Date | null) {
        this.Set('ActivityDate', value);
    }

    /**
    * * Field Name: ActivityLink
    * * Display Name: Activity Link
    * * SQL Data Type: nvarchar(MAX)
    */
    get ActivityLink(): string | null {
        return this.Get('ActivityLink');
    }
    set ActivityLink(value: string | null) {
        this.Set('ActivityLink', value);
    }

    /**
    * * Field Name: CheckInID
    * * Display Name: Check In ID
    * * SQL Data Type: nvarchar(10)
    */
    get CheckInID(): string | null {
        return this.Get('CheckInID');
    }
    set CheckInID(value: string | null) {
        this.Set('CheckInID', value);
    }

    /**
    * * Field Name: ContactID
    * * Display Name: Contact ID
    * * SQL Data Type: nvarchar(10)
    */
    get ContactID(): string | null {
        return this.Get('ContactID');
    }
    set ContactID(value: string | null) {
        this.Set('ContactID', value);
    }

    /**
    * * Field Name: ContactName
    * * Display Name: Contact Name
    * * SQL Data Type: nvarchar(100)
    */
    get ContactName(): string | null {
        return this.Get('ContactName');
    }
    set ContactName(value: string | null) {
        this.Set('ContactName', value);
    }

    /**
    * * Field Name: ContactEmail
    * * Display Name: Contact Email
    * * SQL Data Type: nvarchar(100)
    */
    get ContactEmail(): string | null {
        return this.Get('ContactEmail');
    }
    set ContactEmail(value: string | null) {
        this.Set('ContactEmail', value);
    }

    /**
    * * Field Name: ContactExternalID
    * * Display Name: Contact External ID
    * * SQL Data Type: nvarchar(50)
    */
    get ContactExternalID(): string | null {
        return this.Get('ContactExternalID');
    }
    set ContactExternalID(value: string | null) {
        this.Set('ContactExternalID', value);
    }

    /**
    * * Field Name: CampaignID
    * * Display Name: Campaign ID
    * * SQL Data Type: int
    */
    get CampaignID(): number | null {
        return this.Get('CampaignID');
    }
    set CampaignID(value: number | null) {
        this.Set('CampaignID', value);
    }

    /**
    * * Field Name: CampaignName
    * * Display Name: Campaign Name
    * * SQL Data Type: nvarchar(500)
    */
    get CampaignName(): string | null {
        return this.Get('CampaignName');
    }
    set CampaignName(value: string | null) {
        this.Set('CampaignName', value);
    }

    /**
    * * Field Name: CheckInNotificationID
    * * Display Name: Check In Notification ID
    * * SQL Data Type: nvarchar(10)
    */
    get CheckInNotificationID(): string | null {
        return this.Get('CheckInNotificationID');
    }
    set CheckInNotificationID(value: string | null) {
        this.Set('CheckInNotificationID', value);
    }

    /**
    * * Field Name: CheckInNotificationType
    * * Display Name: Check In Notification Type
    * * SQL Data Type: nvarchar(50)
    */
    get CheckInNotificationType(): string | null {
        return this.Get('CheckInNotificationType');
    }
    set CheckInNotificationType(value: string | null) {
        this.Set('CheckInNotificationType', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Affiliations - strongly typed entity sub-class
 * * Schema: nams
 * * Base Table: NU__Affiliation__c
 * * Base View: vwNU__Affiliation__cs
 * * Primary Key: Id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Affiliations')
export class NU__Affiliation__cEntity extends BaseEntity<NU__Affiliation__cEntityType> {
    /**
    * Loads the Affiliations record from the database
    * @param Id: string - primary key value to load the Affiliations record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof NU__Affiliation__cEntity
    * @method
    * @override
    */
    public async Load(Id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'Id', Value: Id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: Id
    * * Display Name: Id
    * * SQL Data Type: nvarchar(50)
    */
    get Id(): string {
        return this.Get('Id');
    }
    set Id(value: string) {
        this.Set('Id', value);
    }

    /**
    * * Field Name: OwnerId
    * * Display Name: Owner Id
    * * SQL Data Type: nvarchar(MAX)
    */
    get OwnerId(): string | null {
        return this.Get('OwnerId');
    }
    set OwnerId(value: string | null) {
        this.Set('OwnerId', value);
    }

    /**
    * * Field Name: IsDeleted
    * * Display Name: Is Deleted
    * * SQL Data Type: bit
    */
    get IsDeleted(): boolean | null {
        return this.Get('IsDeleted');
    }
    set IsDeleted(value: boolean | null) {
        this.Set('IsDeleted', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(MAX)
    */
    get Name(): string | null {
        return this.Get('Name');
    }
    set Name(value: string | null) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: CreatedById
    * * Display Name: Created By Id
    * * SQL Data Type: nvarchar(MAX)
    */
    get CreatedById(): string | null {
        return this.Get('CreatedById');
    }
    set CreatedById(value: string | null) {
        this.Set('CreatedById', value);
    }

    /**
    * * Field Name: LastModifiedDate
    * * Display Name: Last Modified Date
    * * SQL Data Type: datetimeoffset
    */
    get LastModifiedDate(): Date | null {
        return this.Get('LastModifiedDate');
    }

    /**
    * * Field Name: LastModifiedById
    * * Display Name: Last Modified By Id
    * * SQL Data Type: nvarchar(MAX)
    */
    get LastModifiedById(): string | null {
        return this.Get('LastModifiedById');
    }
    set LastModifiedById(value: string | null) {
        this.Set('LastModifiedById', value);
    }

    /**
    * * Field Name: SystemModstamp
    * * Display Name: System Modstamp
    * * SQL Data Type: datetimeoffset
    */
    get SystemModstamp(): Date | null {
        return this.Get('SystemModstamp');
    }

    /**
    * * Field Name: LastActivityDate
    * * Display Name: Last Activity Date
    * * SQL Data Type: datetimeoffset
    */
    get LastActivityDate(): Date | null {
        return this.Get('LastActivityDate');
    }

    /**
    * * Field Name: LastViewedDate
    * * Display Name: Last Viewed Date
    * * SQL Data Type: datetimeoffset
    */
    get LastViewedDate(): Date | null {
        return this.Get('LastViewedDate');
    }

    /**
    * * Field Name: LastReferencedDate
    * * Display Name: Last Referenced Date
    * * SQL Data Type: datetimeoffset
    */
    get LastReferencedDate(): Date | null {
        return this.Get('LastReferencedDate');
    }

    /**
    * * Field Name: NU__Account__c
    * * Display Name: Nimble Account ID
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Account__c(): string | null {
        return this.Get('NU__Account__c');
    }
    set NU__Account__c(value: string | null) {
        this.Set('NU__Account__c', value);
    }

    /**
    * * Field Name: NU__DoNotFlowdownAddress__c
    * * Display Name: NU__Do Not Flowdown Address __c
    * * SQL Data Type: bit
    */
    get NU__DoNotFlowdownAddress__c(): boolean | null {
        return this.Get('NU__DoNotFlowdownAddress__c');
    }
    set NU__DoNotFlowdownAddress__c(value: boolean | null) {
        this.Set('NU__DoNotFlowdownAddress__c', value);
    }

    /**
    * * Field Name: NU__EndDate__c
    * * Display Name: NU__End Date __c
    * * SQL Data Type: datetimeoffset
    */
    get NU__EndDate__c(): Date | null {
        return this.Get('NU__EndDate__c');
    }

    /**
    * * Field Name: NU__ExternalID__c
    * * Display Name: NU__External ID__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__ExternalID__c(): string | null {
        return this.Get('NU__ExternalID__c');
    }
    set NU__ExternalID__c(value: string | null) {
        this.Set('NU__ExternalID__c', value);
    }

    /**
    * * Field Name: NU__IsCompanyManager__c
    * * Display Name: NU__Is Company Manager __c
    * * SQL Data Type: bit
    */
    get NU__IsCompanyManager__c(): boolean | null {
        return this.Get('NU__IsCompanyManager__c');
    }
    set NU__IsCompanyManager__c(value: boolean | null) {
        this.Set('NU__IsCompanyManager__c', value);
    }

    /**
    * * Field Name: NU__IsPrimary__c
    * * Display Name: NU__Is Primary __c
    * * SQL Data Type: bit
    */
    get NU__IsPrimary__c(): boolean | null {
        return this.Get('NU__IsPrimary__c');
    }
    set NU__IsPrimary__c(value: boolean | null) {
        this.Set('NU__IsPrimary__c', value);
    }

    /**
    * * Field Name: NU__ParentAccount__c
    * * Display Name: Nimble Parent Account ID
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__ParentAccount__c(): string | null {
        return this.Get('NU__ParentAccount__c');
    }
    set NU__ParentAccount__c(value: string | null) {
        this.Set('NU__ParentAccount__c', value);
    }

    /**
    * * Field Name: NU__RemovalDate__c
    * * Display Name: NU__Removal Date __c
    * * SQL Data Type: datetimeoffset
    */
    get NU__RemovalDate__c(): Date | null {
        return this.Get('NU__RemovalDate__c');
    }

    /**
    * * Field Name: NU__RemovalReason__c
    * * Display Name: NU__Removal Reason __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__RemovalReason__c(): string | null {
        return this.Get('NU__RemovalReason__c');
    }
    set NU__RemovalReason__c(value: string | null) {
        this.Set('NU__RemovalReason__c', value);
    }

    /**
    * * Field Name: NU__Role__c
    * * Display Name: Role
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Role__c(): string | null {
        return this.Get('NU__Role__c');
    }
    set NU__Role__c(value: string | null) {
        this.Set('NU__Role__c', value);
    }

    /**
    * * Field Name: NU__Search__c
    * * Display Name: Name
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Search__c(): string | null {
        return this.Get('NU__Search__c');
    }
    set NU__Search__c(value: string | null) {
        this.Set('NU__Search__c', value);
    }

    /**
    * * Field Name: NU__StartDate__c
    * * Display Name: NU__Start Date __c
    * * SQL Data Type: datetimeoffset
    */
    get NU__StartDate__c(): Date | null {
        return this.Get('NU__StartDate__c');
    }

    /**
    * * Field Name: Is_CTA_Leader__c
    * * Display Name: Is _CTA_Leader __c
    * * SQL Data Type: bit
    */
    get Is_CTA_Leader__c(): boolean | null {
        return this.Get('Is_CTA_Leader__c');
    }
    set Is_CTA_Leader__c(value: boolean | null) {
        this.Set('Is_CTA_Leader__c', value);
    }

    /**
    * * Field Name: NU__IsPrimaryContact__c
    * * Display Name: NU__Is Primary Contact __c
    * * SQL Data Type: bit
    */
    get NU__IsPrimaryContact__c(): boolean | null {
        return this.Get('NU__IsPrimaryContact__c');
    }
    set NU__IsPrimaryContact__c(value: boolean | null) {
        this.Set('NU__IsPrimaryContact__c', value);
    }

    /**
    * * Field Name: NU__RemovalDate2__c
    * * Display Name: NU__Removal Date 2__c
    * * SQL Data Type: datetimeoffset
    */
    get NU__RemovalDate2__c(): Date | null {
        return this.Get('NU__RemovalDate2__c');
    }

    /**
    * * Field Name: NU__StatusFlag__c
    * * Display Name: NU__Status Flag __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__StatusFlag__c(): string | null {
        return this.Get('NU__StatusFlag__c');
    }
    set NU__StatusFlag__c(value: string | null) {
        this.Set('NU__StatusFlag__c', value);
    }

    /**
    * * Field Name: NU__Status__c
    * * Display Name: Status
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Status__c(): string | null {
        return this.Get('NU__Status__c');
    }
    set NU__Status__c(value: string | null) {
        this.Set('NU__Status__c', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Troubleshoot
    * * Display Name: Troubleshoot
    * * SQL Data Type: nvarchar(50)
    */
    get Troubleshoot(): string | null {
        return this.Get('Troubleshoot');
    }
    set Troubleshoot(value: string | null) {
        this.Set('Troubleshoot', value);
    }
}


/**
 * Committee Memberships - strongly typed entity sub-class
 * * Schema: nams
 * * Base Table: NU__CommitteeMembership__c
 * * Base View: vwNU__CommitteeMembership__cs
 * * Primary Key: Id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Committee Memberships')
export class NU__CommitteeMembership__cEntity extends BaseEntity<NU__CommitteeMembership__cEntityType> {
    /**
    * Loads the Committee Memberships record from the database
    * @param Id: string - primary key value to load the Committee Memberships record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof NU__CommitteeMembership__cEntity
    * @method
    * @override
    */
    public async Load(Id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'Id', Value: Id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: Id
    * * Display Name: Id
    * * SQL Data Type: nvarchar(50)
    */
    get Id(): string {
        return this.Get('Id');
    }
    set Id(value: string) {
        this.Set('Id', value);
    }

    /**
    * * Field Name: IsDeleted
    * * Display Name: Is Deleted
    * * SQL Data Type: bit
    */
    get IsDeleted(): boolean | null {
        return this.Get('IsDeleted');
    }
    set IsDeleted(value: boolean | null) {
        this.Set('IsDeleted', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(MAX)
    */
    get Name(): string | null {
        return this.Get('Name');
    }
    set Name(value: string | null) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: CreatedById
    * * Display Name: Created By Id
    * * SQL Data Type: nvarchar(MAX)
    */
    get CreatedById(): string | null {
        return this.Get('CreatedById');
    }
    set CreatedById(value: string | null) {
        this.Set('CreatedById', value);
    }

    /**
    * * Field Name: LastModifiedDate
    * * Display Name: Last Modified Date
    * * SQL Data Type: datetime2
    */
    get LastModifiedDate(): Date | null {
        return this.Get('LastModifiedDate');
    }
    set LastModifiedDate(value: Date | null) {
        this.Set('LastModifiedDate', value);
    }

    /**
    * * Field Name: LastModifiedById
    * * Display Name: Last Modified By Id
    * * SQL Data Type: nvarchar(MAX)
    */
    get LastModifiedById(): string | null {
        return this.Get('LastModifiedById');
    }
    set LastModifiedById(value: string | null) {
        this.Set('LastModifiedById', value);
    }

    /**
    * * Field Name: SystemModstamp
    * * Display Name: System Modstamp
    * * SQL Data Type: datetime2
    */
    get SystemModstamp(): Date | null {
        return this.Get('SystemModstamp');
    }
    set SystemModstamp(value: Date | null) {
        this.Set('SystemModstamp', value);
    }

    /**
    * * Field Name: LastActivityDate
    * * Display Name: Last Activity Date
    * * SQL Data Type: datetime2
    */
    get LastActivityDate(): Date | null {
        return this.Get('LastActivityDate');
    }
    set LastActivityDate(value: Date | null) {
        this.Set('LastActivityDate', value);
    }

    /**
    * * Field Name: LastViewedDate
    * * Display Name: Last Viewed Date
    * * SQL Data Type: datetime2
    */
    get LastViewedDate(): Date | null {
        return this.Get('LastViewedDate');
    }
    set LastViewedDate(value: Date | null) {
        this.Set('LastViewedDate', value);
    }

    /**
    * * Field Name: LastReferencedDate
    * * Display Name: Last Referenced Date
    * * SQL Data Type: datetime2
    */
    get LastReferencedDate(): Date | null {
        return this.Get('LastReferencedDate');
    }
    set LastReferencedDate(value: Date | null) {
        this.Set('LastReferencedDate', value);
    }

    /**
    * * Field Name: NU__Account__c
    * * Display Name: NU__Account __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Account__c(): string | null {
        return this.Get('NU__Account__c');
    }
    set NU__Account__c(value: string | null) {
        this.Set('NU__Account__c', value);
    }

    /**
    * * Field Name: NU__Committee__c
    * * Display Name: NU__Committee __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Committee__c(): string | null {
        return this.Get('NU__Committee__c');
    }
    set NU__Committee__c(value: string | null) {
        this.Set('NU__Committee__c', value);
    }

    /**
    * * Field Name: NU__CommitteePosition__c
    * * Display Name: NU__Committee Position __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__CommitteePosition__c(): string | null {
        return this.Get('NU__CommitteePosition__c');
    }
    set NU__CommitteePosition__c(value: string | null) {
        this.Set('NU__CommitteePosition__c', value);
    }

    /**
    * * Field Name: NU__EndDate__c
    * * Display Name: NU__End Date __c
    * * SQL Data Type: datetime2
    */
    get NU__EndDate__c(): Date | null {
        return this.Get('NU__EndDate__c');
    }
    set NU__EndDate__c(value: Date | null) {
        this.Set('NU__EndDate__c', value);
    }

    /**
    * * Field Name: NU__ExternalID__c
    * * Display Name: NU__External ID__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__ExternalID__c(): string | null {
        return this.Get('NU__ExternalID__c');
    }
    set NU__ExternalID__c(value: string | null) {
        this.Set('NU__ExternalID__c', value);
    }

    /**
    * * Field Name: NU__FormulaPositionSort__c
    * * Display Name: NU__Formula Position Sort __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__FormulaPositionSort__c(): string | null {
        return this.Get('NU__FormulaPositionSort__c');
    }
    set NU__FormulaPositionSort__c(value: string | null) {
        this.Set('NU__FormulaPositionSort__c', value);
    }

    /**
    * * Field Name: NU__MemberEmail__c
    * * Display Name: Member Email
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__MemberEmail__c(): string | null {
        return this.Get('NU__MemberEmail__c');
    }
    set NU__MemberEmail__c(value: string | null) {
        this.Set('NU__MemberEmail__c', value);
    }

    /**
    * * Field Name: NU__Position__c
    * * Display Name: NU__Position __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Position__c(): string | null {
        return this.Get('NU__Position__c');
    }
    set NU__Position__c(value: string | null) {
        this.Set('NU__Position__c', value);
    }

    /**
    * * Field Name: NU__Search__c
    * * Display Name: Member Name
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Search__c(): string | null {
        return this.Get('NU__Search__c');
    }
    set NU__Search__c(value: string | null) {
        this.Set('NU__Search__c', value);
    }

    /**
    * * Field Name: NU__StartDate__c
    * * Display Name: NU__Start Date __c
    * * SQL Data Type: datetime2
    */
    get NU__StartDate__c(): Date | null {
        return this.Get('NU__StartDate__c');
    }
    set NU__StartDate__c(value: Date | null) {
        this.Set('NU__StartDate__c', value);
    }

    /**
    * * Field Name: NU__State__c
    * * Display Name: State
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__State__c(): string | null {
        return this.Get('NU__State__c');
    }
    set NU__State__c(value: string | null) {
        this.Set('NU__State__c', value);
    }

    /**
    * * Field Name: NU__StatusFlag__c
    * * Display Name: NU__Status Flag __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__StatusFlag__c(): string | null {
        return this.Get('NU__StatusFlag__c');
    }
    set NU__StatusFlag__c(value: string | null) {
        this.Set('NU__StatusFlag__c', value);
    }

    /**
    * * Field Name: NU__SupportingOrganization__c
    * * Display Name: NU__Supporting Organization __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__SupportingOrganization__c(): string | null {
        return this.Get('NU__SupportingOrganization__c');
    }
    set NU__SupportingOrganization__c(value: string | null) {
        this.Set('NU__SupportingOrganization__c', value);
    }

    /**
    * * Field Name: Term__c
    * * Display Name: Term __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Term__c(): string | null {
        return this.Get('Term__c');
    }
    set Term__c(value: string | null) {
        this.Set('Term__c', value);
    }

    /**
    * * Field Name: NU__StampedState__c
    * * Display Name: NU__Stamped State __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__StampedState__c(): string | null {
        return this.Get('NU__StampedState__c');
    }
    set NU__StampedState__c(value: string | null) {
        this.Set('NU__StampedState__c', value);
    }

    /**
    * * Field Name: Committee_Short_Name__c
    * * Display Name: Committee _Short _Name __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Committee_Short_Name__c(): string | null {
        return this.Get('Committee_Short_Name__c');
    }
    set Committee_Short_Name__c(value: string | null) {
        this.Set('Committee_Short_Name__c', value);
    }

    /**
    * * Field Name: Committee_Type__c
    * * Display Name: Committee Type
    * * SQL Data Type: nvarchar(MAX)
    */
    get Committee_Type__c(): string | null {
        return this.Get('Committee_Type__c');
    }
    set Committee_Type__c(value: string | null) {
        this.Set('Committee_Type__c', value);
    }

    /**
    * * Field Name: Member_ID__c
    * * Display Name: Member _ID__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Member_ID__c(): string | null {
        return this.Get('Member_ID__c');
    }
    set Member_ID__c(value: string | null) {
        this.Set('Member_ID__c', value);
    }

    /**
    * * Field Name: CommitteePositionName__c
    * * Display Name: Committee Position Name
    * * SQL Data Type: nvarchar(MAX)
    */
    get CommitteePositionName__c(): string | null {
        return this.Get('CommitteePositionName__c');
    }
    set CommitteePositionName__c(value: string | null) {
        this.Set('CommitteePositionName__c', value);
    }

    /**
    * * Field Name: CommitteeName__c
    * * Display Name: Committee Name
    * * SQL Data Type: nvarchar(MAX)
    */
    get CommitteeName__c(): string | null {
        return this.Get('CommitteeName__c');
    }
    set CommitteeName__c(value: string | null) {
        this.Set('CommitteeName__c', value);
    }

    /**
    * * Field Name: CTA_Dues_Forward_Eligible__c
    * * Display Name: CTA_Dues _Forward _Eligible __c
    * * SQL Data Type: bit
    */
    get CTA_Dues_Forward_Eligible__c(): boolean | null {
        return this.Get('CTA_Dues_Forward_Eligible__c');
    }
    set CTA_Dues_Forward_Eligible__c(value: boolean | null) {
        this.Set('CTA_Dues_Forward_Eligible__c', value);
    }

    /**
    * * Field Name: CTA_Dues_Forward_Ineligible__c
    * * Display Name: CTA_Dues _Forward _Ineligible __c
    * * SQL Data Type: bit
    */
    get CTA_Dues_Forward_Ineligible__c(): boolean | null {
        return this.Get('CTA_Dues_Forward_Ineligible__c');
    }
    set CTA_Dues_Forward_Ineligible__c(value: boolean | null) {
        this.Set('CTA_Dues_Forward_Ineligible__c', value);
    }

    /**
    * * Field Name: Committee_Account__c
    * * Display Name: Committee Account
    * * SQL Data Type: nvarchar(MAX)
    */
    get Committee_Account__c(): string | null {
        return this.Get('Committee_Account__c');
    }
    set Committee_Account__c(value: string | null) {
        this.Set('Committee_Account__c', value);
    }

    /**
    * * Field Name: Committee_Account_ID__c
    * * Display Name: Committee _Account _ID__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Committee_Account_ID__c(): string | null {
        return this.Get('Committee_Account_ID__c');
    }
    set Committee_Account_ID__c(value: string | null) {
        this.Set('Committee_Account_ID__c', value);
    }

    /**
    * * Field Name: NU__Account2__c
    * * Display Name: NU__Account 2__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Account2__c(): string | null {
        return this.Get('NU__Account2__c');
    }
    set NU__Account2__c(value: string | null) {
        this.Set('NU__Account2__c', value);
    }

    /**
    * * Field Name: NU__Committee2__c
    * * Display Name: NU__Committee 2__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Committee2__c(): string | null {
        return this.Get('NU__Committee2__c');
    }
    set NU__Committee2__c(value: string | null) {
        this.Set('NU__Committee2__c', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Troubleshoot
    * * Display Name: Troubleshoot
    * * SQL Data Type: nvarchar(50)
    */
    get Troubleshoot(): string | null {
        return this.Get('Troubleshoot');
    }
    set Troubleshoot(value: string | null) {
        this.Set('Troubleshoot', value);
    }
}


/**
 * Committees - strongly typed entity sub-class
 * * Schema: nams
 * * Base Table: NU__Committee__c
 * * Base View: vwNU__Committee__cs
 * * Primary Key: Id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Committees')
export class NU__Committee__cEntity extends BaseEntity<NU__Committee__cEntityType> {
    /**
    * Loads the Committees record from the database
    * @param Id: string - primary key value to load the Committees record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof NU__Committee__cEntity
    * @method
    * @override
    */
    public async Load(Id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'Id', Value: Id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: Id
    * * Display Name: Id
    * * SQL Data Type: nvarchar(50)
    */
    get Id(): string {
        return this.Get('Id');
    }
    set Id(value: string) {
        this.Set('Id', value);
    }

    /**
    * * Field Name: OwnerId
    * * Display Name: Owner Id
    * * SQL Data Type: nvarchar(MAX)
    */
    get OwnerId(): string | null {
        return this.Get('OwnerId');
    }
    set OwnerId(value: string | null) {
        this.Set('OwnerId', value);
    }

    /**
    * * Field Name: IsDeleted
    * * Display Name: Is Deleted
    * * SQL Data Type: bit
    */
    get IsDeleted(): boolean | null {
        return this.Get('IsDeleted');
    }
    set IsDeleted(value: boolean | null) {
        this.Set('IsDeleted', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(MAX)
    */
    get Name(): string | null {
        return this.Get('Name');
    }
    set Name(value: string | null) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: CreatedById
    * * Display Name: Created By Id
    * * SQL Data Type: nvarchar(MAX)
    */
    get CreatedById(): string | null {
        return this.Get('CreatedById');
    }
    set CreatedById(value: string | null) {
        this.Set('CreatedById', value);
    }

    /**
    * * Field Name: LastModifiedDate
    * * Display Name: Last Modified Date
    * * SQL Data Type: datetimeoffset
    */
    get LastModifiedDate(): Date | null {
        return this.Get('LastModifiedDate');
    }

    /**
    * * Field Name: LastModifiedById
    * * Display Name: Last Modified By Id
    * * SQL Data Type: nvarchar(MAX)
    */
    get LastModifiedById(): string | null {
        return this.Get('LastModifiedById');
    }
    set LastModifiedById(value: string | null) {
        this.Set('LastModifiedById', value);
    }

    /**
    * * Field Name: SystemModstamp
    * * Display Name: System Modstamp
    * * SQL Data Type: datetimeoffset
    */
    get SystemModstamp(): Date | null {
        return this.Get('SystemModstamp');
    }

    /**
    * * Field Name: LastActivityDate
    * * Display Name: Last Activity Date
    * * SQL Data Type: datetimeoffset
    */
    get LastActivityDate(): Date | null {
        return this.Get('LastActivityDate');
    }

    /**
    * * Field Name: LastViewedDate
    * * Display Name: Last Viewed Date
    * * SQL Data Type: datetimeoffset
    */
    get LastViewedDate(): Date | null {
        return this.Get('LastViewedDate');
    }

    /**
    * * Field Name: LastReferencedDate
    * * Display Name: Last Referenced Date
    * * SQL Data Type: datetimeoffset
    */
    get LastReferencedDate(): Date | null {
        return this.Get('LastReferencedDate');
    }

    /**
    * * Field Name: NU__AvailableTitles__c
    * * Display Name: AvailableTitles
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__AvailableTitles__c(): string | null {
        return this.Get('NU__AvailableTitles__c');
    }
    set NU__AvailableTitles__c(value: string | null) {
        this.Set('NU__AvailableTitles__c', value);
    }

    /**
    * * Field Name: NU__CommitteeShortName__c
    * * Display Name: CommitteeShortName
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__CommitteeShortName__c(): string | null {
        return this.Get('NU__CommitteeShortName__c');
    }
    set NU__CommitteeShortName__c(value: string | null) {
        this.Set('NU__CommitteeShortName__c', value);
    }

    /**
    * * Field Name: NU__Description__c
    * * Display Name: Description
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Description__c(): string | null {
        return this.Get('NU__Description__c');
    }
    set NU__Description__c(value: string | null) {
        this.Set('NU__Description__c', value);
    }

    /**
    * * Field Name: NU__ExternalID__c
    * * Display Name: ExternalID
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__ExternalID__c(): string | null {
        return this.Get('NU__ExternalID__c');
    }
    set NU__ExternalID__c(value: string | null) {
        this.Set('NU__ExternalID__c', value);
    }

    /**
    * * Field Name: NU__FullDescription__c
    * * Display Name: FullDescription
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__FullDescription__c(): string | null {
        return this.Get('NU__FullDescription__c');
    }
    set NU__FullDescription__c(value: string | null) {
        this.Set('NU__FullDescription__c', value);
    }

    /**
    * * Field Name: NU__Status__c
    * * Display Name: Status
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Status__c(): string | null {
        return this.Get('NU__Status__c');
    }
    set NU__Status__c(value: string | null) {
        this.Set('NU__Status__c', value);
    }

    /**
    * * Field Name: NU__TermMonths__c
    * * Display Name: TermMonths
    * * SQL Data Type: decimal(3, 0)
    */
    get NU__TermMonths__c(): number | null {
        return this.Get('NU__TermMonths__c');
    }
    set NU__TermMonths__c(value: number | null) {
        this.Set('NU__TermMonths__c', value);
    }

    /**
    * * Field Name: NU__Type__c
    * * Display Name: Type
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Type__c(): string | null {
        return this.Get('NU__Type__c');
    }
    set NU__Type__c(value: string | null) {
        this.Set('NU__Type__c', value);
    }

    /**
    * * Field Name: NU__CommitteeCount__c
    * * Display Name: CommitteeCount
    * * SQL Data Type: decimal(18, 0)
    */
    get NU__CommitteeCount__c(): number | null {
        return this.Get('NU__CommitteeCount__c');
    }
    set NU__CommitteeCount__c(value: number | null) {
        this.Set('NU__CommitteeCount__c', value);
    }

    /**
    * * Field Name: Account__c
    * * Display Name: Account __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Account__c(): string | null {
        return this.Get('Account__c');
    }
    set Account__c(value: string | null) {
        this.Set('Account__c', value);
    }

    /**
    * * Field Name: Staff_Liaison_1__c
    * * Display Name: Staff _Liaison _1__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Staff_Liaison_1__c(): string | null {
        return this.Get('Staff_Liaison_1__c');
    }
    set Staff_Liaison_1__c(value: string | null) {
        this.Set('Staff_Liaison_1__c', value);
    }

    /**
    * * Field Name: Staff_Liaison_2__c
    * * Display Name: Staff _Liaison _2__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Staff_Liaison_2__c(): string | null {
        return this.Get('Staff_Liaison_2__c');
    }
    set Staff_Liaison_2__c(value: string | null) {
        this.Set('Staff_Liaison_2__c', value);
    }

    /**
    * * Field Name: Staff_Liaison_3__c
    * * Display Name: Staff _Liaison _3__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Staff_Liaison_3__c(): string | null {
        return this.Get('Staff_Liaison_3__c');
    }
    set Staff_Liaison_3__c(value: string | null) {
        this.Set('Staff_Liaison_3__c', value);
    }

    /**
    * * Field Name: Terms_Allowed__c
    * * Display Name: Terms _Allowed __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Terms_Allowed__c(): string | null {
        return this.Get('Terms_Allowed__c');
    }
    set Terms_Allowed__c(value: string | null) {
        this.Set('Terms_Allowed__c', value);
    }

    /**
    * * Field Name: Current_Committee_Member_Count__c
    * * Display Name: Current Committee Member Count
    * * SQL Data Type: decimal(5, 0)
    */
    get Current_Committee_Member_Count__c(): number | null {
        return this.Get('Current_Committee_Member_Count__c');
    }
    set Current_Committee_Member_Count__c(value: number | null) {
        this.Set('Current_Committee_Member_Count__c', value);
    }

    /**
    * * Field Name: Owner_ExternalID__c
    * * Display Name: Owner _External ID__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Owner_ExternalID__c(): string | null {
        return this.Get('Owner_ExternalID__c');
    }
    set Owner_ExternalID__c(value: string | null) {
        this.Set('Owner_ExternalID__c', value);
    }

    /**
    * * Field Name: CommitteeRecordID__c
    * * Display Name: Committee Record ID__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get CommitteeRecordID__c(): string | null {
        return this.Get('CommitteeRecordID__c');
    }
    set CommitteeRecordID__c(value: string | null) {
        this.Set('CommitteeRecordID__c', value);
    }

    /**
    * * Field Name: CCTA_Dues_Forward_Eligible__c
    * * Display Name: CCTA_Dues _Forward _Eligible __c
    * * SQL Data Type: decimal(18, 0)
    */
    get CCTA_Dues_Forward_Eligible__c(): number | null {
        return this.Get('CCTA_Dues_Forward_Eligible__c');
    }
    set CCTA_Dues_Forward_Eligible__c(value: number | null) {
        this.Set('CCTA_Dues_Forward_Eligible__c', value);
    }

    /**
    * * Field Name: CCTA_Dues_Forward_Ineligible__c
    * * Display Name: CCTA_Dues _Forward _Ineligible __c
    * * SQL Data Type: decimal(18, 0)
    */
    get CCTA_Dues_Forward_Ineligible__c(): number | null {
        return this.Get('CCTA_Dues_Forward_Ineligible__c');
    }
    set CCTA_Dues_Forward_Ineligible__c(value: number | null) {
        this.Set('CCTA_Dues_Forward_Ineligible__c', value);
    }

    /**
    * * Field Name: ChatterGroupId__c
    * * Display Name: Chatter Group Id __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get ChatterGroupId__c(): string | null {
        return this.Get('ChatterGroupId__c');
    }
    set ChatterGroupId__c(value: string | null) {
        this.Set('ChatterGroupId__c', value);
    }

    /**
    * * Field Name: CommunityGroup__c
    * * Display Name: Community Group __c
    * * SQL Data Type: bit
    */
    get CommunityGroup__c(): boolean | null {
        return this.Get('CommunityGroup__c');
    }
    set CommunityGroup__c(value: boolean | null) {
        this.Set('CommunityGroup__c', value);
    }

    /**
    * * Field Name: Staff_Liaison_4__c
    * * Display Name: Staff _Liaison _4__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Staff_Liaison_4__c(): string | null {
        return this.Get('Staff_Liaison_4__c');
    }
    set Staff_Liaison_4__c(value: string | null) {
        this.Set('Staff_Liaison_4__c', value);
    }

    /**
    * * Field Name: Staff_Liaison_5__c
    * * Display Name: Staff _Liaison _5__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Staff_Liaison_5__c(): string | null {
        return this.Get('Staff_Liaison_5__c');
    }
    set Staff_Liaison_5__c(value: string | null) {
        this.Set('Staff_Liaison_5__c', value);
    }

    /**
    * * Field Name: NU__CommitteeCount2__c
    * * Display Name: CommitteeCount2
    * * SQL Data Type: decimal(18, 0)
    */
    get NU__CommitteeCount2__c(): number | null {
        return this.Get('NU__CommitteeCount2__c');
    }
    set NU__CommitteeCount2__c(value: number | null) {
        this.Set('NU__CommitteeCount2__c', value);
    }

    /**
    * * Field Name: Collaboration_Group_ID__c
    * * Display Name: Collaboration _Group _ID__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Collaboration_Group_ID__c(): string | null {
        return this.Get('Collaboration_Group_ID__c');
    }
    set Collaboration_Group_ID__c(value: string | null) {
        this.Set('Collaboration_Group_ID__c', value);
    }

    /**
    * * Field Name: Uses_Community_Group_Automation__c
    * * Display Name: Uses _Community _Group _Automation __c
    * * SQL Data Type: bit
    */
    get Uses_Community_Group_Automation__c(): boolean | null {
        return this.Get('Uses_Community_Group_Automation__c');
    }
    set Uses_Community_Group_Automation__c(value: boolean | null) {
        this.Set('Uses_Community_Group_Automation__c', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Troubleshoot
    * * Display Name: Troubleshoot
    * * SQL Data Type: nvarchar(50)
    */
    get Troubleshoot(): string | null {
        return this.Get('Troubleshoot');
    }
    set Troubleshoot(value: string | null) {
        this.Set('Troubleshoot', value);
    }
}


/**
 * Contacts - strongly typed entity sub-class
 * * Schema: nams
 * * Base Table: Contact
 * * Base View: vwContacts
 * * Primary Key: Id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Contacts')
export class ContactEntity extends BaseEntity<ContactEntityType> {
    /**
    * Loads the Contacts record from the database
    * @param Id: string - primary key value to load the Contacts record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ContactEntity
    * @method
    * @override
    */
    public async Load(Id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'Id', Value: Id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: Id
    * * Display Name: Id
    * * SQL Data Type: nvarchar(50)
    */
    get Id(): string {
        return this.Get('Id');
    }
    set Id(value: string) {
        this.Set('Id', value);
    }

    /**
    * * Field Name: IsDeleted
    * * Display Name: Is Deleted
    * * SQL Data Type: bit
    */
    get IsDeleted(): boolean | null {
        return this.Get('IsDeleted');
    }
    set IsDeleted(value: boolean | null) {
        this.Set('IsDeleted', value);
    }

    /**
    * * Field Name: MasterRecordId
    * * Display Name: Master Record Id
    * * SQL Data Type: nvarchar(MAX)
    */
    get MasterRecordId(): string | null {
        return this.Get('MasterRecordId');
    }
    set MasterRecordId(value: string | null) {
        this.Set('MasterRecordId', value);
    }

    /**
    * * Field Name: AccountId
    * * Display Name: Account Id
    * * SQL Data Type: nvarchar(MAX)
    */
    get AccountId(): string | null {
        return this.Get('AccountId');
    }
    set AccountId(value: string | null) {
        this.Set('AccountId', value);
    }

    /**
    * * Field Name: IsPersonAccount
    * * Display Name: Is Person Account
    * * SQL Data Type: bit
    */
    get IsPersonAccount(): boolean | null {
        return this.Get('IsPersonAccount');
    }
    set IsPersonAccount(value: boolean | null) {
        this.Set('IsPersonAccount', value);
    }

    /**
    * * Field Name: LastName
    * * Display Name: Last Name
    * * SQL Data Type: nvarchar(MAX)
    */
    get LastName(): string | null {
        return this.Get('LastName');
    }
    set LastName(value: string | null) {
        this.Set('LastName', value);
    }

    /**
    * * Field Name: FirstName
    * * Display Name: First Name
    * * SQL Data Type: nvarchar(MAX)
    */
    get FirstName(): string | null {
        return this.Get('FirstName');
    }
    set FirstName(value: string | null) {
        this.Set('FirstName', value);
    }

    /**
    * * Field Name: Salutation
    * * Display Name: Salutation
    * * SQL Data Type: nvarchar(MAX)
    */
    get Salutation(): string | null {
        return this.Get('Salutation');
    }
    set Salutation(value: string | null) {
        this.Set('Salutation', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(MAX)
    */
    get Name(): string | null {
        return this.Get('Name');
    }
    set Name(value: string | null) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: OtherStreet
    * * Display Name: Other Street
    * * SQL Data Type: nvarchar(MAX)
    */
    get OtherStreet(): string | null {
        return this.Get('OtherStreet');
    }
    set OtherStreet(value: string | null) {
        this.Set('OtherStreet', value);
    }

    /**
    * * Field Name: OtherCity
    * * Display Name: Other City
    * * SQL Data Type: nvarchar(MAX)
    */
    get OtherCity(): string | null {
        return this.Get('OtherCity');
    }
    set OtherCity(value: string | null) {
        this.Set('OtherCity', value);
    }

    /**
    * * Field Name: OtherState
    * * Display Name: Other State
    * * SQL Data Type: nvarchar(MAX)
    */
    get OtherState(): string | null {
        return this.Get('OtherState');
    }
    set OtherState(value: string | null) {
        this.Set('OtherState', value);
    }

    /**
    * * Field Name: OtherPostalCode
    * * Display Name: Other Postal Code
    * * SQL Data Type: nvarchar(MAX)
    */
    get OtherPostalCode(): string | null {
        return this.Get('OtherPostalCode');
    }
    set OtherPostalCode(value: string | null) {
        this.Set('OtherPostalCode', value);
    }

    /**
    * * Field Name: OtherCountry
    * * Display Name: Other Country
    * * SQL Data Type: nvarchar(MAX)
    */
    get OtherCountry(): string | null {
        return this.Get('OtherCountry');
    }
    set OtherCountry(value: string | null) {
        this.Set('OtherCountry', value);
    }

    /**
    * * Field Name: OtherLatitude
    * * Display Name: Other Latitude
    * * SQL Data Type: decimal(18, 15)
    */
    get OtherLatitude(): number | null {
        return this.Get('OtherLatitude');
    }
    set OtherLatitude(value: number | null) {
        this.Set('OtherLatitude', value);
    }

    /**
    * * Field Name: OtherLongitude
    * * Display Name: Other Longitude
    * * SQL Data Type: decimal(18, 15)
    */
    get OtherLongitude(): number | null {
        return this.Get('OtherLongitude');
    }
    set OtherLongitude(value: number | null) {
        this.Set('OtherLongitude', value);
    }

    /**
    * * Field Name: OtherGeocodeAccuracy
    * * Display Name: Other Geocode Accuracy
    * * SQL Data Type: nvarchar(MAX)
    */
    get OtherGeocodeAccuracy(): string | null {
        return this.Get('OtherGeocodeAccuracy');
    }
    set OtherGeocodeAccuracy(value: string | null) {
        this.Set('OtherGeocodeAccuracy', value);
    }

    /**
    * * Field Name: MailingStreet
    * * Display Name: Mailing Street
    * * SQL Data Type: nvarchar(MAX)
    */
    get MailingStreet(): string | null {
        return this.Get('MailingStreet');
    }
    set MailingStreet(value: string | null) {
        this.Set('MailingStreet', value);
    }

    /**
    * * Field Name: MailingCity
    * * Display Name: Mailing City
    * * SQL Data Type: nvarchar(MAX)
    */
    get MailingCity(): string | null {
        return this.Get('MailingCity');
    }
    set MailingCity(value: string | null) {
        this.Set('MailingCity', value);
    }

    /**
    * * Field Name: MailingState
    * * Display Name: Mailing State
    * * SQL Data Type: nvarchar(MAX)
    */
    get MailingState(): string | null {
        return this.Get('MailingState');
    }
    set MailingState(value: string | null) {
        this.Set('MailingState', value);
    }

    /**
    * * Field Name: MailingPostalCode
    * * Display Name: Mailing Postal Code
    * * SQL Data Type: nvarchar(MAX)
    */
    get MailingPostalCode(): string | null {
        return this.Get('MailingPostalCode');
    }
    set MailingPostalCode(value: string | null) {
        this.Set('MailingPostalCode', value);
    }

    /**
    * * Field Name: MailingCountry
    * * Display Name: Mailing Country
    * * SQL Data Type: nvarchar(MAX)
    */
    get MailingCountry(): string | null {
        return this.Get('MailingCountry');
    }
    set MailingCountry(value: string | null) {
        this.Set('MailingCountry', value);
    }

    /**
    * * Field Name: MailingLatitude
    * * Display Name: Mailing Latitude
    * * SQL Data Type: decimal(18, 15)
    */
    get MailingLatitude(): number | null {
        return this.Get('MailingLatitude');
    }
    set MailingLatitude(value: number | null) {
        this.Set('MailingLatitude', value);
    }

    /**
    * * Field Name: MailingLongitude
    * * Display Name: Mailing Longitude
    * * SQL Data Type: decimal(18, 15)
    */
    get MailingLongitude(): number | null {
        return this.Get('MailingLongitude');
    }
    set MailingLongitude(value: number | null) {
        this.Set('MailingLongitude', value);
    }

    /**
    * * Field Name: MailingGeocodeAccuracy
    * * Display Name: Mailing Geocode Accuracy
    * * SQL Data Type: nvarchar(MAX)
    */
    get MailingGeocodeAccuracy(): string | null {
        return this.Get('MailingGeocodeAccuracy');
    }
    set MailingGeocodeAccuracy(value: string | null) {
        this.Set('MailingGeocodeAccuracy', value);
    }

    /**
    * * Field Name: Phone
    * * Display Name: Phone
    * * SQL Data Type: nvarchar(MAX)
    */
    get Phone(): string | null {
        return this.Get('Phone');
    }
    set Phone(value: string | null) {
        this.Set('Phone', value);
    }

    /**
    * * Field Name: Fax
    * * Display Name: Fax
    * * SQL Data Type: nvarchar(MAX)
    */
    get Fax(): string | null {
        return this.Get('Fax');
    }
    set Fax(value: string | null) {
        this.Set('Fax', value);
    }

    /**
    * * Field Name: MobilePhone
    * * Display Name: Mobile Phone
    * * SQL Data Type: nvarchar(MAX)
    */
    get MobilePhone(): string | null {
        return this.Get('MobilePhone');
    }
    set MobilePhone(value: string | null) {
        this.Set('MobilePhone', value);
    }

    /**
    * * Field Name: HomePhone
    * * Display Name: Home Phone
    * * SQL Data Type: nvarchar(MAX)
    */
    get HomePhone(): string | null {
        return this.Get('HomePhone');
    }
    set HomePhone(value: string | null) {
        this.Set('HomePhone', value);
    }

    /**
    * * Field Name: OtherPhone
    * * Display Name: Other Phone
    * * SQL Data Type: nvarchar(MAX)
    */
    get OtherPhone(): string | null {
        return this.Get('OtherPhone');
    }
    set OtherPhone(value: string | null) {
        this.Set('OtherPhone', value);
    }

    /**
    * * Field Name: AssistantPhone
    * * Display Name: Assistant Phone
    * * SQL Data Type: nvarchar(MAX)
    */
    get AssistantPhone(): string | null {
        return this.Get('AssistantPhone');
    }
    set AssistantPhone(value: string | null) {
        this.Set('AssistantPhone', value);
    }

    /**
    * * Field Name: ReportsToId
    * * Display Name: Reports To Id
    * * SQL Data Type: nvarchar(MAX)
    */
    get ReportsToId(): string | null {
        return this.Get('ReportsToId');
    }
    set ReportsToId(value: string | null) {
        this.Set('ReportsToId', value);
    }

    /**
    * * Field Name: Email
    * * Display Name: Email
    * * SQL Data Type: nvarchar(MAX)
    */
    get Email(): string | null {
        return this.Get('Email');
    }
    set Email(value: string | null) {
        this.Set('Email', value);
    }

    /**
    * * Field Name: Title
    * * Display Name: Title
    * * SQL Data Type: nvarchar(MAX)
    */
    get Title(): string | null {
        return this.Get('Title');
    }
    set Title(value: string | null) {
        this.Set('Title', value);
    }

    /**
    * * Field Name: Department
    * * Display Name: Department
    * * SQL Data Type: nvarchar(MAX)
    */
    get Department(): string | null {
        return this.Get('Department');
    }
    set Department(value: string | null) {
        this.Set('Department', value);
    }

    /**
    * * Field Name: AssistantName
    * * Display Name: Assistant Name
    * * SQL Data Type: nvarchar(MAX)
    */
    get AssistantName(): string | null {
        return this.Get('AssistantName');
    }
    set AssistantName(value: string | null) {
        this.Set('AssistantName', value);
    }

    /**
    * * Field Name: LeadSource
    * * Display Name: Lead Source
    * * SQL Data Type: nvarchar(MAX)
    */
    get LeadSource(): string | null {
        return this.Get('LeadSource');
    }
    set LeadSource(value: string | null) {
        this.Set('LeadSource', value);
    }

    /**
    * * Field Name: Birthdate
    * * Display Name: Birthdate
    * * SQL Data Type: datetimeoffset
    */
    get Birthdate(): Date | null {
        return this.Get('Birthdate');
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(MAX)
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: OwnerId
    * * Display Name: Owner Id
    * * SQL Data Type: nvarchar(MAX)
    */
    get OwnerId(): string | null {
        return this.Get('OwnerId');
    }
    set OwnerId(value: string | null) {
        this.Set('OwnerId', value);
    }

    /**
    * * Field Name: HasOptedOutOfEmail
    * * Display Name: Has Opted Out Of Email
    * * SQL Data Type: bit
    */
    get HasOptedOutOfEmail(): boolean | null {
        return this.Get('HasOptedOutOfEmail');
    }
    set HasOptedOutOfEmail(value: boolean | null) {
        this.Set('HasOptedOutOfEmail', value);
    }

    /**
    * * Field Name: HasOptedOutOfFax
    * * Display Name: Has Opted Out Of Fax
    * * SQL Data Type: bit
    */
    get HasOptedOutOfFax(): boolean | null {
        return this.Get('HasOptedOutOfFax');
    }
    set HasOptedOutOfFax(value: boolean | null) {
        this.Set('HasOptedOutOfFax', value);
    }

    /**
    * * Field Name: DoNotCall
    * * Display Name: Do Not Call
    * * SQL Data Type: bit
    */
    get DoNotCall(): boolean | null {
        return this.Get('DoNotCall');
    }
    set DoNotCall(value: boolean | null) {
        this.Set('DoNotCall', value);
    }

    /**
    * * Field Name: CreatedById
    * * Display Name: Created By Id
    * * SQL Data Type: nvarchar(MAX)
    */
    get CreatedById(): string | null {
        return this.Get('CreatedById');
    }
    set CreatedById(value: string | null) {
        this.Set('CreatedById', value);
    }

    /**
    * * Field Name: LastModifiedDate
    * * Display Name: Last Modified Date
    * * SQL Data Type: datetimeoffset
    */
    get LastModifiedDate(): Date | null {
        return this.Get('LastModifiedDate');
    }

    /**
    * * Field Name: LastModifiedById
    * * Display Name: Last Modified By Id
    * * SQL Data Type: nvarchar(MAX)
    */
    get LastModifiedById(): string | null {
        return this.Get('LastModifiedById');
    }
    set LastModifiedById(value: string | null) {
        this.Set('LastModifiedById', value);
    }

    /**
    * * Field Name: SystemModstamp
    * * Display Name: System Modstamp
    * * SQL Data Type: datetimeoffset
    */
    get SystemModstamp(): Date | null {
        return this.Get('SystemModstamp');
    }

    /**
    * * Field Name: LastActivityDate
    * * Display Name: Last Activity Date
    * * SQL Data Type: datetimeoffset
    */
    get LastActivityDate(): Date | null {
        return this.Get('LastActivityDate');
    }

    /**
    * * Field Name: LastCURequestDate
    * * Display Name: Last CURequest Date
    * * SQL Data Type: datetimeoffset
    */
    get LastCURequestDate(): Date | null {
        return this.Get('LastCURequestDate');
    }

    /**
    * * Field Name: LastCUUpdateDate
    * * Display Name: Last CUUpdate Date
    * * SQL Data Type: datetimeoffset
    */
    get LastCUUpdateDate(): Date | null {
        return this.Get('LastCUUpdateDate');
    }

    /**
    * * Field Name: LastViewedDate
    * * Display Name: Last Viewed Date
    * * SQL Data Type: datetimeoffset
    */
    get LastViewedDate(): Date | null {
        return this.Get('LastViewedDate');
    }

    /**
    * * Field Name: LastReferencedDate
    * * Display Name: Last Referenced Date
    * * SQL Data Type: datetimeoffset
    */
    get LastReferencedDate(): Date | null {
        return this.Get('LastReferencedDate');
    }

    /**
    * * Field Name: EmailBouncedReason
    * * Display Name: Email Bounced Reason
    * * SQL Data Type: nvarchar(MAX)
    */
    get EmailBouncedReason(): string | null {
        return this.Get('EmailBouncedReason');
    }
    set EmailBouncedReason(value: string | null) {
        this.Set('EmailBouncedReason', value);
    }

    /**
    * * Field Name: EmailBouncedDate
    * * Display Name: Email Bounced Date
    * * SQL Data Type: datetimeoffset
    */
    get EmailBouncedDate(): Date | null {
        return this.Get('EmailBouncedDate');
    }

    /**
    * * Field Name: IsEmailBounced
    * * Display Name: Is Email Bounced
    * * SQL Data Type: bit
    */
    get IsEmailBounced(): boolean | null {
        return this.Get('IsEmailBounced');
    }
    set IsEmailBounced(value: boolean | null) {
        this.Set('IsEmailBounced', value);
    }

    /**
    * * Field Name: PhotoUrl
    * * Display Name: Photo Url
    * * SQL Data Type: nvarchar(MAX)
    */
    get PhotoUrl(): string | null {
        return this.Get('PhotoUrl');
    }
    set PhotoUrl(value: string | null) {
        this.Set('PhotoUrl', value);
    }

    /**
    * * Field Name: Jigsaw
    * * Display Name: Jigsaw
    * * SQL Data Type: nvarchar(MAX)
    */
    get Jigsaw(): string | null {
        return this.Get('Jigsaw');
    }
    set Jigsaw(value: string | null) {
        this.Set('Jigsaw', value);
    }

    /**
    * * Field Name: JigsawContactId
    * * Display Name: Jigsaw Contact Id
    * * SQL Data Type: nvarchar(MAX)
    */
    get JigsawContactId(): string | null {
        return this.Get('JigsawContactId');
    }
    set JigsawContactId(value: string | null) {
        this.Set('JigsawContactId', value);
    }

    /**
    * * Field Name: IndividualId
    * * Display Name: Individual Id
    * * SQL Data Type: nvarchar(MAX)
    */
    get IndividualId(): string | null {
        return this.Get('IndividualId');
    }
    set IndividualId(value: string | null) {
        this.Set('IndividualId', value);
    }

    /**
    * * Field Name: NU__ExternalID__c
    * * Display Name: NU__External ID__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__ExternalID__c(): string | null {
        return this.Get('NU__ExternalID__c');
    }
    set NU__ExternalID__c(value: string | null) {
        this.Set('NU__ExternalID__c', value);
    }

    /**
    * * Field Name: ET_Field_Rep__c
    * * Display Name: ET Field Rep
    * * SQL Data Type: nvarchar(MAX)
    */
    get ET_Field_Rep__c(): string | null {
        return this.Get('ET_Field_Rep__c');
    }
    set ET_Field_Rep__c(value: string | null) {
        this.Set('ET_Field_Rep__c', value);
    }

    /**
    * * Field Name: Deskcom__twitter_username__c
    * * Display Name: Deskcom __twitter _username __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Deskcom__twitter_username__c(): string | null {
        return this.Get('Deskcom__twitter_username__c');
    }
    set Deskcom__twitter_username__c(value: string | null) {
        this.Set('Deskcom__twitter_username__c', value);
    }

    /**
    * * Field Name: e4sf__Engage_Address_City__c
    * * Display Name: e 4sf __Engage _Address _City __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get e4sf__Engage_Address_City__c(): string | null {
        return this.Get('e4sf__Engage_Address_City__c');
    }
    set e4sf__Engage_Address_City__c(value: string | null) {
        this.Set('e4sf__Engage_Address_City__c', value);
    }

    /**
    * * Field Name: e4sf__Engage_Address_Country__c
    * * Display Name: e 4sf __Engage _Address _Country __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get e4sf__Engage_Address_Country__c(): string | null {
        return this.Get('e4sf__Engage_Address_Country__c');
    }
    set e4sf__Engage_Address_Country__c(value: string | null) {
        this.Set('e4sf__Engage_Address_Country__c', value);
    }

    /**
    * * Field Name: e4sf__Engage_Address_PostalCode__c
    * * Display Name: e 4sf __Engage _Address _Postal Code __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get e4sf__Engage_Address_PostalCode__c(): string | null {
        return this.Get('e4sf__Engage_Address_PostalCode__c');
    }
    set e4sf__Engage_Address_PostalCode__c(value: string | null) {
        this.Set('e4sf__Engage_Address_PostalCode__c', value);
    }

    /**
    * * Field Name: e4sf__Engage_Address_State__c
    * * Display Name: e 4sf __Engage _Address _State __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get e4sf__Engage_Address_State__c(): string | null {
        return this.Get('e4sf__Engage_Address_State__c');
    }
    set e4sf__Engage_Address_State__c(value: string | null) {
        this.Set('e4sf__Engage_Address_State__c', value);
    }

    /**
    * * Field Name: e4sf__Engage_Address_Street__c
    * * Display Name: e 4sf __Engage _Address _Street __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get e4sf__Engage_Address_Street__c(): string | null {
        return this.Get('e4sf__Engage_Address_Street__c');
    }
    set e4sf__Engage_Address_Street__c(value: string | null) {
        this.Set('e4sf__Engage_Address_Street__c', value);
    }

    /**
    * * Field Name: e4sf__Engage_Batch_Id__c
    * * Display Name: e 4sf __Engage _Batch _Id __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get e4sf__Engage_Batch_Id__c(): string | null {
        return this.Get('e4sf__Engage_Batch_Id__c');
    }
    set e4sf__Engage_Batch_Id__c(value: string | null) {
        this.Set('e4sf__Engage_Batch_Id__c', value);
    }

    /**
    * * Field Name: e4sf__Engage_Date_Last_Sync__c
    * * Display Name: e 4sf __Engage _Date _Last _Sync __c
    * * SQL Data Type: datetimeoffset
    */
    get e4sf__Engage_Date_Last_Sync__c(): Date | null {
        return this.Get('e4sf__Engage_Date_Last_Sync__c');
    }

    /**
    * * Field Name: e4sf__Engage_Ext_Id__c
    * * Display Name: e 4sf __Engage _Ext _Id __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get e4sf__Engage_Ext_Id__c(): string | null {
        return this.Get('e4sf__Engage_Ext_Id__c');
    }
    set e4sf__Engage_Ext_Id__c(value: string | null) {
        this.Set('e4sf__Engage_Ext_Id__c', value);
    }

    /**
    * * Field Name: e4sf__Engage_Federal_District_Lower_Chamber__c
    * * Display Name: e 4sf __Engage _Federal _District _Lower _Chamber __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get e4sf__Engage_Federal_District_Lower_Chamber__c(): string | null {
        return this.Get('e4sf__Engage_Federal_District_Lower_Chamber__c');
    }
    set e4sf__Engage_Federal_District_Lower_Chamber__c(value: string | null) {
        this.Set('e4sf__Engage_Federal_District_Lower_Chamber__c', value);
    }

    /**
    * * Field Name: e4sf__Engage_Federal_District_Upper_Chamber__c
    * * Display Name: e 4sf __Engage _Federal _District _Upper _Chamber __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get e4sf__Engage_Federal_District_Upper_Chamber__c(): string | null {
        return this.Get('e4sf__Engage_Federal_District_Upper_Chamber__c');
    }
    set e4sf__Engage_Federal_District_Upper_Chamber__c(value: string | null) {
        this.Set('e4sf__Engage_Federal_District_Upper_Chamber__c', value);
    }

    /**
    * * Field Name: e4sf__Engage_Is_Advocate__c
    * * Display Name: e 4sf __Engage _Is _Advocate __c
    * * SQL Data Type: bit
    */
    get e4sf__Engage_Is_Advocate__c(): boolean | null {
        return this.Get('e4sf__Engage_Is_Advocate__c');
    }
    set e4sf__Engage_Is_Advocate__c(value: boolean | null) {
        this.Set('e4sf__Engage_Is_Advocate__c', value);
    }

    /**
    * * Field Name: e4sf__Engage_Never_Sync_To_Engage__c
    * * Display Name: e 4sf __Engage _Never _Sync _To _Engage __c
    * * SQL Data Type: bit
    */
    get e4sf__Engage_Never_Sync_To_Engage__c(): boolean | null {
        return this.Get('e4sf__Engage_Never_Sync_To_Engage__c');
    }
    set e4sf__Engage_Never_Sync_To_Engage__c(value: boolean | null) {
        this.Set('e4sf__Engage_Never_Sync_To_Engage__c', value);
    }

    /**
    * * Field Name: e4sf__Engage_Opt_Out__c
    * * Display Name: e 4sf __Engage _Opt _Out __c
    * * SQL Data Type: bit
    */
    get e4sf__Engage_Opt_Out__c(): boolean | null {
        return this.Get('e4sf__Engage_Opt_Out__c');
    }
    set e4sf__Engage_Opt_Out__c(value: boolean | null) {
        this.Set('e4sf__Engage_Opt_Out__c', value);
    }

    /**
    * * Field Name: e4sf__Engage_Phone__c
    * * Display Name: e 4sf __Engage _Phone __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get e4sf__Engage_Phone__c(): string | null {
        return this.Get('e4sf__Engage_Phone__c');
    }
    set e4sf__Engage_Phone__c(value: string | null) {
        this.Set('e4sf__Engage_Phone__c', value);
    }

    /**
    * * Field Name: e4sf__Engage_State_District_Lower_Chamber__c
    * * Display Name: e 4sf __Engage _State _District _Lower _Chamber __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get e4sf__Engage_State_District_Lower_Chamber__c(): string | null {
        return this.Get('e4sf__Engage_State_District_Lower_Chamber__c');
    }
    set e4sf__Engage_State_District_Lower_Chamber__c(value: string | null) {
        this.Set('e4sf__Engage_State_District_Lower_Chamber__c', value);
    }

    /**
    * * Field Name: e4sf__Engage_State_District_Upper_Chamber__c
    * * Display Name: e 4sf __Engage _State _District _Upper _Chamber __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get e4sf__Engage_State_District_Upper_Chamber__c(): string | null {
        return this.Get('e4sf__Engage_State_District_Upper_Chamber__c');
    }
    set e4sf__Engage_State_District_Upper_Chamber__c(value: string | null) {
        this.Set('e4sf__Engage_State_District_Upper_Chamber__c', value);
    }

    /**
    * * Field Name: geopointe__Geocode__c
    * * Display Name: geopointe __Geocode __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get geopointe__Geocode__c(): string | null {
        return this.Get('geopointe__Geocode__c');
    }
    set geopointe__Geocode__c(value: string | null) {
        this.Set('geopointe__Geocode__c', value);
    }

    /**
    * * Field Name: rrpu__Alert_Message__c
    * * Display Name: rrpu __Alert _Message __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get rrpu__Alert_Message__c(): string | null {
        return this.Get('rrpu__Alert_Message__c');
    }
    set rrpu__Alert_Message__c(value: string | null) {
        this.Set('rrpu__Alert_Message__c', value);
    }

    /**
    * * Field Name: CloudingoAgent__CES__c
    * * Display Name: Cloudingo Agent __CES__c
    * * SQL Data Type: decimal(18, 0)
    */
    get CloudingoAgent__CES__c(): number | null {
        return this.Get('CloudingoAgent__CES__c');
    }
    set CloudingoAgent__CES__c(value: number | null) {
        this.Set('CloudingoAgent__CES__c', value);
    }

    /**
    * * Field Name: CloudingoAgent__MAR__c
    * * Display Name: Cloudingo Agent __MAR__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get CloudingoAgent__MAR__c(): string | null {
        return this.Get('CloudingoAgent__MAR__c');
    }
    set CloudingoAgent__MAR__c(value: string | null) {
        this.Set('CloudingoAgent__MAR__c', value);
    }

    /**
    * * Field Name: CloudingoAgent__MAS__c
    * * Display Name: Cloudingo Agent __MAS__c
    * * SQL Data Type: decimal(18, 0)
    */
    get CloudingoAgent__MAS__c(): number | null {
        return this.Get('CloudingoAgent__MAS__c');
    }
    set CloudingoAgent__MAS__c(value: number | null) {
        this.Set('CloudingoAgent__MAS__c', value);
    }

    /**
    * * Field Name: CloudingoAgent__MAV__c
    * * Display Name: Cloudingo Agent __MAV__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get CloudingoAgent__MAV__c(): string | null {
        return this.Get('CloudingoAgent__MAV__c');
    }
    set CloudingoAgent__MAV__c(value: string | null) {
        this.Set('CloudingoAgent__MAV__c', value);
    }

    /**
    * * Field Name: CloudingoAgent__MRDI__c
    * * Display Name: Cloudingo Agent __MRDI__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get CloudingoAgent__MRDI__c(): string | null {
        return this.Get('CloudingoAgent__MRDI__c');
    }
    set CloudingoAgent__MRDI__c(value: string | null) {
        this.Set('CloudingoAgent__MRDI__c', value);
    }

    /**
    * * Field Name: CloudingoAgent__MTZ__c
    * * Display Name: Cloudingo Agent __MTZ__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get CloudingoAgent__MTZ__c(): string | null {
        return this.Get('CloudingoAgent__MTZ__c');
    }
    set CloudingoAgent__MTZ__c(value: string | null) {
        this.Set('CloudingoAgent__MTZ__c', value);
    }

    /**
    * * Field Name: CloudingoAgent__OAR__c
    * * Display Name: Cloudingo Agent __OAR__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get CloudingoAgent__OAR__c(): string | null {
        return this.Get('CloudingoAgent__OAR__c');
    }
    set CloudingoAgent__OAR__c(value: string | null) {
        this.Set('CloudingoAgent__OAR__c', value);
    }

    /**
    * * Field Name: CloudingoAgent__OAS__c
    * * Display Name: Cloudingo Agent __OAS__c
    * * SQL Data Type: decimal(18, 0)
    */
    get CloudingoAgent__OAS__c(): number | null {
        return this.Get('CloudingoAgent__OAS__c');
    }
    set CloudingoAgent__OAS__c(value: number | null) {
        this.Set('CloudingoAgent__OAS__c', value);
    }

    /**
    * * Field Name: CloudingoAgent__OAV__c
    * * Display Name: Cloudingo Agent __OAV__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get CloudingoAgent__OAV__c(): string | null {
        return this.Get('CloudingoAgent__OAV__c');
    }
    set CloudingoAgent__OAV__c(value: string | null) {
        this.Set('CloudingoAgent__OAV__c', value);
    }

    /**
    * * Field Name: CloudingoAgent__ORDI__c
    * * Display Name: Cloudingo Agent __ORDI__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get CloudingoAgent__ORDI__c(): string | null {
        return this.Get('CloudingoAgent__ORDI__c');
    }
    set CloudingoAgent__ORDI__c(value: string | null) {
        this.Set('CloudingoAgent__ORDI__c', value);
    }

    /**
    * * Field Name: CloudingoAgent__OTZ__c
    * * Display Name: Cloudingo Agent __OTZ__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get CloudingoAgent__OTZ__c(): string | null {
        return this.Get('CloudingoAgent__OTZ__c');
    }
    set CloudingoAgent__OTZ__c(value: string | null) {
        this.Set('CloudingoAgent__OTZ__c', value);
    }

    /**
    * * Field Name: NC_DPP__Anonymize__c
    * * Display Name: NC_DPP__Anonymize __c
    * * SQL Data Type: bit
    */
    get NC_DPP__Anonymize__c(): boolean | null {
        return this.Get('NC_DPP__Anonymize__c');
    }
    set NC_DPP__Anonymize__c(value: boolean | null) {
        this.Set('NC_DPP__Anonymize__c', value);
    }

    /**
    * * Field Name: NC_DPP__Consented__c
    * * Display Name: NC_DPP__Consented __c
    * * SQL Data Type: bit
    */
    get NC_DPP__Consented__c(): boolean | null {
        return this.Get('NC_DPP__Consented__c');
    }
    set NC_DPP__Consented__c(value: boolean | null) {
        this.Set('NC_DPP__Consented__c', value);
    }

    /**
    * * Field Name: NC_DPP__LastConsentedDate__c
    * * Display Name: NC_DPP__Last Consented Date __c
    * * SQL Data Type: datetimeoffset
    */
    get NC_DPP__LastConsentedDate__c(): Date | null {
        return this.Get('NC_DPP__LastConsentedDate__c');
    }

    /**
    * * Field Name: NU__Biography__c
    * * Display Name: NU__Biography __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Biography__c(): string | null {
        return this.Get('NU__Biography__c');
    }
    set NU__Biography__c(value: string | null) {
        this.Set('NU__Biography__c', value);
    }

    /**
    * * Field Name: NU__Degrees__c
    * * Display Name: NU__Degrees __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Degrees__c(): string | null {
        return this.Get('NU__Degrees__c');
    }
    set NU__Degrees__c(value: string | null) {
        this.Set('NU__Degrees__c', value);
    }

    /**
    * * Field Name: NU__DoctoralInstitution__c
    * * Display Name: NU__Doctoral Institution __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__DoctoralInstitution__c(): string | null {
        return this.Get('NU__DoctoralInstitution__c');
    }
    set NU__DoctoralInstitution__c(value: string | null) {
        this.Set('NU__DoctoralInstitution__c', value);
    }

    /**
    * * Field Name: NU__Expertise__c
    * * Display Name: NU__Expertise __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Expertise__c(): string | null {
        return this.Get('NU__Expertise__c');
    }
    set NU__Expertise__c(value: string | null) {
        this.Set('NU__Expertise__c', value);
    }

    /**
    * * Field Name: NU__GraduateInstitution__c
    * * Display Name: NU__Graduate Institution __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__GraduateInstitution__c(): string | null {
        return this.Get('NU__GraduateInstitution__c');
    }
    set NU__GraduateInstitution__c(value: string | null) {
        this.Set('NU__GraduateInstitution__c', value);
    }

    /**
    * * Field Name: NU__Interests__c
    * * Display Name: NU__Interests __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Interests__c(): string | null {
        return this.Get('NU__Interests__c');
    }
    set NU__Interests__c(value: string | null) {
        this.Set('NU__Interests__c', value);
    }

    /**
    * * Field Name: NU__UndergraduateInstitution__c
    * * Display Name: NU__Undergraduate Institution __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__UndergraduateInstitution__c(): string | null {
        return this.Get('NU__UndergraduateInstitution__c');
    }
    set NU__UndergraduateInstitution__c(value: string | null) {
        this.Set('NU__UndergraduateInstitution__c', value);
    }

    /**
    * * Field Name: et4ae5__HasOptedOutOfMobile__c
    * * Display Name: et 4ae 5__Has Opted Out Of Mobile __c
    * * SQL Data Type: bit
    */
    get et4ae5__HasOptedOutOfMobile__c(): boolean | null {
        return this.Get('et4ae5__HasOptedOutOfMobile__c');
    }
    set et4ae5__HasOptedOutOfMobile__c(value: boolean | null) {
        this.Set('et4ae5__HasOptedOutOfMobile__c', value);
    }

    /**
    * * Field Name: et4ae5__Mobile_Country_Code__c
    * * Display Name: et 4ae 5__Mobile _Country _Code __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get et4ae5__Mobile_Country_Code__c(): string | null {
        return this.Get('et4ae5__Mobile_Country_Code__c');
    }
    set et4ae5__Mobile_Country_Code__c(value: string | null) {
        this.Set('et4ae5__Mobile_Country_Code__c', value);
    }

    /**
    * * Field Name: qualtrics__Informed_Consent_Date__c
    * * Display Name: qualtrics __Informed _Consent _Date __c
    * * SQL Data Type: datetimeoffset
    */
    get qualtrics__Informed_Consent_Date__c(): Date | null {
        return this.Get('qualtrics__Informed_Consent_Date__c');
    }

    /**
    * * Field Name: qualtrics__Informed_Consent__c
    * * Display Name: qualtrics __Informed _Consent __c
    * * SQL Data Type: bit
    */
    get qualtrics__Informed_Consent__c(): boolean | null {
        return this.Get('qualtrics__Informed_Consent__c');
    }
    set qualtrics__Informed_Consent__c(value: boolean | null) {
        this.Set('qualtrics__Informed_Consent__c', value);
    }

    /**
    * * Field Name: qualtrics__Last_Survey_Invitation__c
    * * Display Name: qualtrics __Last _Survey _Invitation __c
    * * SQL Data Type: datetimeoffset
    */
    get qualtrics__Last_Survey_Invitation__c(): Date | null {
        return this.Get('qualtrics__Last_Survey_Invitation__c');
    }

    /**
    * * Field Name: qualtrics__Last_Survey_Response__c
    * * Display Name: qualtrics __Last _Survey _Response __c
    * * SQL Data Type: datetimeoffset
    */
    get qualtrics__Last_Survey_Response__c(): Date | null {
        return this.Get('qualtrics__Last_Survey_Response__c');
    }

    /**
    * * Field Name: qualtrics__Net_Promoter_Score__c
    * * Display Name: qualtrics __Net _Promoter _Score __c
    * * SQL Data Type: decimal(2, 0)
    */
    get qualtrics__Net_Promoter_Score__c(): number | null {
        return this.Get('qualtrics__Net_Promoter_Score__c');
    }
    set qualtrics__Net_Promoter_Score__c(value: number | null) {
        this.Set('qualtrics__Net_Promoter_Score__c', value);
    }

    /**
    * * Field Name: is_eligible_for_SFMC_sync__c
    * * Display Name: is _eligible _for _SFMC_sync __c
    * * SQL Data Type: bit
    */
    get is_eligible_for_SFMC_sync__c(): boolean | null {
        return this.Get('is_eligible_for_SFMC_sync__c');
    }
    set is_eligible_for_SFMC_sync__c(value: boolean | null) {
        this.Set('is_eligible_for_SFMC_sync__c', value);
    }

    /**
    * * Field Name: Long_Form_ID__c
    * * Display Name: Long _Form _ID__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Long_Form_ID__c(): string | null {
        return this.Get('Long_Form_ID__c');
    }
    set Long_Form_ID__c(value: string | null) {
        this.Set('Long_Form_ID__c', value);
    }

    /**
    * * Field Name: Institution__c
    * * Display Name: Institution
    * * SQL Data Type: nvarchar(MAX)
    */
    get Institution__c(): string | null {
        return this.Get('Institution__c');
    }
    set Institution__c(value: string | null) {
        this.Set('Institution__c', value);
    }

    /**
    * * Field Name: Member__c
    * * Display Name: Member
    * * SQL Data Type: nvarchar(MAX)
    */
    get Member__c(): string | null {
        return this.Get('Member__c');
    }
    set Member__c(value: string | null) {
        this.Set('Member__c', value);
    }

    /**
    * * Field Name: Eligible_For_SFMC_Sync__c
    * * Display Name: Eligible _For _SFMC_Sync __c
    * * SQL Data Type: bit
    */
    get Eligible_For_SFMC_Sync__c(): boolean | null {
        return this.Get('Eligible_For_SFMC_Sync__c');
    }
    set Eligible_For_SFMC_Sync__c(value: boolean | null) {
        this.Set('Eligible_For_SFMC_Sync__c', value);
    }

    /**
    * * Field Name: DESKSCMT__Desk_Customer_Id__c
    * * Display Name: DESKSCMT__Desk _Customer _Id __c
    * * SQL Data Type: decimal(18, 0)
    */
    get DESKSCMT__Desk_Customer_Id__c(): number | null {
        return this.Get('DESKSCMT__Desk_Customer_Id__c');
    }
    set DESKSCMT__Desk_Customer_Id__c(value: number | null) {
        this.Set('DESKSCMT__Desk_Customer_Id__c', value);
    }

    /**
    * * Field Name: DESKSCMT__Desk_Migrated_Contact__c
    * * Display Name: DESKSCMT__Desk _Migrated _Contact __c
    * * SQL Data Type: bit
    */
    get DESKSCMT__Desk_Migrated_Contact__c(): boolean | null {
        return this.Get('DESKSCMT__Desk_Migrated_Contact__c');
    }
    set DESKSCMT__Desk_Migrated_Contact__c(value: boolean | null) {
        this.Set('DESKSCMT__Desk_Migrated_Contact__c', value);
    }

    /**
    * * Field Name: title__c
    * * Display Name: title __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get title__c(): string | null {
        return this.Get('title__c');
    }
    set title__c(value: string | null) {
        this.Set('title__c', value);
    }

    /**
    * * Field Name: created_at__c
    * * Display Name: created _at __c
    * * SQL Data Type: datetimeoffset
    */
    get created_at__c(): Date | null {
        return this.Get('created_at__c');
    }

    /**
    * * Field Name: updated_at__c
    * * Display Name: updated _at __c
    * * SQL Data Type: datetimeoffset
    */
    get updated_at__c(): Date | null {
        return this.Get('updated_at__c');
    }

    /**
    * * Field Name: P2A__Advocate_ID__c
    * * Display Name: P2A__Advocate _ID__c
    * * SQL Data Type: decimal(18, 0)
    */
    get P2A__Advocate_ID__c(): number | null {
        return this.Get('P2A__Advocate_ID__c');
    }
    set P2A__Advocate_ID__c(value: number | null) {
        this.Set('P2A__Advocate_ID__c', value);
    }

    /**
    * * Field Name: P2A__City_District__c
    * * Display Name: P2A__City _District __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get P2A__City_District__c(): string | null {
        return this.Get('P2A__City_District__c');
    }
    set P2A__City_District__c(value: string | null) {
        this.Set('P2A__City_District__c', value);
    }

    /**
    * * Field Name: P2A__County__c
    * * Display Name: P2A__County __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get P2A__County__c(): string | null {
        return this.Get('P2A__County__c');
    }
    set P2A__County__c(value: string | null) {
        this.Set('P2A__County__c', value);
    }

    /**
    * * Field Name: P2A__Federal_House_District__c
    * * Display Name: P2A__Federal _House _District __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get P2A__Federal_House_District__c(): string | null {
        return this.Get('P2A__Federal_House_District__c');
    }
    set P2A__Federal_House_District__c(value: string | null) {
        this.Set('P2A__Federal_House_District__c', value);
    }

    /**
    * * Field Name: P2A__Phone2Action_Email_Optin__c
    * * Display Name: P2A__Phone 2Action _Email _Optin __c
    * * SQL Data Type: bit
    */
    get P2A__Phone2Action_Email_Optin__c(): boolean | null {
        return this.Get('P2A__Phone2Action_Email_Optin__c');
    }
    set P2A__Phone2Action_Email_Optin__c(value: boolean | null) {
        this.Set('P2A__Phone2Action_Email_Optin__c', value);
    }

    /**
    * * Field Name: P2A__State_House_District__c
    * * Display Name: P2A__State _House _District __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get P2A__State_House_District__c(): string | null {
        return this.Get('P2A__State_House_District__c');
    }
    set P2A__State_House_District__c(value: string | null) {
        this.Set('P2A__State_House_District__c', value);
    }

    /**
    * * Field Name: P2A__State_Senate_District__c
    * * Display Name: P2A__State _Senate _District __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get P2A__State_Senate_District__c(): string | null {
        return this.Get('P2A__State_Senate_District__c');
    }
    set P2A__State_Senate_District__c(value: string | null) {
        this.Set('P2A__State_Senate_District__c', value);
    }

    /**
    * * Field Name: P2A__Synced__c
    * * Display Name: P2A__Synced __c
    * * SQL Data Type: bit
    */
    get P2A__Synced__c(): boolean | null {
        return this.Get('P2A__Synced__c');
    }
    set P2A__Synced__c(value: boolean | null) {
        this.Set('P2A__Synced__c', value);
    }

    /**
    * * Field Name: external_id__c
    * * Display Name: external _id __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get external_id__c(): string | null {
        return this.Get('external_id__c');
    }
    set external_id__c(value: string | null) {
        this.Set('external_id__c', value);
    }

    /**
    * * Field Name: background__c
    * * Display Name: background __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get background__c(): string | null {
        return this.Get('background__c');
    }
    set background__c(value: string | null) {
        this.Set('background__c', value);
    }

    /**
    * * Field Name: language__c
    * * Display Name: language __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get language__c(): string | null {
        return this.Get('language__c');
    }
    set language__c(value: string | null) {
        this.Set('language__c', value);
    }

    /**
    * * Field Name: access_private_portal__c
    * * Display Name: access _private _portal __c
    * * SQL Data Type: bit
    */
    get access_private_portal__c(): boolean | null {
        return this.Get('access_private_portal__c');
    }
    set access_private_portal__c(value: boolean | null) {
        this.Set('access_private_portal__c', value);
    }

    /**
    * * Field Name: access_company_cases__c
    * * Display Name: access _company _cases __c
    * * SQL Data Type: bit
    */
    get access_company_cases__c(): boolean | null {
        return this.Get('access_company_cases__c');
    }
    set access_company_cases__c(value: boolean | null) {
        this.Set('access_company_cases__c', value);
    }

    /**
    * * Field Name: Desk_Id__c
    * * Display Name: Desk _Id __c
    * * SQL Data Type: decimal(18, 0)
    */
    get Desk_Id__c(): number | null {
        return this.Get('Desk_Id__c');
    }
    set Desk_Id__c(value: number | null) {
        this.Set('Desk_Id__c', value);
    }

    /**
    * * Field Name: rcsfl__SMS_Number__c
    * * Display Name: rcsfl __SMS_Number __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get rcsfl__SMS_Number__c(): string | null {
        return this.Get('rcsfl__SMS_Number__c');
    }
    set rcsfl__SMS_Number__c(value: string | null) {
        this.Set('rcsfl__SMS_Number__c', value);
    }

    /**
    * * Field Name: rcsfl__SendSMS__c
    * * Display Name: rcsfl __Send SMS__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get rcsfl__SendSMS__c(): string | null {
        return this.Get('rcsfl__SendSMS__c');
    }
    set rcsfl__SendSMS__c(value: string | null) {
        this.Set('rcsfl__SendSMS__c', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Troubleshoot
    * * Display Name: Troubleshoot
    * * SQL Data Type: nvarchar(50)
    */
    get Troubleshoot(): string | null {
        return this.Get('Troubleshoot');
    }
    set Troubleshoot(value: string | null) {
        this.Set('Troubleshoot', value);
    }
}


/**
 * Conversation Detail -250606s - strongly typed entity sub-class
 * * Schema: betty
 * * Base Table: ConversationDetail-250606
 * * Base View: vwConversationDetail-250606s
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Conversation Detail -250606s')
export class ConversationDetail_250606Entity extends BaseEntity<ConversationDetail_250606EntityType> {
    /**
    * Loads the Conversation Detail -250606s record from the database
    * @param ID: number - primary key value to load the Conversation Detail -250606s record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ConversationDetail_250606Entity
    * @method
    * @override
    */
    public async Load(ID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: int
    */
    get ID(): number {
        return this.Get('ID');
    }
    set ID(value: number) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: ConversationID
    * * Display Name: Conversation ID
    * * SQL Data Type: int
    */
    get ConversationID(): number {
        return this.Get('ConversationID');
    }
    set ConversationID(value: number) {
        this.Set('ConversationID', value);
    }

    /**
    * * Field Name: Input
    * * Display Name: Input
    * * SQL Data Type: nvarchar(MAX)
    */
    get Input(): string {
        return this.Get('Input');
    }
    set Input(value: string) {
        this.Set('Input', value);
    }

    /**
    * * Field Name: InputEmbeddingID
    * * Display Name: Input Embedding ID
    * * SQL Data Type: nvarchar(50)
    */
    get InputEmbeddingID(): string | null {
        return this.Get('InputEmbeddingID');
    }
    set InputEmbeddingID(value: string | null) {
        this.Set('InputEmbeddingID', value);
    }

    /**
    * * Field Name: Output
    * * Display Name: Output
    * * SQL Data Type: nvarchar(MAX)
    */
    get Output(): string | null {
        return this.Get('Output');
    }
    set Output(value: string | null) {
        this.Set('Output', value);
    }

    /**
    * * Field Name: Error
    * * Display Name: Error
    * * SQL Data Type: nvarchar(MAX)
    */
    get Error(): string | null {
        return this.Get('Error');
    }
    set Error(value: string | null) {
        this.Set('Error', value);
    }

    /**
    * * Field Name: DateCreated
    * * Display Name: Date Created
    * * SQL Data Type: datetime
    */
    get DateCreated(): Date {
        return this.Get('DateCreated');
    }
    set DateCreated(value: Date) {
        this.Set('DateCreated', value);
    }

    /**
    * * Field Name: SourceIP
    * * Display Name: Source IP
    * * SQL Data Type: nvarchar(50)
    */
    get SourceIP(): string {
        return this.Get('SourceIP');
    }
    set SourceIP(value: string) {
        this.Set('SourceIP', value);
    }

    /**
    * * Field Name: mj_CreatedAt
    * * Display Name: mj _ Created At
    * * SQL Data Type: datetimeoffset
    */
    get mj_CreatedAt(): Date {
        return this.Get('mj_CreatedAt');
    }
    set mj_CreatedAt(value: Date) {
        this.Set('mj_CreatedAt', value);
    }

    /**
    * * Field Name: mj_UpdatedAt
    * * Display Name: mj _ Updated At
    * * SQL Data Type: datetimeoffset
    */
    get mj_UpdatedAt(): Date {
        return this.Get('mj_UpdatedAt');
    }
    set mj_UpdatedAt(value: Date) {
        this.Set('mj_UpdatedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Conversation Detail Contents - strongly typed entity sub-class
 * * Schema: betty
 * * Base Table: ConversationDetailContent
 * * Base View: vwConversationDetailContents
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Conversation Detail Contents')
export class ConversationDetailContentEntity extends BaseEntity<ConversationDetailContentEntityType> {
    /**
    * Loads the Conversation Detail Contents record from the database
    * @param ID: number - primary key value to load the Conversation Detail Contents record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ConversationDetailContentEntity
    * @method
    * @override
    */
    public async Load(ID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: int
    */
    get ID(): number {
        return this.Get('ID');
    }
    set ID(value: number) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: ConversationDetailID
    * * Display Name: Conversation Detail ID
    * * SQL Data Type: int
    */
    get ConversationDetailID(): number {
        return this.Get('ConversationDetailID');
    }
    set ConversationDetailID(value: number) {
        this.Set('ConversationDetailID', value);
    }

    /**
    * * Field Name: ContentID
    * * Display Name: Content ID
    * * SQL Data Type: int
    */
    get ContentID(): number {
        return this.Get('ContentID');
    }
    set ContentID(value: number) {
        this.Set('ContentID', value);
    }

    /**
    * * Field Name: Score
    * * Display Name: Score
    * * SQL Data Type: float(53)
    */
    get Score(): number {
        return this.Get('Score');
    }
    set Score(value: number) {
        this.Set('Score', value);
    }

    /**
    * * Field Name: mj_CreatedAt
    * * Display Name: mj _Created At
    * * SQL Data Type: datetime
    */
    get mj_CreatedAt(): Date {
        return this.Get('mj_CreatedAt');
    }
    set mj_CreatedAt(value: Date) {
        this.Set('mj_CreatedAt', value);
    }

    /**
    * * Field Name: mj_UpdatedAt
    * * Display Name: mj _Updated At
    * * SQL Data Type: datetime
    */
    get mj_UpdatedAt(): Date {
        return this.Get('mj_UpdatedAt');
    }
    set mj_UpdatedAt(value: Date) {
        this.Set('mj_UpdatedAt', value);
    }

    /**
    * * Field Name: Title
    * * Display Name: Title
    * * SQL Data Type: nvarchar(100)
    */
    get Title(): string | null {
        return this.Get('Title');
    }
    set Title(value: string | null) {
        this.Set('Title', value);
    }

    /**
    * * Field Name: UserLink
    * * Display Name: User Link
    * * SQL Data Type: nvarchar(250)
    */
    get UserLink(): string | null {
        return this.Get('UserLink');
    }
    set UserLink(value: string | null) {
        this.Set('UserLink', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Conversation Details__betty - strongly typed entity sub-class
 * * Schema: betty
 * * Base Table: ConversationDetail
 * * Base View: vwConversationDetails__betty
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Conversation Details__betty')
export class ConversationDetail__bettyEntity extends BaseEntity<ConversationDetail__bettyEntityType> {
    /**
    * Loads the Conversation Details__betty record from the database
    * @param ID: number - primary key value to load the Conversation Details__betty record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ConversationDetail__bettyEntity
    * @method
    * @override
    */
    public async Load(ID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: int
    */
    get ID(): number {
        return this.Get('ID');
    }
    set ID(value: number) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: ConversationID
    * * Display Name: Conversation ID
    * * SQL Data Type: int
    */
    get ConversationID(): number {
        return this.Get('ConversationID');
    }
    set ConversationID(value: number) {
        this.Set('ConversationID', value);
    }

    /**
    * * Field Name: Input
    * * Display Name: Input
    * * SQL Data Type: nvarchar(MAX)
    */
    get Input(): string {
        return this.Get('Input');
    }
    set Input(value: string) {
        this.Set('Input', value);
    }

    /**
    * * Field Name: InputEmbeddingID
    * * Display Name: Input Embedding ID
    * * SQL Data Type: nvarchar(50)
    */
    get InputEmbeddingID(): string | null {
        return this.Get('InputEmbeddingID');
    }
    set InputEmbeddingID(value: string | null) {
        this.Set('InputEmbeddingID', value);
    }

    /**
    * * Field Name: Output
    * * Display Name: Output
    * * SQL Data Type: nvarchar(MAX)
    */
    get Output(): string | null {
        return this.Get('Output');
    }
    set Output(value: string | null) {
        this.Set('Output', value);
    }

    /**
    * * Field Name: Error
    * * Display Name: Error
    * * SQL Data Type: nvarchar(MAX)
    */
    get Error(): string | null {
        return this.Get('Error');
    }
    set Error(value: string | null) {
        this.Set('Error', value);
    }

    /**
    * * Field Name: DateCreated
    * * Display Name: Date Created
    * * SQL Data Type: datetime
    */
    get DateCreated(): Date {
        return this.Get('DateCreated');
    }
    set DateCreated(value: Date) {
        this.Set('DateCreated', value);
    }

    /**
    * * Field Name: SourceIP
    * * Display Name: Source IP
    * * SQL Data Type: nvarchar(50)
    */
    get SourceIP(): string | null {
        return this.Get('SourceIP');
    }
    set SourceIP(value: string | null) {
        this.Set('SourceIP', value);
    }

    /**
    * * Field Name: mj_CreatedAt
    * * Display Name: mj _Created At
    * * SQL Data Type: datetime
    */
    get mj_CreatedAt(): Date {
        return this.Get('mj_CreatedAt');
    }
    set mj_CreatedAt(value: Date) {
        this.Set('mj_CreatedAt', value);
    }

    /**
    * * Field Name: mj_UpdatedAt
    * * Display Name: mj _Updated At
    * * SQL Data Type: datetime
    */
    get mj_UpdatedAt(): Date {
        return this.Get('mj_UpdatedAt');
    }
    set mj_UpdatedAt(value: Date) {
        this.Set('mj_UpdatedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Conversations__betty - strongly typed entity sub-class
 * * Schema: betty
 * * Base Table: Conversation
 * * Base View: vwConversations__betty
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Conversations__betty')
export class Conversation__bettyEntity extends BaseEntity<Conversation__bettyEntityType> {
    /**
    * Loads the Conversations__betty record from the database
    * @param ID: number - primary key value to load the Conversations__betty record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof Conversation__bettyEntity
    * @method
    * @override
    */
    public async Load(ID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: int
    */
    get ID(): number {
        return this.Get('ID');
    }
    set ID(value: number) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: OrganizationID
    * * Display Name: Organization ID
    * * SQL Data Type: int
    */
    get OrganizationID(): number | null {
        return this.Get('OrganizationID');
    }
    set OrganizationID(value: number | null) {
        this.Set('OrganizationID', value);
    }

    /**
    * * Field Name: OrganizationKeyID
    * * Display Name: Organization Key ID
    * * SQL Data Type: int
    */
    get OrganizationKeyID(): number | null {
        return this.Get('OrganizationKeyID');
    }
    set OrganizationKeyID(value: number | null) {
        this.Set('OrganizationKeyID', value);
    }

    /**
    * * Field Name: UserID
    * * Display Name: User ID
    * * SQL Data Type: nvarchar(255)
    */
    get UserID(): string | null {
        return this.Get('UserID');
    }
    set UserID(value: string | null) {
        this.Set('UserID', value);
    }

    /**
    * * Field Name: DateCreated
    * * Display Name: Date Created
    * * SQL Data Type: datetime
    */
    get DateCreated(): Date | null {
        return this.Get('DateCreated');
    }
    set DateCreated(value: Date | null) {
        this.Set('DateCreated', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Core Data Codes - strongly typed entity sub-class
 * * Schema: dese
 * * Base Table: core_data_codes
 * * Base View: vwcore_data_codes
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Core Data Codes')
export class core_data_codesEntity extends BaseEntity<core_data_codesEntityType> {
    /**
    * Loads the Core Data Codes record from the database
    * @param ID: number - primary key value to load the Core Data Codes record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof core_data_codesEntity
    * @method
    * @override
    */
    public async Load(ID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: poscod
    * * Display Name: Position Code
    * * SQL Data Type: char(2)
    */
    get poscod(): string | null {
        return this.Get('poscod');
    }
    set poscod(value: string | null) {
        this.Set('poscod', value);
    }

    /**
    * * Field Name: pos_name
    * * Display Name: Position Name
    * * SQL Data Type: varchar(30)
    */
    get pos_name(): string | null {
        return this.Get('pos_name');
    }
    set pos_name(value: string | null) {
        this.Set('pos_name', value);
    }

    /**
    * * Field Name: abbrev
    * * Display Name: Abbreviation
    * * SQL Data Type: varchar(25)
    */
    get abbrev(): string | null {
        return this.Get('abbrev');
    }
    set abbrev(value: string | null) {
        this.Set('abbrev', value);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: int
    */
    get ID(): number {
        return this.Get('ID');
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Core Datas - strongly typed entity sub-class
 * * Schema: dese
 * * Base Table: Core_Data
 * * Base View: vwCore_Datas
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Core Datas')
export class Core_DataEntity extends BaseEntity<Core_DataEntityType> {
    /**
    * Loads the Core Datas record from the database
    * @param ID: number - primary key value to load the Core Datas record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof Core_DataEntity
    * @method
    * @override
    */
    public async Load(ID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: esssn
    * * Display Name: Social Security Number
    * * SQL Data Type: varchar(100)
    */
    get esssn(): string | null {
        return this.Get('esssn');
    }
    set esssn(value: string | null) {
        this.Set('esssn', value);
    }

    /**
    * * Field Name: co_dist_code
    * * Display Name: County District Code
    * * SQL Data Type: nvarchar(10)
    */
    get co_dist_code(): string | null {
        return this.Get('co_dist_code');
    }
    set co_dist_code(value: string | null) {
        this.Set('co_dist_code', value);
    }

    /**
    * * Field Name: year
    * * Display Name: Year
    * * SQL Data Type: nvarchar(10)
    */
    get year(): string | null {
        return this.Get('year');
    }
    set year(value: string | null) {
        this.Set('year', value);
    }

    /**
    * * Field Name: pos_name
    * * Display Name: Position Name
    * * SQL Data Type: varchar(30)
    */
    get pos_name(): string | null {
        return this.Get('pos_name');
    }
    set pos_name(value: string | null) {
        this.Set('pos_name', value);
    }

    /**
    * * Field Name: edlname
    * * Display Name: Last Name
    * * SQL Data Type: varchar(50)
    */
    get edlname(): string | null {
        return this.Get('edlname');
    }
    set edlname(value: string | null) {
        this.Set('edlname', value);
    }

    /**
    * * Field Name: edfname
    * * Display Name: First Name
    * * SQL Data Type: varchar(50)
    */
    get edfname(): string | null {
        return this.Get('edfname');
    }
    set edfname(value: string | null) {
        this.Set('edfname', value);
    }

    /**
    * * Field Name: edminit
    * * Display Name: Middle Initial
    * * SQL Data Type: char(1)
    */
    get edminit(): string | null {
        return this.Get('edminit');
    }
    set edminit(value: string | null) {
        this.Set('edminit', value);
    }

    /**
    * * Field Name: edrtsal
    * * Display Name: Regular Term Salary
    * * SQL Data Type: int
    */
    get edrtsal(): number | null {
        return this.Get('edrtsal');
    }
    set edrtsal(value: number | null) {
        this.Set('edrtsal', value);
    }

    /**
    * * Field Name: edttsal
    * * Display Name: Total Salary
    * * SQL Data Type: decimal(15, 2)
    */
    get edttsal(): number | null {
        return this.Get('edttsal');
    }
    set edttsal(value: number | null) {
        this.Set('edttsal', value);
    }

    /**
    * * Field Name: edsbfte
    * * Display Name: Full-Time Equivalent
    * * SQL Data Type: decimal(3, 2)
    */
    get edsbfte(): number | null {
        return this.Get('edsbfte');
    }
    set edsbfte(value: number | null) {
        this.Set('edsbfte', value);
    }

    /**
    * * Field Name: edyrexdi
    * * Display Name: Years of Experience at District
    * * SQL Data Type: int
    */
    get edyrexdi(): number | null {
        return this.Get('edyrexdi');
    }
    set edyrexdi(value: number | null) {
        this.Set('edyrexdi', value);
    }

    /**
    * * Field Name: edyrexmo
    * * Display Name: Years of Experience in Missouri
    * * SQL Data Type: int
    */
    get edyrexmo(): number | null {
        return this.Get('edyrexmo');
    }
    set edyrexmo(value: number | null) {
        this.Set('edyrexmo', value);
    }

    /**
    * * Field Name: edhidgre
    * * Display Name: Highest Degree Attained
    * * SQL Data Type: char(4)
    */
    get edhidgre(): string | null {
        return this.Get('edhidgre');
    }
    set edhidgre(value: string | null) {
        this.Set('edhidgre', value);
    }

    /**
    * * Field Name: esposcod
    * * Display Name: Position Code
    * * SQL Data Type: char(2)
    */
    get esposcod(): string | null {
        return this.Get('esposcod');
    }
    set esposcod(value: string | null) {
        this.Set('esposcod', value);
    }

    /**
    * * Field Name: esschool
    * * Display Name: School Code
    * * SQL Data Type: nvarchar(6)
    */
    get esschool(): string | null {
        return this.Get('esschool');
    }
    set esschool(value: string | null) {
        this.Set('esschool', value);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: int
    */
    get ID(): number {
        return this.Get('ID');
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * County District Codes - strongly typed entity sub-class
 * * Schema: dese
 * * Base Table: co_dist_desc
 * * Base View: vwco_dist_descs
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'County District Codes')
export class co_dist_descEntity extends BaseEntity<co_dist_descEntityType> {
    /**
    * Loads the County District Codes record from the database
    * @param ID: number - primary key value to load the County District Codes record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof co_dist_descEntity
    * @method
    * @override
    */
    public async Load(ID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: co_dist_code
    * * Display Name: County District Code
    * * SQL Data Type: nvarchar(10)
    */
    get co_dist_code(): string | null {
        return this.Get('co_dist_code');
    }
    set co_dist_code(value: string | null) {
        this.Set('co_dist_code', value);
    }

    /**
    * * Field Name: description
    * * Display Name: Description
    * * SQL Data Type: varchar(80)
    */
    get description(): string | null {
        return this.Get('description');
    }
    set description(value: string | null) {
        this.Set('description', value);
    }

    /**
    * * Field Name: co_dist_char
    * * Display Name: County District Code
    * * SQL Data Type: char(6)
    */
    get co_dist_char(): string | null {
        return this.Get('co_dist_char');
    }
    set co_dist_char(value: string | null) {
        this.Set('co_dist_char', value);
    }

    /**
    * * Field Name: Street
    * * Display Name: Street
    * * SQL Data Type: varchar(75)
    */
    get Street(): string | null {
        return this.Get('Street');
    }
    set Street(value: string | null) {
        this.Set('Street', value);
    }

    /**
    * * Field Name: Mail
    * * Display Name: Mail
    * * SQL Data Type: varchar(75)
    */
    get Mail(): string | null {
        return this.Get('Mail');
    }
    set Mail(value: string | null) {
        this.Set('Mail', value);
    }

    /**
    * * Field Name: City
    * * Display Name: City
    * * SQL Data Type: varchar(75)
    */
    get City(): string | null {
        return this.Get('City');
    }
    set City(value: string | null) {
        this.Set('City', value);
    }

    /**
    * * Field Name: State
    * * Display Name: State
    * * SQL Data Type: varchar(75)
    */
    get State(): string | null {
        return this.Get('State');
    }
    set State(value: string | null) {
        this.Set('State', value);
    }

    /**
    * * Field Name: Zip
    * * Display Name: Zip
    * * SQL Data Type: varchar(75)
    */
    get Zip(): string | null {
        return this.Get('Zip');
    }
    set Zip(value: string | null) {
        this.Set('Zip', value);
    }

    /**
    * * Field Name: Phone
    * * Display Name: Phone
    * * SQL Data Type: varchar(25)
    */
    get Phone(): string | null {
        return this.Get('Phone');
    }
    set Phone(value: string | null) {
        this.Set('Phone', value);
    }

    /**
    * * Field Name: Fax
    * * Display Name: Fax
    * * SQL Data Type: varchar(25)
    */
    get Fax(): string | null {
        return this.Get('Fax');
    }
    set Fax(value: string | null) {
        this.Set('Fax', value);
    }

    /**
    * * Field Name: Region
    * * Display Name: Region
    * * SQL Data Type: varchar(75)
    */
    get Region(): string | null {
        return this.Get('Region');
    }
    set Region(value: string | null) {
        this.Set('Region', value);
    }

    /**
    * * Field Name: Sal_Region
    * * Display Name: Salary Region
    * * SQL Data Type: varchar(75)
    */
    get Sal_Region(): string | null {
        return this.Get('Sal_Region');
    }
    set Sal_Region(value: string | null) {
        this.Set('Sal_Region', value);
    }

    /**
    * * Field Name: Sal_Region_BAK
    * * Display Name: Sal _Region _BAK
    * * SQL Data Type: varchar(75)
    */
    get Sal_Region_BAK(): string | null {
        return this.Get('Sal_Region_BAK');
    }
    set Sal_Region_BAK(value: string | null) {
        this.Set('Sal_Region_BAK', value);
    }

    /**
    * * Field Name: Field_Area
    * * Display Name: Field Area
    * * SQL Data Type: varchar(75)
    */
    get Field_Area(): string | null {
        return this.Get('Field_Area');
    }
    set Field_Area(value: string | null) {
        this.Set('Field_Area', value);
    }

    /**
    * * Field Name: County
    * * Display Name: County
    * * SQL Data Type: varchar(75)
    */
    get County(): string | null {
        return this.Get('County');
    }
    set County(value: string | null) {
        this.Set('County', value);
    }

    /**
    * * Field Name: enabledthru
    * * Display Name: enabledthru
    * * SQL Data Type: int
    */
    get enabledthru(): number | null {
        return this.Get('enabledthru');
    }
    set enabledthru(value: number | null) {
        this.Set('enabledthru', value);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: int
    */
    get ID(): number {
        return this.Get('ID');
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Course Descriptions - strongly typed entity sub-class
 * * Schema: dese
 * * Base Table: crsassgn
 * * Base View: vwcrsassgns
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Course Descriptions')
export class crsassgnEntity extends BaseEntity<crsassgnEntityType> {
    /**
    * Loads the Course Descriptions record from the database
    * @param ID: number - primary key value to load the Course Descriptions record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof crsassgnEntity
    * @method
    * @override
    */
    public async Load(ID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: cassn
    * * Display Name: Social Security Number
    * * SQL Data Type: varchar(100)
    */
    get cassn(): string | null {
        return this.Get('cassn');
    }
    set cassn(value: string | null) {
        this.Set('cassn', value);
    }

    /**
    * * Field Name: cactydis
    * * Display Name: County District Code
    * * SQL Data Type: char(6)
    */
    get cactydis(): string | null {
        return this.Get('cactydis');
    }
    set cactydis(value: string | null) {
        this.Set('cactydis', value);
    }

    /**
    * * Field Name: caschool
    * * Display Name: School Code
    * * SQL Data Type: char(4)
    */
    get caschool(): string | null {
        return this.Get('caschool');
    }
    set caschool(value: string | null) {
        this.Set('caschool', value);
    }

    /**
    * * Field Name: caposcod
    * * Display Name: Position Code
    * * SQL Data Type: char(2)
    */
    get caposcod(): string | null {
        return this.Get('caposcod');
    }
    set caposcod(value: string | null) {
        this.Set('caposcod', value);
    }

    /**
    * * Field Name: cayear
    * * Display Name: School Year
    * * SQL Data Type: nvarchar(4)
    */
    get cayear(): string | null {
        return this.Get('cayear');
    }
    set cayear(value: string | null) {
        this.Set('cayear', value);
    }

    /**
    * * Field Name: caprogtp
    * * Display Name: Vocational Project Type
    * * SQL Data Type: char(4)
    */
    get caprogtp(): string | null {
        return this.Get('caprogtp');
    }
    set caprogtp(value: string | null) {
        this.Set('caprogtp', value);
    }

    /**
    * * Field Name: calineno
    * * Display Name: Vocational Line Number
    * * SQL Data Type: int
    */
    get calineno(): number | null {
        return this.Get('calineno');
    }
    set calineno(value: number | null) {
        this.Set('calineno', value);
    }

    /**
    * * Field Name: caasgnno
    * * Display Name: Assignment Code
    * * SQL Data Type: char(2)
    */
    get caasgnno(): string | null {
        return this.Get('caasgnno');
    }
    set caasgnno(value: string | null) {
        this.Set('caasgnno', value);
    }

    /**
    * * Field Name: csnum
    * * Display Name: Course Number
    * * SQL Data Type: char(6)
    */
    get csnum(): string | null {
        return this.Get('csnum');
    }
    set csnum(value: string | null) {
        this.Set('csnum', value);
    }

    /**
    * * Field Name: crsseq
    * * Display Name: Course Sequence
    * * SQL Data Type: int
    */
    get crsseq(): number | null {
        return this.Get('crsseq');
    }
    set crsseq(value: number | null) {
        this.Set('crsseq', value);
    }

    /**
    * * Field Name: crsgrade
    * * Display Name: Course Grade
    * * SQL Data Type: char(2)
    */
    get crsgrade(): string | null {
        return this.Get('crsgrade');
    }
    set crsgrade(value: string | null) {
        this.Set('crsgrade', value);
    }

    /**
    * * Field Name: semester
    * * Display Name: Semester
    * * SQL Data Type: int
    */
    get semester(): number | null {
        return this.Get('semester');
    }
    set semester(value: number | null) {
        this.Set('semester', value);
    }

    /**
    * * Field Name: pgmcode
    * * Display Name: Program Code
    * * SQL Data Type: char(2)
    */
    get pgmcode(): string | null {
        return this.Get('pgmcode');
    }
    set pgmcode(value: string | null) {
        this.Set('pgmcode', value);
    }

    /**
    * * Field Name: delivsys
    * * Display Name: Delivery System
    * * SQL Data Type: char(2)
    */
    get delivsys(): string | null {
        return this.Get('delivsys');
    }
    set delivsys(value: string | null) {
        this.Set('delivsys', value);
    }

    /**
    * * Field Name: crsmin
    * * Display Name: Course Minutes
    * * SQL Data Type: int
    */
    get crsmin(): number | null {
        return this.Get('crsmin');
    }
    set crsmin(value: number | null) {
        this.Set('crsmin', value);
    }

    /**
    * * Field Name: cacredit
    * * Display Name: Credit
    * * SQL Data Type: int
    */
    get cacredit(): number | null {
        return this.Get('cacredit');
    }
    set cacredit(value: number | null) {
        this.Set('cacredit', value);
    }

    /**
    * * Field Name: enroll
    * * Display Name: Total Enrollment
    * * SQL Data Type: int
    */
    get enroll(): number | null {
        return this.Get('enroll');
    }
    set enroll(value: number | null) {
        this.Set('enroll', value);
    }

    /**
    * * Field Name: stumale
    * * Display Name: Male Enrollment
    * * SQL Data Type: int
    */
    get stumale(): number | null {
        return this.Get('stumale');
    }
    set stumale(value: number | null) {
        this.Set('stumale', value);
    }

    /**
    * * Field Name: stufml
    * * Display Name: Female Enrollment
    * * SQL Data Type: int
    */
    get stufml(): number | null {
        return this.Get('stufml');
    }
    set stufml(value: number | null) {
        this.Set('stufml', value);
    }

    /**
    * * Field Name: stublk
    * * Display Name: Black Enrollment
    * * SQL Data Type: int
    */
    get stublk(): number | null {
        return this.Get('stublk');
    }
    set stublk(value: number | null) {
        this.Set('stublk', value);
    }

    /**
    * * Field Name: stuwhit
    * * Display Name: White Enrollment
    * * SQL Data Type: int
    */
    get stuwhit(): number | null {
        return this.Get('stuwhit');
    }
    set stuwhit(value: number | null) {
        this.Set('stuwhit', value);
    }

    /**
    * * Field Name: stuhsp
    * * Display Name: Hispanic Enrollment
    * * SQL Data Type: int
    */
    get stuhsp(): number | null {
        return this.Get('stuhsp');
    }
    set stuhsp(value: number | null) {
        this.Set('stuhsp', value);
    }

    /**
    * * Field Name: stuasn
    * * Display Name: Asian Enrollment
    * * SQL Data Type: int
    */
    get stuasn(): number | null {
        return this.Get('stuasn');
    }
    set stuasn(value: number | null) {
        this.Set('stuasn', value);
    }

    /**
    * * Field Name: stuind
    * * Display Name: stuind
    * * SQL Data Type: int
    */
    get stuind(): number | null {
        return this.Get('stuind');
    }
    set stuind(value: number | null) {
        this.Set('stuind', value);
    }

    /**
    * * Field Name: stuhan
    * * Display Name: Handicapped Enrollment
    * * SQL Data Type: int
    */
    get stuhan(): number | null {
        return this.Get('stuhan');
    }
    set stuhan(value: number | null) {
        this.Set('stuhan', value);
    }

    /**
    * * Field Name: studis
    * * Display Name: Disadvantaged Enrollment
    * * SQL Data Type: int
    */
    get studis(): number | null {
        return this.Get('studis');
    }
    set studis(value: number | null) {
        this.Set('studis', value);
    }

    /**
    * * Field Name: stuexit
    * * Display Name: Exitor Enrollment
    * * SQL Data Type: int
    */
    get stuexit(): number | null {
        return this.Get('stuexit');
    }
    set stuexit(value: number | null) {
        this.Set('stuexit', value);
    }

    /**
    * * Field Name: stuadlt
    * * Display Name: Adult Enrollment
    * * SQL Data Type: int
    */
    get stuadlt(): number | null {
        return this.Get('stuadlt');
    }
    set stuadlt(value: number | null) {
        this.Set('stuadlt', value);
    }

    /**
    * * Field Name: casusp
    * * Display Name: Suspension Flag
    * * SQL Data Type: char(1)
    */
    get casusp(): string | null {
        return this.Get('casusp');
    }
    set casusp(value: string | null) {
        this.Set('casusp', value);
    }

    /**
    * * Field Name: casuspsu
    * * Display Name: casuspsu
    * * SQL Data Type: char(1)
    */
    get casuspsu(): string | null {
        return this.Get('casuspsu');
    }
    set casuspsu(value: string | null) {
        this.Set('casuspsu', value);
    }

    /**
    * * Field Name: casuspsd
    * * Display Name: casuspsd
    * * SQL Data Type: char(1)
    */
    get casuspsd(): string | null {
        return this.Get('casuspsd');
    }
    set casuspsd(value: string | null) {
        this.Set('casuspsd', value);
    }

    /**
    * * Field Name: casuspsf
    * * Display Name: casuspsf
    * * SQL Data Type: char(1)
    */
    get casuspsf(): string | null {
        return this.Get('casuspsf');
    }
    set casuspsf(value: string | null) {
        this.Set('casuspsf', value);
    }

    /**
    * * Field Name: casusptr
    * * Display Name: casusptr
    * * SQL Data Type: char(1)
    */
    get casusptr(): string | null {
        return this.Get('casusptr');
    }
    set casusptr(value: string | null) {
        this.Set('casusptr', value);
    }

    /**
    * * Field Name: casuspvf
    * * Display Name: casuspvf
    * * SQL Data Type: char(1)
    */
    get casuspvf(): string | null {
        return this.Get('casuspvf');
    }
    set casuspvf(value: string | null) {
        this.Set('casuspvf', value);
    }

    /**
    * * Field Name: casuspve
    * * Display Name: casuspve
    * * SQL Data Type: char(1)
    */
    get casuspve(): string | null {
        return this.Get('casuspve');
    }
    set casuspve(value: string | null) {
        this.Set('casuspve', value);
    }

    /**
    * * Field Name: caladate
    * * Display Name: Last Access Date
    * * SQL Data Type: datetime
    */
    get caladate(): Date | null {
        return this.Get('caladate');
    }
    set caladate(value: Date | null) {
        this.Set('caladate', value);
    }

    /**
    * * Field Name: calauser
    * * Display Name: Last Access User
    * * SQL Data Type: char(4)
    */
    get calauser(): string | null {
        return this.Get('calauser');
    }
    set calauser(value: string | null) {
        this.Set('calauser', value);
    }

    /**
    * * Field Name: cadelete
    * * Display Name: Delete Flag
    * * SQL Data Type: char(1)
    */
    get cadelete(): string | null {
        return this.Get('cadelete');
    }
    set cadelete(value: string | null) {
        this.Set('cadelete', value);
    }

    /**
    * * Field Name: castdate
    * * Display Name: Course Start Date
    * * SQL Data Type: datetime
    */
    get castdate(): Date | null {
        return this.Get('castdate');
    }
    set castdate(value: Date | null) {
        this.Set('castdate', value);
    }

    /**
    * * Field Name: caendate
    * * Display Name: Course End Date
    * * SQL Data Type: datetime
    */
    get caendate(): Date | null {
        return this.Get('caendate');
    }
    set caendate(value: Date | null) {
        this.Set('caendate', value);
    }

    /**
    * * Field Name: caclsid
    * * Display Name: Course Special Education Class ID
    * * SQL Data Type: int
    */
    get caclsid(): number | null {
        return this.Get('caclsid');
    }
    set caclsid(value: number | null) {
        this.Set('caclsid', value);
    }

    /**
    * * Field Name: caaide
    * * Display Name: Course Special Education Aide
    * * SQL Data Type: int
    */
    get caaide(): number | null {
        return this.Get('caaide');
    }
    set caaide(value: number | null) {
        this.Set('caaide', value);
    }

    /**
    * * Field Name: cacertid
    * * Display Name: Course Certification ID
    * * SQL Data Type: char(1)
    */
    get cacertid(): string | null {
        return this.Get('cacertid');
    }
    set cacertid(value: string | null) {
        this.Set('cacertid', value);
    }

    /**
    * * Field Name: caeffect
    * * Display Name: Course Certification Effect Date
    * * SQL Data Type: datetime
    */
    get caeffect(): Date | null {
        return this.Get('caeffect');
    }
    set caeffect(value: Date | null) {
        this.Set('caeffect', value);
    }

    /**
    * * Field Name: caexp
    * * Display Name: Course Certification Expiration Date
    * * SQL Data Type: datetime
    */
    get caexp(): Date | null {
        return this.Get('caexp');
    }
    set caexp(value: Date | null) {
        this.Set('caexp', value);
    }

    /**
    * * Field Name: casuspse
    * * Display Name: casuspse
    * * SQL Data Type: char(1)
    */
    get casuspse(): string | null {
        return this.Get('casuspse');
    }
    set casuspse(value: string | null) {
        this.Set('casuspse', value);
    }

    /**
    * * Field Name: combined_classes
    * * Display Name: Combined Classes
    * * SQL Data Type: char(3)
    */
    get combined_classes(): string | null {
        return this.Get('combined_classes');
    }
    set combined_classes(value: string | null) {
        this.Set('combined_classes', value);
    }

    /**
    * * Field Name: comment
    * * Display Name: Comment
    * * SQL Data Type: varchar(255)
    */
    get comment(): string | null {
        return this.Get('comment');
    }
    set comment(value: string | null) {
        this.Set('comment', value);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: int
    */
    get ID(): number {
        return this.Get('ID');
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Educators - strongly typed entity sub-class
 * * Schema: dese
 * * Base Table: educator
 * * Base View: vweducators
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Educators')
export class educatorEntity extends BaseEntity<educatorEntityType> {
    /**
    * Loads the Educators record from the database
    * @param ID: number - primary key value to load the Educators record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof educatorEntity
    * @method
    * @override
    */
    public async Load(ID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: edssn
    * * Display Name: Social Security Number
    * * SQL Data Type: varchar(100)
    */
    get edssn(): string | null {
        return this.Get('edssn');
    }
    set edssn(value: string | null) {
        this.Set('edssn', value);
    }

    /**
    * * Field Name: year
    * * Display Name: Year
    * * SQL Data Type: nvarchar(10)
    */
    get year(): string | null {
        return this.Get('year');
    }
    set year(value: string | null) {
        this.Set('year', value);
    }

    /**
    * * Field Name: co_dist_code
    * * Display Name: County District Code
    * * SQL Data Type: nvarchar(10)
    */
    get co_dist_code(): string | null {
        return this.Get('co_dist_code');
    }
    set co_dist_code(value: string | null) {
        this.Set('co_dist_code', value);
    }

    /**
    * * Field Name: edlname
    * * Display Name: Last Name
    * * SQL Data Type: varchar(50)
    */
    get edlname(): string | null {
        return this.Get('edlname');
    }
    set edlname(value: string | null) {
        this.Set('edlname', value);
    }

    /**
    * * Field Name: edfname
    * * Display Name: First Name
    * * SQL Data Type: varchar(50)
    */
    get edfname(): string | null {
        return this.Get('edfname');
    }
    set edfname(value: string | null) {
        this.Set('edfname', value);
    }

    /**
    * * Field Name: edminit
    * * Display Name: Middle Initial
    * * SQL Data Type: char(1)
    */
    get edminit(): string | null {
        return this.Get('edminit');
    }
    set edminit(value: string | null) {
        this.Set('edminit', value);
    }

    /**
    * * Field Name: edsex
    * * Display Name: Sex
    * * SQL Data Type: char(1)
    */
    get edsex(): string | null {
        return this.Get('edsex');
    }
    set edsex(value: string | null) {
        this.Set('edsex', value);
    }

    /**
    * * Field Name: edrace
    * * Display Name: Race
    * * SQL Data Type: char(1)
    */
    get edrace(): string | null {
        return this.Get('edrace');
    }
    set edrace(value: string | null) {
        this.Set('edrace', value);
    }

    /**
    * * Field Name: edcondur
    * * Display Name: Extended Contract Duration
    * * SQL Data Type: decimal(5, 2)
    */
    get edcondur(): number | null {
        return this.Get('edcondur');
    }
    set edcondur(value: number | null) {
        this.Set('edcondur', value);
    }

    /**
    * * Field Name: edttsal
    * * Display Name: Total Salary
    * * SQL Data Type: int
    */
    get edttsal(): number | null {
        return this.Get('edttsal');
    }
    set edttsal(value: number | null) {
        this.Set('edttsal', value);
    }

    /**
    * * Field Name: edrtsal
    * * Display Name: Regular Term Salary
    * * SQL Data Type: int
    */
    get edrtsal(): number | null {
        return this.Get('edrtsal');
    }
    set edrtsal(value: number | null) {
        this.Set('edrtsal', value);
    }

    /**
    * * Field Name: edecsal
    * * Display Name: Extended Contract Salary
    * * SQL Data Type: int
    */
    get edecsal(): number | null {
        return this.Get('edecsal');
    }
    set edecsal(value: number | null) {
        this.Set('edecsal', value);
    }

    /**
    * * Field Name: ededsal
    * * Display Name: Extra Duty Salary
    * * SQL Data Type: int
    */
    get ededsal(): number | null {
        return this.Get('ededsal');
    }
    set ededsal(value: number | null) {
        this.Set('ededsal', value);
    }

    /**
    * * Field Name: edminsal
    * * Display Name: Minimum Salary Supplement
    * * SQL Data Type: int
    */
    get edminsal(): number | null {
        return this.Get('edminsal');
    }
    set edminsal(value: number | null) {
        this.Set('edminsal', value);
    }

    /**
    * * Field Name: carladr
    * * Display Name: Car Lad Step
    * * SQL Data Type: char(1)
    */
    get carladr(): string | null {
        return this.Get('carladr');
    }
    set carladr(value: string | null) {
        this.Set('carladr', value);
    }

    /**
    * * Field Name: edhidgre
    * * Display Name: Highest Degree Attained
    * * SQL Data Type: char(4)
    */
    get edhidgre(): string | null {
        return this.Get('edhidgre');
    }
    set edhidgre(value: string | null) {
        this.Set('edhidgre', value);
    }

    /**
    * * Field Name: edyrexdi
    * * Display Name: Years of Experience in District
    * * SQL Data Type: int
    */
    get edyrexdi(): number | null {
        return this.Get('edyrexdi');
    }
    set edyrexdi(value: number | null) {
        this.Set('edyrexdi', value);
    }

    /**
    * * Field Name: edyrexmo
    * * Display Name: Years of Experience in Missouri
    * * SQL Data Type: int
    */
    get edyrexmo(): number | null {
        return this.Get('edyrexmo');
    }
    set edyrexmo(value: number | null) {
        this.Set('edyrexmo', value);
    }

    /**
    * * Field Name: edyrexpb
    * * Display Name: Years of Experience in Public Schools
    * * SQL Data Type: int
    */
    get edyrexpb(): number | null {
        return this.Get('edyrexpb');
    }
    set edyrexpb(value: number | null) {
        this.Set('edyrexpb', value);
    }

    /**
    * * Field Name: latehire
    * * Display Name: Late Hire
    * * SQL Data Type: char(4)
    */
    get latehire(): string | null {
        return this.Get('latehire');
    }
    set latehire(value: string | null) {
        this.Set('latehire', value);
    }

    /**
    * * Field Name: erlyterm
    * * Display Name: Early Termination
    * * SQL Data Type: char(4)
    */
    get erlyterm(): string | null {
        return this.Get('erlyterm');
    }
    set erlyterm(value: string | null) {
        this.Set('erlyterm', value);
    }

    /**
    * * Field Name: edttmin
    * * Display Name: Total Minutes
    * * SQL Data Type: int
    */
    get edttmin(): number | null {
        return this.Get('edttmin');
    }
    set edttmin(value: number | null) {
        this.Set('edttmin', value);
    }

    /**
    * * Field Name: edttfte
    * * Display Name: Total FTE
    * * SQL Data Type: decimal(3, 2)
    */
    get edttfte(): number | null {
        return this.Get('edttfte');
    }
    set edttfte(value: number | null) {
        this.Set('edttfte', value);
    }

    /**
    * * Field Name: edshared
    * * Display Name: Shared Districts
    * * SQL Data Type: char(1)
    */
    get edshared(): string | null {
        return this.Get('edshared');
    }
    set edshared(value: string | null) {
        this.Set('edshared', value);
    }

    /**
    * * Field Name: edcommt
    * * Display Name: Educator Comments
    * * SQL Data Type: varchar(1020)
    */
    get edcommt(): string | null {
        return this.Get('edcommt');
    }
    set edcommt(value: string | null) {
        this.Set('edcommt', value);
    }

    /**
    * * Field Name: edsusp
    * * Display Name: Suspended
    * * SQL Data Type: char(1)
    */
    get edsusp(): string | null {
        return this.Get('edsusp');
    }
    set edsusp(value: string | null) {
        this.Set('edsusp', value);
    }

    /**
    * * Field Name: edsuspsu
    * * Display Name: edsuspsu
    * * SQL Data Type: char(1)
    */
    get edsuspsu(): string | null {
        return this.Get('edsuspsu');
    }
    set edsuspsu(value: string | null) {
        this.Set('edsuspsu', value);
    }

    /**
    * * Field Name: edsuspsd
    * * Display Name: edsuspsd
    * * SQL Data Type: char(1)
    */
    get edsuspsd(): string | null {
        return this.Get('edsuspsd');
    }
    set edsuspsd(value: string | null) {
        this.Set('edsuspsd', value);
    }

    /**
    * * Field Name: edsuspsf
    * * Display Name: edsuspsf
    * * SQL Data Type: char(1)
    */
    get edsuspsf(): string | null {
        return this.Get('edsuspsf');
    }
    set edsuspsf(value: string | null) {
        this.Set('edsuspsf', value);
    }

    /**
    * * Field Name: edsusptr
    * * Display Name: edsusptr
    * * SQL Data Type: char(1)
    */
    get edsusptr(): string | null {
        return this.Get('edsusptr');
    }
    set edsusptr(value: string | null) {
        this.Set('edsusptr', value);
    }

    /**
    * * Field Name: edsuspvf
    * * Display Name: edsuspvf
    * * SQL Data Type: char(1)
    */
    get edsuspvf(): string | null {
        return this.Get('edsuspvf');
    }
    set edsuspvf(value: string | null) {
        this.Set('edsuspvf', value);
    }

    /**
    * * Field Name: edsuspve
    * * Display Name: edsuspve
    * * SQL Data Type: char(1)
    */
    get edsuspve(): string | null {
        return this.Get('edsuspve');
    }
    set edsuspve(value: string | null) {
        this.Set('edsuspve', value);
    }

    /**
    * * Field Name: edladate
    * * Display Name: Date of Last Update
    * * SQL Data Type: datetime
    */
    get edladate(): Date | null {
        return this.Get('edladate');
    }
    set edladate(value: Date | null) {
        this.Set('edladate', value);
    }

    /**
    * * Field Name: edlauser
    * * Display Name: Date of Last User Update
    * * SQL Data Type: char(4)
    */
    get edlauser(): string | null {
        return this.Get('edlauser');
    }
    set edlauser(value: string | null) {
        this.Set('edlauser', value);
    }

    /**
    * * Field Name: eddelete
    * * Display Name: Delete Flag
    * * SQL Data Type: char(1)
    */
    get eddelete(): string | null {
        return this.Get('eddelete');
    }
    set eddelete(value: string | null) {
        this.Set('eddelete', value);
    }

    /**
    * * Field Name: edfiscal
    * * Display Name: Fiscal Agent County Code
    * * SQL Data Type: char(6)
    */
    get edfiscal(): string | null {
        return this.Get('edfiscal');
    }
    set edfiscal(value: string | null) {
        this.Set('edfiscal', value);
    }

    /**
    * * Field Name: edcondms
    * * Display Name: Contract Duration - Minimum Salary
    * * SQL Data Type: int
    */
    get edcondms(): number | null {
        return this.Get('edcondms');
    }
    set edcondms(value: number | null) {
        this.Set('edcondms', value);
    }

    /**
    * * Field Name: edhqpdev
    * * Display Name: edhqpdev
    * * SQL Data Type: char(1)
    */
    get edhqpdev(): string | null {
        return this.Get('edhqpdev');
    }
    set edhqpdev(value: string | null) {
        this.Set('edhqpdev', value);
    }

    /**
    * * Field Name: edemail
    * * Display Name: Email
    * * SQL Data Type: varchar(255)
    */
    get edemail(): string | null {
        return this.Get('edemail');
    }
    set edemail(value: string | null) {
        this.Set('edemail', value);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: int
    */
    get ID(): number {
        return this.Get('ID');
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Enrolments - strongly typed entity sub-class
 * * Schema: dese
 * * Base Table: Table_5
 * * Base View: vwTable_5s
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Enrolments')
export class Table_5Entity extends BaseEntity<Table_5EntityType> {
    /**
    * Loads the Enrolments record from the database
    * @param ID: number - primary key value to load the Enrolments record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof Table_5Entity
    * @method
    * @override
    */
    public async Load(ID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: District
    * * Display Name: County District Code
    * * SQL Data Type: nvarchar(6)
    */
    get District(): string | null {
        return this.Get('District');
    }
    set District(value: string | null) {
        this.Set('District', value);
    }

    /**
    * * Field Name: District Name
    * * Display Name: District  Name
    * * SQL Data Type: nvarchar(255)
    */
    get District_Name(): string | null {
        return this.Get('District Name');
    }
    set District_Name(value: string | null) {
        this.Set('District Name', value);
    }

    /**
    * * Field Name: Enrollment
    * * Display Name: Enrollment
    * * SQL Data Type: float(53)
    */
    get Enrollment(): number | null {
        return this.Get('Enrollment');
    }
    set Enrollment(value: number | null) {
        this.Set('Enrollment', value);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: int
    */
    get ID(): number {
        return this.Get('ID');
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Events - strongly typed entity sub-class
 * * Schema: nams
 * * Base Table: NU__Event__c
 * * Base View: vwNU__Event__cs
 * * Primary Key: Id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Events')
export class NU__Event__cEntity extends BaseEntity<NU__Event__cEntityType> {
    /**
    * Loads the Events record from the database
    * @param Id: string - primary key value to load the Events record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof NU__Event__cEntity
    * @method
    * @override
    */
    public async Load(Id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'Id', Value: Id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: Id
    * * Display Name: Id
    * * SQL Data Type: nvarchar(50)
    */
    get Id(): string {
        return this.Get('Id');
    }
    set Id(value: string) {
        this.Set('Id', value);
    }

    /**
    * * Field Name: IsDeleted
    * * Display Name: Is Deleted
    * * SQL Data Type: bit
    */
    get IsDeleted(): boolean | null {
        return this.Get('IsDeleted');
    }
    set IsDeleted(value: boolean | null) {
        this.Set('IsDeleted', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(MAX)
    */
    get Name(): string | null {
        return this.Get('Name');
    }
    set Name(value: string | null) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: RecordTypeId
    * * Display Name: Record Type Id
    * * SQL Data Type: nvarchar(MAX)
    */
    get RecordTypeId(): string | null {
        return this.Get('RecordTypeId');
    }
    set RecordTypeId(value: string | null) {
        this.Set('RecordTypeId', value);
    }

    /**
    * * Field Name: CreatedById
    * * Display Name: Created By Id
    * * SQL Data Type: nvarchar(MAX)
    */
    get CreatedById(): string | null {
        return this.Get('CreatedById');
    }
    set CreatedById(value: string | null) {
        this.Set('CreatedById', value);
    }

    /**
    * * Field Name: LastModifiedDate
    * * Display Name: Last Modified Date
    * * SQL Data Type: datetimeoffset
    */
    get LastModifiedDate(): Date | null {
        return this.Get('LastModifiedDate');
    }

    /**
    * * Field Name: LastModifiedById
    * * Display Name: Last Modified By Id
    * * SQL Data Type: nvarchar(MAX)
    */
    get LastModifiedById(): string | null {
        return this.Get('LastModifiedById');
    }
    set LastModifiedById(value: string | null) {
        this.Set('LastModifiedById', value);
    }

    /**
    * * Field Name: SystemModstamp
    * * Display Name: System Modstamp
    * * SQL Data Type: datetimeoffset
    */
    get SystemModstamp(): Date | null {
        return this.Get('SystemModstamp');
    }

    /**
    * * Field Name: LastActivityDate
    * * Display Name: Last Activity Date
    * * SQL Data Type: datetimeoffset
    */
    get LastActivityDate(): Date | null {
        return this.Get('LastActivityDate');
    }

    /**
    * * Field Name: LastViewedDate
    * * Display Name: Last Viewed Date
    * * SQL Data Type: datetimeoffset
    */
    get LastViewedDate(): Date | null {
        return this.Get('LastViewedDate');
    }

    /**
    * * Field Name: LastReferencedDate
    * * Display Name: Last Referenced Date
    * * SQL Data Type: datetimeoffset
    */
    get LastReferencedDate(): Date | null {
        return this.Get('LastReferencedDate');
    }

    /**
    * * Field Name: NU__Entity__c
    * * Display Name: NU__Entity __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Entity__c(): string | null {
        return this.Get('NU__Entity__c');
    }
    set NU__Entity__c(value: string | null) {
        this.Set('NU__Entity__c', value);
    }

    /**
    * * Field Name: NU__ActualCost__c
    * * Display Name: NU__Actual Cost __c
    * * SQL Data Type: decimal(18, 2)
    */
    get NU__ActualCost__c(): number | null {
        return this.Get('NU__ActualCost__c');
    }
    set NU__ActualCost__c(value: number | null) {
        this.Set('NU__ActualCost__c', value);
    }

    /**
    * * Field Name: NU__ActualRevenue__c
    * * Display Name: NU__Actual Revenue __c
    * * SQL Data Type: decimal(18, 2)
    */
    get NU__ActualRevenue__c(): number | null {
        return this.Get('NU__ActualRevenue__c');
    }
    set NU__ActualRevenue__c(value: number | null) {
        this.Set('NU__ActualRevenue__c', value);
    }

    /**
    * * Field Name: NU__AddressLine1__c
    * * Display Name: NU__Address Line 1__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__AddressLine1__c(): string | null {
        return this.Get('NU__AddressLine1__c');
    }
    set NU__AddressLine1__c(value: string | null) {
        this.Set('NU__AddressLine1__c', value);
    }

    /**
    * * Field Name: NU__AddressLine2__c
    * * Display Name: NU__Address Line 2__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__AddressLine2__c(): string | null {
        return this.Get('NU__AddressLine2__c');
    }
    set NU__AddressLine2__c(value: string | null) {
        this.Set('NU__AddressLine2__c', value);
    }

    /**
    * * Field Name: NU__AllowCoWorkerRegistration__c
    * * Display Name: NU__Allow Co Worker Registration __c
    * * SQL Data Type: bit
    */
    get NU__AllowCoWorkerRegistration__c(): boolean | null {
        return this.Get('NU__AllowCoWorkerRegistration__c');
    }
    set NU__AllowCoWorkerRegistration__c(value: boolean | null) {
        this.Set('NU__AllowCoWorkerRegistration__c', value);
    }

    /**
    * * Field Name: NU__AllowGuestRegistration__c
    * * Display Name: NU__Allow Guest Registration __c
    * * SQL Data Type: bit
    */
    get NU__AllowGuestRegistration__c(): boolean | null {
        return this.Get('NU__AllowGuestRegistration__c');
    }
    set NU__AllowGuestRegistration__c(value: boolean | null) {
        this.Set('NU__AllowGuestRegistration__c', value);
    }

    /**
    * * Field Name: NU__AllowSingleClickRegistration__c
    * * Display Name: NU__Allow Single Click Registration __c
    * * SQL Data Type: bit
    */
    get NU__AllowSingleClickRegistration__c(): boolean | null {
        return this.Get('NU__AllowSingleClickRegistration__c');
    }
    set NU__AllowSingleClickRegistration__c(value: boolean | null) {
        this.Set('NU__AllowSingleClickRegistration__c', value);
    }

    /**
    * * Field Name: NU__BadgeLogo__c
    * * Display Name: NU__Badge Logo __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__BadgeLogo__c(): string | null {
        return this.Get('NU__BadgeLogo__c');
    }
    set NU__BadgeLogo__c(value: string | null) {
        this.Set('NU__BadgeLogo__c', value);
    }

    /**
    * * Field Name: NU__BudgetedCosts__c
    * * Display Name: NU__Budgeted Costs __c
    * * SQL Data Type: decimal(18, 2)
    */
    get NU__BudgetedCosts__c(): number | null {
        return this.Get('NU__BudgetedCosts__c');
    }
    set NU__BudgetedCosts__c(value: number | null) {
        this.Set('NU__BudgetedCosts__c', value);
    }

    /**
    * * Field Name: NU__CentralPhoneNumber__c
    * * Display Name: NU__Central Phone Number __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__CentralPhoneNumber__c(): string | null {
        return this.Get('NU__CentralPhoneNumber__c');
    }
    set NU__CentralPhoneNumber__c(value: string | null) {
        this.Set('NU__CentralPhoneNumber__c', value);
    }

    /**
    * * Field Name: NU__CheckInTime__c
    * * Display Name: NU__Check In Time __c
    * * SQL Data Type: datetimeoffset
    */
    get NU__CheckInTime__c(): Date | null {
        return this.Get('NU__CheckInTime__c');
    }

    /**
    * * Field Name: NU__City__c
    * * Display Name: NU__City __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__City__c(): string | null {
        return this.Get('NU__City__c');
    }
    set NU__City__c(value: string | null) {
        this.Set('NU__City__c', value);
    }

    /**
    * * Field Name: NU__ConfirmationText2__c
    * * Display Name: NU__Confirmation Text 2__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__ConfirmationText2__c(): string | null {
        return this.Get('NU__ConfirmationText2__c');
    }
    set NU__ConfirmationText2__c(value: string | null) {
        this.Set('NU__ConfirmationText2__c', value);
    }

    /**
    * * Field Name: NU__ConfirmationText__c
    * * Display Name: NU__Confirmation Text __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__ConfirmationText__c(): string | null {
        return this.Get('NU__ConfirmationText__c');
    }
    set NU__ConfirmationText__c(value: string | null) {
        this.Set('NU__ConfirmationText__c', value);
    }

    /**
    * * Field Name: NU__Country__c
    * * Display Name: NU__Country __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Country__c(): string | null {
        return this.Get('NU__Country__c');
    }
    set NU__Country__c(value: string | null) {
        this.Set('NU__Country__c', value);
    }

    /**
    * * Field Name: NU__Description__c
    * * Display Name: NU__Description __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Description__c(): string | null {
        return this.Get('NU__Description__c');
    }
    set NU__Description__c(value: string | null) {
        this.Set('NU__Description__c', value);
    }

    /**
    * * Field Name: NU__Directions__c
    * * Display Name: NU__Directions __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Directions__c(): string | null {
        return this.Get('NU__Directions__c');
    }
    set NU__Directions__c(value: string | null) {
        this.Set('NU__Directions__c', value);
    }

    /**
    * * Field Name: NU__EarlyRegistrationCutOffDate__c
    * * Display Name: NU__Early Registration Cut Off Date __c
    * * SQL Data Type: datetimeoffset
    */
    get NU__EarlyRegistrationCutOffDate__c(): Date | null {
        return this.Get('NU__EarlyRegistrationCutOffDate__c');
    }

    /**
    * * Field Name: NU__EndDate__c
    * * Display Name: NU__End Date __c
    * * SQL Data Type: datetimeoffset
    */
    get NU__EndDate__c(): Date | null {
        return this.Get('NU__EndDate__c');
    }

    /**
    * * Field Name: NU__EntityLogoOnBadgeEnabled__c
    * * Display Name: NU__Entity Logo On Badge Enabled __c
    * * SQL Data Type: bit
    */
    get NU__EntityLogoOnBadgeEnabled__c(): boolean | null {
        return this.Get('NU__EntityLogoOnBadgeEnabled__c');
    }
    set NU__EntityLogoOnBadgeEnabled__c(value: boolean | null) {
        this.Set('NU__EntityLogoOnBadgeEnabled__c', value);
    }

    /**
    * * Field Name: NU__EventDetailsUrl__c
    * * Display Name: Event Details URL
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__EventDetailsUrl__c(): string | null {
        return this.Get('NU__EventDetailsUrl__c');
    }
    set NU__EventDetailsUrl__c(value: string | null) {
        this.Set('NU__EventDetailsUrl__c', value);
    }

    /**
    * * Field Name: NU__ExpectedRevenue__c
    * * Display Name: NU__Expected Revenue __c
    * * SQL Data Type: decimal(18, 2)
    */
    get NU__ExpectedRevenue__c(): number | null {
        return this.Get('NU__ExpectedRevenue__c');
    }
    set NU__ExpectedRevenue__c(value: number | null) {
        this.Set('NU__ExpectedRevenue__c', value);
    }

    /**
    * * Field Name: NU__ExternalID__c
    * * Display Name: NU__External ID__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__ExternalID__c(): string | null {
        return this.Get('NU__ExternalID__c');
    }
    set NU__ExternalID__c(value: string | null) {
        this.Set('NU__ExternalID__c', value);
    }

    /**
    * * Field Name: NU__GuestPageDescription__c
    * * Display Name: NU__Guest Page Description __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__GuestPageDescription__c(): string | null {
        return this.Get('NU__GuestPageDescription__c');
    }
    set NU__GuestPageDescription__c(value: string | null) {
        this.Set('NU__GuestPageDescription__c', value);
    }

    /**
    * * Field Name: NU__Hidden__c
    * * Display Name: NU__Hidden __c
    * * SQL Data Type: bit
    */
    get NU__Hidden__c(): boolean | null {
        return this.Get('NU__Hidden__c');
    }
    set NU__Hidden__c(value: boolean | null) {
        this.Set('NU__Hidden__c', value);
    }

    /**
    * * Field Name: NU__InvoiceText__c
    * * Display Name: NU__Invoice Text __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__InvoiceText__c(): string | null {
        return this.Get('NU__InvoiceText__c');
    }
    set NU__InvoiceText__c(value: string | null) {
        this.Set('NU__InvoiceText__c', value);
    }

    /**
    * * Field Name: NU__LegacyEventID__c
    * * Display Name: NU__Legacy Event ID__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__LegacyEventID__c(): string | null {
        return this.Get('NU__LegacyEventID__c');
    }
    set NU__LegacyEventID__c(value: string | null) {
        this.Set('NU__LegacyEventID__c', value);
    }

    /**
    * * Field Name: NU__Location__c
    * * Display Name: Event Location
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Location__c(): string | null {
        return this.Get('NU__Location__c');
    }
    set NU__Location__c(value: string | null) {
        this.Set('NU__Location__c', value);
    }

    /**
    * * Field Name: NU__Logo__c
    * * Display Name: NU__Logo __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Logo__c(): string | null {
        return this.Get('NU__Logo__c');
    }
    set NU__Logo__c(value: string | null) {
        this.Set('NU__Logo__c', value);
    }

    /**
    * * Field Name: NU__MaxNumberOfRegistrations__c
    * * Display Name: NU__Max Number Of Registrations __c
    * * SQL Data Type: decimal(10, 0)
    */
    get NU__MaxNumberOfRegistrations__c(): number | null {
        return this.Get('NU__MaxNumberOfRegistrations__c');
    }
    set NU__MaxNumberOfRegistrations__c(value: number | null) {
        this.Set('NU__MaxNumberOfRegistrations__c', value);
    }

    /**
    * * Field Name: NU__PostalCode__c
    * * Display Name: NU__Postal Code __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__PostalCode__c(): string | null {
        return this.Get('NU__PostalCode__c');
    }
    set NU__PostalCode__c(value: string | null) {
        this.Set('NU__PostalCode__c', value);
    }

    /**
    * * Field Name: NU__QuestionPageDescription__c
    * * Display Name: NU__Question Page Description __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__QuestionPageDescription__c(): string | null {
        return this.Get('NU__QuestionPageDescription__c');
    }
    set NU__QuestionPageDescription__c(value: string | null) {
        this.Set('NU__QuestionPageDescription__c', value);
    }

    /**
    * * Field Name: NU__RegistrantPageDescription__c
    * * Display Name: NU__Registrant Page Description __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__RegistrantPageDescription__c(): string | null {
        return this.Get('NU__RegistrantPageDescription__c');
    }
    set NU__RegistrantPageDescription__c(value: string | null) {
        this.Set('NU__RegistrantPageDescription__c', value);
    }

    /**
    * * Field Name: NU__RegistrantSelectionPageDescription__c
    * * Display Name: NU__Registrant Selection Page Description __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__RegistrantSelectionPageDescription__c(): string | null {
        return this.Get('NU__RegistrantSelectionPageDescription__c');
    }
    set NU__RegistrantSelectionPageDescription__c(value: string | null) {
        this.Set('NU__RegistrantSelectionPageDescription__c', value);
    }

    /**
    * * Field Name: NU__RegistrationUrl__c
    * * Display Name: Event Registration URL
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__RegistrationUrl__c(): string | null {
        return this.Get('NU__RegistrationUrl__c');
    }
    set NU__RegistrationUrl__c(value: string | null) {
        this.Set('NU__RegistrationUrl__c', value);
    }

    /**
    * * Field Name: NU__RegularRegistrationCutOffDate__c
    * * Display Name: NU__Regular Registration Cut Off Date __c
    * * SQL Data Type: datetimeoffset
    */
    get NU__RegularRegistrationCutOffDate__c(): Date | null {
        return this.Get('NU__RegularRegistrationCutOffDate__c');
    }

    /**
    * * Field Name: NU__RestrictTo__c
    * * Display Name: NU__Restrict To __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__RestrictTo__c(): string | null {
        return this.Get('NU__RestrictTo__c');
    }
    set NU__RestrictTo__c(value: string | null) {
        this.Set('NU__RestrictTo__c', value);
    }

    /**
    * * Field Name: NU__RoomNameNumber__c
    * * Display Name: NU__Room Name Number __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__RoomNameNumber__c(): string | null {
        return this.Get('NU__RoomNameNumber__c');
    }
    set NU__RoomNameNumber__c(value: string | null) {
        this.Set('NU__RoomNameNumber__c', value);
    }

    /**
    * * Field Name: NU__SelfServiceEnabled__c
    * * Display Name: NU__Self Service Enabled __c
    * * SQL Data Type: bit
    */
    get NU__SelfServiceEnabled__c(): boolean | null {
        return this.Get('NU__SelfServiceEnabled__c');
    }
    set NU__SelfServiceEnabled__c(value: boolean | null) {
        this.Set('NU__SelfServiceEnabled__c', value);
    }

    /**
    * * Field Name: NU__SessionPageDescription__c
    * * Display Name: NU__Session Page Description __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__SessionPageDescription__c(): string | null {
        return this.Get('NU__SessionPageDescription__c');
    }
    set NU__SessionPageDescription__c(value: string | null) {
        this.Set('NU__SessionPageDescription__c', value);
    }

    /**
    * * Field Name: NU__ShortName__c
    * * Display Name: NU__Short Name __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__ShortName__c(): string | null {
        return this.Get('NU__ShortName__c');
    }
    set NU__ShortName__c(value: string | null) {
        this.Set('NU__ShortName__c', value);
    }

    /**
    * * Field Name: NU__StaffContact__c
    * * Display Name: NU__Staff Contact __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__StaffContact__c(): string | null {
        return this.Get('NU__StaffContact__c');
    }
    set NU__StaffContact__c(value: string | null) {
        this.Set('NU__StaffContact__c', value);
    }

    /**
    * * Field Name: NU__StartDate__c
    * * Display Name: NU__Start Date __c
    * * SQL Data Type: datetimeoffset
    */
    get NU__StartDate__c(): Date | null {
        return this.Get('NU__StartDate__c');
    }

    /**
    * * Field Name: NU__StateProvince__c
    * * Display Name: NU__State Province __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__StateProvince__c(): string | null {
        return this.Get('NU__StateProvince__c');
    }
    set NU__StateProvince__c(value: string | null) {
        this.Set('NU__StateProvince__c', value);
    }

    /**
    * * Field Name: NU__StatusFlag__c
    * * Display Name: NU__Status Flag __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__StatusFlag__c(): string | null {
        return this.Get('NU__StatusFlag__c');
    }
    set NU__StatusFlag__c(value: string | null) {
        this.Set('NU__StatusFlag__c', value);
    }

    /**
    * * Field Name: NU__Status__c
    * * Display Name: Status
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Status__c(): string | null {
        return this.Get('NU__Status__c');
    }
    set NU__Status__c(value: string | null) {
        this.Set('NU__Status__c', value);
    }

    /**
    * * Field Name: NU__SummaryPageDescription__c
    * * Display Name: NU__Summary Page Description __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__SummaryPageDescription__c(): string | null {
        return this.Get('NU__SummaryPageDescription__c');
    }
    set NU__SummaryPageDescription__c(value: string | null) {
        this.Set('NU__SummaryPageDescription__c', value);
    }

    /**
    * * Field Name: NU__TwitterEventDetailTweet__c
    * * Display Name: NU__Twitter Event Detail Tweet __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__TwitterEventDetailTweet__c(): string | null {
        return this.Get('NU__TwitterEventDetailTweet__c');
    }
    set NU__TwitterEventDetailTweet__c(value: string | null) {
        this.Set('NU__TwitterEventDetailTweet__c', value);
    }

    /**
    * * Field Name: NU__TwitterOrderSummaryTweet__c
    * * Display Name: NU__Twitter Order Summary Tweet __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__TwitterOrderSummaryTweet__c(): string | null {
        return this.Get('NU__TwitterOrderSummaryTweet__c');
    }
    set NU__TwitterOrderSummaryTweet__c(value: string | null) {
        this.Set('NU__TwitterOrderSummaryTweet__c', value);
    }

    /**
    * * Field Name: NU__Twitter_Hash_Tag__c
    * * Display Name: NU__Twitter _Hash _Tag __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Twitter_Hash_Tag__c(): string | null {
        return this.Get('NU__Twitter_Hash_Tag__c');
    }
    set NU__Twitter_Hash_Tag__c(value: string | null) {
        this.Set('NU__Twitter_Hash_Tag__c', value);
    }

    /**
    * * Field Name: NU__Type__c
    * * Display Name: Event Type
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Type__c(): string | null {
        return this.Get('NU__Type__c');
    }
    set NU__Type__c(value: string | null) {
        this.Set('NU__Type__c', value);
    }

    /**
    * * Field Name: NU__WebRegistrationEndDate__c
    * * Display Name: NU__Web Registration End Date __c
    * * SQL Data Type: datetimeoffset
    */
    get NU__WebRegistrationEndDate__c(): Date | null {
        return this.Get('NU__WebRegistrationEndDate__c');
    }

    /**
    * * Field Name: NU__WebRegistrationStartDate__c
    * * Display Name: NU__Web Registration Start Date __c
    * * SQL Data Type: datetimeoffset
    */
    get NU__WebRegistrationStartDate__c(): Date | null {
        return this.Get('NU__WebRegistrationStartDate__c');
    }

    /**
    * * Field Name: NU__TotalCancellations2__c
    * * Display Name: NU__Total Cancellations 2__c
    * * SQL Data Type: decimal(18, 0)
    */
    get NU__TotalCancellations2__c(): number | null {
        return this.Get('NU__TotalCancellations2__c');
    }
    set NU__TotalCancellations2__c(value: number | null) {
        this.Set('NU__TotalCancellations2__c', value);
    }

    /**
    * * Field Name: NU__TotalCancellations__c
    * * Display Name: NU__Total Cancellations __c
    * * SQL Data Type: decimal(18, 0)
    */
    get NU__TotalCancellations__c(): number | null {
        return this.Get('NU__TotalCancellations__c');
    }
    set NU__TotalCancellations__c(value: number | null) {
        this.Set('NU__TotalCancellations__c', value);
    }

    /**
    * * Field Name: NU__TotalRegistrants2__c
    * * Display Name: Total Registrants
    * * SQL Data Type: decimal(18, 0)
    */
    get NU__TotalRegistrants2__c(): number | null {
        return this.Get('NU__TotalRegistrants2__c');
    }
    set NU__TotalRegistrants2__c(value: number | null) {
        this.Set('NU__TotalRegistrants2__c', value);
    }

    /**
    * * Field Name: NU__TotalRegistrants__c
    * * Display Name: NU__Total Registrants __c
    * * SQL Data Type: decimal(18, 0)
    */
    get NU__TotalRegistrants__c(): number | null {
        return this.Get('NU__TotalRegistrants__c');
    }
    set NU__TotalRegistrants__c(value: number | null) {
        this.Set('NU__TotalRegistrants__c', value);
    }

    /**
    * * Field Name: Committee__c
    * * Display Name: Committee __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Committee__c(): string | null {
        return this.Get('Committee__c');
    }
    set Committee__c(value: string | null) {
        this.Set('Committee__c', value);
    }

    /**
    * * Field Name: NU__IsCancellable__c
    * * Display Name: NU__Is Cancellable __c
    * * SQL Data Type: bit
    */
    get NU__IsCancellable__c(): boolean | null {
        return this.Get('NU__IsCancellable__c');
    }
    set NU__IsCancellable__c(value: boolean | null) {
        this.Set('NU__IsCancellable__c', value);
    }

    /**
    * * Field Name: MobileActive__c
    * * Display Name: Mobile Active __c
    * * SQL Data Type: bit
    */
    get MobileActive__c(): boolean | null {
        return this.Get('MobileActive__c');
    }
    set MobileActive__c(value: boolean | null) {
        this.Set('MobileActive__c', value);
    }

    /**
    * * Field Name: MobileFeedUrl__c
    * * Display Name: Mobile Feed Url __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get MobileFeedUrl__c(): string | null {
        return this.Get('MobileFeedUrl__c');
    }
    set MobileFeedUrl__c(value: string | null) {
        this.Set('MobileFeedUrl__c', value);
    }

    /**
    * * Field Name: MobileHideNewsEntriesDate__c
    * * Display Name: Mobile Hide News Entries Date __c
    * * SQL Data Type: bit
    */
    get MobileHideNewsEntriesDate__c(): boolean | null {
        return this.Get('MobileHideNewsEntriesDate__c');
    }
    set MobileHideNewsEntriesDate__c(value: boolean | null) {
        this.Set('MobileHideNewsEntriesDate__c', value);
    }

    /**
    * * Field Name: MobileItineraryTitle__c
    * * Display Name: Mobile Itinerary Title __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get MobileItineraryTitle__c(): string | null {
        return this.Get('MobileItineraryTitle__c');
    }
    set MobileItineraryTitle__c(value: string | null) {
        this.Set('MobileItineraryTitle__c', value);
    }

    /**
    * * Field Name: MobileNewsTitle__c
    * * Display Name: Mobile News Title __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get MobileNewsTitle__c(): string | null {
        return this.Get('MobileNewsTitle__c');
    }
    set MobileNewsTitle__c(value: string | null) {
        this.Set('MobileNewsTitle__c', value);
    }

    /**
    * * Field Name: MobileNewsTwitterIcon__c
    * * Display Name: Mobile News Twitter Icon __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get MobileNewsTwitterIcon__c(): string | null {
        return this.Get('MobileNewsTwitterIcon__c');
    }
    set MobileNewsTwitterIcon__c(value: string | null) {
        this.Set('MobileNewsTwitterIcon__c', value);
    }

    /**
    * * Field Name: MobileNewsTwitterTitle__c
    * * Display Name: Mobile News Twitter Title __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get MobileNewsTwitterTitle__c(): string | null {
        return this.Get('MobileNewsTwitterTitle__c');
    }
    set MobileNewsTwitterTitle__c(value: string | null) {
        this.Set('MobileNewsTwitterTitle__c', value);
    }

    /**
    * * Field Name: MobileScheduleItineraryIcon__c
    * * Display Name: Mobile Schedule Itinerary Icon __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get MobileScheduleItineraryIcon__c(): string | null {
        return this.Get('MobileScheduleItineraryIcon__c');
    }
    set MobileScheduleItineraryIcon__c(value: string | null) {
        this.Set('MobileScheduleItineraryIcon__c', value);
    }

    /**
    * * Field Name: MobileScheduleItineraryTitle__c
    * * Display Name: Mobile Schedule Itinerary Title __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get MobileScheduleItineraryTitle__c(): string | null {
        return this.Get('MobileScheduleItineraryTitle__c');
    }
    set MobileScheduleItineraryTitle__c(value: string | null) {
        this.Set('MobileScheduleItineraryTitle__c', value);
    }

    /**
    * * Field Name: MobileScheduleTitle__c
    * * Display Name: Mobile Schedule Title __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get MobileScheduleTitle__c(): string | null {
        return this.Get('MobileScheduleTitle__c');
    }
    set MobileScheduleTitle__c(value: string | null) {
        this.Set('MobileScheduleTitle__c', value);
    }

    /**
    * * Field Name: MobileSection1Content__c
    * * Display Name: Mobile Section 1Content __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get MobileSection1Content__c(): string | null {
        return this.Get('MobileSection1Content__c');
    }
    set MobileSection1Content__c(value: string | null) {
        this.Set('MobileSection1Content__c', value);
    }

    /**
    * * Field Name: MobileSection1Icon__c
    * * Display Name: Mobile Section 1Icon __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get MobileSection1Icon__c(): string | null {
        return this.Get('MobileSection1Icon__c');
    }
    set MobileSection1Icon__c(value: string | null) {
        this.Set('MobileSection1Icon__c', value);
    }

    /**
    * * Field Name: MobileSection1Title__c
    * * Display Name: Mobile Section 1Title __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get MobileSection1Title__c(): string | null {
        return this.Get('MobileSection1Title__c');
    }
    set MobileSection1Title__c(value: string | null) {
        this.Set('MobileSection1Title__c', value);
    }

    /**
    * * Field Name: MobileSection2Content__c
    * * Display Name: Mobile Section 2Content __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get MobileSection2Content__c(): string | null {
        return this.Get('MobileSection2Content__c');
    }
    set MobileSection2Content__c(value: string | null) {
        this.Set('MobileSection2Content__c', value);
    }

    /**
    * * Field Name: MobileSection2Icon__c
    * * Display Name: Mobile Section 2Icon __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get MobileSection2Icon__c(): string | null {
        return this.Get('MobileSection2Icon__c');
    }
    set MobileSection2Icon__c(value: string | null) {
        this.Set('MobileSection2Icon__c', value);
    }

    /**
    * * Field Name: MobileSection2Title__c
    * * Display Name: Mobile Section 2Title __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get MobileSection2Title__c(): string | null {
        return this.Get('MobileSection2Title__c');
    }
    set MobileSection2Title__c(value: string | null) {
        this.Set('MobileSection2Title__c', value);
    }

    /**
    * * Field Name: MobileSection3Content__c
    * * Display Name: Mobile Section 3Content __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get MobileSection3Content__c(): string | null {
        return this.Get('MobileSection3Content__c');
    }
    set MobileSection3Content__c(value: string | null) {
        this.Set('MobileSection3Content__c', value);
    }

    /**
    * * Field Name: MobileSection3Icon__c
    * * Display Name: Mobile Section 3Icon __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get MobileSection3Icon__c(): string | null {
        return this.Get('MobileSection3Icon__c');
    }
    set MobileSection3Icon__c(value: string | null) {
        this.Set('MobileSection3Icon__c', value);
    }

    /**
    * * Field Name: MobileSection3Title__c
    * * Display Name: Mobile Section 3Title __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get MobileSection3Title__c(): string | null {
        return this.Get('MobileSection3Title__c');
    }
    set MobileSection3Title__c(value: string | null) {
        this.Set('MobileSection3Title__c', value);
    }

    /**
    * * Field Name: MobileSpeakersIcon__c
    * * Display Name: Mobile Speakers Icon __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get MobileSpeakersIcon__c(): string | null {
        return this.Get('MobileSpeakersIcon__c');
    }
    set MobileSpeakersIcon__c(value: string | null) {
        this.Set('MobileSpeakersIcon__c', value);
    }

    /**
    * * Field Name: MobileSpeakersTitle__c
    * * Display Name: Mobile Speakers Title __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get MobileSpeakersTitle__c(): string | null {
        return this.Get('MobileSpeakersTitle__c');
    }
    set MobileSpeakersTitle__c(value: string | null) {
        this.Set('MobileSpeakersTitle__c', value);
    }

    /**
    * * Field Name: MobileSponsorsIcon__c
    * * Display Name: Mobile Sponsors Icon __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get MobileSponsorsIcon__c(): string | null {
        return this.Get('MobileSponsorsIcon__c');
    }
    set MobileSponsorsIcon__c(value: string | null) {
        this.Set('MobileSponsorsIcon__c', value);
    }

    /**
    * * Field Name: MobileSponsorsTitle__c
    * * Display Name: Mobile Sponsors Title __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get MobileSponsorsTitle__c(): string | null {
        return this.Get('MobileSponsorsTitle__c');
    }
    set MobileSponsorsTitle__c(value: string | null) {
        this.Set('MobileSponsorsTitle__c', value);
    }

    /**
    * * Field Name: MobileTwitterTitle__c
    * * Display Name: Mobile Twitter Title __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get MobileTwitterTitle__c(): string | null {
        return this.Get('MobileTwitterTitle__c');
    }
    set MobileTwitterTitle__c(value: string | null) {
        this.Set('MobileTwitterTitle__c', value);
    }

    /**
    * * Field Name: ChatterGroupId__c
    * * Display Name: Chatter Group Id __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get ChatterGroupId__c(): string | null {
        return this.Get('ChatterGroupId__c');
    }
    set ChatterGroupId__c(value: string | null) {
        this.Set('ChatterGroupId__c', value);
    }

    /**
    * * Field Name: CommunityGroup__c
    * * Display Name: Community Group __c
    * * SQL Data Type: bit
    */
    get CommunityGroup__c(): boolean | null {
        return this.Get('CommunityGroup__c');
    }
    set CommunityGroup__c(value: boolean | null) {
        this.Set('CommunityGroup__c', value);
    }

    /**
    * * Field Name: IsBTAEvent__c
    * * Display Name: Is BTAEvent __c
    * * SQL Data Type: bit
    */
    get IsBTAEvent__c(): boolean | null {
        return this.Get('IsBTAEvent__c');
    }
    set IsBTAEvent__c(value: boolean | null) {
        this.Set('IsBTAEvent__c', value);
    }

    /**
    * * Field Name: NU__IsEditable__c
    * * Display Name: NU__Is Editable __c
    * * SQL Data Type: bit
    */
    get NU__IsEditable__c(): boolean | null {
        return this.Get('NU__IsEditable__c');
    }
    set NU__IsEditable__c(value: boolean | null) {
        this.Set('NU__IsEditable__c', value);
    }

    /**
    * * Field Name: NU__RegistrationModificationCutOffDate__c
    * * Display Name: NU__Registration Modification Cut Off Date __c
    * * SQL Data Type: datetimeoffset
    */
    get NU__RegistrationModificationCutOffDate__c(): Date | null {
        return this.Get('NU__RegistrationModificationCutOffDate__c');
    }

    /**
    * * Field Name: NU__WaitlistActiveInSelfService__c
    * * Display Name: NU__Waitlist Active In Self Service __c
    * * SQL Data Type: bit
    */
    get NU__WaitlistActiveInSelfService__c(): boolean | null {
        return this.Get('NU__WaitlistActiveInSelfService__c');
    }
    set NU__WaitlistActiveInSelfService__c(value: boolean | null) {
        this.Set('NU__WaitlistActiveInSelfService__c', value);
    }

    /**
    * * Field Name: NU__WaitlistEnabled__c
    * * Display Name: NU__Waitlist Enabled __c
    * * SQL Data Type: bit
    */
    get NU__WaitlistEnabled__c(): boolean | null {
        return this.Get('NU__WaitlistEnabled__c');
    }
    set NU__WaitlistEnabled__c(value: boolean | null) {
        this.Set('NU__WaitlistEnabled__c', value);
    }

    /**
    * * Field Name: NU__RegistrationCountLastUpdated__c
    * * Display Name: NU__Registration Count Last Updated __c
    * * SQL Data Type: datetimeoffset
    */
    get NU__RegistrationCountLastUpdated__c(): Date | null {
        return this.Get('NU__RegistrationCountLastUpdated__c');
    }

    /**
    * * Field Name: NU__ShortDescription__c
    * * Display Name: NU__Short Description __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__ShortDescription__c(): string | null {
        return this.Get('NU__ShortDescription__c');
    }
    set NU__ShortDescription__c(value: string | null) {
        this.Set('NU__ShortDescription__c', value);
    }

    /**
    * * Field Name: NU__TotalCancellations3__c
    * * Display Name: NU__Total Cancellations 3__c
    * * SQL Data Type: decimal(18, 0)
    */
    get NU__TotalCancellations3__c(): number | null {
        return this.Get('NU__TotalCancellations3__c');
    }
    set NU__TotalCancellations3__c(value: number | null) {
        this.Set('NU__TotalCancellations3__c', value);
    }

    /**
    * * Field Name: NU__TotalRegistrants3__c
    * * Display Name: NU__Total Registrants 3__c
    * * SQL Data Type: decimal(18, 0)
    */
    get NU__TotalRegistrants3__c(): number | null {
        return this.Get('NU__TotalRegistrants3__c');
    }
    set NU__TotalRegistrants3__c(value: number | null) {
        this.Set('NU__TotalRegistrants3__c', value);
    }

    /**
    * * Field Name: NC__CollectBadge__c
    * * Display Name: NC__Collect Badge __c
    * * SQL Data Type: bit
    */
    get NC__CollectBadge__c(): boolean | null {
        return this.Get('NC__CollectBadge__c');
    }
    set NC__CollectBadge__c(value: boolean | null) {
        this.Set('NC__CollectBadge__c', value);
    }

    /**
    * * Field Name: NC__CommunityHubEventUrl__c
    * * Display Name: NC__Community Hub Event Url __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NC__CommunityHubEventUrl__c(): string | null {
        return this.Get('NC__CommunityHubEventUrl__c');
    }
    set NC__CommunityHubEventUrl__c(value: string | null) {
        this.Set('NC__CommunityHubEventUrl__c', value);
    }

    /**
    * * Field Name: InxpoShowKey__c
    * * Display Name: Inxpo Show Key __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get InxpoShowKey__c(): string | null {
        return this.Get('InxpoShowKey__c');
    }
    set InxpoShowKey__c(value: string | null) {
        this.Set('InxpoShowKey__c', value);
    }

    /**
    * * Field Name: InxpoShowPackageKey__c
    * * Display Name: Inxpo Show Package Key __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get InxpoShowPackageKey__c(): string | null {
        return this.Get('InxpoShowPackageKey__c');
    }
    set InxpoShowPackageKey__c(value: string | null) {
        this.Set('InxpoShowPackageKey__c', value);
    }

    /**
    * * Field Name: NU__CollectBadge__c
    * * Display Name: NU__Collect Badge __c
    * * SQL Data Type: bit
    */
    get NU__CollectBadge__c(): boolean | null {
        return this.Get('NU__CollectBadge__c');
    }
    set NU__CollectBadge__c(value: boolean | null) {
        this.Set('NU__CollectBadge__c', value);
    }

    /**
    * * Field Name: NU_CBCW__LMSErrorMessage__c
    * * Display Name: NU_CBCW__LMSError Message __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU_CBCW__LMSErrorMessage__c(): string | null {
        return this.Get('NU_CBCW__LMSErrorMessage__c');
    }
    set NU_CBCW__LMSErrorMessage__c(value: string | null) {
        this.Set('NU_CBCW__LMSErrorMessage__c', value);
    }

    /**
    * * Field Name: NU_CBCW__LMSExternalId__c
    * * Display Name: NU_CBCW__LMSExternal Id __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU_CBCW__LMSExternalId__c(): string | null {
        return this.Get('NU_CBCW__LMSExternalId__c');
    }
    set NU_CBCW__LMSExternalId__c(value: string | null) {
        this.Set('NU_CBCW__LMSExternalId__c', value);
    }

    /**
    * * Field Name: NU_CBCW__LMSSynchronizationStatus__c
    * * Display Name: NU_CBCW__LMSSynchronization Status __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU_CBCW__LMSSynchronizationStatus__c(): string | null {
        return this.Get('NU_CBCW__LMSSynchronizationStatus__c');
    }
    set NU_CBCW__LMSSynchronizationStatus__c(value: string | null) {
        this.Set('NU_CBCW__LMSSynchronizationStatus__c', value);
    }

    /**
    * * Field Name: NU_CBCW__SyncWithLMS__c
    * * Display Name: NU_CBCW__Sync With LMS__c
    * * SQL Data Type: bit
    */
    get NU_CBCW__SyncWithLMS__c(): boolean | null {
        return this.Get('NU_CBCW__SyncWithLMS__c');
    }
    set NU_CBCW__SyncWithLMS__c(value: boolean | null) {
        this.Set('NU_CBCW__SyncWithLMS__c', value);
    }

    /**
    * * Field Name: namz__EventQuestionCount__c
    * * Display Name: namz __Event Question Count __c
    * * SQL Data Type: decimal(18, 0)
    */
    get namz__EventQuestionCount__c(): number | null {
        return this.Get('namz__EventQuestionCount__c');
    }
    set namz__EventQuestionCount__c(value: number | null) {
        this.Set('namz__EventQuestionCount__c', value);
    }

    /**
    * * Field Name: namz__EventSessionGroupCount__c
    * * Display Name: namz __Event Session Group Count __c
    * * SQL Data Type: decimal(18, 0)
    */
    get namz__EventSessionGroupCount__c(): number | null {
        return this.Get('namz__EventSessionGroupCount__c');
    }
    set namz__EventSessionGroupCount__c(value: number | null) {
        this.Set('namz__EventSessionGroupCount__c', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Troubleshoot
    * * Display Name: Troubleshoot
    * * SQL Data Type: nvarchar(50)
    */
    get Troubleshoot(): string | null {
        return this.Get('Troubleshoot');
    }
    set Troubleshoot(value: string | null) {
        this.Set('Troubleshoot', value);
    }
}


/**
 * Memberships - strongly typed entity sub-class
 * * Schema: nams
 * * Base Table: NU__Membership__c
 * * Base View: vwNU__Membership__cs
 * * Primary Key: Id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Memberships')
export class NU__Membership__cEntity extends BaseEntity<NU__Membership__cEntityType> {
    /**
    * Loads the Memberships record from the database
    * @param Id: string - primary key value to load the Memberships record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof NU__Membership__cEntity
    * @method
    * @override
    */
    public async Load(Id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'Id', Value: Id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: Id
    * * Display Name: Id
    * * SQL Data Type: nvarchar(50)
    */
    get Id(): string {
        return this.Get('Id');
    }
    set Id(value: string) {
        this.Set('Id', value);
    }

    /**
    * * Field Name: IsDeleted
    * * Display Name: Is Deleted
    * * SQL Data Type: bit
    */
    get IsDeleted(): boolean | null {
        return this.Get('IsDeleted');
    }
    set IsDeleted(value: boolean | null) {
        this.Set('IsDeleted', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(MAX)
    */
    get Name(): string | null {
        return this.Get('Name');
    }
    set Name(value: string | null) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: CreatedById
    * * Display Name: Created By Id
    * * SQL Data Type: nvarchar(MAX)
    */
    get CreatedById(): string | null {
        return this.Get('CreatedById');
    }
    set CreatedById(value: string | null) {
        this.Set('CreatedById', value);
    }

    /**
    * * Field Name: LastModifiedDate
    * * Display Name: Last Modified Date
    * * SQL Data Type: datetimeoffset
    */
    get LastModifiedDate(): Date | null {
        return this.Get('LastModifiedDate');
    }

    /**
    * * Field Name: LastModifiedById
    * * Display Name: Last Modified By Id
    * * SQL Data Type: nvarchar(MAX)
    */
    get LastModifiedById(): string | null {
        return this.Get('LastModifiedById');
    }
    set LastModifiedById(value: string | null) {
        this.Set('LastModifiedById', value);
    }

    /**
    * * Field Name: SystemModstamp
    * * Display Name: System Modstamp
    * * SQL Data Type: datetimeoffset
    */
    get SystemModstamp(): Date | null {
        return this.Get('SystemModstamp');
    }

    /**
    * * Field Name: LastActivityDate
    * * Display Name: Last Activity Date
    * * SQL Data Type: datetimeoffset
    */
    get LastActivityDate(): Date | null {
        return this.Get('LastActivityDate');
    }

    /**
    * * Field Name: LastViewedDate
    * * Display Name: Last Viewed Date
    * * SQL Data Type: datetimeoffset
    */
    get LastViewedDate(): Date | null {
        return this.Get('LastViewedDate');
    }

    /**
    * * Field Name: LastReferencedDate
    * * Display Name: Last Referenced Date
    * * SQL Data Type: datetimeoffset
    */
    get LastReferencedDate(): Date | null {
        return this.Get('LastReferencedDate');
    }

    /**
    * * Field Name: NU__Account__c
    * * Display Name: NU__Account __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Account__c(): string | null {
        return this.Get('NU__Account__c');
    }
    set NU__Account__c(value: string | null) {
        this.Set('NU__Account__c', value);
    }

    /**
    * * Field Name: NU__MembershipType__c
    * * Display Name: NU__Membership Type __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__MembershipType__c(): string | null {
        return this.Get('NU__MembershipType__c');
    }
    set NU__MembershipType__c(value: string | null) {
        this.Set('NU__MembershipType__c', value);
    }

    /**
    * * Field Name: NU__Amount__c
    * * Display Name: NU__Amount __c
    * * SQL Data Type: decimal(18, 2)
    */
    get NU__Amount__c(): number | null {
        return this.Get('NU__Amount__c');
    }
    set NU__Amount__c(value: number | null) {
        this.Set('NU__Amount__c', value);
    }

    /**
    * * Field Name: NU__Balance__c
    * * Display Name: NU__Balance __c
    * * SQL Data Type: decimal(18, 2)
    */
    get NU__Balance__c(): number | null {
        return this.Get('NU__Balance__c');
    }
    set NU__Balance__c(value: number | null) {
        this.Set('NU__Balance__c', value);
    }

    /**
    * * Field Name: NU__Category__c
    * * Display Name: Membership Category
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Category__c(): string | null {
        return this.Get('NU__Category__c');
    }
    set NU__Category__c(value: string | null) {
        this.Set('NU__Category__c', value);
    }

    /**
    * * Field Name: NU__CustomerEmail__c
    * * Display Name: Customer Email
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__CustomerEmail__c(): string | null {
        return this.Get('NU__CustomerEmail__c');
    }
    set NU__CustomerEmail__c(value: string | null) {
        this.Set('NU__CustomerEmail__c', value);
    }

    /**
    * * Field Name: NU__EndDate__c
    * * Display Name: NU__End Date __c
    * * SQL Data Type: datetimeoffset
    */
    get NU__EndDate__c(): Date | null {
        return this.Get('NU__EndDate__c');
    }

    /**
    * * Field Name: NU__EntityName__c
    * * Display Name: Entity Name
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__EntityName__c(): string | null {
        return this.Get('NU__EntityName__c');
    }
    set NU__EntityName__c(value: string | null) {
        this.Set('NU__EntityName__c', value);
    }

    /**
    * * Field Name: NU__ExternalAmount__c
    * * Display Name: NU__External Amount __c
    * * SQL Data Type: decimal(11, 2)
    */
    get NU__ExternalAmount__c(): number | null {
        return this.Get('NU__ExternalAmount__c');
    }
    set NU__ExternalAmount__c(value: number | null) {
        this.Set('NU__ExternalAmount__c', value);
    }

    /**
    * * Field Name: NU__ExternalID__c
    * * Display Name: NU__External ID__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__ExternalID__c(): string | null {
        return this.Get('NU__ExternalID__c');
    }
    set NU__ExternalID__c(value: string | null) {
        this.Set('NU__ExternalID__c', value);
    }

    /**
    * * Field Name: NU__MembershipProductName__c
    * * Display Name: Member Product Name
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__MembershipProductName__c(): string | null {
        return this.Get('NU__MembershipProductName__c');
    }
    set NU__MembershipProductName__c(value: string | null) {
        this.Set('NU__MembershipProductName__c', value);
    }

    /**
    * * Field Name: NU__OrderItemLine__c
    * * Display Name: NU__Order Item Line __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__OrderItemLine__c(): string | null {
        return this.Get('NU__OrderItemLine__c');
    }
    set NU__OrderItemLine__c(value: string | null) {
        this.Set('NU__OrderItemLine__c', value);
    }

    /**
    * * Field Name: NU__OrderItem__c
    * * Display Name: NU__Order Item __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__OrderItem__c(): string | null {
        return this.Get('NU__OrderItem__c');
    }
    set NU__OrderItem__c(value: string | null) {
        this.Set('NU__OrderItem__c', value);
    }

    /**
    * * Field Name: NU__Pending__c
    * * Display Name: NU__Pending __c
    * * SQL Data Type: bit
    */
    get NU__Pending__c(): boolean | null {
        return this.Get('NU__Pending__c');
    }
    set NU__Pending__c(value: boolean | null) {
        this.Set('NU__Pending__c', value);
    }

    /**
    * * Field Name: NU__PrimaryAffiliation__c
    * * Display Name: NU__Primary Affiliation __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__PrimaryAffiliation__c(): string | null {
        return this.Get('NU__PrimaryAffiliation__c');
    }
    set NU__PrimaryAffiliation__c(value: string | null) {
        this.Set('NU__PrimaryAffiliation__c', value);
    }

    /**
    * * Field Name: NU__Search__c
    * * Display Name: Member Name
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Search__c(): string | null {
        return this.Get('NU__Search__c');
    }
    set NU__Search__c(value: string | null) {
        this.Set('NU__Search__c', value);
    }

    /**
    * * Field Name: NU__Stage__c
    * * Display Name: NU__Stage __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Stage__c(): string | null {
        return this.Get('NU__Stage__c');
    }
    set NU__Stage__c(value: string | null) {
        this.Set('NU__Stage__c', value);
    }

    /**
    * * Field Name: NU__StartDate__c
    * * Display Name: NU__Start Date __c
    * * SQL Data Type: datetimeoffset
    */
    get NU__StartDate__c(): Date | null {
        return this.Get('NU__StartDate__c');
    }

    /**
    * * Field Name: NU__StatusFlag__c
    * * Display Name: NU__Status Flag __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__StatusFlag__c(): string | null {
        return this.Get('NU__StatusFlag__c');
    }
    set NU__StatusFlag__c(value: string | null) {
        this.Set('NU__StatusFlag__c', value);
    }

    /**
    * * Field Name: NU__Status__c
    * * Display Name: Member Status
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Status__c(): string | null {
        return this.Get('NU__Status__c');
    }
    set NU__Status__c(value: string | null) {
        this.Set('NU__Status__c', value);
    }

    /**
    * * Field Name: NU__TotalPayment__c
    * * Display Name: NU__Total Payment __c
    * * SQL Data Type: decimal(18, 2)
    */
    get NU__TotalPayment__c(): number | null {
        return this.Get('NU__TotalPayment__c');
    }
    set NU__TotalPayment__c(value: number | null) {
        this.Set('NU__TotalPayment__c', value);
    }

    /**
    * * Field Name: AccrualDues__c
    * * Display Name: Accrual Dues __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get AccrualDues__c(): string | null {
        return this.Get('AccrualDues__c');
    }
    set AccrualDues__c(value: string | null) {
        this.Set('AccrualDues__c', value);
    }

    /**
    * * Field Name: Need_Member_Application__c
    * * Display Name: Need _Member _Application __c
    * * SQL Data Type: bit
    */
    get Need_Member_Application__c(): boolean | null {
        return this.Get('Need_Member_Application__c');
    }
    set Need_Member_Application__c(value: boolean | null) {
        this.Set('Need_Member_Application__c', value);
    }

    /**
    * * Field Name: NU__PrimaryContactEmail__c
    * * Display Name: NU__Primary Contact Email __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__PrimaryContactEmail__c(): string | null {
        return this.Get('NU__PrimaryContactEmail__c');
    }
    set NU__PrimaryContactEmail__c(value: string | null) {
        this.Set('NU__PrimaryContactEmail__c', value);
    }

    /**
    * * Field Name: NU__PrimaryContactName__c
    * * Display Name: NU__Primary Contact Name __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__PrimaryContactName__c(): string | null {
        return this.Get('NU__PrimaryContactName__c');
    }
    set NU__PrimaryContactName__c(value: string | null) {
        this.Set('NU__PrimaryContactName__c', value);
    }

    /**
    * * Field Name: External_Product__c
    * * Display Name: External _Product __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get External_Product__c(): string | null {
        return this.Get('External_Product__c');
    }
    set External_Product__c(value: string | null) {
        this.Set('External_Product__c', value);
    }

    /**
    * * Field Name: Membership_Product_Name__c
    * * Display Name: Membership _Product _Name __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Membership_Product_Name__c(): string | null {
        return this.Get('Membership_Product_Name__c');
    }
    set Membership_Product_Name__c(value: string | null) {
        this.Set('Membership_Product_Name__c', value);
    }

    /**
    * * Field Name: ExternalStatus__c
    * * Display Name: External Status __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get ExternalStatus__c(): string | null {
        return this.Get('ExternalStatus__c');
    }
    set ExternalStatus__c(value: string | null) {
        this.Set('ExternalStatus__c', value);
    }

    /**
    * * Field Name: Legacy_Liability_Amount__c
    * * Display Name: Legacy _Liability _Amount __c
    * * SQL Data Type: decimal(11, 2)
    */
    get Legacy_Liability_Amount__c(): number | null {
        return this.Get('Legacy_Liability_Amount__c');
    }
    set Legacy_Liability_Amount__c(value: number | null) {
        this.Set('Legacy_Liability_Amount__c', value);
    }

    /**
    * * Field Name: Legacy_SMSTA_Dues_Amount__c
    * * Display Name: Legacy _SMSTA_Dues _Amount __c
    * * SQL Data Type: decimal(11, 2)
    */
    get Legacy_SMSTA_Dues_Amount__c(): number | null {
        return this.Get('Legacy_SMSTA_Dues_Amount__c');
    }
    set Legacy_SMSTA_Dues_Amount__c(value: number | null) {
        this.Set('Legacy_SMSTA_Dues_Amount__c', value);
    }

    /**
    * * Field Name: Legacy_Other_CTA_Dues_Amount__c
    * * Display Name: Legacy _Other _CTA_Dues _Amount __c
    * * SQL Data Type: decimal(11, 2)
    */
    get Legacy_Other_CTA_Dues_Amount__c(): number | null {
        return this.Get('Legacy_Other_CTA_Dues_Amount__c');
    }
    set Legacy_Other_CTA_Dues_Amount__c(value: number | null) {
        this.Set('Legacy_Other_CTA_Dues_Amount__c', value);
    }

    /**
    * * Field Name: Legacy_Parent__c
    * * Display Name: Legacy _Parent __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Legacy_Parent__c(): string | null {
        return this.Get('Legacy_Parent__c');
    }
    set Legacy_Parent__c(value: string | null) {
        this.Set('Legacy_Parent__c', value);
    }

    /**
    * * Field Name: Legacy_Product_Code_Conv__c
    * * Display Name: Legacy _Product _Code _Conv __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Legacy_Product_Code_Conv__c(): string | null {
        return this.Get('Legacy_Product_Code_Conv__c');
    }
    set Legacy_Product_Code_Conv__c(value: string | null) {
        this.Set('Legacy_Product_Code_Conv__c', value);
    }

    /**
    * * Field Name: Institution__c
    * * Display Name: Institution
    * * SQL Data Type: nvarchar(MAX)
    */
    get Institution__c(): string | null {
        return this.Get('Institution__c');
    }
    set Institution__c(value: string | null) {
        this.Set('Institution__c', value);
    }

    /**
    * * Field Name: Institution_at_Membership__c
    * * Display Name: Institution _at _Membership __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Institution_at_Membership__c(): string | null {
        return this.Get('Institution_at_Membership__c');
    }
    set Institution_at_Membership__c(value: string | null) {
        this.Set('Institution_at_Membership__c', value);
    }

    /**
    * * Field Name: NU__AutoRenew__c
    * * Display Name: NU__Auto Renew __c
    * * SQL Data Type: bit
    */
    get NU__AutoRenew__c(): boolean | null {
        return this.Get('NU__AutoRenew__c');
    }
    set NU__AutoRenew__c(value: boolean | null) {
        this.Set('NU__AutoRenew__c', value);
    }

    /**
    * * Field Name: NU__AutomaticRenewalCreated__c
    * * Display Name: NU__Automatic Renewal Created __c
    * * SQL Data Type: bit
    */
    get NU__AutomaticRenewalCreated__c(): boolean | null {
        return this.Get('NU__AutomaticRenewalCreated__c');
    }
    set NU__AutomaticRenewalCreated__c(value: boolean | null) {
        this.Set('NU__AutomaticRenewalCreated__c', value);
    }

    /**
    * * Field Name: NU__AutomaticRenewalDate__c
    * * Display Name: NU__Automatic Renewal Date __c
    * * SQL Data Type: datetimeoffset
    */
    get NU__AutomaticRenewalDate__c(): Date | null {
        return this.Get('NU__AutomaticRenewalDate__c');
    }

    /**
    * * Field Name: NU__AutomaticRenewalDuesAmount__c
    * * Display Name: NU__Automatic Renewal Dues Amount __c
    * * SQL Data Type: decimal(18, 2)
    */
    get NU__AutomaticRenewalDuesAmount__c(): number | null {
        return this.Get('NU__AutomaticRenewalDuesAmount__c');
    }
    set NU__AutomaticRenewalDuesAmount__c(value: number | null) {
        this.Set('NU__AutomaticRenewalDuesAmount__c', value);
    }

    /**
    * * Field Name: NU__AutomaticRenewalRepricingDate__c
    * * Display Name: NU__Automatic Renewal Repricing Date __c
    * * SQL Data Type: datetimeoffset
    */
    get NU__AutomaticRenewalRepricingDate__c(): Date | null {
        return this.Get('NU__AutomaticRenewalRepricingDate__c');
    }

    /**
    * * Field Name: NU__RecurringPayment__c
    * * Display Name: NU__Recurring Payment __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__RecurringPayment__c(): string | null {
        return this.Get('NU__RecurringPayment__c');
    }
    set NU__RecurringPayment__c(value: string | null) {
        this.Set('NU__RecurringPayment__c', value);
    }

    /**
    * * Field Name: School_Building__c
    * * Display Name: School _Building __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get School_Building__c(): string | null {
        return this.Get('School_Building__c');
    }
    set School_Building__c(value: string | null) {
        this.Set('School_Building__c', value);
    }

    /**
    * * Field Name: InstitutionID__c
    * * Display Name: Institution ID__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get InstitutionID__c(): string | null {
        return this.Get('InstitutionID__c');
    }
    set InstitutionID__c(value: string | null) {
        this.Set('InstitutionID__c', value);
    }

    /**
    * * Field Name: Year__c
    * * Display Name: Year __c
    * * SQL Data Type: decimal(18, 0)
    */
    get Year__c(): number | null {
        return this.Get('Year__c');
    }
    set Year__c(value: number | null) {
        this.Set('Year__c', value);
    }

    /**
    * * Field Name: Marketing_Label__c
    * * Display Name: Marketing _Label __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Marketing_Label__c(): string | null {
        return this.Get('Marketing_Label__c');
    }
    set Marketing_Label__c(value: string | null) {
        this.Set('Marketing_Label__c', value);
    }

    /**
    * * Field Name: Year_End__c
    * * Display Name: Year _End __c
    * * SQL Data Type: decimal(18, 0)
    */
    get Year_End__c(): number | null {
        return this.Get('Year_End__c');
    }
    set Year_End__c(value: number | null) {
        this.Set('Year_End__c', value);
    }

    /**
    * * Field Name: Member_Id__c
    * * Display Name: Member _Id __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Member_Id__c(): string | null {
        return this.Get('Member_Id__c');
    }
    set Member_Id__c(value: string | null) {
        this.Set('Member_Id__c', value);
    }

    /**
    * * Field Name: Lapsed_Beyond_Grace_Return_Date__c
    * * Display Name: Lapsed _Beyond _Grace _Return _Date __c
    * * SQL Data Type: datetimeoffset
    */
    get Lapsed_Beyond_Grace_Return_Date__c(): Date | null {
        return this.Get('Lapsed_Beyond_Grace_Return_Date__c');
    }

    /**
    * * Field Name: NU__EndDateOverride__c
    * * Display Name: NU__End Date Override __c
    * * SQL Data Type: datetimeoffset
    */
    get NU__EndDateOverride__c(): Date | null {
        return this.Get('NU__EndDateOverride__c');
    }

    /**
    * * Field Name: NU__MembershipType2__c
    * * Display Name: NU__Membership Type 2__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__MembershipType2__c(): string | null {
        return this.Get('NU__MembershipType2__c');
    }
    set NU__MembershipType2__c(value: string | null) {
        this.Set('NU__MembershipType2__c', value);
    }

    /**
    * * Field Name: NU__PrimaryMembershipProduct__c
    * * Display Name: NU__Primary Membership Product __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__PrimaryMembershipProduct__c(): string | null {
        return this.Get('NU__PrimaryMembershipProduct__c');
    }
    set NU__PrimaryMembershipProduct__c(value: string | null) {
        this.Set('NU__PrimaryMembershipProduct__c', value);
    }

    /**
    * * Field Name: NU__Account2__c
    * * Display Name: NU__Account 2__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Account2__c(): string | null {
        return this.Get('NU__Account2__c');
    }
    set NU__Account2__c(value: string | null) {
        this.Set('NU__Account2__c', value);
    }

    /**
    * * Field Name: ExternalTotalPayment__c
    * * Display Name: External Total Payment __c
    * * SQL Data Type: decimal(10, 2)
    */
    get ExternalTotalPayment__c(): number | null {
        return this.Get('ExternalTotalPayment__c');
    }
    set ExternalTotalPayment__c(value: number | null) {
        this.Set('ExternalTotalPayment__c', value);
    }

    /**
    * * Field Name: ExternalBalance__c
    * * Display Name: External Balance __c
    * * SQL Data Type: decimal(18, 2)
    */
    get ExternalBalance__c(): number | null {
        return this.Get('ExternalBalance__c');
    }
    set ExternalBalance__c(value: number | null) {
        this.Set('ExternalBalance__c', value);
    }

    /**
    * * Field Name: ExternalCanceledDate__c
    * * Display Name: External Canceled Date __c
    * * SQL Data Type: datetimeoffset
    */
    get ExternalCanceledDate__c(): Date | null {
        return this.Get('ExternalCanceledDate__c');
    }

    /**
    * * Field Name: TotalBalance__c
    * * Display Name: Total Balance __c
    * * SQL Data Type: decimal(7, 2)
    */
    get TotalBalance__c(): number | null {
        return this.Get('TotalBalance__c');
    }
    set TotalBalance__c(value: number | null) {
        this.Set('TotalBalance__c', value);
    }

    /**
    * * Field Name: AllPayments__c
    * * Display Name: All Payments __c
    * * SQL Data Type: decimal(7, 2)
    */
    get AllPayments__c(): number | null {
        return this.Get('AllPayments__c');
    }
    set AllPayments__c(value: number | null) {
        this.Set('AllPayments__c', value);
    }

    /**
    * * Field Name: NU__ExcludeFromBilling__c
    * * Display Name: NU__Exclude From Billing __c
    * * SQL Data Type: bit
    */
    get NU__ExcludeFromBilling__c(): boolean | null {
        return this.Get('NU__ExcludeFromBilling__c');
    }
    set NU__ExcludeFromBilling__c(value: boolean | null) {
        this.Set('NU__ExcludeFromBilling__c', value);
    }

    /**
    * * Field Name: NU__ExternalQuantity__c
    * * Display Name: NU__External Quantity __c
    * * SQL Data Type: decimal(18, 0)
    */
    get NU__ExternalQuantity__c(): number | null {
        return this.Get('NU__ExternalQuantity__c');
    }
    set NU__ExternalQuantity__c(value: number | null) {
        this.Set('NU__ExternalQuantity__c', value);
    }

    /**
    * * Field Name: NU__Quantity__c
    * * Display Name: NU__Quantity __c
    * * SQL Data Type: decimal(18, 0)
    */
    get NU__Quantity__c(): number | null {
        return this.Get('NU__Quantity__c');
    }
    set NU__Quantity__c(value: number | null) {
        this.Set('NU__Quantity__c', value);
    }

    /**
    * * Field Name: NU__ExternalTransactionDate__c
    * * Display Name: NU__External Transaction Date __c
    * * SQL Data Type: datetimeoffset
    */
    get NU__ExternalTransactionDate__c(): Date | null {
        return this.Get('NU__ExternalTransactionDate__c');
    }

    /**
    * * Field Name: NU__ExternalUnitPrice__c
    * * Display Name: NU__External Unit Price __c
    * * SQL Data Type: decimal(11, 2)
    */
    get NU__ExternalUnitPrice__c(): number | null {
        return this.Get('NU__ExternalUnitPrice__c');
    }
    set NU__ExternalUnitPrice__c(value: number | null) {
        this.Set('NU__ExternalUnitPrice__c', value);
    }

    /**
    * * Field Name: NU__TransactionDate__c
    * * Display Name: NU__Transaction Date __c
    * * SQL Data Type: datetimeoffset
    */
    get NU__TransactionDate__c(): Date | null {
        return this.Get('NU__TransactionDate__c');
    }

    /**
    * * Field Name: NU__UnitPrice__c
    * * Display Name: NU__Unit Price __c
    * * SQL Data Type: decimal(18, 2)
    */
    get NU__UnitPrice__c(): number | null {
        return this.Get('NU__UnitPrice__c');
    }
    set NU__UnitPrice__c(value: number | null) {
        this.Set('NU__UnitPrice__c', value);
    }

    /**
    * * Field Name: NU__OriginalEndDate__c
    * * Display Name: NU__Original End Date __c
    * * SQL Data Type: datetimeoffset
    */
    get NU__OriginalEndDate__c(): Date | null {
        return this.Get('NU__OriginalEndDate__c');
    }

    /**
    * * Field Name: Institution_backup__c
    * * Display Name: Institution _backup __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Institution_backup__c(): string | null {
        return this.Get('Institution_backup__c');
    }
    set Institution_backup__c(value: string | null) {
        this.Set('Institution_backup__c', value);
    }

    /**
    * * Field Name: Primary_Affiliation_Backup__c
    * * Display Name: Primary _Affiliation _Backup __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Primary_Affiliation_Backup__c(): string | null {
        return this.Get('Primary_Affiliation_Backup__c');
    }
    set Primary_Affiliation_Backup__c(value: string | null) {
        this.Set('Primary_Affiliation_Backup__c', value);
    }

    /**
    * * Field Name: School_Building_backup__c
    * * Display Name: School _Building _backup __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get School_Building_backup__c(): string | null {
        return this.Get('School_Building_backup__c');
    }
    set School_Building_backup__c(value: string | null) {
        this.Set('School_Building_backup__c', value);
    }

    /**
    * * Field Name: ChapterDuesProduct__c
    * * Display Name: Chapter Dues Product __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get ChapterDuesProduct__c(): string | null {
        return this.Get('ChapterDuesProduct__c');
    }
    set ChapterDuesProduct__c(value: string | null) {
        this.Set('ChapterDuesProduct__c', value);
    }

    /**
    * * Field Name: Chapter_Dues_Product_Name__c
    * * Display Name: Chapter _Dues _Product _Name __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Chapter_Dues_Product_Name__c(): string | null {
        return this.Get('Chapter_Dues_Product_Name__c');
    }
    set Chapter_Dues_Product_Name__c(value: string | null) {
        this.Set('Chapter_Dues_Product_Name__c', value);
    }

    /**
    * * Field Name: Paying_CTA_Dues_Thru_MSTA__c
    * * Display Name: Paying _CTA_Dues _Thru _MSTA__c
    * * SQL Data Type: bit
    */
    get Paying_CTA_Dues_Thru_MSTA__c(): boolean | null {
        return this.Get('Paying_CTA_Dues_Thru_MSTA__c');
    }
    set Paying_CTA_Dues_Thru_MSTA__c(value: boolean | null) {
        this.Set('Paying_CTA_Dues_Thru_MSTA__c', value);
    }

    /**
    * * Field Name: Chapter_Dues_Mismatch__c
    * * Display Name: Chapter _Dues _Mismatch __c
    * * SQL Data Type: bit
    */
    get Chapter_Dues_Mismatch__c(): boolean | null {
        return this.Get('Chapter_Dues_Mismatch__c');
    }
    set Chapter_Dues_Mismatch__c(value: boolean | null) {
        this.Set('Chapter_Dues_Mismatch__c', value);
    }

    /**
    * * Field Name: Pay_Type__c
    * * Display Name: Pay _Type __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Pay_Type__c(): string | null {
        return this.Get('Pay_Type__c');
    }
    set Pay_Type__c(value: string | null) {
        this.Set('Pay_Type__c', value);
    }

    /**
    * * Field Name: Simple_Pay_Type__c
    * * Display Name: Simple _Pay _Type __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Simple_Pay_Type__c(): string | null {
        return this.Get('Simple_Pay_Type__c');
    }
    set Simple_Pay_Type__c(value: string | null) {
        this.Set('Simple_Pay_Type__c', value);
    }

    /**
    * * Field Name: Join_Renew_Date__c
    * * Display Name: Join _Renew _Date __c
    * * SQL Data Type: datetimeoffset
    */
    get Join_Renew_Date__c(): Date | null {
        return this.Get('Join_Renew_Date__c');
    }

    /**
    * * Field Name: Joined_the_CTA__c
    * * Display Name: Joined _the _CTA__c
    * * SQL Data Type: bit
    */
    get Joined_the_CTA__c(): boolean | null {
        return this.Get('Joined_the_CTA__c');
    }
    set Joined_the_CTA__c(value: boolean | null) {
        this.Set('Joined_the_CTA__c', value);
    }

    /**
    * * Field Name: Membership_Year__c
    * * Display Name: Membership Year
    * * SQL Data Type: nvarchar(MAX)
    */
    get Membership_Year__c(): string | null {
        return this.Get('Membership_Year__c');
    }
    set Membership_Year__c(value: string | null) {
        this.Set('Membership_Year__c', value);
    }

    /**
    * * Field Name: namz__RenewalOrder__c
    * * Display Name: namz __Renewal Order __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get namz__RenewalOrder__c(): string | null {
        return this.Get('namz__RenewalOrder__c');
    }
    set namz__RenewalOrder__c(value: string | null) {
        this.Set('namz__RenewalOrder__c', value);
    }

    /**
    * * Field Name: Region__c
    * * Display Name: Region __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Region__c(): string | null {
        return this.Get('Region__c');
    }
    set Region__c(value: string | null) {
        this.Set('Region__c', value);
    }

    /**
    * * Field Name: NU__Order__c
    * * Display Name: NU__Order __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Order__c(): string | null {
        return this.Get('NU__Order__c');
    }
    set NU__Order__c(value: string | null) {
        this.Set('NU__Order__c', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Troubleshoot
    * * Display Name: Troubleshoot
    * * SQL Data Type: nvarchar(50)
    */
    get Troubleshoot(): string | null {
        return this.Get('Troubleshoot');
    }
    set Troubleshoot(value: string | null) {
        this.Set('Troubleshoot', value);
    }
}


/**
 * Order Item Lines - strongly typed entity sub-class
 * * Schema: nams
 * * Base Table: NU__OrderItemLine__c
 * * Base View: vwNU__OrderItemLine__cs
 * * Primary Key: Id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Order Item Lines')
export class NU__OrderItemLine__cEntity extends BaseEntity<NU__OrderItemLine__cEntityType> {
    /**
    * Loads the Order Item Lines record from the database
    * @param Id: string - primary key value to load the Order Item Lines record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof NU__OrderItemLine__cEntity
    * @method
    * @override
    */
    public async Load(Id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'Id', Value: Id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: Id
    * * Display Name: Id
    * * SQL Data Type: nvarchar(50)
    */
    get Id(): string {
        return this.Get('Id');
    }
    set Id(value: string) {
        this.Set('Id', value);
    }

    /**
    * * Field Name: IsDeleted
    * * Display Name: Is Deleted
    * * SQL Data Type: bit
    */
    get IsDeleted(): boolean | null {
        return this.Get('IsDeleted');
    }
    set IsDeleted(value: boolean | null) {
        this.Set('IsDeleted', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Order Item Line Number
    * * SQL Data Type: nvarchar(MAX)
    */
    get Name(): string | null {
        return this.Get('Name');
    }
    set Name(value: string | null) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: CreatedById
    * * Display Name: Created By Id
    * * SQL Data Type: nvarchar(MAX)
    */
    get CreatedById(): string | null {
        return this.Get('CreatedById');
    }
    set CreatedById(value: string | null) {
        this.Set('CreatedById', value);
    }

    /**
    * * Field Name: LastModifiedDate
    * * Display Name: Last Modified Date
    * * SQL Data Type: datetimeoffset
    */
    get LastModifiedDate(): Date | null {
        return this.Get('LastModifiedDate');
    }

    /**
    * * Field Name: LastModifiedById
    * * Display Name: Last Modified By Id
    * * SQL Data Type: nvarchar(MAX)
    */
    get LastModifiedById(): string | null {
        return this.Get('LastModifiedById');
    }
    set LastModifiedById(value: string | null) {
        this.Set('LastModifiedById', value);
    }

    /**
    * * Field Name: SystemModstamp
    * * Display Name: System Modstamp
    * * SQL Data Type: datetimeoffset
    */
    get SystemModstamp(): Date | null {
        return this.Get('SystemModstamp');
    }

    /**
    * * Field Name: LastActivityDate
    * * Display Name: Last Activity Date
    * * SQL Data Type: datetimeoffset
    */
    get LastActivityDate(): Date | null {
        return this.Get('LastActivityDate');
    }

    /**
    * * Field Name: LastViewedDate
    * * Display Name: Last Viewed Date
    * * SQL Data Type: datetimeoffset
    */
    get LastViewedDate(): Date | null {
        return this.Get('LastViewedDate');
    }

    /**
    * * Field Name: LastReferencedDate
    * * Display Name: Last Referenced Date
    * * SQL Data Type: datetimeoffset
    */
    get LastReferencedDate(): Date | null {
        return this.Get('LastReferencedDate');
    }

    /**
    * * Field Name: NU__OrderItem__c
    * * Display Name: NU__Order Item __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__OrderItem__c(): string | null {
        return this.Get('NU__OrderItem__c');
    }
    set NU__OrderItem__c(value: string | null) {
        this.Set('NU__OrderItem__c', value);
    }

    /**
    * * Field Name: NU__Product__c
    * * Display Name: NU__Product __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Product__c(): string | null {
        return this.Get('NU__Product__c');
    }
    set NU__Product__c(value: string | null) {
        this.Set('NU__Product__c', value);
    }

    /**
    * * Field Name: NU__AdjustmentDate__c
    * * Display Name: NU__Adjustment Date __c
    * * SQL Data Type: datetimeoffset
    */
    get NU__AdjustmentDate__c(): Date | null {
        return this.Get('NU__AdjustmentDate__c');
    }

    /**
    * * Field Name: NU__DeferredSchedule__c
    * * Display Name: NU__Deferred Schedule __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__DeferredSchedule__c(): string | null {
        return this.Get('NU__DeferredSchedule__c');
    }
    set NU__DeferredSchedule__c(value: string | null) {
        this.Set('NU__DeferredSchedule__c', value);
    }

    /**
    * * Field Name: NU__Donation__c
    * * Display Name: NU__Donation __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Donation__c(): string | null {
        return this.Get('NU__Donation__c');
    }
    set NU__Donation__c(value: string | null) {
        this.Set('NU__Donation__c', value);
    }

    /**
    * * Field Name: NU__EventBadge__c
    * * Display Name: NU__Event Badge __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__EventBadge__c(): string | null {
        return this.Get('NU__EventBadge__c');
    }
    set NU__EventBadge__c(value: string | null) {
        this.Set('NU__EventBadge__c', value);
    }

    /**
    * * Field Name: NU__ExternalID__c
    * * Display Name: NU__External ID__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__ExternalID__c(): string | null {
        return this.Get('NU__ExternalID__c');
    }
    set NU__ExternalID__c(value: string | null) {
        this.Set('NU__ExternalID__c', value);
    }

    /**
    * * Field Name: NU__IsShippable__c
    * * Display Name: NU__Is Shippable __c
    * * SQL Data Type: bit
    */
    get NU__IsShippable__c(): boolean | null {
        return this.Get('NU__IsShippable__c');
    }
    set NU__IsShippable__c(value: boolean | null) {
        this.Set('NU__IsShippable__c', value);
    }

    /**
    * * Field Name: NU__IsTaxable__c
    * * Display Name: NU__Is Taxable __c
    * * SQL Data Type: bit
    */
    get NU__IsTaxable__c(): boolean | null {
        return this.Get('NU__IsTaxable__c');
    }
    set NU__IsTaxable__c(value: boolean | null) {
        this.Set('NU__IsTaxable__c', value);
    }

    /**
    * * Field Name: NU__MembershipTypeProductLink__c
    * * Display Name: NU__Membership Type Product Link __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__MembershipTypeProductLink__c(): string | null {
        return this.Get('NU__MembershipTypeProductLink__c');
    }
    set NU__MembershipTypeProductLink__c(value: string | null) {
        this.Set('NU__MembershipTypeProductLink__c', value);
    }

    /**
    * * Field Name: NU__Membership__c
    * * Display Name: NU__Membership __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Membership__c(): string | null {
        return this.Get('NU__Membership__c');
    }
    set NU__Membership__c(value: string | null) {
        this.Set('NU__Membership__c', value);
    }

    /**
    * * Field Name: NU__Merchandise__c
    * * Display Name: NU__Merchandise __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Merchandise__c(): string | null {
        return this.Get('NU__Merchandise__c');
    }
    set NU__Merchandise__c(value: string | null) {
        this.Set('NU__Merchandise__c', value);
    }

    /**
    * * Field Name: NU__Quantity__c
    * * Display Name: Quantity
    * * SQL Data Type: decimal(18, 0)
    */
    get NU__Quantity__c(): number | null {
        return this.Get('NU__Quantity__c');
    }
    set NU__Quantity__c(value: number | null) {
        this.Set('NU__Quantity__c', value);
    }

    /**
    * * Field Name: NU__Registration2__c
    * * Display Name: NU__Registration 2__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Registration2__c(): string | null {
        return this.Get('NU__Registration2__c');
    }
    set NU__Registration2__c(value: string | null) {
        this.Set('NU__Registration2__c', value);
    }

    /**
    * * Field Name: NU__Status__c
    * * Display Name: Status
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Status__c(): string | null {
        return this.Get('NU__Status__c');
    }
    set NU__Status__c(value: string | null) {
        this.Set('NU__Status__c', value);
    }

    /**
    * * Field Name: NU__Subscription__c
    * * Display Name: NU__Subscription __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Subscription__c(): string | null {
        return this.Get('NU__Subscription__c');
    }
    set NU__Subscription__c(value: string | null) {
        this.Set('NU__Subscription__c', value);
    }

    /**
    * * Field Name: NU__TotalPrice__c
    * * Display Name: Total Price
    * * SQL Data Type: decimal(18, 2)
    */
    get NU__TotalPrice__c(): number | null {
        return this.Get('NU__TotalPrice__c');
    }
    set NU__TotalPrice__c(value: number | null) {
        this.Set('NU__TotalPrice__c', value);
    }

    /**
    * * Field Name: NU__TransactionDate__c
    * * Display Name: NU__Transaction Date __c
    * * SQL Data Type: datetimeoffset
    */
    get NU__TransactionDate__c(): Date | null {
        return this.Get('NU__TransactionDate__c');
    }

    /**
    * * Field Name: NU__UnitPrice__c
    * * Display Name: Unit Price
    * * SQL Data Type: decimal(11, 2)
    */
    get NU__UnitPrice__c(): number | null {
        return this.Get('NU__UnitPrice__c');
    }
    set NU__UnitPrice__c(value: number | null) {
        this.Set('NU__UnitPrice__c', value);
    }

    /**
    * * Field Name: NU__Miscellaneous__c
    * * Display Name: NU__Miscellaneous __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Miscellaneous__c(): string | null {
        return this.Get('NU__Miscellaneous__c');
    }
    set NU__Miscellaneous__c(value: string | null) {
        this.Set('NU__Miscellaneous__c', value);
    }

    /**
    * * Field Name: InstitutionAtMembership__c
    * * Display Name: Member Institution
    * * SQL Data Type: nvarchar(MAX)
    */
    get InstitutionAtMembership__c(): string | null {
        return this.Get('InstitutionAtMembership__c');
    }
    set InstitutionAtMembership__c(value: string | null) {
        this.Set('InstitutionAtMembership__c', value);
    }

    /**
    * * Field Name: MemberFirstName__c
    * * Display Name: Member First Name
    * * SQL Data Type: nvarchar(MAX)
    */
    get MemberFirstName__c(): string | null {
        return this.Get('MemberFirstName__c');
    }
    set MemberFirstName__c(value: string | null) {
        this.Set('MemberFirstName__c', value);
    }

    /**
    * * Field Name: MemberLastName__c
    * * Display Name: Member Last Name
    * * SQL Data Type: nvarchar(MAX)
    */
    get MemberLastName__c(): string | null {
        return this.Get('MemberLastName__c');
    }
    set MemberLastName__c(value: string | null) {
        this.Set('MemberLastName__c', value);
    }

    /**
    * * Field Name: Paid_to_SMSTA__c
    * * Display Name: Paid _to _SMSTA__c
    * * SQL Data Type: bit
    */
    get Paid_to_SMSTA__c(): boolean | null {
        return this.Get('Paid_to_SMSTA__c');
    }
    set Paid_to_SMSTA__c(value: boolean | null) {
        this.Set('Paid_to_SMSTA__c', value);
    }

    /**
    * * Field Name: SMSTAChapterDuesProduct__c
    * * Display Name: SMSTAChapter Dues Product __c
    * * SQL Data Type: bit
    */
    get SMSTAChapterDuesProduct__c(): boolean | null {
        return this.Get('SMSTAChapterDuesProduct__c');
    }
    set SMSTAChapterDuesProduct__c(value: boolean | null) {
        this.Set('SMSTAChapterDuesProduct__c', value);
    }

    /**
    * * Field Name: NU__Product2__c
    * * Display Name: NU__Product 2__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Product2__c(): string | null {
        return this.Get('NU__Product2__c');
    }
    set NU__Product2__c(value: string | null) {
        this.Set('NU__Product2__c', value);
    }

    /**
    * * Field Name: CustomerExtID__c
    * * Display Name: Customer Ext ID__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get CustomerExtID__c(): string | null {
        return this.Get('CustomerExtID__c');
    }
    set CustomerExtID__c(value: string | null) {
        this.Set('CustomerExtID__c', value);
    }

    /**
    * * Field Name: namz__CartItemLine__c
    * * Display Name: namz __Cart Item Line __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get namz__CartItemLine__c(): string | null {
        return this.Get('namz__CartItemLine__c');
    }
    set namz__CartItemLine__c(value: string | null) {
        this.Set('namz__CartItemLine__c', value);
    }

    /**
    * * Field Name: namz__ParentProduct__c
    * * Display Name: namz __Parent Product __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get namz__ParentProduct__c(): string | null {
        return this.Get('namz__ParentProduct__c');
    }
    set namz__ParentProduct__c(value: string | null) {
        this.Set('namz__ParentProduct__c', value);
    }

    /**
    * * Field Name: namz__UnitPriceOverride__c
    * * Display Name: namz __Unit Price Override __c
    * * SQL Data Type: decimal(11, 2)
    */
    get namz__UnitPriceOverride__c(): number | null {
        return this.Get('namz__UnitPriceOverride__c');
    }
    set namz__UnitPriceOverride__c(value: number | null) {
        this.Set('namz__UnitPriceOverride__c', value);
    }

    /**
    * * Field Name: namz__OrderState__c
    * * Display Name: namz __Order State __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get namz__OrderState__c(): string | null {
        return this.Get('namz__OrderState__c');
    }
    set namz__OrderState__c(value: string | null) {
        this.Set('namz__OrderState__c', value);
    }

    /**
    * * Field Name: NU__NetValue__c
    * * Display Name: NU__Net Value __c
    * * SQL Data Type: decimal(18, 2)
    */
    get NU__NetValue__c(): number | null {
        return this.Get('NU__NetValue__c');
    }
    set NU__NetValue__c(value: number | null) {
        this.Set('NU__NetValue__c', value);
    }

    /**
    * * Field Name: NU__TaxValue__c
    * * Display Name: NU__Tax Value __c
    * * SQL Data Type: decimal(18, 2)
    */
    get NU__TaxValue__c(): number | null {
        return this.Get('NU__TaxValue__c');
    }
    set NU__TaxValue__c(value: number | null) {
        this.Set('NU__TaxValue__c', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Order Items - strongly typed entity sub-class
 * * Schema: nams
 * * Base Table: NU__OrderItem__c
 * * Base View: vwNU__OrderItem__cs
 * * Primary Key: Id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Order Items')
export class NU__OrderItem__cEntity extends BaseEntity<NU__OrderItem__cEntityType> {
    /**
    * Loads the Order Items record from the database
    * @param Id: string - primary key value to load the Order Items record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof NU__OrderItem__cEntity
    * @method
    * @override
    */
    public async Load(Id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'Id', Value: Id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: Id
    * * Display Name: Id
    * * SQL Data Type: nvarchar(50)
    */
    get Id(): string {
        return this.Get('Id');
    }
    set Id(value: string) {
        this.Set('Id', value);
    }

    /**
    * * Field Name: IsDeleted
    * * Display Name: Is Deleted
    * * SQL Data Type: bit
    */
    get IsDeleted(): boolean | null {
        return this.Get('IsDeleted');
    }
    set IsDeleted(value: boolean | null) {
        this.Set('IsDeleted', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Order Item
    * * SQL Data Type: nvarchar(MAX)
    */
    get Name(): string | null {
        return this.Get('Name');
    }
    set Name(value: string | null) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: RecordTypeId
    * * Display Name: Record Type Id
    * * SQL Data Type: nvarchar(MAX)
    */
    get RecordTypeId(): string | null {
        return this.Get('RecordTypeId');
    }
    set RecordTypeId(value: string | null) {
        this.Set('RecordTypeId', value);
    }

    /**
    * * Field Name: CreatedById
    * * Display Name: Created By Id
    * * SQL Data Type: nvarchar(MAX)
    */
    get CreatedById(): string | null {
        return this.Get('CreatedById');
    }
    set CreatedById(value: string | null) {
        this.Set('CreatedById', value);
    }

    /**
    * * Field Name: LastModifiedDate
    * * Display Name: Last Modified Date
    * * SQL Data Type: datetimeoffset
    */
    get LastModifiedDate(): Date | null {
        return this.Get('LastModifiedDate');
    }

    /**
    * * Field Name: LastModifiedById
    * * Display Name: Last Modified By Id
    * * SQL Data Type: nvarchar(MAX)
    */
    get LastModifiedById(): string | null {
        return this.Get('LastModifiedById');
    }
    set LastModifiedById(value: string | null) {
        this.Set('LastModifiedById', value);
    }

    /**
    * * Field Name: SystemModstamp
    * * Display Name: System Modstamp
    * * SQL Data Type: datetimeoffset
    */
    get SystemModstamp(): Date | null {
        return this.Get('SystemModstamp');
    }

    /**
    * * Field Name: LastActivityDate
    * * Display Name: Last Activity Date
    * * SQL Data Type: datetimeoffset
    */
    get LastActivityDate(): Date | null {
        return this.Get('LastActivityDate');
    }

    /**
    * * Field Name: NU__Order__c
    * * Display Name: NU__Order __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Order__c(): string | null {
        return this.Get('NU__Order__c');
    }
    set NU__Order__c(value: string | null) {
        this.Set('NU__Order__c', value);
    }

    /**
    * * Field Name: NU__ARGLAccount__c
    * * Display Name: NU__ARGLAccount __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__ARGLAccount__c(): string | null {
        return this.Get('NU__ARGLAccount__c');
    }
    set NU__ARGLAccount__c(value: string | null) {
        this.Set('NU__ARGLAccount__c', value);
    }

    /**
    * * Field Name: NU__Balance__c
    * * Display Name: NU__Balance __c
    * * SQL Data Type: decimal(18, 2)
    */
    get NU__Balance__c(): number | null {
        return this.Get('NU__Balance__c');
    }
    set NU__Balance__c(value: number | null) {
        this.Set('NU__Balance__c', value);
    }

    /**
    * * Field Name: NU__CustomerPrimaryAffiliation__c
    * * Display Name: NU__Customer Primary Affiliation __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__CustomerPrimaryAffiliation__c(): string | null {
        return this.Get('NU__CustomerPrimaryAffiliation__c');
    }
    set NU__CustomerPrimaryAffiliation__c(value: string | null) {
        this.Set('NU__CustomerPrimaryAffiliation__c', value);
    }

    /**
    * * Field Name: NU__Customer__c
    * * Display Name: NU__Customer __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Customer__c(): string | null {
        return this.Get('NU__Customer__c');
    }
    set NU__Customer__c(value: string | null) {
        this.Set('NU__Customer__c', value);
    }

    /**
    * * Field Name: NU__ExternalID__c
    * * Display Name: NU__External ID__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__ExternalID__c(): string | null {
        return this.Get('NU__ExternalID__c');
    }
    set NU__ExternalID__c(value: string | null) {
        this.Set('NU__ExternalID__c', value);
    }

    /**
    * * Field Name: NU__GrandTotal__c
    * * Display Name: NU__Grand Total __c
    * * SQL Data Type: decimal(18, 2)
    */
    get NU__GrandTotal__c(): number | null {
        return this.Get('NU__GrandTotal__c');
    }
    set NU__GrandTotal__c(value: number | null) {
        this.Set('NU__GrandTotal__c', value);
    }

    /**
    * * Field Name: NU__IsShipped__c
    * * Display Name: NU__Is Shipped __c
    * * SQL Data Type: bit
    */
    get NU__IsShipped__c(): boolean | null {
        return this.Get('NU__IsShipped__c');
    }
    set NU__IsShipped__c(value: boolean | null) {
        this.Set('NU__IsShipped__c', value);
    }

    /**
    * * Field Name: NU__PriceClass__c
    * * Display Name: NU__Price Class __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__PriceClass__c(): string | null {
        return this.Get('NU__PriceClass__c');
    }
    set NU__PriceClass__c(value: string | null) {
        this.Set('NU__PriceClass__c', value);
    }

    /**
    * * Field Name: NU__SalesTax__c
    * * Display Name: NU__Sales Tax __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__SalesTax__c(): string | null {
        return this.Get('NU__SalesTax__c');
    }
    set NU__SalesTax__c(value: string | null) {
        this.Set('NU__SalesTax__c', value);
    }

    /**
    * * Field Name: NU__ShippingAddress__c
    * * Display Name: NU__Shipping Address __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__ShippingAddress__c(): string | null {
        return this.Get('NU__ShippingAddress__c');
    }
    set NU__ShippingAddress__c(value: string | null) {
        this.Set('NU__ShippingAddress__c', value);
    }

    /**
    * * Field Name: NU__ShippingCity__c
    * * Display Name: NU__Shipping City __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__ShippingCity__c(): string | null {
        return this.Get('NU__ShippingCity__c');
    }
    set NU__ShippingCity__c(value: string | null) {
        this.Set('NU__ShippingCity__c', value);
    }

    /**
    * * Field Name: NU__ShippingCountry__c
    * * Display Name: NU__Shipping Country __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__ShippingCountry__c(): string | null {
        return this.Get('NU__ShippingCountry__c');
    }
    set NU__ShippingCountry__c(value: string | null) {
        this.Set('NU__ShippingCountry__c', value);
    }

    /**
    * * Field Name: NU__ShippingGLAccount__c
    * * Display Name: NU__Shipping GLAccount __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__ShippingGLAccount__c(): string | null {
        return this.Get('NU__ShippingGLAccount__c');
    }
    set NU__ShippingGLAccount__c(value: string | null) {
        this.Set('NU__ShippingGLAccount__c', value);
    }

    /**
    * * Field Name: NU__ShippingMethod__c
    * * Display Name: NU__Shipping Method __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__ShippingMethod__c(): string | null {
        return this.Get('NU__ShippingMethod__c');
    }
    set NU__ShippingMethod__c(value: string | null) {
        this.Set('NU__ShippingMethod__c', value);
    }

    /**
    * * Field Name: NU__ShippingPostalCode__c
    * * Display Name: NU__Shipping Postal Code __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__ShippingPostalCode__c(): string | null {
        return this.Get('NU__ShippingPostalCode__c');
    }
    set NU__ShippingPostalCode__c(value: string | null) {
        this.Set('NU__ShippingPostalCode__c', value);
    }

    /**
    * * Field Name: NU__ShippingState__c
    * * Display Name: NU__Shipping State __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__ShippingState__c(): string | null {
        return this.Get('NU__ShippingState__c');
    }
    set NU__ShippingState__c(value: string | null) {
        this.Set('NU__ShippingState__c', value);
    }

    /**
    * * Field Name: NU__ShippingStreet__c
    * * Display Name: NU__Shipping Street __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__ShippingStreet__c(): string | null {
        return this.Get('NU__ShippingStreet__c');
    }
    set NU__ShippingStreet__c(value: string | null) {
        this.Set('NU__ShippingStreet__c', value);
    }

    /**
    * * Field Name: NU__Source__c
    * * Display Name: NU__Source __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Source__c(): string | null {
        return this.Get('NU__Source__c');
    }
    set NU__Source__c(value: string | null) {
        this.Set('NU__Source__c', value);
    }

    /**
    * * Field Name: NU__Status__c
    * * Display Name: Status
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Status__c(): string | null {
        return this.Get('NU__Status__c');
    }
    set NU__Status__c(value: string | null) {
        this.Set('NU__Status__c', value);
    }

    /**
    * * Field Name: NU__TaxableTotal__c
    * * Display Name: NU__Taxable Total __c
    * * SQL Data Type: decimal(18, 2)
    */
    get NU__TaxableTotal__c(): number | null {
        return this.Get('NU__TaxableTotal__c');
    }
    set NU__TaxableTotal__c(value: number | null) {
        this.Set('NU__TaxableTotal__c', value);
    }

    /**
    * * Field Name: NU__TotalShippingAndTax__c
    * * Display Name: NU__Total Shipping And Tax __c
    * * SQL Data Type: decimal(18, 2)
    */
    get NU__TotalShippingAndTax__c(): number | null {
        return this.Get('NU__TotalShippingAndTax__c');
    }
    set NU__TotalShippingAndTax__c(value: number | null) {
        this.Set('NU__TotalShippingAndTax__c', value);
    }

    /**
    * * Field Name: NU__TotalShipping__c
    * * Display Name: NU__Total Shipping __c
    * * SQL Data Type: decimal(11, 2)
    */
    get NU__TotalShipping__c(): number | null {
        return this.Get('NU__TotalShipping__c');
    }
    set NU__TotalShipping__c(value: number | null) {
        this.Set('NU__TotalShipping__c', value);
    }

    /**
    * * Field Name: NU__TotalTax__c
    * * Display Name: NU__Total Tax __c
    * * SQL Data Type: decimal(11, 2)
    */
    get NU__TotalTax__c(): number | null {
        return this.Get('NU__TotalTax__c');
    }
    set NU__TotalTax__c(value: number | null) {
        this.Set('NU__TotalTax__c', value);
    }

    /**
    * * Field Name: NU__TransactionDate__c
    * * Display Name: Transaction Date
    * * SQL Data Type: datetimeoffset
    */
    get NU__TransactionDate__c(): Date | null {
        return this.Get('NU__TransactionDate__c');
    }

    /**
    * * Field Name: NU__AdjustmentDate__c
    * * Display Name: NU__Adjustment Date __c
    * * SQL Data Type: datetimeoffset
    */
    get NU__AdjustmentDate__c(): Date | null {
        return this.Get('NU__AdjustmentDate__c');
    }

    /**
    * * Field Name: NU__ShippingItemLineCount__c
    * * Display Name: NU__Shipping Item Line Count __c
    * * SQL Data Type: decimal(18, 0)
    */
    get NU__ShippingItemLineCount__c(): number | null {
        return this.Get('NU__ShippingItemLineCount__c');
    }
    set NU__ShippingItemLineCount__c(value: number | null) {
        this.Set('NU__ShippingItemLineCount__c', value);
    }

    /**
    * * Field Name: NU__SubTotal__c
    * * Display Name: NU__Sub Total __c
    * * SQL Data Type: decimal(18, 2)
    */
    get NU__SubTotal__c(): number | null {
        return this.Get('NU__SubTotal__c');
    }
    set NU__SubTotal__c(value: number | null) {
        this.Set('NU__SubTotal__c', value);
    }

    /**
    * * Field Name: NU__TaxableAmount__c
    * * Display Name: NU__Taxable Amount __c
    * * SQL Data Type: decimal(18, 2)
    */
    get NU__TaxableAmount__c(): number | null {
        return this.Get('NU__TaxableAmount__c');
    }
    set NU__TaxableAmount__c(value: number | null) {
        this.Set('NU__TaxableAmount__c', value);
    }

    /**
    * * Field Name: NU__TotalPayment__c
    * * Display Name: NU__Total Payment __c
    * * SQL Data Type: decimal(18, 2)
    */
    get NU__TotalPayment__c(): number | null {
        return this.Get('NU__TotalPayment__c');
    }
    set NU__TotalPayment__c(value: number | null) {
        this.Set('NU__TotalPayment__c', value);
    }

    /**
    * * Field Name: NU__Discounts__c
    * * Display Name: NU__Discounts __c
    * * SQL Data Type: decimal(18, 2)
    */
    get NU__Discounts__c(): number | null {
        return this.Get('NU__Discounts__c');
    }
    set NU__Discounts__c(value: number | null) {
        this.Set('NU__Discounts__c', value);
    }

    /**
    * * Field Name: Customer_Last_Name__c
    * * Display Name: Customer Last Name
    * * SQL Data Type: nvarchar(MAX)
    */
    get Customer_Last_Name__c(): string | null {
        return this.Get('Customer_Last_Name__c');
    }
    set Customer_Last_Name__c(value: string | null) {
        this.Set('Customer_Last_Name__c', value);
    }

    /**
    * * Field Name: NU__ShipMethod__c
    * * Display Name: NU__Ship Method __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__ShipMethod__c(): string | null {
        return this.Get('NU__ShipMethod__c');
    }
    set NU__ShipMethod__c(value: string | null) {
        this.Set('NU__ShipMethod__c', value);
    }

    /**
    * * Field Name: NU__RecordTypeName__c
    * * Display Name: Record Type Name
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__RecordTypeName__c(): string | null {
        return this.Get('NU__RecordTypeName__c');
    }
    set NU__RecordTypeName__c(value: string | null) {
        this.Set('NU__RecordTypeName__c', value);
    }

    /**
    * * Field Name: NU__Entity__c
    * * Display Name: NU__Entity __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Entity__c(): string | null {
        return this.Get('NU__Entity__c');
    }
    set NU__Entity__c(value: string | null) {
        this.Set('NU__Entity__c', value);
    }

    /**
    * * Field Name: NU__RecurringBalance__c
    * * Display Name: NU__Recurring Balance __c
    * * SQL Data Type: decimal(18, 2)
    */
    get NU__RecurringBalance__c(): number | null {
        return this.Get('NU__RecurringBalance__c');
    }
    set NU__RecurringBalance__c(value: number | null) {
        this.Set('NU__RecurringBalance__c', value);
    }

    /**
    * * Field Name: NU__BillingHistory__c
    * * Display Name: NU__Billing History __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__BillingHistory__c(): string | null {
        return this.Get('NU__BillingHistory__c');
    }
    set NU__BillingHistory__c(value: string | null) {
        this.Set('NU__BillingHistory__c', value);
    }

    /**
    * * Field Name: NU__AdjustmentVersion__c
    * * Display Name: NU__Adjustment Version __c
    * * SQL Data Type: decimal(18, 0)
    */
    get NU__AdjustmentVersion__c(): number | null {
        return this.Get('NU__AdjustmentVersion__c');
    }
    set NU__AdjustmentVersion__c(value: number | null) {
        this.Set('NU__AdjustmentVersion__c', value);
    }

    /**
    * * Field Name: NU__BillMe__c
    * * Display Name: NU__Bill Me __c
    * * SQL Data Type: bit
    */
    get NU__BillMe__c(): boolean | null {
        return this.Get('NU__BillMe__c');
    }
    set NU__BillMe__c(value: boolean | null) {
        this.Set('NU__BillMe__c', value);
    }

    /**
    * * Field Name: NU__Recurring__c
    * * Display Name: NU__Recurring __c
    * * SQL Data Type: bit
    */
    get NU__Recurring__c(): boolean | null {
        return this.Get('NU__Recurring__c');
    }
    set NU__Recurring__c(value: boolean | null) {
        this.Set('NU__Recurring__c', value);
    }

    /**
    * * Field Name: NU__TotalTaxableAmount__c
    * * Display Name: NU__Total Taxable Amount __c
    * * SQL Data Type: decimal(18, 2)
    */
    get NU__TotalTaxableAmount__c(): number | null {
        return this.Get('NU__TotalTaxableAmount__c');
    }
    set NU__TotalTaxableAmount__c(value: number | null) {
        this.Set('NU__TotalTaxableAmount__c', value);
    }

    /**
    * * Field Name: Opted_in_to_CTA_Dues__c
    * * Display Name: Opted _in _to _CTA_Dues __c
    * * SQL Data Type: bit
    */
    get Opted_in_to_CTA_Dues__c(): boolean | null {
        return this.Get('Opted_in_to_CTA_Dues__c');
    }
    set Opted_in_to_CTA_Dues__c(value: boolean | null) {
        this.Set('Opted_in_to_CTA_Dues__c', value);
    }

    /**
    * * Field Name: NU__Data__c
    * * Display Name: NU__Data __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Data__c(): string | null {
        return this.Get('NU__Data__c');
    }
    set NU__Data__c(value: string | null) {
        this.Set('NU__Data__c', value);
    }

    /**
    * * Field Name: namz__CartItem__c
    * * Display Name: namz __Cart Item __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get namz__CartItem__c(): string | null {
        return this.Get('namz__CartItem__c');
    }
    set namz__CartItem__c(value: string | null) {
        this.Set('namz__CartItem__c', value);
    }

    /**
    * * Field Name: namz__Appeal__c
    * * Display Name: namz __Appeal __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get namz__Appeal__c(): string | null {
        return this.Get('namz__Appeal__c');
    }
    set namz__Appeal__c(value: string | null) {
        this.Set('namz__Appeal__c', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Troubleshoot
    * * Display Name: Troubleshoot
    * * SQL Data Type: nvarchar(50)
    */
    get Troubleshoot(): string | null {
        return this.Get('Troubleshoot');
    }
    set Troubleshoot(value: string | null) {
        this.Set('Troubleshoot', value);
    }
}


/**
 * Orders - strongly typed entity sub-class
 * * Schema: nams
 * * Base Table: NU__Order__c
 * * Base View: vwNU__Order__cs
 * * Primary Key: Id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Orders')
export class NU__Order__cEntity extends BaseEntity<NU__Order__cEntityType> {
    /**
    * Loads the Orders record from the database
    * @param Id: string - primary key value to load the Orders record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof NU__Order__cEntity
    * @method
    * @override
    */
    public async Load(Id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'Id', Value: Id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: Id
    * * Display Name: Id
    * * SQL Data Type: nvarchar(50)
    */
    get Id(): string {
        return this.Get('Id');
    }
    set Id(value: string) {
        this.Set('Id', value);
    }

    /**
    * * Field Name: OwnerId
    * * Display Name: Owner Id
    * * SQL Data Type: nvarchar(MAX)
    */
    get OwnerId(): string | null {
        return this.Get('OwnerId');
    }
    set OwnerId(value: string | null) {
        this.Set('OwnerId', value);
    }

    /**
    * * Field Name: IsDeleted
    * * Display Name: Is Deleted
    * * SQL Data Type: bit
    */
    get IsDeleted(): boolean | null {
        return this.Get('IsDeleted');
    }
    set IsDeleted(value: boolean | null) {
        this.Set('IsDeleted', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Order Name
    * * SQL Data Type: nvarchar(MAX)
    */
    get Name(): string | null {
        return this.Get('Name');
    }
    set Name(value: string | null) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: CreatedById
    * * Display Name: Created By Id
    * * SQL Data Type: nvarchar(MAX)
    */
    get CreatedById(): string | null {
        return this.Get('CreatedById');
    }
    set CreatedById(value: string | null) {
        this.Set('CreatedById', value);
    }

    /**
    * * Field Name: LastModifiedDate
    * * Display Name: Last Modified Date
    * * SQL Data Type: datetimeoffset
    */
    get LastModifiedDate(): Date | null {
        return this.Get('LastModifiedDate');
    }

    /**
    * * Field Name: LastModifiedById
    * * Display Name: Last Modified By Id
    * * SQL Data Type: nvarchar(MAX)
    */
    get LastModifiedById(): string | null {
        return this.Get('LastModifiedById');
    }
    set LastModifiedById(value: string | null) {
        this.Set('LastModifiedById', value);
    }

    /**
    * * Field Name: SystemModstamp
    * * Display Name: System Modstamp
    * * SQL Data Type: datetimeoffset
    */
    get SystemModstamp(): Date | null {
        return this.Get('SystemModstamp');
    }

    /**
    * * Field Name: LastActivityDate
    * * Display Name: Last Activity Date
    * * SQL Data Type: datetimeoffset
    */
    get LastActivityDate(): Date | null {
        return this.Get('LastActivityDate');
    }

    /**
    * * Field Name: LastViewedDate
    * * Display Name: Last Viewed Date
    * * SQL Data Type: datetimeoffset
    */
    get LastViewedDate(): Date | null {
        return this.Get('LastViewedDate');
    }

    /**
    * * Field Name: LastReferencedDate
    * * Display Name: Last Referenced Date
    * * SQL Data Type: datetimeoffset
    */
    get LastReferencedDate(): Date | null {
        return this.Get('LastReferencedDate');
    }

    /**
    * * Field Name: NU__AdditionalEmail__c
    * * Display Name: Email
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__AdditionalEmail__c(): string | null {
        return this.Get('NU__AdditionalEmail__c');
    }
    set NU__AdditionalEmail__c(value: string | null) {
        this.Set('NU__AdditionalEmail__c', value);
    }

    /**
    * * Field Name: NU__Balance__c
    * * Display Name: NU__Balance __c
    * * SQL Data Type: decimal(18, 2)
    */
    get NU__Balance__c(): number | null {
        return this.Get('NU__Balance__c');
    }
    set NU__Balance__c(value: number | null) {
        this.Set('NU__Balance__c', value);
    }

    /**
    * * Field Name: NU__BillToPrimaryAffiliation__c
    * * Display Name: NU__Bill To Primary Affiliation __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__BillToPrimaryAffiliation__c(): string | null {
        return this.Get('NU__BillToPrimaryAffiliation__c');
    }
    set NU__BillToPrimaryAffiliation__c(value: string | null) {
        this.Set('NU__BillToPrimaryAffiliation__c', value);
    }

    /**
    * * Field Name: NU__BillTo__c
    * * Display Name: NU__Bill To __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__BillTo__c(): string | null {
        return this.Get('NU__BillTo__c');
    }
    set NU__BillTo__c(value: string | null) {
        this.Set('NU__BillTo__c', value);
    }

    /**
    * * Field Name: NU__Entity__c
    * * Display Name: NU__Entity __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Entity__c(): string | null {
        return this.Get('NU__Entity__c');
    }
    set NU__Entity__c(value: string | null) {
        this.Set('NU__Entity__c', value);
    }

    /**
    * * Field Name: NU__ExternalId__c
    * * Display Name: NU__External Id __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__ExternalId__c(): string | null {
        return this.Get('NU__ExternalId__c');
    }
    set NU__ExternalId__c(value: string | null) {
        this.Set('NU__ExternalId__c', value);
    }

    /**
    * * Field Name: NU__InvoiceARAging__c
    * * Display Name: NU__Invoice ARAging __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__InvoiceARAging__c(): string | null {
        return this.Get('NU__InvoiceARAging__c');
    }
    set NU__InvoiceARAging__c(value: string | null) {
        this.Set('NU__InvoiceARAging__c', value);
    }

    /**
    * * Field Name: NU__InvoiceAgingScheduleCategory__c
    * * Display Name: NU__Invoice Aging Schedule Category __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__InvoiceAgingScheduleCategory__c(): string | null {
        return this.Get('NU__InvoiceAgingScheduleCategory__c');
    }
    set NU__InvoiceAgingScheduleCategory__c(value: string | null) {
        this.Set('NU__InvoiceAgingScheduleCategory__c', value);
    }

    /**
    * * Field Name: NU__InvoiceDate__c
    * * Display Name: Invoice Date
    * * SQL Data Type: datetimeoffset
    */
    get NU__InvoiceDate__c(): Date | null {
        return this.Get('NU__InvoiceDate__c');
    }

    /**
    * * Field Name: NU__InvoiceDaysOutstanding__c
    * * Display Name: NU__Invoice Days Outstanding __c
    * * SQL Data Type: decimal(18, 0)
    */
    get NU__InvoiceDaysOutstanding__c(): number | null {
        return this.Get('NU__InvoiceDaysOutstanding__c');
    }
    set NU__InvoiceDaysOutstanding__c(value: number | null) {
        this.Set('NU__InvoiceDaysOutstanding__c', value);
    }

    /**
    * * Field Name: NU__InvoiceDescription__c
    * * Display Name: NU__Invoice Description __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__InvoiceDescription__c(): string | null {
        return this.Get('NU__InvoiceDescription__c');
    }
    set NU__InvoiceDescription__c(value: string | null) {
        this.Set('NU__InvoiceDescription__c', value);
    }

    /**
    * * Field Name: NU__InvoiceDueDate__c
    * * Display Name: Invoice Due Date
    * * SQL Data Type: datetimeoffset
    */
    get NU__InvoiceDueDate__c(): Date | null {
        return this.Get('NU__InvoiceDueDate__c');
    }

    /**
    * * Field Name: NU__InvoiceEmail__c
    * * Display Name: NU__Invoice Email __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__InvoiceEmail__c(): string | null {
        return this.Get('NU__InvoiceEmail__c');
    }
    set NU__InvoiceEmail__c(value: string | null) {
        this.Set('NU__InvoiceEmail__c', value);
    }

    /**
    * * Field Name: NU__InvoiceGenerated__c
    * * Display Name: NU__Invoice Generated __c
    * * SQL Data Type: bit
    */
    get NU__InvoiceGenerated__c(): boolean | null {
        return this.Get('NU__InvoiceGenerated__c');
    }
    set NU__InvoiceGenerated__c(value: boolean | null) {
        this.Set('NU__InvoiceGenerated__c', value);
    }

    /**
    * * Field Name: NU__InvoiceNumber__c
    * * Display Name: Invoice Number
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__InvoiceNumber__c(): string | null {
        return this.Get('NU__InvoiceNumber__c');
    }
    set NU__InvoiceNumber__c(value: string | null) {
        this.Set('NU__InvoiceNumber__c', value);
    }

    /**
    * * Field Name: NU__InvoiceTerm__c
    * * Display Name: NU__Invoice Term __c
    * * SQL Data Type: decimal(3, 0)
    */
    get NU__InvoiceTerm__c(): number | null {
        return this.Get('NU__InvoiceTerm__c');
    }
    set NU__InvoiceTerm__c(value: number | null) {
        this.Set('NU__InvoiceTerm__c', value);
    }

    /**
    * * Field Name: NU__PurchaseOrderNumber__c
    * * Display Name: NU__Purchase Order Number __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__PurchaseOrderNumber__c(): string | null {
        return this.Get('NU__PurchaseOrderNumber__c');
    }
    set NU__PurchaseOrderNumber__c(value: string | null) {
        this.Set('NU__PurchaseOrderNumber__c', value);
    }

    /**
    * * Field Name: NU__Search__c
    * * Display Name: Name
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Search__c(): string | null {
        return this.Get('NU__Search__c');
    }
    set NU__Search__c(value: string | null) {
        this.Set('NU__Search__c', value);
    }

    /**
    * * Field Name: NU__SelfServiceOrderNumber__c
    * * Display Name: NU__Self Service Order Number __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__SelfServiceOrderNumber__c(): string | null {
        return this.Get('NU__SelfServiceOrderNumber__c');
    }
    set NU__SelfServiceOrderNumber__c(value: string | null) {
        this.Set('NU__SelfServiceOrderNumber__c', value);
    }

    /**
    * * Field Name: NU__Status__c
    * * Display Name: Status
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Status__c(): string | null {
        return this.Get('NU__Status__c');
    }
    set NU__Status__c(value: string | null) {
        this.Set('NU__Status__c', value);
    }

    /**
    * * Field Name: NU__TotalShippingAndTax__c
    * * Display Name: NU__Total Shipping And Tax __c
    * * SQL Data Type: decimal(18, 2)
    */
    get NU__TotalShippingAndTax__c(): number | null {
        return this.Get('NU__TotalShippingAndTax__c');
    }
    set NU__TotalShippingAndTax__c(value: number | null) {
        this.Set('NU__TotalShippingAndTax__c', value);
    }

    /**
    * * Field Name: NU__TransactionDate__c
    * * Display Name: Transaction Date
    * * SQL Data Type: datetimeoffset
    */
    get NU__TransactionDate__c(): Date | null {
        return this.Get('NU__TransactionDate__c');
    }

    /**
    * * Field Name: NU__ActiveOrderItemCount__c
    * * Display Name: NU__Active Order Item Count __c
    * * SQL Data Type: decimal(18, 0)
    */
    get NU__ActiveOrderItemCount__c(): number | null {
        return this.Get('NU__ActiveOrderItemCount__c');
    }
    set NU__ActiveOrderItemCount__c(value: number | null) {
        this.Set('NU__ActiveOrderItemCount__c', value);
    }

    /**
    * * Field Name: NU__AdjustmentDate__c
    * * Display Name: NU__Adjustment Date __c
    * * SQL Data Type: datetimeoffset
    */
    get NU__AdjustmentDate__c(): Date | null {
        return this.Get('NU__AdjustmentDate__c');
    }

    /**
    * * Field Name: NU__GrandTotal__c
    * * Display Name: Grand Total
    * * SQL Data Type: decimal(18, 2)
    */
    get NU__GrandTotal__c(): number | null {
        return this.Get('NU__GrandTotal__c');
    }
    set NU__GrandTotal__c(value: number | null) {
        this.Set('NU__GrandTotal__c', value);
    }

    /**
    * * Field Name: NU__SubTotal__c
    * * Display Name: NU__Sub Total __c
    * * SQL Data Type: decimal(18, 2)
    */
    get NU__SubTotal__c(): number | null {
        return this.Get('NU__SubTotal__c');
    }
    set NU__SubTotal__c(value: number | null) {
        this.Set('NU__SubTotal__c', value);
    }

    /**
    * * Field Name: NU__TotalPayment__c
    * * Display Name: NU__Total Payment __c
    * * SQL Data Type: decimal(18, 2)
    */
    get NU__TotalPayment__c(): number | null {
        return this.Get('NU__TotalPayment__c');
    }
    set NU__TotalPayment__c(value: number | null) {
        this.Set('NU__TotalPayment__c', value);
    }

    /**
    * * Field Name: NU__TotalShipping__c
    * * Display Name: NU__Total Shipping __c
    * * SQL Data Type: decimal(11, 2)
    */
    get NU__TotalShipping__c(): number | null {
        return this.Get('NU__TotalShipping__c');
    }
    set NU__TotalShipping__c(value: number | null) {
        this.Set('NU__TotalShipping__c', value);
    }

    /**
    * * Field Name: NU__TotalTax__c
    * * Display Name: NU__Total Tax __c
    * * SQL Data Type: decimal(11, 2)
    */
    get NU__TotalTax__c(): number | null {
        return this.Get('NU__TotalTax__c');
    }
    set NU__TotalTax__c(value: number | null) {
        this.Set('NU__TotalTax__c', value);
    }

    /**
    * * Field Name: AccrualDues__c
    * * Display Name: Accrual Dues __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get AccrualDues__c(): string | null {
        return this.Get('AccrualDues__c');
    }
    set AccrualDues__c(value: string | null) {
        this.Set('AccrualDues__c', value);
    }

    /**
    * * Field Name: NU__TotalDiscounts__c
    * * Display Name: NU__Total Discounts __c
    * * SQL Data Type: decimal(18, 2)
    */
    get NU__TotalDiscounts__c(): number | null {
        return this.Get('NU__TotalDiscounts__c');
    }
    set NU__TotalDiscounts__c(value: number | null) {
        this.Set('NU__TotalDiscounts__c', value);
    }

    /**
    * * Field Name: NU__RecurringBalance__c
    * * Display Name: NU__Recurring Balance __c
    * * SQL Data Type: decimal(18, 2)
    */
    get NU__RecurringBalance__c(): number | null {
        return this.Get('NU__RecurringBalance__c');
    }
    set NU__RecurringBalance__c(value: number | null) {
        this.Set('NU__RecurringBalance__c', value);
    }

    /**
    * * Field Name: NU__Purpose__c
    * * Display Name: NU__Purpose __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Purpose__c(): string | null {
        return this.Get('NU__Purpose__c');
    }
    set NU__Purpose__c(value: string | null) {
        this.Set('NU__Purpose__c', value);
    }

    /**
    * * Field Name: NU__BillMe__c
    * * Display Name: NU__Bill Me __c
    * * SQL Data Type: bit
    */
    get NU__BillMe__c(): boolean | null {
        return this.Get('NU__BillMe__c');
    }
    set NU__BillMe__c(value: boolean | null) {
        this.Set('NU__BillMe__c', value);
    }

    /**
    * * Field Name: NU__AdditionalEmails__c
    * * Display Name: NU__Additional Emails __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__AdditionalEmails__c(): string | null {
        return this.Get('NU__AdditionalEmails__c');
    }
    set NU__AdditionalEmails__c(value: string | null) {
        this.Set('NU__AdditionalEmails__c', value);
    }

    /**
    * * Field Name: NU__ConfirmationEmail__c
    * * Display Name: NU__Confirmation Email __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__ConfirmationEmail__c(): string | null {
        return this.Get('NU__ConfirmationEmail__c');
    }
    set NU__ConfirmationEmail__c(value: string | null) {
        this.Set('NU__ConfirmationEmail__c', value);
    }

    /**
    * * Field Name: NU__Identifier__c
    * * Display Name: NU__Identifier __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Identifier__c(): string | null {
        return this.Get('NU__Identifier__c');
    }
    set NU__Identifier__c(value: string | null) {
        this.Set('NU__Identifier__c', value);
    }

    /**
    * * Field Name: NU__PaymentUrl__c
    * * Display Name: NU__Payment Url __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__PaymentUrl__c(): string | null {
        return this.Get('NU__PaymentUrl__c');
    }
    set NU__PaymentUrl__c(value: string | null) {
        this.Set('NU__PaymentUrl__c', value);
    }

    /**
    * * Field Name: OnAutopay__c
    * * Display Name: On Autopay __c
    * * SQL Data Type: bit
    */
    get OnAutopay__c(): boolean | null {
        return this.Get('OnAutopay__c');
    }
    set OnAutopay__c(value: boolean | null) {
        this.Set('OnAutopay__c', value);
    }

    /**
    * * Field Name: NU__ExternalTaxId__c
    * * Display Name: NU__External Tax Id __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__ExternalTaxId__c(): string | null {
        return this.Get('NU__ExternalTaxId__c');
    }
    set NU__ExternalTaxId__c(value: string | null) {
        this.Set('NU__ExternalTaxId__c', value);
    }

    /**
    * * Field Name: NU__ExternalTaxTransactionStatus__c
    * * Display Name: NU__External Tax Transaction Status __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__ExternalTaxTransactionStatus__c(): string | null {
        return this.Get('NU__ExternalTaxTransactionStatus__c');
    }
    set NU__ExternalTaxTransactionStatus__c(value: string | null) {
        this.Set('NU__ExternalTaxTransactionStatus__c', value);
    }

    /**
    * * Field Name: IsCreatedByCHUser__c
    * * Display Name: Is Created By CHUser __c
    * * SQL Data Type: bit
    */
    get IsCreatedByCHUser__c(): boolean | null {
        return this.Get('IsCreatedByCHUser__c');
    }
    set IsCreatedByCHUser__c(value: boolean | null) {
        this.Set('IsCreatedByCHUser__c', value);
    }

    /**
    * * Field Name: namz__ActiveShoppingCart__c
    * * Display Name: namz __Active Shopping Cart __c
    * * SQL Data Type: bit
    */
    get namz__ActiveShoppingCart__c(): boolean | null {
        return this.Get('namz__ActiveShoppingCart__c');
    }
    set namz__ActiveShoppingCart__c(value: boolean | null) {
        this.Set('namz__ActiveShoppingCart__c', value);
    }

    /**
    * * Field Name: namz__Cart__c
    * * Display Name: namz __Cart __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get namz__Cart__c(): string | null {
        return this.Get('namz__Cart__c');
    }
    set namz__Cart__c(value: string | null) {
        this.Set('namz__Cart__c', value);
    }

    /**
    * * Field Name: namz__GuestFirstName__c
    * * Display Name: namz __Guest First Name __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get namz__GuestFirstName__c(): string | null {
        return this.Get('namz__GuestFirstName__c');
    }
    set namz__GuestFirstName__c(value: string | null) {
        this.Set('namz__GuestFirstName__c', value);
    }

    /**
    * * Field Name: namz__GuestLastName__c
    * * Display Name: namz __Guest Last Name __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get namz__GuestLastName__c(): string | null {
        return this.Get('namz__GuestLastName__c');
    }
    set namz__GuestLastName__c(value: string | null) {
        this.Set('namz__GuestLastName__c', value);
    }

    /**
    * * Field Name: namz__State__c
    * * Display Name: namz __State __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get namz__State__c(): string | null {
        return this.Get('namz__State__c');
    }
    set namz__State__c(value: string | null) {
        this.Set('namz__State__c', value);
    }

    /**
    * * Field Name: namz__LightningCheckoutUrl__c
    * * Display Name: namz __Lightning Checkout Url __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get namz__LightningCheckoutUrl__c(): string | null {
        return this.Get('namz__LightningCheckoutUrl__c');
    }
    set namz__LightningCheckoutUrl__c(value: string | null) {
        this.Set('namz__LightningCheckoutUrl__c', value);
    }

    /**
    * * Field Name: namz__ForGuest__c
    * * Display Name: namz __For Guest __c
    * * SQL Data Type: bit
    */
    get namz__ForGuest__c(): boolean | null {
        return this.Get('namz__ForGuest__c');
    }
    set namz__ForGuest__c(value: boolean | null) {
        this.Set('namz__ForGuest__c', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Troubleshoot
    * * Display Name: Troubleshoot
    * * SQL Data Type: nvarchar(50)
    */
    get Troubleshoot(): string | null {
        return this.Get('Troubleshoot');
    }
    set Troubleshoot(value: string | null) {
        this.Set('Troubleshoot', value);
    }
}


/**
 * Organizations - strongly typed entity sub-class
 * * Schema: common
 * * Base Table: Organization
 * * Base View: vwOrganizations
 * * @description Organization is used to connect data from across multiple schemas. These source schemas represent different source systems like membership, education, events, etc. The CompanyLink table has entries for "matches" between records that represent companies/organizations across the different source systems so that we have a structured way to unify this data in the CDP.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Organizations')
export class OrganizationEntity extends BaseEntity<OrganizationEntityType> {
    /**
    * Loads the Organizations record from the database
    * @param ID: number - primary key value to load the Organizations record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof OrganizationEntity
    * @method
    * @override
    */
    public async Load(ID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: int
    */
    get ID(): number {
        return this.Get('ID');
    }

    /**
    * * Field Name: NimbleAccountID
    * * Display Name: Nimble Account ID
    * * SQL Data Type: nvarchar(50)
    */
    get NimbleAccountID(): string | null {
        return this.Get('NimbleAccountID');
    }
    set NimbleAccountID(value: string | null) {
        this.Set('NimbleAccountID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(250)
    */
    get Name(): string | null {
        return this.Get('Name');
    }
    set Name(value: string | null) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: OrganizationType
    * * Display Name: Organization Type
    * * SQL Data Type: nvarchar(100)
    */
    get OrganizationType(): string | null {
        return this.Get('OrganizationType');
    }
    set OrganizationType(value: string | null) {
        this.Set('OrganizationType', value);
    }

    /**
    * * Field Name: Region
    * * Display Name: Region
    * * SQL Data Type: nvarchar(100)
    */
    get Region(): string | null {
        return this.Get('Region');
    }
    set Region(value: string | null) {
        this.Set('Region', value);
    }

    /**
    * * Field Name: Institution
    * * Display Name: Institution
    * * SQL Data Type: nvarchar(100)
    */
    get Institution(): string | null {
        return this.Get('Institution');
    }
    set Institution(value: string | null) {
        this.Set('Institution', value);
    }

    /**
    * * Field Name: DistrictID
    * * Display Name: District ID
    * * SQL Data Type: int
    */
    get DistrictID(): number | null {
        return this.Get('DistrictID');
    }
    set DistrictID(value: number | null) {
        this.Set('DistrictID', value);
    }

    /**
    * * Field Name: co_dist_code
    * * Display Name: County District Code
    * * SQL Data Type: nvarchar(10)
    */
    get co_dist_code(): string | null {
        return this.Get('co_dist_code');
    }
    set co_dist_code(value: string | null) {
        this.Set('co_dist_code', value);
    }
}


/**
 * Payment Lines - strongly typed entity sub-class
 * * Schema: nams
 * * Base Table: NU__PaymentLine__c
 * * Base View: vwNU__PaymentLine__cs
 * * Primary Key: Id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Payment Lines')
export class NU__PaymentLine__cEntity extends BaseEntity<NU__PaymentLine__cEntityType> {
    /**
    * Loads the Payment Lines record from the database
    * @param Id: string - primary key value to load the Payment Lines record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof NU__PaymentLine__cEntity
    * @method
    * @override
    */
    public async Load(Id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'Id', Value: Id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: Id
    * * Display Name: Id
    * * SQL Data Type: nvarchar(50)
    */
    get Id(): string {
        return this.Get('Id');
    }
    set Id(value: string) {
        this.Set('Id', value);
    }

    /**
    * * Field Name: IsDeleted
    * * Display Name: Is Deleted
    * * SQL Data Type: bit
    */
    get IsDeleted(): boolean | null {
        return this.Get('IsDeleted');
    }
    set IsDeleted(value: boolean | null) {
        this.Set('IsDeleted', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Payment Line Number
    * * SQL Data Type: nvarchar(MAX)
    */
    get Name(): string | null {
        return this.Get('Name');
    }
    set Name(value: string | null) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: CreatedById
    * * Display Name: Created By Id
    * * SQL Data Type: nvarchar(MAX)
    */
    get CreatedById(): string | null {
        return this.Get('CreatedById');
    }
    set CreatedById(value: string | null) {
        this.Set('CreatedById', value);
    }

    /**
    * * Field Name: LastModifiedDate
    * * Display Name: Last Modified Date
    * * SQL Data Type: datetimeoffset
    */
    get LastModifiedDate(): Date | null {
        return this.Get('LastModifiedDate');
    }

    /**
    * * Field Name: LastModifiedById
    * * Display Name: Last Modified By Id
    * * SQL Data Type: nvarchar(MAX)
    */
    get LastModifiedById(): string | null {
        return this.Get('LastModifiedById');
    }
    set LastModifiedById(value: string | null) {
        this.Set('LastModifiedById', value);
    }

    /**
    * * Field Name: SystemModstamp
    * * Display Name: System Modstamp
    * * SQL Data Type: datetimeoffset
    */
    get SystemModstamp(): Date | null {
        return this.Get('SystemModstamp');
    }

    /**
    * * Field Name: LastActivityDate
    * * Display Name: Last Activity Date
    * * SQL Data Type: datetimeoffset
    */
    get LastActivityDate(): Date | null {
        return this.Get('LastActivityDate');
    }

    /**
    * * Field Name: NU__OrderItem__c
    * * Display Name: Order Item ID
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__OrderItem__c(): string | null {
        return this.Get('NU__OrderItem__c');
    }
    set NU__OrderItem__c(value: string | null) {
        this.Set('NU__OrderItem__c', value);
    }

    /**
    * * Field Name: NU__Payment__c
    * * Display Name: Payment ID
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Payment__c(): string | null {
        return this.Get('NU__Payment__c');
    }
    set NU__Payment__c(value: string | null) {
        this.Set('NU__Payment__c', value);
    }

    /**
    * * Field Name: NU__ExternalID__c
    * * Display Name: NU__External ID__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__ExternalID__c(): string | null {
        return this.Get('NU__ExternalID__c');
    }
    set NU__ExternalID__c(value: string | null) {
        this.Set('NU__ExternalID__c', value);
    }

    /**
    * * Field Name: NU__PaymentAmount__c
    * * Display Name: Payment Amount
    * * SQL Data Type: decimal(18, 2)
    */
    get NU__PaymentAmount__c(): number | null {
        return this.Get('NU__PaymentAmount__c');
    }
    set NU__PaymentAmount__c(value: number | null) {
        this.Set('NU__PaymentAmount__c', value);
    }

    /**
    * * Field Name: Verified__c
    * * Display Name: Verified __c
    * * SQL Data Type: bit
    */
    get Verified__c(): boolean | null {
        return this.Get('Verified__c');
    }
    set Verified__c(value: boolean | null) {
        this.Set('Verified__c', value);
    }

    /**
    * * Field Name: NU__CreditCardIssuerName__c
    * * Display Name: NU__Credit Card Issuer Name __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__CreditCardIssuerName__c(): string | null {
        return this.Get('NU__CreditCardIssuerName__c');
    }
    set NU__CreditCardIssuerName__c(value: string | null) {
        this.Set('NU__CreditCardIssuerName__c', value);
    }

    /**
    * * Field Name: NU__ExternalID2__c
    * * Display Name: NU__External ID2__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__ExternalID2__c(): string | null {
        return this.Get('NU__ExternalID2__c');
    }
    set NU__ExternalID2__c(value: string | null) {
        this.Set('NU__ExternalID2__c', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Troubleshoot
    * * Display Name: Troubleshoot
    * * SQL Data Type: nvarchar(50)
    */
    get Troubleshoot(): string | null {
        return this.Get('Troubleshoot');
    }
    set Troubleshoot(value: string | null) {
        this.Set('Troubleshoot', value);
    }
}


/**
 * Payments - strongly typed entity sub-class
 * * Schema: nams
 * * Base Table: NU__Payment__c
 * * Base View: vwNU__Payment__cs
 * * Primary Key: Id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Payments')
export class NU__Payment__cEntity extends BaseEntity<NU__Payment__cEntityType> {
    /**
    * Loads the Payments record from the database
    * @param Id: string - primary key value to load the Payments record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof NU__Payment__cEntity
    * @method
    * @override
    */
    public async Load(Id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'Id', Value: Id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: Id
    * * Display Name: Id
    * * SQL Data Type: nvarchar(50)
    */
    get Id(): string {
        return this.Get('Id');
    }
    set Id(value: string) {
        this.Set('Id', value);
    }

    /**
    * * Field Name: OwnerId
    * * Display Name: Owner Id
    * * SQL Data Type: nvarchar(MAX)
    */
    get OwnerId(): string | null {
        return this.Get('OwnerId');
    }
    set OwnerId(value: string | null) {
        this.Set('OwnerId', value);
    }

    /**
    * * Field Name: IsDeleted
    * * Display Name: Is Deleted
    * * SQL Data Type: bit
    */
    get IsDeleted(): boolean | null {
        return this.Get('IsDeleted');
    }
    set IsDeleted(value: boolean | null) {
        this.Set('IsDeleted', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Payment Number
    * * SQL Data Type: nvarchar(MAX)
    */
    get Name(): string | null {
        return this.Get('Name');
    }
    set Name(value: string | null) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: CreatedById
    * * Display Name: Created By Id
    * * SQL Data Type: nvarchar(MAX)
    */
    get CreatedById(): string | null {
        return this.Get('CreatedById');
    }
    set CreatedById(value: string | null) {
        this.Set('CreatedById', value);
    }

    /**
    * * Field Name: LastModifiedDate
    * * Display Name: Last Modified Date
    * * SQL Data Type: datetimeoffset
    */
    get LastModifiedDate(): Date | null {
        return this.Get('LastModifiedDate');
    }

    /**
    * * Field Name: LastModifiedById
    * * Display Name: Last Modified By Id
    * * SQL Data Type: nvarchar(MAX)
    */
    get LastModifiedById(): string | null {
        return this.Get('LastModifiedById');
    }
    set LastModifiedById(value: string | null) {
        this.Set('LastModifiedById', value);
    }

    /**
    * * Field Name: SystemModstamp
    * * Display Name: System Modstamp
    * * SQL Data Type: datetimeoffset
    */
    get SystemModstamp(): Date | null {
        return this.Get('SystemModstamp');
    }

    /**
    * * Field Name: LastActivityDate
    * * Display Name: Last Activity Date
    * * SQL Data Type: datetimeoffset
    */
    get LastActivityDate(): Date | null {
        return this.Get('LastActivityDate');
    }

    /**
    * * Field Name: LastViewedDate
    * * Display Name: Last Viewed Date
    * * SQL Data Type: datetimeoffset
    */
    get LastViewedDate(): Date | null {
        return this.Get('LastViewedDate');
    }

    /**
    * * Field Name: LastReferencedDate
    * * Display Name: Last Referenced Date
    * * SQL Data Type: datetimeoffset
    */
    get LastReferencedDate(): Date | null {
        return this.Get('LastReferencedDate');
    }

    /**
    * * Field Name: NU__CheckNumber__c
    * * Display Name: NU__Check Number __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__CheckNumber__c(): string | null {
        return this.Get('NU__CheckNumber__c');
    }
    set NU__CheckNumber__c(value: string | null) {
        this.Set('NU__CheckNumber__c', value);
    }

    /**
    * * Field Name: NU__CreditCardCity__c
    * * Display Name: NU__Credit Card City __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__CreditCardCity__c(): string | null {
        return this.Get('NU__CreditCardCity__c');
    }
    set NU__CreditCardCity__c(value: string | null) {
        this.Set('NU__CreditCardCity__c', value);
    }

    /**
    * * Field Name: NU__CreditCardCountry__c
    * * Display Name: NU__Credit Card Country __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__CreditCardCountry__c(): string | null {
        return this.Get('NU__CreditCardCountry__c');
    }
    set NU__CreditCardCountry__c(value: string | null) {
        this.Set('NU__CreditCardCountry__c', value);
    }

    /**
    * * Field Name: NU__CreditCardExpirationMonth__c
    * * Display Name: NU__Credit Card Expiration Month __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__CreditCardExpirationMonth__c(): string | null {
        return this.Get('NU__CreditCardExpirationMonth__c');
    }
    set NU__CreditCardExpirationMonth__c(value: string | null) {
        this.Set('NU__CreditCardExpirationMonth__c', value);
    }

    /**
    * * Field Name: NU__CreditCardExpirationYear__c
    * * Display Name: NU__Credit Card Expiration Year __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__CreditCardExpirationYear__c(): string | null {
        return this.Get('NU__CreditCardExpirationYear__c');
    }
    set NU__CreditCardExpirationYear__c(value: string | null) {
        this.Set('NU__CreditCardExpirationYear__c', value);
    }

    /**
    * * Field Name: NU__CreditCardIsVoid__c
    * * Display Name: NU__Credit Card Is Void __c
    * * SQL Data Type: bit
    */
    get NU__CreditCardIsVoid__c(): boolean | null {
        return this.Get('NU__CreditCardIsVoid__c');
    }
    set NU__CreditCardIsVoid__c(value: boolean | null) {
        this.Set('NU__CreditCardIsVoid__c', value);
    }

    /**
    * * Field Name: NU__CreditCardName__c
    * * Display Name: NU__Credit Card Name __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__CreditCardName__c(): string | null {
        return this.Get('NU__CreditCardName__c');
    }
    set NU__CreditCardName__c(value: string | null) {
        this.Set('NU__CreditCardName__c', value);
    }

    /**
    * * Field Name: NU__CreditCardNumber__c
    * * Display Name: NU__Credit Card Number __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__CreditCardNumber__c(): string | null {
        return this.Get('NU__CreditCardNumber__c');
    }
    set NU__CreditCardNumber__c(value: string | null) {
        this.Set('NU__CreditCardNumber__c', value);
    }

    /**
    * * Field Name: NU__CreditCardPostalCode__c
    * * Display Name: NU__Credit Card Postal Code __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__CreditCardPostalCode__c(): string | null {
        return this.Get('NU__CreditCardPostalCode__c');
    }
    set NU__CreditCardPostalCode__c(value: string | null) {
        this.Set('NU__CreditCardPostalCode__c', value);
    }

    /**
    * * Field Name: NU__CreditCardRefundedPayment__c
    * * Display Name: NU__Credit Card Refunded Payment __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__CreditCardRefundedPayment__c(): string | null {
        return this.Get('NU__CreditCardRefundedPayment__c');
    }
    set NU__CreditCardRefundedPayment__c(value: string | null) {
        this.Set('NU__CreditCardRefundedPayment__c', value);
    }

    /**
    * * Field Name: NU__CreditCardSecurityCode__c
    * * Display Name: NU__Credit Card Security Code __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__CreditCardSecurityCode__c(): string | null {
        return this.Get('NU__CreditCardSecurityCode__c');
    }
    set NU__CreditCardSecurityCode__c(value: string | null) {
        this.Set('NU__CreditCardSecurityCode__c', value);
    }

    /**
    * * Field Name: NU__CreditCardState__c
    * * Display Name: NU__Credit Card State __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__CreditCardState__c(): string | null {
        return this.Get('NU__CreditCardState__c');
    }
    set NU__CreditCardState__c(value: string | null) {
        this.Set('NU__CreditCardState__c', value);
    }

    /**
    * * Field Name: NU__CreditCardStreet2__c
    * * Display Name: NU__Credit Card Street 2__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__CreditCardStreet2__c(): string | null {
        return this.Get('NU__CreditCardStreet2__c');
    }
    set NU__CreditCardStreet2__c(value: string | null) {
        this.Set('NU__CreditCardStreet2__c', value);
    }

    /**
    * * Field Name: NU__CreditCardStreet3__c
    * * Display Name: NU__Credit Card Street 3__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__CreditCardStreet3__c(): string | null {
        return this.Get('NU__CreditCardStreet3__c');
    }
    set NU__CreditCardStreet3__c(value: string | null) {
        this.Set('NU__CreditCardStreet3__c', value);
    }

    /**
    * * Field Name: NU__CreditCardStreet__c
    * * Display Name: NU__Credit Card Street __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__CreditCardStreet__c(): string | null {
        return this.Get('NU__CreditCardStreet__c');
    }
    set NU__CreditCardStreet__c(value: string | null) {
        this.Set('NU__CreditCardStreet__c', value);
    }

    /**
    * * Field Name: NU__EntityCreditCardIssuer__c
    * * Display Name: NU__Entity Credit Card Issuer __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__EntityCreditCardIssuer__c(): string | null {
        return this.Get('NU__EntityCreditCardIssuer__c');
    }
    set NU__EntityCreditCardIssuer__c(value: string | null) {
        this.Set('NU__EntityCreditCardIssuer__c', value);
    }

    /**
    * * Field Name: NU__EntityPaymentMethod__c
    * * Display Name: NU__Entity Payment Method __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__EntityPaymentMethod__c(): string | null {
        return this.Get('NU__EntityPaymentMethod__c');
    }
    set NU__EntityPaymentMethod__c(value: string | null) {
        this.Set('NU__EntityPaymentMethod__c', value);
    }

    /**
    * * Field Name: NU__ExternalID__c
    * * Display Name: NU__External ID__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__ExternalID__c(): string | null {
        return this.Get('NU__ExternalID__c');
    }
    set NU__ExternalID__c(value: string | null) {
        this.Set('NU__ExternalID__c', value);
    }

    /**
    * * Field Name: NU__Note__c
    * * Display Name: NU__Note __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Note__c(): string | null {
        return this.Get('NU__Note__c');
    }
    set NU__Note__c(value: string | null) {
        this.Set('NU__Note__c', value);
    }

    /**
    * * Field Name: NU__PaymentAmount__c
    * * Display Name: Payment Amount
    * * SQL Data Type: decimal(18, 2)
    */
    get NU__PaymentAmount__c(): number | null {
        return this.Get('NU__PaymentAmount__c');
    }
    set NU__PaymentAmount__c(value: number | null) {
        this.Set('NU__PaymentAmount__c', value);
    }

    /**
    * * Field Name: NU__PaymentDate__c
    * * Display Name: Payment Date
    * * SQL Data Type: datetimeoffset
    */
    get NU__PaymentDate__c(): Date | null {
        return this.Get('NU__PaymentDate__c');
    }

    /**
    * * Field Name: NU__PaymentProcessorAuthorizationId__c
    * * Display Name: NU__Payment Processor Authorization Id __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__PaymentProcessorAuthorizationId__c(): string | null {
        return this.Get('NU__PaymentProcessorAuthorizationId__c');
    }
    set NU__PaymentProcessorAuthorizationId__c(value: string | null) {
        this.Set('NU__PaymentProcessorAuthorizationId__c', value);
    }

    /**
    * * Field Name: NU__PaymentProcessorAvsCode__c
    * * Display Name: NU__Payment Processor Avs Code __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__PaymentProcessorAvsCode__c(): string | null {
        return this.Get('NU__PaymentProcessorAvsCode__c');
    }
    set NU__PaymentProcessorAvsCode__c(value: string | null) {
        this.Set('NU__PaymentProcessorAvsCode__c', value);
    }

    /**
    * * Field Name: NU__PaymentProcessorCardHolderVerifCode__c
    * * Display Name: NU__Payment Processor Card Holder Verif Code __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__PaymentProcessorCardHolderVerifCode__c(): string | null {
        return this.Get('NU__PaymentProcessorCardHolderVerifCode__c');
    }
    set NU__PaymentProcessorCardHolderVerifCode__c(value: string | null) {
        this.Set('NU__PaymentProcessorCardHolderVerifCode__c', value);
    }

    /**
    * * Field Name: NU__PaymentProcessorCode__c
    * * Display Name: NU__Payment Processor Code __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__PaymentProcessorCode__c(): string | null {
        return this.Get('NU__PaymentProcessorCode__c');
    }
    set NU__PaymentProcessorCode__c(value: string | null) {
        this.Set('NU__PaymentProcessorCode__c', value);
    }

    /**
    * * Field Name: NU__PaymentProcessorRawResponse__c
    * * Display Name: NU__Payment Processor Raw Response __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__PaymentProcessorRawResponse__c(): string | null {
        return this.Get('NU__PaymentProcessorRawResponse__c');
    }
    set NU__PaymentProcessorRawResponse__c(value: string | null) {
        this.Set('NU__PaymentProcessorRawResponse__c', value);
    }

    /**
    * * Field Name: NU__PaymentProcessorReasonCode__c
    * * Display Name: NU__Payment Processor Reason Code __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__PaymentProcessorReasonCode__c(): string | null {
        return this.Get('NU__PaymentProcessorReasonCode__c');
    }
    set NU__PaymentProcessorReasonCode__c(value: string | null) {
        this.Set('NU__PaymentProcessorReasonCode__c', value);
    }

    /**
    * * Field Name: NU__PaymentProcessorReasonMessage__c
    * * Display Name: NU__Payment Processor Reason Message __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__PaymentProcessorReasonMessage__c(): string | null {
        return this.Get('NU__PaymentProcessorReasonMessage__c');
    }
    set NU__PaymentProcessorReasonMessage__c(value: string | null) {
        this.Set('NU__PaymentProcessorReasonMessage__c', value);
    }

    /**
    * * Field Name: NU__PaymentProcessorSercurityVerifCode__c
    * * Display Name: NU__Payment Processor Sercurity Verif Code __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__PaymentProcessorSercurityVerifCode__c(): string | null {
        return this.Get('NU__PaymentProcessorSercurityVerifCode__c');
    }
    set NU__PaymentProcessorSercurityVerifCode__c(value: string | null) {
        this.Set('NU__PaymentProcessorSercurityVerifCode__c', value);
    }

    /**
    * * Field Name: NU__PaymentProcessorSplitTenderId__c
    * * Display Name: NU__Payment Processor Split Tender Id __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__PaymentProcessorSplitTenderId__c(): string | null {
        return this.Get('NU__PaymentProcessorSplitTenderId__c');
    }
    set NU__PaymentProcessorSplitTenderId__c(value: string | null) {
        this.Set('NU__PaymentProcessorSplitTenderId__c', value);
    }

    /**
    * * Field Name: NU__PaymentProcessorTransactionId__c
    * * Display Name: NU__Payment Processor Transaction Id __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__PaymentProcessorTransactionId__c(): string | null {
        return this.Get('NU__PaymentProcessorTransactionId__c');
    }
    set NU__PaymentProcessorTransactionId__c(value: string | null) {
        this.Set('NU__PaymentProcessorTransactionId__c', value);
    }

    /**
    * * Field Name: NU__PurchaseOrderNumber__c
    * * Display Name: NU__Purchase Order Number __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__PurchaseOrderNumber__c(): string | null {
        return this.Get('NU__PurchaseOrderNumber__c');
    }
    set NU__PurchaseOrderNumber__c(value: string | null) {
        this.Set('NU__PurchaseOrderNumber__c', value);
    }

    /**
    * * Field Name: NU__Source__c
    * * Display Name: Source
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Source__c(): string | null {
        return this.Get('NU__Source__c');
    }
    set NU__Source__c(value: string | null) {
        this.Set('NU__Source__c', value);
    }

    /**
    * * Field Name: NU__Payer__c
    * * Display Name: NU__Payer __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Payer__c(): string | null {
        return this.Get('NU__Payer__c');
    }
    set NU__Payer__c(value: string | null) {
        this.Set('NU__Payer__c', value);
    }

    /**
    * * Field Name: Batch__c
    * * Display Name: Batch __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Batch__c(): string | null {
        return this.Get('Batch__c');
    }
    set Batch__c(value: string | null) {
        this.Set('Batch__c', value);
    }

    /**
    * * Field Name: District_CTA_Account__c
    * * Display Name: District _CTA_Account __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get District_CTA_Account__c(): string | null {
        return this.Get('District_CTA_Account__c');
    }
    set District_CTA_Account__c(value: string | null) {
        this.Set('District_CTA_Account__c', value);
    }

    /**
    * * Field Name: Dues_Year__c
    * * Display Name: Dues Year
    * * SQL Data Type: nvarchar(MAX)
    */
    get Dues_Year__c(): string | null {
        return this.Get('Dues_Year__c');
    }
    set Dues_Year__c(value: string | null) {
        this.Set('Dues_Year__c', value);
    }

    /**
    * * Field Name: Unsubmitted_Payment__c
    * * Display Name: Unsubmitted _Payment __c
    * * SQL Data Type: bit
    */
    get Unsubmitted_Payment__c(): boolean | null {
        return this.Get('Unsubmitted_Payment__c');
    }
    set Unsubmitted_Payment__c(value: boolean | null) {
        this.Set('Unsubmitted_Payment__c', value);
    }

    /**
    * * Field Name: NU__RecurringPaymentMessages__c
    * * Display Name: NU__Recurring Payment Messages __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__RecurringPaymentMessages__c(): string | null {
        return this.Get('NU__RecurringPaymentMessages__c');
    }
    set NU__RecurringPaymentMessages__c(value: string | null) {
        this.Set('NU__RecurringPaymentMessages__c', value);
    }

    /**
    * * Field Name: NU__RecurringPaymentResultCode__c
    * * Display Name: NU__Recurring Payment Result Code __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__RecurringPaymentResultCode__c(): string | null {
        return this.Get('NU__RecurringPaymentResultCode__c');
    }
    set NU__RecurringPaymentResultCode__c(value: string | null) {
        this.Set('NU__RecurringPaymentResultCode__c', value);
    }

    /**
    * * Field Name: NU__RecurringPayment__c
    * * Display Name: NU__Recurring Payment __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__RecurringPayment__c(): string | null {
        return this.Get('NU__RecurringPayment__c');
    }
    set NU__RecurringPayment__c(value: string | null) {
        this.Set('NU__RecurringPayment__c', value);
    }

    /**
    * * Field Name: Batch_Title__c
    * * Display Name: Batch _Title __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Batch_Title__c(): string | null {
        return this.Get('Batch_Title__c');
    }
    set Batch_Title__c(value: string | null) {
        this.Set('Batch_Title__c', value);
    }

    /**
    * * Field Name: NU__AvailableCreditBalance__c
    * * Display Name: NU__Available Credit Balance __c
    * * SQL Data Type: decimal(18, 2)
    */
    get NU__AvailableCreditBalance__c(): number | null {
        return this.Get('NU__AvailableCreditBalance__c');
    }
    set NU__AvailableCreditBalance__c(value: number | null) {
        this.Set('NU__AvailableCreditBalance__c', value);
    }

    /**
    * * Field Name: NU__CreditPayableGLAccount__c
    * * Display Name: NU__Credit Payable GLAccount __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__CreditPayableGLAccount__c(): string | null {
        return this.Get('NU__CreditPayableGLAccount__c');
    }
    set NU__CreditPayableGLAccount__c(value: string | null) {
        this.Set('NU__CreditPayableGLAccount__c', value);
    }

    /**
    * * Field Name: NU__Entity__c
    * * Display Name: Entity
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Entity__c(): string | null {
        return this.Get('NU__Entity__c');
    }
    set NU__Entity__c(value: string | null) {
        this.Set('NU__Entity__c', value);
    }

    /**
    * * Field Name: NU__IsCredit__c
    * * Display Name: NU__Is Credit __c
    * * SQL Data Type: bit
    */
    get NU__IsCredit__c(): boolean | null {
        return this.Get('NU__IsCredit__c');
    }
    set NU__IsCredit__c(value: boolean | null) {
        this.Set('NU__IsCredit__c', value);
    }

    /**
    * * Field Name: NU__TotalPaymentApplied__c
    * * Display Name: NU__Total Payment Applied __c
    * * SQL Data Type: decimal(18, 2)
    */
    get NU__TotalPaymentApplied__c(): number | null {
        return this.Get('NU__TotalPaymentApplied__c');
    }
    set NU__TotalPaymentApplied__c(value: number | null) {
        this.Set('NU__TotalPaymentApplied__c', value);
    }

    /**
    * * Field Name: NU__PendingRefund__c
    * * Display Name: NU__Pending Refund __c
    * * SQL Data Type: bit
    */
    get NU__PendingRefund__c(): boolean | null {
        return this.Get('NU__PendingRefund__c');
    }
    set NU__PendingRefund__c(value: boolean | null) {
        this.Set('NU__PendingRefund__c', value);
    }

    /**
    * * Field Name: NU__PendingCapture__c
    * * Display Name: NU__Pending Capture __c
    * * SQL Data Type: bit
    */
    get NU__PendingCapture__c(): boolean | null {
        return this.Get('NU__PendingCapture__c');
    }
    set NU__PendingCapture__c(value: boolean | null) {
        this.Set('NU__PendingCapture__c', value);
    }

    /**
    * * Field Name: NU__CreatedByExternalPaymentMethod__c
    * * Display Name: NU__Created By External Payment Method __c
    * * SQL Data Type: bit
    */
    get NU__CreatedByExternalPaymentMethod__c(): boolean | null {
        return this.Get('NU__CreatedByExternalPaymentMethod__c');
    }
    set NU__CreatedByExternalPaymentMethod__c(value: boolean | null) {
        this.Set('NU__CreatedByExternalPaymentMethod__c', value);
    }

    /**
    * * Field Name: NU__ExternalPaymentProfile__c
    * * Display Name: NU__External Payment Profile __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__ExternalPaymentProfile__c(): string | null {
        return this.Get('NU__ExternalPaymentProfile__c');
    }
    set NU__ExternalPaymentProfile__c(value: string | null) {
        this.Set('NU__ExternalPaymentProfile__c', value);
    }

    /**
    * * Field Name: NU__AuthorizationReceived__c
    * * Display Name: NU__Authorization Received __c
    * * SQL Data Type: bit
    */
    get NU__AuthorizationReceived__c(): boolean | null {
        return this.Get('NU__AuthorizationReceived__c');
    }
    set NU__AuthorizationReceived__c(value: boolean | null) {
        this.Set('NU__AuthorizationReceived__c', value);
    }

    /**
    * * Field Name: NU__SettlementDate__c
    * * Display Name: NU__Settlement Date __c
    * * SQL Data Type: datetimeoffset
    */
    get NU__SettlementDate__c(): Date | null {
        return this.Get('NU__SettlementDate__c');
    }

    /**
    * * Field Name: NU__SettlementFail__c
    * * Display Name: NU__Settlement Fail __c
    * * SQL Data Type: bit
    */
    get NU__SettlementFail__c(): boolean | null {
        return this.Get('NU__SettlementFail__c');
    }
    set NU__SettlementFail__c(value: boolean | null) {
        this.Set('NU__SettlementFail__c', value);
    }

    /**
    * * Field Name: NU__ExpressPayment__c
    * * Display Name: NU__Express Payment __c
    * * SQL Data Type: bit
    */
    get NU__ExpressPayment__c(): boolean | null {
        return this.Get('NU__ExpressPayment__c');
    }
    set NU__ExpressPayment__c(value: boolean | null) {
        this.Set('NU__ExpressPayment__c', value);
    }

    /**
    * * Field Name: NU__GatewayStatus__c
    * * Display Name: NU__Gateway Status __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__GatewayStatus__c(): string | null {
        return this.Get('NU__GatewayStatus__c');
    }
    set NU__GatewayStatus__c(value: string | null) {
        this.Set('NU__GatewayStatus__c', value);
    }

    /**
    * * Field Name: NU__ScheduleLine__c
    * * Display Name: NU__Schedule Line __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__ScheduleLine__c(): string | null {
        return this.Get('NU__ScheduleLine__c');
    }
    set NU__ScheduleLine__c(value: string | null) {
        this.Set('NU__ScheduleLine__c', value);
    }

    /**
    * * Field Name: NU__PointOfSaleDevice__c
    * * Display Name: NU__Point Of Sale Device __c
    * * SQL Data Type: bit
    */
    get NU__PointOfSaleDevice__c(): boolean | null {
        return this.Get('NU__PointOfSaleDevice__c');
    }
    set NU__PointOfSaleDevice__c(value: boolean | null) {
        this.Set('NU__PointOfSaleDevice__c', value);
    }

    /**
    * * Field Name: namz__State__c
    * * Display Name: namz __State __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get namz__State__c(): string | null {
        return this.Get('namz__State__c');
    }
    set namz__State__c(value: string | null) {
        this.Set('namz__State__c', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Troubleshoot
    * * Display Name: Troubleshoot
    * * SQL Data Type: nvarchar(50)
    */
    get Troubleshoot(): string | null {
        return this.Get('Troubleshoot');
    }
    set Troubleshoot(value: string | null) {
        this.Set('Troubleshoot', value);
    }
}


/**
 * Persons - strongly typed entity sub-class
 * * Schema: common
 * * Base Table: Person
 * * Base View: vwPersons
 * * @description Person is used to connect data from across multiple schemas. These source schemas represent different source systems like membership, education, events, etc. The Person table has entries for "matches" between records that represent people across the different source systems so that we have a structured way to unify this data in the CDP.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Persons')
export class PersonEntity extends BaseEntity<PersonEntityType> {
    /**
    * Loads the Persons record from the database
    * @param ID: number - primary key value to load the Persons record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof PersonEntity
    * @method
    * @override
    */
    public async Load(ID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: int
    */
    get ID(): number {
        return this.Get('ID');
    }

    /**
    * * Field Name: FirstName
    * * Display Name: First Name
    * * SQL Data Type: nvarchar(160)
    */
    get FirstName(): string | null {
        return this.Get('FirstName');
    }
    set FirstName(value: string | null) {
        this.Set('FirstName', value);
    }

    /**
    * * Field Name: LastName
    * * Display Name: Last Name
    * * SQL Data Type: nvarchar(160)
    */
    get LastName(): string | null {
        return this.Get('LastName');
    }
    set LastName(value: string | null) {
        this.Set('LastName', value);
    }

    /**
    * * Field Name: FullName
    * * Display Name: Full Name
    * * SQL Data Type: nvarchar(500)
    */
    get FullName(): string | null {
        return this.Get('FullName');
    }
    set FullName(value: string | null) {
        this.Set('FullName', value);
    }

    /**
    * * Field Name: Email
    * * Display Name: Email
    * * SQL Data Type: nvarchar(160)
    */
    get Email(): string | null {
        return this.Get('Email');
    }
    set Email(value: string | null) {
        this.Set('Email', value);
    }

    /**
    * * Field Name: NimbleAccountID
    * * Display Name: Nimble Account ID
    * * SQL Data Type: nvarchar(50)
    * * Related Entity/Foreign Key: Accounts (vwAccounts.Id)
    */
    get NimbleAccountID(): string | null {
        return this.Get('NimbleAccountID');
    }
    set NimbleAccountID(value: string | null) {
        this.Set('NimbleAccountID', value);
    }

    /**
    * * Field Name: NimbleContactID
    * * Display Name: Nimble Contact ID
    * * SQL Data Type: nvarchar(50)
    */
    get NimbleContactID(): string | null {
        return this.Get('NimbleContactID');
    }
    set NimbleContactID(value: string | null) {
        this.Set('NimbleContactID', value);
    }

    /**
    * * Field Name: OrganizationID
    * * Display Name: Organization ID
    * * SQL Data Type: int
    */
    get OrganizationID(): number | null {
        return this.Get('OrganizationID');
    }
    set OrganizationID(value: number | null) {
        this.Set('OrganizationID', value);
    }

    /**
    * * Field Name: MembershipType
    * * Display Name: Membership Type
    * * SQL Data Type: nvarchar(250)
    */
    get MembershipType(): string | null {
        return this.Get('MembershipType');
    }
    set MembershipType(value: string | null) {
        this.Set('MembershipType', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: edssn
    * * Display Name: SSN
    * * SQL Data Type: nvarchar(100)
    */
    get edssn(): string | null {
        return this.Get('edssn');
    }
    set edssn(value: string | null) {
        this.Set('edssn', value);
    }

    /**
    * * Field Name: Region
    * * Display Name: Region
    * * SQL Data Type: nvarchar(100)
    */
    get Region(): string | null {
        return this.Get('Region');
    }
    set Region(value: string | null) {
        this.Set('Region', value);
    }

    /**
    * * Field Name: Institution
    * * Display Name: Institution
    * * SQL Data Type: nvarchar(100)
    */
    get Institution(): string | null {
        return this.Get('Institution');
    }
    set Institution(value: string | null) {
        this.Set('Institution', value);
    }

    /**
    * * Field Name: NimblePrimaryAffiliationID
    * * Display Name: Nimble Primary Affiliation ID
    * * SQL Data Type: nvarchar(50)
    */
    get NimblePrimaryAffiliationID(): string | null {
        return this.Get('NimblePrimaryAffiliationID');
    }
    set NimblePrimaryAffiliationID(value: string | null) {
        this.Set('NimblePrimaryAffiliationID', value);
    }

    /**
    * * Field Name: NimbleInstitutionID
    * * Display Name: Nimble Institution ID
    * * SQL Data Type: nvarchar(50)
    */
    get NimbleInstitutionID(): string | null {
        return this.Get('NimbleInstitutionID');
    }
    set NimbleInstitutionID(value: string | null) {
        this.Set('NimbleInstitutionID', value);
    }

    /**
    * * Field Name: NimbleAccount
    * * Display Name: Nimble Account
    * * SQL Data Type: nvarchar(MAX)
    */
    get NimbleAccount(): string | null {
        return this.Get('NimbleAccount');
    }
}


/**
 * Products - strongly typed entity sub-class
 * * Schema: nams
 * * Base Table: NU__Product__c
 * * Base View: vwNU__Product__cs
 * * Primary Key: Id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Products')
export class NU__Product__cEntity extends BaseEntity<NU__Product__cEntityType> {
    /**
    * Loads the Products record from the database
    * @param Id: string - primary key value to load the Products record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof NU__Product__cEntity
    * @method
    * @override
    */
    public async Load(Id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'Id', Value: Id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: Id
    * * Display Name: Id
    * * SQL Data Type: nvarchar(50)
    */
    get Id(): string {
        return this.Get('Id');
    }
    set Id(value: string) {
        this.Set('Id', value);
    }

    /**
    * * Field Name: IsDeleted
    * * Display Name: Is Deleted
    * * SQL Data Type: bit
    */
    get IsDeleted(): boolean | null {
        return this.Get('IsDeleted');
    }
    set IsDeleted(value: boolean | null) {
        this.Set('IsDeleted', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(MAX)
    */
    get Name(): string | null {
        return this.Get('Name');
    }
    set Name(value: string | null) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: RecordTypeId
    * * Display Name: Record Type Id
    * * SQL Data Type: nvarchar(MAX)
    */
    get RecordTypeId(): string | null {
        return this.Get('RecordTypeId');
    }
    set RecordTypeId(value: string | null) {
        this.Set('RecordTypeId', value);
    }

    /**
    * * Field Name: CreatedById
    * * Display Name: Created By Id
    * * SQL Data Type: nvarchar(MAX)
    */
    get CreatedById(): string | null {
        return this.Get('CreatedById');
    }
    set CreatedById(value: string | null) {
        this.Set('CreatedById', value);
    }

    /**
    * * Field Name: LastModifiedDate
    * * Display Name: Last Modified Date
    * * SQL Data Type: datetimeoffset
    */
    get LastModifiedDate(): Date | null {
        return this.Get('LastModifiedDate');
    }

    /**
    * * Field Name: LastModifiedById
    * * Display Name: Last Modified By Id
    * * SQL Data Type: nvarchar(MAX)
    */
    get LastModifiedById(): string | null {
        return this.Get('LastModifiedById');
    }
    set LastModifiedById(value: string | null) {
        this.Set('LastModifiedById', value);
    }

    /**
    * * Field Name: SystemModstamp
    * * Display Name: System Modstamp
    * * SQL Data Type: datetimeoffset
    */
    get SystemModstamp(): Date | null {
        return this.Get('SystemModstamp');
    }

    /**
    * * Field Name: LastActivityDate
    * * Display Name: Last Activity Date
    * * SQL Data Type: datetimeoffset
    */
    get LastActivityDate(): Date | null {
        return this.Get('LastActivityDate');
    }

    /**
    * * Field Name: LastViewedDate
    * * Display Name: Last Viewed Date
    * * SQL Data Type: datetimeoffset
    */
    get LastViewedDate(): Date | null {
        return this.Get('LastViewedDate');
    }

    /**
    * * Field Name: LastReferencedDate
    * * Display Name: Last Referenced Date
    * * SQL Data Type: datetimeoffset
    */
    get LastReferencedDate(): Date | null {
        return this.Get('LastReferencedDate');
    }

    /**
    * * Field Name: NU__Entity__c
    * * Display Name: NU__Entity __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Entity__c(): string | null {
        return this.Get('NU__Entity__c');
    }
    set NU__Entity__c(value: string | null) {
        this.Set('NU__Entity__c', value);
    }

    /**
    * * Field Name: NU__ConflictCodes__c
    * * Display Name: NU__Conflict Codes __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__ConflictCodes__c(): string | null {
        return this.Get('NU__ConflictCodes__c');
    }
    set NU__ConflictCodes__c(value: string | null) {
        this.Set('NU__ConflictCodes__c', value);
    }

    /**
    * * Field Name: NU__DeferredRevenueMethod__c
    * * Display Name: NU__Deferred Revenue Method __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__DeferredRevenueMethod__c(): string | null {
        return this.Get('NU__DeferredRevenueMethod__c');
    }
    set NU__DeferredRevenueMethod__c(value: string | null) {
        this.Set('NU__DeferredRevenueMethod__c', value);
    }

    /**
    * * Field Name: NU__Description__c
    * * Display Name: Description
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Description__c(): string | null {
        return this.Get('NU__Description__c');
    }
    set NU__Description__c(value: string | null) {
        this.Set('NU__Description__c', value);
    }

    /**
    * * Field Name: NU__DisplayOrder__c
    * * Display Name: NU__Display Order __c
    * * SQL Data Type: decimal(3, 0)
    */
    get NU__DisplayOrder__c(): number | null {
        return this.Get('NU__DisplayOrder__c');
    }
    set NU__DisplayOrder__c(value: number | null) {
        this.Set('NU__DisplayOrder__c', value);
    }

    /**
    * * Field Name: NU__EventSessionEndDate__c
    * * Display Name: NU__Event Session End Date __c
    * * SQL Data Type: datetimeoffset
    */
    get NU__EventSessionEndDate__c(): Date | null {
        return this.Get('NU__EventSessionEndDate__c');
    }

    /**
    * * Field Name: NU__EventSessionGroup__c
    * * Display Name: NU__Event Session Group __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__EventSessionGroup__c(): string | null {
        return this.Get('NU__EventSessionGroup__c');
    }
    set NU__EventSessionGroup__c(value: string | null) {
        this.Set('NU__EventSessionGroup__c', value);
    }

    /**
    * * Field Name: NU__EventSessionSpecialVenueInstructions__c
    * * Display Name: NU__Event Session Special Venue Instructions __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__EventSessionSpecialVenueInstructions__c(): string | null {
        return this.Get('NU__EventSessionSpecialVenueInstructions__c');
    }
    set NU__EventSessionSpecialVenueInstructions__c(value: string | null) {
        this.Set('NU__EventSessionSpecialVenueInstructions__c', value);
    }

    /**
    * * Field Name: NU__EventSessionStartDate__c
    * * Display Name: NU__Event Session Start Date __c
    * * SQL Data Type: datetimeoffset
    */
    get NU__EventSessionStartDate__c(): Date | null {
        return this.Get('NU__EventSessionStartDate__c');
    }

    /**
    * * Field Name: NU__Event__c
    * * Display Name: NU__Event __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Event__c(): string | null {
        return this.Get('NU__Event__c');
    }
    set NU__Event__c(value: string | null) {
        this.Set('NU__Event__c', value);
    }

    /**
    * * Field Name: NU__ExternalID__c
    * * Display Name: NU__External ID__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__ExternalID__c(): string | null {
        return this.Get('NU__ExternalID__c');
    }
    set NU__ExternalID__c(value: string | null) {
        this.Set('NU__ExternalID__c', value);
    }

    /**
    * * Field Name: NU__InventoryOnHand__c
    * * Display Name: NU__Inventory On Hand __c
    * * SQL Data Type: decimal(18, 0)
    */
    get NU__InventoryOnHand__c(): number | null {
        return this.Get('NU__InventoryOnHand__c');
    }
    set NU__InventoryOnHand__c(value: number | null) {
        this.Set('NU__InventoryOnHand__c', value);
    }

    /**
    * * Field Name: NU__InventoryUsed__c
    * * Display Name: NU__Inventory Used __c
    * * SQL Data Type: decimal(10, 0)
    */
    get NU__InventoryUsed__c(): number | null {
        return this.Get('NU__InventoryUsed__c');
    }
    set NU__InventoryUsed__c(value: number | null) {
        this.Set('NU__InventoryUsed__c', value);
    }

    /**
    * * Field Name: NU__Inventory__c
    * * Display Name: NU__Inventory __c
    * * SQL Data Type: decimal(10, 0)
    */
    get NU__Inventory__c(): number | null {
        return this.Get('NU__Inventory__c');
    }
    set NU__Inventory__c(value: number | null) {
        this.Set('NU__Inventory__c', value);
    }

    /**
    * * Field Name: NU__IsEventBadge__c
    * * Display Name: NU__Is Event Badge __c
    * * SQL Data Type: bit
    */
    get NU__IsEventBadge__c(): boolean | null {
        return this.Get('NU__IsEventBadge__c');
    }
    set NU__IsEventBadge__c(value: boolean | null) {
        this.Set('NU__IsEventBadge__c', value);
    }

    /**
    * * Field Name: NU__IsFee__c
    * * Display Name: NU__Is Fee __c
    * * SQL Data Type: bit
    */
    get NU__IsFee__c(): boolean | null {
        return this.Get('NU__IsFee__c');
    }
    set NU__IsFee__c(value: boolean | null) {
        this.Set('NU__IsFee__c', value);
    }

    /**
    * * Field Name: NU__IsShippable__c
    * * Display Name: NU__Is Shippable __c
    * * SQL Data Type: bit
    */
    get NU__IsShippable__c(): boolean | null {
        return this.Get('NU__IsShippable__c');
    }
    set NU__IsShippable__c(value: boolean | null) {
        this.Set('NU__IsShippable__c', value);
    }

    /**
    * * Field Name: NU__IsTaxable__c
    * * Display Name: NU__Is Taxable __c
    * * SQL Data Type: bit
    */
    get NU__IsTaxable__c(): boolean | null {
        return this.Get('NU__IsTaxable__c');
    }
    set NU__IsTaxable__c(value: boolean | null) {
        this.Set('NU__IsTaxable__c', value);
    }

    /**
    * * Field Name: NU__ListPrice__c
    * * Display Name: NU__List Price __c
    * * SQL Data Type: decimal(11, 2)
    */
    get NU__ListPrice__c(): number | null {
        return this.Get('NU__ListPrice__c');
    }
    set NU__ListPrice__c(value: number | null) {
        this.Set('NU__ListPrice__c', value);
    }

    /**
    * * Field Name: NU__QuantityMax__c
    * * Display Name: NU__Quantity Max __c
    * * SQL Data Type: decimal(3, 0)
    */
    get NU__QuantityMax__c(): number | null {
        return this.Get('NU__QuantityMax__c');
    }
    set NU__QuantityMax__c(value: number | null) {
        this.Set('NU__QuantityMax__c', value);
    }

    /**
    * * Field Name: NU__RecordTypeName__c
    * * Display Name: Record Type Name
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__RecordTypeName__c(): string | null {
        return this.Get('NU__RecordTypeName__c');
    }
    set NU__RecordTypeName__c(value: string | null) {
        this.Set('NU__RecordTypeName__c', value);
    }

    /**
    * * Field Name: NU__RevenueGLAccount__c
    * * Display Name: NU__Revenue GLAccount __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__RevenueGLAccount__c(): string | null {
        return this.Get('NU__RevenueGLAccount__c');
    }
    set NU__RevenueGLAccount__c(value: string | null) {
        this.Set('NU__RevenueGLAccount__c', value);
    }

    /**
    * * Field Name: NU__SelfServiceEnabled__c
    * * Display Name: NU__Self Service Enabled __c
    * * SQL Data Type: bit
    */
    get NU__SelfServiceEnabled__c(): boolean | null {
        return this.Get('NU__SelfServiceEnabled__c');
    }
    set NU__SelfServiceEnabled__c(value: boolean | null) {
        this.Set('NU__SelfServiceEnabled__c', value);
    }

    /**
    * * Field Name: NU__ShortName__c
    * * Display Name: Short Name
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__ShortName__c(): string | null {
        return this.Get('NU__ShortName__c');
    }
    set NU__ShortName__c(value: string | null) {
        this.Set('NU__ShortName__c', value);
    }

    /**
    * * Field Name: NU__Status__c
    * * Display Name: Status
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Status__c(): string | null {
        return this.Get('NU__Status__c');
    }
    set NU__Status__c(value: string | null) {
        this.Set('NU__Status__c', value);
    }

    /**
    * * Field Name: NU__SubscriptionAnnualStartMonth__c
    * * Display Name: NU__Subscription Annual Start Month __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__SubscriptionAnnualStartMonth__c(): string | null {
        return this.Get('NU__SubscriptionAnnualStartMonth__c');
    }
    set NU__SubscriptionAnnualStartMonth__c(value: string | null) {
        this.Set('NU__SubscriptionAnnualStartMonth__c', value);
    }

    /**
    * * Field Name: NU__SubscriptionGracePeriod__c
    * * Display Name: NU__Subscription Grace Period __c
    * * SQL Data Type: decimal(2, 0)
    */
    get NU__SubscriptionGracePeriod__c(): number | null {
        return this.Get('NU__SubscriptionGracePeriod__c');
    }
    set NU__SubscriptionGracePeriod__c(value: number | null) {
        this.Set('NU__SubscriptionGracePeriod__c', value);
    }

    /**
    * * Field Name: NU__SubscriptionRenewalType__c
    * * Display Name: Suscription Renewal Type
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__SubscriptionRenewalType__c(): string | null {
        return this.Get('NU__SubscriptionRenewalType__c');
    }
    set NU__SubscriptionRenewalType__c(value: string | null) {
        this.Set('NU__SubscriptionRenewalType__c', value);
    }

    /**
    * * Field Name: NU__SubscriptionStartDateControl__c
    * * Display Name: NU__Subscription Start Date Control __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__SubscriptionStartDateControl__c(): string | null {
        return this.Get('NU__SubscriptionStartDateControl__c');
    }
    set NU__SubscriptionStartDateControl__c(value: string | null) {
        this.Set('NU__SubscriptionStartDateControl__c', value);
    }

    /**
    * * Field Name: NU__SubscriptionTerm__c
    * * Display Name: NU__Subscription Term __c
    * * SQL Data Type: decimal(3, 0)
    */
    get NU__SubscriptionTerm__c(): number | null {
        return this.Get('NU__SubscriptionTerm__c');
    }
    set NU__SubscriptionTerm__c(value: number | null) {
        this.Set('NU__SubscriptionTerm__c', value);
    }

    /**
    * * Field Name: NU__TrackInventory__c
    * * Display Name: NU__Track Inventory __c
    * * SQL Data Type: bit
    */
    get NU__TrackInventory__c(): boolean | null {
        return this.Get('NU__TrackInventory__c');
    }
    set NU__TrackInventory__c(value: boolean | null) {
        this.Set('NU__TrackInventory__c', value);
    }

    /**
    * * Field Name: NU__WebProductImageURL__c
    * * Display Name: NU__Web Product Image URL__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__WebProductImageURL__c(): string | null {
        return this.Get('NU__WebProductImageURL__c');
    }
    set NU__WebProductImageURL__c(value: string | null) {
        this.Set('NU__WebProductImageURL__c', value);
    }

    /**
    * * Field Name: NU__WeightInPounds__c
    * * Display Name: NU__Weight In Pounds __c
    * * SQL Data Type: decimal(7, 2)
    */
    get NU__WeightInPounds__c(): number | null {
        return this.Get('NU__WeightInPounds__c');
    }
    set NU__WeightInPounds__c(value: number | null) {
        this.Set('NU__WeightInPounds__c', value);
    }

    /**
    * * Field Name: Legacy_Product_Code__c
    * * Display Name: Legacy _Product _Code __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Legacy_Product_Code__c(): string | null {
        return this.Get('Legacy_Product_Code__c');
    }
    set Legacy_Product_Code__c(value: string | null) {
        this.Set('Legacy_Product_Code__c', value);
    }

    /**
    * * Field Name: MobileActive__c
    * * Display Name: Mobile Active __c
    * * SQL Data Type: bit
    */
    get MobileActive__c(): boolean | null {
        return this.Get('MobileActive__c');
    }
    set MobileActive__c(value: boolean | null) {
        this.Set('MobileActive__c', value);
    }

    /**
    * * Field Name: MobileLocation__c
    * * Display Name: Mobile Location __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get MobileLocation__c(): string | null {
        return this.Get('MobileLocation__c');
    }
    set MobileLocation__c(value: string | null) {
        this.Set('MobileLocation__c', value);
    }

    /**
    * * Field Name: MobileTwitterHashTag__c
    * * Display Name: Mobile Twitter Hash Tag __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get MobileTwitterHashTag__c(): string | null {
        return this.Get('MobileTwitterHashTag__c');
    }
    set MobileTwitterHashTag__c(value: string | null) {
        this.Set('MobileTwitterHashTag__c', value);
    }

    /**
    * * Field Name: Payroll_Payment_Detail__c
    * * Display Name: Payroll _Payment _Detail __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Payroll_Payment_Detail__c(): string | null {
        return this.Get('Payroll_Payment_Detail__c');
    }
    set Payroll_Payment_Detail__c(value: string | null) {
        this.Set('Payroll_Payment_Detail__c', value);
    }

    /**
    * * Field Name: Marketing_Label__c
    * * Display Name: Marketing _Label __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Marketing_Label__c(): string | null {
        return this.Get('Marketing_Label__c');
    }
    set Marketing_Label__c(value: string | null) {
        this.Set('Marketing_Label__c', value);
    }

    /**
    * * Field Name: Easy_Renewal__c
    * * Display Name: Easy _Renewal __c
    * * SQL Data Type: bit
    */
    get Easy_Renewal__c(): boolean | null {
        return this.Get('Easy_Renewal__c');
    }
    set Easy_Renewal__c(value: boolean | null) {
        this.Set('Easy_Renewal__c', value);
    }

    /**
    * * Field Name: Account__c
    * * Display Name: Account __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Account__c(): string | null {
        return this.Get('Account__c');
    }
    set Account__c(value: string | null) {
        this.Set('Account__c', value);
    }

    /**
    * * Field Name: SMSTA_Product__c
    * * Display Name: SMSTA_Product __c
    * * SQL Data Type: bit
    */
    get SMSTA_Product__c(): boolean | null {
        return this.Get('SMSTA_Product__c');
    }
    set SMSTA_Product__c(value: boolean | null) {
        this.Set('SMSTA_Product__c', value);
    }

    /**
    * * Field Name: SMSTATotalOwed__c
    * * Display Name: SMSTATotal Owed __c
    * * SQL Data Type: decimal(11, 2)
    */
    get SMSTATotalOwed__c(): number | null {
        return this.Get('SMSTATotalOwed__c');
    }
    set SMSTATotalOwed__c(value: number | null) {
        this.Set('SMSTATotalOwed__c', value);
    }

    /**
    * * Field Name: NU__Event2__c
    * * Display Name: NU__Event 2__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Event2__c(): string | null {
        return this.Get('NU__Event2__c');
    }
    set NU__Event2__c(value: string | null) {
        this.Set('NU__Event2__c', value);
    }

    /**
    * * Field Name: NU__DownloadUrl__c
    * * Display Name: NU__Download Url __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__DownloadUrl__c(): string | null {
        return this.Get('NU__DownloadUrl__c');
    }
    set NU__DownloadUrl__c(value: string | null) {
        this.Set('NU__DownloadUrl__c', value);
    }

    /**
    * * Field Name: NU__InventoryLastUpdated__c
    * * Display Name: NU__Inventory Last Updated __c
    * * SQL Data Type: datetimeoffset
    */
    get NU__InventoryLastUpdated__c(): Date | null {
        return this.Get('NU__InventoryLastUpdated__c');
    }

    /**
    * * Field Name: NU__IsDownloadable__c
    * * Display Name: NU__Is Downloadable __c
    * * SQL Data Type: bit
    */
    get NU__IsDownloadable__c(): boolean | null {
        return this.Get('NU__IsDownloadable__c');
    }
    set NU__IsDownloadable__c(value: boolean | null) {
        this.Set('NU__IsDownloadable__c', value);
    }

    /**
    * * Field Name: NU__ShortDescription__c
    * * Display Name: NU__Short Description __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__ShortDescription__c(): string | null {
        return this.Get('NU__ShortDescription__c');
    }
    set NU__ShortDescription__c(value: string | null) {
        this.Set('NU__ShortDescription__c', value);
    }

    /**
    * * Field Name: NU__RegistrationTypes__c
    * * Display Name: NU__Registration Types __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__RegistrationTypes__c(): string | null {
        return this.Get('NU__RegistrationTypes__c');
    }
    set NU__RegistrationTypes__c(value: string | null) {
        this.Set('NU__RegistrationTypes__c', value);
    }

    /**
    * * Field Name: NU__BillMeEnabled__c
    * * Display Name: NU__Bill Me Enabled __c
    * * SQL Data Type: bit
    */
    get NU__BillMeEnabled__c(): boolean | null {
        return this.Get('NU__BillMeEnabled__c');
    }
    set NU__BillMeEnabled__c(value: boolean | null) {
        this.Set('NU__BillMeEnabled__c', value);
    }

    /**
    * * Field Name: NU__EndDate__c
    * * Display Name: NU__End Date __c
    * * SQL Data Type: datetimeoffset
    */
    get NU__EndDate__c(): Date | null {
        return this.Get('NU__EndDate__c');
    }

    /**
    * * Field Name: NU__FeeType__c
    * * Display Name: NU__Fee Type __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__FeeType__c(): string | null {
        return this.Get('NU__FeeType__c');
    }
    set NU__FeeType__c(value: string | null) {
        this.Set('NU__FeeType__c', value);
    }

    /**
    * * Field Name: NU__Rate__c
    * * Display Name: NU__Rate __c
    * * SQL Data Type: decimal(18, 0)
    */
    get NU__Rate__c(): number | null {
        return this.Get('NU__Rate__c');
    }
    set NU__Rate__c(value: number | null) {
        this.Set('NU__Rate__c', value);
    }

    /**
    * * Field Name: NU__StartDate__c
    * * Display Name: NU__Start Date __c
    * * SQL Data Type: datetimeoffset
    */
    get NU__StartDate__c(): Date | null {
        return this.Get('NU__StartDate__c');
    }

    /**
    * * Field Name: NU__CheckoutUrl__c
    * * Display Name: NU__Checkout Url __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__CheckoutUrl__c(): string | null {
        return this.Get('NU__CheckoutUrl__c');
    }
    set NU__CheckoutUrl__c(value: string | null) {
        this.Set('NU__CheckoutUrl__c', value);
    }

    /**
    * * Field Name: NU__SuggestedDonationAmounts__c
    * * Display Name: NU__Suggested Donation Amounts __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__SuggestedDonationAmounts__c(): string | null {
        return this.Get('NU__SuggestedDonationAmounts__c');
    }
    set NU__SuggestedDonationAmounts__c(value: string | null) {
        this.Set('NU__SuggestedDonationAmounts__c', value);
    }

    /**
    * * Field Name: NU__UrlParameterName__c
    * * Display Name: NU__Url Parameter Name __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__UrlParameterName__c(): string | null {
        return this.Get('NU__UrlParameterName__c');
    }
    set NU__UrlParameterName__c(value: string | null) {
        this.Set('NU__UrlParameterName__c', value);
    }

    /**
    * * Field Name: NU__CommodityCode__c
    * * Display Name: NU__Commodity Code __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__CommodityCode__c(): string | null {
        return this.Get('NU__CommodityCode__c');
    }
    set NU__CommodityCode__c(value: string | null) {
        this.Set('NU__CommodityCode__c', value);
    }

    /**
    * * Field Name: NU__UnitOfMeasurement__c
    * * Display Name: NU__Unit Of Measurement __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__UnitOfMeasurement__c(): string | null {
        return this.Get('NU__UnitOfMeasurement__c');
    }
    set NU__UnitOfMeasurement__c(value: string | null) {
        this.Set('NU__UnitOfMeasurement__c', value);
    }

    /**
    * * Field Name: NU__Publication__c
    * * Display Name: NU__Publication __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Publication__c(): string | null {
        return this.Get('NU__Publication__c');
    }
    set NU__Publication__c(value: string | null) {
        this.Set('NU__Publication__c', value);
    }

    /**
    * * Field Name: NU__RecurringEligible__c
    * * Display Name: NU__Recurring Eligible __c
    * * SQL Data Type: bit
    */
    get NU__RecurringEligible__c(): boolean | null {
        return this.Get('NU__RecurringEligible__c');
    }
    set NU__RecurringEligible__c(value: boolean | null) {
        this.Set('NU__RecurringEligible__c', value);
    }

    /**
    * * Field Name: NU__RecurringFrequency__c
    * * Display Name: NU__Recurring Frequency __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__RecurringFrequency__c(): string | null {
        return this.Get('NU__RecurringFrequency__c');
    }
    set NU__RecurringFrequency__c(value: string | null) {
        this.Set('NU__RecurringFrequency__c', value);
    }

    /**
    * * Field Name: NU__CanNotBeSoldSeparately2__c
    * * Display Name: NU__Can Not Be Sold Separately 2__c
    * * SQL Data Type: bit
    */
    get NU__CanNotBeSoldSeparately2__c(): boolean | null {
        return this.Get('NU__CanNotBeSoldSeparately2__c');
    }
    set NU__CanNotBeSoldSeparately2__c(value: boolean | null) {
        this.Set('NU__CanNotBeSoldSeparately2__c', value);
    }

    /**
    * * Field Name: NU__TaxCode__c
    * * Display Name: NU__Tax Code __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__TaxCode__c(): string | null {
        return this.Get('NU__TaxCode__c');
    }
    set NU__TaxCode__c(value: string | null) {
        this.Set('NU__TaxCode__c', value);
    }

    /**
    * * Field Name: NU_CBCW__LMSExternalId__c
    * * Display Name: NU_CBCW__LMSExternal Id __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU_CBCW__LMSExternalId__c(): string | null {
        return this.Get('NU_CBCW__LMSExternalId__c');
    }
    set NU_CBCW__LMSExternalId__c(value: string | null) {
        this.Set('NU_CBCW__LMSExternalId__c', value);
    }

    /**
    * * Field Name: NU_CBCW__LMSTerm__c
    * * Display Name: NU_CBCW__LMSTerm __c
    * * SQL Data Type: decimal(3, 0)
    */
    get NU_CBCW__LMSTerm__c(): number | null {
        return this.Get('NU_CBCW__LMSTerm__c');
    }
    set NU_CBCW__LMSTerm__c(value: number | null) {
        this.Set('NU_CBCW__LMSTerm__c', value);
    }

    /**
    * * Field Name: NU_CBCW__SyncWithLMS__c
    * * Display Name: NU_CBCW__Sync With LMS__c
    * * SQL Data Type: bit
    */
    get NU_CBCW__SyncWithLMS__c(): boolean | null {
        return this.Get('NU_CBCW__SyncWithLMS__c');
    }
    set NU_CBCW__SyncWithLMS__c(value: boolean | null) {
        this.Set('NU_CBCW__SyncWithLMS__c', value);
    }

    /**
    * * Field Name: Institution__c
    * * Display Name: Institution __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Institution__c(): string | null {
        return this.Get('Institution__c');
    }
    set Institution__c(value: string | null) {
        this.Set('Institution__c', value);
    }

    /**
    * * Field Name: NU__DescriptionRichText__c
    * * Display Name: NU__Description Rich Text __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__DescriptionRichText__c(): string | null {
        return this.Get('NU__DescriptionRichText__c');
    }
    set NU__DescriptionRichText__c(value: string | null) {
        this.Set('NU__DescriptionRichText__c', value);
    }

    /**
    * * Field Name: NU__AllowCrossEntityCoupon__c
    * * Display Name: NU__Allow Cross Entity Coupon __c
    * * SQL Data Type: bit
    */
    get NU__AllowCrossEntityCoupon__c(): boolean | null {
        return this.Get('NU__AllowCrossEntityCoupon__c');
    }
    set NU__AllowCrossEntityCoupon__c(value: boolean | null) {
        this.Set('NU__AllowCrossEntityCoupon__c', value);
    }

    /**
    * * Field Name: NU_CBCW__LMSErrorMessage__c
    * * Display Name: NU_CBCW__LMSError Message __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU_CBCW__LMSErrorMessage__c(): string | null {
        return this.Get('NU_CBCW__LMSErrorMessage__c');
    }
    set NU_CBCW__LMSErrorMessage__c(value: string | null) {
        this.Set('NU_CBCW__LMSErrorMessage__c', value);
    }

    /**
    * * Field Name: NU_CBCW__LMSLifecycleStatus__c
    * * Display Name: NU_CBCW__LMSLifecycle Status __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU_CBCW__LMSLifecycleStatus__c(): string | null {
        return this.Get('NU_CBCW__LMSLifecycleStatus__c');
    }
    set NU_CBCW__LMSLifecycleStatus__c(value: string | null) {
        this.Set('NU_CBCW__LMSLifecycleStatus__c', value);
    }

    /**
    * * Field Name: NU_CBCW__LMSSynchronizationStatus__c
    * * Display Name: NU_CBCW__LMSSynchronization Status __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU_CBCW__LMSSynchronizationStatus__c(): string | null {
        return this.Get('NU_CBCW__LMSSynchronizationStatus__c');
    }
    set NU_CBCW__LMSSynchronizationStatus__c(value: string | null) {
        this.Set('NU_CBCW__LMSSynchronizationStatus__c', value);
    }

    /**
    * * Field Name: NU_CBCW__LMSType__c
    * * Display Name: NU_CBCW__LMSType __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU_CBCW__LMSType__c(): string | null {
        return this.Get('NU_CBCW__LMSType__c');
    }
    set NU_CBCW__LMSType__c(value: string | null) {
        this.Set('NU_CBCW__LMSType__c', value);
    }

    /**
    * * Field Name: namz__SkipCheckoutForZeroDollars__c
    * * Display Name: namz __Skip Checkout For Zero Dollars __c
    * * SQL Data Type: bit
    */
    get namz__SkipCheckoutForZeroDollars__c(): boolean | null {
        return this.Get('namz__SkipCheckoutForZeroDollars__c');
    }
    set namz__SkipCheckoutForZeroDollars__c(value: boolean | null) {
        this.Set('namz__SkipCheckoutForZeroDollars__c', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Troubleshoot
    * * Display Name: Troubleshoot
    * * SQL Data Type: nvarchar(50)
    */
    get Troubleshoot(): string | null {
        return this.Get('Troubleshoot');
    }
    set Troubleshoot(value: string | null) {
        this.Set('Troubleshoot', value);
    }
}


/**
 * Regions - strongly typed entity sub-class
 * * Schema: dese
 * * Base Table: Regions
 * * Base View: vwRegions
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Regions')
export class RegionsEntity extends BaseEntity<RegionsEntityType> {
    /**
    * Loads the Regions record from the database
    * @param ID: number - primary key value to load the Regions record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof RegionsEntity
    * @method
    * @override
    */
    public async Load(ID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: Primary_Key
    * * Display Name: Primary Key
    * * SQL Data Type: int
    */
    get Primary_Key(): number | null {
        return this.Get('Primary_Key');
    }
    set Primary_Key(value: number | null) {
        this.Set('Primary_Key', value);
    }

    /**
    * * Field Name: Region_Order
    * * Display Name: Region Order
    * * SQL Data Type: int
    */
    get Region_Order(): number | null {
        return this.Get('Region_Order');
    }
    set Region_Order(value: number | null) {
        this.Set('Region_Order', value);
    }

    /**
    * * Field Name: Region_Short
    * * Display Name: Region Abbreviation
    * * SQL Data Type: varchar(15)
    */
    get Region_Short(): string | null {
        return this.Get('Region_Short');
    }
    set Region_Short(value: string | null) {
        this.Set('Region_Short', value);
    }

    /**
    * * Field Name: Region_Long
    * * Display Name: Region Name
    * * SQL Data Type: varchar(30)
    */
    get Region_Long(): string | null {
        return this.Get('Region_Long');
    }
    set Region_Long(value: string | null) {
        this.Set('Region_Long', value);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: int
    */
    get ID(): number {
        return this.Get('ID');
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Registrations - strongly typed entity sub-class
 * * Schema: nams
 * * Base Table: NU__Registration2__c
 * * Base View: vwNU__Registration2__cs
 * * Primary Key: Id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Registrations')
export class NU__Registration2__cEntity extends BaseEntity<NU__Registration2__cEntityType> {
    /**
    * Loads the Registrations record from the database
    * @param Id: string - primary key value to load the Registrations record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof NU__Registration2__cEntity
    * @method
    * @override
    */
    public async Load(Id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'Id', Value: Id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: Id
    * * Display Name: Id
    * * SQL Data Type: nvarchar(50)
    */
    get Id(): string {
        return this.Get('Id');
    }
    set Id(value: string) {
        this.Set('Id', value);
    }

    /**
    * * Field Name: IsDeleted
    * * Display Name: Is Deleted
    * * SQL Data Type: bit
    */
    get IsDeleted(): boolean | null {
        return this.Get('IsDeleted');
    }
    set IsDeleted(value: boolean | null) {
        this.Set('IsDeleted', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Registration Number
    * * SQL Data Type: nvarchar(MAX)
    */
    get Name(): string | null {
        return this.Get('Name');
    }
    set Name(value: string | null) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: CreatedById
    * * Display Name: Created By Id
    * * SQL Data Type: nvarchar(MAX)
    */
    get CreatedById(): string | null {
        return this.Get('CreatedById');
    }
    set CreatedById(value: string | null) {
        this.Set('CreatedById', value);
    }

    /**
    * * Field Name: LastModifiedDate
    * * Display Name: Last Modified Date
    * * SQL Data Type: datetimeoffset
    */
    get LastModifiedDate(): Date | null {
        return this.Get('LastModifiedDate');
    }

    /**
    * * Field Name: LastModifiedById
    * * Display Name: Last Modified By Id
    * * SQL Data Type: nvarchar(MAX)
    */
    get LastModifiedById(): string | null {
        return this.Get('LastModifiedById');
    }
    set LastModifiedById(value: string | null) {
        this.Set('LastModifiedById', value);
    }

    /**
    * * Field Name: SystemModstamp
    * * Display Name: System Modstamp
    * * SQL Data Type: datetimeoffset
    */
    get SystemModstamp(): Date | null {
        return this.Get('SystemModstamp');
    }

    /**
    * * Field Name: LastActivityDate
    * * Display Name: Last Activity Date
    * * SQL Data Type: datetimeoffset
    */
    get LastActivityDate(): Date | null {
        return this.Get('LastActivityDate');
    }

    /**
    * * Field Name: LastViewedDate
    * * Display Name: Last Viewed Date
    * * SQL Data Type: datetimeoffset
    */
    get LastViewedDate(): Date | null {
        return this.Get('LastViewedDate');
    }

    /**
    * * Field Name: LastReferencedDate
    * * Display Name: Last Referenced Date
    * * SQL Data Type: datetimeoffset
    */
    get LastReferencedDate(): Date | null {
        return this.Get('LastReferencedDate');
    }

    /**
    * * Field Name: NU__Account__c
    * * Display Name: NU__Account __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Account__c(): string | null {
        return this.Get('NU__Account__c');
    }
    set NU__Account__c(value: string | null) {
        this.Set('NU__Account__c', value);
    }

    /**
    * * Field Name: NU__Event__c
    * * Display Name: NU__Event __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Event__c(): string | null {
        return this.Get('NU__Event__c');
    }
    set NU__Event__c(value: string | null) {
        this.Set('NU__Event__c', value);
    }

    /**
    * * Field Name: NU__Amount__c
    * * Display Name: NU__Amount __c
    * * SQL Data Type: decimal(18, 2)
    */
    get NU__Amount__c(): number | null {
        return this.Get('NU__Amount__c');
    }
    set NU__Amount__c(value: number | null) {
        this.Set('NU__Amount__c', value);
    }

    /**
    * * Field Name: NU__Balance__c
    * * Display Name: NU__Balance __c
    * * SQL Data Type: decimal(18, 2)
    */
    get NU__Balance__c(): number | null {
        return this.Get('NU__Balance__c');
    }
    set NU__Balance__c(value: number | null) {
        this.Set('NU__Balance__c', value);
    }

    /**
    * * Field Name: NU__EntityName__c
    * * Display Name: Entity Name
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__EntityName__c(): string | null {
        return this.Get('NU__EntityName__c');
    }
    set NU__EntityName__c(value: string | null) {
        this.Set('NU__EntityName__c', value);
    }

    /**
    * * Field Name: NU__EventName__c
    * * Display Name: Event Name
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__EventName__c(): string | null {
        return this.Get('NU__EventName__c');
    }
    set NU__EventName__c(value: string | null) {
        this.Set('NU__EventName__c', value);
    }

    /**
    * * Field Name: NU__EventStartDate__c
    * * Display Name: Event Start Date
    * * SQL Data Type: datetimeoffset
    */
    get NU__EventStartDate__c(): Date | null {
        return this.Get('NU__EventStartDate__c');
    }

    /**
    * * Field Name: NU__ExternalAmount__c
    * * Display Name: NU__External Amount __c
    * * SQL Data Type: decimal(11, 2)
    */
    get NU__ExternalAmount__c(): number | null {
        return this.Get('NU__ExternalAmount__c');
    }
    set NU__ExternalAmount__c(value: number | null) {
        this.Set('NU__ExternalAmount__c', value);
    }

    /**
    * * Field Name: NU__ExternalId__c
    * * Display Name: NU__External Id __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__ExternalId__c(): string | null {
        return this.Get('NU__ExternalId__c');
    }
    set NU__ExternalId__c(value: string | null) {
        this.Set('NU__ExternalId__c', value);
    }

    /**
    * * Field Name: NU__FullName__c
    * * Display Name: Full Name
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__FullName__c(): string | null {
        return this.Get('NU__FullName__c');
    }
    set NU__FullName__c(value: string | null) {
        this.Set('NU__FullName__c', value);
    }

    /**
    * * Field Name: NU__OrderItem__c
    * * Display Name: NU__Order Item __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__OrderItem__c(): string | null {
        return this.Get('NU__OrderItem__c');
    }
    set NU__OrderItem__c(value: string | null) {
        this.Set('NU__OrderItem__c', value);
    }

    /**
    * * Field Name: NU__PriceClass__c
    * * Display Name: Price Class
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__PriceClass__c(): string | null {
        return this.Get('NU__PriceClass__c');
    }
    set NU__PriceClass__c(value: string | null) {
        this.Set('NU__PriceClass__c', value);
    }

    /**
    * * Field Name: NU__PrimaryAffiliation__c
    * * Display Name: Primary Affiliation
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__PrimaryAffiliation__c(): string | null {
        return this.Get('NU__PrimaryAffiliation__c');
    }
    set NU__PrimaryAffiliation__c(value: string | null) {
        this.Set('NU__PrimaryAffiliation__c', value);
    }

    /**
    * * Field Name: NU__RegistrantAddress__c
    * * Display Name: NU__Registrant Address __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__RegistrantAddress__c(): string | null {
        return this.Get('NU__RegistrantAddress__c');
    }
    set NU__RegistrantAddress__c(value: string | null) {
        this.Set('NU__RegistrantAddress__c', value);
    }

    /**
    * * Field Name: NU__RegistrantEmail__c
    * * Display Name: Registrant Email
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__RegistrantEmail__c(): string | null {
        return this.Get('NU__RegistrantEmail__c');
    }
    set NU__RegistrantEmail__c(value: string | null) {
        this.Set('NU__RegistrantEmail__c', value);
    }

    /**
    * * Field Name: NU__Search__c
    * * Display Name: NU__Search __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Search__c(): string | null {
        return this.Get('NU__Search__c');
    }
    set NU__Search__c(value: string | null) {
        this.Set('NU__Search__c', value);
    }

    /**
    * * Field Name: NU__StatusFlag__c
    * * Display Name: NU__Status Flag __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__StatusFlag__c(): string | null {
        return this.Get('NU__StatusFlag__c');
    }
    set NU__StatusFlag__c(value: string | null) {
        this.Set('NU__StatusFlag__c', value);
    }

    /**
    * * Field Name: NU__Status__c
    * * Display Name: Status
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Status__c(): string | null {
        return this.Get('NU__Status__c');
    }
    set NU__Status__c(value: string | null) {
        this.Set('NU__Status__c', value);
    }

    /**
    * * Field Name: NU__TotalPayment__c
    * * Display Name: NU__Total Payment __c
    * * SQL Data Type: decimal(18, 2)
    */
    get NU__TotalPayment__c(): number | null {
        return this.Get('NU__TotalPayment__c');
    }
    set NU__TotalPayment__c(value: number | null) {
        this.Set('NU__TotalPayment__c', value);
    }

    /**
    * * Field Name: Registrant_Institution__c
    * * Display Name: Registrant Email
    * * SQL Data Type: nvarchar(MAX)
    */
    get Registrant_Institution__c(): string | null {
        return this.Get('Registrant_Institution__c');
    }
    set Registrant_Institution__c(value: string | null) {
        this.Set('Registrant_Institution__c', value);
    }

    /**
    * * Field Name: EventID__c
    * * Display Name: Event ID__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get EventID__c(): string | null {
        return this.Get('EventID__c');
    }
    set EventID__c(value: string | null) {
        this.Set('EventID__c', value);
    }

    /**
    * * Field Name: Event_Short_Name__c
    * * Display Name: Event _Short _Name __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get Event_Short_Name__c(): string | null {
        return this.Get('Event_Short_Name__c');
    }
    set Event_Short_Name__c(value: string | null) {
        this.Set('Event_Short_Name__c', value);
    }

    /**
    * * Field Name: Member_ID__c
    * * Display Name: Member ID
    * * SQL Data Type: nvarchar(MAX)
    */
    get Member_ID__c(): string | null {
        return this.Get('Member_ID__c');
    }
    set Member_ID__c(value: string | null) {
        this.Set('Member_ID__c', value);
    }

    /**
    * * Field Name: NU__CancellationReason__c
    * * Display Name: NU__Cancellation Reason __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__CancellationReason__c(): string | null {
        return this.Get('NU__CancellationReason__c');
    }
    set NU__CancellationReason__c(value: string | null) {
        this.Set('NU__CancellationReason__c', value);
    }

    /**
    * * Field Name: NU__Event2__c
    * * Display Name: NU__Event 2__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Event2__c(): string | null {
        return this.Get('NU__Event2__c');
    }
    set NU__Event2__c(value: string | null) {
        this.Set('NU__Event2__c', value);
    }

    /**
    * * Field Name: NU__EventStartDate2__c
    * * Display Name: NU__Event Start Date 2__c
    * * SQL Data Type: datetimeoffset
    */
    get NU__EventStartDate2__c(): Date | null {
        return this.Get('NU__EventStartDate2__c');
    }

    /**
    * * Field Name: NU__RegistrationType__c
    * * Display Name: NU__Registration Type __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__RegistrationType__c(): string | null {
        return this.Get('NU__RegistrationType__c');
    }
    set NU__RegistrationType__c(value: string | null) {
        this.Set('NU__RegistrationType__c', value);
    }

    /**
    * * Field Name: NU__Passcode__c
    * * Display Name: NU__Passcode __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Passcode__c(): string | null {
        return this.Get('NU__Passcode__c');
    }
    set NU__Passcode__c(value: string | null) {
        this.Set('NU__Passcode__c', value);
    }

    /**
    * * Field Name: NU__Account2__c
    * * Display Name: NU__Account 2__c
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Account2__c(): string | null {
        return this.Get('NU__Account2__c');
    }
    set NU__Account2__c(value: string | null) {
        this.Set('NU__Account2__c', value);
    }

    /**
    * * Field Name: InxpoSyncResponse__c
    * * Display Name: Inxpo Sync Response __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get InxpoSyncResponse__c(): string | null {
        return this.Get('InxpoSyncResponse__c');
    }
    set InxpoSyncResponse__c(value: string | null) {
        this.Set('InxpoSyncResponse__c', value);
    }

    /**
    * * Field Name: InxpoSyncStatus__c
    * * Display Name: Inxpo Sync Status __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get InxpoSyncStatus__c(): string | null {
        return this.Get('InxpoSyncStatus__c');
    }
    set InxpoSyncStatus__c(value: string | null) {
        this.Set('InxpoSyncStatus__c', value);
    }

    /**
    * * Field Name: NU__ExternalQuantity__c
    * * Display Name: NU__External Quantity __c
    * * SQL Data Type: decimal(18, 0)
    */
    get NU__ExternalQuantity__c(): number | null {
        return this.Get('NU__ExternalQuantity__c');
    }
    set NU__ExternalQuantity__c(value: number | null) {
        this.Set('NU__ExternalQuantity__c', value);
    }

    /**
    * * Field Name: NU__Quantity__c
    * * Display Name: NU__Quantity __c
    * * SQL Data Type: decimal(18, 0)
    */
    get NU__Quantity__c(): number | null {
        return this.Get('NU__Quantity__c');
    }
    set NU__Quantity__c(value: number | null) {
        this.Set('NU__Quantity__c', value);
    }

    /**
    * * Field Name: NU__ExternalTransactionDate__c
    * * Display Name: NU__External Transaction Date __c
    * * SQL Data Type: datetimeoffset
    */
    get NU__ExternalTransactionDate__c(): Date | null {
        return this.Get('NU__ExternalTransactionDate__c');
    }

    /**
    * * Field Name: NU__ExternalUnitPrice__c
    * * Display Name: NU__External Unit Price __c
    * * SQL Data Type: decimal(11, 2)
    */
    get NU__ExternalUnitPrice__c(): number | null {
        return this.Get('NU__ExternalUnitPrice__c');
    }
    set NU__ExternalUnitPrice__c(value: number | null) {
        this.Set('NU__ExternalUnitPrice__c', value);
    }

    /**
    * * Field Name: NU__TransactionDate__c
    * * Display Name: NU__Transaction Date __c
    * * SQL Data Type: datetimeoffset
    */
    get NU__TransactionDate__c(): Date | null {
        return this.Get('NU__TransactionDate__c');
    }

    /**
    * * Field Name: NU__UnitPrice__c
    * * Display Name: NU__Unit Price __c
    * * SQL Data Type: decimal(18, 2)
    */
    get NU__UnitPrice__c(): number | null {
        return this.Get('NU__UnitPrice__c');
    }
    set NU__UnitPrice__c(value: number | null) {
        this.Set('NU__UnitPrice__c', value);
    }

    /**
    * * Field Name: Exempt_from_Book_Studies__c
    * * Display Name: Exempt _from _Book _Studies __c
    * * SQL Data Type: bit
    */
    get Exempt_from_Book_Studies__c(): boolean | null {
        return this.Get('Exempt_from_Book_Studies__c');
    }
    set Exempt_from_Book_Studies__c(value: boolean | null) {
        this.Set('Exempt_from_Book_Studies__c', value);
    }

    /**
    * * Field Name: namz__EventAnswers__c
    * * Display Name: namz __Event Answers __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get namz__EventAnswers__c(): string | null {
        return this.Get('namz__EventAnswers__c');
    }
    set namz__EventAnswers__c(value: string | null) {
        this.Set('namz__EventAnswers__c', value);
    }

    /**
    * * Field Name: namz__EventBadge__c
    * * Display Name: namz __Event Badge __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get namz__EventBadge__c(): string | null {
        return this.Get('namz__EventBadge__c');
    }
    set namz__EventBadge__c(value: string | null) {
        this.Set('namz__EventBadge__c', value);
    }

    /**
    * * Field Name: namz__OrderItemLine__c
    * * Display Name: namz __Order Item Line __c
    * * SQL Data Type: nvarchar(MAX)
    */
    get namz__OrderItemLine__c(): string | null {
        return this.Get('namz__OrderItemLine__c');
    }
    set namz__OrderItemLine__c(value: string | null) {
        this.Set('namz__OrderItemLine__c', value);
    }

    /**
    * * Field Name: NU__Order__c
    * * Display Name: Order ID
    * * SQL Data Type: nvarchar(MAX)
    */
    get NU__Order__c(): string | null {
        return this.Get('NU__Order__c');
    }
    set NU__Order__c(value: string | null) {
        this.Set('NU__Order__c', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Troubleshoot
    * * Display Name: Troubleshoot
    * * SQL Data Type: nvarchar(50)
    */
    get Troubleshoot(): string | null {
        return this.Get('Troubleshoot');
    }
    set Troubleshoot(value: string | null) {
        this.Set('Troubleshoot', value);
    }
}


/**
 * Salary Ranking Tables - strongly typed entity sub-class
 * * Schema: dese
 * * Base Table: Salary_Ranking_Table
 * * Base View: vwSalary_Ranking_Tables
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Salary Ranking Tables')
export class Salary_Ranking_TableEntity extends BaseEntity<Salary_Ranking_TableEntityType> {
    /**
    * Loads the Salary Ranking Tables record from the database
    * @param ID: number - primary key value to load the Salary Ranking Tables record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof Salary_Ranking_TableEntity
    * @method
    * @override
    */
    public async Load(ID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: co_dist_code
    * * Display Name: County District Code
    * * SQL Data Type: nvarchar(10)
    */
    get co_dist_code(): string | null {
        return this.Get('co_dist_code');
    }
    set co_dist_code(value: string | null) {
        this.Set('co_dist_code', value);
    }

    /**
    * * Field Name: year
    * * Display Name: Year
    * * SQL Data Type: nvarchar(10)
    */
    get year(): string | null {
        return this.Get('year');
    }
    set year(value: string | null) {
        this.Set('year', value);
    }

    /**
    * * Field Name: co_dist_char
    * * Display Name: County District Code
    * * SQL Data Type: varchar(10)
    */
    get co_dist_char(): string | null {
        return this.Get('co_dist_char');
    }
    set co_dist_char(value: string | null) {
        this.Set('co_dist_char', value);
    }

    /**
    * * Field Name: description
    * * Display Name: Description
    * * SQL Data Type: varchar(100)
    */
    get description(): string | null {
        return this.Get('description');
    }
    set description(value: string | null) {
        this.Set('description', value);
    }

    /**
    * * Field Name: supt_sal
    * * Display Name: Superintendent Salary
    * * SQL Data Type: float(53)
    */
    get supt_sal(): number | null {
        return this.Get('supt_sal');
    }
    set supt_sal(value: number | null) {
        this.Set('supt_sal', value);
    }

    /**
    * * Field Name: supt_sal_rank
    * * Display Name: Superintendent Salary Rank
    * * SQL Data Type: float(53)
    */
    get supt_sal_rank(): number | null {
        return this.Get('supt_sal_rank');
    }
    set supt_sal_rank(value: number | null) {
        this.Set('supt_sal_rank', value);
    }

    /**
    * * Field Name: STATE_supt_sal
    * * Display Name: State Superintendent Salary
    * * SQL Data Type: float(53)
    */
    get STATE_supt_sal(): number | null {
        return this.Get('STATE_supt_sal');
    }
    set STATE_supt_sal(value: number | null) {
        this.Set('STATE_supt_sal', value);
    }

    /**
    * * Field Name: supt_sal_all
    * * Display Name: supt _sal _all
    * * SQL Data Type: float(53)
    */
    get supt_sal_all(): number | null {
        return this.Get('supt_sal_all');
    }
    set supt_sal_all(value: number | null) {
        this.Set('supt_sal_all', value);
    }

    /**
    * * Field Name: STATE_supt_sal_all
    * * Display Name: STATE_supt _sal _all
    * * SQL Data Type: float(53)
    */
    get STATE_supt_sal_all(): number | null {
        return this.Get('STATE_supt_sal_all');
    }
    set STATE_supt_sal_all(value: number | null) {
        this.Set('STATE_supt_sal_all', value);
    }

    /**
    * * Field Name: admin_sal
    * * Display Name: Admin Salary
    * * SQL Data Type: float(53)
    */
    get admin_sal(): number | null {
        return this.Get('admin_sal');
    }
    set admin_sal(value: number | null) {
        this.Set('admin_sal', value);
    }

    /**
    * * Field Name: admin_sal_rank
    * * Display Name: Admin Salary Rank
    * * SQL Data Type: float(53)
    */
    get admin_sal_rank(): number | null {
        return this.Get('admin_sal_rank');
    }
    set admin_sal_rank(value: number | null) {
        this.Set('admin_sal_rank', value);
    }

    /**
    * * Field Name: STATE_admin_sal
    * * Display Name: State Admin Salary
    * * SQL Data Type: float(53)
    */
    get STATE_admin_sal(): number | null {
        return this.Get('STATE_admin_sal');
    }
    set STATE_admin_sal(value: number | null) {
        this.Set('STATE_admin_sal', value);
    }

    /**
    * * Field Name: tchr_sal
    * * Display Name: Teacher Salary
    * * SQL Data Type: float(53)
    */
    get tchr_sal(): number | null {
        return this.Get('tchr_sal');
    }
    set tchr_sal(value: number | null) {
        this.Set('tchr_sal', value);
    }

    /**
    * * Field Name: tchr_sal_rank
    * * Display Name: Teacher Salary Rank
    * * SQL Data Type: float(53)
    */
    get tchr_sal_rank(): number | null {
        return this.Get('tchr_sal_rank');
    }
    set tchr_sal_rank(value: number | null) {
        this.Set('tchr_sal_rank', value);
    }

    /**
    * * Field Name: STATE_tchr_sal
    * * Display Name: State Teacher Salary
    * * SQL Data Type: float(53)
    */
    get STATE_tchr_sal(): number | null {
        return this.Get('STATE_tchr_sal');
    }
    set STATE_tchr_sal(value: number | null) {
        this.Set('STATE_tchr_sal', value);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: int
    */
    get ID(): number {
        return this.Get('ID');
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Schools - strongly typed entity sub-class
 * * Schema: dese
 * * Base Table: edschool
 * * Base View: vwedschools
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Schools')
export class edschoolEntity extends BaseEntity<edschoolEntityType> {
    /**
    * Loads the Schools record from the database
    * @param ID: number - primary key value to load the Schools record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof edschoolEntity
    * @method
    * @override
    */
    public async Load(ID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: esssn
    * * Display Name: Social Security Number
    * * SQL Data Type: varchar(100)
    */
    get esssn(): string | null {
        return this.Get('esssn');
    }
    set esssn(value: string | null) {
        this.Set('esssn', value);
    }

    /**
    * * Field Name: co_dist_code
    * * Display Name: County District Code
    * * SQL Data Type: nvarchar(10)
    */
    get co_dist_code(): string | null {
        return this.Get('co_dist_code');
    }
    set co_dist_code(value: string | null) {
        this.Set('co_dist_code', value);
    }

    /**
    * * Field Name: esschool
    * * Display Name: School Code
    * * SQL Data Type: nvarchar(6)
    */
    get esschool(): string | null {
        return this.Get('esschool');
    }
    set esschool(value: string | null) {
        this.Set('esschool', value);
    }

    /**
    * * Field Name: esposcod
    * * Display Name: Position Code
    * * SQL Data Type: char(2)
    */
    get esposcod(): string | null {
        return this.Get('esposcod');
    }
    set esposcod(value: string | null) {
        this.Set('esposcod', value);
    }

    /**
    * * Field Name: year
    * * Display Name: Year
    * * SQL Data Type: nvarchar(10)
    */
    get year(): string | null {
        return this.Get('year');
    }
    set year(value: string | null) {
        this.Set('year', value);
    }

    /**
    * * Field Name: progtyp
    * * Display Name: Vocational Project Type
    * * SQL Data Type: char(4)
    */
    get progtyp(): string | null {
        return this.Get('progtyp');
    }
    set progtyp(value: string | null) {
        this.Set('progtyp', value);
    }

    /**
    * * Field Name: linenum
    * * Display Name: Vocational Line Number
    * * SQL Data Type: int
    */
    get linenum(): number | null {
        return this.Get('linenum');
    }
    set linenum(value: number | null) {
        this.Set('linenum', value);
    }

    /**
    * * Field Name: edsbfte
    * * Display Name: Full-Time Equivalent
    * * SQL Data Type: decimal(3, 2)
    */
    get edsbfte(): number | null {
        return this.Get('edsbfte');
    }
    set edsbfte(value: number | null) {
        this.Set('edsbfte', value);
    }

    /**
    * * Field Name: asalary
    * * Display Name: Salary
    * * SQL Data Type: int
    */
    get asalary(): number | null {
        return this.Get('asalary');
    }
    set asalary(value: number | null) {
        this.Set('asalary', value);
    }

    /**
    * * Field Name: monspos
    * * Display Name: Vocational Months
    * * SQL Data Type: int
    */
    get monspos(): number | null {
        return this.Get('monspos');
    }
    set monspos(value: number | null) {
        this.Set('monspos', value);
    }

    /**
    * * Field Name: avtcode
    * * Display Name: Vocational Area
    * * SQL Data Type: char(1)
    */
    get avtcode(): string | null {
        return this.Get('avtcode');
    }
    set avtcode(value: string | null) {
        this.Set('avtcode', value);
    }

    /**
    * * Field Name: srcecode
    * * Display Name: Source Code
    * * SQL Data Type: int
    */
    get srcecode(): number | null {
        return this.Get('srcecode');
    }
    set srcecode(value: number | null) {
        this.Set('srcecode', value);
    }

    /**
    * * Field Name: voctime1
    * * Display Name: Vocational Time Devoted 1
    * * SQL Data Type: char(1)
    */
    get voctime1(): string | null {
        return this.Get('voctime1');
    }
    set voctime1(value: string | null) {
        this.Set('voctime1', value);
    }

    /**
    * * Field Name: voctime2
    * * Display Name: Vocational Time Devoted 2
    * * SQL Data Type: char(1)
    */
    get voctime2(): string | null {
        return this.Get('voctime2');
    }
    set voctime2(value: string | null) {
        this.Set('voctime2', value);
    }

    /**
    * * Field Name: vreimba
    * * Display Name: Vocational Reimbursement
    * * SQL Data Type: int
    */
    get vreimba(): number | null {
        return this.Get('vreimba');
    }
    set vreimba(value: number | null) {
        this.Set('vreimba', value);
    }

    /**
    * * Field Name: edsbmins
    * * Display Name: School Building Minutes
    * * SQL Data Type: int
    */
    get edsbmins(): number | null {
        return this.Get('edsbmins');
    }
    set edsbmins(value: number | null) {
        this.Set('edsbmins', value);
    }

    /**
    * * Field Name: edprpos
    * * Display Name: Purpose
    * * SQL Data Type: int
    */
    get edprpos(): number | null {
        return this.Get('edprpos');
    }
    set edprpos(value: number | null) {
        this.Set('edprpos', value);
    }

    /**
    * * Field Name: cacommt
    * * Display Name: Course Comments
    * * SQL Data Type: char(70)
    */
    get cacommt(): string | null {
        return this.Get('cacommt');
    }
    set cacommt(value: string | null) {
        this.Set('cacommt', value);
    }

    /**
    * * Field Name: essusp
    * * Display Name: School Suspension Flag
    * * SQL Data Type: char(1)
    */
    get essusp(): string | null {
        return this.Get('essusp');
    }
    set essusp(value: string | null) {
        this.Set('essusp', value);
    }

    /**
    * * Field Name: essuspsu
    * * Display Name: essuspsu
    * * SQL Data Type: char(1)
    */
    get essuspsu(): string | null {
        return this.Get('essuspsu');
    }
    set essuspsu(value: string | null) {
        this.Set('essuspsu', value);
    }

    /**
    * * Field Name: essuspsd
    * * Display Name: essuspsd
    * * SQL Data Type: char(1)
    */
    get essuspsd(): string | null {
        return this.Get('essuspsd');
    }
    set essuspsd(value: string | null) {
        this.Set('essuspsd', value);
    }

    /**
    * * Field Name: essuspsf
    * * Display Name: essuspsf
    * * SQL Data Type: char(1)
    */
    get essuspsf(): string | null {
        return this.Get('essuspsf');
    }
    set essuspsf(value: string | null) {
        this.Set('essuspsf', value);
    }

    /**
    * * Field Name: essusptr
    * * Display Name: essusptr
    * * SQL Data Type: char(1)
    */
    get essusptr(): string | null {
        return this.Get('essusptr');
    }
    set essusptr(value: string | null) {
        this.Set('essusptr', value);
    }

    /**
    * * Field Name: essuspvf
    * * Display Name: essuspvf
    * * SQL Data Type: char(1)
    */
    get essuspvf(): string | null {
        return this.Get('essuspvf');
    }
    set essuspvf(value: string | null) {
        this.Set('essuspvf', value);
    }

    /**
    * * Field Name: essuspve
    * * Display Name: essuspve
    * * SQL Data Type: char(1)
    */
    get essuspve(): string | null {
        return this.Get('essuspve');
    }
    set essuspve(value: string | null) {
        this.Set('essuspve', value);
    }

    /**
    * * Field Name: esladate
    * * Display Name: Last Action Date
    * * SQL Data Type: datetime
    */
    get esladate(): Date | null {
        return this.Get('esladate');
    }
    set esladate(value: Date | null) {
        this.Set('esladate', value);
    }

    /**
    * * Field Name: eslauser
    * * Display Name: Last Action User
    * * SQL Data Type: char(4)
    */
    get eslauser(): string | null {
        return this.Get('eslauser');
    }
    set eslauser(value: string | null) {
        this.Set('eslauser', value);
    }

    /**
    * * Field Name: esdelete
    * * Display Name: Delete Flag
    * * SQL Data Type: char(1)
    */
    get esdelete(): string | null {
        return this.Get('esdelete');
    }
    set esdelete(value: string | null) {
        this.Set('esdelete', value);
    }

    /**
    * * Field Name: eslsdate
    * * Display Name: Building Late Start Date
    * * SQL Data Type: datetime
    */
    get eslsdate(): Date | null {
        return this.Get('eslsdate');
    }
    set eslsdate(value: Date | null) {
        this.Set('eslsdate', value);
    }

    /**
    * * Field Name: eseedate
    * * Display Name: Building Early End Date
    * * SQL Data Type: datetime
    */
    get eseedate(): Date | null {
        return this.Get('eseedate');
    }
    set eseedate(value: Date | null) {
        this.Set('eseedate', value);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: int
    */
    get ID(): number {
        return this.Get('ID');
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * User Joiners - strongly typed entity sub-class
 * * Schema: nams
 * * Base Table: UserJoiner
 * * Base View: vwUserJoiners
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'User Joiners')
export class UserJoinerEntity extends BaseEntity<UserJoinerEntityType> {
    /**
    * Loads the User Joiners record from the database
    * @param ID: number - primary key value to load the User Joiners record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof UserJoinerEntity
    * @method
    * @override
    */
    public async Load(ID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: int
    */
    get ID(): number {
        return this.Get('ID');
    }
    set ID(value: number) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(255)
    */
    get Name(): string | null {
        return this.Get('Name');
    }
    set Name(value: string | null) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: UserID
    * * Display Name: User ID
    * * SQL Data Type: nvarchar(255)
    */
    get UserID(): string | null {
        return this.Get('UserID');
    }
    set UserID(value: string | null) {
        this.Set('UserID', value);
    }

    /**
    * * Field Name: AccountID
    * * Display Name: Account ID
    * * SQL Data Type: nvarchar(255)
    */
    get AccountID(): string | null {
        return this.Get('AccountID');
    }
    set AccountID(value: string | null) {
        this.Set('AccountID', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}
