import { BaseEntity, PrimaryKeyValue, EntitySaveOptions } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";

    /**
     * Companies - strongly typed entity sub-class
     * * Schema: admin
     * * Base Table: Company
     * * Base View: vwCompanies
     * * @description List of Companies/Organizations within the top-level business, used for subsidiaries
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Companies')
    export class CompanyEntity extends BaseEntity {
        /**
        * Loads the Companies record from the database
        * @param ID: Number - primary key value to load the Companies record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof CompanyEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
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
        get Website(): string {  
            return this.Get('Website');
        }
        set Website(value: string) {
            this.Set('Website', value);
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

    }
    
    /**
     * Employees - strongly typed entity sub-class
     * * Schema: admin
     * * Base Table: Employee
     * * Base View: vwEmployees
     * * @description Employees
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Employees')
    export class EmployeeEntity extends BaseEntity {
        /**
        * Loads the Employees record from the database
        * @param ID: Number - primary key value to load the Employees record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof EmployeeEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
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
        get Title(): string {  
            return this.Get('Title');
        }
        set Title(value: string) {
            this.Set('Title', value);
        }
        /**
        * * Field Name: Email
        * * SQL Data Type: nvarchar(100)
        * * Description: 5
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
        get Phone(): string {  
            return this.Get('Phone');
        }
        set Phone(value: string) {
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
        * * Related Entity: Companies
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
        * * Related Entity: Employees
        */
        get SupervisorID(): number {  
            return this.Get('SupervisorID');
        }
        set SupervisorID(value: number) {
            this.Set('SupervisorID', value);
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
        * * Field Name: FirstLast
        * * Display Name: First Last
        * * SQL Data Type: nvarchar(81)
        */
        get FirstLast(): string {  
            return this.Get('FirstLast');
        }
    
        /**
        * * Field Name: Supervisor
        * * Display Name: Supervisor
        * * SQL Data Type: nvarchar(81)
        */
        get Supervisor(): string {  
            return this.Get('Supervisor');
        }
    
        /**
        * * Field Name: SupervisorFirstName
        * * Display Name: Supervisor First Name
        * * SQL Data Type: nvarchar(30)
        */
        get SupervisorFirstName(): string {  
            return this.Get('SupervisorFirstName');
        }
    
        /**
        * * Field Name: SupervisorLastName
        * * Display Name: Supervisor Last Name
        * * SQL Data Type: nvarchar(50)
        */
        get SupervisorLastName(): string {  
            return this.Get('SupervisorLastName');
        }
    
        /**
        * * Field Name: SupervisorEmail
        * * Display Name: Supervisor Email
        * * SQL Data Type: nvarchar(100)
        */
        get SupervisorEmail(): string {  
            return this.Get('SupervisorEmail');
        }
    

    }
    
    /**
     * User Favorites - strongly typed entity sub-class
     * * Schema: admin
     * * Base Table: UserFavorite
     * * Base View: vwUserFavorites
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'User Favorites')
    export class UserFavoriteEntity extends BaseEntity {
        /**
        * Loads the User Favorites record from the database
        * @param ID: Number - primary key value to load the User Favorites record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof UserFavoriteEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
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
        * * Related Entity: Users
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
        * * Related Entity: Entities
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
     * * Schema: admin
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
        * @param ID: Number - primary key value to load the Employee Company Integrations record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof EmployeeCompanyIntegrationEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
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
        * * Related Entity: Employees
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
     * * Schema: admin
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
        * @param ID: Number - primary key value to load the Employee Roles record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof EmployeeRoleEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
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
        * * Related Entity: Employees
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
        * * Related Entity: Roles
        */
        get RoleID(): number {  
            return this.Get('RoleID');
        }
        set RoleID(value: number) {
            this.Set('RoleID', value);
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
        * * Field Name: Role
        * * Display Name: Role
        * * SQL Data Type: nvarchar(50)
        */
        get Role(): string {  
            return this.Get('Role');
        }
    

    }
    
    /**
     * Employee Skills - strongly typed entity sub-class
     * * Schema: admin
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
        * @param ID: Number - primary key value to load the Employee Skills record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof EmployeeSkillEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
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
        * * Related Entity: Employees
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
        * * Related Entity: Skills
        */
        get SkillID(): number {  
            return this.Get('SkillID');
        }
        set SkillID(value: number) {
            this.Set('SkillID', value);
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
        * * Field Name: Skill
        * * Display Name: Skill
        * * SQL Data Type: nvarchar(50)
        */
        get Skill(): string {  
            return this.Get('Skill');
        }
    

    }
    
    /**
     * Roles - strongly typed entity sub-class
     * * Schema: admin
     * * Base Table: Role
     * * Base View: vwRoles
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Roles')
    export class RoleEntity extends BaseEntity {
        /**
        * Loads the Roles record from the database
        * @param ID: Number - primary key value to load the Roles record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof RoleEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
        }
        
        /**
        * Roles - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof RoleEntity
        * @throws {Error} - Delete is not allowed for Roles, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Roles, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * SQL Data Type: nvarchar(500)
        */
        get Description(): string {  
            return this.Get('Description');
        }
        set Description(value: string) {
            this.Set('Description', value);
        }
        /**
        * * Field Name: AzureID
        * * Display Name: Azure
        * * SQL Data Type: nvarchar(50)
        */
        get AzureID(): string {  
            return this.Get('AzureID');
        }
        set AzureID(value: string) {
            this.Set('AzureID', value);
        }
        /**
        * * Field Name: SQLName
        * * SQL Data Type: nvarchar(50)
        */
        get SQLName(): string {  
            return this.Get('SQLName');
        }
        set SQLName(value: string) {
            this.Set('SQLName', value);
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
     * Skills - strongly typed entity sub-class
     * * Schema: admin
     * * Base Table: Skill
     * * Base View: vwSkills
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Skills')
    export class SkillEntity extends BaseEntity {
        /**
        * Loads the Skills record from the database
        * @param ID: Number - primary key value to load the Skills record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof SkillEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
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
        * * Related Entity: Skills
        */
        get ParentID(): number {  
            return this.Get('ParentID');
        }
        set ParentID(value: number) {
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
        get Parent(): string {  
            return this.Get('Parent');
        }
    

    }
    
    /**
     * Integration URL Formats - strongly typed entity sub-class
     * * Schema: admin
     * * Base Table: IntegrationURLFormat
     * * Base View: vwIntegrationURLFormats
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Integration URL Formats')
    export class IntegrationURLFormatEntity extends BaseEntity {
        /**
        * Loads the Integration URL Formats record from the database
        * @param ID: Number - primary key value to load the Integration URL Formats record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof IntegrationURLFormatEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
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
        * * Related Entity: Integrations
        */
        get IntegrationName(): string {  
            return this.Get('IntegrationName');
        }
        set IntegrationName(value: string) {
            this.Set('IntegrationName', value);
        }
        /**
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: int
        * * Related Entity: Entities
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
        get NavigationBaseURL(): string {  
            return this.Get('NavigationBaseURL');
        }
    
        /**
        * * Field Name: FullURLFormat
        * * Display Name: Full URLFormat
        * * SQL Data Type: nvarchar(1000)
        */
        get FullURLFormat(): string {  
            return this.Get('FullURLFormat');
        }
    

    }
    
    /**
     * Integrations - strongly typed entity sub-class
     * * Schema: admin
     * * Base Table: Integration
     * * Base View: vwIntegrations
     * * @description List of integrations that can be executed using the MemberJunction integration architecture.
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Integrations')
    export class IntegrationEntity extends BaseEntity {
        /**
        * Loads the Integrations record from the database
        * @param ID: Number - primary key value to load the Integrations record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof IntegrationEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
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
        get Description(): string {  
            return this.Get('Description');
        }
        set Description(value: string) {
            this.Set('Description', value);
        }
        /**
        * * Field Name: NavigationBaseURL
        * * Display Name: Navigation Base URL
        * * SQL Data Type: nvarchar(500)
        */
        get NavigationBaseURL(): string {  
            return this.Get('NavigationBaseURL');
        }
        set NavigationBaseURL(value: string) {
            this.Set('NavigationBaseURL', value);
        }
        /**
        * * Field Name: ClassName
        * * Display Name: Class Name
        * * SQL Data Type: nvarchar(100)
        */
        get ClassName(): string {  
            return this.Get('ClassName');
        }
        set ClassName(value: string) {
            this.Set('ClassName', value);
        }
        /**
        * * Field Name: ImportPath
        * * Display Name: Import Path
        * * SQL Data Type: nvarchar(100)
        */
        get ImportPath(): string {  
            return this.Get('ImportPath');
        }
        set ImportPath(value: string) {
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
     * * Schema: admin
     * * Base Table: CompanyIntegration
     * * Base View: vwCompanyIntegrations
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Company Integrations')
    export class CompanyIntegrationEntity extends BaseEntity {
        /**
        * Loads the Company Integrations record from the database
        * @param ID: Number - primary key value to load the Company Integrations record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof CompanyIntegrationEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
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
        * * Related Entity: Companies
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
        * * Related Entity: Integrations
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
        get IsActive(): boolean {  
            return this.Get('IsActive');
        }
        set IsActive(value: boolean) {
            this.Set('IsActive', value);
        }
        /**
        * * Field Name: AccessToken
        * * Display Name: Access Token
        * * SQL Data Type: nvarchar(255)
        */
        get AccessToken(): string {  
            return this.Get('AccessToken');
        }
        set AccessToken(value: string) {
            this.Set('AccessToken', value);
        }
        /**
        * * Field Name: RefreshToken
        * * Display Name: Refresh Token
        * * SQL Data Type: nvarchar(255)
        */
        get RefreshToken(): string {  
            return this.Get('RefreshToken');
        }
        set RefreshToken(value: string) {
            this.Set('RefreshToken', value);
        }
        /**
        * * Field Name: TokenExpirationDate
        * * Display Name: Token Expiration Date
        * * SQL Data Type: datetime
        */
        get TokenExpirationDate(): Date {  
            return this.Get('TokenExpirationDate');
        }
        set TokenExpirationDate(value: Date) {
            this.Set('TokenExpirationDate', value);
        }
        /**
        * * Field Name: APIKey
        * * SQL Data Type: nvarchar(255)
        */
        get APIKey(): string {  
            return this.Get('APIKey');
        }
        set APIKey(value: string) {
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
        get ExternalSystemID(): string {  
            return this.Get('ExternalSystemID');
        }
        set ExternalSystemID(value: string) {
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
        get ClientID(): string {  
            return this.Get('ClientID');
        }
        set ClientID(value: string) {
            this.Set('ClientID', value);
        }
        /**
        * * Field Name: ClientSecret
        * * Display Name: Client Secret
        * * SQL Data Type: nvarchar(255)
        */
        get ClientSecret(): string {  
            return this.Get('ClientSecret');
        }
        set ClientSecret(value: string) {
            this.Set('ClientSecret', value);
        }
        /**
        * * Field Name: CustomAttribute1
        * * Display Name: Custom Attribute 1
        * * SQL Data Type: nvarchar(255)
        */
        get CustomAttribute1(): string {  
            return this.Get('CustomAttribute1');
        }
        set CustomAttribute1(value: string) {
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
        get DriverClassName(): string {  
            return this.Get('DriverClassName');
        }
    
        /**
        * * Field Name: DriverImportPath
        * * Display Name: Driver Import Path
        * * SQL Data Type: nvarchar(100)
        */
        get DriverImportPath(): string {  
            return this.Get('DriverImportPath');
        }
    
        /**
        * * Field Name: LastRunID
        * * Display Name: LastRun
        * * SQL Data Type: int
        */
        get LastRunID(): number {  
            return this.Get('LastRunID');
        }
    
        /**
        * * Field Name: LastRunStartedAt
        * * Display Name: Last Run Started At
        * * SQL Data Type: datetime
        */
        get LastRunStartedAt(): Date {  
            return this.Get('LastRunStartedAt');
        }
    
        /**
        * * Field Name: LastRunEndedAt
        * * Display Name: Last Run Ended At
        * * SQL Data Type: datetime
        */
        get LastRunEndedAt(): Date {  
            return this.Get('LastRunEndedAt');
        }
    

    }
    
    /**
     * Entity Fields - strongly typed entity sub-class
     * * Schema: admin
     * * Base Table: EntityField
     * * Base View: vwEntityFields
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Entity Fields')
    export class EntityFieldEntity extends BaseEntity {
        /**
        * Loads the Entity Fields record from the database
        * @param ID: Number - primary key value to load the Entity Fields record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof EntityFieldEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
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
        */
        get EntityID(): number {  
            return this.Get('EntityID');
        }
    
        /**
        * * Field Name: Sequence
        * * SQL Data Type: int
        * * Default Value: 0
        */
        get Sequence(): number {  
            return this.Get('Sequence');
        }
    
        /**
        * * Field Name: Name
        * * SQL Data Type: nvarchar(255)
        */
        get Name(): string {  
            return this.Get('Name');
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
        * * SQL Data Type: nvarchar(MAX)
        */
        get Description(): string {  
            return this.Get('Description');
        }
        set Description(value: string) {
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
        */
        get Category(): string {  
            return this.Get('Category');
        }
        set Category(value: string) {
            this.Set('Category', value);
        }
        /**
        * * Field Name: Type
        * * SQL Data Type: nvarchar(100)
        */
        get Type(): string {  
            return this.Get('Type');
        }
    
        /**
        * * Field Name: Length
        * * SQL Data Type: int
        */
        get Length(): number {  
            return this.Get('Length');
        }
    
        /**
        * * Field Name: Precision
        * * SQL Data Type: int
        */
        get Precision(): number {  
            return this.Get('Precision');
        }
    
        /**
        * * Field Name: Scale
        * * SQL Data Type: int
        */
        get Scale(): number {  
            return this.Get('Scale');
        }
    
        /**
        * * Field Name: AllowsNull
        * * Display Name: Allows Null
        * * SQL Data Type: bit
        * * Default Value: 1
        */
        get AllowsNull(): boolean {  
            return this.Get('AllowsNull');
        }
    
        /**
        * * Field Name: DefaultValue
        * * Display Name: Default Value
        * * SQL Data Type: nvarchar(255)
        */
        get DefaultValue(): string {  
            return this.Get('DefaultValue');
        }
    
        /**
        * * Field Name: AutoIncrement
        * * Display Name: Auto Increment
        * * SQL Data Type: bit
        * * Default Value: 0
        */
        get AutoIncrement(): boolean {  
            return this.Get('AutoIncrement');
        }
    
        /**
        * * Field Name: ValueListType
        * * Display Name: Value List Type
        * * SQL Data Type: nvarchar(20)
        * * Default Value: N'None'
        */
        get ValueListType(): string {  
            return this.Get('ValueListType');
        }
        set ValueListType(value: string) {
            this.Set('ValueListType', value);
        }
        /**
        * * Field Name: ExtendedType
        * * Display Name: Extended Type
        * * SQL Data Type: nvarchar(50)
        */
        get ExtendedType(): string {  
            return this.Get('ExtendedType');
        }
        set ExtendedType(value: string) {
            this.Set('ExtendedType', value);
        }
        /**
        * * Field Name: DefaultInView
        * * Display Name: Default In View
        * * SQL Data Type: bit
        * * Default Value: 0
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
        */
        get ViewCellTemplate(): string {  
            return this.Get('ViewCellTemplate');
        }
        set ViewCellTemplate(value: string) {
            this.Set('ViewCellTemplate', value);
        }
        /**
        * * Field Name: DefaultColumnWidth
        * * Display Name: Default Column Width
        * * SQL Data Type: int
        */
        get DefaultColumnWidth(): number {  
            return this.Get('DefaultColumnWidth');
        }
        set DefaultColumnWidth(value: number) {
            this.Set('DefaultColumnWidth', value);
        }
        /**
        * * Field Name: AllowUpdateAPI
        * * Display Name: Allow Update API
        * * SQL Data Type: bit
        * * Default Value: 1
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
        */
        get UserSearchParamFormatAPI(): string {  
            return this.Get('UserSearchParamFormatAPI');
        }
        set UserSearchParamFormatAPI(value: string) {
            this.Set('UserSearchParamFormatAPI', value);
        }
        /**
        * * Field Name: IncludeInGeneratedForm
        * * Display Name: Include In Generated Form
        * * SQL Data Type: bit
        * * Default Value: 1
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
        * * Default Value: N'Details'
        */
        get GeneratedFormSection(): string {  
            return this.Get('GeneratedFormSection');
        }
        set GeneratedFormSection(value: string) {
            this.Set('GeneratedFormSection', value);
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
    
        /**
        * * Field Name: IsNameField
        * * Display Name: Is Name Field
        * * SQL Data Type: bit
        * * Default Value: 0
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
        */
        get RelatedEntityID(): number {  
            return this.Get('RelatedEntityID');
        }
        set RelatedEntityID(value: number) {
            this.Set('RelatedEntityID', value);
        }
        /**
        * * Field Name: RelatedEntityFieldName
        * * Display Name: Related Entity Field Name
        * * SQL Data Type: nvarchar(255)
        */
        get RelatedEntityFieldName(): string {  
            return this.Get('RelatedEntityFieldName');
        }
        set RelatedEntityFieldName(value: string) {
            this.Set('RelatedEntityFieldName', value);
        }
        /**
        * * Field Name: IncludeRelatedEntityNameFieldInBaseView
        * * Display Name: Include Related Entity Name Field In Base View
        * * SQL Data Type: bit
        * * Default Value: 1
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
        get RelatedEntityNameFieldMap(): string {  
            return this.Get('RelatedEntityNameFieldMap');
        }
        set RelatedEntityNameFieldMap(value: string) {
            this.Set('RelatedEntityNameFieldMap', value);
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
        * * SQL Data Type: nvarchar(4000)
        */
        get EntityCodeName(): string {  
            return this.Get('EntityCodeName');
        }
    
        /**
        * * Field Name: EntityClassName
        * * Display Name: Entity Class Name
        * * SQL Data Type: nvarchar(4000)
        */
        get EntityClassName(): string {  
            return this.Get('EntityClassName');
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
        * * Field Name: RelatedEntitySchemaName
        * * Display Name: Related Entity Schema Name
        * * SQL Data Type: nvarchar(255)
        */
        get RelatedEntitySchemaName(): string {  
            return this.Get('RelatedEntitySchemaName');
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
        * * Field Name: RelatedEntityCodeName
        * * Display Name: Related Entity Code Name
        * * SQL Data Type: nvarchar(4000)
        */
        get RelatedEntityCodeName(): string {  
            return this.Get('RelatedEntityCodeName');
        }
    
        /**
        * * Field Name: RelatedEntityClassName
        * * Display Name: Related Entity Class Name
        * * SQL Data Type: nvarchar(4000)
        */
        get RelatedEntityClassName(): string {  
            return this.Get('RelatedEntityClassName');
        }
    

    }
    
    /**
     * Entities - strongly typed entity sub-class
     * * Schema: admin
     * * Base Table: Entity
     * * Base View: vwEntities
     * * @description Metadata about all of the entities in the system. This information is managed by CodeGen, don't modify the parts that come from SQL Server
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Entities')
    export class EntityEntity extends BaseEntity {
        /**
        * Loads the Entities record from the database
        * @param ID: Number - primary key value to load the Entities record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof EntityEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
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
        * * Related Entity: Entities
        * * Description: Reserved for future use
        */
        get ParentID(): number {  
            return this.Get('ParentID');
        }
        set ParentID(value: number) {
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
        get NameSuffix(): string {  
            return this.Get('NameSuffix');
        }
        set NameSuffix(value: string) {
            this.Set('NameSuffix', value);
        }
        /**
        * * Field Name: Description
        * * SQL Data Type: nvarchar(MAX)
        */
        get Description(): string {  
            return this.Get('Description');
        }
        set Description(value: string) {
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
        * * Default Value: N'dbo'
        * * Description: Database Schema Name
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
        * * Description: Master switch to control if the field is included in the API or not
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
        * * Description: If set to 1, allows updates to occur via API. Role based permissions are required in addition to turning this bit on.
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
        * * Description: If set to 1, allows an end user to add their own search string when running a user view or searching without saving a view
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
        get FullTextCatalog(): string {  
            return this.Get('FullTextCatalog');
        }
        set FullTextCatalog(value: string) {
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
        get FullTextIndex(): string {  
            return this.Get('FullTextIndex');
        }
        set FullTextIndex(value: string) {
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
        get FullTextSearchFunction(): string {  
            return this.Get('FullTextSearchFunction');
        }
        set FullTextSearchFunction(value: string) {
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
        get UserViewMaxRows(): number {  
            return this.Get('UserViewMaxRows');
        }
        set UserViewMaxRows(value: number) {
            this.Set('UserViewMaxRows', value);
        }
        /**
        * * Field Name: spCreate
        * * Display Name: spCreate
        * * SQL Data Type: nvarchar(255)
        */
        get spCreate(): string {  
            return this.Get('spCreate');
        }
        set spCreate(value: string) {
            this.Set('spCreate', value);
        }
        /**
        * * Field Name: spUpdate
        * * Display Name: spUpdate
        * * SQL Data Type: nvarchar(255)
        */
        get spUpdate(): string {  
            return this.Get('spUpdate');
        }
        set spUpdate(value: string) {
            this.Set('spUpdate', value);
        }
        /**
        * * Field Name: spDelete
        * * Display Name: spDelete
        * * SQL Data Type: nvarchar(255)
        */
        get spDelete(): string {  
            return this.Get('spDelete');
        }
        set spDelete(value: string) {
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
        */
        get CascadeDeletes(): boolean {  
            return this.Get('CascadeDeletes');
        }
        set CascadeDeletes(value: boolean) {
            this.Set('CascadeDeletes', value);
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
        * * Description: Normally, CodeGen will sub-class BaseEntity to create a strongly-typed sub-class for each entity. If you provide a value here and in EntityObjectSubclassImport, CodeGen will sub-class the provided class instead of BaseEntity. Also make sure to provide a value for EntityObjectSubclassImport with the name of the module to import that contains an exported class of the name you provide in EntityObjectSubclassName.
        */
        get EntityObjectSubclassName(): string {  
            return this.Get('EntityObjectSubclassName');
        }
        set EntityObjectSubclassName(value: string) {
            this.Set('EntityObjectSubclassName', value);
        }
        /**
        * * Field Name: EntityObjectSubclassImport
        * * Display Name: Entity Object Subclass Import
        * * SQL Data Type: nvarchar(255)
        * * Description: Normally, CodeGen will sub-class BaseEntity to create a strongly-typed sub-class for each entity. If you provide a value here and in EntityObjectSubclassName, CodeGen will sub-class the provided class instead of BaseEntity. Also make sure to provide a value for EntityObjectSubclassName with the name of the class itself. This field should have the name of the module  to import that contains an exported class of the name you provide in EntityObjectSubclassName.
        */
        get EntityObjectSubclassImport(): string {  
            return this.Get('EntityObjectSubclassImport');
        }
        set EntityObjectSubclassImport(value: string) {
            this.Set('EntityObjectSubclassImport', value);
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
        * * Field Name: CodeName
        * * Display Name: Code Name
        * * SQL Data Type: nvarchar(4000)
        */
        get CodeName(): string {  
            return this.Get('CodeName');
        }
    
        /**
        * * Field Name: ClassName
        * * Display Name: Class Name
        * * SQL Data Type: nvarchar(4000)
        */
        get ClassName(): string {  
            return this.Get('ClassName');
        }
    
        /**
        * * Field Name: BaseTableCodeName
        * * Display Name: Base Table Code Name
        * * SQL Data Type: nvarchar(4000)
        */
        get BaseTableCodeName(): string {  
            return this.Get('BaseTableCodeName');
        }
    
        /**
        * * Field Name: ParentEntity
        * * Display Name: Parent Entity
        * * SQL Data Type: nvarchar(255)
        */
        get ParentEntity(): string {  
            return this.Get('ParentEntity');
        }
    
        /**
        * * Field Name: ParentBaseTable
        * * Display Name: Parent Base Table
        * * SQL Data Type: nvarchar(255)
        */
        get ParentBaseTable(): string {  
            return this.Get('ParentBaseTable');
        }
    
        /**
        * * Field Name: ParentBaseView
        * * Display Name: Parent Base View
        * * SQL Data Type: nvarchar(255)
        */
        get ParentBaseView(): string {  
            return this.Get('ParentBaseView');
        }
    

    }
    
    /**
     * Users - strongly typed entity sub-class
     * * Schema: admin
     * * Base Table: User
     * * Base View: vwUsers
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Users')
    export class UserEntity extends BaseEntity {
        /**
        * Loads the Users record from the database
        * @param ID: Number - primary key value to load the Users record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof UserEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
        }
        
        /**
        * Users - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof UserEntity
        * @throws {Error} - Delete is not allowed for Users, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Users, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Display Name: Title
        * * SQL Data Type: nvarchar(50)
        */
        get Title(): string {  
            return this.Get('Title');
        }
        set Title(value: string) {
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
        */
        get Type(): string {  
            return this.Get('Type');
        }
        set Type(value: string) {
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
        * * Default Value: N'None'
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
        */
        get EmployeeID(): number {  
            return this.Get('EmployeeID');
        }
        set EmployeeID(value: number) {
            this.Set('EmployeeID', value);
        }
        /**
        * * Field Name: LinkedEntityID
        * * Display Name: Linked Entity ID
        * * SQL Data Type: int
        */
        get LinkedEntityID(): number {  
            return this.Get('LinkedEntityID');
        }
        set LinkedEntityID(value: number) {
            this.Set('LinkedEntityID', value);
        }
        /**
        * * Field Name: LinkedEntityRecordID
        * * Display Name: Linked Entity Record ID
        * * SQL Data Type: int
        */
        get LinkedEntityRecordID(): number {  
            return this.Get('LinkedEntityRecordID');
        }
        set LinkedEntityRecordID(value: number) {
            this.Set('LinkedEntityRecordID', value);
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
        * * Field Name: FirstLast
        * * Display Name: First Last
        * * SQL Data Type: nvarchar(101)
        */
        get FirstLast(): string {  
            return this.Get('FirstLast');
        }
    
        /**
        * * Field Name: EmployeeFirstLast
        * * Display Name: Employee First Last
        * * SQL Data Type: nvarchar(81)
        */
        get EmployeeFirstLast(): string {  
            return this.Get('EmployeeFirstLast');
        }
    
        /**
        * * Field Name: EmployeeEmail
        * * Display Name: Employee Email
        * * SQL Data Type: nvarchar(100)
        */
        get EmployeeEmail(): string {  
            return this.Get('EmployeeEmail');
        }
    
        /**
        * * Field Name: EmployeeTitle
        * * Display Name: Employee Title
        * * SQL Data Type: nvarchar(50)
        */
        get EmployeeTitle(): string {  
            return this.Get('EmployeeTitle');
        }
    
        /**
        * * Field Name: EmployeeSupervisor
        * * Display Name: Employee Supervisor
        * * SQL Data Type: nvarchar(81)
        */
        get EmployeeSupervisor(): string {  
            return this.Get('EmployeeSupervisor');
        }
    
        /**
        * * Field Name: EmployeeSupervisorEmail
        * * Display Name: Employee Supervisor Email
        * * SQL Data Type: nvarchar(100)
        */
        get EmployeeSupervisorEmail(): string {  
            return this.Get('EmployeeSupervisorEmail');
        }
    

    }
    
    /**
     * Entity Relationships - strongly typed entity sub-class
     * * Schema: admin
     * * Base Table: EntityRelationship
     * * Base View: vwEntityRelationships
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Entity Relationships')
    export class EntityRelationshipEntity extends BaseEntity {
        /**
        * Loads the Entity Relationships record from the database
        * @param ID: Number - primary key value to load the Entity Relationships record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof EntityRelationshipEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
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
        * * Related Entity: Entities
        */
        get EntityID(): number {  
            return this.Get('EntityID');
        }
        set EntityID(value: number) {
            this.Set('EntityID', value);
        }
        /**
        * * Field Name: RelatedEntityID
        * * Display Name: Related Entity ID
        * * SQL Data Type: int
        * * Related Entity: Entities
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
        * * Default Value: N'One To Many'
        */
        get Type(): string {  
            return this.Get('Type');
        }
        set Type(value: string) {
            this.Set('Type', value);
        }
        /**
        * * Field Name: EntityKeyField
        * * Display Name: Entity Key Field
        * * SQL Data Type: nvarchar(255)
        */
        get EntityKeyField(): string {  
            return this.Get('EntityKeyField');
        }
        set EntityKeyField(value: string) {
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
        get JoinView(): string {  
            return this.Get('JoinView');
        }
        set JoinView(value: string) {
            this.Set('JoinView', value);
        }
        /**
        * * Field Name: JoinEntityJoinField
        * * Display Name: Join Entity Join Field
        * * SQL Data Type: nvarchar(255)
        */
        get JoinEntityJoinField(): string {  
            return this.Get('JoinEntityJoinField');
        }
        set JoinEntityJoinField(value: string) {
            this.Set('JoinEntityJoinField', value);
        }
        /**
        * * Field Name: JoinEntityInverseJoinField
        * * Display Name: Join Entity Inverse Join Field
        * * SQL Data Type: nvarchar(255)
        */
        get JoinEntityInverseJoinField(): string {  
            return this.Get('JoinEntityInverseJoinField');
        }
        set JoinEntityInverseJoinField(value: string) {
            this.Set('JoinEntityInverseJoinField', value);
        }
        /**
        * * Field Name: DisplayInForm
        * * Display Name: Display In Form
        * * SQL Data Type: bit
        * * Default Value: 1
        */
        get DisplayInForm(): boolean {  
            return this.Get('DisplayInForm');
        }
        set DisplayInForm(value: boolean) {
            this.Set('DisplayInForm', value);
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
        * * Field Name: DisplayUserViewGUID
        * * Display Name: Display User View GUID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity: User Views
        */
        get DisplayUserViewGUID(): string {  
            return this.Get('DisplayUserViewGUID');
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
        * * SQL Data Type: nvarchar(4000)
        */
        get RelatedEntityClassName(): string {  
            return this.Get('RelatedEntityClassName');
        }
    
        /**
        * * Field Name: RelatedEntityCodeName
        * * Display Name: Related Entity Code Name
        * * SQL Data Type: nvarchar(4000)
        */
        get RelatedEntityCodeName(): string {  
            return this.Get('RelatedEntityCodeName');
        }
    
        /**
        * * Field Name: RelatedEntityBaseTableCodeName
        * * Display Name: Related Entity Base Table Code Name
        * * SQL Data Type: nvarchar(4000)
        */
        get RelatedEntityBaseTableCodeName(): string {  
            return this.Get('RelatedEntityBaseTableCodeName');
        }
    
        /**
        * * Field Name: DisplayUserViewName
        * * Display Name: Display User View Name
        * * SQL Data Type: nvarchar(100)
        */
        get DisplayUserViewName(): string {  
            return this.Get('DisplayUserViewName');
        }
    
        /**
        * * Field Name: DisplayUserViewID
        * * Display Name: Display User View ID
        * * SQL Data Type: int
        */
        get DisplayUserViewID(): number {  
            return this.Get('DisplayUserViewID');
        }
    

    }
    
    /**
     * User Record Logs - strongly typed entity sub-class
     * * Schema: admin
     * * Base Table: UserRecordLog
     * * Base View: vwUserRecordLogs
     * * @description Tracks history of user access to records across the system, tracks reads and writes
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'User Record Logs')
    export class UserRecordLogEntity extends BaseEntity {
        /**
        * Loads the User Record Logs record from the database
        * @param ID: Number - primary key value to load the User Record Logs record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof UserRecordLogEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
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
        * * Related Entity: Users
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
        * * Related Entity: Entities
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
        get UserFirstLast(): string {  
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
        get UserSupervisor(): string {  
            return this.Get('UserSupervisor');
        }
    
        /**
        * * Field Name: UserSupervisorEmail
        * * Display Name: User Supervisor Email
        * * SQL Data Type: nvarchar(100)
        */
        get UserSupervisorEmail(): string {  
            return this.Get('UserSupervisorEmail');
        }
    

    }
    
    /**
     * User Views - strongly typed entity sub-class
     * * Schema: admin
     * * Base Table: UserView
     * * Base View: vwUserViews
     * * @description User Views contain the metadata for the user viewing system of entity data
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'User Views')
    export class UserViewEntity extends BaseEntity {
        /**
        * Loads the User Views record from the database
        * @param ID: Number - primary key value to load the User Views record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof UserViewEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
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
        * * Related Entity: Users
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
        get Description(): string {  
            return this.Get('Description');
        }
        set Description(value: string) {
            this.Set('Description', value);
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
        get GridState(): string {  
            return this.Get('GridState');
        }
        set GridState(value: string) {
            this.Set('GridState', value);
        }
        /**
        * * Field Name: FilterState
        * * Display Name: Filter State
        * * SQL Data Type: nvarchar(MAX)
        */
        get FilterState(): string {  
            return this.Get('FilterState');
        }
        set FilterState(value: string) {
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
        get SmartFilterPrompt(): string {  
            return this.Get('SmartFilterPrompt');
        }
        set SmartFilterPrompt(value: string) {
            this.Set('SmartFilterPrompt', value);
        }
        /**
        * * Field Name: SmartFilterWhereClause
        * * Display Name: Smart Filter Where Clause
        * * SQL Data Type: nvarchar(MAX)
        */
        get SmartFilterWhereClause(): string {  
            return this.Get('SmartFilterWhereClause');
        }
        set SmartFilterWhereClause(value: string) {
            this.Set('SmartFilterWhereClause', value);
        }
        /**
        * * Field Name: SmartFilterExplanation
        * * Display Name: Smart Filter Explanation
        * * SQL Data Type: nvarchar(MAX)
        */
        get SmartFilterExplanation(): string {  
            return this.Get('SmartFilterExplanation');
        }
        set SmartFilterExplanation(value: string) {
            this.Set('SmartFilterExplanation', value);
        }
        /**
        * * Field Name: WhereClause
        * * Display Name: Where Clause
        * * SQL Data Type: nvarchar(MAX)
        */
        get WhereClause(): string {  
            return this.Get('WhereClause');
        }
        set WhereClause(value: string) {
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
        get SortState(): string {  
            return this.Get('SortState');
        }
        set SortState(value: string) {
            this.Set('SortState', value);
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
        get UserFirstLast(): string {  
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
     * * Schema: admin
     * * Base Table: CompanyIntegrationRun
     * * Base View: vwCompanyIntegrationRuns
     * * @description Audit Trail for each run of a given company integration
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Company Integration Runs')
    export class CompanyIntegrationRunEntity extends BaseEntity {
        /**
        * Loads the Company Integration Runs record from the database
        * @param ID: Number - primary key value to load the Company Integration Runs record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof CompanyIntegrationRunEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
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
        * * Related Entity: Company Integrations
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
        * * Related Entity: Users
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
        get EndedAt(): Date {  
            return this.Get('EndedAt');
        }
        set EndedAt(value: Date) {
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
        get Comments(): string {  
            return this.Get('Comments');
        }
        set Comments(value: string) {
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
     * * Schema: admin
     * * Base Table: CompanyIntegrationRunDetail
     * * Base View: vwCompanyIntegrationRunDetails
     * * @description Record-level details for the audit trail for each integration run
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Company Integration Run Details')
    export class CompanyIntegrationRunDetailEntity extends BaseEntity {
        /**
        * Loads the Company Integration Run Details record from the database
        * @param ID: Number - primary key value to load the Company Integration Run Details record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof CompanyIntegrationRunDetailEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
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
        * * Related Entity: Company Integration Runs
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
        get RunStartedAt(): Date {  
            return this.Get('RunStartedAt');
        }
    
        /**
        * * Field Name: RunEndedAt
        * * Display Name: Run Ended At
        * * SQL Data Type: datetime
        */
        get RunEndedAt(): Date {  
            return this.Get('RunEndedAt');
        }
    

    }
    
    /**
     * Error Logs - strongly typed entity sub-class
     * * Schema: admin
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
        * @param ID: Number - primary key value to load the Error Logs record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof ErrorLogEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
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
        * * Related Entity: Company Integration Runs
        */
        get CompanyIntegrationRunID(): number {  
            return this.Get('CompanyIntegrationRunID');
        }
        set CompanyIntegrationRunID(value: number) {
            this.Set('CompanyIntegrationRunID', value);
        }
        /**
        * * Field Name: CompanyIntegrationRunDetailID
        * * Display Name: CompanyIntegrationRunDetail ID
        * * SQL Data Type: int
        * * Related Entity: Company Integration Run Details
        */
        get CompanyIntegrationRunDetailID(): number {  
            return this.Get('CompanyIntegrationRunDetailID');
        }
        set CompanyIntegrationRunDetailID(value: number) {
            this.Set('CompanyIntegrationRunDetailID', value);
        }
        /**
        * * Field Name: Code
        * * SQL Data Type: nchar(20)
        */
        get Code(): string {  
            return this.Get('Code');
        }
        set Code(value: string) {
            this.Set('Code', value);
        }
        /**
        * * Field Name: Message
        * * SQL Data Type: nvarchar(MAX)
        */
        get Message(): string {  
            return this.Get('Message');
        }
        set Message(value: string) {
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
        get CreatedBy(): string {  
            return this.Get('CreatedBy');
        }
        set CreatedBy(value: string) {
            this.Set('CreatedBy', value);
        }
        /**
        * * Field Name: Status
        * * SQL Data Type: nvarchar(10)
        */
        get Status(): string {  
            return this.Get('Status');
        }
        set Status(value: string) {
            this.Set('Status', value);
        }
        /**
        * * Field Name: Category
        * * SQL Data Type: nvarchar(20)
        */
        get Category(): string {  
            return this.Get('Category');
        }
        set Category(value: string) {
            this.Set('Category', value);
        }
        /**
        * * Field Name: Details
        * * SQL Data Type: nvarchar(MAX)
        */
        get Details(): string {  
            return this.Get('Details');
        }
        set Details(value: string) {
            this.Set('Details', value);
        }

    }
    
    /**
     * Applications - strongly typed entity sub-class
     * * Schema: admin
     * * Base Table: Application
     * * Base View: vwApplications
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Applications')
    export class ApplicationEntity extends BaseEntity {
        /**
        * Loads the Applications record from the database
        * @param ID: Number - primary key value to load the Applications record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof ApplicationEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
        }
        
        /**
        * Applications - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof ApplicationEntity
        * @throws {Error} - Delete is not allowed for Applications, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Applications, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * SQL Data Type: nvarchar(500)
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
     * Application Entities - strongly typed entity sub-class
     * * Schema: admin
     * * Base Table: ApplicationEntity
     * * Base View: vwApplicationEntities
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Application Entities')
    export class ApplicationEntityEntity extends BaseEntity {
        /**
        * Loads the Application Entities record from the database
        * @param ID: Number - primary key value to load the Application Entities record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof ApplicationEntityEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
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
        * * Related Entity: Applications
        */
        get ApplicationName(): string {  
            return this.Get('ApplicationName');
        }
        set ApplicationName(value: string) {
            this.Set('ApplicationName', value);
        }
        /**
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: int
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
        * * Default Value: 0
        */
        get DefaultForNewUser(): boolean {  
            return this.Get('DefaultForNewUser');
        }
        set DefaultForNewUser(value: boolean) {
            this.Set('DefaultForNewUser', value);
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
        * * Field Name: Application
        * * SQL Data Type: nvarchar(50)
        */
        get Application(): string {  
            return this.Get('Application');
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
        * * Field Name: EntityCodeName
        * * Display Name: Entity Code Name
        * * SQL Data Type: nvarchar(4000)
        */
        get EntityCodeName(): string {  
            return this.Get('EntityCodeName');
        }
    
        /**
        * * Field Name: EntityClassName
        * * Display Name: Entity Class Name
        * * SQL Data Type: nvarchar(4000)
        */
        get EntityClassName(): string {  
            return this.Get('EntityClassName');
        }
    
        /**
        * * Field Name: EntityBaseTableCodeName
        * * Display Name: Entity Base Table Code Name
        * * SQL Data Type: nvarchar(4000)
        */
        get EntityBaseTableCodeName(): string {  
            return this.Get('EntityBaseTableCodeName');
        }
    

    }
    
    /**
     * Entity Permissions - strongly typed entity sub-class
     * * Schema: admin
     * * Base Table: EntityPermission
     * * Base View: vwEntityPermissions
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Entity Permissions')
    export class EntityPermissionEntity extends BaseEntity {
        /**
        * Loads the Entity Permissions record from the database
        * @param ID: Number - primary key value to load the Entity Permissions record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof EntityPermissionEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
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
        * * Related Entity: Roles
        */
        get RoleName(): string {  
            return this.Get('RoleName');
        }
        set RoleName(value: string) {
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
        * * Related Entity: Row Level Security Filters
        */
        get ReadRLSFilterID(): number {  
            return this.Get('ReadRLSFilterID');
        }
        set ReadRLSFilterID(value: number) {
            this.Set('ReadRLSFilterID', value);
        }
        /**
        * * Field Name: CreateRLSFilterID
        * * Display Name: Create RLSFilter ID
        * * SQL Data Type: int
        * * Related Entity: Row Level Security Filters
        */
        get CreateRLSFilterID(): number {  
            return this.Get('CreateRLSFilterID');
        }
        set CreateRLSFilterID(value: number) {
            this.Set('CreateRLSFilterID', value);
        }
        /**
        * * Field Name: UpdateRLSFilterID
        * * Display Name: Update RLSFilter ID
        * * SQL Data Type: int
        * * Related Entity: Row Level Security Filters
        */
        get UpdateRLSFilterID(): number {  
            return this.Get('UpdateRLSFilterID');
        }
        set UpdateRLSFilterID(value: number) {
            this.Set('UpdateRLSFilterID', value);
        }
        /**
        * * Field Name: DeleteRLSFilterID
        * * Display Name: Delete RLSFilter ID
        * * SQL Data Type: int
        * * Related Entity: Row Level Security Filters
        */
        get DeleteRLSFilterID(): number {  
            return this.Get('DeleteRLSFilterID');
        }
        set DeleteRLSFilterID(value: number) {
            this.Set('DeleteRLSFilterID', value);
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
        * * Field Name: RoleSQLName
        * * Display Name: Role SQLName
        * * SQL Data Type: nvarchar(50)
        */
        get RoleSQLName(): string {  
            return this.Get('RoleSQLName');
        }
    
        /**
        * * Field Name: CreateRLSFilter
        * * Display Name: Create RLSFilter
        * * SQL Data Type: nvarchar(100)
        */
        get CreateRLSFilter(): string {  
            return this.Get('CreateRLSFilter');
        }
    
        /**
        * * Field Name: ReadRLSFilter
        * * Display Name: Read RLSFilter
        * * SQL Data Type: nvarchar(100)
        */
        get ReadRLSFilter(): string {  
            return this.Get('ReadRLSFilter');
        }
    
        /**
        * * Field Name: UpdateRLSFilter
        * * Display Name: Update RLSFilter
        * * SQL Data Type: nvarchar(100)
        */
        get UpdateRLSFilter(): string {  
            return this.Get('UpdateRLSFilter');
        }
    
        /**
        * * Field Name: DeleteRLSFilter
        * * Display Name: Delete RLSFilter
        * * SQL Data Type: nvarchar(100)
        */
        get DeleteRLSFilter(): string {  
            return this.Get('DeleteRLSFilter');
        }
    

    }
    
    /**
     * User Application Entities - strongly typed entity sub-class
     * * Schema: admin
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
        * @param ID: Number - primary key value to load the User Application Entities record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof UserApplicationEntityEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
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
        * * Related Entity: User Applications
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
     * * Schema: admin
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
        * @param ID: Number - primary key value to load the User Applications record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof UserApplicationEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
        }
        
        /**
        * User Applications - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof UserApplicationEntity
        * @throws {Error} - Delete is not allowed for User Applications, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for User Applications, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Related Entity: Users
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
        * * Related Entity: Applications
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
     * * Schema: admin
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
        * @param ID: Number - primary key value to load the Company Integration Run API Logs record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof CompanyIntegrationRunAPILogEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
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
        * * Related Entity: Company Integration Runs
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
        */
        get RequestMethod(): string {  
            return this.Get('RequestMethod');
        }
        set RequestMethod(value: string) {
            this.Set('RequestMethod', value);
        }
        /**
        * * Field Name: URL
        * * SQL Data Type: nvarchar(MAX)
        */
        get URL(): string {  
            return this.Get('URL');
        }
        set URL(value: string) {
            this.Set('URL', value);
        }
        /**
        * * Field Name: Parameters
        * * SQL Data Type: nvarchar(MAX)
        */
        get Parameters(): string {  
            return this.Get('Parameters');
        }
        set Parameters(value: string) {
            this.Set('Parameters', value);
        }

    }
    
    /**
     * Lists - strongly typed entity sub-class
     * * Schema: admin
     * * Base Table: List
     * * Base View: vwLists
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Lists')
    export class ListEntity extends BaseEntity {
        /**
        * Loads the Lists record from the database
        * @param ID: Number - primary key value to load the Lists record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof ListEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
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
        get Description(): string {  
            return this.Get('Description');
        }
        set Description(value: string) {
            this.Set('Description', value);
        }
        /**
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: int
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
        * * Related Entity: Users
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
     * List Details - strongly typed entity sub-class
     * * Schema: admin
     * * Base Table: ListDetail
     * * Base View: vwListDetails
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'List Details')
    export class ListDetailEntity extends BaseEntity {
        /**
        * Loads the List Details record from the database
        * @param ID: Number - primary key value to load the List Details record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof ListDetailEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
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
        * * Related Entity: Lists
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

    }
    
    /**
     * User View Runs - strongly typed entity sub-class
     * * Schema: admin
     * * Base Table: UserViewRun
     * * Base View: vwUserViewRuns
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'User View Runs')
    export class UserViewRunEntity extends BaseEntity {
        /**
        * Loads the User View Runs record from the database
        * @param ID: Number - primary key value to load the User View Runs record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof UserViewRunEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
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
        * * Related Entity: User Views
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
        * * Related Entity: Users
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
     * * Schema: admin
     * * Base Table: UserViewRunDetail
     * * Base View: vwUserViewRunDetails
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'User View Run Details')
    export class UserViewRunDetailEntity extends BaseEntity {
        /**
        * Loads the User View Run Details record from the database
        * @param ID: Number - primary key value to load the User View Run Details record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof UserViewRunDetailEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
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
        * * Related Entity: User View Runs
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
     * * Schema: admin
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
        * @param ID: Number - primary key value to load the Workflow Runs record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof WorkflowRunEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
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
        * * Related Entity: Workflows
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
        get EndedAt(): Date {  
            return this.Get('EndedAt');
        }
        set EndedAt(value: Date) {
            this.Set('EndedAt', value);
        }
        /**
        * * Field Name: Status
        * * SQL Data Type: nchar(10)
        * * Default Value: N'Pending'
        */
        get Status(): string {  
            return this.Get('Status');
        }
        set Status(value: string) {
            this.Set('Status', value);
        }
        /**
        * * Field Name: Results
        * * SQL Data Type: nvarchar(MAX)
        */
        get Results(): string {  
            return this.Get('Results');
        }
        set Results(value: string) {
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
     * * Schema: admin
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
        * @param ID: Number - primary key value to load the Workflows record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof WorkflowEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
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
        get Description(): string {  
            return this.Get('Description');
        }
        set Description(value: string) {
            this.Set('Description', value);
        }
        /**
        * * Field Name: WorkflowEngineName
        * * Display Name: Workflow Engine Name
        * * SQL Data Type: nvarchar(100)
        * * Related Entity: Workflow Engines
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
        * * Related Entity: Companies
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
    

    }
    
    /**
     * Workflow Engines - strongly typed entity sub-class
     * * Schema: admin
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
        * @param ID: Number - primary key value to load the Workflow Engines record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof WorkflowEngineEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
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
        get Description(): string {  
            return this.Get('Description');
        }
        set Description(value: string) {
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
     * * Schema: admin
     * * Base Table: RecordChange
     * * Base View: vwRecordChanges
     * * @description Tracks history of all pending and complete data changes to records
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Record Changes')
    export class RecordChangeEntity extends BaseEntity {
        /**
        * Loads the Record Changes record from the database
        * @param ID: Number - primary key value to load the Record Changes record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof RecordChangeEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
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
        * * Related Entity: Entities
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
        * * Field Name: UserID
        * * Display Name: User ID
        * * SQL Data Type: int
        * * Related Entity: Users
        */
        get UserID(): number {  
            return this.Get('UserID');
        }
        set UserID(value: number) {
            this.Set('UserID', value);
        }
        /**
        * * Field Name: ChangedAt
        * * Display Name: Changed At
        * * SQL Data Type: datetime
        * * Default Value: getdate()
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
        */
        get FullRecordJSON(): string {  
            return this.Get('FullRecordJSON');
        }
        set FullRecordJSON(value: string) {
            this.Set('FullRecordJSON', value);
        }
        /**
        * * Field Name: Status
        * * SQL Data Type: nchar(15)
        * * Default Value: N'Complete'
        */
        get Status(): string {  
            return this.Get('Status');
        }
        set Status(value: string) {
            this.Set('Status', value);
        }
        /**
        * * Field Name: Comments
        * * SQL Data Type: nvarchar(MAX)
        */
        get Comments(): string {  
            return this.Get('Comments');
        }
        set Comments(value: string) {
            this.Set('Comments', value);
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
     * User Roles - strongly typed entity sub-class
     * * Schema: admin
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
        * @param ID: Number - primary key value to load the User Roles record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof UserRoleEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
        }
        
        /**
        * User Roles - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof UserRoleEntity
        * @throws {Error} - Delete is not allowed for User Roles, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for User Roles, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Related Entity: Users
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
        * * Related Entity: Roles
        */
        get RoleName(): string {  
            return this.Get('RoleName');
        }
        set RoleName(value: string) {
            this.Set('RoleName', value);
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
     * Row Level Security Filters - strongly typed entity sub-class
     * * Schema: admin
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
        * @param ID: Number - primary key value to load the Row Level Security Filters record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof RowLevelSecurityFilterEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
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
        get Description(): string {  
            return this.Get('Description');
        }
        set Description(value: string) {
            this.Set('Description', value);
        }
        /**
        * * Field Name: FilterText
        * * Display Name: Filter Text
        * * SQL Data Type: nvarchar(MAX)
        */
        get FilterText(): string {  
            return this.Get('FilterText');
        }
        set FilterText(value: string) {
            this.Set('FilterText', value);
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
     * Audit Logs - strongly typed entity sub-class
     * * Schema: admin
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
        * @param ID: Number - primary key value to load the Audit Logs record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof AuditLogEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
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
        * * Related Entity: Audit Log Types
        */
        get AuditLogTypeName(): string {  
            return this.Get('AuditLogTypeName');
        }
        set AuditLogTypeName(value: string) {
            this.Set('AuditLogTypeName', value);
        }
        /**
        * * Field Name: UserID
        * * Display Name: User ID
        * * SQL Data Type: int
        * * Related Entity: Users
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
        * * Related Entity: Authorizations
        */
        get AuthorizationName(): string {  
            return this.Get('AuthorizationName');
        }
        set AuthorizationName(value: string) {
            this.Set('AuthorizationName', value);
        }
        /**
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: N'Allow'
        */
        get Status(): string {  
            return this.Get('Status');
        }
        set Status(value: string) {
            this.Set('Status', value);
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
        * * Field Name: Details
        * * Display Name: Details
        * * SQL Data Type: nvarchar(MAX)
        */
        get Details(): string {  
            return this.Get('Details');
        }
        set Details(value: string) {
            this.Set('Details', value);
        }
        /**
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: int
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
        * * Field Name: User
        * * Display Name: User
        * * SQL Data Type: nvarchar(100)
        */
        get User(): string {  
            return this.Get('User');
        }
    

    }
    
    /**
     * Authorizations - strongly typed entity sub-class
     * * Schema: admin
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
        * @param ID: Number - primary key value to load the Authorizations record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof AuthorizationEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
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
        * * Related Entity: Authorizations
        */
        get ParentID(): number {  
            return this.Get('ParentID');
        }
        set ParentID(value: number) {
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
     * Authorization Roles - strongly typed entity sub-class
     * * Schema: admin
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
        * @param ID: Number - primary key value to load the Authorization Roles record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof AuthorizationRoleEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
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
        * * Related Entity: Authorizations
        */
        get AuthorizationName(): string {  
            return this.Get('AuthorizationName');
        }
        set AuthorizationName(value: string) {
            this.Set('AuthorizationName', value);
        }
        /**
        * * Field Name: RoleName
        * * Display Name: Role Name
        * * SQL Data Type: nvarchar(50)
        * * Related Entity: Roles
        */
        get RoleName(): string {  
            return this.Get('RoleName');
        }
        set RoleName(value: string) {
            this.Set('RoleName', value);
        }
        /**
        * * Field Name: Type
        * * Display Name: Type
        * * SQL Data Type: nchar(10)
        * * Default Value: N'grant'
        * Value List Type: List
        * Possible Values 
    * Allow - User allowed to execute tasks linked to this authorization
    * Allow - User allowed to execute tasks linked to this authorization
    * Allow - User allowed to execute tasks linked to this authorization
    * Allow - User allowed to execute tasks linked to this authorization
    * Allow - User allowed to execute tasks linked to this authorization
    * Allow - User allowed to execute tasks linked to this authorization
    * Deny - User NOT allowed to execute tasks linked to this authorization - deny overrides Allow from all other roles a user may be part of
    * Deny - User NOT allowed to execute tasks linked to this authorization - deny overrides Allow from all other roles a user may be part of
    * Deny - User NOT allowed to execute tasks linked to this authorization - deny overrides Allow from all other roles a user may be part of
    * Deny - User NOT allowed to execute tasks linked to this authorization - deny overrides Allow from all other roles a user may be part of
    * Deny - User NOT allowed to execute tasks linked to this authorization - deny overrides Allow from all other roles a user may be part of
    * Deny - User NOT allowed to execute tasks linked to this authorization - deny overrides Allow from all other roles a user may be part of
        */
        get Type(): string {  
            return this.Get('Type');
        }
        set Type(value: string) {
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
     * * Schema: admin
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
        * @param ID: Number - primary key value to load the Audit Log Types record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof AuditLogTypeEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
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
        * * Related Entity: Audit Log Types
        */
        get ParentID(): number {  
            return this.Get('ParentID');
        }
        set ParentID(value: number) {
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
        get Description(): string {  
            return this.Get('Description');
        }
        set Description(value: string) {
            this.Set('Description', value);
        }
        /**
        * * Field Name: AuthorizationName
        * * Display Name: Authorization Name
        * * SQL Data Type: nvarchar(100)
        * * Related Entity: Authorizations
        */
        get AuthorizationName(): string {  
            return this.Get('AuthorizationName');
        }
        set AuthorizationName(value: string) {
            this.Set('AuthorizationName', value);
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
        get Parent(): string {  
            return this.Get('Parent');
        }
    

    }
    
    /**
     * Entity Field Values - strongly typed entity sub-class
     * * Schema: admin
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
        * @param ID: Number - primary key value to load the Entity Field Values record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof EntityFieldValueEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
        }
        
        /**
        * Entity Field Values - AllowCreateAPI and AllowUpdateAPI are both set to 0 in the database.  Save is not allowed, so this method is generated to override the base class method and throw an error. To enable save for this entity, set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof EntityFieldValueEntity
        * @throws {Error} - Save is not allowed for Entity Field Values, to enable it set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.
        */
        public async Save(options?: EntitySaveOptions) : Promise<boolean> {
            throw new Error('Save is not allowed for Entity Field Values, to enable it set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.');
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
        * * Related Entity: Entity Fields
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
        * * Related Entity: Entity Fields
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
        get Code(): string {  
            return this.Get('Code');
        }
        set Code(value: string) {
            this.Set('Code', value);
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
     * AI Models - strongly typed entity sub-class
     * * Schema: admin
     * * Base Table: AIModel
     * * Base View: vwAIModels
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'AI Models')
    export class AIModelEntity extends BaseEntity {
        /**
        * Loads the AI Models record from the database
        * @param ID: Number - primary key value to load the AI Models record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof AIModelEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
        }
        
        /**
        * AI Models - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof AIModelEntity
        * @throws {Error} - Delete is not allowed for AI Models, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for AI Models, to enable it set AllowDeleteAPI to 1 in the database.');
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
        get Vendor(): string {  
            return this.Get('Vendor');
        }
        set Vendor(value: string) {
            this.Set('Vendor', value);
        }
        /**
        * * Field Name: AIModelTypeID
        * * Display Name: AI Model Type ID
        * * SQL Data Type: int
        * * Related Entity: AI Model Types
        */
        get AIModelTypeID(): number {  
            return this.Get('AIModelTypeID');
        }
        set AIModelTypeID(value: number) {
            this.Set('AIModelTypeID', value);
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
        * * SQL Data Type: nvarchar(255)
        */
        get DriverImportPath(): string {  
            return this.Get('DriverImportPath');
        }
        set DriverImportPath(value: string) {
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
     * AI Actions - strongly typed entity sub-class
     * * Schema: admin
     * * Base Table: AIAction
     * * Base View: vwAIActions
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'AI Actions')
    export class AIActionEntity extends BaseEntity {
        /**
        * Loads the AI Actions record from the database
        * @param ID: Number - primary key value to load the AI Actions record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof AIActionEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
        }
        
        /**
        * AI Actions - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof AIActionEntity
        * @throws {Error} - Delete is not allowed for AI Actions, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for AI Actions, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Field Name: DefaultModelID
        * * Display Name: Default Model ID
        * * SQL Data Type: int
        * * Related Entity: AI Models
        */
        get DefaultModelID(): number {  
            return this.Get('DefaultModelID');
        }
        set DefaultModelID(value: number) {
            this.Set('DefaultModelID', value);
        }
        /**
        * * Field Name: DefaultPrompt
        * * Display Name: Default Prompt
        * * SQL Data Type: nvarchar(MAX)
        */
        get DefaultPrompt(): string {  
            return this.Get('DefaultPrompt');
        }
        set DefaultPrompt(value: string) {
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
        get DefaultModel(): string {  
            return this.Get('DefaultModel');
        }
    

    }
    
    /**
     * AI Model Actions - strongly typed entity sub-class
     * * Schema: admin
     * * Base Table: AIModelAction
     * * Base View: vwAIModelActions
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'AI Model Actions')
    export class AIModelActionEntity extends BaseEntity {
        /**
        * Loads the AI Model Actions record from the database
        * @param ID: Number - primary key value to load the AI Model Actions record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof AIModelActionEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
        }
        
        /**
        * AI Model Actions - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof AIModelActionEntity
        * @throws {Error} - Delete is not allowed for AI Model Actions, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for AI Model Actions, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Related Entity: AI Models
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
        * * Related Entity: AI Actions
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
     * * Schema: admin
     * * Base Table: EntityAIAction
     * * Base View: vwEntityAIActions
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Entity AI Actions')
    export class EntityAIActionEntity extends BaseEntity {
        /**
        * Loads the Entity AI Actions record from the database
        * @param ID: Number - primary key value to load the Entity AI Actions record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof EntityAIActionEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
        }
        
        /**
        * Entity AI Actions - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof EntityAIActionEntity
        * @throws {Error} - Delete is not allowed for Entity AI Actions, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Entity AI Actions, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Related Entity: Entities
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
        * * Related Entity: AI Actions
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
        * * Related Entity: AI Models
        */
        get AIModelID(): number {  
            return this.Get('AIModelID');
        }
        set AIModelID(value: number) {
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
        get Prompt(): string {  
            return this.Get('Prompt');
        }
        set Prompt(value: string) {
            this.Set('Prompt', value);
        }
        /**
        * * Field Name: TriggerEvent
        * * Display Name: Trigger Event
        * * SQL Data Type: nchar(15)
        * * Default Value: N'After Save'
        */
        get TriggerEvent(): string {  
            return this.Get('TriggerEvent');
        }
        set TriggerEvent(value: string) {
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
        * * Default Value: N'FIeld'
        */
        get OutputType(): string {  
            return this.Get('OutputType');
        }
        set OutputType(value: string) {
            this.Set('OutputType', value);
        }
        /**
        * * Field Name: OutputField
        * * Display Name: Output Field
        * * SQL Data Type: nvarchar(50)
        */
        get OutputField(): string {  
            return this.Get('OutputField');
        }
        set OutputField(value: string) {
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
        * * Related Entity: Entities
        */
        get OutputEntityID(): number {  
            return this.Get('OutputEntityID');
        }
        set OutputEntityID(value: number) {
            this.Set('OutputEntityID', value);
        }
        /**
        * * Field Name: Comments
        * * Display Name: Comments
        * * SQL Data Type: nvarchar(MAX)
        */
        get Comments(): string {  
            return this.Get('Comments');
        }
        set Comments(value: string) {
            this.Set('Comments', value);
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
        get AIModel(): string {  
            return this.Get('AIModel');
        }
    
        /**
        * * Field Name: OutputEntity
        * * Display Name: Output Entity
        * * SQL Data Type: nvarchar(255)
        */
        get OutputEntity(): string {  
            return this.Get('OutputEntity');
        }
    

    }
    
    /**
     * AI Model Types - strongly typed entity sub-class
     * * Schema: admin
     * * Base Table: AIModelType
     * * Base View: vwAIModelTypes
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'AI Model Types')
    export class AIModelTypeEntity extends BaseEntity {
        /**
        * Loads the AI Model Types record from the database
        * @param ID: Number - primary key value to load the AI Model Types record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof AIModelTypeEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
        }
        
        /**
        * AI Model Types - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof AIModelTypeEntity
        * @throws {Error} - Delete is not allowed for AI Model Types, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for AI Model Types, to enable it set AllowDeleteAPI to 1 in the database.');
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

    }
    
    /**
     * Queue Types - strongly typed entity sub-class
     * * Schema: admin
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
        * @param ID: Number - primary key value to load the Queue Types record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof QueueTypeEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
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
        get Description(): string {  
            return this.Get('Description');
        }
        set Description(value: string) {
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
        get DriverImportPath(): string {  
            return this.Get('DriverImportPath');
        }
        set DriverImportPath(value: string) {
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
     * * Schema: admin
     * * Base Table: Queue
     * * Base View: vwQueues
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Queues')
    export class QueueEntity extends BaseEntity {
        /**
        * Loads the Queues record from the database
        * @param ID: Number - primary key value to load the Queues record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof QueueEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
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
        get Description(): string {  
            return this.Get('Description');
        }
        set Description(value: string) {
            this.Set('Description', value);
        }
        /**
        * * Field Name: QueueTypeID
        * * Display Name: Queue Type ID
        * * SQL Data Type: int
        * * Related Entity: Queue Types
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
        get ProcessPID(): number {  
            return this.Get('ProcessPID');
        }
        set ProcessPID(value: number) {
            this.Set('ProcessPID', value);
        }
        /**
        * * Field Name: ProcessPlatform
        * * Display Name: Process Platform
        * * SQL Data Type: nvarchar(30)
        */
        get ProcessPlatform(): string {  
            return this.Get('ProcessPlatform');
        }
        set ProcessPlatform(value: string) {
            this.Set('ProcessPlatform', value);
        }
        /**
        * * Field Name: ProcessVersion
        * * Display Name: Process Version
        * * SQL Data Type: nvarchar(15)
        */
        get ProcessVersion(): string {  
            return this.Get('ProcessVersion');
        }
        set ProcessVersion(value: string) {
            this.Set('ProcessVersion', value);
        }
        /**
        * * Field Name: ProcessCwd
        * * Display Name: Process Cwd
        * * SQL Data Type: nvarchar(100)
        */
        get ProcessCwd(): string {  
            return this.Get('ProcessCwd');
        }
        set ProcessCwd(value: string) {
            this.Set('ProcessCwd', value);
        }
        /**
        * * Field Name: ProcessIPAddress
        * * Display Name: Process IPAddress
        * * SQL Data Type: nvarchar(50)
        */
        get ProcessIPAddress(): string {  
            return this.Get('ProcessIPAddress');
        }
        set ProcessIPAddress(value: string) {
            this.Set('ProcessIPAddress', value);
        }
        /**
        * * Field Name: ProcessMacAddress
        * * Display Name: Process Mac Address
        * * SQL Data Type: nvarchar(50)
        */
        get ProcessMacAddress(): string {  
            return this.Get('ProcessMacAddress');
        }
        set ProcessMacAddress(value: string) {
            this.Set('ProcessMacAddress', value);
        }
        /**
        * * Field Name: ProcessOSName
        * * Display Name: Process OSName
        * * SQL Data Type: nvarchar(25)
        */
        get ProcessOSName(): string {  
            return this.Get('ProcessOSName');
        }
        set ProcessOSName(value: string) {
            this.Set('ProcessOSName', value);
        }
        /**
        * * Field Name: ProcessOSVersion
        * * Display Name: Process OSVersion
        * * SQL Data Type: nvarchar(10)
        */
        get ProcessOSVersion(): string {  
            return this.Get('ProcessOSVersion');
        }
        set ProcessOSVersion(value: string) {
            this.Set('ProcessOSVersion', value);
        }
        /**
        * * Field Name: ProcessHostName
        * * Display Name: Process Host Name
        * * SQL Data Type: nvarchar(50)
        */
        get ProcessHostName(): string {  
            return this.Get('ProcessHostName');
        }
        set ProcessHostName(value: string) {
            this.Set('ProcessHostName', value);
        }
        /**
        * * Field Name: ProcessUserID
        * * Display Name: Process User ID
        * * SQL Data Type: nvarchar(25)
        */
        get ProcessUserID(): string {  
            return this.Get('ProcessUserID');
        }
        set ProcessUserID(value: string) {
            this.Set('ProcessUserID', value);
        }
        /**
        * * Field Name: ProcessUserName
        * * Display Name: Process User Name
        * * SQL Data Type: nvarchar(50)
        */
        get ProcessUserName(): string {  
            return this.Get('ProcessUserName');
        }
        set ProcessUserName(value: string) {
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
     * * Schema: admin
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
        * @param ID: Number - primary key value to load the Queue Tasks record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof QueueTaskEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
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
        * * Related Entity: Queues
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
        * * Default Value: N'Pending'
        */
        get Status(): string {  
            return this.Get('Status');
        }
        set Status(value: string) {
            this.Set('Status', value);
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
        get EndedAt(): Date {  
            return this.Get('EndedAt');
        }
        set EndedAt(value: Date) {
            this.Set('EndedAt', value);
        }
        /**
        * * Field Name: Data
        * * Display Name: Data
        * * SQL Data Type: nvarchar(MAX)
        */
        get Data(): string {  
            return this.Get('Data');
        }
        set Data(value: string) {
            this.Set('Data', value);
        }
        /**
        * * Field Name: Options
        * * Display Name: Options
        * * SQL Data Type: nvarchar(MAX)
        */
        get Options(): string {  
            return this.Get('Options');
        }
        set Options(value: string) {
            this.Set('Options', value);
        }
        /**
        * * Field Name: Output
        * * Display Name: Output
        * * SQL Data Type: nvarchar(MAX)
        */
        get Output(): string {  
            return this.Get('Output');
        }
        set Output(value: string) {
            this.Set('Output', value);
        }
        /**
        * * Field Name: ErrorMessage
        * * Display Name: Error Message
        * * SQL Data Type: nvarchar(MAX)
        */
        get ErrorMessage(): string {  
            return this.Get('ErrorMessage');
        }
        set ErrorMessage(value: string) {
            this.Set('ErrorMessage', value);
        }
        /**
        * * Field Name: Comments
        * * Display Name: Comments
        * * SQL Data Type: nvarchar(MAX)
        */
        get Comments(): string {  
            return this.Get('Comments');
        }
        set Comments(value: string) {
            this.Set('Comments', value);
        }

    }
    
    /**
     * Dashboards - strongly typed entity sub-class
     * * Schema: admin
     * * Base Table: Dashboard
     * * Base View: vwDashboards
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Dashboards')
    export class DashboardEntity extends BaseEntity {
        /**
        * Loads the Dashboards record from the database
        * @param ID: Number - primary key value to load the Dashboards record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof DashboardEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
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
        get Description(): string {  
            return this.Get('Description');
        }
        set Description(value: string) {
            this.Set('Description', value);
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
        * * Related Entity: Users
        */
        get UserID(): number {  
            return this.Get('UserID');
        }
        set UserID(value: number) {
            this.Set('UserID', value);
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
     * Output Trigger Types - strongly typed entity sub-class
     * * Schema: admin
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
        * @param ID: Number - primary key value to load the Output Trigger Types record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof OutputTriggerTypeEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
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
        get Description(): string {  
            return this.Get('Description');
        }
        set Description(value: string) {
            this.Set('Description', value);
        }

    }
    
    /**
     * Output Format Types - strongly typed entity sub-class
     * * Schema: admin
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
        * @param ID: Number - primary key value to load the Output Format Types record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof OutputFormatTypeEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
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
        get Description(): string {  
            return this.Get('Description');
        }
        set Description(value: string) {
            this.Set('Description', value);
        }
        /**
        * * Field Name: DisplayFormat
        * * Display Name: Display Format
        * * SQL Data Type: nvarchar(MAX)
        */
        get DisplayFormat(): string {  
            return this.Get('DisplayFormat');
        }
        set DisplayFormat(value: string) {
            this.Set('DisplayFormat', value);
        }

    }
    
    /**
     * Output Delivery Types - strongly typed entity sub-class
     * * Schema: admin
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
        * @param ID: Number - primary key value to load the Output Delivery Types record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof OutputDeliveryTypeEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
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
        get Description(): string {  
            return this.Get('Description');
        }
        set Description(value: string) {
            this.Set('Description', value);
        }

    }
    
    /**
     * Reports - strongly typed entity sub-class
     * * Schema: admin
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
        * @param ID: Number - primary key value to load the Reports record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof ReportEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
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
        get Description(): string {  
            return this.Get('Description');
        }
        set Description(value: string) {
            this.Set('Description', value);
        }
        /**
        * * Field Name: UserID
        * * Display Name: User ID
        * * SQL Data Type: int
        * * Related Entity: Users
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
        * * Default Value: N'Personal'
        */
        get SharingScope(): string {  
            return this.Get('SharingScope');
        }
        set SharingScope(value: string) {
            this.Set('SharingScope', value);
        }
        /**
        * * Field Name: ConversationID
        * * Display Name: Conversation ID
        * * SQL Data Type: int
        * * Related Entity: Conversations
        */
        get ConversationID(): number {  
            return this.Get('ConversationID');
        }
        set ConversationID(value: number) {
            this.Set('ConversationID', value);
        }
        /**
        * * Field Name: ConversationDetailID
        * * Display Name: Conversation Detail ID
        * * SQL Data Type: int
        * * Related Entity: Conversation Details
        */
        get ConversationDetailID(): number {  
            return this.Get('ConversationDetailID');
        }
        set ConversationDetailID(value: number) {
            this.Set('ConversationDetailID', value);
        }
        /**
        * * Field Name: ReportSQL
        * * Display Name: Report SQL
        * * SQL Data Type: nvarchar(MAX)
        */
        get ReportSQL(): string {  
            return this.Get('ReportSQL');
        }
        set ReportSQL(value: string) {
            this.Set('ReportSQL', value);
        }
        /**
        * * Field Name: ReportConfiguration
        * * Display Name: Report Configuration
        * * SQL Data Type: nvarchar(MAX)
        */
        get ReportConfiguration(): string {  
            return this.Get('ReportConfiguration');
        }
        set ReportConfiguration(value: string) {
            this.Set('ReportConfiguration', value);
        }
        /**
        * * Field Name: OutputTriggerTypeID
        * * Display Name: Output Trigger Type ID
        * * SQL Data Type: int
        * * Related Entity: Output Trigger Types
        */
        get OutputTriggerTypeID(): number {  
            return this.Get('OutputTriggerTypeID');
        }
        set OutputTriggerTypeID(value: number) {
            this.Set('OutputTriggerTypeID', value);
        }
        /**
        * * Field Name: OutputFormatTypeID
        * * Display Name: Output Format Type ID
        * * SQL Data Type: int
        * * Related Entity: Output Format Types
        */
        get OutputFormatTypeID(): number {  
            return this.Get('OutputFormatTypeID');
        }
        set OutputFormatTypeID(value: number) {
            this.Set('OutputFormatTypeID', value);
        }
        /**
        * * Field Name: OutputDeliveryTypeID
        * * Display Name: Output Delivery Type ID
        * * SQL Data Type: int
        * * Related Entity: Output Delivery Types
        */
        get OutputDeliveryTypeID(): number {  
            return this.Get('OutputDeliveryTypeID');
        }
        set OutputDeliveryTypeID(value: number) {
            this.Set('OutputDeliveryTypeID', value);
        }
        /**
        * * Field Name: OutputEventID
        * * Display Name: Output Event ID
        * * SQL Data Type: int
        * * Related Entity: Output Delivery Types
        */
        get OutputEventID(): number {  
            return this.Get('OutputEventID');
        }
        set OutputEventID(value: number) {
            this.Set('OutputEventID', value);
        }
        /**
        * * Field Name: OutputFrequency
        * * Display Name: Output Frequency
        * * SQL Data Type: nvarchar(50)
        */
        get OutputFrequency(): string {  
            return this.Get('OutputFrequency');
        }
        set OutputFrequency(value: string) {
            this.Set('OutputFrequency', value);
        }
        /**
        * * Field Name: OutputTargetEmail
        * * Display Name: Output Target Email
        * * SQL Data Type: nvarchar(255)
        */
        get OutputTargetEmail(): string {  
            return this.Get('OutputTargetEmail');
        }
        set OutputTargetEmail(value: string) {
            this.Set('OutputTargetEmail', value);
        }
        /**
        * * Field Name: OutputWorkflowID
        * * Display Name: Output Workflow ID
        * * SQL Data Type: int
        * * Related Entity: Workflows
        */
        get OutputWorkflowID(): number {  
            return this.Get('OutputWorkflowID');
        }
        set OutputWorkflowID(value: number) {
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
        get Conversation(): string {  
            return this.Get('Conversation');
        }
    
        /**
        * * Field Name: OutputTriggerType
        * * Display Name: Output Trigger Type
        * * SQL Data Type: nvarchar(255)
        */
        get OutputTriggerType(): string {  
            return this.Get('OutputTriggerType');
        }
    
        /**
        * * Field Name: OutputFormatType
        * * Display Name: Output Format Type
        * * SQL Data Type: nvarchar(255)
        */
        get OutputFormatType(): string {  
            return this.Get('OutputFormatType');
        }
    
        /**
        * * Field Name: OutputDeliveryType
        * * Display Name: Output Delivery Type
        * * SQL Data Type: nvarchar(255)
        */
        get OutputDeliveryType(): string {  
            return this.Get('OutputDeliveryType');
        }
    
        /**
        * * Field Name: OutputEvent
        * * Display Name: Output Event
        * * SQL Data Type: nvarchar(255)
        */
        get OutputEvent(): string {  
            return this.Get('OutputEvent');
        }
    

    }
    
    /**
     * Report Snapshots - strongly typed entity sub-class
     * * Schema: admin
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
        * @param ID: Number - primary key value to load the Report Snapshots record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof ReportSnapshotEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
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
        * * Related Entity: Reports
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
        * * Related Entity: Users
        */
        get UserID(): number {  
            return this.Get('UserID');
        }
        set UserID(value: number) {
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
        get User(): string {  
            return this.Get('User');
        }
    

    }
    
    /**
     * Resource Types - strongly typed entity sub-class
     * * Schema: admin
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
        * @param ID: Number - primary key value to load the Resource Types record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof ResourceTypeEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
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
        get Description(): string {  
            return this.Get('Description');
        }
        set Description(value: string) {
            this.Set('Description', value);
        }
        /**
        * * Field Name: Icon
        * * Display Name: Icon
        * * SQL Data Type: nvarchar(100)
        */
        get Icon(): string {  
            return this.Get('Icon');
        }
        set Icon(value: string) {
            this.Set('Icon', value);
        }
        /**
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: int
        * * Related Entity: Entities
        */
        get EntityID(): number {  
            return this.Get('EntityID');
        }
        set EntityID(value: number) {
            this.Set('EntityID', value);
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
     * Tags - strongly typed entity sub-class
     * * Schema: admin
     * * Base Table: Tag
     * * Base View: vwTags
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Tags')
    export class TagEntity extends BaseEntity {
        /**
        * Loads the Tags record from the database
        * @param ID: Number - primary key value to load the Tags record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof TagEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
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
        get Description(): string {  
            return this.Get('Description');
        }
        set Description(value: string) {
            this.Set('Description', value);
        }
        /**
        * * Field Name: ParentID
        * * Display Name: Parent ID
        * * SQL Data Type: int
        * * Related Entity: Tags
        */
        get ParentID(): number {  
            return this.Get('ParentID');
        }
        set ParentID(value: number) {
            this.Set('ParentID', value);
        }
        /**
        * * Field Name: Parent
        * * Display Name: Parent
        * * SQL Data Type: nvarchar(255)
        */
        get Parent(): string {  
            return this.Get('Parent');
        }
    

    }
    
    /**
     * Tagged Items - strongly typed entity sub-class
     * * Schema: admin
     * * Base Table: TaggedItem
     * * Base View: vwTaggedItems
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Tagged Items')
    export class TaggedItemEntity extends BaseEntity {
        /**
        * Loads the Tagged Items record from the database
        * @param ID: Number - primary key value to load the Tagged Items record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof TaggedItemEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
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
        * Tagged Items - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof TaggedItemEntity
        * @throws {Error} - Delete is not allowed for Tagged Items, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Tagged Items, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Related Entity: Tags
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
    

    }
    
    /**
     * Workspaces - strongly typed entity sub-class
     * * Schema: admin
     * * Base Table: Workspace
     * * Base View: vwWorkspaces
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Workspaces')
    export class WorkspaceEntity extends BaseEntity {
        /**
        * Loads the Workspaces record from the database
        * @param ID: Number - primary key value to load the Workspaces record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof WorkspaceEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
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
        get Description(): string {  
            return this.Get('Description');
        }
        set Description(value: string) {
            this.Set('Description', value);
        }
        /**
        * * Field Name: UserID
        * * Display Name: User ID
        * * SQL Data Type: int
        * * Related Entity: Users
        */
        get UserID(): number {  
            return this.Get('UserID');
        }
        set UserID(value: number) {
            this.Set('UserID', value);
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
     * * Schema: admin
     * * Base Table: WorkspaceItem
     * * Base View: vwWorkspaceItems
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Workspace Items')
    export class WorkspaceItemEntity extends BaseEntity {
        /**
        * Loads the Workspace Items record from the database
        * @param ID: Number - primary key value to load the Workspace Items record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof WorkspaceItemEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
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
        get Description(): string {  
            return this.Get('Description');
        }
        set Description(value: string) {
            this.Set('Description', value);
        }
        /**
        * * Field Name: WorkSpaceID
        * * Display Name: Work Space ID
        * * SQL Data Type: int
        * * Related Entity: Workspaces
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
        * * Related Entity: Resource Types
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
        * * SQL Data Type: nvarchar(255)
        */
        get ResourceRecordID(): string {  
            return this.Get('ResourceRecordID');
        }
        set ResourceRecordID(value: string) {
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
        get Configuration(): string {  
            return this.Get('Configuration');
        }
        set Configuration(value: string) {
            this.Set('Configuration', value);
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
     * * Schema: admin
     * * Base Table: Dataset
     * * Base View: vwDatasets
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Datasets')
    export class DatasetEntity extends BaseEntity {
        /**
        * Loads the Datasets record from the database
        * @param ID: Number - primary key value to load the Datasets record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof DatasetEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
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
     * Dataset Items - strongly typed entity sub-class
     * * Schema: admin
     * * Base Table: DatasetItem
     * * Base View: vwDatasetItems
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Dataset Items')
    export class DatasetItemEntity extends BaseEntity {
        /**
        * Loads the Dataset Items record from the database
        * @param ID: Number - primary key value to load the Dataset Items record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof DatasetItemEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
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
        * * Related Entity: Datasets
        */
        get DatasetName(): string {  
            return this.Get('DatasetName');
        }
        set DatasetName(value: string) {
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
        * * Related Entity: Entities
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
        get WhereClause(): string {  
            return this.Get('WhereClause');
        }
        set WhereClause(value: string) {
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
     * * Schema: admin
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
        * @param ID: Number - primary key value to load the Conversation Details record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof ConversationDetailEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
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
        * * Related Entity: Conversations
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
        get ExternalID(): string {  
            return this.Get('ExternalID');
        }
        set ExternalID(value: string) {
            this.Set('ExternalID', value);
        }
        /**
        * * Field Name: Role
        * * Display Name: Role
        * * SQL Data Type: nvarchar(20)
        * * Default Value: user_name()
        */
        get Role(): string {  
            return this.Get('Role');
        }
        set Role(value: string) {
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
        get Error(): string {  
            return this.Get('Error');
        }
        set Error(value: string) {
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
        get Conversation(): string {  
            return this.Get('Conversation');
        }
    

    }
    
    /**
     * Conversations - strongly typed entity sub-class
     * * Schema: admin
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
        * @param ID: Number - primary key value to load the Conversations record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof ConversationEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
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
        * * Related Entity: Users
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
        get ExternalID(): string {  
            return this.Get('ExternalID');
        }
        set ExternalID(value: string) {
            this.Set('ExternalID', value);
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
        get Description(): string {  
            return this.Get('Description');
        }
        set Description(value: string) {
            this.Set('Description', value);
        }
        /**
        * * Field Name: Type
        * * Display Name: Type
        * * SQL Data Type: nvarchar(50)
        * * Default Value: N'Skip'
        */
        get Type(): string {  
            return this.Get('Type');
        }
        set Type(value: string) {
            this.Set('Type', value);
        }
        /**
        * * Field Name: LinkedEntityID
        * * Display Name: Linked Entity ID
        * * SQL Data Type: int
        * * Related Entity: Entities
        */
        get LinkedEntityID(): number {  
            return this.Get('LinkedEntityID');
        }
        set LinkedEntityID(value: number) {
            this.Set('LinkedEntityID', value);
        }
        /**
        * * Field Name: LinkedRecordID
        * * Display Name: Linked Record ID
        * * SQL Data Type: int
        */
        get LinkedRecordID(): number {  
            return this.Get('LinkedRecordID');
        }
        set LinkedRecordID(value: number) {
            this.Set('LinkedRecordID', value);
        }
        /**
        * * Field Name: DataContextID
        * * Display Name: Data Context ID
        * * SQL Data Type: int
        */
        get DataContextID(): number {  
            return this.Get('DataContextID');
        }
        set DataContextID(value: number) {
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
        get LinkedEntity(): string {  
            return this.Get('LinkedEntity');
        }
    

    }
    
    /**
     * User Notifications - strongly typed entity sub-class
     * * Schema: admin
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
        * @param ID: Number - primary key value to load the User Notifications record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof UserNotificationEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
        }
        
        /**
        * User Notifications - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof UserNotificationEntity
        * @throws {Error} - Delete is not allowed for User Notifications, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for User Notifications, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Related Entity: Users
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
        get Title(): string {  
            return this.Get('Title');
        }
        set Title(value: string) {
            this.Set('Title', value);
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
        * * Field Name: ResourceTypeID
        * * Display Name: Resource Type ID
        * * SQL Data Type: int
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
        * * SQL Data Type: int
        */
        get ResourceRecordID(): number {  
            return this.Get('ResourceRecordID');
        }
        set ResourceRecordID(value: number) {
            this.Set('ResourceRecordID', value);
        }
        /**
        * * Field Name: ResourceConfiguration
        * * Display Name: Resource Configuration
        * * SQL Data Type: nvarchar(MAX)
        */
        get ResourceConfiguration(): string {  
            return this.Get('ResourceConfiguration');
        }
        set ResourceConfiguration(value: string) {
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
        get ReadAt(): Date {  
            return this.Get('ReadAt');
        }
        set ReadAt(value: Date) {
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
     * Resource Folders - strongly typed entity sub-class
     * * Schema: admin
     * * Base Table: ResourceFolder
     * * Base View: vwResourceFolders
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Resource Folders')
    export class ResourceFolderEntity extends BaseEntity {
        /**
        * Loads the Resource Folders record from the database
        * @param ID: Number - primary key value to load the Resource Folders record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof ResourceFolderEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
        }
        
        /**
        * Resource Folders - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof ResourceFolderEntity
        * @throws {Error} - Delete is not allowed for Resource Folders, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Resource Folders, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Related Entity: Resource Folders
        */
        get ParentID(): number {  
            return this.Get('ParentID');
        }
        set ParentID(value: number) {
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
        * * Field Name: ResourceTypeName
        * * Display Name: Resource Type Name
        * * SQL Data Type: nvarchar(255)
        * * Related Entity: Resource Types
        */
        get ResourceTypeName(): string {  
            return this.Get('ResourceTypeName');
        }
        set ResourceTypeName(value: string) {
            this.Set('ResourceTypeName', value);
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
        * * Field Name: UserID
        * * Display Name: User ID
        * * SQL Data Type: int
        * * Related Entity: Users
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
        * * SQL Data Type: nvarchar(50)
        */
        get Parent(): string {  
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
     * Schema Info - strongly typed entity sub-class
     * * Schema: admin
     * * Base Table: SchemaInfo
     * * Base View: vwSchemaInfos
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Schema Info')
    export class SchemaInfoEntity extends BaseEntity {
        /**
        * Loads the Schema Info record from the database
        * @param ID: Number - primary key value to load the Schema Info record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof SchemaInfoEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
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
        get Comments(): string {  
            return this.Get('Comments');
        }
        set Comments(value: string) {
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
     * * Schema: admin
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
        * @param ID: Number - primary key value to load the Company Integration Record Maps record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof CompanyIntegrationRecordMapEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
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
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: int
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
    

    }
    
    /**
     * Record Merge Logs - strongly typed entity sub-class
     * * Schema: admin
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
        * @param ID: Number - primary key value to load the Record Merge Logs record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof RecordMergeLogEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
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
        * * Related Entity: Entities
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
        * * Related Entity: Users
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
        * * Default Value: N'Pending'
        */
        get ApprovalStatus(): string {  
            return this.Get('ApprovalStatus');
        }
        set ApprovalStatus(value: string) {
            this.Set('ApprovalStatus', value);
        }
        /**
        * * Field Name: ApprovedByUserID
        * * Display Name: Approved By User ID
        * * SQL Data Type: int
        */
        get ApprovedByUserID(): number {  
            return this.Get('ApprovedByUserID');
        }
        set ApprovedByUserID(value: number) {
            this.Set('ApprovedByUserID', value);
        }
        /**
        * * Field Name: ProcessingStatus
        * * Display Name: Processing Status
        * * SQL Data Type: nvarchar(10)
        * * Default Value: N'Pending'
        */
        get ProcessingStatus(): string {  
            return this.Get('ProcessingStatus');
        }
        set ProcessingStatus(value: string) {
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
        get ProcessingEndedAt(): Date {  
            return this.Get('ProcessingEndedAt');
        }
        set ProcessingEndedAt(value: Date) {
            this.Set('ProcessingEndedAt', value);
        }
        /**
        * * Field Name: ProcessingLog
        * * Display Name: Processing Log
        * * SQL Data Type: nvarchar(MAX)
        */
        get ProcessingLog(): string {  
            return this.Get('ProcessingLog');
        }
        set ProcessingLog(value: string) {
            this.Set('ProcessingLog', value);
        }
        /**
        * * Field Name: Comments
        * * Display Name: Comments
        * * SQL Data Type: nvarchar(MAX)
        */
        get Comments(): string {  
            return this.Get('Comments');
        }
        set Comments(value: string) {
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
     * * Schema: admin
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
        * @param ID: Number - primary key value to load the Record Merge Deletion Logs record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof RecordMergeDeletionLogEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
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
        * * Related Entity: Record Merge Logs
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
        * * Default Value: N'Pending'
        */
        get Status(): string {  
            return this.Get('Status');
        }
        set Status(value: string) {
            this.Set('Status', value);
        }
        /**
        * * Field Name: ProcessingLog
        * * Display Name: Processing Log
        * * SQL Data Type: nvarchar(MAX)
        */
        get ProcessingLog(): string {  
            return this.Get('ProcessingLog');
        }
        set ProcessingLog(value: string) {
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
     * * Schema: admin
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
        * @param ID: Number - primary key value to load the Query Fields record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof QueryFieldEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
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
        * * Related Entity: Queries
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
        get Description(): string {  
            return this.Get('Description');
        }
        set Description(value: string) {
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
        * * Field Name: SourceEntityID
        * * Display Name: Source Entity ID
        * * SQL Data Type: int
        */
        get SourceEntityID(): number {  
            return this.Get('SourceEntityID');
        }
        set SourceEntityID(value: number) {
            this.Set('SourceEntityID', value);
        }
        /**
        * * Field Name: SourceFieldName
        * * Display Name: Source Field Name
        * * SQL Data Type: nvarchar(255)
        */
        get SourceFieldName(): string {  
            return this.Get('SourceFieldName');
        }
        set SourceFieldName(value: string) {
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
        get ComputationDescription(): string {  
            return this.Get('ComputationDescription');
        }
        set ComputationDescription(value: string) {
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
        get SummaryDescription(): string {  
            return this.Get('SummaryDescription');
        }
        set SummaryDescription(value: string) {
            this.Set('SummaryDescription', value);
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
        * * Field Name: Query
        * * Display Name: Query
        * * SQL Data Type: nvarchar(255)
        */
        get Query(): string {  
            return this.Get('Query');
        }
    

    }
    
    /**
     * Query Categories - strongly typed entity sub-class
     * * Schema: admin
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
        * @param ID: Number - primary key value to load the Query Categories record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof QueryCategoryEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
        }
        
        /**
        * Query Categories - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof QueryCategoryEntity
        * @throws {Error} - Delete is not allowed for Query Categories, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Query Categories, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Related Entity: Query Categories
        */
        get ParentID(): number {  
            return this.Get('ParentID');
        }
        set ParentID(value: number) {
            this.Set('ParentID', value);
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
        get Parent(): string {  
            return this.Get('Parent');
        }
    

    }
    
    /**
     * Queries - strongly typed entity sub-class
     * * Schema: admin
     * * Base Table: Query
     * * Base View: vwQueries
     * * Primary Key: ID
     * @extends {BaseEntity}
     * @class
     * @public
     */
    @RegisterClass(BaseEntity, 'Queries')
    export class QueryEntity extends BaseEntity {
        /**
        * Loads the Queries record from the database
        * @param ID: Number - primary key value to load the Queries record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof QueryEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
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
        * * Field Name: CategoryID
        * * Display Name: Category ID
        * * SQL Data Type: int
        * * Related Entity: Query Categories
        */
        get CategoryID(): number {  
            return this.Get('CategoryID');
        }
        set CategoryID(value: number) {
            this.Set('CategoryID', value);
        }
        /**
        * * Field Name: SQL
        * * Display Name: SQL
        * * SQL Data Type: nvarchar(MAX)
        */
        get SQL(): string {  
            return this.Get('SQL');
        }
        set SQL(value: string) {
            this.Set('SQL', value);
        }
        /**
        * * Field Name: OriginalSQL
        * * Display Name: Original SQL
        * * SQL Data Type: nvarchar(MAX)
        */
        get OriginalSQL(): string {  
            return this.Get('OriginalSQL');
        }
        set OriginalSQL(value: string) {
            this.Set('OriginalSQL', value);
        }
        /**
        * * Field Name: Feedback
        * * Display Name: Feedback
        * * SQL Data Type: nvarchar(MAX)
        */
        get Feedback(): string {  
            return this.Get('Feedback');
        }
        set Feedback(value: string) {
            this.Set('Feedback', value);
        }
        /**
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(15)
        * * Default Value: N'Pending'
        */
        get Status(): string {  
            return this.Get('Status');
        }
        set Status(value: string) {
            this.Set('Status', value);
        }
        /**
        * * Field Name: QualityRank
        * * Display Name: Quality Rank
        * * SQL Data Type: int
        * * Default Value: 0
        */
        get QualityRank(): number {  
            return this.Get('QualityRank');
        }
        set QualityRank(value: number) {
            this.Set('QualityRank', value);
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
        * * SQL Data Type: nvarchar(50)
        */
        get Category(): string {  
            return this.Get('Category');
        }
    

    }
    
    /**
     * Query Permissions - strongly typed entity sub-class
     * * Schema: admin
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
        * @param ID: Number - primary key value to load the Query Permissions record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof QueryPermissionEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
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
        * * Related Entity: Queries
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
        * * Related Entity: Roles
        */
        get RoleName(): string {  
            return this.Get('RoleName');
        }
        set RoleName(value: string) {
            this.Set('RoleName', value);
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
     * Vector Indexes - strongly typed entity sub-class
     * * Schema: admin
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
        * @param ID: Number - primary key value to load the Vector Indexes record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof VectorIndexEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
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
        get Description(): string {  
            return this.Get('Description');
        }
        set Description(value: string) {
            this.Set('Description', value);
        }
        /**
        * * Field Name: VectorDatabaseID
        * * Display Name: Vector Database ID
        * * SQL Data Type: int
        * * Related Entity: Vector Databases
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
        * * Related Entity: AI Models
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
     * * Schema: admin
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
        * @param ID: Number - primary key value to load the Entity Document Types record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof EntityDocumentTypeEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
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
     * Entity Document Runs - strongly typed entity sub-class
     * * Schema: admin
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
        * @param ID: Number - primary key value to load the Entity Document Runs record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof EntityDocumentRunEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
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
        * * Related Entity: Entity Documents
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
        get EndedAt(): Date {  
            return this.Get('EndedAt');
        }
        set EndedAt(value: Date) {
            this.Set('EndedAt', value);
        }
        /**
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(15)
        * * Default Value: N'Pending'
        * * Description: Can be Pending, In Progress, Completed, or Failed
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
        * * Field Name: EntityDocument
        * * Display Name: Entity Document
        * * SQL Data Type: nvarchar(250)
        */
        get EntityDocument(): string {  
            return this.Get('EntityDocument');
        }
    

    }
    
    /**
     * Vector Databases - strongly typed entity sub-class
     * * Schema: admin
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
        * @param ID: Number - primary key value to load the Vector Databases record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof VectorDatabaseEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
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
        get Description(): string {  
            return this.Get('Description');
        }
        set Description(value: string) {
            this.Set('Description', value);
        }
        /**
        * * Field Name: DefaultURL
        * * Display Name: Default URL
        * * SQL Data Type: nvarchar(255)
        */
        get DefaultURL(): string {  
            return this.Get('DefaultURL');
        }
        set DefaultURL(value: string) {
            this.Set('DefaultURL', value);
        }
        /**
        * * Field Name: ClassKey
        * * Display Name: Class Key
        * * SQL Data Type: nvarchar(100)
        */
        get ClassKey(): string {  
            return this.Get('ClassKey');
        }
        set ClassKey(value: string) {
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
     * * Schema: admin
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
        * @param ID: Number - primary key value to load the Entity Record Documents record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof EntityRecordDocumentEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
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
        get DocumentText(): string {  
            return this.Get('DocumentText');
        }
        set DocumentText(value: string) {
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
        get VectorID(): string {  
            return this.Get('VectorID');
        }
        set VectorID(value: string) {
            this.Set('VectorID', value);
        }
        /**
        * * Field Name: VectorJSON
        * * Display Name: Vector JSON
        * * SQL Data Type: nvarchar(MAX)
        */
        get VectorJSON(): string {  
            return this.Get('VectorJSON');
        }
        set VectorJSON(value: string) {
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
     * Entity Documents - strongly typed entity sub-class
     * * Schema: admin
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
        * @param ID: Number - primary key value to load the Entity Documents record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof EntityDocumentEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
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
        * * Related Entity: Entity Document Types
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
        * * Default Value: N'Pending'
        */
        get Status(): string {  
            return this.Get('Status');
        }
        set Status(value: string) {
            this.Set('Status', value);
        }
        /**
        * * Field Name: Template
        * * Display Name: Template
        * * SQL Data Type: nvarchar(MAX)
        */
        get Template(): string {  
            return this.Get('Template');
        }
        set Template(value: string) {
            this.Set('Template', value);
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
        * * Field Name: Type
        * * Display Name: Type
        * * SQL Data Type: nvarchar(100)
        */
        get Type(): string {  
            return this.Get('Type');
        }
    

    }
    
    /**
     * Data Context Items - strongly typed entity sub-class
     * * Schema: admin
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
        * @param ID: Number - primary key value to load the Data Context Items record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof DataContextItemEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
        }
        
        /**
        * Data Context Items - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof DataContextItemEntity
        * @throws {Error} - Delete is not allowed for Data Context Items, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Data Context Items, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Related Entity: Data Contexts
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
        * * Description: The type of the item, either "view", "query", "full_entity", "single_record", or "sql"
        */
        get Type(): string {  
            return this.Get('Type');
        }
        set Type(value: string) {
            this.Set('Type', value);
        }
        /**
        * * Field Name: ViewID
        * * Display Name: View ID
        * * SQL Data Type: int
        * * Related Entity: User Views
        * * Description: Only used if Type='view'
        */
        get ViewID(): number {  
            return this.Get('ViewID');
        }
        set ViewID(value: number) {
            this.Set('ViewID', value);
        }
        /**
        * * Field Name: QueryID
        * * Display Name: Query ID
        * * SQL Data Type: int
        * * Related Entity: Queries
        * * Description: Only used if Type='query'
        */
        get QueryID(): number {  
            return this.Get('QueryID');
        }
        set QueryID(value: number) {
            this.Set('QueryID', value);
        }
        /**
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: int
        * * Description: Used if type='full_entity' or type='single_record'
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
        * * SQL Data Type: int
        * * Description: The ID for the record, only used when Type='single_record'
        */
        get RecordID(): number {  
            return this.Get('RecordID');
        }
        set RecordID(value: number) {
            this.Set('RecordID', value);
        }
        /**
        * * Field Name: SQL
        * * Display Name: SQL
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Only used when Type=sql
        */
        get SQL(): string {  
            return this.Get('SQL');
        }
        set SQL(value: string) {
            this.Set('SQL', value);
        }
        /**
        * * Field Name: DataJSON
        * * Display Name: Data JSON
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Optionally used to cache results of an item. This can be used for performance optimization, and also for having snapshots of data for historical comparisons.
        */
        get DataJSON(): string {  
            return this.Get('DataJSON');
        }
        set DataJSON(value: string) {
            this.Set('DataJSON', value);
        }
        /**
        * * Field Name: LastRefreshedAt
        * * Display Name: Last Refreshed At
        * * SQL Data Type: datetime
        * * Description: If DataJSON is populated, this field will show the date the the data was captured
        */
        get LastRefreshedAt(): Date {  
            return this.Get('LastRefreshedAt');
        }
        set LastRefreshedAt(value: Date) {
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
        get View(): string {  
            return this.Get('View');
        }
    
        /**
        * * Field Name: Query
        * * Display Name: Query
        * * SQL Data Type: nvarchar(255)
        */
        get Query(): string {  
            return this.Get('Query');
        }
    

    }
    
    /**
     * Data Contexts - strongly typed entity sub-class
     * * Schema: admin
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
        * @param ID: Number - primary key value to load the Data Contexts record.
        * @param EntityRelationshipsToLoad - (optional) the relationships to load
        * @returns {Promise<boolean>} - true if successful, false otherwise
        * @public
        * @async
        * @memberof DataContextEntity
        * @method
        * @override
        */      
        public async Load(ID: Number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
            const pkeyValues: PrimaryKeyValue[] = [];
            pkeyValues.push({ FieldName: 'ID', Value: ID });
            return await super.InnerLoad(pkeyValues, EntityRelationshipsToLoad);
        }
        
        /**
        * Data Contexts - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
        * @public
        * @method
        * @override
        * @memberof DataContextEntity
        * @throws {Error} - Delete is not allowed for Data Contexts, to enable it set AllowDeleteAPI to 1 in the database.
        */
        public async Delete(): Promise<boolean> {
            throw new Error('Delete is not allowed for Data Contexts, to enable it set AllowDeleteAPI to 1 in the database.');
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
        * * Related Entity: Users
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
        get Description(): string {  
            return this.Get('Description');
        }
        set Description(value: string) {
            this.Set('Description', value);
        }
        /**
        * * Field Name: LastRefreshedAt
        * * Display Name: Last Refreshed At
        * * SQL Data Type: datetime
        */
        get LastRefreshedAt(): Date {  
            return this.Get('LastRefreshedAt');
        }
        set LastRefreshedAt(value: Date) {
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
    