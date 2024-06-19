import { BaseEntity, KeyValuePair, EntitySaveOptions, CompositeKey } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
    
    /**
     * Companies - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: Company
     * * Base View: vwCompanies
     * * @description A list of organizational units within your business. These can be subsidiaries or divisions or other units. Companies are used to organizae employee records and also for separating integrations if you have multiple integrations of the same type of system.
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Companies')
    export class CompanyEntity extends BaseEntity {
        /**
        * Loads the Companies record from the database
        * @param ID: number - primary key value to load the Companies record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof CompanyEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
        
            /**
        * * Field Name: ID
        * * SQL Data Type: int
        */
        get ID(): number {  
            return this.Get('ID');
        }
        
        /**
        * * Field Name: Name
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
        * * SQL Data Type: nvarchar(200)
        */
        get Description(): string {  
            return this.Get('Description');
        }
        set Description(value: string) {
            this.Set('Description', value);
        }
        /**
        * * Field Name: Website
        * * SQL Data Type: nvarchar(100)
        */
        get Website(): string | null {  
            return this.Get('Website');
        }
        set Website(value: string | null) {
            this.Set('Website', value);
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
        * * Field Name: Domain
        * * Display Name: Domain
        * * SQL Data Type: nvarchar(255)
        */
        get Domain(): string | null {  
            return this.Get('Domain');
        }
        set Domain(value: string | null) {
            this.Set('Domain', value);
        }
        /**
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_CreatedAt(): Date {  
            return this.Get('__mj_CreatedAt');
        }
        
        /**
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_UpdatedAt(): Date {  
            return this.Get('__mj_UpdatedAt');
        }
        

    }
        
    /**
     * Employees - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: Employee
     * * Base View: vwEmployees
     * * @description A list of employees across all units of your organization
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Employees')
    export class EmployeeEntity extends BaseEntity {
        /**
        * Loads the Employees record from the database
        * @param ID: number - primary key value to load the Employees record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof EmployeeEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
        
            /**
        * * Field Name: ID
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
        * * SQL Data Type: nvarchar(30)
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
        * * SQL Data Type: nvarchar(50)
        */
        get LastName(): string {  
            return this.Get('LastName');
        }
        set LastName(value: string) {
            this.Set('LastName', value);
        }
        /**
        * * Field Name: Title
        * * SQL Data Type: nvarchar(50)
        */
        get Title(): string | null {  
            return this.Get('Title');
        }
        set Title(value: string | null) {
            this.Set('Title', value);
        }
        /**
        * * Field Name: Email
        * * SQL Data Type: nvarchar(100)
        */
        get Email(): string {  
            return this.Get('Email');
        }
        set Email(value: string) {
            this.Set('Email', value);
        }
        /**
        * * Field Name: Phone
        * * SQL Data Type: nvarchar(20)
        */
        get Phone(): string | null {  
            return this.Get('Phone');
        }
        set Phone(value: string | null) {
            this.Set('Phone', value);
        }
        /**
        * * Field Name: Active
        * * SQL Data Type: bit
        * * Default Value: 1
        */
        get Active(): boolean {  
            return this.Get('Active');
        }
        set Active(value: boolean) {
            this.Set('Active', value);
        }
        /**
        * * Field Name: CompanyID
        * * Display Name: Company ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Companies (vwCompanies.ID)
        */
        get CompanyID(): number {  
            return this.Get('CompanyID');
        }
        set CompanyID(value: number) {
            this.Set('CompanyID', value);
        }
        /**
        * * Field Name: SupervisorID
        * * Display Name: Supervisor ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Employees (vwEmployees.ID)
        */
        get SupervisorID(): number | null {  
            return this.Get('SupervisorID');
        }
        set SupervisorID(value: number | null) {
            this.Set('SupervisorID', value);
        }
        /**
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_CreatedAt(): Date {  
            return this.Get('__mj_CreatedAt');
        }
        
        /**
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_UpdatedAt(): Date {  
            return this.Get('__mj_UpdatedAt');
        }
        
        /**
        * * Field Name: FirstLast
        * * Display Name: First Last
        * * SQL Data Type: nvarchar(81)
        * * Default Value: getutcdate()
        */
        get FirstLast(): string | null {  
            return this.Get('FirstLast');
        }
        
        /**
        * * Field Name: Supervisor
        * * Display Name: Supervisor
        * * SQL Data Type: nvarchar(81)
        * * Default Value: getutcdate()
        */
        get Supervisor(): string | null {  
            return this.Get('Supervisor');
        }
        
        /**
        * * Field Name: SupervisorFirstName
        * * Display Name: Supervisor First Name
        * * SQL Data Type: nvarchar(30)
        */
        get SupervisorFirstName(): string | null {  
            return this.Get('SupervisorFirstName');
        }
        
        /**
        * * Field Name: SupervisorLastName
        * * Display Name: Supervisor Last Name
        * * SQL Data Type: nvarchar(50)
        */
        get SupervisorLastName(): string | null {  
            return this.Get('SupervisorLastName');
        }
        
        /**
        * * Field Name: SupervisorEmail
        * * Display Name: Supervisor Email
        * * SQL Data Type: nvarchar(100)
        */
        get SupervisorEmail(): string | null {  
            return this.Get('SupervisorEmail');
        }
        

    }
        
    /**
     * User Favorites - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: UserFavorite
     * * Base View: vwUserFavorites
     * * @description Records that each user can mark as a favorite for easy access
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'User Favorites')
    export class UserFavoriteEntity extends BaseEntity {
        /**
        * Loads the User Favorites record from the database
        * @param ID: number - primary key value to load the User Favorites record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof UserFavoriteEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
        
            /**
        * * Field Name: ID
        * * SQL Data Type: int
        */
        get ID(): number {  
            return this.Get('ID');
        }
        
        /**
        * * Field Name: UserID
        * * Display Name: User ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Users (vwUsers.ID)
        */
        get UserID(): number {  
            return this.Get('UserID');
        }
        set UserID(value: number) {
            this.Set('UserID', value);
        }
        /**
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)
        */
        get EntityID(): number {  
            return this.Get('EntityID');
        }
        set EntityID(value: number) {
            this.Set('EntityID', value);
        }
        /**
        * * Field Name: RecordID
        * * Display Name: Record
        * * SQL Data Type: nvarchar(255)
        */
        get RecordID(): string {  
            return this.Get('RecordID');
        }
        set RecordID(value: string) {
            this.Set('RecordID', value);
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
        * * Field Name: Entity
        * * SQL Data Type: nvarchar(255)
        */
        get Entity(): string {  
            return this.Get('Entity');
        }
        
        /**
        * * Field Name: EntityBaseTable
        * * Display Name: Entity Base Table
        * * SQL Data Type: nvarchar(255)
        */
        get EntityBaseTable(): string {  
            return this.Get('EntityBaseTable');
        }
        
        /**
        * * Field Name: EntityBaseView
        * * Display Name: Entity Base View
        * * SQL Data Type: nvarchar(255)
        */
        get EntityBaseView(): string {  
            return this.Get('EntityBaseView');
        }
        

    }
        
    /**
     * Employee Company Integrations - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: EmployeeCompanyIntegration
     * * Base View: vwEmployeeCompanyIntegrations
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Employee Company Integrations')
    export class EmployeeCompanyIntegrationEntity extends BaseEntity {
        /**
        * Loads the Employee Company Integrations record from the database
        * @param ID: number - primary key value to load the Employee Company Integrations record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof EmployeeCompanyIntegrationEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Employee Company Integrations - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof EmployeeCompanyIntegrationEntity
        * @throws {Error} - Delete is not allowed for Employee Company Integrations, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Employee Company Integrations, to enable it set AllowDeleteAPI to 1 in the database.');
        } 
            
            /**
        * * Field Name: ID
        * * SQL Data Type: int
        */
        get ID(): number {  
            return this.Get('ID');
        }
        
        /**
        * * Field Name: EmployeeID
        * * Display Name: Employee ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Employees (vwEmployees.ID)
        */
        get EmployeeID(): number {  
            return this.Get('EmployeeID');
        }
        set EmployeeID(value: number) {
            this.Set('EmployeeID', value);
        }
        /**
        * * Field Name: CompanyIntegrationID
        * * Display Name: Company Integration ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Company Integrations (vwCompanyIntegrations.ID)
        */
        get CompanyIntegrationID(): number {  
            return this.Get('CompanyIntegrationID');
        }
        set CompanyIntegrationID(value: number) {
            this.Set('CompanyIntegrationID', value);
        }
        /**
        * * Field Name: ExternalSystemRecordID
        * * Display Name: External System Record
        * * SQL Data Type: nvarchar(100)
        */
        get ExternalSystemRecordID(): string {  
            return this.Get('ExternalSystemRecordID');
        }
        set ExternalSystemRecordID(value: string) {
            this.Set('ExternalSystemRecordID', value);
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
     * Employee Roles - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: EmployeeRole
     * * Base View: vwEmployeeRoles
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Employee Roles')
    export class EmployeeRoleEntity extends BaseEntity {
        /**
        * Loads the Employee Roles record from the database
        * @param ID: number - primary key value to load the Employee Roles record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof EmployeeRoleEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Employee Roles - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof EmployeeRoleEntity
        * @throws {Error} - Delete is not allowed for Employee Roles, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Employee Roles, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Field Name: EmployeeID
        * * Display Name: Employee ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Employees (vwEmployees.ID)
        */
        get EmployeeID(): number {  
            return this.Get('EmployeeID');
        }
        set EmployeeID(value: number) {
            this.Set('EmployeeID', value);
        }
        /**
        * * Field Name: RoleID
        * * Display Name: Role ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Roles (vwRoles.ID)
        */
        get RoleID(): number {  
            return this.Get('RoleID');
        }
        set RoleID(value: number) {
            this.Set('RoleID', value);
        }
        /**
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_CreatedAt(): Date {  
            return this.Get('__mj_CreatedAt');
        }
        
        /**
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_UpdatedAt(): Date {  
            return this.Get('__mj_UpdatedAt');
        }
        
        /**
        * * Field Name: Role
        * * Display Name: Role
        * * SQL Data Type: nvarchar(50)
        * * Default Value: getutcdate()
        */
        get Role(): string {  
            return this.Get('Role');
        }
        

    }
        
    /**
     * Employee Skills - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: EmployeeSkill
     * * Base View: vwEmployeeSkills
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Employee Skills')
    export class EmployeeSkillEntity extends BaseEntity {
        /**
        * Loads the Employee Skills record from the database
        * @param ID: number - primary key value to load the Employee Skills record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof EmployeeSkillEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Employee Skills - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof EmployeeSkillEntity
        * @throws {Error} - Delete is not allowed for Employee Skills, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Employee Skills, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Field Name: EmployeeID
        * * Display Name: Employee ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Employees (vwEmployees.ID)
        */
        get EmployeeID(): number {  
            return this.Get('EmployeeID');
        }
        set EmployeeID(value: number) {
            this.Set('EmployeeID', value);
        }
        /**
        * * Field Name: SkillID
        * * Display Name: Skill ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Skills (vwSkills.ID)
        */
        get SkillID(): number {  
            return this.Get('SkillID');
        }
        set SkillID(value: number) {
            this.Set('SkillID', value);
        }
        /**
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_CreatedAt(): Date {  
            return this.Get('__mj_CreatedAt');
        }
        
        /**
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_UpdatedAt(): Date {  
            return this.Get('__mj_UpdatedAt');
        }
        
        /**
        * * Field Name: Skill
        * * Display Name: Skill
        * * SQL Data Type: nvarchar(50)
        * * Default Value: getutcdate()
        */
        get Skill(): string {  
            return this.Get('Skill');
        }
        

    }
        
    /**
     * Roles - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: Role
     * * Base View: vwRoles
     * * @description Roles are used for security administration and can have zero to many Users as members
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Roles')
    export class RoleEntity extends BaseEntity {
        /**
        * Loads the Roles record from the database
        * @param ID: number - primary key value to load the Roles record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof RoleEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
        
            /**
        * * Field Name: ID
        * * SQL Data Type: int
        */
        get ID(): number {  
            return this.Get('ID');
        }
        
        /**
        * * Field Name: Name
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
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Description of the role
        */
        get Description(): string | null {  
            return this.Get('Description');
        }
        set Description(value: string | null) {
            this.Set('Description', value);
        }
        /**
        * * Field Name: DirectoryID
        * * Display Name: Directory ID
        * * SQL Data Type: nvarchar(250)
        * * Description: The unique ID of the role in the directory being used for authentication, for example an ID in Azure.
        */
        get DirectoryID(): string | null {  
            return this.Get('DirectoryID');
        }
        set DirectoryID(value: string | null) {
            this.Set('DirectoryID', value);
        }
        /**
        * * Field Name: SQLName
        * * SQL Data Type: nvarchar(250)
        * * Description: The name of the role in the database, this is used for auto-generating permission statements by CodeGen
        */
        get SQLName(): string | null {  
            return this.Get('SQLName');
        }
        set SQLName(value: string | null) {
            this.Set('SQLName', value);
        }
        /**
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_CreatedAt(): Date {  
            return this.Get('__mj_CreatedAt');
        }
        
        /**
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_UpdatedAt(): Date {  
            return this.Get('__mj_UpdatedAt');
        }
        

    }
        
    /**
     * Skills - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: Skill
     * * Base View: vwSkills
     * * @description A hierarchical list of possible skills that are linked to Employees and can also be linked to any other entity
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Skills')
    export class SkillEntity extends BaseEntity {
        /**
        * Loads the Skills record from the database
        * @param ID: number - primary key value to load the Skills record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof SkillEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Skills - AllowCreateAPI and AllowUpdateAPI are both set to 0 in the database.  Save is not allowed, so this method is generated to override the base class method and throw an error. To enable save for this entity, set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof SkillEntity
        * @throws {Error} - Save is not allowed for Skills, to enable it set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.
        */
        public async Save(options?: EntitySaveOptions) : Promise<boolean> {
            throw new Error('Save is not allowed for Skills, to enable it set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.');
        } 
                
        /**
        * Skills - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof SkillEntity
        * @throws {Error} - Delete is not allowed for Skills, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Skills, to enable it set AllowDeleteAPI to 1 in the database.');
        } 
            
            /**
        * * Field Name: ID
        * * SQL Data Type: int
        */
        get ID(): number {  
            return this.Get('ID');
        }
        
        /**
        * * Field Name: Name
        * * SQL Data Type: nvarchar(50)
        */
        get Name(): string {  
            return this.Get('Name');
        }
        set Name(value: string) {
            this.Set('Name', value);
        }
        /**
        * * Field Name: ParentID
        * * Display Name: Parent
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Skills (vwSkills.ID)
        */
        get ParentID(): number | null {  
            return this.Get('ParentID');
        }
        set ParentID(value: number | null) {
            this.Set('ParentID', value);
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
        * * Field Name: Parent
        * * Display Name: Parent
        * * SQL Data Type: nvarchar(50)
        */
        get Parent(): string | null {  
            return this.Get('Parent');
        }
        

    }
        
    /**
     * Integration URL Formats - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: IntegrationURLFormat
     * * Base View: vwIntegrationURLFormats
     * * @description Used to generate web links for end users to easily access resources in a source system. URL Formats support templating to inject various field values at run-time to take a user directly to a resource in a source system.
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Integration URL Formats')
    export class IntegrationURLFormatEntity extends BaseEntity {
        /**
        * Loads the Integration URL Formats record from the database
        * @param ID: number - primary key value to load the Integration URL Formats record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof IntegrationURLFormatEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Integration URL Formats - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof IntegrationURLFormatEntity
        * @throws {Error} - Delete is not allowed for Integration URL Formats, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Integration URL Formats, to enable it set AllowDeleteAPI to 1 in the database.');
        } 
            
            /**
        * * Field Name: ID
        * * SQL Data Type: int
        */
        get ID(): number {  
            return this.Get('ID');
        }
        
        /**
        * * Field Name: IntegrationName
        * * Display Name: Integration Name
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Integrations (vwIntegrations.Name)
        */
        get IntegrationName(): string | null {  
            return this.Get('IntegrationName');
        }
        set IntegrationName(value: string | null) {
            this.Set('IntegrationName', value);
        }
        /**
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)
        */
        get EntityID(): number {  
            return this.Get('EntityID');
        }
        set EntityID(value: number) {
            this.Set('EntityID', value);
        }
        /**
        * * Field Name: URLFormat
        * * SQL Data Type: nvarchar(500)
        */
        get URLFormat(): string {  
            return this.Get('URLFormat');
        }
        set URLFormat(value: string) {
            this.Set('URLFormat', value);
        }
        /**
        * * Field Name: IntegrationID
        * * Display Name: Integration ID
        * * SQL Data Type: int
        */
        get IntegrationID(): number {  
            return this.Get('IntegrationID');
        }
        
        /**
        * * Field Name: Integration
        * * Display Name: Integration
        * * SQL Data Type: nvarchar(100)
        */
        get Integration(): string {  
            return this.Get('Integration');
        }
        
        /**
        * * Field Name: NavigationBaseURL
        * * Display Name: Navigation Base URL
        * * SQL Data Type: nvarchar(500)
        */
        get NavigationBaseURL(): string | null {  
            return this.Get('NavigationBaseURL');
        }
        
        /**
        * * Field Name: FullURLFormat
        * * Display Name: Full URLFormat
        * * SQL Data Type: nvarchar(1000)
        */
        get FullURLFormat(): string | null {  
            return this.Get('FullURLFormat');
        }
        

    }
        
    /**
     * Integrations - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: Integration
     * * Base View: vwIntegrations
     * * @description Catalog of all integrations that have been configured in the system.
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Integrations')
    export class IntegrationEntity extends BaseEntity {
        /**
        * Loads the Integrations record from the database
        * @param ID: number - primary key value to load the Integrations record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof IntegrationEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Integrations - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof IntegrationEntity
        * @throws {Error} - Delete is not allowed for Integrations, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Integrations, to enable it set AllowDeleteAPI to 1 in the database.');
        } 
            
            /**
        * * Field Name: ID
        * * SQL Data Type: int
        */
        get ID(): number {  
            return this.Get('ID');
        }
        
        /**
        * * Field Name: Name
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
        * * SQL Data Type: nvarchar(255)
        */
        get Description(): string | null {  
            return this.Get('Description');
        }
        set Description(value: string | null) {
            this.Set('Description', value);
        }
        /**
        * * Field Name: NavigationBaseURL
        * * Display Name: Navigation Base URL
        * * SQL Data Type: nvarchar(500)
        */
        get NavigationBaseURL(): string | null {  
            return this.Get('NavigationBaseURL');
        }
        set NavigationBaseURL(value: string | null) {
            this.Set('NavigationBaseURL', value);
        }
        /**
        * * Field Name: ClassName
        * * Display Name: Class Name
        * * SQL Data Type: nvarchar(100)
        */
        get ClassName(): string | null {  
            return this.Get('ClassName');
        }
        set ClassName(value: string | null) {
            this.Set('ClassName', value);
        }
        /**
        * * Field Name: ImportPath
        * * Display Name: Import Path
        * * SQL Data Type: nvarchar(100)
        */
        get ImportPath(): string | null {  
            return this.Get('ImportPath');
        }
        set ImportPath(value: string | null) {
            this.Set('ImportPath', value);
        }
        /**
        * * Field Name: BatchMaxRequestCount
        * * Display Name: Batch Max Request Count
        * * SQL Data Type: int
        * * Default Value: -1
        */
        get BatchMaxRequestCount(): number {  
            return this.Get('BatchMaxRequestCount');
        }
        set BatchMaxRequestCount(value: number) {
            this.Set('BatchMaxRequestCount', value);
        }
        /**
        * * Field Name: BatchRequestWaitTime
        * * Display Name: Batch Request Wait Time
        * * SQL Data Type: int
        * * Default Value: -1
        */
        get BatchRequestWaitTime(): number {  
            return this.Get('BatchRequestWaitTime');
        }
        set BatchRequestWaitTime(value: number) {
            this.Set('BatchRequestWaitTime', value);
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
     * Company Integrations - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: CompanyIntegration
     * * Base View: vwCompanyIntegrations
     * * @description Links individual company records to specific integrations
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Company Integrations')
    export class CompanyIntegrationEntity extends BaseEntity {
        /**
        * Loads the Company Integrations record from the database
        * @param ID: number - primary key value to load the Company Integrations record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof CompanyIntegrationEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Company Integrations - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof CompanyIntegrationEntity
        * @throws {Error} - Delete is not allowed for Company Integrations, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Company Integrations, to enable it set AllowDeleteAPI to 1 in the database.');
        } 
            
            /**
        * * Field Name: ID
        * * SQL Data Type: int
        */
        get ID(): number {  
            return this.Get('ID');
        }
        
        /**
        * * Field Name: CompanyName
        * * Display Name: Company Name
        * * SQL Data Type: nvarchar(50)
        * * Related Entity/Foreign Key: Companies (vwCompanies.Name)
        */
        get CompanyName(): string {  
            return this.Get('CompanyName');
        }
        set CompanyName(value: string) {
            this.Set('CompanyName', value);
        }
        /**
        * * Field Name: IntegrationName
        * * Display Name: Integration Name
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Integrations (vwIntegrations.Name)
        */
        get IntegrationName(): string {  
            return this.Get('IntegrationName');
        }
        set IntegrationName(value: string) {
            this.Set('IntegrationName', value);
        }
        /**
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        */
        get IsActive(): boolean | null {  
            return this.Get('IsActive');
        }
        set IsActive(value: boolean | null) {
            this.Set('IsActive', value);
        }
        /**
        * * Field Name: AccessToken
        * * Display Name: Access Token
        * * SQL Data Type: nvarchar(255)
        */
        get AccessToken(): string | null {  
            return this.Get('AccessToken');
        }
        set AccessToken(value: string | null) {
            this.Set('AccessToken', value);
        }
        /**
        * * Field Name: RefreshToken
        * * Display Name: Refresh Token
        * * SQL Data Type: nvarchar(255)
        */
        get RefreshToken(): string | null {  
            return this.Get('RefreshToken');
        }
        set RefreshToken(value: string | null) {
            this.Set('RefreshToken', value);
        }
        /**
        * * Field Name: TokenExpirationDate
        * * Display Name: Token Expiration Date
        * * SQL Data Type: datetime
        */
        get TokenExpirationDate(): Date | null {  
            return this.Get('TokenExpirationDate');
        }
        set TokenExpirationDate(value: Date | null) {
            this.Set('TokenExpirationDate', value);
        }
        /**
        * * Field Name: APIKey
        * * SQL Data Type: nvarchar(255)
        */
        get APIKey(): string | null {  
            return this.Get('APIKey');
        }
        set APIKey(value: string | null) {
            this.Set('APIKey', value);
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
        * * Field Name: ExternalSystemID
        * * Display Name: ExternalSystem
        * * SQL Data Type: nvarchar(100)
        */
        get ExternalSystemID(): string | null {  
            return this.Get('ExternalSystemID');
        }
        set ExternalSystemID(value: string | null) {
            this.Set('ExternalSystemID', value);
        }
        /**
        * * Field Name: IsExternalSystemReadOnly
        * * Display Name: Is External System Read Only
        * * SQL Data Type: bit
        * * Default Value: 0
        */
        get IsExternalSystemReadOnly(): boolean {  
            return this.Get('IsExternalSystemReadOnly');
        }
        set IsExternalSystemReadOnly(value: boolean) {
            this.Set('IsExternalSystemReadOnly', value);
        }
        /**
        * * Field Name: ClientID
        * * Display Name: Client
        * * SQL Data Type: nvarchar(255)
        */
        get ClientID(): string | null {  
            return this.Get('ClientID');
        }
        set ClientID(value: string | null) {
            this.Set('ClientID', value);
        }
        /**
        * * Field Name: ClientSecret
        * * Display Name: Client Secret
        * * SQL Data Type: nvarchar(255)
        */
        get ClientSecret(): string | null {  
            return this.Get('ClientSecret');
        }
        set ClientSecret(value: string | null) {
            this.Set('ClientSecret', value);
        }
        /**
        * * Field Name: CustomAttribute1
        * * Display Name: Custom Attribute 1
        * * SQL Data Type: nvarchar(255)
        */
        get CustomAttribute1(): string | null {  
            return this.Get('CustomAttribute1');
        }
        set CustomAttribute1(value: string | null) {
            this.Set('CustomAttribute1', value);
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
        * * Field Name: IntegrationID
        * * Display Name: Integration ID
        * * SQL Data Type: int
        */
        get IntegrationID(): number {  
            return this.Get('IntegrationID');
        }
        
        /**
        * * Field Name: Company
        * * SQL Data Type: nvarchar(50)
        */
        get Company(): string {  
            return this.Get('Company');
        }
        
        /**
        * * Field Name: Integration
        * * SQL Data Type: nvarchar(100)
        */
        get Integration(): string {  
            return this.Get('Integration');
        }
        
        /**
        * * Field Name: DriverClassName
        * * Display Name: Driver Class Name
        * * SQL Data Type: nvarchar(100)
        */
        get DriverClassName(): string | null {  
            return this.Get('DriverClassName');
        }
        
        /**
        * * Field Name: DriverImportPath
        * * Display Name: Driver Import Path
        * * SQL Data Type: nvarchar(100)
        */
        get DriverImportPath(): string | null {  
            return this.Get('DriverImportPath');
        }
        
        /**
        * * Field Name: LastRunID
        * * Display Name: LastRun
        * * SQL Data Type: int
        */
        get LastRunID(): number | null {  
            return this.Get('LastRunID');
        }
        
        /**
        * * Field Name: LastRunStartedAt
        * * Display Name: Last Run Started At
        * * SQL Data Type: datetime
        */
        get LastRunStartedAt(): Date | null {  
            return this.Get('LastRunStartedAt');
        }
        
        /**
        * * Field Name: LastRunEndedAt
        * * Display Name: Last Run Ended At
        * * SQL Data Type: datetime
        */
        get LastRunEndedAt(): Date | null {  
            return this.Get('LastRunEndedAt');
        }
        

    }
        
    /**
     * Entity Fields - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: EntityField
     * * Base View: vwEntityFields
     * * @description List of all fields within each entity with metadata about each field
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Entity Fields')
    export class EntityFieldEntity extends BaseEntity {
        /**
        * Loads the Entity Fields record from the database
        * @param ID: number - primary key value to load the Entity Fields record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof EntityFieldEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
        
            /**
        * * Field Name: ID
        * * SQL Data Type: int
        */
        get ID(): number {  
            return this.Get('ID');
        }
        
        /**
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)
        */
        get EntityID(): number {  
            return this.Get('EntityID');
        }
        
        /**
        * * Field Name: Sequence
        * * SQL Data Type: int
        * * Default Value: 0
        * * Description: Display order of the field within the entity
        */
        get Sequence(): number {  
            return this.Get('Sequence');
        }
        
        /**
        * * Field Name: Name
        * * SQL Data Type: nvarchar(255)
        * * Description: Name of the field within the database table
        */
        get Name(): string {  
            return this.Get('Name');
        }
        
        /**
        * * Field Name: DisplayName
        * * Display Name: Display Name
        * * SQL Data Type: nvarchar(255)
        * * Description: A user friendly alternative to the field name
        */
        get DisplayName(): string | null {  
            return this.Get('DisplayName');
        }
        set DisplayName(value: string | null) {
            this.Set('DisplayName', value);
        }
        /**
        * * Field Name: Description
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Descriptive text explaining the purpose of the field
        */
        get Description(): string | null {  
            return this.Get('Description');
        }
        set Description(value: string | null) {
            this.Set('Description', value);
        }
        /**
        * * Field Name: AutoUpdateDescription
        * * Display Name: Auto Update Description
        * * SQL Data Type: bit
        * * Default Value: 1
        * * Description: When set to 1 (default), whenever a description is modified in the column within the underlying view (first choice) or table (second choice), the Description column in the entity field definition will be automatically updated. If you never set metadata in the database directly, you can leave this alone. However, if you have metadata set in the database level for description, and you want to provide a DIFFERENT description in this entity field definition, turn this bit off and then set the Description field and future CodeGen runs will NOT override the Description field here.
        */
        get AutoUpdateDescription(): boolean {  
            return this.Get('AutoUpdateDescription');
        }
        set AutoUpdateDescription(value: boolean) {
            this.Set('AutoUpdateDescription', value);
        }
        /**
        * * Field Name: IsPrimaryKey
        * * Display Name: Is Primary Key
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Indicates if the field is part of the primary key for the entity (auto maintained by CodeGen)
        */
        get IsPrimaryKey(): boolean {  
            return this.Get('IsPrimaryKey');
        }
        set IsPrimaryKey(value: boolean) {
            this.Set('IsPrimaryKey', value);
        }
        /**
        * * Field Name: IsUnique
        * * Display Name: Is Unique
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Indicates if the field must have unique values within the entity.
        */
        get IsUnique(): boolean {  
            return this.Get('IsUnique');
        }
        set IsUnique(value: boolean) {
            this.Set('IsUnique', value);
        }
        /**
        * * Field Name: Category
        * * Display Name: Category
        * * SQL Data Type: nvarchar(255)
        * * Description: Used for generating custom tabs in the generated forms, only utilized if GeneratedFormSection=Category
        */
        get Category(): string | null {  
            return this.Get('Category');
        }
        set Category(value: string | null) {
            this.Set('Category', value);
        }
        /**
        * * Field Name: Type
        * * SQL Data Type: nvarchar(100)
        * * Description: SQL Data type (auto maintained by CodeGen)
        */
        get Type(): string {  
            return this.Get('Type');
        }
        
        /**
        * * Field Name: Length
        * * SQL Data Type: int
        * * Description: SQL data length (auto maintained by CodeGen)
        */
        get Length(): number | null {  
            return this.Get('Length');
        }
        
        /**
        * * Field Name: Precision
        * * SQL Data Type: int
        * * Description: SQL precision (auto maintained by CodeGen)
        */
        get Precision(): number | null {  
            return this.Get('Precision');
        }
        
        /**
        * * Field Name: Scale
        * * SQL Data Type: int
        * * Description: SQL scale (auto maintained by CodeGen)
        */
        get Scale(): number | null {  
            return this.Get('Scale');
        }
        
        /**
        * * Field Name: AllowsNull
        * * Display Name: Allows Null
        * * SQL Data Type: bit
        * * Default Value: 1
        * * Description: Does the column allow null or not (auto maintained by CodeGen)
        */
        get AllowsNull(): boolean {  
            return this.Get('AllowsNull');
        }
        
        /**
        * * Field Name: DefaultValue
        * * Display Name: Default Value
        * * SQL Data Type: nvarchar(255)
        * * Description: If a default value is defined for the field it is stored here (auto maintained by CodeGen)
        */
        get DefaultValue(): string | null {  
            return this.Get('DefaultValue');
        }
        
        /**
        * * Field Name: AutoIncrement
        * * Display Name: Auto Increment
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: If this field automatically increments within the table, this field is set to 1 (auto maintained by CodeGen)
        */
        get AutoIncrement(): boolean {  
            return this.Get('AutoIncrement');
        }
        
        /**
        * * Field Name: ValueListType
        * * Display Name: Value List Type
        * * SQL Data Type: nvarchar(20)
        * * Default Value: None
        * * Value List Type: List
        * * Possible Values 
        *   * None
        *   * List
        *   * ListOrUserEntry
        * * Description: Possible Values of None, List, ListOrUserEntry - the last option meaning that the list of possible values are options, but a user can enter anything else desired too.
        */
        get ValueListType(): 'None' | 'List' | 'ListOrUserEntry' {  
            return this.Get('ValueListType');
        }
        set ValueListType(value: 'None' | 'List' | 'ListOrUserEntry') {
            this.Set('ValueListType', value);
        }
        /**
        * * Field Name: ExtendedType
        * * Display Name: Extended Type
        * * SQL Data Type: nvarchar(50)
        * * Value List Type: List
        * * Possible Values 
        *   * Email
        *   * URL
        *   * Tel
        *   * SMS
        *   * Geo
        *   * WhatsApp
        *   * FaceTime
        *   * Skype
        *   * SIP
        *   * MSTeams
        *   * ZoomMtg
        *   * Other
        *   * Code
        * * Description: Defines extended behaviors for a field such as for Email, Web URLs, Code, etc.
        */
        get ExtendedType(): 'Email' | 'URL' | 'Tel' | 'SMS' | 'Geo' | 'WhatsApp' | 'FaceTime' | 'Skype' | 'SIP' | 'MSTeams' | 'ZoomMtg' | 'Other' | 'Code' | null {  
            return this.Get('ExtendedType');
        }
        set ExtendedType(value: 'Email' | 'URL' | 'Tel' | 'SMS' | 'Geo' | 'WhatsApp' | 'FaceTime' | 'Skype' | 'SIP' | 'MSTeams' | 'ZoomMtg' | 'Other' | 'Code' | null) {
            this.Set('ExtendedType', value);
        }
        /**
        * * Field Name: CodeType
        * * Display Name: Code Type
        * * SQL Data Type: nvarchar(50)
        * * Value List Type: List
        * * Possible Values 
        *   * TypeScript
        *   * SQL
        *   * HTML
        *   * CSS
        *   * JavaScript
        *   * Other
        * * Description: The type of code associated with this field. Only used when the ExtendedType field is set to "Code"
        */
        get CodeType(): 'TypeScript' | 'SQL' | 'HTML' | 'CSS' | 'JavaScript' | 'Other' | null {  
            return this.Get('CodeType');
        }
        set CodeType(value: 'TypeScript' | 'SQL' | 'HTML' | 'CSS' | 'JavaScript' | 'Other' | null) {
            this.Set('CodeType', value);
        }
        /**
        * * Field Name: DefaultInView
        * * Display Name: Default In View
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: If set to 1, this field will be included by default in any new view created by a user.
        */
        get DefaultInView(): boolean {  
            return this.Get('DefaultInView');
        }
        set DefaultInView(value: boolean) {
            this.Set('DefaultInView', value);
        }
        /**
        * * Field Name: ViewCellTemplate
        * * Display Name: View Cell Template
        * * SQL Data Type: nvarchar(MAX)
        * * Description: NULL
        */
        get ViewCellTemplate(): string | null {  
            return this.Get('ViewCellTemplate');
        }
        set ViewCellTemplate(value: string | null) {
            this.Set('ViewCellTemplate', value);
        }
        /**
        * * Field Name: DefaultColumnWidth
        * * Display Name: Default Column Width
        * * SQL Data Type: int
        * * Description: Determines the default width for this field when included in a view
        */
        get DefaultColumnWidth(): number | null {  
            return this.Get('DefaultColumnWidth');
        }
        set DefaultColumnWidth(value: number | null) {
            this.Set('DefaultColumnWidth', value);
        }
        /**
        * * Field Name: AllowUpdateAPI
        * * Display Name: Allow Update API
        * * SQL Data Type: bit
        * * Default Value: 1
        * * Description: If set to 1, this field will be considered updateable by the API and object model. For this field to have effect, the column type must be updateable (e.g. not part of the primary key and not auto-increment)
        */
        get AllowUpdateAPI(): boolean {  
            return this.Get('AllowUpdateAPI');
        }
        set AllowUpdateAPI(value: boolean) {
            this.Set('AllowUpdateAPI', value);
        }
        /**
        * * Field Name: AllowUpdateInView
        * * Display Name: Allow Update In View
        * * SQL Data Type: bit
        * * Default Value: 1
        * * Description: If set to 1, and if AllowUpdateAPI=1, the field can be edited within a view when the view is in edit mode.
        */
        get AllowUpdateInView(): boolean {  
            return this.Get('AllowUpdateInView');
        }
        set AllowUpdateInView(value: boolean) {
            this.Set('AllowUpdateInView', value);
        }
        /**
        * * Field Name: IncludeInUserSearchAPI
        * * Display Name: Include In User Search API
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: If set to 1, this column will be included in user search queries for both traditional and full text search
        */
        get IncludeInUserSearchAPI(): boolean {  
            return this.Get('IncludeInUserSearchAPI');
        }
        set IncludeInUserSearchAPI(value: boolean) {
            this.Set('IncludeInUserSearchAPI', value);
        }
        /**
        * * Field Name: FullTextSearchEnabled
        * * Display Name: Full Text Search Enabled
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: If set to 1, CodeGen will automatically generate a Full Text Catalog/Index in the database and include this field in the search index.
        */
        get FullTextSearchEnabled(): boolean {  
            return this.Get('FullTextSearchEnabled');
        }
        set FullTextSearchEnabled(value: boolean) {
            this.Set('FullTextSearchEnabled', value);
        }
        /**
        * * Field Name: UserSearchParamFormatAPI
        * * Display Name: User Search Param Format API
        * * SQL Data Type: nvarchar(500)
        * * Description: NULL
        */
        get UserSearchParamFormatAPI(): string | null {  
            return this.Get('UserSearchParamFormatAPI');
        }
        set UserSearchParamFormatAPI(value: string | null) {
            this.Set('UserSearchParamFormatAPI', value);
        }
        /**
        * * Field Name: IncludeInGeneratedForm
        * * Display Name: Include In Generated Form
        * * SQL Data Type: bit
        * * Default Value: 1
        * * Description: If set to 1, this field will be included in the generated form by CodeGen. If set to 0, this field will be excluded from the generated form. For custom forms, this field has no effect as the layout is controlled independently.
        */
        get IncludeInGeneratedForm(): boolean {  
            return this.Get('IncludeInGeneratedForm');
        }
        set IncludeInGeneratedForm(value: boolean) {
            this.Set('IncludeInGeneratedForm', value);
        }
        /**
        * * Field Name: GeneratedFormSection
        * * Display Name: Generated Form Section
        * * SQL Data Type: nvarchar(10)
        * * Default Value: Details
        * * Value List Type: List
        * * Possible Values 
        *   * Top
        *   * Category
        *   * Details
        * * Description: When set to Top, the field will be placed in a "top area" on the top of a generated form and visible regardless of which tab is displayed. When set to "category" Options: Top, Category, Details
        */
        get GeneratedFormSection(): 'Top' | 'Category' | 'Details' {  
            return this.Get('GeneratedFormSection');
        }
        set GeneratedFormSection(value: 'Top' | 'Category' | 'Details') {
            this.Set('GeneratedFormSection', value);
        }
        /**
        * * Field Name: IsVirtual
        * * Display Name: Is Virtual
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: NULL
        */
        get IsVirtual(): boolean {  
            return this.Get('IsVirtual');
        }
        
        /**
        * * Field Name: IsNameField
        * * Display Name: Is Name Field
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: If set to 1, this column will be used as the "Name" field for the entity and will be used to display the name of the record in various places in the UI.
        */
        get IsNameField(): boolean {  
            return this.Get('IsNameField');
        }
        set IsNameField(value: boolean) {
            this.Set('IsNameField', value);
        }
        /**
        * * Field Name: RelatedEntityID
        * * Display Name: RelatedEntity ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)
        * * Description: Link to the entity this field points to if it is a foreign key (auto maintained by CodeGen)
        */
        get RelatedEntityID(): number | null {  
            return this.Get('RelatedEntityID');
        }
        set RelatedEntityID(value: number | null) {
            this.Set('RelatedEntityID', value);
        }
        /**
        * * Field Name: RelatedEntityFieldName
        * * Display Name: Related Entity Field Name
        * * SQL Data Type: nvarchar(255)
        * * Description: Name of the field in the Related Entity that this field links to (auto maintained by CodeGen)
        */
        get RelatedEntityFieldName(): string | null {  
            return this.Get('RelatedEntityFieldName');
        }
        set RelatedEntityFieldName(value: string | null) {
            this.Set('RelatedEntityFieldName', value);
        }
        /**
        * * Field Name: IncludeRelatedEntityNameFieldInBaseView
        * * Display Name: Include Related Entity Name Field In Base View
        * * SQL Data Type: bit
        * * Default Value: 1
        * * Description: If set to 1, the "Name" field of the Related Entity will be included in this entity as a virtual field
        */
        get IncludeRelatedEntityNameFieldInBaseView(): boolean {  
            return this.Get('IncludeRelatedEntityNameFieldInBaseView');
        }
        set IncludeRelatedEntityNameFieldInBaseView(value: boolean) {
            this.Set('IncludeRelatedEntityNameFieldInBaseView', value);
        }
        /**
        * * Field Name: RelatedEntityNameFieldMap
        * * Display Name: Related Entity Name Field Map
        * * SQL Data Type: nvarchar(255)
        */
        get RelatedEntityNameFieldMap(): string | null {  
            return this.Get('RelatedEntityNameFieldMap');
        }
        set RelatedEntityNameFieldMap(value: string | null) {
            this.Set('RelatedEntityNameFieldMap', value);
        }
        /**
        * * Field Name: RelatedEntityDisplayType
        * * Display Name: Related Entity Display Type
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Search
        * * Description: Controls the generated form in the MJ Explorer UI - defaults to a search box, other option is a drop down. Possible values are Search and Dropdown
        */
        get RelatedEntityDisplayType(): string {  
            return this.Get('RelatedEntityDisplayType');
        }
        set RelatedEntityDisplayType(value: string) {
            this.Set('RelatedEntityDisplayType', value);
        }
        /**
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()
        */
        get __mj_CreatedAt(): Date {  
            return this.Get('__mj_CreatedAt');
        }
        
        /**
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()
        */
        get __mj_UpdatedAt(): Date {  
            return this.Get('__mj_UpdatedAt');
        }
        
        /**
        * * Field Name: Entity
        * * SQL Data Type: nvarchar(255)
        */
        get Entity(): string {  
            return this.Get('Entity');
        }
        
        /**
        * * Field Name: SchemaName
        * * Display Name: Schema Name
        * * SQL Data Type: nvarchar(255)
        */
        get SchemaName(): string {  
            return this.Get('SchemaName');
        }
        
        /**
        * * Field Name: BaseTable
        * * Display Name: Base Table
        * * SQL Data Type: nvarchar(255)
        */
        get BaseTable(): string {  
            return this.Get('BaseTable');
        }
        
        /**
        * * Field Name: BaseView
        * * Display Name: Base View
        * * SQL Data Type: nvarchar(255)
        */
        get BaseView(): string {  
            return this.Get('BaseView');
        }
        
        /**
        * * Field Name: EntityCodeName
        * * Display Name: Entity Code Name
        * * SQL Data Type: nvarchar(MAX)
        */
        get EntityCodeName(): string | null {  
            return this.Get('EntityCodeName');
        }
        
        /**
        * * Field Name: EntityClassName
        * * Display Name: Entity Class Name
        * * SQL Data Type: nvarchar(MAX)
        */
        get EntityClassName(): string | null {  
            return this.Get('EntityClassName');
        }
        
        /**
        * * Field Name: RelatedEntity
        * * Display Name: Related Entity
        * * SQL Data Type: nvarchar(255)
        */
        get RelatedEntity(): string | null {  
            return this.Get('RelatedEntity');
        }
        
        /**
        * * Field Name: RelatedEntitySchemaName
        * * Display Name: Related Entity Schema Name
        * * SQL Data Type: nvarchar(255)
        */
        get RelatedEntitySchemaName(): string | null {  
            return this.Get('RelatedEntitySchemaName');
        }
        
        /**
        * * Field Name: RelatedEntityBaseTable
        * * Display Name: Related Entity Base Table
        * * SQL Data Type: nvarchar(255)
        */
        get RelatedEntityBaseTable(): string | null {  
            return this.Get('RelatedEntityBaseTable');
        }
        
        /**
        * * Field Name: RelatedEntityBaseView
        * * Display Name: Related Entity Base View
        * * SQL Data Type: nvarchar(255)
        */
        get RelatedEntityBaseView(): string | null {  
            return this.Get('RelatedEntityBaseView');
        }
        
        /**
        * * Field Name: RelatedEntityCodeName
        * * Display Name: Related Entity Code Name
        * * SQL Data Type: nvarchar(MAX)
        */
        get RelatedEntityCodeName(): string | null {  
            return this.Get('RelatedEntityCodeName');
        }
        
        /**
        * * Field Name: RelatedEntityClassName
        * * Display Name: Related Entity Class Name
        * * SQL Data Type: nvarchar(MAX)
        */
        get RelatedEntityClassName(): string | null {  
            return this.Get('RelatedEntityClassName');
        }
        

    }
        
    /**
     * Entities - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: Entity
     * * Base View: vwEntities
     * * @description Catalog of all entities across all schemas
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Entities')
    export class EntityEntity extends BaseEntity {
        /**
        * Loads the Entities record from the database
        * @param ID: number - primary key value to load the Entities record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof EntityEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
        
            /**
        * * Field Name: ID
        * * SQL Data Type: int
        */
        get ID(): number {  
            return this.Get('ID');
        }
        
        /**
        * * Field Name: ParentID
        * * Display Name: Parent ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)
        */
        get ParentID(): number | null {  
            return this.Get('ParentID');
        }
        set ParentID(value: number | null) {
            this.Set('ParentID', value);
        }
        /**
        * * Field Name: Name
        * * SQL Data Type: nvarchar(255)
        */
        get Name(): string {  
            return this.Get('Name');
        }
        set Name(value: string) {
            this.Set('Name', value);
        }
        /**
        * * Field Name: NameSuffix
        * * Display Name: Name Suffix
        * * SQL Data Type: nvarchar(255)
        */
        get NameSuffix(): string | null {  
            return this.Get('NameSuffix');
        }
        set NameSuffix(value: string | null) {
            this.Set('NameSuffix', value);
        }
        /**
        * * Field Name: Description
        * * SQL Data Type: nvarchar(MAX)
        */
        get Description(): string | null {  
            return this.Get('Description');
        }
        set Description(value: string | null) {
            this.Set('Description', value);
        }
        /**
        * * Field Name: AutoUpdateDescription
        * * Display Name: Auto Update Description
        * * SQL Data Type: bit
        * * Default Value: 1
        * * Description: When set to 1 (default), whenever a description is modified in the underlying view (first choice) or table (second choice), the Description column in the entity definition will be automatically updated. If you never set metadata in the database directly, you can leave this alone. However, if you have metadata set in the database level for description, and you want to provide a DIFFERENT description in this entity definition, turn this bit off and then set the Description field and future CodeGen runs will NOT override the Description field here.
        */
        get AutoUpdateDescription(): boolean {  
            return this.Get('AutoUpdateDescription');
        }
        set AutoUpdateDescription(value: boolean) {
            this.Set('AutoUpdateDescription', value);
        }
        /**
        * * Field Name: BaseTable
        * * Display Name: Base Table
        * * SQL Data Type: nvarchar(255)
        */
        get BaseTable(): string {  
            return this.Get('BaseTable');
        }
        
        /**
        * * Field Name: BaseView
        * * Display Name: Base View
        * * SQL Data Type: nvarchar(255)
        */
        get BaseView(): string {  
            return this.Get('BaseView');
        }
        set BaseView(value: string) {
            this.Set('BaseView', value);
        }
        /**
        * * Field Name: BaseViewGenerated
        * * Display Name: Base View Generated
        * * SQL Data Type: bit
        * * Default Value: 1
        * * Description: When set to 0, CodeGen no longer generates a base view for the entity.
        */
        get BaseViewGenerated(): boolean {  
            return this.Get('BaseViewGenerated');
        }
        set BaseViewGenerated(value: boolean) {
            this.Set('BaseViewGenerated', value);
        }
        /**
        * * Field Name: SchemaName
        * * Display Name: Schema Name
        * * SQL Data Type: nvarchar(255)
        * * Default Value: dbo
        */
        get SchemaName(): string {  
            return this.Get('SchemaName');
        }
        
        /**
        * * Field Name: VirtualEntity
        * * Display Name: Virtual Entity
        * * SQL Data Type: bit
        * * Default Value: 0
        */
        get VirtualEntity(): boolean {  
            return this.Get('VirtualEntity');
        }
        set VirtualEntity(value: boolean) {
            this.Set('VirtualEntity', value);
        }
        /**
        * * Field Name: TrackRecordChanges
        * * Display Name: Track Record Changes
        * * SQL Data Type: bit
        * * Default Value: 1
        * * Description: When set to 1, changes made via the MemberJunction architecture will result in tracking records being created in the RecordChange table. In addition, when turned on CodeGen will ensure that your table has two fields: __mj_CreatedAt and __mj_UpdatedAt which are special fields used in conjunction with the RecordChange table to track changes to rows in your entity.
        */
        get TrackRecordChanges(): boolean {  
            return this.Get('TrackRecordChanges');
        }
        set TrackRecordChanges(value: boolean) {
            this.Set('TrackRecordChanges', value);
        }
        /**
        * * Field Name: AuditRecordAccess
        * * Display Name: Audit Record Access
        * * SQL Data Type: bit
        * * Default Value: 1
        * * Description: When set to 1, accessing a record by an end-user will result in an Audit Log record being created
        */
        get AuditRecordAccess(): boolean {  
            return this.Get('AuditRecordAccess');
        }
        set AuditRecordAccess(value: boolean) {
            this.Set('AuditRecordAccess', value);
        }
        /**
        * * Field Name: AuditViewRuns
        * * Display Name: Audit View Runs
        * * SQL Data Type: bit
        * * Default Value: 1
        * * Description: When set to 1, users running a view against this entity will result in an Audit Log record being created.
        */
        get AuditViewRuns(): boolean {  
            return this.Get('AuditViewRuns');
        }
        set AuditViewRuns(value: boolean) {
            this.Set('AuditViewRuns', value);
        }
        /**
        * * Field Name: IncludeInAPI
        * * Display Name: Include In API
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: If set to 0, the entity will not be available at all in the GraphQL API or the object model.
        */
        get IncludeInAPI(): boolean {  
            return this.Get('IncludeInAPI');
        }
        set IncludeInAPI(value: boolean) {
            this.Set('IncludeInAPI', value);
        }
        /**
        * * Field Name: AllowAllRowsAPI
        * * Display Name: Allow All Rows API
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: If set to 1, a GraphQL query will be enabled that allows access to all rows in the entity.
        */
        get AllowAllRowsAPI(): boolean {  
            return this.Get('AllowAllRowsAPI');
        }
        set AllowAllRowsAPI(value: boolean) {
            this.Set('AllowAllRowsAPI', value);
        }
        /**
        * * Field Name: AllowUpdateAPI
        * * Display Name: Allow Update API
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Global flag controlling if updates are allowed for any user, or not. If set to 1, a GraqhQL mutation and stored procedure are created. Permissions are still required to perform the action but if this flag is set to 0, no user will be able to perform the action.
        */
        get AllowUpdateAPI(): boolean {  
            return this.Get('AllowUpdateAPI');
        }
        set AllowUpdateAPI(value: boolean) {
            this.Set('AllowUpdateAPI', value);
        }
        /**
        * * Field Name: AllowCreateAPI
        * * Display Name: Allow Create API
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Global flag controlling if creates are allowed for any user, or not. If set to 1, a GraqhQL mutation and stored procedure are created. Permissions are still required to perform the action but if this flag is set to 0, no user will be able to perform the action.
        */
        get AllowCreateAPI(): boolean {  
            return this.Get('AllowCreateAPI');
        }
        set AllowCreateAPI(value: boolean) {
            this.Set('AllowCreateAPI', value);
        }
        /**
        * * Field Name: AllowDeleteAPI
        * * Display Name: Allow Delete API
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Global flag controlling if deletes are allowed for any user, or not. If set to 1, a GraqhQL mutation and stored procedure are created. Permissions are still required to perform the action but if this flag is set to 0, no user will be able to perform the action.
        */
        get AllowDeleteAPI(): boolean {  
            return this.Get('AllowDeleteAPI');
        }
        set AllowDeleteAPI(value: boolean) {
            this.Set('AllowDeleteAPI', value);
        }
        /**
        * * Field Name: CustomResolverAPI
        * * Display Name: Custom Resolver API
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Set to 1 if a custom resolver has been created for the entity.
        */
        get CustomResolverAPI(): boolean {  
            return this.Get('CustomResolverAPI');
        }
        set CustomResolverAPI(value: boolean) {
            this.Set('CustomResolverAPI', value);
        }
        /**
        * * Field Name: AllowUserSearchAPI
        * * Display Name: Allow User Search API
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Enabling this bit will result in search being possible at the API and UI layers
        */
        get AllowUserSearchAPI(): boolean {  
            return this.Get('AllowUserSearchAPI');
        }
        set AllowUserSearchAPI(value: boolean) {
            this.Set('AllowUserSearchAPI', value);
        }
        /**
        * * Field Name: FullTextSearchEnabled
        * * Display Name: Full Text Search Enabled
        * * SQL Data Type: bit
        * * Default Value: 0
        */
        get FullTextSearchEnabled(): boolean {  
            return this.Get('FullTextSearchEnabled');
        }
        set FullTextSearchEnabled(value: boolean) {
            this.Set('FullTextSearchEnabled', value);
        }
        /**
        * * Field Name: FullTextCatalog
        * * Display Name: Full Text Catalog
        * * SQL Data Type: nvarchar(255)
        */
        get FullTextCatalog(): string | null {  
            return this.Get('FullTextCatalog');
        }
        set FullTextCatalog(value: string | null) {
            this.Set('FullTextCatalog', value);
        }
        /**
        * * Field Name: FullTextCatalogGenerated
        * * Display Name: Full Text Catalog Generated
        * * SQL Data Type: bit
        * * Default Value: 1
        */
        get FullTextCatalogGenerated(): boolean {  
            return this.Get('FullTextCatalogGenerated');
        }
        set FullTextCatalogGenerated(value: boolean) {
            this.Set('FullTextCatalogGenerated', value);
        }
        /**
        * * Field Name: FullTextIndex
        * * Display Name: Full Text Index
        * * SQL Data Type: nvarchar(255)
        */
        get FullTextIndex(): string | null {  
            return this.Get('FullTextIndex');
        }
        set FullTextIndex(value: string | null) {
            this.Set('FullTextIndex', value);
        }
        /**
        * * Field Name: FullTextIndexGenerated
        * * Display Name: Full Text Index Generated
        * * SQL Data Type: bit
        * * Default Value: 1
        */
        get FullTextIndexGenerated(): boolean {  
            return this.Get('FullTextIndexGenerated');
        }
        set FullTextIndexGenerated(value: boolean) {
            this.Set('FullTextIndexGenerated', value);
        }
        /**
        * * Field Name: FullTextSearchFunction
        * * Display Name: Full Text Search Function
        * * SQL Data Type: nvarchar(255)
        */
        get FullTextSearchFunction(): string | null {  
            return this.Get('FullTextSearchFunction');
        }
        set FullTextSearchFunction(value: string | null) {
            this.Set('FullTextSearchFunction', value);
        }
        /**
        * * Field Name: FullTextSearchFunctionGenerated
        * * Display Name: Full Text Search Function Generated
        * * SQL Data Type: bit
        * * Default Value: 1
        */
        get FullTextSearchFunctionGenerated(): boolean {  
            return this.Get('FullTextSearchFunctionGenerated');
        }
        set FullTextSearchFunctionGenerated(value: boolean) {
            this.Set('FullTextSearchFunctionGenerated', value);
        }
        /**
        * * Field Name: UserViewMaxRows
        * * Display Name: User View Max Rows
        * * SQL Data Type: int
        * * Default Value: 1000
        */
        get UserViewMaxRows(): number | null {  
            return this.Get('UserViewMaxRows');
        }
        set UserViewMaxRows(value: number | null) {
            this.Set('UserViewMaxRows', value);
        }
        /**
        * * Field Name: spCreate
        * * Display Name: spCreate
        * * SQL Data Type: nvarchar(255)
        */
        get spCreate(): string | null {  
            return this.Get('spCreate');
        }
        set spCreate(value: string | null) {
            this.Set('spCreate', value);
        }
        /**
        * * Field Name: spUpdate
        * * Display Name: spUpdate
        * * SQL Data Type: nvarchar(255)
        */
        get spUpdate(): string | null {  
            return this.Get('spUpdate');
        }
        set spUpdate(value: string | null) {
            this.Set('spUpdate', value);
        }
        /**
        * * Field Name: spDelete
        * * Display Name: spDelete
        * * SQL Data Type: nvarchar(255)
        */
        get spDelete(): string | null {  
            return this.Get('spDelete');
        }
        set spDelete(value: string | null) {
            this.Set('spDelete', value);
        }
        /**
        * * Field Name: spCreateGenerated
        * * Display Name: sp CreateGenerated
        * * SQL Data Type: bit
        * * Default Value: 1
        */
        get spCreateGenerated(): boolean {  
            return this.Get('spCreateGenerated');
        }
        set spCreateGenerated(value: boolean) {
            this.Set('spCreateGenerated', value);
        }
        /**
        * * Field Name: spUpdateGenerated
        * * Display Name: sp Update Generated
        * * SQL Data Type: bit
        * * Default Value: 1
        */
        get spUpdateGenerated(): boolean {  
            return this.Get('spUpdateGenerated');
        }
        set spUpdateGenerated(value: boolean) {
            this.Set('spUpdateGenerated', value);
        }
        /**
        * * Field Name: spDeleteGenerated
        * * Display Name: sp Delete Generated
        * * SQL Data Type: bit
        * * Default Value: 1
        */
        get spDeleteGenerated(): boolean {  
            return this.Get('spDeleteGenerated');
        }
        set spDeleteGenerated(value: boolean) {
            this.Set('spDeleteGenerated', value);
        }
        /**
        * * Field Name: CascadeDeletes
        * * Display Name: Cascade Deletes
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: When set to 1, the deleted spDelete will pre-process deletion to related entities that have 1:M cardinality with this entity. This does not have effect if spDeleteGenerated = 0
        */
        get CascadeDeletes(): boolean {  
            return this.Get('CascadeDeletes');
        }
        set CascadeDeletes(value: boolean) {
            this.Set('CascadeDeletes', value);
        }
        /**
        * * Field Name: spMatch
        * * Display Name: sp Match
        * * SQL Data Type: nvarchar(255)
        * * Description: When specified, this stored procedure is used to find matching records in this particular entity. The convention is to pass in the primary key(s) columns for the given entity to the procedure and the return will be zero to many rows where there is a column for each primary key field(s) and a ProbabilityScore (numeric(1,12)) column that has a 0 to 1 value of the probability of a match.
        */
        get spMatch(): string | null {  
            return this.Get('spMatch');
        }
        set spMatch(value: string | null) {
            this.Set('spMatch', value);
        }
        /**
        * * Field Name: UserFormGenerated
        * * Display Name: User Form Generated
        * * SQL Data Type: bit
        * * Default Value: 1
        */
        get UserFormGenerated(): boolean {  
            return this.Get('UserFormGenerated');
        }
        set UserFormGenerated(value: boolean) {
            this.Set('UserFormGenerated', value);
        }
        /**
        * * Field Name: EntityObjectSubclassName
        * * Display Name: Entity Object Subclass Name
        * * SQL Data Type: nvarchar(255)
        */
        get EntityObjectSubclassName(): string | null {  
            return this.Get('EntityObjectSubclassName');
        }
        set EntityObjectSubclassName(value: string | null) {
            this.Set('EntityObjectSubclassName', value);
        }
        /**
        * * Field Name: EntityObjectSubclassImport
        * * Display Name: Entity Object Subclass Import
        * * SQL Data Type: nvarchar(255)
        */
        get EntityObjectSubclassImport(): string | null {  
            return this.Get('EntityObjectSubclassImport');
        }
        set EntityObjectSubclassImport(value: string | null) {
            this.Set('EntityObjectSubclassImport', value);
        }
        /**
        * * Field Name: PreferredCommunicationField
        * * Display Name: Preferred Communication Field
        * * SQL Data Type: nvarchar(255)
        * * Description: Used to specify a field within the entity that in turn contains the field name that will be used for record-level communication preferences. For example in a hypothetical entity called Contacts, say there is a field called PreferredComm and that field had possible values of Email1, SMS, and Phone, and those value in turn corresponded to field names in the entity. Each record in the Contacts entity could have a specific preference for which field would be used for communication. The MJ Communication Framework will use this information when available, as a priority ahead of the data in the Entity Communication Fields entity which is entity-level and not record-level.
        */
        get PreferredCommunicationField(): string | null {  
            return this.Get('PreferredCommunicationField');
        }
        set PreferredCommunicationField(value: string | null) {
            this.Set('PreferredCommunicationField', value);
        }
        /**
        * * Field Name: Icon
        * * Display Name: Icon
        * * SQL Data Type: nvarchar(500)
        * * Description: Optional, specify an icon (CSS Class) for each entity for display in the UI
        */
        get Icon(): string | null {  
            return this.Get('Icon');
        }
        set Icon(value: string | null) {
            this.Set('Icon', value);
        }
        /**
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_CreatedAt(): Date {  
            return this.Get('__mj_CreatedAt');
        }
        
        /**
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_UpdatedAt(): Date {  
            return this.Get('__mj_UpdatedAt');
        }
        
        /**
        * * Field Name: CodeName
        * * Display Name: Code Name
        * * SQL Data Type: nvarchar(MAX)
        * * Default Value: getutcdate()
        */
        get CodeName(): string | null {  
            return this.Get('CodeName');
        }
        
        /**
        * * Field Name: ClassName
        * * Display Name: Class Name
        * * SQL Data Type: nvarchar(MAX)
        * * Default Value: getutcdate()
        */
        get ClassName(): string | null {  
            return this.Get('ClassName');
        }
        
        /**
        * * Field Name: BaseTableCodeName
        * * Display Name: Base Table Code Name
        * * SQL Data Type: nvarchar(MAX)
        */
        get BaseTableCodeName(): string | null {  
            return this.Get('BaseTableCodeName');
        }
        
        /**
        * * Field Name: ParentEntity
        * * Display Name: Parent Entity
        * * SQL Data Type: nvarchar(255)
        */
        get ParentEntity(): string | null {  
            return this.Get('ParentEntity');
        }
        
        /**
        * * Field Name: ParentBaseTable
        * * Display Name: Parent Base Table
        * * SQL Data Type: nvarchar(255)
        */
        get ParentBaseTable(): string | null {  
            return this.Get('ParentBaseTable');
        }
        
        /**
        * * Field Name: ParentBaseView
        * * Display Name: Parent Base View
        * * SQL Data Type: nvarchar(255)
        */
        get ParentBaseView(): string | null {  
            return this.Get('ParentBaseView');
        }
        

    }
        
    /**
     * Users - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: User
     * * Base View: vwUsers
     * * @description A list of all users who have or had access to the system
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Users')
    export class UserEntity extends BaseEntity {
        /**
        * Loads the Users record from the database
        * @param ID: number - primary key value to load the Users record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof UserEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
        
            /**
        * * Field Name: ID
        * * SQL Data Type: int
        */
        get ID(): number {  
            return this.Get('ID');
        }
        
        /**
        * * Field Name: Name
        * * SQL Data Type: nvarchar(100)
        */
        get Name(): string {  
            return this.Get('Name');
        }
        set Name(value: string) {
            this.Set('Name', value);
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
        * * Field Name: Title
        * * Display Name: Title
        * * SQL Data Type: nvarchar(50)
        */
        get Title(): string | null {  
            return this.Get('Title');
        }
        set Title(value: string | null) {
            this.Set('Title', value);
        }
        /**
        * * Field Name: Email
        * * SQL Data Type: nvarchar(100)
        */
        get Email(): string {  
            return this.Get('Email');
        }
        set Email(value: string) {
            this.Set('Email', value);
        }
        /**
        * * Field Name: Type
        * * SQL Data Type: nchar(15)
        * * Value List Type: List
        * * Possible Values 
        *   * User
        *   * Owner
        */
        get Type(): 'User' | 'Owner' {  
            return this.Get('Type');
        }
        set Type(value: 'User' | 'Owner') {
            this.Set('Type', value);
        }
        /**
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 0
        */
        get IsActive(): boolean {  
            return this.Get('IsActive');
        }
        set IsActive(value: boolean) {
            this.Set('IsActive', value);
        }
        /**
        * * Field Name: LinkedRecordType
        * * Display Name: Linked Record Type
        * * SQL Data Type: nchar(10)
        * * Default Value: None
        */
        get LinkedRecordType(): string {  
            return this.Get('LinkedRecordType');
        }
        set LinkedRecordType(value: string) {
            this.Set('LinkedRecordType', value);
        }
        /**
        * * Field Name: EmployeeID
        * * Display Name: Employee
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Employees (vwEmployees.ID)
        */
        get EmployeeID(): number | null {  
            return this.Get('EmployeeID');
        }
        set EmployeeID(value: number | null) {
            this.Set('EmployeeID', value);
        }
        /**
        * * Field Name: LinkedEntityID
        * * Display Name: Linked Entity ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)
        */
        get LinkedEntityID(): number | null {  
            return this.Get('LinkedEntityID');
        }
        set LinkedEntityID(value: number | null) {
            this.Set('LinkedEntityID', value);
        }
        /**
        * * Field Name: LinkedEntityRecordID
        * * Display Name: Linked Entity Record ID
        * * SQL Data Type: int
        */
        get LinkedEntityRecordID(): number | null {  
            return this.Get('LinkedEntityRecordID');
        }
        set LinkedEntityRecordID(value: number | null) {
            this.Set('LinkedEntityRecordID', value);
        }
        /**
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_CreatedAt(): Date {  
            return this.Get('__mj_CreatedAt');
        }
        
        /**
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_UpdatedAt(): Date {  
            return this.Get('__mj_UpdatedAt');
        }
        
        /**
        * * Field Name: FirstLast
        * * Display Name: First Last
        * * SQL Data Type: nvarchar(101)
        * * Default Value: getutcdate()
        */
        get FirstLast(): string | null {  
            return this.Get('FirstLast');
        }
        
        /**
        * * Field Name: EmployeeFirstLast
        * * Display Name: Employee First Last
        * * SQL Data Type: nvarchar(81)
        * * Default Value: getutcdate()
        */
        get EmployeeFirstLast(): string | null {  
            return this.Get('EmployeeFirstLast');
        }
        
        /**
        * * Field Name: EmployeeEmail
        * * Display Name: Employee Email
        * * SQL Data Type: nvarchar(100)
        */
        get EmployeeEmail(): string | null {  
            return this.Get('EmployeeEmail');
        }
        
        /**
        * * Field Name: EmployeeTitle
        * * Display Name: Employee Title
        * * SQL Data Type: nvarchar(50)
        */
        get EmployeeTitle(): string | null {  
            return this.Get('EmployeeTitle');
        }
        
        /**
        * * Field Name: EmployeeSupervisor
        * * Display Name: Employee Supervisor
        * * SQL Data Type: nvarchar(81)
        */
        get EmployeeSupervisor(): string | null {  
            return this.Get('EmployeeSupervisor');
        }
        
        /**
        * * Field Name: EmployeeSupervisorEmail
        * * Display Name: Employee Supervisor Email
        * * SQL Data Type: nvarchar(100)
        */
        get EmployeeSupervisorEmail(): string | null {  
            return this.Get('EmployeeSupervisorEmail');
        }
        

    }
        
    /**
     * Entity Relationships - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: EntityRelationship
     * * Base View: vwEntityRelationships
     * * @description Metadata about relationships between entities including display preferences for the UI
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Entity Relationships')
    export class EntityRelationshipEntity extends BaseEntity {
        /**
        * Loads the Entity Relationships record from the database
        * @param ID: number - primary key value to load the Entity Relationships record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof EntityRelationshipEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
        
            /**
        * * Field Name: ID
        * * SQL Data Type: int
        */
        get ID(): number {  
            return this.Get('ID');
        }
        
        /**
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)
        */
        get EntityID(): number {  
            return this.Get('EntityID');
        }
        set EntityID(value: number) {
            this.Set('EntityID', value);
        }
        /**
        * * Field Name: Sequence
        * * Display Name: Sequence
        * * SQL Data Type: int
        * * Default Value: 0
        * * Description: Used for display order in generated forms and in other places in the UI where relationships for an entity are shown
        */
        get Sequence(): number {  
            return this.Get('Sequence');
        }
        set Sequence(value: number) {
            this.Set('Sequence', value);
        }
        /**
        * * Field Name: RelatedEntityID
        * * Display Name: Related Entity ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)
        */
        get RelatedEntityID(): number {  
            return this.Get('RelatedEntityID');
        }
        set RelatedEntityID(value: number) {
            this.Set('RelatedEntityID', value);
        }
        /**
        * * Field Name: BundleInAPI
        * * Display Name: Bundle In API
        * * SQL Data Type: bit
        * * Default Value: 1
        */
        get BundleInAPI(): boolean {  
            return this.Get('BundleInAPI');
        }
        set BundleInAPI(value: boolean) {
            this.Set('BundleInAPI', value);
        }
        /**
        * * Field Name: IncludeInParentAllQuery
        * * Display Name: Include In Parent All Query
        * * SQL Data Type: bit
        * * Default Value: 0
        */
        get IncludeInParentAllQuery(): boolean {  
            return this.Get('IncludeInParentAllQuery');
        }
        set IncludeInParentAllQuery(value: boolean) {
            this.Set('IncludeInParentAllQuery', value);
        }
        /**
        * * Field Name: Type
        * * SQL Data Type: nchar(20)
        * * Default Value: One To Many
        * * Value List Type: List
        * * Possible Values 
        *   * One To Many
        *   * Many To Many
        */
        get Type(): 'One To Many' | 'Many To Many' {  
            return this.Get('Type');
        }
        set Type(value: 'One To Many' | 'Many To Many') {
            this.Set('Type', value);
        }
        /**
        * * Field Name: EntityKeyField
        * * Display Name: Entity Key Field
        * * SQL Data Type: nvarchar(255)
        */
        get EntityKeyField(): string | null {  
            return this.Get('EntityKeyField');
        }
        set EntityKeyField(value: string | null) {
            this.Set('EntityKeyField', value);
        }
        /**
        * * Field Name: RelatedEntityJoinField
        * * Display Name: Related Entity Join Field
        * * SQL Data Type: nvarchar(255)
        */
        get RelatedEntityJoinField(): string {  
            return this.Get('RelatedEntityJoinField');
        }
        set RelatedEntityJoinField(value: string) {
            this.Set('RelatedEntityJoinField', value);
        }
        /**
        * * Field Name: JoinView
        * * Display Name: Join View
        * * SQL Data Type: nvarchar(255)
        */
        get JoinView(): string | null {  
            return this.Get('JoinView');
        }
        set JoinView(value: string | null) {
            this.Set('JoinView', value);
        }
        /**
        * * Field Name: JoinEntityJoinField
        * * Display Name: Join Entity Join Field
        * * SQL Data Type: nvarchar(255)
        */
        get JoinEntityJoinField(): string | null {  
            return this.Get('JoinEntityJoinField');
        }
        set JoinEntityJoinField(value: string | null) {
            this.Set('JoinEntityJoinField', value);
        }
        /**
        * * Field Name: JoinEntityInverseJoinField
        * * Display Name: Join Entity Inverse Join Field
        * * SQL Data Type: nvarchar(255)
        */
        get JoinEntityInverseJoinField(): string | null {  
            return this.Get('JoinEntityInverseJoinField');
        }
        set JoinEntityInverseJoinField(value: string | null) {
            this.Set('JoinEntityInverseJoinField', value);
        }
        /**
        * * Field Name: DisplayInForm
        * * Display Name: Display In Form
        * * SQL Data Type: bit
        * * Default Value: 1
        * * Description: When unchecked the relationship will NOT be displayed on the generated form
        */
        get DisplayInForm(): boolean {  
            return this.Get('DisplayInForm');
        }
        set DisplayInForm(value: boolean) {
            this.Set('DisplayInForm', value);
        }
        /**
        * * Field Name: DisplayLocation
        * * Display Name: Display Location
        * * SQL Data Type: nvarchar(50)
        * * Default Value: After Field Tabs
        * * Value List Type: List
        * * Possible Values 
        *   * After Field Tabs
        *   * Before Field Tabs
        */
        get DisplayLocation(): 'After Field Tabs' | 'Before Field Tabs' {  
            return this.Get('DisplayLocation');
        }
        set DisplayLocation(value: 'After Field Tabs' | 'Before Field Tabs') {
            this.Set('DisplayLocation', value);
        }
        /**
        * * Field Name: DisplayName
        * * Display Name: Display Name
        * * SQL Data Type: nvarchar(255)
        * * Description: Optional, when specified this value overrides the related entity name for the label on the tab
        */
        get DisplayName(): string | null {  
            return this.Get('DisplayName');
        }
        set DisplayName(value: string | null) {
            this.Set('DisplayName', value);
        }
        /**
        * * Field Name: DisplayIconType
        * * Display Name: Display Icon Type
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Related Entity Icon
        * * Value List Type: List
        * * Possible Values 
        *   * Related Entity Icon
        *   * Custom
        *   * None
        * * Description: When Related Entity Icon - uses the icon from the related entity, if one exists. When Custom, uses the value in the DisplayIcon field in this record, and when None, no icon is displayed
        */
        get DisplayIconType(): 'Related Entity Icon' | 'Custom' | 'None' {  
            return this.Get('DisplayIconType');
        }
        set DisplayIconType(value: 'Related Entity Icon' | 'Custom' | 'None') {
            this.Set('DisplayIconType', value);
        }
        /**
        * * Field Name: DisplayIcon
        * * Display Name: Display Icon
        * * SQL Data Type: nvarchar(255)
        * * Description: If specified, the icon 
        */
        get DisplayIcon(): string | null {  
            return this.Get('DisplayIcon');
        }
        set DisplayIcon(value: string | null) {
            this.Set('DisplayIcon', value);
        }
        /**
        * * Field Name: DisplayUserViewGUID
        * * Display Name: Display User View GUID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: User Views (vwUserViews.GUID)
        */
        get DisplayUserViewGUID(): string | null {  
            return this.Get('DisplayUserViewGUID');
        }
        
        /**
        * * Field Name: DisplayComponentID
        * * Display Name: Display Component ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Entity Relationship Display Components (vwEntityRelationshipDisplayComponents.ID)
        * * Description: If specified, this component will be used for displaying the relationship within the parent entity's form
        */
        get DisplayComponentID(): number | null {  
            return this.Get('DisplayComponentID');
        }
        set DisplayComponentID(value: number | null) {
            this.Set('DisplayComponentID', value);
        }
        /**
        * * Field Name: DisplayComponentConfiguration
        * * Display Name: Display Component Configuration
        * * SQL Data Type: nvarchar(MAX)
        * * Description: If DisplayComponentID is specified, this field can optionally be used to track component-specific and relationship-specific configuration details that will be used by CodeGen to provide to the display component selected.
        */
        get DisplayComponentConfiguration(): string | null {  
            return this.Get('DisplayComponentConfiguration');
        }
        set DisplayComponentConfiguration(value: string | null) {
            this.Set('DisplayComponentConfiguration', value);
        }
        /**
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()
        */
        get __mj_CreatedAt(): Date {  
            return this.Get('__mj_CreatedAt');
        }
        
        /**
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()
        */
        get __mj_UpdatedAt(): Date {  
            return this.Get('__mj_UpdatedAt');
        }
        
        /**
        * * Field Name: Entity
        * * SQL Data Type: nvarchar(255)
        */
        get Entity(): string {  
            return this.Get('Entity');
        }
        
        /**
        * * Field Name: EntityBaseTable
        * * Display Name: Entity Base Table
        * * SQL Data Type: nvarchar(255)
        */
        get EntityBaseTable(): string {  
            return this.Get('EntityBaseTable');
        }
        
        /**
        * * Field Name: EntityBaseView
        * * Display Name: Entity Base View
        * * SQL Data Type: nvarchar(255)
        */
        get EntityBaseView(): string {  
            return this.Get('EntityBaseView');
        }
        
        /**
        * * Field Name: RelatedEntity
        * * Display Name: Related Entity
        * * SQL Data Type: nvarchar(255)
        */
        get RelatedEntity(): string {  
            return this.Get('RelatedEntity');
        }
        
        /**
        * * Field Name: RelatedEntityBaseTable
        * * Display Name: Related Entity Base Table
        * * SQL Data Type: nvarchar(255)
        */
        get RelatedEntityBaseTable(): string {  
            return this.Get('RelatedEntityBaseTable');
        }
        
        /**
        * * Field Name: RelatedEntityBaseView
        * * Display Name: Related Entity Base View
        * * SQL Data Type: nvarchar(255)
        */
        get RelatedEntityBaseView(): string {  
            return this.Get('RelatedEntityBaseView');
        }
        
        /**
        * * Field Name: RelatedEntityClassName
        * * Display Name: Related Entity Class Name
        * * SQL Data Type: nvarchar(MAX)
        */
        get RelatedEntityClassName(): string | null {  
            return this.Get('RelatedEntityClassName');
        }
        
        /**
        * * Field Name: RelatedEntityCodeName
        * * Display Name: Related Entity Code Name
        * * SQL Data Type: nvarchar(MAX)
        */
        get RelatedEntityCodeName(): string | null {  
            return this.Get('RelatedEntityCodeName');
        }
        
        /**
        * * Field Name: RelatedEntityBaseTableCodeName
        * * Display Name: Related Entity Base Table Code Name
        * * SQL Data Type: nvarchar(MAX)
        */
        get RelatedEntityBaseTableCodeName(): string | null {  
            return this.Get('RelatedEntityBaseTableCodeName');
        }
        
        /**
        * * Field Name: DisplayUserViewName
        * * Display Name: Display User View Name
        * * SQL Data Type: nvarchar(100)
        */
        get DisplayUserViewName(): string | null {  
            return this.Get('DisplayUserViewName');
        }
        
        /**
        * * Field Name: DisplayUserViewID
        * * Display Name: Display User View ID
        * * SQL Data Type: int
        */
        get DisplayUserViewID(): number | null {  
            return this.Get('DisplayUserViewID');
        }
        

    }
        
    /**
     * User Record Logs - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: UserRecordLog
     * * Base View: vwUserRecordLogs
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'User Record Logs')
    export class UserRecordLogEntity extends BaseEntity {
        /**
        * Loads the User Record Logs record from the database
        * @param ID: number - primary key value to load the User Record Logs record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof UserRecordLogEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * User Record Logs - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof UserRecordLogEntity
        * @throws {Error} - Delete is not allowed for User Record Logs, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for User Record Logs, to enable it set AllowDeleteAPI to 1 in the database.');
        } 
            
            /**
        * * Field Name: ID
        * * SQL Data Type: int
        */
        get ID(): number {  
            return this.Get('ID');
        }
        
        /**
        * * Field Name: UserID
        * * Display Name: User ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Users (vwUsers.ID)
        */
        get UserID(): number {  
            return this.Get('UserID');
        }
        set UserID(value: number) {
            this.Set('UserID', value);
        }
        /**
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)
        */
        get EntityID(): number {  
            return this.Get('EntityID');
        }
        set EntityID(value: number) {
            this.Set('EntityID', value);
        }
        /**
        * * Field Name: RecordID
        * * Display Name: Record
        * * SQL Data Type: nvarchar(255)
        */
        get RecordID(): string {  
            return this.Get('RecordID');
        }
        set RecordID(value: string) {
            this.Set('RecordID', value);
        }
        /**
        * * Field Name: EarliestAt
        * * Display Name: Earliest At
        * * SQL Data Type: datetime
        * * Default Value: getdate()
        */
        get EarliestAt(): Date {  
            return this.Get('EarliestAt');
        }
        set EarliestAt(value: Date) {
            this.Set('EarliestAt', value);
        }
        /**
        * * Field Name: LatestAt
        * * Display Name: Latest At
        * * SQL Data Type: datetime
        * * Default Value: getdate()
        */
        get LatestAt(): Date {  
            return this.Get('LatestAt');
        }
        set LatestAt(value: Date) {
            this.Set('LatestAt', value);
        }
        /**
        * * Field Name: TotalCount
        * * Display Name: Total Count
        * * SQL Data Type: int
        * * Default Value: 0
        */
        get TotalCount(): number {  
            return this.Get('TotalCount');
        }
        set TotalCount(value: number) {
            this.Set('TotalCount', value);
        }
        /**
        * * Field Name: Entity
        * * Display Name: Entity
        * * SQL Data Type: nvarchar(255)
        */
        get Entity(): string {  
            return this.Get('Entity');
        }
        
        /**
        * * Field Name: UserName
        * * Display Name: User Name
        * * SQL Data Type: nvarchar(100)
        */
        get UserName(): string {  
            return this.Get('UserName');
        }
        
        /**
        * * Field Name: UserFirstLast
        * * Display Name: User First Last
        * * SQL Data Type: nvarchar(101)
        */
        get UserFirstLast(): string | null {  
            return this.Get('UserFirstLast');
        }
        
        /**
        * * Field Name: UserEmail
        * * Display Name: User Email
        * * SQL Data Type: nvarchar(100)
        */
        get UserEmail(): string {  
            return this.Get('UserEmail');
        }
        
        /**
        * * Field Name: UserSupervisor
        * * Display Name: User Supervisor
        * * SQL Data Type: nvarchar(81)
        */
        get UserSupervisor(): string | null {  
            return this.Get('UserSupervisor');
        }
        
        /**
        * * Field Name: UserSupervisorEmail
        * * Display Name: User Supervisor Email
        * * SQL Data Type: nvarchar(100)
        */
        get UserSupervisorEmail(): string | null {  
            return this.Get('UserSupervisorEmail');
        }
        

    }
        
    /**
     * User Views - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: UserView
     * * Base View: vwUserViews
     * * @description Views are sets of records within a given entity defined by filtering rules. Views can be used programatically to retrieve dynamic sets of data and in user interfaces like MJ Explorer for end-user consumption.
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'User Views')
    export class UserViewEntity extends BaseEntity {
        /**
        * Loads the User Views record from the database
        * @param ID: number - primary key value to load the User Views record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof UserViewEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
        
            /**
        * * Field Name: ID
        * * SQL Data Type: int
        */
        get ID(): number {  
            return this.Get('ID');
        }
        
        /**
        * * Field Name: UserID
        * * Display Name: User ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Users (vwUsers.ID)
        */
        get UserID(): number {  
            return this.Get('UserID');
        }
        set UserID(value: number) {
            this.Set('UserID', value);
        }
        /**
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)
        */
        get EntityID(): number {  
            return this.Get('EntityID');
        }
        set EntityID(value: number) {
            this.Set('EntityID', value);
        }
        /**
        * * Field Name: Name
        * * SQL Data Type: nvarchar(100)
        */
        get Name(): string {  
            return this.Get('Name');
        }
        set Name(value: string) {
            this.Set('Name', value);
        }
        /**
        * * Field Name: GUID
        * * Display Name: GUID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newid()
        */
        get GUID(): string {  
            return this.Get('GUID');
        }
        
        /**
        * * Field Name: Description
        * * SQL Data Type: nvarchar(MAX)
        */
        get Description(): string | null {  
            return this.Get('Description');
        }
        set Description(value: string | null) {
            this.Set('Description', value);
        }
        /**
        * * Field Name: CategoryID
        * * Display Name: Category ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: User View Categories (vwUserViewCategories.ID)
        */
        get CategoryID(): number | null {  
            return this.Get('CategoryID');
        }
        set CategoryID(value: number | null) {
            this.Set('CategoryID', value);
        }
        /**
        * * Field Name: IsShared
        * * Display Name: Is Shared
        * * SQL Data Type: bit
        * * Default Value: 0
        */
        get IsShared(): boolean {  
            return this.Get('IsShared');
        }
        set IsShared(value: boolean) {
            this.Set('IsShared', value);
        }
        /**
        * * Field Name: IsDefault
        * * Display Name: Is Default
        * * SQL Data Type: bit
        * * Default Value: 0
        */
        get IsDefault(): boolean {  
            return this.Get('IsDefault');
        }
        set IsDefault(value: boolean) {
            this.Set('IsDefault', value);
        }
        /**
        * * Field Name: GridState
        * * Display Name: Grid State
        * * SQL Data Type: nvarchar(MAX)
        */
        get GridState(): string | null {  
            return this.Get('GridState');
        }
        set GridState(value: string | null) {
            this.Set('GridState', value);
        }
        /**
        * * Field Name: FilterState
        * * Display Name: Filter State
        * * SQL Data Type: nvarchar(MAX)
        */
        get FilterState(): string | null {  
            return this.Get('FilterState');
        }
        set FilterState(value: string | null) {
            this.Set('FilterState', value);
        }
        /**
        * * Field Name: CustomFilterState
        * * Display Name: Custom Filter State
        * * SQL Data Type: bit
        * * Default Value: 0
        */
        get CustomFilterState(): boolean {  
            return this.Get('CustomFilterState');
        }
        set CustomFilterState(value: boolean) {
            this.Set('CustomFilterState', value);
        }
        /**
        * * Field Name: SmartFilterEnabled
        * * Display Name: Smart Filter Enabled
        * * SQL Data Type: bit
        * * Default Value: 0
        */
        get SmartFilterEnabled(): boolean {  
            return this.Get('SmartFilterEnabled');
        }
        set SmartFilterEnabled(value: boolean) {
            this.Set('SmartFilterEnabled', value);
        }
        /**
        * * Field Name: SmartFilterPrompt
        * * Display Name: Smart Filter Prompt
        * * SQL Data Type: nvarchar(MAX)
        */
        get SmartFilterPrompt(): string | null {  
            return this.Get('SmartFilterPrompt');
        }
        set SmartFilterPrompt(value: string | null) {
            this.Set('SmartFilterPrompt', value);
        }
        /**
        * * Field Name: SmartFilterWhereClause
        * * Display Name: Smart Filter Where Clause
        * * SQL Data Type: nvarchar(MAX)
        */
        get SmartFilterWhereClause(): string | null {  
            return this.Get('SmartFilterWhereClause');
        }
        set SmartFilterWhereClause(value: string | null) {
            this.Set('SmartFilterWhereClause', value);
        }
        /**
        * * Field Name: SmartFilterExplanation
        * * Display Name: Smart Filter Explanation
        * * SQL Data Type: nvarchar(MAX)
        */
        get SmartFilterExplanation(): string | null {  
            return this.Get('SmartFilterExplanation');
        }
        set SmartFilterExplanation(value: string | null) {
            this.Set('SmartFilterExplanation', value);
        }
        /**
        * * Field Name: WhereClause
        * * Display Name: Where Clause
        * * SQL Data Type: nvarchar(MAX)
        */
        get WhereClause(): string | null {  
            return this.Get('WhereClause');
        }
        set WhereClause(value: string | null) {
            this.Set('WhereClause', value);
        }
        /**
        * * Field Name: CustomWhereClause
        * * Display Name: Custom Where Clause
        * * SQL Data Type: bit
        * * Default Value: 0
        */
        get CustomWhereClause(): boolean {  
            return this.Get('CustomWhereClause');
        }
        set CustomWhereClause(value: boolean) {
            this.Set('CustomWhereClause', value);
        }
        /**
        * * Field Name: SortState
        * * Display Name: Sort State
        * * SQL Data Type: nvarchar(MAX)
        */
        get SortState(): string | null {  
            return this.Get('SortState');
        }
        set SortState(value: string | null) {
            this.Set('SortState', value);
        }
        /**
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_CreatedAt(): Date {  
            return this.Get('__mj_CreatedAt');
        }
        
        /**
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_UpdatedAt(): Date {  
            return this.Get('__mj_UpdatedAt');
        }
        
        /**
        * * Field Name: UserName
        * * Display Name: User Name
        * * SQL Data Type: nvarchar(100)
        * * Default Value: getutcdate()
        */
        get UserName(): string {  
            return this.Get('UserName');
        }
        
        /**
        * * Field Name: UserFirstLast
        * * Display Name: User First Last
        * * SQL Data Type: nvarchar(101)
        * * Default Value: getutcdate()
        */
        get UserFirstLast(): string | null {  
            return this.Get('UserFirstLast');
        }
        
        /**
        * * Field Name: UserEmail
        * * Display Name: User Email
        * * SQL Data Type: nvarchar(100)
        */
        get UserEmail(): string {  
            return this.Get('UserEmail');
        }
        
        /**
        * * Field Name: UserType
        * * Display Name: User Type
        * * SQL Data Type: nchar(15)
        */
        get UserType(): string {  
            return this.Get('UserType');
        }
        
        /**
        * * Field Name: Entity
        * * Display Name: Entity
        * * SQL Data Type: nvarchar(255)
        */
        get Entity(): string {  
            return this.Get('Entity');
        }
        
        /**
        * * Field Name: EntityBaseView
        * * Display Name: Entity Base View
        * * SQL Data Type: nvarchar(255)
        */
        get EntityBaseView(): string {  
            return this.Get('EntityBaseView');
        }
        

    }
        
    /**
     * Company Integration Runs - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: CompanyIntegrationRun
     * * Base View: vwCompanyIntegrationRuns
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Company Integration Runs')
    export class CompanyIntegrationRunEntity extends BaseEntity {
        /**
        * Loads the Company Integration Runs record from the database
        * @param ID: number - primary key value to load the Company Integration Runs record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof CompanyIntegrationRunEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Company Integration Runs - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof CompanyIntegrationRunEntity
        * @throws {Error} - Delete is not allowed for Company Integration Runs, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Company Integration Runs, to enable it set AllowDeleteAPI to 1 in the database.');
        } 
            
            /**
        * * Field Name: ID
        * * SQL Data Type: int
        */
        get ID(): number {  
            return this.Get('ID');
        }
        
        /**
        * * Field Name: CompanyIntegrationID
        * * Display Name: CompanyIntegration ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Company Integrations (vwCompanyIntegrations.ID)
        */
        get CompanyIntegrationID(): number {  
            return this.Get('CompanyIntegrationID');
        }
        set CompanyIntegrationID(value: number) {
            this.Set('CompanyIntegrationID', value);
        }
        /**
        * * Field Name: RunByUserID
        * * Display Name: RunByUser ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Users (vwUsers.ID)
        */
        get RunByUserID(): number {  
            return this.Get('RunByUserID');
        }
        set RunByUserID(value: number) {
            this.Set('RunByUserID', value);
        }
        /**
        * * Field Name: StartedAt
        * * Display Name: Started At
        * * SQL Data Type: datetime
        */
        get StartedAt(): Date | null {  
            return this.Get('StartedAt');
        }
        set StartedAt(value: Date | null) {
            this.Set('StartedAt', value);
        }
        /**
        * * Field Name: EndedAt
        * * Display Name: Ended At
        * * SQL Data Type: datetime
        */
        get EndedAt(): Date | null {  
            return this.Get('EndedAt');
        }
        set EndedAt(value: Date | null) {
            this.Set('EndedAt', value);
        }
        /**
        * * Field Name: TotalRecords
        * * Display Name: Total Records
        * * SQL Data Type: int
        */
        get TotalRecords(): number {  
            return this.Get('TotalRecords');
        }
        set TotalRecords(value: number) {
            this.Set('TotalRecords', value);
        }
        /**
        * * Field Name: Comments
        * * SQL Data Type: nvarchar(MAX)
        */
        get Comments(): string | null {  
            return this.Get('Comments');
        }
        set Comments(value: string | null) {
            this.Set('Comments', value);
        }
        /**
        * * Field Name: RunByUser
        * * Display Name: Run By User
        * * SQL Data Type: nvarchar(100)
        */
        get RunByUser(): string {  
            return this.Get('RunByUser');
        }
        

    }
        
    /**
     * Company Integration Run Details - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: CompanyIntegrationRunDetail
     * * Base View: vwCompanyIntegrationRunDetails
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Company Integration Run Details')
    export class CompanyIntegrationRunDetailEntity extends BaseEntity {
        /**
        * Loads the Company Integration Run Details record from the database
        * @param ID: number - primary key value to load the Company Integration Run Details record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof CompanyIntegrationRunDetailEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Company Integration Run Details - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof CompanyIntegrationRunDetailEntity
        * @throws {Error} - Delete is not allowed for Company Integration Run Details, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Company Integration Run Details, to enable it set AllowDeleteAPI to 1 in the database.');
        } 
            
            /**
        * * Field Name: ID
        * * SQL Data Type: int
        */
        get ID(): number {  
            return this.Get('ID');
        }
        
        /**
        * * Field Name: CompanyIntegrationRunID
        * * Display Name: CompanyIntegrationRun ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Company Integration Runs (vwCompanyIntegrationRuns.ID)
        */
        get CompanyIntegrationRunID(): number {  
            return this.Get('CompanyIntegrationRunID');
        }
        set CompanyIntegrationRunID(value: number) {
            this.Set('CompanyIntegrationRunID', value);
        }
        /**
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)
        */
        get EntityID(): number {  
            return this.Get('EntityID');
        }
        set EntityID(value: number) {
            this.Set('EntityID', value);
        }
        /**
        * * Field Name: RecordID
        * * Display Name: Record
        * * SQL Data Type: nvarchar(255)
        */
        get RecordID(): string {  
            return this.Get('RecordID');
        }
        set RecordID(value: string) {
            this.Set('RecordID', value);
        }
        /**
        * * Field Name: Action
        * * SQL Data Type: nchar(20)
        */
        get Action(): string {  
            return this.Get('Action');
        }
        set Action(value: string) {
            this.Set('Action', value);
        }
        /**
        * * Field Name: ExecutedAt
        * * Display Name: Executed At
        * * SQL Data Type: datetime
        * * Default Value: getdate()
        */
        get ExecutedAt(): Date {  
            return this.Get('ExecutedAt');
        }
        set ExecutedAt(value: Date) {
            this.Set('ExecutedAt', value);
        }
        /**
        * * Field Name: IsSuccess
        * * Display Name: Is Success
        * * SQL Data Type: bit
        * * Default Value: 0
        */
        get IsSuccess(): boolean {  
            return this.Get('IsSuccess');
        }
        set IsSuccess(value: boolean) {
            this.Set('IsSuccess', value);
        }
        /**
        * * Field Name: Entity
        * * SQL Data Type: nvarchar(255)
        */
        get Entity(): string {  
            return this.Get('Entity');
        }
        
        /**
        * * Field Name: RunStartedAt
        * * Display Name: Run Started At
        * * SQL Data Type: datetime
        */
        get RunStartedAt(): Date | null {  
            return this.Get('RunStartedAt');
        }
        
        /**
        * * Field Name: RunEndedAt
        * * Display Name: Run Ended At
        * * SQL Data Type: datetime
        */
        get RunEndedAt(): Date | null {  
            return this.Get('RunEndedAt');
        }
        

    }
        
    /**
     * Error Logs - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: ErrorLog
     * * Base View: vwErrorLogs
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Error Logs')
    export class ErrorLogEntity extends BaseEntity {
        /**
        * Loads the Error Logs record from the database
        * @param ID: number - primary key value to load the Error Logs record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof ErrorLogEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Error Logs - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof ErrorLogEntity
        * @throws {Error} - Delete is not allowed for Error Logs, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Error Logs, to enable it set AllowDeleteAPI to 1 in the database.');
        } 
            
            /**
        * * Field Name: ID
        * * SQL Data Type: int
        */
        get ID(): number {  
            return this.Get('ID');
        }
        
        /**
        * * Field Name: CompanyIntegrationRunID
        * * Display Name: CompanyIntegrationRun ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Company Integration Runs (vwCompanyIntegrationRuns.ID)
        */
        get CompanyIntegrationRunID(): number | null {  
            return this.Get('CompanyIntegrationRunID');
        }
        set CompanyIntegrationRunID(value: number | null) {
            this.Set('CompanyIntegrationRunID', value);
        }
        /**
        * * Field Name: CompanyIntegrationRunDetailID
        * * Display Name: CompanyIntegrationRunDetail ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Company Integration Run Details (vwCompanyIntegrationRunDetails.ID)
        */
        get CompanyIntegrationRunDetailID(): number | null {  
            return this.Get('CompanyIntegrationRunDetailID');
        }
        set CompanyIntegrationRunDetailID(value: number | null) {
            this.Set('CompanyIntegrationRunDetailID', value);
        }
        /**
        * * Field Name: Code
        * * SQL Data Type: nchar(20)
        */
        get Code(): string | null {  
            return this.Get('Code');
        }
        set Code(value: string | null) {
            this.Set('Code', value);
        }
        /**
        * * Field Name: Message
        * * SQL Data Type: nvarchar(MAX)
        */
        get Message(): string | null {  
            return this.Get('Message');
        }
        set Message(value: string | null) {
            this.Set('Message', value);
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
        * * Field Name: CreatedBy
        * * Display Name: Created By
        * * SQL Data Type: nvarchar(50)
        * * Default Value: suser_name()
        */
        get CreatedBy(): string | null {  
            return this.Get('CreatedBy');
        }
        set CreatedBy(value: string | null) {
            this.Set('CreatedBy', value);
        }
        /**
        * * Field Name: Status
        * * SQL Data Type: nvarchar(10)
        */
        get Status(): string | null {  
            return this.Get('Status');
        }
        set Status(value: string | null) {
            this.Set('Status', value);
        }
        /**
        * * Field Name: Category
        * * SQL Data Type: nvarchar(20)
        */
        get Category(): string | null {  
            return this.Get('Category');
        }
        set Category(value: string | null) {
            this.Set('Category', value);
        }
        /**
        * * Field Name: Details
        * * SQL Data Type: nvarchar(MAX)
        */
        get Details(): string | null {  
            return this.Get('Details');
        }
        set Details(value: string | null) {
            this.Set('Details', value);
        }

    }
        
    /**
     * Applications - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: Application
     * * Base View: vwApplications
     * * @description Applications are used to group entities in the user interface for ease of user access
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Applications')
    export class ApplicationEntity extends BaseEntity {
        /**
        * Loads the Applications record from the database
        * @param ID: number - primary key value to load the Applications record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof ApplicationEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
        
            /**
        * * Field Name: ID
        * * SQL Data Type: int
        */
        get ID(): number {  
            return this.Get('ID');
        }
        
        /**
        * * Field Name: Name
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
        * * SQL Data Type: nvarchar(MAX)
        */
        get Description(): string | null {  
            return this.Get('Description');
        }
        set Description(value: string | null) {
            this.Set('Description', value);
        }
        /**
        * * Field Name: Icon
        * * Display Name: Icon
        * * SQL Data Type: nvarchar(500)
        * * Description: Specify the CSS class information for the display icon for each application.
        */
        get Icon(): string | null {  
            return this.Get('Icon');
        }
        set Icon(value: string | null) {
            this.Set('Icon', value);
        }
        /**
        * * Field Name: DefaultForNewUser
        * * Display Name: Default For New User
        * * SQL Data Type: bit
        * * Default Value: 1
        * * Description: If turned on, when a new user first uses the MJ Explorer app, the application records with this turned on will have this application included in their selected application list.
        */
        get DefaultForNewUser(): boolean {  
            return this.Get('DefaultForNewUser');
        }
        set DefaultForNewUser(value: boolean) {
            this.Set('DefaultForNewUser', value);
        }
        /**
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_CreatedAt(): Date {  
            return this.Get('__mj_CreatedAt');
        }
        
        /**
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_UpdatedAt(): Date {  
            return this.Get('__mj_UpdatedAt');
        }
        

    }
        
    /**
     * Application Entities - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: ApplicationEntity
     * * Base View: vwApplicationEntities
     * * @description List of entities within each application. An application can have any number of entities and an entity can be part of any number of applications.
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Application Entities')
    export class ApplicationEntityEntity extends BaseEntity {
        /**
        * Loads the Application Entities record from the database
        * @param ID: number - primary key value to load the Application Entities record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof ApplicationEntityEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
        
            /**
        * * Field Name: ID
        * * SQL Data Type: int
        */
        get ID(): number {  
            return this.Get('ID');
        }
        
        /**
        * * Field Name: ApplicationName
        * * Display Name: Application Name
        * * SQL Data Type: nvarchar(50)
        * * Related Entity/Foreign Key: Applications (vwApplications.Name)
        */
        get ApplicationName(): string | null {  
            return this.Get('ApplicationName');
        }
        set ApplicationName(value: string | null) {
            this.Set('ApplicationName', value);
        }
        /**
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)
        */
        get EntityID(): number {  
            return this.Get('EntityID');
        }
        set EntityID(value: number) {
            this.Set('EntityID', value);
        }
        /**
        * * Field Name: Sequence
        * * SQL Data Type: int
        */
        get Sequence(): number {  
            return this.Get('Sequence');
        }
        set Sequence(value: number) {
            this.Set('Sequence', value);
        }
        /**
        * * Field Name: DefaultForNewUser
        * * Display Name: Default For New User
        * * SQL Data Type: bit
        * * Default Value: 1
        * * Description: When set to 1, the entity will be included by default for a new user when they first access the application in question
        */
        get DefaultForNewUser(): boolean {  
            return this.Get('DefaultForNewUser');
        }
        set DefaultForNewUser(value: boolean) {
            this.Set('DefaultForNewUser', value);
        }
        /**
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_CreatedAt(): Date {  
            return this.Get('__mj_CreatedAt');
        }
        
        /**
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_UpdatedAt(): Date {  
            return this.Get('__mj_UpdatedAt');
        }
        
        /**
        * * Field Name: Application
        * * SQL Data Type: nvarchar(50)
        * * Default Value: getutcdate()
        */
        get Application(): string {  
            return this.Get('Application');
        }
        
        /**
        * * Field Name: Entity
        * * SQL Data Type: nvarchar(255)
        * * Default Value: getutcdate()
        */
        get Entity(): string {  
            return this.Get('Entity');
        }
        
        /**
        * * Field Name: EntityBaseTable
        * * Display Name: Entity Base Table
        * * SQL Data Type: nvarchar(255)
        */
        get EntityBaseTable(): string {  
            return this.Get('EntityBaseTable');
        }
        
        /**
        * * Field Name: EntityCodeName
        * * Display Name: Entity Code Name
        * * SQL Data Type: nvarchar(MAX)
        */
        get EntityCodeName(): string | null {  
            return this.Get('EntityCodeName');
        }
        
        /**
        * * Field Name: EntityClassName
        * * Display Name: Entity Class Name
        * * SQL Data Type: nvarchar(MAX)
        */
        get EntityClassName(): string | null {  
            return this.Get('EntityClassName');
        }
        
        /**
        * * Field Name: EntityBaseTableCodeName
        * * Display Name: Entity Base Table Code Name
        * * SQL Data Type: nvarchar(MAX)
        */
        get EntityBaseTableCodeName(): string | null {  
            return this.Get('EntityBaseTableCodeName');
        }
        

    }
        
    /**
     * Entity Permissions - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: EntityPermission
     * * Base View: vwEntityPermissions
     * * @description Security settings for each entity
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Entity Permissions')
    export class EntityPermissionEntity extends BaseEntity {
        /**
        * Loads the Entity Permissions record from the database
        * @param ID: number - primary key value to load the Entity Permissions record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof EntityPermissionEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
        
            /**
        * * Field Name: ID
        * * SQL Data Type: int
        */
        get ID(): number {  
            return this.Get('ID');
        }
        
        /**
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)
        */
        get EntityID(): number {  
            return this.Get('EntityID');
        }
        set EntityID(value: number) {
            this.Set('EntityID', value);
        }
        /**
        * * Field Name: RoleName
        * * Display Name: Role Name
        * * SQL Data Type: nvarchar(50)
        * * Related Entity/Foreign Key: Roles (vwRoles.Name)
        */
        get RoleName(): string | null {  
            return this.Get('RoleName');
        }
        set RoleName(value: string | null) {
            this.Set('RoleName', value);
        }
        /**
        * * Field Name: CanCreate
        * * Display Name: Can Create
        * * SQL Data Type: bit
        * * Default Value: 0
        */
        get CanCreate(): boolean {  
            return this.Get('CanCreate');
        }
        set CanCreate(value: boolean) {
            this.Set('CanCreate', value);
        }
        /**
        * * Field Name: CanRead
        * * Display Name: Can Read
        * * SQL Data Type: bit
        * * Default Value: 0
        */
        get CanRead(): boolean {  
            return this.Get('CanRead');
        }
        set CanRead(value: boolean) {
            this.Set('CanRead', value);
        }
        /**
        * * Field Name: CanUpdate
        * * Display Name: Can Update
        * * SQL Data Type: bit
        * * Default Value: 0
        */
        get CanUpdate(): boolean {  
            return this.Get('CanUpdate');
        }
        set CanUpdate(value: boolean) {
            this.Set('CanUpdate', value);
        }
        /**
        * * Field Name: CanDelete
        * * Display Name: Can Delete
        * * SQL Data Type: bit
        * * Default Value: 0
        */
        get CanDelete(): boolean {  
            return this.Get('CanDelete');
        }
        set CanDelete(value: boolean) {
            this.Set('CanDelete', value);
        }
        /**
        * * Field Name: ReadRLSFilterID
        * * Display Name: Read RLSFilter ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Row Level Security Filters (vwRowLevelSecurityFilters.ID)
        */
        get ReadRLSFilterID(): number | null {  
            return this.Get('ReadRLSFilterID');
        }
        set ReadRLSFilterID(value: number | null) {
            this.Set('ReadRLSFilterID', value);
        }
        /**
        * * Field Name: CreateRLSFilterID
        * * Display Name: Create RLSFilter ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Row Level Security Filters (vwRowLevelSecurityFilters.ID)
        */
        get CreateRLSFilterID(): number | null {  
            return this.Get('CreateRLSFilterID');
        }
        set CreateRLSFilterID(value: number | null) {
            this.Set('CreateRLSFilterID', value);
        }
        /**
        * * Field Name: UpdateRLSFilterID
        * * Display Name: Update RLSFilter ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Row Level Security Filters (vwRowLevelSecurityFilters.ID)
        */
        get UpdateRLSFilterID(): number | null {  
            return this.Get('UpdateRLSFilterID');
        }
        set UpdateRLSFilterID(value: number | null) {
            this.Set('UpdateRLSFilterID', value);
        }
        /**
        * * Field Name: DeleteRLSFilterID
        * * Display Name: Delete RLSFilter ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Row Level Security Filters (vwRowLevelSecurityFilters.ID)
        */
        get DeleteRLSFilterID(): number | null {  
            return this.Get('DeleteRLSFilterID');
        }
        set DeleteRLSFilterID(value: number | null) {
            this.Set('DeleteRLSFilterID', value);
        }
        /**
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_CreatedAt(): Date {  
            return this.Get('__mj_CreatedAt');
        }
        
        /**
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_UpdatedAt(): Date {  
            return this.Get('__mj_UpdatedAt');
        }
        
        /**
        * * Field Name: Entity
        * * Display Name: Entity
        * * SQL Data Type: nvarchar(255)
        * * Default Value: getutcdate()
        */
        get Entity(): string {  
            return this.Get('Entity');
        }
        
        /**
        * * Field Name: RoleSQLName
        * * Display Name: Role SQLName
        * * SQL Data Type: nvarchar(250)
        * * Default Value: getutcdate()
        */
        get RoleSQLName(): string | null {  
            return this.Get('RoleSQLName');
        }
        
        /**
        * * Field Name: CreateRLSFilter
        * * Display Name: Create RLSFilter
        * * SQL Data Type: nvarchar(100)
        */
        get CreateRLSFilter(): string | null {  
            return this.Get('CreateRLSFilter');
        }
        
        /**
        * * Field Name: ReadRLSFilter
        * * Display Name: Read RLSFilter
        * * SQL Data Type: nvarchar(100)
        */
        get ReadRLSFilter(): string | null {  
            return this.Get('ReadRLSFilter');
        }
        
        /**
        * * Field Name: UpdateRLSFilter
        * * Display Name: Update RLSFilter
        * * SQL Data Type: nvarchar(100)
        */
        get UpdateRLSFilter(): string | null {  
            return this.Get('UpdateRLSFilter');
        }
        
        /**
        * * Field Name: DeleteRLSFilter
        * * Display Name: Delete RLSFilter
        * * SQL Data Type: nvarchar(100)
        */
        get DeleteRLSFilter(): string | null {  
            return this.Get('DeleteRLSFilter');
        }
        

    }
        
    /**
     * User Application Entities - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: UserApplicationEntity
     * * Base View: vwUserApplicationEntities
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'User Application Entities')
    export class UserApplicationEntityEntity extends BaseEntity {
        /**
        * Loads the User Application Entities record from the database
        * @param ID: number - primary key value to load the User Application Entities record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof UserApplicationEntityEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
        
            /**
        * * Field Name: ID
        * * SQL Data Type: int
        */
        get ID(): number {  
            return this.Get('ID');
        }
        
        /**
        * * Field Name: UserApplicationID
        * * Display Name: UserApplication ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: User Applications (vwUserApplications.ID)
        */
        get UserApplicationID(): number {  
            return this.Get('UserApplicationID');
        }
        set UserApplicationID(value: number) {
            this.Set('UserApplicationID', value);
        }
        /**
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)
        */
        get EntityID(): number {  
            return this.Get('EntityID');
        }
        set EntityID(value: number) {
            this.Set('EntityID', value);
        }
        /**
        * * Field Name: Sequence
        * * SQL Data Type: int
        * * Default Value: 0
        */
        get Sequence(): number {  
            return this.Get('Sequence');
        }
        set Sequence(value: number) {
            this.Set('Sequence', value);
        }
        /**
        * * Field Name: Application
        * * Display Name: Application
        * * SQL Data Type: nvarchar(50)
        */
        get Application(): string {  
            return this.Get('Application');
        }
        
        /**
        * * Field Name: User
        * * Display Name: User
        * * SQL Data Type: nvarchar(100)
        */
        get User(): string {  
            return this.Get('User');
        }
        
        /**
        * * Field Name: Entity
        * * Display Name: Entity
        * * SQL Data Type: nvarchar(255)
        */
        get Entity(): string {  
            return this.Get('Entity');
        }
        

    }
        
    /**
     * User Applications - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: UserApplication
     * * Base View: vwUserApplications
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'User Applications')
    export class UserApplicationEntity extends BaseEntity {
        /**
        * Loads the User Applications record from the database
        * @param ID: number - primary key value to load the User Applications record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof UserApplicationEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
        
            /**
        * * Field Name: ID
        * * SQL Data Type: int
        */
        get ID(): number {  
            return this.Get('ID');
        }
        
        /**
        * * Field Name: UserID
        * * Display Name: User ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Users (vwUsers.ID)
        */
        get UserID(): number {  
            return this.Get('UserID');
        }
        set UserID(value: number) {
            this.Set('UserID', value);
        }
        /**
        * * Field Name: ApplicationID
        * * Display Name: Application ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Applications (vwApplications.ID)
        */
        get ApplicationID(): number {  
            return this.Get('ApplicationID');
        }
        set ApplicationID(value: number) {
            this.Set('ApplicationID', value);
        }
        /**
        * * Field Name: Sequence
        * * SQL Data Type: int
        * * Default Value: 0
        */
        get Sequence(): number {  
            return this.Get('Sequence');
        }
        set Sequence(value: number) {
            this.Set('Sequence', value);
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
        * * Field Name: User
        * * Display Name: User
        * * SQL Data Type: nvarchar(100)
        */
        get User(): string {  
            return this.Get('User');
        }
        
        /**
        * * Field Name: Application
        * * Display Name: Application
        * * SQL Data Type: nvarchar(50)
        */
        get Application(): string {  
            return this.Get('Application');
        }
        

    }
        
    /**
     * Company Integration Run API Logs - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: CompanyIntegrationRunAPILog
     * * Base View: vwCompanyIntegrationRunAPILogs
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Company Integration Run API Logs')
    export class CompanyIntegrationRunAPILogEntity extends BaseEntity {
        /**
        * Loads the Company Integration Run API Logs record from the database
        * @param ID: number - primary key value to load the Company Integration Run API Logs record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof CompanyIntegrationRunAPILogEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Company Integration Run API Logs - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof CompanyIntegrationRunAPILogEntity
        * @throws {Error} - Delete is not allowed for Company Integration Run API Logs, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Company Integration Run API Logs, to enable it set AllowDeleteAPI to 1 in the database.');
        } 
            
            /**
        * * Field Name: ID
        * * SQL Data Type: int
        */
        get ID(): number {  
            return this.Get('ID');
        }
        
        /**
        * * Field Name: CompanyIntegrationRunID
        * * Display Name: Company Integration Run ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Company Integration Runs (vwCompanyIntegrationRuns.ID)
        */
        get CompanyIntegrationRunID(): number {  
            return this.Get('CompanyIntegrationRunID');
        }
        set CompanyIntegrationRunID(value: number) {
            this.Set('CompanyIntegrationRunID', value);
        }
        /**
        * * Field Name: ExecutedAt
        * * Display Name: Executed At
        * * SQL Data Type: datetime
        * * Default Value: getdate()
        */
        get ExecutedAt(): Date {  
            return this.Get('ExecutedAt');
        }
        set ExecutedAt(value: Date) {
            this.Set('ExecutedAt', value);
        }
        /**
        * * Field Name: IsSuccess
        * * Display Name: Is Success
        * * SQL Data Type: bit
        * * Default Value: 0
        */
        get IsSuccess(): boolean {  
            return this.Get('IsSuccess');
        }
        set IsSuccess(value: boolean) {
            this.Set('IsSuccess', value);
        }
        /**
        * * Field Name: RequestMethod
        * * Display Name: Request Method
        * * SQL Data Type: nvarchar(12)
        * * Value List Type: List
        * * Possible Values 
        *   * GET
        *   * POST
        *   * PUT
        *   * DELETE
        *   * PATCH
        *   * HEAD
        *   * OPTIONS
        */
        get RequestMethod(): 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS' | null {  
            return this.Get('RequestMethod');
        }
        set RequestMethod(value: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS' | null) {
            this.Set('RequestMethod', value);
        }
        /**
        * * Field Name: URL
        * * SQL Data Type: nvarchar(MAX)
        */
        get URL(): string | null {  
            return this.Get('URL');
        }
        set URL(value: string | null) {
            this.Set('URL', value);
        }
        /**
        * * Field Name: Parameters
        * * SQL Data Type: nvarchar(MAX)
        */
        get Parameters(): string | null {  
            return this.Get('Parameters');
        }
        set Parameters(value: string | null) {
            this.Set('Parameters', value);
        }

    }
        
    /**
     * Lists - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: List
     * * Base View: vwLists
     * * @description Static lists are useful for controlling a set of data for a given entity. These can be used programatically for applications like logging and tracking long-running tasks and also by end users for tracking any particular list of records they want to directly control the set.
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Lists')
    export class ListEntity extends BaseEntity {
        /**
        * Loads the Lists record from the database
        * @param ID: number - primary key value to load the Lists record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof ListEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
        
            /**
        * * Field Name: ID
        * * SQL Data Type: int
        */
        get ID(): number {  
            return this.Get('ID');
        }
        
        /**
        * * Field Name: Name
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
        * * SQL Data Type: nvarchar(MAX)
        */
        get Description(): string | null {  
            return this.Get('Description');
        }
        set Description(value: string | null) {
            this.Set('Description', value);
        }
        /**
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)
        */
        get EntityID(): number {  
            return this.Get('EntityID');
        }
        set EntityID(value: number) {
            this.Set('EntityID', value);
        }
        /**
        * * Field Name: UserID
        * * Display Name: User ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Users (vwUsers.ID)
        */
        get UserID(): number {  
            return this.Get('UserID');
        }
        set UserID(value: number) {
            this.Set('UserID', value);
        }
        /**
        * * Field Name: ExternalSystemRecordID
        * * Display Name: External System Record ID
        * * SQL Data Type: nvarchar(100)
        */
        get ExternalSystemRecordID(): string | null {  
            return this.Get('ExternalSystemRecordID');
        }
        set ExternalSystemRecordID(value: string | null) {
            this.Set('ExternalSystemRecordID', value);
        }
        /**
        * * Field Name: CompanyIntegrationID
        * * Display Name: Company Integration ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Company Integrations (vwCompanyIntegrations.ID)
        */
        get CompanyIntegrationID(): number | null {  
            return this.Get('CompanyIntegrationID');
        }
        set CompanyIntegrationID(value: number | null) {
            this.Set('CompanyIntegrationID', value);
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
        * * Field Name: CategoryID
        * * Display Name: Category ID
        * * SQL Data Type: int
        */
        get CategoryID(): number | null {  
            return this.Get('CategoryID');
        }
        set CategoryID(value: number | null) {
            this.Set('CategoryID', value);
        }
        /**
        * * Field Name: Entity
        * * Display Name: Entity
        * * SQL Data Type: nvarchar(255)
        */
        get Entity(): string {  
            return this.Get('Entity');
        }
        
        /**
        * * Field Name: User
        * * Display Name: User
        * * SQL Data Type: nvarchar(100)
        */
        get User(): string {  
            return this.Get('User');
        }
        

    }
        
    /**
     * List Details - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: ListDetail
     * * Base View: vwListDetails
     * * @description Tracks the records within each list.
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'List Details')
    export class ListDetailEntity extends BaseEntity {
        /**
        * Loads the List Details record from the database
        * @param ID: number - primary key value to load the List Details record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof ListDetailEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
        
            /**
        * * Field Name: ID
        * * SQL Data Type: int
        */
        get ID(): number {  
            return this.Get('ID');
        }
        
        /**
        * * Field Name: ListID
        * * Display Name: List ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Lists (vwLists.ID)
        */
        get ListID(): number {  
            return this.Get('ListID');
        }
        set ListID(value: number) {
            this.Set('ListID', value);
        }
        /**
        * * Field Name: RecordID
        * * Display Name: Record
        * * SQL Data Type: nvarchar(255)
        */
        get RecordID(): string {  
            return this.Get('RecordID');
        }
        set RecordID(value: string) {
            this.Set('RecordID', value);
        }
        /**
        * * Field Name: Sequence
        * * SQL Data Type: int
        * * Default Value: 0
        */
        get Sequence(): number {  
            return this.Get('Sequence');
        }
        set Sequence(value: number) {
            this.Set('Sequence', value);
        }
        /**
        * * Field Name: List
        * * Display Name: List
        * * SQL Data Type: nvarchar(100)
        */
        get List(): string {  
            return this.Get('List');
        }
        

    }
        
    /**
     * User View Runs - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: UserViewRun
     * * Base View: vwUserViewRuns
     * * @description User Views can be logged when run to capture the date and user that ran the view as well as the output results.
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'User View Runs')
    export class UserViewRunEntity extends BaseEntity {
        /**
        * Loads the User View Runs record from the database
        * @param ID: number - primary key value to load the User View Runs record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof UserViewRunEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * User View Runs - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof UserViewRunEntity
        * @throws {Error} - Delete is not allowed for User View Runs, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for User View Runs, to enable it set AllowDeleteAPI to 1 in the database.');
        } 
            
            /**
        * * Field Name: ID
        * * SQL Data Type: int
        */
        get ID(): number {  
            return this.Get('ID');
        }
        
        /**
        * * Field Name: UserViewID
        * * Display Name: User View ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: User Views (vwUserViews.ID)
        */
        get UserViewID(): number {  
            return this.Get('UserViewID');
        }
        set UserViewID(value: number) {
            this.Set('UserViewID', value);
        }
        /**
        * * Field Name: RunAt
        * * Display Name: Run At
        * * SQL Data Type: datetime
        */
        get RunAt(): Date {  
            return this.Get('RunAt');
        }
        set RunAt(value: Date) {
            this.Set('RunAt', value);
        }
        /**
        * * Field Name: RunByUserID
        * * Display Name: Run By User ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Users (vwUsers.ID)
        */
        get RunByUserID(): number {  
            return this.Get('RunByUserID');
        }
        set RunByUserID(value: number) {
            this.Set('RunByUserID', value);
        }
        /**
        * * Field Name: UserView
        * * Display Name: User View
        * * SQL Data Type: nvarchar(100)
        */
        get UserView(): string {  
            return this.Get('UserView');
        }
        
        /**
        * * Field Name: RunByUser
        * * Display Name: Run By User
        * * SQL Data Type: nvarchar(100)
        */
        get RunByUser(): string {  
            return this.Get('RunByUser');
        }
        

    }
        
    /**
     * User View Run Details - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: UserViewRunDetail
     * * Base View: vwUserViewRunDetails
     * * @description Tracks the set of records that were included in each run of a given user view.
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'User View Run Details')
    export class UserViewRunDetailEntity extends BaseEntity {
        /**
        * Loads the User View Run Details record from the database
        * @param ID: number - primary key value to load the User View Run Details record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof UserViewRunDetailEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * User View Run Details - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof UserViewRunDetailEntity
        * @throws {Error} - Delete is not allowed for User View Run Details, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for User View Run Details, to enable it set AllowDeleteAPI to 1 in the database.');
        } 
            
            /**
        * * Field Name: ID
        * * SQL Data Type: int
        */
        get ID(): number {  
            return this.Get('ID');
        }
        
        /**
        * * Field Name: UserViewRunID
        * * Display Name: User View Run ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: User View Runs (vwUserViewRuns.ID)
        */
        get UserViewRunID(): number {  
            return this.Get('UserViewRunID');
        }
        set UserViewRunID(value: number) {
            this.Set('UserViewRunID', value);
        }
        /**
        * * Field Name: RecordID
        * * Display Name: Record
        * * SQL Data Type: nvarchar(255)
        */
        get RecordID(): string {  
            return this.Get('RecordID');
        }
        set RecordID(value: string) {
            this.Set('RecordID', value);
        }
        /**
        * * Field Name: UserViewID
        * * Display Name: User View
        * * SQL Data Type: int
        */
        get UserViewID(): number {  
            return this.Get('UserViewID');
        }
        
        /**
        * * Field Name: EntityID
        * * Display Name: Entity
        * * SQL Data Type: int
        */
        get EntityID(): number {  
            return this.Get('EntityID');
        }
        

    }
        
    /**
     * Workflow Runs - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: WorkflowRun
     * * Base View: vwWorkflowRuns
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Workflow Runs')
    export class WorkflowRunEntity extends BaseEntity {
        /**
        * Loads the Workflow Runs record from the database
        * @param ID: number - primary key value to load the Workflow Runs record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof WorkflowRunEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Workflow Runs - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof WorkflowRunEntity
        * @throws {Error} - Delete is not allowed for Workflow Runs, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Workflow Runs, to enable it set AllowDeleteAPI to 1 in the database.');
        } 
            
            /**
        * * Field Name: ID
        * * SQL Data Type: int
        */
        get ID(): number {  
            return this.Get('ID');
        }
        
        /**
        * * Field Name: WorkflowName
        * * Display Name: Workflow Name
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Workflows (vwWorkflows.Name)
        */
        get WorkflowName(): string {  
            return this.Get('WorkflowName');
        }
        set WorkflowName(value: string) {
            this.Set('WorkflowName', value);
        }
        /**
        * * Field Name: ExternalSystemRecordID
        * * Display Name: External System Record
        * * SQL Data Type: nvarchar(100)
        */
        get ExternalSystemRecordID(): string {  
            return this.Get('ExternalSystemRecordID');
        }
        set ExternalSystemRecordID(value: string) {
            this.Set('ExternalSystemRecordID', value);
        }
        /**
        * * Field Name: StartedAt
        * * Display Name: Started At
        * * SQL Data Type: datetime
        */
        get StartedAt(): Date {  
            return this.Get('StartedAt');
        }
        set StartedAt(value: Date) {
            this.Set('StartedAt', value);
        }
        /**
        * * Field Name: EndedAt
        * * Display Name: Ended At
        * * SQL Data Type: datetime
        */
        get EndedAt(): Date | null {  
            return this.Get('EndedAt');
        }
        set EndedAt(value: Date | null) {
            this.Set('EndedAt', value);
        }
        /**
        * * Field Name: Status
        * * SQL Data Type: nchar(10)
        * * Default Value: Pending
        * * Value List Type: List
        * * Possible Values 
        *   * Pending
        *   * In Progress
        *   * Complete
        *   * Failed
        */
        get Status(): 'Pending' | 'In Progress' | 'Complete' | 'Failed' {  
            return this.Get('Status');
        }
        set Status(value: 'Pending' | 'In Progress' | 'Complete' | 'Failed') {
            this.Set('Status', value);
        }
        /**
        * * Field Name: Results
        * * SQL Data Type: nvarchar(MAX)
        */
        get Results(): string | null {  
            return this.Get('Results');
        }
        set Results(value: string | null) {
            this.Set('Results', value);
        }
        /**
        * * Field Name: Workflow
        * * Display Name: Workflow
        * * SQL Data Type: nvarchar(100)
        */
        get Workflow(): string {  
            return this.Get('Workflow');
        }
        
        /**
        * * Field Name: WorkflowEngineName
        * * Display Name: Workflow Engine Name
        * * SQL Data Type: nvarchar(100)
        */
        get WorkflowEngineName(): string {  
            return this.Get('WorkflowEngineName');
        }
        

    }
        
    /**
     * Workflows - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: Workflow
     * * Base View: vwWorkflows
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Workflows')
    export class WorkflowEntity extends BaseEntity {
        /**
        * Loads the Workflows record from the database
        * @param ID: number - primary key value to load the Workflows record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof WorkflowEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Workflows - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof WorkflowEntity
        * @throws {Error} - Delete is not allowed for Workflows, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Workflows, to enable it set AllowDeleteAPI to 1 in the database.');
        } 
            
            /**
        * * Field Name: ID
        * * SQL Data Type: int
        */
        get ID(): number {  
            return this.Get('ID');
        }
        
        /**
        * * Field Name: Name
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
        * * SQL Data Type: nvarchar(MAX)
        */
        get Description(): string | null {  
            return this.Get('Description');
        }
        set Description(value: string | null) {
            this.Set('Description', value);
        }
        /**
        * * Field Name: WorkflowEngineName
        * * Display Name: Workflow Engine Name
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Workflow Engines (vwWorkflowEngines.Name)
        */
        get WorkflowEngineName(): string {  
            return this.Get('WorkflowEngineName');
        }
        set WorkflowEngineName(value: string) {
            this.Set('WorkflowEngineName', value);
        }
        /**
        * * Field Name: CompanyName
        * * Display Name: Company Name
        * * SQL Data Type: nvarchar(50)
        * * Related Entity/Foreign Key: Companies (vwCompanies.Name)
        */
        get CompanyName(): string {  
            return this.Get('CompanyName');
        }
        set CompanyName(value: string) {
            this.Set('CompanyName', value);
        }
        /**
        * * Field Name: ExternalSystemRecordID
        * * Display Name: External System Record
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
        * * Field Name: AutoRunEnabled
        * * Display Name: Auto Run Enabled
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: If set to 1, the workflow will be run automatically on the interval specified by the AutoRunIntervalType and AutoRunInterval fields
        */
        get AutoRunEnabled(): boolean {  
            return this.Get('AutoRunEnabled');
        }
        set AutoRunEnabled(value: boolean) {
            this.Set('AutoRunEnabled', value);
        }
        /**
        * * Field Name: AutoRunIntervalUnits
        * * Display Name: Auto Run Interval Units
        * * SQL Data Type: nvarchar(20)
        * * Value List Type: List
        * * Possible Values 
        *   * Years
        *   * Months
        *   * Weeks
        *   * Days
        *   * Hours
        *   * Minutes
        * * Description: Minutes, Hours, Days, Weeks, Months, Years
        */
        get AutoRunIntervalUnits(): 'Years' | 'Months' | 'Weeks' | 'Days' | 'Hours' | 'Minutes' | null {  
            return this.Get('AutoRunIntervalUnits');
        }
        set AutoRunIntervalUnits(value: 'Years' | 'Months' | 'Weeks' | 'Days' | 'Hours' | 'Minutes' | null) {
            this.Set('AutoRunIntervalUnits', value);
        }
        /**
        * * Field Name: AutoRunInterval
        * * Display Name: Auto Run Interval
        * * SQL Data Type: int
        * * Description: The interval, denominated in the units specified in the AutoRunIntervalUnits column, between auto runs of this workflow.
        */
        get AutoRunInterval(): number | null {  
            return this.Get('AutoRunInterval');
        }
        set AutoRunInterval(value: number | null) {
            this.Set('AutoRunInterval', value);
        }
        /**
        * * Field Name: SubclassName
        * * Display Name: Subclass Name
        * * SQL Data Type: nvarchar(200)
        * * Description: If specified, this subclass key, via the ClassFactory, will be instantiated, to execute this workflow. If not specified the WorkflowBase class will be used by default.
        */
        get SubclassName(): string | null {  
            return this.Get('SubclassName');
        }
        set SubclassName(value: string | null) {
            this.Set('SubclassName', value);
        }
        /**
        * * Field Name: AutoRunIntervalMinutes
        * * Display Name: Auto Run Interval Minutes
        * * SQL Data Type: int
        */
        get AutoRunIntervalMinutes(): number | null {  
            return this.Get('AutoRunIntervalMinutes');
        }
        

    }
        
    /**
     * Workflow Engines - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: WorkflowEngine
     * * Base View: vwWorkflowEngines
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Workflow Engines')
    export class WorkflowEngineEntity extends BaseEntity {
        /**
        * Loads the Workflow Engines record from the database
        * @param ID: number - primary key value to load the Workflow Engines record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof WorkflowEngineEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Workflow Engines - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof WorkflowEngineEntity
        * @throws {Error} - Delete is not allowed for Workflow Engines, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Workflow Engines, to enable it set AllowDeleteAPI to 1 in the database.');
        } 
            
            /**
        * * Field Name: ID
        * * SQL Data Type: int
        */
        get ID(): number {  
            return this.Get('ID');
        }
        
        /**
        * * Field Name: Name
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
        * * SQL Data Type: nvarchar(MAX)
        */
        get Description(): string | null {  
            return this.Get('Description');
        }
        set Description(value: string | null) {
            this.Set('Description', value);
        }
        /**
        * * Field Name: DriverPath
        * * Display Name: Driver Path
        * * SQL Data Type: nvarchar(500)
        */
        get DriverPath(): string {  
            return this.Get('DriverPath');
        }
        set DriverPath(value: string) {
            this.Set('DriverPath', value);
        }
        /**
        * * Field Name: DriverClass
        * * Display Name: Driver Class
        * * SQL Data Type: nvarchar(100)
        */
        get DriverClass(): string {  
            return this.Get('DriverClass');
        }
        set DriverClass(value: string) {
            this.Set('DriverClass', value);
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
     * Record Changes - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: RecordChange
     * * Base View: vwRecordChanges
     * * @description For entities that have TrackRecordChanges=1, Record Changes will store the history of all changes made within the system. For integrations you can directly add values here if you have inbound signals indicating records were changed in a source system. This entity only automatically captures Record Changes if they were made within the system.
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Record Changes')
    export class RecordChangeEntity extends BaseEntity {
        /**
        * Loads the Record Changes record from the database
        * @param ID: number - primary key value to load the Record Changes record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof RecordChangeEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Record Changes - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof RecordChangeEntity
        * @throws {Error} - Delete is not allowed for Record Changes, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Record Changes, to enable it set AllowDeleteAPI to 1 in the database.');
        } 
            
            /**
        * * Field Name: ID
        * * SQL Data Type: int
        */
        get ID(): number {  
            return this.Get('ID');
        }
        
        /**
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)
        */
        get EntityID(): number {  
            return this.Get('EntityID');
        }
        set EntityID(value: number) {
            this.Set('EntityID', value);
        }
        /**
        * * Field Name: RecordID
        * * Display Name: Record
        * * SQL Data Type: nvarchar(750)
        */
        get RecordID(): string {  
            return this.Get('RecordID');
        }
        set RecordID(value: string) {
            this.Set('RecordID', value);
        }
        /**
        * * Field Name: UserID
        * * Display Name: User ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Users (vwUsers.ID)
        * * Description: The user that made the change
        */
        get UserID(): number {  
            return this.Get('UserID');
        }
        set UserID(value: number) {
            this.Set('UserID', value);
        }
        /**
        * * Field Name: Type
        * * Display Name: Type
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Create
        * * Value List Type: List
        * * Possible Values 
        *   * Create
        *   * Update
        *   * Delete
        * * Description: Create, Update, or Delete
        */
        get Type(): 'Create' | 'Update' | 'Delete' {  
            return this.Get('Type');
        }
        set Type(value: 'Create' | 'Update' | 'Delete') {
            this.Set('Type', value);
        }
        /**
        * * Field Name: Source
        * * Display Name: Source
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Internal
        * * Value List Type: List
        * * Possible Values 
        *   * Internal
        *   * External
        * * Description: Internal or External
        */
        get Source(): 'Internal' | 'External' {  
            return this.Get('Source');
        }
        set Source(value: 'Internal' | 'External') {
            this.Set('Source', value);
        }
        /**
        * * Field Name: IntegrationID
        * * Display Name: Integration ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Integrations (vwIntegrations.ID)
        * * Description: If Source=External, this field can optionally specify which integration created the change, if known
        */
        get IntegrationID(): number | null {  
            return this.Get('IntegrationID');
        }
        set IntegrationID(value: number | null) {
            this.Set('IntegrationID', value);
        }
        /**
        * * Field Name: ChangedAt
        * * Display Name: Changed At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()
        * * Description: The date/time that the change occured.
        */
        get ChangedAt(): Date {  
            return this.Get('ChangedAt');
        }
        set ChangedAt(value: Date) {
            this.Set('ChangedAt', value);
        }
        /**
        * * Field Name: ChangesJSON
        * * Display Name: Changes JSON
        * * SQL Data Type: nvarchar(MAX)
        * * Description: JSON structure that describes what was changed in a structured format.
        */
        get ChangesJSON(): string {  
            return this.Get('ChangesJSON');
        }
        set ChangesJSON(value: string) {
            this.Set('ChangesJSON', value);
        }
        /**
        * * Field Name: ChangesDescription
        * * Display Name: Changes Description
        * * SQL Data Type: nvarchar(MAX)
        * * Description: A generated, human-readable description of what was changed.
        */
        get ChangesDescription(): string {  
            return this.Get('ChangesDescription');
        }
        set ChangesDescription(value: string) {
            this.Set('ChangesDescription', value);
        }
        /**
        * * Field Name: FullRecordJSON
        * * Display Name: Full Record JSON
        * * SQL Data Type: nvarchar(MAX)
        * * Description: A complete snapshot of the record AFTER the change was applied in a JSON format that can be parsed.
        */
        get FullRecordJSON(): string {  
            return this.Get('FullRecordJSON');
        }
        set FullRecordJSON(value: string) {
            this.Set('FullRecordJSON', value);
        }
        /**
        * * Field Name: Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Complete
        * * Value List Type: List
        * * Possible Values 
        *   * Pending
        *   * Complete
        *   * Error
        * * Description: For internal record changes generated within MJ, the status is immediately Complete. For external changes that are detected, the workflow starts off as Pending, then In Progress and finally either Complete or Error
        */
        get Status(): 'Pending' | 'Complete' | 'Error' {  
            return this.Get('Status');
        }
        set Status(value: 'Pending' | 'Complete' | 'Error') {
            this.Set('Status', value);
        }
        /**
        * * Field Name: ReplayRunID
        * * Display Name: Replay Run ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Record Change Replay Runs (vwRecordChangeReplayRuns.ID)
        * * Description: For external changes only, this run ID is the link to the replay run that the change record was part of
        */
        get ReplayRunID(): number | null {  
            return this.Get('ReplayRunID');
        }
        set ReplayRunID(value: number | null) {
            this.Set('ReplayRunID', value);
        }
        /**
        * * Field Name: ErrorLog
        * * Display Name: Error Log
        * * SQL Data Type: nvarchar(MAX)
        */
        get ErrorLog(): string | null {  
            return this.Get('ErrorLog');
        }
        set ErrorLog(value: string | null) {
            this.Set('ErrorLog', value);
        }
        /**
        * * Field Name: Comments
        * * SQL Data Type: nvarchar(MAX)
        */
        get Comments(): string | null {  
            return this.Get('Comments');
        }
        set Comments(value: string | null) {
            this.Set('Comments', value);
        }
        /**
        * * Field Name: CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()
        */
        get CreatedAt(): Date {  
            return this.Get('CreatedAt');
        }
        
        /**
        * * Field Name: UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()
        */
        get UpdatedAt(): Date {  
            return this.Get('UpdatedAt');
        }
        
        /**
        * * Field Name: Entity
        * * Display Name: Entity
        * * SQL Data Type: nvarchar(255)
        */
        get Entity(): string {  
            return this.Get('Entity');
        }
        
        /**
        * * Field Name: User
        * * Display Name: User
        * * SQL Data Type: nvarchar(100)
        */
        get User(): string {  
            return this.Get('User');
        }
        
        /**
        * * Field Name: Integration
        * * Display Name: Integration
        * * SQL Data Type: nvarchar(100)
        */
        get Integration(): string | null {  
            return this.Get('Integration');
        }
        

    }
        
    /**
     * User Roles - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: UserRole
     * * Base View: vwUserRoles
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'User Roles')
    export class UserRoleEntity extends BaseEntity {
        /**
        * Loads the User Roles record from the database
        * @param ID: number - primary key value to load the User Roles record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof UserRoleEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
        * * Field Name: UserID
        * * Display Name: User ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Users (vwUsers.ID)
        */
        get UserID(): number {  
            return this.Get('UserID');
        }
        set UserID(value: number) {
            this.Set('UserID', value);
        }
        /**
        * * Field Name: RoleName
        * * Display Name: Role Name
        * * SQL Data Type: nvarchar(50)
        * * Related Entity/Foreign Key: Roles (vwRoles.Name)
        */
        get RoleName(): string {  
            return this.Get('RoleName');
        }
        set RoleName(value: string) {
            this.Set('RoleName', value);
        }
        /**
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_CreatedAt(): Date {  
            return this.Get('__mj_CreatedAt');
        }
        
        /**
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_UpdatedAt(): Date {  
            return this.Get('__mj_UpdatedAt');
        }
        
        /**
        * * Field Name: User
        * * Display Name: User
        * * SQL Data Type: nvarchar(100)
        * * Default Value: getutcdate()
        */
        get User(): string {  
            return this.Get('User');
        }
        

    }
        
    /**
     * Row Level Security Filters - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: RowLevelSecurityFilter
     * * Base View: vwRowLevelSecurityFilters
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Row Level Security Filters')
    export class RowLevelSecurityFilterEntity extends BaseEntity {
        /**
        * Loads the Row Level Security Filters record from the database
        * @param ID: number - primary key value to load the Row Level Security Filters record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof RowLevelSecurityFilterEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Row Level Security Filters - AllowCreateAPI and AllowUpdateAPI are both set to 0 in the database.  Save is not allowed, so this method is generated to override the base class method and throw an error. To enable save for this entity, set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof RowLevelSecurityFilterEntity
        * @throws {Error} - Save is not allowed for Row Level Security Filters, to enable it set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.
        */
        public async Save(options?: EntitySaveOptions) : Promise<boolean> {
            throw new Error('Save is not allowed for Row Level Security Filters, to enable it set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.');
        } 
                
        /**
        * Row Level Security Filters - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof RowLevelSecurityFilterEntity
        * @throws {Error} - Delete is not allowed for Row Level Security Filters, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Row Level Security Filters, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Field Name: FilterText
        * * Display Name: Filter Text
        * * SQL Data Type: nvarchar(MAX)
        */
        get FilterText(): string | null {  
            return this.Get('FilterText');
        }
        set FilterText(value: string | null) {
            this.Set('FilterText', value);
        }
        /**
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_CreatedAt(): Date {  
            return this.Get('__mj_CreatedAt');
        }
        
        /**
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_UpdatedAt(): Date {  
            return this.Get('__mj_UpdatedAt');
        }
        

    }
        
    /**
     * Audit Logs - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: AuditLog
     * * Base View: vwAuditLogs
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Audit Logs')
    export class AuditLogEntity extends BaseEntity {
        /**
        * Loads the Audit Logs record from the database
        * @param ID: number - primary key value to load the Audit Logs record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof AuditLogEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Audit Logs - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof AuditLogEntity
        * @throws {Error} - Delete is not allowed for Audit Logs, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Audit Logs, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Field Name: AuditLogTypeName
        * * Display Name: Audit Log Type Name
        * * SQL Data Type: nvarchar(50)
        * * Related Entity/Foreign Key: Audit Log Types (vwAuditLogTypes.Name)
        */
        get AuditLogTypeName(): string | null {  
            return this.Get('AuditLogTypeName');
        }
        set AuditLogTypeName(value: string | null) {
            this.Set('AuditLogTypeName', value);
        }
        /**
        * * Field Name: UserID
        * * Display Name: User ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Users (vwUsers.ID)
        */
        get UserID(): number {  
            return this.Get('UserID');
        }
        set UserID(value: number) {
            this.Set('UserID', value);
        }
        /**
        * * Field Name: AuthorizationName
        * * Display Name: Authorization Name
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Authorizations (vwAuthorizations.Name)
        */
        get AuthorizationName(): string | null {  
            return this.Get('AuthorizationName');
        }
        set AuthorizationName(value: string | null) {
            this.Set('AuthorizationName', value);
        }
        /**
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Allow
        * * Value List Type: List
        * * Possible Values 
        *   * Success
        *   * Failed
        */
        get Status(): 'Success' | 'Failed' {  
            return this.Get('Status');
        }
        set Status(value: 'Success' | 'Failed') {
            this.Set('Status', value);
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
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)
        */
        get EntityID(): number | null {  
            return this.Get('EntityID');
        }
        set EntityID(value: number | null) {
            this.Set('EntityID', value);
        }
        /**
        * * Field Name: RecordID
        * * Display Name: Record
        * * SQL Data Type: nvarchar(255)
        */
        get RecordID(): string | null {  
            return this.Get('RecordID');
        }
        set RecordID(value: string | null) {
            this.Set('RecordID', value);
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
        * * Field Name: User
        * * Display Name: User
        * * SQL Data Type: nvarchar(100)
        */
        get User(): string {  
            return this.Get('User');
        }
        
        /**
        * * Field Name: Entity
        * * Display Name: Entity
        * * SQL Data Type: nvarchar(255)
        */
        get Entity(): string | null {  
            return this.Get('Entity');
        }
        

    }
        
    /**
     * Authorizations - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: Authorization
     * * Base View: vwAuthorizations
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Authorizations')
    export class AuthorizationEntity extends BaseEntity {
        /**
        * Loads the Authorizations record from the database
        * @param ID: number - primary key value to load the Authorizations record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof AuthorizationEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Authorizations - AllowCreateAPI and AllowUpdateAPI are both set to 0 in the database.  Save is not allowed, so this method is generated to override the base class method and throw an error. To enable save for this entity, set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof AuthorizationEntity
        * @throws {Error} - Save is not allowed for Authorizations, to enable it set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.
        */
        public async Save(options?: EntitySaveOptions) : Promise<boolean> {
            throw new Error('Save is not allowed for Authorizations, to enable it set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.');
        } 
                
        /**
        * Authorizations - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof AuthorizationEntity
        * @throws {Error} - Delete is not allowed for Authorizations, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Authorizations, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Field Name: ParentID
        * * Display Name: Parent ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Authorizations (vwAuthorizations.ID)
        */
        get ParentID(): number | null {  
            return this.Get('ParentID');
        }
        set ParentID(value: number | null) {
            this.Set('ParentID', value);
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
        * * Field Name: UseAuditLog
        * * Display Name: Use Audit Log
        * * SQL Data Type: bit
        * * Default Value: 1
        */
        get UseAuditLog(): boolean {  
            return this.Get('UseAuditLog');
        }
        set UseAuditLog(value: boolean) {
            this.Set('UseAuditLog', value);
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
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_CreatedAt(): Date {  
            return this.Get('__mj_CreatedAt');
        }
        
        /**
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_UpdatedAt(): Date {  
            return this.Get('__mj_UpdatedAt');
        }
        
        /**
        * * Field Name: Parent
        * * Display Name: Parent
        * * SQL Data Type: nvarchar(100)
        * * Default Value: getutcdate()
        */
        get Parent(): string | null {  
            return this.Get('Parent');
        }
        

    }
        
    /**
     * Authorization Roles - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: AuthorizationRole
     * * Base View: vwAuthorizationRoles
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Authorization Roles')
    export class AuthorizationRoleEntity extends BaseEntity {
        /**
        * Loads the Authorization Roles record from the database
        * @param ID: number - primary key value to load the Authorization Roles record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof AuthorizationRoleEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Authorization Roles - AllowCreateAPI and AllowUpdateAPI are both set to 0 in the database.  Save is not allowed, so this method is generated to override the base class method and throw an error. To enable save for this entity, set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof AuthorizationRoleEntity
        * @throws {Error} - Save is not allowed for Authorization Roles, to enable it set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.
        */
        public async Save(options?: EntitySaveOptions) : Promise<boolean> {
            throw new Error('Save is not allowed for Authorization Roles, to enable it set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.');
        } 
                
        /**
        * Authorization Roles - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof AuthorizationRoleEntity
        * @throws {Error} - Delete is not allowed for Authorization Roles, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Authorization Roles, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Field Name: AuthorizationName
        * * Display Name: Authorization Name
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Authorizations (vwAuthorizations.Name)
        */
        get AuthorizationName(): string | null {  
            return this.Get('AuthorizationName');
        }
        set AuthorizationName(value: string | null) {
            this.Set('AuthorizationName', value);
        }
        /**
        * * Field Name: RoleName
        * * Display Name: Role Name
        * * SQL Data Type: nvarchar(50)
        * * Related Entity/Foreign Key: Roles (vwRoles.Name)
        */
        get RoleName(): string | null {  
            return this.Get('RoleName');
        }
        set RoleName(value: string | null) {
            this.Set('RoleName', value);
        }
        /**
        * * Field Name: Type
        * * Display Name: Type
        * * SQL Data Type: nchar(10)
        * * Default Value: grant
        * * Value List Type: List
        * * Possible Values 
        *   * Allow - User allowed to execute tasks linked to this authorization
        *   * Deny - User NOT allowed to execute tasks linked to this authorization - deny overrides Allow from all other roles a user may be part of
        */
        get Type(): 'Allow' | 'Deny' {  
            return this.Get('Type');
        }
        set Type(value: 'Allow' | 'Deny') {
            this.Set('Type', value);
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
     * Audit Log Types - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: AuditLogType
     * * Base View: vwAuditLogTypes
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Audit Log Types')
    export class AuditLogTypeEntity extends BaseEntity {
        /**
        * Loads the Audit Log Types record from the database
        * @param ID: number - primary key value to load the Audit Log Types record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof AuditLogTypeEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Audit Log Types - AllowCreateAPI and AllowUpdateAPI are both set to 0 in the database.  Save is not allowed, so this method is generated to override the base class method and throw an error. To enable save for this entity, set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof AuditLogTypeEntity
        * @throws {Error} - Save is not allowed for Audit Log Types, to enable it set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.
        */
        public async Save(options?: EntitySaveOptions) : Promise<boolean> {
            throw new Error('Save is not allowed for Audit Log Types, to enable it set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.');
        } 
                
        /**
        * Audit Log Types - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof AuditLogTypeEntity
        * @throws {Error} - Delete is not allowed for Audit Log Types, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Audit Log Types, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Field Name: ParentID
        * * Display Name: Parent ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Audit Log Types (vwAuditLogTypes.ID)
        */
        get ParentID(): number | null {  
            return this.Get('ParentID');
        }
        set ParentID(value: number | null) {
            this.Set('ParentID', value);
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
        get Description(): string | null {  
            return this.Get('Description');
        }
        set Description(value: string | null) {
            this.Set('Description', value);
        }
        /**
        * * Field Name: AuthorizationName
        * * Display Name: Authorization Name
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Authorizations (vwAuthorizations.Name)
        */
        get AuthorizationName(): string | null {  
            return this.Get('AuthorizationName');
        }
        set AuthorizationName(value: string | null) {
            this.Set('AuthorizationName', value);
        }
        /**
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_CreatedAt(): Date {  
            return this.Get('__mj_CreatedAt');
        }
        
        /**
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_UpdatedAt(): Date {  
            return this.Get('__mj_UpdatedAt');
        }
        
        /**
        * * Field Name: Parent
        * * Display Name: Parent
        * * SQL Data Type: nvarchar(50)
        * * Default Value: getutcdate()
        */
        get Parent(): string | null {  
            return this.Get('Parent');
        }
        

    }
        
    /**
     * Entity Field Values - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: EntityFieldValue
     * * Base View: vwEntityFieldValues
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Entity Field Values')
    export class EntityFieldValueEntity extends BaseEntity {
        /**
        * Loads the Entity Field Values record from the database
        * @param ID: number - primary key value to load the Entity Field Values record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof EntityFieldValueEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Entity Field Values - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof EntityFieldValueEntity
        * @throws {Error} - Delete is not allowed for Entity Field Values, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Entity Field Values, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Entity Fields (vwEntityFields.EntityID)
        */
        get EntityID(): number {  
            return this.Get('EntityID');
        }
        set EntityID(value: number) {
            this.Set('EntityID', value);
        }
        /**
        * * Field Name: EntityFieldName
        * * Display Name: Entity Field Name
        * * SQL Data Type: nvarchar(255)
        * * Related Entity/Foreign Key: Entity Fields (vwEntityFields.Name)
        */
        get EntityFieldName(): string {  
            return this.Get('EntityFieldName');
        }
        set EntityFieldName(value: string) {
            this.Set('EntityFieldName', value);
        }
        /**
        * * Field Name: Sequence
        * * Display Name: Sequence
        * * SQL Data Type: int
        */
        get Sequence(): number {  
            return this.Get('Sequence');
        }
        set Sequence(value: number) {
            this.Set('Sequence', value);
        }
        /**
        * * Field Name: Value
        * * Display Name: Value
        * * SQL Data Type: nvarchar(255)
        */
        get Value(): string {  
            return this.Get('Value');
        }
        set Value(value: string) {
            this.Set('Value', value);
        }
        /**
        * * Field Name: Code
        * * Display Name: Code
        * * SQL Data Type: nvarchar(50)
        */
        get Code(): string | null {  
            return this.Get('Code');
        }
        set Code(value: string | null) {
            this.Set('Code', value);
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
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_CreatedAt(): Date {  
            return this.Get('__mj_CreatedAt');
        }
        
        /**
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_UpdatedAt(): Date {  
            return this.Get('__mj_UpdatedAt');
        }
        
        /**
        * * Field Name: EntityField
        * * Display Name: Entity Field
        * * SQL Data Type: nvarchar(255)
        * * Default Value: getutcdate()
        */
        get EntityField(): string {  
            return this.Get('EntityField');
        }
        
        /**
        * * Field Name: Entity
        * * Display Name: Entity
        * * SQL Data Type: nvarchar(255)
        * * Default Value: getutcdate()
        */
        get Entity(): string {  
            return this.Get('Entity');
        }
        

    }
        
    /**
     * AI Models - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: AIModel
     * * Base View: vwAIModels
     * * @description Catalog of all AI Models configured in the system
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'AI Models')
    export class AIModelEntity extends BaseEntity {
        /**
        * Loads the AI Models record from the database
        * @param ID: number - primary key value to load the AI Models record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof AIModelEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
        * * Field Name: Vendor
        * * Display Name: Vendor
        * * SQL Data Type: nvarchar(50)
        */
        get Vendor(): string | null {  
            return this.Get('Vendor');
        }
        set Vendor(value: string | null) {
            this.Set('Vendor', value);
        }
        /**
        * * Field Name: AIModelTypeID
        * * Display Name: AI Model Type ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: AI Model Types (vwAIModelTypes.ID)
        */
        get AIModelTypeID(): number {  
            return this.Get('AIModelTypeID');
        }
        set AIModelTypeID(value: number) {
            this.Set('AIModelTypeID', value);
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
        * * Field Name: DriverClass
        * * Display Name: Driver Class
        * * SQL Data Type: nvarchar(100)
        */
        get DriverClass(): string | null {  
            return this.Get('DriverClass');
        }
        set DriverClass(value: string | null) {
            this.Set('DriverClass', value);
        }
        /**
        * * Field Name: DriverImportPath
        * * Display Name: Driver Import Path
        * * SQL Data Type: nvarchar(255)
        */
        get DriverImportPath(): string | null {  
            return this.Get('DriverImportPath');
        }
        set DriverImportPath(value: string | null) {
            this.Set('DriverImportPath', value);
        }
        /**
        * * Field Name: APIName
        * * Display Name: APIName
        * * SQL Data Type: nvarchar(100)
        * * Description: The name of the model to use with API calls which might differ from the Name, if APIName is not provided, Name will be used for API calls
        */
        get APIName(): string | null {  
            return this.Get('APIName');
        }
        set APIName(value: string | null) {
            this.Set('APIName', value);
        }
        /**
        * * Field Name: PowerRank
        * * Display Name: Power Rank
        * * SQL Data Type: int
        * * Description: A simplified power rank of each model for a given AI Model Type. For example, if we have GPT 3, GPT 3.5, and GPT 4, we would have a PowerRank of 1 for GPT3, 2 for GPT 3.5, and 3 for GPT 4. This can be used within model families like OpenAI or across all models. For example if you had Llama 2 in the mix which is similar to GPT 3.5 it would also have a PowerRank of 2. This can be used at runtime to pick the most/least powerful or compare model relative power.
        */
        get PowerRank(): number | null {  
            return this.Get('PowerRank');
        }
        set PowerRank(value: number | null) {
            this.Set('PowerRank', value);
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
        * * Field Name: AIModelType
        * * Display Name: AIModel Type
        * * SQL Data Type: nvarchar(50)
        */
        get AIModelType(): string {  
            return this.Get('AIModelType');
        }
        

    }
        
    /**
     * AI Actions - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: AIAction
     * * Base View: vwAIActions
     * * @description List of all actions that are possible across all AI Models
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'AI Actions')
    export class AIActionEntity extends BaseEntity {
        /**
        * Loads the AI Actions record from the database
        * @param ID: number - primary key value to load the AI Actions record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof AIActionEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
        get Description(): string | null {  
            return this.Get('Description');
        }
        set Description(value: string | null) {
            this.Set('Description', value);
        }
        /**
        * * Field Name: DefaultModelID
        * * Display Name: Default Model ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: AI Models (vwAIModels.ID)
        */
        get DefaultModelID(): number | null {  
            return this.Get('DefaultModelID');
        }
        set DefaultModelID(value: number | null) {
            this.Set('DefaultModelID', value);
        }
        /**
        * * Field Name: DefaultPrompt
        * * Display Name: Default Prompt
        * * SQL Data Type: nvarchar(MAX)
        */
        get DefaultPrompt(): string | null {  
            return this.Get('DefaultPrompt');
        }
        set DefaultPrompt(value: string | null) {
            this.Set('DefaultPrompt', value);
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
        * * Field Name: DefaultModel
        * * Display Name: Default Model
        * * SQL Data Type: nvarchar(50)
        */
        get DefaultModel(): string | null {  
            return this.Get('DefaultModel');
        }
        

    }
        
    /**
     * AI Model Actions - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: AIModelAction
     * * Base View: vwAIModelActions
     * * @description Tracks the actions supported by each AI Model
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'AI Model Actions')
    export class AIModelActionEntity extends BaseEntity {
        /**
        * Loads the AI Model Actions record from the database
        * @param ID: number - primary key value to load the AI Model Actions record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof AIModelActionEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
        * * Field Name: AIModelID
        * * Display Name: AI Model ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: AI Models (vwAIModels.ID)
        */
        get AIModelID(): number {  
            return this.Get('AIModelID');
        }
        set AIModelID(value: number) {
            this.Set('AIModelID', value);
        }
        /**
        * * Field Name: AIActionID
        * * Display Name: AI Action ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: AI Actions (vwAIActions.ID)
        */
        get AIActionID(): number {  
            return this.Get('AIActionID');
        }
        set AIActionID(value: number) {
            this.Set('AIActionID', value);
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
        * * Field Name: AIModel
        * * Display Name: AIModel
        * * SQL Data Type: nvarchar(50)
        */
        get AIModel(): string {  
            return this.Get('AIModel');
        }
        
        /**
        * * Field Name: AIAction
        * * Display Name: AIAction
        * * SQL Data Type: nvarchar(50)
        */
        get AIAction(): string {  
            return this.Get('AIAction');
        }
        

    }
        
    /**
     * Entity AI Actions - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: EntityAIAction
     * * Base View: vwEntityAIActions
     * * @description Tracks the AI actions that should be invoked based on changes to records within a given entity.
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Entity AI Actions')
    export class EntityAIActionEntity extends BaseEntity {
        /**
        * Loads the Entity AI Actions record from the database
        * @param ID: number - primary key value to load the Entity AI Actions record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof EntityAIActionEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)
        */
        get EntityID(): number {  
            return this.Get('EntityID');
        }
        set EntityID(value: number) {
            this.Set('EntityID', value);
        }
        /**
        * * Field Name: AIActionID
        * * Display Name: AI Action ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: AI Actions (vwAIActions.ID)
        */
        get AIActionID(): number {  
            return this.Get('AIActionID');
        }
        set AIActionID(value: number) {
            this.Set('AIActionID', value);
        }
        /**
        * * Field Name: AIModelID
        * * Display Name: AI Model ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: AI Models (vwAIModels.ID)
        */
        get AIModelID(): number | null {  
            return this.Get('AIModelID');
        }
        set AIModelID(value: number | null) {
            this.Set('AIModelID', value);
        }
        /**
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(25)
        */
        get Name(): string {  
            return this.Get('Name');
        }
        set Name(value: string) {
            this.Set('Name', value);
        }
        /**
        * * Field Name: Prompt
        * * Display Name: Prompt
        * * SQL Data Type: nvarchar(MAX)
        */
        get Prompt(): string | null {  
            return this.Get('Prompt');
        }
        set Prompt(value: string | null) {
            this.Set('Prompt', value);
        }
        /**
        * * Field Name: TriggerEvent
        * * Display Name: Trigger Event
        * * SQL Data Type: nchar(15)
        * * Default Value: After Save
        * * Value List Type: List
        * * Possible Values 
        *   * after save
        *   * before save
        */
        get TriggerEvent(): 'after save' | 'before save' {  
            return this.Get('TriggerEvent');
        }
        set TriggerEvent(value: 'after save' | 'before save') {
            this.Set('TriggerEvent', value);
        }
        /**
        * * Field Name: UserMessage
        * * Display Name: User Message
        * * SQL Data Type: nvarchar(MAX)
        */
        get UserMessage(): string {  
            return this.Get('UserMessage');
        }
        set UserMessage(value: string) {
            this.Set('UserMessage', value);
        }
        /**
        * * Field Name: OutputType
        * * Display Name: Output Type
        * * SQL Data Type: nchar(10)
        * * Default Value: FIeld
        * * Value List Type: List
        * * Possible Values 
        *   * entity
        *   * field
        */
        get OutputType(): 'entity' | 'field' {  
            return this.Get('OutputType');
        }
        set OutputType(value: 'entity' | 'field') {
            this.Set('OutputType', value);
        }
        /**
        * * Field Name: OutputField
        * * Display Name: Output Field
        * * SQL Data Type: nvarchar(50)
        */
        get OutputField(): string | null {  
            return this.Get('OutputField');
        }
        set OutputField(value: string | null) {
            this.Set('OutputField', value);
        }
        /**
        * * Field Name: SkipIfOutputFieldNotEmpty
        * * Display Name: Skip If Output Field Not Empty
        * * SQL Data Type: bit
        * * Default Value: 1
        */
        get SkipIfOutputFieldNotEmpty(): boolean {  
            return this.Get('SkipIfOutputFieldNotEmpty');
        }
        set SkipIfOutputFieldNotEmpty(value: boolean) {
            this.Set('SkipIfOutputFieldNotEmpty', value);
        }
        /**
        * * Field Name: OutputEntityID
        * * Display Name: Output Entity ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)
        */
        get OutputEntityID(): number | null {  
            return this.Get('OutputEntityID');
        }
        set OutputEntityID(value: number | null) {
            this.Set('OutputEntityID', value);
        }
        /**
        * * Field Name: Comments
        * * Display Name: Comments
        * * SQL Data Type: nvarchar(MAX)
        */
        get Comments(): string | null {  
            return this.Get('Comments');
        }
        set Comments(value: string | null) {
            this.Set('Comments', value);
        }
        /**
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()
        */
        get __mj_CreatedAt(): Date {  
            return this.Get('__mj_CreatedAt');
        }
        
        /**
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()
        */
        get __mj_UpdatedAt(): Date {  
            return this.Get('__mj_UpdatedAt');
        }
        
        /**
        * * Field Name: Entity
        * * Display Name: Entity
        * * SQL Data Type: nvarchar(255)
        */
        get Entity(): string {  
            return this.Get('Entity');
        }
        
        /**
        * * Field Name: AIAction
        * * Display Name: AIAction
        * * SQL Data Type: nvarchar(50)
        */
        get AIAction(): string {  
            return this.Get('AIAction');
        }
        
        /**
        * * Field Name: AIModel
        * * Display Name: AIModel
        * * SQL Data Type: nvarchar(50)
        */
        get AIModel(): string | null {  
            return this.Get('AIModel');
        }
        
        /**
        * * Field Name: OutputEntity
        * * Display Name: Output Entity
        * * SQL Data Type: nvarchar(255)
        */
        get OutputEntity(): string | null {  
            return this.Get('OutputEntity');
        }
        

    }
        
    /**
     * AI Model Types - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: AIModelType
     * * Base View: vwAIModelTypes
     * * @description Types of AI Models
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'AI Model Types')
    export class AIModelTypeEntity extends BaseEntity {
        /**
        * Loads the AI Model Types record from the database
        * @param ID: number - primary key value to load the AI Model Types record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof AIModelTypeEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
        get Description(): string | null {  
            return this.Get('Description');
        }
        set Description(value: string | null) {
            this.Set('Description', value);
        }

    }
        
    /**
     * Queue Types - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: QueueType
     * * Base View: vwQueueTypes
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Queue Types')
    export class QueueTypeEntity extends BaseEntity {
        /**
        * Loads the Queue Types record from the database
        * @param ID: number - primary key value to load the Queue Types record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof QueueTypeEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Queue Types - AllowCreateAPI and AllowUpdateAPI are both set to 0 in the database.  Save is not allowed, so this method is generated to override the base class method and throw an error. To enable save for this entity, set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof QueueTypeEntity
        * @throws {Error} - Save is not allowed for Queue Types, to enable it set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.
        */
        public async Save(options?: EntitySaveOptions) : Promise<boolean> {
            throw new Error('Save is not allowed for Queue Types, to enable it set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.');
        } 
                
        /**
        * Queue Types - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof QueueTypeEntity
        * @throws {Error} - Delete is not allowed for Queue Types, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Queue Types, to enable it set AllowDeleteAPI to 1 in the database.');
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
        get Description(): string | null {  
            return this.Get('Description');
        }
        set Description(value: string | null) {
            this.Set('Description', value);
        }
        /**
        * * Field Name: DriverClass
        * * Display Name: Driver Class
        * * SQL Data Type: nvarchar(100)
        */
        get DriverClass(): string {  
            return this.Get('DriverClass');
        }
        set DriverClass(value: string) {
            this.Set('DriverClass', value);
        }
        /**
        * * Field Name: DriverImportPath
        * * Display Name: Driver Import Path
        * * SQL Data Type: nvarchar(200)
        */
        get DriverImportPath(): string | null {  
            return this.Get('DriverImportPath');
        }
        set DriverImportPath(value: string | null) {
            this.Set('DriverImportPath', value);
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

    }
        
    /**
     * Queues - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: Queue
     * * Base View: vwQueues
     * * @description Queues can be used to async execute long running tasks
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Queues')
    export class QueueEntity extends BaseEntity {
        /**
        * Loads the Queues record from the database
        * @param ID: number - primary key value to load the Queues record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof QueueEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Queues - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof QueueEntity
        * @throws {Error} - Delete is not allowed for Queues, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Queues, to enable it set AllowDeleteAPI to 1 in the database.');
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
        get Description(): string | null {  
            return this.Get('Description');
        }
        set Description(value: string | null) {
            this.Set('Description', value);
        }
        /**
        * * Field Name: QueueTypeID
        * * Display Name: Queue Type ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Queue Types (vwQueueTypes.ID)
        */
        get QueueTypeID(): number {  
            return this.Get('QueueTypeID');
        }
        set QueueTypeID(value: number) {
            this.Set('QueueTypeID', value);
        }
        /**
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 0
        */
        get IsActive(): boolean {  
            return this.Get('IsActive');
        }
        set IsActive(value: boolean) {
            this.Set('IsActive', value);
        }
        /**
        * * Field Name: ProcessPID
        * * Display Name: Process PID
        * * SQL Data Type: int
        */
        get ProcessPID(): number | null {  
            return this.Get('ProcessPID');
        }
        set ProcessPID(value: number | null) {
            this.Set('ProcessPID', value);
        }
        /**
        * * Field Name: ProcessPlatform
        * * Display Name: Process Platform
        * * SQL Data Type: nvarchar(30)
        */
        get ProcessPlatform(): string | null {  
            return this.Get('ProcessPlatform');
        }
        set ProcessPlatform(value: string | null) {
            this.Set('ProcessPlatform', value);
        }
        /**
        * * Field Name: ProcessVersion
        * * Display Name: Process Version
        * * SQL Data Type: nvarchar(15)
        */
        get ProcessVersion(): string | null {  
            return this.Get('ProcessVersion');
        }
        set ProcessVersion(value: string | null) {
            this.Set('ProcessVersion', value);
        }
        /**
        * * Field Name: ProcessCwd
        * * Display Name: Process Cwd
        * * SQL Data Type: nvarchar(100)
        */
        get ProcessCwd(): string | null {  
            return this.Get('ProcessCwd');
        }
        set ProcessCwd(value: string | null) {
            this.Set('ProcessCwd', value);
        }
        /**
        * * Field Name: ProcessIPAddress
        * * Display Name: Process IPAddress
        * * SQL Data Type: nvarchar(50)
        */
        get ProcessIPAddress(): string | null {  
            return this.Get('ProcessIPAddress');
        }
        set ProcessIPAddress(value: string | null) {
            this.Set('ProcessIPAddress', value);
        }
        /**
        * * Field Name: ProcessMacAddress
        * * Display Name: Process Mac Address
        * * SQL Data Type: nvarchar(50)
        */
        get ProcessMacAddress(): string | null {  
            return this.Get('ProcessMacAddress');
        }
        set ProcessMacAddress(value: string | null) {
            this.Set('ProcessMacAddress', value);
        }
        /**
        * * Field Name: ProcessOSName
        * * Display Name: Process OSName
        * * SQL Data Type: nvarchar(25)
        */
        get ProcessOSName(): string | null {  
            return this.Get('ProcessOSName');
        }
        set ProcessOSName(value: string | null) {
            this.Set('ProcessOSName', value);
        }
        /**
        * * Field Name: ProcessOSVersion
        * * Display Name: Process OSVersion
        * * SQL Data Type: nvarchar(10)
        */
        get ProcessOSVersion(): string | null {  
            return this.Get('ProcessOSVersion');
        }
        set ProcessOSVersion(value: string | null) {
            this.Set('ProcessOSVersion', value);
        }
        /**
        * * Field Name: ProcessHostName
        * * Display Name: Process Host Name
        * * SQL Data Type: nvarchar(50)
        */
        get ProcessHostName(): string | null {  
            return this.Get('ProcessHostName');
        }
        set ProcessHostName(value: string | null) {
            this.Set('ProcessHostName', value);
        }
        /**
        * * Field Name: ProcessUserID
        * * Display Name: Process User ID
        * * SQL Data Type: nvarchar(25)
        */
        get ProcessUserID(): string | null {  
            return this.Get('ProcessUserID');
        }
        set ProcessUserID(value: string | null) {
            this.Set('ProcessUserID', value);
        }
        /**
        * * Field Name: ProcessUserName
        * * Display Name: Process User Name
        * * SQL Data Type: nvarchar(50)
        */
        get ProcessUserName(): string | null {  
            return this.Get('ProcessUserName');
        }
        set ProcessUserName(value: string | null) {
            this.Set('ProcessUserName', value);
        }
        /**
        * * Field Name: LastHeartbeat
        * * Display Name: Last Heartbeat
        * * SQL Data Type: datetime
        * * Default Value: getdate()
        */
        get LastHeartbeat(): Date {  
            return this.Get('LastHeartbeat');
        }
        set LastHeartbeat(value: Date) {
            this.Set('LastHeartbeat', value);
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
        * * Field Name: QueueType
        * * Display Name: Queue Type
        * * SQL Data Type: nvarchar(50)
        */
        get QueueType(): string {  
            return this.Get('QueueType');
        }
        

    }
        
    /**
     * Queue Tasks - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: QueueTask
     * * Base View: vwQueueTasks
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Queue Tasks')
    export class QueueTaskEntity extends BaseEntity {
        /**
        * Loads the Queue Tasks record from the database
        * @param ID: number - primary key value to load the Queue Tasks record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof QueueTaskEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Queue Tasks - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof QueueTaskEntity
        * @throws {Error} - Delete is not allowed for Queue Tasks, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Queue Tasks, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Field Name: QueueID
        * * Display Name: Queue ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Queues (vwQueues.ID)
        */
        get QueueID(): number {  
            return this.Get('QueueID');
        }
        set QueueID(value: number) {
            this.Set('QueueID', value);
        }
        /**
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nchar(10)
        * * Default Value: Pending
        * * Value List Type: List
        * * Possible Values 
        *   * In Progress
        *   * Completed
        *   * Failed
        */
        get Status(): 'In Progress' | 'Completed' | 'Failed' {  
            return this.Get('Status');
        }
        set Status(value: 'In Progress' | 'Completed' | 'Failed') {
            this.Set('Status', value);
        }
        /**
        * * Field Name: StartedAt
        * * Display Name: Started At
        * * SQL Data Type: datetime
        */
        get StartedAt(): Date | null {  
            return this.Get('StartedAt');
        }
        set StartedAt(value: Date | null) {
            this.Set('StartedAt', value);
        }
        /**
        * * Field Name: EndedAt
        * * Display Name: Ended At
        * * SQL Data Type: datetime
        */
        get EndedAt(): Date | null {  
            return this.Get('EndedAt');
        }
        set EndedAt(value: Date | null) {
            this.Set('EndedAt', value);
        }
        /**
        * * Field Name: Data
        * * Display Name: Data
        * * SQL Data Type: nvarchar(MAX)
        */
        get Data(): string | null {  
            return this.Get('Data');
        }
        set Data(value: string | null) {
            this.Set('Data', value);
        }
        /**
        * * Field Name: Options
        * * Display Name: Options
        * * SQL Data Type: nvarchar(MAX)
        */
        get Options(): string | null {  
            return this.Get('Options');
        }
        set Options(value: string | null) {
            this.Set('Options', value);
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
        * * Field Name: ErrorMessage
        * * Display Name: Error Message
        * * SQL Data Type: nvarchar(MAX)
        */
        get ErrorMessage(): string | null {  
            return this.Get('ErrorMessage');
        }
        set ErrorMessage(value: string | null) {
            this.Set('ErrorMessage', value);
        }
        /**
        * * Field Name: Comments
        * * Display Name: Comments
        * * SQL Data Type: nvarchar(MAX)
        */
        get Comments(): string | null {  
            return this.Get('Comments');
        }
        set Comments(value: string | null) {
            this.Set('Comments', value);
        }
        /**
        * * Field Name: Queue
        * * Display Name: Queue
        * * SQL Data Type: nvarchar(50)
        */
        get Queue(): string {  
            return this.Get('Queue');
        }
        

    }
        
    /**
     * Dashboards - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: Dashboard
     * * Base View: vwDashboards
     * * @description Dashboards are used to group resources into a single display pane for an end-user
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Dashboards')
    export class DashboardEntity extends BaseEntity {
        /**
        * Loads the Dashboards record from the database
        * @param ID: number - primary key value to load the Dashboards record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof DashboardEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
        * * Field Name: CategoryID
        * * Display Name: Category ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Dashboard Categories (vwDashboardCategories.ID)
        */
        get CategoryID(): number | null {  
            return this.Get('CategoryID');
        }
        set CategoryID(value: number | null) {
            this.Set('CategoryID', value);
        }
        /**
        * * Field Name: UIConfigDetails
        * * Display Name: UIConfig Details
        * * SQL Data Type: nvarchar(MAX)
        */
        get UIConfigDetails(): string {  
            return this.Get('UIConfigDetails');
        }
        set UIConfigDetails(value: string) {
            this.Set('UIConfigDetails', value);
        }
        /**
        * * Field Name: UserID
        * * Display Name: User ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Users (vwUsers.ID)
        */
        get UserID(): number | null {  
            return this.Get('UserID');
        }
        set UserID(value: number | null) {
            this.Set('UserID', value);
        }
        /**
        * * Field Name: Category
        * * Display Name: Category
        * * SQL Data Type: nvarchar(100)
        */
        get Category(): string | null {  
            return this.Get('Category');
        }
        
        /**
        * * Field Name: User
        * * Display Name: User
        * * SQL Data Type: nvarchar(100)
        */
        get User(): string | null {  
            return this.Get('User');
        }
        

    }
        
    /**
     * Output Trigger Types - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: OutputTriggerType
     * * Base View: vwOutputTriggerTypes
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Output Trigger Types')
    export class OutputTriggerTypeEntity extends BaseEntity {
        /**
        * Loads the Output Trigger Types record from the database
        * @param ID: number - primary key value to load the Output Trigger Types record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof OutputTriggerTypeEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Output Trigger Types - AllowCreateAPI and AllowUpdateAPI are both set to 0 in the database.  Save is not allowed, so this method is generated to override the base class method and throw an error. To enable save for this entity, set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof OutputTriggerTypeEntity
        * @throws {Error} - Save is not allowed for Output Trigger Types, to enable it set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.
        */
        public async Save(options?: EntitySaveOptions) : Promise<boolean> {
            throw new Error('Save is not allowed for Output Trigger Types, to enable it set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.');
        } 
                
        /**
        * Output Trigger Types - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof OutputTriggerTypeEntity
        * @throws {Error} - Delete is not allowed for Output Trigger Types, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Output Trigger Types, to enable it set AllowDeleteAPI to 1 in the database.');
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

    }
        
    /**
     * Output Format Types - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: OutputFormatType
     * * Base View: vwOutputFormatTypes
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Output Format Types')
    export class OutputFormatTypeEntity extends BaseEntity {
        /**
        * Loads the Output Format Types record from the database
        * @param ID: number - primary key value to load the Output Format Types record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof OutputFormatTypeEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Output Format Types - AllowCreateAPI and AllowUpdateAPI are both set to 0 in the database.  Save is not allowed, so this method is generated to override the base class method and throw an error. To enable save for this entity, set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof OutputFormatTypeEntity
        * @throws {Error} - Save is not allowed for Output Format Types, to enable it set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.
        */
        public async Save(options?: EntitySaveOptions) : Promise<boolean> {
            throw new Error('Save is not allowed for Output Format Types, to enable it set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.');
        } 
                
        /**
        * Output Format Types - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof OutputFormatTypeEntity
        * @throws {Error} - Delete is not allowed for Output Format Types, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Output Format Types, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Field Name: DisplayFormat
        * * Display Name: Display Format
        * * SQL Data Type: nvarchar(MAX)
        */
        get DisplayFormat(): string | null {  
            return this.Get('DisplayFormat');
        }
        set DisplayFormat(value: string | null) {
            this.Set('DisplayFormat', value);
        }

    }
        
    /**
     * Output Delivery Types - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: OutputDeliveryType
     * * Base View: vwOutputDeliveryTypes
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Output Delivery Types')
    export class OutputDeliveryTypeEntity extends BaseEntity {
        /**
        * Loads the Output Delivery Types record from the database
        * @param ID: number - primary key value to load the Output Delivery Types record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof OutputDeliveryTypeEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Output Delivery Types - AllowCreateAPI and AllowUpdateAPI are both set to 0 in the database.  Save is not allowed, so this method is generated to override the base class method and throw an error. To enable save for this entity, set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof OutputDeliveryTypeEntity
        * @throws {Error} - Save is not allowed for Output Delivery Types, to enable it set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.
        */
        public async Save(options?: EntitySaveOptions) : Promise<boolean> {
            throw new Error('Save is not allowed for Output Delivery Types, to enable it set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.');
        } 
                
        /**
        * Output Delivery Types - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof OutputDeliveryTypeEntity
        * @throws {Error} - Delete is not allowed for Output Delivery Types, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Output Delivery Types, to enable it set AllowDeleteAPI to 1 in the database.');
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

    }
        
    /**
     * Reports - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: Report
     * * Base View: vwReports
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Reports')
    export class ReportEntity extends BaseEntity {
        /**
        * Loads the Reports record from the database
        * @param ID: number - primary key value to load the Reports record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof ReportEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
        * * Field Name: CategoryID
        * * Display Name: Category ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Report Categories (vwReportCategories.ID)
        */
        get CategoryID(): number | null {  
            return this.Get('CategoryID');
        }
        set CategoryID(value: number | null) {
            this.Set('CategoryID', value);
        }
        /**
        * * Field Name: UserID
        * * Display Name: User ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Users (vwUsers.ID)
        */
        get UserID(): number {  
            return this.Get('UserID');
        }
        set UserID(value: number) {
            this.Set('UserID', value);
        }
        /**
        * * Field Name: SharingScope
        * * Display Name: Sharing Scope
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Personal
        * * Value List Type: List
        * * Possible Values 
        *   * None
        *   * Specific
        *   * Everyone
        */
        get SharingScope(): 'None' | 'Specific' | 'Everyone' {  
            return this.Get('SharingScope');
        }
        set SharingScope(value: 'None' | 'Specific' | 'Everyone') {
            this.Set('SharingScope', value);
        }
        /**
        * * Field Name: ConversationID
        * * Display Name: Conversation ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Conversations (vwConversations.ID)
        */
        get ConversationID(): number | null {  
            return this.Get('ConversationID');
        }
        set ConversationID(value: number | null) {
            this.Set('ConversationID', value);
        }
        /**
        * * Field Name: ConversationDetailID
        * * Display Name: Conversation Detail ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Conversation Details (vwConversationDetails.ID)
        */
        get ConversationDetailID(): number | null {  
            return this.Get('ConversationDetailID');
        }
        set ConversationDetailID(value: number | null) {
            this.Set('ConversationDetailID', value);
        }
        /**
        * * Field Name: DataContextID
        * * Display Name: Data Context ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Data Contexts (vwDataContexts.ID)
        */
        get DataContextID(): number | null {  
            return this.Get('DataContextID');
        }
        set DataContextID(value: number | null) {
            this.Set('DataContextID', value);
        }
        /**
        * * Field Name: Configuration
        * * Display Name: Configuration
        * * SQL Data Type: nvarchar(MAX)
        */
        get Configuration(): string | null {  
            return this.Get('Configuration');
        }
        set Configuration(value: string | null) {
            this.Set('Configuration', value);
        }
        /**
        * * Field Name: OutputTriggerTypeID
        * * Display Name: Output Trigger Type ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Output Trigger Types (vwOutputTriggerTypes.ID)
        */
        get OutputTriggerTypeID(): number | null {  
            return this.Get('OutputTriggerTypeID');
        }
        set OutputTriggerTypeID(value: number | null) {
            this.Set('OutputTriggerTypeID', value);
        }
        /**
        * * Field Name: OutputFormatTypeID
        * * Display Name: Output Format Type ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Output Format Types (vwOutputFormatTypes.ID)
        */
        get OutputFormatTypeID(): number | null {  
            return this.Get('OutputFormatTypeID');
        }
        set OutputFormatTypeID(value: number | null) {
            this.Set('OutputFormatTypeID', value);
        }
        /**
        * * Field Name: OutputDeliveryTypeID
        * * Display Name: Output Delivery Type ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Output Delivery Types (vwOutputDeliveryTypes.ID)
        */
        get OutputDeliveryTypeID(): number | null {  
            return this.Get('OutputDeliveryTypeID');
        }
        set OutputDeliveryTypeID(value: number | null) {
            this.Set('OutputDeliveryTypeID', value);
        }
        /**
        * * Field Name: OutputEventID
        * * Display Name: Output Event ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Output Delivery Types (vwOutputDeliveryTypes.ID)
        */
        get OutputEventID(): number | null {  
            return this.Get('OutputEventID');
        }
        set OutputEventID(value: number | null) {
            this.Set('OutputEventID', value);
        }
        /**
        * * Field Name: OutputFrequency
        * * Display Name: Output Frequency
        * * SQL Data Type: nvarchar(50)
        */
        get OutputFrequency(): string | null {  
            return this.Get('OutputFrequency');
        }
        set OutputFrequency(value: string | null) {
            this.Set('OutputFrequency', value);
        }
        /**
        * * Field Name: OutputTargetEmail
        * * Display Name: Output Target Email
        * * SQL Data Type: nvarchar(255)
        */
        get OutputTargetEmail(): string | null {  
            return this.Get('OutputTargetEmail');
        }
        set OutputTargetEmail(value: string | null) {
            this.Set('OutputTargetEmail', value);
        }
        /**
        * * Field Name: OutputWorkflowID
        * * Display Name: Output Workflow ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Workflows (vwWorkflows.ID)
        */
        get OutputWorkflowID(): number | null {  
            return this.Get('OutputWorkflowID');
        }
        set OutputWorkflowID(value: number | null) {
            this.Set('OutputWorkflowID', value);
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
        * * Field Name: Category
        * * Display Name: Category
        * * SQL Data Type: nvarchar(100)
        */
        get Category(): string | null {  
            return this.Get('Category');
        }
        
        /**
        * * Field Name: User
        * * Display Name: User
        * * SQL Data Type: nvarchar(100)
        */
        get User(): string {  
            return this.Get('User');
        }
        
        /**
        * * Field Name: Conversation
        * * Display Name: Conversation
        * * SQL Data Type: nvarchar(100)
        */
        get Conversation(): string | null {  
            return this.Get('Conversation');
        }
        
        /**
        * * Field Name: DataContext
        * * Display Name: Data Context
        * * SQL Data Type: nvarchar(255)
        */
        get DataContext(): string | null {  
            return this.Get('DataContext');
        }
        
        /**
        * * Field Name: OutputTriggerType
        * * Display Name: Output Trigger Type
        * * SQL Data Type: nvarchar(255)
        */
        get OutputTriggerType(): string | null {  
            return this.Get('OutputTriggerType');
        }
        
        /**
        * * Field Name: OutputFormatType
        * * Display Name: Output Format Type
        * * SQL Data Type: nvarchar(255)
        */
        get OutputFormatType(): string | null {  
            return this.Get('OutputFormatType');
        }
        
        /**
        * * Field Name: OutputDeliveryType
        * * Display Name: Output Delivery Type
        * * SQL Data Type: nvarchar(255)
        */
        get OutputDeliveryType(): string | null {  
            return this.Get('OutputDeliveryType');
        }
        
        /**
        * * Field Name: OutputEvent
        * * Display Name: Output Event
        * * SQL Data Type: nvarchar(255)
        */
        get OutputEvent(): string | null {  
            return this.Get('OutputEvent');
        }
        
        /**
        * * Field Name: OutputWorkflow
        * * Display Name: Output Workflow
        * * SQL Data Type: nvarchar(100)
        */
        get OutputWorkflow(): string | null {  
            return this.Get('OutputWorkflow');
        }
        

    }
        
    /**
     * Report Snapshots - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: ReportSnapshot
     * * Base View: vwReportSnapshots
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Report Snapshots')
    export class ReportSnapshotEntity extends BaseEntity {
        /**
        * Loads the Report Snapshots record from the database
        * @param ID: number - primary key value to load the Report Snapshots record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof ReportSnapshotEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
        * * Field Name: ReportID
        * * Display Name: Report ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Reports (vwReports.ID)
        */
        get ReportID(): number {  
            return this.Get('ReportID');
        }
        set ReportID(value: number) {
            this.Set('ReportID', value);
        }
        /**
        * * Field Name: ResultSet
        * * Display Name: Result Set
        * * SQL Data Type: nvarchar(MAX)
        */
        get ResultSet(): string {  
            return this.Get('ResultSet');
        }
        set ResultSet(value: string) {
            this.Set('ResultSet', value);
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
        * * Field Name: UserID
        * * Display Name: User ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Users (vwUsers.ID)
        */
        get UserID(): number | null {  
            return this.Get('UserID');
        }
        set UserID(value: number | null) {
            this.Set('UserID', value);
        }
        /**
        * * Field Name: Report
        * * Display Name: Report
        * * SQL Data Type: nvarchar(255)
        */
        get Report(): string {  
            return this.Get('Report');
        }
        
        /**
        * * Field Name: User
        * * Display Name: User
        * * SQL Data Type: nvarchar(100)
        */
        get User(): string | null {  
            return this.Get('User');
        }
        

    }
        
    /**
     * Resource Types - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: ResourceType
     * * Base View: vwResourceTypes
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Resource Types')
    export class ResourceTypeEntity extends BaseEntity {
        /**
        * Loads the Resource Types record from the database
        * @param ID: number - primary key value to load the Resource Types record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof ResourceTypeEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Resource Types - AllowCreateAPI and AllowUpdateAPI are both set to 0 in the database.  Save is not allowed, so this method is generated to override the base class method and throw an error. To enable save for this entity, set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof ResourceTypeEntity
        * @throws {Error} - Save is not allowed for Resource Types, to enable it set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.
        */
        public async Save(options?: EntitySaveOptions) : Promise<boolean> {
            throw new Error('Save is not allowed for Resource Types, to enable it set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.');
        } 
                
        /**
        * Resource Types - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof ResourceTypeEntity
        * @throws {Error} - Delete is not allowed for Resource Types, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Resource Types, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * SQL Data Type: nvarchar(255)
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
        * * SQL Data Type: nvarchar(255)
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
        get Description(): string | null {  
            return this.Get('Description');
        }
        set Description(value: string | null) {
            this.Set('Description', value);
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
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)
        */
        get EntityID(): number | null {  
            return this.Get('EntityID');
        }
        set EntityID(value: number | null) {
            this.Set('EntityID', value);
        }
        /**
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_CreatedAt(): Date {  
            return this.Get('__mj_CreatedAt');
        }
        
        /**
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_UpdatedAt(): Date {  
            return this.Get('__mj_UpdatedAt');
        }
        
        /**
        * * Field Name: Entity
        * * Display Name: Entity
        * * SQL Data Type: nvarchar(255)
        * * Default Value: getutcdate()
        */
        get Entity(): string | null {  
            return this.Get('Entity');
        }
        

    }
        
    /**
     * Tags - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: Tag
     * * Base View: vwTags
     * * @description Tags are used to arbitrarily associate any record in any entity with addtional information.
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Tags')
    export class TagEntity extends BaseEntity {
        /**
        * Loads the Tags record from the database
        * @param ID: number - primary key value to load the Tags record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof TagEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Tags - AllowCreateAPI and AllowUpdateAPI are both set to 0 in the database.  Save is not allowed, so this method is generated to override the base class method and throw an error. To enable save for this entity, set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof TagEntity
        * @throws {Error} - Save is not allowed for Tags, to enable it set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.
        */
        public async Save(options?: EntitySaveOptions) : Promise<boolean> {
            throw new Error('Save is not allowed for Tags, to enable it set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.');
        } 
                
        /**
        * Tags - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof TagEntity
        * @throws {Error} - Delete is not allowed for Tags, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Tags, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * SQL Data Type: nvarchar(255)
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
        * * SQL Data Type: nvarchar(255)
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
        get Description(): string | null {  
            return this.Get('Description');
        }
        set Description(value: string | null) {
            this.Set('Description', value);
        }
        /**
        * * Field Name: ParentID
        * * Display Name: Parent ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Tags (vwTags.ID)
        */
        get ParentID(): number | null {  
            return this.Get('ParentID');
        }
        set ParentID(value: number | null) {
            this.Set('ParentID', value);
        }
        /**
        * * Field Name: Parent
        * * Display Name: Parent
        * * SQL Data Type: nvarchar(255)
        */
        get Parent(): string | null {  
            return this.Get('Parent');
        }
        

    }
        
    /**
     * Tagged Items - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: TaggedItem
     * * Base View: vwTaggedItems
     * * @description Tracks the links between any record in any entity with Tags
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Tagged Items')
    export class TaggedItemEntity extends BaseEntity {
        /**
        * Loads the Tagged Items record from the database
        * @param ID: number - primary key value to load the Tagged Items record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof TaggedItemEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Tagged Items - AllowCreateAPI and AllowUpdateAPI are both set to 0 in the database.  Save is not allowed, so this method is generated to override the base class method and throw an error. To enable save for this entity, set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof TaggedItemEntity
        * @throws {Error} - Save is not allowed for Tagged Items, to enable it set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.
        */
        public async Save(options?: EntitySaveOptions) : Promise<boolean> {
            throw new Error('Save is not allowed for Tagged Items, to enable it set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.');
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
        * * Field Name: TagID
        * * Display Name: Tag ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Tags (vwTags.ID)
        */
        get TagID(): number {  
            return this.Get('TagID');
        }
        set TagID(value: number) {
            this.Set('TagID', value);
        }
        /**
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)
        */
        get EntityID(): number {  
            return this.Get('EntityID');
        }
        set EntityID(value: number) {
            this.Set('EntityID', value);
        }
        /**
        * * Field Name: RecordID
        * * Display Name: Record ID
        * * SQL Data Type: nvarchar(255)
        */
        get RecordID(): string {  
            return this.Get('RecordID');
        }
        set RecordID(value: string) {
            this.Set('RecordID', value);
        }
        /**
        * * Field Name: Tag
        * * Display Name: Tag
        * * SQL Data Type: nvarchar(255)
        */
        get Tag(): string {  
            return this.Get('Tag');
        }
        
        /**
        * * Field Name: Entity
        * * Display Name: Entity
        * * SQL Data Type: nvarchar(255)
        */
        get Entity(): string {  
            return this.Get('Entity');
        }
        

    }
        
    /**
     * Workspaces - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: Workspace
     * * Base View: vwWorkspaces
     * * @description A user can have one or more workspaces
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Workspaces')
    export class WorkspaceEntity extends BaseEntity {
        /**
        * Loads the Workspaces record from the database
        * @param ID: number - primary key value to load the Workspaces record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof WorkspaceEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
        * * Field Name: UserID
        * * Display Name: User ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Users (vwUsers.ID)
        */
        get UserID(): number {  
            return this.Get('UserID');
        }
        set UserID(value: number) {
            this.Set('UserID', value);
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
        * * Field Name: User
        * * Display Name: User
        * * SQL Data Type: nvarchar(100)
        */
        get User(): string {  
            return this.Get('User');
        }
        

    }
        
    /**
     * Workspace Items - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: WorkspaceItem
     * * Base View: vwWorkspaceItems
     * * @description Tracks the resources that are active within a given worksapce
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Workspace Items')
    export class WorkspaceItemEntity extends BaseEntity {
        /**
        * Loads the Workspace Items record from the database
        * @param ID: number - primary key value to load the Workspace Items record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof WorkspaceItemEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
        * * Field Name: WorkSpaceID
        * * Display Name: Work Space ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Workspaces (vwWorkspaces.ID)
        */
        get WorkSpaceID(): number {  
            return this.Get('WorkSpaceID');
        }
        set WorkSpaceID(value: number) {
            this.Set('WorkSpaceID', value);
        }
        /**
        * * Field Name: ResourceTypeID
        * * Display Name: Resource Type ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Resource Types (vwResourceTypes.ID)
        */
        get ResourceTypeID(): number {  
            return this.Get('ResourceTypeID');
        }
        set ResourceTypeID(value: number) {
            this.Set('ResourceTypeID', value);
        }
        /**
        * * Field Name: ResourceRecordID
        * * Display Name: Resource Record ID
        * * SQL Data Type: nvarchar(2000)
        */
        get ResourceRecordID(): string | null {  
            return this.Get('ResourceRecordID');
        }
        set ResourceRecordID(value: string | null) {
            this.Set('ResourceRecordID', value);
        }
        /**
        * * Field Name: Sequence
        * * Display Name: Sequence
        * * SQL Data Type: int
        */
        get Sequence(): number {  
            return this.Get('Sequence');
        }
        set Sequence(value: number) {
            this.Set('Sequence', value);
        }
        /**
        * * Field Name: Configuration
        * * Display Name: Configuration
        * * SQL Data Type: nvarchar(MAX)
        */
        get Configuration(): string | null {  
            return this.Get('Configuration');
        }
        set Configuration(value: string | null) {
            this.Set('Configuration', value);
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
        * * Field Name: WorkSpace
        * * Display Name: Work Space
        * * SQL Data Type: nvarchar(255)
        */
        get WorkSpace(): string {  
            return this.Get('WorkSpace');
        }
        
        /**
        * * Field Name: ResourceType
        * * Display Name: Resource Type
        * * SQL Data Type: nvarchar(255)
        */
        get ResourceType(): string {  
            return this.Get('ResourceType');
        }
        

    }
        
    /**
     * Datasets - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: Dataset
     * * Base View: vwDatasets
     * * @description Cacheable sets of data that can span one or more items
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Datasets')
    export class DatasetEntity extends BaseEntity {
        /**
        * Loads the Datasets record from the database
        * @param ID: number - primary key value to load the Datasets record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof DatasetEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Datasets - AllowCreateAPI and AllowUpdateAPI are both set to 0 in the database.  Save is not allowed, so this method is generated to override the base class method and throw an error. To enable save for this entity, set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof DatasetEntity
        * @throws {Error} - Save is not allowed for Datasets, to enable it set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.
        */
        public async Save(options?: EntitySaveOptions) : Promise<boolean> {
            throw new Error('Save is not allowed for Datasets, to enable it set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.');
        } 
                
        /**
        * Datasets - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof DatasetEntity
        * @throws {Error} - Delete is not allowed for Datasets, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Datasets, to enable it set AllowDeleteAPI to 1 in the database.');
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
        get Description(): string | null {  
            return this.Get('Description');
        }
        set Description(value: string | null) {
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
     * Dataset Items - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: DatasetItem
     * * Base View: vwDatasetItems
     * * @description A single item in a Dataset and can be sourced from multiple methods.
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Dataset Items')
    export class DatasetItemEntity extends BaseEntity {
        /**
        * Loads the Dataset Items record from the database
        * @param ID: number - primary key value to load the Dataset Items record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof DatasetItemEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Dataset Items - AllowCreateAPI and AllowUpdateAPI are both set to 0 in the database.  Save is not allowed, so this method is generated to override the base class method and throw an error. To enable save for this entity, set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof DatasetItemEntity
        * @throws {Error} - Save is not allowed for Dataset Items, to enable it set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.
        */
        public async Save(options?: EntitySaveOptions) : Promise<boolean> {
            throw new Error('Save is not allowed for Dataset Items, to enable it set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.');
        } 
                
        /**
        * Dataset Items - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof DatasetItemEntity
        * @throws {Error} - Delete is not allowed for Dataset Items, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Dataset Items, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Field Name: DatasetName
        * * Display Name: Dataset Name
        * * SQL Data Type: nvarchar(50)
        * * Related Entity/Foreign Key: Datasets (vwDatasets.Name)
        */
        get DatasetName(): string | null {  
            return this.Get('DatasetName');
        }
        set DatasetName(value: string | null) {
            this.Set('DatasetName', value);
        }
        /**
        * * Field Name: Sequence
        * * Display Name: Sequence
        * * SQL Data Type: int
        * * Default Value: 0
        */
        get Sequence(): number {  
            return this.Get('Sequence');
        }
        set Sequence(value: number) {
            this.Set('Sequence', value);
        }
        /**
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)
        */
        get EntityID(): number {  
            return this.Get('EntityID');
        }
        set EntityID(value: number) {
            this.Set('EntityID', value);
        }
        /**
        * * Field Name: WhereClause
        * * Display Name: Where Clause
        * * SQL Data Type: nvarchar(MAX)
        */
        get WhereClause(): string | null {  
            return this.Get('WhereClause');
        }
        set WhereClause(value: string | null) {
            this.Set('WhereClause', value);
        }
        /**
        * * Field Name: DateFieldToCheck
        * * Display Name: Date Field To Check
        * * SQL Data Type: nvarchar(100)
        */
        get DateFieldToCheck(): string {  
            return this.Get('DateFieldToCheck');
        }
        set DateFieldToCheck(value: string) {
            this.Set('DateFieldToCheck', value);
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
        * * Field Name: Entity
        * * Display Name: Entity
        * * SQL Data Type: nvarchar(255)
        */
        get Entity(): string {  
            return this.Get('Entity');
        }
        

    }
        
    /**
     * Conversation Details - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: ConversationDetail
     * * Base View: vwConversationDetails
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Conversation Details')
    export class ConversationDetailEntity extends BaseEntity {
        /**
        * Loads the Conversation Details record from the database
        * @param ID: number - primary key value to load the Conversation Details record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof ConversationDetailEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
        * * Field Name: ConversationID
        * * Display Name: Conversation ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Conversations (vwConversations.ID)
        */
        get ConversationID(): number {  
            return this.Get('ConversationID');
        }
        set ConversationID(value: number) {
            this.Set('ConversationID', value);
        }
        /**
        * * Field Name: ExternalID
        * * Display Name: External ID
        * * SQL Data Type: nvarchar(100)
        */
        get ExternalID(): string | null {  
            return this.Get('ExternalID');
        }
        set ExternalID(value: string | null) {
            this.Set('ExternalID', value);
        }
        /**
        * * Field Name: Role
        * * Display Name: Role
        * * SQL Data Type: nvarchar(20)
        * * Default Value: user_name()
        * * Value List Type: List
        * * Possible Values 
        *   * User
        *   * AI
        *   * Error
        */
        get Role(): 'User' | 'AI' | 'Error' {  
            return this.Get('Role');
        }
        set Role(value: 'User' | 'AI' | 'Error') {
            this.Set('Role', value);
        }
        /**
        * * Field Name: Message
        * * Display Name: Message
        * * SQL Data Type: nvarchar(MAX)
        */
        get Message(): string {  
            return this.Get('Message');
        }
        set Message(value: string) {
            this.Set('Message', value);
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
        * * Field Name: HiddenToUser
        * * Display Name: Hidden To User
        * * SQL Data Type: bit
        * * Default Value: 0
        */
        get HiddenToUser(): boolean {  
            return this.Get('HiddenToUser');
        }
        set HiddenToUser(value: boolean) {
            this.Set('HiddenToUser', value);
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
        * * Field Name: Conversation
        * * Display Name: Conversation
        * * SQL Data Type: nvarchar(100)
        */
        get Conversation(): string | null {  
            return this.Get('Conversation');
        }
        

    }
        
    /**
     * Conversations - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: Conversation
     * * Base View: vwConversations
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Conversations')
    export class ConversationEntity extends BaseEntity {
        /**
        * Loads the Conversations record from the database
        * @param ID: number - primary key value to load the Conversations record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof ConversationEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
        * * Field Name: UserID
        * * Display Name: User ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Users (vwUsers.ID)
        */
        get UserID(): number {  
            return this.Get('UserID');
        }
        set UserID(value: number) {
            this.Set('UserID', value);
        }
        /**
        * * Field Name: ExternalID
        * * Display Name: External ID
        * * SQL Data Type: nvarchar(100)
        */
        get ExternalID(): string | null {  
            return this.Get('ExternalID');
        }
        set ExternalID(value: string | null) {
            this.Set('ExternalID', value);
        }
        /**
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(100)
        */
        get Name(): string | null {  
            return this.Get('Name');
        }
        set Name(value: string | null) {
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
        * * Field Name: Type
        * * Display Name: Type
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Skip
        */
        get Type(): string {  
            return this.Get('Type');
        }
        set Type(value: string) {
            this.Set('Type', value);
        }
        /**
        * * Field Name: IsArchived
        * * Display Name: Is Archived
        * * SQL Data Type: bit
        * * Default Value: 0
        */
        get IsArchived(): boolean {  
            return this.Get('IsArchived');
        }
        set IsArchived(value: boolean) {
            this.Set('IsArchived', value);
        }
        /**
        * * Field Name: LinkedEntityID
        * * Display Name: Linked Entity ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)
        */
        get LinkedEntityID(): number | null {  
            return this.Get('LinkedEntityID');
        }
        set LinkedEntityID(value: number | null) {
            this.Set('LinkedEntityID', value);
        }
        /**
        * * Field Name: LinkedRecordID
        * * Display Name: Linked Record ID
        * * SQL Data Type: nvarchar(500)
        */
        get LinkedRecordID(): string | null {  
            return this.Get('LinkedRecordID');
        }
        set LinkedRecordID(value: string | null) {
            this.Set('LinkedRecordID', value);
        }
        /**
        * * Field Name: DataContextID
        * * Display Name: Data Context ID
        * * SQL Data Type: int
        */
        get DataContextID(): number | null {  
            return this.Get('DataContextID');
        }
        set DataContextID(value: number | null) {
            this.Set('DataContextID', value);
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
        * * Field Name: User
        * * Display Name: User
        * * SQL Data Type: nvarchar(100)
        */
        get User(): string {  
            return this.Get('User');
        }
        
        /**
        * * Field Name: LinkedEntity
        * * Display Name: Linked Entity
        * * SQL Data Type: nvarchar(255)
        */
        get LinkedEntity(): string | null {  
            return this.Get('LinkedEntity');
        }
        

    }
        
    /**
     * User Notifications - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: UserNotification
     * * Base View: vwUserNotifications
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'User Notifications')
    export class UserNotificationEntity extends BaseEntity {
        /**
        * Loads the User Notifications record from the database
        * @param ID: number - primary key value to load the User Notifications record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof UserNotificationEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
        * * Field Name: UserID
        * * Display Name: User ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Users (vwUsers.ID)
        */
        get UserID(): number {  
            return this.Get('UserID');
        }
        set UserID(value: number) {
            this.Set('UserID', value);
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
        * * Field Name: Message
        * * Display Name: Message
        * * SQL Data Type: nvarchar(MAX)
        */
        get Message(): string | null {  
            return this.Get('Message');
        }
        set Message(value: string | null) {
            this.Set('Message', value);
        }
        /**
        * * Field Name: ResourceTypeID
        * * Display Name: Resource Type ID
        * * SQL Data Type: int
        */
        get ResourceTypeID(): number | null {  
            return this.Get('ResourceTypeID');
        }
        set ResourceTypeID(value: number | null) {
            this.Set('ResourceTypeID', value);
        }
        /**
        * * Field Name: ResourceRecordID
        * * Display Name: Resource Record ID
        * * SQL Data Type: int
        */
        get ResourceRecordID(): number | null {  
            return this.Get('ResourceRecordID');
        }
        set ResourceRecordID(value: number | null) {
            this.Set('ResourceRecordID', value);
        }
        /**
        * * Field Name: ResourceConfiguration
        * * Display Name: Resource Configuration
        * * SQL Data Type: nvarchar(MAX)
        */
        get ResourceConfiguration(): string | null {  
            return this.Get('ResourceConfiguration');
        }
        set ResourceConfiguration(value: string | null) {
            this.Set('ResourceConfiguration', value);
        }
        /**
        * * Field Name: Unread
        * * Display Name: Unread
        * * SQL Data Type: bit
        * * Default Value: 1
        */
        get Unread(): boolean {  
            return this.Get('Unread');
        }
        set Unread(value: boolean) {
            this.Set('Unread', value);
        }
        /**
        * * Field Name: ReadAt
        * * Display Name: Read At
        * * SQL Data Type: datetime
        */
        get ReadAt(): Date | null {  
            return this.Get('ReadAt');
        }
        set ReadAt(value: Date | null) {
            this.Set('ReadAt', value);
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
        * * Field Name: User
        * * Display Name: User
        * * SQL Data Type: nvarchar(100)
        */
        get User(): string {  
            return this.Get('User');
        }
        

    }
        
    /**
     * Schema Info - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: SchemaInfo
     * * Base View: vwSchemaInfos
     * * @description Tracks the schemas in the system and the ID ranges that are valid for entities within each schema.
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Schema Info')
    export class SchemaInfoEntity extends BaseEntity {
        /**
        * Loads the Schema Info record from the database
        * @param ID: number - primary key value to load the Schema Info record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof SchemaInfoEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Schema Info - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof SchemaInfoEntity
        * @throws {Error} - Delete is not allowed for Schema Info, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Schema Info, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Field Name: SchemaName
        * * Display Name: Schema Name
        * * SQL Data Type: nvarchar(50)
        */
        get SchemaName(): string {  
            return this.Get('SchemaName');
        }
        set SchemaName(value: string) {
            this.Set('SchemaName', value);
        }
        /**
        * * Field Name: EntityIDMin
        * * Display Name: Entity IDMin
        * * SQL Data Type: int
        */
        get EntityIDMin(): number {  
            return this.Get('EntityIDMin');
        }
        set EntityIDMin(value: number) {
            this.Set('EntityIDMin', value);
        }
        /**
        * * Field Name: EntityIDMax
        * * Display Name: Entity IDMax
        * * SQL Data Type: int
        */
        get EntityIDMax(): number {  
            return this.Get('EntityIDMax');
        }
        set EntityIDMax(value: number) {
            this.Set('EntityIDMax', value);
        }
        /**
        * * Field Name: Comments
        * * Display Name: Comments
        * * SQL Data Type: nvarchar(MAX)
        */
        get Comments(): string | null {  
            return this.Get('Comments');
        }
        set Comments(value: string | null) {
            this.Set('Comments', value);
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
     * Company Integration Record Maps - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: CompanyIntegrationRecordMap
     * * Base View: vwCompanyIntegrationRecordMaps
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Company Integration Record Maps')
    export class CompanyIntegrationRecordMapEntity extends BaseEntity {
        /**
        * Loads the Company Integration Record Maps record from the database
        * @param ID: number - primary key value to load the Company Integration Record Maps record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof CompanyIntegrationRecordMapEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Company Integration Record Maps - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof CompanyIntegrationRecordMapEntity
        * @throws {Error} - Delete is not allowed for Company Integration Record Maps, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Company Integration Record Maps, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Field Name: CompanyIntegrationID
        * * Display Name: Company Integration ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Company Integrations (vwCompanyIntegrations.ID)
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
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)
        */
        get EntityID(): number {  
            return this.Get('EntityID');
        }
        set EntityID(value: number) {
            this.Set('EntityID', value);
        }
        /**
        * * Field Name: EntityRecordID
        * * Display Name: Entity Record ID
        * * SQL Data Type: nvarchar(255)
        */
        get EntityRecordID(): string {  
            return this.Get('EntityRecordID');
        }
        set EntityRecordID(value: string) {
            this.Set('EntityRecordID', value);
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
        * * Field Name: Entity
        * * Display Name: Entity
        * * SQL Data Type: nvarchar(255)
        */
        get Entity(): string {  
            return this.Get('Entity');
        }
        

    }
        
    /**
     * Record Merge Logs - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: RecordMergeLog
     * * Base View: vwRecordMergeLogs
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Record Merge Logs')
    export class RecordMergeLogEntity extends BaseEntity {
        /**
        * Loads the Record Merge Logs record from the database
        * @param ID: number - primary key value to load the Record Merge Logs record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof RecordMergeLogEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Record Merge Logs - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof RecordMergeLogEntity
        * @throws {Error} - Delete is not allowed for Record Merge Logs, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Record Merge Logs, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)
        */
        get EntityID(): number {  
            return this.Get('EntityID');
        }
        set EntityID(value: number) {
            this.Set('EntityID', value);
        }
        /**
        * * Field Name: SurvivingRecordID
        * * Display Name: Surviving Record ID
        * * SQL Data Type: nvarchar(255)
        */
        get SurvivingRecordID(): string {  
            return this.Get('SurvivingRecordID');
        }
        set SurvivingRecordID(value: string) {
            this.Set('SurvivingRecordID', value);
        }
        /**
        * * Field Name: InitiatedByUserID
        * * Display Name: Initiated By User ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Users (vwUsers.ID)
        */
        get InitiatedByUserID(): number {  
            return this.Get('InitiatedByUserID');
        }
        set InitiatedByUserID(value: number) {
            this.Set('InitiatedByUserID', value);
        }
        /**
        * * Field Name: ApprovalStatus
        * * Display Name: Approval Status
        * * SQL Data Type: nvarchar(10)
        * * Default Value: Pending
        * * Value List Type: List
        * * Possible Values 
        *   * Pending
        *   * Approved
        *   * Rejected
        */
        get ApprovalStatus(): 'Pending' | 'Approved' | 'Rejected' {  
            return this.Get('ApprovalStatus');
        }
        set ApprovalStatus(value: 'Pending' | 'Approved' | 'Rejected') {
            this.Set('ApprovalStatus', value);
        }
        /**
        * * Field Name: ApprovedByUserID
        * * Display Name: Approved By User ID
        * * SQL Data Type: int
        */
        get ApprovedByUserID(): number | null {  
            return this.Get('ApprovedByUserID');
        }
        set ApprovedByUserID(value: number | null) {
            this.Set('ApprovedByUserID', value);
        }
        /**
        * * Field Name: ProcessingStatus
        * * Display Name: Processing Status
        * * SQL Data Type: nvarchar(10)
        * * Default Value: Pending
        * * Value List Type: List
        * * Possible Values 
        *   * Started
        *   * Complete
        *   * Error
        */
        get ProcessingStatus(): 'Started' | 'Complete' | 'Error' {  
            return this.Get('ProcessingStatus');
        }
        set ProcessingStatus(value: 'Started' | 'Complete' | 'Error') {
            this.Set('ProcessingStatus', value);
        }
        /**
        * * Field Name: ProcessingStartedAt
        * * Display Name: Processing Started At
        * * SQL Data Type: datetime
        * * Default Value: getdate()
        */
        get ProcessingStartedAt(): Date {  
            return this.Get('ProcessingStartedAt');
        }
        set ProcessingStartedAt(value: Date) {
            this.Set('ProcessingStartedAt', value);
        }
        /**
        * * Field Name: ProcessingEndedAt
        * * Display Name: Processing Ended At
        * * SQL Data Type: datetime
        */
        get ProcessingEndedAt(): Date | null {  
            return this.Get('ProcessingEndedAt');
        }
        set ProcessingEndedAt(value: Date | null) {
            this.Set('ProcessingEndedAt', value);
        }
        /**
        * * Field Name: ProcessingLog
        * * Display Name: Processing Log
        * * SQL Data Type: nvarchar(MAX)
        */
        get ProcessingLog(): string | null {  
            return this.Get('ProcessingLog');
        }
        set ProcessingLog(value: string | null) {
            this.Set('ProcessingLog', value);
        }
        /**
        * * Field Name: Comments
        * * Display Name: Comments
        * * SQL Data Type: nvarchar(MAX)
        */
        get Comments(): string | null {  
            return this.Get('Comments');
        }
        set Comments(value: string | null) {
            this.Set('Comments', value);
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
        get UpdatedAt(): Date | null {  
            return this.Get('UpdatedAt');
        }
        
        /**
        * * Field Name: Entity
        * * Display Name: Entity
        * * SQL Data Type: nvarchar(255)
        */
        get Entity(): string {  
            return this.Get('Entity');
        }
        
        /**
        * * Field Name: InitiatedByUser
        * * Display Name: Initiated By User
        * * SQL Data Type: nvarchar(100)
        */
        get InitiatedByUser(): string {  
            return this.Get('InitiatedByUser');
        }
        

    }
        
    /**
     * Record Merge Deletion Logs - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: RecordMergeDeletionLog
     * * Base View: vwRecordMergeDeletionLogs
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Record Merge Deletion Logs')
    export class RecordMergeDeletionLogEntity extends BaseEntity {
        /**
        * Loads the Record Merge Deletion Logs record from the database
        * @param ID: number - primary key value to load the Record Merge Deletion Logs record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof RecordMergeDeletionLogEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Record Merge Deletion Logs - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof RecordMergeDeletionLogEntity
        * @throws {Error} - Delete is not allowed for Record Merge Deletion Logs, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Record Merge Deletion Logs, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Field Name: RecordMergeLogID
        * * Display Name: Record Merge Log ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Record Merge Logs (vwRecordMergeLogs.ID)
        */
        get RecordMergeLogID(): number {  
            return this.Get('RecordMergeLogID');
        }
        set RecordMergeLogID(value: number) {
            this.Set('RecordMergeLogID', value);
        }
        /**
        * * Field Name: DeletedRecordID
        * * Display Name: Deleted Record ID
        * * SQL Data Type: nvarchar(255)
        */
        get DeletedRecordID(): string {  
            return this.Get('DeletedRecordID');
        }
        set DeletedRecordID(value: string) {
            this.Set('DeletedRecordID', value);
        }
        /**
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(10)
        * * Default Value: Pending
        * * Value List Type: List
        * * Possible Values 
        *   * Pending
        *   * Complete
        *   * Error
        */
        get Status(): 'Pending' | 'Complete' | 'Error' {  
            return this.Get('Status');
        }
        set Status(value: 'Pending' | 'Complete' | 'Error') {
            this.Set('Status', value);
        }
        /**
        * * Field Name: ProcessingLog
        * * Display Name: Processing Log
        * * SQL Data Type: nvarchar(MAX)
        */
        get ProcessingLog(): string | null {  
            return this.Get('ProcessingLog');
        }
        set ProcessingLog(value: string | null) {
            this.Set('ProcessingLog', value);
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
     * Query Fields - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: QueryField
     * * Base View: vwQueryFields
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Query Fields')
    export class QueryFieldEntity extends BaseEntity {
        /**
        * Loads the Query Fields record from the database
        * @param ID: number - primary key value to load the Query Fields record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof QueryFieldEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Query Fields - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof QueryFieldEntity
        * @throws {Error} - Delete is not allowed for Query Fields, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Query Fields, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Field Name: QueryID
        * * Display Name: Query ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Queries (vwQueries.ID)
        */
        get QueryID(): number {  
            return this.Get('QueryID');
        }
        set QueryID(value: number) {
            this.Set('QueryID', value);
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
        * * Field Name: Sequence
        * * Display Name: Sequence
        * * SQL Data Type: int
        */
        get Sequence(): number {  
            return this.Get('Sequence');
        }
        set Sequence(value: number) {
            this.Set('Sequence', value);
        }
        /**
        * * Field Name: SQLBaseType
        * * Display Name: SQLBase Type
        * * SQL Data Type: nvarchar(50)
        * * Description: The base type, not including parameters, in SQL. For example this field would be nvarchar or decimal, and wouldn't include type parameters. The SQLFullType field provides that information.
        */
        get SQLBaseType(): string {  
            return this.Get('SQLBaseType');
        }
        set SQLBaseType(value: string) {
            this.Set('SQLBaseType', value);
        }
        /**
        * * Field Name: SQLFullType
        * * Display Name: SQLFull Type
        * * SQL Data Type: nvarchar(100)
        * * Description: The full SQL type for the field, for example datetime or nvarchar(10) etc.
        */
        get SQLFullType(): string {  
            return this.Get('SQLFullType');
        }
        set SQLFullType(value: string) {
            this.Set('SQLFullType', value);
        }
        /**
        * * Field Name: SourceEntityID
        * * Display Name: Source Entity ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)
        */
        get SourceEntityID(): number | null {  
            return this.Get('SourceEntityID');
        }
        set SourceEntityID(value: number | null) {
            this.Set('SourceEntityID', value);
        }
        /**
        * * Field Name: SourceFieldName
        * * Display Name: Source Field Name
        * * SQL Data Type: nvarchar(255)
        */
        get SourceFieldName(): string | null {  
            return this.Get('SourceFieldName');
        }
        set SourceFieldName(value: string | null) {
            this.Set('SourceFieldName', value);
        }
        /**
        * * Field Name: IsComputed
        * * Display Name: Is Computed
        * * SQL Data Type: bit
        * * Default Value: 0
        */
        get IsComputed(): boolean {  
            return this.Get('IsComputed');
        }
        set IsComputed(value: boolean) {
            this.Set('IsComputed', value);
        }
        /**
        * * Field Name: ComputationDescription
        * * Display Name: Computation Description
        * * SQL Data Type: nvarchar(MAX)
        */
        get ComputationDescription(): string | null {  
            return this.Get('ComputationDescription');
        }
        set ComputationDescription(value: string | null) {
            this.Set('ComputationDescription', value);
        }
        /**
        * * Field Name: IsSummary
        * * Display Name: Is Summary
        * * SQL Data Type: bit
        * * Default Value: 0
        */
        get IsSummary(): boolean {  
            return this.Get('IsSummary');
        }
        set IsSummary(value: boolean) {
            this.Set('IsSummary', value);
        }
        /**
        * * Field Name: SummaryDescription
        * * Display Name: Summary Description
        * * SQL Data Type: nvarchar(MAX)
        */
        get SummaryDescription(): string | null {  
            return this.Get('SummaryDescription');
        }
        set SummaryDescription(value: string | null) {
            this.Set('SummaryDescription', value);
        }
        /**
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_CreatedAt(): Date {  
            return this.Get('__mj_CreatedAt');
        }
        
        /**
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_UpdatedAt(): Date {  
            return this.Get('__mj_UpdatedAt');
        }
        
        /**
        * * Field Name: Query
        * * Display Name: Query
        * * SQL Data Type: nvarchar(255)
        * * Default Value: getutcdate()
        */
        get Query(): string {  
            return this.Get('Query');
        }
        
        /**
        * * Field Name: SourceEntity
        * * Display Name: Source Entity
        * * SQL Data Type: nvarchar(255)
        * * Default Value: getutcdate()
        */
        get SourceEntity(): string | null {  
            return this.Get('SourceEntity');
        }
        

    }
        
    /**
     * Query Categories - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: QueryCategory
     * * Base View: vwQueryCategories
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Query Categories')
    export class QueryCategoryEntity extends BaseEntity {
        /**
        * Loads the Query Categories record from the database
        * @param ID: number - primary key value to load the Query Categories record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof QueryCategoryEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
        * * Field Name: ParentID
        * * Display Name: Parent ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Query Categories (vwQueryCategories.ID)
        */
        get ParentID(): number | null {  
            return this.Get('ParentID');
        }
        set ParentID(value: number | null) {
            this.Set('ParentID', value);
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
        * * Field Name: UserID
        * * Display Name: User ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Users (vwUsers.ID)
        */
        get UserID(): number {  
            return this.Get('UserID');
        }
        set UserID(value: number) {
            this.Set('UserID', value);
        }
        /**
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_CreatedAt(): Date {  
            return this.Get('__mj_CreatedAt');
        }
        
        /**
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_UpdatedAt(): Date {  
            return this.Get('__mj_UpdatedAt');
        }
        
        /**
        * * Field Name: Parent
        * * Display Name: Parent
        * * SQL Data Type: nvarchar(50)
        * * Default Value: getutcdate()
        */
        get Parent(): string | null {  
            return this.Get('Parent');
        }
        
        /**
        * * Field Name: User
        * * Display Name: User
        * * SQL Data Type: nvarchar(100)
        * * Default Value: getutcdate()
        */
        get User(): string {  
            return this.Get('User');
        }
        

    }
        
    /**
     * Queries - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: Query
     * * Base View: vwQueries
     * * @description Catalog of stored queries. This is useful for any arbitrary query that is known to be performant and correct and can be reused. Queries can be viewed/run by a user, used programatically via RunQuery, and also used by AI systems for improved reliability instead of dynamically generated SQL. Queries can also improve security since they store the SQL instead of using dynamic SQL.
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Queries')
    export class QueryEntity extends BaseEntity {
        /**
        * Loads the Queries record from the database
        * @param ID: number - primary key value to load the Queries record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof QueryEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Queries - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof QueryEntity
        * @throws {Error} - Delete is not allowed for Queries, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Queries, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * SQL Data Type: nvarchar(255)
        */
        get Name(): string {  
            return this.Get('Name');
        }
        set Name(value: string) {
            this.Set('Name', value);
        }
        /**
        * * Field Name: UserQuestion
        * * Display Name: User Question
        * * SQL Data Type: nvarchar(MAX)
        */
        get UserQuestion(): string | null {  
            return this.Get('UserQuestion');
        }
        set UserQuestion(value: string | null) {
            this.Set('UserQuestion', value);
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
        * * Field Name: CategoryID
        * * Display Name: Category ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Query Categories (vwQueryCategories.ID)
        */
        get CategoryID(): number | null {  
            return this.Get('CategoryID');
        }
        set CategoryID(value: number | null) {
            this.Set('CategoryID', value);
        }
        /**
        * * Field Name: SQL
        * * Display Name: SQL
        * * SQL Data Type: nvarchar(MAX)
        */
        get SQL(): string | null {  
            return this.Get('SQL');
        }
        set SQL(value: string | null) {
            this.Set('SQL', value);
        }
        /**
        * * Field Name: TechnicalDescription
        * * Display Name: Technical Description
        * * SQL Data Type: nvarchar(MAX)
        */
        get TechnicalDescription(): string | null {  
            return this.Get('TechnicalDescription');
        }
        set TechnicalDescription(value: string | null) {
            this.Set('TechnicalDescription', value);
        }
        /**
        * * Field Name: OriginalSQL
        * * Display Name: Original SQL
        * * SQL Data Type: nvarchar(MAX)
        */
        get OriginalSQL(): string | null {  
            return this.Get('OriginalSQL');
        }
        set OriginalSQL(value: string | null) {
            this.Set('OriginalSQL', value);
        }
        /**
        * * Field Name: Feedback
        * * Display Name: Feedback
        * * SQL Data Type: nvarchar(MAX)
        */
        get Feedback(): string | null {  
            return this.Get('Feedback');
        }
        set Feedback(value: string | null) {
            this.Set('Feedback', value);
        }
        /**
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(15)
        * * Default Value: Pending
        * * Value List Type: List
        * * Possible Values 
        *   * Pending
        *   * Approved
        *   * Rejected
        *   * Expired
        */
        get Status(): 'Pending' | 'Approved' | 'Rejected' | 'Expired' {  
            return this.Get('Status');
        }
        set Status(value: 'Pending' | 'Approved' | 'Rejected' | 'Expired') {
            this.Set('Status', value);
        }
        /**
        * * Field Name: QualityRank
        * * Display Name: Quality Rank
        * * SQL Data Type: int
        * * Default Value: 0
        * * Description: Value indicating the quality of the query, higher values mean a better quality
        */
        get QualityRank(): number | null {  
            return this.Get('QualityRank');
        }
        set QualityRank(value: number | null) {
            this.Set('QualityRank', value);
        }
        /**
        * * Field Name: ExecutionCostRank
        * * Display Name: Execution Cost Rank
        * * SQL Data Type: int
        * * Description: Higher numbers indicate more execution overhead/time required. Useful for planning which queries to use in various scenarios.
        */
        get ExecutionCostRank(): number | null {  
            return this.Get('ExecutionCostRank');
        }
        set ExecutionCostRank(value: number | null) {
            this.Set('ExecutionCostRank', value);
        }
        /**
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_CreatedAt(): Date {  
            return this.Get('__mj_CreatedAt');
        }
        
        /**
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_UpdatedAt(): Date {  
            return this.Get('__mj_UpdatedAt');
        }
        
        /**
        * * Field Name: Category
        * * Display Name: Category
        * * SQL Data Type: nvarchar(50)
        * * Default Value: getutcdate()
        */
        get Category(): string | null {  
            return this.Get('Category');
        }
        

    }
        
    /**
     * Query Permissions - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: QueryPermission
     * * Base View: vwQueryPermissions
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Query Permissions')
    export class QueryPermissionEntity extends BaseEntity {
        /**
        * Loads the Query Permissions record from the database
        * @param ID: number - primary key value to load the Query Permissions record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof QueryPermissionEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Query Permissions - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof QueryPermissionEntity
        * @throws {Error} - Delete is not allowed for Query Permissions, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Query Permissions, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Field Name: QueryID
        * * Display Name: Query ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Queries (vwQueries.ID)
        */
        get QueryID(): number {  
            return this.Get('QueryID');
        }
        set QueryID(value: number) {
            this.Set('QueryID', value);
        }
        /**
        * * Field Name: RoleName
        * * Display Name: Role Name
        * * SQL Data Type: nvarchar(50)
        * * Related Entity/Foreign Key: Roles (vwRoles.Name)
        */
        get RoleName(): string {  
            return this.Get('RoleName');
        }
        set RoleName(value: string) {
            this.Set('RoleName', value);
        }
        /**
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_CreatedAt(): Date {  
            return this.Get('__mj_CreatedAt');
        }
        
        /**
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_UpdatedAt(): Date {  
            return this.Get('__mj_UpdatedAt');
        }
        

    }
        
    /**
     * Vector Indexes - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: VectorIndex
     * * Base View: vwVectorIndexes
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Vector Indexes')
    export class VectorIndexEntity extends BaseEntity {
        /**
        * Loads the Vector Indexes record from the database
        * @param ID: number - primary key value to load the Vector Indexes record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof VectorIndexEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Vector Indexes - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof VectorIndexEntity
        * @throws {Error} - Delete is not allowed for Vector Indexes, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Vector Indexes, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Field Name: VectorDatabaseID
        * * Display Name: Vector Database ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Vector Databases (vwVectorDatabases.ID)
        */
        get VectorDatabaseID(): number {  
            return this.Get('VectorDatabaseID');
        }
        set VectorDatabaseID(value: number) {
            this.Set('VectorDatabaseID', value);
        }
        /**
        * * Field Name: EmbeddingModelID
        * * Display Name: Embedding Model ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: AI Models (vwAIModels.ID)
        */
        get EmbeddingModelID(): number {  
            return this.Get('EmbeddingModelID');
        }
        set EmbeddingModelID(value: number) {
            this.Set('EmbeddingModelID', value);
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
        * * Field Name: VectorDatabase
        * * Display Name: Vector Database
        * * SQL Data Type: nvarchar(100)
        */
        get VectorDatabase(): string {  
            return this.Get('VectorDatabase');
        }
        
        /**
        * * Field Name: EmbeddingModel
        * * Display Name: Embedding Model
        * * SQL Data Type: nvarchar(50)
        */
        get EmbeddingModel(): string {  
            return this.Get('EmbeddingModel');
        }
        

    }
        
    /**
     * Entity Document Types - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: EntityDocumentType
     * * Base View: vwEntityDocumentTypes
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Entity Document Types')
    export class EntityDocumentTypeEntity extends BaseEntity {
        /**
        * Loads the Entity Document Types record from the database
        * @param ID: number - primary key value to load the Entity Document Types record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof EntityDocumentTypeEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Entity Document Types - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof EntityDocumentTypeEntity
        * @throws {Error} - Delete is not allowed for Entity Document Types, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Entity Document Types, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_CreatedAt(): Date {  
            return this.Get('__mj_CreatedAt');
        }
        
        /**
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_UpdatedAt(): Date {  
            return this.Get('__mj_UpdatedAt');
        }
        

    }
        
    /**
     * Entity Document Runs - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: EntityDocumentRun
     * * Base View: vwEntityDocumentRuns
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Entity Document Runs')
    export class EntityDocumentRunEntity extends BaseEntity {
        /**
        * Loads the Entity Document Runs record from the database
        * @param ID: number - primary key value to load the Entity Document Runs record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof EntityDocumentRunEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Entity Document Runs - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof EntityDocumentRunEntity
        * @throws {Error} - Delete is not allowed for Entity Document Runs, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Entity Document Runs, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Field Name: EntityDocumentID
        * * Display Name: Entity Document ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Entity Documents (vwEntityDocuments.ID)
        */
        get EntityDocumentID(): number {  
            return this.Get('EntityDocumentID');
        }
        set EntityDocumentID(value: number) {
            this.Set('EntityDocumentID', value);
        }
        /**
        * * Field Name: StartedAt
        * * Display Name: Started At
        * * SQL Data Type: datetime
        */
        get StartedAt(): Date | null {  
            return this.Get('StartedAt');
        }
        set StartedAt(value: Date | null) {
            this.Set('StartedAt', value);
        }
        /**
        * * Field Name: EndedAt
        * * Display Name: Ended At
        * * SQL Data Type: datetime
        */
        get EndedAt(): Date | null {  
            return this.Get('EndedAt');
        }
        set EndedAt(value: Date | null) {
            this.Set('EndedAt', value);
        }
        /**
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(15)
        * * Default Value: Pending
        * * Value List Type: List
        * * Possible Values 
        *   * Pending
        *   * Complete
        *   * Failed
        * * Description: Can be Pending, In Progress, Completed, or Failed
        */
        get Status(): 'Pending' | 'Complete' | 'Failed' {  
            return this.Get('Status');
        }
        set Status(value: 'Pending' | 'Complete' | 'Failed') {
            this.Set('Status', value);
        }
        /**
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_CreatedAt(): Date {  
            return this.Get('__mj_CreatedAt');
        }
        
        /**
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_UpdatedAt(): Date {  
            return this.Get('__mj_UpdatedAt');
        }
        
        /**
        * * Field Name: EntityDocument
        * * Display Name: Entity Document
        * * SQL Data Type: nvarchar(250)
        * * Default Value: getutcdate()
        */
        get EntityDocument(): string {  
            return this.Get('EntityDocument');
        }
        

    }
        
    /**
     * Vector Databases - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: VectorDatabase
     * * Base View: vwVectorDatabases
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Vector Databases')
    export class VectorDatabaseEntity extends BaseEntity {
        /**
        * Loads the Vector Databases record from the database
        * @param ID: number - primary key value to load the Vector Databases record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof VectorDatabaseEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Vector Databases - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof VectorDatabaseEntity
        * @throws {Error} - Delete is not allowed for Vector Databases, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Vector Databases, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Field Name: DefaultURL
        * * Display Name: Default URL
        * * SQL Data Type: nvarchar(255)
        */
        get DefaultURL(): string | null {  
            return this.Get('DefaultURL');
        }
        set DefaultURL(value: string | null) {
            this.Set('DefaultURL', value);
        }
        /**
        * * Field Name: ClassKey
        * * Display Name: Class Key
        * * SQL Data Type: nvarchar(100)
        */
        get ClassKey(): string | null {  
            return this.Get('ClassKey');
        }
        set ClassKey(value: string | null) {
            this.Set('ClassKey', value);
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
     * Entity Record Documents - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: EntityRecordDocument
     * * Base View: vwEntityRecordDocuments
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Entity Record Documents')
    export class EntityRecordDocumentEntity extends BaseEntity {
        /**
        * Loads the Entity Record Documents record from the database
        * @param ID: number - primary key value to load the Entity Record Documents record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof EntityRecordDocumentEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Entity Record Documents - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof EntityRecordDocumentEntity
        * @throws {Error} - Delete is not allowed for Entity Record Documents, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Entity Record Documents, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)
        */
        get EntityID(): number {  
            return this.Get('EntityID');
        }
        set EntityID(value: number) {
            this.Set('EntityID', value);
        }
        /**
        * * Field Name: RecordID
        * * Display Name: Record ID
        * * SQL Data Type: nvarchar(255)
        */
        get RecordID(): string {  
            return this.Get('RecordID');
        }
        set RecordID(value: string) {
            this.Set('RecordID', value);
        }
        /**
        * * Field Name: DocumentText
        * * Display Name: Document Text
        * * SQL Data Type: nvarchar(MAX)
        */
        get DocumentText(): string | null {  
            return this.Get('DocumentText');
        }
        set DocumentText(value: string | null) {
            this.Set('DocumentText', value);
        }
        /**
        * * Field Name: VectorIndexID
        * * Display Name: Vector Index ID
        * * SQL Data Type: int
        */
        get VectorIndexID(): number {  
            return this.Get('VectorIndexID');
        }
        set VectorIndexID(value: number) {
            this.Set('VectorIndexID', value);
        }
        /**
        * * Field Name: VectorID
        * * Display Name: Vector ID
        * * SQL Data Type: nvarchar(50)
        */
        get VectorID(): string | null {  
            return this.Get('VectorID');
        }
        set VectorID(value: string | null) {
            this.Set('VectorID', value);
        }
        /**
        * * Field Name: VectorJSON
        * * Display Name: Vector JSON
        * * SQL Data Type: nvarchar(MAX)
        */
        get VectorJSON(): string | null {  
            return this.Get('VectorJSON');
        }
        set VectorJSON(value: string | null) {
            this.Set('VectorJSON', value);
        }
        /**
        * * Field Name: EntityRecordUpdatedAt
        * * Display Name: Entity Record Updated At
        * * SQL Data Type: datetime
        */
        get EntityRecordUpdatedAt(): Date {  
            return this.Get('EntityRecordUpdatedAt');
        }
        set EntityRecordUpdatedAt(value: Date) {
            this.Set('EntityRecordUpdatedAt', value);
        }
        /**
        * * Field Name: EntityDocumentID
        * * Display Name: Entity Document ID
        * * SQL Data Type: int
        */
        get EntityDocumentID(): number {  
            return this.Get('EntityDocumentID');
        }
        set EntityDocumentID(value: number) {
            this.Set('EntityDocumentID', value);
        }
        /**
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_CreatedAt(): Date {  
            return this.Get('__mj_CreatedAt');
        }
        
        /**
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_UpdatedAt(): Date {  
            return this.Get('__mj_UpdatedAt');
        }
        

    }
        
    /**
     * Entity Documents - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: EntityDocument
     * * Base View: vwEntityDocuments
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Entity Documents')
    export class EntityDocumentEntity extends BaseEntity {
        /**
        * Loads the Entity Documents record from the database
        * @param ID: number - primary key value to load the Entity Documents record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof EntityDocumentEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Entity Documents - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof EntityDocumentEntity
        * @throws {Error} - Delete is not allowed for Entity Documents, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Entity Documents, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * SQL Data Type: nvarchar(250)
        */
        get Name(): string {  
            return this.Get('Name');
        }
        set Name(value: string) {
            this.Set('Name', value);
        }
        /**
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)
        */
        get EntityID(): number {  
            return this.Get('EntityID');
        }
        set EntityID(value: number) {
            this.Set('EntityID', value);
        }
        /**
        * * Field Name: TypeID
        * * Display Name: Type ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Entity Document Types (vwEntityDocumentTypes.ID)
        */
        get TypeID(): number {  
            return this.Get('TypeID');
        }
        set TypeID(value: number) {
            this.Set('TypeID', value);
        }
        /**
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(15)
        * * Default Value: Active
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
        * * Field Name: Template
        * * Display Name: Template
        * * SQL Data Type: nvarchar(MAX)
        */
        get Template(): string | null {  
            return this.Get('Template');
        }
        set Template(value: string | null) {
            this.Set('Template', value);
        }
        /**
        * * Field Name: VectorDatabaseID
        * * Display Name: Vector Database ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Vector Databases (vwVectorDatabases.ID)
        */
        get VectorDatabaseID(): number {  
            return this.Get('VectorDatabaseID');
        }
        set VectorDatabaseID(value: number) {
            this.Set('VectorDatabaseID', value);
        }
        /**
        * * Field Name: AIModelID
        * * Display Name: AIModel ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: AI Models (vwAIModels.ID)
        */
        get AIModelID(): number {  
            return this.Get('AIModelID');
        }
        set AIModelID(value: number) {
            this.Set('AIModelID', value);
        }
        /**
        * * Field Name: PotentialMatchThreshold
        * * Display Name: Potential Match Threshold
        * * SQL Data Type: numeric(12, 11)
        * * Default Value: 1
        * * Description: Value between 0 and 1 that determines what is considered a potential matching record. Value must be <= AbsoluteMatchThreshold. This is primarily used for duplicate detection but can be used for other applications as well where matching is relevant.
        */
        get PotentialMatchThreshold(): number {  
            return this.Get('PotentialMatchThreshold');
        }
        set PotentialMatchThreshold(value: number) {
            this.Set('PotentialMatchThreshold', value);
        }
        /**
        * * Field Name: AbsoluteMatchThreshold
        * * Display Name: Absolute Match Threshold
        * * SQL Data Type: numeric(12, 11)
        * * Default Value: 1
        * * Description: Value between 0 and 1 that determines what is considered an absolute matching record. Value must be >= PotentialMatchThreshold. This is primarily used for duplicate detection but can be used for other applications as well where matching is relevant.
        */
        get AbsoluteMatchThreshold(): number {  
            return this.Get('AbsoluteMatchThreshold');
        }
        set AbsoluteMatchThreshold(value: number) {
            this.Set('AbsoluteMatchThreshold', value);
        }
        /**
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_CreatedAt(): Date {  
            return this.Get('__mj_CreatedAt');
        }
        
        /**
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_UpdatedAt(): Date {  
            return this.Get('__mj_UpdatedAt');
        }
        
        /**
        * * Field Name: Entity
        * * Display Name: Entity
        * * SQL Data Type: nvarchar(255)
        * * Default Value: getutcdate()
        */
        get Entity(): string {  
            return this.Get('Entity');
        }
        
        /**
        * * Field Name: Type
        * * Display Name: Type
        * * SQL Data Type: nvarchar(100)
        * * Default Value: getutcdate()
        */
        get Type(): string {  
            return this.Get('Type');
        }
        

    }
        
    /**
     * Data Context Items - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: DataContextItem
     * * Base View: vwDataContextItems
     * * @description Data Context Items store information about each item within a Data Context. Each item stores a link to a view, query, or raw sql statement and can optionally cache the JSON representing the last run of that data object as well.
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Data Context Items')
    export class DataContextItemEntity extends BaseEntity {
        /**
        * Loads the Data Context Items record from the database
        * @param ID: number - primary key value to load the Data Context Items record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof DataContextItemEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
        * * Field Name: DataContextID
        * * Display Name: Data Context ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Data Contexts (vwDataContexts.ID)
        * * Description: Foreign key to the DataContext table
        */
        get DataContextID(): number {  
            return this.Get('DataContextID');
        }
        set DataContextID(value: number) {
            this.Set('DataContextID', value);
        }
        /**
        * * Field Name: Type
        * * Display Name: Type
        * * SQL Data Type: nvarchar(50)
        * * Value List Type: List
        * * Possible Values 
        *   * view
        *   * sql
        *   * query
        *   * single_record
        *   * full_entity
        * * Description: The type of the item, either "view", "query", "full_entity", "single_record", or "sql"
        */
        get Type(): 'view' | 'sql' | 'query' | 'single_record' | 'full_entity' {  
            return this.Get('Type');
        }
        set Type(value: 'view' | 'sql' | 'query' | 'single_record' | 'full_entity') {
            this.Set('Type', value);
        }
        /**
        * * Field Name: ViewID
        * * Display Name: View ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: User Views (vwUserViews.ID)
        * * Description: Only used if Type='view'
        */
        get ViewID(): number | null {  
            return this.Get('ViewID');
        }
        set ViewID(value: number | null) {
            this.Set('ViewID', value);
        }
        /**
        * * Field Name: QueryID
        * * Display Name: Query ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Queries (vwQueries.ID)
        * * Description: Only used if Type='query'
        */
        get QueryID(): number | null {  
            return this.Get('QueryID');
        }
        set QueryID(value: number | null) {
            this.Set('QueryID', value);
        }
        /**
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)
        * * Description: Used if type='full_entity' or type='single_record'
        */
        get EntityID(): number | null {  
            return this.Get('EntityID');
        }
        set EntityID(value: number | null) {
            this.Set('EntityID', value);
        }
        /**
        * * Field Name: RecordID
        * * Display Name: Record ID
        * * SQL Data Type: nvarchar(255)
        * * Description: The Primary Key value for the record, only used when Type='single_record'
        */
        get RecordID(): string | null {  
            return this.Get('RecordID');
        }
        set RecordID(value: string | null) {
            this.Set('RecordID', value);
        }
        /**
        * * Field Name: SQL
        * * Display Name: SQL
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Only used when Type=sql
        */
        get SQL(): string | null {  
            return this.Get('SQL');
        }
        set SQL(value: string | null) {
            this.Set('SQL', value);
        }
        /**
        * * Field Name: DataJSON
        * * Display Name: Data JSON
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Optionally used to cache results of an item. This can be used for performance optimization, and also for having snapshots of data for historical comparisons.
        */
        get DataJSON(): string | null {  
            return this.Get('DataJSON');
        }
        set DataJSON(value: string | null) {
            this.Set('DataJSON', value);
        }
        /**
        * * Field Name: LastRefreshedAt
        * * Display Name: Last Refreshed At
        * * SQL Data Type: datetime
        * * Description: If DataJSON is populated, this field will show the date the the data was captured
        */
        get LastRefreshedAt(): Date | null {  
            return this.Get('LastRefreshedAt');
        }
        set LastRefreshedAt(value: Date | null) {
            this.Set('LastRefreshedAt', value);
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
        * * Field Name: DataContext
        * * Display Name: Data Context
        * * SQL Data Type: nvarchar(255)
        */
        get DataContext(): string {  
            return this.Get('DataContext');
        }
        
        /**
        * * Field Name: View
        * * Display Name: View
        * * SQL Data Type: nvarchar(100)
        */
        get View(): string | null {  
            return this.Get('View');
        }
        
        /**
        * * Field Name: Query
        * * Display Name: Query
        * * SQL Data Type: nvarchar(255)
        */
        get Query(): string | null {  
            return this.Get('Query');
        }
        
        /**
        * * Field Name: Entity
        * * Display Name: Entity
        * * SQL Data Type: nvarchar(255)
        */
        get Entity(): string | null {  
            return this.Get('Entity');
        }
        

    }
        
    /**
     * Data Contexts - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: DataContext
     * * Base View: vwDataContexts
     * * @description Data Contexts are a primitive within the MemberJunction architecture. They store information about data contexts which are groups of data including views, queries, or raw SQL statements. Data contexts can be used in conversations, reports and more.
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Data Contexts')
    export class DataContextEntity extends BaseEntity {
        /**
        * Loads the Data Contexts record from the database
        * @param ID: number - primary key value to load the Data Contexts record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof DataContextEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
        * * Field Name: UserID
        * * Display Name: User ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Users (vwUsers.ID)
        */
        get UserID(): number {  
            return this.Get('UserID');
        }
        set UserID(value: number) {
            this.Set('UserID', value);
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
        * * Field Name: LastRefreshedAt
        * * Display Name: Last Refreshed At
        * * SQL Data Type: datetime
        */
        get LastRefreshedAt(): Date | null {  
            return this.Get('LastRefreshedAt');
        }
        set LastRefreshedAt(value: Date | null) {
            this.Set('LastRefreshedAt', value);
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
        * * Field Name: User
        * * Display Name: User
        * * SQL Data Type: nvarchar(100)
        */
        get User(): string {  
            return this.Get('User');
        }
        

    }
        
    /**
     * User View Categories - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: UserViewCategory
     * * Base View: vwUserViewCategories
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'User View Categories')
    export class UserViewCategoryEntity extends BaseEntity {
        /**
        * Loads the User View Categories record from the database
        * @param ID: number - primary key value to load the User View Categories record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof UserViewCategoryEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
        * * Field Name: ParentID
        * * Display Name: Parent ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: User View Categories (vwUserViewCategories.ID)
        */
        get ParentID(): number | null {  
            return this.Get('ParentID');
        }
        set ParentID(value: number | null) {
            this.Set('ParentID', value);
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
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)
        */
        get EntityID(): number {  
            return this.Get('EntityID');
        }
        set EntityID(value: number) {
            this.Set('EntityID', value);
        }
        /**
        * * Field Name: UserID
        * * Display Name: User ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Users (vwUsers.ID)
        */
        get UserID(): number {  
            return this.Get('UserID');
        }
        set UserID(value: number) {
            this.Set('UserID', value);
        }
        /**
        * * Field Name: Parent
        * * Display Name: Parent
        * * SQL Data Type: nvarchar(100)
        */
        get Parent(): string | null {  
            return this.Get('Parent');
        }
        
        /**
        * * Field Name: User
        * * Display Name: User
        * * SQL Data Type: nvarchar(100)
        */
        get User(): string {  
            return this.Get('User');
        }
        

    }
        
    /**
     * Dashboard Categories - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: DashboardCategory
     * * Base View: vwDashboardCategories
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Dashboard Categories')
    export class DashboardCategoryEntity extends BaseEntity {
        /**
        * Loads the Dashboard Categories record from the database
        * @param ID: number - primary key value to load the Dashboard Categories record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof DashboardCategoryEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
        * * Field Name: ParentID
        * * Display Name: Parent ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Dashboard Categories (vwDashboardCategories.ID)
        */
        get ParentID(): number | null {  
            return this.Get('ParentID');
        }
        set ParentID(value: number | null) {
            this.Set('ParentID', value);
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
        * * Field Name: UserID
        * * Display Name: User ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Users (vwUsers.ID)
        */
        get UserID(): number {  
            return this.Get('UserID');
        }
        set UserID(value: number) {
            this.Set('UserID', value);
        }
        /**
        * * Field Name: Parent
        * * Display Name: Parent
        * * SQL Data Type: nvarchar(100)
        */
        get Parent(): string | null {  
            return this.Get('Parent');
        }
        
        /**
        * * Field Name: User
        * * Display Name: User
        * * SQL Data Type: nvarchar(100)
        */
        get User(): string {  
            return this.Get('User');
        }
        

    }
        
    /**
     * Report Categories - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: ReportCategory
     * * Base View: vwReportCategories
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Report Categories')
    export class ReportCategoryEntity extends BaseEntity {
        /**
        * Loads the Report Categories record from the database
        * @param ID: number - primary key value to load the Report Categories record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof ReportCategoryEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
        * * Field Name: ParentID
        * * Display Name: Parent ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Report Categories (vwReportCategories.ID)
        */
        get ParentID(): number | null {  
            return this.Get('ParentID');
        }
        set ParentID(value: number | null) {
            this.Set('ParentID', value);
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
        * * Field Name: UserID
        * * Display Name: User ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Users (vwUsers.ID)
        */
        get UserID(): number {  
            return this.Get('UserID');
        }
        set UserID(value: number) {
            this.Set('UserID', value);
        }
        /**
        * * Field Name: Parent
        * * Display Name: Parent
        * * SQL Data Type: nvarchar(100)
        */
        get Parent(): string | null {  
            return this.Get('Parent');
        }
        
        /**
        * * Field Name: User
        * * Display Name: User
        * * SQL Data Type: nvarchar(100)
        */
        get User(): string {  
            return this.Get('User');
        }
        

    }
        
    /**
     * File Storage Providers - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: FileStorageProvider
     * * Base View: vwFileStorageProviders
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'File Storage Providers')
    export class FileStorageProviderEntity extends BaseEntity {
        /**
        * Loads the File Storage Providers record from the database
        * @param ID: number - primary key value to load the File Storage Providers record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof FileStorageProviderEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * File Storage Providers - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof FileStorageProviderEntity
        * @throws {Error} - Delete is not allowed for File Storage Providers, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for File Storage Providers, to enable it set AllowDeleteAPI to 1 in the database.');
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
        get Description(): string | null {  
            return this.Get('Description');
        }
        set Description(value: string | null) {
            this.Set('Description', value);
        }
        /**
        * * Field Name: ServerDriverKey
        * * Display Name: Server Driver Key
        * * SQL Data Type: nvarchar(100)
        */
        get ServerDriverKey(): string {  
            return this.Get('ServerDriverKey');
        }
        set ServerDriverKey(value: string) {
            this.Set('ServerDriverKey', value);
        }
        /**
        * * Field Name: ClientDriverKey
        * * Display Name: Client Driver Key
        * * SQL Data Type: nvarchar(100)
        */
        get ClientDriverKey(): string {  
            return this.Get('ClientDriverKey');
        }
        set ClientDriverKey(value: string) {
            this.Set('ClientDriverKey', value);
        }
        /**
        * * Field Name: Priority
        * * Display Name: Priority
        * * SQL Data Type: int
        * * Default Value: 0
        */
        get Priority(): number {  
            return this.Get('Priority');
        }
        set Priority(value: number) {
            this.Set('Priority', value);
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
     * Files - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: File
     * * Base View: vwFiles
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Files')
    export class FileEntity extends BaseEntity {
        /**
        * Loads the Files record from the database
        * @param ID: number - primary key value to load the Files record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof FileEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(500)
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
        * * Field Name: ProviderID
        * * Display Name: Provider ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: File Storage Providers (vwFileStorageProviders.ID)
        */
        get ProviderID(): number {  
            return this.Get('ProviderID');
        }
        set ProviderID(value: number) {
            this.Set('ProviderID', value);
        }
        /**
        * * Field Name: ContentType
        * * Display Name: Content Type
        * * SQL Data Type: nvarchar(50)
        */
        get ContentType(): string | null {  
            return this.Get('ContentType');
        }
        set ContentType(value: string | null) {
            this.Set('ContentType', value);
        }
        /**
        * * Field Name: ProviderKey
        * * Display Name: Provider Key
        * * SQL Data Type: nvarchar(500)
        */
        get ProviderKey(): string | null {  
            return this.Get('ProviderKey');
        }
        set ProviderKey(value: string | null) {
            this.Set('ProviderKey', value);
        }
        /**
        * * Field Name: CategoryID
        * * Display Name: Category ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: File Categories (vwFileCategories.ID)
        */
        get CategoryID(): number | null {  
            return this.Get('CategoryID');
        }
        set CategoryID(value: number | null) {
            this.Set('CategoryID', value);
        }
        /**
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Pending
        * * Description: Pending, Uploading, Uploaded, Deleting, Deleted
        */
        get Status(): string {  
            return this.Get('Status');
        }
        set Status(value: string) {
            this.Set('Status', value);
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
        * * Field Name: Provider
        * * Display Name: Provider
        * * SQL Data Type: nvarchar(50)
        */
        get Provider(): string {  
            return this.Get('Provider');
        }
        
        /**
        * * Field Name: Category
        * * Display Name: Category
        * * SQL Data Type: nvarchar(255)
        */
        get Category(): string | null {  
            return this.Get('Category');
        }
        

    }
        
    /**
     * File Categories - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: FileCategory
     * * Base View: vwFileCategories
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'File Categories')
    export class FileCategoryEntity extends BaseEntity {
        /**
        * Loads the File Categories record from the database
        * @param ID: number - primary key value to load the File Categories record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof FileCategoryEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
        * * Field Name: ParentID
        * * Display Name: Parent ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: File Categories (vwFileCategories.ID)
        */
        get ParentID(): number | null {  
            return this.Get('ParentID');
        }
        set ParentID(value: number | null) {
            this.Set('ParentID', value);
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
        * * Field Name: Parent
        * * Display Name: Parent
        * * SQL Data Type: nvarchar(255)
        */
        get Parent(): string | null {  
            return this.Get('Parent');
        }
        

    }
        
    /**
     * File Entity Record Links - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: FileEntityRecordLink
     * * Base View: vwFileEntityRecordLinks
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'File Entity Record Links')
    export class FileEntityRecordLinkEntity extends BaseEntity {
        /**
        * Loads the File Entity Record Links record from the database
        * @param ID: number - primary key value to load the File Entity Record Links record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof FileEntityRecordLinkEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * File Entity Record Links - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof FileEntityRecordLinkEntity
        * @throws {Error} - Delete is not allowed for File Entity Record Links, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for File Entity Record Links, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Field Name: FileID
        * * Display Name: File ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Files (vwFiles.ID)
        */
        get FileID(): number {  
            return this.Get('FileID');
        }
        set FileID(value: number) {
            this.Set('FileID', value);
        }
        /**
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)
        */
        get EntityID(): number {  
            return this.Get('EntityID');
        }
        set EntityID(value: number) {
            this.Set('EntityID', value);
        }
        /**
        * * Field Name: RecordID
        * * Display Name: Record ID
        * * SQL Data Type: nvarchar(255)
        */
        get RecordID(): string {  
            return this.Get('RecordID');
        }
        set RecordID(value: string) {
            this.Set('RecordID', value);
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
        * * Field Name: File
        * * Display Name: File
        * * SQL Data Type: nvarchar(500)
        */
        get File(): string {  
            return this.Get('File');
        }
        
        /**
        * * Field Name: Entity
        * * Display Name: Entity
        * * SQL Data Type: nvarchar(255)
        */
        get Entity(): string {  
            return this.Get('Entity');
        }
        

    }
        
    /**
     * Version Installations - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: VersionInstallation
     * * Base View: vwVersionInstallations
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Version Installations')
    export class VersionInstallationEntity extends BaseEntity {
        /**
        * Loads the Version Installations record from the database
        * @param ID: number - primary key value to load the Version Installations record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof VersionInstallationEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Version Installations - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof VersionInstallationEntity
        * @throws {Error} - Delete is not allowed for Version Installations, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Version Installations, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Field Name: MajorVersion
        * * Display Name: Major Version
        * * SQL Data Type: int
        */
        get MajorVersion(): number {  
            return this.Get('MajorVersion');
        }
        set MajorVersion(value: number) {
            this.Set('MajorVersion', value);
        }
        /**
        * * Field Name: MinorVersion
        * * Display Name: Minor Version
        * * SQL Data Type: int
        */
        get MinorVersion(): number {  
            return this.Get('MinorVersion');
        }
        set MinorVersion(value: number) {
            this.Set('MinorVersion', value);
        }
        /**
        * * Field Name: PatchVersion
        * * Display Name: Patch Version
        * * SQL Data Type: int
        */
        get PatchVersion(): number {  
            return this.Get('PatchVersion');
        }
        set PatchVersion(value: number) {
            this.Set('PatchVersion', value);
        }
        /**
        * * Field Name: Type
        * * Display Name: Type
        * * SQL Data Type: nvarchar(20)
        * * Default Value: System
        * * Value List Type: List
        * * Possible Values 
        *   * New
        *   * Upgrade
        * * Description: What type of installation was applied
        */
        get Type(): 'New' | 'Upgrade' | null {  
            return this.Get('Type');
        }
        set Type(value: 'New' | 'Upgrade' | null) {
            this.Set('Type', value);
        }
        /**
        * * Field Name: InstalledAt
        * * Display Name: Installed At
        * * SQL Data Type: datetime
        */
        get InstalledAt(): Date {  
            return this.Get('InstalledAt');
        }
        set InstalledAt(value: Date) {
            this.Set('InstalledAt', value);
        }
        /**
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Pending
        * * Value List Type: List
        * * Possible Values 
        *   * Pending
        *   * In Progress
        *   * Complete
        *   * Failed
        * * Description: Pending, Complete, Failed
        */
        get Status(): 'Pending' | 'In Progress' | 'Complete' | 'Failed' {  
            return this.Get('Status');
        }
        set Status(value: 'Pending' | 'In Progress' | 'Complete' | 'Failed') {
            this.Set('Status', value);
        }
        /**
        * * Field Name: InstallLog
        * * Display Name: Install Log
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Any logging that was saved from the installation process
        */
        get InstallLog(): string | null {  
            return this.Get('InstallLog');
        }
        set InstallLog(value: string | null) {
            this.Set('InstallLog', value);
        }
        /**
        * * Field Name: Comments
        * * Display Name: Comments
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Optional, comments the administrator wants to save for each installed version
        */
        get Comments(): string | null {  
            return this.Get('Comments');
        }
        set Comments(value: string | null) {
            this.Set('Comments', value);
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
        * * Field Name: CompleteVersion
        * * Display Name: Complete Version
        * * SQL Data Type: nvarchar(302)
        */
        get CompleteVersion(): string | null {  
            return this.Get('CompleteVersion');
        }
        

    }
        
    /**
     * Duplicate Run Detail Matches - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: DuplicateRunDetailMatch
     * * Base View: vwDuplicateRunDetailMatches
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Duplicate Run Detail Matches')
    export class DuplicateRunDetailMatchEntity extends BaseEntity {
        /**
        * Loads the Duplicate Run Detail Matches record from the database
        * @param ID: number - primary key value to load the Duplicate Run Detail Matches record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof DuplicateRunDetailMatchEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Duplicate Run Detail Matches - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof DuplicateRunDetailMatchEntity
        * @throws {Error} - Delete is not allowed for Duplicate Run Detail Matches, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Duplicate Run Detail Matches, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Field Name: DuplicateRunDetailID
        * * Display Name: Duplicate Run Detail ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Duplicate Run Details (vwDuplicateRunDetails.ID)
        */
        get DuplicateRunDetailID(): number {  
            return this.Get('DuplicateRunDetailID');
        }
        set DuplicateRunDetailID(value: number) {
            this.Set('DuplicateRunDetailID', value);
        }
        /**
        * * Field Name: MatchSource
        * * Display Name: Match Source
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Vector
        * * Value List Type: List
        * * Possible Values 
        *   * SP
        *   * Vector
        * * Description: Either Vector or SP
        */
        get MatchSource(): 'SP' | 'Vector' {  
            return this.Get('MatchSource');
        }
        set MatchSource(value: 'SP' | 'Vector') {
            this.Set('MatchSource', value);
        }
        /**
        * * Field Name: MatchRecordID
        * * Display Name: Match Record ID
        * * SQL Data Type: nvarchar(500)
        */
        get MatchRecordID(): string {  
            return this.Get('MatchRecordID');
        }
        set MatchRecordID(value: string) {
            this.Set('MatchRecordID', value);
        }
        /**
        * * Field Name: MatchProbability
        * * Display Name: Match Probability
        * * SQL Data Type: numeric(12, 11)
        * * Default Value: 0
        * * Description: Value between 0 and 1 designating the computed probability of a match
        */
        get MatchProbability(): number {  
            return this.Get('MatchProbability');
        }
        set MatchProbability(value: number) {
            this.Set('MatchProbability', value);
        }
        /**
        * * Field Name: MatchedAt
        * * Display Name: Matched At
        * * SQL Data Type: datetime
        * * Default Value: getdate()
        */
        get MatchedAt(): Date {  
            return this.Get('MatchedAt');
        }
        set MatchedAt(value: Date) {
            this.Set('MatchedAt', value);
        }
        /**
        * * Field Name: Action
        * * Display Name: Action
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Ignore
        */
        get Action(): string {  
            return this.Get('Action');
        }
        set Action(value: string) {
            this.Set('Action', value);
        }
        /**
        * * Field Name: ApprovalStatus
        * * Display Name: Approval Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Pending
        * * Value List Type: List
        * * Possible Values 
        *   * Rejected
        *   * Approved
        *   * Pending
        */
        get ApprovalStatus(): 'Rejected' | 'Approved' | 'Pending' {  
            return this.Get('ApprovalStatus');
        }
        set ApprovalStatus(value: 'Rejected' | 'Approved' | 'Pending') {
            this.Set('ApprovalStatus', value);
        }
        /**
        * * Field Name: MergeStatus
        * * Display Name: Merge Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Pending
        * * Value List Type: List
        * * Possible Values 
        *   * Error
        *   * Complete
        *   * Pending
        */
        get MergeStatus(): 'Error' | 'Complete' | 'Pending' {  
            return this.Get('MergeStatus');
        }
        set MergeStatus(value: 'Error' | 'Complete' | 'Pending') {
            this.Set('MergeStatus', value);
        }
        /**
        * * Field Name: MergedAt
        * * Display Name: Merged At
        * * SQL Data Type: datetime
        * * Default Value: getdate()
        */
        get MergedAt(): Date {  
            return this.Get('MergedAt');
        }
        set MergedAt(value: Date) {
            this.Set('MergedAt', value);
        }
        /**
        * * Field Name: RecordMergeLogID
        * * Display Name: Record Merge Log ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Record Merge Logs (vwRecordMergeLogs.ID)
        */
        get RecordMergeLogID(): number | null {  
            return this.Get('RecordMergeLogID');
        }
        set RecordMergeLogID(value: number | null) {
            this.Set('RecordMergeLogID', value);
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
     * Entity Document Settings - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: EntityDocumentSetting
     * * Base View: vwEntityDocumentSettings
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Entity Document Settings')
    export class EntityDocumentSettingEntity extends BaseEntity {
        /**
        * Loads the Entity Document Settings record from the database
        * @param ID: number - primary key value to load the Entity Document Settings record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof EntityDocumentSettingEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Entity Document Settings - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof EntityDocumentSettingEntity
        * @throws {Error} - Delete is not allowed for Entity Document Settings, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Entity Document Settings, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Field Name: EntityDocumentID
        * * Display Name: Entity Document ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Entity Documents (vwEntityDocuments.ID)
        */
        get EntityDocumentID(): number {  
            return this.Get('EntityDocumentID');
        }
        set EntityDocumentID(value: number) {
            this.Set('EntityDocumentID', value);
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
        * * Field Name: Value
        * * Display Name: Value
        * * SQL Data Type: nvarchar(MAX)
        */
        get Value(): string {  
            return this.Get('Value');
        }
        set Value(value: string) {
            this.Set('Value', value);
        }
        /**
        * * Field Name: Comments
        * * Display Name: Comments
        * * SQL Data Type: nvarchar(MAX)
        */
        get Comments(): string | null {  
            return this.Get('Comments');
        }
        set Comments(value: string | null) {
            this.Set('Comments', value);
        }
        /**
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_CreatedAt(): Date {  
            return this.Get('__mj_CreatedAt');
        }
        
        /**
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_UpdatedAt(): Date {  
            return this.Get('__mj_UpdatedAt');
        }
        
        /**
        * * Field Name: EntityDocument
        * * Display Name: Entity Document
        * * SQL Data Type: nvarchar(250)
        * * Default Value: getutcdate()
        */
        get EntityDocument(): string {  
            return this.Get('EntityDocument');
        }
        

    }
        
    /**
     * Entity Settings - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: EntitySetting
     * * Base View: vwEntitySettings
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Entity Settings')
    export class EntitySettingEntity extends BaseEntity {
        /**
        * Loads the Entity Settings record from the database
        * @param ID: number - primary key value to load the Entity Settings record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof EntitySettingEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Entity Settings - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof EntitySettingEntity
        * @throws {Error} - Delete is not allowed for Entity Settings, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Entity Settings, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)
        */
        get EntityID(): number {  
            return this.Get('EntityID');
        }
        set EntityID(value: number) {
            this.Set('EntityID', value);
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
        * * Field Name: Value
        * * Display Name: Value
        * * SQL Data Type: nvarchar(MAX)
        */
        get Value(): string {  
            return this.Get('Value');
        }
        set Value(value: string) {
            this.Set('Value', value);
        }
        /**
        * * Field Name: Comments
        * * Display Name: Comments
        * * SQL Data Type: nvarchar(MAX)
        */
        get Comments(): string | null {  
            return this.Get('Comments');
        }
        set Comments(value: string | null) {
            this.Set('Comments', value);
        }
        /**
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_CreatedAt(): Date {  
            return this.Get('__mj_CreatedAt');
        }
        
        /**
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_UpdatedAt(): Date {  
            return this.Get('__mj_UpdatedAt');
        }
        
        /**
        * * Field Name: Entity
        * * Display Name: Entity
        * * SQL Data Type: nvarchar(255)
        * * Default Value: getutcdate()
        */
        get Entity(): string {  
            return this.Get('Entity');
        }
        

    }
        
    /**
     * Duplicate Runs - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: DuplicateRun
     * * Base View: vwDuplicateRuns
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Duplicate Runs')
    export class DuplicateRunEntity extends BaseEntity {
        /**
        * Loads the Duplicate Runs record from the database
        * @param ID: number - primary key value to load the Duplicate Runs record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof DuplicateRunEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Duplicate Runs - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof DuplicateRunEntity
        * @throws {Error} - Delete is not allowed for Duplicate Runs, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Duplicate Runs, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)
        */
        get EntityID(): number {  
            return this.Get('EntityID');
        }
        set EntityID(value: number) {
            this.Set('EntityID', value);
        }
        /**
        * * Field Name: StartedByUserID
        * * Display Name: Started By User ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Users (vwUsers.ID)
        */
        get StartedByUserID(): number {  
            return this.Get('StartedByUserID');
        }
        set StartedByUserID(value: number) {
            this.Set('StartedByUserID', value);
        }
        /**
        * * Field Name: StartedAt
        * * Display Name: Started At
        * * SQL Data Type: datetime
        * * Default Value: getdate()
        */
        get StartedAt(): Date {  
            return this.Get('StartedAt');
        }
        set StartedAt(value: Date) {
            this.Set('StartedAt', value);
        }
        /**
        * * Field Name: EndedAt
        * * Display Name: Ended At
        * * SQL Data Type: datetime
        */
        get EndedAt(): Date | null {  
            return this.Get('EndedAt');
        }
        set EndedAt(value: Date | null) {
            this.Set('EndedAt', value);
        }
        /**
        * * Field Name: ApprovalStatus
        * * Display Name: Approval Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Pending
        * * Value List Type: List
        * * Possible Values 
        *   * Rejected
        *   * Approved
        *   * Pending
        */
        get ApprovalStatus(): 'Rejected' | 'Approved' | 'Pending' {  
            return this.Get('ApprovalStatus');
        }
        set ApprovalStatus(value: 'Rejected' | 'Approved' | 'Pending') {
            this.Set('ApprovalStatus', value);
        }
        /**
        * * Field Name: ApprovalComments
        * * Display Name: Approval Comments
        * * SQL Data Type: nvarchar(MAX)
        */
        get ApprovalComments(): string | null {  
            return this.Get('ApprovalComments');
        }
        set ApprovalComments(value: string | null) {
            this.Set('ApprovalComments', value);
        }
        /**
        * * Field Name: ApprovedByUserID
        * * Display Name: Approved By User ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Users (vwUsers.ID)
        */
        get ApprovedByUserID(): number | null {  
            return this.Get('ApprovedByUserID');
        }
        set ApprovedByUserID(value: number | null) {
            this.Set('ApprovedByUserID', value);
        }
        /**
        * * Field Name: ProcessingStatus
        * * Display Name: Processing Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Pending
        * * Value List Type: List
        * * Possible Values 
        *   * Failed
        *   * Complete
        *   * In Progress
        *   * Pending
        */
        get ProcessingStatus(): 'Failed' | 'Complete' | 'In Progress' | 'Pending' {  
            return this.Get('ProcessingStatus');
        }
        set ProcessingStatus(value: 'Failed' | 'Complete' | 'In Progress' | 'Pending') {
            this.Set('ProcessingStatus', value);
        }
        /**
        * * Field Name: ProcessingErrorMessage
        * * Display Name: Processing Error Message
        * * SQL Data Type: nvarchar(MAX)
        */
        get ProcessingErrorMessage(): string | null {  
            return this.Get('ProcessingErrorMessage');
        }
        set ProcessingErrorMessage(value: string | null) {
            this.Set('ProcessingErrorMessage', value);
        }
        /**
        * * Field Name: SourceListID
        * * Display Name: Source List ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Lists (vwLists.ID)
        */
        get SourceListID(): number {  
            return this.Get('SourceListID');
        }
        set SourceListID(value: number) {
            this.Set('SourceListID', value);
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
        * * Field Name: Entity
        * * Display Name: Entity
        * * SQL Data Type: nvarchar(255)
        */
        get Entity(): string {  
            return this.Get('Entity');
        }
        
        /**
        * * Field Name: StartedByUser
        * * Display Name: Started By User
        * * SQL Data Type: nvarchar(100)
        */
        get StartedByUser(): string {  
            return this.Get('StartedByUser');
        }
        
        /**
        * * Field Name: ApprovedByUser
        * * Display Name: Approved By User
        * * SQL Data Type: nvarchar(100)
        */
        get ApprovedByUser(): string | null {  
            return this.Get('ApprovedByUser');
        }
        
        /**
        * * Field Name: SourceList
        * * Display Name: Source List
        * * SQL Data Type: nvarchar(100)
        */
        get SourceList(): string {  
            return this.Get('SourceList');
        }
        

    }
        
    /**
     * Duplicate Run Details - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: DuplicateRunDetail
     * * Base View: vwDuplicateRunDetails
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Duplicate Run Details')
    export class DuplicateRunDetailEntity extends BaseEntity {
        /**
        * Loads the Duplicate Run Details record from the database
        * @param ID: number - primary key value to load the Duplicate Run Details record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof DuplicateRunDetailEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Duplicate Run Details - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof DuplicateRunDetailEntity
        * @throws {Error} - Delete is not allowed for Duplicate Run Details, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Duplicate Run Details, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Field Name: DuplicateRunID
        * * Display Name: Duplicate Run ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Duplicate Runs (vwDuplicateRuns.ID)
        */
        get DuplicateRunID(): number {  
            return this.Get('DuplicateRunID');
        }
        set DuplicateRunID(value: number) {
            this.Set('DuplicateRunID', value);
        }
        /**
        * * Field Name: RecordID
        * * Display Name: Record ID
        * * SQL Data Type: nvarchar(500)
        */
        get RecordID(): string {  
            return this.Get('RecordID');
        }
        set RecordID(value: string) {
            this.Set('RecordID', value);
        }
        /**
        * * Field Name: MatchStatus
        * * Display Name: Match Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Pending
        * * Value List Type: List
        * * Possible Values 
        *   * Error
        *   * Skipped
        *   * Complete
        *   * Pending
        */
        get MatchStatus(): 'Error' | 'Skipped' | 'Complete' | 'Pending' {  
            return this.Get('MatchStatus');
        }
        set MatchStatus(value: 'Error' | 'Skipped' | 'Complete' | 'Pending') {
            this.Set('MatchStatus', value);
        }
        /**
        * * Field Name: SkippedReason
        * * Display Name: Skipped Reason
        * * SQL Data Type: nvarchar(MAX)
        * * Description: If MatchStatus=Skipped, this field can be used to store the reason why the record was skipped
        */
        get SkippedReason(): string | null {  
            return this.Get('SkippedReason');
        }
        set SkippedReason(value: string | null) {
            this.Set('SkippedReason', value);
        }
        /**
        * * Field Name: MatchErrorMessage
        * * Display Name: Match Error Message
        * * SQL Data Type: nvarchar(MAX)
        * * Description: If MatchStatus='Error' this field can be used to track the error from that phase of the process for logging/diagnostics.
        */
        get MatchErrorMessage(): string | null {  
            return this.Get('MatchErrorMessage');
        }
        set MatchErrorMessage(value: string | null) {
            this.Set('MatchErrorMessage', value);
        }
        /**
        * * Field Name: MergeStatus
        * * Display Name: Merge Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Not Applicable
        * * Value List Type: List
        * * Possible Values 
        *   * Error
        *   * Complete
        *   * Pending
        *   * Not Applicable
        */
        get MergeStatus(): 'Error' | 'Complete' | 'Pending' | 'Not Applicable' {  
            return this.Get('MergeStatus');
        }
        set MergeStatus(value: 'Error' | 'Complete' | 'Pending' | 'Not Applicable') {
            this.Set('MergeStatus', value);
        }
        /**
        * * Field Name: MergeErrorMessage
        * * Display Name: Merge Error Message
        * * SQL Data Type: nvarchar(MAX)
        */
        get MergeErrorMessage(): string | null {  
            return this.Get('MergeErrorMessage');
        }
        set MergeErrorMessage(value: string | null) {
            this.Set('MergeErrorMessage', value);
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
     * Entity Behaviors - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: EntityBehavior
     * * Base View: vwEntityBehaviors
     * * @description Stores the behaviors for each entity and is used for code generation and injection of behavior code into various areas of the system.
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Entity Behaviors')
    export class EntityBehaviorEntity extends BaseEntity {
        /**
        * Loads the Entity Behaviors record from the database
        * @param ID: number - primary key value to load the Entity Behaviors record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof EntityBehaviorEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)
        */
        get EntityID(): number {  
            return this.Get('EntityID');
        }
        set EntityID(value: number) {
            this.Set('EntityID', value);
        }
        /**
        * * Field Name: BehaviorTypeID
        * * Display Name: Behavior Type ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Entity Behavior Types (vwEntityBehaviorTypes.ID)
        */
        get BehaviorTypeID(): number {  
            return this.Get('BehaviorTypeID');
        }
        set BehaviorTypeID(value: number) {
            this.Set('BehaviorTypeID', value);
        }
        /**
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)
        * * Description: This field will be used by the AI system to generate code that corresponds to the requested behavior and inject the code into the appropriate part(s) of the system.
        */
        get Description(): string {  
            return this.Get('Description');
        }
        set Description(value: string) {
            this.Set('Description', value);
        }
        /**
        * * Field Name: RegenerateCode
        * * Display Name: Regenerate Code
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: This bit field is automatically turned on whenever the Description field is changed so that a future server process will pick it up and regenerate the code. This might happen asynchronously or synchronously depending on system setup.
        */
        get RegenerateCode(): boolean {  
            return this.Get('RegenerateCode');
        }
        set RegenerateCode(value: boolean) {
            this.Set('RegenerateCode', value);
        }
        /**
        * * Field Name: Code
        * * Display Name: Code
        * * SQL Data Type: nvarchar(MAX)
        * * Description: This is the code that implements the desired behavior. If the CodeGenerated bit is set to 1, each time CodeGen runs, it will use the Code specified here in the appropriate place(s). To override the generated code and prevent it from being changed in the future, set CodeGenerated = 0
        */
        get Code(): string | null {  
            return this.Get('Code');
        }
        set Code(value: string | null) {
            this.Set('Code', value);
        }
        /**
        * * Field Name: CodeExplanation
        * * Display Name: Code Explanation
        * * SQL Data Type: nvarchar(MAX)
        * * Description: When an AI model generates code this will be populated with the AI's explanation of how the code works to meet the requirements of the behavior. For a non-generated piece of code a developer could manually place an explanation in this field.
        */
        get CodeExplanation(): string | null {  
            return this.Get('CodeExplanation');
        }
        set CodeExplanation(value: string | null) {
            this.Set('CodeExplanation', value);
        }
        /**
        * * Field Name: CodeGenerated
        * * Display Name: Code Generated
        * * SQL Data Type: bit
        * * Default Value: 1
        */
        get CodeGenerated(): boolean {  
            return this.Get('CodeGenerated');
        }
        set CodeGenerated(value: boolean) {
            this.Set('CodeGenerated', value);
        }
        /**
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_CreatedAt(): Date {  
            return this.Get('__mj_CreatedAt');
        }
        
        /**
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_UpdatedAt(): Date {  
            return this.Get('__mj_UpdatedAt');
        }
        
        /**
        * * Field Name: Entity
        * * Display Name: Entity
        * * SQL Data Type: nvarchar(255)
        * * Default Value: getutcdate()
        */
        get Entity(): string {  
            return this.Get('Entity');
        }
        

    }
        
    /**
     * Entity Behavior Types - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: EntityBehaviorType
     * * Base View: vwEntityBehaviorTypes
     * * @description This table stores the list of possible behavior types to use in the Entity Behavior Types entity. 
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Entity Behavior Types')
    export class EntityBehaviorTypeEntity extends BaseEntity {
        /**
        * Loads the Entity Behavior Types record from the database
        * @param ID: number - primary key value to load the Entity Behavior Types record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof EntityBehaviorTypeEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(100)
        * * Description: The name of the behavior, a unique column for the table. 
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
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_CreatedAt(): Date {  
            return this.Get('__mj_CreatedAt');
        }
        
        /**
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_UpdatedAt(): Date {  
            return this.Get('__mj_UpdatedAt');
        }
        

    }
        
    /**
     * Application Settings - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: ApplicationSetting
     * * Base View: vwApplicationSettings
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Application Settings')
    export class ApplicationSettingEntity extends BaseEntity {
        /**
        * Loads the Application Settings record from the database
        * @param ID: number - primary key value to load the Application Settings record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof ApplicationSettingEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
        * * Field Name: ApplicationName
        * * Display Name: Application Name
        * * SQL Data Type: nvarchar(50)
        * * Related Entity/Foreign Key: Applications (vwApplications.Name)
        */
        get ApplicationName(): string {  
            return this.Get('ApplicationName');
        }
        set ApplicationName(value: string) {
            this.Set('ApplicationName', value);
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
        * * Field Name: Value
        * * Display Name: Value
        * * SQL Data Type: nvarchar(MAX)
        */
        get Value(): string {  
            return this.Get('Value');
        }
        set Value(value: string) {
            this.Set('Value', value);
        }
        /**
        * * Field Name: Comments
        * * Display Name: Comments
        * * SQL Data Type: nvarchar(MAX)
        */
        get Comments(): string | null {  
            return this.Get('Comments');
        }
        set Comments(value: string | null) {
            this.Set('Comments', value);
        }
        /**
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_CreatedAt(): Date {  
            return this.Get('__mj_CreatedAt');
        }
        
        /**
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_UpdatedAt(): Date {  
            return this.Get('__mj_UpdatedAt');
        }
        

    }
        
    /**
     * Action Categories - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: ActionCategory
     * * Base View: vwActionCategories
     * * @description Organizes actions into categories, including name, description, and optional parent category for hierarchy.
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Action Categories')
    export class ActionCategoryEntity extends BaseEntity {
        /**
        * Loads the Action Categories record from the database
        * @param ID: number - primary key value to load the Action Categories record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof ActionCategoryEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)
        * * Description: Name of the action category.
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
        * * Description: Description of the action category.
        */
        get Description(): string | null {  
            return this.Get('Description');
        }
        set Description(value: string | null) {
            this.Set('Description', value);
        }
        /**
        * * Field Name: ParentID
        * * Display Name: Parent ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Action Categories (vwActionCategories.ID)
        * * Description: Parent category ID for hierarchical organization.
        */
        get ParentID(): number | null {  
            return this.Get('ParentID');
        }
        set ParentID(value: number | null) {
            this.Set('ParentID', value);
        }
        /**
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Pending
        * * Value List Type: List
        * * Possible Values 
        *   * Disabled
        *   * Active
        *   * Pending
        * * Description: Status of the action category (Pending, Active, Disabled).
        */
        get Status(): 'Disabled' | 'Active' | 'Pending' {  
            return this.Get('Status');
        }
        set Status(value: 'Disabled' | 'Active' | 'Pending') {
            this.Set('Status', value);
        }
        /**
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_CreatedAt(): Date {  
            return this.Get('__mj_CreatedAt');
        }
        
        /**
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_UpdatedAt(): Date {  
            return this.Get('__mj_UpdatedAt');
        }
        
        /**
        * * Field Name: Parent
        * * Display Name: Parent
        * * SQL Data Type: nvarchar(255)
        * * Default Value: getutcdate()
        */
        get Parent(): string | null {  
            return this.Get('Parent');
        }
        

    }
        
    /**
     * Entity Actions - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: EntityAction
     * * Base View: vwEntityActions
     * * @description Links entities to actions - this is the main place where you define the actions that part of, or available, for a given entity.
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Entity Actions')
    export class EntityActionEntity extends BaseEntity {
        /**
        * Loads the Entity Actions record from the database
        * @param ID: number - primary key value to load the Entity Actions record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof EntityActionEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)
        */
        get EntityID(): number {  
            return this.Get('EntityID');
        }
        set EntityID(value: number) {
            this.Set('EntityID', value);
        }
        /**
        * * Field Name: ActionID
        * * Display Name: Action ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Actions (vwActions.ID)
        */
        get ActionID(): number {  
            return this.Get('ActionID');
        }
        set ActionID(value: number) {
            this.Set('ActionID', value);
        }
        /**
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Pending
        * * Value List Type: List
        * * Possible Values 
        *   * Disabled
        *   * Active
        *   * Pending
        * * Description: Status of the entity action (Pending, Active, Disabled).
        */
        get Status(): 'Disabled' | 'Active' | 'Pending' {  
            return this.Get('Status');
        }
        set Status(value: 'Disabled' | 'Active' | 'Pending') {
            this.Set('Status', value);
        }
        /**
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_CreatedAt(): Date {  
            return this.Get('__mj_CreatedAt');
        }
        
        /**
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_UpdatedAt(): Date {  
            return this.Get('__mj_UpdatedAt');
        }
        
        /**
        * * Field Name: Entity
        * * Display Name: Entity
        * * SQL Data Type: nvarchar(255)
        * * Default Value: getutcdate()
        */
        get Entity(): string {  
            return this.Get('Entity');
        }
        
        /**
        * * Field Name: Action
        * * Display Name: Action
        * * SQL Data Type: nvarchar(425)
        * * Default Value: getutcdate()
        */
        get Action(): string {  
            return this.Get('Action');
        }
        

    }
        
    /**
     * Entity Action Invocations - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: EntityActionInvocation
     * * Base View: vwEntityActionInvocations
     * * @description Links invocation types to entity actions – for example you might link a particular EntityAction to just “Create Record” and you might also have a second item in this table allowing the same Entity Action to be invoked from a User View or List, on demand.
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Entity Action Invocations')
    export class EntityActionInvocationEntity extends BaseEntity {
        /**
        * Loads the Entity Action Invocations record from the database
        * @param ID: number - primary key value to load the Entity Action Invocations record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof EntityActionInvocationEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
        * * Field Name: EntityActionID
        * * Display Name: Entity Action ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Entity Actions (vwEntityActions.ID)
        */
        get EntityActionID(): number {  
            return this.Get('EntityActionID');
        }
        set EntityActionID(value: number) {
            this.Set('EntityActionID', value);
        }
        /**
        * * Field Name: InvocationTypeID
        * * Display Name: Invocation Type ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Entity Action Invocation Types (vwEntityActionInvocationTypes.ID)
        */
        get InvocationTypeID(): number {  
            return this.Get('InvocationTypeID');
        }
        set InvocationTypeID(value: number) {
            this.Set('InvocationTypeID', value);
        }
        /**
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Pending
        * * Value List Type: List
        * * Possible Values 
        *   * Disabled
        *   * Active
        *   * Pending
        * * Description: Status of the entity action invocation (Pending, Active, Disabled).
        */
        get Status(): 'Disabled' | 'Active' | 'Pending' {  
            return this.Get('Status');
        }
        set Status(value: 'Disabled' | 'Active' | 'Pending') {
            this.Set('Status', value);
        }
        /**
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_CreatedAt(): Date {  
            return this.Get('__mj_CreatedAt');
        }
        
        /**
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_UpdatedAt(): Date {  
            return this.Get('__mj_UpdatedAt');
        }
        
        /**
        * * Field Name: InvocationType
        * * Display Name: Invocation Type
        * * SQL Data Type: nvarchar(255)
        * * Default Value: getutcdate()
        */
        get InvocationType(): string {  
            return this.Get('InvocationType');
        }
        

    }
        
    /**
     * Action Authorizations - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: ActionAuthorization
     * * Base View: vwActionAuthorizations
     * * @description Links actions to authorizations, one or more of these must be possessed by a user in order to execute the action.
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Action Authorizations')
    export class ActionAuthorizationEntity extends BaseEntity {
        /**
        * Loads the Action Authorizations record from the database
        * @param ID: number - primary key value to load the Action Authorizations record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof ActionAuthorizationEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
        * * Field Name: ActionID
        * * Display Name: Action ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Actions (vwActions.ID)
        */
        get ActionID(): number {  
            return this.Get('ActionID');
        }
        set ActionID(value: number) {
            this.Set('ActionID', value);
        }
        /**
        * * Field Name: AuthorizationName
        * * Display Name: Authorization Name
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Authorizations (vwAuthorizations.Name)
        */
        get AuthorizationName(): string {  
            return this.Get('AuthorizationName');
        }
        set AuthorizationName(value: string) {
            this.Set('AuthorizationName', value);
        }
        /**
        * * Field Name: Comments
        * * Display Name: Comments
        * * SQL Data Type: nvarchar(MAX)
        */
        get Comments(): string | null {  
            return this.Get('Comments');
        }
        set Comments(value: string | null) {
            this.Set('Comments', value);
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
        * * Field Name: Action
        * * Display Name: Action
        * * SQL Data Type: nvarchar(425)
        */
        get Action(): string {  
            return this.Get('Action');
        }
        

    }
        
    /**
     * Entity Action Invocation Types - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: EntityActionInvocationType
     * * Base View: vwEntityActionInvocationTypes
     * * @description Stores the possible invocation types of an action within the context of an entity. Examples would be: Record Created/Updated/Deleted/Accessed as well as things like “View” or “List” where you could run an EntityAction against an entire set of records in a view or list – either by user click or programmatically.
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Entity Action Invocation Types')
    export class EntityActionInvocationTypeEntity extends BaseEntity {
        /**
        * Loads the Entity Action Invocation Types record from the database
        * @param ID: number - primary key value to load the Entity Action Invocation Types record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof EntityActionInvocationTypeEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)
        * * Description: Name of the invocation type such as Record Created/Updated/etc.
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
        * * Description: Description of the invocation type.
        */
        get Description(): string | null {  
            return this.Get('Description');
        }
        set Description(value: string | null) {
            this.Set('Description', value);
        }
        /**
        * * Field Name: DisplaySequence
        * * Display Name: Display Sequence
        * * SQL Data Type: int
        * * Default Value: 0
        */
        get DisplaySequence(): number {  
            return this.Get('DisplaySequence');
        }
        set DisplaySequence(value: number) {
            this.Set('DisplaySequence', value);
        }
        /**
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_CreatedAt(): Date {  
            return this.Get('__mj_CreatedAt');
        }
        
        /**
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_UpdatedAt(): Date {  
            return this.Get('__mj_UpdatedAt');
        }
        

    }
        
    /**
     * Actions - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: Action
     * * Base View: vwActions
     * * @description Stores action definitions, including prompts, generated code, user comments, and status.
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Actions')
    export class ActionEntity extends BaseEntity {
        /**
        * Loads the Actions record from the database
        * @param ID: number - primary key value to load the Actions record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof ActionEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
        * * Field Name: CategoryID
        * * Display Name: Category ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Action Categories (vwActionCategories.ID)
        */
        get CategoryID(): number | null {  
            return this.Get('CategoryID');
        }
        set CategoryID(value: number | null) {
            this.Set('CategoryID', value);
        }
        /**
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(425)
        */
        get Name(): string {  
            return this.Get('Name');
        }
        set Name(value: string) {
            this.Set('Name', value);
        }
        /**
        * * Field Name: UserPrompt
        * * Display Name: User Prompt
        * * SQL Data Type: nvarchar(MAX)
        */
        get UserPrompt(): string {  
            return this.Get('UserPrompt');
        }
        set UserPrompt(value: string) {
            this.Set('UserPrompt', value);
        }
        /**
        * * Field Name: UserComments
        * * Display Name: User Comments
        * * SQL Data Type: nvarchar(MAX)
        * * Description: User's comments not shared with the LLM.
        */
        get UserComments(): string | null {  
            return this.Get('UserComments');
        }
        set UserComments(value: string | null) {
            this.Set('UserComments', value);
        }
        /**
        * * Field Name: Code
        * * Display Name: Code
        * * SQL Data Type: nvarchar(MAX)
        */
        get Code(): string | null {  
            return this.Get('Code');
        }
        set Code(value: string | null) {
            this.Set('Code', value);
        }
        /**
        * * Field Name: CodeComments
        * * Display Name: Code Comments
        * * SQL Data Type: nvarchar(MAX)
        * * Description: AI's explanation of the code.
        */
        get CodeComments(): string | null {  
            return this.Get('CodeComments');
        }
        set CodeComments(value: string | null) {
            this.Set('CodeComments', value);
        }
        /**
        * * Field Name: CodeApprovalStatus
        * * Display Name: Code Approval Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Pending
        * * Value List Type: List
        * * Possible Values 
        *   * Rejected
        *   * Approved
        *   * Pending
        * * Description: An action won't be usable until the code is approved.
        */
        get CodeApprovalStatus(): 'Rejected' | 'Approved' | 'Pending' {  
            return this.Get('CodeApprovalStatus');
        }
        set CodeApprovalStatus(value: 'Rejected' | 'Approved' | 'Pending') {
            this.Set('CodeApprovalStatus', value);
        }
        /**
        * * Field Name: CodeApprovalComments
        * * Display Name: Code Approval Comments
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Optional comments when an individual (or an AI) reviews and approves the code.
        */
        get CodeApprovalComments(): string | null {  
            return this.Get('CodeApprovalComments');
        }
        set CodeApprovalComments(value: string | null) {
            this.Set('CodeApprovalComments', value);
        }
        /**
        * * Field Name: CodeApprovedByUserID
        * * Display Name: Code Approved By User ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Users (vwUsers.ID)
        * * Description: UserID who approved the code.
        */
        get CodeApprovedByUserID(): number | null {  
            return this.Get('CodeApprovedByUserID');
        }
        set CodeApprovedByUserID(value: number | null) {
            this.Set('CodeApprovedByUserID', value);
        }
        /**
        * * Field Name: CodeApprovedAt
        * * Display Name: Code Approved At
        * * SQL Data Type: datetime
        * * Description: When the code was approved.
        */
        get CodeApprovedAt(): Date | null {  
            return this.Get('CodeApprovedAt');
        }
        set CodeApprovedAt(value: Date | null) {
            this.Set('CodeApprovedAt', value);
        }
        /**
        * * Field Name: ForceCodeGeneration
        * * Display Name: Force Code Generation
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: If set to 1, the Action will generate code for the provided UserPrompt on the next Save even if the UserPrompt hasn't changed. This is useful to force regeneration when other candidates (such as a change in Action Inputs/Outputs) occurs or on demand by a user.
        */
        get ForceCodeGeneration(): boolean {  
            return this.Get('ForceCodeGeneration');
        }
        set ForceCodeGeneration(value: boolean) {
            this.Set('ForceCodeGeneration', value);
        }
        /**
        * * Field Name: RetentionPeriod
        * * Display Name: Retention Period
        * * SQL Data Type: int
        * * Description: Number of days to retain execution logs; NULL for indefinite.
        */
        get RetentionPeriod(): number | null {  
            return this.Get('RetentionPeriod');
        }
        set RetentionPeriod(value: number | null) {
            this.Set('RetentionPeriod', value);
        }
        /**
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Pending
        * * Value List Type: List
        * * Possible Values 
        *   * Disabled
        *   * Active
        *   * Pending
        * * Description: Status of the action (Pending, Active, Disabled).
        */
        get Status(): 'Disabled' | 'Active' | 'Pending' {  
            return this.Get('Status');
        }
        set Status(value: 'Disabled' | 'Active' | 'Pending') {
            this.Set('Status', value);
        }
        /**
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_CreatedAt(): Date {  
            return this.Get('__mj_CreatedAt');
        }
        
        /**
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_UpdatedAt(): Date {  
            return this.Get('__mj_UpdatedAt');
        }
        
        /**
        * * Field Name: Category
        * * Display Name: Category
        * * SQL Data Type: nvarchar(255)
        * * Default Value: getutcdate()
        */
        get Category(): string | null {  
            return this.Get('Category');
        }
        
        /**
        * * Field Name: CodeApprovedByUser
        * * Display Name: Code Approved By User
        * * SQL Data Type: nvarchar(100)
        * * Default Value: getutcdate()
        */
        get CodeApprovedByUser(): string | null {  
            return this.Get('CodeApprovedByUser');
        }
        

    }
        
    /**
     * Entity Action Filters - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: EntityActionFilter
     * * Base View: vwEntityActionFilters
     * * @description Optional use. Maps Action Filters to specific EntityAction instances, specifying execution order and status. This allows for “pre-processing” before an Action actually is fired off, to check for various state/dirty/value conditions.
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Entity Action Filters')
    export class EntityActionFilterEntity extends BaseEntity {
        /**
        * Loads the Entity Action Filters record from the database
        * @param ID: number - primary key value to load the Entity Action Filters record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof EntityActionFilterEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
        * * Field Name: EntityActionID
        * * Display Name: Entity Action ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Entity Actions (vwEntityActions.ID)
        */
        get EntityActionID(): number {  
            return this.Get('EntityActionID');
        }
        set EntityActionID(value: number) {
            this.Set('EntityActionID', value);
        }
        /**
        * * Field Name: ActionFilterID
        * * Display Name: Action Filter ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Action Filters (vwActionFilters.ID)
        */
        get ActionFilterID(): number {  
            return this.Get('ActionFilterID');
        }
        set ActionFilterID(value: number) {
            this.Set('ActionFilterID', value);
        }
        /**
        * * Field Name: Sequence
        * * Display Name: Sequence
        * * SQL Data Type: int
        * * Description: Order of filter execution.
        */
        get Sequence(): number {  
            return this.Get('Sequence');
        }
        set Sequence(value: number) {
            this.Set('Sequence', value);
        }
        /**
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Pending
        * * Value List Type: List
        * * Possible Values 
        *   * Disabled
        *   * Active
        *   * Pending
        * * Description: Status of the entity action filter (Pending, Active, Disabled).
        */
        get Status(): 'Disabled' | 'Active' | 'Pending' {  
            return this.Get('Status');
        }
        set Status(value: 'Disabled' | 'Active' | 'Pending') {
            this.Set('Status', value);
        }
        /**
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_CreatedAt(): Date {  
            return this.Get('__mj_CreatedAt');
        }
        
        /**
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_UpdatedAt(): Date {  
            return this.Get('__mj_UpdatedAt');
        }
        

    }
        
    /**
     * Action Filters - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: ActionFilter
     * * Base View: vwActionFilters
     * * @description Defines filters that can be evaluated ahead of executing an action. Action Filters are usable in any code pipeline you can execute them with the same context as the action itself and use the outcome to determine if the action should execute or not.
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Action Filters')
    export class ActionFilterEntity extends BaseEntity {
        /**
        * Loads the Action Filters record from the database
        * @param ID: number - primary key value to load the Action Filters record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof ActionFilterEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
        * * Field Name: UserDescription
        * * Display Name: User Description
        * * SQL Data Type: nvarchar(MAX)
        */
        get UserDescription(): string {  
            return this.Get('UserDescription');
        }
        set UserDescription(value: string) {
            this.Set('UserDescription', value);
        }
        /**
        * * Field Name: UserComments
        * * Display Name: User Comments
        * * SQL Data Type: nvarchar(MAX)
        */
        get UserComments(): string | null {  
            return this.Get('UserComments');
        }
        set UserComments(value: string | null) {
            this.Set('UserComments', value);
        }
        /**
        * * Field Name: Code
        * * Display Name: Code
        * * SQL Data Type: nvarchar(MAX)
        */
        get Code(): string {  
            return this.Get('Code');
        }
        set Code(value: string) {
            this.Set('Code', value);
        }
        /**
        * * Field Name: CodeExplanation
        * * Display Name: Code Explanation
        * * SQL Data Type: nvarchar(MAX)
        */
        get CodeExplanation(): string | null {  
            return this.Get('CodeExplanation');
        }
        set CodeExplanation(value: string | null) {
            this.Set('CodeExplanation', value);
        }
        /**
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_CreatedAt(): Date {  
            return this.Get('__mj_CreatedAt');
        }
        
        /**
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_UpdatedAt(): Date {  
            return this.Get('__mj_UpdatedAt');
        }
        

    }
        
    /**
     * Action Context Types - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: ActionContextType
     * * Base View: vwActionContextTypes
     * * @description Lists possible contexts for action execution with optional descriptions.
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Action Context Types')
    export class ActionContextTypeEntity extends BaseEntity {
        /**
        * Loads the Action Context Types record from the database
        * @param ID: number - primary key value to load the Action Context Types record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof ActionContextTypeEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)
        * * Description: Name of the context type.
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
        * * Description: Description of the context type.
        */
        get Description(): string | null {  
            return this.Get('Description');
        }
        set Description(value: string | null) {
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
     * Action Result Codes - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: ActionResultCode
     * * Base View: vwActionResultCodes
     * * @description Defines the possible result codes for each action.
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Action Result Codes')
    export class ActionResultCodeEntity extends BaseEntity {
        /**
        * Loads the Action Result Codes record from the database
        * @param ID: number - primary key value to load the Action Result Codes record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof ActionResultCodeEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
        * * Field Name: ActionID
        * * Display Name: Action ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Actions (vwActions.ID)
        */
        get ActionID(): number {  
            return this.Get('ActionID');
        }
        set ActionID(value: number) {
            this.Set('ActionID', value);
        }
        /**
        * * Field Name: ResultCode
        * * Display Name: Result Code
        * * SQL Data Type: nvarchar(255)
        */
        get ResultCode(): string {  
            return this.Get('ResultCode');
        }
        set ResultCode(value: string) {
            this.Set('ResultCode', value);
        }
        /**
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Description of the result code.
        */
        get Description(): string | null {  
            return this.Get('Description');
        }
        set Description(value: string | null) {
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
        * * Field Name: Action
        * * Display Name: Action
        * * SQL Data Type: nvarchar(425)
        */
        get Action(): string {  
            return this.Get('Action');
        }
        

    }
        
    /**
     * Action Contexts - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: ActionContext
     * * Base View: vwActionContexts
     * * @description Links actions to their supported context types enabling a given action to be executable in more than one context.
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Action Contexts')
    export class ActionContextEntity extends BaseEntity {
        /**
        * Loads the Action Contexts record from the database
        * @param ID: number - primary key value to load the Action Contexts record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof ActionContextEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
        * * Field Name: ActionID
        * * Display Name: Action ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Actions (vwActions.ID)
        */
        get ActionID(): number {  
            return this.Get('ActionID');
        }
        set ActionID(value: number) {
            this.Set('ActionID', value);
        }
        /**
        * * Field Name: ContextTypeID
        * * Display Name: Context Type ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Action Context Types (vwActionContextTypes.ID)
        */
        get ContextTypeID(): number {  
            return this.Get('ContextTypeID');
        }
        set ContextTypeID(value: number) {
            this.Set('ContextTypeID', value);
        }
        /**
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Pending
        * * Value List Type: List
        * * Possible Values 
        *   * Disabled
        *   * Active
        *   * Pending
        * * Description: Status of the action context (Pending, Active, Disabled).
        */
        get Status(): 'Disabled' | 'Active' | 'Pending' {  
            return this.Get('Status');
        }
        set Status(value: 'Disabled' | 'Active' | 'Pending') {
            this.Set('Status', value);
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
        * * Field Name: Action
        * * Display Name: Action
        * * SQL Data Type: nvarchar(425)
        */
        get Action(): string {  
            return this.Get('Action');
        }
        
        /**
        * * Field Name: ContextType
        * * Display Name: Context Type
        * * SQL Data Type: nvarchar(255)
        */
        get ContextType(): string {  
            return this.Get('ContextType');
        }
        

    }
        
    /**
     * Action Execution Logs - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: ActionExecutionLog
     * * Base View: vwActionExecutionLogs
     * * @description Tracks every execution of an action, including start and end times, inputs, outputs, and result codes.
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Action Execution Logs')
    export class ActionExecutionLogEntity extends BaseEntity {
        /**
        * Loads the Action Execution Logs record from the database
        * @param ID: number - primary key value to load the Action Execution Logs record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof ActionExecutionLogEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
        * * Field Name: ActionID
        * * Display Name: Action ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Actions (vwActions.ID)
        */
        get ActionID(): number {  
            return this.Get('ActionID');
        }
        set ActionID(value: number) {
            this.Set('ActionID', value);
        }
        /**
        * * Field Name: StartedAt
        * * Display Name: Started At
        * * SQL Data Type: datetime
        * * Default Value: getdate()
        * * Description: Timestamp of when the action started execution.
        */
        get StartedAt(): Date {  
            return this.Get('StartedAt');
        }
        set StartedAt(value: Date) {
            this.Set('StartedAt', value);
        }
        /**
        * * Field Name: EndedAt
        * * Display Name: Ended At
        * * SQL Data Type: datetime
        * * Description: Timestamp of when the action ended execution.
        */
        get EndedAt(): Date | null {  
            return this.Get('EndedAt');
        }
        set EndedAt(value: Date | null) {
            this.Set('EndedAt', value);
        }
        /**
        * * Field Name: Params
        * * Display Name: Params
        * * SQL Data Type: nvarchar(MAX)
        */
        get Params(): string | null {  
            return this.Get('Params');
        }
        set Params(value: string | null) {
            this.Set('Params', value);
        }
        /**
        * * Field Name: ResultCode
        * * Display Name: Result Code
        * * SQL Data Type: nvarchar(255)
        */
        get ResultCode(): string | null {  
            return this.Get('ResultCode');
        }
        set ResultCode(value: string | null) {
            this.Set('ResultCode', value);
        }
        /**
        * * Field Name: UserID
        * * Display Name: User ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Users (vwUsers.ID)
        */
        get UserID(): number {  
            return this.Get('UserID');
        }
        set UserID(value: number) {
            this.Set('UserID', value);
        }
        /**
        * * Field Name: RetentionPeriod
        * * Display Name: Retention Period
        * * SQL Data Type: int
        * * Description: Number of days to retain the log; NULL for indefinite retention.
        */
        get RetentionPeriod(): number | null {  
            return this.Get('RetentionPeriod');
        }
        set RetentionPeriod(value: number | null) {
            this.Set('RetentionPeriod', value);
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
        * * Field Name: Action
        * * Display Name: Action
        * * SQL Data Type: nvarchar(425)
        */
        get Action(): string {  
            return this.Get('Action');
        }
        
        /**
        * * Field Name: User
        * * Display Name: User
        * * SQL Data Type: nvarchar(100)
        */
        get User(): string {  
            return this.Get('User');
        }
        

    }
        
    /**
     * Action Params - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: ActionParam
     * * Base View: vwActionParams
     * * @description Tracks the input and output parameters for Actions.
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Action Params')
    export class ActionParamEntity extends BaseEntity {
        /**
        * Loads the Action Params record from the database
        * @param ID: number - primary key value to load the Action Params record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof ActionParamEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
        * * Field Name: ActionID
        * * Display Name: Action ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Actions (vwActions.ID)
        */
        get ActionID(): number {  
            return this.Get('ActionID');
        }
        set ActionID(value: number) {
            this.Set('ActionID', value);
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
        * * Field Name: DefaultValue
        * * Display Name: Default Value
        * * SQL Data Type: nvarchar(MAX)
        */
        get DefaultValue(): string | null {  
            return this.Get('DefaultValue');
        }
        set DefaultValue(value: string | null) {
            this.Set('DefaultValue', value);
        }
        /**
        * * Field Name: Type
        * * Display Name: Type
        * * SQL Data Type: nchar(10)
        * * Value List Type: List
        * * Possible Values 
        *   * Input
        *   * Output
        *   * Both
        */
        get Type(): 'Input' | 'Output' | 'Both' {  
            return this.Get('Type');
        }
        set Type(value: 'Input' | 'Output' | 'Both') {
            this.Set('Type', value);
        }
        /**
        * * Field Name: ValueType
        * * Display Name: Value Type
        * * SQL Data Type: nvarchar(30)
        * * Value List Type: List
        * * Possible Values 
        *   * Scalar
        *   * Simple Object
        *   * BaseEntity Sub-Class
        *   * Other
        * * Description: Tracks the basic value type of the parameter, additional information can be provided in the Description field
        */
        get ValueType(): 'Scalar' | 'Simple Object' | 'BaseEntity Sub-Class' | 'Other' {  
            return this.Get('ValueType');
        }
        set ValueType(value: 'Scalar' | 'Simple Object' | 'BaseEntity Sub-Class' | 'Other') {
            this.Set('ValueType', value);
        }
        /**
        * * Field Name: IsArray
        * * Display Name: Is Array
        * * SQL Data Type: bit
        * * Default Value: 0
        */
        get IsArray(): boolean {  
            return this.Get('IsArray');
        }
        set IsArray(value: boolean) {
            this.Set('IsArray', value);
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
        * * Field Name: IsRequired
        * * Display Name: Is Required
        * * SQL Data Type: bit
        * * Default Value: 1
        */
        get IsRequired(): boolean {  
            return this.Get('IsRequired');
        }
        set IsRequired(value: boolean) {
            this.Set('IsRequired', value);
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
        * * Field Name: Action
        * * Display Name: Action
        * * SQL Data Type: nvarchar(425)
        */
        get Action(): string {  
            return this.Get('Action');
        }
        

    }
        
    /**
     * Action Libraries - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: ActionLibrary
     * * Base View: vwActionLibraries
     * * @description Tracks the list of libraries that a given Action uses, including a list of classes/functions for each library.
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Action Libraries')
    export class ActionLibraryEntity extends BaseEntity {
        /**
        * Loads the Action Libraries record from the database
        * @param ID: number - primary key value to load the Action Libraries record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof ActionLibraryEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
        * * Field Name: ActionID
        * * Display Name: Action ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Actions (vwActions.ID)
        */
        get ActionID(): number {  
            return this.Get('ActionID');
        }
        set ActionID(value: number) {
            this.Set('ActionID', value);
        }
        /**
        * * Field Name: LibraryID
        * * Display Name: Library ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Libraries (vwLibraries.ID)
        */
        get LibraryID(): number {  
            return this.Get('LibraryID');
        }
        set LibraryID(value: number) {
            this.Set('LibraryID', value);
        }
        /**
        * * Field Name: ItemsUsed
        * * Display Name: Items Used
        * * SQL Data Type: nvarchar(MAX)
        * * Description: List of classes and functions used by the action from the library.
        */
        get ItemsUsed(): string | null {  
            return this.Get('ItemsUsed');
        }
        set ItemsUsed(value: string | null) {
            this.Set('ItemsUsed', value);
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
        * * Field Name: Action
        * * Display Name: Action
        * * SQL Data Type: nvarchar(425)
        */
        get Action(): string {  
            return this.Get('Action');
        }
        
        /**
        * * Field Name: Library
        * * Display Name: Library
        * * SQL Data Type: nvarchar(255)
        */
        get Library(): string {  
            return this.Get('Library');
        }
        

    }
        
    /**
     * Libraries - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: Library
     * * Base View: vwLibraries
     * * @description Stores information about the available libraries, including a list of classes/functions, type definitions, and sample code. You can add additional custom libraries here to make them avaialable to code generation features within the system.
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Libraries')
    export class LibraryEntity extends BaseEntity {
        /**
        * Loads the Libraries record from the database
        * @param ID: number - primary key value to load the Libraries record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof LibraryEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Libraries - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof LibraryEntity
        * @throws {Error} - Delete is not allowed for Libraries, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Libraries, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Pending
        * * Value List Type: List
        * * Possible Values 
        *   * Pending
        *   * Active
        *   * Disabled
        * * Description: Status of the library, only libraries marked as Active will be available for use by generated code. If a library was once active but no longer is, existing code that used the library will not be affected.
        */
        get Status(): 'Pending' | 'Active' | 'Disabled' {  
            return this.Get('Status');
        }
        set Status(value: 'Pending' | 'Active' | 'Disabled') {
            this.Set('Status', value);
        }
        /**
        * * Field Name: TypeDefinitions
        * * Display Name: Type Definitions
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Code showing the types and functions defined in the library to be used for reference by humans and AI
        */
        get TypeDefinitions(): string | null {  
            return this.Get('TypeDefinitions');
        }
        set TypeDefinitions(value: string | null) {
            this.Set('TypeDefinitions', value);
        }
        /**
        * * Field Name: SampleCode
        * * Display Name: Sample Code
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Examples of code use of the classes and/or functions from within the library
        */
        get SampleCode(): string | null {  
            return this.Get('SampleCode');
        }
        set SampleCode(value: string | null) {
            this.Set('SampleCode', value);
        }
        /**
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_CreatedAt(): Date {  
            return this.Get('__mj_CreatedAt');
        }
        
        /**
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_UpdatedAt(): Date {  
            return this.Get('__mj_UpdatedAt');
        }
        

    }
        
    /**
     * List Categories - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: ListCategory
     * * Base View: vwListCategories
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'List Categories')
    export class ListCategoryEntity extends BaseEntity {
        /**
        * Loads the List Categories record from the database
        * @param ID: number - primary key value to load the List Categories record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof ListCategoryEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * List Categories - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof ListCategoryEntity
        * @throws {Error} - Delete is not allowed for List Categories, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for List Categories, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Field Name: ParentID
        * * Display Name: Parent ID
        * * SQL Data Type: int
        */
        get ParentID(): number | null {  
            return this.Get('ParentID');
        }
        set ParentID(value: number | null) {
            this.Set('ParentID', value);
        }
        /**
        * * Field Name: CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetime
        */
        get CreatedAt(): Date {  
            return this.Get('CreatedAt');
        }
        
        /**
        * * Field Name: UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetime
        */
        get UpdatedAt(): Date {  
            return this.Get('UpdatedAt');
        }
        
        /**
        * * Field Name: UserID
        * * Display Name: User ID
        * * SQL Data Type: int
        */
        get UserID(): number {  
            return this.Get('UserID');
        }
        set UserID(value: number) {
            this.Set('UserID', value);
        }

    }
        
    /**
     * Communication Providers - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: CommunicationProvider
     * * Base View: vwCommunicationProviders
     * * @description All supported communication providers.
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Communication Providers')
    export class CommunicationProviderEntity extends BaseEntity {
        /**
        * Loads the Communication Providers record from the database
        * @param ID: number - primary key value to load the Communication Providers record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof CommunicationProviderEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Communication Providers - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof CommunicationProviderEntity
        * @throws {Error} - Delete is not allowed for Communication Providers, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Communication Providers, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Disabled
        * * Value List Type: List
        * * Possible Values 
        *   * Disabled
        *   * Active
        * * Description: The status of the communication provider (Disabled or Active).
        */
        get Status(): 'Disabled' | 'Active' {  
            return this.Get('Status');
        }
        set Status(value: 'Disabled' | 'Active') {
            this.Set('Status', value);
        }
        /**
        * * Field Name: SupportsSending
        * * Display Name: Supports Sending
        * * SQL Data Type: bit
        * * Default Value: 1
        * * Description: Indicates if the provider supports sending messages.
        */
        get SupportsSending(): boolean {  
            return this.Get('SupportsSending');
        }
        set SupportsSending(value: boolean) {
            this.Set('SupportsSending', value);
        }
        /**
        * * Field Name: SupportsReceiving
        * * Display Name: Supports Receiving
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Indicates if the provider supports receiving messages.
        */
        get SupportsReceiving(): boolean {  
            return this.Get('SupportsReceiving');
        }
        set SupportsReceiving(value: boolean) {
            this.Set('SupportsReceiving', value);
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
     * Communication Runs - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: CommunicationRun
     * * Base View: vwCommunicationRuns
     * * @description Runs of bulk message sends and receives.
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Communication Runs')
    export class CommunicationRunEntity extends BaseEntity {
        /**
        * Loads the Communication Runs record from the database
        * @param ID: number - primary key value to load the Communication Runs record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof CommunicationRunEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Communication Runs - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof CommunicationRunEntity
        * @throws {Error} - Delete is not allowed for Communication Runs, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Communication Runs, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Field Name: UserID
        * * Display Name: User ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Users (vwUsers.ID)
        */
        get UserID(): number {  
            return this.Get('UserID');
        }
        set UserID(value: number) {
            this.Set('UserID', value);
        }
        /**
        * * Field Name: Direction
        * * Display Name: Direction
        * * SQL Data Type: nvarchar(20)
        * * Value List Type: List
        * * Possible Values 
        *   * Sending
        *   * Receiving
        * * Description: The direction of the communication run (Sending or Receiving).
        */
        get Direction(): 'Sending' | 'Receiving' {  
            return this.Get('Direction');
        }
        set Direction(value: 'Sending' | 'Receiving') {
            this.Set('Direction', value);
        }
        /**
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Value List Type: List
        * * Possible Values 
        *   * Pending
        *   * In-Progress
        *   * Complete
        *   * Failed
        * * Description: The status of the communication run (Pending, In-Progress, Complete, Failed).
        */
        get Status(): 'Pending' | 'In-Progress' | 'Complete' | 'Failed' {  
            return this.Get('Status');
        }
        set Status(value: 'Pending' | 'In-Progress' | 'Complete' | 'Failed') {
            this.Set('Status', value);
        }
        /**
        * * Field Name: StartedAt
        * * Display Name: Started At
        * * SQL Data Type: datetime
        */
        get StartedAt(): Date | null {  
            return this.Get('StartedAt');
        }
        set StartedAt(value: Date | null) {
            this.Set('StartedAt', value);
        }
        /**
        * * Field Name: EndedAt
        * * Display Name: Ended At
        * * SQL Data Type: datetime
        */
        get EndedAt(): Date | null {  
            return this.Get('EndedAt');
        }
        set EndedAt(value: Date | null) {
            this.Set('EndedAt', value);
        }
        /**
        * * Field Name: Comments
        * * Display Name: Comments
        * * SQL Data Type: nvarchar(MAX)
        */
        get Comments(): string | null {  
            return this.Get('Comments');
        }
        set Comments(value: string | null) {
            this.Set('Comments', value);
        }
        /**
        * * Field Name: ErrorMessage
        * * Display Name: Error Message
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The error message if the communication run failed.
        */
        get ErrorMessage(): string | null {  
            return this.Get('ErrorMessage');
        }
        set ErrorMessage(value: string | null) {
            this.Set('ErrorMessage', value);
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
        * * Field Name: User
        * * Display Name: User
        * * SQL Data Type: nvarchar(100)
        */
        get User(): string {  
            return this.Get('User');
        }
        

    }
        
    /**
     * Communication Provider Message Types - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: CommunicationProviderMessageType
     * * Base View: vwCommunicationProviderMessageTypes
     * * @description Providers and their supported message types with additional attributes.
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Communication Provider Message Types')
    export class CommunicationProviderMessageTypeEntity extends BaseEntity {
        /**
        * Loads the Communication Provider Message Types record from the database
        * @param ID: number - primary key value to load the Communication Provider Message Types record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof CommunicationProviderMessageTypeEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
        * * Field Name: CommunicationProviderID
        * * Display Name: Communication Provider ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Communication Providers (vwCommunicationProviders.ID)
        */
        get CommunicationProviderID(): number {  
            return this.Get('CommunicationProviderID');
        }
        set CommunicationProviderID(value: number) {
            this.Set('CommunicationProviderID', value);
        }
        /**
        * * Field Name: CommunicationBaseMessageTypeID
        * * Display Name: Communication Base Message Type ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Communication Base Message Types (vwCommunicationBaseMessageTypes.ID)
        */
        get CommunicationBaseMessageTypeID(): number {  
            return this.Get('CommunicationBaseMessageTypeID');
        }
        set CommunicationBaseMessageTypeID(value: number) {
            this.Set('CommunicationBaseMessageTypeID', value);
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
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Disabled
        * * Value List Type: List
        * * Possible Values 
        *   * Disabled
        *   * Active
        * * Description: The status of the provider message type (Disabled or Active).
        */
        get Status(): 'Disabled' | 'Active' {  
            return this.Get('Status');
        }
        set Status(value: 'Disabled' | 'Active') {
            this.Set('Status', value);
        }
        /**
        * * Field Name: AdditionalAttributes
        * * Display Name: Additional Attributes
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Additional attributes specific to the provider message type.
        */
        get AdditionalAttributes(): string | null {  
            return this.Get('AdditionalAttributes');
        }
        set AdditionalAttributes(value: string | null) {
            this.Set('AdditionalAttributes', value);
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
        * * Field Name: CommunicationProvider
        * * Display Name: Communication Provider
        * * SQL Data Type: nvarchar(255)
        */
        get CommunicationProvider(): string {  
            return this.Get('CommunicationProvider');
        }
        
        /**
        * * Field Name: CommunicationBaseMessageType
        * * Display Name: Communication Base Message Type
        * * SQL Data Type: nvarchar(100)
        */
        get CommunicationBaseMessageType(): string {  
            return this.Get('CommunicationBaseMessageType');
        }
        

    }
        
    /**
     * Communication Logs - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: CommunicationLog
     * * Base View: vwCommunicationLogs
     * * @description Logs of sent and received messages.
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Communication Logs')
    export class CommunicationLogEntity extends BaseEntity {
        /**
        * Loads the Communication Logs record from the database
        * @param ID: number - primary key value to load the Communication Logs record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof CommunicationLogEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Communication Logs - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof CommunicationLogEntity
        * @throws {Error} - Delete is not allowed for Communication Logs, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Communication Logs, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Field Name: CommunicationProviderID
        * * Display Name: Communication Provider ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Communication Providers (vwCommunicationProviders.ID)
        */
        get CommunicationProviderID(): number {  
            return this.Get('CommunicationProviderID');
        }
        set CommunicationProviderID(value: number) {
            this.Set('CommunicationProviderID', value);
        }
        /**
        * * Field Name: CommunicationProviderMessageTypeID
        * * Display Name: Communication Provider Message Type ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Communication Provider Message Types (vwCommunicationProviderMessageTypes.ID)
        */
        get CommunicationProviderMessageTypeID(): number {  
            return this.Get('CommunicationProviderMessageTypeID');
        }
        set CommunicationProviderMessageTypeID(value: number) {
            this.Set('CommunicationProviderMessageTypeID', value);
        }
        /**
        * * Field Name: CommunicationRunID
        * * Display Name: Communication Run ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Communication Runs (vwCommunicationRuns.ID)
        */
        get CommunicationRunID(): number | null {  
            return this.Get('CommunicationRunID');
        }
        set CommunicationRunID(value: number | null) {
            this.Set('CommunicationRunID', value);
        }
        /**
        * * Field Name: Direction
        * * Display Name: Direction
        * * SQL Data Type: nvarchar(20)
        * * Value List Type: List
        * * Possible Values 
        *   * Sending
        *   * Receiving
        * * Description: The direction of the communication log (Sending or Receiving).
        */
        get Direction(): 'Sending' | 'Receiving' {  
            return this.Get('Direction');
        }
        set Direction(value: 'Sending' | 'Receiving') {
            this.Set('Direction', value);
        }
        /**
        * * Field Name: MessageDate
        * * Display Name: Message Date
        * * SQL Data Type: datetime
        * * Description: The date and time when the message was logged.
        */
        get MessageDate(): Date {  
            return this.Get('MessageDate');
        }
        set MessageDate(value: Date) {
            this.Set('MessageDate', value);
        }
        /**
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(50)
        * * Value List Type: List
        * * Possible Values 
        *   * Pending
        *   * In-Progress
        *   * Complete
        *   * Failed
        * * Description: The status of the logged message (Pending, In-Progress, Complete, Failed).
        */
        get Status(): 'Pending' | 'In-Progress' | 'Complete' | 'Failed' {  
            return this.Get('Status');
        }
        set Status(value: 'Pending' | 'In-Progress' | 'Complete' | 'Failed') {
            this.Set('Status', value);
        }
        /**
        * * Field Name: MessageContent
        * * Display Name: Message Content
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The content of the logged message.
        */
        get MessageContent(): string | null {  
            return this.Get('MessageContent');
        }
        set MessageContent(value: string | null) {
            this.Set('MessageContent', value);
        }
        /**
        * * Field Name: ErrorMessage
        * * Display Name: Error Message
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The error message if the message sending failed.
        */
        get ErrorMessage(): string | null {  
            return this.Get('ErrorMessage');
        }
        set ErrorMessage(value: string | null) {
            this.Set('ErrorMessage', value);
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
        * * Field Name: CommunicationProvider
        * * Display Name: Communication Provider
        * * SQL Data Type: nvarchar(255)
        */
        get CommunicationProvider(): string {  
            return this.Get('CommunicationProvider');
        }
        
        /**
        * * Field Name: CommunicationProviderMessageType
        * * Display Name: Communication Provider Message Type
        * * SQL Data Type: nvarchar(255)
        */
        get CommunicationProviderMessageType(): string {  
            return this.Get('CommunicationProviderMessageType');
        }
        

    }
        
    /**
     * Communication Base Message Types - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: CommunicationBaseMessageType
     * * Base View: vwCommunicationBaseMessageTypes
     * * @description Base message types and their supported functionalities.
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Communication Base Message Types')
    export class CommunicationBaseMessageTypeEntity extends BaseEntity {
        /**
        * Loads the Communication Base Message Types record from the database
        * @param ID: number - primary key value to load the Communication Base Message Types record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof CommunicationBaseMessageTypeEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Communication Base Message Types - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof CommunicationBaseMessageTypeEntity
        * @throws {Error} - Delete is not allowed for Communication Base Message Types, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Communication Base Message Types, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Field Name: Type
        * * Display Name: Type
        * * SQL Data Type: nvarchar(100)
        */
        get Type(): string {  
            return this.Get('Type');
        }
        set Type(value: string) {
            this.Set('Type', value);
        }
        /**
        * * Field Name: SupportsAttachments
        * * Display Name: Supports Attachments
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Indicates if attachments are supported.
        */
        get SupportsAttachments(): boolean {  
            return this.Get('SupportsAttachments');
        }
        set SupportsAttachments(value: boolean) {
            this.Set('SupportsAttachments', value);
        }
        /**
        * * Field Name: SupportsSubjectLine
        * * Display Name: Supports Subject Line
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Indicates if a subject line is supported.
        */
        get SupportsSubjectLine(): boolean {  
            return this.Get('SupportsSubjectLine');
        }
        set SupportsSubjectLine(value: boolean) {
            this.Set('SupportsSubjectLine', value);
        }
        /**
        * * Field Name: SupportsHtml
        * * Display Name: Supports Html
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Indicates if HTML content is supported.
        */
        get SupportsHtml(): boolean {  
            return this.Get('SupportsHtml');
        }
        set SupportsHtml(value: boolean) {
            this.Set('SupportsHtml', value);
        }
        /**
        * * Field Name: MaxBytes
        * * Display Name: Max Bytes
        * * SQL Data Type: int
        * * Description: The maximum size in bytes for the message.
        */
        get MaxBytes(): number | null {  
            return this.Get('MaxBytes');
        }
        set MaxBytes(value: number | null) {
            this.Set('MaxBytes', value);
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
     * Templates - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: Template
     * * Base View: vwTemplates
     * * @description Templates are used for dynamic expansion of a static template with data from a given context. Templates can be used to create documents, messages and anything else that requires dynamic document creation merging together static text, data and lightweight logic
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Templates')
    export class TemplateEntity extends BaseEntity {
        /**
        * Loads the Templates record from the database
        * @param ID: number - primary key value to load the Templates record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof TemplateEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Templates - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof TemplateEntity
        * @throws {Error} - Delete is not allowed for Templates, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Templates, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * SQL Data Type: nvarchar(255)
        * * Description: Name of the template
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
        * * Description: Description of the template
        */
        get Description(): string | null {  
            return this.Get('Description');
        }
        set Description(value: string | null) {
            this.Set('Description', value);
        }
        /**
        * * Field Name: UserPrompt
        * * Display Name: User Prompt
        * * SQL Data Type: nvarchar(MAX)
        * * Description: This prompt will be used by the AI to generate template content as requested by the user.
        */
        get UserPrompt(): string | null {  
            return this.Get('UserPrompt');
        }
        set UserPrompt(value: string | null) {
            this.Set('UserPrompt', value);
        }
        /**
        * * Field Name: CategoryID
        * * Display Name: Category ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Template Categories (vwTemplateCategories.ID)
        * * Description: Optional, Category that this template is part of
        */
        get CategoryID(): number | null {  
            return this.Get('CategoryID');
        }
        set CategoryID(value: number | null) {
            this.Set('CategoryID', value);
        }
        /**
        * * Field Name: UserID
        * * Display Name: User ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Users (vwUsers.ID)
        */
        get UserID(): number {  
            return this.Get('UserID');
        }
        set UserID(value: number) {
            this.Set('UserID', value);
        }
        /**
        * * Field Name: ActiveAt
        * * Display Name: Active At
        * * SQL Data Type: datetime
        * * Description: Optional, if provided, this template will not be available for use until the specified date. Requires IsActive to be set to 1
        */
        get ActiveAt(): Date | null {  
            return this.Get('ActiveAt');
        }
        set ActiveAt(value: Date | null) {
            this.Set('ActiveAt', value);
        }
        /**
        * * Field Name: DisabledAt
        * * Display Name: Disabled At
        * * SQL Data Type: datetime
        * * Description: Optional, if provided, this template will not be available for use after the specified date. If IsActive=0, this has no effect.
        */
        get DisabledAt(): Date | null {  
            return this.Get('DisabledAt');
        }
        set DisabledAt(value: Date | null) {
            this.Set('DisabledAt', value);
        }
        /**
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1
        * * Description: If set to 0, the template will be disabled regardless of the values in ActiveAt/DisabledAt. 
        */
        get IsActive(): boolean {  
            return this.Get('IsActive');
        }
        set IsActive(value: boolean) {
            this.Set('IsActive', value);
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
        * * Field Name: Category
        * * Display Name: Category
        * * SQL Data Type: nvarchar(255)
        */
        get Category(): string | null {  
            return this.Get('Category');
        }
        
        /**
        * * Field Name: User
        * * Display Name: User
        * * SQL Data Type: nvarchar(100)
        */
        get User(): string {  
            return this.Get('User');
        }
        

    }
        
    /**
     * Template Categories - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: TemplateCategory
     * * Base View: vwTemplateCategories
     * * @description Template categories for organizing templates
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Template Categories')
    export class TemplateCategoryEntity extends BaseEntity {
        /**
        * Loads the Template Categories record from the database
        * @param ID: number - primary key value to load the Template Categories record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof TemplateCategoryEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Template Categories - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof TemplateCategoryEntity
        * @throws {Error} - Delete is not allowed for Template Categories, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Template Categories, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * SQL Data Type: nvarchar(255)
        * * Description: Name of the template category
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
        * * Description: Description of the template category
        */
        get Description(): string | null {  
            return this.Get('Description');
        }
        set Description(value: string | null) {
            this.Set('Description', value);
        }
        /**
        * * Field Name: ParentID
        * * Display Name: Parent ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Template Categories (vwTemplateCategories.ID)
        */
        get ParentID(): number | null {  
            return this.Get('ParentID');
        }
        set ParentID(value: number | null) {
            this.Set('ParentID', value);
        }
        /**
        * * Field Name: UserID
        * * Display Name: User ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Users (vwUsers.ID)
        */
        get UserID(): number {  
            return this.Get('UserID');
        }
        set UserID(value: number) {
            this.Set('UserID', value);
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
        * * Field Name: Parent
        * * Display Name: Parent
        * * SQL Data Type: nvarchar(255)
        */
        get Parent(): string | null {  
            return this.Get('Parent');
        }
        
        /**
        * * Field Name: User
        * * Display Name: User
        * * SQL Data Type: nvarchar(100)
        */
        get User(): string {  
            return this.Get('User');
        }
        

    }
        
    /**
     * Template Contents - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: TemplateContent
     * * Base View: vwTemplateContents
     * * @description Template content for different versions of a template for purposes like HTML/Text/etc
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Template Contents')
    export class TemplateContentEntity extends BaseEntity {
        /**
        * Loads the Template Contents record from the database
        * @param ID: number - primary key value to load the Template Contents record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof TemplateContentEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Template Contents - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof TemplateContentEntity
        * @throws {Error} - Delete is not allowed for Template Contents, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Template Contents, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Field Name: TemplateID
        * * Display Name: Template ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Templates (vwTemplates.ID)
        */
        get TemplateID(): number {  
            return this.Get('TemplateID');
        }
        set TemplateID(value: number) {
            this.Set('TemplateID', value);
        }
        /**
        * * Field Name: TypeID
        * * Display Name: Type ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Template Content Types (vwTemplateContentTypes.ID)
        */
        get TypeID(): number {  
            return this.Get('TypeID');
        }
        set TypeID(value: number) {
            this.Set('TypeID', value);
        }
        /**
        * * Field Name: TemplateText
        * * Display Name: Template Text
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The actual text content for the template
        */
        get TemplateText(): string | null {  
            return this.Get('TemplateText');
        }
        set TemplateText(value: string | null) {
            this.Set('TemplateText', value);
        }
        /**
        * * Field Name: Priority
        * * Display Name: Priority
        * * SQL Data Type: int
        * * Description: Priority of the content version, higher priority versions will be used ahead of lower priority versions for a given Type
        */
        get Priority(): number {  
            return this.Get('Priority');
        }
        set Priority(value: number) {
            this.Set('Priority', value);
        }
        /**
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1
        * * Description: Indicates whether the content is active or not. Use this to disable a particular Template Content item without having to remove it
        */
        get IsActive(): boolean {  
            return this.Get('IsActive');
        }
        set IsActive(value: boolean) {
            this.Set('IsActive', value);
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
        * * Field Name: Template
        * * Display Name: Template
        * * SQL Data Type: nvarchar(255)
        */
        get Template(): string {  
            return this.Get('Template');
        }
        
        /**
        * * Field Name: Type
        * * Display Name: Type
        * * SQL Data Type: nvarchar(255)
        */
        get Type(): string {  
            return this.Get('Type');
        }
        

    }
        
    /**
     * Template Params - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: TemplateParam
     * * Base View: vwTemplateParams
     * * @description Parameters allowed for use inside the template
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Template Params')
    export class TemplateParamEntity extends BaseEntity {
        /**
        * Loads the Template Params record from the database
        * @param ID: number - primary key value to load the Template Params record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof TemplateParamEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Template Params - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof TemplateParamEntity
        * @throws {Error} - Delete is not allowed for Template Params, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Template Params, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Field Name: TemplateID
        * * Display Name: Template ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Templates (vwTemplates.ID)
        * * Description: ID of the template this parameter belongs to
        */
        get TemplateID(): number {  
            return this.Get('TemplateID');
        }
        set TemplateID(value: number) {
            this.Set('TemplateID', value);
        }
        /**
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)
        * * Description: Name of the parameter
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
        * * Description: Description of the parameter
        */
        get Description(): string | null {  
            return this.Get('Description');
        }
        set Description(value: string | null) {
            this.Set('Description', value);
        }
        /**
        * * Field Name: Type
        * * Display Name: Type
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Scalar
        * * Value List Type: List
        * * Possible Values 
        *   * Scalar
        *   * Array
        *   * Object
        *   * Record
        * * Description: Type of the parameter
        */
        get Type(): 'Scalar' | 'Array' | 'Object' | 'Record' {  
            return this.Get('Type');
        }
        set Type(value: 'Scalar' | 'Array' | 'Object' | 'Record') {
            this.Set('Type', value);
        }
        /**
        * * Field Name: DefaultValue
        * * Display Name: Default Value
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Default value of the parameter
        */
        get DefaultValue(): string | null {  
            return this.Get('DefaultValue');
        }
        set DefaultValue(value: string | null) {
            this.Set('DefaultValue', value);
        }
        /**
        * * Field Name: IsRequired
        * * Display Name: Is Required
        * * SQL Data Type: bit
        * * Default Value: 0
        */
        get IsRequired(): boolean {  
            return this.Get('IsRequired');
        }
        set IsRequired(value: boolean) {
            this.Set('IsRequired', value);
        }
        /**
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)
        * * Description: Entity ID, used only when Type is Record
        */
        get EntityID(): number | null {  
            return this.Get('EntityID');
        }
        set EntityID(value: number | null) {
            this.Set('EntityID', value);
        }
        /**
        * * Field Name: RecordID
        * * Display Name: Record ID
        * * SQL Data Type: nvarchar(2000)
        * * Description: Record ID, used only when Type is Record
        */
        get RecordID(): string | null {  
            return this.Get('RecordID');
        }
        set RecordID(value: string | null) {
            this.Set('RecordID', value);
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
        * * Field Name: Template
        * * Display Name: Template
        * * SQL Data Type: nvarchar(255)
        */
        get Template(): string {  
            return this.Get('Template');
        }
        
        /**
        * * Field Name: Entity
        * * Display Name: Entity
        * * SQL Data Type: nvarchar(255)
        */
        get Entity(): string | null {  
            return this.Get('Entity');
        }
        

    }
        
    /**
     * Template Content Types - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: TemplateContentType
     * * Base View: vwTemplateContentTypes
     * * @description Template content types for categorizing content within templates
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Template Content Types')
    export class TemplateContentTypeEntity extends BaseEntity {
        /**
        * Loads the Template Content Types record from the database
        * @param ID: number - primary key value to load the Template Content Types record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof TemplateContentTypeEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Template Content Types - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof TemplateContentTypeEntity
        * @throws {Error} - Delete is not allowed for Template Content Types, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Template Content Types, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * SQL Data Type: nvarchar(255)
        * * Description: Name of the template content type
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
        * * Description: Description of the template content type
        */
        get Description(): string | null {  
            return this.Get('Description');
        }
        set Description(value: string | null) {
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
     * Recommendations - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: Recommendation
     * * Base View: vwRecommendations
     * * @description Recommendation headers that store the left side of the recommendation which we track in the SourceEntityID/SourceEntityRecordID
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Recommendations')
    export class RecommendationEntity extends BaseEntity {
        /**
        * Loads the Recommendations record from the database
        * @param ID: number - primary key value to load the Recommendations record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof RecommendationEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Recommendations - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof RecommendationEntity
        * @throws {Error} - Delete is not allowed for Recommendations, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Recommendations, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Field Name: RecommendationRunID
        * * Display Name: Recommendation Run ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Recommendation Runs (vwRecommendationRuns.ID)
        */
        get RecommendationRunID(): number {  
            return this.Get('RecommendationRunID');
        }
        set RecommendationRunID(value: number) {
            this.Set('RecommendationRunID', value);
        }
        /**
        * * Field Name: SourceEntityID
        * * Display Name: Source Entity ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)
        */
        get SourceEntityID(): number {  
            return this.Get('SourceEntityID');
        }
        set SourceEntityID(value: number) {
            this.Set('SourceEntityID', value);
        }
        /**
        * * Field Name: SourceEntityRecordID
        * * Display Name: Source Entity Record ID
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The record ID of the source entity
        */
        get SourceEntityRecordID(): string {  
            return this.Get('SourceEntityRecordID');
        }
        set SourceEntityRecordID(value: string) {
            this.Set('SourceEntityRecordID', value);
        }
        /**
        * * Field Name: CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetime
        * * Default Value: getdate()
        */
        get CreatedAt(): Date | null {  
            return this.Get('CreatedAt');
        }
        
        /**
        * * Field Name: UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetime
        * * Default Value: getdate()
        */
        get UpdatedAt(): Date | null {  
            return this.Get('UpdatedAt');
        }
        
        /**
        * * Field Name: SourceEntity
        * * Display Name: Source Entity
        * * SQL Data Type: nvarchar(255)
        */
        get SourceEntity(): string {  
            return this.Get('SourceEntity');
        }
        

    }
        
    /**
     * Recommendation Providers - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: RecommendationProvider
     * * Base View: vwRecommendationProviders
     * * @description Recommendation providers details
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Recommendation Providers')
    export class RecommendationProviderEntity extends BaseEntity {
        /**
        * Loads the Recommendation Providers record from the database
        * @param ID: number - primary key value to load the Recommendation Providers record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof RecommendationProviderEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Recommendation Providers - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof RecommendationProviderEntity
        * @throws {Error} - Delete is not allowed for Recommendation Providers, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Recommendation Providers, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Field Name: CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetime
        * * Default Value: getdate()
        */
        get CreatedAt(): Date | null {  
            return this.Get('CreatedAt');
        }
        
        /**
        * * Field Name: UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetime
        * * Default Value: getdate()
        */
        get UpdatedAt(): Date | null {  
            return this.Get('UpdatedAt');
        }
        

    }
        
    /**
     * Recommendation Runs - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: RecommendationRun
     * * Base View: vwRecommendationRuns
     * * @description Recommendation runs log each time a provider is requested to provide recommendations
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Recommendation Runs')
    export class RecommendationRunEntity extends BaseEntity {
        /**
        * Loads the Recommendation Runs record from the database
        * @param ID: number - primary key value to load the Recommendation Runs record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof RecommendationRunEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Recommendation Runs - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof RecommendationRunEntity
        * @throws {Error} - Delete is not allowed for Recommendation Runs, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Recommendation Runs, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Field Name: RecommendationProviderID
        * * Display Name: Recommendation Provider ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Recommendation Providers (vwRecommendationProviders.ID)
        */
        get RecommendationProviderID(): number {  
            return this.Get('RecommendationProviderID');
        }
        set RecommendationProviderID(value: number) {
            this.Set('RecommendationProviderID', value);
        }
        /**
        * * Field Name: StartDate
        * * Display Name: Start Date
        * * SQL Data Type: datetime
        * * Description: The start date of the recommendation run
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
        * * Description: The end date of the recommendation run
        */
        get EndDate(): Date | null {  
            return this.Get('EndDate');
        }
        set EndDate(value: Date | null) {
            this.Set('EndDate', value);
        }
        /**
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(50)
        * * Value List Type: List
        * * Possible Values 
        *   * Pending
        *   * In Progress
        *   * Completed
        *   * Canceled
        *   * Error
        * * Description: The status of the recommendation run
        */
        get Status(): 'Pending' | 'In Progress' | 'Completed' | 'Canceled' | 'Error' {  
            return this.Get('Status');
        }
        set Status(value: 'Pending' | 'In Progress' | 'Completed' | 'Canceled' | 'Error') {
            this.Set('Status', value);
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
        * * Field Name: RunByUserID
        * * Display Name: Run By User ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Users (vwUsers.ID)
        */
        get RunByUserID(): number {  
            return this.Get('RunByUserID');
        }
        set RunByUserID(value: number) {
            this.Set('RunByUserID', value);
        }
        /**
        * * Field Name: CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetime
        * * Default Value: getdate()
        */
        get CreatedAt(): Date | null {  
            return this.Get('CreatedAt');
        }
        
        /**
        * * Field Name: UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetime
        * * Default Value: getdate()
        */
        get UpdatedAt(): Date | null {  
            return this.Get('UpdatedAt');
        }
        
        /**
        * * Field Name: RecommendationProvider
        * * Display Name: Recommendation Provider
        * * SQL Data Type: nvarchar(255)
        */
        get RecommendationProvider(): string {  
            return this.Get('RecommendationProvider');
        }
        
        /**
        * * Field Name: RunByUser
        * * Display Name: Run By User
        * * SQL Data Type: nvarchar(100)
        */
        get RunByUser(): string {  
            return this.Get('RunByUser');
        }
        

    }
        
    /**
     * Recommendation Items - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: RecommendationItem
     * * Base View: vwRecommendationItems
     * * @description Table to store individual recommendation items that are the right side of the recommendation which we track in the DestinationEntityID/DestinationEntityRecordID
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Recommendation Items')
    export class RecommendationItemEntity extends BaseEntity {
        /**
        * Loads the Recommendation Items record from the database
        * @param ID: number - primary key value to load the Recommendation Items record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof RecommendationItemEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Recommendation Items - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof RecommendationItemEntity
        * @throws {Error} - Delete is not allowed for Recommendation Items, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Recommendation Items, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Field Name: RecommendationID
        * * Display Name: Recommendation ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Recommendations (vwRecommendations.ID)
        */
        get RecommendationID(): number {  
            return this.Get('RecommendationID');
        }
        set RecommendationID(value: number) {
            this.Set('RecommendationID', value);
        }
        /**
        * * Field Name: DestinationEntityID
        * * Display Name: Destination Entity ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)
        * * Description: The ID of the destination entity
        */
        get DestinationEntityID(): number {  
            return this.Get('DestinationEntityID');
        }
        set DestinationEntityID(value: number) {
            this.Set('DestinationEntityID', value);
        }
        /**
        * * Field Name: DestinationEntityRecordID
        * * Display Name: Destination Entity Record ID
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The record ID of the destination entity
        */
        get DestinationEntityRecordID(): string {  
            return this.Get('DestinationEntityRecordID');
        }
        set DestinationEntityRecordID(value: string) {
            this.Set('DestinationEntityRecordID', value);
        }
        /**
        * * Field Name: MatchProbability
        * * Display Name: Match Probability
        * * SQL Data Type: decimal(18, 15)
        * * Description: A value between 0 and 1 indicating the probability of the match, higher numbers indicating a more certain match/recommendation.
        */
        get MatchProbability(): number | null {  
            return this.Get('MatchProbability');
        }
        set MatchProbability(value: number | null) {
            this.Set('MatchProbability', value);
        }
        /**
        * * Field Name: CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetime
        * * Default Value: getdate()
        */
        get CreatedAt(): Date | null {  
            return this.Get('CreatedAt');
        }
        
        /**
        * * Field Name: UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetime
        * * Default Value: getdate()
        */
        get UpdatedAt(): Date | null {  
            return this.Get('UpdatedAt');
        }
        
        /**
        * * Field Name: DestinationEntity
        * * Display Name: Destination Entity
        * * SQL Data Type: nvarchar(255)
        */
        get DestinationEntity(): string {  
            return this.Get('DestinationEntity');
        }
        

    }
        
    /**
     * Entity Communication Message Types - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: EntityCommunicationMessageType
     * * Base View: vwEntityCommunicationMessageTypes
     * * @description Mapping between entities and communication base message types
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Entity Communication Message Types')
    export class EntityCommunicationMessageTypeEntity extends BaseEntity {
        /**
        * Loads the Entity Communication Message Types record from the database
        * @param ID: number - primary key value to load the Entity Communication Message Types record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof EntityCommunicationMessageTypeEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Entity Communication Message Types - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof EntityCommunicationMessageTypeEntity
        * @throws {Error} - Delete is not allowed for Entity Communication Message Types, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Entity Communication Message Types, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)
        * * Description: ID of the entity
        */
        get EntityID(): number {  
            return this.Get('EntityID');
        }
        set EntityID(value: number) {
            this.Set('EntityID', value);
        }
        /**
        * * Field Name: BaseMessageTypeID
        * * Display Name: Base Message Type ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Communication Base Message Types (vwCommunicationBaseMessageTypes.ID)
        * * Description: ID of the communication base message type
        */
        get BaseMessageTypeID(): number {  
            return this.Get('BaseMessageTypeID');
        }
        set BaseMessageTypeID(value: number) {
            this.Set('BaseMessageTypeID', value);
        }
        /**
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1
        * * Description: Indicates whether the message type is active
        */
        get IsActive(): boolean {  
            return this.Get('IsActive');
        }
        set IsActive(value: boolean) {
            this.Set('IsActive', value);
        }
        /**
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_CreatedAt(): Date {  
            return this.Get('__mj_CreatedAt');
        }
        
        /**
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_UpdatedAt(): Date {  
            return this.Get('__mj_UpdatedAt');
        }
        
        /**
        * * Field Name: Entity
        * * Display Name: Entity
        * * SQL Data Type: nvarchar(255)
        */
        get Entity(): string {  
            return this.Get('Entity');
        }
        
        /**
        * * Field Name: BaseMessageType
        * * Display Name: Base Message Type
        * * SQL Data Type: nvarchar(100)
        * * Default Value: getutcdate()
        */
        get BaseMessageType(): string {  
            return this.Get('BaseMessageType');
        }
        

    }
        
    /**
     * Entity Communication Fields - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: EntityCommunicationField
     * * Base View: vwEntityCommunicationFields
     * * @description Mapping between entity fields and communication base message types with priority
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Entity Communication Fields')
    export class EntityCommunicationFieldEntity extends BaseEntity {
        /**
        * Loads the Entity Communication Fields record from the database
        * @param ID: number - primary key value to load the Entity Communication Fields record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof EntityCommunicationFieldEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Entity Communication Fields - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof EntityCommunicationFieldEntity
        * @throws {Error} - Delete is not allowed for Entity Communication Fields, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Entity Communication Fields, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Field Name: EntityCommunicationMessageTypeID
        * * Display Name: Entity Communication Message Type ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Entity Communication Message Types (vwEntityCommunicationMessageTypes.ID)
        * * Description: ID of the entity communication message type
        */
        get EntityCommunicationMessageTypeID(): number {  
            return this.Get('EntityCommunicationMessageTypeID');
        }
        set EntityCommunicationMessageTypeID(value: number) {
            this.Set('EntityCommunicationMessageTypeID', value);
        }
        /**
        * * Field Name: FieldName
        * * Display Name: Field Name
        * * SQL Data Type: nvarchar(500)
        * * Description: Name of the field in the entity that maps to the communication base message type
        */
        get FieldName(): string {  
            return this.Get('FieldName');
        }
        set FieldName(value: string) {
            this.Set('FieldName', value);
        }
        /**
        * * Field Name: Priority
        * * Display Name: Priority
        * * SQL Data Type: int
        * * Description: Priority of the field for the communication base message type
        */
        get Priority(): number {  
            return this.Get('Priority');
        }
        set Priority(value: number) {
            this.Set('Priority', value);
        }
        /**
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_CreatedAt(): Date {  
            return this.Get('__mj_CreatedAt');
        }
        
        /**
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        */
        get __mj_UpdatedAt(): Date {  
            return this.Get('__mj_UpdatedAt');
        }
        

    }
        
    /**
     * Record Change Replay Runs - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: RecordChangeReplayRun
     * * Base View: vwRecordChangeReplayRuns
     * * @description Table to track the runs of replaying external record changes
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Record Change Replay Runs')
    export class RecordChangeReplayRunEntity extends BaseEntity {
        /**
        * Loads the Record Change Replay Runs record from the database
        * @param ID: number - primary key value to load the Record Change Replay Runs record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof RecordChangeReplayRunEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Record Change Replay Runs - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof RecordChangeReplayRunEntity
        * @throws {Error} - Delete is not allowed for Record Change Replay Runs, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Record Change Replay Runs, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Field Name: StartedAt
        * * Display Name: Started At
        * * SQL Data Type: datetime
        * * Description: Timestamp when the replay run started
        */
        get StartedAt(): Date {  
            return this.Get('StartedAt');
        }
        set StartedAt(value: Date) {
            this.Set('StartedAt', value);
        }
        /**
        * * Field Name: EndedAt
        * * Display Name: Ended At
        * * SQL Data Type: datetime
        * * Description: Timestamp when the replay run ended
        */
        get EndedAt(): Date | null {  
            return this.Get('EndedAt');
        }
        set EndedAt(value: Date | null) {
            this.Set('EndedAt', value);
        }
        /**
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(50)
        * * Value List Type: List
        * * Possible Values 
        *   * Pending
        *   * In Progress
        *   * Complete
        *   * Error
        * * Description: Status of the replay run (Pending, In Progress, Complete, Error)
        */
        get Status(): 'Pending' | 'In Progress' | 'Complete' | 'Error' {  
            return this.Get('Status');
        }
        set Status(value: 'Pending' | 'In Progress' | 'Complete' | 'Error') {
            this.Set('Status', value);
        }
        /**
        * * Field Name: UserID
        * * Display Name: User ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Users (vwUsers.ID)
        */
        get UserID(): number {  
            return this.Get('UserID');
        }
        set UserID(value: number) {
            this.Set('UserID', value);
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
        * * Field Name: User
        * * Display Name: User
        * * SQL Data Type: nvarchar(100)
        */
        get User(): string {  
            return this.Get('User');
        }
        

    }
        
    /**
     * Library Items - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: LibraryItem
     * * Base View: vwLibraryItems
     * * @description Table to store individual library items
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Library Items')
    export class LibraryItemEntity extends BaseEntity {
        /**
        * Loads the Library Items record from the database
        * @param ID: number - primary key value to load the Library Items record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof LibraryItemEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Library Items - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof LibraryItemEntity
        * @throws {Error} - Delete is not allowed for Library Items, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Library Items, to enable it set AllowDeleteAPI to 1 in the database.');
        } 
            
            /**
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: int
        * * Description: Primary key of the LibraryItem table.
        */
        get ID(): number {  
            return this.Get('ID');
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
        * * Field Name: LibraryID
        * * Display Name: Library ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Libraries (vwLibraries.ID)
        */
        get LibraryID(): number {  
            return this.Get('LibraryID');
        }
        set LibraryID(value: number) {
            this.Set('LibraryID', value);
        }
        /**
        * * Field Name: Type
        * * Display Name: Type
        * * SQL Data Type: nvarchar(50)
        * * Value List Type: List
        * * Possible Values 
        *   * Class
        *   * Interface
        *   * Variable
        *   * Type
        *   * Module
        *   * Function
        * * Description: Type of the library item for example Class, Interface, etc.
        */
        get Type(): 'Class' | 'Interface' | 'Variable' | 'Type' | 'Module' | 'Function' {  
            return this.Get('Type');
        }
        set Type(value: 'Class' | 'Interface' | 'Variable' | 'Type' | 'Module' | 'Function') {
            this.Set('Type', value);
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
        * * Field Name: Library
        * * Display Name: Library
        * * SQL Data Type: nvarchar(255)
        */
        get Library(): string {  
            return this.Get('Library');
        }
        

    }
        
    /**
     * Entity Relationship Display Components - strongly typed entity sub-class
     * * Schema: __mj
     * * Base Table: EntityRelationshipDisplayComponent
     * * Base View: vwEntityRelationshipDisplayComponents
     * * @description This table stores a list of components that are available for displaying relationships in the MJ Explorer UI
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Entity Relationship Display Components')
    export class EntityRelationshipDisplayComponentEntity extends BaseEntity {
        /**
        * Loads the Entity Relationship Display Components record from the database
        * @param ID: number - primary key value to load the Entity Relationship Display Components record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof EntityRelationshipDisplayComponentEntity
        * @method
        * @override
        */      
        public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const compositeKey: CompositeKey = new CompositeKey();
            compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
        }
            
        /**
        * Entity Relationship Display Components - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof EntityRelationshipDisplayComponentEntity
        * @throws {Error} - Delete is not allowed for Entity Relationship Display Components, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Entity Relationship Display Components, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Field Name: RelationshipType
        * * Display Name: Relationship Type
        * * SQL Data Type: nvarchar(20)
        * * Value List Type: List
        * * Possible Values 
        *   * One to Many
        *   * Many to Many
        *   * Both
        * * Description: The type of relationship the component displays. Valid values are "One to Many", "Many to Many", or "Both".
        */
        get RelationshipType(): 'One to Many' | 'Many to Many' | 'Both' {  
            return this.Get('RelationshipType');
        }
        set RelationshipType(value: 'One to Many' | 'Many to Many' | 'Both') {
            this.Set('RelationshipType', value);
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
        