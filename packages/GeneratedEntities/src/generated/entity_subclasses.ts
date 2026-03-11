import { BaseEntity, EntitySaveOptions, EntityDeleteOptions, CompositeKey, ValidationResult, ValidationErrorInfo, ValidationErrorType, Metadata, ProviderType, DatabaseProviderBase } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { z } from "zod";

export const loadModule = () => {
  // no-op, only used to ensure this file is a valid module and to allow easy loading
}

     
 
/**
 * zod schema definition for the entity Members
 */
export const ymMembersSchema = z.object({
    ProfileID: z.string().describe(`
        * * Field Name: ProfileID
        * * Display Name: Member ID
        * * SQL Data Type: nvarchar(450)`),
    FirstName: z.string().nullable().describe(`
        * * Field Name: FirstName
        * * Display Name: First Name
        * * SQL Data Type: nvarchar(MAX)`),
    LastName: z.string().nullable().describe(`
        * * Field Name: LastName
        * * Display Name: Last Name
        * * SQL Data Type: nvarchar(MAX)`),
    EmailAddr: z.string().nullable().describe(`
        * * Field Name: EmailAddr
        * * Display Name: Email Address
        * * SQL Data Type: nvarchar(MAX)`),
    MemberTypeCode: z.string().nullable().describe(`
        * * Field Name: MemberTypeCode
        * * Display Name: Member Type
        * * SQL Data Type: nvarchar(MAX)`),
    Status: z.string().nullable().describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(MAX)`),
    Organization: z.string().nullable().describe(`
        * * Field Name: Organization
        * * Display Name: Organization
        * * SQL Data Type: nvarchar(MAX)`),
    Phone: z.string().nullable().describe(`
        * * Field Name: Phone
        * * Display Name: Phone
        * * SQL Data Type: nvarchar(MAX)`),
    Address1: z.string().nullable().describe(`
        * * Field Name: Address1
        * * Display Name: Address Line 1
        * * SQL Data Type: nvarchar(MAX)`),
    Address2: z.string().nullable().describe(`
        * * Field Name: Address2
        * * Display Name: Address Line 2
        * * SQL Data Type: nvarchar(MAX)`),
    City: z.string().nullable().describe(`
        * * Field Name: City
        * * Display Name: City
        * * SQL Data Type: nvarchar(MAX)`),
    State: z.string().nullable().describe(`
        * * Field Name: State
        * * Display Name: State
        * * SQL Data Type: nvarchar(MAX)`),
    PostalCode: z.string().nullable().describe(`
        * * Field Name: PostalCode
        * * Display Name: Postal Code
        * * SQL Data Type: nvarchar(MAX)`),
    Country: z.string().nullable().describe(`
        * * Field Name: Country
        * * Display Name: Country
        * * SQL Data Type: nvarchar(MAX)`),
    Title: z.string().nullable().describe(`
        * * Field Name: Title
        * * Display Name: Title
        * * SQL Data Type: nvarchar(MAX)`),
    JoinDate: z.date().nullable().describe(`
        * * Field Name: JoinDate
        * * Display Name: Join Date
        * * SQL Data Type: datetimeoffset`),
    RenewalDate: z.date().nullable().describe(`
        * * Field Name: RenewalDate
        * * Display Name: Renewal Date
        * * SQL Data Type: datetimeoffset`),
    ExpirationDate: z.date().nullable().describe(`
        * * Field Name: ExpirationDate
        * * Display Name: Expiration Date
        * * SQL Data Type: datetimeoffset`),
    MemberSinceDate: z.date().nullable().describe(`
        * * Field Name: MemberSinceDate
        * * Display Name: Member Since Date
        * * SQL Data Type: datetimeoffset`),
    WebsiteUrl: z.string().nullable().describe(`
        * * Field Name: WebsiteUrl
        * * Display Name: Website URL
        * * SQL Data Type: nvarchar(MAX)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
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

export type ymMembersEntityType = z.infer<typeof ymMembersSchema>;
 
 

/**
 * Members - strongly typed entity sub-class
 * * Schema: ym
 * * Base Table: Members
 * * Base View: vwMembers
 * * Primary Key: ProfileID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Members')
export class ymMembersEntity extends BaseEntity<ymMembersEntityType> {
    /**
    * Loads the Members record from the database
    * @param ProfileID: string - primary key value to load the Members record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ymMembersEntity
    * @method
    * @override
    */
    public async Load(ProfileID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ProfileID', Value: ProfileID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ProfileID
    * * Display Name: Member ID
    * * SQL Data Type: nvarchar(450)
    */
    get ProfileID(): string {
        return this.Get('ProfileID');
    }
    set ProfileID(value: string) {
        this.Set('ProfileID', value);
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
    * * Field Name: EmailAddr
    * * Display Name: Email Address
    * * SQL Data Type: nvarchar(MAX)
    */
    get EmailAddr(): string | null {
        return this.Get('EmailAddr');
    }
    set EmailAddr(value: string | null) {
        this.Set('EmailAddr', value);
    }

    /**
    * * Field Name: MemberTypeCode
    * * Display Name: Member Type
    * * SQL Data Type: nvarchar(MAX)
    */
    get MemberTypeCode(): string | null {
        return this.Get('MemberTypeCode');
    }
    set MemberTypeCode(value: string | null) {
        this.Set('MemberTypeCode', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(MAX)
    */
    get Status(): string | null {
        return this.Get('Status');
    }
    set Status(value: string | null) {
        this.Set('Status', value);
    }

    /**
    * * Field Name: Organization
    * * Display Name: Organization
    * * SQL Data Type: nvarchar(MAX)
    */
    get Organization(): string | null {
        return this.Get('Organization');
    }
    set Organization(value: string | null) {
        this.Set('Organization', value);
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
    * * Field Name: Address1
    * * Display Name: Address Line 1
    * * SQL Data Type: nvarchar(MAX)
    */
    get Address1(): string | null {
        return this.Get('Address1');
    }
    set Address1(value: string | null) {
        this.Set('Address1', value);
    }

    /**
    * * Field Name: Address2
    * * Display Name: Address Line 2
    * * SQL Data Type: nvarchar(MAX)
    */
    get Address2(): string | null {
        return this.Get('Address2');
    }
    set Address2(value: string | null) {
        this.Set('Address2', value);
    }

    /**
    * * Field Name: City
    * * Display Name: City
    * * SQL Data Type: nvarchar(MAX)
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
    * * SQL Data Type: nvarchar(MAX)
    */
    get State(): string | null {
        return this.Get('State');
    }
    set State(value: string | null) {
        this.Set('State', value);
    }

    /**
    * * Field Name: PostalCode
    * * Display Name: Postal Code
    * * SQL Data Type: nvarchar(MAX)
    */
    get PostalCode(): string | null {
        return this.Get('PostalCode');
    }
    set PostalCode(value: string | null) {
        this.Set('PostalCode', value);
    }

    /**
    * * Field Name: Country
    * * Display Name: Country
    * * SQL Data Type: nvarchar(MAX)
    */
    get Country(): string | null {
        return this.Get('Country');
    }
    set Country(value: string | null) {
        this.Set('Country', value);
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
    * * Field Name: JoinDate
    * * Display Name: Join Date
    * * SQL Data Type: datetimeoffset
    */
    get JoinDate(): Date | null {
        return this.Get('JoinDate');
    }
    set JoinDate(value: Date | null) {
        this.Set('JoinDate', value);
    }

    /**
    * * Field Name: RenewalDate
    * * Display Name: Renewal Date
    * * SQL Data Type: datetimeoffset
    */
    get RenewalDate(): Date | null {
        return this.Get('RenewalDate');
    }
    set RenewalDate(value: Date | null) {
        this.Set('RenewalDate', value);
    }

    /**
    * * Field Name: ExpirationDate
    * * Display Name: Expiration Date
    * * SQL Data Type: datetimeoffset
    */
    get ExpirationDate(): Date | null {
        return this.Get('ExpirationDate');
    }
    set ExpirationDate(value: Date | null) {
        this.Set('ExpirationDate', value);
    }

    /**
    * * Field Name: MemberSinceDate
    * * Display Name: Member Since Date
    * * SQL Data Type: datetimeoffset
    */
    get MemberSinceDate(): Date | null {
        return this.Get('MemberSinceDate');
    }
    set MemberSinceDate(value: Date | null) {
        this.Set('MemberSinceDate', value);
    }

    /**
    * * Field Name: WebsiteUrl
    * * Display Name: Website URL
    * * SQL Data Type: nvarchar(MAX)
    */
    get WebsiteUrl(): string | null {
        return this.Get('WebsiteUrl');
    }
    set WebsiteUrl(value: string | null) {
        this.Set('WebsiteUrl', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
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
