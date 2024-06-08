/********************************************************************************
* ALL ENTITIES - TypeGraphQL Type Class Definition - AUTO GENERATED FILE
* Generated Entities and Resolvers for Server
* 
* GENERATED: 6/7/2024, 8:04:43 PM
* 
*   >>> DO NOT MODIFY THIS FILE!!!!!!!!!!!!
*   >>> YOUR CHANGES WILL BE OVERWRITTEN
*   >>> THE NEXT TIME THIS FILE IS GENERATED
* 
**********************************************************************************/
import { Arg, Ctx, Int, Query, Resolver, Field, Float, ObjectType, FieldResolver, Root, InputType, Mutation, 
            PubSub, PubSubEngine, ResolverBase, RunViewByIDInput, RunViewByNameInput, RunDynamicViewInput,
            AppContext, KeyValuePairInput, DeleteOptionsInput } from '@memberjunction/server';
import { Metadata, EntityPermissionType, CompositeKey } from '@memberjunction/core'

import { MaxLength } from 'class-validator';
import { DataSource } from 'typeorm';
import { mj_core_schema } from '../config';

import * as mj_core_schema_server_object_types from '@memberjunction/server'

import { CompanyEntity, EmployeeEntity, UserFavoriteEntity, EmployeeCompanyIntegrationEntity, EmployeeRoleEntity, EmployeeSkillEntity, RoleEntity, SkillEntity, IntegrationURLFormatEntity, IntegrationEntity, CompanyIntegrationEntity, EntityFieldEntity, EntityEntity, UserEntity, EntityRelationshipEntity, UserRecordLogEntity, UserViewEntity, CompanyIntegrationRunEntity, CompanyIntegrationRunDetailEntity, ErrorLogEntity, ApplicationEntity, ApplicationEntityEntity, EntityPermissionEntity, UserApplicationEntityEntity, UserApplicationEntity, CompanyIntegrationRunAPILogEntity, ListEntity, ListDetailEntity, UserViewRunEntity, UserViewRunDetailEntity, WorkflowRunEntity, WorkflowEntity, WorkflowEngineEntity, RecordChangeEntity, UserRoleEntity, RowLevelSecurityFilterEntity, AuditLogEntity, AuthorizationEntity, AuthorizationRoleEntity, AuditLogTypeEntity, EntityFieldValueEntity, AIModelEntity, AIActionEntity, AIModelActionEntity, EntityAIActionEntity, AIModelTypeEntity, QueueTypeEntity, QueueEntity, QueueTaskEntity, DashboardEntity, OutputTriggerTypeEntity, OutputFormatTypeEntity, OutputDeliveryTypeEntity, ReportEntity, ReportSnapshotEntity, ResourceTypeEntity, TagEntity, TaggedItemEntity, WorkspaceEntity, WorkspaceItemEntity, DatasetEntity, DatasetItemEntity, ConversationDetailEntity, ConversationEntity, UserNotificationEntity, SchemaInfoEntity, CompanyIntegrationRecordMapEntity, RecordMergeLogEntity, RecordMergeDeletionLogEntity, QueryFieldEntity, QueryCategoryEntity, QueryEntity, QueryPermissionEntity, VectorIndexEntity, EntityDocumentTypeEntity, EntityDocumentRunEntity, VectorDatabaseEntity, EntityRecordDocumentEntity, EntityDocumentEntity, DataContextItemEntity, DataContextEntity, UserViewCategoryEntity, DashboardCategoryEntity, ReportCategoryEntity, FileStorageProviderEntity, FileEntity, FileCategoryEntity, FileEntityRecordLinkEntity, VersionInstallationEntity, DuplicateRunDetailMatchEntity, EntityDocumentSettingEntity, EntitySettingEntity, DuplicateRunEntity, DuplicateRunDetailEntity, EntityBehaviorEntity, EntityBehaviorTypeEntity, ApplicationSettingEntity, ActionCategoryEntity, EntityActionEntity, EntityActionInvocationEntity, ActionAuthorizationEntity, EntityActionInvocationTypeEntity, ActionEntity, EntityActionFilterEntity, ActionFilterEntity, ActionContextTypeEntity, ActionResultCodeEntity, ActionContextEntity, ActionExecutionLogEntity, ActionParamEntity, ActionLibraryEntity, LibraryEntity, ListCategoryEntity, CommunicationProviderEntity, CommunicationRunEntity, CommunicationProviderMessageTypeEntity, CommunicationLogEntity, CommunicationBaseMessageTypeEntity, TemplateEntity, TemplateCategoryEntity } from '@memberjunction/core-entities';
    

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
    Website?: string;

    @Field({ nullable: true })
    LogoURL?: string;

    @Field({ nullable: true })
    Domain?: string;
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
    Website?: string;

    @Field({ nullable: true })
    LogoURL?: string;

    @Field({ nullable: true })
    Domain?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
        return this.CreateRecord('Companies', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => Company_)
    async UpdateCompany(
        @Arg('input', () => UpdateCompanyInput) input: UpdateCompanyInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Companies', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => Company_)
    async DeleteCompany(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Companies', key, options, dataSource, userPayload, pubSub);
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
    
    @Field(() => [mj_core_schema_server_object_types.User_])
    UsersArray: mj_core_schema_server_object_types.User_[]; // Link to Users
    
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
    Title?: string;

    @Field()
    Email: string;

    @Field({ nullable: true })
    Phone?: string;

    @Field(() => Boolean)
    Active: boolean;

    @Field(() => Int)
    CompanyID: number;

    @Field(() => Int, { nullable: true })
    SupervisorID?: number;
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
    Title?: string;

    @Field()
    Email: string;

    @Field({ nullable: true })
    Phone?: string;

    @Field(() => Boolean)
    Active: boolean;

    @Field(() => Int)
    CompanyID: number;

    @Field(() => Int, { nullable: true })
    SupervisorID?: number;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
          
    @FieldResolver(() => [mj_core_schema_server_object_types.User_])
    async UsersArray(@Root() employee_: Employee_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Users', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwUsers] WHERE [EmployeeID]=${employee_.ID} ` + this.getRowLevelSecurityWhereClause('Users', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Users', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => Employee_)
    async CreateEmployee(
        @Arg('input', () => CreateEmployeeInput) input: CreateEmployeeInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.CreateRecord('Employees', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => Employee_)
    async UpdateEmployee(
        @Arg('input', () => UpdateEmployeeInput) input: UpdateEmployeeInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Employees', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => Employee_)
    async DeleteEmployee(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Employees', key, options, dataSource, userPayload, pubSub);
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

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
        return this.CreateRecord('User Favorites', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => UserFavorite_)
    async UpdateUserFavorite(
        @Arg('input', () => UpdateUserFavoriteInput) input: UpdateUserFavoriteInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('User Favorites', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => UserFavorite_)
    async DeleteUserFavorite(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('User Favorites', key, options, dataSource, userPayload, pubSub);
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

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
        return this.UpdateRecord('Employee Company Integrations', input, dataSource, userPayload, pubSub);
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

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
        return this.UpdateRecord('Employee Roles', input, dataSource, userPayload, pubSub);
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

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
        return this.UpdateRecord('Employee Skills', input, dataSource, userPayload, pubSub);
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
    Description?: string;

    @Field({ nullable: true })
    DirectoryID?: string;

    @Field({ nullable: true })
    SQLName?: string;
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
    Description?: string;

    @Field({ nullable: true })
    DirectoryID?: string;

    @Field({ nullable: true })
    SQLName?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
        return this.CreateRecord('Roles', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => Role_)
    async UpdateRole(
        @Arg('input', () => UpdateRoleInput) input: UpdateRoleInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Roles', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => Role_)
    async DeleteRole(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Roles', key, options, dataSource, userPayload, pubSub);
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
    IntegrationName?: string;

    @Field(() => Int)
    EntityID: number;

    @Field()
    URLFormat: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
        return this.UpdateRecord('Integration URL Formats', input, dataSource, userPayload, pubSub);
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
    Description?: string;

    @Field({ nullable: true })
    NavigationBaseURL?: string;

    @Field({ nullable: true })
    ClassName?: string;

    @Field({ nullable: true })
    ImportPath?: string;

    @Field(() => Int)
    BatchMaxRequestCount: number;

    @Field(() => Int)
    BatchRequestWaitTime: number;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
        return this.UpdateRecord('Integrations', input, dataSource, userPayload, pubSub);
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
    IsActive?: boolean;

    @Field({ nullable: true })
    AccessToken?: string;

    @Field({ nullable: true })
    RefreshToken?: string;

    @Field({ nullable: true })
    TokenExpirationDate?: Date;

    @Field({ nullable: true })
    APIKey?: string;

    @Field({ nullable: true })
    ExternalSystemID?: string;

    @Field(() => Boolean)
    IsExternalSystemReadOnly: boolean;

    @Field({ nullable: true })
    ClientID?: string;

    @Field({ nullable: true })
    ClientSecret?: string;

    @Field({ nullable: true })
    CustomAttribute1?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
        return this.UpdateRecord('Company Integrations', input, dataSource, userPayload, pubSub);
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
          
    @Field(() => Int, {description: 'Display order of the field within the entity'}) 
    Sequence: number;
          
    @Field({description: 'Name of the field within the database table'}) 
    @MaxLength(510)
    Name: string;
          
    @Field({nullable: true, description: 'A user friendly alternative to the field name'}) 
    @MaxLength(510)
    DisplayName?: string;
          
    @Field({nullable: true, description: 'Descriptive text explaining the purpose of the field'}) 
    Description?: string;
          
    @Field(() => Boolean, {description: 'When set to 1 (default), whenever a description is modified in the column within the underlying view (first choice) or table (second choice), the Description column in the entity field definition will be automatically updated. If you never set metadata in the database directly, you can leave this alone. However, if you have metadata set in the database level for description, and you want to provide a DIFFERENT description in this entity field definition, turn this bit off and then set the Description field and future CodeGen runs will NOT override the Description field here.'}) 
    AutoUpdateDescription: boolean;
          
    @Field(() => Boolean, {description: 'Indicates if the field is part of the primary key for the entity (auto maintained by CodeGen)'}) 
    IsPrimaryKey: boolean;
          
    @Field(() => Boolean, {description: 'Indicates if the field must have unique values within the entity.'}) 
    IsUnique: boolean;
          
    @Field({nullable: true, description: 'Used for generating custom tabs in the generated forms, only utilized if GeneratedFormSection=Category'}) 
    @MaxLength(510)
    Category?: string;
          
    @Field({description: 'SQL Data type (auto maintained by CodeGen)'}) 
    @MaxLength(200)
    Type: string;
          
    @Field(() => Int, {nullable: true, description: 'SQL data length (auto maintained by CodeGen)'}) 
    Length?: number;
          
    @Field(() => Int, {nullable: true, description: 'SQL precision (auto maintained by CodeGen)'}) 
    Precision?: number;
          
    @Field(() => Int, {nullable: true, description: 'SQL scale (auto maintained by CodeGen)'}) 
    Scale?: number;
          
    @Field(() => Boolean, {description: 'Does the column allow null or not (auto maintained by CodeGen)'}) 
    AllowsNull: boolean;
          
    @Field({nullable: true, description: 'If a default value is defined for the field it is stored here (auto maintained by CodeGen)'}) 
    @MaxLength(510)
    DefaultValue?: string;
          
    @Field(() => Boolean, {description: 'If this field automatically increments within the table, this field is set to 1 (auto maintained by CodeGen)'}) 
    AutoIncrement: boolean;
          
    @Field({description: 'Possible Values of None, List, ListOrUserEntry - the last option meaning that the list of possible values are options, but a user can enter anything else desired too.'}) 
    @MaxLength(40)
    ValueListType: string;
          
    @Field({nullable: true, description: 'Defines extended behaviors for a field such as for Email, Web URLs, Code, etc.'}) 
    @MaxLength(100)
    ExtendedType?: string;
          
    @Field({nullable: true, description: 'The type of code associated with this field. Only used when the ExtendedType field is set to "Code"'}) 
    @MaxLength(100)
    CodeType?: string;
          
    @Field(() => Boolean, {description: 'If set to 1, this field will be included by default in any new view created by a user.'}) 
    DefaultInView: boolean;
          
    @Field({nullable: true, description: 'NULL'}) 
    ViewCellTemplate?: string;
          
    @Field(() => Int, {nullable: true, description: 'Determines the default width for this field when included in a view'}) 
    DefaultColumnWidth?: number;
          
    @Field(() => Boolean, {description: 'If set to 1, this field will be considered updateable by the API and object model. For this field to have effect, the column type must be updateable (e.g. not part of the primary key and not auto-increment)'}) 
    AllowUpdateAPI: boolean;
          
    @Field(() => Boolean, {description: 'If set to 1, and if AllowUpdateAPI=1, the field can be edited within a view when the view is in edit mode.'}) 
    AllowUpdateInView: boolean;
          
    @Field(() => Boolean, {description: 'If set to 1, this column will be included in user search queries for both traditional and full text search'}) 
    IncludeInUserSearchAPI: boolean;
          
    @Field(() => Boolean, {description: 'If set to 1, CodeGen will automatically generate a Full Text Catalog/Index in the database and include this field in the search index.'}) 
    FullTextSearchEnabled: boolean;
          
    @Field({nullable: true, description: 'NULL'}) 
    @MaxLength(1000)
    UserSearchParamFormatAPI?: string;
          
    @Field(() => Boolean, {description: 'If set to 1, this field will be included in the generated form by CodeGen. If set to 0, this field will be excluded from the generated form. For custom forms, this field has no effect as the layout is controlled independently.'}) 
    IncludeInGeneratedForm: boolean;
          
    @Field({description: 'When set to Top, the field will be placed in a "top area" on the top of a generated form and visible regardless of which tab is displayed. When set to "category" Options: Top, Category, Details'}) 
    @MaxLength(20)
    GeneratedFormSection: string;
          
    @Field(() => Boolean, {description: 'NULL'}) 
    IsVirtual: boolean;
          
    @Field(() => Boolean, {description: 'If set to 1, this column will be used as the "Name" field for the entity and will be used to display the name of the record in various places in the UI.'}) 
    IsNameField: boolean;
          
    @Field(() => Int, {nullable: true, description: 'Link to the entity this field points to if it is a foreign key (auto maintained by CodeGen)'}) 
    RelatedEntityID?: number;
          
    @Field({nullable: true, description: 'Name of the field in the Related Entity that this field links to (auto maintained by CodeGen)'}) 
    @MaxLength(510)
    RelatedEntityFieldName?: string;
          
    @Field(() => Boolean, {description: 'If set to 1, the "Name" field of the Related Entity will be included in this entity as a virtual field'}) 
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
    EntityCodeName?: string;
          
    @Field({nullable: true}) 
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
    RelatedEntityCodeName?: string;
          
    @Field({nullable: true}) 
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
    DisplayName?: string;

    @Field({ nullable: true })
    Description?: string;

    @Field(() => Boolean)
    AutoUpdateDescription: boolean;

    @Field(() => Boolean)
    IsPrimaryKey: boolean;

    @Field(() => Boolean)
    IsUnique: boolean;

    @Field({ nullable: true })
    Category?: string;

    @Field()
    ValueListType: string;

    @Field({ nullable: true })
    ExtendedType?: string;

    @Field({ nullable: true })
    CodeType?: string;

    @Field(() => Boolean)
    DefaultInView: boolean;

    @Field({ nullable: true })
    ViewCellTemplate?: string;

    @Field(() => Int, { nullable: true })
    DefaultColumnWidth?: number;

    @Field(() => Boolean)
    AllowUpdateAPI: boolean;

    @Field(() => Boolean)
    AllowUpdateInView: boolean;

    @Field(() => Boolean)
    IncludeInUserSearchAPI: boolean;

    @Field(() => Boolean)
    FullTextSearchEnabled: boolean;

    @Field({ nullable: true })
    UserSearchParamFormatAPI?: string;

    @Field(() => Boolean)
    IncludeInGeneratedForm: boolean;

    @Field()
    GeneratedFormSection: string;

    @Field(() => Boolean)
    IsNameField: boolean;

    @Field(() => Int, { nullable: true })
    RelatedEntityID?: number;

    @Field({ nullable: true })
    RelatedEntityFieldName?: string;

    @Field(() => Boolean)
    IncludeRelatedEntityNameFieldInBaseView: boolean;

    @Field({ nullable: true })
    RelatedEntityNameFieldMap?: string;
}
    
        
//****************************************************************************
// INPUT TYPE for Entity Fields   
//****************************************************************************
@InputType()
export class UpdateEntityFieldInput {
    @Field(() => Int)
    ID: number;

    @Field({ nullable: true })
    DisplayName?: string;

    @Field({ nullable: true })
    Description?: string;

    @Field(() => Boolean)
    AutoUpdateDescription: boolean;

    @Field(() => Boolean)
    IsPrimaryKey: boolean;

    @Field(() => Boolean)
    IsUnique: boolean;

    @Field({ nullable: true })
    Category?: string;

    @Field()
    ValueListType: string;

    @Field({ nullable: true })
    ExtendedType?: string;

    @Field({ nullable: true })
    CodeType?: string;

    @Field(() => Boolean)
    DefaultInView: boolean;

    @Field({ nullable: true })
    ViewCellTemplate?: string;

    @Field(() => Int, { nullable: true })
    DefaultColumnWidth?: number;

    @Field(() => Boolean)
    AllowUpdateAPI: boolean;

    @Field(() => Boolean)
    AllowUpdateInView: boolean;

    @Field(() => Boolean)
    IncludeInUserSearchAPI: boolean;

    @Field(() => Boolean)
    FullTextSearchEnabled: boolean;

    @Field({ nullable: true })
    UserSearchParamFormatAPI?: string;

    @Field(() => Boolean)
    IncludeInGeneratedForm: boolean;

    @Field()
    GeneratedFormSection: string;

    @Field(() => Boolean)
    IsNameField: boolean;

    @Field(() => Int, { nullable: true })
    RelatedEntityID?: number;

    @Field({ nullable: true })
    RelatedEntityFieldName?: string;

    @Field(() => Boolean)
    IncludeRelatedEntityNameFieldInBaseView: boolean;

    @Field({ nullable: true })
    RelatedEntityNameFieldMap?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
        return this.CreateRecord('Entity Fields', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => EntityField_)
    async UpdateEntityField(
        @Arg('input', () => UpdateEntityFieldInput) input: UpdateEntityFieldInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Entity Fields', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => EntityField_)
    async DeleteEntityField(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Entity Fields', key, options, dataSource, userPayload, pubSub);
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
          
    @Field(() => Boolean, {description: 'When set to 1, the deleted spDelete will pre-process deletion to related entities that have 1:M cardinality with this entity. This does not have effect if spDeleteGenerated = 0'}) 
    CascadeDeletes: boolean;
          
    @Field({nullable: true, description: 'When specified, this stored procedure is used to find matching records in this particular entity. The convention is to pass in the primary key(s) columns for the given entity to the procedure and the return will be zero to many rows where there is a column for each primary key field(s) and a ProbabilityScore (numeric(1,12)) column that has a 0 to 1 value of the probability of a match.'}) 
    @MaxLength(510)
    spMatch?: string;
          
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
    CodeName?: string;
          
    @Field({nullable: true}) 
    ClassName?: string;
          
    @Field({nullable: true}) 
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
    
    @Field(() => [mj_core_schema_server_object_types.EntitySetting_])
    EntitySettingsArray: mj_core_schema_server_object_types.EntitySetting_[]; // Link to EntitySettings
    
    @Field(() => [mj_core_schema_server_object_types.DuplicateRun_])
    DuplicateRunsArray: mj_core_schema_server_object_types.DuplicateRun_[]; // Link to DuplicateRuns
    
    @Field(() => [mj_core_schema_server_object_types.EntityBehavior_])
    EntityBehaviorsArray: mj_core_schema_server_object_types.EntityBehavior_[]; // Link to EntityBehaviors
    
    @Field(() => [mj_core_schema_server_object_types.EntityAction_])
    EntityActionsArray: mj_core_schema_server_object_types.EntityAction_[]; // Link to EntityActions
    
}
        
//****************************************************************************
// INPUT TYPE for Entities   
//****************************************************************************
@InputType()
export class CreateEntityInput {
    @Field(() => Int)
    ID: number;

    @Field(() => Int, { nullable: true })
    ParentID?: number;

    @Field()
    Name: string;

    @Field({ nullable: true })
    NameSuffix?: string;

    @Field({ nullable: true })
    Description?: string;

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
    FullTextCatalog?: string;

    @Field(() => Boolean)
    FullTextCatalogGenerated: boolean;

    @Field({ nullable: true })
    FullTextIndex?: string;

    @Field(() => Boolean)
    FullTextIndexGenerated: boolean;

    @Field({ nullable: true })
    FullTextSearchFunction?: string;

    @Field(() => Boolean)
    FullTextSearchFunctionGenerated: boolean;

    @Field(() => Int, { nullable: true })
    UserViewMaxRows?: number;

    @Field({ nullable: true })
    spCreate?: string;

    @Field({ nullable: true })
    spUpdate?: string;

    @Field({ nullable: true })
    spDelete?: string;

    @Field(() => Boolean)
    spCreateGenerated: boolean;

    @Field(() => Boolean)
    spUpdateGenerated: boolean;

    @Field(() => Boolean)
    spDeleteGenerated: boolean;

    @Field(() => Boolean)
    CascadeDeletes: boolean;

    @Field({ nullable: true })
    spMatch?: string;

    @Field(() => Boolean)
    UserFormGenerated: boolean;

    @Field({ nullable: true })
    EntityObjectSubclassName?: string;

    @Field({ nullable: true })
    EntityObjectSubclassImport?: string;
}
    
        
//****************************************************************************
// INPUT TYPE for Entities   
//****************************************************************************
@InputType()
export class UpdateEntityInput {
    @Field(() => Int)
    ID: number;

    @Field(() => Int, { nullable: true })
    ParentID?: number;

    @Field()
    Name: string;

    @Field({ nullable: true })
    NameSuffix?: string;

    @Field({ nullable: true })
    Description?: string;

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
    FullTextCatalog?: string;

    @Field(() => Boolean)
    FullTextCatalogGenerated: boolean;

    @Field({ nullable: true })
    FullTextIndex?: string;

    @Field(() => Boolean)
    FullTextIndexGenerated: boolean;

    @Field({ nullable: true })
    FullTextSearchFunction?: string;

    @Field(() => Boolean)
    FullTextSearchFunctionGenerated: boolean;

    @Field(() => Int, { nullable: true })
    UserViewMaxRows?: number;

    @Field({ nullable: true })
    spCreate?: string;

    @Field({ nullable: true })
    spUpdate?: string;

    @Field({ nullable: true })
    spDelete?: string;

    @Field(() => Boolean)
    spCreateGenerated: boolean;

    @Field(() => Boolean)
    spUpdateGenerated: boolean;

    @Field(() => Boolean)
    spDeleteGenerated: boolean;

    @Field(() => Boolean)
    CascadeDeletes: boolean;

    @Field({ nullable: true })
    spMatch?: string;

    @Field(() => Boolean)
    UserFormGenerated: boolean;

    @Field({ nullable: true })
    EntityObjectSubclassName?: string;

    @Field({ nullable: true })
    EntityObjectSubclassImport?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
          
    @FieldResolver(() => [mj_core_schema_server_object_types.EntitySetting_])
    async EntitySettingsArray(@Root() entity_: Entity_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Entity Settings', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwEntitySettings] WHERE [EntityID]=${entity_.ID} ` + this.getRowLevelSecurityWhereClause('Entity Settings', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Entity Settings', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.DuplicateRun_])
    async DuplicateRunsArray(@Root() entity_: Entity_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Duplicate Runs', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwDuplicateRuns] WHERE [EntityID]=${entity_.ID} ` + this.getRowLevelSecurityWhereClause('Duplicate Runs', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Duplicate Runs', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.EntityBehavior_])
    async EntityBehaviorsArray(@Root() entity_: Entity_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Entity Behaviors', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwEntityBehaviors] WHERE [EntityID]=${entity_.ID} ` + this.getRowLevelSecurityWhereClause('Entity Behaviors', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Entity Behaviors', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.EntityAction_])
    async EntityActionsArray(@Root() entity_: Entity_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Entity Actions', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwEntityActions] WHERE [EntityID]=${entity_.ID} ` + this.getRowLevelSecurityWhereClause('Entity Actions', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Entity Actions', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => Entity_)
    async CreateEntity(
        @Arg('input', () => CreateEntityInput) input: CreateEntityInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.CreateRecord('Entities', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => Entity_)
    async UpdateEntity(
        @Arg('input', () => UpdateEntityInput) input: UpdateEntityInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Entities', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => Entity_)
    async DeleteEntity(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Entities', key, options, dataSource, userPayload, pubSub);
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
    
    @Field(() => [mj_core_schema_server_object_types.DuplicateRun_])
    DuplicateRunsArray: mj_core_schema_server_object_types.DuplicateRun_[]; // Link to DuplicateRuns
    
    @Field(() => [mj_core_schema_server_object_types.ActionExecutionLog_])
    ActionExecutionLogsArray: mj_core_schema_server_object_types.ActionExecutionLog_[]; // Link to ActionExecutionLogs
    
    @Field(() => [mj_core_schema_server_object_types.Action_])
    ActionsArray: mj_core_schema_server_object_types.Action_[]; // Link to Actions
    
    @Field(() => [mj_core_schema_server_object_types.CommunicationRun_])
    CommunicationRunsArray: mj_core_schema_server_object_types.CommunicationRun_[]; // Link to CommunicationRuns
    
    @Field(() => [mj_core_schema_server_object_types.Template_])
    TemplatesArray: mj_core_schema_server_object_types.Template_[]; // Link to Templates
    
    @Field(() => [mj_core_schema_server_object_types.TemplateCategory_])
    TemplateCategoriesArray: mj_core_schema_server_object_types.TemplateCategory_[]; // Link to TemplateCategories
    
}
        
//****************************************************************************
// INPUT TYPE for Users   
//****************************************************************************
@InputType()
export class CreateUserInput {
    @Field()
    Name: string;

    @Field({ nullable: true })
    FirstName?: string;

    @Field({ nullable: true })
    LastName?: string;

    @Field({ nullable: true })
    Title?: string;

    @Field()
    Email: string;

    @Field()
    Type: string;

    @Field(() => Boolean)
    IsActive: boolean;

    @Field()
    LinkedRecordType: string;

    @Field(() => Int, { nullable: true })
    EmployeeID?: number;

    @Field(() => Int, { nullable: true })
    LinkedEntityID?: number;

    @Field(() => Int, { nullable: true })
    LinkedEntityRecordID?: number;
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
    FirstName?: string;

    @Field({ nullable: true })
    LastName?: string;

    @Field({ nullable: true })
    Title?: string;

    @Field()
    Email: string;

    @Field()
    Type: string;

    @Field(() => Boolean)
    IsActive: boolean;

    @Field()
    LinkedRecordType: string;

    @Field(() => Int, { nullable: true })
    EmployeeID?: number;

    @Field(() => Int, { nullable: true })
    LinkedEntityID?: number;

    @Field(() => Int, { nullable: true })
    LinkedEntityRecordID?: number;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
          
    @FieldResolver(() => [mj_core_schema_server_object_types.DuplicateRun_])
    async DuplicateRunsArray(@Root() user_: User_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Duplicate Runs', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwDuplicateRuns] WHERE [StartedByUserID]=${user_.ID} ` + this.getRowLevelSecurityWhereClause('Duplicate Runs', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Duplicate Runs', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.ActionExecutionLog_])
    async ActionExecutionLogsArray(@Root() user_: User_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Action Execution Logs', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwActionExecutionLogs] WHERE [UserID]=${user_.ID} ` + this.getRowLevelSecurityWhereClause('Action Execution Logs', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Action Execution Logs', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.Action_])
    async ActionsArray(@Root() user_: User_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Actions', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwActions] WHERE [CodeApprovedByUserID]=${user_.ID} ` + this.getRowLevelSecurityWhereClause('Actions', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Actions', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.CommunicationRun_])
    async CommunicationRunsArray(@Root() user_: User_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Communication Runs', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwCommunicationRuns] WHERE [UserID]=${user_.ID} ` + this.getRowLevelSecurityWhereClause('Communication Runs', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Communication Runs', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.Template_])
    async TemplatesArray(@Root() user_: User_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Templates', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwTemplates] WHERE [UserID]=${user_.ID} ` + this.getRowLevelSecurityWhereClause('Templates', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Templates', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.TemplateCategory_])
    async TemplateCategoriesArray(@Root() user_: User_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Template Categories', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwTemplateCategories] WHERE [UserID]=${user_.ID} ` + this.getRowLevelSecurityWhereClause('Template Categories', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Template Categories', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => User_)
    async CreateUser(
        @Arg('input', () => CreateUserInput) input: CreateUserInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.CreateRecord('Users', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => User_)
    async UpdateUser(
        @Arg('input', () => UpdateUserInput) input: UpdateUserInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Users', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => User_)
    async DeleteUser(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Users', key, options, dataSource, userPayload, pubSub);
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
    RelatedEntityClassName?: string;
          
    @Field({nullable: true}) 
    RelatedEntityCodeName?: string;
          
    @Field({nullable: true}) 
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
    EntityKeyField?: string;

    @Field()
    RelatedEntityJoinField: string;

    @Field({ nullable: true })
    JoinView?: string;

    @Field({ nullable: true })
    JoinEntityJoinField?: string;

    @Field({ nullable: true })
    JoinEntityInverseJoinField?: string;

    @Field(() => Boolean)
    DisplayInForm: boolean;

    @Field({ nullable: true })
    DisplayName?: string;
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
    EntityKeyField?: string;

    @Field()
    RelatedEntityJoinField: string;

    @Field({ nullable: true })
    JoinView?: string;

    @Field({ nullable: true })
    JoinEntityJoinField?: string;

    @Field({ nullable: true })
    JoinEntityInverseJoinField?: string;

    @Field(() => Boolean)
    DisplayInForm: boolean;

    @Field({ nullable: true })
    DisplayName?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
        return this.CreateRecord('Entity Relationships', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => EntityRelationship_)
    async UpdateEntityRelationship(
        @Arg('input', () => UpdateEntityRelationshipInput) input: UpdateEntityRelationshipInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Entity Relationships', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => EntityRelationship_)
    async DeleteEntityRelationship(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Entity Relationships', key, options, dataSource, userPayload, pubSub);
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

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
        return this.UpdateRecord('User Record Logs', input, dataSource, userPayload, pubSub);
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
    Description?: string;

    @Field(() => Int, { nullable: true })
    CategoryID?: number;

    @Field(() => Boolean)
    IsShared: boolean;

    @Field(() => Boolean)
    IsDefault: boolean;

    @Field({ nullable: true })
    GridState?: string;

    @Field({ nullable: true })
    FilterState?: string;

    @Field(() => Boolean)
    CustomFilterState: boolean;

    @Field(() => Boolean)
    SmartFilterEnabled: boolean;

    @Field({ nullable: true })
    SmartFilterPrompt?: string;

    @Field({ nullable: true })
    SmartFilterWhereClause?: string;

    @Field({ nullable: true })
    SmartFilterExplanation?: string;

    @Field({ nullable: true })
    WhereClause?: string;

    @Field(() => Boolean)
    CustomWhereClause: boolean;

    @Field({ nullable: true })
    SortState?: string;
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
    Description?: string;

    @Field(() => Int, { nullable: true })
    CategoryID?: number;

    @Field(() => Boolean)
    IsShared: boolean;

    @Field(() => Boolean)
    IsDefault: boolean;

    @Field({ nullable: true })
    GridState?: string;

    @Field({ nullable: true })
    FilterState?: string;

    @Field(() => Boolean)
    CustomFilterState: boolean;

    @Field(() => Boolean)
    SmartFilterEnabled: boolean;

    @Field({ nullable: true })
    SmartFilterPrompt?: string;

    @Field({ nullable: true })
    SmartFilterWhereClause?: string;

    @Field({ nullable: true })
    SmartFilterExplanation?: string;

    @Field({ nullable: true })
    WhereClause?: string;

    @Field(() => Boolean)
    CustomWhereClause: boolean;

    @Field({ nullable: true })
    SortState?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
        return this.CreateRecord('User Views', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => UserView_)
    async UpdateUserView(
        @Arg('input', () => UpdateUserViewInput) input: UpdateUserViewInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('User Views', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => UserView_)
    async DeleteUserView(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('User Views', key, options, dataSource, userPayload, pubSub);
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
    StartedAt?: Date;

    @Field({ nullable: true })
    EndedAt?: Date;

    @Field(() => Int)
    TotalRecords: number;

    @Field({ nullable: true })
    Comments?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
        return this.UpdateRecord('Company Integration Runs', input, dataSource, userPayload, pubSub);
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

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
        return this.UpdateRecord('Company Integration Run Details', input, dataSource, userPayload, pubSub);
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
    CompanyIntegrationRunID?: number;

    @Field(() => Int, { nullable: true })
    CompanyIntegrationRunDetailID?: number;

    @Field({ nullable: true })
    Code?: string;

    @Field({ nullable: true })
    Message?: string;

    @Field({ nullable: true })
    CreatedBy?: string;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    Category?: string;

    @Field({ nullable: true })
    Details?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
        return this.UpdateRecord('Error Logs', input, dataSource, userPayload, pubSub);
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
    
    @Field(() => [mj_core_schema_server_object_types.ApplicationSetting_])
    ApplicationSettingsArray: mj_core_schema_server_object_types.ApplicationSetting_[]; // Link to ApplicationSettings
    
}
        
//****************************************************************************
// INPUT TYPE for Applications   
//****************************************************************************
@InputType()
export class CreateApplicationInput {
    @Field()
    Name: string;

    @Field({ nullable: true })
    Description?: string;
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
    Description?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
          
    @FieldResolver(() => [mj_core_schema_server_object_types.ApplicationSetting_])
    async ApplicationSettingsArray(@Root() application_: Application_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Application Settings', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwApplicationSettings] WHERE [ApplicationID]=${application_.ID} ` + this.getRowLevelSecurityWhereClause('Application Settings', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Application Settings', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => Application_)
    async CreateApplication(
        @Arg('input', () => CreateApplicationInput) input: CreateApplicationInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.CreateRecord('Applications', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => Application_)
    async UpdateApplication(
        @Arg('input', () => UpdateApplicationInput) input: UpdateApplicationInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Applications', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => Application_)
    async DeleteApplication(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Applications', key, options, dataSource, userPayload, pubSub);
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
    EntityCodeName?: string;
          
    @Field({nullable: true}) 
    EntityClassName?: string;
          
    @Field({nullable: true}) 
    EntityBaseTableCodeName?: string;
        
}
        
//****************************************************************************
// INPUT TYPE for Application Entities   
//****************************************************************************
@InputType()
export class CreateApplicationEntityInput {
    @Field({ nullable: true })
    ApplicationName?: string;

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
    ApplicationName?: string;

    @Field(() => Int)
    EntityID: number;

    @Field(() => Int)
    Sequence: number;

    @Field(() => Boolean)
    DefaultForNewUser: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
        return this.CreateRecord('Application Entities', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => ApplicationEntity_)
    async UpdateApplicationEntity(
        @Arg('input', () => UpdateApplicationEntityInput) input: UpdateApplicationEntityInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Application Entities', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => ApplicationEntity_)
    async DeleteApplicationEntity(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Application Entities', key, options, dataSource, userPayload, pubSub);
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
    RoleName?: string;

    @Field(() => Boolean)
    CanCreate: boolean;

    @Field(() => Boolean)
    CanRead: boolean;

    @Field(() => Boolean)
    CanUpdate: boolean;

    @Field(() => Boolean)
    CanDelete: boolean;

    @Field(() => Int, { nullable: true })
    ReadRLSFilterID?: number;

    @Field(() => Int, { nullable: true })
    CreateRLSFilterID?: number;

    @Field(() => Int, { nullable: true })
    UpdateRLSFilterID?: number;

    @Field(() => Int, { nullable: true })
    DeleteRLSFilterID?: number;
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
    RoleName?: string;

    @Field(() => Boolean)
    CanCreate: boolean;

    @Field(() => Boolean)
    CanRead: boolean;

    @Field(() => Boolean)
    CanUpdate: boolean;

    @Field(() => Boolean)
    CanDelete: boolean;

    @Field(() => Int, { nullable: true })
    ReadRLSFilterID?: number;

    @Field(() => Int, { nullable: true })
    CreateRLSFilterID?: number;

    @Field(() => Int, { nullable: true })
    UpdateRLSFilterID?: number;

    @Field(() => Int, { nullable: true })
    DeleteRLSFilterID?: number;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
        return this.CreateRecord('Entity Permissions', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => EntityPermission_)
    async UpdateEntityPermission(
        @Arg('input', () => UpdateEntityPermissionInput) input: UpdateEntityPermissionInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Entity Permissions', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => EntityPermission_)
    async DeleteEntityPermission(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Entity Permissions', key, options, dataSource, userPayload, pubSub);
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

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
        return this.CreateRecord('User Application Entities', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => UserApplicationEntity_)
    async UpdateUserApplicationEntity(
        @Arg('input', () => UpdateUserApplicationEntityInput) input: UpdateUserApplicationEntityInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('User Application Entities', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => UserApplicationEntity_)
    async DeleteUserApplicationEntity(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('User Application Entities', key, options, dataSource, userPayload, pubSub);
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

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
        return this.UpdateRecord('User Applications', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => UserApplication_)
    async DeleteUserApplication(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('User Applications', key, options, dataSource, userPayload, pubSub);
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
    RequestMethod?: string;

    @Field({ nullable: true })
    URL?: string;

    @Field({ nullable: true })
    Parameters?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
        return this.UpdateRecord('Company Integration Run API Logs', input, dataSource, userPayload, pubSub);
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
          
    @Field(() => Int) 
    EntityID: number;
          
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
          
    @Field(() => Int, {nullable: true}) 
    CategoryID?: number;
          
    @Field() 
    @MaxLength(510)
    Entity: string;
          
    @Field() 
    @MaxLength(200)
    User: string;
        
    @Field(() => [mj_core_schema_server_object_types.ListDetail_])
    ListDetailsArray: mj_core_schema_server_object_types.ListDetail_[]; // Link to ListDetails
    
    @Field(() => [mj_core_schema_server_object_types.DuplicateRun_])
    DuplicateRunsArray: mj_core_schema_server_object_types.DuplicateRun_[]; // Link to DuplicateRuns
    
}
        
//****************************************************************************
// INPUT TYPE for Lists   
//****************************************************************************
@InputType()
export class CreateListInput {
    @Field()
    Name: string;

    @Field({ nullable: true })
    Description?: string;

    @Field(() => Int)
    EntityID: number;

    @Field(() => Int)
    UserID: number;

    @Field({ nullable: true })
    ExternalSystemRecordID?: string;

    @Field(() => Int, { nullable: true })
    CompanyIntegrationID?: number;

    @Field(() => Int, { nullable: true })
    CategoryID?: number;
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
    Description?: string;

    @Field(() => Int)
    EntityID: number;

    @Field(() => Int)
    UserID: number;

    @Field({ nullable: true })
    ExternalSystemRecordID?: string;

    @Field(() => Int, { nullable: true })
    CompanyIntegrationID?: number;

    @Field(() => Int, { nullable: true })
    CategoryID?: number;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
          
    @FieldResolver(() => [mj_core_schema_server_object_types.DuplicateRun_])
    async DuplicateRunsArray(@Root() list_: List_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Duplicate Runs', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwDuplicateRuns] WHERE [SourceListID]=${list_.ID} ` + this.getRowLevelSecurityWhereClause('Duplicate Runs', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Duplicate Runs', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => List_)
    async CreateList(
        @Arg('input', () => CreateListInput) input: CreateListInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.CreateRecord('Lists', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => List_)
    async UpdateList(
        @Arg('input', () => UpdateListInput) input: UpdateListInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Lists', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => List_)
    async DeleteList(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Lists', key, options, dataSource, userPayload, pubSub);
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

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
        return this.CreateRecord('List Details', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => ListDetail_)
    async UpdateListDetail(
        @Arg('input', () => UpdateListDetailInput) input: UpdateListDetailInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('List Details', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => ListDetail_)
    async DeleteListDetail(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('List Details', key, options, dataSource, userPayload, pubSub);
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

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
        return this.CreateRecord('User View Runs', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => UserViewRun_)
    async UpdateUserViewRun(
        @Arg('input', () => UpdateUserViewRunInput) input: UpdateUserViewRunInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('User View Runs', input, dataSource, userPayload, pubSub);
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

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
        return this.CreateRecord('User View Run Details', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => UserViewRunDetail_)
    async UpdateUserViewRunDetail(
        @Arg('input', () => UpdateUserViewRunDetailInput) input: UpdateUserViewRunDetailInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('User View Run Details', input, dataSource, userPayload, pubSub);
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
    EndedAt?: Date;

    @Field()
    Status: string;

    @Field({ nullable: true })
    Results?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
        return this.UpdateRecord('Workflow Runs', input, dataSource, userPayload, pubSub);
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
    Description?: string;

    @Field()
    WorkflowEngineName: string;

    @Field()
    CompanyName: string;

    @Field()
    ExternalSystemRecordID: string;

    @Field(() => Boolean)
    AutoRunEnabled: boolean;

    @Field({ nullable: true })
    AutoRunIntervalUnits?: string;

    @Field(() => Int, { nullable: true })
    AutoRunInterval?: number;

    @Field({ nullable: true })
    SubclassName?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
        return this.UpdateRecord('Workflows', input, dataSource, userPayload, pubSub);
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
    Description?: string;

    @Field()
    DriverPath: string;

    @Field()
    DriverClass: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
        return this.UpdateRecord('Workflow Engines', input, dataSource, userPayload, pubSub);
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
    Comments?: string;
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
        return this.CreateRecord('Record Changes', input, dataSource, userPayload, pubSub)
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
        return this.CreateRecord('User Roles', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => UserRole_)
    async DeleteUserRole(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('User Roles', key, options, dataSource, userPayload, pubSub);
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
    AuditLogTypeName?: string;

    @Field(() => Int)
    UserID: number;

    @Field({ nullable: true })
    AuthorizationName?: string;

    @Field()
    Status: string;

    @Field({ nullable: true })
    Description?: string;

    @Field({ nullable: true })
    Details?: string;

    @Field(() => Int, { nullable: true })
    EntityID?: number;

    @Field({ nullable: true })
    RecordID?: string;
}
    
        
//****************************************************************************
// INPUT TYPE for Audit Logs   
//****************************************************************************
@InputType()
export class UpdateAuditLogInput {
    @Field(() => Int)
    ID: number;

    @Field({ nullable: true })
    AuditLogTypeName?: string;

    @Field(() => Int)
    UserID: number;

    @Field({ nullable: true })
    AuthorizationName?: string;

    @Field()
    Status: string;

    @Field({ nullable: true })
    Description?: string;

    @Field({ nullable: true })
    Details?: string;

    @Field(() => Int, { nullable: true })
    EntityID?: number;

    @Field({ nullable: true })
    RecordID?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
        return this.CreateRecord('Audit Logs', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => AuditLog_)
    async UpdateAuditLog(
        @Arg('input', () => UpdateAuditLogInput) input: UpdateAuditLogInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Audit Logs', input, dataSource, userPayload, pubSub);
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
    
    @Field(() => [mj_core_schema_server_object_types.ActionAuthorization_])
    ActionAuthorizationsArray: mj_core_schema_server_object_types.ActionAuthorization_[]; // Link to ActionAuthorizations
    
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
          
    @FieldResolver(() => [mj_core_schema_server_object_types.ActionAuthorization_])
    async ActionAuthorizationsArray(@Root() authorization_: Authorization_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Action Authorizations', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwActionAuthorizations] WHERE [AuthorizationID]=${authorization_.ID} ` + this.getRowLevelSecurityWhereClause('Action Authorizations', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Action Authorizations', await dataSource.query(sSQL));
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
@ObjectType({ description: 'Catalog of all AI Models configured in the system' })
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
    
    @Field(() => [mj_core_schema_server_object_types.EntityDocument_])
    EntityDocumentsArray: mj_core_schema_server_object_types.EntityDocument_[]; // Link to EntityDocuments
    
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
    Vendor?: string;

    @Field(() => Int)
    AIModelTypeID: number;

    @Field(() => Boolean)
    IsActive: boolean;

    @Field({ nullable: true })
    Description?: string;

    @Field({ nullable: true })
    DriverClass?: string;

    @Field({ nullable: true })
    DriverImportPath?: string;

    @Field({ nullable: true })
    APIName?: string;

    @Field(() => Int, { nullable: true })
    PowerRank?: number;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
          
    @FieldResolver(() => [mj_core_schema_server_object_types.EntityDocument_])
    async EntityDocumentsArray(@Root() aimodel_: AIModel_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Entity Documents', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwEntityDocuments] WHERE [AIModelID]=${aimodel_.ID} ` + this.getRowLevelSecurityWhereClause('Entity Documents', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Entity Documents', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => AIModel_)
    async UpdateAIModel(
        @Arg('input', () => UpdateAIModelInput) input: UpdateAIModelInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('AI Models', input, dataSource, userPayload, pubSub);
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
    Description?: string;

    @Field(() => Int, { nullable: true })
    DefaultModelID?: number;

    @Field({ nullable: true })
    DefaultPrompt?: string;

    @Field(() => Boolean)
    IsActive: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
        return this.UpdateRecord('AI Actions', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => AIAction_)
    async DeleteAIAction(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('AI Actions', key, options, dataSource, userPayload, pubSub);
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

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
        return this.UpdateRecord('AI Model Actions', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => AIModelAction_)
    async DeleteAIModelAction(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('AI Model Actions', key, options, dataSource, userPayload, pubSub);
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
    AIModelID?: number;

    @Field()
    Name: string;

    @Field({ nullable: true })
    Prompt?: string;

    @Field()
    TriggerEvent: string;

    @Field()
    UserMessage: string;

    @Field()
    OutputType: string;

    @Field({ nullable: true })
    OutputField?: string;

    @Field(() => Boolean)
    SkipIfOutputFieldNotEmpty: boolean;

    @Field(() => Int, { nullable: true })
    OutputEntityID?: number;

    @Field({ nullable: true })
    Comments?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
        return this.UpdateRecord('Entity AI Actions', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => EntityAIAction_)
    async DeleteEntityAIAction(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Entity AI Actions', key, options, dataSource, userPayload, pubSub);
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
    Description?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
        return this.UpdateRecord('AI Model Types', input, dataSource, userPayload, pubSub);
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
    Description?: string;

    @Field(() => Int)
    QueueTypeID: number;

    @Field(() => Boolean)
    IsActive: boolean;

    @Field(() => Int, { nullable: true })
    ProcessPID?: number;

    @Field({ nullable: true })
    ProcessPlatform?: string;

    @Field({ nullable: true })
    ProcessVersion?: string;

    @Field({ nullable: true })
    ProcessCwd?: string;

    @Field({ nullable: true })
    ProcessIPAddress?: string;

    @Field({ nullable: true })
    ProcessMacAddress?: string;

    @Field({ nullable: true })
    ProcessOSName?: string;

    @Field({ nullable: true })
    ProcessOSVersion?: string;

    @Field({ nullable: true })
    ProcessHostName?: string;

    @Field({ nullable: true })
    ProcessUserID?: string;

    @Field({ nullable: true })
    ProcessUserName?: string;

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
    Description?: string;

    @Field(() => Int)
    QueueTypeID: number;

    @Field(() => Boolean)
    IsActive: boolean;

    @Field(() => Int, { nullable: true })
    ProcessPID?: number;

    @Field({ nullable: true })
    ProcessPlatform?: string;

    @Field({ nullable: true })
    ProcessVersion?: string;

    @Field({ nullable: true })
    ProcessCwd?: string;

    @Field({ nullable: true })
    ProcessIPAddress?: string;

    @Field({ nullable: true })
    ProcessMacAddress?: string;

    @Field({ nullable: true })
    ProcessOSName?: string;

    @Field({ nullable: true })
    ProcessOSVersion?: string;

    @Field({ nullable: true })
    ProcessHostName?: string;

    @Field({ nullable: true })
    ProcessUserID?: string;

    @Field({ nullable: true })
    ProcessUserName?: string;

    @Field()
    LastHeartbeat: Date;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
        return this.CreateRecord('Queues', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => Queue_)
    async UpdateQueue(
        @Arg('input', () => UpdateQueueInput) input: UpdateQueueInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Queues', input, dataSource, userPayload, pubSub);
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
    StartedAt?: Date;

    @Field({ nullable: true })
    EndedAt?: Date;

    @Field({ nullable: true })
    Data?: string;

    @Field({ nullable: true })
    Options?: string;

    @Field({ nullable: true })
    Output?: string;

    @Field({ nullable: true })
    ErrorMessage?: string;

    @Field({ nullable: true })
    Comments?: string;
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
    StartedAt?: Date;

    @Field({ nullable: true })
    EndedAt?: Date;

    @Field({ nullable: true })
    Data?: string;

    @Field({ nullable: true })
    Options?: string;

    @Field({ nullable: true })
    Output?: string;

    @Field({ nullable: true })
    ErrorMessage?: string;

    @Field({ nullable: true })
    Comments?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
        return this.CreateRecord('Queue Tasks', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => QueueTask_)
    async UpdateQueueTask(
        @Arg('input', () => UpdateQueueTaskInput) input: UpdateQueueTaskInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Queue Tasks', input, dataSource, userPayload, pubSub);
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
    Description?: string;

    @Field(() => Int, { nullable: true })
    CategoryID?: number;

    @Field()
    UIConfigDetails: string;

    @Field(() => Int, { nullable: true })
    UserID?: number;
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
    Description?: string;

    @Field(() => Int, { nullable: true })
    CategoryID?: number;

    @Field()
    UIConfigDetails: string;

    @Field(() => Int, { nullable: true })
    UserID?: number;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
        const result = this.MapFieldNamesToCodeNames('Dashboards', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => Dashboard_)
    async CreateDashboard(
        @Arg('input', () => CreateDashboardInput) input: CreateDashboardInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.CreateRecord('Dashboards', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => Dashboard_)
    async UpdateDashboard(
        @Arg('input', () => UpdateDashboardInput) input: UpdateDashboardInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Dashboards', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => Dashboard_)
    async DeleteDashboard(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Dashboards', key, options, dataSource, userPayload, pubSub);
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
    Description?: string;

    @Field(() => Int, { nullable: true })
    CategoryID?: number;

    @Field(() => Int)
    UserID: number;

    @Field()
    SharingScope: string;

    @Field(() => Int, { nullable: true })
    ConversationID?: number;

    @Field(() => Int, { nullable: true })
    ConversationDetailID?: number;

    @Field(() => Int, { nullable: true })
    DataContextID?: number;

    @Field({ nullable: true })
    Configuration?: string;

    @Field(() => Int, { nullable: true })
    OutputTriggerTypeID?: number;

    @Field(() => Int, { nullable: true })
    OutputFormatTypeID?: number;

    @Field(() => Int, { nullable: true })
    OutputDeliveryTypeID?: number;

    @Field(() => Int, { nullable: true })
    OutputEventID?: number;

    @Field({ nullable: true })
    OutputFrequency?: string;

    @Field({ nullable: true })
    OutputTargetEmail?: string;

    @Field(() => Int, { nullable: true })
    OutputWorkflowID?: number;
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
    Description?: string;

    @Field(() => Int, { nullable: true })
    CategoryID?: number;

    @Field(() => Int)
    UserID: number;

    @Field()
    SharingScope: string;

    @Field(() => Int, { nullable: true })
    ConversationID?: number;

    @Field(() => Int, { nullable: true })
    ConversationDetailID?: number;

    @Field(() => Int, { nullable: true })
    DataContextID?: number;

    @Field({ nullable: true })
    Configuration?: string;

    @Field(() => Int, { nullable: true })
    OutputTriggerTypeID?: number;

    @Field(() => Int, { nullable: true })
    OutputFormatTypeID?: number;

    @Field(() => Int, { nullable: true })
    OutputDeliveryTypeID?: number;

    @Field(() => Int, { nullable: true })
    OutputEventID?: number;

    @Field({ nullable: true })
    OutputFrequency?: string;

    @Field({ nullable: true })
    OutputTargetEmail?: string;

    @Field(() => Int, { nullable: true })
    OutputWorkflowID?: number;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
        return this.CreateRecord('Reports', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => Report_)
    async UpdateReport(
        @Arg('input', () => UpdateReportInput) input: UpdateReportInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Reports', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => Report_)
    async DeleteReport(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Reports', key, options, dataSource, userPayload, pubSub);
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
    UserID?: number;
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
    UserID?: number;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
        return this.CreateRecord('Report Snapshots', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => ReportSnapshot_)
    async UpdateReportSnapshot(
        @Arg('input', () => UpdateReportSnapshotInput) input: UpdateReportSnapshotInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Report Snapshots', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => ReportSnapshot_)
    async DeleteReportSnapshot(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Report Snapshots', key, options, dataSource, userPayload, pubSub);
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
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
          
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
    Description?: string;

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
    Description?: string;

    @Field(() => Int)
    UserID: number;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
        return this.CreateRecord('Workspaces', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => Workspace_)
    async UpdateWorkspace(
        @Arg('input', () => UpdateWorkspaceInput) input: UpdateWorkspaceInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Workspaces', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => Workspace_)
    async DeleteWorkspace(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Workspaces', key, options, dataSource, userPayload, pubSub);
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
    @MaxLength(4000)
    ResourceRecordID?: string;
          
    @Field(() => Int) 
    Sequence: number;
          
    @Field({nullable: true}) 
    Configuration?: string;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
          
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
    Description?: string;

    @Field(() => Int)
    WorkSpaceID: number;

    @Field(() => Int)
    ResourceTypeID: number;

    @Field({ nullable: true })
    ResourceRecordID?: string;

    @Field(() => Int)
    Sequence: number;

    @Field({ nullable: true })
    Configuration?: string;
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
    Description?: string;

    @Field(() => Int)
    WorkSpaceID: number;

    @Field(() => Int)
    ResourceTypeID: number;

    @Field({ nullable: true })
    ResourceRecordID?: string;

    @Field(() => Int)
    Sequence: number;

    @Field({ nullable: true })
    Configuration?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
        const result = this.MapFieldNamesToCodeNames('Workspace Items', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => WorkspaceItem_)
    async CreateWorkspaceItem(
        @Arg('input', () => CreateWorkspaceItemInput) input: CreateWorkspaceItemInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.CreateRecord('Workspace Items', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => WorkspaceItem_)
    async UpdateWorkspaceItem(
        @Arg('input', () => UpdateWorkspaceItemInput) input: UpdateWorkspaceItemInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Workspace Items', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => WorkspaceItem_)
    async DeleteWorkspaceItem(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Workspace Items', key, options, dataSource, userPayload, pubSub);
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
    ExternalID?: string;

    @Field()
    Role: string;

    @Field()
    Message: string;

    @Field({ nullable: true })
    Error?: string;

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
    ExternalID?: string;

    @Field()
    Role: string;

    @Field()
    Message: string;

    @Field({ nullable: true })
    Error?: string;

    @Field(() => Boolean)
    HiddenToUser: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
        return this.CreateRecord('Conversation Details', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => ConversationDetail_)
    async UpdateConversationDetail(
        @Arg('input', () => UpdateConversationDetailInput) input: UpdateConversationDetailInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Conversation Details', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => ConversationDetail_)
    async DeleteConversationDetail(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Conversation Details', key, options, dataSource, userPayload, pubSub);
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
          
    @Field({nullable: true}) 
    @MaxLength(1000)
    LinkedRecordID?: string;
          
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
    ExternalID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string;

    @Field()
    Type: string;

    @Field(() => Boolean)
    IsArchived: boolean;

    @Field(() => Int, { nullable: true })
    LinkedEntityID?: number;

    @Field({ nullable: true })
    LinkedRecordID?: string;

    @Field(() => Int, { nullable: true })
    DataContextID?: number;
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
    ExternalID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string;

    @Field()
    Type: string;

    @Field(() => Boolean)
    IsArchived: boolean;

    @Field(() => Int, { nullable: true })
    LinkedEntityID?: number;

    @Field({ nullable: true })
    LinkedRecordID?: string;

    @Field(() => Int, { nullable: true })
    DataContextID?: number;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
        return this.CreateRecord('Conversations', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => Conversation_)
    async UpdateConversation(
        @Arg('input', () => UpdateConversationInput) input: UpdateConversationInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Conversations', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => Conversation_)
    async DeleteConversation(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Conversations', key, options, dataSource, userPayload, pubSub);
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
    Title?: string;

    @Field({ nullable: true })
    Message?: string;

    @Field(() => Int, { nullable: true })
    ResourceTypeID?: number;

    @Field(() => Int, { nullable: true })
    ResourceRecordID?: number;

    @Field({ nullable: true })
    ResourceConfiguration?: string;

    @Field(() => Boolean)
    Unread: boolean;

    @Field({ nullable: true })
    ReadAt?: Date;
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
    Title?: string;

    @Field({ nullable: true })
    Message?: string;

    @Field(() => Int, { nullable: true })
    ResourceTypeID?: number;

    @Field(() => Int, { nullable: true })
    ResourceRecordID?: number;

    @Field({ nullable: true })
    ResourceConfiguration?: string;

    @Field(() => Boolean)
    Unread: boolean;

    @Field({ nullable: true })
    ReadAt?: Date;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
        return this.CreateRecord('User Notifications', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => UserNotification_)
    async UpdateUserNotification(
        @Arg('input', () => UpdateUserNotificationInput) input: UpdateUserNotificationInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('User Notifications', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => UserNotification_)
    async DeleteUserNotification(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('User Notifications', key, options, dataSource, userPayload, pubSub);
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
    Comments?: string;
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
    Comments?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
        return this.CreateRecord('Schema Info', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => SchemaInfo_)
    async UpdateSchemaInfo(
        @Arg('input', () => UpdateSchemaInfoInput) input: UpdateSchemaInfoInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Schema Info', input, dataSource, userPayload, pubSub);
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

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
        return this.CreateRecord('Company Integration Record Maps', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => CompanyIntegrationRecordMap_)
    async UpdateCompanyIntegrationRecordMap(
        @Arg('input', () => UpdateCompanyIntegrationRecordMapInput) input: UpdateCompanyIntegrationRecordMapInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Company Integration Record Maps', input, dataSource, userPayload, pubSub);
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
    
    @Field(() => [mj_core_schema_server_object_types.DuplicateRunDetailMatch_])
    DuplicateRunDetailMatchesArray: mj_core_schema_server_object_types.DuplicateRunDetailMatch_[]; // Link to DuplicateRunDetailMatches
    
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
    ApprovedByUserID?: number;

    @Field()
    ProcessingStatus: string;

    @Field()
    ProcessingStartedAt: Date;

    @Field({ nullable: true })
    ProcessingEndedAt?: Date;

    @Field({ nullable: true })
    ProcessingLog?: string;

    @Field({ nullable: true })
    Comments?: string;
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
    ApprovedByUserID?: number;

    @Field()
    ProcessingStatus: string;

    @Field()
    ProcessingStartedAt: Date;

    @Field({ nullable: true })
    ProcessingEndedAt?: Date;

    @Field({ nullable: true })
    ProcessingLog?: string;

    @Field({ nullable: true })
    Comments?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
          
    @FieldResolver(() => [mj_core_schema_server_object_types.DuplicateRunDetailMatch_])
    async DuplicateRunDetailMatchesArray(@Root() recordmergelog_: RecordMergeLog_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Duplicate Run Detail Matches', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwDuplicateRunDetailMatches] WHERE [RecordMergeLogID]=${recordmergelog_.ID} ` + this.getRowLevelSecurityWhereClause('Duplicate Run Detail Matches', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Duplicate Run Detail Matches', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => RecordMergeLog_)
    async CreateRecordMergeLog(
        @Arg('input', () => CreateRecordMergeLogInput) input: CreateRecordMergeLogInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.CreateRecord('Record Merge Logs', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => RecordMergeLog_)
    async UpdateRecordMergeLog(
        @Arg('input', () => UpdateRecordMergeLogInput) input: UpdateRecordMergeLogInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Record Merge Logs', input, dataSource, userPayload, pubSub);
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
    ProcessingLog?: string;
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
    ProcessingLog?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
        return this.CreateRecord('Record Merge Deletion Logs', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => RecordMergeDeletionLog_)
    async UpdateRecordMergeDeletionLog(
        @Arg('input', () => UpdateRecordMergeDeletionLogInput) input: UpdateRecordMergeDeletionLogInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Record Merge Deletion Logs', input, dataSource, userPayload, pubSub);
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
    Description?: string;

    @Field(() => Int)
    Sequence: number;

    @Field()
    SQLBaseType: string;

    @Field()
    SQLFullType: string;

    @Field(() => Int, { nullable: true })
    SourceEntityID?: number;

    @Field({ nullable: true })
    SourceFieldName?: string;

    @Field(() => Boolean)
    IsComputed: boolean;

    @Field({ nullable: true })
    ComputationDescription?: string;

    @Field(() => Boolean)
    IsSummary: boolean;

    @Field({ nullable: true })
    SummaryDescription?: string;
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
    Description?: string;

    @Field(() => Int)
    Sequence: number;

    @Field()
    SQLBaseType: string;

    @Field()
    SQLFullType: string;

    @Field(() => Int, { nullable: true })
    SourceEntityID?: number;

    @Field({ nullable: true })
    SourceFieldName?: string;

    @Field(() => Boolean)
    IsComputed: boolean;

    @Field({ nullable: true })
    ComputationDescription?: string;

    @Field(() => Boolean)
    IsSummary: boolean;

    @Field({ nullable: true })
    SummaryDescription?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
        return this.CreateRecord('Query Fields', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => QueryField_)
    async UpdateQueryField(
        @Arg('input', () => UpdateQueryFieldInput) input: UpdateQueryFieldInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Query Fields', input, dataSource, userPayload, pubSub);
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
    ParentID?: number;

    @Field({ nullable: true })
    Description?: string;

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
    ParentID?: number;

    @Field({ nullable: true })
    Description?: string;

    @Field(() => Int)
    UserID: number;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
        return this.CreateRecord('Query Categories', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => QueryCategory_)
    async UpdateQueryCategory(
        @Arg('input', () => UpdateQueryCategoryInput) input: UpdateQueryCategoryInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Query Categories', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => QueryCategory_)
    async DeleteQueryCategory(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Query Categories', key, options, dataSource, userPayload, pubSub);
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
    Description?: string;

    @Field(() => Int, { nullable: true })
    CategoryID?: number;

    @Field({ nullable: true })
    SQL?: string;

    @Field({ nullable: true })
    OriginalSQL?: string;

    @Field({ nullable: true })
    Feedback?: string;

    @Field()
    Status: string;

    @Field(() => Int, { nullable: true })
    QualityRank?: number;
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
    Description?: string;

    @Field(() => Int, { nullable: true })
    CategoryID?: number;

    @Field({ nullable: true })
    SQL?: string;

    @Field({ nullable: true })
    OriginalSQL?: string;

    @Field({ nullable: true })
    Feedback?: string;

    @Field()
    Status: string;

    @Field(() => Int, { nullable: true })
    QualityRank?: number;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
        return this.CreateRecord('Queries', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => Query_)
    async UpdateQuery(
        @Arg('input', () => UpdateQueryInput) input: UpdateQueryInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Queries', input, dataSource, userPayload, pubSub);
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

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
        return this.CreateRecord('Query Permissions', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => QueryPermission_)
    async UpdateQueryPermission(
        @Arg('input', () => UpdateQueryPermissionInput) input: UpdateQueryPermissionInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Query Permissions', input, dataSource, userPayload, pubSub);
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
    Description?: string;

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
    Description?: string;

    @Field(() => Int)
    VectorDatabaseID: number;

    @Field(() => Int)
    EmbeddingModelID: number;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
        return this.CreateRecord('Vector Indexes', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => VectorIndex_)
    async UpdateVectorIndex(
        @Arg('input', () => UpdateVectorIndexInput) input: UpdateVectorIndexInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Vector Indexes', input, dataSource, userPayload, pubSub);
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
    Description?: string;
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
    Description?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
        return this.CreateRecord('Entity Document Types', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => EntityDocumentType_)
    async UpdateEntityDocumentType(
        @Arg('input', () => UpdateEntityDocumentTypeInput) input: UpdateEntityDocumentTypeInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Entity Document Types', input, dataSource, userPayload, pubSub);
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
    StartedAt?: Date;

    @Field({ nullable: true })
    EndedAt?: Date;

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
    StartedAt?: Date;

    @Field({ nullable: true })
    EndedAt?: Date;

    @Field()
    Status: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
        return this.CreateRecord('Entity Document Runs', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => EntityDocumentRun_)
    async UpdateEntityDocumentRun(
        @Arg('input', () => UpdateEntityDocumentRunInput) input: UpdateEntityDocumentRunInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Entity Document Runs', input, dataSource, userPayload, pubSub);
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
    Description?: string;

    @Field({ nullable: true })
    DefaultURL?: string;

    @Field({ nullable: true })
    ClassKey?: string;
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
    Description?: string;

    @Field({ nullable: true })
    DefaultURL?: string;

    @Field({ nullable: true })
    ClassKey?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
        return this.CreateRecord('Vector Databases', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => VectorDatabase_)
    async UpdateVectorDatabase(
        @Arg('input', () => UpdateVectorDatabaseInput) input: UpdateVectorDatabaseInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Vector Databases', input, dataSource, userPayload, pubSub);
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
    DocumentText?: string;

    @Field(() => Int)
    VectorIndexID: number;

    @Field({ nullable: true })
    VectorID?: string;

    @Field({ nullable: true })
    VectorJSON?: string;

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
    DocumentText?: string;

    @Field(() => Int)
    VectorIndexID: number;

    @Field({ nullable: true })
    VectorID?: string;

    @Field({ nullable: true })
    VectorJSON?: string;

    @Field()
    EntityRecordUpdatedAt: Date;

    @Field(() => Int)
    EntityDocumentID: number;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
        return this.CreateRecord('Entity Record Documents', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => EntityRecordDocument_)
    async UpdateEntityRecordDocument(
        @Arg('input', () => UpdateEntityRecordDocumentInput) input: UpdateEntityRecordDocumentInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Entity Record Documents', input, dataSource, userPayload, pubSub);
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
          
    @Field(() => Int) 
    VectorDatabaseID: number;
          
    @Field(() => Int) 
    AIModelID: number;
          
    @Field(() => Float, {description: 'Value between 0 and 1 that determines what is considered a potential matching record. Value must be <= AbsoluteMatchThreshold. This is primarily used for duplicate detection but can be used for other applications as well where matching is relevant.'}) 
    PotentialMatchThreshold: number;
          
    @Field(() => Float, {description: 'Value between 0 and 1 that determines what is considered an absolute matching record. Value must be >= PotentialMatchThreshold. This is primarily used for duplicate detection but can be used for other applications as well where matching is relevant.'}) 
    AbsoluteMatchThreshold: number;
          
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
    @MaxLength(200)
    Type: string;
        
    @Field(() => [mj_core_schema_server_object_types.EntityDocumentRun_])
    EntityDocumentRunsArray: mj_core_schema_server_object_types.EntityDocumentRun_[]; // Link to EntityDocumentRuns
    
    @Field(() => [mj_core_schema_server_object_types.EntityDocumentSetting_])
    EntityDocumentSettingsArray: mj_core_schema_server_object_types.EntityDocumentSetting_[]; // Link to EntityDocumentSettings
    
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
    Template?: string;

    @Field(() => Int)
    VectorDatabaseID: number;

    @Field(() => Int)
    AIModelID: number;

    @Field(() => Float)
    PotentialMatchThreshold: number;

    @Field(() => Float)
    AbsoluteMatchThreshold: number;
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
    Template?: string;

    @Field(() => Int)
    VectorDatabaseID: number;

    @Field(() => Int)
    AIModelID: number;

    @Field(() => Float)
    PotentialMatchThreshold: number;

    @Field(() => Float)
    AbsoluteMatchThreshold: number;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
          
    @FieldResolver(() => [mj_core_schema_server_object_types.EntityDocumentSetting_])
    async EntityDocumentSettingsArray(@Root() entitydocument_: EntityDocument_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Entity Document Settings', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwEntityDocumentSettings] WHERE [EntityDocumentID]=${entitydocument_.ID} ` + this.getRowLevelSecurityWhereClause('Entity Document Settings', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Entity Document Settings', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => EntityDocument_)
    async CreateEntityDocument(
        @Arg('input', () => CreateEntityDocumentInput) input: CreateEntityDocumentInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.CreateRecord('Entity Documents', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => EntityDocument_)
    async UpdateEntityDocument(
        @Arg('input', () => UpdateEntityDocumentInput) input: UpdateEntityDocumentInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Entity Documents', input, dataSource, userPayload, pubSub);
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
    ViewID?: number;

    @Field(() => Int, { nullable: true })
    QueryID?: number;

    @Field(() => Int, { nullable: true })
    EntityID?: number;

    @Field({ nullable: true })
    RecordID?: string;

    @Field({ nullable: true })
    SQL?: string;

    @Field({ nullable: true })
    DataJSON?: string;

    @Field({ nullable: true })
    LastRefreshedAt?: Date;
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
    ViewID?: number;

    @Field(() => Int, { nullable: true })
    QueryID?: number;

    @Field(() => Int, { nullable: true })
    EntityID?: number;

    @Field({ nullable: true })
    RecordID?: string;

    @Field({ nullable: true })
    SQL?: string;

    @Field({ nullable: true })
    DataJSON?: string;

    @Field({ nullable: true })
    LastRefreshedAt?: Date;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
        return this.CreateRecord('Data Context Items', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => DataContextItem_)
    async UpdateDataContextItem(
        @Arg('input', () => UpdateDataContextItemInput) input: UpdateDataContextItemInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Data Context Items', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => DataContextItem_)
    async DeleteDataContextItem(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Data Context Items', key, options, dataSource, userPayload, pubSub);
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
    Description?: string;

    @Field({ nullable: true })
    LastRefreshedAt?: Date;
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
    Description?: string;

    @Field({ nullable: true })
    LastRefreshedAt?: Date;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
        return this.CreateRecord('Data Contexts', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => DataContext_)
    async UpdateDataContext(
        @Arg('input', () => UpdateDataContextInput) input: UpdateDataContextInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Data Contexts', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => DataContext_)
    async DeleteDataContext(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Data Contexts', key, options, dataSource, userPayload, pubSub);
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
    Description?: string;

    @Field(() => Int, { nullable: true })
    ParentID?: number;

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
    Description?: string;

    @Field(() => Int, { nullable: true })
    ParentID?: number;

    @Field(() => Int)
    EntityID: number;

    @Field(() => Int)
    UserID: number;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
        return this.CreateRecord('User View Categories', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => UserViewCategory_)
    async UpdateUserViewCategory(
        @Arg('input', () => UpdateUserViewCategoryInput) input: UpdateUserViewCategoryInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('User View Categories', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => UserViewCategory_)
    async DeleteUserViewCategory(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('User View Categories', key, options, dataSource, userPayload, pubSub);
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
    Description?: string;

    @Field(() => Int, { nullable: true })
    ParentID?: number;

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
    Description?: string;

    @Field(() => Int, { nullable: true })
    ParentID?: number;

    @Field(() => Int)
    UserID: number;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
        return this.CreateRecord('Dashboard Categories', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => DashboardCategory_)
    async UpdateDashboardCategory(
        @Arg('input', () => UpdateDashboardCategoryInput) input: UpdateDashboardCategoryInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Dashboard Categories', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => DashboardCategory_)
    async DeleteDashboardCategory(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Dashboard Categories', key, options, dataSource, userPayload, pubSub);
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
    Description?: string;

    @Field(() => Int, { nullable: true })
    ParentID?: number;

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
    Description?: string;

    @Field(() => Int, { nullable: true })
    ParentID?: number;

    @Field(() => Int)
    UserID: number;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
        return this.CreateRecord('Report Categories', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => ReportCategory_)
    async UpdateReportCategory(
        @Arg('input', () => UpdateReportCategoryInput) input: UpdateReportCategoryInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Report Categories', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => ReportCategory_)
    async DeleteReportCategory(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Report Categories', key, options, dataSource, userPayload, pubSub);
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
    Description?: string;

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
    Description?: string;

    @Field()
    ServerDriverKey: string;

    @Field()
    ClientDriverKey: string;

    @Field(() => Int)
    Priority: number;

    @Field(() => Boolean)
    IsActive: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
        return this.CreateRecord('File Storage Providers', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => FileStorageProvider_)
    async UpdateFileStorageProvider(
        @Arg('input', () => UpdateFileStorageProviderInput) input: UpdateFileStorageProviderInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('File Storage Providers', input, dataSource, userPayload, pubSub);
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
    Description?: string;

    @Field(() => Int)
    ProviderID: number;

    @Field({ nullable: true })
    ContentType?: string;

    @Field({ nullable: true })
    ProviderKey?: string;

    @Field(() => Int, { nullable: true })
    CategoryID?: number;

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
    Description?: string;

    @Field(() => Int)
    ProviderID: number;

    @Field({ nullable: true })
    ContentType?: string;

    @Field({ nullable: true })
    ProviderKey?: string;

    @Field(() => Int, { nullable: true })
    CategoryID?: number;

    @Field()
    Status: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
        return this.CreateRecord('Files', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => File_)
    async UpdateFile(
        @Arg('input', () => UpdateFileInput) input: UpdateFileInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Files', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => File_)
    async DeleteFile(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Files', key, options, dataSource, userPayload, pubSub);
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
    Description?: string;

    @Field(() => Int, { nullable: true })
    ParentID?: number;
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
    Description?: string;

    @Field(() => Int, { nullable: true })
    ParentID?: number;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
        return this.CreateRecord('File Categories', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => FileCategory_)
    async UpdateFileCategory(
        @Arg('input', () => UpdateFileCategoryInput) input: UpdateFileCategoryInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('File Categories', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => FileCategory_)
    async DeleteFileCategory(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('File Categories', key, options, dataSource, userPayload, pubSub);
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

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
        return this.CreateRecord('File Entity Record Links', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => FileEntityRecordLink_)
    async UpdateFileEntityRecordLink(
        @Arg('input', () => UpdateFileEntityRecordLinkInput) input: UpdateFileEntityRecordLinkInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('File Entity Record Links', input, dataSource, userPayload, pubSub);
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
    Type?: string;

    @Field()
    InstalledAt: Date;

    @Field()
    Status: string;

    @Field({ nullable: true })
    InstallLog?: string;

    @Field({ nullable: true })
    Comments?: string;
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
    Type?: string;

    @Field()
    InstalledAt: Date;

    @Field()
    Status: string;

    @Field({ nullable: true })
    InstallLog?: string;

    @Field({ nullable: true })
    Comments?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
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
        return this.CreateRecord('Version Installations', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => VersionInstallation_)
    async UpdateVersionInstallation(
        @Arg('input', () => UpdateVersionInstallationInput) input: UpdateVersionInstallationInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Version Installations', input, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Duplicate Run Detail Matches
//****************************************************************************
@ObjectType()
export class DuplicateRunDetailMatch_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field(() => Int) 
    DuplicateRunDetailID: number;
          
    @Field({description: 'Either Vector or SP'}) 
    @MaxLength(40)
    MatchSource: string;
          
    @Field() 
    @MaxLength(1000)
    MatchRecordID: string;
          
    @Field(() => Float, {description: 'Value between 0 and 1 designating the computed probability of a match'}) 
    MatchProbability: number;
          
    @Field() 
    @MaxLength(8)
    MatchedAt: Date;
          
    @Field() 
    @MaxLength(40)
    Action: string;
          
    @Field() 
    @MaxLength(40)
    ApprovalStatus: string;
          
    @Field() 
    @MaxLength(40)
    MergeStatus: string;
          
    @Field() 
    @MaxLength(8)
    MergedAt: Date;
          
    @Field(() => Int, {nullable: true}) 
    RecordMergeLogID?: number;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
        
}
        
//****************************************************************************
// INPUT TYPE for Duplicate Run Detail Matches   
//****************************************************************************
@InputType()
export class CreateDuplicateRunDetailMatchInput {
    @Field(() => Int)
    DuplicateRunDetailID: number;

    @Field()
    MatchSource: string;

    @Field()
    MatchRecordID: string;

    @Field(() => Float)
    MatchProbability: number;

    @Field()
    MatchedAt: Date;

    @Field()
    Action: string;

    @Field()
    ApprovalStatus: string;

    @Field()
    MergeStatus: string;

    @Field()
    MergedAt: Date;

    @Field(() => Int, { nullable: true })
    RecordMergeLogID?: number;
}
    
        
//****************************************************************************
// INPUT TYPE for Duplicate Run Detail Matches   
//****************************************************************************
@InputType()
export class UpdateDuplicateRunDetailMatchInput {
    @Field(() => Int)
    ID: number;

    @Field(() => Int)
    DuplicateRunDetailID: number;

    @Field()
    MatchSource: string;

    @Field()
    MatchRecordID: string;

    @Field(() => Float)
    MatchProbability: number;

    @Field()
    MatchedAt: Date;

    @Field()
    Action: string;

    @Field()
    ApprovalStatus: string;

    @Field()
    MergeStatus: string;

    @Field()
    MergedAt: Date;

    @Field(() => Int, { nullable: true })
    RecordMergeLogID?: number;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Duplicate Run Detail Matches
//****************************************************************************
@ObjectType()
export class RunDuplicateRunDetailMatchViewResult {
    @Field(() => [DuplicateRunDetailMatch_])
    Results: DuplicateRunDetailMatch_[];

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

@Resolver(DuplicateRunDetailMatch_)
export class DuplicateRunDetailMatchResolver extends ResolverBase {
    @Query(() => RunDuplicateRunDetailMatchViewResult)
    async RunDuplicateRunDetailMatchViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunDuplicateRunDetailMatchViewResult)
    async RunDuplicateRunDetailMatchViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunDuplicateRunDetailMatchViewResult)
    async RunDuplicateRunDetailMatchDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Duplicate Run Detail Matches';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => DuplicateRunDetailMatch_, { nullable: true })
    async DuplicateRunDetailMatch(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<DuplicateRunDetailMatch_ | null> {
        this.CheckUserReadPermissions('Duplicate Run Detail Matches', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwDuplicateRunDetailMatches] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Duplicate Run Detail Matches', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Duplicate Run Detail Matches', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => DuplicateRunDetailMatch_)
    async CreateDuplicateRunDetailMatch(
        @Arg('input', () => CreateDuplicateRunDetailMatchInput) input: CreateDuplicateRunDetailMatchInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.CreateRecord('Duplicate Run Detail Matches', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => DuplicateRunDetailMatch_)
    async UpdateDuplicateRunDetailMatch(
        @Arg('input', () => UpdateDuplicateRunDetailMatchInput) input: UpdateDuplicateRunDetailMatchInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Duplicate Run Detail Matches', input, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Entity Document Settings
//****************************************************************************
@ObjectType()
export class EntityDocumentSetting_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field(() => Int) 
    EntityDocumentID: number;
          
    @Field() 
    @MaxLength(200)
    Name: string;
          
    @Field() 
    Value: string;
          
    @Field({nullable: true}) 
    Comments?: string;
          
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
// INPUT TYPE for Entity Document Settings   
//****************************************************************************
@InputType()
export class CreateEntityDocumentSettingInput {
    @Field(() => Int)
    EntityDocumentID: number;

    @Field()
    Name: string;

    @Field()
    Value: string;

    @Field({ nullable: true })
    Comments?: string;
}
    
        
//****************************************************************************
// INPUT TYPE for Entity Document Settings   
//****************************************************************************
@InputType()
export class UpdateEntityDocumentSettingInput {
    @Field(() => Int)
    ID: number;

    @Field(() => Int)
    EntityDocumentID: number;

    @Field()
    Name: string;

    @Field()
    Value: string;

    @Field({ nullable: true })
    Comments?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Entity Document Settings
//****************************************************************************
@ObjectType()
export class RunEntityDocumentSettingViewResult {
    @Field(() => [EntityDocumentSetting_])
    Results: EntityDocumentSetting_[];

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

@Resolver(EntityDocumentSetting_)
export class EntityDocumentSettingResolver extends ResolverBase {
    @Query(() => RunEntityDocumentSettingViewResult)
    async RunEntityDocumentSettingViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunEntityDocumentSettingViewResult)
    async RunEntityDocumentSettingViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunEntityDocumentSettingViewResult)
    async RunEntityDocumentSettingDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Entity Document Settings';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => EntityDocumentSetting_, { nullable: true })
    async EntityDocumentSetting(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<EntityDocumentSetting_ | null> {
        this.CheckUserReadPermissions('Entity Document Settings', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwEntityDocumentSettings] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Entity Document Settings', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Entity Document Settings', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => EntityDocumentSetting_)
    async CreateEntityDocumentSetting(
        @Arg('input', () => CreateEntityDocumentSettingInput) input: CreateEntityDocumentSettingInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.CreateRecord('Entity Document Settings', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => EntityDocumentSetting_)
    async UpdateEntityDocumentSetting(
        @Arg('input', () => UpdateEntityDocumentSettingInput) input: UpdateEntityDocumentSettingInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Entity Document Settings', input, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Entity Settings
//****************************************************************************
@ObjectType()
export class EntitySetting_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field(() => Int) 
    EntityID: number;
          
    @Field() 
    @MaxLength(200)
    Name: string;
          
    @Field() 
    Value: string;
          
    @Field({nullable: true}) 
    Comments?: string;
          
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
// INPUT TYPE for Entity Settings   
//****************************************************************************
@InputType()
export class CreateEntitySettingInput {
    @Field(() => Int)
    EntityID: number;

    @Field()
    Name: string;

    @Field()
    Value: string;

    @Field({ nullable: true })
    Comments?: string;
}
    
        
//****************************************************************************
// INPUT TYPE for Entity Settings   
//****************************************************************************
@InputType()
export class UpdateEntitySettingInput {
    @Field(() => Int)
    ID: number;

    @Field(() => Int)
    EntityID: number;

    @Field()
    Name: string;

    @Field()
    Value: string;

    @Field({ nullable: true })
    Comments?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Entity Settings
//****************************************************************************
@ObjectType()
export class RunEntitySettingViewResult {
    @Field(() => [EntitySetting_])
    Results: EntitySetting_[];

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

@Resolver(EntitySetting_)
export class EntitySettingResolver extends ResolverBase {
    @Query(() => RunEntitySettingViewResult)
    async RunEntitySettingViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunEntitySettingViewResult)
    async RunEntitySettingViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunEntitySettingViewResult)
    async RunEntitySettingDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Entity Settings';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => EntitySetting_, { nullable: true })
    async EntitySetting(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<EntitySetting_ | null> {
        this.CheckUserReadPermissions('Entity Settings', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwEntitySettings] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Entity Settings', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Entity Settings', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => EntitySetting_)
    async CreateEntitySetting(
        @Arg('input', () => CreateEntitySettingInput) input: CreateEntitySettingInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.CreateRecord('Entity Settings', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => EntitySetting_)
    async UpdateEntitySetting(
        @Arg('input', () => UpdateEntitySettingInput) input: UpdateEntitySettingInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Entity Settings', input, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Duplicate Runs
//****************************************************************************
@ObjectType()
export class DuplicateRun_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field(() => Int) 
    EntityID: number;
          
    @Field(() => Int) 
    StartedByUserID: number;
          
    @Field() 
    @MaxLength(8)
    StartedAt: Date;
          
    @Field({nullable: true}) 
    @MaxLength(8)
    EndedAt?: Date;
          
    @Field() 
    @MaxLength(40)
    ApprovalStatus: string;
          
    @Field({nullable: true}) 
    ApprovalComments?: string;
          
    @Field(() => Int, {nullable: true}) 
    ApprovedByUserID?: number;
          
    @Field() 
    @MaxLength(40)
    ProcessingStatus: string;
          
    @Field({nullable: true}) 
    ProcessingErrorMessage?: string;
          
    @Field(() => Int) 
    SourceListID: number;
          
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
    @MaxLength(200)
    StartedByUser: string;
          
    @Field({nullable: true}) 
    @MaxLength(200)
    ApprovedByUser?: string;
          
    @Field() 
    @MaxLength(200)
    SourceList: string;
        
    @Field(() => [mj_core_schema_server_object_types.DuplicateRunDetail_])
    DuplicateRunDetailsArray: mj_core_schema_server_object_types.DuplicateRunDetail_[]; // Link to DuplicateRunDetails
    
}
        
//****************************************************************************
// INPUT TYPE for Duplicate Runs   
//****************************************************************************
@InputType()
export class CreateDuplicateRunInput {
    @Field(() => Int)
    EntityID: number;

    @Field(() => Int)
    StartedByUserID: number;

    @Field()
    StartedAt: Date;

    @Field({ nullable: true })
    EndedAt?: Date;

    @Field()
    ApprovalStatus: string;

    @Field({ nullable: true })
    ApprovalComments?: string;

    @Field(() => Int, { nullable: true })
    ApprovedByUserID?: number;

    @Field()
    ProcessingStatus: string;

    @Field({ nullable: true })
    ProcessingErrorMessage?: string;

    @Field(() => Int)
    SourceListID: number;
}
    
        
//****************************************************************************
// INPUT TYPE for Duplicate Runs   
//****************************************************************************
@InputType()
export class UpdateDuplicateRunInput {
    @Field(() => Int)
    ID: number;

    @Field(() => Int)
    EntityID: number;

    @Field(() => Int)
    StartedByUserID: number;

    @Field()
    StartedAt: Date;

    @Field({ nullable: true })
    EndedAt?: Date;

    @Field()
    ApprovalStatus: string;

    @Field({ nullable: true })
    ApprovalComments?: string;

    @Field(() => Int, { nullable: true })
    ApprovedByUserID?: number;

    @Field()
    ProcessingStatus: string;

    @Field({ nullable: true })
    ProcessingErrorMessage?: string;

    @Field(() => Int)
    SourceListID: number;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Duplicate Runs
//****************************************************************************
@ObjectType()
export class RunDuplicateRunViewResult {
    @Field(() => [DuplicateRun_])
    Results: DuplicateRun_[];

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

@Resolver(DuplicateRun_)
export class DuplicateRunResolver extends ResolverBase {
    @Query(() => RunDuplicateRunViewResult)
    async RunDuplicateRunViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunDuplicateRunViewResult)
    async RunDuplicateRunViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunDuplicateRunViewResult)
    async RunDuplicateRunDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Duplicate Runs';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => DuplicateRun_, { nullable: true })
    async DuplicateRun(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<DuplicateRun_ | null> {
        this.CheckUserReadPermissions('Duplicate Runs', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwDuplicateRuns] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Duplicate Runs', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Duplicate Runs', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
      
    @FieldResolver(() => [mj_core_schema_server_object_types.DuplicateRunDetail_])
    async DuplicateRunDetailsArray(@Root() duplicaterun_: DuplicateRun_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Duplicate Run Details', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwDuplicateRunDetails] WHERE [DuplicateRunID]=${duplicaterun_.ID} ` + this.getRowLevelSecurityWhereClause('Duplicate Run Details', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Duplicate Run Details', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => DuplicateRun_)
    async CreateDuplicateRun(
        @Arg('input', () => CreateDuplicateRunInput) input: CreateDuplicateRunInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.CreateRecord('Duplicate Runs', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => DuplicateRun_)
    async UpdateDuplicateRun(
        @Arg('input', () => UpdateDuplicateRunInput) input: UpdateDuplicateRunInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Duplicate Runs', input, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Duplicate Run Details
//****************************************************************************
@ObjectType()
export class DuplicateRunDetail_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field(() => Int) 
    DuplicateRunID: number;
          
    @Field() 
    @MaxLength(1000)
    RecordID: string;
          
    @Field() 
    @MaxLength(40)
    MatchStatus: string;
          
    @Field({nullable: true, description: 'If MatchStatus=Skipped, this field can be used to store the reason why the record was skipped'}) 
    SkippedReason?: string;
          
    @Field({nullable: true, description: 'If MatchStatus=\'Error\' this field can be used to track the error from that phase of the process for logging/diagnostics.'}) 
    MatchErrorMessage?: string;
          
    @Field() 
    @MaxLength(40)
    MergeStatus: string;
          
    @Field({nullable: true}) 
    MergeErrorMessage?: string;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
        
    @Field(() => [mj_core_schema_server_object_types.DuplicateRunDetailMatch_])
    DuplicateRunDetailMatchesArray: mj_core_schema_server_object_types.DuplicateRunDetailMatch_[]; // Link to DuplicateRunDetailMatches
    
}
        
//****************************************************************************
// INPUT TYPE for Duplicate Run Details   
//****************************************************************************
@InputType()
export class CreateDuplicateRunDetailInput {
    @Field(() => Int)
    DuplicateRunID: number;

    @Field()
    RecordID: string;

    @Field()
    MatchStatus: string;

    @Field({ nullable: true })
    SkippedReason?: string;

    @Field({ nullable: true })
    MatchErrorMessage?: string;

    @Field()
    MergeStatus: string;

    @Field({ nullable: true })
    MergeErrorMessage?: string;
}
    
        
//****************************************************************************
// INPUT TYPE for Duplicate Run Details   
//****************************************************************************
@InputType()
export class UpdateDuplicateRunDetailInput {
    @Field(() => Int)
    ID: number;

    @Field(() => Int)
    DuplicateRunID: number;

    @Field()
    RecordID: string;

    @Field()
    MatchStatus: string;

    @Field({ nullable: true })
    SkippedReason?: string;

    @Field({ nullable: true })
    MatchErrorMessage?: string;

    @Field()
    MergeStatus: string;

    @Field({ nullable: true })
    MergeErrorMessage?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Duplicate Run Details
//****************************************************************************
@ObjectType()
export class RunDuplicateRunDetailViewResult {
    @Field(() => [DuplicateRunDetail_])
    Results: DuplicateRunDetail_[];

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

@Resolver(DuplicateRunDetail_)
export class DuplicateRunDetailResolver extends ResolverBase {
    @Query(() => RunDuplicateRunDetailViewResult)
    async RunDuplicateRunDetailViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunDuplicateRunDetailViewResult)
    async RunDuplicateRunDetailViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunDuplicateRunDetailViewResult)
    async RunDuplicateRunDetailDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Duplicate Run Details';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => DuplicateRunDetail_, { nullable: true })
    async DuplicateRunDetail(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<DuplicateRunDetail_ | null> {
        this.CheckUserReadPermissions('Duplicate Run Details', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwDuplicateRunDetails] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Duplicate Run Details', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Duplicate Run Details', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
      
    @FieldResolver(() => [mj_core_schema_server_object_types.DuplicateRunDetailMatch_])
    async DuplicateRunDetailMatchesArray(@Root() duplicaterundetail_: DuplicateRunDetail_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Duplicate Run Detail Matches', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwDuplicateRunDetailMatches] WHERE [DuplicateRunDetailID]=${duplicaterundetail_.ID} ` + this.getRowLevelSecurityWhereClause('Duplicate Run Detail Matches', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Duplicate Run Detail Matches', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => DuplicateRunDetail_)
    async CreateDuplicateRunDetail(
        @Arg('input', () => CreateDuplicateRunDetailInput) input: CreateDuplicateRunDetailInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.CreateRecord('Duplicate Run Details', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => DuplicateRunDetail_)
    async UpdateDuplicateRunDetail(
        @Arg('input', () => UpdateDuplicateRunDetailInput) input: UpdateDuplicateRunDetailInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Duplicate Run Details', input, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Entity Behaviors
//****************************************************************************
@ObjectType({ description: 'Stores the behaviors for each entity and is used for code generation and injection of behavior code into various areas of the system.' })
export class EntityBehavior_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field(() => Int) 
    EntityID: number;
          
    @Field(() => Int) 
    BehaviorTypeID: number;
          
    @Field({description: 'This field will be used by the AI system to generate code that corresponds to the requested behavior and inject the code into the appropriate part(s) of the system.'}) 
    Description: string;
          
    @Field(() => Boolean, {description: 'This bit field is automatically turned on whenever the Description field is changed so that a future server process will pick it up and regenerate the code. This might happen asynchronously or synchronously depending on system setup.'}) 
    RegenerateCode: boolean;
          
    @Field({nullable: true, description: 'This is the code that implements the desired behavior. If the CodeGenerated bit is set to 1, each time CodeGen runs, it will use the Code specified here in the appropriate place(s). To override the generated code and prevent it from being changed in the future, set CodeGenerated = 0'}) 
    Code?: string;
          
    @Field({nullable: true, description: 'When an AI model generates code this will be populated with the AI\'s explanation of how the code works to meet the requirements of the behavior. For a non-generated piece of code a developer could manually place an explanation in this field.'}) 
    CodeExplanation?: string;
          
    @Field(() => Boolean) 
    CodeGenerated: boolean;
          
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
// INPUT TYPE for Entity Behaviors   
//****************************************************************************
@InputType()
export class CreateEntityBehaviorInput {
    @Field(() => Int)
    EntityID: number;

    @Field(() => Int)
    BehaviorTypeID: number;

    @Field()
    Description: string;

    @Field(() => Boolean)
    RegenerateCode: boolean;

    @Field({ nullable: true })
    Code?: string;

    @Field({ nullable: true })
    CodeExplanation?: string;

    @Field(() => Boolean)
    CodeGenerated: boolean;
}
    
        
//****************************************************************************
// INPUT TYPE for Entity Behaviors   
//****************************************************************************
@InputType()
export class UpdateEntityBehaviorInput {
    @Field(() => Int)
    ID: number;

    @Field(() => Int)
    EntityID: number;

    @Field(() => Int)
    BehaviorTypeID: number;

    @Field()
    Description: string;

    @Field(() => Boolean)
    RegenerateCode: boolean;

    @Field({ nullable: true })
    Code?: string;

    @Field({ nullable: true })
    CodeExplanation?: string;

    @Field(() => Boolean)
    CodeGenerated: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Entity Behaviors
//****************************************************************************
@ObjectType()
export class RunEntityBehaviorViewResult {
    @Field(() => [EntityBehavior_])
    Results: EntityBehavior_[];

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

@Resolver(EntityBehavior_)
export class EntityBehaviorResolver extends ResolverBase {
    @Query(() => RunEntityBehaviorViewResult)
    async RunEntityBehaviorViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunEntityBehaviorViewResult)
    async RunEntityBehaviorViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunEntityBehaviorViewResult)
    async RunEntityBehaviorDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Entity Behaviors';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => EntityBehavior_, { nullable: true })
    async EntityBehavior(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<EntityBehavior_ | null> {
        this.CheckUserReadPermissions('Entity Behaviors', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwEntityBehaviors] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Entity Behaviors', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Entity Behaviors', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => EntityBehavior_)
    async CreateEntityBehavior(
        @Arg('input', () => CreateEntityBehaviorInput) input: CreateEntityBehaviorInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.CreateRecord('Entity Behaviors', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => EntityBehavior_)
    async UpdateEntityBehavior(
        @Arg('input', () => UpdateEntityBehaviorInput) input: UpdateEntityBehaviorInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Entity Behaviors', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => EntityBehavior_)
    async DeleteEntityBehavior(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Entity Behaviors', key, options, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Entity Behavior Types
//****************************************************************************
@ObjectType({ description: 'This table stores the list of possible behavior types to use in the Entity Behavior Types entity. ' })
export class EntityBehaviorType_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field({description: 'The name of the behavior, a unique column for the table. '}) 
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
        
    @Field(() => [mj_core_schema_server_object_types.EntityBehavior_])
    EntityBehaviorsArray: mj_core_schema_server_object_types.EntityBehavior_[]; // Link to EntityBehaviors
    
}
        
//****************************************************************************
// INPUT TYPE for Entity Behavior Types   
//****************************************************************************
@InputType()
export class CreateEntityBehaviorTypeInput {
    @Field()
    Name: string;

    @Field({ nullable: true })
    Description?: string;
}
    
        
//****************************************************************************
// INPUT TYPE for Entity Behavior Types   
//****************************************************************************
@InputType()
export class UpdateEntityBehaviorTypeInput {
    @Field(() => Int)
    ID: number;

    @Field()
    Name: string;

    @Field({ nullable: true })
    Description?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Entity Behavior Types
//****************************************************************************
@ObjectType()
export class RunEntityBehaviorTypeViewResult {
    @Field(() => [EntityBehaviorType_])
    Results: EntityBehaviorType_[];

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

@Resolver(EntityBehaviorType_)
export class EntityBehaviorTypeResolver extends ResolverBase {
    @Query(() => RunEntityBehaviorTypeViewResult)
    async RunEntityBehaviorTypeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunEntityBehaviorTypeViewResult)
    async RunEntityBehaviorTypeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunEntityBehaviorTypeViewResult)
    async RunEntityBehaviorTypeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Entity Behavior Types';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => EntityBehaviorType_, { nullable: true })
    async EntityBehaviorType(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<EntityBehaviorType_ | null> {
        this.CheckUserReadPermissions('Entity Behavior Types', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwEntityBehaviorTypes] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Entity Behavior Types', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Entity Behavior Types', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
      
    @FieldResolver(() => [mj_core_schema_server_object_types.EntityBehavior_])
    async EntityBehaviorsArray(@Root() entitybehaviortype_: EntityBehaviorType_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Entity Behaviors', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwEntityBehaviors] WHERE [BehaviorTypeID]=${entitybehaviortype_.ID} ` + this.getRowLevelSecurityWhereClause('Entity Behaviors', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Entity Behaviors', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => EntityBehaviorType_)
    async CreateEntityBehaviorType(
        @Arg('input', () => CreateEntityBehaviorTypeInput) input: CreateEntityBehaviorTypeInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.CreateRecord('Entity Behavior Types', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => EntityBehaviorType_)
    async UpdateEntityBehaviorType(
        @Arg('input', () => UpdateEntityBehaviorTypeInput) input: UpdateEntityBehaviorTypeInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Entity Behavior Types', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => EntityBehaviorType_)
    async DeleteEntityBehaviorType(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Entity Behavior Types', key, options, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Application Settings
//****************************************************************************
@ObjectType()
export class ApplicationSetting_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field() 
    @MaxLength(100)
    ApplicationName: string;
          
    @Field() 
    @MaxLength(200)
    Name: string;
          
    @Field() 
    Value: string;
          
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
// INPUT TYPE for Application Settings   
//****************************************************************************
@InputType()
export class CreateApplicationSettingInput {
    @Field()
    ApplicationName: string;

    @Field()
    Name: string;

    @Field()
    Value: string;

    @Field({ nullable: true })
    Comments?: string;
}
    
        
//****************************************************************************
// INPUT TYPE for Application Settings   
//****************************************************************************
@InputType()
export class UpdateApplicationSettingInput {
    @Field(() => Int)
    ID: number;

    @Field()
    ApplicationName: string;

    @Field()
    Name: string;

    @Field()
    Value: string;

    @Field({ nullable: true })
    Comments?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Application Settings
//****************************************************************************
@ObjectType()
export class RunApplicationSettingViewResult {
    @Field(() => [ApplicationSetting_])
    Results: ApplicationSetting_[];

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

@Resolver(ApplicationSetting_)
export class ApplicationSettingResolver extends ResolverBase {
    @Query(() => RunApplicationSettingViewResult)
    async RunApplicationSettingViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunApplicationSettingViewResult)
    async RunApplicationSettingViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunApplicationSettingViewResult)
    async RunApplicationSettingDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Application Settings';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => ApplicationSetting_, { nullable: true })
    async ApplicationSetting(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<ApplicationSetting_ | null> {
        this.CheckUserReadPermissions('Application Settings', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwApplicationSettings] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Application Settings', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Application Settings', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => ApplicationSetting_)
    async CreateApplicationSetting(
        @Arg('input', () => CreateApplicationSettingInput) input: CreateApplicationSettingInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.CreateRecord('Application Settings', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => ApplicationSetting_)
    async UpdateApplicationSetting(
        @Arg('input', () => UpdateApplicationSettingInput) input: UpdateApplicationSettingInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Application Settings', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => ApplicationSetting_)
    async DeleteApplicationSetting(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Application Settings', key, options, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Action Categories
//****************************************************************************
@ObjectType({ description: 'Organizes actions into categories, including name, description, and optional parent category for hierarchy.' })
export class ActionCategory_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field({description: 'Name of the action category.'}) 
    @MaxLength(510)
    Name: string;
          
    @Field({nullable: true, description: 'Description of the action category.'}) 
    Description?: string;
          
    @Field(() => Int, {nullable: true, description: 'Parent category ID for hierarchical organization.'}) 
    ParentID?: number;
          
    @Field({description: 'Status of the action category (Pending, Active, Disabled).'}) 
    @MaxLength(40)
    Status: string;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
          
    @Field({nullable: true}) 
    @MaxLength(510)
    Parent?: string;
        
    @Field(() => [mj_core_schema_server_object_types.ActionCategory_])
    ActionCategoriesArray: mj_core_schema_server_object_types.ActionCategory_[]; // Link to ActionCategories
    
    @Field(() => [mj_core_schema_server_object_types.Action_])
    ActionsArray: mj_core_schema_server_object_types.Action_[]; // Link to Actions
    
}
        
//****************************************************************************
// INPUT TYPE for Action Categories   
//****************************************************************************
@InputType()
export class CreateActionCategoryInput {
    @Field()
    Name: string;

    @Field({ nullable: true })
    Description?: string;

    @Field(() => Int, { nullable: true })
    ParentID?: number;

    @Field()
    Status: string;
}
    
        
//****************************************************************************
// INPUT TYPE for Action Categories   
//****************************************************************************
@InputType()
export class UpdateActionCategoryInput {
    @Field(() => Int)
    ID: number;

    @Field()
    Name: string;

    @Field({ nullable: true })
    Description?: string;

    @Field(() => Int, { nullable: true })
    ParentID?: number;

    @Field()
    Status: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Action Categories
//****************************************************************************
@ObjectType()
export class RunActionCategoryViewResult {
    @Field(() => [ActionCategory_])
    Results: ActionCategory_[];

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

@Resolver(ActionCategory_)
export class ActionCategoryResolver extends ResolverBase {
    @Query(() => RunActionCategoryViewResult)
    async RunActionCategoryViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunActionCategoryViewResult)
    async RunActionCategoryViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunActionCategoryViewResult)
    async RunActionCategoryDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Action Categories';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => ActionCategory_, { nullable: true })
    async ActionCategory(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<ActionCategory_ | null> {
        this.CheckUserReadPermissions('Action Categories', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwActionCategories] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Action Categories', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Action Categories', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
      
    @FieldResolver(() => [mj_core_schema_server_object_types.ActionCategory_])
    async ActionCategoriesArray(@Root() actioncategory_: ActionCategory_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Action Categories', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwActionCategories] WHERE [ParentID]=${actioncategory_.ID} ` + this.getRowLevelSecurityWhereClause('Action Categories', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Action Categories', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.Action_])
    async ActionsArray(@Root() actioncategory_: ActionCategory_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Actions', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwActions] WHERE [CategoryID]=${actioncategory_.ID} ` + this.getRowLevelSecurityWhereClause('Actions', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Actions', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => ActionCategory_)
    async CreateActionCategory(
        @Arg('input', () => CreateActionCategoryInput) input: CreateActionCategoryInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.CreateRecord('Action Categories', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => ActionCategory_)
    async UpdateActionCategory(
        @Arg('input', () => UpdateActionCategoryInput) input: UpdateActionCategoryInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Action Categories', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => ActionCategory_)
    async DeleteActionCategory(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Action Categories', key, options, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Entity Actions
//****************************************************************************
@ObjectType({ description: 'Links entities to actions - this is the main place where you define the actions that part of, or available, for a given entity.' })
export class EntityAction_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field(() => Int) 
    EntityID: number;
          
    @Field(() => Int) 
    ActionID: number;
          
    @Field({description: 'Status of the entity action (Pending, Active, Disabled).'}) 
    @MaxLength(40)
    Status: string;
          
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
    @MaxLength(850)
    Action: string;
        
    @Field(() => [mj_core_schema_server_object_types.EntityActionInvocation_])
    EntityActionInvocationsArray: mj_core_schema_server_object_types.EntityActionInvocation_[]; // Link to EntityActionInvocations
    
    @Field(() => [mj_core_schema_server_object_types.EntityActionFilter_])
    EntityActionFiltersArray: mj_core_schema_server_object_types.EntityActionFilter_[]; // Link to EntityActionFilters
    
}
        
//****************************************************************************
// INPUT TYPE for Entity Actions   
//****************************************************************************
@InputType()
export class CreateEntityActionInput {
    @Field(() => Int)
    EntityID: number;

    @Field(() => Int)
    ActionID: number;

    @Field()
    Status: string;
}
    
        
//****************************************************************************
// INPUT TYPE for Entity Actions   
//****************************************************************************
@InputType()
export class UpdateEntityActionInput {
    @Field(() => Int)
    ID: number;

    @Field(() => Int)
    EntityID: number;

    @Field(() => Int)
    ActionID: number;

    @Field()
    Status: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Entity Actions
//****************************************************************************
@ObjectType()
export class RunEntityActionViewResult {
    @Field(() => [EntityAction_])
    Results: EntityAction_[];

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

@Resolver(EntityAction_)
export class EntityActionResolver extends ResolverBase {
    @Query(() => RunEntityActionViewResult)
    async RunEntityActionViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunEntityActionViewResult)
    async RunEntityActionViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunEntityActionViewResult)
    async RunEntityActionDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Entity Actions';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => EntityAction_, { nullable: true })
    async EntityAction(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<EntityAction_ | null> {
        this.CheckUserReadPermissions('Entity Actions', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwEntityActions] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Entity Actions', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Entity Actions', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
      
    @FieldResolver(() => [mj_core_schema_server_object_types.EntityActionInvocation_])
    async EntityActionInvocationsArray(@Root() entityaction_: EntityAction_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Entity Action Invocations', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwEntityActionInvocations] WHERE [EntityActionID]=${entityaction_.ID} ` + this.getRowLevelSecurityWhereClause('Entity Action Invocations', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Entity Action Invocations', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.EntityActionFilter_])
    async EntityActionFiltersArray(@Root() entityaction_: EntityAction_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Entity Action Filters', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwEntityActionFilters] WHERE [EntityActionID]=${entityaction_.ID} ` + this.getRowLevelSecurityWhereClause('Entity Action Filters', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Entity Action Filters', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => EntityAction_)
    async CreateEntityAction(
        @Arg('input', () => CreateEntityActionInput) input: CreateEntityActionInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.CreateRecord('Entity Actions', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => EntityAction_)
    async UpdateEntityAction(
        @Arg('input', () => UpdateEntityActionInput) input: UpdateEntityActionInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Entity Actions', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => EntityAction_)
    async DeleteEntityAction(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Entity Actions', key, options, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Entity Action Invocations
//****************************************************************************
@ObjectType({ description: 'Links invocation types to entity actions – for example you might link a particular EntityAction to just “Create Record” and you might also have a second item in this table allowing the same Entity Action to be invoked from a User View or List, on demand.' })
export class EntityActionInvocation_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field(() => Int) 
    EntityActionID: number;
          
    @Field(() => Int) 
    InvocationTypeID: number;
          
    @Field({description: 'Status of the entity action invocation (Pending, Active, Disabled).'}) 
    @MaxLength(40)
    Status: string;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
          
    @Field() 
    @MaxLength(510)
    InvocationType: string;
        
}
        
//****************************************************************************
// INPUT TYPE for Entity Action Invocations   
//****************************************************************************
@InputType()
export class CreateEntityActionInvocationInput {
    @Field(() => Int)
    EntityActionID: number;

    @Field(() => Int)
    InvocationTypeID: number;

    @Field()
    Status: string;
}
    
        
//****************************************************************************
// INPUT TYPE for Entity Action Invocations   
//****************************************************************************
@InputType()
export class UpdateEntityActionInvocationInput {
    @Field(() => Int)
    ID: number;

    @Field(() => Int)
    EntityActionID: number;

    @Field(() => Int)
    InvocationTypeID: number;

    @Field()
    Status: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Entity Action Invocations
//****************************************************************************
@ObjectType()
export class RunEntityActionInvocationViewResult {
    @Field(() => [EntityActionInvocation_])
    Results: EntityActionInvocation_[];

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

@Resolver(EntityActionInvocation_)
export class EntityActionInvocationResolver extends ResolverBase {
    @Query(() => RunEntityActionInvocationViewResult)
    async RunEntityActionInvocationViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunEntityActionInvocationViewResult)
    async RunEntityActionInvocationViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunEntityActionInvocationViewResult)
    async RunEntityActionInvocationDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Entity Action Invocations';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => EntityActionInvocation_, { nullable: true })
    async EntityActionInvocation(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<EntityActionInvocation_ | null> {
        this.CheckUserReadPermissions('Entity Action Invocations', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwEntityActionInvocations] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Entity Action Invocations', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Entity Action Invocations', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => EntityActionInvocation_)
    async CreateEntityActionInvocation(
        @Arg('input', () => CreateEntityActionInvocationInput) input: CreateEntityActionInvocationInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.CreateRecord('Entity Action Invocations', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => EntityActionInvocation_)
    async UpdateEntityActionInvocation(
        @Arg('input', () => UpdateEntityActionInvocationInput) input: UpdateEntityActionInvocationInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Entity Action Invocations', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => EntityActionInvocation_)
    async DeleteEntityActionInvocation(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Entity Action Invocations', key, options, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Action Authorizations
//****************************************************************************
@ObjectType({ description: 'Links actions to authorizations, one or more of these must be possessed by a user in order to execute the action.' })
export class ActionAuthorization_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field(() => Int) 
    ActionID: number;
          
    @Field() 
    @MaxLength(200)
    AuthorizationName: string;
          
    @Field({nullable: true}) 
    Comments?: string;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
          
    @Field() 
    @MaxLength(850)
    Action: string;
        
}
        
//****************************************************************************
// INPUT TYPE for Action Authorizations   
//****************************************************************************
@InputType()
export class CreateActionAuthorizationInput {
    @Field(() => Int)
    ActionID: number;

    @Field()
    AuthorizationName: string;

    @Field({ nullable: true })
    Comments?: string;
}
    
        
//****************************************************************************
// INPUT TYPE for Action Authorizations   
//****************************************************************************
@InputType()
export class UpdateActionAuthorizationInput {
    @Field(() => Int)
    ID: number;

    @Field(() => Int)
    ActionID: number;

    @Field()
    AuthorizationName: string;

    @Field({ nullable: true })
    Comments?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Action Authorizations
//****************************************************************************
@ObjectType()
export class RunActionAuthorizationViewResult {
    @Field(() => [ActionAuthorization_])
    Results: ActionAuthorization_[];

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

@Resolver(ActionAuthorization_)
export class ActionAuthorizationResolver extends ResolverBase {
    @Query(() => RunActionAuthorizationViewResult)
    async RunActionAuthorizationViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunActionAuthorizationViewResult)
    async RunActionAuthorizationViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunActionAuthorizationViewResult)
    async RunActionAuthorizationDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Action Authorizations';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => ActionAuthorization_, { nullable: true })
    async ActionAuthorization(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<ActionAuthorization_ | null> {
        this.CheckUserReadPermissions('Action Authorizations', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwActionAuthorizations] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Action Authorizations', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Action Authorizations', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => ActionAuthorization_)
    async CreateActionAuthorization(
        @Arg('input', () => CreateActionAuthorizationInput) input: CreateActionAuthorizationInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.CreateRecord('Action Authorizations', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => ActionAuthorization_)
    async UpdateActionAuthorization(
        @Arg('input', () => UpdateActionAuthorizationInput) input: UpdateActionAuthorizationInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Action Authorizations', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => ActionAuthorization_)
    async DeleteActionAuthorization(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Action Authorizations', key, options, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Entity Action Invocation Types
//****************************************************************************
@ObjectType({ description: 'Stores the possible invocation types of an action within the context of an entity. Examples would be: Record Created/Updated/Deleted/Accessed as well as things like “View” or “List” where you could run an EntityAction against an entire set of records in a view or list – either by user click or programmatically.' })
export class EntityActionInvocationType_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field({description: 'Name of the invocation type such as Record Created/Updated/etc.'}) 
    @MaxLength(510)
    Name: string;
          
    @Field({nullable: true, description: 'Description of the invocation type.'}) 
    Description?: string;
          
    @Field(() => Int) 
    DisplaySequence: number;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
        
    @Field(() => [mj_core_schema_server_object_types.EntityActionInvocation_])
    EntityActionInvocationsArray: mj_core_schema_server_object_types.EntityActionInvocation_[]; // Link to EntityActionInvocations
    
}
        
//****************************************************************************
// INPUT TYPE for Entity Action Invocation Types   
//****************************************************************************
@InputType()
export class CreateEntityActionInvocationTypeInput {
    @Field()
    Name: string;

    @Field({ nullable: true })
    Description?: string;

    @Field(() => Int)
    DisplaySequence: number;
}
    
        
//****************************************************************************
// INPUT TYPE for Entity Action Invocation Types   
//****************************************************************************
@InputType()
export class UpdateEntityActionInvocationTypeInput {
    @Field(() => Int)
    ID: number;

    @Field()
    Name: string;

    @Field({ nullable: true })
    Description?: string;

    @Field(() => Int)
    DisplaySequence: number;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Entity Action Invocation Types
//****************************************************************************
@ObjectType()
export class RunEntityActionInvocationTypeViewResult {
    @Field(() => [EntityActionInvocationType_])
    Results: EntityActionInvocationType_[];

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

@Resolver(EntityActionInvocationType_)
export class EntityActionInvocationTypeResolver extends ResolverBase {
    @Query(() => RunEntityActionInvocationTypeViewResult)
    async RunEntityActionInvocationTypeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunEntityActionInvocationTypeViewResult)
    async RunEntityActionInvocationTypeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunEntityActionInvocationTypeViewResult)
    async RunEntityActionInvocationTypeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Entity Action Invocation Types';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => EntityActionInvocationType_, { nullable: true })
    async EntityActionInvocationType(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<EntityActionInvocationType_ | null> {
        this.CheckUserReadPermissions('Entity Action Invocation Types', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwEntityActionInvocationTypes] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Entity Action Invocation Types', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Entity Action Invocation Types', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
      
    @FieldResolver(() => [mj_core_schema_server_object_types.EntityActionInvocation_])
    async EntityActionInvocationsArray(@Root() entityactioninvocationtype_: EntityActionInvocationType_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Entity Action Invocations', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwEntityActionInvocations] WHERE [InvocationTypeID]=${entityactioninvocationtype_.ID} ` + this.getRowLevelSecurityWhereClause('Entity Action Invocations', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Entity Action Invocations', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => EntityActionInvocationType_)
    async CreateEntityActionInvocationType(
        @Arg('input', () => CreateEntityActionInvocationTypeInput) input: CreateEntityActionInvocationTypeInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.CreateRecord('Entity Action Invocation Types', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => EntityActionInvocationType_)
    async UpdateEntityActionInvocationType(
        @Arg('input', () => UpdateEntityActionInvocationTypeInput) input: UpdateEntityActionInvocationTypeInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Entity Action Invocation Types', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => EntityActionInvocationType_)
    async DeleteEntityActionInvocationType(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Entity Action Invocation Types', key, options, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Actions
//****************************************************************************
@ObjectType({ description: 'Stores action definitions, including prompts, generated code, user comments, and status.' })
export class Action_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field(() => Int, {nullable: true}) 
    CategoryID?: number;
          
    @Field() 
    @MaxLength(850)
    Name: string;
          
    @Field() 
    UserPrompt: string;
          
    @Field({nullable: true, description: 'User\'s comments not shared with the LLM.'}) 
    UserComments?: string;
          
    @Field({nullable: true}) 
    Code?: string;
          
    @Field({nullable: true, description: 'AI\'s explanation of the code.'}) 
    CodeComments?: string;
          
    @Field({description: 'An action won\'t be usable until the code is approved.'}) 
    @MaxLength(40)
    CodeApprovalStatus: string;
          
    @Field({nullable: true, description: 'Optional comments when an individual (or an AI) reviews and approves the code.'}) 
    CodeApprovalComments?: string;
          
    @Field(() => Int, {nullable: true, description: 'UserID who approved the code.'}) 
    CodeApprovedByUserID?: number;
          
    @Field({nullable: true, description: 'When the code was approved.'}) 
    @MaxLength(8)
    CodeApprovedAt?: Date;
          
    @Field(() => Boolean, {description: 'If set to 1, the Action will generate code for the provided UserPrompt on the next Save even if the UserPrompt hasn\'t changed. This is useful to force regeneration when other candidates (such as a change in Action Inputs/Outputs) occurs or on demand by a user.'}) 
    ForceCodeGeneration: boolean;
          
    @Field(() => Int, {nullable: true, description: 'Number of days to retain execution logs; NULL for indefinite.'}) 
    RetentionPeriod?: number;
          
    @Field({description: 'Status of the action (Pending, Active, Disabled).'}) 
    @MaxLength(40)
    Status: string;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
          
    @Field({nullable: true}) 
    @MaxLength(510)
    Category?: string;
          
    @Field({nullable: true}) 
    @MaxLength(200)
    CodeApprovedByUser?: string;
        
    @Field(() => [mj_core_schema_server_object_types.ActionAuthorization_])
    ActionAuthorizationsArray: mj_core_schema_server_object_types.ActionAuthorization_[]; // Link to ActionAuthorizations
    
    @Field(() => [mj_core_schema_server_object_types.ActionResultCode_])
    ActionResultCodesArray: mj_core_schema_server_object_types.ActionResultCode_[]; // Link to ActionResultCodes
    
    @Field(() => [mj_core_schema_server_object_types.ActionContext_])
    ActionContextsArray: mj_core_schema_server_object_types.ActionContext_[]; // Link to ActionContexts
    
    @Field(() => [mj_core_schema_server_object_types.EntityAction_])
    EntityActionsArray: mj_core_schema_server_object_types.EntityAction_[]; // Link to EntityActions
    
    @Field(() => [mj_core_schema_server_object_types.ActionExecutionLog_])
    ActionExecutionLogsArray: mj_core_schema_server_object_types.ActionExecutionLog_[]; // Link to ActionExecutionLogs
    
    @Field(() => [mj_core_schema_server_object_types.ActionParam_])
    ActionParamsArray: mj_core_schema_server_object_types.ActionParam_[]; // Link to ActionParams
    
    @Field(() => [mj_core_schema_server_object_types.ActionLibrary_])
    ActionLibrariesArray: mj_core_schema_server_object_types.ActionLibrary_[]; // Link to ActionLibraries
    
}
        
//****************************************************************************
// INPUT TYPE for Actions   
//****************************************************************************
@InputType()
export class CreateActionInput {
    @Field(() => Int, { nullable: true })
    CategoryID?: number;

    @Field()
    Name: string;

    @Field()
    UserPrompt: string;

    @Field({ nullable: true })
    UserComments?: string;

    @Field({ nullable: true })
    Code?: string;

    @Field({ nullable: true })
    CodeComments?: string;

    @Field()
    CodeApprovalStatus: string;

    @Field({ nullable: true })
    CodeApprovalComments?: string;

    @Field(() => Int, { nullable: true })
    CodeApprovedByUserID?: number;

    @Field({ nullable: true })
    CodeApprovedAt?: Date;

    @Field(() => Boolean)
    ForceCodeGeneration: boolean;

    @Field(() => Int, { nullable: true })
    RetentionPeriod?: number;

    @Field()
    Status: string;
}
    
        
//****************************************************************************
// INPUT TYPE for Actions   
//****************************************************************************
@InputType()
export class UpdateActionInput {
    @Field(() => Int)
    ID: number;

    @Field(() => Int, { nullable: true })
    CategoryID?: number;

    @Field()
    Name: string;

    @Field()
    UserPrompt: string;

    @Field({ nullable: true })
    UserComments?: string;

    @Field({ nullable: true })
    Code?: string;

    @Field({ nullable: true })
    CodeComments?: string;

    @Field()
    CodeApprovalStatus: string;

    @Field({ nullable: true })
    CodeApprovalComments?: string;

    @Field(() => Int, { nullable: true })
    CodeApprovedByUserID?: number;

    @Field({ nullable: true })
    CodeApprovedAt?: Date;

    @Field(() => Boolean)
    ForceCodeGeneration: boolean;

    @Field(() => Int, { nullable: true })
    RetentionPeriod?: number;

    @Field()
    Status: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Actions
//****************************************************************************
@ObjectType()
export class RunActionViewResult {
    @Field(() => [Action_])
    Results: Action_[];

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

@Resolver(Action_)
export class ActionResolver extends ResolverBase {
    @Query(() => RunActionViewResult)
    async RunActionViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunActionViewResult)
    async RunActionViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunActionViewResult)
    async RunActionDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Actions';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => Action_, { nullable: true })
    async Action(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Action_ | null> {
        this.CheckUserReadPermissions('Actions', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwActions] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Actions', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Actions', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
      
    @FieldResolver(() => [mj_core_schema_server_object_types.ActionAuthorization_])
    async ActionAuthorizationsArray(@Root() action_: Action_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Action Authorizations', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwActionAuthorizations] WHERE [ActionID]=${action_.ID} ` + this.getRowLevelSecurityWhereClause('Action Authorizations', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Action Authorizations', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.ActionResultCode_])
    async ActionResultCodesArray(@Root() action_: Action_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Action Result Codes', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwActionResultCodes] WHERE [ActionID]=${action_.ID} ` + this.getRowLevelSecurityWhereClause('Action Result Codes', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Action Result Codes', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.ActionContext_])
    async ActionContextsArray(@Root() action_: Action_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Action Contexts', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwActionContexts] WHERE [ActionID]=${action_.ID} ` + this.getRowLevelSecurityWhereClause('Action Contexts', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Action Contexts', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.EntityAction_])
    async EntityActionsArray(@Root() action_: Action_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Entity Actions', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwEntityActions] WHERE [ActionID]=${action_.ID} ` + this.getRowLevelSecurityWhereClause('Entity Actions', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Entity Actions', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.ActionExecutionLog_])
    async ActionExecutionLogsArray(@Root() action_: Action_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Action Execution Logs', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwActionExecutionLogs] WHERE [ActionID]=${action_.ID} ` + this.getRowLevelSecurityWhereClause('Action Execution Logs', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Action Execution Logs', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.ActionParam_])
    async ActionParamsArray(@Root() action_: Action_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Action Params', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwActionParams] WHERE [ActionID]=${action_.ID} ` + this.getRowLevelSecurityWhereClause('Action Params', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Action Params', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.ActionLibrary_])
    async ActionLibrariesArray(@Root() action_: Action_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Action Libraries', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwActionLibraries] WHERE [ActionID]=${action_.ID} ` + this.getRowLevelSecurityWhereClause('Action Libraries', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Action Libraries', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => Action_)
    async CreateAction(
        @Arg('input', () => CreateActionInput) input: CreateActionInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.CreateRecord('Actions', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => Action_)
    async UpdateAction(
        @Arg('input', () => UpdateActionInput) input: UpdateActionInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Actions', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => Action_)
    async DeleteAction(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Actions', key, options, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Entity Action Filters
//****************************************************************************
@ObjectType({ description: 'Optional use. Maps Action Filters to specific EntityAction instances, specifying execution order and status. This allows for “pre-processing” before an Action actually is fired off, to check for various state/dirty/value conditions.' })
export class EntityActionFilter_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field(() => Int) 
    EntityActionID: number;
          
    @Field(() => Int) 
    ActionFilterID: number;
          
    @Field(() => Int, {description: 'Order of filter execution.'}) 
    Sequence: number;
          
    @Field({description: 'Status of the entity action filter (Pending, Active, Disabled).'}) 
    @MaxLength(40)
    Status: string;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
        
}
        
//****************************************************************************
// INPUT TYPE for Entity Action Filters   
//****************************************************************************
@InputType()
export class CreateEntityActionFilterInput {
    @Field(() => Int)
    EntityActionID: number;

    @Field(() => Int)
    ActionFilterID: number;

    @Field(() => Int)
    Sequence: number;

    @Field()
    Status: string;
}
    
        
//****************************************************************************
// INPUT TYPE for Entity Action Filters   
//****************************************************************************
@InputType()
export class UpdateEntityActionFilterInput {
    @Field(() => Int)
    ID: number;

    @Field(() => Int)
    EntityActionID: number;

    @Field(() => Int)
    ActionFilterID: number;

    @Field(() => Int)
    Sequence: number;

    @Field()
    Status: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Entity Action Filters
//****************************************************************************
@ObjectType()
export class RunEntityActionFilterViewResult {
    @Field(() => [EntityActionFilter_])
    Results: EntityActionFilter_[];

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

@Resolver(EntityActionFilter_)
export class EntityActionFilterResolver extends ResolverBase {
    @Query(() => RunEntityActionFilterViewResult)
    async RunEntityActionFilterViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunEntityActionFilterViewResult)
    async RunEntityActionFilterViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunEntityActionFilterViewResult)
    async RunEntityActionFilterDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Entity Action Filters';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => EntityActionFilter_, { nullable: true })
    async EntityActionFilter(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<EntityActionFilter_ | null> {
        this.CheckUserReadPermissions('Entity Action Filters', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwEntityActionFilters] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Entity Action Filters', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Entity Action Filters', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => EntityActionFilter_)
    async CreateEntityActionFilter(
        @Arg('input', () => CreateEntityActionFilterInput) input: CreateEntityActionFilterInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.CreateRecord('Entity Action Filters', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => EntityActionFilter_)
    async UpdateEntityActionFilter(
        @Arg('input', () => UpdateEntityActionFilterInput) input: UpdateEntityActionFilterInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Entity Action Filters', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => EntityActionFilter_)
    async DeleteEntityActionFilter(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Entity Action Filters', key, options, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Action Filters
//****************************************************************************
@ObjectType({ description: 'Defines filters that can be evaluated ahead of executing an action. Action Filters are usable in any code pipeline you can execute them with the same context as the action itself and use the outcome to determine if the action should execute or not.' })
export class ActionFilter_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field() 
    UserDescription: string;
          
    @Field({nullable: true}) 
    UserComments?: string;
          
    @Field() 
    Code: string;
          
    @Field({nullable: true}) 
    CodeExplanation?: string;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
        
    @Field(() => [mj_core_schema_server_object_types.EntityActionFilter_])
    EntityActionFiltersArray: mj_core_schema_server_object_types.EntityActionFilter_[]; // Link to EntityActionFilters
    
}
        
//****************************************************************************
// INPUT TYPE for Action Filters   
//****************************************************************************
@InputType()
export class CreateActionFilterInput {
    @Field()
    UserDescription: string;

    @Field({ nullable: true })
    UserComments?: string;

    @Field()
    Code: string;

    @Field({ nullable: true })
    CodeExplanation?: string;
}
    
        
//****************************************************************************
// INPUT TYPE for Action Filters   
//****************************************************************************
@InputType()
export class UpdateActionFilterInput {
    @Field(() => Int)
    ID: number;

    @Field()
    UserDescription: string;

    @Field({ nullable: true })
    UserComments?: string;

    @Field()
    Code: string;

    @Field({ nullable: true })
    CodeExplanation?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Action Filters
//****************************************************************************
@ObjectType()
export class RunActionFilterViewResult {
    @Field(() => [ActionFilter_])
    Results: ActionFilter_[];

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

@Resolver(ActionFilter_)
export class ActionFilterResolver extends ResolverBase {
    @Query(() => RunActionFilterViewResult)
    async RunActionFilterViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunActionFilterViewResult)
    async RunActionFilterViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunActionFilterViewResult)
    async RunActionFilterDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Action Filters';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => ActionFilter_, { nullable: true })
    async ActionFilter(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<ActionFilter_ | null> {
        this.CheckUserReadPermissions('Action Filters', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwActionFilters] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Action Filters', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Action Filters', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
      
    @FieldResolver(() => [mj_core_schema_server_object_types.EntityActionFilter_])
    async EntityActionFiltersArray(@Root() actionfilter_: ActionFilter_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Entity Action Filters', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwEntityActionFilters] WHERE [ActionFilterID]=${actionfilter_.ID} ` + this.getRowLevelSecurityWhereClause('Entity Action Filters', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Entity Action Filters', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => ActionFilter_)
    async CreateActionFilter(
        @Arg('input', () => CreateActionFilterInput) input: CreateActionFilterInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.CreateRecord('Action Filters', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => ActionFilter_)
    async UpdateActionFilter(
        @Arg('input', () => UpdateActionFilterInput) input: UpdateActionFilterInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Action Filters', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => ActionFilter_)
    async DeleteActionFilter(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Action Filters', key, options, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Action Context Types
//****************************************************************************
@ObjectType({ description: 'Lists possible contexts for action execution with optional descriptions.' })
export class ActionContextType_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field({description: 'Name of the context type.'}) 
    @MaxLength(510)
    Name: string;
          
    @Field({nullable: true, description: 'Description of the context type.'}) 
    Description?: string;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
        
    @Field(() => [mj_core_schema_server_object_types.ActionContext_])
    ActionContextsArray: mj_core_schema_server_object_types.ActionContext_[]; // Link to ActionContexts
    
}
        
//****************************************************************************
// INPUT TYPE for Action Context Types   
//****************************************************************************
@InputType()
export class CreateActionContextTypeInput {
    @Field()
    Name: string;

    @Field({ nullable: true })
    Description?: string;
}
    
        
//****************************************************************************
// INPUT TYPE for Action Context Types   
//****************************************************************************
@InputType()
export class UpdateActionContextTypeInput {
    @Field(() => Int)
    ID: number;

    @Field()
    Name: string;

    @Field({ nullable: true })
    Description?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Action Context Types
//****************************************************************************
@ObjectType()
export class RunActionContextTypeViewResult {
    @Field(() => [ActionContextType_])
    Results: ActionContextType_[];

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

@Resolver(ActionContextType_)
export class ActionContextTypeResolver extends ResolverBase {
    @Query(() => RunActionContextTypeViewResult)
    async RunActionContextTypeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunActionContextTypeViewResult)
    async RunActionContextTypeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunActionContextTypeViewResult)
    async RunActionContextTypeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Action Context Types';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => ActionContextType_, { nullable: true })
    async ActionContextType(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<ActionContextType_ | null> {
        this.CheckUserReadPermissions('Action Context Types', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwActionContextTypes] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Action Context Types', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Action Context Types', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
      
    @FieldResolver(() => [mj_core_schema_server_object_types.ActionContext_])
    async ActionContextsArray(@Root() actioncontexttype_: ActionContextType_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Action Contexts', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwActionContexts] WHERE [ContextTypeID]=${actioncontexttype_.ID} ` + this.getRowLevelSecurityWhereClause('Action Contexts', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Action Contexts', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => ActionContextType_)
    async CreateActionContextType(
        @Arg('input', () => CreateActionContextTypeInput) input: CreateActionContextTypeInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.CreateRecord('Action Context Types', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => ActionContextType_)
    async UpdateActionContextType(
        @Arg('input', () => UpdateActionContextTypeInput) input: UpdateActionContextTypeInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Action Context Types', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => ActionContextType_)
    async DeleteActionContextType(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Action Context Types', key, options, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Action Result Codes
//****************************************************************************
@ObjectType({ description: 'Defines the possible result codes for each action.' })
export class ActionResultCode_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field(() => Int) 
    ActionID: number;
          
    @Field() 
    @MaxLength(510)
    ResultCode: string;
          
    @Field({nullable: true, description: 'Description of the result code.'}) 
    Description?: string;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
          
    @Field() 
    @MaxLength(850)
    Action: string;
        
}
        
//****************************************************************************
// INPUT TYPE for Action Result Codes   
//****************************************************************************
@InputType()
export class CreateActionResultCodeInput {
    @Field(() => Int)
    ActionID: number;

    @Field()
    ResultCode: string;

    @Field({ nullable: true })
    Description?: string;
}
    
        
//****************************************************************************
// INPUT TYPE for Action Result Codes   
//****************************************************************************
@InputType()
export class UpdateActionResultCodeInput {
    @Field(() => Int)
    ID: number;

    @Field(() => Int)
    ActionID: number;

    @Field()
    ResultCode: string;

    @Field({ nullable: true })
    Description?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Action Result Codes
//****************************************************************************
@ObjectType()
export class RunActionResultCodeViewResult {
    @Field(() => [ActionResultCode_])
    Results: ActionResultCode_[];

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

@Resolver(ActionResultCode_)
export class ActionResultCodeResolver extends ResolverBase {
    @Query(() => RunActionResultCodeViewResult)
    async RunActionResultCodeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunActionResultCodeViewResult)
    async RunActionResultCodeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunActionResultCodeViewResult)
    async RunActionResultCodeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Action Result Codes';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => ActionResultCode_, { nullable: true })
    async ActionResultCode(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<ActionResultCode_ | null> {
        this.CheckUserReadPermissions('Action Result Codes', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwActionResultCodes] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Action Result Codes', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Action Result Codes', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => ActionResultCode_)
    async CreateActionResultCode(
        @Arg('input', () => CreateActionResultCodeInput) input: CreateActionResultCodeInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.CreateRecord('Action Result Codes', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => ActionResultCode_)
    async UpdateActionResultCode(
        @Arg('input', () => UpdateActionResultCodeInput) input: UpdateActionResultCodeInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Action Result Codes', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => ActionResultCode_)
    async DeleteActionResultCode(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Action Result Codes', key, options, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Action Contexts
//****************************************************************************
@ObjectType({ description: 'Links actions to their supported context types enabling a given action to be executable in more than one context.' })
export class ActionContext_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field(() => Int) 
    ActionID: number;
          
    @Field(() => Int) 
    ContextTypeID: number;
          
    @Field({description: 'Status of the action context (Pending, Active, Disabled).'}) 
    @MaxLength(40)
    Status: string;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
          
    @Field() 
    @MaxLength(850)
    Action: string;
          
    @Field() 
    @MaxLength(510)
    ContextType: string;
        
}
        
//****************************************************************************
// INPUT TYPE for Action Contexts   
//****************************************************************************
@InputType()
export class CreateActionContextInput {
    @Field(() => Int)
    ActionID: number;

    @Field(() => Int)
    ContextTypeID: number;

    @Field()
    Status: string;
}
    
        
//****************************************************************************
// INPUT TYPE for Action Contexts   
//****************************************************************************
@InputType()
export class UpdateActionContextInput {
    @Field(() => Int)
    ID: number;

    @Field(() => Int)
    ActionID: number;

    @Field(() => Int)
    ContextTypeID: number;

    @Field()
    Status: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Action Contexts
//****************************************************************************
@ObjectType()
export class RunActionContextViewResult {
    @Field(() => [ActionContext_])
    Results: ActionContext_[];

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

@Resolver(ActionContext_)
export class ActionContextResolver extends ResolverBase {
    @Query(() => RunActionContextViewResult)
    async RunActionContextViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunActionContextViewResult)
    async RunActionContextViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunActionContextViewResult)
    async RunActionContextDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Action Contexts';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => ActionContext_, { nullable: true })
    async ActionContext(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<ActionContext_ | null> {
        this.CheckUserReadPermissions('Action Contexts', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwActionContexts] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Action Contexts', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Action Contexts', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => ActionContext_)
    async CreateActionContext(
        @Arg('input', () => CreateActionContextInput) input: CreateActionContextInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.CreateRecord('Action Contexts', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => ActionContext_)
    async UpdateActionContext(
        @Arg('input', () => UpdateActionContextInput) input: UpdateActionContextInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Action Contexts', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => ActionContext_)
    async DeleteActionContext(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Action Contexts', key, options, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Action Execution Logs
//****************************************************************************
@ObjectType({ description: 'Tracks every execution of an action, including start and end times, inputs, outputs, and result codes.' })
export class ActionExecutionLog_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field(() => Int) 
    ActionID: number;
          
    @Field({description: 'Timestamp of when the action started execution.'}) 
    @MaxLength(8)
    StartedAt: Date;
          
    @Field({nullable: true, description: 'Timestamp of when the action ended execution.'}) 
    @MaxLength(8)
    EndedAt?: Date;
          
    @Field({nullable: true}) 
    Params?: string;
          
    @Field({nullable: true}) 
    @MaxLength(510)
    ResultCode?: string;
          
    @Field(() => Int) 
    UserID: number;
          
    @Field(() => Int, {nullable: true, description: 'Number of days to retain the log; NULL for indefinite retention.'}) 
    RetentionPeriod?: number;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
          
    @Field() 
    @MaxLength(850)
    Action: string;
          
    @Field() 
    @MaxLength(200)
    User: string;
        
}
        
//****************************************************************************
// INPUT TYPE for Action Execution Logs   
//****************************************************************************
@InputType()
export class CreateActionExecutionLogInput {
    @Field(() => Int)
    ActionID: number;

    @Field()
    StartedAt: Date;

    @Field({ nullable: true })
    EndedAt?: Date;

    @Field({ nullable: true })
    Params?: string;

    @Field({ nullable: true })
    ResultCode?: string;

    @Field(() => Int)
    UserID: number;

    @Field(() => Int, { nullable: true })
    RetentionPeriod?: number;
}
    
        
//****************************************************************************
// INPUT TYPE for Action Execution Logs   
//****************************************************************************
@InputType()
export class UpdateActionExecutionLogInput {
    @Field(() => Int)
    ID: number;

    @Field(() => Int)
    ActionID: number;

    @Field()
    StartedAt: Date;

    @Field({ nullable: true })
    EndedAt?: Date;

    @Field({ nullable: true })
    Params?: string;

    @Field({ nullable: true })
    ResultCode?: string;

    @Field(() => Int)
    UserID: number;

    @Field(() => Int, { nullable: true })
    RetentionPeriod?: number;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Action Execution Logs
//****************************************************************************
@ObjectType()
export class RunActionExecutionLogViewResult {
    @Field(() => [ActionExecutionLog_])
    Results: ActionExecutionLog_[];

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

@Resolver(ActionExecutionLog_)
export class ActionExecutionLogResolver extends ResolverBase {
    @Query(() => RunActionExecutionLogViewResult)
    async RunActionExecutionLogViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunActionExecutionLogViewResult)
    async RunActionExecutionLogViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunActionExecutionLogViewResult)
    async RunActionExecutionLogDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Action Execution Logs';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => ActionExecutionLog_, { nullable: true })
    async ActionExecutionLog(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<ActionExecutionLog_ | null> {
        this.CheckUserReadPermissions('Action Execution Logs', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwActionExecutionLogs] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Action Execution Logs', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Action Execution Logs', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => ActionExecutionLog_)
    async CreateActionExecutionLog(
        @Arg('input', () => CreateActionExecutionLogInput) input: CreateActionExecutionLogInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.CreateRecord('Action Execution Logs', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => ActionExecutionLog_)
    async UpdateActionExecutionLog(
        @Arg('input', () => UpdateActionExecutionLogInput) input: UpdateActionExecutionLogInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Action Execution Logs', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => ActionExecutionLog_)
    async DeleteActionExecutionLog(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Action Execution Logs', key, options, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Action Params
//****************************************************************************
@ObjectType({ description: 'Tracks the input and output parameters for Actions.' })
export class ActionParam_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field(() => Int) 
    ActionID: number;
          
    @Field() 
    @MaxLength(510)
    Name: string;
          
    @Field({nullable: true}) 
    DefaultValue?: string;
          
    @Field() 
    @MaxLength(20)
    Type: string;
          
    @Field({description: 'Tracks the basic value type of the parameter, additional information can be provided in the Description field'}) 
    @MaxLength(60)
    ValueType: string;
          
    @Field(() => Boolean) 
    IsArray: boolean;
          
    @Field({nullable: true}) 
    Description?: string;
          
    @Field(() => Boolean) 
    IsRequired: boolean;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
          
    @Field() 
    @MaxLength(850)
    Action: string;
        
}
        
//****************************************************************************
// INPUT TYPE for Action Params   
//****************************************************************************
@InputType()
export class CreateActionParamInput {
    @Field(() => Int)
    ActionID: number;

    @Field()
    Name: string;

    @Field({ nullable: true })
    DefaultValue?: string;

    @Field()
    Type: string;

    @Field()
    ValueType: string;

    @Field(() => Boolean)
    IsArray: boolean;

    @Field({ nullable: true })
    Description?: string;

    @Field(() => Boolean)
    IsRequired: boolean;
}
    
        
//****************************************************************************
// INPUT TYPE for Action Params   
//****************************************************************************
@InputType()
export class UpdateActionParamInput {
    @Field(() => Int)
    ID: number;

    @Field(() => Int)
    ActionID: number;

    @Field()
    Name: string;

    @Field({ nullable: true })
    DefaultValue?: string;

    @Field()
    Type: string;

    @Field()
    ValueType: string;

    @Field(() => Boolean)
    IsArray: boolean;

    @Field({ nullable: true })
    Description?: string;

    @Field(() => Boolean)
    IsRequired: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Action Params
//****************************************************************************
@ObjectType()
export class RunActionParamViewResult {
    @Field(() => [ActionParam_])
    Results: ActionParam_[];

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

@Resolver(ActionParam_)
export class ActionParamResolver extends ResolverBase {
    @Query(() => RunActionParamViewResult)
    async RunActionParamViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunActionParamViewResult)
    async RunActionParamViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunActionParamViewResult)
    async RunActionParamDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Action Params';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => ActionParam_, { nullable: true })
    async ActionParam(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<ActionParam_ | null> {
        this.CheckUserReadPermissions('Action Params', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwActionParams] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Action Params', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Action Params', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => ActionParam_)
    async CreateActionParam(
        @Arg('input', () => CreateActionParamInput) input: CreateActionParamInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.CreateRecord('Action Params', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => ActionParam_)
    async UpdateActionParam(
        @Arg('input', () => UpdateActionParamInput) input: UpdateActionParamInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Action Params', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => ActionParam_)
    async DeleteActionParam(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Action Params', key, options, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Action Libraries
//****************************************************************************
@ObjectType({ description: 'Tracks the list of libraries that a given Action uses, including a list of classes/functions for each library.' })
export class ActionLibrary_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field(() => Int) 
    ActionID: number;
          
    @Field(() => Int) 
    LibraryID: number;
          
    @Field({nullable: true, description: 'List of classes and functions used by the action from the library.'}) 
    ItemsUsed?: string;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
          
    @Field() 
    @MaxLength(850)
    Action: string;
          
    @Field() 
    @MaxLength(510)
    Library: string;
        
}
        
//****************************************************************************
// INPUT TYPE for Action Libraries   
//****************************************************************************
@InputType()
export class CreateActionLibraryInput {
    @Field(() => Int)
    ActionID: number;

    @Field(() => Int)
    LibraryID: number;

    @Field({ nullable: true })
    ItemsUsed?: string;
}
    
        
//****************************************************************************
// INPUT TYPE for Action Libraries   
//****************************************************************************
@InputType()
export class UpdateActionLibraryInput {
    @Field(() => Int)
    ID: number;

    @Field(() => Int)
    ActionID: number;

    @Field(() => Int)
    LibraryID: number;

    @Field({ nullable: true })
    ItemsUsed?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Action Libraries
//****************************************************************************
@ObjectType()
export class RunActionLibraryViewResult {
    @Field(() => [ActionLibrary_])
    Results: ActionLibrary_[];

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

@Resolver(ActionLibrary_)
export class ActionLibraryResolver extends ResolverBase {
    @Query(() => RunActionLibraryViewResult)
    async RunActionLibraryViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunActionLibraryViewResult)
    async RunActionLibraryViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunActionLibraryViewResult)
    async RunActionLibraryDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Action Libraries';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => ActionLibrary_, { nullable: true })
    async ActionLibrary(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<ActionLibrary_ | null> {
        this.CheckUserReadPermissions('Action Libraries', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwActionLibraries] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Action Libraries', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Action Libraries', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => ActionLibrary_)
    async CreateActionLibrary(
        @Arg('input', () => CreateActionLibraryInput) input: CreateActionLibraryInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.CreateRecord('Action Libraries', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => ActionLibrary_)
    async UpdateActionLibrary(
        @Arg('input', () => UpdateActionLibraryInput) input: UpdateActionLibraryInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Action Libraries', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => ActionLibrary_)
    async DeleteActionLibrary(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Action Libraries', key, options, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Libraries
//****************************************************************************
@ObjectType({ description: 'Stores information about the available libraries, including a list of classes/functions, type definitions, and sample code. You can add additional custom libraries here to make them avaialable to code generation features within the system.' })
export class Library_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field() 
    @MaxLength(510)
    Name: string;
          
    @Field({nullable: true}) 
    Description?: string;
          
    @Field({description: 'Status of the library, only libraries marked as Active will be available for use by generated code. If a library was once active but no longer is, existing code that used the library will not be affected.'}) 
    @MaxLength(40)
    Status: string;
          
    @Field({nullable: true, description: 'List of classes and functions exported by the library.'}) 
    ExportedItems?: string;
          
    @Field({nullable: true, description: 'Code showing the types and functions defined in the library to be used for reference by humans and AI'}) 
    TypeDefinitions?: string;
          
    @Field({nullable: true, description: 'Examples of code use of the classes and/or functions from within the library'}) 
    SampleCode?: string;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
        
    @Field(() => [mj_core_schema_server_object_types.ActionLibrary_])
    ActionLibrariesArray: mj_core_schema_server_object_types.ActionLibrary_[]; // Link to ActionLibraries
    
}
        
//****************************************************************************
// INPUT TYPE for Libraries   
//****************************************************************************
@InputType()
export class CreateLibraryInput {
    @Field()
    Name: string;

    @Field({ nullable: true })
    Description?: string;

    @Field()
    Status: string;

    @Field({ nullable: true })
    ExportedItems?: string;

    @Field({ nullable: true })
    TypeDefinitions?: string;

    @Field({ nullable: true })
    SampleCode?: string;
}
    
        
//****************************************************************************
// INPUT TYPE for Libraries   
//****************************************************************************
@InputType()
export class UpdateLibraryInput {
    @Field(() => Int)
    ID: number;

    @Field()
    Name: string;

    @Field({ nullable: true })
    Description?: string;

    @Field()
    Status: string;

    @Field({ nullable: true })
    ExportedItems?: string;

    @Field({ nullable: true })
    TypeDefinitions?: string;

    @Field({ nullable: true })
    SampleCode?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Libraries
//****************************************************************************
@ObjectType()
export class RunLibraryViewResult {
    @Field(() => [Library_])
    Results: Library_[];

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

@Resolver(Library_)
export class LibraryResolver extends ResolverBase {
    @Query(() => RunLibraryViewResult)
    async RunLibraryViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunLibraryViewResult)
    async RunLibraryViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunLibraryViewResult)
    async RunLibraryDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Libraries';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => Library_, { nullable: true })
    async Library(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Library_ | null> {
        this.CheckUserReadPermissions('Libraries', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwLibraries] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Libraries', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Libraries', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
      
    @FieldResolver(() => [mj_core_schema_server_object_types.ActionLibrary_])
    async ActionLibrariesArray(@Root() library_: Library_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Action Libraries', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwActionLibraries] WHERE [LibraryID]=${library_.ID} ` + this.getRowLevelSecurityWhereClause('Action Libraries', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Action Libraries', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => Library_)
    async CreateLibrary(
        @Arg('input', () => CreateLibraryInput) input: CreateLibraryInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.CreateRecord('Libraries', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => Library_)
    async UpdateLibrary(
        @Arg('input', () => UpdateLibraryInput) input: UpdateLibraryInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Libraries', input, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for List Categories
//****************************************************************************
@ObjectType()
export class ListCategory_ {  
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
        
}
        
//****************************************************************************
// INPUT TYPE for List Categories   
//****************************************************************************
@InputType()
export class CreateListCategoryInput {
    @Field()
    Name: string;

    @Field({ nullable: true })
    Description?: string;

    @Field(() => Int, { nullable: true })
    ParentID?: number;

    @Field(() => Int)
    UserID: number;
}
    
        
//****************************************************************************
// INPUT TYPE for List Categories   
//****************************************************************************
@InputType()
export class UpdateListCategoryInput {
    @Field(() => Int)
    ID: number;

    @Field()
    Name: string;

    @Field({ nullable: true })
    Description?: string;

    @Field(() => Int, { nullable: true })
    ParentID?: number;

    @Field(() => Int)
    UserID: number;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for List Categories
//****************************************************************************
@ObjectType()
export class RunListCategoryViewResult {
    @Field(() => [ListCategory_])
    Results: ListCategory_[];

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

@Resolver(ListCategory_)
export class ListCategoryResolver extends ResolverBase {
    @Query(() => RunListCategoryViewResult)
    async RunListCategoryViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunListCategoryViewResult)
    async RunListCategoryViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunListCategoryViewResult)
    async RunListCategoryDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'List Categories';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => ListCategory_, { nullable: true })
    async ListCategory(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<ListCategory_ | null> {
        this.CheckUserReadPermissions('List Categories', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwListCategories] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('List Categories', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('List Categories', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => ListCategory_)
    async CreateListCategory(
        @Arg('input', () => CreateListCategoryInput) input: CreateListCategoryInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.CreateRecord('List Categories', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => ListCategory_)
    async UpdateListCategory(
        @Arg('input', () => UpdateListCategoryInput) input: UpdateListCategoryInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('List Categories', input, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Communication Providers
//****************************************************************************
@ObjectType({ description: 'All supported communication providers.' })
export class CommunicationProvider_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field() 
    @MaxLength(510)
    Name: string;
          
    @Field({nullable: true}) 
    Description?: string;
          
    @Field({description: 'The status of the communication provider (Disabled or Active).'}) 
    @MaxLength(40)
    Status: string;
          
    @Field(() => Boolean, {description: 'Indicates if the provider supports sending messages.'}) 
    SupportsSending: boolean;
          
    @Field(() => Boolean, {description: 'Indicates if the provider supports receiving messages.'}) 
    SupportsReceiving: boolean;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
        
    @Field(() => [mj_core_schema_server_object_types.CommunicationProviderMessageType_])
    CommunicationProviderMessageTypesArray: mj_core_schema_server_object_types.CommunicationProviderMessageType_[]; // Link to CommunicationProviderMessageTypes
    
    @Field(() => [mj_core_schema_server_object_types.CommunicationLog_])
    CommunicationLogsArray: mj_core_schema_server_object_types.CommunicationLog_[]; // Link to CommunicationLogs
    
}
        
//****************************************************************************
// INPUT TYPE for Communication Providers   
//****************************************************************************
@InputType()
export class CreateCommunicationProviderInput {
    @Field()
    Name: string;

    @Field({ nullable: true })
    Description?: string;

    @Field()
    Status: string;

    @Field(() => Boolean)
    SupportsSending: boolean;

    @Field(() => Boolean)
    SupportsReceiving: boolean;
}
    
        
//****************************************************************************
// INPUT TYPE for Communication Providers   
//****************************************************************************
@InputType()
export class UpdateCommunicationProviderInput {
    @Field(() => Int)
    ID: number;

    @Field()
    Name: string;

    @Field({ nullable: true })
    Description?: string;

    @Field()
    Status: string;

    @Field(() => Boolean)
    SupportsSending: boolean;

    @Field(() => Boolean)
    SupportsReceiving: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Communication Providers
//****************************************************************************
@ObjectType()
export class RunCommunicationProviderViewResult {
    @Field(() => [CommunicationProvider_])
    Results: CommunicationProvider_[];

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

@Resolver(CommunicationProvider_)
export class CommunicationProviderResolver extends ResolverBase {
    @Query(() => RunCommunicationProviderViewResult)
    async RunCommunicationProviderViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunCommunicationProviderViewResult)
    async RunCommunicationProviderViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunCommunicationProviderViewResult)
    async RunCommunicationProviderDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Communication Providers';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => CommunicationProvider_, { nullable: true })
    async CommunicationProvider(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<CommunicationProvider_ | null> {
        this.CheckUserReadPermissions('Communication Providers', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwCommunicationProviders] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Communication Providers', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Communication Providers', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
      
    @FieldResolver(() => [mj_core_schema_server_object_types.CommunicationProviderMessageType_])
    async CommunicationProviderMessageTypesArray(@Root() communicationprovider_: CommunicationProvider_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Communication Provider Message Types', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwCommunicationProviderMessageTypes] WHERE [CommunicationProviderID]=${communicationprovider_.ID} ` + this.getRowLevelSecurityWhereClause('Communication Provider Message Types', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Communication Provider Message Types', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.CommunicationLog_])
    async CommunicationLogsArray(@Root() communicationprovider_: CommunicationProvider_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Communication Logs', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwCommunicationLogs] WHERE [CommunicationProviderID]=${communicationprovider_.ID} ` + this.getRowLevelSecurityWhereClause('Communication Logs', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Communication Logs', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => CommunicationProvider_)
    async CreateCommunicationProvider(
        @Arg('input', () => CreateCommunicationProviderInput) input: CreateCommunicationProviderInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.CreateRecord('Communication Providers', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => CommunicationProvider_)
    async UpdateCommunicationProvider(
        @Arg('input', () => UpdateCommunicationProviderInput) input: UpdateCommunicationProviderInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Communication Providers', input, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Communication Runs
//****************************************************************************
@ObjectType({ description: 'Runs of bulk message sends and receives.' })
export class CommunicationRun_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field(() => Int) 
    UserID: number;
          
    @Field({description: 'The direction of the communication run (Sending or Receiving).'}) 
    @MaxLength(40)
    Direction: string;
          
    @Field({description: 'The status of the communication run (Pending, In-Progress, Complete, Failed).'}) 
    @MaxLength(40)
    Status: string;
          
    @Field({nullable: true}) 
    Comments?: string;
          
    @Field({nullable: true, description: 'The error message if the communication run failed.'}) 
    ErrorMessage?: string;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
          
    @Field() 
    @MaxLength(200)
    User: string;
        
    @Field(() => [mj_core_schema_server_object_types.CommunicationLog_])
    CommunicationLogsArray: mj_core_schema_server_object_types.CommunicationLog_[]; // Link to CommunicationLogs
    
}
        
//****************************************************************************
// INPUT TYPE for Communication Runs   
//****************************************************************************
@InputType()
export class CreateCommunicationRunInput {
    @Field(() => Int)
    UserID: number;

    @Field()
    Direction: string;

    @Field()
    Status: string;

    @Field({ nullable: true })
    Comments?: string;

    @Field({ nullable: true })
    ErrorMessage?: string;
}
    
        
//****************************************************************************
// INPUT TYPE for Communication Runs   
//****************************************************************************
@InputType()
export class UpdateCommunicationRunInput {
    @Field(() => Int)
    ID: number;

    @Field(() => Int)
    UserID: number;

    @Field()
    Direction: string;

    @Field()
    Status: string;

    @Field({ nullable: true })
    Comments?: string;

    @Field({ nullable: true })
    ErrorMessage?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Communication Runs
//****************************************************************************
@ObjectType()
export class RunCommunicationRunViewResult {
    @Field(() => [CommunicationRun_])
    Results: CommunicationRun_[];

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

@Resolver(CommunicationRun_)
export class CommunicationRunResolver extends ResolverBase {
    @Query(() => RunCommunicationRunViewResult)
    async RunCommunicationRunViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunCommunicationRunViewResult)
    async RunCommunicationRunViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunCommunicationRunViewResult)
    async RunCommunicationRunDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Communication Runs';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => CommunicationRun_, { nullable: true })
    async CommunicationRun(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<CommunicationRun_ | null> {
        this.CheckUserReadPermissions('Communication Runs', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwCommunicationRuns] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Communication Runs', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Communication Runs', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
      
    @FieldResolver(() => [mj_core_schema_server_object_types.CommunicationLog_])
    async CommunicationLogsArray(@Root() communicationrun_: CommunicationRun_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Communication Logs', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwCommunicationLogs] WHERE [CommunicationRunID]=${communicationrun_.ID} ` + this.getRowLevelSecurityWhereClause('Communication Logs', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Communication Logs', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => CommunicationRun_)
    async CreateCommunicationRun(
        @Arg('input', () => CreateCommunicationRunInput) input: CreateCommunicationRunInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.CreateRecord('Communication Runs', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => CommunicationRun_)
    async UpdateCommunicationRun(
        @Arg('input', () => UpdateCommunicationRunInput) input: UpdateCommunicationRunInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Communication Runs', input, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Communication Provider Message Types
//****************************************************************************
@ObjectType({ description: 'Providers and their supported message types with additional attributes.' })
export class CommunicationProviderMessageType_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field(() => Int) 
    CommunicationProviderID: number;
          
    @Field(() => Int) 
    CommunicationBaseMessageTypeID: number;
          
    @Field() 
    @MaxLength(510)
    Name: string;
          
    @Field({description: 'The status of the provider message type (Disabled or Active).'}) 
    @MaxLength(40)
    Status: string;
          
    @Field({nullable: true, description: 'Additional attributes specific to the provider message type.'}) 
    AdditionalAttributes?: string;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
          
    @Field() 
    @MaxLength(510)
    CommunicationProvider: string;
          
    @Field() 
    @MaxLength(200)
    CommunicationBaseMessageType: string;
        
    @Field(() => [mj_core_schema_server_object_types.CommunicationLog_])
    CommunicationLogsArray: mj_core_schema_server_object_types.CommunicationLog_[]; // Link to CommunicationLogs
    
}
        
//****************************************************************************
// INPUT TYPE for Communication Provider Message Types   
//****************************************************************************
@InputType()
export class CreateCommunicationProviderMessageTypeInput {
    @Field(() => Int)
    CommunicationProviderID: number;

    @Field(() => Int)
    CommunicationBaseMessageTypeID: number;

    @Field()
    Name: string;

    @Field()
    Status: string;

    @Field({ nullable: true })
    AdditionalAttributes?: string;
}
    
        
//****************************************************************************
// INPUT TYPE for Communication Provider Message Types   
//****************************************************************************
@InputType()
export class UpdateCommunicationProviderMessageTypeInput {
    @Field(() => Int)
    ID: number;

    @Field(() => Int)
    CommunicationProviderID: number;

    @Field(() => Int)
    CommunicationBaseMessageTypeID: number;

    @Field()
    Name: string;

    @Field()
    Status: string;

    @Field({ nullable: true })
    AdditionalAttributes?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Communication Provider Message Types
//****************************************************************************
@ObjectType()
export class RunCommunicationProviderMessageTypeViewResult {
    @Field(() => [CommunicationProviderMessageType_])
    Results: CommunicationProviderMessageType_[];

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

@Resolver(CommunicationProviderMessageType_)
export class CommunicationProviderMessageTypeResolver extends ResolverBase {
    @Query(() => RunCommunicationProviderMessageTypeViewResult)
    async RunCommunicationProviderMessageTypeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunCommunicationProviderMessageTypeViewResult)
    async RunCommunicationProviderMessageTypeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunCommunicationProviderMessageTypeViewResult)
    async RunCommunicationProviderMessageTypeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Communication Provider Message Types';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => CommunicationProviderMessageType_, { nullable: true })
    async CommunicationProviderMessageType(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<CommunicationProviderMessageType_ | null> {
        this.CheckUserReadPermissions('Communication Provider Message Types', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwCommunicationProviderMessageTypes] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Communication Provider Message Types', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Communication Provider Message Types', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
      
    @FieldResolver(() => [mj_core_schema_server_object_types.CommunicationLog_])
    async CommunicationLogsArray(@Root() communicationprovidermessagetype_: CommunicationProviderMessageType_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Communication Logs', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwCommunicationLogs] WHERE [CommunicationProviderMessageTypeID]=${communicationprovidermessagetype_.ID} ` + this.getRowLevelSecurityWhereClause('Communication Logs', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Communication Logs', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => CommunicationProviderMessageType_)
    async CreateCommunicationProviderMessageType(
        @Arg('input', () => CreateCommunicationProviderMessageTypeInput) input: CreateCommunicationProviderMessageTypeInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.CreateRecord('Communication Provider Message Types', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => CommunicationProviderMessageType_)
    async UpdateCommunicationProviderMessageType(
        @Arg('input', () => UpdateCommunicationProviderMessageTypeInput) input: UpdateCommunicationProviderMessageTypeInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Communication Provider Message Types', input, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Communication Logs
//****************************************************************************
@ObjectType({ description: 'Logs of sent and received messages.' })
export class CommunicationLog_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field(() => Int) 
    CommunicationProviderID: number;
          
    @Field(() => Int) 
    CommunicationProviderMessageTypeID: number;
          
    @Field(() => Int, {nullable: true}) 
    CommunicationRunID?: number;
          
    @Field({description: 'The direction of the communication log (Sending or Receiving).'}) 
    @MaxLength(40)
    Direction: string;
          
    @Field({description: 'The date and time when the message was logged.'}) 
    @MaxLength(8)
    MessageDate: Date;
          
    @Field({description: 'The status of the logged message (Pending, In-Progress, Complete, Failed).'}) 
    @MaxLength(100)
    Status: string;
          
    @Field({nullable: true, description: 'The content of the logged message.'}) 
    MessageContent?: string;
          
    @Field({nullable: true, description: 'The error message if the message sending failed.'}) 
    ErrorMessage?: string;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
          
    @Field() 
    @MaxLength(510)
    CommunicationProvider: string;
          
    @Field() 
    @MaxLength(510)
    CommunicationProviderMessageType: string;
        
}
        
//****************************************************************************
// INPUT TYPE for Communication Logs   
//****************************************************************************
@InputType()
export class CreateCommunicationLogInput {
    @Field(() => Int)
    CommunicationProviderID: number;

    @Field(() => Int)
    CommunicationProviderMessageTypeID: number;

    @Field(() => Int, { nullable: true })
    CommunicationRunID?: number;

    @Field()
    Direction: string;

    @Field()
    MessageDate: Date;

    @Field()
    Status: string;

    @Field({ nullable: true })
    MessageContent?: string;

    @Field({ nullable: true })
    ErrorMessage?: string;
}
    
        
//****************************************************************************
// INPUT TYPE for Communication Logs   
//****************************************************************************
@InputType()
export class UpdateCommunicationLogInput {
    @Field(() => Int)
    ID: number;

    @Field(() => Int)
    CommunicationProviderID: number;

    @Field(() => Int)
    CommunicationProviderMessageTypeID: number;

    @Field(() => Int, { nullable: true })
    CommunicationRunID?: number;

    @Field()
    Direction: string;

    @Field()
    MessageDate: Date;

    @Field()
    Status: string;

    @Field({ nullable: true })
    MessageContent?: string;

    @Field({ nullable: true })
    ErrorMessage?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Communication Logs
//****************************************************************************
@ObjectType()
export class RunCommunicationLogViewResult {
    @Field(() => [CommunicationLog_])
    Results: CommunicationLog_[];

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

@Resolver(CommunicationLog_)
export class CommunicationLogResolver extends ResolverBase {
    @Query(() => RunCommunicationLogViewResult)
    async RunCommunicationLogViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunCommunicationLogViewResult)
    async RunCommunicationLogViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunCommunicationLogViewResult)
    async RunCommunicationLogDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Communication Logs';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => CommunicationLog_, { nullable: true })
    async CommunicationLog(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<CommunicationLog_ | null> {
        this.CheckUserReadPermissions('Communication Logs', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwCommunicationLogs] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Communication Logs', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Communication Logs', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => CommunicationLog_)
    async CreateCommunicationLog(
        @Arg('input', () => CreateCommunicationLogInput) input: CreateCommunicationLogInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.CreateRecord('Communication Logs', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => CommunicationLog_)
    async UpdateCommunicationLog(
        @Arg('input', () => UpdateCommunicationLogInput) input: UpdateCommunicationLogInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Communication Logs', input, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Communication Base Message Types
//****************************************************************************
@ObjectType({ description: 'Base message types and their supported functionalities.' })
export class CommunicationBaseMessageType_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field() 
    @MaxLength(200)
    Type: string;
          
    @Field(() => Boolean, {description: 'Indicates if attachments are supported.'}) 
    SupportsAttachments: boolean;
          
    @Field(() => Boolean, {description: 'Indicates if a subject line is supported.'}) 
    SupportsSubjectLine: boolean;
          
    @Field(() => Boolean, {description: 'Indicates if HTML content is supported.'}) 
    SupportsHtml: boolean;
          
    @Field(() => Int, {nullable: true, description: 'The maximum size in bytes for the message.'}) 
    MaxBytes?: number;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
        
    @Field(() => [mj_core_schema_server_object_types.CommunicationProviderMessageType_])
    CommunicationProviderMessageTypesArray: mj_core_schema_server_object_types.CommunicationProviderMessageType_[]; // Link to CommunicationProviderMessageTypes
    
}
        
//****************************************************************************
// INPUT TYPE for Communication Base Message Types   
//****************************************************************************
@InputType()
export class CreateCommunicationBaseMessageTypeInput {
    @Field()
    Type: string;

    @Field(() => Boolean)
    SupportsAttachments: boolean;

    @Field(() => Boolean)
    SupportsSubjectLine: boolean;

    @Field(() => Boolean)
    SupportsHtml: boolean;

    @Field(() => Int, { nullable: true })
    MaxBytes?: number;
}
    
        
//****************************************************************************
// INPUT TYPE for Communication Base Message Types   
//****************************************************************************
@InputType()
export class UpdateCommunicationBaseMessageTypeInput {
    @Field(() => Int)
    ID: number;

    @Field()
    Type: string;

    @Field(() => Boolean)
    SupportsAttachments: boolean;

    @Field(() => Boolean)
    SupportsSubjectLine: boolean;

    @Field(() => Boolean)
    SupportsHtml: boolean;

    @Field(() => Int, { nullable: true })
    MaxBytes?: number;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Communication Base Message Types
//****************************************************************************
@ObjectType()
export class RunCommunicationBaseMessageTypeViewResult {
    @Field(() => [CommunicationBaseMessageType_])
    Results: CommunicationBaseMessageType_[];

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

@Resolver(CommunicationBaseMessageType_)
export class CommunicationBaseMessageTypeResolver extends ResolverBase {
    @Query(() => RunCommunicationBaseMessageTypeViewResult)
    async RunCommunicationBaseMessageTypeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunCommunicationBaseMessageTypeViewResult)
    async RunCommunicationBaseMessageTypeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunCommunicationBaseMessageTypeViewResult)
    async RunCommunicationBaseMessageTypeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Communication Base Message Types';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => CommunicationBaseMessageType_, { nullable: true })
    async CommunicationBaseMessageType(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<CommunicationBaseMessageType_ | null> {
        this.CheckUserReadPermissions('Communication Base Message Types', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwCommunicationBaseMessageTypes] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Communication Base Message Types', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Communication Base Message Types', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
      
    @FieldResolver(() => [mj_core_schema_server_object_types.CommunicationProviderMessageType_])
    async CommunicationProviderMessageTypesArray(@Root() communicationbasemessagetype_: CommunicationBaseMessageType_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Communication Provider Message Types', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwCommunicationProviderMessageTypes] WHERE [CommunicationBaseMessageTypeID]=${communicationbasemessagetype_.ID} ` + this.getRowLevelSecurityWhereClause('Communication Provider Message Types', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Communication Provider Message Types', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => CommunicationBaseMessageType_)
    async CreateCommunicationBaseMessageType(
        @Arg('input', () => CreateCommunicationBaseMessageTypeInput) input: CreateCommunicationBaseMessageTypeInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.CreateRecord('Communication Base Message Types', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => CommunicationBaseMessageType_)
    async UpdateCommunicationBaseMessageType(
        @Arg('input', () => UpdateCommunicationBaseMessageTypeInput) input: UpdateCommunicationBaseMessageTypeInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Communication Base Message Types', input, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Templates
//****************************************************************************
@ObjectType({ description: 'Templates are used for dynamic expansion of a static template with data from a given context. Templates can be used to create documents, messages and anything else that requires dynamic document creation merging together static text, data and lightweight logic' })
export class Template_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field({description: 'Name of the template'}) 
    @MaxLength(510)
    Name: string;
          
    @Field({nullable: true, description: 'Description of the template'}) 
    Description?: string;
          
    @Field(() => Int, {nullable: true}) 
    CategoryID?: number;
          
    @Field(() => Int) 
    UserID: number;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
          
    @Field({nullable: true}) 
    @MaxLength(510)
    Category?: string;
          
    @Field() 
    @MaxLength(200)
    User: string;
        
}
        
//****************************************************************************
// INPUT TYPE for Templates   
//****************************************************************************
@InputType()
export class CreateTemplateInput {
    @Field()
    Name: string;

    @Field({ nullable: true })
    Description?: string;

    @Field(() => Int, { nullable: true })
    CategoryID?: number;

    @Field(() => Int)
    UserID: number;
}
    
        
//****************************************************************************
// INPUT TYPE for Templates   
//****************************************************************************
@InputType()
export class UpdateTemplateInput {
    @Field(() => Int)
    ID: number;

    @Field()
    Name: string;

    @Field({ nullable: true })
    Description?: string;

    @Field(() => Int, { nullable: true })
    CategoryID?: number;

    @Field(() => Int)
    UserID: number;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Templates
//****************************************************************************
@ObjectType()
export class RunTemplateViewResult {
    @Field(() => [Template_])
    Results: Template_[];

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

@Resolver(Template_)
export class TemplateResolver extends ResolverBase {
    @Query(() => RunTemplateViewResult)
    async RunTemplateViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunTemplateViewResult)
    async RunTemplateViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunTemplateViewResult)
    async RunTemplateDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Templates';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => Template_, { nullable: true })
    async Template(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Template_ | null> {
        this.CheckUserReadPermissions('Templates', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwTemplates] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Templates', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Templates', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => Template_)
    async CreateTemplate(
        @Arg('input', () => CreateTemplateInput) input: CreateTemplateInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.CreateRecord('Templates', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => Template_)
    async UpdateTemplate(
        @Arg('input', () => UpdateTemplateInput) input: UpdateTemplateInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Templates', input, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Template Categories
//****************************************************************************
@ObjectType({ description: 'Template categories for organizing templates' })
export class TemplateCategory_ {  
    @Field(() => Int) 
    ID: number;
          
    @Field({description: 'Name of the template category'}) 
    @MaxLength(510)
    Name: string;
          
    @Field({nullable: true, description: 'Description of the template category'}) 
    Description?: string;
          
    @Field(() => Int, {nullable: true}) 
    ParentID?: number;
          
    @Field(() => Int) 
    UserID: number;
          
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
          
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
          
    @Field({nullable: true}) 
    @MaxLength(510)
    Parent?: string;
          
    @Field() 
    @MaxLength(200)
    User: string;
        
    @Field(() => [mj_core_schema_server_object_types.Template_])
    TemplatesArray: mj_core_schema_server_object_types.Template_[]; // Link to Templates
    
    @Field(() => [mj_core_schema_server_object_types.TemplateCategory_])
    TemplateCategoriesArray: mj_core_schema_server_object_types.TemplateCategory_[]; // Link to TemplateCategories
    
}
        
//****************************************************************************
// INPUT TYPE for Template Categories   
//****************************************************************************
@InputType()
export class CreateTemplateCategoryInput {
    @Field()
    Name: string;

    @Field({ nullable: true })
    Description?: string;

    @Field(() => Int, { nullable: true })
    ParentID?: number;

    @Field(() => Int)
    UserID: number;
}
    
        
//****************************************************************************
// INPUT TYPE for Template Categories   
//****************************************************************************
@InputType()
export class UpdateTemplateCategoryInput {
    @Field(() => Int)
    ID: number;

    @Field()
    Name: string;

    @Field({ nullable: true })
    Description?: string;

    @Field(() => Int, { nullable: true })
    ParentID?: number;

    @Field(() => Int)
    UserID: number;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Template Categories
//****************************************************************************
@ObjectType()
export class RunTemplateCategoryViewResult {
    @Field(() => [TemplateCategory_])
    Results: TemplateCategory_[];

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

@Resolver(TemplateCategory_)
export class TemplateCategoryResolver extends ResolverBase {
    @Query(() => RunTemplateCategoryViewResult)
    async RunTemplateCategoryViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunTemplateCategoryViewResult)
    async RunTemplateCategoryViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunTemplateCategoryViewResult)
    async RunTemplateCategoryDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Template Categories';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => TemplateCategory_, { nullable: true })
    async TemplateCategory(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<TemplateCategory_ | null> {
        this.CheckUserReadPermissions('Template Categories', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwTemplateCategories] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Template Categories', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Template Categories', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
      
    @FieldResolver(() => [mj_core_schema_server_object_types.Template_])
    async TemplatesArray(@Root() templatecategory_: TemplateCategory_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Templates', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwTemplates] WHERE [CategoryID]=${templatecategory_.ID} ` + this.getRowLevelSecurityWhereClause('Templates', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Templates', await dataSource.query(sSQL));
        return result;
    }
          
    @FieldResolver(() => [mj_core_schema_server_object_types.TemplateCategory_])
    async TemplateCategoriesArray(@Root() templatecategory_: TemplateCategory_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Template Categories', userPayload);
        const sSQL = `SELECT * FROM [${Metadata.Provider.ConfigData.MJCoreSchemaName}].[vwTemplateCategories] WHERE [ParentID]=${templatecategory_.ID} ` + this.getRowLevelSecurityWhereClause('Template Categories', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Template Categories', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => TemplateCategory_)
    async CreateTemplateCategory(
        @Arg('input', () => CreateTemplateCategoryInput) input: CreateTemplateCategoryInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.CreateRecord('Template Categories', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => TemplateCategory_)
    async UpdateTemplateCategory(
        @Arg('input', () => UpdateTemplateCategoryInput) input: UpdateTemplateCategoryInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Template Categories', input, dataSource, userPayload, pubSub);
    }
    
}