/********************************************************************************
* ALL ENTITIES - TypeGraphQL Type Class Definition - AUTO GENERATED FILE
* Generated Entities and Resolvers for Server
* 
* GENERATED: 1/22/2024, 3:30:29 PM
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

import { DemoKeyEntity, AnothaTablaEntity, PersonEntity } from 'mj_generatedentities';


//****************************************************************************
// ENTITY CLASS for Demo Keys
//****************************************************************************
@ObjectType({ description: 'This table likely contains detailed information about employees of a company or organization. Each record likely represents an individual employee and includes personal identification numbers (such as Social Security Number), personal details like name and birthday, contact information (including address and phone number), and employment information such as job title, department, and salary.' })
export class DemoKey_ {  
    @Field() 
    @MaxLength(72)
    DemoID: string;
      
    @Field() 
    @MaxLength(200)
    Name: string;
      
    @Field({nullable: true}) 
    Description?: string;
    
    @Field(() => [AnothaTabla_])
    AnothaTablasArray: AnothaTabla_[]; // Link to AnothaTablas

}
        
//****************************************************************************
// INPUT TYPE for Demo Keys   
//****************************************************************************
@InputType()
export class CreateDemoKeyInput {
    @Field()
    DemoID: string;

    @Field()
    Name: string;

    @Field({ nullable: true })
    Description: string;
}

        
//****************************************************************************
// INPUT TYPE for Demo Keys   
//****************************************************************************
@InputType()
export class UpdateDemoKeyInput {
    @Field()
    DemoID: string;

    @Field()
    Name: string;

    @Field({ nullable: true })
    Description: string;
}

//****************************************************************************
// RESOLVER for Demo Keys
//****************************************************************************
@ObjectType()
export class RunDemoKeyViewResult {
    @Field(() => [DemoKey_])
    Results: DemoKey_[];

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

@Resolver(DemoKey_)
export class DemoKeyResolver extends ResolverBase {
    @Query(() => RunDemoKeyViewResult)
    async RunDemoKeyViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunDemoKeyViewResult)
    async RunDemoKeyViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunDemoKeyViewResult)
    async RunDemoKeyDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Demo Keys';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => DemoKey_, { nullable: true })
    async DemoKey(@Arg('DemoID', () => String) DemoID: String, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<DemoKey_ | null> {
        this.CheckUserReadPermissions('Demo Keys', userPayload);
        const sSQL = `SELECT * FROM [dbo].[vwDemoKeys] WHERE [DemoID]='${DemoID}' ` + this.getRowLevelSecurityWhereClause('Demo Keys', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Demo Keys', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
  
    @FieldResolver(() => [AnothaTabla_])
    async AnothaTablasArray(@Root() demokey_: DemoKey_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Anotha Tablas', userPayload);
        const sSQL = `SELECT * FROM [dbo].[vwAnothaTablas] WHERE [DemoKeyID]='${demokey_.DemoID}' ` + this.getRowLevelSecurityWhereClause('Anotha Tablas', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Anotha Tablas', await dataSource.query(sSQL));
        return result;
    }
    
    @Mutation(() => DemoKey_)
    async CreateDemoKey(
        @Arg('input', () => CreateDemoKeyInput) input: CreateDemoKeyInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <DemoKeyEntity>await new Metadata().GetEntityObject('Demo Keys', this.GetUserFromPayload(userPayload));
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
    protected async BeforeCreate(dataSource: DataSource, input: CreateDemoKeyInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateDemoKeyInput) {
    }
    
    @Mutation(() => DemoKey_)
    async UpdateDemoKey(
        @Arg('input', () => UpdateDemoKeyInput) input: UpdateDemoKeyInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <DemoKeyEntity>await new Metadata().GetEntityObject('Demo Keys', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for Demo Keys
            
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
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateDemoKeyInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateDemoKeyInput) {
        const i = input, d = dataSource; // prevent error
    }

}

//****************************************************************************
// ENTITY CLASS for Anotha Tablas
//****************************************************************************
@ObjectType()
export class AnothaTabla_ {  
    @Field(() => Int) 
    AnotherDemoID: number;
      
    @Field() 
    @MaxLength(72)
    DemoKeyID: string;
      
    @Field() 
    @MaxLength(8)
    MyField: Date;
      
    @Field() 
    @MaxLength(100)
    AnotherField: string;
      
    @Field({nullable: true}) 
    Description?: string;
      
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
      
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
    
}
        
//****************************************************************************
// INPUT TYPE for Anotha Tablas   
//****************************************************************************
@InputType()
export class CreateAnothaTablaInput {
    @Field(() => Int, )
    AnotherDemoID: number;

    @Field()
    DemoKeyID: string;

    @Field()
    MyField: Date;

    @Field()
    AnotherField: string;

    @Field({ nullable: true })
    Description: string;
}

        
//****************************************************************************
// INPUT TYPE for Anotha Tablas   
//****************************************************************************
@InputType()
export class UpdateAnothaTablaInput {
    @Field(() => Int, )
    AnotherDemoID: number;

    @Field()
    DemoKeyID: string;

    @Field()
    MyField: Date;

    @Field()
    AnotherField: string;

    @Field({ nullable: true })
    Description: string;
}

//****************************************************************************
// RESOLVER for Anotha Tablas
//****************************************************************************
@ObjectType()
export class RunAnothaTablaViewResult {
    @Field(() => [AnothaTabla_])
    Results: AnothaTabla_[];

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

@Resolver(AnothaTabla_)
export class AnothaTablaResolver extends ResolverBase {
    @Query(() => RunAnothaTablaViewResult)
    async RunAnothaTablaViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunAnothaTablaViewResult)
    async RunAnothaTablaViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunAnothaTablaViewResult)
    async RunAnothaTablaDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Anotha Tablas';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => AnothaTabla_, { nullable: true })
    async AnothaTabla(@Arg('AnotherDemoID', () => Int) AnotherDemoID: Number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<AnothaTabla_ | null> {
        this.CheckUserReadPermissions('Anotha Tablas', userPayload);
        const sSQL = `SELECT * FROM [dbo].[vwAnothaTablas] WHERE [AnotherDemoID]=${AnotherDemoID} ` + this.getRowLevelSecurityWhereClause('Anotha Tablas', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Anotha Tablas', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }

    @Mutation(() => AnothaTabla_)
    async CreateAnothaTabla(
        @Arg('input', () => CreateAnothaTablaInput) input: CreateAnothaTablaInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <AnothaTablaEntity>await new Metadata().GetEntityObject('Anotha Tablas', this.GetUserFromPayload(userPayload));
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
    protected async BeforeCreate(dataSource: DataSource, input: CreateAnothaTablaInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreateAnothaTablaInput) {
    }
    
    @Mutation(() => AnothaTabla_)
    async UpdateAnothaTabla(
        @Arg('input', () => UpdateAnothaTablaInput) input: UpdateAnothaTablaInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <AnothaTablaEntity>await new Metadata().GetEntityObject('Anotha Tablas', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for Anotha Tablas
            
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
    protected async BeforeUpdate(dataSource: DataSource, input: UpdateAnothaTablaInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdateAnothaTablaInput) {
        const i = input, d = dataSource; // prevent error
    }

}

//****************************************************************************
// ENTITY CLASS for Persons
//****************************************************************************
@ObjectType()
export class Person_ {  
    @Field(() => Int) 
    PersonID: number;
      
    @Field() 
    @MaxLength(100)
    FirstName: string;
      
    @Field() 
    @MaxLength(100)
    LastName: string;
      
    @Field() 
    @MaxLength(100)
    Title: string;
      
    @Field() 
    @MaxLength(100)
    Company: string;
      
    @Field({nullable: true}) 
    @MaxLength(100)
    Address?: string;
      
    @Field({nullable: true}) 
    @MaxLength(100)
    City?: string;
      
    @Field() 
    @MaxLength(20)
    State: string;
      
    @Field({nullable: true}) 
    @MaxLength(100)
    PostalCode?: string;
      
    @Field({nullable: true}) 
    @MaxLength(100)
    Country?: string;
      
    @Field({nullable: true}) 
    @MaxLength(20)
    Email?: string;
      
    @Field(() => Boolean) 
    CurrentCustomer: boolean;
      
    @Field({nullable: true}) 
    Comments?: string;
    
}
        
//****************************************************************************
// INPUT TYPE for Persons   
//****************************************************************************
@InputType()
export class CreatePersonInput {
    @Field(() => Int, )
    PersonID: number;

    @Field()
    FirstName: string;

    @Field()
    LastName: string;

    @Field()
    Title: string;

    @Field()
    Company: string;

    @Field({ nullable: true })
    Address: string;

    @Field({ nullable: true })
    City: string;

    @Field()
    State: string;

    @Field({ nullable: true })
    PostalCode: string;

    @Field({ nullable: true })
    Country: string;

    @Field({ nullable: true })
    Email: string;

    @Field(() => Boolean, )
    CurrentCustomer: boolean;

    @Field({ nullable: true })
    Comments: string;
}

        
//****************************************************************************
// INPUT TYPE for Persons   
//****************************************************************************
@InputType()
export class UpdatePersonInput {
    @Field(() => Int, )
    PersonID: number;

    @Field()
    FirstName: string;

    @Field()
    LastName: string;

    @Field()
    Title: string;

    @Field()
    Company: string;

    @Field({ nullable: true })
    Address: string;

    @Field({ nullable: true })
    City: string;

    @Field()
    State: string;

    @Field({ nullable: true })
    PostalCode: string;

    @Field({ nullable: true })
    Country: string;

    @Field({ nullable: true })
    Email: string;

    @Field(() => Boolean, )
    CurrentCustomer: boolean;

    @Field({ nullable: true })
    Comments: string;
}

//****************************************************************************
// RESOLVER for Persons
//****************************************************************************
@ObjectType()
export class RunPersonViewResult {
    @Field(() => [Person_])
    Results: Person_[];

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

@Resolver(Person_)
export class PersonResolver extends ResolverBase {
    @Query(() => RunPersonViewResult)
    async RunPersonViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunPersonViewResult)
    async RunPersonViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunPersonViewResult)
    async RunPersonDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Persons';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => Person_, { nullable: true })
    async Person(@Arg('PersonID', () => Int) PersonID: Number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Person_ | null> {
        this.CheckUserReadPermissions('Persons', userPayload);
        const sSQL = `SELECT * FROM [dbo].[vwPersons] WHERE [PersonID]=${PersonID} ` + this.getRowLevelSecurityWhereClause('Persons', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Persons', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }

    @Mutation(() => Person_)
    async CreatePerson(
        @Arg('input', () => CreatePersonInput) input: CreatePersonInput,
        @Ctx() { dataSource, userPayload }: AppContext, 
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeCreate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <PersonEntity>await new Metadata().GetEntityObject('Persons', this.GetUserFromPayload(userPayload));
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
    protected async BeforeCreate(dataSource: DataSource, input: CreatePersonInput): Promise<boolean> {
        return true;
    }
    protected async AfterCreate(dataSource: DataSource, input: CreatePersonInput) {
    }
    
    @Mutation(() => Person_)
    async UpdatePerson(
        @Arg('input', () => UpdatePersonInput) input: UpdatePersonInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        if (await this.BeforeUpdate(dataSource, input)) { // fire event and proceed if it wasn't cancelled
            const entityObject = <PersonEntity>await new Metadata().GetEntityObject('Persons', this.GetUserFromPayload(userPayload));
            entityObject.LoadFromData(input) // using the input instead of loading from DB because TrackChanges is turned off for Persons
            
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
    protected async BeforeUpdate(dataSource: DataSource, input: UpdatePersonInput): Promise<boolean> {
        const i = input, d = dataSource; // prevent error
        return true;
    }
    protected async AfterUpdate(dataSource: DataSource, input: UpdatePersonInput) {
        const i = input, d = dataSource; // prevent error
    }

}