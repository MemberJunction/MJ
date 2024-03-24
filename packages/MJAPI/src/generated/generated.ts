/********************************************************************************
* ALL ENTITIES - TypeGraphQL Type Class Definition - AUTO GENERATED FILE
* Generated Entities and Resolvers for Server
* 
* GENERATED: 3/23/2024, 4:22:49 PM
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

import * as mj_core_schema_server_object_types from '@memberjunction/server'

import { IndustryEntity, ContactRoleEntity, ContactLevelEntity, AccountEntity, ContactEntity, DealStageEntity, ActivityEntity, DealForecastCategoryEntity, DealEntity, DealTypeEntity, InvoiceEntity, ActivityAttachmentEntity, PaymentTermsTypeEntity, InvoiceStatusTypeEntity } from 'mj_generatedentities';


//****************************************************************************
// ENTITY CLASS for Industries
//****************************************************************************
@ObjectType()
export class Industry_ {  
    @Field(() => Int) 
    ID: number;
      
    @Field() 
    @MaxLength(40)
    Name: string;
      
    @Field() 
    @MaxLength(400)
    Description: string;
      
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
      
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
      
    @Field({nullable: true}) 
    Keywords?: string;
    
    @Field(() => [Account_])
    AccountsArray: Account_[]; // Link to Accounts

}
        
//****************************************************************************
// INPUT TYPE for Industries   
//****************************************************************************
@InputType()
export class CreateIndustryInput {
    @Field()
    Name: string;

    @Field()
    Description: string;

    @Field({ nullable: true })
    Keywords: string;
}

        
//****************************************************************************
// INPUT TYPE for Industries   
//****************************************************************************
@InputType()
export class UpdateIndustryInput {
    @Field(() => Int)
    ID: number;

    @Field()
    Name: string;

    @Field()
    Description: string;

    @Field({ nullable: true })
    Keywords: string;
}

//****************************************************************************
// RESOLVER for Industries
//****************************************************************************
@ObjectType()
export class RunIndustryViewResult {
    @Field(() => [Industry_])
    Results: Industry_[];

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

@Resolver(Industry_)
export class IndustryResolver extends ResolverBase {
    @Query(() => RunIndustryViewResult)
    async RunIndustryViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunIndustryViewResult)
    async RunIndustryViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunIndustryViewResult)
    async RunIndustryDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Industries';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => Industry_, { nullable: true })
    async Industry(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Industry_ | null> {
        this.CheckUserReadPermissions('Industries', userPayload);
        const sSQL = `SELECT * FROM [reference].[vwIndustries] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Industries', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Industries', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
  
    @FieldResolver(() => [Account_])
    async AccountsArray(@Root() industry_: Industry_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Accounts', userPayload);
        const sSQL = `SELECT * FROM [crm].[vwAccounts] WHERE [IndustryID]=${industry_.ID} ` + this.getRowLevelSecurityWhereClause('Accounts', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Accounts', await dataSource.query(sSQL));
        return result;
    }
    
    @Mutation(() => Industry_)
    async CreateIndustry(
        @Arg('input', () => CreateIndustryInput) input: CreateIndustryInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <IndustryEntity>await new Metadata().GetEntityObject('Industries', this.GetUserFromPayload(userPayload));
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
    protected async BeforeCreate(dataSource: DataSource, input: CreateIndustryInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateIndustryInput) {
    }
    
    @Mutation(() => Industry_)
    async UpdateIndustry(
        @Arg('input', () => UpdateIndustryInput) input: UpdateIndustryInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <IndustryEntity>await new Metadata().GetEntityObject('Industries', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for Industries
            
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
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateIndustryInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateIndustryInput) {
        const i = input, d = dataSource; // prevent error
    }

}

//****************************************************************************
// ENTITY CLASS for Contact Roles
//****************************************************************************
@ObjectType()
export class ContactRole_ {  
    @Field(() => Int) 
    ID: number;
      
    @Field() 
    @MaxLength(100)
    Name: string;
      
    @Field({nullable: true}) 
    Description?: string;
      
    @Field({nullable: true}) 
    Keywords?: string;
      
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
      
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
    
    @Field(() => [Contact_])
    ContactsArray: Contact_[]; // Link to Contacts

}
        
//****************************************************************************
// INPUT TYPE for Contact Roles   
//****************************************************************************
@InputType()
export class CreateContactRoleInput {
    @Field()
    Name: string;

    @Field({ nullable: true })
    Description: string;

    @Field({ nullable: true })
    Keywords: string;
}

        
//****************************************************************************
// INPUT TYPE for Contact Roles   
//****************************************************************************
@InputType()
export class UpdateContactRoleInput {
    @Field(() => Int)
    ID: number;

    @Field()
    Name: string;

    @Field({ nullable: true })
    Description: string;

    @Field({ nullable: true })
    Keywords: string;
}

//****************************************************************************
// RESOLVER for Contact Roles
//****************************************************************************
@ObjectType()
export class RunContactRoleViewResult {
    @Field(() => [ContactRole_])
    Results: ContactRole_[];

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

@Resolver(ContactRole_)
export class ContactRoleResolver extends ResolverBase {
    @Query(() => RunContactRoleViewResult)
    async RunContactRoleViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunContactRoleViewResult)
    async RunContactRoleViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunContactRoleViewResult)
    async RunContactRoleDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Contact Roles';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => ContactRole_, { nullable: true })
    async ContactRole(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<ContactRole_ | null> {
        this.CheckUserReadPermissions('Contact Roles', userPayload);
        const sSQL = `SELECT * FROM [reference].[vwContactRoles] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Contact Roles', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Contact Roles', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
  
    @FieldResolver(() => [Contact_])
    async ContactsArray(@Root() contactrole_: ContactRole_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Contacts', userPayload);
        const sSQL = `SELECT * FROM [crm].[vwContacts] WHERE [RoleID]=${contactrole_.ID} ` + this.getRowLevelSecurityWhereClause('Contacts', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Contacts', await dataSource.query(sSQL));
        return result;
    }
    
    @Mutation(() => ContactRole_)
    async CreateContactRole(
        @Arg('input', () => CreateContactRoleInput) input: CreateContactRoleInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <ContactRoleEntity>await new Metadata().GetEntityObject('Contact Roles', this.GetUserFromPayload(userPayload));
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
    protected async BeforeCreate(dataSource: DataSource, input: CreateContactRoleInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateContactRoleInput) {
    }
    
    @Mutation(() => ContactRole_)
    async UpdateContactRole(
        @Arg('input', () => UpdateContactRoleInput) input: UpdateContactRoleInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <ContactRoleEntity>await new Metadata().GetEntityObject('Contact Roles', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for Contact Roles
            
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
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateContactRoleInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateContactRoleInput) {
        const i = input, d = dataSource; // prevent error
    }

}

//****************************************************************************
// ENTITY CLASS for Contact Levels
//****************************************************************************
@ObjectType()
export class ContactLevel_ {  
    @Field(() => Int) 
    ID: number;
      
    @Field() 
    @MaxLength(100)
    Name: string;
      
    @Field({nullable: true}) 
    Description?: string;
      
    @Field(() => Int) 
    Rank: number;
      
    @Field({nullable: true}) 
    Keywords?: string;
      
    @Field({nullable: true}) 
    ExcludeKeywords?: string;
      
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
      
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
    
    @Field(() => [Contact_])
    ContactsArray: Contact_[]; // Link to Contacts

}
        
//****************************************************************************
// INPUT TYPE for Contact Levels   
//****************************************************************************
@InputType()
export class CreateContactLevelInput {
    @Field()
    Name: string;

    @Field({ nullable: true })
    Description: string;

    @Field(() => Int)
    Rank: number;

    @Field({ nullable: true })
    Keywords: string;

    @Field({ nullable: true })
    ExcludeKeywords: string;
}

        
//****************************************************************************
// INPUT TYPE for Contact Levels   
//****************************************************************************
@InputType()
export class UpdateContactLevelInput {
    @Field(() => Int)
    ID: number;

    @Field()
    Name: string;

    @Field({ nullable: true })
    Description: string;

    @Field(() => Int)
    Rank: number;

    @Field({ nullable: true })
    Keywords: string;

    @Field({ nullable: true })
    ExcludeKeywords: string;
}

//****************************************************************************
// RESOLVER for Contact Levels
//****************************************************************************
@ObjectType()
export class RunContactLevelViewResult {
    @Field(() => [ContactLevel_])
    Results: ContactLevel_[];

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

@Resolver(ContactLevel_)
export class ContactLevelResolver extends ResolverBase {
    @Query(() => RunContactLevelViewResult)
    async RunContactLevelViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunContactLevelViewResult)
    async RunContactLevelViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunContactLevelViewResult)
    async RunContactLevelDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Contact Levels';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => ContactLevel_, { nullable: true })
    async ContactLevel(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<ContactLevel_ | null> {
        this.CheckUserReadPermissions('Contact Levels', userPayload);
        const sSQL = `SELECT * FROM [reference].[vwContactLevels] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Contact Levels', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Contact Levels', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
  
    @FieldResolver(() => [Contact_])
    async ContactsArray(@Root() contactlevel_: ContactLevel_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Contacts', userPayload);
        const sSQL = `SELECT * FROM [crm].[vwContacts] WHERE [LevelID]=${contactlevel_.ID} ` + this.getRowLevelSecurityWhereClause('Contacts', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Contacts', await dataSource.query(sSQL));
        return result;
    }
    
    @Mutation(() => ContactLevel_)
    async CreateContactLevel(
        @Arg('input', () => CreateContactLevelInput) input: CreateContactLevelInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <ContactLevelEntity>await new Metadata().GetEntityObject('Contact Levels', this.GetUserFromPayload(userPayload));
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
    protected async BeforeCreate(dataSource: DataSource, input: CreateContactLevelInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateContactLevelInput) {
    }
    
    @Mutation(() => ContactLevel_)
    async UpdateContactLevel(
        @Arg('input', () => UpdateContactLevelInput) input: UpdateContactLevelInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <ContactLevelEntity>await new Metadata().GetEntityObject('Contact Levels', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for Contact Levels
            
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
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateContactLevelInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateContactLevelInput) {
        const i = input, d = dataSource; // prevent error
    }

}

//****************************************************************************
// ENTITY CLASS for Accounts
//****************************************************************************
@ObjectType()
export class Account_ {  
    @Field(() => Int) 
    ID: number;
      
    @Field() 
    @MaxLength(16)
    BCMID: string;
      
    @Field() 
    @MaxLength(510)
    Name: string;
      
    @Field({nullable: true}) 
    @MaxLength(100)
    TaxID?: string;
      
    @Field({nullable: true}) 
    @MaxLength(40)
    Acronym?: string;
      
    @Field({nullable: true}) 
    @MaxLength(510)
    OperatingName?: string;
      
    @Field({nullable: true}) 
    @MaxLength(500)
    DisplayName?: string;
      
    @Field({nullable: true}) 
    Description?: string;
      
    @Field({nullable: true}) 
    @MaxLength(200)
    AddressLine1?: string;
      
    @Field({nullable: true}) 
    @MaxLength(200)
    AddressLine2?: string;
      
    @Field({nullable: true}) 
    @MaxLength(200)
    AddressLine3?: string;
      
    @Field({nullable: true}) 
    @MaxLength(200)
    City?: string;
      
    @Field({nullable: true}) 
    @MaxLength(100)
    StateProvince?: string;
      
    @Field({nullable: true}) 
    @MaxLength(40)
    PostalCode?: string;
      
    @Field({nullable: true}) 
    @MaxLength(200)
    Country?: string;
      
    @Field({nullable: true}) 
    @MaxLength(10)
    ISOCountryCode?: string;
      
    @Field({nullable: true}) 
    @MaxLength(510)
    Domain?: string;
      
    @Field({nullable: true}) 
    @MaxLength(510)
    Website?: string;
      
    @Field({nullable: true}) 
    @MaxLength(510)
    EmailPattern?: string;
      
    @Field({nullable: true}) 
    @MaxLength(1000)
    LogoURL?: string;
      
    @Field({nullable: true}) 
    @MaxLength(510)
    LeadershipPageURL?: string;
      
    @Field({nullable: true}) 
    @MaxLength(100)
    PhoneNumber?: string;
      
    @Field({nullable: true}) 
    @MaxLength(510)
    LinkedIn?: string;
      
    @Field({nullable: true}) 
    @MaxLength(510)
    Facebook?: string;
      
    @Field({nullable: true}) 
    @MaxLength(510)
    Logo?: string;
      
    @Field(() => Int, {nullable: true}) 
    IndustryID?: number;
      
    @Field({nullable: true}) 
    @MaxLength(8)
    LastReviewedDate?: Date;
      
    @Field(() => Int) 
    ActivityCount: number;
      
    @Field({nullable: true}) 
    @MaxLength(8)
    LatestActivityDate?: Date;
      
    @Field({nullable: true}) 
    @MaxLength(8)
    EarliestActivityDate?: Date;
      
    @Field({nullable: true}) 
    @MaxLength(100)
    RecordSource?: string;
      
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
      
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
      
    @Field({nullable: true}) 
    @MaxLength(8)
    LastEnrichedAt?: Date;
    
    @Field(() => [Contact_])
    ContactsArray: Contact_[]; // Link to Contacts

    @Field(() => [Activity_])
    ActivitiesArray: Activity_[]; // Link to Activities

    @Field(() => [Deal_])
    DealsArray: Deal_[]; // Link to Deals

    @Field(() => [Invoice_])
    InvoicesArray: Invoice_[]; // Link to Invoices

}
        
//****************************************************************************
// INPUT TYPE for Accounts   
//****************************************************************************
@InputType()
export class CreateAccountInput {
    @Field()
    Name: string;

    @Field({ nullable: true })
    TaxID: string;

    @Field({ nullable: true })
    Acronym: string;

    @Field({ nullable: true })
    OperatingName: string;

    @Field({ nullable: true })
    DisplayName: string;

    @Field({ nullable: true })
    Description: string;

    @Field({ nullable: true })
    AddressLine1: string;

    @Field({ nullable: true })
    AddressLine2: string;

    @Field({ nullable: true })
    AddressLine3: string;

    @Field({ nullable: true })
    City: string;

    @Field({ nullable: true })
    StateProvince: string;

    @Field({ nullable: true })
    PostalCode: string;

    @Field({ nullable: true })
    Country: string;

    @Field({ nullable: true })
    ISOCountryCode: string;

    @Field({ nullable: true })
    Domain: string;

    @Field({ nullable: true })
    Website: string;

    @Field({ nullable: true })
    EmailPattern: string;

    @Field({ nullable: true })
    LogoURL: string;

    @Field({ nullable: true })
    LeadershipPageURL: string;

    @Field({ nullable: true })
    PhoneNumber: string;

    @Field({ nullable: true })
    LinkedIn: string;

    @Field({ nullable: true })
    Facebook: string;

    @Field({ nullable: true })
    Logo: string;

    @Field(() => Int, { nullable: true })
    IndustryID: number;

    @Field({ nullable: true })
    LastReviewedDate: Date;

    @Field(() => Int)
    ActivityCount: number;

    @Field({ nullable: true })
    LatestActivityDate: Date;

    @Field({ nullable: true })
    EarliestActivityDate: Date;

    @Field({ nullable: true })
    RecordSource: string;

    @Field({ nullable: true })
    LastEnrichedAt: Date;
}

        
//****************************************************************************
// INPUT TYPE for Accounts   
//****************************************************************************
@InputType()
export class UpdateAccountInput {
    @Field(() => Int)
    ID: number;

    @Field()
    Name: string;

    @Field({ nullable: true })
    TaxID: string;

    @Field({ nullable: true })
    Acronym: string;

    @Field({ nullable: true })
    OperatingName: string;

    @Field({ nullable: true })
    DisplayName: string;

    @Field({ nullable: true })
    Description: string;

    @Field({ nullable: true })
    AddressLine1: string;

    @Field({ nullable: true })
    AddressLine2: string;

    @Field({ nullable: true })
    AddressLine3: string;

    @Field({ nullable: true })
    City: string;

    @Field({ nullable: true })
    StateProvince: string;

    @Field({ nullable: true })
    PostalCode: string;

    @Field({ nullable: true })
    Country: string;

    @Field({ nullable: true })
    ISOCountryCode: string;

    @Field({ nullable: true })
    Domain: string;

    @Field({ nullable: true })
    Website: string;

    @Field({ nullable: true })
    EmailPattern: string;

    @Field({ nullable: true })
    LogoURL: string;

    @Field({ nullable: true })
    LeadershipPageURL: string;

    @Field({ nullable: true })
    PhoneNumber: string;

    @Field({ nullable: true })
    LinkedIn: string;

    @Field({ nullable: true })
    Facebook: string;

    @Field({ nullable: true })
    Logo: string;

    @Field(() => Int, { nullable: true })
    IndustryID: number;

    @Field({ nullable: true })
    LastReviewedDate: Date;

    @Field(() => Int)
    ActivityCount: number;

    @Field({ nullable: true })
    LatestActivityDate: Date;

    @Field({ nullable: true })
    EarliestActivityDate: Date;

    @Field({ nullable: true })
    RecordSource: string;

    @Field({ nullable: true })
    LastEnrichedAt: Date;
}

//****************************************************************************
// RESOLVER for Accounts
//****************************************************************************
@ObjectType()
export class RunAccountViewResult {
    @Field(() => [Account_])
    Results: Account_[];

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

@Resolver(Account_)
export class AccountResolver extends ResolverBase {
    @Query(() => RunAccountViewResult)
    async RunAccountViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunAccountViewResult)
    async RunAccountViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunAccountViewResult)
    async RunAccountDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Accounts';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => Account_, { nullable: true })
    async Account(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Account_ | null> {
        this.CheckUserReadPermissions('Accounts', userPayload);
        const sSQL = `SELECT * FROM [crm].[vwAccounts] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Accounts', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Accounts', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
  
    @FieldResolver(() => [Contact_])
    async ContactsArray(@Root() account_: Account_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Contacts', userPayload);
        const sSQL = `SELECT * FROM [crm].[vwContacts] WHERE [AccountID]=${account_.ID} ` + this.getRowLevelSecurityWhereClause('Contacts', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Contacts', await dataSource.query(sSQL));
        return result;
    }
      
    @FieldResolver(() => [Activity_])
    async ActivitiesArray(@Root() account_: Account_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Activities', userPayload);
        const sSQL = `SELECT * FROM [crm].[vwActivities] WHERE [AccountID]=${account_.ID} ` + this.getRowLevelSecurityWhereClause('Activities', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Activities', await dataSource.query(sSQL));
        return result;
    }
      
    @FieldResolver(() => [Deal_])
    async DealsArray(@Root() account_: Account_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Deals', userPayload);
        const sSQL = `SELECT * FROM [crm].[vwDeals] WHERE [AccountID]=${account_.ID} ` + this.getRowLevelSecurityWhereClause('Deals', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Deals', await dataSource.query(sSQL));
        return result;
    }
      
    @FieldResolver(() => [Invoice_])
    async InvoicesArray(@Root() account_: Account_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Invoices', userPayload);
        const sSQL = `SELECT * FROM [crm].[vwInvoices] WHERE [AccountID]=${account_.ID} ` + this.getRowLevelSecurityWhereClause('Invoices', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Invoices', await dataSource.query(sSQL));
        return result;
    }
    
    @Mutation(() => Account_)
    async CreateAccount(
        @Arg('input', () => CreateAccountInput) input: CreateAccountInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <AccountEntity>await new Metadata().GetEntityObject('Accounts', this.GetUserFromPayload(userPayload));
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
    protected async BeforeCreate(dataSource: DataSource, input: CreateAccountInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateAccountInput) {
    }
    
    @Mutation(() => Account_)
    async UpdateAccount(
        @Arg('input', () => UpdateAccountInput) input: UpdateAccountInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <AccountEntity>await new Metadata().GetEntityObject('Accounts', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for Accounts
            
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
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateAccountInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateAccountInput) {
        const i = input, d = dataSource; // prevent error
    }

    @Mutation(() => Account_)
    async DeleteAccount(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        if (await this.BeforeDelete(dataSource, ID)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <AccountEntity>await new Metadata().GetEntityObject('Accounts', this.GetUserFromPayload(userPayload));
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
// ENTITY CLASS for Contacts
//****************************************************************************
@ObjectType()
export class Contact_ {  
    @Field(() => Int) 
    ID: number;
      
    @Field() 
    @MaxLength(16)
    BCMID: string;
      
    @Field() 
    @MaxLength(200)
    FirstName: string;
      
    @Field({nullable: true}) 
    @MaxLength(100)
    NickName?: string;
      
    @Field() 
    @MaxLength(200)
    LastName: string;
      
    @Field(() => Int, {nullable: true}) 
    AccountID?: number;
      
    @Field({nullable: true}) 
    @MaxLength(8)
    LastReviewedDate?: Date;
      
    @Field({nullable: true}) 
    @MaxLength(400)
    Title?: string;
      
    @Field({nullable: true}) 
    @MaxLength(200)
    Email1?: string;
      
    @Field({nullable: true}) 
    @MaxLength(200)
    Email2?: string;
      
    @Field({nullable: true}) 
    @MaxLength(100)
    EmailSource?: string;
      
    @Field({nullable: true}) 
    @MaxLength(100)
    PhoneNumber?: string;
      
    @Field({nullable: true}) 
    @MaxLength(1000)
    ProfilePictureURL?: string;
      
    @Field({nullable: true}) 
    @MaxLength(510)
    Twitter?: string;
      
    @Field({nullable: true}) 
    @MaxLength(510)
    Instagram?: string;
      
    @Field({nullable: true}) 
    @MaxLength(1000)
    LinkedIn?: string;
      
    @Field({nullable: true}) 
    @MaxLength(510)
    Facebook?: string;
      
    @Field({nullable: true}) 
    @MaxLength(510)
    EmailStatus?: string;
      
    @Field(() => Int, {nullable: true}) 
    RoleID?: number;
      
    @Field(() => Int, {nullable: true}) 
    LevelID?: number;
      
    @Field({nullable: true}) 
    @MaxLength(40)
    Prefix?: string;
      
    @Field({nullable: true}) 
    @MaxLength(500)
    Suffix?: string;
      
    @Field({nullable: true}) 
    Tags?: string;
      
    @Field({nullable: true}) 
    @MaxLength(40)
    Status?: string;
      
    @Field(() => Int) 
    ActivityCount: number;
      
    @Field({nullable: true}) 
    @MaxLength(8)
    LatestActivityDate?: Date;
      
    @Field({nullable: true}) 
    @MaxLength(8)
    EarliestActivityDate?: Date;
      
    @Field({nullable: true}) 
    @MaxLength(100)
    RecordSource?: string;
      
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
      
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
      
    @Field({nullable: true}) 
    @MaxLength(8)
    LastEnrichedAt?: Date;
      
    @Field({nullable: true}) 
    @MaxLength(510)
    Account?: string;
    
    @Field(() => [Invoice_])
    InvoicesArray: Invoice_[]; // Link to Invoices

    @Field(() => [Deal_])
    DealsArray: Deal_[]; // Link to Deals

    @Field(() => [Activity_])
    ActivitiesArray: Activity_[]; // Link to Activities

}
        
//****************************************************************************
// INPUT TYPE for Contacts   
//****************************************************************************
@InputType()
export class CreateContactInput {
    @Field()
    FirstName: string;

    @Field({ nullable: true })
    NickName: string;

    @Field()
    LastName: string;

    @Field(() => Int, { nullable: true })
    AccountID: number;

    @Field({ nullable: true })
    LastReviewedDate: Date;

    @Field({ nullable: true })
    Title: string;

    @Field({ nullable: true })
    Email1: string;

    @Field({ nullable: true })
    Email2: string;

    @Field({ nullable: true })
    EmailSource: string;

    @Field({ nullable: true })
    PhoneNumber: string;

    @Field({ nullable: true })
    ProfilePictureURL: string;

    @Field({ nullable: true })
    Twitter: string;

    @Field({ nullable: true })
    Instagram: string;

    @Field({ nullable: true })
    LinkedIn: string;

    @Field({ nullable: true })
    Facebook: string;

    @Field({ nullable: true })
    EmailStatus: string;

    @Field(() => Int, { nullable: true })
    RoleID: number;

    @Field(() => Int, { nullable: true })
    LevelID: number;

    @Field({ nullable: true })
    Prefix: string;

    @Field({ nullable: true })
    Suffix: string;

    @Field({ nullable: true })
    Tags: string;

    @Field({ nullable: true })
    Status: string;

    @Field(() => Int)
    ActivityCount: number;

    @Field({ nullable: true })
    LatestActivityDate: Date;

    @Field({ nullable: true })
    EarliestActivityDate: Date;

    @Field({ nullable: true })
    RecordSource: string;

    @Field({ nullable: true })
    LastEnrichedAt: Date;
}

        
//****************************************************************************
// INPUT TYPE for Contacts   
//****************************************************************************
@InputType()
export class UpdateContactInput {
    @Field(() => Int)
    ID: number;

    @Field()
    FirstName: string;

    @Field({ nullable: true })
    NickName: string;

    @Field()
    LastName: string;

    @Field(() => Int, { nullable: true })
    AccountID: number;

    @Field({ nullable: true })
    LastReviewedDate: Date;

    @Field({ nullable: true })
    Title: string;

    @Field({ nullable: true })
    Email1: string;

    @Field({ nullable: true })
    Email2: string;

    @Field({ nullable: true })
    EmailSource: string;

    @Field({ nullable: true })
    PhoneNumber: string;

    @Field({ nullable: true })
    ProfilePictureURL: string;

    @Field({ nullable: true })
    Twitter: string;

    @Field({ nullable: true })
    Instagram: string;

    @Field({ nullable: true })
    LinkedIn: string;

    @Field({ nullable: true })
    Facebook: string;

    @Field({ nullable: true })
    EmailStatus: string;

    @Field(() => Int, { nullable: true })
    RoleID: number;

    @Field(() => Int, { nullable: true })
    LevelID: number;

    @Field({ nullable: true })
    Prefix: string;

    @Field({ nullable: true })
    Suffix: string;

    @Field({ nullable: true })
    Tags: string;

    @Field({ nullable: true })
    Status: string;

    @Field(() => Int)
    ActivityCount: number;

    @Field({ nullable: true })
    LatestActivityDate: Date;

    @Field({ nullable: true })
    EarliestActivityDate: Date;

    @Field({ nullable: true })
    RecordSource: string;

    @Field({ nullable: true })
    LastEnrichedAt: Date;
}

//****************************************************************************
// RESOLVER for Contacts
//****************************************************************************
@ObjectType()
export class RunContactViewResult {
    @Field(() => [Contact_])
    Results: Contact_[];

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

@Resolver(Contact_)
export class ContactResolver extends ResolverBase {
    @Query(() => RunContactViewResult)
    async RunContactViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunContactViewResult)
    async RunContactViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunContactViewResult)
    async RunContactDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Contacts';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => Contact_, { nullable: true })
    async Contact(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Contact_ | null> {
        this.CheckUserReadPermissions('Contacts', userPayload);
        const sSQL = `SELECT * FROM [crm].[vwContacts] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Contacts', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Contacts', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
  
    @FieldResolver(() => [Invoice_])
    async InvoicesArray(@Root() contact_: Contact_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Invoices', userPayload);
        const sSQL = `SELECT * FROM [crm].[vwInvoices] WHERE [ContactID]=${contact_.ID} ` + this.getRowLevelSecurityWhereClause('Invoices', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Invoices', await dataSource.query(sSQL));
        return result;
    }
      
    @FieldResolver(() => [Deal_])
    async DealsArray(@Root() contact_: Contact_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Deals', userPayload);
        const sSQL = `SELECT * FROM [crm].[vwDeals] WHERE [ContactID]=${contact_.ID} ` + this.getRowLevelSecurityWhereClause('Deals', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Deals', await dataSource.query(sSQL));
        return result;
    }
      
    @FieldResolver(() => [Activity_])
    async ActivitiesArray(@Root() contact_: Contact_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Activities', userPayload);
        const sSQL = `SELECT * FROM [crm].[vwActivities] WHERE [ContactID]=${contact_.ID} ` + this.getRowLevelSecurityWhereClause('Activities', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Activities', await dataSource.query(sSQL));
        return result;
    }
    
    @Mutation(() => Contact_)
    async CreateContact(
        @Arg('input', () => CreateContactInput) input: CreateContactInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <ContactEntity>await new Metadata().GetEntityObject('Contacts', this.GetUserFromPayload(userPayload));
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
    protected async BeforeCreate(dataSource: DataSource, input: CreateContactInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateContactInput) {
    }
    
    @Mutation(() => Contact_)
    async UpdateContact(
        @Arg('input', () => UpdateContactInput) input: UpdateContactInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <ContactEntity>await new Metadata().GetEntityObject('Contacts', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for Contacts
            
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
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateContactInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateContactInput) {
        const i = input, d = dataSource; // prevent error
    }

}

//****************************************************************************
// ENTITY CLASS for Deal Stages
//****************************************************************************
@ObjectType()
export class DealStage_ {  
    @Field(() => Int) 
    ID: number;
      
    @Field() 
    @MaxLength(40)
    Name: string;
      
    @Field() 
    @MaxLength(400)
    Description: string;
      
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
      
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
    
    @Field(() => [Deal_])
    DealsArray: Deal_[]; // Link to Deals

}
        
//****************************************************************************
// INPUT TYPE for Deal Stages   
//****************************************************************************
@InputType()
export class CreateDealStageInput {
    @Field()
    Name: string;

    @Field()
    Description: string;
}

        
//****************************************************************************
// INPUT TYPE for Deal Stages   
//****************************************************************************
@InputType()
export class UpdateDealStageInput {
    @Field(() => Int)
    ID: number;

    @Field()
    Name: string;

    @Field()
    Description: string;
}

//****************************************************************************
// RESOLVER for Deal Stages
//****************************************************************************
@ObjectType()
export class RunDealStageViewResult {
    @Field(() => [DealStage_])
    Results: DealStage_[];

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

@Resolver(DealStage_)
export class DealStageResolver extends ResolverBase {
    @Query(() => RunDealStageViewResult)
    async RunDealStageViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunDealStageViewResult)
    async RunDealStageViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunDealStageViewResult)
    async RunDealStageDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Deal Stages';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => DealStage_, { nullable: true })
    async DealStage(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<DealStage_ | null> {
        this.CheckUserReadPermissions('Deal Stages', userPayload);
        const sSQL = `SELECT * FROM [crm].[vwDealStages] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Deal Stages', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Deal Stages', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
  
    @FieldResolver(() => [Deal_])
    async DealsArray(@Root() dealstage_: DealStage_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Deals', userPayload);
        const sSQL = `SELECT * FROM [crm].[vwDeals] WHERE [DealStageID]=${dealstage_.ID} ` + this.getRowLevelSecurityWhereClause('Deals', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Deals', await dataSource.query(sSQL));
        return result;
    }
    
    @Mutation(() => DealStage_)
    async CreateDealStage(
        @Arg('input', () => CreateDealStageInput) input: CreateDealStageInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <DealStageEntity>await new Metadata().GetEntityObject('Deal Stages', this.GetUserFromPayload(userPayload));
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
    protected async BeforeCreate(dataSource: DataSource, input: CreateDealStageInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateDealStageInput) {
    }
    
    @Mutation(() => DealStage_)
    async UpdateDealStage(
        @Arg('input', () => UpdateDealStageInput) input: UpdateDealStageInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <DealStageEntity>await new Metadata().GetEntityObject('Deal Stages', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for Deal Stages
            
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
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateDealStageInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateDealStageInput) {
        const i = input, d = dataSource; // prevent error
    }

}

//****************************************************************************
// ENTITY CLASS for Activities
//****************************************************************************
@ObjectType()
export class Activity_ {  
    @Field(() => Int) 
    ID: number;
      
    @Field() 
    @MaxLength(16)
    BCMID: string;
      
    @Field(() => Int, {nullable: true}) 
    EmployeeID?: number;
      
    @Field(() => Int, {nullable: true}) 
    ContactID?: number;
      
    @Field(() => Int, {nullable: true}) 
    AccountID?: number;
      
    @Field(() => Int, {nullable: true}) 
    DealID?: number;
      
    @Field({nullable: true}) 
    @MaxLength(8)
    ActivityDate?: Date;
      
    @Field(() => Boolean, {nullable: true}) 
    IsActive?: boolean;
      
    @Field({nullable: true}) 
    Description?: string;
      
    @Field({nullable: true}) 
    @MaxLength(60)
    Type?: string;
      
    @Field({nullable: true}) 
    @MaxLength(510)
    Attachment?: string;
      
    @Field(() => Int) 
    CompanyIntegrationID: number;
      
    @Field({nullable: true}) 
    @MaxLength(200)
    ExternalSystemRecordID?: string;
      
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
      
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
      
    @Field(() => Int, {nullable: true}) 
    AttachmentID?: number;
      
    @Field({nullable: true}) 
    @MaxLength(510)
    Title?: string;
      
    @Field(() => Boolean, {nullable: true}) 
    IsOpened?: boolean;
      
    @Field(() => Boolean, {nullable: true}) 
    IsBounced?: boolean;
      
    @Field(() => Boolean, {nullable: true}) 
    IsReplied?: boolean;
      
    @Field({nullable: true}) 
    Summary?: string;
      
    @Field({nullable: true}) 
    @MaxLength(510)
    Account?: string;
    
}
        
//****************************************************************************
// INPUT TYPE for Activities   
//****************************************************************************
@InputType()
export class CreateActivityInput {
    @Field(() => Int, { nullable: true })
    EmployeeID: number;

    @Field(() => Int, { nullable: true })
    ContactID: number;

    @Field(() => Int, { nullable: true })
    AccountID: number;

    @Field(() => Int, { nullable: true })
    DealID: number;

    @Field({ nullable: true })
    ActivityDate: Date;

    @Field(() => Boolean, { nullable: true })
    IsActive: boolean;

    @Field({ nullable: true })
    Description: string;

    @Field({ nullable: true })
    Type: string;

    @Field({ nullable: true })
    Attachment: string;

    @Field(() => Int)
    CompanyIntegrationID: number;

    @Field({ nullable: true })
    ExternalSystemRecordID: string;

    @Field(() => Int, { nullable: true })
    AttachmentID: number;

    @Field({ nullable: true })
    Title: string;

    @Field(() => Boolean, { nullable: true })
    IsOpened: boolean;

    @Field(() => Boolean, { nullable: true })
    IsBounced: boolean;

    @Field(() => Boolean, { nullable: true })
    IsReplied: boolean;

    @Field({ nullable: true })
    Summary: string;
}

        
//****************************************************************************
// INPUT TYPE for Activities   
//****************************************************************************
@InputType()
export class UpdateActivityInput {
    @Field(() => Int)
    ID: number;

    @Field(() => Int, { nullable: true })
    EmployeeID: number;

    @Field(() => Int, { nullable: true })
    ContactID: number;

    @Field(() => Int, { nullable: true })
    AccountID: number;

    @Field(() => Int, { nullable: true })
    DealID: number;

    @Field({ nullable: true })
    ActivityDate: Date;

    @Field(() => Boolean, { nullable: true })
    IsActive: boolean;

    @Field({ nullable: true })
    Description: string;

    @Field({ nullable: true })
    Type: string;

    @Field({ nullable: true })
    Attachment: string;

    @Field(() => Int)
    CompanyIntegrationID: number;

    @Field({ nullable: true })
    ExternalSystemRecordID: string;

    @Field(() => Int, { nullable: true })
    AttachmentID: number;

    @Field({ nullable: true })
    Title: string;

    @Field(() => Boolean, { nullable: true })
    IsOpened: boolean;

    @Field(() => Boolean, { nullable: true })
    IsBounced: boolean;

    @Field(() => Boolean, { nullable: true })
    IsReplied: boolean;

    @Field({ nullable: true })
    Summary: string;
}

//****************************************************************************
// RESOLVER for Activities
//****************************************************************************
@ObjectType()
export class RunActivityViewResult {
    @Field(() => [Activity_])
    Results: Activity_[];

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

@Resolver(Activity_)
export class ActivityResolver extends ResolverBase {
    @Query(() => RunActivityViewResult)
    async RunActivityViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunActivityViewResult)
    async RunActivityViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunActivityViewResult)
    async RunActivityDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Activities';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => Activity_, { nullable: true })
    async Activity(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Activity_ | null> {
        this.CheckUserReadPermissions('Activities', userPayload);
        const sSQL = `SELECT * FROM [crm].[vwActivities] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Activities', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Activities', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }

    @Mutation(() => Activity_)
    async CreateActivity(
        @Arg('input', () => CreateActivityInput) input: CreateActivityInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <ActivityEntity>await new Metadata().GetEntityObject('Activities', this.GetUserFromPayload(userPayload));
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
    protected async BeforeCreate(dataSource: DataSource, input: CreateActivityInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateActivityInput) {
    }
    
    @Mutation(() => Activity_)
    async UpdateActivity(
        @Arg('input', () => UpdateActivityInput) input: UpdateActivityInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <ActivityEntity>await new Metadata().GetEntityObject('Activities', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for Activities
            
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
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateActivityInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateActivityInput) {
        const i = input, d = dataSource; // prevent error
    }

}

//****************************************************************************
// ENTITY CLASS for Deal Forecast Categories
//****************************************************************************
@ObjectType()
export class DealForecastCategory_ {  
    @Field(() => Int) 
    ID: number;
      
    @Field({nullable: true}) 
    @MaxLength(100)
    Name?: string;
      
    @Field({nullable: true}) 
    @MaxLength(100)
    DisplayName?: string;
      
    @Field() 
    @MaxLength(400)
    Description: string;
      
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
      
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
    
    @Field(() => [Deal_])
    DealsArray: Deal_[]; // Link to Deals

}
        
//****************************************************************************
// INPUT TYPE for Deal Forecast Categories   
//****************************************************************************
@InputType()
export class CreateDealForecastCategoryInput {
    @Field({ nullable: true })
    Name: string;

    @Field({ nullable: true })
    DisplayName: string;

    @Field()
    Description: string;
}

        
//****************************************************************************
// INPUT TYPE for Deal Forecast Categories   
//****************************************************************************
@InputType()
export class UpdateDealForecastCategoryInput {
    @Field(() => Int)
    ID: number;

    @Field({ nullable: true })
    Name: string;

    @Field({ nullable: true })
    DisplayName: string;

    @Field()
    Description: string;
}

//****************************************************************************
// RESOLVER for Deal Forecast Categories
//****************************************************************************
@ObjectType()
export class RunDealForecastCategoryViewResult {
    @Field(() => [DealForecastCategory_])
    Results: DealForecastCategory_[];

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

@Resolver(DealForecastCategory_)
export class DealForecastCategoryResolver extends ResolverBase {
    @Query(() => RunDealForecastCategoryViewResult)
    async RunDealForecastCategoryViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunDealForecastCategoryViewResult)
    async RunDealForecastCategoryViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunDealForecastCategoryViewResult)
    async RunDealForecastCategoryDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Deal Forecast Categories';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => DealForecastCategory_, { nullable: true })
    async DealForecastCategory(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<DealForecastCategory_ | null> {
        this.CheckUserReadPermissions('Deal Forecast Categories', userPayload);
        const sSQL = `SELECT * FROM [crm].[vwDealForecastCategories] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Deal Forecast Categories', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Deal Forecast Categories', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
  
    @FieldResolver(() => [Deal_])
    async DealsArray(@Root() dealforecastcategory_: DealForecastCategory_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Deals', userPayload);
        const sSQL = `SELECT * FROM [crm].[vwDeals] WHERE [DealForecastCategoryID]=${dealforecastcategory_.ID} ` + this.getRowLevelSecurityWhereClause('Deals', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Deals', await dataSource.query(sSQL));
        return result;
    }
    
    @Mutation(() => DealForecastCategory_)
    async CreateDealForecastCategory(
        @Arg('input', () => CreateDealForecastCategoryInput) input: CreateDealForecastCategoryInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <DealForecastCategoryEntity>await new Metadata().GetEntityObject('Deal Forecast Categories', this.GetUserFromPayload(userPayload));
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
    protected async BeforeCreate(dataSource: DataSource, input: CreateDealForecastCategoryInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateDealForecastCategoryInput) {
    }
    
    @Mutation(() => DealForecastCategory_)
    async UpdateDealForecastCategory(
        @Arg('input', () => UpdateDealForecastCategoryInput) input: UpdateDealForecastCategoryInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <DealForecastCategoryEntity>await new Metadata().GetEntityObject('Deal Forecast Categories', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for Deal Forecast Categories
            
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
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateDealForecastCategoryInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateDealForecastCategoryInput) {
        const i = input, d = dataSource; // prevent error
    }

    @Mutation(() => DealForecastCategory_)
    async DeleteDealForecastCategory(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        if (await this.BeforeDelete(dataSource, ID)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <DealForecastCategoryEntity>await new Metadata().GetEntityObject('Deal Forecast Categories', this.GetUserFromPayload(userPayload));
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
// ENTITY CLASS for Deals
//****************************************************************************
@ObjectType()
export class Deal_ {  
    @Field(() => Int) 
    ID: number;
      
    @Field() 
    @MaxLength(16)
    BCMID: string;
      
    @Field() 
    @MaxLength(100)
    ExternalSystemRecordID: string;
      
    @Field(() => Int) 
    CompanyIntegrationID: number;
      
    @Field(() => Int, {nullable: true}) 
    AccountID?: number;
      
    @Field(() => Int, {nullable: true}) 
    ContactID?: number;
      
    @Field({nullable: true}) 
    @MaxLength(510)
    Title?: string;
      
    @Field({nullable: true}) 
    Description?: string;
      
    @Field(() => Float, {nullable: true}) 
    Value?: number;
      
    @Field(() => Boolean, {nullable: true}) 
    IncludeInForecast?: boolean;
      
    @Field(() => Float, {nullable: true}) 
    Probability?: number;
      
    @Field({nullable: true}) 
    @MaxLength(8)
    CloseDate?: Date;
      
    @Field(() => Int, {nullable: true}) 
    EmployeeID?: number;
      
    @Field({nullable: true}) 
    @MaxLength(100)
    Pipeline?: string;
      
    @Field({nullable: true}) 
    @MaxLength(100)
    LeadSource?: string;
      
    @Field({nullable: true}) 
    LeadSourceDetail?: string;
      
    @Field({nullable: true}) 
    @MaxLength(8)
    ExternalSystemCreatedAt?: Date;
      
    @Field({nullable: true}) 
    @MaxLength(8)
    ExternalSystemUpdatedAt?: Date;
      
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
      
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
      
    @Field(() => Int, {nullable: true}) 
    DealTypeID?: number;
      
    @Field(() => Int, {nullable: true}) 
    DealStageID?: number;
      
    @Field(() => Int, {nullable: true}) 
    DealForecastCategoryID?: number;
      
    @Field(() => Float) 
    MRR: number;
      
    @Field(() => Float) 
    OneTimeFees: number;
      
    @Field(() => Int) 
    ContractTermMonths: number;
      
    @Field({nullable: true}) 
    ForecastNotes?: string;
      
    @Field(() => Boolean) 
    IsDeleted: boolean;
      
    @Field({nullable: true}) 
    @MaxLength(510)
    Account?: string;
      
    @Field({nullable: true}) 
    @MaxLength(100)
    DealType?: string;
      
    @Field({nullable: true}) 
    @MaxLength(40)
    DealStage?: string;
      
    @Field({nullable: true}) 
    @MaxLength(100)
    DealForecastCategory?: string;
    
    @Field(() => [Activity_])
    ActivitiesArray: Activity_[]; // Link to Activities

}
        
//****************************************************************************
// INPUT TYPE for Deals   
//****************************************************************************
@InputType()
export class CreateDealInput {
    @Field()
    ExternalSystemRecordID: string;

    @Field(() => Int)
    CompanyIntegrationID: number;

    @Field(() => Int, { nullable: true })
    AccountID: number;

    @Field(() => Int, { nullable: true })
    ContactID: number;

    @Field({ nullable: true })
    Title: string;

    @Field({ nullable: true })
    Description: string;

    @Field(() => Float, { nullable: true })
    Value: number;

    @Field(() => Boolean, { nullable: true })
    IncludeInForecast: boolean;

    @Field(() => Float, { nullable: true })
    Probability: number;

    @Field({ nullable: true })
    CloseDate: Date;

    @Field(() => Int, { nullable: true })
    EmployeeID: number;

    @Field({ nullable: true })
    Pipeline: string;

    @Field({ nullable: true })
    LeadSource: string;

    @Field({ nullable: true })
    LeadSourceDetail: string;

    @Field({ nullable: true })
    ExternalSystemCreatedAt: Date;

    @Field({ nullable: true })
    ExternalSystemUpdatedAt: Date;

    @Field(() => Int, { nullable: true })
    DealTypeID: number;

    @Field(() => Int, { nullable: true })
    DealStageID: number;

    @Field(() => Int, { nullable: true })
    DealForecastCategoryID: number;

    @Field(() => Float)
    MRR: number;

    @Field(() => Float)
    OneTimeFees: number;

    @Field(() => Int)
    ContractTermMonths: number;

    @Field({ nullable: true })
    ForecastNotes: string;

    @Field(() => Boolean)
    IsDeleted: boolean;
}

        
//****************************************************************************
// INPUT TYPE for Deals   
//****************************************************************************
@InputType()
export class UpdateDealInput {
    @Field(() => Int)
    ID: number;

    @Field()
    ExternalSystemRecordID: string;

    @Field(() => Int)
    CompanyIntegrationID: number;

    @Field(() => Int, { nullable: true })
    AccountID: number;

    @Field(() => Int, { nullable: true })
    ContactID: number;

    @Field({ nullable: true })
    Title: string;

    @Field({ nullable: true })
    Description: string;

    @Field(() => Float, { nullable: true })
    Value: number;

    @Field(() => Boolean, { nullable: true })
    IncludeInForecast: boolean;

    @Field(() => Float, { nullable: true })
    Probability: number;

    @Field({ nullable: true })
    CloseDate: Date;

    @Field(() => Int, { nullable: true })
    EmployeeID: number;

    @Field({ nullable: true })
    Pipeline: string;

    @Field({ nullable: true })
    LeadSource: string;

    @Field({ nullable: true })
    LeadSourceDetail: string;

    @Field({ nullable: true })
    ExternalSystemCreatedAt: Date;

    @Field({ nullable: true })
    ExternalSystemUpdatedAt: Date;

    @Field(() => Int, { nullable: true })
    DealTypeID: number;

    @Field(() => Int, { nullable: true })
    DealStageID: number;

    @Field(() => Int, { nullable: true })
    DealForecastCategoryID: number;

    @Field(() => Float)
    MRR: number;

    @Field(() => Float)
    OneTimeFees: number;

    @Field(() => Int)
    ContractTermMonths: number;

    @Field({ nullable: true })
    ForecastNotes: string;

    @Field(() => Boolean)
    IsDeleted: boolean;
}

//****************************************************************************
// RESOLVER for Deals
//****************************************************************************
@ObjectType()
export class RunDealViewResult {
    @Field(() => [Deal_])
    Results: Deal_[];

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

@Resolver(Deal_)
export class DealResolver extends ResolverBase {
    @Query(() => RunDealViewResult)
    async RunDealViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunDealViewResult)
    async RunDealViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunDealViewResult)
    async RunDealDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Deals';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => Deal_, { nullable: true })
    async Deal(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Deal_ | null> {
        this.CheckUserReadPermissions('Deals', userPayload);
        const sSQL = `SELECT * FROM [crm].[vwDeals] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Deals', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Deals', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
  
    @FieldResolver(() => [Activity_])
    async ActivitiesArray(@Root() deal_: Deal_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Activities', userPayload);
        const sSQL = `SELECT * FROM [crm].[vwActivities] WHERE [DealID]=${deal_.ID} ` + this.getRowLevelSecurityWhereClause('Activities', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Activities', await dataSource.query(sSQL));
        return result;
    }
    
    @Mutation(() => Deal_)
    async CreateDeal(
        @Arg('input', () => CreateDealInput) input: CreateDealInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <DealEntity>await new Metadata().GetEntityObject('Deals', this.GetUserFromPayload(userPayload));
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
    protected async BeforeCreate(dataSource: DataSource, input: CreateDealInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateDealInput) {
    }
    
    @Mutation(() => Deal_)
    async UpdateDeal(
        @Arg('input', () => UpdateDealInput) input: UpdateDealInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <DealEntity>await new Metadata().GetEntityObject('Deals', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for Deals
            
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
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateDealInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateDealInput) {
        const i = input, d = dataSource; // prevent error
    }

}

//****************************************************************************
// ENTITY CLASS for Deal Types
//****************************************************************************
@ObjectType()
export class DealType_ {  
    @Field(() => Int) 
    ID: number;
      
    @Field({nullable: true}) 
    @MaxLength(100)
    Name?: string;
      
    @Field() 
    @MaxLength(400)
    Description: string;
      
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
      
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
      
    @Field({nullable: true}) 
    @MaxLength(40)
    DisplayName?: string;
    
    @Field(() => [Deal_])
    DealsArray: Deal_[]; // Link to Deals

}
        
//****************************************************************************
// INPUT TYPE for Deal Types   
//****************************************************************************
@InputType()
export class CreateDealTypeInput {
    @Field({ nullable: true })
    Name: string;

    @Field()
    Description: string;

    @Field({ nullable: true })
    DisplayName: string;
}

        
//****************************************************************************
// INPUT TYPE for Deal Types   
//****************************************************************************
@InputType()
export class UpdateDealTypeInput {
    @Field(() => Int)
    ID: number;

    @Field({ nullable: true })
    Name: string;

    @Field()
    Description: string;

    @Field({ nullable: true })
    DisplayName: string;
}

//****************************************************************************
// RESOLVER for Deal Types
//****************************************************************************
@ObjectType()
export class RunDealTypeViewResult {
    @Field(() => [DealType_])
    Results: DealType_[];

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

@Resolver(DealType_)
export class DealTypeResolver extends ResolverBase {
    @Query(() => RunDealTypeViewResult)
    async RunDealTypeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunDealTypeViewResult)
    async RunDealTypeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunDealTypeViewResult)
    async RunDealTypeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Deal Types';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => DealType_, { nullable: true })
    async DealType(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<DealType_ | null> {
        this.CheckUserReadPermissions('Deal Types', userPayload);
        const sSQL = `SELECT * FROM [crm].[vwDealTypes] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Deal Types', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Deal Types', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
  
    @FieldResolver(() => [Deal_])
    async DealsArray(@Root() dealtype_: DealType_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Deals', userPayload);
        const sSQL = `SELECT * FROM [crm].[vwDeals] WHERE [DealTypeID]=${dealtype_.ID} ` + this.getRowLevelSecurityWhereClause('Deals', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Deals', await dataSource.query(sSQL));
        return result;
    }
    
    @Mutation(() => DealType_)
    async CreateDealType(
        @Arg('input', () => CreateDealTypeInput) input: CreateDealTypeInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <DealTypeEntity>await new Metadata().GetEntityObject('Deal Types', this.GetUserFromPayload(userPayload));
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
    protected async BeforeCreate(dataSource: DataSource, input: CreateDealTypeInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateDealTypeInput) {
    }
    
    @Mutation(() => DealType_)
    async UpdateDealType(
        @Arg('input', () => UpdateDealTypeInput) input: UpdateDealTypeInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <DealTypeEntity>await new Metadata().GetEntityObject('Deal Types', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for Deal Types
            
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
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateDealTypeInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateDealTypeInput) {
        const i = input, d = dataSource; // prevent error
    }

}

//****************************************************************************
// ENTITY CLASS for Invoices
//****************************************************************************
@ObjectType()
export class Invoice_ {  
    @Field(() => Int) 
    ID: number;
      
    @Field() 
    @MaxLength(16)
    BCMID: string;
      
    @Field() 
    @MaxLength(8)
    InvoiceDate: Date;
      
    @Field(() => Int) 
    AccountID: number;
      
    @Field(() => Int, {nullable: true}) 
    ContactID?: number;
      
    @Field(() => Float) 
    SubTotal: number;
      
    @Field(() => Float) 
    Tax: number;
      
    @Field(() => Float) 
    Total: number;
      
    @Field(() => Int) 
    CompanyIntegrationID: number;
      
    @Field() 
    @MaxLength(100)
    ExternalSystemRecordID: string;
      
    @Field() 
    @MaxLength(40)
    InvoiceNumber: string;
      
    @Field({nullable: true}) 
    @MaxLength(8)
    PostingDate?: Date;
      
    @Field({nullable: true}) 
    @MaxLength(8)
    DueDate?: Date;
      
    @Field(() => Int) 
    StatusID: number;
      
    @Field(() => Int, {nullable: true}) 
    PaymentTermsID?: number;
      
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
      
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
      
    @Field() 
    @MaxLength(510)
    Account: string;
      
    @Field() 
    @MaxLength(40)
    Status: string;
      
    @Field({nullable: true}) 
    @MaxLength(100)
    PaymentTerms?: string;
    
}
        
//****************************************************************************
// INPUT TYPE for Invoices   
//****************************************************************************
@InputType()
export class CreateInvoiceInput {
    @Field()
    InvoiceDate: Date;

    @Field(() => Int)
    AccountID: number;

    @Field(() => Int, { nullable: true })
    ContactID: number;

    @Field(() => Float)
    SubTotal: number;

    @Field(() => Float)
    Tax: number;

    @Field(() => Float)
    Total: number;

    @Field(() => Int)
    CompanyIntegrationID: number;

    @Field()
    ExternalSystemRecordID: string;

    @Field()
    InvoiceNumber: string;

    @Field({ nullable: true })
    PostingDate: Date;

    @Field({ nullable: true })
    DueDate: Date;

    @Field(() => Int)
    StatusID: number;

    @Field(() => Int, { nullable: true })
    PaymentTermsID: number;
}

        
//****************************************************************************
// INPUT TYPE for Invoices   
//****************************************************************************
@InputType()
export class UpdateInvoiceInput {
    @Field(() => Int)
    ID: number;

    @Field()
    InvoiceDate: Date;

    @Field(() => Int)
    AccountID: number;

    @Field(() => Int, { nullable: true })
    ContactID: number;

    @Field(() => Float)
    SubTotal: number;

    @Field(() => Float)
    Tax: number;

    @Field(() => Float)
    Total: number;

    @Field(() => Int)
    CompanyIntegrationID: number;

    @Field()
    ExternalSystemRecordID: string;

    @Field()
    InvoiceNumber: string;

    @Field({ nullable: true })
    PostingDate: Date;

    @Field({ nullable: true })
    DueDate: Date;

    @Field(() => Int)
    StatusID: number;

    @Field(() => Int, { nullable: true })
    PaymentTermsID: number;
}

//****************************************************************************
// RESOLVER for Invoices
//****************************************************************************
@ObjectType()
export class RunInvoiceViewResult {
    @Field(() => [Invoice_])
    Results: Invoice_[];

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

@Resolver(Invoice_)
export class InvoiceResolver extends ResolverBase {
    @Query(() => RunInvoiceViewResult)
    async RunInvoiceViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunInvoiceViewResult)
    async RunInvoiceViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunInvoiceViewResult)
    async RunInvoiceDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Invoices';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => Invoice_, { nullable: true })
    async Invoice(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Invoice_ | null> {
        this.CheckUserReadPermissions('Invoices', userPayload);
        const sSQL = `SELECT * FROM [crm].[vwInvoices] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Invoices', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Invoices', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }

    @Mutation(() => Invoice_)
    async CreateInvoice(
        @Arg('input', () => CreateInvoiceInput) input: CreateInvoiceInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <InvoiceEntity>await new Metadata().GetEntityObject('Invoices', this.GetUserFromPayload(userPayload));
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
    protected async BeforeCreate(dataSource: DataSource, input: CreateInvoiceInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateInvoiceInput) {
    }
    
    @Mutation(() => Invoice_)
    async UpdateInvoice(
        @Arg('input', () => UpdateInvoiceInput) input: UpdateInvoiceInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <InvoiceEntity>await new Metadata().GetEntityObject('Invoices', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for Invoices
            
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
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateInvoiceInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateInvoiceInput) {
        const i = input, d = dataSource; // prevent error
    }

}

//****************************************************************************
// ENTITY CLASS for Activity Attachments
//****************************************************************************
@ObjectType()
export class ActivityAttachment_ {  
    @Field(() => Int) 
    ID: number;
      
    @Field({nullable: true}) 
    @MaxLength(510)
    Attachments?: string;
      
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
      
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
    
    @Field(() => [Activity_])
    ActivitiesArray: Activity_[]; // Link to Activities

}
        
//****************************************************************************
// INPUT TYPE for Activity Attachments   
//****************************************************************************
@InputType()
export class CreateActivityAttachmentInput {
    @Field({ nullable: true })
    Attachments: string;
}

        
//****************************************************************************
// INPUT TYPE for Activity Attachments   
//****************************************************************************
@InputType()
export class UpdateActivityAttachmentInput {
    @Field(() => Int)
    ID: number;

    @Field({ nullable: true })
    Attachments: string;
}

//****************************************************************************
// RESOLVER for Activity Attachments
//****************************************************************************
@ObjectType()
export class RunActivityAttachmentViewResult {
    @Field(() => [ActivityAttachment_])
    Results: ActivityAttachment_[];

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

@Resolver(ActivityAttachment_)
export class ActivityAttachmentResolver extends ResolverBase {
    @Query(() => RunActivityAttachmentViewResult)
    async RunActivityAttachmentViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunActivityAttachmentViewResult)
    async RunActivityAttachmentViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunActivityAttachmentViewResult)
    async RunActivityAttachmentDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Activity Attachments';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => ActivityAttachment_, { nullable: true })
    async ActivityAttachment(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<ActivityAttachment_ | null> {
        this.CheckUserReadPermissions('Activity Attachments', userPayload);
        const sSQL = `SELECT * FROM [crm].[vwActivityAttachments] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Activity Attachments', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Activity Attachments', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
  
    @FieldResolver(() => [Activity_])
    async ActivitiesArray(@Root() activityattachment_: ActivityAttachment_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Activities', userPayload);
        const sSQL = `SELECT * FROM [crm].[vwActivities] WHERE [AttachmentID]=${activityattachment_.ID} ` + this.getRowLevelSecurityWhereClause('Activities', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Activities', await dataSource.query(sSQL));
        return result;
    }
    
    @Mutation(() => ActivityAttachment_)
    async CreateActivityAttachment(
        @Arg('input', () => CreateActivityAttachmentInput) input: CreateActivityAttachmentInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <ActivityAttachmentEntity>await new Metadata().GetEntityObject('Activity Attachments', this.GetUserFromPayload(userPayload));
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
    protected async BeforeCreate(dataSource: DataSource, input: CreateActivityAttachmentInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateActivityAttachmentInput) {
    }
    
    @Mutation(() => ActivityAttachment_)
    async UpdateActivityAttachment(
        @Arg('input', () => UpdateActivityAttachmentInput) input: UpdateActivityAttachmentInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <ActivityAttachmentEntity>await new Metadata().GetEntityObject('Activity Attachments', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for Activity Attachments
            
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
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateActivityAttachmentInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateActivityAttachmentInput) {
        const i = input, d = dataSource; // prevent error
    }

}

//****************************************************************************
// ENTITY CLASS for Payment Terms Types
//****************************************************************************
@ObjectType()
export class PaymentTermsType_ {  
    @Field(() => Int) 
    ID: number;
      
    @Field() 
    @MaxLength(100)
    Name: string;
      
    @Field({nullable: true}) 
    @MaxLength(40)
    DisplayName?: string;
      
    @Field({nullable: true}) 
    @MaxLength(40)
    Code?: string;
      
    @Field({nullable: true}) 
    @MaxLength(40)
    DueDateCalculation?: string;
      
    @Field({nullable: true}) 
    @MaxLength(400)
    Description?: string;
      
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
      
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
      
    @Field(() => Int, {nullable: true}) 
    CompanyIntegrationID?: number;
      
    @Field({nullable: true}) 
    @MaxLength(200)
    ExternalSystemRecordID?: string;
    
    @Field(() => [Invoice_])
    InvoicesArray: Invoice_[]; // Link to Invoices

}
        
//****************************************************************************
// INPUT TYPE for Payment Terms Types   
//****************************************************************************
@InputType()
export class CreatePaymentTermsTypeInput {
    @Field()
    Name: string;

    @Field({ nullable: true })
    DisplayName: string;

    @Field({ nullable: true })
    Code: string;

    @Field({ nullable: true })
    DueDateCalculation: string;

    @Field({ nullable: true })
    Description: string;

    @Field(() => Int, { nullable: true })
    CompanyIntegrationID: number;

    @Field({ nullable: true })
    ExternalSystemRecordID: string;
}

        
//****************************************************************************
// INPUT TYPE for Payment Terms Types   
//****************************************************************************
@InputType()
export class UpdatePaymentTermsTypeInput {
    @Field(() => Int)
    ID: number;

    @Field()
    Name: string;

    @Field({ nullable: true })
    DisplayName: string;

    @Field({ nullable: true })
    Code: string;

    @Field({ nullable: true })
    DueDateCalculation: string;

    @Field({ nullable: true })
    Description: string;

    @Field(() => Int, { nullable: true })
    CompanyIntegrationID: number;

    @Field({ nullable: true })
    ExternalSystemRecordID: string;
}

//****************************************************************************
// RESOLVER for Payment Terms Types
//****************************************************************************
@ObjectType()
export class RunPaymentTermsTypeViewResult {
    @Field(() => [PaymentTermsType_])
    Results: PaymentTermsType_[];

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

@Resolver(PaymentTermsType_)
export class PaymentTermsTypeResolver extends ResolverBase {
    @Query(() => RunPaymentTermsTypeViewResult)
    async RunPaymentTermsTypeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunPaymentTermsTypeViewResult)
    async RunPaymentTermsTypeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunPaymentTermsTypeViewResult)
    async RunPaymentTermsTypeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Payment Terms Types';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => PaymentTermsType_, { nullable: true })
    async PaymentTermsType(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<PaymentTermsType_ | null> {
        this.CheckUserReadPermissions('Payment Terms Types', userPayload);
        const sSQL = `SELECT * FROM [crm].[vwPaymentTermsTypes] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Payment Terms Types', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Payment Terms Types', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
  
    @FieldResolver(() => [Invoice_])
    async InvoicesArray(@Root() paymenttermstype_: PaymentTermsType_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Invoices', userPayload);
        const sSQL = `SELECT * FROM [crm].[vwInvoices] WHERE [PaymentTermsID]=${paymenttermstype_.ID} ` + this.getRowLevelSecurityWhereClause('Invoices', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Invoices', await dataSource.query(sSQL));
        return result;
    }
    
    @Mutation(() => PaymentTermsType_)
    async CreatePaymentTermsType(
        @Arg('input', () => CreatePaymentTermsTypeInput) input: CreatePaymentTermsTypeInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <PaymentTermsTypeEntity>await new Metadata().GetEntityObject('Payment Terms Types', this.GetUserFromPayload(userPayload));
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
    protected async BeforeCreate(dataSource: DataSource, input: CreatePaymentTermsTypeInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreatePaymentTermsTypeInput) {
    }
    
    @Mutation(() => PaymentTermsType_)
    async UpdatePaymentTermsType(
        @Arg('input', () => UpdatePaymentTermsTypeInput) input: UpdatePaymentTermsTypeInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <PaymentTermsTypeEntity>await new Metadata().GetEntityObject('Payment Terms Types', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for Payment Terms Types
            
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
    protected async BeforeUpdate(dataSource: DataSource, input: UpdatePaymentTermsTypeInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdatePaymentTermsTypeInput) {
        const i = input, d = dataSource; // prevent error
    }

}

//****************************************************************************
// ENTITY CLASS for Invoice Status Types
//****************************************************************************
@ObjectType()
export class InvoiceStatusType_ {  
    @Field(() => Int) 
    ID: number;
      
    @Field() 
    @MaxLength(40)
    Name: string;
      
    @Field() 
    @MaxLength(400)
    Description: string;
      
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
      
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
    
    @Field(() => [Invoice_])
    InvoicesArray: Invoice_[]; // Link to Invoices

}
        
//****************************************************************************
// INPUT TYPE for Invoice Status Types   
//****************************************************************************
@InputType()
export class CreateInvoiceStatusTypeInput {
    @Field()
    Name: string;

    @Field()
    Description: string;
}

        
//****************************************************************************
// INPUT TYPE for Invoice Status Types   
//****************************************************************************
@InputType()
export class UpdateInvoiceStatusTypeInput {
    @Field(() => Int)
    ID: number;

    @Field()
    Name: string;

    @Field()
    Description: string;
}

//****************************************************************************
// RESOLVER for Invoice Status Types
//****************************************************************************
@ObjectType()
export class RunInvoiceStatusTypeViewResult {
    @Field(() => [InvoiceStatusType_])
    Results: InvoiceStatusType_[];

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

@Resolver(InvoiceStatusType_)
export class InvoiceStatusTypeResolver extends ResolverBase {
    @Query(() => RunInvoiceStatusTypeViewResult)
    async RunInvoiceStatusTypeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunInvoiceStatusTypeViewResult)
    async RunInvoiceStatusTypeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunInvoiceStatusTypeViewResult)
    async RunInvoiceStatusTypeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Invoice Status Types';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => InvoiceStatusType_, { nullable: true })
    async InvoiceStatusType(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<InvoiceStatusType_ | null> {
        this.CheckUserReadPermissions('Invoice Status Types', userPayload);
        const sSQL = `SELECT * FROM [crm].[vwInvoiceStatusTypes] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Invoice Status Types', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Invoice Status Types', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
  
    @FieldResolver(() => [Invoice_])
    async InvoicesArray(@Root() invoicestatustype_: InvoiceStatusType_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Invoices', userPayload);
        const sSQL = `SELECT * FROM [crm].[vwInvoices] WHERE [StatusID]=${invoicestatustype_.ID} ` + this.getRowLevelSecurityWhereClause('Invoices', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Invoices', await dataSource.query(sSQL));
        return result;
    }
    
    @Mutation(() => InvoiceStatusType_)
    async CreateInvoiceStatusType(
        @Arg('input', () => CreateInvoiceStatusTypeInput) input: CreateInvoiceStatusTypeInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <InvoiceStatusTypeEntity>await new Metadata().GetEntityObject('Invoice Status Types', this.GetUserFromPayload(userPayload));
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
    protected async BeforeCreate(dataSource: DataSource, input: CreateInvoiceStatusTypeInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateInvoiceStatusTypeInput) {
    }
    
    @Mutation(() => InvoiceStatusType_)
    async UpdateInvoiceStatusType(
        @Arg('input', () => UpdateInvoiceStatusTypeInput) input: UpdateInvoiceStatusTypeInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <InvoiceStatusTypeEntity>await new Metadata().GetEntityObject('Invoice Status Types', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for Invoice Status Types
            
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
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateInvoiceStatusTypeInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateInvoiceStatusTypeInput) {
        const i = input, d = dataSource; // prevent error
    }

}