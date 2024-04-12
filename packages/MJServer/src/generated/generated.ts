/********************************************************************************
* ALL ENTITIES - TypeGraphQL Type Class Definition - AUTO GENERATED FILE
* Generated Entities and Resolvers for Server
* 
* GENERATED: 4/12/2024, 3:53:39 PM
* 
*   >>> DO NOT MODIFY THIS FILE!!!!!!!!!!!!
*   >>> YOUR CHANGES WILL BE OVERWRITTEN
*   >>> THE NEXT TIME THIS FILE IS GENERATED
* 
**********************************************************************************/
import { Arg, Ctx, Int, Query, Resolver, Field, Float, ObjectType, FieldResolver, Root, InputType, Mutation, 
            PubSub, PubSubEngine, ResolverBase, RunViewByIDInput, RunViewByNameInput, RunDynamicViewInput } from '@memberjunction/server';
import { Metadata, EntityPermissionType } from '@memberjunction/core'
import { AppContext } from '@memberjunction/server';

import { MaxLength } from 'class-validator';
import { DataSource } from 'typeorm';
import { mj_core_schema } from '../config';

import * as mj_core_schema_server_object_types from '@memberjunction/server'

import { CompanyEntity, EmployeeEntity, UserFavoriteEntity, EmployeeCompanyIntegrationEntity, EmployeeRoleEntity, EmployeeSkillEntity, RoleEntity, SkillEntity, IntegrationURLFormatEntity, IntegrationEntity, CompanyIntegrationEntity, EntityFieldEntity, EntityEntity, UserEntity, EntityRelationshipEntity, UserRecordLogEntity, UserViewEntity, CompanyIntegrationRunEntity, CompanyIntegrationRunDetailEntity, ErrorLogEntity, ApplicationEntity, ApplicationEntityEntity, EntityPermissionEntity, UserApplicationEntityEntity, UserApplicationEntity, CompanyIntegrationRunAPILogEntity, ListEntity, ListDetailEntity, UserViewRunEntity, UserViewRunDetailEntity, WorkflowRunEntity, WorkflowEntity, WorkflowEngineEntity, RecordChangeEntity, UserRoleEntity, RowLevelSecurityFilterEntity, AuditLogEntity, AuthorizationEntity, AuthorizationRoleEntity, AuditLogTypeEntity, EntityFieldValueEntity, AIModelEntity, AIActionEntity, AIModelActionEntity, EntityAIActionEntity, AIModelTypeEntity, QueueTypeEntity, QueueEntity, QueueTaskEntity, DashboardEntity, OutputTriggerTypeEntity, OutputFormatTypeEntity, OutputDeliveryTypeEntity, ReportEntity, ReportSnapshotEntity, ResourceTypeEntity, TagEntity, TaggedItemEntity, WorkspaceEntity, WorkspaceItemEntity, DatasetEntity, DatasetItemEntity, ConversationDetailEntity, ConversationEntity, UserNotificationEntity, SchemaInfoEntity, CompanyIntegrationRecordMapEntity, RecordMergeLogEntity, RecordMergeDeletionLogEntity, QueryFieldEntity, QueryCategoryEntity, QueryEntity, QueryPermissionEntity, VectorIndexEntity, EntityDocumentTypeEntity, EntityDocumentRunEntity, VectorDatabaseEntity, EntityRecordDocumentEntity, EntityDocumentEntity, DataContextItemEntity, DataContextEntity, UserViewCategoryEntity, DashboardCategoryEntity, ReportCategoryEntity, FileStorageProviderEntity, FileEntity, FileCategoryEntity, FileEntityRecordLinkEntity, VersionInstallationEntity } from '@memberjunction/core-entities';
    

//****************************************************************************
// ENTITY CLASS for Companies
//****************************************************************************
@ObjectType({ description: 'A list of organizational units within your business. These can be subsidiaries or divisions or other units. Companies are used to organizae employee records and also for separating integrations if you have multiple integrations of the same type of system.' })
export class Company_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field() 
    @MaxLength(100)
    Name: string;
          
    @Field() 
    @MaxLength(400)
    Description: string;
          
    @Field({nullable: true}) 
    @MaxLength(200)
    Website?: string;
          
    @Field({nullable: true}) 
    @MaxLength(1000)
    LogoURL?: string;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
          
    @Field({nullable: true}) 
    @MaxLength(510)
    Domain?: string;
        
    @Field(() => [mj_core_schema_server_object_types.Employee_])
    EmployeesArray: mj_core_schema_server_object_types.Employee_[]; // Link to Employees
    
    @Field(() => [mj_core_schema_server_object_types.CompanyIntegration_])
    CompanyIntegrationsArray: mj_core_schema_server_object_types.CompanyIntegration_[]; // Link to CompanyIntegrations
    
    @Field(() => [mj_core_schema_server_object_types.Workflow_])
    WorkflowsArray: mj_core_schema_server_object_types.Workflow_[]; // Link to Workflows
    
}
        
//****************************************************************************
// INPUT TYPE for Companies   
//****************************************************************************
@InputType()
export class CreateCompanyInput {
    @Field()
    Name: string;
    
    @Field()
    Description: string;
    
    @Field({ nullable: true })
    Website: string;
    
    @Field({ nullable: true })
    LogoURL: string;
    
    @Field({ nullable: true })
    Domain: string;
    }
    
        
//****************************************************************************
// INPUT TYPE for Companies   
//****************************************************************************
@InputType()
export class UpdateCompanyInput {
    @Field(() => Int)
    ID: number;
    
    @Field()
    Name: string;
    
    @Field()
    Description: string;
    
    @Field({ nullable: true })
    Website: string;
    
    @Field({ nullable: true })
    LogoURL: string;
    
    @Field({ nullable: true })
    Domain: string;
    }
    
//****************************************************************************
// RESOLVER for Companies
//****************************************************************************
@ObjectType()
export class RunCompanyViewResult {
    @Field(() => [Company_])
    Results: Company_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(Company_)
export class CompanyResolver extends ResolverBase {
    @Query(() => RunCompanyViewResult)
    async RunCompanyViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunCompanyViewResult)
    async RunCompanyViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunCompanyViewResult)
    async RunCompanyDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Companies';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => Company_, { nullable: true })
    async Company(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Company_ | null> {
        this.CheckUserReadPermissions('Companies', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwCompanies] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Companies', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Companies', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Query(() => [Company_])
    async AllCompanies(@Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Companies', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwCompanies]` + this.getRowLevelSecurityWhereClause('Companies', userPayload, EntityPermissionType.Read, ' WHERE');
        const result = this.ArrayMapFieldNamesToCodeNames('Companies', await dataSource.query(sSQL));
        return result;
    }
      
    @FieldResolver(() => [mj_core_schema_server_object_types.Employee_])
    async EmployeesArray(@Root() company_: Company_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Employees', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwEmployees] WHERE [CompanyID]=${company_.ID} ` + this.getRowLevelSecurityWhereClause('Employees', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Employees', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.CompanyIntegration_])
    async CompanyIntegrationsArray(@Root() company_: Company_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Company Integrations', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwCompanyIntegrations] WHERE [CompanyName]=${company_.ID} ` + this.getRowLevelSecurityWhereClause('Company Integrations', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Company Integrations', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.Workflow_])
    async WorkflowsArray(@Root() company_: Company_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Workflows', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwWorkflows] WHERE [CompanyName]=${company_.ID} ` + this.getRowLevelSecurityWhereClause('Workflows', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Workflows', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => Company_)
    async CreateCompany(
        @Arg('input', () => CreateCompanyInput) input: CreateCompanyInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <CompanyEntity>await new Metadata().GetEntityObject('Companies', this.GetUserFromPayload(userPayload));
            await entityObject.NewRecord();
            entityObject.SetMany(input);
            if (await entityObject.Save()) {
                // save worked, fire the AfterCreate event and then return all the data
                await this.AfterCreate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else 
                // save failed, return null
                return null;
        }
        else    
            return null;
    }

    // Before/After CREATE Event Hooks for Sub-Classes to Override
    protected async BeforeCreate(dataSource: DataSource, input: CreateCompanyInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateCompanyInput) {
    }
        
    @Mutation(() => Company_)
    async UpdateCompany(
        @Arg('input', () => UpdateCompanyInput) input: UpdateCompanyInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <CompanyEntity>await new Metadata().GetEntityObject('Companies', this.GetUserFromPayload(userPayload));
            await entityObject.Load(input.ID) // Track Changes is turned on, so we need to get the latest data from DB first before we save
            entityObject.SetMany(input);
            if (await entityObject.Save()) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateCompanyInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateCompanyInput) {
        const i = input, d = dataSource; // prevent error
    }
    
    @Mutation(() => Company_)
    async DeleteCompany(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        if (await this.BeforeDelete(dataSource, ID)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <CompanyEntity>await new Metadata().GetEntityObject('Companies', this.GetUserFromPayload(userPayload));
            await entityObject.Load(ID);
            const returnValue = entityObject.GetAll(); // grab the values before we delete so we can return last state before delete if we are successful.
            if (await entityObject.Delete()) {
                await this.AfterDelete(dataSource, ID); // fire event
                return returnValue;
            }
            else 
                return null; // delete failed, this will cause an exception
        }
        else
            return null; // BeforeDelete canceled the operation, this will cause an exception
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeDelete(dataSource: DataSource, ID: number): Promise<boolean> {
        const i = ID, d = dataSource; // prevent error;
        return true;
    }
    protected async AfterDelete(dataSource: DataSource, ID: number) {
        const i = ID, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for Employees
//****************************************************************************
@ObjectType({ description: 'A list of employees across all units of your organization' })
export class Employee_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field() 
    @MaxLength(16)
    BCMID: string;
          
    @Field() 
    @MaxLength(60)
    FirstName: string;
          
    @Field() 
    @MaxLength(100)
    LastName: string;
          
    @Field({nullable: true}) 
    @MaxLength(100)
    Title?: string;
          
    @Field() 
    @MaxLength(200)
    Email: string;
          
    @Field({nullable: true}) 
    @MaxLength(40)
    Phone?: string;
          
    @Field(() => Boolean) 
    Active: boolean;
          
    @Field(() => Int) 
    CompanyID: number;
          
    @Field(() => Int, {nullable: true}) 
    SupervisorID?: number;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
          
    @Field({nullable: true}) 
    @MaxLength(162)
    FirstLast?: string;
          
    @Field({nullable: true}) 
    @MaxLength(162)
    Supervisor?: string;
          
    @Field({nullable: true}) 
    @MaxLength(60)
    SupervisorFirstName?: string;
          
    @Field({nullable: true}) 
    @MaxLength(100)
    SupervisorLastName?: string;
          
    @Field({nullable: true}) 
    @MaxLength(200)
    SupervisorEmail?: string;
        
    @Field(() => [mj_core_schema_server_object_types.Employee_])
    EmployeesArray: mj_core_schema_server_object_types.Employee_[]; // Link to Employees
    
    @Field(() => [mj_core_schema_server_object_types.EmployeeCompanyIntegration_])
    EmployeeCompanyIntegrationsArray: mj_core_schema_server_object_types.EmployeeCompanyIntegration_[]; // Link to EmployeeCompanyIntegrations
    
    @Field(() => [mj_core_schema_server_object_types.EmployeeRole_])
    EmployeeRolesArray: mj_core_schema_server_object_types.EmployeeRole_[]; // Link to EmployeeRoles
    
    @Field(() => [mj_core_schema_server_object_types.EmployeeSkill_])
    EmployeeSkillsArray: mj_core_schema_server_object_types.EmployeeSkill_[]; // Link to EmployeeSkills
    
}
        
//****************************************************************************
// INPUT TYPE for Employees   
//****************************************************************************
@InputType()
export class CreateEmployeeInput {
    @Field()
    FirstName: string;
    
    @Field()
    LastName: string;
    
    @Field({ nullable: true })
    Title: string;
    
    @Field()
    Email: string;
    
    @Field({ nullable: true })
    Phone: string;
    
    @Field(() => Boolean)
    Active: boolean;
    
    @Field(() => Int)
    CompanyID: number;
    
    @Field(() => Int, { nullable: true })
    SupervisorID: number;
    }
    
        
//****************************************************************************
// INPUT TYPE for Employees   
//****************************************************************************
@InputType()
export class UpdateEmployeeInput {
    @Field(() => Int)
    ID: number;
    
    @Field()
    FirstName: string;
    
    @Field()
    LastName: string;
    
    @Field({ nullable: true })
    Title: string;
    
    @Field()
    Email: string;
    
    @Field({ nullable: true })
    Phone: string;
    
    @Field(() => Boolean)
    Active: boolean;
    
    @Field(() => Int)
    CompanyID: number;
    
    @Field(() => Int, { nullable: true })
    SupervisorID: number;
    }
    
//****************************************************************************
// RESOLVER for Employees
//****************************************************************************
@ObjectType()
export class RunEmployeeViewResult {
    @Field(() => [Employee_])
    Results: Employee_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(Employee_)
export class EmployeeResolver extends ResolverBase {
    @Query(() => RunEmployeeViewResult)
    async RunEmployeeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunEmployeeViewResult)
    async RunEmployeeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunEmployeeViewResult)
    async RunEmployeeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Employees';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => Employee_, { nullable: true })
    async Employee(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Employee_ | null> {
        this.CheckUserReadPermissions('Employees', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwEmployees] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Employees', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Employees', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Query(() => [Employee_])
    async AllEmployees(@Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Employees', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwEmployees]` + this.getRowLevelSecurityWhereClause('Employees', userPayload, EntityPermissionType.Read, ' WHERE');
        const result = this.ArrayMapFieldNamesToCodeNames('Employees', await dataSource.query(sSQL));
        return result;
    }
      
    @FieldResolver(() => [mj_core_schema_server_object_types.Employee_])
    async EmployeesArray(@Root() employee_: Employee_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Employees', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwEmployees] WHERE [SupervisorID]=${employee_.ID} ` + this.getRowLevelSecurityWhereClause('Employees', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Employees', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.EmployeeCompanyIntegration_])
    async EmployeeCompanyIntegrationsArray(@Root() employee_: Employee_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Employee Company Integrations', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwEmployeeCompanyIntegrations] WHERE [EmployeeID]=${employee_.ID} ` + this.getRowLevelSecurityWhereClause('Employee Company Integrations', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Employee Company Integrations', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.EmployeeRole_])
    async EmployeeRolesArray(@Root() employee_: Employee_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Employee Roles', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwEmployeeRoles] WHERE [EmployeeID]=${employee_.ID} ` + this.getRowLevelSecurityWhereClause('Employee Roles', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Employee Roles', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.EmployeeSkill_])
    async EmployeeSkillsArray(@Root() employee_: Employee_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Employee Skills', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwEmployeeSkills] WHERE [EmployeeID]=${employee_.ID} ` + this.getRowLevelSecurityWhereClause('Employee Skills', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Employee Skills', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => Employee_)
    async CreateEmployee(
        @Arg('input', () => CreateEmployeeInput) input: CreateEmployeeInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <EmployeeEntity>await new Metadata().GetEntityObject('Employees', this.GetUserFromPayload(userPayload));
            await entityObject.NewRecord();
            entityObject.SetMany(input);
            if (await entityObject.Save()) {
                // save worked, fire the AfterCreate event and then return all the data
                await this.AfterCreate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else 
                // save failed, return null
                return null;
        }
        else    
            return null;
    }

    // Before/After CREATE Event Hooks for Sub-Classes to Override
    protected async BeforeCreate(dataSource: DataSource, input: CreateEmployeeInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateEmployeeInput) {
    }
        
    @Mutation(() => Employee_)
    async UpdateEmployee(
        @Arg('input', () => UpdateEmployeeInput) input: UpdateEmployeeInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <EmployeeEntity>await new Metadata().GetEntityObject('Employees', this.GetUserFromPayload(userPayload));
            await entityObject.Load(input.ID) // Track Changes is turned on, so we need to get the latest data from DB first before we save
            entityObject.SetMany(input);
            if (await entityObject.Save()) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateEmployeeInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateEmployeeInput) {
        const i = input, d = dataSource; // prevent error
    }
    
    @Mutation(() => Employee_)
    async DeleteEmployee(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        if (await this.BeforeDelete(dataSource, ID)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <EmployeeEntity>await new Metadata().GetEntityObject('Employees', this.GetUserFromPayload(userPayload));
            await entityObject.Load(ID);
            const returnValue = entityObject.GetAll(); // grab the values before we delete so we can return last state before delete if we are successful.
            if (await entityObject.Delete()) {
                await this.AfterDelete(dataSource, ID); // fire event
                return returnValue;
            }
            else 
                return null; // delete failed, this will cause an exception
        }
        else
            return null; // BeforeDelete canceled the operation, this will cause an exception
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeDelete(dataSource: DataSource, ID: number): Promise<boolean> {
        const i = ID, d = dataSource; // prevent error;
        return true;
    }
    protected async AfterDelete(dataSource: DataSource, ID: number) {
        const i = ID, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for User Favorites
//****************************************************************************
@ObjectType({ description: 'Records that each user can mark as a favorite for easy access' })
export class UserFavorite_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field(() => Int) 
    UserID: number;
          
    @Field(() => Int) 
    EntityID: number;
          
    @Field() 
    @MaxLength(510)
    RecordID: string;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
          
    @Field() 
    @MaxLength(510)
    Entity: string;
          
    @Field() 
    @MaxLength(510)
    EntityBaseTable: string;
          
    @Field() 
    @MaxLength(510)
    EntityBaseView: string;
        
}
        
//****************************************************************************
// INPUT TYPE for User Favorites   
//****************************************************************************
@InputType()
export class CreateUserFavoriteInput {
    @Field(() => Int)
    UserID: number;
    
    @Field(() => Int)
    EntityID: number;
    
    @Field()
    RecordID: string;
    }
    
        
//****************************************************************************
// INPUT TYPE for User Favorites   
//****************************************************************************
@InputType()
export class UpdateUserFavoriteInput {
    @Field(() => Int)
    ID: number;
    
    @Field(() => Int)
    UserID: number;
    
    @Field(() => Int)
    EntityID: number;
    
    @Field()
    RecordID: string;
    }
    
//****************************************************************************
// RESOLVER for User Favorites
//****************************************************************************
@ObjectType()
export class RunUserFavoriteViewResult {
    @Field(() => [UserFavorite_])
    Results: UserFavorite_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(UserFavorite_)
export class UserFavoriteResolverBase extends ResolverBase {
    @Query(() => RunUserFavoriteViewResult)
    async RunUserFavoriteViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunUserFavoriteViewResult)
    async RunUserFavoriteViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunUserFavoriteViewResult)
    async RunUserFavoriteDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'User Favorites';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => UserFavorite_, { nullable: true })
    async UserFavorite(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<UserFavorite_ | null> {
        this.CheckUserReadPermissions('User Favorites', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwUserFavorites] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('User Favorites', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('User Favorites', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => UserFavorite_)
    async CreateUserFavorite(
        @Arg('input', () => CreateUserFavoriteInput) input: CreateUserFavoriteInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <UserFavoriteEntity>await new Metadata().GetEntityObject('User Favorites', this.GetUserFromPayload(userPayload));
            await entityObject.NewRecord();
            entityObject.SetMany(input);
            if (await entityObject.Save()) {
                // save worked, fire the AfterCreate event and then return all the data
                await this.AfterCreate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else 
                // save failed, return null
                return null;
        }
        else    
            return null;
    }

    // Before/After CREATE Event Hooks for Sub-Classes to Override
    protected async BeforeCreate(dataSource: DataSource, input: CreateUserFavoriteInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateUserFavoriteInput) {
    }
        
    @Mutation(() => UserFavorite_)
    async UpdateUserFavorite(
        @Arg('input', () => UpdateUserFavoriteInput) input: UpdateUserFavoriteInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <UserFavoriteEntity>await new Metadata().GetEntityObject('User Favorites', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for User Favorites
            
            if (await entityObject.Save({ IgnoreDirtyState: true /*flag used because of LoadFromData() call above*/ })) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateUserFavoriteInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateUserFavoriteInput) {
        const i = input, d = dataSource; // prevent error
    }
    
    @Mutation(() => UserFavorite_)
    async DeleteUserFavorite(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        if (await this.BeforeDelete(dataSource, ID)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <UserFavoriteEntity>await new Metadata().GetEntityObject('User Favorites', this.GetUserFromPayload(userPayload));
            await entityObject.Load(ID);
            const returnValue = entityObject.GetAll(); // grab the values before we delete so we can return last state before delete if we are successful.
            if (await entityObject.Delete()) {
                await this.AfterDelete(dataSource, ID); // fire event
                return returnValue;
            }
            else 
                return null; // delete failed, this will cause an exception
        }
        else
            return null; // BeforeDelete canceled the operation, this will cause an exception
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeDelete(dataSource: DataSource, ID: number): Promise<boolean> {
        const i = ID, d = dataSource; // prevent error;
        return true;
    }
    protected async AfterDelete(dataSource: DataSource, ID: number) {
        const i = ID, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for Employee Company Integrations
//****************************************************************************
@ObjectType()
export class EmployeeCompanyIntegration_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field(() => Int) 
    EmployeeID: number;
          
    @Field(() => Int) 
    CompanyIntegrationID: number;
          
    @Field() 
    @MaxLength(200)
    ExternalSystemRecordID: string;
          
    @Field(() => Boolean) 
    IsActive: boolean;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
        
}
        
//****************************************************************************
// INPUT TYPE for Employee Company Integrations   
//****************************************************************************
@InputType()
export class UpdateEmployeeCompanyIntegrationInput {
    @Field(() => Int)
    ID: number;
    
    @Field(() => Int)
    EmployeeID: number;
    
    @Field(() => Int)
    CompanyIntegrationID: number;
    
    @Field()
    ExternalSystemRecordID: string;
    
    @Field(() => Boolean)
    IsActive: boolean;
    }
    
//****************************************************************************
// RESOLVER for Employee Company Integrations
//****************************************************************************
@ObjectType()
export class RunEmployeeCompanyIntegrationViewResult {
    @Field(() => [EmployeeCompanyIntegration_])
    Results: EmployeeCompanyIntegration_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(EmployeeCompanyIntegration_)
export class EmployeeCompanyIntegrationResolver extends ResolverBase {
    @Query(() => RunEmployeeCompanyIntegrationViewResult)
    async RunEmployeeCompanyIntegrationViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunEmployeeCompanyIntegrationViewResult)
    async RunEmployeeCompanyIntegrationViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunEmployeeCompanyIntegrationViewResult)
    async RunEmployeeCompanyIntegrationDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Employee Company Integrations';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => EmployeeCompanyIntegration_, { nullable: true })
    async EmployeeCompanyIntegration(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<EmployeeCompanyIntegration_ | null> {
        this.CheckUserReadPermissions('Employee Company Integrations', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwEmployeeCompanyIntegrations] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Employee Company Integrations', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Employee Company Integrations', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => EmployeeCompanyIntegration_)
    async UpdateEmployeeCompanyIntegration(
        @Arg('input', () => UpdateEmployeeCompanyIntegrationInput) input: UpdateEmployeeCompanyIntegrationInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <EmployeeCompanyIntegrationEntity>await new Metadata().GetEntityObject('Employee Company Integrations', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for Employee Company Integrations
            
            if (await entityObject.Save({ IgnoreDirtyState: true /*flag used because of LoadFromData() call above*/ })) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateEmployeeCompanyIntegrationInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateEmployeeCompanyIntegrationInput) {
        const i = input, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for Employee Roles
//****************************************************************************
@ObjectType()
export class EmployeeRole_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field(() => Int) 
    EmployeeID: number;
          
    @Field(() => Int) 
    RoleID: number;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
          
    @Field() 
    @MaxLength(100)
    Role: string;
        
}
        
//****************************************************************************
// INPUT TYPE for Employee Roles   
//****************************************************************************
@InputType()
export class UpdateEmployeeRoleInput {
    @Field(() => Int)
    ID: number;
    
    @Field(() => Int)
    EmployeeID: number;
    
    @Field(() => Int)
    RoleID: number;
    }
    
//****************************************************************************
// RESOLVER for Employee Roles
//****************************************************************************
@ObjectType()
export class RunEmployeeRoleViewResult {
    @Field(() => [EmployeeRole_])
    Results: EmployeeRole_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(EmployeeRole_)
export class EmployeeRoleResolver extends ResolverBase {
    @Query(() => RunEmployeeRoleViewResult)
    async RunEmployeeRoleViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunEmployeeRoleViewResult)
    async RunEmployeeRoleViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunEmployeeRoleViewResult)
    async RunEmployeeRoleDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Employee Roles';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => EmployeeRole_, { nullable: true })
    async EmployeeRole(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<EmployeeRole_ | null> {
        this.CheckUserReadPermissions('Employee Roles', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwEmployeeRoles] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Employee Roles', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Employee Roles', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => EmployeeRole_)
    async UpdateEmployeeRole(
        @Arg('input', () => UpdateEmployeeRoleInput) input: UpdateEmployeeRoleInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <EmployeeRoleEntity>await new Metadata().GetEntityObject('Employee Roles', this.GetUserFromPayload(userPayload));
            await entityObject.Load(input.ID) // Track Changes is turned on, so we need to get the latest data from DB first before we save
            entityObject.SetMany(input);
            if (await entityObject.Save()) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateEmployeeRoleInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateEmployeeRoleInput) {
        const i = input, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for Employee Skills
//****************************************************************************
@ObjectType()
export class EmployeeSkill_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field(() => Int) 
    EmployeeID: number;
          
    @Field(() => Int) 
    SkillID: number;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
          
    @Field() 
    @MaxLength(100)
    Skill: string;
        
}
        
//****************************************************************************
// INPUT TYPE for Employee Skills   
//****************************************************************************
@InputType()
export class UpdateEmployeeSkillInput {
    @Field(() => Int)
    ID: number;
    
    @Field(() => Int)
    EmployeeID: number;
    
    @Field(() => Int)
    SkillID: number;
    }
    
//****************************************************************************
// RESOLVER for Employee Skills
//****************************************************************************
@ObjectType()
export class RunEmployeeSkillViewResult {
    @Field(() => [EmployeeSkill_])
    Results: EmployeeSkill_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(EmployeeSkill_)
export class EmployeeSkillResolver extends ResolverBase {
    @Query(() => RunEmployeeSkillViewResult)
    async RunEmployeeSkillViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunEmployeeSkillViewResult)
    async RunEmployeeSkillViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunEmployeeSkillViewResult)
    async RunEmployeeSkillDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Employee Skills';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => EmployeeSkill_, { nullable: true })
    async EmployeeSkill(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<EmployeeSkill_ | null> {
        this.CheckUserReadPermissions('Employee Skills', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwEmployeeSkills] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Employee Skills', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Employee Skills', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => EmployeeSkill_)
    async UpdateEmployeeSkill(
        @Arg('input', () => UpdateEmployeeSkillInput) input: UpdateEmployeeSkillInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <EmployeeSkillEntity>await new Metadata().GetEntityObject('Employee Skills', this.GetUserFromPayload(userPayload));
            await entityObject.Load(input.ID) // Track Changes is turned on, so we need to get the latest data from DB first before we save
            entityObject.SetMany(input);
            if (await entityObject.Save()) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateEmployeeSkillInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateEmployeeSkillInput) {
        const i = input, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for Roles
//****************************************************************************
@ObjectType({ description: 'Roles are used for security administration and can have zero to many Users as members' })
export class Role_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field() 
    @MaxLength(100)
    Name: string;
          
    @Field({nullable: true, description: 'Description of the role'}) 
    Description?: string;
          
    @Field({nullable: true, description: 'The unique ID of the role in the directory being used for authentication, for example an ID in Azure.'}) 
    @MaxLength(500)
    DirectoryID?: string;
          
    @Field({nullable: true, description: 'The name of the role in the database, this is used for auto-generating permission statements by CodeGen'}) 
    @MaxLength(500)
    SQLName?: string;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
        
    @Field(() => [mj_core_schema_server_object_types.EmployeeRole_])
    EmployeeRolesArray: mj_core_schema_server_object_types.EmployeeRole_[]; // Link to EmployeeRoles
    
    @Field(() => [mj_core_schema_server_object_types.EntityPermission_])
    EntityPermissionsArray: mj_core_schema_server_object_types.EntityPermission_[]; // Link to EntityPermissions
    
    @Field(() => [mj_core_schema_server_object_types.UserRole_])
    UserRolesArray: mj_core_schema_server_object_types.UserRole_[]; // Link to UserRoles
    
    @Field(() => [mj_core_schema_server_object_types.AuthorizationRole_])
    AuthorizationRolesArray: mj_core_schema_server_object_types.AuthorizationRole_[]; // Link to AuthorizationRoles
    
    @Field(() => [mj_core_schema_server_object_types.QueryPermission_])
    QueryPermissionsArray: mj_core_schema_server_object_types.QueryPermission_[]; // Link to QueryPermissions
    
}
        
//****************************************************************************
// INPUT TYPE for Roles   
//****************************************************************************
@InputType()
export class CreateRoleInput {
    @Field()
    Name: string;
    
    @Field({ nullable: true })
    Description: string;
    
    @Field({ nullable: true })
    DirectoryID: string;
    
    @Field({ nullable: true })
    SQLName: string;
    }
    
        
//****************************************************************************
// INPUT TYPE for Roles   
//****************************************************************************
@InputType()
export class UpdateRoleInput {
    @Field(() => Int)
    ID: number;
    
    @Field()
    Name: string;
    
    @Field({ nullable: true })
    Description: string;
    
    @Field({ nullable: true })
    DirectoryID: string;
    
    @Field({ nullable: true })
    SQLName: string;
    }
    
//****************************************************************************
// RESOLVER for Roles
//****************************************************************************
@ObjectType()
export class RunRoleViewResult {
    @Field(() => [Role_])
    Results: Role_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(Role_)
export class RoleResolver extends ResolverBase {
    @Query(() => RunRoleViewResult)
    async RunRoleViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunRoleViewResult)
    async RunRoleViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunRoleViewResult)
    async RunRoleDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Roles';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => Role_, { nullable: true })
    async Role(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Role_ | null> {
        this.CheckUserReadPermissions('Roles', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwRoles] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Roles', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Roles', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Query(() => [Role_])
    async AllRoles(@Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Roles', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwRoles]` + this.getRowLevelSecurityWhereClause('Roles', userPayload, EntityPermissionType.Read, ' WHERE');
        const result = this.ArrayMapFieldNamesToCodeNames('Roles', await dataSource.query(sSQL));
        return result;
    }
      
    @FieldResolver(() => [mj_core_schema_server_object_types.EmployeeRole_])
    async EmployeeRolesArray(@Root() role_: Role_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Employee Roles', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwEmployeeRoles] WHERE [RoleID]=${role_.ID} ` + this.getRowLevelSecurityWhereClause('Employee Roles', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Employee Roles', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.EntityPermission_])
    async EntityPermissionsArray(@Root() role_: Role_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Entity Permissions', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwEntityPermissions] WHERE [RoleName]=${role_.ID} ` + this.getRowLevelSecurityWhereClause('Entity Permissions', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Entity Permissions', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.UserRole_])
    async UserRolesArray(@Root() role_: Role_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('User Roles', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwUserRoles] WHERE [RoleName]=${role_.ID} ` + this.getRowLevelSecurityWhereClause('User Roles', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('User Roles', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.AuthorizationRole_])
    async AuthorizationRolesArray(@Root() role_: Role_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Authorization Roles', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwAuthorizationRoles] WHERE [RoleName]=${role_.ID} ` + this.getRowLevelSecurityWhereClause('Authorization Roles', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Authorization Roles', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.QueryPermission_])
    async QueryPermissionsArray(@Root() role_: Role_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Query Permissions', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwQueryPermissions] WHERE [RoleName]=${role_.ID} ` + this.getRowLevelSecurityWhereClause('Query Permissions', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Query Permissions', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => Role_)
    async CreateRole(
        @Arg('input', () => CreateRoleInput) input: CreateRoleInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <RoleEntity>await new Metadata().GetEntityObject('Roles', this.GetUserFromPayload(userPayload));
            await entityObject.NewRecord();
            entityObject.SetMany(input);
            if (await entityObject.Save()) {
                // save worked, fire the AfterCreate event and then return all the data
                await this.AfterCreate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else 
                // save failed, return null
                return null;
        }
        else    
            return null;
    }

    // Before/After CREATE Event Hooks for Sub-Classes to Override
    protected async BeforeCreate(dataSource: DataSource, input: CreateRoleInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateRoleInput) {
    }
        
    @Mutation(() => Role_)
    async UpdateRole(
        @Arg('input', () => UpdateRoleInput) input: UpdateRoleInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <RoleEntity>await new Metadata().GetEntityObject('Roles', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for Roles
            
            if (await entityObject.Save({ IgnoreDirtyState: true /*flag used because of LoadFromData() call above*/ })) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateRoleInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateRoleInput) {
        const i = input, d = dataSource; // prevent error
    }
    
    @Mutation(() => Role_)
    async DeleteRole(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        if (await this.BeforeDelete(dataSource, ID)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <RoleEntity>await new Metadata().GetEntityObject('Roles', this.GetUserFromPayload(userPayload));
            await entityObject.Load(ID);
            const returnValue = entityObject.GetAll(); // grab the values before we delete so we can return last state before delete if we are successful.
            if (await entityObject.Delete()) {
                await this.AfterDelete(dataSource, ID); // fire event
                return returnValue;
            }
            else 
                return null; // delete failed, this will cause an exception
        }
        else
            return null; // BeforeDelete canceled the operation, this will cause an exception
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeDelete(dataSource: DataSource, ID: number): Promise<boolean> {
        const i = ID, d = dataSource; // prevent error;
        return true;
    }
    protected async AfterDelete(dataSource: DataSource, ID: number) {
        const i = ID, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for Skills
//****************************************************************************
@ObjectType({ description: 'A hierarchical list of possible skills that are linked to Employees and can also be linked to any other entity' })
export class Skill_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field() 
    @MaxLength(100)
    Name: string;
          
    @Field(() => Int, {nullable: true}) 
    ParentID?: number;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
          
    @Field({nullable: true}) 
    @MaxLength(100)
    Parent?: string;
        
    @Field(() => [mj_core_schema_server_object_types.EmployeeSkill_])
    EmployeeSkillsArray: mj_core_schema_server_object_types.EmployeeSkill_[]; // Link to EmployeeSkills
    
    @Field(() => [mj_core_schema_server_object_types.Skill_])
    SkillsArray: mj_core_schema_server_object_types.Skill_[]; // Link to Skills
    
}
//****************************************************************************
// RESOLVER for Skills
//****************************************************************************
@ObjectType()
export class RunSkillViewResult {
    @Field(() => [Skill_])
    Results: Skill_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(Skill_)
export class SkillResolver extends ResolverBase {
    @Query(() => RunSkillViewResult)
    async RunSkillViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunSkillViewResult)
    async RunSkillViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunSkillViewResult)
    async RunSkillDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Skills';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => Skill_, { nullable: true })
    async Skill(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Skill_ | null> {
        this.CheckUserReadPermissions('Skills', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwSkills] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Skills', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Skills', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Query(() => [Skill_])
    async AllSkills(@Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Skills', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwSkills]` + this.getRowLevelSecurityWhereClause('Skills', userPayload, EntityPermissionType.Read, ' WHERE');
        const result = this.ArrayMapFieldNamesToCodeNames('Skills', await dataSource.query(sSQL));
        return result;
    }
      
    @FieldResolver(() => [mj_core_schema_server_object_types.EmployeeSkill_])
    async EmployeeSkillsArray(@Root() skill_: Skill_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Employee Skills', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwEmployeeSkills] WHERE [SkillID]=${skill_.ID} ` + this.getRowLevelSecurityWhereClause('Employee Skills', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Employee Skills', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.Skill_])
    async SkillsArray(@Root() skill_: Skill_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Skills', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwSkills] WHERE [ParentID]=${skill_.ID} ` + this.getRowLevelSecurityWhereClause('Skills', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Skills', await dataSource.query(sSQL));
        return result;
    }
        
}

//****************************************************************************
// ENTITY CLASS for Integration URL Formats
//****************************************************************************
@ObjectType({ description: 'Used to generate web links for end users to easily access resources in a source system. URL Formats support templating to inject various field values at run-time to take a user directly to a resource in a source system.' })
export class IntegrationURLFormat_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field({nullable: true}) 
    @MaxLength(200)
    IntegrationName?: string;
          
    @Field(() => Int) 
    EntityID: number;
          
    @Field() 
    @MaxLength(1000)
    URLFormat: string;
          
    @Field(() => Int) 
    IntegrationID: number;
          
    @Field() 
    @MaxLength(200)
    Integration: string;
          
    @Field({nullable: true}) 
    @MaxLength(1000)
    NavigationBaseURL?: string;
          
    @Field({nullable: true}) 
    @MaxLength(2000)
    FullURLFormat?: string;
        
}
        
//****************************************************************************
// INPUT TYPE for Integration URL Formats   
//****************************************************************************
@InputType()
export class UpdateIntegrationURLFormatInput {
    @Field(() => Int)
    ID: number;
    
    @Field({ nullable: true })
    IntegrationName: string;
    
    @Field(() => Int)
    EntityID: number;
    
    @Field()
    URLFormat: string;
    }
    
//****************************************************************************
// RESOLVER for Integration URL Formats
//****************************************************************************
@ObjectType()
export class RunIntegrationURLFormatViewResult {
    @Field(() => [IntegrationURLFormat_])
    Results: IntegrationURLFormat_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(IntegrationURLFormat_)
export class IntegrationURLFormatResolver extends ResolverBase {
    @Query(() => RunIntegrationURLFormatViewResult)
    async RunIntegrationURLFormatViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunIntegrationURLFormatViewResult)
    async RunIntegrationURLFormatViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunIntegrationURLFormatViewResult)
    async RunIntegrationURLFormatDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Integration URL Formats';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => IntegrationURLFormat_, { nullable: true })
    async IntegrationURLFormat(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<IntegrationURLFormat_ | null> {
        this.CheckUserReadPermissions('Integration URL Formats', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwIntegrationURLFormats] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Integration URL Formats', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Integration URL Formats', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Query(() => [IntegrationURLFormat_])
    async AllIntegrationURLFormats(@Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Integration URL Formats', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwIntegrationURLFormats]` + this.getRowLevelSecurityWhereClause('Integration URL Formats', userPayload, EntityPermissionType.Read, ' WHERE');
        const result = this.ArrayMapFieldNamesToCodeNames('Integration URL Formats', await dataSource.query(sSQL));
        return result;
    }
    
    @Mutation(() => IntegrationURLFormat_)
    async UpdateIntegrationURLFormat(
        @Arg('input', () => UpdateIntegrationURLFormatInput) input: UpdateIntegrationURLFormatInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <IntegrationURLFormatEntity>await new Metadata().GetEntityObject('Integration URL Formats', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for Integration URL Formats
            
            if (await entityObject.Save({ IgnoreDirtyState: true /*flag used because of LoadFromData() call above*/ })) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateIntegrationURLFormatInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateIntegrationURLFormatInput) {
        const i = input, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for Integrations
//****************************************************************************
@ObjectType({ description: 'Catalog of all integrations that have been configured in the system.' })
export class Integration_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field() 
    @MaxLength(200)
    Name: string;
          
    @Field({nullable: true}) 
    @MaxLength(510)
    Description?: string;
          
    @Field({nullable: true}) 
    @MaxLength(1000)
    NavigationBaseURL?: string;
          
    @Field({nullable: true}) 
    @MaxLength(200)
    ClassName?: string;
          
    @Field({nullable: true}) 
    @MaxLength(200)
    ImportPath?: string;
          
    @Field(() => Int) 
    BatchMaxRequestCount: number;
          
    @Field(() => Int) 
    BatchRequestWaitTime: number;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
        
    @Field(() => [mj_core_schema_server_object_types.IntegrationURLFormat_])
    IntegrationURLFormatsArray: mj_core_schema_server_object_types.IntegrationURLFormat_[]; // Link to IntegrationURLFormats
    
    @Field(() => [mj_core_schema_server_object_types.CompanyIntegration_])
    CompanyIntegrationsArray: mj_core_schema_server_object_types.CompanyIntegration_[]; // Link to CompanyIntegrations
    
}
        
//****************************************************************************
// INPUT TYPE for Integrations   
//****************************************************************************
@InputType()
export class UpdateIntegrationInput {
    @Field(() => Int)
    ID: number;
    
    @Field()
    Name: string;
    
    @Field({ nullable: true })
    Description: string;
    
    @Field({ nullable: true })
    NavigationBaseURL: string;
    
    @Field({ nullable: true })
    ClassName: string;
    
    @Field({ nullable: true })
    ImportPath: string;
    
    @Field(() => Int)
    BatchMaxRequestCount: number;
    
    @Field(() => Int)
    BatchRequestWaitTime: number;
    }
    
//****************************************************************************
// RESOLVER for Integrations
//****************************************************************************
@ObjectType()
export class RunIntegrationViewResult {
    @Field(() => [Integration_])
    Results: Integration_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(Integration_)
export class IntegrationResolver extends ResolverBase {
    @Query(() => RunIntegrationViewResult)
    async RunIntegrationViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunIntegrationViewResult)
    async RunIntegrationViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunIntegrationViewResult)
    async RunIntegrationDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Integrations';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => Integration_, { nullable: true })
    async Integration(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Integration_ | null> {
        this.CheckUserReadPermissions('Integrations', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwIntegrations] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Integrations', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Integrations', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Query(() => [Integration_])
    async AllIntegrations(@Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Integrations', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwIntegrations]` + this.getRowLevelSecurityWhereClause('Integrations', userPayload, EntityPermissionType.Read, ' WHERE');
        const result = this.ArrayMapFieldNamesToCodeNames('Integrations', await dataSource.query(sSQL));
        return result;
    }
      
    @FieldResolver(() => [mj_core_schema_server_object_types.IntegrationURLFormat_])
    async IntegrationURLFormatsArray(@Root() integration_: Integration_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Integration URL Formats', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwIntegrationURLFormats] WHERE [IntegrationID]=${integration_.ID} ` + this.getRowLevelSecurityWhereClause('Integration URL Formats', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Integration URL Formats', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.CompanyIntegration_])
    async CompanyIntegrationsArray(@Root() integration_: Integration_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Company Integrations', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwCompanyIntegrations] WHERE [IntegrationName]=${integration_.ID} ` + this.getRowLevelSecurityWhereClause('Company Integrations', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Company Integrations', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => Integration_)
    async UpdateIntegration(
        @Arg('input', () => UpdateIntegrationInput) input: UpdateIntegrationInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <IntegrationEntity>await new Metadata().GetEntityObject('Integrations', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for Integrations
            
            if (await entityObject.Save({ IgnoreDirtyState: true /*flag used because of LoadFromData() call above*/ })) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateIntegrationInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateIntegrationInput) {
        const i = input, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for Company Integrations
//****************************************************************************
@ObjectType({ description: 'Links individual company records to specific integrations' })
export class CompanyIntegration_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field() 
    @MaxLength(100)
    CompanyName: string;
          
    @Field() 
    @MaxLength(200)
    IntegrationName: string;
          
    @Field(() => Boolean, {nullable: true}) 
    IsActive?: boolean;
          
    @Field({nullable: true}) 
    @MaxLength(510)
    AccessToken?: string;
          
    @Field({nullable: true}) 
    @MaxLength(510)
    RefreshToken?: string;
          
    @Field({nullable: true}) 
    @MaxLength(8)
    TokenExpirationDate?: Date;
          
    @Field({nullable: true}) 
    @MaxLength(510)
    APIKey?: string;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
          
    @Field({nullable: true}) 
    @MaxLength(200)
    ExternalSystemID?: string;
          
    @Field(() => Boolean) 
    IsExternalSystemReadOnly: boolean;
          
    @Field({nullable: true}) 
    @MaxLength(510)
    ClientID?: string;
          
    @Field({nullable: true}) 
    @MaxLength(510)
    ClientSecret?: string;
          
    @Field({nullable: true}) 
    @MaxLength(510)
    CustomAttribute1?: string;
          
    @Field(() => Int) 
    CompanyID: number;
          
    @Field(() => Int) 
    IntegrationID: number;
          
    @Field() 
    @MaxLength(100)
    Company: string;
          
    @Field() 
    @MaxLength(200)
    Integration: string;
          
    @Field({nullable: true}) 
    @MaxLength(200)
    DriverClassName?: string;
          
    @Field({nullable: true}) 
    @MaxLength(200)
    DriverImportPath?: string;
          
    @Field(() => Int, {nullable: true}) 
    LastRunID?: number;
          
    @Field({nullable: true}) 
    @MaxLength(8)
    LastRunStartedAt?: Date;
          
    @Field({nullable: true}) 
    @MaxLength(8)
    LastRunEndedAt?: Date;
        
    @Field(() => [mj_core_schema_server_object_types.List_])
    ListsArray: mj_core_schema_server_object_types.List_[]; // Link to Lists
    
    @Field(() => [mj_core_schema_server_object_types.EmployeeCompanyIntegration_])
    EmployeeCompanyIntegrationsArray: mj_core_schema_server_object_types.EmployeeCompanyIntegration_[]; // Link to EmployeeCompanyIntegrations
    
    @Field(() => [mj_core_schema_server_object_types.CompanyIntegrationRun_])
    CompanyIntegrationRunsArray: mj_core_schema_server_object_types.CompanyIntegrationRun_[]; // Link to CompanyIntegrationRuns
    
    @Field(() => [mj_core_schema_server_object_types.CompanyIntegrationRecordMap_])
    CompanyIntegrationRecordMapsArray: mj_core_schema_server_object_types.CompanyIntegrationRecordMap_[]; // Link to CompanyIntegrationRecordMaps
    
}
        
//****************************************************************************
// INPUT TYPE for Company Integrations   
//****************************************************************************
@InputType()
export class UpdateCompanyIntegrationInput {
    @Field(() => Int)
    ID: number;
    
    @Field()
    CompanyName: string;
    
    @Field()
    IntegrationName: string;
    
    @Field(() => Boolean, { nullable: true })
    IsActive: boolean;
    
    @Field({ nullable: true })
    AccessToken: string;
    
    @Field({ nullable: true })
    RefreshToken: string;
    
    @Field({ nullable: true })
    TokenExpirationDate: Date;
    
    @Field({ nullable: true })
    APIKey: string;
    
    @Field({ nullable: true })
    ExternalSystemID: string;
    
    @Field(() => Boolean)
    IsExternalSystemReadOnly: boolean;
    
    @Field({ nullable: true })
    ClientID: string;
    
    @Field({ nullable: true })
    ClientSecret: string;
    
    @Field({ nullable: true })
    CustomAttribute1: string;
    }
    
//****************************************************************************
// RESOLVER for Company Integrations
//****************************************************************************
@ObjectType()
export class RunCompanyIntegrationViewResult {
    @Field(() => [CompanyIntegration_])
    Results: CompanyIntegration_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(CompanyIntegration_)
export class CompanyIntegrationResolver extends ResolverBase {
    @Query(() => RunCompanyIntegrationViewResult)
    async RunCompanyIntegrationViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunCompanyIntegrationViewResult)
    async RunCompanyIntegrationViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunCompanyIntegrationViewResult)
    async RunCompanyIntegrationDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Company Integrations';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => CompanyIntegration_, { nullable: true })
    async CompanyIntegration(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<CompanyIntegration_ | null> {
        this.CheckUserReadPermissions('Company Integrations', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwCompanyIntegrations] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Company Integrations', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Company Integrations', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
      
    @FieldResolver(() => [mj_core_schema_server_object_types.List_])
    async ListsArray(@Root() companyintegration_: CompanyIntegration_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Lists', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwLists] WHERE [CompanyIntegrationID]=${companyintegration_.ID} ` + this.getRowLevelSecurityWhereClause('Lists', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Lists', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.EmployeeCompanyIntegration_])
    async EmployeeCompanyIntegrationsArray(@Root() companyintegration_: CompanyIntegration_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Employee Company Integrations', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwEmployeeCompanyIntegrations] WHERE [CompanyIntegrationID]=${companyintegration_.ID} ` + this.getRowLevelSecurityWhereClause('Employee Company Integrations', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Employee Company Integrations', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.CompanyIntegrationRun_])
    async CompanyIntegrationRunsArray(@Root() companyintegration_: CompanyIntegration_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Company Integration Runs', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwCompanyIntegrationRuns] WHERE [CompanyIntegrationID]=${companyintegration_.ID} ` + this.getRowLevelSecurityWhereClause('Company Integration Runs', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Company Integration Runs', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.CompanyIntegrationRecordMap_])
    async CompanyIntegrationRecordMapsArray(@Root() companyintegration_: CompanyIntegration_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Company Integration Record Maps', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwCompanyIntegrationRecordMaps] WHERE [CompanyIntegrationID]=${companyintegration_.ID} ` + this.getRowLevelSecurityWhereClause('Company Integration Record Maps', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Company Integration Record Maps', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => CompanyIntegration_)
    async UpdateCompanyIntegration(
        @Arg('input', () => UpdateCompanyIntegrationInput) input: UpdateCompanyIntegrationInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <CompanyIntegrationEntity>await new Metadata().GetEntityObject('Company Integrations', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for Company Integrations
            
            if (await entityObject.Save({ IgnoreDirtyState: true /*flag used because of LoadFromData() call above*/ })) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateCompanyIntegrationInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateCompanyIntegrationInput) {
        const i = input, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for Entity Fields
//****************************************************************************
@ObjectType({ description: 'List of all fields within each entity with metadata about each field' })
export class EntityField_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field(() => Int) 
    EntityID: number;
          
    @Field(() => Int) 
    Sequence: number;
          
    @Field() 
    @MaxLength(510)
    Name: string;
          
    @Field({nullable: true}) 
    @MaxLength(510)
    DisplayName?: string;
          
    @Field({nullable: true}) 
    Description?: string;
          
    @Field(() => Boolean, {description: 'When set to 1 (default), whenever a description is modified in the column within the underlying view (first choice) or table (second choice), the Description column in the entity field definition will be automatically updated. If you never set metadata in the database directly, you can leave this alone. However, if you have metadata set in the database level for description, and you want to provide a DIFFERENT description in this entity field definition, turn this bit off and then set the Description field and future CodeGen runs will NOT override the Description field here.'}) 
    AutoUpdateDescription: boolean;
          
    @Field(() => Boolean) 
    IsPrimaryKey: boolean;
          
    @Field(() => Boolean) 
    IsUnique: boolean;
          
    @Field({nullable: true}) 
    @MaxLength(510)
    Category?: string;
          
    @Field() 
    @MaxLength(200)
    Type: string;
          
    @Field(() => Int, {nullable: true}) 
    Length?: number;
          
    @Field(() => Int, {nullable: true}) 
    Precision?: number;
          
    @Field(() => Int, {nullable: true}) 
    Scale?: number;
          
    @Field(() => Boolean) 
    AllowsNull: boolean;
          
    @Field({nullable: true}) 
    @MaxLength(510)
    DefaultValue?: string;
          
    @Field(() => Boolean) 
    AutoIncrement: boolean;
          
    @Field() 
    @MaxLength(40)
    ValueListType: string;
          
    @Field({nullable: true}) 
    @MaxLength(100)
    ExtendedType?: string;
          
    @Field(() => Boolean) 
    DefaultInView: boolean;
          
    @Field({nullable: true}) 
    ViewCellTemplate?: string;
          
    @Field(() => Int, {nullable: true}) 
    DefaultColumnWidth?: number;
          
    @Field(() => Boolean) 
    AllowUpdateAPI: boolean;
          
    @Field(() => Boolean) 
    AllowUpdateInView: boolean;
          
    @Field(() => Boolean) 
    IncludeInUserSearchAPI: boolean;
          
    @Field(() => Boolean) 
    FullTextSearchEnabled: boolean;
          
    @Field({nullable: true}) 
    @MaxLength(1000)
    UserSearchParamFormatAPI?: string;
          
    @Field(() => Boolean) 
    IncludeInGeneratedForm: boolean;
          
    @Field() 
    @MaxLength(20)
    GeneratedFormSection: string;
          
    @Field(() => Boolean) 
    IsVirtual: boolean;
          
    @Field(() => Boolean) 
    IsNameField: boolean;
          
    @Field(() => Int, {nullable: true}) 
    RelatedEntityID?: number;
          
    @Field({nullable: true}) 
    @MaxLength(510)
    RelatedEntityFieldName?: string;
          
    @Field(() => Boolean) 
    IncludeRelatedEntityNameFieldInBaseView: boolean;
          
    @Field({nullable: true}) 
    @MaxLength(510)
    RelatedEntityNameFieldMap?: string;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
          
    @Field() 
    @MaxLength(510)
    Entity: string;
          
    @Field() 
    @MaxLength(510)
    SchemaName: string;
          
    @Field() 
    @MaxLength(510)
    BaseTable: string;
          
    @Field() 
    @MaxLength(510)
    BaseView: string;
          
    @Field({nullable: true}) 
    @MaxLength(8000)
    EntityCodeName?: string;
          
    @Field({nullable: true}) 
    @MaxLength(8000)
    EntityClassName?: string;
          
    @Field({nullable: true}) 
    @MaxLength(510)
    RelatedEntity?: string;
          
    @Field({nullable: true}) 
    @MaxLength(510)
    RelatedEntitySchemaName?: string;
          
    @Field({nullable: true}) 
    @MaxLength(510)
    RelatedEntityBaseTable?: string;
          
    @Field({nullable: true}) 
    @MaxLength(510)
    RelatedEntityBaseView?: string;
          
    @Field({nullable: true}) 
    @MaxLength(8000)
    RelatedEntityCodeName?: string;
          
    @Field({nullable: true}) 
    @MaxLength(8000)
    RelatedEntityClassName?: string;
        
    @Field(() => [mj_core_schema_server_object_types.EntityFieldValue_])
    EntityFieldValuesArray: mj_core_schema_server_object_types.EntityFieldValue_[]; // Link to EntityFieldValues
    
}
        
//****************************************************************************
// INPUT TYPE for Entity Fields   
//****************************************************************************
@InputType()
export class CreateEntityFieldInput {
    @Field({ nullable: true })
    DisplayName: string;
    
    @Field({ nullable: true })
    Description: string;
    
    @Field(() => Boolean)
    AutoUpdateDescription: boolean;
    
    @Field(() => Boolean)
    IsPrimaryKey: boolean;
    
    @Field(() => Boolean)
    IsUnique: boolean;
    
    @Field({ nullable: true })
    Category: string;
    
    @Field()
    ValueListType: string;
    
    @Field({ nullable: true })
    ExtendedType: string;
    
    @Field(() => Boolean)
    DefaultInView: boolean;
    
    @Field({ nullable: true })
    ViewCellTemplate: string;
    
    @Field(() => Int, { nullable: true })
    DefaultColumnWidth: number;
    
    @Field(() => Boolean)
    AllowUpdateAPI: boolean;
    
    @Field(() => Boolean)
    AllowUpdateInView: boolean;
    
    @Field(() => Boolean)
    IncludeInUserSearchAPI: boolean;
    
    @Field(() => Boolean)
    FullTextSearchEnabled: boolean;
    
    @Field({ nullable: true })
    UserSearchParamFormatAPI: string;
    
    @Field(() => Boolean)
    IncludeInGeneratedForm: boolean;
    
    @Field()
    GeneratedFormSection: string;
    
    @Field(() => Boolean)
    IsNameField: boolean;
    
    @Field(() => Int, { nullable: true })
    RelatedEntityID: number;
    
    @Field({ nullable: true })
    RelatedEntityFieldName: string;
    
    @Field(() => Boolean)
    IncludeRelatedEntityNameFieldInBaseView: boolean;
    
    @Field({ nullable: true })
    RelatedEntityNameFieldMap: string;
    }
    
        
//****************************************************************************
// INPUT TYPE for Entity Fields   
//****************************************************************************
@InputType()
export class UpdateEntityFieldInput {
    @Field(() => Int)
    ID: number;
    
    @Field({ nullable: true })
    DisplayName: string;
    
    @Field({ nullable: true })
    Description: string;
    
    @Field(() => Boolean)
    AutoUpdateDescription: boolean;
    
    @Field(() => Boolean)
    IsPrimaryKey: boolean;
    
    @Field(() => Boolean)
    IsUnique: boolean;
    
    @Field({ nullable: true })
    Category: string;
    
    @Field()
    ValueListType: string;
    
    @Field({ nullable: true })
    ExtendedType: string;
    
    @Field(() => Boolean)
    DefaultInView: boolean;
    
    @Field({ nullable: true })
    ViewCellTemplate: string;
    
    @Field(() => Int, { nullable: true })
    DefaultColumnWidth: number;
    
    @Field(() => Boolean)
    AllowUpdateAPI: boolean;
    
    @Field(() => Boolean)
    AllowUpdateInView: boolean;
    
    @Field(() => Boolean)
    IncludeInUserSearchAPI: boolean;
    
    @Field(() => Boolean)
    FullTextSearchEnabled: boolean;
    
    @Field({ nullable: true })
    UserSearchParamFormatAPI: string;
    
    @Field(() => Boolean)
    IncludeInGeneratedForm: boolean;
    
    @Field()
    GeneratedFormSection: string;
    
    @Field(() => Boolean)
    IsNameField: boolean;
    
    @Field(() => Int, { nullable: true })
    RelatedEntityID: number;
    
    @Field({ nullable: true })
    RelatedEntityFieldName: string;
    
    @Field(() => Boolean)
    IncludeRelatedEntityNameFieldInBaseView: boolean;
    
    @Field({ nullable: true })
    RelatedEntityNameFieldMap: string;
    }
    
//****************************************************************************
// RESOLVER for Entity Fields
//****************************************************************************
@ObjectType()
export class RunEntityFieldViewResult {
    @Field(() => [EntityField_])
    Results: EntityField_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(EntityField_)
export class EntityFieldResolver extends ResolverBase {
    @Query(() => RunEntityFieldViewResult)
    async RunEntityFieldViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunEntityFieldViewResult)
    async RunEntityFieldViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunEntityFieldViewResult)
    async RunEntityFieldDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Entity Fields';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => EntityField_, { nullable: true })
    async EntityField(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<EntityField_ | null> {
        this.CheckUserReadPermissions('Entity Fields', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwEntityFields] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Entity Fields', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Entity Fields', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Query(() => [EntityField_])
    async AllEntityFields(@Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Entity Fields', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwEntityFields]` + this.getRowLevelSecurityWhereClause('Entity Fields', userPayload, EntityPermissionType.Read, ' WHERE');
        const result = this.ArrayMapFieldNamesToCodeNames('Entity Fields', await dataSource.query(sSQL));
        return result;
    }
      
    @FieldResolver(() => [mj_core_schema_server_object_types.EntityFieldValue_])
    async EntityFieldValuesArray(@Root() entityfield_: EntityField_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Entity Field Values', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwEntityFieldValues] WHERE [EntityFieldID]=${entityfield_.ID} ` + this.getRowLevelSecurityWhereClause('Entity Field Values', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Entity Field Values', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => EntityField_)
    async CreateEntityField(
        @Arg('input', () => CreateEntityFieldInput) input: CreateEntityFieldInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <EntityFieldEntity>await new Metadata().GetEntityObject('Entity Fields', this.GetUserFromPayload(userPayload));
            await entityObject.NewRecord();
            entityObject.SetMany(input);
            if (await entityObject.Save()) {
                // save worked, fire the AfterCreate event and then return all the data
                await this.AfterCreate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else 
                // save failed, return null
                return null;
        }
        else    
            return null;
    }

    // Before/After CREATE Event Hooks for Sub-Classes to Override
    protected async BeforeCreate(dataSource: DataSource, input: CreateEntityFieldInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateEntityFieldInput) {
    }
        
    @Mutation(() => EntityField_)
    async UpdateEntityField(
        @Arg('input', () => UpdateEntityFieldInput) input: UpdateEntityFieldInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <EntityFieldEntity>await new Metadata().GetEntityObject('Entity Fields', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for Entity Fields
            
            if (await entityObject.Save({ IgnoreDirtyState: true /*flag used because of LoadFromData() call above*/ })) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateEntityFieldInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateEntityFieldInput) {
        const i = input, d = dataSource; // prevent error
    }
    
    @Mutation(() => EntityField_)
    async DeleteEntityField(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        if (await this.BeforeDelete(dataSource, ID)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <EntityFieldEntity>await new Metadata().GetEntityObject('Entity Fields', this.GetUserFromPayload(userPayload));
            await entityObject.Load(ID);
            const returnValue = entityObject.GetAll(); // grab the values before we delete so we can return last state before delete if we are successful.
            if (await entityObject.Delete()) {
                await this.AfterDelete(dataSource, ID); // fire event
                return returnValue;
            }
            else 
                return null; // delete failed, this will cause an exception
        }
        else
            return null; // BeforeDelete canceled the operation, this will cause an exception
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeDelete(dataSource: DataSource, ID: number): Promise<boolean> {
        const i = ID, d = dataSource; // prevent error;
        return true;
    }
    protected async AfterDelete(dataSource: DataSource, ID: number) {
        const i = ID, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for Entities
//****************************************************************************
@ObjectType({ description: 'Catalog of all entities across all schemas' })
export class Entity_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field(() => Int, {nullable: true}) 
    ParentID?: number;
          
    @Field() 
    @MaxLength(510)
    Name: string;
          
    @Field({nullable: true}) 
    @MaxLength(510)
    NameSuffix?: string;
          
    @Field({nullable: true}) 
    Description?: string;
          
    @Field(() => Boolean, {description: 'When set to 1 (default), whenever a description is modified in the underlying view (first choice) or table (second choice), the Description column in the entity definition will be automatically updated. If you never set metadata in the database directly, you can leave this alone. However, if you have metadata set in the database level for description, and you want to provide a DIFFERENT description in this entity definition, turn this bit off and then set the Description field and future CodeGen runs will NOT override the Description field here.'}) 
    AutoUpdateDescription: boolean;
          
    @Field() 
    @MaxLength(510)
    BaseTable: string;
          
    @Field() 
    @MaxLength(510)
    BaseView: string;
          
    @Field(() => Boolean, {description: 'When set to 0, CodeGen no longer generates a base view for the entity.'}) 
    BaseViewGenerated: boolean;
          
    @Field() 
    @MaxLength(510)
    SchemaName: string;
          
    @Field(() => Boolean) 
    VirtualEntity: boolean;
          
    @Field(() => Boolean, {description: 'When set to 1, changes made via the MemberJunction architecture will result in tracking records being created in the RecordChange table'}) 
    TrackRecordChanges: boolean;
          
    @Field(() => Boolean, {description: 'When set to 1, accessing a record by an end-user will result in an Audit Log record being created'}) 
    AuditRecordAccess: boolean;
          
    @Field(() => Boolean, {description: 'When set to 1, users running a view against this entity will result in an Audit Log record being created.'}) 
    AuditViewRuns: boolean;
          
    @Field(() => Boolean, {description: 'If set to 0, the entity will not be available at all in the GraphQL API or the object model.'}) 
    IncludeInAPI: boolean;
          
    @Field(() => Boolean, {description: 'If set to 1, a GraphQL query will be enabled that allows access to all rows in the entity.'}) 
    AllowAllRowsAPI: boolean;
          
    @Field(() => Boolean, {description: 'Global flag controlling if updates are allowed for any user, or not. If set to 1, a GraqhQL mutation and stored procedure are created. Permissions are still required to perform the action but if this flag is set to 0, no user will be able to perform the action.'}) 
    AllowUpdateAPI: boolean;
          
    @Field(() => Boolean, {description: 'Global flag controlling if creates are allowed for any user, or not. If set to 1, a GraqhQL mutation and stored procedure are created. Permissions are still required to perform the action but if this flag is set to 0, no user will be able to perform the action.'}) 
    AllowCreateAPI: boolean;
          
    @Field(() => Boolean, {description: 'Global flag controlling if deletes are allowed for any user, or not. If set to 1, a GraqhQL mutation and stored procedure are created. Permissions are still required to perform the action but if this flag is set to 0, no user will be able to perform the action.'}) 
    AllowDeleteAPI: boolean;
          
    @Field(() => Boolean, {description: 'Set to 1 if a custom resolver has been created for the entity.'}) 
    CustomResolverAPI: boolean;
          
    @Field(() => Boolean, {description: 'Enabling this bit will result in search being possible at the API and UI layers'}) 
    AllowUserSearchAPI: boolean;
          
    @Field(() => Boolean) 
    FullTextSearchEnabled: boolean;
          
    @Field({nullable: true}) 
    @MaxLength(510)
    FullTextCatalog?: string;
          
    @Field(() => Boolean) 
    FullTextCatalogGenerated: boolean;
          
    @Field({nullable: true}) 
    @MaxLength(510)
    FullTextIndex?: string;
          
    @Field(() => Boolean) 
    FullTextIndexGenerated: boolean;
          
    @Field({nullable: true}) 
    @MaxLength(510)
    FullTextSearchFunction?: string;
          
    @Field(() => Boolean) 
    FullTextSearchFunctionGenerated: boolean;
          
    @Field(() => Int, {nullable: true}) 
    UserViewMaxRows?: number;
          
    @Field({nullable: true}) 
    @MaxLength(510)
    spCreate?: string;
          
    @Field({nullable: true}) 
    @MaxLength(510)
    spUpdate?: string;
          
    @Field({nullable: true}) 
    @MaxLength(510)
    spDelete?: string;
          
    @Field(() => Boolean) 
    spCreateGenerated: boolean;
          
    @Field(() => Boolean) 
    spUpdateGenerated: boolean;
          
    @Field(() => Boolean) 
    spDeleteGenerated: boolean;
          
    @Field(() => Boolean) 
    CascadeDeletes: boolean;
          
    @Field(() => Boolean) 
    UserFormGenerated: boolean;
          
    @Field({nullable: true}) 
    @MaxLength(510)
    EntityObjectSubclassName?: string;
          
    @Field({nullable: true}) 
    @MaxLength(510)
    EntityObjectSubclassImport?: string;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
          
    @Field({nullable: true}) 
    @MaxLength(8000)
    CodeName?: string;
          
    @Field({nullable: true}) 
    @MaxLength(8000)
    ClassName?: string;
          
    @Field({nullable: true}) 
    @MaxLength(8000)
    BaseTableCodeName?: string;
          
    @Field({nullable: true}) 
    @MaxLength(510)
    ParentEntity?: string;
          
    @Field({nullable: true}) 
    @MaxLength(510)
    ParentBaseTable?: string;
          
    @Field({nullable: true}) 
    @MaxLength(510)
    ParentBaseView?: string;
        
    @Field(() => [mj_core_schema_server_object_types.EntityField_])
    EntityFieldsArray: mj_core_schema_server_object_types.EntityField_[]; // Link to EntityFields
    
    @Field(() => [mj_core_schema_server_object_types.EntityPermission_])
    EntityPermissionsArray: mj_core_schema_server_object_types.EntityPermission_[]; // Link to EntityPermissions
    
    @Field(() => [mj_core_schema_server_object_types.EntityRelationship_])
    EntityRelationshipsArray: mj_core_schema_server_object_types.EntityRelationship_[]; // Link to EntityRelationships
    
    @Field(() => [mj_core_schema_server_object_types.EntityAIAction_])
    EntityAIActionsArray: mj_core_schema_server_object_types.EntityAIAction_[]; // Link to EntityAIActions
    
    @Field(() => [mj_core_schema_server_object_types.UserRecordLog_])
    UserRecordLogsArray: mj_core_schema_server_object_types.UserRecordLog_[]; // Link to UserRecordLogs
    
    @Field(() => [mj_core_schema_server_object_types.IntegrationURLFormat_])
    IntegrationURLFormatsArray: mj_core_schema_server_object_types.IntegrationURLFormat_[]; // Link to IntegrationURLFormats
    
    @Field(() => [mj_core_schema_server_object_types.Entity_])
    EntitiesArray: mj_core_schema_server_object_types.Entity_[]; // Link to Entities
    
    @Field(() => [mj_core_schema_server_object_types.UserFavorite_])
    UserFavoritesArray: mj_core_schema_server_object_types.UserFavorite_[]; // Link to UserFavorites
    
    @Field(() => [mj_core_schema_server_object_types.CompanyIntegrationRunDetail_])
    CompanyIntegrationRunDetailsArray: mj_core_schema_server_object_types.CompanyIntegrationRunDetail_[]; // Link to CompanyIntegrationRunDetails
    
    @Field(() => [mj_core_schema_server_object_types.ApplicationEntity_])
    ApplicationEntitiesArray: mj_core_schema_server_object_types.ApplicationEntity_[]; // Link to ApplicationEntities
    
    @Field(() => [mj_core_schema_server_object_types.UserApplicationEntity_])
    UserApplicationEntitiesArray: mj_core_schema_server_object_types.UserApplicationEntity_[]; // Link to UserApplicationEntities
    
    @Field(() => [mj_core_schema_server_object_types.List_])
    ListsArray: mj_core_schema_server_object_types.List_[]; // Link to Lists
    
    @Field(() => [mj_core_schema_server_object_types.UserView_])
    UserViewsArray: mj_core_schema_server_object_types.UserView_[]; // Link to UserViews
    
    @Field(() => [mj_core_schema_server_object_types.RecordChange_])
    RecordChangesArray: mj_core_schema_server_object_types.RecordChange_[]; // Link to RecordChanges
    
    @Field(() => [mj_core_schema_server_object_types.AuditLog_])
    AuditLogsArray: mj_core_schema_server_object_types.AuditLog_[]; // Link to AuditLogs
    
    @Field(() => [mj_core_schema_server_object_types.ResourceType_])
    ResourceTypesArray: mj_core_schema_server_object_types.ResourceType_[]; // Link to ResourceTypes
    
    @Field(() => [mj_core_schema_server_object_types.TaggedItem_])
    TaggedItemsArray: mj_core_schema_server_object_types.TaggedItem_[]; // Link to TaggedItems
    
    @Field(() => [mj_core_schema_server_object_types.DatasetItem_])
    DatasetItemsArray: mj_core_schema_server_object_types.DatasetItem_[]; // Link to DatasetItems
    
    @Field(() => [mj_core_schema_server_object_types.CompanyIntegrationRecordMap_])
    CompanyIntegrationRecordMapsArray: mj_core_schema_server_object_types.CompanyIntegrationRecordMap_[]; // Link to CompanyIntegrationRecordMaps
    
    @Field(() => [mj_core_schema_server_object_types.RecordMergeLog_])
    RecordMergeLogsArray: mj_core_schema_server_object_types.RecordMergeLog_[]; // Link to RecordMergeLogs
    
    @Field(() => [mj_core_schema_server_object_types.QueryField_])
    QueryFieldsArray: mj_core_schema_server_object_types.QueryField_[]; // Link to QueryFields
    
    @Field(() => [mj_core_schema_server_object_types.Conversation_])
    ConversationsArray: mj_core_schema_server_object_types.Conversation_[]; // Link to Conversations
    
    @Field(() => [mj_core_schema_server_object_types.EntityDocument_])
    EntityDocumentsArray: mj_core_schema_server_object_types.EntityDocument_[]; // Link to EntityDocuments
    
    @Field(() => [mj_core_schema_server_object_types.DataContextItem_])
    DataContextItemsArray: mj_core_schema_server_object_types.DataContextItem_[]; // Link to DataContextItems
    
    @Field(() => [mj_core_schema_server_object_types.User_])
    UsersArray: mj_core_schema_server_object_types.User_[]; // Link to Users
    
    @Field(() => [mj_core_schema_server_object_types.EntityRecordDocument_])
    EntityRecordDocumentsArray: mj_core_schema_server_object_types.EntityRecordDocument_[]; // Link to EntityRecordDocuments
    
    @Field(() => [mj_core_schema_server_object_types.FileEntityRecordLink_])
    FileEntityRecordLinksArray: mj_core_schema_server_object_types.FileEntityRecordLink_[]; // Link to FileEntityRecordLinks
    
    @Field(() => [mj_core_schema_server_object_types.UserViewCategory_])
    UserViewCategoriesArray: mj_core_schema_server_object_types.UserViewCategory_[]; // Link to UserViewCategories
    
}
        
//****************************************************************************
// INPUT TYPE for Entities   
//****************************************************************************
@InputType()
export class CreateEntityInput {
    @Field(() => Int)
    ID: number;
    
    @Field(() => Int, { nullable: true })
    ParentID: number;
    
    @Field()
    Name: string;
    
    @Field({ nullable: true })
    NameSuffix: string;
    
    @Field({ nullable: true })
    Description: string;
    
    @Field(() => Boolean)
    AutoUpdateDescription: boolean;
    
    @Field()
    BaseView: string;
    
    @Field(() => Boolean)
    BaseViewGenerated: boolean;
    
    @Field(() => Boolean)
    VirtualEntity: boolean;
    
    @Field(() => Boolean)
    TrackRecordChanges: boolean;
    
    @Field(() => Boolean)
    AuditRecordAccess: boolean;
    
    @Field(() => Boolean)
    AuditViewRuns: boolean;
    
    @Field(() => Boolean)
    IncludeInAPI: boolean;
    
    @Field(() => Boolean)
    AllowAllRowsAPI: boolean;
    
    @Field(() => Boolean)
    AllowUpdateAPI: boolean;
    
    @Field(() => Boolean)
    AllowCreateAPI: boolean;
    
    @Field(() => Boolean)
    AllowDeleteAPI: boolean;
    
    @Field(() => Boolean)
    CustomResolverAPI: boolean;
    
    @Field(() => Boolean)
    AllowUserSearchAPI: boolean;
    
    @Field(() => Boolean)
    FullTextSearchEnabled: boolean;
    
    @Field({ nullable: true })
    FullTextCatalog: string;
    
    @Field(() => Boolean)
    FullTextCatalogGenerated: boolean;
    
    @Field({ nullable: true })
    FullTextIndex: string;
    
    @Field(() => Boolean)
    FullTextIndexGenerated: boolean;
    
    @Field({ nullable: true })
    FullTextSearchFunction: string;
    
    @Field(() => Boolean)
    FullTextSearchFunctionGenerated: boolean;
    
    @Field(() => Int, { nullable: true })
    UserViewMaxRows: number;
    
    @Field({ nullable: true })
    spCreate: string;
    
    @Field({ nullable: true })
    spUpdate: string;
    
    @Field({ nullable: true })
    spDelete: string;
    
    @Field(() => Boolean)
    spCreateGenerated: boolean;
    
    @Field(() => Boolean)
    spUpdateGenerated: boolean;
    
    @Field(() => Boolean)
    spDeleteGenerated: boolean;
    
    @Field(() => Boolean)
    CascadeDeletes: boolean;
    
    @Field(() => Boolean)
    UserFormGenerated: boolean;
    
    @Field({ nullable: true })
    EntityObjectSubclassName: string;
    
    @Field({ nullable: true })
    EntityObjectSubclassImport: string;
    }
    
        
//****************************************************************************
// INPUT TYPE for Entities   
//****************************************************************************
@InputType()
export class UpdateEntityInput {
    @Field(() => Int)
    ID: number;
    
    @Field(() => Int, { nullable: true })
    ParentID: number;
    
    @Field()
    Name: string;
    
    @Field({ nullable: true })
    NameSuffix: string;
    
    @Field({ nullable: true })
    Description: string;
    
    @Field(() => Boolean)
    AutoUpdateDescription: boolean;
    
    @Field()
    BaseView: string;
    
    @Field(() => Boolean)
    BaseViewGenerated: boolean;
    
    @Field(() => Boolean)
    VirtualEntity: boolean;
    
    @Field(() => Boolean)
    TrackRecordChanges: boolean;
    
    @Field(() => Boolean)
    AuditRecordAccess: boolean;
    
    @Field(() => Boolean)
    AuditViewRuns: boolean;
    
    @Field(() => Boolean)
    IncludeInAPI: boolean;
    
    @Field(() => Boolean)
    AllowAllRowsAPI: boolean;
    
    @Field(() => Boolean)
    AllowUpdateAPI: boolean;
    
    @Field(() => Boolean)
    AllowCreateAPI: boolean;
    
    @Field(() => Boolean)
    AllowDeleteAPI: boolean;
    
    @Field(() => Boolean)
    CustomResolverAPI: boolean;
    
    @Field(() => Boolean)
    AllowUserSearchAPI: boolean;
    
    @Field(() => Boolean)
    FullTextSearchEnabled: boolean;
    
    @Field({ nullable: true })
    FullTextCatalog: string;
    
    @Field(() => Boolean)
    FullTextCatalogGenerated: boolean;
    
    @Field({ nullable: true })
    FullTextIndex: string;
    
    @Field(() => Boolean)
    FullTextIndexGenerated: boolean;
    
    @Field({ nullable: true })
    FullTextSearchFunction: string;
    
    @Field(() => Boolean)
    FullTextSearchFunctionGenerated: boolean;
    
    @Field(() => Int, { nullable: true })
    UserViewMaxRows: number;
    
    @Field({ nullable: true })
    spCreate: string;
    
    @Field({ nullable: true })
    spUpdate: string;
    
    @Field({ nullable: true })
    spDelete: string;
    
    @Field(() => Boolean)
    spCreateGenerated: boolean;
    
    @Field(() => Boolean)
    spUpdateGenerated: boolean;
    
    @Field(() => Boolean)
    spDeleteGenerated: boolean;
    
    @Field(() => Boolean)
    CascadeDeletes: boolean;
    
    @Field(() => Boolean)
    UserFormGenerated: boolean;
    
    @Field({ nullable: true })
    EntityObjectSubclassName: string;
    
    @Field({ nullable: true })
    EntityObjectSubclassImport: string;
    }
    
//****************************************************************************
// RESOLVER for Entities
//****************************************************************************
@ObjectType()
export class RunEntityViewResult {
    @Field(() => [Entity_])
    Results: Entity_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(Entity_)
export class EntityResolverBase extends ResolverBase {
    @Query(() => RunEntityViewResult)
    async RunEntityViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunEntityViewResult)
    async RunEntityViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunEntityViewResult)
    async RunEntityDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Entities';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => Entity_, { nullable: true })
    async Entity(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Entity_ | null> {
        this.CheckUserReadPermissions('Entities', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwEntities] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Entities', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Entities', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Query(() => [Entity_])
    async AllEntities(@Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Entities', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwEntities]` + this.getRowLevelSecurityWhereClause('Entities', userPayload, EntityPermissionType.Read, ' WHERE');
        const result = this.ArrayMapFieldNamesToCodeNames('Entities', await dataSource.query(sSQL));
        return result;
    }
      
    @FieldResolver(() => [mj_core_schema_server_object_types.EntityField_])
    async EntityFieldsArray(@Root() entity_: Entity_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Entity Fields', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwEntityFields] WHERE [EntityID]=${entity_.ID} ` + this.getRowLevelSecurityWhereClause('Entity Fields', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Entity Fields', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.EntityPermission_])
    async EntityPermissionsArray(@Root() entity_: Entity_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Entity Permissions', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwEntityPermissions] WHERE [EntityID]=${entity_.ID} ` + this.getRowLevelSecurityWhereClause('Entity Permissions', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Entity Permissions', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.EntityRelationship_])
    async EntityRelationshipsArray(@Root() entity_: Entity_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Entity Relationships', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwEntityRelationships] WHERE [EntityID]=${entity_.ID} ` + this.getRowLevelSecurityWhereClause('Entity Relationships', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Entity Relationships', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.EntityAIAction_])
    async EntityAIActionsArray(@Root() entity_: Entity_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Entity AI Actions', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwEntityAIActions] WHERE [EntityID]=${entity_.ID} ` + this.getRowLevelSecurityWhereClause('Entity AI Actions', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Entity AI Actions', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.UserRecordLog_])
    async UserRecordLogsArray(@Root() entity_: Entity_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('User Record Logs', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwUserRecordLogs] WHERE [EntityID]=${entity_.ID} ` + this.getRowLevelSecurityWhereClause('User Record Logs', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('User Record Logs', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.IntegrationURLFormat_])
    async IntegrationURLFormatsArray(@Root() entity_: Entity_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Integration URL Formats', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwIntegrationURLFormats] WHERE [EntityID]=${entity_.ID} ` + this.getRowLevelSecurityWhereClause('Integration URL Formats', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Integration URL Formats', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.Entity_])
    async EntitiesArray(@Root() entity_: Entity_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Entities', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwEntities] WHERE [ParentID]=${entity_.ID} ` + this.getRowLevelSecurityWhereClause('Entities', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Entities', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.UserFavorite_])
    async UserFavoritesArray(@Root() entity_: Entity_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('User Favorites', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwUserFavorites] WHERE [EntityID]=${entity_.ID} ` + this.getRowLevelSecurityWhereClause('User Favorites', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('User Favorites', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.CompanyIntegrationRunDetail_])
    async CompanyIntegrationRunDetailsArray(@Root() entity_: Entity_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Company Integration Run Details', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwCompanyIntegrationRunDetails] WHERE [EntityID]=${entity_.ID} ` + this.getRowLevelSecurityWhereClause('Company Integration Run Details', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Company Integration Run Details', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.ApplicationEntity_])
    async ApplicationEntitiesArray(@Root() entity_: Entity_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Application Entities', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwApplicationEntities] WHERE [EntityID]=${entity_.ID} ` + this.getRowLevelSecurityWhereClause('Application Entities', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Application Entities', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.UserApplicationEntity_])
    async UserApplicationEntitiesArray(@Root() entity_: Entity_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('User Application Entities', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwUserApplicationEntities] WHERE [EntityID]=${entity_.ID} ` + this.getRowLevelSecurityWhereClause('User Application Entities', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('User Application Entities', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.List_])
    async ListsArray(@Root() entity_: Entity_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Lists', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwLists] WHERE [EntityID]=${entity_.ID} ` + this.getRowLevelSecurityWhereClause('Lists', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Lists', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.UserView_])
    async UserViewsArray(@Root() entity_: Entity_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('User Views', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwUserViews] WHERE [EntityID]=${entity_.ID} ` + this.getRowLevelSecurityWhereClause('User Views', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('User Views', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.RecordChange_])
    async RecordChangesArray(@Root() entity_: Entity_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Record Changes', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwRecordChanges] WHERE [EntityID]=${entity_.ID} ` + this.getRowLevelSecurityWhereClause('Record Changes', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Record Changes', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.AuditLog_])
    async AuditLogsArray(@Root() entity_: Entity_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Audit Logs', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwAuditLogs] WHERE [EntityID]=${entity_.ID} ` + this.getRowLevelSecurityWhereClause('Audit Logs', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Audit Logs', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.ResourceType_])
    async ResourceTypesArray(@Root() entity_: Entity_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Resource Types', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwResourceTypes] WHERE [EntityID]=${entity_.ID} ` + this.getRowLevelSecurityWhereClause('Resource Types', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Resource Types', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.TaggedItem_])
    async TaggedItemsArray(@Root() entity_: Entity_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Tagged Items', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwTaggedItems] WHERE [EntityID]=${entity_.ID} ` + this.getRowLevelSecurityWhereClause('Tagged Items', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Tagged Items', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.DatasetItem_])
    async DatasetItemsArray(@Root() entity_: Entity_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Dataset Items', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwDatasetItems] WHERE [EntityID]=${entity_.ID} ` + this.getRowLevelSecurityWhereClause('Dataset Items', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Dataset Items', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.CompanyIntegrationRecordMap_])
    async CompanyIntegrationRecordMapsArray(@Root() entity_: Entity_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Company Integration Record Maps', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwCompanyIntegrationRecordMaps] WHERE [EntityID]=${entity_.ID} ` + this.getRowLevelSecurityWhereClause('Company Integration Record Maps', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Company Integration Record Maps', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.RecordMergeLog_])
    async RecordMergeLogsArray(@Root() entity_: Entity_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Record Merge Logs', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwRecordMergeLogs] WHERE [EntityID]=${entity_.ID} ` + this.getRowLevelSecurityWhereClause('Record Merge Logs', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Record Merge Logs', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.QueryField_])
    async QueryFieldsArray(@Root() entity_: Entity_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Query Fields', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwQueryFields] WHERE [SourceEntityID]=${entity_.ID} ` + this.getRowLevelSecurityWhereClause('Query Fields', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Query Fields', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.Conversation_])
    async ConversationsArray(@Root() entity_: Entity_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Conversations', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwConversations] WHERE [LinkedEntityID]=${entity_.ID} ` + this.getRowLevelSecurityWhereClause('Conversations', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Conversations', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.EntityDocument_])
    async EntityDocumentsArray(@Root() entity_: Entity_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Entity Documents', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwEntityDocuments] WHERE [EntityID]=${entity_.ID} ` + this.getRowLevelSecurityWhereClause('Entity Documents', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Entity Documents', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.DataContextItem_])
    async DataContextItemsArray(@Root() entity_: Entity_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Data Context Items', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwDataContextItems] WHERE [EntityID]=${entity_.ID} ` + this.getRowLevelSecurityWhereClause('Data Context Items', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Data Context Items', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.User_])
    async UsersArray(@Root() entity_: Entity_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Users', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwUsers] WHERE [LinkedEntityID]=${entity_.ID} ` + this.getRowLevelSecurityWhereClause('Users', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Users', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.EntityRecordDocument_])
    async EntityRecordDocumentsArray(@Root() entity_: Entity_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Entity Record Documents', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwEntityRecordDocuments] WHERE [EntityID]=${entity_.ID} ` + this.getRowLevelSecurityWhereClause('Entity Record Documents', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Entity Record Documents', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.FileEntityRecordLink_])
    async FileEntityRecordLinksArray(@Root() entity_: Entity_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('File Entity Record Links', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwFileEntityRecordLinks] WHERE [EntityID]=${entity_.ID} ` + this.getRowLevelSecurityWhereClause('File Entity Record Links', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('File Entity Record Links', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.UserViewCategory_])
    async UserViewCategoriesArray(@Root() entity_: Entity_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('User View Categories', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwUserViewCategories] WHERE [EntityID]=${entity_.ID} ` + this.getRowLevelSecurityWhereClause('User View Categories', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('User View Categories', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => Entity_)
    async CreateEntity(
        @Arg('input', () => CreateEntityInput) input: CreateEntityInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <EntityEntity>await new Metadata().GetEntityObject('Entities', this.GetUserFromPayload(userPayload));
            await entityObject.NewRecord();
            entityObject.SetMany(input);
            if (await entityObject.Save()) {
                // save worked, fire the AfterCreate event and then return all the data
                await this.AfterCreate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else 
                // save failed, return null
                return null;
        }
        else    
            return null;
    }

    // Before/After CREATE Event Hooks for Sub-Classes to Override
    protected async BeforeCreate(dataSource: DataSource, input: CreateEntityInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateEntityInput) {
    }
        
    @Mutation(() => Entity_)
    async UpdateEntity(
        @Arg('input', () => UpdateEntityInput) input: UpdateEntityInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <EntityEntity>await new Metadata().GetEntityObject('Entities', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for Entities
            
            if (await entityObject.Save({ IgnoreDirtyState: true /*flag used because of LoadFromData() call above*/ })) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateEntityInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateEntityInput) {
        const i = input, d = dataSource; // prevent error
    }
    
    @Mutation(() => Entity_)
    async DeleteEntity(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        if (await this.BeforeDelete(dataSource, ID)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <EntityEntity>await new Metadata().GetEntityObject('Entities', this.GetUserFromPayload(userPayload));
            await entityObject.Load(ID);
            const returnValue = entityObject.GetAll(); // grab the values before we delete so we can return last state before delete if we are successful.
            if (await entityObject.Delete()) {
                await this.AfterDelete(dataSource, ID); // fire event
                return returnValue;
            }
            else 
                return null; // delete failed, this will cause an exception
        }
        else
            return null; // BeforeDelete canceled the operation, this will cause an exception
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeDelete(dataSource: DataSource, ID: number): Promise<boolean> {
        const i = ID, d = dataSource; // prevent error;
        return true;
    }
    protected async AfterDelete(dataSource: DataSource, ID: number) {
        const i = ID, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for Users
//****************************************************************************
@ObjectType({ description: 'A list of all users who have or had access to the system' })
export class User_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field() 
    @MaxLength(200)
    Name: string;
          
    @Field({nullable: true}) 
    @MaxLength(100)
    FirstName?: string;
          
    @Field({nullable: true}) 
    @MaxLength(100)
    LastName?: string;
          
    @Field({nullable: true}) 
    @MaxLength(100)
    Title?: string;
          
    @Field() 
    @MaxLength(200)
    Email: string;
          
    @Field() 
    @MaxLength(30)
    Type: string;
          
    @Field(() => Boolean) 
    IsActive: boolean;
          
    @Field() 
    @MaxLength(20)
    LinkedRecordType: string;
          
    @Field(() => Int, {nullable: true}) 
    EmployeeID?: number;
          
    @Field(() => Int, {nullable: true}) 
    LinkedEntityID?: number;
          
    @Field(() => Int, {nullable: true}) 
    LinkedEntityRecordID?: number;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
          
    @Field({nullable: true}) 
    @MaxLength(202)
    FirstLast?: string;
          
    @Field({nullable: true}) 
    @MaxLength(162)
    EmployeeFirstLast?: string;
          
    @Field({nullable: true}) 
    @MaxLength(200)
    EmployeeEmail?: string;
          
    @Field({nullable: true}) 
    @MaxLength(100)
    EmployeeTitle?: string;
          
    @Field({nullable: true}) 
    @MaxLength(162)
    EmployeeSupervisor?: string;
          
    @Field({nullable: true}) 
    @MaxLength(200)
    EmployeeSupervisorEmail?: string;
        
    @Field(() => [mj_core_schema_server_object_types.UserApplication_])
    UserApplicationsArray: mj_core_schema_server_object_types.UserApplication_[]; // Link to UserApplications
    
    @Field(() => [mj_core_schema_server_object_types.UserRole_])
    UserRolesArray: mj_core_schema_server_object_types.UserRole_[]; // Link to UserRoles
    
    @Field(() => [mj_core_schema_server_object_types.Workspace_])
    WorkspacesArray: mj_core_schema_server_object_types.Workspace_[]; // Link to Workspaces
    
    @Field(() => [mj_core_schema_server_object_types.Report_])
    ReportsArray: mj_core_schema_server_object_types.Report_[]; // Link to Reports
    
    @Field(() => [mj_core_schema_server_object_types.ReportSnapshot_])
    ReportSnapshotsArray: mj_core_schema_server_object_types.ReportSnapshot_[]; // Link to ReportSnapshots
    
    @Field(() => [mj_core_schema_server_object_types.RecordChange_])
    RecordChangesArray: mj_core_schema_server_object_types.RecordChange_[]; // Link to RecordChanges
    
    @Field(() => [mj_core_schema_server_object_types.Dashboard_])
    DashboardsArray: mj_core_schema_server_object_types.Dashboard_[]; // Link to Dashboards
    
    @Field(() => [mj_core_schema_server_object_types.UserViewRun_])
    UserViewRunsArray: mj_core_schema_server_object_types.UserViewRun_[]; // Link to UserViewRuns
    
    @Field(() => [mj_core_schema_server_object_types.AuditLog_])
    AuditLogsArray: mj_core_schema_server_object_types.AuditLog_[]; // Link to AuditLogs
    
    @Field(() => [mj_core_schema_server_object_types.List_])
    ListsArray: mj_core_schema_server_object_types.List_[]; // Link to Lists
    
    @Field(() => [mj_core_schema_server_object_types.UserFavorite_])
    UserFavoritesArray: mj_core_schema_server_object_types.UserFavorite_[]; // Link to UserFavorites
    
    @Field(() => [mj_core_schema_server_object_types.UserRecordLog_])
    UserRecordLogsArray: mj_core_schema_server_object_types.UserRecordLog_[]; // Link to UserRecordLogs
    
    @Field(() => [mj_core_schema_server_object_types.UserView_])
    UserViewsArray: mj_core_schema_server_object_types.UserView_[]; // Link to UserViews
    
    @Field(() => [mj_core_schema_server_object_types.CompanyIntegrationRun_])
    CompanyIntegrationRunsArray: mj_core_schema_server_object_types.CompanyIntegrationRun_[]; // Link to CompanyIntegrationRuns
    
    @Field(() => [mj_core_schema_server_object_types.UserNotification_])
    UserNotificationsArray: mj_core_schema_server_object_types.UserNotification_[]; // Link to UserNotifications
    
    @Field(() => [mj_core_schema_server_object_types.Conversation_])
    ConversationsArray: mj_core_schema_server_object_types.Conversation_[]; // Link to Conversations
    
    @Field(() => [mj_core_schema_server_object_types.RecordMergeLog_])
    RecordMergeLogsArray: mj_core_schema_server_object_types.RecordMergeLog_[]; // Link to RecordMergeLogs
    
    @Field(() => [mj_core_schema_server_object_types.DataContext_])
    DataContextsArray: mj_core_schema_server_object_types.DataContext_[]; // Link to DataContexts
    
    @Field(() => [mj_core_schema_server_object_types.ReportCategory_])
    ReportCategoriesArray: mj_core_schema_server_object_types.ReportCategory_[]; // Link to ReportCategories
    
    @Field(() => [mj_core_schema_server_object_types.UserViewCategory_])
    UserViewCategoriesArray: mj_core_schema_server_object_types.UserViewCategory_[]; // Link to UserViewCategories
    
    @Field(() => [mj_core_schema_server_object_types.DashboardCategory_])
    DashboardCategoriesArray: mj_core_schema_server_object_types.DashboardCategory_[]; // Link to DashboardCategories
    
    @Field(() => [mj_core_schema_server_object_types.QueryCategory_])
    QueryCategoriesArray: mj_core_schema_server_object_types.QueryCategory_[]; // Link to QueryCategories
    
}
        
//****************************************************************************
// INPUT TYPE for Users   
//****************************************************************************
@InputType()
export class CreateUserInput {
    @Field()
    Name: string;
    
    @Field({ nullable: true })
    FirstName: string;
    
    @Field({ nullable: true })
    LastName: string;
    
    @Field({ nullable: true })
    Title: string;
    
    @Field()
    Email: string;
    
    @Field()
    Type: string;
    
    @Field(() => Boolean)
    IsActive: boolean;
    
    @Field()
    LinkedRecordType: string;
    
    @Field(() => Int, { nullable: true })
    EmployeeID: number;
    
    @Field(() => Int, { nullable: true })
    LinkedEntityID: number;
    
    @Field(() => Int, { nullable: true })
    LinkedEntityRecordID: number;
    }
    
        
//****************************************************************************
// INPUT TYPE for Users   
//****************************************************************************
@InputType()
export class UpdateUserInput {
    @Field(() => Int)
    ID: number;
    
    @Field()
    Name: string;
    
    @Field({ nullable: true })
    FirstName: string;
    
    @Field({ nullable: true })
    LastName: string;
    
    @Field({ nullable: true })
    Title: string;
    
    @Field()
    Email: string;
    
    @Field()
    Type: string;
    
    @Field(() => Boolean)
    IsActive: boolean;
    
    @Field()
    LinkedRecordType: string;
    
    @Field(() => Int, { nullable: true })
    EmployeeID: number;
    
    @Field(() => Int, { nullable: true })
    LinkedEntityID: number;
    
    @Field(() => Int, { nullable: true })
    LinkedEntityRecordID: number;
    }
    
//****************************************************************************
// RESOLVER for Users
//****************************************************************************
@ObjectType()
export class RunUserViewResult {
    @Field(() => [User_])
    Results: User_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(User_)
export class UserResolverBase extends ResolverBase {
    @Query(() => RunUserViewResult)
    async RunUserViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunUserViewResult)
    async RunUserViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunUserViewResult)
    async RunUserDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Users';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => User_, { nullable: true })
    async User(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<User_ | null> {
        this.CheckUserReadPermissions('Users', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwUsers] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Users', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Users', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Query(() => [User_])
    async AllUsers(@Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Users', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwUsers]` + this.getRowLevelSecurityWhereClause('Users', userPayload, EntityPermissionType.Read, ' WHERE');
        const result = this.ArrayMapFieldNamesToCodeNames('Users', await dataSource.query(sSQL));
        return result;
    }
      
    @FieldResolver(() => [mj_core_schema_server_object_types.UserApplication_])
    async UserApplicationsArray(@Root() user_: User_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('User Applications', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwUserApplications] WHERE [UserID]=${user_.ID} ` + this.getRowLevelSecurityWhereClause('User Applications', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('User Applications', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.UserRole_])
    async UserRolesArray(@Root() user_: User_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('User Roles', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwUserRoles] WHERE [UserID]=${user_.ID} ` + this.getRowLevelSecurityWhereClause('User Roles', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('User Roles', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.Workspace_])
    async WorkspacesArray(@Root() user_: User_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Workspaces', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwWorkspaces] WHERE [UserID]=${user_.ID} ` + this.getRowLevelSecurityWhereClause('Workspaces', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Workspaces', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.Report_])
    async ReportsArray(@Root() user_: User_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Reports', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwReports] WHERE [UserID]=${user_.ID} ` + this.getRowLevelSecurityWhereClause('Reports', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Reports', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.ReportSnapshot_])
    async ReportSnapshotsArray(@Root() user_: User_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Report Snapshots', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwReportSnapshots] WHERE [UserID]=${user_.ID} ` + this.getRowLevelSecurityWhereClause('Report Snapshots', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Report Snapshots', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.RecordChange_])
    async RecordChangesArray(@Root() user_: User_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Record Changes', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwRecordChanges] WHERE [UserID]=${user_.ID} ` + this.getRowLevelSecurityWhereClause('Record Changes', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Record Changes', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.Dashboard_])
    async DashboardsArray(@Root() user_: User_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Dashboards', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwDashboards] WHERE [UserID]=${user_.ID} ` + this.getRowLevelSecurityWhereClause('Dashboards', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Dashboards', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.UserViewRun_])
    async UserViewRunsArray(@Root() user_: User_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('User View Runs', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwUserViewRuns] WHERE [RunByUserID]=${user_.ID} ` + this.getRowLevelSecurityWhereClause('User View Runs', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('User View Runs', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.AuditLog_])
    async AuditLogsArray(@Root() user_: User_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Audit Logs', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwAuditLogs] WHERE [UserID]=${user_.ID} ` + this.getRowLevelSecurityWhereClause('Audit Logs', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Audit Logs', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.List_])
    async ListsArray(@Root() user_: User_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Lists', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwLists] WHERE [UserID]=${user_.ID} ` + this.getRowLevelSecurityWhereClause('Lists', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Lists', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.UserFavorite_])
    async UserFavoritesArray(@Root() user_: User_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('User Favorites', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwUserFavorites] WHERE [UserID]=${user_.ID} ` + this.getRowLevelSecurityWhereClause('User Favorites', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('User Favorites', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.UserRecordLog_])
    async UserRecordLogsArray(@Root() user_: User_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('User Record Logs', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwUserRecordLogs] WHERE [UserID]=${user_.ID} ` + this.getRowLevelSecurityWhereClause('User Record Logs', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('User Record Logs', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.UserView_])
    async UserViewsArray(@Root() user_: User_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('User Views', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwUserViews] WHERE [UserID]=${user_.ID} ` + this.getRowLevelSecurityWhereClause('User Views', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('User Views', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.CompanyIntegrationRun_])
    async CompanyIntegrationRunsArray(@Root() user_: User_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Company Integration Runs', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwCompanyIntegrationRuns] WHERE [RunByUserID]=${user_.ID} ` + this.getRowLevelSecurityWhereClause('Company Integration Runs', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Company Integration Runs', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.UserNotification_])
    async UserNotificationsArray(@Root() user_: User_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('User Notifications', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwUserNotifications] WHERE [UserID]=${user_.ID} ` + this.getRowLevelSecurityWhereClause('User Notifications', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('User Notifications', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.Conversation_])
    async ConversationsArray(@Root() user_: User_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Conversations', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwConversations] WHERE [UserID]=${user_.ID} ` + this.getRowLevelSecurityWhereClause('Conversations', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Conversations', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.RecordMergeLog_])
    async RecordMergeLogsArray(@Root() user_: User_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Record Merge Logs', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwRecordMergeLogs] WHERE [InitiatedByUserID]=${user_.ID} ` + this.getRowLevelSecurityWhereClause('Record Merge Logs', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Record Merge Logs', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.DataContext_])
    async DataContextsArray(@Root() user_: User_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Data Contexts', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwDataContexts] WHERE [UserID]=${user_.ID} ` + this.getRowLevelSecurityWhereClause('Data Contexts', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Data Contexts', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.ReportCategory_])
    async ReportCategoriesArray(@Root() user_: User_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Report Categories', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwReportCategories] WHERE [UserID]=${user_.ID} ` + this.getRowLevelSecurityWhereClause('Report Categories', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Report Categories', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.UserViewCategory_])
    async UserViewCategoriesArray(@Root() user_: User_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('User View Categories', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwUserViewCategories] WHERE [UserID]=${user_.ID} ` + this.getRowLevelSecurityWhereClause('User View Categories', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('User View Categories', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.DashboardCategory_])
    async DashboardCategoriesArray(@Root() user_: User_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Dashboard Categories', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwDashboardCategories] WHERE [UserID]=${user_.ID} ` + this.getRowLevelSecurityWhereClause('Dashboard Categories', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Dashboard Categories', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.QueryCategory_])
    async QueryCategoriesArray(@Root() user_: User_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Query Categories', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwQueryCategories] WHERE [UserID]=${user_.ID} ` + this.getRowLevelSecurityWhereClause('Query Categories', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Query Categories', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => User_)
    async CreateUser(
        @Arg('input', () => CreateUserInput) input: CreateUserInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <UserEntity>await new Metadata().GetEntityObject('Users', this.GetUserFromPayload(userPayload));
            await entityObject.NewRecord();
            entityObject.SetMany(input);
            if (await entityObject.Save()) {
                // save worked, fire the AfterCreate event and then return all the data
                await this.AfterCreate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else 
                // save failed, return null
                return null;
        }
        else    
            return null;
    }

    // Before/After CREATE Event Hooks for Sub-Classes to Override
    protected async BeforeCreate(dataSource: DataSource, input: CreateUserInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateUserInput) {
    }
        
    @Mutation(() => User_)
    async UpdateUser(
        @Arg('input', () => UpdateUserInput) input: UpdateUserInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <UserEntity>await new Metadata().GetEntityObject('Users', this.GetUserFromPayload(userPayload));
            await entityObject.Load(input.ID) // Track Changes is turned on, so we need to get the latest data from DB first before we save
            entityObject.SetMany(input);
            if (await entityObject.Save()) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateUserInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateUserInput) {
        const i = input, d = dataSource; // prevent error
    }
    
    @Mutation(() => User_)
    async DeleteUser(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        if (await this.BeforeDelete(dataSource, ID)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <UserEntity>await new Metadata().GetEntityObject('Users', this.GetUserFromPayload(userPayload));
            await entityObject.Load(ID);
            const returnValue = entityObject.GetAll(); // grab the values before we delete so we can return last state before delete if we are successful.
            if (await entityObject.Delete()) {
                await this.AfterDelete(dataSource, ID); // fire event
                return returnValue;
            }
            else 
                return null; // delete failed, this will cause an exception
        }
        else
            return null; // BeforeDelete canceled the operation, this will cause an exception
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeDelete(dataSource: DataSource, ID: number): Promise<boolean> {
        const i = ID, d = dataSource; // prevent error;
        return true;
    }
    protected async AfterDelete(dataSource: DataSource, ID: number) {
        const i = ID, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for Entity Relationships
//****************************************************************************
@ObjectType({ description: 'Metadata about relationships between entities including display preferences for the UI' })
export class EntityRelationship_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field(() => Int) 
    EntityID: number;
          
    @Field(() => Int, {description: 'Used for display order in generated forms and in other places in the UI where relationships for an entity are shown'}) 
    Sequence: number;
          
    @Field(() => Int) 
    RelatedEntityID: number;
          
    @Field(() => Boolean) 
    BundleInAPI: boolean;
          
    @Field(() => Boolean) 
    IncludeInParentAllQuery: boolean;
          
    @Field() 
    @MaxLength(40)
    Type: string;
          
    @Field({nullable: true}) 
    @MaxLength(510)
    EntityKeyField?: string;
          
    @Field() 
    @MaxLength(510)
    RelatedEntityJoinField: string;
          
    @Field({nullable: true}) 
    @MaxLength(510)
    JoinView?: string;
          
    @Field({nullable: true}) 
    @MaxLength(510)
    JoinEntityJoinField?: string;
          
    @Field({nullable: true}) 
    @MaxLength(510)
    JoinEntityInverseJoinField?: string;
          
    @Field(() => Boolean) 
    DisplayInForm: boolean;
          
    @Field({nullable: true}) 
    @MaxLength(510)
    DisplayName?: string;
          
    @Field({nullable: true}) 
    @MaxLength(16)
    DisplayUserViewGUID?: string;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
          
    @Field() 
    @MaxLength(510)
    Entity: string;
          
    @Field() 
    @MaxLength(510)
    EntityBaseTable: string;
          
    @Field() 
    @MaxLength(510)
    EntityBaseView: string;
          
    @Field() 
    @MaxLength(510)
    RelatedEntity: string;
          
    @Field() 
    @MaxLength(510)
    RelatedEntityBaseTable: string;
          
    @Field() 
    @MaxLength(510)
    RelatedEntityBaseView: string;
          
    @Field({nullable: true}) 
    @MaxLength(8000)
    RelatedEntityClassName?: string;
          
    @Field({nullable: true}) 
    @MaxLength(8000)
    RelatedEntityCodeName?: string;
          
    @Field({nullable: true}) 
    @MaxLength(8000)
    RelatedEntityBaseTableCodeName?: string;
          
    @Field({nullable: true}) 
    @MaxLength(200)
    DisplayUserViewName?: string;
          
    @Field(() => Int, {nullable: true}) 
    DisplayUserViewID?: number;
        
}
        
//****************************************************************************
// INPUT TYPE for Entity Relationships   
//****************************************************************************
@InputType()
export class CreateEntityRelationshipInput {
    @Field(() => Int)
    EntityID: number;
    
    @Field(() => Int)
    Sequence: number;
    
    @Field(() => Int)
    RelatedEntityID: number;
    
    @Field(() => Boolean)
    BundleInAPI: boolean;
    
    @Field(() => Boolean)
    IncludeInParentAllQuery: boolean;
    
    @Field()
    Type: string;
    
    @Field({ nullable: true })
    EntityKeyField: string;
    
    @Field()
    RelatedEntityJoinField: string;
    
    @Field({ nullable: true })
    JoinView: string;
    
    @Field({ nullable: true })
    JoinEntityJoinField: string;
    
    @Field({ nullable: true })
    JoinEntityInverseJoinField: string;
    
    @Field(() => Boolean)
    DisplayInForm: boolean;
    
    @Field({ nullable: true })
    DisplayName: string;
    }
    
        
//****************************************************************************
// INPUT TYPE for Entity Relationships   
//****************************************************************************
@InputType()
export class UpdateEntityRelationshipInput {
    @Field(() => Int)
    ID: number;
    
    @Field(() => Int)
    EntityID: number;
    
    @Field(() => Int)
    Sequence: number;
    
    @Field(() => Int)
    RelatedEntityID: number;
    
    @Field(() => Boolean)
    BundleInAPI: boolean;
    
    @Field(() => Boolean)
    IncludeInParentAllQuery: boolean;
    
    @Field()
    Type: string;
    
    @Field({ nullable: true })
    EntityKeyField: string;
    
    @Field()
    RelatedEntityJoinField: string;
    
    @Field({ nullable: true })
    JoinView: string;
    
    @Field({ nullable: true })
    JoinEntityJoinField: string;
    
    @Field({ nullable: true })
    JoinEntityInverseJoinField: string;
    
    @Field(() => Boolean)
    DisplayInForm: boolean;
    
    @Field({ nullable: true })
    DisplayName: string;
    }
    
//****************************************************************************
// RESOLVER for Entity Relationships
//****************************************************************************
@ObjectType()
export class RunEntityRelationshipViewResult {
    @Field(() => [EntityRelationship_])
    Results: EntityRelationship_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(EntityRelationship_)
export class EntityRelationshipResolver extends ResolverBase {
    @Query(() => RunEntityRelationshipViewResult)
    async RunEntityRelationshipViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunEntityRelationshipViewResult)
    async RunEntityRelationshipViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunEntityRelationshipViewResult)
    async RunEntityRelationshipDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Entity Relationships';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => EntityRelationship_, { nullable: true })
    async EntityRelationship(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<EntityRelationship_ | null> {
        this.CheckUserReadPermissions('Entity Relationships', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwEntityRelationships] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Entity Relationships', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Entity Relationships', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Query(() => [EntityRelationship_])
    async AllEntityRelationships(@Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Entity Relationships', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwEntityRelationships]` + this.getRowLevelSecurityWhereClause('Entity Relationships', userPayload, EntityPermissionType.Read, ' WHERE');
        const result = this.ArrayMapFieldNamesToCodeNames('Entity Relationships', await dataSource.query(sSQL));
        return result;
    }
    
    @Mutation(() => EntityRelationship_)
    async CreateEntityRelationship(
        @Arg('input', () => CreateEntityRelationshipInput) input: CreateEntityRelationshipInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <EntityRelationshipEntity>await new Metadata().GetEntityObject('Entity Relationships', this.GetUserFromPayload(userPayload));
            await entityObject.NewRecord();
            entityObject.SetMany(input);
            if (await entityObject.Save()) {
                // save worked, fire the AfterCreate event and then return all the data
                await this.AfterCreate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else 
                // save failed, return null
                return null;
        }
        else    
            return null;
    }

    // Before/After CREATE Event Hooks for Sub-Classes to Override
    protected async BeforeCreate(dataSource: DataSource, input: CreateEntityRelationshipInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateEntityRelationshipInput) {
    }
        
    @Mutation(() => EntityRelationship_)
    async UpdateEntityRelationship(
        @Arg('input', () => UpdateEntityRelationshipInput) input: UpdateEntityRelationshipInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <EntityRelationshipEntity>await new Metadata().GetEntityObject('Entity Relationships', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for Entity Relationships
            
            if (await entityObject.Save({ IgnoreDirtyState: true /*flag used because of LoadFromData() call above*/ })) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateEntityRelationshipInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateEntityRelationshipInput) {
        const i = input, d = dataSource; // prevent error
    }
    
    @Mutation(() => EntityRelationship_)
    async DeleteEntityRelationship(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        if (await this.BeforeDelete(dataSource, ID)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <EntityRelationshipEntity>await new Metadata().GetEntityObject('Entity Relationships', this.GetUserFromPayload(userPayload));
            await entityObject.Load(ID);
            const returnValue = entityObject.GetAll(); // grab the values before we delete so we can return last state before delete if we are successful.
            if (await entityObject.Delete()) {
                await this.AfterDelete(dataSource, ID); // fire event
                return returnValue;
            }
            else 
                return null; // delete failed, this will cause an exception
        }
        else
            return null; // BeforeDelete canceled the operation, this will cause an exception
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeDelete(dataSource: DataSource, ID: number): Promise<boolean> {
        const i = ID, d = dataSource; // prevent error;
        return true;
    }
    protected async AfterDelete(dataSource: DataSource, ID: number) {
        const i = ID, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for User Record Logs
//****************************************************************************
@ObjectType()
export class UserRecordLog_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field(() => Int) 
    UserID: number;
          
    @Field(() => Int) 
    EntityID: number;
          
    @Field() 
    @MaxLength(510)
    RecordID: string;
          
    @Field() 
    @MaxLength(8)
    EarliestAt: Date;
          
    @Field() 
    @MaxLength(8)
    LatestAt: Date;
          
    @Field(() => Int) 
    TotalCount: number;
          
    @Field() 
    @MaxLength(510)
    Entity: string;
          
    @Field() 
    @MaxLength(200)
    UserName: string;
          
    @Field({nullable: true}) 
    @MaxLength(202)
    UserFirstLast?: string;
          
    @Field() 
    @MaxLength(200)
    UserEmail: string;
          
    @Field({nullable: true}) 
    @MaxLength(162)
    UserSupervisor?: string;
          
    @Field({nullable: true}) 
    @MaxLength(200)
    UserSupervisorEmail?: string;
        
}
        
//****************************************************************************
// INPUT TYPE for User Record Logs   
//****************************************************************************
@InputType()
export class UpdateUserRecordLogInput {
    @Field(() => Int)
    ID: number;
    
    @Field(() => Int)
    UserID: number;
    
    @Field(() => Int)
    EntityID: number;
    
    @Field()
    RecordID: string;
    
    @Field()
    EarliestAt: Date;
    
    @Field()
    LatestAt: Date;
    
    @Field(() => Int)
    TotalCount: number;
    }
    
//****************************************************************************
// RESOLVER for User Record Logs
//****************************************************************************
@ObjectType()
export class RunUserRecordLogViewResult {
    @Field(() => [UserRecordLog_])
    Results: UserRecordLog_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(UserRecordLog_)
export class UserRecordLogResolver extends ResolverBase {
    @Query(() => RunUserRecordLogViewResult)
    async RunUserRecordLogViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunUserRecordLogViewResult)
    async RunUserRecordLogViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunUserRecordLogViewResult)
    async RunUserRecordLogDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'User Record Logs';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => UserRecordLog_, { nullable: true })
    async UserRecordLog(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<UserRecordLog_ | null> {
        this.CheckUserReadPermissions('User Record Logs', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwUserRecordLogs] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('User Record Logs', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('User Record Logs', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => UserRecordLog_)
    async UpdateUserRecordLog(
        @Arg('input', () => UpdateUserRecordLogInput) input: UpdateUserRecordLogInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <UserRecordLogEntity>await new Metadata().GetEntityObject('User Record Logs', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for User Record Logs
            
            if (await entityObject.Save({ IgnoreDirtyState: true /*flag used because of LoadFromData() call above*/ })) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateUserRecordLogInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateUserRecordLogInput) {
        const i = input, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for User Views
//****************************************************************************
@ObjectType({ description: 'Views are sets of records within a given entity defined by filtering rules. Views can be used programatically to retrieve dynamic sets of data and in user interfaces like MJ Explorer for end-user consumption.' })
export class UserView_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field(() => Int) 
    UserID: number;
          
    @Field(() => Int) 
    EntityID: number;
          
    @Field() 
    @MaxLength(200)
    Name: string;
          
    @Field() 
    @MaxLength(16)
    GUID: string;
          
    @Field({nullable: true}) 
    Description?: string;
          
    @Field(() => Int, {nullable: true}) 
    CategoryID?: number;
          
    @Field(() => Boolean) 
    IsShared: boolean;
          
    @Field(() => Boolean) 
    IsDefault: boolean;
          
    @Field({nullable: true}) 
    GridState?: string;
          
    @Field({nullable: true}) 
    FilterState?: string;
          
    @Field(() => Boolean) 
    CustomFilterState: boolean;
          
    @Field(() => Boolean) 
    SmartFilterEnabled: boolean;
          
    @Field({nullable: true}) 
    SmartFilterPrompt?: string;
          
    @Field({nullable: true}) 
    SmartFilterWhereClause?: string;
          
    @Field({nullable: true}) 
    SmartFilterExplanation?: string;
          
    @Field({nullable: true}) 
    WhereClause?: string;
          
    @Field(() => Boolean) 
    CustomWhereClause: boolean;
          
    @Field({nullable: true}) 
    SortState?: string;
          
    @Field({nullable: true}) 
    @MaxLength(8)
    CreatedAt?: Date;
          
    @Field({nullable: true}) 
    @MaxLength(8)
    UpdatedAt?: Date;
          
    @Field() 
    @MaxLength(200)
    UserName: string;
          
    @Field({nullable: true}) 
    @MaxLength(202)
    UserFirstLast?: string;
          
    @Field() 
    @MaxLength(200)
    UserEmail: string;
          
    @Field() 
    @MaxLength(30)
    UserType: string;
          
    @Field() 
    @MaxLength(510)
    Entity: string;
          
    @Field() 
    @MaxLength(510)
    EntityBaseView: string;
        
    @Field(() => [mj_core_schema_server_object_types.EntityRelationship_])
    EntityRelationshipsArray: mj_core_schema_server_object_types.EntityRelationship_[]; // Link to EntityRelationships
    
    @Field(() => [mj_core_schema_server_object_types.UserViewRun_])
    UserViewRunsArray: mj_core_schema_server_object_types.UserViewRun_[]; // Link to UserViewRuns
    
    @Field(() => [mj_core_schema_server_object_types.DataContextItem_])
    DataContextItemsArray: mj_core_schema_server_object_types.DataContextItem_[]; // Link to DataContextItems
    
}
        
//****************************************************************************
// INPUT TYPE for User Views   
//****************************************************************************
@InputType()
export class CreateUserViewInput {
    @Field(() => Int)
    UserID: number;
    
    @Field(() => Int)
    EntityID: number;
    
    @Field()
    Name: string;
    
    @Field({ nullable: true })
    Description: string;
    
    @Field(() => Int, { nullable: true })
    CategoryID: number;
    
    @Field(() => Boolean)
    IsShared: boolean;
    
    @Field(() => Boolean)
    IsDefault: boolean;
    
    @Field({ nullable: true })
    GridState: string;
    
    @Field({ nullable: true })
    FilterState: string;
    
    @Field(() => Boolean)
    CustomFilterState: boolean;
    
    @Field(() => Boolean)
    SmartFilterEnabled: boolean;
    
    @Field({ nullable: true })
    SmartFilterPrompt: string;
    
    @Field({ nullable: true })
    SmartFilterWhereClause: string;
    
    @Field({ nullable: true })
    SmartFilterExplanation: string;
    
    @Field({ nullable: true })
    WhereClause: string;
    
    @Field(() => Boolean)
    CustomWhereClause: boolean;
    
    @Field({ nullable: true })
    SortState: string;
    }
    
        
//****************************************************************************
// INPUT TYPE for User Views   
//****************************************************************************
@InputType()
export class UpdateUserViewInput {
    @Field(() => Int)
    ID: number;
    
    @Field(() => Int)
    UserID: number;
    
    @Field(() => Int)
    EntityID: number;
    
    @Field()
    Name: string;
    
    @Field({ nullable: true })
    Description: string;
    
    @Field(() => Int, { nullable: true })
    CategoryID: number;
    
    @Field(() => Boolean)
    IsShared: boolean;
    
    @Field(() => Boolean)
    IsDefault: boolean;
    
    @Field({ nullable: true })
    GridState: string;
    
    @Field({ nullable: true })
    FilterState: string;
    
    @Field(() => Boolean)
    CustomFilterState: boolean;
    
    @Field(() => Boolean)
    SmartFilterEnabled: boolean;
    
    @Field({ nullable: true })
    SmartFilterPrompt: string;
    
    @Field({ nullable: true })
    SmartFilterWhereClause: string;
    
    @Field({ nullable: true })
    SmartFilterExplanation: string;
    
    @Field({ nullable: true })
    WhereClause: string;
    
    @Field(() => Boolean)
    CustomWhereClause: boolean;
    
    @Field({ nullable: true })
    SortState: string;
    }
    
//****************************************************************************
// RESOLVER for User Views
//****************************************************************************
@ObjectType()
export class RunUserViewViewResult {
    @Field(() => [UserView_])
    Results: UserView_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(UserView_)
export class UserViewResolverBase extends ResolverBase {
    @Query(() => RunUserViewViewResult)
    async RunUserViewViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunUserViewViewResult)
    async RunUserViewViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunUserViewViewResult)
    async RunUserViewDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'User Views';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => UserView_, { nullable: true })
    async UserView(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<UserView_ | null> {
        this.CheckUserReadPermissions('User Views', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwUserViews] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('User Views', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('User Views', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Query(() => [UserView_])
    async AllUserViews(@Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('User Views', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwUserViews]` + this.getRowLevelSecurityWhereClause('User Views', userPayload, EntityPermissionType.Read, ' WHERE');
        const result = this.ArrayMapFieldNamesToCodeNames('User Views', await dataSource.query(sSQL));
        return result;
    }
      
    @FieldResolver(() => [mj_core_schema_server_object_types.EntityRelationship_])
    async EntityRelationshipsArray(@Root() userview_: UserView_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Entity Relationships', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwEntityRelationships] WHERE [DisplayUserViewGUID]=${userview_.ID} ` + this.getRowLevelSecurityWhereClause('Entity Relationships', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Entity Relationships', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.UserViewRun_])
    async UserViewRunsArray(@Root() userview_: UserView_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('User View Runs', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwUserViewRuns] WHERE [UserViewID]=${userview_.ID} ` + this.getRowLevelSecurityWhereClause('User View Runs', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('User View Runs', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.DataContextItem_])
    async DataContextItemsArray(@Root() userview_: UserView_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Data Context Items', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwDataContextItems] WHERE [ViewID]=${userview_.ID} ` + this.getRowLevelSecurityWhereClause('Data Context Items', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Data Context Items', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => UserView_)
    async CreateUserView(
        @Arg('input', () => CreateUserViewInput) input: CreateUserViewInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <UserViewEntity>await new Metadata().GetEntityObject('User Views', this.GetUserFromPayload(userPayload));
            await entityObject.NewRecord();
            entityObject.SetMany(input);
            if (await entityObject.Save()) {
                // save worked, fire the AfterCreate event and then return all the data
                await this.AfterCreate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else 
                // save failed, return null
                return null;
        }
        else    
            return null;
    }

    // Before/After CREATE Event Hooks for Sub-Classes to Override
    protected async BeforeCreate(dataSource: DataSource, input: CreateUserViewInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateUserViewInput) {
    }
        
    @Mutation(() => UserView_)
    async UpdateUserView(
        @Arg('input', () => UpdateUserViewInput) input: UpdateUserViewInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <UserViewEntity>await new Metadata().GetEntityObject('User Views', this.GetUserFromPayload(userPayload));
            await entityObject.Load(input.ID) // Track Changes is turned on, so we need to get the latest data from DB first before we save
            entityObject.SetMany(input);
            if (await entityObject.Save()) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateUserViewInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateUserViewInput) {
        const i = input, d = dataSource; // prevent error
    }
    
    @Mutation(() => UserView_)
    async DeleteUserView(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        if (await this.BeforeDelete(dataSource, ID)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <UserViewEntity>await new Metadata().GetEntityObject('User Views', this.GetUserFromPayload(userPayload));
            await entityObject.Load(ID);
            const returnValue = entityObject.GetAll(); // grab the values before we delete so we can return last state before delete if we are successful.
            if (await entityObject.Delete()) {
                await this.AfterDelete(dataSource, ID); // fire event
                return returnValue;
            }
            else 
                return null; // delete failed, this will cause an exception
        }
        else
            return null; // BeforeDelete canceled the operation, this will cause an exception
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeDelete(dataSource: DataSource, ID: number): Promise<boolean> {
        const i = ID, d = dataSource; // prevent error;
        return true;
    }
    protected async AfterDelete(dataSource: DataSource, ID: number) {
        const i = ID, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for Company Integration Runs
//****************************************************************************
@ObjectType()
export class CompanyIntegrationRun_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field(() => Int) 
    CompanyIntegrationID: number;
          
    @Field(() => Int) 
    RunByUserID: number;
          
    @Field({nullable: true}) 
    @MaxLength(8)
    StartedAt?: Date;
          
    @Field({nullable: true}) 
    @MaxLength(8)
    EndedAt?: Date;
          
    @Field(() => Int) 
    TotalRecords: number;
          
    @Field({nullable: true}) 
    Comments?: string;
          
    @Field() 
    @MaxLength(200)
    RunByUser: string;
        
    @Field(() => [mj_core_schema_server_object_types.CompanyIntegrationRunAPILog_])
    CompanyIntegrationRunAPILogsArray: mj_core_schema_server_object_types.CompanyIntegrationRunAPILog_[]; // Link to CompanyIntegrationRunAPILogs
    
    @Field(() => [mj_core_schema_server_object_types.ErrorLog_])
    ErrorLogsArray: mj_core_schema_server_object_types.ErrorLog_[]; // Link to ErrorLogs
    
    @Field(() => [mj_core_schema_server_object_types.CompanyIntegrationRunDetail_])
    CompanyIntegrationRunDetailsArray: mj_core_schema_server_object_types.CompanyIntegrationRunDetail_[]; // Link to CompanyIntegrationRunDetails
    
}
        
//****************************************************************************
// INPUT TYPE for Company Integration Runs   
//****************************************************************************
@InputType()
export class UpdateCompanyIntegrationRunInput {
    @Field(() => Int)
    ID: number;
    
    @Field(() => Int)
    CompanyIntegrationID: number;
    
    @Field(() => Int)
    RunByUserID: number;
    
    @Field({ nullable: true })
    StartedAt: Date;
    
    @Field({ nullable: true })
    EndedAt: Date;
    
    @Field(() => Int)
    TotalRecords: number;
    
    @Field({ nullable: true })
    Comments: string;
    }
    
//****************************************************************************
// RESOLVER for Company Integration Runs
//****************************************************************************
@ObjectType()
export class RunCompanyIntegrationRunViewResult {
    @Field(() => [CompanyIntegrationRun_])
    Results: CompanyIntegrationRun_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(CompanyIntegrationRun_)
export class CompanyIntegrationRunResolver extends ResolverBase {
    @Query(() => RunCompanyIntegrationRunViewResult)
    async RunCompanyIntegrationRunViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunCompanyIntegrationRunViewResult)
    async RunCompanyIntegrationRunViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunCompanyIntegrationRunViewResult)
    async RunCompanyIntegrationRunDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Company Integration Runs';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => CompanyIntegrationRun_, { nullable: true })
    async CompanyIntegrationRun(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<CompanyIntegrationRun_ | null> {
        this.CheckUserReadPermissions('Company Integration Runs', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwCompanyIntegrationRuns] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Company Integration Runs', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Company Integration Runs', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
      
    @FieldResolver(() => [mj_core_schema_server_object_types.CompanyIntegrationRunAPILog_])
    async CompanyIntegrationRunAPILogsArray(@Root() companyintegrationrun_: CompanyIntegrationRun_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Company Integration Run API Logs', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwCompanyIntegrationRunAPILogs] WHERE [CompanyIntegrationRunID]=${companyintegrationrun_.ID} ` + this.getRowLevelSecurityWhereClause('Company Integration Run API Logs', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Company Integration Run API Logs', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.ErrorLog_])
    async ErrorLogsArray(@Root() companyintegrationrun_: CompanyIntegrationRun_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Error Logs', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwErrorLogs] WHERE [CompanyIntegrationRunID]=${companyintegrationrun_.ID} ` + this.getRowLevelSecurityWhereClause('Error Logs', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Error Logs', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.CompanyIntegrationRunDetail_])
    async CompanyIntegrationRunDetailsArray(@Root() companyintegrationrun_: CompanyIntegrationRun_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Company Integration Run Details', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwCompanyIntegrationRunDetails] WHERE [CompanyIntegrationRunID]=${companyintegrationrun_.ID} ` + this.getRowLevelSecurityWhereClause('Company Integration Run Details', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Company Integration Run Details', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => CompanyIntegrationRun_)
    async UpdateCompanyIntegrationRun(
        @Arg('input', () => UpdateCompanyIntegrationRunInput) input: UpdateCompanyIntegrationRunInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <CompanyIntegrationRunEntity>await new Metadata().GetEntityObject('Company Integration Runs', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for Company Integration Runs
            
            if (await entityObject.Save({ IgnoreDirtyState: true /*flag used because of LoadFromData() call above*/ })) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateCompanyIntegrationRunInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateCompanyIntegrationRunInput) {
        const i = input, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for Company Integration Run Details
//****************************************************************************
@ObjectType()
export class CompanyIntegrationRunDetail_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field(() => Int) 
    CompanyIntegrationRunID: number;
          
    @Field(() => Int) 
    EntityID: number;
          
    @Field() 
    @MaxLength(510)
    RecordID: string;
          
    @Field() 
    @MaxLength(40)
    Action: string;
          
    @Field() 
    @MaxLength(8)
    ExecutedAt: Date;
          
    @Field(() => Boolean) 
    IsSuccess: boolean;
          
    @Field() 
    @MaxLength(510)
    Entity: string;
          
    @Field({nullable: true}) 
    @MaxLength(8)
    RunStartedAt?: Date;
          
    @Field({nullable: true}) 
    @MaxLength(8)
    RunEndedAt?: Date;
        
    @Field(() => [mj_core_schema_server_object_types.ErrorLog_])
    ErrorLogsArray: mj_core_schema_server_object_types.ErrorLog_[]; // Link to ErrorLogs
    
}
        
//****************************************************************************
// INPUT TYPE for Company Integration Run Details   
//****************************************************************************
@InputType()
export class UpdateCompanyIntegrationRunDetailInput {
    @Field(() => Int)
    ID: number;
    
    @Field(() => Int)
    CompanyIntegrationRunID: number;
    
    @Field(() => Int)
    EntityID: number;
    
    @Field()
    RecordID: string;
    
    @Field()
    Action: string;
    
    @Field()
    ExecutedAt: Date;
    
    @Field(() => Boolean)
    IsSuccess: boolean;
    }
    
//****************************************************************************
// RESOLVER for Company Integration Run Details
//****************************************************************************
@ObjectType()
export class RunCompanyIntegrationRunDetailViewResult {
    @Field(() => [CompanyIntegrationRunDetail_])
    Results: CompanyIntegrationRunDetail_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(CompanyIntegrationRunDetail_)
export class CompanyIntegrationRunDetailResolver extends ResolverBase {
    @Query(() => RunCompanyIntegrationRunDetailViewResult)
    async RunCompanyIntegrationRunDetailViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunCompanyIntegrationRunDetailViewResult)
    async RunCompanyIntegrationRunDetailViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunCompanyIntegrationRunDetailViewResult)
    async RunCompanyIntegrationRunDetailDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Company Integration Run Details';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => CompanyIntegrationRunDetail_, { nullable: true })
    async CompanyIntegrationRunDetail(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<CompanyIntegrationRunDetail_ | null> {
        this.CheckUserReadPermissions('Company Integration Run Details', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwCompanyIntegrationRunDetails] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Company Integration Run Details', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Company Integration Run Details', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
      
    @FieldResolver(() => [mj_core_schema_server_object_types.ErrorLog_])
    async ErrorLogsArray(@Root() companyintegrationrundetail_: CompanyIntegrationRunDetail_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Error Logs', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwErrorLogs] WHERE [CompanyIntegrationRunDetailID]=${companyintegrationrundetail_.ID} ` + this.getRowLevelSecurityWhereClause('Error Logs', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Error Logs', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => CompanyIntegrationRunDetail_)
    async UpdateCompanyIntegrationRunDetail(
        @Arg('input', () => UpdateCompanyIntegrationRunDetailInput) input: UpdateCompanyIntegrationRunDetailInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <CompanyIntegrationRunDetailEntity>await new Metadata().GetEntityObject('Company Integration Run Details', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for Company Integration Run Details
            
            if (await entityObject.Save({ IgnoreDirtyState: true /*flag used because of LoadFromData() call above*/ })) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateCompanyIntegrationRunDetailInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateCompanyIntegrationRunDetailInput) {
        const i = input, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for Error Logs
//****************************************************************************
@ObjectType()
export class ErrorLog_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field(() => Int, {nullable: true}) 
    CompanyIntegrationRunID?: number;
          
    @Field(() => Int, {nullable: true}) 
    CompanyIntegrationRunDetailID?: number;
          
    @Field({nullable: true}) 
    @MaxLength(40)
    Code?: string;
          
    @Field({nullable: true}) 
    Message?: string;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field({nullable: true}) 
    @MaxLength(100)
    CreatedBy?: string;
          
    @Field({nullable: true}) 
    @MaxLength(20)
    Status?: string;
          
    @Field({nullable: true}) 
    @MaxLength(40)
    Category?: string;
          
    @Field({nullable: true}) 
    Details?: string;
        
}
        
//****************************************************************************
// INPUT TYPE for Error Logs   
//****************************************************************************
@InputType()
export class UpdateErrorLogInput {
    @Field(() => Int)
    ID: number;
    
    @Field(() => Int, { nullable: true })
    CompanyIntegrationRunID: number;
    
    @Field(() => Int, { nullable: true })
    CompanyIntegrationRunDetailID: number;
    
    @Field({ nullable: true })
    Code: string;
    
    @Field({ nullable: true })
    Message: string;
    
    @Field({ nullable: true })
    CreatedBy: string;
    
    @Field({ nullable: true })
    Status: string;
    
    @Field({ nullable: true })
    Category: string;
    
    @Field({ nullable: true })
    Details: string;
    }
    
//****************************************************************************
// RESOLVER for Error Logs
//****************************************************************************
@ObjectType()
export class RunErrorLogViewResult {
    @Field(() => [ErrorLog_])
    Results: ErrorLog_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(ErrorLog_)
export class ErrorLogResolver extends ResolverBase {
    @Query(() => RunErrorLogViewResult)
    async RunErrorLogViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunErrorLogViewResult)
    async RunErrorLogViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunErrorLogViewResult)
    async RunErrorLogDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Error Logs';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => ErrorLog_, { nullable: true })
    async ErrorLog(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<ErrorLog_ | null> {
        this.CheckUserReadPermissions('Error Logs', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwErrorLogs] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Error Logs', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Error Logs', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => ErrorLog_)
    async UpdateErrorLog(
        @Arg('input', () => UpdateErrorLogInput) input: UpdateErrorLogInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <ErrorLogEntity>await new Metadata().GetEntityObject('Error Logs', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for Error Logs
            
            if (await entityObject.Save({ IgnoreDirtyState: true /*flag used because of LoadFromData() call above*/ })) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateErrorLogInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateErrorLogInput) {
        const i = input, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for Applications
//****************************************************************************
@ObjectType({ description: 'Applications are used to group entities in the user interface for ease of user access' })
export class Application_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field() 
    @MaxLength(100)
    Name: string;
          
    @Field({nullable: true}) 
    @MaxLength(1000)
    Description?: string;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
        
    @Field(() => [mj_core_schema_server_object_types.ApplicationEntity_])
    ApplicationEntitiesArray: mj_core_schema_server_object_types.ApplicationEntity_[]; // Link to ApplicationEntities
    
    @Field(() => [mj_core_schema_server_object_types.UserApplication_])
    UserApplicationsArray: mj_core_schema_server_object_types.UserApplication_[]; // Link to UserApplications
    
}
        
//****************************************************************************
// INPUT TYPE for Applications   
//****************************************************************************
@InputType()
export class CreateApplicationInput {
    @Field()
    Name: string;
    
    @Field({ nullable: true })
    Description: string;
    }
    
        
//****************************************************************************
// INPUT TYPE for Applications   
//****************************************************************************
@InputType()
export class UpdateApplicationInput {
    @Field(() => Int)
    ID: number;
    
    @Field()
    Name: string;
    
    @Field({ nullable: true })
    Description: string;
    }
    
//****************************************************************************
// RESOLVER for Applications
//****************************************************************************
@ObjectType()
export class RunApplicationViewResult {
    @Field(() => [Application_])
    Results: Application_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(Application_)
export class ApplicationResolver extends ResolverBase {
    @Query(() => RunApplicationViewResult)
    async RunApplicationViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunApplicationViewResult)
    async RunApplicationViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunApplicationViewResult)
    async RunApplicationDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Applications';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => Application_, { nullable: true })
    async Application(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Application_ | null> {
        this.CheckUserReadPermissions('Applications', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwApplications] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Applications', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Applications', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Query(() => [Application_])
    async AllApplications(@Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Applications', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwApplications]` + this.getRowLevelSecurityWhereClause('Applications', userPayload, EntityPermissionType.Read, ' WHERE');
        const result = this.ArrayMapFieldNamesToCodeNames('Applications', await dataSource.query(sSQL));
        return result;
    }
      
    @FieldResolver(() => [mj_core_schema_server_object_types.ApplicationEntity_])
    async ApplicationEntitiesArray(@Root() application_: Application_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Application Entities', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwApplicationEntities] WHERE [ApplicationID]=${application_.ID} ` + this.getRowLevelSecurityWhereClause('Application Entities', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Application Entities', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.UserApplication_])
    async UserApplicationsArray(@Root() application_: Application_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('User Applications', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwUserApplications] WHERE [ApplicationID]=${application_.ID} ` + this.getRowLevelSecurityWhereClause('User Applications', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('User Applications', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => Application_)
    async CreateApplication(
        @Arg('input', () => CreateApplicationInput) input: CreateApplicationInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <ApplicationEntity>await new Metadata().GetEntityObject('Applications', this.GetUserFromPayload(userPayload));
            await entityObject.NewRecord();
            entityObject.SetMany(input);
            if (await entityObject.Save()) {
                // save worked, fire the AfterCreate event and then return all the data
                await this.AfterCreate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else 
                // save failed, return null
                return null;
        }
        else    
            return null;
    }

    // Before/After CREATE Event Hooks for Sub-Classes to Override
    protected async BeforeCreate(dataSource: DataSource, input: CreateApplicationInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateApplicationInput) {
    }
        
    @Mutation(() => Application_)
    async UpdateApplication(
        @Arg('input', () => UpdateApplicationInput) input: UpdateApplicationInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <ApplicationEntity>await new Metadata().GetEntityObject('Applications', this.GetUserFromPayload(userPayload));
            await entityObject.Load(input.ID) // Track Changes is turned on, so we need to get the latest data from DB first before we save
            entityObject.SetMany(input);
            if (await entityObject.Save()) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateApplicationInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateApplicationInput) {
        const i = input, d = dataSource; // prevent error
    }
    
    @Mutation(() => Application_)
    async DeleteApplication(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        if (await this.BeforeDelete(dataSource, ID)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <ApplicationEntity>await new Metadata().GetEntityObject('Applications', this.GetUserFromPayload(userPayload));
            await entityObject.Load(ID);
            const returnValue = entityObject.GetAll(); // grab the values before we delete so we can return last state before delete if we are successful.
            if (await entityObject.Delete()) {
                await this.AfterDelete(dataSource, ID); // fire event
                return returnValue;
            }
            else 
                return null; // delete failed, this will cause an exception
        }
        else
            return null; // BeforeDelete canceled the operation, this will cause an exception
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeDelete(dataSource: DataSource, ID: number): Promise<boolean> {
        const i = ID, d = dataSource; // prevent error;
        return true;
    }
    protected async AfterDelete(dataSource: DataSource, ID: number) {
        const i = ID, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for Application Entities
//****************************************************************************
@ObjectType({ description: 'List of entities within each application. An application can have any number of entities and an entity can be part of any number of applications.' })
export class ApplicationEntity_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field({nullable: true}) 
    @MaxLength(100)
    ApplicationName?: string;
          
    @Field(() => Int) 
    EntityID: number;
          
    @Field(() => Int) 
    Sequence: number;
          
    @Field(() => Boolean) 
    DefaultForNewUser: boolean;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
          
    @Field() 
    @MaxLength(100)
    Application: string;
          
    @Field() 
    @MaxLength(510)
    Entity: string;
          
    @Field() 
    @MaxLength(510)
    EntityBaseTable: string;
          
    @Field({nullable: true}) 
    @MaxLength(8000)
    EntityCodeName?: string;
          
    @Field({nullable: true}) 
    @MaxLength(8000)
    EntityClassName?: string;
          
    @Field({nullable: true}) 
    @MaxLength(8000)
    EntityBaseTableCodeName?: string;
        
}
        
//****************************************************************************
// INPUT TYPE for Application Entities   
//****************************************************************************
@InputType()
export class CreateApplicationEntityInput {
    @Field({ nullable: true })
    ApplicationName: string;
    
    @Field(() => Int)
    EntityID: number;
    
    @Field(() => Int)
    Sequence: number;
    
    @Field(() => Boolean)
    DefaultForNewUser: boolean;
    }
    
        
//****************************************************************************
// INPUT TYPE for Application Entities   
//****************************************************************************
@InputType()
export class UpdateApplicationEntityInput {
    @Field(() => Int)
    ID: number;
    
    @Field({ nullable: true })
    ApplicationName: string;
    
    @Field(() => Int)
    EntityID: number;
    
    @Field(() => Int)
    Sequence: number;
    
    @Field(() => Boolean)
    DefaultForNewUser: boolean;
    }
    
//****************************************************************************
// RESOLVER for Application Entities
//****************************************************************************
@ObjectType()
export class RunApplicationEntityViewResult {
    @Field(() => [ApplicationEntity_])
    Results: ApplicationEntity_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(ApplicationEntity_)
export class ApplicationEntityResolver extends ResolverBase {
    @Query(() => RunApplicationEntityViewResult)
    async RunApplicationEntityViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunApplicationEntityViewResult)
    async RunApplicationEntityViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunApplicationEntityViewResult)
    async RunApplicationEntityDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Application Entities';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => ApplicationEntity_, { nullable: true })
    async ApplicationEntity(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<ApplicationEntity_ | null> {
        this.CheckUserReadPermissions('Application Entities', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwApplicationEntities] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Application Entities', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Application Entities', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => ApplicationEntity_)
    async CreateApplicationEntity(
        @Arg('input', () => CreateApplicationEntityInput) input: CreateApplicationEntityInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <ApplicationEntityEntity>await new Metadata().GetEntityObject('Application Entities', this.GetUserFromPayload(userPayload));
            await entityObject.NewRecord();
            entityObject.SetMany(input);
            if (await entityObject.Save()) {
                // save worked, fire the AfterCreate event and then return all the data
                await this.AfterCreate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else 
                // save failed, return null
                return null;
        }
        else    
            return null;
    }

    // Before/After CREATE Event Hooks for Sub-Classes to Override
    protected async BeforeCreate(dataSource: DataSource, input: CreateApplicationEntityInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateApplicationEntityInput) {
    }
        
    @Mutation(() => ApplicationEntity_)
    async UpdateApplicationEntity(
        @Arg('input', () => UpdateApplicationEntityInput) input: UpdateApplicationEntityInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <ApplicationEntityEntity>await new Metadata().GetEntityObject('Application Entities', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for Application Entities
            
            if (await entityObject.Save({ IgnoreDirtyState: true /*flag used because of LoadFromData() call above*/ })) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateApplicationEntityInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateApplicationEntityInput) {
        const i = input, d = dataSource; // prevent error
    }
    
    @Mutation(() => ApplicationEntity_)
    async DeleteApplicationEntity(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        if (await this.BeforeDelete(dataSource, ID)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <ApplicationEntityEntity>await new Metadata().GetEntityObject('Application Entities', this.GetUserFromPayload(userPayload));
            await entityObject.Load(ID);
            const returnValue = entityObject.GetAll(); // grab the values before we delete so we can return last state before delete if we are successful.
            if (await entityObject.Delete()) {
                await this.AfterDelete(dataSource, ID); // fire event
                return returnValue;
            }
            else 
                return null; // delete failed, this will cause an exception
        }
        else
            return null; // BeforeDelete canceled the operation, this will cause an exception
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeDelete(dataSource: DataSource, ID: number): Promise<boolean> {
        const i = ID, d = dataSource; // prevent error;
        return true;
    }
    protected async AfterDelete(dataSource: DataSource, ID: number) {
        const i = ID, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for Entity Permissions
//****************************************************************************
@ObjectType({ description: 'Security settings for each entity' })
export class EntityPermission_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field(() => Int) 
    EntityID: number;
          
    @Field({nullable: true}) 
    @MaxLength(100)
    RoleName?: string;
          
    @Field(() => Boolean) 
    CanCreate: boolean;
          
    @Field(() => Boolean) 
    CanRead: boolean;
          
    @Field(() => Boolean) 
    CanUpdate: boolean;
          
    @Field(() => Boolean) 
    CanDelete: boolean;
          
    @Field(() => Int, {nullable: true}) 
    ReadRLSFilterID?: number;
          
    @Field(() => Int, {nullable: true}) 
    CreateRLSFilterID?: number;
          
    @Field(() => Int, {nullable: true}) 
    UpdateRLSFilterID?: number;
          
    @Field(() => Int, {nullable: true}) 
    DeleteRLSFilterID?: number;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
          
    @Field() 
    @MaxLength(510)
    Entity: string;
          
    @Field({nullable: true}) 
    @MaxLength(500)
    RoleSQLName?: string;
          
    @Field({nullable: true}) 
    @MaxLength(200)
    CreateRLSFilter?: string;
          
    @Field({nullable: true}) 
    @MaxLength(200)
    ReadRLSFilter?: string;
          
    @Field({nullable: true}) 
    @MaxLength(200)
    UpdateRLSFilter?: string;
          
    @Field({nullable: true}) 
    @MaxLength(200)
    DeleteRLSFilter?: string;
        
}
        
//****************************************************************************
// INPUT TYPE for Entity Permissions   
//****************************************************************************
@InputType()
export class CreateEntityPermissionInput {
    @Field(() => Int)
    EntityID: number;
    
    @Field({ nullable: true })
    RoleName: string;
    
    @Field(() => Boolean)
    CanCreate: boolean;
    
    @Field(() => Boolean)
    CanRead: boolean;
    
    @Field(() => Boolean)
    CanUpdate: boolean;
    
    @Field(() => Boolean)
    CanDelete: boolean;
    
    @Field(() => Int, { nullable: true })
    ReadRLSFilterID: number;
    
    @Field(() => Int, { nullable: true })
    CreateRLSFilterID: number;
    
    @Field(() => Int, { nullable: true })
    UpdateRLSFilterID: number;
    
    @Field(() => Int, { nullable: true })
    DeleteRLSFilterID: number;
    }
    
        
//****************************************************************************
// INPUT TYPE for Entity Permissions   
//****************************************************************************
@InputType()
export class UpdateEntityPermissionInput {
    @Field(() => Int)
    ID: number;
    
    @Field(() => Int)
    EntityID: number;
    
    @Field({ nullable: true })
    RoleName: string;
    
    @Field(() => Boolean)
    CanCreate: boolean;
    
    @Field(() => Boolean)
    CanRead: boolean;
    
    @Field(() => Boolean)
    CanUpdate: boolean;
    
    @Field(() => Boolean)
    CanDelete: boolean;
    
    @Field(() => Int, { nullable: true })
    ReadRLSFilterID: number;
    
    @Field(() => Int, { nullable: true })
    CreateRLSFilterID: number;
    
    @Field(() => Int, { nullable: true })
    UpdateRLSFilterID: number;
    
    @Field(() => Int, { nullable: true })
    DeleteRLSFilterID: number;
    }
    
//****************************************************************************
// RESOLVER for Entity Permissions
//****************************************************************************
@ObjectType()
export class RunEntityPermissionViewResult {
    @Field(() => [EntityPermission_])
    Results: EntityPermission_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(EntityPermission_)
export class EntityPermissionResolver extends ResolverBase {
    @Query(() => RunEntityPermissionViewResult)
    async RunEntityPermissionViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunEntityPermissionViewResult)
    async RunEntityPermissionViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunEntityPermissionViewResult)
    async RunEntityPermissionDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Entity Permissions';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => EntityPermission_, { nullable: true })
    async EntityPermission(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<EntityPermission_ | null> {
        this.CheckUserReadPermissions('Entity Permissions', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwEntityPermissions] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Entity Permissions', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Entity Permissions', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Query(() => [EntityPermission_])
    async AllEntityPermissions(@Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Entity Permissions', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwEntityPermissions]` + this.getRowLevelSecurityWhereClause('Entity Permissions', userPayload, EntityPermissionType.Read, ' WHERE');
        const result = this.ArrayMapFieldNamesToCodeNames('Entity Permissions', await dataSource.query(sSQL));
        return result;
    }
    
    @Mutation(() => EntityPermission_)
    async CreateEntityPermission(
        @Arg('input', () => CreateEntityPermissionInput) input: CreateEntityPermissionInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <EntityPermissionEntity>await new Metadata().GetEntityObject('Entity Permissions', this.GetUserFromPayload(userPayload));
            await entityObject.NewRecord();
            entityObject.SetMany(input);
            if (await entityObject.Save()) {
                // save worked, fire the AfterCreate event and then return all the data
                await this.AfterCreate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else 
                // save failed, return null
                return null;
        }
        else    
            return null;
    }

    // Before/After CREATE Event Hooks for Sub-Classes to Override
    protected async BeforeCreate(dataSource: DataSource, input: CreateEntityPermissionInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateEntityPermissionInput) {
    }
        
    @Mutation(() => EntityPermission_)
    async UpdateEntityPermission(
        @Arg('input', () => UpdateEntityPermissionInput) input: UpdateEntityPermissionInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <EntityPermissionEntity>await new Metadata().GetEntityObject('Entity Permissions', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for Entity Permissions
            
            if (await entityObject.Save({ IgnoreDirtyState: true /*flag used because of LoadFromData() call above*/ })) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateEntityPermissionInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateEntityPermissionInput) {
        const i = input, d = dataSource; // prevent error
    }
    
    @Mutation(() => EntityPermission_)
    async DeleteEntityPermission(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        if (await this.BeforeDelete(dataSource, ID)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <EntityPermissionEntity>await new Metadata().GetEntityObject('Entity Permissions', this.GetUserFromPayload(userPayload));
            await entityObject.Load(ID);
            const returnValue = entityObject.GetAll(); // grab the values before we delete so we can return last state before delete if we are successful.
            if (await entityObject.Delete()) {
                await this.AfterDelete(dataSource, ID); // fire event
                return returnValue;
            }
            else 
                return null; // delete failed, this will cause an exception
        }
        else
            return null; // BeforeDelete canceled the operation, this will cause an exception
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeDelete(dataSource: DataSource, ID: number): Promise<boolean> {
        const i = ID, d = dataSource; // prevent error;
        return true;
    }
    protected async AfterDelete(dataSource: DataSource, ID: number) {
        const i = ID, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for User Application Entities
//****************************************************************************
@ObjectType()
export class UserApplicationEntity_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field(() => Int) 
    UserApplicationID: number;
          
    @Field(() => Int) 
    EntityID: number;
          
    @Field(() => Int) 
    Sequence: number;
          
    @Field() 
    @MaxLength(100)
    Application: string;
          
    @Field() 
    @MaxLength(200)
    User: string;
          
    @Field() 
    @MaxLength(510)
    Entity: string;
        
}
        
//****************************************************************************
// INPUT TYPE for User Application Entities   
//****************************************************************************
@InputType()
export class CreateUserApplicationEntityInput {
    @Field(() => Int)
    UserApplicationID: number;
    
    @Field(() => Int)
    EntityID: number;
    
    @Field(() => Int)
    Sequence: number;
    }
    
        
//****************************************************************************
// INPUT TYPE for User Application Entities   
//****************************************************************************
@InputType()
export class UpdateUserApplicationEntityInput {
    @Field(() => Int)
    ID: number;
    
    @Field(() => Int)
    UserApplicationID: number;
    
    @Field(() => Int)
    EntityID: number;
    
    @Field(() => Int)
    Sequence: number;
    }
    
//****************************************************************************
// RESOLVER for User Application Entities
//****************************************************************************
@ObjectType()
export class RunUserApplicationEntityViewResult {
    @Field(() => [UserApplicationEntity_])
    Results: UserApplicationEntity_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(UserApplicationEntity_)
export class UserApplicationEntityResolver extends ResolverBase {
    @Query(() => RunUserApplicationEntityViewResult)
    async RunUserApplicationEntityViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunUserApplicationEntityViewResult)
    async RunUserApplicationEntityViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunUserApplicationEntityViewResult)
    async RunUserApplicationEntityDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'User Application Entities';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => UserApplicationEntity_, { nullable: true })
    async UserApplicationEntity(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<UserApplicationEntity_ | null> {
        this.CheckUserReadPermissions('User Application Entities', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwUserApplicationEntities] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('User Application Entities', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('User Application Entities', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => UserApplicationEntity_)
    async CreateUserApplicationEntity(
        @Arg('input', () => CreateUserApplicationEntityInput) input: CreateUserApplicationEntityInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <UserApplicationEntityEntity>await new Metadata().GetEntityObject('User Application Entities', this.GetUserFromPayload(userPayload));
            await entityObject.NewRecord();
            entityObject.SetMany(input);
            if (await entityObject.Save()) {
                // save worked, fire the AfterCreate event and then return all the data
                await this.AfterCreate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else 
                // save failed, return null
                return null;
        }
        else    
            return null;
    }

    // Before/After CREATE Event Hooks for Sub-Classes to Override
    protected async BeforeCreate(dataSource: DataSource, input: CreateUserApplicationEntityInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateUserApplicationEntityInput) {
    }
        
    @Mutation(() => UserApplicationEntity_)
    async UpdateUserApplicationEntity(
        @Arg('input', () => UpdateUserApplicationEntityInput) input: UpdateUserApplicationEntityInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <UserApplicationEntityEntity>await new Metadata().GetEntityObject('User Application Entities', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for User Application Entities
            
            if (await entityObject.Save({ IgnoreDirtyState: true /*flag used because of LoadFromData() call above*/ })) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateUserApplicationEntityInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateUserApplicationEntityInput) {
        const i = input, d = dataSource; // prevent error
    }
    
    @Mutation(() => UserApplicationEntity_)
    async DeleteUserApplicationEntity(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        if (await this.BeforeDelete(dataSource, ID)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <UserApplicationEntityEntity>await new Metadata().GetEntityObject('User Application Entities', this.GetUserFromPayload(userPayload));
            await entityObject.Load(ID);
            const returnValue = entityObject.GetAll(); // grab the values before we delete so we can return last state before delete if we are successful.
            if (await entityObject.Delete()) {
                await this.AfterDelete(dataSource, ID); // fire event
                return returnValue;
            }
            else 
                return null; // delete failed, this will cause an exception
        }
        else
            return null; // BeforeDelete canceled the operation, this will cause an exception
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeDelete(dataSource: DataSource, ID: number): Promise<boolean> {
        const i = ID, d = dataSource; // prevent error;
        return true;
    }
    protected async AfterDelete(dataSource: DataSource, ID: number) {
        const i = ID, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for User Applications
//****************************************************************************
@ObjectType()
export class UserApplication_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field(() => Int) 
    UserID: number;
          
    @Field(() => Int) 
    ApplicationID: number;
          
    @Field(() => Int) 
    Sequence: number;
          
    @Field(() => Boolean) 
    IsActive: boolean;
          
    @Field() 
    @MaxLength(200)
    User: string;
          
    @Field() 
    @MaxLength(100)
    Application: string;
        
    @Field(() => [mj_core_schema_server_object_types.UserApplicationEntity_])
    UserApplicationEntitiesArray: mj_core_schema_server_object_types.UserApplicationEntity_[]; // Link to UserApplicationEntities
    
}
        
//****************************************************************************
// INPUT TYPE for User Applications   
//****************************************************************************
@InputType()
export class UpdateUserApplicationInput {
    @Field(() => Int)
    ID: number;
    
    @Field(() => Int)
    UserID: number;
    
    @Field(() => Int)
    ApplicationID: number;
    
    @Field(() => Int)
    Sequence: number;
    
    @Field(() => Boolean)
    IsActive: boolean;
    }
    
//****************************************************************************
// RESOLVER for User Applications
//****************************************************************************
@ObjectType()
export class RunUserApplicationViewResult {
    @Field(() => [UserApplication_])
    Results: UserApplication_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(UserApplication_)
export class UserApplicationResolver extends ResolverBase {
    @Query(() => RunUserApplicationViewResult)
    async RunUserApplicationViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunUserApplicationViewResult)
    async RunUserApplicationViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunUserApplicationViewResult)
    async RunUserApplicationDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'User Applications';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => UserApplication_, { nullable: true })
    async UserApplication(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<UserApplication_ | null> {
        this.CheckUserReadPermissions('User Applications', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwUserApplications] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('User Applications', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('User Applications', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
      
    @FieldResolver(() => [mj_core_schema_server_object_types.UserApplicationEntity_])
    async UserApplicationEntitiesArray(@Root() userapplication_: UserApplication_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('User Application Entities', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwUserApplicationEntities] WHERE [UserApplicationID]=${userapplication_.ID} ` + this.getRowLevelSecurityWhereClause('User Application Entities', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('User Application Entities', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => UserApplication_)
    async UpdateUserApplication(
        @Arg('input', () => UpdateUserApplicationInput) input: UpdateUserApplicationInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <UserApplicationEntity>await new Metadata().GetEntityObject('User Applications', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for User Applications
            
            if (await entityObject.Save({ IgnoreDirtyState: true /*flag used because of LoadFromData() call above*/ })) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateUserApplicationInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateUserApplicationInput) {
        const i = input, d = dataSource; // prevent error
    }
    
    @Mutation(() => UserApplication_)
    async DeleteUserApplication(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        if (await this.BeforeDelete(dataSource, ID)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <UserApplicationEntity>await new Metadata().GetEntityObject('User Applications', this.GetUserFromPayload(userPayload));
            await entityObject.Load(ID);
            const returnValue = entityObject.GetAll(); // grab the values before we delete so we can return last state before delete if we are successful.
            if (await entityObject.Delete()) {
                await this.AfterDelete(dataSource, ID); // fire event
                return returnValue;
            }
            else 
                return null; // delete failed, this will cause an exception
        }
        else
            return null; // BeforeDelete canceled the operation, this will cause an exception
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeDelete(dataSource: DataSource, ID: number): Promise<boolean> {
        const i = ID, d = dataSource; // prevent error;
        return true;
    }
    protected async AfterDelete(dataSource: DataSource, ID: number) {
        const i = ID, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for Company Integration Run API Logs
//****************************************************************************
@ObjectType()
export class CompanyIntegrationRunAPILog_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field(() => Int) 
    CompanyIntegrationRunID: number;
          
    @Field() 
    @MaxLength(8)
    ExecutedAt: Date;
          
    @Field(() => Boolean) 
    IsSuccess: boolean;
          
    @Field({nullable: true}) 
    @MaxLength(24)
    RequestMethod?: string;
          
    @Field({nullable: true}) 
    URL?: string;
          
    @Field({nullable: true}) 
    Parameters?: string;
        
}
        
//****************************************************************************
// INPUT TYPE for Company Integration Run API Logs   
//****************************************************************************
@InputType()
export class UpdateCompanyIntegrationRunAPILogInput {
    @Field(() => Int)
    ID: number;
    
    @Field(() => Int)
    CompanyIntegrationRunID: number;
    
    @Field()
    ExecutedAt: Date;
    
    @Field(() => Boolean)
    IsSuccess: boolean;
    
    @Field({ nullable: true })
    RequestMethod: string;
    
    @Field({ nullable: true })
    URL: string;
    
    @Field({ nullable: true })
    Parameters: string;
    }
    
//****************************************************************************
// RESOLVER for Company Integration Run API Logs
//****************************************************************************
@ObjectType()
export class RunCompanyIntegrationRunAPILogViewResult {
    @Field(() => [CompanyIntegrationRunAPILog_])
    Results: CompanyIntegrationRunAPILog_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(CompanyIntegrationRunAPILog_)
export class CompanyIntegrationRunAPILogResolver extends ResolverBase {
    @Query(() => RunCompanyIntegrationRunAPILogViewResult)
    async RunCompanyIntegrationRunAPILogViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunCompanyIntegrationRunAPILogViewResult)
    async RunCompanyIntegrationRunAPILogViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunCompanyIntegrationRunAPILogViewResult)
    async RunCompanyIntegrationRunAPILogDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Company Integration Run API Logs';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => CompanyIntegrationRunAPILog_, { nullable: true })
    async CompanyIntegrationRunAPILog(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<CompanyIntegrationRunAPILog_ | null> {
        this.CheckUserReadPermissions('Company Integration Run API Logs', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwCompanyIntegrationRunAPILogs] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Company Integration Run API Logs', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Company Integration Run API Logs', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => CompanyIntegrationRunAPILog_)
    async UpdateCompanyIntegrationRunAPILog(
        @Arg('input', () => UpdateCompanyIntegrationRunAPILogInput) input: UpdateCompanyIntegrationRunAPILogInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <CompanyIntegrationRunAPILogEntity>await new Metadata().GetEntityObject('Company Integration Run API Logs', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for Company Integration Run API Logs
            
            if (await entityObject.Save({ IgnoreDirtyState: true /*flag used because of LoadFromData() call above*/ })) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateCompanyIntegrationRunAPILogInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateCompanyIntegrationRunAPILogInput) {
        const i = input, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for Lists
//****************************************************************************
@ObjectType({ description: 'Static lists are useful for controlling a set of data for a given entity. These can be used programatically for applications like logging and tracking long-running tasks and also by end users for tracking any particular list of records they want to directly control the set.' })
export class List_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field() 
    @MaxLength(200)
    Name: string;
          
    @Field({nullable: true}) 
    Description?: string;
          
    @Field(() => Int, {nullable: true}) 
    EntityID?: number;
          
    @Field(() => Int) 
    UserID: number;
          
    @Field({nullable: true}) 
    @MaxLength(200)
    ExternalSystemRecordID?: string;
          
    @Field(() => Int, {nullable: true}) 
    CompanyIntegrationID?: number;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
          
    @Field({nullable: true}) 
    @MaxLength(510)
    Entity?: string;
          
    @Field() 
    @MaxLength(200)
    User: string;
        
    @Field(() => [mj_core_schema_server_object_types.ListDetail_])
    ListDetailsArray: mj_core_schema_server_object_types.ListDetail_[]; // Link to ListDetails
    
}
        
//****************************************************************************
// INPUT TYPE for Lists   
//****************************************************************************
@InputType()
export class CreateListInput {
    @Field()
    Name: string;
    
    @Field({ nullable: true })
    Description: string;
    
    @Field(() => Int, { nullable: true })
    EntityID: number;
    
    @Field(() => Int)
    UserID: number;
    
    @Field({ nullable: true })
    ExternalSystemRecordID: string;
    
    @Field(() => Int, { nullable: true })
    CompanyIntegrationID: number;
    }
    
        
//****************************************************************************
// INPUT TYPE for Lists   
//****************************************************************************
@InputType()
export class UpdateListInput {
    @Field(() => Int)
    ID: number;
    
    @Field()
    Name: string;
    
    @Field({ nullable: true })
    Description: string;
    
    @Field(() => Int, { nullable: true })
    EntityID: number;
    
    @Field(() => Int)
    UserID: number;
    
    @Field({ nullable: true })
    ExternalSystemRecordID: string;
    
    @Field(() => Int, { nullable: true })
    CompanyIntegrationID: number;
    }
    
//****************************************************************************
// RESOLVER for Lists
//****************************************************************************
@ObjectType()
export class RunListViewResult {
    @Field(() => [List_])
    Results: List_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(List_)
export class ListResolver extends ResolverBase {
    @Query(() => RunListViewResult)
    async RunListViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunListViewResult)
    async RunListViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunListViewResult)
    async RunListDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Lists';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => List_, { nullable: true })
    async List(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<List_ | null> {
        this.CheckUserReadPermissions('Lists', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwLists] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Lists', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Lists', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
      
    @FieldResolver(() => [mj_core_schema_server_object_types.ListDetail_])
    async ListDetailsArray(@Root() list_: List_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('List Details', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwListDetails] WHERE [ListID]=${list_.ID} ` + this.getRowLevelSecurityWhereClause('List Details', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('List Details', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => List_)
    async CreateList(
        @Arg('input', () => CreateListInput) input: CreateListInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <ListEntity>await new Metadata().GetEntityObject('Lists', this.GetUserFromPayload(userPayload));
            await entityObject.NewRecord();
            entityObject.SetMany(input);
            if (await entityObject.Save()) {
                // save worked, fire the AfterCreate event and then return all the data
                await this.AfterCreate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else 
                // save failed, return null
                return null;
        }
        else    
            return null;
    }

    // Before/After CREATE Event Hooks for Sub-Classes to Override
    protected async BeforeCreate(dataSource: DataSource, input: CreateListInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateListInput) {
    }
        
    @Mutation(() => List_)
    async UpdateList(
        @Arg('input', () => UpdateListInput) input: UpdateListInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <ListEntity>await new Metadata().GetEntityObject('Lists', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for Lists
            
            if (await entityObject.Save({ IgnoreDirtyState: true /*flag used because of LoadFromData() call above*/ })) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateListInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateListInput) {
        const i = input, d = dataSource; // prevent error
    }
    
    @Mutation(() => List_)
    async DeleteList(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        if (await this.BeforeDelete(dataSource, ID)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <ListEntity>await new Metadata().GetEntityObject('Lists', this.GetUserFromPayload(userPayload));
            await entityObject.Load(ID);
            const returnValue = entityObject.GetAll(); // grab the values before we delete so we can return last state before delete if we are successful.
            if (await entityObject.Delete()) {
                await this.AfterDelete(dataSource, ID); // fire event
                return returnValue;
            }
            else 
                return null; // delete failed, this will cause an exception
        }
        else
            return null; // BeforeDelete canceled the operation, this will cause an exception
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeDelete(dataSource: DataSource, ID: number): Promise<boolean> {
        const i = ID, d = dataSource; // prevent error;
        return true;
    }
    protected async AfterDelete(dataSource: DataSource, ID: number) {
        const i = ID, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for List Details
//****************************************************************************
@ObjectType({ description: 'Tracks the records within each list.' })
export class ListDetail_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field(() => Int) 
    ListID: number;
          
    @Field() 
    @MaxLength(510)
    RecordID: string;
          
    @Field(() => Int) 
    Sequence: number;
          
    @Field() 
    @MaxLength(200)
    List: string;
        
}
        
//****************************************************************************
// INPUT TYPE for List Details   
//****************************************************************************
@InputType()
export class CreateListDetailInput {
    @Field(() => Int)
    ListID: number;
    
    @Field()
    RecordID: string;
    
    @Field(() => Int)
    Sequence: number;
    }
    
        
//****************************************************************************
// INPUT TYPE for List Details   
//****************************************************************************
@InputType()
export class UpdateListDetailInput {
    @Field(() => Int)
    ID: number;
    
    @Field(() => Int)
    ListID: number;
    
    @Field()
    RecordID: string;
    
    @Field(() => Int)
    Sequence: number;
    }
    
//****************************************************************************
// RESOLVER for List Details
//****************************************************************************
@ObjectType()
export class RunListDetailViewResult {
    @Field(() => [ListDetail_])
    Results: ListDetail_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(ListDetail_)
export class ListDetailResolver extends ResolverBase {
    @Query(() => RunListDetailViewResult)
    async RunListDetailViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunListDetailViewResult)
    async RunListDetailViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunListDetailViewResult)
    async RunListDetailDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'List Details';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => ListDetail_, { nullable: true })
    async ListDetail(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<ListDetail_ | null> {
        this.CheckUserReadPermissions('List Details', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwListDetails] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('List Details', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('List Details', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => ListDetail_)
    async CreateListDetail(
        @Arg('input', () => CreateListDetailInput) input: CreateListDetailInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <ListDetailEntity>await new Metadata().GetEntityObject('List Details', this.GetUserFromPayload(userPayload));
            await entityObject.NewRecord();
            entityObject.SetMany(input);
            if (await entityObject.Save()) {
                // save worked, fire the AfterCreate event and then return all the data
                await this.AfterCreate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else 
                // save failed, return null
                return null;
        }
        else    
            return null;
    }

    // Before/After CREATE Event Hooks for Sub-Classes to Override
    protected async BeforeCreate(dataSource: DataSource, input: CreateListDetailInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateListDetailInput) {
    }
        
    @Mutation(() => ListDetail_)
    async UpdateListDetail(
        @Arg('input', () => UpdateListDetailInput) input: UpdateListDetailInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <ListDetailEntity>await new Metadata().GetEntityObject('List Details', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for List Details
            
            if (await entityObject.Save({ IgnoreDirtyState: true /*flag used because of LoadFromData() call above*/ })) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateListDetailInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateListDetailInput) {
        const i = input, d = dataSource; // prevent error
    }
    
    @Mutation(() => ListDetail_)
    async DeleteListDetail(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        if (await this.BeforeDelete(dataSource, ID)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <ListDetailEntity>await new Metadata().GetEntityObject('List Details', this.GetUserFromPayload(userPayload));
            await entityObject.Load(ID);
            const returnValue = entityObject.GetAll(); // grab the values before we delete so we can return last state before delete if we are successful.
            if (await entityObject.Delete()) {
                await this.AfterDelete(dataSource, ID); // fire event
                return returnValue;
            }
            else 
                return null; // delete failed, this will cause an exception
        }
        else
            return null; // BeforeDelete canceled the operation, this will cause an exception
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeDelete(dataSource: DataSource, ID: number): Promise<boolean> {
        const i = ID, d = dataSource; // prevent error;
        return true;
    }
    protected async AfterDelete(dataSource: DataSource, ID: number) {
        const i = ID, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for User View Runs
//****************************************************************************
@ObjectType({ description: 'User Views can be logged when run to capture the date and user that ran the view as well as the output results.' })
export class UserViewRun_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field(() => Int) 
    UserViewID: number;
          
    @Field() 
    @MaxLength(8)
    RunAt: Date;
          
    @Field(() => Int) 
    RunByUserID: number;
          
    @Field() 
    @MaxLength(200)
    UserView: string;
          
    @Field() 
    @MaxLength(200)
    RunByUser: string;
        
    @Field(() => [mj_core_schema_server_object_types.UserViewRunDetail_])
    UserViewRunDetailsArray: mj_core_schema_server_object_types.UserViewRunDetail_[]; // Link to UserViewRunDetails
    
}
        
//****************************************************************************
// INPUT TYPE for User View Runs   
//****************************************************************************
@InputType()
export class CreateUserViewRunInput {
    @Field(() => Int)
    UserViewID: number;
    
    @Field()
    RunAt: Date;
    
    @Field(() => Int)
    RunByUserID: number;
    }
    
        
//****************************************************************************
// INPUT TYPE for User View Runs   
//****************************************************************************
@InputType()
export class UpdateUserViewRunInput {
    @Field(() => Int)
    ID: number;
    
    @Field(() => Int)
    UserViewID: number;
    
    @Field()
    RunAt: Date;
    
    @Field(() => Int)
    RunByUserID: number;
    }
    
//****************************************************************************
// RESOLVER for User View Runs
//****************************************************************************
@ObjectType()
export class RunUserViewRunViewResult {
    @Field(() => [UserViewRun_])
    Results: UserViewRun_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(UserViewRun_)
export class UserViewRunResolver extends ResolverBase {
    @Query(() => RunUserViewRunViewResult)
    async RunUserViewRunViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunUserViewRunViewResult)
    async RunUserViewRunViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunUserViewRunViewResult)
    async RunUserViewRunDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'User View Runs';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => UserViewRun_, { nullable: true })
    async UserViewRun(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<UserViewRun_ | null> {
        this.CheckUserReadPermissions('User View Runs', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwUserViewRuns] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('User View Runs', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('User View Runs', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
      
    @FieldResolver(() => [mj_core_schema_server_object_types.UserViewRunDetail_])
    async UserViewRunDetailsArray(@Root() userviewrun_: UserViewRun_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('User View Run Details', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwUserViewRunDetails] WHERE [UserViewRunID]=${userviewrun_.ID} ` + this.getRowLevelSecurityWhereClause('User View Run Details', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('User View Run Details', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => UserViewRun_)
    async CreateUserViewRun(
        @Arg('input', () => CreateUserViewRunInput) input: CreateUserViewRunInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <UserViewRunEntity>await new Metadata().GetEntityObject('User View Runs', this.GetUserFromPayload(userPayload));
            await entityObject.NewRecord();
            entityObject.SetMany(input);
            if (await entityObject.Save()) {
                // save worked, fire the AfterCreate event and then return all the data
                await this.AfterCreate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else 
                // save failed, return null
                return null;
        }
        else    
            return null;
    }

    // Before/After CREATE Event Hooks for Sub-Classes to Override
    protected async BeforeCreate(dataSource: DataSource, input: CreateUserViewRunInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateUserViewRunInput) {
    }
        
    @Mutation(() => UserViewRun_)
    async UpdateUserViewRun(
        @Arg('input', () => UpdateUserViewRunInput) input: UpdateUserViewRunInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <UserViewRunEntity>await new Metadata().GetEntityObject('User View Runs', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for User View Runs
            
            if (await entityObject.Save({ IgnoreDirtyState: true /*flag used because of LoadFromData() call above*/ })) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateUserViewRunInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateUserViewRunInput) {
        const i = input, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for User View Run Details
//****************************************************************************
@ObjectType({ description: 'Tracks the set of records that were included in each run of a given user view.' })
export class UserViewRunDetail_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field(() => Int) 
    UserViewRunID: number;
          
    @Field() 
    @MaxLength(510)
    RecordID: string;
          
    @Field(() => Int) 
    UserViewID: number;
          
    @Field(() => Int) 
    EntityID: number;
        
}
        
//****************************************************************************
// INPUT TYPE for User View Run Details   
//****************************************************************************
@InputType()
export class CreateUserViewRunDetailInput {
    @Field(() => Int)
    UserViewRunID: number;
    
    @Field()
    RecordID: string;
    }
    
        
//****************************************************************************
// INPUT TYPE for User View Run Details   
//****************************************************************************
@InputType()
export class UpdateUserViewRunDetailInput {
    @Field(() => Int)
    ID: number;
    
    @Field(() => Int)
    UserViewRunID: number;
    
    @Field()
    RecordID: string;
    }
    
//****************************************************************************
// RESOLVER for User View Run Details
//****************************************************************************
@ObjectType()
export class RunUserViewRunDetailViewResult {
    @Field(() => [UserViewRunDetail_])
    Results: UserViewRunDetail_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(UserViewRunDetail_)
export class UserViewRunDetailResolver extends ResolverBase {
    @Query(() => RunUserViewRunDetailViewResult)
    async RunUserViewRunDetailViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunUserViewRunDetailViewResult)
    async RunUserViewRunDetailViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunUserViewRunDetailViewResult)
    async RunUserViewRunDetailDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'User View Run Details';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => UserViewRunDetail_, { nullable: true })
    async UserViewRunDetail(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<UserViewRunDetail_ | null> {
        this.CheckUserReadPermissions('User View Run Details', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwUserViewRunDetails] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('User View Run Details', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('User View Run Details', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => UserViewRunDetail_)
    async CreateUserViewRunDetail(
        @Arg('input', () => CreateUserViewRunDetailInput) input: CreateUserViewRunDetailInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <UserViewRunDetailEntity>await new Metadata().GetEntityObject('User View Run Details', this.GetUserFromPayload(userPayload));
            await entityObject.NewRecord();
            entityObject.SetMany(input);
            if (await entityObject.Save()) {
                // save worked, fire the AfterCreate event and then return all the data
                await this.AfterCreate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else 
                // save failed, return null
                return null;
        }
        else    
            return null;
    }

    // Before/After CREATE Event Hooks for Sub-Classes to Override
    protected async BeforeCreate(dataSource: DataSource, input: CreateUserViewRunDetailInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateUserViewRunDetailInput) {
    }
        
    @Mutation(() => UserViewRunDetail_)
    async UpdateUserViewRunDetail(
        @Arg('input', () => UpdateUserViewRunDetailInput) input: UpdateUserViewRunDetailInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <UserViewRunDetailEntity>await new Metadata().GetEntityObject('User View Run Details', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for User View Run Details
            
            if (await entityObject.Save({ IgnoreDirtyState: true /*flag used because of LoadFromData() call above*/ })) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateUserViewRunDetailInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateUserViewRunDetailInput) {
        const i = input, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for Workflow Runs
//****************************************************************************
@ObjectType()
export class WorkflowRun_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field() 
    @MaxLength(200)
    WorkflowName: string;
          
    @Field() 
    @MaxLength(200)
    ExternalSystemRecordID: string;
          
    @Field() 
    @MaxLength(8)
    StartedAt: Date;
          
    @Field({nullable: true}) 
    @MaxLength(8)
    EndedAt?: Date;
          
    @Field() 
    @MaxLength(20)
    Status: string;
          
    @Field({nullable: true}) 
    Results?: string;
          
    @Field() 
    @MaxLength(200)
    Workflow: string;
          
    @Field() 
    @MaxLength(200)
    WorkflowEngineName: string;
        
}
        
//****************************************************************************
// INPUT TYPE for Workflow Runs   
//****************************************************************************
@InputType()
export class UpdateWorkflowRunInput {
    @Field(() => Int)
    ID: number;
    
    @Field()
    WorkflowName: string;
    
    @Field()
    ExternalSystemRecordID: string;
    
    @Field()
    StartedAt: Date;
    
    @Field({ nullable: true })
    EndedAt: Date;
    
    @Field()
    Status: string;
    
    @Field({ nullable: true })
    Results: string;
    }
    
//****************************************************************************
// RESOLVER for Workflow Runs
//****************************************************************************
@ObjectType()
export class RunWorkflowRunViewResult {
    @Field(() => [WorkflowRun_])
    Results: WorkflowRun_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(WorkflowRun_)
export class WorkflowRunResolver extends ResolverBase {
    @Query(() => RunWorkflowRunViewResult)
    async RunWorkflowRunViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunWorkflowRunViewResult)
    async RunWorkflowRunViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunWorkflowRunViewResult)
    async RunWorkflowRunDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Workflow Runs';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => WorkflowRun_, { nullable: true })
    async WorkflowRun(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<WorkflowRun_ | null> {
        this.CheckUserReadPermissions('Workflow Runs', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwWorkflowRuns] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Workflow Runs', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Workflow Runs', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => WorkflowRun_)
    async UpdateWorkflowRun(
        @Arg('input', () => UpdateWorkflowRunInput) input: UpdateWorkflowRunInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <WorkflowRunEntity>await new Metadata().GetEntityObject('Workflow Runs', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for Workflow Runs
            
            if (await entityObject.Save({ IgnoreDirtyState: true /*flag used because of LoadFromData() call above*/ })) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateWorkflowRunInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateWorkflowRunInput) {
        const i = input, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for Workflows
//****************************************************************************
@ObjectType()
export class Workflow_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field() 
    @MaxLength(200)
    Name: string;
          
    @Field({nullable: true}) 
    Description?: string;
          
    @Field() 
    @MaxLength(200)
    WorkflowEngineName: string;
          
    @Field() 
    @MaxLength(100)
    CompanyName: string;
          
    @Field() 
    @MaxLength(200)
    ExternalSystemRecordID: string;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
          
    @Field(() => Boolean, {description: 'If set to 1, the workflow will be run automatically on the interval specified by the AutoRunIntervalType and AutoRunInterval fields'}) 
    AutoRunEnabled: boolean;
          
    @Field({nullable: true, description: 'Minutes, Hours, Days, Weeks, Months, Years'}) 
    @MaxLength(40)
    AutoRunIntervalUnits?: string;
          
    @Field(() => Int, {nullable: true, description: 'The interval, denominated in the units specified in the AutoRunIntervalUnits column, between auto runs of this workflow.'}) 
    AutoRunInterval?: number;
          
    @Field({nullable: true, description: 'If specified, this subclass key, via the ClassFactory, will be instantiated, to execute this workflow. If not specified the WorkflowBase class will be used by default.'}) 
    @MaxLength(400)
    SubclassName?: string;
          
    @Field(() => Int, {nullable: true}) 
    AutoRunIntervalMinutes?: number;
        
    @Field(() => [mj_core_schema_server_object_types.Report_])
    ReportsArray: mj_core_schema_server_object_types.Report_[]; // Link to Reports
    
    @Field(() => [mj_core_schema_server_object_types.WorkflowRun_])
    WorkflowRunsArray: mj_core_schema_server_object_types.WorkflowRun_[]; // Link to WorkflowRuns
    
}
        
//****************************************************************************
// INPUT TYPE for Workflows   
//****************************************************************************
@InputType()
export class UpdateWorkflowInput {
    @Field(() => Int)
    ID: number;
    
    @Field()
    Name: string;
    
    @Field({ nullable: true })
    Description: string;
    
    @Field()
    WorkflowEngineName: string;
    
    @Field()
    CompanyName: string;
    
    @Field()
    ExternalSystemRecordID: string;
    
    @Field(() => Boolean)
    AutoRunEnabled: boolean;
    
    @Field({ nullable: true })
    AutoRunIntervalUnits: string;
    
    @Field(() => Int, { nullable: true })
    AutoRunInterval: number;
    
    @Field({ nullable: true })
    SubclassName: string;
    }
    
//****************************************************************************
// RESOLVER for Workflows
//****************************************************************************
@ObjectType()
export class RunWorkflowViewResult {
    @Field(() => [Workflow_])
    Results: Workflow_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(Workflow_)
export class WorkflowResolver extends ResolverBase {
    @Query(() => RunWorkflowViewResult)
    async RunWorkflowViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunWorkflowViewResult)
    async RunWorkflowViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunWorkflowViewResult)
    async RunWorkflowDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Workflows';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => Workflow_, { nullable: true })
    async Workflow(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Workflow_ | null> {
        this.CheckUserReadPermissions('Workflows', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwWorkflows] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Workflows', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Workflows', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
      
    @FieldResolver(() => [mj_core_schema_server_object_types.Report_])
    async ReportsArray(@Root() workflow_: Workflow_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Reports', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwReports] WHERE [OutputWorkflowID]=${workflow_.ID} ` + this.getRowLevelSecurityWhereClause('Reports', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Reports', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.WorkflowRun_])
    async WorkflowRunsArray(@Root() workflow_: Workflow_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Workflow Runs', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwWorkflowRuns] WHERE [WorkflowName]=${workflow_.ID} ` + this.getRowLevelSecurityWhereClause('Workflow Runs', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Workflow Runs', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => Workflow_)
    async UpdateWorkflow(
        @Arg('input', () => UpdateWorkflowInput) input: UpdateWorkflowInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <WorkflowEntity>await new Metadata().GetEntityObject('Workflows', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for Workflows
            
            if (await entityObject.Save({ IgnoreDirtyState: true /*flag used because of LoadFromData() call above*/ })) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateWorkflowInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateWorkflowInput) {
        const i = input, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for Workflow Engines
//****************************************************************************
@ObjectType()
export class WorkflowEngine_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field() 
    @MaxLength(200)
    Name: string;
          
    @Field({nullable: true}) 
    Description?: string;
          
    @Field() 
    @MaxLength(1000)
    DriverPath: string;
          
    @Field() 
    @MaxLength(200)
    DriverClass: string;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
        
    @Field(() => [mj_core_schema_server_object_types.Workflow_])
    WorkflowsArray: mj_core_schema_server_object_types.Workflow_[]; // Link to Workflows
    
}
        
//****************************************************************************
// INPUT TYPE for Workflow Engines   
//****************************************************************************
@InputType()
export class UpdateWorkflowEngineInput {
    @Field(() => Int)
    ID: number;
    
    @Field()
    Name: string;
    
    @Field({ nullable: true })
    Description: string;
    
    @Field()
    DriverPath: string;
    
    @Field()
    DriverClass: string;
    }
    
//****************************************************************************
// RESOLVER for Workflow Engines
//****************************************************************************
@ObjectType()
export class RunWorkflowEngineViewResult {
    @Field(() => [WorkflowEngine_])
    Results: WorkflowEngine_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(WorkflowEngine_)
export class WorkflowEngineResolver extends ResolverBase {
    @Query(() => RunWorkflowEngineViewResult)
    async RunWorkflowEngineViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunWorkflowEngineViewResult)
    async RunWorkflowEngineViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunWorkflowEngineViewResult)
    async RunWorkflowEngineDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Workflow Engines';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => WorkflowEngine_, { nullable: true })
    async WorkflowEngine(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<WorkflowEngine_ | null> {
        this.CheckUserReadPermissions('Workflow Engines', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwWorkflowEngines] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Workflow Engines', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Workflow Engines', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
      
    @FieldResolver(() => [mj_core_schema_server_object_types.Workflow_])
    async WorkflowsArray(@Root() workflowengine_: WorkflowEngine_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Workflows', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwWorkflows] WHERE [WorkflowEngineName]=${workflowengine_.ID} ` + this.getRowLevelSecurityWhereClause('Workflows', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Workflows', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => WorkflowEngine_)
    async UpdateWorkflowEngine(
        @Arg('input', () => UpdateWorkflowEngineInput) input: UpdateWorkflowEngineInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <WorkflowEngineEntity>await new Metadata().GetEntityObject('Workflow Engines', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for Workflow Engines
            
            if (await entityObject.Save({ IgnoreDirtyState: true /*flag used because of LoadFromData() call above*/ })) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateWorkflowEngineInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateWorkflowEngineInput) {
        const i = input, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for Record Changes
//****************************************************************************
@ObjectType({ description: 'For entities that have TrackRecordChanges=1, Record Changes will store the history of all changes made within the system. For integrations you can directly add values here if you have inbound signals indicating records were changed in a source system. This entity only automatically captures Record Changes if they were made within the system.' })
export class RecordChange_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field(() => Int) 
    EntityID: number;
          
    @Field() 
    @MaxLength(510)
    RecordID: string;
          
    @Field(() => Int) 
    UserID: number;
          
    @Field() 
    @MaxLength(8)
    ChangedAt: Date;
          
    @Field() 
    ChangesJSON: string;
          
    @Field() 
    ChangesDescription: string;
          
    @Field() 
    FullRecordJSON: string;
          
    @Field() 
    @MaxLength(30)
    Status: string;
          
    @Field({nullable: true}) 
    Comments?: string;
          
    @Field() 
    @MaxLength(510)
    Entity: string;
          
    @Field() 
    @MaxLength(200)
    User: string;
        
}
        
//****************************************************************************
// INPUT TYPE for Record Changes   
//****************************************************************************
@InputType()
export class CreateRecordChangeInput {
    @Field(() => Int)
    EntityID: number;
    
    @Field()
    RecordID: string;
    
    @Field(() => Int)
    UserID: number;
    
    @Field()
    ChangedAt: Date;
    
    @Field()
    ChangesJSON: string;
    
    @Field()
    ChangesDescription: string;
    
    @Field()
    FullRecordJSON: string;
    
    @Field()
    Status: string;
    
    @Field({ nullable: true })
    Comments: string;
    }
    
//****************************************************************************
// RESOLVER for Record Changes
//****************************************************************************
@ObjectType()
export class RunRecordChangeViewResult {
    @Field(() => [RecordChange_])
    Results: RecordChange_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(RecordChange_)
export class RecordChangeResolver extends ResolverBase {
    @Query(() => RunRecordChangeViewResult)
    async RunRecordChangeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunRecordChangeViewResult)
    async RunRecordChangeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunRecordChangeViewResult)
    async RunRecordChangeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Record Changes';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => RecordChange_, { nullable: true })
    async RecordChange(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<RecordChange_ | null> {
        this.CheckUserReadPermissions('Record Changes', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwRecordChanges] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Record Changes', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Record Changes', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => RecordChange_)
    async CreateRecordChange(
        @Arg('input', () => CreateRecordChangeInput) input: CreateRecordChangeInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <RecordChangeEntity>await new Metadata().GetEntityObject('Record Changes', this.GetUserFromPayload(userPayload));
            await entityObject.NewRecord();
            entityObject.SetMany(input);
            if (await entityObject.Save()) {
                // save worked, fire the AfterCreate event and then return all the data
                await this.AfterCreate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else 
                // save failed, return null
                return null;
        }
        else    
            return null;
    }

    // Before/After CREATE Event Hooks for Sub-Classes to Override
    protected async BeforeCreate(dataSource: DataSource, input: CreateRecordChangeInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateRecordChangeInput) {
    }
        
}

//****************************************************************************
// ENTITY CLASS for User Roles
//****************************************************************************
@ObjectType()
export class UserRole_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field(() => Int) 
    UserID: number;
          
    @Field() 
    @MaxLength(100)
    RoleName: string;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
          
    @Field() 
    @MaxLength(200)
    User: string;
        
}
        
//****************************************************************************
// INPUT TYPE for User Roles   
//****************************************************************************
@InputType()
export class CreateUserRoleInput {
    @Field(() => Int)
    UserID: number;
    
    @Field()
    RoleName: string;
    }
    
//****************************************************************************
// RESOLVER for User Roles
//****************************************************************************
@ObjectType()
export class RunUserRoleViewResult {
    @Field(() => [UserRole_])
    Results: UserRole_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(UserRole_)
export class UserRoleResolver extends ResolverBase {
    @Query(() => RunUserRoleViewResult)
    async RunUserRoleViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunUserRoleViewResult)
    async RunUserRoleViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunUserRoleViewResult)
    async RunUserRoleDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'User Roles';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => UserRole_, { nullable: true })
    async UserRole(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<UserRole_ | null> {
        this.CheckUserReadPermissions('User Roles', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwUserRoles] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('User Roles', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('User Roles', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Query(() => [UserRole_])
    async AllUserRoles(@Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('User Roles', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwUserRoles]` + this.getRowLevelSecurityWhereClause('User Roles', userPayload, EntityPermissionType.Read, ' WHERE');
        const result = this.ArrayMapFieldNamesToCodeNames('User Roles', await dataSource.query(sSQL));
        return result;
    }
    
    @Mutation(() => UserRole_)
    async CreateUserRole(
        @Arg('input', () => CreateUserRoleInput) input: CreateUserRoleInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <UserRoleEntity>await new Metadata().GetEntityObject('User Roles', this.GetUserFromPayload(userPayload));
            await entityObject.NewRecord();
            entityObject.SetMany(input);
            if (await entityObject.Save()) {
                // save worked, fire the AfterCreate event and then return all the data
                await this.AfterCreate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else 
                // save failed, return null
                return null;
        }
        else    
            return null;
    }

    // Before/After CREATE Event Hooks for Sub-Classes to Override
    protected async BeforeCreate(dataSource: DataSource, input: CreateUserRoleInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateUserRoleInput) {
    }
        
    @Mutation(() => UserRole_)
    async DeleteUserRole(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        if (await this.BeforeDelete(dataSource, ID)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <UserRoleEntity>await new Metadata().GetEntityObject('User Roles', this.GetUserFromPayload(userPayload));
            await entityObject.Load(ID);
            const returnValue = entityObject.GetAll(); // grab the values before we delete so we can return last state before delete if we are successful.
            if (await entityObject.Delete()) {
                await this.AfterDelete(dataSource, ID); // fire event
                return returnValue;
            }
            else 
                return null; // delete failed, this will cause an exception
        }
        else
            return null; // BeforeDelete canceled the operation, this will cause an exception
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeDelete(dataSource: DataSource, ID: number): Promise<boolean> {
        const i = ID, d = dataSource; // prevent error;
        return true;
    }
    protected async AfterDelete(dataSource: DataSource, ID: number) {
        const i = ID, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for Row Level Security Filters
//****************************************************************************
@ObjectType()
export class RowLevelSecurityFilter_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field() 
    @MaxLength(200)
    Name: string;
          
    @Field({nullable: true}) 
    Description?: string;
          
    @Field({nullable: true}) 
    FilterText?: string;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
        
    @Field(() => [mj_core_schema_server_object_types.EntityPermission_])
    EntityPermissionsArray: mj_core_schema_server_object_types.EntityPermission_[]; // Link to EntityPermissions
    
}
//****************************************************************************
// RESOLVER for Row Level Security Filters
//****************************************************************************
@ObjectType()
export class RunRowLevelSecurityFilterViewResult {
    @Field(() => [RowLevelSecurityFilter_])
    Results: RowLevelSecurityFilter_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(RowLevelSecurityFilter_)
export class RowLevelSecurityFilterResolver extends ResolverBase {
    @Query(() => RunRowLevelSecurityFilterViewResult)
    async RunRowLevelSecurityFilterViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunRowLevelSecurityFilterViewResult)
    async RunRowLevelSecurityFilterViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunRowLevelSecurityFilterViewResult)
    async RunRowLevelSecurityFilterDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Row Level Security Filters';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => RowLevelSecurityFilter_, { nullable: true })
    async RowLevelSecurityFilter(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<RowLevelSecurityFilter_ | null> {
        this.CheckUserReadPermissions('Row Level Security Filters', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwRowLevelSecurityFilters] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Row Level Security Filters', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Row Level Security Filters', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Query(() => [RowLevelSecurityFilter_])
    async AllRowLevelSecurityFilters(@Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Row Level Security Filters', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwRowLevelSecurityFilters]` + this.getRowLevelSecurityWhereClause('Row Level Security Filters', userPayload, EntityPermissionType.Read, ' WHERE');
        const result = this.ArrayMapFieldNamesToCodeNames('Row Level Security Filters', await dataSource.query(sSQL));
        return result;
    }
      
    @FieldResolver(() => [mj_core_schema_server_object_types.EntityPermission_])
    async EntityPermissionsArray(@Root() rowlevelsecurityfilter_: RowLevelSecurityFilter_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Entity Permissions', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwEntityPermissions] WHERE [ReadRLSFilterID]=${rowlevelsecurityfilter_.ID} ` + this.getRowLevelSecurityWhereClause('Entity Permissions', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Entity Permissions', await dataSource.query(sSQL));
        return result;
    }
        
}

//****************************************************************************
// ENTITY CLASS for Audit Logs
//****************************************************************************
@ObjectType()
export class AuditLog_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field({nullable: true}) 
    @MaxLength(100)
    AuditLogTypeName?: string;
          
    @Field(() => Int) 
    UserID: number;
          
    @Field({nullable: true}) 
    @MaxLength(200)
    AuthorizationName?: string;
          
    @Field() 
    @MaxLength(100)
    Status: string;
          
    @Field({nullable: true}) 
    Description?: string;
          
    @Field({nullable: true}) 
    Details?: string;
          
    @Field(() => Int, {nullable: true}) 
    EntityID?: number;
          
    @Field({nullable: true}) 
    @MaxLength(510)
    RecordID?: string;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
          
    @Field() 
    @MaxLength(200)
    User: string;
          
    @Field({nullable: true}) 
    @MaxLength(510)
    Entity?: string;
        
}
        
//****************************************************************************
// INPUT TYPE for Audit Logs   
//****************************************************************************
@InputType()
export class CreateAuditLogInput {
    @Field({ nullable: true })
    AuditLogTypeName: string;
    
    @Field(() => Int)
    UserID: number;
    
    @Field({ nullable: true })
    AuthorizationName: string;
    
    @Field()
    Status: string;
    
    @Field({ nullable: true })
    Description: string;
    
    @Field({ nullable: true })
    Details: string;
    
    @Field(() => Int, { nullable: true })
    EntityID: number;
    
    @Field({ nullable: true })
    RecordID: string;
    }
    
        
//****************************************************************************
// INPUT TYPE for Audit Logs   
//****************************************************************************
@InputType()
export class UpdateAuditLogInput {
    @Field(() => Int)
    ID: number;
    
    @Field({ nullable: true })
    AuditLogTypeName: string;
    
    @Field(() => Int)
    UserID: number;
    
    @Field({ nullable: true })
    AuthorizationName: string;
    
    @Field()
    Status: string;
    
    @Field({ nullable: true })
    Description: string;
    
    @Field({ nullable: true })
    Details: string;
    
    @Field(() => Int, { nullable: true })
    EntityID: number;
    
    @Field({ nullable: true })
    RecordID: string;
    }
    
//****************************************************************************
// RESOLVER for Audit Logs
//****************************************************************************
@ObjectType()
export class RunAuditLogViewResult {
    @Field(() => [AuditLog_])
    Results: AuditLog_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(AuditLog_)
export class AuditLogResolver extends ResolverBase {
    @Query(() => RunAuditLogViewResult)
    async RunAuditLogViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunAuditLogViewResult)
    async RunAuditLogViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunAuditLogViewResult)
    async RunAuditLogDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Audit Logs';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => AuditLog_, { nullable: true })
    async AuditLog(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AuditLog_ | null> {
        this.CheckUserReadPermissions('Audit Logs', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwAuditLogs] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Audit Logs', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Audit Logs', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => AuditLog_)
    async CreateAuditLog(
        @Arg('input', () => CreateAuditLogInput) input: CreateAuditLogInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <AuditLogEntity>await new Metadata().GetEntityObject('Audit Logs', this.GetUserFromPayload(userPayload));
            await entityObject.NewRecord();
            entityObject.SetMany(input);
            if (await entityObject.Save()) {
                // save worked, fire the AfterCreate event and then return all the data
                await this.AfterCreate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else 
                // save failed, return null
                return null;
        }
        else    
            return null;
    }

    // Before/After CREATE Event Hooks for Sub-Classes to Override
    protected async BeforeCreate(dataSource: DataSource, input: CreateAuditLogInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateAuditLogInput) {
    }
        
    @Mutation(() => AuditLog_)
    async UpdateAuditLog(
        @Arg('input', () => UpdateAuditLogInput) input: UpdateAuditLogInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <AuditLogEntity>await new Metadata().GetEntityObject('Audit Logs', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for Audit Logs
            
            if (await entityObject.Save({ IgnoreDirtyState: true /*flag used because of LoadFromData() call above*/ })) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateAuditLogInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateAuditLogInput) {
        const i = input, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for Authorizations
//****************************************************************************
@ObjectType()
export class Authorization_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field(() => Int, {nullable: true}) 
    ParentID?: number;
          
    @Field() 
    @MaxLength(200)
    Name: string;
          
    @Field(() => Boolean) 
    IsActive: boolean;
          
    @Field(() => Boolean) 
    UseAuditLog: boolean;
          
    @Field({nullable: true}) 
    Description?: string;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
          
    @Field({nullable: true}) 
    @MaxLength(200)
    Parent?: string;
        
    @Field(() => [mj_core_schema_server_object_types.AuthorizationRole_])
    AuthorizationRolesArray: mj_core_schema_server_object_types.AuthorizationRole_[]; // Link to AuthorizationRoles
    
    @Field(() => [mj_core_schema_server_object_types.Authorization_])
    AuthorizationsArray: mj_core_schema_server_object_types.Authorization_[]; // Link to Authorizations
    
    @Field(() => [mj_core_schema_server_object_types.AuditLogType_])
    AuditLogTypesArray: mj_core_schema_server_object_types.AuditLogType_[]; // Link to AuditLogTypes
    
    @Field(() => [mj_core_schema_server_object_types.AuditLog_])
    AuditLogsArray: mj_core_schema_server_object_types.AuditLog_[]; // Link to AuditLogs
    
}
//****************************************************************************
// RESOLVER for Authorizations
//****************************************************************************
@ObjectType()
export class RunAuthorizationViewResult {
    @Field(() => [Authorization_])
    Results: Authorization_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(Authorization_)
export class AuthorizationResolver extends ResolverBase {
    @Query(() => RunAuthorizationViewResult)
    async RunAuthorizationViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunAuthorizationViewResult)
    async RunAuthorizationViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunAuthorizationViewResult)
    async RunAuthorizationDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Authorizations';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => Authorization_, { nullable: true })
    async Authorization(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Authorization_ | null> {
        this.CheckUserReadPermissions('Authorizations', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwAuthorizations] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Authorizations', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Authorizations', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Query(() => [Authorization_])
    async AllAuthorizations(@Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Authorizations', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwAuthorizations]` + this.getRowLevelSecurityWhereClause('Authorizations', userPayload, EntityPermissionType.Read, ' WHERE');
        const result = this.ArrayMapFieldNamesToCodeNames('Authorizations', await dataSource.query(sSQL));
        return result;
    }
      
    @FieldResolver(() => [mj_core_schema_server_object_types.AuthorizationRole_])
    async AuthorizationRolesArray(@Root() authorization_: Authorization_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Authorization Roles', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwAuthorizationRoles] WHERE [AuthorizationID]=${authorization_.ID} ` + this.getRowLevelSecurityWhereClause('Authorization Roles', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Authorization Roles', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.Authorization_])
    async AuthorizationsArray(@Root() authorization_: Authorization_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Authorizations', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwAuthorizations] WHERE [ParentID]=${authorization_.ID} ` + this.getRowLevelSecurityWhereClause('Authorizations', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Authorizations', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.AuditLogType_])
    async AuditLogTypesArray(@Root() authorization_: Authorization_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Audit Log Types', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwAuditLogTypes] WHERE [AuthorizationName]=${authorization_.ID} ` + this.getRowLevelSecurityWhereClause('Audit Log Types', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Audit Log Types', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.AuditLog_])
    async AuditLogsArray(@Root() authorization_: Authorization_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Audit Logs', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwAuditLogs] WHERE [AuthorizationName]=${authorization_.ID} ` + this.getRowLevelSecurityWhereClause('Audit Logs', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Audit Logs', await dataSource.query(sSQL));
        return result;
    }
        
}

//****************************************************************************
// ENTITY CLASS for Authorization Roles
//****************************************************************************
@ObjectType()
export class AuthorizationRole_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field({nullable: true}) 
    @MaxLength(200)
    AuthorizationName?: string;
          
    @Field({nullable: true}) 
    @MaxLength(100)
    RoleName?: string;
          
    @Field() 
    @MaxLength(20)
    Type: string;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
        
}
//****************************************************************************
// RESOLVER for Authorization Roles
//****************************************************************************
@ObjectType()
export class RunAuthorizationRoleViewResult {
    @Field(() => [AuthorizationRole_])
    Results: AuthorizationRole_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(AuthorizationRole_)
export class AuthorizationRoleResolver extends ResolverBase {
    @Query(() => RunAuthorizationRoleViewResult)
    async RunAuthorizationRoleViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunAuthorizationRoleViewResult)
    async RunAuthorizationRoleViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunAuthorizationRoleViewResult)
    async RunAuthorizationRoleDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Authorization Roles';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => AuthorizationRole_, { nullable: true })
    async AuthorizationRole(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AuthorizationRole_ | null> {
        this.CheckUserReadPermissions('Authorization Roles', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwAuthorizationRoles] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Authorization Roles', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Authorization Roles', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Query(() => [AuthorizationRole_])
    async AllAuthorizationRoles(@Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Authorization Roles', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwAuthorizationRoles]` + this.getRowLevelSecurityWhereClause('Authorization Roles', userPayload, EntityPermissionType.Read, ' WHERE');
        const result = this.ArrayMapFieldNamesToCodeNames('Authorization Roles', await dataSource.query(sSQL));
        return result;
    }
    
}

//****************************************************************************
// ENTITY CLASS for Audit Log Types
//****************************************************************************
@ObjectType()
export class AuditLogType_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field(() => Int, {nullable: true}) 
    ParentID?: number;
          
    @Field() 
    @MaxLength(100)
    Name: string;
          
    @Field({nullable: true}) 
    Description?: string;
          
    @Field({nullable: true}) 
    @MaxLength(200)
    AuthorizationName?: string;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
          
    @Field({nullable: true}) 
    @MaxLength(100)
    Parent?: string;
        
    @Field(() => [mj_core_schema_server_object_types.AuditLog_])
    AuditLogsArray: mj_core_schema_server_object_types.AuditLog_[]; // Link to AuditLogs
    
    @Field(() => [mj_core_schema_server_object_types.AuditLogType_])
    AuditLogTypesArray: mj_core_schema_server_object_types.AuditLogType_[]; // Link to AuditLogTypes
    
}
//****************************************************************************
// RESOLVER for Audit Log Types
//****************************************************************************
@ObjectType()
export class RunAuditLogTypeViewResult {
    @Field(() => [AuditLogType_])
    Results: AuditLogType_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(AuditLogType_)
export class AuditLogTypeResolver extends ResolverBase {
    @Query(() => RunAuditLogTypeViewResult)
    async RunAuditLogTypeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunAuditLogTypeViewResult)
    async RunAuditLogTypeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunAuditLogTypeViewResult)
    async RunAuditLogTypeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Audit Log Types';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => AuditLogType_, { nullable: true })
    async AuditLogType(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AuditLogType_ | null> {
        this.CheckUserReadPermissions('Audit Log Types', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwAuditLogTypes] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Audit Log Types', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Audit Log Types', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Query(() => [AuditLogType_])
    async AllAuditLogTypes(@Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Audit Log Types', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwAuditLogTypes]` + this.getRowLevelSecurityWhereClause('Audit Log Types', userPayload, EntityPermissionType.Read, ' WHERE');
        const result = this.ArrayMapFieldNamesToCodeNames('Audit Log Types', await dataSource.query(sSQL));
        return result;
    }
      
    @FieldResolver(() => [mj_core_schema_server_object_types.AuditLog_])
    async AuditLogsArray(@Root() auditlogtype_: AuditLogType_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Audit Logs', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwAuditLogs] WHERE [AuditLogTypeName]=${auditlogtype_.ID} ` + this.getRowLevelSecurityWhereClause('Audit Logs', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Audit Logs', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.AuditLogType_])
    async AuditLogTypesArray(@Root() auditlogtype_: AuditLogType_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Audit Log Types', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwAuditLogTypes] WHERE [ParentID]=${auditlogtype_.ID} ` + this.getRowLevelSecurityWhereClause('Audit Log Types', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Audit Log Types', await dataSource.query(sSQL));
        return result;
    }
        
}

//****************************************************************************
// ENTITY CLASS for Entity Field Values
//****************************************************************************
@ObjectType()
export class EntityFieldValue_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field(() => Int) 
    EntityID: number;
          
    @Field() 
    @MaxLength(510)
    EntityFieldName: string;
          
    @Field(() => Int) 
    Sequence: number;
          
    @Field() 
    @MaxLength(510)
    Value: string;
          
    @Field({nullable: true}) 
    @MaxLength(100)
    Code?: string;
          
    @Field({nullable: true}) 
    Description?: string;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
          
    @Field() 
    @MaxLength(510)
    EntityField: string;
          
    @Field() 
    @MaxLength(510)
    Entity: string;
        
}
//****************************************************************************
// RESOLVER for Entity Field Values
//****************************************************************************
@ObjectType()
export class RunEntityFieldValueViewResult {
    @Field(() => [EntityFieldValue_])
    Results: EntityFieldValue_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(EntityFieldValue_)
export class EntityFieldValueResolver extends ResolverBase {
    @Query(() => RunEntityFieldValueViewResult)
    async RunEntityFieldValueViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunEntityFieldValueViewResult)
    async RunEntityFieldValueViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunEntityFieldValueViewResult)
    async RunEntityFieldValueDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Entity Field Values';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => EntityFieldValue_, { nullable: true })
    async EntityFieldValue(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<EntityFieldValue_ | null> {
        this.CheckUserReadPermissions('Entity Field Values', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwEntityFieldValues] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Entity Field Values', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Entity Field Values', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Query(() => [EntityFieldValue_])
    async AllEntityFieldValues(@Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Entity Field Values', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwEntityFieldValues]` + this.getRowLevelSecurityWhereClause('Entity Field Values', userPayload, EntityPermissionType.Read, ' WHERE');
        const result = this.ArrayMapFieldNamesToCodeNames('Entity Field Values', await dataSource.query(sSQL));
        return result;
    }
    
}

//****************************************************************************
// ENTITY CLASS for AI Models
//****************************************************************************
@ObjectType({ description: 'Catalog of all AI Models configured in the system.' })
export class AIModel_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field() 
    @MaxLength(100)
    Name: string;
          
    @Field({nullable: true}) 
    @MaxLength(100)
    Vendor?: string;
          
    @Field(() => Int) 
    AIModelTypeID: number;
          
    @Field(() => Boolean) 
    IsActive: boolean;
          
    @Field({nullable: true}) 
    Description?: string;
          
    @Field({nullable: true}) 
    @MaxLength(200)
    DriverClass?: string;
          
    @Field({nullable: true}) 
    @MaxLength(510)
    DriverImportPath?: string;
          
    @Field({nullable: true, description: 'The name of the model to use with API calls which might differ from the Name, if APIName is not provided, Name will be used for API calls'}) 
    @MaxLength(200)
    APIName?: string;
          
    @Field(() => Int, {nullable: true, description: 'A simplified power rank of each model for a given AI Model Type. For example, if we have GPT 3, GPT 3.5, and GPT 4, we would have a PowerRank of 1 for GPT3, 2 for GPT 3.5, and 3 for GPT 4. This can be used within model families like OpenAI or across all models. For example if you had Llama 2 in the mix which is similar to GPT 3.5 it would also have a PowerRank of 2. This can be used at runtime to pick the most/least powerful or compare model relative power.'}) 
    PowerRank?: number;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
          
    @Field() 
    @MaxLength(100)
    AIModelType: string;
        
    @Field(() => [mj_core_schema_server_object_types.AIAction_])
    AIActionsArray: mj_core_schema_server_object_types.AIAction_[]; // Link to AIActions
    
    @Field(() => [mj_core_schema_server_object_types.AIModelAction_])
    AIModelActionsArray: mj_core_schema_server_object_types.AIModelAction_[]; // Link to AIModelActions
    
    @Field(() => [mj_core_schema_server_object_types.EntityAIAction_])
    EntityAIActionsArray: mj_core_schema_server_object_types.EntityAIAction_[]; // Link to EntityAIActions
    
    @Field(() => [mj_core_schema_server_object_types.VectorIndex_])
    VectorIndexesArray: mj_core_schema_server_object_types.VectorIndex_[]; // Link to VectorIndexes
    
}
        
//****************************************************************************
// INPUT TYPE for AI Models   
//****************************************************************************
@InputType()
export class UpdateAIModelInput {
    @Field(() => Int)
    ID: number;
    
    @Field()
    Name: string;
    
    @Field({ nullable: true })
    Vendor: string;
    
    @Field(() => Int)
    AIModelTypeID: number;
    
    @Field(() => Boolean)
    IsActive: boolean;
    
    @Field({ nullable: true })
    Description: string;
    
    @Field({ nullable: true })
    DriverClass: string;
    
    @Field({ nullable: true })
    DriverImportPath: string;
    
    @Field({ nullable: true })
    APIName: string;
    
    @Field(() => Int, { nullable: true })
    PowerRank: number;
    }
    
//****************************************************************************
// RESOLVER for AI Models
//****************************************************************************
@ObjectType()
export class RunAIModelViewResult {
    @Field(() => [AIModel_])
    Results: AIModel_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(AIModel_)
export class AIModelResolver extends ResolverBase {
    @Query(() => RunAIModelViewResult)
    async RunAIModelViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunAIModelViewResult)
    async RunAIModelViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunAIModelViewResult)
    async RunAIModelDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'AI Models';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => AIModel_, { nullable: true })
    async AIModel(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AIModel_ | null> {
        this.CheckUserReadPermissions('AI Models', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwAIModels] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('AI Models', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('AI Models', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Query(() => [AIModel_])
    async AllAIModels(@Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('AI Models', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwAIModels]` + this.getRowLevelSecurityWhereClause('AI Models', userPayload, EntityPermissionType.Read, ' WHERE');
        const result = this.ArrayMapFieldNamesToCodeNames('AI Models', await dataSource.query(sSQL));
        return result;
    }
      
    @FieldResolver(() => [mj_core_schema_server_object_types.AIAction_])
    async AIActionsArray(@Root() aimodel_: AIModel_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('AI Actions', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwAIActions] WHERE [DefaultModelID]=${aimodel_.ID} ` + this.getRowLevelSecurityWhereClause('AI Actions', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('AI Actions', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.AIModelAction_])
    async AIModelActionsArray(@Root() aimodel_: AIModel_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('AI Model Actions', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwAIModelActions] WHERE [AIModelID]=${aimodel_.ID} ` + this.getRowLevelSecurityWhereClause('AI Model Actions', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('AI Model Actions', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.EntityAIAction_])
    async EntityAIActionsArray(@Root() aimodel_: AIModel_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Entity AI Actions', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwEntityAIActions] WHERE [AIModelID]=${aimodel_.ID} ` + this.getRowLevelSecurityWhereClause('Entity AI Actions', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Entity AI Actions', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.VectorIndex_])
    async VectorIndexesArray(@Root() aimodel_: AIModel_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Vector Indexes', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwVectorIndexes] WHERE [EmbeddingModelID]=${aimodel_.ID} ` + this.getRowLevelSecurityWhereClause('Vector Indexes', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Vector Indexes', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => AIModel_)
    async UpdateAIModel(
        @Arg('input', () => UpdateAIModelInput) input: UpdateAIModelInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <AIModelEntity>await new Metadata().GetEntityObject('AI Models', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for AI Models
            
            if (await entityObject.Save({ IgnoreDirtyState: true /*flag used because of LoadFromData() call above*/ })) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateAIModelInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateAIModelInput) {
        const i = input, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for AI Actions
//****************************************************************************
@ObjectType({ description: 'List of all actions that are possible across all AI Models' })
export class AIAction_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field() 
    @MaxLength(100)
    Name: string;
          
    @Field({nullable: true}) 
    Description?: string;
          
    @Field(() => Int, {nullable: true}) 
    DefaultModelID?: number;
          
    @Field({nullable: true}) 
    DefaultPrompt?: string;
          
    @Field(() => Boolean) 
    IsActive: boolean;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
          
    @Field({nullable: true}) 
    @MaxLength(100)
    DefaultModel?: string;
        
    @Field(() => [mj_core_schema_server_object_types.AIModelAction_])
    AIModelActionsArray: mj_core_schema_server_object_types.AIModelAction_[]; // Link to AIModelActions
    
    @Field(() => [mj_core_schema_server_object_types.EntityAIAction_])
    EntityAIActionsArray: mj_core_schema_server_object_types.EntityAIAction_[]; // Link to EntityAIActions
    
}
        
//****************************************************************************
// INPUT TYPE for AI Actions   
//****************************************************************************
@InputType()
export class UpdateAIActionInput {
    @Field(() => Int)
    ID: number;
    
    @Field()
    Name: string;
    
    @Field({ nullable: true })
    Description: string;
    
    @Field(() => Int, { nullable: true })
    DefaultModelID: number;
    
    @Field({ nullable: true })
    DefaultPrompt: string;
    
    @Field(() => Boolean)
    IsActive: boolean;
    }
    
//****************************************************************************
// RESOLVER for AI Actions
//****************************************************************************
@ObjectType()
export class RunAIActionViewResult {
    @Field(() => [AIAction_])
    Results: AIAction_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(AIAction_)
export class AIActionResolver extends ResolverBase {
    @Query(() => RunAIActionViewResult)
    async RunAIActionViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunAIActionViewResult)
    async RunAIActionViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunAIActionViewResult)
    async RunAIActionDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'AI Actions';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => AIAction_, { nullable: true })
    async AIAction(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AIAction_ | null> {
        this.CheckUserReadPermissions('AI Actions', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwAIActions] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('AI Actions', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('AI Actions', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Query(() => [AIAction_])
    async AllAIActions(@Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('AI Actions', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwAIActions]` + this.getRowLevelSecurityWhereClause('AI Actions', userPayload, EntityPermissionType.Read, ' WHERE');
        const result = this.ArrayMapFieldNamesToCodeNames('AI Actions', await dataSource.query(sSQL));
        return result;
    }
      
    @FieldResolver(() => [mj_core_schema_server_object_types.AIModelAction_])
    async AIModelActionsArray(@Root() aiaction_: AIAction_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('AI Model Actions', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwAIModelActions] WHERE [AIActionID]=${aiaction_.ID} ` + this.getRowLevelSecurityWhereClause('AI Model Actions', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('AI Model Actions', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.EntityAIAction_])
    async EntityAIActionsArray(@Root() aiaction_: AIAction_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Entity AI Actions', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwEntityAIActions] WHERE [AIActionID]=${aiaction_.ID} ` + this.getRowLevelSecurityWhereClause('Entity AI Actions', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Entity AI Actions', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => AIAction_)
    async UpdateAIAction(
        @Arg('input', () => UpdateAIActionInput) input: UpdateAIActionInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <AIActionEntity>await new Metadata().GetEntityObject('AI Actions', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for AI Actions
            
            if (await entityObject.Save({ IgnoreDirtyState: true /*flag used because of LoadFromData() call above*/ })) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateAIActionInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateAIActionInput) {
        const i = input, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for AI Model Actions
//****************************************************************************
@ObjectType({ description: 'Tracks the actions supported by each AI Model' })
export class AIModelAction_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field(() => Int) 
    AIModelID: number;
          
    @Field(() => Int) 
    AIActionID: number;
          
    @Field(() => Boolean) 
    IsActive: boolean;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
          
    @Field() 
    @MaxLength(100)
    AIModel: string;
          
    @Field() 
    @MaxLength(100)
    AIAction: string;
        
}
        
//****************************************************************************
// INPUT TYPE for AI Model Actions   
//****************************************************************************
@InputType()
export class UpdateAIModelActionInput {
    @Field(() => Int)
    ID: number;
    
    @Field(() => Int)
    AIModelID: number;
    
    @Field(() => Int)
    AIActionID: number;
    
    @Field(() => Boolean)
    IsActive: boolean;
    }
    
//****************************************************************************
// RESOLVER for AI Model Actions
//****************************************************************************
@ObjectType()
export class RunAIModelActionViewResult {
    @Field(() => [AIModelAction_])
    Results: AIModelAction_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(AIModelAction_)
export class AIModelActionResolver extends ResolverBase {
    @Query(() => RunAIModelActionViewResult)
    async RunAIModelActionViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunAIModelActionViewResult)
    async RunAIModelActionViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunAIModelActionViewResult)
    async RunAIModelActionDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'AI Model Actions';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => AIModelAction_, { nullable: true })
    async AIModelAction(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AIModelAction_ | null> {
        this.CheckUserReadPermissions('AI Model Actions', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwAIModelActions] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('AI Model Actions', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('AI Model Actions', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Query(() => [AIModelAction_])
    async AllAIModelActions(@Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('AI Model Actions', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwAIModelActions]` + this.getRowLevelSecurityWhereClause('AI Model Actions', userPayload, EntityPermissionType.Read, ' WHERE');
        const result = this.ArrayMapFieldNamesToCodeNames('AI Model Actions', await dataSource.query(sSQL));
        return result;
    }
    
    @Mutation(() => AIModelAction_)
    async UpdateAIModelAction(
        @Arg('input', () => UpdateAIModelActionInput) input: UpdateAIModelActionInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <AIModelActionEntity>await new Metadata().GetEntityObject('AI Model Actions', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for AI Model Actions
            
            if (await entityObject.Save({ IgnoreDirtyState: true /*flag used because of LoadFromData() call above*/ })) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateAIModelActionInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateAIModelActionInput) {
        const i = input, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for Entity AI Actions
//****************************************************************************
@ObjectType({ description: 'Tracks the AI actions that should be invoked based on changes to records within a given entity.' })
export class EntityAIAction_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field(() => Int) 
    EntityID: number;
          
    @Field(() => Int) 
    AIActionID: number;
          
    @Field(() => Int, {nullable: true}) 
    AIModelID?: number;
          
    @Field() 
    @MaxLength(50)
    Name: string;
          
    @Field({nullable: true}) 
    Prompt?: string;
          
    @Field() 
    @MaxLength(30)
    TriggerEvent: string;
          
    @Field() 
    UserMessage: string;
          
    @Field() 
    @MaxLength(20)
    OutputType: string;
          
    @Field({nullable: true}) 
    @MaxLength(100)
    OutputField?: string;
          
    @Field(() => Boolean) 
    SkipIfOutputFieldNotEmpty: boolean;
          
    @Field(() => Int, {nullable: true}) 
    OutputEntityID?: number;
          
    @Field({nullable: true}) 
    Comments?: string;
          
    @Field() 
    @MaxLength(510)
    Entity: string;
          
    @Field() 
    @MaxLength(100)
    AIAction: string;
          
    @Field({nullable: true}) 
    @MaxLength(100)
    AIModel?: string;
          
    @Field({nullable: true}) 
    @MaxLength(510)
    OutputEntity?: string;
        
}
        
//****************************************************************************
// INPUT TYPE for Entity AI Actions   
//****************************************************************************
@InputType()
export class UpdateEntityAIActionInput {
    @Field(() => Int)
    ID: number;
    
    @Field(() => Int)
    EntityID: number;
    
    @Field(() => Int)
    AIActionID: number;
    
    @Field(() => Int, { nullable: true })
    AIModelID: number;
    
    @Field()
    Name: string;
    
    @Field({ nullable: true })
    Prompt: string;
    
    @Field()
    TriggerEvent: string;
    
    @Field()
    UserMessage: string;
    
    @Field()
    OutputType: string;
    
    @Field({ nullable: true })
    OutputField: string;
    
    @Field(() => Boolean)
    SkipIfOutputFieldNotEmpty: boolean;
    
    @Field(() => Int, { nullable: true })
    OutputEntityID: number;
    
    @Field({ nullable: true })
    Comments: string;
    }
    
//****************************************************************************
// RESOLVER for Entity AI Actions
//****************************************************************************
@ObjectType()
export class RunEntityAIActionViewResult {
    @Field(() => [EntityAIAction_])
    Results: EntityAIAction_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(EntityAIAction_)
export class EntityAIActionResolver extends ResolverBase {
    @Query(() => RunEntityAIActionViewResult)
    async RunEntityAIActionViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunEntityAIActionViewResult)
    async RunEntityAIActionViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunEntityAIActionViewResult)
    async RunEntityAIActionDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Entity AI Actions';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => EntityAIAction_, { nullable: true })
    async EntityAIAction(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<EntityAIAction_ | null> {
        this.CheckUserReadPermissions('Entity AI Actions', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwEntityAIActions] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Entity AI Actions', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Entity AI Actions', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Query(() => [EntityAIAction_])
    async AllEntityAIActions(@Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Entity AI Actions', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwEntityAIActions]` + this.getRowLevelSecurityWhereClause('Entity AI Actions', userPayload, EntityPermissionType.Read, ' WHERE');
        const result = this.ArrayMapFieldNamesToCodeNames('Entity AI Actions', await dataSource.query(sSQL));
        return result;
    }
    
    @Mutation(() => EntityAIAction_)
    async UpdateEntityAIAction(
        @Arg('input', () => UpdateEntityAIActionInput) input: UpdateEntityAIActionInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <EntityAIActionEntity>await new Metadata().GetEntityObject('Entity AI Actions', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for Entity AI Actions
            
            if (await entityObject.Save({ IgnoreDirtyState: true /*flag used because of LoadFromData() call above*/ })) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateEntityAIActionInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateEntityAIActionInput) {
        const i = input, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for AI Model Types
//****************************************************************************
@ObjectType({ description: 'Types of AI Models' })
export class AIModelType_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field() 
    @MaxLength(100)
    Name: string;
          
    @Field({nullable: true}) 
    Description?: string;
        
    @Field(() => [mj_core_schema_server_object_types.AIModel_])
    AIModelsArray: mj_core_schema_server_object_types.AIModel_[]; // Link to AIModels
    
}
        
//****************************************************************************
// INPUT TYPE for AI Model Types   
//****************************************************************************
@InputType()
export class UpdateAIModelTypeInput {
    @Field(() => Int)
    ID: number;
    
    @Field()
    Name: string;
    
    @Field({ nullable: true })
    Description: string;
    }
    
//****************************************************************************
// RESOLVER for AI Model Types
//****************************************************************************
@ObjectType()
export class RunAIModelTypeViewResult {
    @Field(() => [AIModelType_])
    Results: AIModelType_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(AIModelType_)
export class AIModelTypeResolver extends ResolverBase {
    @Query(() => RunAIModelTypeViewResult)
    async RunAIModelTypeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunAIModelTypeViewResult)
    async RunAIModelTypeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunAIModelTypeViewResult)
    async RunAIModelTypeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'AI Model Types';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => AIModelType_, { nullable: true })
    async AIModelType(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AIModelType_ | null> {
        this.CheckUserReadPermissions('AI Model Types', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwAIModelTypes] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('AI Model Types', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('AI Model Types', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Query(() => [AIModelType_])
    async AllAIModelTypes(@Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('AI Model Types', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwAIModelTypes]` + this.getRowLevelSecurityWhereClause('AI Model Types', userPayload, EntityPermissionType.Read, ' WHERE');
        const result = this.ArrayMapFieldNamesToCodeNames('AI Model Types', await dataSource.query(sSQL));
        return result;
    }
      
    @FieldResolver(() => [mj_core_schema_server_object_types.AIModel_])
    async AIModelsArray(@Root() aimodeltype_: AIModelType_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('AI Models', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwAIModels] WHERE [AIModelTypeID]=${aimodeltype_.ID} ` + this.getRowLevelSecurityWhereClause('AI Models', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('AI Models', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => AIModelType_)
    async UpdateAIModelType(
        @Arg('input', () => UpdateAIModelTypeInput) input: UpdateAIModelTypeInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <AIModelTypeEntity>await new Metadata().GetEntityObject('AI Model Types', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for AI Model Types
            
            if (await entityObject.Save({ IgnoreDirtyState: true /*flag used because of LoadFromData() call above*/ })) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateAIModelTypeInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateAIModelTypeInput) {
        const i = input, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for Queue Types
//****************************************************************************
@ObjectType()
export class QueueType_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field() 
    @MaxLength(100)
    Name: string;
          
    @Field({nullable: true}) 
    Description?: string;
          
    @Field() 
    @MaxLength(200)
    DriverClass: string;
          
    @Field({nullable: true}) 
    @MaxLength(400)
    DriverImportPath?: string;
          
    @Field(() => Boolean) 
    IsActive: boolean;
        
    @Field(() => [mj_core_schema_server_object_types.Queue_])
    QueuesArray: mj_core_schema_server_object_types.Queue_[]; // Link to Queues
    
}
//****************************************************************************
// RESOLVER for Queue Types
//****************************************************************************
@ObjectType()
export class RunQueueTypeViewResult {
    @Field(() => [QueueType_])
    Results: QueueType_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(QueueType_)
export class QueueTypeResolver extends ResolverBase {
    @Query(() => RunQueueTypeViewResult)
    async RunQueueTypeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunQueueTypeViewResult)
    async RunQueueTypeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunQueueTypeViewResult)
    async RunQueueTypeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Queue Types';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => QueueType_, { nullable: true })
    async QueueType(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<QueueType_ | null> {
        this.CheckUserReadPermissions('Queue Types', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwQueueTypes] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Queue Types', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Queue Types', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
      
    @FieldResolver(() => [mj_core_schema_server_object_types.Queue_])
    async QueuesArray(@Root() queuetype_: QueueType_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Queues', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwQueues] WHERE [QueueTypeID]=${queuetype_.ID} ` + this.getRowLevelSecurityWhereClause('Queues', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Queues', await dataSource.query(sSQL));
        return result;
    }
        
}

//****************************************************************************
// ENTITY CLASS for Queues
//****************************************************************************
@ObjectType({ description: 'Queues can be used to async execute long running tasks' })
export class Queue_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field() 
    @MaxLength(100)
    Name: string;
          
    @Field({nullable: true}) 
    Description?: string;
          
    @Field(() => Int) 
    QueueTypeID: number;
          
    @Field(() => Boolean) 
    IsActive: boolean;
          
    @Field(() => Int, {nullable: true}) 
    ProcessPID?: number;
          
    @Field({nullable: true}) 
    @MaxLength(60)
    ProcessPlatform?: string;
          
    @Field({nullable: true}) 
    @MaxLength(30)
    ProcessVersion?: string;
          
    @Field({nullable: true}) 
    @MaxLength(200)
    ProcessCwd?: string;
          
    @Field({nullable: true}) 
    @MaxLength(100)
    ProcessIPAddress?: string;
          
    @Field({nullable: true}) 
    @MaxLength(100)
    ProcessMacAddress?: string;
          
    @Field({nullable: true}) 
    @MaxLength(50)
    ProcessOSName?: string;
          
    @Field({nullable: true}) 
    @MaxLength(20)
    ProcessOSVersion?: string;
          
    @Field({nullable: true}) 
    @MaxLength(100)
    ProcessHostName?: string;
          
    @Field({nullable: true}) 
    @MaxLength(50)
    ProcessUserID?: string;
          
    @Field({nullable: true}) 
    @MaxLength(100)
    ProcessUserName?: string;
          
    @Field() 
    @MaxLength(8)
    LastHeartbeat: Date;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
          
    @Field() 
    @MaxLength(100)
    QueueType: string;
        
    @Field(() => [mj_core_schema_server_object_types.QueueTask_])
    QueueTasksArray: mj_core_schema_server_object_types.QueueTask_[]; // Link to QueueTasks
    
}
        
//****************************************************************************
// INPUT TYPE for Queues   
//****************************************************************************
@InputType()
export class CreateQueueInput {
    @Field()
    Name: string;
    
    @Field({ nullable: true })
    Description: string;
    
    @Field(() => Int)
    QueueTypeID: number;
    
    @Field(() => Boolean)
    IsActive: boolean;
    
    @Field(() => Int, { nullable: true })
    ProcessPID: number;
    
    @Field({ nullable: true })
    ProcessPlatform: string;
    
    @Field({ nullable: true })
    ProcessVersion: string;
    
    @Field({ nullable: true })
    ProcessCwd: string;
    
    @Field({ nullable: true })
    ProcessIPAddress: string;
    
    @Field({ nullable: true })
    ProcessMacAddress: string;
    
    @Field({ nullable: true })
    ProcessOSName: string;
    
    @Field({ nullable: true })
    ProcessOSVersion: string;
    
    @Field({ nullable: true })
    ProcessHostName: string;
    
    @Field({ nullable: true })
    ProcessUserID: string;
    
    @Field({ nullable: true })
    ProcessUserName: string;
    
    @Field()
    LastHeartbeat: Date;
    }
    
        
//****************************************************************************
// INPUT TYPE for Queues   
//****************************************************************************
@InputType()
export class UpdateQueueInput {
    @Field(() => Int)
    ID: number;
    
    @Field()
    Name: string;
    
    @Field({ nullable: true })
    Description: string;
    
    @Field(() => Int)
    QueueTypeID: number;
    
    @Field(() => Boolean)
    IsActive: boolean;
    
    @Field(() => Int, { nullable: true })
    ProcessPID: number;
    
    @Field({ nullable: true })
    ProcessPlatform: string;
    
    @Field({ nullable: true })
    ProcessVersion: string;
    
    @Field({ nullable: true })
    ProcessCwd: string;
    
    @Field({ nullable: true })
    ProcessIPAddress: string;
    
    @Field({ nullable: true })
    ProcessMacAddress: string;
    
    @Field({ nullable: true })
    ProcessOSName: string;
    
    @Field({ nullable: true })
    ProcessOSVersion: string;
    
    @Field({ nullable: true })
    ProcessHostName: string;
    
    @Field({ nullable: true })
    ProcessUserID: string;
    
    @Field({ nullable: true })
    ProcessUserName: string;
    
    @Field()
    LastHeartbeat: Date;
    }
    
//****************************************************************************
// RESOLVER for Queues
//****************************************************************************
@ObjectType()
export class RunQueueViewResult {
    @Field(() => [Queue_])
    Results: Queue_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(Queue_)
export class QueueResolver extends ResolverBase {
    @Query(() => RunQueueViewResult)
    async RunQueueViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunQueueViewResult)
    async RunQueueViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunQueueViewResult)
    async RunQueueDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Queues';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => Queue_, { nullable: true })
    async Queue(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Queue_ | null> {
        this.CheckUserReadPermissions('Queues', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwQueues] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Queues', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Queues', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
      
    @FieldResolver(() => [mj_core_schema_server_object_types.QueueTask_])
    async QueueTasksArray(@Root() queue_: Queue_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Queue Tasks', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwQueueTasks] WHERE [QueueID]=${queue_.ID} ` + this.getRowLevelSecurityWhereClause('Queue Tasks', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Queue Tasks', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => Queue_)
    async CreateQueue(
        @Arg('input', () => CreateQueueInput) input: CreateQueueInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <QueueEntity>await new Metadata().GetEntityObject('Queues', this.GetUserFromPayload(userPayload));
            await entityObject.NewRecord();
            entityObject.SetMany(input);
            if (await entityObject.Save()) {
                // save worked, fire the AfterCreate event and then return all the data
                await this.AfterCreate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else 
                // save failed, return null
                return null;
        }
        else    
            return null;
    }

    // Before/After CREATE Event Hooks for Sub-Classes to Override
    protected async BeforeCreate(dataSource: DataSource, input: CreateQueueInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateQueueInput) {
    }
        
    @Mutation(() => Queue_)
    async UpdateQueue(
        @Arg('input', () => UpdateQueueInput) input: UpdateQueueInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <QueueEntity>await new Metadata().GetEntityObject('Queues', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for Queues
            
            if (await entityObject.Save({ IgnoreDirtyState: true /*flag used because of LoadFromData() call above*/ })) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateQueueInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateQueueInput) {
        const i = input, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for Queue Tasks
//****************************************************************************
@ObjectType()
export class QueueTask_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field(() => Int) 
    QueueID: number;
          
    @Field() 
    @MaxLength(20)
    Status: string;
          
    @Field({nullable: true}) 
    @MaxLength(8)
    StartedAt?: Date;
          
    @Field({nullable: true}) 
    @MaxLength(8)
    EndedAt?: Date;
          
    @Field({nullable: true}) 
    Data?: string;
          
    @Field({nullable: true}) 
    Options?: string;
          
    @Field({nullable: true}) 
    Output?: string;
          
    @Field({nullable: true}) 
    ErrorMessage?: string;
          
    @Field({nullable: true}) 
    Comments?: string;
          
    @Field() 
    @MaxLength(100)
    Queue: string;
        
}
        
//****************************************************************************
// INPUT TYPE for Queue Tasks   
//****************************************************************************
@InputType()
export class CreateQueueTaskInput {
    @Field(() => Int)
    QueueID: number;
    
    @Field()
    Status: string;
    
    @Field({ nullable: true })
    StartedAt: Date;
    
    @Field({ nullable: true })
    EndedAt: Date;
    
    @Field({ nullable: true })
    Data: string;
    
    @Field({ nullable: true })
    Options: string;
    
    @Field({ nullable: true })
    Output: string;
    
    @Field({ nullable: true })
    ErrorMessage: string;
    
    @Field({ nullable: true })
    Comments: string;
    }
    
        
//****************************************************************************
// INPUT TYPE for Queue Tasks   
//****************************************************************************
@InputType()
export class UpdateQueueTaskInput {
    @Field(() => Int)
    ID: number;
    
    @Field(() => Int)
    QueueID: number;
    
    @Field()
    Status: string;
    
    @Field({ nullable: true })
    StartedAt: Date;
    
    @Field({ nullable: true })
    EndedAt: Date;
    
    @Field({ nullable: true })
    Data: string;
    
    @Field({ nullable: true })
    Options: string;
    
    @Field({ nullable: true })
    Output: string;
    
    @Field({ nullable: true })
    ErrorMessage: string;
    
    @Field({ nullable: true })
    Comments: string;
    }
    
//****************************************************************************
// RESOLVER for Queue Tasks
//****************************************************************************
@ObjectType()
export class RunQueueTaskViewResult {
    @Field(() => [QueueTask_])
    Results: QueueTask_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(QueueTask_)
export class QueueTaskResolver extends ResolverBase {
    @Query(() => RunQueueTaskViewResult)
    async RunQueueTaskViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunQueueTaskViewResult)
    async RunQueueTaskViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunQueueTaskViewResult)
    async RunQueueTaskDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Queue Tasks';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => QueueTask_, { nullable: true })
    async QueueTask(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<QueueTask_ | null> {
        this.CheckUserReadPermissions('Queue Tasks', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwQueueTasks] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Queue Tasks', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Queue Tasks', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => QueueTask_)
    async CreateQueueTask(
        @Arg('input', () => CreateQueueTaskInput) input: CreateQueueTaskInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <QueueTaskEntity>await new Metadata().GetEntityObject('Queue Tasks', this.GetUserFromPayload(userPayload));
            await entityObject.NewRecord();
            entityObject.SetMany(input);
            if (await entityObject.Save()) {
                // save worked, fire the AfterCreate event and then return all the data
                await this.AfterCreate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else 
                // save failed, return null
                return null;
        }
        else    
            return null;
    }

    // Before/After CREATE Event Hooks for Sub-Classes to Override
    protected async BeforeCreate(dataSource: DataSource, input: CreateQueueTaskInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateQueueTaskInput) {
    }
        
    @Mutation(() => QueueTask_)
    async UpdateQueueTask(
        @Arg('input', () => UpdateQueueTaskInput) input: UpdateQueueTaskInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <QueueTaskEntity>await new Metadata().GetEntityObject('Queue Tasks', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for Queue Tasks
            
            if (await entityObject.Save({ IgnoreDirtyState: true /*flag used because of LoadFromData() call above*/ })) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateQueueTaskInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateQueueTaskInput) {
        const i = input, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for Dashboards
//****************************************************************************
@ObjectType({ description: 'Dashboards are used to group resources into a single display pane for an end-user' })
export class Dashboard_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field() 
    @MaxLength(510)
    Name: string;
          
    @Field({nullable: true}) 
    Description?: string;
          
    @Field(() => Int, {nullable: true}) 
    CategoryID?: number;
          
    @Field() 
    UIConfigDetails: string;
          
    @Field(() => Int, {nullable: true}) 
    UserID?: number;
          
    @Field({nullable: true}) 
    @MaxLength(200)
    Category?: string;
          
    @Field({nullable: true}) 
    @MaxLength(200)
    User?: string;
        
}
        
//****************************************************************************
// INPUT TYPE for Dashboards   
//****************************************************************************
@InputType()
export class CreateDashboardInput {
    @Field()
    Name: string;
    
    @Field({ nullable: true })
    Description: string;
    
    @Field(() => Int, { nullable: true })
    CategoryID: number;
    
    @Field()
    UIConfigDetails: string;
    
    @Field(() => Int, { nullable: true })
    UserID: number;
    }
    
        
//****************************************************************************
// INPUT TYPE for Dashboards   
//****************************************************************************
@InputType()
export class UpdateDashboardInput {
    @Field(() => Int)
    ID: number;
    
    @Field()
    Name: string;
    
    @Field({ nullable: true })
    Description: string;
    
    @Field(() => Int, { nullable: true })
    CategoryID: number;
    
    @Field()
    UIConfigDetails: string;
    
    @Field(() => Int, { nullable: true })
    UserID: number;
    }
    
//****************************************************************************
// RESOLVER for Dashboards
//****************************************************************************
@ObjectType()
export class RunDashboardViewResult {
    @Field(() => [Dashboard_])
    Results: Dashboard_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(Dashboard_)
export class DashboardResolver extends ResolverBase {
    @Query(() => RunDashboardViewResult)
    async RunDashboardViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunDashboardViewResult)
    async RunDashboardViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunDashboardViewResult)
    async RunDashboardDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Dashboards';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => Dashboard_, { nullable: true })
    async Dashboard(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Dashboard_ | null> {
        this.CheckUserReadPermissions('Dashboards', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwDashboards] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Dashboards', userPayload, EntityPermissionType.Read, 'AND');
        this.createRecordAccessAuditLogRecord(userPayload, 'Dashboards', ID)
        const result = this.MapFieldNamesToCodeNames('Dashboards', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => Dashboard_)
    async CreateDashboard(
        @Arg('input', () => CreateDashboardInput) input: CreateDashboardInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <DashboardEntity>await new Metadata().GetEntityObject('Dashboards', this.GetUserFromPayload(userPayload));
            await entityObject.NewRecord();
            entityObject.SetMany(input);
            if (await entityObject.Save()) {
                // save worked, fire the AfterCreate event and then return all the data
                await this.AfterCreate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else 
                // save failed, return null
                return null;
        }
        else    
            return null;
    }

    // Before/After CREATE Event Hooks for Sub-Classes to Override
    protected async BeforeCreate(dataSource: DataSource, input: CreateDashboardInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateDashboardInput) {
    }
        
    @Mutation(() => Dashboard_)
    async UpdateDashboard(
        @Arg('input', () => UpdateDashboardInput) input: UpdateDashboardInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <DashboardEntity>await new Metadata().GetEntityObject('Dashboards', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for Dashboards
            
            if (await entityObject.Save({ IgnoreDirtyState: true /*flag used because of LoadFromData() call above*/ })) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateDashboardInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateDashboardInput) {
        const i = input, d = dataSource; // prevent error
    }
    
    @Mutation(() => Dashboard_)
    async DeleteDashboard(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        if (await this.BeforeDelete(dataSource, ID)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <DashboardEntity>await new Metadata().GetEntityObject('Dashboards', this.GetUserFromPayload(userPayload));
            await entityObject.Load(ID);
            const returnValue = entityObject.GetAll(); // grab the values before we delete so we can return last state before delete if we are successful.
            if (await entityObject.Delete()) {
                await this.AfterDelete(dataSource, ID); // fire event
                return returnValue;
            }
            else 
                return null; // delete failed, this will cause an exception
        }
        else
            return null; // BeforeDelete canceled the operation, this will cause an exception
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeDelete(dataSource: DataSource, ID: number): Promise<boolean> {
        const i = ID, d = dataSource; // prevent error;
        return true;
    }
    protected async AfterDelete(dataSource: DataSource, ID: number) {
        const i = ID, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for Output Trigger Types
//****************************************************************************
@ObjectType()
export class OutputTriggerType_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field() 
    @MaxLength(510)
    Name: string;
          
    @Field({nullable: true}) 
    Description?: string;
        
    @Field(() => [mj_core_schema_server_object_types.Report_])
    ReportsArray: mj_core_schema_server_object_types.Report_[]; // Link to Reports
    
}
//****************************************************************************
// RESOLVER for Output Trigger Types
//****************************************************************************
@ObjectType()
export class RunOutputTriggerTypeViewResult {
    @Field(() => [OutputTriggerType_])
    Results: OutputTriggerType_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(OutputTriggerType_)
export class OutputTriggerTypeResolver extends ResolverBase {
    @Query(() => RunOutputTriggerTypeViewResult)
    async RunOutputTriggerTypeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunOutputTriggerTypeViewResult)
    async RunOutputTriggerTypeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunOutputTriggerTypeViewResult)
    async RunOutputTriggerTypeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Output Trigger Types';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => OutputTriggerType_, { nullable: true })
    async OutputTriggerType(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<OutputTriggerType_ | null> {
        this.CheckUserReadPermissions('Output Trigger Types', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwOutputTriggerTypes] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Output Trigger Types', userPayload, EntityPermissionType.Read, 'AND');
        this.createRecordAccessAuditLogRecord(userPayload, 'Output Trigger Types', ID)
        const result = this.MapFieldNamesToCodeNames('Output Trigger Types', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
      
    @FieldResolver(() => [mj_core_schema_server_object_types.Report_])
    async ReportsArray(@Root() outputtriggertype_: OutputTriggerType_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Reports', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwReports] WHERE [OutputTriggerTypeID]=${outputtriggertype_.ID} ` + this.getRowLevelSecurityWhereClause('Reports', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Reports', await dataSource.query(sSQL));
        return result;
    }
        
}

//****************************************************************************
// ENTITY CLASS for Output Format Types
//****************************************************************************
@ObjectType()
export class OutputFormatType_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field() 
    @MaxLength(510)
    Name: string;
          
    @Field({nullable: true}) 
    Description?: string;
          
    @Field({nullable: true}) 
    DisplayFormat?: string;
        
    @Field(() => [mj_core_schema_server_object_types.Report_])
    ReportsArray: mj_core_schema_server_object_types.Report_[]; // Link to Reports
    
}
//****************************************************************************
// RESOLVER for Output Format Types
//****************************************************************************
@ObjectType()
export class RunOutputFormatTypeViewResult {
    @Field(() => [OutputFormatType_])
    Results: OutputFormatType_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(OutputFormatType_)
export class OutputFormatTypeResolver extends ResolverBase {
    @Query(() => RunOutputFormatTypeViewResult)
    async RunOutputFormatTypeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunOutputFormatTypeViewResult)
    async RunOutputFormatTypeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunOutputFormatTypeViewResult)
    async RunOutputFormatTypeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Output Format Types';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => OutputFormatType_, { nullable: true })
    async OutputFormatType(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<OutputFormatType_ | null> {
        this.CheckUserReadPermissions('Output Format Types', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwOutputFormatTypes] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Output Format Types', userPayload, EntityPermissionType.Read, 'AND');
        this.createRecordAccessAuditLogRecord(userPayload, 'Output Format Types', ID)
        const result = this.MapFieldNamesToCodeNames('Output Format Types', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
      
    @FieldResolver(() => [mj_core_schema_server_object_types.Report_])
    async ReportsArray(@Root() outputformattype_: OutputFormatType_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Reports', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwReports] WHERE [OutputFormatTypeID]=${outputformattype_.ID} ` + this.getRowLevelSecurityWhereClause('Reports', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Reports', await dataSource.query(sSQL));
        return result;
    }
        
}

//****************************************************************************
// ENTITY CLASS for Output Delivery Types
//****************************************************************************
@ObjectType()
export class OutputDeliveryType_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field() 
    @MaxLength(510)
    Name: string;
          
    @Field({nullable: true}) 
    Description?: string;
        
    @Field(() => [mj_core_schema_server_object_types.Report_])
    ReportsArray: mj_core_schema_server_object_types.Report_[]; // Link to Reports
    
}
//****************************************************************************
// RESOLVER for Output Delivery Types
//****************************************************************************
@ObjectType()
export class RunOutputDeliveryTypeViewResult {
    @Field(() => [OutputDeliveryType_])
    Results: OutputDeliveryType_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(OutputDeliveryType_)
export class OutputDeliveryTypeResolver extends ResolverBase {
    @Query(() => RunOutputDeliveryTypeViewResult)
    async RunOutputDeliveryTypeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunOutputDeliveryTypeViewResult)
    async RunOutputDeliveryTypeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunOutputDeliveryTypeViewResult)
    async RunOutputDeliveryTypeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Output Delivery Types';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => OutputDeliveryType_, { nullable: true })
    async OutputDeliveryType(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<OutputDeliveryType_ | null> {
        this.CheckUserReadPermissions('Output Delivery Types', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwOutputDeliveryTypes] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Output Delivery Types', userPayload, EntityPermissionType.Read, 'AND');
        this.createRecordAccessAuditLogRecord(userPayload, 'Output Delivery Types', ID)
        const result = this.MapFieldNamesToCodeNames('Output Delivery Types', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
      
    @FieldResolver(() => [mj_core_schema_server_object_types.Report_])
    async ReportsArray(@Root() outputdeliverytype_: OutputDeliveryType_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Reports', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwReports] WHERE [OutputDeliveryTypeID]=${outputdeliverytype_.ID} ` + this.getRowLevelSecurityWhereClause('Reports', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Reports', await dataSource.query(sSQL));
        return result;
    }
        
}

//****************************************************************************
// ENTITY CLASS for Reports
//****************************************************************************
@ObjectType()
export class Report_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field() 
    @MaxLength(510)
    Name: string;
          
    @Field({nullable: true}) 
    Description?: string;
          
    @Field(() => Int, {nullable: true}) 
    CategoryID?: number;
          
    @Field(() => Int) 
    UserID: number;
          
    @Field() 
    @MaxLength(40)
    SharingScope: string;
          
    @Field(() => Int, {nullable: true}) 
    ConversationID?: number;
          
    @Field(() => Int, {nullable: true}) 
    ConversationDetailID?: number;
          
    @Field(() => Int, {nullable: true}) 
    DataContextID?: number;
          
    @Field({nullable: true}) 
    Configuration?: string;
          
    @Field(() => Int, {nullable: true}) 
    OutputTriggerTypeID?: number;
          
    @Field(() => Int, {nullable: true}) 
    OutputFormatTypeID?: number;
          
    @Field(() => Int, {nullable: true}) 
    OutputDeliveryTypeID?: number;
          
    @Field(() => Int, {nullable: true}) 
    OutputEventID?: number;
          
    @Field({nullable: true}) 
    @MaxLength(100)
    OutputFrequency?: string;
          
    @Field({nullable: true}) 
    @MaxLength(510)
    OutputTargetEmail?: string;
          
    @Field(() => Int, {nullable: true}) 
    OutputWorkflowID?: number;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
          
    @Field({nullable: true}) 
    @MaxLength(200)
    Category?: string;
          
    @Field() 
    @MaxLength(200)
    User: string;
          
    @Field({nullable: true}) 
    @MaxLength(200)
    Conversation?: string;
          
    @Field({nullable: true}) 
    @MaxLength(510)
    DataContext?: string;
          
    @Field({nullable: true}) 
    @MaxLength(510)
    OutputTriggerType?: string;
          
    @Field({nullable: true}) 
    @MaxLength(510)
    OutputFormatType?: string;
          
    @Field({nullable: true}) 
    @MaxLength(510)
    OutputDeliveryType?: string;
          
    @Field({nullable: true}) 
    @MaxLength(510)
    OutputEvent?: string;
          
    @Field({nullable: true}) 
    @MaxLength(200)
    OutputWorkflow?: string;
        
    @Field(() => [mj_core_schema_server_object_types.ReportSnapshot_])
    ReportSnapshotsArray: mj_core_schema_server_object_types.ReportSnapshot_[]; // Link to ReportSnapshots
    
}
        
//****************************************************************************
// INPUT TYPE for Reports   
//****************************************************************************
@InputType()
export class CreateReportInput {
    @Field()
    Name: string;
    
    @Field({ nullable: true })
    Description: string;
    
    @Field(() => Int, { nullable: true })
    CategoryID: number;
    
    @Field(() => Int)
    UserID: number;
    
    @Field()
    SharingScope: string;
    
    @Field(() => Int, { nullable: true })
    ConversationID: number;
    
    @Field(() => Int, { nullable: true })
    ConversationDetailID: number;
    
    @Field(() => Int, { nullable: true })
    DataContextID: number;
    
    @Field({ nullable: true })
    Configuration: string;
    
    @Field(() => Int, { nullable: true })
    OutputTriggerTypeID: number;
    
    @Field(() => Int, { nullable: true })
    OutputFormatTypeID: number;
    
    @Field(() => Int, { nullable: true })
    OutputDeliveryTypeID: number;
    
    @Field(() => Int, { nullable: true })
    OutputEventID: number;
    
    @Field({ nullable: true })
    OutputFrequency: string;
    
    @Field({ nullable: true })
    OutputTargetEmail: string;
    
    @Field(() => Int, { nullable: true })
    OutputWorkflowID: number;
    }
    
        
//****************************************************************************
// INPUT TYPE for Reports   
//****************************************************************************
@InputType()
export class UpdateReportInput {
    @Field(() => Int)
    ID: number;
    
    @Field()
    Name: string;
    
    @Field({ nullable: true })
    Description: string;
    
    @Field(() => Int, { nullable: true })
    CategoryID: number;
    
    @Field(() => Int)
    UserID: number;
    
    @Field()
    SharingScope: string;
    
    @Field(() => Int, { nullable: true })
    ConversationID: number;
    
    @Field(() => Int, { nullable: true })
    ConversationDetailID: number;
    
    @Field(() => Int, { nullable: true })
    DataContextID: number;
    
    @Field({ nullable: true })
    Configuration: string;
    
    @Field(() => Int, { nullable: true })
    OutputTriggerTypeID: number;
    
    @Field(() => Int, { nullable: true })
    OutputFormatTypeID: number;
    
    @Field(() => Int, { nullable: true })
    OutputDeliveryTypeID: number;
    
    @Field(() => Int, { nullable: true })
    OutputEventID: number;
    
    @Field({ nullable: true })
    OutputFrequency: string;
    
    @Field({ nullable: true })
    OutputTargetEmail: string;
    
    @Field(() => Int, { nullable: true })
    OutputWorkflowID: number;
    }
    
//****************************************************************************
// RESOLVER for Reports
//****************************************************************************
@ObjectType()
export class RunReportViewResult {
    @Field(() => [Report_])
    Results: Report_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(Report_)
export class ReportResolver extends ResolverBase {
    @Query(() => RunReportViewResult)
    async RunReportViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunReportViewResult)
    async RunReportViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunReportViewResult)
    async RunReportDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Reports';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => Report_, { nullable: true })
    async Report(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Report_ | null> {
        this.CheckUserReadPermissions('Reports', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwReports] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Reports', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Reports', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
      
    @FieldResolver(() => [mj_core_schema_server_object_types.ReportSnapshot_])
    async ReportSnapshotsArray(@Root() report_: Report_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Report Snapshots', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwReportSnapshots] WHERE [ReportID]=${report_.ID} ` + this.getRowLevelSecurityWhereClause('Report Snapshots', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Report Snapshots', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => Report_)
    async CreateReport(
        @Arg('input', () => CreateReportInput) input: CreateReportInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <ReportEntity>await new Metadata().GetEntityObject('Reports', this.GetUserFromPayload(userPayload));
            await entityObject.NewRecord();
            entityObject.SetMany(input);
            if (await entityObject.Save()) {
                // save worked, fire the AfterCreate event and then return all the data
                await this.AfterCreate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else 
                // save failed, return null
                return null;
        }
        else    
            return null;
    }

    // Before/After CREATE Event Hooks for Sub-Classes to Override
    protected async BeforeCreate(dataSource: DataSource, input: CreateReportInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateReportInput) {
    }
        
    @Mutation(() => Report_)
    async UpdateReport(
        @Arg('input', () => UpdateReportInput) input: UpdateReportInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <ReportEntity>await new Metadata().GetEntityObject('Reports', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for Reports
            
            if (await entityObject.Save({ IgnoreDirtyState: true /*flag used because of LoadFromData() call above*/ })) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateReportInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateReportInput) {
        const i = input, d = dataSource; // prevent error
    }
    
    @Mutation(() => Report_)
    async DeleteReport(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        if (await this.BeforeDelete(dataSource, ID)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <ReportEntity>await new Metadata().GetEntityObject('Reports', this.GetUserFromPayload(userPayload));
            await entityObject.Load(ID);
            const returnValue = entityObject.GetAll(); // grab the values before we delete so we can return last state before delete if we are successful.
            if (await entityObject.Delete()) {
                await this.AfterDelete(dataSource, ID); // fire event
                return returnValue;
            }
            else 
                return null; // delete failed, this will cause an exception
        }
        else
            return null; // BeforeDelete canceled the operation, this will cause an exception
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeDelete(dataSource: DataSource, ID: number): Promise<boolean> {
        const i = ID, d = dataSource; // prevent error;
        return true;
    }
    protected async AfterDelete(dataSource: DataSource, ID: number) {
        const i = ID, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for Report Snapshots
//****************************************************************************
@ObjectType()
export class ReportSnapshot_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field(() => Int) 
    ReportID: number;
          
    @Field() 
    ResultSet: string;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field(() => Int, {nullable: true}) 
    UserID?: number;
          
    @Field() 
    @MaxLength(510)
    Report: string;
          
    @Field({nullable: true}) 
    @MaxLength(200)
    User?: string;
        
}
        
//****************************************************************************
// INPUT TYPE for Report Snapshots   
//****************************************************************************
@InputType()
export class CreateReportSnapshotInput {
    @Field(() => Int)
    ReportID: number;
    
    @Field()
    ResultSet: string;
    
    @Field(() => Int, { nullable: true })
    UserID: number;
    }
    
        
//****************************************************************************
// INPUT TYPE for Report Snapshots   
//****************************************************************************
@InputType()
export class UpdateReportSnapshotInput {
    @Field(() => Int)
    ID: number;
    
    @Field(() => Int)
    ReportID: number;
    
    @Field()
    ResultSet: string;
    
    @Field(() => Int, { nullable: true })
    UserID: number;
    }
    
//****************************************************************************
// RESOLVER for Report Snapshots
//****************************************************************************
@ObjectType()
export class RunReportSnapshotViewResult {
    @Field(() => [ReportSnapshot_])
    Results: ReportSnapshot_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(ReportSnapshot_)
export class ReportSnapshotResolver extends ResolverBase {
    @Query(() => RunReportSnapshotViewResult)
    async RunReportSnapshotViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunReportSnapshotViewResult)
    async RunReportSnapshotViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunReportSnapshotViewResult)
    async RunReportSnapshotDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Report Snapshots';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => ReportSnapshot_, { nullable: true })
    async ReportSnapshot(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<ReportSnapshot_ | null> {
        this.CheckUserReadPermissions('Report Snapshots', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwReportSnapshots] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Report Snapshots', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Report Snapshots', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => ReportSnapshot_)
    async CreateReportSnapshot(
        @Arg('input', () => CreateReportSnapshotInput) input: CreateReportSnapshotInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <ReportSnapshotEntity>await new Metadata().GetEntityObject('Report Snapshots', this.GetUserFromPayload(userPayload));
            await entityObject.NewRecord();
            entityObject.SetMany(input);
            if (await entityObject.Save()) {
                // save worked, fire the AfterCreate event and then return all the data
                await this.AfterCreate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else 
                // save failed, return null
                return null;
        }
        else    
            return null;
    }

    // Before/After CREATE Event Hooks for Sub-Classes to Override
    protected async BeforeCreate(dataSource: DataSource, input: CreateReportSnapshotInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateReportSnapshotInput) {
    }
        
    @Mutation(() => ReportSnapshot_)
    async UpdateReportSnapshot(
        @Arg('input', () => UpdateReportSnapshotInput) input: UpdateReportSnapshotInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <ReportSnapshotEntity>await new Metadata().GetEntityObject('Report Snapshots', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for Report Snapshots
            
            if (await entityObject.Save({ IgnoreDirtyState: true /*flag used because of LoadFromData() call above*/ })) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateReportSnapshotInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateReportSnapshotInput) {
        const i = input, d = dataSource; // prevent error
    }
    
    @Mutation(() => ReportSnapshot_)
    async DeleteReportSnapshot(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        if (await this.BeforeDelete(dataSource, ID)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <ReportSnapshotEntity>await new Metadata().GetEntityObject('Report Snapshots', this.GetUserFromPayload(userPayload));
            await entityObject.Load(ID);
            const returnValue = entityObject.GetAll(); // grab the values before we delete so we can return last state before delete if we are successful.
            if (await entityObject.Delete()) {
                await this.AfterDelete(dataSource, ID); // fire event
                return returnValue;
            }
            else 
                return null; // delete failed, this will cause an exception
        }
        else
            return null; // BeforeDelete canceled the operation, this will cause an exception
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeDelete(dataSource: DataSource, ID: number): Promise<boolean> {
        const i = ID, d = dataSource; // prevent error;
        return true;
    }
    protected async AfterDelete(dataSource: DataSource, ID: number) {
        const i = ID, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for Resource Types
//****************************************************************************
@ObjectType()
export class ResourceType_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field() 
    @MaxLength(510)
    Name: string;
          
    @Field() 
    @MaxLength(510)
    DisplayName: string;
          
    @Field({nullable: true}) 
    Description?: string;
          
    @Field({nullable: true}) 
    @MaxLength(200)
    Icon?: string;
          
    @Field(() => Int, {nullable: true}) 
    EntityID?: number;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
          
    @Field({nullable: true}) 
    @MaxLength(510)
    Entity?: string;
        
    @Field(() => [mj_core_schema_server_object_types.WorkspaceItem_])
    WorkspaceItemsArray: mj_core_schema_server_object_types.WorkspaceItem_[]; // Link to WorkspaceItems
    
}
//****************************************************************************
// RESOLVER for Resource Types
//****************************************************************************
@ObjectType()
export class RunResourceTypeViewResult {
    @Field(() => [ResourceType_])
    Results: ResourceType_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(ResourceType_)
export class ResourceTypeResolver extends ResolverBase {
    @Query(() => RunResourceTypeViewResult)
    async RunResourceTypeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunResourceTypeViewResult)
    async RunResourceTypeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunResourceTypeViewResult)
    async RunResourceTypeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Resource Types';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => ResourceType_, { nullable: true })
    async ResourceType(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<ResourceType_ | null> {
        this.CheckUserReadPermissions('Resource Types', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwResourceTypes] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Resource Types', userPayload, EntityPermissionType.Read, 'AND');
        this.createRecordAccessAuditLogRecord(userPayload, 'Resource Types', ID)
        const result = this.MapFieldNamesToCodeNames('Resource Types', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
      
    @FieldResolver(() => [mj_core_schema_server_object_types.WorkspaceItem_])
    async WorkspaceItemsArray(@Root() resourcetype_: ResourceType_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Workspace Items', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwWorkspaceItems] WHERE [ResourceTypeID]=${resourcetype_.ID} ` + this.getRowLevelSecurityWhereClause('Workspace Items', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Workspace Items', await dataSource.query(sSQL));
        return result;
    }
        
}

//****************************************************************************
// ENTITY CLASS for Tags
//****************************************************************************
@ObjectType({ description: 'Tags are used to arbitrarily associate any record in any entity with addtional information.' })
export class Tag_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field() 
    @MaxLength(510)
    Name: string;
          
    @Field() 
    @MaxLength(510)
    DisplayName: string;
          
    @Field({nullable: true}) 
    Description?: string;
          
    @Field(() => Int, {nullable: true}) 
    ParentID?: number;
          
    @Field({nullable: true}) 
    @MaxLength(510)
    Parent?: string;
        
    @Field(() => [mj_core_schema_server_object_types.Tag_])
    TagsArray: mj_core_schema_server_object_types.Tag_[]; // Link to Tags
    
    @Field(() => [mj_core_schema_server_object_types.TaggedItem_])
    TaggedItemsArray: mj_core_schema_server_object_types.TaggedItem_[]; // Link to TaggedItems
    
}
//****************************************************************************
// RESOLVER for Tags
//****************************************************************************
@ObjectType()
export class RunTagViewResult {
    @Field(() => [Tag_])
    Results: Tag_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(Tag_)
export class TagResolver extends ResolverBase {
    @Query(() => RunTagViewResult)
    async RunTagViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunTagViewResult)
    async RunTagViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunTagViewResult)
    async RunTagDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Tags';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => Tag_, { nullable: true })
    async Tag(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Tag_ | null> {
        this.CheckUserReadPermissions('Tags', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwTags] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Tags', userPayload, EntityPermissionType.Read, 'AND');
        this.createRecordAccessAuditLogRecord(userPayload, 'Tags', ID)
        const result = this.MapFieldNamesToCodeNames('Tags', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
      
    @FieldResolver(() => [mj_core_schema_server_object_types.Tag_])
    async TagsArray(@Root() tag_: Tag_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Tags', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwTags] WHERE [ParentID]=${tag_.ID} ` + this.getRowLevelSecurityWhereClause('Tags', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Tags', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.TaggedItem_])
    async TaggedItemsArray(@Root() tag_: Tag_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Tagged Items', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwTaggedItems] WHERE [TagID]=${tag_.ID} ` + this.getRowLevelSecurityWhereClause('Tagged Items', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Tagged Items', await dataSource.query(sSQL));
        return result;
    }
        
}

//****************************************************************************
// ENTITY CLASS for Tagged Items
//****************************************************************************
@ObjectType({ description: 'Tracks the links between any record in any entity with Tags' })
export class TaggedItem_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field(() => Int) 
    TagID: number;
          
    @Field(() => Int) 
    EntityID: number;
          
    @Field() 
    @MaxLength(510)
    RecordID: string;
          
    @Field() 
    @MaxLength(510)
    Tag: string;
          
    @Field() 
    @MaxLength(510)
    Entity: string;
        
}
//****************************************************************************
// RESOLVER for Tagged Items
//****************************************************************************
@ObjectType()
export class RunTaggedItemViewResult {
    @Field(() => [TaggedItem_])
    Results: TaggedItem_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(TaggedItem_)
export class TaggedItemResolver extends ResolverBase {
    @Query(() => RunTaggedItemViewResult)
    async RunTaggedItemViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunTaggedItemViewResult)
    async RunTaggedItemViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunTaggedItemViewResult)
    async RunTaggedItemDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Tagged Items';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => TaggedItem_, { nullable: true })
    async TaggedItem(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<TaggedItem_ | null> {
        this.CheckUserReadPermissions('Tagged Items', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwTaggedItems] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Tagged Items', userPayload, EntityPermissionType.Read, 'AND');
        this.createRecordAccessAuditLogRecord(userPayload, 'Tagged Items', ID)
        const result = this.MapFieldNamesToCodeNames('Tagged Items', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
}

//****************************************************************************
// ENTITY CLASS for Workspaces
//****************************************************************************
@ObjectType({ description: 'A user can have one or more workspaces' })
export class Workspace_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field() 
    @MaxLength(510)
    Name: string;
          
    @Field({nullable: true}) 
    Description?: string;
          
    @Field(() => Int) 
    UserID: number;
          
    @Field() 
    @MaxLength(200)
    User: string;
        
    @Field(() => [mj_core_schema_server_object_types.WorkspaceItem_])
    WorkspaceItemsArray: mj_core_schema_server_object_types.WorkspaceItem_[]; // Link to WorkspaceItems
    
}
        
//****************************************************************************
// INPUT TYPE for Workspaces   
//****************************************************************************
@InputType()
export class CreateWorkspaceInput {
    @Field()
    Name: string;
    
    @Field({ nullable: true })
    Description: string;
    
    @Field(() => Int)
    UserID: number;
    }
    
        
//****************************************************************************
// INPUT TYPE for Workspaces   
//****************************************************************************
@InputType()
export class UpdateWorkspaceInput {
    @Field(() => Int)
    ID: number;
    
    @Field()
    Name: string;
    
    @Field({ nullable: true })
    Description: string;
    
    @Field(() => Int)
    UserID: number;
    }
    
//****************************************************************************
// RESOLVER for Workspaces
//****************************************************************************
@ObjectType()
export class RunWorkspaceViewResult {
    @Field(() => [Workspace_])
    Results: Workspace_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(Workspace_)
export class WorkspaceResolver extends ResolverBase {
    @Query(() => RunWorkspaceViewResult)
    async RunWorkspaceViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunWorkspaceViewResult)
    async RunWorkspaceViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunWorkspaceViewResult)
    async RunWorkspaceDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Workspaces';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => Workspace_, { nullable: true })
    async Workspace(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Workspace_ | null> {
        this.CheckUserReadPermissions('Workspaces', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwWorkspaces] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Workspaces', userPayload, EntityPermissionType.Read, 'AND');
        this.createRecordAccessAuditLogRecord(userPayload, 'Workspaces', ID)
        const result = this.MapFieldNamesToCodeNames('Workspaces', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
      
    @FieldResolver(() => [mj_core_schema_server_object_types.WorkspaceItem_])
    async WorkspaceItemsArray(@Root() workspace_: Workspace_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Workspace Items', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwWorkspaceItems] WHERE [WorkSpaceID]=${workspace_.ID} ` + this.getRowLevelSecurityWhereClause('Workspace Items', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Workspace Items', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => Workspace_)
    async CreateWorkspace(
        @Arg('input', () => CreateWorkspaceInput) input: CreateWorkspaceInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <WorkspaceEntity>await new Metadata().GetEntityObject('Workspaces', this.GetUserFromPayload(userPayload));
            await entityObject.NewRecord();
            entityObject.SetMany(input);
            if (await entityObject.Save()) {
                // save worked, fire the AfterCreate event and then return all the data
                await this.AfterCreate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else 
                // save failed, return null
                return null;
        }
        else    
            return null;
    }

    // Before/After CREATE Event Hooks for Sub-Classes to Override
    protected async BeforeCreate(dataSource: DataSource, input: CreateWorkspaceInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateWorkspaceInput) {
    }
        
    @Mutation(() => Workspace_)
    async UpdateWorkspace(
        @Arg('input', () => UpdateWorkspaceInput) input: UpdateWorkspaceInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <WorkspaceEntity>await new Metadata().GetEntityObject('Workspaces', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for Workspaces
            
            if (await entityObject.Save({ IgnoreDirtyState: true /*flag used because of LoadFromData() call above*/ })) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateWorkspaceInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateWorkspaceInput) {
        const i = input, d = dataSource; // prevent error
    }
    
    @Mutation(() => Workspace_)
    async DeleteWorkspace(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        if (await this.BeforeDelete(dataSource, ID)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <WorkspaceEntity>await new Metadata().GetEntityObject('Workspaces', this.GetUserFromPayload(userPayload));
            await entityObject.Load(ID);
            const returnValue = entityObject.GetAll(); // grab the values before we delete so we can return last state before delete if we are successful.
            if (await entityObject.Delete()) {
                await this.AfterDelete(dataSource, ID); // fire event
                return returnValue;
            }
            else 
                return null; // delete failed, this will cause an exception
        }
        else
            return null; // BeforeDelete canceled the operation, this will cause an exception
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeDelete(dataSource: DataSource, ID: number): Promise<boolean> {
        const i = ID, d = dataSource; // prevent error;
        return true;
    }
    protected async AfterDelete(dataSource: DataSource, ID: number) {
        const i = ID, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for Workspace Items
//****************************************************************************
@ObjectType({ description: 'Tracks the resources that are active within a given worksapce' })
export class WorkspaceItem_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field() 
    @MaxLength(510)
    Name: string;
          
    @Field({nullable: true}) 
    Description?: string;
          
    @Field(() => Int) 
    WorkSpaceID: number;
          
    @Field(() => Int) 
    ResourceTypeID: number;
          
    @Field({nullable: true}) 
    @MaxLength(510)
    ResourceRecordID?: string;
          
    @Field(() => Int) 
    Sequence: number;
          
    @Field({nullable: true}) 
    Configuration?: string;
          
    @Field() 
    @MaxLength(510)
    WorkSpace: string;
          
    @Field() 
    @MaxLength(510)
    ResourceType: string;
        
}
        
//****************************************************************************
// INPUT TYPE for Workspace Items   
//****************************************************************************
@InputType()
export class CreateWorkspaceItemInput {
    @Field()
    Name: string;
    
    @Field({ nullable: true })
    Description: string;
    
    @Field(() => Int)
    WorkSpaceID: number;
    
    @Field(() => Int)
    ResourceTypeID: number;
    
    @Field({ nullable: true })
    ResourceRecordID: string;
    
    @Field(() => Int)
    Sequence: number;
    
    @Field({ nullable: true })
    Configuration: string;
    }
    
        
//****************************************************************************
// INPUT TYPE for Workspace Items   
//****************************************************************************
@InputType()
export class UpdateWorkspaceItemInput {
    @Field(() => Int)
    ID: number;
    
    @Field()
    Name: string;
    
    @Field({ nullable: true })
    Description: string;
    
    @Field(() => Int)
    WorkSpaceID: number;
    
    @Field(() => Int)
    ResourceTypeID: number;
    
    @Field({ nullable: true })
    ResourceRecordID: string;
    
    @Field(() => Int)
    Sequence: number;
    
    @Field({ nullable: true })
    Configuration: string;
    }
    
//****************************************************************************
// RESOLVER for Workspace Items
//****************************************************************************
@ObjectType()
export class RunWorkspaceItemViewResult {
    @Field(() => [WorkspaceItem_])
    Results: WorkspaceItem_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(WorkspaceItem_)
export class WorkspaceItemResolver extends ResolverBase {
    @Query(() => RunWorkspaceItemViewResult)
    async RunWorkspaceItemViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunWorkspaceItemViewResult)
    async RunWorkspaceItemViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunWorkspaceItemViewResult)
    async RunWorkspaceItemDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Workspace Items';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => WorkspaceItem_, { nullable: true })
    async WorkspaceItem(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<WorkspaceItem_ | null> {
        this.CheckUserReadPermissions('Workspace Items', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwWorkspaceItems] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Workspace Items', userPayload, EntityPermissionType.Read, 'AND');
        this.createRecordAccessAuditLogRecord(userPayload, 'Workspace Items', ID)
        const result = this.MapFieldNamesToCodeNames('Workspace Items', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => WorkspaceItem_)
    async CreateWorkspaceItem(
        @Arg('input', () => CreateWorkspaceItemInput) input: CreateWorkspaceItemInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <WorkspaceItemEntity>await new Metadata().GetEntityObject('Workspace Items', this.GetUserFromPayload(userPayload));
            await entityObject.NewRecord();
            entityObject.SetMany(input);
            if (await entityObject.Save()) {
                // save worked, fire the AfterCreate event and then return all the data
                await this.AfterCreate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else 
                // save failed, return null
                return null;
        }
        else    
            return null;
    }

    // Before/After CREATE Event Hooks for Sub-Classes to Override
    protected async BeforeCreate(dataSource: DataSource, input: CreateWorkspaceItemInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateWorkspaceItemInput) {
    }
        
    @Mutation(() => WorkspaceItem_)
    async UpdateWorkspaceItem(
        @Arg('input', () => UpdateWorkspaceItemInput) input: UpdateWorkspaceItemInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <WorkspaceItemEntity>await new Metadata().GetEntityObject('Workspace Items', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for Workspace Items
            
            if (await entityObject.Save({ IgnoreDirtyState: true /*flag used because of LoadFromData() call above*/ })) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateWorkspaceItemInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateWorkspaceItemInput) {
        const i = input, d = dataSource; // prevent error
    }
    
    @Mutation(() => WorkspaceItem_)
    async DeleteWorkspaceItem(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        if (await this.BeforeDelete(dataSource, ID)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <WorkspaceItemEntity>await new Metadata().GetEntityObject('Workspace Items', this.GetUserFromPayload(userPayload));
            await entityObject.Load(ID);
            const returnValue = entityObject.GetAll(); // grab the values before we delete so we can return last state before delete if we are successful.
            if (await entityObject.Delete()) {
                await this.AfterDelete(dataSource, ID); // fire event
                return returnValue;
            }
            else 
                return null; // delete failed, this will cause an exception
        }
        else
            return null; // BeforeDelete canceled the operation, this will cause an exception
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeDelete(dataSource: DataSource, ID: number): Promise<boolean> {
        const i = ID, d = dataSource; // prevent error;
        return true;
    }
    protected async AfterDelete(dataSource: DataSource, ID: number) {
        const i = ID, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for Datasets
//****************************************************************************
@ObjectType({ description: 'Cacheable sets of data that can span one or more items' })
export class Dataset_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field() 
    @MaxLength(100)
    Name: string;
          
    @Field({nullable: true}) 
    Description?: string;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
        
    @Field(() => [mj_core_schema_server_object_types.DatasetItem_])
    DatasetItemsArray: mj_core_schema_server_object_types.DatasetItem_[]; // Link to DatasetItems
    
}
//****************************************************************************
// RESOLVER for Datasets
//****************************************************************************
@ObjectType()
export class RunDatasetViewResult {
    @Field(() => [Dataset_])
    Results: Dataset_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(Dataset_)
export class DatasetResolver extends ResolverBase {
    @Query(() => RunDatasetViewResult)
    async RunDatasetViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunDatasetViewResult)
    async RunDatasetViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunDatasetViewResult)
    async RunDatasetDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Datasets';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => Dataset_, { nullable: true })
    async Dataset(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Dataset_ | null> {
        this.CheckUserReadPermissions('Datasets', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwDatasets] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Datasets', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Datasets', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
      
    @FieldResolver(() => [mj_core_schema_server_object_types.DatasetItem_])
    async DatasetItemsArray(@Root() dataset_: Dataset_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Dataset Items', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwDatasetItems] WHERE [DatasetName]=${dataset_.ID} ` + this.getRowLevelSecurityWhereClause('Dataset Items', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Dataset Items', await dataSource.query(sSQL));
        return result;
    }
        
}

//****************************************************************************
// ENTITY CLASS for Dataset Items
//****************************************************************************
@ObjectType({ description: 'A single item in a Dataset and can be sourced from multiple methods.' })
export class DatasetItem_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field() 
    @MaxLength(100)
    Code: string;
          
    @Field({nullable: true}) 
    @MaxLength(100)
    DatasetName?: string;
          
    @Field(() => Int) 
    Sequence: number;
          
    @Field(() => Int) 
    EntityID: number;
          
    @Field({nullable: true}) 
    WhereClause?: string;
          
    @Field() 
    @MaxLength(200)
    DateFieldToCheck: string;
          
    @Field({nullable: true}) 
    Description?: string;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
          
    @Field() 
    @MaxLength(510)
    Entity: string;
        
}
//****************************************************************************
// RESOLVER for Dataset Items
//****************************************************************************
@ObjectType()
export class RunDatasetItemViewResult {
    @Field(() => [DatasetItem_])
    Results: DatasetItem_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(DatasetItem_)
export class DatasetItemResolver extends ResolverBase {
    @Query(() => RunDatasetItemViewResult)
    async RunDatasetItemViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunDatasetItemViewResult)
    async RunDatasetItemViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunDatasetItemViewResult)
    async RunDatasetItemDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Dataset Items';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => DatasetItem_, { nullable: true })
    async DatasetItem(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<DatasetItem_ | null> {
        this.CheckUserReadPermissions('Dataset Items', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwDatasetItems] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Dataset Items', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Dataset Items', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
}

//****************************************************************************
// ENTITY CLASS for Conversation Details
//****************************************************************************
@ObjectType()
export class ConversationDetail_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field(() => Int) 
    ConversationID: number;
          
    @Field({nullable: true}) 
    @MaxLength(200)
    ExternalID?: string;
          
    @Field() 
    @MaxLength(40)
    Role: string;
          
    @Field() 
    Message: string;
          
    @Field({nullable: true}) 
    Error?: string;
          
    @Field(() => Boolean) 
    HiddenToUser: boolean;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
          
    @Field({nullable: true}) 
    @MaxLength(200)
    Conversation?: string;
        
    @Field(() => [mj_core_schema_server_object_types.Report_])
    ReportsArray: mj_core_schema_server_object_types.Report_[]; // Link to Reports
    
}
        
//****************************************************************************
// INPUT TYPE for Conversation Details   
//****************************************************************************
@InputType()
export class CreateConversationDetailInput {
    @Field(() => Int)
    ConversationID: number;
    
    @Field({ nullable: true })
    ExternalID: string;
    
    @Field()
    Role: string;
    
    @Field()
    Message: string;
    
    @Field({ nullable: true })
    Error: string;
    
    @Field(() => Boolean)
    HiddenToUser: boolean;
    }
    
        
//****************************************************************************
// INPUT TYPE for Conversation Details   
//****************************************************************************
@InputType()
export class UpdateConversationDetailInput {
    @Field(() => Int)
    ID: number;
    
    @Field(() => Int)
    ConversationID: number;
    
    @Field({ nullable: true })
    ExternalID: string;
    
    @Field()
    Role: string;
    
    @Field()
    Message: string;
    
    @Field({ nullable: true })
    Error: string;
    
    @Field(() => Boolean)
    HiddenToUser: boolean;
    }
    
//****************************************************************************
// RESOLVER for Conversation Details
//****************************************************************************
@ObjectType()
export class RunConversationDetailViewResult {
    @Field(() => [ConversationDetail_])
    Results: ConversationDetail_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(ConversationDetail_)
export class ConversationDetailResolver extends ResolverBase {
    @Query(() => RunConversationDetailViewResult)
    async RunConversationDetailViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunConversationDetailViewResult)
    async RunConversationDetailViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunConversationDetailViewResult)
    async RunConversationDetailDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Conversation Details';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => ConversationDetail_, { nullable: true })
    async ConversationDetail(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<ConversationDetail_ | null> {
        this.CheckUserReadPermissions('Conversation Details', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwConversationDetails] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Conversation Details', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Conversation Details', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
      
    @FieldResolver(() => [mj_core_schema_server_object_types.Report_])
    async ReportsArray(@Root() conversationdetail_: ConversationDetail_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Reports', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwReports] WHERE [ConversationDetailID]=${conversationdetail_.ID} ` + this.getRowLevelSecurityWhereClause('Reports', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Reports', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => ConversationDetail_)
    async CreateConversationDetail(
        @Arg('input', () => CreateConversationDetailInput) input: CreateConversationDetailInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <ConversationDetailEntity>await new Metadata().GetEntityObject('Conversation Details', this.GetUserFromPayload(userPayload));
            await entityObject.NewRecord();
            entityObject.SetMany(input);
            if (await entityObject.Save()) {
                // save worked, fire the AfterCreate event and then return all the data
                await this.AfterCreate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else 
                // save failed, return null
                return null;
        }
        else    
            return null;
    }

    // Before/After CREATE Event Hooks for Sub-Classes to Override
    protected async BeforeCreate(dataSource: DataSource, input: CreateConversationDetailInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateConversationDetailInput) {
    }
        
    @Mutation(() => ConversationDetail_)
    async UpdateConversationDetail(
        @Arg('input', () => UpdateConversationDetailInput) input: UpdateConversationDetailInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <ConversationDetailEntity>await new Metadata().GetEntityObject('Conversation Details', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for Conversation Details
            
            if (await entityObject.Save({ IgnoreDirtyState: true /*flag used because of LoadFromData() call above*/ })) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateConversationDetailInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateConversationDetailInput) {
        const i = input, d = dataSource; // prevent error
    }
    
    @Mutation(() => ConversationDetail_)
    async DeleteConversationDetail(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        if (await this.BeforeDelete(dataSource, ID)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <ConversationDetailEntity>await new Metadata().GetEntityObject('Conversation Details', this.GetUserFromPayload(userPayload));
            await entityObject.Load(ID);
            const returnValue = entityObject.GetAll(); // grab the values before we delete so we can return last state before delete if we are successful.
            if (await entityObject.Delete()) {
                await this.AfterDelete(dataSource, ID); // fire event
                return returnValue;
            }
            else 
                return null; // delete failed, this will cause an exception
        }
        else
            return null; // BeforeDelete canceled the operation, this will cause an exception
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeDelete(dataSource: DataSource, ID: number): Promise<boolean> {
        const i = ID, d = dataSource; // prevent error;
        return true;
    }
    protected async AfterDelete(dataSource: DataSource, ID: number) {
        const i = ID, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for Conversations
//****************************************************************************
@ObjectType()
export class Conversation_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field(() => Int) 
    UserID: number;
          
    @Field({nullable: true}) 
    @MaxLength(200)
    ExternalID?: string;
          
    @Field({nullable: true}) 
    @MaxLength(200)
    Name?: string;
          
    @Field({nullable: true}) 
    Description?: string;
          
    @Field() 
    @MaxLength(100)
    Type: string;
          
    @Field(() => Boolean) 
    IsArchived: boolean;
          
    @Field(() => Int, {nullable: true}) 
    LinkedEntityID?: number;
          
    @Field(() => Int, {nullable: true}) 
    LinkedRecordID?: number;
          
    @Field(() => Int, {nullable: true}) 
    DataContextID?: number;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
          
    @Field() 
    @MaxLength(200)
    User: string;
          
    @Field({nullable: true}) 
    @MaxLength(510)
    LinkedEntity?: string;
        
    @Field(() => [mj_core_schema_server_object_types.ConversationDetail_])
    ConversationDetailsArray: mj_core_schema_server_object_types.ConversationDetail_[]; // Link to ConversationDetails
    
    @Field(() => [mj_core_schema_server_object_types.Report_])
    ReportsArray: mj_core_schema_server_object_types.Report_[]; // Link to Reports
    
}
        
//****************************************************************************
// INPUT TYPE for Conversations   
//****************************************************************************
@InputType()
export class CreateConversationInput {
    @Field(() => Int)
    UserID: number;
    
    @Field({ nullable: true })
    ExternalID: string;
    
    @Field({ nullable: true })
    Name: string;
    
    @Field({ nullable: true })
    Description: string;
    
    @Field()
    Type: string;
    
    @Field(() => Boolean)
    IsArchived: boolean;
    
    @Field(() => Int, { nullable: true })
    LinkedEntityID: number;
    
    @Field(() => Int, { nullable: true })
    LinkedRecordID: number;
    
    @Field(() => Int, { nullable: true })
    DataContextID: number;
    }
    
        
//****************************************************************************
// INPUT TYPE for Conversations   
//****************************************************************************
@InputType()
export class UpdateConversationInput {
    @Field(() => Int)
    ID: number;
    
    @Field(() => Int)
    UserID: number;
    
    @Field({ nullable: true })
    ExternalID: string;
    
    @Field({ nullable: true })
    Name: string;
    
    @Field({ nullable: true })
    Description: string;
    
    @Field()
    Type: string;
    
    @Field(() => Boolean)
    IsArchived: boolean;
    
    @Field(() => Int, { nullable: true })
    LinkedEntityID: number;
    
    @Field(() => Int, { nullable: true })
    LinkedRecordID: number;
    
    @Field(() => Int, { nullable: true })
    DataContextID: number;
    }
    
//****************************************************************************
// RESOLVER for Conversations
//****************************************************************************
@ObjectType()
export class RunConversationViewResult {
    @Field(() => [Conversation_])
    Results: Conversation_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(Conversation_)
export class ConversationResolver extends ResolverBase {
    @Query(() => RunConversationViewResult)
    async RunConversationViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunConversationViewResult)
    async RunConversationViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunConversationViewResult)
    async RunConversationDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Conversations';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => Conversation_, { nullable: true })
    async Conversation(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Conversation_ | null> {
        this.CheckUserReadPermissions('Conversations', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwConversations] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Conversations', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Conversations', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
      
    @FieldResolver(() => [mj_core_schema_server_object_types.ConversationDetail_])
    async ConversationDetailsArray(@Root() conversation_: Conversation_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Conversation Details', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwConversationDetails] WHERE [ConversationID]=${conversation_.ID} ` + this.getRowLevelSecurityWhereClause('Conversation Details', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Conversation Details', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.Report_])
    async ReportsArray(@Root() conversation_: Conversation_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Reports', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwReports] WHERE [ConversationID]=${conversation_.ID} ` + this.getRowLevelSecurityWhereClause('Reports', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Reports', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => Conversation_)
    async CreateConversation(
        @Arg('input', () => CreateConversationInput) input: CreateConversationInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <ConversationEntity>await new Metadata().GetEntityObject('Conversations', this.GetUserFromPayload(userPayload));
            await entityObject.NewRecord();
            entityObject.SetMany(input);
            if (await entityObject.Save()) {
                // save worked, fire the AfterCreate event and then return all the data
                await this.AfterCreate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else 
                // save failed, return null
                return null;
        }
        else    
            return null;
    }

    // Before/After CREATE Event Hooks for Sub-Classes to Override
    protected async BeforeCreate(dataSource: DataSource, input: CreateConversationInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateConversationInput) {
    }
        
    @Mutation(() => Conversation_)
    async UpdateConversation(
        @Arg('input', () => UpdateConversationInput) input: UpdateConversationInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <ConversationEntity>await new Metadata().GetEntityObject('Conversations', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for Conversations
            
            if (await entityObject.Save({ IgnoreDirtyState: true /*flag used because of LoadFromData() call above*/ })) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateConversationInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateConversationInput) {
        const i = input, d = dataSource; // prevent error
    }
    
    @Mutation(() => Conversation_)
    async DeleteConversation(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        if (await this.BeforeDelete(dataSource, ID)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <ConversationEntity>await new Metadata().GetEntityObject('Conversations', this.GetUserFromPayload(userPayload));
            await entityObject.Load(ID);
            const returnValue = entityObject.GetAll(); // grab the values before we delete so we can return last state before delete if we are successful.
            if (await entityObject.Delete()) {
                await this.AfterDelete(dataSource, ID); // fire event
                return returnValue;
            }
            else 
                return null; // delete failed, this will cause an exception
        }
        else
            return null; // BeforeDelete canceled the operation, this will cause an exception
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeDelete(dataSource: DataSource, ID: number): Promise<boolean> {
        const i = ID, d = dataSource; // prevent error;
        return true;
    }
    protected async AfterDelete(dataSource: DataSource, ID: number) {
        const i = ID, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for User Notifications
//****************************************************************************
@ObjectType()
export class UserNotification_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field(() => Int) 
    UserID: number;
          
    @Field({nullable: true}) 
    @MaxLength(510)
    Title?: string;
          
    @Field({nullable: true}) 
    Message?: string;
          
    @Field(() => Int, {nullable: true}) 
    ResourceTypeID?: number;
          
    @Field(() => Int, {nullable: true}) 
    ResourceRecordID?: number;
          
    @Field({nullable: true}) 
    ResourceConfiguration?: string;
          
    @Field(() => Boolean) 
    Unread: boolean;
          
    @Field({nullable: true}) 
    @MaxLength(8)
    ReadAt?: Date;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
          
    @Field() 
    @MaxLength(200)
    User: string;
        
}
        
//****************************************************************************
// INPUT TYPE for User Notifications   
//****************************************************************************
@InputType()
export class CreateUserNotificationInput {
    @Field(() => Int)
    UserID: number;
    
    @Field({ nullable: true })
    Title: string;
    
    @Field({ nullable: true })
    Message: string;
    
    @Field(() => Int, { nullable: true })
    ResourceTypeID: number;
    
    @Field(() => Int, { nullable: true })
    ResourceRecordID: number;
    
    @Field({ nullable: true })
    ResourceConfiguration: string;
    
    @Field(() => Boolean)
    Unread: boolean;
    
    @Field({ nullable: true })
    ReadAt: Date;
    }
    
        
//****************************************************************************
// INPUT TYPE for User Notifications   
//****************************************************************************
@InputType()
export class UpdateUserNotificationInput {
    @Field(() => Int)
    ID: number;
    
    @Field(() => Int)
    UserID: number;
    
    @Field({ nullable: true })
    Title: string;
    
    @Field({ nullable: true })
    Message: string;
    
    @Field(() => Int, { nullable: true })
    ResourceTypeID: number;
    
    @Field(() => Int, { nullable: true })
    ResourceRecordID: number;
    
    @Field({ nullable: true })
    ResourceConfiguration: string;
    
    @Field(() => Boolean)
    Unread: boolean;
    
    @Field({ nullable: true })
    ReadAt: Date;
    }
    
//****************************************************************************
// RESOLVER for User Notifications
//****************************************************************************
@ObjectType()
export class RunUserNotificationViewResult {
    @Field(() => [UserNotification_])
    Results: UserNotification_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(UserNotification_)
export class UserNotificationResolver extends ResolverBase {
    @Query(() => RunUserNotificationViewResult)
    async RunUserNotificationViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunUserNotificationViewResult)
    async RunUserNotificationViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunUserNotificationViewResult)
    async RunUserNotificationDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'User Notifications';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => UserNotification_, { nullable: true })
    async UserNotification(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<UserNotification_ | null> {
        this.CheckUserReadPermissions('User Notifications', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwUserNotifications] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('User Notifications', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('User Notifications', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => UserNotification_)
    async CreateUserNotification(
        @Arg('input', () => CreateUserNotificationInput) input: CreateUserNotificationInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <UserNotificationEntity>await new Metadata().GetEntityObject('User Notifications', this.GetUserFromPayload(userPayload));
            await entityObject.NewRecord();
            entityObject.SetMany(input);
            if (await entityObject.Save()) {
                // save worked, fire the AfterCreate event and then return all the data
                await this.AfterCreate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else 
                // save failed, return null
                return null;
        }
        else    
            return null;
    }

    // Before/After CREATE Event Hooks for Sub-Classes to Override
    protected async BeforeCreate(dataSource: DataSource, input: CreateUserNotificationInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateUserNotificationInput) {
    }
        
    @Mutation(() => UserNotification_)
    async UpdateUserNotification(
        @Arg('input', () => UpdateUserNotificationInput) input: UpdateUserNotificationInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <UserNotificationEntity>await new Metadata().GetEntityObject('User Notifications', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for User Notifications
            
            if (await entityObject.Save({ IgnoreDirtyState: true /*flag used because of LoadFromData() call above*/ })) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateUserNotificationInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateUserNotificationInput) {
        const i = input, d = dataSource; // prevent error
    }
    
    @Mutation(() => UserNotification_)
    async DeleteUserNotification(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        if (await this.BeforeDelete(dataSource, ID)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <UserNotificationEntity>await new Metadata().GetEntityObject('User Notifications', this.GetUserFromPayload(userPayload));
            await entityObject.Load(ID);
            const returnValue = entityObject.GetAll(); // grab the values before we delete so we can return last state before delete if we are successful.
            if (await entityObject.Delete()) {
                await this.AfterDelete(dataSource, ID); // fire event
                return returnValue;
            }
            else 
                return null; // delete failed, this will cause an exception
        }
        else
            return null; // BeforeDelete canceled the operation, this will cause an exception
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeDelete(dataSource: DataSource, ID: number): Promise<boolean> {
        const i = ID, d = dataSource; // prevent error;
        return true;
    }
    protected async AfterDelete(dataSource: DataSource, ID: number) {
        const i = ID, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for Schema Info
//****************************************************************************
@ObjectType({ description: 'Tracks the schemas in the system and the ID ranges that are valid for entities within each schema.' })
export class SchemaInfo_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field() 
    @MaxLength(100)
    SchemaName: string;
          
    @Field(() => Int) 
    EntityIDMin: number;
          
    @Field(() => Int) 
    EntityIDMax: number;
          
    @Field({nullable: true}) 
    Comments?: string;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
        
}
        
//****************************************************************************
// INPUT TYPE for Schema Info   
//****************************************************************************
@InputType()
export class CreateSchemaInfoInput {
    @Field()
    SchemaName: string;
    
    @Field(() => Int)
    EntityIDMin: number;
    
    @Field(() => Int)
    EntityIDMax: number;
    
    @Field({ nullable: true })
    Comments: string;
    }
    
        
//****************************************************************************
// INPUT TYPE for Schema Info   
//****************************************************************************
@InputType()
export class UpdateSchemaInfoInput {
    @Field(() => Int)
    ID: number;
    
    @Field()
    SchemaName: string;
    
    @Field(() => Int)
    EntityIDMin: number;
    
    @Field(() => Int)
    EntityIDMax: number;
    
    @Field({ nullable: true })
    Comments: string;
    }
    
//****************************************************************************
// RESOLVER for Schema Info
//****************************************************************************
@ObjectType()
export class RunSchemaInfoViewResult {
    @Field(() => [SchemaInfo_])
    Results: SchemaInfo_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(SchemaInfo_)
export class SchemaInfoResolver extends ResolverBase {
    @Query(() => RunSchemaInfoViewResult)
    async RunSchemaInfoViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunSchemaInfoViewResult)
    async RunSchemaInfoViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunSchemaInfoViewResult)
    async RunSchemaInfoDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Schema Info';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => SchemaInfo_, { nullable: true })
    async SchemaInfo(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<SchemaInfo_ | null> {
        this.CheckUserReadPermissions('Schema Info', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwSchemaInfos] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Schema Info', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Schema Info', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => SchemaInfo_)
    async CreateSchemaInfo(
        @Arg('input', () => CreateSchemaInfoInput) input: CreateSchemaInfoInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <SchemaInfoEntity>await new Metadata().GetEntityObject('Schema Info', this.GetUserFromPayload(userPayload));
            await entityObject.NewRecord();
            entityObject.SetMany(input);
            if (await entityObject.Save()) {
                // save worked, fire the AfterCreate event and then return all the data
                await this.AfterCreate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else 
                // save failed, return null
                return null;
        }
        else    
            return null;
    }

    // Before/After CREATE Event Hooks for Sub-Classes to Override
    protected async BeforeCreate(dataSource: DataSource, input: CreateSchemaInfoInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateSchemaInfoInput) {
    }
        
    @Mutation(() => SchemaInfo_)
    async UpdateSchemaInfo(
        @Arg('input', () => UpdateSchemaInfoInput) input: UpdateSchemaInfoInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <SchemaInfoEntity>await new Metadata().GetEntityObject('Schema Info', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for Schema Info
            
            if (await entityObject.Save({ IgnoreDirtyState: true /*flag used because of LoadFromData() call above*/ })) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateSchemaInfoInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateSchemaInfoInput) {
        const i = input, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for Company Integration Record Maps
//****************************************************************************
@ObjectType()
export class CompanyIntegrationRecordMap_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field(() => Int) 
    CompanyIntegrationID: number;
          
    @Field() 
    @MaxLength(200)
    ExternalSystemRecordID: string;
          
    @Field(() => Int) 
    EntityID: number;
          
    @Field() 
    @MaxLength(510)
    EntityRecordID: string;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
          
    @Field() 
    @MaxLength(510)
    Entity: string;
        
}
        
//****************************************************************************
// INPUT TYPE for Company Integration Record Maps   
//****************************************************************************
@InputType()
export class CreateCompanyIntegrationRecordMapInput {
    @Field(() => Int)
    CompanyIntegrationID: number;
    
    @Field()
    ExternalSystemRecordID: string;
    
    @Field(() => Int)
    EntityID: number;
    
    @Field()
    EntityRecordID: string;
    }
    
        
//****************************************************************************
// INPUT TYPE for Company Integration Record Maps   
//****************************************************************************
@InputType()
export class UpdateCompanyIntegrationRecordMapInput {
    @Field(() => Int)
    ID: number;
    
    @Field(() => Int)
    CompanyIntegrationID: number;
    
    @Field()
    ExternalSystemRecordID: string;
    
    @Field(() => Int)
    EntityID: number;
    
    @Field()
    EntityRecordID: string;
    }
    
//****************************************************************************
// RESOLVER for Company Integration Record Maps
//****************************************************************************
@ObjectType()
export class RunCompanyIntegrationRecordMapViewResult {
    @Field(() => [CompanyIntegrationRecordMap_])
    Results: CompanyIntegrationRecordMap_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(CompanyIntegrationRecordMap_)
export class CompanyIntegrationRecordMapResolver extends ResolverBase {
    @Query(() => RunCompanyIntegrationRecordMapViewResult)
    async RunCompanyIntegrationRecordMapViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunCompanyIntegrationRecordMapViewResult)
    async RunCompanyIntegrationRecordMapViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunCompanyIntegrationRecordMapViewResult)
    async RunCompanyIntegrationRecordMapDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Company Integration Record Maps';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => CompanyIntegrationRecordMap_, { nullable: true })
    async CompanyIntegrationRecordMap(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<CompanyIntegrationRecordMap_ | null> {
        this.CheckUserReadPermissions('Company Integration Record Maps', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwCompanyIntegrationRecordMaps] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Company Integration Record Maps', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Company Integration Record Maps', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => CompanyIntegrationRecordMap_)
    async CreateCompanyIntegrationRecordMap(
        @Arg('input', () => CreateCompanyIntegrationRecordMapInput) input: CreateCompanyIntegrationRecordMapInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <CompanyIntegrationRecordMapEntity>await new Metadata().GetEntityObject('Company Integration Record Maps', this.GetUserFromPayload(userPayload));
            await entityObject.NewRecord();
            entityObject.SetMany(input);
            if (await entityObject.Save()) {
                // save worked, fire the AfterCreate event and then return all the data
                await this.AfterCreate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else 
                // save failed, return null
                return null;
        }
        else    
            return null;
    }

    // Before/After CREATE Event Hooks for Sub-Classes to Override
    protected async BeforeCreate(dataSource: DataSource, input: CreateCompanyIntegrationRecordMapInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateCompanyIntegrationRecordMapInput) {
    }
        
    @Mutation(() => CompanyIntegrationRecordMap_)
    async UpdateCompanyIntegrationRecordMap(
        @Arg('input', () => UpdateCompanyIntegrationRecordMapInput) input: UpdateCompanyIntegrationRecordMapInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <CompanyIntegrationRecordMapEntity>await new Metadata().GetEntityObject('Company Integration Record Maps', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for Company Integration Record Maps
            
            if (await entityObject.Save({ IgnoreDirtyState: true /*flag used because of LoadFromData() call above*/ })) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateCompanyIntegrationRecordMapInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateCompanyIntegrationRecordMapInput) {
        const i = input, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for Record Merge Logs
//****************************************************************************
@ObjectType()
export class RecordMergeLog_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field(() => Int) 
    EntityID: number;
          
    @Field() 
    @MaxLength(510)
    SurvivingRecordID: string;
          
    @Field(() => Int) 
    InitiatedByUserID: number;
          
    @Field() 
    @MaxLength(20)
    ApprovalStatus: string;
          
    @Field(() => Int, {nullable: true}) 
    ApprovedByUserID?: number;
          
    @Field() 
    @MaxLength(20)
    ProcessingStatus: string;
          
    @Field() 
    @MaxLength(8)
    ProcessingStartedAt: Date;
          
    @Field({nullable: true}) 
    @MaxLength(8)
    ProcessingEndedAt?: Date;
          
    @Field({nullable: true}) 
    ProcessingLog?: string;
          
    @Field({nullable: true}) 
    Comments?: string;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field({nullable: true}) 
    @MaxLength(8)
    UpdatedAt?: Date;
          
    @Field() 
    @MaxLength(510)
    Entity: string;
          
    @Field() 
    @MaxLength(200)
    InitiatedByUser: string;
        
    @Field(() => [mj_core_schema_server_object_types.RecordMergeDeletionLog_])
    RecordMergeDeletionLogsArray: mj_core_schema_server_object_types.RecordMergeDeletionLog_[]; // Link to RecordMergeDeletionLogs
    
}
        
//****************************************************************************
// INPUT TYPE for Record Merge Logs   
//****************************************************************************
@InputType()
export class CreateRecordMergeLogInput {
    @Field(() => Int)
    EntityID: number;
    
    @Field()
    SurvivingRecordID: string;
    
    @Field(() => Int)
    InitiatedByUserID: number;
    
    @Field()
    ApprovalStatus: string;
    
    @Field(() => Int, { nullable: true })
    ApprovedByUserID: number;
    
    @Field()
    ProcessingStatus: string;
    
    @Field()
    ProcessingStartedAt: Date;
    
    @Field({ nullable: true })
    ProcessingEndedAt: Date;
    
    @Field({ nullable: true })
    ProcessingLog: string;
    
    @Field({ nullable: true })
    Comments: string;
    }
    
        
//****************************************************************************
// INPUT TYPE for Record Merge Logs   
//****************************************************************************
@InputType()
export class UpdateRecordMergeLogInput {
    @Field(() => Int)
    ID: number;
    
    @Field(() => Int)
    EntityID: number;
    
    @Field()
    SurvivingRecordID: string;
    
    @Field(() => Int)
    InitiatedByUserID: number;
    
    @Field()
    ApprovalStatus: string;
    
    @Field(() => Int, { nullable: true })
    ApprovedByUserID: number;
    
    @Field()
    ProcessingStatus: string;
    
    @Field()
    ProcessingStartedAt: Date;
    
    @Field({ nullable: true })
    ProcessingEndedAt: Date;
    
    @Field({ nullable: true })
    ProcessingLog: string;
    
    @Field({ nullable: true })
    Comments: string;
    }
    
//****************************************************************************
// RESOLVER for Record Merge Logs
//****************************************************************************
@ObjectType()
export class RunRecordMergeLogViewResult {
    @Field(() => [RecordMergeLog_])
    Results: RecordMergeLog_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(RecordMergeLog_)
export class RecordMergeLogResolver extends ResolverBase {
    @Query(() => RunRecordMergeLogViewResult)
    async RunRecordMergeLogViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunRecordMergeLogViewResult)
    async RunRecordMergeLogViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunRecordMergeLogViewResult)
    async RunRecordMergeLogDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Record Merge Logs';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => RecordMergeLog_, { nullable: true })
    async RecordMergeLog(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<RecordMergeLog_ | null> {
        this.CheckUserReadPermissions('Record Merge Logs', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwRecordMergeLogs] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Record Merge Logs', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Record Merge Logs', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
      
    @FieldResolver(() => [mj_core_schema_server_object_types.RecordMergeDeletionLog_])
    async RecordMergeDeletionLogsArray(@Root() recordmergelog_: RecordMergeLog_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Record Merge Deletion Logs', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwRecordMergeDeletionLogs] WHERE [RecordMergeLogID]=${recordmergelog_.ID} ` + this.getRowLevelSecurityWhereClause('Record Merge Deletion Logs', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Record Merge Deletion Logs', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => RecordMergeLog_)
    async CreateRecordMergeLog(
        @Arg('input', () => CreateRecordMergeLogInput) input: CreateRecordMergeLogInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <RecordMergeLogEntity>await new Metadata().GetEntityObject('Record Merge Logs', this.GetUserFromPayload(userPayload));
            await entityObject.NewRecord();
            entityObject.SetMany(input);
            if (await entityObject.Save()) {
                // save worked, fire the AfterCreate event and then return all the data
                await this.AfterCreate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else 
                // save failed, return null
                return null;
        }
        else    
            return null;
    }

    // Before/After CREATE Event Hooks for Sub-Classes to Override
    protected async BeforeCreate(dataSource: DataSource, input: CreateRecordMergeLogInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateRecordMergeLogInput) {
    }
        
    @Mutation(() => RecordMergeLog_)
    async UpdateRecordMergeLog(
        @Arg('input', () => UpdateRecordMergeLogInput) input: UpdateRecordMergeLogInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <RecordMergeLogEntity>await new Metadata().GetEntityObject('Record Merge Logs', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for Record Merge Logs
            
            if (await entityObject.Save({ IgnoreDirtyState: true /*flag used because of LoadFromData() call above*/ })) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateRecordMergeLogInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateRecordMergeLogInput) {
        const i = input, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for Record Merge Deletion Logs
//****************************************************************************
@ObjectType()
export class RecordMergeDeletionLog_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field(() => Int) 
    RecordMergeLogID: number;
          
    @Field() 
    @MaxLength(510)
    DeletedRecordID: string;
          
    @Field() 
    @MaxLength(20)
    Status: string;
          
    @Field({nullable: true}) 
    ProcessingLog?: string;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
        
}
        
//****************************************************************************
// INPUT TYPE for Record Merge Deletion Logs   
//****************************************************************************
@InputType()
export class CreateRecordMergeDeletionLogInput {
    @Field(() => Int)
    RecordMergeLogID: number;
    
    @Field()
    DeletedRecordID: string;
    
    @Field()
    Status: string;
    
    @Field({ nullable: true })
    ProcessingLog: string;
    }
    
        
//****************************************************************************
// INPUT TYPE for Record Merge Deletion Logs   
//****************************************************************************
@InputType()
export class UpdateRecordMergeDeletionLogInput {
    @Field(() => Int)
    ID: number;
    
    @Field(() => Int)
    RecordMergeLogID: number;
    
    @Field()
    DeletedRecordID: string;
    
    @Field()
    Status: string;
    
    @Field({ nullable: true })
    ProcessingLog: string;
    }
    
//****************************************************************************
// RESOLVER for Record Merge Deletion Logs
//****************************************************************************
@ObjectType()
export class RunRecordMergeDeletionLogViewResult {
    @Field(() => [RecordMergeDeletionLog_])
    Results: RecordMergeDeletionLog_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(RecordMergeDeletionLog_)
export class RecordMergeDeletionLogResolver extends ResolverBase {
    @Query(() => RunRecordMergeDeletionLogViewResult)
    async RunRecordMergeDeletionLogViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunRecordMergeDeletionLogViewResult)
    async RunRecordMergeDeletionLogViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunRecordMergeDeletionLogViewResult)
    async RunRecordMergeDeletionLogDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Record Merge Deletion Logs';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => RecordMergeDeletionLog_, { nullable: true })
    async RecordMergeDeletionLog(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<RecordMergeDeletionLog_ | null> {
        this.CheckUserReadPermissions('Record Merge Deletion Logs', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwRecordMergeDeletionLogs] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Record Merge Deletion Logs', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Record Merge Deletion Logs', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => RecordMergeDeletionLog_)
    async CreateRecordMergeDeletionLog(
        @Arg('input', () => CreateRecordMergeDeletionLogInput) input: CreateRecordMergeDeletionLogInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <RecordMergeDeletionLogEntity>await new Metadata().GetEntityObject('Record Merge Deletion Logs', this.GetUserFromPayload(userPayload));
            await entityObject.NewRecord();
            entityObject.SetMany(input);
            if (await entityObject.Save()) {
                // save worked, fire the AfterCreate event and then return all the data
                await this.AfterCreate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else 
                // save failed, return null
                return null;
        }
        else    
            return null;
    }

    // Before/After CREATE Event Hooks for Sub-Classes to Override
    protected async BeforeCreate(dataSource: DataSource, input: CreateRecordMergeDeletionLogInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateRecordMergeDeletionLogInput) {
    }
        
    @Mutation(() => RecordMergeDeletionLog_)
    async UpdateRecordMergeDeletionLog(
        @Arg('input', () => UpdateRecordMergeDeletionLogInput) input: UpdateRecordMergeDeletionLogInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <RecordMergeDeletionLogEntity>await new Metadata().GetEntityObject('Record Merge Deletion Logs', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for Record Merge Deletion Logs
            
            if (await entityObject.Save({ IgnoreDirtyState: true /*flag used because of LoadFromData() call above*/ })) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateRecordMergeDeletionLogInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateRecordMergeDeletionLogInput) {
        const i = input, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for Query Fields
//****************************************************************************
@ObjectType()
export class QueryField_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field(() => Int) 
    QueryID: number;
          
    @Field() 
    @MaxLength(510)
    Name: string;
          
    @Field({nullable: true}) 
    Description?: string;
          
    @Field(() => Int) 
    Sequence: number;
          
    @Field({description: 'The base type, not including parameters, in SQL. For example this field would be nvarchar or decimal, and wouldn\'t include type parameters. The SQLFullType field provides that information.'}) 
    @MaxLength(100)
    SQLBaseType: string;
          
    @Field({description: 'The full SQL type for the field, for example datetime or nvarchar(10) etc.'}) 
    @MaxLength(200)
    SQLFullType: string;
          
    @Field(() => Int, {nullable: true}) 
    SourceEntityID?: number;
          
    @Field({nullable: true}) 
    @MaxLength(510)
    SourceFieldName?: string;
          
    @Field(() => Boolean) 
    IsComputed: boolean;
          
    @Field({nullable: true}) 
    ComputationDescription?: string;
          
    @Field(() => Boolean) 
    IsSummary: boolean;
          
    @Field({nullable: true}) 
    SummaryDescription?: string;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
          
    @Field() 
    @MaxLength(510)
    Query: string;
          
    @Field({nullable: true}) 
    @MaxLength(510)
    SourceEntity?: string;
        
}
        
//****************************************************************************
// INPUT TYPE for Query Fields   
//****************************************************************************
@InputType()
export class CreateQueryFieldInput {
    @Field(() => Int)
    QueryID: number;
    
    @Field()
    Name: string;
    
    @Field({ nullable: true })
    Description: string;
    
    @Field(() => Int)
    Sequence: number;
    
    @Field()
    SQLBaseType: string;
    
    @Field()
    SQLFullType: string;
    
    @Field(() => Int, { nullable: true })
    SourceEntityID: number;
    
    @Field({ nullable: true })
    SourceFieldName: string;
    
    @Field(() => Boolean)
    IsComputed: boolean;
    
    @Field({ nullable: true })
    ComputationDescription: string;
    
    @Field(() => Boolean)
    IsSummary: boolean;
    
    @Field({ nullable: true })
    SummaryDescription: string;
    }
    
        
//****************************************************************************
// INPUT TYPE for Query Fields   
//****************************************************************************
@InputType()
export class UpdateQueryFieldInput {
    @Field(() => Int)
    ID: number;
    
    @Field(() => Int)
    QueryID: number;
    
    @Field()
    Name: string;
    
    @Field({ nullable: true })
    Description: string;
    
    @Field(() => Int)
    Sequence: number;
    
    @Field()
    SQLBaseType: string;
    
    @Field()
    SQLFullType: string;
    
    @Field(() => Int, { nullable: true })
    SourceEntityID: number;
    
    @Field({ nullable: true })
    SourceFieldName: string;
    
    @Field(() => Boolean)
    IsComputed: boolean;
    
    @Field({ nullable: true })
    ComputationDescription: string;
    
    @Field(() => Boolean)
    IsSummary: boolean;
    
    @Field({ nullable: true })
    SummaryDescription: string;
    }
    
//****************************************************************************
// RESOLVER for Query Fields
//****************************************************************************
@ObjectType()
export class RunQueryFieldViewResult {
    @Field(() => [QueryField_])
    Results: QueryField_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(QueryField_)
export class QueryFieldResolver extends ResolverBase {
    @Query(() => RunQueryFieldViewResult)
    async RunQueryFieldViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunQueryFieldViewResult)
    async RunQueryFieldViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunQueryFieldViewResult)
    async RunQueryFieldDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Query Fields';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => QueryField_, { nullable: true })
    async QueryField(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<QueryField_ | null> {
        this.CheckUserReadPermissions('Query Fields', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwQueryFields] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Query Fields', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Query Fields', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => QueryField_)
    async CreateQueryField(
        @Arg('input', () => CreateQueryFieldInput) input: CreateQueryFieldInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <QueryFieldEntity>await new Metadata().GetEntityObject('Query Fields', this.GetUserFromPayload(userPayload));
            await entityObject.NewRecord();
            entityObject.SetMany(input);
            if (await entityObject.Save()) {
                // save worked, fire the AfterCreate event and then return all the data
                await this.AfterCreate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else 
                // save failed, return null
                return null;
        }
        else    
            return null;
    }

    // Before/After CREATE Event Hooks for Sub-Classes to Override
    protected async BeforeCreate(dataSource: DataSource, input: CreateQueryFieldInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateQueryFieldInput) {
    }
        
    @Mutation(() => QueryField_)
    async UpdateQueryField(
        @Arg('input', () => UpdateQueryFieldInput) input: UpdateQueryFieldInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <QueryFieldEntity>await new Metadata().GetEntityObject('Query Fields', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for Query Fields
            
            if (await entityObject.Save({ IgnoreDirtyState: true /*flag used because of LoadFromData() call above*/ })) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateQueryFieldInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateQueryFieldInput) {
        const i = input, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for Query Categories
//****************************************************************************
@ObjectType()
export class QueryCategory_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field() 
    @MaxLength(100)
    Name: string;
          
    @Field(() => Int, {nullable: true}) 
    ParentID?: number;
          
    @Field({nullable: true}) 
    Description?: string;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
          
    @Field(() => Int) 
    UserID: number;
          
    @Field({nullable: true}) 
    @MaxLength(100)
    Parent?: string;
          
    @Field() 
    @MaxLength(200)
    User: string;
        
    @Field(() => [mj_core_schema_server_object_types.QueryCategory_])
    QueryCategoriesArray: mj_core_schema_server_object_types.QueryCategory_[]; // Link to QueryCategories
    
    @Field(() => [mj_core_schema_server_object_types.Query_])
    QueriesArray: mj_core_schema_server_object_types.Query_[]; // Link to Queries
    
}
        
//****************************************************************************
// INPUT TYPE for Query Categories   
//****************************************************************************
@InputType()
export class CreateQueryCategoryInput {
    @Field()
    Name: string;
    
    @Field(() => Int, { nullable: true })
    ParentID: number;
    
    @Field({ nullable: true })
    Description: string;
    
    @Field(() => Int)
    UserID: number;
    }
    
        
//****************************************************************************
// INPUT TYPE for Query Categories   
//****************************************************************************
@InputType()
export class UpdateQueryCategoryInput {
    @Field(() => Int)
    ID: number;
    
    @Field()
    Name: string;
    
    @Field(() => Int, { nullable: true })
    ParentID: number;
    
    @Field({ nullable: true })
    Description: string;
    
    @Field(() => Int)
    UserID: number;
    }
    
//****************************************************************************
// RESOLVER for Query Categories
//****************************************************************************
@ObjectType()
export class RunQueryCategoryViewResult {
    @Field(() => [QueryCategory_])
    Results: QueryCategory_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(QueryCategory_)
export class QueryCategoryResolver extends ResolverBase {
    @Query(() => RunQueryCategoryViewResult)
    async RunQueryCategoryViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunQueryCategoryViewResult)
    async RunQueryCategoryViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunQueryCategoryViewResult)
    async RunQueryCategoryDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Query Categories';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => QueryCategory_, { nullable: true })
    async QueryCategory(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<QueryCategory_ | null> {
        this.CheckUserReadPermissions('Query Categories', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwQueryCategories] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Query Categories', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Query Categories', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
      
    @FieldResolver(() => [mj_core_schema_server_object_types.QueryCategory_])
    async QueryCategoriesArray(@Root() querycategory_: QueryCategory_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Query Categories', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwQueryCategories] WHERE [ParentID]=${querycategory_.ID} ` + this.getRowLevelSecurityWhereClause('Query Categories', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Query Categories', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.Query_])
    async QueriesArray(@Root() querycategory_: QueryCategory_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Queries', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwQueries] WHERE [CategoryID]=${querycategory_.ID} ` + this.getRowLevelSecurityWhereClause('Queries', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Queries', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => QueryCategory_)
    async CreateQueryCategory(
        @Arg('input', () => CreateQueryCategoryInput) input: CreateQueryCategoryInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <QueryCategoryEntity>await new Metadata().GetEntityObject('Query Categories', this.GetUserFromPayload(userPayload));
            await entityObject.NewRecord();
            entityObject.SetMany(input);
            if (await entityObject.Save()) {
                // save worked, fire the AfterCreate event and then return all the data
                await this.AfterCreate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else 
                // save failed, return null
                return null;
        }
        else    
            return null;
    }

    // Before/After CREATE Event Hooks for Sub-Classes to Override
    protected async BeforeCreate(dataSource: DataSource, input: CreateQueryCategoryInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateQueryCategoryInput) {
    }
        
    @Mutation(() => QueryCategory_)
    async UpdateQueryCategory(
        @Arg('input', () => UpdateQueryCategoryInput) input: UpdateQueryCategoryInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <QueryCategoryEntity>await new Metadata().GetEntityObject('Query Categories', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for Query Categories
            
            if (await entityObject.Save({ IgnoreDirtyState: true /*flag used because of LoadFromData() call above*/ })) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateQueryCategoryInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateQueryCategoryInput) {
        const i = input, d = dataSource; // prevent error
    }
    
    @Mutation(() => QueryCategory_)
    async DeleteQueryCategory(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        if (await this.BeforeDelete(dataSource, ID)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <QueryCategoryEntity>await new Metadata().GetEntityObject('Query Categories', this.GetUserFromPayload(userPayload));
            await entityObject.Load(ID);
            const returnValue = entityObject.GetAll(); // grab the values before we delete so we can return last state before delete if we are successful.
            if (await entityObject.Delete()) {
                await this.AfterDelete(dataSource, ID); // fire event
                return returnValue;
            }
            else 
                return null; // delete failed, this will cause an exception
        }
        else
            return null; // BeforeDelete canceled the operation, this will cause an exception
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeDelete(dataSource: DataSource, ID: number): Promise<boolean> {
        const i = ID, d = dataSource; // prevent error;
        return true;
    }
    protected async AfterDelete(dataSource: DataSource, ID: number) {
        const i = ID, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for Queries
//****************************************************************************
@ObjectType({ description: 'Catalog of stored queries. This is useful for any arbitrary query that is known to be performant and correct and can be reused. Queries can be viewed/run by a user, used programatically via RunQuery, and also used by AI systems for improved reliability instead of dynamically generated SQL. Queries can also improve security since they store the SQL instead of using dynamic SQL.' })
export class Query_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field() 
    @MaxLength(510)
    Name: string;
          
    @Field({nullable: true}) 
    Description?: string;
          
    @Field(() => Int, {nullable: true}) 
    CategoryID?: number;
          
    @Field({nullable: true}) 
    SQL?: string;
          
    @Field({nullable: true}) 
    OriginalSQL?: string;
          
    @Field({nullable: true}) 
    Feedback?: string;
          
    @Field() 
    @MaxLength(30)
    Status: string;
          
    @Field(() => Int, {nullable: true}) 
    QualityRank?: number;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
          
    @Field({nullable: true}) 
    @MaxLength(100)
    Category?: string;
        
    @Field(() => [mj_core_schema_server_object_types.QueryField_])
    QueryFieldsArray: mj_core_schema_server_object_types.QueryField_[]; // Link to QueryFields
    
    @Field(() => [mj_core_schema_server_object_types.QueryPermission_])
    QueryPermissionsArray: mj_core_schema_server_object_types.QueryPermission_[]; // Link to QueryPermissions
    
    @Field(() => [mj_core_schema_server_object_types.DataContextItem_])
    DataContextItemsArray: mj_core_schema_server_object_types.DataContextItem_[]; // Link to DataContextItems
    
}
        
//****************************************************************************
// INPUT TYPE for Queries   
//****************************************************************************
@InputType()
export class CreateQueryInput {
    @Field()
    Name: string;
    
    @Field({ nullable: true })
    Description: string;
    
    @Field(() => Int, { nullable: true })
    CategoryID: number;
    
    @Field({ nullable: true })
    SQL: string;
    
    @Field({ nullable: true })
    OriginalSQL: string;
    
    @Field({ nullable: true })
    Feedback: string;
    
    @Field()
    Status: string;
    
    @Field(() => Int, { nullable: true })
    QualityRank: number;
    }
    
        
//****************************************************************************
// INPUT TYPE for Queries   
//****************************************************************************
@InputType()
export class UpdateQueryInput {
    @Field(() => Int)
    ID: number;
    
    @Field()
    Name: string;
    
    @Field({ nullable: true })
    Description: string;
    
    @Field(() => Int, { nullable: true })
    CategoryID: number;
    
    @Field({ nullable: true })
    SQL: string;
    
    @Field({ nullable: true })
    OriginalSQL: string;
    
    @Field({ nullable: true })
    Feedback: string;
    
    @Field()
    Status: string;
    
    @Field(() => Int, { nullable: true })
    QualityRank: number;
    }
    
//****************************************************************************
// RESOLVER for Queries
//****************************************************************************
@ObjectType()
export class RunQueryViewResult {
    @Field(() => [Query_])
    Results: Query_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(Query_)
export class QueryResolver extends ResolverBase {
    @Query(() => RunQueryViewResult)
    async RunQueryViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunQueryViewResult)
    async RunQueryViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunQueryViewResult)
    async RunQueryDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Queries';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => Query_, { nullable: true })
    async Query(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Query_ | null> {
        this.CheckUserReadPermissions('Queries', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwQueries] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Queries', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Queries', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
      
    @FieldResolver(() => [mj_core_schema_server_object_types.QueryField_])
    async QueryFieldsArray(@Root() query_: Query_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Query Fields', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwQueryFields] WHERE [QueryID]=${query_.ID} ` + this.getRowLevelSecurityWhereClause('Query Fields', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Query Fields', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.QueryPermission_])
    async QueryPermissionsArray(@Root() query_: Query_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Query Permissions', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwQueryPermissions] WHERE [QueryID]=${query_.ID} ` + this.getRowLevelSecurityWhereClause('Query Permissions', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Query Permissions', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.DataContextItem_])
    async DataContextItemsArray(@Root() query_: Query_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Data Context Items', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwDataContextItems] WHERE [QueryID]=${query_.ID} ` + this.getRowLevelSecurityWhereClause('Data Context Items', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Data Context Items', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => Query_)
    async CreateQuery(
        @Arg('input', () => CreateQueryInput) input: CreateQueryInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <QueryEntity>await new Metadata().GetEntityObject('Queries', this.GetUserFromPayload(userPayload));
            await entityObject.NewRecord();
            entityObject.SetMany(input);
            if (await entityObject.Save()) {
                // save worked, fire the AfterCreate event and then return all the data
                await this.AfterCreate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else 
                // save failed, return null
                return null;
        }
        else    
            return null;
    }

    // Before/After CREATE Event Hooks for Sub-Classes to Override
    protected async BeforeCreate(dataSource: DataSource, input: CreateQueryInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateQueryInput) {
    }
        
    @Mutation(() => Query_)
    async UpdateQuery(
        @Arg('input', () => UpdateQueryInput) input: UpdateQueryInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <QueryEntity>await new Metadata().GetEntityObject('Queries', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for Queries
            
            if (await entityObject.Save({ IgnoreDirtyState: true /*flag used because of LoadFromData() call above*/ })) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateQueryInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateQueryInput) {
        const i = input, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for Query Permissions
//****************************************************************************
@ObjectType()
export class QueryPermission_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field(() => Int) 
    QueryID: number;
          
    @Field() 
    @MaxLength(100)
    RoleName: string;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
        
}
        
//****************************************************************************
// INPUT TYPE for Query Permissions   
//****************************************************************************
@InputType()
export class CreateQueryPermissionInput {
    @Field(() => Int)
    QueryID: number;
    
    @Field()
    RoleName: string;
    }
    
        
//****************************************************************************
// INPUT TYPE for Query Permissions   
//****************************************************************************
@InputType()
export class UpdateQueryPermissionInput {
    @Field(() => Int)
    ID: number;
    
    @Field(() => Int)
    QueryID: number;
    
    @Field()
    RoleName: string;
    }
    
//****************************************************************************
// RESOLVER for Query Permissions
//****************************************************************************
@ObjectType()
export class RunQueryPermissionViewResult {
    @Field(() => [QueryPermission_])
    Results: QueryPermission_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(QueryPermission_)
export class QueryPermissionResolver extends ResolverBase {
    @Query(() => RunQueryPermissionViewResult)
    async RunQueryPermissionViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunQueryPermissionViewResult)
    async RunQueryPermissionViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunQueryPermissionViewResult)
    async RunQueryPermissionDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Query Permissions';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => QueryPermission_, { nullable: true })
    async QueryPermission(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<QueryPermission_ | null> {
        this.CheckUserReadPermissions('Query Permissions', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwQueryPermissions] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Query Permissions', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Query Permissions', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => QueryPermission_)
    async CreateQueryPermission(
        @Arg('input', () => CreateQueryPermissionInput) input: CreateQueryPermissionInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <QueryPermissionEntity>await new Metadata().GetEntityObject('Query Permissions', this.GetUserFromPayload(userPayload));
            await entityObject.NewRecord();
            entityObject.SetMany(input);
            if (await entityObject.Save()) {
                // save worked, fire the AfterCreate event and then return all the data
                await this.AfterCreate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else 
                // save failed, return null
                return null;
        }
        else    
            return null;
    }

    // Before/After CREATE Event Hooks for Sub-Classes to Override
    protected async BeforeCreate(dataSource: DataSource, input: CreateQueryPermissionInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateQueryPermissionInput) {
    }
        
    @Mutation(() => QueryPermission_)
    async UpdateQueryPermission(
        @Arg('input', () => UpdateQueryPermissionInput) input: UpdateQueryPermissionInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <QueryPermissionEntity>await new Metadata().GetEntityObject('Query Permissions', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for Query Permissions
            
            if (await entityObject.Save({ IgnoreDirtyState: true /*flag used because of LoadFromData() call above*/ })) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateQueryPermissionInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateQueryPermissionInput) {
        const i = input, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for Vector Indexes
//****************************************************************************
@ObjectType()
export class VectorIndex_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field() 
    @MaxLength(510)
    Name: string;
          
    @Field({nullable: true}) 
    Description?: string;
          
    @Field(() => Int) 
    VectorDatabaseID: number;
          
    @Field(() => Int) 
    EmbeddingModelID: number;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
          
    @Field() 
    @MaxLength(200)
    VectorDatabase: string;
          
    @Field() 
    @MaxLength(100)
    EmbeddingModel: string;
        
}
        
//****************************************************************************
// INPUT TYPE for Vector Indexes   
//****************************************************************************
@InputType()
export class CreateVectorIndexInput {
    @Field()
    Name: string;
    
    @Field({ nullable: true })
    Description: string;
    
    @Field(() => Int)
    VectorDatabaseID: number;
    
    @Field(() => Int)
    EmbeddingModelID: number;
    }
    
        
//****************************************************************************
// INPUT TYPE for Vector Indexes   
//****************************************************************************
@InputType()
export class UpdateVectorIndexInput {
    @Field(() => Int)
    ID: number;
    
    @Field()
    Name: string;
    
    @Field({ nullable: true })
    Description: string;
    
    @Field(() => Int)
    VectorDatabaseID: number;
    
    @Field(() => Int)
    EmbeddingModelID: number;
    }
    
//****************************************************************************
// RESOLVER for Vector Indexes
//****************************************************************************
@ObjectType()
export class RunVectorIndexViewResult {
    @Field(() => [VectorIndex_])
    Results: VectorIndex_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(VectorIndex_)
export class VectorIndexResolver extends ResolverBase {
    @Query(() => RunVectorIndexViewResult)
    async RunVectorIndexViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunVectorIndexViewResult)
    async RunVectorIndexViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunVectorIndexViewResult)
    async RunVectorIndexDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Vector Indexes';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => VectorIndex_, { nullable: true })
    async VectorIndex(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<VectorIndex_ | null> {
        this.CheckUserReadPermissions('Vector Indexes', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwVectorIndexes] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Vector Indexes', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Vector Indexes', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => VectorIndex_)
    async CreateVectorIndex(
        @Arg('input', () => CreateVectorIndexInput) input: CreateVectorIndexInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <VectorIndexEntity>await new Metadata().GetEntityObject('Vector Indexes', this.GetUserFromPayload(userPayload));
            await entityObject.NewRecord();
            entityObject.SetMany(input);
            if (await entityObject.Save()) {
                // save worked, fire the AfterCreate event and then return all the data
                await this.AfterCreate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else 
                // save failed, return null
                return null;
        }
        else    
            return null;
    }

    // Before/After CREATE Event Hooks for Sub-Classes to Override
    protected async BeforeCreate(dataSource: DataSource, input: CreateVectorIndexInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateVectorIndexInput) {
    }
        
    @Mutation(() => VectorIndex_)
    async UpdateVectorIndex(
        @Arg('input', () => UpdateVectorIndexInput) input: UpdateVectorIndexInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <VectorIndexEntity>await new Metadata().GetEntityObject('Vector Indexes', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for Vector Indexes
            
            if (await entityObject.Save({ IgnoreDirtyState: true /*flag used because of LoadFromData() call above*/ })) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateVectorIndexInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateVectorIndexInput) {
        const i = input, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for Entity Document Types
//****************************************************************************
@ObjectType()
export class EntityDocumentType_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field() 
    @MaxLength(200)
    Name: string;
          
    @Field({nullable: true}) 
    Description?: string;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
        
    @Field(() => [mj_core_schema_server_object_types.EntityDocument_])
    EntityDocumentsArray: mj_core_schema_server_object_types.EntityDocument_[]; // Link to EntityDocuments
    
}
        
//****************************************************************************
// INPUT TYPE for Entity Document Types   
//****************************************************************************
@InputType()
export class CreateEntityDocumentTypeInput {
    @Field()
    Name: string;
    
    @Field({ nullable: true })
    Description: string;
    }
    
        
//****************************************************************************
// INPUT TYPE for Entity Document Types   
//****************************************************************************
@InputType()
export class UpdateEntityDocumentTypeInput {
    @Field(() => Int)
    ID: number;
    
    @Field()
    Name: string;
    
    @Field({ nullable: true })
    Description: string;
    }
    
//****************************************************************************
// RESOLVER for Entity Document Types
//****************************************************************************
@ObjectType()
export class RunEntityDocumentTypeViewResult {
    @Field(() => [EntityDocumentType_])
    Results: EntityDocumentType_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(EntityDocumentType_)
export class EntityDocumentTypeResolver extends ResolverBase {
    @Query(() => RunEntityDocumentTypeViewResult)
    async RunEntityDocumentTypeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunEntityDocumentTypeViewResult)
    async RunEntityDocumentTypeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunEntityDocumentTypeViewResult)
    async RunEntityDocumentTypeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Entity Document Types';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => EntityDocumentType_, { nullable: true })
    async EntityDocumentType(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<EntityDocumentType_ | null> {
        this.CheckUserReadPermissions('Entity Document Types', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwEntityDocumentTypes] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Entity Document Types', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Entity Document Types', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
      
    @FieldResolver(() => [mj_core_schema_server_object_types.EntityDocument_])
    async EntityDocumentsArray(@Root() entitydocumenttype_: EntityDocumentType_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Entity Documents', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwEntityDocuments] WHERE [TypeID]=${entitydocumenttype_.ID} ` + this.getRowLevelSecurityWhereClause('Entity Documents', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Entity Documents', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => EntityDocumentType_)
    async CreateEntityDocumentType(
        @Arg('input', () => CreateEntityDocumentTypeInput) input: CreateEntityDocumentTypeInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <EntityDocumentTypeEntity>await new Metadata().GetEntityObject('Entity Document Types', this.GetUserFromPayload(userPayload));
            await entityObject.NewRecord();
            entityObject.SetMany(input);
            if (await entityObject.Save()) {
                // save worked, fire the AfterCreate event and then return all the data
                await this.AfterCreate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else 
                // save failed, return null
                return null;
        }
        else    
            return null;
    }

    // Before/After CREATE Event Hooks for Sub-Classes to Override
    protected async BeforeCreate(dataSource: DataSource, input: CreateEntityDocumentTypeInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateEntityDocumentTypeInput) {
    }
        
    @Mutation(() => EntityDocumentType_)
    async UpdateEntityDocumentType(
        @Arg('input', () => UpdateEntityDocumentTypeInput) input: UpdateEntityDocumentTypeInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <EntityDocumentTypeEntity>await new Metadata().GetEntityObject('Entity Document Types', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for Entity Document Types
            
            if (await entityObject.Save({ IgnoreDirtyState: true /*flag used because of LoadFromData() call above*/ })) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateEntityDocumentTypeInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateEntityDocumentTypeInput) {
        const i = input, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for Entity Document Runs
//****************************************************************************
@ObjectType()
export class EntityDocumentRun_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field(() => Int) 
    EntityDocumentID: number;
          
    @Field({nullable: true}) 
    @MaxLength(8)
    StartedAt?: Date;
          
    @Field({nullable: true}) 
    @MaxLength(8)
    EndedAt?: Date;
          
    @Field({description: 'Can be Pending, In Progress, Completed, or Failed'}) 
    @MaxLength(30)
    Status: string;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
          
    @Field() 
    @MaxLength(500)
    EntityDocument: string;
        
}
        
//****************************************************************************
// INPUT TYPE for Entity Document Runs   
//****************************************************************************
@InputType()
export class CreateEntityDocumentRunInput {
    @Field(() => Int)
    EntityDocumentID: number;
    
    @Field({ nullable: true })
    StartedAt: Date;
    
    @Field({ nullable: true })
    EndedAt: Date;
    
    @Field()
    Status: string;
    }
    
        
//****************************************************************************
// INPUT TYPE for Entity Document Runs   
//****************************************************************************
@InputType()
export class UpdateEntityDocumentRunInput {
    @Field(() => Int)
    ID: number;
    
    @Field(() => Int)
    EntityDocumentID: number;
    
    @Field({ nullable: true })
    StartedAt: Date;
    
    @Field({ nullable: true })
    EndedAt: Date;
    
    @Field()
    Status: string;
    }
    
//****************************************************************************
// RESOLVER for Entity Document Runs
//****************************************************************************
@ObjectType()
export class RunEntityDocumentRunViewResult {
    @Field(() => [EntityDocumentRun_])
    Results: EntityDocumentRun_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(EntityDocumentRun_)
export class EntityDocumentRunResolver extends ResolverBase {
    @Query(() => RunEntityDocumentRunViewResult)
    async RunEntityDocumentRunViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunEntityDocumentRunViewResult)
    async RunEntityDocumentRunViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunEntityDocumentRunViewResult)
    async RunEntityDocumentRunDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Entity Document Runs';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => EntityDocumentRun_, { nullable: true })
    async EntityDocumentRun(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<EntityDocumentRun_ | null> {
        this.CheckUserReadPermissions('Entity Document Runs', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwEntityDocumentRuns] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Entity Document Runs', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Entity Document Runs', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => EntityDocumentRun_)
    async CreateEntityDocumentRun(
        @Arg('input', () => CreateEntityDocumentRunInput) input: CreateEntityDocumentRunInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <EntityDocumentRunEntity>await new Metadata().GetEntityObject('Entity Document Runs', this.GetUserFromPayload(userPayload));
            await entityObject.NewRecord();
            entityObject.SetMany(input);
            if (await entityObject.Save()) {
                // save worked, fire the AfterCreate event and then return all the data
                await this.AfterCreate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else 
                // save failed, return null
                return null;
        }
        else    
            return null;
    }

    // Before/After CREATE Event Hooks for Sub-Classes to Override
    protected async BeforeCreate(dataSource: DataSource, input: CreateEntityDocumentRunInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateEntityDocumentRunInput) {
    }
        
    @Mutation(() => EntityDocumentRun_)
    async UpdateEntityDocumentRun(
        @Arg('input', () => UpdateEntityDocumentRunInput) input: UpdateEntityDocumentRunInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <EntityDocumentRunEntity>await new Metadata().GetEntityObject('Entity Document Runs', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for Entity Document Runs
            
            if (await entityObject.Save({ IgnoreDirtyState: true /*flag used because of LoadFromData() call above*/ })) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateEntityDocumentRunInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateEntityDocumentRunInput) {
        const i = input, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for Vector Databases
//****************************************************************************
@ObjectType()
export class VectorDatabase_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field() 
    @MaxLength(200)
    Name: string;
          
    @Field({nullable: true}) 
    Description?: string;
          
    @Field({nullable: true}) 
    @MaxLength(510)
    DefaultURL?: string;
          
    @Field({nullable: true}) 
    @MaxLength(200)
    ClassKey?: string;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
        
    @Field(() => [mj_core_schema_server_object_types.VectorIndex_])
    VectorIndexesArray: mj_core_schema_server_object_types.VectorIndex_[]; // Link to VectorIndexes
    
    @Field(() => [mj_core_schema_server_object_types.EntityDocument_])
    EntityDocumentsArray: mj_core_schema_server_object_types.EntityDocument_[]; // Link to EntityDocuments
    
}
        
//****************************************************************************
// INPUT TYPE for Vector Databases   
//****************************************************************************
@InputType()
export class CreateVectorDatabaseInput {
    @Field()
    Name: string;
    
    @Field({ nullable: true })
    Description: string;
    
    @Field({ nullable: true })
    DefaultURL: string;
    
    @Field({ nullable: true })
    ClassKey: string;
    }
    
        
//****************************************************************************
// INPUT TYPE for Vector Databases   
//****************************************************************************
@InputType()
export class UpdateVectorDatabaseInput {
    @Field(() => Int)
    ID: number;
    
    @Field()
    Name: string;
    
    @Field({ nullable: true })
    Description: string;
    
    @Field({ nullable: true })
    DefaultURL: string;
    
    @Field({ nullable: true })
    ClassKey: string;
    }
    
//****************************************************************************
// RESOLVER for Vector Databases
//****************************************************************************
@ObjectType()
export class RunVectorDatabaseViewResult {
    @Field(() => [VectorDatabase_])
    Results: VectorDatabase_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(VectorDatabase_)
export class VectorDatabaseResolver extends ResolverBase {
    @Query(() => RunVectorDatabaseViewResult)
    async RunVectorDatabaseViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunVectorDatabaseViewResult)
    async RunVectorDatabaseViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunVectorDatabaseViewResult)
    async RunVectorDatabaseDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Vector Databases';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => VectorDatabase_, { nullable: true })
    async VectorDatabase(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<VectorDatabase_ | null> {
        this.CheckUserReadPermissions('Vector Databases', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwVectorDatabases] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Vector Databases', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Vector Databases', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
      
    @FieldResolver(() => [mj_core_schema_server_object_types.VectorIndex_])
    async VectorIndexesArray(@Root() vectordatabase_: VectorDatabase_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Vector Indexes', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwVectorIndexes] WHERE [VectorDatabaseID]=${vectordatabase_.ID} ` + this.getRowLevelSecurityWhereClause('Vector Indexes', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Vector Indexes', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.EntityDocument_])
    async EntityDocumentsArray(@Root() vectordatabase_: VectorDatabase_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Entity Documents', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwEntityDocuments] WHERE [ID]=${vectordatabase_.ID} ` + this.getRowLevelSecurityWhereClause('Entity Documents', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Entity Documents', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => VectorDatabase_)
    async CreateVectorDatabase(
        @Arg('input', () => CreateVectorDatabaseInput) input: CreateVectorDatabaseInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <VectorDatabaseEntity>await new Metadata().GetEntityObject('Vector Databases', this.GetUserFromPayload(userPayload));
            await entityObject.NewRecord();
            entityObject.SetMany(input);
            if (await entityObject.Save()) {
                // save worked, fire the AfterCreate event and then return all the data
                await this.AfterCreate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else 
                // save failed, return null
                return null;
        }
        else    
            return null;
    }

    // Before/After CREATE Event Hooks for Sub-Classes to Override
    protected async BeforeCreate(dataSource: DataSource, input: CreateVectorDatabaseInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateVectorDatabaseInput) {
    }
        
    @Mutation(() => VectorDatabase_)
    async UpdateVectorDatabase(
        @Arg('input', () => UpdateVectorDatabaseInput) input: UpdateVectorDatabaseInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <VectorDatabaseEntity>await new Metadata().GetEntityObject('Vector Databases', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for Vector Databases
            
            if (await entityObject.Save({ IgnoreDirtyState: true /*flag used because of LoadFromData() call above*/ })) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateVectorDatabaseInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateVectorDatabaseInput) {
        const i = input, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for Entity Record Documents
//****************************************************************************
@ObjectType()
export class EntityRecordDocument_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field(() => Int) 
    EntityID: number;
          
    @Field() 
    @MaxLength(510)
    RecordID: string;
          
    @Field({nullable: true}) 
    DocumentText?: string;
          
    @Field(() => Int) 
    VectorIndexID: number;
          
    @Field({nullable: true}) 
    @MaxLength(100)
    VectorID?: string;
          
    @Field({nullable: true}) 
    VectorJSON?: string;
          
    @Field() 
    @MaxLength(8)
    EntityRecordUpdatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
          
    @Field(() => Int) 
    EntityDocumentID: number;
        
}
        
//****************************************************************************
// INPUT TYPE for Entity Record Documents   
//****************************************************************************
@InputType()
export class CreateEntityRecordDocumentInput {
    @Field(() => Int)
    EntityID: number;
    
    @Field()
    RecordID: string;
    
    @Field({ nullable: true })
    DocumentText: string;
    
    @Field(() => Int)
    VectorIndexID: number;
    
    @Field({ nullable: true })
    VectorID: string;
    
    @Field({ nullable: true })
    VectorJSON: string;
    
    @Field()
    EntityRecordUpdatedAt: Date;
    
    @Field(() => Int)
    EntityDocumentID: number;
    }
    
        
//****************************************************************************
// INPUT TYPE for Entity Record Documents   
//****************************************************************************
@InputType()
export class UpdateEntityRecordDocumentInput {
    @Field(() => Int)
    ID: number;
    
    @Field(() => Int)
    EntityID: number;
    
    @Field()
    RecordID: string;
    
    @Field({ nullable: true })
    DocumentText: string;
    
    @Field(() => Int)
    VectorIndexID: number;
    
    @Field({ nullable: true })
    VectorID: string;
    
    @Field({ nullable: true })
    VectorJSON: string;
    
    @Field()
    EntityRecordUpdatedAt: Date;
    
    @Field(() => Int)
    EntityDocumentID: number;
    }
    
//****************************************************************************
// RESOLVER for Entity Record Documents
//****************************************************************************
@ObjectType()
export class RunEntityRecordDocumentViewResult {
    @Field(() => [EntityRecordDocument_])
    Results: EntityRecordDocument_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(EntityRecordDocument_)
export class EntityRecordDocumentResolver extends ResolverBase {
    @Query(() => RunEntityRecordDocumentViewResult)
    async RunEntityRecordDocumentViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunEntityRecordDocumentViewResult)
    async RunEntityRecordDocumentViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunEntityRecordDocumentViewResult)
    async RunEntityRecordDocumentDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Entity Record Documents';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => EntityRecordDocument_, { nullable: true })
    async EntityRecordDocument(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<EntityRecordDocument_ | null> {
        this.CheckUserReadPermissions('Entity Record Documents', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwEntityRecordDocuments] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Entity Record Documents', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Entity Record Documents', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => EntityRecordDocument_)
    async CreateEntityRecordDocument(
        @Arg('input', () => CreateEntityRecordDocumentInput) input: CreateEntityRecordDocumentInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <EntityRecordDocumentEntity>await new Metadata().GetEntityObject('Entity Record Documents', this.GetUserFromPayload(userPayload));
            await entityObject.NewRecord();
            entityObject.SetMany(input);
            if (await entityObject.Save()) {
                // save worked, fire the AfterCreate event and then return all the data
                await this.AfterCreate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else 
                // save failed, return null
                return null;
        }
        else    
            return null;
    }

    // Before/After CREATE Event Hooks for Sub-Classes to Override
    protected async BeforeCreate(dataSource: DataSource, input: CreateEntityRecordDocumentInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateEntityRecordDocumentInput) {
    }
        
    @Mutation(() => EntityRecordDocument_)
    async UpdateEntityRecordDocument(
        @Arg('input', () => UpdateEntityRecordDocumentInput) input: UpdateEntityRecordDocumentInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <EntityRecordDocumentEntity>await new Metadata().GetEntityObject('Entity Record Documents', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for Entity Record Documents
            
            if (await entityObject.Save({ IgnoreDirtyState: true /*flag used because of LoadFromData() call above*/ })) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateEntityRecordDocumentInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateEntityRecordDocumentInput) {
        const i = input, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for Entity Documents
//****************************************************************************
@ObjectType()
export class EntityDocument_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field() 
    @MaxLength(500)
    Name: string;
          
    @Field(() => Int) 
    EntityID: number;
          
    @Field(() => Int) 
    TypeID: number;
          
    @Field() 
    @MaxLength(30)
    Status: string;
          
    @Field({nullable: true}) 
    Template?: string;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
          
    @Field(() => Int) 
    VectorDatabaseID: number;
          
    @Field(() => Int) 
    AIModelID: number;
          
    @Field() 
    @MaxLength(510)
    Entity: string;
          
    @Field() 
    @MaxLength(200)
    Type: string;
        
    @Field(() => [mj_core_schema_server_object_types.EntityDocumentRun_])
    EntityDocumentRunsArray: mj_core_schema_server_object_types.EntityDocumentRun_[]; // Link to EntityDocumentRuns
    
}
        
//****************************************************************************
// INPUT TYPE for Entity Documents   
//****************************************************************************
@InputType()
export class CreateEntityDocumentInput {
    @Field()
    Name: string;
    
    @Field(() => Int)
    EntityID: number;
    
    @Field(() => Int)
    TypeID: number;
    
    @Field()
    Status: string;
    
    @Field({ nullable: true })
    Template: string;
    
    @Field(() => Int)
    VectorDatabaseID: number;
    
    @Field(() => Int)
    AIModelID: number;
    }
    
        
//****************************************************************************
// INPUT TYPE for Entity Documents   
//****************************************************************************
@InputType()
export class UpdateEntityDocumentInput {
    @Field(() => Int)
    ID: number;
    
    @Field()
    Name: string;
    
    @Field(() => Int)
    EntityID: number;
    
    @Field(() => Int)
    TypeID: number;
    
    @Field()
    Status: string;
    
    @Field({ nullable: true })
    Template: string;
    
    @Field(() => Int)
    VectorDatabaseID: number;
    
    @Field(() => Int)
    AIModelID: number;
    }
    
//****************************************************************************
// RESOLVER for Entity Documents
//****************************************************************************
@ObjectType()
export class RunEntityDocumentViewResult {
    @Field(() => [EntityDocument_])
    Results: EntityDocument_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(EntityDocument_)
export class EntityDocumentResolver extends ResolverBase {
    @Query(() => RunEntityDocumentViewResult)
    async RunEntityDocumentViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunEntityDocumentViewResult)
    async RunEntityDocumentViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunEntityDocumentViewResult)
    async RunEntityDocumentDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Entity Documents';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => EntityDocument_, { nullable: true })
    async EntityDocument(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<EntityDocument_ | null> {
        this.CheckUserReadPermissions('Entity Documents', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwEntityDocuments] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Entity Documents', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Entity Documents', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
      
    @FieldResolver(() => [mj_core_schema_server_object_types.EntityDocumentRun_])
    async EntityDocumentRunsArray(@Root() entitydocument_: EntityDocument_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Entity Document Runs', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwEntityDocumentRuns] WHERE [EntityDocumentID]=${entitydocument_.ID} ` + this.getRowLevelSecurityWhereClause('Entity Document Runs', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Entity Document Runs', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => EntityDocument_)
    async CreateEntityDocument(
        @Arg('input', () => CreateEntityDocumentInput) input: CreateEntityDocumentInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <EntityDocumentEntity>await new Metadata().GetEntityObject('Entity Documents', this.GetUserFromPayload(userPayload));
            await entityObject.NewRecord();
            entityObject.SetMany(input);
            if (await entityObject.Save()) {
                // save worked, fire the AfterCreate event and then return all the data
                await this.AfterCreate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else 
                // save failed, return null
                return null;
        }
        else    
            return null;
    }

    // Before/After CREATE Event Hooks for Sub-Classes to Override
    protected async BeforeCreate(dataSource: DataSource, input: CreateEntityDocumentInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateEntityDocumentInput) {
    }
        
    @Mutation(() => EntityDocument_)
    async UpdateEntityDocument(
        @Arg('input', () => UpdateEntityDocumentInput) input: UpdateEntityDocumentInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <EntityDocumentEntity>await new Metadata().GetEntityObject('Entity Documents', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for Entity Documents
            
            if (await entityObject.Save({ IgnoreDirtyState: true /*flag used because of LoadFromData() call above*/ })) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateEntityDocumentInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateEntityDocumentInput) {
        const i = input, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for Data Context Items
//****************************************************************************
@ObjectType({ description: 'Data Context Items store information about each item within a Data Context. Each item stores a link to a view, query, or raw sql statement and can optionally cache the JSON representing the last run of that data object as well.' })
export class DataContextItem_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field(() => Int, {description: 'Foreign key to the DataContext table'}) 
    DataContextID: number;
          
    @Field({description: 'The type of the item, either "view", "query", "full_entity", "single_record", or "sql"'}) 
    @MaxLength(100)
    Type: string;
          
    @Field(() => Int, {nullable: true, description: 'Only used if Type=\'view\''}) 
    ViewID?: number;
          
    @Field(() => Int, {nullable: true, description: 'Only used if Type=\'query\''}) 
    QueryID?: number;
          
    @Field(() => Int, {nullable: true, description: 'Used if type=\'full_entity\' or type=\'single_record\''}) 
    EntityID?: number;
          
    @Field({nullable: true, description: 'The Primary Key value for the record, only used when Type=\'single_record\''}) 
    @MaxLength(510)
    RecordID?: string;
          
    @Field({nullable: true, description: 'Only used when Type=sql'}) 
    SQL?: string;
          
    @Field({nullable: true, description: 'Optionally used to cache results of an item. This can be used for performance optimization, and also for having snapshots of data for historical comparisons.'}) 
    DataJSON?: string;
          
    @Field({nullable: true, description: 'If DataJSON is populated, this field will show the date the the data was captured'}) 
    @MaxLength(8)
    LastRefreshedAt?: Date;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
          
    @Field() 
    @MaxLength(510)
    DataContext: string;
          
    @Field({nullable: true}) 
    @MaxLength(200)
    View?: string;
          
    @Field({nullable: true}) 
    @MaxLength(510)
    Query?: string;
          
    @Field({nullable: true}) 
    @MaxLength(510)
    Entity?: string;
        
}
        
//****************************************************************************
// INPUT TYPE for Data Context Items   
//****************************************************************************
@InputType()
export class CreateDataContextItemInput {
    @Field(() => Int)
    DataContextID: number;
    
    @Field()
    Type: string;
    
    @Field(() => Int, { nullable: true })
    ViewID: number;
    
    @Field(() => Int, { nullable: true })
    QueryID: number;
    
    @Field(() => Int, { nullable: true })
    EntityID: number;
    
    @Field({ nullable: true })
    RecordID: string;
    
    @Field({ nullable: true })
    SQL: string;
    
    @Field({ nullable: true })
    DataJSON: string;
    
    @Field({ nullable: true })
    LastRefreshedAt: Date;
    }
    
        
//****************************************************************************
// INPUT TYPE for Data Context Items   
//****************************************************************************
@InputType()
export class UpdateDataContextItemInput {
    @Field(() => Int)
    ID: number;
    
    @Field(() => Int)
    DataContextID: number;
    
    @Field()
    Type: string;
    
    @Field(() => Int, { nullable: true })
    ViewID: number;
    
    @Field(() => Int, { nullable: true })
    QueryID: number;
    
    @Field(() => Int, { nullable: true })
    EntityID: number;
    
    @Field({ nullable: true })
    RecordID: string;
    
    @Field({ nullable: true })
    SQL: string;
    
    @Field({ nullable: true })
    DataJSON: string;
    
    @Field({ nullable: true })
    LastRefreshedAt: Date;
    }
    
//****************************************************************************
// RESOLVER for Data Context Items
//****************************************************************************
@ObjectType()
export class RunDataContextItemViewResult {
    @Field(() => [DataContextItem_])
    Results: DataContextItem_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(DataContextItem_)
export class DataContextItemResolver extends ResolverBase {
    @Query(() => RunDataContextItemViewResult)
    async RunDataContextItemViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunDataContextItemViewResult)
    async RunDataContextItemViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunDataContextItemViewResult)
    async RunDataContextItemDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Data Context Items';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => DataContextItem_, { nullable: true })
    async DataContextItem(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<DataContextItem_ | null> {
        this.CheckUserReadPermissions('Data Context Items', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwDataContextItems] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Data Context Items', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Data Context Items', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => DataContextItem_)
    async CreateDataContextItem(
        @Arg('input', () => CreateDataContextItemInput) input: CreateDataContextItemInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <DataContextItemEntity>await new Metadata().GetEntityObject('Data Context Items', this.GetUserFromPayload(userPayload));
            await entityObject.NewRecord();
            entityObject.SetMany(input);
            if (await entityObject.Save()) {
                // save worked, fire the AfterCreate event and then return all the data
                await this.AfterCreate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else 
                // save failed, return null
                return null;
        }
        else    
            return null;
    }

    // Before/After CREATE Event Hooks for Sub-Classes to Override
    protected async BeforeCreate(dataSource: DataSource, input: CreateDataContextItemInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateDataContextItemInput) {
    }
        
    @Mutation(() => DataContextItem_)
    async UpdateDataContextItem(
        @Arg('input', () => UpdateDataContextItemInput) input: UpdateDataContextItemInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <DataContextItemEntity>await new Metadata().GetEntityObject('Data Context Items', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for Data Context Items
            
            if (await entityObject.Save({ IgnoreDirtyState: true /*flag used because of LoadFromData() call above*/ })) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateDataContextItemInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateDataContextItemInput) {
        const i = input, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for Data Contexts
//****************************************************************************
@ObjectType({ description: 'Data Contexts are a primitive within the MemberJunction architecture. They store information about data contexts which are groups of data including views, queries, or raw SQL statements. Data contexts can be used in conversations, reports and more.' })
export class DataContext_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field() 
    @MaxLength(510)
    Name: string;
          
    @Field(() => Int) 
    UserID: number;
          
    @Field({nullable: true}) 
    Description?: string;
          
    @Field({nullable: true}) 
    @MaxLength(8)
    LastRefreshedAt?: Date;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
          
    @Field() 
    @MaxLength(200)
    User: string;
        
    @Field(() => [mj_core_schema_server_object_types.DataContextItem_])
    DataContextItemsArray: mj_core_schema_server_object_types.DataContextItem_[]; // Link to DataContextItems
    
    @Field(() => [mj_core_schema_server_object_types.Report_])
    ReportsArray: mj_core_schema_server_object_types.Report_[]; // Link to Reports
    
}
        
//****************************************************************************
// INPUT TYPE for Data Contexts   
//****************************************************************************
@InputType()
export class CreateDataContextInput {
    @Field()
    Name: string;
    
    @Field(() => Int)
    UserID: number;
    
    @Field({ nullable: true })
    Description: string;
    
    @Field({ nullable: true })
    LastRefreshedAt: Date;
    }
    
        
//****************************************************************************
// INPUT TYPE for Data Contexts   
//****************************************************************************
@InputType()
export class UpdateDataContextInput {
    @Field(() => Int)
    ID: number;
    
    @Field()
    Name: string;
    
    @Field(() => Int)
    UserID: number;
    
    @Field({ nullable: true })
    Description: string;
    
    @Field({ nullable: true })
    LastRefreshedAt: Date;
    }
    
//****************************************************************************
// RESOLVER for Data Contexts
//****************************************************************************
@ObjectType()
export class RunDataContextViewResult {
    @Field(() => [DataContext_])
    Results: DataContext_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(DataContext_)
export class DataContextResolver extends ResolverBase {
    @Query(() => RunDataContextViewResult)
    async RunDataContextViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunDataContextViewResult)
    async RunDataContextViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunDataContextViewResult)
    async RunDataContextDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Data Contexts';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => DataContext_, { nullable: true })
    async DataContext(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<DataContext_ | null> {
        this.CheckUserReadPermissions('Data Contexts', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwDataContexts] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Data Contexts', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Data Contexts', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
      
    @FieldResolver(() => [mj_core_schema_server_object_types.DataContextItem_])
    async DataContextItemsArray(@Root() datacontext_: DataContext_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Data Context Items', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwDataContextItems] WHERE [DataContextID]=${datacontext_.ID} ` + this.getRowLevelSecurityWhereClause('Data Context Items', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Data Context Items', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.Report_])
    async ReportsArray(@Root() datacontext_: DataContext_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Reports', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwReports] WHERE [DataContextID]=${datacontext_.ID} ` + this.getRowLevelSecurityWhereClause('Reports', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Reports', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => DataContext_)
    async CreateDataContext(
        @Arg('input', () => CreateDataContextInput) input: CreateDataContextInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <DataContextEntity>await new Metadata().GetEntityObject('Data Contexts', this.GetUserFromPayload(userPayload));
            await entityObject.NewRecord();
            entityObject.SetMany(input);
            if (await entityObject.Save()) {
                // save worked, fire the AfterCreate event and then return all the data
                await this.AfterCreate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else 
                // save failed, return null
                return null;
        }
        else    
            return null;
    }

    // Before/After CREATE Event Hooks for Sub-Classes to Override
    protected async BeforeCreate(dataSource: DataSource, input: CreateDataContextInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateDataContextInput) {
    }
        
    @Mutation(() => DataContext_)
    async UpdateDataContext(
        @Arg('input', () => UpdateDataContextInput) input: UpdateDataContextInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <DataContextEntity>await new Metadata().GetEntityObject('Data Contexts', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for Data Contexts
            
            if (await entityObject.Save({ IgnoreDirtyState: true /*flag used because of LoadFromData() call above*/ })) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateDataContextInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateDataContextInput) {
        const i = input, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for User View Categories
//****************************************************************************
@ObjectType()
export class UserViewCategory_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field() 
    @MaxLength(200)
    Name: string;
          
    @Field({nullable: true}) 
    Description?: string;
          
    @Field(() => Int, {nullable: true}) 
    ParentID?: number;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
          
    @Field(() => Int) 
    EntityID: number;
          
    @Field(() => Int) 
    UserID: number;
          
    @Field({nullable: true}) 
    @MaxLength(200)
    Parent?: string;
          
    @Field() 
    @MaxLength(200)
    User: string;
        
    @Field(() => [mj_core_schema_server_object_types.UserViewCategory_])
    UserViewCategoriesArray: mj_core_schema_server_object_types.UserViewCategory_[]; // Link to UserViewCategories
    
    @Field(() => [mj_core_schema_server_object_types.UserView_])
    UserViewsArray: mj_core_schema_server_object_types.UserView_[]; // Link to UserViews
    
}
        
//****************************************************************************
// INPUT TYPE for User View Categories   
//****************************************************************************
@InputType()
export class CreateUserViewCategoryInput {
    @Field()
    Name: string;
    
    @Field({ nullable: true })
    Description: string;
    
    @Field(() => Int, { nullable: true })
    ParentID: number;
    
    @Field(() => Int)
    EntityID: number;
    
    @Field(() => Int)
    UserID: number;
    }
    
        
//****************************************************************************
// INPUT TYPE for User View Categories   
//****************************************************************************
@InputType()
export class UpdateUserViewCategoryInput {
    @Field(() => Int)
    ID: number;
    
    @Field()
    Name: string;
    
    @Field({ nullable: true })
    Description: string;
    
    @Field(() => Int, { nullable: true })
    ParentID: number;
    
    @Field(() => Int)
    EntityID: number;
    
    @Field(() => Int)
    UserID: number;
    }
    
//****************************************************************************
// RESOLVER for User View Categories
//****************************************************************************
@ObjectType()
export class RunUserViewCategoryViewResult {
    @Field(() => [UserViewCategory_])
    Results: UserViewCategory_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(UserViewCategory_)
export class UserViewCategoryResolver extends ResolverBase {
    @Query(() => RunUserViewCategoryViewResult)
    async RunUserViewCategoryViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunUserViewCategoryViewResult)
    async RunUserViewCategoryViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunUserViewCategoryViewResult)
    async RunUserViewCategoryDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'User View Categories';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => UserViewCategory_, { nullable: true })
    async UserViewCategory(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<UserViewCategory_ | null> {
        this.CheckUserReadPermissions('User View Categories', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwUserViewCategories] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('User View Categories', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('User View Categories', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
      
    @FieldResolver(() => [mj_core_schema_server_object_types.UserViewCategory_])
    async UserViewCategoriesArray(@Root() userviewcategory_: UserViewCategory_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('User View Categories', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwUserViewCategories] WHERE [ParentID]=${userviewcategory_.ID} ` + this.getRowLevelSecurityWhereClause('User View Categories', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('User View Categories', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.UserView_])
    async UserViewsArray(@Root() userviewcategory_: UserViewCategory_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('User Views', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwUserViews] WHERE [CategoryID]=${userviewcategory_.ID} ` + this.getRowLevelSecurityWhereClause('User Views', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('User Views', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => UserViewCategory_)
    async CreateUserViewCategory(
        @Arg('input', () => CreateUserViewCategoryInput) input: CreateUserViewCategoryInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <UserViewCategoryEntity>await new Metadata().GetEntityObject('User View Categories', this.GetUserFromPayload(userPayload));
            await entityObject.NewRecord();
            entityObject.SetMany(input);
            if (await entityObject.Save()) {
                // save worked, fire the AfterCreate event and then return all the data
                await this.AfterCreate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else 
                // save failed, return null
                return null;
        }
        else    
            return null;
    }

    // Before/After CREATE Event Hooks for Sub-Classes to Override
    protected async BeforeCreate(dataSource: DataSource, input: CreateUserViewCategoryInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateUserViewCategoryInput) {
    }
        
    @Mutation(() => UserViewCategory_)
    async UpdateUserViewCategory(
        @Arg('input', () => UpdateUserViewCategoryInput) input: UpdateUserViewCategoryInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <UserViewCategoryEntity>await new Metadata().GetEntityObject('User View Categories', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for User View Categories
            
            if (await entityObject.Save({ IgnoreDirtyState: true /*flag used because of LoadFromData() call above*/ })) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateUserViewCategoryInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateUserViewCategoryInput) {
        const i = input, d = dataSource; // prevent error
    }
    
    @Mutation(() => UserViewCategory_)
    async DeleteUserViewCategory(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        if (await this.BeforeDelete(dataSource, ID)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <UserViewCategoryEntity>await new Metadata().GetEntityObject('User View Categories', this.GetUserFromPayload(userPayload));
            await entityObject.Load(ID);
            const returnValue = entityObject.GetAll(); // grab the values before we delete so we can return last state before delete if we are successful.
            if (await entityObject.Delete()) {
                await this.AfterDelete(dataSource, ID); // fire event
                return returnValue;
            }
            else 
                return null; // delete failed, this will cause an exception
        }
        else
            return null; // BeforeDelete canceled the operation, this will cause an exception
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeDelete(dataSource: DataSource, ID: number): Promise<boolean> {
        const i = ID, d = dataSource; // prevent error;
        return true;
    }
    protected async AfterDelete(dataSource: DataSource, ID: number) {
        const i = ID, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for Dashboard Categories
//****************************************************************************
@ObjectType()
export class DashboardCategory_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field() 
    @MaxLength(200)
    Name: string;
          
    @Field({nullable: true}) 
    Description?: string;
          
    @Field(() => Int, {nullable: true}) 
    ParentID?: number;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
          
    @Field(() => Int) 
    UserID: number;
          
    @Field({nullable: true}) 
    @MaxLength(200)
    Parent?: string;
          
    @Field() 
    @MaxLength(200)
    User: string;
        
    @Field(() => [mj_core_schema_server_object_types.Dashboard_])
    DashboardsArray: mj_core_schema_server_object_types.Dashboard_[]; // Link to Dashboards
    
    @Field(() => [mj_core_schema_server_object_types.DashboardCategory_])
    DashboardCategoriesArray: mj_core_schema_server_object_types.DashboardCategory_[]; // Link to DashboardCategories
    
}
        
//****************************************************************************
// INPUT TYPE for Dashboard Categories   
//****************************************************************************
@InputType()
export class CreateDashboardCategoryInput {
    @Field()
    Name: string;
    
    @Field({ nullable: true })
    Description: string;
    
    @Field(() => Int, { nullable: true })
    ParentID: number;
    
    @Field(() => Int)
    UserID: number;
    }
    
        
//****************************************************************************
// INPUT TYPE for Dashboard Categories   
//****************************************************************************
@InputType()
export class UpdateDashboardCategoryInput {
    @Field(() => Int)
    ID: number;
    
    @Field()
    Name: string;
    
    @Field({ nullable: true })
    Description: string;
    
    @Field(() => Int, { nullable: true })
    ParentID: number;
    
    @Field(() => Int)
    UserID: number;
    }
    
//****************************************************************************
// RESOLVER for Dashboard Categories
//****************************************************************************
@ObjectType()
export class RunDashboardCategoryViewResult {
    @Field(() => [DashboardCategory_])
    Results: DashboardCategory_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(DashboardCategory_)
export class DashboardCategoryResolver extends ResolverBase {
    @Query(() => RunDashboardCategoryViewResult)
    async RunDashboardCategoryViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunDashboardCategoryViewResult)
    async RunDashboardCategoryViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunDashboardCategoryViewResult)
    async RunDashboardCategoryDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Dashboard Categories';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => DashboardCategory_, { nullable: true })
    async DashboardCategory(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<DashboardCategory_ | null> {
        this.CheckUserReadPermissions('Dashboard Categories', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwDashboardCategories] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Dashboard Categories', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Dashboard Categories', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
      
    @FieldResolver(() => [mj_core_schema_server_object_types.Dashboard_])
    async DashboardsArray(@Root() dashboardcategory_: DashboardCategory_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Dashboards', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwDashboards] WHERE [CategoryID]=${dashboardcategory_.ID} ` + this.getRowLevelSecurityWhereClause('Dashboards', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Dashboards', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.DashboardCategory_])
    async DashboardCategoriesArray(@Root() dashboardcategory_: DashboardCategory_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Dashboard Categories', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwDashboardCategories] WHERE [ParentID]=${dashboardcategory_.ID} ` + this.getRowLevelSecurityWhereClause('Dashboard Categories', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Dashboard Categories', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => DashboardCategory_)
    async CreateDashboardCategory(
        @Arg('input', () => CreateDashboardCategoryInput) input: CreateDashboardCategoryInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <DashboardCategoryEntity>await new Metadata().GetEntityObject('Dashboard Categories', this.GetUserFromPayload(userPayload));
            await entityObject.NewRecord();
            entityObject.SetMany(input);
            if (await entityObject.Save()) {
                // save worked, fire the AfterCreate event and then return all the data
                await this.AfterCreate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else 
                // save failed, return null
                return null;
        }
        else    
            return null;
    }

    // Before/After CREATE Event Hooks for Sub-Classes to Override
    protected async BeforeCreate(dataSource: DataSource, input: CreateDashboardCategoryInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateDashboardCategoryInput) {
    }
        
    @Mutation(() => DashboardCategory_)
    async UpdateDashboardCategory(
        @Arg('input', () => UpdateDashboardCategoryInput) input: UpdateDashboardCategoryInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <DashboardCategoryEntity>await new Metadata().GetEntityObject('Dashboard Categories', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for Dashboard Categories
            
            if (await entityObject.Save({ IgnoreDirtyState: true /*flag used because of LoadFromData() call above*/ })) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateDashboardCategoryInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateDashboardCategoryInput) {
        const i = input, d = dataSource; // prevent error
    }
    
    @Mutation(() => DashboardCategory_)
    async DeleteDashboardCategory(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        if (await this.BeforeDelete(dataSource, ID)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <DashboardCategoryEntity>await new Metadata().GetEntityObject('Dashboard Categories', this.GetUserFromPayload(userPayload));
            await entityObject.Load(ID);
            const returnValue = entityObject.GetAll(); // grab the values before we delete so we can return last state before delete if we are successful.
            if (await entityObject.Delete()) {
                await this.AfterDelete(dataSource, ID); // fire event
                return returnValue;
            }
            else 
                return null; // delete failed, this will cause an exception
        }
        else
            return null; // BeforeDelete canceled the operation, this will cause an exception
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeDelete(dataSource: DataSource, ID: number): Promise<boolean> {
        const i = ID, d = dataSource; // prevent error;
        return true;
    }
    protected async AfterDelete(dataSource: DataSource, ID: number) {
        const i = ID, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for Report Categories
//****************************************************************************
@ObjectType()
export class ReportCategory_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field() 
    @MaxLength(200)
    Name: string;
          
    @Field({nullable: true}) 
    Description?: string;
          
    @Field(() => Int, {nullable: true}) 
    ParentID?: number;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
          
    @Field(() => Int) 
    UserID: number;
          
    @Field({nullable: true}) 
    @MaxLength(200)
    Parent?: string;
          
    @Field() 
    @MaxLength(200)
    User: string;
        
    @Field(() => [mj_core_schema_server_object_types.ReportCategory_])
    ReportCategoriesArray: mj_core_schema_server_object_types.ReportCategory_[]; // Link to ReportCategories
    
    @Field(() => [mj_core_schema_server_object_types.Report_])
    ReportsArray: mj_core_schema_server_object_types.Report_[]; // Link to Reports
    
}
        
//****************************************************************************
// INPUT TYPE for Report Categories   
//****************************************************************************
@InputType()
export class CreateReportCategoryInput {
    @Field()
    Name: string;
    
    @Field({ nullable: true })
    Description: string;
    
    @Field(() => Int, { nullable: true })
    ParentID: number;
    
    @Field(() => Int)
    UserID: number;
    }
    
        
//****************************************************************************
// INPUT TYPE for Report Categories   
//****************************************************************************
@InputType()
export class UpdateReportCategoryInput {
    @Field(() => Int)
    ID: number;
    
    @Field()
    Name: string;
    
    @Field({ nullable: true })
    Description: string;
    
    @Field(() => Int, { nullable: true })
    ParentID: number;
    
    @Field(() => Int)
    UserID: number;
    }
    
//****************************************************************************
// RESOLVER for Report Categories
//****************************************************************************
@ObjectType()
export class RunReportCategoryViewResult {
    @Field(() => [ReportCategory_])
    Results: ReportCategory_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(ReportCategory_)
export class ReportCategoryResolver extends ResolverBase {
    @Query(() => RunReportCategoryViewResult)
    async RunReportCategoryViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunReportCategoryViewResult)
    async RunReportCategoryViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunReportCategoryViewResult)
    async RunReportCategoryDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Report Categories';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => ReportCategory_, { nullable: true })
    async ReportCategory(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<ReportCategory_ | null> {
        this.CheckUserReadPermissions('Report Categories', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwReportCategories] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Report Categories', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Report Categories', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
      
    @FieldResolver(() => [mj_core_schema_server_object_types.ReportCategory_])
    async ReportCategoriesArray(@Root() reportcategory_: ReportCategory_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Report Categories', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwReportCategories] WHERE [ParentID]=${reportcategory_.ID} ` + this.getRowLevelSecurityWhereClause('Report Categories', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Report Categories', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.Report_])
    async ReportsArray(@Root() reportcategory_: ReportCategory_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Reports', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwReports] WHERE [CategoryID]=${reportcategory_.ID} ` + this.getRowLevelSecurityWhereClause('Reports', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Reports', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => ReportCategory_)
    async CreateReportCategory(
        @Arg('input', () => CreateReportCategoryInput) input: CreateReportCategoryInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <ReportCategoryEntity>await new Metadata().GetEntityObject('Report Categories', this.GetUserFromPayload(userPayload));
            await entityObject.NewRecord();
            entityObject.SetMany(input);
            if (await entityObject.Save()) {
                // save worked, fire the AfterCreate event and then return all the data
                await this.AfterCreate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else 
                // save failed, return null
                return null;
        }
        else    
            return null;
    }

    // Before/After CREATE Event Hooks for Sub-Classes to Override
    protected async BeforeCreate(dataSource: DataSource, input: CreateReportCategoryInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateReportCategoryInput) {
    }
        
    @Mutation(() => ReportCategory_)
    async UpdateReportCategory(
        @Arg('input', () => UpdateReportCategoryInput) input: UpdateReportCategoryInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <ReportCategoryEntity>await new Metadata().GetEntityObject('Report Categories', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for Report Categories
            
            if (await entityObject.Save({ IgnoreDirtyState: true /*flag used because of LoadFromData() call above*/ })) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateReportCategoryInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateReportCategoryInput) {
        const i = input, d = dataSource; // prevent error
    }
    
    @Mutation(() => ReportCategory_)
    async DeleteReportCategory(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        if (await this.BeforeDelete(dataSource, ID)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <ReportCategoryEntity>await new Metadata().GetEntityObject('Report Categories', this.GetUserFromPayload(userPayload));
            await entityObject.Load(ID);
            const returnValue = entityObject.GetAll(); // grab the values before we delete so we can return last state before delete if we are successful.
            if (await entityObject.Delete()) {
                await this.AfterDelete(dataSource, ID); // fire event
                return returnValue;
            }
            else 
                return null; // delete failed, this will cause an exception
        }
        else
            return null; // BeforeDelete canceled the operation, this will cause an exception
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeDelete(dataSource: DataSource, ID: number): Promise<boolean> {
        const i = ID, d = dataSource; // prevent error;
        return true;
    }
    protected async AfterDelete(dataSource: DataSource, ID: number) {
        const i = ID, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for File Storage Providers
//****************************************************************************
@ObjectType()
export class FileStorageProvider_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field() 
    @MaxLength(100)
    Name: string;
          
    @Field({nullable: true}) 
    Description?: string;
          
    @Field() 
    @MaxLength(200)
    ServerDriverKey: string;
          
    @Field() 
    @MaxLength(200)
    ClientDriverKey: string;
          
    @Field(() => Int) 
    Priority: number;
          
    @Field(() => Boolean) 
    IsActive: boolean;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
        
    @Field(() => [mj_core_schema_server_object_types.File_])
    FilesArray: mj_core_schema_server_object_types.File_[]; // Link to Files
    
}
        
//****************************************************************************
// INPUT TYPE for File Storage Providers   
//****************************************************************************
@InputType()
export class CreateFileStorageProviderInput {
    @Field()
    Name: string;
    
    @Field({ nullable: true })
    Description: string;
    
    @Field()
    ServerDriverKey: string;
    
    @Field()
    ClientDriverKey: string;
    
    @Field(() => Int)
    Priority: number;
    
    @Field(() => Boolean)
    IsActive: boolean;
    }
    
        
//****************************************************************************
// INPUT TYPE for File Storage Providers   
//****************************************************************************
@InputType()
export class UpdateFileStorageProviderInput {
    @Field(() => Int)
    ID: number;
    
    @Field()
    Name: string;
    
    @Field({ nullable: true })
    Description: string;
    
    @Field()
    ServerDriverKey: string;
    
    @Field()
    ClientDriverKey: string;
    
    @Field(() => Int)
    Priority: number;
    
    @Field(() => Boolean)
    IsActive: boolean;
    }
    
//****************************************************************************
// RESOLVER for File Storage Providers
//****************************************************************************
@ObjectType()
export class RunFileStorageProviderViewResult {
    @Field(() => [FileStorageProvider_])
    Results: FileStorageProvider_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(FileStorageProvider_)
export class FileStorageProviderResolver extends ResolverBase {
    @Query(() => RunFileStorageProviderViewResult)
    async RunFileStorageProviderViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunFileStorageProviderViewResult)
    async RunFileStorageProviderViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunFileStorageProviderViewResult)
    async RunFileStorageProviderDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'File Storage Providers';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => FileStorageProvider_, { nullable: true })
    async FileStorageProvider(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<FileStorageProvider_ | null> {
        this.CheckUserReadPermissions('File Storage Providers', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwFileStorageProviders] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('File Storage Providers', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('File Storage Providers', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
      
    @FieldResolver(() => [mj_core_schema_server_object_types.File_])
    async FilesArray(@Root() filestorageprovider_: FileStorageProvider_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Files', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwFiles] WHERE [ProviderID]=${filestorageprovider_.ID} ` + this.getRowLevelSecurityWhereClause('Files', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Files', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => FileStorageProvider_)
    async CreateFileStorageProvider(
        @Arg('input', () => CreateFileStorageProviderInput) input: CreateFileStorageProviderInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <FileStorageProviderEntity>await new Metadata().GetEntityObject('File Storage Providers', this.GetUserFromPayload(userPayload));
            await entityObject.NewRecord();
            entityObject.SetMany(input);
            if (await entityObject.Save()) {
                // save worked, fire the AfterCreate event and then return all the data
                await this.AfterCreate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else 
                // save failed, return null
                return null;
        }
        else    
            return null;
    }

    // Before/After CREATE Event Hooks for Sub-Classes to Override
    protected async BeforeCreate(dataSource: DataSource, input: CreateFileStorageProviderInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateFileStorageProviderInput) {
    }
        
    @Mutation(() => FileStorageProvider_)
    async UpdateFileStorageProvider(
        @Arg('input', () => UpdateFileStorageProviderInput) input: UpdateFileStorageProviderInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <FileStorageProviderEntity>await new Metadata().GetEntityObject('File Storage Providers', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for File Storage Providers
            
            if (await entityObject.Save({ IgnoreDirtyState: true /*flag used because of LoadFromData() call above*/ })) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateFileStorageProviderInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateFileStorageProviderInput) {
        const i = input, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for Files
//****************************************************************************
@ObjectType()
export class File_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field() 
    @MaxLength(1000)
    Name: string;
          
    @Field({nullable: true}) 
    Description?: string;
          
    @Field(() => Int) 
    ProviderID: number;
          
    @Field({nullable: true}) 
    @MaxLength(100)
    ContentType?: string;
          
    @Field({nullable: true}) 
    @MaxLength(1000)
    ProviderKey?: string;
          
    @Field(() => Int, {nullable: true}) 
    CategoryID?: number;
          
    @Field({description: 'Pending, Uploading, Uploaded, Deleting, Deleted'}) 
    @MaxLength(40)
    Status: string;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
          
    @Field() 
    @MaxLength(100)
    Provider: string;
          
    @Field({nullable: true}) 
    @MaxLength(510)
    Category?: string;
        
    @Field(() => [mj_core_schema_server_object_types.FileEntityRecordLink_])
    FileEntityRecordLinksArray: mj_core_schema_server_object_types.FileEntityRecordLink_[]; // Link to FileEntityRecordLinks
    
}
        
//****************************************************************************
// INPUT TYPE for Files   
//****************************************************************************
@InputType()
export class CreateFileInput {
    @Field()
    Name: string;
    
    @Field({ nullable: true })
    Description: string;
    
    @Field(() => Int)
    ProviderID: number;
    
    @Field({ nullable: true })
    ContentType: string;
    
    @Field({ nullable: true })
    ProviderKey: string;
    
    @Field(() => Int, { nullable: true })
    CategoryID: number;
    
    @Field()
    Status: string;
    }
    
        
//****************************************************************************
// INPUT TYPE for Files   
//****************************************************************************
@InputType()
export class UpdateFileInput {
    @Field(() => Int)
    ID: number;
    
    @Field()
    Name: string;
    
    @Field({ nullable: true })
    Description: string;
    
    @Field(() => Int)
    ProviderID: number;
    
    @Field({ nullable: true })
    ContentType: string;
    
    @Field({ nullable: true })
    ProviderKey: string;
    
    @Field(() => Int, { nullable: true })
    CategoryID: number;
    
    @Field()
    Status: string;
    }
    
//****************************************************************************
// RESOLVER for Files
//****************************************************************************
@ObjectType()
export class RunFileViewResult {
    @Field(() => [File_])
    Results: File_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(File_)
export class FileResolver extends ResolverBase {
    @Query(() => RunFileViewResult)
    async RunFileViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunFileViewResult)
    async RunFileViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunFileViewResult)
    async RunFileDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Files';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => File_, { nullable: true })
    async File(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<File_ | null> {
        this.CheckUserReadPermissions('Files', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwFiles] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Files', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Files', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
      
    @FieldResolver(() => [mj_core_schema_server_object_types.FileEntityRecordLink_])
    async FileEntityRecordLinksArray(@Root() file_: File_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('File Entity Record Links', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwFileEntityRecordLinks] WHERE [FileID]=${file_.ID} ` + this.getRowLevelSecurityWhereClause('File Entity Record Links', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('File Entity Record Links', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => File_)
    async CreateFile(
        @Arg('input', () => CreateFileInput) input: CreateFileInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <FileEntity>await new Metadata().GetEntityObject('Files', this.GetUserFromPayload(userPayload));
            await entityObject.NewRecord();
            entityObject.SetMany(input);
            if (await entityObject.Save()) {
                // save worked, fire the AfterCreate event and then return all the data
                await this.AfterCreate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else 
                // save failed, return null
                return null;
        }
        else    
            return null;
    }

    // Before/After CREATE Event Hooks for Sub-Classes to Override
    protected async BeforeCreate(dataSource: DataSource, input: CreateFileInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateFileInput) {
    }
        
    @Mutation(() => File_)
    async UpdateFile(
        @Arg('input', () => UpdateFileInput) input: UpdateFileInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <FileEntity>await new Metadata().GetEntityObject('Files', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for Files
            
            if (await entityObject.Save({ IgnoreDirtyState: true /*flag used because of LoadFromData() call above*/ })) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateFileInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateFileInput) {
        const i = input, d = dataSource; // prevent error
    }
    
    @Mutation(() => File_)
    async DeleteFile(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        if (await this.BeforeDelete(dataSource, ID)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <FileEntity>await new Metadata().GetEntityObject('Files', this.GetUserFromPayload(userPayload));
            await entityObject.Load(ID);
            const returnValue = entityObject.GetAll(); // grab the values before we delete so we can return last state before delete if we are successful.
            if (await entityObject.Delete()) {
                await this.AfterDelete(dataSource, ID); // fire event
                return returnValue;
            }
            else 
                return null; // delete failed, this will cause an exception
        }
        else
            return null; // BeforeDelete canceled the operation, this will cause an exception
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeDelete(dataSource: DataSource, ID: number): Promise<boolean> {
        const i = ID, d = dataSource; // prevent error;
        return true;
    }
    protected async AfterDelete(dataSource: DataSource, ID: number) {
        const i = ID, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for File Categories
//****************************************************************************
@ObjectType()
export class FileCategory_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field() 
    @MaxLength(510)
    Name: string;
          
    @Field({nullable: true}) 
    Description?: string;
          
    @Field(() => Int, {nullable: true}) 
    ParentID?: number;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
          
    @Field({nullable: true}) 
    @MaxLength(510)
    Parent?: string;
        
    @Field(() => [mj_core_schema_server_object_types.File_])
    FilesArray: mj_core_schema_server_object_types.File_[]; // Link to Files
    
    @Field(() => [mj_core_schema_server_object_types.FileCategory_])
    FileCategoriesArray: mj_core_schema_server_object_types.FileCategory_[]; // Link to FileCategories
    
}
        
//****************************************************************************
// INPUT TYPE for File Categories   
//****************************************************************************
@InputType()
export class CreateFileCategoryInput {
    @Field()
    Name: string;
    
    @Field({ nullable: true })
    Description: string;
    
    @Field(() => Int, { nullable: true })
    ParentID: number;
    }
    
        
//****************************************************************************
// INPUT TYPE for File Categories   
//****************************************************************************
@InputType()
export class UpdateFileCategoryInput {
    @Field(() => Int)
    ID: number;
    
    @Field()
    Name: string;
    
    @Field({ nullable: true })
    Description: string;
    
    @Field(() => Int, { nullable: true })
    ParentID: number;
    }
    
//****************************************************************************
// RESOLVER for File Categories
//****************************************************************************
@ObjectType()
export class RunFileCategoryViewResult {
    @Field(() => [FileCategory_])
    Results: FileCategory_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(FileCategory_)
export class FileCategoryResolver extends ResolverBase {
    @Query(() => RunFileCategoryViewResult)
    async RunFileCategoryViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunFileCategoryViewResult)
    async RunFileCategoryViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunFileCategoryViewResult)
    async RunFileCategoryDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'File Categories';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => FileCategory_, { nullable: true })
    async FileCategory(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<FileCategory_ | null> {
        this.CheckUserReadPermissions('File Categories', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwFileCategories] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('File Categories', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('File Categories', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
      
    @FieldResolver(() => [mj_core_schema_server_object_types.File_])
    async FilesArray(@Root() filecategory_: FileCategory_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Files', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwFiles] WHERE [CategoryID]=${filecategory_.ID} ` + this.getRowLevelSecurityWhereClause('Files', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Files', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.FileCategory_])
    async FileCategoriesArray(@Root() filecategory_: FileCategory_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('File Categories', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwFileCategories] WHERE [ParentID]=${filecategory_.ID} ` + this.getRowLevelSecurityWhereClause('File Categories', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('File Categories', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => FileCategory_)
    async CreateFileCategory(
        @Arg('input', () => CreateFileCategoryInput) input: CreateFileCategoryInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <FileCategoryEntity>await new Metadata().GetEntityObject('File Categories', this.GetUserFromPayload(userPayload));
            await entityObject.NewRecord();
            entityObject.SetMany(input);
            if (await entityObject.Save()) {
                // save worked, fire the AfterCreate event and then return all the data
                await this.AfterCreate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else 
                // save failed, return null
                return null;
        }
        else    
            return null;
    }

    // Before/After CREATE Event Hooks for Sub-Classes to Override
    protected async BeforeCreate(dataSource: DataSource, input: CreateFileCategoryInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateFileCategoryInput) {
    }
        
    @Mutation(() => FileCategory_)
    async UpdateFileCategory(
        @Arg('input', () => UpdateFileCategoryInput) input: UpdateFileCategoryInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <FileCategoryEntity>await new Metadata().GetEntityObject('File Categories', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for File Categories
            
            if (await entityObject.Save({ IgnoreDirtyState: true /*flag used because of LoadFromData() call above*/ })) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateFileCategoryInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateFileCategoryInput) {
        const i = input, d = dataSource; // prevent error
    }
    
    @Mutation(() => FileCategory_)
    async DeleteFileCategory(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        if (await this.BeforeDelete(dataSource, ID)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <FileCategoryEntity>await new Metadata().GetEntityObject('File Categories', this.GetUserFromPayload(userPayload));
            await entityObject.Load(ID);
            const returnValue = entityObject.GetAll(); // grab the values before we delete so we can return last state before delete if we are successful.
            if (await entityObject.Delete()) {
                await this.AfterDelete(dataSource, ID); // fire event
                return returnValue;
            }
            else 
                return null; // delete failed, this will cause an exception
        }
        else
            return null; // BeforeDelete canceled the operation, this will cause an exception
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeDelete(dataSource: DataSource, ID: number): Promise<boolean> {
        const i = ID, d = dataSource; // prevent error;
        return true;
    }
    protected async AfterDelete(dataSource: DataSource, ID: number) {
        const i = ID, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for File Entity Record Links
//****************************************************************************
@ObjectType()
export class FileEntityRecordLink_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field(() => Int) 
    FileID: number;
          
    @Field(() => Int) 
    EntityID: number;
          
    @Field() 
    @MaxLength(510)
    RecordID: string;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
          
    @Field() 
    @MaxLength(1000)
    File: string;
          
    @Field() 
    @MaxLength(510)
    Entity: string;
        
}
        
//****************************************************************************
// INPUT TYPE for File Entity Record Links   
//****************************************************************************
@InputType()
export class CreateFileEntityRecordLinkInput {
    @Field(() => Int)
    FileID: number;
    
    @Field(() => Int)
    EntityID: number;
    
    @Field()
    RecordID: string;
    }
    
        
//****************************************************************************
// INPUT TYPE for File Entity Record Links   
//****************************************************************************
@InputType()
export class UpdateFileEntityRecordLinkInput {
    @Field(() => Int)
    ID: number;
    
    @Field(() => Int)
    FileID: number;
    
    @Field(() => Int)
    EntityID: number;
    
    @Field()
    RecordID: string;
    }
    
//****************************************************************************
// RESOLVER for File Entity Record Links
//****************************************************************************
@ObjectType()
export class RunFileEntityRecordLinkViewResult {
    @Field(() => [FileEntityRecordLink_])
    Results: FileEntityRecordLink_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(FileEntityRecordLink_)
export class FileEntityRecordLinkResolver extends ResolverBase {
    @Query(() => RunFileEntityRecordLinkViewResult)
    async RunFileEntityRecordLinkViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunFileEntityRecordLinkViewResult)
    async RunFileEntityRecordLinkViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunFileEntityRecordLinkViewResult)
    async RunFileEntityRecordLinkDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'File Entity Record Links';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => FileEntityRecordLink_, { nullable: true })
    async FileEntityRecordLink(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<FileEntityRecordLink_ | null> {
        this.CheckUserReadPermissions('File Entity Record Links', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwFileEntityRecordLinks] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('File Entity Record Links', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('File Entity Record Links', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => FileEntityRecordLink_)
    async CreateFileEntityRecordLink(
        @Arg('input', () => CreateFileEntityRecordLinkInput) input: CreateFileEntityRecordLinkInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <FileEntityRecordLinkEntity>await new Metadata().GetEntityObject('File Entity Record Links', this.GetUserFromPayload(userPayload));
            await entityObject.NewRecord();
            entityObject.SetMany(input);
            if (await entityObject.Save()) {
                // save worked, fire the AfterCreate event and then return all the data
                await this.AfterCreate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else 
                // save failed, return null
                return null;
        }
        else    
            return null;
    }

    // Before/After CREATE Event Hooks for Sub-Classes to Override
    protected async BeforeCreate(dataSource: DataSource, input: CreateFileEntityRecordLinkInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateFileEntityRecordLinkInput) {
    }
        
    @Mutation(() => FileEntityRecordLink_)
    async UpdateFileEntityRecordLink(
        @Arg('input', () => UpdateFileEntityRecordLinkInput) input: UpdateFileEntityRecordLinkInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <FileEntityRecordLinkEntity>await new Metadata().GetEntityObject('File Entity Record Links', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for File Entity Record Links
            
            if (await entityObject.Save({ IgnoreDirtyState: true /*flag used because of LoadFromData() call above*/ })) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateFileEntityRecordLinkInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateFileEntityRecordLinkInput) {
        const i = input, d = dataSource; // prevent error
    }
    
}

//****************************************************************************
// ENTITY CLASS for Version Installations
//****************************************************************************
@ObjectType()
export class VersionInstallation_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field(() => Int) 
    MajorVersion: number;
          
    @Field(() => Int) 
    MinorVersion: number;
          
    @Field(() => Int) 
    PatchVersion: number;
          
    @Field({nullable: true, description: 'What type of installation was applied'}) 
    @MaxLength(40)
    Type?: string;
          
    @Field() 
    @MaxLength(8)
    InstalledAt: Date;
          
    @Field({description: 'Pending, Complete, Failed'}) 
    @MaxLength(40)
    Status: string;
          
    @Field({nullable: true, description: 'Any logging that was saved from the installation process'}) 
    InstallLog?: string;
          
    @Field({nullable: true, description: 'Optional, comments the administrator wants to save for each installed version'}) 
    Comments?: string;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
          
    @Field({nullable: true}) 
    @MaxLength(604)
    CompleteVersion?: string;
        
}
        
//****************************************************************************
// INPUT TYPE for Version Installations   
//****************************************************************************
@InputType()
export class CreateVersionInstallationInput {
    @Field(() => Int)
    MajorVersion: number;
    
    @Field(() => Int)
    MinorVersion: number;
    
    @Field(() => Int)
    PatchVersion: number;
    
    @Field({ nullable: true })
    Type: string;
    
    @Field()
    InstalledAt: Date;
    
    @Field()
    Status: string;
    
    @Field({ nullable: true })
    InstallLog: string;
    
    @Field({ nullable: true })
    Comments: string;
    }
    
        
//****************************************************************************
// INPUT TYPE for Version Installations   
//****************************************************************************
@InputType()
export class UpdateVersionInstallationInput {
    @Field(() => Int)
    ID: number;
    
    @Field(() => Int)
    MajorVersion: number;
    
    @Field(() => Int)
    MinorVersion: number;
    
    @Field(() => Int)
    PatchVersion: number;
    
    @Field({ nullable: true })
    Type: string;
    
    @Field()
    InstalledAt: Date;
    
    @Field()
    Status: string;
    
    @Field({ nullable: true })
    InstallLog: string;
    
    @Field({ nullable: true })
    Comments: string;
    }
    
//****************************************************************************
// RESOLVER for Version Installations
//****************************************************************************
@ObjectType()
export class RunVersionInstallationViewResult {
    @Field(() => [VersionInstallation_])
    Results: VersionInstallation_[];

    @Field(() => Int, {nullable: true})
    UserViewRunID?: number;

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

@Resolver(VersionInstallation_)
export class VersionInstallationResolver extends ResolverBase {
    @Query(() => RunVersionInstallationViewResult)
    async RunVersionInstallationViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunVersionInstallationViewResult)
    async RunVersionInstallationViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunVersionInstallationViewResult)
    async RunVersionInstallationDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Version Installations';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => VersionInstallation_, { nullable: true })
    async VersionInstallation(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<VersionInstallation_ | null> {
        this.CheckUserReadPermissions('Version Installations', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwVersionInstallations] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Version Installations', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Version Installations', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => VersionInstallation_)
    async CreateVersionInstallation(
        @Arg('input', () => CreateVersionInstallationInput) input: CreateVersionInstallationInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <VersionInstallationEntity>await new Metadata().GetEntityObject('Version Installations', this.GetUserFromPayload(userPayload));
            await entityObject.NewRecord();
            entityObject.SetMany(input);
            if (await entityObject.Save()) {
                // save worked, fire the AfterCreate event and then return all the data
                await this.AfterCreate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else 
                // save failed, return null
                return null;
        }
        else    
            return null;
    }

    // Before/After CREATE Event Hooks for Sub-Classes to Override
    protected async BeforeCreate(dataSource: DataSource, input: CreateVersionInstallationInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateVersionInstallationInput) {
    }
        
    @Mutation(() => VersionInstallation_)
    async UpdateVersionInstallation(
        @Arg('input', () => UpdateVersionInstallationInput) input: UpdateVersionInstallationInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <VersionInstallationEntity>await new Metadata().GetEntityObject('Version Installations', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for Version Installations
            
            if (await entityObject.Save({ IgnoreDirtyState: true /*flag used because of LoadFromData() call above*/ })) {
                // save worked, fire afterevent and return all the data
                await this.AfterUpdate(dataSource, input); // fire event
                return entityObject.GetAll();
            }
            else
                return null; // save failed, return null
        }
        else
            return null;
    }

    // Before/After UPDATE Event Hooks for Sub-Classes to Override
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateVersionInstallationInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateVersionInstallationInput) {
        const i = input, d = dataSource; // prevent error
    }
    
}