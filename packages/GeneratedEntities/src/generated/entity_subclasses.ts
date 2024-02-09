import { BaseEntity, PrimaryKeyValue, EntitySaveOptions } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";

    /**
     * Industries - strongly typed entity sub-class
     * * Schema: reference
     * * Base Table: Industry
     * * Base View: vwIndustries
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Industries')
    export class IndustryEntity extends BaseEntity {
        /**
        * Loads the Industries record from the database
        * @param ID: Number - primary key value to load the Industries record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof IndustryEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
        }
        
        /**
        * Industries - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof IndustryEntity
        * @throws {Error} - Delete is not allowed for Industries, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Industries, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(20)
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
        * * SQL Data Type: nvarchar(200)
        */
        get Description(): string {  
            return this.Get('Description');
        }
        set Description(value: string) {
            this.Set('Description', value);
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
    
        /**
        * * Field Name: UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetime
        * * Default Value: getdate()
        */
        get UpdatedAt(): Date {  
            return this.Get('UpdatedAt');
        }
    
        /**
        * * Field Name: Keywords
        * * Display Name: Keywords
        * * SQL Data Type: nvarchar(MAX)
        */
        get Keywords(): string {  
            return this.Get('Keywords');
        }
        set Keywords(value: string) {
            this.Set('Keywords', value);
        }

    }
    
    /**
     * Contact Roles - strongly typed entity sub-class
     * * Schema: reference
     * * Base Table: ContactRole
     * * Base View: vwContactRoles
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Contact Roles')
    export class ContactRoleEntity extends BaseEntity {
        /**
        * Loads the Contact Roles record from the database
        * @param ID: Number - primary key value to load the Contact Roles record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof ContactRoleEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
        }
        
        /**
        * Contact Roles - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof ContactRoleEntity
        * @throws {Error} - Delete is not allowed for Contact Roles, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Contact Roles, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(50)
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
        get Description(): string {  
            return this.Get('Description');
        }
        set Description(value: string) {
            this.Set('Description', value);
        }
        /**
        * * Field Name: Keywords
        * * Display Name: Keywords
        * * SQL Data Type: nvarchar(MAX)
        */
        get Keywords(): string {  
            return this.Get('Keywords');
        }
        set Keywords(value: string) {
            this.Set('Keywords', value);
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
    
        /**
        * * Field Name: UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetime
        * * Default Value: getdate()
        */
        get UpdatedAt(): Date {  
            return this.Get('UpdatedAt');
        }
    

    }
    
    /**
     * Contact Levels - strongly typed entity sub-class
     * * Schema: reference
     * * Base Table: ContactLevel
     * * Base View: vwContactLevels
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Contact Levels')
    export class ContactLevelEntity extends BaseEntity {
        /**
        * Loads the Contact Levels record from the database
        * @param ID: Number - primary key value to load the Contact Levels record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof ContactLevelEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
        }
        
        /**
        * Contact Levels - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof ContactLevelEntity
        * @throws {Error} - Delete is not allowed for Contact Levels, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Contact Levels, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(50)
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
        get Description(): string {  
            return this.Get('Description');
        }
        set Description(value: string) {
            this.Set('Description', value);
        }
        /**
        * * Field Name: Rank
        * * Display Name: Rank
        * * SQL Data Type: int
        * * Default Value: 100
        */
        get Rank(): number {  
            return this.Get('Rank');
        }
        set Rank(value: number) {
            this.Set('Rank', value);
        }
        /**
        * * Field Name: Keywords
        * * Display Name: Keywords
        * * SQL Data Type: nvarchar(MAX)
        */
        get Keywords(): string {  
            return this.Get('Keywords');
        }
        set Keywords(value: string) {
            this.Set('Keywords', value);
        }
        /**
        * * Field Name: ExcludeKeywords
        * * Display Name: Exclude Keywords
        * * SQL Data Type: nvarchar(MAX)
        */
        get ExcludeKeywords(): string {  
            return this.Get('ExcludeKeywords');
        }
        set ExcludeKeywords(value: string) {
            this.Set('ExcludeKeywords', value);
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
    
        /**
        * * Field Name: UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetime
        * * Default Value: getdate()
        */
        get UpdatedAt(): Date {  
            return this.Get('UpdatedAt');
        }
    

    }
    
    /**
     * Accounts - strongly typed entity sub-class
     * * Schema: crm
     * * Base Table: Account
     * * Base View: vwAccounts
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Accounts')
    export class AccountEntity extends BaseEntity {
        /**
        * Loads the Accounts record from the database
        * @param ID: Number - primary key value to load the Accounts record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof AccountEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
        }
        
        /**
        * Accounts - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof AccountEntity
        * @throws {Error} - Delete is not allowed for Accounts, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Accounts, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Field Name: BCMID
        * * Display Name: BCMID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newid()
        */
        get BCMID(): string {  
            return this.Get('BCMID');
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
        * * Field Name: TaxID
        * * Display Name: Tax ID
        * * SQL Data Type: nvarchar(50)
        */
        get TaxID(): string {  
            return this.Get('TaxID');
        }
        set TaxID(value: string) {
            this.Set('TaxID', value);
        }
        /**
        * * Field Name: Acronym
        * * Display Name: Acronym
        * * SQL Data Type: nvarchar(20)
        */
        get Acronym(): string {  
            return this.Get('Acronym');
        }
        set Acronym(value: string) {
            this.Set('Acronym', value);
        }
        /**
        * * Field Name: OperatingName
        * * Display Name: Operating Name
        * * SQL Data Type: nvarchar(255)
        */
        get OperatingName(): string {  
            return this.Get('OperatingName');
        }
        set OperatingName(value: string) {
            this.Set('OperatingName', value);
        }
        /**
        * * Field Name: DisplayName
        * * Display Name: Display Name
        * * SQL Data Type: nvarchar(250)
        */
        get DisplayName(): string {  
            return this.Get('DisplayName');
        }
        set DisplayName(value: string) {
            this.Set('DisplayName', value);
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
        * * Field Name: AddressLine1
        * * Display Name: Address Line 1
        * * SQL Data Type: nvarchar(100)
        */
        get AddressLine1(): string {  
            return this.Get('AddressLine1');
        }
        set AddressLine1(value: string) {
            this.Set('AddressLine1', value);
        }
        /**
        * * Field Name: AddressLine2
        * * Display Name: Address Line 2
        * * SQL Data Type: nvarchar(100)
        */
        get AddressLine2(): string {  
            return this.Get('AddressLine2');
        }
        set AddressLine2(value: string) {
            this.Set('AddressLine2', value);
        }
        /**
        * * Field Name: AddressLine3
        * * Display Name: Address Line 3
        * * SQL Data Type: nvarchar(100)
        */
        get AddressLine3(): string {  
            return this.Get('AddressLine3');
        }
        set AddressLine3(value: string) {
            this.Set('AddressLine3', value);
        }
        /**
        * * Field Name: City
        * * Display Name: City
        * * SQL Data Type: nvarchar(100)
        */
        get City(): string {  
            return this.Get('City');
        }
        set City(value: string) {
            this.Set('City', value);
        }
        /**
        * * Field Name: StateProvince
        * * Display Name: State Province
        * * SQL Data Type: nvarchar(50)
        */
        get StateProvince(): string {  
            return this.Get('StateProvince');
        }
        set StateProvince(value: string) {
            this.Set('StateProvince', value);
        }
        /**
        * * Field Name: PostalCode
        * * Display Name: Postal Code
        * * SQL Data Type: nvarchar(20)
        */
        get PostalCode(): string {  
            return this.Get('PostalCode');
        }
        set PostalCode(value: string) {
            this.Set('PostalCode', value);
        }
        /**
        * * Field Name: Country
        * * Display Name: Country
        * * SQL Data Type: nvarchar(100)
        */
        get Country(): string {  
            return this.Get('Country');
        }
        set Country(value: string) {
            this.Set('Country', value);
        }
        /**
        * * Field Name: ISOCountryCode
        * * Display Name: ISOCountry Code
        * * SQL Data Type: nvarchar(5)
        */
        get ISOCountryCode(): string {  
            return this.Get('ISOCountryCode');
        }
        set ISOCountryCode(value: string) {
            this.Set('ISOCountryCode', value);
        }
        /**
        * * Field Name: Domain
        * * Display Name: Domain
        * * SQL Data Type: nvarchar(255)
        */
        get Domain(): string {  
            return this.Get('Domain');
        }
        set Domain(value: string) {
            this.Set('Domain', value);
        }
        /**
        * * Field Name: Website
        * * Display Name: Website
        * * SQL Data Type: nvarchar(255)
        */
        get Website(): string {  
            return this.Get('Website');
        }
        set Website(value: string) {
            this.Set('Website', value);
        }
        /**
        * * Field Name: EmailPattern
        * * Display Name: Email Pattern
        * * SQL Data Type: nvarchar(255)
        */
        get EmailPattern(): string {  
            return this.Get('EmailPattern');
        }
        set EmailPattern(value: string) {
            this.Set('EmailPattern', value);
        }
        /**
        * * Field Name: LogoURL
        * * Display Name: Logo URL
        * * SQL Data Type: nvarchar(500)
        */
        get LogoURL(): string {  
            return this.Get('LogoURL');
        }
        set LogoURL(value: string) {
            this.Set('LogoURL', value);
        }
        /**
        * * Field Name: LeadershipPageURL
        * * Display Name: Leadership Page URL
        * * SQL Data Type: nvarchar(255)
        */
        get LeadershipPageURL(): string {  
            return this.Get('LeadershipPageURL');
        }
        set LeadershipPageURL(value: string) {
            this.Set('LeadershipPageURL', value);
        }
        /**
        * * Field Name: PhoneNumber
        * * Display Name: Phone Number
        * * SQL Data Type: nvarchar(50)
        */
        get PhoneNumber(): string {  
            return this.Get('PhoneNumber');
        }
        set PhoneNumber(value: string) {
            this.Set('PhoneNumber', value);
        }
        /**
        * * Field Name: LinkedIn
        * * Display Name: Linked In
        * * SQL Data Type: nvarchar(255)
        */
        get LinkedIn(): string {  
            return this.Get('LinkedIn');
        }
        set LinkedIn(value: string) {
            this.Set('LinkedIn', value);
        }
        /**
        * * Field Name: Facebook
        * * Display Name: Facebook
        * * SQL Data Type: nvarchar(255)
        */
        get Facebook(): string {  
            return this.Get('Facebook');
        }
        set Facebook(value: string) {
            this.Set('Facebook', value);
        }
        /**
        * * Field Name: Logo
        * * Display Name: Logo
        * * SQL Data Type: nvarchar(255)
        */
        get Logo(): string {  
            return this.Get('Logo');
        }
        set Logo(value: string) {
            this.Set('Logo', value);
        }
        /**
        * * Field Name: IndustryID
        * * Display Name: Industry ID
        * * SQL Data Type: int
        * * Related Entity: Industries
        */
        get IndustryID(): number {  
            return this.Get('IndustryID');
        }
        set IndustryID(value: number) {
            this.Set('IndustryID', value);
        }
        /**
        * * Field Name: LastReviewedDate
        * * Display Name: Last Reviewed Date
        * * SQL Data Type: datetime
        */
        get LastReviewedDate(): Date {  
            return this.Get('LastReviewedDate');
        }
        set LastReviewedDate(value: Date) {
            this.Set('LastReviewedDate', value);
        }
        /**
        * * Field Name: ActivityCount
        * * Display Name: Activity Count
        * * SQL Data Type: int
        * * Default Value: 0
        */
        get ActivityCount(): number {  
            return this.Get('ActivityCount');
        }
        set ActivityCount(value: number) {
            this.Set('ActivityCount', value);
        }
        /**
        * * Field Name: LatestActivityDate
        * * Display Name: Latest Activity Date
        * * SQL Data Type: datetime
        */
        get LatestActivityDate(): Date {  
            return this.Get('LatestActivityDate');
        }
        set LatestActivityDate(value: Date) {
            this.Set('LatestActivityDate', value);
        }
        /**
        * * Field Name: EarliestActivityDate
        * * Display Name: Earliest Activity Date
        * * SQL Data Type: datetime
        */
        get EarliestActivityDate(): Date {  
            return this.Get('EarliestActivityDate');
        }
        set EarliestActivityDate(value: Date) {
            this.Set('EarliestActivityDate', value);
        }
        /**
        * * Field Name: RecordSource
        * * Display Name: Record Source
        * * SQL Data Type: nvarchar(50)
        */
        get RecordSource(): string {  
            return this.Get('RecordSource');
        }
        set RecordSource(value: string) {
            this.Set('RecordSource', value);
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
    
        /**
        * * Field Name: UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetime
        * * Default Value: getdate()
        */
        get UpdatedAt(): Date {  
            return this.Get('UpdatedAt');
        }
    
        /**
        * * Field Name: LastEnrichedAt
        * * Display Name: Last Enriched At
        * * SQL Data Type: datetime
        */
        get LastEnrichedAt(): Date {  
            return this.Get('LastEnrichedAt');
        }
        set LastEnrichedAt(value: Date) {
            this.Set('LastEnrichedAt', value);
        }

    }
    
    /**
     * Contacts - strongly typed entity sub-class
     * * Schema: crm
     * * Base Table: Contact
     * * Base View: vwContacts
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Contacts')
    export class ContactEntity extends BaseEntity {
        /**
        * Loads the Contacts record from the database
        * @param ID: Number - primary key value to load the Contacts record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof ContactEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
        }
        
        /**
        * Contacts - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof ContactEntity
        * @throws {Error} - Delete is not allowed for Contacts, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Contacts, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Field Name: BCMID
        * * Display Name: BCMID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newid()
        */
        get BCMID(): string {  
            return this.Get('BCMID');
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
        * * Field Name: NickName
        * * Display Name: Nick Name
        * * SQL Data Type: nvarchar(50)
        */
        get NickName(): string {  
            return this.Get('NickName');
        }
        set NickName(value: string) {
            this.Set('NickName', value);
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
        * * Field Name: AccountID
        * * Display Name: Account ID
        * * SQL Data Type: int
        * * Related Entity: Accounts
        */
        get AccountID(): number {  
            return this.Get('AccountID');
        }
        set AccountID(value: number) {
            this.Set('AccountID', value);
        }
        /**
        * * Field Name: LastReviewedDate
        * * Display Name: Last Reviewed Date
        * * SQL Data Type: datetime
        */
        get LastReviewedDate(): Date {  
            return this.Get('LastReviewedDate');
        }
        set LastReviewedDate(value: Date) {
            this.Set('LastReviewedDate', value);
        }
        /**
        * * Field Name: Title
        * * Display Name: Title
        * * SQL Data Type: nvarchar(200)
        */
        get Title(): string {  
            return this.Get('Title');
        }
        set Title(value: string) {
            this.Set('Title', value);
        }
        /**
        * * Field Name: Email1
        * * Display Name: Email 1
        * * SQL Data Type: nvarchar(100)
        */
        get Email1(): string {  
            return this.Get('Email1');
        }
        set Email1(value: string) {
            this.Set('Email1', value);
        }
        /**
        * * Field Name: Email2
        * * Display Name: Email 2
        * * SQL Data Type: nvarchar(100)
        */
        get Email2(): string {  
            return this.Get('Email2');
        }
        set Email2(value: string) {
            this.Set('Email2', value);
        }
        /**
        * * Field Name: EmailSource
        * * Display Name: Email Source
        * * SQL Data Type: nvarchar(50)
        */
        get EmailSource(): string {  
            return this.Get('EmailSource');
        }
        set EmailSource(value: string) {
            this.Set('EmailSource', value);
        }
        /**
        * * Field Name: PhoneNumber
        * * Display Name: Phone Number
        * * SQL Data Type: nvarchar(50)
        */
        get PhoneNumber(): string {  
            return this.Get('PhoneNumber');
        }
        set PhoneNumber(value: string) {
            this.Set('PhoneNumber', value);
        }
        /**
        * * Field Name: ProfilePictureURL
        * * Display Name: Profile Picture URL
        * * SQL Data Type: nvarchar(500)
        */
        get ProfilePictureURL(): string {  
            return this.Get('ProfilePictureURL');
        }
        set ProfilePictureURL(value: string) {
            this.Set('ProfilePictureURL', value);
        }
        /**
        * * Field Name: Twitter
        * * Display Name: Twitter
        * * SQL Data Type: nvarchar(255)
        */
        get Twitter(): string {  
            return this.Get('Twitter');
        }
        set Twitter(value: string) {
            this.Set('Twitter', value);
        }
        /**
        * * Field Name: Instagram
        * * Display Name: Instagram
        * * SQL Data Type: nvarchar(255)
        */
        get Instagram(): string {  
            return this.Get('Instagram');
        }
        set Instagram(value: string) {
            this.Set('Instagram', value);
        }
        /**
        * * Field Name: LinkedIn
        * * Display Name: Linked In
        * * SQL Data Type: nvarchar(500)
        */
        get LinkedIn(): string {  
            return this.Get('LinkedIn');
        }
        set LinkedIn(value: string) {
            this.Set('LinkedIn', value);
        }
        /**
        * * Field Name: Facebook
        * * Display Name: Facebook
        * * SQL Data Type: nvarchar(255)
        */
        get Facebook(): string {  
            return this.Get('Facebook');
        }
        set Facebook(value: string) {
            this.Set('Facebook', value);
        }
        /**
        * * Field Name: EmailStatus
        * * Display Name: Email Status
        * * SQL Data Type: nvarchar(255)
        */
        get EmailStatus(): string {  
            return this.Get('EmailStatus');
        }
        set EmailStatus(value: string) {
            this.Set('EmailStatus', value);
        }
        /**
        * * Field Name: RoleID
        * * Display Name: Role ID
        * * SQL Data Type: int
        * * Related Entity: Contact Roles
        */
        get RoleID(): number {  
            return this.Get('RoleID');
        }
        set RoleID(value: number) {
            this.Set('RoleID', value);
        }
        /**
        * * Field Name: LevelID
        * * Display Name: Level ID
        * * SQL Data Type: int
        * * Related Entity: Contact Levels
        */
        get LevelID(): number {  
            return this.Get('LevelID');
        }
        set LevelID(value: number) {
            this.Set('LevelID', value);
        }
        /**
        * * Field Name: Prefix
        * * Display Name: Prefix
        * * SQL Data Type: nvarchar(20)
        */
        get Prefix(): string {  
            return this.Get('Prefix');
        }
        set Prefix(value: string) {
            this.Set('Prefix', value);
        }
        /**
        * * Field Name: Suffix
        * * Display Name: Suffix
        * * SQL Data Type: nvarchar(250)
        */
        get Suffix(): string {  
            return this.Get('Suffix');
        }
        set Suffix(value: string) {
            this.Set('Suffix', value);
        }
        /**
        * * Field Name: Tags
        * * Display Name: Tags
        * * SQL Data Type: nvarchar(MAX)
        */
        get Tags(): string {  
            return this.Get('Tags');
        }
        set Tags(value: string) {
            this.Set('Tags', value);
        }
        /**
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        */
        get Status(): string {  
            return this.Get('Status');
        }
        set Status(value: string) {
            this.Set('Status', value);
        }
        /**
        * * Field Name: ActivityCount
        * * Display Name: Activity Count
        * * SQL Data Type: int
        * * Default Value: 0
        */
        get ActivityCount(): number {  
            return this.Get('ActivityCount');
        }
        set ActivityCount(value: number) {
            this.Set('ActivityCount', value);
        }
        /**
        * * Field Name: LatestActivityDate
        * * Display Name: Latest Activity Date
        * * SQL Data Type: datetime
        */
        get LatestActivityDate(): Date {  
            return this.Get('LatestActivityDate');
        }
        set LatestActivityDate(value: Date) {
            this.Set('LatestActivityDate', value);
        }
        /**
        * * Field Name: EarliestActivityDate
        * * Display Name: Earliest Activity Date
        * * SQL Data Type: datetime
        */
        get EarliestActivityDate(): Date {  
            return this.Get('EarliestActivityDate');
        }
        set EarliestActivityDate(value: Date) {
            this.Set('EarliestActivityDate', value);
        }
        /**
        * * Field Name: RecordSource
        * * Display Name: Record Source
        * * SQL Data Type: nvarchar(50)
        */
        get RecordSource(): string {  
            return this.Get('RecordSource');
        }
        set RecordSource(value: string) {
            this.Set('RecordSource', value);
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
    
        /**
        * * Field Name: UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetime
        * * Default Value: getdate()
        */
        get UpdatedAt(): Date {  
            return this.Get('UpdatedAt');
        }
    
        /**
        * * Field Name: LastEnrichedAt
        * * Display Name: Last Enriched At
        * * SQL Data Type: datetime
        */
        get LastEnrichedAt(): Date {  
            return this.Get('LastEnrichedAt');
        }
        set LastEnrichedAt(value: Date) {
            this.Set('LastEnrichedAt', value);
        }
        /**
        * * Field Name: Account
        * * Display Name: Account
        * * SQL Data Type: nvarchar(255)
        */
        get Account(): string {  
            return this.Get('Account');
        }
    

    }
    
    /**
     * Deal Stages - strongly typed entity sub-class
     * * Schema: crm
     * * Base Table: DealStage
     * * Base View: vwDealStages
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Deal Stages')
    export class DealStageEntity extends BaseEntity {
        /**
        * Loads the Deal Stages record from the database
        * @param ID: Number - primary key value to load the Deal Stages record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof DealStageEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
        }
        
        /**
        * Deal Stages - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof DealStageEntity
        * @throws {Error} - Delete is not allowed for Deal Stages, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Deal Stages, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(20)
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
        * * SQL Data Type: nvarchar(200)
        */
        get Description(): string {  
            return this.Get('Description');
        }
        set Description(value: string) {
            this.Set('Description', value);
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
    
        /**
        * * Field Name: UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetime
        * * Default Value: getdate()
        */
        get UpdatedAt(): Date {  
            return this.Get('UpdatedAt');
        }
    

    }
    
    /**
     * Activities - strongly typed entity sub-class
     * * Schema: crm
     * * Base Table: Activity
     * * Base View: vwActivities
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Activities')
    export class ActivityEntity extends BaseEntity {
        /**
        * Loads the Activities record from the database
        * @param ID: Number - primary key value to load the Activities record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof ActivityEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
        }
        
        /**
        * Activities - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof ActivityEntity
        * @throws {Error} - Delete is not allowed for Activities, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Activities, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Field Name: BCMID
        * * Display Name: BCMID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newid()
        */
        get BCMID(): string {  
            return this.Get('BCMID');
        }
    
        /**
        * * Field Name: EmployeeID
        * * Display Name: Employee ID
        * * SQL Data Type: int
        * * Related Entity: Employees
        */
        get EmployeeID(): number {  
            return this.Get('EmployeeID');
        }
        set EmployeeID(value: number) {
            this.Set('EmployeeID', value);
        }
        /**
        * * Field Name: ContactID
        * * Display Name: Contact ID
        * * SQL Data Type: int
        * * Related Entity: Contacts
        */
        get ContactID(): number {  
            return this.Get('ContactID');
        }
        set ContactID(value: number) {
            this.Set('ContactID', value);
        }
        /**
        * * Field Name: AccountID
        * * Display Name: Account ID
        * * SQL Data Type: int
        * * Related Entity: Accounts
        */
        get AccountID(): number {  
            return this.Get('AccountID');
        }
        set AccountID(value: number) {
            this.Set('AccountID', value);
        }
        /**
        * * Field Name: DealID
        * * Display Name: Deal ID
        * * SQL Data Type: int
        * * Related Entity: Deals
        */
        get DealID(): number {  
            return this.Get('DealID');
        }
        set DealID(value: number) {
            this.Set('DealID', value);
        }
        /**
        * * Field Name: ActivityDate
        * * Display Name: Activity Date
        * * SQL Data Type: datetime
        * * Default Value: getdate()
        */
        get ActivityDate(): Date {  
            return this.Get('ActivityDate');
        }
        set ActivityDate(value: Date) {
            this.Set('ActivityDate', value);
        }
        /**
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        */
        get IsActive(): boolean {  
            return this.Get('IsActive');
        }
        set IsActive(value: boolean) {
            this.Set('IsActive', value);
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
        * * Field Name: Type
        * * Display Name: Type
        * * SQL Data Type: nvarchar(30)
        */
        get Type(): string {  
            return this.Get('Type');
        }
        set Type(value: string) {
            this.Set('Type', value);
        }
        /**
        * * Field Name: Attachment
        * * Display Name: Attachment
        * * SQL Data Type: nvarchar(255)
        */
        get Attachment(): string {  
            return this.Get('Attachment');
        }
        set Attachment(value: string) {
            this.Set('Attachment', value);
        }
        /**
        * * Field Name: CompanyIntegrationID
        * * Display Name: Company Integration ID
        * * SQL Data Type: int
        * * Related Entity: Company Integrations
        */
        get CompanyIntegrationID(): number {  
            return this.Get('CompanyIntegrationID');
        }
        set CompanyIntegrationID(value: number) {
            this.Set('CompanyIntegrationID', value);
        }
        /**
        * * Field Name: ExternalSystemRecordID
        * * Display Name: External System Record ID
        * * SQL Data Type: nvarchar(100)
        */
        get ExternalSystemRecordID(): string {  
            return this.Get('ExternalSystemRecordID');
        }
        set ExternalSystemRecordID(value: string) {
            this.Set('ExternalSystemRecordID', value);
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
    
        /**
        * * Field Name: UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetime
        * * Default Value: getdate()
        */
        get UpdatedAt(): Date {  
            return this.Get('UpdatedAt');
        }
    
        /**
        * * Field Name: AttachmentID
        * * Display Name: Attachment ID
        * * SQL Data Type: int
        * * Related Entity: Activity Attachments
        */
        get AttachmentID(): number {  
            return this.Get('AttachmentID');
        }
        set AttachmentID(value: number) {
            this.Set('AttachmentID', value);
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
        * * Field Name: IsOpened
        * * Display Name: Is Opened
        * * SQL Data Type: bit
        */
        get IsOpened(): boolean {  
            return this.Get('IsOpened');
        }
        set IsOpened(value: boolean) {
            this.Set('IsOpened', value);
        }
        /**
        * * Field Name: IsBounced
        * * Display Name: Is Bounced
        * * SQL Data Type: bit
        */
        get IsBounced(): boolean {  
            return this.Get('IsBounced');
        }
        set IsBounced(value: boolean) {
            this.Set('IsBounced', value);
        }
        /**
        * * Field Name: IsReplied
        * * Display Name: Is Replied
        * * SQL Data Type: bit
        */
        get IsReplied(): boolean {  
            return this.Get('IsReplied');
        }
        set IsReplied(value: boolean) {
            this.Set('IsReplied', value);
        }
        /**
        * * Field Name: Summary
        * * Display Name: Summary
        * * SQL Data Type: nvarchar(MAX)
        */
        get Summary(): string {  
            return this.Get('Summary');
        }
        set Summary(value: string) {
            this.Set('Summary', value);
        }
        /**
        * * Field Name: Account
        * * Display Name: Account
        * * SQL Data Type: nvarchar(255)
        */
        get Account(): string {  
            return this.Get('Account');
        }
    

    }
    
    /**
     * Deal Forecast Categories - strongly typed entity sub-class
     * * Schema: crm
     * * Base Table: DealForecastCategory
     * * Base View: vwDealForecastCategories
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Deal Forecast Categories')
    export class DealForecastCategoryEntity extends BaseEntity {
        /**
        * Loads the Deal Forecast Categories record from the database
        * @param ID: Number - primary key value to load the Deal Forecast Categories record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof DealForecastCategoryEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
        }
        
        /**
        * Deal Forecast Categories - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof DealForecastCategoryEntity
        * @throws {Error} - Delete is not allowed for Deal Forecast Categories, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Deal Forecast Categories, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(50)
        */
        get Name(): string {  
            return this.Get('Name');
        }
        set Name(value: string) {
            this.Set('Name', value);
        }
        /**
        * * Field Name: DisplayName
        * * Display Name: Display Name
        * * SQL Data Type: nvarchar(50)
        */
        get DisplayName(): string {  
            return this.Get('DisplayName');
        }
        set DisplayName(value: string) {
            this.Set('DisplayName', value);
        }
        /**
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(200)
        */
        get Description(): string {  
            return this.Get('Description');
        }
        set Description(value: string) {
            this.Set('Description', value);
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
    
        /**
        * * Field Name: UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetime
        * * Default Value: getdate()
        */
        get UpdatedAt(): Date {  
            return this.Get('UpdatedAt');
        }
    

    }
    
    /**
     * Deals - strongly typed entity sub-class
     * * Schema: crm
     * * Base Table: Deal
     * * Base View: vwDeals
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Deals')
    export class DealEntity extends BaseEntity {
        /**
        * Loads the Deals record from the database
        * @param ID: Number - primary key value to load the Deals record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof DealEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
        }
        
        /**
        * Deals - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof DealEntity
        * @throws {Error} - Delete is not allowed for Deals, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Deals, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Field Name: BCMID
        * * Display Name: BCMID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newid()
        */
        get BCMID(): string {  
            return this.Get('BCMID');
        }
    
        /**
        * * Field Name: ExternalSystemRecordID
        * * Display Name: External System Record ID
        * * SQL Data Type: nvarchar(50)
        */
        get ExternalSystemRecordID(): string {  
            return this.Get('ExternalSystemRecordID');
        }
        set ExternalSystemRecordID(value: string) {
            this.Set('ExternalSystemRecordID', value);
        }
        /**
        * * Field Name: CompanyIntegrationID
        * * Display Name: Company Integration ID
        * * SQL Data Type: int
        * * Related Entity: Company Integrations
        */
        get CompanyIntegrationID(): number {  
            return this.Get('CompanyIntegrationID');
        }
        set CompanyIntegrationID(value: number) {
            this.Set('CompanyIntegrationID', value);
        }
        /**
        * * Field Name: AccountID
        * * Display Name: Account ID
        * * SQL Data Type: int
        * * Related Entity: Accounts
        */
        get AccountID(): number {  
            return this.Get('AccountID');
        }
        set AccountID(value: number) {
            this.Set('AccountID', value);
        }
        /**
        * * Field Name: ContactID
        * * Display Name: Contact ID
        * * SQL Data Type: int
        * * Related Entity: Contacts
        */
        get ContactID(): number {  
            return this.Get('ContactID');
        }
        set ContactID(value: number) {
            this.Set('ContactID', value);
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
        get Description(): string {  
            return this.Get('Description');
        }
        set Description(value: string) {
            this.Set('Description', value);
        }
        /**
        * * Field Name: Value
        * * Display Name: Value
        * * SQL Data Type: money
        */
        get Value(): number {  
            return this.Get('Value');
        }
        set Value(value: number) {
            this.Set('Value', value);
        }
        /**
        * * Field Name: IncludeInForecast
        * * Display Name: Include In Forecast
        * * SQL Data Type: bit
        */
        get IncludeInForecast(): boolean {  
            return this.Get('IncludeInForecast');
        }
        set IncludeInForecast(value: boolean) {
            this.Set('IncludeInForecast', value);
        }
        /**
        * * Field Name: Probability
        * * Display Name: Probability
        * * SQL Data Type: decimal(10, 2)
        */
        get Probability(): number {  
            return this.Get('Probability');
        }
        set Probability(value: number) {
            this.Set('Probability', value);
        }
        /**
        * * Field Name: CloseDate
        * * Display Name: Close Date
        * * SQL Data Type: datetime
        */
        get CloseDate(): Date {  
            return this.Get('CloseDate');
        }
        set CloseDate(value: Date) {
            this.Set('CloseDate', value);
        }
        /**
        * * Field Name: EmployeeID
        * * Display Name: Employee ID
        * * SQL Data Type: int
        * * Related Entity: Employees
        */
        get EmployeeID(): number {  
            return this.Get('EmployeeID');
        }
        set EmployeeID(value: number) {
            this.Set('EmployeeID', value);
        }
        /**
        * * Field Name: Pipeline
        * * Display Name: Pipeline
        * * SQL Data Type: nvarchar(50)
        */
        get Pipeline(): string {  
            return this.Get('Pipeline');
        }
        set Pipeline(value: string) {
            this.Set('Pipeline', value);
        }
        /**
        * * Field Name: LeadSource
        * * Display Name: Lead Source
        * * SQL Data Type: nvarchar(50)
        */
        get LeadSource(): string {  
            return this.Get('LeadSource');
        }
        set LeadSource(value: string) {
            this.Set('LeadSource', value);
        }
        /**
        * * Field Name: LeadSourceDetail
        * * Display Name: Lead Source Detail
        * * SQL Data Type: nvarchar(MAX)
        */
        get LeadSourceDetail(): string {  
            return this.Get('LeadSourceDetail');
        }
        set LeadSourceDetail(value: string) {
            this.Set('LeadSourceDetail', value);
        }
        /**
        * * Field Name: ExternalSystemCreatedAt
        * * Display Name: External System Created At
        * * SQL Data Type: datetime
        */
        get ExternalSystemCreatedAt(): Date {  
            return this.Get('ExternalSystemCreatedAt');
        }
        set ExternalSystemCreatedAt(value: Date) {
            this.Set('ExternalSystemCreatedAt', value);
        }
        /**
        * * Field Name: ExternalSystemUpdatedAt
        * * Display Name: External System Updated At
        * * SQL Data Type: datetime
        */
        get ExternalSystemUpdatedAt(): Date {  
            return this.Get('ExternalSystemUpdatedAt');
        }
        set ExternalSystemUpdatedAt(value: Date) {
            this.Set('ExternalSystemUpdatedAt', value);
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
    
        /**
        * * Field Name: UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetime
        * * Default Value: getdate()
        */
        get UpdatedAt(): Date {  
            return this.Get('UpdatedAt');
        }
    
        /**
        * * Field Name: DealTypeID
        * * Display Name: Deal Type ID
        * * SQL Data Type: int
        * * Related Entity: Deal Types
        */
        get DealTypeID(): number {  
            return this.Get('DealTypeID');
        }
        set DealTypeID(value: number) {
            this.Set('DealTypeID', value);
        }
        /**
        * * Field Name: DealStageID
        * * Display Name: Deal Stage ID
        * * SQL Data Type: int
        * * Related Entity: Deal Stages
        */
        get DealStageID(): number {  
            return this.Get('DealStageID');
        }
        set DealStageID(value: number) {
            this.Set('DealStageID', value);
        }
        /**
        * * Field Name: DealForecastCategoryID
        * * Display Name: Deal Forecast Category ID
        * * SQL Data Type: int
        * * Related Entity: Deal Forecast Categories
        */
        get DealForecastCategoryID(): number {  
            return this.Get('DealForecastCategoryID');
        }
        set DealForecastCategoryID(value: number) {
            this.Set('DealForecastCategoryID', value);
        }
        /**
        * * Field Name: MRR
        * * Display Name: MRR
        * * SQL Data Type: money
        * * Default Value: 0
        */
        get MRR(): number {  
            return this.Get('MRR');
        }
        set MRR(value: number) {
            this.Set('MRR', value);
        }
        /**
        * * Field Name: OneTimeFees
        * * Display Name: One Time Fees
        * * SQL Data Type: money
        * * Default Value: 0
        */
        get OneTimeFees(): number {  
            return this.Get('OneTimeFees');
        }
        set OneTimeFees(value: number) {
            this.Set('OneTimeFees', value);
        }
        /**
        * * Field Name: ContractTermMonths
        * * Display Name: Contract Term Months
        * * SQL Data Type: int
        * * Default Value: 0
        */
        get ContractTermMonths(): number {  
            return this.Get('ContractTermMonths');
        }
        set ContractTermMonths(value: number) {
            this.Set('ContractTermMonths', value);
        }
        /**
        * * Field Name: ForecastNotes
        * * Display Name: Forecast Notes
        * * SQL Data Type: nvarchar(MAX)
        */
        get ForecastNotes(): string {  
            return this.Get('ForecastNotes');
        }
        set ForecastNotes(value: string) {
            this.Set('ForecastNotes', value);
        }
        /**
        * * Field Name: IsDeleted
        * * Display Name: Is Deleted
        * * SQL Data Type: bit
        * * Default Value: 0
        */
        get IsDeleted(): boolean {  
            return this.Get('IsDeleted');
        }
        set IsDeleted(value: boolean) {
            this.Set('IsDeleted', value);
        }
        /**
        * * Field Name: Account
        * * Display Name: Account
        * * SQL Data Type: nvarchar(255)
        */
        get Account(): string {  
            return this.Get('Account');
        }
    
        /**
        * * Field Name: DealType
        * * Display Name: Deal Type
        * * SQL Data Type: nvarchar(50)
        */
        get DealType(): string {  
            return this.Get('DealType');
        }
    
        /**
        * * Field Name: DealStage
        * * Display Name: Deal Stage
        * * SQL Data Type: nvarchar(20)
        */
        get DealStage(): string {  
            return this.Get('DealStage');
        }
    
        /**
        * * Field Name: DealForecastCategory
        * * Display Name: Deal Forecast Category
        * * SQL Data Type: nvarchar(50)
        */
        get DealForecastCategory(): string {  
            return this.Get('DealForecastCategory');
        }
    

    }
    
    /**
     * Deal Types - strongly typed entity sub-class
     * * Schema: crm
     * * Base Table: DealType
     * * Base View: vwDealTypes
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Deal Types')
    export class DealTypeEntity extends BaseEntity {
        /**
        * Loads the Deal Types record from the database
        * @param ID: Number - primary key value to load the Deal Types record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof DealTypeEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
        }
        
        /**
        * Deal Types - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof DealTypeEntity
        * @throws {Error} - Delete is not allowed for Deal Types, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Deal Types, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(50)
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
        * * SQL Data Type: nvarchar(200)
        */
        get Description(): string {  
            return this.Get('Description');
        }
        set Description(value: string) {
            this.Set('Description', value);
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
    
        /**
        * * Field Name: UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetime
        * * Default Value: getdate()
        */
        get UpdatedAt(): Date {  
            return this.Get('UpdatedAt');
        }
    
        /**
        * * Field Name: DisplayName
        * * Display Name: Display Name
        * * SQL Data Type: nvarchar(20)
        */
        get DisplayName(): string {  
            return this.Get('DisplayName');
        }
        set DisplayName(value: string) {
            this.Set('DisplayName', value);
        }

    }
    
    /**
     * Invoices - strongly typed entity sub-class
     * * Schema: crm
     * * Base Table: Invoice
     * * Base View: vwInvoices
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Invoices')
    export class InvoiceEntity extends BaseEntity {
        /**
        * Loads the Invoices record from the database
        * @param ID: Number - primary key value to load the Invoices record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof InvoiceEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
        }
        
        /**
        * Invoices - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof InvoiceEntity
        * @throws {Error} - Delete is not allowed for Invoices, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Invoices, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Field Name: BCMID
        * * Display Name: BCMID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newid()
        */
        get BCMID(): string {  
            return this.Get('BCMID');
        }
    
        /**
        * * Field Name: InvoiceDate
        * * Display Name: Invoice Date
        * * SQL Data Type: datetime
        */
        get InvoiceDate(): Date {  
            return this.Get('InvoiceDate');
        }
        set InvoiceDate(value: Date) {
            this.Set('InvoiceDate', value);
        }
        /**
        * * Field Name: AccountID
        * * Display Name: Account ID
        * * SQL Data Type: int
        * * Related Entity: Accounts
        */
        get AccountID(): number {  
            return this.Get('AccountID');
        }
        set AccountID(value: number) {
            this.Set('AccountID', value);
        }
        /**
        * * Field Name: ContactID
        * * Display Name: Contact ID
        * * SQL Data Type: int
        * * Related Entity: Contacts
        */
        get ContactID(): number {  
            return this.Get('ContactID');
        }
        set ContactID(value: number) {
            this.Set('ContactID', value);
        }
        /**
        * * Field Name: SubTotal
        * * Display Name: Sub Total
        * * SQL Data Type: money
        * * Default Value: 0
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
        * * SQL Data Type: money
        * * Default Value: 0
        */
        get Tax(): number {  
            return this.Get('Tax');
        }
        set Tax(value: number) {
            this.Set('Tax', value);
        }
        /**
        * * Field Name: Total
        * * Display Name: Total
        * * SQL Data Type: money
        * * Default Value: 0
        */
        get Total(): number {  
            return this.Get('Total');
        }
        set Total(value: number) {
            this.Set('Total', value);
        }
        /**
        * * Field Name: CompanyIntegrationID
        * * Display Name: Company Integration ID
        * * SQL Data Type: int
        * * Related Entity: Company Integrations
        */
        get CompanyIntegrationID(): number {  
            return this.Get('CompanyIntegrationID');
        }
        set CompanyIntegrationID(value: number) {
            this.Set('CompanyIntegrationID', value);
        }
        /**
        * * Field Name: ExternalSystemRecordID
        * * Display Name: External System Record ID
        * * SQL Data Type: nvarchar(50)
        */
        get ExternalSystemRecordID(): string {  
            return this.Get('ExternalSystemRecordID');
        }
        set ExternalSystemRecordID(value: string) {
            this.Set('ExternalSystemRecordID', value);
        }
        /**
        * * Field Name: InvoiceNumber
        * * Display Name: Invoice Number
        * * SQL Data Type: nvarchar(20)
        */
        get InvoiceNumber(): string {  
            return this.Get('InvoiceNumber');
        }
        set InvoiceNumber(value: string) {
            this.Set('InvoiceNumber', value);
        }
        /**
        * * Field Name: PostingDate
        * * Display Name: Posting Date
        * * SQL Data Type: datetime
        */
        get PostingDate(): Date {  
            return this.Get('PostingDate');
        }
        set PostingDate(value: Date) {
            this.Set('PostingDate', value);
        }
        /**
        * * Field Name: DueDate
        * * Display Name: Due Date
        * * SQL Data Type: datetime
        */
        get DueDate(): Date {  
            return this.Get('DueDate');
        }
        set DueDate(value: Date) {
            this.Set('DueDate', value);
        }
        /**
        * * Field Name: StatusID
        * * Display Name: Status ID
        * * SQL Data Type: int
        * * Related Entity: Invoice Status Types
        */
        get StatusID(): number {  
            return this.Get('StatusID');
        }
        set StatusID(value: number) {
            this.Set('StatusID', value);
        }
        /**
        * * Field Name: PaymentTermsID
        * * Display Name: Payment Terms ID
        * * SQL Data Type: int
        * * Related Entity: Payment Terms Types
        */
        get PaymentTermsID(): number {  
            return this.Get('PaymentTermsID');
        }
        set PaymentTermsID(value: number) {
            this.Set('PaymentTermsID', value);
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
    
        /**
        * * Field Name: UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetime
        * * Default Value: getdate()
        */
        get UpdatedAt(): Date {  
            return this.Get('UpdatedAt');
        }
    
        /**
        * * Field Name: Account
        * * Display Name: Account
        * * SQL Data Type: nvarchar(255)
        */
        get Account(): string {  
            return this.Get('Account');
        }
    
        /**
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        */
        get Status(): string {  
            return this.Get('Status');
        }
    
        /**
        * * Field Name: PaymentTerms
        * * Display Name: Payment Terms
        * * SQL Data Type: nvarchar(50)
        */
        get PaymentTerms(): string {  
            return this.Get('PaymentTerms');
        }
    

    }
    
    /**
     * Activity Attachments - strongly typed entity sub-class
     * * Schema: crm
     * * Base Table: ActivityAttachment
     * * Base View: vwActivityAttachments
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Activity Attachments')
    export class ActivityAttachmentEntity extends BaseEntity {
        /**
        * Loads the Activity Attachments record from the database
        * @param ID: Number - primary key value to load the Activity Attachments record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof ActivityAttachmentEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
        }
        
        /**
        * Activity Attachments - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof ActivityAttachmentEntity
        * @throws {Error} - Delete is not allowed for Activity Attachments, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Activity Attachments, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Field Name: Attachments
        * * Display Name: Attachments
        * * SQL Data Type: nvarchar(255)
        */
        get Attachments(): string {  
            return this.Get('Attachments');
        }
        set Attachments(value: string) {
            this.Set('Attachments', value);
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
    
        /**
        * * Field Name: UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetime
        * * Default Value: getdate()
        */
        get UpdatedAt(): Date {  
            return this.Get('UpdatedAt');
        }
    

    }
    
    /**
     * Payment Terms Types - strongly typed entity sub-class
     * * Schema: crm
     * * Base Table: PaymentTermsType
     * * Base View: vwPaymentTermsTypes
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Payment Terms Types')
    export class PaymentTermsTypeEntity extends BaseEntity {
        /**
        * Loads the Payment Terms Types record from the database
        * @param ID: Number - primary key value to load the Payment Terms Types record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof PaymentTermsTypeEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
        }
        
        /**
        * Payment Terms Types - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof PaymentTermsTypeEntity
        * @throws {Error} - Delete is not allowed for Payment Terms Types, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Payment Terms Types, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(50)
        */
        get Name(): string {  
            return this.Get('Name');
        }
        set Name(value: string) {
            this.Set('Name', value);
        }
        /**
        * * Field Name: DisplayName
        * * Display Name: Display Name
        * * SQL Data Type: nvarchar(20)
        */
        get DisplayName(): string {  
            return this.Get('DisplayName');
        }
        set DisplayName(value: string) {
            this.Set('DisplayName', value);
        }
        /**
        * * Field Name: Code
        * * Display Name: Code
        * * SQL Data Type: nvarchar(20)
        */
        get Code(): string {  
            return this.Get('Code');
        }
        set Code(value: string) {
            this.Set('Code', value);
        }
        /**
        * * Field Name: DueDateCalculation
        * * Display Name: Due Date Calculation
        * * SQL Data Type: nvarchar(20)
        */
        get DueDateCalculation(): string {  
            return this.Get('DueDateCalculation');
        }
        set DueDateCalculation(value: string) {
            this.Set('DueDateCalculation', value);
        }
        /**
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(200)
        */
        get Description(): string {  
            return this.Get('Description');
        }
        set Description(value: string) {
            this.Set('Description', value);
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
    
        /**
        * * Field Name: UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetime
        * * Default Value: getdate()
        */
        get UpdatedAt(): Date {  
            return this.Get('UpdatedAt');
        }
    
        /**
        * * Field Name: CompanyIntegrationID
        * * Display Name: Company Integration ID
        * * SQL Data Type: int
        * * Related Entity: Company Integrations
        */
        get CompanyIntegrationID(): number {  
            return this.Get('CompanyIntegrationID');
        }
        set CompanyIntegrationID(value: number) {
            this.Set('CompanyIntegrationID', value);
        }
        /**
        * * Field Name: ExternalSystemRecordID
        * * Display Name: External System Record ID
        * * SQL Data Type: nvarchar(100)
        */
        get ExternalSystemRecordID(): string {  
            return this.Get('ExternalSystemRecordID');
        }
        set ExternalSystemRecordID(value: string) {
            this.Set('ExternalSystemRecordID', value);
        }

    }
    
    /**
     * Invoice Status Types - strongly typed entity sub-class
     * * Schema: crm
     * * Base Table: InvoiceStatusType
     * * Base View: vwInvoiceStatusTypes
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Invoice Status Types')
    export class InvoiceStatusTypeEntity extends BaseEntity {
        /**
        * Loads the Invoice Status Types record from the database
        * @param ID: Number - primary key value to load the Invoice Status Types record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof InvoiceStatusTypeEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
        }
        
        /**
        * Invoice Status Types - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof InvoiceStatusTypeEntity
        * @throws {Error} - Delete is not allowed for Invoice Status Types, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Invoice Status Types, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(20)
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
        * * SQL Data Type: nvarchar(200)
        */
        get Description(): string {  
            return this.Get('Description');
        }
        set Description(value: string) {
            this.Set('Description', value);
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
    
        /**
        * * Field Name: UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetime
        * * Default Value: getdate()
        */
        get UpdatedAt(): Date {  
            return this.Get('UpdatedAt');
        }
    

    }
    