import { BaseEntity, EntitySaveOptions, EntityDeleteOptions, CompositeKey, ValidationResult, ValidationErrorInfo, ValidationErrorType, Metadata, ProviderType, DatabaseProviderBase } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { z } from "zod";

export const loadModule = () => {
  // no-op, only used to ensure this file is a valid module and to allow easy loading
}

     
 
/**
 * zod schema definition for the entity Accrediting Bodies
 */
export const AssociationDemoAccreditingBodySchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)`),
    Abbreviation: z.string().nullable().describe(`
        * * Field Name: Abbreviation
        * * Display Name: Abbreviation
        * * SQL Data Type: nvarchar(50)`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    Website: z.string().nullable().describe(`
        * * Field Name: Website
        * * Display Name: Website
        * * SQL Data Type: nvarchar(500)`),
    ContactEmail: z.string().nullable().describe(`
        * * Field Name: ContactEmail
        * * Display Name: Contact Email
        * * SQL Data Type: nvarchar(255)`),
    ContactPhone: z.string().nullable().describe(`
        * * Field Name: ContactPhone
        * * Display Name: Contact Phone
        * * SQL Data Type: nvarchar(50)`),
    IsActive: z.boolean().nullable().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1`),
    IsRecognized: z.boolean().nullable().describe(`
        * * Field Name: IsRecognized
        * * Display Name: Is Recognized
        * * SQL Data Type: bit
        * * Default Value: 1`),
    EstablishedDate: z.date().nullable().describe(`
        * * Field Name: EstablishedDate
        * * Display Name: Established Date
        * * SQL Data Type: date`),
    Country: z.string().nullable().describe(`
        * * Field Name: Country
        * * Display Name: Country
        * * SQL Data Type: nvarchar(100)`),
    CertificationCount: z.number().nullable().describe(`
        * * Field Name: CertificationCount
        * * Display Name: Certification Count
        * * SQL Data Type: int
        * * Default Value: 0`),
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

export type AssociationDemoAccreditingBodyEntityType = z.infer<typeof AssociationDemoAccreditingBodySchema>;

/**
 * zod schema definition for the entity Advocacy Actions
 */
export const AssociationDemoAdvocacyActionSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    LegislativeIssueID: z.string().describe(`
        * * Field Name: LegislativeIssueID
        * * Display Name: Legislative Issue ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Legislative Issues (vwLegislativeIssues.ID)`),
    MemberID: z.string().nullable().describe(`
        * * Field Name: MemberID
        * * Display Name: Member ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Members (vwMembers.ID)`),
    GovernmentContactID: z.string().nullable().describe(`
        * * Field Name: GovernmentContactID
        * * Display Name: Government Contact ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Government Contacts (vwGovernmentContacts.ID)`),
    ActionType: z.union([z.literal('Campaign Contribution'), z.literal('Email'), z.literal('Event Attendance'), z.literal('Letter'), z.literal('Meeting'), z.literal('Other'), z.literal('Petition Signature'), z.literal('Phone Call'), z.literal('Social Media'), z.literal('Testimony')]).describe(`
        * * Field Name: ActionType
        * * Display Name: Action Type
        * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Campaign Contribution
    *   * Email
    *   * Event Attendance
    *   * Letter
    *   * Meeting
    *   * Other
    *   * Petition Signature
    *   * Phone Call
    *   * Social Media
    *   * Testimony`),
    ActionDate: z.date().describe(`
        * * Field Name: ActionDate
        * * Display Name: Action Date
        * * SQL Data Type: date`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    Outcome: z.string().nullable().describe(`
        * * Field Name: Outcome
        * * Display Name: Outcome
        * * SQL Data Type: nvarchar(MAX)`),
    FollowUpRequired: z.boolean().nullable().describe(`
        * * Field Name: FollowUpRequired
        * * Display Name: Follow Up Required
        * * SQL Data Type: bit
        * * Default Value: 0`),
    FollowUpDate: z.date().nullable().describe(`
        * * Field Name: FollowUpDate
        * * Display Name: Follow Up Date
        * * SQL Data Type: date`),
    Notes: z.string().nullable().describe(`
        * * Field Name: Notes
        * * Display Name: Notes
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

export type AssociationDemoAdvocacyActionEntityType = z.infer<typeof AssociationDemoAdvocacyActionSchema>;

/**
 * zod schema definition for the entity Board Members
 */
export const AssociationDemoBoardMemberSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    BoardPositionID: z.string().describe(`
        * * Field Name: BoardPositionID
        * * Display Name: Board Position ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Board Positions (vwBoardPositions.ID)`),
    MemberID: z.string().describe(`
        * * Field Name: MemberID
        * * Display Name: Member ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Members (vwMembers.ID)`),
    StartDate: z.date().describe(`
        * * Field Name: StartDate
        * * Display Name: Start Date
        * * SQL Data Type: date`),
    EndDate: z.date().nullable().describe(`
        * * Field Name: EndDate
        * * Display Name: End Date
        * * SQL Data Type: date`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1`),
    ElectionDate: z.date().nullable().describe(`
        * * Field Name: ElectionDate
        * * Display Name: Election Date
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

export type AssociationDemoBoardMemberEntityType = z.infer<typeof AssociationDemoBoardMemberSchema>;

/**
 * zod schema definition for the entity Board Positions
 */
export const AssociationDemoBoardPositionSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    PositionTitle: z.string().describe(`
        * * Field Name: PositionTitle
        * * Display Name: Position Title
        * * SQL Data Type: nvarchar(100)`),
    PositionOrder: z.number().describe(`
        * * Field Name: PositionOrder
        * * Display Name: Position Order
        * * SQL Data Type: int`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    TermLengthYears: z.number().nullable().describe(`
        * * Field Name: TermLengthYears
        * * Display Name: Term Length Years
        * * SQL Data Type: int`),
    IsOfficer: z.boolean().describe(`
        * * Field Name: IsOfficer
        * * Display Name: Is Officer
        * * SQL Data Type: bit
        * * Default Value: 0`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1`),
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

export type AssociationDemoBoardPositionEntityType = z.infer<typeof AssociationDemoBoardPositionSchema>;

/**
 * zod schema definition for the entity Campaign Members
 */
export const AssociationDemoCampaignMemberSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    CampaignID: z.string().describe(`
        * * Field Name: CampaignID
        * * Display Name: Campaign ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Campaigns (vwCampaigns.ID)`),
    MemberID: z.string().describe(`
        * * Field Name: MemberID
        * * Display Name: Member ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Members (vwMembers.ID)`),
    SegmentID: z.string().nullable().describe(`
        * * Field Name: SegmentID
        * * Display Name: Segment ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Segments (vwSegments.ID)`),
    AddedDate: z.date().describe(`
        * * Field Name: AddedDate
        * * Display Name: Added Date
        * * SQL Data Type: datetime`),
    Status: z.union([z.literal('Converted'), z.literal('Opted Out'), z.literal('Responded'), z.literal('Sent'), z.literal('Targeted')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Converted
    *   * Opted Out
    *   * Responded
    *   * Sent
    *   * Targeted`),
    ResponseDate: z.date().nullable().describe(`
        * * Field Name: ResponseDate
        * * Display Name: Response Date
        * * SQL Data Type: datetime`),
    ConversionValue: z.number().nullable().describe(`
        * * Field Name: ConversionValue
        * * Display Name: Conversion Value
        * * SQL Data Type: decimal(12, 2)`),
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
    Campaign: z.string().describe(`
        * * Field Name: Campaign
        * * Display Name: Campaign
        * * SQL Data Type: nvarchar(255)`),
    Segment: z.string().nullable().describe(`
        * * Field Name: Segment
        * * Display Name: Segment
        * * SQL Data Type: nvarchar(255)`),
});

export type AssociationDemoCampaignMemberEntityType = z.infer<typeof AssociationDemoCampaignMemberSchema>;

/**
 * zod schema definition for the entity Campaigns
 */
export const AssociationDemoCampaignSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)`),
    CampaignType: z.union([z.literal('Course Launch'), z.literal('Donation Drive'), z.literal('Email'), z.literal('Event Promotion'), z.literal('Member Engagement'), z.literal('Membership Renewal')]).describe(`
        * * Field Name: CampaignType
        * * Display Name: Campaign Type
        * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Course Launch
    *   * Donation Drive
    *   * Email
    *   * Event Promotion
    *   * Member Engagement
    *   * Membership Renewal`),
    Status: z.union([z.literal('Active'), z.literal('Cancelled'), z.literal('Completed'), z.literal('Draft'), z.literal('Scheduled')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Cancelled
    *   * Completed
    *   * Draft
    *   * Scheduled`),
    StartDate: z.date().nullable().describe(`
        * * Field Name: StartDate
        * * Display Name: Start Date
        * * SQL Data Type: date`),
    EndDate: z.date().nullable().describe(`
        * * Field Name: EndDate
        * * Display Name: End Date
        * * SQL Data Type: date`),
    Budget: z.number().nullable().describe(`
        * * Field Name: Budget
        * * Display Name: Budget
        * * SQL Data Type: decimal(12, 2)`),
    ActualCost: z.number().nullable().describe(`
        * * Field Name: ActualCost
        * * Display Name: Actual Cost
        * * SQL Data Type: decimal(12, 2)`),
    TargetAudience: z.string().nullable().describe(`
        * * Field Name: TargetAudience
        * * Display Name: Target Audience
        * * SQL Data Type: nvarchar(MAX)`),
    Goals: z.string().nullable().describe(`
        * * Field Name: Goals
        * * Display Name: Goals
        * * SQL Data Type: nvarchar(MAX)`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
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

export type AssociationDemoCampaignEntityType = z.infer<typeof AssociationDemoCampaignSchema>;

/**
 * zod schema definition for the entity Certificates
 */
export const AssociationDemoCertificateSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    EnrollmentID: z.string().describe(`
        * * Field Name: EnrollmentID
        * * Display Name: Enrollment ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Enrollments (vwEnrollments.ID)`),
    CertificateNumber: z.string().describe(`
        * * Field Name: CertificateNumber
        * * Display Name: Certificate Number
        * * SQL Data Type: nvarchar(50)`),
    IssuedDate: z.date().describe(`
        * * Field Name: IssuedDate
        * * Display Name: Issued Date
        * * SQL Data Type: date`),
    ExpirationDate: z.date().nullable().describe(`
        * * Field Name: ExpirationDate
        * * Display Name: Expiration Date
        * * SQL Data Type: date`),
    CertificatePDFURL: z.string().nullable().describe(`
        * * Field Name: CertificatePDFURL
        * * Display Name: Certificate PDFURL
        * * SQL Data Type: nvarchar(500)`),
    VerificationCode: z.string().nullable().describe(`
        * * Field Name: VerificationCode
        * * Display Name: Verification Code
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

export type AssociationDemoCertificateEntityType = z.infer<typeof AssociationDemoCertificateSchema>;

/**
 * zod schema definition for the entity Certification Renewals
 */
export const AssociationDemoCertificationRenewalSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    CertificationID: z.string().describe(`
        * * Field Name: CertificationID
        * * Display Name: Certification ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Certifications (vwCertifications.ID)`),
    RenewalDate: z.date().describe(`
        * * Field Name: RenewalDate
        * * Display Name: Renewal Date
        * * SQL Data Type: date`),
    ExpirationDate: z.date().describe(`
        * * Field Name: ExpirationDate
        * * Display Name: Expiration Date
        * * SQL Data Type: date`),
    CECreditsApplied: z.number().nullable().describe(`
        * * Field Name: CECreditsApplied
        * * Display Name: CE Credits Applied
        * * SQL Data Type: int
        * * Default Value: 0`),
    FeePaid: z.number().nullable().describe(`
        * * Field Name: FeePaid
        * * Display Name: Fee Paid
        * * SQL Data Type: decimal(10, 2)`),
    PaymentDate: z.date().nullable().describe(`
        * * Field Name: PaymentDate
        * * Display Name: Payment Date
        * * SQL Data Type: date`),
    Status: z.union([z.literal('Completed'), z.literal('Late'), z.literal('Pending'), z.literal('Rejected')]).nullable().describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Completed
    * * Value List Type: List
    * * Possible Values 
    *   * Completed
    *   * Late
    *   * Pending
    *   * Rejected`),
    Notes: z.string().nullable().describe(`
        * * Field Name: Notes
        * * Display Name: Notes
        * * SQL Data Type: nvarchar(MAX)`),
    ProcessedBy: z.string().nullable().describe(`
        * * Field Name: ProcessedBy
        * * Display Name: Processed By
        * * SQL Data Type: nvarchar(255)`),
    ProcessedDate: z.date().nullable().describe(`
        * * Field Name: ProcessedDate
        * * Display Name: Processed Date
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

export type AssociationDemoCertificationRenewalEntityType = z.infer<typeof AssociationDemoCertificationRenewalSchema>;

/**
 * zod schema definition for the entity Certification Requirements
 */
export const AssociationDemoCertificationRequirementSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    CertificationTypeID: z.string().describe(`
        * * Field Name: CertificationTypeID
        * * Display Name: Certification Type ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Certification Types (vwCertificationTypes.ID)`),
    RequirementType: z.union([z.literal('Documentation'), z.literal('Education'), z.literal('Examination'), z.literal('Experience'), z.literal('Other'), z.literal('Prerequisites'), z.literal('Reference'), z.literal('Training')]).describe(`
        * * Field Name: RequirementType
        * * Display Name: Requirement Type
        * * SQL Data Type: nvarchar(100)
    * * Value List Type: List
    * * Possible Values 
    *   * Documentation
    *   * Education
    *   * Examination
    *   * Experience
    *   * Other
    *   * Prerequisites
    *   * Reference
    *   * Training`),
    Description: z.string().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    IsRequired: z.boolean().nullable().describe(`
        * * Field Name: IsRequired
        * * Display Name: Is Required
        * * SQL Data Type: bit
        * * Default Value: 1`),
    DisplayOrder: z.number().nullable().describe(`
        * * Field Name: DisplayOrder
        * * Display Name: Display Order
        * * SQL Data Type: int
        * * Default Value: 0`),
    Details: z.string().nullable().describe(`
        * * Field Name: Details
        * * Display Name: Details
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
    CertificationType: z.string().describe(`
        * * Field Name: CertificationType
        * * Display Name: Certification Type
        * * SQL Data Type: nvarchar(255)`),
});

export type AssociationDemoCertificationRequirementEntityType = z.infer<typeof AssociationDemoCertificationRequirementSchema>;

/**
 * zod schema definition for the entity Certification Types
 */
export const AssociationDemoCertificationTypeSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    AccreditingBodyID: z.string().describe(`
        * * Field Name: AccreditingBodyID
        * * Display Name: Accrediting Body ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Accrediting Bodies (vwAccreditingBodies.ID)`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)`),
    Abbreviation: z.string().nullable().describe(`
        * * Field Name: Abbreviation
        * * Display Name: Abbreviation
        * * SQL Data Type: nvarchar(50)`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    Level: z.union([z.literal('Advanced'), z.literal('Entry'), z.literal('Intermediate'), z.literal('Master'), z.literal('Specialty')]).nullable().describe(`
        * * Field Name: Level
        * * Display Name: Level
        * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Advanced
    *   * Entry
    *   * Intermediate
    *   * Master
    *   * Specialty`),
    DurationMonths: z.number().nullable().describe(`
        * * Field Name: DurationMonths
        * * Display Name: Duration Months
        * * SQL Data Type: int`),
    RenewalRequiredMonths: z.number().nullable().describe(`
        * * Field Name: RenewalRequiredMonths
        * * Display Name: Renewal Required Months
        * * SQL Data Type: int`),
    CECreditsRequired: z.number().nullable().describe(`
        * * Field Name: CECreditsRequired
        * * Display Name: CE Credits Required
        * * SQL Data Type: int
        * * Default Value: 0`),
    ExamRequired: z.boolean().nullable().describe(`
        * * Field Name: ExamRequired
        * * Display Name: Exam Required
        * * SQL Data Type: bit
        * * Default Value: 0`),
    PracticalRequired: z.boolean().nullable().describe(`
        * * Field Name: PracticalRequired
        * * Display Name: Practical Required
        * * SQL Data Type: bit
        * * Default Value: 0`),
    CostUSD: z.number().nullable().describe(`
        * * Field Name: CostUSD
        * * Display Name: Cost USD
        * * SQL Data Type: decimal(10, 2)`),
    IsActive: z.boolean().nullable().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1`),
    Prerequisites: z.string().nullable().describe(`
        * * Field Name: Prerequisites
        * * Display Name: Prerequisites
        * * SQL Data Type: nvarchar(MAX)`),
    TargetAudience: z.string().nullable().describe(`
        * * Field Name: TargetAudience
        * * Display Name: Target Audience
        * * SQL Data Type: nvarchar(500)`),
    CertificationCount: z.number().nullable().describe(`
        * * Field Name: CertificationCount
        * * Display Name: Certification Count
        * * SQL Data Type: int
        * * Default Value: 0`),
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
    AccreditingBody: z.string().describe(`
        * * Field Name: AccreditingBody
        * * Display Name: Accrediting Body
        * * SQL Data Type: nvarchar(255)`),
});

export type AssociationDemoCertificationTypeEntityType = z.infer<typeof AssociationDemoCertificationTypeSchema>;

/**
 * zod schema definition for the entity Certifications
 */
export const AssociationDemoCertificationSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    MemberID: z.string().describe(`
        * * Field Name: MemberID
        * * Display Name: Member ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Members (vwMembers.ID)`),
    CertificationTypeID: z.string().describe(`
        * * Field Name: CertificationTypeID
        * * Display Name: Certification Type ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Certification Types (vwCertificationTypes.ID)`),
    CertificationNumber: z.string().nullable().describe(`
        * * Field Name: CertificationNumber
        * * Display Name: Certification Number
        * * SQL Data Type: nvarchar(100)`),
    DateEarned: z.date().describe(`
        * * Field Name: DateEarned
        * * Display Name: Date Earned
        * * SQL Data Type: date`),
    DateExpires: z.date().nullable().describe(`
        * * Field Name: DateExpires
        * * Display Name: Date Expires
        * * SQL Data Type: date`),
    Status: z.union([z.literal('Active'), z.literal('Expired'), z.literal('In Progress'), z.literal('Pending Renewal'), z.literal('Revoked'), z.literal('Suspended')]).nullable().describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Expired
    *   * In Progress
    *   * Pending Renewal
    *   * Revoked
    *   * Suspended`),
    Score: z.number().nullable().describe(`
        * * Field Name: Score
        * * Display Name: Score
        * * SQL Data Type: int`),
    Notes: z.string().nullable().describe(`
        * * Field Name: Notes
        * * Display Name: Notes
        * * SQL Data Type: nvarchar(MAX)`),
    VerificationURL: z.string().nullable().describe(`
        * * Field Name: VerificationURL
        * * Display Name: Verification URL
        * * SQL Data Type: nvarchar(500)`),
    IssuedBy: z.string().nullable().describe(`
        * * Field Name: IssuedBy
        * * Display Name: Issued By
        * * SQL Data Type: nvarchar(255)`),
    LastRenewalDate: z.date().nullable().describe(`
        * * Field Name: LastRenewalDate
        * * Display Name: Last Renewal Date
        * * SQL Data Type: date`),
    NextRenewalDate: z.date().nullable().describe(`
        * * Field Name: NextRenewalDate
        * * Display Name: Next Renewal Date
        * * SQL Data Type: date`),
    CECreditsEarned: z.number().nullable().describe(`
        * * Field Name: CECreditsEarned
        * * Display Name: CE Credits Earned
        * * SQL Data Type: int
        * * Default Value: 0`),
    RenewalCount: z.number().nullable().describe(`
        * * Field Name: RenewalCount
        * * Display Name: Renewal Count
        * * SQL Data Type: int
        * * Default Value: 0`),
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
    CertificationType: z.string().describe(`
        * * Field Name: CertificationType
        * * Display Name: Certification Type
        * * SQL Data Type: nvarchar(255)`),
});

export type AssociationDemoCertificationEntityType = z.infer<typeof AssociationDemoCertificationSchema>;

/**
 * zod schema definition for the entity Chapter Memberships
 */
export const AssociationDemoChapterMembershipSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    ChapterID: z.string().describe(`
        * * Field Name: ChapterID
        * * Display Name: Chapter ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Chapters (vwChapters.ID)`),
    MemberID: z.string().describe(`
        * * Field Name: MemberID
        * * Display Name: Member ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Members (vwMembers.ID)`),
    JoinDate: z.date().describe(`
        * * Field Name: JoinDate
        * * Display Name: Join Date
        * * SQL Data Type: date`),
    Status: z.union([z.literal('Active'), z.literal('Inactive')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Inactive`),
    Role: z.string().nullable().describe(`
        * * Field Name: Role
        * * Display Name: Role
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
    Chapter: z.string().describe(`
        * * Field Name: Chapter
        * * Display Name: Chapter
        * * SQL Data Type: nvarchar(255)`),
});

export type AssociationDemoChapterMembershipEntityType = z.infer<typeof AssociationDemoChapterMembershipSchema>;

/**
 * zod schema definition for the entity Chapter Officers
 */
export const AssociationDemoChapterOfficerSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    ChapterID: z.string().describe(`
        * * Field Name: ChapterID
        * * Display Name: Chapter ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Chapters (vwChapters.ID)`),
    MemberID: z.string().describe(`
        * * Field Name: MemberID
        * * Display Name: Member ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Members (vwMembers.ID)`),
    Position: z.string().describe(`
        * * Field Name: Position
        * * Display Name: Position
        * * SQL Data Type: nvarchar(100)`),
    StartDate: z.date().describe(`
        * * Field Name: StartDate
        * * Display Name: Start Date
        * * SQL Data Type: date`),
    EndDate: z.date().nullable().describe(`
        * * Field Name: EndDate
        * * Display Name: End Date
        * * SQL Data Type: date`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1`),
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
    Chapter: z.string().describe(`
        * * Field Name: Chapter
        * * Display Name: Chapter
        * * SQL Data Type: nvarchar(255)`),
});

export type AssociationDemoChapterOfficerEntityType = z.infer<typeof AssociationDemoChapterOfficerSchema>;

/**
 * zod schema definition for the entity Chapters
 */
export const AssociationDemoChapterSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)`),
    ChapterType: z.union([z.literal('Geographic'), z.literal('Industry'), z.literal('Special Interest')]).describe(`
        * * Field Name: ChapterType
        * * Display Name: Chapter Type
        * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Geographic
    *   * Industry
    *   * Special Interest`),
    Region: z.string().nullable().describe(`
        * * Field Name: Region
        * * Display Name: Region
        * * SQL Data Type: nvarchar(100)`),
    City: z.string().nullable().describe(`
        * * Field Name: City
        * * Display Name: City
        * * SQL Data Type: nvarchar(100)`),
    State: z.string().nullable().describe(`
        * * Field Name: State
        * * Display Name: State
        * * SQL Data Type: nvarchar(50)`),
    Country: z.string().nullable().describe(`
        * * Field Name: Country
        * * Display Name: Country
        * * SQL Data Type: nvarchar(100)
        * * Default Value: United States`),
    FoundedDate: z.date().nullable().describe(`
        * * Field Name: FoundedDate
        * * Display Name: Founded Date
        * * SQL Data Type: date`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    Website: z.string().nullable().describe(`
        * * Field Name: Website
        * * Display Name: Website
        * * SQL Data Type: nvarchar(500)`),
    Email: z.string().nullable().describe(`
        * * Field Name: Email
        * * Display Name: Email
        * * SQL Data Type: nvarchar(255)`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1`),
    MeetingFrequency: z.string().nullable().describe(`
        * * Field Name: MeetingFrequency
        * * Display Name: Meeting Frequency
        * * SQL Data Type: nvarchar(100)`),
    MemberCount: z.number().nullable().describe(`
        * * Field Name: MemberCount
        * * Display Name: Member Count
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

export type AssociationDemoChapterEntityType = z.infer<typeof AssociationDemoChapterSchema>;

/**
 * zod schema definition for the entity Committee Memberships
 */
export const AssociationDemoCommitteeMembershipSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    CommitteeID: z.string().describe(`
        * * Field Name: CommitteeID
        * * Display Name: Committee ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Committees (vwCommittees.ID)`),
    MemberID: z.string().describe(`
        * * Field Name: MemberID
        * * Display Name: Member ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Members (vwMembers.ID)`),
    Role: z.string().describe(`
        * * Field Name: Role
        * * Display Name: Role
        * * SQL Data Type: nvarchar(100)`),
    StartDate: z.date().describe(`
        * * Field Name: StartDate
        * * Display Name: Start Date
        * * SQL Data Type: date`),
    EndDate: z.date().nullable().describe(`
        * * Field Name: EndDate
        * * Display Name: End Date
        * * SQL Data Type: date`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1`),
    AppointedBy: z.string().nullable().describe(`
        * * Field Name: AppointedBy
        * * Display Name: Appointed By
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
    Committee: z.string().describe(`
        * * Field Name: Committee
        * * Display Name: Committee
        * * SQL Data Type: nvarchar(255)`),
});

export type AssociationDemoCommitteeMembershipEntityType = z.infer<typeof AssociationDemoCommitteeMembershipSchema>;

/**
 * zod schema definition for the entity Committees
 */
export const AssociationDemoCommitteeSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)`),
    CommitteeType: z.union([z.literal('Ad Hoc'), z.literal('Standing'), z.literal('Task Force')]).describe(`
        * * Field Name: CommitteeType
        * * Display Name: Committee Type
        * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Ad Hoc
    *   * Standing
    *   * Task Force`),
    Purpose: z.string().nullable().describe(`
        * * Field Name: Purpose
        * * Display Name: Purpose
        * * SQL Data Type: nvarchar(MAX)`),
    MeetingFrequency: z.string().nullable().describe(`
        * * Field Name: MeetingFrequency
        * * Display Name: Meeting Frequency
        * * SQL Data Type: nvarchar(100)`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1`),
    FormedDate: z.date().nullable().describe(`
        * * Field Name: FormedDate
        * * Display Name: Formed Date
        * * SQL Data Type: date`),
    DisbandedDate: z.date().nullable().describe(`
        * * Field Name: DisbandedDate
        * * Display Name: Disbanded Date
        * * SQL Data Type: date`),
    ChairMemberID: z.string().nullable().describe(`
        * * Field Name: ChairMemberID
        * * Display Name: Chair Member ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Members (vwMembers.ID)`),
    MaxMembers: z.number().nullable().describe(`
        * * Field Name: MaxMembers
        * * Display Name: Max Members
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

export type AssociationDemoCommitteeEntityType = z.infer<typeof AssociationDemoCommitteeSchema>;

/**
 * zod schema definition for the entity Competition Entries
 */
export const AssociationDemoCompetitionEntrySchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    CompetitionID: z.string().describe(`
        * * Field Name: CompetitionID
        * * Display Name: Competition ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Competitions (vwCompetitions.ID)`),
    ProductID: z.string().describe(`
        * * Field Name: ProductID
        * * Display Name: Product ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Products (vwProducts.ID)`),
    CategoryID: z.string().describe(`
        * * Field Name: CategoryID
        * * Display Name: Category ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Product Categories (vwProductCategories.ID)`),
    EntryNumber: z.string().nullable().describe(`
        * * Field Name: EntryNumber
        * * Display Name: Entry Number
        * * SQL Data Type: nvarchar(50)`),
    SubmittedDate: z.date().describe(`
        * * Field Name: SubmittedDate
        * * Display Name: Submitted Date
        * * SQL Data Type: date`),
    Status: z.union([z.literal('Accepted'), z.literal('Disqualified'), z.literal('Finalist'), z.literal('Judged'), z.literal('Rejected'), z.literal('Submitted'), z.literal('Winner')]).nullable().describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Submitted
    * * Value List Type: List
    * * Possible Values 
    *   * Accepted
    *   * Disqualified
    *   * Finalist
    *   * Judged
    *   * Rejected
    *   * Submitted
    *   * Winner`),
    Score: z.number().nullable().describe(`
        * * Field Name: Score
        * * Display Name: Score
        * * SQL Data Type: decimal(5, 2)`),
    Ranking: z.number().nullable().describe(`
        * * Field Name: Ranking
        * * Display Name: Ranking
        * * SQL Data Type: int`),
    AwardLevel: z.union([z.literal('Best in Show'), z.literal('Bronze'), z.literal('Finalist'), z.literal('Gold'), z.literal('Honorable Mention'), z.literal('None'), z.literal('Silver')]).nullable().describe(`
        * * Field Name: AwardLevel
        * * Display Name: Award Level
        * * SQL Data Type: nvarchar(100)
    * * Value List Type: List
    * * Possible Values 
    *   * Best in Show
    *   * Bronze
    *   * Finalist
    *   * Gold
    *   * Honorable Mention
    *   * None
    *   * Silver`),
    JudgingNotes: z.string().nullable().describe(`
        * * Field Name: JudgingNotes
        * * Display Name: Judging Notes
        * * SQL Data Type: nvarchar(MAX)`),
    FeedbackProvided: z.boolean().nullable().describe(`
        * * Field Name: FeedbackProvided
        * * Display Name: Feedback Provided
        * * SQL Data Type: bit
        * * Default Value: 0`),
    EntryFee: z.number().nullable().describe(`
        * * Field Name: EntryFee
        * * Display Name: Entry Fee
        * * SQL Data Type: decimal(10, 2)`),
    PaymentStatus: z.union([z.literal('Paid'), z.literal('Refunded'), z.literal('Unpaid'), z.literal('Waived')]).nullable().describe(`
        * * Field Name: PaymentStatus
        * * Display Name: Payment Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Unpaid
    * * Value List Type: List
    * * Possible Values 
    *   * Paid
    *   * Refunded
    *   * Unpaid
    *   * Waived`),
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
    Competition: z.string().describe(`
        * * Field Name: Competition
        * * Display Name: Competition
        * * SQL Data Type: nvarchar(255)`),
    Product: z.string().describe(`
        * * Field Name: Product
        * * Display Name: Product
        * * SQL Data Type: nvarchar(255)`),
    Category: z.string().describe(`
        * * Field Name: Category
        * * Display Name: Category
        * * SQL Data Type: nvarchar(255)`),
});

export type AssociationDemoCompetitionEntryEntityType = z.infer<typeof AssociationDemoCompetitionEntrySchema>;

/**
 * zod schema definition for the entity Competition Judges
 */
export const AssociationDemoCompetitionJudgeSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    CompetitionID: z.string().describe(`
        * * Field Name: CompetitionID
        * * Display Name: Competition ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Competitions (vwCompetitions.ID)`),
    MemberID: z.string().nullable().describe(`
        * * Field Name: MemberID
        * * Display Name: Member ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Members (vwMembers.ID)`),
    FirstName: z.string().describe(`
        * * Field Name: FirstName
        * * Display Name: First Name
        * * SQL Data Type: nvarchar(100)`),
    LastName: z.string().describe(`
        * * Field Name: LastName
        * * Display Name: Last Name
        * * SQL Data Type: nvarchar(100)`),
    Email: z.string().nullable().describe(`
        * * Field Name: Email
        * * Display Name: Email
        * * SQL Data Type: nvarchar(255)`),
    Organization: z.string().nullable().describe(`
        * * Field Name: Organization
        * * Display Name: Organization
        * * SQL Data Type: nvarchar(255)`),
    Credentials: z.string().nullable().describe(`
        * * Field Name: Credentials
        * * Display Name: Credentials
        * * SQL Data Type: nvarchar(MAX)`),
    YearsExperience: z.number().nullable().describe(`
        * * Field Name: YearsExperience
        * * Display Name: Years Experience
        * * SQL Data Type: int`),
    Specialty: z.string().nullable().describe(`
        * * Field Name: Specialty
        * * Display Name: Specialty
        * * SQL Data Type: nvarchar(255)`),
    Role: z.union([z.literal('Assistant Judge'), z.literal('Head Judge'), z.literal('Sensory Judge'), z.literal('Technical Judge'), z.literal('Trainee')]).nullable().describe(`
        * * Field Name: Role
        * * Display Name: Role
        * * SQL Data Type: nvarchar(100)
    * * Value List Type: List
    * * Possible Values 
    *   * Assistant Judge
    *   * Head Judge
    *   * Sensory Judge
    *   * Technical Judge
    *   * Trainee`),
    AssignedCategories: z.string().nullable().describe(`
        * * Field Name: AssignedCategories
        * * Display Name: Assigned Categories
        * * SQL Data Type: nvarchar(MAX)`),
    Status: z.union([z.literal('Completed'), z.literal('Confirmed'), z.literal('Declined'), z.literal('Invited'), z.literal('Removed')]).nullable().describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Confirmed
    * * Value List Type: List
    * * Possible Values 
    *   * Completed
    *   * Confirmed
    *   * Declined
    *   * Invited
    *   * Removed`),
    InvitedDate: z.date().nullable().describe(`
        * * Field Name: InvitedDate
        * * Display Name: Invited Date
        * * SQL Data Type: date`),
    ConfirmedDate: z.date().nullable().describe(`
        * * Field Name: ConfirmedDate
        * * Display Name: Confirmed Date
        * * SQL Data Type: date`),
    CompensationAmount: z.number().nullable().describe(`
        * * Field Name: CompensationAmount
        * * Display Name: Compensation Amount
        * * SQL Data Type: decimal(10, 2)`),
    Notes: z.string().nullable().describe(`
        * * Field Name: Notes
        * * Display Name: Notes
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
    Competition: z.string().describe(`
        * * Field Name: Competition
        * * Display Name: Competition
        * * SQL Data Type: nvarchar(255)`),
});

export type AssociationDemoCompetitionJudgeEntityType = z.infer<typeof AssociationDemoCompetitionJudgeSchema>;

/**
 * zod schema definition for the entity Competitions
 */
export const AssociationDemoCompetitionSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)`),
    Year: z.number().describe(`
        * * Field Name: Year
        * * Display Name: Year
        * * SQL Data Type: int`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    StartDate: z.date().describe(`
        * * Field Name: StartDate
        * * Display Name: Start Date
        * * SQL Data Type: date`),
    EndDate: z.date().describe(`
        * * Field Name: EndDate
        * * Display Name: End Date
        * * SQL Data Type: date`),
    JudgingDate: z.date().nullable().describe(`
        * * Field Name: JudgingDate
        * * Display Name: Judging Date
        * * SQL Data Type: date`),
    AwardsDate: z.date().nullable().describe(`
        * * Field Name: AwardsDate
        * * Display Name: Awards Date
        * * SQL Data Type: date`),
    Location: z.string().nullable().describe(`
        * * Field Name: Location
        * * Display Name: Location
        * * SQL Data Type: nvarchar(255)`),
    EntryDeadline: z.date().nullable().describe(`
        * * Field Name: EntryDeadline
        * * Display Name: Entry Deadline
        * * SQL Data Type: date`),
    EntryFee: z.number().nullable().describe(`
        * * Field Name: EntryFee
        * * Display Name: Entry Fee
        * * SQL Data Type: decimal(10, 2)`),
    Status: z.union([z.literal('Cancelled'), z.literal('Completed'), z.literal('Entries Closed'), z.literal('Judging'), z.literal('Open for Entries'), z.literal('Upcoming')]).nullable().describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Upcoming
    * * Value List Type: List
    * * Possible Values 
    *   * Cancelled
    *   * Completed
    *   * Entries Closed
    *   * Judging
    *   * Open for Entries
    *   * Upcoming`),
    TotalEntries: z.number().nullable().describe(`
        * * Field Name: TotalEntries
        * * Display Name: Total Entries
        * * SQL Data Type: int
        * * Default Value: 0`),
    TotalCategories: z.number().nullable().describe(`
        * * Field Name: TotalCategories
        * * Display Name: Total Categories
        * * SQL Data Type: int
        * * Default Value: 0`),
    Website: z.string().nullable().describe(`
        * * Field Name: Website
        * * Display Name: Website
        * * SQL Data Type: nvarchar(500)`),
    ContactEmail: z.string().nullable().describe(`
        * * Field Name: ContactEmail
        * * Display Name: Contact Email
        * * SQL Data Type: nvarchar(255)`),
    IsAnnual: z.boolean().nullable().describe(`
        * * Field Name: IsAnnual
        * * Display Name: Is Annual
        * * SQL Data Type: bit
        * * Default Value: 1`),
    IsInternational: z.boolean().nullable().describe(`
        * * Field Name: IsInternational
        * * Display Name: Is International
        * * SQL Data Type: bit
        * * Default Value: 0`),
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

export type AssociationDemoCompetitionEntityType = z.infer<typeof AssociationDemoCompetitionSchema>;

/**
 * zod schema definition for the entity Continuing Educations
 */
export const AssociationDemoContinuingEducationSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    MemberID: z.string().describe(`
        * * Field Name: MemberID
        * * Display Name: Member ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Members (vwMembers.ID)`),
    CertificationID: z.string().nullable().describe(`
        * * Field Name: CertificationID
        * * Display Name: Certification ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Certifications (vwCertifications.ID)`),
    ActivityTitle: z.string().describe(`
        * * Field Name: ActivityTitle
        * * Display Name: Activity Title
        * * SQL Data Type: nvarchar(500)`),
    ActivityType: z.union([z.literal('Conference'), z.literal('Course'), z.literal('Other'), z.literal('Presentation'), z.literal('Publication'), z.literal('Self-Study'), z.literal('Teaching'), z.literal('Webinar'), z.literal('Workshop')]).describe(`
        * * Field Name: ActivityType
        * * Display Name: Activity Type
        * * SQL Data Type: nvarchar(100)
    * * Value List Type: List
    * * Possible Values 
    *   * Conference
    *   * Course
    *   * Other
    *   * Presentation
    *   * Publication
    *   * Self-Study
    *   * Teaching
    *   * Webinar
    *   * Workshop`),
    Provider: z.string().nullable().describe(`
        * * Field Name: Provider
        * * Display Name: Provider
        * * SQL Data Type: nvarchar(255)`),
    CompletionDate: z.date().describe(`
        * * Field Name: CompletionDate
        * * Display Name: Completion Date
        * * SQL Data Type: date`),
    CreditsEarned: z.number().describe(`
        * * Field Name: CreditsEarned
        * * Display Name: Credits Earned
        * * SQL Data Type: decimal(5, 2)`),
    CreditsType: z.union([z.literal('CE'), z.literal('CEU'), z.literal('CME'), z.literal('CPE'), z.literal('Other'), z.literal('PDH')]).nullable().describe(`
        * * Field Name: CreditsType
        * * Display Name: Credits Type
        * * SQL Data Type: nvarchar(50)
        * * Default Value: CE
    * * Value List Type: List
    * * Possible Values 
    *   * CE
    *   * CEU
    *   * CME
    *   * CPE
    *   * Other
    *   * PDH`),
    HoursSpent: z.number().nullable().describe(`
        * * Field Name: HoursSpent
        * * Display Name: Hours Spent
        * * SQL Data Type: decimal(5, 2)`),
    VerificationCode: z.string().nullable().describe(`
        * * Field Name: VerificationCode
        * * Display Name: Verification Code
        * * SQL Data Type: nvarchar(100)`),
    Status: z.union([z.literal('Approved'), z.literal('Expired'), z.literal('Pending'), z.literal('Rejected')]).nullable().describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Approved
    * * Value List Type: List
    * * Possible Values 
    *   * Approved
    *   * Expired
    *   * Pending
    *   * Rejected`),
    Notes: z.string().nullable().describe(`
        * * Field Name: Notes
        * * Display Name: Notes
        * * SQL Data Type: nvarchar(MAX)`),
    DocumentURL: z.string().nullable().describe(`
        * * Field Name: DocumentURL
        * * Display Name: Document URL
        * * SQL Data Type: nvarchar(500)`),
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

export type AssociationDemoContinuingEducationEntityType = z.infer<typeof AssociationDemoContinuingEducationSchema>;

/**
 * zod schema definition for the entity Courses
 */
export const AssociationDemoCourseSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Code: z.string().describe(`
        * * Field Name: Code
        * * Display Name: Code
        * * SQL Data Type: nvarchar(50)`),
    Title: z.string().describe(`
        * * Field Name: Title
        * * Display Name: Title
        * * SQL Data Type: nvarchar(255)`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    Category: z.string().nullable().describe(`
        * * Field Name: Category
        * * Display Name: Category
        * * SQL Data Type: nvarchar(100)`),
    Level: z.union([z.literal('Advanced'), z.literal('Beginner'), z.literal('Expert'), z.literal('Intermediate')]).describe(`
        * * Field Name: Level
        * * Display Name: Level
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Advanced
    *   * Beginner
    *   * Expert
    *   * Intermediate`),
    DurationHours: z.number().nullable().describe(`
        * * Field Name: DurationHours
        * * Display Name: Duration Hours
        * * SQL Data Type: decimal(5, 2)`),
    CEUCredits: z.number().nullable().describe(`
        * * Field Name: CEUCredits
        * * Display Name: CEU Credits
        * * SQL Data Type: decimal(4, 2)`),
    Price: z.number().nullable().describe(`
        * * Field Name: Price
        * * Display Name: Price
        * * SQL Data Type: decimal(10, 2)`),
    MemberPrice: z.number().nullable().describe(`
        * * Field Name: MemberPrice
        * * Display Name: Member Price
        * * SQL Data Type: decimal(10, 2)`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1`),
    PublishedDate: z.date().nullable().describe(`
        * * Field Name: PublishedDate
        * * Display Name: Published Date
        * * SQL Data Type: date`),
    InstructorName: z.string().nullable().describe(`
        * * Field Name: InstructorName
        * * Display Name: Instructor Name
        * * SQL Data Type: nvarchar(255)`),
    PrerequisiteCourseID: z.string().nullable().describe(`
        * * Field Name: PrerequisiteCourseID
        * * Display Name: Prerequisite Course ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Courses (vwCourses.ID)`),
    ThumbnailURL: z.string().nullable().describe(`
        * * Field Name: ThumbnailURL
        * * Display Name: Thumbnail URL
        * * SQL Data Type: nvarchar(500)`),
    LearningObjectives: z.string().nullable().describe(`
        * * Field Name: LearningObjectives
        * * Display Name: Learning Objectives
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
    RootPrerequisiteCourseID: z.string().nullable().describe(`
        * * Field Name: RootPrerequisiteCourseID
        * * Display Name: Root Prerequisite Course ID
        * * SQL Data Type: uniqueidentifier`),
});

export type AssociationDemoCourseEntityType = z.infer<typeof AssociationDemoCourseSchema>;

/**
 * zod schema definition for the entity Email Clicks
 */
export const AssociationDemoEmailClickSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    EmailSendID: z.string().describe(`
        * * Field Name: EmailSendID
        * * Display Name: Email Send ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Email Sends (vwEmailSends.ID)`),
    ClickDate: z.date().describe(`
        * * Field Name: ClickDate
        * * Display Name: Click Date
        * * SQL Data Type: datetime`),
    URL: z.string().describe(`
        * * Field Name: URL
        * * Display Name: URL
        * * SQL Data Type: nvarchar(2000)`),
    LinkName: z.string().nullable().describe(`
        * * Field Name: LinkName
        * * Display Name: Link Name
        * * SQL Data Type: nvarchar(255)`),
    IPAddress: z.string().nullable().describe(`
        * * Field Name: IPAddress
        * * Display Name: IP Address
        * * SQL Data Type: nvarchar(50)`),
    UserAgent: z.string().nullable().describe(`
        * * Field Name: UserAgent
        * * Display Name: User Agent
        * * SQL Data Type: nvarchar(500)`),
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

export type AssociationDemoEmailClickEntityType = z.infer<typeof AssociationDemoEmailClickSchema>;

/**
 * zod schema definition for the entity Email Sends
 */
export const AssociationDemoEmailSendSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    TemplateID: z.string().nullable().describe(`
        * * Field Name: TemplateID
        * * Display Name: Template ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Email Templates (vwEmailTemplates.ID)`),
    CampaignID: z.string().nullable().describe(`
        * * Field Name: CampaignID
        * * Display Name: Campaign ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Campaigns (vwCampaigns.ID)`),
    MemberID: z.string().describe(`
        * * Field Name: MemberID
        * * Display Name: Member ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Members (vwMembers.ID)`),
    Subject: z.string().nullable().describe(`
        * * Field Name: Subject
        * * Display Name: Subject
        * * SQL Data Type: nvarchar(500)`),
    SentDate: z.date().describe(`
        * * Field Name: SentDate
        * * Display Name: Sent Date
        * * SQL Data Type: datetime`),
    DeliveredDate: z.date().nullable().describe(`
        * * Field Name: DeliveredDate
        * * Display Name: Delivered Date
        * * SQL Data Type: datetime`),
    OpenedDate: z.date().nullable().describe(`
        * * Field Name: OpenedDate
        * * Display Name: Opened Date
        * * SQL Data Type: datetime`),
    OpenCount: z.number().nullable().describe(`
        * * Field Name: OpenCount
        * * Display Name: Open Count
        * * SQL Data Type: int
        * * Default Value: 0`),
    ClickedDate: z.date().nullable().describe(`
        * * Field Name: ClickedDate
        * * Display Name: Clicked Date
        * * SQL Data Type: datetime`),
    ClickCount: z.number().nullable().describe(`
        * * Field Name: ClickCount
        * * Display Name: Click Count
        * * SQL Data Type: int
        * * Default Value: 0`),
    BouncedDate: z.date().nullable().describe(`
        * * Field Name: BouncedDate
        * * Display Name: Bounced Date
        * * SQL Data Type: datetime`),
    BounceType: z.string().nullable().describe(`
        * * Field Name: BounceType
        * * Display Name: Bounce Type
        * * SQL Data Type: nvarchar(20)`),
    BounceReason: z.string().nullable().describe(`
        * * Field Name: BounceReason
        * * Display Name: Bounce Reason
        * * SQL Data Type: nvarchar(MAX)`),
    UnsubscribedDate: z.date().nullable().describe(`
        * * Field Name: UnsubscribedDate
        * * Display Name: Unsubscribed Date
        * * SQL Data Type: datetime`),
    SpamReportedDate: z.date().nullable().describe(`
        * * Field Name: SpamReportedDate
        * * Display Name: Spam Reported Date
        * * SQL Data Type: datetime`),
    Status: z.union([z.literal('Bounced'), z.literal('Clicked'), z.literal('Delivered'), z.literal('Failed'), z.literal('Opened'), z.literal('Queued'), z.literal('Sent'), z.literal('Spam'), z.literal('Unsubscribed')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Bounced
    *   * Clicked
    *   * Delivered
    *   * Failed
    *   * Opened
    *   * Queued
    *   * Sent
    *   * Spam
    *   * Unsubscribed`),
    ExternalMessageID: z.string().nullable().describe(`
        * * Field Name: ExternalMessageID
        * * Display Name: External Message ID
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
    Template: z.string().nullable().describe(`
        * * Field Name: Template
        * * Display Name: Template
        * * SQL Data Type: nvarchar(255)`),
    Campaign: z.string().nullable().describe(`
        * * Field Name: Campaign
        * * Display Name: Campaign
        * * SQL Data Type: nvarchar(255)`),
});

export type AssociationDemoEmailSendEntityType = z.infer<typeof AssociationDemoEmailSendSchema>;

/**
 * zod schema definition for the entity Email Templates
 */
export const AssociationDemoEmailTemplateSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)`),
    Subject: z.string().nullable().describe(`
        * * Field Name: Subject
        * * Display Name: Subject
        * * SQL Data Type: nvarchar(500)`),
    FromName: z.string().nullable().describe(`
        * * Field Name: FromName
        * * Display Name: From Name
        * * SQL Data Type: nvarchar(255)`),
    FromEmail: z.string().nullable().describe(`
        * * Field Name: FromEmail
        * * Display Name: From Email
        * * SQL Data Type: nvarchar(255)`),
    ReplyToEmail: z.string().nullable().describe(`
        * * Field Name: ReplyToEmail
        * * Display Name: Reply To Email
        * * SQL Data Type: nvarchar(255)`),
    HtmlBody: z.string().nullable().describe(`
        * * Field Name: HtmlBody
        * * Display Name: Html Body
        * * SQL Data Type: nvarchar(MAX)`),
    TextBody: z.string().nullable().describe(`
        * * Field Name: TextBody
        * * Display Name: Text Body
        * * SQL Data Type: nvarchar(MAX)`),
    Category: z.string().nullable().describe(`
        * * Field Name: Category
        * * Display Name: Category
        * * SQL Data Type: nvarchar(100)`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1`),
    PreviewText: z.string().nullable().describe(`
        * * Field Name: PreviewText
        * * Display Name: Preview Text
        * * SQL Data Type: nvarchar(255)`),
    Tags: z.string().nullable().describe(`
        * * Field Name: Tags
        * * Display Name: Tags
        * * SQL Data Type: nvarchar(500)`),
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

export type AssociationDemoEmailTemplateEntityType = z.infer<typeof AssociationDemoEmailTemplateSchema>;

/**
 * zod schema definition for the entity Enrollments
 */
export const AssociationDemoEnrollmentSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    CourseID: z.string().describe(`
        * * Field Name: CourseID
        * * Display Name: Course ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Courses (vwCourses.ID)`),
    MemberID: z.string().describe(`
        * * Field Name: MemberID
        * * Display Name: Member ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Members (vwMembers.ID)`),
    EnrollmentDate: z.date().describe(`
        * * Field Name: EnrollmentDate
        * * Display Name: Enrollment Date
        * * SQL Data Type: datetime`),
    StartDate: z.date().nullable().describe(`
        * * Field Name: StartDate
        * * Display Name: Start Date
        * * SQL Data Type: datetime`),
    CompletionDate: z.date().nullable().describe(`
        * * Field Name: CompletionDate
        * * Display Name: Completion Date
        * * SQL Data Type: datetime`),
    ExpirationDate: z.date().nullable().describe(`
        * * Field Name: ExpirationDate
        * * Display Name: Expiration Date
        * * SQL Data Type: datetime`),
    Status: z.union([z.literal('Completed'), z.literal('Enrolled'), z.literal('Expired'), z.literal('Failed'), z.literal('In Progress'), z.literal('Withdrawn')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Completed
    *   * Enrolled
    *   * Expired
    *   * Failed
    *   * In Progress
    *   * Withdrawn`),
    ProgressPercentage: z.number().nullable().describe(`
        * * Field Name: ProgressPercentage
        * * Display Name: Progress Percentage
        * * SQL Data Type: int
        * * Default Value: 0`),
    LastAccessedDate: z.date().nullable().describe(`
        * * Field Name: LastAccessedDate
        * * Display Name: Last Accessed Date
        * * SQL Data Type: datetime`),
    TimeSpentMinutes: z.number().nullable().describe(`
        * * Field Name: TimeSpentMinutes
        * * Display Name: Time Spent Minutes
        * * SQL Data Type: int
        * * Default Value: 0`),
    FinalScore: z.number().nullable().describe(`
        * * Field Name: FinalScore
        * * Display Name: Final Score
        * * SQL Data Type: decimal(5, 2)`),
    PassingScore: z.number().nullable().describe(`
        * * Field Name: PassingScore
        * * Display Name: Passing Score
        * * SQL Data Type: decimal(5, 2)
        * * Default Value: 70.00`),
    Passed: z.boolean().nullable().describe(`
        * * Field Name: Passed
        * * Display Name: Passed
        * * SQL Data Type: bit`),
    InvoiceID: z.string().nullable().describe(`
        * * Field Name: InvoiceID
        * * Display Name: Invoice ID
        * * SQL Data Type: uniqueidentifier`),
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

export type AssociationDemoEnrollmentEntityType = z.infer<typeof AssociationDemoEnrollmentSchema>;

/**
 * zod schema definition for the entity Event Registrations
 */
export const AssociationDemoEventRegistrationSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    EventID: z.string().describe(`
        * * Field Name: EventID
        * * Display Name: Event ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Events (vwEvents.ID)`),
    MemberID: z.string().describe(`
        * * Field Name: MemberID
        * * Display Name: Member ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Members (vwMembers.ID)`),
    RegistrationDate: z.date().describe(`
        * * Field Name: RegistrationDate
        * * Display Name: Registration Date
        * * SQL Data Type: datetime`),
    RegistrationType: z.string().nullable().describe(`
        * * Field Name: RegistrationType
        * * Display Name: Registration Type
        * * SQL Data Type: nvarchar(50)`),
    Status: z.union([z.literal('Attended'), z.literal('Cancelled'), z.literal('No Show'), z.literal('Registered'), z.literal('Waitlisted')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Attended
    *   * Cancelled
    *   * No Show
    *   * Registered
    *   * Waitlisted`),
    CheckInTime: z.date().nullable().describe(`
        * * Field Name: CheckInTime
        * * Display Name: Check In Time
        * * SQL Data Type: datetime`),
    InvoiceID: z.string().nullable().describe(`
        * * Field Name: InvoiceID
        * * Display Name: Invoice ID
        * * SQL Data Type: uniqueidentifier`),
    CEUAwarded: z.boolean().describe(`
        * * Field Name: CEUAwarded
        * * Display Name: CEU Awarded
        * * SQL Data Type: bit
        * * Default Value: 0`),
    CEUAwardedDate: z.date().nullable().describe(`
        * * Field Name: CEUAwardedDate
        * * Display Name: CEU Awarded Date
        * * SQL Data Type: datetime`),
    CancellationDate: z.date().nullable().describe(`
        * * Field Name: CancellationDate
        * * Display Name: Cancellation Date
        * * SQL Data Type: datetime`),
    CancellationReason: z.string().nullable().describe(`
        * * Field Name: CancellationReason
        * * Display Name: Cancellation Reason
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
    Event: z.string().describe(`
        * * Field Name: Event
        * * Display Name: Event
        * * SQL Data Type: nvarchar(255)`),
});

export type AssociationDemoEventRegistrationEntityType = z.infer<typeof AssociationDemoEventRegistrationSchema>;

/**
 * zod schema definition for the entity Event Sessions
 */
export const AssociationDemoEventSessionSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    EventID: z.string().describe(`
        * * Field Name: EventID
        * * Display Name: Event ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Events (vwEvents.ID)`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    StartTime: z.date().describe(`
        * * Field Name: StartTime
        * * Display Name: Start Time
        * * SQL Data Type: datetime`),
    EndTime: z.date().describe(`
        * * Field Name: EndTime
        * * Display Name: End Time
        * * SQL Data Type: datetime`),
    Room: z.string().nullable().describe(`
        * * Field Name: Room
        * * Display Name: Room
        * * SQL Data Type: nvarchar(100)`),
    SpeakerName: z.string().nullable().describe(`
        * * Field Name: SpeakerName
        * * Display Name: Speaker Name
        * * SQL Data Type: nvarchar(255)`),
    SessionType: z.string().nullable().describe(`
        * * Field Name: SessionType
        * * Display Name: Session Type
        * * SQL Data Type: nvarchar(50)`),
    Capacity: z.number().nullable().describe(`
        * * Field Name: Capacity
        * * Display Name: Capacity
        * * SQL Data Type: int`),
    CEUCredits: z.number().nullable().describe(`
        * * Field Name: CEUCredits
        * * Display Name: CEU Credits
        * * SQL Data Type: decimal(4, 2)`),
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
    Event: z.string().describe(`
        * * Field Name: Event
        * * Display Name: Event
        * * SQL Data Type: nvarchar(255)`),
});

export type AssociationDemoEventSessionEntityType = z.infer<typeof AssociationDemoEventSessionSchema>;

/**
 * zod schema definition for the entity Events
 */
export const AssociationDemoEventSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)`),
    EventType: z.union([z.literal('Chapter Meeting'), z.literal('Conference'), z.literal('Networking'), z.literal('Virtual Summit'), z.literal('Webinar'), z.literal('Workshop')]).describe(`
        * * Field Name: EventType
        * * Display Name: Event Type
        * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Chapter Meeting
    *   * Conference
    *   * Networking
    *   * Virtual Summit
    *   * Webinar
    *   * Workshop`),
    StartDate: z.date().describe(`
        * * Field Name: StartDate
        * * Display Name: Start Date
        * * SQL Data Type: datetime`),
    EndDate: z.date().describe(`
        * * Field Name: EndDate
        * * Display Name: End Date
        * * SQL Data Type: datetime`),
    Timezone: z.string().nullable().describe(`
        * * Field Name: Timezone
        * * Display Name: Timezone
        * * SQL Data Type: nvarchar(50)`),
    Location: z.string().nullable().describe(`
        * * Field Name: Location
        * * Display Name: Location
        * * SQL Data Type: nvarchar(255)`),
    IsVirtual: z.boolean().describe(`
        * * Field Name: IsVirtual
        * * Display Name: Is Virtual
        * * SQL Data Type: bit
        * * Default Value: 0`),
    VirtualPlatform: z.string().nullable().describe(`
        * * Field Name: VirtualPlatform
        * * Display Name: Virtual Platform
        * * SQL Data Type: nvarchar(100)`),
    MeetingURL: z.string().nullable().describe(`
        * * Field Name: MeetingURL
        * * Display Name: Meeting URL
        * * SQL Data Type: nvarchar(500)`),
    ChapterID: z.string().nullable().describe(`
        * * Field Name: ChapterID
        * * Display Name: Chapter ID
        * * SQL Data Type: uniqueidentifier`),
    Capacity: z.number().nullable().describe(`
        * * Field Name: Capacity
        * * Display Name: Capacity
        * * SQL Data Type: int`),
    RegistrationOpenDate: z.date().nullable().describe(`
        * * Field Name: RegistrationOpenDate
        * * Display Name: Registration Open Date
        * * SQL Data Type: datetime`),
    RegistrationCloseDate: z.date().nullable().describe(`
        * * Field Name: RegistrationCloseDate
        * * Display Name: Registration Close Date
        * * SQL Data Type: datetime`),
    RegistrationFee: z.number().nullable().describe(`
        * * Field Name: RegistrationFee
        * * Display Name: Registration Fee
        * * SQL Data Type: decimal(10, 2)`),
    MemberPrice: z.number().nullable().describe(`
        * * Field Name: MemberPrice
        * * Display Name: Member Price
        * * SQL Data Type: decimal(10, 2)`),
    NonMemberPrice: z.number().nullable().describe(`
        * * Field Name: NonMemberPrice
        * * Display Name: Non Member Price
        * * SQL Data Type: decimal(10, 2)`),
    CEUCredits: z.number().nullable().describe(`
        * * Field Name: CEUCredits
        * * Display Name: CEU Credits
        * * SQL Data Type: decimal(4, 2)`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    Status: z.union([z.literal('Cancelled'), z.literal('Completed'), z.literal('Draft'), z.literal('In Progress'), z.literal('Published'), z.literal('Registration Open'), z.literal('Sold Out')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Cancelled
    *   * Completed
    *   * Draft
    *   * In Progress
    *   * Published
    *   * Registration Open
    *   * Sold Out`),
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

export type AssociationDemoEventEntityType = z.infer<typeof AssociationDemoEventSchema>;

/**
 * zod schema definition for the entity Forum Categories
 */
export const AssociationDemoForumCategorySchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    ParentCategoryID: z.string().nullable().describe(`
        * * Field Name: ParentCategoryID
        * * Display Name: Parent Category ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Forum Categories (vwForumCategories.ID)`),
    DisplayOrder: z.number().nullable().describe(`
        * * Field Name: DisplayOrder
        * * Display Name: Display Order
        * * SQL Data Type: int
        * * Default Value: 0`),
    Icon: z.string().nullable().describe(`
        * * Field Name: Icon
        * * Display Name: Icon
        * * SQL Data Type: nvarchar(100)`),
    Color: z.string().nullable().describe(`
        * * Field Name: Color
        * * Display Name: Color
        * * SQL Data Type: nvarchar(50)`),
    IsActive: z.boolean().nullable().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1`),
    RequiresMembership: z.boolean().nullable().describe(`
        * * Field Name: RequiresMembership
        * * Display Name: Requires Membership
        * * SQL Data Type: bit
        * * Default Value: 0`),
    ThreadCount: z.number().nullable().describe(`
        * * Field Name: ThreadCount
        * * Display Name: Thread Count
        * * SQL Data Type: int
        * * Default Value: 0`),
    PostCount: z.number().nullable().describe(`
        * * Field Name: PostCount
        * * Display Name: Post Count
        * * SQL Data Type: int
        * * Default Value: 0`),
    LastPostDate: z.date().nullable().describe(`
        * * Field Name: LastPostDate
        * * Display Name: Last Post Date
        * * SQL Data Type: datetime`),
    LastPostAuthorID: z.string().nullable().describe(`
        * * Field Name: LastPostAuthorID
        * * Display Name: Last Post Author ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Members (vwMembers.ID)`),
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
    ParentCategory: z.string().nullable().describe(`
        * * Field Name: ParentCategory
        * * Display Name: Parent Category
        * * SQL Data Type: nvarchar(255)`),
    RootParentCategoryID: z.string().nullable().describe(`
        * * Field Name: RootParentCategoryID
        * * Display Name: Root Parent Category ID
        * * SQL Data Type: uniqueidentifier`),
});

export type AssociationDemoForumCategoryEntityType = z.infer<typeof AssociationDemoForumCategorySchema>;

/**
 * zod schema definition for the entity Forum Moderations
 */
export const AssociationDemoForumModerationSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    PostID: z.string().describe(`
        * * Field Name: PostID
        * * Display Name: Post ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Forum Posts (vwForumPosts.ID)`),
    ReportedByID: z.string().describe(`
        * * Field Name: ReportedByID
        * * Display Name: Reported By ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Members (vwMembers.ID)`),
    ReportedDate: z.date().describe(`
        * * Field Name: ReportedDate
        * * Display Name: Reported Date
        * * SQL Data Type: datetime
        * * Default Value: getdate()`),
    ReportReason: z.string().nullable().describe(`
        * * Field Name: ReportReason
        * * Display Name: Report Reason
        * * SQL Data Type: nvarchar(500)`),
    ModerationStatus: z.union([z.literal('Approved'), z.literal('Dismissed'), z.literal('Pending'), z.literal('Removed'), z.literal('Reviewing')]).nullable().describe(`
        * * Field Name: ModerationStatus
        * * Display Name: Moderation Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Approved
    *   * Dismissed
    *   * Pending
    *   * Removed
    *   * Reviewing`),
    ModeratedByID: z.string().nullable().describe(`
        * * Field Name: ModeratedByID
        * * Display Name: Moderated By ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Members (vwMembers.ID)`),
    ModeratedDate: z.date().nullable().describe(`
        * * Field Name: ModeratedDate
        * * Display Name: Moderated Date
        * * SQL Data Type: datetime`),
    ModeratorNotes: z.string().nullable().describe(`
        * * Field Name: ModeratorNotes
        * * Display Name: Moderator Notes
        * * SQL Data Type: nvarchar(MAX)`),
    Action: z.string().nullable().describe(`
        * * Field Name: Action
        * * Display Name: Action
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

export type AssociationDemoForumModerationEntityType = z.infer<typeof AssociationDemoForumModerationSchema>;

/**
 * zod schema definition for the entity Forum Posts
 */
export const AssociationDemoForumPostSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    ThreadID: z.string().describe(`
        * * Field Name: ThreadID
        * * Display Name: Thread ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Forum Threads (vwForumThreads.ID)`),
    ParentPostID: z.string().nullable().describe(`
        * * Field Name: ParentPostID
        * * Display Name: Parent Post ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Forum Posts (vwForumPosts.ID)`),
    AuthorID: z.string().describe(`
        * * Field Name: AuthorID
        * * Display Name: Author ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Members (vwMembers.ID)`),
    Content: z.string().describe(`
        * * Field Name: Content
        * * Display Name: Content
        * * SQL Data Type: nvarchar(MAX)`),
    PostedDate: z.date().describe(`
        * * Field Name: PostedDate
        * * Display Name: Posted Date
        * * SQL Data Type: datetime
        * * Default Value: getdate()`),
    EditedDate: z.date().nullable().describe(`
        * * Field Name: EditedDate
        * * Display Name: Edited Date
        * * SQL Data Type: datetime`),
    EditedByID: z.string().nullable().describe(`
        * * Field Name: EditedByID
        * * Display Name: Edited By ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Members (vwMembers.ID)`),
    LikeCount: z.number().nullable().describe(`
        * * Field Name: LikeCount
        * * Display Name: Like Count
        * * SQL Data Type: int
        * * Default Value: 0`),
    HelpfulCount: z.number().nullable().describe(`
        * * Field Name: HelpfulCount
        * * Display Name: Helpful Count
        * * SQL Data Type: int
        * * Default Value: 0`),
    IsAcceptedAnswer: z.boolean().nullable().describe(`
        * * Field Name: IsAcceptedAnswer
        * * Display Name: Is Accepted Answer
        * * SQL Data Type: bit
        * * Default Value: 0`),
    IsFlagged: z.boolean().nullable().describe(`
        * * Field Name: IsFlagged
        * * Display Name: Is Flagged
        * * SQL Data Type: bit
        * * Default Value: 0`),
    Status: z.union([z.literal('Deleted'), z.literal('Draft'), z.literal('Edited'), z.literal('Moderated'), z.literal('Published')]).nullable().describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Published
    * * Value List Type: List
    * * Possible Values 
    *   * Deleted
    *   * Draft
    *   * Edited
    *   * Moderated
    *   * Published`),
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
    RootParentPostID: z.string().nullable().describe(`
        * * Field Name: RootParentPostID
        * * Display Name: Root Parent Post ID
        * * SQL Data Type: uniqueidentifier`),
});

export type AssociationDemoForumPostEntityType = z.infer<typeof AssociationDemoForumPostSchema>;

/**
 * zod schema definition for the entity Forum Threads
 */
export const AssociationDemoForumThreadSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    CategoryID: z.string().describe(`
        * * Field Name: CategoryID
        * * Display Name: Category ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Forum Categories (vwForumCategories.ID)`),
    Title: z.string().describe(`
        * * Field Name: Title
        * * Display Name: Title
        * * SQL Data Type: nvarchar(500)`),
    AuthorID: z.string().describe(`
        * * Field Name: AuthorID
        * * Display Name: Author ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Members (vwMembers.ID)`),
    CreatedDate: z.date().describe(`
        * * Field Name: CreatedDate
        * * Display Name: Created Date
        * * SQL Data Type: datetime
        * * Default Value: getdate()`),
    ViewCount: z.number().nullable().describe(`
        * * Field Name: ViewCount
        * * Display Name: View Count
        * * SQL Data Type: int
        * * Default Value: 0`),
    ReplyCount: z.number().nullable().describe(`
        * * Field Name: ReplyCount
        * * Display Name: Reply Count
        * * SQL Data Type: int
        * * Default Value: 0`),
    LastActivityDate: z.date().nullable().describe(`
        * * Field Name: LastActivityDate
        * * Display Name: Last Activity Date
        * * SQL Data Type: datetime`),
    LastReplyAuthorID: z.string().nullable().describe(`
        * * Field Name: LastReplyAuthorID
        * * Display Name: Last Reply Author ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Members (vwMembers.ID)`),
    IsPinned: z.boolean().nullable().describe(`
        * * Field Name: IsPinned
        * * Display Name: Is Pinned
        * * SQL Data Type: bit
        * * Default Value: 0`),
    IsLocked: z.boolean().nullable().describe(`
        * * Field Name: IsLocked
        * * Display Name: Is Locked
        * * SQL Data Type: bit
        * * Default Value: 0`),
    IsFeatured: z.boolean().nullable().describe(`
        * * Field Name: IsFeatured
        * * Display Name: Is Featured
        * * SQL Data Type: bit
        * * Default Value: 0`),
    Status: z.union([z.literal('Active'), z.literal('Archived'), z.literal('Closed'), z.literal('Deleted')]).nullable().describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Archived
    *   * Closed
    *   * Deleted`),
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
    Category: z.string().describe(`
        * * Field Name: Category
        * * Display Name: Category
        * * SQL Data Type: nvarchar(255)`),
});

export type AssociationDemoForumThreadEntityType = z.infer<typeof AssociationDemoForumThreadSchema>;

/**
 * zod schema definition for the entity Government Contacts
 */
export const AssociationDemoGovernmentContactSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    LegislativeBodyID: z.string().nullable().describe(`
        * * Field Name: LegislativeBodyID
        * * Display Name: Legislative Body ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Legislative Bodies (vwLegislativeBodies.ID)`),
    FirstName: z.string().describe(`
        * * Field Name: FirstName
        * * Display Name: First Name
        * * SQL Data Type: nvarchar(100)`),
    LastName: z.string().describe(`
        * * Field Name: LastName
        * * Display Name: Last Name
        * * SQL Data Type: nvarchar(100)`),
    Title: z.string().nullable().describe(`
        * * Field Name: Title
        * * Display Name: Title
        * * SQL Data Type: nvarchar(255)`),
    ContactType: z.union([z.literal('Agency Head'), z.literal('Commissioner'), z.literal('Committee Chair'), z.literal('Committee Member'), z.literal('Governor'), z.literal('Judge'), z.literal('Legislator'), z.literal('Mayor'), z.literal('Other'), z.literal('Regulator'), z.literal('Representative'), z.literal('Senator'), z.literal('Staff Member')]).describe(`
        * * Field Name: ContactType
        * * Display Name: Contact Type
        * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Agency Head
    *   * Commissioner
    *   * Committee Chair
    *   * Committee Member
    *   * Governor
    *   * Judge
    *   * Legislator
    *   * Mayor
    *   * Other
    *   * Regulator
    *   * Representative
    *   * Senator
    *   * Staff Member`),
    Party: z.string().nullable().describe(`
        * * Field Name: Party
        * * Display Name: Party
        * * SQL Data Type: nvarchar(50)`),
    District: z.string().nullable().describe(`
        * * Field Name: District
        * * Display Name: District
        * * SQL Data Type: nvarchar(100)`),
    Committee: z.string().nullable().describe(`
        * * Field Name: Committee
        * * Display Name: Committee
        * * SQL Data Type: nvarchar(255)`),
    Email: z.string().nullable().describe(`
        * * Field Name: Email
        * * Display Name: Email
        * * SQL Data Type: nvarchar(255)`),
    Phone: z.string().nullable().describe(`
        * * Field Name: Phone
        * * Display Name: Phone
        * * SQL Data Type: nvarchar(50)`),
    OfficeAddress: z.string().nullable().describe(`
        * * Field Name: OfficeAddress
        * * Display Name: Office Address
        * * SQL Data Type: nvarchar(500)`),
    Website: z.string().nullable().describe(`
        * * Field Name: Website
        * * Display Name: Website
        * * SQL Data Type: nvarchar(500)`),
    TermStart: z.date().nullable().describe(`
        * * Field Name: TermStart
        * * Display Name: Term Start
        * * SQL Data Type: date`),
    TermEnd: z.date().nullable().describe(`
        * * Field Name: TermEnd
        * * Display Name: Term End
        * * SQL Data Type: date`),
    Notes: z.string().nullable().describe(`
        * * Field Name: Notes
        * * Display Name: Notes
        * * SQL Data Type: nvarchar(MAX)`),
    IsActive: z.boolean().nullable().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1`),
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
    LegislativeBody: z.string().nullable().describe(`
        * * Field Name: LegislativeBody
        * * Display Name: Legislative Body
        * * SQL Data Type: nvarchar(255)`),
});

export type AssociationDemoGovernmentContactEntityType = z.infer<typeof AssociationDemoGovernmentContactSchema>;

/**
 * zod schema definition for the entity Invoice Line Items
 */
export const AssociationDemoInvoiceLineItemSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    InvoiceID: z.string().describe(`
        * * Field Name: InvoiceID
        * * Display Name: Invoice ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Invoices (vwInvoices.ID)`),
    Description: z.string().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(500)`),
    ItemType: z.union([z.literal('Course Enrollment'), z.literal('Donation'), z.literal('Event Registration'), z.literal('Membership Dues'), z.literal('Merchandise'), z.literal('Other')]).describe(`
        * * Field Name: ItemType
        * * Display Name: Item Type
        * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Course Enrollment
    *   * Donation
    *   * Event Registration
    *   * Membership Dues
    *   * Merchandise
    *   * Other`),
    Quantity: z.number().nullable().describe(`
        * * Field Name: Quantity
        * * Display Name: Quantity
        * * SQL Data Type: int
        * * Default Value: 1`),
    UnitPrice: z.number().describe(`
        * * Field Name: UnitPrice
        * * Display Name: Unit Price
        * * SQL Data Type: decimal(10, 2)`),
    Amount: z.number().describe(`
        * * Field Name: Amount
        * * Display Name: Amount
        * * SQL Data Type: decimal(12, 2)`),
    TaxAmount: z.number().nullable().describe(`
        * * Field Name: TaxAmount
        * * Display Name: Tax Amount
        * * SQL Data Type: decimal(12, 2)
        * * Default Value: 0`),
    RelatedEntityType: z.string().nullable().describe(`
        * * Field Name: RelatedEntityType
        * * Display Name: Related Entity Type
        * * SQL Data Type: nvarchar(100)`),
    RelatedEntityID: z.string().nullable().describe(`
        * * Field Name: RelatedEntityID
        * * Display Name: Related Entity ID
        * * SQL Data Type: uniqueidentifier`),
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

export type AssociationDemoInvoiceLineItemEntityType = z.infer<typeof AssociationDemoInvoiceLineItemSchema>;

/**
 * zod schema definition for the entity Invoices
 */
export const AssociationDemoInvoiceSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    InvoiceNumber: z.string().describe(`
        * * Field Name: InvoiceNumber
        * * Display Name: Invoice Number
        * * SQL Data Type: nvarchar(50)`),
    MemberID: z.string().describe(`
        * * Field Name: MemberID
        * * Display Name: Member ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Members (vwMembers.ID)`),
    InvoiceDate: z.date().describe(`
        * * Field Name: InvoiceDate
        * * Display Name: Invoice Date
        * * SQL Data Type: date`),
    DueDate: z.date().describe(`
        * * Field Name: DueDate
        * * Display Name: Due Date
        * * SQL Data Type: date`),
    SubTotal: z.number().describe(`
        * * Field Name: SubTotal
        * * Display Name: Sub Total
        * * SQL Data Type: decimal(12, 2)`),
    Tax: z.number().nullable().describe(`
        * * Field Name: Tax
        * * Display Name: Tax
        * * SQL Data Type: decimal(12, 2)
        * * Default Value: 0`),
    Discount: z.number().nullable().describe(`
        * * Field Name: Discount
        * * Display Name: Discount
        * * SQL Data Type: decimal(12, 2)
        * * Default Value: 0`),
    Total: z.number().describe(`
        * * Field Name: Total
        * * Display Name: Total
        * * SQL Data Type: decimal(12, 2)`),
    AmountPaid: z.number().nullable().describe(`
        * * Field Name: AmountPaid
        * * Display Name: Amount Paid
        * * SQL Data Type: decimal(12, 2)
        * * Default Value: 0`),
    Balance: z.number().describe(`
        * * Field Name: Balance
        * * Display Name: Balance
        * * SQL Data Type: decimal(12, 2)`),
    Status: z.union([z.literal('Cancelled'), z.literal('Draft'), z.literal('Overdue'), z.literal('Paid'), z.literal('Partial'), z.literal('Refunded'), z.literal('Sent')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Cancelled
    *   * Draft
    *   * Overdue
    *   * Paid
    *   * Partial
    *   * Refunded
    *   * Sent`),
    Notes: z.string().nullable().describe(`
        * * Field Name: Notes
        * * Display Name: Notes
        * * SQL Data Type: nvarchar(MAX)`),
    PaymentTerms: z.string().nullable().describe(`
        * * Field Name: PaymentTerms
        * * Display Name: Payment Terms
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

export type AssociationDemoInvoiceEntityType = z.infer<typeof AssociationDemoInvoiceSchema>;

/**
 * zod schema definition for the entity Legislative Bodies
 */
export const AssociationDemoLegislativeBodySchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)`),
    BodyType: z.union([z.literal('City'), z.literal('County'), z.literal('Federal Agency'), z.literal('Federal Congress'), z.literal('International'), z.literal('Regulatory Board'), z.literal('State Agency'), z.literal('State Legislature')]).describe(`
        * * Field Name: BodyType
        * * Display Name: Body Type
        * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * City
    *   * County
    *   * Federal Agency
    *   * Federal Congress
    *   * International
    *   * Regulatory Board
    *   * State Agency
    *   * State Legislature`),
    Level: z.union([z.literal('City'), z.literal('County'), z.literal('Federal'), z.literal('International'), z.literal('State')]).describe(`
        * * Field Name: Level
        * * Display Name: Level
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * City
    *   * County
    *   * Federal
    *   * International
    *   * State`),
    State: z.string().nullable().describe(`
        * * Field Name: State
        * * Display Name: State
        * * SQL Data Type: nvarchar(2)`),
    Country: z.string().nullable().describe(`
        * * Field Name: Country
        * * Display Name: Country
        * * SQL Data Type: nvarchar(100)
        * * Default Value: United States`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    Website: z.string().nullable().describe(`
        * * Field Name: Website
        * * Display Name: Website
        * * SQL Data Type: nvarchar(500)`),
    SessionSchedule: z.string().nullable().describe(`
        * * Field Name: SessionSchedule
        * * Display Name: Session Schedule
        * * SQL Data Type: nvarchar(500)`),
    IsActive: z.boolean().nullable().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1`),
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

export type AssociationDemoLegislativeBodyEntityType = z.infer<typeof AssociationDemoLegislativeBodySchema>;

/**
 * zod schema definition for the entity Legislative Issues
 */
export const AssociationDemoLegislativeIssueSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    LegislativeBodyID: z.string().describe(`
        * * Field Name: LegislativeBodyID
        * * Display Name: Legislative Body ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Legislative Bodies (vwLegislativeBodies.ID)`),
    Title: z.string().describe(`
        * * Field Name: Title
        * * Display Name: Title
        * * SQL Data Type: nvarchar(500)`),
    IssueType: z.union([z.literal('Amendment'), z.literal('Bill'), z.literal('Court Case'), z.literal('Executive Order'), z.literal('Policy'), z.literal('Regulation'), z.literal('Resolution'), z.literal('Rule')]).describe(`
        * * Field Name: IssueType
        * * Display Name: Issue Type
        * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Amendment
    *   * Bill
    *   * Court Case
    *   * Executive Order
    *   * Policy
    *   * Regulation
    *   * Resolution
    *   * Rule`),
    BillNumber: z.string().nullable().describe(`
        * * Field Name: BillNumber
        * * Display Name: Bill Number
        * * SQL Data Type: nvarchar(100)`),
    Status: z.union([z.literal('Comment Period'), z.literal('Enacted'), z.literal('Failed'), z.literal('Final Rule'), z.literal('Floor Vote Pending'), z.literal('In Committee'), z.literal('Introduced'), z.literal('Passed Committee'), z.literal('Passed House'), z.literal('Passed Senate'), z.literal('Signed'), z.literal('Vetoed'), z.literal('Withdrawn')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Comment Period
    *   * Enacted
    *   * Failed
    *   * Final Rule
    *   * Floor Vote Pending
    *   * In Committee
    *   * Introduced
    *   * Passed Committee
    *   * Passed House
    *   * Passed Senate
    *   * Signed
    *   * Vetoed
    *   * Withdrawn`),
    IntroducedDate: z.date().nullable().describe(`
        * * Field Name: IntroducedDate
        * * Display Name: Introduced Date
        * * SQL Data Type: date`),
    LastActionDate: z.date().nullable().describe(`
        * * Field Name: LastActionDate
        * * Display Name: Last Action Date
        * * SQL Data Type: date`),
    EffectiveDate: z.date().nullable().describe(`
        * * Field Name: EffectiveDate
        * * Display Name: Effective Date
        * * SQL Data Type: date`),
    Summary: z.string().nullable().describe(`
        * * Field Name: Summary
        * * Display Name: Summary
        * * SQL Data Type: nvarchar(MAX)`),
    ImpactLevel: z.union([z.literal('Critical'), z.literal('High'), z.literal('Low'), z.literal('Medium'), z.literal('Monitoring')]).nullable().describe(`
        * * Field Name: ImpactLevel
        * * Display Name: Impact Level
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Critical
    *   * High
    *   * Low
    *   * Medium
    *   * Monitoring`),
    ImpactDescription: z.string().nullable().describe(`
        * * Field Name: ImpactDescription
        * * Display Name: Impact Description
        * * SQL Data Type: nvarchar(MAX)`),
    Category: z.union([z.literal('Animal Welfare'), z.literal('Dairy Pricing'), z.literal('Environmental'), z.literal('Farm Bill'), z.literal('Food Safety'), z.literal('Import/Export'), z.literal('Labeling'), z.literal('Labor'), z.literal('Organic Standards'), z.literal('Other'), z.literal('Raw Milk'), z.literal('Taxation'), z.literal('Trade')]).nullable().describe(`
        * * Field Name: Category
        * * Display Name: Category
        * * SQL Data Type: nvarchar(100)
    * * Value List Type: List
    * * Possible Values 
    *   * Animal Welfare
    *   * Dairy Pricing
    *   * Environmental
    *   * Farm Bill
    *   * Food Safety
    *   * Import/Export
    *   * Labeling
    *   * Labor
    *   * Organic Standards
    *   * Other
    *   * Raw Milk
    *   * Taxation
    *   * Trade`),
    Sponsor: z.string().nullable().describe(`
        * * Field Name: Sponsor
        * * Display Name: Sponsor
        * * SQL Data Type: nvarchar(255)`),
    TrackingURL: z.string().nullable().describe(`
        * * Field Name: TrackingURL
        * * Display Name: Tracking URL
        * * SQL Data Type: nvarchar(500)`),
    IsActive: z.boolean().nullable().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1`),
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
    LegislativeBody: z.string().describe(`
        * * Field Name: LegislativeBody
        * * Display Name: Legislative Body
        * * SQL Data Type: nvarchar(255)`),
});

export type AssociationDemoLegislativeIssueEntityType = z.infer<typeof AssociationDemoLegislativeIssueSchema>;

/**
 * zod schema definition for the entity Member Follows
 */
export const AssociationDemoMemberFollowSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    FollowerID: z.string().describe(`
        * * Field Name: FollowerID
        * * Display Name: Follower ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Members (vwMembers.ID)`),
    FollowType: z.union([z.literal('Category'), z.literal('Member'), z.literal('Tag'), z.literal('Thread')]).describe(`
        * * Field Name: FollowType
        * * Display Name: Follow Type
        * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Category
    *   * Member
    *   * Tag
    *   * Thread`),
    FollowedEntityID: z.string().describe(`
        * * Field Name: FollowedEntityID
        * * Display Name: Followed Entity ID
        * * SQL Data Type: uniqueidentifier`),
    CreatedDate: z.date().describe(`
        * * Field Name: CreatedDate
        * * Display Name: Created Date
        * * SQL Data Type: datetime
        * * Default Value: getdate()`),
    NotifyOnActivity: z.boolean().nullable().describe(`
        * * Field Name: NotifyOnActivity
        * * Display Name: Notify On Activity
        * * SQL Data Type: bit
        * * Default Value: 1`),
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

export type AssociationDemoMemberFollowEntityType = z.infer<typeof AssociationDemoMemberFollowSchema>;

/**
 * zod schema definition for the entity Members
 */
export const AssociationDemoMemberSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Email: z.string().describe(`
        * * Field Name: Email
        * * Display Name: Email
        * * SQL Data Type: nvarchar(255)`),
    FirstName: z.string().describe(`
        * * Field Name: FirstName
        * * Display Name: First Name
        * * SQL Data Type: nvarchar(100)`),
    LastName: z.string().describe(`
        * * Field Name: LastName
        * * Display Name: Last Name
        * * SQL Data Type: nvarchar(100)`),
    Title: z.string().nullable().describe(`
        * * Field Name: Title
        * * Display Name: Title
        * * SQL Data Type: nvarchar(100)`),
    OrganizationID: z.string().nullable().describe(`
        * * Field Name: OrganizationID
        * * Display Name: Organization ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Organizations (vwOrganizations.ID)`),
    Industry: z.string().nullable().describe(`
        * * Field Name: Industry
        * * Display Name: Industry
        * * SQL Data Type: nvarchar(100)`),
    JobFunction: z.string().nullable().describe(`
        * * Field Name: JobFunction
        * * Display Name: Job Function
        * * SQL Data Type: nvarchar(100)`),
    YearsInProfession: z.number().nullable().describe(`
        * * Field Name: YearsInProfession
        * * Display Name: Years In Profession
        * * SQL Data Type: int`),
    JoinDate: z.date().describe(`
        * * Field Name: JoinDate
        * * Display Name: Join Date
        * * SQL Data Type: date`),
    LinkedInURL: z.string().nullable().describe(`
        * * Field Name: LinkedInURL
        * * Display Name: Linked In URL
        * * SQL Data Type: nvarchar(500)`),
    Bio: z.string().nullable().describe(`
        * * Field Name: Bio
        * * Display Name: Bio
        * * SQL Data Type: nvarchar(MAX)`),
    PreferredLanguage: z.string().nullable().describe(`
        * * Field Name: PreferredLanguage
        * * Display Name: Preferred Language
        * * SQL Data Type: nvarchar(10)
        * * Default Value: en-US`),
    Timezone: z.string().nullable().describe(`
        * * Field Name: Timezone
        * * Display Name: Timezone
        * * SQL Data Type: nvarchar(50)`),
    Phone: z.string().nullable().describe(`
        * * Field Name: Phone
        * * Display Name: Phone
        * * SQL Data Type: nvarchar(50)`),
    Mobile: z.string().nullable().describe(`
        * * Field Name: Mobile
        * * Display Name: Mobile
        * * SQL Data Type: nvarchar(50)`),
    City: z.string().nullable().describe(`
        * * Field Name: City
        * * Display Name: City
        * * SQL Data Type: nvarchar(100)`),
    State: z.string().nullable().describe(`
        * * Field Name: State
        * * Display Name: State
        * * SQL Data Type: nvarchar(50)`),
    Country: z.string().nullable().describe(`
        * * Field Name: Country
        * * Display Name: Country
        * * SQL Data Type: nvarchar(100)
        * * Default Value: United States`),
    PostalCode: z.string().nullable().describe(`
        * * Field Name: PostalCode
        * * Display Name: Postal Code
        * * SQL Data Type: nvarchar(20)`),
    EngagementScore: z.number().nullable().describe(`
        * * Field Name: EngagementScore
        * * Display Name: Engagement Score
        * * SQL Data Type: int
        * * Default Value: 0`),
    LastActivityDate: z.date().nullable().describe(`
        * * Field Name: LastActivityDate
        * * Display Name: Last Activity Date
        * * SQL Data Type: datetime`),
    ProfilePhotoURL: z.string().nullable().describe(`
        * * Field Name: ProfilePhotoURL
        * * Display Name: Profile Photo URL
        * * SQL Data Type: nvarchar(500)`),
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
    Organization: z.string().nullable().describe(`
        * * Field Name: Organization
        * * Display Name: Organization
        * * SQL Data Type: nvarchar(255)`),
});

export type AssociationDemoMemberEntityType = z.infer<typeof AssociationDemoMemberSchema>;

/**
 * zod schema definition for the entity Membership Types
 */
export const AssociationDemoMembershipTypeSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(100)`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    AnnualDues: z.number().describe(`
        * * Field Name: AnnualDues
        * * Display Name: Annual Dues
        * * SQL Data Type: decimal(10, 2)`),
    RenewalPeriodMonths: z.number().describe(`
        * * Field Name: RenewalPeriodMonths
        * * Display Name: Renewal Period Months
        * * SQL Data Type: int
        * * Default Value: 12`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1`),
    AllowAutoRenew: z.boolean().describe(`
        * * Field Name: AllowAutoRenew
        * * Display Name: Allow Auto Renew
        * * SQL Data Type: bit
        * * Default Value: 1`),
    RequiresApproval: z.boolean().describe(`
        * * Field Name: RequiresApproval
        * * Display Name: Requires Approval
        * * SQL Data Type: bit
        * * Default Value: 0`),
    Benefits: z.string().nullable().describe(`
        * * Field Name: Benefits
        * * Display Name: Benefits
        * * SQL Data Type: nvarchar(MAX)`),
    DisplayOrder: z.number().nullable().describe(`
        * * Field Name: DisplayOrder
        * * Display Name: Display Order
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

export type AssociationDemoMembershipTypeEntityType = z.infer<typeof AssociationDemoMembershipTypeSchema>;

/**
 * zod schema definition for the entity Memberships
 */
export const AssociationDemoMembershipSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    MemberID: z.string().describe(`
        * * Field Name: MemberID
        * * Display Name: Member ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Members (vwMembers.ID)`),
    MembershipTypeID: z.string().describe(`
        * * Field Name: MembershipTypeID
        * * Display Name: Membership Type ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Membership Types (vwMembershipTypes.ID)`),
    Status: z.union([z.literal('Active'), z.literal('Cancelled'), z.literal('Lapsed'), z.literal('Pending'), z.literal('Suspended')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Cancelled
    *   * Lapsed
    *   * Pending
    *   * Suspended`),
    StartDate: z.date().describe(`
        * * Field Name: StartDate
        * * Display Name: Start Date
        * * SQL Data Type: date`),
    EndDate: z.date().describe(`
        * * Field Name: EndDate
        * * Display Name: End Date
        * * SQL Data Type: date`),
    RenewalDate: z.date().nullable().describe(`
        * * Field Name: RenewalDate
        * * Display Name: Renewal Date
        * * SQL Data Type: date`),
    AutoRenew: z.boolean().describe(`
        * * Field Name: AutoRenew
        * * Display Name: Auto Renew
        * * SQL Data Type: bit
        * * Default Value: 1`),
    CancellationDate: z.date().nullable().describe(`
        * * Field Name: CancellationDate
        * * Display Name: Cancellation Date
        * * SQL Data Type: date`),
    CancellationReason: z.string().nullable().describe(`
        * * Field Name: CancellationReason
        * * Display Name: Cancellation Reason
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
    MembershipType: z.string().describe(`
        * * Field Name: MembershipType
        * * Display Name: Membership Type
        * * SQL Data Type: nvarchar(100)`),
});

export type AssociationDemoMembershipEntityType = z.infer<typeof AssociationDemoMembershipSchema>;

/**
 * zod schema definition for the entity Organizations
 */
export const AssociationDemoOrganizationSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)`),
    Industry: z.string().nullable().describe(`
        * * Field Name: Industry
        * * Display Name: Industry
        * * SQL Data Type: nvarchar(100)`),
    EmployeeCount: z.number().nullable().describe(`
        * * Field Name: EmployeeCount
        * * Display Name: Employee Count
        * * SQL Data Type: int`),
    AnnualRevenue: z.number().nullable().describe(`
        * * Field Name: AnnualRevenue
        * * Display Name: Annual Revenue
        * * SQL Data Type: decimal(18, 2)`),
    MarketCapitalization: z.number().nullable().describe(`
        * * Field Name: MarketCapitalization
        * * Display Name: Market Capitalization
        * * SQL Data Type: decimal(18, 2)`),
    TickerSymbol: z.string().nullable().describe(`
        * * Field Name: TickerSymbol
        * * Display Name: Ticker Symbol
        * * SQL Data Type: nvarchar(10)`),
    Exchange: z.string().nullable().describe(`
        * * Field Name: Exchange
        * * Display Name: Exchange
        * * SQL Data Type: nvarchar(50)`),
    Website: z.string().nullable().describe(`
        * * Field Name: Website
        * * Display Name: Website
        * * SQL Data Type: nvarchar(500)`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    YearFounded: z.number().nullable().describe(`
        * * Field Name: YearFounded
        * * Display Name: Year Founded
        * * SQL Data Type: int`),
    City: z.string().nullable().describe(`
        * * Field Name: City
        * * Display Name: City
        * * SQL Data Type: nvarchar(100)`),
    State: z.string().nullable().describe(`
        * * Field Name: State
        * * Display Name: State
        * * SQL Data Type: nvarchar(50)`),
    Country: z.string().nullable().describe(`
        * * Field Name: Country
        * * Display Name: Country
        * * SQL Data Type: nvarchar(100)
        * * Default Value: United States`),
    PostalCode: z.string().nullable().describe(`
        * * Field Name: PostalCode
        * * Display Name: Postal Code
        * * SQL Data Type: nvarchar(20)`),
    Phone: z.string().nullable().describe(`
        * * Field Name: Phone
        * * Display Name: Phone
        * * SQL Data Type: nvarchar(50)`),
    LogoURL: z.string().nullable().describe(`
        * * Field Name: LogoURL
        * * Display Name: Logo URL
        * * SQL Data Type: nvarchar(500)`),
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

export type AssociationDemoOrganizationEntityType = z.infer<typeof AssociationDemoOrganizationSchema>;

/**
 * zod schema definition for the entity Payments
 */
export const AssociationDemoPaymentSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    InvoiceID: z.string().describe(`
        * * Field Name: InvoiceID
        * * Display Name: Invoice ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Invoices (vwInvoices.ID)`),
    PaymentDate: z.date().describe(`
        * * Field Name: PaymentDate
        * * Display Name: Payment Date
        * * SQL Data Type: datetime`),
    Amount: z.number().describe(`
        * * Field Name: Amount
        * * Display Name: Amount
        * * SQL Data Type: decimal(12, 2)`),
    PaymentMethod: z.union([z.literal('ACH'), z.literal('Cash'), z.literal('Check'), z.literal('Credit Card'), z.literal('PayPal'), z.literal('Stripe'), z.literal('Wire')]).describe(`
        * * Field Name: PaymentMethod
        * * Display Name: Payment Method
        * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * ACH
    *   * Cash
    *   * Check
    *   * Credit Card
    *   * PayPal
    *   * Stripe
    *   * Wire`),
    TransactionID: z.string().nullable().describe(`
        * * Field Name: TransactionID
        * * Display Name: Transaction ID
        * * SQL Data Type: nvarchar(255)`),
    Status: z.union([z.literal('Cancelled'), z.literal('Completed'), z.literal('Failed'), z.literal('Pending'), z.literal('Refunded')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Cancelled
    *   * Completed
    *   * Failed
    *   * Pending
    *   * Refunded`),
    ProcessedDate: z.date().nullable().describe(`
        * * Field Name: ProcessedDate
        * * Display Name: Processed Date
        * * SQL Data Type: datetime`),
    FailureReason: z.string().nullable().describe(`
        * * Field Name: FailureReason
        * * Display Name: Failure Reason
        * * SQL Data Type: nvarchar(MAX)`),
    Notes: z.string().nullable().describe(`
        * * Field Name: Notes
        * * Display Name: Notes
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

export type AssociationDemoPaymentEntityType = z.infer<typeof AssociationDemoPaymentSchema>;

/**
 * zod schema definition for the entity Policy Positions
 */
export const AssociationDemoPolicyPositionSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    LegislativeIssueID: z.string().describe(`
        * * Field Name: LegislativeIssueID
        * * Display Name: Legislative Issue ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Legislative Issues (vwLegislativeIssues.ID)`),
    Position: z.union([z.literal('Monitoring'), z.literal('Neutral'), z.literal('Oppose'), z.literal('Support'), z.literal('Support with Amendments')]).describe(`
        * * Field Name: Position
        * * Display Name: Position
        * * SQL Data Type: nvarchar(30)
    * * Value List Type: List
    * * Possible Values 
    *   * Monitoring
    *   * Neutral
    *   * Oppose
    *   * Support
    *   * Support with Amendments`),
    PositionStatement: z.string().describe(`
        * * Field Name: PositionStatement
        * * Display Name: Position Statement
        * * SQL Data Type: nvarchar(MAX)`),
    Rationale: z.string().nullable().describe(`
        * * Field Name: Rationale
        * * Display Name: Rationale
        * * SQL Data Type: nvarchar(MAX)`),
    AdoptedDate: z.date().describe(`
        * * Field Name: AdoptedDate
        * * Display Name: Adopted Date
        * * SQL Data Type: date`),
    AdoptedBy: z.string().nullable().describe(`
        * * Field Name: AdoptedBy
        * * Display Name: Adopted By
        * * SQL Data Type: nvarchar(255)`),
    ExpirationDate: z.date().nullable().describe(`
        * * Field Name: ExpirationDate
        * * Display Name: Expiration Date
        * * SQL Data Type: date`),
    Priority: z.union([z.literal('Critical'), z.literal('High'), z.literal('Low'), z.literal('Medium')]).nullable().describe(`
        * * Field Name: Priority
        * * Display Name: Priority
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Critical
    *   * High
    *   * Low
    *   * Medium`),
    IsPublic: z.boolean().nullable().describe(`
        * * Field Name: IsPublic
        * * Display Name: Is Public
        * * SQL Data Type: bit
        * * Default Value: 1`),
    DocumentURL: z.string().nullable().describe(`
        * * Field Name: DocumentURL
        * * Display Name: Document URL
        * * SQL Data Type: nvarchar(500)`),
    ContactPerson: z.string().nullable().describe(`
        * * Field Name: ContactPerson
        * * Display Name: Contact Person
        * * SQL Data Type: nvarchar(255)`),
    LastReviewedDate: z.date().nullable().describe(`
        * * Field Name: LastReviewedDate
        * * Display Name: Last Reviewed Date
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

export type AssociationDemoPolicyPositionEntityType = z.infer<typeof AssociationDemoPolicyPositionSchema>;

/**
 * zod schema definition for the entity Post Attachments
 */
export const AssociationDemoPostAttachmentSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    PostID: z.string().describe(`
        * * Field Name: PostID
        * * Display Name: Post ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Forum Posts (vwForumPosts.ID)`),
    FileName: z.string().describe(`
        * * Field Name: FileName
        * * Display Name: File Name
        * * SQL Data Type: nvarchar(255)`),
    FileURL: z.string().describe(`
        * * Field Name: FileURL
        * * Display Name: File URL
        * * SQL Data Type: nvarchar(1000)`),
    FileType: z.string().nullable().describe(`
        * * Field Name: FileType
        * * Display Name: File Type
        * * SQL Data Type: nvarchar(100)`),
    FileSizeBytes: z.number().nullable().describe(`
        * * Field Name: FileSizeBytes
        * * Display Name: File Size Bytes
        * * SQL Data Type: bigint`),
    UploadedDate: z.date().describe(`
        * * Field Name: UploadedDate
        * * Display Name: Uploaded Date
        * * SQL Data Type: datetime
        * * Default Value: getdate()`),
    UploadedByID: z.string().describe(`
        * * Field Name: UploadedByID
        * * Display Name: Uploaded By ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Members (vwMembers.ID)`),
    DownloadCount: z.number().nullable().describe(`
        * * Field Name: DownloadCount
        * * Display Name: Download Count
        * * SQL Data Type: int
        * * Default Value: 0`),
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

export type AssociationDemoPostAttachmentEntityType = z.infer<typeof AssociationDemoPostAttachmentSchema>;

/**
 * zod schema definition for the entity Post Reactions
 */
export const AssociationDemoPostReactionSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    PostID: z.string().describe(`
        * * Field Name: PostID
        * * Display Name: Post ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Forum Posts (vwForumPosts.ID)`),
    MemberID: z.string().describe(`
        * * Field Name: MemberID
        * * Display Name: Member ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Members (vwMembers.ID)`),
    ReactionType: z.union([z.literal('Bookmark'), z.literal('Flag'), z.literal('Helpful'), z.literal('Like'), z.literal('Thanks')]).describe(`
        * * Field Name: ReactionType
        * * Display Name: Reaction Type
        * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Bookmark
    *   * Flag
    *   * Helpful
    *   * Like
    *   * Thanks`),
    CreatedDate: z.date().describe(`
        * * Field Name: CreatedDate
        * * Display Name: Created Date
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

export type AssociationDemoPostReactionEntityType = z.infer<typeof AssociationDemoPostReactionSchema>;

/**
 * zod schema definition for the entity Post Tags
 */
export const AssociationDemoPostTagSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    PostID: z.string().describe(`
        * * Field Name: PostID
        * * Display Name: Post ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Forum Posts (vwForumPosts.ID)`),
    TagName: z.string().describe(`
        * * Field Name: TagName
        * * Display Name: Tag Name
        * * SQL Data Type: nvarchar(100)`),
    CreatedDate: z.date().describe(`
        * * Field Name: CreatedDate
        * * Display Name: Created Date
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

export type AssociationDemoPostTagEntityType = z.infer<typeof AssociationDemoPostTagSchema>;

/**
 * zod schema definition for the entity Product Awards
 */
export const AssociationDemoProductAwardSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    ProductID: z.string().describe(`
        * * Field Name: ProductID
        * * Display Name: Product ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Products (vwProducts.ID)`),
    CompetitionID: z.string().nullable().describe(`
        * * Field Name: CompetitionID
        * * Display Name: Competition ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Competitions (vwCompetitions.ID)`),
    CompetitionEntryID: z.string().nullable().describe(`
        * * Field Name: CompetitionEntryID
        * * Display Name: Competition Entry ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Competition Entries (vwCompetitionEntries.ID)`),
    AwardName: z.string().describe(`
        * * Field Name: AwardName
        * * Display Name: Award Name
        * * SQL Data Type: nvarchar(255)`),
    AwardLevel: z.string().describe(`
        * * Field Name: AwardLevel
        * * Display Name: Award Level
        * * SQL Data Type: nvarchar(100)`),
    AwardingOrganization: z.string().nullable().describe(`
        * * Field Name: AwardingOrganization
        * * Display Name: Awarding Organization
        * * SQL Data Type: nvarchar(255)`),
    AwardDate: z.date().describe(`
        * * Field Name: AwardDate
        * * Display Name: Award Date
        * * SQL Data Type: date`),
    Year: z.number().describe(`
        * * Field Name: Year
        * * Display Name: Year
        * * SQL Data Type: int`),
    Category: z.string().nullable().describe(`
        * * Field Name: Category
        * * Display Name: Category
        * * SQL Data Type: nvarchar(255)`),
    Score: z.number().nullable().describe(`
        * * Field Name: Score
        * * Display Name: Score
        * * SQL Data Type: decimal(5, 2)`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    CertificateURL: z.string().nullable().describe(`
        * * Field Name: CertificateURL
        * * Display Name: Certificate URL
        * * SQL Data Type: nvarchar(500)`),
    IsDisplayed: z.boolean().nullable().describe(`
        * * Field Name: IsDisplayed
        * * Display Name: Is Displayed
        * * SQL Data Type: bit
        * * Default Value: 1`),
    DisplayOrder: z.number().nullable().describe(`
        * * Field Name: DisplayOrder
        * * Display Name: Display Order
        * * SQL Data Type: int
        * * Default Value: 0`),
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
    Product: z.string().describe(`
        * * Field Name: Product
        * * Display Name: Product
        * * SQL Data Type: nvarchar(255)`),
    Competition: z.string().nullable().describe(`
        * * Field Name: Competition
        * * Display Name: Competition
        * * SQL Data Type: nvarchar(255)`),
});

export type AssociationDemoProductAwardEntityType = z.infer<typeof AssociationDemoProductAwardSchema>;

/**
 * zod schema definition for the entity Product Categories
 */
export const AssociationDemoProductCategorySchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    ParentCategoryID: z.string().nullable().describe(`
        * * Field Name: ParentCategoryID
        * * Display Name: Parent Category ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Product Categories (vwProductCategories.ID)`),
    DisplayOrder: z.number().nullable().describe(`
        * * Field Name: DisplayOrder
        * * Display Name: Display Order
        * * SQL Data Type: int
        * * Default Value: 0`),
    IsActive: z.boolean().nullable().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1`),
    ImageURL: z.string().nullable().describe(`
        * * Field Name: ImageURL
        * * Display Name: Image URL
        * * SQL Data Type: nvarchar(500)`),
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
    ParentCategory: z.string().nullable().describe(`
        * * Field Name: ParentCategory
        * * Display Name: Parent Category
        * * SQL Data Type: nvarchar(255)`),
    RootParentCategoryID: z.string().nullable().describe(`
        * * Field Name: RootParentCategoryID
        * * Display Name: Root Parent Category ID
        * * SQL Data Type: uniqueidentifier`),
});

export type AssociationDemoProductCategoryEntityType = z.infer<typeof AssociationDemoProductCategorySchema>;

/**
 * zod schema definition for the entity Products
 */
export const AssociationDemoProductSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    MemberID: z.string().describe(`
        * * Field Name: MemberID
        * * Display Name: Member ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Members (vwMembers.ID)`),
    CategoryID: z.string().describe(`
        * * Field Name: CategoryID
        * * Display Name: Category ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Product Categories (vwProductCategories.ID)`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    CheeseType: z.string().nullable().describe(`
        * * Field Name: CheeseType
        * * Display Name: Cheese Type
        * * SQL Data Type: nvarchar(100)`),
    MilkSource: z.union([z.literal('Buffalo'), z.literal('Cow'), z.literal('Goat'), z.literal('Mixed'), z.literal('Sheep')]).nullable().describe(`
        * * Field Name: MilkSource
        * * Display Name: Milk Source
        * * SQL Data Type: nvarchar(100)
    * * Value List Type: List
    * * Possible Values 
    *   * Buffalo
    *   * Cow
    *   * Goat
    *   * Mixed
    *   * Sheep`),
    AgeMonths: z.number().nullable().describe(`
        * * Field Name: AgeMonths
        * * Display Name: Age Months
        * * SQL Data Type: int`),
    Weight: z.number().nullable().describe(`
        * * Field Name: Weight
        * * Display Name: Weight
        * * SQL Data Type: decimal(10, 2)`),
    WeightUnit: z.string().nullable().describe(`
        * * Field Name: WeightUnit
        * * Display Name: Weight Unit
        * * SQL Data Type: nvarchar(20)
        * * Default Value: oz`),
    RetailPrice: z.number().nullable().describe(`
        * * Field Name: RetailPrice
        * * Display Name: Retail Price
        * * SQL Data Type: decimal(10, 2)`),
    IsOrganic: z.boolean().nullable().describe(`
        * * Field Name: IsOrganic
        * * Display Name: Is Organic
        * * SQL Data Type: bit
        * * Default Value: 0`),
    IsRawMilk: z.boolean().nullable().describe(`
        * * Field Name: IsRawMilk
        * * Display Name: Is Raw Milk
        * * SQL Data Type: bit
        * * Default Value: 0`),
    IsAwardWinner: z.boolean().nullable().describe(`
        * * Field Name: IsAwardWinner
        * * Display Name: Is Award Winner
        * * SQL Data Type: bit
        * * Default Value: 0`),
    DateIntroduced: z.date().nullable().describe(`
        * * Field Name: DateIntroduced
        * * Display Name: Date Introduced
        * * SQL Data Type: date`),
    Status: z.union([z.literal('Active'), z.literal('Discontinued'), z.literal('Limited Edition'), z.literal('Seasonal')]).nullable().describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Discontinued
    *   * Limited Edition
    *   * Seasonal`),
    ImageURL: z.string().nullable().describe(`
        * * Field Name: ImageURL
        * * Display Name: Image URL
        * * SQL Data Type: nvarchar(500)`),
    TastingNotes: z.string().nullable().describe(`
        * * Field Name: TastingNotes
        * * Display Name: Tasting Notes
        * * SQL Data Type: nvarchar(MAX)`),
    PairingNotes: z.string().nullable().describe(`
        * * Field Name: PairingNotes
        * * Display Name: Pairing Notes
        * * SQL Data Type: nvarchar(MAX)`),
    ProductionMethod: z.string().nullable().describe(`
        * * Field Name: ProductionMethod
        * * Display Name: Production Method
        * * SQL Data Type: nvarchar(MAX)`),
    AwardCount: z.number().nullable().describe(`
        * * Field Name: AwardCount
        * * Display Name: Award Count
        * * SQL Data Type: int
        * * Default Value: 0`),
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
    Category: z.string().describe(`
        * * Field Name: Category
        * * Display Name: Category
        * * SQL Data Type: nvarchar(255)`),
});

export type AssociationDemoProductEntityType = z.infer<typeof AssociationDemoProductSchema>;

/**
 * zod schema definition for the entity Regulatory Comments
 */
export const AssociationDemoRegulatoryCommentSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    LegislativeIssueID: z.string().describe(`
        * * Field Name: LegislativeIssueID
        * * Display Name: Legislative Issue ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Legislative Issues (vwLegislativeIssues.ID)`),
    DocketNumber: z.string().nullable().describe(`
        * * Field Name: DocketNumber
        * * Display Name: Docket Number
        * * SQL Data Type: nvarchar(100)`),
    CommentPeriodStart: z.date().nullable().describe(`
        * * Field Name: CommentPeriodStart
        * * Display Name: Comment Period Start
        * * SQL Data Type: date`),
    CommentPeriodEnd: z.date().nullable().describe(`
        * * Field Name: CommentPeriodEnd
        * * Display Name: Comment Period End
        * * SQL Data Type: date`),
    SubmittedDate: z.date().describe(`
        * * Field Name: SubmittedDate
        * * Display Name: Submitted Date
        * * SQL Data Type: date`),
    SubmittedBy: z.string().nullable().describe(`
        * * Field Name: SubmittedBy
        * * Display Name: Submitted By
        * * SQL Data Type: nvarchar(255)`),
    CommentText: z.string().describe(`
        * * Field Name: CommentText
        * * Display Name: Comment Text
        * * SQL Data Type: nvarchar(MAX)`),
    CommentType: z.union([z.literal('Coalition'), z.literal('Individual'), z.literal('Organization'), z.literal('Public Hearing'), z.literal('Technical')]).nullable().describe(`
        * * Field Name: CommentType
        * * Display Name: Comment Type
        * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Coalition
    *   * Individual
    *   * Organization
    *   * Public Hearing
    *   * Technical`),
    AttachmentURL: z.string().nullable().describe(`
        * * Field Name: AttachmentURL
        * * Display Name: Attachment URL
        * * SQL Data Type: nvarchar(500)`),
    ConfirmationNumber: z.string().nullable().describe(`
        * * Field Name: ConfirmationNumber
        * * Display Name: Confirmation Number
        * * SQL Data Type: nvarchar(100)`),
    Status: z.union([z.literal('Acknowledged'), z.literal('Considered'), z.literal('Draft'), z.literal('Published'), z.literal('Rejected'), z.literal('Submitted')]).nullable().describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Submitted
    * * Value List Type: List
    * * Possible Values 
    *   * Acknowledged
    *   * Considered
    *   * Draft
    *   * Published
    *   * Rejected
    *   * Submitted`),
    Response: z.string().nullable().describe(`
        * * Field Name: Response
        * * Display Name: Response
        * * SQL Data Type: nvarchar(MAX)`),
    Notes: z.string().nullable().describe(`
        * * Field Name: Notes
        * * Display Name: Notes
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

export type AssociationDemoRegulatoryCommentEntityType = z.infer<typeof AssociationDemoRegulatoryCommentSchema>;

/**
 * zod schema definition for the entity Resource Categories
 */
export const AssociationDemoResourceCategorySchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    ParentCategoryID: z.string().nullable().describe(`
        * * Field Name: ParentCategoryID
        * * Display Name: Parent Category ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Resource Categories (vwResourceCategories.ID)`),
    DisplayOrder: z.number().nullable().describe(`
        * * Field Name: DisplayOrder
        * * Display Name: Display Order
        * * SQL Data Type: int
        * * Default Value: 0`),
    Icon: z.string().nullable().describe(`
        * * Field Name: Icon
        * * Display Name: Icon
        * * SQL Data Type: nvarchar(100)`),
    Color: z.string().nullable().describe(`
        * * Field Name: Color
        * * Display Name: Color
        * * SQL Data Type: nvarchar(50)`),
    IsActive: z.boolean().nullable().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1`),
    RequiresMembership: z.boolean().nullable().describe(`
        * * Field Name: RequiresMembership
        * * Display Name: Requires Membership
        * * SQL Data Type: bit
        * * Default Value: 0`),
    ResourceCount: z.number().nullable().describe(`
        * * Field Name: ResourceCount
        * * Display Name: Resource Count
        * * SQL Data Type: int
        * * Default Value: 0`),
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
    ParentCategory: z.string().nullable().describe(`
        * * Field Name: ParentCategory
        * * Display Name: Parent Category
        * * SQL Data Type: nvarchar(255)`),
    RootParentCategoryID: z.string().nullable().describe(`
        * * Field Name: RootParentCategoryID
        * * Display Name: Root Parent Category ID
        * * SQL Data Type: uniqueidentifier`),
});

export type AssociationDemoResourceCategoryEntityType = z.infer<typeof AssociationDemoResourceCategorySchema>;

/**
 * zod schema definition for the entity Resource Downloads
 */
export const AssociationDemoResourceDownloadSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    ResourceID: z.string().describe(`
        * * Field Name: ResourceID
        * * Display Name: Resource ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Resources (vwResources.ID)`),
    MemberID: z.string().describe(`
        * * Field Name: MemberID
        * * Display Name: Member ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Members (vwMembers.ID)`),
    DownloadDate: z.date().describe(`
        * * Field Name: DownloadDate
        * * Display Name: Download Date
        * * SQL Data Type: datetime
        * * Default Value: getdate()`),
    IPAddress: z.string().nullable().describe(`
        * * Field Name: IPAddress
        * * Display Name: IP Address
        * * SQL Data Type: nvarchar(50)`),
    UserAgent: z.string().nullable().describe(`
        * * Field Name: UserAgent
        * * Display Name: User Agent
        * * SQL Data Type: nvarchar(500)`),
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

export type AssociationDemoResourceDownloadEntityType = z.infer<typeof AssociationDemoResourceDownloadSchema>;

/**
 * zod schema definition for the entity Resource Ratings
 */
export const AssociationDemoResourceRatingSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    ResourceID: z.string().describe(`
        * * Field Name: ResourceID
        * * Display Name: Resource ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Resources (vwResources.ID)`),
    MemberID: z.string().describe(`
        * * Field Name: MemberID
        * * Display Name: Member ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Members (vwMembers.ID)`),
    Rating: z.number().describe(`
        * * Field Name: Rating
        * * Display Name: Rating
        * * SQL Data Type: int`),
    Review: z.string().nullable().describe(`
        * * Field Name: Review
        * * Display Name: Review
        * * SQL Data Type: nvarchar(MAX)`),
    CreatedDate: z.date().describe(`
        * * Field Name: CreatedDate
        * * Display Name: Created Date
        * * SQL Data Type: datetime
        * * Default Value: getdate()`),
    IsHelpful: z.boolean().nullable().describe(`
        * * Field Name: IsHelpful
        * * Display Name: Is Helpful
        * * SQL Data Type: bit
        * * Default Value: 1`),
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

export type AssociationDemoResourceRatingEntityType = z.infer<typeof AssociationDemoResourceRatingSchema>;

/**
 * zod schema definition for the entity Resource Tags
 */
export const AssociationDemoResourceTagSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    ResourceID: z.string().describe(`
        * * Field Name: ResourceID
        * * Display Name: Resource ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Resources (vwResources.ID)`),
    TagName: z.string().describe(`
        * * Field Name: TagName
        * * Display Name: Tag Name
        * * SQL Data Type: nvarchar(100)`),
    CreatedDate: z.date().describe(`
        * * Field Name: CreatedDate
        * * Display Name: Created Date
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

export type AssociationDemoResourceTagEntityType = z.infer<typeof AssociationDemoResourceTagSchema>;

/**
 * zod schema definition for the entity Resource Versions
 */
export const AssociationDemoResourceVersionSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    ResourceID: z.string().describe(`
        * * Field Name: ResourceID
        * * Display Name: Resource ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Resources (vwResources.ID)`),
    VersionNumber: z.string().describe(`
        * * Field Name: VersionNumber
        * * Display Name: Version Number
        * * SQL Data Type: nvarchar(20)`),
    VersionNotes: z.string().nullable().describe(`
        * * Field Name: VersionNotes
        * * Display Name: Version Notes
        * * SQL Data Type: nvarchar(MAX)`),
    FileURL: z.string().nullable().describe(`
        * * Field Name: FileURL
        * * Display Name: File URL
        * * SQL Data Type: nvarchar(1000)`),
    FileSizeBytes: z.number().nullable().describe(`
        * * Field Name: FileSizeBytes
        * * Display Name: File Size Bytes
        * * SQL Data Type: bigint`),
    CreatedByID: z.string().describe(`
        * * Field Name: CreatedByID
        * * Display Name: Created By ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Members (vwMembers.ID)`),
    CreatedDate: z.date().describe(`
        * * Field Name: CreatedDate
        * * Display Name: Created Date
        * * SQL Data Type: datetime
        * * Default Value: getdate()`),
    IsCurrent: z.boolean().nullable().describe(`
        * * Field Name: IsCurrent
        * * Display Name: Is Current
        * * SQL Data Type: bit
        * * Default Value: 0`),
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

export type AssociationDemoResourceVersionEntityType = z.infer<typeof AssociationDemoResourceVersionSchema>;

/**
 * zod schema definition for the entity Resources
 */
export const AssociationDemoResourceSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    CategoryID: z.string().describe(`
        * * Field Name: CategoryID
        * * Display Name: Category ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Resource Categories (vwResourceCategories.ID)`),
    Title: z.string().describe(`
        * * Field Name: Title
        * * Display Name: Title
        * * SQL Data Type: nvarchar(500)`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    ResourceType: z.union([z.literal('Article'), z.literal('Document'), z.literal('Link'), z.literal('PDF'), z.literal('Presentation'), z.literal('Spreadsheet'), z.literal('Template'), z.literal('Video')]).describe(`
        * * Field Name: ResourceType
        * * Display Name: Resource Type
        * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Article
    *   * Document
    *   * Link
    *   * PDF
    *   * Presentation
    *   * Spreadsheet
    *   * Template
    *   * Video`),
    FileURL: z.string().nullable().describe(`
        * * Field Name: FileURL
        * * Display Name: File URL
        * * SQL Data Type: nvarchar(1000)`),
    FileSizeBytes: z.number().nullable().describe(`
        * * Field Name: FileSizeBytes
        * * Display Name: File Size Bytes
        * * SQL Data Type: bigint`),
    MimeType: z.string().nullable().describe(`
        * * Field Name: MimeType
        * * Display Name: Mime Type
        * * SQL Data Type: nvarchar(100)`),
    AuthorID: z.string().nullable().describe(`
        * * Field Name: AuthorID
        * * Display Name: Author ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Members (vwMembers.ID)`),
    PublishedDate: z.date().describe(`
        * * Field Name: PublishedDate
        * * Display Name: Published Date
        * * SQL Data Type: datetime
        * * Default Value: getdate()`),
    LastUpdatedDate: z.date().nullable().describe(`
        * * Field Name: LastUpdatedDate
        * * Display Name: Last Updated Date
        * * SQL Data Type: datetime`),
    ViewCount: z.number().nullable().describe(`
        * * Field Name: ViewCount
        * * Display Name: View Count
        * * SQL Data Type: int
        * * Default Value: 0`),
    DownloadCount: z.number().nullable().describe(`
        * * Field Name: DownloadCount
        * * Display Name: Download Count
        * * SQL Data Type: int
        * * Default Value: 0`),
    AverageRating: z.number().nullable().describe(`
        * * Field Name: AverageRating
        * * Display Name: Average Rating
        * * SQL Data Type: decimal(3, 2)
        * * Default Value: 0`),
    RatingCount: z.number().nullable().describe(`
        * * Field Name: RatingCount
        * * Display Name: Rating Count
        * * SQL Data Type: int
        * * Default Value: 0`),
    IsFeatured: z.boolean().nullable().describe(`
        * * Field Name: IsFeatured
        * * Display Name: Is Featured
        * * SQL Data Type: bit
        * * Default Value: 0`),
    RequiresMembership: z.boolean().nullable().describe(`
        * * Field Name: RequiresMembership
        * * Display Name: Requires Membership
        * * SQL Data Type: bit
        * * Default Value: 0`),
    Status: z.union([z.literal('Archived'), z.literal('Deleted'), z.literal('Draft'), z.literal('Published')]).nullable().describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Published
    * * Value List Type: List
    * * Possible Values 
    *   * Archived
    *   * Deleted
    *   * Draft
    *   * Published`),
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
    Category: z.string().describe(`
        * * Field Name: Category
        * * Display Name: Category
        * * SQL Data Type: nvarchar(255)`),
});

export type AssociationDemoResourceEntityType = z.infer<typeof AssociationDemoResourceSchema>;

/**
 * zod schema definition for the entity Segments
 */
export const AssociationDemoSegmentSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    SegmentType: z.string().nullable().describe(`
        * * Field Name: SegmentType
        * * Display Name: Segment Type
        * * SQL Data Type: nvarchar(50)`),
    FilterCriteria: z.string().nullable().describe(`
        * * Field Name: FilterCriteria
        * * Display Name: Filter Criteria
        * * SQL Data Type: nvarchar(MAX)`),
    MemberCount: z.number().nullable().describe(`
        * * Field Name: MemberCount
        * * Display Name: Member Count
        * * SQL Data Type: int`),
    LastCalculatedDate: z.date().nullable().describe(`
        * * Field Name: LastCalculatedDate
        * * Display Name: Last Calculated Date
        * * SQL Data Type: datetime`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1`),
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

export type AssociationDemoSegmentEntityType = z.infer<typeof AssociationDemoSegmentSchema>;
 
 

/**
 * Accrediting Bodies - strongly typed entity sub-class
 * * Schema: AssociationDemo
 * * Base Table: AccreditingBody
 * * Base View: vwAccreditingBodies
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Accrediting Bodies')
export class AssociationDemoAccreditingBodyEntity extends BaseEntity<AssociationDemoAccreditingBodyEntityType> {
    /**
    * Loads the Accrediting Bodies record from the database
    * @param ID: string - primary key value to load the Accrediting Bodies record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AssociationDemoAccreditingBodyEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(255)
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Abbreviation
    * * Display Name: Abbreviation
    * * SQL Data Type: nvarchar(50)
    */
    get Abbreviation(): string | null {
        return this.Get('Abbreviation');
    }
    set Abbreviation(value: string | null) {
        this.Set('Abbreviation', value);
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
    * * Field Name: Website
    * * Display Name: Website
    * * SQL Data Type: nvarchar(500)
    */
    get Website(): string | null {
        return this.Get('Website');
    }
    set Website(value: string | null) {
        this.Set('Website', value);
    }

    /**
    * * Field Name: ContactEmail
    * * Display Name: Contact Email
    * * SQL Data Type: nvarchar(255)
    */
    get ContactEmail(): string | null {
        return this.Get('ContactEmail');
    }
    set ContactEmail(value: string | null) {
        this.Set('ContactEmail', value);
    }

    /**
    * * Field Name: ContactPhone
    * * Display Name: Contact Phone
    * * SQL Data Type: nvarchar(50)
    */
    get ContactPhone(): string | null {
        return this.Get('ContactPhone');
    }
    set ContactPhone(value: string | null) {
        this.Set('ContactPhone', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get IsActive(): boolean | null {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean | null) {
        this.Set('IsActive', value);
    }

    /**
    * * Field Name: IsRecognized
    * * Display Name: Is Recognized
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get IsRecognized(): boolean | null {
        return this.Get('IsRecognized');
    }
    set IsRecognized(value: boolean | null) {
        this.Set('IsRecognized', value);
    }

    /**
    * * Field Name: EstablishedDate
    * * Display Name: Established Date
    * * SQL Data Type: date
    */
    get EstablishedDate(): Date | null {
        return this.Get('EstablishedDate');
    }
    set EstablishedDate(value: Date | null) {
        this.Set('EstablishedDate', value);
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
    * * Field Name: CertificationCount
    * * Display Name: Certification Count
    * * SQL Data Type: int
    * * Default Value: 0
    */
    get CertificationCount(): number | null {
        return this.Get('CertificationCount');
    }
    set CertificationCount(value: number | null) {
        this.Set('CertificationCount', value);
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
 * Advocacy Actions - strongly typed entity sub-class
 * * Schema: AssociationDemo
 * * Base Table: AdvocacyAction
 * * Base View: vwAdvocacyActions
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Advocacy Actions')
export class AssociationDemoAdvocacyActionEntity extends BaseEntity<AssociationDemoAdvocacyActionEntityType> {
    /**
    * Loads the Advocacy Actions record from the database
    * @param ID: string - primary key value to load the Advocacy Actions record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AssociationDemoAdvocacyActionEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: LegislativeIssueID
    * * Display Name: Legislative Issue ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Legislative Issues (vwLegislativeIssues.ID)
    */
    get LegislativeIssueID(): string {
        return this.Get('LegislativeIssueID');
    }
    set LegislativeIssueID(value: string) {
        this.Set('LegislativeIssueID', value);
    }

    /**
    * * Field Name: MemberID
    * * Display Name: Member ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Members (vwMembers.ID)
    */
    get MemberID(): string | null {
        return this.Get('MemberID');
    }
    set MemberID(value: string | null) {
        this.Set('MemberID', value);
    }

    /**
    * * Field Name: GovernmentContactID
    * * Display Name: Government Contact ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Government Contacts (vwGovernmentContacts.ID)
    */
    get GovernmentContactID(): string | null {
        return this.Get('GovernmentContactID');
    }
    set GovernmentContactID(value: string | null) {
        this.Set('GovernmentContactID', value);
    }

    /**
    * * Field Name: ActionType
    * * Display Name: Action Type
    * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Campaign Contribution
    *   * Email
    *   * Event Attendance
    *   * Letter
    *   * Meeting
    *   * Other
    *   * Petition Signature
    *   * Phone Call
    *   * Social Media
    *   * Testimony
    */
    get ActionType(): 'Campaign Contribution' | 'Email' | 'Event Attendance' | 'Letter' | 'Meeting' | 'Other' | 'Petition Signature' | 'Phone Call' | 'Social Media' | 'Testimony' {
        return this.Get('ActionType');
    }
    set ActionType(value: 'Campaign Contribution' | 'Email' | 'Event Attendance' | 'Letter' | 'Meeting' | 'Other' | 'Petition Signature' | 'Phone Call' | 'Social Media' | 'Testimony') {
        this.Set('ActionType', value);
    }

    /**
    * * Field Name: ActionDate
    * * Display Name: Action Date
    * * SQL Data Type: date
    */
    get ActionDate(): Date {
        return this.Get('ActionDate');
    }
    set ActionDate(value: Date) {
        this.Set('ActionDate', value);
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
    * * Field Name: Outcome
    * * Display Name: Outcome
    * * SQL Data Type: nvarchar(MAX)
    */
    get Outcome(): string | null {
        return this.Get('Outcome');
    }
    set Outcome(value: string | null) {
        this.Set('Outcome', value);
    }

    /**
    * * Field Name: FollowUpRequired
    * * Display Name: Follow Up Required
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get FollowUpRequired(): boolean | null {
        return this.Get('FollowUpRequired');
    }
    set FollowUpRequired(value: boolean | null) {
        this.Set('FollowUpRequired', value);
    }

    /**
    * * Field Name: FollowUpDate
    * * Display Name: Follow Up Date
    * * SQL Data Type: date
    */
    get FollowUpDate(): Date | null {
        return this.Get('FollowUpDate');
    }
    set FollowUpDate(value: Date | null) {
        this.Set('FollowUpDate', value);
    }

    /**
    * * Field Name: Notes
    * * Display Name: Notes
    * * SQL Data Type: nvarchar(MAX)
    */
    get Notes(): string | null {
        return this.Get('Notes');
    }
    set Notes(value: string | null) {
        this.Set('Notes', value);
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
 * Board Members - strongly typed entity sub-class
 * * Schema: AssociationDemo
 * * Base Table: BoardMember
 * * Base View: vwBoardMembers
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Board Members')
export class AssociationDemoBoardMemberEntity extends BaseEntity<AssociationDemoBoardMemberEntityType> {
    /**
    * Loads the Board Members record from the database
    * @param ID: string - primary key value to load the Board Members record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AssociationDemoBoardMemberEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: BoardPositionID
    * * Display Name: Board Position ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Board Positions (vwBoardPositions.ID)
    */
    get BoardPositionID(): string {
        return this.Get('BoardPositionID');
    }
    set BoardPositionID(value: string) {
        this.Set('BoardPositionID', value);
    }

    /**
    * * Field Name: MemberID
    * * Display Name: Member ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Members (vwMembers.ID)
    */
    get MemberID(): string {
        return this.Get('MemberID');
    }
    set MemberID(value: string) {
        this.Set('MemberID', value);
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
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get IsActive(): boolean {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean) {
        this.Set('IsActive', value);
    }

    /**
    * * Field Name: ElectionDate
    * * Display Name: Election Date
    * * SQL Data Type: date
    */
    get ElectionDate(): Date | null {
        return this.Get('ElectionDate');
    }
    set ElectionDate(value: Date | null) {
        this.Set('ElectionDate', value);
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
 * Board Positions - strongly typed entity sub-class
 * * Schema: AssociationDemo
 * * Base Table: BoardPosition
 * * Base View: vwBoardPositions
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Board Positions')
export class AssociationDemoBoardPositionEntity extends BaseEntity<AssociationDemoBoardPositionEntityType> {
    /**
    * Loads the Board Positions record from the database
    * @param ID: string - primary key value to load the Board Positions record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AssociationDemoBoardPositionEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: PositionTitle
    * * Display Name: Position Title
    * * SQL Data Type: nvarchar(100)
    */
    get PositionTitle(): string {
        return this.Get('PositionTitle');
    }
    set PositionTitle(value: string) {
        this.Set('PositionTitle', value);
    }

    /**
    * * Field Name: PositionOrder
    * * Display Name: Position Order
    * * SQL Data Type: int
    */
    get PositionOrder(): number {
        return this.Get('PositionOrder');
    }
    set PositionOrder(value: number) {
        this.Set('PositionOrder', value);
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
    * * Field Name: TermLengthYears
    * * Display Name: Term Length Years
    * * SQL Data Type: int
    */
    get TermLengthYears(): number | null {
        return this.Get('TermLengthYears');
    }
    set TermLengthYears(value: number | null) {
        this.Set('TermLengthYears', value);
    }

    /**
    * * Field Name: IsOfficer
    * * Display Name: Is Officer
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get IsOfficer(): boolean {
        return this.Get('IsOfficer');
    }
    set IsOfficer(value: boolean) {
        this.Set('IsOfficer', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get IsActive(): boolean {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean) {
        this.Set('IsActive', value);
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
 * Campaign Members - strongly typed entity sub-class
 * * Schema: AssociationDemo
 * * Base Table: CampaignMember
 * * Base View: vwCampaignMembers
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Campaign Members')
export class AssociationDemoCampaignMemberEntity extends BaseEntity<AssociationDemoCampaignMemberEntityType> {
    /**
    * Loads the Campaign Members record from the database
    * @param ID: string - primary key value to load the Campaign Members record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AssociationDemoCampaignMemberEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: CampaignID
    * * Display Name: Campaign ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Campaigns (vwCampaigns.ID)
    */
    get CampaignID(): string {
        return this.Get('CampaignID');
    }
    set CampaignID(value: string) {
        this.Set('CampaignID', value);
    }

    /**
    * * Field Name: MemberID
    * * Display Name: Member ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Members (vwMembers.ID)
    */
    get MemberID(): string {
        return this.Get('MemberID');
    }
    set MemberID(value: string) {
        this.Set('MemberID', value);
    }

    /**
    * * Field Name: SegmentID
    * * Display Name: Segment ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Segments (vwSegments.ID)
    */
    get SegmentID(): string | null {
        return this.Get('SegmentID');
    }
    set SegmentID(value: string | null) {
        this.Set('SegmentID', value);
    }

    /**
    * * Field Name: AddedDate
    * * Display Name: Added Date
    * * SQL Data Type: datetime
    */
    get AddedDate(): Date {
        return this.Get('AddedDate');
    }
    set AddedDate(value: Date) {
        this.Set('AddedDate', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Converted
    *   * Opted Out
    *   * Responded
    *   * Sent
    *   * Targeted
    */
    get Status(): 'Converted' | 'Opted Out' | 'Responded' | 'Sent' | 'Targeted' {
        return this.Get('Status');
    }
    set Status(value: 'Converted' | 'Opted Out' | 'Responded' | 'Sent' | 'Targeted') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: ResponseDate
    * * Display Name: Response Date
    * * SQL Data Type: datetime
    */
    get ResponseDate(): Date | null {
        return this.Get('ResponseDate');
    }
    set ResponseDate(value: Date | null) {
        this.Set('ResponseDate', value);
    }

    /**
    * * Field Name: ConversionValue
    * * Display Name: Conversion Value
    * * SQL Data Type: decimal(12, 2)
    */
    get ConversionValue(): number | null {
        return this.Get('ConversionValue');
    }
    set ConversionValue(value: number | null) {
        this.Set('ConversionValue', value);
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
    * * Field Name: Campaign
    * * Display Name: Campaign
    * * SQL Data Type: nvarchar(255)
    */
    get Campaign(): string {
        return this.Get('Campaign');
    }

    /**
    * * Field Name: Segment
    * * Display Name: Segment
    * * SQL Data Type: nvarchar(255)
    */
    get Segment(): string | null {
        return this.Get('Segment');
    }
}


/**
 * Campaigns - strongly typed entity sub-class
 * * Schema: AssociationDemo
 * * Base Table: Campaign
 * * Base View: vwCampaigns
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Campaigns')
export class AssociationDemoCampaignEntity extends BaseEntity<AssociationDemoCampaignEntityType> {
    /**
    * Loads the Campaigns record from the database
    * @param ID: string - primary key value to load the Campaigns record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AssociationDemoCampaignEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(255)
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: CampaignType
    * * Display Name: Campaign Type
    * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Course Launch
    *   * Donation Drive
    *   * Email
    *   * Event Promotion
    *   * Member Engagement
    *   * Membership Renewal
    */
    get CampaignType(): 'Course Launch' | 'Donation Drive' | 'Email' | 'Event Promotion' | 'Member Engagement' | 'Membership Renewal' {
        return this.Get('CampaignType');
    }
    set CampaignType(value: 'Course Launch' | 'Donation Drive' | 'Email' | 'Event Promotion' | 'Member Engagement' | 'Membership Renewal') {
        this.Set('CampaignType', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Cancelled
    *   * Completed
    *   * Draft
    *   * Scheduled
    */
    get Status(): 'Active' | 'Cancelled' | 'Completed' | 'Draft' | 'Scheduled' {
        return this.Get('Status');
    }
    set Status(value: 'Active' | 'Cancelled' | 'Completed' | 'Draft' | 'Scheduled') {
        this.Set('Status', value);
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
    * * Field Name: Budget
    * * Display Name: Budget
    * * SQL Data Type: decimal(12, 2)
    */
    get Budget(): number | null {
        return this.Get('Budget');
    }
    set Budget(value: number | null) {
        this.Set('Budget', value);
    }

    /**
    * * Field Name: ActualCost
    * * Display Name: Actual Cost
    * * SQL Data Type: decimal(12, 2)
    */
    get ActualCost(): number | null {
        return this.Get('ActualCost');
    }
    set ActualCost(value: number | null) {
        this.Set('ActualCost', value);
    }

    /**
    * * Field Name: TargetAudience
    * * Display Name: Target Audience
    * * SQL Data Type: nvarchar(MAX)
    */
    get TargetAudience(): string | null {
        return this.Get('TargetAudience');
    }
    set TargetAudience(value: string | null) {
        this.Set('TargetAudience', value);
    }

    /**
    * * Field Name: Goals
    * * Display Name: Goals
    * * SQL Data Type: nvarchar(MAX)
    */
    get Goals(): string | null {
        return this.Get('Goals');
    }
    set Goals(value: string | null) {
        this.Set('Goals', value);
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
 * Certificates - strongly typed entity sub-class
 * * Schema: AssociationDemo
 * * Base Table: Certificate
 * * Base View: vwCertificates
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Certificates')
export class AssociationDemoCertificateEntity extends BaseEntity<AssociationDemoCertificateEntityType> {
    /**
    * Loads the Certificates record from the database
    * @param ID: string - primary key value to load the Certificates record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AssociationDemoCertificateEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: EnrollmentID
    * * Display Name: Enrollment ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Enrollments (vwEnrollments.ID)
    */
    get EnrollmentID(): string {
        return this.Get('EnrollmentID');
    }
    set EnrollmentID(value: string) {
        this.Set('EnrollmentID', value);
    }

    /**
    * * Field Name: CertificateNumber
    * * Display Name: Certificate Number
    * * SQL Data Type: nvarchar(50)
    */
    get CertificateNumber(): string {
        return this.Get('CertificateNumber');
    }
    set CertificateNumber(value: string) {
        this.Set('CertificateNumber', value);
    }

    /**
    * * Field Name: IssuedDate
    * * Display Name: Issued Date
    * * SQL Data Type: date
    */
    get IssuedDate(): Date {
        return this.Get('IssuedDate');
    }
    set IssuedDate(value: Date) {
        this.Set('IssuedDate', value);
    }

    /**
    * * Field Name: ExpirationDate
    * * Display Name: Expiration Date
    * * SQL Data Type: date
    */
    get ExpirationDate(): Date | null {
        return this.Get('ExpirationDate');
    }
    set ExpirationDate(value: Date | null) {
        this.Set('ExpirationDate', value);
    }

    /**
    * * Field Name: CertificatePDFURL
    * * Display Name: Certificate PDFURL
    * * SQL Data Type: nvarchar(500)
    */
    get CertificatePDFURL(): string | null {
        return this.Get('CertificatePDFURL');
    }
    set CertificatePDFURL(value: string | null) {
        this.Set('CertificatePDFURL', value);
    }

    /**
    * * Field Name: VerificationCode
    * * Display Name: Verification Code
    * * SQL Data Type: nvarchar(100)
    */
    get VerificationCode(): string | null {
        return this.Get('VerificationCode');
    }
    set VerificationCode(value: string | null) {
        this.Set('VerificationCode', value);
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
 * Certification Renewals - strongly typed entity sub-class
 * * Schema: AssociationDemo
 * * Base Table: CertificationRenewal
 * * Base View: vwCertificationRenewals
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Certification Renewals')
export class AssociationDemoCertificationRenewalEntity extends BaseEntity<AssociationDemoCertificationRenewalEntityType> {
    /**
    * Loads the Certification Renewals record from the database
    * @param ID: string - primary key value to load the Certification Renewals record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AssociationDemoCertificationRenewalEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: CertificationID
    * * Display Name: Certification ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Certifications (vwCertifications.ID)
    */
    get CertificationID(): string {
        return this.Get('CertificationID');
    }
    set CertificationID(value: string) {
        this.Set('CertificationID', value);
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
    * * Field Name: ExpirationDate
    * * Display Name: Expiration Date
    * * SQL Data Type: date
    */
    get ExpirationDate(): Date {
        return this.Get('ExpirationDate');
    }
    set ExpirationDate(value: Date) {
        this.Set('ExpirationDate', value);
    }

    /**
    * * Field Name: CECreditsApplied
    * * Display Name: CE Credits Applied
    * * SQL Data Type: int
    * * Default Value: 0
    */
    get CECreditsApplied(): number | null {
        return this.Get('CECreditsApplied');
    }
    set CECreditsApplied(value: number | null) {
        this.Set('CECreditsApplied', value);
    }

    /**
    * * Field Name: FeePaid
    * * Display Name: Fee Paid
    * * SQL Data Type: decimal(10, 2)
    */
    get FeePaid(): number | null {
        return this.Get('FeePaid');
    }
    set FeePaid(value: number | null) {
        this.Set('FeePaid', value);
    }

    /**
    * * Field Name: PaymentDate
    * * Display Name: Payment Date
    * * SQL Data Type: date
    */
    get PaymentDate(): Date | null {
        return this.Get('PaymentDate');
    }
    set PaymentDate(value: Date | null) {
        this.Set('PaymentDate', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Completed
    * * Value List Type: List
    * * Possible Values 
    *   * Completed
    *   * Late
    *   * Pending
    *   * Rejected
    */
    get Status(): 'Completed' | 'Late' | 'Pending' | 'Rejected' | null {
        return this.Get('Status');
    }
    set Status(value: 'Completed' | 'Late' | 'Pending' | 'Rejected' | null) {
        this.Set('Status', value);
    }

    /**
    * * Field Name: Notes
    * * Display Name: Notes
    * * SQL Data Type: nvarchar(MAX)
    */
    get Notes(): string | null {
        return this.Get('Notes');
    }
    set Notes(value: string | null) {
        this.Set('Notes', value);
    }

    /**
    * * Field Name: ProcessedBy
    * * Display Name: Processed By
    * * SQL Data Type: nvarchar(255)
    */
    get ProcessedBy(): string | null {
        return this.Get('ProcessedBy');
    }
    set ProcessedBy(value: string | null) {
        this.Set('ProcessedBy', value);
    }

    /**
    * * Field Name: ProcessedDate
    * * Display Name: Processed Date
    * * SQL Data Type: date
    */
    get ProcessedDate(): Date | null {
        return this.Get('ProcessedDate');
    }
    set ProcessedDate(value: Date | null) {
        this.Set('ProcessedDate', value);
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
 * Certification Requirements - strongly typed entity sub-class
 * * Schema: AssociationDemo
 * * Base Table: CertificationRequirement
 * * Base View: vwCertificationRequirements
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Certification Requirements')
export class AssociationDemoCertificationRequirementEntity extends BaseEntity<AssociationDemoCertificationRequirementEntityType> {
    /**
    * Loads the Certification Requirements record from the database
    * @param ID: string - primary key value to load the Certification Requirements record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AssociationDemoCertificationRequirementEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: CertificationTypeID
    * * Display Name: Certification Type ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Certification Types (vwCertificationTypes.ID)
    */
    get CertificationTypeID(): string {
        return this.Get('CertificationTypeID');
    }
    set CertificationTypeID(value: string) {
        this.Set('CertificationTypeID', value);
    }

    /**
    * * Field Name: RequirementType
    * * Display Name: Requirement Type
    * * SQL Data Type: nvarchar(100)
    * * Value List Type: List
    * * Possible Values 
    *   * Documentation
    *   * Education
    *   * Examination
    *   * Experience
    *   * Other
    *   * Prerequisites
    *   * Reference
    *   * Training
    */
    get RequirementType(): 'Documentation' | 'Education' | 'Examination' | 'Experience' | 'Other' | 'Prerequisites' | 'Reference' | 'Training' {
        return this.Get('RequirementType');
    }
    set RequirementType(value: 'Documentation' | 'Education' | 'Examination' | 'Experience' | 'Other' | 'Prerequisites' | 'Reference' | 'Training') {
        this.Set('RequirementType', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(MAX)
    */
    get Description(): string {
        return this.Get('Description');
    }
    set Description(value: string) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: IsRequired
    * * Display Name: Is Required
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get IsRequired(): boolean | null {
        return this.Get('IsRequired');
    }
    set IsRequired(value: boolean | null) {
        this.Set('IsRequired', value);
    }

    /**
    * * Field Name: DisplayOrder
    * * Display Name: Display Order
    * * SQL Data Type: int
    * * Default Value: 0
    */
    get DisplayOrder(): number | null {
        return this.Get('DisplayOrder');
    }
    set DisplayOrder(value: number | null) {
        this.Set('DisplayOrder', value);
    }

    /**
    * * Field Name: Details
    * * Display Name: Details
    * * SQL Data Type: nvarchar(MAX)
    */
    get Details(): string | null {
        return this.Get('Details');
    }
    set Details(value: string | null) {
        this.Set('Details', value);
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
    * * Field Name: CertificationType
    * * Display Name: Certification Type
    * * SQL Data Type: nvarchar(255)
    */
    get CertificationType(): string {
        return this.Get('CertificationType');
    }
}


/**
 * Certification Types - strongly typed entity sub-class
 * * Schema: AssociationDemo
 * * Base Table: CertificationType
 * * Base View: vwCertificationTypes
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Certification Types')
export class AssociationDemoCertificationTypeEntity extends BaseEntity<AssociationDemoCertificationTypeEntityType> {
    /**
    * Loads the Certification Types record from the database
    * @param ID: string - primary key value to load the Certification Types record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AssociationDemoCertificationTypeEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: AccreditingBodyID
    * * Display Name: Accrediting Body ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Accrediting Bodies (vwAccreditingBodies.ID)
    */
    get AccreditingBodyID(): string {
        return this.Get('AccreditingBodyID');
    }
    set AccreditingBodyID(value: string) {
        this.Set('AccreditingBodyID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(255)
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Abbreviation
    * * Display Name: Abbreviation
    * * SQL Data Type: nvarchar(50)
    */
    get Abbreviation(): string | null {
        return this.Get('Abbreviation');
    }
    set Abbreviation(value: string | null) {
        this.Set('Abbreviation', value);
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
    * * Field Name: Level
    * * Display Name: Level
    * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Advanced
    *   * Entry
    *   * Intermediate
    *   * Master
    *   * Specialty
    */
    get Level(): 'Advanced' | 'Entry' | 'Intermediate' | 'Master' | 'Specialty' | null {
        return this.Get('Level');
    }
    set Level(value: 'Advanced' | 'Entry' | 'Intermediate' | 'Master' | 'Specialty' | null) {
        this.Set('Level', value);
    }

    /**
    * * Field Name: DurationMonths
    * * Display Name: Duration Months
    * * SQL Data Type: int
    */
    get DurationMonths(): number | null {
        return this.Get('DurationMonths');
    }
    set DurationMonths(value: number | null) {
        this.Set('DurationMonths', value);
    }

    /**
    * * Field Name: RenewalRequiredMonths
    * * Display Name: Renewal Required Months
    * * SQL Data Type: int
    */
    get RenewalRequiredMonths(): number | null {
        return this.Get('RenewalRequiredMonths');
    }
    set RenewalRequiredMonths(value: number | null) {
        this.Set('RenewalRequiredMonths', value);
    }

    /**
    * * Field Name: CECreditsRequired
    * * Display Name: CE Credits Required
    * * SQL Data Type: int
    * * Default Value: 0
    */
    get CECreditsRequired(): number | null {
        return this.Get('CECreditsRequired');
    }
    set CECreditsRequired(value: number | null) {
        this.Set('CECreditsRequired', value);
    }

    /**
    * * Field Name: ExamRequired
    * * Display Name: Exam Required
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get ExamRequired(): boolean | null {
        return this.Get('ExamRequired');
    }
    set ExamRequired(value: boolean | null) {
        this.Set('ExamRequired', value);
    }

    /**
    * * Field Name: PracticalRequired
    * * Display Name: Practical Required
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get PracticalRequired(): boolean | null {
        return this.Get('PracticalRequired');
    }
    set PracticalRequired(value: boolean | null) {
        this.Set('PracticalRequired', value);
    }

    /**
    * * Field Name: CostUSD
    * * Display Name: Cost USD
    * * SQL Data Type: decimal(10, 2)
    */
    get CostUSD(): number | null {
        return this.Get('CostUSD');
    }
    set CostUSD(value: number | null) {
        this.Set('CostUSD', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get IsActive(): boolean | null {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean | null) {
        this.Set('IsActive', value);
    }

    /**
    * * Field Name: Prerequisites
    * * Display Name: Prerequisites
    * * SQL Data Type: nvarchar(MAX)
    */
    get Prerequisites(): string | null {
        return this.Get('Prerequisites');
    }
    set Prerequisites(value: string | null) {
        this.Set('Prerequisites', value);
    }

    /**
    * * Field Name: TargetAudience
    * * Display Name: Target Audience
    * * SQL Data Type: nvarchar(500)
    */
    get TargetAudience(): string | null {
        return this.Get('TargetAudience');
    }
    set TargetAudience(value: string | null) {
        this.Set('TargetAudience', value);
    }

    /**
    * * Field Name: CertificationCount
    * * Display Name: Certification Count
    * * SQL Data Type: int
    * * Default Value: 0
    */
    get CertificationCount(): number | null {
        return this.Get('CertificationCount');
    }
    set CertificationCount(value: number | null) {
        this.Set('CertificationCount', value);
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
    * * Field Name: AccreditingBody
    * * Display Name: Accrediting Body
    * * SQL Data Type: nvarchar(255)
    */
    get AccreditingBody(): string {
        return this.Get('AccreditingBody');
    }
}


/**
 * Certifications - strongly typed entity sub-class
 * * Schema: AssociationDemo
 * * Base Table: Certification
 * * Base View: vwCertifications
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Certifications')
export class AssociationDemoCertificationEntity extends BaseEntity<AssociationDemoCertificationEntityType> {
    /**
    * Loads the Certifications record from the database
    * @param ID: string - primary key value to load the Certifications record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AssociationDemoCertificationEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: MemberID
    * * Display Name: Member ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Members (vwMembers.ID)
    */
    get MemberID(): string {
        return this.Get('MemberID');
    }
    set MemberID(value: string) {
        this.Set('MemberID', value);
    }

    /**
    * * Field Name: CertificationTypeID
    * * Display Name: Certification Type ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Certification Types (vwCertificationTypes.ID)
    */
    get CertificationTypeID(): string {
        return this.Get('CertificationTypeID');
    }
    set CertificationTypeID(value: string) {
        this.Set('CertificationTypeID', value);
    }

    /**
    * * Field Name: CertificationNumber
    * * Display Name: Certification Number
    * * SQL Data Type: nvarchar(100)
    */
    get CertificationNumber(): string | null {
        return this.Get('CertificationNumber');
    }
    set CertificationNumber(value: string | null) {
        this.Set('CertificationNumber', value);
    }

    /**
    * * Field Name: DateEarned
    * * Display Name: Date Earned
    * * SQL Data Type: date
    */
    get DateEarned(): Date {
        return this.Get('DateEarned');
    }
    set DateEarned(value: Date) {
        this.Set('DateEarned', value);
    }

    /**
    * * Field Name: DateExpires
    * * Display Name: Date Expires
    * * SQL Data Type: date
    */
    get DateExpires(): Date | null {
        return this.Get('DateExpires');
    }
    set DateExpires(value: Date | null) {
        this.Set('DateExpires', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Expired
    *   * In Progress
    *   * Pending Renewal
    *   * Revoked
    *   * Suspended
    */
    get Status(): 'Active' | 'Expired' | 'In Progress' | 'Pending Renewal' | 'Revoked' | 'Suspended' | null {
        return this.Get('Status');
    }
    set Status(value: 'Active' | 'Expired' | 'In Progress' | 'Pending Renewal' | 'Revoked' | 'Suspended' | null) {
        this.Set('Status', value);
    }

    /**
    * * Field Name: Score
    * * Display Name: Score
    * * SQL Data Type: int
    */
    get Score(): number | null {
        return this.Get('Score');
    }
    set Score(value: number | null) {
        this.Set('Score', value);
    }

    /**
    * * Field Name: Notes
    * * Display Name: Notes
    * * SQL Data Type: nvarchar(MAX)
    */
    get Notes(): string | null {
        return this.Get('Notes');
    }
    set Notes(value: string | null) {
        this.Set('Notes', value);
    }

    /**
    * * Field Name: VerificationURL
    * * Display Name: Verification URL
    * * SQL Data Type: nvarchar(500)
    */
    get VerificationURL(): string | null {
        return this.Get('VerificationURL');
    }
    set VerificationURL(value: string | null) {
        this.Set('VerificationURL', value);
    }

    /**
    * * Field Name: IssuedBy
    * * Display Name: Issued By
    * * SQL Data Type: nvarchar(255)
    */
    get IssuedBy(): string | null {
        return this.Get('IssuedBy');
    }
    set IssuedBy(value: string | null) {
        this.Set('IssuedBy', value);
    }

    /**
    * * Field Name: LastRenewalDate
    * * Display Name: Last Renewal Date
    * * SQL Data Type: date
    */
    get LastRenewalDate(): Date | null {
        return this.Get('LastRenewalDate');
    }
    set LastRenewalDate(value: Date | null) {
        this.Set('LastRenewalDate', value);
    }

    /**
    * * Field Name: NextRenewalDate
    * * Display Name: Next Renewal Date
    * * SQL Data Type: date
    */
    get NextRenewalDate(): Date | null {
        return this.Get('NextRenewalDate');
    }
    set NextRenewalDate(value: Date | null) {
        this.Set('NextRenewalDate', value);
    }

    /**
    * * Field Name: CECreditsEarned
    * * Display Name: CE Credits Earned
    * * SQL Data Type: int
    * * Default Value: 0
    */
    get CECreditsEarned(): number | null {
        return this.Get('CECreditsEarned');
    }
    set CECreditsEarned(value: number | null) {
        this.Set('CECreditsEarned', value);
    }

    /**
    * * Field Name: RenewalCount
    * * Display Name: Renewal Count
    * * SQL Data Type: int
    * * Default Value: 0
    */
    get RenewalCount(): number | null {
        return this.Get('RenewalCount');
    }
    set RenewalCount(value: number | null) {
        this.Set('RenewalCount', value);
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
    * * Field Name: CertificationType
    * * Display Name: Certification Type
    * * SQL Data Type: nvarchar(255)
    */
    get CertificationType(): string {
        return this.Get('CertificationType');
    }
}


/**
 * Chapter Memberships - strongly typed entity sub-class
 * * Schema: AssociationDemo
 * * Base Table: ChapterMembership
 * * Base View: vwChapterMemberships
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Chapter Memberships')
export class AssociationDemoChapterMembershipEntity extends BaseEntity<AssociationDemoChapterMembershipEntityType> {
    /**
    * Loads the Chapter Memberships record from the database
    * @param ID: string - primary key value to load the Chapter Memberships record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AssociationDemoChapterMembershipEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: ChapterID
    * * Display Name: Chapter ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Chapters (vwChapters.ID)
    */
    get ChapterID(): string {
        return this.Get('ChapterID');
    }
    set ChapterID(value: string) {
        this.Set('ChapterID', value);
    }

    /**
    * * Field Name: MemberID
    * * Display Name: Member ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Members (vwMembers.ID)
    */
    get MemberID(): string {
        return this.Get('MemberID');
    }
    set MemberID(value: string) {
        this.Set('MemberID', value);
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
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Inactive
    */
    get Status(): 'Active' | 'Inactive' {
        return this.Get('Status');
    }
    set Status(value: 'Active' | 'Inactive') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: Role
    * * Display Name: Role
    * * SQL Data Type: nvarchar(100)
    */
    get Role(): string | null {
        return this.Get('Role');
    }
    set Role(value: string | null) {
        this.Set('Role', value);
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
    * * Field Name: Chapter
    * * Display Name: Chapter
    * * SQL Data Type: nvarchar(255)
    */
    get Chapter(): string {
        return this.Get('Chapter');
    }
}


/**
 * Chapter Officers - strongly typed entity sub-class
 * * Schema: AssociationDemo
 * * Base Table: ChapterOfficer
 * * Base View: vwChapterOfficers
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Chapter Officers')
export class AssociationDemoChapterOfficerEntity extends BaseEntity<AssociationDemoChapterOfficerEntityType> {
    /**
    * Loads the Chapter Officers record from the database
    * @param ID: string - primary key value to load the Chapter Officers record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AssociationDemoChapterOfficerEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: ChapterID
    * * Display Name: Chapter ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Chapters (vwChapters.ID)
    */
    get ChapterID(): string {
        return this.Get('ChapterID');
    }
    set ChapterID(value: string) {
        this.Set('ChapterID', value);
    }

    /**
    * * Field Name: MemberID
    * * Display Name: Member ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Members (vwMembers.ID)
    */
    get MemberID(): string {
        return this.Get('MemberID');
    }
    set MemberID(value: string) {
        this.Set('MemberID', value);
    }

    /**
    * * Field Name: Position
    * * Display Name: Position
    * * SQL Data Type: nvarchar(100)
    */
    get Position(): string {
        return this.Get('Position');
    }
    set Position(value: string) {
        this.Set('Position', value);
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
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get IsActive(): boolean {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean) {
        this.Set('IsActive', value);
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
    * * Field Name: Chapter
    * * Display Name: Chapter
    * * SQL Data Type: nvarchar(255)
    */
    get Chapter(): string {
        return this.Get('Chapter');
    }
}


/**
 * Chapters - strongly typed entity sub-class
 * * Schema: AssociationDemo
 * * Base Table: Chapter
 * * Base View: vwChapters
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Chapters')
export class AssociationDemoChapterEntity extends BaseEntity<AssociationDemoChapterEntityType> {
    /**
    * Loads the Chapters record from the database
    * @param ID: string - primary key value to load the Chapters record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AssociationDemoChapterEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(255)
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: ChapterType
    * * Display Name: Chapter Type
    * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Geographic
    *   * Industry
    *   * Special Interest
    */
    get ChapterType(): 'Geographic' | 'Industry' | 'Special Interest' {
        return this.Get('ChapterType');
    }
    set ChapterType(value: 'Geographic' | 'Industry' | 'Special Interest') {
        this.Set('ChapterType', value);
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
    * * SQL Data Type: nvarchar(50)
    */
    get State(): string | null {
        return this.Get('State');
    }
    set State(value: string | null) {
        this.Set('State', value);
    }

    /**
    * * Field Name: Country
    * * Display Name: Country
    * * SQL Data Type: nvarchar(100)
    * * Default Value: United States
    */
    get Country(): string | null {
        return this.Get('Country');
    }
    set Country(value: string | null) {
        this.Set('Country', value);
    }

    /**
    * * Field Name: FoundedDate
    * * Display Name: Founded Date
    * * SQL Data Type: date
    */
    get FoundedDate(): Date | null {
        return this.Get('FoundedDate');
    }
    set FoundedDate(value: Date | null) {
        this.Set('FoundedDate', value);
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
    * * Field Name: Website
    * * Display Name: Website
    * * SQL Data Type: nvarchar(500)
    */
    get Website(): string | null {
        return this.Get('Website');
    }
    set Website(value: string | null) {
        this.Set('Website', value);
    }

    /**
    * * Field Name: Email
    * * Display Name: Email
    * * SQL Data Type: nvarchar(255)
    */
    get Email(): string | null {
        return this.Get('Email');
    }
    set Email(value: string | null) {
        this.Set('Email', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get IsActive(): boolean {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean) {
        this.Set('IsActive', value);
    }

    /**
    * * Field Name: MeetingFrequency
    * * Display Name: Meeting Frequency
    * * SQL Data Type: nvarchar(100)
    */
    get MeetingFrequency(): string | null {
        return this.Get('MeetingFrequency');
    }
    set MeetingFrequency(value: string | null) {
        this.Set('MeetingFrequency', value);
    }

    /**
    * * Field Name: MemberCount
    * * Display Name: Member Count
    * * SQL Data Type: int
    */
    get MemberCount(): number | null {
        return this.Get('MemberCount');
    }
    set MemberCount(value: number | null) {
        this.Set('MemberCount', value);
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
 * Committee Memberships - strongly typed entity sub-class
 * * Schema: AssociationDemo
 * * Base Table: CommitteeMembership
 * * Base View: vwCommitteeMemberships
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Committee Memberships')
export class AssociationDemoCommitteeMembershipEntity extends BaseEntity<AssociationDemoCommitteeMembershipEntityType> {
    /**
    * Loads the Committee Memberships record from the database
    * @param ID: string - primary key value to load the Committee Memberships record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AssociationDemoCommitteeMembershipEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: CommitteeID
    * * Display Name: Committee ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Committees (vwCommittees.ID)
    */
    get CommitteeID(): string {
        return this.Get('CommitteeID');
    }
    set CommitteeID(value: string) {
        this.Set('CommitteeID', value);
    }

    /**
    * * Field Name: MemberID
    * * Display Name: Member ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Members (vwMembers.ID)
    */
    get MemberID(): string {
        return this.Get('MemberID');
    }
    set MemberID(value: string) {
        this.Set('MemberID', value);
    }

    /**
    * * Field Name: Role
    * * Display Name: Role
    * * SQL Data Type: nvarchar(100)
    */
    get Role(): string {
        return this.Get('Role');
    }
    set Role(value: string) {
        this.Set('Role', value);
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
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get IsActive(): boolean {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean) {
        this.Set('IsActive', value);
    }

    /**
    * * Field Name: AppointedBy
    * * Display Name: Appointed By
    * * SQL Data Type: nvarchar(255)
    */
    get AppointedBy(): string | null {
        return this.Get('AppointedBy');
    }
    set AppointedBy(value: string | null) {
        this.Set('AppointedBy', value);
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
    * * Field Name: Committee
    * * Display Name: Committee
    * * SQL Data Type: nvarchar(255)
    */
    get Committee(): string {
        return this.Get('Committee');
    }
}


/**
 * Committees - strongly typed entity sub-class
 * * Schema: AssociationDemo
 * * Base Table: Committee
 * * Base View: vwCommittees
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Committees')
export class AssociationDemoCommitteeEntity extends BaseEntity<AssociationDemoCommitteeEntityType> {
    /**
    * Loads the Committees record from the database
    * @param ID: string - primary key value to load the Committees record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AssociationDemoCommitteeEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(255)
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: CommitteeType
    * * Display Name: Committee Type
    * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Ad Hoc
    *   * Standing
    *   * Task Force
    */
    get CommitteeType(): 'Ad Hoc' | 'Standing' | 'Task Force' {
        return this.Get('CommitteeType');
    }
    set CommitteeType(value: 'Ad Hoc' | 'Standing' | 'Task Force') {
        this.Set('CommitteeType', value);
    }

    /**
    * * Field Name: Purpose
    * * Display Name: Purpose
    * * SQL Data Type: nvarchar(MAX)
    */
    get Purpose(): string | null {
        return this.Get('Purpose');
    }
    set Purpose(value: string | null) {
        this.Set('Purpose', value);
    }

    /**
    * * Field Name: MeetingFrequency
    * * Display Name: Meeting Frequency
    * * SQL Data Type: nvarchar(100)
    */
    get MeetingFrequency(): string | null {
        return this.Get('MeetingFrequency');
    }
    set MeetingFrequency(value: string | null) {
        this.Set('MeetingFrequency', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get IsActive(): boolean {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean) {
        this.Set('IsActive', value);
    }

    /**
    * * Field Name: FormedDate
    * * Display Name: Formed Date
    * * SQL Data Type: date
    */
    get FormedDate(): Date | null {
        return this.Get('FormedDate');
    }
    set FormedDate(value: Date | null) {
        this.Set('FormedDate', value);
    }

    /**
    * * Field Name: DisbandedDate
    * * Display Name: Disbanded Date
    * * SQL Data Type: date
    */
    get DisbandedDate(): Date | null {
        return this.Get('DisbandedDate');
    }
    set DisbandedDate(value: Date | null) {
        this.Set('DisbandedDate', value);
    }

    /**
    * * Field Name: ChairMemberID
    * * Display Name: Chair Member ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Members (vwMembers.ID)
    */
    get ChairMemberID(): string | null {
        return this.Get('ChairMemberID');
    }
    set ChairMemberID(value: string | null) {
        this.Set('ChairMemberID', value);
    }

    /**
    * * Field Name: MaxMembers
    * * Display Name: Max Members
    * * SQL Data Type: int
    */
    get MaxMembers(): number | null {
        return this.Get('MaxMembers');
    }
    set MaxMembers(value: number | null) {
        this.Set('MaxMembers', value);
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
 * Competition Entries - strongly typed entity sub-class
 * * Schema: AssociationDemo
 * * Base Table: CompetitionEntry
 * * Base View: vwCompetitionEntries
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Competition Entries')
export class AssociationDemoCompetitionEntryEntity extends BaseEntity<AssociationDemoCompetitionEntryEntityType> {
    /**
    * Loads the Competition Entries record from the database
    * @param ID: string - primary key value to load the Competition Entries record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AssociationDemoCompetitionEntryEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: CompetitionID
    * * Display Name: Competition ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Competitions (vwCompetitions.ID)
    */
    get CompetitionID(): string {
        return this.Get('CompetitionID');
    }
    set CompetitionID(value: string) {
        this.Set('CompetitionID', value);
    }

    /**
    * * Field Name: ProductID
    * * Display Name: Product ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Products (vwProducts.ID)
    */
    get ProductID(): string {
        return this.Get('ProductID');
    }
    set ProductID(value: string) {
        this.Set('ProductID', value);
    }

    /**
    * * Field Name: CategoryID
    * * Display Name: Category ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Product Categories (vwProductCategories.ID)
    */
    get CategoryID(): string {
        return this.Get('CategoryID');
    }
    set CategoryID(value: string) {
        this.Set('CategoryID', value);
    }

    /**
    * * Field Name: EntryNumber
    * * Display Name: Entry Number
    * * SQL Data Type: nvarchar(50)
    */
    get EntryNumber(): string | null {
        return this.Get('EntryNumber');
    }
    set EntryNumber(value: string | null) {
        this.Set('EntryNumber', value);
    }

    /**
    * * Field Name: SubmittedDate
    * * Display Name: Submitted Date
    * * SQL Data Type: date
    */
    get SubmittedDate(): Date {
        return this.Get('SubmittedDate');
    }
    set SubmittedDate(value: Date) {
        this.Set('SubmittedDate', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Submitted
    * * Value List Type: List
    * * Possible Values 
    *   * Accepted
    *   * Disqualified
    *   * Finalist
    *   * Judged
    *   * Rejected
    *   * Submitted
    *   * Winner
    */
    get Status(): 'Accepted' | 'Disqualified' | 'Finalist' | 'Judged' | 'Rejected' | 'Submitted' | 'Winner' | null {
        return this.Get('Status');
    }
    set Status(value: 'Accepted' | 'Disqualified' | 'Finalist' | 'Judged' | 'Rejected' | 'Submitted' | 'Winner' | null) {
        this.Set('Status', value);
    }

    /**
    * * Field Name: Score
    * * Display Name: Score
    * * SQL Data Type: decimal(5, 2)
    */
    get Score(): number | null {
        return this.Get('Score');
    }
    set Score(value: number | null) {
        this.Set('Score', value);
    }

    /**
    * * Field Name: Ranking
    * * Display Name: Ranking
    * * SQL Data Type: int
    */
    get Ranking(): number | null {
        return this.Get('Ranking');
    }
    set Ranking(value: number | null) {
        this.Set('Ranking', value);
    }

    /**
    * * Field Name: AwardLevel
    * * Display Name: Award Level
    * * SQL Data Type: nvarchar(100)
    * * Value List Type: List
    * * Possible Values 
    *   * Best in Show
    *   * Bronze
    *   * Finalist
    *   * Gold
    *   * Honorable Mention
    *   * None
    *   * Silver
    */
    get AwardLevel(): 'Best in Show' | 'Bronze' | 'Finalist' | 'Gold' | 'Honorable Mention' | 'None' | 'Silver' | null {
        return this.Get('AwardLevel');
    }
    set AwardLevel(value: 'Best in Show' | 'Bronze' | 'Finalist' | 'Gold' | 'Honorable Mention' | 'None' | 'Silver' | null) {
        this.Set('AwardLevel', value);
    }

    /**
    * * Field Name: JudgingNotes
    * * Display Name: Judging Notes
    * * SQL Data Type: nvarchar(MAX)
    */
    get JudgingNotes(): string | null {
        return this.Get('JudgingNotes');
    }
    set JudgingNotes(value: string | null) {
        this.Set('JudgingNotes', value);
    }

    /**
    * * Field Name: FeedbackProvided
    * * Display Name: Feedback Provided
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get FeedbackProvided(): boolean | null {
        return this.Get('FeedbackProvided');
    }
    set FeedbackProvided(value: boolean | null) {
        this.Set('FeedbackProvided', value);
    }

    /**
    * * Field Name: EntryFee
    * * Display Name: Entry Fee
    * * SQL Data Type: decimal(10, 2)
    */
    get EntryFee(): number | null {
        return this.Get('EntryFee');
    }
    set EntryFee(value: number | null) {
        this.Set('EntryFee', value);
    }

    /**
    * * Field Name: PaymentStatus
    * * Display Name: Payment Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Unpaid
    * * Value List Type: List
    * * Possible Values 
    *   * Paid
    *   * Refunded
    *   * Unpaid
    *   * Waived
    */
    get PaymentStatus(): 'Paid' | 'Refunded' | 'Unpaid' | 'Waived' | null {
        return this.Get('PaymentStatus');
    }
    set PaymentStatus(value: 'Paid' | 'Refunded' | 'Unpaid' | 'Waived' | null) {
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

    /**
    * * Field Name: Competition
    * * Display Name: Competition
    * * SQL Data Type: nvarchar(255)
    */
    get Competition(): string {
        return this.Get('Competition');
    }

    /**
    * * Field Name: Product
    * * Display Name: Product
    * * SQL Data Type: nvarchar(255)
    */
    get Product(): string {
        return this.Get('Product');
    }

    /**
    * * Field Name: Category
    * * Display Name: Category
    * * SQL Data Type: nvarchar(255)
    */
    get Category(): string {
        return this.Get('Category');
    }
}


/**
 * Competition Judges - strongly typed entity sub-class
 * * Schema: AssociationDemo
 * * Base Table: CompetitionJudge
 * * Base View: vwCompetitionJudges
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Competition Judges')
export class AssociationDemoCompetitionJudgeEntity extends BaseEntity<AssociationDemoCompetitionJudgeEntityType> {
    /**
    * Loads the Competition Judges record from the database
    * @param ID: string - primary key value to load the Competition Judges record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AssociationDemoCompetitionJudgeEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: CompetitionID
    * * Display Name: Competition ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Competitions (vwCompetitions.ID)
    */
    get CompetitionID(): string {
        return this.Get('CompetitionID');
    }
    set CompetitionID(value: string) {
        this.Set('CompetitionID', value);
    }

    /**
    * * Field Name: MemberID
    * * Display Name: Member ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Members (vwMembers.ID)
    */
    get MemberID(): string | null {
        return this.Get('MemberID');
    }
    set MemberID(value: string | null) {
        this.Set('MemberID', value);
    }

    /**
    * * Field Name: FirstName
    * * Display Name: First Name
    * * SQL Data Type: nvarchar(100)
    */
    get FirstName(): string {
        return this.Get('FirstName');
    }
    set FirstName(value: string) {
        this.Set('FirstName', value);
    }

    /**
    * * Field Name: LastName
    * * Display Name: Last Name
    * * SQL Data Type: nvarchar(100)
    */
    get LastName(): string {
        return this.Get('LastName');
    }
    set LastName(value: string) {
        this.Set('LastName', value);
    }

    /**
    * * Field Name: Email
    * * Display Name: Email
    * * SQL Data Type: nvarchar(255)
    */
    get Email(): string | null {
        return this.Get('Email');
    }
    set Email(value: string | null) {
        this.Set('Email', value);
    }

    /**
    * * Field Name: Organization
    * * Display Name: Organization
    * * SQL Data Type: nvarchar(255)
    */
    get Organization(): string | null {
        return this.Get('Organization');
    }
    set Organization(value: string | null) {
        this.Set('Organization', value);
    }

    /**
    * * Field Name: Credentials
    * * Display Name: Credentials
    * * SQL Data Type: nvarchar(MAX)
    */
    get Credentials(): string | null {
        return this.Get('Credentials');
    }
    set Credentials(value: string | null) {
        this.Set('Credentials', value);
    }

    /**
    * * Field Name: YearsExperience
    * * Display Name: Years Experience
    * * SQL Data Type: int
    */
    get YearsExperience(): number | null {
        return this.Get('YearsExperience');
    }
    set YearsExperience(value: number | null) {
        this.Set('YearsExperience', value);
    }

    /**
    * * Field Name: Specialty
    * * Display Name: Specialty
    * * SQL Data Type: nvarchar(255)
    */
    get Specialty(): string | null {
        return this.Get('Specialty');
    }
    set Specialty(value: string | null) {
        this.Set('Specialty', value);
    }

    /**
    * * Field Name: Role
    * * Display Name: Role
    * * SQL Data Type: nvarchar(100)
    * * Value List Type: List
    * * Possible Values 
    *   * Assistant Judge
    *   * Head Judge
    *   * Sensory Judge
    *   * Technical Judge
    *   * Trainee
    */
    get Role(): 'Assistant Judge' | 'Head Judge' | 'Sensory Judge' | 'Technical Judge' | 'Trainee' | null {
        return this.Get('Role');
    }
    set Role(value: 'Assistant Judge' | 'Head Judge' | 'Sensory Judge' | 'Technical Judge' | 'Trainee' | null) {
        this.Set('Role', value);
    }

    /**
    * * Field Name: AssignedCategories
    * * Display Name: Assigned Categories
    * * SQL Data Type: nvarchar(MAX)
    */
    get AssignedCategories(): string | null {
        return this.Get('AssignedCategories');
    }
    set AssignedCategories(value: string | null) {
        this.Set('AssignedCategories', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Confirmed
    * * Value List Type: List
    * * Possible Values 
    *   * Completed
    *   * Confirmed
    *   * Declined
    *   * Invited
    *   * Removed
    */
    get Status(): 'Completed' | 'Confirmed' | 'Declined' | 'Invited' | 'Removed' | null {
        return this.Get('Status');
    }
    set Status(value: 'Completed' | 'Confirmed' | 'Declined' | 'Invited' | 'Removed' | null) {
        this.Set('Status', value);
    }

    /**
    * * Field Name: InvitedDate
    * * Display Name: Invited Date
    * * SQL Data Type: date
    */
    get InvitedDate(): Date | null {
        return this.Get('InvitedDate');
    }
    set InvitedDate(value: Date | null) {
        this.Set('InvitedDate', value);
    }

    /**
    * * Field Name: ConfirmedDate
    * * Display Name: Confirmed Date
    * * SQL Data Type: date
    */
    get ConfirmedDate(): Date | null {
        return this.Get('ConfirmedDate');
    }
    set ConfirmedDate(value: Date | null) {
        this.Set('ConfirmedDate', value);
    }

    /**
    * * Field Name: CompensationAmount
    * * Display Name: Compensation Amount
    * * SQL Data Type: decimal(10, 2)
    */
    get CompensationAmount(): number | null {
        return this.Get('CompensationAmount');
    }
    set CompensationAmount(value: number | null) {
        this.Set('CompensationAmount', value);
    }

    /**
    * * Field Name: Notes
    * * Display Name: Notes
    * * SQL Data Type: nvarchar(MAX)
    */
    get Notes(): string | null {
        return this.Get('Notes');
    }
    set Notes(value: string | null) {
        this.Set('Notes', value);
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
    * * Field Name: Competition
    * * Display Name: Competition
    * * SQL Data Type: nvarchar(255)
    */
    get Competition(): string {
        return this.Get('Competition');
    }
}


/**
 * Competitions - strongly typed entity sub-class
 * * Schema: AssociationDemo
 * * Base Table: Competition
 * * Base View: vwCompetitions
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Competitions')
export class AssociationDemoCompetitionEntity extends BaseEntity<AssociationDemoCompetitionEntityType> {
    /**
    * Loads the Competitions record from the database
    * @param ID: string - primary key value to load the Competitions record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AssociationDemoCompetitionEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(255)
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Year
    * * Display Name: Year
    * * SQL Data Type: int
    */
    get Year(): number {
        return this.Get('Year');
    }
    set Year(value: number) {
        this.Set('Year', value);
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
    get EndDate(): Date {
        return this.Get('EndDate');
    }
    set EndDate(value: Date) {
        this.Set('EndDate', value);
    }

    /**
    * * Field Name: JudgingDate
    * * Display Name: Judging Date
    * * SQL Data Type: date
    */
    get JudgingDate(): Date | null {
        return this.Get('JudgingDate');
    }
    set JudgingDate(value: Date | null) {
        this.Set('JudgingDate', value);
    }

    /**
    * * Field Name: AwardsDate
    * * Display Name: Awards Date
    * * SQL Data Type: date
    */
    get AwardsDate(): Date | null {
        return this.Get('AwardsDate');
    }
    set AwardsDate(value: Date | null) {
        this.Set('AwardsDate', value);
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
    * * Field Name: EntryDeadline
    * * Display Name: Entry Deadline
    * * SQL Data Type: date
    */
    get EntryDeadline(): Date | null {
        return this.Get('EntryDeadline');
    }
    set EntryDeadline(value: Date | null) {
        this.Set('EntryDeadline', value);
    }

    /**
    * * Field Name: EntryFee
    * * Display Name: Entry Fee
    * * SQL Data Type: decimal(10, 2)
    */
    get EntryFee(): number | null {
        return this.Get('EntryFee');
    }
    set EntryFee(value: number | null) {
        this.Set('EntryFee', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Upcoming
    * * Value List Type: List
    * * Possible Values 
    *   * Cancelled
    *   * Completed
    *   * Entries Closed
    *   * Judging
    *   * Open for Entries
    *   * Upcoming
    */
    get Status(): 'Cancelled' | 'Completed' | 'Entries Closed' | 'Judging' | 'Open for Entries' | 'Upcoming' | null {
        return this.Get('Status');
    }
    set Status(value: 'Cancelled' | 'Completed' | 'Entries Closed' | 'Judging' | 'Open for Entries' | 'Upcoming' | null) {
        this.Set('Status', value);
    }

    /**
    * * Field Name: TotalEntries
    * * Display Name: Total Entries
    * * SQL Data Type: int
    * * Default Value: 0
    */
    get TotalEntries(): number | null {
        return this.Get('TotalEntries');
    }
    set TotalEntries(value: number | null) {
        this.Set('TotalEntries', value);
    }

    /**
    * * Field Name: TotalCategories
    * * Display Name: Total Categories
    * * SQL Data Type: int
    * * Default Value: 0
    */
    get TotalCategories(): number | null {
        return this.Get('TotalCategories');
    }
    set TotalCategories(value: number | null) {
        this.Set('TotalCategories', value);
    }

    /**
    * * Field Name: Website
    * * Display Name: Website
    * * SQL Data Type: nvarchar(500)
    */
    get Website(): string | null {
        return this.Get('Website');
    }
    set Website(value: string | null) {
        this.Set('Website', value);
    }

    /**
    * * Field Name: ContactEmail
    * * Display Name: Contact Email
    * * SQL Data Type: nvarchar(255)
    */
    get ContactEmail(): string | null {
        return this.Get('ContactEmail');
    }
    set ContactEmail(value: string | null) {
        this.Set('ContactEmail', value);
    }

    /**
    * * Field Name: IsAnnual
    * * Display Name: Is Annual
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get IsAnnual(): boolean | null {
        return this.Get('IsAnnual');
    }
    set IsAnnual(value: boolean | null) {
        this.Set('IsAnnual', value);
    }

    /**
    * * Field Name: IsInternational
    * * Display Name: Is International
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get IsInternational(): boolean | null {
        return this.Get('IsInternational');
    }
    set IsInternational(value: boolean | null) {
        this.Set('IsInternational', value);
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
 * Continuing Educations - strongly typed entity sub-class
 * * Schema: AssociationDemo
 * * Base Table: ContinuingEducation
 * * Base View: vwContinuingEducations
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Continuing Educations')
export class AssociationDemoContinuingEducationEntity extends BaseEntity<AssociationDemoContinuingEducationEntityType> {
    /**
    * Loads the Continuing Educations record from the database
    * @param ID: string - primary key value to load the Continuing Educations record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AssociationDemoContinuingEducationEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: MemberID
    * * Display Name: Member ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Members (vwMembers.ID)
    */
    get MemberID(): string {
        return this.Get('MemberID');
    }
    set MemberID(value: string) {
        this.Set('MemberID', value);
    }

    /**
    * * Field Name: CertificationID
    * * Display Name: Certification ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Certifications (vwCertifications.ID)
    */
    get CertificationID(): string | null {
        return this.Get('CertificationID');
    }
    set CertificationID(value: string | null) {
        this.Set('CertificationID', value);
    }

    /**
    * * Field Name: ActivityTitle
    * * Display Name: Activity Title
    * * SQL Data Type: nvarchar(500)
    */
    get ActivityTitle(): string {
        return this.Get('ActivityTitle');
    }
    set ActivityTitle(value: string) {
        this.Set('ActivityTitle', value);
    }

    /**
    * * Field Name: ActivityType
    * * Display Name: Activity Type
    * * SQL Data Type: nvarchar(100)
    * * Value List Type: List
    * * Possible Values 
    *   * Conference
    *   * Course
    *   * Other
    *   * Presentation
    *   * Publication
    *   * Self-Study
    *   * Teaching
    *   * Webinar
    *   * Workshop
    */
    get ActivityType(): 'Conference' | 'Course' | 'Other' | 'Presentation' | 'Publication' | 'Self-Study' | 'Teaching' | 'Webinar' | 'Workshop' {
        return this.Get('ActivityType');
    }
    set ActivityType(value: 'Conference' | 'Course' | 'Other' | 'Presentation' | 'Publication' | 'Self-Study' | 'Teaching' | 'Webinar' | 'Workshop') {
        this.Set('ActivityType', value);
    }

    /**
    * * Field Name: Provider
    * * Display Name: Provider
    * * SQL Data Type: nvarchar(255)
    */
    get Provider(): string | null {
        return this.Get('Provider');
    }
    set Provider(value: string | null) {
        this.Set('Provider', value);
    }

    /**
    * * Field Name: CompletionDate
    * * Display Name: Completion Date
    * * SQL Data Type: date
    */
    get CompletionDate(): Date {
        return this.Get('CompletionDate');
    }
    set CompletionDate(value: Date) {
        this.Set('CompletionDate', value);
    }

    /**
    * * Field Name: CreditsEarned
    * * Display Name: Credits Earned
    * * SQL Data Type: decimal(5, 2)
    */
    get CreditsEarned(): number {
        return this.Get('CreditsEarned');
    }
    set CreditsEarned(value: number) {
        this.Set('CreditsEarned', value);
    }

    /**
    * * Field Name: CreditsType
    * * Display Name: Credits Type
    * * SQL Data Type: nvarchar(50)
    * * Default Value: CE
    * * Value List Type: List
    * * Possible Values 
    *   * CE
    *   * CEU
    *   * CME
    *   * CPE
    *   * Other
    *   * PDH
    */
    get CreditsType(): 'CE' | 'CEU' | 'CME' | 'CPE' | 'Other' | 'PDH' | null {
        return this.Get('CreditsType');
    }
    set CreditsType(value: 'CE' | 'CEU' | 'CME' | 'CPE' | 'Other' | 'PDH' | null) {
        this.Set('CreditsType', value);
    }

    /**
    * * Field Name: HoursSpent
    * * Display Name: Hours Spent
    * * SQL Data Type: decimal(5, 2)
    */
    get HoursSpent(): number | null {
        return this.Get('HoursSpent');
    }
    set HoursSpent(value: number | null) {
        this.Set('HoursSpent', value);
    }

    /**
    * * Field Name: VerificationCode
    * * Display Name: Verification Code
    * * SQL Data Type: nvarchar(100)
    */
    get VerificationCode(): string | null {
        return this.Get('VerificationCode');
    }
    set VerificationCode(value: string | null) {
        this.Set('VerificationCode', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Approved
    * * Value List Type: List
    * * Possible Values 
    *   * Approved
    *   * Expired
    *   * Pending
    *   * Rejected
    */
    get Status(): 'Approved' | 'Expired' | 'Pending' | 'Rejected' | null {
        return this.Get('Status');
    }
    set Status(value: 'Approved' | 'Expired' | 'Pending' | 'Rejected' | null) {
        this.Set('Status', value);
    }

    /**
    * * Field Name: Notes
    * * Display Name: Notes
    * * SQL Data Type: nvarchar(MAX)
    */
    get Notes(): string | null {
        return this.Get('Notes');
    }
    set Notes(value: string | null) {
        this.Set('Notes', value);
    }

    /**
    * * Field Name: DocumentURL
    * * Display Name: Document URL
    * * SQL Data Type: nvarchar(500)
    */
    get DocumentURL(): string | null {
        return this.Get('DocumentURL');
    }
    set DocumentURL(value: string | null) {
        this.Set('DocumentURL', value);
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
 * * Schema: AssociationDemo
 * * Base Table: Course
 * * Base View: vwCourses
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Courses')
export class AssociationDemoCourseEntity extends BaseEntity<AssociationDemoCourseEntityType> {
    /**
    * Loads the Courses record from the database
    * @param ID: string - primary key value to load the Courses record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AssociationDemoCourseEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Code
    * * Display Name: Code
    * * SQL Data Type: nvarchar(50)
    */
    get Code(): string {
        return this.Get('Code');
    }
    set Code(value: string) {
        this.Set('Code', value);
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
    * * Field Name: Category
    * * Display Name: Category
    * * SQL Data Type: nvarchar(100)
    */
    get Category(): string | null {
        return this.Get('Category');
    }
    set Category(value: string | null) {
        this.Set('Category', value);
    }

    /**
    * * Field Name: Level
    * * Display Name: Level
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Advanced
    *   * Beginner
    *   * Expert
    *   * Intermediate
    */
    get Level(): 'Advanced' | 'Beginner' | 'Expert' | 'Intermediate' {
        return this.Get('Level');
    }
    set Level(value: 'Advanced' | 'Beginner' | 'Expert' | 'Intermediate') {
        this.Set('Level', value);
    }

    /**
    * * Field Name: DurationHours
    * * Display Name: Duration Hours
    * * SQL Data Type: decimal(5, 2)
    */
    get DurationHours(): number | null {
        return this.Get('DurationHours');
    }
    set DurationHours(value: number | null) {
        this.Set('DurationHours', value);
    }

    /**
    * * Field Name: CEUCredits
    * * Display Name: CEU Credits
    * * SQL Data Type: decimal(4, 2)
    */
    get CEUCredits(): number | null {
        return this.Get('CEUCredits');
    }
    set CEUCredits(value: number | null) {
        this.Set('CEUCredits', value);
    }

    /**
    * * Field Name: Price
    * * Display Name: Price
    * * SQL Data Type: decimal(10, 2)
    */
    get Price(): number | null {
        return this.Get('Price');
    }
    set Price(value: number | null) {
        this.Set('Price', value);
    }

    /**
    * * Field Name: MemberPrice
    * * Display Name: Member Price
    * * SQL Data Type: decimal(10, 2)
    */
    get MemberPrice(): number | null {
        return this.Get('MemberPrice');
    }
    set MemberPrice(value: number | null) {
        this.Set('MemberPrice', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get IsActive(): boolean {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean) {
        this.Set('IsActive', value);
    }

    /**
    * * Field Name: PublishedDate
    * * Display Name: Published Date
    * * SQL Data Type: date
    */
    get PublishedDate(): Date | null {
        return this.Get('PublishedDate');
    }
    set PublishedDate(value: Date | null) {
        this.Set('PublishedDate', value);
    }

    /**
    * * Field Name: InstructorName
    * * Display Name: Instructor Name
    * * SQL Data Type: nvarchar(255)
    */
    get InstructorName(): string | null {
        return this.Get('InstructorName');
    }
    set InstructorName(value: string | null) {
        this.Set('InstructorName', value);
    }

    /**
    * * Field Name: PrerequisiteCourseID
    * * Display Name: Prerequisite Course ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Courses (vwCourses.ID)
    */
    get PrerequisiteCourseID(): string | null {
        return this.Get('PrerequisiteCourseID');
    }
    set PrerequisiteCourseID(value: string | null) {
        this.Set('PrerequisiteCourseID', value);
    }

    /**
    * * Field Name: ThumbnailURL
    * * Display Name: Thumbnail URL
    * * SQL Data Type: nvarchar(500)
    */
    get ThumbnailURL(): string | null {
        return this.Get('ThumbnailURL');
    }
    set ThumbnailURL(value: string | null) {
        this.Set('ThumbnailURL', value);
    }

    /**
    * * Field Name: LearningObjectives
    * * Display Name: Learning Objectives
    * * SQL Data Type: nvarchar(MAX)
    */
    get LearningObjectives(): string | null {
        return this.Get('LearningObjectives');
    }
    set LearningObjectives(value: string | null) {
        this.Set('LearningObjectives', value);
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
    * * Field Name: RootPrerequisiteCourseID
    * * Display Name: Root Prerequisite Course ID
    * * SQL Data Type: uniqueidentifier
    */
    get RootPrerequisiteCourseID(): string | null {
        return this.Get('RootPrerequisiteCourseID');
    }
}


/**
 * Email Clicks - strongly typed entity sub-class
 * * Schema: AssociationDemo
 * * Base Table: EmailClick
 * * Base View: vwEmailClicks
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Email Clicks')
export class AssociationDemoEmailClickEntity extends BaseEntity<AssociationDemoEmailClickEntityType> {
    /**
    * Loads the Email Clicks record from the database
    * @param ID: string - primary key value to load the Email Clicks record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AssociationDemoEmailClickEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: EmailSendID
    * * Display Name: Email Send ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Email Sends (vwEmailSends.ID)
    */
    get EmailSendID(): string {
        return this.Get('EmailSendID');
    }
    set EmailSendID(value: string) {
        this.Set('EmailSendID', value);
    }

    /**
    * * Field Name: ClickDate
    * * Display Name: Click Date
    * * SQL Data Type: datetime
    */
    get ClickDate(): Date {
        return this.Get('ClickDate');
    }
    set ClickDate(value: Date) {
        this.Set('ClickDate', value);
    }

    /**
    * * Field Name: URL
    * * Display Name: URL
    * * SQL Data Type: nvarchar(2000)
    */
    get URL(): string {
        return this.Get('URL');
    }
    set URL(value: string) {
        this.Set('URL', value);
    }

    /**
    * * Field Name: LinkName
    * * Display Name: Link Name
    * * SQL Data Type: nvarchar(255)
    */
    get LinkName(): string | null {
        return this.Get('LinkName');
    }
    set LinkName(value: string | null) {
        this.Set('LinkName', value);
    }

    /**
    * * Field Name: IPAddress
    * * Display Name: IP Address
    * * SQL Data Type: nvarchar(50)
    */
    get IPAddress(): string | null {
        return this.Get('IPAddress');
    }
    set IPAddress(value: string | null) {
        this.Set('IPAddress', value);
    }

    /**
    * * Field Name: UserAgent
    * * Display Name: User Agent
    * * SQL Data Type: nvarchar(500)
    */
    get UserAgent(): string | null {
        return this.Get('UserAgent');
    }
    set UserAgent(value: string | null) {
        this.Set('UserAgent', value);
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
 * Email Sends - strongly typed entity sub-class
 * * Schema: AssociationDemo
 * * Base Table: EmailSend
 * * Base View: vwEmailSends
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Email Sends')
export class AssociationDemoEmailSendEntity extends BaseEntity<AssociationDemoEmailSendEntityType> {
    /**
    * Loads the Email Sends record from the database
    * @param ID: string - primary key value to load the Email Sends record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AssociationDemoEmailSendEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: TemplateID
    * * Display Name: Template ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Email Templates (vwEmailTemplates.ID)
    */
    get TemplateID(): string | null {
        return this.Get('TemplateID');
    }
    set TemplateID(value: string | null) {
        this.Set('TemplateID', value);
    }

    /**
    * * Field Name: CampaignID
    * * Display Name: Campaign ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Campaigns (vwCampaigns.ID)
    */
    get CampaignID(): string | null {
        return this.Get('CampaignID');
    }
    set CampaignID(value: string | null) {
        this.Set('CampaignID', value);
    }

    /**
    * * Field Name: MemberID
    * * Display Name: Member ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Members (vwMembers.ID)
    */
    get MemberID(): string {
        return this.Get('MemberID');
    }
    set MemberID(value: string) {
        this.Set('MemberID', value);
    }

    /**
    * * Field Name: Subject
    * * Display Name: Subject
    * * SQL Data Type: nvarchar(500)
    */
    get Subject(): string | null {
        return this.Get('Subject');
    }
    set Subject(value: string | null) {
        this.Set('Subject', value);
    }

    /**
    * * Field Name: SentDate
    * * Display Name: Sent Date
    * * SQL Data Type: datetime
    */
    get SentDate(): Date {
        return this.Get('SentDate');
    }
    set SentDate(value: Date) {
        this.Set('SentDate', value);
    }

    /**
    * * Field Name: DeliveredDate
    * * Display Name: Delivered Date
    * * SQL Data Type: datetime
    */
    get DeliveredDate(): Date | null {
        return this.Get('DeliveredDate');
    }
    set DeliveredDate(value: Date | null) {
        this.Set('DeliveredDate', value);
    }

    /**
    * * Field Name: OpenedDate
    * * Display Name: Opened Date
    * * SQL Data Type: datetime
    */
    get OpenedDate(): Date | null {
        return this.Get('OpenedDate');
    }
    set OpenedDate(value: Date | null) {
        this.Set('OpenedDate', value);
    }

    /**
    * * Field Name: OpenCount
    * * Display Name: Open Count
    * * SQL Data Type: int
    * * Default Value: 0
    */
    get OpenCount(): number | null {
        return this.Get('OpenCount');
    }
    set OpenCount(value: number | null) {
        this.Set('OpenCount', value);
    }

    /**
    * * Field Name: ClickedDate
    * * Display Name: Clicked Date
    * * SQL Data Type: datetime
    */
    get ClickedDate(): Date | null {
        return this.Get('ClickedDate');
    }
    set ClickedDate(value: Date | null) {
        this.Set('ClickedDate', value);
    }

    /**
    * * Field Name: ClickCount
    * * Display Name: Click Count
    * * SQL Data Type: int
    * * Default Value: 0
    */
    get ClickCount(): number | null {
        return this.Get('ClickCount');
    }
    set ClickCount(value: number | null) {
        this.Set('ClickCount', value);
    }

    /**
    * * Field Name: BouncedDate
    * * Display Name: Bounced Date
    * * SQL Data Type: datetime
    */
    get BouncedDate(): Date | null {
        return this.Get('BouncedDate');
    }
    set BouncedDate(value: Date | null) {
        this.Set('BouncedDate', value);
    }

    /**
    * * Field Name: BounceType
    * * Display Name: Bounce Type
    * * SQL Data Type: nvarchar(20)
    */
    get BounceType(): string | null {
        return this.Get('BounceType');
    }
    set BounceType(value: string | null) {
        this.Set('BounceType', value);
    }

    /**
    * * Field Name: BounceReason
    * * Display Name: Bounce Reason
    * * SQL Data Type: nvarchar(MAX)
    */
    get BounceReason(): string | null {
        return this.Get('BounceReason');
    }
    set BounceReason(value: string | null) {
        this.Set('BounceReason', value);
    }

    /**
    * * Field Name: UnsubscribedDate
    * * Display Name: Unsubscribed Date
    * * SQL Data Type: datetime
    */
    get UnsubscribedDate(): Date | null {
        return this.Get('UnsubscribedDate');
    }
    set UnsubscribedDate(value: Date | null) {
        this.Set('UnsubscribedDate', value);
    }

    /**
    * * Field Name: SpamReportedDate
    * * Display Name: Spam Reported Date
    * * SQL Data Type: datetime
    */
    get SpamReportedDate(): Date | null {
        return this.Get('SpamReportedDate');
    }
    set SpamReportedDate(value: Date | null) {
        this.Set('SpamReportedDate', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Bounced
    *   * Clicked
    *   * Delivered
    *   * Failed
    *   * Opened
    *   * Queued
    *   * Sent
    *   * Spam
    *   * Unsubscribed
    */
    get Status(): 'Bounced' | 'Clicked' | 'Delivered' | 'Failed' | 'Opened' | 'Queued' | 'Sent' | 'Spam' | 'Unsubscribed' {
        return this.Get('Status');
    }
    set Status(value: 'Bounced' | 'Clicked' | 'Delivered' | 'Failed' | 'Opened' | 'Queued' | 'Sent' | 'Spam' | 'Unsubscribed') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: ExternalMessageID
    * * Display Name: External Message ID
    * * SQL Data Type: nvarchar(255)
    */
    get ExternalMessageID(): string | null {
        return this.Get('ExternalMessageID');
    }
    set ExternalMessageID(value: string | null) {
        this.Set('ExternalMessageID', value);
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
    * * Field Name: Template
    * * Display Name: Template
    * * SQL Data Type: nvarchar(255)
    */
    get Template(): string | null {
        return this.Get('Template');
    }

    /**
    * * Field Name: Campaign
    * * Display Name: Campaign
    * * SQL Data Type: nvarchar(255)
    */
    get Campaign(): string | null {
        return this.Get('Campaign');
    }
}


/**
 * Email Templates - strongly typed entity sub-class
 * * Schema: AssociationDemo
 * * Base Table: EmailTemplate
 * * Base View: vwEmailTemplates
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Email Templates')
export class AssociationDemoEmailTemplateEntity extends BaseEntity<AssociationDemoEmailTemplateEntityType> {
    /**
    * Loads the Email Templates record from the database
    * @param ID: string - primary key value to load the Email Templates record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AssociationDemoEmailTemplateEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(255)
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Subject
    * * Display Name: Subject
    * * SQL Data Type: nvarchar(500)
    */
    get Subject(): string | null {
        return this.Get('Subject');
    }
    set Subject(value: string | null) {
        this.Set('Subject', value);
    }

    /**
    * * Field Name: FromName
    * * Display Name: From Name
    * * SQL Data Type: nvarchar(255)
    */
    get FromName(): string | null {
        return this.Get('FromName');
    }
    set FromName(value: string | null) {
        this.Set('FromName', value);
    }

    /**
    * * Field Name: FromEmail
    * * Display Name: From Email
    * * SQL Data Type: nvarchar(255)
    */
    get FromEmail(): string | null {
        return this.Get('FromEmail');
    }
    set FromEmail(value: string | null) {
        this.Set('FromEmail', value);
    }

    /**
    * * Field Name: ReplyToEmail
    * * Display Name: Reply To Email
    * * SQL Data Type: nvarchar(255)
    */
    get ReplyToEmail(): string | null {
        return this.Get('ReplyToEmail');
    }
    set ReplyToEmail(value: string | null) {
        this.Set('ReplyToEmail', value);
    }

    /**
    * * Field Name: HtmlBody
    * * Display Name: Html Body
    * * SQL Data Type: nvarchar(MAX)
    */
    get HtmlBody(): string | null {
        return this.Get('HtmlBody');
    }
    set HtmlBody(value: string | null) {
        this.Set('HtmlBody', value);
    }

    /**
    * * Field Name: TextBody
    * * Display Name: Text Body
    * * SQL Data Type: nvarchar(MAX)
    */
    get TextBody(): string | null {
        return this.Get('TextBody');
    }
    set TextBody(value: string | null) {
        this.Set('TextBody', value);
    }

    /**
    * * Field Name: Category
    * * Display Name: Category
    * * SQL Data Type: nvarchar(100)
    */
    get Category(): string | null {
        return this.Get('Category');
    }
    set Category(value: string | null) {
        this.Set('Category', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get IsActive(): boolean {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean) {
        this.Set('IsActive', value);
    }

    /**
    * * Field Name: PreviewText
    * * Display Name: Preview Text
    * * SQL Data Type: nvarchar(255)
    */
    get PreviewText(): string | null {
        return this.Get('PreviewText');
    }
    set PreviewText(value: string | null) {
        this.Set('PreviewText', value);
    }

    /**
    * * Field Name: Tags
    * * Display Name: Tags
    * * SQL Data Type: nvarchar(500)
    */
    get Tags(): string | null {
        return this.Get('Tags');
    }
    set Tags(value: string | null) {
        this.Set('Tags', value);
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
 * Enrollments - strongly typed entity sub-class
 * * Schema: AssociationDemo
 * * Base Table: Enrollment
 * * Base View: vwEnrollments
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Enrollments')
export class AssociationDemoEnrollmentEntity extends BaseEntity<AssociationDemoEnrollmentEntityType> {
    /**
    * Loads the Enrollments record from the database
    * @param ID: string - primary key value to load the Enrollments record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AssociationDemoEnrollmentEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: CourseID
    * * Display Name: Course ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Courses (vwCourses.ID)
    */
    get CourseID(): string {
        return this.Get('CourseID');
    }
    set CourseID(value: string) {
        this.Set('CourseID', value);
    }

    /**
    * * Field Name: MemberID
    * * Display Name: Member ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Members (vwMembers.ID)
    */
    get MemberID(): string {
        return this.Get('MemberID');
    }
    set MemberID(value: string) {
        this.Set('MemberID', value);
    }

    /**
    * * Field Name: EnrollmentDate
    * * Display Name: Enrollment Date
    * * SQL Data Type: datetime
    */
    get EnrollmentDate(): Date {
        return this.Get('EnrollmentDate');
    }
    set EnrollmentDate(value: Date) {
        this.Set('EnrollmentDate', value);
    }

    /**
    * * Field Name: StartDate
    * * Display Name: Start Date
    * * SQL Data Type: datetime
    */
    get StartDate(): Date | null {
        return this.Get('StartDate');
    }
    set StartDate(value: Date | null) {
        this.Set('StartDate', value);
    }

    /**
    * * Field Name: CompletionDate
    * * Display Name: Completion Date
    * * SQL Data Type: datetime
    */
    get CompletionDate(): Date | null {
        return this.Get('CompletionDate');
    }
    set CompletionDate(value: Date | null) {
        this.Set('CompletionDate', value);
    }

    /**
    * * Field Name: ExpirationDate
    * * Display Name: Expiration Date
    * * SQL Data Type: datetime
    */
    get ExpirationDate(): Date | null {
        return this.Get('ExpirationDate');
    }
    set ExpirationDate(value: Date | null) {
        this.Set('ExpirationDate', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Completed
    *   * Enrolled
    *   * Expired
    *   * Failed
    *   * In Progress
    *   * Withdrawn
    */
    get Status(): 'Completed' | 'Enrolled' | 'Expired' | 'Failed' | 'In Progress' | 'Withdrawn' {
        return this.Get('Status');
    }
    set Status(value: 'Completed' | 'Enrolled' | 'Expired' | 'Failed' | 'In Progress' | 'Withdrawn') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: ProgressPercentage
    * * Display Name: Progress Percentage
    * * SQL Data Type: int
    * * Default Value: 0
    */
    get ProgressPercentage(): number | null {
        return this.Get('ProgressPercentage');
    }
    set ProgressPercentage(value: number | null) {
        this.Set('ProgressPercentage', value);
    }

    /**
    * * Field Name: LastAccessedDate
    * * Display Name: Last Accessed Date
    * * SQL Data Type: datetime
    */
    get LastAccessedDate(): Date | null {
        return this.Get('LastAccessedDate');
    }
    set LastAccessedDate(value: Date | null) {
        this.Set('LastAccessedDate', value);
    }

    /**
    * * Field Name: TimeSpentMinutes
    * * Display Name: Time Spent Minutes
    * * SQL Data Type: int
    * * Default Value: 0
    */
    get TimeSpentMinutes(): number | null {
        return this.Get('TimeSpentMinutes');
    }
    set TimeSpentMinutes(value: number | null) {
        this.Set('TimeSpentMinutes', value);
    }

    /**
    * * Field Name: FinalScore
    * * Display Name: Final Score
    * * SQL Data Type: decimal(5, 2)
    */
    get FinalScore(): number | null {
        return this.Get('FinalScore');
    }
    set FinalScore(value: number | null) {
        this.Set('FinalScore', value);
    }

    /**
    * * Field Name: PassingScore
    * * Display Name: Passing Score
    * * SQL Data Type: decimal(5, 2)
    * * Default Value: 70.00
    */
    get PassingScore(): number | null {
        return this.Get('PassingScore');
    }
    set PassingScore(value: number | null) {
        this.Set('PassingScore', value);
    }

    /**
    * * Field Name: Passed
    * * Display Name: Passed
    * * SQL Data Type: bit
    */
    get Passed(): boolean | null {
        return this.Get('Passed');
    }
    set Passed(value: boolean | null) {
        this.Set('Passed', value);
    }

    /**
    * * Field Name: InvoiceID
    * * Display Name: Invoice ID
    * * SQL Data Type: uniqueidentifier
    */
    get InvoiceID(): string | null {
        return this.Get('InvoiceID');
    }
    set InvoiceID(value: string | null) {
        this.Set('InvoiceID', value);
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
 * Event Registrations - strongly typed entity sub-class
 * * Schema: AssociationDemo
 * * Base Table: EventRegistration
 * * Base View: vwEventRegistrations
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Event Registrations')
export class AssociationDemoEventRegistrationEntity extends BaseEntity<AssociationDemoEventRegistrationEntityType> {
    /**
    * Loads the Event Registrations record from the database
    * @param ID: string - primary key value to load the Event Registrations record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AssociationDemoEventRegistrationEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: EventID
    * * Display Name: Event ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Events (vwEvents.ID)
    */
    get EventID(): string {
        return this.Get('EventID');
    }
    set EventID(value: string) {
        this.Set('EventID', value);
    }

    /**
    * * Field Name: MemberID
    * * Display Name: Member ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Members (vwMembers.ID)
    */
    get MemberID(): string {
        return this.Get('MemberID');
    }
    set MemberID(value: string) {
        this.Set('MemberID', value);
    }

    /**
    * * Field Name: RegistrationDate
    * * Display Name: Registration Date
    * * SQL Data Type: datetime
    */
    get RegistrationDate(): Date {
        return this.Get('RegistrationDate');
    }
    set RegistrationDate(value: Date) {
        this.Set('RegistrationDate', value);
    }

    /**
    * * Field Name: RegistrationType
    * * Display Name: Registration Type
    * * SQL Data Type: nvarchar(50)
    */
    get RegistrationType(): string | null {
        return this.Get('RegistrationType');
    }
    set RegistrationType(value: string | null) {
        this.Set('RegistrationType', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Attended
    *   * Cancelled
    *   * No Show
    *   * Registered
    *   * Waitlisted
    */
    get Status(): 'Attended' | 'Cancelled' | 'No Show' | 'Registered' | 'Waitlisted' {
        return this.Get('Status');
    }
    set Status(value: 'Attended' | 'Cancelled' | 'No Show' | 'Registered' | 'Waitlisted') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: CheckInTime
    * * Display Name: Check In Time
    * * SQL Data Type: datetime
    */
    get CheckInTime(): Date | null {
        return this.Get('CheckInTime');
    }
    set CheckInTime(value: Date | null) {
        this.Set('CheckInTime', value);
    }

    /**
    * * Field Name: InvoiceID
    * * Display Name: Invoice ID
    * * SQL Data Type: uniqueidentifier
    */
    get InvoiceID(): string | null {
        return this.Get('InvoiceID');
    }
    set InvoiceID(value: string | null) {
        this.Set('InvoiceID', value);
    }

    /**
    * * Field Name: CEUAwarded
    * * Display Name: CEU Awarded
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get CEUAwarded(): boolean {
        return this.Get('CEUAwarded');
    }
    set CEUAwarded(value: boolean) {
        this.Set('CEUAwarded', value);
    }

    /**
    * * Field Name: CEUAwardedDate
    * * Display Name: CEU Awarded Date
    * * SQL Data Type: datetime
    */
    get CEUAwardedDate(): Date | null {
        return this.Get('CEUAwardedDate');
    }
    set CEUAwardedDate(value: Date | null) {
        this.Set('CEUAwardedDate', value);
    }

    /**
    * * Field Name: CancellationDate
    * * Display Name: Cancellation Date
    * * SQL Data Type: datetime
    */
    get CancellationDate(): Date | null {
        return this.Get('CancellationDate');
    }
    set CancellationDate(value: Date | null) {
        this.Set('CancellationDate', value);
    }

    /**
    * * Field Name: CancellationReason
    * * Display Name: Cancellation Reason
    * * SQL Data Type: nvarchar(MAX)
    */
    get CancellationReason(): string | null {
        return this.Get('CancellationReason');
    }
    set CancellationReason(value: string | null) {
        this.Set('CancellationReason', value);
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
    * * Field Name: Event
    * * Display Name: Event
    * * SQL Data Type: nvarchar(255)
    */
    get Event(): string {
        return this.Get('Event');
    }
}


/**
 * Event Sessions - strongly typed entity sub-class
 * * Schema: AssociationDemo
 * * Base Table: EventSession
 * * Base View: vwEventSessions
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Event Sessions')
export class AssociationDemoEventSessionEntity extends BaseEntity<AssociationDemoEventSessionEntityType> {
    /**
    * Loads the Event Sessions record from the database
    * @param ID: string - primary key value to load the Event Sessions record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AssociationDemoEventSessionEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: EventID
    * * Display Name: Event ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Events (vwEvents.ID)
    */
    get EventID(): string {
        return this.Get('EventID');
    }
    set EventID(value: string) {
        this.Set('EventID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(255)
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
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
    * * Field Name: StartTime
    * * Display Name: Start Time
    * * SQL Data Type: datetime
    */
    get StartTime(): Date {
        return this.Get('StartTime');
    }
    set StartTime(value: Date) {
        this.Set('StartTime', value);
    }

    /**
    * * Field Name: EndTime
    * * Display Name: End Time
    * * SQL Data Type: datetime
    */
    get EndTime(): Date {
        return this.Get('EndTime');
    }
    set EndTime(value: Date) {
        this.Set('EndTime', value);
    }

    /**
    * * Field Name: Room
    * * Display Name: Room
    * * SQL Data Type: nvarchar(100)
    */
    get Room(): string | null {
        return this.Get('Room');
    }
    set Room(value: string | null) {
        this.Set('Room', value);
    }

    /**
    * * Field Name: SpeakerName
    * * Display Name: Speaker Name
    * * SQL Data Type: nvarchar(255)
    */
    get SpeakerName(): string | null {
        return this.Get('SpeakerName');
    }
    set SpeakerName(value: string | null) {
        this.Set('SpeakerName', value);
    }

    /**
    * * Field Name: SessionType
    * * Display Name: Session Type
    * * SQL Data Type: nvarchar(50)
    */
    get SessionType(): string | null {
        return this.Get('SessionType');
    }
    set SessionType(value: string | null) {
        this.Set('SessionType', value);
    }

    /**
    * * Field Name: Capacity
    * * Display Name: Capacity
    * * SQL Data Type: int
    */
    get Capacity(): number | null {
        return this.Get('Capacity');
    }
    set Capacity(value: number | null) {
        this.Set('Capacity', value);
    }

    /**
    * * Field Name: CEUCredits
    * * Display Name: CEU Credits
    * * SQL Data Type: decimal(4, 2)
    */
    get CEUCredits(): number | null {
        return this.Get('CEUCredits');
    }
    set CEUCredits(value: number | null) {
        this.Set('CEUCredits', value);
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
    * * Field Name: Event
    * * Display Name: Event
    * * SQL Data Type: nvarchar(255)
    */
    get Event(): string {
        return this.Get('Event');
    }
}


/**
 * Events - strongly typed entity sub-class
 * * Schema: AssociationDemo
 * * Base Table: Event
 * * Base View: vwEvents
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Events')
export class AssociationDemoEventEntity extends BaseEntity<AssociationDemoEventEntityType> {
    /**
    * Loads the Events record from the database
    * @param ID: string - primary key value to load the Events record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AssociationDemoEventEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(255)
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: EventType
    * * Display Name: Event Type
    * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Chapter Meeting
    *   * Conference
    *   * Networking
    *   * Virtual Summit
    *   * Webinar
    *   * Workshop
    */
    get EventType(): 'Chapter Meeting' | 'Conference' | 'Networking' | 'Virtual Summit' | 'Webinar' | 'Workshop' {
        return this.Get('EventType');
    }
    set EventType(value: 'Chapter Meeting' | 'Conference' | 'Networking' | 'Virtual Summit' | 'Webinar' | 'Workshop') {
        this.Set('EventType', value);
    }

    /**
    * * Field Name: StartDate
    * * Display Name: Start Date
    * * SQL Data Type: datetime
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
    * * SQL Data Type: datetime
    */
    get EndDate(): Date {
        return this.Get('EndDate');
    }
    set EndDate(value: Date) {
        this.Set('EndDate', value);
    }

    /**
    * * Field Name: Timezone
    * * Display Name: Timezone
    * * SQL Data Type: nvarchar(50)
    */
    get Timezone(): string | null {
        return this.Get('Timezone');
    }
    set Timezone(value: string | null) {
        this.Set('Timezone', value);
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
    * * Field Name: IsVirtual
    * * Display Name: Is Virtual
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get IsVirtual(): boolean {
        return this.Get('IsVirtual');
    }
    set IsVirtual(value: boolean) {
        this.Set('IsVirtual', value);
    }

    /**
    * * Field Name: VirtualPlatform
    * * Display Name: Virtual Platform
    * * SQL Data Type: nvarchar(100)
    */
    get VirtualPlatform(): string | null {
        return this.Get('VirtualPlatform');
    }
    set VirtualPlatform(value: string | null) {
        this.Set('VirtualPlatform', value);
    }

    /**
    * * Field Name: MeetingURL
    * * Display Name: Meeting URL
    * * SQL Data Type: nvarchar(500)
    */
    get MeetingURL(): string | null {
        return this.Get('MeetingURL');
    }
    set MeetingURL(value: string | null) {
        this.Set('MeetingURL', value);
    }

    /**
    * * Field Name: ChapterID
    * * Display Name: Chapter ID
    * * SQL Data Type: uniqueidentifier
    */
    get ChapterID(): string | null {
        return this.Get('ChapterID');
    }
    set ChapterID(value: string | null) {
        this.Set('ChapterID', value);
    }

    /**
    * * Field Name: Capacity
    * * Display Name: Capacity
    * * SQL Data Type: int
    */
    get Capacity(): number | null {
        return this.Get('Capacity');
    }
    set Capacity(value: number | null) {
        this.Set('Capacity', value);
    }

    /**
    * * Field Name: RegistrationOpenDate
    * * Display Name: Registration Open Date
    * * SQL Data Type: datetime
    */
    get RegistrationOpenDate(): Date | null {
        return this.Get('RegistrationOpenDate');
    }
    set RegistrationOpenDate(value: Date | null) {
        this.Set('RegistrationOpenDate', value);
    }

    /**
    * * Field Name: RegistrationCloseDate
    * * Display Name: Registration Close Date
    * * SQL Data Type: datetime
    */
    get RegistrationCloseDate(): Date | null {
        return this.Get('RegistrationCloseDate');
    }
    set RegistrationCloseDate(value: Date | null) {
        this.Set('RegistrationCloseDate', value);
    }

    /**
    * * Field Name: RegistrationFee
    * * Display Name: Registration Fee
    * * SQL Data Type: decimal(10, 2)
    */
    get RegistrationFee(): number | null {
        return this.Get('RegistrationFee');
    }
    set RegistrationFee(value: number | null) {
        this.Set('RegistrationFee', value);
    }

    /**
    * * Field Name: MemberPrice
    * * Display Name: Member Price
    * * SQL Data Type: decimal(10, 2)
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
    * * SQL Data Type: decimal(10, 2)
    */
    get NonMemberPrice(): number | null {
        return this.Get('NonMemberPrice');
    }
    set NonMemberPrice(value: number | null) {
        this.Set('NonMemberPrice', value);
    }

    /**
    * * Field Name: CEUCredits
    * * Display Name: CEU Credits
    * * SQL Data Type: decimal(4, 2)
    */
    get CEUCredits(): number | null {
        return this.Get('CEUCredits');
    }
    set CEUCredits(value: number | null) {
        this.Set('CEUCredits', value);
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
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Cancelled
    *   * Completed
    *   * Draft
    *   * In Progress
    *   * Published
    *   * Registration Open
    *   * Sold Out
    */
    get Status(): 'Cancelled' | 'Completed' | 'Draft' | 'In Progress' | 'Published' | 'Registration Open' | 'Sold Out' {
        return this.Get('Status');
    }
    set Status(value: 'Cancelled' | 'Completed' | 'Draft' | 'In Progress' | 'Published' | 'Registration Open' | 'Sold Out') {
        this.Set('Status', value);
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
 * Forum Categories - strongly typed entity sub-class
 * * Schema: AssociationDemo
 * * Base Table: ForumCategory
 * * Base View: vwForumCategories
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Forum Categories')
export class AssociationDemoForumCategoryEntity extends BaseEntity<AssociationDemoForumCategoryEntityType> {
    /**
    * Loads the Forum Categories record from the database
    * @param ID: string - primary key value to load the Forum Categories record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AssociationDemoForumCategoryEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(255)
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
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
    * * Field Name: ParentCategoryID
    * * Display Name: Parent Category ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Forum Categories (vwForumCategories.ID)
    */
    get ParentCategoryID(): string | null {
        return this.Get('ParentCategoryID');
    }
    set ParentCategoryID(value: string | null) {
        this.Set('ParentCategoryID', value);
    }

    /**
    * * Field Name: DisplayOrder
    * * Display Name: Display Order
    * * SQL Data Type: int
    * * Default Value: 0
    */
    get DisplayOrder(): number | null {
        return this.Get('DisplayOrder');
    }
    set DisplayOrder(value: number | null) {
        this.Set('DisplayOrder', value);
    }

    /**
    * * Field Name: Icon
    * * Display Name: Icon
    * * SQL Data Type: nvarchar(100)
    */
    get Icon(): string | null {
        return this.Get('Icon');
    }
    set Icon(value: string | null) {
        this.Set('Icon', value);
    }

    /**
    * * Field Name: Color
    * * Display Name: Color
    * * SQL Data Type: nvarchar(50)
    */
    get Color(): string | null {
        return this.Get('Color');
    }
    set Color(value: string | null) {
        this.Set('Color', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get IsActive(): boolean | null {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean | null) {
        this.Set('IsActive', value);
    }

    /**
    * * Field Name: RequiresMembership
    * * Display Name: Requires Membership
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get RequiresMembership(): boolean | null {
        return this.Get('RequiresMembership');
    }
    set RequiresMembership(value: boolean | null) {
        this.Set('RequiresMembership', value);
    }

    /**
    * * Field Name: ThreadCount
    * * Display Name: Thread Count
    * * SQL Data Type: int
    * * Default Value: 0
    */
    get ThreadCount(): number | null {
        return this.Get('ThreadCount');
    }
    set ThreadCount(value: number | null) {
        this.Set('ThreadCount', value);
    }

    /**
    * * Field Name: PostCount
    * * Display Name: Post Count
    * * SQL Data Type: int
    * * Default Value: 0
    */
    get PostCount(): number | null {
        return this.Get('PostCount');
    }
    set PostCount(value: number | null) {
        this.Set('PostCount', value);
    }

    /**
    * * Field Name: LastPostDate
    * * Display Name: Last Post Date
    * * SQL Data Type: datetime
    */
    get LastPostDate(): Date | null {
        return this.Get('LastPostDate');
    }
    set LastPostDate(value: Date | null) {
        this.Set('LastPostDate', value);
    }

    /**
    * * Field Name: LastPostAuthorID
    * * Display Name: Last Post Author ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Members (vwMembers.ID)
    */
    get LastPostAuthorID(): string | null {
        return this.Get('LastPostAuthorID');
    }
    set LastPostAuthorID(value: string | null) {
        this.Set('LastPostAuthorID', value);
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
    * * Field Name: ParentCategory
    * * Display Name: Parent Category
    * * SQL Data Type: nvarchar(255)
    */
    get ParentCategory(): string | null {
        return this.Get('ParentCategory');
    }

    /**
    * * Field Name: RootParentCategoryID
    * * Display Name: Root Parent Category ID
    * * SQL Data Type: uniqueidentifier
    */
    get RootParentCategoryID(): string | null {
        return this.Get('RootParentCategoryID');
    }
}


/**
 * Forum Moderations - strongly typed entity sub-class
 * * Schema: AssociationDemo
 * * Base Table: ForumModeration
 * * Base View: vwForumModerations
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Forum Moderations')
export class AssociationDemoForumModerationEntity extends BaseEntity<AssociationDemoForumModerationEntityType> {
    /**
    * Loads the Forum Moderations record from the database
    * @param ID: string - primary key value to load the Forum Moderations record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AssociationDemoForumModerationEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: PostID
    * * Display Name: Post ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Forum Posts (vwForumPosts.ID)
    */
    get PostID(): string {
        return this.Get('PostID');
    }
    set PostID(value: string) {
        this.Set('PostID', value);
    }

    /**
    * * Field Name: ReportedByID
    * * Display Name: Reported By ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Members (vwMembers.ID)
    */
    get ReportedByID(): string {
        return this.Get('ReportedByID');
    }
    set ReportedByID(value: string) {
        this.Set('ReportedByID', value);
    }

    /**
    * * Field Name: ReportedDate
    * * Display Name: Reported Date
    * * SQL Data Type: datetime
    * * Default Value: getdate()
    */
    get ReportedDate(): Date {
        return this.Get('ReportedDate');
    }
    set ReportedDate(value: Date) {
        this.Set('ReportedDate', value);
    }

    /**
    * * Field Name: ReportReason
    * * Display Name: Report Reason
    * * SQL Data Type: nvarchar(500)
    */
    get ReportReason(): string | null {
        return this.Get('ReportReason');
    }
    set ReportReason(value: string | null) {
        this.Set('ReportReason', value);
    }

    /**
    * * Field Name: ModerationStatus
    * * Display Name: Moderation Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Approved
    *   * Dismissed
    *   * Pending
    *   * Removed
    *   * Reviewing
    */
    get ModerationStatus(): 'Approved' | 'Dismissed' | 'Pending' | 'Removed' | 'Reviewing' | null {
        return this.Get('ModerationStatus');
    }
    set ModerationStatus(value: 'Approved' | 'Dismissed' | 'Pending' | 'Removed' | 'Reviewing' | null) {
        this.Set('ModerationStatus', value);
    }

    /**
    * * Field Name: ModeratedByID
    * * Display Name: Moderated By ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Members (vwMembers.ID)
    */
    get ModeratedByID(): string | null {
        return this.Get('ModeratedByID');
    }
    set ModeratedByID(value: string | null) {
        this.Set('ModeratedByID', value);
    }

    /**
    * * Field Name: ModeratedDate
    * * Display Name: Moderated Date
    * * SQL Data Type: datetime
    */
    get ModeratedDate(): Date | null {
        return this.Get('ModeratedDate');
    }
    set ModeratedDate(value: Date | null) {
        this.Set('ModeratedDate', value);
    }

    /**
    * * Field Name: ModeratorNotes
    * * Display Name: Moderator Notes
    * * SQL Data Type: nvarchar(MAX)
    */
    get ModeratorNotes(): string | null {
        return this.Get('ModeratorNotes');
    }
    set ModeratorNotes(value: string | null) {
        this.Set('ModeratorNotes', value);
    }

    /**
    * * Field Name: Action
    * * Display Name: Action
    * * SQL Data Type: nvarchar(100)
    */
    get Action(): string | null {
        return this.Get('Action');
    }
    set Action(value: string | null) {
        this.Set('Action', value);
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
 * Forum Posts - strongly typed entity sub-class
 * * Schema: AssociationDemo
 * * Base Table: ForumPost
 * * Base View: vwForumPosts
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Forum Posts')
export class AssociationDemoForumPostEntity extends BaseEntity<AssociationDemoForumPostEntityType> {
    /**
    * Loads the Forum Posts record from the database
    * @param ID: string - primary key value to load the Forum Posts record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AssociationDemoForumPostEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: ThreadID
    * * Display Name: Thread ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Forum Threads (vwForumThreads.ID)
    */
    get ThreadID(): string {
        return this.Get('ThreadID');
    }
    set ThreadID(value: string) {
        this.Set('ThreadID', value);
    }

    /**
    * * Field Name: ParentPostID
    * * Display Name: Parent Post ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Forum Posts (vwForumPosts.ID)
    */
    get ParentPostID(): string | null {
        return this.Get('ParentPostID');
    }
    set ParentPostID(value: string | null) {
        this.Set('ParentPostID', value);
    }

    /**
    * * Field Name: AuthorID
    * * Display Name: Author ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Members (vwMembers.ID)
    */
    get AuthorID(): string {
        return this.Get('AuthorID');
    }
    set AuthorID(value: string) {
        this.Set('AuthorID', value);
    }

    /**
    * * Field Name: Content
    * * Display Name: Content
    * * SQL Data Type: nvarchar(MAX)
    */
    get Content(): string {
        return this.Get('Content');
    }
    set Content(value: string) {
        this.Set('Content', value);
    }

    /**
    * * Field Name: PostedDate
    * * Display Name: Posted Date
    * * SQL Data Type: datetime
    * * Default Value: getdate()
    */
    get PostedDate(): Date {
        return this.Get('PostedDate');
    }
    set PostedDate(value: Date) {
        this.Set('PostedDate', value);
    }

    /**
    * * Field Name: EditedDate
    * * Display Name: Edited Date
    * * SQL Data Type: datetime
    */
    get EditedDate(): Date | null {
        return this.Get('EditedDate');
    }
    set EditedDate(value: Date | null) {
        this.Set('EditedDate', value);
    }

    /**
    * * Field Name: EditedByID
    * * Display Name: Edited By ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Members (vwMembers.ID)
    */
    get EditedByID(): string | null {
        return this.Get('EditedByID');
    }
    set EditedByID(value: string | null) {
        this.Set('EditedByID', value);
    }

    /**
    * * Field Name: LikeCount
    * * Display Name: Like Count
    * * SQL Data Type: int
    * * Default Value: 0
    */
    get LikeCount(): number | null {
        return this.Get('LikeCount');
    }
    set LikeCount(value: number | null) {
        this.Set('LikeCount', value);
    }

    /**
    * * Field Name: HelpfulCount
    * * Display Name: Helpful Count
    * * SQL Data Type: int
    * * Default Value: 0
    */
    get HelpfulCount(): number | null {
        return this.Get('HelpfulCount');
    }
    set HelpfulCount(value: number | null) {
        this.Set('HelpfulCount', value);
    }

    /**
    * * Field Name: IsAcceptedAnswer
    * * Display Name: Is Accepted Answer
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get IsAcceptedAnswer(): boolean | null {
        return this.Get('IsAcceptedAnswer');
    }
    set IsAcceptedAnswer(value: boolean | null) {
        this.Set('IsAcceptedAnswer', value);
    }

    /**
    * * Field Name: IsFlagged
    * * Display Name: Is Flagged
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get IsFlagged(): boolean | null {
        return this.Get('IsFlagged');
    }
    set IsFlagged(value: boolean | null) {
        this.Set('IsFlagged', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Published
    * * Value List Type: List
    * * Possible Values 
    *   * Deleted
    *   * Draft
    *   * Edited
    *   * Moderated
    *   * Published
    */
    get Status(): 'Deleted' | 'Draft' | 'Edited' | 'Moderated' | 'Published' | null {
        return this.Get('Status');
    }
    set Status(value: 'Deleted' | 'Draft' | 'Edited' | 'Moderated' | 'Published' | null) {
        this.Set('Status', value);
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
    * * Field Name: RootParentPostID
    * * Display Name: Root Parent Post ID
    * * SQL Data Type: uniqueidentifier
    */
    get RootParentPostID(): string | null {
        return this.Get('RootParentPostID');
    }
}


/**
 * Forum Threads - strongly typed entity sub-class
 * * Schema: AssociationDemo
 * * Base Table: ForumThread
 * * Base View: vwForumThreads
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Forum Threads')
export class AssociationDemoForumThreadEntity extends BaseEntity<AssociationDemoForumThreadEntityType> {
    /**
    * Loads the Forum Threads record from the database
    * @param ID: string - primary key value to load the Forum Threads record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AssociationDemoForumThreadEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: CategoryID
    * * Display Name: Category ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Forum Categories (vwForumCategories.ID)
    */
    get CategoryID(): string {
        return this.Get('CategoryID');
    }
    set CategoryID(value: string) {
        this.Set('CategoryID', value);
    }

    /**
    * * Field Name: Title
    * * Display Name: Title
    * * SQL Data Type: nvarchar(500)
    */
    get Title(): string {
        return this.Get('Title');
    }
    set Title(value: string) {
        this.Set('Title', value);
    }

    /**
    * * Field Name: AuthorID
    * * Display Name: Author ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Members (vwMembers.ID)
    */
    get AuthorID(): string {
        return this.Get('AuthorID');
    }
    set AuthorID(value: string) {
        this.Set('AuthorID', value);
    }

    /**
    * * Field Name: CreatedDate
    * * Display Name: Created Date
    * * SQL Data Type: datetime
    * * Default Value: getdate()
    */
    get CreatedDate(): Date {
        return this.Get('CreatedDate');
    }
    set CreatedDate(value: Date) {
        this.Set('CreatedDate', value);
    }

    /**
    * * Field Name: ViewCount
    * * Display Name: View Count
    * * SQL Data Type: int
    * * Default Value: 0
    */
    get ViewCount(): number | null {
        return this.Get('ViewCount');
    }
    set ViewCount(value: number | null) {
        this.Set('ViewCount', value);
    }

    /**
    * * Field Name: ReplyCount
    * * Display Name: Reply Count
    * * SQL Data Type: int
    * * Default Value: 0
    */
    get ReplyCount(): number | null {
        return this.Get('ReplyCount');
    }
    set ReplyCount(value: number | null) {
        this.Set('ReplyCount', value);
    }

    /**
    * * Field Name: LastActivityDate
    * * Display Name: Last Activity Date
    * * SQL Data Type: datetime
    */
    get LastActivityDate(): Date | null {
        return this.Get('LastActivityDate');
    }
    set LastActivityDate(value: Date | null) {
        this.Set('LastActivityDate', value);
    }

    /**
    * * Field Name: LastReplyAuthorID
    * * Display Name: Last Reply Author ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Members (vwMembers.ID)
    */
    get LastReplyAuthorID(): string | null {
        return this.Get('LastReplyAuthorID');
    }
    set LastReplyAuthorID(value: string | null) {
        this.Set('LastReplyAuthorID', value);
    }

    /**
    * * Field Name: IsPinned
    * * Display Name: Is Pinned
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get IsPinned(): boolean | null {
        return this.Get('IsPinned');
    }
    set IsPinned(value: boolean | null) {
        this.Set('IsPinned', value);
    }

    /**
    * * Field Name: IsLocked
    * * Display Name: Is Locked
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get IsLocked(): boolean | null {
        return this.Get('IsLocked');
    }
    set IsLocked(value: boolean | null) {
        this.Set('IsLocked', value);
    }

    /**
    * * Field Name: IsFeatured
    * * Display Name: Is Featured
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get IsFeatured(): boolean | null {
        return this.Get('IsFeatured');
    }
    set IsFeatured(value: boolean | null) {
        this.Set('IsFeatured', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Archived
    *   * Closed
    *   * Deleted
    */
    get Status(): 'Active' | 'Archived' | 'Closed' | 'Deleted' | null {
        return this.Get('Status');
    }
    set Status(value: 'Active' | 'Archived' | 'Closed' | 'Deleted' | null) {
        this.Set('Status', value);
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
    * * Field Name: Category
    * * Display Name: Category
    * * SQL Data Type: nvarchar(255)
    */
    get Category(): string {
        return this.Get('Category');
    }
}


/**
 * Government Contacts - strongly typed entity sub-class
 * * Schema: AssociationDemo
 * * Base Table: GovernmentContact
 * * Base View: vwGovernmentContacts
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Government Contacts')
export class AssociationDemoGovernmentContactEntity extends BaseEntity<AssociationDemoGovernmentContactEntityType> {
    /**
    * Loads the Government Contacts record from the database
    * @param ID: string - primary key value to load the Government Contacts record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AssociationDemoGovernmentContactEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: LegislativeBodyID
    * * Display Name: Legislative Body ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Legislative Bodies (vwLegislativeBodies.ID)
    */
    get LegislativeBodyID(): string | null {
        return this.Get('LegislativeBodyID');
    }
    set LegislativeBodyID(value: string | null) {
        this.Set('LegislativeBodyID', value);
    }

    /**
    * * Field Name: FirstName
    * * Display Name: First Name
    * * SQL Data Type: nvarchar(100)
    */
    get FirstName(): string {
        return this.Get('FirstName');
    }
    set FirstName(value: string) {
        this.Set('FirstName', value);
    }

    /**
    * * Field Name: LastName
    * * Display Name: Last Name
    * * SQL Data Type: nvarchar(100)
    */
    get LastName(): string {
        return this.Get('LastName');
    }
    set LastName(value: string) {
        this.Set('LastName', value);
    }

    /**
    * * Field Name: Title
    * * Display Name: Title
    * * SQL Data Type: nvarchar(255)
    */
    get Title(): string | null {
        return this.Get('Title');
    }
    set Title(value: string | null) {
        this.Set('Title', value);
    }

    /**
    * * Field Name: ContactType
    * * Display Name: Contact Type
    * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Agency Head
    *   * Commissioner
    *   * Committee Chair
    *   * Committee Member
    *   * Governor
    *   * Judge
    *   * Legislator
    *   * Mayor
    *   * Other
    *   * Regulator
    *   * Representative
    *   * Senator
    *   * Staff Member
    */
    get ContactType(): 'Agency Head' | 'Commissioner' | 'Committee Chair' | 'Committee Member' | 'Governor' | 'Judge' | 'Legislator' | 'Mayor' | 'Other' | 'Regulator' | 'Representative' | 'Senator' | 'Staff Member' {
        return this.Get('ContactType');
    }
    set ContactType(value: 'Agency Head' | 'Commissioner' | 'Committee Chair' | 'Committee Member' | 'Governor' | 'Judge' | 'Legislator' | 'Mayor' | 'Other' | 'Regulator' | 'Representative' | 'Senator' | 'Staff Member') {
        this.Set('ContactType', value);
    }

    /**
    * * Field Name: Party
    * * Display Name: Party
    * * SQL Data Type: nvarchar(50)
    */
    get Party(): string | null {
        return this.Get('Party');
    }
    set Party(value: string | null) {
        this.Set('Party', value);
    }

    /**
    * * Field Name: District
    * * Display Name: District
    * * SQL Data Type: nvarchar(100)
    */
    get District(): string | null {
        return this.Get('District');
    }
    set District(value: string | null) {
        this.Set('District', value);
    }

    /**
    * * Field Name: Committee
    * * Display Name: Committee
    * * SQL Data Type: nvarchar(255)
    */
    get Committee(): string | null {
        return this.Get('Committee');
    }
    set Committee(value: string | null) {
        this.Set('Committee', value);
    }

    /**
    * * Field Name: Email
    * * Display Name: Email
    * * SQL Data Type: nvarchar(255)
    */
    get Email(): string | null {
        return this.Get('Email');
    }
    set Email(value: string | null) {
        this.Set('Email', value);
    }

    /**
    * * Field Name: Phone
    * * Display Name: Phone
    * * SQL Data Type: nvarchar(50)
    */
    get Phone(): string | null {
        return this.Get('Phone');
    }
    set Phone(value: string | null) {
        this.Set('Phone', value);
    }

    /**
    * * Field Name: OfficeAddress
    * * Display Name: Office Address
    * * SQL Data Type: nvarchar(500)
    */
    get OfficeAddress(): string | null {
        return this.Get('OfficeAddress');
    }
    set OfficeAddress(value: string | null) {
        this.Set('OfficeAddress', value);
    }

    /**
    * * Field Name: Website
    * * Display Name: Website
    * * SQL Data Type: nvarchar(500)
    */
    get Website(): string | null {
        return this.Get('Website');
    }
    set Website(value: string | null) {
        this.Set('Website', value);
    }

    /**
    * * Field Name: TermStart
    * * Display Name: Term Start
    * * SQL Data Type: date
    */
    get TermStart(): Date | null {
        return this.Get('TermStart');
    }
    set TermStart(value: Date | null) {
        this.Set('TermStart', value);
    }

    /**
    * * Field Name: TermEnd
    * * Display Name: Term End
    * * SQL Data Type: date
    */
    get TermEnd(): Date | null {
        return this.Get('TermEnd');
    }
    set TermEnd(value: Date | null) {
        this.Set('TermEnd', value);
    }

    /**
    * * Field Name: Notes
    * * Display Name: Notes
    * * SQL Data Type: nvarchar(MAX)
    */
    get Notes(): string | null {
        return this.Get('Notes');
    }
    set Notes(value: string | null) {
        this.Set('Notes', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get IsActive(): boolean | null {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean | null) {
        this.Set('IsActive', value);
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
    * * Field Name: LegislativeBody
    * * Display Name: Legislative Body
    * * SQL Data Type: nvarchar(255)
    */
    get LegislativeBody(): string | null {
        return this.Get('LegislativeBody');
    }
}


/**
 * Invoice Line Items - strongly typed entity sub-class
 * * Schema: AssociationDemo
 * * Base Table: InvoiceLineItem
 * * Base View: vwInvoiceLineItems
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Invoice Line Items')
export class AssociationDemoInvoiceLineItemEntity extends BaseEntity<AssociationDemoInvoiceLineItemEntityType> {
    /**
    * Loads the Invoice Line Items record from the database
    * @param ID: string - primary key value to load the Invoice Line Items record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AssociationDemoInvoiceLineItemEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: InvoiceID
    * * Display Name: Invoice ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Invoices (vwInvoices.ID)
    */
    get InvoiceID(): string {
        return this.Get('InvoiceID');
    }
    set InvoiceID(value: string) {
        this.Set('InvoiceID', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(500)
    */
    get Description(): string {
        return this.Get('Description');
    }
    set Description(value: string) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: ItemType
    * * Display Name: Item Type
    * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Course Enrollment
    *   * Donation
    *   * Event Registration
    *   * Membership Dues
    *   * Merchandise
    *   * Other
    */
    get ItemType(): 'Course Enrollment' | 'Donation' | 'Event Registration' | 'Membership Dues' | 'Merchandise' | 'Other' {
        return this.Get('ItemType');
    }
    set ItemType(value: 'Course Enrollment' | 'Donation' | 'Event Registration' | 'Membership Dues' | 'Merchandise' | 'Other') {
        this.Set('ItemType', value);
    }

    /**
    * * Field Name: Quantity
    * * Display Name: Quantity
    * * SQL Data Type: int
    * * Default Value: 1
    */
    get Quantity(): number | null {
        return this.Get('Quantity');
    }
    set Quantity(value: number | null) {
        this.Set('Quantity', value);
    }

    /**
    * * Field Name: UnitPrice
    * * Display Name: Unit Price
    * * SQL Data Type: decimal(10, 2)
    */
    get UnitPrice(): number {
        return this.Get('UnitPrice');
    }
    set UnitPrice(value: number) {
        this.Set('UnitPrice', value);
    }

    /**
    * * Field Name: Amount
    * * Display Name: Amount
    * * SQL Data Type: decimal(12, 2)
    */
    get Amount(): number {
        return this.Get('Amount');
    }
    set Amount(value: number) {
        this.Set('Amount', value);
    }

    /**
    * * Field Name: TaxAmount
    * * Display Name: Tax Amount
    * * SQL Data Type: decimal(12, 2)
    * * Default Value: 0
    */
    get TaxAmount(): number | null {
        return this.Get('TaxAmount');
    }
    set TaxAmount(value: number | null) {
        this.Set('TaxAmount', value);
    }

    /**
    * * Field Name: RelatedEntityType
    * * Display Name: Related Entity Type
    * * SQL Data Type: nvarchar(100)
    */
    get RelatedEntityType(): string | null {
        return this.Get('RelatedEntityType');
    }
    set RelatedEntityType(value: string | null) {
        this.Set('RelatedEntityType', value);
    }

    /**
    * * Field Name: RelatedEntityID
    * * Display Name: Related Entity ID
    * * SQL Data Type: uniqueidentifier
    */
    get RelatedEntityID(): string | null {
        return this.Get('RelatedEntityID');
    }
    set RelatedEntityID(value: string | null) {
        this.Set('RelatedEntityID', value);
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
 * Invoices - strongly typed entity sub-class
 * * Schema: AssociationDemo
 * * Base Table: Invoice
 * * Base View: vwInvoices
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Invoices')
export class AssociationDemoInvoiceEntity extends BaseEntity<AssociationDemoInvoiceEntityType> {
    /**
    * Loads the Invoices record from the database
    * @param ID: string - primary key value to load the Invoices record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AssociationDemoInvoiceEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: InvoiceNumber
    * * Display Name: Invoice Number
    * * SQL Data Type: nvarchar(50)
    */
    get InvoiceNumber(): string {
        return this.Get('InvoiceNumber');
    }
    set InvoiceNumber(value: string) {
        this.Set('InvoiceNumber', value);
    }

    /**
    * * Field Name: MemberID
    * * Display Name: Member ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Members (vwMembers.ID)
    */
    get MemberID(): string {
        return this.Get('MemberID');
    }
    set MemberID(value: string) {
        this.Set('MemberID', value);
    }

    /**
    * * Field Name: InvoiceDate
    * * Display Name: Invoice Date
    * * SQL Data Type: date
    */
    get InvoiceDate(): Date {
        return this.Get('InvoiceDate');
    }
    set InvoiceDate(value: Date) {
        this.Set('InvoiceDate', value);
    }

    /**
    * * Field Name: DueDate
    * * Display Name: Due Date
    * * SQL Data Type: date
    */
    get DueDate(): Date {
        return this.Get('DueDate');
    }
    set DueDate(value: Date) {
        this.Set('DueDate', value);
    }

    /**
    * * Field Name: SubTotal
    * * Display Name: Sub Total
    * * SQL Data Type: decimal(12, 2)
    */
    get SubTotal(): number {
        return this.Get('SubTotal');
    }
    set SubTotal(value: number) {
        this.Set('SubTotal', value);
    }

    /**
    * * Field Name: Tax
    * * Display Name: Tax
    * * SQL Data Type: decimal(12, 2)
    * * Default Value: 0
    */
    get Tax(): number | null {
        return this.Get('Tax');
    }
    set Tax(value: number | null) {
        this.Set('Tax', value);
    }

    /**
    * * Field Name: Discount
    * * Display Name: Discount
    * * SQL Data Type: decimal(12, 2)
    * * Default Value: 0
    */
    get Discount(): number | null {
        return this.Get('Discount');
    }
    set Discount(value: number | null) {
        this.Set('Discount', value);
    }

    /**
    * * Field Name: Total
    * * Display Name: Total
    * * SQL Data Type: decimal(12, 2)
    */
    get Total(): number {
        return this.Get('Total');
    }
    set Total(value: number) {
        this.Set('Total', value);
    }

    /**
    * * Field Name: AmountPaid
    * * Display Name: Amount Paid
    * * SQL Data Type: decimal(12, 2)
    * * Default Value: 0
    */
    get AmountPaid(): number | null {
        return this.Get('AmountPaid');
    }
    set AmountPaid(value: number | null) {
        this.Set('AmountPaid', value);
    }

    /**
    * * Field Name: Balance
    * * Display Name: Balance
    * * SQL Data Type: decimal(12, 2)
    */
    get Balance(): number {
        return this.Get('Balance');
    }
    set Balance(value: number) {
        this.Set('Balance', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Cancelled
    *   * Draft
    *   * Overdue
    *   * Paid
    *   * Partial
    *   * Refunded
    *   * Sent
    */
    get Status(): 'Cancelled' | 'Draft' | 'Overdue' | 'Paid' | 'Partial' | 'Refunded' | 'Sent' {
        return this.Get('Status');
    }
    set Status(value: 'Cancelled' | 'Draft' | 'Overdue' | 'Paid' | 'Partial' | 'Refunded' | 'Sent') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: Notes
    * * Display Name: Notes
    * * SQL Data Type: nvarchar(MAX)
    */
    get Notes(): string | null {
        return this.Get('Notes');
    }
    set Notes(value: string | null) {
        this.Set('Notes', value);
    }

    /**
    * * Field Name: PaymentTerms
    * * Display Name: Payment Terms
    * * SQL Data Type: nvarchar(100)
    */
    get PaymentTerms(): string | null {
        return this.Get('PaymentTerms');
    }
    set PaymentTerms(value: string | null) {
        this.Set('PaymentTerms', value);
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
 * Legislative Bodies - strongly typed entity sub-class
 * * Schema: AssociationDemo
 * * Base Table: LegislativeBody
 * * Base View: vwLegislativeBodies
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Legislative Bodies')
export class AssociationDemoLegislativeBodyEntity extends BaseEntity<AssociationDemoLegislativeBodyEntityType> {
    /**
    * Loads the Legislative Bodies record from the database
    * @param ID: string - primary key value to load the Legislative Bodies record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AssociationDemoLegislativeBodyEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(255)
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: BodyType
    * * Display Name: Body Type
    * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * City
    *   * County
    *   * Federal Agency
    *   * Federal Congress
    *   * International
    *   * Regulatory Board
    *   * State Agency
    *   * State Legislature
    */
    get BodyType(): 'City' | 'County' | 'Federal Agency' | 'Federal Congress' | 'International' | 'Regulatory Board' | 'State Agency' | 'State Legislature' {
        return this.Get('BodyType');
    }
    set BodyType(value: 'City' | 'County' | 'Federal Agency' | 'Federal Congress' | 'International' | 'Regulatory Board' | 'State Agency' | 'State Legislature') {
        this.Set('BodyType', value);
    }

    /**
    * * Field Name: Level
    * * Display Name: Level
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * City
    *   * County
    *   * Federal
    *   * International
    *   * State
    */
    get Level(): 'City' | 'County' | 'Federal' | 'International' | 'State' {
        return this.Get('Level');
    }
    set Level(value: 'City' | 'County' | 'Federal' | 'International' | 'State') {
        this.Set('Level', value);
    }

    /**
    * * Field Name: State
    * * Display Name: State
    * * SQL Data Type: nvarchar(2)
    */
    get State(): string | null {
        return this.Get('State');
    }
    set State(value: string | null) {
        this.Set('State', value);
    }

    /**
    * * Field Name: Country
    * * Display Name: Country
    * * SQL Data Type: nvarchar(100)
    * * Default Value: United States
    */
    get Country(): string | null {
        return this.Get('Country');
    }
    set Country(value: string | null) {
        this.Set('Country', value);
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
    * * Field Name: Website
    * * Display Name: Website
    * * SQL Data Type: nvarchar(500)
    */
    get Website(): string | null {
        return this.Get('Website');
    }
    set Website(value: string | null) {
        this.Set('Website', value);
    }

    /**
    * * Field Name: SessionSchedule
    * * Display Name: Session Schedule
    * * SQL Data Type: nvarchar(500)
    */
    get SessionSchedule(): string | null {
        return this.Get('SessionSchedule');
    }
    set SessionSchedule(value: string | null) {
        this.Set('SessionSchedule', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get IsActive(): boolean | null {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean | null) {
        this.Set('IsActive', value);
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
 * Legislative Issues - strongly typed entity sub-class
 * * Schema: AssociationDemo
 * * Base Table: LegislativeIssue
 * * Base View: vwLegislativeIssues
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Legislative Issues')
export class AssociationDemoLegislativeIssueEntity extends BaseEntity<AssociationDemoLegislativeIssueEntityType> {
    /**
    * Loads the Legislative Issues record from the database
    * @param ID: string - primary key value to load the Legislative Issues record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AssociationDemoLegislativeIssueEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: LegislativeBodyID
    * * Display Name: Legislative Body ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Legislative Bodies (vwLegislativeBodies.ID)
    */
    get LegislativeBodyID(): string {
        return this.Get('LegislativeBodyID');
    }
    set LegislativeBodyID(value: string) {
        this.Set('LegislativeBodyID', value);
    }

    /**
    * * Field Name: Title
    * * Display Name: Title
    * * SQL Data Type: nvarchar(500)
    */
    get Title(): string {
        return this.Get('Title');
    }
    set Title(value: string) {
        this.Set('Title', value);
    }

    /**
    * * Field Name: IssueType
    * * Display Name: Issue Type
    * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Amendment
    *   * Bill
    *   * Court Case
    *   * Executive Order
    *   * Policy
    *   * Regulation
    *   * Resolution
    *   * Rule
    */
    get IssueType(): 'Amendment' | 'Bill' | 'Court Case' | 'Executive Order' | 'Policy' | 'Regulation' | 'Resolution' | 'Rule' {
        return this.Get('IssueType');
    }
    set IssueType(value: 'Amendment' | 'Bill' | 'Court Case' | 'Executive Order' | 'Policy' | 'Regulation' | 'Resolution' | 'Rule') {
        this.Set('IssueType', value);
    }

    /**
    * * Field Name: BillNumber
    * * Display Name: Bill Number
    * * SQL Data Type: nvarchar(100)
    */
    get BillNumber(): string | null {
        return this.Get('BillNumber');
    }
    set BillNumber(value: string | null) {
        this.Set('BillNumber', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Comment Period
    *   * Enacted
    *   * Failed
    *   * Final Rule
    *   * Floor Vote Pending
    *   * In Committee
    *   * Introduced
    *   * Passed Committee
    *   * Passed House
    *   * Passed Senate
    *   * Signed
    *   * Vetoed
    *   * Withdrawn
    */
    get Status(): 'Comment Period' | 'Enacted' | 'Failed' | 'Final Rule' | 'Floor Vote Pending' | 'In Committee' | 'Introduced' | 'Passed Committee' | 'Passed House' | 'Passed Senate' | 'Signed' | 'Vetoed' | 'Withdrawn' {
        return this.Get('Status');
    }
    set Status(value: 'Comment Period' | 'Enacted' | 'Failed' | 'Final Rule' | 'Floor Vote Pending' | 'In Committee' | 'Introduced' | 'Passed Committee' | 'Passed House' | 'Passed Senate' | 'Signed' | 'Vetoed' | 'Withdrawn') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: IntroducedDate
    * * Display Name: Introduced Date
    * * SQL Data Type: date
    */
    get IntroducedDate(): Date | null {
        return this.Get('IntroducedDate');
    }
    set IntroducedDate(value: Date | null) {
        this.Set('IntroducedDate', value);
    }

    /**
    * * Field Name: LastActionDate
    * * Display Name: Last Action Date
    * * SQL Data Type: date
    */
    get LastActionDate(): Date | null {
        return this.Get('LastActionDate');
    }
    set LastActionDate(value: Date | null) {
        this.Set('LastActionDate', value);
    }

    /**
    * * Field Name: EffectiveDate
    * * Display Name: Effective Date
    * * SQL Data Type: date
    */
    get EffectiveDate(): Date | null {
        return this.Get('EffectiveDate');
    }
    set EffectiveDate(value: Date | null) {
        this.Set('EffectiveDate', value);
    }

    /**
    * * Field Name: Summary
    * * Display Name: Summary
    * * SQL Data Type: nvarchar(MAX)
    */
    get Summary(): string | null {
        return this.Get('Summary');
    }
    set Summary(value: string | null) {
        this.Set('Summary', value);
    }

    /**
    * * Field Name: ImpactLevel
    * * Display Name: Impact Level
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Critical
    *   * High
    *   * Low
    *   * Medium
    *   * Monitoring
    */
    get ImpactLevel(): 'Critical' | 'High' | 'Low' | 'Medium' | 'Monitoring' | null {
        return this.Get('ImpactLevel');
    }
    set ImpactLevel(value: 'Critical' | 'High' | 'Low' | 'Medium' | 'Monitoring' | null) {
        this.Set('ImpactLevel', value);
    }

    /**
    * * Field Name: ImpactDescription
    * * Display Name: Impact Description
    * * SQL Data Type: nvarchar(MAX)
    */
    get ImpactDescription(): string | null {
        return this.Get('ImpactDescription');
    }
    set ImpactDescription(value: string | null) {
        this.Set('ImpactDescription', value);
    }

    /**
    * * Field Name: Category
    * * Display Name: Category
    * * SQL Data Type: nvarchar(100)
    * * Value List Type: List
    * * Possible Values 
    *   * Animal Welfare
    *   * Dairy Pricing
    *   * Environmental
    *   * Farm Bill
    *   * Food Safety
    *   * Import/Export
    *   * Labeling
    *   * Labor
    *   * Organic Standards
    *   * Other
    *   * Raw Milk
    *   * Taxation
    *   * Trade
    */
    get Category(): 'Animal Welfare' | 'Dairy Pricing' | 'Environmental' | 'Farm Bill' | 'Food Safety' | 'Import/Export' | 'Labeling' | 'Labor' | 'Organic Standards' | 'Other' | 'Raw Milk' | 'Taxation' | 'Trade' | null {
        return this.Get('Category');
    }
    set Category(value: 'Animal Welfare' | 'Dairy Pricing' | 'Environmental' | 'Farm Bill' | 'Food Safety' | 'Import/Export' | 'Labeling' | 'Labor' | 'Organic Standards' | 'Other' | 'Raw Milk' | 'Taxation' | 'Trade' | null) {
        this.Set('Category', value);
    }

    /**
    * * Field Name: Sponsor
    * * Display Name: Sponsor
    * * SQL Data Type: nvarchar(255)
    */
    get Sponsor(): string | null {
        return this.Get('Sponsor');
    }
    set Sponsor(value: string | null) {
        this.Set('Sponsor', value);
    }

    /**
    * * Field Name: TrackingURL
    * * Display Name: Tracking URL
    * * SQL Data Type: nvarchar(500)
    */
    get TrackingURL(): string | null {
        return this.Get('TrackingURL');
    }
    set TrackingURL(value: string | null) {
        this.Set('TrackingURL', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get IsActive(): boolean | null {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean | null) {
        this.Set('IsActive', value);
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
    * * Field Name: LegislativeBody
    * * Display Name: Legislative Body
    * * SQL Data Type: nvarchar(255)
    */
    get LegislativeBody(): string {
        return this.Get('LegislativeBody');
    }
}


/**
 * Member Follows - strongly typed entity sub-class
 * * Schema: AssociationDemo
 * * Base Table: MemberFollow
 * * Base View: vwMemberFollows
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Member Follows')
export class AssociationDemoMemberFollowEntity extends BaseEntity<AssociationDemoMemberFollowEntityType> {
    /**
    * Loads the Member Follows record from the database
    * @param ID: string - primary key value to load the Member Follows record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AssociationDemoMemberFollowEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: FollowerID
    * * Display Name: Follower ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Members (vwMembers.ID)
    */
    get FollowerID(): string {
        return this.Get('FollowerID');
    }
    set FollowerID(value: string) {
        this.Set('FollowerID', value);
    }

    /**
    * * Field Name: FollowType
    * * Display Name: Follow Type
    * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Category
    *   * Member
    *   * Tag
    *   * Thread
    */
    get FollowType(): 'Category' | 'Member' | 'Tag' | 'Thread' {
        return this.Get('FollowType');
    }
    set FollowType(value: 'Category' | 'Member' | 'Tag' | 'Thread') {
        this.Set('FollowType', value);
    }

    /**
    * * Field Name: FollowedEntityID
    * * Display Name: Followed Entity ID
    * * SQL Data Type: uniqueidentifier
    */
    get FollowedEntityID(): string {
        return this.Get('FollowedEntityID');
    }
    set FollowedEntityID(value: string) {
        this.Set('FollowedEntityID', value);
    }

    /**
    * * Field Name: CreatedDate
    * * Display Name: Created Date
    * * SQL Data Type: datetime
    * * Default Value: getdate()
    */
    get CreatedDate(): Date {
        return this.Get('CreatedDate');
    }
    set CreatedDate(value: Date) {
        this.Set('CreatedDate', value);
    }

    /**
    * * Field Name: NotifyOnActivity
    * * Display Name: Notify On Activity
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get NotifyOnActivity(): boolean | null {
        return this.Get('NotifyOnActivity');
    }
    set NotifyOnActivity(value: boolean | null) {
        this.Set('NotifyOnActivity', value);
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
 * * Schema: AssociationDemo
 * * Base Table: Member
 * * Base View: vwMembers
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Members')
export class AssociationDemoMemberEntity extends BaseEntity<AssociationDemoMemberEntityType> {
    /**
    * Loads the Members record from the database
    * @param ID: string - primary key value to load the Members record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AssociationDemoMemberEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
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
    * * SQL Data Type: nvarchar(100)
    */
    get FirstName(): string {
        return this.Get('FirstName');
    }
    set FirstName(value: string) {
        this.Set('FirstName', value);
    }

    /**
    * * Field Name: LastName
    * * Display Name: Last Name
    * * SQL Data Type: nvarchar(100)
    */
    get LastName(): string {
        return this.Get('LastName');
    }
    set LastName(value: string) {
        this.Set('LastName', value);
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
    * * Field Name: OrganizationID
    * * Display Name: Organization ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Organizations (vwOrganizations.ID)
    */
    get OrganizationID(): string | null {
        return this.Get('OrganizationID');
    }
    set OrganizationID(value: string | null) {
        this.Set('OrganizationID', value);
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
    * * Field Name: JobFunction
    * * Display Name: Job Function
    * * SQL Data Type: nvarchar(100)
    */
    get JobFunction(): string | null {
        return this.Get('JobFunction');
    }
    set JobFunction(value: string | null) {
        this.Set('JobFunction', value);
    }

    /**
    * * Field Name: YearsInProfession
    * * Display Name: Years In Profession
    * * SQL Data Type: int
    */
    get YearsInProfession(): number | null {
        return this.Get('YearsInProfession');
    }
    set YearsInProfession(value: number | null) {
        this.Set('YearsInProfession', value);
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
    * * Field Name: LinkedInURL
    * * Display Name: Linked In URL
    * * SQL Data Type: nvarchar(500)
    */
    get LinkedInURL(): string | null {
        return this.Get('LinkedInURL');
    }
    set LinkedInURL(value: string | null) {
        this.Set('LinkedInURL', value);
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
    * * Field Name: PreferredLanguage
    * * Display Name: Preferred Language
    * * SQL Data Type: nvarchar(10)
    * * Default Value: en-US
    */
    get PreferredLanguage(): string | null {
        return this.Get('PreferredLanguage');
    }
    set PreferredLanguage(value: string | null) {
        this.Set('PreferredLanguage', value);
    }

    /**
    * * Field Name: Timezone
    * * Display Name: Timezone
    * * SQL Data Type: nvarchar(50)
    */
    get Timezone(): string | null {
        return this.Get('Timezone');
    }
    set Timezone(value: string | null) {
        this.Set('Timezone', value);
    }

    /**
    * * Field Name: Phone
    * * Display Name: Phone
    * * SQL Data Type: nvarchar(50)
    */
    get Phone(): string | null {
        return this.Get('Phone');
    }
    set Phone(value: string | null) {
        this.Set('Phone', value);
    }

    /**
    * * Field Name: Mobile
    * * Display Name: Mobile
    * * SQL Data Type: nvarchar(50)
    */
    get Mobile(): string | null {
        return this.Get('Mobile');
    }
    set Mobile(value: string | null) {
        this.Set('Mobile', value);
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
    * * SQL Data Type: nvarchar(50)
    */
    get State(): string | null {
        return this.Get('State');
    }
    set State(value: string | null) {
        this.Set('State', value);
    }

    /**
    * * Field Name: Country
    * * Display Name: Country
    * * SQL Data Type: nvarchar(100)
    * * Default Value: United States
    */
    get Country(): string | null {
        return this.Get('Country');
    }
    set Country(value: string | null) {
        this.Set('Country', value);
    }

    /**
    * * Field Name: PostalCode
    * * Display Name: Postal Code
    * * SQL Data Type: nvarchar(20)
    */
    get PostalCode(): string | null {
        return this.Get('PostalCode');
    }
    set PostalCode(value: string | null) {
        this.Set('PostalCode', value);
    }

    /**
    * * Field Name: EngagementScore
    * * Display Name: Engagement Score
    * * SQL Data Type: int
    * * Default Value: 0
    */
    get EngagementScore(): number | null {
        return this.Get('EngagementScore');
    }
    set EngagementScore(value: number | null) {
        this.Set('EngagementScore', value);
    }

    /**
    * * Field Name: LastActivityDate
    * * Display Name: Last Activity Date
    * * SQL Data Type: datetime
    */
    get LastActivityDate(): Date | null {
        return this.Get('LastActivityDate');
    }
    set LastActivityDate(value: Date | null) {
        this.Set('LastActivityDate', value);
    }

    /**
    * * Field Name: ProfilePhotoURL
    * * Display Name: Profile Photo URL
    * * SQL Data Type: nvarchar(500)
    */
    get ProfilePhotoURL(): string | null {
        return this.Get('ProfilePhotoURL');
    }
    set ProfilePhotoURL(value: string | null) {
        this.Set('ProfilePhotoURL', value);
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
    * * Field Name: Organization
    * * Display Name: Organization
    * * SQL Data Type: nvarchar(255)
    */
    get Organization(): string | null {
        return this.Get('Organization');
    }
}


/**
 * Membership Types - strongly typed entity sub-class
 * * Schema: AssociationDemo
 * * Base Table: MembershipType
 * * Base View: vwMembershipTypes
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Membership Types')
export class AssociationDemoMembershipTypeEntity extends BaseEntity<AssociationDemoMembershipTypeEntityType> {
    /**
    * Loads the Membership Types record from the database
    * @param ID: string - primary key value to load the Membership Types record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AssociationDemoMembershipTypeEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(100)
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
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
    * * SQL Data Type: decimal(10, 2)
    */
    get AnnualDues(): number {
        return this.Get('AnnualDues');
    }
    set AnnualDues(value: number) {
        this.Set('AnnualDues', value);
    }

    /**
    * * Field Name: RenewalPeriodMonths
    * * Display Name: Renewal Period Months
    * * SQL Data Type: int
    * * Default Value: 12
    */
    get RenewalPeriodMonths(): number {
        return this.Get('RenewalPeriodMonths');
    }
    set RenewalPeriodMonths(value: number) {
        this.Set('RenewalPeriodMonths', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get IsActive(): boolean {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean) {
        this.Set('IsActive', value);
    }

    /**
    * * Field Name: AllowAutoRenew
    * * Display Name: Allow Auto Renew
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get AllowAutoRenew(): boolean {
        return this.Get('AllowAutoRenew');
    }
    set AllowAutoRenew(value: boolean) {
        this.Set('AllowAutoRenew', value);
    }

    /**
    * * Field Name: RequiresApproval
    * * Display Name: Requires Approval
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get RequiresApproval(): boolean {
        return this.Get('RequiresApproval');
    }
    set RequiresApproval(value: boolean) {
        this.Set('RequiresApproval', value);
    }

    /**
    * * Field Name: Benefits
    * * Display Name: Benefits
    * * SQL Data Type: nvarchar(MAX)
    */
    get Benefits(): string | null {
        return this.Get('Benefits');
    }
    set Benefits(value: string | null) {
        this.Set('Benefits', value);
    }

    /**
    * * Field Name: DisplayOrder
    * * Display Name: Display Order
    * * SQL Data Type: int
    */
    get DisplayOrder(): number | null {
        return this.Get('DisplayOrder');
    }
    set DisplayOrder(value: number | null) {
        this.Set('DisplayOrder', value);
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
 * Memberships - strongly typed entity sub-class
 * * Schema: AssociationDemo
 * * Base Table: Membership
 * * Base View: vwMemberships
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Memberships')
export class AssociationDemoMembershipEntity extends BaseEntity<AssociationDemoMembershipEntityType> {
    /**
    * Loads the Memberships record from the database
    * @param ID: string - primary key value to load the Memberships record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AssociationDemoMembershipEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: MemberID
    * * Display Name: Member ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Members (vwMembers.ID)
    */
    get MemberID(): string {
        return this.Get('MemberID');
    }
    set MemberID(value: string) {
        this.Set('MemberID', value);
    }

    /**
    * * Field Name: MembershipTypeID
    * * Display Name: Membership Type ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Membership Types (vwMembershipTypes.ID)
    */
    get MembershipTypeID(): string {
        return this.Get('MembershipTypeID');
    }
    set MembershipTypeID(value: string) {
        this.Set('MembershipTypeID', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Cancelled
    *   * Lapsed
    *   * Pending
    *   * Suspended
    */
    get Status(): 'Active' | 'Cancelled' | 'Lapsed' | 'Pending' | 'Suspended' {
        return this.Get('Status');
    }
    set Status(value: 'Active' | 'Cancelled' | 'Lapsed' | 'Pending' | 'Suspended') {
        this.Set('Status', value);
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
    get EndDate(): Date {
        return this.Get('EndDate');
    }
    set EndDate(value: Date) {
        this.Set('EndDate', value);
    }

    /**
    * * Field Name: RenewalDate
    * * Display Name: Renewal Date
    * * SQL Data Type: date
    */
    get RenewalDate(): Date | null {
        return this.Get('RenewalDate');
    }
    set RenewalDate(value: Date | null) {
        this.Set('RenewalDate', value);
    }

    /**
    * * Field Name: AutoRenew
    * * Display Name: Auto Renew
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get AutoRenew(): boolean {
        return this.Get('AutoRenew');
    }
    set AutoRenew(value: boolean) {
        this.Set('AutoRenew', value);
    }

    /**
    * * Field Name: CancellationDate
    * * Display Name: Cancellation Date
    * * SQL Data Type: date
    */
    get CancellationDate(): Date | null {
        return this.Get('CancellationDate');
    }
    set CancellationDate(value: Date | null) {
        this.Set('CancellationDate', value);
    }

    /**
    * * Field Name: CancellationReason
    * * Display Name: Cancellation Reason
    * * SQL Data Type: nvarchar(MAX)
    */
    get CancellationReason(): string | null {
        return this.Get('CancellationReason');
    }
    set CancellationReason(value: string | null) {
        this.Set('CancellationReason', value);
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
    * * Field Name: MembershipType
    * * Display Name: Membership Type
    * * SQL Data Type: nvarchar(100)
    */
    get MembershipType(): string {
        return this.Get('MembershipType');
    }
}


/**
 * Organizations - strongly typed entity sub-class
 * * Schema: AssociationDemo
 * * Base Table: Organization
 * * Base View: vwOrganizations
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Organizations')
export class AssociationDemoOrganizationEntity extends BaseEntity<AssociationDemoOrganizationEntityType> {
    /**
    * Loads the Organizations record from the database
    * @param ID: string - primary key value to load the Organizations record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AssociationDemoOrganizationEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(255)
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
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
    * * Field Name: EmployeeCount
    * * Display Name: Employee Count
    * * SQL Data Type: int
    */
    get EmployeeCount(): number | null {
        return this.Get('EmployeeCount');
    }
    set EmployeeCount(value: number | null) {
        this.Set('EmployeeCount', value);
    }

    /**
    * * Field Name: AnnualRevenue
    * * Display Name: Annual Revenue
    * * SQL Data Type: decimal(18, 2)
    */
    get AnnualRevenue(): number | null {
        return this.Get('AnnualRevenue');
    }
    set AnnualRevenue(value: number | null) {
        this.Set('AnnualRevenue', value);
    }

    /**
    * * Field Name: MarketCapitalization
    * * Display Name: Market Capitalization
    * * SQL Data Type: decimal(18, 2)
    */
    get MarketCapitalization(): number | null {
        return this.Get('MarketCapitalization');
    }
    set MarketCapitalization(value: number | null) {
        this.Set('MarketCapitalization', value);
    }

    /**
    * * Field Name: TickerSymbol
    * * Display Name: Ticker Symbol
    * * SQL Data Type: nvarchar(10)
    */
    get TickerSymbol(): string | null {
        return this.Get('TickerSymbol');
    }
    set TickerSymbol(value: string | null) {
        this.Set('TickerSymbol', value);
    }

    /**
    * * Field Name: Exchange
    * * Display Name: Exchange
    * * SQL Data Type: nvarchar(50)
    */
    get Exchange(): string | null {
        return this.Get('Exchange');
    }
    set Exchange(value: string | null) {
        this.Set('Exchange', value);
    }

    /**
    * * Field Name: Website
    * * Display Name: Website
    * * SQL Data Type: nvarchar(500)
    */
    get Website(): string | null {
        return this.Get('Website');
    }
    set Website(value: string | null) {
        this.Set('Website', value);
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
    * * Field Name: YearFounded
    * * Display Name: Year Founded
    * * SQL Data Type: int
    */
    get YearFounded(): number | null {
        return this.Get('YearFounded');
    }
    set YearFounded(value: number | null) {
        this.Set('YearFounded', value);
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
    * * SQL Data Type: nvarchar(50)
    */
    get State(): string | null {
        return this.Get('State');
    }
    set State(value: string | null) {
        this.Set('State', value);
    }

    /**
    * * Field Name: Country
    * * Display Name: Country
    * * SQL Data Type: nvarchar(100)
    * * Default Value: United States
    */
    get Country(): string | null {
        return this.Get('Country');
    }
    set Country(value: string | null) {
        this.Set('Country', value);
    }

    /**
    * * Field Name: PostalCode
    * * Display Name: Postal Code
    * * SQL Data Type: nvarchar(20)
    */
    get PostalCode(): string | null {
        return this.Get('PostalCode');
    }
    set PostalCode(value: string | null) {
        this.Set('PostalCode', value);
    }

    /**
    * * Field Name: Phone
    * * Display Name: Phone
    * * SQL Data Type: nvarchar(50)
    */
    get Phone(): string | null {
        return this.Get('Phone');
    }
    set Phone(value: string | null) {
        this.Set('Phone', value);
    }

    /**
    * * Field Name: LogoURL
    * * Display Name: Logo URL
    * * SQL Data Type: nvarchar(500)
    */
    get LogoURL(): string | null {
        return this.Get('LogoURL');
    }
    set LogoURL(value: string | null) {
        this.Set('LogoURL', value);
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
 * Payments - strongly typed entity sub-class
 * * Schema: AssociationDemo
 * * Base Table: Payment
 * * Base View: vwPayments
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Payments')
export class AssociationDemoPaymentEntity extends BaseEntity<AssociationDemoPaymentEntityType> {
    /**
    * Loads the Payments record from the database
    * @param ID: string - primary key value to load the Payments record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AssociationDemoPaymentEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: InvoiceID
    * * Display Name: Invoice ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Invoices (vwInvoices.ID)
    */
    get InvoiceID(): string {
        return this.Get('InvoiceID');
    }
    set InvoiceID(value: string) {
        this.Set('InvoiceID', value);
    }

    /**
    * * Field Name: PaymentDate
    * * Display Name: Payment Date
    * * SQL Data Type: datetime
    */
    get PaymentDate(): Date {
        return this.Get('PaymentDate');
    }
    set PaymentDate(value: Date) {
        this.Set('PaymentDate', value);
    }

    /**
    * * Field Name: Amount
    * * Display Name: Amount
    * * SQL Data Type: decimal(12, 2)
    */
    get Amount(): number {
        return this.Get('Amount');
    }
    set Amount(value: number) {
        this.Set('Amount', value);
    }

    /**
    * * Field Name: PaymentMethod
    * * Display Name: Payment Method
    * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * ACH
    *   * Cash
    *   * Check
    *   * Credit Card
    *   * PayPal
    *   * Stripe
    *   * Wire
    */
    get PaymentMethod(): 'ACH' | 'Cash' | 'Check' | 'Credit Card' | 'PayPal' | 'Stripe' | 'Wire' {
        return this.Get('PaymentMethod');
    }
    set PaymentMethod(value: 'ACH' | 'Cash' | 'Check' | 'Credit Card' | 'PayPal' | 'Stripe' | 'Wire') {
        this.Set('PaymentMethod', value);
    }

    /**
    * * Field Name: TransactionID
    * * Display Name: Transaction ID
    * * SQL Data Type: nvarchar(255)
    */
    get TransactionID(): string | null {
        return this.Get('TransactionID');
    }
    set TransactionID(value: string | null) {
        this.Set('TransactionID', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Cancelled
    *   * Completed
    *   * Failed
    *   * Pending
    *   * Refunded
    */
    get Status(): 'Cancelled' | 'Completed' | 'Failed' | 'Pending' | 'Refunded' {
        return this.Get('Status');
    }
    set Status(value: 'Cancelled' | 'Completed' | 'Failed' | 'Pending' | 'Refunded') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: ProcessedDate
    * * Display Name: Processed Date
    * * SQL Data Type: datetime
    */
    get ProcessedDate(): Date | null {
        return this.Get('ProcessedDate');
    }
    set ProcessedDate(value: Date | null) {
        this.Set('ProcessedDate', value);
    }

    /**
    * * Field Name: FailureReason
    * * Display Name: Failure Reason
    * * SQL Data Type: nvarchar(MAX)
    */
    get FailureReason(): string | null {
        return this.Get('FailureReason');
    }
    set FailureReason(value: string | null) {
        this.Set('FailureReason', value);
    }

    /**
    * * Field Name: Notes
    * * Display Name: Notes
    * * SQL Data Type: nvarchar(MAX)
    */
    get Notes(): string | null {
        return this.Get('Notes');
    }
    set Notes(value: string | null) {
        this.Set('Notes', value);
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
 * Policy Positions - strongly typed entity sub-class
 * * Schema: AssociationDemo
 * * Base Table: PolicyPosition
 * * Base View: vwPolicyPositions
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Policy Positions')
export class AssociationDemoPolicyPositionEntity extends BaseEntity<AssociationDemoPolicyPositionEntityType> {
    /**
    * Loads the Policy Positions record from the database
    * @param ID: string - primary key value to load the Policy Positions record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AssociationDemoPolicyPositionEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: LegislativeIssueID
    * * Display Name: Legislative Issue ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Legislative Issues (vwLegislativeIssues.ID)
    */
    get LegislativeIssueID(): string {
        return this.Get('LegislativeIssueID');
    }
    set LegislativeIssueID(value: string) {
        this.Set('LegislativeIssueID', value);
    }

    /**
    * * Field Name: Position
    * * Display Name: Position
    * * SQL Data Type: nvarchar(30)
    * * Value List Type: List
    * * Possible Values 
    *   * Monitoring
    *   * Neutral
    *   * Oppose
    *   * Support
    *   * Support with Amendments
    */
    get Position(): 'Monitoring' | 'Neutral' | 'Oppose' | 'Support' | 'Support with Amendments' {
        return this.Get('Position');
    }
    set Position(value: 'Monitoring' | 'Neutral' | 'Oppose' | 'Support' | 'Support with Amendments') {
        this.Set('Position', value);
    }

    /**
    * * Field Name: PositionStatement
    * * Display Name: Position Statement
    * * SQL Data Type: nvarchar(MAX)
    */
    get PositionStatement(): string {
        return this.Get('PositionStatement');
    }
    set PositionStatement(value: string) {
        this.Set('PositionStatement', value);
    }

    /**
    * * Field Name: Rationale
    * * Display Name: Rationale
    * * SQL Data Type: nvarchar(MAX)
    */
    get Rationale(): string | null {
        return this.Get('Rationale');
    }
    set Rationale(value: string | null) {
        this.Set('Rationale', value);
    }

    /**
    * * Field Name: AdoptedDate
    * * Display Name: Adopted Date
    * * SQL Data Type: date
    */
    get AdoptedDate(): Date {
        return this.Get('AdoptedDate');
    }
    set AdoptedDate(value: Date) {
        this.Set('AdoptedDate', value);
    }

    /**
    * * Field Name: AdoptedBy
    * * Display Name: Adopted By
    * * SQL Data Type: nvarchar(255)
    */
    get AdoptedBy(): string | null {
        return this.Get('AdoptedBy');
    }
    set AdoptedBy(value: string | null) {
        this.Set('AdoptedBy', value);
    }

    /**
    * * Field Name: ExpirationDate
    * * Display Name: Expiration Date
    * * SQL Data Type: date
    */
    get ExpirationDate(): Date | null {
        return this.Get('ExpirationDate');
    }
    set ExpirationDate(value: Date | null) {
        this.Set('ExpirationDate', value);
    }

    /**
    * * Field Name: Priority
    * * Display Name: Priority
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Critical
    *   * High
    *   * Low
    *   * Medium
    */
    get Priority(): 'Critical' | 'High' | 'Low' | 'Medium' | null {
        return this.Get('Priority');
    }
    set Priority(value: 'Critical' | 'High' | 'Low' | 'Medium' | null) {
        this.Set('Priority', value);
    }

    /**
    * * Field Name: IsPublic
    * * Display Name: Is Public
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get IsPublic(): boolean | null {
        return this.Get('IsPublic');
    }
    set IsPublic(value: boolean | null) {
        this.Set('IsPublic', value);
    }

    /**
    * * Field Name: DocumentURL
    * * Display Name: Document URL
    * * SQL Data Type: nvarchar(500)
    */
    get DocumentURL(): string | null {
        return this.Get('DocumentURL');
    }
    set DocumentURL(value: string | null) {
        this.Set('DocumentURL', value);
    }

    /**
    * * Field Name: ContactPerson
    * * Display Name: Contact Person
    * * SQL Data Type: nvarchar(255)
    */
    get ContactPerson(): string | null {
        return this.Get('ContactPerson');
    }
    set ContactPerson(value: string | null) {
        this.Set('ContactPerson', value);
    }

    /**
    * * Field Name: LastReviewedDate
    * * Display Name: Last Reviewed Date
    * * SQL Data Type: date
    */
    get LastReviewedDate(): Date | null {
        return this.Get('LastReviewedDate');
    }
    set LastReviewedDate(value: Date | null) {
        this.Set('LastReviewedDate', value);
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
 * Post Attachments - strongly typed entity sub-class
 * * Schema: AssociationDemo
 * * Base Table: PostAttachment
 * * Base View: vwPostAttachments
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Post Attachments')
export class AssociationDemoPostAttachmentEntity extends BaseEntity<AssociationDemoPostAttachmentEntityType> {
    /**
    * Loads the Post Attachments record from the database
    * @param ID: string - primary key value to load the Post Attachments record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AssociationDemoPostAttachmentEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: PostID
    * * Display Name: Post ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Forum Posts (vwForumPosts.ID)
    */
    get PostID(): string {
        return this.Get('PostID');
    }
    set PostID(value: string) {
        this.Set('PostID', value);
    }

    /**
    * * Field Name: FileName
    * * Display Name: File Name
    * * SQL Data Type: nvarchar(255)
    */
    get FileName(): string {
        return this.Get('FileName');
    }
    set FileName(value: string) {
        this.Set('FileName', value);
    }

    /**
    * * Field Name: FileURL
    * * Display Name: File URL
    * * SQL Data Type: nvarchar(1000)
    */
    get FileURL(): string {
        return this.Get('FileURL');
    }
    set FileURL(value: string) {
        this.Set('FileURL', value);
    }

    /**
    * * Field Name: FileType
    * * Display Name: File Type
    * * SQL Data Type: nvarchar(100)
    */
    get FileType(): string | null {
        return this.Get('FileType');
    }
    set FileType(value: string | null) {
        this.Set('FileType', value);
    }

    /**
    * * Field Name: FileSizeBytes
    * * Display Name: File Size Bytes
    * * SQL Data Type: bigint
    */
    get FileSizeBytes(): number | null {
        return this.Get('FileSizeBytes');
    }
    set FileSizeBytes(value: number | null) {
        this.Set('FileSizeBytes', value);
    }

    /**
    * * Field Name: UploadedDate
    * * Display Name: Uploaded Date
    * * SQL Data Type: datetime
    * * Default Value: getdate()
    */
    get UploadedDate(): Date {
        return this.Get('UploadedDate');
    }
    set UploadedDate(value: Date) {
        this.Set('UploadedDate', value);
    }

    /**
    * * Field Name: UploadedByID
    * * Display Name: Uploaded By ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Members (vwMembers.ID)
    */
    get UploadedByID(): string {
        return this.Get('UploadedByID');
    }
    set UploadedByID(value: string) {
        this.Set('UploadedByID', value);
    }

    /**
    * * Field Name: DownloadCount
    * * Display Name: Download Count
    * * SQL Data Type: int
    * * Default Value: 0
    */
    get DownloadCount(): number | null {
        return this.Get('DownloadCount');
    }
    set DownloadCount(value: number | null) {
        this.Set('DownloadCount', value);
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
 * Post Reactions - strongly typed entity sub-class
 * * Schema: AssociationDemo
 * * Base Table: PostReaction
 * * Base View: vwPostReactions
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Post Reactions')
export class AssociationDemoPostReactionEntity extends BaseEntity<AssociationDemoPostReactionEntityType> {
    /**
    * Loads the Post Reactions record from the database
    * @param ID: string - primary key value to load the Post Reactions record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AssociationDemoPostReactionEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: PostID
    * * Display Name: Post ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Forum Posts (vwForumPosts.ID)
    */
    get PostID(): string {
        return this.Get('PostID');
    }
    set PostID(value: string) {
        this.Set('PostID', value);
    }

    /**
    * * Field Name: MemberID
    * * Display Name: Member ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Members (vwMembers.ID)
    */
    get MemberID(): string {
        return this.Get('MemberID');
    }
    set MemberID(value: string) {
        this.Set('MemberID', value);
    }

    /**
    * * Field Name: ReactionType
    * * Display Name: Reaction Type
    * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Bookmark
    *   * Flag
    *   * Helpful
    *   * Like
    *   * Thanks
    */
    get ReactionType(): 'Bookmark' | 'Flag' | 'Helpful' | 'Like' | 'Thanks' {
        return this.Get('ReactionType');
    }
    set ReactionType(value: 'Bookmark' | 'Flag' | 'Helpful' | 'Like' | 'Thanks') {
        this.Set('ReactionType', value);
    }

    /**
    * * Field Name: CreatedDate
    * * Display Name: Created Date
    * * SQL Data Type: datetime
    * * Default Value: getdate()
    */
    get CreatedDate(): Date {
        return this.Get('CreatedDate');
    }
    set CreatedDate(value: Date) {
        this.Set('CreatedDate', value);
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
 * Post Tags - strongly typed entity sub-class
 * * Schema: AssociationDemo
 * * Base Table: PostTag
 * * Base View: vwPostTags
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Post Tags')
export class AssociationDemoPostTagEntity extends BaseEntity<AssociationDemoPostTagEntityType> {
    /**
    * Loads the Post Tags record from the database
    * @param ID: string - primary key value to load the Post Tags record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AssociationDemoPostTagEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: PostID
    * * Display Name: Post ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Forum Posts (vwForumPosts.ID)
    */
    get PostID(): string {
        return this.Get('PostID');
    }
    set PostID(value: string) {
        this.Set('PostID', value);
    }

    /**
    * * Field Name: TagName
    * * Display Name: Tag Name
    * * SQL Data Type: nvarchar(100)
    */
    get TagName(): string {
        return this.Get('TagName');
    }
    set TagName(value: string) {
        this.Set('TagName', value);
    }

    /**
    * * Field Name: CreatedDate
    * * Display Name: Created Date
    * * SQL Data Type: datetime
    * * Default Value: getdate()
    */
    get CreatedDate(): Date {
        return this.Get('CreatedDate');
    }
    set CreatedDate(value: Date) {
        this.Set('CreatedDate', value);
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
 * Product Awards - strongly typed entity sub-class
 * * Schema: AssociationDemo
 * * Base Table: ProductAward
 * * Base View: vwProductAwards
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Product Awards')
export class AssociationDemoProductAwardEntity extends BaseEntity<AssociationDemoProductAwardEntityType> {
    /**
    * Loads the Product Awards record from the database
    * @param ID: string - primary key value to load the Product Awards record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AssociationDemoProductAwardEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: ProductID
    * * Display Name: Product ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Products (vwProducts.ID)
    */
    get ProductID(): string {
        return this.Get('ProductID');
    }
    set ProductID(value: string) {
        this.Set('ProductID', value);
    }

    /**
    * * Field Name: CompetitionID
    * * Display Name: Competition ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Competitions (vwCompetitions.ID)
    */
    get CompetitionID(): string | null {
        return this.Get('CompetitionID');
    }
    set CompetitionID(value: string | null) {
        this.Set('CompetitionID', value);
    }

    /**
    * * Field Name: CompetitionEntryID
    * * Display Name: Competition Entry ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Competition Entries (vwCompetitionEntries.ID)
    */
    get CompetitionEntryID(): string | null {
        return this.Get('CompetitionEntryID');
    }
    set CompetitionEntryID(value: string | null) {
        this.Set('CompetitionEntryID', value);
    }

    /**
    * * Field Name: AwardName
    * * Display Name: Award Name
    * * SQL Data Type: nvarchar(255)
    */
    get AwardName(): string {
        return this.Get('AwardName');
    }
    set AwardName(value: string) {
        this.Set('AwardName', value);
    }

    /**
    * * Field Name: AwardLevel
    * * Display Name: Award Level
    * * SQL Data Type: nvarchar(100)
    */
    get AwardLevel(): string {
        return this.Get('AwardLevel');
    }
    set AwardLevel(value: string) {
        this.Set('AwardLevel', value);
    }

    /**
    * * Field Name: AwardingOrganization
    * * Display Name: Awarding Organization
    * * SQL Data Type: nvarchar(255)
    */
    get AwardingOrganization(): string | null {
        return this.Get('AwardingOrganization');
    }
    set AwardingOrganization(value: string | null) {
        this.Set('AwardingOrganization', value);
    }

    /**
    * * Field Name: AwardDate
    * * Display Name: Award Date
    * * SQL Data Type: date
    */
    get AwardDate(): Date {
        return this.Get('AwardDate');
    }
    set AwardDate(value: Date) {
        this.Set('AwardDate', value);
    }

    /**
    * * Field Name: Year
    * * Display Name: Year
    * * SQL Data Type: int
    */
    get Year(): number {
        return this.Get('Year');
    }
    set Year(value: number) {
        this.Set('Year', value);
    }

    /**
    * * Field Name: Category
    * * Display Name: Category
    * * SQL Data Type: nvarchar(255)
    */
    get Category(): string | null {
        return this.Get('Category');
    }
    set Category(value: string | null) {
        this.Set('Category', value);
    }

    /**
    * * Field Name: Score
    * * Display Name: Score
    * * SQL Data Type: decimal(5, 2)
    */
    get Score(): number | null {
        return this.Get('Score');
    }
    set Score(value: number | null) {
        this.Set('Score', value);
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
    * * Field Name: CertificateURL
    * * Display Name: Certificate URL
    * * SQL Data Type: nvarchar(500)
    */
    get CertificateURL(): string | null {
        return this.Get('CertificateURL');
    }
    set CertificateURL(value: string | null) {
        this.Set('CertificateURL', value);
    }

    /**
    * * Field Name: IsDisplayed
    * * Display Name: Is Displayed
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get IsDisplayed(): boolean | null {
        return this.Get('IsDisplayed');
    }
    set IsDisplayed(value: boolean | null) {
        this.Set('IsDisplayed', value);
    }

    /**
    * * Field Name: DisplayOrder
    * * Display Name: Display Order
    * * SQL Data Type: int
    * * Default Value: 0
    */
    get DisplayOrder(): number | null {
        return this.Get('DisplayOrder');
    }
    set DisplayOrder(value: number | null) {
        this.Set('DisplayOrder', value);
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
    * * Field Name: Product
    * * Display Name: Product
    * * SQL Data Type: nvarchar(255)
    */
    get Product(): string {
        return this.Get('Product');
    }

    /**
    * * Field Name: Competition
    * * Display Name: Competition
    * * SQL Data Type: nvarchar(255)
    */
    get Competition(): string | null {
        return this.Get('Competition');
    }
}


/**
 * Product Categories - strongly typed entity sub-class
 * * Schema: AssociationDemo
 * * Base Table: ProductCategory
 * * Base View: vwProductCategories
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Product Categories')
export class AssociationDemoProductCategoryEntity extends BaseEntity<AssociationDemoProductCategoryEntityType> {
    /**
    * Loads the Product Categories record from the database
    * @param ID: string - primary key value to load the Product Categories record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AssociationDemoProductCategoryEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(255)
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
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
    * * Field Name: ParentCategoryID
    * * Display Name: Parent Category ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Product Categories (vwProductCategories.ID)
    */
    get ParentCategoryID(): string | null {
        return this.Get('ParentCategoryID');
    }
    set ParentCategoryID(value: string | null) {
        this.Set('ParentCategoryID', value);
    }

    /**
    * * Field Name: DisplayOrder
    * * Display Name: Display Order
    * * SQL Data Type: int
    * * Default Value: 0
    */
    get DisplayOrder(): number | null {
        return this.Get('DisplayOrder');
    }
    set DisplayOrder(value: number | null) {
        this.Set('DisplayOrder', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get IsActive(): boolean | null {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean | null) {
        this.Set('IsActive', value);
    }

    /**
    * * Field Name: ImageURL
    * * Display Name: Image URL
    * * SQL Data Type: nvarchar(500)
    */
    get ImageURL(): string | null {
        return this.Get('ImageURL');
    }
    set ImageURL(value: string | null) {
        this.Set('ImageURL', value);
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
    * * Field Name: ParentCategory
    * * Display Name: Parent Category
    * * SQL Data Type: nvarchar(255)
    */
    get ParentCategory(): string | null {
        return this.Get('ParentCategory');
    }

    /**
    * * Field Name: RootParentCategoryID
    * * Display Name: Root Parent Category ID
    * * SQL Data Type: uniqueidentifier
    */
    get RootParentCategoryID(): string | null {
        return this.Get('RootParentCategoryID');
    }
}


/**
 * Products - strongly typed entity sub-class
 * * Schema: AssociationDemo
 * * Base Table: Product
 * * Base View: vwProducts
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Products')
export class AssociationDemoProductEntity extends BaseEntity<AssociationDemoProductEntityType> {
    /**
    * Loads the Products record from the database
    * @param ID: string - primary key value to load the Products record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AssociationDemoProductEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: MemberID
    * * Display Name: Member ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Members (vwMembers.ID)
    */
    get MemberID(): string {
        return this.Get('MemberID');
    }
    set MemberID(value: string) {
        this.Set('MemberID', value);
    }

    /**
    * * Field Name: CategoryID
    * * Display Name: Category ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Product Categories (vwProductCategories.ID)
    */
    get CategoryID(): string {
        return this.Get('CategoryID');
    }
    set CategoryID(value: string) {
        this.Set('CategoryID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(255)
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
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
    * * Field Name: CheeseType
    * * Display Name: Cheese Type
    * * SQL Data Type: nvarchar(100)
    */
    get CheeseType(): string | null {
        return this.Get('CheeseType');
    }
    set CheeseType(value: string | null) {
        this.Set('CheeseType', value);
    }

    /**
    * * Field Name: MilkSource
    * * Display Name: Milk Source
    * * SQL Data Type: nvarchar(100)
    * * Value List Type: List
    * * Possible Values 
    *   * Buffalo
    *   * Cow
    *   * Goat
    *   * Mixed
    *   * Sheep
    */
    get MilkSource(): 'Buffalo' | 'Cow' | 'Goat' | 'Mixed' | 'Sheep' | null {
        return this.Get('MilkSource');
    }
    set MilkSource(value: 'Buffalo' | 'Cow' | 'Goat' | 'Mixed' | 'Sheep' | null) {
        this.Set('MilkSource', value);
    }

    /**
    * * Field Name: AgeMonths
    * * Display Name: Age Months
    * * SQL Data Type: int
    */
    get AgeMonths(): number | null {
        return this.Get('AgeMonths');
    }
    set AgeMonths(value: number | null) {
        this.Set('AgeMonths', value);
    }

    /**
    * * Field Name: Weight
    * * Display Name: Weight
    * * SQL Data Type: decimal(10, 2)
    */
    get Weight(): number | null {
        return this.Get('Weight');
    }
    set Weight(value: number | null) {
        this.Set('Weight', value);
    }

    /**
    * * Field Name: WeightUnit
    * * Display Name: Weight Unit
    * * SQL Data Type: nvarchar(20)
    * * Default Value: oz
    */
    get WeightUnit(): string | null {
        return this.Get('WeightUnit');
    }
    set WeightUnit(value: string | null) {
        this.Set('WeightUnit', value);
    }

    /**
    * * Field Name: RetailPrice
    * * Display Name: Retail Price
    * * SQL Data Type: decimal(10, 2)
    */
    get RetailPrice(): number | null {
        return this.Get('RetailPrice');
    }
    set RetailPrice(value: number | null) {
        this.Set('RetailPrice', value);
    }

    /**
    * * Field Name: IsOrganic
    * * Display Name: Is Organic
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get IsOrganic(): boolean | null {
        return this.Get('IsOrganic');
    }
    set IsOrganic(value: boolean | null) {
        this.Set('IsOrganic', value);
    }

    /**
    * * Field Name: IsRawMilk
    * * Display Name: Is Raw Milk
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get IsRawMilk(): boolean | null {
        return this.Get('IsRawMilk');
    }
    set IsRawMilk(value: boolean | null) {
        this.Set('IsRawMilk', value);
    }

    /**
    * * Field Name: IsAwardWinner
    * * Display Name: Is Award Winner
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get IsAwardWinner(): boolean | null {
        return this.Get('IsAwardWinner');
    }
    set IsAwardWinner(value: boolean | null) {
        this.Set('IsAwardWinner', value);
    }

    /**
    * * Field Name: DateIntroduced
    * * Display Name: Date Introduced
    * * SQL Data Type: date
    */
    get DateIntroduced(): Date | null {
        return this.Get('DateIntroduced');
    }
    set DateIntroduced(value: Date | null) {
        this.Set('DateIntroduced', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Discontinued
    *   * Limited Edition
    *   * Seasonal
    */
    get Status(): 'Active' | 'Discontinued' | 'Limited Edition' | 'Seasonal' | null {
        return this.Get('Status');
    }
    set Status(value: 'Active' | 'Discontinued' | 'Limited Edition' | 'Seasonal' | null) {
        this.Set('Status', value);
    }

    /**
    * * Field Name: ImageURL
    * * Display Name: Image URL
    * * SQL Data Type: nvarchar(500)
    */
    get ImageURL(): string | null {
        return this.Get('ImageURL');
    }
    set ImageURL(value: string | null) {
        this.Set('ImageURL', value);
    }

    /**
    * * Field Name: TastingNotes
    * * Display Name: Tasting Notes
    * * SQL Data Type: nvarchar(MAX)
    */
    get TastingNotes(): string | null {
        return this.Get('TastingNotes');
    }
    set TastingNotes(value: string | null) {
        this.Set('TastingNotes', value);
    }

    /**
    * * Field Name: PairingNotes
    * * Display Name: Pairing Notes
    * * SQL Data Type: nvarchar(MAX)
    */
    get PairingNotes(): string | null {
        return this.Get('PairingNotes');
    }
    set PairingNotes(value: string | null) {
        this.Set('PairingNotes', value);
    }

    /**
    * * Field Name: ProductionMethod
    * * Display Name: Production Method
    * * SQL Data Type: nvarchar(MAX)
    */
    get ProductionMethod(): string | null {
        return this.Get('ProductionMethod');
    }
    set ProductionMethod(value: string | null) {
        this.Set('ProductionMethod', value);
    }

    /**
    * * Field Name: AwardCount
    * * Display Name: Award Count
    * * SQL Data Type: int
    * * Default Value: 0
    */
    get AwardCount(): number | null {
        return this.Get('AwardCount');
    }
    set AwardCount(value: number | null) {
        this.Set('AwardCount', value);
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
    * * Field Name: Category
    * * Display Name: Category
    * * SQL Data Type: nvarchar(255)
    */
    get Category(): string {
        return this.Get('Category');
    }
}


/**
 * Regulatory Comments - strongly typed entity sub-class
 * * Schema: AssociationDemo
 * * Base Table: RegulatoryComment
 * * Base View: vwRegulatoryComments
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Regulatory Comments')
export class AssociationDemoRegulatoryCommentEntity extends BaseEntity<AssociationDemoRegulatoryCommentEntityType> {
    /**
    * Loads the Regulatory Comments record from the database
    * @param ID: string - primary key value to load the Regulatory Comments record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AssociationDemoRegulatoryCommentEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: LegislativeIssueID
    * * Display Name: Legislative Issue ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Legislative Issues (vwLegislativeIssues.ID)
    */
    get LegislativeIssueID(): string {
        return this.Get('LegislativeIssueID');
    }
    set LegislativeIssueID(value: string) {
        this.Set('LegislativeIssueID', value);
    }

    /**
    * * Field Name: DocketNumber
    * * Display Name: Docket Number
    * * SQL Data Type: nvarchar(100)
    */
    get DocketNumber(): string | null {
        return this.Get('DocketNumber');
    }
    set DocketNumber(value: string | null) {
        this.Set('DocketNumber', value);
    }

    /**
    * * Field Name: CommentPeriodStart
    * * Display Name: Comment Period Start
    * * SQL Data Type: date
    */
    get CommentPeriodStart(): Date | null {
        return this.Get('CommentPeriodStart');
    }
    set CommentPeriodStart(value: Date | null) {
        this.Set('CommentPeriodStart', value);
    }

    /**
    * * Field Name: CommentPeriodEnd
    * * Display Name: Comment Period End
    * * SQL Data Type: date
    */
    get CommentPeriodEnd(): Date | null {
        return this.Get('CommentPeriodEnd');
    }
    set CommentPeriodEnd(value: Date | null) {
        this.Set('CommentPeriodEnd', value);
    }

    /**
    * * Field Name: SubmittedDate
    * * Display Name: Submitted Date
    * * SQL Data Type: date
    */
    get SubmittedDate(): Date {
        return this.Get('SubmittedDate');
    }
    set SubmittedDate(value: Date) {
        this.Set('SubmittedDate', value);
    }

    /**
    * * Field Name: SubmittedBy
    * * Display Name: Submitted By
    * * SQL Data Type: nvarchar(255)
    */
    get SubmittedBy(): string | null {
        return this.Get('SubmittedBy');
    }
    set SubmittedBy(value: string | null) {
        this.Set('SubmittedBy', value);
    }

    /**
    * * Field Name: CommentText
    * * Display Name: Comment Text
    * * SQL Data Type: nvarchar(MAX)
    */
    get CommentText(): string {
        return this.Get('CommentText');
    }
    set CommentText(value: string) {
        this.Set('CommentText', value);
    }

    /**
    * * Field Name: CommentType
    * * Display Name: Comment Type
    * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Coalition
    *   * Individual
    *   * Organization
    *   * Public Hearing
    *   * Technical
    */
    get CommentType(): 'Coalition' | 'Individual' | 'Organization' | 'Public Hearing' | 'Technical' | null {
        return this.Get('CommentType');
    }
    set CommentType(value: 'Coalition' | 'Individual' | 'Organization' | 'Public Hearing' | 'Technical' | null) {
        this.Set('CommentType', value);
    }

    /**
    * * Field Name: AttachmentURL
    * * Display Name: Attachment URL
    * * SQL Data Type: nvarchar(500)
    */
    get AttachmentURL(): string | null {
        return this.Get('AttachmentURL');
    }
    set AttachmentURL(value: string | null) {
        this.Set('AttachmentURL', value);
    }

    /**
    * * Field Name: ConfirmationNumber
    * * Display Name: Confirmation Number
    * * SQL Data Type: nvarchar(100)
    */
    get ConfirmationNumber(): string | null {
        return this.Get('ConfirmationNumber');
    }
    set ConfirmationNumber(value: string | null) {
        this.Set('ConfirmationNumber', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Submitted
    * * Value List Type: List
    * * Possible Values 
    *   * Acknowledged
    *   * Considered
    *   * Draft
    *   * Published
    *   * Rejected
    *   * Submitted
    */
    get Status(): 'Acknowledged' | 'Considered' | 'Draft' | 'Published' | 'Rejected' | 'Submitted' | null {
        return this.Get('Status');
    }
    set Status(value: 'Acknowledged' | 'Considered' | 'Draft' | 'Published' | 'Rejected' | 'Submitted' | null) {
        this.Set('Status', value);
    }

    /**
    * * Field Name: Response
    * * Display Name: Response
    * * SQL Data Type: nvarchar(MAX)
    */
    get Response(): string | null {
        return this.Get('Response');
    }
    set Response(value: string | null) {
        this.Set('Response', value);
    }

    /**
    * * Field Name: Notes
    * * Display Name: Notes
    * * SQL Data Type: nvarchar(MAX)
    */
    get Notes(): string | null {
        return this.Get('Notes');
    }
    set Notes(value: string | null) {
        this.Set('Notes', value);
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
 * Resource Categories - strongly typed entity sub-class
 * * Schema: AssociationDemo
 * * Base Table: ResourceCategory
 * * Base View: vwResourceCategories
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Resource Categories')
export class AssociationDemoResourceCategoryEntity extends BaseEntity<AssociationDemoResourceCategoryEntityType> {
    /**
    * Loads the Resource Categories record from the database
    * @param ID: string - primary key value to load the Resource Categories record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AssociationDemoResourceCategoryEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(255)
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
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
    * * Field Name: ParentCategoryID
    * * Display Name: Parent Category ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Resource Categories (vwResourceCategories.ID)
    */
    get ParentCategoryID(): string | null {
        return this.Get('ParentCategoryID');
    }
    set ParentCategoryID(value: string | null) {
        this.Set('ParentCategoryID', value);
    }

    /**
    * * Field Name: DisplayOrder
    * * Display Name: Display Order
    * * SQL Data Type: int
    * * Default Value: 0
    */
    get DisplayOrder(): number | null {
        return this.Get('DisplayOrder');
    }
    set DisplayOrder(value: number | null) {
        this.Set('DisplayOrder', value);
    }

    /**
    * * Field Name: Icon
    * * Display Name: Icon
    * * SQL Data Type: nvarchar(100)
    */
    get Icon(): string | null {
        return this.Get('Icon');
    }
    set Icon(value: string | null) {
        this.Set('Icon', value);
    }

    /**
    * * Field Name: Color
    * * Display Name: Color
    * * SQL Data Type: nvarchar(50)
    */
    get Color(): string | null {
        return this.Get('Color');
    }
    set Color(value: string | null) {
        this.Set('Color', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get IsActive(): boolean | null {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean | null) {
        this.Set('IsActive', value);
    }

    /**
    * * Field Name: RequiresMembership
    * * Display Name: Requires Membership
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get RequiresMembership(): boolean | null {
        return this.Get('RequiresMembership');
    }
    set RequiresMembership(value: boolean | null) {
        this.Set('RequiresMembership', value);
    }

    /**
    * * Field Name: ResourceCount
    * * Display Name: Resource Count
    * * SQL Data Type: int
    * * Default Value: 0
    */
    get ResourceCount(): number | null {
        return this.Get('ResourceCount');
    }
    set ResourceCount(value: number | null) {
        this.Set('ResourceCount', value);
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
    * * Field Name: ParentCategory
    * * Display Name: Parent Category
    * * SQL Data Type: nvarchar(255)
    */
    get ParentCategory(): string | null {
        return this.Get('ParentCategory');
    }

    /**
    * * Field Name: RootParentCategoryID
    * * Display Name: Root Parent Category ID
    * * SQL Data Type: uniqueidentifier
    */
    get RootParentCategoryID(): string | null {
        return this.Get('RootParentCategoryID');
    }
}


/**
 * Resource Downloads - strongly typed entity sub-class
 * * Schema: AssociationDemo
 * * Base Table: ResourceDownload
 * * Base View: vwResourceDownloads
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Resource Downloads')
export class AssociationDemoResourceDownloadEntity extends BaseEntity<AssociationDemoResourceDownloadEntityType> {
    /**
    * Loads the Resource Downloads record from the database
    * @param ID: string - primary key value to load the Resource Downloads record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AssociationDemoResourceDownloadEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: ResourceID
    * * Display Name: Resource ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Resources (vwResources.ID)
    */
    get ResourceID(): string {
        return this.Get('ResourceID');
    }
    set ResourceID(value: string) {
        this.Set('ResourceID', value);
    }

    /**
    * * Field Name: MemberID
    * * Display Name: Member ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Members (vwMembers.ID)
    */
    get MemberID(): string {
        return this.Get('MemberID');
    }
    set MemberID(value: string) {
        this.Set('MemberID', value);
    }

    /**
    * * Field Name: DownloadDate
    * * Display Name: Download Date
    * * SQL Data Type: datetime
    * * Default Value: getdate()
    */
    get DownloadDate(): Date {
        return this.Get('DownloadDate');
    }
    set DownloadDate(value: Date) {
        this.Set('DownloadDate', value);
    }

    /**
    * * Field Name: IPAddress
    * * Display Name: IP Address
    * * SQL Data Type: nvarchar(50)
    */
    get IPAddress(): string | null {
        return this.Get('IPAddress');
    }
    set IPAddress(value: string | null) {
        this.Set('IPAddress', value);
    }

    /**
    * * Field Name: UserAgent
    * * Display Name: User Agent
    * * SQL Data Type: nvarchar(500)
    */
    get UserAgent(): string | null {
        return this.Get('UserAgent');
    }
    set UserAgent(value: string | null) {
        this.Set('UserAgent', value);
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
 * Resource Ratings - strongly typed entity sub-class
 * * Schema: AssociationDemo
 * * Base Table: ResourceRating
 * * Base View: vwResourceRatings
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Resource Ratings')
export class AssociationDemoResourceRatingEntity extends BaseEntity<AssociationDemoResourceRatingEntityType> {
    /**
    * Loads the Resource Ratings record from the database
    * @param ID: string - primary key value to load the Resource Ratings record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AssociationDemoResourceRatingEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: ResourceID
    * * Display Name: Resource ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Resources (vwResources.ID)
    */
    get ResourceID(): string {
        return this.Get('ResourceID');
    }
    set ResourceID(value: string) {
        this.Set('ResourceID', value);
    }

    /**
    * * Field Name: MemberID
    * * Display Name: Member ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Members (vwMembers.ID)
    */
    get MemberID(): string {
        return this.Get('MemberID');
    }
    set MemberID(value: string) {
        this.Set('MemberID', value);
    }

    /**
    * * Field Name: Rating
    * * Display Name: Rating
    * * SQL Data Type: int
    */
    get Rating(): number {
        return this.Get('Rating');
    }
    set Rating(value: number) {
        this.Set('Rating', value);
    }

    /**
    * * Field Name: Review
    * * Display Name: Review
    * * SQL Data Type: nvarchar(MAX)
    */
    get Review(): string | null {
        return this.Get('Review');
    }
    set Review(value: string | null) {
        this.Set('Review', value);
    }

    /**
    * * Field Name: CreatedDate
    * * Display Name: Created Date
    * * SQL Data Type: datetime
    * * Default Value: getdate()
    */
    get CreatedDate(): Date {
        return this.Get('CreatedDate');
    }
    set CreatedDate(value: Date) {
        this.Set('CreatedDate', value);
    }

    /**
    * * Field Name: IsHelpful
    * * Display Name: Is Helpful
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get IsHelpful(): boolean | null {
        return this.Get('IsHelpful');
    }
    set IsHelpful(value: boolean | null) {
        this.Set('IsHelpful', value);
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
 * Resource Tags - strongly typed entity sub-class
 * * Schema: AssociationDemo
 * * Base Table: ResourceTag
 * * Base View: vwResourceTags
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Resource Tags')
export class AssociationDemoResourceTagEntity extends BaseEntity<AssociationDemoResourceTagEntityType> {
    /**
    * Loads the Resource Tags record from the database
    * @param ID: string - primary key value to load the Resource Tags record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AssociationDemoResourceTagEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: ResourceID
    * * Display Name: Resource ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Resources (vwResources.ID)
    */
    get ResourceID(): string {
        return this.Get('ResourceID');
    }
    set ResourceID(value: string) {
        this.Set('ResourceID', value);
    }

    /**
    * * Field Name: TagName
    * * Display Name: Tag Name
    * * SQL Data Type: nvarchar(100)
    */
    get TagName(): string {
        return this.Get('TagName');
    }
    set TagName(value: string) {
        this.Set('TagName', value);
    }

    /**
    * * Field Name: CreatedDate
    * * Display Name: Created Date
    * * SQL Data Type: datetime
    * * Default Value: getdate()
    */
    get CreatedDate(): Date {
        return this.Get('CreatedDate');
    }
    set CreatedDate(value: Date) {
        this.Set('CreatedDate', value);
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
 * Resource Versions - strongly typed entity sub-class
 * * Schema: AssociationDemo
 * * Base Table: ResourceVersion
 * * Base View: vwResourceVersions
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Resource Versions')
export class AssociationDemoResourceVersionEntity extends BaseEntity<AssociationDemoResourceVersionEntityType> {
    /**
    * Loads the Resource Versions record from the database
    * @param ID: string - primary key value to load the Resource Versions record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AssociationDemoResourceVersionEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: ResourceID
    * * Display Name: Resource ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Resources (vwResources.ID)
    */
    get ResourceID(): string {
        return this.Get('ResourceID');
    }
    set ResourceID(value: string) {
        this.Set('ResourceID', value);
    }

    /**
    * * Field Name: VersionNumber
    * * Display Name: Version Number
    * * SQL Data Type: nvarchar(20)
    */
    get VersionNumber(): string {
        return this.Get('VersionNumber');
    }
    set VersionNumber(value: string) {
        this.Set('VersionNumber', value);
    }

    /**
    * * Field Name: VersionNotes
    * * Display Name: Version Notes
    * * SQL Data Type: nvarchar(MAX)
    */
    get VersionNotes(): string | null {
        return this.Get('VersionNotes');
    }
    set VersionNotes(value: string | null) {
        this.Set('VersionNotes', value);
    }

    /**
    * * Field Name: FileURL
    * * Display Name: File URL
    * * SQL Data Type: nvarchar(1000)
    */
    get FileURL(): string | null {
        return this.Get('FileURL');
    }
    set FileURL(value: string | null) {
        this.Set('FileURL', value);
    }

    /**
    * * Field Name: FileSizeBytes
    * * Display Name: File Size Bytes
    * * SQL Data Type: bigint
    */
    get FileSizeBytes(): number | null {
        return this.Get('FileSizeBytes');
    }
    set FileSizeBytes(value: number | null) {
        this.Set('FileSizeBytes', value);
    }

    /**
    * * Field Name: CreatedByID
    * * Display Name: Created By ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Members (vwMembers.ID)
    */
    get CreatedByID(): string {
        return this.Get('CreatedByID');
    }
    set CreatedByID(value: string) {
        this.Set('CreatedByID', value);
    }

    /**
    * * Field Name: CreatedDate
    * * Display Name: Created Date
    * * SQL Data Type: datetime
    * * Default Value: getdate()
    */
    get CreatedDate(): Date {
        return this.Get('CreatedDate');
    }
    set CreatedDate(value: Date) {
        this.Set('CreatedDate', value);
    }

    /**
    * * Field Name: IsCurrent
    * * Display Name: Is Current
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get IsCurrent(): boolean | null {
        return this.Get('IsCurrent');
    }
    set IsCurrent(value: boolean | null) {
        this.Set('IsCurrent', value);
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
 * Resources - strongly typed entity sub-class
 * * Schema: AssociationDemo
 * * Base Table: Resource
 * * Base View: vwResources
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Resources')
export class AssociationDemoResourceEntity extends BaseEntity<AssociationDemoResourceEntityType> {
    /**
    * Loads the Resources record from the database
    * @param ID: string - primary key value to load the Resources record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AssociationDemoResourceEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: CategoryID
    * * Display Name: Category ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Resource Categories (vwResourceCategories.ID)
    */
    get CategoryID(): string {
        return this.Get('CategoryID');
    }
    set CategoryID(value: string) {
        this.Set('CategoryID', value);
    }

    /**
    * * Field Name: Title
    * * Display Name: Title
    * * SQL Data Type: nvarchar(500)
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
    * * Field Name: ResourceType
    * * Display Name: Resource Type
    * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Article
    *   * Document
    *   * Link
    *   * PDF
    *   * Presentation
    *   * Spreadsheet
    *   * Template
    *   * Video
    */
    get ResourceType(): 'Article' | 'Document' | 'Link' | 'PDF' | 'Presentation' | 'Spreadsheet' | 'Template' | 'Video' {
        return this.Get('ResourceType');
    }
    set ResourceType(value: 'Article' | 'Document' | 'Link' | 'PDF' | 'Presentation' | 'Spreadsheet' | 'Template' | 'Video') {
        this.Set('ResourceType', value);
    }

    /**
    * * Field Name: FileURL
    * * Display Name: File URL
    * * SQL Data Type: nvarchar(1000)
    */
    get FileURL(): string | null {
        return this.Get('FileURL');
    }
    set FileURL(value: string | null) {
        this.Set('FileURL', value);
    }

    /**
    * * Field Name: FileSizeBytes
    * * Display Name: File Size Bytes
    * * SQL Data Type: bigint
    */
    get FileSizeBytes(): number | null {
        return this.Get('FileSizeBytes');
    }
    set FileSizeBytes(value: number | null) {
        this.Set('FileSizeBytes', value);
    }

    /**
    * * Field Name: MimeType
    * * Display Name: Mime Type
    * * SQL Data Type: nvarchar(100)
    */
    get MimeType(): string | null {
        return this.Get('MimeType');
    }
    set MimeType(value: string | null) {
        this.Set('MimeType', value);
    }

    /**
    * * Field Name: AuthorID
    * * Display Name: Author ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Members (vwMembers.ID)
    */
    get AuthorID(): string | null {
        return this.Get('AuthorID');
    }
    set AuthorID(value: string | null) {
        this.Set('AuthorID', value);
    }

    /**
    * * Field Name: PublishedDate
    * * Display Name: Published Date
    * * SQL Data Type: datetime
    * * Default Value: getdate()
    */
    get PublishedDate(): Date {
        return this.Get('PublishedDate');
    }
    set PublishedDate(value: Date) {
        this.Set('PublishedDate', value);
    }

    /**
    * * Field Name: LastUpdatedDate
    * * Display Name: Last Updated Date
    * * SQL Data Type: datetime
    */
    get LastUpdatedDate(): Date | null {
        return this.Get('LastUpdatedDate');
    }
    set LastUpdatedDate(value: Date | null) {
        this.Set('LastUpdatedDate', value);
    }

    /**
    * * Field Name: ViewCount
    * * Display Name: View Count
    * * SQL Data Type: int
    * * Default Value: 0
    */
    get ViewCount(): number | null {
        return this.Get('ViewCount');
    }
    set ViewCount(value: number | null) {
        this.Set('ViewCount', value);
    }

    /**
    * * Field Name: DownloadCount
    * * Display Name: Download Count
    * * SQL Data Type: int
    * * Default Value: 0
    */
    get DownloadCount(): number | null {
        return this.Get('DownloadCount');
    }
    set DownloadCount(value: number | null) {
        this.Set('DownloadCount', value);
    }

    /**
    * * Field Name: AverageRating
    * * Display Name: Average Rating
    * * SQL Data Type: decimal(3, 2)
    * * Default Value: 0
    */
    get AverageRating(): number | null {
        return this.Get('AverageRating');
    }
    set AverageRating(value: number | null) {
        this.Set('AverageRating', value);
    }

    /**
    * * Field Name: RatingCount
    * * Display Name: Rating Count
    * * SQL Data Type: int
    * * Default Value: 0
    */
    get RatingCount(): number | null {
        return this.Get('RatingCount');
    }
    set RatingCount(value: number | null) {
        this.Set('RatingCount', value);
    }

    /**
    * * Field Name: IsFeatured
    * * Display Name: Is Featured
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get IsFeatured(): boolean | null {
        return this.Get('IsFeatured');
    }
    set IsFeatured(value: boolean | null) {
        this.Set('IsFeatured', value);
    }

    /**
    * * Field Name: RequiresMembership
    * * Display Name: Requires Membership
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get RequiresMembership(): boolean | null {
        return this.Get('RequiresMembership');
    }
    set RequiresMembership(value: boolean | null) {
        this.Set('RequiresMembership', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Published
    * * Value List Type: List
    * * Possible Values 
    *   * Archived
    *   * Deleted
    *   * Draft
    *   * Published
    */
    get Status(): 'Archived' | 'Deleted' | 'Draft' | 'Published' | null {
        return this.Get('Status');
    }
    set Status(value: 'Archived' | 'Deleted' | 'Draft' | 'Published' | null) {
        this.Set('Status', value);
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
    * * Field Name: Category
    * * Display Name: Category
    * * SQL Data Type: nvarchar(255)
    */
    get Category(): string {
        return this.Get('Category');
    }
}


/**
 * Segments - strongly typed entity sub-class
 * * Schema: AssociationDemo
 * * Base Table: Segment
 * * Base View: vwSegments
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Segments')
export class AssociationDemoSegmentEntity extends BaseEntity<AssociationDemoSegmentEntityType> {
    /**
    * Loads the Segments record from the database
    * @param ID: string - primary key value to load the Segments record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AssociationDemoSegmentEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(255)
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
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
    * * Field Name: SegmentType
    * * Display Name: Segment Type
    * * SQL Data Type: nvarchar(50)
    */
    get SegmentType(): string | null {
        return this.Get('SegmentType');
    }
    set SegmentType(value: string | null) {
        this.Set('SegmentType', value);
    }

    /**
    * * Field Name: FilterCriteria
    * * Display Name: Filter Criteria
    * * SQL Data Type: nvarchar(MAX)
    */
    get FilterCriteria(): string | null {
        return this.Get('FilterCriteria');
    }
    set FilterCriteria(value: string | null) {
        this.Set('FilterCriteria', value);
    }

    /**
    * * Field Name: MemberCount
    * * Display Name: Member Count
    * * SQL Data Type: int
    */
    get MemberCount(): number | null {
        return this.Get('MemberCount');
    }
    set MemberCount(value: number | null) {
        this.Set('MemberCount', value);
    }

    /**
    * * Field Name: LastCalculatedDate
    * * Display Name: Last Calculated Date
    * * SQL Data Type: datetime
    */
    get LastCalculatedDate(): Date | null {
        return this.Get('LastCalculatedDate');
    }
    set LastCalculatedDate(value: Date | null) {
        this.Set('LastCalculatedDate', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get IsActive(): boolean {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean) {
        this.Set('IsActive', value);
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
