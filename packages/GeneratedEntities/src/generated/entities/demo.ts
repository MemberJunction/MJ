import { BaseEntity, EntitySaveOptions, EntityDeleteOptions, CompositeKey, ValidationResult, ValidationErrorInfo, ValidationErrorType, Metadata, ProviderType, DatabaseProviderBase, RunView } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { z } from "zod";

     
 
/**
 * zod schema definition for the entity Activities
 */
export const demoActivitySchema = z.object({
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
    ActivityDate: z.date().describe(`
        * * Field Name: ActivityDate
        * * Display Name: Activity Date
        * * SQL Data Type: datetimeoffset`),
    ActivityType: z.string().nullable().describe(`
        * * Field Name: ActivityType
        * * Display Name: Activity Type
        * * SQL Data Type: nvarchar(50)`),
    Amount: z.number().nullable().describe(`
        * * Field Name: Amount
        * * Display Name: Amount
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
    Member: z.string().nullable().describe(`
        * * Field Name: Member
        * * Display Name: Member
        * * SQL Data Type: nvarchar(100)`),
});

export type demoActivityEntityType = z.infer<typeof demoActivitySchema>;

/**
 * zod schema definition for the entity Members
 */
export const demoMemberSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    MemberNumber: z.string().describe(`
        * * Field Name: MemberNumber
        * * Display Name: Member Number
        * * SQL Data Type: nvarchar(20)`),
    FirstName: z.string().nullable().describe(`
        * * Field Name: FirstName
        * * Display Name: First Name
        * * SQL Data Type: nvarchar(100)`),
    LastName: z.string().nullable().describe(`
        * * Field Name: LastName
        * * Display Name: Last Name
        * * SQL Data Type: nvarchar(100)`),
    City: z.string().nullable().describe(`
        * * Field Name: City
        * * Display Name: City
        * * SQL Data Type: nvarchar(100)`),
    MembershipTenureMonths: z.number().nullable().describe(`
        * * Field Name: MembershipTenureMonths
        * * Display Name: Tenure (Months)
        * * SQL Data Type: int`),
    JoinedAt: z.date().nullable().describe(`
        * * Field Name: JoinedAt
        * * Display Name: Joined At
        * * SQL Data Type: datetimeoffset`),
    RenewalDecidedAt: z.date().nullable().describe(`
        * * Field Name: RenewalDecidedAt
        * * Display Name: Renewal Decided At
        * * SQL Data Type: datetimeoffset`),
    Renewed: z.string().nullable().describe(`
        * * Field Name: Renewed
        * * Display Name: Renewed
        * * SQL Data Type: nvarchar(10)`),
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
    __mj_Latitude: z.number().nullable().describe(`
        * * Field Name: __mj_Latitude
        * * Display Name: Mj Latitude
        * * SQL Data Type: decimal(10, 6)`),
    __mj_Longitude: z.number().nullable().describe(`
        * * Field Name: __mj_Longitude
        * * Display Name: Mj Longitude
        * * SQL Data Type: decimal(10, 6)`),
});

export type demoMemberEntityType = z.infer<typeof demoMemberSchema>;
 
 

/**
 * Activities - strongly typed entity sub-class
 * * Schema: demo
 * * Base Table: Activity
 * * Base View: vwActivities
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Activities')
export class demoActivityEntity extends BaseEntity<demoActivityEntityType> {
    /**
    * Loads the Activities record from the database
    * @param ID: string - primary key value to load the Activities record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof demoActivityEntity
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
    * * Field Name: ActivityDate
    * * Display Name: Activity Date
    * * SQL Data Type: datetimeoffset
    */
    get ActivityDate(): Date {
        return this.Get('ActivityDate');
    }
    set ActivityDate(value: Date) {
        this.Set('ActivityDate', value);
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
    * * Field Name: Amount
    * * Display Name: Amount
    * * SQL Data Type: decimal(18, 2)
    */
    get Amount(): number | null {
        return this.Get('Amount');
    }
    set Amount(value: number | null) {
        this.Set('Amount', value);
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
    * * Field Name: Member
    * * Display Name: Member
    * * SQL Data Type: nvarchar(100)
    */
    get Member(): string | null {
        return this.Get('Member');
    }
}


/**
 * Members - strongly typed entity sub-class
 * * Schema: demo
 * * Base Table: Member
 * * Base View: vwMembers
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Members')
export class demoMemberEntity extends BaseEntity<demoMemberEntityType> {
    /**
    * Loads the Members record from the database
    * @param ID: string - primary key value to load the Members record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof demoMemberEntity
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
    * * Field Name: MemberNumber
    * * Display Name: Member Number
    * * SQL Data Type: nvarchar(20)
    */
    get MemberNumber(): string {
        return this.Get('MemberNumber');
    }
    set MemberNumber(value: string) {
        this.Set('MemberNumber', value);
    }

    /**
    * * Field Name: FirstName
    * * Display Name: First Name
    * * SQL Data Type: nvarchar(100)
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
    * * SQL Data Type: nvarchar(100)
    */
    get LastName(): string | null {
        return this.Get('LastName');
    }
    set LastName(value: string | null) {
        this.Set('LastName', value);
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
    * * Field Name: MembershipTenureMonths
    * * Display Name: Tenure (Months)
    * * SQL Data Type: int
    */
    get MembershipTenureMonths(): number | null {
        return this.Get('MembershipTenureMonths');
    }
    set MembershipTenureMonths(value: number | null) {
        this.Set('MembershipTenureMonths', value);
    }

    /**
    * * Field Name: JoinedAt
    * * Display Name: Joined At
    * * SQL Data Type: datetimeoffset
    */
    get JoinedAt(): Date | null {
        return this.Get('JoinedAt');
    }
    set JoinedAt(value: Date | null) {
        this.Set('JoinedAt', value);
    }

    /**
    * * Field Name: RenewalDecidedAt
    * * Display Name: Renewal Decided At
    * * SQL Data Type: datetimeoffset
    */
    get RenewalDecidedAt(): Date | null {
        return this.Get('RenewalDecidedAt');
    }
    set RenewalDecidedAt(value: Date | null) {
        this.Set('RenewalDecidedAt', value);
    }

    /**
    * * Field Name: Renewed
    * * Display Name: Renewed
    * * SQL Data Type: nvarchar(10)
    */
    get Renewed(): string | null {
        return this.Get('Renewed');
    }
    set Renewed(value: string | null) {
        this.Set('Renewed', value);
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
    * * Field Name: __mj_Latitude
    * * Display Name: Mj Latitude
    * * SQL Data Type: decimal(10, 6)
    */
    get __mj_Latitude(): number | null {
        return this.Get('__mj_Latitude');
    }

    /**
    * * Field Name: __mj_Longitude
    * * Display Name: Mj Longitude
    * * SQL Data Type: decimal(10, 6)
    */
    get __mj_Longitude(): number | null {
        return this.Get('__mj_Longitude');
    }
}
