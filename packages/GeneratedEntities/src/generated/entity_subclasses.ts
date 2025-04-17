import { BaseEntity, EntitySaveOptions, CompositeKey, ValidationResult, ValidationErrorInfo, ValidationErrorType } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { z } from "zod";

export const loadModule = () => {
  // no-op, only used to ensure this file is a valid module and to allow easy loading
}

     
 
/**
 * zod schema definition for the entity Attendees
 */
export const AttendeeSchema = z.object({
    AttendeeID: z.number().describe(`
        * * Field Name: AttendeeID
        * * Display Name: Attendee ID
        * * SQL Data Type: int`),
    OrganizationID: z.number().nullable().describe(`
        * * Field Name: OrganizationID
        * * Display Name: Organization ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Organizations (vwOrganizations.OrganizationID)`),
    Email: z.string().describe(`
        * * Field Name: Email
        * * Display Name: Email
        * * SQL Data Type: nvarchar(255)`),
    FirstName: z.string().nullable().describe(`
        * * Field Name: FirstName
        * * Display Name: First Name
        * * SQL Data Type: nvarchar(50)`),
    LastName: z.string().nullable().describe(`
        * * Field Name: LastName
        * * Display Name: Last Name
        * * SQL Data Type: nvarchar(50)`),
    JobTitle: z.string().nullable().describe(`
        * * Field Name: JobTitle
        * * Display Name: Job Title
        * * SQL Data Type: nvarchar(100)`),
    Address: z.string().nullable().describe(`
        * * Field Name: Address
        * * Display Name: Address
        * * SQL Data Type: nvarchar(255)`),
    City: z.string().nullable().describe(`
        * * Field Name: City
        * * Display Name: City
        * * SQL Data Type: nvarchar(100)`),
    State: z.string().nullable().describe(`
        * * Field Name: State
        * * Display Name: State
        * * SQL Data Type: nvarchar(100)`),
    ZipCode: z.string().nullable().describe(`
        * * Field Name: ZipCode
        * * Display Name: Zip Code
        * * SQL Data Type: nvarchar(20)`),
    Country: z.string().nullable().describe(`
        * * Field Name: Country
        * * Display Name: Country
        * * SQL Data Type: nvarchar(100)`),
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

export type AttendeeEntityType = z.infer<typeof AttendeeSchema>;

/**
 * zod schema definition for the entity Authors
 */
export const AuthorSchema = z.object({
    AuthorID: z.number().describe(`
        * * Field Name: AuthorID
        * * Display Name: Author ID
        * * SQL Data Type: int`),
    CompanyID: z.number().nullable().describe(`
        * * Field Name: CompanyID
        * * Display Name: Company ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Companies__community (vwCompanies__community.CompanyID)`),
    Email: z.string().describe(`
        * * Field Name: Email
        * * Display Name: Email
        * * SQL Data Type: nvarchar(255)`),
    FirstName: z.string().nullable().describe(`
        * * Field Name: FirstName
        * * Display Name: First Name
        * * SQL Data Type: nvarchar(50)`),
    LastName: z.string().nullable().describe(`
        * * Field Name: LastName
        * * Display Name: Last Name
        * * SQL Data Type: nvarchar(50)`),
    JobTitle: z.string().nullable().describe(`
        * * Field Name: JobTitle
        * * Display Name: Job Title
        * * SQL Data Type: nvarchar(100)`),
    Address: z.string().nullable().describe(`
        * * Field Name: Address
        * * Display Name: Address
        * * SQL Data Type: nvarchar(255)`),
    City: z.string().nullable().describe(`
        * * Field Name: City
        * * Display Name: City
        * * SQL Data Type: nvarchar(100)`),
    State: z.string().nullable().describe(`
        * * Field Name: State
        * * Display Name: State
        * * SQL Data Type: nvarchar(100)`),
    ZipCode: z.string().nullable().describe(`
        * * Field Name: ZipCode
        * * Display Name: Zip Code
        * * SQL Data Type: nvarchar(20)`),
    Country: z.string().nullable().describe(`
        * * Field Name: Country
        * * Display Name: Country
        * * SQL Data Type: nvarchar(100)`),
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

export type AuthorEntityType = z.infer<typeof AuthorSchema>;

/**
 * zod schema definition for the entity Companies__community
 */
export const Company__communitySchema = z.object({
    CompanyID: z.number().describe(`
        * * Field Name: CompanyID
        * * Display Name: Company ID
        * * SQL Data Type: int`),
    CompanyName: z.string().describe(`
        * * Field Name: CompanyName
        * * Display Name: Company Name
        * * SQL Data Type: nvarchar(255)`),
    Website: z.string().nullable().describe(`
        * * Field Name: Website
        * * Display Name: Website
        * * SQL Data Type: nvarchar(255)`),
    Industry: z.string().nullable().describe(`
        * * Field Name: Industry
        * * Display Name: Industry
        * * SQL Data Type: nvarchar(100)`),
    Size: z.string().nullable().describe(`
        * * Field Name: Size
        * * Display Name: Size
        * * SQL Data Type: nvarchar(50)`),
    Address: z.string().nullable().describe(`
        * * Field Name: Address
        * * Display Name: Address
        * * SQL Data Type: nvarchar(255)`),
    City: z.string().nullable().describe(`
        * * Field Name: City
        * * Display Name: City
        * * SQL Data Type: nvarchar(100)`),
    State: z.string().nullable().describe(`
        * * Field Name: State
        * * Display Name: State
        * * SQL Data Type: nvarchar(100)`),
    ZipCode: z.string().nullable().describe(`
        * * Field Name: ZipCode
        * * Display Name: Zip Code
        * * SQL Data Type: nvarchar(20)`),
    Country: z.string().nullable().describe(`
        * * Field Name: Country
        * * Display Name: Country
        * * SQL Data Type: nvarchar(100)`),
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

export type Company__communityEntityType = z.infer<typeof Company__communitySchema>;

/**
 * zod schema definition for the entity Companies__education
 */
export const Company__educationSchema = z.object({
    CompanyID: z.number().describe(`
        * * Field Name: CompanyID
        * * Display Name: Company ID
        * * SQL Data Type: int`),
    CompanyName: z.string().describe(`
        * * Field Name: CompanyName
        * * Display Name: Company Name
        * * SQL Data Type: nvarchar(255)`),
    Website: z.string().nullable().describe(`
        * * Field Name: Website
        * * Display Name: Website
        * * SQL Data Type: nvarchar(255)`),
    Industry: z.string().nullable().describe(`
        * * Field Name: Industry
        * * Display Name: Industry
        * * SQL Data Type: nvarchar(100)`),
    Size: z.string().nullable().describe(`
        * * Field Name: Size
        * * Display Name: Size
        * * SQL Data Type: nvarchar(50)`),
    Address: z.string().nullable().describe(`
        * * Field Name: Address
        * * Display Name: Address
        * * SQL Data Type: nvarchar(255)`),
    City: z.string().nullable().describe(`
        * * Field Name: City
        * * Display Name: City
        * * SQL Data Type: nvarchar(100)`),
    State: z.string().nullable().describe(`
        * * Field Name: State
        * * Display Name: State
        * * SQL Data Type: nvarchar(100)`),
    ZipCode: z.string().nullable().describe(`
        * * Field Name: ZipCode
        * * Display Name: Zip Code
        * * SQL Data Type: nvarchar(20)`),
    Country: z.string().nullable().describe(`
        * * Field Name: Country
        * * Display Name: Country
        * * SQL Data Type: nvarchar(100)`),
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

export type Company__educationEntityType = z.infer<typeof Company__educationSchema>;

/**
 * zod schema definition for the entity Companies__membership
 */
export const Company__membershipSchema = z.object({
    CompanyID: z.number().describe(`
        * * Field Name: CompanyID
        * * Display Name: Company ID
        * * SQL Data Type: int`),
    CompanyName: z.string().describe(`
        * * Field Name: CompanyName
        * * Display Name: Company Name
        * * SQL Data Type: nvarchar(255)`),
    Website: z.string().nullable().describe(`
        * * Field Name: Website
        * * Display Name: Website
        * * SQL Data Type: nvarchar(255)`),
    Industry: z.string().nullable().describe(`
        * * Field Name: Industry
        * * Display Name: Industry
        * * SQL Data Type: nvarchar(100)`),
    Size: z.string().nullable().describe(`
        * * Field Name: Size
        * * Display Name: Size
        * * SQL Data Type: nvarchar(50)`),
    Address: z.string().nullable().describe(`
        * * Field Name: Address
        * * Display Name: Address
        * * SQL Data Type: nvarchar(255)`),
    City: z.string().nullable().describe(`
        * * Field Name: City
        * * Display Name: City
        * * SQL Data Type: nvarchar(100)`),
    State: z.string().nullable().describe(`
        * * Field Name: State
        * * Display Name: State
        * * SQL Data Type: nvarchar(100)`),
    ZipCode: z.string().nullable().describe(`
        * * Field Name: ZipCode
        * * Display Name: Zip Code
        * * SQL Data Type: nvarchar(20)`),
    Country: z.string().nullable().describe(`
        * * Field Name: Country
        * * Display Name: Country
        * * SQL Data Type: nvarchar(100)`),
    TaxID: z.string().nullable().describe(`
        * * Field Name: TaxID
        * * Display Name: Tax ID
        * * SQL Data Type: nvarchar(100)`),
    Subsection: z.number().nullable().describe(`
        * * Field Name: Subsection
        * * Display Name: Subsection
        * * SQL Data Type: int`),
    TotalRevenue: z.number().nullable().describe(`
        * * Field Name: TotalRevenue
        * * Display Name: Total Revenue
        * * SQL Data Type: money`),
    InformationTechnologyExpense: z.number().nullable().describe(`
        * * Field Name: InformationTechnologyExpense
        * * Display Name: Information Technology Expense
        * * SQL Data Type: money`),
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

export type Company__membershipEntityType = z.infer<typeof Company__membershipSchema>;

/**
 * zod schema definition for the entity Courses
 */
export const CourseSchema = z.object({
    CourseID: z.number().describe(`
        * * Field Name: CourseID
        * * Display Name: Course ID
        * * SQL Data Type: int`),
    CourseName: z.string().describe(`
        * * Field Name: CourseName
        * * Display Name: Course Name
        * * SQL Data Type: nvarchar(255)`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    StartDate: z.date().describe(`
        * * Field Name: StartDate
        * * Display Name: Start Date
        * * SQL Data Type: date`),
    EndDate: z.date().nullable().describe(`
        * * Field Name: EndDate
        * * Display Name: End Date
        * * SQL Data Type: date`),
    MemberPrice: z.number().nullable().describe(`
        * * Field Name: MemberPrice
        * * Display Name: Member Price
        * * SQL Data Type: money`),
    NonMemberPrice: z.number().nullable().describe(`
        * * Field Name: NonMemberPrice
        * * Display Name: Non Member Price
        * * SQL Data Type: money`),
    InstructorID: z.number().nullable().describe(`
        * * Field Name: InstructorID
        * * Display Name: Instructor ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Instructors (vwInstructors.InstructorID)`),
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

export type CourseEntityType = z.infer<typeof CourseSchema>;

/**
 * zod schema definition for the entity Events
 */
export const EventSchema = z.object({
    EventID: z.number().describe(`
        * * Field Name: EventID
        * * Display Name: Event ID
        * * SQL Data Type: int`),
    EventName: z.string().describe(`
        * * Field Name: EventName
        * * Display Name: Event Name
        * * SQL Data Type: nvarchar(255)`),
    Location: z.string().nullable().describe(`
        * * Field Name: Location
        * * Display Name: Location
        * * SQL Data Type: nvarchar(255)`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    StartDate: z.date().nullable().describe(`
        * * Field Name: StartDate
        * * Display Name: Start Date
        * * SQL Data Type: date`),
    EndDate: z.date().nullable().describe(`
        * * Field Name: EndDate
        * * Display Name: End Date
        * * SQL Data Type: date`),
    Address: z.string().nullable().describe(`
        * * Field Name: Address
        * * Display Name: Address
        * * SQL Data Type: nvarchar(255)`),
    City: z.string().nullable().describe(`
        * * Field Name: City
        * * Display Name: City
        * * SQL Data Type: nvarchar(100)`),
    State: z.string().nullable().describe(`
        * * Field Name: State
        * * Display Name: State
        * * SQL Data Type: nvarchar(100)`),
    Zip: z.string().nullable().describe(`
        * * Field Name: Zip
        * * Display Name: Zip
        * * SQL Data Type: nvarchar(20)`),
    Country: z.string().nullable().describe(`
        * * Field Name: Country
        * * Display Name: Country
        * * SQL Data Type: nvarchar(100)`),
    EventType: z.string().nullable().describe(`
        * * Field Name: EventType
        * * Display Name: Event Type
        * * SQL Data Type: nvarchar(20)`),
    MemberPrice: z.number().nullable().describe(`
        * * Field Name: MemberPrice
        * * Display Name: Member Price
        * * SQL Data Type: money`),
    NonMemberPrice: z.number().nullable().describe(`
        * * Field Name: NonMemberPrice
        * * Display Name: Non Member Price
        * * SQL Data Type: money`),
    SpeakerPrice: z.number().nullable().describe(`
        * * Field Name: SpeakerPrice
        * * Display Name: Speaker Price
        * * SQL Data Type: money`),
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

export type EventEntityType = z.infer<typeof EventSchema>;

/**
 * zod schema definition for the entity Forums
 */
export const ForumSchema = z.object({
    ForumID: z.number().describe(`
        * * Field Name: ForumID
        * * Display Name: Forum ID
        * * SQL Data Type: int`),
    Title: z.string().describe(`
        * * Field Name: Title
        * * Display Name: Title
        * * SQL Data Type: nvarchar(255)`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    CreationDate: z.date().describe(`
        * * Field Name: CreationDate
        * * Display Name: Creation Date
        * * SQL Data Type: date`),
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

export type ForumEntityType = z.infer<typeof ForumSchema>;

/**
 * zod schema definition for the entity Instructors
 */
export const InstructorSchema = z.object({
    InstructorID: z.number().describe(`
        * * Field Name: InstructorID
        * * Display Name: Instructor ID
        * * SQL Data Type: int`),
    FirstName: z.string().nullable().describe(`
        * * Field Name: FirstName
        * * Display Name: First Name
        * * SQL Data Type: nvarchar(50)`),
    LastName: z.string().nullable().describe(`
        * * Field Name: LastName
        * * Display Name: Last Name
        * * SQL Data Type: nvarchar(50)`),
    Email: z.string().nullable().describe(`
        * * Field Name: Email
        * * Display Name: Email
        * * SQL Data Type: nvarchar(100)`),
    Bio: z.string().nullable().describe(`
        * * Field Name: Bio
        * * Display Name: Bio
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
});

export type InstructorEntityType = z.infer<typeof InstructorSchema>;

/**
 * zod schema definition for the entity Job Title Seeds
 */
export const JobTitleSeedSchema = z.object({
    JobTitleID: z.number().describe(`
        * * Field Name: JobTitleID
        * * Display Name: Job Title ID
        * * SQL Data Type: int`),
    JobTitle: z.string().nullable().describe(`
        * * Field Name: JobTitle
        * * Display Name: Job Title
        * * SQL Data Type: nvarchar(100)`),
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

export type JobTitleSeedEntityType = z.infer<typeof JobTitleSeedSchema>;

/**
 * zod schema definition for the entity Member Types
 */
export const MemberTypeSchema = z.object({
    MemberTypeID: z.number().describe(`
        * * Field Name: MemberTypeID
        * * Display Name: Member Type ID
        * * SQL Data Type: int`),
    TypeName: z.string().describe(`
        * * Field Name: TypeName
        * * Display Name: Type Name
        * * SQL Data Type: nvarchar(100)`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    AnnualDues: z.number().nullable().describe(`
        * * Field Name: AnnualDues
        * * Display Name: Annual Dues
        * * SQL Data Type: money`),
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

export type MemberTypeEntityType = z.infer<typeof MemberTypeSchema>;

/**
 * zod schema definition for the entity Members
 */
export const MemberSchema = z.object({
    MemberID: z.number().describe(`
        * * Field Name: MemberID
        * * Display Name: Member ID
        * * SQL Data Type: int`),
    CompanyID: z.number().nullable().describe(`
        * * Field Name: CompanyID
        * * Display Name: Company ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Companies__membership (vwCompanies__membership.CompanyID)`),
    Email: z.string().describe(`
        * * Field Name: Email
        * * Display Name: Email
        * * SQL Data Type: nvarchar(255)`),
    FirstName: z.string().nullable().describe(`
        * * Field Name: FirstName
        * * Display Name: First Name
        * * SQL Data Type: nvarchar(50)`),
    LastName: z.string().nullable().describe(`
        * * Field Name: LastName
        * * Display Name: Last Name
        * * SQL Data Type: nvarchar(50)`),
    JobTitle: z.string().nullable().describe(`
        * * Field Name: JobTitle
        * * Display Name: Job Title
        * * SQL Data Type: nvarchar(100)`),
    JoinDate: z.date().describe(`
        * * Field Name: JoinDate
        * * Display Name: Join Date
        * * SQL Data Type: date`),
    MemberTypeID: z.number().describe(`
        * * Field Name: MemberTypeID
        * * Display Name: Member Type ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Member Types (vwMemberTypes.MemberTypeID)`),
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

export type MemberEntityType = z.infer<typeof MemberSchema>;

/**
 * zod schema definition for the entity Membership Renewals
 */
export const MembershipRenewalSchema = z.object({
    RenewalID: z.number().describe(`
        * * Field Name: RenewalID
        * * Display Name: Renewal ID
        * * SQL Data Type: int`),
    MemberID: z.number().describe(`
        * * Field Name: MemberID
        * * Display Name: Member ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Members (vwMembers.MemberID)`),
    RenewalDate: z.date().describe(`
        * * Field Name: RenewalDate
        * * Display Name: Renewal Date
        * * SQL Data Type: date`),
    PaymentAmount: z.number().nullable().describe(`
        * * Field Name: PaymentAmount
        * * Display Name: Payment Amount
        * * SQL Data Type: money`),
    PaymentStatus: z.string().nullable().describe(`
        * * Field Name: PaymentStatus
        * * Display Name: Payment Status
        * * SQL Data Type: nvarchar(255)
    * * Description: Pending, Completed, Refunded`),
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

export type MembershipRenewalEntityType = z.infer<typeof MembershipRenewalSchema>;

/**
 * zod schema definition for the entity Name Seeds
 */
export const NameSeedSchema = z.object({
    NameID: z.number().describe(`
        * * Field Name: NameID
        * * Display Name: Name ID
        * * SQL Data Type: int`),
    Name: z.string().nullable().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(50)`),
    NameType: z.union([z.literal('First'), z.literal('Last'), z.literal('Middle')]).nullable().describe(`
        * * Field Name: NameType
        * * Display Name: Name Type
        * * SQL Data Type: nvarchar(10)
    * * Value List Type: List
    * * Possible Values 
    *   * First
    *   * Last
    *   * Middle`),
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

export type NameSeedEntityType = z.infer<typeof NameSeedSchema>;

/**
 * zod schema definition for the entity Organization Links
 */
export const OrganizationLinkSchema = z.object({
    OrganizationLinkID: z.number().describe(`
        * * Field Name: OrganizationLinkID
        * * Display Name: Organization Link ID
        * * SQL Data Type: int`),
    MembershipCompanyID: z.number().nullable().describe(`
        * * Field Name: MembershipCompanyID
        * * Display Name: Membership Company ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Companies__membership (vwCompanies__membership.CompanyID)`),
    EventsOrganizationID: z.number().nullable().describe(`
        * * Field Name: EventsOrganizationID
        * * Display Name: Events Organization ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Organizations (vwOrganizations.OrganizationID)`),
    EducationCompanyID: z.number().nullable().describe(`
        * * Field Name: EducationCompanyID
        * * Display Name: Education Company ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Companies__education (vwCompanies__education.CompanyID)`),
    CommunityCompanyID: z.number().nullable().describe(`
        * * Field Name: CommunityCompanyID
        * * Display Name: Community Company ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Companies__community (vwCompanies__community.CompanyID)`),
    CreatedAt: z.date().describe(`
        * * Field Name: CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetime
        * * Default Value: getdate()`),
    UpdatedAt: z.date().describe(`
        * * Field Name: UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetime
        * * Default Value: getdate()`),
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

export type OrganizationLinkEntityType = z.infer<typeof OrganizationLinkSchema>;

/**
 * zod schema definition for the entity Organizations
 */
export const OrganizationSchema = z.object({
    OrganizationID: z.number().describe(`
        * * Field Name: OrganizationID
        * * Display Name: Organization ID
        * * SQL Data Type: int`),
    OrganizationName: z.string().describe(`
        * * Field Name: OrganizationName
        * * Display Name: Organization Name
        * * SQL Data Type: nvarchar(255)`),
    Website: z.string().nullable().describe(`
        * * Field Name: Website
        * * Display Name: Website
        * * SQL Data Type: nvarchar(255)`),
    Industry: z.string().nullable().describe(`
        * * Field Name: Industry
        * * Display Name: Industry
        * * SQL Data Type: nvarchar(100)`),
    Size: z.string().nullable().describe(`
        * * Field Name: Size
        * * Display Name: Size
        * * SQL Data Type: nvarchar(50)`),
    Address: z.string().nullable().describe(`
        * * Field Name: Address
        * * Display Name: Address
        * * SQL Data Type: nvarchar(255)`),
    City: z.string().nullable().describe(`
        * * Field Name: City
        * * Display Name: City
        * * SQL Data Type: nvarchar(100)`),
    State: z.string().nullable().describe(`
        * * Field Name: State
        * * Display Name: State
        * * SQL Data Type: nvarchar(100)`),
    ZipCode: z.string().nullable().describe(`
        * * Field Name: ZipCode
        * * Display Name: Zip Code
        * * SQL Data Type: nvarchar(20)`),
    Country: z.string().nullable().describe(`
        * * Field Name: Country
        * * Display Name: Country
        * * SQL Data Type: nvarchar(100)`),
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

export type OrganizationEntityType = z.infer<typeof OrganizationSchema>;

/**
 * zod schema definition for the entity Person Links
 */
export const PersonLinkSchema = z.object({
    PersonLinkID: z.number().describe(`
        * * Field Name: PersonLinkID
        * * Display Name: Person Link ID
        * * SQL Data Type: int`),
    MembershipMemberID: z.number().nullable().describe(`
        * * Field Name: MembershipMemberID
        * * Display Name: Membership Member ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Members (vwMembers.MemberID)`),
    EventsAttendeeID: z.number().nullable().describe(`
        * * Field Name: EventsAttendeeID
        * * Display Name: Events Attendee ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Attendees (vwAttendees.AttendeeID)`),
    EducationStudentID: z.number().nullable().describe(`
        * * Field Name: EducationStudentID
        * * Display Name: Education Student ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Students (vwStudents.StudentID)`),
    CommunityAuthorID: z.number().nullable().describe(`
        * * Field Name: CommunityAuthorID
        * * Display Name: Community Author ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Authors (vwAuthors.AuthorID)`),
    CreatedAt: z.date().describe(`
        * * Field Name: CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetime
        * * Default Value: getdate()`),
    UpdatedAt: z.date().describe(`
        * * Field Name: UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetime
        * * Default Value: getdate()`),
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

export type PersonLinkEntityType = z.infer<typeof PersonLinkSchema>;

/**
 * zod schema definition for the entity Post Seeds
 */
export const PostSeedSchema = z.object({
    PostSeedID: z.number().describe(`
        * * Field Name: PostSeedID
        * * Display Name: Post Seed ID
        * * SQL Data Type: int`),
    Content: z.string().nullable().describe(`
        * * Field Name: Content
        * * Display Name: Content
        * * SQL Data Type: nvarchar(MAX)`),
    Type: z.string().nullable().describe(`
        * * Field Name: Type
        * * Display Name: Type
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

export type PostSeedEntityType = z.infer<typeof PostSeedSchema>;

/**
 * zod schema definition for the entity Posts
 */
export const PostSchema = z.object({
    PostID: z.number().describe(`
        * * Field Name: PostID
        * * Display Name: Post ID
        * * SQL Data Type: int`),
    ForumID: z.number().describe(`
        * * Field Name: ForumID
        * * Display Name: Forum ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Forums (vwForums.ForumID)`),
    AuthorID: z.number().describe(`
        * * Field Name: AuthorID
        * * Display Name: Author ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Authors (vwAuthors.AuthorID)`),
    PostContent: z.string().nullable().describe(`
        * * Field Name: PostContent
        * * Display Name: Post Content
        * * SQL Data Type: nvarchar(MAX)`),
    PostDate: z.date().describe(`
        * * Field Name: PostDate
        * * Display Name: Post Date
        * * SQL Data Type: date`),
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

export type PostEntityType = z.infer<typeof PostSchema>;

/**
 * zod schema definition for the entity Registrations
 */
export const RegistrationSchema = z.object({
    RegistrationID: z.number().describe(`
        * * Field Name: RegistrationID
        * * Display Name: Registration ID
        * * SQL Data Type: int`),
    EventID: z.number().describe(`
        * * Field Name: EventID
        * * Display Name: Event ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Events (vwEvents.EventID)`),
    AttendeeID: z.number().describe(`
        * * Field Name: AttendeeID
        * * Display Name: Attendee ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Attendees (vwAttendees.AttendeeID)`),
    RegistrationDate: z.date().describe(`
        * * Field Name: RegistrationDate
        * * Display Name: Registration Date
        * * SQL Data Type: date`),
    RegistrationFee: z.number().nullable().describe(`
        * * Field Name: RegistrationFee
        * * Display Name: Registration Fee
        * * SQL Data Type: money`),
    PaymentStatus: z.string().nullable().describe(`
        * * Field Name: PaymentStatus
        * * Display Name: Payment Status
        * * SQL Data Type: nvarchar(255)
    * * Description: Paid, Unpaid, Refunded`),
    Status: z.union([z.literal('Pending'), z.literal('Registered'), z.literal('Attended'), z.literal('Canceled')]).nullable().describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(255)
    * * Value List Type: List
    * * Possible Values 
    *   * Pending
    *   * Registered
    *   * Attended
    *   * Canceled
    * * Description: Registered, Pending, Canceled, Attended`),
    RegistrationType: z.string().nullable().describe(`
        * * Field Name: RegistrationType
        * * Display Name: Registration Type
        * * SQL Data Type: nvarchar(20)
    * * Description: Attendee, Sponsor, Speaker`),
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

export type RegistrationEntityType = z.infer<typeof RegistrationSchema>;

/**
 * zod schema definition for the entity Registrations__education
 */
export const Registration__educationSchema = z.object({
    RegistrationID: z.number().describe(`
        * * Field Name: RegistrationID
        * * Display Name: Registration ID
        * * SQL Data Type: int`),
    CourseID: z.number().describe(`
        * * Field Name: CourseID
        * * Display Name: Course ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Courses (vwCourses.CourseID)`),
    StudentID: z.number().describe(`
        * * Field Name: StudentID
        * * Display Name: Student ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Students (vwStudents.StudentID)`),
    RegistrationDate: z.date().describe(`
        * * Field Name: RegistrationDate
        * * Display Name: Registration Date
        * * SQL Data Type: date`),
    RegistrationFee: z.number().nullable().describe(`
        * * Field Name: RegistrationFee
        * * Display Name: Registration Fee
        * * SQL Data Type: money`),
    PaymentStatus: z.string().nullable().describe(`
        * * Field Name: PaymentStatus
        * * Display Name: Payment Status
        * * SQL Data Type: nvarchar(255)
    * * Description: Paid, Unpaid, Refunded`),
    CompletionStatus: z.string().nullable().describe(`
        * * Field Name: CompletionStatus
        * * Display Name: Completion Status
        * * SQL Data Type: nvarchar(255)
    * * Description: Pending, In Progress, Failed, Completed`),
    CertificationAwarded: z.boolean().nullable().describe(`
        * * Field Name: CertificationAwarded
        * * Display Name: Certification Awarded
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
});

export type Registration__educationEntityType = z.infer<typeof Registration__educationSchema>;

/**
 * zod schema definition for the entity Replies
 */
export const ReplySchema = z.object({
    ReplyID: z.number().describe(`
        * * Field Name: ReplyID
        * * Display Name: Reply ID
        * * SQL Data Type: int`),
    PostID: z.number().describe(`
        * * Field Name: PostID
        * * Display Name: Post ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Posts (vwPosts.PostID)`),
    AuthorID: z.number().describe(`
        * * Field Name: AuthorID
        * * Display Name: Author ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Authors (vwAuthors.AuthorID)`),
    ReplyContent: z.string().nullable().describe(`
        * * Field Name: ReplyContent
        * * Display Name: Reply Content
        * * SQL Data Type: nvarchar(MAX)`),
    ReplyDate: z.date().describe(`
        * * Field Name: ReplyDate
        * * Display Name: Reply Date
        * * SQL Data Type: date`),
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

export type ReplyEntityType = z.infer<typeof ReplySchema>;

/**
 * zod schema definition for the entity Reply Seeds
 */
export const ReplySeedSchema = z.object({
    ReplySeedID: z.number().describe(`
        * * Field Name: ReplySeedID
        * * Display Name: Reply Seed ID
        * * SQL Data Type: int`),
    Content: z.string().nullable().describe(`
        * * Field Name: Content
        * * Display Name: Content
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
});

export type ReplySeedEntityType = z.infer<typeof ReplySeedSchema>;

/**
 * zod schema definition for the entity Students
 */
export const StudentSchema = z.object({
    StudentID: z.number().describe(`
        * * Field Name: StudentID
        * * Display Name: Student ID
        * * SQL Data Type: int`),
    CompanyID: z.number().nullable().describe(`
        * * Field Name: CompanyID
        * * Display Name: Company ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Companies__education (vwCompanies__education.CompanyID)`),
    Email: z.string().describe(`
        * * Field Name: Email
        * * Display Name: Email
        * * SQL Data Type: nvarchar(255)`),
    FirstName: z.string().nullable().describe(`
        * * Field Name: FirstName
        * * Display Name: First Name
        * * SQL Data Type: nvarchar(50)`),
    LastName: z.string().nullable().describe(`
        * * Field Name: LastName
        * * Display Name: Last Name
        * * SQL Data Type: nvarchar(50)`),
    JobTitle: z.string().nullable().describe(`
        * * Field Name: JobTitle
        * * Display Name: Job Title
        * * SQL Data Type: nvarchar(100)`),
    Address: z.string().nullable().describe(`
        * * Field Name: Address
        * * Display Name: Address
        * * SQL Data Type: nvarchar(255)`),
    City: z.string().nullable().describe(`
        * * Field Name: City
        * * Display Name: City
        * * SQL Data Type: nvarchar(100)`),
    State: z.string().nullable().describe(`
        * * Field Name: State
        * * Display Name: State
        * * SQL Data Type: nvarchar(100)`),
    ZipCode: z.string().nullable().describe(`
        * * Field Name: ZipCode
        * * Display Name: Zip Code
        * * SQL Data Type: nvarchar(20)`),
    Country: z.string().nullable().describe(`
        * * Field Name: Country
        * * Display Name: Country
        * * SQL Data Type: nvarchar(100)`),
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

export type StudentEntityType = z.infer<typeof StudentSchema>;
 
 

/**
 * Attendees - strongly typed entity sub-class
 * * Schema: events
 * * Base Table: Attendee
 * * Base View: vwAttendees
 * * Primary Key: AttendeeID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Attendees')
export class AttendeeEntity extends BaseEntity<AttendeeEntityType> {
    /**
    * Loads the Attendees record from the database
    * @param AttendeeID: number - primary key value to load the Attendees record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AttendeeEntity
    * @method
    * @override
    */
    public async Load(AttendeeID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'AttendeeID', Value: AttendeeID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: AttendeeID
    * * Display Name: Attendee ID
    * * SQL Data Type: int
    */
    get AttendeeID(): number {
        return this.Get('AttendeeID');
    }

    /**
    * * Field Name: OrganizationID
    * * Display Name: Organization ID
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Organizations (vwOrganizations.OrganizationID)
    */
    get OrganizationID(): number | null {
        return this.Get('OrganizationID');
    }
    set OrganizationID(value: number | null) {
        this.Set('OrganizationID', value);
    }

    /**
    * * Field Name: Email
    * * Display Name: Email
    * * SQL Data Type: nvarchar(255)
    */
    get Email(): string {
        return this.Get('Email');
    }
    set Email(value: string) {
        this.Set('Email', value);
    }

    /**
    * * Field Name: FirstName
    * * Display Name: First Name
    * * SQL Data Type: nvarchar(50)
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
    * * SQL Data Type: nvarchar(50)
    */
    get LastName(): string | null {
        return this.Get('LastName');
    }
    set LastName(value: string | null) {
        this.Set('LastName', value);
    }

    /**
    * * Field Name: JobTitle
    * * Display Name: Job Title
    * * SQL Data Type: nvarchar(100)
    */
    get JobTitle(): string | null {
        return this.Get('JobTitle');
    }
    set JobTitle(value: string | null) {
        this.Set('JobTitle', value);
    }

    /**
    * * Field Name: Address
    * * Display Name: Address
    * * SQL Data Type: nvarchar(255)
    */
    get Address(): string | null {
        return this.Get('Address');
    }
    set Address(value: string | null) {
        this.Set('Address', value);
    }

    /**
    * * Field Name: City
    * * Display Name: City
    * * SQL Data Type: nvarchar(100)
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
    * * SQL Data Type: nvarchar(100)
    */
    get State(): string | null {
        return this.Get('State');
    }
    set State(value: string | null) {
        this.Set('State', value);
    }

    /**
    * * Field Name: ZipCode
    * * Display Name: Zip Code
    * * SQL Data Type: nvarchar(20)
    */
    get ZipCode(): string | null {
        return this.Get('ZipCode');
    }
    set ZipCode(value: string | null) {
        this.Set('ZipCode', value);
    }

    /**
    * * Field Name: Country
    * * Display Name: Country
    * * SQL Data Type: nvarchar(100)
    */
    get Country(): string | null {
        return this.Get('Country');
    }
    set Country(value: string | null) {
        this.Set('Country', value);
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
 * Authors - strongly typed entity sub-class
 * * Schema: community
 * * Base Table: Author
 * * Base View: vwAuthors
 * * Primary Key: AuthorID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Authors')
export class AuthorEntity extends BaseEntity<AuthorEntityType> {
    /**
    * Loads the Authors record from the database
    * @param AuthorID: number - primary key value to load the Authors record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AuthorEntity
    * @method
    * @override
    */
    public async Load(AuthorID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'AuthorID', Value: AuthorID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: AuthorID
    * * Display Name: Author ID
    * * SQL Data Type: int
    */
    get AuthorID(): number {
        return this.Get('AuthorID');
    }

    /**
    * * Field Name: CompanyID
    * * Display Name: Company ID
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Companies__community (vwCompanies__community.CompanyID)
    */
    get CompanyID(): number | null {
        return this.Get('CompanyID');
    }
    set CompanyID(value: number | null) {
        this.Set('CompanyID', value);
    }

    /**
    * * Field Name: Email
    * * Display Name: Email
    * * SQL Data Type: nvarchar(255)
    */
    get Email(): string {
        return this.Get('Email');
    }
    set Email(value: string) {
        this.Set('Email', value);
    }

    /**
    * * Field Name: FirstName
    * * Display Name: First Name
    * * SQL Data Type: nvarchar(50)
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
    * * SQL Data Type: nvarchar(50)
    */
    get LastName(): string | null {
        return this.Get('LastName');
    }
    set LastName(value: string | null) {
        this.Set('LastName', value);
    }

    /**
    * * Field Name: JobTitle
    * * Display Name: Job Title
    * * SQL Data Type: nvarchar(100)
    */
    get JobTitle(): string | null {
        return this.Get('JobTitle');
    }
    set JobTitle(value: string | null) {
        this.Set('JobTitle', value);
    }

    /**
    * * Field Name: Address
    * * Display Name: Address
    * * SQL Data Type: nvarchar(255)
    */
    get Address(): string | null {
        return this.Get('Address');
    }
    set Address(value: string | null) {
        this.Set('Address', value);
    }

    /**
    * * Field Name: City
    * * Display Name: City
    * * SQL Data Type: nvarchar(100)
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
    * * SQL Data Type: nvarchar(100)
    */
    get State(): string | null {
        return this.Get('State');
    }
    set State(value: string | null) {
        this.Set('State', value);
    }

    /**
    * * Field Name: ZipCode
    * * Display Name: Zip Code
    * * SQL Data Type: nvarchar(20)
    */
    get ZipCode(): string | null {
        return this.Get('ZipCode');
    }
    set ZipCode(value: string | null) {
        this.Set('ZipCode', value);
    }

    /**
    * * Field Name: Country
    * * Display Name: Country
    * * SQL Data Type: nvarchar(100)
    */
    get Country(): string | null {
        return this.Get('Country');
    }
    set Country(value: string | null) {
        this.Set('Country', value);
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
 * Companies__community - strongly typed entity sub-class
 * * Schema: community
 * * Base Table: Company
 * * Base View: vwCompanies__community
 * * Primary Key: CompanyID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Companies__community')
export class Company__communityEntity extends BaseEntity<Company__communityEntityType> {
    /**
    * Loads the Companies__community record from the database
    * @param CompanyID: number - primary key value to load the Companies__community record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof Company__communityEntity
    * @method
    * @override
    */
    public async Load(CompanyID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'CompanyID', Value: CompanyID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: CompanyID
    * * Display Name: Company ID
    * * SQL Data Type: int
    */
    get CompanyID(): number {
        return this.Get('CompanyID');
    }

    /**
    * * Field Name: CompanyName
    * * Display Name: Company Name
    * * SQL Data Type: nvarchar(255)
    */
    get CompanyName(): string {
        return this.Get('CompanyName');
    }
    set CompanyName(value: string) {
        this.Set('CompanyName', value);
    }

    /**
    * * Field Name: Website
    * * Display Name: Website
    * * SQL Data Type: nvarchar(255)
    */
    get Website(): string | null {
        return this.Get('Website');
    }
    set Website(value: string | null) {
        this.Set('Website', value);
    }

    /**
    * * Field Name: Industry
    * * Display Name: Industry
    * * SQL Data Type: nvarchar(100)
    */
    get Industry(): string | null {
        return this.Get('Industry');
    }
    set Industry(value: string | null) {
        this.Set('Industry', value);
    }

    /**
    * * Field Name: Size
    * * Display Name: Size
    * * SQL Data Type: nvarchar(50)
    */
    get Size(): string | null {
        return this.Get('Size');
    }
    set Size(value: string | null) {
        this.Set('Size', value);
    }

    /**
    * * Field Name: Address
    * * Display Name: Address
    * * SQL Data Type: nvarchar(255)
    */
    get Address(): string | null {
        return this.Get('Address');
    }
    set Address(value: string | null) {
        this.Set('Address', value);
    }

    /**
    * * Field Name: City
    * * Display Name: City
    * * SQL Data Type: nvarchar(100)
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
    * * SQL Data Type: nvarchar(100)
    */
    get State(): string | null {
        return this.Get('State');
    }
    set State(value: string | null) {
        this.Set('State', value);
    }

    /**
    * * Field Name: ZipCode
    * * Display Name: Zip Code
    * * SQL Data Type: nvarchar(20)
    */
    get ZipCode(): string | null {
        return this.Get('ZipCode');
    }
    set ZipCode(value: string | null) {
        this.Set('ZipCode', value);
    }

    /**
    * * Field Name: Country
    * * Display Name: Country
    * * SQL Data Type: nvarchar(100)
    */
    get Country(): string | null {
        return this.Get('Country');
    }
    set Country(value: string | null) {
        this.Set('Country', value);
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
 * Companies__education - strongly typed entity sub-class
 * * Schema: education
 * * Base Table: Company
 * * Base View: vwCompanies__education
 * * Primary Key: CompanyID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Companies__education')
export class Company__educationEntity extends BaseEntity<Company__educationEntityType> {
    /**
    * Loads the Companies__education record from the database
    * @param CompanyID: number - primary key value to load the Companies__education record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof Company__educationEntity
    * @method
    * @override
    */
    public async Load(CompanyID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'CompanyID', Value: CompanyID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: CompanyID
    * * Display Name: Company ID
    * * SQL Data Type: int
    */
    get CompanyID(): number {
        return this.Get('CompanyID');
    }

    /**
    * * Field Name: CompanyName
    * * Display Name: Company Name
    * * SQL Data Type: nvarchar(255)
    */
    get CompanyName(): string {
        return this.Get('CompanyName');
    }
    set CompanyName(value: string) {
        this.Set('CompanyName', value);
    }

    /**
    * * Field Name: Website
    * * Display Name: Website
    * * SQL Data Type: nvarchar(255)
    */
    get Website(): string | null {
        return this.Get('Website');
    }
    set Website(value: string | null) {
        this.Set('Website', value);
    }

    /**
    * * Field Name: Industry
    * * Display Name: Industry
    * * SQL Data Type: nvarchar(100)
    */
    get Industry(): string | null {
        return this.Get('Industry');
    }
    set Industry(value: string | null) {
        this.Set('Industry', value);
    }

    /**
    * * Field Name: Size
    * * Display Name: Size
    * * SQL Data Type: nvarchar(50)
    */
    get Size(): string | null {
        return this.Get('Size');
    }
    set Size(value: string | null) {
        this.Set('Size', value);
    }

    /**
    * * Field Name: Address
    * * Display Name: Address
    * * SQL Data Type: nvarchar(255)
    */
    get Address(): string | null {
        return this.Get('Address');
    }
    set Address(value: string | null) {
        this.Set('Address', value);
    }

    /**
    * * Field Name: City
    * * Display Name: City
    * * SQL Data Type: nvarchar(100)
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
    * * SQL Data Type: nvarchar(100)
    */
    get State(): string | null {
        return this.Get('State');
    }
    set State(value: string | null) {
        this.Set('State', value);
    }

    /**
    * * Field Name: ZipCode
    * * Display Name: Zip Code
    * * SQL Data Type: nvarchar(20)
    */
    get ZipCode(): string | null {
        return this.Get('ZipCode');
    }
    set ZipCode(value: string | null) {
        this.Set('ZipCode', value);
    }

    /**
    * * Field Name: Country
    * * Display Name: Country
    * * SQL Data Type: nvarchar(100)
    */
    get Country(): string | null {
        return this.Get('Country');
    }
    set Country(value: string | null) {
        this.Set('Country', value);
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
 * Companies__membership - strongly typed entity sub-class
 * * Schema: membership
 * * Base Table: Company
 * * Base View: vwCompanies__membership
 * * Primary Key: CompanyID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Companies__membership')
export class Company__membershipEntity extends BaseEntity<Company__membershipEntityType> {
    /**
    * Loads the Companies__membership record from the database
    * @param CompanyID: number - primary key value to load the Companies__membership record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof Company__membershipEntity
    * @method
    * @override
    */
    public async Load(CompanyID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'CompanyID', Value: CompanyID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: CompanyID
    * * Display Name: Company ID
    * * SQL Data Type: int
    */
    get CompanyID(): number {
        return this.Get('CompanyID');
    }

    /**
    * * Field Name: CompanyName
    * * Display Name: Company Name
    * * SQL Data Type: nvarchar(255)
    */
    get CompanyName(): string {
        return this.Get('CompanyName');
    }
    set CompanyName(value: string) {
        this.Set('CompanyName', value);
    }

    /**
    * * Field Name: Website
    * * Display Name: Website
    * * SQL Data Type: nvarchar(255)
    */
    get Website(): string | null {
        return this.Get('Website');
    }
    set Website(value: string | null) {
        this.Set('Website', value);
    }

    /**
    * * Field Name: Industry
    * * Display Name: Industry
    * * SQL Data Type: nvarchar(100)
    */
    get Industry(): string | null {
        return this.Get('Industry');
    }
    set Industry(value: string | null) {
        this.Set('Industry', value);
    }

    /**
    * * Field Name: Size
    * * Display Name: Size
    * * SQL Data Type: nvarchar(50)
    */
    get Size(): string | null {
        return this.Get('Size');
    }
    set Size(value: string | null) {
        this.Set('Size', value);
    }

    /**
    * * Field Name: Address
    * * Display Name: Address
    * * SQL Data Type: nvarchar(255)
    */
    get Address(): string | null {
        return this.Get('Address');
    }
    set Address(value: string | null) {
        this.Set('Address', value);
    }

    /**
    * * Field Name: City
    * * Display Name: City
    * * SQL Data Type: nvarchar(100)
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
    * * SQL Data Type: nvarchar(100)
    */
    get State(): string | null {
        return this.Get('State');
    }
    set State(value: string | null) {
        this.Set('State', value);
    }

    /**
    * * Field Name: ZipCode
    * * Display Name: Zip Code
    * * SQL Data Type: nvarchar(20)
    */
    get ZipCode(): string | null {
        return this.Get('ZipCode');
    }
    set ZipCode(value: string | null) {
        this.Set('ZipCode', value);
    }

    /**
    * * Field Name: Country
    * * Display Name: Country
    * * SQL Data Type: nvarchar(100)
    */
    get Country(): string | null {
        return this.Get('Country');
    }
    set Country(value: string | null) {
        this.Set('Country', value);
    }

    /**
    * * Field Name: TaxID
    * * Display Name: Tax ID
    * * SQL Data Type: nvarchar(100)
    */
    get TaxID(): string | null {
        return this.Get('TaxID');
    }
    set TaxID(value: string | null) {
        this.Set('TaxID', value);
    }

    /**
    * * Field Name: Subsection
    * * Display Name: Subsection
    * * SQL Data Type: int
    */
    get Subsection(): number | null {
        return this.Get('Subsection');
    }
    set Subsection(value: number | null) {
        this.Set('Subsection', value);
    }

    /**
    * * Field Name: TotalRevenue
    * * Display Name: Total Revenue
    * * SQL Data Type: money
    */
    get TotalRevenue(): number | null {
        return this.Get('TotalRevenue');
    }
    set TotalRevenue(value: number | null) {
        this.Set('TotalRevenue', value);
    }

    /**
    * * Field Name: InformationTechnologyExpense
    * * Display Name: Information Technology Expense
    * * SQL Data Type: money
    */
    get InformationTechnologyExpense(): number | null {
        return this.Get('InformationTechnologyExpense');
    }
    set InformationTechnologyExpense(value: number | null) {
        this.Set('InformationTechnologyExpense', value);
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
 * Courses - strongly typed entity sub-class
 * * Schema: education
 * * Base Table: Course
 * * Base View: vwCourses
 * * Primary Key: CourseID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Courses')
export class CourseEntity extends BaseEntity<CourseEntityType> {
    /**
    * Loads the Courses record from the database
    * @param CourseID: number - primary key value to load the Courses record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof CourseEntity
    * @method
    * @override
    */
    public async Load(CourseID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'CourseID', Value: CourseID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: CourseID
    * * Display Name: Course ID
    * * SQL Data Type: int
    */
    get CourseID(): number {
        return this.Get('CourseID');
    }

    /**
    * * Field Name: CourseName
    * * Display Name: Course Name
    * * SQL Data Type: nvarchar(255)
    */
    get CourseName(): string {
        return this.Get('CourseName');
    }
    set CourseName(value: string) {
        this.Set('CourseName', value);
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
    * * Field Name: StartDate
    * * Display Name: Start Date
    * * SQL Data Type: date
    */
    get StartDate(): Date {
        return this.Get('StartDate');
    }
    set StartDate(value: Date) {
        this.Set('StartDate', value);
    }

    /**
    * * Field Name: EndDate
    * * Display Name: End Date
    * * SQL Data Type: date
    */
    get EndDate(): Date | null {
        return this.Get('EndDate');
    }
    set EndDate(value: Date | null) {
        this.Set('EndDate', value);
    }

    /**
    * * Field Name: MemberPrice
    * * Display Name: Member Price
    * * SQL Data Type: money
    */
    get MemberPrice(): number | null {
        return this.Get('MemberPrice');
    }
    set MemberPrice(value: number | null) {
        this.Set('MemberPrice', value);
    }

    /**
    * * Field Name: NonMemberPrice
    * * Display Name: Non Member Price
    * * SQL Data Type: money
    */
    get NonMemberPrice(): number | null {
        return this.Get('NonMemberPrice');
    }
    set NonMemberPrice(value: number | null) {
        this.Set('NonMemberPrice', value);
    }

    /**
    * * Field Name: InstructorID
    * * Display Name: Instructor ID
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Instructors (vwInstructors.InstructorID)
    */
    get InstructorID(): number | null {
        return this.Get('InstructorID');
    }
    set InstructorID(value: number | null) {
        this.Set('InstructorID', value);
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
 * * Schema: events
 * * Base Table: Event
 * * Base View: vwEvents
 * * @description Listing of all past, present, and future events
 * * Primary Key: EventID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Events')
export class EventEntity extends BaseEntity<EventEntityType> {
    /**
    * Loads the Events record from the database
    * @param EventID: number - primary key value to load the Events record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof EventEntity
    * @method
    * @override
    */
    public async Load(EventID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'EventID', Value: EventID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: EventID
    * * Display Name: Event ID
    * * SQL Data Type: int
    */
    get EventID(): number {
        return this.Get('EventID');
    }

    /**
    * * Field Name: EventName
    * * Display Name: Event Name
    * * SQL Data Type: nvarchar(255)
    */
    get EventName(): string {
        return this.Get('EventName');
    }
    set EventName(value: string) {
        this.Set('EventName', value);
    }

    /**
    * * Field Name: Location
    * * Display Name: Location
    * * SQL Data Type: nvarchar(255)
    */
    get Location(): string | null {
        return this.Get('Location');
    }
    set Location(value: string | null) {
        this.Set('Location', value);
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
    * * Field Name: StartDate
    * * Display Name: Start Date
    * * SQL Data Type: date
    */
    get StartDate(): Date | null {
        return this.Get('StartDate');
    }
    set StartDate(value: Date | null) {
        this.Set('StartDate', value);
    }

    /**
    * * Field Name: EndDate
    * * Display Name: End Date
    * * SQL Data Type: date
    */
    get EndDate(): Date | null {
        return this.Get('EndDate');
    }
    set EndDate(value: Date | null) {
        this.Set('EndDate', value);
    }

    /**
    * * Field Name: Address
    * * Display Name: Address
    * * SQL Data Type: nvarchar(255)
    */
    get Address(): string | null {
        return this.Get('Address');
    }
    set Address(value: string | null) {
        this.Set('Address', value);
    }

    /**
    * * Field Name: City
    * * Display Name: City
    * * SQL Data Type: nvarchar(100)
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
    * * SQL Data Type: nvarchar(100)
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
    * * SQL Data Type: nvarchar(20)
    */
    get Zip(): string | null {
        return this.Get('Zip');
    }
    set Zip(value: string | null) {
        this.Set('Zip', value);
    }

    /**
    * * Field Name: Country
    * * Display Name: Country
    * * SQL Data Type: nvarchar(100)
    */
    get Country(): string | null {
        return this.Get('Country');
    }
    set Country(value: string | null) {
        this.Set('Country', value);
    }

    /**
    * * Field Name: EventType
    * * Display Name: Event Type
    * * SQL Data Type: nvarchar(20)
    */
    get EventType(): string | null {
        return this.Get('EventType');
    }
    set EventType(value: string | null) {
        this.Set('EventType', value);
    }

    /**
    * * Field Name: MemberPrice
    * * Display Name: Member Price
    * * SQL Data Type: money
    */
    get MemberPrice(): number | null {
        return this.Get('MemberPrice');
    }
    set MemberPrice(value: number | null) {
        this.Set('MemberPrice', value);
    }

    /**
    * * Field Name: NonMemberPrice
    * * Display Name: Non Member Price
    * * SQL Data Type: money
    */
    get NonMemberPrice(): number | null {
        return this.Get('NonMemberPrice');
    }
    set NonMemberPrice(value: number | null) {
        this.Set('NonMemberPrice', value);
    }

    /**
    * * Field Name: SpeakerPrice
    * * Display Name: Speaker Price
    * * SQL Data Type: money
    */
    get SpeakerPrice(): number | null {
        return this.Get('SpeakerPrice');
    }
    set SpeakerPrice(value: number | null) {
        this.Set('SpeakerPrice', value);
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
 * Forums - strongly typed entity sub-class
 * * Schema: community
 * * Base Table: Forum
 * * Base View: vwForums
 * * Primary Key: ForumID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Forums')
export class ForumEntity extends BaseEntity<ForumEntityType> {
    /**
    * Loads the Forums record from the database
    * @param ForumID: number - primary key value to load the Forums record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ForumEntity
    * @method
    * @override
    */
    public async Load(ForumID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ForumID', Value: ForumID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ForumID
    * * Display Name: Forum ID
    * * SQL Data Type: int
    */
    get ForumID(): number {
        return this.Get('ForumID');
    }

    /**
    * * Field Name: Title
    * * Display Name: Title
    * * SQL Data Type: nvarchar(255)
    */
    get Title(): string {
        return this.Get('Title');
    }
    set Title(value: string) {
        this.Set('Title', value);
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
    * * Field Name: CreationDate
    * * Display Name: Creation Date
    * * SQL Data Type: date
    */
    get CreationDate(): Date {
        return this.Get('CreationDate');
    }
    set CreationDate(value: Date) {
        this.Set('CreationDate', value);
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
 * Instructors - strongly typed entity sub-class
 * * Schema: education
 * * Base Table: Instructor
 * * Base View: vwInstructors
 * * Primary Key: InstructorID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Instructors')
export class InstructorEntity extends BaseEntity<InstructorEntityType> {
    /**
    * Loads the Instructors record from the database
    * @param InstructorID: number - primary key value to load the Instructors record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof InstructorEntity
    * @method
    * @override
    */
    public async Load(InstructorID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'InstructorID', Value: InstructorID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: InstructorID
    * * Display Name: Instructor ID
    * * SQL Data Type: int
    */
    get InstructorID(): number {
        return this.Get('InstructorID');
    }

    /**
    * * Field Name: FirstName
    * * Display Name: First Name
    * * SQL Data Type: nvarchar(50)
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
    * * SQL Data Type: nvarchar(50)
    */
    get LastName(): string | null {
        return this.Get('LastName');
    }
    set LastName(value: string | null) {
        this.Set('LastName', value);
    }

    /**
    * * Field Name: Email
    * * Display Name: Email
    * * SQL Data Type: nvarchar(100)
    */
    get Email(): string | null {
        return this.Get('Email');
    }
    set Email(value: string | null) {
        this.Set('Email', value);
    }

    /**
    * * Field Name: Bio
    * * Display Name: Bio
    * * SQL Data Type: nvarchar(MAX)
    */
    get Bio(): string | null {
        return this.Get('Bio');
    }
    set Bio(value: string | null) {
        this.Set('Bio', value);
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
 * Job Title Seeds - strongly typed entity sub-class
 * * Schema: reference
 * * Base Table: JobTitleSeed
 * * Base View: vwJobTitleSeeds
 * * Primary Key: JobTitleID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Job Title Seeds')
export class JobTitleSeedEntity extends BaseEntity<JobTitleSeedEntityType> {
    /**
    * Loads the Job Title Seeds record from the database
    * @param JobTitleID: number - primary key value to load the Job Title Seeds record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof JobTitleSeedEntity
    * @method
    * @override
    */
    public async Load(JobTitleID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'JobTitleID', Value: JobTitleID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: JobTitleID
    * * Display Name: Job Title ID
    * * SQL Data Type: int
    */
    get JobTitleID(): number {
        return this.Get('JobTitleID');
    }

    /**
    * * Field Name: JobTitle
    * * Display Name: Job Title
    * * SQL Data Type: nvarchar(100)
    */
    get JobTitle(): string | null {
        return this.Get('JobTitle');
    }
    set JobTitle(value: string | null) {
        this.Set('JobTitle', value);
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
 * Member Types - strongly typed entity sub-class
 * * Schema: membership
 * * Base Table: MemberType
 * * Base View: vwMemberTypes
 * * Primary Key: MemberTypeID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Member Types')
export class MemberTypeEntity extends BaseEntity<MemberTypeEntityType> {
    /**
    * Loads the Member Types record from the database
    * @param MemberTypeID: number - primary key value to load the Member Types record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof MemberTypeEntity
    * @method
    * @override
    */
    public async Load(MemberTypeID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'MemberTypeID', Value: MemberTypeID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: MemberTypeID
    * * Display Name: Member Type ID
    * * SQL Data Type: int
    */
    get MemberTypeID(): number {
        return this.Get('MemberTypeID');
    }

    /**
    * * Field Name: TypeName
    * * Display Name: Type Name
    * * SQL Data Type: nvarchar(100)
    */
    get TypeName(): string {
        return this.Get('TypeName');
    }
    set TypeName(value: string) {
        this.Set('TypeName', value);
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
    * * Field Name: AnnualDues
    * * Display Name: Annual Dues
    * * SQL Data Type: money
    */
    get AnnualDues(): number | null {
        return this.Get('AnnualDues');
    }
    set AnnualDues(value: number | null) {
        this.Set('AnnualDues', value);
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
 * Members - strongly typed entity sub-class
 * * Schema: membership
 * * Base Table: Member
 * * Base View: vwMembers
 * * Primary Key: MemberID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Members')
export class MemberEntity extends BaseEntity<MemberEntityType> {
    /**
    * Loads the Members record from the database
    * @param MemberID: number - primary key value to load the Members record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof MemberEntity
    * @method
    * @override
    */
    public async Load(MemberID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'MemberID', Value: MemberID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: MemberID
    * * Display Name: Member ID
    * * SQL Data Type: int
    */
    get MemberID(): number {
        return this.Get('MemberID');
    }

    /**
    * * Field Name: CompanyID
    * * Display Name: Company ID
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Companies__membership (vwCompanies__membership.CompanyID)
    */
    get CompanyID(): number | null {
        return this.Get('CompanyID');
    }
    set CompanyID(value: number | null) {
        this.Set('CompanyID', value);
    }

    /**
    * * Field Name: Email
    * * Display Name: Email
    * * SQL Data Type: nvarchar(255)
    */
    get Email(): string {
        return this.Get('Email');
    }
    set Email(value: string) {
        this.Set('Email', value);
    }

    /**
    * * Field Name: FirstName
    * * Display Name: First Name
    * * SQL Data Type: nvarchar(50)
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
    * * SQL Data Type: nvarchar(50)
    */
    get LastName(): string | null {
        return this.Get('LastName');
    }
    set LastName(value: string | null) {
        this.Set('LastName', value);
    }

    /**
    * * Field Name: JobTitle
    * * Display Name: Job Title
    * * SQL Data Type: nvarchar(100)
    */
    get JobTitle(): string | null {
        return this.Get('JobTitle');
    }
    set JobTitle(value: string | null) {
        this.Set('JobTitle', value);
    }

    /**
    * * Field Name: JoinDate
    * * Display Name: Join Date
    * * SQL Data Type: date
    */
    get JoinDate(): Date {
        return this.Get('JoinDate');
    }
    set JoinDate(value: Date) {
        this.Set('JoinDate', value);
    }

    /**
    * * Field Name: MemberTypeID
    * * Display Name: Member Type ID
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Member Types (vwMemberTypes.MemberTypeID)
    */
    get MemberTypeID(): number {
        return this.Get('MemberTypeID');
    }
    set MemberTypeID(value: number) {
        this.Set('MemberTypeID', value);
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
 * Membership Renewals - strongly typed entity sub-class
 * * Schema: membership
 * * Base Table: MembershipRenewal
 * * Base View: vwMembershipRenewals
 * * Primary Key: RenewalID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Membership Renewals')
export class MembershipRenewalEntity extends BaseEntity<MembershipRenewalEntityType> {
    /**
    * Loads the Membership Renewals record from the database
    * @param RenewalID: number - primary key value to load the Membership Renewals record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof MembershipRenewalEntity
    * @method
    * @override
    */
    public async Load(RenewalID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'RenewalID', Value: RenewalID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: RenewalID
    * * Display Name: Renewal ID
    * * SQL Data Type: int
    */
    get RenewalID(): number {
        return this.Get('RenewalID');
    }

    /**
    * * Field Name: MemberID
    * * Display Name: Member ID
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Members (vwMembers.MemberID)
    */
    get MemberID(): number {
        return this.Get('MemberID');
    }
    set MemberID(value: number) {
        this.Set('MemberID', value);
    }

    /**
    * * Field Name: RenewalDate
    * * Display Name: Renewal Date
    * * SQL Data Type: date
    */
    get RenewalDate(): Date {
        return this.Get('RenewalDate');
    }
    set RenewalDate(value: Date) {
        this.Set('RenewalDate', value);
    }

    /**
    * * Field Name: PaymentAmount
    * * Display Name: Payment Amount
    * * SQL Data Type: money
    */
    get PaymentAmount(): number | null {
        return this.Get('PaymentAmount');
    }
    set PaymentAmount(value: number | null) {
        this.Set('PaymentAmount', value);
    }

    /**
    * * Field Name: PaymentStatus
    * * Display Name: Payment Status
    * * SQL Data Type: nvarchar(255)
    * * Description: Pending, Completed, Refunded
    */
    get PaymentStatus(): string | null {
        return this.Get('PaymentStatus');
    }
    set PaymentStatus(value: string | null) {
        this.Set('PaymentStatus', value);
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
 * Name Seeds - strongly typed entity sub-class
 * * Schema: reference
 * * Base Table: NameSeed
 * * Base View: vwNameSeeds
 * * Primary Key: NameID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Name Seeds')
export class NameSeedEntity extends BaseEntity<NameSeedEntityType> {
    /**
    * Loads the Name Seeds record from the database
    * @param NameID: number - primary key value to load the Name Seeds record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof NameSeedEntity
    * @method
    * @override
    */
    public async Load(NameID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'NameID', Value: NameID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: NameID
    * * Display Name: Name ID
    * * SQL Data Type: int
    */
    get NameID(): number {
        return this.Get('NameID');
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(50)
    */
    get Name(): string | null {
        return this.Get('Name');
    }
    set Name(value: string | null) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: NameType
    * * Display Name: Name Type
    * * SQL Data Type: nvarchar(10)
    * * Value List Type: List
    * * Possible Values 
    *   * First
    *   * Last
    *   * Middle
    */
    get NameType(): 'First' | 'Last' | 'Middle' | null {
        return this.Get('NameType');
    }
    set NameType(value: 'First' | 'Last' | 'Middle' | null) {
        this.Set('NameType', value);
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
 * Organization Links - strongly typed entity sub-class
 * * Schema: common
 * * Base Table: OrganizationLink
 * * Base View: vwOrganizationLinks
 * * @description CompanyLink is used to connect data from across multiple schemas. These source schemas represent different source systems like membership, education, events, etc. The CompanyLink table has entries for "matches" between records that represent companies/organizations across the different source systems so that we have a structured way to unify this data in the CDP.
 * * Primary Key: OrganizationLinkID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Organization Links')
export class OrganizationLinkEntity extends BaseEntity<OrganizationLinkEntityType> {
    /**
    * Loads the Organization Links record from the database
    * @param OrganizationLinkID: number - primary key value to load the Organization Links record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof OrganizationLinkEntity
    * @method
    * @override
    */
    public async Load(OrganizationLinkID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'OrganizationLinkID', Value: OrganizationLinkID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: OrganizationLinkID
    * * Display Name: Organization Link ID
    * * SQL Data Type: int
    */
    get OrganizationLinkID(): number {
        return this.Get('OrganizationLinkID');
    }

    /**
    * * Field Name: MembershipCompanyID
    * * Display Name: Membership Company ID
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Companies__membership (vwCompanies__membership.CompanyID)
    */
    get MembershipCompanyID(): number | null {
        return this.Get('MembershipCompanyID');
    }
    set MembershipCompanyID(value: number | null) {
        this.Set('MembershipCompanyID', value);
    }

    /**
    * * Field Name: EventsOrganizationID
    * * Display Name: Events Organization ID
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Organizations (vwOrganizations.OrganizationID)
    */
    get EventsOrganizationID(): number | null {
        return this.Get('EventsOrganizationID');
    }
    set EventsOrganizationID(value: number | null) {
        this.Set('EventsOrganizationID', value);
    }

    /**
    * * Field Name: EducationCompanyID
    * * Display Name: Education Company ID
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Companies__education (vwCompanies__education.CompanyID)
    */
    get EducationCompanyID(): number | null {
        return this.Get('EducationCompanyID');
    }
    set EducationCompanyID(value: number | null) {
        this.Set('EducationCompanyID', value);
    }

    /**
    * * Field Name: CommunityCompanyID
    * * Display Name: Community Company ID
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Companies__community (vwCompanies__community.CompanyID)
    */
    get CommunityCompanyID(): number | null {
        return this.Get('CommunityCompanyID');
    }
    set CommunityCompanyID(value: number | null) {
        this.Set('CommunityCompanyID', value);
    }

    /**
    * * Field Name: CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetime
    * * Default Value: getdate()
    */
    get CreatedAt(): Date {
        return this.Get('CreatedAt');
    }
    set CreatedAt(value: Date) {
        this.Set('CreatedAt', value);
    }

    /**
    * * Field Name: UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetime
    * * Default Value: getdate()
    */
    get UpdatedAt(): Date {
        return this.Get('UpdatedAt');
    }
    set UpdatedAt(value: Date) {
        this.Set('UpdatedAt', value);
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
 * Organizations - strongly typed entity sub-class
 * * Schema: events
 * * Base Table: Organization
 * * Base View: vwOrganizations
 * * Primary Key: OrganizationID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Organizations')
export class OrganizationEntity extends BaseEntity<OrganizationEntityType> {
    /**
    * Loads the Organizations record from the database
    * @param OrganizationID: number - primary key value to load the Organizations record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof OrganizationEntity
    * @method
    * @override
    */
    public async Load(OrganizationID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'OrganizationID', Value: OrganizationID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: OrganizationID
    * * Display Name: Organization ID
    * * SQL Data Type: int
    */
    get OrganizationID(): number {
        return this.Get('OrganizationID');
    }

    /**
    * * Field Name: OrganizationName
    * * Display Name: Organization Name
    * * SQL Data Type: nvarchar(255)
    */
    get OrganizationName(): string {
        return this.Get('OrganizationName');
    }
    set OrganizationName(value: string) {
        this.Set('OrganizationName', value);
    }

    /**
    * * Field Name: Website
    * * Display Name: Website
    * * SQL Data Type: nvarchar(255)
    */
    get Website(): string | null {
        return this.Get('Website');
    }
    set Website(value: string | null) {
        this.Set('Website', value);
    }

    /**
    * * Field Name: Industry
    * * Display Name: Industry
    * * SQL Data Type: nvarchar(100)
    */
    get Industry(): string | null {
        return this.Get('Industry');
    }
    set Industry(value: string | null) {
        this.Set('Industry', value);
    }

    /**
    * * Field Name: Size
    * * Display Name: Size
    * * SQL Data Type: nvarchar(50)
    */
    get Size(): string | null {
        return this.Get('Size');
    }
    set Size(value: string | null) {
        this.Set('Size', value);
    }

    /**
    * * Field Name: Address
    * * Display Name: Address
    * * SQL Data Type: nvarchar(255)
    */
    get Address(): string | null {
        return this.Get('Address');
    }
    set Address(value: string | null) {
        this.Set('Address', value);
    }

    /**
    * * Field Name: City
    * * Display Name: City
    * * SQL Data Type: nvarchar(100)
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
    * * SQL Data Type: nvarchar(100)
    */
    get State(): string | null {
        return this.Get('State');
    }
    set State(value: string | null) {
        this.Set('State', value);
    }

    /**
    * * Field Name: ZipCode
    * * Display Name: Zip Code
    * * SQL Data Type: nvarchar(20)
    */
    get ZipCode(): string | null {
        return this.Get('ZipCode');
    }
    set ZipCode(value: string | null) {
        this.Set('ZipCode', value);
    }

    /**
    * * Field Name: Country
    * * Display Name: Country
    * * SQL Data Type: nvarchar(100)
    */
    get Country(): string | null {
        return this.Get('Country');
    }
    set Country(value: string | null) {
        this.Set('Country', value);
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
 * Person Links - strongly typed entity sub-class
 * * Schema: common
 * * Base Table: PersonLink
 * * Base View: vwPersonLinks
 * * @description PersonLink is used to connect data from across multiple schemas. These source schemas represent different source systems like membership, education, events, etc. The PersonLink table has entries for "matches" between records that represent people across the different source systems so that we have a structured way to unify this data in the CDP.
 * * Primary Key: PersonLinkID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Person Links')
export class PersonLinkEntity extends BaseEntity<PersonLinkEntityType> {
    /**
    * Loads the Person Links record from the database
    * @param PersonLinkID: number - primary key value to load the Person Links record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof PersonLinkEntity
    * @method
    * @override
    */
    public async Load(PersonLinkID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'PersonLinkID', Value: PersonLinkID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: PersonLinkID
    * * Display Name: Person Link ID
    * * SQL Data Type: int
    */
    get PersonLinkID(): number {
        return this.Get('PersonLinkID');
    }

    /**
    * * Field Name: MembershipMemberID
    * * Display Name: Membership Member ID
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Members (vwMembers.MemberID)
    */
    get MembershipMemberID(): number | null {
        return this.Get('MembershipMemberID');
    }
    set MembershipMemberID(value: number | null) {
        this.Set('MembershipMemberID', value);
    }

    /**
    * * Field Name: EventsAttendeeID
    * * Display Name: Events Attendee ID
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Attendees (vwAttendees.AttendeeID)
    */
    get EventsAttendeeID(): number | null {
        return this.Get('EventsAttendeeID');
    }
    set EventsAttendeeID(value: number | null) {
        this.Set('EventsAttendeeID', value);
    }

    /**
    * * Field Name: EducationStudentID
    * * Display Name: Education Student ID
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Students (vwStudents.StudentID)
    */
    get EducationStudentID(): number | null {
        return this.Get('EducationStudentID');
    }
    set EducationStudentID(value: number | null) {
        this.Set('EducationStudentID', value);
    }

    /**
    * * Field Name: CommunityAuthorID
    * * Display Name: Community Author ID
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Authors (vwAuthors.AuthorID)
    */
    get CommunityAuthorID(): number | null {
        return this.Get('CommunityAuthorID');
    }
    set CommunityAuthorID(value: number | null) {
        this.Set('CommunityAuthorID', value);
    }

    /**
    * * Field Name: CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetime
    * * Default Value: getdate()
    */
    get CreatedAt(): Date {
        return this.Get('CreatedAt');
    }
    set CreatedAt(value: Date) {
        this.Set('CreatedAt', value);
    }

    /**
    * * Field Name: UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetime
    * * Default Value: getdate()
    */
    get UpdatedAt(): Date {
        return this.Get('UpdatedAt');
    }
    set UpdatedAt(value: Date) {
        this.Set('UpdatedAt', value);
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
 * Post Seeds - strongly typed entity sub-class
 * * Schema: reference
 * * Base Table: PostSeed
 * * Base View: vwPostSeeds
 * * Primary Key: PostSeedID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Post Seeds')
export class PostSeedEntity extends BaseEntity<PostSeedEntityType> {
    /**
    * Loads the Post Seeds record from the database
    * @param PostSeedID: number - primary key value to load the Post Seeds record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof PostSeedEntity
    * @method
    * @override
    */
    public async Load(PostSeedID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'PostSeedID', Value: PostSeedID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: PostSeedID
    * * Display Name: Post Seed ID
    * * SQL Data Type: int
    */
    get PostSeedID(): number {
        return this.Get('PostSeedID');
    }

    /**
    * * Field Name: Content
    * * Display Name: Content
    * * SQL Data Type: nvarchar(MAX)
    */
    get Content(): string | null {
        return this.Get('Content');
    }
    set Content(value: string | null) {
        this.Set('Content', value);
    }

    /**
    * * Field Name: Type
    * * Display Name: Type
    * * SQL Data Type: nvarchar(50)
    */
    get Type(): string | null {
        return this.Get('Type');
    }
    set Type(value: string | null) {
        this.Set('Type', value);
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
 * Posts - strongly typed entity sub-class
 * * Schema: community
 * * Base Table: Post
 * * Base View: vwPosts
 * * Primary Key: PostID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Posts')
export class PostEntity extends BaseEntity<PostEntityType> {
    /**
    * Loads the Posts record from the database
    * @param PostID: number - primary key value to load the Posts record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof PostEntity
    * @method
    * @override
    */
    public async Load(PostID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'PostID', Value: PostID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: PostID
    * * Display Name: Post ID
    * * SQL Data Type: int
    */
    get PostID(): number {
        return this.Get('PostID');
    }

    /**
    * * Field Name: ForumID
    * * Display Name: Forum ID
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Forums (vwForums.ForumID)
    */
    get ForumID(): number {
        return this.Get('ForumID');
    }
    set ForumID(value: number) {
        this.Set('ForumID', value);
    }

    /**
    * * Field Name: AuthorID
    * * Display Name: Author ID
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Authors (vwAuthors.AuthorID)
    */
    get AuthorID(): number {
        return this.Get('AuthorID');
    }
    set AuthorID(value: number) {
        this.Set('AuthorID', value);
    }

    /**
    * * Field Name: PostContent
    * * Display Name: Post Content
    * * SQL Data Type: nvarchar(MAX)
    */
    get PostContent(): string | null {
        return this.Get('PostContent');
    }
    set PostContent(value: string | null) {
        this.Set('PostContent', value);
    }

    /**
    * * Field Name: PostDate
    * * Display Name: Post Date
    * * SQL Data Type: date
    */
    get PostDate(): Date {
        return this.Get('PostDate');
    }
    set PostDate(value: Date) {
        this.Set('PostDate', value);
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
 * * Schema: events
 * * Base Table: Registration
 * * Base View: vwRegistrations
 * * Primary Key: RegistrationID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Registrations')
export class RegistrationEntity extends BaseEntity<RegistrationEntityType> {
    /**
    * Loads the Registrations record from the database
    * @param RegistrationID: number - primary key value to load the Registrations record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof RegistrationEntity
    * @method
    * @override
    */
    public async Load(RegistrationID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'RegistrationID', Value: RegistrationID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: RegistrationID
    * * Display Name: Registration ID
    * * SQL Data Type: int
    */
    get RegistrationID(): number {
        return this.Get('RegistrationID');
    }

    /**
    * * Field Name: EventID
    * * Display Name: Event ID
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Events (vwEvents.EventID)
    */
    get EventID(): number {
        return this.Get('EventID');
    }
    set EventID(value: number) {
        this.Set('EventID', value);
    }

    /**
    * * Field Name: AttendeeID
    * * Display Name: Attendee ID
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Attendees (vwAttendees.AttendeeID)
    */
    get AttendeeID(): number {
        return this.Get('AttendeeID');
    }
    set AttendeeID(value: number) {
        this.Set('AttendeeID', value);
    }

    /**
    * * Field Name: RegistrationDate
    * * Display Name: Registration Date
    * * SQL Data Type: date
    */
    get RegistrationDate(): Date {
        return this.Get('RegistrationDate');
    }
    set RegistrationDate(value: Date) {
        this.Set('RegistrationDate', value);
    }

    /**
    * * Field Name: RegistrationFee
    * * Display Name: Registration Fee
    * * SQL Data Type: money
    */
    get RegistrationFee(): number | null {
        return this.Get('RegistrationFee');
    }
    set RegistrationFee(value: number | null) {
        this.Set('RegistrationFee', value);
    }

    /**
    * * Field Name: PaymentStatus
    * * Display Name: Payment Status
    * * SQL Data Type: nvarchar(255)
    * * Description: Paid, Unpaid, Refunded
    */
    get PaymentStatus(): string | null {
        return this.Get('PaymentStatus');
    }
    set PaymentStatus(value: string | null) {
        this.Set('PaymentStatus', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(255)
    * * Value List Type: List
    * * Possible Values 
    *   * Pending
    *   * Registered
    *   * Attended
    *   * Canceled
    * * Description: Registered, Pending, Canceled, Attended
    */
    get Status(): 'Pending' | 'Registered' | 'Attended' | 'Canceled' | null {
        return this.Get('Status');
    }
    set Status(value: 'Pending' | 'Registered' | 'Attended' | 'Canceled' | null) {
        this.Set('Status', value);
    }

    /**
    * * Field Name: RegistrationType
    * * Display Name: Registration Type
    * * SQL Data Type: nvarchar(20)
    * * Description: Attendee, Sponsor, Speaker
    */
    get RegistrationType(): string | null {
        return this.Get('RegistrationType');
    }
    set RegistrationType(value: string | null) {
        this.Set('RegistrationType', value);
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
 * Registrations__education - strongly typed entity sub-class
 * * Schema: education
 * * Base Table: Registration
 * * Base View: vwRegistrations__education
 * * Primary Key: RegistrationID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Registrations__education')
export class Registration__educationEntity extends BaseEntity<Registration__educationEntityType> {
    /**
    * Loads the Registrations__education record from the database
    * @param RegistrationID: number - primary key value to load the Registrations__education record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof Registration__educationEntity
    * @method
    * @override
    */
    public async Load(RegistrationID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'RegistrationID', Value: RegistrationID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: RegistrationID
    * * Display Name: Registration ID
    * * SQL Data Type: int
    */
    get RegistrationID(): number {
        return this.Get('RegistrationID');
    }

    /**
    * * Field Name: CourseID
    * * Display Name: Course ID
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Courses (vwCourses.CourseID)
    */
    get CourseID(): number {
        return this.Get('CourseID');
    }
    set CourseID(value: number) {
        this.Set('CourseID', value);
    }

    /**
    * * Field Name: StudentID
    * * Display Name: Student ID
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Students (vwStudents.StudentID)
    */
    get StudentID(): number {
        return this.Get('StudentID');
    }
    set StudentID(value: number) {
        this.Set('StudentID', value);
    }

    /**
    * * Field Name: RegistrationDate
    * * Display Name: Registration Date
    * * SQL Data Type: date
    */
    get RegistrationDate(): Date {
        return this.Get('RegistrationDate');
    }
    set RegistrationDate(value: Date) {
        this.Set('RegistrationDate', value);
    }

    /**
    * * Field Name: RegistrationFee
    * * Display Name: Registration Fee
    * * SQL Data Type: money
    */
    get RegistrationFee(): number | null {
        return this.Get('RegistrationFee');
    }
    set RegistrationFee(value: number | null) {
        this.Set('RegistrationFee', value);
    }

    /**
    * * Field Name: PaymentStatus
    * * Display Name: Payment Status
    * * SQL Data Type: nvarchar(255)
    * * Description: Paid, Unpaid, Refunded
    */
    get PaymentStatus(): string | null {
        return this.Get('PaymentStatus');
    }
    set PaymentStatus(value: string | null) {
        this.Set('PaymentStatus', value);
    }

    /**
    * * Field Name: CompletionStatus
    * * Display Name: Completion Status
    * * SQL Data Type: nvarchar(255)
    * * Description: Pending, In Progress, Failed, Completed
    */
    get CompletionStatus(): string | null {
        return this.Get('CompletionStatus');
    }
    set CompletionStatus(value: string | null) {
        this.Set('CompletionStatus', value);
    }

    /**
    * * Field Name: CertificationAwarded
    * * Display Name: Certification Awarded
    * * SQL Data Type: bit
    */
    get CertificationAwarded(): boolean | null {
        return this.Get('CertificationAwarded');
    }
    set CertificationAwarded(value: boolean | null) {
        this.Set('CertificationAwarded', value);
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
 * Replies - strongly typed entity sub-class
 * * Schema: community
 * * Base Table: Reply
 * * Base View: vwReplies
 * * Primary Key: ReplyID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Replies')
export class ReplyEntity extends BaseEntity<ReplyEntityType> {
    /**
    * Loads the Replies record from the database
    * @param ReplyID: number - primary key value to load the Replies record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ReplyEntity
    * @method
    * @override
    */
    public async Load(ReplyID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ReplyID', Value: ReplyID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ReplyID
    * * Display Name: Reply ID
    * * SQL Data Type: int
    */
    get ReplyID(): number {
        return this.Get('ReplyID');
    }

    /**
    * * Field Name: PostID
    * * Display Name: Post ID
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Posts (vwPosts.PostID)
    */
    get PostID(): number {
        return this.Get('PostID');
    }
    set PostID(value: number) {
        this.Set('PostID', value);
    }

    /**
    * * Field Name: AuthorID
    * * Display Name: Author ID
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Authors (vwAuthors.AuthorID)
    */
    get AuthorID(): number {
        return this.Get('AuthorID');
    }
    set AuthorID(value: number) {
        this.Set('AuthorID', value);
    }

    /**
    * * Field Name: ReplyContent
    * * Display Name: Reply Content
    * * SQL Data Type: nvarchar(MAX)
    */
    get ReplyContent(): string | null {
        return this.Get('ReplyContent');
    }
    set ReplyContent(value: string | null) {
        this.Set('ReplyContent', value);
    }

    /**
    * * Field Name: ReplyDate
    * * Display Name: Reply Date
    * * SQL Data Type: date
    */
    get ReplyDate(): Date {
        return this.Get('ReplyDate');
    }
    set ReplyDate(value: Date) {
        this.Set('ReplyDate', value);
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
 * Reply Seeds - strongly typed entity sub-class
 * * Schema: reference
 * * Base Table: ReplySeed
 * * Base View: vwReplySeeds
 * * Primary Key: ReplySeedID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Reply Seeds')
export class ReplySeedEntity extends BaseEntity<ReplySeedEntityType> {
    /**
    * Loads the Reply Seeds record from the database
    * @param ReplySeedID: number - primary key value to load the Reply Seeds record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ReplySeedEntity
    * @method
    * @override
    */
    public async Load(ReplySeedID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ReplySeedID', Value: ReplySeedID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ReplySeedID
    * * Display Name: Reply Seed ID
    * * SQL Data Type: int
    */
    get ReplySeedID(): number {
        return this.Get('ReplySeedID');
    }

    /**
    * * Field Name: Content
    * * Display Name: Content
    * * SQL Data Type: nvarchar(MAX)
    */
    get Content(): string | null {
        return this.Get('Content');
    }
    set Content(value: string | null) {
        this.Set('Content', value);
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
 * Students - strongly typed entity sub-class
 * * Schema: education
 * * Base Table: Student
 * * Base View: vwStudents
 * * Primary Key: StudentID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Students')
export class StudentEntity extends BaseEntity<StudentEntityType> {
    /**
    * Loads the Students record from the database
    * @param StudentID: number - primary key value to load the Students record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof StudentEntity
    * @method
    * @override
    */
    public async Load(StudentID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'StudentID', Value: StudentID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: StudentID
    * * Display Name: Student ID
    * * SQL Data Type: int
    */
    get StudentID(): number {
        return this.Get('StudentID');
    }

    /**
    * * Field Name: CompanyID
    * * Display Name: Company ID
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Companies__education (vwCompanies__education.CompanyID)
    */
    get CompanyID(): number | null {
        return this.Get('CompanyID');
    }
    set CompanyID(value: number | null) {
        this.Set('CompanyID', value);
    }

    /**
    * * Field Name: Email
    * * Display Name: Email
    * * SQL Data Type: nvarchar(255)
    */
    get Email(): string {
        return this.Get('Email');
    }
    set Email(value: string) {
        this.Set('Email', value);
    }

    /**
    * * Field Name: FirstName
    * * Display Name: First Name
    * * SQL Data Type: nvarchar(50)
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
    * * SQL Data Type: nvarchar(50)
    */
    get LastName(): string | null {
        return this.Get('LastName');
    }
    set LastName(value: string | null) {
        this.Set('LastName', value);
    }

    /**
    * * Field Name: JobTitle
    * * Display Name: Job Title
    * * SQL Data Type: nvarchar(100)
    */
    get JobTitle(): string | null {
        return this.Get('JobTitle');
    }
    set JobTitle(value: string | null) {
        this.Set('JobTitle', value);
    }

    /**
    * * Field Name: Address
    * * Display Name: Address
    * * SQL Data Type: nvarchar(255)
    */
    get Address(): string | null {
        return this.Get('Address');
    }
    set Address(value: string | null) {
        this.Set('Address', value);
    }

    /**
    * * Field Name: City
    * * Display Name: City
    * * SQL Data Type: nvarchar(100)
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
    * * SQL Data Type: nvarchar(100)
    */
    get State(): string | null {
        return this.Get('State');
    }
    set State(value: string | null) {
        this.Set('State', value);
    }

    /**
    * * Field Name: ZipCode
    * * Display Name: Zip Code
    * * SQL Data Type: nvarchar(20)
    */
    get ZipCode(): string | null {
        return this.Get('ZipCode');
    }
    set ZipCode(value: string | null) {
        this.Set('ZipCode', value);
    }

    /**
    * * Field Name: Country
    * * Display Name: Country
    * * SQL Data Type: nvarchar(100)
    */
    get Country(): string | null {
        return this.Get('Country');
    }
    set Country(value: string | null) {
        this.Set('Country', value);
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
